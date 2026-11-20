import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getDemand, API_BASE } from '../utils/api';
import { fmtIN } from '../lib/format';

// India's daily electricity demand: recent history, 28-day forecast, generation mix and model accuracy.
// Data comes from /api/demand (demand_forecast/demand_forecast.json, built by demand_forecast/train.py).

const COND = "'Barlow Semi Condensed', Barlow, sans-serif";
const title = { fontFamily: COND, fontSize: 17, fontWeight: 600 };
const subTxt = { fontSize: 13, color: 'var(--text2)' };
const note = { fontSize: 12, color: 'var(--text3)' };
const card = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px', minWidth: 0 };
const SRC = [
  { id: 'thermal', name: 'Thermal (coal)' }, { id: 'solar', name: 'Solar' }, { id: 'hydro', name: 'Hydro' },
  { id: 'wind', name: 'Wind' }, { id: 'nuclear', name: 'Nuclear' }, { id: 'gas', name: 'Gas' }
];
const srcColor = (t) => ({ thermal: t.text3, solar: t.tech[0], hydro: t.tech[3], wind: t.tech[1], nuclear: t.tech[4], gas: t.tech[2] });
const DAY = 864e5;
const parse = (s) => new Date(s + 'T00:00:00');
const dShort = (s) => parse(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dLong = (s) => parse(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const gwh = (v) => fmtIN(v, 0);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const signed = (p) => (p >= 0 ? '+' : '−') + fmtIN(Math.abs(p), 1) + '%';
const PROD = 'Production';
const LABELS = {
  Production: 'This model', 'Persistence (last day)': 'Same as last day',
  'Last 7-day average x weekday factor': 'Last week’s average × weekday', 'Same weekday last week': 'Same weekday last week',
  'Gradient boosting': 'Gradient boosting'
};

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Kpi({ label, value, unit, sub }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: COND, fontSize: 28, fontWeight: 600 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{unit}</span>}
      </span>
      <span style={note}>{sub}</span>
    </div>
  );
}

