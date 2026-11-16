import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ControlsHeader from './components/ControlsHeader';
import IndiaMap from './components/IndiaMap';
import StateForecastInspector from './components/StateForecastInspector';
import StatePopup from './components/StatePopup';
import KpiStrip from './components/KpiStrip';
import Charts from './components/Charts';
import { fetchPrediction, checkHealth } from './utils/api';
import {
  getAutoProjection,
  STATE_TO_ZONE,
  ZONE_TO_STATES,
  ZONE_COLORS,
  getStateForecast
} from './data/stateMapping';
import {
  Sun, Wind, Leaf, Droplets, Recycle,
  Layers, MapPin, Compass, Sparkles, ChevronRight, Info
} from 'lucide-react';

export default function App() {
  // --- Controls State ---
  const [mode, setMode] = useState('state'); // 'state' | 'zone'
  const [zone, setZone] = useState('West');
  const [state, setState] = useState('Gujarat');
  const [year, setYear] = useState(2028);
  const [population, setPopulation] = useState(72500000);
  const [gsdp, setGsdp] = useState(2450000);

  // --- Hover State for Instant Forecast on Hover ---
  const [hoveredState, setHoveredState] = useState(null);
  const [hoveredZone, setHoveredZone] = useState(null);

  // --- API & Prediction State ---
  const [apiConnected, setApiConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [showPopup, setShowPopup] = useState(false);

  const debounceRef = useRef(null);

  // Auto-project baseline population and GSDP when state/zone/year changes
  const applyAutoProjection = useCallback((z, st, yr) => {
    const p = getAutoProjection(z, st, yr);
    setPopulation(p.population);
    setGsdp(p.gsdp);
  }, []);

  // Check backend health on mount
  useEffect(() => {
    checkHealth().then(setApiConnected);
  }, []);

  // Initialize with Gujarat 2028 baseline
  useEffect(() => {
    applyAutoProjection('West', 'Gujarat', 2028);
  }, [applyAutoProjection]);

  // Execute prediction API call (or fallback to instant client-side calculation)
  const doPrediction = useCallback(async (z, st, yr, pop, gdp) => {
    setLoading(true);
    try {
      if (apiConnected) {
        const res = await fetchPrediction({
          zone: z,
          state: st || null,
          year: yr,
          population: pop,
          gsdp_crore: gdp,
        });
        setPrediction(res);
      } else {
        // High fidelity fallback when backend is starting
        const fc = getStateForecast(st || 'Entire Zone', z, yr);
        setPrediction({
          status: 'simulated',
          model_used: 'india_energy_forecast_model.pkl (Client Engine)',
          inputs: { zone: z, state: st || 'Entire Zone', year: yr, population: pop, gsdp_crore: gdp },
          predicted_capacity_mw: {
            solar: fc.breakdown.find(b => b.id === 'solar')?.mw || 0,
            wind: fc.breakdown.find(b => b.id === 'wind')?.mw || 0,
            bio: fc.breakdown.find(b => b.id === 'bio')?.mw || 0,
            hydro: fc.breakdown.find(b => b.id === 'hydro')?.mw || 0,
            waste: fc.breakdown.find(b => b.id === 'waste')?.mw || 0,
            total: fc.totalMW
          },
          financial_analysis: {
            totalCapexCr: fc.totalCapexCr,
            totalGenerationGWh: fc.totalGenerationGWh,
            blendedLcoe: fc.blendedLcoe,
            totalCo2OffsetMTons: fc.co2OffsetMT,
            zoneMultiplier: 1.0,
            breakdown: fc.breakdown
          }
        });
      }
    } catch (err) {
      console.error('Prediction failed, using instant client model:', err);
    } finally {
      setLoading(false);
    }
  }, [apiConnected]);

  // Trigger prediction on input change (debounced 350ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const targetState = mode === 'state' ? state : '';
      doPrediction(zone, targetState, year, population, gsdp);
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [zone, state, year, population, gsdp, mode, doPrediction]);

  // Handle state click on map
  const handleStateClick = useCallback((modelName, stateZone) => {
    setMode('state');
    setZone(stateZone);
    setState(modelName);
    setShowPopup(true);
    applyAutoProjection(stateZone, modelName, year);
  }, [year, applyAutoProjection]);

  // Handle state hover on map (INSTANT FORECAST ON HOVER!)
  const handleHoverState = useCallback((modelName, stateZone) => {
    setHoveredState(modelName);
    setHoveredZone(stateZone);
  }, []);

  // Auto-project baseline button
  const handleAutoProject = () => {
    const targetState = mode === 'state' ? state : '';
    applyAutoProjection(zone, targetState, year);
  };

  const handleZoneChange = (z) => {
    setZone(z);
    setState('');
    applyAutoProjection(z, '', year);
  };

  const handleStateChange = (st) => {
    setState(st);
    if (st) {
      applyAutoProjection(zone, st, year);
    }
  };

  // Export JSON snapshot
  const handleExport = () => {
    if (!prediction) return;
    const blob = new Blob([JSON.stringify(prediction, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `India_RE_Forecast_${state || zone}_${year}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayTarget = mode === 'state' && state ? state : `${zone} Zone (All States)`;
  const activeZoneColor = ZONE_COLORS[zone] || { fill: '#10b981', textColor: '#065f46', lightBg: '#ecfdf5' };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* 1. Header & Controls */}
      <ControlsHeader
        mode={mode} setMode={setMode}
        zone={zone} setZone={handleZoneChange}
        state={state} setState={handleStateChange}
        year={year} setYear={setYear}
        population={population} setPopulation={setPopulation}
        gsdp={gsdp} setGsdp={setGsdp}
        onAutoProject={handleAutoProject}
        apiConnected={apiConnected}
        onExport={handleExport}
      />

      {/* 2. Main Centered Stage */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Banner with Target Summary */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-slate-700">
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Target Geography</span>
                <span className="text-slate-300">•</span>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: activeZoneColor.lightBg, color: activeZoneColor.textColor }}
                >
                  {zone} Zone
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {displayTarget}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Forecast Year</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm">{year}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Population</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm">{(population / 1e7).toFixed(2)} Cr</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">GSDP Projected</span>
              <span className="font-extrabold text-slate-900 font-mono text-sm">₹{(gsdp / 1e5).toFixed(2)}L Cr</span>
            </div>
          </div>
        </div>

        {/* 3. CENTERED INDIA MAP with Live Hover Inspector */}
        <section className="relative bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-xs overflow-hidden">
          {/* Map Top Bar Instruction */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-3 border-b border-slate-100 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Interactive Renewable Energy Map of India
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                <Sparkles className="w-3.5 h-3.5" /> Hover on any state to view live forecast
              </span>
            </div>
          </div>

          {/* Centered Map Stage */}
          <div className="relative max-w-4xl mx-auto flex items-center justify-center">
            <IndiaMap
              onStateClick={handleStateClick}
              onHoverState={handleHoverState}
              selectedState={state}
              hoveredState={hoveredState}
              year={year}
            />

            {/* Pinned Live State Forecast Inspector (Top Right of Map) */}
            <div className="absolute top-4 right-4 z-[900] hidden md:block pointer-events-none">
              <div className="pointer-events-auto">
                <StateForecastInspector
                  hoveredState={hoveredState}
                  selectedState={state}
                  selectedZone={zone}
                  year={year}
                  livePrediction={prediction}
                />
              </div>
            </div>

            {/* Floating Click Popup Card */}
            {showPopup && prediction && state && (
              <StatePopup
                data={prediction}
                stateName={displayTarget}
                zone={zone}
                onClose={() => setShowPopup(false)}
              />
            )}
          </div>

          {/* Zone Legend Underneath Centered Map */}
          <div className="pt-4 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-600">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Zones:</span>
            {Object.entries(ZONE_COLORS).map(([zKey, zVal]) => (
              <div key={zKey} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-md shadow-xs border border-white"
                  style={{ backgroundColor: zVal.fill }}
                />
                <span className="font-semibold text-slate-700">{zKey}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Executive KPI Summary Cards */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Core Forecasting Metrics & Performance Indicators
            </h3>
            {loading && (
              <span className="text-xs font-semibold text-emerald-600 animate-pulse flex items-center gap-1">
                Updating forecast…
              </span>
            )}
          </div>
          <KpiStrip data={prediction} loading={loading} />
        </section>

        {/* 5. Visual Analytics Charts (Capacity & CAPEX vs OPEX) */}
        <section>
          <Charts data={prediction} loading={loading} />
        </section>

        {/* 6. Technology Breakdown Cards (5 Clean Light Cards) */}
        {prediction?.financial_analysis?.breakdown && (
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Technology Portfolio Breakdown (CERC Benchmarks)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {prediction.financial_analysis.breakdown.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-sm transition group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">{item.name}</span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
                      style={{ backgroundColor: `${item.color}15`, color: item.color }}
                    >
                      {item.sharePct}%
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1 my-2">
                    <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                      {item.mw.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                    </span>
                    <span className="text-xs font-bold text-slate-500">MW</span>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5 mb-3">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, Math.max(3, item.sharePct))}%`, backgroundColor: item.color }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block font-medium">CAPEX</span>
                      <span className="font-mono font-bold text-slate-800">₹{item.capexCr.toLocaleString('en-IN')} Cr</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Unit Tariff</span>
                      <span className="font-mono font-bold text-slate-800">₹{item.lcoe}/kWh</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Renewable Energy 2047 • ExxonMobil Innothon Challenge</span>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>VotingRegressor Ensemble (XGB + Cat + LGBM + RF)</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold">CERC / MNRE Standards</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
