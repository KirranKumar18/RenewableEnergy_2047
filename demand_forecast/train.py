"""
Train the daily demand model on all data, backtest it, and forecast the next 28 days.

    .venv/bin/python demand_forecast/train.py

Outputs
    demand_forecast/demand_model.joblib     fitted DemandForecaster (production rule)
    demand_forecast/demand_forecast.json    everything the dashboard shows (served by backend_api.py at /api/demand)
    reports/demand/metrics.json             backtest MAPE by horizon for every method, interval widths
    reports/demand/forecast.csv             next 28 days: forecast and 80% interval (GWh/day)
    reports/demand/*.png                    charts
This is separate from the state capacity model in model/ and does not touch it.
"""
from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from data import HOLIDAYS, load  # noqa: E402
from model import H_MAX, DemandForecaster, weekday_factor  # noqa: E402
import backtest as bt  # noqa: E402

warnings.filterwarnings("ignore")
OUT = HERE.parent / "reports" / "demand"
PROD = bt.PROD
SRC = {"thermal": "#6B7280", "gas": "#A78BFA", "nuclear": "#F472B6", "hydro": "#3B82F6", "wind": "#06B6D4",
       "solar": "#F59E0B"}
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "font.size": 10})


def save(name):
    plt.tight_layout(); plt.savefig(OUT / name, dpi=150, bbox_inches="tight"); plt.close("all")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load()
    y = df.demand

    R = bt.run(df)
    S = bt.summary(R)
    S2 = bt.summary(R, bt.SEASONAL_START)
    print("Backtest MAPE % (walk-forward, origins from", bt.TEST_START + ")")
    print(S.round(2).to_string())
    print(f"\nOrigins from {bt.SEASONAL_START} (seasonal adjustment active)")
    print(S2.round(2).to_string())

    # 80% interval from the production model's backtest errors, per horizon (log ratio quantiles)
    P = R[R.method == PROD].copy()
    P["lr"] = np.log(P.actual / P.pred)
    q = P.groupby("h").lr.quantile([0.1, 0.9]).unstack()
    q = q.rolling(5, center=True, min_periods=1).mean()  # smooth across neighbouring horizons

    m = DemandForecaster().fit(y)
    joblib.dump(m, HERE / "demand_model.joblib")
    fc = m.forecast(y, H_MAX).to_frame("forecast_gwh")
    fc["low_80"] = fc.forecast_gwh * np.exp(q[0.1].values[:len(fc)])
    fc["high_80"] = fc.forecast_gwh * np.exp(q[0.9].values[:len(fc)])
    fc["avg_mw"] = fc.forecast_gwh * 1000 / 24
    fc["holiday"] = [HOLIDAYS.get(str(d.date()), "") for d in fc.index]
    fc.round(1).to_csv(OUT / "forecast.csv", index_label="date")
    print("\nNext 28 days (GWh/day):")
    print(fc[["forecast_gwh", "low_80", "high_80", "holiday"]].round(0).to_string())

    # ── charts ──
    obs = df[df.observed]
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.plot(obs.index, obs.demand, ".", ms=3, color="#111827", label="demand met (observed)")
    ax.plot(y.index, y.rolling(7, center=True).mean(), color="#059669", lw=2, label="7-day average")
    f = df[~df.observed]
    ax.plot(f.index, f.demand, "x", ms=4, color="#DC2626", label="gap-filled (not scored)")
    for d in pd.DatetimeIndex(list(HOLIDAYS)):
        if y.index.min() <= d <= y.index.max():
            ax.axvline(d, color="#F59E0B", lw=0.6, alpha=0.6)
    ax.set_ylabel("GWh per day"); ax.set_title("India daily electricity demand met (orange lines: major holidays)")
    ax.legend(frameon=False, fontsize=8)
    save("01_daily_demand.png")

    g = df.dropna(subset=["solar"])[list(SRC)].resample("W").mean()
    fig, ax = plt.subplots(figsize=(12, 4))
    ax.stackplot(g.index, *[g[c] for c in SRC], labels=list(SRC), colors=list(SRC.values()))
    ax.set_ylabel("GWh per day (weekly average)"); ax.set_title("Generation by source")
    ax.legend(frameon=False, fontsize=8, loc="upper left", ncol=6)
    save("02_generation_mix.png")

    wf = weekday_factor(y)
    hol = (y / y.rolling(7, center=True).mean())[df.holiday]
    fig, ax = plt.subplots(1, 2, figsize=(11, 3.5))
    ax[0].bar(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], (wf - 1) * 100, color="#059669")
    ax[0].set_ylabel("% vs weekly average"); ax[0].set_title("Weekday effect")
    ax[1].barh([f"{d.date()} {HOLIDAYS[str(d.date())]}" for d in hol.index], (hol - 1) * 100, color="#F59E0B")
    ax[1].set_xlabel("% vs centred 7-day average"); ax[1].set_title("Holidays")
    ax[1].tick_params(axis="y", labelsize=7)
    save("03_calendar_effects.png")

    hz = R.groupby(["method", "h"]).ape.mean().unstack(0)
    fig, ax = plt.subplots(figsize=(9, 4))
    for c in hz.columns:
        ax.plot(hz.index, hz[c], lw=2.5 if c == PROD else 1.2, color="#059669" if c == PROD else None, label=c)
    ax.set_xlabel("days ahead"); ax.set_ylabel("MAPE %"); ax.legend(frameon=False, fontsize=8)
    ax.set_title("Walk-forward backtest: forecast error by horizon (Mar-Nov 2026 origins)")
    save("04_backtest_by_horizon.png")

    tail = y.iloc[-60:]
    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(tail.index, tail, color="#111827", lw=1.5, label="actual")
    ax.plot(fc.index, fc.forecast_gwh, color="#059669", lw=2, label="forecast")
    ax.fill_between(fc.index, fc.low_80, fc.high_80, color="#059669", alpha=0.15, label="80% interval")
    ax.set_ylabel("GWh per day"); ax.set_title(f"Next {H_MAX} days from {y.index[-1].date()}")
    ax.legend(frameon=False, fontsize=8)
    save("05_forecast.png")

    (OUT / "metrics.json").write_text(json.dumps({
        "data": {"first_day": str(y.index.min().date()), "last_day": str(y.index.max().date()),
                 "observed_days": int(df.observed.sum()), "gap_filled_days": int((~df.observed).sum()),
                 "demand_to_generation_ratio": round(df.attrs["demand_to_generation_ratio"], 4)},
        "backtest": {"test_origins_from": bt.TEST_START, "refit_every_days": bt.REFIT_EVERY,
                     "mape_pct": S.round(2).to_dict("index"),
                     "seasonal_window_origins_from": bt.SEASONAL_START,
                     "mape_pct_seasonal_window": S2.round(2).to_dict("index")},
        "interval_80_log_quantiles_by_h": q.round(4).to_dict("index"),
        "weekday_factor": {int(k): round(float(v), 4) for k, v in wf.items()},
        "trained_until": str(m.trained_until.date()),
    }, indent=1))
    export_site(df, fc, S, S2, wf, m)
    print(f"\nSaved {(HERE / 'demand_model.joblib').relative_to(HERE.parent)}, demand_forecast/demand_forecast.json, "
          "reports/demand/")


