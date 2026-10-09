import React, { useState } from 'react'
import type { Consumer, OperatorActionType, Priority } from '../../types'
import { aiFeedback } from '../../services/aiFeedbackStore'
import { sim } from '../../sim'
import { investigationStore } from '../../services/investigationCaseStore'
import { AlertTriangle, Send, ShieldAlert, CheckCircle, X, Shield, FileText, UserCheck } from 'lucide-react'

interface IncidentActionModalProps {
  consumer: Consumer
  actionType: OperatorActionType
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const IncidentActionModal: React.FC<IncidentActionModalProps> = ({
  consumer,
  actionType,
  isOpen,
  onClose,
  onSuccess
}) => {
  // Dismiss State
  const [dismissReason, setDismissReason] = useState<any>('Approved Solar Net-Metering')
  const [dismissNotes, setDismissNotes] = useState('')

  // Warning State
  const [warningChannel, setWarningChannel] = useState<'SMS' | 'EMAIL' | 'BOTH'>('BOTH')
  const [warningPhone, setWarningPhone] = useState('+91-98765-43210')
  const [warningEmail, setWarningEmail] = useState(`billing-${consumer.id.toLowerCase()}@utility.in`)
  const [auditDate, setAuditDate] = useState('2026-10-14')

  // Dispatch State
  const [teamName, setTeamName] = useState('Rapid Anti-Theft Flying Squad #2')
  const [officerName, setOfficerName] = useState('Insp. Rajesh Verma (Lead Vigilance)')
  const [workOrderId, setWorkOrderId] = useState(`WO-2026-${Math.floor(1000 + Math.random() * 9000)}`)
  const [priority, setPriority] = useState<Priority>(consumer.d.priority)
  const [modus, setModus] = useState('Suspected phase neutral bypass / external shunt wire')

  // Resolve State
  const [resolveOutcome, setResolveOutcome] = useState<any>('CONFIRMED_THEFT')
  const [recoveredINR, setRecoveredINR] = useState(12500)
  const [recoveredKWh, setRecoveredKWh] = useState(480)
  const [replacementMeter, setReplacementMeter] = useState(`MTR-DLMS-${Math.floor(10000 + Math.random() * 90000)}`)
  const [legalAction, setLegalAction] = useState(true)
  const [resolveRemarks, setResolveRemarks] = useState('Physical meter inspection verified bypass. Penalty notice issued and recovery finalized.')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (actionType === 'DISMISS') {
      aiFeedback.add({
        consumerId: consumer.id,
        action: 'DISMISS',
        dismiss: {
          reason: dismissReason,
          notes: dismissNotes || `Dismissed under verified exemption: ${dismissReason}`
        },
        operatorId: 'ENG-OPERATOR-1',
        feedbackForAI: {
          originalScore: consumer.d.anomaly,
          originalCause: consumer.d.top,
          verifiedGroundTruth: 'Normal consumption',
          isTruePositive: false,
          retrainingIncluded: true
        }
      })
    } else if (actionType === 'SEND_WARNING') {
      aiFeedback.add({
        consumerId: consumer.id,
        action: 'SEND_WARNING',
        warning: {
          noticeNumber: `NOT-2026-${Math.floor(100 + Math.random() * 900)}`,
          channel: warningChannel,
          recipient: warningChannel === 'SMS' ? warningPhone : warningChannel === 'EMAIL' ? warningEmail : `${warningPhone} / ${warningEmail}`,
          section: 'Section 135 & 126, Electricity Act 2003',
          messagePreview: `Formal Notice: Abnormal load shortfall detected on consumer ${consumer.id}. Remote audit scheduled for ${auditDate}.`,
          scheduledAuditDate: auditDate
        },
        operatorId: 'ENG-OPERATOR-1',
        feedbackForAI: {
          originalScore: consumer.d.anomaly,
          originalCause: consumer.d.top,
          verifiedGroundTruth: consumer.d.top,
          isTruePositive: true,
          retrainingIncluded: true
        }
      })
    } else if (actionType === 'DISPATCH_OFFICER') {
      aiFeedback.add({
        consumerId: consumer.id,
        action: 'DISPATCH_OFFICER',
        dispatch: {
          workOrderId,
          teamName,
          officerInCharge: officerName,
          priority,
          gpsCoords: '12.9716° N, 77.5946° E',
          targetMeterSerial: `MTR-KA-${consumer.id}`,
          suspectedModus: modus,
          assignedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        },
        operatorId: 'ENG-OPERATOR-1',
        feedbackForAI: {
          originalScore: consumer.d.anomaly,
          originalCause: consumer.d.top,
          verifiedGroundTruth: consumer.d.top,
          isTruePositive: true,
          retrainingIncluded: true
        }
      })
    } else if (actionType === 'RESOLVE') {
      aiFeedback.add({
        consumerId: consumer.id,
        action: 'RESOLVE',
        resolve: {
          outcome: resolveOutcome,
          recoveredRevenueINR: Number(recoveredINR),
          recoveredKWh: Number(recoveredKWh),
          replacementMeterSerial: resolveOutcome === 'METER_FAULT_FIXED' ? replacementMeter : undefined,
          legalActionFiled: legalAction,
          finalRemarks: resolveRemarks
        },
        operatorId: 'ENG-OPERATOR-1',
        feedbackForAI: {
          originalScore: consumer.d.anomaly,
          originalCause: consumer.d.top,
          verifiedGroundTruth: resolveOutcome === 'FALSE_ALARM_CLEARED' ? 'Normal consumption' : consumer.d.top,
          isTruePositive: resolveOutcome !== 'FALSE_ALARM_CLEARED',
          retrainingIncluded: true
        }
      })
      // Remove alert from active feed and reset consumer state
      sim.resolveAlert(consumer.id)
      investigationStore.resolveCase(consumer.id)
    }

    if (actionType === 'DISMISS') {
      sim.dismissAlert(consumer.id)
      investigationStore.resolveCase(consumer.id)
    }

    if (actionType === 'DISPATCH_OFFICER') {
      investigationStore.updateStatus(consumer.id, 'Field Inspection Dispatched', {
        workOrderId,
        officerInCharge: officerName
      })
    }

    if (actionType === 'SEND_WARNING') {
      investigationStore.updateStatus(consumer.id, 'Warning Notice Issued')
    }

    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header (Clean Light Theme) */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            {actionType === 'DISMISS' && <CheckCircle className="text-emerald-600" size={20} />}
            {actionType === 'SEND_WARNING' && <Send className="text-blue-600" size={20} />}
            {actionType === 'DISPATCH_OFFICER' && <ShieldAlert className="text-red-600" size={20} />}
            {actionType === 'RESOLVE' && <UserCheck className="text-purple-600" size={20} />}

            <h3 className="text-base font-bold text-slate-900">
              {actionType === 'DISMISS' && 'Dismiss Anomaly Alert'}
              {actionType === 'SEND_WARNING' && 'Send Warning Notice to Consumer'}
              {actionType === 'DISPATCH_OFFICER' && 'Dispatch Field Inspection Officer'}
              {actionType === 'RESOLVE' && 'Resolve Case & Record Outcome'}
            </h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Consumer Mini Banner */}
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 text-xs text-slate-600 border-b border-slate-100">
          <div>
            Consumer: <span className="font-mono font-bold text-slate-900">{consumer.id}</span> · Transformer:{' '}
            <span className="font-mono font-medium text-slate-800">{consumer.tr}</span> · Category: {consumer.cat}
          </div>
          <div className="font-mono font-bold text-red-600">Score: {consumer.d.anomaly}/100</div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {actionType === 'DISMISS' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Select Exemption Reason</label>
                <select
                  value={dismissReason}
                  onChange={e => setDismissReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Approved Solar Net-Metering">Approved Rooftop Solar Installed (PM Surya Ghar / Net-metered)</option>
                  <option value="Seasonal Vacancy">Seasonal Vacancy / Resident Traveling</option>
                  <option value="Scheduled Maintenance">Scheduled Factory / Maintenance Shutdown</option>
                  <option value="Known Grid Re-routing">Distribution Feeder Load Shift</option>
                  <option value="Data Artifact / Sensor Glitch">Communication Packet Loss / Hardware Glitch</option>
                  <option value="Other">Other Verified Operational Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Operator Remarks / Verification Note</label>
                <textarea
                  rows={3}
                  value={dismissNotes}
                  onChange={e => setDismissNotes(e.target.value)}
                  placeholder="e.g. Sanctioned net-metering document verified on portal..."
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <span className="font-bold">AI Retraining Feedback:</span> This will mark this case as a{' '}
                <span className="underline font-semibold">False Alarm</span> in the retraining database so the AI avoids flagging similar solar profiles in the future.
              </div>
            </>
          )}

