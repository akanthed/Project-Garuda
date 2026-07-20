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
2. Create 6 tables: `CaseMaster`, `Accused`, `CrimeHead`, `ArrestSurrender`, `Officers`, `CaseWorkflowEvents`
3. Import each CSV from `backend/data/` for the first 4 tables
4. Populate `Officers` with columns `Badge, Name, Designation, Station, Clearance, Node, PasswordHash` (see `hash_password()` in `backend/main.py` for the hashing scheme) — used by `POST /api/auth/login`. If this table is empty or missing, the backend falls back to its local demo registry.
5. Verify FK relationships

`CaseWorkflowEvents` is append-only audit data for Reports workflow changes. Create it with these columns: `EventID` (string), `CaseMasterID` (number), `Status` (string), `AssignedOfficer` (string), `UpdatedBy` (string), and `UpdatedAt` (string / ISO-8601 timestamp). The API reads the newest event for each case and never mutates `CaseMaster` source rows.

---

## 3.5 Optional Catalyst services

`POST /api/translate` currently returns supplied narrative text unchanged. The Catalyst Zia Python SDK does not provide a Translate API, so the application should not describe this endpoint as machine translation. Static English/Kannada interface labels are hand-curated in the client.

`POST /api/export_brief` attempts Catalyst SmartBrowz PDF generation through `capp.smart_browz().convert_to_pdf(html)` when available. A local `fpdf2` fallback keeps intelligence brief export usable during local development and if SmartBrowz is unavailable.

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

# Then deploy all resources in one shot:
catalyst deploy
```
> There is no `catalyst hosting push` command. Deploy the configured client with `catalyst deploy`, or use `catalyst deploy --only client` for the client only.

In Catalyst Console → Web Client Hosting, you can confirm the client named `garuda-frontend` (or whatever name you gave it during setup) and its assigned domain / `*.catalystapps.com` URL.

---

## 7. Set Environment Variables in Catalyst Console
AppSail → Environment Variables:
```
ALLOWED_ORIGINS=https://garuda-frontend-<id>.catalystapps.com
SESSION_SECRET=<a long random string, generate with: openssl rand -hex 32>
SEED_TOKEN=<a long random secret used only by protected seed and reload endpoints>
```
> Do not set `CATALYST_PROJECT_ID`: AppSail derives project context from request headers, and Catalyst reserves that variable name. `ALLOWED_ORIGINS` configures local-development CORS; Catalyst manages deployed Web Client origin protection. `SESSION_SECRET` signs officer login tokens and is required before production use.

> Rotate `SESSION_SECRET` and `SEED_TOKEN` in the Catalyst Console before the next deployment. Earlier local configuration values were removed from `backend/app-config.json` and must not be reused.

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
