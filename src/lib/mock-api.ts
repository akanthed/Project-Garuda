/**
 * API layer — calls the real FastAPI backend when VITE_API_URL is set,
 * falls back to synthetic mock data for local frontend-only development.
 *
 * To point at the real backend:
 *   VITE_API_URL=http://localhost:8000  npm run dev
 *
 * For Catalyst deployment set VITE_API_URL to your AppSail URL in the
 * Web Client Hosting environment variables.
 */

import type {
  AskResponse,
  ApiResponse,
  CaseReport,
  CaseReportsPage,
  CaseSeverity,
  CaseWorkflowResult,
  CaseWorkflowUpdate,
  CommunityRow,
  ConnectionPath,
  DistrictsResponse,
  ForecastBacktest,
  ForecastPoint,
  Hotspot,
  IncidentIntake,
  IncidentIntakeResult,
  KingpinRow,
  KpiMetric,
  NetworkGraph,
  PatrolUnit,
  PredictedLink,
  SimulationResult,
  SimulatorVariable,
  StationAnomaly,
} from "./types";
import { getToken, logout } from "./auth";

/** Scope filter shared by every endpoint that supports district/station drilldown. */
export interface ScopeParams {
  districtId?: number | null;
  stationId?: number | null;
}

function scopeQuery(params?: ScopeParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.districtId != null) qs.set("district_id", String(params.districtId));
  if (params.stationId != null) qs.set("station_id", String(params.stationId));
  const s = qs.toString();
  return s ? `&${s}` : "";
}

/** Builds a query string for endpoints with no other query params (leading `?`, omitted if empty). */
function scopeQueryString(params?: ScopeParams): string {
  const s = scopeQuery(params);
  return s ? `?${s.slice(1)}` : "";
}

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const USE_REAL_API = !!API_BASE;

// Simulate realistic network latency in mock mode only
const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

function wrap<T>(data: T): ApiResponse<T> {
  return { data, timestamp: new Date().toISOString(), source: USE_REAL_API ? "live" : "mock" };
}

/** Generic fetch wrapper with error handling */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    logout();
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new Error("Officer session expired. Please sign in again.");
  }
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── GET /api/districts ────────────────────────────────────────────────────────
// Single Bengaluru Urban district in mock mode; the real backend serves the
// full statewide Karnataka set (see backend/karnataka_districts.py).

const MOCK_DISTRICTS: DistrictsResponse = {
  districts: [
    {
      district_id: 1,
      name: "Bengaluru Urban",
      code: "BLR",
      centroid: { lat: 12.9716, lng: 77.5946 },
      bounds: { min_lat: 12.80, max_lat: 13.10, min_lng: 77.40, max_lng: 77.75 },
      station_range: [1, 100],
    },
  ],
  statewide_bounds: { min_lat: 12.80, max_lat: 13.10, min_lng: 77.40, max_lng: 77.75 },
};

export async function fetchDistricts(): Promise<ApiResponse<DistrictsResponse>> {
  if (USE_REAL_API) {
    const data = await apiFetch<DistrictsResponse>("/api/districts");
    return wrap(data);
  }
  await delay(150);
  return wrap(MOCK_DISTRICTS);
}

// ─── GET /api/hotspots ────────────────────────────────────────────────────────

