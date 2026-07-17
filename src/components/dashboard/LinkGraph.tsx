'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { X, User, MapPin, Car, FileText, AlertTriangle } from "lucide-react";
import { fetchNetwork } from "@/lib/mock-api";
import type { NetworkNode, NetworkEdge, NetworkGraph } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";

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

// ─── Graph data adapter ────────────────────────────────────────────────────────
// react-force-graph-2d uses { nodes, links } with x/y optionally pre-seeded

interface FGNode {
  id:     string;
  label:  string;
  type:   string;
  weight: number;
  risk?:  string;
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
    <div className="absolute right-3 top-3 z-10 w-60 rounded-lg border border-white/10 bg-background/95 p-4 shadow-xl backdrop-blur-sm">
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
          <span className="font-mono">{node.type}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_risk", locale)}</span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={{ background: `${color}22`, color }}
          >
            {(node.risk ?? "LOW").toUpperCase()}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("graph_connections", locale)}</span>
          <span className="font-mono">{connections.length}</span>
        </div>
      </div>

      {connections.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
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
                    {l.relation}
                  </span>
                </div>
              );
            })}
            {connections.length > 4 && (
              <div className="text-[10px] text-muted-foreground">
                +{connections.length - 4} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LinkGraph() {
  const { locale } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<FGNode, FGLink>>(undefined);

  const [graphData, setGraphData] = useState<{ nodes: FGNode[]; links: FGLink[] }>({ nodes: [], links: [] });
  const [rawLinks, setRawLinks]   = useState<FGLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<FGNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 360 });

  // Measure container for responsive canvas size
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
    return () => ro.disconnect();
  }, []);

  // Load network data
  useEffect(() => {
    fetchNetwork().then(({ data }) => {
      const gd = toGraphData(data);
      setGraphData(gd);
      setRawLinks(gd.links);
      setLoading(false);
      // Zoom to fit after physics settles
      setTimeout(() => graphRef.current?.zoomToFit(400, 24), 800);
    });
  }, []);

  // Custom node renderer — circles with glow ring and label
  const paintNode = useCallback((node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const riskColor = RISK_COLOR[node.risk ?? "undefined"];
    const typeColor = TYPE_COLOR[node.type] ?? "#5a8cff";
    const isSelected = selected?.id === node.id;
    const baseR = (NODE_SIZE[node.type] ?? 5) + Math.min(node.weight * 0.3, 4);
    const r = isSelected ? baseR * 1.5 : baseR;
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Glow ring for selected or high-risk
    if (isSelected || node.risk === "high") {
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
      ctx.fillStyle = `${riskColor}30`;
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
    ctx.strokeStyle = isSelected ? "#ffffff88" : `${riskColor}99`;
    ctx.lineWidth = isSelected ? 1.5 / globalScale : 0.8 / globalScale;
    ctx.stroke();

    // Label (visible when zoomed in enough)
    if (globalScale >= 1.2 || isSelected) {
      const label = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;
      const fontSize = Math.max(3, 10 / globalScale);
      ctx.font = `${fontSize}px 'Geist Mono', monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = isSelected ? "#f1f5f9" : "rgba(200,210,230,0.7)";
      ctx.fillText(label, x, y + r + fontSize + 1);
    }
  }, [selected]);

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
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tg.x, tg.y);
    ctx.strokeStyle = isHighlighted ? "rgba(90,140,255,0.7)" : "rgba(120,150,220,0.18)";
    ctx.lineWidth   = (isHighlighted ? 1.5 : 0.6) / globalScale;
    ctx.stroke();
  }, [selected]);

  const handleNodeClick = useCallback((node: FGNode) => {
    setSelected((prev) => (prev?.id === node.id ? null : node));
    // Zoom toward clicked node
    graphRef.current?.centerAt(node.x, node.y, 400);
    graphRef.current?.zoom(2.5, 400);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center rounded-xl border border-white/5 bg-card">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <div className="mt-3 font-mono text-[11px] text-muted-foreground">{t("common_loading", locale)}</div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-white/5 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("graph_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">{t("graph_subtitle", locale)}</div>
        </div>
        <div className="flex items-center gap-3">
          {selected && (
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-primary">
              <AlertTriangle className="h-2.5 w-2.5" />
              {t("graph_type", locale)}: {selected.type}
            </div>
          )}
          <div className="font-mono text-[10px] text-muted-foreground">
            {graphData.nodes.length} nodes · {graphData.links.length} edges
          </div>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{ minHeight: 380 }}
        onClick={(e) => {
          // Click on empty canvas → deselect
          if ((e.target as HTMLElement).tagName === "CANVAS") setSelected(null);
        }}
      >
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          // Physics
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          cooldownTicks={120}
          // Rendering
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => "replace"}
          linkCanvasObject={paintLink}
          linkCanvasObjectMode={() => "replace"}
          // Interaction
          onNodeClick={handleNodeClick}
          nodeLabel={(node) => `${node.label} (${node.type})`}
          enableNodeDrag
          enableZoomInteraction
          enablePanInteraction
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

        {/* Node detail panel */}
        {selected && (
          <NodeDetail
            node={selected}
            links={rawLinks}
            allNodes={graphData.nodes}
            onClose={() => setSelected(null)}
          />
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
          {Object.entries(TYPE_COLOR).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {type}
            </span>
          ))}
        </div>

        <div className="absolute bottom-3 right-3 font-mono text-[10px] text-muted-foreground/50">
          {t("graph_click_hint", locale)}
        </div>
      </div>
    </div>
  );
}
