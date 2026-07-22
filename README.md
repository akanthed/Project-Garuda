# Project Garuda: Spatio-Temporal Graph & Causal Intelligence Platform

  is an enterprise-grade, proactive law enforcement intelligence dashboard designed specifically for the Karnataka State Police (KSP) Datathon 2026. Built entirely within the Zoho Catalyst ecosystem, the platform transforms fragmented crime records from 1,100+ stations into a visually striking, 3D command center that predicts crime vulnerabilities, maps complex criminal syndicates, and models proactive structural interventions.

---

## 🏗️ Architectural Overview

Garuda decouples a data-dense React/Vite user interface from a high-performance Python FastAPI engine, deployed using Zoho Catalyst services.

┌─────────────────────────────────┐
              │      React / Vite Frontend UI   │
              │   (Hosted: Web Client Hosting)  │
              └────────────────┬────────────────┘
                               │
                               │ HTTPS REST APIs
                               ▼
              ┌─────────────────────────────────┐
              │      FastAPI Python Server      │
              │     (Hosted: AppSail Container) │
              └───────┬─────────────────┬───────┘
                      │                 │
        ZCQL Queries  │                 │ PDF generation
                      ▼                 ▼
 ┌───────────────────────┐           ┌───────────────────────┐
 │  Catalyst Data Store  │           │ Catalyst SmartBrowz   │
 │  (Tabular Synthetic)  │           │ (PDF brief export)    │
 └───────────────────────┘           └───────────────────────┘

---

## 🎨 Frontend UI Design Language & Layout Specifications

### Theme & Aesthetics
*   **Design Benchmark:** High signal-to-noise ratio inspired by Palantir Foundry and Linear.
*   **Color Palette:** Ultra-dark mode (`bg-zinc-950`). Borders are minimal, utilizing translucent hair-lines (`border-white/5`). Primary data accents utilize an electric blue, while critical anomalies use a razor-sharp crimson glow.
*   **Typography:** Inter or Geist sans-serif, configured with tight tracking (`tracking-tight`) for high technical legibility.

### Layout Topology (CSS Grid / Flexbox)
1.  **Global Navigation:** An ultra-thin, left-anchored dock containing sleek, unlabelled icons for zero-friction panel switching.
2.  **Executive Core (Top Metric Row):** Four distinct, flat cards showing real-time statistics:
    *   *Total Criminal Nodes Analyzed*
    *   *Spatio-Temporal Hotspot Alerts*
    *   *Causal Risk Volatility Index*
    *   *Resource Deployment Readiness*
3.  **The Command Split (Middle Row - Hero Visuals):**
    *   **Left (2/3 Width):** The *Spatio-Temporal Canvas*. A full-bleed Mapbox GL 3D canvas displaying crime density via raised hexagonal prisms. Features a floating glassmorphic configuration menu in the top right.
    *   **Right (1/3 Width):** The *Syndicate Nexus*. An interactive network graph container rendering complex relational links between suspects, vehicles, and FIR numbers.
4.  **Operational Lab (Bottom Row):** The *What-If Tactical Simulator*. A full-width module housing smooth, responsive sliders that mimic live structural shifts (e.g., modifying Patrol Frequencies or Infrastructure Lighting levels) to forecast crime prevention impacts.

---

## ⚡ API Specifications (Data Handshakes)

The system communicates over a decoupled, secure REST layer. The backend relies on static pre-computations and seeded synthetic relational layers to achieve absolute execution speed.

### 1. Geospatial Hotspots
*   **Endpoint:** `GET /api/hotspots`
*   **Payload Struct:**
```json
[
  {
    "id": "HS-560001",
    "lat": 12.9716,
    "lng": 77.5946,
    "intensity": 0.89,
    "crime_type": "IPC 379 (Property Theft)",
    "causal_driver": "76% correlation with streetlight infrastructure breakdown and local commercial pedestrian density."
  }
]
```

### 2. Criminal Network Graphs
*   **Endpoint:** `GET /api/network`
*   **Payload Struct:**
```json
{
  "nodes": [
    {"id": "C-9081", "label": "K. Ramachandra", "type": "Suspect", "weight": 4},
    {"id": "LOC-MG", "label": "MG Road", "type": "Location", "weight": 2}
  ],
  "edges": [
    {"source": "C-9081", "target": "LOC-MG", "relation": "Frequent Operating Hub"}
  ]
}
```

### 3. AI-Powered Search (Ask Garuda)
*   **Endpoint:** `POST /api/ask`
*   **Request:** `{"query": "cyber crime in Bangalore this month"}`
*   **Response:** `{"results": [...], "suggested_view": "network|reports", "summary": "..."}`
*   **Features:** Kannada language detection, QuickML integration (if trained model available), fallback to keyword matching
🛡️ Zoho Catalyst Native Compliance Matrix
Every software component maps directly to an approved Catalyst module, avoiding third-party point penalties:

