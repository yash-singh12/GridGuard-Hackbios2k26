import React, { useState } from 'react'
import { Cpu, Globe, CloudSun, CheckCircle2, X, Radio, Layers, HardDrive } from 'lucide-react'

interface RealDataBridgeModalProps {
  isOpen: boolean
  onClose: () => void
}

export const RealDataBridgeModal: React.FC<RealDataBridgeModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'datasets' | 'hardware' | 'energy_balance' | 'weather'>('datasets')
  const [selectedDataset, setSelectedDataset] = useState('pecan_street')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header (Clean Light Theme) */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-2.5">
            <Globe className="text-blue-600" size={22} />
            <div>
              <h3 className="text-base font-bold text-slate-900">How to Make GRIDGUARD Real (Not Just Synthetic)</h3>
              <p className="text-xs text-slate-500">Real smart meter datasets, physical IoT sensors, and electricity board energy accounting.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('datasets')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === 'datasets' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <HardDrive size={14} /> 1. Real Smart Meter Datasets
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === 'hardware' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cpu size={14} /> 2. Physical IoT Sensor Bridge
          </button>
          <button
            onClick={() => setActiveTab('energy_balance')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === 'energy_balance' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={14} /> 3. Transformer Energy Balance
          </button>
          <button
            onClick={() => setActiveTab('weather')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 transition ${
              activeTab === 'weather' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CloudSun size={14} /> 4. Weather & Temperature Normalization
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-slate-700 space-y-4">
          {activeTab === 'datasets' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <h4 className="font-bold text-blue-900">How to Ingest Real Smart Meter Telemetry</h4>
                <p className="mt-1 text-xs text-slate-600">
                  Instead of relying solely on generated readings, GRIDGUARD can ingest real historical smart meter interval datasets or live AMI meter push frames.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div
                  onClick={() => setSelectedDataset('pecan_street')}
                  className={`cursor-pointer rounded-lg border p-3.5 transition ${
                    selectedDataset === 'pecan_street' ? 'border-blue-600 bg-blue-50/60 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-slate-900">Pecan Street Dataport</div>
                  <div className="mt-1 text-xs text-slate-500">1-minute interval smart meter dataset with solar, EV & air-conditioning loads.</div>
                  <div className="mt-2 text-[10px] text-blue-600 font-mono font-semibold">1,142 Real Homes · Texas, USA</div>
                </div>

                <div
                  onClick={() => setSelectedDataset('irish_cer')}
                  className={`cursor-pointer rounded-lg border p-3.5 transition ${
                    selectedDataset === 'irish_cer' ? 'border-blue-600 bg-blue-50/60 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-slate-900">Irish CER Smart Metering</div>
                  <div className="mt-1 text-xs text-slate-500">Standard global benchmark for electricity theft detection research.</div>
                  <div className="mt-2 text-[10px] text-blue-600 font-mono font-semibold">5,000+ Consumers · 18 Months</div>
                </div>

                <div
                  onClick={() => setSelectedDataset('dlms_cosem')}
                  className={`cursor-pointer rounded-lg border p-3.5 transition ${
                    selectedDataset === 'dlms_cosem' ? 'border-blue-600 bg-blue-50/60 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-slate-900">DLMS/COSEM (IEC 62056)</div>
                  <div className="mt-1 text-xs text-slate-500">Indian & International smart meter AMI communication protocol.</div>
                  <div className="mt-2 text-[10px] text-blue-600 font-mono font-semibold">Standard OBIS Frame Parser</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs">
                <div className="text-slate-500">// Real Ingestion Payload Example:</div>
                <div className="mt-2 text-slate-800">
                  {`{
  "timestamp": "2026-10-07T04:45:00Z",
  "meter_id": "MTR-CER-4091",
  "transformer_id": "TR-01",
  "active_power_kw": 1.482,
  "voltage_v": 231.4,
  "current_a": 6.42,
  "obis_energy_import_kwh": 4182.44,
  "tamper_cover_open": false
}`}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4">
                <h4 className="font-bold text-purple-900">Live Hardware Demonstration: ESP32 + Current Transformer (CT)</h4>
                <p className="mt-1 text-xs text-slate-600">
                  For a physical hackathon showcase, connect a live 230V AC appliance to prove that physical line tampering triggers instant alerts in the 3D control room!
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Radio size={16} className="text-blue-600" /> Hardware Bill of Materials (Under ₹1,200)
                  </h5>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                    <li>• <b className="text-slate-900">ESP32 Dev Module</b> (Wi-Fi + MQTT client)</li>
                    <li>• <b className="text-slate-900">SCT-013-000 Current Transformer</b> (100A / 50mA split-core sensor)</li>
                    <li>• <b className="text-slate-900">Burden Resistor (33Ω) + Voltage Divider</b> (2.5V DC offset for ADC)</li>
                    <li>• <b className="text-slate-900">Toggle Bypass Switch</b> (simulates neutral/phase theft bridge)</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" /> Physical Demo Flow
                  </h5>
                  <ol className="mt-2 space-y-1.5 text-xs text-slate-600 list-decimal pl-4">
                    <li>Bulb/Heater is turned on $\to$ ESP32 streams 2.4A load to GRIDGUARD.</li>
                    <li>Presenter flips the physical bypass switch.</li>
                    <li>Meter current abruptly drops to 0.4A, but transformer primary remains loaded.</li>
                    <li>GRIDGUARD's 3D Digital Twin pulses red and flashes: <b className="text-red-600">P1 THEFT DETECTED</b>!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'energy_balance' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
                <h4 className="font-bold text-amber-900">The Secret to Real Utility Loss Detection: Double-Entry Energy Balancing</h4>
                <p className="mt-1 text-xs text-slate-600">
                  Real electricity boards (DISCOMs) do NOT rely only on single smart meter anomalies. They cross-verify using Kirchhoff's Conservation of Energy at the Distribution Transformer (DTU).
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
                <div className="text-blue-600 font-bold">// Transformer Energy Balance Formula:</div>
                <div className="mt-2 text-slate-900 font-bold">
                  ΔE_unexplained = E_transformer_input - Σ E_consumer_meters - E_technical_line_loss(I²R)
                </div>
                <div className="mt-3 text-slate-600">
                  • If an individual meter drops, but Transformer ΔE remains 0% $\to$ <span className="text-emerald-700 font-semibold">Legitimate Conservation (Not Theft)</span>.<br/>
                  • If an individual meter drops, and Transformer ΔE simultaneously increases by the exact same kilowatt-hour deficit $\to$ <span className="text-red-600 font-bold">Mathematical Proof of Non-Technical Theft</span>.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'weather' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
                <h4 className="font-bold text-blue-900">Weather & Temperature Covariate Normalization (Open-Meteo API)</h4>
                <p className="mt-1 text-xs text-slate-600">
                  During summer heatwaves, power spikes due to air conditioning; during monsoon rain, temperatures drop and loads fall legitimately. Normalizing against Cooling Degree Days (CDD) prevents seasonal false alarms.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs font-mono text-slate-700">
                <div className="text-blue-600 font-semibold">GET https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&hourly=temperature_2m</div>
                <div className="mt-2 text-slate-800">
                  Baseline Adjustment Factor = 1.0 + β_temp × max(0, Ambient_Temp - 24°C)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4">
          <div className="text-xs text-slate-500">
            GRIDGUARD · Production Readiness & Hardware Integration Suite
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Close Overview
          </button>
        </div>
      </div>
    </div>
  )
}
