"""
Write the SHAP background rows the API uses (model/shap_background.json). Rerun after retraining the
model, because the rows hold zone indices and 2024 capacities from the fitted model. Needs the `shap`
package, which is a development dependency only; the deployed API reads the JSON.

    .venv/bin/python model/make_shap_background.py
"""
import json
import sys
from pathlib import Path

import shap

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from convergence_model import ConvergenceModel  # noqa: E402
from features import FEATURES, Wrapped, scenarios  # noqa: E402

W = Wrapped(ConvergenceModel.from_json(HERE / "re2047_model.json"))
bg = shap.sample(scenarios(W), 40, random_state=0)
(HERE / "shap_background.json").write_text(json.dumps({
    "features": FEATURES,
    "note": "shap.sample(scenarios(W), 40, random_state=0) - SHAP background for backend_api.py; "
            "see model/make_shap_background.py",
    "zones": W.zones,
    "rows": bg.values.tolist(),
}))
print(f"wrote {len(bg)} rows; zones {W.zones}")
