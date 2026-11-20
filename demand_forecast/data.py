"""
All-India daily electricity demand (energy requirement) from data/raw/india_energy_daily.xlsx.

The workbook holds daily aggregates of MERIT India's real-time readings:
    demand_energy_gwh        daily "demand met" energy, GWh (= average MW x 24 / 1000)
    demand_reading_count     how many real-time readings went into that day's average
    generation_energy_gwh    the same for generation by source (thermal, gas, solar, wind, hydro, nuclear)

Cleaning
    * Generation and demand agree within ~1% every day, so a missing demand day is filled from total
      generation (scaled by the median demand/generation ratio) when generation exists, else by linear
      interpolation. Filled days are flagged and never used for scoring.
    * Days built from very few readings (< MIN_READINGS) are treated as missing.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "data" / "raw" / "india_energy_daily.xlsx"
MIN_READINGS = 100

# Major all-India holidays and festivals in the data window (dates as observed; Diwali counts its
# 3 main days). Demand drops on these days. Extend this list when forecasting further ahead.
HOLIDAYS = {
    "2025-10-02": "Gandhi Jayanti / Dussehra",
    "2025-10-20": "Diwali", "2025-10-21": "Diwali", "2025-10-22": "Diwali",
    "2025-11-05": "Guru Nanak Jayanti",
    "2025-12-25": "Christmas",
    "2026-01-01": "New Year",
    "2026-01-14": "Makar Sankranti / Pongal",
    "2026-01-26": "Republic Day",
    "2026-03-04": "Holi",
    "2026-03-21": "Eid al-Fitr",
    "2026-08-15": "Independence Day",
    "2026-10-02": "Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali", "2026-11-09": "Diwali", "2026-11-10": "Diwali",
    "2026-12-25": "Christmas",
    "2027-01-01": "New Year",
    "2027-01-26": "Republic Day",
}
HOLIDAY_DATES = pd.DatetimeIndex(list(HOLIDAYS))


def is_holiday(dates) -> np.ndarray:
    return pd.DatetimeIndex(dates).isin(HOLIDAY_DATES)


def load(path: Path = XLSX) -> pd.DataFrame:
    """Daily frame indexed by date: demand (GWh, gap-filled), observed (bool), readings, generation columns."""
    d = pd.read_excel(path, "demand_energy_gwh").rename(columns={"DEMAND MET": "demand"}).set_index("date")
    n = pd.read_excel(path, "demand_reading_count").rename(columns={"DEMAND MET": "readings"}).set_index("date")
    g = pd.read_excel(path, "generation_energy_gwh").set_index("date")
    g.columns = [c.replace(" GENERATION", "").lower() for c in g.columns]
    g["gen_total"] = g.sum(1)

    idx = pd.date_range(min(d.index.min(), g.index.min()), max(d.index.max(), g.index.max()), name="date")
    df = d.join(n).reindex(idx).join(g.reindex(idx))
    df["observed"] = df.demand.notna() & (df.readings.fillna(0) >= MIN_READINGS)
    df.loc[~df.observed, "demand"] = np.nan

    ratio = float((df.demand / df.gen_total).median())
    fill = df.gen_total * ratio
    df["filled_from"] = np.where(df.observed, "", np.where(fill.notna(), "generation", "interpolation"))
    df["demand"] = df.demand.fillna(fill).interpolate(limit_direction="both")
    df["holiday"] = is_holiday(df.index)
    df.attrs["demand_to_generation_ratio"] = ratio
    return df