Compute (Backend API): Containerized Python FastAPI application executed inside Catalyst AppSail (Managed OCI/Docker runtime), configured to adapt natively to the dynamic environment port variable $X_ZOHO_CATALYST_LISTEN_PORT.

Hosting (Frontend): React/Vite static client deployed to Catalyst Web Client Hosting.

Storage (Tabular Records): Managed synthetic data querying via ZCQL directly inside Catalyst Data Store, including the `Officers` table used for authentication.

Localization Engine: Static UI chrome (nav labels, buttons) uses a hand-curated English/Kannada dictionary. Dynamic narrative translation currently returns a passthrough fallback because the Catalyst Zia SDK does not provide a Translate API; an approved translation provider is required before enabling that workflow.

Authentication: Officer badge/password credentials are verified server-side only (`POST /api/auth/login`) against Catalyst Data Store — never shipped to the client bundle. Sessions use HMAC-signed tokens with a 12-hour expiry.

Caching: `/api/kpis` and `/api/hotspots` responses are cached via Catalyst Cache (with an in-memory TTL fallback for local dev) to avoid recomputation on every request.

Note: Catalyst API Gateway only supports Basic/Advanced I/O Functions and the Web Client as targets — it cannot front an AppSail app directly. AppSail-level protection (CORS origin restriction via `ALLOWED_ORIGINS`, in-app IP rate limiting) is used instead; see `backend/main.py`.

---

## 📊 Current Implementation Status

### Data Scale & Scope
- **100,000+ synthetic cases** (up from 5,000 initial seed)
- **174,000 accused individuals** with relationships
- **122,000 arrests** with temporal/spatial data
- **13,000+ suspect network links**
- **100 police stations** across Karnataka

### Deployed Features ✅
- **Interactive 3D crime hotspot map** (deck.gl hexagon density layer, pitch-tilted 3D feel)
- **Criminal syndicate network graph** (force-directed layout, suspect/location/FIR interconnections)
- **Tactical simulator** (what-if infrastructure intervention modeling with live KPI updates)
- **AI-powered natural language search** (Ask Garuda with Kannada language detection + keyword fallback)
- **Bilingual UI** (English/Kannada via i18n static dictionary + dynamic narrative translation)
- **Dark/Light theme toggle** (localStorage-persisted, Tailwind CSS)
- **Role-based access control** (Constable, Circle Inspector, ACP, DGP with progressively restricted views)
- **PDF export** (automated intelligence brief generation)
- **Catalyst Data Store integration** (100% working, seeding via API or CSV)
- **Zia Auto ML (QuickML)** (ready for model training, full fallback to keyword search)

### Known Issues & Open Work
- **Network graph (LinkGraph.tsx)**: Canvas doesn't auto-resize past 400x360 default; ResizeObserver may not be firing
- **Map layer toggles**: Each button fires toast notification twice per click (likely duplicate event handler)
- **Settings Profile tab**: Hardcoded to "Cpt. R. Vance" regardless of logged-in account
- **Settings Display toggles**: "Compact Cards", "Auto-Refresh", "Map Animations", "Kannada Place Names" are cosmetic stubs
- **Reports endpoint**: Lacks real pagination and filtering; Status filter always returns "investigating" cases only
- **Design UX**: "View matching cases" after crime-type search navigates to Network graph instead of Reports list (design choice, potentially counter-intuitive)

---

## 🚀 Deployment & Local Setup

### Quick Start (Local Development)
```bash
# Frontend
npm install
npm run dev          # Starts Vite dev server on :5173

# Backend (Windows)
cd backend
python -m venv .venv-test
.\.venv-test\Scripts\pip install fastapi uvicorn pydantic networkx pandas fpdf2
.\.venv-test\Scripts\python.exe main.py  # Runs on :8000
```

### 🔐 How to Login to the WebApp

#### Access the Login Page
- **Local dev:** Navigate to `http://localhost:5173` (or the Vite dev URL shown in terminal)
- **Deployed (Catalyst):** Navigate to `https://<your-catalyst-domain>/app/` and you'll be redirected to login

#### Demo Accounts (Pre-populated for Testing)
The login page includes **quick-fill buttons** for four demo officer roles. Click any button to auto-populate the badge/password fields:

| Role | Badge ID | Password | Access Level |
|------|----------|----------|--------------|
| **Constable** | `KSP-BLR-0001` | `demo` | Constable (restricted: Map only, no Network/Simulator views) |
| **Circle Inspector** | `KSP-BLR-7741` | `demo` | Circle Inspector (all views including Network) |
| **ACP** | `KSP-BNG-5500` | `demo` | ACP (all views + full report access) |
| **DGP** | `KSP-HQ-0001` | `demo` | DGP / Director General (admin-level: all views unrestricted) |

