# GRIDGUARD — Smart Grid Digital Twin & AI Loss Investigation

> **Detect. Explain. Prioritize. Protect the Grid.**

GRIDGUARD is a Smart Grid electricity-loss and anomaly detection platform featuring an interactive 3D Distribution Digital Twin, a dual-stage Machine Learning engine (LightGBM + Isolation Forest), and a closed-loop operator enforcement workflow.

---

## 🚀 Quick Start (Running in VS Code)

### Prerequisites
- **Node.js**: v18+ or v20+ installed ([nodejs.org](https://nodejs.org))
- **Python**: v3.10+ or v3.11+ installed ([python.org](https://python.org))

---

### Step 1: Open the Project in VS Code
Open VS Code, click **File $\rightarrow$ Open Folder**, and select this `gridguard` directory.

---

### Step 2: Start the Python ML Backend Engine (Terminal 1)
Open a terminal in VS Code (`Ctrl + ~`):

```bash
# 1. Navigate to backend
cd backend

# 2. Install Python dependencies (only first time)
pip install -r requirements.txt

# 3. Start the ML service
python server.py
```
> ✅ You will see: `Uvicorn running on http://127.0.0.1:8000`  
> *(Loads `lgbm_model.pkl` and `iso_forest_v2.pkl` automatically)*

---

### Step 3: Start the Frontend Dashboard (Terminal 2)
Click the **+ (Split/New Terminal)** button in VS Code:

```bash
# 1. Install frontend packages (only first time)
npm install

# 2. Start Vite development server
npm run dev
```

---

### Step 4: Open in Browser
Open your browser and navigate to:
👉 **`http://localhost:5173/`**

---

## ⚡ What You Can Do in the Dashboard

1. **Interactive 3D Digital Twin:**
   - Real-time 3D grid with Substation (33kV/11kV), 4 distribution feeders, transformers (DT-01 to DT-04), and 48 smart meter buildings.
   - Live energy particle flows and glowing warning pillars.
   - Orbit, zoom, pan, and click on any transformer or consumer meter.

2. **Test Scenario Injections:**
   - Under **Test Grid Scenarios**, select any house (e.g. `C-017`) and click:
     - **Theft/Tampering** (Watch power drop 75%, red warning pillar appear, and live LightGBM flag 99.9% Theft probability)
     - **Meter Malfunction** (Watch voltage flatline to 118V, and LightGBM flag Meter Fault)
     - **Communication Failure** (Watch meter drop offline, classified as Comms Failure)
     - **Normal** (Restores baseline steady state)

3. **Live ML Diagnostics & Probabilities:**
   - The diagnosis card displays real-time class probabilities from `lgbm_model.pkl` and outlier flags from `iso_forest_v2.pkl`.
   - Explains the exact electrical evidence in plain English.

4. **Operator Enforcement Actions:**
   - **Dismiss Alert** (records solar net-metering / seasonal vacancy exemptions)
   - **Send Warning Notice** (Section 135 Electricity Act notice draft)
   - **Dispatch Vigilance Squad** (generates Work Order # and GPS coordinates)
   - **Download Forensic PDF** (court-admissible dossier with graphs and telemetry)
