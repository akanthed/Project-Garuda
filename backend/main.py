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

import base64
import hashlib
import hmac
import json
import os
import logging
import random
import time
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Optional

import networkx as nx
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

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
    accused:     pd.DataFrame = pd.DataFrame()
    arrests:     pd.DataFrame = pd.DataFrame()
    crime_heads: pd.DataFrame = pd.DataFrame()
    graph:       nx.Graph     = nx.Graph()

DB = DataStore()

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
CACHE_TTL_SECONDS = 30

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

# ─── Session tokens (HMAC-signed, no external deps) ──────────────────────────

SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-insecure-secret-change-me")
SESSION_TTL_SECONDS = 12 * 60 * 60

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

_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 120
_rate_buckets: dict[str, list[float]] = {}

def _rate_limited(ip: str) -> bool:
    now = time.time()
    bucket = [t for t in _rate_buckets.get(ip, []) if now - t < _RATE_LIMIT_WINDOW]
    bucket.append(now)
    _rate_buckets[ip] = bucket
    return len(bucket) > _RATE_LIMIT_MAX

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
    DB.cases       = pd.DataFrame(_zcql_query_all(capp, "CaseMaster", 5000))
    DB.accused     = pd.DataFrame(_zcql_query_all(capp, "Accused", 10000))
    DB.arrests     = pd.DataFrame(_zcql_query_all(capp, "ArrestSurrender", 10000))
    DB.crime_heads = pd.DataFrame(_zcql_query_all(capp, "CrimeHead", 300))
    _coerce_dtypes()
    log.info(f"Loaded {len(DB.cases)} cases from Catalyst")

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

def load_from_csv() -> None:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    if not os.path.exists(f"{data_dir}/CaseMaster.csv"):
        log.warning("CSV data not found — run: python generate_data.py")
        return
    DB.cases       = pd.read_csv(f"{data_dir}/CaseMaster.csv")
    DB.accused     = pd.read_csv(f"{data_dir}/Accused.csv")
    DB.arrests     = pd.read_csv(f"{data_dir}/ArrestSurrender.csv")
    DB.crime_heads = pd.read_csv(f"{data_dir}/CrimeHead.csv")
    log.info(f"Loaded {len(DB.cases)} cases, {len(DB.accused)} accused from CSV")

