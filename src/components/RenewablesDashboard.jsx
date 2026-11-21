import React, { useCallback, useMemo, useState } from 'react';
import GlobeMap from './GlobeMap';
import { Header, Timeline, LeftPanel, MapOverlays, ScenarioBar, ChartsStrip, DetailPanel, StatusScreen } from './Panels';
import { THEMES, RE_TECH, RE_TECH_COLORS, ALL_ICON, MILESTONES, cssVars } from '../lib/theme';
import { fmtIN, pct, signPct, sum, nice } from '../lib/format';
import { STATE_TO_ZONE } from '../data/stateMapping';
import { groupedRenewable, RE_GROUP_KEYS, RE_STRATEGY, fy, twhStr } from '../lib/generation';

// Strictly renewable electricity GENERATION (= production, TWh) forecast to 2047.
// Uses the same generation model (public/generation_forecast.json — NPP + CEA RE generation +
// renewable_energy_dataset.csv population & GSDP drivers) as All sources, without non-renewable technologies
// (excludes coal, gas, and nuclear; keeps Solar, Wind, Hydro, Bio-mass, and Waste-to-energy).
// Challenge rule: only energy generated is used; no installed capacity or consumption is predicted.

const FIRST = 2024;
const twhParts = (v) => [fmtIN(v, Math.abs(v) >= 100 ? 0 : 1), 'TWh'];

