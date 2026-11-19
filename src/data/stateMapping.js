// GeoJSON name → Model name mapping and Zone assignment
// Resolves differences between in.json feature.properties.name and the ML model's state names

export const GEO_TO_MODEL_NAME = {
  'Andaman and Nicobar':                       'Andaman And Nicobar Islands',
  'Andhra Pradesh':                             'Andhra Pradesh',
  'Arunachal Pradesh':                          'Arunachal Pradesh',
  'Assam':                                      'Assam',
  'Bihar':                                      'Bihar',
  'Chandigarh':                                 'Chandigarh',
  'Chhattisgarh':                               'Chhattisgarh',
  'Dādra and Nagar Haveli and Damān and Diu':   null,
  'Delhi':                                      'Delhi',
  'Goa':                                        'Goa',
  'Gujarat':                                    'Gujarat',
  'Haryana':                                    'Haryana',
  'Himachal Pradesh':                           'Himachal Pradesh',
  'Jammu and Kashmir':                          'Jammu And Kashmir',
  'Jharkhand':                                  'Jharkhand',
  'Karnataka':                                  'Karnataka',
  'Kerala':                                     'Kerala',
  'Ladakh':                                     null,
  'Lakshadweep':                                'Lakshadweep',
  'Madhya Pradesh':                             'Madhya Pradesh',
  'Maharashtra':                                'Maharashtra',
  'Manipur':                                    'Manipur',
  'Meghalaya':                                  'Meghalaya',
  'Mizoram':                                    'Mizoram',
  'Nagaland':                                   'Nagaland',
  'Orissa':                                     'Odisha',
  'Puducherry':                                 'Puducherry',
  'Punjab':                                     'Punjab',
  'Rajasthan':                                  'Rajasthan',
  'Sikkim':                                     'Sikkim',
  'Tamil Nadu':                                 'Tamil Nadu',
  'Telangana':                                  'Telangana',
  'Tripura':                                    'Tripura',
  'Uttar Pradesh':                              'Uttar Pradesh',
  'Uttaranchal':                                'Uttarakhand',
  'West Bengal':                                'West Bengal',
};

export const STATE_TO_ZONE = {
  'Andaman And Nicobar Islands': 'South',
  'Andhra Pradesh': 'South',
  'Arunachal Pradesh': 'North-East',
  'Assam': 'North-East',
  'Bihar': 'East',
  'Chandigarh': 'North',
  'Chhattisgarh': 'Central',
  'Delhi': 'North',
  'Goa': 'West',
  'Gujarat': 'West',
  'Haryana': 'North',
  'Himachal Pradesh': 'North',
  'Jammu And Kashmir': 'North',
  'Jharkhand': 'East',
  'Karnataka': 'South',
  'Kerala': 'South',
  'Lakshadweep': 'South',
  'Madhya Pradesh': 'Central',
  'Maharashtra': 'West',
  'Manipur': 'North-East',
  'Meghalaya': 'North-East',
  'Mizoram': 'North-East',
  'Nagaland': 'North-East',
  'Odisha': 'East',
  'Puducherry': 'South',
  'Punjab': 'North',
  'Rajasthan': 'West',
  'Sikkim': 'North-East',
  'Tamil Nadu': 'South',
  'Telangana': 'South',
  'Tripura': 'North-East',
  'Uttar Pradesh': 'North',
  'Uttarakhand': 'North',
  'West Bengal': 'East',
};

// Refined, professional, elegant light theme palette
export const ZONE_COLORS = {
  'South': {
    fill: '#10b981',
    border: '#059669',
    lightBg: '#ecfdf5',
    textColor: '#065f46',
    label: 'South Zone'
  },
  'North': {
    fill: '#3b82f6',
    border: '#2563eb',
    lightBg: '#eff6ff',
    textColor: '#1e40af',
    label: 'North Zone'
  },
  'West': {
    fill: '#f59e0b',
    border: '#d97706',
    lightBg: '#fffbeb',
    textColor: '#92400e',
    label: 'West Zone'
  },
  'East': {
    fill: '#ef4444',
    border: '#dc2626',
    lightBg: '#fef2f2',
    textColor: '#991b1b',
    label: 'East Zone'
  },
  'Central': {
    fill: '#8b5cf6',
    border: '#7c3aed',
    lightBg: '#f5f3ff',
    textColor: '#5b21b6',
    label: 'Central Zone'
  },
  'North-East': {
    fill: '#ec4899',
    border: '#db2777',
    lightBg: '#fdf2f8',
    textColor: '#9d174d',
    label: 'North-East Zone'
  },
};

