import os
import json
import asyncio
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Optional

from theft_assessment import (
    DEFAULT_HIGH_LOSS_CUTOFF_INR,
    DEFAULT_PENALTY_FACTOR,
    DEFAULT_TARIFF_RATE,
    assess_consumer,
    build_alert_payload,
    triage_priority,
)

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
    # Optional triage input: estimated revenue loss (INR) for this consumer,
    # e.g. from GET /api/consumers/{id}/assessment. When the cause is Theft
    # it drives the P1/P2 split via HIGH_LOSS_CUTOFF_INR.
    tariff: Optional[float] = None
    estimated_revenue_loss: Optional[float] = None

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
    pred_label = str(pred_label)
    if pred_label == "Normal":
        priority = "P4 - Normal"
    elif pred_label == "Theft":
        # Revenue loss drives the P1/P2 split; without a loss figure the
        # legacy risk-score mapping (>=80 -> P1) is preserved as fallback.
        loss = data.estimated_revenue_loss
        if loss is not None:
            priority = triage_priority(pred_label, revenue_loss=float(loss))
        elif risk_score >= 80:
            priority = "P1 - Critical Alert"
        else:
            priority = "P2 - High Alert"
    elif risk_score >= 80:
        priority = "P1 - Critical Alert"
    elif risk_score >= 50:
        priority = "P2 - High Alert"
    else:
        priority = "P3 - Medium Alert"

    # Alert payload shares one builder with any WebSocket broadcaster so
    # Theft alerts carry identical assessment fields on both channels.
    # (Single-reading /predict has no monthly series, so assessment is None
    # here; the full assessment comes from /api/consumers/{id}/assessment.)
    alert = build_alert_payload(
        consumer_id="unknown",
        event_label=pred_label,
        priority=priority,
        risk_score=risk_score,
        assessment=None,
    )

    return {
        "event_label": alert["event_label"],
        "priority": alert["priority"],
        "risk_score": alert["risk_score"],
        "assessment": alert["assessment"],
        "probabilities": class_probs,
        "isolation_forest": {
            "score": iso_score,
            "is_anomaly": iso_anomaly,
            "shortfall": shortfall,
            "log_kwh_per_kw": log_ratio
        }
    }

# ---------------------------------------------------------------------------
# Consumer theft assessment: series resolution + endpoints
# ---------------------------------------------------------------------------

# In-memory registry of monthly consumption series, keyed by consumer id.
# Ephemeral (resets on restart); parquet files below are the durable source
# when present. POST /api/consumers/{id}/readings ingests into this registry.
_SERIES_REGISTRY: dict[str, list[dict[str, Any]]] = {}

FEATURES_PARQUET = os.getenv("GRIDGUARD_FEATURES_PARQUET", "lgbm_features.parquet")
LABELS_PARQUET = os.getenv("GRIDGUARD_LABELS_PARQUET", "lgbm_labels.parquet")


class DataUnavailableError(Exception):
    """Raised when no consumption series can be resolved for a consumer."""


def _parquet_path(name: str) -> Optional[str]:
    here = os.path.join(BASE_DIR, name)
    if os.path.exists(here):
        return here
    if os.path.exists(name):
        return name
    return None


