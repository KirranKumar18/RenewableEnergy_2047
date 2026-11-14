import React from 'react';
import {
  Compass, MapPin, Calendar, Users, Coins, Sparkles, ToggleLeft, ToggleRight
} from 'lucide-react';
import { ZONE_TO_STATES, ZONE_COLORS } from '../data/stateMapping';

export default function Sidebar({
  mode, setMode,
  zone, setZone,
  state, setState,
  year, setYear,
  population, setPopulation,
  gsdp, setGsdp,
  onAutoProject,
  loading,
  apiConnected,
}) {
  const statesInZone = ZONE_TO_STATES[zone] || [];
  const zc = ZONE_COLORS[zone] || {};

  const fmtPop = (v) => {
    const n = Number(v) || 0;
    if (n >= 1e7) return `${(n/1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `${(n/1e5).toFixed(2)} Lakh`;
    return n.toLocaleString('en-IN');
  };
  const fmtGsdp = (v) => {
    const n = Number(v) || 0;
    if (n >= 1e5) return `₹${(n/1e5).toFixed(2)} Lakh Cr`;
    return `₹${n.toLocaleString('en-IN')} Cr`;
  };

  return (
    <div className="h-full flex flex-col bg-slate-950/90 border-r border-slate-800 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-slate-950 font-black text-xs">RE</span>
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-white leading-tight">RenewableEnergy<span className="text-emerald-400">2047</span></h1>
            <p className="text-[10px] text-slate-400">ExxonMobil Innothon • ML Forecast</p>
          </div>
        </div>
        {/* API status */}
        <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border ${
          apiConnected
            ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
            : 'bg-red-950/50 border-red-500/30 text-red-300'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${apiConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          {apiConnected ? 'Pickle Model API Connected' : 'API Offline — Start backend_api.py'}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="px-4 py-3 border-b border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Forecast Mode</label>
        <div className="flex gap-1.5">
          <button
            onClick={() => setMode('state')}
            className={`flex-1 text-xs font-semibold py-2 px-2 rounded-lg border transition ${
              mode === 'state'
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Single State
          </button>
          <button
            onClick={() => { setMode('zone'); setState(''); }}
            className={`flex-1 text-xs font-semibold py-2 px-2 rounded-lg border transition ${
              mode === 'zone'
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Entire Zone
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-4 flex-1">
        {/* Zone */}
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 mb-1.5">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />Zone
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-slate-800 font-mono" style={{ color: zc.fill }}>{zone}</span>
          </label>
          <select value={zone} onChange={e => { setZone(e.target.value); setState(''); }}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none">
            {Object.keys(ZONE_TO_STATES).map(z => (
              <option key={z} value={z}>{z} Zone</option>
            ))}
          </select>
        </div>

        {/* State */}
        {mode === 'state' && (
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 mb-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />State
              <span className="ml-auto text-[10px] text-slate-500">{statesInZone.length} states</span>
            </label>
            <select value={state} onChange={e => setState(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none">
              <option value="">Select a state…</option>
              {statesInZone.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Year */}
        <div>
          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-amber-400" />Target Year</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/30">{year}</span>
          </label>
          <input type="range" min={2025} max={2035} value={year} onChange={e => setYear(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400" />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>2025</span><span>2030</span><span>2035</span>
          </div>
        </div>

        {/* Population */}
        <div>
          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-blue-400" />Population</span>
            <span className="text-[10px] font-mono text-blue-300">{fmtPop(population)}</span>
          </label>
          <input type="number" min={10000} step={500000} value={population}
            onChange={e => setPopulation(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none" />
          <input type="range" min={100000} max={250000000} step={1000000}
            value={Math.min(250000000, population)} onChange={e => setPopulation(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-400 mt-1.5" />
        </div>

        {/* GSDP */}
        <div>
          <label className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1.5">
            <span className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-emerald-400" />GSDP (₹ Crore)</span>
            <span className="text-[10px] font-mono text-emerald-300">{fmtGsdp(gsdp)}</span>
          </label>
          <input type="number" min={500} step={50000} value={gsdp}
            onChange={e => setGsdp(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:border-emerald-500 focus:outline-none" />
          <input type="range" min={5000} max={10000000} step={50000}
            value={Math.min(10000000, gsdp)} onChange={e => setGsdp(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 mt-1.5" />
        </div>

        {/* Auto-project */}
        <button onClick={onAutoProject}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 transition">
          <Sparkles className="w-3.5 h-3.5" /> Auto-Project Baseline
        </button>
      </div>

      {/* Zone Legend */}
      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Zone Legend</p>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(ZONE_COLORS).map(([z, c]) => (
            <div key={z} className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.fill }} />
              {z}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
