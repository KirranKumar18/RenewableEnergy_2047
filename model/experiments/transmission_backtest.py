"""
Out-of-sample test of a transmission term in the v2 growth equation:

    growth += gamma * x(state, year)
    x = log1p(renewable-related transmission completed in the FY ending that year), demeaned across states
        within the year; 0 before FY2018-19 (no reports) and after FY2025-26.

The reports only start in FY2018-19, so training cutoffs are 2020, 2021 and 2022 (later years are
forecast with the transmission actually built, the same way the main backtest uses actual GSDP).

    .venv/bin/python model/experiments/transmission_backtest.py
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import EPS, ConvergenceModel  # noqa: E402
from train import naive, score  # noqa: E402

warnings.filterwarnings("ignore")
TXCSV = pd.read_csv(HERE.parents[1] / "data" / "external" / "npp_transmission_state_year.csv")


def tx_feature(states, col):
    T = TXCSV.pivot_table(index="State", columns="Year", values=col, aggfunc="sum").reindex(states).fillna(0.0)
    X = np.log1p(T)
    X = X - X.mean(0)
    return {st: {int(y): float(v) for y, v in X.loc[st].items()} for st in states}


class TxModel(ConvergenceModel):
    def __init__(self, col="re_sub_mva", techs=("Solar Power", "Wind Power"), **kw):
        super().__init__(**kw)
        self.col, self.techs, self.xmap, self._cur = col, techs, {}, None

    def _x(self, y):
        cur = self._cur if isinstance(self._cur, list) else [self._cur]
        return np.array([self.xmap.get(s, {}).get(y, 0.0) for s in cur])

    def fit(self, df):
        self.xmap = tx_feature(sorted(df.State.unique()), self.col)
        self._train_end = int(df.Year.max())
        return super().fit(df)

    def _pairs(self, df, fr, t, zint):
        P = super()._pairs(df, fr, t, zint)
        if t not in self.techs or P.empty:
            return P
        # recompute state per pair (parent drops it): rebuild alongside
        rows = []
        for st, g in df.groupby("State"):
            recs = g[fr.loc[g.index, t]].sort_values("Year").to_dict("records")
            for a, b in zip(recs[:-1], recs[1:]):
                if a[t] < self.min_mw:
                    continue
                xs = [self.xmap.get(st, {}).get(y, 0.0) for y in range(a["Year"] + 1, b["Year"] + 1)]
                rows.append(np.mean(xs))
        P["x"] = rows
        return P

    def _step(self, t, cap, y, g_prev, g_cur, zint_prev):
        new = super()._step(t, cap, y, g_prev, g_cur, zint_prev)
        g = self.params[t].get("gamma", 0.0)
        if g and self._cur is not None:
            new = np.maximum(np.expm1(np.log1p(new) + g * self._x(y)), cap)
        return new

    def _nowcast(self):
        for st in self.states:
            self._cur = st
            saved = self.states
            self.states = {st: saved[st]}
            try:
                super()._nowcast()
            finally:
                self.states = saved
        self._cur = None

    def _baseline_zone_paths(self):
        self._cur = list(self.states)
        super()._baseline_zone_paths()
        self._cur = None

    def predict_state(self, state, year, gsdp_crore=None):
        self._cur = state
        try:
            return super().predict_state(state, year, gsdp_crore)
        finally:
            self._cur = None


def fit_gamma(m: TxModel, df):
    """Refit each tech's regression with the x column added (same design as the parent fit)."""
    df = df.sort_values(["State", "Year"]).reset_index(drop=True)
    fr = fresh_mask(df)
    years = list(range(int(df.Year.min()) + 1, m.base_year + 1))
    for t in m.techs:
        if m.params[t].get("dynamics") == "v1":
            continue
        zint = m._zone_int_hist(df, t)
        P = m._pairs(df, fr, t, zint)
        if len(P) < m.min_pairs:
            continue
        D = np.zeros((len(P), len(years)))
        for i, (y0, y1, k) in enumerate(P[["y0", "y1", "k"]].values.astype(int)):
            for y in range(y0 + 1, y1 + 1):
                D[i, years.index(y)] = 1.0 / k
        X = np.c_[D, P.dg.values, P.gap.values, P.x.values]
        w = np.sqrt(P.k.values)
        R = np.eye(X.shape[1]) * m.ridge
        R[-3:, -3:] = 0
        Xw = X * w[:, None]
        with np.errstate(all="ignore"):
            coef = np.linalg.solve(Xw.T @ Xw + R, Xw.T @ (P.r.values * w))
        alpha = {y: float(c) for y, c in zip(years, coef[:len(years)]) if D[:, years.index(y)].sum() > 0.5}
        recent = [v for y, v in alpha.items() if y > m.base_year - m.trend_years]
        m.params[t].update({"alpha": alpha, "beta": float(max(coef[-3], 0)), "kappa": float(max(coef[-2], 0)),
                            "gamma": float(coef[-1]), "a_ref": float(np.mean(recent)) if recent else 0.0})
    m._nowcast(); m._baseline_zone_paths()
    return m


def make_tx(col):
    def f(tr, te):
        m = TxModel(col=col).fit(tr)
        fit_gamma(m, tr)
        return m.predict_frame(te), m
    return f


df = load_data()
fr = fresh_mask(df)
CUTS = [2020, 2021, 2022]
res, gammas = {}, {}
for cut in CUTS:
    tr, te = df[df.Year <= cut], df[df.Year > cut]
    te = te[te.State.isin(tr.State)]
    f = fr.loc[te.index]
    res[(cut, "v2 production")] = score(ConvergenceModel().fit(tr).predict_frame(te), te, f)
    res[(cut, "naive")] = score(naive(tr, te), te, f)
    for col in ["re_sub_mva", "re_line_ckm", "sub_mva"]:
        pred, m = make_tx(col)(tr, te)
        res[(cut, f"v2 + transmission ({col})")] = score(pred, te, f)
        gammas[(cut, col)] = {t.split()[0]: round(m.params[t].get("gamma", 0.0), 3) for t in m.techs}

R = pd.DataFrame(res).T
R.index.names = ["cutoff", "model"]
pd.set_option("display.width", 220)
cols = ["Solar Power", "Wind Power", "Total WAPE (fresh)"]
print(R[cols].round(1).to_string())
print("\nMean over cutoffs")
print(R.groupby(level="model")[cols].mean().sort_values("Total WAPE (fresh)").round(1).to_string())
print("\nFitted gamma (growth per unit of demeaned log transmission):", gammas)
print("\nFresh test values per cutoff (solar):", {c: int(fr.loc[df[(df.Year > c)].index, 'Solar Power'].sum()) for c in CUTS})
