export const fmtIN = (x, d = 0) =>
  (Number.isFinite(x) ? x : 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });

export const capParts = (mw) => (mw >= 1000 ? [fmtIN(mw / 1000, mw >= 100000 ? 0 : 1), 'GW'] : [fmtIN(mw), 'MW']);
export const capStr = (mw) => capParts(mw).join(' ');
export const genParts = (g) => (g >= 1000 ? [fmtIN(g / 1000, 1), 'TWh'] : [fmtIN(g), 'GWh']);
export const crParts = (c) => (c >= 100000 ? ['₹' + fmtIN(c / 100000, 2), 'lakh Cr'] : ['₹' + fmtIN(c), 'Cr']);
export const crStr = (c) => crParts(c).join(' ');
export const pct = (v) => (v > 0 && v < 0.1 ? '<0.1%' : fmtIN(v, 1) + '%');
export const signPct = (p) => (p >= 0 ? '+' : '−') + fmtIN(Math.abs(p), Math.abs(p) < 10 ? 1 : 0) + '%';
export const sum = (a) => a.reduce((x, y) => x + y, 0);

// Rounds a bin edge to two significant figures.
export const nice = (v) => {
  if (!(v > 0)) return 0;
  const m = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / m) * m;
};
