"""
Project Garuda — FastAPI Backend
KSP Datathon 2026 | Zoho Catalyst AppSail

Architecture:
  - Case/accused/arrest data is always loaded from ./data/*.csv at startup
    (Data Store reads require a per-request Catalyst app instance — see below
    — so there's no way to bulk-load from Data Store during FastAPI's
    lifespan startup hook, which runs before any request exists).
  - Per-request Catalyst services (Data Store queries, Cache, Zia Translate,
    Officer lookup) use `zcatalyst_sdk.initialize(req=request)` fresh on
    every request. AppSail's gateway injects auth/project headers onto each
    proxied request; the SDK reads those headers from `req`, not from env
    vars — there is no `CATALYST_PROJECT_ID` env var to set (Catalyst's
    console rejects it as a reserved keyword because project identity is
    always derived from the request, never user-configurable).

Run locally:  python main.py
Swagger docs: http://localhost:8000/docs
"""

import asyncio
import base64
import hashlib
import hmac
import html as html_lib
import json
import os
import logging
import random
import re
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime
from io import BytesIO
from threading import Lock
from typing import Literal, Optional

import networkx as nx
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from karnataka_districts import (
    DISTRICTS as KARNATAKA_DISTRICTS,
    district_of_station,
    district_by_id,
    station_name,
    statewide_bounds,
)
from district_indicators import indicators_for_district
from cctns_adapter import case_to_cctns

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("garuda")

# ─── Catalyst SDK (per-request init, graceful fallback in local dev) ─────────
# zcatalyst_sdk.initialize() must be called PER REQUEST with the FastAPI
# `Request` object so it can read the auth/project headers Catalyst's AppSail
# gateway injects on that specific request. It cannot be cached as a global —
# calling it once at startup (no request in hand yet) always raises
# "Catalyst headers are empty".

try:
    import zcatalyst_sdk
    _CATALYST_SDK_IMPORTED = True
except Exception as e:
    log.warning(f"⚠️  zcatalyst_sdk not importable: {e} — Catalyst features disabled")
    _CATALYST_SDK_IMPORTED = False

def _try_catalyst_app(request: Request):
    """Returns a fresh Catalyst app for this request, or None outside Catalyst."""
    if not _CATALYST_SDK_IMPORTED:
        return None
    try:
        return zcatalyst_sdk.initialize(req=request)
    except Exception as e:
        log.debug(f"Catalyst SDK unavailable for this request: {e}")
        return None

# ─── In-memory data store ─────────────────────────────────────────────────────

class DataStore:
    cases:       pd.DataFrame = pd.DataFrame()
    # Cases sorted by CrimeRegisteredDate descending, precomputed once whenever
    # DB.cases changes (see _refresh_cases_by_date()) so /api/reports never has
    # to re-sort all rows on every request — just slice a page off this view.
    cases_by_date: pd.DataFrame = pd.DataFrame()
    accused:     pd.DataFrame = pd.DataFrame()
    arrests:     pd.DataFrame = pd.DataFrame()
    crime_heads: pd.DataFrame = pd.DataFrame()
    graph:       nx.Graph     = nx.Graph()
    # Suspect-suspect co-offender projection + precomputed analytics (Phase 3).
    # Built once per graph rebuild (not per-request) — betweenness/community
    # detection are too slow to recompute on every /api/network/* call.
    co_graph:     nx.Graph          = nx.Graph()
    centrality:   dict[str, dict]   = {}
    communities:  list[set]         = []
    community_of: dict[str, int]    = {}
    # False until the background centrality/community-detection pass (kicked
    # off after build_graph()) finishes — lets the server accept requests for
    # everything else (KPIs, hotspots, reports, map) without waiting for it.
    network_analytics_ready: bool   = False

DB = DataStore()

_DATA_MANIFEST: dict = {}

def _load_data_manifest() -> dict:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    path = f"{data_dir}/scale_manifest.json"
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        log.warning("Failed to read scale_manifest.json", exc_info=True)
        return {}

# ─── ZCQL helper ──────────────────────────────────────────────────────────────

def zcql_query(capp, sql: str) -> list[dict]:
    if capp is None:
        raise RuntimeError("Catalyst unavailable")
    raw = capp.zcql().execute_query(sql)
    # ZCQL wraps each row as {"<TableName>": {...columns...}} — unwrap to flat dicts.
    return [next(iter(row.values())) for row in raw]

# ─── Catalyst Cache helper (falls back to in-memory TTL cache) ───────────────
# Note: verify `capp.cache()` method names against your installed
# zcatalyst-sdk version — this call is wrapped defensively so a mismatch just
# falls back to the local cache instead of crashing the request.

_LOCAL_CACHE: dict[str, tuple[float, object]] = {}
_ACCUSED_IDENTITY_COUNTS: Optional[pd.Series] = None
CACHE_TTL_SECONDS = 30
ZIA_RISK_MODEL_ID = os.environ.get("ZIA_RISK_MODEL_ID", "52319000000096025").strip()

def cache_get(capp, key: str):
    if capp is not None:
        try:
            return capp.cache().segment().get_value(key)
        except Exception:
            pass
    entry = _LOCAL_CACHE.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL_SECONDS:
        return entry[1]
    return None

def cache_set(capp, key: str, value, ttl: int = CACHE_TTL_SECONDS) -> None:
    if capp is not None:
        try:
            capp.cache().segment().put_value(key, value, ttl)
            return
        except Exception:
            pass
    _LOCAL_CACHE[key] = (time.time(), value)

def _reset_risk_feature_cache() -> None:
    global _ACCUSED_IDENTITY_COUNTS, _CASE_STATION_MAP
    _ACCUSED_IDENTITY_COUNTS = None
    _CASE_STATION_MAP = None

_CASE_STATION_MAP: Optional[dict[int, int]] = None

def _case_station_map() -> dict[int, int]:
    """CaseMasterID -> PoliceStationID, cached — avoids rebuilding a 100k+ row
    index dict on every scoped /api/network request."""
    global _CASE_STATION_MAP
    if _CASE_STATION_MAP is None:
        if DB.cases.empty:
            _CASE_STATION_MAP = {}
        else:
            _CASE_STATION_MAP = dict(zip(
                DB.cases["CaseMasterID"].astype(int), DB.cases["PoliceStationID"].astype(int)))
    return _CASE_STATION_MAP

def _risk_features(case_master_id: int) -> dict[str, int]:
    global _ACCUSED_IDENTITY_COUNTS
    case_rows = DB.cases[DB.cases["CaseMasterID"].astype(int) == case_master_id]
    if case_rows.empty:
        raise KeyError(case_master_id)
    case = case_rows.iloc[0]
    case_accused = DB.accused[DB.accused["CaseMasterID"].astype(int) == case_master_id]
    case_arrests = DB.arrests[DB.arrests["CaseMasterID"].astype(int) == case_master_id]

    repeat_accused_count = 0
    if not case_accused.empty:
        if _ACCUSED_IDENTITY_COUNTS is None:
            normalized_all = DB.accused["AccusedName"].astype(str).str.strip().str.casefold()
            _ACCUSED_IDENTITY_COUNTS = normalized_all.value_counts()
        normalized_case = case_accused["AccusedName"].astype(str).str.strip().str.casefold()
        repeat_accused_count = int(normalized_case.map(_ACCUSED_IDENTITY_COUNTS).gt(1).sum())

    accused_count = len(case_accused)
    arrest_count = len(case_arrests)
    arrest_rate = round(min(1.0, arrest_count / max(accused_count, 1)) * 100)
    station_id = int(case["PoliceStationID"])
    crime_type_id = int(case["CrimeMajorHeadID"])
    latest_date = pd.to_datetime(DB.cases["CrimeRegisteredDate"], errors="coerce").max()
    case_date = pd.to_datetime(case["CrimeRegisteredDate"], errors="coerce")
    days_since_latest = max(0, int((latest_date - case_date).days)) if pd.notna(latest_date) and pd.notna(case_date) else 0
    return {
        "gravity_level": int(case["GravityOffenceID"]),
        "repeat_accused_count": repeat_accused_count,
        "accused_count": accused_count,
        "arrest_count": arrest_count,
        "arrest_rate_percent": arrest_rate,
        "station_case_volume": int((DB.cases["PoliceStationID"].astype(int) == station_id).sum()),
        "crime_type_volume": int((DB.cases["CrimeMajorHeadID"].astype(int) == crime_type_id).sum()),
        "days_since_latest": days_since_latest,
    }

def _local_risk_prediction(features: dict[str, int]) -> dict:
    score = (
        features["gravity_level"] * 3.0
        + min(features["accused_count"], 4) * 0.8
        + min(features["repeat_accused_count"], 4) * 1.3
        - min(features["arrest_rate_percent"], 100) * 0.006
    )
    risk_class = "high" if score >= 14 else ("medium" if score >= 10 else "low")
    return {"risk_class": risk_class, "scores": {risk_class: 100.0}}

def _zia_risk_prediction(capp, features: dict[str, int]) -> dict:
    if capp is None or not ZIA_RISK_MODEL_ID:
        raise RuntimeError("Zia AutoML is unavailable")
    result = capp.zia().auto_ml(int(ZIA_RISK_MODEL_ID), features)
    scores = result.get("classification_result", result) if isinstance(result, dict) else {}
    if not isinstance(scores, dict) or not scores:
        raise RuntimeError("Zia AutoML returned no classification result")
    normalized_scores = {str(label): float(score) for label, score in scores.items()}
    return {"risk_class": max(normalized_scores, key=normalized_scores.get), "scores": normalized_scores}

# ─── Session tokens (HMAC-signed, no external deps) ──────────────────────────

SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-insecure-secret-change-me")
SESSION_TTL_SECONDS = 12 * 60 * 60

_DEFAULT_SESSION_SECRET = "dev-insecure-secret-change-me"

def _assert_production_secrets_configured() -> None:
    """Hard-fail startup rather than silently run insecurely on Catalyst AppSail.

    Only enforced when X_ZOHO_CATALYST_LISTEN_PORT is present (Catalyst always
    injects it for AppSail deployments — see the CORS note below), so local
    dev/testing with the placeholder secret still works unmodified.
    """
    if os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT") and SESSION_SECRET == _DEFAULT_SESSION_SECRET:
        raise RuntimeError(
            "SESSION_SECRET is unset (using the insecure default) while running under "
            "Catalyst AppSail. Set a real SESSION_SECRET env var before deploying."
        )

def _require_admin_token(request: Request) -> None:
    """Shared guard for admin endpoints. Deny-by-default when SEED_TOKEN is unset —
    a prior version compared `header != os.environ.get("SEED_TOKEN")` directly, which
    passed when BOTH were None (no header sent, no env var set), a real auth bypass.
    Uses hmac.compare_digest for a timing-safe comparison.
    """
    expected = os.environ.get("SEED_TOKEN")
    provided = request.headers.get("X-Seed-Token")
    if not expected or not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(403, "Missing or invalid X-Seed-Token")

