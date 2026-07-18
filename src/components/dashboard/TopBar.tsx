import { useState } from "react";
import { Search, Bot, LogOut, FileDown, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import { exportBrief, askGaruda } from "@/lib/mock-api";
import type { AskResponse, KpiMetric } from "@/lib/types";
import type { ViewKey } from "@/components/dashboard/Sidebar";

interface TopBarProps {
  officer: Officer;
  kpis?: KpiMetric[];
  /** Lets "Ask Garuda" jump the dashboard to the view holding matched cases */
  onNavigate?: (view: ViewKey) => void;
}

export function TopBar({ officer, kpis, onNavigate }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);

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
          {t("topbar_intel", locale)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!q.trim() || asking) return;
            setAsking(true);
            setAskResult(null);
            try {
              const { data } = await askGaruda(q);
              setAskResult(data);
            } catch {
              toast.error(t("topbar_ask_failed", locale), { description: t("topbar_ask_failed_desc", locale) });
            } finally {
              setAsking(false);
            }
          }}
          className="relative hidden w-80 items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-1.5 text-xs text-muted-foreground focus-within:border-primary/50 md:flex"
        >
          {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder={t("ask_placeholder", locale)}
          />
          <span className="hidden rounded border border-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-primary lg:inline">
            {t("topbar_ask_label", locale)}
          </span>

          {askResult && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-lg border border-white/10 bg-background/95 p-3 text-left shadow-xl backdrop-blur-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-foreground">{askResult.answer}</p>
                <button
                  type="button"
                  onClick={() => setAskResult(null)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
              {askResult.matched_cases.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/5 pt-2">
                  {askResult.matched_cases.slice(0, 4).map((c) => (
                    <div key={c.id} className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span className="truncate">{c.id}</span>
                      <span>{c.station}</span>
                    </div>
                  ))}
                </div>
              )}
              {onNavigate && askResult.matched_cases.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(askResult.suggested_view);
                    setAskResult(null);
                  }}
                  className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  {t("ask_view_results", locale)} <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </form>

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

