# GRIDGUARD — Smart Grid Digital Twin & AI Loss Investigation

> **See where electricity is lost, understand why, and fix it fast.**

GRIDGUARD is a Smart Grid electricity-loss and anomaly detection platform featuring an interactive **3D Distribution Digital Twin**, a dual-stage **Machine Learning engine (LightGBM + Isolation Forest)**, a **Google Gemini AI Plain-Text Forensic Investigator**, and a **closed-loop operator enforcement workflow**.

---

## 🚀 Quick Start (Running Locally)

### Prerequisites
- **Node.js**: v18+ or v20+ ([nodejs.org](https://nodejs.org))
- **Python**: v3.10+ or v3.11+ ([python.org](https://python.org))

---

### Step 1: Start the Python ML & Gemini Backend (Terminal 1)
```bash
# 1. Navigate to backend directory
cd backend

# 2. Install Python dependencies (first time only)
pip install -r requirements.txt

# 3. Start the FastAPI ML service
python server.py
```
> ✅ **Online at:** `http://127.0.0.1:8000`  
> *(Loads `lgbm_model.pkl`, `iso_forest_v2.pkl`, and initializes `/api/gemini/analyze`)*

---

### Step 2: Start the Frontend Dashboard (Terminal 2)
```bash
# 1. Install frontend packages (first time only)
npm install

# 2. Start Vite development server
npm run dev
```
> 👉 **Open in Browser:** `http://localhost:5173/`

---

## ⚡ Core Features & Capabilities

### 1. 🌐 Interactive 3D Distribution Digital Twin
- **Topology Hierarchy:** 33kV/11kV Substation $\rightarrow$ 4 Feeders $\rightarrow$ 4 Distribution Transformers (DT-01 to DT-04) $\rightarrow$ 48 Smart Meter buildings.
- **Dynamic Energy Flows:** Real-time animated electrical particle flows that route according to grid load.
- **Visual Alert Indicators:** Glowing red and amber warning pillars pinpoint flagged meters in real time.
- **Controls:** Smooth orbit, zoom, pan, and one-click camera focus on any node.

### 2. 🧠 Dual-Stage Machine Learning Engine
- **Stage 1 (LightGBM Classifier):** Categorizes electrical telemetry into 4 distinct classes:
  - `Theft / Tampering`
  - `Meter Fault`
  - `Communication Failure`
  - `Normal Consumption`
- **Stage 2 (Isolation Forest v2):** Calculates multidimensional shortfall anomaly scores ($t=0.141, k=15.42$).
- **Kirchhoff Energy Accounting:** Automatically reconciles total transformer input against aggregate consumer draw to confirm whether missing energy represents actual physical line diversion.

### 3. ✨ Google Gemini AI Plain-Text Forensic Analysis
Translates complex electrical numbers, deviation percentages, and ML weights into clear, accessible plain English for each consumer:
- **1. Plain-English Executive Summary:** Explains the core situation (theft bypass vs. meter fault) and the financial loss in simple words.
- **2. Evidence Breakdown & Synthesis:** Explains how the evidence signals connect—such as why healthy meter communications paired with an unmetered transformer loss confirms deliberate electricity diversion rather than equipment failure.
- **Zero-Key Offline Resilience:** Uses a local evidence-synthesis engine fallback so the dashboard works seamlessly even without an active API key or internet access.

### 4. 🔍 Deep Investigation Workspace (`/consumers/:id`)
- **Quick Consumer Switcher:** Jump between all 48 smart meters (`C-001` to `C-048`) with a single click.
- **12-Month Consumption Graph:** Interactive historical timeline comparing actual recorded demand against baseline demand and peer category medians.
- **Theft Shortfall Shading:** Visually highlights the exact date and period when consumption diverged from baseline.

### 5. 🛡️ Closed-Loop Operator Enforcement & Retraining Store
- **Dismiss Alert:** Records seasonal vacations or approved rooftop solar net-metering exemptions.
- **Send Warning Notice:** Automatically formats a regulatory compliance notice under **Section 135 of the Indian Electricity Act**.
- **Dispatch Vigilance Squad:** Generates a field inspection work order with squad assignment and GPS coordinates.
- **Court-Admissible Forensic PDF:** Exports a complete legal dossier containing telemetry graphs, evidence signals, and Gemini analysis for enforcement proceedings.
- **AI Retraining Feedback Store:** Every operator decision is persisted and fed back into the retraining store to continuously improve detection accuracy.

---

## 🗺️ Key Navigation Routes

| Route | View | Description |
| :--- | :--- | :--- |
| `/` | **Unified Dashboard** | 3D Digital Twin, live grid telemetry, scenario injector, and prioritized inspection queue. |
| `/consumers/:id` | **Consumer Investigation** | In-depth dossier, Gemini AI plain-text analysis, historical charts, and action buttons. |
| `/investigations` | **Active Queue** | Pipeline tracking cases currently under field inspection or awaiting notice responses. |
| `/history` | **Incident History** | Closed and resolved cases with revenue recovery figures and audit logs. |
| `/grid` | **Kirchhoff Loss Audit** | Substation and transformer energy balance audit tables. |

---

## 🛠️ API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Verifies ML engine status and loaded model parameters. |
| `POST` | `/api/predict` | Runs live inference through LightGBM and Isolation Forest models. |
| `POST` | `/api/gemini/analyze` | Generates plain-English forensic analysis using Gemini API or evidence fallback. |
| `GET` | `/api/consumers/{id}/assessment` | Calculates Method-A theft start date, energy shortfall, and regulatory penalty under Section 135. |
| `POST` | `/api/consumers/{id}/readings` | Ingests time-series smart meter readings into the assessment engine. |

---

## 📁 Project Architecture

```
GRIDGUARD
├── backend/
│   ├── server.py               # FastAPI backend with ML & Gemini endpoints
│   ├── theft_assessment.py     # Section 135 penalty & Method-A loss calculations
│   ├── lgbm_model.pkl          # Trained LightGBM multi-class model
│   ├── iso_forest_v2.pkl       # Trained Isolation Forest anomaly model
│   └── requirements.txt        # Python backend dependencies
├── src/
│   ├── components/
│   │   ├── 3d/Grid3DScene.tsx                      # Three.js 3D Smart Grid Digital Twin
│   │   └── investigation/
│   │       ├── GeminiAnalysisSection.tsx           # Gemini AI Plain-English Analysis Card
│   │       ├── IncidentActionModal.tsx             # Operator Action Modal (Dispatch, Warning)
│   │       └── ForensicReportExport.ts             # Court-admissible forensic PDF export
│   ├── pages/
│   │   ├── UnifiedDashboard.tsx                    # Main 3D Monitor & Operational Dashboard
│   │   ├── InvestigationPage.tsx                   # Individual Customer Investigation Page
│   │   ├── InvestigationQueuePage.tsx              # Active Field Investigations Pipeline
│   │   └── HistoryPage.tsx                         # Resolved Incident History & Retraining Logs
│   ├── services/
│   │   ├── geminiService.ts                        # Gemini API integration & evidence synthesis
│   │   ├── realMlClient.ts                         # FastAPI backend connector
│   │   ├── aiFeedbackStore.ts                      # AI retraining & operator action store
│   │   └── investigationCaseStore.ts               # Case lifecycle management
│   ├── App.tsx                                     # Navigation & Routing
│   └── mock.ts                                     # Smart meter telemetry & Kirchhoff physics
└── package.json                                    # Frontend dependencies
```

---

## 📄 License
MIT License — built for Smart Grid Reliability, Non-Technical Loss Prevention, and Energy Protection.