def load_consumer_series(consumer_id: str) -> tuple[pd.DataFrame, Optional[str], Optional[float]]:
    """Resolve (monthly readings, event_label, tariff) for a consumer.

    Sources, in order: in-memory registry -> lgbm_features.parquet (+ labels
    parquet for event_label). Raises DataUnavailableError when nothing is
    found. Missing id/tariff/label columns fall back to documented defaults.
    """
    if consumer_id in _SERIES_REGISTRY and _SERIES_REGISTRY[consumer_id]:
        df = pd.DataFrame(_SERIES_REGISTRY[consumer_id])
        tariff = None
        if "tariff" in df.columns:
            try:
                tariff = float(pd.to_numeric(df["tariff"], errors="coerce").dropna().iloc[0])
            except (IndexError, ValueError):
                tariff = None
        label = None
        if "event_label" in df.columns:
            try:
                label = str(df["event_label"].dropna().iloc[0])
            except IndexError:
                label = None
        return df, label, tariff

    fpath = _parquet_path(FEATURES_PARQUET)
    if fpath is None:
        raise DataUnavailableError(
            f"No series for '{consumer_id}': not ingested via "
            f"POST /api/consumers/{{id}}/readings and '{FEATURES_PARQUET}' not found. "
            "Set GRIDGUARD_FEATURES_PARQUET or ingest readings first."
        )
    df_all = pd.read_parquet(fpath)
    label: Optional[str] = None
    tariff: Optional[float] = None
    if "consumer_id" in df_all.columns:
        df = df_all[df_all["consumer_id"].astype(str) == str(consumer_id)].copy()
        if df.empty:
            raise DataUnavailableError(f"Consumer '{consumer_id}' not present in '{fpath}'.")
    else:
        # No id column: the file cannot be filtered per consumer.
        raise DataUnavailableError(
            f"'{fpath}' has no 'consumer_id' column; per-consumer lookup impossible. "
            "Ingest the series via POST /api/consumers/{id}/readings instead."
        )
    lpath = _parquet_path(LABELS_PARQUET)
    if lpath is not None:
        try:
            lab = pd.read_parquet(lpath)
            if "consumer_id" in lab.columns and "event_label" in lab.columns:
                hit = lab[lab["consumer_id"].astype(str) == str(consumer_id)]
                if not hit.empty:
                    label = str(hit["event_label"].iloc[0])
        except Exception:
            label = None
    if "tariff" in df.columns:
        try:
            tariff = float(pd.to_numeric(df["tariff"], errors="coerce").dropna().iloc[0])
        except (IndexError, ValueError):
            tariff = None
    return df.reset_index(drop=True), label, tariff


class MonthlyReading(BaseModel):
    timestamp: Optional[str] = None
    kwh_recorded: Optional[float] = None
    rolling_7d_avg: Optional[float] = None
    peer_group_avg: Optional[float] = None
    power_kw: Optional[float] = None
    comm_status: Optional[str] = None
    meter_status: Optional[str] = None
    tariff: Optional[float] = None
    event_label: Optional[str] = None


class ReadingsIngest(BaseModel):
    readings: list[MonthlyReading]


@app.post("/api/consumers/{consumer_id}/readings")
def ingest_consumer_readings(consumer_id: str, body: ReadingsIngest):
    """Ingest a consumer's monthly series (ephemeral, in-memory)."""
    rows = [r.model_dump(exclude_none=False) for r in body.readings]
    if not rows:
        raise HTTPException(status_code=400, detail="Empty readings list.")
    _SERIES_REGISTRY[consumer_id] = rows
    return {"consumer_id": consumer_id, "periods_stored": len(rows)}


@app.get("/api/consumers/{consumer_id}/assessment")
def consumer_assessment(
    consumer_id: str,
    event_label: Optional[str] = None,
    tariff: Optional[float] = None,
    penalty_factor: float = DEFAULT_PENALTY_FACTOR,
    high_loss_cutoff_inr: float = DEFAULT_HIGH_LOSS_CUTOFF_INR,
):
    """Theft start-date + Method-A loss estimate for one consumer.

    Series resolution: ingested readings -> parquet files. Query params
    override the stored event label / tariff. All values JSON-serialisable.
    """
    try:
        df, stored_label, stored_tariff = load_consumer_series(consumer_id)
    except DataUnavailableError as e:
        raise HTTPException(status_code=404, detail=str(e))
    label = event_label or stored_label
    rate = tariff if tariff is not None else stored_tariff
    result = assess_consumer(
        consumer_id,
        df_consumer=df,
        event_label=label,
        tariff=rate,
        penalty_factor=penalty_factor,
        high_loss_cutoff_inr=high_loss_cutoff_inr,
    )
    return result


class GeminiAnalyzeRequest(BaseModel):
    consumer_id: str
    category: str = "Residential"
    load: float = 5.0
    tariff: float = 6.5
    baseline: float = 340.0
    actual: Optional[float] = None
    deviation: float = 0.0
    cause: str = "Normal"
    anomaly_score: int = 0
    risk: str = "Normal"
    priority: str = "P4"
    transformer: str = "T-01"
    feeder: str = "F-01"
    evidence: list[dict] = []
    api_key: Optional[str] = None


