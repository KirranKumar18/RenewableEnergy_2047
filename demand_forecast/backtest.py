"""
Walk-forward backtest of the daily demand forecasters.

From every forecast origin T in the test window, each method forecasts the next 1-28 days using only
data up to T (the learned models are refitted every REFIT_EVERY days on all data up to T).
Scored with MAPE on days where demand was actually observed (gap-filled days are excluded).

    .venv/bin/python demand_forecast/backtest.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data import load  # noqa: E402
from model import H_MAX, DemandForecaster, baselines, weekday_factor  # noqa: E402

TEST_START = "2026-03-01"   # needs ~5 months of history before the first origin
SEASONAL_START = "2026-10-01"  # first origin whose matching weeks last year are in the data
REFIT_EVERY = 7
PROD = "Production"
HORIZON_BUCKETS = {"1 day": (1, 1), "2-7 days": (2, 7), "8-14 days": (8, 14), "15-28 days": (15, 28)}


def run(df: pd.DataFrame) -> pd.DataFrame:
    y, obs = df.demand, df.observed
    origins = [T for T in y.index if T >= pd.Timestamp(TEST_START) and T + pd.Timedelta(days=1) <= y.index[-1]]
    models = {PROD: dict(kind="production"),
              "Production without seasonal adjustment": dict(kind="production", seasonal_weight=0.0),
              "Ridge every horizon": dict(kind="ridge"), "Gradient boosting": dict(kind="gbm")}
    fitted, out = {}, []
    for n, T in enumerate(origins):
        hist = y.loc[:T]
        if n % REFIT_EVERY == 0:
            fitted = {name: DemandForecaster(**kw).fit(hist) for name, kw in models.items()}
            wdf = weekday_factor(hist)
        h = min(H_MAX, (y.index[-1] - T).days)
        fc = {name: m.forecast(hist, h) for name, m in fitted.items()}
        fc.update(baselines(y, T, h, wdf))
        for name, s in fc.items():
            for d, p in s.items():
                if obs.get(d, False):
                    out.append({"method": name, "origin": T, "date": d, "h": (d - T).days, "pred": p, "actual": y[d]})
    R = pd.DataFrame(out)
    R["ape"] = (R.pred - R.actual).abs() / R.actual * 100
    return R


def summary(R: pd.DataFrame, start=None) -> pd.DataFrame:
    if start:
        R = R[R.origin >= pd.Timestamp(start)]
    cols = {}
    for lab, (a, b) in HORIZON_BUCKETS.items():
        cols[lab] = R[(R.h >= a) & (R.h <= b)].groupby("method").ape.mean()
    cols["All 1-28 days"] = R.groupby("method").ape.mean()
    return pd.DataFrame(cols).sort_values("All 1-28 days")


if __name__ == "__main__":
    df = load()
    R = run(df)
    pd.set_option("display.width", 200)
    print(f"Origins {R.origin.min().date()} .. {R.origin.max().date()}, {R.origin.nunique()} origins, "
          f"{R[R.method == R.method.iloc[0]].shape[0]} scored forecasts per method")
    print("MAPE % by horizon (lower is better)")
    print(summary(R).round(2).to_string())
    print(f"\nOrigins from {SEASONAL_START} only (last year's matching weeks available)")
    print(summary(R, SEASONAL_START).round(2).to_string())