export default function RenewablesDashboard({ data, G, dataErr, onRetry, themeName, onTheme, dashboard, onDashboard }) {
  const t = THEMES[themeName];
  const techColors = RE_TECH_COLORS[themeName];

  const [scope, setScope] = useState('india');          // 'india' | 'zone' (grid region) | 'state'
  const [region, setRegion] = useState('West');
  const [sel, setSel] = useState('Gujarat');            // selected state
  const [year, setYear] = useState(2030);
  const [focus, setFocus] = useState('india');
  const [tech, setTech] = useState('all');
  const [perPerson, setPerPerson] = useState(false);
  const [hover, setHover] = useState(null);
  const [hy, setHy] = useState(null);
  const [hc, setHc] = useState(null);
  const [more, setMore] = useState(false);
  const [outlook, setOutlook] = useState('dataset');
  const [mix, setMix] = useState('trend');
  const [growth, setGrowth] = useState(null);           // custom real GDP/GSDP growth, % a year (scope)
  const [popCr, setPopCr] = useState(null);             // custom population, crore (scope)
  const [edit, setEdit] = useState({ field: null, text: '' });

  const resetInputs = useCallback(() => { setGrowth(null); setPopCr(null); setEdit({ field: null, text: '' }); }, []);
  const pickRegion = (r) => { if (r !== region || scope !== 'zone') resetInputs(); setRegion(r); setScope('zone'); setFocus('zone'); setHover(null); };
  const pickState = (s) => { if (!G || !G.stateRegion(s)) return; if (s !== sel || scope !== 'state') resetInputs(); setSel(s); setRegion(G.stateRegion(s)); setScope('state'); setFocus('state'); setHover(null); };
  const pickScope = (s) => { if (s !== scope) resetInputs(); if (s === 'zone' && scope === 'state' && G) setRegion(G.stateRegion(sel)); setScope(s); setFocus(s); };
  const pickCrumb = (id) => { if (id === 'state') setFocus('state'); else pickScope(id); };
  const pickYear = (y) => { setYear(y); setHy(null); resetInputs(); };

  const vm = useMemo(() => {
    if (!G || !data) return null;
    const { M, BASE, regions, beta } = G;
    const isIndia = scope === 'india', isState = scope === 'state', isZone = scope === 'zone';
    const sc = isIndia ? 'India' : isState ? sel : region;
    const econ = isIndia ? 'GDP' : 'GSDP';
    const scopeName = isIndia ? 'India' : isState ? sel.replace(' And ', ' and ') : region + ' region';
    const regionOfScope = isState ? G.stateRegion(sel) : region;
    const flat = year <= BASE;
    const n = year - BASE;
    const years = Array.from({ length: 2047 - FIRST + 1 }, (_, i) => FIRST + i);

    // ---- proposed renewable generation by source (Solar, Wind, Hydro, Bio-mass, Waste-to-energy)
    const mixAt = (y) => (isIndia ? G.natMix(outlook, mix, y) : isState ? G.stateMix(outlook, mix, sel, y) : G.regMix(outlook, mix, region, y));
    const defTotal = (y) => sum(groupedRenewable(mixAt(y)));

    // ---- custom GDP/GSDP & population inputs (exact same elasticity equation as All sources)
    const drv = G.drivers(outlook, sc, Math.max(FIRST, year));
    const drv0 = G.drivers(outlook, sc, BASE);
    const popDef = drv.pop * 1e6;                                      // persons
    const yIdx = drv.inc * drv.pop / drv0.pop;                         // real GDP/GSDP index on the base year
    const dPrev = G.drivers(outlook, sc, Math.max(FIRST, year - 1));
    const dCurr = G.drivers(outlook, sc, Math.max(FIRST + 1, year));
    const gHist = ((dCurr.inc * dCurr.pop) / Math.max(dPrev.inc * dPrev.pop, 1e-9) - 1) * 100;
    const gDef = n > 0 ? (Math.pow(yIdx, 1 / n) - 1) * 100 : gHist;
    const custom = !flat && growth != null, popCustom = !flat && popCr != null;
    const anyCustom = custom || popCustom;
    const popUsed = popCustom ? popCr * 1e7 : popDef;
    // ln G = (1 - beta) ln P + beta ln Y (+ gamma u): custom GDP/GSDP or population scale the scope's generation.
    const ratio = !anyCustom ? 1
      : Math.pow(popUsed / popDef, 1 - beta) * (custom ? Math.pow((1 + growth / 100) / (1 + gDef / 100), beta * n) : 1);
    const total = defTotal(year) * ratio;

    const genArr = groupedRenewable(mixAt(year)).map((v) => v * ratio);
    const g0arr = groupedRenewable(mixAt(BASE));
    const prodTotal = sum(genArr);
    const shares = genArr.map((v) => (prodTotal > 0 ? v / prodTotal * 100 : 0));
    const order = RE_GROUP_KEYS.map((_, k) => k).sort((a, b) => genArr[b] - genArr[a]);

    // ---- map: per-state renewable generation (or chosen renewable source)
    const tk = tech === 'all' ? -1 : RE_GROUP_KEYS.indexOf(tech);
    const inScope = (st) => isIndia || (isState && st === sel) || (isZone && G.stateRegion(st) === region);
    const stVal = (st, y = year, useCustom = true) => {
      const live = useCustom && anyCustom && inScope(st);
      const k = live ? ratio : 1;
      const arr = groupedRenewable(G.stateMix(outlook, mix, st, y));
      const v = (tk < 0 ? sum(arr) : arr[tk]) * k;
      const pop = G.stateDrivers(outlook, st, y).pop * (live ? popUsed / popDef : 1);
      return perPerson ? v * 1e3 / pop : v;       // TWh / million people = 1e3 kWh
    };
    const names = G.stateNames.filter((st) => STATE_TO_ZONE[st]);
    const mapVals = {};
    names.forEach((st) => { mapVals[st] = stVal(st); });
    const fmtV = perPerson ? (v) => fmtIN(v, v < 100 ? 1 : 0) + ' kWh' : (v) => twhStr(v);
    const srcName = tk < 0 ? null : RE_TECH[tk].name;
    const metricName = (tk < 0 ? 'Renewable generation' : srcName + ' generation') + (perPerson ? ' per person' : '');
    const metricLower = (tk < 0 ? 'renewable generation' : srcName.toLowerCase() + ' generation') + (perPerson ? ' per person' : '');
    const pos = names.map((st) => stVal(st, year, false)).filter((x) => x > 0).sort((a, b) => a - b);
    const bins = [1, 2, 3, 4, 5].map((q) => nice(pos[Math.min(pos.length - 1, Math.floor(pos.length * q / 6))] || 0));
    for (let i = 1; i < bins.length; i++) if (bins[i] <= bins[i - 1]) bins[i] = bins[i - 1] * 1.5 + 0.1;
    const legend = [];
    for (let i = 5; i >= 0; i--) legend.push({ color: t.ramp[i], label: i === 5 ? fmtV(bins[4]) + ' and above' : i === 0 ? 'Below ' + fmtV(bins[0]) : fmtV(bins[i - 1]) + ' to ' + fmtV(bins[i]) });

    const shown = (v) => v >= (perPerson ? 0.5 : 0.05);
    const ranked = names.map((st) => ({ n: st, v: mapVals[st] })).filter((o) => shown(o.v)).sort((a, b) => b.v - a.v);
    const maxR = (ranked[0] && ranked[0].v) || 1;
    const topM = ranked.slice(0, 8).map((o, i) => ({ rank: i + 1, name: o.n, val: fmtV(o.v), w: Math.max(2, o.v / maxR * 100) + '%', on: o.n === sel && isState, bar: o.n === sel && isState ? t.gold : (tk < 0 ? t.muted : techColors[tk]) }));

    const mixRows = [{ id: 'all', name: 'All renewables', icon: ALL_ICON, color: t.gold, val: twhStr(prodTotal), share: '100%', w: '100%' }]
      .concat(RE_TECH.map((x, k) => ({ id: x.id, name: x.name, icon: x.icon, color: techColors[k], val: twhStr(genArr[k]), share: pct(shares[k]), w: Math.max(1, shares[k]) + '%' })));

    const hovering = hover && mapVals[hover] != null && !(isState && hover === sel);
    const scopeVal = perPerson ? total * 1e3 / (popUsed / 1e6) : total;
    const scopeKind = 'Renewable generation' + (perPerson ? ' per person' : '') + ' in ' + fy(year);
    const tip = isIndia
      ? { kind: scopeKind, name: scopeName, val: fmtV(scopeVal), sub: hover && mapVals[hover] != null ? { name: hover, val: fmtV(mapVals[hover]) } : null }
      : hovering ? { kind: metricName + ', pointer', name: hover.replace(' And ', ' and '), val: fmtV(mapVals[hover]) }
        : { kind: scopeKind, name: scopeName, val: fmtV(scopeVal) };

    // ---- trajectory (timeline + 5 small multiples)
    const traj = years.map((y) => groupedRenewable(mixAt(y)));
    const totSeries = years.map((y) => defTotal(y) * (y === year ? ratio : 1));
    const tlMax = Math.max(...totSeries) || 1;
    const hj = hy != null ? Math.max(0, Math.min(years.length - 1, hy)) : null;
    const tl = {
      bars: totSeries.map((v, j) => { const y = years[j], isM = MILESTONES.includes(y), cur = y === year; return { y, h: Math.max(3, v / tlMax * 48) + 'px', bg: cur ? t.gold : hj === j ? t.text2 : isM ? t.ink : t.muted, xl: isM || cur ? String(y) : '', cur, aria: `${y}, ${twhStr(v)}` }; }),
      value: twhStr(total),
      note: flat ? `${fy(year)}: reported renewable generation. Years after ${BASE} are forecasts.` : `${fy(year)} renewable generation forecast for ${scopeName}. Drag to change the year.`
    };
    const showJ = hj != null ? hj : year - FIRST;
    const cells = RE_TECH.map((x, k) => {
      const vals = traj.map((r) => r[k]);
      const mx = Math.max(...vals) || 1;
      const pts = vals.map((val, j) => [j * 10, 100 - val / mx * 92]);
      const v0 = vals[BASE - FIRST], vj = vals[showJ];
      const g = v0 > 0 ? (vj / v0 - 1) * 100 : 0;
      const growthTxt = years[showJ] <= BASE ? 'Reported' : v0 > 0 ? signPct(g) + ' on ' + BASE : (vj > 0 ? 'New after ' + BASE : '0% on ' + BASE);
      const line = 'M' + pts.map((p) => p[0] + ',' + p[1].toFixed(2)).join(' L');
      return { name: x.name, color: techColors[k], val: twhStr(vj), growth: growthTxt, gcol: years[showJ] <= BASE ? t.text3 : g >= 0 ? t.good : t.neg, line, area: 'M0,100 L' + line.slice(1) + ' L' + (vals.length - 1) * 10 + ',100 Z', peak: 'max ' + twhStr(mx) };
    });
    const trajInfo = {
      cells, selX: (year - FIRST) * 10, hovX: hj != null ? hj * 10 : null, width: (years.length - 1) * 10,
      title: `Renewable generation by source, ${FIRST} to 2047`,
      readout: hj != null ? fy(years[hj]) + ': ' + twhStr(sum(traj[hj])) + ' from renewable sources' : `${fy(year)}: ${twhStr(sum(traj[year - FIRST]))} renewable (${M.mixes[mix].label.toLowerCase()}). Hover a chart to read another year.`,
      aria: 'Five small line charts of ' + scopeName + ' renewable generation by source. ' + RE_TECH.map((x, k) => x.name + ' ' + twhStr(traj[0][k]) + ' to ' + twhStr(traj[traj.length - 1][k])).join('; ') + '.'
    };

    // ---- middle chart: added renewable output by source since base year (or shared-scale split for reported years)
    const deltas = RE_TECH.map((x, k) => ({
      k, name: x.name, color: techColors[k],
      base: g0arr[k], cur: genArr[k], diff: flat ? genArr[k] : genArr[k] - g0arr[k], share: shares[k]
    }));
    const dOrder = deltas.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const maxD = Math.max(...dOrder.map((d) => Math.abs(d.diff))) || 1;
    const hRow = hc != null ? deltas[hc] : null;
    const costMix = {
      title: flat ? `Renewable split on one scale, ${fy(year)}` : `Added renewable output, ${fy(BASE)} to ${fy(year)}`,
      rows: dOrder.map((d) => ({
        k: d.k, name: d.name, color: d.color,
        val: flat ? twhStr(d.cur) : (d.diff >= 0 ? '+' : '−') + twhStr(Math.abs(d.diff)),
        w: Math.abs(d.diff) / maxD * 100 + '%',
        op: hc == null || hc === d.k ? 1 : 0.45
      })),
      readout: hRow
        ? (flat
          ? `${hRow.name}: ${twhStr(hRow.cur)} (${pct(hRow.share)} of ${scopeName}'s renewable generation).`
          : `${hRow.name}: ${twhStr(hRow.base)} in ${fy(BASE)} → ${twhStr(hRow.cur)} in ${fy(year)} (${hRow.base > 0 ? signPct((hRow.cur / hRow.base - 1) * 100) : 'new'}).`)
        : (flat
          ? `Reported ${fy(year)} renewable generation in ${scopeName} on a shared scale.`
          : `Additional renewable TWh from each source in ${scopeName} since ${fy(BASE)}.`),
      aria: (flat ? 'Bar chart of renewable generation by source in ' : 'Bar chart of added renewable generation by source to ') + year + '. ' + dOrder.map((d) => d.name + ' ' + fmtIN(d.diff, 0) + ' TWh').join(', ') + '.'
    };

    // ---- regions list (renewable generation)
    const reRegVal = (r) => sum(groupedRenewable(G.regMix(outlook, mix, r, year))) * (anyCustom && (isIndia || (isZone && r === region)) ? ratio : 1);
    const zt = regions.map((r) => ({ z: r, v: reRegVal(r), lead: r })).sort((a, b) => b.v - a.v);
    const zMax = zt[0].v || 1;
    const zoneBars = zt.map((o) => ({ ...o, val: twhStr(o.v), w: o.v / zMax * 100 + '%', on: o.z === regionOfScope && !isIndia }));

    // ---- right panel: generation hero and tiles (same prediction framework as All sources, TWh only)
    const nb = G.natBand(outlook, year);
    const bandLo = flat ? null : total * nb.p10 / nb.p50;
    const bandHi = flat ? null : total * nb.p90 / nb.p50;
    const t0 = defTotal(BASE);
    const vsTxt = (a, base, aDef) => (flat
      ? 'Reported data'
      : anyCustom
        ? (aDef > 0 ? signPct((a / aDef - 1) * 100) + ' on default forecast' : 'Custom forecast')
        : (base > 0 ? `×${fmtIN(a / base, 2)} on ${fy(BASE)}` : `+${twhStr(a)} since ${fy(BASE)}`));
    const dcol = flat ? t.text3 : t.good;
    const heroParts = twhParts(total);
    const costBars = totSeries.map((c, j) => ({ h: Math.max(4, c / tlMax * 100) + '%', bg: years[j] === year ? t.gold : years[j] <= BASE ? t.text3 : t.muted }));
    const costHero = {
      title: `Renewable generation in ${fy(year)}`,
      val: heroParts[0], unit: heroParts[1], delta: vsTxt(total, t0, defTotal(year)), dcol,
      note: flat ? 'Reported renewable generation (solar, wind, hydro, bio-mass, waste-to-energy).' : `80% range ${fmtIN(bandLo, 0)}–${fmtIN(bandHi, 0)} TWh from model and year-to-year uncertainty.`,
      aria: `Bar chart of ${scopeName} renewable generation from ${FIRST} to 2047.`
    };
    const msIdx = MILESTONES.map((y) => years.indexOf(y)).filter((i) => i >= 0);
    const spark = (vals) => {
      const mn = Math.min(...vals), mx = Math.max(...vals), span = (mx - mn) || 1;
      const X = (y) => (y - FIRST) / (2047 - FIRST) * 64, Y = (val) => 22 - (val - mn) / span * 20;
      return { pts: msIdx.map((i, j) => X(years[i]).toFixed(1) + ',' + Y(vals[j]).toFixed(1)).join(' '), cx: X(year), cy: Y(vals[msIdx.length]) };
    };
    const at = (f) => msIdx.map((i) => f(years[i])).concat([f(year)]);
    const popAt = (y) => G.drivers(outlook, sc, y).pop;
    const perCap = total * 1e3 / (popUsed / 1e6);
    const needOf = (y) => defTotal(y);
    const reNatTotal = sum(groupedRenewable(G.natMix(outlook, mix, year))) * (isIndia ? ratio : 1);
    const natReAt = (y) => sum(groupedRenewable(G.natMix(outlook, mix, y)));
    const baseTot = sum(g0arr);
    const natShareCur = reNatTotal > 0 ? total / reNatTotal * 100 : 0;
    const natShareBase = natReAt(BASE) > 0 ? baseTot / natReAt(BASE) * 100 : 0;
    const tiles = (isIndia ? [
      { label: 'Renewables, 80% range', val: flat ? '–' : fmtIN(bandLo, 0) + '–' + fmtIN(bandHi, 0), unit: flat ? '' : 'TWh', delta: flat ? 'Reported year' : 'Median ' + twhStr(total), muted: true, ...spark(at(needOf)) },
    ] : [
      { label: "Share of India's RE", val: fmtIN(natShareCur, natShareCur < 10 ? 1 : 0), unit: '%', delta: `${fmtIN(natShareBase, natShareBase < 10 ? 1 : 0)}% in ${fy(BASE)}`, muted: true, ...spark(at((y) => { const nt = natReAt(y); return nt > 0 ? needOf(y) / nt * 100 : 0; })) },
    ]).concat([
      { label: 'Renewable per person', val: fmtIN(perCap, 0), unit: 'kWh a year', delta: popCustom ? 'Uses your population' : 'GitHub dataset projection', muted: true, ...spark(at((y) => needOf(y) * 1e3 / popAt(y))) },
      { label: 'Population', val: fmtIN(popUsed / 1e7, 1), unit: 'crore', delta: popCustom ? signPct((popUsed / popDef - 1) * 100) + ' on projection' : 'GitHub dataset projection', muted: true, ...spark(at((y) => popAt(y))) },
    ]).map((o) => ({ ...o, dcol: o.muted ? t.text3 : dcol }));

    // ---- why this forecast: exact additive renewable breakdown by source since FY2025-26
    let why = { state: flat ? 'flat' : 'ok', slow: false };
    if (!flat) {
      const g0 = sum(g0arr);
      const rows = RE_TECH.map((x, k) => ({
        label: x.name,
        value: `${twhStr(g0arr[k])} → ${twhStr(genArr[k])}`,
        twh: genArr[k] - g0arr[k]
      })).filter((p) => Math.abs(p.twh) >= 0.05);
      let run = g0;
      const steps = rows.map((r) => { const a = run; run += r.twh; return { ...r, a, b: run }; });
      const lo2 = Math.min(0, ...steps.map((s) => Math.min(s.a, s.b)));
      const hi2 = Math.max(g0, total, ...steps.map((s) => Math.max(s.a, s.b)));
      const P = (x) => (x - lo2) / ((hi2 - lo2) || 1) * 100;
      why = {
        state: 'ok', busy: false, slow: false,
        sub: `How much each renewable source adds to ${scopeName}'s renewable generation between ${fy(BASE)} and ${fy(year)}.`,
        baseLabel: fy(BASE) + ' actual', baseLeft: P(0), baseW: Math.max(0.6, P(g0) - P(0)), baseAmt: twhStr(g0),
        predLeft: P(0), predW: Math.max(0.6, P(total) - P(0)), predAmt: twhStr(total),
        rows: steps.map((s) => ({ label: s.label, value: s.value, amt: (s.twh >= 0 ? '+' : '−') + twhStr(Math.abs(s.twh)), left: P(Math.min(s.a, s.b)), w: Math.max(0.6, Math.abs(P(s.b) - P(s.a))), color: s.twh >= 0 ? t.pos : t.neg }))
      };
    }

    // ---- highlights (strictly renewable)
    const lead = order[0], second = order[1];
    const strat = !isIndia ? RE_STRATEGY[regionOfScope] : null;
    const restShare = order.slice(2).reduce((a, k) => a + shares[k], 0);
    const natPct = reNatTotal > 0 ? total / reNatTotal * 100 : 0;
    const insights = !isIndia ? [
      { mark: t.gold, title: (isState ? regionOfScope + ' region: ' : '') + strat.role, text: strat.actions[0] + '.' },
      { mark: techColors[lead], title: `${RE_TECH[lead].name} leads renewable output (${fmtIN(shares[lead], 0)}%)`, text: `${RE_TECH[second].name} adds ${fmtIN(shares[second], 0)}% (${twhStr(genArr[second])}). ${strat.actions[1]}.` },
      { mark: t.good, title: flat ? `${fy(year)} reported renewables: ${twhStr(total)}` : `Supplies ${fmtIN(natPct, natPct < 10 ? 1 : 0)}% of India's renewables`, text: `${t0 > 0 && !flat ? `Grows ×${fmtIN(total / t0, 2)} from ${twhStr(t0)} in ${fy(BASE)}. ` : ''}Policy basis: ${strat.policy}.` },
    ] : [
      { mark: techColors[lead], title: `${RE_TECH[lead].name} supplies ${fmtIN(shares[lead], 0)}% of renewable output`, text: `${RE_TECH[second].name} adds ${fmtIN(shares[second], 0)}%, while hydro, bio-mass and waste-to-energy provide ${fmtIN(restShare, 0)}%.` },
      flat
        ? { mark: t.gold, title: `${fy(year)} is reported data`, text: `India generated ${twhStr(total)} from solar, wind, hydro, bio-mass and waste-to-energy. Choose a later year to see the forecast.` }
        : { mark: t.gold, title: `Renewables grow ×${fmtIN(total / Math.max(t0, 1e-9), 2)} from ${fy(BASE)}`, text: `${twhStr(total)} in ${fy(year)} on the ${data.outlooks[outlook].label} outlook (${M.mixes[mix].label.toLowerCase()} pathway).` },
      { mark: t.ink, title: `${zt[0].z} region leads renewable generation`, text: `Produces ${twhStr(zt[0].v)} (${fmtIN(zt[0].v / Math.max(reNatTotal, 1e-9) * 100, 0)}% of India's renewables), followed by ${zt[1].z} (${twhStr(zt[1].v)}).` },
    ];

    // ---- scenario bar (Dataset trend default + Viksit Bharat; GDP for India, GSDP for Region/State)
    const outlooks = ['dataset', 'viksit'].filter((id) => data.outlooks[id]).map((id) => { const o = data.outlooks[id]; return { id, label: o.label, short: o.short, note: o.note }; });
    const gUsed = custom ? growth : gDef;
    const popDefCr = popDef / 1e7;
    const scen = {
      locked: flat, status: flat ? 'Reported data' : anyCustom ? 'Custom scenario' : 'Default projection', anyCustom,
      scopeNote: `Inputs set ${econ} growth and population for ${isIndia ? 'all of India' : scopeName}, scaling its renewable generation forecast.`,
      outlooks, outlook,
      mixes: Object.entries(M.mixes).map(([id, m]) => ({ id, label: m.label, note: `${m.label} renewable generation trajectory.` })),
      mix,
      gLabel: flat ? `Real ${econ} growth in ${fy(year)}, % a year` : `Real ${econ} growth, ${BASE} to ${year}, % a year`, gInputStep: 0.1, gAria: `${econ} growth`,
      gsdpText: edit.field === 'g' ? edit.text : gUsed.toFixed(1), nf: 1, gsdpMin: 2, gsdpMax: 11, gsdpStep: 0.1, gsdpVal: Math.min(11, Math.max(2, gUsed)),
      gsdpHint: flat ? `Reported year (${gUsed.toFixed(1)}% real growth in dataset). Choose a forecast year to adjust.` : `${custom ? 'Your input' : data.outlooks[outlook].label + ' outlook'}: ${gUsed.toFixed(1)}% a year${custom ? ` (outlook ${gDef.toFixed(1)}%)` : ''}. Generation responds with elasticity ${beta}.`,
      gsdpHintCol: custom ? t.gold : t.text3,
      popText: edit.field === 'p' ? edit.text : (popUsed / 1e7).toFixed(2), popMin: popDefCr * 0.8, popMax: popDefCr * 1.2, popStep: Math.max(0.001, popDefCr / 400), popVal: popUsed / 1e7,
      popHint: `Projected ${fmtIN(popDefCr, 2)} Cr${popCustom ? `. ${signPct((popUsed / popDef - 1) * 100)} on projection` : ''}`,
      popTail: 'Changes generation and per-person figures.',
      popHintCol: popCustom ? t.gold : t.text3,
      note: `More people raise generation with exponent ${fmtIN(1 - beta, 2)} at the same ${econ} (the rest is income per person).`,
      g24L: 2, n
    };

    // ---- accuracy and source table
    const B2 = M.backtest;
    const acc = [['Generation model (in use)', B2.mape.model], ['Naive 5-year trend', B2.mape.naive_trend]]
      .filter(([, v]) => v != null)
      .map(([name, v], i) => ({ name, value: v.toFixed(1) + '%', w: Math.min(100, v / 10 * 100) + '%', color: i === 0 ? t.gold : t.muted }));
    const table = RE_TECH.map((x, k) => ({ name: x.name, color: techColors[k], cells: [fmtIN(genArr[k], 1), pct(shares[k]), fmtIN(g0arr[k], 1), g0arr[k] > 0 ? '×' + fmtIN(genArr[k] / g0arr[k], 1) : '–'] }));

    const crumbs = [{ id: 'india', label: 'India' }].concat(isIndia ? [] : [{ id: 'zone', label: regionOfScope + ' region' }]).concat(isState ? [{ id: 'state', label: scopeName }] : []);
    return {
      names, scopeName, isIndia, isZone, flat, custom, anyCustom, metricName, metricLower, mapVals, bins, legend, fmtV,
      legendNote: `Colour bands are fixed to the default forecast, so your ${econ} and population inputs shift the colours.`,
      mixTitle: 'Renewable mix', mixSub: `${scopeName}, ${fy(year)}${flat ? ' (reported)' : ', renewable generation'}. Choose a source to shade the map by it.`,
      topTitle: 'Leading states', topSub: `Ranked by ${metricLower} in ${year}. Select one to fly to it.`,
      topM, mixRows, tip, tl, trajInfo, costMix, zoneBars,
      zoneTitle: `Renewable generation by region, ${fy(year)}`,
      zoneSub: 'Solar, wind, hydro, bio-mass and waste-to-energy. Select one to open it.',
      costBars, costHero, tiles, why, insights, scen, acc,
      accSub: `Mean absolute error of national generation 1–5 years ahead (rolling origins FY2013–FY2021, GitHub dataset GDP & population). Regional split: ${B2.regional_wape.model}% vs ${B2.regional_wape.naive_share}% for fixed shares.`,
      accNote: `Fitted on ${M.model.fit_years} using only NPP generation and GitHub dataset (renewable_energy_dataset.csv Population & GSDP). Elasticity ${M.model.beta} ± ${M.model.beta_se}. ${M.rule}`,
      statusLabel: `Generation model (RE), ${B2.mape.model}% backtest error`,
      tableTitle: `Renewable generation by source, ${fy(year)}`, tableHead: ['Source', 'TWh', 'Share', 'TWh ' + BASE, 'Growth'], table,
      tableNote: !isIndia
        ? `${isState ? regionOfScope + ' region strengths' : 'Strengths'}: ${strat.strengths.join('; ')}.`
        : `Pathway: ${M.mixes[mix].label}. Includes solar, wind, hydro (large + small), bio-mass and waste-to-energy; excludes coal, gas, and nuclear.`,
      moreLabel: more ? 'Show highlights' : 'Show source table and accuracy',
      hero: {
        kicker: isIndia ? `All of India, ${fy(year)}` : isState ? `${regionOfScope} region, ${fy(year)}` : `${G.M.states_by_region[region].length} states and UTs, ${fy(year)}`,
        title: scopeName,
        sub: flat ? 'Reported renewable generation from CEA and the National Power Portal.' : custom || popCustom ? 'Renewable forecast with your inputs.' : `Renewable forecast on the ${data.outlooks[outlook].label} outlook (${gDef.toFixed(1)}% real ${econ} growth a year), ${M.mixes[mix].label.toLowerCase()} pathway.`
      },
      levels: isIndia ? ['india'] : isZone ? ['india', 'zone'] : ['india', 'zone', 'state'], crumbs, years, regionOfScope
    };
  }, [G, data, scope, region, sel, year, tech, perPerson, hover, hy, hc, outlook, mix, growth, popCr, edit, more, t, techColors]);

  const pageStyle = { ...cssVars(t), height: '100vh', minHeight: 640, minWidth: 1200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' };
  const header = (
    <Header t={t} themeName={themeName} onTheme={onTheme}
      dashboard={dashboard} onDashboard={onDashboard}
      scope={scope} onScope={pickScope} sel={scope === 'state' ? sel : region}
      states={G ? (scope === 'state' ? G.stateNames.filter((x) => STATE_TO_ZONE[x]).sort() : G.regions) : []} onSelect={scope === 'state' ? pickState : pickRegion}
      year={year} onYear={pickYear} status={vm ? { label: vm.statusLabel, dot: t.good } : { label: dataErr ? 'Forecast data missing' : 'Loading forecast', dot: dataErr ? t.neg : t.warn }}
      busy={false} />
  );

  if (!vm) {
    return (
      <div style={pageStyle}>
        {header}
        <StatusScreen error={dataErr} onRetry={onRetry} />
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
          <section aria-label="Map" style={{ flex: '1 0 auto', height: 'max(440px, calc(100vh - 530px))', position: 'relative', overflow: 'hidden', background: 'var(--space)' }}>
            <GlobeMap th={t} values={vm.mapVals} bins={vm.bins} selected={scope === 'state' ? sel : ''} zone={vm.regionOfScope}
              zoneOf={STATE_TO_ZONE} scope={scope === 'zone' ? 'zone' : 'state'} focus={focus}
              hovered={hover} onPick={pickState} onHover={(s) => setHover(s)} valueLabel={vm.fmtV} />
            <MapOverlays vm={vm} year={year} focus={focus} onFocus={pickCrumb} perPerson={perPerson} onPerPerson={setPerPerson}
              onZoomIn={() => setFocus(vm.levels[Math.min(vm.levels.length - 1, li + 1)])} onZoomOut={() => setFocus(vm.levels[Math.max(0, li - 1)])} onReset={() => pickScope('india')} />
          </section>
          <ScenarioBar s={vm.scen} year={year}
            onGsdpText={(txt) => { setEdit({ field: 'g', text: txt }); const v = parseFloat(txt); if (Number.isFinite(v)) setGrowth(Math.max(-5, Math.min(15, v))); }}
            onOutlook={(o) => { setOutlook(o); resetInputs(); }}
            onMix={(m) => setMix(m)}
            onGsdpSlide={(v) => { setEdit({ field: null, text: '' }); setGrowth(v); }}
            onPopText={(txt) => { setEdit({ field: 'p', text: txt }); const v = parseFloat(txt); if (v > 0) setPopCr(v); }}
            onPopSlide={(v) => { setEdit({ field: null, text: '' }); setPopCr(v); }}
            onBlur={() => setEdit({ field: null, text: '' })} onReset={() => { resetInputs(); setHover(null); }} />
          <ChartsStrip vm={vm} year={year} onTrajHover={setHy} onCostHover={setHc} onZone={(o) => pickRegion(o.z)} />
        </div>
        <DetailPanel vm={vm} year={year} zone={region} more={more} onMore={() => setMore(!more)} />
      </main>
    </div>
  );
}
