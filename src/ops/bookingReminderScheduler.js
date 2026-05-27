'use strict';

/**
 * Booking Reminder Scheduler — Fas 2 Block 4.
 *
 * Skickar påminnelse-mejl:
 * - 72h före besök
 * - 24h före besök
 *
 * Dedup via `reminders` fält på bokningen: { '72h': sentAtIso|null, '24h': sentAtIso|null }
 * Kör som scheduler-job var 30:e minut.
 */

const { buildBookingReminderEmail } = require('../templates/bookingReminderEmail');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

async function runBookingReminders({ bookingEngineStore, graphSendConnector, config = {} }) {
  const results = { checked: 0, sent72h: 0, sent24h: 0, skipped: 0, errors: [] };

  if (!bookingEngineStore?._state?.bookings) return results;

  const now = Date.now();
  const bookings = bookingEngineStore._state.bookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'active'
  );

  for (const booking of bookings) {
    results.checked++;
    const startsAt = normalizeText(booking.slot?.startsAt || booking.startsAt);
    if (!startsAt) { results.skipped++; continue; }

    const startMs = Date.parse(startsAt);
    if (!Number.isFinite(startMs) || startMs < now) { results.skipped++; continue; }

    const hoursUntil = (startMs - now) / 3600000;
    const customerEmail = normalizeText(booking.customerEmail || booking.contact?.email);
    const customerName = normalizeText(booking.customerName || booking.contact?.name);
    if (!customerEmail) { results.skipped++; continue; }

    if (!booking.reminders) booking.reminders = {};

    // 72h reminder
    if (hoursUntil <= 72 && hoursUntil > 24 && !booking.reminders['72h']) {
      try {
        const email = buildBookingReminderEmail({
          customerName,
          serviceLabel: booking.serviceLabel || booking.slot?.serviceLabel || '',
          startsAt,
          leadTimeHours: 72,
          locale: 'sv',
        });
        if (graphSendConnector?.sendMail) {
          await graphSendConnector.sendMail({
            to: customerEmail,
            subject: email.subject,
            html: email.html,
            attachments: email.ics ? [{ name: 'paminnelse.ics', contentType: 'text/calendar', content: Buffer.from(email.ics).toString('base64') }] : [],
          });
          booking.reminders['72h'] = nowIso();
          results.sent72h++;
        }
      } catch (err) {
        results.errors.push({ bookingId: booking.bookingId, type: '72h', error: err.message });
      }
    }

    // 24h reminder
    if (hoursUntil <= 24 && hoursUntil > 0 && !booking.reminders['24h']) {
      try {
        const email = buildBookingReminderEmail({
          customerName,
          serviceLabel: booking.serviceLabel || booking.slot?.serviceLabel || '',
          startsAt,
          leadTimeHours: 24,
          locale: 'sv',
        });
        if (graphSendConnector?.sendMail) {
          await graphSendConnector.sendMail({
            to: customerEmail,
            subject: email.subject,
            html: email.html,
            attachments: email.ics ? [{ name: 'paminnelse.ics', contentType: 'text/calendar', content: Buffer.from(email.ics).toString('base64') }] : [],
          });
          booking.reminders['24h'] = nowIso();
          results.sent24h++;
        }
      } catch (err) {
        results.errors.push({ bookingId: booking.bookingId, type: '24h', error: err.message });
      }
    }
  }

  // Persist reminder state
  if ((results.sent72h > 0 || results.sent24h > 0) && bookingEngineStore?.save) {
    await bookingEngineStore.save();
  }

  return results;
}

module.exports = { runBookingReminders };
