'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { X, User, MapPin, Car, FileText, AlertTriangle, Info, Move } from "lucide-react";
import { fetchNetwork, fetchKingpins, fetchCommunities, fetchConnectionPath, fetchPredictedLinks } from "@/lib/mock-api";
import type { NetworkEdge, NetworkGraph, KingpinRow, CommunityRow, ConnectionPath, PredictedLink } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, type TranslationKey } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─── Theme constants ───────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  high:      "#e0253c",   // --danger
  med:       "#f59e0b",   // --warning
  low:       "#5a8cff",   // --electric
  undefined: "#5a8cff",
};

const TYPE_COLOR: Record<string, string> = {
  Suspect:  "#5a8cff",
  Location: "#22d3ee",
  Vehicle:  "#a78bfa",
  FIR:      "#fb923c",
};

const NODE_SIZE: Record<string, number> = {
  Suspect:  6,
  Location: 5,
  Vehicle:  4,
  FIR:      4,
};

// Distinct hues for community coloring — cycles when community_id exceeds palette length.
const COMMUNITY_PALETTE = [
  "#5a8cff", "#22d3ee", "#a78bfa", "#fb923c", "#34d399",
  "#f472b6", "#facc15", "#38bdf8", "#f87171", "#4ade80",
];
function communityColor(id: number): string {
  return COMMUNITY_PALETTE[id % COMMUNITY_PALETTE.length];
}

// ─── Graph data adapter ────────────────────────────────────────────────────────
// react-force-graph-2d uses { nodes, links } with x/y optionally pre-seeded

