import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Flame, TrendingUp, ShieldCheck } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar, type ViewKey } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { GeoMap } from "@/components/dashboard/GeoMap";
import { LinkGraph } from "@/components/dashboard/LinkGraph";
import { Simulator } from "@/components/dashboard/Simulator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel BLR — Police Intelligence Dashboard" },
      {
        name: "description",
        content:
          "Real-time geospatial threat analysis, criminal link graphs, and causal command simulation for Bengaluru City Police.",
      },
      { property: "og:title", content: "Sentinel BLR — Police Intelligence" },
      {
        property: "og:description",
        content: "Bengaluru intelligence platform: hotspots, link analysis, and predictive command simulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

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
  const [view, setView] = useState<ViewKey>("dashboard");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Toaster theme="dark" position="bottom-right" />
      <Sidebar active={view} onChange={setView} />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 space-y-4 p-5">
          {view === "dashboard" && (
            <>
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Total Active Cases"
                  value="1,284"
                  delta="4.2%"
                  trend="up"
                  positive={false}
                  icon={Activity}
                  data={[8, 12, 10, 14, 13, 16, 15, 18, 17, 20, 22, 21]}
                  accent="electric"
                />
                <KpiCard
                  label="High-Risk Hotspots"
                  value="27"
                  delta="12.1%"
                  trend="up"
                  positive={false}
                  icon={Flame}
                  data={[10, 12, 11, 14, 16, 15, 18, 17, 22, 24, 26, 27]}
                  accent="danger"
                />
                <KpiCard
                  label="Predicted Escalations"
                  value="9"
                  delta="3.4%"
                  trend="down"
                  positive={false}
                  icon={TrendingUp}
                  data={[14, 13, 15, 12, 14, 11, 10, 11, 9, 10, 9, 9]}
                  accent="electric"
                />
                <KpiCard
                  label="Resource Readiness"
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
                <GeoMap />
                <LinkGraph />
              </section>

              <Simulator />
            </>
          )}

          {view === "geospatial" && (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <GeoMap />
              <LinkGraph />
            </section>
          )}

          {view === "network" && (
            <section className="grid h-[70vh] grid-cols-1 gap-4">
              <LinkGraph />
            </section>
          )}

          {view === "reports" && (
            <Placeholder title="Reports" subtitle="Case briefs, weekly digests, and export tools." />
          )}
          {view === "settings" && (
            <Placeholder title="Settings" subtitle="Preferences, roles, and integrations." />
          )}

          <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
            <div>SENTINEL BLR v4.2.1 · secure channel</div>
            <div>build 0a4f9f · region ap-south-blr</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
