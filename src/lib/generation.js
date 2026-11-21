// Generation (= production) data layer for the dashboard. Reads public/generation_forecast.json.
// Challenge rule: only energy generated is used; no installed capacity, no consumption.
//
// Years are financial years labelled by their ending year (2026 = April 2025 - March 2026).
// Up to the base year (FY2025-26) every number is reported generation; later years are the forecast.

export const GROUPS = {
  coal: ['coal'], solar: ['solar'], wind: ['wind'], hydro: ['hydro', 'small_hydro'],
  nuclear: ['nuclear'], gas: ['gas'], other: ['bio', 'waste'],
};
export const GROUP_KEYS = Object.keys(GROUPS);
export const CLEAN_GROUPS = ['solar', 'wind', 'hydro', 'nuclear', 'other'];

// Strictly renewable generation groups (excludes coal, gas, and nuclear; splits bio-mass and waste-to-energy).
export const RE_GROUPS = {
  solar: ['solar'],
  wind: ['wind'],
  hydro: ['hydro', 'small_hydro'],
  bio: ['bio'],
  waste: ['waste'],
};
export const RE_GROUP_KEYS = Object.keys(RE_GROUPS);
export const groupedRenewable = (bySource) => RE_GROUP_KEYS.map((g) => RE_GROUPS[g].reduce((a, s) => a + ((bySource || {})[s] || 0), 0));

export const RE_STRATEGY = {
  North: {
    role: 'Solar powerhouse with Himalayan hydro firming',
    strengths: [
      "Rajasthan's Thar desert and Ladakh hold ~45% of India's assessed solar potential",
      'Himalayan rivers in Himachal Pradesh, Uttarakhand and J&K hold about a third of large-hydro potential',
      'Wind corridors in western Rajasthan, agri-residue biomass in Punjab/Haryana/UP, and urban waste-to-energy in Delhi-NCR',
    ],
    actions: [
      'Scale utility solar across Rajasthan and Ladakh and ship daytime surplus over Green Energy Corridors',
      'Use Himalayan reservoir hydro and pumped storage to shift solar into evening peaks',
    ],
    policy: 'National Solar Mission, Green Energy Corridor (Phase I–II), Ladakh renewable transmission project',
  },
  West: {
    role: 'Wind-solar hybrid hub and coastal wind corridor',
    strengths: [
      "Gujarat and Maharashtra together hold over a third of India's 120 m wind potential",
      "Utility solar parks led by Gujarat's Khavda renewable park and strong central-west irradiance",
      'Large bagasse cogeneration, bio-mass and municipal waste-to-energy base across Maharashtra and Gujarat',
    ],
    actions: [
      'Pair Gujarat and Maharashtra wind and solar into hybrid parks with battery storage',
      'Develop Gujarat offshore wind and strengthen inter-regional renewable transmission',
    ],
    policy: 'Wind-Solar Hybrid Policy, offshore wind roadmap (Gujarat coast), National Bioenergy Programme',
  },
  South: {
    role: 'Wind leader with Deccan solar and pumped hydro',
    strengths: [
      "Tamil Nadu, Karnataka and Andhra Pradesh hold ~43% of India's 120 m wind potential",
      'Strong Deccan plateau solar across Andhra Pradesh, Karnataka and Telangana',
      'Western Ghats hydro and pumped storage, Gulf of Mannar offshore wind, and urban waste-to-energy',
    ],
    actions: [
      'Repower ageing Tamil Nadu wind turbines and develop offshore wind in the Gulf of Mannar',
      'Use Western Ghats pumped hydro and storage to balance seasonal monsoon wind peaks',
    ],
    policy: 'National Repowering Policy for wind, offshore wind bidding trajectory, Green Energy Corridor',
  },
  East: {
    role: 'Hydro, bio-mass and distributed solar transition region',
    strengths: [
      'Teesta (Sikkim) and Odisha river basins provide hydro and pumped storage potential',
      'Utility, floating and rooftop solar on reservoirs and reclaimed land',
      'Bio-mass and waste-to-energy opportunities across agricultural and urban centres',
    ],
    actions: [
      'Expand reservoir hydro and pumped storage in Sikkim, Odisha and Jharkhand',
      'Scale utility and rooftop solar while building eastern–western renewable transmission links',
    ],
    policy: 'Green Energy Corridor (inter-state), PM-KUSUM & rooftop solar, National Bioenergy Programme',
  },
  'North-East': {
    role: 'Hydro export powerhouse with hill small-hydro',
    strengths: [
      "Arunachal Pradesh alone holds ~40% of India's large-hydro potential (Brahmaputra basin)",
      'Abundant small-hydro potential across the hill states',
      'Distributed rooftop solar, local bio-mass and waste-to-energy for growing urban centres',
    ],
    actions: [
      'Develop staged storage hydro on Brahmaputra tributaries with environmental and seismic review',
      'Export firm renewable hydro over North-East-to-North/West HVDC links while adding local solar',
    ],
    policy: 'Hydro policy (renewable status for large hydro, 2019), NE region power master plan, HVDC corridors',
  },
};

