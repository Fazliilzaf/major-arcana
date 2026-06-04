'use strict';

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function nextBookableWeekday(weekday, { minDaysAhead = 2 } = {}) {
  let cursor = addUtcDays(new Date(), minDaysAhead);
  for (let i = 0; i < 21; i += 1) {
    if (cursor.getUTCDay() === weekday) {
      return toDateOnly(cursor);
    }
    cursor = addUtcDays(cursor, 1);
  }
  throw new Error(`Could not find weekday ${weekday} within 21 days.`);
}

function slotStartsAt(dateOnly, timeLabel) {
  return `${dateOnly}T${timeLabel}:00.000Z`;
}

function buildSlotId({ resourceId, serviceId, startsAt }) {
  return `${resourceId}::${serviceId}::${startsAt}`;
}

function bookingMondayWindow({ minDaysAhead = 2 } = {}) {
  const fromDate = nextBookableWeekday(1, { minDaysAhead });
  return { fromDate, toDate: fromDate };
}

module.exports = {
  addUtcDays,
  bookingMondayWindow,
  buildSlotId,
  nextBookableWeekday,
  slotStartsAt,
  toDateOnly,
};
