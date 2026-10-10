import type { Alert, Consumer } from '../types'
import { investigationStore } from './investigationCaseStore'
import { aiFeedback } from './aiFeedbackStore'

/**
 * Single source of truth for status-driven movement:
 *   Raw Alerts feed / Dashboard queue
 *     -- Investigate --> Active Investigations (Under Review)
 *     -- Dispatch    --> Field Inspection Dispatched
 *     -- Warning     --> Warning Notice Issued
 *     -- Resolve / Dismiss --> Incident History (terminal, hidden elsewhere)
 *
 * An item lives in exactly ONE section: terminal cases and active
 * investigations are filtered out of the alerts sections so items never
 * duplicate across sections. Filters are derived from the persisted
 * localStorage stores, so movement survives page refreshes.
 */

export function getHiddenFromAlerts(): Set<string> {
  const hidden = new Set<string>()
  investigationStore.getActiveConsumerIds().forEach(id => hidden.add(id))
  aiFeedback.getTerminalConsumerIds().forEach(id => hidden.add(id))
  return hidden
}

export function shouldShowInAlertsFeed(consumerId: string): boolean {
  if (investigationStore.has(consumerId)) return false
  if (aiFeedback.isTerminallyClosed(consumerId)) return false
  return true
}

export function filterAlerts<T extends { consumer: string }>(alerts: T[]): T[] {
  return alerts.filter(a => shouldShowInAlertsFeed(a.consumer))
}

export function filterConsumers<T extends { id: string }>(consumers: T[]): T[] {
  const hidden = getHiddenFromAlerts()
  return consumers.filter(c => !hidden.has(c.id))
}

/** Move a raw alert into Active Investigations (status: Under Review). */
export function moveAlertToInvestigation(alert: Alert): void {
  investigationStore.addFromAlert(alert)
}

export function ensureCaseForConsumer(c: Consumer) {
  return investigationStore.ensureFromConsumer({
    consumerId: c.id,
    transformerId: c.tr,
    event: `Anomaly: ${c.d.top}`,
    risk: c.d.risk,
    priority: c.d.priority,
    score: c.d.anomaly,
    cause: c.d.top,
  })
}
