# Project Garuda: Team App Overview

## What the app does

Project Garuda is a bilingual police intelligence and response workspace built for the Karnataka State Police Datathon 2026. It brings crime records, location-based risk, suspect connections, forecasting, and field operations into one role-aware application.

The current prototype uses synthetic Karnataka crime data: 124,000 cases across 9 districts. Its predictions and risk scores support human review; they do not make enforcement decisions.

## Available functionality

| Area | What the team can explore |
| --- | --- |
| Dashboard | Review DGP statewide or ACP district Command changes, QuickML alerts, patrol recommendations, and active operations. |
| Geospatial analysis | View historical and predicted hotspots, density layers, patrol units, station anomalies, and district or station drilldowns. |
| Criminal connections | Explore the suspect and case network, rank key connected suspects, detect communities, trace paths, and inspect predicted links. |
| Ask Garuda | Ask questions in English or Kannada and review the visible plan, actions, evidence, and final answer. |
| Forecasting | Review the QuickML Gradient Boosting station forecast and its temporal comparison with the local trend fallback. |
| What-if planner | Adjust patrol coverage, infrastructure, and response time to estimate possible 30-day impact with a confidence range. |
| Reports and risk | Use backend-enforced role scope: DGP statewide, ACP district, SI station management, and Constable station read-only/redacted reports. |
| Incident intake | Enter a reviewed incident manually or scan an FIR image/PDF to prefill a draft using OCR. Scans are never submitted automatically. |
| ActionLoop operations | Turn an anomaly into an assigned response plan, acknowledge and update field work, attach evidence, complete the task, and review its assessment or debrief. |
| Export | Generate a PDF intelligence brief using the current scoped data. |
| Voice and language | Use Catalyst QuickML English/Kannada speech-to-text, text-to-speech, translation, and bilingual UI. |
| Security | Test badge login, signed sessions, district scoping, audit events, and server-enforced role permissions. |

## Role-based experience

- **Constable:** station-scoped read-only reports plus mobile field tasks and evidence updates; suspect counts, risk detail, FIR intake, and workflow controls are withheld.
- **Sub-Inspector:** assigned-station reports with FIR intake, QuickML risk review, assignment, workflow, and planning controls.
- **ACP:** Bengaluru Urban district Command, station drilldowns, patrol recommendations, and supervisor report actions; district scope is server-locked.
- **DGP:** complete statewide Command and all prototype functionality.

Demo accounts and current live URLs are listed in [README.md](../README.md#live-demo).

## Suggested team walkthrough

1. Sign in with the Constable account and inspect station-only read-only reports and Field Mode.
2. Sign in as SI to show station-level FIR intake and workflow controls.
3. Sign in as ACP to show the locked district Command view and patrol recommendation.
4. Sign in as DGP and switch between statewide and district scope.
5. Open the map, compare Historical and Predicted views, and inspect a hotspot or anomaly.
6. Open Connections, run the key-suspect ranking, and trace a path between two records.
7. Ask Garuda one English and one Kannada question; inspect the plan and evidence trace.
8. Run a scenario, assign an operation, complete its field workflow, and export the reviewed brief.

## Important prototype boundaries

- All case and officer data is synthetic; no real KSP records are included.
- Forecasts, link predictions, anomaly flags, and risk scores are decision-support signals, not evidence or automated verdicts.
- OCR output must be reviewed before submission. FIR validation is configurable through
  `FIR_NUMBER_REGEX`; apply the authoritative team format when supplied.
- Zoho QuickML LLM Serving remains the active provider. A future local/OpenAI-compatible model
  can be added behind the existing validated `AgentPlan` boundary without changing tools or RBAC.
- CCTNS integration and socioeconomic indicators are illustrative placeholders pending validation against authoritative sources.
- Production rollout still requires security hardening, policy approval, real-data validation, and operational testing.

For implementation details, setup, measured results, and known limitations, see [README.md](../README.md), [MODEL_CARD.md](MODEL_CARD.md), and [PRODUCTION_ROADMAP.md](PRODUCTION_ROADMAP.md).