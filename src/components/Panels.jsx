import React from 'react';
import { MILESTONES } from '../lib/theme';

const COND = "'Barlow Semi Condensed', Barlow, sans-serif";
const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4';
const MOON = 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z';

const seg = (on) => ({ background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--onInk)' : 'var(--text2)' });
const segWrap = { display: 'flex', padding: 3, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)' };
const segBtn = { height: 36, padding: '0 12px', border: 0, borderRadius: 6, fontWeight: 500 };
const ghostBtn = { height: 42, padding: '0 14px', borderRadius: 8, border: '1px solid var(--line2)', background: 'transparent', color: 'var(--text)', fontWeight: 500 };
const h2 = { margin: 0, fontFamily: COND, fontSize: 20, fontWeight: 600 };
const sub = { margin: '2px 0 0', fontSize: 13, color: 'var(--text3)' };
const Icon = ({ d, size = 16, color = 'currentColor', w = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: '0 0 auto' }}>
    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Header({ t, themeName, onTheme, scope, onScope, sel, states, onSelect, year, onYear, status, busy }) {
  return (
    <header style={{ flex: '0 0 auto', height: 64, boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 20, background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 20, borderRight: '1px solid var(--line)', height: 40 }}>
        <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="var(--ink)" />
          <path d="M7 21.5h18" fill="none" stroke="var(--onInk)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M10.5 21.5a5.5 5.5 0 0 1 11 0z" fill="var(--gold)" />
          <path d="M16 9.5v2.2M9.6 12.6l1.5 1.5M22.4 12.6l-1.5 1.5" fill="none" stroke="var(--onInk)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontFamily: COND, fontSize: 19, fontWeight: 600, whiteSpace: 'nowrap' }}>India Renewable Outlook</span>
          <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>Forecasts to 2047</span>
        </div>
      </div>
      <div role="group" aria-label="Forecast scope" style={segWrap}>
        {[['india', 'India'], ['zone', 'Zone'], ['state', 'State']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={scope === id} onClick={() => onScope(id)} style={{ ...segBtn, padding: '0 14px', ...seg(scope === id) }}>{label}</button>
        ))}
      </div>
      <select aria-label="State" value={sel} onChange={(e) => onSelect(e.target.value)} style={{ height: 42, width: 200, padding: '0 10px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--panel)', color: 'var(--text)', fontWeight: 500 }}>
        {states.map((s) => <option key={s} value={s}>{s.replace(' And ', ' and ')}</option>)}
      </select>
      <div role="group" aria-label="Forecast year" style={segWrap}>
        {MILESTONES.map((y) => (
          <button key={y} type="button" aria-pressed={y === year} onClick={() => onYear(y)} style={{ ...segBtn, ...seg(y === year) }}>{y}</button>
        ))}
      </div>
      <div style={{ flex: '1 1 0', minWidth: 0 }} />
      <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.dot }} />
        {busy ? 'Updating forecast' : status.label}
      </span>
      <button type="button" aria-label={themeName === 'night' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onTheme} style={{ ...ghostBtn, width: 42, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={themeName === 'night' ? SUN : MOON} size={18} w={1.7} />
      </button>
    </header>
  );
}

export function StatusScreen({ error, apiBase, onRetry }) {
  return (
    <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {error ? (
        <div style={{ maxWidth: 520, padding: 28, borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--line)' }}>
          <h2 style={h2}>The forecast API isn't reachable</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text2)' }}>The dashboard reads every number from the model server at <code>{(apiBase || window.location.origin) + '/api'}</code>.{apiBase ? ' Start it from the project folder, then try again:' : ' It may be starting up. Try again in a few seconds.'}</p>
          {apiBase && <pre style={{ margin: '12px 0', padding: '10px 12px', borderRadius: 8, background: 'var(--panel2)', fontSize: 13 }}>.venv/bin/python backend_api.py</pre>}
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text3)' }}>Details: {error}</p>
          <button type="button" onClick={onRetry} style={{ ...ghostBtn, background: 'var(--ink)', color: 'var(--onInk)', border: 0 }}>Try again</button>
        </div>
      ) : (
        <p style={{ color: 'var(--text2)' }}>Loading forecast data</p>
      )}
    </div>
  );
}

