import { Search, Bell, Command } from "lucide-react";

export function TopBar() {
  return (
    <header className="flex items-center justify-between border-b border-white/5 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Intel / Metro
        </div>
        <span className="text-white/20">/</span>
        <div className="text-sm font-medium">Overview</div>
        <span className="ml-2 flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_8px_var(--danger-glow)]" />
          THREATCON · CHARLIE
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex w-72 items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <input
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
            placeholder="Search entities, cases, coordinates…"
          />
          <span className="flex items-center gap-0.5 rounded border border-white/5 px-1 py-0.5 font-mono text-[10px]">
            <Command className="h-2.5 w-2.5" />K
          </span>
        </div>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-md border border-white/5 text-muted-foreground hover:text-foreground">
          <Bell className="h-3.5 w-3.5" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--danger)] shadow-[0_0_6px_var(--danger-glow)]" />
        </button>
        <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-primary/10 ring-1 ring-white/10" />
          <div className="text-xs leading-tight">
            <div className="font-medium">Cpt. R. Vance</div>
            <div className="font-mono text-[10px] text-muted-foreground">CLR-7 · Node A1</div>
          </div>
        </div>
      </div>
    </header>
  );
}
