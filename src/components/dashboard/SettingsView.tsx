'use client';

import { useEffect, useState } from "react";
import { Settings, Shield, Bell, Monitor, Globe2, Key, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, type TranslationKey } from "@/lib/i18n";
import { getSession, logout } from "@/lib/auth";
import { fetchAnalyticsSummary } from "@/lib/mock-api";
import type { AnalyticsSummary } from "@/lib/types";
import { SectionHelp } from "@/components/dashboard/SectionHelp";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToggleSetting {
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  default: boolean;
}

type SettingsSection = "profile" | "alerts" | "display" | "integrations" | "security";

// ─── Data ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: SettingsSection; labelKey: TranslationKey; icon: typeof Settings }[] = [
  { id: "profile", labelKey: "settings_nav_profile", icon: Shield },
  { id: "alerts", labelKey: "settings_nav_alerts", icon: Bell },
  { id: "display", labelKey: "settings_nav_display", icon: Monitor },
  { id: "integrations", labelKey: "settings_nav_integrations", icon: Globe2 },
  { id: "security", labelKey: "settings_nav_security", icon: Key },
];

const ALERT_TOGGLES: ToggleSetting[] = [
  { id: "critical-incidents", labelKey: "settings_alert_critical", descriptionKey: "settings_alert_critical_desc", default: true },
  { id: "hotspot-change", labelKey: "settings_alert_hotspot", descriptionKey: "settings_alert_hotspot_desc", default: true },
  { id: "network-flag", labelKey: "settings_alert_network", descriptionKey: "settings_alert_network_desc", default: false },
  { id: "patrol-gap", labelKey: "settings_alert_patrol", descriptionKey: "settings_alert_patrol_desc", default: true },
  { id: "daily-digest", labelKey: "settings_alert_digest", descriptionKey: "settings_alert_digest_desc", default: false },
];

const DISPLAY_TOGGLES: ToggleSetting[] = [
  { id: "animations", labelKey: "settings_display_animations", descriptionKey: "settings_display_animations_desc", default: true },
  { id: "compact-kpi", labelKey: "settings_display_compact", descriptionKey: "settings_display_compact_desc", default: false },
  { id: "auto-refresh", labelKey: "settings_display_refresh", descriptionKey: "settings_display_refresh_desc", default: true },
  { id: "kannada", labelKey: "settings_display_kannada", descriptionKey: "settings_display_kannada_desc", default: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 rounded-full p-0.5 transition-colors", on ? "bg-primary/50" : "bg-foreground/10")}
      aria-checked={on}
      role="switch"
    >
      <div className={cn("h-4 w-4 rounded-full transition-transform", on ? "translate-x-4 bg-primary" : "translate-x-0 bg-foreground/40")} />
    </button>
  );
}

