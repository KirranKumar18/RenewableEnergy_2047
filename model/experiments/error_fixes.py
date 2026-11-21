"""
Five checks aimed at the capacity model's error, run in order; each saves its results to reports/error_fixes/.

    .venv/bin/python model/experiments/error_fixes.py 1     # one step at a time (1..4)
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
import re_model  # noqa: E402
import convergence_model  # noqa: E402
from re_model import TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, score  # noqa: E402

warnings.filterwarnings("ignore")
OUT = ROOT / "reports" / "error_fixes"
OUT.mkdir(parents=True, exist_ok=True)
V2 = ["Solar Power", "Wind Power"]


def step1(kw=None, tag=""):
    """Mask test: states with new reports in both 2023 and 2024 have those two years hidden (made to repeat 2022,
    exactly what a stale state looks like), the model is refitted, and its 2023-24 nowcast is scored against the
    hidden values. One state at a time, so the other states still inform the national 2023-24 trend."""
    kw = kw or {}
    df = load_data(); fr = fresh_mask(df)
    idx = df.set_index(["State", "Year"]).index
    rows = []
    for st in sorted(df.State.unique()):
        cand = [t for t in V2 if all(((st, y) in idx) for y in (2022, 2023, 2024))
                and fr.loc[(df.State == st) & (df.Year == 2023), t].iloc[0] and fr.loc[(df.State == st) & (df.Year == 2024), t].iloc[0]
                and df.loc[(df.State == st) & (df.Year == 2022), t].iloc[0] >= 10]
        if not cand:
            continue
        d2 = df.copy()
        v22 = d2.loc[(d2.State == st) & (d2.Year == 2022), TECH].iloc[0]
        for y in (2023, 2024):
            d2.loc[(d2.State == st) & (d2.Year == y), TECH] = v22.values
        m = ConvergenceModel(**kw).fit(d2)
        for t in cand:
            for y in (2023, 2024):
                act = float(df.loc[(df.State == st) & (df.Year == y), t].iloc[0])
                now = float(m.states[st]["nowcast"].get(y, {}).get(t, v22[t]))
                rows.append({"state": st, "source": t.split()[0], "year": y, "last_fresh_year_after_mask": m.states[st]["anchor"][t][0],
                             "value_2022": round(float(v22[t]), 1), "actual": round(act, 1), "nowcast": round(now, 1),
                             "nowcast_error_pct": round((now - act) / act * 100, 1),
                             "carry_forward_error_pct": round((float(v22[t]) - act) / act * 100, 1)})
    R = pd.DataFrame(rows)
    R.to_csv(OUT / f"step1_nowcast_mask_test{tag}.csv", index=False)
    summ = []
    for (src, y), g in list(R.groupby(["source", "year"])) + [(("all", "2023-24"), R)]:
        a = g.actual.sum()
        summ.append({"source": src, "year": y, "states": g.state.nunique(),
                     "nowcast_wape_pct": round((g.nowcast - g.actual).abs().sum() / a * 100, 1),
                     "nowcast_signed_pct": round((g.nowcast - g.actual).sum() / a * 100, 1),
                     "carry_forward_wape_pct": round((g.value_2022 - g.actual).abs().sum() / a * 100, 1),
                     "carry_forward_signed_pct": round((g.value_2022 - g.actual).sum() / a * 100, 1)})
    S = pd.DataFrame(summ)
    S.to_csv(OUT / f"step1_summary{tag}.csv", index=False)
    return R, S


def backtest_rows(make, cutoffs, fr_score=None):
    """Long table of (cutoff, state, source, year, horizon, actual, pred, fresh) for one model factory."""
    df = load_data(); fr = fresh_mask(df) if fr_score is None else fr_score
    rows = []
    for cut in cutoffs:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        m = make(); m.fit(tr); P = m.predict_frame(te)
        for i, r in te.iterrows():
            for t in TECH:
                rows.append((cut, r.State, r.Zone, t, int(r.Year), int(r.Year - cut), float(r[t]), float(P.at[i, t]), bool(fr.at[i, t])))
    return pd.DataFrame(rows, columns=["cutoff", "state", "zone", "source", "year", "horizon", "actual", "pred", "fresh"])


def wape(g):
    return (g.pred - g.actual).abs().sum() / g.actual.sum() * 100


def signed(g):
    return (g.pred - g.actual).sum() / g.actual.sum() * 100


def headline(B, cutoffs):
    return np.mean([wape(B[(B.cutoff == c) & B.fresh]) for c in cutoffs])


def step2(hls=(2, 3, 4, 5, 6, 8, 12)):
    """Trend half-life chosen on the far-horizon (5-8 years) signed error rather than overall WAPE."""
    out = []
    for hl in hls:
        B = backtest_rows(lambda: ConvergenceModel(half_life=hl), CUTOFFS)
        F = B[B.fresh]
        far, near = F[F.horizon >= 5], F[F.horizon <= 4]
        out.append({"half_life": hl, "signed_err_h5_8_pct": round(signed(far), 1), "wape_h5_8_pct": round(wape(far), 1),
                    "signed_err_h1_4_pct": round(signed(near), 1), "wape_h1_4_pct": round(wape(near), 1),
                    "solar_signed_h5_8_pct": round(signed(far[far.source == "Solar Power"]), 1),
                    "headline_wape_standard": round(headline(B, CUTOFFS), 2),
                    **{f"signed_h{h}": round(signed(F[F.horizon == h]), 1) for h in range(1, 9)}})
        print(out[-1], flush=True)
    R = pd.DataFrame(out)
    R.to_csv(OUT / "step2_half_life_horizon.csv", index=False)
    return R


def step3(make=lambda: ConvergenceModel(), tag=""):
    """Is the far-horizon miss common to all states (national trend) or state-specific (catch-up)?
    For each cutoff x horizon, scale every prediction by one national factor (sum actual / sum predicted over the
    scored rows). Error removed by that one number is national; what remains is per state."""
    B = backtest_rows(make, CUTOFFS)
    F = B[B.fresh & (B.source == "Solar Power")].copy()
    rows = []
    for (c, h), g in F.groupby(["cutoff", "horizon"]):
        k = g.actual.sum() / g.pred.sum()
        g2 = g.assign(pred=g.pred * k)
        rows.append({"cutoff": c, "horizon": h, "states": len(g), "signed_err_pct": round(signed(g), 1), "wape_pct": round(wape(g), 1),
                     "national_factor_needed": round(k, 3), "wape_after_national_scaling_pct": round(wape(g2), 1)})
    R = pd.DataFrame(rows)
    far = F[F.horizon >= 5].copy()
    # per-state pattern at far horizons: log error vs the state's catch-up gap and size at the cutoff
    df = load_data()
    gap, size = {}, {}
    for c in CUTOFFS:
        m = ConvergenceModel().fit(df[df.Year <= c])
        zi = {z: m._zint("Solar Power", z, c) for z in {v["zone"] for v in m.states.values()}}
        for s, v in m.states.items():
            cap = m.history[s][max(y for y in m.history[s] if y <= c)]["Solar Power"]
            i_s = cap / v["gsdp"][c] * 1e5 if c in v["gsdp"] else np.nan
            gap[(c, s)] = np.log((zi[v["zone"]] + 1) / (i_s + 1)); size[(c, s)] = cap
    far["gap_at_cutoff"] = [gap.get((c, s)) for c, s in zip(far.cutoff, far.state)]
    far["mw_at_cutoff"] = [size.get((c, s)) for c, s in zip(far.cutoff, far.state)]
    far = far[far.actual >= 50]
    far["log_error"] = np.log((far.pred + 1) / (far.actual + 1))
    per_state = far.groupby("state").agg(rows=("log_error", "size"), mean_log_error=("log_error", "mean"),
                                         gap_at_cutoff=("gap_at_cutoff", "mean"), mw_at_cutoff=("mw_at_cutoff", "mean")).round(3)
    corr_gap = float(np.corrcoef(far.gap_at_cutoff, far.log_error)[0, 1])
    corr_size = float(np.corrcoef(np.log1p(far.mw_at_cutoff), far.log_error)[0, 1])
    R.to_csv(OUT / f"step3_bias_by_cutoff_horizon{tag}.csv", index=False)
    per_state.sort_values("mean_log_error").to_csv(OUT / f"step3_far_horizon_by_state{tag}.csv")
    fr_ = R[R.horizon >= 5]
    w = fr_.states
    summ = {"far_signed_err_pct": round(signed(F[F.horizon >= 5]), 1), "far_wape_pct": round(wape(F[F.horizon >= 5]), 1),
            "far_wape_after_national_scaling_pct": round(np.average(fr_.wape_after_national_scaling_pct, weights=w), 1),
            "share_of_far_error_removed_by_one_national_factor_pct":
                round((1 - np.average(fr_.wape_after_national_scaling_pct, weights=w) / np.average(fr_.wape_pct, weights=w)) * 100, 1),
            "states_under_forecast_far": int((per_state.mean_log_error < 0).sum()), "states_over_forecast_far": int((per_state.mean_log_error > 0).sum()),
            "corr_log_error_vs_catchup_gap": round(corr_gap, 2), "corr_log_error_vs_log_size": round(corr_size, 2)}
    pd.Series(summ).to_csv(OUT / f"step3_summary{tag}.csv", header=["value"])
    return R, per_state, summ


def step4():
    """Copies stored at float32 precision counted as new reports. Re-run the backtest with the corrected flags,
    scoring every variant on the same (corrected) flags so the comparison is fair."""
    df = load_data()
    fr_fix = re_model.fresh_mask(df, tolerance=True)
    old = convergence_model.fresh_mask
    out = []
    for name, tol, kw in [("production (copies counted as new)", False, {}), ("copies treated as repeats", True, {}),
                          ("copies treated as repeats + nowcast solar only", True, {"nowcast_techs": ["Solar Power"]})]:
        convergence_model.fresh_mask = (lambda d, _t=tol: old(d, tolerance=_t))
        for label, cuts in [("standard", CUTOFFS), ("recent", RECENT_CUTOFFS)]:
            B = backtest_rows(lambda: ConvergenceModel(**kw), cuts, fr_score=fr_fix)
            F = B[B.fresh]
            out.append({"variant": name, "cutoffs": label, "headline_wape": round(headline(B, cuts), 2),
                        "signed_pct": round(signed(F), 1), "far_signed_h5_8_pct": round(signed(F[F.horizon >= 5]), 1) if (F.horizon >= 5).any() else None,
                        **{f"cutoff_{c}": round(wape(F[F.cutoff == c]), 1) for c in cuts}})
            print(out[-1], flush=True)
    convergence_model.fresh_mask = old
    R = pd.DataFrame(out)
    R.to_csv(OUT / "step4_copy_flags.csv", index=False)
    return R


if __name__ == "__main__":
    pd.set_option("display.width", 220)
    s = sys.argv[1]
    if s == "1":
        R, S = step1(); print(S.to_string(index=False)); print(R.sort_values(["source", "year", "state"]).to_string(index=False))
    elif s == "2":
        print(step2()[["half_life", "signed_err_h5_8_pct", "wape_h5_8_pct", "signed_err_h1_4_pct", "wape_h1_4_pct", "headline_wape_standard"]].to_string(index=False))
    elif s == "3":
        R, P, S = step3(); print(R.to_string(index=False)); print(P.to_string()); print(S)
    elif s == "4":
        print(step4().to_string(index=False))


def step3b():
    """Catch-up fixes suggested by step 3: limit how far 'behind' a state can count (max_gap) and stop catch-up
    from slowing leaders (gap_floor=0), with the current and the step-2 half-life. Scored on both cutoff sets."""
    out = []
    for hl in (3, 4):
        for mg in (4.0, 2.0, 1.0):
            for fl in (None, 0.0):
                kw = {"half_life": hl, "max_gap": mg, "gap_floor": fl}
                Bs = backtest_rows(lambda: ConvergenceModel(**kw), CUTOFFS)
                Br = backtest_rows(lambda: ConvergenceModel(**kw), RECENT_CUTOFFS)
                F = Bs[Bs.fresh]
                out.append({"half_life": hl, "max_gap": mg, "gap_floor": "none" if fl is None else fl,
                            "headline_standard": round(headline(Bs, CUTOFFS), 2), "headline_recent": round(headline(Br, RECENT_CUTOFFS), 2),
                            "headline_both": round((headline(Bs, CUTOFFS) + headline(Br, RECENT_CUTOFFS)) / 2, 2),
                            "far_signed_h5_8": round(signed(F[F.horizon >= 5]), 1), "far_wape_h5_8": round(wape(F[F.horizon >= 5]), 1),
                            "near_wape_h1_4": round(wape(F[F.horizon <= 4]), 1)})
                print(out[-1], flush=True)
    R = pd.DataFrame(out)
    R.to_csv(OUT / "step3b_catchup_fixes.csv", index=False)
    return R


if __name__ == "__main__" and sys.argv[1] == "3b":
    print(step3b().to_string(index=False))


def combined():
    """Steps 2 + 4 together (and the solar-only nowcast), scored on the corrected flags; plus the step-1 mask test."""
    df = load_data()
    fr_fix = re_model.fresh_mask(df, tolerance=True)
    old = convergence_model.fresh_mask
    convergence_model.fresh_mask = lambda d: old(d, tolerance=True)
    out = []
    for name, kw in [("copy fix, half-life 3", {}), ("copy fix, half-life 4", {"half_life": 4}),
                     ("copy fix, half-life 4, nowcast solar only", {"half_life": 4, "nowcast_techs": ["Solar Power"]}),
                     ("copy fix, half-life 3, nowcast solar only", {"nowcast_techs": ["Solar Power"]})]:
        Bs = backtest_rows(lambda: ConvergenceModel(**kw), CUTOFFS, fr_score=fr_fix)
        Br = backtest_rows(lambda: ConvergenceModel(**kw), RECENT_CUTOFFS, fr_score=fr_fix)
        F = Bs[Bs.fresh]
        _, S1 = step1(kw, tag="_" + name.replace(", ", "_").replace(" ", "-"))
        s1 = S1[(S1.source == "Solar") & (S1.year == 2024)].iloc[0]
        out.append({"variant": name, "headline_standard": round(headline(Bs, CUTOFFS), 2), "headline_recent": round(headline(Br, RECENT_CUTOFFS), 2),
                    "headline_both": round((headline(Bs, CUTOFFS) + headline(Br, RECENT_CUTOFFS)) / 2, 2),
                    "far_signed_h5_8": round(signed(F[F.horizon >= 5]), 1), "far_wape_h5_8": round(wape(F[F.horizon >= 5]), 1),
                    "nowcast_solar_2024_wape": s1.nowcast_wape_pct, "nowcast_solar_2024_signed": s1.nowcast_signed_pct})
        print(out[-1], flush=True)
    convergence_model.fresh_mask = old
    R = pd.DataFrame(out)
    R.to_csv(OUT / "step_combined.csv", index=False)
    return R


if __name__ == "__main__" and sys.argv[1] == "combined":
    print(combined().to_string(index=False))
