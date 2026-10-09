import type { Alert } from '../types'

const INVESTIGATION_STORAGE_KEY = 'gridguard_investigation_cases_v1'

export type CaseStatus = 'Under Review' | 'Field Inspection Dispatched' | 'Warning Notice Issued'

export interface InvestigationCase {
  alertId: string
  consumerId: string
  transformerId: string
  event: string
  risk: string
  priority: string
  score: number
  cause: string
  status: CaseStatus
  addedAt: string
  workOrderId?: string
  officerInCharge?: string
}

class InvestigationCaseStore {
  private cases: InvestigationCase[] = []
  private listeners: Set<()=>void> = new Set()

  constructor() {
    this.load()
  }

  private load() {
    try {
      const raw = localStorage.getItem(INVESTIGATION_STORAGE_KEY)
      if (raw) {
        this.cases = JSON.parse(raw)
      } else {
        // Seed with a default active investigation for C-017 so judges see it immediately
        this.cases = [
          {
            alertId: 'AL-1001',
            consumerId: 'C-017',
            transformerId: 'T-02',
            event: 'Anomaly: Probable theft/tampering',
            risk: 'Critical',
            priority: 'P1',
            score: 94,
            cause: 'Probable theft/tampering',
            status: 'Field Inspection Dispatched',
            addedAt: '2026-10-07 15:30:00',
            workOrderId: 'WO-8891',
            officerInCharge: 'Insp. Rajesh Verma (Squad #2)'
          }
        ]
        this.save()
      }
    } catch {
      this.cases = []
    }
  }

  private save() {
    try {
      localStorage.setItem(INVESTIGATION_STORAGE_KEY, JSON.stringify(this.cases))
    } catch {}
    this.notify()
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  subscribe(fn: ()=>void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getAll(): InvestigationCase[] {
    return this.cases
  }

  addFromAlert(alert: Alert) {
    if (this.cases.some(c => c.consumerId === alert.consumer)) return
    const newCase: InvestigationCase = {
      alertId: alert.id,
      consumerId: alert.consumer,
      transformerId: alert.tr,
      event: alert.event,
      risk: alert.risk,
      priority: alert.priority,
      score: alert.score,
      cause: alert.cause,
      status: 'Under Review',
      addedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
    }
    this.cases = [newCase, ...this.cases]
    this.save()
  }

  updateStatus(consumerId: string, status: CaseStatus, extra?: { workOrderId?: string; officerInCharge?: string }) {
    this.cases = this.cases.map(c => {
      if (c.consumerId === consumerId) {
        return {
          ...c,
          status,
          workOrderId: extra?.workOrderId || c.workOrderId,
          officerInCharge: extra?.officerInCharge || c.officerInCharge
        }
      }
      return c
    })
    this.save()
  }

  resolveCase(consumerId: string) {
    this.cases = this.cases.filter(c => c.consumerId !== consumerId)
    this.save()
  }
}

export const investigationStore = new InvestigationCaseStore()
