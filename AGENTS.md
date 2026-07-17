# Sentinel Gleam - Custom Agents

This project uses three specialized AI agents to handle different aspects of development. Each agent has specific expertise and rules to ensure quality, focused code generation.

## Agent 1: Frontend UI Architect

**File:** [.vscode/agents/frontend-ui-architect.instructions.md](.vscode/agents/frontend-ui-architect.instructions.md)

**Where to use:** Copilot chat inside your `src/` folder, or dedicated LLM window for React code.

**Specialization:** Next.js (App Router), Tailwind CSS, TypeScript, and shadcn/ui component development.

**Key Traits:**
- Builds dark-mode dashboards with zinc colors
- Creates responsive, modular React components
- Integrates Mapbox (`react-map-gl`) and graph visualizations (`react-force-graph-2d`)
- Assumes all data comes from REST APIs
- No backend logic — UI only

**When to Ask It:**
- Building dashboard components
- Creating data visualization UIs
- Implementing responsive layouts
- Designing map or graph interfaces
- Styling and theming

---

## Agent 2: Backend & ML Engineer

**File:** [.vscode/agents/backend-ml-engineer.instructions.md](.vscode/agents/backend-ml-engineer.instructions.md)

**Where to use:** Copilot chat inside your `backend/` folder or API routes.

**Specialization:** Python, FastAPI, Uvicorn, NetworkX, and synthetic data generation.

**Key Traits:**
- Writes async FastAPI endpoints
- Outputs strict JSON only
- Generates realistic synthetic relational data (nodes, edges, geospatial, causal scores)
- Uses Pydantic for validation
- Stateless, containerization-ready code

**When to Ask It:**
- Creating REST API endpoints
- Designing data models and validation
- Generating synthetic test data
- Building graph analysis algorithms
- Implementing ML scoring functions
- Optimizing backend performance

---

## Agent 3: Zoho Catalyst DevOps Specialist

**File:** [.vscode/agents/zoho-catalyst-devops.instructions.md](.vscode/agents/zoho-catalyst-devops.instructions.md)

**Where to use:** A separate browser tab or dedicated Copilot window for deployment issues.

**Specialization:** Zoho Catalyst infrastructure, AppSail, Web Client Hosting, and Zoho Data Store.

**Key Traits:**
- Deploys Next.js static exports to Web Client Hosting
- Deploys Python FastAPI to AppSail (OCI runtime)
- Enforces Zoho port-binding rules (`$X_ZOHO_CATALYST_LISTEN_PORT`)
- Uses Zoho Data Store SDK instead of standard SQL
- Provides exact SDK code for integration

**When to Ask It:**
- Deploying to Zoho Catalyst
- Setting up Web Client Hosting
- Configuring AppSail for backend
- Integrating Zoho Data Store
- Managing secrets and environment variables
- Troubleshooting deployment errors

---

## Workflow: The Hand-Off Pattern

1. **Frontend builds UI** → Backend builds API schema
2. **Backend outputs JSON schema** of API responses
3. **Copy JSON schema** → Paste into Frontend Agent
4. **Frontend Agent:** *"Here is the data structure from the backend, build the Mapbox UI for it."*
5. **DevOps deploys** both to Zoho Catalyst

### Isolation Rules

- ❌ **Never** ask the Frontend Agent about Zoho AppSail
- ❌ **Never** ask the DevOps Agent to design a Tailwind button
- ❌ **Never** ask the Backend Agent to write React components
- ✅ **Always** pass JSON schemas between agents at the boundary

---

## Quick Reference

| Task | Agent | Frequency |
|------|-------|-----------|
| Build React components | Frontend UI Architect | High |
| Design APIs | Backend & ML Engineer | High |
| Deploy to Zoho | Zoho Catalyst DevOps Specialist | Medium |
| Generate synthetic data | Backend & ML Engineer | Medium |
| Map visualizations | Frontend UI Architect | Medium |
| ZCQL data operations | Zoho Catalyst DevOps Specialist | Low |

