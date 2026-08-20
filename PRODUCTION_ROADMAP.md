# Project Garuda — Load Test Results, Cost Model & Production Roadmap

Phase 7 (production proof) deliverable. Read alongside [THREAT_MODEL.md](THREAT_MODEL.md)
(security) and [MODEL_CARD.md](MODEL_CARD.md) (responsible AI). This document proves
**prototype-scale concurrency handling on a single AppSail-class instance** — it does
**not** certify production capacity at real scale, and says so explicitly throughout.

## 1. Load test methodology

`backend/load_test.py` is a self-contained script: it boots `main.py` as a fresh
subprocess (timing cold start), logs in as a demo officer, then fires concurrent
request bursts at a mix of 7 endpoints that mirrors real dashboard traffic
(`/health`, `/api/kpis`, `/api/hotspots`, `/api/districts`, `/api/anomalies`,
`/api/network/kingpins`, `/api/network/communities`) at three concurrency levels —
10, 50, and 100 simulated concurrent officers, 5 requests per endpoint per simulated
user (350 / 1,750 / 3,500 total requests per level). Server process memory (RSS,
summed across the process tree — see §4 gotcha) is sampled every 200ms throughout.

Run it yourself: `cd backend; .venv-test\Scripts\python.exe load_test.py`
(installs: `pip install -r requirements-dev.txt`). Full machine-readable output:
`backend/data/load_test_report.json`.

**Environment**: local Windows dev machine (not the real AppSail container), single
`uvicorn` worker (matches the deployed `app-config.json` — no `--workers` flag set),
124,000-case / 44,766-node dataset fully loaded. Real AppSail CPU/RAM allocation may
differ from this dev machine, so absolute numbers are indicative, not a guarantee of
deployed performance — the qualitative bottleneck finding (§3) is the more durable result.

## 2. Measured results (2026-08-20)

| Concurrency | Total requests | p50 | p95 | p99 | Throughput | Error rate | Server RSS (max) |
|---|---|---|---|---|---|---|---|
| 10  | 350   | 128.7 ms  | 886.3 ms  | 913.1 ms  | 34.27 req/s | 0.0% | 245.6 MB |
| 50  | 1,750 | 1,380.9 ms | 1,994.7 ms | 2,156.4 ms | 34.24 req/s | 0.0% | 258.0 MB |
| 100 | 3,500 | 2,933.5 ms | 3,275.6 ms | 3,351.6 ms | 34.46 req/s | 0.0% | 273.6 MB |

