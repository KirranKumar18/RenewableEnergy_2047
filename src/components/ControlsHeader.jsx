import React from 'react';
import {
  Compass, MapPin, Calendar, Users, Coins, Sparkles,
  Zap, Sliders, ShieldCheck, ArrowRight, Download, RefreshCw
} from 'lucide-react';
import { ZONE_TO_STATES, ZONE_COLORS } from '../data/stateMapping';

export default function ControlsHeader({
  mode, setMode,
  zone, setZone,
  state, setState,
  year, setYear,
  population, setPopulation,
  gsdp, setGsdp,
  onAutoProject,
  apiConnected,
  engineeredFeatures,
  onExport
}) {
  const statesInZone = ZONE_TO_STATES[zone] || [];
  const zc = ZONE_COLORS[zone] || { fill: '#059669', textColor: '#065f46', lightBg: '#ecfdf5' };

  const milestones = [
    { year: 2024, label: 'Latest data' },
    { year: 2030, label: '500 GW target' },
    { year: 2035, label: 'Horizon' },
    { year: 2047, label: 'Viksit Bharat' },
  ];

  const formatPop = (v) => {
    const n = Number(v) || 0;
    if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
    return n.toLocaleString('en-IN');
  };

  const formatGsdp = (v) => {
    const n = Number(v) || 0;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L Cr`;
    return `₹${n.toLocaleString('en-IN')} Cr`;
  };

  return (
    <header className="bg-white border-b border-slate-200/90 shadow-xs sticky top-0 z-[1200]">
      {/* Top Brand Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base text-slate-900 tracking-tight">
                Renewable<span className="text-emerald-600">Energy</span>
              </span>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                2047
              </span>
              <span className="hidden sm:inline-block text-slate-300">•</span>
              <span className="hidden sm:inline-block text-xs font-semibold text-slate-500">
                ExxonMobil Innothon
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              India Renewable Energy Capacity & Cost Forecasting System
            </p>
          </div>
        </div>

        {/* Right Status & Actions */}
        <div className="flex items-center gap-3">
          {/* API Status Pill */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border ${
            apiConnected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${apiConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span>{apiConnected ? 'ML Engine Online' : 'Simulation Mode'}</span>
          </div>

          {/* Export Button */}
          <button
            onClick={onExport}
            className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Snapshot</span>
          </button>
        </div>
      </div>

      {/* Control Bar (Clean, Light, Horizontal) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Segmented Mode Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setMode('state')}
              className={`px-3 py-1.5 rounded-lg font-bold transition text-xs ${
                mode === 'state'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🇮🇳 Single State
            </button>
            <button
              onClick={() => { setMode('zone'); setState(''); }}
              className={`px-3 py-1.5 rounded-lg font-bold transition text-xs ${
                mode === 'zone'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌐 Entire Zone
            </button>
          </div>

          {/* Zone Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-slate-400" />
              Zone:
            </span>
            <select
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setState('');
              }}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs cursor-pointer"
            >
              {Object.keys(ZONE_TO_STATES).map(z => (
                <option key={z} value={z}>{z} Zone</option>
              ))}
            </select>
          </div>

          {/* State Dropdown (when in state mode) */}
          {mode === 'state' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                State:
              </span>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs cursor-pointer max-w-[170px]"
              >
                <option value="">Select State…</option>
                {statesInZone.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {/* Year Milestone Chips + Slider */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-semibold text-slate-600">Year:</span>
            <div className="flex items-center gap-1">
              {milestones.map(m => (
                <button
                  key={m.year}
                  title={m.label}
                  onClick={() => setYear(m.year)}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                    year === m.year
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {m.year}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={2024}
              max={2047}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-16 h-1.5 bg-slate-200 rounded appearance-none cursor-pointer accent-amber-500 hidden md:inline-block ml-1"
            />
          </div>

          {/* Population */}
          <div className="hidden xl:flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-600">Pop:</span>
            <input
              type="number"
              min={10000}
              step={500000}
              value={population}
              onChange={(e) => setPopulation(Number(e.target.value))}
              className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-slate-400 font-mono">({formatPop(population)})</span>
          </div>

          {/* GSDP */}
          <div className="hidden xl:flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-600">GSDP:</span>
            <input
              type="number"
              min={1000}
              step={50000}
              value={gsdp}
              onChange={(e) => setGsdp(Number(e.target.value))}
              className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1 font-mono font-bold text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-slate-400 font-mono">({formatGsdp(gsdp)})</span>
          </div>

          {/* Auto-Project Button */}
          <button
            onClick={onAutoProject}
            title="Auto-project baseline demographic & GSDP data for selected year"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto Baseline</span>
          </button>
        </div>
      </div>
    </header>
  );
}
