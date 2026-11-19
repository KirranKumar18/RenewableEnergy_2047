"""
Does renewable-related transmission build-out (CEA reports via NPP) explain solar/wind growth that the
v2 model misses? In-sample check on fresh-report pairs starting 2019 or later (the reports start FY2018-19).

    .venv/bin/python model/experiments/transmission_signal.py
"""
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from re_model import fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402

warnings.filterwarnings("ignore")
TX = pd.read_csv(HERE.parents[1] / "data" / "external" / "npp_transmission_state_year.csv")

df = load_data().sort_values(["State", "Year"]).reset_index(drop=True)
fr = fresh_mask(df)
m = ConvergenceModel().fit(df)

for t, feat in [("Solar Power", "re_sub_mva"), ("Solar Power", "re_line_ckm"), ("Solar Power", "sub_mva"),
                ("Wind Power", "re_sub_mva")]:
    p = m.params[t]
    rows = []
    for st, g in df.groupby("State"):
        recs = g[fr.loc[g.index, t]].sort_values("Year").to_dict("records")
        for a, b in zip(recs[:-1], recs[1:]):
            if a[t] < m.min_mw or a["Year"] < 2019:
                continue
            k = b["Year"] - a["Year"]
            r = (np.log1p(b[t]) - np.log1p(a[t])) / k
            i_s = a[t] / a["GSDP"] * 1e5
            i_z = m.zone_intensity[t][a["Zone"]][a["Year"]]
            gap = float(np.clip(np.log((i_z + 1) / (i_s + 1)), -m.max_gap, m.max_gap))
            dg = (np.log(b["GSDP"]) - np.log(a["GSDP"])) / k
            trend = np.mean([p["alpha"].get(y, p["a_ref"]) for y in range(a["Year"] + 1, b["Year"] + 1)])
            pred = trend + p["beta"] * dg + p["kappa"] * gap
            # transmission completed in the FY ending in the start year and the following ones of the interval
            x = TX[(TX.State == st) & (TX.Year >= a["Year"]) & (TX.Year <= b["Year"])][feat].sum() / k
            rows.append(dict(state=st, y0=a["Year"], y1=b["Year"], k=k, resid=r - pred, x=np.log1p(x / max(a[t], 1) * 1000)))
    R = pd.DataFrame(rows)
    w = np.sqrt(R.k.values.astype(float))
    X = np.c_[np.ones(len(R)), R.x]
    coef, *_ = np.linalg.lstsq(X * w[:, None], R.resid.values * w, rcond=None)
    e = (R.resid.values - X @ coef) * w
    cov = np.linalg.inv((X * w[:, None]).T @ (X * w[:, None])) * (e @ e) / max(len(R) - 2, 1)
    tstat = coef[1] / np.sqrt(cov[1, 1])
    nz = (R.x > 0).sum()
    print(f"{t:12s} vs {feat:12s}: {len(R):3d} pairs ({nz} with build-out), corr {np.corrcoef(R.x, R.resid)[0,1]:+.2f}, "
          f"slope {coef[1]:+.3f}, t = {tstat:+.2f}")
