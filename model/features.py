"""
The v2 model as a function of a flat feature vector, shared by the SHAP/LIME report (explain.py)
and the API (backend_api.py).

Features
    Forecast year              target year
    GSDP growth (%/yr)         yearly GSDP growth implied by the target-year GSDP the user enters
    Population (crore)         sent by the dashboard, NOT used by the model (sanity check: SHAP = 0)
    Zone                       the state's zone (catch-up target differs by zone), integer code
    2024 GSDP (lakh crore)     size of the state economy at the base year
    2024 <tech> MW  (x5)       the state's installed base per technology (nowcast where reports are stale)
    RE transmission 2025-26    the state's renewable-related transmission build-out in the forecast years that
                               have CEA reports (demeaned log index; 0 = average state)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from re_model import TECH
from convergence_model import ConvergenceModel

SHORT = {"Solar Power": "Solar", "Wind Power": "Wind", "Bio-Mass Power": "Bio-Mass",
         "Small Hydro Power": "Small Hydro", "Waste to Energy": "Waste-to-Energy"}
FEATURES = ["Forecast year", "GSDP growth (%/yr)", "Population (crore)", "Zone", "2024 GSDP (lakh crore)"] \
    + [f"2024 {SHORT[t]} MW" for t in TECH] + ["RE transmission 2025-26"]
CAP0 = 5  # first capacity column
TX = 10   # transmission index column


class Wrapped:
    """Model as a function of the FEATURES matrix; Zone is an integer code into `zones`."""
    def __init__(self, model: ConvergenceModel):
        self.m = model
        self.zones = sorted(model.zone_intensity[TECH[0]])

    def mw(self, X) -> np.ndarray:
        X = np.asarray(X, float)
        zone = np.array(self.zones)[np.clip(np.rint(X[:, 3]).astype(int), 0, len(self.zones) - 1)]
        # clamp to valid ranges: LIME's Gaussian samples can go negative
        return self.m.forecast_batch(np.clip(X[:, CAP0:CAP0 + 5], 0, None), zone, np.clip(X[:, 4], 1e-3, None) * 1e5,
                                     np.log1p(np.clip(X[:, 1], -50, None) / 100), np.clip(X[:, 0] - self.m.base_year, 0, None),
                                     X[:, TX])

    def gw_total(self, X):
        return self.mw(X).sum(1) / 1000

    def row(self, state, year, cagr, pop_cagr=0.008, population=None):
        """Feature vector for `state` in `year` with GSDP growing at `cagr` (fraction per year)."""
        s = self.m.states[state]; b = self.m.base_capacity(state); n = year - self.m.base_year
        pop = population if population is not None else s["population"] * (1 + pop_cagr) ** n
        return np.array([year, cagr * 100, pop / 1e7, self.zones.index(s["zone"]),
                         s["gsdp"][self.m.base_year] / 1e5] + [b[t] for t in TECH] + [self.m.tx_forward(state)], float)


def scenarios(W: Wrapped, n_per_state=40, seed=0) -> pd.DataFrame:
    """Realistic background: every state, random future year, GSDP growth 2-10%/yr."""
    rng = np.random.default_rng(seed)
    rows = []
    for st in W.m.states:
        for _ in range(n_per_state):
            rows.append(W.row(st, int(rng.integers(W.m.base_year + 1, 2048)), rng.uniform(0.02, 0.10),
                              rng.uniform(0.0, 0.015)))
    return pd.DataFrame(rows, columns=FEATURES)
