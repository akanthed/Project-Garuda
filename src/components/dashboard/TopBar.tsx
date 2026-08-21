import { useEffect, useRef, useState } from "react";
import { Bot, LogOut, FileDown, Loader2, ArrowRight, Moon, Sun, Send, Sparkles, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScope } from "@/contexts/ScopeContext";
import { useSimulator } from "@/contexts/SimulatorContext";
import { t, districtName, type TranslationKey } from "@/lib/i18n";
import { exportBrief, askGaruda } from "@/lib/mock-api";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AskResponse, KpiMetric } from "@/lib/types";
import type { ViewKey } from "@/components/dashboard/Sidebar";

interface TopBarProps {
  officer: Officer;
  kpis?: KpiMetric[];
  /** Lets "Ask Garuda" jump the dashboard to the view holding matched cases */
  onNavigate?: (view: ViewKey) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AskResponse;
}

const TOOL_LABELS: Record<AskResponse["tool_calls"][number]["tool"], TranslationKey> = {
  search_cases: "ask_tool_search_cases",
  show_hotspots: "ask_tool_show_hotspots",
  investigate_network: "ask_tool_investigate_network",
  compare_districts: "ask_tool_compare_districts",
  summarize_trends: "ask_tool_summarize_trends",
  find_connection: "ask_tool_find_connection",
  rank_offenders: "ask_tool_rank_offenders",
  explain_correlations: "ask_tool_explain_correlations",
};

const TRACE_STEP_LABELS: Record<string, TranslationKey> = {
  interpret: "ask_trace_interpret",
  execute: "ask_trace_execute",
  observe: "ask_trace_observe",
  answer: "ask_trace_answer",
};