const HOTSPOTS: Hotspot[] = [
  {
    id: "HS-560001",
    label: "KR Market",
    lat: 12.9716,
    lng: 77.5946,
    intensity: 0.89,
    risk: "high",
    crime_type: "IPC 379 (Property Theft)",
    causal_driver:
      "76% correlation with streetlight infrastructure breakdown and local commercial pedestrian density.",
    _x: 32,
    _y: 42,
  },
  {
    id: "HS-560025",
    label: "MG Road",
    lat: 12.9758,
    lng: 77.6072,
    intensity: 0.62,
    risk: "med",
    crime_type: "IPC 354 (Assault)",
    causal_driver:
      "High late-night footfall near commercial establishments, low patrol density post-midnight.",
    _x: 58,
    _y: 48,
  },
  {
    id: "HS-560066",
    label: "Whitefield",
    lat: 12.9698,
    lng: 77.7499,
    intensity: 0.77,
    risk: "high",
    crime_type: "IPC 420 (Cyber Fraud)",
    causal_driver:
      "Concentrated corporate corridor with high-value digital transactions, sparse physical patrolling.",
    _x: 74,
    _y: 30,
  },
  {
    id: "HS-560034",
    label: "Koramangala",
    lat: 12.9352,
    lng: 77.6245,
    intensity: 0.55,
    risk: "med",
    crime_type: "IPC 323 (Voluntarily Causing Hurt)",
    causal_driver:
      "Nightlife cluster with high alcohol index; insufficient rapid-response coverage.",
    _x: 44,
    _y: 68,
  },
  {
    id: "HS-560100",
    label: "Electronic City",
    lat: 12.8399,
    lng: 77.6770,
    intensity: 0.31,
    risk: "low",
    crime_type: "IPC 379 (Vehicle Theft)",
    causal_driver: "Large open parking zones with minimal CCTV coverage during night shifts.",
    _x: 78,
    _y: 74,
  },
  {
    id: "HS-560022",
    label: "Yeshwantpur",
    lat: 13.0218,
    lng: 77.5510,
    intensity: 0.28,
    risk: "low",
    crime_type: "IPC 143 (Unlawful Assembly)",
    causal_driver: "Adjacent to interstate transport hub; transient population density spikes.",
    _x: 22,
    _y: 74,
  },
];

export async function fetchHotspots(params?: ScopeParams): Promise<ApiResponse<Hotspot[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<Hotspot[]>(`/api/hotspots?limit=300${scopeQuery(params)}`);
    return wrap(data);
  }
  await delay(350);
  return wrap(HOTSPOTS);
}

// ─── GET /api/network ─────────────────────────────────────────────────────────

const NETWORK: NetworkGraph = {
  nodes: [
    { id: "C-9081", label: "K. Ramachandra", type: "Suspect", weight: 9, risk: "high" },
    { id: "C-4412", label: "A. Iyer", type: "Suspect", weight: 5 },
    { id: "C-7733", label: "S. Nair", type: "Suspect", weight: 6 },
    { id: "C-2291", label: "M. Patel", type: "Suspect", weight: 4 },
    { id: "C-8801", label: "K. Reddy", type: "Suspect", weight: 7, risk: "med" },
    { id: "FIR-114", label: "FIR-BLR-114", type: "FIR", weight: 3 },
    { id: "FIR-087", label: "FIR-BLR-087", type: "FIR", weight: 3 },
    { id: "LOC-MG", label: "MG Road", type: "Location", weight: 5 },
    { id: "LOC-KR", label: "KR Market", type: "Location", weight: 4 },
    { id: "VEH-KA01", label: "KA-01-MX-4421", type: "Vehicle", weight: 2 },
  ],
  edges: [
    { source: "C-9081", target: "C-4412", relation: "Known Associate" },
    { source: "C-9081", target: "C-7733", relation: "Known Associate" },
    { source: "C-9081", target: "C-2291", relation: "Financier" },
    { source: "C-9081", target: "C-8801", relation: "Operational Link" },
    { source: "C-9081", target: "FIR-114", relation: "Primary Accused" },
    { source: "C-9081", target: "FIR-087", relation: "Named Suspect" },
    { source: "C-4412", target: "FIR-114", relation: "Co-Accused" },
    { source: "C-7733", target: "C-8801", relation: "Known Associate" },
    { source: "C-8801", target: "LOC-MG", relation: "Frequent Operating Hub" },
    { source: "C-9081", target: "LOC-KR", relation: "Residence Proximity" },
    { source: "C-2291", target: "VEH-KA01", relation: "Registered Owner" },
    { source: "VEH-KA01", target: "LOC-MG", relation: "Spotted At" },
  ],
};

