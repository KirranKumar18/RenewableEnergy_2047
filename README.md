# ⚡ Renewable Energy 2047 — Capacity & Cost Forecasting Dashboard
### ExxonMobil Innothon Challenge | Multi-Output Voting Regressor & CERC Cost Analysis

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
