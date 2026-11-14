import React from 'react';
import { Zap, IndianRupee, Sun, Gauge } from 'lucide-react';

export default function KpiStrip({ data, loading }) {
  if (!data || loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 animate-pulse">
            <div className="h-3 w-20 bg-slate-800 rounded mb-3" />
            <div className="h-7 w-28 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cap = data.predicted_capacity_mw || {};
  const fin = data.financial_analysis || {};

  const cards = [
    {
      label: 'Total Capacity',
      value: `${(cap.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      unit: 'MW',
      sub: `${((cap.total||0)/1000).toFixed(2)} GW`,
      icon: Zap,
      accent: 'emerald',
    },
    {
      label: 'Annual Generation',
      value: `${(fin.totalGenerationGWh || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      unit: 'GWh',
      sub: `${(fin.totalGenerationGWh || 0).toLocaleString('en-IN')} MU`,
      icon: Sun,
      accent: 'cyan',
    },
    {
      label: 'Total CAPEX',
      value: `₹${(fin.totalCapexCr || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      unit: 'Cr',
      sub: `₹${((fin.totalCapexCr||0)/1e5).toFixed(2)} Lakh Cr`,
      icon: IndianRupee,
      accent: 'amber',
    },
    {
      label: 'Blended Tariff',
      value: `₹${(fin.blendedLcoe || 0).toFixed(2)}`,
      unit: '/kWh',
      sub: 'Levelized Cost of Energy',
      icon: Gauge,
      accent: 'blue',
    },
  ];

  const accentMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-emerald-500/10', border: 'border-emerald-500/25' },
    cyan:    { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    glow: 'shadow-cyan-500/10',    border: 'border-cyan-500/25' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   glow: 'shadow-amber-500/10',   border: 'border-amber-500/25' },
    blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-400',    glow: 'shadow-blue-500/10',    border: 'border-blue-500/25' },
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c, i) => {
        const a = accentMap[c.accent];
        const Icon = c.icon;
        return (
          <div key={i} className={`bg-slate-900/80 border ${a.border} rounded-xl p-4 shadow-lg ${a.glow} group hover:scale-[1.02] transition-transform`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[11px] font-semibold ${a.text}`}>{c.label}</span>
              <Icon className={`w-4 h-4 ${a.text}`} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-white font-mono tracking-tight">{c.value}</span>
              <span className={`text-xs font-semibold ${a.text}`}>{c.unit}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 font-mono">{c.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
