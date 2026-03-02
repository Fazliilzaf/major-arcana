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

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

const LIFECYCLE_STATES = Object.freeze({
  NEW: 'NEW',
  ACTIVE_DIALOGUE: 'ACTIVE_DIALOGUE',
  AWAITING_REPLY: 'AWAITING_REPLY',
  FOLLOW_UP_PENDING: 'FOLLOW_UP_PENDING',
  DORMANT: 'DORMANT',
  HANDLED: 'HANDLED',
  ARCHIVED: 'ARCHIVED',
});

const ALL_STATES = Object.freeze(Object.values(LIFECYCLE_STATES));

const STATE_SORT_ORDER = Object.freeze([
  LIFECYCLE_STATES.FOLLOW_UP_PENDING,
  LIFECYCLE_STATES.ACTIVE_DIALOGUE,
  LIFECYCLE_STATES.NEW,
  LIFECYCLE_STATES.AWAITING_REPLY,
  LIFECYCLE_STATES.DORMANT,
  LIFECYCLE_STATES.HANDLED,
  LIFECYCLE_STATES.ARCHIVED,
]);

const STATE_RANK = Object.freeze(
  STATE_SORT_ORDER.reduce((acc, state, index) => {
    acc[state] = index + 1;
    return acc;
  }, {})
);

function normalizeLifecycleStatus(value = '') {
  const normalized = normalizeText(value).toUpperCase();
  if (ALL_STATES.includes(normalized)) return normalized;

  const aliases = {
    NEW_LEAD: LIFECYCLE_STATES.NEW,
    NEW: LIFECYCLE_STATES.NEW,
    ACTIVE: LIFECYCLE_STATES.ACTIVE_DIALOGUE,
    ACTIVE_DIALOGUE: LIFECYCLE_STATES.ACTIVE_DIALOGUE,
    AWAITING: LIFECYCLE_STATES.AWAITING_REPLY,
    AWAITING_REPLY: LIFECYCLE_STATES.AWAITING_REPLY,
    WAITING: LIFECYCLE_STATES.AWAITING_REPLY,
    WAITING_ON_CUSTOMER: LIFECYCLE_STATES.AWAITING_REPLY,
    FOLLOW_UP_PENDING: LIFECYCLE_STATES.FOLLOW_UP_PENDING,
    FOLLOWUP_PENDING: LIFECYCLE_STATES.FOLLOW_UP_PENDING,
    FOLLOW_UP_SCHEDULED: LIFECYCLE_STATES.FOLLOW_UP_PENDING,
    DORMANT: LIFECYCLE_STATES.DORMANT,
    HANDLED: LIFECYCLE_STATES.HANDLED,
    CLOSED: LIFECYCLE_STATES.HANDLED,
    ARCHIVED: LIFECYCLE_STATES.ARCHIVED,
  };

  return aliases[normalized] || LIFECYCLE_STATES.NEW;
}

function inferDaysSinceLastInteraction(lastInteractionDate = '', nowMs = Date.now()) {
  const iso = toIso(lastInteractionDate);
  if (!iso) return null;
  const interactionMs = Date.parse(iso);
  if (!Number.isFinite(interactionMs)) return null;
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (safeNowMs < interactionMs) return 0;
  return Math.floor((safeNowMs - interactionMs) / (24 * 60 * 60 * 1000));
}

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

function resolveFollowUpWindowHours(intent = 'unclear', fallback = 72) {
  const normalized = normalizeIntent(intent);
  const map = {
    complaint: 48,
    anxiety_pre_op: 48,
    follow_up: 48,
    booking_request: 72,
    pricing_question: 72,
    cancellation: 72,
    unclear: 72,
  };
  return clamp(map[normalized], 24, 168, fallback);
}

function toLifecycleSortRank(value = '') {
  const normalized = normalizeLifecycleStatus(value);
  return Number(STATE_RANK[normalized] || STATE_RANK[LIFECYCLE_STATES.HANDLED]);
}

