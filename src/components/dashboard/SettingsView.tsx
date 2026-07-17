'use client';

import { useState } from "react";
import { Settings, Shield, Bell, Monitor, Globe2, Key, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToggleSetting {
  id: string;
  label: string;
  description: string;
  default: boolean;
}

type SettingsSection = "profile" | "alerts" | "display" | "integrations" | "security";

// ─── Data ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Settings }[] = [
  { id: "profile", label: "Officer Profile", icon: Shield },
  { id: "alerts", label: "Alert Preferences", icon: Bell },
  { id: "display", label: "Display & Theme", icon: Monitor },
  { id: "integrations", label: "Integrations", icon: Globe2 },
  { id: "security", label: "Security & Access", icon: Key },
];

const ALERT_TOGGLES: ToggleSetting[] = [
  { id: "critical-incidents", label: "Critical Incident Alerts", description: "Push notification on THREATCON escalation.", default: true },
  { id: "hotspot-change", label: "Hotspot Delta Notifications", description: "Alert when hotspot intensity changes >15%.", default: true },
  { id: "network-flag", label: "Network Node Flags", description: "Notify when a suspect node is re-activated.", default: false },
  { id: "patrol-gap", label: "Patrol Coverage Gaps", description: "Alert on zones uncovered > 45 minutes.", default: true },
  { id: "daily-digest", label: "Daily Intelligence Digest", description: "Summary email at 07:00 IST every day.", default: false },
];

const DISPLAY_TOGGLES: ToggleSetting[] = [
  { id: "animations", label: "Map Animations", description: "Pulse and glow effects on threat heatmap.", default: true },
  { id: "compact-kpi", label: "Compact KPI Mode", description: "Reduce KPI card height for more canvas space.", default: false },
  { id: "auto-refresh", label: "Auto-Refresh Data", description: "Reload intelligence feed every 60 seconds.", default: true },
  { id: "kannada", label: "Kannada Label Overlay", description: "Show Kannada district names via Zia Services.", default: false },
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

  const save = () => {
    toast.success("Profile updated", { description: "Changes saved to KSP identity store." });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Identity">
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

      <SectionCard title="Clearance">
        {[
          { label: "Clearance Level", value: "CLR-7 (Restricted)" },
          { label: "Node Designation", value: "BLR-A1 · AP-South" },
          { label: "Last Authentication", value: "2026-07-16 18:42 IST" },
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
        {saved ? "Saved" : "Save Profile"}
      </button>
    </div>
  );
}

function AlertsSection({ toggles, values, onChange }: { toggles: ToggleSetting[]; values: Record<string, boolean>; onChange: (id: string, v: boolean) => void }) {
  return (
    <SectionCard title="Notification Rules">
      {toggles.map((s) => (
        <ToggleRow key={s.id} setting={s} value={values[s.id] ?? s.default} onChange={onChange} />
      ))}
    </SectionCard>
  );
}

function DisplaySection({ toggles, values, onChange }: { toggles: ToggleSetting[]; values: Record<string, boolean>; onChange: (id: string, v: boolean) => void }) {
  return (
    <div className="space-y-4">
      <SectionCard title="UI Preferences">
        {toggles.map((s) => (
          <ToggleRow key={s.id} setting={s} value={values[s.id] ?? s.default} onChange={onChange} />
        ))}
      </SectionCard>
      <SectionCard title="Data Density">
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
  const integrations = [
    { id: "zoho-ds", name: "Zoho Catalyst Data Store", status: "connected", desc: "ZCQL-backed synthetic crime records" },
    { id: "zia", name: "Catalyst Zia Services", status: "connected", desc: "Kannada translation engine" },
    { id: "appsail", name: "AppSail FastAPI Backend", status: "pending", desc: "causal-v2.4 inference engine" },
    { id: "mapbox", name: "Mapbox GL (3D Canvas)", status: "pending", desc: "Hexagonal prism crime density tiles" },
  ];

  return (
    <SectionCard title="Connected Services">
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
  return (
    <div className="space-y-4">
      <SectionCard title="Session">
        {[
          { label: "Session Token", value: "eyJ...BLR-A1 (active)" },
          { label: "IP Address", value: "10.14.22.4 · KSP-Intranet" },
          { label: "Session Expires", value: "2026-07-16 23:59 IST" },
          { label: "2FA Status", value: "Enabled · TOTP" },
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
        End Session
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SettingsView() {
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
          <div className="text-sm font-medium">Settings</div>
        </div>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
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
                {label}
              </div>
              {active === id && <ChevronRight className="h-3 w-3" />}
            </button>
          ))}
        </nav>

        <div className="mt-6 rounded-lg border border-white/5 bg-card p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Version</div>
          <div className="mt-1 font-mono text-xs">Sentinel BLR v4.2.1</div>
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
