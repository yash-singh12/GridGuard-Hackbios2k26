import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Grid3DScene } from '../3d/Grid3DScene'
import { RealDataBridgeModal } from '../realdata/RealDataBridgeModal'
import { useSim, sim, SCEN, SIM_IDS, type Sc } from '../../sim'
import { WORLD, estLoss } from '../../mock'
import type { Consumer } from '../../types'
import {
  Play,
  RotateCcw,
  Zap,
  Radio,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Activity,
  Sparkles,
  Info,
  CheckCircle2
} from 'lucide-react'

export const DigitalTwinLab: React.FC = () => {
  const navigate = useNavigate()
  const s = useSim()
  const [selectedConsumerId, setSelectedConsumerId] = useState<string>('C-017')
  const [selectedTransformerId, setSelectedTransformerId] = useState<string | null>(null)
  const [scenario, setScenario] = useState<Sc>('Theft/Tampering')
  const [isRealDataModalOpen, setIsRealDataModalOpen] = useState(false)
  const [demoStep, setDemoStep] = useState<number | null>(null)

  useEffect(() => {
    sim.start()
  }, [])

  const currentConsumer = WORLD.A.cons.find(c => c.id === selectedConsumerId) || WORLD.A.cons[0]
  const consumerReadings = s.readings.filter(r => r.id === selectedConsumerId)
  const latestReading = consumerReadings.length ? consumerReadings[consumerReadings.length - 1] : null

  const totalPowerKW = (s.readings.slice(-SIM_IDS.length).reduce((sum, r) => sum + (r.p || 0), 0) + 120).toFixed(1)
  const criticalAlertsCount = s.alerts.filter(a => a.risk === 'Critical' || a.priority === 'P1').length

  const handleInject = () => {
    sim.inject(selectedConsumerId, scenario)
  }

  // ⚡ Run Complete Multi-Case Demo
  const handleRunCompleteDemo = () => {
    setDemoStep(1)
    sim.reset()
    sim.start()

    setTimeout(() => {
      setDemoStep(2)
      setSelectedConsumerId('C-017')
      setScenario('Theft/Tampering')
      sim.inject('C-017', 'Theft/Tampering')
    }, 2500)

    setTimeout(() => {
      setDemoStep(3)
      setSelectedConsumerId('C-031')
      setScenario('Meter Malfunction')
      sim.inject('C-031', 'Meter Malfunction')
    }, 6000)

    setTimeout(() => {
      setDemoStep(4)
      setSelectedConsumerId('C-009')
      setScenario('Communication Failure')
      sim.inject('C-009', 'Communication Failure')
    }, 9500)

    setTimeout(() => {
      setDemoStep(5)
    }, 13000)
  }

  return (
    <div className="flex h-[calc(100vh-100px)] flex-col gap-3 font-sans">
      {/* Top Simple Utility Header (Light Theme) */}
      <div className="flex flex-wrap items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Grid Status: Live & Normal
            </span>
          </div>
          <span className="text-xs text-slate-500">| Frequency: 50.0 Hz</span>
          <span className="text-xs text-slate-500">| Feeder: F-01 (11kV)</span>
        </div>

        {/* Live Grid Metrics */}
        <div className="flex items-center gap-5 text-xs">
          <div className="hidden sm:block">
            <span className="text-slate-500">Total Power: </span>
            <span className="font-mono font-bold text-slate-800">{totalPowerKW} kW</span>
          </div>
          <div>
            <span className="text-slate-500">Active Meters: </span>
            <span className="font-mono font-bold text-blue-600">48 Online</span>
          </div>
          <div>
            <span className="text-slate-500">Theft Alerts: </span>
            <span className="font-mono font-bold text-red-600">{criticalAlertsCount}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunCompleteDemo}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Sparkles size={14} /> ⚡ Run Auto Demo
          </button>
          <button
            onClick={() => setIsRealDataModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            <Radio size={14} className="text-blue-600" /> Real Hardware & Datasets
          </button>
          <button
            onClick={() => {
              setDemoStep(null)
              sim.reset()
              sim.start()
            }}
            className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 shadow-sm transition"
            title="Reset Grid to Normal"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Demo Notification Banner */}
      {demoStep !== null && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-700">DEMO STEP {demoStep} OF 5:</span>
            <span>
              {demoStep === 1 && 'Showing normal steady-state power grid...'}
              {demoStep === 2 && 'Customer C-017 injected with Electricity Theft (75% power drop). Notice red alert beacon.'}
              {demoStep === 3 && 'Customer C-031 injected with Meter Malfunction (transducer voltage drops). Notice amber fault.'}
              {demoStep === 4 && 'Customer C-009 injected with Communication Failure (meter drops offline).'}
              {demoStep === 5 && 'Demo complete! All 3 different grid issues were correctly diagnosed by the system.'}
            </span>
          </div>
          <button onClick={() => setDemoStep(null)} className="text-xs font-semibold text-blue-700 hover:underline">
            Close
          </button>
        </div>
      )}

      {/* Main Grid: 3D Visualization + Right Operations Panel */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-12">
        {/* 3D WebGL Canvas */}
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-8">
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

        {/* Right Operations Panel (Direct & Simple to Explain) */}
        <div className="flex flex-col gap-3 overflow-y-auto lg:col-span-4">
          {/* 1. Simple Scenario Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                1. Test a Grid Scenario
              </h3>
              <p className="text-[11px] text-slate-500">Pick any house and test how GridGuard responds</p>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Target Consumer</label>
                <select
                  value={selectedConsumerId}
                  onChange={e => setSelectedConsumerId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none"
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
                <label className="block text-xs font-semibold text-slate-700">Choose What Happens</label>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {SCEN.map(sc => (
                    <button
                      key={sc}
                      onClick={() => setScenario(sc)}
                      className={`rounded-md border p-2 text-left text-xs transition ${
                        scenario === sc
                          ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                  title="Reset to Normal"
                >
                  Normal
                </button>
              </div>
            </div>
          </div>

          {/* 2. Live Status & Direct Plain-English Diagnosis */}
          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                2. Live Telemetry & Result
              </h3>
              <span className="font-mono font-bold text-blue-600">{selectedConsumerId}</span>
            </div>

            {/* Simple Telemetry Numbers */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] text-slate-500">Voltage</div>
                <div className="mt-1 font-mono font-bold text-slate-800">
                  {latestReading?.v ? `${latestReading.v.toFixed(1)} V` : '—'}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] text-slate-500">Current</div>
                <div className="mt-1 font-mono font-bold text-slate-800">
                  {latestReading?.i ? `${latestReading.i.toFixed(2)} A` : '—'}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="text-[10px] text-slate-500">Power</div>
                <div className="mt-1 font-mono font-bold text-blue-600">
                  {latestReading?.p ? `${latestReading.p.toFixed(3)} kW` : '—'}
                </div>
              </div>
            </div>

            {/* Plain English Diagnosis Box */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Classification:</span>
                <span
                  className={`font-bold ${
                    currentConsumer.d.top === 'Probable theft/tampering'
                      ? 'text-red-600'
                      : currentConsumer.d.top === 'Normal consumption'
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}
                >
                  {currentConsumer.d.top}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Anomaly Score:</span>
                <span className="font-mono font-bold text-slate-800">
                  {currentConsumer.d.anomaly} / 100
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Estimated Revenue Loss:</span>
                <span className="font-mono font-bold text-red-600">
                  ₹{estLoss(currentConsumer).toLocaleString('en-IN')} / month
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Why flagged: </span>
                {currentConsumer.d.top === 'Probable theft/tampering'
                  ? 'Meter reading dropped 75% while transformer input remained loaded. This energy shortfall points to meter bypass.'
                  : currentConsumer.d.top === 'Meter malfunction'
                  ? 'Voltage flatlined at 118V with erratic current reading, indicating hardware CT coil failure.'
                  : currentConsumer.d.top === 'Communication failure'
                  ? 'Meter dropped offline. Missing data packets indicate cellular network failure, not power theft.'
                  : 'Power consumption is normal and within expected baseline limits.'}
              </div>
            </div>

            {/* Deep Investigation Button */}
            <button
              onClick={() => navigate(`/consumers/${selectedConsumerId}`)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-800 py-2.5 text-xs font-bold text-white hover:bg-slate-700 transition"
            >
              Open Investigation & Take Action <ArrowRight size={14} />
            </button>
          </div>

          {/* 3. Live Alert Feed */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="text-red-600" size={15} />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">Recent Alerts</h4>
              </div>
              <span className="text-[10px] text-slate-500">{s.alerts.length} total</span>
            </div>

            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
              {s.alerts.slice(0, 4).map(a => (
                <div
                  key={a.id}
                  onClick={() => setSelectedConsumerId(a.consumer)}
                  className="flex cursor-pointer items-center justify-between rounded border border-slate-100 bg-slate-50 p-2 text-xs hover:border-slate-300 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">{a.time}</span>
                    <span className="font-mono font-bold text-blue-600">{a.consumer}</span>
                    <span className="text-slate-700 truncate max-w-[130px]">{a.cause}</span>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                      a.priority === 'P1' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {a.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Real Data Bridge Modal */}
      <RealDataBridgeModal isOpen={isRealDataModalOpen} onClose={() => setIsRealDataModalOpen(false)} />
    </div>
  )
}
