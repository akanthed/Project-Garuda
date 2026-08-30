import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandOverview } from "@/components/dashboard/CommandOverview";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ScopeProvider } from "@/contexts/ScopeContext";

const { fetchCommandChangeSummary, fetchDistricts } = vi.hoisted(() => ({
  fetchCommandChangeSummary: vi.fn(),
  fetchDistricts: vi.fn(),
}));

vi.mock("@/lib/mock-api", () => ({ fetchCommandChangeSummary, fetchDistricts }));

const summary = {
  as_of: "2026-06-30",
  window_days: 30 as const,
  scope: "Karnataka",
  current_period: { start: "2026-06-01", end: "2026-06-30" },
  previous_period: { start: "2026-05-02", end: "2026-05-31" },
  metrics: [
    { id: "cases" as const, current: 2391, previous: 2245, absolute_change: 146, percent_change: 6.5, unit: "cases" as const, status: "worsening" as const },
    { id: "serious_cases" as const, current: 882, previous: 879, absolute_change: 3, percent_change: 0.3, unit: "cases" as const, status: "worsening" as const },
    { id: "arrest_rate" as const, current: 82.4, previous: 81.2, absolute_change: 1.2, percent_change: 1.5, unit: "percent" as const, status: "improving" as const },
    { id: "station_spikes" as const, current: 31, previous: 27, absolute_change: 4, percent_change: 14.8, unit: "stations" as const, status: "worsening" as const },
  ],
  area_level: "district" as const,
  area_changes: [{ id: 8, name: "Dharwad", current: 92, previous: 71, absolute_change: 21, percent_change: 29.6 }],
  crime_changes: [{ area_id: 8, area_name: "Dharwad", cells: [{ crime_id: 1, crime_type: "Cyber Crime", current: 12, previous: 10, absolute_change: 2, percent_change: 20 }] }],
  decision_queue: { needs_assignment: 3, overdue: 2, assigned: 8, in_progress: 4, completed: 12 },
  resource_allocation: {
    available_units: 15,
    allocated_units: 2,
    advisory: "human_review_required" as const,
    recommendations: [{ station_id: 154, station_name: "Navanagar Hubballi PS", priority_score: 92.1, predicted_count: 24.4, current_count: 31, baseline_count: 5.7, is_anomaly: true, z_score: 16.27, forecast_source: "quickml_pipeline" as const, anomaly_source: "quickml_pipeline" as const, recommended_units: 2 }],
  },
  provenance: "synthetic_prototype",
};

function renderOverview() {
  return render(<LanguageProvider><ScopeProvider><CommandOverview onNavigate={vi.fn()} /></ScopeProvider></LanguageProvider>);
}

describe("Command overview", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    fetchCommandChangeSummary.mockResolvedValue({ data: summary });
    fetchDistricts.mockResolvedValue({ data: { districts: [], statewide_bounds: null } });
  });

  it("shows period-aligned changes and command decisions", async () => {
    renderOverview();
    expect(await screen.findByText("What changed across Karnataka: All Karnataka")).toBeInTheDocument();
    expect(screen.getByText("2,391")).toBeInTheDocument();
    expect(screen.getByText("Improving")).toBeInTheDocument();
    expect(screen.getAllByText("Needs attention")).toHaveLength(3);
    expect(screen.getAllByText("Dharwad").length).toBeGreaterThan(0);
    expect(screen.getByText("Cyber Crime")).toBeInTheDocument();
    expect(screen.getByText("Alerts needing assignment")).toBeInTheDocument();
    expect(screen.getByText("Recommended patrol allocation")).toBeInTheDocument();
    expect(screen.getByText("Navanagar Hubballi PS")).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument();
  });

  it("refetches when the comparison window changes", async () => {
    const user = userEvent.setup();
    renderOverview();
    await screen.findByText("What changed across Karnataka: All Karnataka");
    await user.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(fetchCommandChangeSummary).toHaveBeenLastCalledWith(7, { districtId: null }));
  });
});