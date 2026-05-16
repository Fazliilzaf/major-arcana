'use strict';

/**
 * Reply Confidence Panel — beräknar konfidens, risk, saknad kontext
 * och rekommenderad ton för CCO-operatörens svarsutkast.
 *
 * Output:
 * {
 *   confidence: 82,
 *   confidenceLabel: "Hög",
 *   risk: "low",
 *   missingContext: [],
 *   suggestedTone: "professional",
 *   requiresOwnerApproval: false,
 *   rationale: ["Matchad mall", "Ingen känslig info"],
 *   draftSource: "template_match",
 * }
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const SENSITIVE_PATTERNS = [
  { id: 'medical_detail', pattern: /diagnos|symptom|medicinsk|blodprov|allergi/i, weight: 20 },
  { id: 'pricing', pattern: /pris|kostnad|offert|faktura|betalning/i, weight: 10 },
  { id: 'complaint', pattern: /missnöjd|klagomål|reklamation|anmäl/i, weight: 25 },
  { id: 'legal', pattern: /juridisk|advokat|skadestånd|garanti/i, weight: 30 },
  { id: 'personal_data', pattern: /personnummer|adress|telefon.*nummer/i, weight: 15 },
];

const TONE_SIGNALS = {
  booking: 'professional',
  aftercare: 'warm',
  complaint: 'formal',
  general: 'professional',
  lead: 'warm',
  internal: 'short',
};

function detectSensitivity(text) {
  const normalized = normalizeText(text);
  const hits = [];
  let totalWeight = 0;
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.pattern.test(normalized)) {
      hits.push(pattern.id);
      totalWeight += pattern.weight;
    }
  }
  return { hits, totalWeight };
}

function computeReplyConfidence({
  thread = null,
  draft = null,
  mailDocument = null,
  templateMatched = false,
  conversationHistory = [],
  riskEvaluation = null,
} = {}) {
  const safeThread = asObject(thread);
  const safeDraft = asObject(draft);
  const safeMailDoc = asObject(mailDocument);
  const riskLevel = toNumber(riskEvaluation?.riskLevel, 0);
  const riskDecision = normalizeText(riskEvaluation?.decision).toLowerCase();

  let confidence = 50;
  const rationale = [];
  const missingContext = [];

  if (templateMatched) {
    confidence += 25;
    rationale.push('Matchad mot befintlig mall.');
  } else {
    rationale.push('Generiskt utkast — ingen exakt mall-matchning.');
  }

  const historyCount = asArray(conversationHistory).length;
  if (historyCount >= 3) {
    confidence += 10;
    rationale.push(`${historyCount} tidigare meddelanden i tråden ger kontext.`);
  } else if (historyCount === 0) {
    confidence -= 10;
    missingContext.push('Ingen tidigare konversationshistorik.');
  }

  const customerName = normalizeText(safeThread.customerName || safeMailDoc?.from?.name);
  if (customerName) {
    confidence += 5;
  } else {
    missingContext.push('Kundnamn saknas.');
  }

  const inboundBody = normalizeText(
    safeThread.latestInboundBody || safeMailDoc?.primaryBodyText
  );
  if (inboundBody.length > 50) {
    confidence += 5;
    const sensitivity = detectSensitivity(inboundBody);
    if (sensitivity.totalWeight > 20) {
      confidence -= sensitivity.totalWeight * 0.5;
      rationale.push(`Känsligt innehåll detekterat: ${sensitivity.hits.join(', ')}.`);
    }
  } else if (!inboundBody) {
    missingContext.push('Inkommande meddelande saknas eller är tomt.');
    confidence -= 15;
  }

  if (riskLevel >= 4) {
    confidence -= 20;
    rationale.push(`Hög risknivå (${riskLevel}) — extra granskning rekommenderas.`);
  } else if (riskLevel >= 3) {
    confidence -= 10;
    rationale.push(`Medelhög risknivå (${riskLevel}).`);
  }

  if (riskDecision === 'blocked' || riskDecision === 'review_required') {
    confidence -= 30;
    rationale.push(`Risk-gate: ${riskDecision}.`);
  }

  const draftBody = normalizeText(safeDraft.body || safeDraft.draftBody);
  if (draftBody.length < 30) {
    confidence -= 10;
    missingContext.push('Utkastet är mycket kort.');
  }

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const confidenceLabel = confidence >= 80 ? 'Hög'
    : confidence >= 50 ? 'Medel'
    : 'Låg';

  const risk = riskLevel >= 4 ? 'high'
    : riskLevel >= 3 ? 'medium'
    : 'low';

  const intent = normalizeText(safeThread.detectedIntent || safeThread.intent || '').toLowerCase();
  const suggestedTone = TONE_SIGNALS[intent] || 'professional';

  const requiresOwnerApproval =
    riskDecision === 'review_required' ||
    riskDecision === 'blocked' ||
    riskLevel >= 4 ||
    confidence < 40;

  const draftSource = templateMatched ? 'template_match'
    : historyCount > 0 ? 'context_aware'
    : 'generic';

  return {
    confidence,
    confidenceLabel,
    risk,
    riskLevel,
    missingContext,
    suggestedTone,
    requiresOwnerApproval,
    rationale,
    draftSource,
    sensitivity: detectSensitivity(inboundBody),
  };
}

module.exports = {
  computeReplyConfidence,
  detectSensitivity,
};
