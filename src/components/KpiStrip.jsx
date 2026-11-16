import React from 'react';
import { Zap, IndianRupee, Sun, Gauge, TrendingUp } from 'lucide-react';

export default function KpiStrip({ data, loading }) {
  if (!data || loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm animate-pulse">
            <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
            <div className="h-8 w-32 bg-slate-200 rounded mb-2" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cap = data.predicted_capacity_mw || {};
  const fin = data.financial_analysis || {};

  const cards = [
    {
      label: 'Total Predicted Capacity',
      value: (cap.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      unit: 'MW',
      sub: `${((cap.total || 0) / 1000).toFixed(2)} GW Projected`,
      icon: Zap,
      accent: 'emerald',
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      badge: 'All 5 Sources',
    },
    {
      label: 'Annual Generation',
      value: (fin.totalGenerationGWh || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }),
      unit: 'GWh',
      sub: `${(fin.totalGenerationGWh || 0).toLocaleString('en-IN')} Million Units (MU)`,
      icon: Sun,
      accent: 'sky',
      iconBg: 'bg-sky-50 text-sky-600 border-sky-100',
      badge: 'CUF Weighted',
    },
    {
      label: 'Total Setup Cost (CAPEX)',
      value: `₹${(fin.totalCapexCr || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
      unit: 'Cr',
      sub: `₹${((fin.totalCapexCr || 0) / 1e5).toFixed(2)} Lakh Crore`,
      icon: IndianRupee,
      accent: 'amber',
      iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
      badge: 'CERC Benchmarks',
    },
    {
      label: 'Blended Unit Tariff',
      value: `₹${(fin.blendedLcoe || 0).toFixed(2)}`,
      unit: '/kWh',
      sub: 'Levelized Cost of Energy',
      icon: Gauge,
      accent: 'blue',
      iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
      badge: 'Levelized LCOE',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {c.label}
              </span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${c.iconBg}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {c.value}
              </span>
              <span className="text-xs font-bold text-slate-600">
                {c.unit}
              </span>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium font-mono text-[11px] truncate">
                {c.sub}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 flex-shrink-0">
                {c.badge}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
