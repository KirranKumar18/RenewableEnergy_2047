import React from 'react';
import { X } from 'lucide-react';

/**
 * Floating popup card that appears over the map when a state is clicked.
 * Shows prediction summary — state name, zone, total MW, CAPEX, OPEX, tariff.
 */
export default function StatePopup({ data, stateName, zone, onClose }) {
  if (!data) return null;
  const cap = data.predicted_capacity_mw || {};
  const fin = data.financial_analysis || {};
  const bd = fin.breakdown || [];

  // Total annual OPEX = sum of each source's opexCr
  const totalOpex = bd.reduce((acc, b) => acc + (b.opexCr || 0), 0);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-80 pointer-events-auto animate-in slide-in-from-top-2 duration-300">
      <div className="bg-slate-950/95 backdrop-blur-xl border border-slate-700 rounded-2xl p-4 shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-base font-extrabold text-white leading-tight">{stateName}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{zone} Zone • Year {data.inputs?.year}</p>
          </div>
          <button onClick={onClose}
            className="p-1 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid of metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MetricCell label="Total RE Capacity" value={`${(cap.total||0).toLocaleString('en-IN',{maximumFractionDigits:0})} MW`} accent="emerald" />
          <MetricCell label="Setup Cost (CAPEX)" value={`₹${(fin.totalCapexCr||0).toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`} accent="amber" />
          <MetricCell label="Annual Prod Cost" value={`₹${totalOpex.toLocaleString('en-IN',{maximumFractionDigits:0})} Cr/yr`} accent="cyan" />
          <MetricCell label="Blended Tariff" value={`₹${(fin.blendedLcoe||0).toFixed(2)}/kWh`} accent="blue" />
        </div>

        {/* Mini source bars */}
        <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
          {bd.map(b => (
            <div key={b.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: b.color }} />
              <span className="text-slate-400 flex-1 truncate">{b.name}</span>
              <span className="font-mono font-semibold text-slate-200">{b.mw.toLocaleString('en-IN')} MW</span>
              <span className="text-slate-500 w-10 text-right">{b.sharePct}%</span>
            </div>
          ))}
        </div>

        <div className="mt-2 text-[10px] text-emerald-400/60 text-center font-mono">
          Powered by india_energy_forecast_model.pkl
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, accent }) {
  const colors = {
    emerald: 'border-emerald-500/20 text-emerald-300',
    amber: 'border-amber-500/20 text-amber-300',
    cyan: 'border-cyan-500/20 text-cyan-300',
    blue: 'border-blue-500/20 text-blue-300',
  };
  return (
    <div className={`bg-slate-900/80 border ${colors[accent]} rounded-lg p-2`}>
      <span className="text-[10px] text-slate-500 block">{label}</span>
      <span className={`font-mono font-bold ${colors[accent]?.split(' ')[1]}`}>{value}</span>
    </div>
  );
}
