import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Play, Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSimulatorVariables, runSimulation } from "@/lib/mock-api";
import type { SimulatorVariable } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScope } from "@/contexts/ScopeContext";
import { useSimulator } from "@/contexts/SimulatorContext";
import { t, districtName, type TranslationKey } from "@/lib/i18n";

const VARIABLE_TRANSLATIONS: Record<string, { labelKey: TranslationKey; hintKey: TranslationKey }> = {
  "patrol-density": { labelKey: "sim_patrol_density", hintKey: "sim_patrol_hint" },
  "infra-health": { labelKey: "sim_infra_health", hintKey: "sim_infra_hint" },
  "rapid-response": { labelKey: "sim_response_units", hintKey: "sim_response_hint" },
};

interface SimulatorProps {
  onComplete?: (impact: number) => void;
}

export function Simulator({ onComplete }: SimulatorProps) {
  const { locale } = useLanguage();
  const { activeDistrict } = useScope();
  const { values: vals, setValue, setDefaults, setLastImpactPercent } = useSimulator();
  const [variables, setVariables] = useState<SimulatorVariable[]>([]);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    impact: number;
    modelVersion: string;
    confidenceRange?: [number, number];
    assumptions?: string[];
  } | null>(null);

  useEffect(() => {
    fetchSimulatorVariables().then(({ data }) => {
      setVariables(data);
      setDefaults(Object.fromEntries(data.map((v) => [v.id, v.defaultValue])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live preview — weighted sum (also drives GeoMap's hex layer via SimulatorContext)
  const previewImpact = variables.length
    ? Math.round(
        variables.reduce((sum, v) => sum + (vals[v.id] ?? v.defaultValue) * v.weight, 0) / 1.2
      )
    : 0;

  // Levers are evaluated against whatever scope the top bar has selected.
  const scopeLabel = activeDistrict
    ? districtName(activeDistrict, locale)
    : t("topbar_scope_statewide", locale);

  const handleRun = async () => {
    if (running || !variables.length) return;
    setRunning(true);
    toast(t("sim_running_toast", locale), { description: `${t("sim_comparing", locale)} · ${scopeLabel}` });
    try {
      const { data } = await runSimulation(vals);
      setLastResult({
        impact: data.impactPercent,
        modelVersion: data.modelVersion,
        confidenceRange: data.confidenceRange,
        assumptions: data.assumptions,
      });
      onComplete?.(data.impactPercent);
      setLastImpactPercent(data.impactPercent);
      toast.success(`${t("sim_complete", locale)} · −${data.impactPercent}% ${t("sim_incidents", locale)}`, {
        description: `${t("sim_model", locale)}: ${data.modelVersion} · ${data.windowDays}${locale === "kn" ? " ದಿನ" : "d"} ${t("sim_rolling_window", locale).replace("30d ", "")}`,
      });
    } finally {
      setRunning(false);
    }
  };

  if (!variables.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-foreground/5 bg-card">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-foreground/5 bg-card">
      <div className="flex items-center justify-between border-b border-foreground/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("sim_title", locale)}
          </div>
          <span className="ml-2 rounded-full border border-foreground/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            scenario-model-v1
          </span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {lastResult ? `${t("sim_last_run", locale)} · −${lastResult.impact}%` : t("sim_baseline", locale)}
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr_1fr_260px]">
        {variables.map((v) => {
          const translation = VARIABLE_TRANSLATIONS[v.id];
          return (
          <div key={v.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {translation ? t(translation.labelKey, locale) : v.label}
              </div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                {(vals[v.id] ?? v.defaultValue).toString().padStart(2, "0")}
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              value={[vals[v.id] ?? v.defaultValue]}
              onValueChange={([n]) => setValue(v.id, n)}
              max={100}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-foreground/8 [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_rgba(90,140,255,0.12)]"
            />
            <div className="font-mono text-[10px] text-muted-foreground">
              {translation
                ? `${t(translation.hintKey, locale)}${v.id === "patrol-density" ? ` · ${scopeLabel}` : ""}`
                : v.hint}
            </div>
          </div>
          );
        })}

        <div className="flex flex-col items-stretch justify-between rounded-lg border border-foreground/5 bg-background/40 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("sim_impact_label", locale)}
            </div>
            <div className="mt-1 font-mono text-3xl font-medium tabular-nums text-foreground">
              −{previewImpact}%
              <span className="ml-1 text-xs text-emerald-400">{t("sim_incidents", locale)}</span>
            </div>
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="group mt-4 flex items-center justify-center gap-2 rounded-md bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/25 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {running ? t("sim_running", locale) : t("sim_run", locale)}
          </button>
        </div>
      </div>
      {lastResult && (
        <div className="border-t border-foreground/5 px-6 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
            <span>{t("sim_estimate_range", locale)}: −{lastResult.confidenceRange?.[0] ?? Math.max(0, lastResult.impact - 12)}% {locale === "kn" ? "ರಿಂದ" : "to"} −{lastResult.confidenceRange?.[1] ?? Math.min(100, lastResult.impact + 12)}%</span>
            <span>{lastResult.modelVersion}</span>
            <span>{lastResult.assumptions?.[0] ?? t("sim_assumption", locale)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

