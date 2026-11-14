import React from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Charts({ data, loading }) {
  if (!data || loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0,1].map(i => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 h-72 animate-pulse flex items-center justify-center">
            <span className="text-slate-600 text-sm">Loading charts…</span>
          </div>
        ))}
      </div>
    );
  }

  const bd = data.financial_analysis?.breakdown || [];

  // Chart 1: Horizontal bar — Capacity (MW) by source
  const capData = {
    labels: bd.map(b => b.name),
    datasets: [{
      label: 'Capacity (MW)',
      data: bd.map(b => b.mw),
      backgroundColor: bd.map(b => b.color),
      borderColor: bd.map(b => b.color),
      borderWidth: 1,
      borderRadius: 4,
      barThickness: 24,
    }],
  };

  const capOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw.toLocaleString('en-IN')} MW (${bd[ctx.dataIndex]?.sharePct || 0}%)`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 },
          callback: v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v },
      },
      y: {
        grid: { display: false },
        ticks: { color: '#e2e8f0', font: { size: 11, weight: '600' } },
      },
    },
  };

  // Chart 2: Grouped bar — CAPEX vs OPEX
  const finData = {
    labels: bd.map(b => b.name),
    datasets: [
      {
        label: 'Setup Cost (CAPEX ₹ Cr)',
        data: bd.map(b => b.capexCr),
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Annual Prod Cost (OPEX ₹ Cr/yr)',
        data: bd.map(b => b.opexCr),
        backgroundColor: 'rgba(6, 182, 212, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const finOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#cbd5e1', font: { size: 10 }, boxWidth: 10, padding: 12 },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ₹${ctx.raw.toLocaleString('en-IN')} Cr`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#e2e8f0', font: { size: 10 }, maxRotation: 45 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 },
          callback: v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}` },
      },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
          Predicted Capacity by Energy Source (MW)
        </h3>
        <div className="h-56">
          <Bar data={capData} options={capOptions} />
        </div>
      </div>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
          CAPEX vs Annual Production Cost (₹ Crore)
        </h3>
        <div className="h-56">
          <Bar data={finData} options={finOptions} />
        </div>
      </div>
    </div>
  );
}
