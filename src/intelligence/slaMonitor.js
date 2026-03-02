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

const DEFAULT_SLA_THRESHOLDS_HOURS = Object.freeze({
  Critical: 4,
  High: 12,
  Medium: 24,
  Low: 48,
});

const DEFAULT_UNANSWERED_THRESHOLDS_HOURS = Object.freeze({
  complaint: 6,
  booking_request: 12,
  pricing_question: 24,
  default: 24,
});

const DEFAULT_OPENING_HOURS = Object.freeze({
  timezone: 'Europe/Stockholm',
  windows: Object.freeze({
    0: null,
    1: Object.freeze({ startMinutes: 8 * 60, endMinutes: 20 * 60 }),
    2: Object.freeze({ startMinutes: 8 * 60, endMinutes: 20 * 60 }),
    3: Object.freeze({ startMinutes: 8 * 60, endMinutes: 20 * 60 }),
    4: Object.freeze({ startMinutes: 8 * 60, endMinutes: 20 * 60 }),
    5: Object.freeze({ startMinutes: 8 * 60, endMinutes: 20 * 60 }),
    6: Object.freeze({ startMinutes: 8 * 60, endMinutes: 18 * 60 }),
  }),
});

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
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

function dayWindowOrNull(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const startMinutes = clamp(value.startMinutes, 0, 1439, 8 * 60);
  const endMinutes = clamp(value.endMinutes, 1, 1440, 20 * 60);
  if (endMinutes <= startMinutes) return null;
  return {
    startMinutes,
    endMinutes,
  };
}

function normalizeOpeningHours(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const timezone =
    normalizeText(source.timezone || source.tz) || DEFAULT_OPENING_HOURS.timezone;
  const windowsSource =
    source.windows && typeof source.windows === 'object' && !Array.isArray(source.windows)
      ? source.windows
      : {};

  const hasExplicitWindows = Object.keys(windowsSource).length > 0;
  const defaultWeekdayStart = clamp(source.startHour, 6, 12, 8) * 60;
  const defaultWeekdayEnd = clamp(source.endHour, 14, 22, 20) * 60;
  const defaultSaturdayEnd = clamp(
    source.saturdayEndHour,
    12,
    22,
    18
  ) * 60;

  const windows = {};
  for (let day = 0; day <= 6; day += 1) {
    const explicit = dayWindowOrNull(windowsSource[day]);
    if (hasExplicitWindows) {
      windows[day] = explicit;
      continue;
    }
    if (day === 0) {
      windows[day] = null;
      continue;
    }
    if (day >= 1 && day <= 5) {
      windows[day] = {
        startMinutes: defaultWeekdayStart,
        endMinutes: defaultWeekdayEnd,
      };
      continue;
    }
    windows[day] = {
      startMinutes: defaultWeekdayStart,
      endMinutes: defaultSaturdayEnd,
    };
  }

  return {
    timezone,
    windows,
  };
}

function resolveSlaThreshold(priorityLevel = 'Low', overrides = null) {
  const level = normalizePriorityLevel(priorityLevel);
  const source =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      ? overrides
      : DEFAULT_SLA_THRESHOLDS_HOURS;
  const fallback = Number(DEFAULT_SLA_THRESHOLDS_HOURS[level] || 48);
  const candidate = Number(source[level]);
  return clamp(candidate, 1, 336, fallback);
}

function resolveUnansweredThreshold(intent = 'unclear', overrides = null) {
  const normalizedIntent = normalizeIntent(intent);
  const source =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      ? overrides
      : DEFAULT_UNANSWERED_THRESHOLDS_HOURS;
  const fallback = Number(DEFAULT_UNANSWERED_THRESHOLDS_HOURS.default || 24);
  const candidate = Number(source[normalizedIntent] ?? source.default);
  return clamp(candidate, 1, 336, fallback);
}

function roundHour(value = 0) {
  return Math.round(toNumber(value, 0) * 10) / 10;
}

