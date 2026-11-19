"""
Precompute the SHAP breakdown for all of India and for each zone, on the default GSDP path, for every forecast
year. A multi-state breakdown runs the model for every state and every feature coalition, which takes ~20 s on a
small serverless CPU; with this file the API answers the default views instantly and only computes live when the
user changes GSDP for a zone or all of India.

    .venv/bin/python model/precompute_explain.py      # writes model/explain_defaults.json
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import backend_api as api  # noqa: E402

out = {"note": "Default-path SHAP breakdowns for India and each zone; see model/precompute_explain.py", "scopes": {}}
t0 = time.time()
scopes = ["India"] + sorted({v["zone"] for v in api.MODEL.states.values()})
for zone in scopes:
    states = api._scope_states(zone)
    out["scopes"][zone] = {}
    for year in range(api.MODEL.base_year + 1, 2048):
        gsdp = sum(api._default_gsdp(s, year) for s in states)
        pop = sum(api.MODEL.states[s]["population"] for s in states) * 1.008 ** (year - api.MODEL.base_year)
        res = api._explain(api.PredReq(zone=zone, state=None, year=year, population=pop, gsdp_crore=gsdp))
        res["default_gsdp_crore"] = round(gsdp, 1)
        out["scopes"][zone][str(year)] = res
    print(f"{zone}: done ({time.time() - t0:.0f}s)")
(ROOT / "model" / "explain_defaults.json").write_text(json.dumps(out, separators=(",", ":")))
print("wrote model/explain_defaults.json")
