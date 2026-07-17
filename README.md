# Project Garuda: Spatio-Temporal Graph & Causal Intelligence Platform

  is an enterprise-grade, proactive law enforcement intelligence dashboard designed specifically for the Karnataka State Police (KSP) Datathon 2026. Built entirely within the Zoho Catalyst ecosystem, the platform transforms fragmented crime records from 1,100+ stations into a visually striking, 3D command center that predicts crime vulnerabilities, maps complex criminal syndicates, and models proactive structural interventions.

---

## 🏗️ Architectural Overview

Garuda decouples a data-dense Next.js user interface from a high-performance Python FastAPI engine, deployed natively using Zoho Catalyst services to meet production-grade compliance.

┌─────────────────────────────────┐
              │      Next.js Frontend UI        │
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
        ZCQL Queries  │                 │ Zia Text APIs
                      ▼                 ▼
 ┌───────────────────────┐           ┌───────────────────────┐
 │  Catalyst Data Store  │           │ Catalyst Zia Services │
 │  (Tabular Synthetic)  │           │ (Kannada Translation) │
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
2. Criminal Network Graphs
Endpoint: GET /api/network

Payload Struct:

JSON
{
  "nodes": [
    {"id": "C-9081", "label": "K. Ramachandra", "type": "Suspect", "weight": 4},
    {"id": "LOC-MG", "label": "MG Road", "type": "Location", "weight": 2}
  ],
  "edges": [
    {"source": "C-9081", "target": "LOC-MG", "relation": "Frequent Operating Hub"}
  ]
}
🛡️ Zoho Catalyst Native Compliance Matrix
Every software component maps directly to an approved Catalyst module, avoiding third-party point penalties:

Compute (Backend API): Containerized Python FastAPI application executed inside Catalyst AppSail (Managed OCI/Docker runtime), configured to adapt natively to the dynamic environment port variable $X_ZOHO_CATALYST_LISTEN_PORT.

Hosting (Frontend): Next.js decoupled framework exported cleanly via static optimization into Catalyst Web Client Hosting.

Storage (Tabular Records): Managed synthetic data querying via ZCQL directly inside Catalyst Data Store, including the `Officers` table used for authentication.

Localization Engine: On-the-fly translation of dynamic case narrative text into Kannada via Catalyst Zia Services (`POST /api/translate`), with a passthrough fallback when Zia is unavailable. Static UI chrome (nav labels, buttons) uses a hand-curated bilingual dictionary instead, since machine translation of short fixed labels is lower quality than a reviewed translation.

Authentication: Officer badge/password credentials are verified server-side only (`POST /api/auth/login`) against Catalyst Data Store — never shipped to the client bundle. Sessions use HMAC-signed tokens with a 12-hour expiry.

Caching: `/api/kpis` and `/api/hotspots` responses are cached via Catalyst Cache (with an in-memory TTL fallback for local dev) to avoid recomputation on every request.

Note: Catalyst API Gateway only supports Basic/Advanced I/O Functions and the Web Client as targets — it cannot front an AppSail app directly. AppSail-level protection (CORS origin restriction via `ALLOWED_ORIGINS`, in-app IP rate limiting) is used instead; see `backend/main.py`.


***

## How to use this file to build your prototype:

1. **For the Frontend Agent (Lovable or v0.dev):** Create your project, copy the **"Frontend UI Design Language & Layout Specifications"** block from the markdown above, paste it into the UI builder prompt, and let it generate the static frontend shell.
2. **For the Backend Agent (GitHub Copilot):** Open a blank `main.py` in VS Code, open Copilot Chat, and type: *"Based on the architectural overview and API specifications detailed in my project's README.md, write the full FastAPI backend with mock data generation."*