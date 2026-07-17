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
  ApiResponse,
  CaseReport,
  Hotspot,
  KpiMetric,
  NetworkGraph,
  SimulationResult,
  SimulatorVariable,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL as string | undefined;
const USE_REAL_API = !!API_BASE;

// Simulate realistic network latency in mock mode only
const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

function wrap<T>(data: T): ApiResponse<T> {
  return { data, timestamp: new Date().toISOString(), source: USE_REAL_API ? "live" : "mock" };
}

/** Generic fetch wrapper with error handling */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
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

export async function fetchHotspots(): Promise<ApiResponse<Hotspot[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<Hotspot[]>("/api/hotspots?limit=300");
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

export async function fetchNetwork(): Promise<ApiResponse<NetworkGraph>> {
  if (USE_REAL_API) {
    const data = await apiFetch<NetworkGraph>("/api/network?cluster_size=15");
    return wrap(data);
  }
  await delay(400);
  return wrap(NETWORK);
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
    label: "Resource Deployment Readiness",
    value: "92%",
    delta: "1.8%",
    trend: "up",
    positive: true,
    sparkline: [80, 82, 85, 84, 87, 89, 88, 90, 91, 90, 92, 92],
    accent: "electric",
  },
];

export async function fetchKpiMetrics(): Promise<ApiResponse<KpiMetric[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<KpiMetric[]>("/api/kpis");
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
    hint: "Active units per km² · Bengaluru City",
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
    const data = await apiFetch<{ impact_percent: number; model_version: string; window_days: number; computed_at: string }>(
      "/api/simulator/run", { method: "POST", body: JSON.stringify(body) }
    );
    return wrap({
      impactPercent: data.impact_percent,
      modelVersion:  data.model_version,
      windowDays:    data.window_days,
      computedAt:    data.computed_at,
    });
  }
  await delay(1200); // Simulate compute time
  const variables = SIMULATOR_VARIABLES;
  const impact = variables.reduce((sum, v) => sum + (values[v.id] ?? v.defaultValue) * v.weight, 0);
  const normalized = Math.round(impact / 1.2);
  return wrap({
    impactPercent: normalized,
    modelVersion: "causal-v2.4",
    windowDays: 30,
    computedAt: new Date().toISOString(),
  });
}

// ─── GET /api/reports ─────────────────────────────────────────────────────────

const CASE_REPORTS: CaseReport[] = [
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

export async function fetchCaseReports(): Promise<ApiResponse<CaseReport[]>> {
  if (USE_REAL_API) {
    const data = await apiFetch<CaseReport[]>("/api/reports?limit=20");
    return wrap(data);
  }
  await delay(500);
  return wrap(CASE_REPORTS);
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
  const res = await fetch(`${API_BASE}/api/export_brief`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}
