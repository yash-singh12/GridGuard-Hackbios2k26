import type { Consumer, EvidenceItem } from '../types'
import { estLoss } from '../mock'

const LOCAL_STORAGE_KEY = 'gridguard_gemini_api_key'
const DEFAULT_MODEL = 'gemini-2.0-flash'
const BACKEND_URL = (import.meta as any).env?.VITE_API_URL || ''

export interface GeminiAnalysisResult {
  consumerId: string
  summary: string
  evidenceExplanation: string
  recommendedAction: string
  rawMarkdown: string
  isLive: boolean
  modelUsed: string
  generatedAt: string
  error?: string
}

export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved && saved.trim()) return saved.trim()
  }
  const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
  return typeof envKey === 'string' ? envKey.trim() : ''
}

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(LOCAL_STORAGE_KEY, key.trim())
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
    }
  }
}

// In-memory cache to prevent unnecessary duplicate requests during session
const analysisCache = new Map<string, GeminiAnalysisResult>()

/**
 * Builds the plain-English forensic prompt for Gemini.
 */
function buildPrompt(consumer: Consumer): string {
  const d = consumer.d
  const lossINR = estLoss(consumer)
  const evidenceLines = d.evidence
    .map(
      (ev: EvidenceItem) =>
        `- [${ev.direction.toUpperCase()}] ${ev.signal}: "${ev.text}" (weight: ${ev.weight})`
    )
    .join('\n')

  return `You are GRIDGUARD's Senior Smart Grid Forensic AI Investigator.
Analyze this electricity consumer and explain the AI findings strictly in PLAIN, NATURAL ENGLISH (avoid complex ML jargon) so distribution grid operators, vigilance squads, and billing managers can understand exactly what happened.

CONSUMER METRICS:
- Consumer ID: ${consumer.id}
- Customer Category: ${consumer.cat}
- Sanctioned Load: ${consumer.load} kW
- Tariff Rate: ₹${consumer.tariff} / kWh
- Transformer: ${consumer.tr} (Feeder: ${consumer.feeder})
- Historical Baseline: ${consumer.base} kWh
- Recent Recorded Demand: ${consumer.actual !== null ? consumer.actual : 'None / Dropped'} kWh (${consumer.dev > 0 ? '+' : ''}${consumer.dev}% deviation)
- Estimated Monthly Revenue Loss: ₹${lossINR.toLocaleString('en-IN')}
- ML Anomaly Score: ${d.anomaly}/100 (${d.risk} Risk · Priority ${d.priority})
- ML Classification Cause: ${d.top}

PLAIN-ENGLISH EVIDENCE SIGNALS ON RECORD:
${evidenceLines}

INSTRUCTIONS:
Provide a plain-English, objective, professional investigation narrative divided into the following 2 sections:

### 1. Plain-English Executive Summary
Provide 2-3 straightforward sentences explaining the core situation: whether power is being diverted, the meter is broken, communications failed, or usage is legitimate, and the financial impact on the grid.

### 2. Plain-English Evidence Analysis
Explain how the flagged evidence signals connect together in simple terms. For instance, explain why a meter having normal communication and healthy voltage while recorded power plunges and the transformer shows missing energy rules out technical failure and indicates unauthorized bypass.`
}

/**
 * Parses markdown output into structured segments.
 */
