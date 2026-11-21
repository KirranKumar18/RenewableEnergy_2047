import React, { useEffect, useMemo, useRef, useState } from 'react';

// Orthographic globe that draws only India's states (coloured) and neighbouring countries (grey),
// with a graticule that tightens as you zoom. Selecting a state rotates and zooms the globe to it.

const RAD = Math.PI / 180;
const ISLANDS = { 'Andaman And Nicobar Islands': true, Lakshadweep: true };
const SHORT = {
  'Andaman And Nicobar Islands': 'Andaman & Nicobar', 'Jammu And Kashmir': 'Jammu & Kashmir',
  'Dadra and Nagar Haveli and Daman and Diu': 'Dadra & Daman', 'Arunachal Pradesh': 'Arunachal', 'Himachal Pradesh': 'Himachal'
};
const SEAS = [{ t: 'Arabian Sea', lon: 64.5, lat: 15.5 }, { t: 'Bay of Bengal', lon: 88.5, lat: 15 }, { t: 'Indian Ocean', lon: 78.5, lat: 3 }];
const NB_LABELS = [
  { t: 'Pakistan', lon: 69.3, lat: 28.6 }, { t: 'Afghanistan', lon: 65.8, lat: 33.4 }, { t: 'China', lon: 88.5, lat: 33.8 },
  { t: 'Nepal', lon: 83.9, lat: 28.3 }, { t: 'Bhutan', lon: 90.4, lat: 27.45 }, { t: 'Bangladesh', lon: 90.2, lat: 24.0 },
  { t: 'Myanmar', lon: 95.9, lat: 21.6 }, { t: 'Sri Lanka', lon: 80.7, lat: 7.7 }
];

function decode(json) {
  const out = {};
  (json.states || json.countries || []).forEach(([name, flats]) => {
    const rings = flats.map((flat) => {
      const r = [];
      let x = 0, y = 0;
      for (let i = 0; i + 1 < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; r.push([x / 100, y / 100]); }
      return r;
    }).filter((r) => r.length > 2);
    if (!rings.length) return;
    const box = [999, 999, -999, -999];
    rings.forEach((r, ri) => {
      if (ri > 0 && !ISLANDS[name]) return;
      r.forEach(([lo, la]) => { box[0] = Math.min(box[0], lo); box[1] = Math.min(box[1], la); box[2] = Math.max(box[2], lo); box[3] = Math.max(box[3], la); });
    });
    out[name] = { rings, box };
  });
  return out;
}

function projector(v, W, H) {
  const l0 = v.lon * RAD, p0 = v.lat * RAD, sp0 = Math.sin(p0), cp0 = Math.cos(p0), R = v.R, cx = W / 2, cy = H / 2;
  return (lon, lat) => {
    const l = lon * RAD - l0, p = lat * RAD, cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l);
    return [cx + R * cp * Math.sin(l), cy - R * (cp0 * sp - sp0 * cp * cl), sp0 * sp + cp0 * cp * cl];
  };
}

