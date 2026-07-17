# Project Garuda — Zoho Catalyst Deployment Guide

## Prerequisites
```bash
npm install -g zcatalyst-cli
catalyst login
```
> The correct package is `zcatalyst-cli` (not `@zohocloud/catalyst-cli`, which does not exist on npm). `catalyst login` opens a browser window to authenticate with your Zoho account.

---

## 1. Initialize Catalyst Project (run once)
```bash
cd sentinel-gleam-97
catalyst init
# The CLI will prompt you to select/create resources (Functions, AppSail, Client).
# Choose "Use an existing project" and select Project Garuda from the list.
# This creates catalyst.json in your root.
```
> If a project is already linked and you only need to switch/select the active one, use `catalyst project:use <name_or_project_id>` instead of a full `init`.

---

## 2. Generate Synthetic Data (before deploying backend)
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate        # Windows
pip install -r requirements.txt
python generate_data.py        # Creates data/*.csv
```

---

## 3. Upload Data to Catalyst Data Store
1. Open Zoho Catalyst Console → Data Store
2. Create 5 tables: `CaseMaster`, `Accused`, `CrimeHead`, `ArrestSurrender`, `Officers`
3. Import each CSV from `backend/data/` for the first 4 tables
4. Populate `Officers` with columns `Badge, Name, Designation, Station, Clearance, Node, PasswordHash` (see `hash_password()` in `backend/main.py` for the hashing scheme) — used by `POST /api/auth/login`. If this table is empty or missing, the backend falls back to its local demo registry.
5. Verify FK relationships

---

## 3.5 Activate Zia Translate & SmartBrowz (required — these are opt-in per project)

`backend/main.py` already calls `capp.zia().translate(...)` (in `/api/translate`) and `capp.smart_browz().generate_pdf(...)` (in `/api/export_brief`), each wrapped in a try/except that silently falls back to a local passthrough/`fpdf2` implementation if the call fails. **Unlike Data Store, Zia and SmartBrowz are not enabled by default on a new Catalyst project** — the fallback firing on every request (verified against the live AppSail instance: `/api/translate` returns `"source":"fallback"` and `/api/export_brief` throws even in production) means these two services have never actually been turned on for this project. There is no `catalyst` CLI command for this — it must be done in the console:

1. Open [catalyst.zoho.com](https://catalyst.zoho.com) → select **Project Garuda**.
2. In the left sidebar, find **Zia** (usually under an "AI & ML" or "Cognitive Services" group) → enable/activate it for this project, and confirm **Translate** is included in the enabled capabilities.
3. In the left sidebar, find **SmartBrowz** (usually under "Advanced I/O" or a similar group) → enable/activate it for this project.
4. Some Catalyst plans require accepting an add-on billing/quota consent screen the first time a service is enabled — complete that if prompted.
5. Re-deploy is **not** required just for enabling a service (it's a project-level toggle, not code), but redeploy anyway if you've also picked up the em-dash PDF fix (see step 4 below).

**Verify activation worked** (from anywhere, no CORS restriction via curl/PowerShell):
```bash
curl -X POST https://garuda-api-<project-id>.catalystappsail.com/api/translate \
  -H "Content-Type: application/json" \
  -d '{"texts":["Robbery reported near MG Road"],"target_language":"kn"}'
# Look for "source":"zia" instead of "source":"fallback"

curl -X POST https://garuda-api-<project-id>.catalystappsail.com/api/export_brief \
  -H "Content-Type: application/json" \
  -d '{"kpis":{"Cases":"5000"},"hotspot_count":5,"top_crime_types":["Theft"]}' \
  -o brief.pdf
# Should return a valid PDF (check size > 0) instead of a 500 JSON error
```

---

## 4. Deploy Backend to AppSail

**Catalyst does NOT run `pip install` on the server for Catalyst-Managed Python runtimes.** Dependencies must be vendored locally (as Linux wheels, since AppSail runs on `manylinux` regardless of your local OS) into `backend/vendor` before every deploy that changes `requirements.txt`:

```bash
cd backend
python -m pip install -r requirements.txt --target vendor `
  --platform manylinux2014_x86_64 --python-version 3.11 `
  --implementation cp --abi cp311 --only-binary=:all:
