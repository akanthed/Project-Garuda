'use client';

import { useEffect, useRef, useState } from "react";
import { Map, Marker, Popup } from "react-map-gl/maplibre";
import { Layers, Maximize2, Radio, Satellite, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchHotspots } from "@/lib/mock-api";
import type { Hotspot } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import "maplibre-gl/dist/maplibre-gl.css";

// ─── Constants ────────────────────────────────────────────────────────────────

/** CARTO Dark Matter — free, no token needed */
const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const BENGALURU_CENTER: [number, number] = [77.5946, 12.9716];

const RISK_COLOR: Record<string, string> = {
  high: "var(--danger)",
  med: "var(--warning)",
  low: "var(--electric)",
};

const RISK_SIZE: Record<string, number> = {
  high: 28,
  med: 22,
  low: 16,
};

const INITIAL_LAYERS = [
  { id: "threat", label: "Threat Heatmap", icon: Radio, on: true },
  { id: "patrol", label: "Patrol Units", icon: Satellite, on: true },
  { id: "infra", label: "Infrastructure", icon: Layers, on: false },
];

// Simulated patrol positions (real coords near Bengaluru)
const PATROL_UNITS = [
  { id: "P-1", lat: 12.965, lng: 77.601 },
  { id: "P-2", lat: 12.982, lng: 77.615 },
  { id: "P-3", lat: 12.952, lng: 77.622 },
];

// ─── Hotspot marker ───────────────────────────────────────────────────────────

function HotspotMarker({
  hotspot,
  selected,
  onClick,
}: {
  hotspot: Hotspot;
  selected: boolean;
  onClick: () => void;
}) {
  const color = RISK_COLOR[hotspot.risk];
  const size = RISK_SIZE[hotspot.risk];
  return (
    <div
      onClick={onClick}
      style={{ width: size, height: size, cursor: "pointer" }}
      className="relative flex items-center justify-center"
    >
      {/* Pulse ring */}
      <div
        className="absolute inset-0 animate-ping rounded-full opacity-30"
        style={{ background: color }}
      />
      {/* Solid dot */}
      <div
        className="relative rounded-full transition-transform hover:scale-125"
        style={{
          width: size * 0.55,
          height: size * 0.55,
          background: color,
          boxShadow: selected ? `0 0 16px ${color}` : `0 0 6px ${color}80`,
          border: selected ? `1.5px solid white` : "none",
        }}
      />
    </div>
  );
}

// ─── Hotspot popup ────────────────────────────────────────────────────────────

function HotspotPopupContent({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  const { locale } = useLanguage();
  const color = RISK_COLOR[hotspot.risk];
  return (
    <div className="min-w-[240px] rounded-lg border border-white/10 bg-background/95 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <div>
            <div className="text-xs font-medium">{hotspot.label}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{hotspot.id}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        <div key="crime" className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">{t("map_crime_type", locale)}</span>
          <span className="max-w-[150px] text-right font-mono text-[10px]">{hotspot.crime_type}</span>
        </div>
        <div key="intensity" className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("map_intensity", locale)}</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${hotspot.intensity * 100}%`, background: color }} />
            </div>
            <span className="font-mono text-[10px]">{Math.round(hotspot.intensity * 100)}%</span>
          </div>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_risk", locale)}</span>
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase"
            style={{ background: `${color}22`, color }}
          >
            {hotspot.risk}
          </span>
        </div>
      </div>
      <div className="mt-3 border-t border-white/5 pt-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("map_causal", locale)}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">{hotspot.causal_driver}</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function GeoMap() {
  const { locale } = useLanguage();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Hotspot | null>(null);

  useEffect(() => {
    fetchHotspots().then(({ data }) => setHotspots(data));
  }, []);

  const toggle = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = !l.on;
        toast(`${l.label} ${next ? "enabled" : "disabled"}`, { description: "Map overlay updated." });
        return { ...l, on: next };
      })
    );
  };

  const threatOn = layers.find((l) => l.id === "threat")?.on;
  const patrolOn = layers.find((l) => l.id === "patrol")?.on;

  return (
    <div className="relative col-span-2 overflow-hidden rounded-xl border border-white/5 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("map_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">{t("map_subtitle", locale)}</div>
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

      {/* MapLibre canvas */}
      <div className={`relative transition-[height] duration-300 ${expanded ? "h-[640px]" : "h-[460px]"}`}>
        <Map
          initialViewState={{
            longitude: BENGALURU_CENTER[0],
            latitude: BENGALURU_CENTER[1],
            zoom: 11.5,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle={MAP_STYLE}
          attributionControl={false}
        >
          {/* Hotspot markers */}
          {threatOn &&
            hotspots.map((h) => (
              <Marker
                key={h.id}
                longitude={h.lng}
                latitude={h.lat}
                anchor="center"
              >
                <HotspotMarker
                  hotspot={h}
                  selected={selected?.id === h.id}
                  onClick={() => setSelected(selected?.id === h.id ? null : h)}
                />
              </Marker>
            ))}

          {/* Patrol unit markers */}
          {patrolOn &&
            PATROL_UNITS.map((p) => (
              <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
                <div
                  title={p.id}
                  className="h-3 w-3 rounded-sm border border-primary bg-primary/60 shadow-[0_0_8px_var(--primary)]"
                />
              </Marker>
            ))}

          {/* Selected hotspot popup */}
          {selected && (
            <Popup
              longitude={selected.lng}
              latitude={selected.lat}
              anchor="bottom"
              offset={16}
              closeButton={false}
              closeOnClick={false}
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              <HotspotPopupContent hotspot={selected} onClose={() => setSelected(null)} />
            </Popup>
          )}
        </Map>

        {/* Layer control panel */}
        <div className="glass-panel absolute right-4 top-4 z-10 w-52 rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Layers className="h-3.5 w-3.5 text-primary" />
              {t("map_layers", locale)}
            </div>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted-foreground transition hover:text-foreground"
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
                <div className={`h-3 w-6 rounded-full p-0.5 transition-colors ${row.on ? "bg-primary/40" : "bg-white/10"}`}>
                  <div className={`h-2 w-2 rounded-full transition-transform ${row.on ? "translate-x-3 bg-primary" : "translate-x-0 bg-white/40"}`} />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-white/5 pt-2 font-mono text-[10px] text-muted-foreground">
            LAT 12.9716° · LON 77.5946°
          </div>
        </div>

        {!selected && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 font-mono text-[10px] text-white/30">
            {t("map_click_hint", locale)}
          </div>
        )}
      </div>
    </div>
  );
}

