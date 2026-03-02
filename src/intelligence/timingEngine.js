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

function parseDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function isWeekendUtc(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isSundayUtc(date) {
  return date.getUTCDay() === 0;
}

function setUtcTime(date, hour, minute) {
  const next = new Date(date.getTime());
  next.setUTCHours(hour, minute, 0, 0);
  return next;
}

function addDaysUtc(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + Math.max(0, Math.round(days)));
  return next;
}

function nextAllowedWeekday(date) {
  let cursor = new Date(date.getTime());
  while (isWeekendUtc(cursor)) {
    cursor = addDaysUtc(cursor, 1);
  }
  return cursor;
}

function applyWeekdayWindow(date) {
  const day = date.getUTCDay();
  if (day >= 2 && day <= 4) return setUtcTime(date, 10, 30);
  return setUtcTime(date, 13, 30);
}

function normalizeIntent(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  const allowed = new Set([
    'booking_request',
    'pricing_question',
    'anxiety_pre_op',
    'complaint',
    'cancellation',
    'follow_up',
    'unclear',
  ]);
  return allowed.has(normalized) ? normalized : 'unclear';
}

function normalizeTone(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || 'neutral';
}

function normalizeTempo(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['responsive', 'reflective', 'hesitant', 'low_engagement'].includes(normalized)) {
    return normalized;
  }
  return 'reflective';
}

function normalizeBusinessHours(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const startHour = clamp(source.startHour, 6, 12, 8);
  const endHour = clamp(source.endHour, 14, 22, 19.5);
  return {
    startHour,
    endHour,
  };
}

function clampToBusinessWindowUtc(date, businessHours) {
  const startHour = businessHours.startHour;
  const endHour = businessHours.endHour;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  if (hours < startHour) {
    const floorHour = Math.floor(startHour);
    const floorMinute = Math.round((startHour - floorHour) * 60);
    return setUtcTime(date, floorHour, floorMinute);
  }
  if (hours > endHour) {
    const next = addDaysUtc(date, 1);
    const floorHour = Math.floor(startHour);
    const floorMinute = Math.round((startHour - floorHour) * 60);
    return setUtcTime(next, floorHour, floorMinute);
  }
  return date;
}

function suggestFollowUpTiming(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const now = parseDate(safeInput.currentTimestamp);
  const intent = normalizeIntent(safeInput.intent);
  const tone = normalizeTone(safeInput.tone);
  const tempoProfile = normalizeTempo(safeInput.tempoProfile);
  const warmthScore = clamp(safeInput.warmthScore, 0, 1, 0.4);
  const businessHours = normalizeBusinessHours(safeInput.tenantBusinessHours);
  const timezone = normalizeText(safeInput.timezone) || 'Europe/Stockholm';
  const reasons = [];

  let candidate = new Date(now.getTime());
  let urgencyLevel = 'normal';
  let intentAdjusted = false;
  let delayDays = Math.max(0, Math.round(toNumber(safeInput.recommendedFollowUpDelayDays, 5)));
  let preserveIntentWindow = false;

  if (intent === 'complaint') {
    const delayHours = clamp(safeInput.delayHours, 0, 4, 2);
    candidate = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
    urgencyLevel = 'high';
    intentAdjusted = true;
    reasons.push('complaint_same_day');
  } else if (intent === 'anxiety_pre_op') {
    candidate = setUtcTime(candidate, 17, 30);
    if (candidate.getTime() < now.getTime()) {
      candidate = addDaysUtc(candidate, 1);
    }
    delayDays = 0;
    urgencyLevel = 'high';
    intentAdjusted = true;
    preserveIntentWindow = true;
    reasons.push('anxiety_evening_window');
  } else if (intent === 'booking_request') {
    delayDays = 1;
    urgencyLevel = warmthScore >= 0.65 ? 'high' : 'normal';
    intentAdjusted = true;
    reasons.push('booking_next_weekday');
  } else if (intent === 'pricing_question') {
    delayDays = 2;
    intentAdjusted = true;
    reasons.push('pricing_2_3_days');
  } else if (intent === 'cancellation') {
    delayDays = 1;
    urgencyLevel = 'normal';
    intentAdjusted = true;
    reasons.push('cancellation_next_day');
  }

  if (intent === 'complaint') {
    candidate = clampToBusinessWindowUtc(candidate, businessHours);
    reasons.push('same_day_complaint_window');
  } else if (preserveIntentWindow === true) {
    candidate = nextAllowedWeekday(candidate);
    const timeHours = candidate.getUTCHours() + candidate.getUTCMinutes() / 60;
    if (timeHours < 16) {
      candidate = setUtcTime(candidate, 16, 0);
    } else if (timeHours > 18.5) {
      candidate = addDaysUtc(candidate, 1);
      candidate = nextAllowedWeekday(candidate);
      candidate = setUtcTime(candidate, 17, 30);
    }
    reasons.push('weekday_window');
  } else {
    candidate = addDaysUtc(now, delayDays);
    candidate = nextAllowedWeekday(candidate);
    candidate = applyWeekdayWindow(candidate);
    if (isSundayUtc(candidate)) {
      candidate = addDaysUtc(candidate, 1);
      candidate = applyWeekdayWindow(candidate);
      reasons.push('sunday_blocked');
    }
    reasons.push('weekday_window');
  }

  if (intent !== 'complaint') {
    candidate = clampToBusinessWindowUtc(candidate, businessHours);
    candidate = nextAllowedWeekday(candidate);
  }

  if (tempoProfile === 'responsive' && intent !== 'complaint') {
    urgencyLevel = urgencyLevel === 'high' ? 'high' : 'normal';
    reasons.push('tempo_responsive');
  } else if (tempoProfile === 'low_engagement') {
    urgencyLevel = urgencyLevel === 'high' ? 'high' : 'low';
    reasons.push('tempo_low_engagement');
  } else if (tempoProfile === 'hesitant' || tone === 'anxious') {
    urgencyLevel = urgencyLevel === 'high' ? 'high' : 'normal';
    reasons.push('tempo_hesitant');
  }

  return {
    suggestedDateTime: candidate.toISOString(),
    urgencyLevel,
    reasoning: reasons.slice(0, 6),
    reason: reasons[0] || 'weekday_window',
    intentAdjusted,
    timezone,
    manualApprovalRequired: true,
  };
}

module.exports = {
  suggestFollowUpTiming,
};
