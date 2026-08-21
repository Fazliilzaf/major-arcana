'use strict';

const { klinikTidTillUtc } = require('../../src/ops/klinikTid');

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

/**
 * Bygger samma tidpunkt som bokningsmotorn gör av en regels starttid.
 *
 * Hjälparen klistrade tidigare på ett 'Z' och behandlade alltså klockslaget
 * som UTC — precis som motorn gjorde innan tidszonsfixen. Så länge båda hade
 * samma fel matchade de varandra, och ett test som byggde en krockande tid
 * kunde inte se skillnaden. När motorn rättades slutade hjälparens tider
 * överlappa motorns, och överlappstestet blev grönt av fel skäl.
 *
 * Nu går båda genom samma översättning.
 */
function slotStartsAt(dateOnly, timeLabel) {
  return klinikTidTillUtc(dateOnly, timeLabel);
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
