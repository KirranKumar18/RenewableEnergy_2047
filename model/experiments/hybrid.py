"""
Per-technology model choice and v1/v2 blends, scored with the same fresh-only backtest as train.py.
Selection is checked with leave-one-cutoff-out: choose on two cutoffs, score on the third.

    .venv/bin/python model/experiments/hybrid.py
"""
import itertools
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import TECH, ElasticityModel, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from train import CUTOFFS, naive  # noqa: E402

warnings.filterwarnings("ignore")

BASE = {
    "v2": lambda: ConvergenceModel(),
    "v2_hl2": lambda: ConvergenceModel(half_life=2),
    "v2_hl4": lambda: ConvergenceModel(half_life=4),
    "v1": lambda: ElasticityModel(),
}
WEIGHTS = [0.0, 0.25, 0.5, 0.75, 1.0]  # weight on v2-family member vs v1


def predictions(df):
    P = {}
    for cut in CUTOFFS:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        P[cut] = {"_act": te, "naive": naive(tr, te)}
        for k, mk in BASE.items():
            P[cut][k] = mk().fit(tr).predict_frame(te)
    return P


def candidates():
    """name -> function(P[cut], tech) -> predicted series"""
    C = {"naive": lambda p, t: p["naive"][t]}
    for k in ("v2", "v2_hl2", "v2_hl4"):
        for w in WEIGHTS:
            C[f"{w:.2f}*{k}+{1-w:.2f}*v1"] = (lambda k, w: lambda p, t: w * p[k][t] + (1 - w) * p["v1"][t])(k, w)
    return C


def err(p, t, f, fn):
    """(abs error, actual) on fresh values for one tech at one cutoff."""
    a = p["_act"][t]
    m = f[t]
    return float(np.abs(fn(p, t)[m] - a[m]).sum()), float(a[m].sum())


def total(P, F, choice, cuts):
    e = a = 0.0
    for c in cuts:
        for t in TECH:
            ee, aa = err(P[c], t, F[c], C[choice[t]])
            e += ee; a += aa
    return e / a * 100


def best_choice(P, F, cuts):
    """Per tech, the candidate with the lowest summed error over `cuts` (techs are independent)."""
    out = {}
    for t in TECH:
        sc = {n: sum(err(P[c], t, F[c], fn)[0] for c in cuts) for n, fn in C.items()}
        out[t] = min(sc, key=sc.get)
    return out


df = load_data()
fr = fresh_mask(df)
P = predictions(df)
F = {c: fr.loc[P[c]["_act"].index] for c in CUTOFFS}
C = candidates()

mean_of = lambda choice: np.mean([total(P, F, choice, [c]) for c in CUTOFFS])  # noqa: E731

print("Reference (mean of per-cutoff total WAPE on fresh values):")
for name, ch in {"v2 production": dict.fromkeys(TECH, "1.00*v2+0.00*v1"),
                 "v1": dict.fromkeys(TECH, "0.00*v2+1.00*v1")}.items():
    print(f"  {name:40s} {mean_of(ch):5.1f}")

fixed = {
    "hybrid: v2 solar/wind, v1 bio/hydro": {**dict.fromkeys(TECH, "1.00*v2+0.00*v1"),
                                            "Bio-Mass Power": "0.00*v2+1.00*v1", "Small Hydro Power": "0.00*v2+1.00*v1"},
    "blend 50/50 everywhere": dict.fromkeys(TECH, "0.50*v2+0.50*v1"),
    "hybrid + 50/50 blend on solar/wind": {**dict.fromkeys(TECH, "0.50*v2+0.50*v1"),
                                           "Bio-Mass Power": "0.00*v2+1.00*v1", "Small Hydro Power": "0.00*v2+1.00*v1"},
}
print("\nPre-specified options (no tuning):")
for n, ch in fixed.items():
    print(f"  {n:40s} {mean_of(ch):5.1f}   per cutoff " + " ".join(f"{total(P, F, ch, [c]):5.1f}" for c in CUTOFFS))

print("\nPer-tech best choice tuned on ALL cutoffs (optimistic, in-sample):")
ch_all = best_choice(P, F, CUTOFFS)
for t in TECH:
    print(f"  {t:18s} {ch_all[t]}")
print(f"  -> {mean_of(ch_all):5.1f}")

print("\nLeave-one-cutoff-out (choose on the other two cutoffs, score the held-out one):")
held = []
for c in CUTOFFS:
    ch = best_choice(P, F, [x for x in CUTOFFS if x != c])
    s = total(P, F, ch, [c]); held.append(s)
    print(f"  held out {c}: {s:5.1f}   choice: " + ", ".join(f"{t.split()[0]}={ch[t]}" for t in TECH))
print(f"  -> mean held-out {np.mean(held):5.1f}   (v2 on the same cutoffs: "
      f"{np.mean([total(P, F, dict.fromkeys(TECH, '1.00*v2+0.00*v1'), [c]) for c in CUTOFFS]):5.1f})")

print("\nPer-tech WAPE (mean of cutoffs) for the main options:")
rows = {}
for n, ch in {"v2": dict.fromkeys(TECH, "1.00*v2+0.00*v1"), "v1": dict.fromkeys(TECH, "0.00*v2+1.00*v1"), **fixed,
              "tuned (in-sample)": ch_all}.items():
    rows[n] = {t.split()[0]: np.mean([err(P[c], t, F[c], C[ch[t]])[0] / err(P[c], t, F[c], C[ch[t]])[1] * 100
                                      for c in CUTOFFS]) for t in TECH}
print(pd.DataFrame(rows).T.round(1).to_string())