#### Manual Login Steps
1. Enter your **Officer Badge ID** (e.g., `KSP-BLR-7741`)
2. Enter your **Password**
3. Click **"Sign In"**
4. On success: Redirected to the Dashboard
5. On error: Error message appears below the login form ("Invalid credentials" or network error)

#### Session Details
- **Session duration:** 12 hours from login
- **Token type:** HMAC-signed, self-verifying (no server-side session storage)
- **Auto-logout:** Refresh token only valid within 12-hour window; stale sessions redirect to login
- **Theme/Language persistence:** Your selected Dark/Light mode and English/Kannada language choice are saved in localStorage and apply across all sessions

#### Features Available After Login
Once logged in, your dashboard displays based on your role:
- **Constable:** Geospatial map only (restricted Network/Simulator)
- **Circle Inspector:** Full dashboard (Map, Network, Reports, Simulator, Settings)
- **ACP:** Full dashboard + expanded report filters + case ownership management
- **DGP:** Full dashboard + admin functions (seed data, QuickML model management)

#### Troubleshooting Login Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| **"Invalid credentials"** | Badge ID or password incorrect | Verify badge ID matches the table above; password is `demo` for test accounts |
| **Blank login page** | Frontend not loaded, network error | Check console (F12 → Network tab); ensure Vite dev server is running (`npm run dev`) |
| **"Network error" after submit** | Backend unreachable | Ensure backend is running (`python main.py` on port 8000); check `VITE_API_URL` env var points to correct backend |
| **Redirected to login after navigation** | Session expired or invalid token | Session duration is 12 hours; re-login if expired |
| **Dark/Light mode not persisting** | localStorage disabled/cleared | Check browser privacy settings; disabled scripts may block localStorage |

---

### Deploy to Zoho Catalyst
See [DEPLOY.md](DEPLOY.md) for full step-by-step guide.

**Quick summary:**
```bash
# Build frontend
npm run build

# Vendor backend dependencies (Linux wheels, one-time before deploy)
cd backend
python -m pip install -r requirements.txt --target vendor \
  --platform manylinux2014_x86_64 --python-version 3.11 \
  --implementation cp --abi cp311 --only-binary=:all:

# Deploy both client + backend
cd ..
catalyst deploy
```

**Key Gotchas:**
1. **AppSail runs commands without shell expansion** — wrap vars in `sh -c '...'` (e.g., `sh -c 'python3 -m uvicorn main:app --port ${X_ZOHO_CATALYST_LISTEN_PORT}'`)
2. **AppSail does NOT auto-install `requirements.txt`** — must vendor deps locally as Linux-compatible wheels (see command above)
3. **zcatalyst-sdk requires fresh per-request init** — call `zcatalyst_sdk.initialize(req=request)` inside each endpoint handler, never at startup
4. **Web Client Hosting path is `/app/`** — ensure `vite.config.ts` has `base: "/app/"` and `src/router.tsx` has `basepath: "/app"`

See [QUICK_DEPLOYMENT.md](QUICK_DEPLOYMENT.md) for rapid 10-minute deployment.

---

## 🔧 Environment Configuration

### Frontend (.env.production)
```
VITE_API_URL=<Catalyst AppSail backend URL>
VITE_MAPBOX_TOKEN=<Your Mapbox GL access token>
```

### Backend (Catalyst AppSail Environment Variables)
- `SEED_TOKEN` — Guard token for `POST /api/admin/seed-datastore`
- `ALLOWED_ORIGINS` — CORS origin whitelist (e.g., `https://example.zoho.com`)
- `SESSION_SECRET` — HMAC session signing key (12+ chars)
- `QUICKML_MODEL_ID` (optional) — Catalyst QuickML trained model ID (if not set, falls back to keyword matching)

---

## 🧠 AI-Powered Search (Ask Garuda) — QuickML Integration

### Current State
- **Fallback mode active:** Keyword matching works reliably for queries like "cyber crime Bangalore", "FIR 12345", "Officer KSP-BLR-7741"
- **Optional QuickML:** If a trained QuickML model is available and `QUICKML_MODEL_ID` is set, the system uses semantic understanding instead of keywords

### To Enable Full AI
1. In Catalyst Console: **Zia** → **Auto ML** → Create new model
2. Upload training data: `backend/data/quickml_training.csv` (10k examples of query→result mappings)
3. Train the model (Catalyst handles feature engineering)
4. Copy the `MODEL_ID` from the model card
5. Set environment variable: `QUICKML_MODEL_ID=automl_<ID>`
6. Redeploy backend

See [QUICKML_INTEGRATION.md](QUICKML_INTEGRATION.md) for full walkthrough.

---

## 🌍 Internationalization & Theming

