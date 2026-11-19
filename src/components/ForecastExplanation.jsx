import React from 'react';
import { Lightbulb, Info, Database } from 'lucide-react';

const TECH_LABEL = { solar: 'Solar', wind: 'Wind', bio: 'Bio-mass', hydro: 'Small hydro', waste: 'Waste' };

function fmt(mw, signed = false) {
  const sign = signed ? (mw > 0 ? '+' : mw < 0 ? '−' : '') : '';
  const a = Math.abs(mw);
  if (a >= 1000) return `${sign}${(a / 1000).toLocaleString('en-IN', { maximumFractionDigits: a >= 10000 ? 1 : 2 })} GW`;
  return `${sign}${a.toLocaleString('en-IN', { maximumFractionDigits: 0 })} MW`;
}

function DataStatus({ status, year }) {
  if (!status) return null;
  const stale = status.stale_states || [];
  const last = status.last_fresh_report || {};
  let text = null;
  if (status.kind === 'reported') {
    text = `${year} values are reported figures from the dataset.`;
  } else if (status.kind === 'nowcast') {
    text = `The dataset repeats older values for ${stale.length === 1 ? stale[0] : `${stale.length} of these states`} after ${
      stale.length === 1 ? last[stale[0]] : 'their last new report'}. ${year} is the model's nowcast, not a reported figure.`;
  } else if (stale.length) {
    text = stale.length === 1
      ? `${stale[0]} has had no new data since ${last[stale[0]]}, so this forecast starts from the model's ${status.base_year} nowcast, not the repeated figure.`
      : `${stale.length} of these states have had no new data since an earlier year. Their forecasts start from the model's ${status.base_year} nowcast.`;
  }
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
      <Database className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}

export default function ForecastExplanation({ explanation, prediction, loading }) {
  const year = prediction?.inputs?.year;
  const status = prediction?.data_status;

  if (!explanation) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs h-48 animate-pulse flex items-center justify-center">
        <span className="text-slate-400 text-xs">{loading ? 'Explaining forecast…' : 'Explanation needs the backend to be running'}</span>
      </div>
    );
  }

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">Why this forecast?</h3>
          <p className="text-[11px] text-slate-500">How much each input adds to or takes away from the forecast (SHAP)</p>
        </div>
      </div>
      {explanation.available && (
        <span className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
          {explanation.method}
        </span>
      )}
    </div>
  );

  if (!explanation.available) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3">
        {header}
        <DataStatus status={status} year={year} />
        <div className="flex items-start gap-2 text-xs text-slate-600">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <span>{explanation.reason} Pick a year after {status?.base_year ?? 2024} to see what drives the forecast.</span>
        </div>
      </div>
    );
  }

  const rows = explanation.contributions.filter(c => Math.abs(c.mw) >= 0.05);
  // running totals for the floating bars
  let run = explanation.baseline_mw;
  const steps = rows.map(c => {
    const start = run;
    run += c.mw;
    return { ...c, start, end: run };
  });
  const lo = Math.min(0, ...steps.map(s => Math.min(s.start, s.end)));
  const hi = Math.max(explanation.baseline_mw, explanation.prediction_mw, ...steps.map(s => Math.max(s.start, s.end)));
  const pct = v => ((v - lo) / Math.max(1e-9, hi - lo)) * 100;

  const techLine = c => Object.entries(c.by_tech)
    .filter(([, v]) => Math.abs(v) >= Math.max(1, Math.abs(c.mw) * 0.08))
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([k, v]) => `${TECH_LABEL[k]} ${fmt(v, true)}`)
    .join(' · ');

  const Bar = ({ from, to, color }) => (
    <div className="relative h-5 bg-slate-50 rounded">
      <div
        className="absolute top-0.5 bottom-0.5 rounded"
        style={{ left: `${pct(Math.min(from, to))}%`, width: `${Math.max(0.6, Math.abs(pct(to) - pct(from)))}%`, backgroundColor: color }}
      />
    </div>
  );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
      {header}
      <div className="mb-3"><DataStatus status={status} year={year} /></div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5.5rem] items-center gap-3 text-xs">
          <div className="min-w-0">
            <div className="font-semibold text-slate-700 break-words">{explanation.baseline_label}</div>
            <div className="text-[10px] text-slate-400">Starting point: typical state, year and GSDP path</div>
          </div>
          <Bar from={0} to={explanation.baseline_mw} color="#94a3b8" />
          <div className="text-right font-mono font-bold text-slate-600">{fmt(explanation.baseline_mw)}</div>
        </div>

        {steps.map(s => (
          <div key={s.feature} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5.5rem] items-center gap-3 text-xs">
            <div className="min-w-0">
              <div className="font-semibold text-slate-700 break-words">
                {s.label} <span className="font-mono font-normal text-slate-400">= {s.value}</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">{techLine(s)}</div>
            </div>
            <Bar from={s.start} to={s.end} color={s.mw >= 0 ? '#10b981' : '#f43f5e'} />
            <div className={`text-right font-mono font-bold ${s.mw >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {fmt(s.mw, true)}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_5.5rem] items-center gap-3 text-xs pt-2 border-t border-slate-100">
          <div className="font-bold text-slate-900">Forecast</div>
          <Bar from={0} to={explanation.prediction_mw} color="#0f172a" />
          <div className="text-right font-mono font-black text-slate-900">{fmt(explanation.prediction_mw)}</div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-500">
        <div className="flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
          <span>
            The starting point plus every bar adds up exactly to the forecast. Green bars push it up, red bars pull it down.
            The small text under each input shows which technologies it moves.
          </span>
        </div>
        {explanation.unused_features?.length > 0 && (
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
            <span>
              {explanation.unused_features.join(', ')} has no effect: the model doesn't use it. Across states,
              capacity growth follows GSDP and how far a state is behind its zone, not headcount.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
