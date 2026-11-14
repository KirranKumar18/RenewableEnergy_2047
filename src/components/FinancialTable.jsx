import React from 'react';
import { Table, ShieldCheck, Download, FileSpreadsheet } from 'lucide-react';
import { BENCHMARKS } from '../data/indiaEnergyData';

export default function FinancialTable({ 
  breakdown, 
  financialMetrics, 
  zoneName 
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              CERC / MNRE Benchmark Financial Audit
            </h3>
            <p className="text-xs text-slate-400">
              Terrain cost multiplier applied: <span className="text-emerald-400 font-mono font-bold">{financialMetrics.zoneMultiplier}x</span> for {zoneName} Zone
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
              <th className="py-2.5 px-3">Energy Source</th>
              <th className="py-2.5 px-3 text-right">Capacity (MW)</th>
              <th className="py-2.5 px-3 text-right">Share (%)</th>
              <th className="py-2.5 px-3 text-right">CAPEX Rate</th>
              <th className="py-2.5 px-3 text-right">Total CAPEX</th>
              <th className="py-2.5 px-3 text-right">CUF Factor</th>
              <th className="py-2.5 px-3 text-right">Gen (GWh/yr)</th>
              <th className="py-2.5 px-3 text-right">LCOE (₹/kWh)</th>
              <th className="py-2.5 px-3 text-right">CO₂ Offset</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {breakdown.map((row) => (
              <tr key={row.id} className="hover:bg-slate-900/40 transition">
                <td className="py-2.5 px-3 font-sans font-medium text-white flex items-center space-x-2">
                  <span 
                    className="w-2.5 h-2.5 rounded-full" 
                    style={{ backgroundColor: row.color }}
                  />
                  <span>{row.name}</span>
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                  {row.mw.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400">
                  {row.sharePct}%
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400">
                  ₹{BENCHMARKS[row.id]?.capex.toFixed(2)} Cr/MW
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-amber-300">
                  ₹{row.capexCr.toLocaleString('en-IN')} Cr
                </td>
                <td className="py-2.5 px-3 text-right text-cyan-400 font-semibold">
                  {row.cufPct}%
                </td>
                <td className="py-2.5 px-3 text-right text-slate-200">
                  {row.annualGenGWh.toLocaleString('en-IN')}
                </td>
                <td className="py-2.5 px-3 text-right text-blue-300">
                  ₹{row.lcoe.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right text-emerald-400">
                  {(row.co2OffsetTons / 1000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}k MT
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-700 bg-slate-900/50 font-mono font-bold text-slate-200">
              <td className="py-3 px-3 font-sans uppercase tracking-wider text-emerald-400">
                Total System Summary
              </td>
              <td className="py-3 px-3 text-right text-white text-sm">
                {breakdown.reduce((acc, r) => acc + r.mw, 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MW
              </td>
              <td className="py-3 px-3 text-right">100.0%</td>
              <td className="py-3 px-3 text-right text-slate-500">—</td>
              <td className="py-3 px-3 text-right text-amber-300 text-sm">
                ₹{financialMetrics.totalCapexCr.toLocaleString('en-IN')} Cr
              </td>
              <td className="py-3 px-3 text-right text-slate-500">—</td>
              <td className="py-3 px-3 text-right text-white">
                {financialMetrics.totalGenerationGWh.toLocaleString('en-IN')} GWh
              </td>
              <td className="py-3 px-3 text-right text-blue-300">
                ₹{financialMetrics.blendedLcoe} (Blended)
              </td>
              <td className="py-3 px-3 text-right text-emerald-400">
                {(financialMetrics.totalCo2OffsetMTons * 1000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}k MT
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
