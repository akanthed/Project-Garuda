import { useState } from "react";
import { Layers, Maximize2, Radio, Satellite } from "lucide-react";
import { toast } from "sonner";

const hotspots = [
  { x: 32, y: 42, r: 34, level: "high", label: "KR Market" },
  { x: 58, y: 48, r: 26, level: "med", label: "MG Road" },
  { x: 74, y: 30, r: 22, level: "high", label: "Whitefield" },
  { x: 44, y: 68, r: 22, level: "med", label: "Koramangala" },
  { x: 78, y: 74, r: 20, level: "low", label: "Electronic City" },
  { x: 22, y: 74, r: 16, level: "low", label: "Yeshwantpur" },
];

const levelColor = (l: string) =>
  l === "high" ? "var(--danger)" : l === "med" ? "var(--warning)" : "var(--electric)";

const initialLayers = [
  { id: "threat", label: "Threat Heatmap", icon: Radio, on: true },
  { id: "patrol", label: "Patrol Units", icon: Satellite, on: true },
  { id: "infra", label: "Infrastructure", icon: Layers, on: false },
];

export function GeoMap() {
  const [layers, setLayers] = useState(initialLayers);
  const [expanded, setExpanded] = useState(false);

  const toggle = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = !l.on;
        toast(`${l.label} ${next ? "enabled" : "disabled"}`, {
          description: "Map overlay updated.",
        });
        return { ...l, on: next };
      })
    );
  };

  const threatOn = layers.find((l) => l.id === "threat")?.on;
  const patrolOn = layers.find((l) => l.id === "patrol")?.on;
  const infraOn = layers.find((l) => l.id === "infra")?.on;

  return (
    <div className="relative col-span-2 overflow-hidden rounded-xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Geospatial Intelligence
          </div>
          <div className="mt-0.5 text-sm font-medium">Bengaluru City — Live Threat Surface</div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </span>
          <span className="font-mono">IST {new Date().toLocaleTimeString("en-IN", { hour12: false })}</span>
        </div>
      </div>

      <div className={`relative grid-noise transition-[height] ${expanded ? "h-[640px]" : "h-[460px]"}`}>
        {threatOn && (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_50%,rgba(58,120,255,0.18),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_30%,rgba(220,40,60,0.18),transparent_55%)]" />
          </>
        )}

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d="M2,60 C12,50 18,55 26,48 C34,41 40,44 48,38 C60,30 66,36 78,30 C88,25 94,32 100,28 L100,100 L0,100 Z"
            fill="rgba(255,255,255,0.02)"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.15"
          />
          {infraOn && (
            <g stroke="rgba(120,180,255,0.35)" strokeWidth="0.15" fill="none">
              <path d="M10,50 L90,50" strokeDasharray="1 1" />
              <path d="M50,10 L50,90" strokeDasharray="1 1" />
              <circle cx="50" cy="50" r="18" strokeDasharray="0.8 1.2" />
            </g>
          )}
        </svg>

        {threatOn &&
          hotspots.map((h, i) => (
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

        {patrolOn && (
          <>
            {[
              { x: 40, y: 50 },
              { x: 65, y: 40 },
              { x: 55, y: 62 },
            ].map((p, i) => (
              <div
                key={i}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-primary bg-primary/40"
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
          </>
        )}

        <div className="glass-panel absolute right-4 top-4 w-56 rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Map Layers
            </div>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted-foreground hover:text-foreground"
              title={expanded ? "Collapse" : "Expand"}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {layers.map((row) => (
              <button
                key={row.id}
                onClick={() => toggle(row.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
              >
                <div className="flex items-center gap-2">
                  <row.icon className="h-3 w-3" />
                  {row.label}
                </div>
                <div className={`h-3 w-6 rounded-full p-0.5 transition ${row.on ? "bg-primary/40" : "bg-white/10"}`}>
                  <div
                    className={`h-2 w-2 rounded-full transition ${
                      row.on ? "translate-x-3 bg-primary" : "translate-x-0 bg-white/40"
                    }`}
                  />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-white/5 pt-2 font-mono text-[10px] text-muted-foreground">
            LAT 12.9716° · LON 77.5946°
          </div>
        </div>

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
