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

## 2. Generate the 100k Synthetic Dataset
```bash
cd backend
python -m venv .venv-gen
.\.venv-gen\Scripts\activate
pip install -r requirements-dev.txt
python scale_data.py --target-cases 100000
```

`scale_data.py` preserves the existing CSV prefix already loaded into Data Store, appends relational records with new IDs, and writes `data/scale_manifest.json`. Do not run the original generator after this step because it replaces the files.

---

## 3. Upload Data to Catalyst Data Store
1. Open Zoho Catalyst Console → Data Store
2. Create 6 tables: `CaseMaster`, `Accused`, `CrimeHead`, `ArrestSurrender`, `Officers`, `CaseWorkflowEvents`
3. Populate `Officers` with columns `Badge, Name, Designation, Station, Clearance, Node, PasswordHash` (see `hash_password()` in `backend/main.py` for the hashing scheme) — used by `POST /api/auth/login`. If this table is empty or missing, the backend falls back to its local demo registry.
4. Deploy AppSail so the protected chunk uploader is available.
5. Set the same rotated `SEED_TOKEN` in AppSail and in the local terminal, then run:

```powershell
$env:SEED_TOKEN = "<same rotated value configured in AppSail>"
python backend\upload_data.py --base-url https://garuda-api-<id>.catalystappsail.com
```

The uploader starts from the row counts captured before scaling, sends 200 rows per request, and records progress in the ignored `backend/data/.upload_checkpoint.json`. Re-run the same command after a network failure to resume. Do not use `--reset-checkpoint` unless the appended rows were removed from Data Store.

After upload, refresh AppSail's in-memory analytics and verify the count:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://garuda-api-<id>.catalystappsail.com/api/admin/reload-from-datastore" `
  -Headers @{ "X-Seed-Token" = $env:SEED_TOKEN }
Invoke-RestMethod "https://garuda-api-<id>.catalystappsail.com/health"
```

`CaseWorkflowEvents` is append-only audit data for Reports workflow changes. Create it with these columns: `EventID` (string), `CaseMasterID` (number), `Status` (string), `AssignedOfficer` (string), `UpdatedBy` (string), and `UpdatedAt` (string / ISO-8601 timestamp). The API reads the newest event for each case and never mutates `CaseMaster` source rows.

---

## 3.5 Optional Catalyst services

`POST /api/translate` currently returns supplied narrative text unchanged. The Catalyst Zia Python SDK does not provide a Translate API, so the application should not describe this endpoint as machine translation. Static English/Kannada interface labels are hand-curated in the client.

`POST /api/export_brief` attempts Catalyst SmartBrowz PDF generation through `capp.smart_browz().convert_to_pdf(html)` when available. A local `fpdf2` fallback keeps intelligence brief export usable during local development and if SmartBrowz is unavailable.

QuickML LLM Serving is the generative AI path for Ask Garuda and is available in the IN data center. Follow `QUICKML_INTEGRATION.md` to obtain the endpoint URL, endpoint key, OAuth token, organization ID, and model name. Zia AutoML is not the chosen path because Zoho documents it as unavailable in the IN data center.

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

# Deploy the client independently:
catalyst deploy --only client
```
> There is no `catalyst hosting push` command. Deploy the configured client with `catalyst deploy --only client` so AppSail and its secret-bearing environment are not touched.

In Catalyst Console → Web Client Hosting, you can confirm the client named `garuda-frontend` (or whatever name you gave it during setup) and its assigned domain / `*.catalystapps.com` URL.

---

## 7. Preserve AppSail Environment Variables

`catalyst deploy --only appsail` replaces the complete AppSail environment with the
`env_variables` object in `backend/app-config.json`. Console-only values do not survive a CLI
deployment. The tracked file contains non-secret configuration such as:

```
ALLOWED_ORIGINS=https://garuda-60078749238.development.catalystserverless.in
QUICKML_LLM_ENDPOINT=https://api.catalyst.zoho.in/quickml/v1/project/<project-id>/glm/chat
QUICKML_MODEL=crm-di-glm47b_30b_it
QUICKML_CONNECTION_LINK_NAME=garudaquickml
QUICKML_RISK_MODEL_ID=<model-id>
QUICKML_FORECAST_MODEL_ID=<model-id>
QUICKML_ANOMALY_MODEL_ID=<model-id>
```

The following values are secrets and must never be committed:

```text
SESSION_SECRET
SEED_TOKEN
QUICKML_RISK_ENDPOINT_KEY
QUICKML_FORECAST_ENDPOINT_KEY
QUICKML_ANOMALY_ENDPOINT_KEY
```

For every AppSail deploy, use a local guarded script that:

1. Reads and retains the original `backend/app-config.json` bytes.
2. Prompts for all three 96-character endpoint keys with `Read-Host -AsSecureString`.
3. Generates fresh `SESSION_SECRET` and `SEED_TOKEN` values.
4. Injects those five values only while `catalyst deploy --only appsail` packages the app.
5. Restores the original bytes in a `finally` block and deletes itself.

This invalidates existing browser sessions because `SESSION_SECRET` rotates. Re-login after each
backend deployment. Verify that `backend/app-config.json` is secret-free before committing.

Do not set `CATALYST_PROJECT_ID`; AppSail derives project context from request headers and Catalyst
reserves that variable name. Static `QUICKML_ACCESS_TOKEN` is not required because the connected
`garudaquickml` Catalyst Connection supplies refreshable OAuth headers.

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
