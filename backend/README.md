# Project Garuda — FastAPI Backend

## Local Development

```bash
cd backend
pip install -r requirements.txt
python main.py
# API runs at http://localhost:8000
# Swagger docs at http://localhost:8000/docs
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hotspots` | Crime hotspots with causal drivers |
| GET | `/api/network` | Criminal network graph (nodes + edges) |
| POST | `/api/simulator/run` | Causal impact simulation |
| GET | `/api/kpi` | Executive KPI metrics |
| POST | `/api/ask` | QuickML-planned, backend-executed bilingual analysis |
| POST | `/api/admin/seed-datastore` | Protected resumable Data Store chunk upload |
| GET | `/health` | AppSail health check |

## Scale Data and Upload

```powershell
python scale_data.py --target-cases 100000
$env:SEED_TOKEN = "<AppSail SEED_TOKEN>"
python upload_data.py --base-url https://garuda-api-<id>.catalystappsail.com
```

The uploader preserves and skips the existing seeded prefix recorded in `data/scale_manifest.json`. See the root `DEPLOY.md` and `QUICKML_INTEGRATION.md` for deployment and AI configuration.

## Zoho Catalyst AppSail Deployment

1. Ensure `$X_ZOHO_CATALYST_LISTEN_PORT` is used (already wired in `main.py`)
2. `catalyst deploy` from the repo root
3. Set runtime to Python 3.11 in AppSail config
