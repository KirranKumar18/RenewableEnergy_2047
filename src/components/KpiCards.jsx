import React from 'react';
import { 
  Zap, 
  IndianRupee, 
  Sun, 
  ShieldCheck, 
  CloudRain, 
  TrendingUp, 
  Leaf 
} from 'lucide-react';

export default function KpiCards({ 
  capacities, 
  financialMetrics, 
  year 
}) {
  const totalGW = (capacities.total / 1000).toFixed(2);
  const totalCapexLakhCr = (financialMetrics.totalCapexCr / 100000).toFixed(2);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* KPI 1: Projected Capacity */}
      <div className="glass-panel-glow rounded-2xl p-4 relative overflow-hidden group">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-125 transition duration-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-emerald-400">Total RE Capacity</span>
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-mono">
            {capacities.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs font-semibold text-emerald-400">MW</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="font-mono text-emerald-300 font-bold">{totalGW} GW</span>
          <span className="text-slate-500">Target Year {year}</span>
        </div>
      </div>

      {/* KPI 2: Total CAPEX */}
      <div className="glass-panel rounded-2xl p-4 relative overflow-hidden group hover:border-amber-500/40 transition">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:scale-125 transition duration-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-amber-400">Estimated CAPEX</span>
          <IndianRupee className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-mono">
            ₹{financialMetrics.totalCapexCr.toLocaleString('en-IN')}
          </span>
          <span className="text-xs font-semibold text-amber-400">Cr</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="font-mono text-amber-300 font-bold">₹{totalCapexLakhCr} Lakh Cr</span>
          <span className="text-slate-500">CERC Benchmarks</span>
        </div>
      </div>

      {/* KPI 3: Annual Generation */}
      <div className="glass-panel rounded-2xl p-4 relative overflow-hidden group hover:border-cyan-500/40 transition">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:scale-125 transition duration-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-cyan-400">Annual Clean Gen</span>
          <Sun className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-mono">
            {financialMetrics.totalGenerationGWh.toLocaleString('en-IN')}
          </span>
          <span className="text-xs font-semibold text-cyan-400">GWh</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="font-mono text-cyan-300 font-bold">
            {(financialMetrics.totalGenerationGWh).toLocaleString('en-IN')} MU
          </span>
          <span className="text-slate-500">CUF-weighted</span>
        </div>
      </div>

      {/* KPI 4: Blended LCOE */}
      <div className="glass-panel rounded-2xl p-4 relative overflow-hidden group hover:border-blue-500/40 transition">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:scale-125 transition duration-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-blue-400">Blended LCOE</span>
          <ShieldCheck className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-mono">
            ₹{financialMetrics.blendedLcoe}
          </span>
          <span className="text-xs font-semibold text-blue-400">/ kWh</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="font-mono text-blue-300 font-bold">Low Tariffs</span>
          <span className="text-slate-500">Levelized Cost</span>
        </div>
      </div>

      {/* KPI 5: CO2 Abatement */}
      <div className="glass-panel rounded-2xl p-4 relative overflow-hidden group hover:border-emerald-500/40 transition">
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-125 transition duration-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-semibold text-emerald-400">CO₂ Avoided</span>
          <Leaf className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight font-mono">
            {financialMetrics.totalCo2OffsetMTons}
          </span>
          <span className="text-xs font-semibold text-emerald-400">MT/yr</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
          <span className="font-mono text-emerald-300 font-bold">0.82 t/MWh</span>
          <span className="text-slate-500">Green Impact</span>
        </div>
      </div>
    </div>
  );
}
