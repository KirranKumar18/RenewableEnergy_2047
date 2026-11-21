"""
Ideas to reduce the capacity model's error using only the data the project already has.
Each variant is fitted and scored exactly like train.py (fresh-only WAPE). To avoid picking a winner by luck,
variants are compared on two cutoff sets: the standard one (2016, 2018, 2020) and the recent one (2020-2022),
and a change is only worth adopting if it helps on both.

    .venv/bin/python model/experiments/reduce_error.py
"""
import sys
import warnings
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, score  # noqa: E402

warnings.filterwarnings("ignore")
VARIANTS = {
    "production": {},
    "catch-up never slows leaders": {"gap_floor": 0.0},
    "catch-up floor -0.5": {"gap_floor": -0.5},
    "weight big states (power 0.25)": {"fit_weight_power": 0.25},
    "weight big states (power 0.5)": {"fit_weight_power": 0.5},
    "floor 0 + power 0.25": {"gap_floor": 0.0, "fit_weight_power": 0.25},
    "floor 0 + power 0.5": {"gap_floor": 0.0, "fit_weight_power": 0.5},
    "trend half-life 4": {"half_life": 4.0},
    "floor 0 + half-life 4": {"gap_floor": 0.0, "half_life": 4.0},
}


def run(df, fr, cutoffs):
    out = {}
    for cut in cutoffs:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        f = fr.loc[te.index]
        for name, kw in VARIANTS.items():
            out[(cut, name)] = score(ConvergenceModel(**kw).fit(tr).predict_frame(te), te, f)
    return pd.DataFrame(out).T


if __name__ == "__main__":
    pd.set_option("display.width", 220)
    df = load_data(); fr = fresh_mask(df)
    cols = ["Solar Power", "Wind Power", "Total WAPE (fresh)"]
    res = {}
    for label, cuts in [("standard", CUTOFFS), ("recent", RECENT_CUTOFFS)]:
        R = run(df, fr, cuts)
        res[label] = R["Total WAPE (fresh)"].unstack(0)
        print(f"\n== {label} cutoffs {cuts}: total WAPE % by cutoff")
        print(res[label].round(1).to_string())
    S = pd.DataFrame({k: v.mean(1) for k, v in res.items()})
    S["both"] = S.mean(1)
    print("\n== mean WAPE % (lower is better)")
    print(S.sort_values("both").round(2).to_string())
