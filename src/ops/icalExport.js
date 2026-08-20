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
    // ORD-86: RÖR INTE .se HÄR. Det här är ingen länk — det är en iCal-UID.
    //
    // UID måste vara STABIL över tid. Kalenderklienter matchar uppdateringar mot
    // UID:n; ändras den ser Outlook/Google en HELT NY händelse i stället för en
    // uppdatering, och personalen får dubbletter i sina kalendrar för varje
    // bokning som redan är utskickad. Domändelen är bara en namnrymd och behöver
    // inte peka på något som svarar.
    //
    // En sweep som byter alla .se till .com måste hoppa över den här raden.
    // tests/ops/icalUidStability.test.js håller emot.
    const uid = `booking-${booking.bookingId || booking.id}@arcana.hairtpclinic.se`;
    const start = normalizeText(booking.slot?.startsAt || booking.startsAt);
    const durationMin = Number(booking.slot?.durationMinutes || booking.durationMinutes) || 60;
    const explicitEnd = normalizeText(booking.slot?.endsAt || booking.endsAt);
    const endDate = Number.isFinite(Date.parse(explicitEnd))
      ? new Date(explicitEnd)
      : new Date(new Date(start).getTime() + durationMin * 60000);
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

function getBookingsForResource(
  bookingEngineStore,
  resourceId,
  { days = 30, tenantId = '', clientoBookingStore = null } = {}
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 86400000);
  const scopedTenantId = normalizeText(tenantId);
  const engineBookings =
    typeof bookingEngineStore?.listBookingsForEnrichment === 'function'
      ? bookingEngineStore.listBookingsForEnrichment(scopedTenantId, { excludeTestData: true })
      : (bookingEngineStore?._state?.bookings || []).filter((b) => !b.isTestData);
  const clientoBookings =
    typeof clientoBookingStore?.listAllBookings === 'function'
      ? clientoBookingStore.listAllBookings({ tenantId: scopedTenantId })
      : [];
  const seen = new Set();
  return [...engineBookings, ...clientoBookings].filter((b) => {
    if (b.isTestData) return false;
    if (normalizeText(b.status).toLowerCase() === 'cancelled') return false;
    if (scopedTenantId && b.tenantId && b.tenantId !== scopedTenantId) return false;
    const rid = normalizeText(b.resourceId || b.slot?.resourceId);
    const resourceLabel = normalizeText(
      b.resourceLabel || b.slot?.resourceLabel || b.staffName || b.staff
    );
    if (
      resourceId !== 'all' &&
      rid !== resourceId &&
      resourceLabel.toLowerCase() !== normalizeText(resourceId).toLowerCase()
    ) {
      return false;
    }
    const start = normalizeText(b.slot?.startsAt || b.startsAt);
    if (!start) return false;
    const d = new Date(start);
    if (!(d >= now && d <= cutoff)) return false;
    const key = [
      start,
      normalizeText(b.customerEmail).toLowerCase(),
      normalizeText(b.serviceLabel || b.slot?.serviceLabel).toLowerCase(),
      normalizeText(resourceLabel || rid).toLowerCase(),
    ].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { buildIcalFeed, getBookingsForResource, formatIcsDate, escapeIcs };
