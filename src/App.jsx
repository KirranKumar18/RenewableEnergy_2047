import React, { useCallback, useEffect, useMemo, useState } from 'react';
import GlobeMap from './components/GlobeMap';
import RenewablesDashboard from './components/RenewablesDashboard';
import { Header, Timeline, LeftPanel, MapOverlays, ScenarioBar, ChartsStrip, DetailPanel, StatusScreen } from './components/Panels';
import { THEMES, TECH, ALL_ICON, MILESTONES, cssVars } from './lib/theme';
import { fmtIN, pct, signPct, sum, nice } from './lib/format';
import { STATE_TO_ZONE } from './data/stateMapping';
import { makeModel, grouped, GROUP_KEYS, CLEAN_GROUPS, fy, twhStr } from './lib/generation';

// Two dashboards sharing the same generation forecast model (public/generation_forecast.json —
// NPP + CEA RE generation + renewable_energy_dataset.csv population & GSDP drivers; no installed capacity):
//  - "all": India Generation Outlook (all sources — coal, solar, wind, hydro, nuclear, gas, bio & waste).
//  - "renewables": India Renewable Outlook (strictly renewable technologies — solar, wind, hydro, bio-mass, waste-to-energy).

const FIRST = 2024;
const twhParts = (v) => [fmtIN(v, Math.abs(v) >= 100 ? 0 : 1), 'TWh'];

