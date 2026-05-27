'use strict';

/**
 * iCal Export — genererar .ics-kalender per behandlare.
 *
 * Används för:
 * - Synka behandlarens schema till Google Calendar / Apple Calendar / Outlook
 * - Skriv ut veckoschema
 * - Dela schema med extern partner
 */

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }

function formatIcsDate(isoDate) {
  return isoDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z';
}

function escapeIcs(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildIcalFeed({ resourceLabel, bookings, clinicName = 'Hair TP Clinic', prodId = '-//Arcana//CCO Calendar//SV' }) {
  const events = bookings.map((booking) => {
    const uid = `booking-${booking.bookingId || booking.id}@arcana.hairtpclinic.se`;
    const start = normalizeText(booking.slot?.startsAt || booking.startsAt);
    const durationMin = Number(booking.slot?.durationMinutes || booking.durationMinutes) || 60;
    const endDate = new Date(new Date(start).getTime() + durationMin * 60000);
    const summary = normalizeText(booking.serviceLabel || booking.slot?.serviceLabel || 'Bokning');
    const customer = normalizeText(booking.customerName || booking.contact?.name || '');
    const location = normalizeText(booking.locationLabel || booking.slot?.locationLabel || clinicName);
    const status = normalizeText(booking.status || 'confirmed').toUpperCase();

    return [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(endDate.toISOString())}`,
      `SUMMARY:${escapeIcs(summary)}${customer ? ' — ' + escapeIcs(customer) : ''}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(`${summary}\\nPatient: ${customer}\\nBehandlare: ${resourceLabel}\\nStatus: ${status}`)}`,
      `STATUS:${status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`,
      `ORGANIZER;CN=${escapeIcs(clinicName)}:mailto:contact@hairtpclinic.com`,
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(resourceLabel)} — ${escapeIcs(clinicName)}`,
    `X-WR-TIMEZONE:Europe/Stockholm`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function getBookingsForResource(bookingEngineStore, resourceId, { days = 30 } = {}) {
  if (!bookingEngineStore?._state?.bookings) return [];
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 86400000);
  return bookingEngineStore._state.bookings.filter((b) => {
    if (b.status === 'cancelled') return false;
    const rid = normalizeText(b.resourceId || b.slot?.resourceId);
    if (resourceId !== 'all' && rid !== resourceId) return false;
    const start = normalizeText(b.slot?.startsAt || b.startsAt);
    if (!start) return false;
    const d = new Date(start);
    return d >= now && d <= cutoff;
  });
}

module.exports = { buildIcalFeed, getBookingsForResource, formatIcsDate, escapeIcs };