export function Timeline({ tl, year, onPick }) {
  const first = 2024, last = 2047;
  const at = (y) => ((y - first) / (last - first)) * 100 + '%';
  return (
    <section aria-label="Forecast year" style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ padding: '10px 20px', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: COND, fontSize: 24, fontWeight: 600 }}>{year}</span>
          <span style={{ fontFamily: COND, fontSize: 18, fontWeight: 600, color: 'var(--gold)' }}>{tl.value}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{tl.note}</div>
      </div>
      <div style={{ padding: '14px 32px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <input type="range" aria-label="Forecast year" min={first} max={last} step="1" value={year} onChange={(e) => onPick(+e.target.value)}
          aria-valuetext={`${year}, ${tl.value}`} style={{ width: '100%', height: 28, margin: 0 }} />
        <div aria-hidden="true" style={{ position: 'relative', height: 26 }}>
          {Array.from({ length: last - first + 1 }, (_, i) => first + i).map((y, i, all) => {
            const on = y === year, major = MILESTONES.includes(y);
            return (
              <button key={y} type="button" tabIndex={-1} onClick={() => onPick(y)}
                style={{ position: 'absolute', left: at(y), transform: i === 0 ? 'none' : i === all.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-start' : i === all.length - 1 ? 'flex-end' : 'center', gap: 1, padding: 0, border: 0, background: 'transparent' }}>
                <span style={{ width: 1, height: major ? 6 : 4, background: on ? 'var(--gold)' : 'var(--line2)' }} />
                <span style={{ fontSize: on ? 12 : 11, lineHeight: '16px', color: on ? 'var(--text)' : major ? 'var(--text2)' : 'var(--text3)', fontWeight: on ? 700 : major ? 500 : 400 }}>
                  {major || on ? y : "'" + String(y).slice(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function LeftPanel({ vm, year, tech, onTech, onPickState }) {
  return (
    <aside aria-label="Capacity mix and leading states" style={{ minHeight: 0, overflowY: 'auto', padding: '22px 20px', background: 'var(--panel)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 26 }}>
      <section aria-labelledby="mix-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <h2 id="mix-h" style={h2}>Capacity mix</h2>
          <p style={sub}>{vm.scopeName} in {year}. Choose a source to shade the map by it.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {vm.mixRows.map((m) => {
            const on = tech === m.id;
            return (
              <button key={m.id} type="button" aria-pressed={on} onClick={() => onTech(m.id)}
                style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) 70px', gridTemplateRows: 'auto 4px', alignItems: 'center', gap: '4px 10px', padding: '10px 10px 10px 12px', border: 0, borderLeft: `2px solid ${on ? 'var(--gold)' : 'transparent'}`, borderRadius: '0 6px 6px 0', background: on ? 'var(--panel2)' : 'transparent', color: 'var(--text)', textAlign: 'left' }}>
                <Icon d={m.icon} color={m.color} />
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontWeight: on ? 600 : 400 }}>{m.name}</span><span style={{ color: 'var(--text3)' }}>{m.share}</span></span>
                <span style={{ textAlign: 'right', fontFamily: COND, fontSize: 17, fontWeight: 600 }}>{m.val}</span>
                <span />
                <span style={{ gridColumn: '2 / 4', display: 'block', height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: m.w, background: m.color }} /></span>
              </button>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="top-h" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <h2 id="top-h" style={h2}>Leading states</h2>
          <p style={sub}>Ranked by {vm.metricLower} in {year}. Select one to fly to it.</p>
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {vm.topM.map((r) => (
            <li key={r.name} style={{ borderBottom: '1px solid var(--line)' }}>
              <button type="button" aria-current={r.on ? 'true' : undefined} onClick={() => onPickState(r.name)}
                style={{ width: '100%', display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) 64px 76px', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 4px', border: 0, background: r.on ? 'var(--panel2)' : 'transparent', color: 'var(--text)', fontSize: 14, textAlign: 'left' }}>
                <span style={{ color: 'var(--text3)' }}>{r.rank}</span>
                <span style={{ fontWeight: r.on ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                <span style={{ display: 'block', height: 4, borderRadius: 2, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: r.w, background: r.bar }} /></span>
                <span style={{ textAlign: 'right', fontFamily: COND, fontSize: 16, fontWeight: 600 }}>{r.val}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

const overlay = { position: 'absolute', borderRadius: 8, background: 'var(--overlay)', border: '1px solid var(--line)' };

export function MapOverlays({ vm, year, focus, onFocus, perPerson, onPerPerson, onZoomIn, onZoomOut, onReset }) {
  const zoomBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 0, background: 'transparent', color: 'var(--text)' };
  return (
    <>
      <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <nav aria-label="Zoom level" style={{ ...overlay, position: 'static', display: 'flex', alignItems: 'center', gap: 2, padding: 3 }}>
          {vm.crumbs.map((c, i) => (
            <React.Fragment key={c.id}>
              {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text3)', padding: '0 2px' }}>/</span>}
              <button type="button" aria-current={focus === c.id ? 'location' : undefined} onClick={() => onFocus(c.id)}
                style={{ height: 32, padding: '0 10px', border: 0, borderRadius: 6, background: focus === c.id ? 'var(--panel2)' : 'transparent', color: focus === c.id ? 'var(--text)' : 'var(--ink)', fontSize: 14, fontWeight: focus === c.id ? 600 : 400 }}>{c.label}</button>
            </React.Fragment>
          ))}
        </nav>
        <div role="group" aria-label="Map shows" style={{ ...overlay, position: 'static', display: 'flex', padding: 3 }}>
          {[[false, 'Total'], [true, 'Per person']].map(([id, label]) => (
            <button key={label} type="button" aria-pressed={perPerson === id} onClick={() => onPerPerson(id)} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 500, ...seg(perPerson === id) }}>{label}</button>
          ))}
        </div>
      </div>
      <div role="status" style={{ ...overlay, right: 12, top: 12, minWidth: 180, padding: '10px 12px' }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{vm.tip.kind}</div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{vm.tip.name}</div>
        <div style={{ fontFamily: COND, fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: 'var(--gold)' }}>{vm.tip.val}</div>
      </div>
      <div title={vm.legendNote} style={{ ...overlay, left: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px', fontSize: 12, color: 'var(--text2)' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{vm.metricName}, {year}</span>
        {vm.legend.map((l) => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 9, borderRadius: 2, background: l.color }} />{l.label}</span>
        ))}
      </div>
      <div role="group" aria-label="Zoom" style={{ ...overlay, right: 12, bottom: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <button type="button" onClick={onZoomIn} aria-label="Zoom in one level" style={{ ...zoomBtn, borderBottom: '1px solid var(--line)' }}><Icon d="M12 5v14M5 12h14" size={18} /></button>
        <button type="button" onClick={onZoomOut} aria-label="Zoom out one level" style={{ ...zoomBtn, borderBottom: '1px solid var(--line)' }}><Icon d="M5 12h14" size={18} /></button>
        <button type="button" onClick={onReset} aria-label="Show all of India" style={zoomBtn}><Icon d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" size={18} /></button>
      </div>
    </>
  );
}

export function ScenarioBar({ s, year, onGsdpText, onGsdpSlide, onPopText, onPopSlide, onBlur, onReset }) {
  const field = { height: 42, padding: '0 10px', borderRadius: 8, border: '1px solid var(--line2)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontWeight: 600 };
  const tag = s.anyCustom ? { border: '1px solid var(--gold)', color: 'var(--gold)' } : { border: '1px solid var(--line2)', color: 'var(--text2)' };
  return (
    <section aria-labelledby="inputs-h" style={{ flex: '0 0 auto', padding: '10px 20px', background: 'var(--panel)', borderTop: `1px solid ${s.anyCustom ? 'var(--gold)' : 'var(--line)'}`, display: 'grid', gridTemplateColumns: 'minmax(150px, 0.8fr) minmax(0, 1.2fr) minmax(0, 1.1fr) auto', alignItems: 'center', gap: 20 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 id="inputs-h" style={{ ...h2, fontSize: 18 }}>Scenario</h2>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', ...tag }}>{s.status}</span>
        </div>
        <p style={{ ...sub, fontSize: 12 }} title={s.note}>{s.scopeNote}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <label htmlFor="in-gsdp" style={{ fontSize: 13, color: 'var(--text2)' }}>GSDP in {year}, ₹ lakh crore</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="in-gsdp" type="number" inputMode="decimal" min="0" step="0.1" value={s.gsdpText} disabled={s.locked} onChange={(e) => onGsdpText(e.target.value)} onBlur={onBlur} style={{ ...field, flex: '0 0 96px', width: 96, height: 38 }} />
          <input type="range" aria-label="GSDP" min={s.gsdpMin} max={s.gsdpMax} step={s.gsdpStep} value={s.gsdpVal} disabled={s.locked} onChange={(e) => onGsdpSlide(+e.target.value)} style={{ flex: '1 1 auto', minWidth: 60 }} />
        </div>
        <span style={{ fontSize: 12, color: s.gsdpHintCol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.gsdpHint}>{s.gsdpHint}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <label htmlFor="in-pop" style={{ fontSize: 13, color: 'var(--text2)' }}>Population in {year}, crore</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="in-pop" type="number" inputMode="decimal" min="0" step="0.01" value={s.popText} disabled={s.locked} onChange={(e) => onPopText(e.target.value)} onBlur={onBlur} style={{ ...field, flex: '0 0 86px', width: 86, height: 38 }} />
          <input type="range" aria-label="Population" min={s.popMin} max={s.popMax} step={s.popStep} value={s.popVal} disabled={s.locked} onChange={(e) => onPopSlide(+e.target.value)} style={{ flex: '1 1 auto', minWidth: 60 }} />
        </div>
        <span style={{ fontSize: 12, color: s.popHintCol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.note}>{s.popHint}. Only changes per-person figures.</span>
      </div>
      <button type="button" onClick={onReset} disabled={!s.anyCustom} style={{ ...ghostBtn, height: 38, whiteSpace: 'nowrap', opacity: s.anyCustom ? 1 : 0.5 }}>Reset</button>
    </section>
  );
}

export function ChartsStrip({ vm, year, onTrajHover, onCostHover, onZone }) {
  const tr = vm.trajInfo;
  const fig = { margin: 0, minWidth: 0, padding: '14px 18px 10px', display: 'flex', flexDirection: 'column', gap: 6 };
  const title = { fontFamily: COND, fontSize: 17, fontWeight: 600 };
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width) onTrajHover(Math.max(0, Math.min(vm.years.length - 1, Math.round((e.clientX - r.left) / r.width * (vm.years.length - 1)))));
  };
  return (
    <section aria-label="Charts" style={{ flex: '0 0 auto', height: 280, display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr) minmax(0, 1fr)', background: 'var(--panel)', borderTop: '1px solid var(--line)' }}>
      <figure style={{ ...fig, borderRight: '1px solid var(--line)' }}>
        <figcaption style={{ minWidth: 0 }}>
          <div style={title}>Capacity by source, 2024 to 2047</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tr.readout}>{tr.readout}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Each source has its own scale, so small ones stay readable.</div>
        </figcaption>
        <div role="img" aria-label={tr.aria} style={{ flex: '1 1 0', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          {tr.cells.map((c) => (
            <div key={c.name} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ flex: '0 0 auto', width: 9, height: 9, borderRadius: 2, background: c.color }} />{c.name}</div>
              <div style={{ fontFamily: COND, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.val}</div>
              <div style={{ fontSize: 12, color: c.gcol, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.growth}</div>
              <div style={{ position: 'relative', flex: '1 1 0', minHeight: 50, marginTop: 4, borderBottom: '1px solid var(--line2)' }}>
                <svg viewBox={`0 0 ${tr.width} 100`} preserveAspectRatio="none" aria-hidden="true" onMouseMove={move} onMouseLeave={() => onTrajHover(null)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', cursor: 'crosshair' }}>
                  <path d={c.area} fill={c.color} opacity="0.16" />
                  <path d={c.line} fill="none" stroke={c.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <line x1={tr.selX} x2={tr.selX} y1="0" y2="100" stroke="var(--text3)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                  {tr.hovX != null && <line x1={tr.hovX} x2={tr.hovX} y1="0" y2="100" stroke="var(--text)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
                </svg>
                <span style={{ position: 'absolute', right: 0, top: -2, maxWidth: '100%', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.peak}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)' }}><span>2024</span><span>2047</span></div>
            </div>
          ))}
        </div>
      </figure>
      <figure style={{ ...fig, borderRight: '1px solid var(--line)', gap: 10 }}>
        <figcaption><div style={title}>Cost to generate by source, {year}</div><div style={{ fontSize: 13, color: 'var(--text2)' }}>{vm.costMix.readout}</div></figcaption>
        <div role="img" aria-label={vm.costMix.aria} onMouseLeave={() => onCostHover(null)} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vm.costMix.rows.map((r) => (
            <div key={r.k} onMouseEnter={() => onCostHover(r.k)} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 104px) minmax(30px, 1fr) auto', alignItems: 'center', gap: 10, minHeight: 24, fontSize: 13, opacity: r.op, transition: 'opacity 150ms' }}>
              <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span style={{ display: 'block', height: 12 }}><span style={{ display: 'block', height: '100%', width: r.w, minWidth: 2, borderRadius: '0 4px 4px 0', background: r.color }} /></span>
              <span style={{ textAlign: 'right', fontFamily: COND, fontSize: 15, fontWeight: 600 }}>{r.val}</span>
            </div>
          ))}
        </div>
      </figure>
      <figure style={{ ...fig, gap: 8 }}>
        <figcaption><div style={title}>Capacity by zone, {year}</div><div style={{ fontSize: 13, color: 'var(--text2)' }}>Select a zone to map it.</div></figcaption>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {vm.zoneBars.map((z) => (
            <button key={z.z} type="button" aria-pressed={z.on} onClick={() => onZone(z)} style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, 82px) minmax(30px, 1fr) auto', alignItems: 'center', gap: 10, minHeight: 30, padding: '0 4px', border: 0, borderRadius: 4, background: z.on ? 'var(--panel2)' : 'transparent', color: 'var(--text)', fontSize: 13, textAlign: 'left' }}>
              <span style={{ color: z.on ? 'var(--text)' : 'var(--text2)', fontWeight: z.on ? 600 : 400 }}>{z.z}</span>
              <span style={{ display: 'block', height: 12 }}><span style={{ display: 'block', height: '100%', width: z.w, minWidth: 2, borderRadius: '0 4px 4px 0', background: z.on ? 'var(--ink)' : 'var(--muted)' }} /></span>
              <span style={{ textAlign: 'right', fontFamily: COND, fontSize: 15, fontWeight: 600 }}>{z.val}</span>
            </button>
          ))}
        </div>
      </figure>
    </section>
  );
}

export function DetailPanel({ vm, year, zone, more, onMore }) {
  const sect = { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 18, borderTop: '1px solid var(--line)' };
  const h = { margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--text2)' };
  const tag = vm.anyCustom ? { border: '1px solid var(--gold)', color: 'var(--gold)' } : { border: '1px solid var(--line2)', color: 'var(--text2)' };
  const w = vm.why;
  const wrow = { display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr) 70px', gap: 10, alignItems: 'center', fontSize: 12 };
  const bar = (left, width, bg) => (
    <span style={{ position: 'relative', height: 12, display: 'block' }}><span style={{ position: 'absolute', top: 1, bottom: 1, left: left + '%', width: width + '%', borderRadius: 2, background: bg, transition: 'left 300ms, width 300ms' }} /></span>
  );
  return (
    <aside aria-label="Forecast detail" style={{ minHeight: 0, overflowY: 'auto', padding: 24, background: 'var(--panel)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>{vm.hero.kicker}</div>
        <h1 style={{ margin: '2px 0 0', fontFamily: COND, fontSize: 40, lineHeight: 1.05, fontWeight: 600 }}>{vm.hero.title}</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text2)' }}>
          <span style={{ display: 'inline-block', marginRight: 6, padding: '1px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, ...tag }}>{vm.scen.status}</span>{vm.hero.sub}
        </p>
      </div>

      <section aria-labelledby="cost-h" style={sect}>
        <h2 id="cost-h" style={h}>Cost to generate in {year}</h2>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontFamily: COND, fontSize: 46, fontWeight: 600, lineHeight: 1 }}>{vm.costHero.val}</span><span style={{ fontSize: 15, color: 'var(--text2)' }}>{vm.costHero.unit}</span></div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}><span style={{ color: vm.costHero.dcol }}>{vm.costHero.delta}</span>. Generation multiplied by each source's LCOE, blended at {vm.costHero.lcoe}.</div>
        <div role="img" aria-label={vm.costHero.aria} style={{ marginTop: 8, height: 84, display: 'flex', alignItems: 'flex-end', gap: 3, borderBottom: '1px solid var(--line2)' }}>
          {vm.costBars.map((b, i) => <span key={i} style={{ flex: '1 1 0', height: b.h, borderRadius: '2px 2px 0 0', background: b.bg, transition: 'height 300ms ease' }} />)}
        </div>
        <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}><span>2024</span><span>2030</span><span>2035</span><span>2040</span><span>2047</span></div>
      </section>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px 16px', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
        {vm.tiles.map((k) => (
          <div key={k.label}>
            <dt style={{ fontSize: 13, color: 'var(--text2)' }}>{k.label}</dt>
            <dd style={{ margin: '2px 0 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ whiteSpace: 'nowrap', minWidth: 0 }}><span style={{ fontFamily: COND, fontSize: 24, fontWeight: 600 }}>{k.val}</span> <span style={{ fontSize: 12, color: 'var(--text3)' }}>{k.unit}</span></span>
              <svg width="48" height="24" viewBox="0 0 64 24" preserveAspectRatio="none" aria-hidden="true" style={{ flex: '0 0 auto', overflow: 'visible' }}>
                <polyline points={k.pts} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={k.cx} cy={k.cy} r="2.5" fill="var(--panel)" stroke="var(--gold)" strokeWidth="1.5" />
              </svg>
            </dd>
            <dd style={{ margin: 0, fontSize: 12, color: k.dcol }}>{k.delta}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="why-h" style={{ ...sect, gap: 10 }}>
        <div>
          <h2 id="why-h" style={h}>Why this forecast</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>How much each input adds to or takes away from the {year} capacity forecast. Exact SHAP values from the model server.</p>
        </div>
        {w.state === 'flat' && <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>2024 figures are reported data, or the model's nowcast where reports are stale, so there is nothing to explain. Choose a later year.</p>}
        {w.state === 'loading' && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>Working out the breakdown{w.slow ? '. For a zone or all of India this runs the model for every state and can take up to 20 seconds.' : '.'}</p>}
        {w.state === 'ok' && w.busy && <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>Updating for your latest inputs{w.slow ? ', which can take up to 20 seconds for a zone or all of India' : ''}. The bars below are from the previous inputs.</p>}
        {w.state === 'none' && <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>The breakdown isn't available for this view.</p>}
        {w.state === 'ok' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: w.busy ? 0.6 : 1, transition: 'opacity 200ms' }}>
            <div style={wrow}><span style={{ color: 'var(--text2)' }}>{w.baseLabel}</span>{bar(w.baseLeft, w.baseW, 'var(--muted)')}<span style={{ textAlign: 'right', color: 'var(--text2)' }}>{w.baseAmt}</span></div>
            {w.rows.map((r) => (
              <div key={r.label} style={wrow}>
                <span style={{ minWidth: 0 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>{r.value && <span style={{ display: 'block', fontSize: 11, color: 'var(--text3)' }}>{r.value}</span>}</span>
                {bar(r.left, r.w, r.color)}
                <span style={{ textAlign: 'right', fontWeight: 600 }}>{r.amt}</span>
              </div>
            ))}
            <div style={{ ...wrow, paddingTop: 8, borderTop: '1px solid var(--line)' }}><span style={{ fontWeight: 600 }}>Forecast</span>{bar(w.predLeft, w.predW, 'var(--text)')}<span style={{ textAlign: 'right', fontWeight: 600 }}>{w.predAmt}</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--text3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--pos)' }} />Raises it</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--neg)' }} />Lowers it</span>
              <span>The bars add up to the forecast.</span>
            </div>
          </div>
        )}
      </section>

      {!more && (
        <section aria-labelledby="hl-h" style={{ ...sect, gap: 12 }}>
          <h2 id="hl-h" style={h}>Highlights</h2>
          {vm.insights.map((n) => (
            <div key={n.title} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr)', gap: 12 }}>
              <span style={{ marginTop: 7, width: 8, height: 8, borderRadius: '50%', background: n.mark }} />
              <div><div style={{ fontWeight: 600 }}>{n.title}</div><div style={{ fontSize: 14, color: 'var(--text2)' }}>{n.text}</div></div>
            </div>
          ))}
        </section>
      )}

      {more && (
        <section aria-labelledby="cm-h" style={{ ...sect, gap: 12 }}>
          <h2 id="cm-h" style={h}>Technology breakdown, {year}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Source', 'MW', 'GWh', '₹ Cr capital', '₹/kWh'].map((c, i) => <th key={c} scope="col" style={{ textAlign: i ? 'right' : 'left', padding: '0 0 6px', fontSize: 12, fontWeight: 500, color: 'var(--text3)', borderBottom: '1px solid var(--line)' }}>{c}</th>)}</tr></thead>
            <tbody>
              {vm.table.map((b) => (
                <tr key={b.name}>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />{b.name}</span></td>
                  {[b.cap, b.gen, b.capex, b.lcoe].map((c, i) => <td key={i} style={{ padding: '8px 0', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>Capital cost in the {zone} zone is scaled by {vm.zm} for terrain and logistics. CO₂ avoided uses 0.82 t per MWh.</p>
          <h2 style={{ ...h, marginTop: 6 }}>Model accuracy</h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>Average backtest error on newly reported values (WAPE), with training cut at 2016, 2018 and 2020. Lower is better.</p>
          {vm.acc.map((a) => (
            <div key={a.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 52px', gap: '4px 12px', fontSize: 13 }}>
              <span style={{ color: 'var(--text2)' }}>{a.name}</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{a.value}</span>
              <span style={{ gridColumn: '1 / 3', display: 'block', height: 6, borderRadius: 3, background: 'var(--track)' }}><span style={{ display: 'block', height: 6, width: a.w, borderRadius: 3, background: a.color }} /></span>
            </div>
          ))}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>{vm.accNote}</p>
        </section>
      )}

      <button type="button" aria-expanded={more} onClick={onMore} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>{more ? 'Show highlights' : 'Show technology table and accuracy'}</button>
    </aside>
  );
}
