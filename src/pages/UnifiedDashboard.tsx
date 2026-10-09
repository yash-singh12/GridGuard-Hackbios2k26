import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3DScene } from '../components/3d/Grid3DScene'
import { RealDataBridgeModal } from '../components/realdata/RealDataBridgeModal'
import { IncidentActionModal } from '../components/investigation/IncidentActionModal'
import { exportForensicPDF } from '../components/investigation/ForensicReportExport'
import { useSim, sim, SCEN, SIM_IDS, type Sc } from '../sim'
import { WORLD, estLoss } from '../mock'
import type { Consumer, OperatorActionType } from '../types'
import {
  Sparkles,
  Zap,
  Radio,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  Send,
  CheckCircle,
  UserCheck,
  Download,
  AlertTriangle,
  Layers,
  Activity,
  Cpu
} from 'lucide-react'
import { predictRealML, checkMLBackendHealth, type MLPredictResponse } from '../services/realMlClient'
import { investigationStore } from '../services/investigationCaseStore'

export const UnifiedDashboard: React.FC = () => {
  const navigate = useNavigate()
  const s = useSim()
  const [selectedConsumerId, setSelectedConsumerId] = useState<string>('C-017')
  const [selectedTransformerId, setSelectedTransformerId] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Sc>('Theft/Tampering')
  const [isRealDataModalOpen, setIsRealDataModalOpen] = useState(false)
  const [modalAction, setModalAction] = useState<OperatorActionType | null>(null)
  const [demoStep, setDemoStep] = useState<number | null>(null)
  const [backendOnline, setBackendOnline] = useState<boolean>(false)
  const [realMLResult, setRealMLResult] = useState<MLPredictResponse | null>(null)

  useEffect(() => {
    sim.start()
    checkMLBackendHealth().then(setBackendOnline)
    const interval = setInterval(() => {
      checkMLBackendHealth().then(setBackendOnline)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const currentConsumer = WORLD.A.cons.find(c => c.id === selectedConsumerId) || WORLD.A.cons[0]
  const consumerReadings = s.readings.filter(r => r.id === selectedConsumerId)
  const latestReading = consumerReadings.length ? consumerReadings[consumerReadings.length - 1] : null

  // Fetch Real ML Predictions whenever consumer or readings update
  useEffect(() => {
    let isCancelled = false
    const fetchPrediction = async () => {
      const v = latestReading?.v || 230.0
      const i = latestReading?.i || 4.2
      const p = latestReading?.p || 0.96
      const kwh = currentConsumer.actual ?? currentConsumer.base ?? 0.15

      const res = await predictRealML({
        kwh_recorded: kwh,
        voltage: v,
        current: i,
        power_kw: p,
        peer_group_avg: currentConsumer.base || 1.4,
        rolling_7d_avg: currentConsumer.base ? currentConsumer.base * 0.95 : 1.35,
        meter_status: currentConsumer.flags?.meter ? 'FAULT' : 'OK',
        comm_status: currentConsumer.flags?.comm ? 'LOST' : 'OK',
      })
      if (!isCancelled && res) {
        setRealMLResult(res)
      }
    }
    fetchPrediction()
    return () => {
      isCancelled = true
    }
  }, [selectedConsumerId, latestReading?.p, latestReading?.v, latestReading?.i, currentConsumer.actual, currentConsumer.base, scenario])

  const totalPowerKW = (s.readings.slice(-SIM_IDS.length).reduce((sum, r) => sum + (r.p || 0), 0) + 120).toFixed(1)
  const criticalAlertsCount = s.alerts.filter(a => a.risk === 'Critical' || a.priority === 'P1').length
  const totalLossINR = WORLD.A.cons.reduce((sum, c) => sum + estLoss(c), 0)

  const handleInject = () => {
    sim.inject(selectedConsumerId, scenario)
  }

  // ⚡ Auto Demo Runner with smooth camera transitions and clear visual timing
  const handleRunCompleteDemo = () => {
    setDemoStep(1)
    sim.reset()
    sim.start()
    setSelectedConsumerId('C-002')

    setTimeout(() => {
      setDemoStep(2)
      setSelectedConsumerId('C-017')
      setScenario('Theft/Tampering')
      sim.inject('C-017', 'Theft/Tampering')
    }, 3000)

    setTimeout(() => {
      setDemoStep(3)
      setSelectedConsumerId('C-031')
      setScenario('Meter Malfunction')
      sim.inject('C-031', 'Meter Malfunction')
    }, 8500)

    setTimeout(() => {
      setDemoStep(4)
      setSelectedConsumerId('C-009')
      setScenario('Communication Failure')
      sim.inject('C-009', 'Communication Failure')
    }, 14000)

    setTimeout(() => {
      setDemoStep(5)
    }, 19000)
  }

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Top Clean KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Live Grid Power</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-900">{totalPowerKW} kW</div>
          <div className="text-[11px] text-emerald-700 font-medium">● 50.0 Hz Synchronized</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Smart Meters Monitored</div>
          <div className="mt-1 font-mono text-2xl font-bold text-blue-600">48 Online</div>
          <div className="text-[11px] text-slate-500">4 Distribution Transformers</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Theft & Tamper Alerts</div>
          <div className="mt-1 font-mono text-2xl font-bold text-red-600">{criticalAlertsCount} Critical</div>
          <div className="text-[11px] text-slate-500">{s.alerts.length} total warnings</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">ML Backend Engine</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              backendOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              <Cpu size={11} /> {backendOnline ? 'LIVE PYTHON' : 'CLIENT SIM'}
            </span>
          </div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900">
            {backendOnline ? 'LightGBM + IsoForest' : 'Deterministic Sim'}
          </div>
          <div className="text-[11px] text-slate-500">
            {backendOnline ? 'Serving lgbm_model.pkl (:8000)' : 'Client-side fallback active'}
          </div>
        </div>
      </div>

      {/* Demo Notification Banner (if active) */}
      {demoStep !== null && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-900 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-700">DEMO STEP {demoStep} OF 5:</span>
            <span>
              {demoStep === 1 && 'Displaying baseline grid power (normal steady-state)...'}
              {demoStep === 2 && 'Injected Electricity Theft on C-017 (75% power drop). Watch red warning pillar.'}
              {demoStep === 3 && 'Injected Meter Malfunction on C-031 (Voltage dropped to 118V). Watch amber fault.'}
              {demoStep === 4 && 'Injected Communication Failure on C-009 (Meter offline). Network loss diagnosed.'}
              {demoStep === 5 && 'Demo complete! All 3 grid events correctly classified.'}
            </span>
          </div>
          <button onClick={() => setDemoStep(null)} className="text-xs font-semibold text-blue-700 hover:underline">
            Close
          </button>
        </div>
      )}

      {/* 2. Hero: 3D Grid Digital Twin Viewport */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Live 3D Power Grid Map (Substation $\to$ Transformers $\to$ Meters)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunCompleteDemo}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <Sparkles size={13} /> ⚡ Run Auto Demo
            </button>
            <button
              onClick={() => setIsRealDataModalOpen(true)}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Radio size={13} className="text-blue-600" /> IoT & Datasets
            </button>
            <button
              onClick={() => {
                setDemoStep(null)
                sim.reset()
                sim.start()
              }}
              className="rounded-md border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-50 shadow-sm"
              title="Reset Grid"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* 3D Scene Viewport */}
        <div className="h-[460px] w-full">
          <Grid3DScene
            consumers={WORLD.A.cons}
            readings={s.readings}
            alerts={s.alerts}
            transformers={WORLD.A.tr}
            selectedConsumerId={selectedConsumerId}
            selectedTransformerId={selectedTransformerId}
            onSelectConsumer={id => setSelectedConsumerId(id)}
            onSelectTransformer={id => setSelectedTransformerId(id)}
          />
        </div>
      </div>

      {/* 3. Operational Controls (Clean 2 Columns: Scenario Tester + Target Telemetry & Actions) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Test Scenarios (5 Cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-5">
          <div className="border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Test Grid Scenarios
            </h3>
            <p className="text-[11px] text-slate-500">Pick any house and test how the system reacts</p>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Consumer Meter</label>
              <select
                value={selectedConsumerId}
                onChange={e => setSelectedConsumerId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
              >
                {SIM_IDS.map(id => {
                  const c = WORLD.A.cons.find(x => x.id === id)
                  return (
                    <option key={id} value={id}>
                      {id} ({c?.cat} · {c?.tr})
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Select Condition to Inject</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SCEN.map(sc => (
                  <button
                    key={sc}
                    onClick={() => setScenario(sc)}
                    className={`rounded-md border p-2 text-left text-xs transition ${
                      scenario === sc
                        ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="truncate">{sc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleInject}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <Zap size={14} /> Inject {scenario} on {selectedConsumerId}
              </button>
              <button
                onClick={() => sim.inject(selectedConsumerId, 'Normal Consumption')}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                Normal
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Telemetry, Plain-English Diagnosis, and Actions (7 Cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Live Telemetry & Instant Actions
              </h3>
              <p className="text-[11px] text-slate-500">Target Consumer: <span className="font-mono font-bold text-blue-600">{selectedConsumerId}</span></p>
            </div>
            <button
              onClick={() => exportForensicPDF(currentConsumer)}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Download size={13} /> Download PDF
            </button>
          </div>

          {/* Telemetry Numbers */}
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Voltage</div>
              <div className="mt-0.5 font-mono font-bold text-slate-800">
                {latestReading?.v ? `${latestReading.v.toFixed(1)} V` : '230.0 V'}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Current</div>
              <div className="mt-0.5 font-mono font-bold text-slate-800">
                {latestReading?.i ? `${latestReading.i.toFixed(2)} A` : '4.20 A'}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Power</div>
              <div className="mt-0.5 font-mono font-bold text-blue-600">
                {latestReading?.p ? `${latestReading.p.toFixed(3)} kW` : '0.96 kW'}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[10px] text-slate-500">Loss / Month</div>
              <div className="mt-0.5 font-mono font-bold text-red-600">
                ₹{estLoss(currentConsumer).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Plain-English Explanation with Live ML Engine integration */}
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Cpu size={13} className="text-blue-600" />
                ML Diagnosis:
              </span>
              <div className="flex items-center gap-2">
                {realMLResult && (
                  <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[10px] font-bold">
                    {realMLResult.priority}
                  </span>
                )}
                <span
                  className={`font-bold ${
                    (realMLResult?.event_label || currentConsumer.d.top).includes('Theft')
                      ? 'text-red-600'
                      : (realMLResult?.event_label || currentConsumer.d.top).includes('Normal')
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {realMLResult?.event_label || currentConsumer.d.top} (Score: {realMLResult ? realMLResult.risk_score : currentConsumer.d.anomaly}/100)
                </span>
              </div>
            </div>

            {/* Model Probabilities Bar if real ML is responding */}
            {realMLResult && (
              <div className="rounded bg-white p-2 border border-slate-200 text-[11px] space-y-1">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex justify-between">
                  <span>LightGBM Class Probabilities</span>
                  <span className="text-blue-600 font-mono">IsoForest: {realMLResult.isolation_forest.is_anomaly ? 'ANOMALY DETECTED' : 'NORMAL'}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
                  <div className={`p-1 rounded ${realMLResult.event_label === 'Normal' ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-300' : 'bg-slate-50 text-slate-600'}`}>
                    Norm: {(realMLResult.probabilities['Normal'] * 100).toFixed(0)}%
                  </div>
                  <div className={`p-1 rounded ${realMLResult.event_label === 'Theft' ? 'bg-red-50 text-red-700 font-bold border border-red-300' : 'bg-slate-50 text-slate-600'}`}>
                    Theft: {(realMLResult.probabilities['Theft'] * 100).toFixed(0)}%
                  </div>
                  <div className={`p-1 rounded ${realMLResult.event_label === 'Meter Fault' ? 'bg-amber-50 text-amber-700 font-bold border border-amber-300' : 'bg-slate-50 text-slate-600'}`}>
                    Fault: {(realMLResult.probabilities['Meter Fault'] * 100).toFixed(0)}%
                  </div>
                  <div className={`p-1 rounded ${realMLResult.event_label === 'Comms Failure' ? 'bg-blue-50 text-blue-700 font-bold border border-blue-300' : 'bg-slate-50 text-slate-600'}`}>
                    Comms: {(realMLResult.probabilities['Comms Failure'] * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            )}

            <div className="text-slate-600 text-[11px] pt-0.5">
              <span className="font-medium text-slate-800">Why flagged: </span>
              {(realMLResult?.event_label || currentConsumer.d.top).includes('Theft')
                ? 'Power consumption dropped below expected demand while transformer line input remained loaded. Indicates electricity bypass.'
                : (realMLResult?.event_label || currentConsumer.d.top).includes('Meter Fault')
                ? 'Voltage flatlined with erratic current reading, indicating hardware sensor failure or tamper trigger.'
                : (realMLResult?.event_label || currentConsumer.d.top).includes('Comms Failure')
                ? 'Meter dropped offline. Missing data packets indicate cellular network failure, not power theft.'
                : 'Power consumption is normal and within expected baseline limits.'}
            </div>
          </div>

          {/* 4 Action Buttons */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => setModalAction('DISMISS')}
              className="flex items-center justify-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 shadow-sm transition"
            >
              <CheckCircle size={13} className="text-emerald-600" /> Dismiss Alert
            </button>
            <button
              onClick={() => setModalAction('SEND_WARNING')}
              className="flex items-center justify-center gap-1 rounded-md border border-blue-300 bg-blue-50 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 shadow-sm transition"
            >
              <Send size={13} className="text-blue-600" /> Send Warning
            </button>
            <button
              onClick={() => setModalAction('DISPATCH_OFFICER')}
              className="flex items-center justify-center gap-1 rounded-md bg-red-600 py-1.5 text-xs font-bold text-white hover:bg-red-700 shadow-sm transition"
            >
              <ShieldAlert size={13} /> Send Officer
            </button>
            <button
              onClick={() => setModalAction('RESOLVE')}
              className="flex items-center justify-center gap-1 rounded-md bg-purple-600 py-1.5 text-xs font-bold text-white hover:bg-purple-700 shadow-sm transition"
            >
              <UserCheck size={13} /> Resolve Case
            </button>
          </div>
        </div>
      </div>

      {/* 4. Active Grid Alerts & Priority Queue Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Active Alerts & Inspection Queue
          </h3>
          <span className="text-xs text-slate-500">Sorted by priority (P1 = highest emergency)</span>
        </div>

        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="p-2.5">Priority</th>
                <th className="p-2.5">Consumer</th>
                <th className="p-2.5">Category</th>
                <th className="p-2.5">Transformer</th>
                <th className="p-2.5">Diagnosed Cause</th>
                <th className="p-2.5">Score</th>
                <th className="p-2.5">Est. Monthly Loss</th>
                <th className="p-2.5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {WORLD.A.cons
                .filter(c => c.d.top !== 'Normal consumption')
                .sort((a, b) => a.d.priority.localeCompare(b.d.priority) || b.d.anomaly - a.d.anomaly)
                .map(c => (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedConsumerId(c.id)}
                    className="cursor-pointer hover:bg-slate-50 transition"
                  >
                    <td className="p-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          c.d.priority === 'P1'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {c.d.priority}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono font-bold text-blue-600">{c.id}</td>
                    <td className="p-2.5">{c.cat}</td>
                    <td className="p-2.5 font-mono">{c.tr}</td>
                    <td className="p-2.5 font-semibold text-slate-800">{c.d.top}</td>
                    <td className="p-2.5 font-mono">{c.d.anomaly}/100</td>
                    <td className="p-2.5 font-mono text-slate-900 font-medium">
                      ₹{estLoss(c).toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          investigationStore.addFromAlert({
                            id: `AL-${c.id}`,
                            time: new Date().toLocaleTimeString('en-GB'),
                            consumer: c.id,
                            tr: c.tr,
                            event: `Anomaly: ${c.d.top}`,
                            risk: c.d.risk,
                            cause: c.d.top,
                            conf: c.d.conf,
                            score: c.d.anomaly,
                            priority: c.d.priority,
                            status: 'New'
                          })
                          navigate('/investigations')
                        }}
                        className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-semibold hover:bg-blue-100 flex items-center gap-1 transition"
                      >
                        Investigate <ArrowRight size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real Data Bridge Modal */}
      <RealDataBridgeModal isOpen={isRealDataModalOpen} onClose={() => setIsRealDataModalOpen(false)} />

      {/* Incident Action Modal */}
      {modalAction && (
        <IncidentActionModal
          consumer={currentConsumer}
          actionType={modalAction}
          isOpen={true}
          onClose={() => setModalAction(null)}
          onSuccess={() => {}}
        />
      )}
    </div>
  )
}
