<div align="center">

# ⚡ India Electricity Generation to 2047

### Forecasting India's electricity future for **ExxonMobil Innothon**

[![Python](https://img.shields.io/badge/Python-50.6%25-3776AB?logo=python&logoColor=white)](https://github.com/KirranKumar18/RenewableEnergy_2047)
[![JavaScript](https://img.shields.io/badge/JavaScript-49.1%25-F7DF1E?logo=javascript&logoColor=323330)](https://github.com/KirranKumar18/RenewableEnergy_2047)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

*A data-driven dashboard and forecasting system for India's national and regional electricity generation outlook.*

</div>

---

## 🌏 The Vision

India's centenary in 2047 demands a resilient, scalable electricity system. This project explores how **actual electricity generation** may grow across India and its five grid regions, accounting for economic growth and demographic change.

> [!IMPORTANT]
> The challenge forecast uses **energy generation only**. Installed capacity and electricity consumption are excluded from the forecast and comparisons.

## 📈 2047 Forecast Snapshot

| Metric | Projection |
|:--|--:|
| 🇮🇳 National generation | **5,778 TWh** |
| 80% uncertainty band | **4,755–6,905 TWh** |
| FY2025-26 generation | **1,840 TWh** |
| Mean 1–5 year backtest error | **2.4%** |
| Naive trend backtest error | **5.8%** |

## ✨ What the Dashboard Offers

- **National and regional forecasts** through 2047
- **Five-grid-region analysis**: North, South, East, West and North-East
- **GDP outlook scenarios** and economic assumptions
- **Interactive demand forecasting** for the next 28 days
- **Regional balance and mix analysis**
- **Transparent methodology and backtest reports**
- **FastAPI backend** with live forecasting endpoints

## 🧭 Project Views

| View | Purpose |
|:--|:--|
| **Generation** | Long-range electricity generation forecast to 2047 |
| **Renewable capacity** | Regional renewable capacity analysis |
| **Demand** | Short-term all-India daily electricity demand forecast |
| **Reports** | Model outputs, backtests, assumptions and limitations |

## 🛠️ Technology Stack

| Frontend | Backend & ML | Visualization |
|:--|:--|:--|
| React 19 | Python | Chart.js |
| Vite 7 | FastAPI | Leaflet |
| Tailwind CSS | scikit-learn | Interactive SVG / JSON |

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/KirranKumar18/RenewableEnergy_2047.git
cd RenewableEnergy_2047
```

### 2. Set up the Python environment

```bash
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Start the dashboard

```bash
npm install
npm run dev
```

Open **http://localhost:3000**.

### 4. Start the API backend

```bash
python backend_api.py
```

The API runs at **http://localhost:8000**.

## 🔬 Reproduce the Generation Forecast

```bash
.venv/bin/python model/generation/parse_cea_re.py
.venv/bin/python model/generation/build_dataset.py
.venv/bin/python model/generation/forecast.py
```

The production dashboard reads `public/generation_forecast.json` for its main forecast display.

## 📊 Model Data and Reports

- [`reports/generation/`](reports/generation/) — generation forecasts, regional results and backtests
- [`reports/demand/`](reports/demand/) — daily demand forecasting methodology and evaluation
- [`reports/README.md`](reports/README.md) — detailed capacity-model research and limitations
- [`public/`](public/) — dashboard data assets
- [`model/`](model/) — forecasting and model-generation scripts

## 🗂️ Repository Structure

```text
RenewableEnergy_2047/
├── api/                     # Serverless API assets
├── data/                    # Raw and processed datasets
├── demand_forecast/         # 28-day demand forecasting model
├── model/                   # Energy and generation models
├── public/                  # Dashboard forecast JSON and assets
├── reports/                 # Charts, forecasts and model reports
├── src/                     # React dashboard source
├── backend_api.py           # FastAPI backend
├── index.html               # Application entry point
└── package.json             # Frontend dependencies and scripts
```

## ⚠️ Modeling Limitations

- Long-range forecasts remain extrapolations and become more uncertain toward 2047.
- Historical reporting can contain stale or revised values.
- GDP pathways, population assumptions and policy shifts can materially change results.
- Daily demand forecasts are based on short historical coverage and do not include weather observations.

## 🤝 Contributing

Contributions, issues and suggestions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

## 📄 License

This project is available for educational and research use under the **MIT License**.

<div align="center">

**Built for a cleaner, smarter and more resilient India by 2047.** 🇮🇳

</div>
