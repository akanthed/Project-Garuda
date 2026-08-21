# Project Garuda — Threat Model & Security Review

Scope: the deployed system (frontend on Catalyst Web Client Hosting, backend on Catalyst
AppSail). This is a hackathon prototype handling **synthetic** crime data — no real
case, victim, or officer PII exists in this deployment. Findings below reflect that
context: controls are proportionate to a prototype, not a certified production system
(see "What this does NOT prove" at the end).

## 1. Assets & trust boundaries

| Asset | Where | Sensitivity |
|---|---|---|
| Officer session token | HMAC-signed, `sessionStorage` client-side | Medium — grants role-scoped read access to synthetic case data |
| `SESSION_SECRET` | AppSail env var | High — compromise lets an attacker forge any officer session |
| `SEED_TOKEN` | AppSail env var | High — gates bulk data-store writes/reloads |
| Case/accused/arrest data | CSV on AppSail disk + optional Catalyst Data Store | Low (synthetic) in this deployment; would be High with real data |
| Demo login credentials | `src/lib/auth.ts` dev-only fallback | Low — dev/demo only, now excluded from production bundles (§3) |

Trust boundary: browser (untrusted) → Catalyst API Gateway/AppSail (backend, trusted
compute) → local CSV / Catalyst Data Store (trusted storage). All authorization
decisions are made server-side; the client never receives data it isn't scoped to see
beyond what each endpoint already returns.

## 2. Fixed this phase (Phase 7)

- **Auth-bypass in admin endpoints**: `POST /api/admin/seed-datastore` and
  `POST /api/admin/reload-from-datastore` compared
  `request.headers.get("X-Seed-Token") != os.environ.get("SEED_TOKEN")` directly. If
  `SEED_TOKEN` was never set, both sides evaluate to `None`, and `None != None` is
  `False` — the check silently passed, i.e. **anyone could call these endpoints with no
  token at all** as long as the operator forgot to set `SEED_TOKEN`. Fixed with
  `_require_admin_token()`: deny-by-default when either side is missing, and
  `hmac.compare_digest()` for a timing-safe comparison instead of `!=`.
- **Insecure default secret shipped silently**: `SESSION_SECRET` defaulted to the
  literal string `"dev-insecure-secret-change-me"` with no check that a real value was
  ever configured. Fixed with `_assert_production_secrets_configured()`, called from
  `lifespan()` *outside* the existing try/except (so it cannot be swallowed) — it now
  hard-fails startup if the app is running under Catalyst AppSail
  (`X_ZOHO_CATALYST_LISTEN_PORT` present, the same signal already used to distinguish
  local dev from a real deploy) and `SESSION_SECRET` is still the default. Verified live:
  simulating the AppSail env var with the default secret makes `python main.py` crash
  during `lifespan()` instead of serving forgeable sessions.
- **Internal error detail leakage**: the global exception handler and both admin
  endpoints returned `f"{type(exc).__name__}: {exc}"` to the client — stack-trace-adjacent
  detail (module names, internal state) reaching an untrusted caller. Fixed: the client
  now receives a generic `{"error": "Internal server error", "request_id": "..."}`; the
  full exception is still logged server-side via `log.exception(...)` for debugging.
- **No request correlation ID**: added `request_id_middleware` — every response carries
  an `X-Request-ID` header (accepts an inbound one for trace continuity, otherwise
  generates a UUID4), and the same ID appears in both the error response body and the
  server log line, so a judge/operator-reported error can be traced to one log entry
  without exposing internals.
- **`/health` had no version/readiness signal**: now reports `ready` (false if CSV data
  never loaded), `schema_version` and `data_generated_at` (sourced from
  `backend/data/scale_manifest.json`), so a load balancer or operator can distinguish
  "up but not serving real data yet" from "fully ready", and confirm which data
  generation the running instance is on.
- **Client-side demo credentials shipped to production bundles**: `src/lib/auth.ts`'s
  `DEV_FALLBACK_REGISTRY` (4 plaintext demo badge/password pairs) previously existed in
  every build unconditionally, only *conditionally used* at runtime based on
  `VITE_API_URL`. If a production build were ever deployed without `VITE_API_URL` set,
  the app would silently accept those demo logins as if legitimate. Fixed two ways:
  1. `DEV_FALLBACK_REGISTRY` is now gated behind `import.meta.env.DEV`, a compile-time
     constant Vite/Rollup replaces with `false` in production builds — the entire
     object (including the passwords) is dead-code-eliminated, not just skipped at
     runtime. **Verified**: grepped the built `dist/assets/*.js` for all 4 demo
     passwords after `npm run build` — zero matches.
  2. `vite.config.ts` now hard-fails `vite build --mode production` if `VITE_API_URL`
     is unset, so a misconfigured production build cannot ship at all.
     **Verified**: temporarily removed `.env.production` and confirmed
     `npx vite build` throws and exits non-zero; restored and confirmed the build
     succeeds again.

## 3. Reviewed, no change needed

- **CORS**: Catalyst's AppSail gateway already injects a real (non-wildcard,
  origin-restricted) `Access-Control-Allow-Origin` header in production; the app's own
  `CORSMiddleware` is added only when `X_ZOHO_CATALYST_LISTEN_PORT` is absent (i.e. local
  dev), controlled by `ALLOWED_ORIGINS`. No change required — this was already correct
  (see repo memory for how the duplicate-ACAO-header bug that led to this design was
  found).
