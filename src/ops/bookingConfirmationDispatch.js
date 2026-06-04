'use strict';

/**
 * Booking Confirmation Dispatch — Fas 2 Block 1.
 *
 * Skickar bekräftelse-mail + skapar Outlook-kalenderhändelse vid booking confirm.
 * Kallas efter bookingEngineStore.confirmBooking().
 */

const { buildBookingConfirmationEmail } = require('../templates/bookingConfirmationEmail');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

async function dispatchBookingConfirmation({ booking, customerEmail, customerName, graphSendConnector, bookingEngineStore, tenantId }) {
  const results = { email: null, calendarEvent: null };

  if (!booking || !customerEmail) return results;

  const startsAt = normalizeText(booking.slot?.startsAt || booking.slot?.start || booking.startsAt);
  const serviceLabel = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || '');
  const resourceLabel = normalizeText(booking.resourceLabel || booking.slot?.resourceLabel || '');
  const locationLabel = normalizeText(booking.locationLabel || booking.slot?.locationLabel || 'Hair TP Clinic');
  const durationMinutes = Number(booking.slot?.durationMinutes || booking.durationMinutes) || 60;

  // 1. Bekräftelse-mail
  try {
    const email = buildBookingConfirmationEmail({
      customerName,
      serviceLabel,
      slotStart: startsAt,
      resourceLabel,
      locationLabel,
      durationMinutes,
      locale: 'sv',
    });

    if (graphSendConnector?.sendMail) {
      const mailResult = await graphSendConnector.sendMail({
        to: customerEmail,
        subject: email.subject,
        html: email.html,
        attachments: email.ics ? [{
          name: 'bokning.ics',
          contentType: 'text/calendar',
          content: Buffer.from(email.ics).toString('base64'),
        }] : [],
      });
      results.email = { ok: true, messageId: mailResult?.messageId, sentAt: nowIso() };
    }
  } catch (err) {
    results.email = { ok: false, error: err.message };
  }

  // 2. Outlook-kalenderhändelse
  try {
    if (graphSendConnector?.createCalendarEvent) {
      const event = await graphSendConnector.createCalendarEvent({
        subject: `${serviceLabel || 'Besök'} — ${customerName || 'Patient'}`,
        start: startsAt,
        durationMinutes,
        location: locationLabel,
        body: `Bokning bekräftad.\n${serviceLabel}\n${resourceLabel}\n${customerName}`,
        attendees: customerEmail ? [customerEmail] : [],
      });
      results.calendarEvent = { ok: true, eventId: event?.id || event?.eventId, createdAt: nowIso() };

      // Spara calendarEventId på bokningen för senare borttagning vid avbokning
      if (event?.id && bookingEngineStore?.patchBookingMetadata) {
        await bookingEngineStore.patchBookingMetadata(booking.bookingId, {
          calendarEventId: event.id,
        });
      }
    }
  } catch (err) {
    results.calendarEvent = { ok: false, error: err.message };
  }

  return results;
}

module.exports = { dispatchBookingConfirmation };
