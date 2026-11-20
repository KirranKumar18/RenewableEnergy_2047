"""
Backend FastAPI: Renewable Energy 2047 Forecast API
Powered by the v2 convergence model (model/re2047_model.json, see reports/README.md)

    GET  /                 health
    GET  /api/meta         states, zones, 2024 baselines (population, GSDP, growth), backtest scores
    GET  /api/map?year=    every state's forecast on its default GSDP path (map hover)
    POST /api/predict      forecast + financials for a state or a whole zone, with the user's GSDP
    POST /api/explain      exact SHAP breakdown of that forecast (MW per input feature)
    POST /api/scenario     one call for the dashboard: every state's MW in a year with a GSDP scenario applied
                           to India, a zone or a state, plus that scope's 2024-2047 trajectory and financials
    GET  /api/demand       India's daily electricity demand: recent history, 28-day forecast, generation mix and
                           backtest scores (separate model in demand_forecast/; precomputed by its train.py)
"""
from __future__ import annotations

import json
import sys
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "model"))
from re_model import TECH, TECH_KEY  # noqa: E402
from convergence_model import ConvergenceModel, END_YEAR  # noqa: E402
from features import CAP0, FEATURES, SHORT, Wrapped, scenarios  # noqa: E402
from exact_shap import ExactShap  # noqa: E402

