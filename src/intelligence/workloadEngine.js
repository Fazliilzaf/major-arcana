function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

const BASE_MINUTES_BY_INTENT = Object.freeze({
  complaint: 8,
  booking_request: 5,
  pricing_question: 4,
  follow_up: 3,
  cancellation: 3,
  default: 4,
});

const TONE_ADJUSTMENTS = Object.freeze({
  frustrated: 3,
  anxious: 2,
  urgent: 2,
  stressed: 1,
  neutral: 0,
  positive: -1,
});

const PRIORITY_ADJUSTMENTS = Object.freeze({
  Critical: 3,
  High: 2,
  Medium: 1,
  Low: 0,
});

const WARMTH_ADJUSTMENTS = Object.freeze({
  new: 1,
  returning: 0,
  loyal: -1,
  dormant: 1,
  default: 0,
});

function normalizeIntent(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    [
      'booking_request',
      'pricing_question',
      'anxiety_pre_op',
      'complaint',
      'cancellation',
      'follow_up',
      'unclear',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return 'unclear';
}

function normalizeTone(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive'].includes(normalized)) {
    return normalized;
  }
  return 'neutral';
}

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function normalizeWarmth(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['new', 'new_lead'].includes(normalized)) return 'new';
  if (['returning', 'active_dialogue'].includes(normalized)) return 'returning';
  if (['loyal', 'post_treatment'].includes(normalized)) return 'loyal';
  if (['dormant', 'pre_treatment'].includes(normalized)) return 'dormant';
  return 'default';
}

function resolveLengthAdjustment(messageLength = 0) {
  const length = Math.max(0, Math.round(toNumber(messageLength, 0)));
  if (length >= 1200) return 3;
  if (length >= 800) return 2;
  return 0;
}

function estimateConversationWorkload(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const intent = normalizeIntent(safeInput.intent);
  const tone = normalizeTone(safeInput.tone);
  const priorityLevel = normalizePriorityLevel(safeInput.priorityLevel);
  const warmth = normalizeWarmth(safeInput.warmth);
  const messageLength = Math.max(0, Math.round(toNumber(safeInput.messageLength, 0)));

  const base = toNumber(
    BASE_MINUTES_BY_INTENT[intent] ?? BASE_MINUTES_BY_INTENT.default,
    BASE_MINUTES_BY_INTENT.default
  );
  const toneAdjustment = toNumber(TONE_ADJUSTMENTS[tone] ?? 0, 0);
  const priorityAdjustment = toNumber(PRIORITY_ADJUSTMENTS[priorityLevel] ?? 0, 0);
  const warmthAdjustment = toNumber(WARMTH_ADJUSTMENTS[warmth] ?? 0, 0);
  const lengthAdjustment = resolveLengthAdjustment(messageLength);

  const rawTotal = base + toneAdjustment + priorityAdjustment + warmthAdjustment + lengthAdjustment;
  const estimatedMinutes = Math.round(clamp(rawTotal, 2, 25, 4));

  return {
    estimatedMinutes,
    breakdown: {
      base,
      toneAdjustment,
      priorityAdjustment,
      warmthAdjustment,
      lengthAdjustment,
    },
  };
}

module.exports = {
  BASE_MINUTES_BY_INTENT,
  TONE_ADJUSTMENTS,
  PRIORITY_ADJUSTMENTS,
  WARMTH_ADJUSTMENTS,
  estimateConversationWorkload,
};
