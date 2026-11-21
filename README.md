# India Electricity Generation to 2047
### ExxonMobil Innothon: Forecasting India's Energy Production and Strategizing its Fulfillment by 2047

The dashboard and model forecast India's **electricity generation (= production)**, nationally and for the five grid regions, to 2047. They account for population growth and urbanization, and propose a region-specific generation mix (coal, gas, nuclear, hydro, solar, wind, bio, waste) based on each region's resources.

**Challenge rule:** only energy generated is used. No installed-capacity or consumption data enters any forecast or comparison.

- Headline (Viksit Bharat GDP outlook): **5,778 TWh in 2047**, with an 80% band of 4,755–6,905. FY2025-26 was 1,840 TWh.
- Backtest: 2.4% mean error 1–5 years ahead, against 5.8% for a naive trend.
- Full method, assumptions and uncertainties: [`reports/generation/README.md`](reports/generation/README.md)

```bash
.venv/bin/python model/generation/parse_cea_re.py && .venv/bin/python model/generation/build_dataset.py && .venv/bin/python model/generation/forecast.py
npm run dev    # http://localhost:3000, a static dashboard reading public/generation_forecast.json
```

---

## Archived: capacity model (not used for the challenge forecast)

The sections below describe the earlier installed-capacity model. It is kept for reference only; the challenge rule rules out capacity as a forecasting basis.


A reactive dashboard designed to forecast India's renewable energy growth through 2047 (India's Centenary Net-Zero Target) across **5 distinct energy technologies**:
- ☀️ **Solar Power**
- 💨 **Wind Power**
- 🌿 **Bio-Mass Power**
- 💧 **Small Hydro Power**
- ♻️ **Waste to Energy**

---

## 🚀 Quick Start

### 1. Run the Frontend (React + Vite + Tailwind CSS)
The Vite dev server runs at `http://localhost:3000`:
```bash
npm run dev
```

### 2. Connect Your Model Pickle File (`model.pkl`)
A FastAPI backend service is provided in `backend_api.py`.
1. Place your `.pkl` or `.joblib` model file into this directory (or name it `model.pkl`).
2. Start the API server:
```bash
python backend_api.py
```
3. The server runs at `http://localhost:8000`. The frontend will automatically detect the active API and switch from client emulation to live pickle inference!

---

## 📊 Features & Architecture

### Dynamic User Inputs (Frontend)
- **Zone (Dropdown):** `South`, `North`, `West`, `East`, `Central`, `North-East`
- **State (Dropdown):** 34 states/UTs or *"Entire Zone / All States"* auto-distribution
- **Target Year (Slider):** 2026 to 2047 with milestone presets (2030 India 500 GW goal, 2047 Net Zero)
- **Population & GSDP in Crore INR:** Interactive sliders with automatic historical trend projection buttons

### Auto-Engineered Backend Features
- **GSDP Per Capita:** `(GSDP * 10^7) / (Population + 1)`
- **Years Since 2006:** `Year - 2006`

### Financial CERC & MNRE Benchmarks
- **Solar:** ₹4.50 Cr/MW | CUF 21% | LCOE ₹2.50/kWh
- **Wind:** ₹6.50 Cr/MW | CUF 30% | LCOE ₹3.10/kWh
- **Bio-Mass:** ₹6.00 Cr/MW | CUF 75% | LCOE ₹4.50/kWh
- **Small Hydro:** ₹8.50 Cr/MW | CUF 45% | LCOE ₹3.80/kWh
- **Waste-to-Energy:** ₹11.00 Cr/MW | CUF 75% | LCOE ₹6.20/kWh
- **Regional Terrain Multipliers:** North-East (1.15x), East (1.05x), North (1.02x), Central (1.00x), South (1.00x), West (0.98x)
