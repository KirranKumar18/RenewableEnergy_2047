The system splits inputs into **Dynamic Frontend Fields** (what the user enters on your website), **Engineered Features** (calculated automatically in the backend), **Model Hyperparameters** (internal ML tuning), and **Financial Benchmarks** (used to compute cost).

### 1. Dynamic Fields Required from the Frontend

Your website form or API request only needs to send **4 to 5 input fields** to the backend function `predict_energy_and_cost()`:

* **Zone (Required String — Dropdown):** The geographical region of India (`South`, `North`, `West`, `East`, `Central`, or `North-East`). It groups states by climate/solar-wind potential and applies regional terrain cost multipliers.


* **State (Optional String — Dropdown):** A specific state or union territory within that Zone (e.g., `Karnataka`, `Tamil Nadu`). If the user selects `"Entire Zone / All States"` (`state=None`), the backend automatically distributes the population and GSDP across all states in that zone and sums their predicted capacities.


* **Year (Required Integer — Slider/Number Input):** The target forecast year (e.g., `2026` to `2035`). It drives the temporal adoption trend.


* **Population (Required Float — Number Input):** Projected population of the selected state or zone for that target year (e.g., `72000000`).


* **GSDP in Crore INR (Required Float — Number Input):** Projected Gross State Domestic Product in Crore INR (e.g., `2850000`). Because GSDP has the strongest correlation with Bio-Mass (`0.78`), Wind (`0.72`), and Solar (`0.56`), this is the primary economic driver of the prediction.



---

### 2. Auto-Calculated Backend Features

Your frontend does **not** need to ask the user for these; the backend computes them automatically inside `add_engineered_features()` before feeding the data to the model:

* **GSDP_Per_Capita:** Calculated as $\frac{\text{GSDP (Crore INR)} \times 10^7}{\text{Population} + 1}$. Because Population and GSDP are heavily correlated (`0.68`), raw numbers alone can confuse tree splits; per-capita wealth gives a clean signal of state affluence.


* **Years_Since_2006:** Calculated as $\text{Year} - 2006$ (since 2006 is the baseline start year in your dataset). It helps tree models track the pace of renewable adoption over time.



---

### 3. Machine Learning Model Hyperparameters

The pipeline wraps four distinct regression algorithms inside a `MultiOutputRegressor` (so it predicts all 5 energy sources at once) using a weighted `VotingRegressor`:

| Parameter | Value Used | What It Does in Simple Terms |
| --- | --- | --- |
| `n_estimators` / `iterations` | `600` (Boosters), `400` (RF) | Number of decision trees built sequentially (boosting) or in parallel (Random Forest) to learn patterns. |
| `learning_rate` | `0.04` | Slows down how fast each new tree corrects previous errors, preventing the model from memorizing noise on a 635-row dataset.

 |
| `max_depth` / `depth` | `6` (Boosters), `14` (RF) | Limits how deep each tree can branch so it captures regional/state interactions without overfitting. |
| `subsample` & `colsample_bytree` | `0.85` | Trains each XGBoost tree on a random 85% slice of rows and features to improve accuracy on unseen future years. |
| `weights` | `[3, 2, 3, 2]` | Gives slightly higher voting power to **XGBoost (3)** and **CatBoost (3)** over **LightGBM (2)** and **Random Forest (2)** based on their strength with tabular state data. |
| `handle_unknown` | `'ignore'` | Ensures `OneHotEncoder` won't crash if the frontend passes an unrecognized state or region label. |

---

### 4. Financial & Cost Parameters (CERC / MNRE Benchmarks)

Because the raw dataset only contains Megawatts (MW), the post-processing layer uses four domain parameters per energy source to calculate costs:

* **CAPEX (`capex_cr_per_mw`):** One-time capital setup cost in Crore INR to install 1 MW of capacity (ranging from **₹4.50 Cr/MW** for Solar to **₹11.00 Cr/MW** for Waste-to-Energy).
* **CUF (`cuf` — Capacity Utilization Factor):** The fraction of the year (out of 8,760 hours) that a power plant actively generates electricity based on weather or fuel availability (e.g., **21%** for Solar, **30%** for Wind, **75%** for Bio-Mass).
* **LCOE (`lcoe_inr_per_kwh`):** Levelized Cost of Energy—the ongoing production cost in INR to generate 1 unit (kWh) of electricity (ranging from **₹2.50/kWh** for Solar to **₹6.20/kWh** for Waste-to-Energy).
* **Zone Multiplier (`ZONE_COST_MULTIPLIER`):** Adjusts costs for logistics and terrain (e.g., `1.15` for `North-East` due to mountainous transport challenges vs. `0.98` for `West`).

Would you like a ready-to-use **FastAPI / Flask endpoint script** and a **React/Next.js frontend form** that connects directly to this `.pkl` model?