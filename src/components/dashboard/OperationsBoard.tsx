import { useEffect, useState } from "react";
import { ClipboardCheck, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { exportOperationDebrief, fetchOperationAssessment, fetchResponsePlans } from "@/lib/mock-api";
import type { OperationAssessment, ResponsePlan } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";

export function OperationsBoard({ refreshKey }: { refreshKey: number }) {
  const { locale } = useLanguage();
  const [plans, setPlans] = useState<ResponsePlan[]>([]);
  const [assessments, setAssessments] = useState<Record<string, OperationAssessment>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await fetchResponsePlans();
    setPlans(data.items);
  };

  useEffect(() => { void load(); }, [refreshKey]);

  const assess = async (operationId: string) => {
    setBusy(operationId);
    try {
      const { data } = await fetchOperationAssessment(operationId);
      setAssessments((current) => ({ ...current, [operationId]: data }));
    } finally {
      setBusy(null);
    }
  };

  const download = async (operationId: string) => {
    setBusy(operationId);
    try {
      const blob = await exportOperationDebrief(operationId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `garuda-operation-${operationId.slice(0, 8)}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("operations_debrief_failed", locale));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="border-t border-foreground/10 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck className="h-5 w-5 text-primary" />{t("operations_board_title", locale)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("operations_board_subtitle", locale)}</p>
        </div>
        <button type="button" onClick={() => void load()} aria-label={t("reports_refresh", locale)} className="flex h-11 w-11 items-center justify-center rounded-md border border-foreground/10"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {plans.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("operations_timeline_empty", locale)}</p> : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {plans.slice(0, 8).map((plan) => {
            const assessment = assessments[plan.operation_id];
            return (
              <article key={plan.operation_id} className="rounded-lg border border-foreground/10 bg-card p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{plan.station_name}</h3><p className="mt-1 text-sm text-muted-foreground">{t("operations_assigned_to", locale)}: {plan.assigned_to}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">{plan.status}</span></div>
                <p className="mt-3 text-sm">{plan.note || t("operations_timeline_no_note", locale)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{plan.updates?.length ?? 0} {t("field_history", locale).toLowerCase()}</p>
                {assessment && <div className="mt-3 rounded-md border border-foreground/10 p-3 text-sm"><p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" />{t(assessment.process_status === "completed" ? "operations_process_complete" : "operations_process_active", locale)}</p><p className="mt-2 text-amber-500">{t("operations_impact_pending", locale)}</p><p className="mt-1 text-xs text-muted-foreground">{t("operations_historical_context", locale)}: {assessment.baseline_30d_cases ?? "-"} → {assessment.latest_historical_30d_cases ?? "-"}</p></div>}
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void assess(plan.operation_id)} className="min-h-11 rounded-md border border-foreground/10 px-3 text-sm">{busy === plan.operation_id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("operations_assessment", locale)}</button><button type="button" onClick={() => void download(plan.operation_id)} className="flex min-h-11 items-center gap-2 rounded-md border border-foreground/10 px-3 text-sm"><Download className="h-4 w-4" />{t("operations_debrief", locale)}</button></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}