import React from 'react';
import { 
  Sun, 
  Wind, 
  Leaf, 
  Droplets, 
  Recycle,
  ArrowUpRight,
  Gauge,
  Percent
} from 'lucide-react';

const ICONS = {
  solar: Sun,
  wind: Wind,
  bio: Leaf,
  hydro: Droplets,
  waste: Recycle
};

export default function EnergyBreakdownCards({ breakdown, totalCapacity }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          5-Source Multi-Output Capacity Breakdown
        </h3>
        <span className="text-xs text-slate-400">
          Individual technology parameters from CERC / MNRE standards
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {breakdown.map((item) => {
          const IconComponent = ICONS[item.id] || Sun;
          
          return (
            <div
              key={item.id}
              className="glass-panel rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition relative overflow-hidden group"
            >
              {/* Accent colored top border */}
              <div 
                className="absolute top-0 left-0 right-0 h-1" 
                style={{ backgroundColor: item.color }}
              />

              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${item.color}20`, color: item.color }}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">
                      {item.name}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      CUF: {item.cufPct}%
                    </span>
                  </div>
                </div>

                <span 
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
                  style={{ backgroundColor: `${item.color}25`, color: item.color }}
                >
                  {item.sharePct}%
                </span>
              </div>

              {/* Main Capacity Value */}
              <div className="mt-3.5">
                <div className="flex items-baseline space-x-1">
                  <span className="text-xl font-extrabold text-white font-mono tracking-tight">
                    {item.mw.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">MW</span>
                </div>
              </div>

              {/* Progress bar of share */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(3, item.sharePct))}%`, backgroundColor: item.color }}
                />
              </div>

              {/* Financial specs */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-1.5 text-[10px]">
                <div>
                  <span className="text-slate-500 block">CAPEX</span>
                  <span className="font-mono text-slate-300 font-bold">
                    ₹{item.capexCr.toLocaleString('en-IN')} Cr
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">LCOE</span>
                  <span className="font-mono text-slate-300 font-bold">
                    ₹{item.lcoe}/kWh
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Generation</span>
                  <span className="font-mono text-slate-300 font-bold">
                    {item.annualGenGWh.toLocaleString('en-IN')} GWh
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">CO₂ Saved</span>
                  <span className="font-mono text-slate-300 font-bold">
                    {(item.co2OffsetTons / 1000).toFixed(0)}k MT
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
