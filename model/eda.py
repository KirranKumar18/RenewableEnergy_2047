"""
Exploratory data analysis of the renewable energy dataset -> reports/eda/*.png + reports/eda/findings.json

    .venv/bin/python model/eda.py
"""
import json
import sys
import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from re_model import DATA_CSV, TECH, fresh_mask, load_data  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "reports" / "eda"
COL = {"Solar Power": "#F59E0B", "Wind Power": "#06B6D4", "Bio-Mass Power": "#10B981",
       "Small Hydro Power": "#3B82F6", "Waste to Energy": "#A855F7"}
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False, "font.size": 10})


def save(name):
    for a in plt.gcf().axes:
        if a.get_xscale() == "linear" and not a.get_xticklabels()[0].get_text()[:1].isalpha():
            a.xaxis.set_major_locator(matplotlib.ticker.MaxNLocator(integer=True))
    plt.tight_layout(); plt.savefig(OUT / name, dpi=150, bbox_inches="tight"); plt.close("all")


def raw():
    d = pd.read_csv(DATA_CSV)
    d.columns = [c.replace("Installed - ", "") for c in d.columns]
    return d.rename(columns={"GSDP (crore INR)": "GSDP"})


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    df, r = load_data(), raw()
    F = {}

    # 1. national capacity by technology
    N = df.groupby("Year")[TECH].sum() / 1000
    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    for t in TECH:
        ax[0].plot(N.index, N[t], color=COL[t], lw=2, label=t)
        ax[1].plot(N.index, N[t].clip(lower=1e-3), color=COL[t], lw=2)
    ax[0].set_title("National installed capacity (GW)"); ax[0].legend(frameon=False, fontsize=8)
    ax[1].set_yscale("log"); ax[1].set_title("Same, log scale: growth rates comparable")
    for a in ax:
        a.axvspan(2021.5, 2024.5, color="grey", alpha=0.12)
    ax[0].text(2021.6, N.values.max() * 0.9, "partly\nstale", fontsize=8, color="grey")
    save("01_national_capacity.png")
    F["national_gw_2024"] = N.loc[2024].round(1).to_dict()
    F["solar_share_2024"] = round(float(N.loc[2024, "Solar Power"] / N.loc[2024].sum()), 3)

    # 2. reporting freshness heatmap
    fr = fresh_mask(df)
    df["any_fresh"] = fr.any(axis=1)
    H = df.pivot(index="State", columns="Year", values="any_fresh").astype(float)
    H = H.loc[H.loc[:, 2023:].sum(1).sort_values().index]
    fig, ax = plt.subplots(figsize=(10, 8.5))
    ax.imshow(H.fillna(-1).values, cmap=matplotlib.colors.ListedColormap(["white", "#E5E7EB", "#059669"]),
              vmin=-1, vmax=1, aspect="auto")
    ax.set_yticks(range(len(H)), H.index, fontsize=8); ax.set_xticks(range(len(H.columns)), H.columns, rotation=90, fontsize=8)
    ax.set_title("Did the state report any new value that year?  green = yes, grey = all values repeated")
    save("02_reporting_freshness.png")
    upd = df.groupby("Year").any_fresh.sum()
    F["states_with_new_values_by_year"] = {int(k): int(v) for k, v in upd.loc[2018:].items()}
    F["fresh_share_of_values"] = round(float(fr.values.mean()), 3)

    # 3. GSDP: base-year break and 2024 placeholder
    gr_raw = r.groupby("Year").GSDP.sum() / 1e5
    gr_fix = df.groupby("Year").GSDP.sum() / 1e5
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(gr_raw.index, gr_raw, "o-", color="#9CA3AF", label="as in dataset")
    ax.plot(gr_fix.index, gr_fix, "o-", color="#111827", label="cleaned (2011 splice, 2024 imputed)")
    ax.annotate("2011: base-year change\n(x2.2 jump)", (2011, gr_raw.loc[2011]), (2006.5, gr_raw.loc[2011] * 0.9), fontsize=8,
                arrowprops=dict(arrowstyle="->", color="grey"))
    ax.annotate("2024: placeholder\n(-0.2% for every state)", (2024, gr_raw.loc[2024]), (2018.5, gr_raw.loc[2024] * 0.75),
                fontsize=8, arrowprops=dict(arrowstyle="->", color="grey"))
    ax.set_title("Sum of state GSDP (lakh crore INR)"); ax.legend(frameon=False)
    save("03_gsdp_cleaning.png")

    # 4. catch-up vs GSDP growth (solar, 2015-2021, before the stale period)
    a, b, t = 2015, 2021, "Solar Power"
    J = df[df.Year == a].set_index("State").join(df[df.Year == b].set_index("State"), lsuffix="_a", rsuffix="_b", how="inner")
    J = J[J[t + "_a"] >= 10]
    z = J.groupby("Zone_a")[[t + "_a", "GSDP_a"]].sum(); zi = (z[t + "_a"] / z.GSDP_a).reindex(J.Zone_a).values
    rel = np.log((J[t + "_a"] / J.GSDP_a) / zi)
    g = (np.log1p(J[t + "_b"]) - np.log1p(J[t + "_a"])) / (b - a)
    gg = (np.log(J.GSDP_b) - np.log(J.GSDP_a)) / (b - a)
    fig, ax = plt.subplots(1, 2, figsize=(11, 4))
    for axi, x, lab in [(ax[0], rel, "log(state intensity / zone intensity) in 2015"), (ax[1], gg * 100, "GSDP growth 2015-21 (%/yr)")]:
        axi.scatter(x, g, color=COL[t], s=40)
        for st, xx, yy in zip(J.index, x, g):
            axi.annotate(st[:12], (xx, yy), fontsize=6.5, alpha=0.7, xytext=(3, 2), textcoords="offset points")
        c = np.corrcoef(x, g)[0, 1]; m, k = np.polyfit(x, g, 1); xs = np.linspace(min(x), max(x), 10)
        axi.plot(xs, m * xs + k, "--", color="grey"); axi.set_xlabel(lab); axi.set_title(f"corr = {c:+.2f}")
    ax[0].set_ylabel("solar capacity growth 2015-21 (log/yr)")
    fig.suptitle("Solar: states behind their zone grow faster (catch-up); GSDP growth does not predict growth", fontsize=11)
    save("04_solar_catchup_vs_gsdp.png")
    F["solar_corr_catchup"] = round(float(np.corrcoef(rel, g)[0, 1]), 2)
    F["solar_corr_gsdp_growth"] = round(float(np.corrcoef(gg, g)[0, 1]), 2)

    # 5. zone intensity (2021: last year before the stale period)
    Z = df[df.Year == 2021].groupby("Zone")[TECH + ["GSDP"]].sum()
    I = Z[TECH].div(Z.GSDP, axis=0) * 1e5
    fig, ax = plt.subplots(figsize=(10, 4))
    I.plot.bar(ax=ax, color=[COL[t] for t in TECH], width=0.8)
    ax.set_ylabel("MW per lakh-crore GSDP"); ax.set_title("Renewable intensity by zone, 2021: resource potential differs a lot")
    ax.legend(frameon=False, fontsize=8); plt.xticks(rotation=0)
    save("05_zone_intensity.png")
    F["zone_intensity_2021"] = I.round(1).to_dict("index")

    # 6. deceleration of national growth
    G = np.log1p(df.groupby("Year")[TECH].sum()).diff().rolling(3, center=True).mean().loc[2008:2023]
    fig, ax = plt.subplots(figsize=(9, 4))
    for t in TECH[:4]:
        ax.plot(G.index, G[t], color=COL[t], lw=2, label=t)
    ax.axhline(0, color="grey", lw=0.8); ax.legend(frameon=False, fontsize=8)
    ax.set_title("National growth rate (log/yr, 3-yr centred average): every technology is decelerating")
    save("06_growth_deceleration.png")

    # 7. concentration
    top = df[df.Year == 2024].set_index("State")[TECH].sum(1).sort_values(ascending=False) / 1000
    fig, ax = plt.subplots(figsize=(10, 4))
    top.head(15).plot.bar(ax=ax, color="#059669"); ax.set_ylabel("GW (reported, 2024)")
    ax.set_title(f"Top 15 states hold {top.head(15).sum() / top.sum():.0%} of capacity; top 5 hold {top.head(5).sum() / top.sum():.0%}")
    save("07_state_concentration.png")
    F["top5_share_2024"] = round(float(top.head(5).sum() / top.sum()), 3)

    # 8. nowcast vs reported for stale states
    m = ConvergenceModel.from_json(HERE / "re2047_model.json")
    rows = []
    for st in m.states:
        rep = m.history[st][m.base_year]; now = m.base_capacity(st)
        rep_t, now_t = sum(rep.values()) / 1000, sum(now.values()) / 1000
        if now_t - rep_t > 0.2:
            rows.append((st, rep_t, now_t))
    S = pd.DataFrame(rows, columns=["State", "reported", "nowcast"]).set_index("State").sort_values("nowcast", ascending=False)
    fig, ax = plt.subplots(figsize=(10, 4))
    S.plot.bar(ax=ax, color=["#9CA3AF", "#059669"], width=0.75)
    ax.set_ylabel("GW, 2024"); ax.set_title("States whose 2024 values are frozen: reported vs model nowcast")
    plt.xticks(rotation=35, ha="right"); ax.legend(frameon=False)
    save("08_nowcast_stale_states.png")
    F["nowcast_vs_reported_gw"] = S.round(1).to_dict("index")
    F["national_2024_reported_vs_nowcast_gw"] = [round(float(N.loc[2024].sum()), 1),
                                                 round(sum(sum(m.base_capacity(s).values()) for s in m.states) / 1000, 1)]

    # 9. backtest comparison (from train.py)
    met = json.loads((HERE / "metrics.json").read_text())["mean"]
    B = pd.Series({k: v["Total WAPE (fresh)"] for k, v in met.items()}).sort_values()
    fig, ax = plt.subplots(figsize=(9, 3.8))
    ax.barh(B.index, B.values, color=["#059669" if "production" in k else "#9CA3AF" for k in B.index])
    for i, v in enumerate(B.values):
        ax.text(v + 0.5, i, f"{v:.1f}%", va="center", fontsize=8)
    ax.invert_yaxis(); ax.set_xlabel("WAPE on fresh test values, mean of 3 cutoffs (lower is better)")
    ax.set_title("Backtest: train until 2016/2018/2020, forecast the following years")
    save("09_backtest_comparison.png")
    F["backtest_wape_fresh"] = B.round(1).to_dict()

    (OUT / "findings.json").write_text(json.dumps(F, indent=1))
    print(json.dumps(F, indent=1))


if __name__ == "__main__":
    main()