export const ZONE_TO_STATES = {
  'South': [
    'Andaman And Nicobar Islands', 'Andhra Pradesh', 'Karnataka', 'Kerala',
    'Lakshadweep', 'Puducherry', 'Tamil Nadu', 'Telangana'
  ],
  'North': [
    'Chandigarh', 'Delhi', 'Haryana', 'Himachal Pradesh',
    'Jammu And Kashmir', 'Punjab', 'Uttar Pradesh', 'Uttarakhand'
  ],
  'West': ['Goa', 'Gujarat', 'Maharashtra', 'Rajasthan'],
  'East': ['Bihar', 'Jharkhand', 'Odisha', 'West Bengal'],
  'Central': ['Chhattisgarh', 'Madhya Pradesh'],
  'North-East': [
    'Arunachal Pradesh', 'Assam', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'
  ],
};

// Realistic baseline stats (2024 MNRE + RBI Census) for all states
export const STATE_DEFAULTS = {
  'Andaman And Nicobar Islands': { pop: 400000, gsdp: 8500, baseSolar: 12.2, baseWind: 0, baseHydro: 5.3, baseBio: 0, baseWaste: 0 },
  'Andhra Pradesh': { pop: 53500000, gsdp: 1450000, baseSolar: 4500, baseWind: 4100, baseHydro: 160, baseBio: 550, baseWaste: 40 },
  'Arunachal Pradesh': { pop: 1650000, gsdp: 38000, baseSolar: 12, baseWind: 0, baseHydro: 130, baseBio: 0, baseWaste: 0 },
  'Assam': { pop: 36500000, gsdp: 480000, baseSolar: 155, baseWind: 0, baseHydro: 35, baseBio: 3, baseWaste: 0 },
  'Bihar': { pop: 128000000, gsdp: 820000, baseSolar: 195, baseWind: 0, baseHydro: 70, baseBio: 125, baseWaste: 0 },
  'Chandigarh': { pop: 1250000, gsdp: 52000, baseSolar: 55, baseWind: 0, baseHydro: 0, baseBio: 0, baseWaste: 0 },
  'Chhattisgarh': { pop: 30500000, gsdp: 460000, baseSolar: 960, baseWind: 0, baseHydro: 95, baseBio: 280, baseWaste: 0 },
  'Delhi': { pop: 21500000, gsdp: 1100000, baseSolar: 220, baseWind: 0, baseHydro: 0, baseBio: 0, baseWaste: 52 },
  'Goa': { pop: 1620000, gsdp: 102000, baseSolar: 32, baseWind: 0, baseHydro: 5, baseBio: 0, baseWaste: 0 },
  'Gujarat': { pop: 72500000, gsdp: 2450000, baseSolar: 10500, baseWind: 10800, baseHydro: 110, baseBio: 115, baseWaste: 35 },
  'Haryana': { pop: 30500000, gsdp: 1150000, baseSolar: 1100, baseWind: 0, baseHydro: 75, baseBio: 240, baseWaste: 15 },
  'Himachal Pradesh': { pop: 7600000, gsdp: 225000, baseSolar: 110, baseWind: 0, baseHydro: 950, baseBio: 10, baseWaste: 0 },
  'Jammu And Kashmir': { pop: 14200000, gsdp: 245000, baseSolar: 55, baseWind: 0, baseHydro: 180, baseBio: 0, baseWaste: 0 },
  'Jharkhand': { pop: 40500000, gsdp: 440000, baseSolar: 115, baseWind: 0, baseHydro: 20, baseBio: 5, baseWaste: 0 },
  'Karnataka': { pop: 69500000, gsdp: 2500000, baseSolar: 7800, baseWind: 5300, baseHydro: 1280, baseBio: 1850, baseWaste: 10 },
  'Kerala': { pop: 36200000, gsdp: 1180000, baseSolar: 850, baseWind: 65, baseHydro: 230, baseBio: 5, baseWaste: 0 },
  'Lakshadweep': { pop: 70000, gsdp: 2800, baseSolar: 4.5, baseWind: 0, baseHydro: 0, baseBio: 0, baseWaste: 0 },
  'Madhya Pradesh': { pop: 88000000, gsdp: 1320000, baseSolar: 2900, baseWind: 2500, baseHydro: 105, baseBio: 130, baseWaste: 12 },
  'Maharashtra': { pop: 128000000, gsdp: 4100000, baseSolar: 5200, baseWind: 5100, baseHydro: 380, baseBio: 2600, baseWaste: 15 },
  'Manipur': { pop: 3300000, gsdp: 41000, baseSolar: 12, baseWind: 0, baseHydro: 6, baseBio: 0, baseWaste: 0 },
  'Meghalaya': { pop: 3900000, gsdp: 48000, baseSolar: 5, baseWind: 0, baseHydro: 32, baseBio: 14, baseWaste: 0 },
  'Mizoram': { pop: 1320000, gsdp: 31000, baseSolar: 10, baseWind: 0, baseHydro: 38, baseBio: 0, baseWaste: 0 },
  'Nagaland': { pop: 2350000, gsdp: 38000, baseSolar: 3, baseWind: 0, baseHydro: 31, baseBio: 0, baseWaste: 0 },
  'Odisha': { pop: 47500000, gsdp: 760000, baseSolar: 520, baseWind: 0, baseHydro: 85, baseBio: 60, baseWaste: 0 },
  'Puducherry': { pop: 1750000, gsdp: 46000, baseSolar: 35, baseWind: 0, baseHydro: 0, baseBio: 0, baseWaste: 0 },
  'Punjab': { pop: 31200000, gsdp: 780000, baseSolar: 1250, baseWind: 0, baseHydro: 175, baseBio: 480, baseWaste: 10 },
  'Rajasthan': { pop: 83000000, gsdp: 1550000, baseSolar: 18500, baseWind: 5200, baseHydro: 25, baseBio: 125, baseWaste: 0 },
  'Sikkim': { pop: 710000, gsdp: 44000, baseSolar: 5, baseWind: 0, baseHydro: 55, baseBio: 0, baseWaste: 0 },
  'Tamil Nadu': { pop: 78500000, gsdp: 2800000, baseSolar: 7200, baseWind: 10200, baseHydro: 125, baseBio: 1050, baseWaste: 20 },
  'Telangana': { pop: 40500000, gsdp: 1550000, baseSolar: 4700, baseWind: 130, baseHydro: 92, baseBio: 220, baseWaste: 24 },
  'Tripura': { pop: 4300000, gsdp: 72000, baseSolar: 18, baseWind: 0, baseHydro: 16, baseBio: 0, baseWaste: 0 },
  'Uttar Pradesh': { pop: 245000000, gsdp: 2600000, baseSolar: 2600, baseWind: 0, baseHydro: 50, baseBio: 2150, baseWaste: 25 },
  'Uttarakhand': { pop: 12200000, gsdp: 340000, baseSolar: 580, baseWind: 0, baseHydro: 215, baseBio: 130, baseWaste: 0 },
  'West Bengal': { pop: 102000000, gsdp: 1750000, baseSolar: 210, baseWind: 0, baseHydro: 185, baseBio: 310, baseWaste: 0 },
};

