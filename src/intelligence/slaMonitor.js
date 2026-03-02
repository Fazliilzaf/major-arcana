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
  holidays: Object.freeze([]),
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

function normalizeHolidayDateKey(value = '') {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatUtcDateKey(year, monthIndex, day) {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computeEasterUtcDate(year) {
  const y = Math.max(1900, Math.min(2500, Number(year) || 2000));
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

function addUtcDays(date, days) {
  const safeDate = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(
    safeDate.getUTCFullYear(),
    safeDate.getUTCMonth(),
    safeDate.getUTCDate() + Number(days || 0)
  ));
}

function findWeekdayInRangeUtc({ year, monthIndex, fromDay, toDay, weekday }) {
  for (let day = fromDay; day <= toDay; day += 1) {
    const date = new Date(Date.UTC(year, monthIndex, day));
    if (date.getUTCDay() === weekday) return date;
  }
  return null;
}

function buildSwedishHolidayDateKeys(year) {
  const y = Math.max(1900, Math.min(2500, Number(year) || 2000));
  const easter = computeEasterUtcDate(y);
  const midsummerEve = findWeekdayInRangeUtc({
    year: y,
    monthIndex: 5,
    fromDay: 19,
    toDay: 25,
    weekday: 5,
  });
  const allSaintsDay = findWeekdayInRangeUtc({
    year: y,
    monthIndex: 9,
    fromDay: 31,
    toDay: 31,
    weekday: 6,
  }) ||
    findWeekdayInRangeUtc({
      year: y,
      monthIndex: 10,
      fromDay: 1,
      toDay: 6,
      weekday: 6,
    });

  const keys = [
    formatUtcDateKey(y, 0, 1), // New Year's Day
    formatUtcDateKey(y, 0, 6), // Epiphany
    normalizeHolidayDateKey(addUtcDays(easter, -2).toISOString()), // Good Friday
    normalizeHolidayDateKey(addUtcDays(easter, 1).toISOString()), // Easter Monday
    formatUtcDateKey(y, 4, 1), // May Day
    normalizeHolidayDateKey(addUtcDays(easter, 39).toISOString()), // Ascension
    formatUtcDateKey(y, 5, 6), // National Day
    midsummerEve ? normalizeHolidayDateKey(midsummerEve.toISOString()) : '',
    allSaintsDay ? normalizeHolidayDateKey(allSaintsDay.toISOString()) : '',
    formatUtcDateKey(y, 11, 24), // Christmas Eve
    formatUtcDateKey(y, 11, 25), // Christmas Day
    formatUtcDateKey(y, 11, 26), // Boxing Day
    formatUtcDateKey(y, 11, 31), // New Year's Eve
  ].filter(Boolean);

  return Array.from(new Set(keys));
}

function normalizeOpeningHours(value = null) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.holidaySet instanceof Set &&
    value.windows &&
    typeof value.windows === 'object'
  ) {
    const timezone = normalizeText(value.timezone || value.tz) || DEFAULT_OPENING_HOURS.timezone;
    const windows = {};
    for (let day = 0; day <= 6; day += 1) {
      windows[day] = dayWindowOrNull(value.windows[day]);
    }
    const holidays = Array.isArray(value.holidays)
      ? value.holidays
          .map((item) => normalizeHolidayDateKey(item))
          .filter(Boolean)
      : Array.from(value.holidaySet.values())
          .map((item) => normalizeHolidayDateKey(item))
          .filter(Boolean);
    const uniqueHolidays = Array.from(new Set(holidays));
    return {
      timezone,
      windows,
      holidays: uniqueHolidays,
      holidaySet: new Set(uniqueHolidays),
    };
  }

  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const timezone =
    normalizeText(source.timezone || source.tz) || DEFAULT_OPENING_HOURS.timezone;
  const holidayRegion = normalizeText(source.holidayRegion || source.countryCode || 'SE')
    .toUpperCase();
  const includeDefaultHolidays = source.includeDefaultHolidays !== false;
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

  const holidaysSource = Array.isArray(source.holidays)
    ? source.holidays
    : Array.isArray(source.closedDates)
      ? source.closedDates
      : [];
  const explicitHolidays = holidaysSource
    .map((item) => {
      if (typeof item === 'string') return normalizeHolidayDateKey(item);
      if (item && typeof item === 'object') {
        return normalizeHolidayDateKey(item.date || item.day || '');
      }
      return '';
    })
    .filter(Boolean);
  const holidayYearsRaw = Array.isArray(source.holidayYears)
    ? source.holidayYears
    : [];
  const nowYear = new Date().getUTCFullYear();
  const holidayYears = (holidayYearsRaw.length
    ? holidayYearsRaw
    : [nowYear - 1, nowYear, nowYear + 1]
  )
    .map((item) => Number.parseInt(String(item), 10))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(1900, Math.min(2500, item)));

  const generatedHolidays = includeDefaultHolidays && holidayRegion === 'SE'
    ? Array.from(
        new Set(
          holidayYears.flatMap((year) => buildSwedishHolidayDateKeys(year))
        )
      )
    : [];

  const uniqueHolidays = Array.from(new Set([...generatedHolidays, ...explicitHolidays]));

  return {
    timezone,
    windows,
    holidays: uniqueHolidays,
    holidaySet: new Set(uniqueHolidays),
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

function toUtcDateKeyFromDayStart(dayStartMs) {
  if (!Number.isFinite(dayStartMs)) return '';
  const date = new Date(dayStartMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isHolidayDay(dayStartMs, openingHours) {
  const safeOpeningHours = normalizeOpeningHours(openingHours);
  if (!safeOpeningHours.holidaySet || safeOpeningHours.holidaySet.size === 0) return false;
  const dateKey = toUtcDateKeyFromDayStart(dayStartMs);
  if (!dateKey) return false;
  return safeOpeningHours.holidaySet.has(dateKey);
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
      if (window && !isHolidayDay(dayCursorMs, safeOpeningHours)) {
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
  const dayStartMs = startOfUtcDayMs(timestampMs);
  if (isHolidayDay(dayStartMs, safeOpeningHours)) return false;
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
