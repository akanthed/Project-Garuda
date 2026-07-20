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
  /** Station-level causal factors (only present when served by the real backend) */
  station_id?: number;
  station_name?: string;
  patrol_density?: number;
  infra_health?: number;
  commercial_density?: number;
}

// ─── Patrol fleet ──────────────────────────────────────────────────────────────

export interface PatrolUnit {
  id: string;
  lat: number;
  lng: number;
  status: "patrolling" | "responding";
}

// ─── Predictive forecast ───────────────────────────────────────────────────────

export interface ForecastPoint {
  station_id: number;
  station_name: string;
  lat: number;
  lng: number;
  predicted_intensity: number;
  predicted_count: number;
  trend_pct: number;
  horizon_days: number;
  model: string;
}

// ─── Anomaly detection ──────────────────────────────────────────────────────────

export interface StationAnomaly {
  station_id: number;
  station_name: string;
  z_score: number;
  current_count: number;
  mean_count: number;
  severity: "critical" | "high";
}

// ─── Ask Garuda (NL search) ────────────────────────────────────────────────────

export interface AskMatchedCase {
  id: string;
  date: string;
  station: string;
  gravity: number;
}

export interface AskResponse {
  answer: string;
  matched_cases: AskMatchedCase[];
  suggested_view: "dashboard" | "geospatial" | "network" | "reports" | "settings";
  source: "quickml" | "rules";
  language: "en" | "kn";
  confidence: number;
  tool_calls: Array<{
    tool: "search_cases" | "show_hotspots" | "investigate_network";
    status: "completed";
    result_count: number;
  }>;
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
  confidenceRange?: [number, number];
  assumptions?: string[];
  computedAt: string;
}

// ─── Case Reports ─────────────────────────────────────────────────────────────

export type CaseSeverity = "critical" | "high" | "medium" | "low";
export type CaseStatus = "open" | "investigating" | "resolved" | "closed";

export interface CaseReport {
  case_master_id: number;
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

export interface CaseReportsPage {
  items: CaseReport[];
  total: number;
  limit: number;
  offset: number;
}

export interface CaseWorkflowUpdate {
  status: CaseStatus;
  assigned_officer: string;
}

export interface CaseWorkflowResult extends CaseWorkflowUpdate {
  case_master_id: number;
  updated_by: string;
  updated_at: string;
  persistence: "datastore" | "session";
  warning?: string | null;
}

export interface IncidentIntake {
  crime_no: string;
  registered_date: string;
  police_station_id: number;
  crime_major_head_id: number;
  gravity_offence_id: number;
  latitude: number;
  longitude: number;
  brief_facts: string;
  accused_names: string[];
}

export interface IncidentIntakeResult {
  id: string;
  case_master_id: number;
  station: string;
  accused_added: number;
  submitted_by?: string;
  persistence: "datastore" | "session";
  warning?: string | null;
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
  source: "live" | "cached" | "mock";
}
