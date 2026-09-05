'use client';

import { useEffect, useRef, useState } from "react";
import { FileText, Search, Filter, ChevronDown, ExternalLink, RefreshCw, Languages, Loader2, Plus, X, ScanLine } from "lucide-react";
import { createIncident, fetchCaseReports, scanIncidentDocument, updateCaseWorkflow } from "@/lib/mock-api";
import { translateTexts } from "@/lib/translate";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScope } from "@/contexts/ScopeContext";
import type { Officer } from "@/lib/auth";
import { t, districtName, type TranslationKey } from "@/lib/i18n";
import type { CaseReport, CaseSeverity, CaseStatus, IncidentIntake, IncidentScanResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RiskAssessment } from "./RiskAssessment";
import { SectionHelp } from "@/components/dashboard/SectionHelp";

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
  closed: "bg-foreground/5 text-muted-foreground",
};

const SEVERITY_KEYS: Record<CaseSeverity, TranslationKey> = {
  critical: "reports_severity_critical",
  high: "reports_severity_high",
  medium: "reports_severity_medium",
  low: "reports_severity_low",
};

const STATUS_KEYS: Record<CaseStatus, TranslationKey> = {
  open: "reports_status_open",
  investigating: "reports_status_investigating",
  resolved: "reports_status_resolved",
  closed: "reports_status_closed",
};

const CRIME_TYPE_KEYS: Record<string, TranslationKey> = {
  "Missing Persons": "reports_crime_missing_persons",
  "Unlawful Assembly": "reports_crime_unlawful_assembly",
  "Property Theft": "reports_crime_property_theft",
  "Vehicle Theft": "reports_crime_vehicle_theft",
  "Cyber Crime": "reports_crime_cyber_crime",
  "Narcotics": "reports_crime_narcotics",
  Assault: "reports_crime_assault",
};

function localizedCrimeType(crimeType: string, locale: ReturnType<typeof useLanguage>["locale"]) {
  const key = CRIME_TYPE_KEYS[crimeType];
  return key ? t(key, locale) : crimeType;
}

const OCR_FIELD_KEYS: Record<string, TranslationKey> = {
  crime_no: "reports_ocr_field_crime_no",
  registered_date: "reports_ocr_field_registered_date",
  police_station_id: "reports_ocr_field_station",
  crime_major_head_id: "reports_ocr_field_category",
  gravity_offence_id: "reports_ocr_field_gravity",
};

function SeverityBadge({ severity }: { severity: CaseSeverity }) {
  const { locale } = useLanguage();
  return (
    <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", SEVERITY_STYLES[severity])}>
      {t(SEVERITY_KEYS[severity], locale)}
    </span>
  );
}

function StatusBadge({ status }: { status: CaseStatus }) {
  const { locale } = useLanguage();
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide", STATUS_STYLES[status])}>
      {t(STATUS_KEYS[status], locale)}
    </span>
  );
}

// ─── Case detail drawer ────────────────────────────────────────────────────────

