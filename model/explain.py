"""
Explainability for the v2 forecast model: SHAP (global + local) and LIME (local).

    .venv/bin/python model/explain.py                         # default example: Gujarat 2035
    .venv/bin/python model/explain.py --state Karnataka --year 2047 --cagr 0.07

Features (the model treated as a black box f(features) -> installed MW per technology)
    Forecast year              target year
    GSDP growth (%/yr)         yearly GSDP growth implied by the target-year GSDP the user enters
    Population (crore)         sent by the dashboard, NOT used by the model (sanity check: SHAP ~ 0)
    Zone                       the state's zone (catch-up target differs by zone)
    2024 GSDP (lakh crore)     size of the state economy at the base year
    2024 <tech> MW  (x5)       the state's installed base per technology (nowcast where reports are stale)

SHAP values are exact (all 2^10 coalitions) against a background of realistic state/year/GSDP
scenarios, computed once for all five technologies; the total's SHAP is their sum (Shapley values are
additive across outputs). Outputs -> reports/explainability/
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import shap  # noqa: E402
from lime.lime_tabular import LimeTabularExplainer  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from re_model import TECH  # noqa: E402
from convergence_model import ConvergenceModel  # noqa: E402
from features import CAP0, FEATURES, SHORT, Wrapped, scenarios  # noqa: E402,F401

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "reports" / "explainability"


def save(name):
    plt.tight_layout(); plt.savefig(OUT / name, dpi=150, bbox_inches="tight"); plt.close("all")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", default="Gujarat")
    ap.add_argument("--year", type=int, default=2035)
    ap.add_argument("--cagr", type=float, default=0.06, help="assumed yearly GSDP growth for the example")
    ap.add_argument("--n-explain", type=int, default=300)
    ap.add_argument("--n-background", type=int, default=60)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    W = Wrapped(ConvergenceModel.from_json(HERE / "re2047_model.json"))
    X = scenarios(W)
    bg = shap.sample(X, args.n_background, random_state=0)
    Xe = shap.sample(X, args.n_explain, random_state=1)
    masker = shap.maskers.Independent(bg, max_samples=args.n_background)
    explainer = shap.Explainer(lambda Z: W.mw(Z) / 1000, masker, algorithm="exact", feature_names=FEATURES)

    sv = explainer(Xe, silent=True)                                   # (n, features, 5 techs) in GW
    tot = shap.Explanation(sv.values.sum(-1), sv.base_values.sum(-1), Xe.values, feature_names=FEATURES)
    tot_disp = shap.Explanation(tot.values, tot.base_values, Xe.values, feature_names=FEATURES)

    plt.figure(); shap.plots.bar(tot_disp, max_display=10, show=False)
    plt.title("Global importance: mean |SHAP| on total capacity (GW)"); save("shap_global_bar_total.png")
    plt.figure(); shap.plots.beeswarm(tot_disp, max_display=10, show=False)
    plt.title("How each feature pushes total capacity (GW)"); save("shap_beeswarm_total.png")

    imp = pd.DataFrame({SHORT[t]: np.abs(sv.values[:, :, j]).mean(0) for j, t in enumerate(TECH)}, index=FEATURES).T
    share = imp.div(imp.sum(1), axis=0) * 100
    fig, ax = plt.subplots(figsize=(12.5, 3.8))
    im = ax.imshow(share.values, cmap="Greens", aspect="auto", vmin=0, vmax=100)
    ax.set_xticks(range(len(FEATURES)), FEATURES, rotation=35, ha="right"); ax.set_yticks(range(len(TECH)), share.index)
    for i in range(share.shape[0]):
        for j in range(share.shape[1]):
            ax.text(j, i, f"{share.values[i, j]:.0f}%", ha="center", va="center", fontsize=8,
                    color="white" if share.values[i, j] > 55 else "black")
    fig.colorbar(im, ax=ax, label="share of mean |SHAP| (%)")
    ax.set_title("Which inputs drive each technology's forecast (share of mean |SHAP|)")
    save("shap_importance_by_technology.png")

    for j, t in enumerate(TECH[:2]):  # dependence plots: solar and wind vs GSDP growth
        e = shap.Explanation(sv.values[:, :, j], sv.base_values[:, j], Xe.values, feature_names=FEATURES)
        plt.figure(); shap.plots.scatter(e[:, "GSDP growth (%/yr)"], color=e[:, "Forecast year"], show=False)
        plt.title(f"{SHORT[t]}: SHAP of GSDP growth (GW), coloured by forecast year")
        save(f"shap_dependence_{SHORT[t].lower()}_gsdp.png")

    x0 = W.row(args.state, args.year, args.cagr)
    loc = explainer(x0[None], silent=True)
    lv, lb = loc.values[0].sum(-1), float(loc.base_values[0].sum())
    pred = float(W.gw_total(x0[None])[0])
    disp = x0.copy().astype(object); disp[3] = W.zones[int(x0[3])]
    plt.figure()
    shap.plots.waterfall(shap.Explanation(lv, lb, x0, feature_names=[
        f"{f} = {W.zones[int(x0[3])]}" if f == "Zone" else f for f in FEATURES]), max_display=11, show=False)
    plt.title(f"{args.state} {args.year}: why the model predicts {pred:.1f} GW", fontsize=10)
    tag = f"{args.state.replace(' ', '_')}_{args.year}"
    save(f"shap_waterfall_{tag}.png")

    lime_exp = LimeTabularExplainer(X.values, feature_names=FEATURES, mode="regression",
                                    categorical_features=[3], categorical_names={3: W.zones},
                                    discretize_continuous=False, sample_around_instance=True,
                                    kernel_width=0.75, random_state=0)
    le = lime_exp.explain_instance(x0, W.gw_total, num_features=10, num_samples=5000)
    fig = le.as_pyplot_figure(); fig.set_size_inches(9, 4.8)
    plt.title(f"LIME: {args.state} {args.year}, GW per 1 std change (local R² {le.score:.2f})", fontsize=10)
    save(f"lime_{tag}.png")

    gimp = dict(zip(FEATURES, np.abs(tot.values).mean(0)))
    summary = {
        "model": "convergence_v2",
        "example": {"state": args.state, "year": args.year, "gsdp_cagr": args.cagr, "predicted_total_gw": round(pred, 2),
                    "shap_base_value_gw": round(lb, 2),
                    "shap_contributions_gw": {f: round(float(v), 3) for f, v in zip(FEATURES, lv)},
                    "lime_weights_gw_per_std": [(r, round(float(w), 3)) for r, w in le.as_list()],
                    "lime_local_r2": round(float(le.score), 3)},
        "global_mean_abs_shap_total_gw": {f: round(float(v), 3) for f, v in gimp.items()},
        "importance_share_by_technology_pct": share.round(1).to_dict("index"),
        "shap_additivity_max_error_gw": float(np.max(np.abs(tot.values.sum(1) + tot.base_values - W.gw_total(Xe.values)))),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))

    print(f"Example: {args.state} {args.year}, GSDP +{args.cagr:.0%}/yr -> {pred:.1f} GW total")
    print(f"  SHAP: average scenario {lb:.1f} GW; contributions (GW):")
    for f, v in sorted(zip(FEATURES, lv), key=lambda z: -abs(z[1])):
        print(f"    {f:26s} {v:+8.2f}")
    print(f"  LIME (local R^2 {le.score:.2f}), GW per 1 std:")
    for r, w in le.as_list():
        print(f"    {r:40s} {w:+8.2f}")
    print("\nGlobal mean |SHAP| on total (GW):")
    for f, v in sorted(gimp.items(), key=lambda z: -z[1]):
        print(f"    {f:26s} {v:8.2f}")
    print("\nImportance share by technology (%):"); print(share.round(0).to_string())
    print(f"\nSHAP additivity max error: {summary['shap_additivity_max_error_gw']:.1e} GW")
    print(f"Saved to {OUT.relative_to(HERE.parent)}/")


if __name__ == "__main__":
    main()
