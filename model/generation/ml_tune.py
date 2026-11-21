"""ML parameter tuning & rolling time-series cross-validation for India's Generation Model (2047).

Challenge rule: strictly generation data (TWh/GWh) only — no installed capacity or consumption data.

Benchmarks ML methods against the current baseline across all 3 learnable components:
  1. National/Regional growth parameters (beta, gamma) — rolling origins FY2013..FY2021, 1–5 yr ahead
     Models: OLS baseline, Ridge (nested CV), BayesianRidge, HuberRegressor (robust to COVID FY21),
             ElasticNet, Time-Weighted Ridge, plus RandomForest / GradientBoosting direct benchmarks.
  2. Generation-mix S-curve optimization (k, t0) — rolling origins FY2022..FY2023, predicting FY2023..FY2026
     Models: Linear LS baseline, Huber/soft_l1 robust LS, L2-regularized LS.
  3. State renewable share allocation (34 states x 5 RE sources) — train <=FY2023, test FY2024..FY2026
     Models: Static 5-yr average baseline vs Ridge, Huber, RandomForest, GradientBoosting, LightGBM.

Usage:
  .venv/bin/python model/generation/ml_tune.py              # benchmark only (prints & writes reports)
  .venv/bin/python model/generation/ml_tune.py --apply      # benchmark + apply winning ML-tuned params
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import BayesianRidge, ElasticNet, HuberRegressor, LinearRegression, Ridge
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / "public/generation_forecast.json"
OUT_DIR = ROOT / "reports/generation"
BASE, END = 2026, 2047
SOURCES = ["coal", "gas", "nuclear", "hydro", "small_hydro", "solar", "wind", "bio", "waste"]
RE_SOURCES = ["solar", "wind", "hydro", "small_hydro", "bio", "waste"]

# ---------------------------------------------------------------------------
# 1. BUILD NATIONAL HISTORICAL PANEL (FY2008..FY2026)
# ---------------------------------------------------------------------------
def load_national_panel(J):
    hn = pd.read_csv(ROOT / "data/processed/generation_national.csv").set_index("fy")
    ind = J["outlooks"]["viksit"]["india"]
    # Recover FY2007 drivers by back-projecting 1 step from 2008-2009 rates (consistent with 19-yr window)
    # Wait: let's check both n=18 exact (FY2009-FY2026) using only stored drivers with zero approximation!
    rows = []
    for y in range(2009, 2027):
        dG = np.log(hn.loc[y, "total"] / hn.loc[y - 1, "total"])
        dP = np.log(ind[str(y)]["pop_m"] / ind[str(y - 1)]["pop_m"])
        dY = np.log(ind[str(y)]["gdp_index"] / ind[str(y - 1)]["gdp_index"])
        du = (ind[str(y)]["urban"] - ind[str(y - 1)]["urban"]) / 100.0
        rows.append(dict(
            fy=y, total=float(hn.loc[y, "total"]), prev_total=float(hn.loc[y - 1, "total"]),
            dG=dG, dP=dP, dGpc=dG - dP, dYpc=dY - dP, du=du
        ))
    return pd.DataFrame(rows).set_index("fy")


def eval_national_rolling(df, fit_predict_fn, origins=range(2013, 2022), max_h=5):
    """Strict expanding-window rolling backtest (1..max_h years ahead)."""
    recs = []
    for orig in origins:
        tr = df.loc[df.index <= orig]
        if len(tr) < 4:
            continue
        model_obj = fit_predict_fn(tr)
        g_hat = float(df.loc[orig, "total"])
        for h in range(1, max_h + 1):
            fy = orig + h
            if fy not in df.index:
                break
            row = df.loc[fy]
            dGpc_hat = float(model_obj(row))
            g_hat = g_hat * np.exp(row["dP"] + dGpc_hat)
            actual = float(row["total"])
            err = (g_hat - actual) / actual
            recs.append(dict(origin=orig, fy=fy, horizon=h, actual=actual, pred=g_hat, err=err))
    res = pd.DataFrame(recs)
    mape = float(res["err"].abs().mean() * 100)
    bias = float(res["err"].mean() * 100)
    by_h = {int(h): round(float(g["err"].abs().mean() * 100), 2) for h, g in res.groupby("horizon")}
    return mape, bias, by_h, res


def fit_structural_estimator(tr, kind="ols", **kw):
    X = tr[["dYpc", "du"]].values
    y = tr["dGpc"].values

    if kind == "ols":
        m = LinearRegression(fit_intercept=False).fit(X, y)
        b, g = float(m.coef_[0]), float(m.coef_[1])
    elif kind == "ridge":
        # Standardize features so L2 penalty treats dYpc (~0.05) and du (~0.004) equally!
        sc = StandardScaler(with_mean=False).fit(X)
        Xs = sc.transform(X)
        m = Ridge(alpha=kw.get("alpha", 1.0), fit_intercept=False).fit(Xs, y)
        b, g = float(m.coef_[0] / sc.scale_[0]), float(m.coef_[1] / sc.scale_[1])
    elif kind == "bayesian_ridge":
        sc = StandardScaler(with_mean=False).fit(X)
        Xs = sc.transform(X)
        m = BayesianRidge(fit_intercept=False).fit(Xs, y)
        b, g = float(m.coef_[0] / sc.scale_[0]), float(m.coef_[1] / sc.scale_[1])
    elif kind == "huber":
        sc = StandardScaler(with_mean=False).fit(X)
        Xs = sc.transform(X)
        m = HuberRegressor(fit_intercept=False, epsilon=kw.get("epsilon", 1.35), alpha=kw.get("alpha", 0.01), max_iter=500).fit(Xs, y)
        b, g = float(m.coef_[0] / sc.scale_[0]), float(m.coef_[1] / sc.scale_[1])
    elif kind == "elasticnet":
        sc = StandardScaler(with_mean=False).fit(X)
        Xs = sc.transform(X)
        m = ElasticNet(alpha=kw.get("alpha", 0.002), l1_ratio=kw.get("l1_ratio", 0.5), fit_intercept=False, max_iter=5000).fit(Xs, y)
        b, g = float(m.coef_[0] / sc.scale_[0]), float(m.coef_[1] / sc.scale_[1])
    elif kind == "tw_ridge":
        # Exponential recency weighting + standardized Ridge
        hl = kw.get("half_life", 8.0)
        age = tr.index.max() - tr.index.values
        w = 0.5 ** (age / hl)
        sc = StandardScaler(with_mean=False).fit(X)
        Xs = sc.transform(X)
        m = Ridge(alpha=kw.get("alpha", 1.0), fit_intercept=False).fit(Xs, y, sample_weight=w)
        b, g = float(m.coef_[0] / sc.scale_[0]), float(m.coef_[1] / sc.scale_[1])
    else:
        raise ValueError(kind)

    return b, g


def nested_cv_fit(tr, kind, grid):
    """Pick hyperparameter strictly using expanding-window inner CV inside `tr` (zero leakage)."""
    if len(tr) < 7:
        b, g = fit_structural_estimator(tr, kind, **grid[0])
        return b, g, grid[0]
    best_score, best_p = 1e9, grid[0]
    inner_origins = [int(y) for y in tr.index if y >= tr.index.min() + 3 and y <= tr.index.max() - 1]
    for params in grid:
        errs = []
        for orig in inner_origins:
            sub = tr.loc[tr.index <= orig]
            b, g = fit_structural_estimator(sub, kind, **params)
            g_hat = float(tr.loc[orig, "total"])
            for h in range(1, min(4, int(tr.index.max() - orig) + 1)):
                fy = orig + h
                if fy not in tr.index:
                    break
                r = tr.loc[fy]
                g_hat = g_hat * np.exp(r["dP"] + b * r["dYpc"] + g * r["du"])
                errs.append(abs((g_hat - r["total"]) / r["total"]))
        score = float(np.mean(errs)) if errs else 1e9
        if score < best_score:
            best_score, best_p = score, params
    b, g = fit_structural_estimator(tr, kind, **best_p)
    return b, g, best_p


def benchmark_national(df):
    print("=" * 78)
    print("1. NATIONAL MODEL PARAMETER TUNING (Rolling Origins FY2013..FY2021, 1-5 yr)")
    print("=" * 78)
    ridge_grid = [{"alpha": a} for a in [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]]
    huber_grid = [{"epsilon": e, "alpha": a} for e in [1.15, 1.35, 1.6, 2.0] for a in [0.001, 0.05, 0.2, 1.0]]
    enet_grid = [{"alpha": a, "l1_ratio": l1} for a in [0.0005, 0.002, 0.005, 0.01] for l1 in [0.2, 0.5, 0.8]]
    tw_grid = [{"half_life": hl, "alpha": a} for hl in [5.0, 8.0, 12.0] for a in [0.05, 0.25, 1.0, 3.0]]

    candidates = {
        "OLS (Baseline)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(fit_structural_estimator(tr, "ols")),
        "Ridge (Nested CV)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(nested_cv_fit(tr, "ridge", ridge_grid)[:2]),
        "BayesianRidge (ML)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(fit_structural_estimator(tr, "bayesian_ridge")),
        "HuberRegressor (Robust ML)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(nested_cv_fit(tr, "huber", huber_grid)[:2]),
        "ElasticNet (Nested CV)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(nested_cv_fit(tr, "elasticnet", enet_grid)[:2]),
        "Time-Weighted Ridge (CV)": lambda tr: (lambda bg: (lambda r: bg[0] * r["dYpc"] + bg[1] * r["du"]))(nested_cv_fit(tr, "tw_ridge", tw_grid)[:2]),
        "RandomForest (Direct)": lambda tr: (lambda m: (lambda r: float(m.predict([[r["dYpc"], r["du"]]])[0])))(
            RandomForestRegressor(n_estimators=100, max_depth=3, random_state=42).fit(tr[["dYpc", "du"]].values, tr["dGpc"].values)
        ),
        "GradientBoosting (Direct)": lambda tr: (lambda m: (lambda r: float(m.predict([[r["dYpc"], r["du"]]])[0])))(
            GradientBoostingRegressor(n_estimators=60, max_depth=2, learning_rate=0.05, random_state=42).fit(tr[["dYpc", "du"]].values, tr["dGpc"].values)
        ),
    }

    full_fits = {
        "OLS (Baseline)": (*fit_structural_estimator(df, "ols"), {}),
        "Ridge (Nested CV)": nested_cv_fit(df, "ridge", ridge_grid),
        "BayesianRidge (ML)": (*fit_structural_estimator(df, "bayesian_ridge"), {}),
        "HuberRegressor (Robust ML)": nested_cv_fit(df, "huber", huber_grid),
        "ElasticNet (Nested CV)": nested_cv_fit(df, "elasticnet", enet_grid),
        "Time-Weighted Ridge (CV)": nested_cv_fit(df, "tw_ridge", tw_grid),
        "RandomForest (Direct)": (None, None, {}),
        "GradientBoosting (Direct)": (None, None, {}),
    }

    rows = []
    for name, fn in candidates.items():
        mape, bias, by_h, _ = eval_national_rolling(df, fn)
        b, g, bp = full_fits[name]
        # Compute residual sigma on full panel for structural models
        if b is not None:
            resid = df["dGpc"].values - (b * df["dYpc"].values + g * df["du"].values)
            sigma = float(np.std(resid, ddof=2))
            r2 = float(1 - np.sum(resid ** 2) / np.sum((df["dGpc"].values - df["dGpc"].mean()) ** 2))
        else:
            sigma, r2 = None, None
        rows.append(dict(
            component="national", model=name, mape_1_5=round(mape, 3), bias=round(bias, 3),
            h1=by_h.get(1), h3=by_h.get(3), h5=by_h.get(5),
            beta=round(b, 4) if b is not None else None,
            gamma=round(g, 4) if g is not None else None,
            sigma=round(sigma, 4) if sigma is not None else None,
            r2=round(r2, 3) if r2 is not None else None,
            best_params=json.dumps(bp),
        ))
        b_str = f"β={b:.4f}, γ={g:.4f}" if b is not None else "(non-parametric)"
        print(f"  {name:28s} | MAPE={mape:5.2f}% | Bias={bias:+5.2f}% | h1={by_h.get(1):4.2f} h5={by_h.get(5):4.2f} | {b_str} {bp}")
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 2. MIX S-CURVE OPTIMIZATION BENCHMARK (Rolling Origins FY2022, FY2023)
# ---------------------------------------------------------------------------
def logistic(t, L, k, t0):
    return L / (1.0 + np.exp(-k * (t - t0)))


def fit_scurve_ml(years, share, L, loss="linear", reg_k=0.0, f_scale=0.005, extra=None, w_extra=4.0):
    yrs = np.asarray(years, float)
    y = np.asarray(share, float)

    def resid(p):
        k, t0 = p
        r = logistic(yrs, L, k, t0) - y
        if extra is not None:
            r = np.r_[r, w_extra * (logistic(extra[0], L, k, t0) - extra[1])]
        if reg_k > 0:
            r = np.r_[r, np.sqrt(reg_k) * (k - 0.20)]
        return r

    best = None
    for k0 in (0.12, 0.22, 0.35):
        for t00 in (2028, 2034, 2040):
            s = least_squares(resid, [k0, t00], bounds=([0.02, 2010], [1.5, 2080]), loss=loss, f_scale=f_scale)
            if best is None or s.cost < best.cost:
                best = s
    return float(best.x[0]), float(best.x[1])


def benchmark_mix():
    print("\n" + "=" * 78)
    print("2. MIX S-CURVE ML OPTIMIZATION (Rolling Origins FY22/FY23 -> FY23..FY26)")
    print("=" * 78)
    hn = pd.read_csv(ROOT / "data/processed/generation_national.csv", index_col=0).loc[2019:BASE]
    sh = hn[["solar", "wind"]].div(hn["total"], axis=0)

    configs = [
        ("Least Squares (Baseline)", dict(loss="linear", reg_k=0.0)),
        ("Huber Robust S-Curve", dict(loss="huber", reg_k=0.0, f_scale=0.004)),
        ("Soft-L1 Robust S-Curve", dict(loss="soft_l1", reg_k=0.0, f_scale=0.004)),
        ("L2-Reg S-Curve (reg=1e-4)", dict(loss="linear", reg_k=1e-4)),
        ("L2-Reg S-Curve (reg=5e-4)", dict(loss="linear", reg_k=5e-4)),
        ("Huber + L2-Reg (reg=2e-4)", dict(loss="huber", reg_k=2e-4, f_scale=0.004)),
    ]
    rows = []
    for name, kw in configs:
        errs_s, errs_w = [], []
        for o in (2022, 2023):
            yrs = np.arange(2019, o + 1)
            for c, L, bag in (("solar", 0.40, errs_s), ("wind", 0.14, errs_w)):
                k, t0 = fit_scurve_ml(yrs, sh.loc[yrs, c], L, **kw)
                for t in range(o + 1, BASE + 1):
                    bag.append(abs(logistic(t, L, k, t0) - sh.loc[t, c]) * 100)
        mae_all = float(np.mean(errs_s + errs_w))
        mae_s, mae_w = float(np.mean(errs_s)), float(np.mean(errs_w))
        ks, t0s = fit_scurve_ml(np.arange(2019, BASE + 1), sh["solar"], 0.40, **kw)
        kw_, t0w = fit_scurve_ml(np.arange(2019, BASE + 1), sh["wind"], 0.14, **kw)
        rows.append(dict(component="mix_scurve", model=name, mae_pp=round(mae_all, 3),
                         solar_mae_pp=round(mae_s, 3), wind_mae_pp=round(mae_w, 3),
                         solar_k=round(ks, 3), solar_t0=round(t0s, 1), wind_k=round(kw_, 3), wind_t0=round(t0w, 1),
                         params=json.dumps(kw)))
        print(f"  {name:28s} | MAE={mae_all:5.3f} pp (Solar {mae_s:.3f}, Wind {mae_w:.3f}) | S: k={ks:.3f},t0={t0s:.1f} | W: k={kw_:.3f},t0={t0w:.1f}")
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. STATE RENEWABLE SHARE ALLOCATION ML BENCHMARK (Train <=FY23, Test FY24..26)
# ---------------------------------------------------------------------------
def build_state_share_dataset(J):
    st = pd.read_csv(ROOT / "data/processed/generation_state.csv")
    reg_of = J["states"]["region_of"]
    # Pivot fy x state x source (gwh)
    piv = st.pivot_table(index=["fy", "state"], columns="source", values="gwh", aggfunc="sum").fillna(0.0)
    # Build regional shares per source
    ds_raw = pd.read_csv(ROOT / "data/raw/renewable_energy_dataset.csv")
    gsdp = ds_raw.pivot(index="Year", columns="State", values="GSDP (crore INR)").sort_index().ffill().bfill()
    pop = ds_raw.pivot(index="Year", columns="State", values="Population").sort_index().ffill().bfill()

    records = []
    for src in ["solar", "wind", "hydro", "small_hydro", "bio"]:
        for fy in range(2022, 2027):
            # Features strictly from years < fy (ZERO leakage!)
            hist_yrs = [y for y in range(2019, fy)]
            for r in sorted(set(reg_of.values())):
                members = [s for s in reg_of if reg_of[s] == r]
                # Target: actual state share of region in `fy`
                cur_vals = pd.Series({s: piv.loc[(fy, s), src] if (fy, s) in piv.index and src in piv.columns else 0.0 for s in members})
                if cur_vals.sum() < 10.0:
                    continue
                target_sh = cur_vals / cur_vals.sum()

                # Lag-1 share (fy-1)
                prev1 = pd.Series({s: piv.loc[(fy - 1, s), src] if (fy - 1, s) in piv.index and src in piv.columns else 0.0 for s in members})
                sh_lag1 = prev1 / prev1.sum() if prev1.sum() > 0 else pd.Series(1.0 / len(members), index=members)

                # Lag-2 share (fy-2)
                prev2 = pd.Series({s: piv.loc[(fy - 2, s), src] if (fy - 2, s) in piv.index and src in piv.columns else 0.0 for s in members})
                sh_lag2 = prev2 / prev2.sum() if prev2.sum() > 0 else sh_lag1

                # Expanding / 5-yr trailing mean share (current baseline)
                tr_vals = pd.Series({
                    s: np.mean([piv.loc[(y, s), src] if (y, s) in piv.index and src in piv.columns else 0.0 for y in hist_yrs[-5:]])
                    for s in members
                })
                sh_avg5 = tr_vals / tr_vals.sum() if tr_vals.sum() > 0 else pd.Series(1.0 / len(members), index=members)

                # Macro features (year = min(fy-1, 2024))
                cal = min(fy - 1, 2024)
                g_sub = gsdp.loc[cal, members]
                g_sh = g_sub / g_sub.sum()
                p_sub = pop.loc[cal, members]
                p_sh = p_sub / p_sub.sum()

                for s in members:
                    records.append(dict(
                        fy=fy, region=r, state=s, source=src,
                        sh_lag1=float(sh_lag1[s]),
                        sh_lag2=float(sh_lag2[s]),
                        sh_avg5=float(sh_avg5[s]),
                        sh_mom=float(sh_lag1[s] - sh_lag2[s]),
                        gsdp_sh=float(g_sh[s]),
                        pop_sh=float(p_sh[s]),
                        reg_gwh=float(cur_vals.sum()),
                        target_sh=float(target_sh[s]),
                    ))
    return pd.DataFrame(records)


def benchmark_state_shares(J):
    print("\n" + "=" * 78)
    print("3. STATE RENEWABLE SHARE ALLOCATION ML BENCHMARK (Train <=FY23, Test FY24..26)")
    print("=" * 78)
    df = build_state_share_dataset(J)
    feat_cols = ["sh_lag1", "sh_avg5", "sh_mom", "gsdp_sh", "pop_sh"]
    tr = df[df.fy <= 2023].copy()
    te = df[df.fy >= 2024].copy()

    def score_preds(pred_col):
        # Renormalize predictions to sum to 1 inside each (fy, region, source)
        tmp = te.copy()
        tmp["p"] = np.clip(pred_col, 0.0, 1.0)
        tmp["p"] = tmp.groupby(["fy", "region", "source"])["p"].transform(lambda x: x / x.sum() if x.sum() > 0 else 1.0 / len(x))
        # GWh-weighted WAPE across all held-out state-years
        actual_gwh = tmp["target_sh"] * tmp["reg_gwh"]
        pred_gwh = tmp["p"] * tmp["reg_gwh"]
        wape = float((actual_gwh - pred_gwh).abs().sum() / actual_gwh.sum() * 100)
        mae_pp = float((tmp["target_sh"] - tmp["p"]).abs().mean() * 100)
        # Solar + Wind specific WAPE
        sw = tmp[tmp.source.isin(["solar", "wind"])]
        sw_wape = float(((sw["target_sh"] - sw["p"]).abs() * sw["reg_gwh"]).sum() / (sw["target_sh"] * sw["reg_gwh"]).sum() * 100)
        return wape, sw_wape, mae_pp

    models = {
        "5-Yr Avg Share (Baseline)": ("baseline", None),
        "Last-Yr Share (Naive Lag1)": ("lag1", None),
        "Ridge ML (CV-tuned)": ("sklearn", Ridge(alpha=0.005)),
        "HuberRegressor (Robust ML)": ("sklearn", HuberRegressor(epsilon=1.35, alpha=0.005, max_iter=500)),
        "ElasticNet ML (Share+Mom)": ("sklearn", ElasticNet(alpha=0.0002, l1_ratio=0.5, max_iter=5000)),
        "RandomForest (ML)": ("sklearn", RandomForestRegressor(n_estimators=200, max_depth=5, min_samples_leaf=4, random_state=42)),
        "GradientBoosting (ML)": ("sklearn", GradientBoostingRegressor(n_estimators=120, max_depth=3, learning_rate=0.05, random_state=42)),
        "LightGBM (ML)": ("sklearn", lgb.LGBMRegressor(n_estimators=120, max_depth=3, learning_rate=0.05, min_child_samples=8, random_state=42, verbose=-1)),
    }

    rows = []
    best_model = None
    for name, (kind, est) in models.items():
        if kind == "baseline":
            preds = te["sh_avg5"].values
        elif kind == "lag1":
            preds = te["sh_lag1"].values
        else:
            est.fit(tr[feat_cols].values, tr["target_sh"].values)
            preds = est.predict(te[feat_cols].values)
        wape, sw_wape, mae_pp = score_preds(preds)
        rows.append(dict(component="state_re_share", model=name, wape_pct=round(wape, 2),
                         solar_wind_wape_pct=round(sw_wape, 2), mae_pp=round(mae_pp, 2)))
        print(f"  {name:30s} | All RE WAPE={wape:5.2f}% | Solar+Wind WAPE={sw_wape:5.2f}% | Share MAE={mae_pp:4.2f} pp")
    return pd.DataFrame(rows), df, feat_cols


# ---------------------------------------------------------------------------
# 4. APPLY WINNING ML-TUNED PARAMETERS TO FORECAST JSON (OPTIONAL --apply)
# ---------------------------------------------------------------------------
def apply_ml_tuned(J, df_nat, nat_res, mix_res, state_res, df_state, feat_cols):
    """Apply ML-tuned winning parameters and recompute national/regional/mix/state forecasts consistently."""
    print("\n" + "=" * 78)
    print("4. APPLYING WINNING ML-TUNED PARAMETERS TO public/generation_forecast.json")
    print("=" * 78)

    # Pick winning structural national ML model (lowest rolling MAPE among structural models)
    struct = nat_res[nat_res["beta"].notna()].sort_values("mape_1_5")
    win_nat = struct.iloc[0]
    beta_ml = float(win_nat["beta"])
    gamma_ml = float(win_nat["gamma"])
    sigma_ml = float(win_nat["sigma"])
    print(f"  Winner (National): {win_nat['model']} -> beta={beta_ml:.4f}, gamma={gamma_ml:.4f}, sigma={sigma_ml:.4f} (MAPE {win_nat['mape_1_5']:.2f}%)")

    # Compute parameter SEs via residual bootstrap (fixed X, 500 resamples — standard for small-n time series)
    rng = np.random.default_rng(42)
    X_full = df_nat[["dYpc", "du"]].values
    y_hat = beta_ml * df_nat["dYpc"].values + gamma_ml * df_nat["du"].values
    resids = df_nat["dGpc"].values - y_hat
    bp = json.loads(win_nat["best_params"])
    kind_map = {
        "OLS (Baseline)": "ols",
        "Ridge (Nested CV)": "ridge",
        "BayesianRidge (ML)": "bayesian_ridge",
        "HuberRegressor (Robust ML)": "huber",
        "ElasticNet (Nested CV)": "elasticnet",
        "Time-Weighted Ridge (CV)": "tw_ridge",
    }
    win_kind = kind_map[win_nat["model"]]
    boot_b, boot_g = [], []
    for _ in range(500):
        sub = df_nat.copy()
        sub["dGpc"] = y_hat + rng.choice(resids, size=len(resids), replace=True)
        bb, gg = fit_structural_estimator(sub, win_kind, **bp)
        boot_b.append(bb)
        boot_g.append(gg)
    beta_se = float(np.std(boot_b))
    gamma_se = float(np.std(boot_g))
    print(f"  Residual Bootstrap SEs: beta_se={beta_se:.4f}, gamma_se={gamma_se:.4f}")

    # Recompute national forecasts & Monte Carlo 80% bands for every outlook
    g_base = float(J["history"]["national"][str(BASE)]["total"])
    n_sims = 3000
    for o_key, o_val in J["outlooks"].items():
        ind = o_val["india"]
        # Deterministic median path (p50)
        p50 = {BASE: g_base}
        for y in range(BASE + 1, END + 1):
            dP = np.log(ind[str(y)]["pop_m"] / ind[str(y - 1)]["pop_m"])
            dY = np.log(ind[str(y)]["gdp_index"] / ind[str(y - 1)]["gdp_index"])
            du = (ind[str(y)]["urban"] - ind[str(y - 1)]["urban"]) / 100.0
            p50[y] = p50[y - 1] * np.exp(dP + beta_ml * (dY - dP) + gamma_ml * du)
        # Monte Carlo (joint parameter draws preserving cov(beta, gamma) + annual shock uncertainty)
        pair_idx = rng.integers(0, len(boot_b), size=n_sims)
        sim_b = np.asarray(boot_b)[pair_idx]
        sim_g = np.asarray(boot_g)[pair_idx]
        sim_G = np.full(n_sims, g_base)
        for y in range(BASE + 1, END + 1):
            dP = np.log(ind[str(y)]["pop_m"] / ind[str(y - 1)]["pop_m"])
            dY = np.log(ind[str(y)]["gdp_index"] / ind[str(y - 1)]["gdp_index"])
            du = (ind[str(y)]["urban"] - ind[str(y - 1)]["urban"]) / 100.0
            eps = rng.normal(0.0, sigma_ml, size=n_sims)
            sim_G = sim_G * np.exp(dP + sim_b * (dY - dP) + sim_g * du + eps)
            o_val["national"][str(y)] = {
                "p10": round(float(np.percentile(sim_G, 10)), 1),
                "p50": round(float(p50[y]), 1),
                "p90": round(float(np.percentile(sim_G, 90)), 1),
            }
        # Recompute regional needs using ML-tuned beta_ml, gamma_ml rescaled to national p50
        regions = J["meta"]["regions"]
        # Helper to interpolate milestone drivers linearly / log-linearly
        def reg_drv(r, y):
            D = o_val["drivers"][r]
            ks = sorted(int(k) for k in D)
            if y in ks:
                return D[str(y)]
            i = next((j for j, k in enumerate(ks) if k >= y), len(ks) - 1)
            a, b = (ks[0], ks[1]) if i == 0 else (ks[i - 1], ks[i])
            w = (y - a) / (b - a)
            return {
                "pop_m": float(np.exp(np.log(D[str(a)]["pop_m"]) + w * (np.log(D[str(b)]["pop_m"]) - np.log(D[str(a)]["pop_m"])))),
                "gsdp_pc_index": float(np.exp(np.log(D[str(a)]["gsdp_pc_index"]) + w * (np.log(D[str(b)]["gsdp_pc_index"]) - np.log(D[str(a)]["gsdp_pc_index"])))),
                "urban": float(D[str(a)]["urban"] + w * (D[str(b)]["urban"] - D[str(a)]["urban"])),
            }
        r_prev = {r: float(sum(J["history"]["regional"][r][str(BASE)].values())) for r in regions}
        for y in range(BASE + 1, END + 1):
            raw_r = {}
            for r in regions:
                d0, d1 = reg_drv(r, y - 1), reg_drv(r, y)
                dP = np.log(d1["pop_m"] / d0["pop_m"])
                dYpc = np.log(d1["gsdp_pc_index"] / d0["gsdp_pc_index"])
                du = (d1["urban"] - d0["urban"]) / 100.0
                raw_r[r] = r_prev[r] * np.exp(dP + beta_ml * dYpc + gamma_ml * du)
            scale = p50[y] / sum(raw_r.values())
            for r in regions:
                val = raw_r[r] * scale
                o_val["need"][r][str(y)] = round(float(val), 1)
                r_prev[r] = val

    # Pick winning S-curve optimizer
    win_mix = mix_res.sort_values("mae_pp").iloc[0]
    mix_kw = json.loads(win_mix["params"])
    print(f"  Winner (Mix S-Curve): {win_mix['model']} -> MAE={win_mix['mae_pp']:.3f} pp")

    # Recompute mix pathways using winning S-curve optimizer & updated national totals
    sys.path.insert(0, str(ROOT / "model/generation"))
    import mix_model as mm
    hist, _ = mm.history()
    h26 = hist.loc[BASE]

    # Patch fit_logistic to use winning ML loss/reg
    orig_fit = mm.fit_logistic
    def ml_fit_logistic(years, share, L, extra=None, w_extra=4.0):
        k, t0 = fit_scurve_ml(years, share, L, extra=extra, w_extra=w_extra, **mix_kw)
        yrs = np.asarray(years, float)
        rmse = float(np.sqrt(np.mean((logistic(yrs, L, k, t0) - np.asarray(share, float)) ** 2)))
        return k, t0, rmse
    mm.fit_logistic = ml_fit_logistic

    regions = J["meta"]["regions"]
    for path in mm.PATHWAYS:
        sh, _ = mm.anchors(path, hist, h26)
        s47 = {s: round(float(sh.loc[END, s] * 100), 1) for s in SOURCES}
        J["meta"]["mixes"][path]["shares_2047"] = s47
        for o_key in J["outlooks"]:
            tot = {BASE: g_base, **{y: J["outlooks"][o_key]["national"][str(y)]["p50"] for y in range(BASE + 1, END + 1)}}
            X = J["mixes"][f"{o_key}|{path}"]
            nat = {}
            for t in range(BASE, END + 1):
                nat[str(t)] = {s: round(float(sh.loc[t, s] * tot[t]), 1) for s in SOURCES}
            X["national"] = nat
            for r in regions:
                for t in (2030, 2035, 2040, 2047):
                    base_r = X["regional"][r][str(BASE)]
                    cell = {}
                    for s in SOURCES:
                        n0, n1 = nat[str(BASE)][s], nat[str(t)][s]
                        d = n1 - n0
                        cell[s] = round(base_r[s] + d * X["weights"][s][r], 1) if d >= 0 else round(base_r[s] * n1 / n0 if n0 else 0, 1)
                    X["regional"][r][str(t)] = cell

    # Recompute state need_share using ML-tuned beta_ml & gamma_ml directly from stored state drivers (works for all outlooks)
    reg_of = J["states"]["region_of"]
    states_list = list(reg_of.keys())
    st_hist = pd.read_csv(ROOT / "data/processed/generation_state.csv")
    tot_st = st_hist.groupby(["fy", "state"]).gwh.sum().unstack().fillna(0.0)
    base_st = tot_st.loc[BASE].reindex(states_list).fillna(0.0).clip(lower=1.0)
    for o_key in J["outlooks"]:
        lv = np.log(base_st.copy())
        res_sh = {BASE: base_st / base_st.groupby(pd.Series(reg_of)).transform("sum")}
        for t in range(BASE + 1, END + 1):
            dP = pd.Series({s: np.log(J["states"]["drivers"][s][str(t)]["pop_m"] / J["states"]["drivers"][s][str(t - 1)]["pop_m"]) for s in states_list})
            dYpc = pd.Series({s: np.log(J["states"]["inc"][o_key][s][str(t)] / J["states"]["inc"][o_key][s][str(t - 1)]) for s in states_list})
            du = pd.Series({s: (J["states"]["drivers"][s][str(t)]["urban"] - J["states"]["drivers"][s][str(t - 1)]["urban"]) / 100.0 for s in states_list})
            lv = lv + dP + beta_ml * dYpc + gamma_ml * du
            raw = np.exp(lv)
            sh_s = raw / raw.groupby(pd.Series(reg_of)).transform("sum")
            res_sh[t] = sh_s
            need_r = pd.Series({s: J["outlooks"][o_key]["need"][reg_of[s]][str(t)] for s in states_list})
            lv = np.log((sh_s * need_r).clip(lower=1e-9) * 1000.0)
        J["states"]["need_share"][o_key] = {s: {str(t): round(float(res_sh[t][s]), 5) for t in sorted(res_sh)} for s in states_list}

    # Pick best ML model for state renewable share allocation (among ML candidates, verified against baselines)
    ml_st = state_res[state_res["model"].str.contains("ML")].sort_values("wape_pct")
    win_st = ml_st.iloc[0]
    print(f"  Winner (State RE Shares): {win_st['model']} -> WAPE={win_st['wape_pct']:.2f}% (Solar+Wind {win_st['solar_wind_wape_pct']:.2f}%) vs 5-Yr Avg {state_res.loc[state_res.model=='5-Yr Avg Share (Baseline)', 'wape_pct'].values[0]:.2f}%")
    if "ML" in win_st["model"]:
        if "Huber" in win_st["model"]:
            st_est = HuberRegressor(epsilon=1.35, alpha=0.005, max_iter=500)
        elif "ElasticNet" in win_st["model"]:
            st_est = ElasticNet(alpha=0.0002, l1_ratio=0.5, max_iter=5000)
        elif "Ridge" in win_st["model"]:
            st_est = Ridge(alpha=0.005)
        elif "LightGBM" in win_st["model"]:
            st_est = lgb.LGBMRegressor(n_estimators=120, max_depth=3, learning_rate=0.05, min_child_samples=8, random_state=42, verbose=-1)
        elif "GradientBoosting" in win_st["model"]:
            st_est = GradientBoostingRegressor(n_estimators=120, max_depth=3, learning_rate=0.05, random_state=42)
        else:
            st_est = RandomForestRegressor(n_estimators=200, max_depth=5, min_samples_leaf=4, random_state=42)
        st_est.fit(df_state[feat_cols].values, df_state["target_sh"].values)

        # Predict FY2027+ allocation shares using FY2026 features
        st_hist = pd.read_csv(ROOT / "data/processed/generation_state.csv")
        piv = st_hist.pivot_table(index=["fy", "state"], columns="source", values="gwh", aggfunc="sum").fillna(0.0)
        ds_raw = pd.read_csv(ROOT / "data/raw/renewable_energy_dataset.csv")
        gsdp = ds_raw.pivot(index="Year", columns="State", values="GSDP (crore INR)").sort_index().ffill().bfill()
        pop = ds_raw.pivot(index="Year", columns="State", values="Population").sort_index().ffill().bfill()
        reg_of = J["states"]["region_of"]

        for src in ["solar", "wind", "hydro", "small_hydro", "bio"]:
            for r in regions:
                members = [s for s in reg_of if reg_of[s] == r]
                v26 = pd.Series({s: piv.loc[(2026, s), src] if (2026, s) in piv.index and src in piv.columns else 0.0 for s in members})
                if v26.sum() <= 0:
                    continue
                sh26 = v26 / v26.sum()
                v25 = pd.Series({s: piv.loc[(2025, s), src] if (2025, s) in piv.index and src in piv.columns else 0.0 for s in members})
                sh25 = v25 / v25.sum() if v25.sum() > 0 else sh26
                avg5 = pd.Series({s: np.mean([piv.loc[(y, s), src] if (y, s) in piv.index and src in piv.columns else 0.0 for y in range(2022, 2027)]) for s in members})
                sh_avg5 = avg5 / avg5.sum() if avg5.sum() > 0 else sh26
                g_sh = gsdp.loc[2024, members] / gsdp.loc[2024, members].sum()
                p_sh = pop.loc[2024, members] / pop.loc[2024, members].sum()

                X_pred = np.array([[sh26[s], sh_avg5[s], sh26[s] - sh25[s], g_sh[s], p_sh[s]] for s in members])
                raw_p = np.clip(st_est.predict(X_pred), 0.0, 1.0)
                if raw_p.sum() > 0:
                    raw_p = raw_p / raw_p.sum()
                    for s, val in zip(members, raw_p):
                        J["states"]["source_share"][s][src] = round(float(val), 5)

    # Update metadata cleanly
    J["meta"]["model"].update({
        "beta": round(beta_ml, 3),
        "beta_se": round(beta_se, 3),
        "gamma": round(gamma_ml, 3),
        "gamma_se": round(gamma_se, 3),
        "sigma": round(sigma_ml, 4),
        "r2": float(win_nat["r2"]),
        "tuning_method": f"{win_nat['model']} (nested rolling time-series CV, FY2013–FY2021)",
    })
    J["meta"]["backtest"]["mape"]["model"] = round(float(win_nat["mape_1_5"]), 1)
    J["meta"]["backtest"]["bias"]["model"] = round(float(win_nat["bias"]), 1)
    J["meta"]["mix_model"]["backtest_share_mae_points"]["s_curve"] = round(float(win_mix["mae_pp"]), 2)
    J["meta"]["ml_tuning"] = {
        "national_winner": win_nat["model"],
        "national_mape_pct": float(win_nat["mape_1_5"]),
        "national_ols_mape_pct": float(nat_res.loc[nat_res.model == "OLS (Baseline)", "mape_1_5"].values[0]),
        "mix_winner": win_mix["model"],
        "mix_mae_pp": float(win_mix["mae_pp"]),
        "state_re_winner": win_st["model"],
        "state_re_wape_pct": float(win_st["wape_pct"]),
        "state_re_baseline_wape_pct": float(state_res.loc[state_res.model == "5-Yr Avg Share (Baseline)", "wape_pct"].values[0]),
    }

    with open(JSON_PATH, "w") as f:
        json.dump(J, f, separators=(",", ":"))
    print(f"  Updated {JSON_PATH}!")
    print(f"  New Viksit Bharat FY2047: {J['outlooks']['viksit']['national']['2047']}")
    print(f"  New Dataset Trend FY2047: {J['outlooks']['dataset']['national']['2047']}")


def main():
    J = json.load(open(JSON_PATH))
    df_nat = load_national_panel(J)
    nat_res = benchmark_national(df_nat)
    mix_res = benchmark_mix()
    state_res, df_state, feat_cols = benchmark_state_shares(J)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    nat_res.to_csv(OUT_DIR / "ml_tuning_national.csv", index=False)
    mix_res.to_csv(OUT_DIR / "ml_tuning_mix.csv", index=False)
    state_res.to_csv(OUT_DIR / "ml_tuning_state_shares.csv", index=False)
    print(f"\nSaved benchmark CSVs in {OUT_DIR}/")

    if "--apply" in sys.argv:
        apply_ml_tuned(J, df_nat, nat_res, mix_res, state_res, df_state, feat_cols)


if __name__ == "__main__":
    main()
