import { useState } from "react";
import { LayoutDashboard, Globe2, Share2, FileText, Settings, Shield, ChevronRight, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, type TranslationKey } from "@/lib/i18n";

export type ViewKey = "dashboard" | "geospatial" | "network" | "simulator" | "reports" | "settings";

const nav: { key: ViewKey; icon: typeof Shield; labelKey: TranslationKey }[] = [
  { key: "dashboard", icon: LayoutDashboard, labelKey: "nav_dashboard" },
  { key: "geospatial", icon: Globe2,          labelKey: "nav_geospatial" },
  { key: "network",    icon: Share2,           labelKey: "nav_network" },
  { key: "simulator",  icon: SlidersHorizontal, labelKey: "nav_simulator" },
  { key: "reports",    icon: FileText,         labelKey: "nav_reports" },
  { key: "settings",   icon: Settings,         labelKey: "nav_settings" },
];

interface SidebarProps {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const { locale } = useLanguage();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col justify-between border-r border-white/5 bg-sidebar py-4 transition-[width] duration-200",
        collapsed ? "w-14 items-center" : "w-48 items-stretch"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn("flex flex-col gap-5", collapsed ? "items-center" : "px-3")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="ml-2 flex-1 min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary truncate">
                Garuda
              </div>
              <div className="font-mono text-[9px] text-muted-foreground truncate">BLR · KSP</div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={t(collapsed ? "settings_expand_sidebar" : "settings_collapse_sidebar", locale)}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
              collapsed && "mt-0"
            )}
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform duration-200", !collapsed && "rotate-180")}
            />
          </button>
        </div>

        {/* Nav items */}
        <nav className={cn("flex flex-col gap-1", collapsed ? "items-center" : "items-stretch")}>
          {nav.map(({ key, icon: Icon, labelKey }) => {
            const label = t(labelKey, locale);
            const isActive = key === active;
            return (
              <button
                key={key}
                title={collapsed ? label : undefined}
                onClick={() => onChange(key)}
                className={cn(
                  "group relative flex h-9 items-center rounded-md text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
                  collapsed ? "w-9 justify-center" : "w-full gap-3 px-2.5",
                  isActive && "bg-white/5 text-foreground"
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute -left-[1px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {!collapsed && (
                  <span className="truncate text-sm">{label}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Profile avatar */}
      <div className={cn(collapsed ? "flex justify-center" : "px-3")}>
        <button
          title={t("nav_settings", locale)}
          onClick={() => onChange("settings")}
          className={cn(
            "flex items-center gap-2.5 rounded-md transition hover:bg-white/5",
            collapsed ? "h-9 w-9 justify-center" : "w-full px-2 py-1.5"
          )}
        >
          <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/10 transition hover:ring-primary/40" />
          {!collapsed && (
            <div className="min-w-0 text-left">
              <div className="truncate text-xs font-medium">Profile</div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {t("nav_settings", locale)}
              </div>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}

