"""
GSDP projection for the forecast years (2025-2047), state by state.

Units: the dataset's GSDP is at CONSTANT 2011-12 prices (real). India's 2023 sum is about Rs 162 lakh crore,
which matches official real GDP, not nominal GDP (~Rs 270-300 lakh crore). The capacity model learned its
GSDP effects on these real values, so projections stay real. Government targets are quoted at CURRENT prices
(nominal) or in dollars, e.g. the $30 trillion Viksit Bharat target for 2047; the conversion is:

    nominal = real x K x (1 + inflation)^(year - 2024)
    dollars = nominal / (Rs per $), with Rs per $ = 92.65 today (2026) x (1 + depreciation)^(year - 2026)
    K = official nominal GDP 2024-25 (Rs 330.68 lakh crore, MoSPI provisional estimates, 30 May 2025)
        / this dataset's 2024 national GSDP (Rs ~170 lakh crore at 2011-12 prices)
    depreciation = 4.75% a year: the rupee's average fall against the dollar since 1991 (4.5-5%, per the project team)
    inflation = (1 + 2% US inflation) x (1 + 4.75%) - 1 = 6.85% a year
A currency falls against the dollar by roughly the gap between the two countries' inflation (relative
purchasing power), so a rupee that keeps losing 4.75% a year goes with ~6.85% Indian inflation if US inflation
is ~2%. Using 4.75% depreciation with a lower inflation figure would turn the dollar target into an
implausible ~10% real growth. K maps the dataset onto official current-price GDP, so it also absorbs the
dataset's slightly lower coverage (official real GDP 2024-25 was Rs 187.97 lakh crore).

How a state's GSDP is projected
    national real growth path  (a scenario, below)
  + state differential         half of the state's trend growth gap to India over 2012-2024 (excluding the
                               2020-21 COVID years), capped at +-1.5 points, fading with a 10-year half-life
  then every year the states are rescaled so they add up to the national path.

Why: the old default grew each state at its own 10-year CAGR (2014-2024). That window contains the COVID
dip and this dataset's weak post-COVID figures (+3.9-4.5% a year), so India's implied growth was only ~5.2% a
year to 2047, below the IMF's estimate of medium-term potential (6.5%). validate() shows that national growth
+ a shrunk state differential also predicts each state's share better than its own CAGR.

Scenarios (real GDP growth, % a year)
    viksit   the steady real growth that makes India's GDP $30 trillion in 2047 (the Viksit Bharat target) under the
             conversion above: about 7.1% (default)
    wb       7.8% every year: the average the World Bank says India needs to reach high income by 2047
             (India Country Economic Memorandum, Feb 2025)
    imf      IMF medium-term potential: 6.5% to 2030, easing to 5.5% by 2047
             (IMF 2025 Article IV staff report: medium-term potential growth 6.5%; India averaged 6.3% in
             2000-2024 per the World Bank. The easing after 2030 is this project's assumption: growth slows as
             income rises.)
    dataset  the dataset's own GSDP trend (2014-2024 CAGR of the national total), held flat
"""
from __future__ import annotations

import numpy as np
import pandas as pd

BASE_YEAR = 2024
END_YEAR = 2060
EXCLUDE = (2020, 2021)       # COVID shock years left out of trend estimates
TREND_FROM = 2012            # first year on the 2011-12 base (no splice involved)
SHRINK = 0.5
CAP = 0.015
HALF_LIFE = 10.0

NOMINAL_GDP_2024 = 330.68e5   # crore, India GDP 2024-25 at current prices (MoSPI, 30 May 2025)
USD_INR_TODAY = 92.65         # Rs per US dollar today (Nov 2026, as given by the project team)
RATE_YEAR = 2026
INR_DEPRECIATION = 0.0475     # yearly fall of the rupee vs the dollar, 1991 onwards average (4.5-5%)
US_INFLATION = 0.02           # assumed (the Federal Reserve's target)
INFLATION = (1 + US_INFLATION) * (1 + INR_DEPRECIATION) - 1   # ~6.85% Indian inflation, consistent with the above
VIKSIT_USD_2047 = 30e12       # the Viksit Bharat target: a $30 trillion economy in 2047


def usd_inr(year: int) -> float:
    """Rs per US dollar in `year`: today's rate falling at the long-run average."""
    return USD_INR_TODAY * (1 + INR_DEPRECIATION) ** (year - RATE_YEAR)


VIKSIT_TARGET_2047 = VIKSIT_USD_2047 * usd_inr(2047) / 1e7   # crore at current prices

