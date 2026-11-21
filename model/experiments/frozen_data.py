"""
Are repeated ("frozen") values a reporting delay or a real pause in building? And does the answer change the
model's accuracy?

1. Copies stored at float32 precision (12564.87 -> 12564.867188) were counted as new reports; fresh_mask now
   treats changes <= 0.01 MW / 1 ppm as repeats.
2. After a run of repeats, the next new report jumps ~3.4x a normal year's growth for solar (a reporting delay:
   the missed years arrive at once) but only 0.4-0.8x for wind, bio-mass and small hydro (real pauses).
   Variant: fill stale years only for solar; wind repeats are taken at face value.

    .venv/bin/python model/experiments/frozen_data.py
"""
import sys
import warnings
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, score  # noqa: E402

warnings.filterwarnings("ignore")
import re_model, convergence_model  # noqa: E402,E401


def run(tol, kw, cutoffs, score_tol=True):
    df = load_data()
    old = re_model.fresh_mask
    fm = lambda d: old(d, tolerance=tol)  # noqa: E731
    convergence_model.fresh_mask = fm      # what the model uses for fitting and anchors
    fr = old(df, tolerance=score_tol)      # what the score uses
    out = {}
    for cut in cutoffs:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        out[cut] = score(ConvergenceModel(**kw).fit(tr).predict_frame(te), te, fr.loc[te.index])
    convergence_model.fresh_mask = old
    return pd.DataFrame(out).T


if __name__ == "__main__":
    variants = {
        "production (old repeat check)": (False, {}),
        "fixed repeat check": (True, {}),
        "fixed + fill stale years for solar only": (True, {"nowcast_techs": ["Solar Power"]}),
    }
    rows = {}
    for name, (tol, kw) in variants.items():
        for label, cuts in [("standard", CUTOFFS), ("recent", RECENT_CUTOFFS)]:
            R = run(tol, kw, cuts)
            rows[(name, label)] = R.mean()
            rows[(name, label + " by cutoff")] = R["Total WAPE (fresh)"]
    print("All scored on the corrected repeat check (float copies are not counted as new reports).\n")
    for name in variants:
        st, rc = rows[(name, "standard")], rows[(name, "recent")]
        print(f"{name:42s} standard {st['Total WAPE (fresh)']:5.1f}  recent {rc['Total WAPE (fresh)']:5.1f}  "
              f"both {(st['Total WAPE (fresh)'] + rc['Total WAPE (fresh)']) / 2:5.2f} | solar {st['Solar Power']:4.1f}/{rc['Solar Power']:4.1f} "
              f"wind {st['Wind Power']:4.1f}/{rc['Wind Power']:4.1f} | by cutoff "
              + " ".join(f"{v:.1f}" for v in list(rows[(name, 'standard by cutoff')]) + list(rows[(name, 'recent by cutoff')])))
