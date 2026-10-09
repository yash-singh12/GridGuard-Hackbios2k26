/**
 * Real Python ML Client
 * Communicates with the FastAPI ML service running at http://127.0.0.1:8000
 * Models: LightGBM (lgbm_model.pkl) + Isolation Forest (iso_forest_v2.pkl)
 */

export interface MLPredictRequest {
  kwh_recorded: number;
  meter_status?: string;
  comm_status?: string;
  voltage?: number;
  power_kw?: number;
  current?: number;
  peer_group_avg?: number;
  rolling_7d_avg?: number;
}

export interface MLPredictResponse {
  event_label: 'Normal' | 'Theft' | 'Meter Fault' | 'Comms Failure';
  priority: 'P1 - Critical Alert' | 'P2 - High Alert' | 'P3 - Medium Alert' | 'P4 - Normal';
  risk_score: number;
  probabilities: {
    'Comms Failure': number;
    'Meter Fault': number;
    'Normal': number;
    'Theft': number;
  };
  isolation_forest: {
    score: number;
    is_anomaly: boolean;
    shortfall: number;
    log_kwh_per_kw: number;
  };
}

const BACKEND_URL = 'http://127.0.0.1:8000';

export async function checkMLBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function predictRealML(data: MLPredictRequest): Promise<MLPredictResponse | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kwh_recorded: Number(data.kwh_recorded) || 0.05,
        meter_status: data.meter_status || 'OK',
        comm_status: data.comm_status || 'OK',
        voltage: Number(data.voltage) || 230.0,
        power_kw: Number(data.power_kw) || 1.5,
        current: Number(data.current) || 6.5,
        peer_group_avg: Number(data.peer_group_avg) || 1.4,
        rolling_7d_avg: Number(data.rolling_7d_avg) || 1.35,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('Real ML Backend unreachable, fallback to simulation:', err);
    return null;
  }
}
