"""Generation-mix pathways to 2047: fitted S-curves for solar and wind, anchored to the government's generation plan.

Challenge rule: only energy generated is used. No installed-capacity or consumption data enters any fit, anchor or
comparison. Government goals stated in GW (500 GW non-fossil by 2030, 100 GW nuclear by 2047, 1,800 GW non-fossil by
2047) are capacity targets and are NOT used.

What is fitted (generation shares, FY2019-FY2026, data/processed/generation_national.csv)
  solar and wind  logistic S-curves   share(t) = L / (1 + exp(-k (t - t0)));  k and t0 least-squares fitted to each
                  source's share of national generation. The ceiling L (the share the grid can absorb) is not in the
                  data: it is an explicit assumption per pathway.
  everything else linear paths between anchors (below); coal is the remainder.

Government goals that ARE denominated in generation (anchors for FY2029-30 = "2030")
  CEA, Optimal Generation Capacity Mix for 2029-30 (Version 2.0, 2023), gross generation 2,440.7 BU:
      thermal 1,364.5 BU (55.9%), nuclear 92.2 BU (3.8%), hydro 222.5 BU (9.1%), other renewables 761.5 BU (31.2%)
  The levels are not used (they follow CEA's demand projection); the SHARES are.
  Context only (not used): CEA National Electricity Plan 2022-32 puts renewables at about 45% of generation in 2031-32,
  and the government aims at 50% of energy from renewables by 2030.

Pathways
  trend        S-curve fit on history only (no 2030 anchor); nuclear, hydro and gas continue their recent shares
  balanced     (default) meets the CEA 2029-30 generation shares in FY2030, then continues the fitted S-curves
  accelerated  same 2030 anchor, higher solar and wind ceilings, more nuclear

Outputs: updates "mixes" in public/generation_forecast.json (national path for every year, regional split with the
existing region weights), and writes reports/generation/mix_pathways.csv and mix_goal_check.csv.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parents[2]
JSON = ROOT / "public/generation_forecast.json"
OUT = ROOT / "reports/generation"
BASE, END = 2026, 2047
SOURCES = ["coal", "gas", "nuclear", "hydro", "small_hydro", "solar", "wind", "bio", "waste"]

# CEA Optimal Generation Capacity Mix 2029-30 (V2.0): shares of gross generation
CEA_2030 = {"thermal": 1364.5 / 2440.7, "nuclear": 92.2 / 2440.7, "hydro": 222.5 / 2440.7, "other_re": 761.5 / 2440.7}

PATHWAYS = {
    "balanced": {
        "label": "Government plan (CEA 2030)",
        "anchor": True, "solar_L": 0.40, "wind_L": 0.14,
        "nuclear_2047": 0.08, "hydro_2047": 0.075, "gas_2047": 0.02, "small_other_2047": 0.030,
    },
    "accelerated": {
        "label": "Accelerated clean",
        "anchor": True, "solar_L": 0.50, "wind_L": 0.18,
        "nuclear_2047": 0.11, "hydro_2047": 0.085, "gas_2047": 0.02, "small_other_2047": 0.030,
    },
    "trend": {
        "label": "Current trends",
        "anchor": False, "solar_L": 0.40, "wind_L": 0.14,
        "nuclear_2047": None, "hydro_2047": None, "gas_2047": None, "small_other_2047": None,
    },
}


def history():
    n = pd.read_csv(ROOT / "data/processed/generation_national.csv", index_col=0).loc[2019:BASE]
    n["hydro_all"] = n.hydro + n.small_hydro
    n["bio_waste"] = n.bio + n.waste
    sh = n[["coal", "gas", "nuclear", "hydro", "small_hydro", "solar", "wind", "bio", "waste", "hydro_all", "bio_waste", "total"]]
    return sh.div(sh.total, axis=0), n


def logistic(t, L, k, t0):
    return L / (1 + np.exp(-k * (t - t0)))


def fit_logistic(years, share, L, extra=None, w_extra=4.0):
    """Least-squares k, t0 for a fixed ceiling L; extra = (year, share) anchor point with extra weight."""
    yrs = np.asarray(years, float)
    y = np.asarray(share, float)
    ex = extra

    def resid(p):
        k, t0 = p
        r = logistic(yrs, L, k, t0) - y
        if ex is not None:
            r = np.r_[r, w_extra * (logistic(ex[0], L, k, t0) - ex[1])]
        return r

    best = None
    for k0 in (0.1, 0.2, 0.35):
        for t00 in (2028, 2034, 2040):
            s = least_squares(resid, [k0, t00], bounds=([0.02, 2010], [1.5, 2080]))
            if best is None or s.cost < best.cost:
                best = s
    return best.x[0], best.x[1], float(np.sqrt(2 * best.cost / (len(yrs) + (ex is not None))))


def anchors(path, hist, h26):
    """Shares by year for one pathway. Returns DataFrame years x sources (fractions)."""
    P = PATHWAYS[path]
    yrs = np.arange(2019, BASE + 1)
    T = np.arange(BASE, END + 1)
    sol_t = fit_logistic(yrs, hist.loc[yrs, "solar"], P["solar_L"])
    win_t = fit_logistic(yrs, hist.loc[yrs, "wind"], P["wind_L"])
    sol_tr = logistic(2030, P["solar_L"], *sol_t[:2])
    win_tr = logistic(2030, P["wind_L"], *win_t[:2])
    info = {"trend_fit_solar": sol_t, "trend_fit_wind": win_t}
    if P["anchor"]:
        small_other_2030 = h26["small_hydro"] + h26["bio_waste"] + (P["small_other_2047"] - (h26["small_hydro"] + h26["bio_waste"])) * (2030 - BASE) / (END - BASE)
        # CEA's "other renewables" excludes hydro; treat small hydro with hydro, so the anchor covers solar + wind + bio + waste
        bw_2030 = h26["bio_waste"] + (P["small_other_2047"] - h26["small_hydro"] - h26["bio_waste"]) * 0.5 * (2030 - BASE) / (END - BASE)
        sw_target = CEA_2030["other_re"] - bw_2030
        split = sol_tr / (sol_tr + win_tr)
        sol = fit_logistic(yrs, hist.loc[yrs, "solar"], P["solar_L"], (2030, sw_target * split))
        win = fit_logistic(yrs, hist.loc[yrs, "wind"], P["wind_L"], (2030, sw_target * (1 - split)))
    else:
        sol, win = sol_t, win_t
    info["fit_solar"], info["fit_wind"] = sol, win
    out = pd.DataFrame(index=T, columns=SOURCES, dtype=float)
    out["solar"] = logistic(T, P["solar_L"], *sol[:2])
    out["wind"] = logistic(T, P["wind_L"], *win[:2])
    # keep the S-curves continuous with the FY2026 actual share
    for c in ("solar", "wind"):
        out[c] = out[c] + (h26[c] - out.loc[BASE, c]) * np.exp(-0.35 * (T - BASE))
    x = (T - BASE) / (END - BASE)

    def glide(a, b):
        return a + (b - a) * x

    if P["anchor"]:
        def piece(v26, v30, v47):
            return np.where(T <= 2030, v26 + (v30 - v26) * (T - BASE) / (2030 - BASE), v30 + (v47 - v30) * (T - 2030) / (END - 2030))
        nuc = piece(h26["nuclear"], CEA_2030["nuclear"], P["nuclear_2047"])
        hyd_all = piece(h26["hydro_all"], CEA_2030["hydro"], P["hydro_2047"])
        sm = h26["small_hydro"] / h26["hydro_all"]
        out["nuclear"] = nuc
        out["hydro"] = hyd_all * (1 - sm)
        out["small_hydro"] = hyd_all * sm
        bw = glide(h26["bio_waste"], P["small_other_2047"] - h26["small_hydro"])
        bw = np.maximum(bw, h26["bio_waste"])
        out["bio"] = bw * (h26["bio"] / h26["bio_waste"])
        out["waste"] = bw * (h26["waste"] / h26["bio_waste"])
        out["gas"] = glide(h26["gas"], P["gas_2047"])
    else:
        yrs8 = np.arange(2019, BASE + 1)
        for c in ("nuclear", "hydro", "small_hydro", "bio", "waste"):
            slope = np.polyfit(yrs8, hist.loc[yrs8, c], 1)[0]          # recent share trend, carried on at half speed
            if slope >= 0:
                out[c] = h26[c] + 0.5 * slope * (T - BASE)
            else:
                # Exponential share decay (same initial slope at BASE, never drags absolute TWh into a late-horizon crash)
                r = max(0.5 * slope / max(h26[c], 1e-6), -0.040)
                out[c] = h26[c] * np.exp(r * (T - BASE))
        out["gas"] = h26["gas"]
    out["coal"] = 1 - out.drop(columns="coal").sum(axis=1)
    return out, info


def main(write=True):
    hist, raw = history()
    h26 = hist.loc[BASE]
    J = json.load(open(JSON))
    results, notes, check = {}, {}, []
    for path in PATHWAYS:
        sh, info = anchors(path, hist, h26)
        results[path] = sh
        s30 = sh.loc[2030]
        check.append(dict(pathway=path, fy=2030,
                          thermal=s30.coal + s30.gas, nuclear=s30.nuclear, hydro=s30.hydro + s30.small_hydro,
                          other_re=s30.solar + s30.wind + s30.bio + s30.waste,
                          cea_thermal=CEA_2030["thermal"], cea_nuclear=CEA_2030["nuclear"], cea_hydro=CEA_2030["hydro"], cea_other_re=CEA_2030["other_re"]))
        print(f"\n{path}: fit solar k={info['fit_solar'][0]:.3f} t0={info['fit_solar'][1]:.1f} rmse={info['fit_solar'][2]*100:.2f}pt | wind k={info['fit_wind'][0]:.3f} t0={info['fit_wind'][1]:.1f} rmse={info['fit_wind'][2]*100:.2f}pt")
        print((sh.loc[[2026, 2030, 2035, 2040, 2047]] * 100).round(1).to_string())
    pd.DataFrame(check).round(4).to_csv(OUT / "mix_goal_check.csv", index=False)

    # backtest the S-curve idea: fit FY2019-2023, predict FY2024-2026 solar+wind share, vs holding the last share
    rows = []
    for o in (2022, 2023):
        yrs = np.arange(2019, o + 1)
        for c, L in (("solar", 0.40), ("wind", 0.14)):
            k, t0, _ = fit_logistic(yrs, hist.loc[yrs, c], L)
            for t in range(o + 1, BASE + 1):
                rows.append(dict(origin=o, source=c, fy=t, actual=hist.loc[t, c], scurve=logistic(t, L, k, t0), hold_last=hist.loc[o, c]))
    bt = pd.DataFrame(rows)
    mae = lambda a, b: float((bt[a] - bt[b]).abs().mean() * 100)
    print("\nbacktest solar+wind share, mean abs error (points): S-curve", round(mae("scurve", "actual"), 2), "hold last", round(mae("hold_last", "actual"), 2))
    bt.to_csv(OUT / "mix_backtest.csv", index=False)
    if not write:
        return

    # ---- write into the forecast file
    regions = J["meta"]["regions"]
    rows_csv = []
    for o in J["outlooks"]:
        tot = {BASE: J["history"]["national"][str(BASE)]["total"], **{int(t): v["p50"] for t, v in J["outlooks"][o]["national"].items()}}
        for path, sh in results.items():
            key = f"{o}|{path}"
            X = J["mixes"][key]
            nat = {}
            for t in range(BASE, END + 1):
                nat[str(t)] = {s: round(float(sh.loc[t, s] * tot[t]), 1) for s in SOURCES}
                rows_csv.append(dict(outlook=o, pathway=path, fy=t, total_twh=round(tot[t], 1), **{s: round(float(sh.loc[t, s] * 100), 2) for s in SOURCES}))
            X["national"] = nat
            # regional milestone years from the existing weights: base + national change x weight (falling sources shrink pro rata)
            for r in regions:
                for t in (2030, 2035, 2040, 2047):
                    base = X["regional"][r][str(BASE)]
                    cell = {}
                    for s in SOURCES:
                        n0, n1 = nat[str(BASE)][s], nat[str(t)][s]
                        d = n1 - n0
                        cell[s] = round(base[s] + d * X["weights"][s][r], 1) if d >= 0 else round(base[s] * n1 / n0 if n0 else 0, 1)
                    X["regional"][r][str(t)] = cell
    J["meta"]["mixes"] = {}
    for path, sh in results.items():
        P = PATHWAYS[path]
        s47 = {s: round(float(sh.loc[END, s] * 100), 1) for s in SOURCES}
        note = ({"balanced": "Solar and wind follow S-curves fitted to FY2019-26 generation shares and meet CEA's 2029-30 generation plan "
                             "(thermal 56%, nuclear 3.8%, hydro 9.1%, other renewables 31%) in FY2030. After 2030 the S-curves continue to "
                             "ceilings of 40% solar and 14% wind. Nuclear reaches 8% and hydro eases to 7.5% by 2047 (assumptions: the "
                             "nuclear and hydro goals are stated in GW, which this model does not use).",
                 "accelerated": "Same 2030 anchor as the government plan, then higher ceilings (50% solar, 18% wind) and nuclear at 11% "
                                "by 2047. Needs large storage and inter-regional transmission.",
                 "trend": "Solar and wind S-curves fitted to FY2019-26 only, with no government anchor (ceilings 40% and 14%); nuclear, "
                          "hydro and gas keep their recent trend. Falls short of CEA's 2030 generation plan."}[path])
        J["meta"]["mixes"][path] = {"label": P["label"], "note": note, "shares_2047": s47}
    J["meta"]["mix_model"] = {
        "method": "Logistic S-curves for solar and wind fitted on FY2019-26 generation shares; ceilings are assumptions; "
                  "nuclear, hydro, gas and bio-waste follow anchored linear paths; coal is the remainder.",
        "goals_used": "CEA Optimal Generation Capacity Mix 2029-30 (V2.0, 2023): generation shares thermal 55.9%, nuclear 3.8%, hydro 9.1%, other renewables 31.2%.",
        "goals_not_used": "Capacity targets (500 GW non-fossil by 2030, 100 GW nuclear and 1,800 GW non-fossil by 2047) are installed-capacity measures and are excluded by the challenge rule.",
        "backtest_share_mae_points": {"s_curve": round(mae("scurve", "actual"), 2), "hold_last": round(mae("hold_last", "actual"), 2)},
    }
    with open(JSON, "w") as f:
        json.dump(J, f, separators=(",", ":"))
    pd.DataFrame(rows_csv).to_csv(OUT / "mix_pathways.csv", index=False)
    print("\nwrote forecast file and CSVs")


if __name__ == "__main__":
    main(write="--write" in sys.argv)