function AllSourcesDashboard({ data, G, dataErr, onRetry, themeName, onTheme, dashboard, onDashboard }) {
  const t = THEMES[themeName];

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
  const [mix, setMix] = useState('balanced');
  const [growth, setGrowth] = useState(null);           // custom real GDP growth, % a year (scope)
  const [popCr, setPopCr] = useState(null);             // custom population, crore (scope)
  const [edit, setEdit] = useState({ field: null, text: '' });

  const resetInputs = useCallback(() => { setGrowth(null); setPopCr(null); setEdit({ field: null, text: '' }); }, []);
  const pickRegion = (r) => { if (r !== region || scope !== 'zone') resetInputs(); setRegion(r); setScope('zone'); setFocus('zone'); setHover(null); };
  const pickState = (s) => { if (!G || !G.stateRegion(s)) return; if (s !== sel || scope !== 'state') resetInputs(); setSel(s); setRegion(G.stateRegion(s)); setScope('state'); setFocus('state'); setHover(null); };
  const pickScope = (s) => { if (s !== scope) resetInputs(); if (s === 'zone' && scope === 'state' && G) setRegion(G.stateRegion(sel)); setScope(s); setFocus(s); };
  const pickCrumb = (id) => { if (id === 'state') setFocus('state'); else pickScope(id); };
  const pickYear = (y) => { setYear(y); setHy(null); resetInputs(); };

  const vm = useMemo(() => {
    if (!G) return null;
    const { M, BASE, regions, beta } = G;
    const isIndia = scope === 'india', isState = scope === 'state', isZone = scope === 'zone';
    const sc = isIndia ? 'India' : isState ? sel : region;
    const scopeName = isIndia ? 'India' : isState ? sel.replace(' And ', ' and ') : region + ' region';
    const regionOfScope = isState ? G.stateRegion(sel) : region;
    const flat = year <= BASE;
    const n = year - BASE;
    const years = Array.from({ length: 2047 - FIRST + 1 }, (_, i) => FIRST + i);

    // ---- scope totals (default) and custom inputs
    const defTotal = (y) => (isIndia ? G.natTotal(outlook, y) : isState ? G.stateNeed(outlook, sel, y) : G.need(outlook, region, y));
    const drv = G.drivers(outlook, sc, Math.max(FIRST, year));
    const drv0 = G.drivers(outlook, sc, BASE);
    const popDef = drv.pop * 1e6;                                      // persons
    const yIdx = drv.inc * drv.pop / drv0.pop;                         // real GDP/GSDP index on the base year
    const gDef = n > 0 ? (Math.pow(yIdx, 1 / n) - 1) * 100 : 0;
    const custom = !flat && growth != null, popCustom = !flat && popCr != null;
    const anyCustom = custom || popCustom;
    const popUsed = popCustom ? popCr * 1e7 : popDef;
    // ln G = (1 - beta) ln P + beta ln Y (+ gamma u): custom GDP or population scale the scope's generation exactly.
    const ratio = !anyCustom ? 1
      : Math.pow(popUsed / popDef, 1 - beta) * (custom ? Math.pow((1 + growth / 100) / (1 + gDef / 100), beta * n) : 1);
    const total = defTotal(year) * ratio;

    // ---- proposed mix (generation by source)
    const mixAt = (y) => (isIndia ? G.natMix(outlook, mix, y) : isState ? G.stateMix(outlook, mix, sel, y) : G.regMix(outlook, mix, region, y));
    const mixScale = isIndia ? ratio : 1;                              // regions: inputs move the need, not the plants
    const genArr = grouped(mixAt(year)).map((v) => v * mixScale);
    const prodTotal = sum(genArr);
    const shares = genArr.map((v) => (prodTotal > 0 ? v / prodTotal * 100 : 0));
    const order = GROUP_KEYS.map((_, k) => k).sort((a, b) => genArr[b] - genArr[a]);
    const cleanShare = (arr) => { const s = sum(arr); return s ? CLEAN_GROUPS.reduce((a, g) => a + arr[GROUP_KEYS.indexOf(g)], 0) / s * 100 : 0; };

    // ---- map: per-state production need (or proposed generation of the chosen source)
    const tk = tech === 'all' ? -1 : GROUP_KEYS.indexOf(tech);
    const inScope = (st) => isIndia || (isState && st === sel) || (isZone && G.stateRegion(st) === region);
    const stVal = (st, y = year, useCustom = true) => {
      const live = useCustom && anyCustom && inScope(st);
      const k = live ? (tk < 0 || isIndia ? ratio : 1) : 1;
      const v = (tk < 0 ? G.stateNeed(outlook, st, y) : grouped(G.stateMix(outlook, mix, st, y))[tk]) * k;
      const pop = G.stateDrivers(outlook, st, y).pop * (live ? popUsed / popDef : 1);
      return perPerson ? v * 1e3 / pop : v;       // TWh / million people = 1e3 kWh
    };
    const names = G.stateNames.filter((st) => STATE_TO_ZONE[st]);
    const mapVals = {};
    names.forEach((st) => { mapVals[st] = stVal(st); });
    const fmtV = perPerson ? (v) => fmtIN(v, v < 100 ? 1 : 0) + ' kWh' : (v) => twhStr(v);
    const srcName = tk < 0 ? null : TECH[tk].name;
    const metricName = (tk < 0 ? 'Production need' : srcName + ' generation') + (perPerson ? ' per person' : '');
    const metricLower = (tk < 0 ? 'production need' : srcName.toLowerCase() + ' generation') + (perPerson ? ' per person' : '');
    const pos = names.map((st) => stVal(st, year, false)).filter((x) => x > 0).sort((a, b) => a - b);   // colour bands stay on the default forecast
    const bins = [1, 2, 3, 4, 5].map((q) => nice(pos[Math.min(pos.length - 1, Math.floor(pos.length * q / 6))] || 0));
    for (let i = 1; i < bins.length; i++) if (bins[i] <= bins[i - 1]) bins[i] = bins[i - 1] * 1.5 + 0.1;
    const legend = [];
    for (let i = 5; i >= 0; i--) legend.push({ color: t.ramp[i], label: i === 5 ? fmtV(bins[4]) + ' and above' : i === 0 ? 'Below ' + fmtV(bins[0]) : fmtV(bins[i - 1]) + ' to ' + fmtV(bins[i]) });

    // States that show as zero (e.g. no nuclear plant) are left out of the ranking instead of trailing it alphabetically.
    const shown = (v) => v >= (perPerson ? 0.5 : 0.05);
    const ranked = names.map((st) => ({ n: st, v: mapVals[st] })).filter((o) => shown(o.v)).sort((a, b) => b.v - a.v);
    const maxR = (ranked[0] && ranked[0].v) || 1;
    const topM = ranked.slice(0, 8).map((o, i) => ({ rank: i + 1, name: o.n, val: fmtV(o.v), w: Math.max(2, o.v / maxR * 100) + '%', on: o.n === sel && isState, bar: o.n === sel && isState ? t.gold : (tk < 0 ? t.muted : t.tech[tk]) }));

    const mixRows = [{ id: 'all', name: 'All sources', icon: ALL_ICON, color: t.gold, val: twhStr(prodTotal), share: '100%', w: '100%' }]
      .concat(TECH.map((x, k) => ({ id: x.id, name: x.name, icon: x.icon, color: t.tech[k], val: twhStr(genArr[k]), share: pct(shares[k]), w: Math.max(1, shares[k]) + '%' })));

    const hovering = hover && mapVals[hover] != null && !(isState && hover === sel);
    const scopeVal = perPerson ? total * 1e3 / (popUsed / 1e6) : total;
    const tip = isIndia
      ? { kind: (isIndia ? 'Generation' : 'Production need') + (perPerson ? ' per person' : '') + ' in ' + fy(year), name: scopeName, val: fmtV(scopeVal), sub: hover && mapVals[hover] != null ? { name: hover, val: fmtV(mapVals[hover]) } : null }
      : hovering ? { kind: metricName + ', pointer', name: hover.replace(' And ', ' and '), val: fmtV(mapVals[hover]) }
        : { kind: 'Production need' + (perPerson ? ' per person' : '') + ' in ' + fy(year), name: scopeName, val: fmtV(scopeVal) };

    // ---- trajectory (timeline + small multiples)
    const traj = years.map((y) => grouped(mixAt(y)));
    const totSeries = years.map((y) => defTotal(y) * (y === year ? ratio : 1));
    const tlMax = Math.max(...totSeries) || 1;
    const hj = hy != null ? Math.max(0, Math.min(years.length - 1, hy)) : null;
    const tl = {
      bars: totSeries.map((v, j) => { const y = years[j], isM = MILESTONES.includes(y), cur = y === year; return { y, h: Math.max(3, v / tlMax * 48) + 'px', bg: cur ? t.gold : hj === j ? t.text2 : isM ? t.ink : t.muted, xl: isM || cur ? String(y) : '', cur, aria: `${y}, ${twhStr(v)}` }; }),
      value: twhStr(total),
      note: flat ? `${fy(year)}: reported generation. Years after ${BASE} are forecasts.` : `${fy(year)} forecast for ${scopeName}${isIndia ? '' : ' (production need)'}. Drag to change the year.`
    };
    const showJ = hj != null ? hj : year - FIRST;
    const cells = TECH.map((x, k) => {
      const vals = traj.map((r) => r[k]);
      const mx = Math.max(...vals) || 1;
      const pts = vals.map((val, j) => [j * 10, 100 - val / mx * 92]);
      const v0 = vals[BASE - FIRST], vj = vals[showJ];
      const g = v0 > 0 ? (vj / v0 - 1) * 100 : 0;
      const line = 'M' + pts.map((p) => p[0] + ',' + p[1].toFixed(2)).join(' L');
      return { name: x.name, color: t.tech[k], val: twhStr(vj), growth: years[showJ] <= BASE ? 'Reported' : signPct(g) + ' on ' + BASE, gcol: years[showJ] <= BASE ? t.text3 : g >= 0 ? t.good : t.neg, line, area: 'M0,100 L' + line.slice(1) + ' L' + (vals.length - 1) * 10 + ',100 Z', peak: 'max ' + twhStr(mx) };
    });
    const trajInfo = {
      cells, selX: (year - FIRST) * 10, hovX: hj != null ? hj * 10 : null, width: (years.length - 1) * 10,
      title: `Generation by source, ${FIRST} to 2047`,
      readout: hj != null ? fy(years[hj]) + ': ' + twhStr(sum(traj[hj])) + ' from all sources' : `${fy(year)}: ${twhStr(sum(traj[year - FIRST]))} proposed (${M.mixes[mix].label.toLowerCase()}). Hover a chart to read another year.`,
      aria: 'Small line charts of ' + scopeName + ' generation by source. ' + TECH.map((x, k) => x.name + ' ' + twhStr(traj[0][k]) + ' to ' + twhStr(traj[traj.length - 1][k])).join('; ') + '.'
    };

    // ---- regional balance (proposed production minus need), as the middle chart
    const prodOf = (r, y = year) => sum(grouped(G.regMix(outlook, mix, r, y)));
    const prodScope = (y) => sum(grouped(mixAt(y)));
    const bal = regions.map((r) => ({ r, net: prodOf(r) - G.need(outlook, r, year) }));
    const maxBal = Math.max(...bal.map((b) => Math.abs(b.net))) || 1;
    const balOrder = bal.slice().sort((a, b) => b.net - a.net);
    const costMix = {
      title: `Net trade between regions, ${fy(year)}`,
      rows: balOrder.map((b) => { const k = regions.indexOf(b.r); return { k, name: b.r, color: b.net >= 0 ? t.pos : t.neg, val: (b.net >= 0 ? '+' : '−') + twhStr(Math.abs(b.net)), w: Math.abs(b.net) / maxBal * 100 + '%', op: hc == null || hc === k ? 1 : 0.45 }; }),
      readout: hc != null && bal[hc]
        ? `${regions[hc]}: proposed ${twhStr(prodOf(regions[hc]))} vs need ${twhStr(G.need(outlook, regions[hc], year))}. ${bal[hc].net >= 0 ? 'Exports' : 'Imports'} the difference over the national grid.`
        : flat ? 'Reported years: production and need are the same by definition.' : 'Proposed production minus production need. + exports, − imports.',
      aria: 'Bar chart of net trade by region in ' + year + '. ' + balOrder.map((b) => b.r + ' ' + fmtIN(b.net, 0) + ' TWh').join(', ') + '.'
    };

    // ---- regions list (need)
    const zt = regions.map((r) => ({ z: r, v: G.need(outlook, r, year), lead: r })).sort((a, b) => b.v - a.v);
    const zMax = zt[0].v || 1;
    const zoneBars = zt.map((o) => ({ ...o, val: twhStr(o.v), w: o.v / zMax * 100 + '%', on: o.z === regionOfScope && !isIndia }));

    // ---- right panel: generation hero and tiles
    const band = isIndia ? G.natBand(outlook, year) : null;
    const nb = G.natBand(outlook, year);
    const bandLo = flat ? null : (band ? band.p10 : total * nb.p10 / nb.p50) * (isIndia ? ratio : 1);
    const bandHi = flat ? null : (band ? band.p90 : total * nb.p90 / nb.p50) * (isIndia ? ratio : 1);
    const t0 = defTotal(BASE);
    const vsTxt = (a, base, aDef) => (flat ? 'Reported data' : anyCustom ? signPct((a / aDef - 1) * 100) + ' on default forecast' : `×${fmtIN(a / base, 2)} on ${fy(BASE)}`);
    const dcol = flat ? t.text3 : t.good;
    const heroParts = twhParts(total);
    const costBars = totSeries.map((c, j) => ({ h: Math.max(4, c / tlMax * 100) + '%', bg: years[j] === year ? t.gold : years[j] <= BASE ? t.text3 : t.muted }));
    const costHero = {
      title: `${isIndia ? 'Generation' : 'Production need'} in ${fy(year)}`,
      val: heroParts[0], unit: heroParts[1], delta: vsTxt(total, t0, defTotal(year)), dcol,
      note: flat ? 'Reported generation (CEA / National Power Portal).' : `80% range ${fmtIN(bandLo, 0)}–${fmtIN(bandHi, 0)} TWh from model and year-to-year uncertainty.`,
      aria: `Bar chart of ${scopeName} generation from ${FIRST} to 2047.`
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
    const cs = cleanShare(genArr), cs0 = cleanShare(grouped(mixAt(BASE)));
    const needOf = (y) => defTotal(y);
    const tiles = (isIndia ? [
      { label: 'Generation, 80% range', val: flat ? '–' : fmtIN(bandLo, 0) + '–' + fmtIN(bandHi, 0), unit: flat ? '' : 'TWh', delta: flat ? 'Reported year' : 'Median ' + twhStr(total), muted: true, ...spark(at(needOf)) },
      { label: 'Clean share of generation', val: fmtIN(cs, 0), unit: '%', delta: `${fmtIN(cs0, 0)}% in ${fy(BASE)}`, ...spark(at((y) => cleanShare(grouped(mixAt(y))))) },
    ] : [
      { label: 'Proposed production', val: twhParts(prodTotal)[0], unit: 'TWh', delta: 'Resource-based mix, ' + M.mixes[mix].label.toLowerCase(), muted: true, ...spark(at(prodScope)) },
      { label: prodTotal >= total ? 'Net exports' : 'Net imports', val: fmtIN(Math.abs(prodTotal - total), 0), unit: 'TWh', delta: flat ? 'Reported year' : `${fmtIN(Math.abs(prodTotal - total) / Math.max(total, 1e-9) * 100, 0)}% of the need`, muted: true, ...spark(at((y) => prodScope(y) - defTotal(y))) },
    ]).concat([
      { label: 'Generation per person', val: fmtIN(perCap, 0), unit: 'kWh a year', delta: popCustom ? 'Uses your population' : 'UN WPP 2024 population', muted: true, ...spark(at((y) => needOf(y) * 1e3 / popAt(y))) },
      { label: 'Population', val: fmtIN(popUsed / 1e7, 1), unit: 'crore', delta: popCustom ? signPct((popUsed / popDef - 1) * 100) + ' on projection' : 'Projected', muted: true, ...spark(at((y) => popAt(y))) },
      { label: 'Urban share', val: fmtIN(drv.urban, 1), unit: '%', delta: `${fmtIN(drv0.urban, 1)}% in ${fy(BASE)}`, muted: true, ...spark(at((y) => G.drivers(outlook, sc, y).urban)) },
      { label: isIndia ? 'Coal share of generation' : 'Clean share of production', val: fmtIN(isIndia ? shares[0] : cs, 0), unit: '%', delta: isIndia ? `${fmtIN(grouped(mixAt(BASE))[0] / sum(grouped(mixAt(BASE))) * 100, 0)}% in ${fy(BASE)}` : `${fmtIN(cs0, 0)}% in ${fy(BASE)}`, muted: true, ...spark(at((y) => { const a = grouped(mixAt(y)); return isIndia ? a[0] / sum(a) * 100 : cleanShare(a); })) },
    ]).map((o) => ({ ...o, dcol: o.muted ? t.text3 : dcol }));

    // ---- why this forecast: exact split of growth since the base year
    let why = { state: flat ? 'flat' : 'ok', slow: false };
    if (!flat) {
      const bd = G.breakdown(outlook, sc, year, total);
      const rows = bd.parts.filter((p) => Math.abs(p.twh) >= 0.05);
      let run = bd.g0;
      const steps = rows.map((r) => { const a = run; run += r.twh; return { ...r, a, b: run }; });
      const lo2 = Math.min(0, ...steps.map((s) => Math.min(s.a, s.b)));
      const hi2 = Math.max(bd.g0, total, ...steps.map((s) => Math.max(s.a, s.b)));
      const P = (x) => (x - lo2) / ((hi2 - lo2) || 1) * 100;
      why = {
        state: 'ok', busy: false, slow: false, sub: `How much each driver adds to ${scopeName}'s ${isIndia ? 'generation' : 'production need'} between ${fy(BASE)} and ${fy(year)}. Exact split of the model equation.`,
        baseLabel: fy(BASE) + ' actual', baseLeft: P(0), baseW: Math.max(0.6, P(bd.g0) - P(0)), baseAmt: twhStr(bd.g0),
        predLeft: P(0), predW: Math.max(0.6, P(total) - P(0)), predAmt: twhStr(total),
        rows: steps.map((s) => ({ label: s.label, value: s.value, amt: (s.twh >= 0 ? '+' : '−') + twhStr(Math.abs(s.twh)), left: P(Math.min(s.a, s.b)), w: Math.max(0.6, Math.abs(P(s.b) - P(s.a))), color: s.twh >= 0 ? t.pos : t.neg }))
      };
    }

    // ---- highlights: region strategy or national pathway
    const lead = order[0], second = order[1];
    const strat = !isIndia ? M.strategy[regionOfScope] : null;
    const insights = !isIndia ? [
      { mark: t.gold, title: (isState ? regionOfScope + ' region: ' : '') + strat.role, text: strat.actions[0] + '.' },
      { mark: t.tech[lead], title: `${TECH[lead].name} leads the proposed mix (${fmtIN(shares[lead], 0)}%)`, text: `${TECH[second].name} adds ${fmtIN(shares[second], 0)}%. ${strat.actions[1]}.` },
      { mark: prodTotal >= total ? t.pos : t.neg, title: flat ? 'Reported year' : `${prodTotal >= total ? 'Exports' : 'Imports'} ${twhStr(Math.abs(prodTotal - total))} in ${fy(year)}`, text: `Need ${twhStr(total)}, proposed production ${twhStr(prodTotal)}${isState ? ', traded with other states' : ''}. Policy basis: ${strat.policy}.` },
    ] : [
      { mark: t.tech[lead], title: `${TECH[lead].name} supplies ${fmtIN(shares[lead], 0)}% of generation`, text: `${TECH[second].name} adds ${fmtIN(shares[second], 0)}%. Clean sources reach ${fmtIN(cs, 0)}% (${fmtIN(cs0, 0)}% in ${fy(BASE)}).` },
      flat ? { mark: t.gold, title: `${fy(year)} is reported data`, text: `India generated ${twhStr(total)}. Choose a later year to see the forecast.` }
        : { mark: t.gold, title: `Generation grows ×${fmtIN(total / t0, 2)} from ${fy(BASE)}`, text: `${twhStr(total)} in ${fy(year)} on the ${data.outlooks[outlook].label} outlook. ${M.mixes[mix].note}` },
      { mark: t.ink, title: 'Regions trade over the grid', text: `${balOrder[0].r} exports the most (${twhStr(Math.max(0, balOrder[0].net))}); ${balOrder[balOrder.length - 1].r} imports the most (${twhStr(Math.max(0, -balOrder[balOrder.length - 1].net))}).` },
    ];

    // ---- scenario bar
    const outlooks = ['dataset', 'viksit'].filter((id) => data.outlooks[id]).map((id) => { const o = data.outlooks[id]; return { id, label: o.label, short: o.short, note: o.note }; });
    const gUsed = custom ? growth : gDef;
    const popDefCr = popDef / 1e7;
    const scen = {
      locked: flat, status: flat ? 'Reported data' : anyCustom ? 'Custom scenario' : 'Default projection', anyCustom,
      scopeNote: isIndia ? 'Inputs set GDP growth and population for all of India.' : `Inputs set GSDP growth and population for ${scopeName}. They move its production need; the proposed plants stay as planned.`,
      outlooks, outlook, mixes: Object.entries(M.mixes).map(([id, m]) => ({ id, label: m.label, note: m.note })), mix,
      gLabel: `Real ${isIndia ? 'GDP' : 'GSDP'} growth, ${BASE} to ${year}, % a year`, gInputStep: 0.1, gAria: isIndia ? 'GDP growth' : 'GSDP growth',
      gsdpText: edit.field === 'g' ? edit.text : gUsed.toFixed(1), nf: 1, gsdpMin: 2, gsdpMax: 11, gsdpStep: 0.1, gsdpVal: Math.min(11, Math.max(2, gUsed)),
      gsdpHint: flat ? 'Reported year.' : `${custom ? 'Your input' : data.outlooks[outlook].label + ' outlook'}: ${gUsed.toFixed(1)}% a year${custom ? ` (outlook ${gDef.toFixed(1)}%)` : ''}. Generation responds with elasticity ${beta}.`,
      gsdpHintCol: custom ? t.gold : t.text3,
      popText: edit.field === 'p' ? edit.text : (popUsed / 1e7).toFixed(2), popMin: popDefCr * 0.8, popMax: popDefCr * 1.2, popStep: Math.max(0.001, popDefCr / 400), popVal: popUsed / 1e7,
      popHint: `Projected ${fmtIN(popDefCr, 2)} Cr${popCustom ? `. ${signPct((popUsed / popDef - 1) * 100)} on projection` : ''}`,
      popTail: 'Changes generation and per-person figures.',
      popHintCol: popCustom ? t.gold : t.text3,
      note: `More people raise generation with exponent ${fmtIN(1 - beta, 2)} at the same GDP (the rest is income per person).`,
      g24L: 2, n
    };

    // ---- accuracy and table
    const B2 = M.backtest;
    const acc = [['Generation model (in use)', B2.mape.model], ['Without urbanization', B2.mape.model_no_urban], ['Naive 5-year trend', B2.mape.naive_trend]]
      .map(([name, v], i) => ({ name, value: v.toFixed(1) + '%', w: Math.min(100, v / 10 * 100) + '%', color: i === 0 ? t.gold : t.muted }));
    const g0arr = grouped(mixAt(BASE));
    const table = TECH.map((x, k) => ({ name: x.name, color: t.tech[k], cells: [fmtIN(genArr[k], 1), pct(shares[k]), fmtIN(g0arr[k], 1), g0arr[k] > 0 ? '×' + fmtIN(genArr[k] / g0arr[k], 1) : '–'] }));

    const crumbs = [{ id: 'india', label: 'India' }].concat(isIndia ? [] : [{ id: 'zone', label: regionOfScope + ' region' }]).concat(isState ? [{ id: 'state', label: scopeName }] : []);
    return {
      names, scopeName, isIndia, isZone, flat, custom, anyCustom, metricName, metricLower, mapVals, bins, legend, fmtV,
      legendNote: 'Colour bands are fixed to the default forecast, so your GDP and population inputs shift the colours.',
      mixTitle: 'Generation mix', mixSub: `${scopeName}, ${fy(year)}${flat ? ' (reported)' : ', proposed mix'}. Choose a source to shade the map by it.`,
      topTitle: 'Leading states', topSub: `Ranked by ${metricLower} in ${year}. Select one to fly to it.`,
      topM, mixRows, tip, tl, trajInfo, costMix, zoneBars, zoneTitle: `Production need by region, ${fy(year)}`, zoneSub: 'Population, income and urbanization. Select one to open it.',
      costBars, costHero, tiles, why, insights, scen, acc,
      accSub: `Mean absolute error of national generation 1–5 years ahead (rolling origins FY2013–FY2021, actual GDP given). Regional split: ${B2.regional_wape.model}% vs ${B2.regional_wape.naive_share}% for fixed shares.`,
      accNote: `Elasticity of generation per person to income per person ${M.model.beta} ± ${M.model.beta_se}; urbanization ${M.model.gamma} ± ${M.model.gamma_se}. Fitted on ${M.model.fit_years}. ${M.rule}`,
      statusLabel: `Generation model, ${B2.mape.model}% backtest error`,
      tableTitle: `Generation by source, ${fy(year)}`, tableHead: ['Source', 'TWh', 'Share', 'TWh ' + BASE, 'Growth'], table,
      tableNote: !isIndia ? `${isState ? regionOfScope + ' region strengths' : 'Strengths'}: ${strat.strengths.join('; ')}.` : `Mix pathway: ${M.mixes[mix].label}. Hydro = large + small hydro; Bio & waste = biomass, bagasse and waste-to-energy.`,
      moreLabel: more ? 'Show highlights' : 'Show source table and accuracy',
      hero: {
        kicker: isIndia ? `All of India, ${fy(year)}` : isState ? `${regionOfScope} region, ${fy(year)}` : `${G.M.states_by_region[region].length} states and UTs, ${fy(year)}`,
        title: scopeName,
        sub: flat ? 'Reported generation from CEA and the National Power Portal.' : custom || popCustom ? 'Forecast with your inputs.' : `Forecast on the ${data.outlooks[outlook].label} outlook (${gDef.toFixed(1)}% real growth a year), ${M.mixes[mix].label.toLowerCase()} mix.`
      },
      levels: isIndia ? ['india'] : isZone ? ['india', 'zone'] : ['india', 'zone', 'state'], crumbs, years, regionOfScope
    };
  }, [G, data, scope, region, sel, year, tech, perPerson, hover, hy, hc, outlook, mix, growth, popCr, edit, more, t]);

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

export default function App() {
  const [themeName, setThemeName] = useState('atlas');
  const [dashboard, setDashboard] = useState(() => (window.location.hash === '#renewables' ? 'renewables' : 'all'));
  const [data, setData] = useState(null);
  const [dataErr, setDataErr] = useState(null);

  const load = useCallback(() => {
    setDataErr(null);
    fetch('/generation_forecast.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(setData).catch((e) => setDataErr(String(e.message || e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  const G = useMemo(() => (data ? makeModel(data) : null), [data]);

  const pickDashboard = useCallback((d) => {
    setDashboard(d);
    window.history.replaceState(null, '', d === 'renewables' ? '#renewables' : window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const onHash = () => setDashboard(window.location.hash === '#renewables' ? 'renewables' : 'all');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = dashboard === 'renewables'
      ? 'India Renewable Outlook — Renewable generation to 2047'
      : 'India Generation Outlook — Electricity production to 2047';
  }, [dashboard]);

  const toggleTheme = useCallback(() => setThemeName((cur) => (cur === 'night' ? 'atlas' : 'night')), []);

  if (dashboard === 'renewables') {
    return <RenewablesDashboard data={data} G={G} dataErr={dataErr} onRetry={load} themeName={themeName} onTheme={toggleTheme} dashboard={dashboard} onDashboard={pickDashboard} />;
  }
  return <AllSourcesDashboard data={data} G={G} dataErr={dataErr} onRetry={load} themeName={themeName} onTheme={toggleTheme} dashboard={dashboard} onDashboard={pickDashboard} />;
}
