import React, { useState, useEffect } from 'react'
import { aiFeedback } from '../../services/aiFeedbackStore'
import type { IncidentActionLog } from '../../types'
import { Database, Download, RotateCcw, ShieldCheck, AlertCircle, FileSpreadsheet, RefreshCw, CheckCircle2 } from 'lucide-react'

export const AIFeedbackDrawer: React.FC = () => {
  const [logs, setLogs] = useState<IncidentActionLog[]>(aiFeedback.getAll())
  const [stats, setStats] = useState(aiFeedback.getStats())

  useEffect(() => {
    const unsub = aiFeedback.subscribe(() => {
      setLogs([...aiFeedback.getAll()])
      setStats(aiFeedback.getStats())
    })
    return unsub
  }, [])

  const handleExportCSV = () => {
    const csvContent = aiFeedback.exportCSV()
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GRIDGUARD_AI_FEEDBACK_${new Date().toISOString().substring(0, 10)}.csv`
    a.click()
  }

  const handleExportJSON = () => {
    const jsonContent = aiFeedback.exportJSON()
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `GRIDGUARD_AI_FEEDBACK_${new Date().toISOString().substring(0, 10)}.json`
    a.click()
  }

  return (
    <div className="space-y-4 font-sans">
      {/* KPI Cards (Light Theme) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Feedback Logged</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-[11px] text-emerald-700 font-medium">Ready for retraining</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Model Precision</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-600">{stats.accuracy}%</div>
          <div className="text-[11px] text-slate-500">{stats.truePositives} verified true cases</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Field Squads Sent</div>
          <div className="mt-1 font-mono text-2xl font-bold text-red-600">{stats.dispatches}</div>
          <div className="text-[11px] text-slate-500">Work orders executed</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Revenue Recovered</div>
          <div className="mt-1 font-mono text-2xl font-bold text-purple-700">
            ₹{stats.totalRecoveredINR.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500">Penalties assessed</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">False Alarms Cleared</div>
          <div className="mt-1 font-mono text-2xl font-bold text-amber-600">{stats.falseAlarms}</div>
          <div className="text-[11px] text-slate-500">Solar / legitimate loads</div>
        </div>
      </div>

      {/* Control Banner & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600 border border-blue-100">
            <Database size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">How AI Learns From Operator Actions (Continuous Retraining)</h4>
            <p className="text-xs text-slate-500">
              When an engineer marks an alert as "False Alarm" (e.g. solar panels installed) or confirms physical theft, that verified ground-truth is logged below. This data is fed back into the AI models so they continuously improve.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" /> Export CSV Dataset
          </button>
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <Download size={14} className="text-blue-600" /> Export JSON
          </button>
          <button
            onClick={() => aiFeedback.reset()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm"
            title="Reset to default seed data"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Feedback Records Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
            <tr>
              <th className="p-3">Log ID</th>
              <th className="p-3">Timestamp</th>
              <th className="p-3">Consumer</th>
              <th className="p-3">Action Taken</th>
              <th className="p-3">Model Score</th>
              <th className="p-3">Predicted Cause</th>
              <th className="p-3">Verified Ground Truth</th>
              <th className="p-3">Validation Result</th>
              <th className="p-3">Auditor / Squad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50/70">
                <td className="p-3 font-mono font-bold text-slate-500">{l.id}</td>
                <td className="p-3 font-mono text-slate-500">{l.timestamp}</td>
                <td className="p-3 font-mono font-bold text-blue-600">{l.consumerId}</td>
                <td className="p-3">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${
                      l.action === 'DISPATCH_OFFICER'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : l.action === 'SEND_WARNING'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : l.action === 'RESOLVE'
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {l.action}
                  </span>
                </td>
                <td className="p-3 font-mono font-semibold">{l.feedbackForAI.originalScore}/100</td>
                <td className="p-3">{l.feedbackForAI.originalCause}</td>
                <td className="p-3 font-bold text-slate-900">{l.feedbackForAI.verifiedGroundTruth}</td>
                <td className="p-3">
                  {l.feedbackForAI.isTruePositive ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <ShieldCheck size={14} className="text-emerald-600" /> TRUE POSITIVE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                      <AlertCircle size={14} className="text-amber-600" /> FALSE ALARM (EXEMPT)
                    </span>
                  )}
                </td>
                <td className="p-3 text-slate-600">{l.operatorId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
