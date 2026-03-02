function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  const numeric = toNumber(value, min);
  return Math.max(min, Math.min(max, numeric));
}

const INTENT_WEIGHTS = Object.freeze({
  complaint: 25,
  anxiety_pre_op: 20,
  booking_request: 15,
  cancellation: 15,
  pricing_question: 10,
  follow_up: 8,
  unclear: 5,
});

const TONE_WEIGHTS = Object.freeze({
  frustrated: 20,
  anxious: 15,
  urgent: 15,
  stressed: 10,
  neutral: 0,
  positive: 0,
});

function mapPriorityLevel(score = 0) {
  const safeScore = toNumber(score, 0);
  if (safeScore >= 75) return 'Critical';
  if (safeScore >= 50) return 'High';
  if (safeScore >= 25) return 'Medium';
  return 'Low';
}

function resolveSlaAgeWeight(hoursSinceInbound = 0) {
  const hours = Math.max(0, toNumber(hoursSinceInbound, 0));
  if (hours >= 72) return 40;
  if (hours >= 48) return 30;
  if (hours >= 24) return 20;
  if (hours >= 12) return 10;
  return 5;
}

function normalizeIntent(intent = '') {
  const normalized = normalizeText(intent).toLowerCase();
  return Object.prototype.hasOwnProperty.call(INTENT_WEIGHTS, normalized) ? normalized : 'unclear';
}

function normalizeTone(tone = '') {
  const normalized = normalizeText(tone).toLowerCase();
  return Object.prototype.hasOwnProperty.call(TONE_WEIGHTS, normalized) ? normalized : 'neutral';
}

function normalizeCustomerContext(raw = null) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const openCommitmentsRaw =
    source.openCommitments ?? source.hasOpenCommitments ?? source.pendingCommitments ?? null;
  const openCommitments =
    typeof openCommitmentsRaw === 'boolean'
      ? openCommitmentsRaw
      : Number.isFinite(Number(openCommitmentsRaw))
      ? Number(openCommitmentsRaw) > 0
      : false;

  const repeatCustomerRaw =
    source.repeatCustomer ?? source.isRepeatCustomer ?? source.returningCustomer ?? null;
  const repeatCustomer =
    typeof repeatCustomerRaw === 'boolean'
      ? repeatCustomerRaw
      : String(repeatCustomerRaw || '').trim().toLowerCase() === 'true';

  const estimatedRevenueBand = normalizeText(
    source.estimatedRevenueBand || source.revenueBand || source.expectedRevenueBand || ''
  ).toLowerCase();

  return {
    openCommitments,
    repeatCustomer,
    estimatedRevenueBand,
  };
}

function isHighRevenueBand(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;
  return ['high', 'premium', 'vip', 'large', 'hög', 'hog'].includes(normalized);
}

function computePriorityScore({
  hoursSinceInbound = 0,
  intent = 'unclear',
  tone = 'neutral',
  customerContext = null,
} = {}) {
  const reasons = [];
  let score = 0;

  const slaWeight = resolveSlaAgeWeight(hoursSinceInbound);
  score += slaWeight;
  reasons.push(`SLA_AGE:+${slaWeight}`);

  const normalizedIntent = normalizeIntent(intent);
  const intentWeight = Number(INTENT_WEIGHTS[normalizedIntent] || 0);
  if (intentWeight > 0) {
    score += intentWeight;
    reasons.push(`INTENT_${normalizedIntent.toUpperCase()}:+${intentWeight}`);
  }

  const normalizedTone = normalizeTone(tone);
  const toneWeight = Number(TONE_WEIGHTS[normalizedTone] || 0);
  if (toneWeight > 0) {
    score += toneWeight;
    reasons.push(`TONE_${normalizedTone.toUpperCase()}:+${toneWeight}`);
  }

  const context = normalizeCustomerContext(customerContext);
  if (context.openCommitments) {
    score += 15;
    reasons.push('CUSTOMER_OPEN_COMMITMENTS:+15');
  }
  if (context.repeatCustomer) {
    score += 5;
    reasons.push('CUSTOMER_REPEAT:+5');
  }
  if (isHighRevenueBand(context.estimatedRevenueBand)) {
    score += 10;
    reasons.push('CUSTOMER_REVENUE_HIGH:+10');
  }

  const normalizedScore = Math.round(clamp(score, 0, 100));
  return {
    priorityScore: normalizedScore,
    priorityLevel: mapPriorityLevel(normalizedScore),
    priorityReasons: reasons.slice(0, 12),
  };
}

module.exports = {
  computePriorityScore,
  mapPriorityLevel,
};