export async function fetchNetwork(params?: ScopeParams): Promise<ApiResponse<NetworkGraph>> {
  if (USE_REAL_API) {
    const data = await apiFetch<NetworkGraph>(`/api/network?cluster_size=15${scopeQuery(params)}`);
    return wrap(data);
  }
  await delay(400);
  return wrap(NETWORK);
}

// ─── GET /api/network/kingpins, /communities, /path, /predict-links (Phase 3) ───
// Mock fallbacks are intentionally thin (real depth needs a real graph) — the
// real backend precomputes centrality/communities over the co-offender graph.

const MOCK_KINGPINS: KingpinRow[] = [
  { id: "C-9081", label: "K. Ramachandra", degree_centrality: 0.42, betweenness_centrality: 0.31, eigenvector_centrality: 0.55, kingpin_score: 0.41, case_count: 6, co_offender_count: 4, district_count: 2, community_id: 0 },
  { id: "C-8801", label: "K. Reddy", degree_centrality: 0.28, betweenness_centrality: 0.18, eigenvector_centrality: 0.33, kingpin_score: 0.25, case_count: 4, co_offender_count: 3, district_count: 1, community_id: 0 },
];

export async function fetchKingpins(params?: ScopeParams & { limit?: number }): Promise<ApiResponse<KingpinRow[]>> {
  if (USE_REAL_API) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    const data = await apiFetch<KingpinRow[]>(`/api/network/kingpins?${qs.toString()}${scopeQuery(params)}`);
    return wrap(data);
  }
  await delay(300);
  return wrap(MOCK_KINGPINS);
}

const MOCK_COMMUNITIES: CommunityRow[] = [
  {
    community_id: 0, size: 5,
    top_members: [{ id: "C-9081", label: "K. Ramachandra" }, { id: "C-8801", label: "K. Reddy" }],
    dominant_crime_type: "Vehicle Theft", district_ids: [1], case_count: 6, cohesion: 0.6,
    active_from: "2025-01-04", active_to: "2026-06-10", likely_synthetic_artifact: false,
  },
];

export async function fetchCommunities(params?: { limit?: number; minSize?: number; maxSize?: number }): Promise<ApiResponse<CommunityRow[]>> {
  if (USE_REAL_API) {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.minSize) qs.set("min_size", String(params.minSize));
    if (params?.maxSize) qs.set("max_size", String(params.maxSize));
    const data = await apiFetch<CommunityRow[]>(`/api/network/communities?${qs.toString()}`);
    return wrap(data);
  }
  await delay(300);
  return wrap(MOCK_COMMUNITIES);
}

export async function fetchConnectionPath(source: string, target: string): Promise<ApiResponse<ConnectionPath>> {
  if (USE_REAL_API) {
    const qs = new URLSearchParams({ source, target });
    const data = await apiFetch<ConnectionPath>(`/api/network/path?${qs.toString()}`);
    return wrap(data);
  }
  await delay(400);
  const nodes = NETWORK.nodes.filter((n) => n.id === source || n.id === target);
  if (nodes.length < 2) return wrap({ connected: false, path: [], hops: [], path_length: null });
  return wrap({
    connected: true,
    path: nodes.map((n) => ({ id: n.id, label: n.label })),
    hops: [{ from: { id: source, label: source }, to: { id: target, label: target }, shared_case_count: 1, shared_cases: [{ case_master_id: 1, date: "2026-01-04", station: "KR Market PS" }] }],
    path_length: 1,
  });
}

export async function fetchPredictedLinks(limit = 20): Promise<ApiResponse<PredictedLink[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<PredictedLink[]>(`/api/network/predict-links?limit=${limit}`);
    return wrap(data);
  }
  await delay(300);
  return wrap([]);
}

// ─── GET /api/kpi ─────────────────────────────────────────────────────────────