def export_site(df, fc, S, S2, wf, m, days=120):
    """Compact JSON for the dashboard: recent history, the forecast, generation mix and backtest scores."""
    y = df.demand
    avg7 = y.rolling(7, center=True, min_periods=4).mean()
    h = df.iloc[-days:]
    srcs = ["thermal", "solar", "hydro", "wind", "nuclear", "gas"]
    g = df.dropna(subset=["solar"])
    last30 = g.iloc[-30:]
    year_ago = g.loc[last30.index.min() - pd.Timedelta(days=364):last30.index.max() - pd.Timedelta(days=364)]
    yoy = df.loc[df.observed]
    ly = yoy.demand.copy(); ly.index = ly.index + pd.Timedelta(days=364)
    k = yoy.index.intersection(ly.index)
    keep = [bt.PROD, "Persistence (last day)", "Last 7-day average x weekday factor", "Same weekday last week",
            "Gradient boosting"]
    r = lambda v, d=1: None if v is None or not np.isfinite(v) else round(float(v), d)  # noqa: E731
    out = {
        "updated_through": str(y.index[-1].date()),
        "unit": "GWh per day",
        "data": {"first_day": str(y.index.min().date()), "observed_days": int(df.observed.sum()),
                 "gap_filled_days": int((~df.observed).sum()), "source": "MERIT India real-time readings, daily totals"},
        "history": [{"date": str(d.date()), "demand": r(v), "observed": bool(o), "avg7": r(a), "holiday": bool(hd)}
                    for d, v, o, a, hd in zip(h.index, h.demand, h.observed, avg7.loc[h.index], h.holiday)],
        "forecast": [{"date": str(d.date()), "gwh": r(v.forecast_gwh), "low": r(v.low_80), "high": r(v.high_80),
                      "avg_gw": r(v.forecast_gwh / 24, 1), "holiday": v.holiday or None}
                     for d, v in fc.iterrows()],
        "mix_last30": {s: r(last30[s].sum() / last30.gen_total.sum() * 100, 1) for s in srcs},
        "mix_last30_gwh_per_day": {s: r(last30[s].mean(), 0) for s in srcs},
        "mix_year_ago": ({s: r(year_ago[s].sum() / year_ago.gen_total.sum() * 100, 1) for s in srcs}
                         if len(year_ago) >= 20 else None),
        "mix_weekly": [{"week": str(w.date()), **{s: r(v[s], 0) for s in srcs}}
                       for w, v in g[srcs].resample("W-MON", label="left", closed="left").mean().iterrows()],
        "yoy_growth_pct": r((yoy.demand[k].sum() / ly[k].sum() - 1) * 100, 1) if len(k) >= 14 else None,
        "yoy_overlap_days": int(len(k)),
        "weekday_effect_pct": {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][int(i)]: r((v - 1) * 100, 1)
                               for i, v in wf.items()},
        "backtest": {
            "buckets": list(S.columns),
            "all_origins": {"from": bt.TEST_START,
                            "rows": {k2: [r(S.loc[k2, c], 2) for c in S.columns] for k2 in keep if k2 in S.index}},
            "seasonal_window": {"from": bt.SEASONAL_START,
                                "rows": {k2: [r(S2.loc[k2, c], 2) for c in S2.columns] for k2 in keep if k2 in S2.index}},
        },
        "model": {"name": "Daily demand forecaster", "trained_until": str(m.trained_until.date()), "horizon_days": int(len(fc)),
                  "method": "Ridge regression per horizon (days 1-7), blended 50/50 with the weekly profile from day 8, "
                            "scaled by last year's seasonal change from day 2"},
    }
    (HERE / "demand_forecast.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