SCENARIOS = {
    "viksit": {"label": "Viksit Bharat ($30 trillion)", "short": None,
               "note": f"steady real growth that makes GDP $30 trillion in 2047 (Rs {VIKSIT_TARGET_2047 / 1e5:,.0f} lakh crore at "
                       f"Rs {usd_inr(2047):.0f} per dollar: today's Rs {USD_INR_TODAY} falling {INR_DEPRECIATION:.2%} a year)"},
    "wb": {"label": "World Bank high-income path", "short": "7.8% a year",
           "note": "7.8% real growth a year, the average the World Bank says India needs to reach high income by 2047"},
    "imf": {"label": "IMF outlook", "short": "6.5% easing to 5.5%",
            "note": "IMF medium-term potential growth of 6.5% to 2030, easing to 5.5% by 2047"},
    "dataset": {"label": "Dataset trend", "short": None,
                "note": "the dataset's own 2014-2024 GSDP growth, held flat"},
}
DEFAULT_SCENARIO = "viksit"


def _trend(series: pd.Series) -> float:
    """Log-linear trend growth (fraction per year) over TREND_FROM..BASE_YEAR, COVID years excluded."""
    s = series[(series.index >= TREND_FROM) & ~series.index.isin(EXCLUDE)].dropna()
    s = s[s > 0]
    if len(s) < 4:
        return np.nan
    b = np.polyfit(s.index.values.astype(float), np.log(s.values), 1)[0]
    return float(np.expm1(b))


class GsdpProjector:
    """Projected real GSDP (crore, 2011-12 prices) for every state, year and scenario."""

    def __init__(self, gsdp_history: dict, base_year: int = BASE_YEAR):
        # gsdp_history: state -> {year: crore}
        self.base_year = base_year
        self.states = sorted(gsdp_history)
        H = pd.DataFrame(gsdp_history).sort_index()          # years x states
        self.g0 = H.loc[base_year]
        nat = H.sum(1)
        n = min(10, base_year - int(H.index.min()))
        self.dataset_growth = float((nat.loc[base_year] / nat.loc[base_year - n]) ** (1 / n) - 1)
        self.k = NOMINAL_GDP_2024 / float(self.g0.sum())     # current-price rupees per dataset rupee, 2024
        yrs = 2047 - base_year
        self.viksit_growth = float((VIKSIT_TARGET_2047 / (self.g0.sum() * self.k * (1 + INFLATION) ** yrs)) ** (1 / yrs) - 1)
        t_nat = _trend(nat)
        diff = {}
        for s in self.states:
            ts = _trend(H[s])
            diff[s] = float(np.clip(SHRINK * (ts - t_nat), -CAP, CAP)) if np.isfinite(ts) else 0.0
        self.diff = pd.Series(diff)
        self.years = np.arange(base_year, END_YEAR + 1)
        self.paths = {k: self._build(k) for k in SCENARIOS}
        SCENARIOS["dataset"]["short"] = f"{self.dataset_growth * 100:.1f}% a year"
        SCENARIOS["viksit"]["short"] = f"{self.viksit_growth * 100:.1f}% a year"

    def nominal_factor(self, year: int) -> float:
        """Multiply real (dataset) GSDP in `year` by this to get current prices."""
        return self.k * (1 + INFLATION) ** (year - self.base_year)

    def national_growth(self, scenario: str, year: int) -> float:
        if scenario == "viksit":
            return self.viksit_growth
        if scenario == "wb":
            return 0.078
        if scenario == "dataset":
            return self.dataset_growth
        # imf: 6.5% through 2030, then a straight line down to 5.5% in 2047, flat after
        if year <= 2030:
            return 0.065
        return 0.065 - 0.010 * min(1.0, (year - 2030) / (2047 - 2030))

    def _build(self, scenario: str) -> pd.DataFrame:
        """years x states, real GSDP in crore."""
        rows = [self.g0.values.astype(float)]
        nat = float(self.g0.sum())
        for y in self.years[1:]:
            nat *= 1 + self.national_growth(scenario, int(y))
            fade = 0.5 ** ((y - self.base_year - 1) / HALF_LIFE)
            raw = rows[-1] * (1 + self.national_growth(scenario, int(y)) + self.diff.values * fade)
            rows.append(raw * nat / raw.sum())        # states add up to the national path
        return pd.DataFrame(rows, index=self.years, columns=self.states)

    def gsdp(self, state: str, year: int, scenario: str = DEFAULT_SCENARIO) -> float:
        year = int(min(max(year, self.base_year), END_YEAR))
        return float(self.paths[scenario].at[year, state])

    def log_growth(self, state: str, year: int, scenario: str = DEFAULT_SCENARIO) -> float:
        """Average yearly log-growth from the base year to `year` (what the capacity model takes)."""
        n = year - self.base_year
        return float(np.log(self.gsdp(state, year, scenario) / self.g0[state]) / n) if n > 0 else 0.0

    def cagr(self, state: str, year: int = 2047, scenario: str = DEFAULT_SCENARIO) -> float:
        return float(np.expm1(self.log_growth(state, year, scenario)))

    def national(self, year: int, scenario: str = DEFAULT_SCENARIO) -> float:
        return float(self.paths[scenario].loc[int(min(max(year, self.base_year), END_YEAR))].sum())


