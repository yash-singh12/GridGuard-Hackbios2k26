import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import { Routes, Route, NavLink, Link, useNavigate, useParams, Navigate } from 'react-router-dom'
import {
  Download,
  Search,
  Box,
  Activity,
  Database,
  Layers,
  ShieldAlert,
  FileText,
  Radio,
  Sparkles,
  UserCheck,
  History
} from 'lucide-react'
import type { Consumer, Risk, Priority, Cause } from './types'
import { api, MONTHS, TRS, WORLD, estLoss, ALLC } from './mock'
import { useSim } from './sim'
import { UnifiedDashboard } from './pages/UnifiedDashboard'
import { InvestigationPage } from './pages/InvestigationPage'
import { InvestigationQueuePage } from './pages/InvestigationQueuePage'
import { HistoryPage } from './pages/HistoryPage'
import { AIFeedbackDrawer } from './components/investigation/AIFeedbackDrawer'
import { exportForensicPDF } from './components/investigation/ForensicReportExport'
import { investigationStore } from './services/investigationCaseStore'
import { aiFeedback } from './services/aiFeedbackStore'
import { isLocalStorageAvailable } from './services/storage'
import { filterAlerts, shouldShowInAlertsFeed } from './services/workflow'
import { sim } from './sim'

const TONE: Record<string, string> = {
  Normal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Watch: 'bg-amber-50 text-amber-700 border-amber-200',
  Medium: 'bg-orange-50 text-orange-700 border-orange-200',
  High: 'bg-red-50 text-red-700 border-red-200',
  Critical: 'bg-red-600 text-white border-red-600'
}