# Optional cleanup to shrink the payload:
Get-ChildItem vendor -Recurse -Directory -Include "tests","testing","__pycache__" | Remove-Item -Recurse -Force
```
`backend/vendor` is gitignored — it's a build artifact, regenerate it whenever dependencies change, and always before a fresh-machine deploy.

`app-config.json` wires this up:
```json
{
  "command": "sh -c 'python3 -m uvicorn main:app --host 0.0.0.0 --port ${X_ZOHO_CATALYST_LISTEN_PORT}'",
  "env_variables": { "PYTHONPATH": "vendor", "...": "..." }
}
```
> **Critical:** AppSail executes the startup `command` directly, with **no shell** — `$VAR` is never expanded unless you wrap it in `sh -c '...'`. Without the `sh -c` wrapper, uvicorn receives the literal string `"$X_ZOHO_CATALYST_LISTEN_PORT"` as `--port` and crashes with a generic "Execution failed. Please check the startup command or port." error. Also prefer `python3 -m uvicorn` over a bare `uvicorn` command — the vendored packages don't include a working console-script entry point for the remote Linux binary.

```bash
cd backend
# If AppSail hasn't been associated with this project directory yet:
catalyst appsail:add
# Follow prompts: select "Catalyst-Managed Runtime" → Python → set build path to the backend/ folder.
# This uses the existing app-config.json (already wired for $X_ZOHO_CATALYST_LISTEN_PORT).

# Then deploy (from the repo root, so catalyst.json is picked up correctly):
cd ..
catalyst deploy
```

**Critical:** `app-config.json` uses `${X_ZOHO_CATALYST_LISTEN_PORT}` — never hardcode a port.

After deployment, the CLI prints your AppSail endpoint URL, e.g.:
`https://garuda-api-<project-id>.catalystappsail.com`

Verify it actually started (not just uploaded):
```bash
curl https://garuda-api-<project-id>.catalystappsail.com/health
```

---

## 5. Build Frontend for Deployment
```bash
cd sentinel-gleam-97
# Set your AppSail URL
echo "VITE_API_URL=https://garuda-api-<project-id>.catalystappsail.com" > .env.production
npm run build
# Output: dist/
```

---

## 6. Deploy Frontend to Web Client Hosting
```bash
# Run once, from the project root, to register the client directory:
catalyst client:setup
# Select client type "Basic" (or the closest match for a Vite static build) and
# point it at the dist/ output directory.

# Then deploy all resources (functions, client, appsail, API gateway) in one shot:
catalyst deploy
```
> There is no `catalyst hosting push` command — deployment of the client happens through `catalyst deploy` (or `catalyst deploy client` to deploy only the client) after it's been configured with `client:setup`.

In Catalyst Console → Web Client Hosting, you can confirm the client named `garuda-frontend` (or whatever name you gave it during setup) and its assigned domain / `*.catalystapps.com` URL.

---

## 7. Set Environment Variables in Catalyst Console
AppSail → Environment Variables:
```
CATALYST_PROJECT_ID=<your-project-id>
ALLOWED_ORIGINS=https://garuda-frontend-<id>.catalystapps.com
SESSION_SECRET=<a long random string, generate with: openssl rand -hex 32>
```
> `ALLOWED_ORIGINS` replaces the previously wide-open `allow_origins=["*"]` CORS setting. `SESSION_SECRET` signs officer login tokens — without setting it, an insecure default is used, so this is required before going to production.

Web Client Hosting → Build Settings:
```
VITE_API_URL=https://garuda-api-<project-id>.catalystappsail.com
```

---

## 8. Verify Deployment
```
Frontend: https://garuda-frontend-<id>.catalystapps.com
Backend:  https://garuda-api-<id>.catalystappsail.com/docs
Health:   https://garuda-api-<id>.catalystappsail.com/health
```
