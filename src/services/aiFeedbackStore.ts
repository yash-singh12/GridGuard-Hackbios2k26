import type { IncidentActionLog, OperatorActionType, Cause, Priority } from '../types'
import { safeGet, safeSet } from './storage'

const STORAGE_KEY = 'gridguard_ai_feedback_logs_v1'

const INITIAL_LOGS: IncidentActionLog[] = [
  {
    id: 'ACT-2026-0811',
    timestamp: '2026-10-06 14:22:10',
    consumerId: 'C-017',
    action: 'DISPATCH_OFFICER',
    dispatch: {
      workOrderId: 'WO-8891',
      teamName: 'Rapid Anti-Theft Squad #2',
      officerInCharge: 'Insp. Rajesh Verma',
      priority: 'P1',
      gpsCoords: '12.9716° N, 77.5946° E',
      targetMeterSerial: 'MTR-KA-9921',
      suspectedModus: 'Neutral bypass shunt wire on phase L1',
      assignedAt: '2026-10-06 14:25:00'
    },
    operatorId: 'ENG-402 (Divya S.)',
    feedbackForAI: {
      originalScore: 94,
      originalCause: 'Probable theft/tampering',
      verifiedGroundTruth: 'Probable theft/tampering',
      isTruePositive: true,
      retrainingIncluded: true
    }
  },
  {
    id: 'ACT-2026-0810',
    timestamp: '2026-10-05 11:05:40',
    consumerId: 'C-031',
    action: 'RESOLVE',
    resolve: {
      outcome: 'METER_FAULT_FIXED',
      recoveredRevenueINR: 4200,
      recoveredKWh: 560,
      replacementMeterSerial: 'MTR-KA-10492',
      legalActionFiled: false,
      finalRemarks: 'Burnt current transformer coil replaced with calibrated unit.'
    },
    operatorId: 'ENG-108 (Amit K.)',
    feedbackForAI: {
      originalScore: 84,
      originalCause: 'Meter malfunction',
      verifiedGroundTruth: 'Meter malfunction',
      isTruePositive: true,
      retrainingIncluded: true
    }
  },
  {
    id: 'ACT-2026-0809',
    timestamp: '2026-10-04 16:48:15',
    consumerId: 'C-009',
    action: 'SEND_WARNING',
    warning: {
      noticeNumber: 'NOT-2026-192',
      channel: 'BOTH',
      recipient: 'consumer-c009@gridguard.test / +91-98765-43210',
      section: 'Section 135 & 126, Indian Electricity Act 2003',
      messagePreview: 'Audit alert: Unexplained 65% drop vs peer baseline recorded in October cycle.',
      scheduledAuditDate: '2026-10-12'
    },
    operatorId: 'ENG-402 (Divya S.)',
    feedbackForAI: {
      originalScore: 78,
      originalCause: 'Communication failure',
      verifiedGroundTruth: 'Communication failure',
      isTruePositive: true,
      retrainingIncluded: true
    }
  },
  {
    id: 'ACT-2026-0808',
    timestamp: '2026-10-03 09:12:00',
    consumerId: 'C-040',
    action: 'DISMISS',
    dismiss: {
      reason: 'Approved Solar Net-Metering',
      notes: 'Customer installed 5 kW rooftop solar under PM Surya Ghar Muft Bijli Yojana with sanctioned net-meter agreement #SG-2026-44.'
    },
    operatorId: 'ENG-204 (Pooja R.)',
    feedbackForAI: {
      originalScore: 68,
      originalCause: 'Legitimate abnormal consumption',
      verifiedGroundTruth: 'Normal consumption',
      isTruePositive: false,
      retrainingIncluded: true
    }
  }
]

class AIFeedbackStore {
  private logs: IncidentActionLog[] = []
  private listeners: Set<() => void> = new Set()

  constructor() {
    this.load()
  }

