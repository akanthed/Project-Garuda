import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shared state for the What-If Tactical Simulator sliders — lifted out of
 * `Simulator.tsx` so `GeoMap.tsx` can react to live slider movement too
 * ("sliding parameters shrinks/scales risk indicators on the map").
 * Keys match the ids returned by `fetchSimulatorVariables()`
 * (`patrol-density`, `infra-health`, `rapid-response`).
 */
export type SimulatorValues = Record<string, number>;

export const SIMULATOR_DEFAULTS: SimulatorValues = {
  "patrol-density": 62,
  "infra-health": 78,
  "rapid-response": 45,
};

interface SimulatorContextValue {
  values: SimulatorValues;
  setValue: (id: string, v: number) => void;
  setDefaults: (v: SimulatorValues) => void;
  /**
   * Given a hotspot's own patrol/infra factor values (0-100), returns a
   * multiplier to apply to its visual intensity/hex height: <1 shrinks it
   * (sliders moved toward improvement), >1 grows it (sliders moved toward
   * neglect). Weighted more strongly for stations that are already weak in
   * that factor, so the effect reads as "fixing the weakest link helps most."
   */
  riskScaleFor: (basePatrol?: number, baseInfra?: number) => number;
}

const SimulatorContext = createContext<SimulatorContextValue>({
  values: SIMULATOR_DEFAULTS,
  setValue: () => {},
  setDefaults: () => {},
  riskScaleFor: () => 1,
});

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<SimulatorValues>(SIMULATOR_DEFAULTS);
  const [defaults, setDefaultsState] = useState<SimulatorValues>(SIMULATOR_DEFAULTS);

  const setValue = (id: string, v: number) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  const setDefaults = (v: SimulatorValues) => {
    setDefaultsState(v);
    setValues(v);
  };

  const riskScaleFor = (basePatrol = 50, baseInfra = 50) => {
    const patrolDelta = ((values["patrol-density"] ?? defaults["patrol-density"]) - defaults["patrol-density"]) / 100;
    const infraDelta = ((values["infra-health"] ?? defaults["infra-health"]) - defaults["infra-health"]) / 100;
    const patrolWeight = (100 - basePatrol) / 100;
    const infraWeight = (100 - baseInfra) / 100;
    const improvement = patrolDelta * patrolWeight * 0.5 + infraDelta * infraWeight * 0.5;
    return Math.max(0.25, Math.min(1.6, 1 - improvement));
  };

  return (
    <SimulatorContext.Provider value={{ values, setValue, setDefaults, riskScaleFor }}>
      {children}
    </SimulatorContext.Provider>
  );
}

export function useSimulator(): SimulatorContextValue {
  return useContext(SimulatorContext);
}