function target({ focus, selected, zone, zoneOf }, geo, W, H) {
  let box = null;
  const grow = (b) => { box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b.slice(); };
  if (focus === 'state' && geo[selected]) grow(geo[selected].box);
  if (focus === 'zone') Object.keys(geo).forEach((n) => { if (zoneOf[n] === zone && !ISLANDS[n]) grow(geo[n].box); });
  const india = !box;
  if (india) Object.keys(geo).forEach((n) => { if (!ISLANDS[n]) grow(geo[n].box); });
  const lonc = (box[0] + box[2]) / 2, latc = (box[1] + box[3]) / 2;
  const bw = Math.max(0.35, box[2] - box[0]) * RAD * Math.cos(latc * RAD);
  const bh = Math.max(0.35, box[3] - box[1]) * RAD;
  // Fit the target in the middle of the frame, leaving room for the corner overlays.
  const f = focus === 'state' ? 0.55 : india ? 0.8 : 0.7;
  const R = Math.max(Math.min(W, H) * 0.5, Math.min(40000, Math.min(W * f / bw, H * f / bh)));
  return { lon: lonc, lat: latc, R };
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (mw) => (mw >= 1000 ? (mw / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + ' GW' : Math.round(mw).toLocaleString('en-IN') + ' MW');

export default function GlobeMap({ th, values, bins, selected, zone, zoneOf, scope, focus, hovered, onPick, onHover, valueLabel = fmt }) {
  const rootRef = useRef(null);
  const [size, setSize] = useState({ W: 1000, H: 760 });
  const [geo, setGeo] = useState(null);
  const [nb, setNb] = useState(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState(null);
  const viewRef = useRef(null);
  const raf = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch('/geo/india-states.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => { if (alive) setGeo(decode(j)); }).catch(() => alive && setFailed(true));
    fetch('/geo/neighbours.json').then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j) setNb(decode(j)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const W = Math.round(e.contentRect.width), H = Math.round(e.contentRect.height);
      if (W > 80 && H > 80) setSize((s) => (Math.abs(s.W - W) > 2 || Math.abs(s.H - H) > 2 ? { W, H } : s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fly to the target whenever the focus, selection or size changes.
  useEffect(() => {
    if (!geo) return undefined;
    const to = target({ focus, selected, zone, zoneOf }, geo, size.W, size.H);
    const from = viewRef.current || { lon: to.lon - 4, lat: to.lat - 3, R: to.R * 0.72 };
    cancelAnimationFrame(raf.current);
    if (reducedMotion()) { viewRef.current = to; setView(to); return undefined; }
    const dist = Math.hypot(to.lon - from.lon, to.lat - from.lat);
    const dip = Math.min(0.55, dist * Math.min(from.R, to.R) / 9000);
    const dur = Math.min(1500, 650 + dist * 18 + Math.abs(Math.log(to.R / from.R)) * 220);
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const v = { lon: from.lon + (to.lon - from.lon) * e, lat: from.lat + (to.lat - from.lat) * e, R: from.R * Math.pow(to.R / from.R, e) * (1 - dip * Math.sin(Math.PI * e)) };
      viewRef.current = v;
      setView(v);
      if (u < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [geo, focus, selected, zone, scope, size.W, size.H]); // eslint-disable-line react-hooks/exhaustive-deps

  const { W, H } = size;
  const v = view || { lon: 80, lat: 22, R: Math.min(W, H) * 1.6 };
  const m = th.map;

  const drawn = useMemo(() => {
    const P = projector(v, W, H);
    const R = v.R;
    const projRings = (rings) => {
      let d = '', minx = 1e9, maxx = -1e9;
      rings.forEach((r) => {
        const pr = r.map(([lo, la]) => P(lo, la));
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        pr.forEach((q) => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; });
        if (x1 < -20 || x0 > W + 20 || y1 < -20 || y0 > H + 20) return;
        minx = Math.min(minx, x0); maxx = Math.max(maxx, x1);
        d += 'M' + pr.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'Z';
      });
      return { d, minx, maxx };
    };

    // graticule
    const step = R < 1400 ? 10 : R < 4500 ? 5 : R < 12000 ? 2 : 1;
    const ss = step / 5;
    const spanLon = Math.min(180, (W / R) / RAD / Math.max(0.2, Math.cos(v.lat * RAD)) * 0.75 + step * 2);
    const spanLat = Math.min(88, (H / R) / RAD * 0.75 + step * 2);
    const lines = [], lonLabels = [], latLabels = [];
    const trace = (pts, onCross) => {
      let d = '', open = false, prev = null;
      pts.forEach((q) => {
        if (q[2] > 0) { d += (open ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); if (open && prev && onCross) onCross(prev, q); open = true; prev = q; } else { open = false; prev = null; }
      });
      return d;
    };
    const fmtLon = (L) => { const nn = ((L + 540) % 360) - 180; return Math.abs(nn) + '°' + (nn >= 0 ? 'E' : 'W'); };
    const fmtLat = (L) => Math.abs(L) + '°' + (L >= 0 ? 'N' : 'S');
    const yEdge = H - 14, xEdge = 12;
    for (let lon = Math.ceil((v.lon - spanLon) / step) * step; lon <= v.lon + spanLon; lon += step) {
      const pts = [];
      for (let lat = Math.max(-85, v.lat - spanLat); lat <= Math.min(85, v.lat + spanLat) + 1e-9; lat += ss) pts.push(P(lon, lat));
      let done = false;
      const d = trace(pts, (a, b) => {
        if (done || (a[1] - yEdge) * (b[1] - yEdge) > 0) return;
        const x = a[0] + (b[0] - a[0]) * ((yEdge - a[1]) / ((b[1] - a[1]) || 1e-6));
        if (x > 40 && x < W - 40) { lonLabels.push({ x, y: H - 4, t: fmtLon(Math.round(lon * 100) / 100) }); done = true; }
      });
      if (d) lines.push(d);
    }
    for (let lat = Math.ceil(Math.max(-80, v.lat - spanLat) / step) * step; lat <= Math.min(80, v.lat + spanLat); lat += step) {
      const pts = [];
      for (let lon = v.lon - spanLon; lon <= v.lon + spanLon + 1e-9; lon += ss) pts.push(P(lon, lat));
      let done = false;
      const d = trace(pts, (a, b) => {
        if (done || (a[0] - xEdge) * (b[0] - xEdge) > 0) return;
        const y = a[1] + (b[1] - a[1]) * ((xEdge - a[0]) / ((b[0] - a[0]) || 1e-6));
        if (y > 70 && y < H - 40) { latLabels.push({ x: xEdge + 6, y: y - 9, t: fmtLat(Math.round(lat * 100) / 100) }); done = true; }
      });
      if (d) lines.push(d);
    }
    const tPts = [];
    for (let lon = v.lon - Math.min(180, spanLon + 10); lon <= v.lon + Math.min(180, spanLon + 10); lon += Math.max(0.05, ss / 2)) tPts.push(P(lon, 23.44));
    const tropic = trace(tPts, null);
    const tVis = tPts.filter((q) => q[2] > 0 && q[0] > 140 && q[0] < W - 24 && q[1] > 24 && q[1] < H - 24);
    const tropicLabel = tVis.length ? tVis.reduce((b, c) => (Math.abs(c[0] - (W - 40)) < Math.abs(b[0] - (W - 40)) ? c : b), tVis[0]) : null;

    const neighbours = [], nbLabels = [];
    if (nb) {
      Object.keys(nb).forEach((n) => { const pr = projRings(nb[n].rings); if (pr.d) neighbours.push(pr.d); });
      if (R < 9000) NB_LABELS.forEach((l) => { const q = P(l.lon, l.lat); if (q[2] > 0 && q[0] > 50 && q[0] < W - 50 && q[1] > 30 && q[1] < H - 30) nbLabels.push({ t: l.t, x: q[0], y: q[1] }); });
    }

    const states = [], labels = [];
    let sel = null;
    const zoneMode = scope === 'zone';
    if (geo) {
      Object.keys(geo).forEach((name) => {
        const has = values && values[name] != null;
        const val = has ? values[name] : 0;
        let bin = 0;
        while (bin < bins.length && val >= bins[bin]) bin++;
        const pr = projRings(geo[name].rings);
        const isSel = name === selected && !zoneMode;
        const isHov = name === hovered && name !== selected;
        const inZone = zoneMode && has && zoneOf[name] === zone;
        const fill = has ? th.ramp[bin] : m.nodata;
        states.push({
          name, has, val, d: pr.d || 'M-10,-10Z', fill,
          stroke: isHov ? m.hov : inZone ? m.sel : m.edge,
          sw: isHov || inZone ? 1.6 : 0.8,
          op: zoneMode && !inZone ? 0.55 : 1
        });
        if (!pr.d) return;
        if (isSel) sel = { d: pr.d, fill };
        if (R >= 1300 && has) {
          const b = geo[name].box;
          const c = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
          const wide = (pr.maxx - pr.minx) > 70 || isSel || (inZone && (pr.maxx - pr.minx) > 40);
          if (wide && c[0] > 40 && c[0] < W - 40 && c[1] > 40 && c[1] < H - 40) {
            labels.push({ key: name, x: c[0], y: c[1], text: SHORT[name] || name, fs: isSel ? 18 : 13, fw: isSel ? 600 : 500, cond: isSel });
            if (isSel) labels.push({ key: name + '-v', x: c[0], y: c[1] + 20, text: valueLabel(val), fs: 15, fw: 600, cond: true });
          }
        }
      });
    }
    const seas = [];
    if (R > 300 && R < 2600) SEAS.forEach((s) => { const q = P(s.lon, s.lat); if (q[2] > 0 && q[0] > 60 && q[0] < W - 60 && q[1] > 40 && q[1] < H - 40) seas.push({ t: s.t, x: q[0], y: q[1] }); });
    return { R, lines, lonLabels, latLabels, tropic, tropicLabel, neighbours, nbLabels, states, sel, labels, seas };
  }, [v.lon, v.lat, v.R, W, H, geo, nb, values, bins, selected, hovered, zone, zoneOf, scope, th, m, valueLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const aria = 'Map of India on a globe, states shaded by forecast generation' + (focus === 'state' ? ', zoomed to ' + selected : focus === 'zone' ? ', zoomed to the ' + zone + ' zone' : '');

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: m.space, color: m.fg }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} style={{ display: 'block', width: '100%', height: '100%' }} onMouseLeave={() => onHover && onHover(null)}>
        <defs>
          <radialGradient id="g-ocean" cx="0.36" cy="0.3" r="0.78">
            <stop offset="0" stopColor={m.oceanHi} /><stop offset="0.7" stopColor={m.oceanLo} /><stop offset="1" stopColor={m.oceanEdge} />
          </radialGradient>
          <radialGradient id="g-atmos" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.9" stopColor={m.atmos} stopOpacity="0" /><stop offset="0.946" stopColor={m.atmos} stopOpacity="0.45" /><stop offset="1" stopColor={m.atmos} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={W / 2} cy={H / 2} r={drawn.R * 1.06} fill="url(#g-atmos)" />
        <circle cx={W / 2} cy={H / 2} r={drawn.R} fill="url(#g-ocean)" />
        {drawn.lines.map((d, i) => <path key={i} d={d} fill="none" stroke={m.grat} strokeWidth="1" />)}
        <path d={drawn.tropic} fill="none" stroke={m.tropic} strokeWidth="1.2" strokeDasharray="6 5" />
        {drawn.seas.map((s) => <text key={s.t} x={s.x} y={s.y} textAnchor="middle" style={{ fontSize: 14, fontStyle: 'italic', letterSpacing: '0.06em', fill: m.sea, pointerEvents: 'none' }}>{s.t}</text>)}
        {drawn.neighbours.map((d, i) => <path key={i} d={d} fill={m.land} stroke={m.landEdge} strokeWidth="0.8" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />)}
        {drawn.nbLabels.map((l) => <text key={l.t} x={l.x} y={l.y} textAnchor="middle" style={{ fontSize: 14, letterSpacing: '0.04em', fill: m.landLabel, pointerEvents: 'none' }}>{l.t}</text>)}
        <g style={{ filter: `drop-shadow(0 3px 8px ${m.shadow})` }}>
          {drawn.states.map((s) => (
            <path key={s.name} d={s.d} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} strokeLinejoin="round" opacity={s.op}
              style={{ cursor: s.has ? 'pointer' : 'default', transition: 'opacity 450ms ease, fill 450ms ease' }}
              onClick={() => s.has && onPick && onPick(s.name)}
              onMouseEnter={() => onHover && onHover(s.has ? s.name : null)}>
              <title>{s.has ? `${s.name}, ${valueLabel(s.val)}` : `${s.name}, no forecast data`}</title>
            </path>
          ))}
        </g>
        {drawn.sel && <path d={drawn.sel.d} fill={drawn.sel.fill} stroke={m.sel} strokeWidth="2.2" strokeLinejoin="round" style={{ filter: `drop-shadow(0 6px 10px ${m.lift})`, pointerEvents: 'none' }} />}
        {drawn.labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} textAnchor="middle" style={{ fontFamily: l.cond ? "'Barlow Semi Condensed', Barlow, sans-serif" : 'Barlow, sans-serif', fontSize: l.fs, fontWeight: l.fw, fill: m.fg, stroke: m.halo, strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round', pointerEvents: 'none' }}>{l.text}</text>
        ))}
        {drawn.lonLabels.map((l, i) => <text key={i} x={l.x} y={l.y} textAnchor="middle" style={{ fontSize: 12, fill: m.gratLabel, pointerEvents: 'none' }}>{l.t}</text>)}
        {drawn.latLabels.map((l, i) => <text key={i} x={l.x} y={l.y} dominantBaseline="middle" style={{ fontSize: 12, fill: m.gratLabel, pointerEvents: 'none' }}>{l.t}</text>)}
        {drawn.tropicLabel && <text x={drawn.tropicLabel[0]} y={drawn.tropicLabel[1] - 8} textAnchor="end" style={{ fontSize: 12, fontStyle: 'italic', fill: m.tropicText, pointerEvents: 'none' }}>Tropic of Cancer</text>}
      </svg>
      {(failed || !geo) && (
        <p style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', margin: 0, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 14 }}>
          {failed ? 'The map boundaries did not load. Reload the page to try again.' : 'Loading the map'}
        </p>
      )}
    </div>
  );
}
