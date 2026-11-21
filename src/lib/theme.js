// Two palettes. "atlas" is the light default; "night" the dark one.
// Source colours were checked with the dataviz palette validator (CVD, contrast) for each surface.
export const THEMES = {
  atlas: {
    bg: '#F3F5F7', panel: '#FFFFFF', panel2: '#EEF2F5', space: '#C9D6DE', overlay: 'rgba(255, 255, 255, 0.94)',
    line: '#DDE3E8', line2: '#C6CFD7', track: '#E6EBEF', muted: '#B4C0CA',
    text: '#17212B', text2: '#46535F', text3: '#5E6B77',
    gold: '#C8661B', ink: '#1D4E89', onInk: '#FFFFFF', good: '#2F7D4F', warn: '#B4600F', pos: '#2F7D4F', neg: '#C4553A',
    tech: ['#4B5563', '#C98A00', '#2E9E8F', '#2F6BC0', '#C2477A', '#8E62B8', '#6E9A2F'],
    ramp: ['#FFF3B0', '#FED976', '#FEB24C', '#FD8D3C', '#E8452A', '#B10F2E'],
    map: {
      space: '#C9D6DE', oceanHi: '#D6E2E9', oceanLo: '#C3D4DE', oceanEdge: '#B6C9D4', atmos: '#FFFFFF',
      grat: 'rgba(38, 70, 98, 0.13)', gratLabel: '#566676', tropic: 'rgba(200, 102, 27, 0.55)', tropicText: '#9A4F14', sea: '#5D7688',
      land: '#E9EBEC', landEdge: '#C3CBD1', landLabel: '#6A7782', nodata: '#E1E4E6',
      edge: 'rgba(255, 255, 255, 0.95)', sel: '#1D4E89', hov: '#17212B', lift: 'rgba(23, 33, 43, 0.35)', shadow: 'rgba(20, 40, 60, 0.20)', fg: '#17212B', halo: '#FFFFFF'
    }
  },
  night: {
    bg: '#0F1317', panel: '#151A20', panel2: '#1D232B', space: '#0B0E12', overlay: 'rgba(21, 26, 32, 0.94)',
    line: '#262D36', line2: '#343D48', track: '#222931', muted: '#3E4955',
    text: '#E7EAEE', text2: '#AAB2BD', text3: '#8C95A1',
    gold: '#E39B4A', ink: '#8FB8E8', onInk: '#0F1317', good: '#7FC79A', warn: '#E39B4A', pos: '#5FB79E', neg: '#E07A5F',
    tech: ['#A3ACB8', '#F0B23A', '#4CC2B0', '#5B95E0', '#D46A95', '#B392D6', '#93BE4E'],
    ramp: ['#3A2233', '#6A2238', '#A3303A', '#D4532B', '#F0902A', '#F9D660'],
    map: {
      space: '#0B0E12', oceanHi: '#16202B', oceanLo: '#111922', oceanEdge: '#0D131A', atmos: '#2F4A63',
      grat: 'rgba(170, 190, 210, 0.10)', gratLabel: '#8D97A3', tropic: 'rgba(227, 155, 74, 0.55)', tropicText: '#D99A57', sea: '#6B7C8D',
      land: '#1D232A', landEdge: '#2D353E', landLabel: '#8D97A3', nodata: '#20272F',
      edge: 'rgba(11, 14, 18, 0.9)', sel: '#8FB8E8', hov: '#FFFFFF', lift: 'rgba(0, 0, 0, 0.55)', shadow: 'rgba(0, 0, 0, 0.45)', fg: '#E7EAEE', halo: '#0F141A'
    }
  }
};

// Generation sources, grouped as the challenge lists them (coal, solar, wind, hydro, nuclear, gas) plus other renewables.
// Order matches the tech colour arrays above.
export const TECH = [
  { id: 'coal', name: 'Coal & lignite', icon: 'M3 21h18M5 21V11l5 3v-3l5 3V7l4 2v12M8 7V4M8 4h2' },
  { id: 'solar', name: 'Solar', icon: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'wind', name: 'Wind', icon: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7' },
  { id: 'hydro', name: 'Hydro', icon: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' },
  { id: 'nuclear', name: 'Nuclear', icon: 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM4 12c0-2.2 3.6-4 8-4s8 1.8 8 4-3.6 4-8 4-8-1.8-8-4z' },
  { id: 'gas', name: 'Gas', icon: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2-1-4 0-6z' },
  { id: 'other', name: 'Bio & waste', icon: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7' }
];
export const ALL_ICON = 'M4 20V10M10 20V4M16 20v-7M22 20H2';
export const MILESTONES = [2026, 2030, 2035, 2040, 2047];

// Strictly renewable sources (Solar, Wind, Hydro, Bio-mass, Waste-to-energy) for the Renewables generation dashboard.
export const RE_TECH = [
  { id: 'solar', name: 'Solar', icon: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { id: 'wind', name: 'Wind', icon: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7' },
  { id: 'hydro', name: 'Hydro', icon: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' },
  { id: 'bio', name: 'Bio-mass', icon: 'M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19l7-7' },
  { id: 'waste', name: 'Waste-to-energy', icon: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4' }
];
export const RE_TECH_COLORS = {
  atlas: ['#C98A00', '#2E9E8F', '#2F6BC0', '#6E9A2F', '#C2477A'],
  night: ['#F0B23A', '#4CC2B0', '#5B95E0', '#93BE4E', '#D46A95']
};

// CSS custom properties for the page chrome, so components can use var(--text) etc.
export function cssVars(t) {
  const v = {};
  ['bg', 'panel', 'panel2', 'space', 'overlay', 'line', 'line2', 'track', 'muted', 'text', 'text2', 'text3',
    'gold', 'ink', 'onInk', 'good', 'warn', 'pos', 'neg'].forEach((k) => { v['--' + k] = t[k]; });
  return v;
}