const sumObj = (o) => Object.values(o || {}).reduce((a, b) => a + (b || 0), 0);
export const grouped = (bySource) => GROUP_KEYS.map((g) => GROUPS[g].reduce((a, s) => a + ((bySource || {})[s] || 0), 0));

// Linear-in-log interpolation between milestone years (pop, income); linear for shares.
function interp(points, y, log) {
  const ks = Object.keys(points).map(Number).sort((a, b) => a - b);
  let i = ks.findIndex((k) => k >= y);
  if (i === -1) i = ks.length - 1;
  if (ks[i] === y) return points[y];
  const a = i === 0 ? ks[0] : ks[i - 1], b = i === 0 ? ks[1] : ks[i];
  const va = points[a], vb = points[b], w = (y - a) / (b - a);
  return log ? Math.exp(Math.log(va) + w * (Math.log(vb) - Math.log(va))) : va + w * (vb - va);
}

export function makeModel(d) {
  const M = d.meta;
  const BASE = M.base_fy, END = M.end_fy;
  const regions = M.regions;
  const beta = M.model.beta, gamma = M.model.gamma;

  const histNat = (y) => d.history.national[y];
  const histReg = (r, y) => d.history.regional[r][y];

  // Proposed production by source in a region and year (exact rule used by forecast.py):
  // new generation of each source = national change x region weight; a falling source shrinks in proportion.
  function regMix(o, m, r, y) {
    if (y <= BASE) return histReg(r, y) || {};
    const X = d.mixes[`${o}|${m}`];
    const out = {};
    M.sources.forEach((s) => {
      const base = (X.regional[r][BASE] || {})[s] || 0;
      const n0 = X.national[BASE][s] || 0, n1 = X.national[y][s] || 0;
      const delta = n1 - n0;
      out[s] = delta >= 0 ? base + delta * X.weights[s][r] : (n0 > 0 ? base * n1 / n0 : 0);
    });
    return out;
  }
  function natMix(o, m, y) {
    if (y <= BASE) { const h = histNat(y); const o2 = {}; M.sources.forEach((s) => { o2[s] = h[s] || 0; }); return o2; }
    return d.mixes[`${o}|${m}`].national[y];
  }
  const natTotal = (o, y) => (y <= BASE ? histNat(y).total : d.outlooks[o].national[y].p50);
  const natBand = (o, y) => (y <= BASE ? null : d.outlooks[o].national[y]);
  const need = (o, r, y) => (y <= BASE ? sumObj(histReg(r, y)) : d.outlooks[o].need[r][y]);

  // Drivers. India: yearly. Regions: milestone years, interpolated (log for people and income, linear for urban share).
  function drivers(o, scope, y) {
    if (d.states && d.states.region_of[scope]) {
      const v = d.states.drivers[scope][Math.max(2024, y)];
      return { pop: v.pop_m, urban: v.urban, inc: d.states.inc[o][scope][Math.max(2024, y)] };
    }
    if (scope === 'India') {
      const v = d.outlooks[o].india[y];
      return { pop: v.pop_m, urban: v.urban, inc: v.gdp_index / (v.pop_m / d.outlooks[o].india[BASE].pop_m) };
    }
    const D = d.outlooks[o].drivers[scope];
    const pick = (k, log) => interp(Object.fromEntries(Object.entries(D).map(([yy, v]) => [+yy, v[k]])), y, log);
    return { pop: pick('pop_m', true), urban: pick('urban', false), inc: pick('gsdp_pc_index', true) };
  }

  // Exact split of growth since the base year: ln G_t - ln G_base = (pop) + beta(income per person) + gamma(urban) [+ regional rescaling]
  function breakdown(o, scope, y, total) {
    const b = drivers(o, scope, BASE), v = drivers(o, scope, y);
    const isState = d.states && d.states.region_of[scope];
    const g0 = scope === 'India' ? histNat(BASE).total : isState ? sumObj((d.states.history[scope] || {})[BASE]) : sumObj(histReg(scope, BASE));
    const parts = [
      { key: 'pop', label: 'Population growth', value: `${fmt(b.pop, 0)} → ${fmt(v.pop, 0)} million`, l: Math.log(v.pop / b.pop) },
      { key: 'inc', label: scope === 'India' ? 'Income per person (GDP)' : 'Income per person (GSDP)', value: `×${fmt(v.inc / b.inc, 2)} on ${fy(BASE)}`, l: beta * Math.log(v.inc / b.inc) },
    ];
    if (Math.abs(gamma) > 1e-6) {
      parts.push({ key: 'urb', label: 'Urbanization', value: `${fmt(b.urban, 1)}% → ${fmt(v.urban, 1)}% urban`, l: gamma * (v.urban - b.urban) / 100 });
    }
    const lt = Math.log(total / g0);
    const rest = lt - parts.reduce((a, p) => a + p.l, 0);
    if (Math.abs(rest) > 2e-3) parts.push({ key: 'rest', label: scope === 'India' ? 'Your inputs' : isState ? 'Share of region total' : 'Share of national total', value: scope === 'India' ? '' : isState ? 'states scaled to add up to their region' : 'regions scaled to add up to India', l: rest });
    const dG = total - g0;
    return { g0, parts: parts.map((p) => ({ ...p, twh: lt !== 0 ? dG * p.l / lt : 0 })) };
  }

  // ---- states (per-state production): need = region need x state share; proposed = region source x state share
  const S = d.states || { region_of: {}, history: {}, need_share: {}, source_share: {}, drivers: {}, inc: {} };
  const stateRegion = (s) => S.region_of[s];
  const stateNames = Object.keys(S.region_of);
  const histState = (s, y) => (S.history[s] || {})[y] || {};
  const stateNeed = (o, s, y) => (y <= BASE ? sumObj(histState(s, y)) : need(o, stateRegion(s), y) * S.need_share[o][s][y]);
  function stateMix(o, m, s, y) {
    if (y <= BASE) return histState(s, y);
    const rm = regMix(o, m, stateRegion(s), y), r0 = regMix(o, m, stateRegion(s), BASE), base = histState(s, BASE), out = {};
    M.sources.forEach((src) => {
      const b = base[src] || 0, delta = (rm[src] || 0) - (r0[src] || 0);
      out[src] = delta >= 0 ? b + delta * S.source_share[s][src] : (r0[src] > 0 ? b * rm[src] / r0[src] : 0);
    });
    return out;
  }
  function stateDrivers(o, s, y) {
    const v = S.drivers[s][Math.max(2024, y)];
    return { pop: v.pop_m, urban: v.urban, inc: S.inc[o][s][Math.max(2024, y)] };
  }

  return { M, BASE, END, regions, beta, gamma, histNat, histReg, regMix, natMix, natTotal, natBand, need, drivers, breakdown, sumObj,
    stateNames, stateRegion, histState, stateNeed, stateMix, stateDrivers };
}

export const fy = (y) => `FY${y - 1}-${String(y).slice(2)}`;
export const fmt = (x, dgt = 0) => (Number.isFinite(x) ? x : 0).toLocaleString('en-IN', { maximumFractionDigits: dgt, minimumFractionDigits: dgt });
export const twhStr = (v) => fmt(v, Math.abs(v) >= 100 ? 0 : 1) + ' TWh';
