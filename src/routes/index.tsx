import { useState, lazy, Suspense } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Network, MapPin, TrendingDown, ShieldCheck } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Simulator } from "@/components/dashboard/Simulator";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { getSession, isAuthenticated, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";

// Lazy-load heavy canvas components — keeps login/dashboard first paint instant
const GeoMap = lazy(() =>
  import("@/components/dashboard/GeoMap").then((m) => ({ default: m.GeoMap }))
);
const LinkGraph = lazy(() =>
  import("@/components/dashboard/LinkGraph").then((m) => ({ default: m.LinkGraph }))
);

function MapPlaceholder() {
  return (
    <div className="col-span-2 flex h-[460px] items-center justify-center rounded-xl border border-white/5 bg-card">
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="bottom-right" />
      <Sidebar active={view} onChange={setView} />
      <div className="flex flex-1 flex-col">
        <TopBar officer={officer} />
        <main className="flex-1 space-y-4 p-5">
          {view === "dashboard" && (
            <>
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label={t("kpi_criminal_nodes", locale)}
                  value="1,284"
                  delta="4.2%"
                  trend="up"
                  positive={false}
                  icon={Network}
                  data={[8, 12, 10, 14, 13, 16, 15, 18, 17, 20, 22, 21]}
                  accent="electric"
                />
                <KpiCard
                  label={t("kpi_hotspot_alerts", locale)}
                  value="27"
                  delta="12.1%"
                  trend="up"
                  positive={false}
                  icon={MapPin}
                  data={[10, 12, 11, 14, 16, 15, 18, 17, 22, 24, 26, 27]}
                  accent="danger"
                />
                <KpiCard
                  label={t("kpi_risk_volatility", locale)}
                  value="0.74"
                  delta="3.4%"
                  trend="down"
                  positive={true}
                  icon={TrendingDown}
                  data={[90, 88, 85, 82, 84, 81, 80, 79, 77, 76, 75, 74]}
                  accent="electric"
                />
                <KpiCard
                  label={t("kpi_readiness", locale)}
                  value="92%"
                  delta="1.8%"
                  trend="up"
                  positive
                  icon={ShieldCheck}
                  data={[80, 82, 85, 84, 87, 89, 88, 90, 91, 90, 92, 92]}
                  accent="electric"
                />
              </section>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Suspense fallback={<MapPlaceholder />}>
                  <GeoMap />
                </Suspense>
                {officer.canViewNetwork ? (
                  <Suspense fallback={<GraphPlaceholder />}>
                    <LinkGraph />
                  </Suspense>
                ) : (
                  <RbacBlock label="Criminal Link Analysis" minRole="ASI (CLR-3)" />
                )}
              </section>

              {officer.canSimulate ? (
                <Simulator />
              ) : (
                <RbacBlock label="Command Simulator" minRole="SI (CLR-4)" />
              )}
            </>
          )}

          {view === "geospatial" && (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Suspense fallback={<MapPlaceholder />}>
                <GeoMap />
              </Suspense>
              {officer.canViewNetwork ? (
                <Suspense fallback={<GraphPlaceholder />}>
                  <LinkGraph />
                </Suspense>
              ) : (
                <RbacBlock label="Criminal Link Analysis" minRole="ASI (CLR-3)" />
              )}
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

          {view === "reports" && <ReportsView />}
          {view === "settings" && <SettingsView />}

          <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
            <div>SENTINEL BLR v4.2.1 · secure channel</div>
            <div>build 0a4f9f · region ap-south-blr</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
