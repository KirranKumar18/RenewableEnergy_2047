"""
Neural-network alternative to the v2 capacity model, scored with the same fresh-only backtest.

Direct multi-horizon set-up: from an origin year T, predict each state's log-growth of capacity for each
technology h = 1..8 years ahead:

    target  = log1p(MW[T+h]) - log1p(MW[T])            (only where the T+h value is a fresh report)
    features (known at T, plus the GSDP path, which the backtest gives every model):
        h, log1p(MW[T]), state growth over the last 3 years, national growth of that technology over the
        last 3 years, catch-up gap (log zone intensity / state intensity), GSDP growth over the horizon,
        log GSDP[T], zone and technology one-hots

Learners: an MLP (2 hidden layers, 64 and 32 units, early stopping, 5 seeds averaged), a smaller and heavily
regularised MLP (16 and 8 units, L2 alpha 1.0) and, for reference,
gradient-boosted trees on the same features. Also scored: a 50/50 blend of the MLP and the production model.

    .venv/bin/python model/experiments/neural_net.py
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, score  # noqa: E402

warnings.filterwarnings("ignore")
H_MAX = 8


def panel(df):
    """Wide arrays: years x states for each tech, GSDP, zone."""
    years = np.arange(df.Year.min(), df.Year.max() + 1)
    states = sorted(df.State.unique())
    W = {t: df.pivot(index="Year", columns="State", values=t).reindex(index=years, columns=states) for t in TECH}
    G = df.pivot(index="Year", columns="State", values="GSDP").reindex(index=years, columns=states).interpolate(limit_direction="both")
    zone = df.groupby("State").Zone.first().reindex(states)
    return years, states, W, G, zone


def features(df, fr, origins, horizons, with_target):
    years, states, W, G, zone = panel(df)
    F = {t: fr.assign(Year=df.Year, State=df.State).pivot(index="Year", columns="State", values=t)
         .reindex(index=years, columns=states).fillna(False) for t in TECH}
    zones = sorted(zone.unique())
    rows = []
    for t in TECH:
        X = W[t].ffill().fillna(0.0)
        nat = np.log1p(X.sum(1))
        for T in origins:
            if T - 3 < years[0]:
                continue
            capT = X.loc[T]
            g3 = (np.log1p(capT) - np.log1p(X.loc[T - 3])) / 3
            ng3 = (nat.loc[T] - nat.loc[T - 3]) / 3
            zi = {z: X.loc[T, zone.index[zone == z]].sum() / G.loc[T, zone.index[zone == z]].sum() for z in zones}
            for s in states:
                if not np.isfinite(G.loc[T, s]):
                    continue
                i_s = capT[s] / G.loc[T, s]
                gap = float(np.clip(np.log((zi[zone[s]] * 1e5 + 1) / (i_s * 1e5 + 1)), -4, 4))
                for h in horizons:
                    D = T + h
                    if D > years[-1]:
                        continue
                    if with_target and not (F[t].loc[D, s] and np.isfinite(W[t].loc[D, s])):
                        continue
                    r = {"tech": t, "state": s, "T": T, "year": D, "h": h, "logcap": np.log1p(capT[s]),
                         "g3": g3[s], "ng3": ng3, "gap": gap, "dg": np.log(G.loc[D, s] / G.loc[T, s]) / h,
                         "logg": np.log(G.loc[T, s]), "cap0": capT[s]}
                    for z in zones:
                        r["z_" + z] = float(zone[s] == z)
                    for tt in TECH:
                        r["t_" + tt[:5]] = float(t == tt)
                    if with_target:
                        r["y"] = np.log1p(W[t].loc[D, s]) - np.log1p(capT[s])
                    rows.append(r)
    return pd.DataFrame(rows)


FEATS = None


def fit_predict(df_all, fr_all, cut, te, learner):
    """Train on origins up to cut-1 with targets <= cut; predict test rows from origin = cut."""
    global FEATS
    tr = df_all[df_all.Year <= cut]
    Xtr = features(tr, fr_all.loc[tr.index], range(tr.Year.min() + 3, cut), range(1, H_MAX + 1), True)
    Xtr = Xtr[Xtr.year <= cut]
    FEATS = [c for c in Xtr.columns if c not in ("tech", "state", "T", "year", "y", "cap0")]
    # test features: origin = cut, but the GSDP path to each test year comes from the full data (like other models)
    full = df_all[df_all.State.isin(tr.State.unique())]
    Xte = features(full, fr_all.loc[full.index], [cut], range(1, H_MAX + 1), False)
    preds = []
    seeds = range(5) if learner.startswith("mlp") else [0]
    for sd in seeds:
        if learner == "mlp_small":
            m = make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(16, 8), alpha=1.0, learning_rate_init=1e-3,
                                                             max_iter=3000, early_stopping=True, validation_fraction=0.2,
                                                             n_iter_no_change=50, random_state=sd))
        elif learner == "mlp":
            m = make_pipeline(StandardScaler(), MLPRegressor(hidden_layer_sizes=(64, 32), alpha=1e-3, learning_rate_init=1e-3,
                                                             max_iter=2000, early_stopping=True, validation_fraction=0.15,
                                                             n_iter_no_change=50, random_state=sd))
        else:
            m = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, max_depth=3, min_samples_leaf=20, random_state=sd)
        m.fit(Xtr[FEATS].values, Xtr.y.values)
        preds.append(m.predict(Xte[FEATS].values))
    Xte["pred"] = np.maximum(np.expm1(Xte.logcap + np.mean(preds, 0)), Xte.cap0)
    P = Xte.pivot_table(index=["state", "year"], columns="tech", values="pred")
    out = pd.DataFrame(index=te.index, columns=TECH, dtype=float)
    for i, r in te.iterrows():
        key = (r.State, r.Year)
        out.loc[i] = P.loc[key, TECH].values if key in P.index else 0.0
    return out.fillna(0.0)


if __name__ == "__main__":
    pd.set_option("display.width", 220)
    df = load_data(); fr = fresh_mask(df)
    res = {}
    for label, cuts in [("standard", CUTOFFS), ("recent", RECENT_CUTOFFS)]:
        for cut in cuts:
            tr, te = df[df.Year <= cut], df[df.Year > cut]
            te = te[te.State.isin(tr.State)]
            f = fr.loc[te.index]
            prod = ConvergenceModel().fit(tr).predict_frame(te)
            mlp = fit_predict(df, fr, cut, te, "mlp")
            gbm = fit_predict(df, fr, cut, te, "gbm")
            mlps = fit_predict(df, fr, cut, te, "mlp_small")
            for name, p in [("production (v2)", prod), ("neural net (MLP 64-32)", mlp), ("gradient-boosted trees", gbm),
                            ("neural net, small + regularised (16-8)", mlps), ("blend: 75% v2 + 25% small MLP", 0.75 * prod + 0.25 * mlps),
                            ("blend: 50% v2 + 50% MLP", 0.5 * prod + 0.5 * mlp),
                            ("blend: 75% v2 + 25% MLP", 0.75 * prod + 0.25 * mlp)]:
                res[(label, cut, name)] = score(p, te, f)
    R = pd.DataFrame(res).T
    R.index.names = ["set", "cutoff", "model"]
    print(R["Total WAPE (fresh)"].unstack("model").round(1).to_string())
    M = R.groupby(level=["set", "model"])[["Solar Power", "Wind Power", "Total WAPE (fresh)"]].mean()
    print("\nMean over cutoffs:")
    print(M.round(1).to_string())
    print("\nBoth sets combined (total WAPE %):")
    print(R.groupby(level="model")["Total WAPE (fresh)"].mean().sort_values().round(2).to_string())
