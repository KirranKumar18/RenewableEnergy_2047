"""
Short-term forecast of India's daily electricity demand (GWh/day), 1-28 days ahead.

Direct multi-horizon model: from a forecast origin T (the last day with data) it predicts each target day
D = T + h as

    demand(D) = level7(T) * exp( f_h(features) )

where level7 is the average of the last 7 days and f_h is a separate small model for each horizon h,
learned on every origin in the history (so the 1-day model can lean on yesterday, the 4-week model on
the weekly average). Features, all known at T:
    weekday of D, holiday on D                           calendar
    log(demand(T) / level7)                              latest day vs the week
    log(mean of last 3 days / level7)                    short-run swing (weather spells)
    log(level7 / level28)                                recent momentum
    log(level28 / level91)                               seasonal swing over the last quarter
    log(same weekday last week / level7)                 weekly shape

Learners
    "production"  ridge per horizon for days 1-7; from day 8 on, a 50/50 blend of the ridge forecast and
                  the weekly-profile baseline (last 7-day average x weekday factor). Beyond a week the ridge
                  models extrapolate recent momentum too far (+3% bias in the backtest); blending halves that.
                  Then, from day 2 on and only where the data reaches back a year, the forecast is scaled by
                  last year's seasonal change over the same weeks (holiday-adjusted 7-day average at D-364
                  vs at T-364). The models cannot learn seasonal turns from a single year; this supplies them.
    "ridge"       ridge per horizon for every day
    "gbm"         histogram gradient boosting, one model across horizons
Simple baselines for comparison live in baselines().
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge

from data import is_holiday

H_MAX = 28
FEATURES = ["holiday"] + [f"wd{i}" for i in range(7)] + [
    "last_vs_week", "last3_vs_week", "mom_7_28", "mom_28_91", "lastweek_shape"]


def _levels(y: pd.Series, T) -> dict:
    s = y.loc[:T]
    return {"y_T": s.iloc[-1], "l3": s.iloc[-3:].mean(), "l7": s.iloc[-7:].mean(), "l28": s.iloc[-28:].mean(),
            "l91": s.iloc[-91:].mean()}


def holiday_adjusted(y: pd.Series, pad: int = 1) -> pd.Series:
    """y with holiday days (and `pad` days after each) replaced by interpolation from normal days, so that
    a festival dip is not read as a change in the underlying level."""
    hol = pd.Series(is_holiday(y.index), index=y.index)
    for k in range(1, pad + 1):
        hol |= hol.shift(k, fill_value=False)
    return y.mask(hol).interpolate(limit_direction="both")


def make_rows(y: pd.Series, origins, horizons=range(1, H_MAX + 1), with_target=True,
              adjust_holidays: bool = True) -> pd.DataFrame:
    """One row per (origin, horizon). y: daily demand indexed by date, no gaps. Levels and momentum are
    computed on the holiday-adjusted series; the target is the actual demand."""
    rows = []
    pos = {d: i for i, d in enumerate(y.index)}
    vals = y.values
    ya = holiday_adjusted(y) if adjust_holidays else y
    avals = ya.values
    for T in origins:
        i = pos[T]
        if i < 90:
            continue
        L = _levels(ya, T)
        m1, m2 = np.log(L["l7"] / L["l28"]), np.log(L["l28"] / L["l91"])
        for h in horizons:
            D = T + pd.Timedelta(days=h)
            if with_target and D not in pos:
                continue
            sw = avals[i + h - 7 * int(np.ceil(h / 7))]  # latest same weekday as D, at or before T
            r = {"origin": T, "date": D, "h": h, "holiday": float(is_holiday([D])[0]),
                 "last_vs_week": np.log(L["y_T"] / L["l7"]), "last3_vs_week": np.log(L["l3"] / L["l7"]),
                 "mom_7_28": m1, "mom_28_91": m2, "lastweek_shape": np.log(sw / L["l7"]), "l7": L["l7"]}
            for w in range(7):
                r[f"wd{w}"] = float(D.dayofweek == w)
            if with_target:
                r["target"] = np.log(vals[pos[D]] / L["l7"])
            rows.append(r)
    return pd.DataFrame(rows)


@dataclass
class DemandForecaster:
    kind: str = "production"
    alpha: float = 0.01
    blend_from: int = 8            # production: first horizon that is blended with the weekly baseline
    blend_weight: float = 0.5      # weight on the ridge forecast in the blend
    seasonal_from: int = 2         # production: first horizon scaled by last year's seasonal change
    seasonal_weight: float = 1.0   # exponent on that ratio (0 = off)
    models: dict = field(default_factory=dict, repr=False)   # h -> fitted model ("gbm": key 0 for all h)
    wd_factor: pd.Series | None = None
    trained_until: pd.Timestamp | None = None

    def fit(self, y: pd.Series) -> "DemandForecaster":
        R = make_rows(y, y.index[:-1])
        self.wd_factor = weekday_factor(y)
        with np.errstate(all="ignore"):  # macOS Accelerate emits spurious matmul FP warnings
            if self.kind in ("ridge", "production"):
                self.models = {h: Ridge(alpha=self.alpha).fit(g[FEATURES].values, g.target.values)
                               for h, g in R.groupby("h")}
            else:
                X = np.c_[R.h.values, R[FEATURES].values]
                self.models = {0: HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_depth=3,
                                                                min_samples_leaf=20, l2_regularization=1.0,
                                                                random_state=0).fit(X, R.target.values)}
        self.trained_until = y.index[-1]
        return self

    def _predict(self, R: pd.DataFrame) -> np.ndarray:
        with np.errstate(all="ignore"):
            if self.kind in ("ridge", "production"):
                return np.array([self.models[h].predict(r[FEATURES].values[None])[0] for h, (_, r) in
                                 zip(R.h, R.iterrows())])
            return self.models[0].predict(np.c_[R.h.values, R[FEATURES].values])

    def forecast(self, y: pd.Series, horizon: int = H_MAX) -> pd.Series:
        """Forecast the `horizon` days after the last date in y (y must be gap-free)."""
        R = make_rows(y, [y.index[-1]], range(1, horizon + 1), with_target=False)
        out = R.l7.values * np.exp(self._predict(R))
        if self.kind == "production":
            weekly = R.l7.values * self.wd_factor.reindex(pd.DatetimeIndex(R.date).dayofweek).values
            w = np.where(R.h.values >= self.blend_from, self.blend_weight, 1.0)
            out = w * out + (1 - w) * weekly
            if self.seasonal_weight:
                out = out * self.seasonal_ratio(y, pd.DatetimeIndex(R.date), R.h.values)
        return pd.Series(out, index=pd.DatetimeIndex(R.date), name="demand_gwh")

    def seasonal_ratio(self, y: pd.Series, dates: pd.DatetimeIndex, h: np.ndarray) -> np.ndarray:
        """Last year's change from the origin to each target date (1 where last year is not in the data)."""
        lag = pd.Timedelta(days=364)  # 52 weeks: keeps weekdays aligned
        ya = holiday_adjusted(y)
        c7 = ya.rolling(7, center=True, min_periods=4).mean()
        T = y.index[-1]
        if T - lag - pd.Timedelta(days=6) < y.index[0]:
            return np.ones(len(dates))
        base = ya.loc[T - lag - pd.Timedelta(days=6):T - lag].mean()
        ly = c7.reindex(dates - lag).values / base
        r = np.where(np.isfinite(ly), ly, 1.0) ** self.seasonal_weight
        return np.where(h >= self.seasonal_from, r, 1.0)


def baselines(y: pd.Series, T, horizon: int, wd_factor: pd.Series) -> dict:
    """Forecasts for T+1..T+horizon from simple rules (all use only data up to T)."""
    s = y.loc[:T]
    dates = pd.date_range(T + pd.Timedelta(days=1), periods=horizon)
    l7 = s.iloc[-7:].mean()
    last_wd = {d.dayofweek: v for d, v in s.iloc[-7:].items()}
    return {
        "Persistence (last day)": pd.Series(s.iloc[-1], index=dates),
        "Same weekday last week": pd.Series([last_wd[d.dayofweek] for d in dates], index=dates),
        "Last 7-day average x weekday factor": pd.Series([l7 * wd_factor[d.dayofweek] for d in dates], index=dates),
    }


def weekday_factor(y: pd.Series) -> pd.Series:
    """Average ratio of each weekday to its centred 7-day mean."""
    r = y / y.rolling(7, center=True).mean()
    return r.groupby(r.index.dayofweek).mean()
