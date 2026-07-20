import { useState, useEffect, lazy, Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Network, MapPin, TrendingDown, ShieldCheck, ClipboardCheck, Clock3, type LucideIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Simulator } from "@/components/dashboard/Simulator";
import { AlertsFeed } from "@/components/dashboard/AlertsFeed";
import { ActionBrief, type ActionBriefDecision } from "@/components/dashboard/ActionBrief";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { fetchKpiMetrics } from "@/lib/mock-api";
import type { KpiMetric, StationAnomaly } from "@/lib/types";
import { getSession, isAuthenticated, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SimulatorProvider } from "@/contexts/SimulatorContext";
import { useDisplayPreferences } from "@/contexts/DisplayPreferencesContext";
import { t, type TranslationKey } from "@/lib/i18n";

// Maps backend KPI ids -> local icon + translated label (backend labels are
// plain English only; we still want the simplified/Kannada label locally).
const KPI_META: Record<string, { icon: LucideIcon; labelKey: TranslationKey }> = {
  "criminal-nodes":      { icon: Network,      labelKey: "kpi_criminal_nodes" },
  "hotspot-alerts":      { icon: MapPin,        labelKey: "kpi_hotspot_alerts" },
  "risk-volatility":     { icon: TrendingDown,  labelKey: "kpi_risk_volatility" },
  "resource-readiness":  { icon: ShieldCheck,   labelKey: "kpi_readiness" },
};

const VIEW_TITLE_KEYS: Record<ViewKey, TranslationKey> = {
  dashboard: "nav_dashboard",
  geospatial: "nav_geospatial",
  network: "nav_network",
  simulator: "nav_simulator",
  reports: "nav_reports",
  settings: "nav_settings",
};

// Lazy-load heavy canvas components — keeps login/dashboard first paint instant
const GeoMap = lazy(() =>
  import("@/components/dashboard/GeoMap").then((m) => ({ default: m.GeoMap }))
);
const LinkGraph = lazy(() =>
  import("@/components/dashboard/LinkGraph").then((m) => ({ default: m.LinkGraph }))
);

interface OperationEvent {
  id: string;
  stationName: string;
  decision: ActionBriefDecision;
  note: string;
  createdAt: string;
}

const OPERATION_TIMELINE_KEY = "garuda-operation-timeline";

