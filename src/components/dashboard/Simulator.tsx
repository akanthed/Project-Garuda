import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Play, Cpu, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSimulatorVariables, runSimulation } from "@/lib/mock-api";
import type { SimulatorVariable } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";

export function Simulator() {
  const { locale } = useLanguage();
  const [variables, setVariables] = useState<SimulatorVariable[]>([]);
  const [vals, setVals] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [lastImpact, setLastImpact] = useState<number | null>(null);

  useEffect(() => {
    fetchSimulatorVariables().then(({ data }) => {
      setVariables(data);
      setVals(Object.fromEntries(data.map((v) => [v.id, v.defaultValue])));
    });
  }, []);

  // Live preview — weighted sum
  const previewImpact = variables.length
    ? Math.round(
        variables.reduce((sum, v) => sum + (vals[v.id] ?? v.defaultValue) * v.weight, 0) / 1.2
      )
    : 0;

  const handleRun = async () => {
    if (running || !variables.length) return;
    setRunning(true);
    toast("Running causal simulation…", { description: "Computing counterfactual across BLR sectors." });
    try {
      const { data } = await runSimulation(vals);
      setLastImpact(data.impactPercent);
      toast.success(`Simulation complete · −${data.impactPercent}% incidents`, {
        description: `Model: ${data.modelVersion} · ${data.windowDays}d rolling window`,
      });
    } finally {
      setRunning(false);
    }
  };

  if (!variables.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-white/5 bg-card">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("sim_title", locale)}
          </div>
          <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            causal-v2.4
          </span>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {lastImpact !== null ? `Last run · −${lastImpact}%` : "Baseline · 30d rolling window"}
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr_1fr_260px]">
        {variables.map((v) => (
          <div key={v.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {v.label}
              </div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                {(vals[v.id] ?? v.defaultValue).toString().padStart(2, "0")}
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              value={[vals[v.id] ?? v.defaultValue]}
              onValueChange={([n]) => setVals((prev) => ({ ...prev, [v.id]: n }))}
              max={100}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-white/8 [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_rgba(90,140,255,0.12)]"
            />
            <div className="font-mono text-[10px] text-muted-foreground">{v.hint}</div>
          </div>
        ))}

        <div className="flex flex-col items-stretch justify-between rounded-lg border border-white/5 bg-background/40 p-4">
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
    </div>
  );
}

