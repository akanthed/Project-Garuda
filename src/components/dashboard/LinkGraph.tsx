const nodes = [
  { id: "A", x: 50, y: 50, r: 14, label: "R. Shetty", risk: "high" },
  { id: "B", x: 22, y: 22, r: 8, label: "A. Iyer" },
  { id: "C", x: 82, y: 26, r: 9, label: "S. Nair" },
  { id: "D", x: 18, y: 78, r: 7, label: "Node-BLR9" },
  { id: "E", x: 84, y: 76, r: 10, label: "K. Reddy", risk: "med" },
  { id: "F", x: 50, y: 12, r: 6, label: "acc_112" },
  { id: "G", x: 50, y: 88, r: 6, label: "acc_87" },
];

const edges = [
  ["A", "B"], ["A", "C"], ["A", "D"], ["A", "E"], ["A", "F"], ["A", "G"],
  ["B", "F"], ["C", "E"], ["D", "G"],
];

const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

export function LinkGraph() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/5 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Criminal Link Analysis
          </div>
          <div className="mt-0.5 text-sm font-medium">Cluster · BLR-Δ7</div>
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">7 nodes · 9 edges</div>
      </div>

      <div className="relative flex-1">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          {edges.map(([a, b], i) => {
            const na = byId[a];
            const nb = byId[b];
            return (
              <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="rgba(120,150,220,0.35)" strokeWidth="0.2" />
            );
          })}
          {nodes.map((n) => {
            const color = n.risk === "high" ? "var(--danger)" : n.risk === "med" ? "var(--warning)" : "var(--electric)";
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={n.r / 3} fill={color} opacity="0.2" />
                <circle cx={n.x} cy={n.y} r={n.r / 6} fill={color} />
                <text x={n.x} y={n.y + n.r / 3 + 2.5} textAnchor="middle" fill="rgba(230,235,245,0.65)" fontSize="2.2" fontFamily="ui-monospace, monospace">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="absolute bottom-3 left-3 flex gap-3 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />HIGH</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />MED</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--electric)]" />LOW</span>
        </div>
      </div>
    </div>
  );
}