// ─── Server data (v2 model) ───
// Filled from the backend once it is reachable; the client-side formulas below are only a fallback.
let SERVER_META = null;
const SERVER_MAP = {};

export function setServerMeta(meta) { SERVER_META = meta; }
export function setServerMap(year, states) { SERVER_MAP[year] = states; }
export function getServerMeta() { return SERVER_META; }

const POP_GROWTH = 0.0102;

function serverProjection(st, year) {
  const s = SERVER_META?.states?.[st];
  if (!s) return null;
  const by = SERVER_META.base_year;
  const years = Object.keys(s.gsdp).map(Number);
  let gsdp;
  if (year <= by) {
    const y = Math.max(...years.filter(v => v <= year), Math.min(...years));
    gsdp = s.gsdp[y];
  } else {
    gsdp = s.gsdp[by] * Math.pow(1 + s.gsdp_cagr, year - by);
  }
  return { population: s.population * Math.pow(1 + POP_GROWTH, year - by), gsdp };
}

export function getAutoProjection(zone, state, year) {
  // v2 baseline: the dataset's 2024 GSDP grown at the state's own recent rate
  if (SERVER_META) {
    const list = state ? [state] : (SERVER_META.zones?.[zone] || []);
    const parts = list.map(st => serverProjection(st, year)).filter(Boolean);
    if (parts.length) {
      return {
        population: Math.round(parts.reduce((a, p) => a + p.population, 0)),
        gsdp: Math.round(parts.reduce((a, p) => a + p.gsdp, 0)),
      };
    }
  }

  const deltaYears = Math.max(0, year - 2024);
  const popGR = POP_GROWTH;
  const gsdpGR = 0.095;
  let bp = 0, bg = 0;

  if (state && STATE_DEFAULTS[state]) {
    bp = STATE_DEFAULTS[state].pop;
    bg = STATE_DEFAULTS[state].gsdp;
  } else if (zone && ZONE_TO_STATES[zone]) {
    ZONE_TO_STATES[zone].forEach(st => {
      if (STATE_DEFAULTS[st]) {
        bp += STATE_DEFAULTS[st].pop;
        bg += STATE_DEFAULTS[st].gsdp;
      }
    });
  } else {
    bp = 68000000;
    bg = 1500000;
  }

  return {
    population: Math.round(bp * Math.pow(1 + popGR, deltaYears)),
    gsdp: Math.round(bg * Math.pow(1 + gsdpGR, deltaYears)),
  };
}