Cold start (fresh process → first ready `/health`): **6.84 seconds** (dominated by
CSV load + graph build + network analytics precompute — all logged with timing in
`backend/main.py`'s startup log lines).

## 3. Honest interpretation

- **Zero errors at every level, including 100 concurrent officers** — a real, positive
  result. Nothing crashed, timed out unrecoverably, or returned 5xx under load.
- **Throughput is flat (~34 req/s) at every concurrency level, while p50/p95/p99 scale
  up almost linearly with concurrency** (10→50 users: p50 ~10.7x higher; 50→100: p50
  ~2.1x higher). This is the signature of **queueing behind a fixed-size worker pool,
  not the system failing** — the server accepts every request and eventually serves it
  correctly, but a single `uvicorn` worker (no `--workers` flag, matching production
  `app-config.json`) processes FastAPI's synchronous route handlers via a bounded
  thread pool, so requests beyond that pool's capacity wait in a queue rather than
  running in parallel. This is why 100 concurrent users doesn't 34x the failure rate —
  it just makes everyone wait longer for their turn.
- **This measured behavior is the correct basis for the roadmap** (§5), not a guess:
  the fix is more worker processes / horizontal AppSail scaling, not error handling or
  algorithmic changes — the existing per-scope response cache (`cache_get`/`cache_set`,
  Phase 2) already avoids redundant computation on repeated identical queries within
  its TTL, so the bottleneck is concurrency capacity, not wasted work.
- **Memory stayed bounded and grew only modestly** (245.6 MB → 273.6 MB, +11% from 10
  to 100 concurrent users) — no runaway leak signature during the test's duration.

## 4. A real measurement gotcha worth recording

The first load test run reported an implausible **4.0 MB** server memory usage at every
concurrency level (clearly wrong for a pandas/networkx process holding 124k rows and a
44,766-node graph). Root cause, confirmed empirically: launching `.venv-test/Scripts/
python.exe main.py` via `subprocess.Popen` on this Windows setup spawns uvicorn's real
worker as a **child process** (visible in uvicorn's own log line, `Started server
process [<child-pid>]`, even with `reload=False`) — the parent PID `subprocess.Popen`
returns is a ~4 MB launcher shim, not the real interpreter. `load_test.py`'s
`MemorySampler` was fixed to sum RSS across the tracked PID **and all its recursive
children** (`psutil.Process(pid).children(recursive=True)`), which reproduced the
correct ~230–275 MB figures shown above (cross-checked independently against Windows'
own `Get-Process` `WorkingSet64` counter, not just psutil, to rule out a library-specific
bug). Also fixed along the way: the in-app per-IP rate limiter (`_RATE_LIMIT_MAX = 120
req/60s`) legitimately rejected most requests during a same-machine load test where every
simulated "user" shares one source IP — a different signal than genuine per-officer
request volume in production (many distinct IPs). `_RATE_LIMIT_MAX_REQUESTS`/
`RATE_LIMIT_WINDOW_SECONDS` are now env-configurable so a load test run can raise this
ceiling for itself without changing the production default.

## 5. Tier 2: cost model & decade roadmap

### Cost estimate (indicative, not billed/measured — Zoho Catalyst console access to
real billing was not available in this session; based on published AppSail/Web Client
Hosting tiers and the measured resource footprint above)

| Scale | Compute implication | Rough monthly cost driver |
|---|---|---|
| Pilot (1 district, ~50 officers, current 10-100 concurrent test range) | Current single AppSail instance (512 MB) is adequate — measured p95 stays under ~3.3s even at 100 concurrent, zero errors | 1 AppSail instance + Web Client Hosting + Data Store rows ≈ current spend |
| State rollout (9 districts, ~1,000 officers, bursty ~100-300 concurrent) | Needs horizontal scaling (multiple AppSail instances behind a load balancer) or `--workers N` per instance, since §3 shows one worker saturates around 30-35 req/s regardless of concurrency | Scales roughly linearly with instance count; the queueing bottleneck (not data volume) is the primary driver at this tier |
| Full production (10M+ real records, 10,000+ officers) | Data Store/ZCQL query performance at 10M+ rows, not yet measured (this session's data is 124k rows); would need the Cron/Job Scheduling precompute pattern from the Zoho maximization plan (nightly analytics instead of per-request) to keep per-request latency flat regardless of officer count | Dominated by Data Store row count + AppSail instance-hours; needs a real Catalyst pricing calculator pass with actual projected row/user counts, not estimated here |

**Per-1,000-users / per-million-records unit costs are not stated as specific figures**
here because doing so without actual Catalyst billing data would be fabricating false
precision — exactly the failure mode this whole phase exists to avoid (see the
project's standing rule: "configured model IDs, mocked SDK tests, and generated CSVs
are not proof"). The honest deliverable is the scaling *shape* above, backed by the
measured single-instance ceiling in §2, not an invented dollar figure.

### Decade roadmap: implemented vs. proposed

**Implemented now (this repository, verified):**
- HMAC-signed sessions with fail-fast startup on the default secret (§ THREAT_MODEL.md).
- Timing-safe admin token check, deny-by-default when unset.
- Per-IP rate limiting (in-app, since Catalyst API Gateway cannot front AppSail).
- Request-ID correlated, internals-free error responses.
- Deep network analytics precomputed once per graph build (not per-request).
- Per-scope response caching with TTL (Phase 2).
- Production build fails without `VITE_API_URL`; dev credential registry dead-code-
  eliminated from production bundles.
- Measured load test evidence (this document) instead of assumed capacity.

**Proposed roadmap (not implemented — would need dedicated scoping, real Catalyst
billing access, and a production-data pilot before committing):**
1. **Horizontal AppSail scaling / multiple uvicorn workers** — directly targets the
   §3 bottleneck; the single clearest next step, backed by this session's own data.
2. **Cron/Job Scheduling precompute** (already identified in the team's Zoho
   maximization plan) — move centrality/community/forecast recomputation off the
   request path entirely, so per-request latency stops depending on dataset size.
3. **Catalyst Authentication / User Management** — replace hand-rolled HMAC sessions
   and the client dev-credential fallback with a managed identity service; the
   single biggest security-rubric and maintenance win identified but not executed
   in this session (scoping a real migration was out of budget here).
4. **Real secret rotation + CI secret-scanning gate** — this phase's audit (§ THREAT_MODEL.md
   §4) was a one-time manual pass, not a continuously enforced control.
5. **Load testing against the real deployed AppSail instance at real Data Store row
   counts (millions, not 124k)** — this session's numbers are a local dev-machine
   proxy; a decade-scale claim needs the real target infrastructure and real data
   volume, neither of which was available here.
6. **A verified (not estimated) Catalyst cost model** once real usage/billing data
   exists, replacing the qualitative table above with actual figures.

This roadmap intentionally does not claim any of the six items above are done — they
are scoped and prioritized, not built, and are separated here from what is actually
implemented and verified today.