### Bilingual UI (English/Kannada)
- **Static dictionary:** [src/lib/i18n.ts](src/lib/i18n.ts) contains all UI strings (nav labels, buttons, card titles)
- **Render pattern:** Use `t(key, locale)` function to fetch localized text
- **Adding new strings:** Update both English and Kannada entries in `src/lib/i18n.ts`, then use `t("new_key")` in components
- **Dynamic narratives:** Case descriptions use `POST /api/translate` (Zia Translate fallback; currently returns passthrough if SDK unavailable)

### Theme System (Dark/Light)
- **Provider:** [src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx)
- **Storage:** localStorage `theme` key (persists across sessions)
- **Toggle buttons:** TopBar, Login page, Settings → Display tab
- **CSS:** Tailwind's `dark` variant (`@custom-variant dark (&:is(.dark *))`) applies `.dark` class to `<html>` element

---

## 📚 Catalyst Service Integration Status

| Service | Status | Notes |
|---------|--------|-------|
| **Data Store / ZCQL** | ✅ WORKING | Fully integrated; supports batch inserts + queries |
| **Web Client Hosting** | ✅ WORKING | Serves static React/Vite SPA at `/app/` |
| **AppSail** | ✅ WORKING | Containerized FastAPI backend (see deployment gotchas) |
| **Zia Translate** | ❌ NOT AVAILABLE | SDK method missing; fallback implemented |
| **SmartBrowz PDF** | ✅ WORKING | Method: `capp.smartbrowz().convert_to_pdf()` |
| **Zia Auto ML (QuickML)** | ✅ AVAILABLE | Ready to use once model is trained |
| **Cache** | ✅ WORKING (fallback) | Catalyst Cache used for `/api/kpis`/`/api/hotspots` (in-memory fallback for local dev) |

---

## 🧪 Testing & QA

### Frontend Unit Tests
```bash
npm test              # Run Vitest suite
npm test:watch       # Watch mode
npm test:ui          # UI dashboard
npm test:coverage    # Coverage report
```

### Backend Smoke Testing (Local)
```bash
# Note: vendor/ is Linux-only; use venv for Windows local testing
cd backend
python -m venv .venv-test
.\.venv-test\Scripts\pip install fastapi uvicorn pydantic networkx pandas fpdf2
.\.venv-test\Scripts\python.exe main.py
# Test endpoints with curl: curl http://localhost:8000/api/kpis
```

### QA Findings (Verified Working)
- ✅ Login with theme/language toggles + wrong-password error handling
- ✅ RBAC enforcement (Network/Simulator views gated by role)
- ✅ Dashboard KPIs + simulator slider recompute
- ✅ Hotspot click popups + nearest patrol logic
- ✅ PDF export (after em-dash encoding fix)
- ✅ Kannada UI text rendering + language toggle

---

## 📖 Additional Documentation

- [DEPLOY.md](DEPLOY.md) — Full deployment walkthrough + troubleshooting
- [QUICK_DEPLOYMENT.md](QUICK_DEPLOYMENT.md) — 10-minute rapid deployment guide
- [QUICKML_INTEGRATION.md](QUICKML_INTEGRATION.md) — AI-powered search setup
- [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) — UI architecture details
- [RISK_ASSESSMENT_VISUAL_GUIDE.md](RISK_ASSESSMENT_VISUAL_GUIDE.md) — Dashboard metrics explained

---

## 🛠️ Technology Stack

**Frontend:** React 19 + TanStack Router + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui + react-map-gl + deck.gl + react-force-graph-2d

**Backend:** Python 3.11 + FastAPI + Uvicorn + Pydantic + NetworkX + Pandas + fpdf2 + zcatalyst-sdk

**Infrastructure:** Zoho Catalyst (AppSail + Web Client Hosting + Data Store + Zia services)

**Build & Deploy:** npm + Zoho Catalyst CLI

---

## 📝 How to Use This Repository

This is a **working production prototype**, not a template. The frontend and backend are fully implemented and deployed.

- **To modify the UI:** Edit components in [src/components/](src/components/) and run `npm run build` to rebuild
- **To modify the API:** Edit endpoints in [backend/main.py](backend/main.py) and redeploy with `catalyst deploy`
- **To extend with new features:** Follow the established patterns (i18n for UI text, Catalyst SDK wrapping for backend, role-based gating for views)
- **For issues/bugs:** See "Known Issues & Open Work" section above

---

## 🏛️ Architecture Philosophy

**Decoupling:** React/Vite frontend is completely stateless — all data fetched via REST from FastAPI backend.

**Catalyst-First:** Every component maps to an approved Catalyst service (no third-party databases, APIs, or vendors).

**Fallback Pattern:** Backend uses try/except wrapping for all Catalyst SDK calls with local CSV/in-memory fallbacks, enabling local dev without Console access.

**Stateless Scaling:** Backend is containerized and designed for horizontal scaling (no session state in memory; HMAC tokens are self-verifying).