import { createFileRoute } from "@tanstack/react-router";
import { Activity, Flame, TrendingUp, ShieldCheck } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { GeoMap } from "@/components/dashboard/GeoMap";
import { LinkGraph } from "@/components/dashboard/LinkGraph";
import { Simulator } from "@/components/dashboard/Simulator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel — Police Intelligence Dashboard" },
      {
        name: "description",
        content:
          "Real-time geospatial threat analysis, criminal link graphs, and causal command simulation for modern law enforcement operations.",
      },
      { property: "og:title", content: "Sentinel — Police Intelligence Dashboard" },
      {
        property: "og:description",
        content:
          "Enterprise-grade intelligence platform: geospatial hotspots, link analysis, and predictive command simulation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 space-y-4 p-5">
          {/* KPIs */}
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
              positive={true}
              icon={ShieldCheck}
              data={[80, 82, 85, 84, 87, 89, 88, 90, 91, 90, 92, 92]}
              accent="electric"
            />
          </section>

          {/* Hero row */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GeoMap />
            <LinkGraph />
          </section>

          {/* Simulator */}
          <Simulator />

          <footer className="flex items-center justify-between pt-2 font-mono text-[10px] text-muted-foreground">
            <div>SENTINEL v4.2.1 · secure channel</div>
            <div>build 0a4f9f · region us-east-atl</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
