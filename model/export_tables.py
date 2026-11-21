"""
Export the production capacity model's evidence as CSV tables -> reports/exports/

    .venv/bin/python model/export_tables.py

 1 backtest_predictions.csv     every backtest test row: cutoff, state, zone, source, year, horizon, actual, predicted
 2 error_summary.csv            WAPE and signed error by source, state, zone and horizon (fresh rows only)
 3 dataset_schema.csv           columns, units, ranges
   year_coverage.csv            first/last/missing years per state
   fresh_flags.csv              fresh (new report) / stale (repeat) flag for every state, year and source
   fresh_summary.csv            share of fresh values and last fresh year per state and source
 4 growth_coefficients.csv      fitted coefficients per source
   year_effects.csv             fitted national year effects (alpha) per source
   constants.csv                every hand-set constant, with where it lives
 5 nowcast_stale_states.csv     2022-2024 nowcast next to the last reported value, per stale state and source
 6 gsdp_population_projection.csv  per-state GSDP and population for 2024, 2030 and 2047, every GDP outlook
 7 ablations.csv                backtest error with each model term removed or changed
 8 national_capacity.csv        India capacity and generation by source, 2024-2047, every GDP outlook
   capacity_factors.csv         utilisation factors and cost benchmarks used
 9 data_fixes.csv               every data fix, with evidence and status
"""
from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "model"))
warnings.filterwarnings("ignore")

import backend_api as api  # noqa: E402
import gsdp_projection as gp  # noqa: E402
from re_model import DATA_CSV, TECH, TECH_KEY, ElasticityModel, fresh_mask, load_data  # noqa: E402
from convergence_model import EPS, END_YEAR, ConvergenceModel  # noqa: E402
from train import CUTOFFS, RECENT_CUTOFFS, naive, score  # noqa: E402

OUT = ROOT / "reports" / "exports"
SRC = {t: TECH_KEY[t] for t in TECH}
NAME = {"Solar Power": "Solar", "Wind Power": "Wind", "Bio-Mass Power": "Bio-mass", "Small Hydro Power": "Small hydro",
        "Waste to Energy": "Waste-to-energy"}
POP_GROWTH = 0.008


def save(df, name):
    df.to_csv(OUT / name, index=False)
    print(f"  {name:34s} {len(df):6d} rows")


def zeroed(attr_fn):
    """Model that applies attr_fn(model) after fitting, then rebuilds the nowcast and zone paths."""
    def make():
        m = ConvergenceModel()
        orig = m.fit

        def fit(df):
            orig(df); attr_fn(m); m._nowcast(); m._baseline_zone_paths(); return m
        m.fit = fit
        return m
    return make


def no_gsdp(m):
    for t, p in m.params.items():
        p["beta"] = 0.0
        if p.get("dynamics") == "v1":
            p["v1_elasticity"] = 0.0


