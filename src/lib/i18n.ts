/**
 * i18n translation layer — English / ಕನ್ನಡ
 *
 * Keyed by a stable string ID. Components read from this via useLanguage().
 * To add a new language: add a new locale block below and update `Locale` type.
 *
 * For production: swap `kn` values with Zoho Catalyst Zia Services API responses.
 */

export type Locale = "en" | "kn";

export const translations = {
  // ─── Navigation ────────────────────────────────────────────────────────────
  nav_dashboard:  { en: "Dashboard",    kn: "ಮುಖಪುಟ" },
  nav_geospatial: { en: "Geospatial",   kn: "ಭೌಗೋಳಿಕ" },
  nav_network:    { en: "Network",      kn: "ಜಾಲ" },
  nav_reports:    { en: "Reports",      kn: "ವರದಿಗಳು" },
  nav_settings:   { en: "Settings",     kn: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು" },

  // ─── TopBar ────────────────────────────────────────────────────────────────
  topbar_intel:      { en: "Intel / Bengaluru",    kn: "ಮಾಹಿತಿ / ಬೆಂಗಳೂರು" },
  topbar_overview:   { en: "Overview",             kn: "ಅವಲೋಕನ" },
  topbar_threatcon:  { en: "THREATCON · CHARLIE",  kn: "ಬೆದರಿಕೆ · ಚಾರ್ಲಿ" },
  topbar_search:     { en: "Search entities, cases, coordinates…", kn: "ಘಟಕಗಳು, ಪ್ರಕರಣಗಳು, ನಿರ್ದೇಶಾಂಕ ಹುಡುಕಿ…" },
  topbar_live:       { en: "LIVE",                 kn: "ನೇರ" },

  // ─── KPI Cards ─────────────────────────────────────────────────────────────
  kpi_criminal_nodes:   { en: "Criminal Nodes Analyzed",         kn: "ಅಪರಾಧ ನೋಡ್‌ಗಳ ವಿಶ್ಲೇಷಣೆ" },
  kpi_hotspot_alerts:   { en: "Spatio-Temporal Hotspot Alerts",  kn: "ಸ್ಥಳ-ಕಾಲ ಹಾಟ್‌ಸ್ಪಾಟ್ ಎಚ್ಚರಿಕೆ" },
  kpi_risk_volatility:  { en: "Causal Risk Volatility Index",    kn: "ಕಾರಣಾತ್ಮಕ ಅಪಾಯ ಸೂಚ್ಯಂಕ" },
  kpi_readiness:        { en: "Resource Deployment Readiness",   kn: "ಸಂಪನ್ಮೂಲ ನಿಯೋಜನೆ ಸಿದ್ಧತೆ" },

  // ─── GeoMap ────────────────────────────────────────────────────────────────
  map_title:        { en: "Geospatial Intelligence",              kn: "ಭೌಗೋಳಿಕ ಗುಪ್ತಚರ" },
  map_subtitle:     { en: "Bengaluru City — Live Threat Surface", kn: "ಬೆಂಗಳೂರು — ನೇರ ಬೆದರಿಕೆ ಮೇಲ್ಮೈ" },
  map_layers:       { en: "Map Layers",                           kn: "ನಕ್ಷೆ ಪದರಗಳು" },
  map_threat_layer: { en: "Threat Heatmap",                       kn: "ಬೆದರಿಕೆ ಶಾಖ ನಕ್ಷೆ" },
  map_patrol_layer: { en: "Patrol Units",                         kn: "ಗಸ್ತು ತಂಡಗಳು" },
  map_infra_layer:  { en: "Infrastructure",                       kn: "ಮೂಲಸೌಕರ್ಯ" },
  map_click_hint:   { en: "Click hotspot to inspect",             kn: "ಹಾಟ್‌ಸ್ಪಾಟ್ ಕ್ಲಿಕ್ ಮಾಡಿ" },
  map_crime_type:   { en: "Crime Type",                           kn: "ಅಪರಾಧ ಪ್ರಕಾರ" },
  map_intensity:    { en: "Intensity",                            kn: "ತೀವ್ರತೆ" },
  map_coords:       { en: "Coords",                               kn: "ನಿರ್ದೇಶಾಂಕ" },
  map_causal:       { en: "Causal Driver",                        kn: "ಕಾರಣ ಅಂಶ" },

  // ─── LinkGraph ─────────────────────────────────────────────────────────────
  graph_title:      { en: "Criminal Link Analysis",  kn: "ಅಪರಾಧ ಸಂಪರ್ಕ ವಿಶ್ಲೇಷಣೆ" },
  graph_subtitle:   { en: "Syndicate Nexus · BLR-Δ7", kn: "ಸಂಘ ಜಾಲ · BLR-Δ7" },
  graph_type:       { en: "Type",                    kn: "ಪ್ರಕಾರ" },
  graph_risk:       { en: "Risk",                    kn: "ಅಪಾಯ" },
  graph_connections:{ en: "Connections",             kn: "ಸಂಪರ್ಕಗಳು" },
  graph_links:      { en: "Links",                   kn: "ಕೊಂಡಿಗಳು" },
  graph_click_hint: { en: "Click node to inspect",   kn: "ನೋಡ್ ಕ್ಲಿಕ್ ಮಾಡಿ" },

  // ─── Simulator ─────────────────────────────────────────────────────────────
  sim_title:         { en: "Command Simulator",             kn: "ಕಮಾಂಡ್ ಸಿಮ್ಯುಲೇಟರ್" },
  sim_impact_label:  { en: "Predicted Causal Impact",       kn: "ಅಂದಾಜು ಪರಿಣಾಮ" },
  sim_incidents:     { en: "incidents",                     kn: "ಘಟನೆಗಳು" },
  sim_run:           { en: "Run Simulation",                kn: "ಸಿಮ್ಯುಲೇಶನ್ ಚಲಾಯಿಸಿ" },
  sim_running:       { en: "Simulating…",                   kn: "ಲೆಕ್ಕಾಚಾರ ಮಾಡಲಾಗುತ್ತಿದೆ…" },
  sim_baseline:      { en: "Baseline · 30d rolling window", kn: "ಮೂಲ ರೇಖೆ · 30 ದಿನ" },

  // ─── Reports ───────────────────────────────────────────────────────────────
  reports_title:     { en: "Case Reports",                          kn: "ಪ್ರಕರಣ ವರದಿಗಳು" },
  reports_subtitle:  { en: "Karnataka State Police · KSP-BLR Intelligence Digest", kn: "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ · KSP-BLR ಗುಪ್ತಚರ" },
  reports_refresh:   { en: "Refresh",                               kn: "ನವೀಕರಿಸಿ" },
  reports_search:    { en: "Search cases, IDs, districts…",         kn: "ಪ್ರಕರಣ, ID, ಜಿಲ್ಲೆ ಹುಡುಕಿ…" },
  reports_total:     { en: "Total Cases",                           kn: "ಒಟ್ಟು ಪ್ರಕರಣಗಳು" },
  reports_active:    { en: "Active / Investigating",                kn: "ಸಕ್ರಿಯ / ತನಿಖೆ" },
  reports_critical:  { en: "Critical Severity",                     kn: "ಗಂಭೀರ ತೀವ್ರತೆ" },
  reports_stations:  { en: "Stations Covered",                      kn: "ಠಾಣೆಗಳು" },

  // ─── Login ─────────────────────────────────────────────────────────────────
  login_org:         { en: "Karnataka State Police",               kn: "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್" },
  login_platform:    { en: "Spatio-Temporal Intelligence Platform", kn: "ಸ್ಥಳ-ಕಾಲ ಗುಪ್ತಚರ ವೇದಿಕೆ" },
  login_restricted:  { en: "Restricted Access · Authorized Personnel Only", kn: "ನಿರ್ಬಂಧಿತ ಪ್ರವೇಶ · ಅಧಿಕೃತ ಸಿಬ್ಬಂದಿ ಮಾತ್ರ" },
  login_badge:       { en: "Badge Number",                         kn: "ಬ್ಯಾಡ್ಜ್ ಸಂಖ್ಯೆ" },
  login_passphrase:  { en: "Passphrase",                           kn: "ಪಾಸ್‌ಫ್ರೇಸ್" },
  login_enter_pass:  { en: "Enter passphrase…",                    kn: "ಪಾಸ್‌ಫ್ರೇಸ್ ನಮೂದಿಸಿ…" },
  login_button:      { en: "Access Platform",                      kn: "ವೇದಿಕೆ ಪ್ರವೇಶಿಸಿ" },
  login_authing:     { en: "Authenticating…",                      kn: "ದೃಢೀಕರಣ…" },
  login_error:       { en: "Invalid credentials. Access denied.",  kn: "ಅಮಾನ್ಯ ರುಜುವಾತುಗಳು. ಪ್ರವೇಶ ನಿರಾಕರಿಸಲಾಗಿದೆ." },

  // ─── Common ────────────────────────────────────────────────────────────────
  common_loading:    { en: "Loading…",       kn: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  common_close:      { en: "Close",          kn: "ಮುಚ್ಚಿ" },
  common_all:        { en: "All",            kn: "ಎಲ್ಲಾ" },
  common_high:       { en: "HIGH",           kn: "ಉಚ್ಚ" },
  common_med:        { en: "MED",            kn: "ಮಧ್ಯಮ" },
  common_low:        { en: "LOW",            kn: "ಕಡಿಮೆ" },
} as const;

export type TranslationKey = keyof typeof translations;

/** Convenience helper used inside components */
export function t(key: TranslationKey, locale: Locale): string {
  return translations[key][locale];
}
