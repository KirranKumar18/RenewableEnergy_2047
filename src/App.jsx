import React, { useState, useEffect, useCallback, useRef } from 'react';
import IndiaMap from './components/IndiaMap';
import Sidebar from './components/Sidebar';
import KpiStrip from './components/KpiStrip';
import Charts from './components/Charts';
import StatePopup from './components/StatePopup';
import { fetchPrediction, checkHealth } from './utils/api';
import { getAutoProjection, STATE_TO_ZONE, ZONE_TO_STATES } from './data/stateMapping';

export default function App() {
  // --- Controls ---
  const [mode, setMode] = useState('state');        // 'state' | 'zone'
  const [zone, setZone] = useState('West');
  const [state, setState] = useState('');
  const [year, setYear] = useState(2028);
  const [population, setPopulation] = useState(72000000);
  const [gsdp, setGsdp] = useState(2200000);

  // --- API state ---
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [error, setError] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  const debounceRef = useRef(null);

  // Check health once on load
  useEffect(() => {
    checkHealth().then(setApiConnected);
  }, []);

  // Auto-project on initial mount
  useEffect(() => {
    const p = getAutoProjection('West', '', 2028);
    setPopulation(p.population);
    setGsdp(p.gsdp);
  }, []);

  // Fetch prediction whenever inputs change (debounced 400ms)
  const doPrediction = useCallback(async (z, st, yr, pop, gdp) => {
    if (!apiConnected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPrediction({
        zone: z,
        state: st || null,
        year: yr,
        population: pop,
        gsdp_crore: gdp,
      });
      // Tag the model-state for choropleth
      res._modelState = st || null;
      setPrediction(res);
    } catch (e) {
      setError(e.message);
      console.error('Prediction error:', e);
    } finally {
      setLoading(false);
    }
  }, [apiConnected]);

  useEffect(() => {
    if (!apiConnected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const targetState = mode === 'state' ? state : '';
      doPrediction(zone, targetState, year, population, gsdp);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [zone, state, year, population, gsdp, mode, apiConnected, doPrediction]);

  // Handle state click from map
  const handleStateClick = useCallback((modelName, stateZone) => {
    setMode('state');
    setZone(stateZone);
    setState(modelName);
    setShowPopup(true);

    // Auto-project population & GSDP for this state
    const p = getAutoProjection(stateZone, modelName, year);
    setPopulation(p.population);
    setGsdp(p.gsdp);
  }, [year]);

  // Auto-project button
  const handleAutoProject = useCallback(() => {
    const targetState = mode === 'state' ? state : '';
    const p = getAutoProjection(zone, targetState, year);
    setPopulation(p.population);
    setGsdp(p.gsdp);
  }, [zone, state, year, mode]);

  // Update auto-project when zone/state/year change
  const handleZoneChange = (z) => {
    setZone(z);
    setState('');
    const p = getAutoProjection(z, '', year);
    setPopulation(p.population);
    setGsdp(p.gsdp);
  };
  const handleStateChange = (s) => {
    setState(s);
    if (s) {
      const p = getAutoProjection(zone, s, year);
      setPopulation(p.population);
      setGsdp(p.gsdp);
    }
  };

  const displayState = prediction?.inputs?.state || state || 'Entire Zone';
  const displayZone = prediction?.inputs?.zone || zone;

  return (
    <div className="h-screen w-screen flex bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar: 280px fixed */}
      <aside className="w-[280px] flex-shrink-0 hidden lg:flex flex-col">
        <Sidebar
          mode={mode} setMode={setMode}
          zone={zone} setZone={handleZoneChange}
          state={state} setState={handleStateChange}
          year={year} setYear={setYear}
          population={population} setPopulation={setPopulation}
          gsdp={gsdp} setGsdp={setGsdp}
          onAutoProject={handleAutoProject}
          loading={loading}
          apiConnected={apiConnected}
        />
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar for mobile (shows on lg:hidden) */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center">
              <span className="text-slate-950 font-black text-[10px]">RE</span>
            </div>
            <span className="font-bold text-sm text-white">RE 2047</span>
          </div>
          <div className={`text-[10px] font-medium px-2 py-1 rounded ${apiConnected ? 'bg-emerald-950/50 text-emerald-300' : 'bg-red-950/50 text-red-300'}`}>
            {apiConnected ? 'API ✓' : 'API ✗'}
          </div>
        </div>

        {/* Map + Popup layer */}
        <div className="relative flex-1 min-h-0">
          <IndiaMap
            onStateClick={handleStateClick}
            selectedState={state}
            predictionData={prediction}
          />

          {/* Floating popup card */}
          {showPopup && prediction && state && (
            <StatePopup
              data={prediction}
              stateName={displayState}
              zone={displayZone}
              onClose={() => setShowPopup(false)}
            />
          )}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute top-3 right-3 z-[999] bg-slate-900/90 border border-emerald-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-emerald-300 font-semibold">Running ML Inference…</span>
            </div>
          )}

          {/* Error toast */}
          {error && !loading && (
            <div className="absolute top-3 right-3 z-[999] bg-red-950/90 border border-red-500/30 px-3 py-1.5 rounded-lg">
              <span className="text-[11px] text-red-300">Error: {error}</span>
            </div>
          )}

          {/* No API message */}
          {!apiConnected && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[999] bg-slate-900/95 border border-amber-500/30 px-4 py-2 rounded-xl text-center max-w-md">
              <p className="text-xs text-amber-300 font-semibold mb-1">⚡ Backend Not Detected</p>
              <p className="text-[11px] text-slate-400">
                Run <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">python backend_api.py</code> to connect your pickle model and enable live predictions.
              </p>
            </div>
          )}
        </div>

        {/* Bottom analytics panel */}
        <div className="flex-shrink-0 bg-slate-950 border-t border-slate-800 p-4 space-y-4 overflow-y-auto max-h-[45vh]">
          {/* Target label */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white">
                {displayState !== 'Entire Zone' ? displayState : `${displayZone} Zone (All States)`}
              </h2>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                Year {year}
              </span>
              {prediction && (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/25">
                  {prediction.model_used === 'india_energy_forecast_model.pkl' ? '✓ Pickle Model' : 'Simulated'}
                </span>
              )}
            </div>
          </div>

          <KpiStrip data={prediction} loading={loading} />
          <Charts data={prediction} loading={loading} />
        </div>
      </main>
    </div>
  );
}
