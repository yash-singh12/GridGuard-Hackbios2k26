import { jsPDF } from 'jspdf'
import type { Consumer } from '../../types'
import { estLoss } from '../../mock'
import { aiFeedback } from '../../services/aiFeedbackStore'

const rup = (n: number) => '₹' + n.toLocaleString('en-IN')

export function exportForensicPDF(consumer: Consumer) {
  const doc = new jsPDF()
  const d = consumer.d
  const actions = aiFeedback.getByConsumer(consumer.id)

  // Header Banner
  doc.setFillColor(15, 23, 42) // Dark Slate #0F172A
  doc.rect(0, 0, 210, 24, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('GRIDGUARD AI — ELECTRICITY LOSS INVESTIGATION DOSSIER', 14, 15)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`CONFIDENTIAL · GENERATED: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}`, 130, 20)

  // Section 1: Incident Summary
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('1. TARGET CONSUMER & GRID TOPOLOGY', 14, 34)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const col1Y = 40
  doc.text(`Consumer ID: ${consumer.id}`, 14, col1Y)
  doc.text(`Category: ${consumer.cat}`, 14, col1Y + 6)
  doc.text(`Sanctioned Load: ${consumer.load} kW`, 14, col1Y + 12)
  doc.text(`Tariff Rate: ₹${consumer.tariff} / kWh`, 14, col1Y + 18)

  doc.text(`Feeder: ${consumer.feeder}`, 110, col1Y)
  doc.text(`Transformer: ${consumer.tr}`, 110, col1Y + 6)
  doc.text(`Transformer Unexplained Loss: ${consumer.flags.trGap}%`, 110, col1Y + 12)
  doc.text(`Meter Communication: ${consumer.flags.comm ? 'OFFLINE / FAULT' : 'ONLINE'}`, 110, col1Y + 18)

  // Section 2: AI Anomaly Diagnostics & Root-Cause
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('2. MACHINE LEARNING ANOMALY DIAGNOSTICS', 14, 70)

  // Alert Box
  const isCritical = d.risk === 'Critical' || d.risk === 'High'
  doc.setFillColor(isCritical ? 254 : 241, isCritical ? 242 : 245, isCritical ? 242 : 249)
  doc.rect(14, 74, 182, 22, 'F')
  doc.setDrawColor(isCritical ? 239 : 203, isCritical ? 68 : 213, isCritical ? 68 : 225)
  doc.rect(14, 74, 182, 22, 'S')

  doc.setFontSize(10)
  doc.setTextColor(isCritical ? 185 : 30, isCritical ? 28 : 41, isCritical ? 28 : 59)
  doc.text(`Anomaly Score: ${d.anomaly} / 100 · Risk: ${d.risk} · Priority: ${d.priority}`, 18, 81)
  doc.setFont('helvetica', 'normal')
  doc.text(`Classified Cause: ${d.top} (Confidence: ${d.conf})`, 18, 88)
  doc.text(`Estimated Non-Technical Revenue Loss: ${rup(estLoss(consumer))} / Month`, 18, 93)

  // Section 3: Evidence Breakdown (XAI / SHAP)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('3. EXPLAINABLE AI (XAI) EVIDENCE & CONTRIBUTING SIGNALS', 14, 106)

  let y = 113
  doc.setFontSize(9)
  d.evidence.forEach((ev, i) => {
    const isSupp = ev.direction === 'supports'
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(isSupp ? 16 : 220, isSupp ? 149 : 38, isSupp ? 106 : 38)
    doc.text(`[${ev.direction.toUpperCase()}]`, 14, y)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(51, 65, 85)
    doc.text(`${ev.signal}: ${ev.text} (Weight: ${ev.weight})`, 42, y)
    y += 6
  })

  // Section 4: Operational Action History & AI Feedback Loop
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('4. AUDIT & OPERATOR ACTION TRAIL (ACTIVE LEARNING LOG)', 14, y)

  y += 8
  if (actions.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.text('No field actions recorded yet for this consumer.', 14, y)
    y += 8
  } else {
    actions.forEach(a => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text(`[${a.action}] ${a.timestamp} by ${a.operatorId}`, 14, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      if (a.dispatch) {
        doc.text(`Work Order: ${a.dispatch.workOrderId} · Squad: ${a.dispatch.teamName}`, 18, y)
        y += 5
        doc.text(`Modus Operandi: ${a.dispatch.suspectedModus}`, 18, y)
        y += 5
      } else if (a.warning) {
        doc.text(`Notice: ${a.warning.noticeNumber} · Delivery: ${a.warning.channel} to ${a.warning.recipient}`, 18, y)
        y += 5
      } else if (a.dismiss) {
        doc.text(`Reason: ${a.dismiss.reason} · Notes: ${a.dismiss.notes}`, 18, y)
        y += 5
      } else if (a.resolve) {
        doc.text(`Outcome: ${a.resolve.outcome} · Recovered: ${rup(a.resolve.recoveredRevenueINR)} (${a.resolve.recoveredKWh} kWh)`, 18, y)
        y += 5
      }
      y += 3
    })
  }

  // Footer / Legal Notice
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('GRIDGUARD AI — Operating under statutory provisions of the Indian Electricity Act 2003 Sections 126, 135 & 138.', 14, 280)
  doc.text('This forensic dossier represents probabilistic machine learning analysis. Physical inspection mandatory before punitive action.', 14, 285)

  doc.save(`GRIDGUARD-DOSSIER-${consumer.id}.pdf`)
}
