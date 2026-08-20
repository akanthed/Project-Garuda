import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchDistricts } from "@/lib/mock-api";
import type { DistrictInfo, GeoBounds } from "@/lib/types";

interface ScopeContextValue {
  /** null means statewide (no drilldown applied) */
  districtId: number | null;
  districts: DistrictInfo[];
  statewideBounds: GeoBounds | null;
  activeDistrict: DistrictInfo | null;
  setDistrictId: (id: number | null) => void;
}

const ScopeContext = createContext<ScopeContextValue>({
  districtId: null,
  districts: [],
  statewideBounds: null,
  activeDistrict: null,
  setDistrictId: () => {},
});

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [districtId, setDistrictIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("garuda_district_id");
    return stored ? Number(stored) : null;
  });
  const [districts, setDistricts] = useState<DistrictInfo[]>([]);
  const [statewideBounds, setStatewideBounds] = useState<GeoBounds | null>(null);

  useEffect(() => {
    fetchDistricts()
      .then(({ data }) => {
        setDistricts(data.districts);
        setStatewideBounds(data.statewide_bounds);
      })
      .catch(() => {
        // Scope selector degrades to statewide-only; every endpoint already
        // works unfiltered, so this is a non-fatal UI limitation.
      });
  }, []);

  const setDistrictId = (id: number | null) => {
    setDistrictIdState(id);
    if (id === null) localStorage.removeItem("garuda_district_id");
    else localStorage.setItem("garuda_district_id", String(id));
  };

  const activeDistrict = districtId == null ? null : districts.find((d) => d.district_id === districtId) ?? null;

  return (
    <ScopeContext.Provider value={{ districtId, districts, statewideBounds, activeDistrict, setDistrictId }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope(): ScopeContextValue {
  return useContext(ScopeContext);
}
