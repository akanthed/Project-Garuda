// ─── Geospatial ──────────────────────────────────────────────────────────────

export interface GeoBounds {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

export interface DistrictInfo {
  district_id: number;
  name: string;
  code: string;
  centroid: { lat: number; lng: number };
  bounds: GeoBounds;
  station_range: [number, number];
}

export interface DistrictsResponse {
  districts: DistrictInfo[];
  statewide_bounds: GeoBounds;
}

export interface DistrictSummary {
  district_id: number;
  name: string;
  code: string;
  total_cases: number;
  high_risk_cases: number;
  arrest_rate_percent: number;
  active_anomalies: number;
  top_crime_categories: { crime_type: string; count: number }[];
  station_count: number;
  bounds: GeoBounds;
  data_provenance: string;
}

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
  confidence_interval?: [number, number];
  training_window_months?: number;
}

// ─── Forecast model backtest (Phase 4) ────────────────────────────────────────

export interface ForecastModelScore {
  model: string;
  mae: number;
  mape_percent: number | null;
  pai: number | null;
  pei: number | null;
}

export interface ForecastBacktest {
  models: ForecastModelScore[];
  test_months: number;
  station_count: number;
  k_stations: number;
  k_fraction: number;
  best_model_by_mae: string | null;
  deployed_model: string;
  methodology: string;
  feedback_loop_caution: string;
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

// ─── Ask Garuda (agentic NL search, Phase 5) ──────────────────────────────────

export type AgentAction =
  | "search_cases" | "show_hotspots" | "investigate_network"
  | "compare_districts" | "summarize_trends" | "find_connection"
  | "rank_offenders" | "explain_correlations";

export interface AskMatchedCase {
  id: string;
  date: string;
  station: string;
  gravity: number;
}

export interface AgentTraceStep {
  step: "interpret" | "execute" | "observe" | "answer";
  tool?: string;
  detail?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DistrictComparisonRow {
  district_id: number;
  name: string;
  total_cases: number;
  high_risk_cases: number;
  arrest_rate_percent: number;
  active_anomalies: number;
}

export interface TrendSummary {
  trend_pct: number | null;
  direction: "rising" | "falling" | "stable";
  active_anomalies: StationAnomaly[];
}

export interface ConnectionResult {
  connected: boolean;
  path: { id: string; label: string }[];
}

export interface OffenderRankingRow {
  id: string;
  label: string;
  kingpin_score: number;
  case_count: number;
}

export interface CorrelationExplanation {
  station_id: number;
  station_name: string;
  narrative: string;
}

export interface AskResponse {
  answer: string;
  matched_cases: AskMatchedCase[];
  suggested_view: "dashboard" | "geospatial" | "network" | "reports" | "settings";
  source: "quickml" | "rules";
  language: "en" | "kn";
  confidence: number;
  tool_calls: Array<{
    tool: AgentAction;
    status: "completed" | "unresolved";
    result_count: number;
  }>;
  trace?: AgentTraceStep[];
  district_comparison?: DistrictComparisonRow[];
  trend_summary?: TrendSummary;
  connection_result?: ConnectionResult;
  offender_ranking?: OffenderRankingRow[];
  correlation_explanation?: CorrelationExplanation;
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
  /** Present only for Suspect nodes when served by the real backend (Phase 3) */
  centrality?: NodeCentrality | null;
  community_id?: number | null;
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

// ─── Deep network analysis (Phase 3) ──────────────────────────────────────────

export interface NodeCentrality {
  degree: number;
  betweenness: number;
  eigenvector: number;
}

export interface KingpinRow {
  id: string;
  label: string;
  degree_centrality: number;
  betweenness_centrality: number;
  eigenvector_centrality: number;
  kingpin_score: number;
  case_count: number;
  co_offender_count: number;
  district_count: number;
  community_id: number | null;
}

export interface NetworkPersonRef {
  id: string;
  label: string;
}

export interface CommunityRow {
  community_id: number;
  size: number;
  top_members: NetworkPersonRef[];
  dominant_crime_type: string | null;
  district_ids: number[];
  case_count: number;
  cohesion: number;
  active_from: string | null;
  active_to: string | null;
  likely_synthetic_artifact: boolean;
}

export interface ConnectionHop {
  from: NetworkPersonRef;
  to: NetworkPersonRef;
  shared_case_count: number;
  shared_cases: { case_master_id: number; date: string; station: string }[];
}

export interface ConnectionPath {
  connected: boolean;
  path: NetworkPersonRef[];
  hops: ConnectionHop[];
  path_length: number | null;
}

export interface PredictedLink {
  source: NetworkPersonRef;
  target: NetworkPersonRef;
  adamic_adar_score: number;
  label: "predicted_lead";
  advisory: string;
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