- **Session verification**: `verify_session()` already used `hmac.compare_digest()` for
  the signature check (not `==`) and rejects expired tokens. No change needed.
- **OpenAPI (`/docs`, `/openapi.json`) exposure**: left public. This is a judged hackathon
  prototype serving only synthetic data with no destructive unauthenticated endpoints
  (every mutating/admin endpoint requires a session or the seed token); the API surface
  being inspectable is a reasonable, explicit trade-off for evaluator transparency, not
  an oversight. Would be revisited (auth-gated or disabled) before any real-data pilot.
- **Catalyst Authentication (native login/signup service) — deliberately not adopted**:
  investigated as a candidate to replace the hand-rolled HMAC session system, since the
  challenge's Catalyst-service-mapping guidance lists Catalyst Authentication as the
  required service for "user auth/login/signup." Both native modes (Hosted and Embedded)
  were inspected directly in the Console, and Zoho's own "User Management" documentation
  confirms every path to add a user (Console, SDK, API, or self-signup) sends an **email
  invite** through which the user sets their own password — there is no admin-settable
  fixed username/password pair. This is incompatible with the evaluation model this
  project needs: judges must be able to log in instantly with a pre-set badge/password
  (e.g. `KSP-BLR-7741` / `sentinel2026`), with no email round-trip. Migrating would have
  either required evaluators to receive and act on a real email, or fabricating email
  addresses we don't control inboxes for — neither is viable for live judging. The
  hand-rolled system (HMAC sessions, PBKDF2-hashed passwords, `Officers` Data Store
  table) is kept **by deliberate, researched decision**, not because Catalyst
  integration was skipped for convenience.
- **Catalyst Connections — adopted instead, for QuickML.** The QuickML OAuth
  relationship (originally a manually-generated, non-refreshing 1-hour access token —
  see `QUICKML_INTEGRATION.md`) now runs through the "Catalyst by Zoho" pre-built
  Connections service (`capp.connections().get_connection_credentials(...)`), which
  Catalyst refreshes server-side automatically. This is the correct, lower-risk
  Catalyst-native adoption target: unlike Authentication, it manages a machine-to-machine
  credential, not an end-user login flow, so it carries none of the email-invite
  incompatibility above.

## 4. Tracked-file / git-history secret audit

Ran `git ls-files` + `git log --all --diff-filter=A --name-only` filtered for
`.env*`, `*.pem`, `*.key`, `vendor/`, `.venv*`, and a regex secret-scan
(`git grep -nIE`) for AWS-style keys, PEM private-key headers, and hardcoded
`password=`/`secret=`/`api_key=` literals across the full tracked tree.

**Findings:**
- `.env.production` is tracked despite being listed in `.gitignore` under "Environment &
  Secrets (DO NOT COMMIT)". Content-inspected: it contains exactly one line,
  `VITE_API_URL=<public AppSail URL>` — the same URL any browser network tab already
  reveals once the app loads, i.e. not a secret. Left tracked (evaluators need it for a
  reproducible `npm run build` from a fresh clone); the `.gitignore` comment overstates
  its sensitivity but no actual exposure exists. **Recorded, not "fixed"** — untracking it
  would break the plan's own "verify clean public clone can still build" goal.
- `catalyst.json`, `.catalystrc`, `backend/app-config.json` are tracked despite being
  listed as "Sensitive Configuration Files ... may have API keys". Content-inspected all
  three: they contain only build paths, the Zoho project ID/domain ID/environment ID,
  the AppSail start command, and non-secret env vars (`ZIA_RISK_MODEL_ID`,
  `ALLOWED_ORIGINS`, `LOG_LEVEL`) — **no `SESSION_SECRET`, `SEED_TOKEN`, or any API key
  is present in any tracked file**; those two are set only via the Catalyst Console UI
  (confirmed in repo memory — Console rejects reserved keywords, forcing manual entry
  outside version control). The Zoho project/domain/env IDs are a minor information
  disclosure (confirms which Zoho org owns this deployment) but are not credentials and
  cannot be used to authenticate. Left as-is: `catalyst.json`/`.catalystrc` are needed
  for `catalyst deploy` to work from a fresh clone.
- No AWS-style keys, PEM private key blocks, or hardcoded `password=`/`secret=` literals
  found anywhere in the tracked tree (`.py`, `.ts`, `.tsx`, `.json`) outside the
  already-known and now-gated `DEV_FALLBACK_REGISTRY` demo passwords in `src/lib/auth.ts`.
- `backend/vendor/`, `backend/.venv-test/`, `.venv-gen/` — confirmed **not tracked**
  (`git ls-files` returns zero matches for any of the three).

**Conclusion:** no real secret has ever been committed to this repository. The public
clone is clean.

## 5. What this does NOT prove

- No penetration test, dependency CVE scan, or third-party security audit has been run.
- No real personal data has ever touched this system — the DPDP Act 2023 considerations
  in `MODEL_CARD.md` apply to a *future* real-data pilot, not this deployment.
- Rate limiting (`rate_limit_middleware`) is a simple in-process per-IP counter — it
  resets on restart and does not survive multiple AppSail instances; adequate for a
  single-instance hackathon demo, not for real-world DDoS resistance.
- `SEED_TOKEN`/`SESSION_SECRET` rotation, key management, and secret-scanning-on-commit
  (pre-commit hook / CI gate) are not set up — this was a one-time manual audit, not a
  continuously enforced control.
