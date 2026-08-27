import { useState, useEffect, lazy, Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Network, MapPin, TrendingDown, ShieldCheck, type LucideIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Simulator } from "@/components/dashboard/Simulator";
import { AlertsFeed } from "@/components/dashboard/AlertsFeed";
import { ActionBrief, type ActionBriefDecision } from "@/components/dashboard/ActionBrief";
import { FieldMode } from "@/components/dashboard/FieldMode";
import { OperationsBoard } from "@/components/dashboard/OperationsBoard";
import { CommandOverview } from "@/components/dashboard/CommandOverview";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { createResponsePlan, fetchKpiMetrics } from "@/lib/mock-api";
import type { KpiMetric, StationAnomaly } from "@/lib/types";
import { getSession, isAuthenticated, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScope } from "@/contexts/ScopeContext";
import { SimulatorProvider } from "@/contexts/SimulatorContext";
import { t, type TranslationKey } from "@/lib/i18n";

// Maps backend KPI ids -> local icon + translated label (backend labels are
// plain English only; we still want the simplified/Kannada label locally).
const KPI_META: Record<string, { icon: LucideIcon; labelKey: TranslationKey }> = {
  "criminal-nodes":      { icon: Network,      labelKey: "kpi_criminal_nodes" },
  "hotspot-alerts":      { icon: MapPin,        labelKey: "kpi_hotspot_alerts" },
  "risk-volatility":     { icon: TrendingDown,  labelKey: "kpi_risk_volatility" },
  "resource-readiness":  { icon: ShieldCheck,   labelKey: "kpi_readiness" },
};

const KPI_HELP: Record<string, TranslationKey> = {
  "criminal-nodes": "help_kpi_cases",
  "hotspot-alerts": "help_kpi_hotspots",
  "risk-volatility": "help_kpi_risk",
  "resource-readiness": "help_kpi_arrests",
};

// Lazy-load heavy canvas components — keeps login/dashboard first paint instant
const GeoMap = lazy(() =>
  import("@/components/dashboard/GeoMap").then((m) => ({ default: m.GeoMap }))
);
const LinkGraph = lazy(() =>
  import("@/components/dashboard/LinkGraph").then((m) => ({ default: m.LinkGraph }))
);

function MapPlaceholder({ compact = false }: { compact?: boolean }) {
  const { locale } = useLanguage();
  return (
    <div className={`col-span-2 flex ${compact ? "min-h-[220px] flex-1" : "h-[460px]"} items-center justify-center rounded-xl border border-foreground/5 bg-card`}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="font-mono text-[11px] text-muted-foreground">{t("loading_map", locale)}</span>
      </div>
    </div>
  );
}

function GraphPlaceholder() {
  const { locale } = useLanguage();
  return (
    <div className="flex h-[460px] items-center justify-center rounded-xl border border-foreground/5 bg-card">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="font-mono text-[11px] text-muted-foreground">{t("loading_network", locale)}</span>
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

function RbacBlock({ labelKey, minRoleKey }: { labelKey: TranslationKey; minRoleKey: TranslationKey }) {
  const { locale } = useLanguage();
  return (
    <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-xl border border-foreground/5 bg-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--danger)]/30 bg-[var(--danger)]/10">
        <ShieldCheck className="h-5 w-5 text-[var(--danger)]" />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium">{t(labelKey, locale)}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {t(minRoleKey, locale)}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  const { locale } = useLanguage();
  return (
    <div className="flex h-[70vh] items-center justify-center rounded-xl border border-foreground/5 bg-card">
      <div className="text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {t("common_module", locale)}
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
  const { districtId } = useScope();
  const [kpis, setKpis] = useState<KpiMetric[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [selectedAnomaly, setSelectedAnomaly] = useState<StationAnomaly | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [simulationImpact, setSimulationImpact] = useState<number | null>(null);
  const [operationsVersion, setOperationsVersion] = useState(0);

  useEffect(() => {
    setKpisLoading(true);
    fetchKpiMetrics({ districtId }).then(({ data }) => {
      setKpis(data);
      setKpisLoading(false);
    });
  }, [districtId]);

  const openBrief = (anomaly: StationAnomaly) => {
    setSelectedAnomaly(anomaly);
    setBriefOpen(true);
  };

  const recordDecision = async (decision: ActionBriefDecision, note: string, anomaly: StationAnomaly, assignedTo: string) => {
    await createResponsePlan({
      alert_id: `station-${anomaly.station_id}-${anomaly.current_count}`,
      station_id: anomaly.station_id,
      station_name: anomaly.station_name,
      current_count: anomaly.current_count,
      usual_count: anomaly.mean_count,
      z_score: anomaly.z_score,
      decision,
      note,
      assigned_to: assignedTo,
    });
    setOperationsVersion((version) => version + 1);
  };

  return (
    <SimulatorProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Toaster theme={theme} position="bottom-right" />
        <Sidebar active={view} onChange={setView} fieldMode={officer.designation === "Constable"} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar officer={officer} kpis={kpis} onNavigate={setView} />
          <main className="min-w-0 flex-1 space-y-4 p-4 pb-24 sm:p-5">
            {view === "dashboard" && (
              officer.designation === "Constable" ? (
                <FieldMode officer={officer} onNavigate={setView} />
              ) : officer.designation === "DGP" || officer.designation === "ACP" ? (
                <CommandOverview onNavigate={setView} />
              ) : <>
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {kpisLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-[122px] animate-pulse rounded-xl border border-foreground/5 bg-card" />
                    ))
                  ) : (
                    kpis.map((k) => {
                      const meta = KPI_META[k.id];
                      return (
                        <KpiCard
                          key={k.id}
                          label={meta ? t(meta.labelKey, locale) : t("kpi_metric", locale)}
                          value={k.value}
                          delta={k.delta}
                          trend={k.trend}
                          positive={k.positive}
                          icon={meta?.icon ?? Network}
                          data={k.sparkline}
                          accent={k.accent}
                          helpText={t(KPI_HELP[k.id] ?? "help_kpi_default", locale)}
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
                  <div className="flex flex-col gap-2 lg:col-span-2">
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
                    <RbacBlock labelKey="rbac_locked_network" minRoleKey="rbac_requires_asi" />
                  )}
                </section>

                {officer.canSimulate ? (
                  <section className="flex items-center justify-between rounded-xl border border-foreground/5 bg-card px-5 py-4">
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
                  <RbacBlock labelKey="rbac_locked_simulator" minRoleKey="rbac_requires_si" />
                )}

                <OperationsBoard refreshKey={operationsVersion} />
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
                  <RbacBlock labelKey="rbac_locked_network" minRoleKey="rbac_requires_asi" />
                )}
              </section>
            )}

            {view === "simulator" && (
              officer.canSimulate ? <Simulator onComplete={(impact) => {
                setSimulationImpact(impact);
                setView("dashboard");
              }} /> : <RbacBlock labelKey="rbac_locked_simulator" minRoleKey="rbac_requires_si" />
            )}

            {view === "reports" && <ReportsView />}
            {view === "settings" && <SettingsView />}

            <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
              <div>GARUDA v4.2.1 · {t("footer_secure_channel", locale)}</div>
              <div>build 0a4f9f · region ap-south-blr</div>
            </footer>
          </main>
          <ActionBrief anomaly={selectedAnomaly} open={briefOpen} onOpenChange={setBriefOpen} onRecordDecision={recordDecision} />
        </div>
      </div>
    </SimulatorProvider>
  );
}
