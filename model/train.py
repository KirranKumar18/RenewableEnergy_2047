"""
Train + evaluate the forecast models.

    .venv/bin/python model/train.py               # backtest, fit on all data, save artifacts
    .venv/bin/python model/train.py --compare     # also backtest the original tree ensemble (slow)

Scoring is "fresh-only": a test value counts only if it is a genuine new report (the value changed vs
the previous year). Exact repeats are mostly carry-forwards in this dataset (19 of 34 states are frozen
at 2022 values for 2023-24), and scoring against them rewards models for predicting no growth.

Outputs
    model/re2047_model.json      v2 convergence model (production; ConvergenceModel.from_json)
    model/re2047_model_v1.json   v1 GSDP-elasticity model (kept for comparison)
    model/metrics.json           backtest scores + national forecast
"""
import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from re_model import TECH, ElasticityModel, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
CUTOFFS = [2016, 2018, 2020]
RECENT_CUTOFFS = [2020, 2021, 2022]  # transmission reports start FY2018-19


def score(pred: pd.DataFrame, act: pd.DataFrame, fresh: pd.DataFrame) -> dict:
    """Weighted absolute % error per tech on fresh test values, plus total and all-values total."""
    out, e_tot, a_tot = {}, 0.0, 0.0
    for t in TECH:
        f = fresh[t]
        e = float(np.abs(pred.loc[f, t] - act.loc[f, t]).sum()); a = float(act.loc[f, t].sum())
        out[t] = e / max(a, 1e-9) * 100
        e_tot += e; a_tot += a
    out["Total WAPE (fresh)"] = e_tot / a_tot * 100
    out["Total WAPE (all values)"] = float(np.abs(pred[TECH].values - act[TECH].values).sum() / act[TECH].values.sum() * 100)
    return out


def naive(tr, te):
    return tr.sort_values("Year").groupby("State")[TECH].last().reindex(te.State).set_index(te.index).fillna(0)


def fit_predict(make):
    return lambda tr, te: make().fit(tr).predict_frame(te)


def backtest(df, compare=False, cutoffs=CUTOFFS, only=None):
    fr_all = fresh_mask(df)
    models = {
        "v2 convergence (production)": fit_predict(ConvergenceModel),
        "v2 without transmission term": fit_predict(lambda: ConvergenceModel(tx_col=None)),
        "v2 + transmission, joint fit": fit_predict(lambda: ConvergenceModel(tx_fit="joint")),
        "v2 pure (v2 dynamics for every tech)": fit_predict(lambda: ConvergenceModel(v1_techs=[], tx_col=None)),
        "v2, trend half-life 2y": fit_predict(lambda: ConvergenceModel(half_life=2)),
        "v2, trend half-life 5y": fit_predict(lambda: ConvergenceModel(half_life=5)),
        "v2, no catch-up term": fit_predict(lambda: _no_catchup(ConvergenceModel())),
        "v1 GSDP elasticity": fit_predict(ElasticityModel),
        "Naive last value": naive,
    }
    if compare:
        sys.path.insert(0, str(HERE / "experiments"))
        import backtest as old  # noqa
        models["Original tree ensemble"] = old.m_original
    if only:
        models = {k: v for k, v in models.items() if k in only}
    res = {}
    for cut in cutoffs:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        for name, fn in models.items():
            res[(cut, name)] = score(fn(tr, te), te, fr_all.loc[te.index])
    R = pd.DataFrame(res).T
    R.index.names = ["train_until", "model"]
    return R


def _no_catchup(m):
    """Ablation: same model with kappa forced to 0 after fitting."""
    orig = m.fit

    def fit(df):
        orig(df)
        for p in m.params.values():
            p["kappa"] = 0.0
        m._nowcast(); m._baseline_zone_paths()
        return m
    m.fit = fit
    return m


