import { LayoutDashboard, Globe2, Share2, FileText, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Globe2, label: "Geospatial" },
  { icon: Share2, label: "Network" },
  { icon: FileText, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-14 flex-col items-center justify-between border-r border-white/5 bg-sidebar py-4">
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/30">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <nav className="flex flex-col items-center gap-1.5">
          {nav.map(({ icon: Icon, label, active }) => (
            <button
              key={label}
              title={label}
              className={cn(
                "group relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-white/5",
                active && "text-foreground bg-white/5"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {active && (
                <span className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 ring-1 ring-white/10" />
    </aside>
  );
}
