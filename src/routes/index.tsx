import { useState, useEffect, lazy, Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Network, MapPin, TrendingDown, ShieldCheck, type LucideIcon } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Simulator } from "@/components/dashboard/Simulator";
import { AlertsFeed } from "@/components/dashboard/AlertsFeed";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { fetchKpiMetrics } from "@/lib/mock-api";
import type { KpiMetric } from "@/lib/types";
import { getSession, isAuthenticated, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
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

// Lazy-load heavy canvas components — keeps login/dashboard first paint instant
const GeoMap = lazy(() =>
  import("@/components/dashboard/GeoMap").then((m) => ({ default: m.GeoMap }))
);
const LinkGraph = lazy(() =>
  import("@/components/dashboard/LinkGraph").then((m) => ({ default: m.LinkGraph }))
);

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
  const [kpis, setKpis] = useState<KpiMetric[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);

  useEffect(() => {
    fetchKpiMetrics().then(({ data }) => {
      setKpis(data);
      setKpisLoading(false);
    });
  }, []);

  return (
    <SimulatorProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Toaster theme="dark" position="bottom-right" />
        <Sidebar active={view} onChange={setView} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar officer={officer} kpis={kpis} onNavigate={setView} />
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
                        />
                      );
                    })
                  )}
                </section>

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
                    <AlertsFeed onOpenView={setView} />
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
              officer.canSimulate ? <Simulator /> : <RbacBlock label="Command Simulator" minRole="SI (CLR-4)" />
            )}

            {view === "reports" && <ReportsView />}
            {view === "settings" && <SettingsView />}

            <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
              <div>GARUDA BLR v4.2.1 · secure channel</div>
              <div>build 0a4f9f · region ap-south-blr</div>
            </footer>
          </main>
        </div>
      </div>
    </SimulatorProvider>
  );
}
