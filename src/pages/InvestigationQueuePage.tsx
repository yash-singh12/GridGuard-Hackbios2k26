import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShieldAlert,
  UserCheck,
  Send,
  CheckCircle,
  Clock,
  ArrowRight,
  Filter,
  AlertTriangle,
  FileText,
  MapPin,
  ExternalLink
} from 'lucide-react'
import { investigationStore, type InvestigationCase, type CaseStatus } from '../services/investigationCaseStore'
import { aiFeedback } from '../services/aiFeedbackStore'
import { IncidentActionModal } from '../components/investigation/IncidentActionModal'
import { api } from '../mock'
import type { Consumer, OperatorActionType } from '../types'

export const InvestigationQueuePage: React.FC = () => {
  const navigate = useNavigate()
  const [cases, setCases] = useState<InvestigationCase[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL')
  const [activeModalConsumer, setActiveModalConsumer] = useState<Consumer | null>(null)
  const [modalAction, setModalAction] = useState<OperatorActionType | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setCases(investigationStore.getAll())
    const unsub = investigationStore.subscribe(() => {
      setCases(investigationStore.getAll())
    })
    const unsub2 = aiFeedback.subscribe(() => {
      // Resolves / dismissals elsewhere remove cases here instantly.
      setCases(investigationStore.getAll())
    })
    // Another tab mutating localStorage doesn't fire store listeners here.
    const onExternal = () => setCases(investigationStore.getAll())
    window.addEventListener('storage', onExternal)
    return () => {
      unsub()
      unsub2()
      window.removeEventListener('storage', onExternal)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const filteredCases = cases.filter(c => {
    if (selectedStatus === 'ALL') return true
    return c.status === selectedStatus
  })

  const underReviewCount = cases.filter(c => c.status === 'Under Review').length
  const dispatchedCount = cases.filter(c => c.status === 'Field Inspection Dispatched').length
  const warningCount = cases.filter(c => c.status === 'Warning Notice Issued').length

  const handleOpenAction = (consumerId: string, action: OperatorActionType) => {
    const c = api.consumer(consumerId, 'A')
    if (c) {
      setActiveModalConsumer(c)
      setModalAction(action)
    }
  }

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Header Banner with Live Statuses at the Top */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="text-blue-600" size={18} />
              Active Investigations Dashboard
            </h2>
            <p className="text-xs text-slate-500">
              Only alerts marked for active investigation appear here. Track field squad status and complete resolutions.
            </p>
          </div>
          <button
            onClick={() => navigate('/alerts')}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            ← View Raw Alerts Feed
          </button>
        </div>

        {/* Status Counter Pills at Top */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div
            onClick={() => setSelectedStatus('ALL')}
            className={`cursor-pointer rounded-lg border p-3 transition ${
              selectedStatus === 'ALL'
                ? 'border-blue-500 bg-blue-50/70 shadow-xs'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/60'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">Total Under Investigation</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">{cases.length} Cases</div>
            <div className="text-[10px] text-blue-600">Active pipeline</div>
          </div>

          <div
            onClick={() => setSelectedStatus('Under Review')}
            className={`cursor-pointer rounded-lg border p-3 transition ${
              selectedStatus === 'Under Review'
                ? 'border-amber-500 bg-amber-50/70 shadow-xs'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/60'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">Under Review</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-700">{underReviewCount} Cases</div>
            <div className="text-[10px] text-amber-600">Desk audit in progress</div>
          </div>

          <div
            onClick={() => setSelectedStatus('Field Inspection Dispatched')}
            className={`cursor-pointer rounded-lg border p-3 transition ${
              selectedStatus === 'Field Inspection Dispatched'
                ? 'border-red-500 bg-red-50/70 shadow-xs'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/60'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">Field Squad Dispatched</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-600">{dispatchedCount} Teams</div>
            <div className="text-[10px] text-red-600">Physical inspection ongoing</div>
          </div>

          <div
            onClick={() => setSelectedStatus('Warning Notice Issued')}
            className={`cursor-pointer rounded-lg border p-3 transition ${
              selectedStatus === 'Warning Notice Issued'
                ? 'border-purple-500 bg-purple-50/70 shadow-xs'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/60'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500">Warning Notice Issued</div>
            <div className="mt-1 font-mono text-xl font-bold text-purple-700">{warningCount} Consumers</div>
            <div className="text-[10px] text-purple-600">Sec 135 Electricity Act</div>
          </div>
        </div>
      </div>

      {/* 2. Main Investigation Cases Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Active Investigation Queue ({filteredCases.length})
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Click Resolve when field inspection is complete to archive to History
          </span>
        </div>

        {filteredCases.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle className="mx-auto text-emerald-500 mb-2" size={32} />
            <h4 className="font-semibold text-slate-800 text-sm">No Active Investigations in this Filter</h4>
            <p className="text-xs mt-1 text-slate-500">
              Go to the <strong>Incident Alerts</strong> tab or <strong>Dashboard</strong> and click "Investigate →" to add cases here.
            </p>
            <button
              onClick={() => {
                investigationStore.restoreSample()
                setCases(investigationStore.getAll())
                setSelectedStatus('ALL')
                setToast('Sample case C-017 restored to Active Investigations.')
              }}
              className="mt-3 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 shadow-xs"
            >
              Reload sample case (C-017)
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-100/60 font-semibold text-slate-600">
                <tr>
                  <th className="p-3">Consumer ID</th>
                  <th className="p-3">Current Status</th>
                  <th className="p-3">Transformer</th>
                  <th className="p-3">Probable Cause</th>
                  <th className="p-3">Risk & Score</th>
                  <th className="p-3">Assigned Team / Work Order</th>
                  <th className="p-3">Initiated Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCases.map(c => (
                  <tr key={c.consumerId} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-blue-600">
                      <button
                        onClick={() => navigate(`/consumers/${c.consumerId}`)}
                        className="hover:underline flex items-center gap-1"
                      >
                        {c.consumerId} <ExternalLink size={11} className="text-slate-400" />
                      </button>
                    </td>

                    {/* Status Badge */}
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          c.status === 'Field Inspection Dispatched'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : c.status === 'Warning Notice Issued'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {c.status === 'Field Inspection Dispatched' && <MapPin size={11} />}
                        {c.status === 'Warning Notice Issued' && <Send size={11} />}
                        {c.status === 'Under Review' && <Clock size={11} />}
                        {c.status}
                      </span>
                      <div className="mt-1.5 flex items-center gap-1" title="Investigation progress: flagged → under review → field action → resolved">
                        {[1, 2, 3].map(step => {
                          const stage = c.status === 'Under Review' ? 1 : 2
                          return (
                            <span
                              key={step}
                              className={`h-1 flex-1 rounded-full ${step <= stage ? 'bg-blue-500' : 'bg-slate-200'}`}
                            />
                          )
                        })}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        {c.status === 'Under Review' ? 'Step 1/3 · Desk audit' : 'Step 2/3 · Field action'}
                      </div>
                    </td>

                    <td className="p-3 font-mono text-slate-600">{c.transformerId}</td>
                    <td className="p-3 font-semibold text-slate-800">{c.cause}</td>
                    <td className="p-3">
                      <span className="font-mono font-bold text-red-600">{c.score}/100</span>
                      <span className="ml-1.5 text-[10px] text-slate-500 font-medium">({c.priority})</span>
                    </td>

                    <td className="p-3 text-[11px]">
                      {c.workOrderId ? (
                        <div>
                          <div className="font-mono font-bold text-slate-800">{c.workOrderId}</div>
                          <div className="text-slate-500 text-[10px]">{c.officerInCharge}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">None assigned</span>
                      )}
                    </td>

                    <td className="p-3 font-mono text-[11px] text-slate-500">{c.addedAt}</td>

                    {/* Actions Column */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status !== 'Field Inspection Dispatched' && (
                          <button
                            onClick={() => handleOpenAction(c.consumerId, 'DISPATCH_OFFICER')}
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-xs"
                          >
                            Dispatch Squad
                          </button>
                        )}
                        {c.status !== 'Warning Notice Issued' && (
                          <button
                            onClick={() => handleOpenAction(c.consumerId, 'SEND_WARNING')}
                            className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 shadow-xs"
                          >
                            Warn
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenAction(c.consumerId, 'DISMISS')}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50 shadow-xs"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => handleOpenAction(c.consumerId, 'RESOLVE')}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                        >
                          ✓ Resolve Case
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Modal for Dispatch / Resolve */}
      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900 shadow-sm">
          {toast}
        </div>
      )}
      {activeModalConsumer && modalAction && (
        <IncidentActionModal
          consumer={activeModalConsumer}
          actionType={modalAction}
          isOpen={true}
          onClose={() => {
            setActiveModalConsumer(null)
            setModalAction(null)
          }}
          onSuccess={() => {
            const doneId = activeModalConsumer.id
            const doneAction = modalAction
            setActiveModalConsumer(null)
            setModalAction(null)
            setCases(investigationStore.getAll())
            setToast(
              doneAction === 'RESOLVE' || doneAction === 'DISMISS'
                ? `${doneId} completed and moved to Incident History.`
                : doneAction === 'DISPATCH_OFFICER'
                ? `${doneId} status → Field Inspection Dispatched.`
                : `${doneId} status → Warning Notice Issued.`
            )
          }}
        />
      )}
    </div>
  )
}
