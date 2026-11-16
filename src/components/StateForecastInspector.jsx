import React from 'react';
import { getStateForecast, STATE_TO_ZONE, ZONE_COLORS } from '../data/stateMapping';
import { Zap, Sun, Wind, Leaf, Droplets, Recycle, IndianRupee, Gauge } from 'lucide-react';

export default function StateForecastInspector({
  hoveredState,
  selectedState,
  selectedZone,
  year = 2028,
  livePrediction
}) {
  // If user is hovering a state, show that state's forecast; otherwise show selected state/zone
  const activeState = hoveredState || selectedState;
  const isHovering = Boolean(hoveredState);

  // Compute forecast preview for activeState
  let forecastData = null;
  const zone = activeState ? STATE_TO_ZONE[activeState] : selectedZone;
  const zc = ZONE_COLORS[zone] || { fill: '#059669', lightBg: '#ecfdf5', textColor: '#065f46' };

  if (activeState) {
    forecastData = getStateForecast(activeState, zone, year);
  } else if (livePrediction) {
    const cap = livePrediction.predicted_capacity_mw || {};
    const fin = livePrediction.financial_analysis || {};
    forecastData = {
      state: 'Entire Zone',
      zone: selectedZone,
      year,
      totalMW: cap.total || 0,
      totalGW: ((cap.total || 0) / 1000).toFixed(2),
      totalCapexCr: fin.totalCapexCr || 0,
      totalGenerationGWh: fin.totalGenerationGWh || 0,
      blendedLcoe: fin.blendedLcoe || 3.10,
      breakdown: (fin.breakdown || []).map(b => ({
        id: b.id,
        name: b.name,
        mw: b.mw,
        color: b.color,
        sharePct: b.sharePct
      }))
    };
  }

  if (!forecastData) {
    return (
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-4 shadow-md w-72 text-center text-xs text-slate-500">
        Hover over any state on the map to preview forecast
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl p-4 shadow-lg w-80 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isHovering ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {isHovering ? 'Live Hover Preview' : 'Active Selection'}
          </span>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: zc.lightBg, color: zc.textColor }}
        >
          {zone} Zone
        </span>
      </div>

      {/* State Name & Year */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <h4 className="text-base font-extrabold text-slate-900 tracking-tight truncate max-w-[190px]">
          {activeState || `${selectedZone} Zone (All)`}
        </h4>
        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
          {year}
        </span>
      </div>

      {/* Primary Total Capacity */}
      <div className="mt-2.5 bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-semibold text-slate-500 block">Total RE Capacity</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              {forecastData.totalMW.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs font-bold text-emerald-600">MW</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block font-medium">Gigawatts</span>
          <span className="text-base font-extrabold text-emerald-700 font-mono">
            {forecastData.totalGW} GW
          </span>
        </div>
      </div>

      {/* Stacked Share Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
          <span>Technology Mix</span>
          <span>{forecastData.breakdown?.length || 5} Sources</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 flex overflow-hidden">
          {forecastData.breakdown?.map(b => (
            <div
              key={b.id}
              style={{
                width: `${Math.max(2, b.sharePct || (b.mw / Math.max(1, forecastData.totalMW) * 100))}%`,
                backgroundColor: b.color
              }}
              title={`${b.name}: ${b.mw} MW`}
            />
          ))}
        </div>
      </div>

      {/* Mini 5 Sources Grid */}
      <div className="mt-2.5 space-y-1 text-[11px]">
        {forecastData.breakdown?.map(b => (
          <div key={b.id} className="flex items-center justify-between py-0.5">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: b.color }} />
              <span className="truncate max-w-[130px]">{b.name}</span>
            </span>
            <span className="font-mono font-bold text-slate-800">
              {Math.round(b.mw).toLocaleString('en-IN')} MW
            </span>
          </div>
        ))}
      </div>

      {/* Financial Metrics Strip */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-2">
          <span className="text-[10px] font-semibold text-amber-800 block">Est. CAPEX</span>
          <span className="text-xs font-extrabold text-amber-900 font-mono">
            ₹{forecastData.totalCapexCr.toLocaleString('en-IN')} Cr
          </span>
        </div>
        <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2">
          <span className="text-[10px] font-semibold text-blue-800 block">Unit Tariff</span>
          <span className="text-xs font-extrabold text-blue-900 font-mono">
            ₹{forecastData.blendedLcoe}/kWh
          </span>
        </div>
      </div>
    </div>
  );
}
