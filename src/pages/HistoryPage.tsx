import React, { useState, useEffect } from 'react'
import {
  History,
  CheckCircle,
  FileText,
  DollarSign,
  TrendingDown,
  Download,
  Search,
  Filter,
  ShieldCheck,
  Scale
} from 'lucide-react'
import { aiFeedback } from '../services/aiFeedbackStore'
import type { IncidentActionLog } from '../types'
import { api } from '../mock'
import { exportForensicPDF } from '../components/investigation/ForensicReportExport'

export const HistoryPage: React.FC = () => {
  const [logs, setLogs] = useState<IncidentActionLog[]>([])
  const [filterAction, setFilterAction] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setLogs(aiFeedback.getAll())
    const unsub = aiFeedback.subscribe(() => {
      setLogs(aiFeedback.getAll())
    })
    return () => {
      unsub()
    }
  }, [])

  const stats = aiFeedback.getStats()

  const resolvedLogs = logs.filter(l => {
    if (filterAction === 'RESOLVE' && l.action !== 'RESOLVE') return false
    if (filterAction === 'DISMISS' && l.action !== 'DISMISS') return false
    if (filterAction === 'DISPATCH' && l.action !== 'DISPATCH_OFFICER') return false
    if (filterAction === 'WARNING' && l.action !== 'SEND_WARNING') return false

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        l.consumerId.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        (l.resolve?.finalRemarks || '').toLowerCase().includes(q) ||
        (l.dispatch?.officerInCharge || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const totalResolvedCount = logs.filter(l => l.action === 'RESOLVE').length

  const handleDownloadPDF = (consumerId: string) => {
    const c = api.consumer(consumerId, 'A')
    if (c) exportForensicPDF(c)
  }

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Top Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total Completed Cases</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-700">{totalResolvedCount} Resolved</div>
          <div className="text-[11px] text-slate-500">{logs.length} total logged actions</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Recovered Utility Revenue</div>
          <div className="mt-1 font-mono text-2xl font-bold text-blue-600">
            ₹{stats.totalRecoveredINR.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500">Verified through settlement</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Field Squad Dispatches</div>
          <div className="mt-1 font-mono text-2xl font-bold text-red-600">{stats.dispatches} Teams</div>
          <div className="text-[11px] text-slate-500">Anti-theft raids executed</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">AI Ground Truth Verification</div>
          <div className="mt-1 font-mono text-2xl font-bold text-purple-700">{stats.accuracy}% Precision</div>
          <div className="text-[11px] text-slate-500">Active learning aligned</div>
        </div>
      </div>

      {/* 2. Resolved Cases & Historical Audit Log Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="text-blue-600" size={18} />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Resolved Cases & Incident History
              </h3>
              <p className="text-[11px] text-slate-500">
                Audit trail of completed field inspections, recovered revenue, and legal actions
              </p>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Search consumer or ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="rounded-md border border-slate-300 bg-white py-1 pl-7 pr-3 text-xs text-slate-800 placeholder-slate-400 shadow-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-xs focus:outline-none"
            >
              <option value="ALL">All Actions</option>
              <option value="RESOLVE">Resolved Only</option>
              <option value="DISPATCH">Field Dispatches</option>
              <option value="WARNING">Warning Notices</option>
              <option value="DISMISS">Dismissed</option>
            </select>
          </div>
        </div>

        {resolvedLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle className="mx-auto text-slate-400 mb-2" size={32} />
            <p className="text-xs">No resolved cases found matching your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-100/60 font-semibold text-slate-600">
                <tr>
                  <th className="p-3">Action ID</th>
                  <th className="p-3">Consumer ID</th>
                  <th className="p-3">Action Type</th>
                  <th className="p-3">Outcome / Details</th>
                  <th className="p-3">Recovered Revenue</th>
                  <th className="p-3">Operator / Squad</th>
                  <th className="p-3">Completion Date</th>
                  <th className="p-3 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolvedLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-mono font-bold text-slate-700">{l.id}</td>
                    <td className="p-3 font-mono font-bold text-blue-600">{l.consumerId}</td>

                    {/* Action Type Badge */}
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          l.action === 'RESOLVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : l.action === 'DISPATCH_OFFICER'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : l.action === 'SEND_WARNING'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {l.action === 'RESOLVE' && <CheckCircle size={11} />}
                        {l.action === 'DISPATCH_OFFICER' && <ShieldCheck size={11} />}
                        {l.action === 'SEND_WARNING' && <Scale size={11} />}
                        {l.action.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Outcome Details */}
                    <td className="p-3 max-w-xs text-[11px]">
                      {l.resolve && (
                        <div>
                          <div className="font-semibold text-slate-800">{l.resolve.outcome.replace(/_/g, ' ')}</div>
                          <div className="text-slate-500 text-[10px] truncate">{l.resolve.finalRemarks}</div>
                        </div>
                      )}
                      {l.dispatch && (
                        <div>
                          <div className="font-semibold text-slate-800">{l.dispatch.teamName}</div>
                          <div className="text-slate-500 text-[10px]">{l.dispatch.suspectedModus}</div>
                        </div>
                      )}
                      {l.warning && (
                        <div>
                          <div className="font-semibold text-slate-800">Notice #{l.warning.noticeNumber}</div>
                          <div className="text-slate-500 text-[10px]">Recipient: {l.warning.recipient}</div>
                        </div>
                      )}
                      {l.dismiss && (
                        <div>
                          <div className="font-semibold text-slate-800">Exemption: {l.dismiss.reason}</div>
                          <div className="text-slate-500 text-[10px]">{l.dismiss.notes}</div>
                        </div>
                      )}
                    </td>

                    {/* Recovered Revenue */}
                    <td className="p-3 font-mono font-bold text-emerald-700">
                      {l.resolve?.recoveredRevenueINR ? `₹${l.resolve.recoveredRevenueINR.toLocaleString('en-IN')}` : '—'}
                    </td>

                    {/* Operator */}
                    <td className="p-3 text-[11px] text-slate-600">
                      {l.dispatch?.officerInCharge || l.operatorId}
                    </td>

                    {/* Timestamp */}
                    <td className="p-3 font-mono text-[11px] text-slate-500">{l.timestamp}</td>

                    {/* PDF Export */}
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDownloadPDF(l.consumerId)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 shadow-2xs"
                        title="Download forensic PDF"
                      >
                        <Download size={12} className="inline mr-1" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
