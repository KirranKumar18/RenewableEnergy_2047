import React from 'react';
import { X, Cpu, Database, DollarSign, CheckCircle2, Terminal, Code, Sparkles } from 'lucide-react';

export default function ArchitectureModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="glass-panel rounded-2xl max-w-3xl w-full border border-slate-700 shadow-2xl p-6 space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                ML Pipeline Architecture & Model Specifications
              </h3>
              <p className="text-xs text-slate-400">
                Multi-Output Voting Regressor & CERC Cost Engine (Desc.md)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Dynamic Frontend Fields */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Database className="w-4 h-4" />
            <span>1. Dynamic Input Contract (Website / API)</span>
          </h4>
          <p className="text-xs text-slate-300">
            The frontend only sends 4 to 5 fields to the prediction endpoint:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="font-semibold text-white block">Zone (Required Dropdown)</span>
              <span className="text-slate-400 text-[11px]">North, West, South, East, North-East (grid regions)</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="font-semibold text-white block">State (Optional Dropdown)</span>
              <span className="text-slate-400 text-[11px]">Specific state or 'Entire Zone' auto-aggregation</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="font-semibold text-white block">Year (Required Integer)</span>
              <span className="text-slate-400 text-[11px]">Target horizon: 2026 to 2047</span>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="font-semibold text-white block">Population & GSDP in Crore INR</span>
              <span className="text-slate-400 text-[11px]">Primary drivers (GSDP corr: Bio 0.78, Wind 0.72, Solar 0.56)</span>
            </div>
          </div>
        </div>

        {/* 2. Auto-Engineered Backend Features */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Code className="w-4 h-4" />
            <span>2. Auto-Engineered Backend Features</span>
          </h4>
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-300">
              <span>GSDP_Per_Capita:</span>
              <span className="text-cyan-300 font-semibold">(GSDP_Crore * 10^7) / (Population + 1)</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Years_Since_2006:</span>
              <span className="text-amber-300 font-semibold">Year - 2006</span>
            </div>
          </div>
        </div>

        {/* 3. Model Hyperparameters */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Cpu className="w-4 h-4" />
            <span>3. VotingRegressor Ensemble Specifications</span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2 px-2">Regressor</th>
                  <th className="py-2 px-2">Weight</th>
                  <th className="py-2 px-2">Estimators</th>
                  <th className="py-2 px-2">Learning Rate</th>
                  <th className="py-2 px-2">Depth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                <tr>
                  <td className="py-2 px-2 font-sans font-semibold text-white">XGBoost</td>
                  <td className="py-2 px-2 text-emerald-400 font-bold">3</td>
                  <td className="py-2 px-2">600</td>
                  <td className="py-2 px-2">0.04</td>
                  <td className="py-2 px-2">6</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-sans font-semibold text-white">CatBoost</td>
                  <td className="py-2 px-2 text-emerald-400 font-bold">3</td>
                  <td className="py-2 px-2">600</td>
                  <td className="py-2 px-2">0.04</td>
                  <td className="py-2 px-2">6</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-sans font-semibold text-white">LightGBM</td>
                  <td className="py-2 px-2 text-slate-400 font-bold">2</td>
                  <td className="py-2 px-2">600</td>
                  <td className="py-2 px-2">0.04</td>
                  <td className="py-2 px-2">6</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-sans font-semibold text-white">Random Forest</td>
                  <td className="py-2 px-2 text-slate-400 font-bold">2</td>
                  <td className="py-2 px-2">400</td>
                  <td className="py-2 px-2">—</td>
                  <td className="py-2 px-2">14</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. How to connect pickle file */}
        <div className="bg-slate-900/90 rounded-xl p-4 border border-emerald-500/30 space-y-2">
          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Terminal className="w-4 h-4" />
            <span>How to Connect Your .pkl Model File</span>
          </h4>
          <p className="text-xs text-slate-300">
            A production-ready <code className="text-emerald-300 bg-slate-950 px-1 py-0.5 rounded">backend_api.py</code> is created in this project directory. To run it:
          </p>
          <div className="bg-slate-950 p-2.5 rounded-lg font-mono text-xs text-slate-300 border border-slate-800">
            <code>python backend_api.py</code>
          </div>
          <p className="text-[11px] text-slate-400">
            Place your <code className="text-slate-300 font-mono">model.pkl</code> in this folder. The backend automatically loads it, serves <code className="text-emerald-300 font-mono">POST /predict</code> on port 8000, and this frontend connects with zero config!
          </p>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            Close Specifications
          </button>
        </div>
      </div>
    </div>
  );
}
