'use strict';

const DEFAULT_MAX_BOOKING_DAYS_AHEAD = 180;
const DEFAULT_MIN_NOTICE_ONLINE_MINUTES = 120;
const DEFAULT_MIN_NOTICE_PHYSICAL_MINUTES = 60;
const DEFAULT_CANCELLATION_POLICY_HOURS = 24;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function resolveServiceBookingPolicy(service = {}) {
  const meetingMode = normalizeKey(service.meetingMode);
  const defaultNotice =
    meetingMode === 'online'
      ? DEFAULT_MIN_NOTICE_ONLINE_MINUTES
      : DEFAULT_MIN_NOTICE_PHYSICAL_MINUTES;
  const minNoticeMinutes = Math.max(
    0,
    Number(service.minNoticeMinutes ?? service.minNotice ?? defaultNotice) || defaultNotice
  );
  const maxBookingDaysAhead = Math.max(
    1,
    Number(service.maxBookingDaysAhead ?? service.maxDaysAhead ?? DEFAULT_MAX_BOOKING_DAYS_AHEAD) ||
      DEFAULT_MAX_BOOKING_DAYS_AHEAD
  );
  const cancellationPolicyHours = Math.max(
    0,
    Number(
      service.cancellationPolicyHours ??
        service.cancellationHours ??
        DEFAULT_CANCELLATION_POLICY_HOURS
    ) || DEFAULT_CANCELLATION_POLICY_HOURS
  );
  return { minNoticeMinutes, maxBookingDaysAhead, cancellationPolicyHours };
}

function applyBookingPolicyToService(service = {}) {
  const policy = resolveServiceBookingPolicy(service);
  return {
    ...service,
    minNoticeMinutes: policy.minNoticeMinutes,
    maxBookingDaysAhead: policy.maxBookingDaysAhead,
    cancellationPolicyHours: policy.cancellationPolicyHours,
  };
}

function capAvailabilityToDate(toDate, maxDaysAhead = DEFAULT_MAX_BOOKING_DAYS_AHEAD, nowMs = Date.now()) {
  const raw = normalizeText(toDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const maxDate = new Date(nowMs + maxDaysAhead * 24 * 60 * 60 * 1000);
  const maxIso = maxDate.toISOString().slice(0, 10);
  return raw > maxIso ? maxIso : raw;
}

function isSlotWithinBookingPolicy(slot = {}, service = {}, nowMs = Date.now()) {
  const startsAtMs = Date.parse(normalizeText(slot.startsAt));
  if (!Number.isFinite(startsAtMs)) return false;
  const policy = resolveServiceBookingPolicy(service);
  const minStartMs = nowMs + policy.minNoticeMinutes * 60 * 1000;
  const maxStartMs = nowMs + policy.maxBookingDaysAhead * 24 * 60 * 60 * 1000;
  return startsAtMs >= minStartMs && startsAtMs <= maxStartMs;
}

function assertCancellationAllowed(booking = {}, service = {}, nowMs = Date.now()) {
  const startsAtMs = Date.parse(normalizeText(booking?.slot?.startsAt || booking?.startsAt));
  if (!Number.isFinite(startsAtMs)) return { allowed: true };
  const policy = resolveServiceBookingPolicy(service);
  const hoursUntil = (startsAtMs - nowMs) / (60 * 60 * 1000);
  if (hoursUntil >= policy.cancellationPolicyHours) {
    return { allowed: true, hoursUntil, policyHours: policy.cancellationPolicyHours };
  }
  return {
    allowed: false,
    hoursUntil,
    policyHours: policy.cancellationPolicyHours,
    reason: `Avbokning kräver minst ${policy.cancellationPolicyHours} timmar före besök.`,
  };
}

module.exports = {
  DEFAULT_CANCELLATION_POLICY_HOURS,
  DEFAULT_MAX_BOOKING_DAYS_AHEAD,
  DEFAULT_MIN_NOTICE_ONLINE_MINUTES,
  DEFAULT_MIN_NOTICE_PHYSICAL_MINUTES,
  applyBookingPolicyToService,
  assertCancellationAllowed,
  capAvailabilityToDate,
  isSlotWithinBookingPolicy,
  resolveServiceBookingPolicy,
};