          {actionType === 'SEND_WARNING' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Delivery Channel</label>
                  <select
                    value={warningChannel}
                    onChange={e => setWarningChannel(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="BOTH">SMS & Registered Email</option>
                    <option value="SMS">SMS Only</option>
                    <option value="EMAIL">Email Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Scheduled Audit Date</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={e => setAuditDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div className="font-bold text-slate-900">LEGAL NOTICE DRAFT:</div>
                <div className="mt-1 text-slate-600">
                  "Notice under Section 135 & 126, Indian Electricity Act 2003: An irregular consumption shortfall of{' '}
                  <span className="text-red-600 font-bold">{Math.abs(consumer.dev)}%</span> was recorded at service connection{' '}
                  <span className="text-slate-900 font-bold">{consumer.id}</span>. A technical audit is scheduled for{' '}
                  <span className="text-slate-900 font-medium">{auditDate}</span>. Please ensure meter box accessibility."
                </div>
              </div>
            </>
          )}

          {actionType === 'DISPATCH_OFFICER' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Work Order ID</label>
                  <input
                    type="text"
                    value={workOrderId}
                    readOnly
                    className="mt-1 w-full rounded-md border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Inspection Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as any)}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="P1">P1 - Immediate Inspection (Within 2 Hours)</option>
                    <option value="P2">P2 - Priority Audit (Within 24 Hours)</option>
                    <option value="P3">P3 - Routine Inspection</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Assigned Inspection Squad</label>
                <select
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="Rapid Anti-Theft Flying Squad #2">Rapid Anti-Theft Flying Squad #2 (Central Division)</option>
                  <option value="Special Vigilance Task Force Alpha">Special Vigilance Task Force Alpha (High Loss Feeder Unit)</option>
                  <option value="Smart Metering Technical Unit #4">Smart Metering Technical Unit #4 (Firmware & CT Audit)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Suspected Tampering Method</label>
                <input
                  type="text"
                  value={modus}
                  onChange={e => setModus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <span className="font-bold">Official Field Order:</span> Assigns inspection squad with GPS navigation coordinates, meter lock tamper verification checklist, and direct police accompaniment authorization.
              </div>
            </>
          )}

          {actionType === 'RESOLVE' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Inspection Outcome</label>
                <select
                  value={resolveOutcome}
                  onChange={e => setResolveOutcome(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="CONFIRMED_THEFT">Confirmed Theft / Physical Tampering Found</option>
                  <option value="METER_FAULT_FIXED">Defective Meter Replaced</option>
                  <option value="COMM_MODULE_RESTORED">Communication SIM / Optical Port Restored</option>
                  <option value="FALSE_ALARM_CLEARED">Legitimate Load Verified / False Alarm Cleared</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Assessed Penalty / Recovered (₹)</label>
                  <input
                    type="number"
                    value={recoveredINR}
                    onChange={e => setRecoveredINR(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Unmetered Energy Recovered (kWh)</label>
                  <input
                    type="number"
                    value={recoveredKWh}
                    onChange={e => setRecoveredKWh(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Final Verification Remarks</label>
                <textarea
                  rows={2}
                  value={resolveRemarks}
                  onChange={e => setResolveRemarks(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800">
                <span className="font-bold">Active Learning Feedback:</span> This verified ground-truth outcome is recorded and will be used to retrain future AI models with real-world accuracy.
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`rounded-md px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${
                actionType === 'DISMISS'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : actionType === 'SEND_WARNING'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : actionType === 'DISPATCH_OFFICER'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {actionType === 'DISMISS' && 'Confirm Dismissal'}
              {actionType === 'SEND_WARNING' && 'Dispatch Notice'}
              {actionType === 'DISPATCH_OFFICER' && 'Issue Work Order & Dispatch'}
              {actionType === 'RESOLVE' && 'Finalize Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
