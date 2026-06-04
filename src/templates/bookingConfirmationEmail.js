'use strict';

/**
 * Bokningsbekräftelse (P6.10.7).
 *
 * Skiljer sig från `bookingReservationEmail` på följande sätt:
 *   - Reservation = "tiden är reserverad medan vi bekräftar"
 *   - Confirmation = "tiden är bekräftad i CCO" (slutgiltig)
 *
 * Layout via `emailLayout.js` så loggan/footer matchar reservation
 * och påminnelse. Bygger även en ICS-bilaga (samma helper som
 * påminnelse-mailet) så patienten kan lägga in tiden i sin kalender.
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');
const { resolveMeetingTypeCopy } = require('./bookingReservationEmail');
const { buildIcsCalendarInvite } = require('./bookingReminderEmail');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || '';
}

function formatSlotForLocale(isoStart, locale) {
  const d = new Date(isoStart);
  if (Number.isNaN(d.getTime())) return isoStart;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(d);
}

/**
 * Bygger bokningsbekräftelse ({ subject, html, text, ics }).
 *
 * @param {object} input
 * @param {string} [input.customerName]
 * @param {string} [input.serviceId]
 * @param {string} [input.serviceLabel]
 * @param {string} [input.slotStart]      ISO-timestamp
 * @param {string} [input.startsAt]       Alias för slotStart
 * @param {string} [input.resourceLabel]
 * @param {string} [input.locationLabel]
 * @param {number} [input.durationMinutes]
 * @param {string} [input.locale]         'sv' (default) eller 'en'
 * @param {string} [input.clinicName]
 */
function buildBookingConfirmationEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const isEn = locale === 'en';
  const fName = firstName(input.customerName);
  const startsAt = normalizeText(input.slotStart || input.startsAt);
  const slot = startsAt ? formatSlotForLocale(startsAt, locale) : '';
  const resource = normalizeText(input.resourceLabel) || (isEn ? 'Hair TP Clinic' : 'Hair TP Clinic');
  const clinic = normalizeText(input.clinicName) || BRAND.clinicName;
  const meeting = resolveMeetingTypeCopy({
    serviceId: input.serviceId,
    serviceLabel: input.serviceLabel,
    locationLabel: input.locationLabel,
    locale,
  });
  const service = meeting.meetingType;

  const subject = slot
    ? isEn
      ? `Your appointment is confirmed — ${slot}`
      : `Din bokning är bekräftad — ${slot}`
    : isEn
      ? 'Your appointment is confirmed'
      : 'Din bokning är bekräftad';

  const greeting = isEn ? `Hi ${fName || 'there'},` : `Hej ${fName || 'där'},`;
  const intro = isEn
    ? 'Your appointment is confirmed. We look forward to seeing you.'
    : 'Din bokning är bekräftad. Vi ser fram emot att träffa dig.';
  const reschedule = isEn
    ? 'Need to reschedule? Reply to this email or call us.'
    : 'Behöver du omboka? Svara på det här mejlet eller ring oss.';

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">${escapeHtml(isEn ? 'Your appointment is confirmed' : 'Din bokning är bekräftad')}</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(greeting)}</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(isEn ? 'Meeting type' : 'Mötestyp')}</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(isEn ? 'Location' : 'Plats / kanal')}</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(isEn ? 'Specialist' : 'Specialist')}</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(isEn ? 'Time' : 'Tid')}</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot || '—')}</strong></td></tr>
    </table>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(reschedule)}</p>
  `;

  const text = `${greeting}

${intro}

  ${isEn ? 'Meeting type' : 'Mötestyp'}: ${service}
  ${isEn ? 'Location' : 'Plats / kanal'}: ${meeting.channel}
  ${isEn ? 'Specialist' : 'Specialist'}: ${resource}
  ${isEn ? 'Time' : 'Tid'}: ${slot || '—'}

${reschedule}

${clinic}
${isEn ? BRAND.addressEn : BRAND.addressSv}
${BRAND.email}`;

  const html = renderEmailShell({ locale, bodyHtml, title: subject });

  const ics = startsAt
    ? buildIcsCalendarInvite({
        uid: `confirmation-${startsAt}-${service}`.replace(/\s+/g, '-').slice(0, 120),
        startsAt,
        durationMinutes: Number(input.durationMinutes) || 60,
        summary: `${service} — ${clinic}`,
        description: isEn ? 'Confirmed appointment at Hair TP Clinic' : 'Bekräftad tid hos Hair TP Clinic',
        location: meeting.channel,
      })
    : '';

  return { subject, html, text, ics };
}

module.exports = {
  buildBookingConfirmationEmail,
};
