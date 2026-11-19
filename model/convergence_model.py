"""
Renewable Energy 2047 — v2 forecast model: national trend + state catch-up + GSDP.

What the data analysis showed (see reports/eda) and how the model uses it
--------------------------------------------------------------------------
1. Many values are *stale repeats*: in 2023-24 only 15 of 34 states report anything new; 19 states are
   frozen at 2022 values (e.g. Rajasthan solar sits at 12.6 GW for 2021-2024). 2022 is a near-universal
   gap year for solar.
   -> Only genuine new reports ("fresh": the value changed) are used for fitting and scoring. Growth is
      measured between consecutive fresh reports, so a stale gap followed by a catch-up jump is
      correctly read as several years of growth. Each state is "nowcast" from its last fresh report to
      the base year instead of trusting a frozen value.
2. Across states, faster GSDP growth does NOT go with faster solar growth (corr ~ -0.1); what predicts
   growth is *catch-up*: states with low capacity per unit GSDP vs their zone grow faster
   (solar corr -0.65, bio-mass -0.59). Wind is the exception: it tracks GSDP (beta ~1) and is
   geography-limited (zero in East/North/North-East).
   -> Per technology, the yearly log-growth of a state's capacity is

        growth(state, year) = trend(year)                                   national momentum
                            + beta  * GSDP log-growth(state, year)         economy effect (cross-state)
                            + kappa * log( zone intensity / state intensity )   catch-up to zone peers

      intensity = MW per lakh-crore GSDP. Catch-up is toward the state's *zone* (resource potential
      differs ~14x between zones), so a zone with no wind never "catches up" into wind.
3. National growth decelerates as markets mature (solar ~0.6/yr in 2015-17 -> ~0.2/yr recently).
   -> trend(year) uses the fitted year effects up to the base year, then the recent average fades with a
      half-life (3 years, chosen by backtest). Catch-up and GSDP terms keep working after the trend fades.

4. Bio-mass and small hydro barely grow and are not driven by catch-up; the simpler GSDP-elasticity
   model (v1, re_model.ElasticityModel) backtests much better for them (small hydro 8.5% vs 16.6% WAPE).
   -> Technologies in `v1_techs` use v1's dynamics (decaying GSDP elasticity, starting from the last
      reported value); all others use the v2 dynamics above.

5. Renewable-related transmission (CEA yearly transmission reports via the National Power Portal,
   FY2018-19 .. FY2025-26, see model/external/npp_transmission.py) lines up with solar and wind growth the
   other terms miss: evacuation lines for solar parks / pooling stations get built where capacity is coming.
   -> growth += gamma * x(state, year), x = log1p(km of renewable-related lines completed in the FY ending
      that year), demeaned across states within the year (0 = an average state; 0 where no reports exist).
      Up to the base year x is used year by year (this sharpens the nowcast of stale states). For forecast
      years with reports (up to FY2025-26) each state uses its average x over those years; after that, 0.

Fitting: one ridge-stabilised least-squares regression per technology on all consecutive fresh-report
pairs, with fractional year dummies spread over each pair's interval.
Installed capacity never decreases in a forecast. Saved as plain JSON.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np
import pandas as pd

from re_model import TECH, TECH_KEY, ElasticityModel, fresh_mask

TX_CSV = Path(__file__).resolve().parents[1] / "data" / "external" / "npp_transmission_state_year.csv"
EPS = 1.0  # floor in MW per lakh-crore GSDP, keeps log-intensity finite for zero-capacity states
END_YEAR = 2060


@dataclass
class ConvergenceModel:
    min_mw: float = 10.0        # pairs starting below this are noise (0 -> 5 MW), not growth
    trend_years: int = 3        # recent year effects averaged into the current national trend
    half_life: float = 3.0      # years for the national trend to halve after the base year
    max_gap: float = 4.0        # cap on |log intensity gap| (avoid absurd catch-up from ~0)
    ridge: float = 0.05         # shrinkage on year effects only
    min_pairs: int = 15         # below this a technology is held flat (e.g. waste-to-energy)
    v1_techs: list = field(default_factory=lambda: ["Bio-Mass Power", "Small Hydro Power"])  # use v1 dynamics
    tx_col: str | None = "re_line_ckm"   # transmission feature column in TX_CSV (None = no transmission term)
    tx_techs: list = field(default_factory=lambda: ["Solar Power", "Wind Power"])
    tx_fit: str = "residual"  # "residual": fit the model without transmission, then gamma on its residuals (trend,
                              # beta, kappa stay exactly as without it); "joint": fit gamma together with them

    # fitted
    base_year: int | None = None
    params: dict = field(default_factory=dict)          # tech -> alpha{year}, beta, kappa, a_ref
    states: dict = field(default_factory=dict)          # state -> zone, population, gsdp{year}, cagr, anchor, nowcast
    history: dict = field(default_factory=dict)         # state -> {year: {tech: MW}} as reported
    zone_intensity: dict = field(default_factory=dict)  # tech -> zone -> {year: MW per lakh-crore}
    tx: dict = field(default_factory=dict)              # state -> {year: demeaned log transmission index}
    tx_km: dict = field(default_factory=dict)           # state -> {year: km of renewable-related lines}
    tx_last: int | None = None                          # last year with transmission reports

    # ───────────── fitting ─────────────
    def _zone_int_hist(self, df: pd.DataFrame, t: str) -> dict:
        out = {}
        for y, g in df.groupby("Year"):
            z = g.groupby("Zone")[[t, "GSDP"]].sum()
            for zone, r in z.iterrows():
                out.setdefault(zone, {})[int(y)] = float(r[t] / r.GSDP * 1e5)
        return out

    def _pairs(self, df, fr, t, zint):
        rows = []
        for _, g in df.groupby("State"):
            recs = g[fr.loc[g.index, t]].sort_values("Year").to_dict("records")
            for a, b in zip(recs[:-1], recs[1:]):
                if a[t] < self.min_mw:
                    continue
                k = b["Year"] - a["Year"]
                i_s = a[t] / a["GSDP"] * 1e5
                i_z = zint[a["Zone"]][a["Year"]]
                rows.append({"st": a["State"], "y0": a["Year"], "y1": b["Year"], "k": k,
                             "r": (np.log1p(b[t]) - np.log1p(a[t])) / k,
                             "dg": (np.log(b["GSDP"]) - np.log(a["GSDP"])) / k,
                             "gap": float(np.clip(np.log((i_z + EPS) / (i_s + EPS)), -self.max_gap, self.max_gap))})
        return pd.DataFrame(rows)

    def fit(self, df: pd.DataFrame) -> "ConvergenceModel":
        df = df.sort_values(["State", "Year"]).reset_index(drop=True)
        fr = fresh_mask(df)
        self.base_year = int(df.Year.max())
        years = list(range(int(df.Year.min()) + 1, self.base_year + 1))
        self._load_tx(sorted(df.State.unique()))
        for t in TECH:
            zint = self._zone_int_hist(df, t)
            self.zone_intensity[t] = {z: dict(v) for z, v in zint.items()}
            P = self._pairs(df, fr, t, zint)
            if len(P) < self.min_pairs:
                self.params[t] = {"alpha": {}, "beta": 0.0, "kappa": 0.0, "a_ref": 0.0, "n_pairs": len(P)}
                continue
            D = np.zeros((len(P), len(years)))
            for i, (y0, y1, k) in enumerate(P[["y0", "y1", "k"]].values.astype(int)):
                for y in range(y0 + 1, y1 + 1):
                    D[i, years.index(y)] = 1.0 / k
            use_tx = t in self.tx_techs and self.tx
            if use_tx:
                x = np.array([np.mean([self.tx.get(st, {}).get(y, 0.0) for y in range(int(y0) + 1, int(y1) + 1)])
                              for st, y0, y1 in P[["st", "y0", "y1"]].values])
                use_tx = np.count_nonzero(x) >= 5 and np.ptp(x) > 0  # needs reports inside the training window
            joint = use_tx and self.tx_fit == "joint"
            X = np.c_[D, P.dg.values, P.gap.values] if not joint else np.c_[D, P.dg.values, P.gap.values, x]
            nf = 3 if joint else 2
            w = np.sqrt(P.k.values)
            R = np.eye(X.shape[1]) * self.ridge
            R[-nf:, -nf:] = 0
            Xw = X * w[:, None]
            with np.errstate(all="ignore"):  # macOS Accelerate emits spurious matmul FP warnings
                coef = np.linalg.solve(Xw.T @ Xw + R, Xw.T @ (P.r.values * w))
            gamma = float(coef[-1]) if joint else 0.0
            if use_tx and not joint:
                res = (P.r.values - X @ coef) * w
                gamma = float((x * w) @ res / ((x * w) @ (x * w)))
            alpha = {y: float(c) for y, c in zip(years, coef[:len(years)]) if D[:, years.index(y)].sum() > 0.5}
            recent = [v for y, v in alpha.items() if y > self.base_year - self.trend_years]
            self.params[t] = {"alpha": alpha, "beta": float(max(coef[len(years)], 0.0)),
                              "kappa": float(max(coef[len(years) + 1], 0.0)),
                              "gamma": max(gamma, 0.0),
                              "a_ref": float(np.mean(recent)) if recent else 0.0, "n_pairs": int(len(P))}

        for st, g in df.groupby("State"):
            g = g.set_index("Year")
            n = min(10, len(g) - 1)
            cagr = float((g.GSDP.iloc[-1] / g.GSDP.iloc[-1 - n]) ** (1 / n) - 1) if n > 0 else 0.06
            anchor = {}
            for t in TECH:
                f = fr.loc[df.State == st, t].values
                ys = g.index[f]
                ay = int(ys.max()) if len(ys) else int(g.index.min())
                anchor[t] = [ay, float(g.loc[ay, t])]
            self.states[st] = {"zone": g.Zone.iloc[0], "population": float(g.Population.iloc[-1]),
                               "gsdp": {int(y): float(v) for y, v in g.GSDP.items()}, "gsdp_cagr": cagr,
                               "anchor": anchor}
            self.history[st] = {int(y): {t: float(r[t]) for t in TECH} for y, r in g.iterrows()}

        if self.v1_techs:
            e = ElasticityModel().fit(df)
            for t in self.v1_techs:
                self.params[t].update({"dynamics": "v1", "v1_elasticity": float(e.elasticity.get(t, 0.0)),
                                       "v1_decay": float(e.decay.get(t, 0.0))})

        self._nowcast()
        self._baseline_zone_paths()
        return self

    def _load_tx(self, states):
        self.tx, self.tx_km, self.tx_last = {}, {}, None
        if not self.tx_col or not TX_CSV.exists():
            return
        T = pd.read_csv(TX_CSV).pivot_table(index="State", columns="Year", values=self.tx_col, aggfunc="sum")
        T = T.reindex(states).fillna(0.0)
        X = np.log1p(T)
        X = X - X.mean(0)
        self.tx = {st: {int(y): float(v) for y, v in X.loc[st].items()} for st in states}
        self.tx_km = {st: {int(y): float(v) for y, v in T.loc[st].items()} for st in states}
        self.tx_last = int(T.columns.max())

    def tx_forward(self, state: str) -> float:
        """State's average transmission index over forecast years that have reports (0 if none)."""
        if not self.tx or self.tx_last is None or self.tx_last <= self.base_year:
            return 0.0
        xs = [self.tx.get(state, {}).get(y, 0.0) for y in range(self.base_year + 1, self.tx_last + 1)]
        return float(np.mean(xs))

    def tx_forward_km(self, state: str) -> float:
        """km of renewable-related lines completed in forecast years that have reports."""
        if not self.tx_km or self.tx_last is None:
            return 0.0
        return float(sum(self.tx_km.get(state, {}).get(y, 0.0) for y in range(self.base_year + 1, self.tx_last + 1)))

    def _is_v1(self, t: str) -> bool:
        return self.params.get(t, {}).get("dynamics") == "v1"

    def _v1_growth(self, t: str, gr, n):
        """v1 cumulative log-growth after n years at GSDP log-growth gr: b * sum_{s=1..n} e^{-lam s} * gr."""
        p = self.params[t]
        w = np.concatenate([[0.0], np.cumsum(np.exp(-p["v1_decay"] * np.arange(1, 201)))])
        return np.maximum(p["v1_elasticity"] * w[np.clip(n, 0, 200)] * gr, 0.0)

    # ───────────── core dynamics ─────────────
    def trend(self, t: str, y: int) -> float:
        p = self.params[t]
        if y <= self.base_year:
            return p["alpha"].get(y, p["alpha"].get(str(y), p["a_ref"]))
        return p["a_ref"] * 0.5 ** ((y - self.base_year) / self.half_life)

    def _zint(self, t, zone, y):
        z = self.zone_intensity[t].get(zone, {})
        if y in z:
            return z[y]
        ks = [k for k in z if k <= y]
        return z[max(ks)] if ks else 0.0

    def _step(self, t, cap, y, g_prev, g_cur, zint_prev, x=0.0):
        """One year of growth for arrays of states. Returns new capacity (never lower).
        x: transmission index for that year (scalar or per state)."""
        p = self.params[t]
        i_s = cap / g_prev * 1e5
        gap = np.clip(np.log((zint_prev + EPS) / (i_s + EPS)), -self.max_gap, self.max_gap)
        r = self.trend(t, y) + p["beta"] * (np.log(g_cur) - np.log(g_prev)) + p["kappa"] * gap \
            + p.get("gamma", 0.0) * np.asarray(x, float)
        return np.maximum(np.expm1(np.log1p(cap) + r), cap)

    @staticmethod
    def _gsdp(s: dict, y: int) -> float:
        """State GSDP in year y; log-interpolates across missing years (e.g. Telangana 2013)."""
        g = s["gsdp"]
        if y in g:
            return g[y]
        lo = max((k for k in g if k < y), default=None); hi = min((k for k in g if k > y), default=None)
        if lo is None or hi is None:
            return g[lo if hi is None else hi]
        w = (y - lo) / (hi - lo)
        return float(np.exp((1 - w) * np.log(g[lo]) + w * np.log(g[hi])))

    def _nowcast(self):
        """Roll each state-tech from its last fresh report to the base year with actual GSDP."""
        for st, s in self.states.items():
            path = {}
            for t in TECH:
                if self._is_v1(t):  # v1 starts from the last reported value, stale or not
                    h = self.history[st]
                    for y in range(min(h), self.base_year + 1):
                        path.setdefault(y, {})[t] = h[max(yy for yy in h if yy <= y)][t]
                    continue
                ay, cap = s["anchor"][t]
                cap = np.array([cap])
                for y in range(ay + 1, self.base_year + 1):
                    cap = self._step(t, cap, y, self._gsdp(s, y - 1), self._gsdp(s, y), self._zint(t, s["zone"], y - 1),
                                     self.tx.get(st, {}).get(y, 0.0))
                    path.setdefault(y, {})[t] = float(cap[0])
            s["nowcast"] = {y: v for y, v in path.items()}

    def base_capacity(self, state: str) -> dict:
        s = self.states[state]
        h = self.history[state][self.base_year]
        nc = s["nowcast"].get(self.base_year, {})
        return {t: nc.get(t, h[t]) for t in TECH}

    def _baseline_zone_paths(self):
        """Simulate all states jointly at their own GSDP CAGR so each zone's intensity path is known;
        single-state forecasts then catch up toward this path."""
        names = list(self.states)
        zones = np.array([self.states[s]["zone"] for s in names])
        g0 = np.array([self.states[s]["gsdp"][self.base_year] for s in names])
        cg = np.array([self.states[s]["gsdp_cagr"] for s in names])
        xf = np.array([self.tx_forward(s) for s in names])
        for t in TECH:
            cap = np.array([self.base_capacity(s)[t] for s in names])
            for y in range(self.base_year + 1, END_YEAR + 1):
                gp, gc = g0 * (1 + cg) ** (y - 1 - self.base_year), g0 * (1 + cg) ** (y - self.base_year)
                # base year included: zone intensity there is recomputed from nowcast (not stale) values
                for z in np.unique(zones):
                    m = zones == z
                    self.zone_intensity[t][z][y - 1] = float(cap[m].sum() / gp[m].sum() * 1e5)
                zi = np.array([self.zone_intensity[t][z][y - 1] for z in zones])
                cap = self._step(t, cap, y, gp, gc, zi, xf if self.tx_last and y <= self.tx_last else 0.0)

    # ───────────── prediction ─────────────
    def forecast_batch(self, base_mw, zone, gsdp_base, gsdp_growth, years_ahead, tx_fwd=None) -> np.ndarray:
        """Vectorised forecast from the base year.
        base_mw (n,5) MW per tech at base year; zone (n,) zone names; gsdp_base (n,) crore INR;
        gsdp_growth (n,) yearly GSDP log-growth; years_ahead (n,) ints >= 0;
        tx_fwd (n,) transmission index for forecast years with reports (tx_forward; default 0).
        Returns (n,5) MW."""
        base_mw = np.asarray(base_mw, float)
        zone = np.asarray(zone)
        gb = np.asarray(gsdp_base, float)
        gr = np.asarray(gsdp_growth, float)
        n = np.clip(np.rint(np.asarray(years_ahead, float)).astype(int), 0, END_YEAR - self.base_year)
        xf = np.zeros(len(base_mw)) if tx_fwd is None else np.asarray(tx_fwd, float)
        out = base_mw.copy()
        zones = sorted(self.zone_intensity[TECH[0]])
        zidx = np.searchsorted(zones, zone)
        kmax = int(n.max(initial=0))
        for j, t in enumerate(TECH):
            if self._is_v1(t):
                out[:, j] = base_mw[:, j] * np.exp(self._v1_growth(t, gr, n))
                continue
            # zone intensity lookup table: (n_zones, kmax) for years base .. base+kmax-1
            Z = np.array([[self._zint(t, z, self.base_year + k - 1) for k in range(1, kmax + 1)] for z in zones])
            cap = base_mw[:, j].copy()
            for k in range(1, kmax + 1):
                y = self.base_year + k
                act = n >= k
                if not act.any():
                    break
                zi = Z[zidx, k - 1]
                new = self._step(t, cap, y, gb * np.exp(gr * (k - 1)), gb * np.exp(gr * k), zi,
                                 xf if self.tx_last and y <= self.tx_last else 0.0)
                cap = np.where(act, new, cap)
            out[:, j] = cap
        return out

    def predict_state(self, state: str, year: int, gsdp_crore: float | None = None) -> dict:
        """Installed MW per technology for one state in `year`. For future years pass the state's GSDP
        (crore INR) in that year; if omitted the state's recent GSDP growth rate is assumed.
        Years up to the last fresh report return reported values; between that and the base year,
        the nowcast."""
        s = self.states[state]
        if year <= self.base_year:
            out = {}
            for t in TECH:
                ay = s["anchor"][t][0]
                h = self.history[state]
                out[t] = h[max(y for y in h if y <= year)][t] if year <= ay else s["nowcast"][year][t]
            return out
        gb = s["gsdp"][self.base_year]
        n = year - self.base_year
        if gsdp_crore is None or gsdp_crore <= 0:
            gr = np.log1p(s["gsdp_cagr"])
        else:
            gr = np.log(gsdp_crore / gb) / n
        base = self.base_capacity(state)
        res = self.forecast_batch([[base[t] for t in TECH]], [s["zone"]], [gb], [gr], [n], [self.tx_forward(state)])[0]
        return dict(zip(TECH, map(float, res)))

    def predict_frame(self, df: pd.DataFrame) -> pd.DataFrame:
        rows = [self.predict_state(r.State, int(r.Year), float(r.GSDP)) if r.State in self.states
                else dict.fromkeys(TECH, 0.0) for r in df.itertuples()]
        return pd.DataFrame(rows, index=df.index)[TECH]

    def zone_states(self, zone: str) -> list[str]:
        return sorted(s for s, v in self.states.items() if v["zone"] == zone)

    # ───────────── persistence ─────────────
    def to_json(self, path) -> None:
        d = asdict(self)
        d["model_type"] = "convergence_v2"
        d["tech_keys"] = TECH_KEY
        Path(path).write_text(json.dumps(d, indent=1))

    @classmethod
    def from_json(cls, path) -> "ConvergenceModel":
        d = json.loads(Path(path).read_text())
        m = cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
        ik = lambda dd: {int(k): v for k, v in dd.items()}  # noqa: E731  JSON keys -> int years
        for p in m.params.values():
            p["alpha"] = ik(p["alpha"])
        for s in m.states.values():
            s["gsdp"] = ik(s["gsdp"]); s["nowcast"] = ik(s["nowcast"])
        m.history = {s: ik(h) for s, h in m.history.items()}
        m.zone_intensity = {t: {z: ik(v) for z, v in zz.items()} for t, zz in m.zone_intensity.items()}
        m.tx = {s: ik(v) for s, v in m.tx.items()}
        m.tx_km = {s: ik(v) for s, v in m.tx_km.items()}
        return m
