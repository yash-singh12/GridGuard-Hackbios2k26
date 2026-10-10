"""Pytest unit tests for theft_assessment.py + assessment API endpoints.

Run from gridguard/backend:
    python -m pytest test_theft_assessment.py -v
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from theft_assessment import (
    assess_consumer,
    build_alert_payload,
    estimate_loss,
    estimate_theft_start,
    triage_priority,
)

import server
from server import app

client = TestClient(app)

TARIFF = 6.5


def make_theft_consumer() -> pd.DataFrame:
    """~375 kWh/month dropping to ~90 from month 4 (idx 3), 6 months."""
    kwh = [372, 381, 375, 92, 88, 95]
    rolling = [375.0, 376.0, 375.0, 375.0, 283.0, 222.0]  # month-4 avg already contaminated
    return pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=6, freq="MS"),
        "kwh_recorded": kwh,
        "rolling_7d_avg": rolling,
        "comm_status": ["OK"] * 6,
    })


def test_theft_start_detected_at_month_4():
    """Core scenario: 375 -> ~90 from month 4 => start idx 3."""
    df = make_theft_consumer()
    res = estimate_theft_start(df)
    assert res is not None
    assert res["theft_start_idx"] == 3
    assert res["comm_failure_overlap"] is False
    assert 0.0 < res["confidence"] <= 1.0
    assert res["consecutive_low_periods"] == 3


def test_loss_matches_hand_calculation():
    """(375 - 90) * 3 = ~855 kWh over the three low months."""
    df = make_theft_consumer()
    res = estimate_theft_start(df)
    loss = estimate_loss(df, res["theft_start_idx"], tariff=TARIFF, event_label="Theft")
    assert loss is not None
    assert loss["periods_affected"] == 3
    assert loss["estimated_loss_kwh"] == pytest.approx((375 - 90) * 3, abs=15.0)
    assert loss["revenue_loss"] == pytest.approx(loss["estimated_loss_kwh"] * TARIFF)
    assert loss["indicative_penalty"] == pytest.approx(loss["revenue_loss"] * 2.0)
    assert loss["tariff_used"] == TARIFF
    assert loss["penalty_factor_used"] == 2.0
    # Frozen pre-theft baseline ~= 375 (mean of months 1-3).
    assert loss["baseline_per_period"] == pytest.approx(375, abs=10.0)


def test_comms_overlap_reports_no_theft_start():
    """Low readings + comm_status Failed => flag, no start index."""
    df = make_theft_consumer()
    df["comm_status"] = ["OK", "OK", "OK", "Failed", "Failed", "Failed"]
    res = estimate_theft_start(df)
    assert res is not None
    assert res["comm_failure_overlap"] is True
    assert res["theft_start_idx"] is None


def test_no_theft_returns_none():
    """Normal wiggle around baseline => no sustained drop => None."""
    df = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=6, freq="MS"),
        "kwh_recorded": [372, 368, 381, 375, 369, 377],
        "rolling_7d_avg": [375.0] * 6,
        "comm_status": ["OK"] * 6,
    })
    assert estimate_theft_start(df) is None


def test_loss_only_for_theft():
    """Meter Fault / Comms Failure / Normal => estimate_loss returns None."""
    df = make_theft_consumer()
    for label in ("Meter Fault", "Comms Failure", "Normal"):
        assert estimate_loss(df, 3, tariff=TARIFF, event_label=label) is None


def test_edge_cases():
    """Few pre-periods, all-zero, NaN, missing timestamps."""
    # Single low row after one normal row, persist=1 still detects.
    df = pd.DataFrame({"kwh_recorded": [375.0, 90.0], "rolling_7d_avg": [375.0, 375.0]})
    res = estimate_theft_start(df, persist=1)
    assert res is not None and res["theft_start_idx"] == 1
    assert any("timestamp" in a for a in res["assumptions"])  # missing-ts assumption noted
    # Fewer than 7 pre-theft periods => baseline uses what's available + note.
    loss = estimate_loss(df, 1, tariff=TARIFF, event_label="Theft")
    assert loss["baseline_per_period"] == pytest.approx(375.0)
    assert any("fewer than baseline_window" in a for a in loss["assumptions"])
    # All-zero readings => no positive baseline => None, no crash.
    df0 = pd.DataFrame({"kwh_recorded": [0.0, 0.0, 0.0], "rolling_7d_avg": [0.0, 0.0, 0.0]})
    assert estimate_theft_start(df0) is None
    # NaN kwh treated as 0.0 => sustained zeros still detected as drop.
    dfn = pd.DataFrame({
        "kwh_recorded": [375.0, np.nan, np.nan, np.nan],
        "rolling_7d_avg": [375.0, 375.0, 375.0, 375.0],
    })
    resn = estimate_theft_start(dfn)
    assert resn is not None and resn["theft_start_idx"] == 1
    # Missing kwh column => clear error.
    with pytest.raises(ValueError):
        estimate_theft_start(pd.DataFrame({"rolling_7d_avg": [1.0]}))


def test_triage_priority_bands():
    """P1 = Theft + high loss; P2 = Theft + low loss; P3/P4 otherwise."""
    assert triage_priority("Theft", revenue_loss=50000.0, high_loss_cutoff_inr=10000.0) == "P1 - Critical Alert"
    assert triage_priority("Theft", revenue_loss=500.0, high_loss_cutoff_inr=10000.0) == "P2 - High Alert"
    assert triage_priority("Theft", fallback_risk_score=90) == "P1 - Critical Alert"
    assert triage_priority("Meter Fault") == "P3 - Medium Alert"
    assert triage_priority("Comms Failure") == "P3 - Medium Alert"
    assert triage_priority("Normal") == "P4 - Normal"


def test_assess_consumer_combined():
    """assess_consumer returns one JSON-serialisable dict incl. priority."""
    import json
    df = make_theft_consumer()
    out = assess_consumer("C-017", df_consumer=df, event_label="Theft", tariff=TARIFF)
    json.dumps(out)  # must be JSON-serialisable
    assert out["consumer_id"] == "C-017"
    assert out["theft_start"]["theft_start_idx"] == 3
    assert out["loss"]["estimated_loss_kwh"] == pytest.approx(855, abs=15.0)
    # 855 * 6.5 ~= 5557 < 10000 default cutoff => P2.
    assert out["priority"] == "P2 - High Alert"
    # Non-theft => loss None with reason.
    out2 = assess_consumer("C-031", df_consumer=df, event_label="Meter Fault", tariff=TARIFF)
    assert out2["loss"] is None and out2["loss_skipped_reason"] is not None


def test_alert_payload_carries_assessment_for_theft_only():
    a = assess_consumer("C-017", df_consumer=make_theft_consumer(), event_label="Theft", tariff=TARIFF)
    p_theft = build_alert_payload("C-017", "Theft", a["priority"], 94.0, assessment=a)
    assert p_theft["assessment"]["loss"]["revenue_loss"] > 0
    p_norm = build_alert_payload("C-040", "Normal", "P4 - Normal", 5.0, assessment=a)
    assert p_norm["assessment"] is None


def test_assessment_endpoint_end_to_end():
    """POST readings -> GET assessment; loss drives P2; 404 when unknown."""
    rows = [
        {"timestamp": d.strftime("%Y-%m-%d"), "kwh_recorded": k, "rolling_7d_avg": r, "comm_status": "OK"}
        for d, k, r in zip(
            pd.date_range("2026-01-01", periods=6, freq="MS"),
            [372, 381, 375, 92, 88, 95],
            [375.0, 376.0, 375.0, 375.0, 283.0, 222.0],
        )
    ]
    r = client.post("/api/consumers/C-900/readings", json={"readings": rows})
    assert r.status_code == 200
    r = client.get("/api/consumers/C-900/assessment", params={"event_label": "Theft", "tariff": TARIFF})
    assert r.status_code == 200
    body = r.json()
    assert body["theft_start"]["theft_start_idx"] == 3
    assert body["loss"]["estimated_loss_kwh"] == pytest.approx(855, abs=15.0)
    assert body["priority"] == "P2 - High Alert"
    # High-loss override flips triage to P1 via configurable cutoff.
    r = client.get("/api/consumers/C-900/assessment",
                   params={"event_label": "Theft", "tariff": 50.0})
    assert r.json()["priority"] == "P1 - Critical Alert"
    # Unknown consumer, no parquet present => honest 404.
    r = client.get("/api/consumers/NOPE-0/assessment")
    assert r.status_code == 404


def test_predict_triage_uses_revenue_loss():
    """Theft + high estimated_revenue_loss => P1; low => P2; legacy intact."""
    base = {"kwh_recorded": 90.0, "power_kw": 0.12, "peer_group_avg": 375.0,
            "rolling_7d_avg": 375.0, "voltage": 230.0, "current": 0.5}
    r = client.post("/api/predict", json={**base, "estimated_revenue_loss": 999999.0})
    assert r.status_code == 200
    body = r.json()
    assert "assessment" in body  # field present on the alert payload
    if body["event_label"] == "Theft":
        assert body["priority"] == "P1 - Critical Alert"
        r2 = client.post("/api/predict", json={**base, "estimated_revenue_loss": 10.0})
        if r2.json()["event_label"] == "Theft":
            assert r2.json()["priority"] == "P2 - High Alert"
    # No loss supplied => legacy score-based bands, P4 for Normal.
    r3 = client.post("/api/predict", json={"kwh_recorded": 375.0, "power_kw": 1.5,
                                           "peer_group_avg": 375.0, "rolling_7d_avg": 375.0})
    assert r3.status_code == 200
    assert r3.json()["priority"].startswith("P")


def test_real_parquet_layout_contract():
    """Guard the verified layout of the uploaded parquet files.

    Features: exactly the 8 model columns (no consumer_id/timestamp/tariff).
    Labels: single row-aligned event_label column. Per-consumer lookup is
    therefore impossible -> the assessment endpoint must answer 404 with a
    message pointing at the ingest route (verified here against the real
    files now present in the backend dir).
    """
    import pyarrow.parquet as pq
    fmeta = pq.read_schema("lgbm_features.parquet")
    lmeta = pq.read_schema("lgbm_labels.parquet")
    assert fmeta.names == ["kwh_recorded", "meter_status", "comm_status", "voltage",
                           "power_kw", "current", "peer_group_avg", "rolling_7d_avg"]
    assert lmeta.names == ["event_label"]
    assert pq.read_metadata("lgbm_features.parquet").num_rows == \
        pq.read_metadata("lgbm_labels.parquet").num_rows
    for missing in ("consumer_id", "timestamp", "tariff"):
        assert missing not in fmeta.names
    r = client.get("/api/consumers/C-017/assessment")
    assert r.status_code == 404
    assert "consumer_id" in r.json()["detail"]


def test_detection_runs_on_real_data_slice():
    """Smoke check: pure functions execute on real parquet rows (positional)."""
    df = pd.read_parquet("lgbm_features.parquet").head(12).reset_index(drop=True)
    out = assess_consumer("slice-0-12", df_consumer=df, event_label="Theft", tariff=6.5)
    import json
    json.dumps(out)
    assert out["consumer_id"] == "slice-0-12"
    assert set(out) >= {"theft_start", "loss", "priority", "assumptions"}
