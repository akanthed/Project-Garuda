import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  positive?: boolean; // whether up is good
  icon: LucideIcon;
  data: number[];
  accent?: "electric" | "danger" | "default";
  compact?: boolean;
}

function Sparkline({ data, accent = "electric" }: { data: number[]; accent?: KpiCardProps["accent"] }) {
  const w = 120;
  const h = 34;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const stroke =
    accent === "danger" ? "var(--danger)" : accent === "default" ? "var(--muted-foreground)" : "var(--electric)";
  const fillId = `spark-${accent}`;
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        fill={`url(#${fillId})`}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.25" />
    </svg>
  );
}

export function KpiCard({ label, value, delta, trend, positive = true, icon: Icon, data, accent = "electric", compact = false }: KpiCardProps) {
  const good = (trend === "up" && positive) || (trend === "down" && !positive);
  const TrendIcon = trend === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("group relative overflow-hidden rounded-xl border border-white/5 bg-card transition-colors hover:border-white/10", compact ? "p-3.5" : "p-5")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          {label}
        </div>
        <div
          className={cn(
            "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
            good ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {delta}
        </div>
      </div>
      <div className={cn("flex items-end justify-between", compact ? "mt-2" : "mt-4")}>
        <div className={cn("font-mono font-medium tracking-tight tabular-nums text-foreground", compact ? "text-2xl" : "text-3xl")}>
          {value}
        </div>
        <Sparkline data={data} accent={accent} />
      </div>
    </div>
  );
}