@app.post("/api/gemini/analyze")
def gemini_analyze_consumer(body: GeminiAnalyzeRequest):
    """Generates plain-English forensic analysis using Gemini API or evidence-grounded engine."""
    import urllib.request
    import urllib.error

    gemini_key = body.api_key or os.environ.get("GEMINI_API_KEY")
    loss_inr = int(max(0.0, (body.baseline - (body.actual or 0.0))) * body.tariff) if "theft" in body.cause.lower() or "tamper" in body.cause.lower() else 0

    if gemini_key:
        evidence_str = "\n".join([f"- [{e.get('direction', 'supports').upper()}] {e.get('signal', '')}: {e.get('text', '')}" for e in body.evidence])
        prompt = f"""You are GRIDGUARD's Senior Smart Grid Forensic AI Investigator.
Analyze this electricity consumer and explain the AI findings strictly in PLAIN, NATURAL ENGLISH (avoid complex ML jargon).

CONSUMER METRICS:
- Consumer ID: {body.consumer_id}
- Customer Category: {body.category} (Sanctioned Load: {body.load} kW, Tariff: Rs. {body.tariff}/kWh)
- Transformer: {body.transformer} (Feeder: {body.feeder})
- Baseline Normal Demand: {body.baseline} kWh | Recorded Demand: {body.actual} kWh ({body.deviation}% deviation)
- Estimated Monthly Revenue Loss: Rs. {loss_inr:,}
- AI Anomaly Score: {body.anomaly_score}/100 ({body.risk} Risk, Priority {body.priority})
- AI Classification Cause: {body.cause}

PLAIN-ENGLISH EVIDENCE SIGNALS:
{evidence_str}

Provide a plain-English, objective narrative divided into these 2 sections:
### 1. Plain-English Executive Summary
(Explain in 2-3 clear sentences what happened and why it triggered an alert)

### 2. Plain-English Evidence Analysis
(Explain how the flagged evidence signals connect together in simple terms)"""

        for model in ["gemini-2.0-flash", "gemini-1.5-flash"]:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_key}"
                req_data = json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 900}
                }).encode("utf-8")

                req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=10) as response:
                    res_json = json.loads(response.read().decode("utf-8"))
                    text = res_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text:
                        return {
                            "consumer_id": body.consumer_id,
                            "summary": text[:250],
                            "evidence_explanation": text,
                            "recommended_action": "",
                            "raw_markdown": text,
                            "is_live": True,
                            "model_used": f"Google {model} (Live API)"
                        }
            except Exception as e:
                print(f"Gemini API request failed on {model}: {e}")

    # Fallback contextual synthesis engine
    dev_abs = abs(int(body.deviation))
    if "theft" in body.cause.lower() or "tamper" in body.cause.lower():
        summary = f"Consumer {body.consumer_id} ({body.category}, {body.load} kW) is showing high-confidence indicators of electricity theft. Consumption dropped {dev_abs}% below baseline while transformer {body.transformer} recorded an unexplained energy deficit, causing an estimated monthly loss of ₹{loss_inr:,}."
        explanation = f"Electrical evidence rules out equipment breakdown. The meter's communication and internal telemetry are completely functional, and voltage remains steady. However, consumption plummeted while neighboring meters remained unchanged. Unexplained energy loss at transformer {body.transformer} confirms electricity is bypassing the metering unit."
    elif "meter" in body.cause.lower() or "malfunction" in body.cause.lower():
        summary = f"Consumer {body.consumer_id} has experienced a hardware metering fault. Telemetry shows a sudden {dev_abs}% reading reduction alongside internal sensor anomalies."
        explanation = f"Unlike power diversion, transformer {body.transformer} does not show unaccounted line loss. The drop is localized to the meter's internal registers and voltage sensors, indicating potential component failure."
    elif "comm" in body.cause.lower():
        summary = f"Consumer {body.consumer_id} is flagged due to lost communications and missing intervals, preventing automatic billing collection."
        explanation = f"Feeder balance is normal. The issue stems from RF or cellular network packet loss rather than electrical diversion."
    else:
        summary = f"Consumer {body.consumer_id} is consuming electricity within normal baseline limits ({body.load} kW sanctioned)."
        explanation = "All voltage, current, and transformer balance signals are healthy with zero abnormal deviation."

    return {
        "consumer_id": body.consumer_id,
        "summary": summary,
        "evidence_explanation": explanation,
        "recommended_action": "",
        "raw_markdown": f"### Summary\n{summary}\n\n### Evidence\n{explanation}",
        "is_live": False,
        "model_used": "GRIDGUARD Local AI Synthesis Engine"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
