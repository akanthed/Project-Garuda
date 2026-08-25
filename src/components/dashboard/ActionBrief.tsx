'use client';

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, FileText, MapPin, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import type { StationAnomaly } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ActionBriefProps {
  anomaly: StationAnomaly | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordDecision: (decision: ActionBriefDecision, note: string, anomaly: StationAnomaly, assignedTo: string) => Promise<void>;
}

export type ActionBriefDecision = "approve" | "modify" | "escalate";

export function ActionBrief({ anomaly, open, onOpenChange, onRecordDecision }: ActionBriefProps) {
  const { locale } = useLanguage();
  const [decision, setDecision] = useState<ActionBriefDecision>("approve");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState("KSP-BLR-1001");
  const [saving, setSaving] = useState(false);

  if (!anomaly) return null;

  const estimatedImpact = anomaly.severity === "critical" ? 24 : 16;
  const actionItems = [
    { icon: MapPin, text: t("action_brief_hotspot", locale) },
    { icon: ShieldAlert, text: t("action_brief_patrol", locale) },
    { icon: FileText, text: t("action_brief_case_review", locale) },
  ];

  const markReady = async () => {
    setSaving(true);
    try {
      await onRecordDecision(decision, note.trim(), anomaly, assignedTo);
      toast.success(t("action_brief_ready", locale), { description: t("action_brief_ready_desc", locale) });
      setNote("");
      onOpenChange(false);
    } catch {
      toast.error(t("action_brief_failed", locale));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto border-foreground/10 bg-background p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-foreground/5 px-5 py-5 pr-12">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardCheck className="h-4 w-4" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">{t("action_brief_subtitle", locale)}</span>
          </div>
          <SheetTitle className="mt-1 text-lg">{t("action_brief_title", locale)}</SheetTitle>
          <SheetDescription className="text-xs">{anomaly.station_name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("action_brief_signal", locale)}</h3>
            <div className="mt-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger)]/5 p-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                <div>
                  <div className="text-sm font-medium">{t("action_brief_anomaly", locale)}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {anomaly.current_count} {t("action_brief_current", locale)} {t("reports_of", locale)} {anomaly.mean_count} {t("action_brief_usual", locale)}.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("action_brief_evidence", locale)}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-foreground/5 bg-card p-3 text-xs">
              <div><dt className="text-muted-foreground">{t("action_brief_station", locale)}</dt><dd className="mt-1 font-medium">{anomaly.station_name}</dd></div>
              <div><dt className="text-muted-foreground">{t("alerts_diagnostic", locale)}</dt><dd className="mt-1 font-mono">z={anomaly.z_score}</dd></div>
              <div><dt className="text-muted-foreground">{t("action_brief_current", locale)}</dt><dd className="mt-1 font-mono">{anomaly.current_count}</dd></div>
              <div><dt className="text-muted-foreground">{t("action_brief_usual", locale)}</dt><dd className="mt-1 font-mono">{anomaly.mean_count}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("action_brief_actions", locale)}</h3>
            <div className="mt-2 space-y-2">
              {actionItems.map(({ icon: Icon, text }, index) => (
                <div key={text} className="flex gap-3 rounded-lg border border-foreground/5 bg-card p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">{index + 1}</span>
                  <div className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{text}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300">{t("action_brief_estimate", locale)}</div>
                <div className="mt-1 text-sm">{t("action_brief_impact", locale)}: <span className="font-mono font-medium">-{estimatedImpact}%</span></div>
              </div>
              <Users className="h-5 w-5 shrink-0 text-emerald-300" />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{t("action_brief_assumption", locale)}</p>
          </section>

          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t("action_brief_decision", locale)}</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                ["approve", "action_brief_approve"],
                ["modify", "action_brief_modify"],
                ["escalate", "action_brief_escalate"],
              ] as const).map(([value, labelKey]) => (
                <button key={value} type="button" onClick={() => setDecision(value)} className={cn("rounded-md border px-2 py-2 text-xs transition", decision === value ? "border-primary/50 bg-primary/15 text-primary" : "border-foreground/10 text-muted-foreground hover:text-foreground")}>
                  {t(labelKey, locale)}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm text-muted-foreground">{t("action_brief_assign", locale)}
              <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-md border border-foreground/10 bg-card px-3 text-sm text-foreground outline-none focus:border-primary/50">
                <option value="KSP-BLR-1001">{t("action_brief_constable", locale)}</option>
              </select>
            </label>
            <label className="mt-3 block text-[11px] text-muted-foreground">{t("action_brief_note", locale)}
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("action_brief_note_hint", locale)} className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-foreground/10 bg-card px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50" />
            </label>
          </section>

          <p className="border-l-2 border-amber-400/70 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">{t("action_brief_disclaimer", locale)}</p>
          <button type="button" onClick={markReady} disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary/15 px-4 text-sm font-medium text-primary transition hover:bg-primary/25 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{t(saving ? "action_brief_saving" : "action_brief_record_decision", locale)}</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