export function TopBar({ officer, kpis, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const { districtId, districts, setDistrictId } = useScope();
  const { lastImpactPercent } = useSimulator();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation, asking]);

  const toggleTrace = (id: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    toast(t("settings_session_ended", locale), { description: t("settings_redirecting", locale) });
    navigate({ to: "/login" });
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || asking) return;
    setAsking(true);
    setConversation((messages) => [...messages, { id: crypto.randomUUID(), role: "user", text: question }]);
    setQ("");
    try {
      const { data } = await askGaruda(question);
      setConversation((messages) => [...messages, { id: crypto.randomUUID(), role: "assistant", text: data.answer, result: data }]);
    } catch {
      toast.error(t("topbar_ask_failed", locale), { description: t("topbar_ask_failed_desc", locale) });
    } finally {
      setAsking(false);
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    toast(t("topbar_exporting", locale), { description: t("topbar_export_service", locale) });
    try {
      const blob = await exportBrief({
        districtId,
        simulation_impact: lastImpactPercent ?? undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "garuda-intel-brief.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("topbar_exported", locale), { description: "garuda-intel-brief.pdf" });
    } catch (err) {
      toast.error(t("topbar_export_failed", locale), {
        description: t("topbar_export_backend", locale),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex min-w-0 items-center justify-between border-b border-foreground/5 px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {t("topbar_intel", locale)}
        </div>
        {districts.length > 0 && (
          <select
            value={districtId ?? ""}
            onChange={(e) => setDistrictId(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("topbar_scope_label", locale)}
            title={t("topbar_scope_label", locale)}
            className="h-7 shrink-0 rounded-md border border-border bg-background/60 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">{t("topbar_scope_statewide", locale)}</option>
            {districts.map((d) => (
              <option key={d.district_id} value={d.district_id}>
                {districtName(d, locale)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setChatOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={chatOpen}
          title={t("topbar_ask_label", locale)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 text-primary transition hover:border-primary/50 hover:bg-primary/10"
        >
          {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
          <span className="hidden text-xs font-medium sm:inline">{t("topbar_ask_label", locale)}</span>
        </button>

        <Dialog open={chatOpen} onOpenChange={setChatOpen}>
          <DialogContent
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
            className="flex max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden border-primary/20 p-0 [&>button]:hidden"
          >
            <DialogHeader className="shrink-0 space-y-0 border-b border-border bg-primary/[0.04] px-4 py-3 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <DialogTitle className="text-sm font-semibold text-foreground">{t("topbar_ask_label", locale)}</DialogTitle>
                    <DialogDescription className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="h-3 w-3 text-emerald-500" /> {t("ask_grounded_notice", locale)}</DialogDescription>
                  </div>
                </div>
                <DialogClose title={t("ask_close", locale)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t("ask_close", locale)}</span>
                </DialogClose>
              </div>
            </DialogHeader>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                {conversation.length === 0 && (
                  <div className="space-y-3 py-2">
                    <p className="max-w-sm text-xs leading-5 text-muted-foreground">{t("ask_greeting", locale)}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(["ask_sample_hotspots", "ask_sample_network", "ask_sample_compare", "ask_sample_kingpins"] as const).map((key) => (
                        <button key={key} type="button" onClick={() => { setQ(t(key, locale)); inputRef.current?.focus(); }} className="min-h-14 rounded-md border border-border bg-background/60 px-3 py-2 text-left text-xs leading-4 text-foreground transition hover:border-primary/40 hover:bg-primary/[0.05]">
                          {t(key, locale)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {conversation.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "ml-10 rounded-md bg-primary px-3 py-2.5 text-xs leading-5 text-primary-foreground" : "mr-2 rounded-md border border-border bg-muted/60 px-3 py-3 text-xs text-foreground"}>
                    {message.result && (
                      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border pb-2">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold uppercase ${message.result.source === "quickml" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                          {message.result.source === "quickml" && <Sparkles className="h-2.5 w-2.5" />}
                          {t(message.result.source === "quickml" ? "ask_quickml" : "ask_fallback", locale)}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">{Math.round(message.result.confidence * 100)}%</span>
                      </div>
                    )}
                    <p className="leading-5">{message.text}</p>
                    {message.result?.tool_calls.map((call) => (
                      <div key={call.tool} className="mt-2.5 flex items-center justify-between gap-3 rounded-md border border-emerald-500/15 bg-emerald-500/[0.04] px-2.5 py-2 text-[10px]">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3 w-3" /> {t(TOOL_LABELS[call.tool], locale)}</span>
                        <span className="shrink-0 font-mono text-muted-foreground">{call.result_count.toLocaleString()} {t("ask_result_count", locale)}</span>
                      </div>
                    ))}

                    {/* District comparison table */}
                    {message.result?.district_comparison && message.result.district_comparison.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px]">
                        {message.result.district_comparison.map((row) => (
                          <div key={row.district_id} className="flex items-center justify-between gap-2 font-mono">
                            <span className="truncate text-foreground">{row.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {t("ask_cases", locale)} {row.total_cases.toLocaleString()} · {t("ask_arrest_rate", locale)} {row.arrest_rate_percent}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Offender ranking */}
                    {message.result?.offender_ranking && message.result.offender_ranking.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px]">
                        {message.result.offender_ranking.slice(0, 5).map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-2 font-mono">
                            <span className="truncate text-foreground">{row.label}</span>
                            <span className="shrink-0 text-muted-foreground">{t("ask_kingpin_score", locale)} {row.kingpin_score.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suspect connection path */}
                    {message.result?.connection_result && (
                      <div className="mt-2 border-t border-border pt-2 text-[10px]">
                        <span className={`rounded-full px-1.5 py-0.5 font-mono uppercase ${message.result.connection_result.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          {t(message.result.connection_result.connected ? "ask_connected" : "ask_not_connected", locale)}
                        </span>
                        {message.result.connection_result.connected && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-muted-foreground">
                            {message.result.connection_result.path.map((node, i) => (
                              <span key={node.id} className="flex items-center gap-1">
                                {i > 0 && <ArrowRight className="h-2.5 w-2.5" />}
                                <span className="truncate">{node.label}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trend summary */}
                    {message.result?.trend_summary && (
                      <div className="mt-2 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                        {message.result.trend_summary.direction} · {message.result.trend_summary.active_anomalies.length} {t("ask_result_count", locale)}
                      </div>
                    )}

                    {message.result && message.result.matched_cases.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                        {message.result.matched_cases.slice(0, 3).map((caseRecord) => <div key={caseRecord.id} className="flex justify-between gap-2"><span className="truncate">{caseRecord.id}</span><span className="shrink-0">{caseRecord.station}</span></div>)}
                      </div>
                    )}

                    {/* Reasoning trace — the visible plan -> execute -> observe -> answer loop */}
                    {message.result?.trace && message.result.trace.length > 0 && (
                      <div className="mt-2.5 border-t border-border pt-2">
                        <button
                          type="button"
                          onClick={() => toggleTrace(message.id)}
                          className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          {t(expandedTraces.has(message.id) ? "ask_trace_hide" : "ask_trace_toggle", locale)}
                        </button>
                        {expandedTraces.has(message.id) && (
                          <ol className="mt-1.5 space-y-1 border-l border-border pl-2.5">
                            {message.result.trace.map((step, i) => (
                              <li key={i} className="font-mono text-[9.5px] leading-relaxed text-muted-foreground">
                                <span className="font-semibold uppercase text-foreground/70">{t(TRACE_STEP_LABELS[step.step] ?? "ask_trace_execute", locale)}</span>
                                {step.tool && <span> · {step.tool}</span>}
                                {step.detail && <span className="block text-foreground/80">{step.detail}</span>}
                                {step.parameters && (
                                  <span className="block truncate">{JSON.stringify(step.parameters)}</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}

                    {message.result && onNavigate && <button type="button" onClick={() => { onNavigate(message.result!.suggested_view); setChatOpen(false); }} className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">{t("ask_view_results", locale)} <ArrowRight className="h-3 w-3" /></button>}
                  </div>
                ))}
                {asking && <div className="mr-24 flex items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> {t("ask_thinking", locale)}</div>}
              </div>
              <form onSubmit={handleAsk} className="flex shrink-0 items-center gap-2 border-t border-border bg-background/40 p-2.5">
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground" placeholder={t("ask_placeholder", locale)} />
                <button type="submit" disabled={!q.trim() || asking} title={t("ask_send", locale)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
              </form>
          </DialogContent>
        </Dialog>

        {/* PDF Export — triggers SmartBrowz on backend */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title={t("topbar_export_title", locale)}
          className="flex items-center gap-1.5 rounded-md border border-foreground/5 bg-foreground/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{t("topbar_brief", locale)}</span>
        </button>

        {/* Language toggle */}
        <button
          onClick={toggle}
          title={t(locale === "en" ? "topbar_language_en" : "topbar_language_kn", locale)}
          className="flex items-center gap-1.5 rounded-md border border-foreground/5 bg-foreground/[0.02] px-2.5 py-1.5 transition hover:border-primary/30 hover:bg-primary/5"
        >
          <span className="font-mono text-[11px] text-primary">
            {locale === "en" ? "ಕನ್ನಡ" : "EN"}
          </span>
        </button>

        <button
          onClick={toggleTheme}
          title={t(theme === "dark" ? "topbar_theme_dark" : "topbar_theme_light", locale)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-foreground/5 text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t("topbar_logout_tt", locale)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-foreground/5 text-muted-foreground transition hover:border-[var(--danger)]/30 hover:text-[var(--danger)]"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

