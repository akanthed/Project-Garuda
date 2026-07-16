import { Layers, Maximize2, Radio, Satellite } from "lucide-react";

const hotspots = [
  { x: 22, y: 34, r: 34, level: "high", label: "Sector 7-A" },
  { x: 58, y: 48, r: 26, level: "med", label: "Downtown Rail" },
  { x: 74, y: 28, r: 20, level: "high", label: "Harbor E" },
  { x: 40, y: 68, r: 22, level: "low", label: "West Corridor" },
  { x: 82, y: 72, r: 18, level: "med", label: "Node 12" },
];

const levelColor = (l: string) =>
  l === "high" ? "var(--danger)" : l === "med" ? "var(--warning)" : "var(--electric)";

export function GeoMap() {
  return (
    <div className="relative col-span-2 overflow-hidden rounded-xl border border-white/5 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Geospatial Intelligence
          </div>
          <div className="mt-0.5 text-sm font-medium">Metro Region — Live Threat Surface</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </span>
          <span className="font-mono">03:42:17 UTC</span>
        </div>
      </div>

      {/* Map body */}
      <div className="relative h-[460px] grid-noise">
        {/* radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_50%,rgba(58,120,255,0.18),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_30%,rgba(220,40,60,0.18),transparent_55%)]" />

        {/* faux land masses */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M2,60 C12,50 18,55 26,48 C34,41 40,44 48,38 C60,30 66,36 78,30 C88,25 94,32 100,28 L100,100 L0,100 Z"
            fill="rgba(255,255,255,0.02)"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.15"
          />
          <path
            d="M0,30 C10,26 20,32 32,28 C44,24 52,30 64,24 C76,18 86,22 100,18"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.12"
            strokeDasharray="0.6 0.8"
          />
        </svg>

        {/* hotspots */}
        {hotspots.map((h, i) => (
          <div key={i} className="absolute" style={{ left: `${h.x}%`, top: `${h.y}%` }}>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-md"
              style={{ width: h.r * 2, height: h.r * 2, background: levelColor(h.level) }}
            />
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: h.r,
                height: h.r,
                background: `radial-gradient(circle, ${levelColor(h.level)}55 0%, transparent 70%)`,
                border: `1px solid ${levelColor(h.level)}`,
              }}
            />
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ width: 4, height: 4, background: levelColor(h.level) }}
            />
            <div
              className="absolute translate-x-2 -translate-y-3 whitespace-nowrap font-mono text-[10px] uppercase tracking-wider"
              style={{ color: levelColor(h.level) }}
            >
              {h.label}
            </div>
          </div>
        ))}

        {/* floating glass control */}
        <div className="glass-panel absolute right-4 top-4 w-56 rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Map Layers
            </div>
            <Maximize2 className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Threat Heatmap", icon: Radio, on: true, tone: "danger" as const },
              { label: "Patrol Units", icon: Satellite, on: true, tone: "electric" as const },
              { label: "Infrastructure", icon: Layers, on: false, tone: "default" as const },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <row.icon className="h-3 w-3" />
                  {row.label}
                </div>
                <div
                  className={`h-3 w-6 rounded-full p-0.5 transition ${row.on ? "bg-primary/40" : "bg-white/10"}`}
                >
                  <div
                    className={`h-2 w-2 rounded-full transition ${
                      row.on ? "translate-x-3 bg-primary" : "translate-x-0 bg-white/40"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-white/5 pt-2 font-mono text-[10px] text-muted-foreground">
            LAT 40.7128° · LON −74.006°
          </div>
        </div>

        {/* corner reticles */}
        <div className="pointer-events-none absolute inset-4">
          {[
            "top-0 left-0 border-t border-l",
            "top-0 right-0 border-t border-r",
            "bottom-0 left-0 border-b border-l",
            "bottom-0 right-0 border-b border-r",
          ].map((cls) => (
            <span key={cls} className={`absolute h-3 w-3 border-white/20 ${cls}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
