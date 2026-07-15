import React from 'react';

const colorMap = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', glow: 'hover:shadow-blue-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', glow: 'hover:shadow-emerald-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', glow: 'hover:shadow-purple-500/20' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', glow: 'hover:shadow-orange-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-500', glow: 'hover:shadow-amber-500/20' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', glow: 'hover:shadow-cyan-500/20' },
  red: { bg: 'bg-red-500/10', text: 'text-red-500', glow: 'hover:shadow-red-500/20' },
};

export default function MetricCard({ label, value, icon: Icon, color = 'blue', loading, sublabel }) {
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`bg-card rounded-xl border border-border p-4 lg:p-5 backdrop-blur-sm transition-all hover:scale-[1.03] hover:shadow-lg ${c.glow}`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          {loading ? (
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
          ) : (
            <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${c.text}`} />
          )}
        </div>
      </div>
      <p className="text-xl lg:text-2xl font-bold text-foreground tabular-nums">
        {loading ? '—' : value}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sublabel && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
    </div>
  );
}