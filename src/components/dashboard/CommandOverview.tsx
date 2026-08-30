import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Car, CheckCircle2, Clock3, MapPin, ShieldCheck, type LucideIcon } from "lucide-react";
import { fetchCommandChangeSummary } from "@/lib/mock-api";
import type { CommandChangeMetric, CommandChangeSummary } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScope } from "@/contexts/ScopeContext";
import { crimeTypeName, districtName, t, type TranslationKey } from "@/lib/i18n";
import type { ViewKey } from "./Sidebar";

const METRIC_LABELS: Record<CommandChangeMetric["id"], TranslationKey> = {
  cases: "command_cases",
  serious_cases: "command_serious_cases",
  arrest_rate: "command_arrest_rate",
  station_spikes: "command_station_spikes",
};

const STATUS_LABELS: Record<CommandChangeMetric["status"], TranslationKey> = {
  improving: "command_improving",
  worsening: "command_needs_attention",
  stable: "command_stable",
};

function signed(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

export function CommandOverview({ onNavigate }: { onNavigate: (view: ViewKey) => void }) {
  const { locale } = useLanguage();
  const { districtId, districts, setDistrictId } = useScope();
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [summary, setSummary] = useState<CommandChangeSummary | null>(null);

  useEffect(() => {
    let active = true;
    setSummary(null);
    fetchCommandChangeSummary(windowDays, { districtId }).then(({ data }) => {
      if (active) setSummary(data);
    });
    return () => {
      active = false;
    };
  }, [districtId, windowDays]);

  if (!summary) {
    return <div className="h-[420px] animate-pulse rounded-lg border border-foreground/5 bg-card" />;
  }

  const maxChange = Math.max(1, ...summary.area_changes.map((area) => Math.abs(area.percent_change ?? 0)));
  const crimeTypes = summary.crime_changes[0]?.cells.map((cell) => ({ id: cell.crime_id, name: cell.crime_type })) ?? [];
  const queue = summary.decision_queue;
  const allocation = summary.resource_allocation;
  const areaName = (id: number, fallback: string) => {
    if (summary.area_level !== "district") return fallback;
    return districtName(districts.find((district) => district.district_id === id) ?? { name: fallback }, locale);
  };
  const scopeName = districtId == null
    ? t("topbar_scope_statewide", locale)
    : areaName(districtId, summary.scope);
  const queueRows: [TranslationKey, number, LucideIcon, string][] = [
    ["command_needs_assignment", queue.needs_assignment, AlertTriangle, "text-rose-500"],
    ["command_overdue", queue.overdue, Clock3, "text-amber-500"],
    ["command_assigned", queue.assigned, ShieldCheck, "text-primary"],
    ["command_in_progress", queue.in_progress, ArrowRight, "text-cyan-500"],
    ["command_completed", queue.completed, CheckCircle2, "text-emerald-500"],
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/10 pb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{t("command_eyebrow", locale)}</p>
          <h1 className="mt-1 text-xl font-semibold">{t(districtId == null ? "command_title" : "command_title_district", locale)}: {scopeName}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.current_period.start} – {summary.current_period.end} {t("command_vs", locale)} {summary.previous_period.start} – {summary.previous_period.end}
          </p>
        </div>
        <div className="flex rounded-md border border-border bg-muted/40 p-1" aria-label={t("command_period", locale)}>
          {([7, 30, 90] as const).map((days) => (
            <button key={days} onClick={() => setWindowDays(days)} className={`h-8 min-w-14 rounded px-2 text-xs ${windowDays === days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {days}{t("command_days_short", locale)}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.metrics.map((metric) => {
          const isGood = metric.status === "improving";
          const isStable = metric.status === "stable";
          const ChangeIcon = metric.absolute_change > 0 ? ArrowUp : metric.absolute_change < 0 ? ArrowDown : ArrowRight;
          return (
            <article key={metric.id} className="rounded-lg border border-foreground/10 bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t(METRIC_LABELS[metric.id], locale)}</p>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${isStable ? "bg-muted text-muted-foreground" : isGood ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>{t(STATUS_LABELS[metric.status], locale)}</span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <span className="font-mono text-3xl tabular-nums">{metric.unit === "percent" ? `${metric.current}%` : metric.current.toLocaleString()}</span>
                <span className={`flex items-center gap-1 font-mono text-xs ${isStable ? "text-muted-foreground" : isGood ? "text-emerald-500" : "text-rose-500"}`}><ChangeIcon className="h-3 w-3" />{metric.unit === "percent" ? signed(metric.absolute_change, " pt") : signed(metric.absolute_change)}</span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{t("command_previous", locale)}: {metric.unit === "percent" ? `${metric.previous}%` : metric.previous.toLocaleString()}{metric.percent_change != null && ` · ${signed(metric.percent_change, "%")}`}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold">{t("command_where_changed", locale)}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{t("command_ranked_help", locale)}</p></div>
            <button onClick={() => onNavigate("geospatial")} className="flex items-center gap-1 text-xs text-primary"><MapPin className="h-3 w-3" />{t("command_open_map", locale)}</button>
          </div>
          <div className="space-y-2">
            {summary.area_changes.slice(0, 9).map((area) => {
              const percent = area.percent_change ?? 0;
              const width = `${Math.max(2, Math.abs(percent) / maxChange * 48)}%`;
              return (
                <button key={area.id} onClick={() => summary.area_level === "district" && setDistrictId(area.id)} className="grid w-full grid-cols-[minmax(110px,180px)_minmax(0,1fr)_64px] items-center gap-3 text-left text-xs">
                  <span className="truncate">{areaName(area.id, area.name)}</span>
                  <span className="relative h-5">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    <span className={`absolute top-1 h-3 rounded-sm ${percent >= 0 ? "left-1/2 bg-rose-500/70" : "right-1/2 bg-emerald-500/70"}`} style={{ width }} />
                  </span>
                  <span className={`text-right font-mono ${percent > 0 ? "text-rose-500" : percent < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>{signed(percent, "%")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold">{t("command_decisions", locale)}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("command_decisions_help", locale)}</p>
          <div className="mt-3 divide-y divide-border border-y border-border">
            {queueRows.map(([key, value, Icon, color]) => (
              <div key={key} className="flex items-center justify-between py-2.5 text-xs"><span className="flex items-center gap-2"><Icon className={`h-3.5 w-3.5 ${color}`} />{t(key, locale)}</span><span className="font-mono text-sm">{String(value)}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t("command_allocation", locale)}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("command_allocation_help", locale)}</p>
          </div>
          <div className="flex gap-3 font-mono text-[10px] text-muted-foreground">
            <span>{allocation.available_units} {t("command_units_available", locale)}</span>
            <span>{allocation.allocated_units} {t("command_units_allocated", locale)}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {allocation.recommendations.map((recommendation) => (
            <article key={recommendation.station_id} className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-card p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Car className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{recommendation.station_name}</span>
                  <span className="shrink-0 font-mono text-sm text-primary">{recommendation.recommended_units} {t("command_units", locale)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>{recommendation.predicted_count} {t("command_forecast_count", locale)}</span>
                  {recommendation.is_anomaly && <span className="text-rose-500">{t("command_anomaly_flag", locale)} · z={recommendation.z_score}</span>}
                  {(recommendation.forecast_source === "local_fallback" || recommendation.anomaly_source === "local_fallback") && <span>{t("command_model_fallback", locale)}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {crimeTypes.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">{t("command_what_changed", locale)}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("command_matrix_help", locale)}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <thead><tr><th className="border-b border-border p-2 text-left font-medium text-muted-foreground">{t("command_area", locale)}</th>{crimeTypes.map((crime) => <th key={crime.id} className="border-b border-border p-2 text-right font-medium text-muted-foreground">{crimeTypeName(crime.name, locale)}</th>)}</tr></thead>
              <tbody>{summary.crime_changes.map((row) => <tr key={row.area_id}><th className="border-b border-border/60 p-2 text-left font-medium">{areaName(row.area_id, row.area_name)}</th>{crimeTypes.map((crime) => { const cell = row.cells.find((item) => item.crime_id === crime.id); const percent = cell?.percent_change; const tone = percent == null || Math.abs(percent) < 5 ? "bg-muted/40" : percent > 0 ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"; return <td key={crime.id} className="border-b border-border/60 p-1 text-right"><span className={`block rounded-sm px-2 py-1.5 font-mono ${tone}`}>{percent == null ? "–" : signed(percent, "%")}</span></td>; })}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      <p className="border-t border-border pt-3 text-[10px] text-muted-foreground">{t("command_as_of", locale)} {summary.as_of} · {t("command_synthetic", locale)}</p>
    </div>
  );
}