def no_catchup(m):
    for p in m.params.values():
        p["kappa"] = 0.0


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df = load_data(); fr = fresh_mask(df)
    zone_of = df.groupby("State").Zone.first()
    M = api.MODEL
    print("Writing reports/exports/")

    # ── 1. backtest predictions ──
    rows = []
    for cut in sorted(set(CUTOFFS) | set(RECENT_CUTOFFS)):
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        P = ConvergenceModel().fit(tr).predict_frame(te)
        for i, r in te.iterrows():
            for t in TECH:
                rows.append({"cutoff": cut, "in_standard_set": cut in CUTOFFS, "in_recent_set": cut in RECENT_CUTOFFS,
                             "state": r.State, "zone": r.Zone, "source": NAME[t], "year": int(r.Year), "horizon": int(r.Year - cut),
                             "actual_mw": round(float(r[t]), 3), "predicted_mw": round(float(P.at[i, t]), 3),
                             "error_mw": round(float(P.at[i, t] - r[t]), 3), "fresh_report_scored": bool(fr.at[i, t])})
    B = pd.DataFrame(rows)
    save(B, "backtest_predictions.csv")

    # ── 2. error summary ──
    out = []
    for set_name, flag in [("standard (2016, 2018, 2020)", "in_standard_set"), ("recent (2020, 2021, 2022)", "in_recent_set")]:
        S = B[B[flag] & B.fresh_report_scored]
        for dim in ["overall", "source", "state", "zone", "horizon"]:
            groups = [("all", S)] if dim == "overall" else S.groupby(dim)
            for key, g in groups:
                act = g.actual_mw.sum()
                out.append({"cutoff_set": set_name, "dimension": dim, "group": key, "scored_rows": len(g),
                            "actual_mw_sum": round(act, 1), "abs_error_mw_sum": round(g.error_mw.abs().sum(), 1),
                            "wape_pct": round(g.error_mw.abs().sum() / act * 100, 2) if act > 0 else None,
                            "signed_error_pct": round(g.error_mw.sum() / act * 100, 2) if act > 0 else None})
    save(pd.DataFrame(out), "error_summary.csv")

    # ── 3. schema, coverage, fresh flags ──
    raw = pd.read_csv(DATA_CSV)
    desc = {"State": ("text", "state or union territory"), "Zone": ("text", "grid region (as in the dataset)"),
            "Year": ("year", "calendar/financial year label of the row"), "Population": ("persons", "population"),
            "GSDP (crore INR)": ("crore INR, constant 2011-12 prices", "gross state domestic product (real); 2011 base-year break and 2024 placeholder fixed in load_data")}
    sch = []
    for c in raw.columns:
        unit, d = desc.get(c, ("MW", "installed capacity, " + c.replace("Installed - ", "")))
        col = raw[c]
        sch.append({"column": c, "dtype": str(col.dtype), "unit": unit, "description": d, "non_null": int(col.notna().sum()),
                    "min": col.min() if col.dtype != object else "", "max": col.max() if col.dtype != object else ""})
    save(pd.DataFrame(sch), "dataset_schema.csv")
    cov = []
    for s, g in df.groupby("State"):
        ys = sorted(g.Year.astype(int))
        miss = [y for y in range(ys[0], ys[-1] + 1) if y not in ys]
        cov.append({"state": s, "zone": zone_of[s], "first_year": ys[0], "last_year": ys[-1], "years_present": len(ys),
                    "missing_years": " ".join(map(str, miss))})
    save(pd.DataFrame(cov), "year_coverage.csv")
    fl = []
    for i, r in df.iterrows():
        for t in TECH:
            fl.append({"state": r.State, "year": int(r.Year), "source": NAME[t], "value_mw": round(float(r[t]), 6),
                       "flag": "fresh" if fr.at[i, t] else "stale (repeat of previous year)"})
    F = pd.DataFrame(fl)
    save(F, "fresh_flags.csv")
    fs = []
    for (s, src), g in F.groupby(["state", "source"]):
        fresh = g[g.flag == "fresh"]
        fs.append({"state": s, "source": src, "years": len(g), "fresh_values": len(fresh),
                   "fresh_share_pct": round(len(fresh) / len(g) * 100, 1), "last_fresh_year": int(fresh.year.max()) if len(fresh) else None,
                   "stale_years_since_2020": " ".join(map(str, g[(g.flag != "fresh") & (g.year >= 2020)].year))})
    save(pd.DataFrame(fs), "fresh_summary.csv")

    # ── 4. growth equation ──
    co = []
    for t in TECH:
        p = M.params[t]
        v1 = p.get("dynamics") == "v1"
        co.append({"source": NAME[t], "dynamics": "v1 GSDP elasticity" if v1 else ("held flat" if not p["alpha"] else "v2 convergence"),
                   # bio-mass and small hydro run on v1 dynamics: their v2 coefficients are fitted but not used
                   "trend_now_a_ref_log_per_yr": None if v1 else round(p["a_ref"], 4), "gsdp_beta": None if v1 else round(p["beta"], 4),
                   "catchup_kappa": None if v1 else round(p["kappa"], 4), "transmission_gamma": None if v1 else round(p.get("gamma", 0.0), 4), "v1_elasticity": round(p.get("v1_elasticity", np.nan), 4) if v1 else None,
                   "v1_decay_per_yr": round(p.get("v1_decay", np.nan), 4) if v1 else None, "fresh_pairs_fitted": p["n_pairs"]})
    C = pd.DataFrame(co)
    C.insert(1, "equation", "v2: dlog1p(MW)/yr = trend(year) + beta*dlog(GSDP) + kappa*clip(log((zone MW/GSDP + 1)/(state MW/GSDP + 1)), -4, 4) + gamma*transmission index; "
                            "trend(y>2024) = a_ref*0.5^((y-2024)/4); v1: log(MW/MW2024) = b*sum_s e^(-lam*s)*dlog(GSDP)")
    save(C, "growth_coefficients.csv")
    ye = [{"source": NAME[t], "year": int(y), "alpha_log_growth": round(v, 4)} for t in TECH for y, v in sorted(M.params[t]["alpha"].items())]
    save(pd.DataFrame(ye), "year_effects.csv")
    k = []
    add = lambda name, val, unit, where, note="": k.append({"constant": name, "value": val, "unit": unit, "where": where, "note": note})  # noqa: E731
    for f in ["min_mw", "trend_years", "half_life", "max_gap", "ridge", "min_pairs", "tx_col", "tx_fit", "gap_floor", "fit_weight_power", "nowcast_techs", "v1_techs", "tx_techs"]:
        add(f, getattr(M, f), "", "model/convergence_model.py ConvergenceModel")
    add("EPS", EPS, "MW per lakh crore", "model/convergence_model.py", "floor inside the catch-up log ratio")
    add("END_YEAR", END_YEAR, "year", "model/convergence_model.py", "zone paths simulated to this year")
    for f in ["window", "span", "min_mw", "decay_points", "max_decay", "min_estimates"]:
        add("v1." + f, getattr(ElasticityModel(), f), "", "model/re_model.py ElasticityModel", "used for bio-mass and small hydro")
    for f in ["BASE_YEAR", "EXCLUDE", "TREND_FROM", "SHRINK", "CAP", "HALF_LIFE", "NOMINAL_GDP_2024", "USD_INR_TODAY", "RATE_YEAR",
              "INR_DEPRECIATION", "US_INFLATION", "INFLATION", "VIKSIT_USD_2047"]:
        add("gsdp." + f, getattr(gp, f), "", "model/gsdp_projection.py")
    add("gsdp.k_current_price_factor_2024", round(api.PROJ.k, 4), "x", "model/gsdp_projection.py", "official nominal GDP 2024-25 / dataset real 2024")
    for o in gp.SCENARIOS:
        add(f"outlook.{o}.real_growth", gp.SCENARIOS[o]["short"], "% a year", "model/gsdp_projection.py", gp.SCENARIOS[o]["note"])
    add("POP_GROWTH", POP_GROWTH, "per year", "src/App.jsx, model/features.py", "population is not a model input; per-person figures only")
    add("hours_per_year", 8760, "h", "backend_api.py", "generation = MW x 8760 x CUF")
    add("co2_factor", 820, "g CO2 per kWh", "backend_api.py", "CO2 avoided")
    for z, v in api.ZONE_MULTIPLIERS.items():
        add(f"zone_capex_multiplier.{z}", v, "x", "backend_api.py")
    add("fresh_mask.tolerance", True, "", "model/re_model.py", "float32 copies of last year's value count as repeats")
    save(pd.DataFrame(k), "constants.csv")

    # ── 5. nowcast for stale states ──
    nc = []
    for s, v in M.states.items():
        for t in TECH:
            ay, amw = v["anchor"][t]
            if ay >= M.base_year or M._is_v1(t) or amw <= 0:
                continue
            h = M.history[s]
            nc.append({"state": s, "zone": v["zone"], "source": NAME[t], "last_fresh_year": ay, "last_reported_mw": round(amw, 2),
                       **{f"reported_{y}_mw": round(h[y][t], 2) if y in h else None for y in (2022, 2023, 2024)},
                       **{f"nowcast_{y}_mw": round(v["nowcast"].get(y, {}).get(t, h.get(y, {}).get(t, np.nan)), 2) for y in (2022, 2023, 2024)},
                       "nowcast_minus_reported_2024_mw": round(v["nowcast"][2024][t] - h[2024][t], 2)})
    save(pd.DataFrame(nc).sort_values(["source", "nowcast_minus_reported_2024_mw"], ascending=[True, False]), "nowcast_stale_states.csv")

    # ── 6. GSDP and population projections ──
    gr = []
    for s in sorted(M.states):
        v = M.states[s]
        for o in gp.SCENARIOS:
            row = {"state": s, "zone": v["zone"], "outlook": gp.SCENARIOS[o]["label"],
                   "avg_real_growth_2024_47_pct": round(api.PROJ.cagr(s, 2047, o) * 100, 2)}
            for y in (2024, 2030, 2047):
                real = api.PROJ.gsdp(s, y, o)
                row[f"gsdp_{y}_real_lakh_cr"] = round(real / 1e5, 3)
                row[f"gsdp_{y}_current_lakh_cr"] = round(real * api.PROJ.nominal_factor(y) / 1e5, 3)
                row[f"population_{y}_crore"] = round(v["population"] * (1 + POP_GROWTH) ** (y - 2024) / 1e7, 3)
            gr.append(row)
    save(pd.DataFrame(gr), "gsdp_population_projection.csv")

    # ── 7. ablations ──
    variants = {
        "production": lambda: ConvergenceModel(),
        "no transmission term": lambda: ConvergenceModel(tx_col=None),
        "no catch-up term (kappa=0)": zeroed(no_catchup),
        "no GSDP term (beta=0, v1 elasticity=0)": zeroed(no_gsdp),
        "no nowcast (trust repeated values)": lambda: ConvergenceModel(nowcast_techs=[]),
        "v2 dynamics for bio-mass and small hydro too": lambda: ConvergenceModel(v1_techs=[]),
        "transmission fitted jointly": lambda: ConvergenceModel(tx_fit="joint"),
        "trend half-life 3 years": lambda: ConvergenceModel(half_life=3),
        "trend half-life 5 years": lambda: ConvergenceModel(half_life=5),
        "nowcast every v2 source (previous)": lambda: ConvergenceModel(nowcast_techs=None),
    }
    ab = []
    cut_all = sorted(set(CUTOFFS) | set(RECENT_CUTOFFS))
    res = {}
    for cut in cut_all:
        tr, te = df[df.Year <= cut], df[df.Year > cut]
        te = te[te.State.isin(tr.State)]
        f = fr.loc[te.index]
        for name, mk in variants.items():
            res[(name, cut)] = score(mk().fit(tr).predict_frame(te), te, f)
        res[("naive: no new capacity", cut)] = score(naive(tr, te), te, f)
        res[("v1 GSDP elasticity model only", cut)] = score(ElasticityModel().fit(tr).predict_frame(te), te, f)
    for name in list(variants) + ["v1 GSDP elasticity model only", "naive: no new capacity"]:
        row = {"variant": name}
        for cut in cut_all:
            row[f"wape_cutoff_{cut}"] = round(res[(name, cut)]["Total WAPE (fresh)"], 2)
        std = np.mean([res[(name, c)]["Total WAPE (fresh)"] for c in CUTOFFS])
        rec = np.mean([res[(name, c)]["Total WAPE (fresh)"] for c in RECENT_CUTOFFS])
        row.update({"mean_standard": round(std, 2), "mean_recent": round(rec, 2), "mean_both": round((std + rec) / 2, 2),
                    **{f"solar_wape_standard": round(np.mean([res[(name, c)]["Solar Power"] for c in CUTOFFS]), 2),
                       f"wind_wape_standard": round(np.mean([res[(name, c)]["Wind Power"] for c in CUTOFFS]), 2)}})
        ab.append(row)
    A = pd.DataFrame(ab)
    A["delta_vs_production_both"] = (A.mean_both - A.loc[A.variant == "production", "mean_both"].iloc[0]).round(2)
    save(A, "ablations.csv")

    # ── 8. national capacity and capacity factors ──
    na = []
    for o in gp.SCENARIOS:
        r = api.scenario(api.ScenarioReq(scope="india", year=2047, outlook=o))
        for y, row in zip(r["trajectory"]["years"], r["trajectory"]["mw"]):
            rec = {"outlook": gp.SCENARIOS[o]["label"], "year": y}
            gen = 0.0
            for kk, mw in zip(api.KEYS, row):
                rec[f"{kk}_gw"] = round(mw / 1000, 2)
                g = mw * 8760 * api.COST_BENCHMARKS[kk]["cuf"] / 1e6
                rec[f"{kk}_twh"] = round(g, 1); gen += g
            rec["total_gw"] = round(sum(row) / 1000, 2); rec["total_twh"] = round(gen, 1)
            na.append(rec)
    save(pd.DataFrame(na), "national_capacity.csv")
    save(pd.DataFrame([{"source": NAME[t], "capacity_factor_cuf": api.COST_BENCHMARKS[SRC[t]]["cuf"],
                        "capex_cr_per_mw": api.COST_BENCHMARKS[SRC[t]]["capex_cr_per_mw"],
                        "lcoe_inr_per_kwh": api.COST_BENCHMARKS[SRC[t]]["lcoe_inr_per_kwh"],
                        "source_of_values": "CERC / MNRE benchmarks shipped with the original pipeline (backend_api.py COST_BENCHMARKS)"} for t in TECH]),
         "capacity_factors.csv")

    # ── 9. data fixes ──
    fixes = [
        ("Stale repeats excluded", "applied", "Only 34% of values change from the year before; 19 states repeat 2022 values in 2023-24",
         "Repeated values are not used for fitting or scoring (fresh_mask)", "model/re_model.py fresh_mask"),
        ("Nowcast for stale states", "applied", "Frozen states kept building (e.g. Rajasthan built 2,100 km of renewable transmission lines in FY23-24)",
         "v2 sources (solar, wind) are rolled forward from the last fresh report to 2024 with the fitted growth equation", "model/convergence_model.py _nowcast"),
        ("GSDP 2011 base-year break", "applied", "Every state jumps ~2.2x in 2011 (2004-05 to 2011-12 base)",
         "Pre-2011 values rescaled so 2010->2011 growth equals the state's median 2012-2015 growth", "model/re_model.py splice_gsdp"),
        ("GSDP 2024 placeholder", "applied", "Every state shows -0.2% in 2024",
         "2024 = 2023 x exp(mean log growth of the previous 3 years)", "model/re_model.py impute_placeholder_gsdp"),
        ("GSDP units", "applied", "India 2023 total Rs 162 lakh crore matches official real GDP at 2011-12 prices",
         "Model kept in real terms; dashboard converts to current prices (x1.95 x inflation)", "model/gsdp_projection.py"),
        ("Missing years", "applied", "e.g. Telangana 2013 has no row", "GSDP log-interpolated between neighbouring years", "model/convergence_model.py _gsdp"),
        ("Small starting values", "applied", "Changes from near zero (e.g. 0 -> 5 MW) look like huge growth rates",
         "Fitting pairs starting below 10 MW are ignored", "model/convergence_model.py min_mw"),
        ("Capacity drops", "applied", "e.g. Bihar solar 390 -> 239 MW (2024), Meghalaya hydro -> 0 (2022)",
         "Forecasts never decrease", "model/convergence_model.py _step"),
        ("Float32 copies counted as new reports", "applied", "Rajasthan solar 12564.87 (2021) -> 12564.867188 (2022-24); 59 such copies, 52 in 2022",
         "fresh_mask(tolerance=True) treats changes <= 0.01 MW / 1 ppm as repeats; average backtest error 29.6% -> 26.7% (reports/error_fixes/step4)", "model/re_model.py; model/experiments/frozen_data.py"),
        ("Wind/bio-mass/small hydro repeats are real pauses", "applied", "After a run of repeats the next report jumps 3.4x a normal year for solar but 0.4-0.8x for the others",
         "nowcast_techs=['Solar Power'] fills stale years for solar only; with the copy fix and a 4-year trend half-life, error 26.1% (reports/error_fixes/step_combined)", "model/convergence_model.py nowcast_techs"),
        ("Demand data gaps", "applied (demand model)", "25 missing days; some days built from < 100 readings",
         "Filled from total generation (within 1% of demand) or interpolation; never scored", "demand_forecast/data.py"),
    ]
    save(pd.DataFrame(fixes, columns=["fix", "status", "evidence", "what_was_done", "code"]), "data_fixes.csv")
    return B, A


if __name__ == "__main__":
    main()