const KPI_METRICS: KpiMetric[] = [
  {
    id: "criminal-nodes",
    label: "Criminal Nodes Analyzed",
    value: "1,284",
    delta: "4.2%",
    trend: "up",
    positive: false,
    sparkline: [8, 12, 10, 14, 13, 16, 15, 18, 17, 20, 22, 21],
    accent: "electric",
  },
  {
    id: "hotspot-alerts",
    label: "Spatio-Temporal Hotspot Alerts",
    value: "27",
    delta: "12.1%",
    trend: "up",
    positive: false,
    sparkline: [10, 12, 11, 14, 16, 15, 18, 17, 22, 24, 26, 27],
    accent: "danger",
  },
  {
    id: "risk-volatility",
    label: "Causal Risk Volatility Index",
    value: "0.74",
    delta: "3.4%",
    trend: "down",
    positive: true,
    sparkline: [0.9, 0.88, 0.85, 0.82, 0.84, 0.81, 0.8, 0.79, 0.77, 0.76, 0.75, 0.74].map(
      (v) => v * 100
    ),
    accent: "electric",
  },
  {
    id: "resource-readiness",
    label: "Case Arrest Rate",
    value: "82.1%",
    delta: "1.8%",
    trend: "up",
    positive: true,
    sparkline: [80, 82, 85, 84, 87, 89, 88, 90, 91, 90, 92, 92],
    accent: "electric",
  },
];

export async function fetchKpiMetrics(params?: ScopeParams): Promise<ApiResponse<KpiMetric[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<KpiMetric[]>(`/api/kpis${scopeQueryString(params)}`);
    return wrap(data);
  }
  await delay(200);
  return wrap(KPI_METRICS);
}

// ─── GET /api/simulator/variables ─────────────────────────────────────────────

const SIMULATOR_VARIABLES: SimulatorVariable[] = [
  {
    id: "patrol-density",
    label: "Patrol Density",
    hint: "Active units per km²",
    weight: 0.4,
    defaultValue: 62,
  },
  {
    id: "infra-health",
    label: "Infrastructure Health",
    hint: "Critical asset integrity (lighting, CCTV)",
    weight: 0.35,
    defaultValue: 78,
  },
  {
    id: "rapid-response",
    label: "Rapid Response Units",
    hint: "Deployable within 8 min · Hoysala fleet",
    weight: 0.25,
    defaultValue: 45,
  },
];

export async function fetchSimulatorVariables(): Promise<ApiResponse<SimulatorVariable[]>> {
  await delay(150);
  return wrap(SIMULATOR_VARIABLES);
}

// ─── POST /api/simulator/run ──────────────────────────────────────────────────

export async function runSimulation(
  values: Record<string, number>
): Promise<ApiResponse<SimulationResult>> {
  if (USE_REAL_API) {
    const body = {
      patrol_density:  values["patrol-density"] ?? 62,
      infra_health:    values["infra-health"] ?? 78,
      rapid_response:  values["rapid-response"] ?? 45,
    };
    const data = await apiFetch<{
      impact_percent: number;
      model_version: string;
      window_days: number;
      confidence_range?: [number, number];
      assumptions?: string[];
      computed_at: string;
    }>(
      "/api/simulator/run", { method: "POST", body: JSON.stringify(body) }
    );
    return wrap({
      impactPercent: data.impact_percent,
      modelVersion:  data.model_version,
      windowDays:    data.window_days,
      confidenceRange: data.confidence_range,
      assumptions: data.assumptions,
      computedAt:    data.computed_at,
    });
  }
  await delay(1200); // Simulate compute time
  const variables = SIMULATOR_VARIABLES;
  const impact = variables.reduce((sum, v) => sum + (values[v.id] ?? v.defaultValue) * v.weight, 0);
  const normalized = Math.round(impact / 1.2);
  return wrap({
    impactPercent: normalized,
    modelVersion: "scenario-model-v1",
    windowDays: 30,
    confidenceRange: [Math.max(0, normalized - 12), Math.min(100, normalized + 12)],
    assumptions: ["Local demonstration estimate; not a validated causal effect."],
    computedAt: new Date().toISOString(),
  });
}

