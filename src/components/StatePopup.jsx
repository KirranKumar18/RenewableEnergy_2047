import React from 'react';
import { X, CheckCircle, ExternalLink } from 'lucide-react';

/**
 * Floating summary modal card that appears when a state is clicked on the map.
 * Styled in clean executive light theme.
 */
export default function StatePopup({ data, stateName, zone, onClose }) {
  if (!data) return null;
  const cap = data.predicted_capacity_mw || {};
  const fin = data.financial_analysis || {};
  const bd = fin.breakdown || [];

  const totalOpex = bd.reduce((acc, b) => acc + (b.opexCr || 0), 0);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-84 pointer-events-auto animate-in slide-in-from-top-2 duration-300">
      <div className="bg-white/98 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-xl shadow-slate-900/10">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">{stateName}</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                {zone} Zone
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Target Forecast Horizon: {data.inputs?.year}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition -mt-1 -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Metric Cells */}
        <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5">
            <span className="text-[10px] font-semibold uppercase text-emerald-700 block">Total RE Capacity</span>
            <span className="font-mono font-black text-sm text-emerald-950 block mt-0.5">
              {(cap.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} MW
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold">{((cap.total || 0) / 1000).toFixed(2)} GW</span>
          </div>

          <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-2.5">
            <span className="text-[10px] font-semibold uppercase text-amber-700 block">Capital Cost (CAPEX)</span>
            <span className="font-mono font-black text-sm text-amber-950 block mt-0.5">
              ₹{(fin.totalCapexCr || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
            </span>
            <span className="text-[10px] text-amber-600 font-semibold">CERC Benchmark</span>
          </div>

          <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-2.5">
            <span className="text-[10px] font-semibold uppercase text-sky-700 block">Annual Prod (OPEX)</span>
            <span className="font-mono font-black text-sm text-sky-950 block mt-0.5">
              ₹{totalOpex.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr/yr
            </span>
            <span className="text-[10px] text-sky-600 font-semibold">Production Cost</span>
          </div>

          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5">
            <span className="text-[10px] font-semibold uppercase text-blue-700 block">Blended Unit Tariff</span>
            <span className="font-mono font-black text-sm text-blue-950 block mt-0.5">
              ₹{(fin.blendedLcoe || 0).toFixed(2)}/kWh
            </span>
            <span className="text-[10px] text-blue-600 font-semibold">Levelized LCOE</span>
          </div>
        </div>

        {/* Source breakdown bars */}
        <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Capacity Distribution (MW)
          </div>
          {bd.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: b.color }} />
              <span className="text-slate-600 font-medium flex-1 truncate">{b.name}</span>
              <span className="font-mono font-bold text-slate-800">{b.mw.toLocaleString('en-IN')} MW</span>
              <span className="text-slate-400 font-mono text-[11px] w-10 text-right">{b.sharePct}%</span>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-2 text-[10px] text-slate-400 text-center font-mono border-t border-slate-100">
          Source: {data.model_used}
        </div>
      </div>
    </div>
  );
}
