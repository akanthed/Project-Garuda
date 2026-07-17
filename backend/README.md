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
| GET | `/health` | AppSail health check |

## Zoho Catalyst AppSail Deployment

1. Ensure `$X_ZOHO_CATALYST_LISTEN_PORT` is used (already wired in `main.py`)
2. `catalyst deploy` from the repo root
3. Set runtime to Python 3.11 in AppSail config