// ─── GET /api/reports ─────────────────────────────────────────────────────────

const CASE_REPORTS: Omit<CaseReport, "case_master_id">[] = [
  {
    id: "BLR-2026-4481",
    title: "Organized Vehicle Theft Ring — Whitefield Corridor",
    district: "Bengaluru East",
    station: "Whitefield PS",
    date: "2026-07-14",
    severity: "critical",
    status: "investigating",
    assigned_officer: "SI R. Vance",
    crime_type: "Vehicle Theft",
    ipc_section: "IPC 379",
    suspects: 4,
  },
  {
    id: "BLR-2026-4419",
    title: "Cyber Fraud Network — Electronic Payment Gateway",
    district: "Bengaluru South",
    station: "Koramangala PS",
    date: "2026-07-13",
    severity: "high",
    status: "investigating",
    assigned_officer: "ASI P. Sharma",
    crime_type: "Cyber Fraud",
    ipc_section: "IPC 420",
    suspects: 6,
  },
  {
    id: "BLR-2026-4388",
    title: "Street Robbery Cluster — KR Market Night Shift",
    district: "Bengaluru Central",
    station: "KR Market PS",
    date: "2026-07-12",
    severity: "high",
    status: "open",
    assigned_officer: "SI A. Kumar",
    crime_type: "Robbery",
    ipc_section: "IPC 392",
    suspects: 2,
  },
  {
    id: "BLR-2026-4361",
    title: "Unlawful Assembly — Yeshwantpur Transport Hub",
    district: "Bengaluru North",
    station: "Yeshwantpur PS",
    date: "2026-07-11",
    severity: "medium",
    status: "resolved",
    assigned_officer: "HC B. Naidu",
    crime_type: "Unlawful Assembly",
    ipc_section: "IPC 143",
    suspects: 12,
  },
  {
    id: "BLR-2026-4340",
    title: "Assault at Commercial Establishment — MG Road",
    district: "Bengaluru Central",
    station: "MG Road PS",
    date: "2026-07-10",
    severity: "medium",
    status: "closed",
    assigned_officer: "ASI R. Shetty",
    crime_type: "Assault",
    ipc_section: "IPC 354",
    suspects: 3,
  },
  {
    id: "BLR-2026-4309",
    title: "Property Theft Syndicate — HSR Layout",
    district: "Bengaluru South",
    station: "HSR Layout PS",
    date: "2026-07-09",
    severity: "high",
    status: "investigating",
    assigned_officer: "SI M. Patel",
    crime_type: "Property Theft",
    ipc_section: "IPC 379",
    suspects: 5,
  },
  {
    id: "BLR-2026-4278",
    title: "Drug Trafficking Route — Silk Board Junction",
    district: "Bengaluru South",
    station: "Silk Board PS",
    date: "2026-07-08",
    severity: "critical",
    status: "investigating",
    assigned_officer: "CI S. Rao",
    crime_type: "Narcotics",
    ipc_section: "NDPS Act §8",
    suspects: 8,
  },
  {
    id: "BLR-2026-4241",
    title: "ATM Skimming Device — Marathahalli Cluster",
    district: "Bengaluru East",
    station: "Marathahalli PS",
    date: "2026-07-07",
    severity: "high",
    status: "open",
    assigned_officer: "ASI K. Reddy",
    crime_type: "Financial Fraud",
    ipc_section: "IPC 420",
    suspects: 3,
  },
];