def national_path(model, years):
    """Each state's GSDP grows at its own recent CAGR; sum forecasts nationally (GW)."""
    out = {}
    for y in years:
        tot = dict.fromkeys(TECH, 0.0)
        for st in model.states:
            if isinstance(model, ConvergenceModel):
                p = model.predict_state(st, y)
            else:
                s = model.states[st]
                p = model.predict_state(st, y, s["gsdp"] * 1.06 ** (y - s["year"]))
            for t in TECH:
                tot[t] += p[t]
        out[y] = {t: round(v / 1000, 1) for t, v in tot.items()}
        out[y]["Total"] = round(sum(tot.values()) / 1000, 1)
    return pd.DataFrame(out).T


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", action="store_true", help="also backtest the original tree ensemble")
    args = ap.parse_args()
    pd.set_option("display.width", 220)

    df = load_data()
    fr = fresh_mask(df)
    print(f"Data: {len(df)} rows, {df.State.nunique()} states, {df.Year.min()}-{df.Year.max()}; "
          f"{fr.values.mean():.0%} of values are fresh reports\n")

    R = backtest(df, args.compare)
    print("Backtest (train <= cutoff, predict later years with actual GSDP; WAPE %, lower is better)")
    print(R.round(1).to_string())
    mean = R.groupby(level="model").mean().sort_values("Total WAPE (fresh)")
    print("\nMean over cutoffs")
    print(mean.round(1).to_string())

    keep = ["v2 convergence (production)", "v2 + transmission, joint fit", "v2 without transmission term",
            "v1 GSDP elasticity", "Naive last value"]
    R2 = backtest(df, cutoffs=RECENT_CUTOFFS, only=keep)
    mean2 = R2.groupby(level="model").mean().sort_values("Total WAPE (fresh)")
    print(f"\nRecent cutoffs {RECENT_CUTOFFS} (transmission reports available in training)")
    print(R2["Total WAPE (fresh)"].unstack("model").round(1).to_string())
    print(mean2.round(1).to_string())

    v1 = ElasticityModel().fit(df); v1.to_json(HERE / "re2047_model_v1.json")
    v2 = ConvergenceModel().fit(df); v2.to_json(HERE / "re2047_model.json")

    print(f"\nv2 fitted on all data (base year {v2.base_year}, trend half-life {v2.half_life} y)")
    for t in TECH:
        p = v2.params[t]
        if p.get("dynamics") == "v1":
            print(f"  {t:18s} v1 dynamics: GSDP elasticity {p['v1_elasticity']:.2f}, decaying {p['v1_decay']:.2f}/yr")
            continue
        print(f"  {t:18s} trend now {p['a_ref']:+.3f}/yr   GSDP beta {p['beta']:.2f}   catch-up kappa {p['kappa']:.3f}"
              f"   transmission gamma {p.get('gamma', 0):.3f}   ({p['n_pairs']} fresh pairs)")

    stale = {st: round(v2.base_capacity(st)["Solar Power"] / 1000, 1) for st in v2.states
             if v2.states[st]["anchor"]["Solar Power"][0] < v2.base_year
             and v2.history[st][v2.base_year]["Solar Power"] > 300}
    print("\nNowcast 2024 solar (GW) for states whose last fresh solar report is before 2024:")
    for st, v in stale.items():
        print(f"  {st:18s} reported {v2.history[st][2024]['Solar Power']/1000:5.1f}  ->  nowcast {v:5.1f}"
              f"   (last report {v2.states[st]['anchor']['Solar Power'][0]})")

    YEARS = [2024, 2030, 2035, 2040, 2047]
    n2, n1 = national_path(v2, YEARS), national_path(v1, YEARS)
    print("\nNational forecast, GW — v2 (each state's GSDP at its recent CAGR)")
    print(n2.to_string())
    print("\nv1 for reference")
    print(n1.to_string())

    (HERE / "metrics.json").write_text(json.dumps({
        "scoring": "WAPE % on fresh (changed) test values; cutoffs " + str(CUTOFFS),
        "backtest": {f"{c}|{m}": v for (c, m), v in R.round(2).to_dict("index").items()},
        "mean": mean.round(2).to_dict("index"),
        "recent_cutoffs": RECENT_CUTOFFS,
        "recent_backtest": {f"{c}|{m}": v for (c, m), v in R2.round(2).to_dict("index").items()},
        "recent_mean": mean2.round(2).to_dict("index"),
        "v2_params": {t: {k: v for k, v in p.items() if k != "alpha"} for t, p in v2.params.items()},
        "national_forecast_gw_v2": n2.to_dict("index"),
        "national_forecast_gw_v1": n1.to_dict("index"),
    }, indent=1))
    print("\nSaved model/re2047_model.json (v2), model/re2047_model_v1.json, model/metrics.json")


if __name__ == "__main__":
    main()
