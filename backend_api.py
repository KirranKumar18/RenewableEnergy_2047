"""
Backend FastAPI — Renewable Energy 2047 Forecast API
Powered by india_energy_forecast_model.pkl
"""
import os, json, joblib, numpy as np, pandas as pd
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="RE 2047 API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ─── globals ───
PIPELINE = None
TARGET_COLS = None
COST_BENCHMARKS = None
ZONE_MULTIPLIERS = None
ZONE_TO_STATES = None
STATE_SHARES = {}

class PredReq(BaseModel):
    zone: str
    state: Optional[str] = None
    year: int = Field(ge=2006, le=2050)
    population: float = Field(gt=0)
    gsdp_crore: float = Field(gt=0)

def _init():
    global PIPELINE, TARGET_COLS, COST_BENCHMARKS, ZONE_MULTIPLIERS, ZONE_TO_STATES, STATE_SHARES
    pkl = os.path.join(os.path.dirname(os.path.abspath(__file__)), "india_energy_forecast_model.pkl")
    if not os.path.exists(pkl):
        print("WARNING: pkl not found at", pkl); return
    m = joblib.load(pkl)
    PIPELINE       = m["pipeline"]
    TARGET_COLS    = m["target_cols"]
    COST_BENCHMARKS = m["cost_benchmarks"]
    ZONE_MULTIPLIERS = m["zone_multipliers"]
    ZONE_TO_STATES = m["zone_to_states"]
    print("✓ Pipeline loaded. Targets:", TARGET_COLS)

    sj = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state_data.json")
    if os.path.exists(sj):
        sd = json.load(open(sj))
        zpop, zgdp = {}, {}
        for st, d in sd.items():
            z = d["zone"]; zpop[z] = zpop.get(z,0)+d["pop_latest"]; zgdp[z] = zgdp.get(z,0)+d["gsdp_latest"]
        for st, d in sd.items():
            z = d["zone"]
            STATE_SHARES[st] = {"pw": d["pop_latest"]/max(1,zpop[z]), "gw": d["gsdp_latest"]/max(1,zgdp[z])}

_init()

@app.get("/")
def health():
    return {"status":"online","model_loaded": PIPELINE is not None}

@app.post("/api/predict")
@app.post("/predict")
def predict(req: PredReq):
    if PIPELINE is None:
        raise HTTPException(500, "Model not loaded")
    zone, year, tpop, tgsdp = req.zone, req.year, req.population, req.gsdp_crore
    entire = not req.state or req.state.strip() == "" or req.state == "Entire Zone"
    states = ZONE_TO_STATES.get(zone, [zone]) if entire else [req.state]

    rows = []
    for st in states:
        if entire and len(states)>1 and st in STATE_SHARES:
            sp = tpop*STATE_SHARES[st]["pw"]; sg = tgsdp*STATE_SHARES[st]["gw"]
        elif entire and len(states)>1:
            sp = tpop/len(states); sg = tgsdp/len(states)
        else:
            sp = tpop; sg = tgsdp
        rows.append({"Zone":zone,"State":st,"Year":year,"Population":sp,
                      "GSDP (crore INR)":sg,"GSDP_Per_Capita":(sg*1e7)/(sp+1),"Years_Since_2006":year-2006})

    preds = np.clip(PIPELINE.predict(pd.DataFrame(rows)), 0, None)
    tot = np.sum(preds, axis=0)

    cap = {}
    for col, val in zip(TARGET_COLS, tot):
        v = round(float(val),2)
        if "Solar" in col: cap["solar"]=v
        elif "Wind" in col: cap["wind"]=v
        elif "Bio" in col: cap["bio"]=v
        elif "Hydro" in col: cap["hydro"]=v
        elif "Waste" in col: cap["waste"]=v
    cap["total"] = round(sum(cap.values()),2)

    zm = ZONE_MULTIPLIERS.get(zone, 1.0)
    bm = {
        "solar": COST_BENCHMARKS.get("Installed - Solar Power",        {"capex_cr_per_mw":4.5, "cuf":0.21,"lcoe_inr_per_kwh":2.5}),
        "wind":  COST_BENCHMARKS.get("Installed - Wind Power",         {"capex_cr_per_mw":7.9, "cuf":0.30,"lcoe_inr_per_kwh":3.2}),
        "bio":   COST_BENCHMARKS.get("Installed - Bio-Mass Power",     {"capex_cr_per_mw":6.85,"cuf":0.75,"lcoe_inr_per_kwh":5.4}),
        "hydro": COST_BENCHMARKS.get("Installed - Small Hydro Power",  {"capex_cr_per_mw":10.5,"cuf":0.45,"lcoe_inr_per_kwh":4.1}),
        "waste": COST_BENCHMARKS.get("Installed - Waste to Energy",    {"capex_cr_per_mw":11.0,"cuf":0.70,"lcoe_inr_per_kwh":6.2}),
    }
    names = {"solar":"Solar Power","wind":"Wind Power","bio":"Bio-Mass Power","hydro":"Small Hydro Power","waste":"Waste to Energy"}
    colors= {"solar":"#F59E0B","wind":"#06B6D4","bio":"#10B981","hydro":"#3B82F6","waste":"#A855F7"}

    tc,tg,wl = 0,0,0
    bd = []
    for k in ["solar","wind","bio","hydro","waste"]:
        mw = cap.get(k,0); sp = bm[k]
        cx = mw*sp["capex_cr_per_mw"]*zm
        gen = mw*8760*sp["cuf"]/1000
        opex = gen * sp["lcoe_inr_per_kwh"] * 1000 / 1e7   # annual production cost in Crore INR
        tc+=cx; tg+=gen; wl+=gen*sp["lcoe_inr_per_kwh"]
        bd.append({"id":k,"name":names[k],"mw":round(mw,2),"capexCr":round(cx,2),
                   "opexCr": round(opex,2),
                   "annualGenGWh":round(gen,2),"cufPct":round(sp["cuf"]*100),
                   "lcoe":sp["lcoe_inr_per_kwh"],"co2OffsetTons":round(gen*820),
                   "color":colors[k],"sharePct":round(mw/max(1,cap["total"])*100,1)})

    blcoe = wl/tg if tg>0 else 0
    return {
        "status":"success","model_used":"india_energy_forecast_model.pkl",
        "inputs":{"zone":zone,"state":req.state or "Entire Zone","year":year,"population":tpop,"gsdp_crore":tgsdp},
        "engineered_features":{"gsdp_per_capita":round((tgsdp*1e7)/(tpop+1),2),"years_since_2006":year-2006},
        "predicted_capacity_mw": cap,
        "financial_analysis":{
            "totalCapexCr":round(tc,2),"totalGenerationGWh":round(tg,2),
            "blendedLcoe":round(blcoe,2),"totalCo2OffsetMTons":round(tg*820/1e6,2),
            "zoneMultiplier":zm,"breakdown":bd
        }
    }

if __name__=="__main__":
    import uvicorn; uvicorn.run("backend_api:app", host="127.0.0.1", port=8000, reload=False)
