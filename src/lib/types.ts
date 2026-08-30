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
  name_kn?: string;
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

export interface RiskPrediction {
  case_master_id: number;
  model_id: string | null;
  model_name: string;
  source: "quickml_pipeline" | "local_fallback";
  risk_class: "low" | "medium" | "high";
  scores: Record<string, number>;
  features: {
    gravity_level: number;
    repeat_accused_count: number;
    accused_count: number;
    arrest_count: number;
    arrest_rate_percent: number;
    station_case_volume: number;
    crime_type_volume: number;
    days_since_latest: number;
  };
  advisory: string;
}

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
  model_id?: string | null;
  source?: "quickml_pipeline" | "local_fallback" | "mock";
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
  source?: "quickml_pipeline" | "local_fallback" | "mock";
  model_id?: string | null;
}

// ─── Ask Garuda (agentic NL search, Phase 5) ──────────────────────────────────

export type AgentAction =
  | "search_cases" | "show_hotspots" | "investigate_network"
  | "compare_districts" | "summarize_trends" | "find_connection"
  | "rank_offenders" | "explain_correlations" | "case_brief"
  | "assess_case_risk" | "summarize_kpis" | "forecast_hotspots"
  | "operational_guidance" | "app_help";

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
  knowledge_source?: "quickml_rag" | "local_playbook";
  citations?: Array<{
    source_id: string;
    title: string;
    document_id: string;
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

export interface CommandChangeMetric {
  id: "cases" | "serious_cases" | "arrest_rate" | "station_spikes";
  current: number;
  previous: number;
  absolute_change: number;
  percent_change: number | null;
  unit: "cases" | "percent" | "stations";
  status: "improving" | "worsening" | "stable";
}

export interface AreaChange {
  id: number;
  name: string;
  current: number;
  previous: number;
  absolute_change: number;
  percent_change: number | null;
}

export interface CrimeChangeCell {
  crime_id: number;
  crime_type: string;
  current: number;
  previous: number;
  absolute_change: number;
  percent_change: number | null;
}

export interface CommandChangeSummary {
  as_of: string;
  window_days: 7 | 30 | 90;
  scope: string;
  current_period: { start: string; end: string };
  previous_period: { start: string; end: string };
  metrics: CommandChangeMetric[];
  area_level: "district" | "station";
  area_changes: AreaChange[];
  crime_changes: { area_id: number; area_name: string; cells: CrimeChangeCell[] }[];
  decision_queue: {
    needs_assignment: number;
    overdue: number;
    assigned: number;
    in_progress: number;
    completed: number;
  };
  resource_allocation: {
    available_units: number;
    allocated_units: number;
    advisory: "human_review_required";
    recommendations: {
      station_id: number;
      station_name: string;
      priority_score: number;
      predicted_count: number;
      current_count: number;
      baseline_count: number;
      is_anomaly: boolean;
      z_score: number;
      forecast_source: "quickml_pipeline" | "local_fallback";
      anomaly_source: "quickml_pipeline" | "local_fallback";
      recommended_units: number;
    }[];
  };
  provenance: string;
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
  suspects: number | null;
  detail_level?: "field" | "supervisor";
}

export interface CaseReportsPage {
  items: CaseReport[];
  total: number;
  limit: number;
  offset: number;
  summary: { active: number; critical: number; stations: number };
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

export interface IncidentScanResult {
  draft: IncidentIntake;
  ipc_sections: string | null;
  low_confidence_fields: string[];
  accused_names_source: "zia_ner" | "heuristic";
  ocr_confidence?: string | null;
  raw_text: string;
  advisory: string;
}

// ─── ActionLoop response plans ──────────────────────────────────────────────

export type ResponsePlanStatus = "assigned" | "acknowledged" | "in_progress" | "completed";

export interface FieldUpdate {
  update_id: string;
  operation_id: string;
  officer_badge: string;
  status: string;
  note: string;
  attachment_key: string;
  attachment_name: string;
  attachment_type: string;
  created_at: string;
  persistence: "datastore" | "session";
}

export interface ResponsePlan {
  operation_id: string;
  alert_id: string;
  station_id: number;
  station_name: string;
  current_count: number;
  usual_count: number;
  z_score: number;
  decision: "approve" | "modify" | "escalate";
  note: string;
  assigned_to: string;
  status: ResponsePlanStatus;
  created_by: string;
  created_at: string;
  due_at?: string | null;
  updated_at: string;
  outcome_note: string;
  persistence: "datastore" | "session";
  updates: FieldUpdate[];
}

export interface ResponsePlanCreate {
  alert_id: string;
  station_id: number;
  station_name?: string;
  current_count: number;
  usual_count: number;
  z_score: number;
  decision: ResponsePlan["decision"];
  note: string;
  assigned_to: string;
  due_at?: string;
}

export interface ResponsePlansPage {
  items: ResponsePlan[];
  total: number;
}

export interface OperationAssessment {
  operation_id: string;
  process_status: "completed" | "in_progress";
  task_status: ResponsePlanStatus;
  observation_days: number;
  field_update_count: number;
  baseline_30d_cases: number | null;
  latest_historical_30d_cases: number | null;
  historical_change_percent: number | null;
  latest_data_at: string | null;
  impact_status: "ready" | "pending_observation_window";
  impact_available_after: string;
  advisory: string;
}

// ─── Site analytics (self-instrumented visit tracking) ───────────────────────

export interface AnalyticsSummary {
  total_visits: number;
  unique_visitors: number;
  today_visits: number;
  by_day: { date: string; visits: number }[];
  top_paths: { path: string; visits: number }[];
  note: string;
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  timestamp: string;
  source: "live" | "cached" | "mock";
}
