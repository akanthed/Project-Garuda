'use client';

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ShieldAlert, Info, ClipboardCheck } from "lucide-react";
import { fetchAnomalies } from "@/lib/mock-api";
import type { StationAnomaly } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AlertsFeedProps {
  /** Jump the dashboard to a full view (geospatial/network) when a row is clicked */
  onOpenView?: (view: "geospatial" | "network") => void;
  onOpenBrief?: (anomaly: StationAnomaly) => void;
}

export function AlertsFeed({ onOpenView, onOpenBrief }: AlertsFeedProps) {
  const { locale } = useLanguage();
  const [anomalies, setAnomalies] = useState<StationAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnomalies().then(({ data }) => {
      setAnomalies(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-[var(--danger)]" />
            {t("alerts_title", locale)}
          </div>
          <div className="mt-0.5 text-sm font-medium">{t("alerts_subtitle", locale)}</div>
        </div>
        <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          z-score
        </span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/[0.02]" />
          ))
        ) : anomalies.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8 text-center text-xs text-muted-foreground">
            {t("alerts_empty", locale)}
          </div>
        ) : (
          anomalies.slice(0, 5).map((a) => (
            <div
              key={a.station_id}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition hover:border-[var(--danger)]/30 hover:bg-white/[0.04]"
            >
              <button
                onClick={() => onOpenBrief?.(a)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      a.severity === "critical"
                        ? "bg-[var(--danger)]/15 text-[var(--danger)]"
                        : "bg-orange-500/15 text-orange-400"
                    )}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium leading-tight">{a.station_name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {a.current_count} vs {a.mean_count} {t("alerts_vs_avg", locale)}
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-medium",
                  a.severity === "critical" ? "text-[var(--danger)]" : "text-orange-400"
                )}>
                  {t(a.severity === "critical" ? "alerts_critical_spike" : "alerts_unusual_spike", locale)}
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              </button>
              {onOpenBrief && (
                <button
                  type="button"
                  onClick={() => onOpenBrief(a)}
                  title={t("action_brief_open", locale)}
                  aria-label={t("action_brief_open", locale)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </button>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t("alerts_anomaly_help", locale)}
                    aria-label={t("alerts_anomaly_help", locale)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 border-white/10 bg-background/95 p-4 text-xs backdrop-blur-sm">
                  <div className="font-medium text-foreground">{t("alerts_anomaly_help", locale)}</div>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{t("alerts_anomaly_explainer", locale)}</p>
                  <p className="mt-2 border-t border-white/5 pt-2 text-muted-foreground">{t("alerts_anomaly_action", locale)}</p>
                  <div className="mt-3 font-mono text-[10px] text-muted-foreground">
                    {t("alerts_diagnostic", locale)}: z={a.z_score}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          ))
        )}
      </div>

      {onOpenView && (
        <button
          onClick={() => onOpenView("network")}
          className="border-t border-white/5 px-5 py-2.5 text-left text-[11px] text-muted-foreground transition hover:text-primary"
        >
          {t("overview_open_network", locale)}
        </button>
      )}
    </div>
  );
}