warnings.filterwarnings("ignore")
app = FastAPI(title="RE 2047 API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

MODEL_FILE = HERE / "model" / "re2047_model.json"
_EXPLAIN_FILE = HERE / "model" / "explain_defaults.json"
EXPLAIN_DEFAULTS = json.loads(_EXPLAIN_FILE.read_text())["scopes"] if _EXPLAIN_FILE.exists() else {}
METRICS_FILE = HERE / "model" / "metrics.json"
DEMAND_FILE = HERE / "demand_forecast" / "demand_forecast.json"

# CERC / MNRE benchmarks (same values the original pipeline shipped with)
COST_BENCHMARKS = {
    "solar": {"capex_cr_per_mw": 4.5, "cuf": 0.21, "lcoe_inr_per_kwh": 2.5},
    "wind":  {"capex_cr_per_mw": 7.9, "cuf": 0.30, "lcoe_inr_per_kwh": 3.2},
    "bio":   {"capex_cr_per_mw": 6.85, "cuf": 0.75, "lcoe_inr_per_kwh": 5.4},
    "hydro": {"capex_cr_per_mw": 10.5, "cuf": 0.45, "lcoe_inr_per_kwh": 4.1},
    "waste": {"capex_cr_per_mw": 11.0, "cuf": 0.70, "lcoe_inr_per_kwh": 6.2},
}
ZONE_MULTIPLIERS = {"North": 1.02, "South": 1.0, "West": 0.98, "East": 1.03, "North-East": 1.15}
NAMES = {"solar": "Solar Power", "wind": "Wind Power", "bio": "Bio-Mass Power", "hydro": "Small Hydro Power",
         "waste": "Waste to Energy"}
COLORS = {"solar": "#F59E0B", "wind": "#06B6D4", "bio": "#10B981", "hydro": "#3B82F6", "waste": "#A855F7"}
KEYS = [TECH_KEY[t] for t in TECH]
MODEL_NAME = "v2 convergence model (re2047_model.json)"

MODEL: ConvergenceModel | None = None
W: Wrapped | None = None
EXPLAINER = None
N_BACKGROUND = 40


class PredReq(BaseModel):
    zone: str
    state: Optional[str] = None
    year: int = Field(ge=2006, le=2050)
    population: float = Field(gt=0)
    gsdp_crore: float = Field(gt=0)


def _init():
    global MODEL, W, EXPLAINER
    if not MODEL_FILE.exists():
        print("WARNING: model not found at", MODEL_FILE, "- run model/train.py"); return
    MODEL = ConvergenceModel.from_json(MODEL_FILE)
    W = Wrapped(MODEL)
    # Exact SHAP in numpy (model/exact_shap.py), same values as shap's exact explainer, without its heavy
    # dependencies. The background is shap.sample(scenarios(W), 40, random_state=0), saved once to JSON.
    bg_file = HERE / "model" / "shap_background.json"
    bg = json.loads(bg_file.read_text())["rows"] if bg_file.exists() else scenarios(W).sample(N_BACKGROUND, random_state=0).values
    EXPLAINER = ExactShap(W.mw, bg)
    print(f"✓ v2 model loaded: {len(MODEL.states)} states, base year {MODEL.base_year}")


_init()


# ───────────── helpers ─────────────
def _need_model():
    if MODEL is None:
        raise HTTPException(500, "Model not loaded")


def _scope_states(zone: str | None) -> list[str]:
    """'India' (or 'All') means every state; otherwise the states of that zone."""
    if zone and zone.strip().lower() in ("india", "all", "all india"):
        return sorted(MODEL.states)
    return MODEL.zone_states(zone or "")


def _default_gsdp(state: str, year: int) -> float:
    """State GSDP in `year` on its default path (its own recent growth rate)."""
    s = MODEL.states[state]
    by = MODEL.base_year
    return s["gsdp"][by] * (1 + s["gsdp_cagr"]) ** max(0, year - by)


def _targets(req: PredReq):
    """(state, population, gsdp) per state. A whole zone (or 'India') scales every member state's default
    GSDP path by the same factor, so the states keep their relative growth; population splits by 2024 share."""
    entire = not req.state or req.state.strip() in ("", "Entire Zone")
    if not entire:
        if req.state not in MODEL.states:
            raise HTTPException(400, f"Unknown state '{req.state}'")
        return [(req.state, req.population, req.gsdp_crore)], False
    states = _scope_states(req.zone)
    if not states:
        raise HTTPException(400, f"Unknown zone '{req.zone}'")
    dg = np.array([_default_gsdp(s, req.year) for s in states])
    ps = np.array([MODEL.states[s]["population"] for s in states])
    f = req.gsdp_crore / dg.sum()
    return [(s, req.population * p / ps.sum(), g * f) for s, p, g in zip(states, ps, dg)], True


def _forecast(state: str, year: int, gsdp: float | None) -> dict:
    p = MODEL.predict_state(state, year, gsdp if year > MODEL.base_year else None)
    return {TECH_KEY[t]: max(0.0, float(p[t])) for t in TECH}


def _financials(cap: dict, zone: str) -> dict:
    zm = ZONE_MULTIPLIERS.get(zone, 1.0)
    tc = tg = wl = top = 0.0
    bd = []
    for k in KEYS:
        mw, sp = cap.get(k, 0.0), COST_BENCHMARKS[k]
        cx = mw * sp["capex_cr_per_mw"] * zm
        gen = mw * 8760 * sp["cuf"] / 1000
        opex = gen * 1e6 * sp["lcoe_inr_per_kwh"] / 1e7  # annual production cost in Crore INR (GWh -> kWh)
        tc += cx; tg += gen; wl += gen * sp["lcoe_inr_per_kwh"]; top += opex
        bd.append({"id": k, "name": NAMES[k], "mw": round(mw, 2), "capexCr": round(cx, 2), "opexCr": round(opex, 2),
                   "annualGenGWh": round(gen, 2), "cufPct": round(sp["cuf"] * 100), "lcoe": sp["lcoe_inr_per_kwh"],
                   "co2OffsetTons": round(gen * 820), "color": COLORS[k],
                   "sharePct": round(mw / max(1, cap["total"]) * 100, 1)})
    return {"totalCapexCr": round(tc, 2), "totalGenerationGWh": round(tg, 2), "totalOpexCr": round(top, 2),
            "blendedLcoe": round(wl / tg, 2) if tg > 0 else 0, "totalCo2OffsetMTons": round(tg * 820 / 1e6, 2),
            "zoneMultiplier": zm, "breakdown": bd}


def _data_status(states: list[str], year: int) -> dict:
    """Where the numbers come from: reported data, nowcast (stale reports) or forecast."""
    by = MODEL.base_year
    last = {s: max(MODEL.states[s]["anchor"][t][0] for t in TECH) for s in states}  # last year with any new value
    stale = sorted(s for s, y in last.items() if y < by)
    if year > by:
        kind = "forecast"
    elif all(year <= y for y in last.values()):
        kind = "reported"
    else:
        kind = "nowcast"
    return {"kind": kind, "base_year": by, "last_fresh_report": last, "stale_states": stale}


# ───────────── endpoints ─────────────
@app.get("/")
def health():
    return {"status": "online", "model_loaded": MODEL is not None, "model": MODEL_NAME}


@lru_cache(maxsize=4)
def _demand(mtime: float) -> dict:
    return json.loads(DEMAND_FILE.read_text())


@app.get("/api/demand")
def demand():
    """Daily demand forecast. Read from the file written by demand_forecast/train.py (no model code runs here)."""
    if not DEMAND_FILE.exists():
        raise HTTPException(404, "Demand forecast not built - run demand_forecast/train.py")
    return _demand(DEMAND_FILE.stat().st_mtime)


@app.get("/api/meta")
def meta():
    _need_model()
    by = MODEL.base_year
    states = {s: {"zone": v["zone"], "population": v["population"], "gsdp": {int(y): g for y, g in v["gsdp"].items()},
                  "gsdp_cagr": v["gsdp_cagr"], "base_capacity_mw": {TECH_KEY[t]: m for t, m in MODEL.base_capacity(s).items()}}
              for s, v in MODEL.states.items()}
    zones = {z: MODEL.zone_states(z) for z in sorted({v["zone"] for v in MODEL.states.values()})}
    metrics = {}
    if METRICS_FILE.exists():
        mean = json.loads(METRICS_FILE.read_text())["mean"]
        metrics = {k: round(v["Total WAPE (fresh)"], 1) for k, v in mean.items()}
    return {"model": MODEL_NAME, "base_year": by, "end_year": 2047, "states": states, "zones": zones,
            "backtest_wape_fresh": metrics,
            "tech": [{"id": k, "name": NAMES[k]} for k in KEYS],
            "benchmarks": COST_BENCHMARKS, "zone_multipliers": ZONE_MULTIPLIERS,
            "params": {SHORT[t]: {"trend_now": round(p["a_ref"], 3), "gsdp_beta": round(p["beta"], 2),
                                  "catchup_kappa": round(p["kappa"], 3), "transmission_gamma": round(p.get("gamma", 0), 3),
                                  "dynamics": p.get("dynamics", "v2")} for t, p in MODEL.params.items()},
            "transmission": {"source": "CEA yearly transmission reports via npp.gov.in", "last_fy_end": MODEL.tx_last,
                             "km_by_state_year": MODEL.tx_km}}


@lru_cache(maxsize=64)
def _map(year: int) -> dict:
    out = {}
    for s, v in MODEL.states.items():
        cap = _forecast(s, year, None)
        cap["total"] = sum(cap.values())
        fin = _financials(cap, v["zone"])
        out[s] = {"zone": v["zone"], "totalMW": round(cap["total"], 1), "totalCapexCr": round(fin["totalCapexCr"]),
                  "totalGenerationGWh": round(fin["totalGenerationGWh"]), "blendedLcoe": fin["blendedLcoe"],
                  "breakdown": [{k: b[k] for k in ("id", "name", "mw", "color", "sharePct", "capexCr")}
                                for b in fin["breakdown"]]}
    return out


@app.get("/api/map")
def map_forecast(year: int = Query(ge=2006, le=2050)):
    """Each state on its default path (GSDP at its own 10-year growth rate)."""
    _need_model()
    return {"year": year, "assumption": "each state's GSDP grows at its own recent rate", "states": _map(year)}


@app.post("/api/predict")
@app.post("/predict")
def predict(req: PredReq):
    _need_model()
    targets, entire = _targets(req)
    cap = dict.fromkeys(KEYS, 0.0)
    for st, _, g in targets:
        for k, v in _forecast(st, req.year, g).items():
            cap[k] += v
    cap = {k: round(v, 2) for k, v in cap.items()}
    cap["total"] = round(sum(cap.values()), 2)

    by = MODEL.base_year
    g_base = sum(MODEL.states[s]["gsdp"][by] for s, _, _ in targets)
    implied = (req.gsdp_crore / g_base) ** (1 / (req.year - by)) - 1 if req.year > by else None
    return {
        "status": "success", "model_used": MODEL_NAME,
        "inputs": {"zone": req.zone, "state": req.state or "Entire Zone", "year": req.year,
                   "population": req.population, "gsdp_crore": req.gsdp_crore},
        "engineered_features": {"gsdp_per_capita": round((req.gsdp_crore * 1e7) / (req.population + 1), 2),
                                "years_since_2006": req.year - 2006,
                                "gsdp_base_crore": round(g_base, 1),
                                "implied_gsdp_growth_pct": round(implied * 100, 2) if implied is not None else None},
        "data_status": _data_status([s for s, _, _ in targets], req.year),
        "predicted_capacity_mw": cap,
        "financial_analysis": _financials(cap, req.zone),
    }


class ScenarioReq(BaseModel):
    scope: str = Field(pattern="^(india|zone|state)$")
    zone: Optional[str] = None
    state: Optional[str] = None
    year: int = Field(ge=2024, le=2047)
    gsdp_crore: Optional[float] = Field(default=None, gt=0, description="GSDP of the whole scope in `year`; None = default path")


def _fin_multi(per_state: dict[str, np.ndarray]) -> dict:
    """Financials for several states, each with its own zone cost multiplier, summed."""
    tot = None
    for s, mw in per_state.items():
        cap = {k: float(v) for k, v in zip(KEYS, mw)}
        cap["total"] = float(sum(mw))
        f = _financials(cap, MODEL.states[s]["zone"])
        if tot is None:
            tot = {k: f[k] for k in ("totalCapexCr", "totalGenerationGWh", "totalOpexCr")}
            tot["by_tech"] = {b["id"]: {"mw": b["mw"], "capexCr": b["capexCr"], "opexCr": b["opexCr"], "genGWh": b["annualGenGWh"]}
                              for b in f["breakdown"]}
        else:
            for k in ("totalCapexCr", "totalGenerationGWh", "totalOpexCr"):
                tot[k] += f[k]
            for b in f["breakdown"]:
                d = tot["by_tech"][b["id"]]
                d["mw"] += b["mw"]; d["capexCr"] += b["capexCr"]; d["opexCr"] += b["opexCr"]; d["genGWh"] += b["annualGenGWh"]
    g = tot["totalGenerationGWh"]
    tot["blendedLcoe"] = round(sum(tot["by_tech"][k]["genGWh"] * COST_BENCHMARKS[k]["lcoe_inr_per_kwh"] for k in KEYS) / g, 3) if g else 0
    return tot


@app.post("/api/scenario")
def scenario(req: ScenarioReq):
    """Everything the dashboard needs for one view, in one call.
    The GSDP scenario scales the default GSDP path of every state in scope by the same factor; states outside
    the scope stay on their default path. Population is not a model input, so it is not taken here."""
    _need_model()
    by = MODEL.base_year
    names = sorted(MODEL.states)
    if req.scope == "india":
        scope = names
        scope_name = "India"
    elif req.scope == "zone":
        scope = _scope_states(req.zone)
        if not scope:
            raise HTTPException(400, f"Unknown zone '{req.zone}'")
        scope_name = f"{req.zone} zone"
    else:
        if req.state not in MODEL.states:
            raise HTTPException(400, f"Unknown state '{req.state}'")
        scope = [req.state]
        scope_name = req.state
    in_scope = set(scope)
    n = req.year - by

    base = np.array([[MODEL.base_capacity(s)[t] for t in TECH] for s in names])
    zones = np.array([MODEL.states[s]["zone"] for s in names])
    gb = np.array([MODEL.states[s]["gsdp"][by] for s in names])
    cg = np.array([MODEL.states[s]["gsdp_cagr"] for s in names])
    tx = np.array([MODEL.tx_forward(s) for s in names])
    mask = np.array([s in in_scope for s in names])

    default_gsdp = float(sum(_default_gsdp(s, req.year) for s in scope))
    factor = 1.0
    if req.gsdp_crore and n > 0:
        factor = req.gsdp_crore / default_gsdp
    log_default = np.log1p(cg)
    log_scen = log_default + np.where(mask, np.log(factor) / n if n > 0 else 0.0, 0.0)

    def at_year(log_growth, k):
        if k <= 0:
            return base.copy()
        return MODEL.forecast_batch(base, zones, gb, log_growth, np.full(len(names), k), tx)

    mw = at_year(log_scen, n)
    mw_def = at_year(log_default, n) if factor != 1.0 else mw

    # trajectory of the scope, 2024..2047, one vectorised call
    idx = np.where(mask)[0]
    ks = np.arange(0, 2047 - by + 1)
    rows = np.repeat(idx, len(ks))
    kk = np.tile(ks, len(idx))
    traj_all = MODEL.forecast_batch(base[rows], zones[rows], gb[rows], log_scen[rows], kk, tx[rows])
    traj = traj_all.reshape(len(idx), len(ks), 5).sum(0)

    def scope_fin(arr):
        return _fin_multi({names[i]: arr[i] for i in idx})

    fin = scope_fin(mw)
    fin_def = scope_fin(mw_def)
    fin_24 = scope_fin(base)
    pop_base = float(sum(MODEL.states[s]["population"] for s in scope))
    g24 = float(sum(MODEL.states[s]["gsdp"][by] for s in scope))
    used = default_gsdp * factor
    return {
        "model": MODEL_NAME, "year": req.year, "base_year": by,
        "scope": req.scope, "scope_name": scope_name, "scope_states": scope,
        "data_status": _data_status(scope, req.year),
        "gsdp": {"base_crore": round(g24, 1), "default_crore": round(default_gsdp, 1), "used_crore": round(used, 1),
                 "default_growth_pct": round(((default_gsdp / g24) ** (1 / n) - 1) * 100, 2) if n > 0 else None,
                 "growth_pct": round(((used / g24) ** (1 / n) - 1) * 100, 2) if n > 0 else None,
                 "custom": bool(abs(factor - 1) > 1e-9)},
        "population_base": pop_base,
        "states": {s: {"zone": MODEL.states[s]["zone"], "population": MODEL.states[s]["population"],
                       "mw": [round(float(v), 2) for v in mw[i]], "default_mw": [round(float(v), 2) for v in mw_def[i]]}
                   for i, s in enumerate(names)},
        "capacity_mw": dict(zip(KEYS, [round(float(v), 2) for v in mw[idx].sum(0)])),
        "default_total_mw": round(float(mw_def[idx].sum()), 2),
        "base_total_mw": round(float(base[idx].sum()), 2),
        "financials": fin, "financials_default": fin_def, "financials_2024": fin_24,
        "trajectory": {"years": [int(by + k) for k in ks], "mw": [[round(float(v), 2) for v in r] for r in traj]},
    }


@app.post("/api/explain")
def explain(req: PredReq):
    """Exact SHAP values (all 2^11 feature coalitions) of the forecast in MW, against a background of
    realistic state/year/GSDP scenarios. For a whole zone, each state's explanation is summed.
    Results are cached: an all-India breakdown takes several seconds on a small serverless CPU."""
    _need_model()
    if not req.state or req.state.strip() in ("", "Entire Zone"):
        # Default-path breakdowns for India and each zone are precomputed (model/precompute_explain.py).
        key = "India" if (req.zone or "").strip().lower() in ("india", "all", "all india") else req.zone
        pre = EXPLAIN_DEFAULTS.get(key, {}).get(str(req.year))
        if pre and abs(req.gsdp_crore / pre["default_gsdp_crore"] - 1) < 1e-4:
            return pre
    return _explain_cached(req.zone, req.state, req.year, round(req.population), round(req.gsdp_crore, 1))


@lru_cache(maxsize=256)
def _explain_cached(zone, state, year, population, gsdp_crore):
    return _explain(PredReq(zone=zone, state=state, year=year, population=population, gsdp_crore=gsdp_crore))


def _explain(req: PredReq):
    targets, entire = _targets(req)
    by = MODEL.base_year
    if req.year <= by:
        return {"available": False,
                "reason": f"Years up to {by} come from reported data (or the nowcast for stale states), not the forecast."}
    n = req.year - by
    X = np.array([W.row(s, req.year, (g / MODEL.states[s]["gsdp"][by]) ** (1 / n) - 1, population=p)
                  for s, p, g in targets])
    sv_values, sv_base = EXPLAINER(X)                    # (states, features, techs) in MW, (states, techs)
    vals = sv_values.sum(0)                              # (features, techs)
    base = sv_base.sum(0)                                # (techs,)
    pred = W.mw(X).sum(0)

    k = len(targets)
    zone_name = W.zones[int(X[0, 3])]
    tx_km = sum(MODEL.tx_forward_km(s) for s, _, _ in targets)
    tx_years = f"FY{str(by + 1)[2:]}–{str(MODEL.tx_last)[2:]}" if MODEL.tx_last and MODEL.tx_last > by else "none"
    shown = [str(req.year), f"{X[0, 1]:.1f}%/yr", f"{X[:, 2].sum():.2f} Cr", zone_name,
             f"₹{X[:, 4].sum():.2f}L Cr"] + [f"{X[:, CAP0 + j].sum():,.0f} MW" for j in range(5)] \
        + [f"{tx_km:,.0f} km ({tx_years})"]
    labels = ["Forecast year", "GSDP growth", "Population", "Zone", "2024 economy size (GSDP)"] \
        + [f"Existing {SHORT[t].lower()} base (2024)" for t in TECH] + ["Renewable transmission lines built"]
    contrib = [{"feature": f, "label": lab, "value": v, "mw": round(float(vals[i].sum()), 1),
                "by_tech": {TECH_KEY[t]: round(float(vals[i, j]), 1) for j, t in enumerate(TECH)}}
               for i, (f, lab, v) in enumerate(zip(FEATURES, labels, shown))]
    contrib.sort(key=lambda c: -abs(c["mw"]))
    return {
        "available": True,
        "method": f"Exact SHAP over {len(FEATURES)} inputs vs {N_BACKGROUND} background scenarios",
        "baseline_label": "Average scenario" + (f" × {k} states" if k > 1 else ""),
        "baseline_mw": round(float(base.sum()), 1),
        "prediction_mw": round(float(pred.sum()), 1),
        "additivity_error_mw": float(abs(base.sum() + vals.sum() - pred.sum())),
        "contributions": contrib,
        "unused_features": [c["label"] for c in contrib if abs(c["mw"]) < 1e-6],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend_api:app", host="127.0.0.1", port=8000, reload=False)