  private load() {
    const data = safeGet(STORAGE_KEY)
    if (data) {
      try {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) {
          this.logs = parsed
          return
        }
        console.warn('[aiFeedback] stored value is not a list; reseeding.')
      } catch {
        console.warn('[aiFeedback] stored value is corrupt; reseeding.')
      }
    }
    // Missing, corrupt, or non-list data: fall back to the initial logs.
    this.logs = [...INITIAL_LOGS]
    this.save()
  }

  private save() {
    if (!safeSet(STORAGE_KEY, JSON.stringify(this.logs))) {
      console.warn('[aiFeedback] browser storage unavailable; history is in-memory only.')
    }
    this.notify()
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getAll(): IncidentActionLog[] {
    return this.logs
  }

  getByConsumer(consumerId: string): IncidentActionLog[] {
    return this.logs.filter(l => l.consumerId === consumerId)
  }

  getLatestForConsumer(consumerId: string): IncidentActionLog | undefined {
    return this.logs.find(l => l.consumerId === consumerId)
  }

  // Terminal states remove an item from Alerts / Investigations into History.
  isTerminallyClosed(consumerId: string): boolean {
    const latest = this.getLatestForConsumer(consumerId)
    return !!latest && (latest.action === 'RESOLVE' || latest.action === 'DISMISS')
  }

  getTerminalConsumerIds(): Set<string> {
    const ids = new Set<string>()
    // latest log per consumer wins (logs are newest-first)
    const seen = new Set<string>()
    for (const l of this.logs) {
      if (seen.has(l.consumerId)) continue
      seen.add(l.consumerId)
      if (l.action === 'RESOLVE' || l.action === 'DISMISS') ids.add(l.consumerId)
    }
    return ids
  }

  add(log: Omit<IncidentActionLog, 'id' | 'timestamp'>): IncidentActionLog {
    const newLog: IncidentActionLog = {
      ...log,
      id: `ACT-2026-${String(Math.floor(1000 + Math.random() * 9000))}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    }
    this.logs = [newLog, ...this.logs]
    this.save()
    return newLog
  }

  getStats() {
    const total = this.logs.length
    const truePositives = this.logs.filter(l => l.feedbackForAI.isTruePositive).length
    const falseAlarms = this.logs.filter(l => !l.feedbackForAI.isTruePositive).length
    const accuracy = total > 0 ? Math.round((truePositives / total) * 100) : 100
    const dispatches = this.logs.filter(l => l.action === 'DISPATCH_OFFICER').length
    const warnings = this.logs.filter(l => l.action === 'SEND_WARNING').length
    const resolved = this.logs.filter(l => l.action === 'RESOLVE').length
    const totalRecoveredINR = this.logs.reduce((sum, l) => sum + (l.resolve?.recoveredRevenueINR || 0), 0)

    return {
      total,
      truePositives,
      falseAlarms,
      accuracy,
      dispatches,
      warnings,
      resolved,
      totalRecoveredINR,
      retrainingReadySamples: this.logs.filter(l => l.feedbackForAI.retrainingIncluded).length
    }
  }

  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  exportCSV(): string {
    const headers = [
      'Log_ID',
      'Timestamp',
      'Consumer_ID',
      'Operator_Action',
      'Original_Score',
      'Original_Cause',
      'Verified_Ground_Truth',
      'Is_True_Positive',
      'Operator_ID',
      'Work_Order_Or_Notice',
      'Recovered_INR',
      'Notes'
    ]
    const rows = this.logs.map(l => [
      l.id,
      l.timestamp,
      l.consumerId,
      l.action,
      l.feedbackForAI.originalScore,
      `"${l.feedbackForAI.originalCause}"`,
      `"${l.feedbackForAI.verifiedGroundTruth}"`,
      l.feedbackForAI.isTruePositive ? '1' : '0',
      `"${l.operatorId}"`,
      `"${l.dispatch?.workOrderId || l.warning?.noticeNumber || l.dismiss?.reason || ''}"`,
      l.resolve?.recoveredRevenueINR || 0,
      `"${(l.dismiss?.notes || l.resolve?.finalRemarks || l.dispatch?.suspectedModus || '').replace(/"/g, '""')}"`
    ])
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  }

  reset() {
    this.logs = [...INITIAL_LOGS]
    this.save()
  }
}

export const aiFeedback = new AIFeedbackStore()
