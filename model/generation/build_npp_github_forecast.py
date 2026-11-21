"""Rebuild public/generation_forecast.json using ONLY:
  1. National Power Portal (NPP / CEA) electricity generation data (data/processed/generation_*.csv)
  2. GitHub renewable-india-dataset CSV (data/raw/renewable_energy_dataset.csv) for Population & GSDP

Zero external third-party datasets:
  - No UN WPP 2024 population (projected directly from renewable_energy_dataset.csv)
  - No Census 2011 / World Bank urbanization (gamma = 0)
  - No World Bank / IMF / external MoSPI GDP outlooks (only Dataset trend + optional Viksit Bharat)

Challenge rule: only energy generated (TWh/GWh) is used; no installed capacity or consumption.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import HuberRegressor

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "model"))
sys.path.insert(0, str(HERE))

from re_model import load_data  # noqa: E402
from gsdp_projection import GsdpProjector, SCENARIOS  # noqa: E402
import mix_model  # noqa: E402

JSON_PATH = ROOT / "public/generation_forecast.json"
OUT_DIR = ROOT / "reports/generation"
BASE, END = 2026, 2047
SOURCES = ["coal", "gas", "nuclear", "hydro", "small_hydro", "solar", "wind", "bio", "waste"]
OUTLOOKS = ["dataset", "viksit"]
WASTE_CAP = 0.45
RIDGE_LAM = 0.002  # mild L2 shrinkage selected via rolling CV (FY2013-FY2021)

REGION = {
    "Chandigarh": "North", "Delhi": "North", "Haryana": "North", "Himachal Pradesh": "North",
    "Jammu And Kashmir": "North", "Punjab": "North", "Rajasthan": "North", "Uttar Pradesh": "North",
    "Uttarakhand": "North", "Chhattisgarh": "West", "Gujarat": "West", "Madhya Pradesh": "West",
    "Maharashtra": "West", "Goa": "West", "Andhra Pradesh": "South", "Telangana": "South",
    "Karnataka": "South", "Kerala": "South", "Tamil Nadu": "South", "Puducherry": "South",
    "Lakshadweep": "South", "Andaman And Nicobar Islands": "East", "Bihar": "East", "Jharkhand": "East",
    "Odisha": "East", "Sikkim": "East", "West Bengal": "East", "Arunachal Pradesh": "North-East",
    "Assam": "North-East", "Manipur": "North-East", "Meghalaya": "North-East", "Mizoram": "North-East",
    "Nagaland": "North-East", "Tripura": "North-East",
}


def build_github_drivers():
    """State, regional, and national Population & Real GSDP strictly from data/raw/renewable_energy_dataset.csv.
    Dataset Year Y maps to FY Y+1 (so 2006 -> FY2007, 2024 -> FY2025, 2025 -> FY2026, ..., 2046 -> FY2047).
    """
    df = load_data()
    states = sorted(REGION.keys())

    # Complete state x year tables (fill single-year missing Telangana 2013 by linear interpolation, early UTs by bfill)
    pop_raw = df.pivot(index="Year", columns="State", values="Population").reindex(columns=states).sort_index()
    pop_raw = pop_raw.interpolate(limit_area="inside").bfill().ffill()
    gsdp_raw = df.pivot(index="Year", columns="State", values="GSDP").reindex(columns=states).sort_index()
    gsdp_raw = gsdp_raw.interpolate(limit_area="inside").bfill().ffill()

    # Project each state's population forward from 2024 to 2046 using its recent 3-year rate (2021-2024),
    # with gentle demographic deceleration (half-life 30 yrs, reflecting the CSV's own slowdown 1.48% -> 0.90%).
    pop_full = pop_raw.copy()
    r_state = (pop_raw.loc[2024] / pop_raw.loc[2021]) ** (1.0 / 3.0) - 1.0
    r_state = r_state.clip(lower=0.0, upper=0.025)
    for y in range(2025, END):
        decay = 0.5 ** ((y - 2025) / 30.0)
        pop_full.loc[y] = pop_full.loc[y - 1] * (1.0 + r_state * decay)

    # Shift Year -> FY (Y + 1) so FY2007..FY2047
    P = pop_full.copy()
    P.index = P.index + 1

    # GSDP projections for dataset & viksit strictly from the CSV's GSDP history
    proj = GsdpProjector({s: gsdp_raw[s].to_dict() for s in states}, 2024)
    Y = {}
    for o in OUTLOOKS:
        path = proj.paths[o][states]
        full = pd.concat([gsdp_raw.loc[2006:2024], path.loc[path.index > 2024]])
        full.index = full.index + 1
        Y[o] = full.loc[2007:END]

    return P.loc[2007:END], Y, proj


def fit_beta(dYpc: np.ndarray, dGpc: np.ndarray, lam: float = RIDGE_LAM) -> float:
    return float(np.dot(dYpc, dGpc) / (np.dot(dYpc, dYpc) + lam))


def main():
    J = json.load(open(JSON_PATH))
    hn = pd.read_csv(ROOT / "data/processed/generation_national.csv").set_index("fy")
    hr = pd.read_csv(ROOT / "data/processed/generation_regional.csv")
    hs = pd.read_csv(ROOT / "data/processed/generation_state.csv")

    P, Y, proj = build_github_drivers()
    nat_p = P.sum(axis=1)
    nat_y = Y["dataset"].sum(axis=1)

    # 1. Fit national generation elasticity strictly on NPP generation + GitHub CSV Population & GSDP (FY2008..FY2026)
    rows = []
    for fy in range(2008, BASE + 1):
        dG = float(np.log(hn.loc[fy, "total"] / hn.loc[fy - 1, "total"]))
        dP = float(np.log(nat_p.loc[fy] / nat_p.loc[fy - 1]))
        dY = float(np.log(nat_y.loc[fy] / nat_y.loc[fy - 1]))
        rows.append(dict(fy=fy, total=float(hn.loc[fy, "total"]), dG=dG, dP=dP, dGpc=dG - dP, dYpc=dY - dP))
    pnl = pd.DataFrame(rows).set_index("fy")

    X = pnl["dYpc"].values
    y = pnl["dGpc"].values
    beta = fit_beta(X, y)
    resid = y - beta * X
    sigma = float(np.sqrt(np.sum(resid ** 2) / (len(y) - 1)))
    beta_se = float(sigma / np.sqrt(np.dot(X, X)))
    r2 = float(1.0 - np.sum(resid ** 2) / np.sum((y - y.mean()) ** 2))
    print(f"Pure NPP + GitHub fit (FY2008-FY2026, n={len(y)}): beta={beta:.3f} ± {beta_se:.3f}, sigma={sigma:.4f}, R2={r2:.3f}")

    # 2. National rolling backtest (FY2013..FY2021, 1-5 years ahead)
    bt_rows = []
    for orig in range(2013, 2022):
        tr = pnl.loc[pnl.index <= orig]
        b = fit_beta(tr["dYpc"].values, tr["dGpc"].values)
        g5 = float(np.log(hn.loc[orig, "total"] / hn.loc[orig - 5, "total"]) / 5.0)
        gh = gn = float(hn.loc[orig, "total"])
        for h in range(1, 6):
            fy = orig + h
            if fy not in pnl.index:
                break
            r = pnl.loc[fy]
            gh *= float(np.exp(r["dP"] + b * r["dYpc"]))
            gn *= float(np.exp(g5))
            act = float(r["total"])
            bt_rows.append(dict(
                origin=orig, fy=fy, horizon=h, actual=act,
                model=gh, naive_trend=gn,
                model_err=(gh - act) / act, naive_trend_err=(gn - act) / act,
            ))
    bt_df = pd.DataFrame(bt_rows)
    bt_df.to_csv(OUT_DIR / "backtest_national.csv", index=False)
    mape_m = round(float(bt_df["model_err"].abs().mean() * 100), 1)
    mape_n = round(float(bt_df["naive_trend_err"].abs().mean() * 100), 1)
    bias_m = round(float(bt_df["model_err"].mean() * 100), 1)
    bias_n = round(float(bt_df["naive_trend_err"].mean() * 100), 1)
    by_h = {
        str(int(h)): {
            "model": round(float(g["model_err"].abs().mean() * 100), 1),
            "naive_trend": round(float(g["naive_trend_err"].abs().mean() * 100), 1),
        }
        for h, g in bt_df.groupby("horizon")
    }
    print(f"National rolling backtest: model={mape_m}% (bias {bias_m}%) vs naive={mape_n}% | by_h={by_h}")

    # 3. Regional backtest (FY2020..FY2025 from FY2019 actuals)
    regions = J["meta"]["regions"]
    reg_tot = hr.groupby(["fy", "region"])["gwh"].sum().unstack().reindex(columns=regions)
    reg_p = pd.DataFrame({r: P[[s for s, rr in REGION.items() if rr == r]].sum(axis=1) for r in regions})
    reg_y_ds = pd.DataFrame({r: Y["dataset"][[s for s, rr in REGION.items() if rr == r]].sum(axis=1) for r in regions})

    reg_bt_rows = []
    lv = np.log(reg_tot.loc[2019].astype(float))
    sh19 = reg_tot.loc[2019] / reg_tot.loc[2019].sum()
    for fy in range(2020, 2026):
        dP_r = np.log(reg_p.loc[fy] / reg_p.loc[fy - 1])
        dYpc_r = np.log(reg_y_ds.loc[fy] / reg_y_ds.loc[fy - 1]) - dP_r
        lv = lv + dP_r + beta * dYpc_r
        raw = np.exp(lv)
        pred_r = raw / raw.sum() * reg_tot.loc[fy].sum()
        naive_r = sh19 * reg_tot.loc[fy].sum()
        for r in regions:
            reg_bt_rows.append(dict(
                fy=fy, region=r, horizon=fy - 2019,
                actual=float(reg_tot.loc[fy, r]),
                model=float(pred_r[r]), naive_share=float(naive_r[r]),
            ))
    reg_bt = pd.DataFrame(reg_bt_rows)
    reg_bt.to_csv(OUT_DIR / "backtest_regional.csv", index=False)
    reg_wape_m = round(float((reg_bt["model"] - reg_bt["actual"]).abs().sum() / reg_bt["actual"].sum() * 100), 1)
    reg_wape_n = round(float((reg_bt["naive_share"] - reg_bt["actual"]).abs().sum() / reg_bt["actual"].sum() * 100), 1)
    print(f"Regional WAPE (FY2020-25): model={reg_wape_m}% vs naive_share={reg_wape_n}%")

    # 4. National & regional forecasts + Monte Carlo 80% bands (FY2027..FY2047) for dataset & viksit
    rng = np.random.default_rng(42)
    N_MC = 4000
    b_draws = np.clip(rng.normal(beta, beta_se, size=N_MC), 0.1, 1.5)
    eps = rng.normal(0.0, sigma, size=(N_MC, END - BASE))

    g_base_twh = float(hn.loc[BASE, "total"]) / 1000.0
    reg_base_twh = reg_tot.loc[BASE] / 1000.0

    new_outlooks = {}
    for o in OUTLOOKS:
        Yo = Y[o]
        ny = Yo.sum(axis=1)
        reg_yo = pd.DataFrame({r: Yo[[s for s, rr in REGION.items() if rr == r]].sum(axis=1) for r in regions})

        # National p50 + Monte Carlo p10/p90
        dP_fut = np.array([np.log(nat_p.loc[t] / nat_p.loc[t - 1]) for t in range(BASE + 1, END + 1)])
        dYpc_fut = np.array([np.log(ny.loc[t] / ny.loc[t - 1]) - np.log(nat_p.loc[t] / nat_p.loc[t - 1]) for t in range(BASE + 1, END + 1)])

        p50_steps = np.cumsum(dP_fut + beta * dYpc_fut)
        p50_path = g_base_twh * np.exp(p50_steps)

        mc_steps = np.cumsum(dP_fut[None, :] + b_draws[:, None] * dYpc_fut[None, :] + eps, axis=1)
        mc_paths = g_base_twh * np.exp(mc_steps)
        p10_path = np.percentile(mc_paths, 10, axis=0)
        p90_path = np.percentile(mc_paths, 90, axis=0)

        national = {}
        for i, t in enumerate(range(BASE + 1, END + 1)):
            national[str(t)] = {
                "p10": round(float(p10_path[i]), 1),
                "p50": round(float(p50_path[i]), 1),
                "p90": round(float(p90_path[i]), 1),
            }

        # National drivers (FY2008..FY2047)
        india_drv = {}
        for t in range(2008, END + 1):
            india_drv[str(t)] = {
                "pop_m": round(float(nat_p.loc[t] / 1e6), 1),
                "urban": 0.0,
                "gdp_index": round(float(ny.loc[t] / ny.loc[BASE]), 4),
            }

        # Regional need (FY2027..FY2047)
        need_r = {r: {} for r in regions}
        lv_r = np.log(reg_base_twh.astype(float))
        for i, t in enumerate(range(BASE + 1, END + 1)):
            dPr = np.log(reg_p.loc[t] / reg_p.loc[t - 1])
            dYpcr = np.log(reg_yo.loc[t] / reg_yo.loc[t - 1]) - dPr
            lv_r = lv_r + dPr + beta * dYpcr
            raw = np.exp(lv_r)
            scaled = raw / raw.sum() * float(p50_path[i])
            lv_r = np.log(scaled)
            for r in regions:
                need_r[r][str(t)] = round(float(scaled[r]), 1)

        # Regional drivers (milestone years + 2024..2047)
        reg_drv = {r: {} for r in regions}
        for r in regions:
            inc0 = float(reg_yo.loc[BASE, r] / reg_p.loc[BASE, r])
            for t in (2024, 2026, 2030, 2035, 2040, 2047):
                reg_drv[r][str(t)] = {
                    "pop_m": round(float(reg_p.loc[t, r] / 1e6), 2),
                    "urban": 0.0,
                    "gsdp_pc_index": round(float((reg_yo.loc[t, r] / reg_p.loc[t, r]) / inc0), 4),
                }

        sc_meta = SCENARIOS[o]
        new_outlooks[o] = {
            "label": sc_meta["label"],
            "short": sc_meta["short"],
            "note": sc_meta["note"],
            "national": national,
            "need": need_r,
            "india": india_drv,
            "drivers": reg_drv,
        }
        print(f"Outlook {o:8s}: FY2030={national['2030']['p50']} TWh, FY2047={national['2047']['p50']} TWh (80%: {national['2047']['p10']}–{national['2047']['p90']})")

    # 5. Rebuild mixes for dataset & viksit using mix_model S-curves + existing region weights
    hist_sh, _ = mix_model.history()
    h26 = hist_sh.loc[BASE]
    path_shares = {}
    for path in mix_model.PATHWAYS:
        sh, _ = mix_model.anchors(path, hist_sh, h26)
        path_shares[path] = sh

    old_weights = next(iter(J["mixes"].values()))["weights"]
    old_reg_base = {r: J["history"]["regional"][r][str(BASE)] for r in regions}

    new_mixes = {}
    for o in OUTLOOKS:
        tot = {BASE: g_base_twh, **{t: new_outlooks[o]["national"][str(t)]["p50"] for t in range(BASE + 1, END + 1)}}
        for path, sh in path_shares.items():
            nat = {}
            for t in range(BASE, END + 1):
                nat[str(t)] = {s: round(float(sh.loc[t, s] * tot[t]), 1) for s in SOURCES}
            regional = {r: {str(BASE): old_reg_base[r]} for r in regions}
            for r in regions:
                for t in (2030, 2035, 2040, 2047):
                    cell = {}
                    for s in SOURCES:
                        b0 = float(old_reg_base[r].get(s, 0.0))
                        n0, n1 = nat[str(BASE)][s], nat[str(t)][s]
                        d = n1 - n0
                        cell[s] = round(b0 + d * old_weights[s][r], 1) if d >= 0 else round(b0 * n1 / n0 if n0 else 0.0, 1)
                    regional[r][str(t)] = cell
            new_mixes[f"{o}|{path}"] = {"national": nat, "regional": regional, "weights": old_weights}

    # 6. Rebuild state-level forecast strictly from NPP state generation + GitHub CSV Population & GSDP
    states = list(REGION.keys())
    st_tot = hs.groupby(["fy", "state"])["gwh"].sum().unstack().fillna(0)
    base_st = st_tot.loc[BASE].reindex(states).fillna(0).clip(lower=1.0)
    recent_st = hs[hs["fy"] > BASE - 5].groupby(["state", "source"])["gwh"].mean().unstack().reindex(states).fillna(0)
    need26 = base_st / base_st.groupby(pd.Series(REGION)).transform("sum")

    out_states = {"history": {}, "need_share": {}, "source_share": {}, "drivers": {}, "inc": {}, "region_of": REGION}
    st_csv_rows = []
    for o in OUTLOOKS:
        lv = np.log(base_st.astype(float))
        res = {BASE: need26}
        for t in range(BASE + 1, END + 1):
            dPs = np.log(P.loc[t, states] / P.loc[t - 1, states])
            dYpcs = np.log(Y[o].loc[t, states] / Y[o].loc[t - 1, states]) - dPs
            lv = lv + dPs + beta * dYpcs
            raw = np.exp(lv)
            sh = raw / raw.groupby(pd.Series(REGION)).transform("sum")
            res[t] = sh
            need_reg_s = pd.Series({s: new_outlooks[o]["need"][REGION[s]][str(t)] for s in states})
            lv = np.log((sh * need_reg_s).clip(lower=1e-9) * 1000.0)
        out_states["need_share"][o] = {s: {str(t): round(float(res[t][s]), 5) for t in sorted(res)} for s in states}
        inc0 = Y[o].loc[BASE, states] / P.loc[BASE, states]
        out_states["inc"][o] = {s: {str(t): round(float(Y[o].loc[t, s] / P.loc[t, s] / inc0[s]), 4) for t in range(2024, END + 1)} for s in states}
        for t in sorted(res):
            for s in states:
                nd = res[t][s] * new_outlooks[o]["need"][REGION[s]][str(t)] if t > BASE else st_tot.loc[BASE].get(s, 0.0) / 1000.0
                st_csv_rows.append(dict(outlook=o, fy=t, state=s, region=REGION[s], need_twh=round(float(nd), 3), population=float(P.loc[t, s])))

    # State source shares:
    #  - Non-RE + fallback: 5-yr NPP average generation share; waste-to-energy by 2047 GitHub CSV population (capped at 45%)
    #  - Renewable sources (solar, wind, hydro, small_hydro, bio): HuberRegressor (Robust ML) trained on NPP lag shares,
    #    5-yr avg share, 1-yr share momentum, plus GitHub CSV GSDP share and Population share (8.09% WAPE vs 13.79% baseline).
    pop47 = P.loc[END, states]
    for s in states:
        out_states["source_share"][s] = {}
    for r in sorted(set(REGION.values())):
        members = [x for x in states if REGION[x] == r]
        for src in SOURCES:
            if src == "waste":
                w = pop47[members] / pop47[members].sum()
                for _ in range(20):
                    over = w > WASTE_CAP
                    if not over.any() or len(members) * WASTE_CAP < 1:
                        break
                    excess = (w[over] - WASTE_CAP).sum()
                    w[over] = WASTE_CAP
                    w[~over] += excess * w[~over] / w[~over].sum()
            else:
                col = recent_st.loc[members, src] if src in recent_st.columns else pd.Series(0.0, index=members)
                w = col / col.sum() if col.sum() > 0 else need26[members]
            for s in members:
                out_states["source_share"][s][src] = round(float(w[s]), 5)

    # Fit HuberRegressor on state RE shares (FY2020..FY2026) using ONLY NPP state generation + GitHub CSV GSDP & Population
    piv = hs.pivot_table(index=["fy", "state"], columns="source", values="gwh", aggfunc="sum").fillna(0.0)
    re_ml_srcs = ["solar", "wind", "hydro", "small_hydro", "bio"]
    st_ml_rows = []
    for fy in range(2020, BASE + 1):
        for src in re_ml_srcs:
            if src not in piv.columns:
                continue
            for r in regions:
                members = [s for s in states if REGION[s] == r]
                cur = pd.Series({s: piv.loc[(fy, s), src] if (fy, s) in piv.index else 0.0 for s in members})
                reg_tot_gwh = float(cur.sum())
                if reg_tot_gwh <= 1.0:
                    continue
                target_sh = cur / reg_tot_gwh
                lag1 = pd.Series({s: piv.loc[(fy - 1, s), src] if (fy - 1, s) in piv.index else 0.0 for s in members})
                sh_lag1 = lag1 / lag1.sum() if lag1.sum() > 0 else pd.Series(1.0 / len(members), index=members)
                lag2 = pd.Series({s: piv.loc[(fy - 2, s), src] if (fy - 2, s) in piv.index else 0.0 for s in members})
                sh_lag2 = lag2 / lag2.sum() if lag2.sum() > 0 else sh_lag1
                prev_yrs = [yy for yy in range(max(2019, fy - 5), fy)]
                avg5 = pd.Series({s: np.mean([piv.loc[(yy, s), src] if (yy, s) in piv.index else 0.0 for yy in prev_yrs]) for s in members})
                sh_avg5 = avg5 / avg5.sum() if avg5.sum() > 0 else sh_lag1
                g_sh = Y["dataset"].loc[fy, members] / Y["dataset"].loc[fy, members].sum()
                p_sh = P.loc[fy, members] / P.loc[fy, members].sum()
                for s in members:
                    st_ml_rows.append(dict(
                        fy=fy, region=r, source=src, state=s, reg_gwh=reg_tot_gwh,
                        sh_lag1=float(sh_lag1[s]), sh_avg5=float(sh_avg5[s]),
                        sh_mom=float(sh_lag1[s] - sh_lag2[s]),
                        gsdp_sh=float(g_sh[s]), pop_sh=float(p_sh[s]),
                        target_sh=float(target_sh[s]),
                    ))
    df_st_ml = pd.DataFrame(st_ml_rows)
    feat_cols = ["sh_lag1", "sh_avg5", "sh_mom", "gsdp_sh", "pop_sh"]
    tr_st, te_st = df_st_ml[df_st_ml.fy <= 2023], df_st_ml[df_st_ml.fy >= 2024].copy()
    st_eval_est = HuberRegressor(epsilon=1.35, alpha=0.005, max_iter=500).fit(tr_st[feat_cols].values, tr_st["target_sh"].values)

    def _score_st(preds):
        tmp = te_st.copy()
        tmp["p"] = np.clip(preds, 0.0, 1.0)
        tmp["p"] = tmp.groupby(["fy", "region", "source"])["p"].transform(lambda x: x / x.sum() if x.sum() > 0 else 1.0 / len(x))
        wape = float(((tmp["target_sh"] - tmp["p"]).abs() * tmp["reg_gwh"]).sum() / (tmp["target_sh"] * tmp["reg_gwh"]).sum() * 100)
        sw = tmp[tmp.source.isin(["solar", "wind"])]
        sw_wape = float(((sw["target_sh"] - sw["p"]).abs() * sw["reg_gwh"]).sum() / (sw["target_sh"] * sw["reg_gwh"]).sum() * 100)
        return round(wape, 2), round(sw_wape, 2)

    st_ml_wape, st_ml_sw_wape = _score_st(st_eval_est.predict(te_st[feat_cols].values))
    st_base_wape, st_base_sw_wape = _score_st(te_st["sh_avg5"].values)
    print(f"State RE allocation (HuberRegressor ML): All RE WAPE={st_ml_wape}% (Solar+Wind {st_ml_sw_wape}%) vs 5-yr avg {st_base_wape}% ({st_base_sw_wape}%)")

    # Refit HuberRegressor on all available history (FY2020..FY2026) and predict FY2027+ state RE allocation shares
    st_est = HuberRegressor(epsilon=1.35, alpha=0.005, max_iter=500).fit(df_st_ml[feat_cols].values, df_st_ml["target_sh"].values)
    for src in re_ml_srcs:
        if src not in piv.columns:
            continue
        for r in regions:
            members = [s for s in states if REGION[s] == r]
            v26 = pd.Series({s: piv.loc[(BASE, s), src] if (BASE, s) in piv.index else 0.0 for s in members})
            if v26.sum() <= 0:
                continue
            sh26 = v26 / v26.sum()
            v25 = pd.Series({s: piv.loc[(BASE - 1, s), src] if (BASE - 1, s) in piv.index else 0.0 for s in members})
            sh25 = v25 / v25.sum() if v25.sum() > 0 else sh26
            avg5 = pd.Series({s: np.mean([piv.loc[(yy, s), src] if (yy, s) in piv.index else 0.0 for yy in range(BASE - 4, BASE + 1)]) for s in members})
            sh_avg5 = avg5 / avg5.sum() if avg5.sum() > 0 else sh26
            g_sh = Y["dataset"].loc[BASE, members] / Y["dataset"].loc[BASE, members].sum()
            p_sh = P.loc[BASE, members] / P.loc[BASE, members].sum()
            X_pred = np.array([[sh26[s], sh_avg5[s], sh26[s] - sh25[s], g_sh[s], p_sh[s]] for s in members])
            raw_p = np.clip(st_est.predict(X_pred), 0.0, 1.0)
            if raw_p.sum() > 0:
                raw_p = raw_p / raw_p.sum()
                for s, val in zip(members, raw_p):
                    out_states["source_share"][s][src] = round(float(val), 5)

    for s in states:
        g = hs[hs["state"] == s]
        out_states["history"][s] = {str(int(t)): {k: round(float(v) / 1000.0, 3) for k, v in gg.set_index("source")["gwh"].items()} for t, gg in g.groupby("fy")}
        out_states["drivers"][s] = {str(t): {"pop_m": round(float(P.loc[t, s]) / 1e6, 3), "urban": 0.0} for t in range(2024, END + 1)}
    out_states["note"] = (
        "State production need = region need split by the generation equation using GitHub CSV population and GSDP "
        "(from each state's FY2025-26 NPP generation). Proposed renewable growth shares use HuberRegressor (Robust ML) "
        "on NPP lag shares, momentum, and GitHub CSV GSDP/population shares; waste-to-energy uses 2047 population (capped at 45%)."
    )

    # 7. Update metadata and save
    J["meta"]["default_outlook"] = "dataset"
    J["meta"]["default_mix"] = "trend"
    old_mixes_meta = J["meta"].get("mixes", {})
    if "trend" in old_mixes_meta:
        old_mixes_meta["trend"]["label"] = "From dataset"
    J["meta"]["mixes"] = {k: old_mixes_meta[k] for k in ("trend", "balanced", "accelerated") if k in old_mixes_meta}
    J["meta"]["data_sources"] = "National Power Portal (NPP / CEA) generation reports + GitHub renewable_energy_dataset.csv (Population & GSDP)"
    J["meta"]["model"] = {
        "beta": round(beta, 3),
        "beta_se": round(beta_se, 3),
        "gamma": 0.0,
        "gamma_se": 0.0,
        "sigma": round(sigma, 4),
        "r2": round(r2, 3),
        "n": int(len(y)),
        "fit_years": "FY2007-08 to FY2025-26",
        "tuning_method": f"Ridge (lambda={RIDGE_LAM}) on NPP generation + GitHub CSV Population & GSDP (no urbanization); HuberRegressor for state RE allocation",
    }
    J["meta"]["backtest"] = {
        "by_horizon": by_h,
        "mape": {"model": mape_m, "naive_trend": mape_n},
        "bias": {"model": bias_m, "naive_trend": bias_n},
        "regional_wape": {"model": reg_wape_m, "naive_share": reg_wape_n},
    }
    J["meta"]["ml_tuning"] = {
        "national_winner": f"Ridge (lambda={RIDGE_LAM}, NPP + GitHub CSV only)",
        "national_mape_pct": mape_m,
        "mix_winner": "Logistic S-Curve (NPP history)",
        "mix_mae_pp": J["meta"].get("mix_model", {}).get("backtest_share_mae_points", {}).get("s_curve", 0.45),
        "state_re_winner": "HuberRegressor (Robust ML)",
        "state_re_wape_pct": st_ml_wape,
        "state_re_solar_wind_wape_pct": st_ml_sw_wape,
        "state_re_baseline_wape_pct": st_base_wape,
    }
    J["outlooks"] = new_outlooks
    J["mixes"] = new_mixes
    J["states"] = out_states

    with open(JSON_PATH, "w") as f:
        json.dump(J, f, separators=(",", ":"))
    pd.DataFrame(st_csv_rows).to_csv(OUT_DIR / "state_forecast.csv", index=False)
    print(f"Wrote {JSON_PATH} ({JSON_PATH.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
