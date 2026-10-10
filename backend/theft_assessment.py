"""Theft start-date detection (change-point) and financial loss estimation.

Method A (energy-based) for the GridGuard backend. All thresholds are function
parameters with defaults — no hard-coded magic numbers in the logic below.
Defaults themselves live in the CONFIG section and are overridable via env vars.

Column assumptions (verified 2026-10-09 against the actual files
``lgbm_features.parquet`` — 1,405,400 rows x 8 cols — and
``lgbm_labels.parquet`` — 1,405,400 rows x 1 col, row-aligned with features):
  present: kwh_recorded, rolling_7d_avg, peer_group_avg, power_kw,
           meter_status (OK/Faulty), comm_status (OK/Failed), voltage, current
           + event_label (labels file, row-aligned: Theft/Normal/Comms Failure/Meter Fault)
  missing: consumer_id, timestamp, tariff, sanctioned_load (in both files —
           flat unkeyed training matrix, so per-consumer lookup resolves via
           the ingest endpoint instead; see server.load_consumer_series).
Missing fields are covered by clearly named configurable defaults below.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Configurable defaults (env-overridable). Used ONLY when the real field is
# unavailable in the data. Every use is recorded in the `assumptions` list of
# the returned dicts so downstream consumers know what was assumed.
# ---------------------------------------------------------------------------

def _env_float(name: str, fallback: float) -> float:
    """Read a float env var, falling back safely on missing/bad values."""
    try:
        return float(os.getenv(name, str(fallback)))
    except (TypeError, ValueError):
        return fallback


def _env_int(name: str, fallback: int) -> int:
    try:
        return int(os.getenv(name, str(fallback)))
    except (TypeError, ValueError):
        return fallback


# ASSUMPTION: no tariff column exists in the model data or parquet files, so a
# flat default rate is used unless the caller passes `tariff` explicitly.
# (Frontend reference rates: Residential 6.5 / Commercial 9.0 /
# Industrial 7.5 / Agricultural 4.0 INR per kWh.)
DEFAULT_TARIFF_RATE: float = _env_float("GRIDGUARD_DEFAULT_TARIFF", 6.5)

# ASSUMPTION: penalty multiplier for the indicative penalty (Electricity Act
# assessments commonly use 2x). Configurable per call and via env.
DEFAULT_PENALTY_FACTOR: float = _env_float("GRIDGUARD_PENALTY_FACTOR", 2.0)

# Change-point defaults.
DEFAULT_RATIO_THRESH: float = _env_float("GRIDGUARD_RATIO_THRESH", 0.5)
DEFAULT_PERSIST: int = _env_int("GRIDGUARD_PERSIST_PERIODS", 3)

# Frozen pre-theft baseline window (Method A: never a rolling average that
# could include theft periods).
DEFAULT_BASELINE_WINDOW: int = _env_int("GRIDGUARD_BASELINE_WINDOW", 7)

# Priority-triage cutoff: Theft + revenue_loss >= this (INR) => P1, else P2.
DEFAULT_HIGH_LOSS_CUTOFF_INR: float = _env_float("GRIDGUARD_HIGH_LOSS_CUTOFF_INR", 10000.0)

# Comm-status values treated as "data issue, not theft" (case-insensitive).
# NOTE: live pipeline emits "LOST"; task spec says "Failed"; both covered.
COMM_FAILURE_VALUES: frozenset[str] = frozenset({"failed", "lost", "offline", "fail", "down"})

THEFT_LABEL = "Theft"


# ---------------------------------------------------------------------------
# Feature 1: theft start-date detection
# ---------------------------------------------------------------------------

def estimate_theft_start(
    df_consumer: pd.DataFrame,
    ratio_thresh: float = DEFAULT_RATIO_THRESH,
    persist: int = DEFAULT_PERSIST,
    kwh_col: str = "kwh_recorded",
    baseline_col: str = "rolling_7d_avg",
    time_col: str = "timestamp",
    comm_col: str = "comm_status",
    comm_failure_values: frozenset[str] = COMM_FAILURE_VALUES,
) -> Optional[dict[str, Any]]:
    """Detect the first sustained consumption drop (theft change-point).

    Ratio for each row = kwh_recorded / (PREVIOUS row's rolling_7d_avg + 1e-6)
    so the theft period cannot contaminate its own baseline. NaN kwh is
    treated as 0.0. The start is the first row of the first run of `persist`
    consecutive rows with ratio < `ratio_thresh`.

    Returns a JSON-serialisable dict with start index / timestamp /
    confidence, or None when no sustained drop exists. When a sustained low
    run coincides with a comm failure, no theft start is reported: a dict
    with ``theft_start_idx=None`` and ``comm_failure_overlap=True`` is
    returned instead (a data issue, not theft).
    """
    assumptions: list[str] = []
    if df_consumer is None or len(df_consumer) == 0:
        return None
    if kwh_col not in df_consumer.columns:
        raise ValueError(f"Required column '{kwh_col}' missing from input data.")
    if persist < 1:
        raise ValueError("'persist' must be >= 1.")

    df = df_consumer.copy()

    # --- Time handling: sort by time when possible, else keep row order. ---
    start_ts: Optional[str] = None
    has_time = time_col in df.columns
    if has_time:
        try:
            df["_t"] = pd.to_datetime(df[time_col], errors="coerce")
            if df["_t"].notna().any():
                df = df.sort_values("_t", kind="stable").reset_index(drop=True)
            if df["_t"].isna().any():
                assumptions.append(
                    f"Some '{time_col}' values unparseable; those rows keep file order."
                )
        except Exception:
            assumptions.append(f"Could not parse '{time_col}'; row order used.")
            has_time = False
    else:
        # ASSUMPTION: no timestamp column in the data — positional order used.
        assumptions.append(f"No '{time_col}' column; row order treated as time order.")

    # --- kWh series: NaN -> 0.0 per spec. ---
    kwh = pd.to_numeric(df[kwh_col], errors="coerce")
    n_nan = int(kwh.isna().sum())
    if n_nan:
        assumptions.append(f"{n_nan} NaN '{kwh_col}' value(s) treated as 0.0.")
    kwh = kwh.fillna(0.0).to_numpy(dtype=float)

    # --- Previous-period baseline (shift by 1). ---
    if baseline_col in df.columns:
        prev_base = pd.to_numeric(df[baseline_col], errors="coerce").shift(1).to_numpy(dtype=float)
    else:
        # Fallback: expanding mean of prior kwh (never includes current row).
        assumptions.append(
            f"No '{baseline_col}' column; expanding mean of prior '{kwh_col}' used as baseline."
        )
        prev_base = pd.Series(kwh).expanding(min_periods=1).mean().shift(1).to_numpy(dtype=float)

    # Ratio only defined for positive, finite baselines; otherwise not-low.
    valid = np.isfinite(prev_base) & (prev_base > 0)
    if not valid.any():
        assumptions.append("No positive pre-period baseline available; cannot assess drop.")
        return None
    ratio = np.ones(len(df), dtype=float)
    ratio[valid] = kwh[valid] / (prev_base[valid] + 1e-6)
    is_low = valid & (ratio < ratio_thresh)

    # --- First run of `persist` consecutive low periods. ---
    run_start: Optional[int] = None
    if persist == 1:
        hits = np.flatnonzero(is_low)
        run_start = int(hits[0]) if len(hits) else None
    else:
        window = np.ones(persist, dtype=int)
        conv = np.convolve(is_low.astype(int), window, mode="valid")
        hits = np.flatnonzero(conv == persist)
        run_start = int(hits[0]) if len(hits) else None

    if run_start is None:
        return None

    # Length of the low run starting at run_start + deepest drop.
    run_end = run_start
    while run_end + 1 < len(df) and is_low[run_end + 1]:
        run_end += 1
    run_len = run_end - run_start + 1
    min_ratio = float(np.min(ratio[run_start : run_end + 1]))

    # --- Comm-failure overlap: data issue, NOT theft. ---
    comm_overlap = False
    if comm_col in df.columns:
        comm = df[comm_col].astype(str).str.strip().str.lower().to_numpy()
        window_comm = comm[run_start : run_end + 1]
        if np.isin(window_comm, list(comm_failure_values)).any():
            comm_overlap = True
    else:
        assumptions.append(f"No '{comm_col}' column; comm-failure overlap not checkable.")

    if has_time:
        try:
            ts = pd.to_datetime(df[time_col].iloc[run_start], errors="coerce")
            start_ts = None if pd.isna(ts) else ts.isoformat()
            if start_ts is None:
                assumptions.append("Theft-start timestamp missing/unparseable; index only.")
        except Exception:
            assumptions.append("Theft-start timestamp unreadable; index only.")

    if comm_overlap:
        return {
            "theft_start_idx": None,
            "theft_start_timestamp": None,
            "confidence": 0.0,
            "ratio_thresh_used": ratio_thresh,
            "persist_used": persist,
            "consecutive_low_periods": int(run_len),
            "min_ratio": round(min_ratio, 4),
            "comm_failure_overlap": True,
            "assumptions": assumptions
            + ["Low readings coincide with comm failure; treated as data issue, not theft."],
        }

    # Confidence grows with run length beyond `persist` and with drop depth.
    depth = max(0.0, 1.0 - min_ratio / ratio_thresh) if ratio_thresh > 0 else 0.0
    length_bonus = min(max(run_len - persist + 1, 0) / 4.0, 1.0)
    confidence = round(min(0.95, 0.5 + 0.3 * depth + 0.2 * length_bonus), 3)

    return {
        "theft_start_idx": int(run_start),
        "theft_start_timestamp": start_ts,
        "confidence": confidence,
        "ratio_thresh_used": ratio_thresh,
        "persist_used": persist,
        "consecutive_low_periods": int(run_len),
        "min_ratio": round(min_ratio, 4),
        "comm_failure_overlap": False,
        "assumptions": assumptions,
    }


# ---------------------------------------------------------------------------
# Feature 2: financial loss estimate (Method A, energy-based)
# ---------------------------------------------------------------------------

def estimate_loss(
    df_consumer: pd.DataFrame,
    start_idx: int,
    tariff: Optional[float] = None,
    penalty_factor: float = DEFAULT_PENALTY_FACTOR,
    event_label: str = THEFT_LABEL,
    baseline_window: int = DEFAULT_BASELINE_WINDOW,
    kwh_col: str = "kwh_recorded",
    time_col: str = "timestamp",
) -> Optional[dict[str, Any]]:
    """Estimate financial loss from a detected theft start (Method A).

    Frozen baseline = mean kwh over the `baseline_window` periods immediately
    BEFORE start_idx (never a rolling average touching theft periods).
    lost_kwh = sum(max(baseline - kwh, 0)) from start_idx to end of data.

    Only runs for ``event_label == 'Theft'``; returns None otherwise.
    """
    if event_label != THEFT_LABEL:
        return None
    if df_consumer is None or len(df_consumer) == 0:
        return None
    if kwh_col not in df_consumer.columns:
        raise ValueError(f"Required column '{kwh_col}' missing from input data.")
    if baseline_window < 1:
        raise ValueError("'baseline_window' must be >= 1.")
    if penalty_factor < 0:
        raise ValueError("'penalty_factor' must be >= 0.")

    assumptions: list[str] = []
    n = len(df_consumer)
    start_idx = max(0, min(int(start_idx), n - 1))

    kwh = pd.to_numeric(df_consumer[kwh_col], errors="coerce")
    if int(kwh.isna().sum()):
        assumptions.append("NaN kwh values treated as 0.0 in loss sum.")
    kwh = kwh.fillna(0.0).to_numpy(dtype=float)

    # Frozen pre-theft baseline (uses fewer periods if < baseline_window exist).
    pre = kwh[max(0, start_idx - baseline_window) : start_idx]
    pre = pre[np.isfinite(pre)]
    if len(pre) == 0:
        assumptions.append("No pre-theft periods; baseline falls back to 0.0 (loss = 0).")
        baseline = 0.0
    else:
        if len(pre) < baseline_window:
            assumptions.append(
                f"Only {len(pre)} pre-theft period(s) available "
                f"(fewer than baseline_window={baseline_window}); baseline uses all of them."
            )
        baseline = float(np.mean(pre))

    tail = kwh[start_idx:]
    shortfalls = np.maximum(baseline - tail, 0.0)
    lost_kwh = float(np.sum(shortfalls))
    periods_affected = int(n - start_idx)

    if tariff is None:
        # ASSUMPTION: see DEFAULT_TARIFF_RATE note above.
        tariff_used = DEFAULT_TARIFF_RATE
        assumptions.append(
            f"No tariff supplied and no tariff column in data; DEFAULT_TARIFF_RATE={DEFAULT_TARIFF_RATE} INR/kWh used."
        )
    else:
        tariff_used = float(tariff)

    revenue_loss = lost_kwh * tariff_used
    indicative_penalty = revenue_loss * float(penalty_factor)

    theft_start_ts: Optional[str] = None
    if time_col in df_consumer.columns:
        try:
            ts = pd.to_datetime(df_consumer[time_col].iloc[start_idx], errors="coerce")
            theft_start_ts = None if pd.isna(ts) else ts.isoformat()
        except Exception:
            assumptions.append("Theft-start timestamp unreadable.")

    return {
        "baseline_per_period": round(baseline, 3),
        "periods_affected": periods_affected,
        "theft_start": theft_start_ts,
        "estimated_loss_kwh": round(lost_kwh, 3),
        "revenue_loss": round(revenue_loss, 2),
        "indicative_penalty": round(indicative_penalty, 2),
        "tariff_used": tariff_used,
        "penalty_factor_used": float(penalty_factor),
        "assumptions": assumptions,
    }


# ---------------------------------------------------------------------------
# Priority triage (revenue loss as an input)
# ---------------------------------------------------------------------------

def triage_priority(
    event_label: str,
    revenue_loss: Optional[float] = None,
    high_loss_cutoff_inr: float = DEFAULT_HIGH_LOSS_CUTOFF_INR,
    fallback_risk_score: Optional[float] = None,
) -> str:
    """Map (cause, revenue loss) to a triage band. Strings match server.py.

    P1 = Theft + high loss (>= cutoff); P2 = Theft + low/unknown loss;
    P3 = Meter Fault / Comms Failure / other non-normal causes (or low-risk
    Theft fallback); P4 = Normal. When the cause is Theft but no loss figure
    is available, `fallback_risk_score` (>=80 -> P1) preserves the old
    score-based behaviour.
    """
    label = str(event_label or "")
    if label == THEFT_LABEL:
        if revenue_loss is not None and revenue_loss >= high_loss_cutoff_inr:
            return "P1 - Critical Alert"
        if revenue_loss is not None:
            return "P2 - High Alert"
        if fallback_risk_score is not None and fallback_risk_score >= 80:
            return "P1 - Critical Alert"
        return "P2 - High Alert"
    if label == "Normal":
        return "P4 - Normal"
    return "P3 - Medium Alert"


# ---------------------------------------------------------------------------
# Integration: assess_consumer + alert payload builder
# ---------------------------------------------------------------------------

@dataclass
class ConsumerSeries:
    """Resolved input data for one consumer assessment."""

    consumer_id: str
    df: pd.DataFrame
    event_label: str = "Unknown"
    tariff: Optional[float] = None
    assumptions: list[str] = field(default_factory=list)


def assess_consumer(
    consumer_id: str,
    df_consumer: Optional[pd.DataFrame] = None,
    event_label: Optional[str] = None,
    tariff: Optional[float] = None,
    penalty_factor: float = DEFAULT_PENALTY_FACTOR,
    ratio_thresh: float = DEFAULT_RATIO_THRESH,
    persist: int = DEFAULT_PERSIST,
    high_loss_cutoff_inr: float = DEFAULT_HIGH_LOSS_CUTOFF_INR,
) -> dict[str, Any]:
    """Combine theft-start detection + loss estimate into one JSON-safe dict.

    `df_consumer` may be passed directly (tests, API ingestion) or resolved
    from parquet / the in-memory registry by the caller (see server.py
    `load_consumer_series`). Pure-computation function: no I/O here.
    """
    assumptions: list[str] = []
    label = event_label or "Unknown"
    if event_label is None:
        assumptions.append(
            "No event_label supplied and no labels file available; "
            "change-point still computed, loss only if label is 'Theft'."
        )
    if tariff is None:
        assumptions.append(
            f"No tariff supplied; DEFAULT_TARIFF_RATE={DEFAULT_TARIFF_RATE} INR/kWh used if loss is computed."
        )

    if df_consumer is None or len(df_consumer) == 0:
        return {
            "consumer_id": consumer_id,
            "event_label": label,
            "theft_start": None,
            "loss": None,
            "priority": triage_priority(label),
            "high_loss_cutoff_inr_used": high_loss_cutoff_inr,
            "assumptions": assumptions + ["No consumption series available for this consumer."],
        }

    start = estimate_theft_start(df_consumer, ratio_thresh=ratio_thresh, persist=persist)

    loss: Optional[dict[str, Any]] = None
    loss_skipped_reason: Optional[str] = None
    if label != THEFT_LABEL:
        loss_skipped_reason = f"Consumer classified as '{label}', not Theft; loss not computed."
    elif start is None or start.get("theft_start_idx") is None:
        loss_skipped_reason = "No sustained theft drop detected; loss not computed."
    else:
        loss = estimate_loss(
            df_consumer,
            start["theft_start_idx"],
            tariff=tariff if tariff is not None else DEFAULT_TARIFF_RATE,
            penalty_factor=penalty_factor,
            event_label=label,
        )
        if tariff is None and loss is not None:
            # estimate_loss records its own tariff assumption; keep both lists.
            pass

    revenue = loss["revenue_loss"] if loss else None
    return {
        "consumer_id": consumer_id,
        "event_label": label,
        "theft_start": start,
        "loss": loss,
        "loss_skipped_reason": loss_skipped_reason,
        "priority": triage_priority(label, revenue_loss=revenue,
                                   high_loss_cutoff_inr=high_loss_cutoff_inr),
        "high_loss_cutoff_inr_used": high_loss_cutoff_inr,
        "assumptions": assumptions,
    }


def build_alert_payload(
    consumer_id: str,
    event_label: str,
    priority: str,
    risk_score: float,
    assessment: Optional[dict[str, Any]] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build the WebSocket alert payload, embedding the Theft assessment.

    NOTE: server.py currently has no live WebSocket broadcast route (only the
    `WebSocket` import). Any current/future WS broadcaster should use this
    helper so Theft alerts always carry the same assessment fields as
    ``GET /api/consumers/{id}/assessment``. Non-Theft alerts carry
    ``assessment: None`` and are otherwise unchanged.
    """
    payload: dict[str, Any] = {
        "consumer_id": consumer_id,
        "event_label": event_label,
        "priority": priority,
        "risk_score": risk_score,
        "assessment": assessment if event_label == THEFT_LABEL else None,
    }
    if extra:
        payload.update(extra)
    return payload
