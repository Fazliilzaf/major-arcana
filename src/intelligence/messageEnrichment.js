'use strict';

/**
 * messageEnrichment (DI3) — applicerar alla deterministic intelligence-engines på en message.
 *
 * Sync only (deterministic). Semantisk (OpenAI) körning hanteras separat i
 * en async runner om tenanten har AI aktiverat. Detta säkerställer att hot
 * path inte blockas av extern API.
 *
 * Returnerar ett enrichment-objekt som lagras i messageIntelligenceStore.
 *   {
 *     enrichedAt: iso,
 *     engineVersion: 'det-1.0.0',
 *     tone: { tone, toneConfidence, source },
 *     intent: { intent, confidence, source },
 *     priority: { priorityScore, priorityLevel, priorityReasons },
 *     language: { language, confidence },
 *     anomalyFlags: string[]
 *   }
 *
 * Idempotent — kan köras flera gånger på samma message utan sidoeffekter.
 */

const { runDeterministicTone } = require('./toneDetector');
const { runDeterministicIntent } = require('./intentClassifier');
const { computePriorityScore } = require('./priorityScoreEngine');

const ENGINE_VERSION = 'det-1.0.0';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pickMessageText(msg = {}) {
  // Samla maximal text för analys: subject + bodyPreview/body
  const subject = normalizeText(msg.subject) || normalizeText(msg.normalizedSubject) || '';
  const body =
    normalizeText(msg.bodyPreview) ||
    normalizeText(msg.body) ||
    normalizeText(msg.bodyText) ||
    normalizeText(msg.bodyPlain) ||
    normalizeText(msg.bodyContent) ||
    '';
  // Subject viktas högre genom att ligga först + appendas igen
  return [subject, body, subject].filter(Boolean).join('\n\n').slice(0, 4000);
}

// Lättviktig deterministic språk-detection. Bara svenska/engelska/danska/tyska
// stöds (matchar i18n). Returnerar 'sv' default.
function detectLanguageHeuristic(text = '') {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return { language: 'sv', confidence: 0.3 };
  // Markörer per språk (vanliga småord/tecken)
  const swMarkers = /\b(och|att|jag|inte|för|med|men|hur|när|kan|är|på|ett|åt|över)\b|å|ö/;
  const enMarkers = /\b(and|the|you|with|for|that|have|are|this|will|would|could)\b/;
  const deMarkers = /\b(und|der|die|das|nicht|für|mit|auf|sehr|wir|sind|bitte)\b|ß|ü/;
  const dkMarkers = /\b(og|jeg|ikke|på|men|du|vi|kan|skal|hvad|godt)\b|æ|ø/;
  const counts = {
    sv: (lower.match(swMarkers) || []).length,
    en: (lower.match(enMarkers) || []).length,
    de: (lower.match(deMarkers) || []).length,
    dk: (lower.match(dkMarkers) || []).length,
  };
  let best = 'sv';
  let bestScore = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > bestScore) {
      best = lang;
      bestScore = count;
    }
  }
  // Scaled confidence
  const total = counts.sv + counts.en + counts.de + counts.dk;
  const confidence = total === 0 ? 0.3 : Math.min(0.95, 0.4 + (bestScore / total) * 0.55);
  return { language: best, confidence: Number(confidence.toFixed(2)) };
}

// Anomaly-heuristik: enkla flaggor för långa mail, all-caps, många ?,
// negativa nyckelord. Tjänar som en första-signal innan riktig
// anomaly-engine integreras med customer-temperature.
function detectAnomalyFlags(text = '', tone = '', intent = '') {
  const flags = [];
  const len = text.length;
  if (len > 1500) flags.push('long_message');
  const upperRatio = (text.match(/[A-ZÅÄÖ]/g) || []).length / Math.max(1, len);
  if (upperRatio > 0.3 && len > 80) flags.push('all_caps');
  const questionCount = (text.match(/\?/g) || []).length;
  if (questionCount >= 3) flags.push('many_questions');
  const exclamCount = (text.match(/!/g) || []).length;
  if (exclamCount >= 3) flags.push('many_exclamations');
  if (
    /\b(arg|frustrer|besvik|missnöjd|jurist|advokat|stäm|polis|reklamation)\b/i.test(text)
  ) {
    flags.push('legal_or_complaint_keywords');
  }
  if (tone === 'angry' || tone === 'frustrated') flags.push('negative_tone');
  if (intent === 'complaint' || intent === 'cancel') flags.push('high_risk_intent');
  return flags;
}

function enrichMessage(message = {}, options = {}) {
  const safeMessage = asObject(message);
  const text = pickMessageText(safeMessage);

  // 1. Tone
  let tone;
  try {
    const result = runDeterministicTone(text);
    tone = {
      tone: result.tone,
      toneConfidence: result.toneConfidence,
      source: result.source,
    };
  } catch (_e) {
    tone = { tone: 'neutral', toneConfidence: 0.3, source: 'fallback' };
  }

  // 2. Intent
  let intent;
  try {
    const result = runDeterministicIntent(text);
    intent = {
      intent: result.intent,
      confidence: result.confidence,
      source: result.source,
    };
  } catch (_e) {
    intent = { intent: 'unclear', confidence: 0.3, source: 'fallback' };
  }

  // 3. Language
  const language = detectLanguageHeuristic(text);

  // 4. Priority — kräver minimal kontext om SLA/historik
  let priority = { priorityScore: 0, priorityLevel: 'low', priorityReasons: [] };
  try {
    const hoursSinceInbound =
      Number(options.hoursSinceInbound) ||
      computeHoursSinceInbound(safeMessage) ||
      0;
    priority = computePriorityScore({
      intent: intent.intent,
      tone: tone.tone,
      slaStatus: options.slaStatus || 'within',
      hoursSinceInbound,
      isVip: Boolean(options.isVip),
      hasOpenIssue: Boolean(options.hasOpenIssue),
      history: options.history || {},
    });
  } catch (_e) {
    // håll defaults
  }

  // 5. Anomaly flags
  const anomalyFlags = detectAnomalyFlags(text, tone.tone, intent.intent);

  return {
    enrichedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    tone,
    intent,
    language,
    priority,
    anomalyFlags,
  };
}

function computeHoursSinceInbound(message = {}) {
  const ts =
    Date.parse(message.receivedDateTime || '') ||
    Date.parse(message.sentDateTime || '') ||
    Date.parse(message.receivedAt || '') ||
    Date.parse(message.sentAt || '') ||
    NaN;
  if (!Number.isFinite(ts)) return 0;
  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return 0;
  return Number((diffMs / 3600000).toFixed(2));
}

module.exports = {
  enrichMessage,
  pickMessageText,
  detectLanguageHeuristic,
  detectAnomalyFlags,
  ENGINE_VERSION,
};
