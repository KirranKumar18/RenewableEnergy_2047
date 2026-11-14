import React from 'react';
import { 
  Zap, 
  Server, 
  Download, 
  Sliders, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Sparkles
} from 'lucide-react';

export default function Navbar({
  scenario,
  setScenario,
  backendConnected,
  isTestingBackend,
  testBackendConnection,
  onOpenSpecs,
  onExportData,
  onCelebrate
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-white/20">
            <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg text-white tracking-tight">
                Renewable<span className="text-emerald-400">Energy</span>
              </span>
              <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                2047
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center space-x-1">
              <span>ExxonMobil Innothon</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300">India RE Capacity & Cost Forecast</span>
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-3">
          {/* Scenario Selector */}
          <div className="hidden md:flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none pr-2 cursor-pointer"
            >
              <option value="standard" className="bg-slate-900 text-slate-200">Baseline Forecast</option>
              <option value="green_accelerated" className="bg-slate-900 text-slate-200">Green Acceleration (+25%)</option>
              <option value="high_solar" className="bg-slate-900 text-slate-200">Solar Surge Focus (+40%)</option>
              <option value="conservative" className="bg-slate-900 text-slate-200">Conservative Baseline (-15%)</option>
            </select>
          </div>

          {/* Backend Status Pill */}
          <button
            onClick={testBackendConnection}
            title="Click to check connection to local FastAPI backend (http://127.0.0.1:8000)"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
              backendConnected
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${backendConnected ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>
              {isTestingBackend
                ? 'Pinging API...'
                : backendConnected
                ? 'Pickle API: Active'
                : 'Client Simulation Engine'}
            </span>
            <span className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          </button>

          {/* Export Forecast */}
          <button
            onClick={onExportData}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            <span>Export</span>
          </button>

          {/* Architecture / Specs */}
          <button
            onClick={onOpenSpecs}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-bold transition shadow-md shadow-emerald-600/20"
          >
            <Info className="w-3.5 h-3.5 text-slate-950" />
            <span className="hidden sm:inline">Model Specs</span>
          </button>
        </div>
      </div>
    </header>
  );
}
