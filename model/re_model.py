"""
Renewable Energy 2047 — GSDP-elasticity forecast model.

Idea
----
Installed renewable capacity in a state grows with its economy. For each technology we
estimate an *elasticity* b: a 1% rise in state GSDP goes with roughly b% more installed MW.

    capacity(year) = capacity(base year) * exp( sum over future years of b(y) * annual GSDP log-growth )

- The forecast is anchored to each state's latest actual capacity (no flat-lining like tree models).
- b is fitted on recent within-state year-over-year changes (robust Huber regression).
- b has been falling over time as markets mature (e.g. solar ~5.5 in 2016 -> ~3.5 in 2020), so we
  measure that decline from rolling-window estimates and let b keep decaying into the future.
  This is what stops a 20+ year extrapolation from exploding.
- Installed capacity never goes down in the forecast (multiplier floored at 1).

The fitted model is plain JSON (no pickle), so the backend or even the frontend can load it.
"""
from __future__ import annotations

import json
import warnings
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_CSV = ROOT / "data" / "raw" / "renewable_energy_dataset.csv"

TECH = ["Solar Power", "Wind Power", "Bio-Mass Power", "Small Hydro Power", "Waste to Energy"]
TECH_KEY = {"Solar Power": "solar", "Wind Power": "wind", "Bio-Mass Power": "bio",
            "Small Hydro Power": "hydro", "Waste to Energy": "waste"}


# ───────────────────────────── data ─────────────────────────────
def load_data(path: Path = DATA_CSV) -> pd.DataFrame:
    df = pd.read_csv(path)
    df.columns = [c.replace("Installed - ", "") for c in df.columns]
    df = df.rename(columns={"GSDP (crore INR)": "GSDP"}).sort_values(["State", "Year"]).reset_index(drop=True)
    return impute_placeholder_gsdp(splice_gsdp(df))


def splice_gsdp(df: pd.DataFrame) -> pd.DataFrame:
    """GSDP jumps ~2.2x in 2011 because the official base year changed (2004-05 -> 2011-12).
    Rescale each state's pre-2011 values so 2010->2011 growth equals its median 2012-2015 growth."""
    df = df.copy()
    for st, g in df.groupby("State"):
        v = g.set_index("Year").GSDP
        if 2010 in v.index and 2011 in v.index:
            gr = v.pct_change().loc[2012:2015].median()
            k = v[2011] / (v[2010] * (1 + gr))
            df.loc[(df.State == st) & (df.Year <= 2010), "GSDP"] *= k
    return df


def impute_placeholder_gsdp(df: pd.DataFrame) -> pd.DataFrame:
    """In the source data the final year's GSDP is a placeholder (every state ~-0.2% vs the year before,
    while real growth is ~4-8%). If the final year looks like that, replace it with the previous year
    grown at the state's average growth over the three years before."""
    df = df.copy()
    last = df.Year.max()
    w = df.pivot(index="Year", columns="State", values="GSDP")
    g = np.log(w).diff()
    if last - 1 in g.index and abs(g.loc[last].median()) < 0.005 and g.loc[last].abs().max() < 0.01 \
            and g.loc[last - 1].median() > 0.02:
        avg = g.loc[last - 3:last - 1].mean()
        for st in w.columns:
            if pd.notna(w.loc[last, st]) and pd.notna(w.loc[last - 1, st]):
                df.loc[(df.State == st) & (df.Year == last), "GSDP"] = w.loc[last - 1, st] * np.exp(avg[st])
        df.attrs["gsdp_imputed_year"] = int(last)
    return df


def fresh_mask(df: pd.DataFrame) -> pd.DataFrame:
    """True where a state's value for a technology is a genuine new report: its first observation, or
    a value that changed vs the previous year. Exact repeats are treated as stale (not re-reported):
    in 2023-24 only 15 of 34 states report anything new, so repeats are mostly carry-forwards."""
    prev = df.groupby("State")[TECH].shift(1)
    return pd.DataFrame({t: prev[t].isna() | (df[t] != prev[t]) for t in TECH}, index=df.index)