interface FGNode {
  id:     string;
  label:  string;
  type:   string;
  weight: number;
  risk?:  string;
  centrality?: { degree: number; betweenness: number; eigenvector: number };
  community_id?: number | null;
  // injected by force engine
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface FGLink {
  source:   string | FGNode;
  target:   string | FGNode;
  relation: string;
}

function toGraphData(graph: NetworkGraph): { nodes: FGNode[]; links: FGLink[] } {
  const nodes: FGNode[] = graph.nodes.map((n) => ({
    id:     n.id,
    label:  n.label,
    type:   n.type,
    weight: n.weight ?? 1,
    risk:   n.risk,
    centrality: n.centrality ?? undefined,
    community_id: n.community_id ?? undefined,
  }));
  const links: FGLink[] = graph.edges.map((e) => ({
    source:   e.source,
    target:   e.target,
    relation: e.relation,
  }));
  return { nodes, links };
}

// ─── Node detail panel ─────────────────────────────────────────────────────────

interface NodeDetailProps {
  node:     FGNode;
  links:    FGLink[];
  allNodes: FGNode[];
  onClose:  () => void;
}

function nodeTypeLabel(type: string, locale: ReturnType<typeof useLanguage>["locale"]) {
  const key = type === "Suspect" ? "graph_suspect" : type === "Location" ? "graph_location" : type === "Vehicle" ? "graph_vehicle" : "graph_fir";
  return t(key, locale);
}

const RISK_KEYS: Record<string, TranslationKey> = {
  high: "common_high",
  med: "common_med",
  low: "common_low",
  undefined: "common_low",
};

const RELATION_KEYS: Record<string, TranslationKey> = {
  "Known Associate": "graph_relation_known_associate",
  Financier: "graph_relation_financier",
  "Operational Link": "graph_relation_operational",
  "Primary Accused": "graph_relation_primary_accused",
  "Named Suspect": "graph_relation_named_suspect",
  "Co-Accused": "graph_relation_co_accused",
  "Frequent Operating Hub": "graph_relation_operating_hub",
  "Residence Proximity": "graph_relation_residence",
  "Registered Owner": "graph_relation_owner",
  "Spotted At": "graph_relation_spotted",
};

const CRIME_KEYS: Record<string, TranslationKey> = {
  "Property Theft": "reports_crime_property_theft",
  "Vehicle Theft": "reports_crime_vehicle_theft",
  "Cyber Fraud": "crime_cyber_fraud",
  Robbery: "crime_robbery",
  "Unlawful Assembly": "reports_crime_unlawful_assembly",
  Assault: "reports_crime_assault",
  Narcotics: "reports_crime_narcotics",
  "Financial Fraud": "crime_financial_fraud",
};

function localizedCrimeType(value: string | null, locale: ReturnType<typeof useLanguage>["locale"]) {
  return value ? t(CRIME_KEYS[value] ?? "crime_operational_intake", locale) : "—";
}

function NetworkHelp() {
  const { locale } = useLanguage();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("graph_help_open", locale)}
          aria-label={t("graph_help_open", locale)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-foreground/10 text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 border-foreground/10 bg-background/95 p-4 backdrop-blur-sm">
        <div className="text-sm font-medium">{t("graph_help_title", locale)}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("graph_help_intro", locale)}</p>
        <div className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
          <p>{t("graph_help_nodes", locale)}</p>
          <p>{t("graph_help_risk", locale)}</p>
          <p>{t("graph_help_links", locale)}</p>
          <div className="flex gap-2 border-t border-foreground/5 pt-2.5">
            <Move className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>{t("graph_help_move", locale)}</p>
          </div>
        </div>
        <div className="mt-3 border-l-2 border-amber-400/70 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
          {t("graph_help_caution", locale)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NodeDetail({ node, links, allNodes, onClose }: NodeDetailProps) {
  const { locale } = useLanguage();
  const byId = Object.fromEntries(allNodes.map((n) => [n.id, n]));
  const color = RISK_COLOR[node.risk ?? "undefined"];

  const connections = links.filter((l) => {
    const s = typeof l.source === "string" ? l.source : l.source.id;
    const tg = typeof l.target === "string" ? l.target : l.target.id;
    return s === node.id || tg === node.id;
  });

  const IconMap: Record<string, typeof User> = {
    Suspect: User, Location: MapPin, Vehicle: Car, FIR: FileText,
  };
  const Icon = IconMap[node.type] ?? User;

  return (
    <div className="absolute right-3 top-3 z-10 w-60 rounded-lg border border-foreground/10 bg-background/95 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: `${color}22`, border: `1px solid ${color}` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <div>
            <div className="text-xs font-medium leading-tight">{node.label}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{node.id}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_type", locale)}</span>
          <span className="font-mono">{nodeTypeLabel(node.type, locale)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_risk", locale)}</span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={{ background: `${color}22`, color }}
          >
            {t(RISK_KEYS[node.risk ?? "undefined"] ?? "common_low", locale)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_connections", locale)}</span>
          <span className="font-mono">{connections.length}</span>
        </div>
      </div>

      {node.centrality && (
        <div className="mt-3 space-y-1.5 border-t border-foreground/5 pt-3">
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("graph_kingpin_score", locale)}
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t("graph_degree", locale)}</span>
            <span className="font-mono">{node.centrality.degree.toFixed(3)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t("graph_betweenness", locale)}</span>
            <span className="font-mono">{node.centrality.betweenness.toFixed(3)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{t("graph_eigenvector", locale)}</span>
            <span className="font-mono">{node.centrality.eigenvector.toFixed(3)}</span>
          </div>
          {node.community_id != null && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t("graph_community", locale)}</span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="h-2 w-2 rounded-full" style={{ background: communityColor(node.community_id) }} />
                #{node.community_id}
              </span>
            </div>
          )}
        </div>
      )}

      {connections.length > 0 && (
        <div className="mt-3 border-t border-foreground/5 pt-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("graph_links", locale)}
          </div>
          <div className="space-y-1">
            {connections.slice(0, 4).map((l, i) => {
              const sid  = typeof l.source === "string" ? l.source : l.source.id;
              const tid  = typeof l.target === "string" ? l.target : l.target.id;
              const otherId = sid === node.id ? tid : sid;
              const other   = byId[otherId];
              return (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="max-w-[100px] truncate text-muted-foreground">
                    {other?.label ?? otherId}
                  </span>
                  <span className="max-w-[80px] truncate text-right font-mono text-[10px] text-muted-foreground/70">
                    {t(RELATION_KEYS[l.relation] ?? "graph_links", locale)}
                  </span>
                </div>
              );
            })}
            {connections.length > 4 && (
              <div className="text-[10px] text-muted-foreground">
                +{connections.length - 4} {t("graph_more", locale)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deep network analysis panels (Phase 3) ────────────────────────────────────

type GraphTab = "inspect" | "kingpins" | "communities" | "connect" | "predicted";

type Locale = ReturnType<typeof useLanguage>["locale"];

function AnalysisPanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute right-3 top-3 z-10 max-h-[calc(100%-1.5rem)] w-72 overflow-y-auto rounded-lg border border-foreground/10 bg-background/95 p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">{title}</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function KingpinsPanel({ kingpins, onSelect, onClose, locale }: {
  kingpins: KingpinRow[]; onSelect: (row: KingpinRow) => void; onClose: () => void; locale: Locale;
}) {
  return (
    <AnalysisPanelShell title={t("graph_tab_kingpins", locale)} onClose={onClose}>
      {kingpins.length === 0 && <p className="text-[11px] text-muted-foreground">{t("common_loading", locale)}</p>}
      {kingpins.map((k) => (
        <button
          key={k.id}
          onClick={() => onSelect(k)}
          className="block w-full rounded-md border border-foreground/5 px-2.5 py-2 text-left transition hover:border-primary/30 hover:bg-primary/[0.05]"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium">
            <span className="truncate">{k.label}</span>
            <span className="font-mono text-primary">{k.kingpin_score.toFixed(3)}</span>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{t("graph_case_count", locale)}: {k.case_count}</span>
            <span>{t("graph_district_spread", locale)}: {k.district_count}</span>
          </div>
        </button>
      ))}
    </AnalysisPanelShell>
  );
}

function CommunitiesPanel({ communities, onClose, locale }: {
  communities: CommunityRow[]; onClose: () => void; locale: Locale;
}) {
  return (
    <AnalysisPanelShell title={t("graph_tab_communities", locale)} onClose={onClose}>
      {communities.length === 0 && <p className="text-[11px] text-muted-foreground">{t("common_loading", locale)}</p>}
      {communities.map((c) => (
        <div key={c.community_id} className="rounded-md border border-foreground/5 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: communityColor(c.community_id) }} />
              #{c.community_id} · {c.size}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{t("graph_cohesion", locale)} {c.cohesion.toFixed(2)}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground">
            {localizedCrimeType(c.dominant_crime_type, locale)} · {t("graph_case_count", locale)} {c.case_count}
          </div>
          {c.likely_synthetic_artifact && (
            <div className="mt-1 text-[10px] leading-snug text-amber-400/80">{t("graph_synthetic_flag", locale)}</div>
          )}
        </div>
      ))}
    </AnalysisPanelShell>
  );
}

function ConnectPanel({ source, target, onSourceChange, onTargetChange, onSubmit, loading, result, onClose, locale }: {
  source: string; target: string;
  onSourceChange: (v: string) => void; onTargetChange: (v: string) => void;
  onSubmit: () => void; loading: boolean; result: ConnectionPath | null;
  onClose: () => void; locale: Locale;
}) {
  return (
    <AnalysisPanelShell title={t("graph_tab_connect", locale)} onClose={onClose}>
      <input
        value={source}
        onChange={(e) => onSourceChange(e.target.value)}
        placeholder={t("graph_source_suspect", locale)}
        className="w-full rounded-md border border-foreground/10 bg-background/50 px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-primary/50"
      />
      <input
        value={target}
        onChange={(e) => onTargetChange(e.target.value)}
        placeholder={t("graph_target_suspect", locale)}
        className="w-full rounded-md border border-foreground/10 bg-background/50 px-2.5 py-1.5 font-mono text-[11px] outline-none focus:border-primary/50"
      />
      <button
        onClick={onSubmit}
        disabled={loading || !source.trim() || !target.trim()}
        className="w-full rounded-md bg-primary/15 px-3 py-1.5 text-[11px] font-medium text-primary transition hover:bg-primary/25 disabled:opacity-50"
      >
        {loading ? t("common_loading", locale) : t("graph_find_connection_action", locale)}
      </button>
      {result && !result.connected && (
        <p className="text-[11px] text-muted-foreground">{t("graph_no_path", locale)}</p>
      )}
      {result?.connected && (
        <div className="space-y-2 border-t border-foreground/5 pt-2">
          {result.hops.map((h, i) => (
            <div key={i} className="text-[11px]">
              <div className="flex items-center justify-between gap-1 font-medium">
                <span className="truncate">{h.from.label}</span>
                <span className="shrink-0 text-muted-foreground">→</span>
                <span className="truncate text-right">{h.to.label}</span>
              </div>
              {h.shared_cases[0] && (
                <div className="font-mono text-[10px] text-muted-foreground">
                  {t("graph_shared_cases", locale)}: {h.shared_case_count} · {h.shared_cases[0].station} ({h.shared_cases[0].date})
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AnalysisPanelShell>
  );
}

function PredictedPanel({ links, onClose, locale }: { links: PredictedLink[]; onClose: () => void; locale: Locale }) {
  return (
    <AnalysisPanelShell title={t("graph_tab_predicted", locale)} onClose={onClose}>
      {links.length === 0 && <p className="text-[11px] text-muted-foreground">{t("common_loading", locale)}</p>}
      {links.map((l, i) => (
        <div key={i} className="rounded-md border border-foreground/5 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2 font-medium">
            <span className="truncate">{l.source.label}</span>
            <span className="shrink-0 rounded-full bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cyan-300">
              {t("graph_predicted_lead_pill", locale)}
            </span>
          </div>
          <div className="truncate text-muted-foreground">{l.target.label}</div>
          <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{l.advisory}</div>
        </div>
      ))}
    </AnalysisPanelShell>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface LinkGraphProps {
  /** Smaller, read-only preview used on the Dashboard overview */
  compact?: boolean;
}

export function LinkGraph({ compact = false }: LinkGraphProps) {
  const { locale } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<FGNode, FGLink>>(undefined);

  const [graphData, setGraphData] = useState<{ nodes: FGNode[]; links: FGLink[] }>({ nodes: [], links: [] });
  const [rawLinks, setRawLinks]   = useState<FGLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<FGNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: compact ? 180 : 360 });

  const [activeTab, setActiveTab] = useState<GraphTab>("inspect");
  const [colorByCommunity, setColorByCommunity] = useState(false);
  const [kingpins, setKingpins] = useState<KingpinRow[]>([]);
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [predictedLinks, setPredictedLinks] = useState<PredictedLink[]>([]);
  const [connectSource, setConnectSource] = useState("");
  const [connectTarget, setConnectTarget] = useState("");
  const [connectResult, setConnectResult] = useState<ConnectionPath | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  // Measure container for responsive canvas size. The container div below is
  // now always mounted (loading only swaps its *contents*, not the node
  // itself) — previously an early `if (loading) return ...` meant the
  // ResizeObserver's target didn't exist until data arrived, and the
  // observer attached afterward could still race the parent layout,
  // leaving the canvas stuck at the 400x360 fallback size.
  useEffect(() => {
    const observe = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (width > 0 && height > 0) setDimensions({ width, height });
      }
    };
    observe();
    const ro = new ResizeObserver(observe);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", observe);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", observe);
    };
  }, []);

  // Load network data + (full view only) deep network analytics
  useEffect(() => {
    fetchNetwork().then(({ data }) => {
      const gd = toGraphData(data);
      setGraphData(gd);
      setRawLinks(gd.links);
      setLoading(false);
    });
    if (!compact) {
      fetchKingpins({ limit: 10 }).then(({ data }) => setKingpins(data)).catch(() => {});
      fetchCommunities({ limit: 10, maxSize: 30 }).then(({ data }) => setCommunities(data)).catch(() => {});
      fetchPredictedLinks(15).then(({ data }) => setPredictedLinks(data)).catch(() => {});
    }
  }, [compact]);

  // Fit after both the force layout and the responsive canvas dimensions settle.
  // A single fit at the initial 400px width leaves the graph anchored left on wide screens.
  useEffect(() => {
    if (!graphData.nodes.length || dimensions.width <= 0) return;
    const timer = window.setTimeout(() => graphRef.current?.zoomToFit(400, 64), 900);
    return () => window.clearTimeout(timer);
  }, [graphData.nodes.length, dimensions.height, dimensions.width]);

  const handleFindConnection = useCallback(async () => {
    if (!connectSource.trim() || !connectTarget.trim() || connectLoading) return;
    setConnectLoading(true);
    try {
      const { data } = await fetchConnectionPath(connectSource.trim(), connectTarget.trim());
      setConnectResult(data);
    } catch {
      setConnectResult({ connected: false, path: [], hops: [], path_length: null });
    } finally {
      setConnectLoading(false);
    }
  }, [connectSource, connectTarget, connectLoading]);

  // Nodes/edges on the current "find connection" result, highlighted on canvas
  const pathNodeIds = useMemo(
    () => new Set(connectResult?.connected ? connectResult.path.map((p) => p.id) : []),
    [connectResult]
  );
  const pathEdgeKeys = useMemo(
    () => new Set(connectResult?.connected ? connectResult.hops.map((h) => [h.from.id, h.to.id].sort().join("|")) : []),
    [connectResult]
  );

  const selectKingpin = useCallback((k: KingpinRow) => {
    const centrality = { degree: k.degree_centrality, betweenness: k.betweenness_centrality, eigenvector: k.eigenvector_centrality };
    const existing = graphData.nodes.find((n) => n.id === k.id);
    if (existing) {
      setSelected({ ...existing, centrality, community_id: k.community_id });
      if (existing.x !== undefined && existing.y !== undefined) {
        graphRef.current?.centerAt(existing.x, existing.y, 400);
        graphRef.current?.zoom(2.5, 400);
      }
    } else {
      // Kingpin isn't in the current bounded /api/network view — still show
      // its analytics, just without a canvas position to center on.
      setSelected({ id: k.id, label: k.label, type: "Suspect", weight: 1, centrality, community_id: k.community_id });
    }
    setActiveTab("inspect");
  }, [graphData.nodes]);

  // Custom node renderer — circles with glow ring and label
  const paintNode = useCallback((node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const riskColor = RISK_COLOR[node.risk ?? "undefined"];
    const commColor = colorByCommunity && node.community_id != null ? communityColor(node.community_id) : null;
    const typeColor = commColor ?? (TYPE_COLOR[node.type] ?? "#5a8cff");
    const isSelected = selected?.id === node.id;
    const onPath = pathNodeIds.has(node.id);
    const baseR = (NODE_SIZE[node.type] ?? 5) + Math.min(node.weight * 0.3, 4);
    const r = isSelected ? baseR * 1.5 : baseR;
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Glow ring for selected, high-risk, or on the highlighted connection path
    if (isSelected || node.risk === "high" || onPath) {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
      ctx.fillStyle = onPath && !isSelected ? "#22d3ee30" : `${riskColor}30`;
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = isSelected ? riskColor : `${typeColor}cc`;
    ctx.fill();

    // Border ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = onPath ? "#22d3ee" : (isSelected ? "#ffffff88" : `${riskColor}99`);
    ctx.lineWidth = (isSelected || onPath) ? 1.5 / globalScale : 0.8 / globalScale;
    ctx.stroke();

    // Label (visible when zoomed in enough)
    if (globalScale >= 1.2 || isSelected || onPath) {
      const label = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;
      const fontSize = Math.max(3, 10 / globalScale);
      ctx.font = `${fontSize}px 'Geist Mono', monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = isSelected ? "#f1f5f9" : "rgba(200,210,230,0.7)";
      ctx.fillText(label, x, y + r + fontSize + 1);
    }
  }, [selected, colorByCommunity, pathNodeIds]);

  // Custom link renderer
  const paintLink = useCallback((
    link: FGLink,
    ctx: CanvasRenderingContext2D,
    globalScale: number
  ) => {
    const s = link.source as FGNode;
    const tg = link.target as FGNode;
    if (!s.x || !s.y || !tg.x || !tg.y) return;

    const isHighlighted = selected && (s.id === selected.id || tg.id === selected.id);
    const onPath = pathEdgeKeys.has([s.id, tg.id].sort().join("|"));
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tg.x, tg.y);
    ctx.strokeStyle = onPath ? "rgba(34,211,238,0.9)" : (isHighlighted ? "rgba(90,140,255,0.7)" : "rgba(120,150,220,0.18)");
    ctx.lineWidth   = (onPath ? 2 : (isHighlighted ? 1.5 : 0.6)) / globalScale;
    ctx.stroke();
  }, [selected, pathEdgeKeys]);

  const handleNodeClick = useCallback((node: FGNode) => {
    if (compact) return;
    setSelected((prev) => (prev?.id === node.id ? null : node));
    setActiveTab("inspect");
    // Zoom toward clicked node
    graphRef.current?.centerAt(node.x, node.y, 400);
    graphRef.current?.zoom(2.5, 400);
  }, [compact]);

  const keepNodeInViewport = useCallback((node: FGNode) => {
    const graph = graphRef.current;
    if (!graph || node.x === undefined || node.y === undefined) return;

    const padding = 48;
    const topLeft = graph.screen2GraphCoords(padding, padding);
    const bottomRight = graph.screen2GraphCoords(dimensions.width - padding, dimensions.height - padding);

    node.x = Math.min(bottomRight.x, Math.max(topLeft.x, node.x));
    node.y = Math.min(bottomRight.y, Math.max(topLeft.y, node.y));
  }, [dimensions.height, dimensions.width]);

  const handleNodeDragEnd = useCallback((node: FGNode) => {
    keepNodeInViewport(node);
    node.fx = node.x;
    node.fy = node.y;
  }, [keepNodeInViewport]);

  const TABS: [GraphTab, TranslationKey][] = [
    ["inspect", "graph_tab_inspect"],
    ["kingpins", "graph_tab_kingpins"],
    ["communities", "graph_tab_communities"],
    ["connect", "graph_tab_connect"],
    ["predicted", "graph_tab_predicted"],
  ];

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-foreground/5 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("graph_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">{t("graph_subtitle", locale)}</div>
        </div>
        <div className="flex items-center gap-3">
          {selected && (
            <div className="flex items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-2 py-0.5 font-mono text-[10px] text-primary">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t("graph_type", locale)}: {nodeTypeLabel(selected.type, locale)}
            </div>
          )}
          <div className="font-mono text-[10px] text-muted-foreground">
            {graphData.nodes.length} {t("graph_nodes", locale)} · {graphData.links.length} {t("graph_edges", locale)}
          </div>
          {!compact && <NetworkHelp />}
        </div>
      </div>

      {/* Deep network analysis toolbar */}
      {!compact && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/5 bg-foreground/[0.01] px-5 py-2">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map(([tab, key]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                  activeTab === tab ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(key, locale)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={colorByCommunity}
              onChange={(e) => setColorByCommunity(e.target.checked)}
              className="h-3 w-3"
            />
            {t("graph_color_by_community", locale)}
          </label>
        </div>
      )}

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{ minHeight: compact ? 160 : 380 }}
        onClick={(e) => {
          // Click on empty canvas → deselect
          if (!compact && (e.target as HTMLElement).tagName === "CANVAS") setSelected(null);
        }}
      >
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <div className="mt-3 font-mono text-[11px] text-muted-foreground">{t("common_loading", locale)}</div>
          </div>
        ) : (
          <>
            <ForceGraph2D
              ref={graphRef}
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              backgroundColor="transparent"
              // Physics
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.35}
              cooldownTicks={compact ? 60 : 120}
              // Rendering
              nodeCanvasObject={paintNode}
              nodeCanvasObjectMode={() => "replace"}
              linkCanvasObject={paintLink}
              linkCanvasObjectMode={() => "replace"}
              // Interaction
              onNodeClick={handleNodeClick}
              onNodeDrag={keepNodeInViewport}
              onNodeDragEnd={handleNodeDragEnd}
              nodeLabel={(node) => `${node.label} (${nodeTypeLabel(node.type, locale)})`}
              enableNodeDrag={!compact}
              enableZoomInteraction={!compact}
              enablePanInteraction={!compact}
              // Performance
              nodeRelSize={1}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={(link) => {
                const s = link.source as FGNode;
                const tg = link.target as FGNode;
                return (selected && (s.id === selected?.id || tg.id === selected?.id)) ? 1.5 : 0;
              }}
              linkDirectionalParticleColor={() => "rgba(90,140,255,0.8)"}
              linkDirectionalParticleSpeed={0.005}
            />

            {/* Analysis panels (mutually exclusive with the tab bar above) */}
            {!compact && activeTab === "inspect" && selected && (
              <NodeDetail
                node={selected}
                links={rawLinks}
                allNodes={graphData.nodes}
                onClose={() => setSelected(null)}
              />
            )}
            {!compact && activeTab === "kingpins" && (
              <KingpinsPanel kingpins={kingpins} onSelect={selectKingpin} onClose={() => setActiveTab("inspect")} locale={locale} />
            )}
            {!compact && activeTab === "communities" && (
              <CommunitiesPanel communities={communities} onClose={() => setActiveTab("inspect")} locale={locale} />
            )}
            {!compact && activeTab === "connect" && (
              <ConnectPanel
                source={connectSource}
                target={connectTarget}
                onSourceChange={setConnectSource}
                onTargetChange={setConnectTarget}
                onSubmit={handleFindConnection}
                loading={connectLoading}
                result={connectResult}
                onClose={() => setActiveTab("inspect")}
                locale={locale}
              />
            )}
            {!compact && activeTab === "predicted" && (
              <PredictedPanel links={predictedLinks} onClose={() => setActiveTab("inspect")} locale={locale} />
            )}

            {/* Legend */}
            {!compact && (
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
                {Object.entries(TYPE_COLOR).map(([type, color]) => (
                  <span key={type} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                    {nodeTypeLabel(type, locale)}
                  </span>
                ))}
              </div>
            )}

            {!compact && (
              <div className="absolute bottom-3 right-3 font-mono text-[10px] text-muted-foreground/50">
                {t("graph_click_hint", locale)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
