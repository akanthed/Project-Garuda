import { useState } from "react";
import { Bot, LogOut, FileDown, Loader2, ArrowRight, Moon, Sun, Send } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { t } from "@/lib/i18n";
import { exportBrief, askGaruda } from "@/lib/mock-api";
import type { AskResponse, KpiMetric } from "@/lib/types";
import type { ViewKey } from "@/components/dashboard/Sidebar";

interface TopBarProps {
  officer: Officer;
  kpis?: KpiMetric[];
  activeViewLabel: string;
  /** Lets "Ask Garuda" jump the dashboard to the view holding matched cases */
  onNavigate?: (view: ViewKey) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AskResponse;
}

export function TopBar({ officer, kpis, activeViewLabel, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);

  const handleLogout = () => {
    logout();
    toast(t("settings_session_ended", locale), { description: t("settings_redirecting", locale) });
    navigate({ to: "/login" });
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    toast(t("topbar_exporting", locale), { description: t("topbar_export_service", locale) });
    try {
      const kpiMap = Object.fromEntries((kpis ?? []).map((k) => [k.label, k.value]));
      const hotspotValue = kpis?.find((k) => k.id === "hotspot-alerts")?.value;
      const blob = await exportBrief({
        kpis: Object.keys(kpiMap).length > 0 ? kpiMap : {
          "Criminal Nodes": "1,284",
          "Hotspot Alerts": "27",
          "Risk Volatility": "0.74",
          "Resource Readiness": "92%",
        },
        hotspot_count: hotspotValue ? parseInt(hotspotValue, 10) || 0 : 27,
        top_crime_types: ["Cyber Crime", "Property Theft", "Narcotics", "Assault"],
        simulation_impact: 58,
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
    <header className="flex min-w-0 items-center justify-between border-b border-white/5 px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {t("topbar_intel", locale)} · {activeViewLabel}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setChatOpen((open) => !open)}
            aria-expanded={chatOpen}
            title={t("topbar_ask_label", locale)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 text-primary transition hover:border-primary/50 hover:bg-primary/10"
          >
            {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            <span className="hidden text-xs font-medium sm:inline">{t("topbar_ask_label", locale)}</span>
          </button>

          {chatOpen && (
            <form
              onSubmit={async (e) => {
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
              }}
              role="dialog"
              aria-label={t("topbar_ask_label", locale)}
              className="absolute right-0 top-[calc(100%+8px)] z-20 flex w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4 text-primary" /> {t("topbar_ask_label", locale)}</div>
                <button type="button" onClick={() => setChatOpen(false)} className="text-muted-foreground transition hover:text-foreground">×</button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                {conversation.length === 0 && (
                  <>
                    <p className="text-xs text-muted-foreground">{t("ask_greeting", locale)}</p>
                    <p className="border-l-2 border-primary/40 pl-2 text-[11px] leading-relaxed text-muted-foreground">{t("ask_explainer", locale)}</p>
                  </>
                )}
                {conversation.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "ml-8 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground" : "mr-4 rounded-md bg-muted px-3 py-2 text-xs text-foreground"}>
                    <p>{message.text}</p>
                    {message.result && message.result.matched_cases.length > 0 && (
                      <>
                        <div className="mt-2 space-y-1 border-t border-border pt-2 font-mono text-[10px] text-muted-foreground">
                          {message.result.matched_cases.slice(0, 3).map((caseRecord) => <div key={caseRecord.id} className="flex justify-between gap-2"><span className="truncate">{caseRecord.id}</span><span className="shrink-0">{caseRecord.station}</span></div>)}
                        </div>
                        {onNavigate && <button type="button" onClick={() => { onNavigate(message.result!.suggested_view); setChatOpen(false); }} className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline">{t("ask_view_results", locale)} <ArrowRight className="h-3 w-3" /></button>}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground" placeholder={t("ask_placeholder", locale)} />
                <button type="submit" disabled={!q.trim() || asking} title={t("ask_send", locale)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
              </div>
            </form>
          )}
        </div>

        {/* PDF Export — triggers SmartBrowz on backend */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title={t("topbar_export_title", locale)}
          className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-50"
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
          className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 transition hover:border-primary/30 hover:bg-primary/5"
        >
          <span className="font-mono text-[11px] text-primary">
            {locale === "en" ? "ಕನ್ನಡ" : "EN"}
          </span>
        </button>

        <button
          onClick={toggleTheme}
          title={t(theme === "dark" ? "topbar_theme_dark" : "topbar_theme_light", locale)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/5 text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title={t("topbar_logout_tt", locale)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/5 text-muted-foreground transition hover:border-[var(--danger)]/30 hover:text-[var(--danger)]"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