function ToggleRow({ setting, value, onChange }: { setting: ToggleSetting; value: boolean; onChange: (id: string, v: boolean) => void }) {
  const { locale } = useLanguage();
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm">{t(setting.labelKey, locale)}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{t(setting.descriptionKey, locale)}</div>
      </div>
      <Toggle on={value} onChange={(v) => onChange(setting.id, v)} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-foreground/5 bg-card">
      <div className="border-b border-foreground/5 px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      </div>
      <div className="divide-y divide-foreground/[0.03] px-5">{children}</div>
    </div>
  );
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { locale } = useLanguage();
  const officer = getSession();

  const identity: { labelKey: TranslationKey; value: string }[] = [
    { labelKey: "settings_full_name", value: officer?.name ?? "-" },
    { labelKey: "settings_badge_number", value: officer?.badge ?? "-" },
    { labelKey: "settings_designation", value: officer?.designation ?? "-" },
    { labelKey: "settings_station", value: officer?.station ?? "-" },
  ];
  const clearance: { labelKey: TranslationKey; value: string }[] = [
    { labelKey: "settings_access_level", value: officer?.clearance ?? "-" },
    { labelKey: "settings_team", value: officer?.node ?? "-" },
    { labelKey: "settings_last_login", value: "-" },
  ];

  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_section_identity", locale)}>
        {identity.map(({ labelKey, value }) => (
          <div key={labelKey} className="py-3">
            <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground">{t(labelKey, locale)}</label>
            <input
              readOnly
              value={value}
              className="w-full rounded-md border border-foreground/5 bg-background/50 px-3 py-2 font-mono text-sm text-foreground outline-none"
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard title={t("settings_section_clearance", locale)}>
        {clearance.map(({ labelKey, value }) => (
          <div key={labelKey} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{t(labelKey, locale)}</span>
            <span className="font-mono text-xs">{value}</span>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function AlertsSection({ toggles, values, onChange }: { toggles: ToggleSetting[]; values: Record<string, boolean>; onChange: (id: string, v: boolean) => void }) {
  const { locale } = useLanguage();
  return (
    <SectionCard title={t("settings_section_alerts", locale)}>
      {toggles.map((s) => (
        <ToggleRow key={s.id} setting={s} value={values[s.id] ?? s.default} onChange={onChange} />
      ))}
    </SectionCard>
  );
}

function DisplaySection({ toggles, values, onChange }: { toggles: ToggleSetting[]; values: Record<string, boolean>; onChange: (id: string, v: boolean) => void }) {
  const { locale } = useLanguage();
  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_section_ui", locale)}>
        {toggles.map((s) => (
          <ToggleRow key={s.id} setting={s} value={values[s.id] ?? s.default} onChange={onChange} />
        ))}
      </SectionCard>
      <SectionCard title={t("settings_section_density", locale)}>
        {(["settings_density_compact", "settings_density_standard", "settings_density_comfortable"] as const).map((opt) => (
          <div key={opt} className="flex items-center justify-between py-3 text-sm">
            <span>{t(opt, locale)}</span>
            {opt === "settings_density_standard" && <span className="rounded-full bg-primary/20 px-2 py-0.5 font-mono text-[10px] text-primary">{t("settings_active", locale)}</span>}
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function AnalyticsSection() {
  const { locale } = useLanguage();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyticsSummary()
      .then((res) => { if (!cancelled) setSummary(res.data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <SectionCard title={t("settings_section_analytics", locale)}>
        <div className="py-3 text-sm text-muted-foreground">{t("settings_analytics_unavailable", locale)}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("settings_section_analytics", locale)}>
      <div className="grid grid-cols-3 gap-3 py-3">
        {([
          [t("settings_analytics_total_visits", locale), summary?.total_visits],
          [t("settings_analytics_unique_visitors", locale), summary?.unique_visitors],
          [t("settings_analytics_today", locale), summary?.today_visits],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-foreground/5 bg-background/40 px-3 py-2.5 text-center">
            <div className="font-mono text-lg text-foreground">{value ?? "-"}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      {!!summary?.top_paths.length && (
        <div className="py-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings_analytics_top_pages", locale)}</div>
          {summary.top_paths.map((p) => (
            <div key={p.path} className="flex items-center justify-between py-1 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{p.path}</span>
              <span className="font-mono text-xs">{p.visits}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function IntegrationsSection() {
  const { locale } = useLanguage();
  const integrations: { id: string; name: string; status: "connected" | "pending"; descriptionKey: TranslationKey }[] = [
    { id: "zoho-ds", name: "Zoho Catalyst Data Store", status: "connected", descriptionKey: "settings_service_datastore" },
    { id: "quickml", name: "Catalyst QuickML Services", status: "connected", descriptionKey: "settings_service_zia" },
    { id: "appsail", name: "AppSail Backend", status: "connected", descriptionKey: "settings_service_appsail" },
    { id: "maplibre", name: "MapLibre GL", status: "connected", descriptionKey: "settings_service_map" },
  ];

  return (
    <div className="space-y-4">
      <AnalyticsSection />
      <SectionCard title={t("settings_section_services", locale)}>
        {integrations.map((i) => (
          <div key={i.id} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm">{i.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{t(i.descriptionKey, locale)}</div>
            </div>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
              i.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
            )}>
              {t(i.status === "connected" ? "settings_connected" : "settings_pending", locale)}
            </span>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function SecuritySection() {
  const { locale } = useLanguage();
  const navigate = useNavigate();
  const sessionDetails: { labelKey: TranslationKey; value: string }[] = [
    { labelKey: "settings_session_token", value: t("settings_value_active", locale) },
    { labelKey: "settings_ip_address", value: t("settings_value_browser_session", locale) },
    { labelKey: "settings_session_expires", value: t("settings_value_server_managed", locale) },
  ];
  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_section_session", locale)}>
        {sessionDetails.map(({ labelKey, value }) => (
          <div key={labelKey} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{t(labelKey, locale)}</span>
            <span className="font-mono text-[11px]">{value}</span>
          </div>
        ))}
      </SectionCard>
      <button
        onClick={() => {
          logout();
          toast(t("settings_session_ended", locale), { description: t("settings_redirecting", locale) });
          navigate({ to: "/login" });
        }}
        className="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-400 transition hover:bg-rose-500/20"
      >
        {t("settings_end_session", locale)}
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SettingsView() {
  const { locale } = useLanguage();
  const [active, setActive] = useState<SettingsSection>("profile");
  const [alertValues, setAlertValues] = useState<Record<string, boolean>>(
    Object.fromEntries(ALERT_TOGGLES.map((t) => [t.id, t.default]))
  );
  const [displayValues, setDisplayValues] = useState<Record<string, boolean>>(
    Object.fromEntries(DISPLAY_TOGGLES.map((t) => [t.id, t.default]))
  );

  const handleAlertChange = (id: string, v: boolean) => {
    setAlertValues((prev) => ({ ...prev, [id]: v }));
    const setting = ALERT_TOGGLES.find((t) => t.id === id);
    toast(`${setting ? t(setting.labelKey, locale) : ""} ${t(v ? "settings_enabled" : "settings_disabled", locale)}`);
  };

  const handleDisplayChange = (id: string, v: boolean) => {
    setDisplayValues((prev) => ({ ...prev, [id]: v }));
    const setting = DISPLAY_TOGGLES.find((t) => t.id === id);
    toast(`${setting ? t(setting.labelKey, locale) : ""} ${t(v ? "settings_enabled" : "settings_disabled", locale)}`);
  };

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {/* Sidebar nav */}
      <div className="w-full shrink-0 sm:w-52">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">{t("settings_title", locale)}</div>
          <SectionHelp title={t("help_settings_title", locale)} description={t("help_settings_desc", locale)} />
        </div>
        <nav className="grid grid-cols-2 gap-1 sm:block sm:space-y-0.5">
          {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                active === id
                  ? "bg-foreground/5 text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t(labelKey, locale)}
              </div>
              {active === id && <ChevronRight className="h-3 w-3" />}
            </button>
          ))}
        </nav>

        <div className="mt-6 rounded-lg border border-foreground/5 bg-card p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings_version", locale)}</div>
          <div className="mt-1 font-mono text-xs">Garuda v4.2.1</div>
          <div className="font-mono text-[10px] text-muted-foreground">build 0a4f9f · ap-south</div>
        </div>
      </div>

      {/* Content panel */}
      <div className="flex-1">
        {active === "profile" && <ProfileSection />}
        {active === "alerts" && <AlertsSection toggles={ALERT_TOGGLES} values={alertValues} onChange={handleAlertChange} />}
        {active === "display" && <DisplaySection toggles={DISPLAY_TOGGLES} values={displayValues} onChange={handleDisplayChange} />}
        {active === "integrations" && <IntegrationsSection />}
        {active === "security" && <SecuritySection />}
      </div>
    </div>
  );
}
