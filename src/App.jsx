import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeMap from './components/GlobeMap';
import { Header, Timeline, LeftPanel, MapOverlays, ScenarioBar, ChartsStrip, DetailPanel, StatusScreen } from './components/Panels';
import { getMeta, getScenario, getExplain, API_BASE } from './utils/api';
import { THEMES, TECH, ALL_ICON, MILESTONES, cssVars } from './lib/theme';
import { capStr, crStr, crParts, capParts, genParts, fmtIN, pct, signPct, sum, nice } from './lib/format';

const POP_GROWTH = 0.008; // same yearly population growth the backend's feature builder assumes

export default function App() {
  const [themeName, setThemeName] = useState('atlas');
  const t = THEMES[themeName];

  const [meta, setMeta] = useState(null);
  const [metaErr, setMetaErr] = useState(null);
  const [scope, setScope] = useState('state');
  const [sel, setSel] = useState('Gujarat');
  const [year, setYear] = useState(2030);
  const [focus, setFocus] = useState('india');
  const [tech, setTech] = useState('all');
  const [perPerson, setPerPerson] = useState(false);
  const [hover, setHover] = useState(null);
  const [hy, setHy] = useState(null);
  const [hc, setHc] = useState(null);
  const [more, setMore] = useState(false);
  const [gsdpL, setGsdpL] = useState(null);   // scope GSDP override, lakh crore
  const [popCr, setPopCr] = useState(null);   // scope population override, crore
  const [edit, setEdit] = useState({ field: null, text: '' });

  const [sc, setSc] = useState(null);
  const [scErr, setScErr] = useState(null);
  const [scBusy, setScBusy] = useState(false);
  const [ex, setEx] = useState(null);
  const [exBusy, setExBusy] = useState(false);

  const loadMeta = useCallback(() => {
    setMetaErr(null);
    getMeta().then(setMeta).catch((e) => setMetaErr(String(e.message || e)));
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const zone = meta && meta.states[sel] ? meta.states[sel].zone : 'West';
  const resetInputs = useCallback(() => { setGsdpL(null); setPopCr(null); setEdit({ field: null, text: '' }); }, []);

  // Scenario: one call returns every state's MW plus the scope's trajectory and financials.
  useEffect(() => {
    if (!meta) return undefined;
    const ctl = new AbortController();
    const id = setTimeout(() => {
      setScBusy(true);
      getScenario({ scope, zone, state: sel, year, gsdp_crore: gsdpL != null && year > 2024 ? gsdpL * 1e5 : null }, ctl.signal)
        .then((d) => { setSc(d); setScErr(null); })
        .catch((e) => { if (e.name !== 'AbortError') setScErr(String(e.message || e)); })
        .finally(() => setScBusy(false));
    }, 180);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [meta, scope, zone, sel, year, gsdpL]);

  const n = year - 2024;
  const scopeStates = sc ? sc.scope_states : [];
  const popDefOf = useCallback((s) => (meta ? meta.states[s].population * Math.pow(1 + POP_GROWTH, n) : 0), [meta, n]);
  const popDefault = sum(scopeStates.map(popDefOf));
  const popUsed = popCr != null ? popCr * 1e7 : popDefault;

  // Explanation (exact SHAP) for the same scope and inputs.
  useEffect(() => {
    if (!sc || year <= 2024) { setEx(null); return undefined; }
    const ctl = new AbortController();
    const id = setTimeout(() => {
      setExBusy(true);
      getExplain({ zone: scope === 'india' ? 'India' : zone, state: scope === 'state' ? sel : null, year, population: Math.max(1, popUsed), gsdp_crore: sc.gsdp.used_crore }, ctl.signal)
        .then(setEx).catch(() => {}).finally(() => setExBusy(false));
    }, scope === 'state' ? 350 : 800);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [sc]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = () => { resetInputs(); setHover(null); };
  const pickState = (s) => { if (s !== sel || scope === 'india') resetInputs(); setSel(s); setHover(null); setScope(scope === 'zone' ? 'zone' : 'state'); setFocus(scope === 'zone' ? 'zone' : 'state'); };
  const pickScope = (s) => { if (s !== scope) resetInputs(); setScope(s); setFocus(s); };
  const pickYear = (y) => { setYear(y); setHy(null); setEdit({ field: null, text: '' }); setGsdpL(null); setPopCr(null); };

  const vm = useMemo(() => {
    if (!meta || !sc) return null;
    const B = meta.benchmarks;
    const keys = TECH.map((x) => x.id);
    const names = Object.keys(sc.states);
    const isIndia = scope === 'india', isZone = scope === 'zone';
    const scopeName = sc.scope_name;
    const custom = sc.gsdp.custom, popCustom = popCr != null && n > 0;
    const anyCustom = custom || popCustom;
    const flat = n <= 0;
    const inScope = {};
    scopeStates.forEach((s) => { inScope[s] = true; });

    const capArr = keys.map((k) => sc.capacity_mw[k]);
    const total = sum(capArr);
    const fin = sc.financials, finDef = sc.financials_default, fin24 = sc.financials_2024;
    const shares = capArr.map((v) => (total > 0 ? v / total * 100 : 0));
    const order = [0, 1, 2, 3, 4].sort((a, b) => capArr[b] - capArr[a]);
    const vsTxt = (a, base, aDef) => (flat ? 'Latest data year' : custom ? signPct((a / aDef - 1) * 100) + ' on default projection' : signPct((a / base - 1) * 100) + ' on 2024');
    const dcol = flat ? t.text3 : t.good;

    // map metric
    const tk = tech === 'all' ? -1 : keys.indexOf(tech);
    const popScale = popDefault > 0 ? popUsed / popDefault : 1;
    const popOf = (s) => popDefOf(s) * (inScope[s] ? popScale : 1);
    const rawOf = (arr) => (tk < 0 ? sum(arr) : arr[tk]);
    const valOf = (s) => (perPerson ? rawOf(sc.states[s].mw) * 1e6 / popOf(s) : rawOf(sc.states[s].mw));
    const valDef = (s) => (perPerson ? rawOf(sc.states[s].default_mw) * 1e6 / popDefOf(s) : rawOf(sc.states[s].default_mw));
    const fmtV = perPerson ? (v) => fmtIN(v, v < 100 ? 1 : 0) + ' W' : capStr;
    const metricName = (tk < 0 ? 'Total capacity' : TECH[tk].name + ' capacity') + (perPerson ? ' per person' : '');
    const metricLower = (tk < 0 ? 'total capacity' : TECH[tk].name.toLowerCase() + ' capacity') + (perPerson ? ' per person' : '');
    const mapVals = {};
    names.forEach((s) => { mapVals[s] = valOf(s); });
    const pos = names.map(valDef).filter((x) => x > 0).sort((a, b) => a - b);
    const bins = [1, 2, 3, 4, 5].map((q) => nice(pos[Math.min(pos.length - 1, Math.floor(pos.length * q / 6))] || 0));
    for (let i = 1; i < bins.length; i++) if (bins[i] <= bins[i - 1]) bins[i] = bins[i - 1] * 1.5 + 1;
    const legend = [];
    for (let i = 5; i >= 0; i--) {
      legend.push({ color: t.ramp[i], label: i === 5 ? fmtV(bins[4]) + ' and above' : i === 0 ? 'Below ' + fmtV(bins[0]) : fmtV(bins[i - 1]) + ' to ' + fmtV(bins[i]) });
    }

    const allM = names.map((s) => ({ n: s, v: valOf(s) })).sort((a, b) => b.v - a.v);
    const maxM = allM[0].v || 1;
    const topM = allM.slice(0, 8).map((o, i) => ({
      rank: i + 1, name: o.n, val: fmtV(o.v), w: Math.max(2, o.v / maxM * 100) + '%', on: o.n === sel && !isIndia,
      bar: o.n === sel && !isIndia ? t.gold : (tk < 0 ? t.muted : t.tech[tk])
    }));

    const mixRows = [{ id: 'all', name: 'All sources', icon: ALL_ICON, color: t.gold, val: capStr(total), share: '100%', w: '100%' }]
      .concat(TECH.map((x, k) => ({ id: x.id, name: x.name, icon: x.icon, color: t.tech[k], val: capStr(capArr[k]), share: pct(shares[k]), w: Math.max(1, shares[k]) + '%' })));

    const hovering = hover && hover !== sel && sc.states[hover];
    const scopeVal = perPerson ? (tk < 0 ? total : capArr[tk]) * 1e6 / popUsed : (tk < 0 ? total : capArr[tk]);
    const tip = hovering
      ? { kind: metricName + ', pointer', name: hover, val: fmtV(valOf(hover)) }
      : { kind: metricName + ' in ' + year, name: scopeName, val: fmtV(scopeVal) };

    // trajectory
    const years = sc.trajectory.years;
    const traj = sc.trajectory.mw;
    const costOf = (row) => sum(row.map((v, k) => v * B[keys[k]].cuf * 8.76 * B[keys[k]].lcoe_inr_per_kwh * 0.1));
    const genOf = (row) => sum(row.map((v, k) => v * B[keys[k]].cuf * 8.76));
    const capexOf = (row) => sum(row.map((v, k) => v * B[keys[k]].capex_cr_per_mw));
    const tlMax = Math.max(...traj.map(sum)) || 1;
    const hj = hy != null ? Math.max(0, Math.min(years.length - 1, hy)) : null;
    const tlBars = traj.map((row, j) => {
      const y = years[j], isM = MILESTONES.includes(y), cur = y === year;
      return { y, h: Math.max(3, sum(row) / tlMax * 48) + 'px', bg: cur ? t.gold : hj === j ? t.text2 : isM ? t.ink : t.muted, xl: isM || cur ? String(y) : '', cur, aria: `${y}, ${capStr(sum(row))}` };
    });
    const showJ = hj != null ? hj : year - 2024;
    const tl = {
      bars: tlBars,
      value: capStr(sum(traj[year - 2024])),
      note: year === 2024 ? 'Latest reported year. Drag the slider to forecast up to 2047.' : `Forecast for ${scopeName}. Drag the slider to change the year.`
    };
    const cells = TECH.map((x, k) => {
      const vals = traj.map((r) => r[k]);
      const mx = Math.max(...vals) || 1;
      const pts = vals.map((val, j) => [j * 10, 100 - val / mx * 92]);
      const v0 = vals[0], vj = vals[showJ];
      const g = v0 > 0 ? (vj / v0 - 1) * 100 : 0;
      const line = 'M' + pts.map((p) => p[0] + ',' + p[1].toFixed(2)).join(' L');
      return {
        name: x.name, color: t.tech[k], val: capStr(vj), when: 'in ' + years[showJ],
        growth: showJ === 0 ? 'Reported base' : signPct(g) + ' on 2024', gcol: showJ === 0 ? t.text3 : t.good,
        line, area: 'M0,100 L' + line.slice(1) + ' L' + (vals.length - 1) * 10 + ',100 Z', peak: 'max ' + capStr(mx)
      };
    });
    const trajInfo = {
      cells, selX: (year - 2024) * 10, hovX: hj != null ? hj * 10 : null, width: (years.length - 1) * 10,
      readout: hj != null ? years[hj] + ': ' + capStr(sum(traj[hj])) + ' across all sources' : year + ': ' + capStr(total) + ' in total. Hover any chart to read another year.',
      aria: 'Five small line charts of ' + scopeName + ' capacity by source from 2024 to 2047. ' + TECH.map((x, k) => x.name + ' grows from ' + capStr(traj[0][k]) + ' to ' + capStr(traj[traj.length - 1][k])).join('; ') + '.'
    };

    // cost by source
    const costArr = keys.map((k) => fin.by_tech[k].opexCr);
    const maxCost = Math.max(...costArr) || 1;
    const costOrder = [0, 1, 2, 3, 4].sort((a, b) => costArr[b] - costArr[a]);
    const costMix = {
      rows: costOrder.map((k) => ({ k, name: TECH[k].name, color: t.tech[k], val: crStr(costArr[k]), w: costArr[k] / maxCost * 100 + '%', op: hc == null || hc === k ? 1 : 0.45 })),
      readout: hc != null
        ? `${TECH[hc].name}: ${crStr(costArr[hc])} a year at ₹${B[keys[hc]].lcoe_inr_per_kwh.toFixed(2)} per kWh, ${fmtIN(fin.totalOpexCr > 0 ? costArr[hc] / fin.totalOpexCr * 100 : 0)}% of the total.`
        : crStr(fin.totalOpexCr) + ' a year in total. Hover a bar for detail.',
      aria: 'Bar chart of yearly cost to generate by source in ' + year + '. ' + costOrder.map((k) => TECH[k].name + ' ' + crStr(costArr[k])).join(', ') + '.'
    };

    // zones
    const zoneTot = Object.keys(meta.zones).map((z) => {
      const members = meta.zones[z];
      const lead = members.slice().sort((a, b) => sum(sc.states[b].mw) - sum(sc.states[a].mw))[0];
      return { z, v: sum(members.map((s) => sum(sc.states[s].mw))), lead };
    }).sort((a, b) => b.v - a.v);
    const zMax = zoneTot[0].v || 1;
    const zoneBars = zoneTot.map((o) => ({ ...o, val: capStr(o.v), w: o.v / zMax * 100 + '%', on: o.z === zone && !isIndia }));

    // right panel
    const costSeries = traj.map(costOf);
    const costMax = Math.max(...costSeries) || 1;
    const costBars = costSeries.map((c, j) => ({ h: Math.max(4, c / costMax * 100) + '%', bg: years[j] === year ? t.gold : t.muted }));
    const pcs = crParts(fin.totalOpexCr);
    const costHero = {
      val: pcs[0], unit: pcs[1] + ' a year', delta: vsTxt(fin.totalOpexCr, fin24.totalOpexCr, finDef.totalOpexCr), dcol,
      lcoe: '₹' + fin.blendedLcoe.toFixed(2) + ' per kWh',
      aria: `Bar chart of yearly cost to generate from 2024 to 2047, from ${crStr(costSeries[0])} to ${crStr(costSeries[costSeries.length - 1])} a year.`
    };
    const msIdx = MILESTONES.map((y) => years.indexOf(y)).filter((i) => i >= 0);
    const spark = (vals) => {
      const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
      const X = (y) => (y - 2024) / 23 * 64, Y = (val) => 22 - (val - mn) / span * 20;
      const ms = msIdx.map((i, j) => [years[i], vals[j]]);
      const cur = vals[msIdx.length] ?? vals[vals.length - 1];
      return { pts: ms.map(([y, val]) => X(y).toFixed(1) + ',' + Y(val).toFixed(1)).join(' '), cx: X(year), cy: Y(cur) };
    };
    const msRows = msIdx.map((i) => traj[i]);
    const withCur = (arr, curVal) => arr.concat([curVal]);
    const popAt = (y) => popUsed * Math.pow(1 + POP_GROWTH, y - year);
    const cap = capParts(total), gn = genParts(fin.totalGenerationGWh), crx = crParts(fin.totalCapexCr);
    const co2 = fin.totalGenerationGWh * 0.00082;
    const wpp = total * 1e6 / popUsed, kpp = fin.totalGenerationGWh * 1e6 / popUsed;
    const tiles = [
      { label: 'Installed capacity', val: cap[0], unit: cap[1], delta: vsTxt(total, sc.base_total_mw, sc.default_total_mw), ...spark(withCur(msRows.map(sum), total)) },
      { label: 'Annual generation', val: gn[0], unit: gn[1], delta: vsTxt(fin.totalGenerationGWh, fin24.totalGenerationGWh, finDef.totalGenerationGWh), ...spark(withCur(msRows.map(genOf), fin.totalGenerationGWh)) },
      { label: 'Capital cost of the fleet', val: crx[0], unit: crx[1], delta: vsTxt(fin.totalCapexCr, fin24.totalCapexCr, finDef.totalCapexCr), ...spark(withCur(msRows.map(capexOf), capexOf(capArr))) },
      { label: 'CO₂ avoided each year', val: fmtIN(co2, co2 >= 10 ? 1 : 2), unit: 'Mt', delta: vsTxt(fin.totalGenerationGWh, fin24.totalGenerationGWh, finDef.totalGenerationGWh), ...spark(withCur(msRows.map(genOf), fin.totalGenerationGWh)) },
      { label: 'Capacity per person', val: fmtIN(wpp, wpp < 100 ? 1 : 0), unit: 'W', delta: popCustom ? 'Uses your population' : 'Projected population', muted: true, ...spark(withCur(msIdx.map((i) => sum(traj[i]) * 1e6 / popAt(years[i])), wpp)) },
      { label: 'Generation per person', val: fmtIN(kpp), unit: 'kWh a year', delta: 'Blended at ₹' + fin.blendedLcoe.toFixed(2) + ' per kWh', muted: true, ...spark(withCur(msIdx.map((i) => genOf(traj[i]) * 1e6 / popAt(years[i])), kpp)) }
    ].map((o) => ({ ...o, dcol: o.muted ? t.text3 : dcol }));

    // SHAP waterfall
    let why = { state: flat ? 'flat' : exBusy && !ex ? 'loading' : ex && ex.available ? 'ok' : 'none', slow: scope !== 'state' };
    let topDriver = null;
    if (why.state === 'ok') {
      const rows = ex.contributions.filter((c) => Math.abs(c.mw) >= 0.5);
      topDriver = rows[0] || null;
      const head = rows.slice(0, 5), rest = rows.slice(5);
      if (rest.length) { const s = sum(rest.map((r) => r.mw)); if (Math.abs(s) >= 0.5) head.push({ label: rest.length + ' smaller inputs', value: '', mw: s }); }
      let run = ex.baseline_mw;
      const steps = head.map((r) => { const a = run; run += r.mw; return { ...r, a, b: run }; });
      const lo = Math.min(0, ...steps.map((s) => Math.min(s.a, s.b)));
      const hi = Math.max(ex.baseline_mw, ex.prediction_mw, ...steps.map((s) => Math.max(s.a, s.b)));
      const P = (x) => (x - lo) / ((hi - lo) || 1) * 100;
      why = {
        state: 'ok', busy: exBusy, slow: scope !== 'state',
        baseLabel: ex.baseline_label, baseLeft: P(0), baseW: Math.max(0.6, P(ex.baseline_mw) - P(0)), baseAmt: capStr(ex.baseline_mw),
        predLeft: P(0), predW: Math.max(0.6, P(ex.prediction_mw) - P(0)), predAmt: capStr(ex.prediction_mw),
        rows: steps.map((s) => ({ label: s.label, value: scope === 'state' ? s.value : '', amt: (s.mw >= 0 ? '+' : '−') + capStr(Math.abs(s.mw)), left: P(Math.min(s.a, s.b)), w: Math.max(0.6, Math.abs(P(s.b) - P(s.a))), color: s.mw >= 0 ? t.pos : t.neg }))
      };
    }

    const lead = order[0], second = order[1];
    const dl = fin.blendedLcoe - fin24.blendedLcoe;
    const insights = [
      { mark: t.tech[lead], title: `${TECH[lead].name} supplies ${fmtIN(shares[lead])}% of capacity`, text: `${TECH[second].name} adds ${fmtIN(shares[second])}%. The other three sources make up the remaining ${fmtIN(Math.max(0, 100 - shares[lead] - shares[second]), 1)}%.` },
      flat
        ? { mark: t.gold, title: '2024 is the latest reported year', text: `Choose a forecast year to see growth and try a scenario. Power costs ₹${fin.blendedLcoe.toFixed(2)} per kWh on the current mix.` }
        : { mark: t.gold, title: `Capacity grows ${fmtIN((total / sc.base_total_mw - 1) * 100)}% from 2024`, text: `Each unit costs ₹${fin.blendedLcoe.toFixed(2)} per kWh, ${dl <= 0 ? '₹' + Math.abs(dl).toFixed(2) + ' less' : '₹' + dl.toFixed(2) + ' more'} than in 2024.` }
    ];
    if (topDriver) insights.push({ mark: topDriver.mw >= 0 ? t.pos : t.neg, title: 'Biggest driver: ' + topDriver.label.charAt(0).toLowerCase() + topDriver.label.slice(1), text: `${topDriver.mw >= 0 ? 'Adds' : 'Removes'} ${capStr(Math.abs(topDriver.mw))} compared with the average scenario${topDriver.value && scope === 'state' ? ', at ' + topDriver.value : ''}.` });

    // scenario bar
    const g24L = sc.gsdp.base_crore / 1e5, defL = sc.gsdp.default_crore / 1e5, usedL = sc.gsdp.used_crore / 1e5;
    const gMax = g24L * Math.pow(1.2, Math.max(1, n));
    const scen = {
      locked: flat, status: flat ? 'Reported data' : anyCustom ? 'Custom scenario' : 'Default projection', anyCustom,
      scopeNote: isIndia ? 'Sliders set GSDP and population for all of India. Every state scales by the same factor.'
        : isZone ? `Sliders set GSDP and population for the ${zone} zone. Each member state scales by the same factor.`
          : `Sliders set GSDP and population for ${sel} only.`,
      gsdpText: edit.field === 'g' ? edit.text : usedL.toFixed(2), gsdpMin: g24L, gsdpMax: gMax, gsdpStep: Math.max(0.001, (gMax - g24L) / 400), gsdpVal: Math.min(gMax, Math.max(g24L, usedL)),
      gsdpHint: `Projected ₹${fmtIN(defL, 2)} lakh Cr. ${sc.gsdp.growth_pct != null ? sc.gsdp.growth_pct.toFixed(1) + '% growth a year' : ''}${custom ? ` (default ${sc.gsdp.default_growth_pct.toFixed(1)}%)` : ''}`,
      gsdpHintCol: custom ? t.gold : t.text3,
      popText: edit.field === 'p' ? edit.text : (popUsed / 1e7).toFixed(2), popMin: popDefault * 0.5 / 1e7, popMax: popDefault * 1.5 / 1e7, popStep: Math.max(0.001, popDefault / 1e7 / 200), popVal: popUsed / 1e7,
      popHint: `Projected ${fmtIN(popDefault / 1e7, 2)} Cr${popCustom ? `. ${signPct((popUsed / popDefault - 1) * 100)} on projection` : ''}`,
      popHintCol: popCustom ? t.gold : t.text3,
      note: flat ? '2024 is the latest data year. Choose a forecast year to change the inputs.' : 'Population does not change the capacity forecast: the model found headcount does not predict growth (its SHAP value is zero). It sets the per-person figures and the per-person map.',
      g24L, n
    };

    const B2 = meta.backtest_wape_fresh || {};
    const AC = [['v2 convergence (production)', 'v2 convergence, in use'], ['v1 GSDP elasticity', 'v1 GSDP elasticity'], ['Naive last value', 'No new capacity (naive)'], ['Original tree ensemble', 'Original tree ensemble']];
    const acc = AC.filter((a) => B2[a[0]] != null).map((a, i) => ({ name: a[1], value: B2[a[0]].toFixed(1) + '%', w: Math.min(100, B2[a[0]] / 60 * 100) + '%', color: i === 0 ? t.gold : t.muted }));
    const prod = B2['v2 convergence (production)'], naive = B2['Naive last value'];

    const levels = isIndia ? ['india'] : isZone ? ['india', 'zone'] : ['india', 'zone', 'state'];
    const crumbs = [{ id: 'india', label: 'India' }].concat(isIndia ? [] : [{ id: 'zone', label: zone + ' zone' }]).concat(!isIndia && !isZone ? [{ id: 'state', label: sel }] : []);

    return {
      names, scopeName, isIndia, isZone, flat, custom, anyCustom, metricName, metricLower, mapVals, bins, legend, fmtV,
      legendNote: anyCustom ? 'Colour bands are fixed to the default projection, so your changes shift the colours.' : 'Colour bands are fixed, so changing GSDP or population shifts the colours.',
      topM, mixRows, tip, tl, trajInfo, costMix, zoneBars, costBars, costHero, tiles, why, insights, scen, acc,
      accNote: prod != null && naive ? `The model in use is ${Math.round((1 - prod / naive) * 100)}% more accurate than assuming no new capacity is added.` : '',
      statusLabel: `v2 model, ${prod != null ? prod.toFixed(1) : '–'}% backtest error`,
      table: TECH.map((x, k) => ({ name: x.name, color: t.tech[k], cap: fmtIN(capArr[k]), gen: fmtIN(fin.by_tech[keys[k]].genGWh), capex: fmtIN(fin.by_tech[keys[k]].capexCr), lcoe: B[keys[k]].lcoe_inr_per_kwh.toFixed(2) })),
      zm: '×' + (meta.zone_multipliers[zone] || 1).toFixed(2),
      hero: {
        kicker: isIndia ? `${scopeStates.length} states and union territories, ${year}` : isZone ? `${scopeStates.length} states, ${year}` : `${zone} zone, ${year}`,
        title: scopeName,
        sub: flat ? '2024 reported data, with the model nowcast where reports are stale.' : custom ? `Forecast with GSDP growing ${sc.gsdp.growth_pct.toFixed(1)}% a year.` : 'Model forecast with GSDP at its recent growth rate.'
      },
      levels, crumbs, years
    };
  }, [meta, sc, ex, exBusy, scope, sel, zone, year, n, tech, perPerson, hover, hy, hc, popCr, popUsed, popDefault, popDefOf, scopeStates, edit, t]);

  const pageStyle = { ...cssVars(t), height: '100vh', minHeight: 640, minWidth: 1200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' };

  const header = (
    <Header t={t} themeName={themeName} onTheme={() => setThemeName(themeName === 'night' ? 'atlas' : 'night')}
      scope={scope} onScope={pickScope} sel={sel} states={meta ? Object.keys(meta.states).sort() : []} onSelect={pickState}
      year={year} onYear={pickYear} status={vm ? { label: vm.statusLabel, dot: scErr ? t.neg : t.good } : { label: metaErr ? 'Forecast API offline' : 'Connecting to the forecast API', dot: metaErr ? t.neg : t.warn }}
      busy={scBusy} sc={sc} />
  );

  if (!vm) {
    return (
      <div style={pageStyle}>
        {header}
        <StatusScreen error={metaErr || scErr} apiBase={API_BASE} onRetry={loadMeta} />
      </div>
    );
  }

  const li = Math.max(0, vm.levels.indexOf(focus));
  return (
    <div style={pageStyle}>
      {header}
      <Timeline tl={vm.tl} year={year} onPick={pickYear} />
      <main style={{ flex: '1 1 0', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr) minmax(320px, 400px)', gridTemplateRows: 'minmax(0, 1fr)' }}>
        <LeftPanel vm={vm} year={year} tech={tech} onTech={setTech} onPickState={pickState} />
        <div style={{ minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          {/* The map always gets most of the height; the scenario and charts scroll below it on short windows. */}
          <section aria-label="Map" style={{ flex: '1 0 auto', height: 'max(440px, calc(100vh - 530px))', position: 'relative', overflow: 'hidden', background: 'var(--space)' }}>
            <GlobeMap th={t} values={vm.mapVals} bins={vm.bins} selected={vm.isIndia ? '' : sel} zone={zone}
              zoneOf={Object.fromEntries(vm.names.map((s) => [s, sc.states[s].zone]))} scope={vm.isZone ? 'zone' : 'state'} focus={focus}
              hovered={hover} onPick={pickState} onHover={(s) => setHover(s)} valueLabel={vm.fmtV} />
            <MapOverlays vm={vm} year={year} focus={focus} onFocus={setFocus} perPerson={perPerson} onPerPerson={setPerPerson}
              onZoomIn={() => setFocus(vm.levels[Math.min(vm.levels.length - 1, li + 1)])} onZoomOut={() => setFocus(vm.levels[Math.max(0, li - 1)])} onReset={() => setFocus('india')} />
          </section>
          <ScenarioBar s={vm.scen} year={year}
            onGsdpText={(txt) => { setEdit({ field: 'g', text: txt }); const v = parseFloat(txt); if (v > 0) setGsdpL(Math.max(vm.scen.g24L, Math.min(vm.scen.gsdpMax, v))); }}
            onGsdpSlide={(v) => { setEdit({ field: null, text: '' }); setGsdpL(v); }}
            onPopText={(txt) => { setEdit({ field: 'p', text: txt }); const v = parseFloat(txt); if (v > 0) setPopCr(v); }}
            onPopSlide={(v) => { setEdit({ field: null, text: '' }); setPopCr(v); }}
            onBlur={() => setEdit({ field: null, text: '' })} onReset={fresh} />
          <ChartsStrip vm={vm} year={year} onTrajHover={setHy} onCostHover={setHc} onZone={(o) => { resetInputs(); setScope('zone'); setFocus('zone'); setSel(o.z === zone ? sel : o.lead); }} />
        </div>
        <DetailPanel vm={vm} year={year} zone={zone} more={more} onMore={() => setMore(!more)} />
      </main>
    </div>
  );
}
