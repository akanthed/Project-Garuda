import { useState } from "react";
import { Search, Bell, LogOut, FileDown, Loader2, Sun, Moon, ArrowRight, Bot, Send, AlertTriangle, Share2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { t } from "@/lib/i18n";
import { exportBrief, askGaruda } from "@/lib/mock-api";
import type { AskResponse, KpiMetric } from "@/lib/types";
import type { ViewKey } from "@/components/dashboard/Sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TopBarProps {
  officer: Officer;
  kpis?: KpiMetric[];
  /** Lets "Ask Garuda" jump the dashboard to the view holding matched cases */
  onNavigate?: (view: ViewKey) => void;
}

interface AskMessage {
  query: string;
  response: AskResponse;
}

export function TopBar({ officer, kpis, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [askMessages, setAskMessages] = useState<AskMessage[]>([]);

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

  const handleAsk = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = q.trim();
    if (!query || asking) return;

    setAsking(true);
    setQ("");
    try {
      const { data } = await askGaruda(query);
      setAskMessages((messages) => [...messages, { query, response: data }]);
    } catch {
      toast.error(t("topbar_ask_failed", locale), { description: t("topbar_ask_failed_desc", locale) });
    } finally {
      setAsking(false);
    }
  };

  return (
    <header className="flex min-w-0 items-center justify-between border-b border-white/5 px-3 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {t("topbar_intel", locale)}
        </div>
        <span className="text-white/20">/</span>
        <div className="truncate text-sm font-medium">{t("topbar_overview", locale)}</div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Sheet open={askOpen} onOpenChange={setAskOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              title={t("ask_open", locale)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2.5 text-xs text-primary transition hover:bg-primary/20"
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("ask_open", locale)}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col gap-0 border-white/10 bg-background p-0 sm:max-w-md">
            <SheetHeader className="border-b border-white/5 px-5 py-5 pr-12">
              <SheetTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" />{t("ask_title", locale)}</SheetTitle>
              <SheetDescription className="text-xs leading-relaxed">{t("ask_description", locale)}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {askMessages.length === 0 && (
                <div className="pt-4">
                  <div className="text-sm font-medium">{t("ask_welcome", locale)}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["ask_prompt_1", "ask_prompt_2", "ask_prompt_3"] as const).map((key) => (
                      <button key={key} type="button" onClick={() => setQ(t(key, locale))} className="rounded-md border border-white/10 px-2.5 py-1.5 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                        {t(key, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {askMessages.map(({ query, response }, index) => (
                <div key={`${query}-${index}`} className="space-y-3">
                  <div className="ml-10 rounded-lg bg-primary/15 px-3 py-2 text-xs leading-relaxed text-foreground">{query}</div>
                  <div className="mr-4 rounded-lg border border-white/5 bg-card px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                    {response.answer}
                    {response.matched_cases.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3 font-mono text-[10px]">
                        {response.matched_cases.slice(0, 4).map((caseRecord) => (
                          <div key={caseRecord.id} className="flex items-center justify-between gap-3">
                            <span>{caseRecord.id}</span><span className="truncate">{caseRecord.station}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {onNavigate && response.matched_cases.length > 0 && (
                      <button type="button" onClick={() => { onNavigate(response.suggested_view); setAskOpen(false); }} className="mt-3 flex items-center gap-1 text-[11px] text-primary hover:underline">
                        {t("ask_view_results", locale)} <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {asking && <div className="mr-16 flex items-center gap-2 rounded-lg border border-white/5 bg-card px-3 py-2.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />{t("ask_thinking", locale)}</div>}
            </div>

            <form onSubmit={handleAsk} className="border-t border-white/5 p-4">
              <div className="flex items-end gap-2 rounded-lg border border-white/10 bg-card p-2 focus-within:border-primary/50">
                <Search className="mb-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <textarea value={q} onChange={(event) => setQ(event.target.value)} rows={2} placeholder={t("ask_placeholder", locale)} className="min-h-10 flex-1 resize-none bg-transparent text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60" />
                <button disabled={asking || !q.trim()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary transition hover:bg-primary/25 disabled:opacity-40" title={t("ask_send", locale)}><Send className="h-3.5 w-3.5" /></button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/70">{t("ask_disclaimer", locale)}</p>
            </form>
          </SheetContent>
        </Sheet>

        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={t("topbar_notifications", locale)}
              aria-label={t("topbar_notifications", locale)}
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/5 text-muted-foreground transition hover:border-white/15 hover:text-foreground"
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_6px_var(--danger-glow)]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 border-white/10 bg-background/95 p-0 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div className="text-sm font-medium">{t("topbar_notifications", locale)}</div>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary">{t("topbar_unread", locale)}</span>
            </div>
            <div className="divide-y divide-white/5">
              {[
                { icon: AlertTriangle, tone: "text-[var(--danger)]", titleKey: "topbar_notification_critical", descriptionKey: "topbar_notification_critical_desc", view: "geospatial" as const },
                { icon: Share2, tone: "text-amber-400", titleKey: "topbar_notification_network", descriptionKey: "topbar_notification_network_desc", view: "network" as const },
                { icon: FileText, tone: "text-primary", titleKey: "topbar_notification_report", descriptionKey: "topbar_notification_report_desc", view: "reports" as const },
              ].map(({ icon: Icon, tone, titleKey, descriptionKey, view }) => (
                <button
                  key={titleKey}
                  type="button"
                  onClick={() => { onNavigate?.(view); setNotificationsOpen(false); }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">{t(titleKey, locale)}</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{t(descriptionKey, locale)}</span>
                  </span>
                  <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
            <div className="border-t border-white/5 px-4 py-2.5 text-[10px] text-muted-foreground">{t("topbar_view_alerts", locale)}</div>
          </PopoverContent>
        </Popover>

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
          <span className="hidden 2xl:inline">{t("topbar_brief", locale)}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={t(theme === "dark" ? "topbar_theme_dark" : "topbar_theme_light", locale)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-muted-foreground transition hover:border-primary/30 hover:text-primary"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
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

        {/* Officer identity is available in Settings; keep the header control compact. */}
        <button
          type="button"
          title={officer.name}
          onClick={() => onNavigate?.("settings")}
          className="hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/50 to-primary/10 ring-1 ring-white/10 transition hover:ring-primary/50 lg:flex"
        >
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-primary/10 ring-1 ring-white/10" />
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

