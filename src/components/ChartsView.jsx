import React, { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import { PieChart, TrendingUp, BarChart3, Layers } from 'lucide-react';
import { HISTORICAL_NATIONAL } from '../data/indiaEnergyData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ChartsView({ breakdown, capacities, targetYear }) {
  const [activeTab, setActiveTab] = useState('trajectory'); // 'trajectory' | 'mix' | 'financial'

  // 1. Doughnut Chart Data (Mix)
  const doughnutData = {
    labels: breakdown.map(b => b.name),
    datasets: [
      {
        data: breakdown.map(b => b.mw),
        backgroundColor: breakdown.map(b => b.color),
        borderColor: '#0f172a',
        borderWidth: 2,
        hoverOffset: 6
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#cbd5e1',
          font: { family: 'Plus Jakarta Sans', size: 11 },
          boxWidth: 12,
          padding: 12
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const pct = capacities.total > 0 ? ((val / capacities.total) * 100).toFixed(1) : 0;
            return ` ${context.label}: ${val.toLocaleString('en-IN')} MW (${pct}%)`;
          }
        }
      }
    },
    cutout: '68%'
  };

  // 2. Trajectory Data (2006 to 2024 Historical + 2026..targetYear Forecast)
  // Historical sampling: 2006, 2010, 2014, 2018, 2020, 2022, 2024
  const histYears = [2006, 2010, 2014, 2018, 2020, 2022, 2024];
  const histTotals = histYears.map(yr => {
    const row = HISTORICAL_NATIONAL.find(r => r.Year === yr);
    if (!row) return 0;
    return (
      (row['Installed - Solar Power'] || 0) +
      (row['Installed - Wind Power'] || 0) +
      (row['Installed - Bio-Mass Power'] || 0) +
      (row['Installed - Small Hydro Power'] || 0) +
      (row['Installed - Waste to Energy'] || 0)
    );
  });

  // Intermediate forecast point if targetYear > 2026
  const trajectoryLabels = [...histYears.map(String)];
  const trajectoryDataPoints = [...histTotals];

  if (targetYear > 2024) {
    if (targetYear > 2030) {
      trajectoryLabels.push('2030');
      // Interpolate ~500 GW milestone trajectory
      const factor2030 = (2030 - 2024) / (targetYear - 2024);
      const est2030 = histTotals[histTotals.length - 1] + (capacities.total - histTotals[histTotals.length - 1]) * factor2030;
      trajectoryDataPoints.push(Math.round(est2030));
    }
    trajectoryLabels.push(String(targetYear));
    trajectoryDataPoints.push(Math.round(capacities.total));
  }

  const lineChartData = {
    labels: trajectoryLabels,
    datasets: [
      {
        label: 'Renewable Capacity Trajectory (MW)',
        data: trajectoryDataPoints,
        borderColor: '#10B981',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
          return gradient;
        },
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { 
          color: '#94a3b8', 
          font: { size: 10 },
          callback: (val) => `${(val / 1000).toFixed(0)}k MW` 
        }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` Total: ${(context.raw).toLocaleString('en-IN')} MW (${(context.raw / 1000).toFixed(1)} GW)`
        }
      }
    }
  };

  // 3. Financial Bar Chart (CAPEX vs Annual Output)
  const barData = {
    labels: breakdown.map(b => b.name),
    datasets: [
      {
        label: 'CAPEX (₹ Crore)',
        data: breakdown.map(b => b.capexCr),
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderRadius: 6
      },
      {
        label: 'Annual Gen (GWh)',
        data: breakdown.map(b => b.annualGenGWh),
        backgroundColor: 'rgba(6, 182, 212, 0.8)',
        borderRadius: 6
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { size: 10 } }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#cbd5e1', font: { size: 11 }, boxWidth: 12 }
      }
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
      {/* Chart Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">
            Forecasting Visualizations & Analytics
          </h3>
        </div>

        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('trajectory')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'trajectory'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>2006-2047 Trajectory</span>
          </button>

          <button
            onClick={() => setActiveTab('mix')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'mix'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Energy Mix Share</span>
          </button>

          <button
            onClick={() => setActiveTab('financial')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'financial'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>CAPEX vs Generation</span>
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="h-72 w-full pt-2">
        {activeTab === 'trajectory' && (
          <div className="h-full w-full">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>
        )}

        {activeTab === 'mix' && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="h-full w-full max-w-md">
              <Doughnut data={doughnutData} options={doughnutOptions} />
            </div>
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="h-full w-full">
            <Bar data={barData} options={barOptions} />
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Derived from 635 historical observations across 34 Indian states (2006–2024)</span>
        </span>
        <span className="font-mono text-slate-300">Net Zero Horizon: 2047</span>
      </div>
    </div>
  );
}
