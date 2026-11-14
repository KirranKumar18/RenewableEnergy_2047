import React from 'react';
import { 
  Compass, 
  MapPin, 
  Calendar, 
  Users, 
  Coins, 
  Sparkles, 
  RefreshCw,
  Calculator,
  ArrowRight,
  TrendingUp,
  Layers
} from 'lucide-react';
import { ZONES } from '../data/indiaEnergyData';

export default function InputPanel({
  zone,
  setZone,
  state,
  setState,
  year,
  setYear,
  population,
  setPopulation,
  gsdp,
  setGsdp,
  engineeredFeatures,
  onAutoProjectAll,
  isLiveUpdating
}) {
  const currentZoneData = ZONES[zone] || ZONES['West'];
  const statesInZone = currentZoneData.states || [];

  // Quick milestone buttons
  const milestones = [
    { year: 2026, label: 'Current Base' },
    { year: 2030, label: '500 GW Target' },
    { year: 2035, label: 'Mid Horizon' },
    { year: 2040, label: 'Grid Decarb' },
    { year: 2047, label: 'Net Zero Centenary' }
  ];

  const formatCrores = (val) => {
    const num = Number(val) || 0;
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh Cr`;
    }
    return `₹${num.toLocaleString('en-IN')} Cr`;
  };

  const formatPopulation = (val) => {
    const num = Number(val) || 0;
    if (num >= 10000000) {
      return `${(num / 10000000).toFixed(2)} Crore (${(num / 1000000).toFixed(1)}M)`;
    }
    if (num >= 100000) {
      return `${(num / 100000).toFixed(2)} Lakh`;
    }
    return num.toLocaleString('en-IN');
  };

  return (
    <div className="glass-panel rounded-2xl p-5 lg:p-6 shadow-xl border border-slate-800 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <SlidersIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Dynamic Forecast Parameters
            </h2>
            <p className="text-xs text-slate-400">
              Interactive inputs driving the multi-output ML voting regressor
            </p>
          </div>
        </div>

        <button
          onClick={onAutoProjectAll}
          className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition"
          title="Auto-calculate population and GSDP baseline from 2024 MNRE historical growth trends"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Auto-Project Baseline</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Field 1: Zone */}
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zone (Required)</span>
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              Mult: {currentZoneData.costMultiplier}x
            </span>
          </label>
          <div className="relative">
            <select
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setState(''); // Reset to all states
              }}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
            >
              {Object.keys(ZONES).map((zKey) => (
                <option key={zKey} value={zKey}>
                  {zKey} Zone ({ZONES[zKey].costMultiplier}x Terrain Cost)
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-1">
            {currentZoneData.description}
          </p>
        </div>

        {/* Field 2: State */}
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>State (Optional)</span>
            </span>
            <span className="text-[11px] text-slate-400">
              {statesInZone.length} states in {zone}
            </span>
          </label>
          <div className="relative">
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition"
            >
              <option value="">Entire Zone / All States (Auto-Distributed)</option>
              {statesInZone.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-1">
            {state ? `Isolating forecast for ${state}` : `Distributes across all states in ${zone} Zone`}
          </p>
        </div>

        {/* Field 3: Year Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Target Year</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/30">
              {year}
            </span>
          </div>

          <div className="pt-1">
            <input
              type="range"
              min="2026"
              max="2047"
              step="1"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Quick Year Milestones */}
          <div className="flex justify-between items-center pt-1 gap-1">
            {milestones.map((m) => (
              <button
                key={m.year}
                onClick={() => setYear(m.year)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition ${
                  year === m.year
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={m.label}
              >
                {m.year}
              </button>
            ))}
          </div>
        </div>

        {/* Field 4: Population */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Projected Population</span>
            </span>
            <span className="text-[11px] font-mono text-blue-300">
              {formatPopulation(population)}
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="10000"
              max="350000000"
              step="500000"
              value={population}
              onChange={(e) => setPopulation(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          <input
            type="range"
            min="100000"
            max="250000000"
            step="1000000"
            value={Math.min(250000000, population)}
            onChange={(e) => setPopulation(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-400"
          />
        </div>

        {/* Field 5: GSDP (Crore INR) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span className="flex items-center space-x-1.5">
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>GSDP in Crore INR</span>
            </span>
            <span className="text-[11px] font-mono text-emerald-300">
              {formatCrores(gsdp)}
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              min="500"
              max="25000000"
              step="50000"
              value={gsdp}
              onChange={(e) => setGsdp(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          <input
            type="range"
            min="5000"
            max="10000000"
            step="50000"
            value={Math.min(10000000, gsdp)}
            onChange={(e) => setGsdp(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
        </div>

        {/* Live Engineered Backend Features Preview */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-emerald-950/20 border border-emerald-500/20 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-400 flex items-center space-x-1.5">
              <Calculator className="w-3.5 h-3.5" />
              <span>Auto-Calculated ML Features</span>
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
              Live Backend
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">GSDP Per Capita</span>
              <span className="font-mono font-bold text-white text-xs">
                {engineeredFeatures.formattedPerCapita}
              </span>
              <span className="text-[9px] text-slate-500 block">per person / yr</span>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Years Since 2006</span>
              <span className="font-mono font-bold text-amber-300 text-xs">
                +{engineeredFeatures.yearsSince2006} yrs
              </span>
              <span className="text-[9px] text-slate-500 block">baseline: 2006</span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Primary Driver:</span>
            <span className="text-emerald-300 font-medium">GSDP Correlation (0.78 Bio, 0.72 Wind)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlidersIcon(props) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="1" x2="7" y1="14" y2="14" />
      <line x1="9" x2="15" y1="8" y2="8" />
      <line x1="17" x2="23" y1="16" y2="16" />
    </svg>
  );
}
