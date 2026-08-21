'use client';

import { useEffect, useMemo, useState } from "react";
import { Map, Marker, Popup, useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { HexagonLayer } from "@deck.gl/aggregation-layers";
import { Layers, Maximize2, Radio, Satellite, X, AlertTriangle, Car, TrendingUp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { fetchHotspots, fetchPatrols, fetchForecast, fetchForecastBacktest } from "@/lib/mock-api";
import type { Hotspot, PatrolUnit, ForecastPoint, ForecastBacktest } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimulator } from "@/contexts/SimulatorContext";
import { useScope } from "@/contexts/ScopeContext";
import { t, districtName, type TranslationKey } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

function HotspotPopupContent({
  hotspot,
  nearestPatrol,
  onClose,
}: {
  hotspot: Hotspot;
  nearestPatrol: { unit: PatrolUnit; km: number } | null;
  onClose: () => void;
}) {
  const { locale } = useLanguage();
  const color = RISK_COLOR[hotspot.risk];
  const etaMin = nearestPatrol ? Math.max(1, Math.round((nearestPatrol.km / 30) * 60)) : null;
  return (
    <div className="min-w-[260px] rounded-lg border border-foreground/10 bg-background/95 p-4 backdrop-blur-sm">
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
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10">
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

      <div className="mt-3 border-t border-foreground/5 pt-2">
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
  const { districtId, activeDistrict } = useScope();
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [patrols, setPatrols] = useState<PatrolUnit[]>(FALLBACK_PATROLS);
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [predictedMode, setPredictedMode] = useState(false);
  const [backtest, setBacktest] = useState<ForecastBacktest | null>(null);

  useEffect(() => {
    fetchHotspots({ districtId }).then(({ data }) => setHotspots(data));
    if (!compact) {
      fetchForecast({ districtId }).then(({ data }) => setForecast(data));
      fetchPatrols().then(({ data }) => setPatrols(data));
      const interval = setInterval(() => {
        fetchPatrols().then(({ data }) => setPatrols(data));
      }, 20_000);
      return () => clearInterval(interval);
    }
  }, [compact, districtId]);

  // Backtest is fetched lazily on first switch to Predicted mode — it's a
  // validation aid for that view, not needed for the default historical map.
  useEffect(() => {
    if (!compact && predictedMode && !backtest) {
      fetchForecastBacktest(6).then(({ data }) => setBacktest(data)).catch(() => {});
    }
  }, [compact, predictedMode, backtest]);

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
    <div className={`relative col-span-2 overflow-hidden rounded-xl border border-foreground/5 bg-card ${compact ? "flex flex-1 flex-col" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("map_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">
            {activeDistrict
              ? `${districtName(activeDistrict, locale)} — ${t("map_live_suffix", locale)}`
              : t("map_subtitle_statewide", locale)}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {!compact && (
            <span className="hidden rounded-full border border-foreground/10 px-2 py-0.5 font-mono text-[9px] lg:inline">
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
          compact ? "min-h-[220px] flex-1" : expanded ? "h-[640px]" : "h-[460px]"
        }`}
      >
        <Map
          key={districtId ?? "statewide"}
          initialViewState={{
            longitude: activeDistrict ? activeDistrict.centroid.lng : BENGALURU_CENTER[0],
            latitude: activeDistrict ? activeDistrict.centroid.lat : BENGALURU_CENTER[1],
            zoom: activeDistrict ? (compact ? 9.5 : 10.6) : (compact ? 6.6 : 7.2),
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
                  // Radius is in metres. The compact map sits ~3-4 zoom levels
                  // further out than the full map, where 220m is sub-pixel.
                  radius: compact ? (activeDistrict ? 1200 : 9000) : 220,
                  elevationScale: compact ? 20 : 6,
                  extruded: !compact,
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
              <HotspotPopupContent hotspot={selected} nearestPatrol={nearestPatrol} onClose={() => setSelected(null)} />
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
            <div className="mb-2 flex items-center gap-1.5">
              <div className="flex flex-1 items-center gap-1 rounded-md bg-foreground/5 p-0.5 text-[10px]">
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
              {predictedMode && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      title={t("map_model_validation_open", locale)}
                      aria-label={t("map_model_validation_open", locale)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-foreground/10 text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    >
                      <ShieldCheck className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 border-foreground/10 bg-background/95 p-4 backdrop-blur-sm">
                    <div className="text-sm font-medium">{t("map_model_validation_title", locale)}</div>
                    {!backtest ? (
                      <div className="mt-2 text-[11px] text-muted-foreground">{t("common_loading", locale)}</div>
                    ) : (
                      <>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                          {backtest.methodology} ({backtest.test_months} {t("map_model_test_months", locale)})
                        </p>
                        <div className="mt-3 space-y-1.5">
                          {backtest.models.map((m) => (
                            <div
                              key={m.model}
                              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[10px] ${
                                m.model === backtest.deployed_model ? "bg-primary/[0.08] text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 font-mono">
                                {m.model}
                                {m.model === backtest.deployed_model && (
                                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase text-primary">
                                    {t("map_model_deployed", locale)}
                                  </span>
                                )}
                              </span>
                              <span className="font-mono">
                                {t("map_model_mae", locale)} {m.mae} · {t("map_model_pai", locale)} {m.pai}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 border-l-2 border-amber-400/70 bg-amber-400/5 px-3 py-2 text-[10px] leading-relaxed text-amber-100/80">
                          <div className="mb-0.5 font-medium uppercase tracking-wide">{t("map_model_feedback_loop_title", locale)}</div>
                          {backtest.feedback_loop_caution}
                        </div>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <div className="space-y-1.5">
              {layers.map((row) => (
                <button
                  key={row.id}
                  onClick={() => toggle(row.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  <div className="flex items-center gap-2">
                    <row.icon className="h-3 w-3" />
                    {t(row.labelKey, locale)}
                  </div>
                  <div className={`h-3 w-6 rounded-full p-0.5 transition-colors ${row.on ? "bg-primary/40" : "bg-foreground/10"}`}>
                    <div className={`h-2 w-2 rounded-full transition-transform ${row.on ? "translate-x-3 bg-primary" : "translate-x-0 bg-foreground/40"}`} />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 border-t border-foreground/5 pt-2 font-mono text-[10px] text-muted-foreground">
              LAT 12.9716° · LON 77.5946°
            </div>
          </div>
        )}

        {!selected && !compact && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 font-mono text-[10px] text-foreground/30">
            {t("map_click_hint", locale)}
          </div>
        )}
      </div>
    </div>
  );
}

