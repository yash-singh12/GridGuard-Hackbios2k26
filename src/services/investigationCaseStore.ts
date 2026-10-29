import type { Alert } from '../types'
import { safeGet, safeSet, isLocalStorageAvailable } from './storage'

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

  private defaultSeed(): InvestigationCase[] {
    // Default active investigation for C-017 so first run shows the workflow.
    return [
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
  }

  private load() {
    const raw = safeGet(INVESTIGATION_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.cases = parsed
          return
        }
        console.warn('[investigationStore] stored value is not a list; reseeding.')
      } catch {
        console.warn('[investigationStore] stored value is corrupt; reseeding.')
      }
      // Corrupt/unexpected data: reseed instead of showing a permanent 0.
      this.cases = this.defaultSeed()
      this.save()
    } else if (!isLocalStorageAvailable()) {
      // Storage blocked: keep an in-memory seed so the page is usable;
      // changes last until refresh (banner in App.tsx explains why).
      this.cases = this.defaultSeed()
    } else {
      this.cases = this.defaultSeed()
      this.save()
    }
  }

  private save() {
    safeSet(INVESTIGATION_STORAGE_KEY, JSON.stringify(this.cases))
    this.notify()
  }

  /** Persistence available? If false, data is in-memory and lost on refresh. */
  isPersistent(): boolean {
    return isLocalStorageAvailable()
  }

  /** Explicit demo reset: back to the first-run seed (clears user cases). */
  resetToSeed() {
    this.cases = this.defaultSeed()
    this.save()
  }

  /** Explicit demo recovery: re-add the sample C-017 case (reopened audit). */
  restoreSample(): InvestigationCase {
    const existing = this.getByConsumer('C-017')
    if (existing) return existing
    const [seed] = this.defaultSeed()
    this.cases = [seed, ...this.cases]
    this.save()
    return seed
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

  has(consumerId: string): boolean {
    return this.cases.some(c => c.consumerId === consumerId)
  }

  getByConsumer(consumerId: string): InvestigationCase | undefined {
    return this.cases.find(c => c.consumerId === consumerId)
  }

  getActiveConsumerIds(): Set<string> {
    return new Set(this.cases.map(c => c.consumerId))
  }

  // Ensure a case exists before DISPATCH / WARNING transitions that are
  // triggered outside the investigations queue (dashboard, detail page).
  ensureFromConsumer(input: { consumerId: string; transformerId: string; event: string; risk: string; priority: string; score: number; cause: string; alertId?: string; addedAt?: string }) {
    if (this.has(input.consumerId)) return this.getByConsumer(input.consumerId)!
    const nc: InvestigationCase = {
      alertId: input.alertId || ('AL-' + input.consumerId),
      consumerId: input.consumerId,
      transformerId: input.transformerId,
      event: input.event,
      risk: input.risk,
      priority: input.priority,
      score: input.score,
      cause: input.cause,
      status: 'Under Review',
      addedAt: input.addedAt || new Date().toISOString().replace('T', ' ').substring(0, 19),
    }
    this.cases = [nc, ...this.cases]
    this.save()
    return nc
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
