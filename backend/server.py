import os
import json
import asyncio
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="GridGuard ML Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Load ML Models (Portable relative paths)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LGBM_PATH = os.path.join(BASE_DIR, "lgbm_model.pkl")
ISO_PATH = os.path.join(BASE_DIR, "iso_forest_v2.pkl")

# Fallback to parent downloads if not found in backend folder
if not os.path.exists(LGBM_PATH):
    LGBM_PATH = r"C:\Users\hp\Downloads\lgbm_model.pkl"
if not os.path.exists(ISO_PATH):
    ISO_PATH = r"C:\Users\hp\Downloads\iso_forest_v2.pkl"

print(f"Loading LightGBM model from {LGBM_PATH}...")
lgbm_model = joblib.load(LGBM_PATH)
print("LightGBM loaded successfully!")

print(f"Loading Isolation Forest from {ISO_PATH}...")
iso_data = joblib.load(ISO_PATH)
iso_model = iso_data.get("model")
iso_t = float(iso_data.get("t", 0.141))
iso_k = float(iso_data.get("k", 15.42))
iso_tol = float(iso_data.get("tol", 0.05))
print("Isolation Forest loaded successfully!")

class MeterReadingInput(BaseModel):
    kwh_recorded: float
    meter_status: str = "OK"
    comm_status: str = "OK"
    voltage: float = 230.0
    power_kw: float = 1.5
    current: float = 6.5
    peer_group_avg: float = 1.4
    rolling_7d_avg: float = 1.35

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "models": {
            "lgbm": "LGBMClassifier (4 classes: Comms Failure, Meter Fault, Normal, Theft)",
            "isolation_forest": "iso_forest_v2 (t=0.141, k=15.42, tol=0.05)"
        }
    }

@app.post("/api/predict")
def predict_meter(data: MeterReadingInput):
    # Prepare DataFrame matching LGBM features
    # Feature order: ['kwh_recorded', 'meter_status', 'comm_status', 'voltage', 'power_kw', 'current', 'peer_group_avg', 'rolling_7d_avg']
    df = pd.DataFrame([{
        "kwh_recorded": float(data.kwh_recorded),
        "meter_status": str(data.meter_status),
        "comm_status": str(data.comm_status),
        "voltage": float(data.voltage),
        "power_kw": float(data.power_kw),
        "current": float(data.current),
        "peer_group_avg": float(data.peer_group_avg),
        "rolling_7d_avg": float(data.rolling_7d_avg)
    }])
    df["meter_status"] = df["meter_status"].astype("category")
    df["comm_status"] = df["comm_status"].astype("category")

    # Predict with LightGBM
    pred_label = lgbm_model.predict(df)[0]
    pred_probs = lgbm_model.predict_proba(df)[0]
    class_probs = {cls: float(prob) for cls, prob in zip(lgbm_model.classes_, pred_probs)}

    # Predict with Isolation Forest
    # Features: ['log_kwh_per_kw', 'shortfall']
    safe_power = max(float(data.power_kw), 1e-4)
    safe_kwh = max(float(data.kwh_recorded), 1e-4)
    log_ratio = float(np.log(safe_kwh / safe_power))
    shortfall = float(data.peer_group_avg - data.kwh_recorded)

    df_iso = pd.DataFrame([{
        "log_kwh_per_kw": log_ratio,
        "shortfall": shortfall
    }])
    iso_score = float(iso_model.score_samples(df_iso)[0])
    iso_anomaly = bool(iso_model.predict(df_iso)[0] == -1)

    # Calculate calibrated risk score (0-100)
    theft_prob = class_probs.get("Theft", 0.0)
    meter_prob = class_probs.get("Meter Fault", 0.0)
    comms_prob = class_probs.get("Comms Failure", 0.0)

    risk_score = int(np.clip((theft_prob * 0.7 + (1.0 if iso_anomaly else 0.0) * 0.3) * 100, 0, 100))
    if pred_label == "Normal":
        priority = "P4 - Normal"
    elif risk_score >= 80:
        priority = "P1 - Critical Alert"
    elif risk_score >= 50:
        priority = "P2 - High Alert"
    else:
        priority = "P3 - Medium Alert"

    return {
        "event_label": str(pred_label),
        "priority": priority,
        "risk_score": risk_score,
        "probabilities": class_probs,
        "isolation_forest": {
            "score": iso_score,
            "is_anomaly": iso_anomaly,
            "shortfall": shortfall,
            "log_kwh_per_kw": log_ratio
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
