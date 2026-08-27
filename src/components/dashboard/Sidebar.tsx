import { useState } from "react";
import { LayoutDashboard, Globe2, Share2, FileText, Settings, ChevronRight, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { GarudaLogo } from "@/components/GarudaLogo";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { t, type TranslationKey } from "@/lib/i18n";

export type ViewKey = "dashboard" | "geospatial" | "network" | "simulator" | "reports" | "settings";

const nav: { key: ViewKey; icon: LucideIcon; labelKey: TranslationKey }[] = [
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
  fieldMode?: boolean;
}

export function Sidebar({ active, onChange, fieldMode = false }: SidebarProps) {
  const { locale } = useLanguage();
  const [collapsed, setCollapsed] = useState(true);
  const visibleNav = fieldMode
    ? nav.filter(({ key }) => ["dashboard", "geospatial", "reports", "settings"].includes(key))
    : nav;

  return (
    <>
    <aside
      className={cn(
        "relative hidden h-screen flex-col justify-between border-r border-foreground/5 bg-sidebar py-4 transition-[width] duration-200 sm:flex",
        collapsed ? "w-14 items-center" : "w-48 items-stretch"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className={cn("flex flex-col gap-5", collapsed ? "items-center" : "px-3")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <GarudaLogo className="h-9 w-9 shrink-0 rounded-md shadow-sm ring-1 ring-primary/20" />
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
            aria-label={t(collapsed ? "settings_expand_sidebar" : "settings_collapse_sidebar", locale)}
            aria-expanded={!collapsed}
            title={t(collapsed ? "settings_expand_sidebar" : "settings_collapse_sidebar", locale)}
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
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
          {visibleNav.map(({ key, icon: Icon, labelKey }) => {
            const label = t(labelKey, locale);
            const isActive = key === active;
            return (
              <button
                key={key}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? label : undefined}
                onClick={() => onChange(key)}
                className={cn(
                  "group relative flex h-9 items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground",
                  collapsed ? "w-9 justify-center" : "w-full gap-3 px-2.5",
                  isActive && "bg-foreground/5 text-foreground"
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

    </aside>
    <nav className={cn(
      "fixed inset-x-0 bottom-0 z-50 grid h-16 border-t border-foreground/10 bg-sidebar/95 px-1 backdrop-blur sm:hidden",
      fieldMode ? "grid-cols-4" : "grid-cols-6"
    )}>
      {visibleNav.map(({ key, icon: Icon, labelKey }) => {
        const label = t(labelKey, locale);
        const isActive = key === active;
        return (
          <button key={key} type="button" onClick={() => onChange(key)} aria-label={label} aria-current={isActive ? "page" : undefined} className={cn("flex min-w-0 min-h-12 flex-col items-center justify-center gap-1 px-0.5 text-[10px]", isActive ? "text-primary" : "text-muted-foreground")}>
            <Icon className="h-5 w-5" />
            <span className="w-full truncate text-center">{label}</span>
          </button>
        );
      })}
    </nav>
    </>
  );
}

