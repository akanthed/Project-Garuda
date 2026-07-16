import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Play, Cpu, ShieldCheck, Building2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Row {
  label: string;
  icon: typeof Cpu;
  hint: string;
}

const rows: Row[] = [
  { label: "Patrol Density", icon: Users, hint: "Active units per km² · Bengaluru City" },
  { label: "Infrastructure Health", icon: Building2, hint: "Critical asset integrity" },
  { label: "Rapid Response Units", icon: ShieldCheck, hint: "Deployable within 8min · Hoysala fleet" },
];

export function Simulator() {
  const [vals, setVals] = useState([62, 78, 45]);
  const [running, setRunning] = useState(false);
  const [lastImpact, setLastImpact] = useState<number | null>(null);
  const impact = Math.round((vals[0] * 0.4 + vals[1] * 0.35 + vals[2] * 0.25) / 1.2);

  const run = () => {
    if (running) return;
    setRunning(true);
    toast("Running causal simulation…", { description: "Computing counterfactual across BLR sectors." });
    setTimeout(() => {
      setRunning(false);
      setLastImpact(impact);
      toast.success(`Simulation complete · −${impact}% incidents`, {
        description: "Model: causal-v2.4 · 30d rolling window",
      });
    }, 1200);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Command Simulator
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
        {rows.map((r, i) => (
          <div key={r.label} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <r.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {r.label}
              </div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                {vals[i].toString().padStart(2, "0")}
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <Slider
              value={[vals[i]]}
              onValueChange={(v) => {
                const next = [...vals];
                next[i] = v[0];
                setVals(next);
              }}
              max={100}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-white/8 [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-thumb]]:shadow-[0_0_0_4px_rgba(90,140,255,0.12)]"
            />
            <div className="font-mono text-[10px] text-muted-foreground">{r.hint}</div>
          </div>
        ))}

        <div className="flex flex-col items-stretch justify-between rounded-lg border border-white/5 bg-background/40 p-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Predicted Causal Impact
            </div>
            <div className="mt-1 font-mono text-3xl font-medium tabular-nums text-foreground">
              −{impact}%
              <span className="ml-1 text-xs text-emerald-400">incidents</span>
            </div>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="group mt-4 flex items-center justify-center gap-2 rounded-md bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary ring-glow-electric transition hover:bg-primary/25 disabled:opacity-60"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {running ? "Simulating…" : "Run Simulation"}
          </button>
        </div>
      </div>
    </div>
  );
}
