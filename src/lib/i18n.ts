/**
 * i18n translation layer — English / ಕನ್ನಡ
 *
 * Keyed by a stable string ID. Components read from this via useLanguage().
 * Wording is kept plain and simple on purpose — this app is used by everyone
 * from senior officers down to constables, so avoid jargon/acronyms where a
 * plain word works just as well.
 *
 * To add a new language: add a new locale block below and update `Locale` type.
 * For production: swap `kn` values with Zoho Catalyst Zia Services API responses.
 */

export type Locale = "en" | "kn";

export const translations = {
  // ─── Navigation ────────────────────────────────────────────────────────────
  nav_dashboard:  { en: "Home",         kn: "ಮುಖಪುಟ" },
  nav_geospatial: { en: "Map",          kn: "ನಕ್ಷೆ" },
  nav_network:    { en: "Connections",  kn: "ಸಂಪರ್ಕಗಳು" },
  nav_reports:    { en: "Reports",      kn: "ವರದಿಗಳು" },
  nav_settings:   { en: "Settings",     kn: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು" },

  // ─── TopBar ────────────────────────────────────────────────────────────────
  topbar_intel:      { en: "Bengaluru City",        kn: "ಬೆಂಗಳೂರು ನಗರ" },
  topbar_overview:   { en: "Overview",               kn: "ಅವಲೋಕನ" },
  topbar_threatcon:  { en: "Alert Level: High",      kn: "ಎಚ್ಚರಿಕೆ ಮಟ್ಟ: ಹೆಚ್ಚು" },
  topbar_search:     { en: "Search cases or places…", kn: "ಪ್ರಕರಣ ಅಥವಾ ಸ್ಥಳ ಹುಡುಕಿ…" },
  topbar_live:       { en: "LIVE",                   kn: "ನೇರ" },
  topbar_brief:      { en: "Report",                 kn: "ವರದಿ" },
  topbar_logout_tt:  { en: "Log out",                kn: "ಲಾಗ್ ಔಟ್" },

  // ─── KPI Cards ─────────────────────────────────────────────────────────────
  kpi_criminal_nodes:   { en: "Cases Reviewed",     kn: "ಪರಿಶೀಲಿಸಿದ ಪ್ರಕರಣಗಳು" },
  kpi_hotspot_alerts:   { en: "Danger Area Alerts",  kn: "ಅಪಾಯದ ಪ್ರದೇಶ ಎಚ್ಚರಿಕೆ" },
  kpi_risk_volatility:  { en: "Risk Level",          kn: "ಅಪಾಯದ ಮಟ್ಟ" },
  kpi_readiness:        { en: "Team Readiness",      kn: "ತಂಡದ ಸಿದ್ಧತೆ" },

  // ─── GeoMap ────────────────────────────────────────────────────────────────
  map_title:        { en: "Crime Map",                   kn: "ಅಪರಾಧ ನಕ್ಷೆ" },
  map_subtitle:     { en: "Bengaluru City — Live Map",   kn: "ಬೆಂಗಳೂರು — ನೇರ ನಕ್ಷೆ" },
  map_layers:       { en: "Map Layers",                   kn: "ನಕ್ಷೆ ಪದರಗಳು" },
  map_threat_layer: { en: "Danger Areas",                 kn: "ಅಪಾಯದ ಪ್ರದೇಶಗಳು" },
  map_patrol_layer: { en: "Patrol Teams",                 kn: "ಗಸ್ತು ತಂಡಗಳು" },
  map_infra_layer:  { en: "City Services",                kn: "ನಗರ ಸೇವೆಗಳು" },
  map_click_hint:   { en: "Click a spot to see details",  kn: "ವಿವರಗಳಿಗೆ ಕ್ಲಿಕ್ ಮಾಡಿ" },
  map_crime_type:   { en: "Crime Type",                   kn: "ಅಪರಾಧ ಪ್ರಕಾರ" },
  map_intensity:    { en: "Danger Level",                 kn: "ಅಪಾಯದ ಮಟ್ಟ" },
  map_coords:       { en: "Location",                     kn: "ಸ್ಥಳ" },
  map_causal:       { en: "Likely Cause",                 kn: "ಸಂಭವನೀಯ ಕಾರಣ" },

  // ─── LinkGraph ─────────────────────────────────────────────────────────────
  graph_title:      { en: "Suspect Connections",        kn: "ಶಂಕಿತರ ಸಂಪರ್ಕ" },
  graph_subtitle:   { en: "Bengaluru Suspect Network",  kn: "ಬೆಂಗಳೂರು ಶಂಕಿತರ ಜಾಲ" },
  graph_type:       { en: "Type",                       kn: "ಪ್ರಕಾರ" },
  graph_risk:       { en: "Risk",                        kn: "ಅಪಾಯ" },
  graph_connections:{ en: "Connections",                 kn: "ಸಂಪರ್ಕಗಳು" },
  graph_links:      { en: "Links",                       kn: "ಕೊಂಡಿಗಳು" },
  graph_click_hint: { en: "Click a person to see details", kn: "ವಿವರಗಳಿಗೆ ಕ್ಲಿಕ್ ಮಾಡಿ" },

  // ─── Simulator ─────────────────────────────────────────────────────────────
  sim_title:         { en: "What-If Planner",       kn: "ಏನಾದರೆ ಯೋಜಕ" },
  sim_impact_label:  { en: "Expected Result",        kn: "ನಿರೀಕ್ಷಿತ ಫಲಿತಾಂಶ" },
  sim_incidents:     { en: "cases",                  kn: "ಪ್ರಕರಣಗಳು" },
  sim_run:           { en: "Run Test",                kn: "ಪರೀಕ್ಷೆ ಮಾಡಿ" },
  sim_running:       { en: "Calculating…",           kn: "ಲೆಕ್ಕ ಹಾಕಲಾಗುತ್ತಿದೆ…" },
  sim_baseline:      { en: "Based on the last 30 days", kn: "ಕಳೆದ 30 ದಿನಗಳ ಆಧಾರದ ಮೇಲೆ" },

  // ─── Reports ───────────────────────────────────────────────────────────────
  reports_title:     { en: "Case Reports",                    kn: "ಪ್ರಕರಣ ವರದಿಗಳು" },
  reports_subtitle:  { en: "Karnataka State Police — Bengaluru", kn: "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ — ಬೆಂಗಳೂರು" },
  reports_refresh:   { en: "Refresh",                          kn: "ಪುನಃ ಲೋಡ್ ಮಾಡಿ" },
  reports_search:    { en: "Search by case, ID, or area…",    kn: "ಪ್ರಕರಣ, ID, ಅಥವಾ ಪ್ರದೇಶದ ಮೂಲಕ ಹುಡುಕಿ…" },
  reports_total:     { en: "Total Cases",                      kn: "ಒಟ್ಟು ಪ್ರಕರಣಗಳು" },
  reports_active:    { en: "Still Under Investigation",        kn: "ಇನ್ನೂ ತನಿಖೆಯಲ್ಲಿದೆ" },
  reports_critical:  { en: "Most Serious Cases",                kn: "ಅತ್ಯಂತ ಗಂಭೀರ ಪ್ರಕರಣಗಳು" },
  reports_stations:  { en: "Police Stations",                  kn: "ಪೊಲೀಸ್ ಠಾಣೆಗಳು" },
  reports_all_severities: { en: "All Levels",                  kn: "ಎಲ್ಲಾ ಹಂತಗಳು" },
  reports_all_statuses:   { en: "All Status",                  kn: "ಎಲ್ಲಾ ಸ್ಥಿತಿ" },
  reports_no_match:  { en: "No cases match your search.",     kn: "ಹುಡುಕಾಟಕ್ಕೆ ಯಾವುದೇ ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ." },
  reports_loading:   { en: "Loading cases…",                   kn: "ಪ್ರಕರಣಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…" },
  reports_showing:   { en: "Showing",                          kn: "ತೋರಿಸಲಾಗುತ್ತಿದೆ" },
  reports_of:        { en: "of",                               kn: "ರಲ್ಲಿ" },
  reports_col_case:     { en: "Case ID",     kn: "ಪ್ರಕರಣ ID" },
  reports_col_title:    { en: "Title",       kn: "ಶೀರ್ಷಿಕೆ" },
  reports_col_area:     { en: "Area",        kn: "ಪ್ರದೇಶ" },
  reports_col_type:     { en: "Crime Type",  kn: "ಅಪರಾಧ ಪ್ರಕಾರ" },
  reports_col_date:     { en: "Date",        kn: "ದಿನಾಂಕ" },
  reports_col_severity: { en: "Level",       kn: "ಹಂತ" },
  reports_col_status:   { en: "Status",      kn: "ಸ್ಥಿತಿ" },
  reports_detail_area:      { en: "Area",              kn: "ಪ್ರದೇಶ" },
  reports_detail_station:   { en: "Police Station",    kn: "ಪೊಲೀಸ್ ಠಾಣೆ" },
  reports_detail_section:   { en: "IPC Section",        kn: "IPC ವಿಭಾಗ" },
  reports_detail_type:      { en: "Crime Type",          kn: "ಅಪರಾಧ ಪ್ರಕಾರ" },
  reports_detail_filed:     { en: "Date Filed",          kn: "ದಾಖಲಿಸಿದ ದಿನಾಂಕ" },
  reports_detail_officer:   { en: "Assigned Officer",    kn: "ನಿಯೋಜಿತ ಅಧಿಕಾರಿ" },
  reports_detail_suspects:  { en: "Suspects Named",      kn: "ಶಂಕಿತರ ಸಂಖ್ಯೆ" },
  reports_translate_zia:      { en: "Translated (Catalyst Zia)",     kn: "ಅನುವಾದಿಸಲಾಗಿದೆ (Catalyst Zia)" },
  reports_translate_fallback: { en: "Translation unavailable — showing original", kn: "ಅನುವಾದ ಲಭ್ಯವಿಲ್ಲ — ಮೂಲ ತೋರಿಸಲಾಗುತ್ತಿದೆ" },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settings_title:          { en: "Settings",              kn: "ಸೆಟ್ಟಿಂಗ್‌ಗಳು" },
  settings_nav_profile:    { en: "My Profile",             kn: "ನನ್ನ ಪ್ರೊಫೈಲ್" },
  settings_nav_alerts:     { en: "Alerts",                 kn: "ಎಚ್ಚರಿಕೆಗಳು" },
  settings_nav_display:    { en: "Theme & Display",        kn: "ಥೀಮ್ ಮತ್ತು ಪ್ರದರ್ಶನ" },
  settings_nav_integrations: { en: "Connected Services",   kn: "ಸಂಪರ್ಕಿತ ಸೇವೆಗಳು" },
  settings_nav_security:   { en: "Security",               kn: "ಭದ್ರತೆ" },
  settings_section_identity:  { en: "Identity",            kn: "ಗುರುತು" },
  settings_section_clearance: { en: "Access Level",        kn: "ಪ್ರವೇಶ ಮಟ್ಟ" },
  settings_section_alerts:    { en: "Alert Rules",         kn: "ಎಚ್ಚರಿಕೆ ನಿಯಮಗಳು" },
  settings_section_ui:        { en: "App Preferences",     kn: "ಆ್ಯಪ್ ಆದ್ಯತೆಗಳು" },
  settings_section_density:   { en: "Text Size",           kn: "ಪಠ್ಯ ಗಾತ್ರ" },
  settings_section_services:  { en: "Connected Services",  kn: "ಸಂಪರ್ಕಿತ ಸೇವೆಗಳು" },
  settings_section_session:   { en: "Session",             kn: "ಸೆಷನ್" },
  settings_theme_label:       { en: "Theme",               kn: "ಥೀಮ್" },
  settings_theme_dark:        { en: "Dark",                kn: "ಡಾರ್ಕ್" },
  settings_theme_light:       { en: "Light",                kn: "ಲೈಟ್" },
  settings_theme_desc:        { en: "Choose a dark or light look for the app.", kn: "ಆ್ಯಪ್‌ಗೆ ಡಾರ್ಕ್ ಅಥವಾ ಲೈಟ್ ನೋಟ ಆಯ್ಕೆಮಾಡಿ." },
  settings_save:              { en: "Save",                 kn: "ಉಳಿಸಿ" },
  settings_saved:             { en: "Saved",                kn: "ಉಳಿಸಲಾಗಿದೆ" },
  settings_end_session:       { en: "Log Out",              kn: "ಲಾಗ್ ಔಟ್" },
  settings_version:           { en: "Version",              kn: "ಆವೃತ್ತಿ" },

  // ─── Login ─────────────────────────────────────────────────────────────────
  login_org:         { en: "Karnataka State Police",   kn: "ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್" },
  login_platform:    { en: "Crime Information System", kn: "ಅಪರಾಧ ಮಾಹಿತಿ ವ್ಯವಸ್ಥೆ" },
  login_restricted:  { en: "For Police Use Only",      kn: "ಪೊಲೀಸ್ ಬಳಕೆಗೆ ಮಾತ್ರ" },
  login_badge:       { en: "Badge Number",             kn: "ಬ್ಯಾಡ್ಜ್ ಸಂಖ್ಯೆ" },
  login_passphrase:  { en: "Password",                 kn: "ಪಾಸ್‌ವರ್ಡ್" },
  login_enter_pass:  { en: "Enter password…",          kn: "ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ…" },
  login_button:      { en: "Log In",                   kn: "ಲಾಗ್ ಇನ್" },
  login_authing:     { en: "Checking…",                kn: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…" },
  login_error:       { en: "Wrong badge number or password.", kn: "ತಪ್ಪು ಬ್ಯಾಡ್ಜ್ ಸಂಖ್ಯೆ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್." },
  login_required:    { en: "Please enter your badge number and password.", kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಬ್ಯಾಡ್ಜ್ ಸಂಖ್ಯೆ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ." },
  login_demo:        { en: "Demo Accounts",            kn: "ಡೆಮೊ ಖಾತೆಗಳು" },

  // ─── Common ────────────────────────────────────────────────────────────────
  common_loading:    { en: "Loading…",       kn: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  common_close:      { en: "Close",          kn: "ಮುಚ್ಚಿ" },
  common_all:        { en: "All",            kn: "ಎಲ್ಲಾ" },
  common_high:       { en: "HIGH",           kn: "ಹೆಚ್ಚು" },
  common_med:        { en: "MED",            kn: "ಮಧ್ಯಮ" },
  common_low:        { en: "LOW",            kn: "ಕಡಿಮೆ" },
} as const;

export type TranslationKey = keyof typeof translations;

/** Convenience helper used inside components */
export function t(key: TranslationKey, locale: Locale): string {
  return translations[key][locale];
}

