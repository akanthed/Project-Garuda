import { useState } from "react";
import { Search, Bell, Command, LogOut, FileDown, Loader2, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { logout, type Officer } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { t } from "@/lib/i18n";
import { exportBrief } from "@/lib/mock-api";
import type { KpiMetric } from "@/lib/types";

interface TopBarProps {
  officer: Officer;
  kpis?: KpiMetric[];
}

export function TopBar({ officer, kpis }: TopBarProps) {
  const navigate = useNavigate();
  const { locale, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleLogout = () => {
    logout();
    toast("Session ended", { description: "Redirecting to auth portal…" });
    navigate({ to: "/login" });
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    toast("Generating Intelligence Brief…", { description: "Powered by Zoho Catalyst SmartBrowz" });
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
      toast.success("Intelligence Brief downloaded", { description: "garuda-intel-brief.pdf" });
    } catch (err) {
      toast.error("Export failed", {
        description: "Backend required. Set VITE_API_URL to enable PDF export.",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-white/5 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {t("topbar_intel", locale)}
        </div>
        <span className="text-white/20">/</span>
        <div className="text-sm font-medium">{t("topbar_overview", locale)}</div>
        <span className="ml-2 flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_8px_var(--danger-glow)]" />
          {t("topbar_threatcon", locale)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!q.trim()) return;
            toast(`Searching "${q}"`, { description: "Querying BLR intel indexes…" });
            setQ("");
          }}
          className="flex w-72 items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground focus-within:border-white/15"
        >
          <Search className="h-3.5 w-3.5" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
            placeholder={t("topbar_search", locale)}
          />
          <span className="flex items-center gap-0.5 rounded border border-white/5 px-1 py-0.5 font-mono text-[10px]">
            <Command className="h-2.5 w-2.5" />K
          </span>
        </form>

        <button
          onClick={() =>
            toast("3 new alerts", { description: "High-risk activity in Whitefield and KR Market." })
          }
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/5 text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_6px_var(--danger-glow)]" />
        </button>

        {/* PDF Export — triggers SmartBrowz on backend */}
        <button
          onClick={handleExport}
          disabled={exporting}
          title="Generate Intelligence Brief (PDF)"
          className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{t("topbar_brief", locale)}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-muted-foreground transition hover:border-primary/30 hover:text-primary"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        {/* Language toggle */}
        <button
          onClick={toggle}
          title={locale === "en" ? "Switch to Kannada" : "Switch to English"}
          className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 transition hover:border-primary/30 hover:bg-primary/5"
        >
          <span className="font-mono text-[11px] text-primary">
            {locale === "en" ? "ಕನ್ನಡ" : "EN"}
          </span>
        </button>

        {/* Officer identity */}
        <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-primary/10 ring-1 ring-white/10" />
          <div className="text-left text-xs leading-tight">
            <div className="font-medium">{officer.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {officer.clearance} · {officer.node}
            </div>
          </div>
        </div>

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

