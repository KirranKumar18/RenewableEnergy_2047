import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { BarChart3, TrendingUp } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Charts({ data, loading }) {
  if (!data || loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[0, 1].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 h-80 animate-pulse flex items-center justify-center">
            <span className="text-slate-400 text-xs">Loading analytics charts…</span>
          </div>
        ))}
      </div>
    );
  }

  const bd = data.financial_analysis?.breakdown || [];

  // Chart 1: Horizontal Bar Chart — Capacity (MW) by energy source
  const capData = {
    labels: bd.map(b => b.name),
    datasets: [{
      label: 'Predicted Capacity (MW)',
      data: bd.map(b => b.mw),
      backgroundColor: bd.map(b => b.color),
      borderColor: bd.map(b => b.color),
      borderWidth: 1,
      borderRadius: 6,
      barThickness: 22,
    }],
  };

  const capOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#ffffff',
        bodyColor: '#f8fafc',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` Capacity: ${ctx.raw.toLocaleString('en-IN')} MW (${bd[ctx.dataIndex]?.sharePct || 0}%)`
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#f1f5f9' },
        ticks: {
          color: '#64748b',
          font: { family: 'Plus Jakarta Sans', size: 10.5 },
          callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k MW` : `${v} MW`
        },
      },
      y: {
        grid: { display: false },
        ticks: {
          color: '#1e293b',
          font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
        },
      },
    },
  };

  // Chart 2: Grouped Bar Chart — CAPEX vs OPEX
  const finData = {
    labels: bd.map(b => b.name),
    datasets: [
      {
        label: 'Setup Cost (CAPEX ₹ Cr)',
        data: bd.map(b => b.capexCr),
        backgroundColor: '#f59e0b',
        borderRadius: 5,
      },
      {
        label: 'Annual Prod Cost (OPEX ₹ Cr/yr)',
        data: bd.map(b => b.opexCr || Math.round((b.annualGenGWh || 0) * (b.lcoe || 3) * 1000 / 1e7)),
        backgroundColor: '#0d9488',
        borderRadius: 5,
      },
    ],
  };

  const finOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#334155',
          font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' },
          boxWidth: 12,
          padding: 14
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#ffffff',
        bodyColor: '#f8fafc',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')} Crore`
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#f1f5f9' },
        ticks: {
          color: '#1e293b',
          font: { family: 'Plus Jakarta Sans', size: 10.5, weight: '500' },
          maxRotation: 30
        },
      },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: {
          color: '#64748b',
          font: { family: 'Plus Jakarta Sans', size: 10.5 },
          callback: v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k Cr` : `${v} Cr`}`
        },
      },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Chart 1 */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Predicted Capacity by Energy Source
              </h3>
              <p className="text-[11px] text-slate-400">Megawatts (MW) generated per technology</p>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            5 Sources
          </span>
        </div>
        <div className="h-64">
          <Bar data={capData} options={capOptions} />
        </div>
      </div>

      {/* Chart 2 */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Capital Setup (CAPEX) vs Annual Production (OPEX)
              </h3>
              <p className="text-[11px] text-slate-400">Values in Crore INR based on CERC benchmarks</p>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
            Cost Matrix
          </span>
        </div>
        <div className="h-64">
          <Bar data={finData} options={finOptions} />
        </div>
      </div>
    </div>
  );
}
