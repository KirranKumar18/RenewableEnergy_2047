# Capacity model: exported tables

These tables describe the **current production model**: the v2 convergence model with the transmission term and the Viksit Bharat ($30 trillion) GDP outlook. It includes the November 2026 fixes:
- Float32 copies count as repeats.
- The national trend has a 4-year half-life.
- Only solar's stale years are nowcast.

The tests behind these fixes are in `reports/error_fixes/`.

To regenerate: `.venv/bin/python model/export_tables.py`.

Sources are solar, wind, bio-mass, small hydro and waste-to-energy. MW = installed capacity.

| # | File | Contents |
|---|---|---|
| 1 | `backtest_predictions.csv` | Every backtest test row: cutoff, state, zone, source, year, horizon, actual, predicted, error, and whether it was scored (fresh report) |
| 2 | `error_summary.csv` | WAPE and signed error by source, state, zone and horizon, for each cutoff set |
| 3 | `dataset_schema.csv`, `year_coverage.csv`, `fresh_flags.csv`, `fresh_summary.csv` | Columns and units; years covered per state; fresh/stale flag for every state, year and source; share fresh and last fresh year |
| 4 | `growth_coefficients.csv`, `year_effects.csv`, `constants.csv` | Growth equation with fitted coefficients; national year effects; all hand-set constants and where they live |
| 5 | `nowcast_stale_states.csv` | 2022–2024 nowcast next to the last reported value, per stale state and source |
| 6 | `gsdp_population_projection.csv` | Per-state GSDP (real and current prices) and population for 2024, 2030 and 2047, for every GDP outlook |
| 7 | `ablations.csv` | Backtest error with each model term removed or changed, per cutoff |
| 8 | `national_capacity.csv`, `capacity_factors.csv` | India capacity and generation by source, 2024–2047, every outlook; utilisation factors and cost benchmarks |
| 9 | `data_fixes.csv` | Every data fix: evidence, what was done, status |

## Key numbers

**Error**, scored on fresh reports only:

| | Standard cutoffs (2016, 2018, 2020) | Recent cutoffs (2020, 2021, 2022) |
|---|---|---|
| Headline: mean of each cutoff's WAPE | **28.6%** | **23.6%** |
| All cutoffs pooled into one WAPE | 29.4% | 23.6% |
| Signed error, pooled | −2.5% | −16.8% |

**Error by horizon** (standard cutoffs): 16% one year ahead, 38–40% five to eight years ahead.
- Signed error stays between −14% and +8% at every horizon. It was −32% at 8 years before the half-life fix.

**Largest absolute misses** (standard cutoffs): Gujarat (−34%) and Maharashtra (−7%) are under-forecast; Andhra Pradesh (+26%) and Tamil Nadu (+20%) are over-forecast.

**Ablations** (average of both cutoff sets; production is 26.1%):

| Change | Average error | vs production |
|---|---|---|
| Remove the transmission term | 32.0% | +5.9 |
| Remove catch-up | 28.3% | +2.2 |
| No nowcast | 28.2% | +2.1 |
| Remove the GSDP term | 27.8% | +1.7 |
| Trend half-life 5 years | 26.8% | +0.7 |
| Trend half-life 3 years | 26.4% | +0.3 (but −20% bias 5–8 years ahead) |
| v1 GDP model alone | 36.5% | +10.5 |
| Naive: no new capacity | 46.9% | +20.8 |

**National forecast** (Viksit Bharat outlook):

| | 2024 | 2030 | 2035 | 2040 | 2047 |
|---|---|---|---|---|---|
| Capacity | 206 GW | 511 GW | 696 GW | 835 GW | **998 GW** |
| Generation | 477 TWh | 1,056 TWh | 1,414 TWh | 1,696 TWh | **2,051 TWh** |

**Capacity factors:** solar 21%, wind 30%, bio-mass 75%, small hydro 45%, waste-to-energy 70%. These are CERC/MNRE benchmarks, not learned from the data.

## Caveats
- **2026 solar is probably high.** The 2026 forecast of 266 GW solar is about 3× the grid's highest observed solar output (87 GW), so peak output is only 33% of it.
- **Bio-mass and small hydro** use the v1 GDP-elasticity rule, so their v2 coefficient cells are blank.
- **Population is not a model input.** It is projected at 0.8% a year only for per-person figures.