// CERC benchmarks for financial calculation
const CERC_SPECS = {
  solar: { capex: 4.5, cuf: 0.21, lcoe: 2.5, color: '#f59e0b', name: 'Solar Power' },
  wind:  { capex: 7.9, cuf: 0.30, lcoe: 3.2, color: '#0284c7', name: 'Wind Power' },
  bio:   { capex: 6.85, cuf: 0.75, lcoe: 5.4, color: '#16a34a', name: 'Bio-Mass' },
  hydro: { capex: 10.5, cuf: 0.45, lcoe: 4.1, color: '#2563eb', name: 'Small Hydro' },
  waste: { capex: 11.0, cuf: 0.70, lcoe: 6.2, color: '#7c3aed', name: 'Waste to Energy' },
};

const ZONE_MULT = {
  'South': 1.00, 'North': 1.02, 'West': 0.98,
  'East': 1.03, 'North-East': 1.15, 'Central': 1.00
};

/**
 * Computes instant state forecast preview (for hover & inspector card)
 * without waiting on any asynchronous network call!
 */
export function getStateForecast(stateName, zoneName, year = 2028) {
  const srv = SERVER_MAP[year]?.[stateName];
  if (srv) {
    return {
      state: stateName,
      zone: srv.zone,
      year,
      source: 'v2',
      totalMW: srv.totalMW,
      totalGW: (srv.totalMW / 1000).toFixed(2),
      totalCapexCr: srv.totalCapexCr,
      totalGenerationGWh: srv.totalGenerationGWh,
      blendedLcoe: srv.blendedLcoe,
      co2OffsetMT: Math.round((srv.totalGenerationGWh * 820 / 1e6) * 100) / 100,
      breakdown: srv.breakdown,
    };
  }
  const d = STATE_DEFAULTS[stateName] || {
    pop: 40000000, gsdp: 1000000,
    baseSolar: 1000, baseWind: 500, baseHydro: 50, baseBio: 100, baseWaste: 10
  };
  const delta = Math.max(0, year - 2024);
  const zm = ZONE_MULT[zoneName] || 1.0;

  // Adoption growth factors
  const solarGrow = Math.pow(1.12, delta);
  const windGrow  = Math.pow(1.075, delta);
  const bioGrow   = Math.pow(1.045, delta);
  const hydroGrow = Math.pow(1.028, delta);
  const wasteGrow = Math.pow(1.07, delta);

  const solar = Math.round(Math.max(25, d.baseSolar * solarGrow) * 10) / 10;
  const wind  = Math.round((d.baseWind > 0 ? d.baseWind * windGrow : 0) * 10) / 10;
  const bio   = Math.round(Math.max(5, d.baseBio * bioGrow) * 10) / 10;
  const hydro = Math.round(Math.max(5, d.baseHydro * hydroGrow) * 10) / 10;
  const waste = Math.round(Math.max(1, d.baseWaste * wasteGrow) * 10) / 10;
  const total = Math.round((solar + wind + bio + hydro + waste) * 10) / 10;

  // Financials
  let capex = 0;
  let genGWh = 0;
  let weightedLcoe = 0;

  const sources = [
    { key: 'solar', mw: solar, spec: CERC_SPECS.solar },
    { key: 'wind',  mw: wind,  spec: CERC_SPECS.wind },
    { key: 'bio',   mw: bio,   spec: CERC_SPECS.bio },
    { key: 'hydro', mw: hydro, spec: CERC_SPECS.hydro },
    { key: 'waste', mw: waste, spec: CERC_SPECS.waste },
  ];

  const breakdown = sources.map(s => {
    const cx = s.mw * s.spec.capex * zm;
    const g = (s.mw * 8760 * s.spec.cuf) / 1000;
    capex += cx;
    genGWh += g;
    weightedLcoe += g * s.spec.lcoe;
    return {
      id: s.key,
      name: s.spec.name,
      mw: s.mw,
      color: s.spec.color,
      capexCr: Math.round(cx),
      annualGenGWh: Math.round(g),
      lcoe: s.spec.lcoe,
      sharePct: total > 0 ? Math.round((s.mw / total) * 1000) / 10 : 0
    };
  });

  const blendedLcoe = genGWh > 0 ? Math.round((weightedLcoe / genGWh) * 100) / 100 : 3.10;
  const co2OffsetMT = Math.round((genGWh * 820 / 1e6) * 100) / 100;

  return {
    state: stateName,
    zone: zoneName,
    year,
    totalMW: total,
    totalGW: (total / 1000).toFixed(2),
    totalCapexCr: Math.round(capex),
    totalGenerationGWh: Math.round(genGWh),
    blendedLcoe,
    co2OffsetMT,
    breakdown,
  };
}
