# Project Garuda: Team App Overview

## What the app does

Project Garuda is a bilingual police intelligence and response workspace built for the Karnataka State Police Datathon 2026. It brings crime records, location-based risk, suspect connections, forecasting, and field operations into one role-aware application.

The current prototype uses synthetic Karnataka crime data: 124,000 cases across 9 districts. Its predictions and risk scores support human review; they do not make enforcement decisions.

## Available functionality

| Area | What the team can explore |
| --- | --- |
| Dashboard | Review statewide or district KPIs, risk alerts, resource readiness, and active response operations. |
| Geospatial analysis | View historical and predicted hotspots, density layers, patrol units, station anomalies, and district or station drilldowns. |
| Criminal connections | Explore the suspect and case network, rank key connected suspects, detect communities, trace paths, and inspect predicted links. |
| Ask Garuda | Ask questions in English or Kannada and review the visible plan, actions, evidence, and final answer. |
| Forecasting | Compare station trends and review backtested forecasting performance. |
| What-if planner | Adjust patrol coverage, infrastructure, and response time to estimate possible 30-day impact with a confidence range. |
| Reports and risk | Search case reports, review case-risk signals, update investigation workflow status, and view CCTNS-style mapped data. |
| Incident intake | Enter a reviewed incident manually or scan an FIR image/PDF to prefill a draft using OCR. Scans are never submitted automatically. |
| ActionLoop operations | Turn an anomaly into an assigned response plan, acknowledge and update field work, attach evidence, complete the task, and review its assessment or debrief. |
| Export | Generate a PDF intelligence brief using the current scoped data. |
| Personalization | Switch between English and Kannada, use light or dark theme, and configure alert preferences. |
| Security | Test badge login, signed sessions, district scoping, audit events, and server-enforced role permissions. |

## Role-based experience

- **Constable:** mobile-focused field view and assigned operation updates; advanced analysis is restricted.
- **Sub-Inspector:** dashboard and planning access with some advanced features gated.
- **Circle Inspector:** network analysis, planner, operations, and export access.
- **DGP:** complete statewide view and all prototype functionality.

Demo accounts and current live URLs are listed in [README.md](README.md#live-demo).

## Suggested team walkthrough

1. Sign in with a Constable account and note which modules are restricted.
2. Sign in as DGP and switch between statewide and district scope.
3. Open the map, compare Historical and Predicted views, and inspect a hotspot or anomaly.
4. Open Connections, run the key-suspect ranking, and trace a path between two records.
5. Ask Garuda one English and one Kannada question; inspect the plan and evidence trace.
6. Run a what-if scenario, then create a response operation from an anomaly.
7. Use the field workflow to acknowledge, update, attach evidence, and complete the operation.
8. Review the operation assessment and export a PDF brief.

## Important prototype boundaries

- All case and officer data is synthetic; no real KSP records are included.
- Forecasts, link predictions, anomaly flags, and risk scores are decision-support signals, not evidence or automated verdicts.
- OCR output must be reviewed before an incident is submitted.
- CCTNS integration and socioeconomic indicators are illustrative placeholders pending validation against authoritative sources.
- Production rollout still requires security hardening, policy approval, real-data validation, and operational testing.

For implementation details, setup, measured results, and known limitations, see [README.md](README.md), [MODEL_CARD.md](MODEL_CARD.md), and [PRODUCTION_ROADMAP.md](PRODUCTION_ROADMAP.md).