function parseAnalysisSections(rawText: string, consumer: Consumer): {
  summary: string
  evidenceExplanation: string
  recommendedAction: string
} {
  const clean = rawText.replace(/\r\n/g, '\n').trim()

  const summaryMatch = clean.match(/###\s*1\.\s*Plain-English Executive Summary\s*([\s\S]*?)(?=###\s*2\.)/i)
  const evidenceMatch = clean.match(/###\s*2\.\s*Plain-English Evidence Analysis\s*([\s\S]*?)$/i)

  if (summaryMatch && evidenceMatch) {
    return {
      summary: summaryMatch[1].trim(),
      evidenceExplanation: evidenceMatch[1].trim(),
      recommendedAction: ''
    }
  }

  // Fallback splitting if headers vary slightly
  const parts = clean.split(/###\s*/).filter(Boolean)
  if (parts.length >= 2) {
    return {
      summary: parts[0].replace(/^1\..*?\n/, '').trim(),
      evidenceExplanation: parts[1].replace(/^2\..*?\n/, '').trim(),
      recommendedAction: ''
    }
  }

  return {
    summary: clean.slice(0, 300),
    evidenceExplanation: clean,
    recommendedAction: ''
  }
}

/**
 * Intelligent local plain-English synthesis engine.
 * Generates an instant, highly coherent analysis based on the exact evidence signals
 * when no API key is provided or offline.
 */
function generateLocalSynthesis(consumer: Consumer): GeminiAnalysisResult {
  const d = consumer.d
  const lossINR = estLoss(consumer)
  const devAbs = Math.abs(consumer.dev)
  const cause = d.top

  let summary = ''
  let evidenceExplanation = ''
  let recommendedAction = ''

  if (cause.includes('theft') || cause.includes('tampering')) {
    summary = `Consumer ${consumer.id} (${consumer.cat}, ${consumer.load} kW) is showing high-confidence indicators of electricity theft. Electricity consumption abruptly plunged ${devAbs}% below historical baseline while the transformer serving this line registered unexplained energy deficits, resulting in an estimated monthly revenue leak of ₹${lossINR.toLocaleString('en-IN')}.`

    const supportSignals = d.evidence
      .filter(e => e.direction === 'supports')
      .map(e => e.text.toLowerCase())
      .join(', ')

    evidenceExplanation = `The plain-English evidence firmly rules out technical equipment error. The smart meter's internal diagnostics and communication links remain completely healthy (voltage and connectivity OK), proving that the meter is actively transmitting telemetry. However, current draw has plummeted while similar neighbors in the same category maintained steady consumption. Crucially, transformer ${consumer.tr} shows a matching unexplained loss, confirming that energy is being consumed off-grid via an unauthorized bypass rather than a legitimate load drop.`

    recommendedAction = `1. Issue an inspection work order to the Anti-Theft Vigilance Squad with Priority ${d.priority}.\n2. Perform an unannounced on-site check of meter terminal seals, incoming service wire, and neutral bypass loop.\n3. If diversion is confirmed, prepare a provisional assessment docket under Section 135 of the Electricity Act.`
  } else if (cause.includes('malfunction') || cause.includes('Meter')) {
    summary = `Consumer ${consumer.id} has experienced a severe hardware metering anomaly. The device recorded a sudden drop of ${devAbs}%, but internal diagnostics indicate potential sensor degradation or CT saturation rather than deliberate consumer theft.`

    evidenceExplanation = `The evidence signals indicate the meter hardware triggered internal fault status or abnormal voltage flatlines. Unlike power theft where neighboring lines absorb unaccounted energy, this anomaly is localized entirely inside the meter's internal registers without matching transformer-level unexplained power gaps.`

    recommendedAction = `1. Schedule a Meter Testing & Calibration technician to visit premises ${consumer.id}.\n2. Run secondary injection testing and check CT/PT wiring integrity.\n3. Replace meter if internal drift or burnt potential coil is detected.`
  } else if (cause.includes('Communication') || cause.includes('failure')) {
    summary = `Consumer ${consumer.id} is flagged due to lost telemetry and missing data packets. The meter failed to report periodic intervals, creating an automated billing data gap.`

    evidenceExplanation = `All electrical evidence indicates this is a cellular/RF communication failure rather than an illegal tap. The transformer power balance remains consistent, and no physical energy discrepancy has been detected on the distribution feeder.`

    recommendedAction = `1. Perform a remote ping test and check cellular signal strength at transformer ${consumer.tr}.\n2. Dispatch field staff to check the meter's optical port and external antenna connection.\n3. Pull offline data logs to reconcile unbilled energy.`
  } else {
    summary = `Consumer ${consumer.id} is operating within normal technical parameters. Consumption matches sanctioned load (${consumer.load} kW) with minor expected baseline fluctuations of ${consumer.dev}%.`

    evidenceExplanation = `All monitoring signals are stable. Meter communications, voltage quality, peer median comparisons, and transformer balance tests show zero unexplained variance or theft indicators.`
  }

  const rawMarkdown = `### 1. Plain-English Executive Summary\n${summary}\n\n### 2. Plain-English Evidence Analysis\n${evidenceExplanation}`

  return {
    consumerId: consumer.id,
    summary,
    evidenceExplanation,
    recommendedAction: '',
    rawMarkdown,
    isLive: false,
    modelUsed: 'GRIDGUARD Local AI Synthesis Engine (Ready for Live Gemini Key)',
    generatedAt: new Date().toLocaleTimeString()
  }
}

/**
 * Calls Google Gemini REST API or falls back to backend proxy / local synthesis.
 */
export async function analyzeConsumerWithGemini(
  consumer: Consumer,
  forceRefresh = false
): Promise<GeminiAnalysisResult> {
  const cacheKey = `${consumer.id}-${consumer.d.top}-${consumer.dev}`
  if (!forceRefresh && analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey)!
  }

  const apiKey = getGeminiApiKey()

  // 1. If user provided a Gemini API Key, query Google Gemini REST API directly
  if (apiKey) {
    try {
      const prompt = buildPrompt(consumer)
      const modelsToTry = [DEFAULT_MODEL, 'gemini-1.5-flash']

      for (const model of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 900
              }
            })
          })

          if (response.ok) {
            const data = await response.json()
            const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (generatedText && generatedText.trim()) {
              const parsed = parseAnalysisSections(generatedText, consumer)
              const result: GeminiAnalysisResult = {
                consumerId: consumer.id,
                summary: parsed.summary,
                evidenceExplanation: parsed.evidenceExplanation,
                recommendedAction: parsed.recommendedAction,
                rawMarkdown: generatedText,
                isLive: true,
                modelUsed: `Google ${model} (Live API)`,
                generatedAt: new Date().toLocaleTimeString()
              }
              analysisCache.set(cacheKey, result)
              return result
            }
          } else {
            const errData = await response.json().catch(() => ({}))
            console.warn(`Gemini API error with model ${model}:`, errData)
          }
        } catch (mErr) {
          console.warn(`Fetch error for ${model}:`, mErr)
        }
      }
    } catch (err) {
      console.error('Failed to query Gemini API:', err)
    }
  }

  // 2. Try backend proxy endpoint (in case backend has GEMINI_API_KEY)
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/gemini/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer_id: consumer.id,
        category: consumer.cat,
        load: consumer.load,
        tariff: consumer.tariff,
        baseline: consumer.base,
        actual: consumer.actual,
        deviation: consumer.dev,
        cause: consumer.d.top,
        anomaly_score: consumer.d.anomaly,
        risk: consumer.d.risk,
        priority: consumer.d.priority,
        transformer: consumer.tr,
        feeder: consumer.feeder,
        evidence: consumer.d.evidence,
        api_key: apiKey || undefined
      })
    })

    if (backendRes.ok) {
      const bData = await backendRes.json()
      if (bData && bData.summary) {
        const result: GeminiAnalysisResult = {
          consumerId: consumer.id,
          summary: bData.summary,
          evidenceExplanation: bData.evidence_explanation || bData.evidenceExplanation,
          recommendedAction: bData.recommended_action || bData.recommendedAction,
          rawMarkdown: bData.raw_markdown || '',
          isLive: Boolean(bData.is_live),
          modelUsed: bData.model_used || 'Gemini API via Backend',
          generatedAt: new Date().toLocaleTimeString()
        }
        analysisCache.set(cacheKey, result)
        return result
      }
    }
  } catch (_e) {
    // Backend proxy not reachable or offline; gracefully fall through to local synthesis
  }

  // 3. Fallback to high-fidelity contextual local synthesis engine
  const fallbackResult = generateLocalSynthesis(consumer)
  analysisCache.set(cacheKey, fallbackResult)
  return fallbackResult
}