def sign_session(payload: dict) -> str:
    body = {**payload, "exp": time.time() + SESSION_TTL_SECONDS}
    raw = json.dumps(body, separators=(",", ":")).encode()
    sig = hmac.new(SESSION_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    return f"{base64.urlsafe_b64encode(raw).decode()}.{sig}"

def verify_session(token: str) -> Optional[dict]:
    try:
        raw_b64, sig = token.split(".", 1)
        raw = base64.urlsafe_b64decode(raw_b64.encode())
        expected = hmac.new(SESSION_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        body = json.loads(raw)
        if body.get("exp", 0) < time.time():
            return None
        return body
    except Exception:
        return None

def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()

# ─── Officer registry (server-side only — never shipped to the client) ──────
# In production, replace this with a Catalyst Data Store "Officers" table
# (queried below via ZCQL when running on Catalyst AppSail) or Catalyst User
# Management. Passwords are hashed with PBKDF2 before comparison.

_OFFICER_SALT = "garuda-static-salt-v1"  # demo only — use a per-user random salt in production

_OFFICER_REGISTRY: dict[str, dict] = {
    "KSP-BLR-7741": {
        "password_hash": hash_password("sentinel2026", _OFFICER_SALT),
        "name": "Cpt. R. Vance", "designation": "CI",
        "station": "Bengaluru City Police HQ", "clearance": "CLR-7", "node": "BLR-A1",
    },
    "KSP-BLR-4412": {
        "password_hash": hash_password("garuda2026", _OFFICER_SALT),
        "name": "SI A. Kumar", "designation": "SI",
        "station": "KR Market PS", "clearance": "CLR-4", "node": "BLR-B3",
    },
    "KSP-BLR-1001": {
        "password_hash": hash_password("constable123", _OFFICER_SALT),
        "name": "Const. B. Naidu", "designation": "Constable",
        "station": "Koramangala PS", "clearance": "CLR-1", "node": "BLR-C7",
    },
    "KSP-DGP-0001": {
        "password_hash": hash_password("dgp2026", _OFFICER_SALT),
        "name": "DGP S. Rao", "designation": "DGP",
        "station": "KSP State HQ", "clearance": "CLR-7", "node": "KSP-HQ",
    },
}

def _permissions_for(clearance: str) -> dict:
    level = int(clearance.replace("CLR-", ""))
    return {
        "canViewNetwork": level >= 3,
        "canSimulate": level >= 4,
        "canExport": level >= 5,
    }

def require_session(request: Request) -> dict:
    """Validate the signed officer session before accepting officer actions."""
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing officer session")
    session = verify_session(token)
    if not session:
        raise HTTPException(401, "Invalid or expired officer session")
    return session

def require_permission(request: Request, permission: str) -> dict:
    """Validate the signed officer session and its required clearance."""
    session = require_session(request)
    clearance = session.get("clearance")
    if not clearance or not _permissions_for(clearance).get(permission, False):
        raise HTTPException(403, "Insufficient clearance")
    return session

def _lookup_officer(capp, badge: str) -> Optional[dict]:
    """Try Catalyst Data Store first (Officers table), then local registry."""
    if capp is not None:
        try:
            rows = zcql_query(capp, f"SELECT * FROM Officers WHERE Badge = '{badge}'")
            if rows:
                return rows[0]
        except Exception:
            pass
    return _OFFICER_REGISTRY.get(badge)

# ─── Simple in-memory IP rate limiter (defense-in-depth; API Gateway does not
#     support AppSail as a target, so throttling is enforced in-app instead) ──
# Configurable via env vars so a load test (which, from one test machine, hits
# this from a single source IP and would otherwise trip the per-IP cap almost
# immediately, a different signal than production request volume from many
# distinct officer IPs) can raise the ceiling for its own runs.

_RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", 60))
_RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", 120))
_rate_buckets: dict[str, list[float]] = {}

def _client_ip(request: Request) -> str:
    """Real client IP behind AppSail's proxy — request.client.host alone is the
    proxy's own address there (every officer would collapse into one bucket),
    not the caller's. Trust the leftmost X-Forwarded-For hop (set by Catalyst's
    gateway, not attacker-controlled on AppSail since clients can't reach the
    app directly), falling back to request.client.host outside Catalyst."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _rate_limited(ip: str) -> bool:
    now = time.time()
    bucket = [t for t in _rate_buckets.get(ip, []) if now - t < _RATE_LIMIT_WINDOW]
    bucket.append(now)
    _rate_buckets[ip] = bucket
    return len(bucket) > _RATE_LIMIT_MAX

# ─── Self-instrumented visitor analytics (Catalyst has no built-in web
#     analytics for Web Client Hosting — verified live in Console: the
#     hosting page shows only deploy history, nothing else). In-memory
#     counters back the live /api/analytics/summary view (reset on AppSail
#     restart/redeploy, same accepted tradeoff as the rate limiter/local
#     cache above); every visit is also best-effort written to the
#     `VisitEvents` NoSQL table for a durable audit trail across restarts. ──

_VISIT_TOTAL = 0
_VISIT_UNIQUE_CLIENTS: set[str] = set()
_VISIT_BY_DAY: Counter = Counter()
_VISIT_BY_PATH: Counter = Counter()
_VISIT_NOSQL_TABLE = os.environ.get("VISIT_NOSQL_TABLE", "VisitEvents").strip()
# Caps guard against a flood of bogus client_id/path values (anyone can call
# this unauthenticated endpoint) exhausting memory via unbounded set/dict
# growth — plenty of headroom for this app's real traffic scale.
_VISIT_MAX_UNIQUE_CLIENTS = 50_000
_VISIT_MAX_DISTINCT_PATHS = 1_000

def _record_visit(client_id: str, path: str, referrer: Optional[str], capp=None) -> None:
    global _VISIT_TOTAL
    now = pd.Timestamp.now()
    day = now.strftime("%Y-%m-%d")
    _VISIT_TOTAL += 1
    if client_id in _VISIT_UNIQUE_CLIENTS or len(_VISIT_UNIQUE_CLIENTS) < _VISIT_MAX_UNIQUE_CLIENTS:
        _VISIT_UNIQUE_CLIENTS.add(client_id)
    _VISIT_BY_DAY[day] += 1
    if path in _VISIT_BY_PATH or len(_VISIT_BY_PATH) < _VISIT_MAX_DISTINCT_PATHS:
        _VISIT_BY_PATH[path] += 1
    if capp is not None:
        try:
            capp.nosql().get_table(_VISIT_NOSQL_TABLE).insert_items({"item": {
                "visit_id": str(uuid.uuid4()),
                "ts": now.isoformat(),
                "client_id": client_id,
                "path": path,
                "referrer": referrer or "",
            }})
        except Exception:
            log.debug("Visit NoSQL write failed", exc_info=True)

# ─── Data loaders ─────────────────────────────────────────────────────────────

def _zcql_query_all(capp, table_name: str, max_rows: int = 10000) -> list[dict]:
    """ZCQL caps LIMIT at 300 rows per query, so page through with LIMIT offset,300."""
    page_size = 300
    rows: list[dict] = []
    offset = 0
    while offset < max_rows:
        page = zcql_query(capp, f"SELECT * FROM {table_name} LIMIT {offset}, {page_size}")
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows

def load_from_catalyst(capp) -> None:
    """Used by the on-demand /api/admin/reload-from-datastore endpoint only —
    there's no request context at startup, so boot always uses CSV instead."""
    log.info("Loading from Catalyst Data Store via ZCQL…")
    case_limit = int(os.environ.get("DATASTORE_CASE_LIMIT", "100000"))
    accused_limit = int(os.environ.get("DATASTORE_ACCUSED_LIMIT", "200000"))
    arrest_limit = int(os.environ.get("DATASTORE_ARREST_LIMIT", "150000"))
    DB.cases       = pd.DataFrame(_zcql_query_all(capp, "CaseMaster", case_limit))
    DB.accused     = pd.DataFrame(_zcql_query_all(capp, "Accused", accused_limit))
    DB.arrests     = pd.DataFrame(_zcql_query_all(capp, "ArrestSurrender", arrest_limit))
    DB.crime_heads = pd.DataFrame(_zcql_query_all(capp, "CrimeHead", 300))
    _reset_risk_feature_cache()
    _coerce_dtypes()
    log.info(f"Loaded {len(DB.cases)} cases from Catalyst")

_DATA_LOAD_LOCK = Lock()

def ensure_data_loaded(request: Request) -> bool:
    """Recover in-memory analytics after an AppSail restart using this request's
    Catalyst context. Startup cannot do this because Catalyst headers are only
    available on a real proxied request."""
    if not DB.cases.empty:
        return True

    with _DATA_LOAD_LOCK:
        if not DB.cases.empty:
            return True
        capp = _try_catalyst_app(request)
        if capp is None:
            return False
        try:
            load_from_catalyst(capp)
            build_graph()
            # Sync here (not backgrounded): this is a rare crash-recovery path,
            # not the primary startup path this optimization targets.
            _compute_network_analytics()
            DB.network_analytics_ready = True
            _LOCAL_CACHE.clear()
            return not DB.cases.empty
        except Exception:
            log.exception("Automatic Catalyst Data Store reload failed")
            return False

def _coerce_dtypes() -> None:
    """Data Store/ZCQL returns every column as a JSON string, unlike pd.read_csv
    which auto-infers numeric dtypes. Re-cast the columns the rest of the app
    does numeric comparisons/math on, or things like `GravityOffenceID >= 4`
    silently break with a TypeError once data comes from Catalyst instead of CSV."""
    numeric_cols = {
        "cases":       ["CaseMasterID", "PoliceStationID", "CrimeMajorHeadID",
                         "GravityOffenceID", "latitude", "longitude"],
        "accused":     ["AccusedMasterID", "CaseMasterID", "AgeYear", "GenderID"],
        "arrests":     ["ArrestSurrenderID", "CaseMasterID", "AccusedMasterID"],
        "crime_heads": ["CrimeHeadID", "GravityLevel"],
    }
    for attr, cols in numeric_cols.items():
        df = getattr(DB, attr)
        if df.empty:
            continue
        for col in cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
    if not DB.cases.empty and "CrimeRegisteredDate" in DB.cases.columns:
        DB.cases["CrimeRegisteredDate"] = pd.to_datetime(
            DB.cases["CrimeRegisteredDate"], errors="coerce"
        ).dt.strftime("%Y-%m-%d")
    _assign_districts()

def _assign_districts() -> None:
    """Vectorized PoliceStationID -> DistrictID, cached as a column on DB.cases
    so per-request district/station scope filters don't re-run the reference
    lookup for every row on every request."""
    if DB.cases.empty or "PoliceStationID" not in DB.cases.columns:
        return
    unique_stations = DB.cases["PoliceStationID"].dropna().astype(int).unique()
    station_to_district = {sid: district_of_station(int(sid)).district_id for sid in unique_stations}
    DB.cases["DistrictID"] = DB.cases["PoliceStationID"].astype(int).map(station_to_district)
    _refresh_cases_by_date()

def _refresh_cases_by_date() -> None:
    """Precomputes DB.cases sorted by date once per load/reload/intake, instead
    of re-sorting all rows on every /api/reports request (measured as a real,
    uncached O(n log n) cost on the full 124k-row table previously)."""
    if DB.cases.empty or "CrimeRegisteredDate" not in DB.cases.columns:
        DB.cases_by_date = DB.cases
        return
    DB.cases_by_date = DB.cases.sort_values("CrimeRegisteredDate", ascending=False)

def load_from_csv() -> None:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    if not os.path.exists(f"{data_dir}/CaseMaster.csv"):
        log.warning("CSV data not found — run: python generate_data.py")
        return
    DB.cases       = pd.read_csv(f"{data_dir}/CaseMaster.csv")
    DB.accused     = pd.read_csv(f"{data_dir}/Accused.csv")
    DB.arrests     = pd.read_csv(f"{data_dir}/ArrestSurrender.csv")
    DB.crime_heads = pd.read_csv(f"{data_dir}/CrimeHead.csv")
    _reset_risk_feature_cache()
    _assign_districts()
    global _DATA_MANIFEST
    _DATA_MANIFEST = _load_data_manifest()
    log.info(f"Loaded {len(DB.cases)} cases, {len(DB.accused)} accused from CSV")

def build_graph() -> None:
    """
    Bounded bipartite graph: repeat accused identities ↔ FIR nodes.

    The full case corpus remains available for tabular/map analytics. Keeping
    only repeated identities here makes the network meaningful and prevents a
    100k-case dataset from creating hundreds of thousands of disconnected
    NetworkX objects during AppSail startup.
    """
    if DB.accused.empty:
        return
    graph_suspect_limit = int(os.environ.get("GRAPH_SUSPECT_LIMIT", "5000"))
    accused = DB.accused.dropna(subset=["AccusedName", "CaseMasterID"]).copy()
    accused["NormalizedIdentity"] = accused["AccusedName"].astype(str).str.strip().str.casefold()
    identity_counts = accused["NormalizedIdentity"].value_counts()
    repeat_identities = set(identity_counts[identity_counts >= 2].head(graph_suspect_limit).index)
    accused = accused[accused["NormalizedIdentity"].isin(repeat_identities)]

    G = nx.Graph()
    # FIR risk mirrors the case's own gravity, so graph nodes agree with the
    # >= 4 "high gravity" threshold used by /api/kpis and /api/hotspots.
    gravity_by_case: dict[int, int] = {}
    if not DB.cases.empty:
        gravity_by_case = dict(zip(
            DB.cases["CaseMasterID"].astype(int),
            DB.cases["GravityOffenceID"].astype(int),
        ))

    def _band(level: int) -> str:
        return "high" if level >= 4 else ("med" if level == 3 else "low")

    for row in accused.itertuples(index=False):
        identity = str(row.NormalizedIdentity)
        acc_id = f"A-{hashlib.sha1(identity.encode()).hexdigest()[:12]}"
        case_id = int(row.CaseMasterID)
        fir_id = f"FIR-{case_id}"
        degree = int(identity_counts[identity])
        G.add_node(acc_id, label=str(row.AccusedName), type="Suspect",
                   weight=min(12, degree), risk=_band(degree))
        G.add_node(fir_id, label=fir_id, type="FIR", weight=1,
                   risk=_band(gravity_by_case.get(case_id, 0)))
        G.add_edge(acc_id, fir_id, relation="Accused In")

    DB.graph = G
    log.info(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    DB.network_analytics_ready = False

def _require_network_analytics_ready(request: Request) -> None:
    """Deep network analytics (centrality/communities) now compute in the
    background after startup instead of blocking every endpoint — including
    ones that don't need them (KPIs, hotspots, reports) — behind a ~7-15s
    precompute. If a Catalyst Cache copy from a previous process exists,
    hydrate from it instantly instead of waiting on the in-process
    background computation (real gain on every restart/redeploy after the
    first). Endpoints that DO need them and have neither fail fast with a
    clear, honest 503 instead of silently returning empty/wrong results."""
    if DB.network_analytics_ready:
        _maybe_write_network_analytics_cache(request)
        return
    capp = _try_catalyst_app(request)
    cached = _read_network_analytics_cache(capp)
    if cached is not None:
        try:
            _hydrate_network_analytics(cached)
            log.info("Network analytics hydrated from Catalyst Cache — skipped in-process recompute")
            return
        except Exception:
            log.debug("Failed to hydrate network analytics from cache", exc_info=True)
    raise HTTPException(503, "Network analytics are still being computed; please retry in a few seconds.")

async def _refresh_network_analytics_background() -> None:
    """Fire-and-forget: runs the slow centrality/community-detection pass off
    the request/startup path. Called after every build_graph() from an async
    context (lifespan, admin reload, incident intake)."""
    try:
        await asyncio.to_thread(_compute_network_analytics)
        DB.network_analytics_ready = True
    except Exception:
        log.exception("Background network analytics computation failed")

# ─── Network analytics persistence via Catalyst Cache ────────────────────────
# Survives AppSail restarts/redeploys within its TTL, unlike the in-process
# DB.* fields, so the network tab doesn't have to wait through a full
# centrality/community recompute on every restart — only the very first one
# (or after the cache expires). No new Console setup needed — reuses the
# Cache service already wired up for cache_get/cache_set above.
# NOTE: cache_get()/cache_set() above silently fall back to the local dict
# on Catalyst because cache_set() calls a `put_value()` method that does not
# exist on this SDK version's Segment class (confirmed by inspecting
# backend/vendor/zcatalyst_sdk/cache/_segment.py — only get_value/get/put/
# update/delete exist). That bug is left as-is for the general short-TTL
# (30-300s) cache — real Catalyst Cache only supports whole-hour expiry, so
# "fixing" it there would silently turn a 30s KPI cache into an hour-stale
# one. This network-analytics use case is a genuinely good fit for
# hour-granularity, so it uses the correct methods directly instead.
_NETWORK_ANALYTICS_CACHE_KEY = "garuda_network_analytics_v1"
_NETWORK_ANALYTICS_CACHE_TTL_HOURS = int(os.environ.get("NETWORK_ANALYTICS_CACHE_TTL_HOURS", "6"))
_network_analytics_cache_written_this_process = False

def _serialize_network_analytics() -> dict:
    return {
        "centrality": DB.centrality,
        "communities": [list(c) for c in DB.communities],
        "co_graph_edges": [
            [u, v, d.get("weight", 1), d.get("shared_cases", [])]
            for u, v, d in DB.co_graph.edges(data=True)
        ],
    }

def _hydrate_network_analytics(blob: dict) -> None:
    DB.centrality = blob.get("centrality", {})
    DB.communities = [set(c) for c in blob.get("communities", [])]
    DB.community_of = {n: idx for idx, members in enumerate(DB.communities) for n in members}
    co = nx.Graph()
    co.add_nodes_from(DB.centrality.keys())
    for u, v, weight, shared_cases in blob.get("co_graph_edges", []):
        co.add_edge(u, v, weight=weight, shared_cases=shared_cases)
    DB.co_graph = co
    DB.network_analytics_ready = True

def _read_network_analytics_cache(capp) -> Optional[dict]:
    if capp is None:
        return None
    try:
        raw = capp.cache().segment().get_value(_NETWORK_ANALYTICS_CACHE_KEY)
        return json.loads(raw) if raw else None
    except Exception:
        return None

def _maybe_write_network_analytics_cache(request: Request) -> None:
    """Writes once per process (not once per request) — the analytics don't
    change again until the next build_graph(), so repeated writes would be
    wasted calls."""
    global _network_analytics_cache_written_this_process
    if _network_analytics_cache_written_this_process:
        return
    capp = _try_catalyst_app(request)
    if capp is None:
        return
    try:
        payload = json.dumps(_serialize_network_analytics())
        segment = capp.cache().segment()
        try:
            segment.update(_NETWORK_ANALYTICS_CACHE_KEY, payload, _NETWORK_ANALYTICS_CACHE_TTL_HOURS)
        except Exception:
            segment.put(_NETWORK_ANALYTICS_CACHE_KEY, payload, _NETWORK_ANALYTICS_CACHE_TTL_HOURS)
        _network_analytics_cache_written_this_process = True
        log.info("Network analytics written to Catalyst Cache for faster future restarts")
    except Exception:
        log.debug("Failed to write network analytics to Catalyst Cache", exc_info=True)

def _build_co_offender_graph(bipartite: nx.Graph) -> nx.Graph:
    """Suspect-suspect projection: two suspects are linked if named as
    co-accused in the same FIR, weighted by shared case count. Centrality,
    community detection, and path-finding all operate on this graph — the
    bipartite Suspect-FIR graph above stays as-is for /api/network."""
    co = nx.Graph()
    for n, d in bipartite.nodes(data=True):
        if d.get("type") == "Suspect":
            co.add_node(n, **d)
    for fir_id, d in bipartite.nodes(data=True):
        if d.get("type") != "FIR":
            continue
        suspects = [nb for nb in bipartite.neighbors(fir_id) if bipartite.nodes[nb].get("type") == "Suspect"]
        for i in range(len(suspects)):
            for j in range(i + 1, len(suspects)):
                a, b = suspects[i], suspects[j]
                if co.has_edge(a, b):
                    co[a][b]["weight"] += 1
                    co[a][b]["shared_cases"].append(fir_id)
                else:
                    co.add_edge(a, b, weight=1, shared_cases=[fir_id])
    return co

def _compute_network_analytics() -> None:
    """Precomputes the co-offender projection, centrality, and communities once
    per graph rebuild. Exact betweenness centrality is O(n*m) — on this
    dataset's ~5k-node projection that's 90+ seconds, so above
    BETWEENNESS_SAMPLE_THRESHOLD nodes we use k-sampled approximate
    betweenness (deterministic seed) to keep startup/reload bounded."""
    co = _build_co_offender_graph(DB.graph)
    DB.co_graph = co
    if co.number_of_nodes() == 0:
        DB.centrality = {}
        DB.communities = []
        DB.community_of = {}
        return

    degree_c = nx.degree_centrality(co)
    threshold = int(os.environ.get("BETWEENNESS_SAMPLE_THRESHOLD", "300"))
    sample_k = int(os.environ.get("BETWEENNESS_SAMPLE_K", "300"))
    k = min(sample_k, co.number_of_nodes()) if co.number_of_nodes() > threshold else None
    betweenness_c = nx.betweenness_centrality(co, k=k, seed=42, weight=None)
    try:
        eigenvector_c = nx.eigenvector_centrality(co, max_iter=300, weight="weight")
    except nx.PowerIterationFailedConvergence:
        eigenvector_c = {n: 0.0 for n in co.nodes}

    DB.centrality = {
        n: {
            "degree":      round(degree_c.get(n, 0.0), 4),
            "betweenness": round(betweenness_c.get(n, 0.0), 4),
            "eigenvector": round(eigenvector_c.get(n, 0.0), 4),
        }
        for n in co.nodes
    }

    try:
        communities = list(nx.algorithms.community.greedy_modularity_communities(co, weight="weight"))
    except Exception:
        log.exception("Community detection failed; continuing without communities")
        communities = []
    DB.communities = [set(c) for c in communities]
    DB.community_of = {n: idx for idx, members in enumerate(DB.communities) for n in members}
    log.info(f"Network analytics: co-graph {co.number_of_nodes()} nodes/{co.number_of_edges()} edges, "
             f"{len(DB.communities)} communities, betweenness k={k or 'exact'}")

def _kingpin_score(node_id: str) -> float:
    c = DB.centrality.get(node_id, {"degree": 0.0, "betweenness": 0.0, "eigenvector": 0.0})
    return round(0.4 * c["degree"] + 0.35 * c["betweenness"] + 0.25 * c["eigenvector"], 4)

def _suspect_case_ids(node_id: str) -> set[int]:
    """FIR neighbors of a suspect in the bipartite graph, parsed to CaseMasterID."""
    if node_id not in DB.graph:
        return set()
    out: set[int] = set()
    for nb in DB.graph.neighbors(node_id):
        if DB.graph.nodes[nb].get("type") != "FIR":
            continue
        try:
            out.add(int(nb.split("-", 1)[1]))
        except (IndexError, ValueError):
            continue
    return out

def _suspect_district_ids(node_id: str) -> set[int]:
    case_station = _case_station_map()
    out: set[int] = set()
    for cid in _suspect_case_ids(node_id):
        sid = case_station.get(cid)
        if sid is not None:
            out.add(district_of_station(sid).district_id)
    return out

# ─── Station-level causal feature engine ─────────────────────────────────────
# No live IoT/streetlight feed exists in this dataset, so each station's
# socio-economic profile is derived from a station-id-seeded RNG — stable
# across requests/restarts without needing a new Data Store table or CSV
# regeneration. This grounds the map's "causal_driver" narrative and the
# What-If Simulator in per-station numbers instead of canned placeholder text.

# Backward-compat alias: Bengaluru Urban's own locality list. `_ask()`'s
# area-name matching below is scoped to stations 1-100 (Bengaluru only);
# extending it statewide to the other districts is tracked separately.
BENGALURU_AREAS = KARNATAKA_DISTRICTS[0].localities

def district_name(station_id: int) -> str:
    return district_of_station(station_id).name

def _station_factors(station_id: int) -> dict:
    """Deterministic synthetic patrol/infra/commercial profile for a station —
    seeded on station_id (not wall-clock time), so it's stable across requests."""
    rng = random.Random(1000 + station_id)
    return {
        "patrol_density":     round(rng.uniform(25, 95), 1),
        "infra_health":       round(rng.uniform(20, 95), 1),
        "commercial_density": round(rng.uniform(15, 90), 1),
    }

def _causal_narrative(station_id: int, gravity: int) -> str:
    """Templated causal explanation grounded in this station's own factor
    values — replaces the earlier Faker-generated BriefFacts placeholder text."""
    f = _station_factors(station_id)
    weak = sorted(
        [("patrol density", f["patrol_density"]), ("street lighting / CCTV", f["infra_health"]),
         ("commercial footfall pressure", f["commercial_density"])],
        key=lambda kv: kv[1],
    )
    primary, secondary = weak[0], weak[1]
    severity_bump = round((gravity / 5) * (100 - primary[1]) / 10, 1)
    return (
        f"Low {primary[0]} ({primary[1]:.0f}%) and constrained {secondary[0]} "
        f"({secondary[1]:.0f}%) at {station_name(station_id)} correlate with an "
        f"estimated {severity_bump}pt rise in incident severity this quarter."
    )

def _scope_filter(df: pd.DataFrame, district_id: Optional[int] = None, station_id: Optional[int] = None) -> pd.DataFrame:
    """Apply optional district/station scoping to a cases-shaped DataFrame.
    No-op when neither filter is given, so every existing unfiltered response
    stays byte-identical. station_id is the more specific filter and wins if
    both are supplied."""
    if station_id is not None:
        return df[df["PoliceStationID"] == station_id]
    if district_id is not None:
        return df[df.get("DistrictID", pd.Series(dtype=int)) == district_id]
    return df

def _monthly_counts_by_station(df: Optional[pd.DataFrame] = None) -> dict:
    """station_id -> pandas Series indexed by month Period, incident counts."""
    source = DB.cases if df is None else df
    if source.empty:
        return {}
    df = source.copy()
    df["_month"] = pd.to_datetime(df["CrimeRegisteredDate"], errors="coerce").dt.to_period("M")
    df = df.dropna(subset=["_month"])
    out = {}
    for sid, grp in df.groupby("PoliceStationID"):
        out[int(sid)] = grp.groupby("_month").size().sort_index()
    return out

def _compute_anomalies(df: Optional[pd.DataFrame] = None) -> list[dict]:
    """Zia-style anomaly flagging: z-score of latest month vs trailing history,
    per station. Flags stations whose current month is a statistical outlier."""
    monthly = _monthly_counts_by_station(df)
    out = []
    for sid, series in monthly.items():
        if len(series) < 4:
            continue
        current = float(series.iloc[-1])
        history = series.iloc[:-1]
        mean = float(history.mean())
        std = float(history.std()) or 1.0
        z = round((current - mean) / std, 2)
        if z >= 2.0:
            out.append({
                "station_id":    int(sid),
                "station_name":  station_name(int(sid)),
                "z_score":       z,
                "current_count": int(current),
                "mean_count":    round(mean, 1),
                "severity":      "critical" if z >= 3.5 else "high",
            })
    return sorted(out, key=lambda a: a["z_score"], reverse=True)

# ─── Forecast model backtest (Phase 4) ────────────────────────────────────────
# The deployed forecast is a simple per-station linear trend. Rather than
# assert it is "accurate," we backtest it against three standard time-series
# baselines on held-out months and report criminology hotspot-prediction
# metrics (PAI/PEI) alongside plain error metrics — so the claim is measured,
# not asserted. See _backtest_forecast_models() for the methodology.

def _forecast_naive(y: np.ndarray) -> float:
    return float(y[-1])

def _forecast_seasonal_naive(y: np.ndarray, period: int = 12) -> float:
    return float(y[-period]) if len(y) > period else _forecast_naive(y)

def _forecast_ewma(y: np.ndarray, alpha: float = 0.3) -> float:
    level = float(y[0])
    for v in y[1:]:
        level = alpha * float(v) + (1 - alpha) * level
    return level

def _forecast_linear_trend(y: np.ndarray) -> float:
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    return max(0.0, float(slope * len(y) + intercept))

def _residual_std(model_fn, y: np.ndarray) -> float:
    """One-step-ahead in-sample residual std for a forecast function, used to
    build a rough confidence interval around its next-period prediction."""
    if len(y) < 5:
        return 0.0
    residuals = [y[t] - model_fn(y[:t]) for t in range(3, len(y))]
    return float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0

FORECAST_MODELS = {
    "naive":          _forecast_naive,
    "seasonal_naive": _forecast_seasonal_naive,
    "ewma":           _forecast_ewma,
    "linear_trend":   _forecast_linear_trend,
}

# Which of FORECAST_MODELS actually powers /api/hotspots/forecast. Changing
# this is a one-line switch driven by /api/hotspots/forecast/backtest results
# — see the Phase 4 notes for the measured comparison before changing it.
DEPLOYED_FORECAST_MODEL = os.environ.get("DEPLOYED_FORECAST_MODEL", "linear_trend")

FEEDBACK_LOOP_CAUTION = (
    "Predicted hotspots can influence where patrols are sent, which can change where "
    "future crime gets recorded — a feedback loop that risks reinforcing existing patrol "
    "patterns rather than measuring true risk. Mitigation: treat predictions as one input "
    "for human review, never automated dispatch, and recalibrate this backtest periodically "
    "against realized outcomes."
)

def _backtest_forecast_models(df: Optional[pd.DataFrame] = None, test_months: int = 3, k_fraction: float = 0.2) -> dict:
    """Rolling-origin backtest: for each held-out month, train every model on
    only the months before it, predict that month, and score against what
    actually happened. MAE/MAPE are plain per-station-month error metrics.
    PAI (Prediction Accuracy Index) and PEI (Predictive Efficiency Index) are
    the standard criminology hotspot-prediction metrics (Chainey et al. 2008),
    adapted here to station units instead of a spatial grid:
      PAI = hit_rate / area_fraction, where hit_rate = actual incidents
        captured by the top-K predicted stations / total actual incidents,
        and area_fraction = K / total stations (station count is our proxy
        for "area" since this system doesn't operate on a GIS grid).
      PEI = PAI achieved / PAI achievable by a perfect-hindsight ranking of
        the same month, so a PEI near 1.0 means "about as good as possible
        given how concentrated crime actually was that month."
    """
    monthly = _monthly_counts_by_station(df)
    if not monthly:
        return {"models": [], "test_months": 0, "station_count": 0, "feedback_loop_caution": FEEDBACK_LOOP_CAUTION}

    all_months = sorted(set().union(*[set(s.index) for s in monthly.values()]))
    aligned = {sid: s.reindex(all_months, fill_value=0) for sid, s in monthly.items()}
    station_ids = list(aligned.keys())
    k = max(1, round(len(station_ids) * k_fraction))
    test_months = min(test_months, max(0, len(all_months) - 4))

    per_model_err: dict[str, list[float]] = {name: [] for name in FORECAST_MODELS}
    per_model_pct_err: dict[str, list[float]] = {name: [] for name in FORECAST_MODELS}
    per_model_pai: dict[str, list[float]] = {name: [] for name in FORECAST_MODELS}
    per_model_pei: dict[str, list[float]] = {name: [] for name in FORECAST_MODELS}
    evaluated_months = 0

    for month_idx in range(len(all_months) - test_months, len(all_months)):
        if month_idx < 4:
            continue
        actual_by_station: dict[int, float] = {}
        predicted_by_station: dict[str, dict[int, float]] = {name: {} for name in FORECAST_MODELS}
        for sid in station_ids:
            series = aligned[sid]
            train = series.iloc[:month_idx].values.astype(float)
            if len(train) < 3:
                continue
            actual = float(series.iloc[month_idx])
            actual_by_station[sid] = actual
            for name, fn in FORECAST_MODELS.items():
                pred = fn(train)
                predicted_by_station[name][sid] = pred
                per_model_err[name].append(pred - actual)
                if actual > 0:
                    per_model_pct_err[name].append(abs(pred - actual) / actual)

        total_actual = sum(actual_by_station.values())
        if total_actual <= 0 or len(actual_by_station) < k:
            continue
        evaluated_months += 1
        area_fraction = k / len(actual_by_station)
        best_k = sorted(actual_by_station, key=lambda s: actual_by_station[s], reverse=True)[:k]
        pai_max = (sum(actual_by_station[s] for s in best_k) / total_actual) / area_fraction

        for name in FORECAST_MODELS:
            preds = predicted_by_station[name]
            if not preds:
                continue
            top_k = sorted(preds, key=lambda s: preds[s], reverse=True)[:k]
            hit_rate = sum(actual_by_station.get(s, 0.0) for s in top_k) / total_actual
            pai = hit_rate / area_fraction if area_fraction > 0 else 0.0
            per_model_pai[name].append(pai)
            per_model_pei[name].append(pai / pai_max if pai_max > 0 else 0.0)

    summary = []
    for name in FORECAST_MODELS:
        errors = per_model_err[name]
        if not errors:
            continue
        pct_errors = per_model_pct_err[name]
        pais, peis = per_model_pai[name], per_model_pei[name]
        summary.append({
            "model": name,
            "mae": round(float(np.mean(np.abs(errors))), 3),
            "mape_percent": round(float(np.mean(pct_errors) * 100), 1) if pct_errors else None,
            "pai": round(float(np.mean(pais)), 3) if pais else None,
            "pei": round(float(np.mean(peis)), 3) if peis else None,
        })
    summary.sort(key=lambda r: r["mae"])

    return {
        "models": summary,
        "test_months": evaluated_months,
        "station_count": len(station_ids),
        "k_stations": k,
        "k_fraction": k_fraction,
        "best_model_by_mae": summary[0]["model"] if summary else None,
        "deployed_model": DEPLOYED_FORECAST_MODEL,
        "methodology": (
            "Rolling-origin backtest: each held-out month is predicted using only prior "
            "months, per station, then compared against naive (last value), seasonal-naive "
            "(same month last year), and exponentially-weighted moving average baselines."
        ),
        "feedback_loop_caution": FEEDBACK_LOOP_CAUTION,
    }

# ─── Synthetic Hoysala patrol fleet ───────────────────────────────────────────
# In-memory fleet with slight positional jitter every ~20s (no real GPS feed
# exists in this dataset) — enough to feel "live" on the map without a DB.

_PATROL_BASE = [
    (12.965, 77.601), (12.982, 77.615), (12.952, 77.622), (12.9758, 77.6072),
    (12.9352, 77.6245), (12.8399, 77.6770), (13.0218, 77.5510), (12.9900, 77.5800),
    (12.9600, 77.6400), (12.9100, 77.6500), (13.0100, 77.6200), (12.9450, 77.5700),
    (12.9990, 77.6600), (12.9200, 77.6100), (13.0350, 77.5950),
]

def _patrol_units() -> list[dict]:
    units = []
    tick = int(time.time() // 20)
    for i, (lat, lng) in enumerate(_PATROL_BASE, start=1):
        rng = random.Random(tick * 1000 + i)
        jlat = lat + rng.uniform(-0.006, 0.006)
        jlng = lng + rng.uniform(-0.006, 0.006)
        units.append({
            "id": f"HOY-{i:02d}", "lat": round(jlat, 6), "lng": round(jlng, 6),
            "status": rng.choice(["patrolling", "patrolling", "patrolling", "responding"]),
        })
    return units

@asynccontextmanager
async def lifespan(app: FastAPI):
    _assert_production_secrets_configured()  # not caught — must hard-fail startup
    try:
        load_from_csv()
        build_graph()
        asyncio.create_task(_refresh_network_analytics_background())
    except Exception as e:
        log.error(f"Startup failed: {e}")
    yield

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Project Garuda API",
    description="KSP Spatio-Temporal Crime Intelligence — KSP Datathon 2026",
    version="2.0.0",
    lifespan=lifespan,
)

# NOTE on CORS: Catalyst's AppSail gateway already injects a correct
# Access-Control-Allow-Origin header itself, scoped to the project's linked
# Web Client origin(s) (verified: an arbitrary Origin gets no ACAO header at
# all, so it's a real restriction, not a permissive reflect-any-origin).
# Adding our own CORSMiddleware on top of THAT caused the platform's header
# and ours to both be sent, producing an invalid duplicated ACAO value that
# real browsers reject outright. So only add our own CORS middleware for
# local dev (no Catalyst gateway in front of us there) — detect that via
# X_ZOHO_CATALYST_LISTEN_PORT, which Catalyst always injects for AppSail.
if not os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT"):
    _allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if _allowed_origins == "*" else [o.strip() for o in _allowed_origins.split(",")],
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["*"],
    )

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if _rate_limited(_client_ip(request)):
        raise HTTPException(429, "Too many requests")
    return await call_next(request)

# Safety net: any unhandled exception otherwise falls through to Starlette's
# generic plain-text 500 (no useful detail, hard to debug on a platform with
# no easy log access like Catalyst AppSail). Surface it as JSON instead. The
# full exception is logged server-side only — the client response is a
# generic message + request_id so internals (stack traces, query params,
# library versions) never leak to callers, correlated via X-Request-ID.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    log.exception(f"Unhandled exception on {request.url.path} (request_id={request_id})")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )

# ─── Models ───────────────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    patrol_density:  float = 62.0
    infra_health:    float = 78.0
    rapid_response:  float = 45.0

class ExportBriefRequest(BaseModel):
    """Scope only — every figure in the brief is computed server-side from
    live data, never trusted from the client, so the PDF can't go stale or
    show numbers that don't match what the officer was actually looking at."""
    district_id:       Optional[int] = None
    station_id:        Optional[int] = None
    simulation_impact: Optional[int] = None

class LoginRequest(BaseModel):
    badge:    str
    password: str

class TranslateRequest(BaseModel):
    texts:           list[str]
    target_language: str = "kn"

class IncidentIntakeRequest(BaseModel):
    """Operational intelligence intake, not a substitute for legal FIR registration."""
    crime_no: str = Field(min_length=3, max_length=80)
    registered_date: str
    police_station_id: int = Field(ge=1, le=1100)
    crime_major_head_id: int = Field(ge=1)
    gravity_offence_id: int = Field(ge=1, le=5)
    latitude: float = Field(ge=11.0, le=15.0)
    longitude: float = Field(ge=74.0, le=80.0)
    brief_facts: str = Field(min_length=10, max_length=1000)
    accused_names: list[str] = Field(default_factory=list, max_length=10)

class CaseWorkflowUpdate(BaseModel):
    status: Literal["open", "investigating", "resolved", "closed"]
    assigned_officer: str = Field(min_length=2, max_length=120)

_LOCAL_CASE_WORKFLOWS: dict[int, dict] = {}

class ResponsePlanCreate(BaseModel):
    alert_id: str = Field(min_length=1, max_length=80)
    station_id: int = Field(ge=1, le=1100)
    current_count: int = Field(ge=0)
    usual_count: float = Field(ge=0)
    z_score: float = Field(ge=0)
    decision: Literal["approve", "modify", "escalate"]
    note: str = Field(default="", max_length=500)
    assigned_to: str = Field(min_length=3, max_length=80)
    due_at: Optional[str] = Field(default=None, max_length=40)

class ResponsePlanUpdate(BaseModel):
    status: Literal["acknowledged", "in_progress", "completed"]
    outcome_note: str = Field(default="", max_length=500)

_LOCAL_RESPONSE_PLANS: dict[str, dict] = {}
_LOCAL_FIELD_UPDATES: dict[str, list[dict]] = {}
_LOCAL_OPERATION_ATTACHMENTS: dict[str, bytes] = {}
_RESPONSE_PLAN_LOCK = Lock()
_OPERATION_AUDIT_NOSQL_TABLE = os.environ.get("OPERATION_AUDIT_NOSQL_TABLE", "OperationAuditEvents").strip()
_OPERATION_STRATUS_BUCKET = os.environ.get("OPERATION_STRATUS_BUCKET", "garuda-operations").strip()

def _public_response_plan(plan: dict) -> dict:
    result = {key: value for key, value in plan.items() if not key.startswith("_")}
    result["updates"] = list(_LOCAL_FIELD_UPDATES.get(plan["operation_id"], []))
    return result

def _field_update_row(update: dict) -> dict:
    return {
        "UpdateID": update["update_id"],
        "OperationID": update["operation_id"],
        "OfficerBadge": update["officer_badge"],
        "Status": update["status"],
        "Note": update["note"],
        "AttachmentKey": update.get("attachment_key", ""),
        "AttachmentName": update.get("attachment_name", ""),
        "AttachmentType": update.get("attachment_type", ""),
        "CreatedAt": update["created_at"],
    }

def _record_field_update(
    plan: dict,
    officer_badge: str,
    status: str,
    note: str = "",
    attachment_key: str = "",
    attachment_name: str = "",
    attachment_type: str = "",
    capp=None,
) -> dict:
    update = {
        "update_id": str(uuid.uuid4()),
        "operation_id": plan["operation_id"],
        "officer_badge": officer_badge,
        "status": status,
        "note": note,
        "attachment_key": attachment_key,
        "attachment_name": attachment_name,
        "attachment_type": attachment_type,
        "created_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "persistence": "session",
    }
    if capp is not None:
        try:
            capp.datastore().table("FieldUpdates").insert_row(_field_update_row(update))
            update["persistence"] = "datastore"
        except Exception as exc:
            log.warning(f"FieldUpdates insert failed; keeping session copy: {exc}")
    _LOCAL_FIELD_UPDATES.setdefault(plan["operation_id"], []).append(update)
    return update

def _response_plan_row(plan: dict) -> dict:
    return {
        "OperationID": plan["operation_id"],
        "AlertID": plan["alert_id"],
        "StationID": plan["station_id"],
        "StationName": plan["station_name"],
        "CurrentCount": plan["current_count"],
        "UsualCount": plan["usual_count"],
        "ZScore": plan["z_score"],
        "Decision": plan["decision"],
        "Note": plan["note"],
        "AssignedTo": plan["assigned_to"],
        "Status": plan["status"],
        "CreatedBy": plan["created_by"],
        "CreatedAt": plan["created_at"],
        "DueAt": plan["due_at"] or "",
        "UpdatedAt": plan["updated_at"],
        "OutcomeNote": plan["outcome_note"],
    }

def _hydrate_response_plans(capp) -> None:
    if capp is None:
        return
    try:
        rows = capp.datastore().table("ResponsePlans").get_iterable_rows()
        hydrated: dict[str, dict] = {}
        for row in rows:
            operation_id = str(row.get("OperationID", "")).strip()
            if not operation_id:
                continue
            hydrated[operation_id] = {
                "operation_id": operation_id,
                "alert_id": str(row.get("AlertID", "")),
                "station_id": int(row.get("StationID", 0)),
                "station_name": str(row.get("StationName", "")),
                "current_count": int(row.get("CurrentCount", 0)),
                "usual_count": float(row.get("UsualCount", 0)),
                "z_score": float(row.get("ZScore", 0)),
                "decision": str(row.get("Decision", "approve")),
                "note": str(row.get("Note", "")),
                "assigned_to": str(row.get("AssignedTo", "")),
                "status": str(row.get("Status", "assigned")),
                "created_by": str(row.get("CreatedBy", "")),
                "created_at": str(row.get("CreatedAt", "")),
                "due_at": str(row.get("DueAt", "")) or None,
                "updated_at": str(row.get("UpdatedAt", "")),
                "outcome_note": str(row.get("OutcomeNote", "")),
                "persistence": "datastore",
                "_datastore_row_id": str(row.get("ROWID", "")),
            }
        with _RESPONSE_PLAN_LOCK:
            _LOCAL_RESPONSE_PLANS.update(hydrated)
    except Exception as exc:
        log.debug(f"ResponsePlans hydration unavailable: {exc}")

def _hydrate_field_updates(capp) -> None:
    if capp is None:
        return
    try:
        rows = capp.datastore().table("FieldUpdates").get_iterable_rows()
        hydrated: dict[str, list[dict]] = {}
        for row in rows:
            operation_id = str(row.get("OperationID", "")).strip()
            if not operation_id:
                continue
            hydrated.setdefault(operation_id, []).append({
                "update_id": str(row.get("UpdateID", "")),
                "operation_id": operation_id,
                "officer_badge": str(row.get("OfficerBadge", "")),
                "status": str(row.get("Status", "")),
                "note": str(row.get("Note", "")),
                "attachment_key": str(row.get("AttachmentKey", "")),
                "attachment_name": str(row.get("AttachmentName", "")),
                "attachment_type": str(row.get("AttachmentType", "")),
                "created_at": str(row.get("CreatedAt", "")),
                "persistence": "datastore",
            })
        for updates in hydrated.values():
            updates.sort(key=lambda item: item["created_at"])
        _LOCAL_FIELD_UPDATES.update(hydrated)
    except Exception as exc:
        log.debug(f"FieldUpdates hydration unavailable: {exc}")

def _emit_operation_audit_event(plan: dict, actor: str, action: str, capp=None) -> None:
    event = {
        "event_id": str(uuid.uuid4()),
        "ts": pd.Timestamp.now(tz="UTC").isoformat(),
        "operation_id": plan["operation_id"],
        "actor": actor,
        "action": action,
        "status": plan["status"],
        "station_id": str(plan["station_id"]),
    }
    _AGENT_AUDIT_LOG.info(json.dumps({"type": "operation", **event}))
    if capp is not None:
        try:
            capp.nosql().get_table(_OPERATION_AUDIT_NOSQL_TABLE).insert_items({"item": event})
        except Exception:
            log.debug("Operation audit NoSQL write failed", exc_info=True)

def _create_response_plan(body: ResponsePlanCreate, officer: dict, capp=None) -> dict:
    assigned_to = body.assigned_to.strip().upper()
    if not _lookup_officer(capp, assigned_to):
        raise HTTPException(422, "Assigned officer was not found")

    now = pd.Timestamp.now(tz="UTC").isoformat()
    plan = {
        "operation_id": str(uuid.uuid4()),
        "alert_id": body.alert_id.strip(),
        "station_id": body.station_id,
        "station_name": station_name(body.station_id),
        "current_count": body.current_count,
        "usual_count": body.usual_count,
        "z_score": body.z_score,
        "decision": body.decision,
        "note": body.note.strip(),
        "assigned_to": assigned_to,
        "status": "assigned",
        "created_by": officer["badge"],
        "created_at": now,
        "due_at": body.due_at,
        "updated_at": now,
        "outcome_note": "",
        "persistence": "session",
    }
    if capp is not None:
        try:
            inserted = capp.datastore().table("ResponsePlans").insert_row(_response_plan_row(plan))
            plan["_datastore_row_id"] = str(inserted.get("ROWID", ""))
            plan["persistence"] = "datastore"
        except Exception as exc:
            log.warning(f"ResponsePlans insert failed; keeping session copy: {exc}")
    with _RESPONSE_PLAN_LOCK:
        _LOCAL_RESPONSE_PLANS[plan["operation_id"]] = plan
    _record_field_update(plan, officer["badge"], "assigned", body.note.strip(), capp=capp)
    _emit_operation_audit_event(plan, officer["badge"], "created", capp)
    return _public_response_plan(plan)

def _update_response_plan(operation_id: str, body: ResponsePlanUpdate, officer: dict, capp=None) -> dict:
    if operation_id not in _LOCAL_RESPONSE_PLANS:
        _hydrate_response_plans(capp)
    with _RESPONSE_PLAN_LOCK:
        plan = _LOCAL_RESPONSE_PLANS.get(operation_id)
        if plan is None:
            raise HTTPException(404, "Response plan not found")

        can_manage = _permissions_for(officer.get("clearance", "CLR-1"))["canSimulate"]
        if not can_manage and plan["assigned_to"] != officer.get("badge"):
            raise HTTPException(403, "This response plan is assigned to another officer")

        allowed_next = {
            "assigned": {"acknowledged", "in_progress", "completed"},
            "acknowledged": {"in_progress", "completed"},
            "in_progress": {"completed"},
            "completed": set(),
        }
        if body.status not in allowed_next[plan["status"]]:
            raise HTTPException(409, f"Cannot change status from {plan['status']} to {body.status}")

        plan["status"] = body.status
        plan["outcome_note"] = body.outcome_note.strip()
        plan["updated_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        row_id = plan.get("_datastore_row_id")
        if capp is not None and row_id:
            try:
                capp.datastore().table("ResponsePlans").update_row({
                    "ROWID": row_id,
                    "Status": plan["status"],
                    "OutcomeNote": plan["outcome_note"],
                    "UpdatedAt": plan["updated_at"],
                })
                plan["persistence"] = "datastore"
            except Exception as exc:
                log.warning(f"ResponsePlans update failed; keeping session copy: {exc}")
        result = _public_response_plan(plan)
    _record_field_update(plan, officer["badge"], body.status, body.outcome_note.strip(), capp=capp)
    result = _public_response_plan(plan)
    _emit_operation_audit_event(plan, officer["badge"], "status_changed", capp)
    return result

def _require_operation_access(operation_id: str, officer: dict, capp=None) -> dict:
    if operation_id not in _LOCAL_RESPONSE_PLANS:
        _hydrate_response_plans(capp)
    plan = _LOCAL_RESPONSE_PLANS.get(operation_id)
    if plan is None:
        raise HTTPException(404, "Response plan not found")
    can_manage = _permissions_for(officer.get("clearance", "CLR-1"))["canSimulate"]
    if not can_manage and plan["assigned_to"] != officer.get("badge"):
        raise HTTPException(403, "This response plan is assigned to another officer")
    return plan

def _operation_assessment(plan: dict) -> dict:
    if {"PoliceStationID", "CrimeRegisteredDate"}.issubset(DB.cases.columns):
        station_cases = DB.cases[DB.cases["PoliceStationID"].astype(int) == int(plan["station_id"])].copy()
        dates = pd.to_datetime(station_cases["CrimeRegisteredDate"], errors="coerce").dropna()
    else:
        dates = pd.Series([], dtype="datetime64[ns]")
    latest_data_at = dates.max() if not dates.empty else None
    created_at = pd.Timestamp(plan["created_at"])
    created_at = created_at.tz_convert(None) if created_at.tzinfo else created_at
    observation_days = max(0, (pd.Timestamp.now(tz="UTC") - pd.Timestamp(plan["created_at"])).days)
    baseline_count = None
    recent_count = None
    historical_change_percent = None
    if latest_data_at is not None:
        latest_data_at = pd.Timestamp(latest_data_at).tz_localize(None)
        baseline_start = latest_data_at - pd.Timedelta(days=59)
        baseline_end = latest_data_at - pd.Timedelta(days=30)
        recent_start = latest_data_at - pd.Timedelta(days=29)
        baseline_count = int(((dates >= baseline_start) & (dates <= baseline_end)).sum())
        recent_count = int(((dates >= recent_start) & (dates <= latest_data_at)).sum())
        if baseline_count > 0:
            historical_change_percent = round((recent_count - baseline_count) / baseline_count * 100, 1)
    impact_ready = bool(latest_data_at is not None and latest_data_at >= created_at + pd.Timedelta(days=30))
    return {
        "operation_id": plan["operation_id"],
        "process_status": "completed" if plan["status"] == "completed" else "in_progress",
        "task_status": plan["status"],
        "observation_days": observation_days,
        "field_update_count": len(_LOCAL_FIELD_UPDATES.get(plan["operation_id"], [])),
        "baseline_30d_cases": baseline_count,
        "latest_historical_30d_cases": recent_count,
        "historical_change_percent": historical_change_percent,
        "latest_data_at": latest_data_at.isoformat() if latest_data_at is not None else None,
        "impact_status": "ready" if impact_ready else "pending_observation_window",
        "impact_available_after": (created_at + pd.Timedelta(days=30)).isoformat(),
        "advisory": (
            "The historical comparison provides context only. It is not attributed to this response. "
            "A causal outcome assessment requires at least 30 days of post-response records and a comparable control area."
        ),
    }

def _persist_operation_assessment(assessment: dict, actor: str, capp=None) -> str:
    if capp is None:
        return "session"
    try:
        capp.datastore().table("Assessments").insert_row({
            "AssessmentID": str(uuid.uuid4()),
            "OperationID": assessment["operation_id"],
            "ProcessStatus": assessment["process_status"],
            "ImpactStatus": assessment["impact_status"],
            "ObservationDays": assessment["observation_days"],
            "BaselineCount": assessment["baseline_30d_cases"] if assessment["baseline_30d_cases"] is not None else -1,
            "RecentCount": assessment["latest_historical_30d_cases"] if assessment["latest_historical_30d_cases"] is not None else -1,
            "HistoricalChange": assessment["historical_change_percent"] if assessment["historical_change_percent"] is not None else 0,
            "AssessedBy": actor,
            "AssessedAt": pd.Timestamp.now(tz="UTC").isoformat(),
            "Advisory": assessment["advisory"],
        })
        return "datastore"
    except Exception as exc:
        log.warning(f"Assessments insert failed: {exc}")
        return "session"

def _require_internal_token(request: Request, env_name: str, header_name: str) -> None:
    expected = os.environ.get(env_name, "").strip()
    supplied = request.headers.get(header_name, "").strip()
    if not expected or not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(403, "Invalid automation credential")

def _run_operation_maintenance(capp=None) -> dict:
    _hydrate_response_plans(capp)
    _hydrate_field_updates(capp)
    completed = [plan for plan in _LOCAL_RESPONSE_PLANS.values() if plan["status"] == "completed"]
    persisted = 0
    pending = 0
    ready = 0
    for plan in completed:
        assessment = _operation_assessment(plan)
        pending += int(assessment["impact_status"] == "pending_observation_window")
        ready += int(assessment["impact_status"] == "ready")
        persisted += int(_persist_operation_assessment(assessment, "job-scheduler", capp) == "datastore")
    return {
        "completed_operations": len(completed),
        "assessment_snapshots_persisted": persisted,
        "pending_observation_window": pending,
        "impact_ready": ready,
        "ran_at": pd.Timestamp.now(tz="UTC").isoformat(),
    }

def _record_signal_delivery(payload: dict, capp=None) -> dict:
    event = {
        "event_id": str(uuid.uuid4()),
        "ts": pd.Timestamp.now(tz="UTC").isoformat(),
        "operation_id": str(payload.get("operation_id") or payload.get("OperationID") or ""),
        "actor": "catalyst-signals",
        "action": str(payload.get("event_type") or payload.get("action") or "signal_received"),
        "status": str(payload.get("status") or payload.get("Status") or "received"),
        "station_id": str(payload.get("station_id") or payload.get("StationID") or ""),
    }
    if capp is not None:
        try:
            capp.nosql().get_table(_OPERATION_AUDIT_NOSQL_TABLE).insert_items({"item": event})
        except Exception:
            log.debug("Signals delivery NoSQL write failed", exc_info=True)
    _AGENT_AUDIT_LOG.info(json.dumps({"type": "signal", **event}))
    return event

def _operation_debrief_html(plan: dict, assessment: dict) -> str:
    updates = "".join(
        f"<li><b>{html_lib.escape(item['status'])}</b> - {html_lib.escape(item['note'] or 'No note')} "
        f"<small>{html_lib.escape(item['created_at'])}</small></li>"
        for item in _LOCAL_FIELD_UPDATES.get(plan["operation_id"], [])
    ) or "<li>No field updates recorded.</li>"
    return f"""<!doctype html><html><head><style>
    body{{font-family:sans-serif;padding:28px;color:#18202a}}h1{{font-size:22px}}h2{{font-size:14px;margin-top:22px}}
    .meta{{color:#52606d;font-size:12px}}.status{{padding:3px 8px;background:#e6f4ea;color:#176b36;border-radius:4px}}
    li{{margin:8px 0}}footer{{margin-top:30px;font-size:10px;color:#68737d}}
    </style></head><body><h1>GARUDA OPERATION DEBRIEF</h1>
    <p class="meta">Operation {html_lib.escape(plan['operation_id'])} - {html_lib.escape(plan['station_name'])}</p>
    <p><span class="status">{html_lib.escape(plan['status'])}</span></p>
    <h2>Supervisor Direction</h2><p>{html_lib.escape(plan['note'] or 'No note')}</p>
    <h2>Field Timeline</h2><ol>{updates}</ol>
    <h2>Assessment</h2><p>Process: {html_lib.escape(assessment['process_status'])}</p>
    <p>Historical context: {assessment['baseline_30d_cases']} cases in the prior 30-day window; {assessment['latest_historical_30d_cases']} in the latest available 30-day window.</p>
    <p>Impact status: {html_lib.escape(assessment['impact_status'])}</p><p>{html_lib.escape(assessment['advisory'])}</p>
    <footer>Project Garuda | Synthetic prototype data | Human-reviewed operational record | Powered by Zoho Catalyst SmartBrowz</footer>
    </body></html>"""

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root(request: Request):
    capp = _try_catalyst_app(request)
    return {"service": "Garuda API", "version": "2.0.0",
            "mode": "catalyst" if capp is not None else "local",
            "cases": len(DB.cases)}

@app.get("/health")
async def health():
    ready = len(DB.cases) > 0
    return {
        "status": "ok" if ready else "degraded",
        "ready": ready,
        "cases": len(DB.cases),
        "graph_nodes": DB.graph.number_of_nodes(),
        "network_analytics_ready": DB.network_analytics_ready,
        "schema_version": _DATA_MANIFEST.get("schema_version"),
        "data_generated_at": _DATA_MANIFEST.get("statewide_generated_at") or _DATA_MANIFEST.get("generated_at"),
    }

# ─── POST /api/analytics/visit / GET /api/analytics/summary ─────────────────
# Self-instrumented visitor tracking — Catalyst has no built-in web analytics
# for Web Client Hosting. Anonymous (no session required, since the login
# page itself is a "visit"); client_id is a random UUID the frontend keeps in
# localStorage, never tied to an officer identity.

class VisitRequest(BaseModel):
    client_id: str = Field(min_length=8, max_length=64)
    path:      str = Field(min_length=1, max_length=200)
    referrer:  Optional[str] = Field(default=None, max_length=200)

@app.post("/api/analytics/visit")
async def record_visit(body: VisitRequest, request: Request):
    capp = _try_catalyst_app(request)
    _record_visit(body.client_id, body.path, body.referrer, capp)
    return {"status": "ok"}

@app.get("/api/analytics/summary")
async def analytics_summary(request: Request):
    require_session(request)  # aggregate traffic is operational info, not public
    today = pd.Timestamp.now().strftime("%Y-%m-%d")
    by_day = sorted(_VISIT_BY_DAY.items())[-14:]
    return {
        "total_visits": _VISIT_TOTAL,
        "unique_visitors": len(_VISIT_UNIQUE_CLIENTS),
        "today_visits": _VISIT_BY_DAY.get(today, 0),
        "by_day": [{"date": d, "visits": c} for d, c in by_day],
        "top_paths": [{"path": p, "visits": c} for p, c in _VISIT_BY_PATH.most_common(5)],
        "note": "Counters reset on process restart/redeploy; every visit is also durably logged to the VisitEvents NoSQL table.",
    }

# ─── POST /api/admin/seed-datastore ───────────────────────────────────────────
# One-time bulk-loader that pushes backend/data/*.csv straight into Catalyst
# Data Store via the SDK's Table.insert_rows(), bypassing the console's CSV
# importer entirely (useful when the console upload UI rejects a file — wrong
# date format, encoding, or row-count limits are the usual causes). Guarded by
# a shared-secret header so it can't be triggered by an anonymous request.


class SeedChunkRequest(BaseModel):
    table: Literal["CrimeHead", "CaseMaster", "Accused", "ArrestSurrender"]
    offset: int = Field(default=0, ge=0)
    rows: list[dict] = Field(min_length=1, max_length=200)

@app.post("/api/admin/seed-datastore")
async def seed_datastore(body: SeedChunkRequest, request: Request):
    _require_admin_token(request)
    capp = _try_catalyst_app(request)
    if capp is None:
        raise HTTPException(400, "Catalyst Data Store is unavailable in this environment")

    try:
        table = capp.datastore().table(body.table)
        table.insert_rows(body.rows)
        next_offset = body.offset + len(body.rows)
        return {
            "table": body.table,
            "offset": body.offset,
            "inserted": len(body.rows),
            "next_offset": next_offset,
        }
    except Exception as exc:
        log.exception(f"seed_datastore failed for {body.table} at offset {body.offset}")
        raise HTTPException(502, f"Insert failed at offset {body.offset}")

# ─── POST /api/admin/reload-from-datastore ────────────────────────────────────
# On-demand refresh of the in-memory dataset from Catalyst Data Store via
# ZCQL, using this request's own Catalyst app instance (boot-time loading
# from Data Store isn't possible — see lifespan()/load_from_csv() above).

@app.post("/api/admin/reload-from-datastore")
async def reload_from_datastore(request: Request):
    _require_admin_token(request)
    capp = _try_catalyst_app(request)
    if capp is None:
        raise HTTPException(400, "Catalyst Data Store is unavailable in this environment")
    try:
        load_from_catalyst(capp)
        build_graph()
        asyncio.create_task(_refresh_network_analytics_background())
    except Exception as e:
        log.exception("reload_from_datastore failed")
        raise HTTPException(500, "Reload failed")
    return {"status": "ok", "cases": len(DB.cases), "graph_nodes": DB.graph.number_of_nodes()}

# ─── POST /api/auth/login ─────────────────────────────────────────────────────

@app.post("/api/auth/login")
async def auth_login(body: LoginRequest, request: Request):
    """
    Credentials are validated server-side only — badge/password pairs are never
    shipped to the client bundle. Looks up Catalyst Data Store's `Officers`
    table first (when deployed on Catalyst), then the local registry.
    """
    badge = body.badge.strip().upper()
    capp = _try_catalyst_app(request)
    officer = _lookup_officer(capp, badge)
    if not officer:
        raise HTTPException(401, "Invalid credentials")

    expected_hash = officer.get("password_hash") or officer.get("PasswordHash")
    if not expected_hash or not hmac.compare_digest(hash_password(body.password, _OFFICER_SALT), expected_hash):
        raise HTTPException(401, "Invalid credentials")

    clearance = officer.get("clearance") or officer.get("Clearance", "CLR-1")
    profile = {
        "badge":       badge,
        "name":        officer.get("name") or officer.get("Name"),
        "designation": officer.get("designation") or officer.get("Designation"),
        "station":     officer.get("station") or officer.get("Station"),
        "clearance":   clearance,
        "node":        officer.get("node") or officer.get("Node"),
        **_permissions_for(clearance),
    }
    token = sign_session({"badge": badge, "clearance": clearance})
    return {"officer": profile, "token": token}

# ─── POST /api/translate (Zia Translate) ──────────────────────────────────────

@app.post("/api/translate")
async def translate(body: TranslateRequest, request: Request):
    """
    Translates dynamic case narrative text (not static UI chrome, which is
    already hand-translated in the frontend's i18n dictionary).

    NOTE: verified against zcatalyst-sdk 1.4.0 (the latest on PyPI) — the
    `Zia` component has NO `translate()` method at all (confirmed by reading
    the installed package's zia.py and by the Catalyst console's own Zia
    page, which lists only Face Analytics/OCR/Identity Scanner/Image
    Moderation/Object Recognition/Barcode Scanner/AutoML/Text Analytics —
    no Translate). Zia Translate is not a real capability of this SDK/plan,
    so this always falls back to passthrough (untranslated) text. A working
    translation would need a different service entirely (e.g. an external
    translation API), not a code fix here.
    """
    return {"translations": body.texts, "source": "fallback"}

# ─── GET /api/kpis ────────────────────────────────────────────────────────────

@app.get("/api/kpis")
async def get_kpis(
    request: Request,
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")

    capp = _try_catalyst_app(request)
    cache_key = f"kpis:{district_id}:{station_id}"
    cached = cache_get(capp, cache_key)
    if cached is not None:
        return cached

    cases = _scope_filter(DB.cases, district_id, station_id)
    case_ids = None if (district_id is None and station_id is None) else set(cases["CaseMasterID"])
    arrests = DB.arrests if case_ids is None else DB.arrests[DB.arrests["CaseMasterID"].isin(case_ids)]

    total     = len(cases)
    high_risk = int((cases["GravityOffenceID"] >= 4).sum())
    # Share of cases with at least one arrest — the same definition used by
    # /api/districts/{id}/summary, so the KPI and the drill-down agree.
    cases_with_arrest = int(arrests["CaseMasterID"].nunique()) if not arrests.empty else 0
    arrest_rate = round(cases_with_arrest / max(total, 1) * 100, 1)
    anomalies = _compute_anomalies(cases)
    volatility = round(sum(a["z_score"] for a in anomalies) / len(anomalies), 2) if anomalies else 0.0

    def sparkline(series: pd.Series) -> list[int]:
        try:
            counts = pd.to_datetime(series).dt.to_period("M").value_counts().sort_index()
            vals = counts.tail(12).values.tolist()
            return [int(v) for v in vals] if vals else [0] * 12
        except Exception:
            return [0] * 12

    def month_delta(spark: list[int]) -> tuple[str, str]:
        """Month-over-month change from the last two sparkline buckets."""
        if len(spark) < 2 or spark[-2] == 0:
            return "0.0%", "down"
        change = (spark[-1] - spark[-2]) / spark[-2] * 100
        return f"{abs(change):.1f}%", ("up" if change >= 0 else "down")

    nodes_spark = sparkline(cases["CrimeRegisteredDate"])
    nodes_delta, nodes_trend = month_delta(nodes_spark)
    hotspot_spark = sparkline(cases.loc[cases["GravityOffenceID"] >= 4, "CrimeRegisteredDate"])
    hotspot_delta, hotspot_trend = month_delta(hotspot_spark)

    try:
        solved = pd.DataFrame({
            "month": pd.to_datetime(cases["CrimeRegisteredDate"]).dt.to_period("M"),
            "solved": cases["CaseMasterID"].isin(set(arrests["CaseMasterID"])) if not arrests.empty else False,
        })
        rates = (solved.groupby("month")["solved"].mean().sort_index().tail(12) * 100)
        arrest_spark = [int(round(v)) for v in rates.values.tolist()]
    except Exception:
        arrest_spark = []
    if not arrest_spark:
        arrest_spark = [int(round(arrest_rate))] * 12
    arrest_delta, arrest_trend = month_delta(arrest_spark)

    result = [
        {"id": "criminal-nodes", "label": "Criminal Nodes Analyzed",
         "value": f"{total:,}", "delta": nodes_delta, "trend": nodes_trend,
         "positive": nodes_trend == "down",
         "sparkline": nodes_spark, "accent": "electric"},
        {"id": "hotspot-alerts", "label": "Spatio-Temporal Hotspot Alerts",
         "value": str(high_risk), "delta": hotspot_delta, "trend": hotspot_trend,
         "positive": hotspot_trend == "down",
         "sparkline": hotspot_spark,
         "accent": "danger"},
        {"id": "risk-volatility", "label": "Causal Risk Volatility Index",
         "value": str(volatility), "delta": f"{len(anomalies)} active",
         "trend": "up" if anomalies else "down", "positive": not anomalies,
         "sparkline": ([round(a["z_score"] * 10) for a in anomalies[:12]] or [0] * 12),
         "accent": "danger" if anomalies else "electric"},
        {"id": "resource-readiness", "label": "Case Arrest Rate",
         "value": f"{arrest_rate}%", "delta": arrest_delta, "trend": arrest_trend,
         "positive": True,
         "sparkline": arrest_spark,
         "accent": "electric"},
    ]
    cache_set(capp, cache_key, result)
    return result

# ─── GET /api/hotspots ────────────────────────────────────────────────────────

@app.get("/api/hotspots")
async def get_hotspots(
    request: Request,
    gravity_min: int = Query(1, ge=1, le=5),
    limit: int = Query(300, le=1000),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")

    capp = _try_catalyst_app(request)
    cache_key = f"hotspots:{gravity_min}:{limit}:{district_id}:{station_id}"
    cached = cache_get(capp, cache_key)
    if cached is not None:
        return cached

    scoped = _scope_filter(DB.cases, district_id, station_id)
    df = scoped[scoped["GravityOffenceID"] >= gravity_min].copy()
    if not DB.crime_heads.empty:
        df = df.merge(DB.crime_heads[["CrimeHeadID", "CrimeGroupName"]],
                      left_on="CrimeMajorHeadID", right_on="CrimeHeadID", how="left")
    else:
        df["CrimeGroupName"] = "Unknown"

    max_g = df["GravityOffenceID"].max()
    df["intensity"] = (df["GravityOffenceID"] / max_g).round(2)
    df["risk"] = df["GravityOffenceID"].map(
        lambda g: "high" if g >= 4 else ("med" if g == 3 else "low"))

    results = []
    # head() returns the first rows of the file, which at statewide scope are
    # all Bengaluru (it holds ~80% of cases) — sample so every district shows.
    subset = df.sample(n=limit, random_state=42) if len(df) > limit else df
    for _, row in subset.iterrows():
        sid = int(row["PoliceStationID"])
        factors = _station_factors(sid)
        results.append({
            "id":           f"HS-{int(row['CaseMasterID'])}",
            "lat":          float(row["latitude"]),
            "lng":          float(row["longitude"]),
            "intensity":    float(row["intensity"]),
            "risk":         row["risk"],
            "label":        str(row.get("CrimeGroupName", "Unknown")),
            "crime_type":   str(row.get("CrimeGroupName", "Unknown")),
            "causal_driver": _causal_narrative(sid, int(row["GravityOffenceID"])),
            "station_id":    sid,
            "station_name":  station_name(sid),
            "patrol_density": factors["patrol_density"],
            "infra_health":   factors["infra_health"],
            "commercial_density": factors["commercial_density"],
            "_x": 50.0, "_y": 50.0,
        })
    cache_set(capp, cache_key, results)
    return results

# ─── GET /api/patrols (synthetic Hoysala fleet) ────────────────────────

@app.get("/api/patrols")
async def get_patrols():
    return _patrol_units()

# ─── GET /api/hotspots/forecast (predictive risk layer) ───────────────

@app.get("/api/hotspots/forecast")
async def get_hotspots_forecast(
    request: Request,
    horizon_days: int = Query(30, ge=7, le=90),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    """
    Per-station forecast using DEPLOYED_FORECAST_MODEL (default: linear trend
    over monthly incident counts, via numpy.polyfit), projected forward
    `horizon_days`. This is a simple trend model, not a full time-series/ML
    forecast — labeled as such via the `model` field, and backed by a
    measured backtest against baselines at /api/hotspots/forecast/backtest
    rather than an unverified claim of accuracy.
    """
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    df = _scope_filter(DB.cases, district_id, station_id)
    monthly = _monthly_counts_by_station(df)
    if not monthly:
        return []
    model_fn = FORECAST_MODELS.get(DEPLOYED_FORECAST_MODEL, _forecast_linear_trend)
    max_hist = float(max((s.values.max() for s in monthly.values()), default=1)) or 1.0
    results = []
    for sid, series in monthly.items():
        if len(series) < 3:
            continue
        y = series.values.astype(float)
        next_val = model_fn(y)
        baseline = float(y[-3:].mean()) or 1.0
        trend_pct = round(((next_val - baseline) / baseline) * 100, 1)
        std = _residual_std(model_fn, y)
        ci = [round(max(0.0, next_val - 1.645 * std), 1), round(next_val + 1.645 * std, 1)]

        station_rows = df[df["PoliceStationID"] == sid]
        if station_rows.empty:
            continue
        results.append({
            "station_id":          int(sid),
            "station_name":        station_name(int(sid)),
            "lat":                 float(station_rows["latitude"].mean()),
            "lng":                 float(station_rows["longitude"].mean()),
            "predicted_intensity": round(min(1.0, next_val / max_hist), 2),
            "predicted_count":     round(next_val, 1),
            "confidence_interval": ci,
            "trend_pct":           trend_pct,
            "horizon_days":        horizon_days,
            "training_window_months": len(series),
            "model":               DEPLOYED_FORECAST_MODEL,
        })
    return sorted(results, key=lambda r: r["predicted_intensity"], reverse=True)[:100]

# ─── GET /api/hotspots/forecast/backtest (Phase 4 model validation) ──────────

@app.get("/api/hotspots/forecast/backtest")
async def get_forecast_backtest(
    request: Request,
    test_months: int = Query(3, ge=1, le=12),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    capp = _try_catalyst_app(request)
    cache_key = f"forecast_backtest:{test_months}:{district_id}:{station_id}"
    cached = cache_get(capp, cache_key)
    if cached is not None:
        return cached
    df = _scope_filter(DB.cases, district_id, station_id)
    result = _backtest_forecast_models(df, test_months=test_months)
    cache_set(capp, cache_key, result, ttl=300)
    return result

# ─── GET /api/anomalies (Zia-style anomaly detection) ────────────────

@app.get("/api/anomalies")
async def get_anomalies(
    request: Request,
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    capp = _try_catalyst_app(request)
    cache_key = f"anomalies:{district_id}:{station_id}"
    cached = cache_get(capp, cache_key)
    if cached is not None:
        return cached
    result = _compute_anomalies(_scope_filter(DB.cases, district_id, station_id))
    cache_set(capp, cache_key, result)
    return result

# ─── POST /api/ask (Ask Garuda — QuickML-planned, backend-executed tools) ─────

class AskRequest(BaseModel):
    query: str

class AgentPlan(BaseModel):
    action: Literal[
        "search_cases", "show_hotspots", "investigate_network",
        "compare_districts", "summarize_trends", "find_connection",
        "rank_offenders", "explain_correlations", "case_brief",
        "assess_case_risk", "summarize_kpis", "forecast_hotspots",
        "app_help", "out_of_scope",
    ] = "search_cases"
    crime_type: Optional[str] = None
    area: Optional[str] = None
    district_ids: Optional[list[int]] = Field(default=None, max_length=4)
    case_id: Optional[int] = Field(default=None, ge=1)
    case_reference: Optional[str] = None
    horizon_days: int = Field(default=30, ge=7, le=90)
    suspect_a: Optional[str] = None
    suspect_b: Optional[str] = None
    time_window: Literal["today", "this_week", "last_month", "last_30_days", "this_year", "all"] = "all"
    language: Literal["en", "kn"] = "en"
    confidence: float = Field(default=0.5, ge=0, le=1)

    @field_validator("time_window", mode="before")
    @classmethod
    def _normalize_time_window(cls, value):
        return "last_30_days" if value == "this_month" else value

    @field_validator("district_ids")
    @classmethod
    def _drop_unknown_districts(cls, v: Optional[list[int]]) -> Optional[list[int]]:
        """The planner (LLM or rules) is advisory only — any district id it
        names must still exist in our own reference data before a tool runs."""
        if not v:
            return None
        valid = {d.district_id for d in KARNATAKA_DISTRICTS}
        cleaned = [d for d in v if d in valid][:4]
        return cleaned or None

QUICKML_ENDPOINT = os.environ.get("QUICKML_LLM_ENDPOINT", "").strip()
QUICKML_ENDPOINT_KEY = os.environ.get("QUICKML_ENDPOINT_KEY", "").strip()
QUICKML_ACCESS_TOKEN = os.environ.get("QUICKML_ACCESS_TOKEN", "").strip()
QUICKML_ORG_ID = os.environ.get("QUICKML_ORG_ID", "").strip()
QUICKML_MODEL = os.environ.get("QUICKML_MODEL", "").strip()
QUICKML_TIMEOUT_SECONDS = float(os.environ.get("QUICKML_TIMEOUT_SECONDS", "30"))
QUICKML_MAX_TOKENS = int(os.environ.get("QUICKML_MAX_TOKENS", "1600"))
# Catalyst Connections manages this OAuth relationship server-side (auto-refreshed,
# no static token to expire) — preferred over QUICKML_ACCESS_TOKEN below, which is
# kept only as a fallback for local/non-Catalyst dev where Connections isn't reachable.
QUICKML_CONNECTION_LINK_NAME = os.environ.get("QUICKML_CONNECTION_LINK_NAME", "garudaquickml").strip()

def _normalize_connection_headers(response: dict) -> Optional[dict]:
    details = response.get("connections") or response
    headers = {
        str(key): str(value)
        for key, value in (details.get("headers") or {}).items()
        if value
    }
    parameters = details.get("parameters") or {}
    lower_parameters = {str(key).lower().replace("-", "_"): value for key, value in parameters.items()}

    if not any(key.lower() == "authorization" for key in headers):
        token = next((lower_parameters.get(key) for key in (
            "authorization", "access_token", "oauth_token", "token", "auth",
        ) if lower_parameters.get(key)), None)
        if token:
            token = str(token)
            headers["Authorization"] = token if " " in token else f"Zoho-oauthtoken {token}"

    if not any(key.lower() == "catalyst-org" for key in headers):
        org_id = next((
            value for key, value in lower_parameters.items()
            if value and key in {"catalyst_org", "org", "org_id", "zaid"}
        ), None) or os.environ.get("X_ZOHO_CATALYST_ORG_ID") or QUICKML_ORG_ID
        if org_id:
            headers["CATALYST-ORG"] = str(org_id)

    has_authorization = any(key.lower() == "authorization" for key in headers)
    has_org = any(key.lower() == "catalyst-org" for key in headers)
    return headers if has_authorization and has_org else None

def _quickml_connection_headers(capp) -> Optional[dict]:
    if capp is None:
        log.info("QuickML Connections skipped: no Catalyst app context for this request")
        return None
    if not QUICKML_CONNECTION_LINK_NAME:
        log.info("QuickML Connections skipped: QUICKML_CONNECTION_LINK_NAME is unset")
        return None
    try:
        resp = capp.connections().get_connection_credentials(QUICKML_CONNECTION_LINK_NAME) or {}
        headers = _normalize_connection_headers(resp)
        if not headers:
            details = resp.get("connections") or resp
            log.info(
                "QuickML Connections returned incomplete credentials: response keys=%s, "
                "header keys=%s, parameter keys=%s",
                sorted(resp), sorted((details.get("headers") or {}).keys()),
                sorted((details.get("parameters") or {}).keys()),
            )
        return headers
    except Exception as exc:
        # Temporarily logged at info (not debug) to diagnose a live fallback issue;
        # LOG_LEVEL env var is currently a no-op (basicConfig hardcodes INFO), so
        # debug-level messages never reach Catalyst's Application logs.
        log.info(f"QuickML Connections lookup unavailable, falling back to static token: {exc}")
        return None

def _extract_quickml_text(payload) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        for item in payload:
            text = _extract_quickml_text(item)
            if text:
                return text
        return ""
    if isinstance(payload, dict):
        for key in (
            "generated_text", "response", "output", "content", "text",
            "reasoning_content", "message", "data", "choices",
        ):
            if key in payload:
                text = _extract_quickml_text(payload[key])
                if text:
                    return text
    return ""

def _parse_plan_json(text: str) -> AgentPlan:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    candidate = fenced.group(1) if fenced else text[text.find("{"):text.rfind("}") + 1]
    if not candidate:
        raise ValueError("QuickML response did not contain a JSON object")
    plan_data = json.loads(candidate)
    for field in ("horizon_days", "time_window", "language", "confidence"):
        if plan_data.get(field) is None:
            plan_data.pop(field, None)
    # Pydantic rejects any `action` outside the Literal allowlist above (and
    # silently drops unrecognized fields) — this is the enforcement point
    # that stops a malformed or adversarial LLM response from ever reaching
    # a tool: only a validated AgentPlan is allowed past this line.
    return AgentPlan.model_validate(plan_data)

def _quickml_plan_sync(query: str, capp=None) -> AgentPlan:
    if not QUICKML_ENDPOINT or not QUICKML_MODEL:
        raise RuntimeError("QuickML LLM configuration is incomplete")
    connection_headers = _quickml_connection_headers(capp)
    if not connection_headers and not (QUICKML_ACCESS_TOKEN and QUICKML_ORG_ID):
        raise RuntimeError("QuickML LLM configuration is incomplete")

    system_prompt = """You are the intent planner for Project Garuda, a Karnataka police decision-support prototype.
Interpret the English or Kannada request. Return JSON only, with no markdown or explanation.
Schema:
{"action":"search_cases|show_hotspots|investigate_network|compare_districts|summarize_trends|find_connection|rank_offenders|explain_correlations|case_brief|assess_case_risk|summarize_kpis|forecast_hotspots|app_help|out_of_scope",
  "crime_type":string|null,"area":string|null,"district_ids":number[]|null,
    "case_id":number|null,"case_reference":string|null,"horizon_days":number,"suspect_a":string|null,"suspect_b":string|null,
  "time_window":"today|this_week|last_month|last_30_days|this_year|all","language":"en|kn","confidence":number}
Tool guide: search_cases/show_hotspots/investigate_network filter the case list; compare_districts needs 2+ district_ids;
summarize_trends reports rising/falling activity; find_connection needs suspect_a and suspect_b (person names);
rank_offenders ranks suspects by network centrality; explain_correlations explains why an area looks risky.
Use investigate_network for repeat-accused or shared-case network searches without two named people.
Use find_connection only when the request names exactly two people to connect.
case_brief and assess_case_risk require a numeric case_id; summarize_kpis reports dashboard metrics;
forecast_hotspots predicts station trends for 7-90 days; app_help explains navigation and workflows.
Use out_of_scope for requests unrelated to police cases, crime patterns, hotspots, suspects, or operational intelligence.
Represent "this month" as time_window="last_30_days".
Never invent a crime type, area, district, or suspect name that isn't in the request. Use null only for nullable fields.
Always provide horizon_days, time_window, language, and confidence using the schema types shown above.
This plan is advisory and will be validated before any tool runs."""
    district_reference = ", ".join(
        f"{district.name}={district.district_id}" for district in KARNATAKA_DISTRICTS
    )
    system_prompt += f"\nKnown district IDs: {district_reference}. Use only these IDs."
    # Request/response shape confirmed empirically against the live Console's
    # "Sample Request and Response" panel for the deployed LLM Serving model
    # (an OpenAI-style chat-completion contract, NOT the flat "prompt" field
    # an earlier version of this integration assumed) — see QUICKML_INTEGRATION.md.
    body = {
        "model": QUICKML_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ],
        "max_tokens": QUICKML_MAX_TOKENS,
        "temperature": 0.1,
        "stream": False,
    }
    headers = {"Content-Type": "application/json"}
    if connection_headers:
        headers.update(connection_headers)
    else:
        headers["Authorization"] = f"Zoho-oauthtoken {QUICKML_ACCESS_TOKEN}"
        headers["CATALYST-ORG"] = QUICKML_ORG_ID
    if QUICKML_ENDPOINT_KEY:
        headers["X-QUICKML-ENDPOINT-KEY"] = QUICKML_ENDPOINT_KEY
    request = urllib.request.Request(
        QUICKML_ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=QUICKML_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"QuickML returned HTTP {exc.code}: {detail}") from exc
    return _parse_plan_json(_extract_quickml_text(payload))

def _is_app_help_query(query: str) -> bool:
    q = query.casefold().strip()
    help_phrases = (
        "what can i ask", "what questions", "help me use", "how do i", "how to",
        "where can i", "where is", "navigate", "open the", "go to", "what is garuda",
    )
    app_topics = (
        "garuda", "dashboard", "map", "report", "fir", "incident", "scan", "upload",
        "simulator", "planner", "scenario", "setting", "theme", "language", "profile",
        "analytics", "export", "brief", "district scope", "connection", "kingpin",
    )
    direct_workflows = (
        "scan fir", "upload fir", "add incident", "file incident", "export brief",
        "export intelligence brief", "show patrol", "assign case", "close case",
        "change case status", "change theme", "switch language", "run simulator",
    )
    return (
        any(phrase in q for phrase in help_phrases) and any(topic in q for topic in app_topics)
    ) or any(phrase in q for phrase in direct_workflows)

def _is_domain_query(query: str) -> bool:
    q = query.casefold().strip()
    if _is_app_help_query(query):
        return True
    domain_terms = (
        "case", "crime", "criminal", "fir", "incident", "offender", "suspect", "accused",
        "arrest", "theft", "robbery", "assault", "narcotic", "cyber", "fraud",
        "murder", "homicide", "police", "station", "hotspot", "risk", "anomal",
        "network", "connection", "link", "linked", "patrol", "district", "trend", "forecast",
        "predict", "kpi", "dashboard", "garuda", "simulator", "scenario", "report",
        "scan", "upload", "export", "brief", "setting", "theme", "language", "analytics",
        "ಪ್ರಕರಣ", "ಅಪರಾಧ", "ಆರೋಪಿ", "ಬಂಧನ", "ಪೊಲೀಸ್", "ಹಾಟ್‌ಸ್ಪಾಟ್", "ಅಪಾಯ",
    )
    if any(term in q for term in domain_terms):
        return True
    if any(d.name.casefold() in q or d.name.split()[0].casefold() in q for d in KARNATAKA_DISTRICTS):
        return True
    if any(area.casefold() in q for area in BENGALURU_AREAS):
        return True
    if not DB.crime_heads.empty:
        for name in DB.crime_heads["CrimeGroupName"].dropna().astype(str):
            words = [word.casefold() for word in re.findall(r"[A-Za-z]{4,}", name)]
            if name.casefold() in q or any(word in q for word in words):
                return True
    return False

def _rule_plan(query: str) -> AgentPlan:
    """Deterministic fallback planner — always available, no external call.
    Keyword rules are checked most-specific-first so e.g. a query naming two
    suspects wins over a generic network/hotspot keyword match."""
    q = query.lower().strip()
    language = "kn" if re.search(r"[\u0c80-\u0cff]", query) else "en"

    district_ids = [d.district_id for d in KARNATAKA_DISTRICTS if d.name.lower() in q or d.name.split()[0].lower() in q]
    case_match = re.search(r"\b(?:case|fir)(?:\s+(?:id|number|no\.?))?\s*[:#-]?\s*(\d+)\b", q)
    case_id = int(case_match.group(1)) if case_match else None
    case_reference_match = re.search(r"\b[A-Z]{2,5}(?:[-/][A-Z0-9]{2,12}){2,4}\b", query, re.IGNORECASE)
    case_reference = case_reference_match.group(0) if case_reference_match else None
    horizon_match = re.search(r"\b(\d{1,2})\s*(?:day|days)\b", q)
    horizon_days = max(7, min(90, int(horizon_match.group(1)))) if horizon_match else 30

    suspect_a = suspect_b = None
    connection_trigger = any(term in q for term in ("connection between", "connect", "linked to", "ಸಂಪರ್ಕ"))
    match = re.search(r"between\s+(.+?)\s+and\s+(.+?)(?:[.?!]|$)", q)
    if connection_trigger and match:
        suspect_a, suspect_b = match.group(1).strip(), match.group(2).strip()

    if _is_app_help_query(query):
        action = "app_help"
    elif not _is_domain_query(query):
        action = "out_of_scope"
    elif (case_id is not None or case_reference is not None) and any(term in q for term in ("risk", "score", "assess")):
        action = "assess_case_risk"
    elif (case_id is not None or case_reference is not None) and any(term in q for term in ("brief", "detail", "summary", "summar")):
        action = "case_brief"
    elif any(term in q for term in ("forecast", "predicted hotspot", "predict hotspot", "likely to rise")):
        action = "forecast_hotspots"
    elif any(term in q for term in ("kpi", "dashboard metric", "overview", "anomal", "how many cases", "case count", "arrest rate")):
        action = "summarize_kpis"
    elif suspect_a and suspect_b:
        action = "find_connection"
    elif len(district_ids) >= 2 and any(term in q for term in ("compare", "vs", "versus", "ಹೋಲಿಸಿ")):
        action = "compare_districts"
    elif any(term in q for term in ("kingpin", "top offender", "most connected", "rank", "ಪ್ರಮುಖ ಅಪರಾಧಿ", "ಟಾಪ್")):
        action = "rank_offenders"
    elif any(term in q for term in ("why", "cause", "correlat", "ಏಕೆ", "ಕಾರಣ")):
        action = "explain_correlations"
    elif any(term in q for term in ("trend", "summar", "ಪ್ರವೃತ್ತಿ", "ಸಾರಾಂಶ")):
        action = "summarize_trends"
    elif any(word in q for word in ("network", "link", "repeat", "ಸಂಪರ್ಕ")):
        action = "investigate_network"
    elif (
        any(word in q for word in ("hotspot", "risk area", "risk zone", "ಹಾಟ್‌ಸ್ಪಾಟ್", "ಅಪಾಯ ಪ್ರದೇಶ"))
        or (any(term in q for term in ("high-risk", "high risk")) and any(term in q for term in ("area", "zone", "station")))
    ):
        action = "show_hotspots"
    else:
        action = "search_cases"

    if "today" in q or "ಇಂದು" in q:
        time_window = "today"
    elif "this week" in q or "ಈ ವಾರ" in q:
        time_window = "this_week"
    elif "last month" in q or "ಕಳೆದ ತಿಂಗಳು" in q:
        time_window = "last_month"
    elif any(term in q for term in ("this month", "last 30 days", "month", "ಈ ತಿಂಗಳು")):
        time_window = "last_30_days"
    elif "this year" in q or "ಈ ವರ್ಷ" in q:
        time_window = "this_year"
    else:
        time_window = "all"

    return AgentPlan(
        action=action, time_window=time_window, language=language,
        confidence=0.95 if action == "out_of_scope" else 0.45,
        district_ids=district_ids or None, case_id=case_id, case_reference=case_reference,
        horizon_days=horizon_days,
        suspect_a=suspect_a, suspect_b=suspect_b,
    )

def _resolve_suspect_by_name(name: Optional[str]) -> Optional[str]:
    """Best-effort name -> co-offender-graph node id resolution (exact match
    first, then substring) for the find_connection tool. Curly apostrophes
    (Faker-generated names like "D'Alia" sometimes use U+2019) are normalized
    to straight ones so a typed query doesn't fail on punctuation alone."""
    if not name or DB.graph.number_of_nodes() == 0:
        return None

    def _normalize(s: str) -> str:
        return s.strip().casefold().replace("\u2019", "'").replace("\u2018", "'")

    norm = _normalize(name)
    if not norm:
        return None
    substring_hit = None
    for node_id, data in DB.graph.nodes(data=True):
        if data.get("type") != "Suspect":
            continue
        label = _normalize(str(data.get("label", "")))
        if label == norm:
            return node_id
        if substring_hit is None and (norm in label or label in norm):
            substring_hit = node_id
    return substring_hit

def _agent_search_cases(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    """Backs search_cases / show_hotspots / investigate_network — same
    underlying case filter, different `suggested_view` for the frontend."""
    q = query.lower().strip()
    df = DB.cases
    matched = df
    district_id = (plan.district_ids or [None])[0]
    if district_id is not None:
        matched = _scope_filter(matched, district_id=district_id)
    matched_crime = None
    if not DB.crime_heads.empty:
        for _, ch in DB.crime_heads.iterrows():
            name = str(ch["CrimeGroupName"])
            requested_crime = (plan.crime_type or "").lower()
            if (requested_crime and (name.lower() in requested_crime or requested_crime in name.lower())) or name.lower() in q or any(word in q for word in name.lower().split()):
                matched_crime = ch["CrimeHeadID"]
                matched = matched[matched["CrimeMajorHeadID"] == matched_crime]
                break

    matched_station = None
    requested_area = (plan.area or "").lower()
    for area_index, area_name in enumerate(BENGALURU_AREAS):
        area = area_name.lower()
        if area in q or (requested_area and (area in requested_area or requested_area in area)):
            station_ids = list(range(area_index + 1, 101, len(BENGALURU_AREAS)))
            matched_station = station_ids[0]
            matched = matched[matched["PoliceStationID"].isin(station_ids)]
            break

    trace.append({"step": "execute", "tool": plan.action,
                   "parameters": {"crime_type": plan.crime_type, "area": plan.area,
                                  "district_id": district_id, "time_window": plan.time_window}})

    latest_case_date = pd.to_datetime(DB.cases["CrimeRegisteredDate"], errors="coerce").max()
    now = min(pd.Timestamp.now(), latest_case_date) if pd.notna(latest_case_date) else pd.Timestamp.now()
    dates = pd.to_datetime(matched["CrimeRegisteredDate"], errors="coerce")
    if plan.time_window == "today":
        matched = matched[dates.dt.date == now.date()]
    elif plan.time_window == "this_week":
        matched = matched[dates >= now - pd.Timedelta(days=7)]
    elif plan.time_window == "last_month":
        matched = matched[(dates >= now - pd.Timedelta(days=60)) & (dates < now - pd.Timedelta(days=30))]
    elif plan.time_window == "last_30_days":
        matched = matched[dates >= now - pd.Timedelta(days=30)]
    elif plan.time_window == "this_year":
        matched = matched[dates >= now - pd.Timedelta(days=365)]

    hotspot_candidates = matched
    if plan.action == "show_hotspots":
        matched = matched[matched["GravityOffenceID"] >= 4]

    count = len(matched)
    trace.append({"step": "observe", "records_examined": int(len(df)), "result_count": count})

    if plan.action == "show_hotspots":
        station_counts = matched["PoliceStationID"].value_counts()
        top_stations = [
            f"{station_name(int(station_id))} ({int(station_count)})"
            for station_id, station_count in station_counts.head(3).items()
        ]
        period = {
            "today": "today", "this_week": "the last 7 days", "last_month": "the previous 30-day period",
            "last_30_days": "the last 30 days", "this_year": "the last 365 days", "all": "the available period",
        }[plan.time_window]
        crime_label = ""
        if matched_crime is not None and not DB.crime_heads.empty:
            crime_name = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == matched_crime, "CrimeGroupName"].iloc[0]
            crime_label = f" {crime_name}"
        if count == 0 and len(hotspot_candidates) > 0:
            candidate_stations = hotspot_candidates["PoliceStationID"].nunique()
            if plan.language == "kn":
                answer = f"{period} ಅವಧಿಯಲ್ಲಿ {len(hotspot_candidates)}{crime_label} ಪ್ರಕರಣಗಳು {candidate_stations} ಠಾಣೆಗಳಲ್ಲಿ ಕಂಡುಬಂದಿವೆ, ಆದರೆ ಯಾವುದೂ ಗರುಡದ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಮಿತಿ (ಗಂಭೀರತೆ 4-5) ತಲುಪಿಲ್ಲ."
            else:
                answer = f"Found {len(hotspot_candidates)}{crime_label} cases across {candidate_stations} stations in {period}, but none meet Garuda's high-risk threshold (gravity 4-5)."
        elif plan.language == "kn":
            answer = f"{period} ಅವಧಿಯಲ್ಲಿ {count} ಹೆಚ್ಚಿನ ಅಪಾಯದ{crime_label} ಪ್ರಕರಣಗಳು {len(station_counts)} ಠಾಣೆಗಳಲ್ಲಿ ಕಂಡುಬಂದಿವೆ."
        else:
            answer = f"Found {count} high-risk{crime_label} cases across {len(station_counts)} stations in {period}."
        if top_stations:
            answer += (" ಅತಿ ಹೆಚ್ಚು ಸಾಂದ್ರತೆ: " if plan.language == "kn" else " Highest concentrations: ") + ", ".join(top_stations) + "."
    elif plan.language == "kn":
        parts = [f"{count} ಹೊಂದಾಣಿಕೆಯ ಪ್ರಕರಣಗಳು ಕಂಡುಬಂದಿವೆ"]
        if matched_crime is not None and not DB.crime_heads.empty:
            crime_name = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == matched_crime, "CrimeGroupName"].iloc[0]
            parts.append(f"- {crime_name}")
        if matched_station is not None:
            parts.append(f"- {station_name(matched_station)}")
        answer = " ".join(parts) + "."
    else:
        parts = [f"Found {count} matching case{'s' if count != 1 else ''}"]
        if matched_crime is not None and not DB.crime_heads.empty:
            crime_name = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == matched_crime, "CrimeGroupName"].iloc[0]
            parts.append(f"of type {crime_name}")
        if matched_station is not None:
            parts.append(f"at {station_name(matched_station)}")
        answer = " ".join(parts) + "."
    trace.append({"step": "answer", "detail": answer})

    top = matched.sort_values("CrimeRegisteredDate", ascending=False).head(10)
    matched_cases = [
        {"id": str(row["CrimeNo"]), "date": str(row["CrimeRegisteredDate"]),
         "station": station_name(int(row["PoliceStationID"])),
         "gravity": int(row["GravityOffenceID"])}
        for _, row in top.iterrows()
    ]
    suggested_view = {"search_cases": "reports", "show_hotspots": "geospatial", "investigate_network": "network"}[plan.action]
    return {
        "answer": answer,
        "matched_cases": matched_cases,
        "suggested_view": suggested_view,
        "tool_calls": [{"tool": plan.action, "status": "completed", "result_count": count}],
    }

def _agent_investigate_network(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    result = _agent_rank_offenders(query, plan, trace)
    ranking = result.get("offender_ranking", [])
    if not ranking:
        ranking = [
            {
                "id": node_id, "label": data.get("label", node_id),
                "kingpin_score": 0.0, "case_count": int(DB.graph.degree(node_id)),
            }
            for node_id, data in DB.graph.nodes(data=True)
            if data.get("type") == "Suspect" and DB.graph.degree(node_id) > 1
        ]
        ranking.sort(key=lambda row: row["case_count"], reverse=True)
        ranking = ranking[:5]
        result["offender_ranking"] = ranking
    result["answer"] = (
        f"Found {len(ranking)} leading repeat-accused network records ranked by shared-case centrality. "
        "Open Connections to inspect their recorded links; rankings are investigative leads, not evidence."
    )
    result["tool_calls"] = [{
        "tool": "investigate_network", "status": "completed", "result_count": len(ranking),
    }]
    if trace and trace[-1].get("step") == "answer":
        trace[-1]["detail"] = result["answer"]
    return result

def _agent_out_of_scope(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    trace.append({"step": "observe", "detail": "The request is outside Garuda's crime-intelligence data and approved tools."})
    answer = (
        "ಈ ಪ್ರಶ್ನೆ ಗರುಡದ ಅಪರಾಧ ಗುಪ್ತಚರ ವ್ಯಾಪ್ತಿಗೆ ಹೊರತಾಗಿದೆ. ಪ್ರಕರಣಗಳು, ಹಾಟ್‌ಸ್ಪಾಟ್‌ಗಳು, ಪ್ರವೃತ್ತಿಗಳು ಅಥವಾ ಶಂಕಿತರ ಸಂಪರ್ಕಗಳ ಬಗ್ಗೆ ಕೇಳಿ."
        if plan.language == "kn"
        else "That question is outside Garuda's crime intelligence scope. Ask about cases, hotspots, trends, or suspect connections."
    )
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "dashboard", "tool_calls": [],
    }

def _agent_app_help(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    q = query.casefold()
    suggested_view = "dashboard"
    if any(term in q for term in ("scan", "upload", "add", "file", "report", "fir", "incident", "assign", "close")):
        suggested_view = "reports"
        answer = (
            "Open Reports. Use Scan FIR to create a reviewable draft from an image or PDF, or Add Incident for manual entry. "
            "Garuda never submits or changes a case from chat; review the form and submit it yourself."
        )
    elif any(term in q for term in ("connection", "network", "kingpin", "syndicate", "suspect")):
        suggested_view = "network"
        answer = "Open Connections to inspect suspect links, communities, ranked offenders, predicted leads, or a path between two suspects."
    elif any(term in q for term in ("simulator", "planner", "scenario")):
        suggested_view = "simulator"
        answer = "Open Planner to set patrol density, infrastructure health, and response readiness, then run the scenario. SI permission is required."
    elif any(term in q for term in ("map", "forecast", "predicted", "hotspot", "patrol")):
        suggested_view = "geospatial"
        answer = "Open Map to inspect historical hotspots, predicted station risk, patrol units, infrastructure, and station details."
    elif any(term in q for term in ("setting", "theme", "language", "profile", "analytics", "security")):
        suggested_view = "settings"
        answer = "Open Settings for theme, language, profile, integration status, visit analytics, and security information."
    elif "export" in q:
        answer = "Use Export Brief in the top bar to download a PDF computed from the current district scope and latest data."
    elif any(term in q for term in ("district scope", "change district", "district filter")):
        answer = "Use the district selector in the top bar. Dashboard metrics, maps, reports, and summaries then use that scope."
    else:
        answer = (
            "You can ask Garuda to search cases by crime, area, and time; find high-risk hotspots; summarize KPIs, anomalies, and trends; "
            "forecast rising stations; compare districts; brief or assess a case by numeric case ID; rank offenders; trace suspect connections; "
            "explain risk correlations; or show how to use the map, Reports, simulator, settings, FIR scan, and PDF export."
        )
    trace.append({"step": "execute", "tool": "app_help", "parameters": {"suggested_view": suggested_view}})
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": suggested_view,
        "tool_calls": [{"tool": "app_help", "status": "completed", "result_count": 1}],
    }

def _case_row(case_id: Optional[int], case_reference: Optional[str] = None):
    if case_id is not None:
        rows = DB.cases[DB.cases["CaseMasterID"].astype(int) == case_id]
    elif case_reference:
        normalized = case_reference.casefold().replace("-", "/")
        crime_numbers = DB.cases["CrimeNo"].astype(str).str.casefold().str.replace("-", "/", regex=False)
        rows = DB.cases[crime_numbers == normalized]
    else:
        return None
    return None if rows.empty else rows.iloc[0]

def _agent_case_brief(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    case = _case_row(plan.case_id, plan.case_reference)
    trace.append({"step": "execute", "tool": "case_brief", "parameters": {"case_id": plan.case_id, "case_reference": plan.case_reference}})
    if case is None:
        answer = "Specify a valid numeric case ID, for example: Brief case 1042."
        trace.append({"step": "answer", "detail": answer})
        return {
            "answer": answer, "matched_cases": [], "suggested_view": "reports",
            "tool_calls": [{"tool": "case_brief", "status": "unresolved", "result_count": 0}],
        }

    case_id = int(case["CaseMasterID"])
    station_id = int(case["PoliceStationID"])
    accused_count = int((DB.accused["CaseMasterID"].astype(int) == case_id).sum())
    crime_name = "Unknown"
    if not DB.crime_heads.empty:
        names = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == case["CrimeMajorHeadID"], "CrimeGroupName"]
        if not names.empty:
            crime_name = str(names.iloc[0])
    answer = (
        f"Case {case_id} ({case['CrimeNo']}) is a {crime_name} case registered on {case['CrimeRegisteredDate']} "
        f"at {station_name(station_id)}, with gravity {int(case['GravityOffenceID'])}/5 and {accused_count} accused record(s)."
    )
    trace.append({"step": "observe", "result_count": 1, "accused_count": accused_count})
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer,
        "matched_cases": [{
            "id": str(case["CrimeNo"]), "date": str(case["CrimeRegisteredDate"]),
            "station": station_name(station_id), "gravity": int(case["GravityOffenceID"]),
        }],
        "suggested_view": "reports",
        "tool_calls": [{"tool": "case_brief", "status": "completed", "result_count": 1}],
    }

def _agent_assess_case_risk(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    case = _case_row(plan.case_id, plan.case_reference)
    resolved_case_id = int(case["CaseMasterID"]) if case is not None else None
    trace.append({"step": "execute", "tool": "assess_case_risk", "parameters": {"case_id": resolved_case_id, "case_reference": plan.case_reference}})
    if resolved_case_id is None:
        answer = "Specify a valid numeric case ID, for example: Assess risk for case 1042."
        trace.append({"step": "answer", "detail": answer})
        return {
            "answer": answer, "matched_cases": [], "suggested_view": "reports",
            "tool_calls": [{"tool": "assess_case_risk", "status": "unresolved", "result_count": 0}],
        }
    features = _risk_features(resolved_case_id)
    prediction = _local_risk_prediction(features)
    answer = (
        f"Case {resolved_case_id} is {prediction['risk_class']} risk under Garuda's transparent local prototype model "
        f"(gravity {features['gravity_level']}/5, {features['repeat_accused_count']} repeat accused, "
        f"{features['arrest_rate_percent']}% arrest coverage). This is advisory and requires supervisor review."
    )
    trace.append({"step": "observe", "risk_class": prediction["risk_class"], "features": features})
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "reports",
        "tool_calls": [{"tool": "assess_case_risk", "status": "completed", "result_count": 1}],
    }

def _agent_summarize_kpis(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_id = (plan.district_ids or [None])[0]
    cases = _scope_filter(DB.cases, district_id=district_id) if district_id else DB.cases
    case_ids = set(cases["CaseMasterID"])
    arrests = DB.arrests[DB.arrests["CaseMasterID"].isin(case_ids)] if not DB.arrests.empty else DB.arrests
    total = len(cases)
    high_risk = int((cases["GravityOffenceID"] >= 4).sum())
    arrest_rate = round(arrests["CaseMasterID"].nunique() / max(total, 1) * 100, 1) if not arrests.empty else 0.0
    anomalies = _compute_anomalies(cases)
    district = district_by_id(district_id) if district_id else None
    scope = district.name if district else "Karnataka"
    answer = (
        f"{scope}: {total:,} cases, {high_risk:,} high-risk cases, {arrest_rate}% case arrest rate, "
        f"and {len(anomalies)} active station anomalies."
    )
    trace.append({"step": "execute", "tool": "summarize_kpis", "parameters": {"district_id": district_id}})
    trace.append({"step": "observe", "records_examined": total, "active_anomalies": len(anomalies)})
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "dashboard",
        "tool_calls": [{"tool": "summarize_kpis", "status": "completed", "result_count": total}],
    }

def _agent_forecast_hotspots(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_id = (plan.district_ids or [None])[0]
    cases = _scope_filter(DB.cases, district_id=district_id) if district_id else DB.cases
    monthly = _monthly_counts_by_station(cases)
    model_fn = FORECAST_MODELS.get(DEPLOYED_FORECAST_MODEL, _forecast_linear_trend)
    forecasts = []
    for station_id, series in monthly.items():
        if len(series) < 3:
            continue
        predicted = model_fn(series.values.astype(float))
        baseline = float(series.values[-3:].mean()) or 1.0
        forecasts.append({
            "station": station_name(station_id), "predicted": round(predicted, 1),
            "trend": round((predicted - baseline) / baseline * 100, 1),
        })
    asks_for_rise = any(term in query.casefold() for term in ("rise", "rising", "increase", "growth", "ಏರಿಕೆ"))
    if asks_for_rise:
        rising = [row for row in forecasts if row["trend"] > 0]
        top = sorted(rising or forecasts, key=lambda row: row["trend"], reverse=True)[:3]
    else:
        top = sorted(forecasts, key=lambda row: row["predicted"], reverse=True)[:3]
    district = district_by_id(district_id) if district_id else None
    scope = district.name if district else "Karnataka"
    if top:
        leaders = ", ".join(f"{row['station']} ({row['predicted']} cases, {row['trend']:+.1f}%)" for row in top)
        answer = f"Top {plan.horizon_days}-day station forecasts for {scope}: {leaders}. Forecasts are advisory trend estimates, not dispatch instructions."
    else:
        answer = f"There is not enough history to forecast stations for {scope}."
    trace.append({"step": "execute", "tool": "forecast_hotspots", "parameters": {"district_id": district_id, "horizon_days": plan.horizon_days}})
    trace.append({"step": "observe", "stations_forecast": len(forecasts), "model": DEPLOYED_FORECAST_MODEL})
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "geospatial",
        "tool_calls": [{"tool": "forecast_hotspots", "status": "completed", "result_count": len(forecasts)}],
    }

def _agent_compare_districts(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_ids = list(plan.district_ids or [])
    if not district_ids:
        q = query.lower()
        district_ids = [d.district_id for d in KARNATAKA_DISTRICTS if d.name.lower() in q][:4]
    district_ids = district_ids[:4]
    trace.append({"step": "execute", "tool": "compare_districts", "parameters": {"district_ids": district_ids}})

    rows = []
    for did in district_ids:
        d = district_by_id(did)
        if d is None:
            continue
        cases = _scope_filter(DB.cases, district_id=did)
        total = len(cases)
        case_ids = set(cases["CaseMasterID"])
        arrests = DB.arrests[DB.arrests["CaseMasterID"].isin(case_ids)] if not DB.arrests.empty else DB.arrests
        arrest_rate = round((arrests["CaseMasterID"].nunique() if not arrests.empty else 0) / max(total, 1) * 100, 1)
        rows.append({
            "district_id": did, "name": d.name, "total_cases": total,
            "high_risk_cases": int((cases["GravityOffenceID"] >= 4).sum()),
            "arrest_rate_percent": arrest_rate,
            "active_anomalies": len(_compute_anomalies(cases)),
        })
    trace.append({"step": "observe", "records_examined": sum(r["total_cases"] for r in rows), "districts_compared": len(rows)})

    if len(rows) < 2:
        answer = ("Name at least two Karnataka districts to compare." if plan.language == "en"
                  else "ಹೋಲಿಸಲು ಕನಿಷ್ಠ ಎರಡು ಜಿಲ್ಲೆಗಳನ್ನು ಹೆಸರಿಸಿ.")
    elif plan.language == "kn":
        answer = f"{len(rows)} ಜಿಲ್ಲೆಗಳ ಹೋಲಿಕೆ ಸಿದ್ಧವಾಗಿದೆ."
    else:
        answer = f"Compared {len(rows)} districts: {', '.join(r['name'] for r in rows)}."
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "reports",
        "district_comparison": rows,
        "tool_calls": [{"tool": "compare_districts", "status": "completed", "result_count": len(rows)}],
    }

def _agent_summarize_trends(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_id = (plan.district_ids or [None])[0]
    scoped = _scope_filter(DB.cases, district_id=district_id) if district_id else DB.cases
    trace.append({"step": "execute", "tool": "summarize_trends", "parameters": {"district_id": district_id}})

    anomalies = _compute_anomalies(scoped)
    monthly = _monthly_counts_by_station(scoped)
    total_series = None
    for s in monthly.values():
        total_series = s if total_series is None else total_series.add(s, fill_value=0)

    trend_pct = None
    if total_series is not None and len(total_series) >= 4:
        recent = float(total_series.iloc[-3:].mean())
        prior_window = total_series.iloc[-6:-3] if len(total_series) >= 6 else total_series.iloc[:-3]
        prior = float(prior_window.mean()) if len(prior_window) else recent
        trend_pct = round(((recent - prior) / prior) * 100, 1) if prior else None
    trace.append({"step": "observe", "records_examined": len(scoped), "active_anomalies": len(anomalies)})

    direction = "rising" if (trend_pct or 0) > 5 else ("falling" if (trend_pct or 0) < -5 else "stable")
    if plan.language == "kn":
        answer = f"ಇತ್ತೀಚಿನ ಪ್ರವೃತ್ತಿ: {direction}. {len(anomalies)} ಸಕ್ರಿಯ ಅಸಂಗತತೆಗಳು."
    else:
        pct_part = f" ({trend_pct:+.1f}% vs prior period)" if trend_pct is not None else ""
        answer = f"Recent trend is {direction}{pct_part}. {len(anomalies)} active anomalies detected."
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "dashboard",
        "trend_summary": {"trend_pct": trend_pct, "direction": direction, "active_anomalies": anomalies[:5]},
        "tool_calls": [{"tool": "summarize_trends", "status": "completed", "result_count": len(anomalies)}],
    }

def _agent_find_connection(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    a_id = _resolve_suspect_by_name(plan.suspect_a)
    b_id = _resolve_suspect_by_name(plan.suspect_b)
    trace.append({"step": "execute", "tool": "find_connection",
                   "parameters": {"suspect_a": plan.suspect_a, "suspect_b": plan.suspect_b}})

    if not a_id or not b_id:
        trace.append({"step": "observe", "detail": "Could not resolve one or both suspect names to a known record."})
        answer = ("Could not identify both suspects by name — try the exact record id in the Connections view."
                  if plan.language == "en" else "ಎರಡೂ ಶಂಕಿತರನ್ನು ಹೆಸರಿನಿಂದ ಗುರುತಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.")
        trace.append({"step": "answer", "detail": answer})
        return {
            "answer": answer, "matched_cases": [], "suggested_view": "network",
            "connection_result": {"connected": False, "path": []},
            "tool_calls": [{"tool": "find_connection", "status": "unresolved", "result_count": 0}],
        }

    try:
        path_nodes = nx.shortest_path(DB.co_graph, a_id, b_id)
        connected = True
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        path_nodes, connected = [], False
    trace.append({"step": "observe", "records_examined": DB.co_graph.number_of_nodes(),
                   "connected": connected, "hops": max(0, len(path_nodes) - 1)})

    if connected:
        answer = (f"Connected via {len(path_nodes) - 1} hop(s) of shared case history."
                  if plan.language == "en" else f"{len(path_nodes) - 1} ಹಂತಗಳ ಮೂಲಕ ಸಂಪರ್ಕಿಸಲಾಗಿದೆ.")
    else:
        answer = ("No recorded connection found between these two suspects."
                  if plan.language == "en" else "ಈ ಇಬ್ಬರು ಶಂಕಿತರ ನಡುವೆ ಸಂಪರ್ಕ ಕಂಡುಬಂದಿಲ್ಲ.")
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "network",
        "connection_result": {
            "connected": connected,
            "path": [{"id": n, "label": DB.graph.nodes[n].get("label", n)} for n in path_nodes],
        },
        "tool_calls": [{"tool": "find_connection", "status": "completed", "result_count": max(0, len(path_nodes) - 1)}],
    }

def _agent_rank_offenders(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_id = (plan.district_ids or [None])[0]
    trace.append({"step": "execute", "tool": "rank_offenders", "parameters": {"district_id": district_id, "limit": 5}})

    case_station = _case_station_map()
    rows = []
    for n in DB.co_graph.nodes:
        if district_id is not None:
            in_scope = any(
                (sid := case_station.get(cid)) is not None and district_of_station(sid).district_id == district_id
                for cid in _suspect_case_ids(n)
            )
            if not in_scope:
                continue
        rows.append({"id": n, "label": DB.graph.nodes[n].get("label", n),
                      "kingpin_score": _kingpin_score(n), "case_count": len(_suspect_case_ids(n))})
    rows.sort(key=lambda r: r["kingpin_score"], reverse=True)
    top = rows[:5]
    trace.append({"step": "observe", "records_examined": len(rows), "top_n": len(top)})

    answer = (f"ಟಾಪ್ {len(top)} ಶಂಕಿತರನ್ನು ಪ್ರಮುಖತೆ ಅಂಕದ ಪ್ರಕಾರ ಪಟ್ಟಿ ಮಾಡಲಾಗಿದೆ." if plan.language == "kn"
              else f"Ranked top {len(top)} suspects by kingpin score (network centrality).")
    trace.append({"step": "answer", "detail": answer})
    return {
        "answer": answer, "matched_cases": [], "suggested_view": "network",
        "offender_ranking": top,
        "tool_calls": [{"tool": "rank_offenders", "status": "completed", "result_count": len(top)}],
    }

def _agent_explain_correlations(query: str, plan: AgentPlan, trace: list[dict]) -> dict:
    district_id = (plan.district_ids or [None])[0]
    scoped = _scope_filter(DB.cases, district_id=district_id) if district_id else DB.cases
    trace.append({"step": "execute", "tool": "explain_correlations", "parameters": {"district_id": district_id}})

    if scoped.empty:
        answer = "No case data available for this scope." if plan.language == "en" else "ಈ ವ್ಯಾಪ್ತಿಗೆ ಯಾವುದೇ ಪ್ರಕರಣ ದತ್ತಾಂಶವಿಲ್ಲ."
        trace.append({"step": "answer", "detail": answer})
        return {"answer": answer, "matched_cases": [], "suggested_view": "dashboard", "tool_calls": []}

    top_station = int(scoped["PoliceStationID"].value_counts().idxmax())
    top_gravity = int(scoped.loc[scoped["PoliceStationID"] == top_station, "GravityOffenceID"].max())
    narrative = _causal_narrative(top_station, top_gravity)
    trace.append({"step": "observe", "records_examined": len(scoped), "station_id": top_station})
    trace.append({"step": "answer", "detail": narrative})
    return {
        "answer": narrative + (" (Association only, not a causal claim — verify against ground conditions.)"
                                if plan.language == "en" else " (ಇದು ಸಂಬಂಧವಷ್ಟೇ, ಕಾರಣವಲ್ಲ.)"),
        "matched_cases": [], "suggested_view": "geospatial",
        "correlation_explanation": {"station_id": top_station, "station_name": station_name(top_station), "narrative": narrative},
        "tool_calls": [{"tool": "explain_correlations", "status": "completed", "result_count": 1}],
    }

_AGENT_DISPATCH = {
    "search_cases":        _agent_search_cases,
    "show_hotspots":       _agent_search_cases,
    "investigate_network": _agent_investigate_network,
    "compare_districts":   _agent_compare_districts,
    "summarize_trends":    _agent_summarize_trends,
    "find_connection":     _agent_find_connection,
    "rank_offenders":      _agent_rank_offenders,
    "explain_correlations": _agent_explain_correlations,
    "case_brief":           _agent_case_brief,
    "assess_case_risk":     _agent_assess_case_risk,
    "summarize_kpis":       _agent_summarize_kpis,
    "forecast_hotspots":    _agent_forecast_hotspots,
    "app_help":             _agent_app_help,
    "out_of_scope":          _agent_out_of_scope,
}

_AGENT_AUDIT_LOG = logging.getLogger("garuda.audit")
_AGENT_AUDIT_NOSQL_TABLE = os.environ.get("AGENT_AUDIT_NOSQL_TABLE", "AgentAuditEvents").strip()

def _emit_agent_audit_event(
    source: str, plan: AgentPlan, officer_badge: Optional[str], result_count: Optional[int], capp=None
) -> None:
    """One structured, sanitized JSON line per agent call — no query text or
    case narrative is logged, only the validated plan and outcome shape.
    Written to both the local log (always) and Catalyst NoSQL (when running
    on Catalyst), so the reasoning trail survives AppSail restarts/redeploys
    and is queryable, not just grep-able from ephemeral container logs."""
    event = {
        "ts": pd.Timestamp.now().isoformat(),
        "officer": officer_badge,
        "source": source,
        "action": plan.action,
        "language": plan.language,
        "confidence": round(plan.confidence, 2),
        "result_count": result_count,
    }
    try:
        _AGENT_AUDIT_LOG.info(json.dumps(event))
    except Exception:
        log.debug("Agent audit event logging failed", exc_info=True)
    if capp is not None:
        try:
            capp.nosql().get_table(_AGENT_AUDIT_NOSQL_TABLE).insert_items({"item": {
                "event_id": str(uuid.uuid4()),
                "ts": event["ts"],
                "officer": officer_badge or "",
                "source": source,
                "action": plan.action,
                "language": plan.language,
                "confidence": str(event["confidence"]),
                "result_count": str(result_count) if result_count is not None else "",
            }})
        except Exception:
            log.debug("Agent audit NoSQL write failed", exc_info=True)

def _run_agent(
    query: str, plan: AgentPlan, source: Literal["quickml", "rules"],
    officer_badge: Optional[str] = None, capp=None,
) -> dict:
    """The visible plan -> execute -> observe -> answer loop. `trace` is
    returned to the client so the reasoning is inspectable, not just the
    final answer — every tool call is deterministic backend code; the
    planner (rules or QuickML) only ever selects from `_AGENT_DISPATCH`."""
    trace: list[dict] = [{
        "step": "interpret",
        "detail": f"Interpreted intent as '{plan.action}' (confidence {plan.confidence:.2f}, source={source}).",
    }]
    if DB.cases.empty:
        trace.append({"step": "answer", "detail": "No case data loaded."})
        return {"answer": "No case data loaded.", "matched_cases": [], "suggested_view": "reports", "source": source,
                "language": plan.language, "confidence": plan.confidence, "tool_calls": [], "trace": trace}

    handler = _AGENT_DISPATCH.get(plan.action, _agent_search_cases)
    result = handler(query, plan, trace)
    result["source"] = source
    result["language"] = plan.language
    result["confidence"] = round(plan.confidence, 2)
    result["trace"] = trace
    result_count = (result.get("tool_calls") or [{}])[0].get("result_count")
    _emit_agent_audit_event(source, plan, officer_badge, result_count, capp)
    return result

@app.post("/api/ask")
async def ask_garuda(body: AskRequest, request: Request):
    if not body.query.strip():
        raise HTTPException(400, "Empty query")
    officer = require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    capp = _try_catalyst_app(request)
    source: Literal["quickml", "rules"] = "rules"
    rules_plan = _rule_plan(body.query)
    deterministic_actions = {
        "app_help", "out_of_scope", "case_brief", "assess_case_risk",
        "summarize_kpis", "forecast_hotspots",
    }
    if rules_plan.action in deterministic_actions:
        plan = rules_plan
    else:
        try:
            plan = await asyncio.to_thread(_quickml_plan_sync, body.query.strip(), capp)
            source = "quickml"
        except Exception as exc:
            log.info(f"QuickML planner unavailable; using deterministic planner: {exc}")
            plan = _rule_plan(body.query)
    return _run_agent(body.query, plan, source, officer.get("badge"), capp)

@app.get("/api/agent/quickml-status")
async def get_quickml_status(request: Request):
    require_session(request)
    capp = _try_catalyst_app(request)
    result = {
        "endpoint_configured": bool(QUICKML_ENDPOINT),
        "model_configured": bool(QUICKML_MODEL),
        "connection_name_configured": bool(QUICKML_CONNECTION_LINK_NAME),
        "catalyst_app_context": capp is not None,
        "connection_response_keys": [],
        "connection_header_keys": [],
        "connection_parameter_keys": [],
        "normalized_authorization": False,
        "normalized_org": False,
        "status": "unavailable",
    }
    if capp is None or not QUICKML_CONNECTION_LINK_NAME:
        result["status"] = "missing_catalyst_context"
        return result
    try:
        response = capp.connections().get_connection_credentials(QUICKML_CONNECTION_LINK_NAME) or {}
        details = response.get("connections") or response
        result["connection_response_keys"] = sorted(str(key) for key in response)
        result["connection_header_keys"] = sorted(str(key) for key in (details.get("headers") or {}))
        result["connection_parameter_keys"] = sorted(str(key) for key in (details.get("parameters") or {}))
        normalized = _normalize_connection_headers(response) or {}
        result["normalized_authorization"] = any(key.lower() == "authorization" for key in normalized)
        result["normalized_org"] = any(key.lower() == "catalyst-org" for key in normalized)
        result["status"] = "ready" if normalized else "incomplete_credentials"
    except Exception as exc:
        result["status"] = "connection_error"
        result["error_type"] = type(exc).__name__
    return result

# ─── GET /api/agent/case-brief/{case_master_id} — case-briefing agent ────────
# Chains 4 existing tools (risk score, network centrality, causal context,
# comparable-case search) into one assembled brief with its own visible trace.

@app.get("/api/agent/case-brief/{case_master_id}")
async def get_case_brief(case_master_id: int, request: Request):
    require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")

    case_rows = DB.cases[DB.cases["CaseMasterID"].astype(int) == case_master_id]
    if case_rows.empty:
        raise HTTPException(404, "Case not found")
    case = case_rows.iloc[0]
    sid = int(case["PoliceStationID"])
    trace: list[dict] = [{"step": "execute", "tool": "load_case", "parameters": {"case_master_id": case_master_id}}]

    risk, risk_source = None, None
    try:
        features = _risk_features(case_master_id)
        capp = _try_catalyst_app(request)
        try:
            risk = _zia_risk_prediction(capp, features)
            risk_source = "zia_automl"
        except Exception:
            risk = _local_risk_prediction(features)
            risk_source = "local_fallback"
    except KeyError:
        pass
    trace.append({"step": "execute", "tool": "risk_score", "parameters": {"case_master_id": case_master_id}})
    trace.append({"step": "observe", "tool": "risk_score", "risk_source": risk_source})

    case_accused = DB.accused[DB.accused["CaseMasterID"].astype(int) == case_master_id]
    connected_suspects = []
    for _, row in case_accused.iterrows():
        identity = str(row["AccusedName"]).strip().casefold()
        node_id = f"A-{hashlib.sha1(identity.encode()).hexdigest()[:12]}"
        if node_id in DB.co_graph:
            connected_suspects.append({
                "id": node_id, "label": row["AccusedName"],
                "kingpin_score": _kingpin_score(node_id),
                "community_id": DB.community_of.get(node_id),
                "co_offender_count": DB.co_graph.degree(node_id),
            })
    trace.append({"step": "execute", "tool": "investigate_network", "parameters": {"case_master_id": case_master_id}})
    trace.append({"step": "observe", "tool": "investigate_network", "connected_suspects_found": len(connected_suspects)})

    causal_narrative = _causal_narrative(sid, int(case["GravityOffenceID"]))
    trace.append({"step": "execute", "tool": "explain_correlations", "parameters": {"station_id": sid}})

    comparable = DB.cases[
        (DB.cases["CrimeMajorHeadID"] == case["CrimeMajorHeadID"]) &
        (DB.cases["PoliceStationID"] == sid) &
        (DB.cases["CaseMasterID"].astype(int) != case_master_id)
    ].sort_values("CrimeRegisteredDate", ascending=False).head(5)
    trace.append({"step": "execute", "tool": "search_cases",
                   "parameters": {"crime_type_id": int(case["CrimeMajorHeadID"]), "station_id": sid}})
    trace.append({"step": "observe", "tool": "search_cases", "comparable_cases_found": len(comparable)})

    active_anomalies = [a for a in _compute_anomalies() if a["station_id"] == sid]

    crime_name = None
    if not DB.crime_heads.empty:
        match = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == case["CrimeMajorHeadID"], "CrimeGroupName"]
        crime_name = match.iloc[0] if not match.empty else None

    trace.append({"step": "answer", "detail": f"Assembled case brief for {case['CrimeNo']} from {len(trace)} chained tool calls."})
    return {
        "case_master_id": case_master_id,
        "crime_no": str(case["CrimeNo"]),
        "crime_type": crime_name,
        "station": station_name(sid),
        "date": str(case["CrimeRegisteredDate"]),
        "gravity": int(case["GravityOffenceID"]),
        "risk": risk,
        "risk_source": risk_source,
        "connected_suspects": connected_suspects,
        "causal_context": causal_narrative,
        "active_anomalies": active_anomalies,
        "comparable_cases": [
            {"case_master_id": int(r["CaseMasterID"]), "date": str(r["CrimeRegisteredDate"]), "gravity": int(r["GravityOffenceID"])}
            for _, r in comparable.iterrows()
        ],
        "trace": trace,
        "advisory": "Assembled from synthetic prototype data for supervisor review; not an enforcement decision.",
    }

# ─── POST /api/incidents/scan — OCR-assisted FIR intake draft ────────────────
# Uses Zia OCR (capp.zia().extract_optical_characters()) to read a photographed
# or scanned FIR document, then heuristically extracts fields matching
# IncidentIntakeRequest so the officer only has to REVIEW/correct a pre-filled
# form rather than retype it. This endpoint NEVER creates a case — it only
# returns a draft; the officer must still submit it via the existing
# POST /api/incidents, exactly like a manually-typed entry. Zia OCR returns
# plain text only (no structured fields, no bounding boxes — confirmed against
# the vendored SDK's ICatalystZiaOCR type), so every field below is a
# best-effort regex/keyword guess over that text, not a guaranteed match.
# Accuracy on handwritten or Kannada-script FIRs is unverified — flagged to
# the officer via `low_confidence_fields` rather than silently guessing wrong.

_FIR_NUMBER_RE = re.compile(r"\b([A-Z]{2,5}[\/\-][A-Za-z0-9]{2,10}[\/\-]\d{3,10})\b")
_SECTION_RE = re.compile(r"\b(?:U/S|SECTION|SEC)\.?\s*([\d,\s&/]+)\b", re.IGNORECASE)
_DATE_PATTERNS = (
    "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d", "%d %B %Y", "%d %b %Y",
)
# Common FIR-boilerplate words that a naive capitalized-phrase regex would
# otherwise mistake for a person's name (only used by the no-NER fallback).
_FIR_BOILERPLATE_WORDS = {
    "Police", "Station", "Date", "Registration", "Report", "Karnataka",
    "State", "District", "FIR", "Section", "Complainant", "Accused",
    "Crime", "Case", "Number", "No", "Under",
}

def _extract_fir_date(text: str) -> Optional[str]:
    for raw in re.findall(r"\b(\d{1,2}[-/.\s][A-Za-z0-9]{2,9}[-/.\s]\d{2,4})\b", text):
        for fmt in _DATE_PATTERNS:
            try:
                return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
    return None

def _extract_station_id(text: str) -> Optional[int]:
    """Fuzzy-match any known locality name (Bengaluru or statewide) against the
    OCR'd text. Localities are short and distinctive enough for a substring
    match to be a reasonable first-pass heuristic — not a claim of accuracy."""
    lowered = text.lower()
    for district in KARNATAKA_DISTRICTS:
        for offset, locality in enumerate(district.localities):
            if locality.lower() in lowered:
                return district.station_start + offset
    return None

def _extract_crime_head_id(text: str) -> Optional[int]:
    if DB.crime_heads.empty:
        return None
    lowered = text.lower()
    for _, row in DB.crime_heads.iterrows():
        name = str(row["CrimeGroupName"])
        if name.lower() in lowered or any(word.lower() in lowered for word in name.split() if len(word) > 4):
            return int(row["CrimeHeadID"])
    return None

def _extract_accused_names(text: str, capp) -> tuple[list[str], bool]:
    """Returns (names, used_ner). Tries Zia NER first (real entities beat
    regex guessing at picking out proper names); falls back to a
    capitalized-word-sequence heuristic when Zia is unavailable."""
    if capp is not None:
        try:
            entities = capp.zia().get_NER_prediction([text])
            names = [
                str(item.get("value") or item.get("text") or "").strip()
                for doc in (entities or []) for item in (doc.get("entities") or doc.get("data") or [])
                if str(item.get("type") or item.get("label") or "").upper() in ("PERSON", "PER", "NAME")
            ]
            names = [n for n in names if n]
            if names:
                return names[:10], True
        except Exception as exc:
            log.debug(f"Zia NER unavailable for FIR scan; using heuristic name extraction: {exc}")
    # No NER available — a naive capitalized-phrase regex without a stopword
    # filter would also catch document boilerplate ("Police Station", "Date
    # of Registration"), so this fallback is explicitly the weaker of the two
    # paths and is labelled `accused_names_source: "heuristic"` in the response.
    normalized = re.sub(r"\s+", " ", text)
    guesses = re.findall(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b", normalized)
    seen: list[str] = []
    for g in guesses:
        words = g.split()
        if any(w in _FIR_BOILERPLATE_WORDS for w in words):
            continue
        if g not in seen:
            seen.append(g)
    return seen[:10], False

@app.post("/api/incidents/scan")
async def scan_incident_document(request: Request, file: UploadFile = File(...)):
    """Runs Zia OCR + heuristic extraction over an uploaded FIR photo/scan and
    returns a DRAFT for the officer to review — it does not create a case."""
    require_session(request)
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "application/pdf"):
        raise HTTPException(400, "Upload a JPEG/PNG/WebP photo or a PDF scan")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (10MB limit)")

    capp = _try_catalyst_app(request)
    if capp is None:
        raise HTTPException(400, "OCR requires a Catalyst deployment (Zia is unavailable in local/dev mode)")

    try:
        ocr_result = capp.zia().extract_optical_characters(BytesIO(contents), {"language": "eng"})
    except Exception as exc:
        log.warning(f"Zia OCR failed: {exc}")
        raise HTTPException(502, "OCR extraction failed — try a clearer photo or enter the incident manually")

    text = str((ocr_result or {}).get("text") or "")
    if not text.strip():
        raise HTTPException(422, "No text could be read from this document — try a clearer photo")

    fir_match = _FIR_NUMBER_RE.search(text)
    section_match = _SECTION_RE.search(text)
    station_id = _extract_station_id(text)
    crime_head_id = _extract_crime_head_id(text)
    registered_date = _extract_fir_date(text)
    accused_names, used_ner = _extract_accused_names(text, capp)

    low_confidence_fields = [
        field for field, found in (
            ("crime_no", bool(fir_match)), ("registered_date", bool(registered_date)),
            ("police_station_id", station_id is not None), ("crime_major_head_id", crime_head_id is not None),
        ) if not found
    ]

    return {
        "draft": {
            "crime_no": fir_match.group(1) if fir_match else "",
            "registered_date": registered_date or datetime.now().strftime("%Y-%m-%d"),
            "police_station_id": station_id or 1,
            "crime_major_head_id": crime_head_id or 2,
            "gravity_offence_id": 3,
            "latitude": 12.9716,
            "longitude": 77.5946,
            "brief_facts": text.strip()[:1000],
            "accused_names": accused_names,
        },
        "ipc_sections": section_match.group(1).strip() if section_match else None,
        "low_confidence_fields": low_confidence_fields,
        "accused_names_source": "zia_ner" if used_ner else "heuristic",
        "ocr_confidence": (ocr_result or {}).get("confidence"),
        "raw_text": text.strip(),
        "advisory": "OCR-extracted draft for officer review — verify every field before submitting. Not a substitute for reading the original document.",
    }

# ─── POST /api/incidents — operational intake ─────────────────────────────────

@app.post("/api/incidents")
async def create_incident(body: IncidentIntakeRequest, request: Request):
    """Adds an officer-reviewed incident to the active intelligence session.

    This deliberately does not claim to register a statutory FIR. When the
    Catalyst Data Store is available, the normalized rows are persisted there;
    local development retains them only for the running API session.
    """
    officer = require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    if DB.crime_heads.empty or body.crime_major_head_id not in set(DB.crime_heads["CrimeHeadID"].astype(int)):
        raise HTTPException(400, "Unknown crime category")
    if DB.cases["CrimeNo"].astype(str).eq(body.crime_no.strip()).any():
        raise HTTPException(409, "An incident with this FIR / crime number already exists")

    registered_at = pd.to_datetime(body.registered_date, errors="coerce")
    if pd.isna(registered_at):
        raise HTTPException(400, "registered_date must be a valid ISO date")

    case_id = int(pd.to_numeric(DB.cases["CaseMasterID"], errors="coerce").max()) + 1
    case_row = {
        "CaseMasterID": case_id,
        "CrimeNo": body.crime_no.strip(),
        "CrimeRegisteredDate": registered_at.strftime("%Y-%m-%d"),
        "PoliceStationID": body.police_station_id,
        "CrimeMajorHeadID": body.crime_major_head_id,
        "GravityOffenceID": body.gravity_offence_id,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "BriefFacts": body.brief_facts.strip(),
    }
    accused_names = [name.strip() for name in body.accused_names if name.strip()]
    next_accused_id = int(pd.to_numeric(DB.accused["AccusedMasterID"], errors="coerce").max()) + 1 if not DB.accused.empty else 1
    accused_rows = [
        {
            "AccusedMasterID": next_accused_id + index,
            "CaseMasterID": case_id,
            "AccusedName": name,
            "AgeYear": None,
            "GenderID": None,
        }
        for index, name in enumerate(accused_names)
    ]

    persistence = "session"
    warning = "Stored for this active intelligence session; deploy with Catalyst Data Store to persist it."
    capp = _try_catalyst_app(request)
    if capp is not None:
        try:
            capp.datastore().table("CaseMaster").insert_rows([case_row])
            if accused_rows:
                capp.datastore().table("Accused").insert_rows(accused_rows)
            persistence = "datastore"
            warning = None
        except Exception as exc:
            log.warning(f"Incident intake Data Store write failed; keeping session record: {exc}")

    DB.cases = pd.concat([DB.cases, pd.DataFrame([case_row])], ignore_index=True)
    if accused_rows:
        DB.accused = pd.concat([DB.accused, pd.DataFrame(accused_rows)], ignore_index=True)
        _reset_risk_feature_cache()
    _assign_districts()
    build_graph()
    asyncio.create_task(_refresh_network_analytics_background())
    _LOCAL_CACHE.clear()

    return {
        "id": f"BLR-{case_row['CrimeNo']}",
        "case_master_id": case_id,
        "station": station_name(body.police_station_id),
        "accused_added": len(accused_rows),
        "submitted_by": officer["badge"],
        "persistence": persistence,
        "warning": warning,
    }

# ─── GET /api/network ─────────────────────────────────────────────────────────

@app.get("/api/network")
async def get_network(
    request: Request,
    cluster_size: int = Query(15, ge=5, le=50),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    require_permission(request, "canViewNetwork")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    if DB.graph.number_of_nodes() == 0:
        raise HTTPException(503, "Graph not built")

    G = DB.graph
    case_station = _case_station_map() if (district_id is not None or station_id is not None) else None

    def _fir_in_scope(fir_id: str) -> bool:
        if case_station is None:
            return True
        try:
            sid = case_station.get(int(fir_id.split("-", 1)[1]))
        except (IndexError, ValueError):
            return False
        if sid is None:
            return False
        if station_id is not None:
            return sid == station_id
        return district_of_station(sid).district_id == district_id

    suspects = [(n, d) for n, d in G.nodes(data=True) if d.get("type") == "Suspect"]
    if case_station is not None:
        suspects = [
            (n, d) for n, d in suspects
            if any(G.nodes[nb].get("type") == "FIR" and _fir_in_scope(nb) for nb in G.neighbors(n))
        ]
    top = sorted(suspects, key=lambda x: G.degree(x[0]), reverse=True)[:cluster_size]
    included = {n for n, _ in top}

    fir_nodes: set[str] = set()
    for n, _ in top:
        for nb in G.neighbors(n):
            if G.nodes[nb].get("type") == "FIR" and _fir_in_scope(nb):
                fir_nodes.add(nb)
    fir_nodes = set(list(fir_nodes)[:20])
    all_ids = included | fir_nodes

    nodes_out = [
        {"id": n, "label": G.nodes[n].get("label", n),
         "type": G.nodes[n].get("type", "Unknown"),
         "weight": G.nodes[n].get("weight", 1),
         "risk": G.nodes[n].get("risk"),
         "centrality": DB.centrality.get(n) if G.nodes[n].get("type") == "Suspect" else None,
         "community_id": DB.community_of.get(n) if G.nodes[n].get("type") == "Suspect" else None}
        for n in all_ids
    ]
    edges_out = [
        {"source": u, "target": v, "relation": d.get("relation", "Linked")}
        for u, v, d in G.edges(data=True)
        if u in all_ids and v in all_ids
    ]
    return {"nodes": nodes_out, "edges": edges_out}

# ─── GET /api/network/kingpins, /communities, /path, /predict-links ──────────
# Deep network analysis (Phase 3): centrality-based ranking, community
# detection, shortest-path connection explanation, and link prediction — all
# computed over the precomputed co-offender projection (see build_graph() /
# _compute_network_analytics()), never recomputed per-request.

@app.get("/api/network/kingpins")
async def get_kingpins(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    require_permission(request, "canViewNetwork")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    _require_network_analytics_ready(request)
    if DB.co_graph.number_of_nodes() == 0:
        return []

    def _in_scope(node_id: str) -> bool:
        if district_id is None and station_id is None:
            return True
        case_ids = _suspect_case_ids(node_id)
        case_station = _case_station_map()
        for cid in case_ids:
            sid = case_station.get(cid)
            if sid is None:
                continue
            if station_id is not None and sid == station_id:
                return True
            if district_id is not None and district_of_station(sid).district_id == district_id:
                return True
        return False

    rows = []
    for n in DB.co_graph.nodes:
        if not _in_scope(n):
            continue
        c = DB.centrality.get(n, {"degree": 0.0, "betweenness": 0.0, "eigenvector": 0.0})
        rows.append({
            "id": n,
            "label": DB.graph.nodes[n].get("label", n),
            "degree_centrality": c["degree"],
            "betweenness_centrality": c["betweenness"],
            "eigenvector_centrality": c["eigenvector"],
            "kingpin_score": _kingpin_score(n),
            "case_count": len(_suspect_case_ids(n)),
            "co_offender_count": DB.co_graph.degree(n),
            "district_count": len(_suspect_district_ids(n)),
            "community_id": DB.community_of.get(n),
        })
    rows.sort(key=lambda r: r["kingpin_score"], reverse=True)
    return rows[:limit]

@app.get("/api/network/communities")
async def get_communities(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    min_size: int = Query(3, ge=2, le=50),
    max_size: Optional[int] = Query(None, ge=2),
):
    """Greedy-modularity communities over the co-offender projection. Note:
    this synthetic dataset's repeat-offender name pool is shared statewide
    (see generate_statewide_data.py), so a handful of communities balloon to
    hundreds of members with very low internal cohesion — a data-generation
    artifact, not a real syndicate. Flagged via `likely_synthetic_artifact`
    rather than hidden, so the limitation stays visible instead of silently
    dropped. Use `max_size` to exclude them from a demo-facing view."""
    require_permission(request, "canViewNetwork")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    _require_network_analytics_ready(request)
    case_station = _case_station_map()
    out = []
    for idx, members in enumerate(DB.communities):
        if len(members) < min_size or (max_size is not None and len(members) > max_size):
            continue
        case_ids: set[int] = set()
        for n in members:
            case_ids |= _suspect_case_ids(n)
        district_ids = sorted({
            district_of_station(case_station[cid]).district_id
            for cid in case_ids if cid in case_station
        })

        dominant_crime_name = None
        active_from = active_to = None
        if not DB.cases.empty and case_ids:
            rows = DB.cases[DB.cases["CaseMasterID"].isin(case_ids)]
            if not rows.empty and not DB.crime_heads.empty:
                top_crime_id = rows["CrimeMajorHeadID"].value_counts().idxmax()
                match = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == top_crime_id, "CrimeGroupName"]
                dominant_crime_name = match.iloc[0] if not match.empty else None
            dates = pd.to_datetime(rows["CrimeRegisteredDate"], errors="coerce").dropna()
            if len(dates):
                active_from, active_to = str(dates.min().date()), str(dates.max().date())

        sub = DB.co_graph.subgraph(members)
        possible_edges = len(members) * (len(members) - 1) / 2
        cohesion = round(sub.number_of_edges() / possible_edges, 3) if possible_edges else 0.0
        top_members = sorted(members, key=lambda n: DB.centrality.get(n, {}).get("degree", 0.0), reverse=True)[:5]

        out.append({
            "community_id": idx,
            "size": len(members),
            "top_members": [{"id": n, "label": DB.graph.nodes[n].get("label", n)} for n in top_members],
            "dominant_crime_type": dominant_crime_name,
            "district_ids": district_ids,
            "case_count": len(case_ids),
            "cohesion": cohesion,
            "active_from": active_from,
            "active_to": active_to,
            "likely_synthetic_artifact": len(members) > 50 and cohesion < 0.05,
        })
    out.sort(key=lambda c: c["size"], reverse=True)
    return out[:limit]

@app.get("/api/network/path")
async def get_connection_path(request: Request, source: str = Query(...), target: str = Query(...)):
    require_permission(request, "canViewNetwork")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    _require_network_analytics_ready(request)
    if source not in DB.co_graph or target not in DB.co_graph:
        raise HTTPException(404, "Unknown suspect id(s) — use ids returned by /api/network or /api/network/kingpins")

    if source == target:
        return {"connected": True, "path": [{"id": source, "label": DB.graph.nodes[source].get("label", source)}],
                "hops": [], "path_length": 0}
    try:
        node_path = nx.shortest_path(DB.co_graph, source, target)
    except nx.NetworkXNoPath:
        return {"connected": False, "path": [], "hops": [], "path_length": None}

    hops = []
    for i in range(len(node_path) - 1):
        a, b = node_path[i], node_path[i + 1]
        edge = DB.co_graph.get_edge_data(a, b, default={})
        shared_cases = []
        for fir_id in edge.get("shared_cases", [])[:5]:
            try:
                cid = int(fir_id.split("-", 1)[1])
            except (IndexError, ValueError):
                continue
            row = DB.cases[DB.cases["CaseMasterID"] == cid]
            if row.empty:
                continue
            r = row.iloc[0]
            shared_cases.append({
                "case_master_id": cid,
                "date": str(r["CrimeRegisteredDate"]),
                "station": station_name(int(r["PoliceStationID"])),
            })
        hops.append({
            "from": {"id": a, "label": DB.graph.nodes[a].get("label", a)},
            "to": {"id": b, "label": DB.graph.nodes[b].get("label", b)},
            "shared_case_count": edge.get("weight", 0),
            "shared_cases": shared_cases,
        })
    return {
        "connected": True,
        "path": [{"id": n, "label": DB.graph.nodes[n].get("label", n)} for n in node_path],
        "hops": hops,
        "path_length": len(node_path) - 1,
    }

@app.get("/api/network/predict-links")
async def predict_links(request: Request, limit: int = Query(20, ge=1, le=100)):
    """Adamic-Adar leads over the top-degree suspects only — all-pairs scoring
    is O(n^2) and this graph can hold thousands of nodes. Always advisory:
    a statistical association, never asserted as a real-world connection."""
    require_permission(request, "canViewNetwork")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    _require_network_analytics_ready(request)
    if DB.co_graph.number_of_nodes() < 3:
        return []

    candidate_pool = int(os.environ.get("LINK_PREDICTION_CANDIDATE_POOL", "300"))
    top_nodes = [n for n, _ in sorted(DB.co_graph.degree, key=lambda x: x[1], reverse=True)[:candidate_pool]]
    pairs = [
        (top_nodes[i], top_nodes[j])
        for i in range(len(top_nodes))
        for j in range(i + 1, len(top_nodes))
        if not DB.co_graph.has_edge(top_nodes[i], top_nodes[j])
    ]
    try:
        scored = sorted(nx.adamic_adar_index(DB.co_graph, pairs), key=lambda r: r[2], reverse=True)
    except (ZeroDivisionError, nx.NetworkXError):
        scored = []

    out = []
    for u, v, score in scored:
        if score <= 0:
            continue
        out.append({
            "source": {"id": u, "label": DB.graph.nodes[u].get("label", u)},
            "target": {"id": v, "label": DB.graph.nodes[v].get("label", v)},
            "adamic_adar_score": round(score, 4),
            "label": "predicted_lead",
            "advisory": "Statistical association only — not evidence of a real-world connection; verify before acting.",
        })
        if len(out) >= limit:
            break
    return out

# ─── POST /api/simulator/run ──────────────────────────────────────────────────

@app.post("/api/simulator/run")
async def run_simulation(body: SimulationRequest, request: Request):
    require_permission(request, "canSimulate")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    baseline = len(DB.cases) if not DB.cases.empty else 1000
    patrol_density = max(0.0, min(100.0, body.patrol_density))
    infra_health = max(0.0, min(100.0, body.infra_health))
    rapid_response = max(0.0, min(100.0, body.rapid_response))
    impact = round((patrol_density * 0.4 + infra_health * 0.35 + rapid_response * 0.25) / 1.2)
    impact = max(0, min(100, impact))
    return {
        "impact_percent":      impact,
        "predicted_reduction": round(baseline * impact / 100),
        "baseline_cases":      baseline,
        "model_version":       "scenario-model-v1",
        "window_days":         30,
        "confidence_range":    [max(0, impact - 12), min(100, impact + 12)],
        "assumptions": [
            "Scenario estimate only; it is not a validated causal effect.",
            "Patrol, infrastructure, and response inputs are weighted equally across Bengaluru sectors.",
        ],
        "computed_at":         pd.Timestamp.now().isoformat(),
    }

# ─── GET /api/districts, /api/districts/{id}/summary ─────────────────────────

@app.get("/api/districts")
async def get_districts(request: Request):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    out = []
    for d in KARNATAKA_DISTRICTS:
        min_lat, max_lat, min_lng, max_lng = d.bounds
        out.append({
            "district_id":   d.district_id,
            "name":          d.name,
            "name_kn":       d.name_kn,
            "code":          d.code,
            "centroid":      {"lat": d.centroid[0], "lng": d.centroid[1]},
            "bounds":        {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng},
            "station_range": [d.station_start, d.station_end],
        })
    min_lat, max_lat, min_lng, max_lng = statewide_bounds()
    return {
        "districts": out,
        "statewide_bounds": {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng},
    }

@app.get("/api/districts/{district_id}/summary")
async def get_district_summary(district_id: int, request: Request):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    d = district_by_id(district_id)
    if d is None:
        raise HTTPException(404, "Unknown district")

    cases = _scope_filter(DB.cases, district_id=district_id)
    total = len(cases)
    case_ids = set(cases["CaseMasterID"])
    arrests = DB.arrests[DB.arrests["CaseMasterID"].isin(case_ids)] if not DB.arrests.empty else DB.arrests
    high_risk = int((cases["GravityOffenceID"] >= 4).sum())
    cases_with_arrest = arrests["CaseMasterID"].nunique() if not arrests.empty else 0
    arrest_rate = round(cases_with_arrest / max(total, 1) * 100, 1)
    anomalies = _compute_anomalies(cases)

    top_categories = []
    if not DB.crime_heads.empty and not cases.empty:
        merged = cases.merge(DB.crime_heads[["CrimeHeadID", "CrimeGroupName"]],
                              left_on="CrimeMajorHeadID", right_on="CrimeHeadID", how="left")
        top_categories = [
            {"crime_type": k, "count": int(v)}
            for k, v in merged["CrimeGroupName"].value_counts().head(5).items()
        ]

    min_lat, max_lat, min_lng, max_lng = d.bounds
    return {
        "district_id":         d.district_id,
        "name":                d.name,
        "code":                d.code,
        "total_cases":         total,
        "high_risk_cases":     high_risk,
        "arrest_rate_percent": arrest_rate,
        "active_anomalies":    len(anomalies),
        "top_crime_categories": top_categories,
        "station_count":      d.station_end - d.station_start + 1,
        "bounds":             {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng},
        "data_provenance":    "synthetic",
    }

# ─── GET /api/socioeconomic/correlation (Phase 6, Tier 2) ────────────────────
# Association-only workbench: Spearman rank correlation + bootstrap CI between
# a district-level indicator and case volume. Case counts are the real live
# dataset; the indicator itself is a synthetic placeholder (district_indicators.py)
# pending real public data ingestion — never presented as a validated finding.

def _spearman(a: pd.Series, b: pd.Series) -> float:
    """Spearman rank correlation without scipy (not vendored for AppSail):
    Pearson correlation of the ranks is numerically identical to Spearman's
    rho, including pandas' average-rank tie handling."""
    return float(a.rank().corr(b.rank()))

@app.get("/api/socioeconomic/correlation")
async def get_socioeconomic_correlation(
    request: Request,
    indicator: Literal["literacy_rate_percent", "unemployment_rate_percent", "urbanization_percent"] = Query("unemployment_rate_percent"),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")

    rows = []
    for d in KARNATAKA_DISTRICTS:
        cases = _scope_filter(DB.cases, district_id=d.district_id)
        ind = indicators_for_district(d.district_id)
        rows.append({
            "district_id": d.district_id, "name": d.name,
            "total_cases": len(cases), "indicator_value": ind[indicator],
        })

    df = pd.DataFrame(rows)
    n = len(df)
    corr = _spearman(df["total_cases"], df["indicator_value"]) if n >= 3 else None

    ci = None
    if corr is not None:
        rng = np.random.default_rng(42)
        idx = df.index.to_numpy()
        boot_values = []
        for _ in range(2000):
            sample = df.loc[rng.choice(idx, size=n, replace=True)]
            if sample["indicator_value"].nunique() < 2 or sample["total_cases"].nunique() < 2:
                continue
            boot_values.append(_spearman(sample["total_cases"], sample["indicator_value"]))
        if boot_values:
            ci = [round(float(np.percentile(boot_values, 2.5)), 3), round(float(np.percentile(boot_values, 97.5)), 3)]

    return {
        "indicator": indicator,
        "sample_size_districts": n,
        "spearman_correlation": round(float(corr), 3) if corr is not None else None,
        "bootstrap_95_ci": ci,
        "rows": rows,
        "indicator_provenance": "synthetic_placeholder — case counts are real, the indicator is not (see backend/district_indicators.py)",
        "advisory": (
            "Association only, not causation. Sample size is 9 districts — far too small for "
            "a statistically reliable correlation estimate. This endpoint demonstrates the "
            "methodology (Spearman + bootstrap CI + explicit provenance disclosure), not a "
            "validated finding. Never used to score individuals or groups."
        ),
    }

# ─── GET /api/reports ───────────────────────────────────────────────────────────

@app.get("/api/reports")
async def get_reports(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    district_id: Optional[int] = Query(None),
    station_id: Optional[int] = Query(None),
):
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    scoped = _scope_filter(DB.cases_by_date, district_id, station_id)
    total = len(scoped)
    df = scoped.iloc[offset : offset + limit].copy()
    if not DB.crime_heads.empty:
        df = df.merge(DB.crime_heads[["CrimeHeadID", "CrimeGroupName"]],
                      left_on="CrimeMajorHeadID", right_on="CrimeHeadID", how="left")
    page_case_ids = df["CaseMasterID"].astype(int).tolist()
    if not DB.accused.empty and page_case_ids:
        page_accused = DB.accused[DB.accused["CaseMasterID"].astype(int).isin(page_case_ids)]
        accused_counts = page_accused.groupby("CaseMasterID").size().to_dict()
    else:
        accused_counts = {}
    results = []
    for _, row in df.iterrows():
        case_id = int(row["CaseMasterID"])
        workflow = _LOCAL_CASE_WORKFLOWS.get(case_id, {})
        g = int(row["GravityOffenceID"])
        sid = int(row["PoliceStationID"])
        results.append({
            "case_master_id": case_id,
            "id":             f"BLR-{row['CrimeNo']}",
            "title":          str(row.get("BriefFacts", ""))[:80],
            "district":       district_of_station(sid).name,
            "station":        station_name(sid),
            "date":           str(row["CrimeRegisteredDate"]),
            "severity":       "critical" if g == 5 else ("high" if g == 4 else ("medium" if g == 3 else "low")),
            "status":         workflow.get("status", "open"),
            "assigned_officer": workflow.get("assigned_officer", "Unassigned"),
            "crime_type":     str(row.get("CrimeGroupName", "Unknown")),
            "ipc_section":    f"IPC {int(row['CrimeMajorHeadID']) * 100 + 79}",
            "suspects":       int(accused_counts.get(case_id, 0)),
        })
    return {"items": results, "total": total, "limit": limit, "offset": offset}

# ─── GET /api/interop/cctns/{case_master_id} (Phase 6, Tier 2) ───────────────
# Demonstrates the schema-mapping adapter (backend/cctns_adapter.py) on a real
# case. The mapping itself is illustrative/unverified — see that module's
# docstring — this endpoint proves the transform runs end-to-end, not that
# the field names match the real CCTNS data dictionary.

@app.get("/api/interop/cctns/{case_master_id}")
async def export_case_cctns(case_master_id: int, request: Request):
    require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    case_rows = DB.cases[DB.cases["CaseMasterID"].astype(int) == case_master_id]
    if case_rows.empty:
        raise HTTPException(404, "Case not found")
    row = case_rows.iloc[0]
    sid = int(row["PoliceStationID"])
    crime_name = "Unknown"
    if not DB.crime_heads.empty:
        match = DB.crime_heads.loc[DB.crime_heads["CrimeHeadID"] == row["CrimeMajorHeadID"], "CrimeGroupName"]
        crime_name = match.iloc[0] if not match.empty else "Unknown"

    garuda_shape = {
        "case_master_id": case_master_id,
        "crime_no": str(row["CrimeNo"]),
        "date": str(row["CrimeRegisteredDate"]),
        "station": station_name(sid),
        "district": district_of_station(sid).name,
        "crime_type": crime_name,
        "gravity": int(row["GravityOffenceID"]),
        "ipc_section": f"IPC {int(row['CrimeMajorHeadID']) * 100 + 79}",
    }
    return {"cctns_record": case_to_cctns(garuda_shape), "source_record": garuda_shape}

@app.get("/api/risk/{case_master_id}")
async def predict_case_risk(case_master_id: int, request: Request):
    require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    try:
        features = _risk_features(case_master_id)
    except KeyError:
        raise HTTPException(404, "Case not found")

    capp = _try_catalyst_app(request)
    source = "zia_automl"
    try:
        prediction = _zia_risk_prediction(capp, features)
    except Exception as exc:
        log.info(f"Zia risk prediction unavailable; using transparent local fallback: {exc}")
        prediction = _local_risk_prediction(features)
        source = "local_fallback"
    return {
        "case_master_id": case_master_id,
        "model_id": ZIA_RISK_MODEL_ID if source == "zia_automl" else None,
        "model_name": "Garuda Case Risk Classifier",
        "source": source,
        "features": features,
        **prediction,
        "advisory": "Synthetic prototype score for supervisor review; not an enforcement decision.",
    }

@app.patch("/api/reports/{case_master_id}/workflow")
async def update_case_workflow(case_master_id: int, body: CaseWorkflowUpdate, request: Request):
    officer = require_session(request)
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")
    if not DB.cases["CaseMasterID"].astype(int).eq(case_master_id).any():
        raise HTTPException(404, "Case not found")

    workflow = {
        "status": body.status,
        "assigned_officer": body.assigned_officer.strip(),
        "updated_by": officer["badge"],
        "updated_at": pd.Timestamp.now(tz="UTC").isoformat(),
    }
    _LOCAL_CASE_WORKFLOWS[case_master_id] = workflow
    persistence = "session"
    warning = "Stored for this AppSail session; configure CaseWorkflowEvents to persist workflow history."
    capp = _try_catalyst_app(request)
    if capp is not None:
        try:
            capp.datastore().table("CaseWorkflowEvents").insert_rows([{
                "CaseMasterID": case_master_id,
                "Status": workflow["status"],
                "AssignedOfficer": workflow["assigned_officer"],
                "UpdatedBy": workflow["updated_by"],
                "UpdatedAt": workflow["updated_at"],
            }])
            persistence = "datastore"
            warning = None
        except Exception as exc:
            log.warning(f"Case workflow Data Store write failed; keeping session event: {exc}")
    return {"case_master_id": case_master_id, **workflow, "persistence": persistence, "warning": warning}

# ─── Response plans: intelligence signal -> assigned field task ──────────────

@app.post("/api/operations")
async def create_operation(body: ResponsePlanCreate, request: Request):
    officer = require_permission(request, "canSimulate")
    capp = _try_catalyst_app(request)
    return _create_response_plan(body, officer, capp)

@app.get("/api/operations")
async def list_operations(
    request: Request,
    status: Optional[Literal["assigned", "acknowledged", "in_progress", "completed"]] = Query(None),
):
    officer = require_session(request)
    capp = _try_catalyst_app(request)
    _hydrate_response_plans(capp)
    _hydrate_field_updates(capp)
    can_manage = _permissions_for(officer.get("clearance", "CLR-1"))["canSimulate"]
    with _RESPONSE_PLAN_LOCK:
        plans = list(_LOCAL_RESPONSE_PLANS.values())
    if not can_manage:
        plans = [plan for plan in plans if plan["assigned_to"] == officer.get("badge")]
    if status is not None:
        plans = [plan for plan in plans if plan["status"] == status]
    plans.sort(key=lambda plan: plan["created_at"], reverse=True)
    return {"items": [_public_response_plan(plan) for plan in plans], "total": len(plans)}

@app.patch("/api/operations/{operation_id}")
async def update_operation(
    operation_id: str, body: ResponsePlanUpdate, request: Request
):
    officer = require_session(request)
    capp = _try_catalyst_app(request)
    return _update_response_plan(operation_id, body, officer, capp)

@app.post("/api/operations/{operation_id}/attachments")
async def upload_operation_attachment(
    operation_id: str, request: Request, file: UploadFile = File(...)
):
    officer = require_session(request)
    capp = _try_catalyst_app(request)
    plan = _require_operation_access(operation_id, officer, capp)
    allowed_types = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(415, "Only JPEG, PNG, WebP, and PDF attachments are supported")
    content = await file.read()
    if not content or len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Attachment must be between 1 byte and 10 MB")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "attachment")[:120]
    object_key = f"operations/{operation_id}/{uuid.uuid4()}-{safe_name}"
    persistence = "session"
    if capp is not None:
        try:
            capp.stratus().bucket(_OPERATION_STRATUS_BUCKET).put_object(
                object_key, content, {"content_type": file.content_type, "meta_data": {"operation_id": operation_id}}
            )
            persistence = "stratus"
        except Exception as exc:
            log.warning(f"Operation attachment Stratus upload failed; keeping session copy: {exc}")
    if persistence == "session":
        _LOCAL_OPERATION_ATTACHMENTS[object_key] = content
    update = _record_field_update(
        plan, officer["badge"], plan["status"], attachment_key=object_key,
        attachment_name=safe_name, attachment_type=file.content_type or "", capp=capp,
    )
    _emit_operation_audit_event(plan, officer["badge"], "attachment_added", capp)
    return {"operation_id": operation_id, "attachment": update, "persistence": persistence}

@app.get("/api/operations/{operation_id}/assessment")
async def get_operation_assessment(operation_id: str, request: Request):
    officer = require_session(request)
    capp = _try_catalyst_app(request)
    plan = _require_operation_access(operation_id, officer, capp)
    _hydrate_field_updates(capp)
    assessment = _operation_assessment(plan)
    assessment["persistence"] = _persist_operation_assessment(assessment, officer["badge"], capp)
    return assessment

@app.get("/api/operations/{operation_id}/debrief")
async def export_operation_debrief(operation_id: str, request: Request):
    officer = require_permission(request, "canExport")
    capp = _try_catalyst_app(request)
    plan = _require_operation_access(operation_id, officer, capp)
    _hydrate_field_updates(capp)
    assessment = _operation_assessment(plan)
    _persist_operation_assessment(assessment, officer["badge"], capp)
    html = _operation_debrief_html(plan, assessment)
    if capp is not None:
        try:
            response = capp.smart_browz().convert_to_pdf(html)
            return StreamingResponse(iter([response.content]), media_type="application/pdf", headers={
                "Content-Disposition": f"attachment; filename=garuda-operation-{operation_id[:8]}.pdf"
            })
        except Exception as exc:
            log.warning(f"Operation SmartBrowz debrief failed; using local PDF: {exc}")
    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 15)
        pdf.cell(0, 10, "GARUDA OPERATION DEBRIEF", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for line in [
            f"Operation: {operation_id}", f"Station: {plan['station_name']}", f"Status: {plan['status']}",
            f"Direction: {plan['note'] or 'No note'}", f"Assessment: {assessment['impact_status']}",
            assessment["advisory"],
        ]:
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 6, str(line).encode("latin-1", errors="replace").decode("latin-1"))
        buffer = BytesIO()
        pdf.output(buffer)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/pdf", headers={
            "Content-Disposition": f"attachment; filename=garuda-operation-{operation_id[:8]}.pdf"
        })
    except ImportError:
        raise HTTPException(500, "PDF generation is unavailable")

@app.post("/api/internal/operations/maintenance")
async def operation_maintenance(request: Request):
    _require_internal_token(request, "JOB_SCHEDULER_TOKEN", "X-Job-Token")
    return _run_operation_maintenance(_try_catalyst_app(request))

@app.post("/api/internal/operations/signals")
async def operation_signal_receiver(request: Request):
    _require_internal_token(request, "SIGNALS_WEBHOOK_TOKEN", "X-Signals-Token")
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "Signals payload must be JSON")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Signals payload must be an object")
    event = _record_signal_delivery(payload, _try_catalyst_app(request))
    return {"accepted": True, "event_id": event["event_id"]}

# ─── POST /api/export_brief (SmartBrowz PDF) ─────────────────────────────────

def _brief_scope_name(district_id: Optional[int], station_id: Optional[int]) -> str:
    if station_id is not None:
        return station_name(station_id)
    if district_id is not None:
        d = district_by_id(district_id)
        return d.name if d else "Unknown District"
    return "Statewide — All Karnataka"

def _brief_top_crime_types(cases: pd.DataFrame, limit: int = 5) -> list[str]:
    if DB.crime_heads.empty or cases.empty:
        return []
    merged = cases.merge(DB.crime_heads[["CrimeHeadID", "CrimeGroupName"]],
                         left_on="CrimeMajorHeadID", right_on="CrimeHeadID", how="left")
    return merged["CrimeGroupName"].value_counts().head(limit).index.tolist()

def _brief_top_kingpins(district_id: Optional[int], station_id: Optional[int], limit: int = 5) -> list[dict]:
    """Same centrality data as /api/network/kingpins, inlined here (rather
    than calling the route function directly) since that endpoint enforces
    its own clearance check — this section is gated by canExport instead,
    already checked once at the top of export_brief."""
    if not DB.network_analytics_ready or DB.co_graph.number_of_nodes() == 0:
        return []
    case_station = _case_station_map()

    def in_scope(node_id: str) -> bool:
        if district_id is None and station_id is None:
            return True
        for cid in _suspect_case_ids(node_id):
            sid = case_station.get(cid)
            if sid is None:
                continue
            if station_id is not None and sid == station_id:
                return True
            if district_id is not None and district_of_station(sid).district_id == district_id:
                return True
        return False

    rows = [
        {"label": DB.graph.nodes[n].get("label", n), "score": _kingpin_score(n), "cases": len(_suspect_case_ids(n))}
        for n in DB.co_graph.nodes if in_scope(n)
    ]
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows[:limit]

@app.post("/api/export_brief")
async def export_brief(body: ExportBriefRequest, request: Request):
    """
    Every section is computed here from live scoped data (same helpers the
    dashboard itself uses — _scope_filter/_compute_anomalies/_kingpin_score)
    rather than trusted from the request body, so the PDF always reflects
    what the officer was actually looking at, never stale or fabricated
    frontend placeholder values.

    CATALYST mode: SmartBrowz headless PDF generation.
    LOCAL mode:    fpdf2 fallback.
    """
    officer = require_permission(request, "canExport")
    if not ensure_data_loaded(request):
        raise HTTPException(503, "Data not loaded")

    cases = _scope_filter(DB.cases, body.district_id, body.station_id)
    case_ids = None if (body.district_id is None and body.station_id is None) else set(cases["CaseMasterID"])
    arrests = DB.arrests if case_ids is None else DB.arrests[DB.arrests["CaseMasterID"].isin(case_ids)]

    total = len(cases)
    high_risk = int((cases["GravityOffenceID"] >= 4).sum())
    cases_with_arrest = int(arrests["CaseMasterID"].nunique()) if not arrests.empty else 0
    arrest_rate = round(cases_with_arrest / max(total, 1) * 100, 1)
    anomalies = _compute_anomalies(cases)
    volatility = round(sum(a["z_score"] for a in anomalies) / len(anomalies), 2) if anomalies else 0.0

    brief = {
        "scope": _brief_scope_name(body.district_id, body.station_id),
        "generated_by": officer.get("badge", "Unknown Officer"),
        "generated_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M IST"),
        "kpis": {
            "Cases in Scope": f"{total:,}",
            "High-Risk Cases": str(high_risk),
            "Arrest Rate": f"{arrest_rate}%",
            "Risk Volatility Index": str(volatility),
        },
        "top_crime_types": _brief_top_crime_types(cases),
        "anomalies": [
            {"station": a["station_name"], "z_score": a["z_score"],
             "current_count": a["current_count"], "mean_count": a["mean_count"], "severity": a["severity"]}
            for a in anomalies[:5]
        ],
        "kingpins": _brief_top_kingpins(body.district_id, body.station_id),
        "simulation_impact": body.simulation_impact,
    }

    capp = _try_catalyst_app(request)
    if capp is not None:
        try:
            html    = _brief_html(brief)
            sb      = capp.smart_browz()
            # zcatalyst-sdk 1.4.0's SmartBrowz has no `generate_pdf(html_content=...)`
            # method — the real API is `convert_to_pdf(source)`, which accepts either
            # a URL or a raw HTML string and returns the underlying `requests.Response`
            # (verified by reading the installed package's smartbrowz/__init__.py).
            resp    = sb.convert_to_pdf(html)
            pdf_b   = resp.content
            return StreamingResponse(iter([pdf_b]), media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=garuda-intel-brief.pdf"})
        except Exception as e:
            log.error(f"SmartBrowz failed: {e}")

    # fpdf2 fallback — its default Helvetica core font is Latin-1 only, so any
    # curly quote/em-dash/bullet (e.g. Faker-generated names like "D'Alia"
    # using U+2019) crashes cell() with FPDFUnicodeEncodingException. Every
    # dynamic string below is run through this before hitting a pdf.cell().
    def _pdf_safe(text: str) -> str:
        return (str(text)
                .replace("\u2018", "'").replace("\u2019", "'")
                .replace("\u201c", '"').replace("\u201d", '"')
                .replace("\u2013", "-").replace("\u2014", "-")
                .replace("\u2022", "-")
                .encode("latin-1", errors="replace").decode("latin-1"))

    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 12, "PROJECT GARUDA - INTELLIGENCE BRIEF", ln=True, align="C")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 6, "Karnataka State Police | RESTRICTED", ln=True, align="C")
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(0, 5, _pdf_safe(f"Scope: {brief['scope']} | Generated by {brief['generated_by']} | {brief['generated_at']}"), ln=True, align="C")
        pdf.ln(6)

        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "KPI Summary", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for k, v in brief["kpis"].items():
            pdf.cell(0, 7, _pdf_safe(f"  {k}: {v}"), ln=True)
        pdf.ln(4)

        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Top Crime Categories", ln=True)
        pdf.set_font("Helvetica", "", 10)
        if brief["top_crime_types"]:
            for c in brief["top_crime_types"]:
                pdf.cell(0, 7, _pdf_safe(f"  - {c}"), ln=True)
        else:
            pdf.cell(0, 7, "  No cases in scope.", ln=True)
        pdf.ln(4)

        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Active Anomaly Alerts", ln=True)
        pdf.set_font("Helvetica", "", 10)
        if brief["anomalies"]:
            for a in brief["anomalies"]:
                pdf.cell(0, 7, _pdf_safe(f"  - {a['station']}: z={a['z_score']} ({a['current_count']} vs avg {a['mean_count']}, {a['severity']})"), ln=True)
        else:
            pdf.cell(0, 7, "  No active anomalies detected in this scope.", ln=True)
        pdf.ln(4)

        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Top Connected Suspects (Network Analysis)", ln=True)
        pdf.set_font("Helvetica", "", 10)
        if brief["kingpins"]:
            for k in brief["kingpins"]:
                pdf.cell(0, 7, _pdf_safe(f"  - {k['label']}: kingpin score {k['score']}, {k['cases']} linked case(s)"), ln=True)
        else:
            pdf.cell(0, 7, "  Network analytics not yet ready or no data in scope.", ln=True)

        if brief["simulation_impact"]:
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "What-If Simulation", ln=True)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 7, f"  Predicted reduction: -{brief['simulation_impact']}%", ln=True)

        pdf.set_y(-15)
        pdf.set_font("Helvetica", "I", 8)
        pdf.cell(0, 6, f"Generated by Project Garuda | {brief['generated_at']}", align="C")
        buf = BytesIO()
        pdf.output(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=garuda-intel-brief.pdf"})
    except ImportError:
        raise HTTPException(500, "Install fpdf2: pip install fpdf2")

def _brief_html(brief: dict) -> str:
    kpi_rows  = "".join(f"<tr><td>{k}</td><td><b>{v}</b></td></tr>" for k, v in brief["kpis"].items())
    crimes    = "".join(f"<li>{c}</li>" for c in brief["top_crime_types"]) or "<li>No cases in scope.</li>"
    anomaly_rows = "".join(
        f"<tr><td>{a['station']}</td><td>z={a['z_score']}</td><td>{a['current_count']} vs avg {a['mean_count']}</td><td>{a['severity']}</td></tr>"
        for a in brief["anomalies"]
    ) or "<tr><td colspan='4'>No active anomalies detected in this scope.</td></tr>"
    kingpin_rows = "".join(
        f"<tr><td>{k['label']}</td><td>{k['score']}</td><td>{k['cases']}</td></tr>" for k in brief["kingpins"]
    ) or "<tr><td colspan='3'>Network analytics not yet ready or no data in scope.</td></tr>"
    sim_block = (f"<h2>What-If Simulation</h2><p><b>Predicted reduction:</b> −{brief['simulation_impact']}% incidents</p>"
                if brief["simulation_impact"] else "")
    return f"""<!DOCTYPE html><html><head><style>
      body{{font-family:sans-serif;background:#0a0a10;color:#e2e8f0;padding:24px}}
      h1{{color:#5a8cff;font-size:18px}}h2{{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-top:20px}}
      table{{width:100%;border-collapse:collapse}}td{{padding:6px;border-bottom:1px solid #1e293b;font-size:13px}}
      .badge{{background:#dc2626;color:white;padding:2px 8px;border-radius:12px;font-size:10px}}
      footer{{margin-top:32px;color:#475569;font-size:10px;text-align:center}}
    </style></head><body>
    <h1>PROJECT GARUDA — INTELLIGENCE BRIEF <span class="badge">RESTRICTED</span></h1>
    <p style="color:#64748b;font-size:12px">Karnataka State Police · Scope: {brief['scope']} · Generated by {brief['generated_by']} · {brief['generated_at']}</p>
    <h2>KPI Summary</h2><table>{kpi_rows}</table>
    <h2>Top Crime Categories</h2><ul>{crimes}</ul>
    <h2>Active Anomaly Alerts</h2><table>{anomaly_rows}</table>
    <h2>Top Connected Suspects (Network Analysis)</h2><table>{kingpin_rows}</table>
    {sim_block}
    <footer>Project Garuda | Synthetic prototype data for supervisor review, not an enforcement decision | Powered by Zoho Catalyst SmartBrowz | CONFIDENTIAL</footer>
    </body></html>"""

# ─── Entry ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