function OperationsTimeline({ events }: { events: OperationEvent[] }) {
  const { locale } = useLanguage();

  return (
    <section className="rounded-xl border border-white/5 bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-3.5">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-primary" />
            {t("operations_timeline_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">{t("operations_timeline_subtitle", locale)}</div>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {t("operations_timeline_prototype", locale)}
        </span>
      </div>
      <div className="px-5 py-3">
        {events.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">{t("operations_timeline_empty", locale)}</p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-medium">{t(`action_brief_${event.decision}` as TranslationKey, locale)}</span>
                    <span className="text-muted-foreground">{event.stationName}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString(locale === "kn" ? "kn-IN" : "en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.note || t("operations_timeline_no_note", locale)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MapPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`col-span-2 flex ${compact ? "h-[220px]" : "h-[460px]"} items-center justify-center rounded-xl border border-white/5 bg-card`}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="font-mono text-[11px] text-muted-foreground">Loading map…</span>
      </div>
    </div>
  );
}

function GraphPlaceholder() {
  return (
    <div className="flex h-[460px] items-center justify-center rounded-xl border border-white/5 bg-card">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="font-mono text-[11px] text-muted-foreground">Loading network…</span>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  // Fires before the component mounts — instant redirect, no flash
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  component: Dashboard,
});

function RbacBlock({ label, minRole }: { label: string; minRole: string }) {
  return (
    <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-xl border border-white/5 bg-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10">
        <ShieldCheck className="h-5 w-5 text-[var(--danger)]" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
          Requires {minRole} clearance
        </div>
      </div>
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-[70vh] items-center justify-center rounded-xl border border-white/5 bg-card">
      <div className="text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Module
        </div>
        <div className="mt-2 text-2xl font-medium tracking-tight">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

function Dashboard() {
  // Session is guaranteed by beforeLoad — no null check needed
  const officer = getSession() as Officer;
  const [view, setView] = useState<ViewKey>("dashboard");
  const { locale } = useLanguage();
  const { theme } = useTheme();
  const { autoRefresh, compactCards } = useDisplayPreferences();
  const [kpis, setKpis] = useState<KpiMetric[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState<StationAnomaly | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [simulationImpact, setSimulationImpact] = useState<number | null>(null);
  const [operationEvents, setOperationEvents] = useState<OperationEvent[]>(() => {
    try {
      const savedEvents = localStorage.getItem(OPERATION_TIMELINE_KEY);
      return savedEvents ? JSON.parse(savedEvents) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const loadKpis = () => fetchKpiMetrics().then(({ data }) => {
      setKpis(data);
      setKpisLoading(false);
    });
    loadKpis();
    if (!autoRefresh) return;
    const interval = window.setInterval(loadKpis, 60_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(OPERATION_TIMELINE_KEY, JSON.stringify(operationEvents));
  }, [operationEvents]);

  const openBrief = (anomaly: StationAnomaly) => {
    setSelectedAnomaly(anomaly);
    setBriefOpen(true);
  };

  const recordDecision = (decision: ActionBriefDecision, note: string, anomaly: StationAnomaly) => {
    setOperationEvents((events) => [
      { id: crypto.randomUUID(), stationName: anomaly.station_name, decision, note, createdAt: new Date().toISOString() },
      ...events,
    ].slice(0, 8));
  };

  return (
    <SimulatorProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Toaster theme={theme} position="bottom-right" />
        <Sidebar active={view} onChange={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar officer={officer} kpis={kpis} activeViewLabel={t(VIEW_TITLE_KEYS[view], locale)} onNavigate={setView} />
          <main className="min-w-0 flex-1 space-y-4 p-5">
            {view === "dashboard" && (
              <>
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {kpisLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-[122px] animate-pulse rounded-xl border border-white/5 bg-card" />
                    ))
                  ) : (
                    kpis.map((k) => {
                      const meta = KPI_META[k.id];
                      return (
                        <KpiCard
                          key={k.id}
                          label={meta ? t(meta.labelKey, locale) : k.label}
                          value={k.value}
                          delta={k.delta}
                          trend={k.trend}
                          positive={k.positive}
                          icon={meta?.icon ?? Network}
                          data={k.sparkline}
                          accent={k.accent}
                          compact={compactCards}
                        />
                      );
                    })
                  )}
                </section>

                {simulationImpact !== null && (
                  <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-5 py-3">
                    <div>
                      <div className="text-sm font-medium">{t("sim_dashboard_result", locale)}: −{simulationImpact}% {t("sim_incidents", locale)}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("sim_dashboard_applied", locale)}</p>
                    </div>
                    <button onClick={() => setSimulationImpact(null)} className="text-xs text-primary transition hover:text-foreground">×</button>
                  </section>
                )}

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="space-y-2 lg:col-span-2">
                    <Suspense fallback={<MapPlaceholder compact />}>
                      <GeoMap compact />
                    </Suspense>
                    <button
                      onClick={() => setView("geospatial")}
                      className="px-1 text-[11px] text-muted-foreground transition hover:text-primary"
                    >
                      {t("overview_open_map", locale)}
                    </button>
                  </div>
                  {officer.canViewNetwork ? (
                    <AlertsFeed onOpenView={setView} onOpenBrief={openBrief} />
                  ) : (
                    <RbacBlock label="Criminal Link Analysis" minRole="ASI (CLR-3)" />
                  )}
                </section>

                {officer.canSimulate ? (
                  <section className="flex items-center justify-between rounded-xl border border-white/5 bg-card px-5 py-4">
                    <div>
                      <div className="text-sm font-medium">{t("sim_title", locale)}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{t("overview_simulator_desc", locale)}</div>
                    </div>
                    <button
                      onClick={() => setView("simulator")}
                      className="text-[11px] text-primary transition hover:text-foreground"
                    >
                      {t("overview_open_simulator", locale)}
                    </button>
                  </section>
                ) : (
                  <RbacBlock label="Command Simulator" minRole="SI (CLR-4)" />
                )}

                <OperationsTimeline events={operationEvents} />
              </>
            )}

            {view === "geospatial" && (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Suspense fallback={<MapPlaceholder />}>
                  <GeoMap />
                </Suspense>
              </section>
            )}

            {view === "network" && (
              <section className="grid h-[70vh] grid-cols-1 gap-4">
                {officer.canViewNetwork ? (
                  <Suspense fallback={<GraphPlaceholder />}>
                    <LinkGraph />
                  </Suspense>
                ) : (
                  <RbacBlock label="Criminal Link Analysis" minRole="ASI (CLR-3)" />
                )}
              </section>
            )}

            {view === "simulator" && (
              officer.canSimulate ? <Simulator onComplete={(impact) => {
                setSimulationImpact(impact);
                setView("dashboard");
              }} /> : <RbacBlock label="Command Simulator" minRole="SI (CLR-4)" />
            )}

            {view === "reports" && <ReportsView />}
            {view === "settings" && <SettingsView />}

            <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
              <div>GARUDA BLR v4.2.1 · secure channel</div>
              <div>build 0a4f9f · region ap-south-blr</div>
            </footer>
          </main>
          <ActionBrief anomaly={selectedAnomaly} open={briefOpen} onOpenChange={setBriefOpen} onRecordDecision={recordDecision} />
        </div>
      </div>
    </SimulatorProvider>
  );
}
