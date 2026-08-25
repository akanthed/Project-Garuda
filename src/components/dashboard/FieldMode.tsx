import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, FilePlus2, MapPinned, Paperclip, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Officer } from "@/lib/auth";
import type { ResponsePlan } from "@/lib/types";
import { fetchResponsePlans, updateResponsePlan, uploadOperationAttachment } from "@/lib/mock-api";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, type TranslationKey } from "@/lib/i18n";

const STATUS_KEYS: Record<string, TranslationKey> = {
  assigned: "status_assigned",
  acknowledged: "status_acknowledged",
  in_progress: "status_in_progress",
  completed: "status_completed",
} as const;
import type { ViewKey } from "@/components/dashboard/Sidebar";

interface FieldModeProps {
  officer: Officer;
  onNavigate: (view: ViewKey) => void;
}

export function FieldMode({ officer, onNavigate }: FieldModeProps) {
  const { locale } = useLanguage();
  const [tasks, setTasks] = useState<ResponsePlan[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data } = await fetchResponsePlans();
      setTasks(data.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTasks(); }, []);

  const updateTask = async (task: ResponsePlan, status: "in_progress" | "completed") => {
    setUpdating(task.operation_id);
    try {
      const { data } = await updateResponsePlan(task.operation_id, status, notes[task.operation_id] ?? "");
      setTasks((items) => items.map((item) => item.operation_id === data.operation_id ? data : item));
      toast.success(t("field_update_saved", locale));
    } catch {
      toast.error(t("field_update_failed", locale));
    } finally {
      setUpdating(null);
    }
  };

  const uploadAttachment = async (task: ResponsePlan, file?: File) => {
    if (!file) return;
    setUpdating(task.operation_id);
    try {
      const { data } = await uploadOperationAttachment(task.operation_id, file);
      setTasks((items) => items.map((item) => item.operation_id === task.operation_id ? { ...item, updates: [...item.updates, data] } : item));
      toast.success(t("field_attachment_saved", locale));
    } catch {
      toast.error(t("field_attachment_failed", locale));
    } finally {
      setUpdating(null);
    }
  };

  const openTasks = tasks.filter((task) => task.status !== "completed");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <section className="border-b border-foreground/10 pb-4">
        <p className="text-sm text-muted-foreground">{t("field_greeting", locale)}</p>
        <h1 className="mt-1 text-2xl font-semibold">{officer.name}</h1>
        <p className="mt-2 text-base text-muted-foreground">{t("field_station", locale)}: <span className="text-foreground">{officer.station}</span></p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onNavigate("geospatial")} className="flex min-h-24 flex-col justify-between rounded-lg border border-foreground/10 bg-card p-4 text-left">
          <MapPinned className="h-6 w-6 text-primary" />
          <span><strong className="block text-base">{t("field_map", locale)}</strong><span className="text-sm text-muted-foreground">{t("field_map_hint", locale)}</span></span>
        </button>
        <button type="button" onClick={() => onNavigate("reports")} className="flex min-h-24 flex-col justify-between rounded-lg border border-foreground/10 bg-card p-4 text-left">
          <FilePlus2 className="h-6 w-6 text-primary" />
          <span><strong className="block text-base">{t("field_report", locale)}</strong><span className="text-sm text-muted-foreground">{t("field_report_hint", locale)}</span></span>
        </button>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold"><ClipboardList className="h-5 w-5 text-primary" />{t("field_tasks", locale)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("field_tasks_open", locale)}: {openTasks.length}</p>
          </div>
          <button type="button" onClick={() => void loadTasks()} aria-label={t("reports_refresh", locale)} className="flex h-11 w-11 items-center justify-center rounded-md border border-foreground/10 text-muted-foreground"><RefreshCw className="h-5 w-5" /></button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-base text-muted-foreground">{t("field_loading", locale)}</div>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-foreground/15 py-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-lg font-medium">{t("field_no_tasks", locale)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("field_no_tasks_hint", locale)}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <article key={task.operation_id} className="rounded-lg border border-foreground/10 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{task.station_name}</h3>
                    <p className="mt-1 text-base">{t("field_unusual_activity", locale)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">{task.current_count}</span> {t("alerts_vs_avg", locale)} <span className="font-mono">{task.usual_count}</span>
                    </p>
                    <p className="mt-1 text-sm font-medium text-amber-500">{(task.current_count / task.usual_count).toFixed(1)}× {t("field_usual_comparison", locale)}</p>
                  </div>
                  {task.status === "completed" && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm text-emerald-500">{t("field_completed", locale)}</span>}
                </div>
                {task.note && <p className="mt-3 border-l-2 border-primary pl-3 text-base leading-6">{task.note}</p>}
                {(task.updates?.length ?? 0) > 0 && (
                  <details className="mt-3 rounded-md border border-foreground/10 p-3">
                    <summary className="cursor-pointer text-sm font-medium">{t("field_history", locale)} ({task.updates.length})</summary>
                    <div className="mt-3 space-y-2">
                      {(task.updates ?? []).map((update) => (
                        <div key={update.update_id} className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{t(STATUS_KEYS[update.status] ?? "status_in_progress", locale)}</span> · {update.note || update.attachment_name || t("field_no_note", locale)}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {task.status !== "completed" && (
                  <div className="mt-4 space-y-3">
                    <textarea value={notes[task.operation_id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [task.operation_id]: event.target.value }))} placeholder={t("field_complete_note", locale)} className="min-h-20 w-full rounded-md border border-foreground/10 bg-background px-3 py-2 text-base outline-none focus:border-primary" />
                    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-foreground/10 text-sm font-medium text-foreground">
                      <Paperclip className="h-5 w-5" />{t("field_attachment", locale)}
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="sr-only" onChange={(event) => void uploadAttachment(task, event.target.files?.[0])} />
                    </label>
                    <button type="button" disabled={updating === task.operation_id} onClick={() => void updateTask(task, task.status === "assigned" ? "in_progress" : "completed")} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      {task.status === "assigned" ? <Play className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                      {t(task.status === "assigned" ? "field_start" : "field_complete", locale)}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}