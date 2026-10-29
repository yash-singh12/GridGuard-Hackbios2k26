/**
 * Backend theft-assessment client (Method A).
 * Talks to the FastAPI service at http://127.0.0.1:8000:
 *   POST /api/consumers/{id}/readings    ingest monthly series (in-memory)
 *   GET  /api/consumers/{id}/assessment  theft start + financial loss
 * Returns null when the backend is unreachable so callers fall back to
 * the frontend mock estimates.
 */

const BACKEND_URL = import.meta.env.VITE_API_URL || '';

export interface AssessmentReading {
  timestamp?: string | null;
  kwh_recorded?: number | null;
  rolling_7d_avg?: number | null;
  peer_group_avg?: number | null;
  power_kw?: number | null;
  comm_status?: string | null;
  meter_status?: string | null;
  tariff?: number | null;
  event_label?: string | null;
}

export interface TheftStart {
  theft_start_idx: number | null;
  theft_start_timestamp: string | null;
  confidence: number;
  consecutive_low_periods: number;
  min_ratio: number;
  comm_failure_overlap: boolean;
  assumptions: string[];
}

export interface LossEstimate {
  baseline_per_period: number;
  periods_affected: number;
  theft_start: string | null;
  estimated_loss_kwh: number;
  revenue_loss: number;
  indicative_penalty: number;
  tariff_used: number;
  penalty_factor_used: number;
  assumptions: string[];
}

export interface ConsumerAssessment {
  consumer_id: string;
  event_label: string;
  theft_start: TheftStart | null;
  loss: LossEstimate | null;
  loss_skipped_reason: string | null;
  priority: string;
  high_loss_cutoff_inr_used: number;
  assumptions: string[];
}

export async function ingestConsumerReadings(
  consumerId: string,
  readings: AssessmentReading[],
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/consumers/${encodeURIComponent(consumerId)}/readings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readings }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchConsumerAssessment(
  consumerId: string,
  params?: { event_label?: string; tariff?: number },
): Promise<ConsumerAssessment | null> {
  try {
    const q = new URLSearchParams();
    if (params?.event_label) q.set('event_label', params.event_label);
    if (params?.tariff != null) q.set('tariff', String(params.tariff));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetch(
      `${BACKEND_URL}/api/consumers/${encodeURIComponent(consumerId)}/assessment${qs}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as ConsumerAssessment;
  } catch {
    return null;
  }
}

/**
 * Convenience: ingest a monthly series, then fetch its assessment.
 * Returns null when the backend is unreachable.
 */
export async function assessConsumerSeries(
  consumerId: string,
  readings: AssessmentReading[],
  params?: { event_label?: string; tariff?: number },
): Promise<ConsumerAssessment | null> {
  const ok = await ingestConsumerReadings(consumerId, readings);
  if (!ok) return null;
  return fetchConsumerAssessment(consumerId, params);
}
