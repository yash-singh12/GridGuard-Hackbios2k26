export type Cause =
  | 'Probable theft/tampering'
  | 'Meter malfunction'
  | 'Communication failure'
  | 'Legitimate abnormal consumption'
  | 'Seasonal variation'
  | 'Data quality issue'
  | 'Requires review'
  | 'Normal consumption'

export type Risk = 'Normal' | 'Watch' | 'Medium' | 'High' | 'Critical'
export type Priority = 'P1' | 'P2' | 'P3' | 'P4'

export interface Flags {
  dev: number
  persist: number
  comm: boolean
  meter: boolean
  peers: boolean
  known: boolean
  trGap: number
}

export interface EvidenceItem {
  signal: string
  text: string
  direction: 'supports' | 'contradicts'
  weight: number
}

export interface WhyNot {
  cause: Cause
  reasons: string[]
}

export interface CauseScore {
  cause: Cause
  score: number
}

export interface Diag {
  scores: CauseScore[]
  top: Cause
  anomaly: number
  risk: Risk
  priority: Priority
  conf: 'High' | 'Medium' | 'Low'
  margin: number
  evidence: EvidenceItem[]
  whyNot: WhyNot[]
  actions: string[]
}

export interface Consumer {
  id: string
  cat: string
  load: number
  tariff: number
  tr: string
  feeder: string
  hist: (number | null)[]
  base: number
  actual: number | null
  dev: number
  stolen: number
  flags: Flags
  peer: number[]
  d: Diag
}

export interface Alert {
  id: string
  time: string
  consumer: string
  tr: string
  event: string
  risk: Risk
  cause: Cause
  conf: string
  score: number
  priority: Priority
  status: string
}

export interface Reading {
  t: string
  id: string
  tr: string
  v: number | null
  i: number | null
  p: number | null
  e: number
  meter: string
  comm: string
  status: string
}

export interface TrAcc {
  id: string
  input: number
  consumer: number
  tech: number
  unexpl: number
  gap: number
  lossPct: number
  gapPct: number
}

// ==========================================
// OPERATIONAL ACTIONS & AI FEEDBACK SYSTEM
// ==========================================

export type OperatorActionType = 'DISMISS' | 'SEND_WARNING' | 'DISPATCH_OFFICER' | 'RESOLVE'

export interface DismissDetails {
  reason: 'Approved Solar Net-Metering' | 'Seasonal Vacancy' | 'Scheduled Maintenance' | 'Known Grid Re-routing' | 'Data Artifact / Sensor Glitch' | 'Other'
  notes: string
}

export interface WarningDetails {
  noticeNumber: string
  channel: 'SMS' | 'EMAIL' | 'BOTH'
  recipient: string
  section: string
  messagePreview: string
  scheduledAuditDate: string
}

export interface DispatchDetails {
  workOrderId: string
  teamName: string
  officerInCharge: string
  priority: Priority
  gpsCoords: string
  targetMeterSerial: string
  suspectedModus: string
  assignedAt: string
}

export interface ResolveDetails {
  outcome: 'CONFIRMED_THEFT' | 'METER_FAULT_FIXED' | 'COMM_MODULE_RESTORED' | 'FALSE_ALARM_CLEARED'
  recoveredRevenueINR: number
  recoveredKWh: number
  replacementMeterSerial?: string
  legalActionFiled: boolean
  finalRemarks: string
}

export interface IncidentActionLog {
  id: string
  timestamp: string
  consumerId: string
  action: OperatorActionType
  dismiss?: DismissDetails
  warning?: WarningDetails
  dispatch?: DispatchDetails
  resolve?: ResolveDetails
  operatorId: string
  feedbackForAI: {
    originalScore: number
    originalCause: Cause
    verifiedGroundTruth: Cause | 'Normal consumption'
    isTruePositive: boolean
    retrainingIncluded: boolean
  }
}