function DemandChart({ d, t }) {
  const [ref, w] = useWidth();
  const [hov, setHov] = useState(null);
  const H = 330, P = { l: 56, r: 16, t: 14, b: 30 };
  const hist = d.history.slice(-90);
  const fc = d.forecast;
  const pts = useMemo(() => [
    ...hist.map((r) => ({ ...r, kind: 'hist' })),
    ...fc.map((r) => ({ date: r.date, demand: r.gwh, low: r.low, high: r.high, holiday: r.holiday, kind: 'fc' }))
  ], [hist, fc]);
  if (!w) return <div ref={ref} style={{ height: H }} />;
  const t0 = parse(pts[0].date).getTime(), t1 = parse(pts[pts.length - 1].date).getTime();
  const vals = pts.flatMap((p) => [p.demand, p.low, p.high, p.avg7].filter((v) => v != null));
  const lo = Math.floor(Math.min(...vals) / 250) * 250, hi = Math.ceil(Math.max(...vals) / 250) * 250;
  const X = (s) => P.l + ((parse(s).getTime() - t0) / (t1 - t0)) * (w - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const line = (arr, key) => arr.filter((p) => p[key] != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p[key]).toFixed(1)}`).join('');
  const last = hist[hist.length - 1];
  const fcLine = [{ date: last.date, demand: last.demand }, ...pts.filter((p) => p.kind === 'fc')];
  const band = fc.map((r) => `${X(r.date).toFixed(1)},${Y(r.high).toFixed(1)}`).join(' ') + ' ' +
    [...fc].reverse().map((r) => `${X(r.date).toFixed(1)},${Y(r.low).toFixed(1)}`).join(' ');
  const ticks = [];
  for (let v = lo; v <= hi; v += 250) ticks.push(v);
  const months = [];
  for (let m = new Date(t0); m.getTime() <= t1; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const f = new Date(m.getFullYear(), m.getMonth(), 1);
    if (f.getTime() >= t0) months.push(f);
  }
  const xToday = X(last.date);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tt = t0 + ((e.clientX - r.left - P.l) / (w - P.l - P.r)) * (t1 - t0);
    let best = null, bd = Infinity;
    pts.forEach((p) => { const dd = Math.abs(parse(p.date).getTime() - tt); if (dd < bd) { bd = dd; best = p; } });
    setHov(best);
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={w} height={H} role="img" aria-label={`Daily demand for the last ${hist.length} days and a ${fc.length}-day forecast`}
        onMouseMove={onMove} onMouseLeave={() => setHov(null)} style={{ display: 'block', cursor: 'crosshair' }}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={w - P.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={P.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text3)">{fmtIN(v)}</text>
          </g>
        ))}
        {months.map((m) => {
          const x = P.l + ((m.getTime() - t0) / (t1 - t0)) * (w - P.l - P.r);
          return <text key={+m} x={x} y={H - 10} fontSize="11" fill="var(--text3)" textAnchor="middle">{m.toLocaleDateString('en-IN', { month: 'short', year: m.getMonth() === 0 ? 'numeric' : undefined })}</text>;
        })}
        <rect x={xToday} y={P.t} width={w - P.r - xToday} height={H - P.t - P.b} fill="var(--panel2)" />
        <text x={xToday + 6} y={P.t + 12} fontSize="11" fill="var(--text3)">Forecast</text>
        <polygon points={band} fill={t.ink} opacity="0.14" />
        {hist.filter((p) => p.observed).map((p) => (
          <circle key={p.date} cx={X(p.date)} cy={Y(p.demand)} r={p.holiday ? 3 : 2} fill={p.holiday ? t.gold : 'var(--text3)'} opacity={p.holiday ? 1 : 0.65} />
        ))}
        <path d={line(hist, 'avg7')} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinejoin="round" />
        <path d={line(fcLine, 'demand')} fill="none" stroke={t.ink} strokeWidth="2.5" strokeLinejoin="round" />
        {fc.filter((r) => r.holiday).map((r) => <circle key={r.date} cx={X(r.date)} cy={Y(r.gwh)} r="3.5" fill={t.gold} />)}
        <line x1={xToday} x2={xToday} y1={P.t} y2={H - P.b} stroke="var(--line2)" strokeDasharray="3 3" />
        {hov && <line x1={X(hov.date)} x2={X(hov.date)} y1={P.t} y2={H - P.b} stroke="var(--text2)" />}
        {hov && <circle cx={X(hov.date)} cy={Y(hov.demand)} r="4" fill={hov.kind === 'fc' ? t.ink : 'var(--text)'} stroke="var(--panel)" strokeWidth="1.5" />}
      </svg>
      <div aria-live="polite" style={{ position: 'absolute', left: P.l + 8, top: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--overlay)', border: '1px solid var(--line)', fontSize: 13, pointerEvents: 'none', minWidth: 210 }}>
        {hov ? (
          <>
            <div style={{ fontWeight: 600 }}>{dLong(hov.date)}{hov.holiday ? ` · ${typeof hov.holiday === 'string' ? hov.holiday : 'holiday'}` : ''}</div>
            {hov.kind === 'fc'
              ? <div>Forecast <b>{gwh(hov.demand)} GWh</b> <span style={{ color: 'var(--text3)' }}>(80%: {gwh(hov.low)}–{gwh(hov.high)})</span></div>
              : <div>{hov.observed ? 'Actual' : 'Gap-filled'} <b>{gwh(hov.demand)} GWh</b>{hov.avg7 != null && <span style={{ color: 'var(--text3)' }}> · 7-day avg {gwh(hov.avg7)}</span>}</div>}
          </>
        ) : <div style={{ color: 'var(--text2)' }}>Hover the chart for daily values</div>}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6, ...note }}>
        <span><svg width="18" height="8" aria-hidden="true"><circle cx="4" cy="4" r="2" fill="var(--text3)" /></svg>Daily actual</span>
        <span><svg width="22" height="8" aria-hidden="true"><path d="M1 4h20" stroke="var(--text)" strokeWidth="2" /></svg>7-day average</span>
        <span><svg width="22" height="8" aria-hidden="true"><path d="M1 4h20" stroke={t.ink} strokeWidth="2.5" /></svg>Forecast</span>
        <span><svg width="18" height="10" aria-hidden="true"><rect width="16" height="10" fill={t.ink} opacity="0.14" /></svg>80% range</span>
        <span><svg width="18" height="8" aria-hidden="true"><circle cx="4" cy="4" r="3" fill={t.gold} /></svg>Holiday</span>
      </div>
    </div>
  );
}

function MixWeekly({ d, t }) {
  const [ref, w] = useWidth();
  const H = 150, P = { l: 4, r: 4, t: 6, b: 18 };
  const rows = d.mix_weekly.slice(1, -1).length > 4 ? d.mix_weekly.slice(1, -1) : d.mix_weekly; // drop partial weeks
  const col = srcColor(t);
  if (!w) return <div ref={ref} style={{ height: H }} />;
  const tot = rows.map((r) => SRC.reduce((a, s) => a + (r[s.id] || 0), 0));
  const hi = Math.max(...tot) * 1.05;
  const X = (i) => P.l + (i / (rows.length - 1)) * (w - P.l - P.r);
  const Y = (v) => P.t + (1 - v / hi) * (H - P.t - P.b);
  let base = rows.map(() => 0);
  const layers = SRC.map((s) => {
    const top = rows.map((r, i) => base[i] + (r[s.id] || 0));
    const path = 'M' + rows.map((_, i) => `${X(i).toFixed(1)},${Y(top[i]).toFixed(1)}`).join('L') +
      'L' + rows.map((_, i) => `${X(rows.length - 1 - i).toFixed(1)},${Y(base[rows.length - 1 - i]).toFixed(1)}`).join('L') + 'Z';
    base = top;
    return { s, path };
  });
  return (
    <div ref={ref}>
      <svg width={w} height={H} role="img" aria-label="Weekly average generation by source" style={{ display: 'block' }}>
        {layers.map(({ s, path }) => <path key={s.id} d={path} fill={col[s.id]} opacity="0.85" />)}
        <text x={P.l} y={H - 4} fontSize="11" fill="var(--text3)">{dShort(rows[0].week)}</text>
        <text x={w - P.r} y={H - 4} fontSize="11" fill="var(--text3)" textAnchor="end">{dShort(rows[rows.length - 1].week)}</text>
      </svg>
    </div>
  );
}

export default function DemandView({ t }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => {
    setErr(null);
    getDemand().then(setD).catch((e) => setErr(String(e.message || e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err || !d) {
    return (
      <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {err ? (
          <div style={{ ...card, maxWidth: 520, padding: 28 }}>
            <h2 style={{ margin: 0, fontFamily: COND, fontSize: 20, fontWeight: 600 }}>The demand forecast isn't available</h2>
            <p style={{ margin: '8px 0', color: 'var(--text2)' }}>It is read from <code>{(API_BASE || window.location.origin) + '/api/demand'}</code>. If the API is running, build the forecast with <code>.venv/bin/python demand_forecast/train.py</code>.</p>
            <p style={{ margin: '0 0 14px', ...note }}>Details: {err}</p>
            <button type="button" onClick={load} style={{ height: 42, padding: '0 14px', borderRadius: 8, border: 0, background: 'var(--ink)', color: 'var(--onInk)', fontWeight: 500 }}>Try again</button>
          </div>
        ) : <p style={{ color: 'var(--text2)' }}>Loading demand forecast</p>}
      </div>
    );
  }

  const fc = d.forecast;
  const obsHist = d.history.filter((r) => r.observed);
  const last7 = mean(d.history.slice(-7).map((r) => r.demand));
  const next7 = mean(fc.slice(0, 7).map((r) => r.gwh));
  const next28 = mean(fc.map((r) => r.gwh));
  const bt = d.backtest.all_origins.rows[PROD];
  const btS = d.backtest.seasonal_window.rows[PROD];
  const col = srcColor(t);
  const mix = SRC.map((s) => ({ ...s, pct: d.mix_last30[s.id] || 0, gwh: d.mix_last30_gwh_per_day[s.id] || 0 }));
  const clean = (mix.find((m) => m.id === 'solar').pct + mix.find((m) => m.id === 'wind').pct + mix.find((m) => m.id === 'hydro').pct);
  const peak = obsHist.reduce((a, r) => (r.demand > a.demand ? r : a), obsHist[0]);
  const wd = Object.entries(d.weekday_effect_pct);
  const wdMax = Math.max(...wd.map(([, v]) => Math.abs(v)));

  return (
    <main style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: COND, fontSize: 26, fontWeight: 600 }}>India’s daily electricity demand</h1>
          <p style={{ margin: '2px 0 0', ...subTxt }}>
            All-India energy requirement (demand met on the grid), GWh per day. Data through {dLong(d.updated_through)}; forecast for the next {fc.length} days.
          </p>
        </div>
        <span style={{ ...note, textAlign: 'right' }}>Electricity only, not oil or gas used directly.<br />Source: {d.data.source}.</span>
      </div>

      <section aria-label="Key numbers" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        <Kpi label={`Tomorrow, ${dShort(fc[0].date)}`} value={gwh(fc[0].gwh)} unit="GWh" sub={`About ${fmtIN(fc[0].avg_gw, 0)} GW average load · 80%: ${gwh(fc[0].low)}–${gwh(fc[0].high)}`} />
        <Kpi label="Next 7 days, average" value={gwh(next7)} unit="GWh/day" sub={`${signed((next7 / last7 - 1) * 100)} vs the last 7 days (${gwh(last7)})`} />
        <Kpi label={`Next ${fc.length} days, average`} value={gwh(next28)} unit="GWh/day" sub={`Through ${dShort(fc[fc.length - 1].date)} · ${fmtIN(next28 * fc.length / 1000, 0)} TWh in total`} />
        <Kpi label="Forecast error, next day" value={fmtIN(bt[0], 1) + '%'} sub={`Average error 1 to ${fc.length} days ahead: ${fmtIN(bt[4], 1)}%`} />
        <Kpi label="Clean share of generation" value={fmtIN(clean, 0) + '%'} sub="Solar, wind and hydro, last 30 days" />
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 380px)', gap: 16 }}>
        <figure style={{ ...card, margin: 0 }}>
          <figcaption style={{ marginBottom: 8 }}>
            <div style={title}>Last 90 days and the next {fc.length}</div>
            <div style={subTxt}>The forecast follows last year's seasonal shape for the same weeks; Sundays and holidays dip.</div>
          </figcaption>
          <DemandChart d={d} t={t} />
        </figure>

        <figure style={{ ...card, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <figcaption>
            <div style={title}>How demand is met: generation by source</div>
            <div style={subTxt}>Share of electricity generated, last 30 days.</div>
          </figcaption>
          <div role="img" aria-label={mix.map((m) => `${m.name} ${m.pct}%`).join(', ')} style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden' }}>
            {mix.map((m) => <span key={m.id} style={{ width: m.pct + '%', background: col[m.id] }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mix.map((m) => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto auto', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: col[m.id] }} />
                <span style={{ color: 'var(--text2)' }}>{m.name}</span>
                <span style={{ color: 'var(--text3)' }}>{gwh(m.gwh)} GWh/day</span>
                <span style={{ fontFamily: COND, fontSize: 15, fontWeight: 600, width: 48, textAlign: 'right' }}>{fmtIN(m.pct, 1)}%</span>
              </div>
            ))}
          </div>
          <div style={{ ...note, marginTop: 4 }}>Weekly average generation, GWh/day</div>
          <MixWeekly d={d} t={t} />
        </figure>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        <figure style={{ ...card, margin: 0 }}>
          <figcaption style={{ marginBottom: 10 }}>
            <div style={title}>How accurate is it?</div>
            <div style={subTxt}>Average % error when forecasting from every day, Mar–Nov 2026, using only data up to that day.</div>
          </figcaption>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'right' }}>
                <th scope="col" style={{ textAlign: 'left', fontWeight: 500, padding: '4px 0' }}>Days ahead</th>
                {['1', '2–7', '8–14', '15–28', 'All'].map((h) => <th key={h} scope="col" style={{ fontWeight: 500, padding: '4px 0' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(d.backtest.all_origins.rows).map(([k, v]) => (
                <tr key={k} style={{ borderTop: '1px solid var(--line)', fontWeight: k === PROD ? 600 : 400, color: k === PROD ? 'var(--text)' : 'var(--text2)' }}>
                  <th scope="row" style={{ textAlign: 'left', fontWeight: 'inherit', padding: '6px 0' }}>{LABELS[k] || k}</th>
                  {v.map((x, i) => <td key={i} style={{ textAlign: 'right', padding: '6px 0', fontFamily: COND, fontSize: 15 }}>{fmtIN(x, 1)}%</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '10px 0 0', ...note }}>
            Hardest stretch (Oct–Nov 2026, demand fell about 15% in six weeks): this model {fmtIN(btS[4], 1)}%, best simple rule {fmtIN(Math.min(...Object.entries(d.backtest.seasonal_window.rows).filter(([k]) => k !== PROD && k !== 'Gradient boosting').map(([, v]) => v[4])), 1)}%.
          </p>
        </figure>

        <div style={{ ...card }}>
          <div style={title}>How the model works</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
            <li>Starts from the last 7 days' average and adjusts it for the target day.</li>
            <li>Days 1–7: a regression per horizon using yesterday, the last few days, momentum, weekday and holidays.</li>
            <li>Days 8–28: blended with last week's average by weekday, so recent trends aren't pushed too far.</li>
            <li>Scaled by last year's change over the same weeks, which brings in seasonal turns one year of data can't teach.</li>
            <li>Festival dips are removed before averaging, so Diwali isn't read as a downturn.</li>
          </ul>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={title}>Patterns in the data</div>
          <div role="img" aria-label={'Weekday effect: ' + wd.map(([k, v]) => `${k} ${v}%`).join(', ')} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, alignItems: 'end', height: 64 }}>
            {wd.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, color: v < 0 ? 'var(--neg)' : 'var(--text3)' }}>{v > 0 ? '+' : ''}{fmtIN(v, 1)}</span>
                <span style={{ width: '70%', height: Math.max(2, Math.abs(v) / wdMax * 34), background: v < 0 ? 'var(--neg)' : 'var(--muted)', borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{k}</span>
              </div>
            ))}
          </div>
          <div style={note}>Weekday vs weekly average, %</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--text2)' }}>
            <li>Highest day in the last {d.history.length} days: {dShort(peak.date)}, {gwh(peak.demand)} GWh.</li>
            <li>Diwali and Holi cut demand 4–8%.</li>
            {d.yoy_growth_pct != null && <li>The {d.yoy_overlap_days} days covered in both years ran {signed(d.yoy_growth_pct)} above last year. That is unusually high and may include weather or reporting changes.</li>}
            <li>{d.data.gap_filled_days} missing days were filled from generation and not scored.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
