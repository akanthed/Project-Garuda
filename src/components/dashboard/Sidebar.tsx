import { LayoutDashboard, Globe2, Share2, FileText, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewKey = "dashboard" | "geospatial" | "network" | "reports" | "settings";

const nav: { key: ViewKey; icon: typeof Shield; label: string }[] = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "geospatial", icon: Globe2, label: "Geospatial" },
  { key: "network", icon: Share2, label: "Network" },
  { key: "reports", icon: FileText, label: "Reports" },
  { key: "settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="flex h-screen w-14 flex-col items-center justify-between border-r border-white/5 bg-sidebar py-4">
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <nav className="flex flex-col items-center gap-1.5">
          {nav.map(({ key, icon: Icon, label }) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                title={label}
                onClick={() => onChange(key)}
                className={cn(
                  "group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5",
                  isActive && "text-foreground bg-white/5"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {isActive && (
                  <span className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <button
        title="Profile"
        onClick={() => onChange("settings")}
        className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/10 transition hover:ring-primary/40"
      />
    </aside>
  );
}