def yoy_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Long frame of year-over-year changes: one row per state x tech x year."""
    parts = []
    for t in TECH:
        x = df[["State", "Zone", "Year", "GSDP", t]].rename(columns={t: "cap"}).copy()
        x["tech"] = t
        parts.append(x)
    L = pd.concat(parts).sort_values(["State", "tech", "Year"]).reset_index(drop=True)
    g = L.groupby(["State", "tech"])
    L["cap_prev"] = g.cap.shift(1)
    L["dlog_cap"] = np.log1p(L.cap) - np.log1p(L.cap_prev)
    L["dlog_gsdp"] = np.log(L.GSDP) - np.log(g.GSDP.shift(1))
    # only consecutive years
    L = L[(L.Year - g.Year.shift(1)) == 1]
    return L.dropna(subset=["dlog_cap", "dlog_gsdp"])


# ───────────────────────────── model ─────────────────────────────
@dataclass
class ElasticityModel:
    window: int = 8            # years of history used to estimate the current elasticity
    span: int = 2              # length (years) of each capacity/GSDP difference inside the window
    min_mw: float = 10.0       # ignore state-tech pairs smaller than this (0 -> 5 MW is noise, not growth)
    decay_points: int = 7      # how many rolling estimates to use when measuring the decline in b
    max_decay: float = 0.25    # cap on yearly decay rate of b
    min_estimates: int = 3     # rolling elasticity estimates a tech needs before it is extrapolated

    # fitted
    base_year: int | None = None
    elasticity: dict = field(default_factory=dict)      # tech -> b at base year
    decay: dict = field(default_factory=dict)           # tech -> yearly decay rate lambda
    elasticity_history: dict = field(default_factory=dict)
    states: dict = field(default_factory=dict)          # state -> {zone, year, gsdp, population, capacity{tech}}
    history: dict = field(default_factory=dict)         # state -> {year: {tech: mw}} for years <= base

    # ---- fitting ----
    def _fit_b(self, df: pd.DataFrame, end_year: int, tech: str) -> float | None:
        """Elasticity over the window ending at `end_year`.

        Uses `span`-year differences per state (log-change in capacity vs log-change in GSDP), all
        overlapping pairs inside the window, pooled across states with a robust Huber fit through the
        origin. Multi-year spans are robust to the data's habit of carrying capacity forward one year
        and catching up the next; span=1 is plain year-over-year."""
        w = df.pivot(index="Year", columns="State", values=[tech, "GSDP"])
        dcs, dgs = [], []
        for y1 in range(end_year - self.window + self.span, end_year + 1):
            y0 = y1 - self.span
            if y0 not in w.index or y1 not in w.index:
                continue
            c0, c1 = w.loc[y0, tech], w.loc[y1, tech]
            g0, g1 = w.loc[y0, "GSDP"], w.loc[y1, "GSDP"]
            ok = (c0 >= self.min_mw) & c1.notna() & g0.notna() & g1.notna()
            dcs.append(np.log1p(c1[ok]) - np.log1p(c0[ok]))
            dgs.append(np.log(g1[ok]) - np.log(g0[ok]))
        if not dcs:
            return None
        dc, dg = pd.concat(dcs), pd.concat(dgs)
        if dc.index.nunique() < 5:   # need at least 5 distinct states to call it a pattern
            return None
        from sklearn.linear_model import HuberRegressor  # training only; keeps the serving bundle small
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            h = HuberRegressor(fit_intercept=False, max_iter=1000).fit(dg.values.reshape(-1, 1), dc.values)
        return float(max(h.coef_[0], 0.0))

    def fit(self, df: pd.DataFrame) -> "ElasticityModel":
        self.base_year = int(df.Year.max())
        for t in TECH:
            hist = {}
            for end in range(int(df.Year.min()) + self.window, self.base_year + 1):
                b = self._fit_b(df, end, t)
                if b is not None:
                    hist[end] = round(b, 4)
            self.elasticity_history[t] = hist
            # a technology needs a few years of track record before we extrapolate it; an emerging
            # sector (e.g. waste-to-energy, which only appears from 2018) is held at its latest level
            b_now = hist.get(self.base_year, 0.0) if len(hist) >= self.min_estimates else 0.0
            self.elasticity[t] = b_now
            # yearly decay of b from the trend of recent rolling estimates (log-linear fit)
            pts = [(y, b) for y, b in sorted(hist.items())[-self.decay_points:] if b > 0.05]
            lam = 0.0
            if len(pts) >= 3:
                ys, bs = np.array(pts).T
                slope = np.polyfit(ys, np.log(bs), 1)[0]
                lam = float(np.clip(-slope, 0.0, self.max_decay))
            self.decay[t] = round(lam, 4)

        # anchors: each state's latest observation
        for st, g in df.groupby("State"):
            last = g.sort_values("Year").iloc[-1]
            self.states[st] = {
                "zone": last.Zone, "year": int(last.Year), "gsdp": float(last.GSDP),
                "population": float(last.Population),
                "capacity": {t: float(last[t]) for t in TECH},
            }
            self.history[st] = {int(r.Year): {t: float(r[t]) for t in TECH} for _, r in g.iterrows()}
        return self

    # ---- prediction ----
    def multiplier(self, tech: str, from_year: int, to_year: int, gsdp_from: float, gsdp_to: float) -> float:
        """Capacity growth factor between two years given GSDP at both ends
        (GSDP assumed to grow at a constant rate in between)."""
        n = to_year - from_year
        if n <= 0 or gsdp_from <= 0 or gsdp_to <= 0:
            return 1.0
        g = np.log(gsdp_to / gsdp_from) / n
        b0, lam = self.elasticity[tech], self.decay[tech]
        steps = np.arange(from_year + 1, to_year + 1) - self.base_year
        b_path = b0 * np.exp(-lam * np.maximum(steps, 0))
        return float(max(np.exp(np.sum(b_path * g)), 1.0))

    def forecast_batch(self, base_mw: np.ndarray, years_ahead: np.ndarray, gsdp_ratio: np.ndarray) -> np.ndarray:
        """Vectorised forecast from the base year (same maths as `multiplier`), for explainers and APIs.

        base_mw      (n, 5)  installed MW per tech in the base year, columns in TECH order
        years_ahead  (n,)    forecast year - base year (>= 0)
        gsdp_ratio   (n,)    GSDP in forecast year / GSDP in base year
        returns      (n, 5)  forecast MW per tech
        """
        base_mw = np.asarray(base_mw, float)
        n = np.clip(np.rint(np.asarray(years_ahead, float)).astype(int), 0, 200)
        ratio = np.clip(np.asarray(gsdp_ratio, float), 1e-9, None)
        g = np.where(n > 0, np.log(ratio) / np.maximum(n, 1), 0.0)
        out = np.empty_like(base_mw)
        for j, t in enumerate(TECH):
            lam = self.decay[t]
            w = np.concatenate([[0.0], np.cumsum(np.exp(-lam * np.arange(1, 201)))])  # sum_{s=1..n} e^{-lam s}
            logm = self.elasticity[t] * w[n] * g
            out[:, j] = base_mw[:, j] * np.exp(np.maximum(logm, 0.0))
        return out

    def predict_state(self, state: str, year: int, gsdp_crore: float) -> dict:
        """Installed MW per technology for one state in `year`, given that state's GSDP (crore INR) then."""
        if state not in self.states:
            raise KeyError(f"Unknown state: {state}")
        s = self.states[state]
        if year <= s["year"]:
            h = self.history[state]
            yr = max((y for y in h if y <= year), default=min(h))
            return {t: h[yr][t] for t in TECH}
        return {t: s["capacity"][t] * self.multiplier(t, s["year"], year, s["gsdp"], gsdp_crore) for t in TECH}

    def predict_frame(self, df: pd.DataFrame) -> pd.DataFrame:
        """Vectorised-ish helper for evaluation: df needs State, Year, GSDP."""
        rows = [self.predict_state(r.State, int(r.Year), float(r.GSDP)) if r.State in self.states
                else {t: 0.0 for t in TECH} for r in df.itertuples()]
        return pd.DataFrame(rows, index=df.index)[TECH]

    def zone_states(self, zone: str) -> list[str]:
        return sorted(s for s, v in self.states.items() if v["zone"] == zone)

    # ---- persistence ----
    def to_json(self, path: Path) -> None:
        d = asdict(self)
        d["model_type"] = "gsdp_elasticity_v1"
        d["tech_keys"] = TECH_KEY
        Path(path).write_text(json.dumps(d, indent=1))

    @classmethod
    def from_json(cls, path: Path) -> "ElasticityModel":
        d = json.loads(Path(path).read_text())
        d.pop("model_type", None); d.pop("tech_keys", None)
        m = cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})
        # JSON turns int keys into strings
        m.history = {s: {int(y): v for y, v in h.items()} for s, h in m.history.items()}
        m.elasticity_history = {t: {int(y): v for y, v in h.items()} for t, h in m.elasticity_history.items()}
        return m