def apply_to_model(model, scenario: str = DEFAULT_SCENARIO) -> GsdpProjector:
    """Set each state's default GSDP growth (gsdp_cagr, used when no GSDP is given and for the zone catch-up
    paths) to the outlook's average 2024-2047 growth, and rebuild the zone intensity paths."""
    P = GsdpProjector({s: v["gsdp"] for s, v in model.states.items()}, model.base_year)
    for s, v in model.states.items():
        v["gsdp_cagr"] = P.cagr(s, 2047, scenario)
    model.gsdp_outlook = scenario
    model._baseline_zone_paths()
    return P


def validate(df: pd.DataFrame, cutoffs=(2015, 2016, 2017, 2018, 2019)) -> pd.DataFrame:
    """How well each rule predicts state GSDP from a cutoff to 2024, given the actual national total.
    Isolates the state split (the national path is a scenario, not something the data can test).
    Error = mean absolute % error of state GSDP, all later years."""
    H = df.pivot(index="Year", columns="State", values="GSDP")
    out = {}
    for cut in cutoffs:
        hist = H.loc[:cut]
        nat_act = H.sum(1)
        t_nat = _trend(hist.sum(1).loc[:cut])
        for name, shrink in [("own 10-year CAGR (old default)", None), ("national growth, no state gap", 0.0),
                             ("national + half the state gap (new)", 0.5), ("national + full state gap", 1.0)]:
            errs = []
            for s in H.columns:
                hs = hist[s].dropna()
                if len(hs) < 5 or not np.isfinite(H.loc[2024, s]):
                    continue
                g0 = hs.iloc[-1]
                if shrink is None:
                    n = min(10, len(hs) - 1)
                    c = (hs.iloc[-1] / hs.iloc[-1 - n]) ** (1 / n) - 1
                    pred = {y: g0 * (1 + c) ** (y - cut) for y in range(cut + 1, 2025)}
                else:
                    ts = _trend(hs) if cut >= TREND_FROM + 3 else np.nan
                    d = float(np.clip(shrink * (ts - t_nat), -CAP, CAP)) if np.isfinite(ts) else 0.0
                    share0 = g0 / hist.loc[cut].sum()
                    pred = {y: nat_act[y] * share0 * (1 + d) ** (y - cut) for y in range(cut + 1, 2025)}
                for y, p in pred.items():
                    a = H.loc[y, s]
                    if np.isfinite(a) and a > 0:
                        errs.append(abs(p - a) / a * 100)
            out[(cut, name)] = np.mean(errs)
    return pd.Series(out).unstack()


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from re_model import load_data
    df = load_data()
    V = validate(df)
    print("State GSDP error (%) predicting cutoff+1..2024, with the actual national total:")
    print(V.round(2).to_string()); print("mean:", V.mean().round(2).to_dict())
    hist = {s: g.set_index("Year").GSDP.to_dict() for s, g in df.groupby("State")}
    P = GsdpProjector(hist)
    print(f"\nDataset trend (national 2014-2024 CAGR): {P.dataset_growth:.2%}")
    print(f"K = {P.k:.3f}, inflation {INFLATION:.2%}, Rs/$ 2047 {usd_inr(2047):.1f}, $30T = Rs {VIKSIT_TARGET_2047/1e5:,.0f} lakh crore, "
          f"Viksit real growth {P.viksit_growth:.2%}")
    for k in SCENARIOS:
        print(f"{k:8s} real:", {y: round(P.national(y, k) / 1e5) for y in (2024, 2030, 2047)},
              " current prices:", {y: round(P.national(y, k) * P.nominal_factor(y) / 1e5) for y in (2024, 2030, 2047)}, "lakh crore")
    print("state differentials (pp):", (P.diff * 100).round(2).sort_values().to_dict())