const Badge = ({ c, children }: { c?: string; children: ReactNode }) => (
  <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${c ?? 'bg-slate-100 text-slate-700 border-slate-200'}`}>
    {children}
  </span>
)
const RiskB = ({ r }: { r: Risk }) => <Badge c={TONE[r]}>{r}</Badge>
const PriB = ({ p }: { p: Priority }) => (
  <Badge c={p === 'P1' ? TONE.Critical : p === 'P2' ? TONE.Medium : p === 'P3' ? TONE.Watch : undefined}>
    {p}
  </Badge>
)
const Card = ({ t, children, right }: { t: string; children: ReactNode; right?: ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">{t}</h3>
      {right}
    </div>
    {children}
  </section>
)
const Btn = ({ onClick, children, p }: { onClick?: () => void; children: ReactNode; p?: boolean }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
      p ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
)
const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs text-slate-700">{children}</table>
  </div>
)
const rup = (n: number) => '₹' + n.toLocaleString('en-IN')

const F = createContext<{ f: { risk: string; tr: string; cause: string }; set: (k: string, v: string) => void }>(null!)
function useFiltered() {
  const { f } = useContext(F)
  return WORLD.A.cons.filter(
    c => (!f.risk || c.d.risk === f.risk) && (!f.tr || c.tr === f.tr) && (!f.cause || c.d.top === f.cause)
  )
}

function LossTable() {
  return (
    <Table>
      <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
        <tr>
          {['Node', 'Input kWh', 'Consumer kWh', 'Technical Loss (3.2%)', 'Unexplained Gap', 'Comms Gap', 'Loss %'].map(h => (
            <th key={h} className="p-2.5">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 font-mono">
        {[WORLD.A.feeder, ...WORLD.A.tr].map(t => (
          <tr key={t.id} className="hover:bg-slate-50">
            <td className="p-2.5 font-bold text-blue-700">{t.id}</td>
            <td className="p-2.5">{t.input.toLocaleString()}</td>
            <td className="p-2.5">{t.consumer.toLocaleString()}</td>
            <td className="p-2.5">{t.tech.toLocaleString()}</td>
            <td className="p-2.5 font-bold text-red-600">{t.unexpl.toLocaleString()}</td>
            <td className="p-2.5 text-slate-500">{t.gap.toLocaleString()}</td>
            <td className="p-2.5">{t.lossPct}%</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

const Grid = () => (
  <div className="space-y-4 font-sans">
    <Card t="Transformer Energy Accounting (Kirchhoff Loss Audit)">
      <LossTable />
      <p className="mt-3 text-xs text-slate-500">
        Energy Balance Verification: Unexplained energy loss is distinguished mathematically from communication dropouts and technical line loss ($I^2R$).
      </p>
    </Card>
    <Card t="Flagged Consumers by Transformer">
      {WORLD.A.tr.map(t => (
        <div key={t.id} className="mb-2 text-xs">
          <b className="font-mono text-blue-700 mr-2">{t.id}:</b>
          {WORLD.A.cons
            .filter(c => c.tr === t.id && c.d.top !== 'Normal consumption' && shouldShowInAlertsFeed(c.id))
            .map(c => (
              <Link key={c.id} className="font-mono mr-2 text-blue-600 hover:underline" to={'/consumers/' + c.id}>
                {c.id} ({c.d.top})
              </Link>
            ))}
        </div>
      ))}
    </Card>
  </div>
)

function Consumers() {
  const cs = useFiltered()
  const [q, setQ] = useState('')
  const [pg, setPg] = useState(0)
  const nav = useNavigate()
  const l = cs.filter(c => c.id.toLowerCase().includes(q.toLowerCase()))
  const rows = l.slice(pg * 12, pg * 12 + 12)

  return (
    <Card
      t={`Smart Meter Registry (${l.length} Meters)`}
      right={
        <div className="flex gap-2">
          <input
            placeholder="Search Meter ID..."
            value={q}
            onChange={e => {
              setQ(e.target.value)
              setPg(0)
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs text-slate-800 shadow-sm focus:outline-none"
          />
        </div>
      }
    >
      <Table>
        <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
          <tr>
            {['Consumer', 'Category', 'Load kW', 'Tariff', 'Transformer', 'Actual kWh', 'Baseline', 'Dev %', 'Score', 'Risk', 'Cause'].map(h => (
              <th key={h} className="p-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(c => (
            <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav('/consumers/' + c.id)}>
              <td className="p-2.5 font-mono font-bold text-blue-600">{c.id}</td>
              <td className="p-2.5">{c.cat}</td>
              <td className="p-2.5 font-mono">{c.load}</td>
              <td className="p-2.5 font-mono">₹{c.tariff}</td>
              <td className="p-2.5 font-mono">{c.tr}</td>
              <td className="p-2.5 font-mono">{c.actual ?? 'Offline'}</td>
              <td className="p-2.5 font-mono">{c.base}</td>
              <td className="p-2.5 font-mono">{c.dev}%</td>
              <td className="p-2.5 font-mono font-bold">{c.d.anomaly}</td>
              <td className="p-2.5"><RiskB r={c.d.risk} /></td>
              <td className="p-2.5 font-medium">{c.d.top}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div>Page {pg + 1} of {Math.ceil(l.length / 12)}</div>
        <div className="flex gap-2">
          <Btn onClick={() => setPg(Math.max(0, pg - 1))}>Previous</Btn>
          <Btn onClick={() => setPg(Math.min(Math.ceil(l.length / 12) - 1, pg + 1))}>Next</Btn>
        </div>
      </div>
    </Card>
  )
}

function Alerts() {
  const { alerts } = useSim()
  const nav = useNavigate()
  // Re-render instantly when investigation / history stores change so the
  // investigated item leaves this feed without a manual refresh.
  const [, setTick] = useState(0)
  useEffect(() => {
    const u1 = investigationStore.subscribe(() => setTick(t => t + 1))
    const u2 = aiFeedback.subscribe(() => setTick(t => t + 1))
    return () => {
      u1()
      u2()
    }
  }, [])
  const visible = filterAlerts(alerts)
  return (
    <Card t={`Active Alerts Feed (${visible.length})`}>
      {visible.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500">
          <p>
            No pending alerts — investigated items move to Active Investigations, resolved ones to Incident History.
            To generate new live alerts, inject a scenario from the Live Grid Dashboard.
          </p>
          <button
            onClick={() => {
              sim.reset()
              sim.start()
              investigationStore.resetToSeed()
              aiFeedback.reset()
            }}
            className="mt-3 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 shadow-xs"
          >
            Reset demo data (restore sample alerts)
          </button>
        </div>
      ) : (
      <Table>
        <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
          <tr>
            {['Time', 'Consumer', 'Transformer', 'Event', 'Risk', 'Cause', 'Score', 'Priority', 'Action'].map(h => (
              <th key={h} className="p-2.5">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visible.map(a => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="p-2.5 font-mono text-slate-500">{a.time}</td>
              <td className="p-2.5 font-mono font-bold text-blue-600">{a.consumer}</td>
              <td className="p-2.5 font-mono">{a.tr}</td>
              <td className="p-2.5">{a.event}</td>
              <td className="p-2.5"><RiskB r={a.risk} /></td>
              <td className="p-2.5 font-semibold text-slate-800">{a.cause}</td>
              <td className="p-2.5 font-mono">{a.score}</td>
              <td className="p-2.5"><PriB p={a.priority} /></td>
              <td className="p-2.5">
                <Btn
                  p
                  onClick={() => {
                    investigationStore.addFromAlert(a)
                    sim.moveToInvestigation(a.consumer)
                    nav('/investigations')
                  }}
                >
                  Investigate →
                </Btn>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      )}
    </Card>
  )
}

export default function App() {
  const [f, setF] = useState({ risk: '', tr: '', cause: '' })
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const sim_ = useSim()
  // If the browser blocks site data, store mutations are in-memory only and
  // Active Investigations will read 0 after every refresh — say so loudly.
  const [storageBlocked] = useState(() => !isLocalStorageAvailable())

  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  const sel = (k: 'risk' | 'tr' | 'cause', o: string[]) => (
    <select
      aria-label={k}
      value={f[k]}
      onChange={e => set(k, e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm focus:outline-none"
    >
      <option value="">{k === 'tr' ? 'Transformer' : k[0].toUpperCase() + k.slice(1)}: All</option>
      {o.map(x => (
        <option key={x} value={x}>{x}</option>
      ))}
    </select>
  )

  const navItems = [
    { to: '/', label: 'Live Grid Dashboard', icon: Box, highlight: true },
    { to: '/alerts', label: 'Incident Alerts', icon: ShieldAlert },
    { to: '/investigations', label: 'Active Investigations', icon: UserCheck, highlight: true },
    { to: '/history', label: 'Incident History', icon: History },
    { to: '/consumers', label: 'Smart Meter Registry', icon: Layers },
    { to: '/grid', label: 'Energy Accounting', icon: Radio },
    { to: '/feedback', label: 'AI Active Learning', icon: Database }
  ]

  const ctx = useMemo(() => ({ f, set }), [f])

  return (
    <F.Provider value={ctx}>
      <div className="grid min-h-screen grid-cols-[240px_1fr] bg-slate-50 text-slate-900 font-sans">
        {/* Left Clean Light Sidebar */}
        <aside className="flex flex-col border-r border-slate-200 bg-white p-4">
          <div className="mb-6 flex items-center gap-2.5 cursor-pointer" onClick={() => nav('/')}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-sm">
              GG
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">GRIDGUARD</div>
              <div className="text-[10px] text-blue-600 font-semibold tracking-wider">SMART GRID MONITOR</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            {navItems.map(item => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                      isActive
                        ? 'bg-blue-600 font-semibold text-white shadow-sm'
                        : item.highlight
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="mt-auto space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
            <div className="flex items-center justify-between">
              <span>Grid Stream:</span>
              <span className="font-semibold text-emerald-700">● 50.0 Hz Normal</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Detection:</span>
              <span className="font-semibold text-blue-700">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span>IoT Network:</span>
              <span className="font-medium text-slate-700">48 Smart Meters</span>
            </div>
          </div>
        </aside>

        {/* Main Operational View */}
        <main className="flex flex-col overflow-x-hidden">
          {/* Top Header */}
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                list="sr"
                placeholder="Search meter ID, transformer (e.g. C-017, T-01)..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && q) {
                    const r = api.search(q)[0]
                    if (r) nav(r.startsWith('C-') ? '/consumers/' + r : '/grid')
                    setQ('')
                  }
                }}
                className="w-80 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none"
              />
              <datalist id="sr">
                {api.search(q).map(x => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <Btn p onClick={() => nav('/consumers/C-017')}>
                Quick Demo: C-017
              </Btn>
              <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 font-mono text-[11px] font-bold text-emerald-700">
                ● LIVE GRID STREAM
              </span>
            </div>
          </header>

          {/* Filter Bar */}
          <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-slate-200 bg-white/95 px-4 backdrop-blur shadow-xs">
            {sel('risk', ['Normal', 'Watch', 'Medium', 'High', 'Critical'])}
            {sel('tr', TRS)}
            {sel('cause', ALLC.concat('Normal consumption' as Cause))}
            <button className="text-xs text-blue-600 font-medium hover:underline" onClick={() => setF({ risk: '', tr: '', cause: '' })}>
              Clear filters
            </button>
          </div>

          {/* Master View Area */}
          <div className="p-4">
            {storageBlocked && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-sm">
                <span className="font-bold">Persistence unavailable:</span> your browser is blocking site
                data for this origin, so investigations and history are kept in memory only and will reset
                to the sample case on refresh. Allow cookies / site data for localhost to keep data across restarts.
              </div>
            )}
            <Routes>
              <Route path="/" element={<UnifiedDashboard />} />
              <Route path="/overview" element={<Navigate to="/" replace />} />
              <Route path="/simulator" element={<Navigate to="/" replace />} />
              <Route path="/consumers" element={<Consumers />} />
              <Route path="/consumers/:id" element={<InvestigationPage />} />
              <Route path="/grid" element={<Grid />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/investigations" element={<InvestigationQueuePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/feedback" element={<AIFeedbackDrawer />} />
            </Routes>
          </div>
        </main>
      </div>
    </F.Provider>
  )
}