function startOfUtcDayMs(timestampMs) {
  const date = new Date(timestampMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function computeOpenDurationMsBetween(startMs, endMs, openingHours) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  const safeOpeningHours = normalizeOpeningHours(openingHours);
  let total = 0;
  let dayCursorMs = startOfUtcDayMs(startMs);
  const oneDayMs = 24 * 60 * 60 * 1000;

  while (dayCursorMs < endMs) {
    const dayEndMs = dayCursorMs + oneDayMs;
    const intervalStart = Math.max(startMs, dayCursorMs);
    const intervalEnd = Math.min(endMs, dayEndMs);
    if (intervalEnd > intervalStart) {
      const dayIndex = new Date(dayCursorMs).getUTCDay();
      const window = safeOpeningHours.windows[dayIndex];
      if (window) {
        const windowStartMs = dayCursorMs + window.startMinutes * 60 * 1000;
        const windowEndMs = dayCursorMs + window.endMinutes * 60 * 1000;
        const openStart = Math.max(intervalStart, windowStartMs);
        const openEnd = Math.min(intervalEnd, windowEndMs);
        if (openEnd > openStart) {
          total += openEnd - openStart;
        }
      }
    }
    dayCursorMs = dayEndMs;
  }

  return total;
}

function isWithinOpeningHoursAt(timestampMs, openingHours) {
  if (!Number.isFinite(timestampMs)) return false;
  const safeOpeningHours = normalizeOpeningHours(openingHours);
  const date = new Date(timestampMs);
  const dayIndex = date.getUTCDay();
  const window = safeOpeningHours.windows[dayIndex];
  if (!window) return false;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return minutes >= window.startMinutes && minutes < window.endMinutes;
}

function computeBusinessHoursBetween(startMs, endMs, openingHours) {
  const elapsedMs = computeOpenDurationMsBetween(startMs, endMs, openingHours);
  return roundHour(elapsedMs / (60 * 60 * 1000));
}

function evaluateSlaStatus({
  hoursSinceInbound = 0,
  priorityLevel = 'Low',
  thresholds = null,
  answered = false,
} = {}) {
  const threshold = resolveSlaThreshold(priorityLevel, thresholds);
  const inboundHours = Math.max(0, toNumber(hoursSinceInbound, 0));
  const warningThreshold = threshold * 0.7;
  const hoursRemaining = roundHour(answered ? threshold : threshold - inboundHours);

  if (answered) {
    return {
      slaStatus: 'safe',
      hoursRemaining,
      slaThreshold: threshold,
    };
  }

  if (inboundHours >= threshold) {
    return {
      slaStatus: 'breach',
      hoursRemaining,
      slaThreshold: threshold,
    };
  }
  if (inboundHours >= warningThreshold) {
    return {
      slaStatus: 'warning',
      hoursRemaining,
      slaThreshold: threshold,
    };
  }
  return {
    slaStatus: 'safe',
    hoursRemaining,
    slaThreshold: threshold,
  };
}

function evaluateStagnation({
  hoursSinceInbound = 0,
  lastInboundAt = null,
  lastOutboundAt = null,
  priorityLevel = 'Low',
  thresholds = null,
  nowMs = Date.now(),
  openingHours = null,
  respectOpeningHours = true,
} = {}) {
  const threshold = resolveSlaThreshold(priorityLevel, thresholds);
  const safeNowMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const inboundMs = toTimestampMs(lastInboundAt);
  const outboundMs = toTimestampMs(lastOutboundAt);
  const safeOpeningHours = normalizeOpeningHours(openingHours);
  const hasOutbound = Number.isFinite(outboundMs);
  const hasInbound = Number.isFinite(inboundMs);
  const inboundHours = Math.max(0, toNumber(hoursSinceInbound, 0));

  const outboundAgeHours = (() => {
    if (!hasOutbound || safeNowMs < outboundMs) return 0;
    if (!respectOpeningHours) {
      return Math.max(0, (safeNowMs - outboundMs) / (60 * 60 * 1000));
    }
    return computeBusinessHoursBetween(outboundMs, safeNowMs, safeOpeningHours);
  })();

  const noInboundAfterOutbound =
    hasOutbound && (!hasInbound || inboundMs <= outboundMs);
  const outboundStagnated = noInboundAfterOutbound && outboundAgeHours >= threshold;

  const inboundAwaitingReply =
    hasInbound && (!hasOutbound || outboundMs < inboundMs);
  const inboundStagnated = inboundAwaitingReply && inboundHours >= threshold;

  const stagnated = outboundStagnated || inboundStagnated;
  const stagnationHours = roundHour(
    stagnated
      ? Math.max(outboundStagnated ? outboundAgeHours : 0, inboundStagnated ? inboundHours : 0)
      : 0
  );

  const withinOpeningHours = respectOpeningHours
    ? isWithinOpeningHoursAt(safeNowMs, safeOpeningHours)
    : true;
  const followUpSuggested = stagnated && withinOpeningHours;
  return {
    stagnated,
    stagnationHours,
    followUpSuggested,
    followUpDeferred: stagnated && !withinOpeningHours,
  };
}

function evaluateUnansweredStatus({
  hoursSinceInbound = 0,
  intent = 'unclear',
  needsReplyStatus = 'needs_reply',
  thresholds = null,
  answered = false,
} = {}) {
  const threshold = resolveUnansweredThreshold(intent, thresholds);
  const inboundHours = Math.max(0, toNumber(hoursSinceInbound, 0));
  const handled = normalizeText(needsReplyStatus).toLowerCase() === 'handled';
  return {
    unansweredThresholdHours: threshold,
    isUnanswered: handled || answered ? false : inboundHours >= threshold,
  };
}

function evaluateSlaMonitor(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const safeNowMs = Number.isFinite(Number(safeInput.nowMs))
    ? Number(safeInput.nowMs)
    : Date.now();
  const respectOpeningHours = safeInput.respectOpeningHours !== false;
  const openingHours = normalizeOpeningHours(
    safeInput.openingHours || safeInput.tenantBusinessHours
  );
  const inboundMs = toTimestampMs(safeInput.lastInboundAt);
  const outboundMs = toTimestampMs(safeInput.lastOutboundAt);
  const answered =
    Number.isFinite(inboundMs) &&
    Number.isFinite(outboundMs) &&
    outboundMs >= inboundMs;
  const effectiveInboundHours = (() => {
    if (!Number.isFinite(inboundMs)) {
      return Math.max(0, toNumber(safeInput.hoursSinceInbound, 0));
    }
    if (!respectOpeningHours) {
      const endMs = answered && Number.isFinite(outboundMs) ? outboundMs : safeNowMs;
      return Math.max(0, (endMs - inboundMs) / (60 * 60 * 1000));
    }
    return computeBusinessHoursBetween(
      inboundMs,
      answered && Number.isFinite(outboundMs) ? outboundMs : safeNowMs,
      openingHours
    );
  })();

  const sla = evaluateSlaStatus({
    hoursSinceInbound: effectiveInboundHours,
    priorityLevel: safeInput.priorityLevel,
    thresholds: safeInput.thresholds,
    answered,
  });
  const stagnation = evaluateStagnation({
    hoursSinceInbound: effectiveInboundHours,
    lastInboundAt: safeInput.lastInboundAt,
    lastOutboundAt: safeInput.lastOutboundAt,
    priorityLevel: safeInput.priorityLevel,
    thresholds: safeInput.thresholds,
    nowMs: safeNowMs,
    openingHours,
    respectOpeningHours,
  });
  const unanswered = evaluateUnansweredStatus({
    hoursSinceInbound: effectiveInboundHours,
    intent: safeInput.intent,
    needsReplyStatus: safeInput.needsReplyStatus,
    thresholds: safeInput.unansweredThresholds,
    answered,
  });
  return {
    hoursSinceInbound: effectiveInboundHours,
    withinOpeningHours: respectOpeningHours
      ? isWithinOpeningHoursAt(safeNowMs, openingHours)
      : true,
    openingHoursTimezone: openingHours.timezone,
    answered,
    ...sla,
    ...stagnation,
    ...unanswered,
  };
}

module.exports = {
  DEFAULT_OPENING_HOURS,
  DEFAULT_SLA_THRESHOLDS_HOURS,
  DEFAULT_UNANSWERED_THRESHOLDS_HOURS,
  computeBusinessHoursBetween,
  evaluateSlaMonitor,
  evaluateSlaStatus,
  evaluateStagnation,
  evaluateUnansweredStatus,
  normalizeOpeningHours,
  resolveUnansweredThreshold,
  resolveSlaThreshold,
};
