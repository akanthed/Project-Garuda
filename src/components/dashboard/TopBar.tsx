import { useEffect, useRef, useState } from "react";
import { Bot, LogOut, FileDown, Loader2, ArrowRight, Mic, Square, Send, Sparkles, ShieldCheck, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScope } from "@/contexts/ScopeContext";
import { useSimulator } from "@/contexts/SimulatorContext";
import { t, districtName, type TranslationKey } from "@/lib/i18n";
import { exportBrief, askGaruda, synthesizeVoice, transcribeVoice } from "@/lib/mock-api";
import { startWavRecording, type WavRecording } from "@/lib/wav-recorder";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  case_brief: "ask_tool_case_brief",
  assess_case_risk: "ask_tool_assess_case_risk",
  summarize_kpis: "ask_tool_summarize_kpis",
  forecast_hotspots: "ask_tool_forecast_hotspots",
  operational_guidance: "ask_tool_operational_guidance",
  app_help: "ask_tool_app_help",
};

const TRACE_STEP_LABELS: Record<string, TranslationKey> = {
  interpret: "ask_trace_interpret",
  execute: "ask_trace_execute",
  observe: "ask_trace_observe",
  answer: "ask_trace_answer",
};

export function speechChunks(text: string, maxLength = 40): string[] {
  const chunks: string[] = [];
  let remaining = text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  while (remaining.length > maxLength) {
    const space = remaining.lastIndexOf(" ", maxLength);
    const splitAt = space > 0 ? space : maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function TopBar({ officer, kpis, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { districtId, districts, setDistrictId } = useScope();
  const { lastImpactPercent } = useSimulator();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wavRecordingRef = useRef<WavRecording | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const answerAudioUrlRef = useRef<string | null>(null);
  const speechRunRef = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation, asking]);

  useEffect(() => () => {
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
    wavRecordingRef.current?.cancel();
    answerAudioRef.current?.pause();
    if (answerAudioUrlRef.current) URL.revokeObjectURL(answerAudioUrlRef.current);
  }, []);

  const stopSpeaking = () => {
    speechRunRef.current += 1;
    answerAudioRef.current?.pause();
    answerAudioRef.current = null;
    if (answerAudioUrlRef.current) URL.revokeObjectURL(answerAudioUrlRef.current);
    answerAudioUrlRef.current = null;
    setSpeakingMessageId(null);
  };

  const handleSpeak = async (message: ChatMessage) => {
    if (speakingMessageId === message.id) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    const speechRun = speechRunRef.current;
    setSpeechLoadingId(message.id);
    try {
      const language = message.result?.language === "kn" ? "kn" : "en";
      for (const chunk of speechChunks(message.text)) {
        const audioBlob = await synthesizeVoice(chunk, language);
        if (speechRun !== speechRunRef.current) return;
        setSpeakingMessageId(message.id);
        setSpeechLoadingId(null);
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        answerAudioRef.current = audio;
        answerAudioUrlRef.current = url;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = reject;
          void audio.play().catch(reject);
        });
        URL.revokeObjectURL(url);
        answerAudioRef.current = null;
        answerAudioUrlRef.current = null;
      }
      if (speechRun === speechRunRef.current) stopSpeaking();
    } catch {
      stopSpeaking();
      toast.error(t("ask_speech_failed", locale));
    } finally {
      setSpeechLoadingId(null);
    }
  };

  const stopRecording = async () => {
    if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
    const activeRecording = wavRecordingRef.current;
    if (!activeRecording) return;
    wavRecordingRef.current = null;
    setRecording(false);
    setTranscribing(true);
    try {
      const audio = await activeRecording.stop();
      const transcript = await transcribeVoice(audio, locale);
      setQ(transcript.text);
      inputRef.current?.focus();
      toast.success(t("ask_voice_ready", locale));
    } catch {
      toast.error(t("ask_voice_failed", locale));
    } finally {
      setTranscribing(false);
    }
  };

  const handleVoice = async () => {
    if (recording) {
      void stopRecording();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      toast.error(t("ask_voice_unavailable", locale));
      return;
    }
    try {
      wavRecordingRef.current = await startWavRecording({ onSilence: () => void stopRecording() });
      setRecording(true);
      recordingTimerRef.current = window.setTimeout(() => void stopRecording(), 15_000);
    } catch {
      toast.error(t("ask_voice_permission", locale));
    }
  };

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
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-foreground/5 px-3 py-3 sm:flex-nowrap sm:px-6">
      <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-3">
        <div className="shrink-0 text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.2em]">
          {t("topbar_intel", locale)}
        </div>
        {officer.designation !== "Constable" && districts.length > 0 && (
          <Select
            value={districtId == null ? "statewide" : String(districtId)}
            onValueChange={(value) => setDistrictId(value === "statewide" ? null : Number(value))}
            disabled={officer.designation === "ACP"}
          >
            <SelectTrigger aria-label={t("topbar_scope_label", locale)} title={t("topbar_scope_label", locale)} className="h-9 min-w-[195px] max-w-[65vw] border-border bg-background/60 px-3 text-xs text-foreground sm:h-9 sm:max-w-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="max-h-80">
              {officer.designation !== "ACP" && <SelectItem value="statewide">{t("topbar_scope_statewide", locale)}</SelectItem>}
              {districts.map((district) => (
                <SelectItem key={district.district_id} value={String(district.district_id)}>
                  {districtName(district, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-1.5 sm:w-auto sm:shrink-0 sm:justify-start sm:gap-2">
        <button
          onClick={() => setChatOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={chatOpen}
          title={t("topbar_ask_label", locale)}
          className="flex h-11 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.04] px-3 text-primary transition hover:border-primary/50 hover:bg-primary/10 sm:h-8 sm:px-2.5"
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
                      {(["ask_sample_hotspots", "ask_sample_network", "ask_sample_compare", "ask_sample_kingpins", "ask_sample_forecast", "ask_sample_help"] as const).map((key) => (
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
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold uppercase ${message.result.knowledge_source === "quickml_rag" || message.result.source === "quickml" || message.result.compute_source === "quickml_pipeline" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                          {(message.result.knowledge_source === "quickml_rag" || message.result.source === "quickml" || message.result.compute_source === "quickml_pipeline") && <Sparkles className="h-2.5 w-2.5" />}
                          {t(message.result.knowledge_source === "quickml_rag" ? "ask_quickml_rag" : message.result.source === "quickml" || message.result.compute_source === "quickml_pipeline" ? "ask_quickml" : "ask_fallback", locale)}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {t("ask_intent_confidence", locale)} {Math.round(message.result.confidence * 100)}%
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 leading-5">{message.text}</p>
                      {message.role === "assistant" && (
                        <button type="button" onClick={() => void handleSpeak(message)} disabled={speechLoadingId === message.id} title={t(speakingMessageId === message.id ? "ask_stop_speaking" : "ask_speak", locale)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50">
                          {speechLoadingId === message.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : speakingMessageId === message.id ? <Square className="h-3 w-3 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                          <span className="sr-only">{t(speakingMessageId === message.id ? "ask_stop_speaking" : "ask_speak", locale)}</span>
                        </button>
                      )}
                    </div>
                    {message.result?.knowledge_source && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px]">
                        <span className="rounded bg-cyan-500/10 px-1.5 py-1 font-semibold uppercase text-cyan-600 dark:text-cyan-400">
                          {t(message.result.knowledge_source === "quickml_rag" ? "ask_quickml_rag" : "ask_local_knowledge", locale)}
                        </span>
                        <span className="text-muted-foreground">{t("ask_prototype_guidance", locale)}</span>
                      </div>
                    )}
                    {message.result?.tool_calls.map((call) => (
                      <div key={call.tool} className="mt-2.5 flex items-center justify-between gap-3 rounded-md border border-emerald-500/15 bg-emerald-500/[0.04] px-2.5 py-2 text-[10px]">
                        <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-3 w-3" /> {t(TOOL_LABELS[call.tool], locale)}</span>
                        {!(["app_help", "operational_guidance"] as const).includes(call.tool as "app_help" | "operational_guidance") && <span className="shrink-0 font-mono text-muted-foreground">{call.result_count.toLocaleString()} {t("ask_result_count", locale)}</span>}
                      </div>
                    ))}
                    {message.result?.citations && message.result.citations.length > 0 && (
                      <div className="mt-2 border-t border-border pt-2">
                        <div className="mb-1 text-[9px] font-semibold uppercase text-muted-foreground">{t("ask_sources", locale)}</div>
                        <div className="flex flex-wrap gap-1">
                          {message.result.citations.map((citation, index) => (
                            <span key={`${citation.source_id}-${index}`} title={citation.title} className="rounded border border-cyan-500/20 bg-cyan-500/[0.05] px-1.5 py-1 font-mono text-[9px] text-cyan-700 dark:text-cyan-300">
                              {citation.source_id} · {citation.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

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
                        {t(message.result.trend_summary.direction === "rising" ? "trend_rising" : message.result.trend_summary.direction === "falling" ? "trend_falling" : "trend_stable", locale)} · {message.result.trend_summary.active_anomalies.length} {t("ask_result_count", locale)}
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

                    {message.result && message.result.tool_calls.length > 0 && onNavigate && <button type="button" onClick={() => { onNavigate(message.result!.suggested_view); setChatOpen(false); }} className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">{t("ask_view_results", locale)} <ArrowRight className="h-3 w-3" /></button>}
                  </div>
                ))}
                {asking && <div className="mr-24 flex items-center gap-2 rounded-md border border-border bg-muted/60 px-3 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> {t("ask_thinking", locale)}</div>}
              </div>
              <form onSubmit={handleAsk} className="flex shrink-0 items-center gap-2 border-t border-border bg-background/40 p-2.5">
                <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground" placeholder={t("ask_placeholder", locale)} />
                <button type="button" onClick={handleVoice} disabled={transcribing || asking} aria-pressed={recording} title={t(recording ? "ask_voice_stop" : "ask_voice_start", locale)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50 ${recording ? "border-red-500/50 bg-red-500/10 text-red-500" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"}`}>
                  {transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : recording ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-3.5 w-3.5" />}
                  <span className="sr-only">{t(recording ? "ask_voice_stop" : "ask_voice_start", locale)}</span>
                </button>
                <button type="submit" disabled={!q.trim() || asking} title={t("ask_send", locale)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
              </form>
          </DialogContent>
        </Dialog>

        {/* PDF Export — triggers SmartBrowz on backend */}
        {officer.canExport && (
          <button
            onClick={handleExport}
            disabled={exporting}
            title={t("topbar_export_title", locale)}
            className="flex h-10 items-center gap-1.5 rounded-md border border-foreground/5 bg-foreground/[0.02] px-2.5 text-xs text-muted-foreground transition hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-50 sm:h-8"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{t("topbar_brief", locale)}</span>
          </button>
        )}

        {/* Language toggle */}
        <button
          onClick={toggle}
          title={t(locale === "en" ? "topbar_language_en" : "topbar_language_kn", locale)}
          className="flex h-11 items-center gap-1.5 rounded-md border border-foreground/5 bg-foreground/[0.02] px-3 transition hover:border-primary/30 hover:bg-primary/5 sm:h-8 sm:px-2.5"
        >
          <span className="font-mono text-[11px] text-primary">
            {locale === "en" ? "ಕನ್ನಡ" : "EN"}
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t("topbar_logout_tt", locale)}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-foreground/5 text-muted-foreground transition hover:border-[var(--danger)]/30 hover:text-[var(--danger)] sm:h-8 sm:w-8"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