function evaluateLifecycleStatus(input = {}, options = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const manualOverride = normalizeText(options?.manualOverride || safeInput.manualOverride);
  if (manualOverride) {
    return {
      lifecycleStatus: normalizeLifecycleStatus(manualOverride),
      source: 'manual',
      previousState: normalizeLifecycleStatus(safeInput.previousState || safeInput.lifecycleStatus),
      daysSinceLastInteraction: inferDaysSinceLastInteraction(
        safeInput.lastInteractionDate || safeInput.lastInboundAt || safeInput.lastOutboundAt,
        safeInput.nowMs
      ),
      transition: null,
      sortRank: toLifecycleSortRank(manualOverride),
    };
  }

  const nowMs = Number.isFinite(Number(safeInput.nowMs))
    ? Number(safeInput.nowMs)
    : Date.now();
  const previousState = normalizeLifecycleStatus(
    safeInput.previousState || safeInput.lifecycleStatus
  );
  const inboundMs = toTimestampMs(safeInput.lastInboundAt);
  const outboundMs = toTimestampMs(safeInput.lastOutboundAt);
  const lastInteractionMs = [inboundMs, outboundMs].filter(Number.isFinite).sort((a, b) => b - a)[0] ?? null;
  const lastInteractionIso =
    (Number.isFinite(lastInteractionMs) ? new Date(lastInteractionMs).toISOString() : '') ||
    toIso(safeInput.lastInteractionDate);

  const daysSinceLastInteraction = inferDaysSinceLastInteraction(lastInteractionIso, nowMs);
  const dormantDaysThreshold = clamp(safeInput.dormantDaysThreshold, 7, 365, 30);
  const archiveDaysThreshold = clamp(safeInput.archiveDaysThreshold, 60, 3650, 90);
  const microThreadWindowMinutes = clamp(
    safeInput.microThreadWindowMinutes,
    15,
    30,
    20
  );

  const interactionCount = Math.max(0, Math.round(clamp(safeInput.interactionCount, 0, 5000, 0)));
  const needsReplyStatus = normalizeText(safeInput.needsReplyStatus).toLowerCase();
  const statusHint = normalizeText(safeInput.status).toLowerCase();
  const slaStatus = normalizeText(safeInput.slaStatus).toLowerCase();
  const isArchivedHint =
    safeInput.archived === true || statusHint === 'archived' || statusHint === 'archive';
  const isHandledHint =
    needsReplyStatus === 'handled' ||
    safeInput.handled === true ||
    statusHint === 'handled' ||
    statusHint === 'closed' ||
    statusHint === 'resolved';

  const hasInbound = Number.isFinite(inboundMs);
  const hasOutbound = Number.isFinite(outboundMs);
  const unanswered = hasInbound && (!hasOutbound || outboundMs < inboundMs);
  const replied = hasOutbound && (!hasInbound || outboundMs >= inboundMs);
  const exchangeGapMinutes =
    hasInbound && hasOutbound
      ? Math.abs(outboundMs - inboundMs) / (60 * 1000)
      : Number.POSITIVE_INFINITY;
  const minutesSinceLastActivity =
    Number.isFinite(lastInteractionMs) && nowMs >= lastInteractionMs
      ? (nowMs - lastInteractionMs) / (60 * 1000)
      : Number.POSITIVE_INFINITY;

  const followUpWindowHours = resolveFollowUpWindowHours(
    safeInput.intent,
    safeInput.followUpWindowHours
  );
  const hoursSinceInbound = Math.max(0, toNumber(safeInput.hoursSinceInbound, 0));
  const followUpDueByInactivity = unanswered && hoursSinceInbound >= followUpWindowHours;
  const followUpHint = safeInput.followUpSuggested === true;

  let lifecycleStatus = LIFECYCLE_STATES.NEW;

  if (isArchivedHint || (daysSinceLastInteraction !== null && daysSinceLastInteraction >= archiveDaysThreshold)) {
    lifecycleStatus = LIFECYCLE_STATES.ARCHIVED;
  } else if (isHandledHint) {
    lifecycleStatus = LIFECYCLE_STATES.HANDLED;
  } else if (daysSinceLastInteraction !== null && daysSinceLastInteraction >= dormantDaysThreshold) {
    lifecycleStatus = LIFECYCLE_STATES.DORMANT;
  } else if (followUpHint || slaStatus === 'breach' || followUpDueByInactivity) {
    lifecycleStatus = LIFECYCLE_STATES.FOLLOW_UP_PENDING;
  } else if (
    hasInbound &&
    hasOutbound &&
    exchangeGapMinutes <= microThreadWindowMinutes &&
    minutesSinceLastActivity <= microThreadWindowMinutes
  ) {
    lifecycleStatus = LIFECYCLE_STATES.ACTIVE_DIALOGUE;
  } else if (replied) {
    lifecycleStatus = LIFECYCLE_STATES.AWAITING_REPLY;
  } else if (
    !hasOutbound &&
    (interactionCount <= 1 || (daysSinceLastInteraction !== null && daysSinceLastInteraction >= dormantDaysThreshold))
  ) {
    lifecycleStatus = LIFECYCLE_STATES.NEW;
  } else if (unanswered) {
    lifecycleStatus = LIFECYCLE_STATES.ACTIVE_DIALOGUE;
  }

  const transition =
    previousState && previousState !== lifecycleStatus
      ? {
          from: previousState,
          to: lifecycleStatus,
        }
      : null;

  return {
    lifecycleStatus,
    source: 'auto',
    previousState,
    daysSinceLastInteraction,
    transition,
    sortRank: toLifecycleSortRank(lifecycleStatus),
  };
}

module.exports = {
  LIFECYCLE_STATES,
  STATE_SORT_ORDER,
  evaluateLifecycleStatus,
  normalizeLifecycleStatus,
  resolveFollowUpWindowHours,
  toLifecycleSortRank,
};