function CaseDetailDrawer({ report, canManage, onClose, onWorkflowUpdated }: { report: CaseReport; canManage: boolean; onClose: () => void; onWorkflowUpdated: (report: CaseReport) => void }) {
  const { locale } = useLanguage();
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateSource, setTranslateSource] = useState<"quickml_translation" | "fallback" | null>(null);
  const [status, setStatus] = useState<CaseStatus>(report.status);
  const [assignedOfficer, setAssignedOfficer] = useState(report.assigned_officer === "Unassigned" ? "" : report.assigned_officer);
  const [savingWorkflow, setSavingWorkflow] = useState(false);

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

  const handleWorkflowUpdate = async () => {
    const officer = assignedOfficer.trim();
    if (!officer || savingWorkflow) return;
    setSavingWorkflow(true);
    try {
      const { data } = await updateCaseWorkflow(report.case_master_id, { status, assigned_officer: officer });
      const updated = { ...report, status: data.status, assigned_officer: data.assigned_officer };
      onWorkflowUpdated(updated);
      toast.success(t("reports_workflow_saved", locale), { description: data.warning ?? data.updated_by });
    } catch (error) {
      console.error("workflow action failed", error);
      toast.error(t("reports_workflow_failed", locale), { description: t("reports_review_details", locale) });
    } finally {
      setSavingWorkflow(false);
    }
  };

  return (
    <div className="rounded-xl border border-foreground/10 bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{report.id}</div>
          <div className="mt-1 text-base font-medium leading-snug">{translated ?? report.title}</div>
          {translateSource && (
            <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              {translateSource === "quickml_translation" ? t("reports_translate_quickml", locale) : t("reports_translate_fallback", locale)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTranslate}
            disabled={translating}
            className="flex items-center gap-1.5 rounded-md border border-foreground/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:opacity-60"
          >
            {translating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            {translated ? "EN" : "ಕನ್ನಡ"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-foreground/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
          >
            {t("common_close", locale)}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-3">
        {[
          { label: t("reports_detail_area", locale), value: report.district },
          { label: t("reports_detail_station", locale), value: report.station },
          { label: t("reports_detail_section", locale), value: report.ipc_section },
          { label: t("reports_detail_type", locale), value: localizedCrimeType(report.crime_type, locale) },
          { label: t("reports_detail_filed", locale), value: new Date(report.date).toLocaleDateString(locale === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }) },
          { label: t("reports_detail_officer", locale), value: report.assigned_officer === "Unassigned" ? t("reports_unassigned", locale) : report.assigned_officer },
          ...(canManage && report.suspects != null ? [{ label: t("reports_detail_suspects", locale), value: String(report.suspects) }] : []),
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

      {/* Risk Assessment */}
      {canManage && <div className="mt-4 border-t border-foreground/5 pt-4"><RiskAssessment caseMasterId={report.case_master_id} /></div>}

      {canManage && <div className="mt-4 grid gap-3 border-t border-foreground/5 pt-4 md:grid-cols-[1fr_180px_auto]">
        <input
          value={assignedOfficer}
          onChange={(event) => setAssignedOfficer(event.target.value)}
          placeholder={t("reports_assign_officer", locale)}
          className="rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)} className="rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">
          {(["open", "investigating", "resolved", "closed"] as CaseStatus[]).map((value) => <option key={value} value={value}>{t(STATUS_KEYS[value], locale)}</option>)}
        </select>
        <button onClick={handleWorkflowUpdate} disabled={!assignedOfficer.trim() || savingWorkflow} className="rounded-md bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/25 disabled:opacity-50">
          {savingWorkflow ? t("reports_workflow_saving", locale) : t("reports_update_workflow", locale)}
        </button>
      </div>}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-foreground/5 bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-medium tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

const SEVERITY_ORDER: CaseSeverity[] = ["critical", "high", "medium", "low"];

const CRIME_HEADS = [
  [1, "Cyber Crime", "ಸೈಬರ್ ಅಪರಾಧ"], [2, "Property Theft", "ಆಸ್ತಿ ಕಳ್ಳತನ"], [3, "Vehicle Theft", "ವಾಹನ ಕಳ್ಳತನ"], [4, "Assault & Violence", "ದಾಳಿ ಮತ್ತು ಹಿಂಸಾಚಾರ"],
  [5, "Narcotics", "ಮಾದಕ ವಸ್ತುಗಳು"], [6, "Murder", "ಕೊಲೆ"], [7, "Robbery & Dacoity", "ದರೋಡೆ"], [8, "Fraud & Cheating", "ವಂಚನೆ"],
  [9, "Unlawful Assembly", "ಕಾನೂನುಬಾಹಿರ ಸಭೆ"], [10, "Eve Teasing", "ಮಹಿಳಾ ಕಿರುಕುಳ"], [11, "Land Disputes", "ಭೂ ವಿವಾದಗಳು"], [12, "Communal Offences", "ಸಾಮುದಾಯಿಕ ಅಪರಾಧಗಳು"],
  [13, "Missing Persons", "ಕಾಣೆಯಾದ ವ್ಯಕ್ತಿಗಳು"], [14, "Domestic Violence", "ಗೃಹ ಹಿಂಸಾಚಾರ"], [15, "Child Offences", "ಮಕ್ಕಳ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು"],
] as const;

const INITIAL_INTAKE: IncidentIntake = {
  crime_no: "",
  registered_date: new Date().toISOString().slice(0, 10),
  police_station_id: 1,
  crime_major_head_id: 2,
  gravity_offence_id: 3,
  latitude: 12.9716,
  longitude: 77.5946,
  brief_facts: "",
  accused_names: [],
};

function IncidentIntakeForm({ onClose, onSubmitted, initialDraft, scanMeta }: { onClose: () => void; onSubmitted: () => void; initialDraft?: IncidentIntake; scanMeta?: IncidentScanResult }) {
  const { locale } = useLanguage();
  const [intake, setIntake] = useState<IncidentIntake>(initialDraft ?? INITIAL_INTAKE);
  const [accusedInput, setAccusedInput] = useState((initialDraft?.accused_names ?? []).join(", "));
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof IncidentIntake>(key: K, value: IncidentIntake[K]) => {
    setIntake((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await createIncident({
        ...intake,
        accused_names: accusedInput.split(",").map((name) => name.trim()).filter(Boolean),
      });
      toast.success(`${t("reports_incident_added", locale)}: ${data.id}`, { description: data.warning ?? `Catalyst Data Store · ${data.station}` });
      onSubmitted();
      onClose();
    } catch (error) {
      console.error("incident intake failed", error);
      toast.error(t("reports_intake_failed", locale), { description: t("reports_review_details", locale) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-primary/20 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-medium">{t("reports_intake_title", locale)}</div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("reports_intake_desc", locale)}</p>
        </div>
        <button type="button" onClick={onClose} title={t("reports_close_intake", locale)} className="text-muted-foreground transition hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {scanMeta && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
          <div className="flex items-center gap-2 text-primary"><ScanLine className="h-3.5 w-3.5" />{t("reports_scan_banner", locale)}</div>
          {scanMeta.low_confidence_fields.length > 0 && (
            <div className="mt-1.5">{t("reports_scan_low_confidence", locale)}: {scanMeta.low_confidence_fields.map((field) => t(OCR_FIELD_KEYS[field] ?? "reports_ocr_field_category", locale)).join(", ")}</div>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-muted-foreground">{t("reports_fir_number", locale)}<input required title={t("reports_fir_format", locale)} value={intake.crime_no} onChange={(event) => update("crime_no", event.target.value)} onBlur={(event) => update("crime_no", event.target.value.trim().toUpperCase().replace(/[/-]+/g, "/"))} placeholder="KSP/2026/0001" className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /><span className="mt-1 block text-[10px] text-muted-foreground/70">{t("reports_fir_format", locale)}</span></label>
        <label className="text-xs text-muted-foreground">{t("reports_registration_date", locale)}<input required type="date" value={intake.registered_date} onChange={(event) => update("registered_date", event.target.value)} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
        <label className="text-xs text-muted-foreground">{t("reports_station_id", locale)}<input required min="1" max="1100" type="number" value={intake.police_station_id} onChange={(event) => update("police_station_id", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
        <label className="text-xs text-muted-foreground">{t("reports_gravity", locale)}<select value={intake.gravity_offence_id} onChange={(event) => update("gravity_offence_id", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{t("reports_gravity_value", locale)} {value}</option>)}</select></label>
        <label className="text-xs text-muted-foreground md:col-span-2">{t("reports_category", locale)}<select value={intake.crime_major_head_id} onChange={(event) => update("crime_major_head_id", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50">{CRIME_HEADS.map(([id, en, kn]) => <option key={id} value={id}>{locale === "kn" ? kn : en}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">{t("reports_latitude", locale)}<input required step="0.000001" type="number" value={intake.latitude} onChange={(event) => update("latitude", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
        <label className="text-xs text-muted-foreground">{t("reports_longitude", locale)}<input required step="0.000001" type="number" value={intake.longitude} onChange={(event) => update("longitude", Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-muted-foreground">{t("reports_narrative", locale)}<textarea required minLength={10} value={intake.brief_facts} onChange={(event) => update("brief_facts", event.target.value)} placeholder={t("reports_narrative_hint", locale)} className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
        <label className="text-xs text-muted-foreground">{t("reports_accused", locale)} <span className="text-foreground/30">{t("reports_optional", locale)}</span><textarea value={accusedInput} onChange={(event) => setAccusedInput(event.target.value)} placeholder={t("reports_accused_hint", locale)} className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50" /></label>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground transition hover:text-foreground">{t("reports_cancel", locale)}</button>
        <button disabled={submitting} className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/25 disabled:opacity-60"><Plus className="h-3.5 w-3.5" />{submitting ? t("reports_adding_incident", locale) : t("reports_add_to_intelligence", locale)}</button>
      </div>
    </form>
  );
}

export function ReportsView({ officer }: { officer: Officer }) {
  const { locale } = useLanguage();
  const { districtId, activeDistrict } = useScope();
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [reportSummary, setReportSummary] = useState({ active: 0, critical: 0, stations: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<CaseSeverity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<CaseStatus | "all">("all");
  const [selected, setSelected] = useState<CaseReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [scanDraft, setScanDraft] = useState<IncidentScanResult | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = Number(officer.clearance.replace("CLR-", "")) >= 4;
  const reportScope = officer.designation === "SI" || officer.designation === "Constable"
    ? officer.station
    : activeDistrict
      ? districtName(activeDistrict, locale)
      : t("topbar_scope_statewide", locale);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCaseReports({ districtId }).then(({ data }) => {
      if (cancelled) return;
      setReports(data.items);
      setTotalReports(data.total);
      setReportSummary(data.summary);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [districtId]);

  const load = () => {
    setLoading(true);
    fetchCaseReports({ districtId }).then(({ data }) => {
      setReports(data.items);
      setTotalReports(data.total);
      setReportSummary(data.summary);
      setLoading(false);
    });
  };

  const refresh = () => {
    setRefreshing(true);
    fetchCaseReports({ districtId }).then(({ data }) => {
      setReports(data.items);
      setTotalReports(data.total);
      setReportSummary(data.summary);
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

  const handleScanFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const { data } = await scanIncidentDocument(file);
      setScanDraft(data);
      setIntakeOpen(true);
      toast.success(t("reports_scan_fir", locale), { description: data.advisory });
    } catch {
      toast.error(t("reports_scan_failed", locale), { description: t("reports_scan_failed_desc", locale) });
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-primary" />
          <div>
            <div className="text-base font-medium">{t("reports_title", locale)}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {t("reports_subtitle", locale)} — {reportScope}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {t(canManage ? "reports_workflow_hint" : "reports_readonly_hint", locale)}
            </div>
          </div>
          <SectionHelp title={t("help_reports_title", locale)} description={t("help_reports_desc", locale)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && <><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="hidden" onChange={handleScanFile} /><button onClick={() => fileInputRef.current?.click()} disabled={scanning} className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs text-primary transition hover:bg-primary/15 disabled:opacity-60">{scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}{scanning ? t("reports_scanning", locale) : t("reports_scan_fir", locale)}</button><button onClick={() => { setScanDraft(undefined); setIntakeOpen((open) => !open); }} className="flex items-center gap-2 rounded-md bg-primary/15 px-3 py-1.5 text-xs text-primary transition hover:bg-primary/25"><Plus className="h-3.5 w-3.5" />{t("reports_add_incident", locale)}</button></>}
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 rounded-md border border-foreground/5 bg-foreground/[0.02] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/15 hover:text-foreground disabled:opacity-50"><RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />{t("reports_refresh", locale)}</button>
        </div>
      </div>

      {intakeOpen && (
        <IncidentIntakeForm
          onClose={() => { setIntakeOpen(false); setScanDraft(undefined); }}
          onSubmitted={load}
          initialDraft={scanDraft?.draft}
          scanMeta={scanDraft}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t("reports_total", locale)} value={totalReports} sub={reportScope} />
        <StatCard label={t("reports_active", locale)} value={reportSummary.active} sub={t("reports_attention", locale)} />
        <StatCard label={t("reports_critical", locale)} value={reportSummary.critical} sub={t("reports_immediate", locale)} />
        <StatCard label={t("reports_stations", locale)} value={reportSummary.stations} sub={reportScope} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-foreground/5 bg-foreground/[0.02] px-3 py-2 text-xs focus-within:border-foreground/15">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("reports_search", locale)}
            className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <div className="relative">
          <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as CaseSeverity | "all")}
            className="appearance-none rounded-md border border-foreground/5 bg-card pl-8 pr-7 py-2 font-mono text-xs text-foreground outline-none"
          >
            <option value="all">{t("reports_all_severities", locale)}</option>
            {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{t(SEVERITY_KEYS[s], locale)}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="relative">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CaseStatus | "all")}
            className="appearance-none rounded-md border border-foreground/5 bg-card px-3 pr-7 py-2 font-mono text-xs text-foreground outline-none"
          >
            <option value="all">{t("reports_all_statuses", locale)}</option>
            {(["open", "investigating", "resolved", "closed"] as CaseStatus[]).map((s) => (
              <option key={s} value={s}>{t(STATUS_KEYS[s], locale)}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Selected case detail */}
      {selected && (
        <CaseDetailDrawer
          key={selected.id}
          report={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onWorkflowUpdated={(updated) => {
            setReports((current) => current.map((report) => report.case_master_id === updated.case_master_id ? updated : report));
            setSelected(updated);
          }}
        />
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-foreground/5 bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <span className="font-mono text-sm text-muted-foreground">{t("reports_loading", locale)}</span>
          </div>
        ) : (
          <>
          <div className="divide-y divide-foreground/5 sm:hidden">
            {filtered.length === 0 ? (
              <div className="py-12 text-center font-mono text-sm text-muted-foreground">{t("reports_no_match", locale)}</div>
            ) : filtered.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => setSelected(selected?.id === report.id ? null : report)}
                className={cn("w-full px-4 py-4 text-left transition-colors", selected?.id === report.id ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground">{report.id}</div>
                    <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{report.title}</div>
                  </div>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                  <span>{report.station}</span>
                  <span>{localizedCrimeType(report.crime_type, locale)}</span>
                  <span>{new Date(report.date).toLocaleDateString(locale === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "short" })}</span>
                </div>
                <div className="mt-3 flex items-center gap-2"><SeverityBadge severity={report.severity} /><StatusBadge status={report.status} /></div>
              </button>
            ))}
          </div>
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-foreground/5 text-left">
                {[
                  t("reports_col_case", locale),
                  t("reports_col_title", locale),
                  t("reports_col_area", locale),
                  t("reports_col_type", locale),
                  t("reports_col_date", locale),
                  t("reports_col_severity", locale),
                  t("reports_col_workflow", locale),
                  "",
                ].map((h) => (
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
                    {t("reports_no_match", locale)}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "cursor-pointer border-b border-foreground/[0.03] transition-colors hover:bg-foreground/[0.02]",
                      selected?.id === r.id && "bg-foreground/[0.04]"
                    )}
                    onClick={() => setSelected(selected?.id === r.id ? null : r)}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.id}</td>
                    <td className="max-w-[260px] px-4 py-3 text-xs leading-snug">{r.title}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.district}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{localizedCrimeType(r.crime_type, locale)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {new Date(r.date).toLocaleDateString(locale === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={r.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusBadge status={r.status} />
                        <div className="max-w-28 truncate font-mono text-[10px] text-muted-foreground" title={r.assigned_officer}>
                          {r.assigned_officer}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </>
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-foreground/5 px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
            <span>{t("reports_showing", locale)} {filtered.length} {t("reports_of", locale)} {totalReports}</span>
            <span>KSP · {new Date().toLocaleDateString("en-IN")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
