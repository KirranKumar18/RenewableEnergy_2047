"""Per-state electricity GENERATION: history by source and forecast to 2047.

Challenge rule: only energy generated is used (no installed capacity, no consumption).

History (data/processed/generation_state.csv, GWh, FY2018-19 .. FY2025-26)
  coal, gas, nuclear, hydro   CEA monthly generation report, sub-report 16 (via NPP), March issues: generation of
                              every station, grouped by state. Diesel is counted with coal (as in "thermal minus
                              gas"). Ladakh is merged into Jammu & Kashmir (the challenge dataset has them together).
  solar, wind, bio, small_hydro, waste   CEA monthly Renewable Energy Generation reports (generation_state_re.csv)

Forecast (added to public/generation_forecast.json under "states"; CSV in reports/generation/state_forecast.csv)
  Production need. Each state starts from its FY2025-26 generation and grows with the same equation as India and the
  regions, using the state's own population, GSDP per person and urban share:
      d ln N = d ln P + beta * d ln(Y/P) + gamma * d u
  States are then rescaled each year to add up to their region's need, so the state split follows population,
  income and urbanization.
  Proposed production. A state keeps its FY2025-26 generation of each source and receives a share of the region's
  growth in that source (a falling source shrinks every state in proportion). Shares: waste-to-energy by 2047 urban
  population (no state above 45% of its region); every other source by the state's 5-year average generation
  (FY2022-FY2026) of that source. A source a region has none of is shared by production need.

Drivers
  population  challenge dataset (to 2024), state shares carried forward with half their 2014-2024 trend fading over
              10 years, scaled to the national UN WPP 2024 path stored in the forecast file
  GSDP        challenge dataset + model/gsdp_projection.py outlooks (dataset year Y = FY Y+1)
  urban share Census 2011 state shares, moved together on the logit scale to follow the national path in the file
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
from gsdp_projection import GsdpProjector  # noqa: E402

NPP = ROOT / "data/external/npp_generation"
DATA = ROOT / "data/processed"
OUT = ROOT / "reports/generation"
JSON = ROOT / "public/generation_forecast.json"
BASE, END = 2026, 2047
WASTE_CAP = 0.45

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
URBAN_2011 = {  # Census 2011, percent urban
    "Andhra Pradesh": 29.6, "Telangana": 38.9, "Arunachal Pradesh": 22.9, "Assam": 14.1, "Bihar": 11.3,
    "Chhattisgarh": 23.2, "Goa": 62.2, "Gujarat": 42.6, "Haryana": 34.9, "Himachal Pradesh": 10.0,
    "Jammu And Kashmir": 27.4, "Jharkhand": 24.1, "Karnataka": 38.7, "Kerala": 47.7, "Madhya Pradesh": 27.6,
    "Maharashtra": 45.2, "Manipur": 29.2, "Meghalaya": 20.1, "Mizoram": 52.1, "Nagaland": 28.9,
    "Odisha": 16.7, "Punjab": 37.5, "Rajasthan": 24.9, "Sikkim": 25.2, "Tamil Nadu": 48.4, "Tripura": 26.2,
    "Uttar Pradesh": 22.3, "Uttarakhand": 30.2, "West Bengal": 31.9, "Delhi": 97.5, "Chandigarh": 97.3,
    "Puducherry": 68.3, "Andaman And Nicobar Islands": 37.7, "Lakshadweep": 78.1,
}
SOURCES = ["coal", "gas", "nuclear", "hydro", "small_hydro", "solar", "wind", "bio", "waste"]
FUEL = {"COAL": "coal", "LIGNITE": "coal", "DIESEL": "coal", "NATURAL GAS": "gas", "NUCLEAR": "nuclear", "HYDRO": "hydro"}
KEY = lambda s: re.sub(r"[^a-z]", "", s.lower().replace("&", "and"))
ALIAS = {KEY(s): s for s in REGION}
ALIAS.update({KEY("Chhatisgarh"): "Chhattisgarh", KEY("Ladakh"): "Jammu And Kashmir", KEY("Orissa"): "Odisha",
              KEY("Jammu & Kashmir"): "Jammu And Kashmir", KEY("Andaman & Nicobar"): "Andaman And Nicobar Islands",
              KEY("Andaman & Nicob"): "Andaman And Nicobar Islands", KEY("Andaman Nicobar"): "Andaman And Nicobar Islands"})


def canon(name):
    k = KEY(name)
    if k in ALIAS:
        return ALIAS[k]
    for a, s in ALIAS.items():          # NPP truncates long names ("ARUNACHAL PRADE")
        if len(k) >= 8 and a.startswith(k):
            return s
    return None


def parse_station_report(year):
    """State x fuel generation (GWh) for FY=year (current) and FY=year-1 (previous), from utility rows."""
    d = pd.read_excel(NPP / f"18_col_act-16_{year}-MAR.xls", header=None)
    rows, state = [], None
    for _, r in d.iterrows():
        c = [x for x in r if pd.notna(x) and str(x).strip()]
        if not c:
            continue
        first = " ".join(str(c[0]).split()).upper()
        if len(c) == 1 and isinstance(c[0], str):
            st = canon(first)
            if st:
                state = st
            continue
        strs = [x for x in c if isinstance(x, str)]
        v = [float(x) for x in c if isinstance(x, (int, float, np.floating))]
        if (len(strs) >= 2 and len(v) >= 10 and not first.endswith("SECTOR") and not first.startswith("CENTRAL")
                and not first.startswith("STATE SECTOR") and not first.startswith("PVT") and not first.startswith("TOTAL")):
            fuel = FUEL.get(" ".join(strs[1].split()).upper())
            if fuel and state:
                rows.append(dict(state=state, source=fuel, fy=year, gwh=v[8], cur=1))
                rows.append(dict(state=state, source=fuel, fy=year - 1, gwh=v[9], cur=0))
    df = pd.DataFrame(rows).groupby(["state", "source", "fy", "cur"], as_index=False).gwh.sum()
    return df


def state_history():
    conv = pd.concat([parse_station_report(y) for y in range(2020, BASE + 1)])
    conv = conv.sort_values("cur", kind="stable").drop_duplicates(["state", "source", "fy"], keep="last").drop(columns="cur")
    re_ = pd.read_csv(DATA / "generation_state_re.csv")
    re_ = re_[~re_.state.str.startswith("Central")]
    re_["state"] = re_.state.map(canon)
    re_ = re_.dropna(subset=["state"]).groupby(["state", "source", "fy"], as_index=False).gwh.sum()
    h = pd.concat([conv, re_], ignore_index=True)
    h = h[(h.fy >= 2019) & (h.fy <= BASE)]
    h["region"] = h.state.map(REGION)
    h = h.groupby(["fy", "region", "state", "source"], as_index=False).gwh.sum()
    h.to_csv(DATA / "generation_state.csv", index=False)
    return h


def drivers(J):
    """Per state, FY 2024..2047: population (persons), urban share (0-1), real GSDP by outlook."""
    ds = pd.read_csv(ROOT / "data/raw/renewable_energy_dataset.csv")
    pop = ds.pivot(index="Year", columns="State", values="Population").sort_index().ffill().bfill()
    gs = ds.pivot(index="Year", columns="State", values="GSDP (crore INR)").sort_index().ffill().bfill()
    states = list(REGION)
    pop, gs = pop[states], gs[states]
    india = J["outlooks"]["viksit"]["india"]
    nat_pop = {int(t): v["pop_m"] * 1e6 for t, v in india.items()}
    nat_urb = {int(t): v["urban"] / 100 for t, v in india.items()}
    share0 = pop.loc[2024] / pop.loc[2024].sum()
    g_s = np.log(pop.loc[2024] / pop.loc[2014]) / 10
    g_n = np.log(pop.loc[2024].sum() / pop.loc[2014].sum()) / 10
    diff = 0.5 * (g_s - g_n)
    P, sh = {}, share0.copy()
    for fy in range(2024, END + 1):
        cal = fy - 1
        if cal > 2024:
            sh = sh * np.exp(diff * 0.5 ** ((cal - 2024) / 10))
            sh = sh / sh.sum()
        s = share0 if cal <= 2024 else sh
        P[fy] = s * nat_pop[fy]
    P = pd.DataFrame(P).T
    base = pd.Series({s: URBAN_2011[s] / 100 for s in states})
    lg = np.log(base / (1 - base))
    U = {}
    for fy in P.index:
        w = P.loc[fy] / P.loc[fy].sum()
        lo, hi = -3.0, 3.0
        for _ in range(60):
            mid = (lo + hi) / 2
            if (w / (1 + np.exp(-(lg + mid)))).sum() < nat_urb[fy]:
                lo = mid
            else:
                hi = mid
        U[fy] = 1 / (1 + np.exp(-(lg + (lo + hi) / 2)))
    U = pd.DataFrame(U).T
    proj = GsdpProjector({s: gs[s].to_dict() for s in states}, 2024)
    Y = {}
    for o in J["outlooks"]:
        path = proj.paths[o][states]
        hist = gs.loc[2012:2024]
        full = pd.concat([hist, path.loc[path.index > 2024]])
        full.index = full.index + 1           # dataset year -> FY
        Y[o] = full.loc[2024:END]
    return P, U, Y


def main():
    J = json.load(open(JSON))
    M = J["meta"]
    beta, gamma = M["model"]["beta"], M["model"]["gamma"]
    h = state_history()
    tot = h.groupby(["fy", "state"]).gwh.sum().unstack().fillna(0)
    chk = h.groupby(["fy", "region"]).gwh.sum().unstack()
    reg = pd.DataFrame({r: {int(t): sum(v.values()) * 1000 for t, v in J["history"]["regional"][r].items()} for r in M["regions"]})
    print("state sum / region total, FY2026:", (chk.loc[BASE] / reg.loc[BASE]).round(3).to_dict())

    P, U, Y = drivers(J)
    years = list(range(BASE + 1, END + 1))
    base = tot.loc[BASE].reindex(list(REGION)).fillna(0).clip(lower=1.0)
    out_states = {"history": {}, "need_share": {}, "source_share": {}, "drivers": {}, "inc": {}}
    rows = []
    for o in J["outlooks"]:
        lv = np.log(base)
        shares = {BASE: None}
        res = {}
        for t in years:
            dP = np.log(P.loc[t] / P.loc[t - 1])
            dYpc = np.log(Y[o].loc[t] / Y[o].loc[t - 1]) - dP
            du = U.loc[t] - U.loc[t - 1]
            lv = lv + dP + beta * dYpc + gamma * du
            raw = np.exp(lv)
            sh = raw / raw.groupby(pd.Series(REGION)).transform("sum")
            res[t] = sh
            need_r = pd.Series({s: J["outlooks"][o]["need"][REGION[s]][str(t)] for s in REGION})
            lv = np.log((sh * need_r).clip(lower=1e-9) * 1000)    # keep levels on the region's scale
        base_sh = base / base.groupby(pd.Series(REGION)).transform("sum")
        res[BASE] = base_sh
        out_states["need_share"][o] = {s: {int(t): round(float(res[t][s]), 5) for t in sorted(res)} for s in REGION}
        inc0 = Y[o].loc[BASE] / P.loc[BASE]
        out_states["inc"][o] = {s: {int(t): round(float(Y[o].loc[t, s] / P.loc[t, s] / inc0[s]), 4) for t in range(2024, END + 1)} for s in REGION}
        for t in sorted(res):
            for s in REGION:
                need = res[t][s] * J["outlooks"][o]["need"][REGION[s]][str(t)] if t > BASE else tot.loc[BASE].get(s, 0) / 1000
                rows.append(dict(outlook=o, fy=t, state=s, region=REGION[s], need_twh=float(need),
                                 population=float(P.loc[t, s]), urban=float(U.loc[t, s])))
    # How each region's NEW generation of a source is shared among its states (weights add to 1 within a region).
    #   waste-to-energy: each state's 2047 urban population (garbage follows people), no state above WASTE_CAP of its region
    #   every other source: the state's average generation over the last 5 years (FY2022-FY2026) of that source, which
    #   removes single-year swings (e.g. Tamil Nadu bagasse); a region with none of a source yet shares it by need
    recent = h[h.fy > BASE - 5].groupby(["state", "source"]).gwh.mean().unstack().reindex(list(REGION)).fillna(0)
    need26 = base / base.groupby(pd.Series(REGION)).transform("sum")
    urban_pop = P.loc[END] * U.loc[END]
    for s in REGION:
        out_states["source_share"][s] = {}
    for r in sorted(set(REGION.values())):
        members = [x for x in REGION if REGION[x] == r]
        for src in SOURCES:
            if src == "waste":
                w = urban_pop[members] / urban_pop[members].sum()
                for _ in range(20):                       # cap and redistribute the excess pro rata
                    over = w > WASTE_CAP
                    if not over.any() or len(members) * WASTE_CAP < 1:
                        break
                    excess = (w[over] - WASTE_CAP).sum()
                    w[over] = WASTE_CAP
                    w[~over] += excess * w[~over] / w[~over].sum()
            else:
                col = recent.loc[members, src] if src in recent.columns else pd.Series(0.0, index=members)
                w = col / col.sum() if col.sum() > 0 else need26[members]
            for s in members:
                out_states["source_share"][s][src] = round(float(w[s]), 5)
    for s in REGION:
        g = h[h.state == s]
        out_states["history"][s] = {int(t): {k: round(float(v) / 1000, 3) for k, v in gg.set_index("source").gwh.items()} for t, gg in g.groupby("fy")}
        out_states["drivers"][s] = {int(t): {"pop_m": round(float(P.loc[t, s]) / 1e6, 3), "urban": round(float(U.loc[t, s]) * 100, 2)} for t in range(2024, END + 1)}
    out_states["region_of"] = REGION
    out_states["note"] = ("State production need = region need split by the generation equation with state population, "
                          "GSDP per person and urban share (from each state's FY2025-26 generation). Proposed production "
                          "= state's FY2025-26 generation plus its share of the region's growth in each source: waste-to-energy by "
                          "2047 urban population (capped at 45% of a region), other sources by 5-year average generation.")
    J["states"] = out_states
    with open(JSON, "w") as f:
        json.dump(J, f, separators=(",", ":"))
    OUT.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_csv(OUT / "state_forecast.csv", index=False)
    v = df[(df.outlook == "viksit") & (df.fy.isin([BASE, 2047]))].pivot(index="state", columns="fy", values="need_twh")
    print(v.sort_values(2047, ascending=False).round(1).head(12).to_string())
    print("sum 2047", round(v[2047].sum(), 0))


if __name__ == "__main__":
    main()
