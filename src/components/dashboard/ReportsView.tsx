'use client';

import { useEffect, useState } from "react";
import { FileText, Search, Filter, ChevronDown, ExternalLink, RefreshCw, Languages, Loader2 } from "lucide-react";
import { fetchCaseReports } from "@/lib/mock-api";
import { translateTexts } from "@/lib/translate";
import type { CaseReport, CaseSeverity, CaseStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<CaseSeverity, string> = {
  critical: "bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-[var(--electric)]/10 text-[var(--electric)] border-[var(--electric)]/20",
};

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-rose-500/10 text-rose-400",
  investigating: "bg-amber-500/10 text-amber-400",
  resolved: "bg-emerald-500/10 text-emerald-400",
  closed: "bg-white/5 text-muted-foreground",
};

function SeverityBadge({ severity }: { severity: CaseSeverity }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", SEVERITY_STYLES[severity])}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", STATUS_STYLES[status])}>
      {status}
    </span>
  );
}

// ─── Case detail drawer ────────────────────────────────────────────────────────

function CaseDetailDrawer({ report, onClose }: { report: CaseReport; onClose: () => void }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateSource, setTranslateSource] = useState<"zia" | "fallback" | null>(null);

  const handleTranslate = async () => {
    if (translated) {
      setTranslated(null);
      setTranslateSource(null);
      return;
    }
    setTranslating(true);
    const { texts, source } = await translateTexts([report.title], "kn");
    setTranslating(false);
    setTranslateSource(source);
    setTranslated(texts[0]);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{report.id}</div>
          <div className="mt-1 text-base font-medium leading-snug">{translated ?? report.title}</div>
          {translateSource && (
            <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              {translateSource === "zia" ? "Translated via Catalyst Zia" : "Translation unavailable — showing original"}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="flex items-center gap-1.5 rounded-md border border-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:opacity-60"
          >
            {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            {translated ? "EN" : "ಕನ್ನಡ"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-white/15 hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3">
        {[
          { label: "District", value: report.district },
          { label: "Station", value: report.station },
          { label: "IPC Section", value: report.ipc_section },
          { label: "Crime Type", value: report.crime_type },
          { label: "Date Filed", value: new Date(report.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
          { label: "Assigned Officer", value: report.assigned_officer },
          { label: "Suspects Named", value: String(report.suspects) },
        ].map(({ label, value }) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="mt-0.5 font-mono text-sm">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <SeverityBadge severity={report.severity} />
        <StatusBadge status={report.status} />
      </div>
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const SEVERITY_ORDER: CaseSeverity[] = ["critical", "high", "medium", "low"];

export function ReportsView() {
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<CaseSeverity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CaseStatus | "all">("all");
  const [selected, setSelected] = useState<CaseReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    fetchCaseReports().then(({ data }) => {
      setReports(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const refresh = () => {
    setRefreshing(true);
    fetchCaseReports().then(({ data }) => {
      setReports(data);
      setRefreshing(false);
    });
  };

  const filtered = reports
    .filter((r) => filterSeverity === "all" || r.severity === filterSeverity)
    .filter((r) => filterStatus === "all" || r.status === filterStatus)
    .filter((r) => {
      const q = search.toLowerCase();
      return !q || r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.district.toLowerCase().includes(q);
    });

  const criticalCount = reports.filter((r) => r.severity === "critical").length;
  const openCount = reports.filter((r) => r.status === "open" || r.status === "investigating").length;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <div className="text-base font-medium">Case Reports</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              Karnataka State Police · KSP-BLR Intelligence Digest
            </div>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-white/15 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Cases" value={reports.length} sub="all districts" />
        <StatCard label="Active / Investigating" value={openCount} sub="require attention" />
        <StatCard label="Critical Severity" value={criticalCount} sub="immediate action" />
        <StatCard label="Stations Covered" value="1,100+" sub="KSP network" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2 text-xs focus-within:border-white/15">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases, IDs, districts…"
            className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as CaseSeverity | "all")}
            className="appearance-none rounded-md border border-white/5 bg-card pl-8 pr-7 py-2 font-mono text-xs text-foreground outline-none"
          >
            <option value="all">All Severities</option>
            {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CaseStatus | "all")}
            className="appearance-none rounded-md border border-white/5 bg-card px-3 pr-7 py-2 font-mono text-xs text-foreground outline-none"
          >
            <option value="all">All Statuses</option>
            {(["open", "investigating", "resolved", "closed"] as CaseStatus[]).map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Selected case detail */}
      {selected && (
        <CaseDetailDrawer report={selected} onClose={() => setSelected(null)} />
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <span className="font-mono text-sm text-muted-foreground">Loading case index…</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                {["Case ID", "Title", "District", "Crime Type", "Date", "Severity", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center font-mono text-sm text-muted-foreground">
                    No cases match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "cursor-pointer border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]",
                      selected?.id === r.id && "bg-white/[0.04]"
                    )}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.id}</td>
                    <td className="max-w-[260px] px-4 py-3 text-xs leading-snug">{r.title}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.district}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.crime_type}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={r.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/5 px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
            <span>Showing {filtered.length} of {reports.length} cases</span>
            <span>KSP Intelligence Digest · {new Date().toLocaleDateString("en-IN")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