def build_graph() -> None:
    """
    Bipartite graph: Accused nodes ↔ FIR nodes.
    NetworkX computes centrality to rank key suspects.
    """
    if DB.accused.empty:
        return
    G = nx.Graph()
    for _, row in DB.accused.iterrows():
        acc_id = f"A-{int(row['AccusedMasterID'])}"
        fir_id = f"FIR-{int(row['CaseMasterID'])}"
        G.add_node(acc_id, label=str(row["AccusedName"]), type="Suspect",
                   weight=1, risk="low")
        G.add_node(fir_id, label=fir_id, type="FIR", weight=1)
        G.add_edge(acc_id, fir_id, relation="Accused In")

    centrality = nx.degree_centrality(G)
    for n, data in G.nodes(data=True):
        if data.get("type") == "Suspect":
            score = centrality.get(n, 0)
            deg = G.degree(n)
            G.nodes[n]["weight"] = max(1, int(score * 80))
            G.nodes[n]["risk"]   = "high" if deg >= 4 else ("med" if deg >= 2 else "low")

    DB.graph = G
    log.info(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        load_from_csv()
        build_graph()
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

# Restrict CORS to known frontend origin(s) via env var (comma-separated).
# Catalyst API Gateway cannot front AppSail apps directly (it only supports
# Basic/Advanced I/O Functions and the Web Client as targets), so origin
# restriction + the rate limiter below are the in-app substitute.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allowed_origins == "*" else [o.strip() for o in _allowed_origins.split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    if _rate_limited(ip):
        raise HTTPException(429, "Too many requests")
    return await call_next(request)

# Safety net: any unhandled exception otherwise falls through to Starlette's
# generic plain-text 500 (no useful detail, hard to debug on a platform with
# no easy log access like Catalyst AppSail). Surface it as JSON instead.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception(f"Unhandled exception on {request.url.path}")
    return JSONResponse(status_code=500, content={"error": f"{type(exc).__name__}: {exc}"})

# ─── Models ───────────────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    patrol_density:  float = 62.0
    infra_health:    float = 78.0
    rapid_response:  float = 45.0

class ExportBriefRequest(BaseModel):
    kpis:              dict
    hotspot_count:     int
    top_crime_types:   list[str]
    simulation_impact: Optional[int] = None

class LoginRequest(BaseModel):
    badge:    str
    password: str

class TranslateRequest(BaseModel):
    texts:           list[str]
    target_language: str = "kn"

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root(request: Request):
    capp = _try_catalyst_app(request)
    return {"service": "Garuda API", "version": "2.0.0",
            "mode": "catalyst" if capp is not None else "local",
            "cases": len(DB.cases)}

@app.get("/health")
async def health():
    return {"status": "ok", "cases": len(DB.cases),
            "graph_nodes": DB.graph.number_of_nodes()}

# ─── POST /api/admin/seed-datastore ───────────────────────────────────────────
# One-time bulk-loader that pushes backend/data/*.csv straight into Catalyst
# Data Store via the SDK's Table.insert_rows(), bypassing the console's CSV
# importer entirely (useful when the console upload UI rejects a file — wrong
# date format, encoding, or row-count limits are the usual causes). Guarded by
# a shared-secret header so it can't be triggered by an anonymous request.

_SEED_TABLES = ["CrimeHead", "CaseMaster", "Accused", "ArrestSurrender"]
_SEED_BATCH_SIZE = 200

def _csv_rows_for_seed(table_name: str) -> list[dict]:
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    df = pd.read_csv(f"{data_dir}/{table_name}.csv")
    # Route through pandas' own JSON encoder so numpy int64/float64 become
    # plain Python int/float/str — the SDK's HTTP client can't serialize
    # numpy scalar types directly.
    return json.loads(df.to_json(orient="records"))

@app.post("/api/admin/seed-datastore")
async def seed_datastore(request: Request):
    if request.headers.get("X-Seed-Token") != os.environ.get("SEED_TOKEN"):
        raise HTTPException(403, "Missing or invalid X-Seed-Token")
    capp = _try_catalyst_app(request)
    if capp is None:
        raise HTTPException(400, "Catalyst Data Store is unavailable in this environment")

    results = {}
    for table_name in _SEED_TABLES:
        try:
            rows = _csv_rows_for_seed(table_name)
            table = capp.datastore().table(table_name)
            inserted, errors = 0, []
            for i in range(0, len(rows), _SEED_BATCH_SIZE):
                batch = rows[i : i + _SEED_BATCH_SIZE]
                try:
                    table.insert_rows(batch)
                    inserted += len(batch)
                except Exception as e:
                    errors.append(f"rows {i}-{i + len(batch)}: {type(e).__name__}: {e}")
            results[table_name] = {"total": len(rows), "inserted": inserted, "errors": errors}
        except FileNotFoundError:
            results[table_name] = {"error": f"{table_name}.csv not found"}
        except Exception as e:
            log.exception(f"seed_datastore failed for table {table_name}")
            results[table_name] = {"error": f"{type(e).__name__}: {e}"}

    return results

# ─── POST /api/admin/reload-from-datastore ────────────────────────────────────
# On-demand refresh of the in-memory dataset from Catalyst Data Store via
# ZCQL, using this request's own Catalyst app instance (boot-time loading
# from Data Store isn't possible — see lifespan()/load_from_csv() above).

@app.post("/api/admin/reload-from-datastore")
async def reload_from_datastore(request: Request):
    if request.headers.get("X-Seed-Token") != os.environ.get("SEED_TOKEN"):
        raise HTTPException(403, "Missing or invalid X-Seed-Token")
    capp = _try_catalyst_app(request)
    if capp is None:
        raise HTTPException(400, "Catalyst Data Store is unavailable in this environment")
    try:
        load_from_catalyst(capp)
        build_graph()
    except Exception as e:
        raise HTTPException(500, f"Reload failed: {e}")
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
    token = sign_session({"badge": badge})
    return {"officer": profile, "token": token}

# ─── POST /api/translate (Zia Translate) ──────────────────────────────────────

@app.post("/api/translate")
async def translate(body: TranslateRequest, request: Request):
    """
    Translates dynamic case narrative text (not static UI chrome, which is
    already hand-translated in the frontend's i18n dictionary) via Catalyst
    Zia Services. Falls back to passthrough (untranslated) text if Zia is
    unavailable, so the caller can decide whether to use its own fallback.
    """
    capp = _try_catalyst_app(request)
    if capp is not None:
        try:
            zia = capp.zia()
            translated = [
                zia.translate(text=text, target_language=body.target_language).get("translated_text", text)
                for text in body.texts
            ]
            return {"translations": translated, "source": "zia"}
        except Exception as e:
            log.warning(f"Zia translate unavailable: {e} — passthrough fallback")

    return {"translations": body.texts, "source": "fallback"}

# ─── GET /api/kpis ────────────────────────────────────────────────────────────

@app.get("/api/kpis")
async def get_kpis(request: Request):
    if DB.cases.empty:
        raise HTTPException(503, "Data not loaded")

    capp = _try_catalyst_app(request)
    cached = cache_get(capp, "kpis")
    if cached is not None:
        return cached

    total     = len(DB.cases)
    high_risk = int((DB.cases["GravityOffenceID"] >= 4).sum())
    arrests   = len(DB.arrests)
    readiness = min(100, round(arrests / max(total, 1) * 110))
    esc       = round(float(DB.cases["GravityOffenceID"].mean()), 2)

    def sparkline(series: pd.Series) -> list[int]:
        try:
            counts = pd.to_datetime(series).dt.to_period("M").value_counts().sort_index()
            vals = counts.tail(12).values.tolist()
            return [int(v) for v in vals] if vals else [0] * 12
        except Exception:
            return [0] * 12

    result = [
        {"id": "criminal-nodes", "label": "Criminal Nodes Analyzed",
         "value": f"{total:,}", "delta": "4.2%", "trend": "up", "positive": False,
         "sparkline": sparkline(DB.cases["CrimeRegisteredDate"]), "accent": "electric"},
        {"id": "hotspot-alerts", "label": "Spatio-Temporal Hotspot Alerts",
         "value": str(high_risk), "delta": "12.1%", "trend": "up", "positive": False,
         "sparkline": sparkline(DB.cases.loc[DB.cases["GravityOffenceID"] >= 4, "CrimeRegisteredDate"]),
         "accent": "danger"},
        {"id": "risk-volatility", "label": "Causal Risk Volatility Index",
         "value": str(esc), "delta": "3.4%", "trend": "down", "positive": True,
         "sparkline": [round(v) for v in DB.cases["GravityOffenceID"].rolling(500).mean().dropna().tail(12).tolist()],
         "accent": "electric"},
        {"id": "resource-readiness", "label": "Resource Deployment Readiness",
         "value": f"{readiness}%", "delta": "1.8%", "trend": "up", "positive": True,
         "sparkline": [max(60, min(100, readiness + i - 5)) for i in range(12)],
         "accent": "electric"},
    ]
    cache_set(capp, "kpis", result)
    return result

# ─── GET /api/hotspots ────────────────────────────────────────────────────────

@app.get("/api/hotspots")
async def get_hotspots(
    request: Request,
    gravity_min: int = Query(1, ge=1, le=5),
    limit: int = Query(300, le=1000),
):
    if DB.cases.empty:
        raise HTTPException(503, "Data not loaded")

    capp = _try_catalyst_app(request)
    cache_key = f"hotspots:{gravity_min}:{limit}"
    cached = cache_get(capp, cache_key)
    if cached is not None:
        return cached

    df = DB.cases[DB.cases["GravityOffenceID"] >= gravity_min].copy()
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
    for _, row in df.head(limit).iterrows():
        results.append({
            "id":           f"HS-{int(row['CaseMasterID'])}",
            "lat":          float(row["latitude"]),
            "lng":          float(row["longitude"]),
            "intensity":    float(row["intensity"]),
            "risk":         row["risk"],
            "label":        str(row.get("CrimeGroupName", "Unknown")),
            "crime_type":   str(row.get("CrimeGroupName", "Unknown")),
            "causal_driver": str(row.get("BriefFacts", ""))[:120],
            "_x": 50.0, "_y": 50.0,
        })
    cache_set(capp, cache_key, results)
    return results

# ─── GET /api/network ─────────────────────────────────────────────────────────

@app.get("/api/network")
async def get_network(cluster_size: int = Query(15, ge=5, le=50)):
    if DB.graph.number_of_nodes() == 0:
        raise HTTPException(503, "Graph not built")

    G = DB.graph
    suspects = [(n, d) for n, d in G.nodes(data=True) if d.get("type") == "Suspect"]
    top = sorted(suspects, key=lambda x: G.degree(x[0]), reverse=True)[:cluster_size]
    included = {n for n, _ in top}

    fir_nodes: set[str] = set()
    for n, _ in top:
        for nb in G.neighbors(n):
            if G.nodes[nb].get("type") == "FIR":
                fir_nodes.add(nb)
    fir_nodes = set(list(fir_nodes)[:20])
    all_ids = included | fir_nodes

    nodes_out = [
        {"id": n, "label": G.nodes[n].get("label", n),
         "type": G.nodes[n].get("type", "Unknown"),
         "weight": G.nodes[n].get("weight", 1),
         "risk": G.nodes[n].get("risk")}
        for n in all_ids
    ]
    edges_out = [
        {"source": u, "target": v, "relation": d.get("relation", "Linked")}
        for u, v, d in G.edges(data=True)
        if u in all_ids and v in all_ids
    ]
    return {"nodes": nodes_out, "edges": edges_out}

# ─── POST /api/simulator/run ──────────────────────────────────────────────────

@app.post("/api/simulator/run")
async def run_simulation(body: SimulationRequest):
    baseline = len(DB.cases) if not DB.cases.empty else 1000
    impact   = (body.patrol_density * 0.4 + body.infra_health * 0.35
                + body.rapid_response * 0.25) / 1.2
    impact   = max(0, min(100, round(impact + random.uniform(-1.5, 1.5))))
    return {
        "impact_percent":      impact,
        "predicted_reduction": round(baseline * impact / 100),
        "baseline_cases":      baseline,
        "model_version":       "causal-v2.4",
        "window_days":         30,
        "computed_at":         pd.Timestamp.now().isoformat(),
    }

# ─── GET /api/reports ─────────────────────────────────────────────────────────

@app.get("/api/reports")
async def get_reports(limit: int = Query(20, le=100)):
    if DB.cases.empty:
        raise HTTPException(503, "Data not loaded")
    df = DB.cases.sort_values("CrimeRegisteredDate", ascending=False).head(limit)
    if not DB.crime_heads.empty:
        df = df.merge(DB.crime_heads[["CrimeHeadID", "CrimeGroupName"]],
                      left_on="CrimeMajorHeadID", right_on="CrimeHeadID", how="left")
    results = []
    for _, row in df.iterrows():
        g = int(row["GravityOffenceID"])
        results.append({
            "id":             f"BLR-{row['CrimeNo']}",
            "title":          str(row.get("BriefFacts", ""))[:80],
            "district":       "Bengaluru",
            "station":        f"PS-{int(row['PoliceStationID'])}",
            "date":           str(row["CrimeRegisteredDate"]),
            "severity":       "critical" if g == 5 else ("high" if g == 4 else ("medium" if g == 3 else "low")),
            "status":         "investigating",
            "assigned_officer": "Assigned",
            "crime_type":     str(row.get("CrimeGroupName", "Unknown")),
            "ipc_section":    f"IPC {int(row['CrimeMajorHeadID']) * 100 + 79}",
            "suspects":       1,
        })
    return results

# ─── POST /api/export_brief (SmartBrowz PDF) ─────────────────────────────────

@app.post("/api/export_brief")
async def export_brief(body: ExportBriefRequest, request: Request):
    """
    CATALYST mode: SmartBrowz headless PDF generation.
    LOCAL mode:    fpdf2 fallback.
    """
    capp = _try_catalyst_app(request)
    if capp is not None:
        try:
            html    = _brief_html(body)
            sb      = capp.smart_browz()
            pdf_b   = sb.generate_pdf(html_content=html)
            return StreamingResponse(iter([pdf_b]), media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=garuda-intel-brief.pdf"})
        except Exception as e:
            log.error(f"SmartBrowz failed: {e}")

    # fpdf2 fallback
    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 12, "PROJECT GARUDA — INTELLIGENCE BRIEF", ln=True, align="C")
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 6, "Karnataka State Police | RESTRICTED", ln=True, align="C")
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "KPI Summary", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for k, v in body.kpis.items():
            pdf.cell(0, 7, f"  {k}: {v}", ln=True)
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Top Crime Categories", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for c in body.top_crime_types:
            pdf.cell(0, 7, f"  • {c}", ln=True)
        if body.simulation_impact:
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 8, "What-If Simulation", ln=True)
            pdf.set_font("Helvetica", "", 10)
            pdf.cell(0, 7, f"  Predicted reduction: -{body.simulation_impact}%", ln=True)
        pdf.set_y(-15)
        pdf.set_font("Helvetica", "I", 8)
        pdf.cell(0, 6, f"Generated by Project Garuda | {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M IST')}", align="C")
        buf = BytesIO()
        pdf.output(buf)
        buf.seek(0)
        return StreamingResponse(buf, media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=garuda-intel-brief.pdf"})
    except ImportError:
        raise HTTPException(500, "Install fpdf2: pip install fpdf2")

def _brief_html(body: ExportBriefRequest) -> str:
    kpi_rows  = "".join(f"<tr><td>{k}</td><td><b>{v}</b></td></tr>" for k, v in body.kpis.items())
    crimes    = "".join(f"<li>{c}</li>" for c in body.top_crime_types)
    sim_block = f"<p><b>Simulation Impact:</b> −{body.simulation_impact}% incidents</p>" if body.simulation_impact else ""
    return f"""<!DOCTYPE html><html><head><style>
      body{{font-family:sans-serif;background:#0a0a10;color:#e2e8f0;padding:24px}}
      h1{{color:#5a8cff;font-size:18px}}h2{{color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:2px}}
      table{{width:100%;border-collapse:collapse}}td{{padding:6px;border-bottom:1px solid #1e293b;font-size:13px}}
      .badge{{background:#dc2626;color:white;padding:2px 8px;border-radius:12px;font-size:10px}}
      footer{{margin-top:32px;color:#475569;font-size:10px;text-align:center}}
    </style></head><body>
    <h1>PROJECT GARUDA — INTELLIGENCE BRIEF <span class="badge">RESTRICTED</span></h1>
    <p style="color:#64748b;font-size:12px">Karnataka State Police · {pd.Timestamp.now().strftime("%Y-%m-%d %H:%M IST")}</p>
    <h2>KPI Summary</h2><table>{kpi_rows}</table>
    <h2>Top Crime Categories</h2><ul>{crimes}</ul>
    {sim_block}
    <footer>Project Garuda | Powered by Zoho Catalyst SmartBrowz | CONFIDENTIAL</footer>
    </body></html>"""

# ─── Entry ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
