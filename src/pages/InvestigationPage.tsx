import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  CartesianGrid,
  BarChart,
  Bar,
  Cell
} from 'recharts'
import {
  ShieldAlert,
  Send,
  CheckCircle,
  UserCheck,
  Download,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Clock,
  History,
  Activity,
  Info
} from 'lucide-react'
import { api, MONTHS, estLoss, ALLC } from '../mock'
import type { Consumer, OperatorActionType, Risk, Priority } from '../types'
import { IncidentActionModal } from '../components/investigation/IncidentActionModal'
import { exportForensicPDF } from '../components/investigation/ForensicReportExport'
import { aiFeedback } from '../services/aiFeedbackStore'

export const InvestigationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [modalAction, setModalAction] = useState<OperatorActionType | null>(null)
  const [showPeerMedian, setShowPeerMedian] = useState(true)
  const [actionHistoryVersion, setActionHistoryVersion] = useState(0)

  const consumer = api.consumer(id || 'C-017', 'A')

  if (!consumer) {
    return (
      <div className="flex h-96 flex-col items-center justify-center text-slate-500">
        <p>Consumer not found</p>
        <button onClick={() => navigate('/simulator')} className="mt-2 text-sm text-blue-600 hover:underline">
          Return to 3D Grid Monitor
        </button>
      </div>
    )
  }

  const d = consumer.d
  const actionHistory = aiFeedback.getByConsumer(consumer.id)

  const chartData = MONTHS.map((m, i) => ({
    m,
    actual: consumer.hist[i],
    base: consumer.base,
    lo: Math.round(consumer.base * 0.85),
    band: Math.round(consumer.base * 0.3),
    peer: consumer.peer[i]
  }))

  return (
    <div className="space-y-4 font-sans">
      {/* Top Header & Action Controls (Light Theme) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/simulator')}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            <ArrowLeft size={14} /> Back to 3D Grid Map
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-slate-900">{consumer.id}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {consumer.cat}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-bold ${
                  d.risk === 'Critical'
                    ? 'bg-red-100 text-red-700 border border-red-200'
                    : d.risk === 'High'
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}
              >
                {d.risk} · Priority {d.priority}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Sanctioned Load: {consumer.load} kW · Tariff: ₹{consumer.tariff}/kWh · Feeder: {consumer.feeder} ·
              Transformer: <Link to="/grid" className="font-mono text-blue-600 hover:underline">{consumer.tr}</Link>
            </div>
          </div>
        </div>

        {/* 4 Core Action Buttons + Download Analysis */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setModalAction('DISMISS')}
            className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-sm transition"
          >
            <CheckCircle size={14} className="text-emerald-600" /> Dismiss Alert
          </button>
          <button
            onClick={() => setModalAction('SEND_WARNING')}
            className="flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 shadow-sm transition"
          >
            <Send size={14} className="text-blue-600" /> Send Warning Notice
          </button>
          <button
            onClick={() => setModalAction('DISPATCH_OFFICER')}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-sm transition"
          >
            <ShieldAlert size={14} /> Send Field Officer
          </button>
          <button
            onClick={() => setModalAction('RESOLVE')}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 shadow-sm transition"
          >
            <UserCheck size={14} /> Resolve Case
          </button>
          <button
            onClick={() => exportForensicPDF(consumer)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            <Download size={14} /> Download PDF Report
          </button>
        </div>
      </div>

      {/* 4 Direct Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Anomaly Score</div>
          <div className="mt-1 font-mono text-2xl font-bold text-red-600">{d.anomaly} / 100</div>
          <div className="text-[11px] text-slate-500">Confidence: {d.conf}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Classified Cause</div>
          <div className="mt-1 text-sm font-bold text-slate-800 truncate">{d.top}</div>
          <div className="text-[11px] text-slate-500">Based on consumption vs baseline</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Estimated Monthly Loss</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-800">
            ₹{estLoss(consumer).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500">Unmetered electricity diverted</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs text-slate-500 font-medium">Transformer Loss Gap</div>
          <div className="mt-1 font-mono text-2xl font-bold text-blue-600">{consumer.flags.trGap}%</div>
          <div className="text-[11px] text-slate-500">Unexplained energy on {consumer.tr}</div>
        </div>
      </div>

      {/* Main Analysis: Baseline Chart + Direct Why Flagged Explanation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Baseline vs Actual Chart (8 Cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Consumption Baseline Comparison (Past 12 Months)
              </h3>
              <p className="text-[11px] text-slate-500">
                Notice the sharp drop in the red line during recent months while peer median remained stable
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showPeerMedian}
                onChange={e => setShowPeerMedian(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Show Neighbors' Median
            </label>
          </div>

          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="m" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }}
                />
                <ReferenceArea
                  x1="Jul"
                  x2="Sep"
                  fill="#fee2e2"
                  fillOpacity={0.6}
                  label={{ value: 'THEFT SHORTFALL PERIOD', fill: '#dc2626', fontSize: 11 }}
                />
                <Area dataKey="lo" stackId="b" stroke="none" fill="transparent" />
                <Area dataKey="band" stackId="b" stroke="none" fill="#e0f2fe" fillOpacity={0.5} name="Expected Range" />
                <Line dataKey="base" stroke="#94a3b8" strokeDasharray="5 5" dot={false} name="Expected Baseline (kWh)" />
                {showPeerMedian && (
                  <Line dataKey="peer" stroke="#0284c7" dot={false} strokeWidth={1.5} name="Neighbor Median (kWh)" />
                )}
                <Line
                  dataKey="actual"
                  stroke="#dc2626"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#dc2626' }}
                  name="Actual Meter Reading"
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cause Probabilities (4 Cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
          <div className="border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Root-Cause Confidence</h3>
            <p className="text-[11px] text-slate-500">Likelihood breakdown of possible causes</p>
          </div>

          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.scores
                  .filter(s => ALLC.includes(s.cause))
                  .map(s => ({ n: s.cause, v: +(s.score * 100).toFixed(1) }))}
                layout="vertical"
              >
                <XAxis type="number" unit="%" stroke="#64748b" />
                <YAxis type="category" dataKey="n" width={140} tick={{ fontSize: 10, fill: '#334155' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a' }}
                />
                <Bar dataKey="v" fill="#2563eb">
                  {d.scores.map((s, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={s.cause === d.top ? (d.risk === 'Critical' ? '#dc2626' : '#d97706') : '#cbd5e1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Direct Plain-English Evidence & Action History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Why was this flagged? */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Why was this flagged? (Plain-English Evidence)
          </h3>
          <div className="mt-3 space-y-2">
            {d.evidence.map(ev => (
              <div
                key={ev.signal}
                className="flex items-start justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      ev.direction === 'supports'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {ev.direction === 'supports' ? 'SUPPORTS' : 'CONTRADICTS'}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-800">{ev.signal}</div>
                    <div className="text-slate-600 text-[11px]">{ev.text}</div>
                  </div>
                </div>
                <span className="font-mono text-slate-400">weight: {ev.weight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action History Trail & AI Retraining Log */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              <History className="text-purple-600" size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Action History & AI Retraining Feedback
              </h3>
            </div>
            <span className="text-[10px] text-slate-500">{actionHistory.length} actions</span>
          </div>

          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {actionHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No field actions taken yet for {consumer.id}. Click "Send Field Officer", "Send Warning", or "Dismiss" above to record action.
              </div>
            ) : (
              actionHistory.map(a => (
                <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-slate-500">{a.timestamp}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        a.action === 'DISPATCH_OFFICER'
                          ? 'bg-red-100 text-red-800'
                          : a.action === 'SEND_WARNING'
                          ? 'bg-blue-100 text-blue-800'
                          : a.action === 'RESOLVE'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {a.action}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {a.dispatch && `Work Order ${a.dispatch.workOrderId} · Squad: ${a.dispatch.teamName}`}
                    {a.warning && `Notice ${a.warning.noticeNumber} · Sent via ${a.warning.channel}`}
                    {a.dismiss && `Dismissed: ${a.dismiss.reason}`}
                    {a.resolve && `Resolved: ${a.resolve.outcome} (₹${a.resolve.recoveredRevenueINR.toLocaleString('en-IN')} recovered)`}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Officer: {a.operatorId}</span>
                    <span className="text-emerald-700 font-medium">✓ Logged to AI retraining store</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action Modal */}
      {modalAction && (
        <IncidentActionModal
          consumer={consumer}
          actionType={modalAction}
          isOpen={true}
          onClose={() => setModalAction(null)}
          onSuccess={() => setActionHistoryVersion(v => v + 1)}
        />
      )}
    </div>
  )
}
