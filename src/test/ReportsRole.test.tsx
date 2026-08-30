import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { LanguageProvider } from "@/contexts/LanguageContext";
import type { Officer } from "@/lib/auth";

const { fetchCaseReports } = vi.hoisted(() => ({ fetchCaseReports: vi.fn() }));

vi.mock("@/contexts/ScopeContext", () => ({
  useScope: () => ({ districtId: null, activeDistrict: null }),
}));
vi.mock("@/components/dashboard/RiskAssessment", () => ({
  RiskAssessment: () => <div>Risk model detail</div>,
}));
vi.mock("@/lib/translate", () => ({ translateTexts: vi.fn() }));
vi.mock("@/lib/mock-api", () => ({
  fetchCaseReports,
  createIncident: vi.fn(),
  scanIncidentDocument: vi.fn(),
  updateCaseWorkflow: vi.fn(),
}));

const report = {
  case_master_id: 1,
  id: "BLR-KSP/2026/0001",
  title: "Station-scoped incident summary",
  district: "Bengaluru Urban",
  station: "Koramangala PS",
  date: "2026-06-30",
  severity: "high" as const,
  status: "open" as const,
  assigned_officer: "Unassigned",
  crime_type: "Property Theft",
  ipc_section: "IPC 379",
  suspects: null,
  detail_level: "field" as const,
};

const baseOfficer = {
  name: "Officer",
  station: "Koramangala PS",
  node: "BLR-C7",
  canExport: false,
  canSimulate: false,
  canViewNetwork: false,
};

function renderReports(officer: Officer) {
  return render(<LanguageProvider><ReportsView officer={officer} /></LanguageProvider>);
}

describe("Reports role visibility", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    fetchCaseReports.mockResolvedValue({ data: { items: [report], total: 1, limit: 20, offset: 0, summary: { active: 1, critical: 0, stations: 1 } } });
  });

  it("keeps Constable reports read-only and redacted", async () => {
    const user = userEvent.setup();
    renderReports({ ...baseOfficer, badge: "KSP-BLR-1001", designation: "Constable", clearance: "CLR-1", station_id: 4 });

    await user.click((await screen.findAllByText("Station-scoped incident summary"))[0]);
    expect(screen.queryByText("Scan FIR")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Incident")).not.toBeInTheDocument();
    expect(screen.queryByText("Suspects Named")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk model detail")).not.toBeInTheDocument();
    expect(screen.queryByText("Update workflow")).not.toBeInTheDocument();
  });

  it("shows SI intake and supervisor controls", async () => {
    const user = userEvent.setup();
    renderReports({ ...baseOfficer, badge: "KSP-BLR-4412", designation: "SI", clearance: "CLR-4", station_id: 1, canSimulate: true, canViewNetwork: true });

    expect(await screen.findByText("Scan FIR")).toBeInTheDocument();
    expect(screen.getByText("Add Incident")).toBeInTheDocument();
    await user.click(screen.getAllByText("Station-scoped incident summary")[0]);
    expect(screen.getByText("Risk model detail")).toBeInTheDocument();
    expect(screen.getByText("Update workflow")).toBeInTheDocument();
  });
});