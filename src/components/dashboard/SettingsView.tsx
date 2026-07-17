'use client';

import { useState } from "react";
import { Settings, Shield, Bell, Monitor, Globe2, Key, ChevronRight, Check, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { t, type TranslationKey } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToggleSetting {
  id: string;
  label: string;
  description: string;
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
  { id: "critical-incidents", label: "Serious Incident Alerts", description: "Notify me right away for high-danger events.", default: true },
  { id: "hotspot-change", label: "Danger Area Changes", description: "Alert when a danger area gets much worse.", default: true },
  { id: "network-flag", label: "Suspect Flags", description: "Notify when a known suspect shows up again.", default: false },
  { id: "patrol-gap", label: "Patrol Coverage Gaps", description: "Alert if an area has no patrol for over 45 minutes.", default: true },
  { id: "daily-digest", label: "Daily Summary", description: "Get a summary email every day at 7:00 AM.", default: false },
];

const DISPLAY_TOGGLES: ToggleSetting[] = [
  { id: "animations", label: "Map Animations", description: "Show moving effects on the danger map.", default: true },
  { id: "compact-kpi", label: "Compact Cards", description: "Make the top summary cards smaller.", default: false },
  { id: "auto-refresh", label: "Auto-Refresh Data", description: "Reload the latest data every 60 seconds.", default: true },
  { id: "kannada", label: "Kannada Place Names", description: "Show area names in Kannada on the map.", default: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn("relative h-5 w-9 rounded-full p-0.5 transition-colors", on ? "bg-primary/50" : "bg-white/10")}
      aria-checked={on}
      role="switch"
    >
      <div className={cn("h-4 w-4 rounded-full transition-transform", on ? "translate-x-4 bg-primary" : "translate-x-0 bg-white/40")} />
    </button>
  );
}

function ToggleRow({ setting, value, onChange }: { setting: ToggleSetting; value: boolean; onChange: (id: string, v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm">{setting.label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{setting.description}</div>
      </div>
      <Toggle on={value} onChange={(v) => onChange(setting.id, v)} />
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-card">
      <div className="border-b border-white/5 px-5 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      </div>
      <div className="divide-y divide-white/[0.03] px-5">{children}</div>
    </div>
  );
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function ProfileSection() {
  const [saved, setSaved] = useState(false);
  const { locale } = useLanguage();

  const save = () => {
    toast.success("Profile updated", { description: "Changes saved to KSP identity store." });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_section_identity", locale)}>
        {[
          { label: "Full Name", value: "Cpt. R. Vance", type: "text" },
          { label: "Badge Number", value: "KSP-BLR-7741", type: "text" },
          { label: "Designation", value: "Circle Inspector", type: "text" },
          { label: "Station", value: "Bengaluru City Police HQ", type: "text" },
        ].map(({ label, value, type }) => (
          <div key={label} className="py-3">
            <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
            <input
              type={type}
              defaultValue={value}
              className="w-full rounded-md border border-white/5 bg-background/50 px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-white/15"
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard title={t("settings_section_clearance", locale)}>
        {[
          { label: "Access Level", value: "CLR-7 (Full Access)" },
          { label: "Team", value: "BLR-A1 · South Zone" },
          { label: "Last Login", value: "2026-07-16 18:42 IST" },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-xs">{value}</span>
          </div>
        ))}
      </SectionCard>

      <button
        onClick={save}
        className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/25"
      >
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? t("settings_saved", locale) : t("settings_save", locale)}
      </button>
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

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const { locale } = useLanguage();
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm">{t("settings_theme_label", locale)}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{t("settings_theme_desc", locale)}</div>
      </div>
      <div className="flex items-center gap-1 rounded-md border border-white/5 bg-background/40 p-0.5">
        <button
          onClick={() => setTheme("dark")}
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition",
            theme === "dark" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Moon className="h-3.5 w-3.5" /> {t("settings_theme_dark", locale)}
        </button>
        <button
          onClick={() => setTheme("light")}
          className={cn(
            "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition",
            theme === "light" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sun className="h-3.5 w-3.5" /> {t("settings_theme_light", locale)}
        </button>
      </div>
    </div>
  );
}

function DisplaySection({ toggles, values, onChange }: { toggles: ToggleSetting[]; values: Record<string, boolean>; onChange: (id: string, v: boolean) => void }) {
  const { locale } = useLanguage();
  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_theme_label", locale)}>
        <ThemeRow />
      </SectionCard>
      <SectionCard title={t("settings_section_ui", locale)}>
        {toggles.map((s) => (
          <ToggleRow key={s.id} setting={s} value={values[s.id] ?? s.default} onChange={onChange} />
        ))}
      </SectionCard>
      <SectionCard title={t("settings_section_density", locale)}>
        {(["Compact", "Standard", "Comfortable"] as const).map((opt) => (
          <div key={opt} className="flex items-center justify-between py-3 text-sm">
            <span>{opt}</span>
            {opt === "Standard" && <span className="rounded-full bg-primary/20 px-2 py-0.5 font-mono text-[10px] text-primary">Active</span>}
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function IntegrationsSection() {
  const { locale } = useLanguage();
  const integrations = [
    { id: "zoho-ds", name: "Zoho Catalyst Data Store", status: "connected", desc: "Stores all case records" },
    { id: "zia", name: "Catalyst Zia Services", status: "connected", desc: "Kannada translation" },
    { id: "appsail", name: "AppSail Backend", status: "pending", desc: "Runs the crime analysis" },
    { id: "mapbox", name: "Mapbox GL (3D Map)", status: "pending", desc: "Powers the city map" },
  ];

  return (
    <SectionCard title={t("settings_section_services", locale)}>
      {integrations.map((i) => (
        <div key={i.id} className="flex items-center justify-between py-3">
          <div>
            <div className="text-sm">{i.name}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{i.desc}</div>
          </div>
          <span className={cn(
            "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
            i.status === "connected" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
          )}>
            {i.status}
          </span>
        </div>
      ))}
    </SectionCard>
  );
}

function SecuritySection() {
  const { locale } = useLanguage();
  return (
    <div className="space-y-4">
      <SectionCard title={t("settings_section_session", locale)}>
        {[
          { label: "Session Token", value: "eyJ...BLR-A1 (active)" },
          { label: "IP Address", value: "10.14.22.4 · KSP-Intranet" },
          { label: "Session Expires", value: "2026-07-16 23:59 IST" },
          { label: "2FA Status", value: "Enabled" },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-[11px]">{value}</span>
          </div>
        ))}
      </SectionCard>
      <button
        onClick={() => toast("Session logged out", { description: "Redirecting to auth portal…" })}
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
    toast(`${setting?.label} ${v ? "enabled" : "disabled"}`);
  };

  const handleDisplayChange = (id: string, v: boolean) => {
    setDisplayValues((prev) => ({ ...prev, [id]: v }));
    const setting = DISPLAY_TOGGLES.find((t) => t.id === id);
    toast(`${setting?.label} ${v ? "enabled" : "disabled"}`);
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar nav */}
      <div className="w-52 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-primary" />
          <div className="text-sm font-medium">{t("settings_title", locale)}</div>
        </div>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                active === id
                  ? "bg-white/5 text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
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

        <div className="mt-6 rounded-lg border border-white/5 bg-card p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings_version", locale)}</div>
          <div className="mt-1 font-mono text-xs">Garuda BLR v4.2.1</div>
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
