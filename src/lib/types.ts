// ─── Geospatial ──────────────────────────────────────────────────────────────

export type RiskLevel = "high" | "med" | "low";

export interface Hotspot {
  id: string;
  lat: number;
  lng: number;
  /** Normalized 0–1 crime density */
  intensity: number;
  crime_type: string;
  causal_driver: string;
  risk: RiskLevel;
  /** Display label for map pin */
  label: string;
  /** CSS % position on the mock canvas — removed once real Mapbox is wired */
  _x: number;
  _y: number;
}

// ─── Criminal Network ─────────────────────────────────────────────────────────

export type NodeType = "Suspect" | "Location" | "Vehicle" | "FIR";

export interface NetworkNode {
  id: string;
  label: string;
  type: NodeType;
  /** Connection weight — drives node radius */
  weight: number;
  risk?: RiskLevel;
}

export interface NetworkEdge {
  source: string;
  target: string;
  relation: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

// ─── KPI Metrics ─────────────────────────────────────────────────────────────

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  /** true = up-trend is good news */
  positive: boolean;
  sparkline: number[];
  accent: "electric" | "danger" | "default";
}

// ─── Simulator ───────────────────────────────────────────────────────────────

export interface SimulatorVariable {
  id: string;
  label: string;
  hint: string;
  weight: number;
  defaultValue: number;
}

export interface SimulationResult {
  impactPercent: number;
  modelVersion: string;
  windowDays: number;
  computedAt: string;
}

// ─── Case Reports ─────────────────────────────────────────────────────────────

export type CaseSeverity = "critical" | "high" | "medium" | "low";
export type CaseStatus = "open" | "investigating" | "resolved" | "closed";

export interface CaseReport {
  id: string;
  title: string;
  district: string;
  station: string;
  date: string;
  severity: CaseSeverity;
  status: CaseStatus;
  assigned_officer: string;
  crime_type: string;
  ipc_section: string;
  suspects: number;
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
  source: "live" | "cached" | "mock";
}