export async function fetchCaseReports(params?: ScopeParams): Promise<ApiResponse<CaseReportsPage>> {
  if (USE_REAL_API) {
    const data = await apiFetch<CaseReportsPage | CaseReport[]>(`/api/reports?limit=20${scopeQuery(params)}`);
    if (Array.isArray(data)) {
      return wrap({
        items: data.map((report, index) => ({ ...report, case_master_id: report.case_master_id ?? index + 1 })),
        total: data.length,
        limit: data.length,
        offset: 0,
      });
    }
    return wrap(data);
  }
  await delay(500);
  return wrap({
    items: CASE_REPORTS.map((report, index) => ({ ...report, case_master_id: index + 1 })),
    total: CASE_REPORTS.length,
    limit: CASE_REPORTS.length,
    offset: 0,
  });
}

export async function updateCaseWorkflow(
  caseMasterId: number,
  input: CaseWorkflowUpdate,
): Promise<ApiResponse<CaseWorkflowResult>> {
  if (USE_REAL_API) {
    const data = await apiFetch<CaseWorkflowResult>(`/api/reports/${caseMasterId}/workflow`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return wrap(data);
  }

  await delay(250);
  const report = CASE_REPORTS[caseMasterId - 1];
  if (!report) throw new Error("Case not found");
  report.status = input.status;
  report.assigned_officer = input.assigned_officer;
  return wrap({
    case_master_id: caseMasterId,
    status: input.status,
    assigned_officer: input.assigned_officer,
    updated_by: "Current officer",
    updated_at: new Date().toISOString(),
    persistence: "session",
    warning: "Local demonstration workflow event; configure Catalyst Data Store persistence for deployment.",
  });
}

// ─── POST /api/incidents — officer-reviewed operational intake ───────────────

const CRIME_TYPE_NAMES: Record<number, string> = {
  1: "Cyber Crime", 2: "Property Theft", 3: "Vehicle Theft", 4: "Assault & Violence",
  5: "Narcotics", 6: "Murder", 7: "Robbery & Dacoity", 8: "Fraud & Cheating",
  9: "Unlawful Assembly", 10: "Eve Teasing", 11: "Land Disputes", 12: "Communal Offences",
  13: "Missing Persons", 14: "Domestic Violence", 15: "Child Offences",
};

export async function createIncident(input: IncidentIntake): Promise<ApiResponse<IncidentIntakeResult>> {
  if (USE_REAL_API) {
    const data = await apiFetch<IncidentIntakeResult>("/api/incidents", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return wrap(data);
  }

  await delay(450);
  if (CASE_REPORTS.some((report) => report.id === `BLR-${input.crime_no}`)) {
    throw new Error("An incident with this FIR / crime number already exists");
  }
  const severity: CaseSeverity = input.gravity_offence_id >= 5 ? "critical" : input.gravity_offence_id === 4 ? "high" : input.gravity_offence_id === 3 ? "medium" : "low";
  CASE_REPORTS.unshift({
    id: `BLR-${input.crime_no}`,
    title: input.brief_facts,
    district: "Bengaluru",
    station: `PS-${input.police_station_id}`,
    date: input.registered_date,
    severity,
    status: "investigating",
    assigned_officer: "Current officer",
    crime_type: CRIME_TYPE_NAMES[input.crime_major_head_id] ?? "Operational Intake",
    ipc_section: `Crime Head ${input.crime_major_head_id}`,
    suspects: input.accused_names.length,
  });
  return wrap({
    id: `BLR-${input.crime_no}`,
    case_master_id: CASE_REPORTS.length,
    station: `PS-${input.police_station_id}`,
    accused_added: input.accused_names.length,
    persistence: "session",
    warning: "Local demonstration record; configure the backend for Data Store persistence.",
  });
}

// ─── POST /api/export_brief ───────────────────────────────────────────────────

export async function exportBrief(payload: {
  kpis: Record<string, string>;
  hotspot_count: number;
  top_crime_types: string[];
  simulation_impact?: number;
}): Promise<Blob> {
  if (!USE_REAL_API) {
    throw new Error("PDF export requires the backend. Set VITE_API_URL.");
  }
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/export_brief`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

// ─── GET /api/patrols (synthetic Hoysala fleet) ───────────────────────────────

const MOCK_PATROLS: PatrolUnit[] = [
  { id: "HOY-01", lat: 12.965, lng: 77.601, status: "patrolling" },
  { id: "HOY-02", lat: 12.982, lng: 77.615, status: "patrolling" },
  { id: "HOY-03", lat: 12.952, lng: 77.622, status: "responding" },
];

export async function fetchPatrols(): Promise<ApiResponse<PatrolUnit[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<PatrolUnit[]>("/api/patrols");
    return wrap(data);
  }
  await delay(250);
  return wrap(MOCK_PATROLS);
}

// ─── GET /api/hotspots/forecast ───────────────────────────────────────────────

export async function fetchForecast(params?: ScopeParams): Promise<ApiResponse<ForecastPoint[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<ForecastPoint[]>(`/api/hotspots/forecast${scopeQueryString(params)}`);
    return wrap(data);
  }
  await delay(300);
  return wrap(
    HOTSPOTS.map((h, i) => ({
      station_id: i + 1,
      station_name: h.label,
      lat: h.lat,
      lng: h.lng,
      predicted_intensity: Math.min(1, h.intensity + 0.08),
      predicted_count: Math.round(h.intensity * 10),
      trend_pct: 8.4,
      horizon_days: 30,
      model: "mock-trend",
    }))
  );
}

// ─── GET /api/hotspots/forecast/backtest (Phase 4 model validation) ──────────

const MOCK_BACKTEST: ForecastBacktest = {
  models: [
    { model: "linear_trend", mae: 2.99, mape_percent: 29.4, pai: 1.31, pei: 0.79 },
    { model: "ewma", mae: 3.10, mape_percent: 30.1, pai: 1.33, pei: 0.80 },
    { model: "seasonal_naive", mae: 4.04, mape_percent: 38.0, pai: 1.35, pei: 0.82 },
    { model: "naive", mae: 4.11, mape_percent: 38.1, pai: 1.32, pei: 0.80 },
  ],
  test_months: 6, station_count: 9, k_stations: 2, k_fraction: 0.2,
  best_model_by_mae: "linear_trend", deployed_model: "linear_trend",
  methodology: "Rolling-origin backtest against naive, seasonal-naive, and EWMA baselines.",
  feedback_loop_caution: "Predicted hotspots can influence patrol allocation, which can change where future crime is recorded. Treat predictions as one input for human review, not automated dispatch.",
};

export async function fetchForecastBacktest(testMonths = 6): Promise<ApiResponse<ForecastBacktest>> {
  if (USE_REAL_API) {
    const data = await apiFetch<ForecastBacktest>(`/api/hotspots/forecast/backtest?test_months=${testMonths}`);
    return wrap(data);
  }
  await delay(300);
  return wrap(MOCK_BACKTEST);
}

// ─── GET /api/anomalies ────────────────────────────────────────────────────────

export async function fetchAnomalies(params?: ScopeParams): Promise<ApiResponse<StationAnomaly[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<StationAnomaly[]>(`/api/anomalies${scopeQueryString(params)}`);
    return wrap(data);
  }
  await delay(250);
  return wrap([
    { station_id: 1, station_name: "KR Market PS", z_score: 3.4, current_count: 9, mean_count: 4.1, severity: "high" },
    { station_id: 3, station_name: "Whitefield PS", z_score: 2.6, current_count: 7, mean_count: 3.8, severity: "high" },
  ]);
}

// ─── POST /api/ask (Ask Garuda — rule-based NLU) ──────────────────────────────

export async function askGaruda(query: string): Promise<ApiResponse<AskResponse>> {
  if (USE_REAL_API) {
    const data = await apiFetch<AskResponse>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    return wrap(data);
  }
  await delay(400);
  return wrap({
    answer: `Ask Garuda requires the backend (set VITE_API_URL) to search real case data for "${query}".`,
    matched_cases: [],
    suggested_view: "reports" as const,
    source: "rules" as const,
    language: "en" as const,
    confidence: 0,
    tool_calls: [],
  });
}
