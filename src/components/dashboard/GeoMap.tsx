'use client';

import { useEffect, useMemo, useState } from "react";
import { Map, Marker, Popup, useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { Layers, Maximize2, Radio, Satellite, X, AlertTriangle, Car, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { fetchHotspots, fetchPatrols, fetchForecast } from "@/lib/mock-api";
import type { Hotspot, PatrolUnit, ForecastPoint } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimulator } from "@/contexts/SimulatorContext";
import { useDisplayPreferences } from "@/contexts/DisplayPreferencesContext";
import { t, type TranslationKey } from "@/lib/i18n";
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

const HOTSPOT_NAME_KEYS: Record<string, TranslationKey> = {
  "KR Market": "map_place_kr_market",
  "MG Road": "map_place_mg_road",
  Whitefield: "map_place_whitefield",
  Koramangala: "map_place_koramangala",
  "Electronic City": "map_place_electronic_city",
  Yeshwantpur: "map_place_yeshwantpur",
};

function localizedHotspotName(hotspot: Hotspot, showKannadaPlaceNames: boolean) {
  const key = HOTSPOT_NAME_KEYS[hotspot.label];
  return showKannadaPlaceNames && key ? t(key, "kn") : hotspot.label;
}

const INITIAL_LAYERS = [
  { id: "density", labelKey: "map_density_layer", icon: Radio, on: true },
  { id: "threat", labelKey: "map_pins_layer", icon: AlertTriangle, on: true },
  { id: "patrol", labelKey: "map_patrols_layer", icon: Satellite, on: true },
  { id: "infra", labelKey: "map_infrastructure_layer", icon: Layers, on: false },
] as { id: string; labelKey: TranslationKey; icon: typeof Radio; on: boolean }[];

// Fallback patrol positions used only until the real /api/patrols responds
const FALLBACK_PATROLS: PatrolUnit[] = [
  { id: "P-1", lat: 12.965, lng: 77.601, status: "patrolling" },
  { id: "P-2", lat: 12.982, lng: 77.615, status: "patrolling" },
  { id: "P-3", lat: 12.952, lng: 77.622, status: "patrolling" },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── deck.gl overlay bridge (works with maplibre via react-map-gl's useControl) ─

function DeckGLOverlay(props: ConstructorParameters<typeof MapboxOverlay>[0]) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

// ─── Hotspot marker ───────────────────────────────────────────────────────────

function HotspotMarker({
  hotspot,
  selected,
  animated,
  onClick,
}: {
  hotspot: Hotspot;
  selected: boolean;
  animated: boolean;
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
        className={`absolute inset-0 rounded-full opacity-30 ${animated ? "animate-ping" : ""}`}
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

function HotspotPopupContent({
  hotspot,
  nearestPatrol,
  showKannadaPlaceNames,
  onClose,
}: {
  hotspot: Hotspot;
  nearestPatrol: { unit: PatrolUnit; km: number } | null;
  showKannadaPlaceNames: boolean;
  onClose: () => void;
}) {
  const { locale } = useLanguage();
  const color = RISK_COLOR[hotspot.risk];
  const etaMin = nearestPatrol ? Math.max(1, Math.round((nearestPatrol.km / 30) * 60)) : null;
  return (
    <div className="min-w-[260px] rounded-lg border border-white/10 bg-background/95 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <div>
            <div className="text-xs font-medium">{localizedHotspotName(hotspot, showKannadaPlaceNames)}</div>
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
        {hotspot.station_name && (
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{t("map_jurisdiction", locale)}</span>
            <span className="font-mono text-[10px]">{hotspot.station_name}</span>
          </div>
        )}
      </div>

      {nearestPatrol && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Car className="h-3.5 w-3.5 text-primary" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("map_nearest_patrol", locale)}
              </div>
              <div className="font-mono text-[11px] font-medium">{nearestPatrol.unit.id}</div>
            </div>
          </div>
          <div className="text-right font-mono text-[10px] text-muted-foreground">
            {nearestPatrol.km.toFixed(1)} km · {t("map_eta", locale)} {etaMin}m
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-white/5 pt-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("map_causal", locale)}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">{hotspot.causal_driver}</p>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface GeoMapProps {
  /** Smaller, non-interactive preview used on the Dashboard overview */
  compact?: boolean;
}

export function GeoMap({ compact = false }: GeoMapProps) {
  const { locale } = useLanguage();
  const { riskScaleFor } = useSimulator();
  const { animations, autoRefresh, kannadaPlaceNames } = useDisplayPreferences();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [patrols, setPatrols] = useState<PatrolUnit[]>(FALLBACK_PATROLS);
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [predictedMode, setPredictedMode] = useState(false);

  useEffect(() => {
    fetchHotspots().then(({ data }) => setHotspots(data));
    if (!compact) {
      fetchForecast().then(({ data }) => setForecast(data));
      fetchPatrols().then(({ data }) => setPatrols(data));
      if (autoRefresh) {
        const interval = setInterval(() => {
          fetchPatrols().then(({ data }) => setPatrols(data));
        }, 20_000);
        return () => clearInterval(interval);
      }
    }
  }, [autoRefresh, compact]);

  const toggle = (id: string) => {
    const layer = layers.find((item) => item.id === id);
    if (!layer) return;
    const next = !layer.on;
    setLayers((previous) => previous.map((item) => item.id === id ? { ...item, on: next } : item));
    toast(`${t(layer.labelKey, locale)} ${t(next ? "map_enabled" : "map_disabled", locale)}`, { description: t("map_overlay_updated", locale) });
  };

  const densityOn = layers.find((l) => l.id === "density")?.on;
  const threatOn = layers.find((l) => l.id === "threat")?.on;
  const patrolOn = layers.find((l) => l.id === "patrol")?.on;

  const visibleHotspots = compact ? hotspots.slice(0, 60) : hotspots;

  // Points fed into the HexagonLayer — weighted by the live What-If Simulator
  // sliders (via SimulatorContext) so moving Patrol Density / Infra Health
  // visibly grows/shrinks the 3D towers, per the "what-if" pillar.
  const hexPoints = useMemo(() => {
    if (predictedMode && !compact) {
      return forecast.map((f) => ({
        lng: f.lng,
        lat: f.lat,
        weight: f.predicted_intensity,
      }));
    }
    return visibleHotspots.map((h) => ({
      lng: h.lng,
      lat: h.lat,
      weight: h.intensity * riskScaleFor(h.patrol_density, h.infra_health),
    }));
  }, [visibleHotspots, forecast, predictedMode, compact, riskScaleFor]);

  const nearestPatrol = useMemo(() => {
    if (!selected || patrols.length === 0) return null;
    let best: { unit: PatrolUnit; km: number } | null = null;
    for (const p of patrols) {
      const km = haversineKm(selected.lat, selected.lng, p.lat, p.lng);
      if (!best || km < best.km) best = { unit: p, km };
    }
    return best;
  }, [selected, patrols]);

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
          {!compact && (
            <span className="hidden rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] lg:inline">
              {t("map_data_source", locale)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {t("topbar_live", locale)}
          </span>
          <span className="font-mono">IST {new Date().toLocaleTimeString("en-IN", { hour12: false })}</span>
        </div>
      </div>

      {/* MapLibre canvas */}
      <div
        className={`relative transition-[height] duration-300 ${
          compact ? "h-[220px]" : expanded ? "h-[640px]" : "h-[460px]"
        }`}
      >
        <Map
          initialViewState={{
            longitude: BENGALURU_CENTER[0],
            latitude: BENGALURU_CENTER[1],
            zoom: compact ? 10.3 : 11.5,
            pitch: compact ? 0 : 45,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle={MAP_STYLE}
          attributionControl={false}
          interactive={!compact}
        >
          {densityOn && hexPoints.length > 0 && (
            <DeckGLOverlay
              layers={[
                new HexagonLayer({
                  id: "hex-density",
                  data: hexPoints,
                  getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat],
                  getElevationWeight: (d: { weight: number }) => d.weight,
                  getColorWeight: (d: { weight: number }) => d.weight,
                  elevationAggregation: "MEAN",
                  colorAggregation: "MEAN",
                  radius: 220,
                  elevationScale: compact ? 20 : 6,
                  extruded: false,
                  pickable: false,
                  opacity: predictedMode ? 0.55 : 0.75,
                  colorRange: predictedMode
                    ? [
                        [30, 60, 120], [40, 90, 170], [60, 120, 220],
                        [120, 160, 240], [180, 200, 250], [220, 230, 255],
                      ]
                    : [
                        [26, 152, 80], [102, 189, 99], [255, 215, 0],
                        [253, 141, 60], [227, 26, 28], [165, 0, 38],
                      ],
                }),
              ]}
            />
          )}

          {/* Hotspot markers (click-to-inspect) */}
          {threatOn && !compact &&
            visibleHotspots.map((h) => (
              <Marker
                key={h.id}
                longitude={h.lng}
                latitude={h.lat}
                anchor="center"
              >
                <HotspotMarker
                  hotspot={h}
                  selected={selected?.id === h.id}
                  animated={animations}
                  onClick={() => setSelected(selected?.id === h.id ? null : h)}
                />
              </Marker>
            ))}

          {/* Patrol unit markers */}
          {patrolOn && !compact &&
            patrols.map((p) => (
              <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
                <div
                  title={`${p.id} · ${p.status}`}
                  className={`h-3 w-3 rounded-sm border shadow-[0_0_8px_var(--primary)] ${
                    p.status === "responding" ? "border-[var(--danger)] bg-[var(--danger)]/60" : "border-primary bg-primary/60"
                  }`}
                />
              </Marker>
            ))}

          {/* Selected hotspot popup */}
          {selected && !compact && (
            <Popup
              longitude={selected.lng}
              latitude={selected.lat}
              anchor="bottom"
              offset={16}
              closeButton={false}
              closeOnClick={false}
              style={{ background: "transparent", border: "none", padding: 0 }}
            >
              <HotspotPopupContent hotspot={selected} nearestPatrol={nearestPatrol} showKannadaPlaceNames={kannadaPlaceNames} onClose={() => setSelected(null)} />
            </Popup>
          )}
        </Map>

        {/* Layer control panel */}
        {!compact && (
          <div className="glass-panel absolute right-4 top-4 z-10 w-56 rounded-lg p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Layers className="h-3.5 w-3.5 text-primary" />
                {t("map_layers", locale)}
              </div>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-muted-foreground transition hover:text-foreground"
                title={t(expanded ? "map_collapse" : "map_expand", locale)}
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            </div>

            {/* Historical / Predicted toggle */}
            <div className="mb-2 flex items-center gap-1 rounded-md bg-white/5 p-0.5 text-[10px]">
              <button
                onClick={() => setPredictedMode(false)}
                className={`flex-1 rounded px-2 py-1 transition ${!predictedMode ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              >
                {t("map_layer_historical", locale)}
              </button>
              <button
                onClick={() => setPredictedMode(true)}
                className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 transition ${predictedMode ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              >
                <TrendingUp className="h-3 w-3" />
                {t("map_layer_predicted", locale)}
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
                    {t(row.labelKey, locale)}
                  </div>
                  <div className={`h-3 w-6 rounded-full p-0.5 transition-colors ${row.on ? "bg-primary/40" : "bg-white/10"}`}>
                    <div className={`h-2 w-2 rounded-full transition-transform ${row.on ? "translate-x-3 bg-primary" : "translate-x-0 bg-white/40"}`} />
                  </div>
                </button>
              ))}
            </div>
            {predictedMode && forecast[0] && (
              <div className="mt-3 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-muted-foreground">
                <div className="font-medium text-foreground">{t("map_forecast_details", locale)}</div>
                <div>{t("map_forecast_model", locale)}: {forecast[0].model} · {t("map_forecast_window", locale)}: {forecast[0].horizon_days}{locale === "kn" ? " ದಿನ" : "d"}</div>
                <div className="mt-1 text-amber-300/80">{t("map_forecast_notice", locale)}</div>
              </div>
            )}
            <div className="mt-3 border-t border-white/5 pt-2 font-mono text-[10px] text-muted-foreground">
              LAT 12.9716° · LON 77.5946°
            </div>
          </div>
        )}

        {!selected && !compact && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 font-mono text-[10px] text-white/30">
            {t("map_click_hint", locale)}
          </div>
        )}
      </div>
    </div>
  );
}

