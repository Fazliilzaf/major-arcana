'use strict';

/**
 * Booking cancellation email-templates.
 *
 * Skickas till patient direkt efter att en bekräftad bokning avbokats
 * (operator-cancel via `POST /api/v1/cco-booking-engine/cancel`).
 *
 * Avsikt och innehåll:
 *   - Bekräfta att tiden är ledig igen
 *   - Återge när/var/specialist så patienten känner igen ärendet
 *   - Erbjuda omboknings-väg (telefon + mejlsvar)
 *   - Mall följer samma layout-skal som reservation/påminnelse-mailen
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');
const { resolveMeetingTypeCopy } = require('./bookingReservationEmail');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function firstName(fullName) {
  return (
    String(fullName ?? '')
      .trim()
      .split(/\s+/)[0] || ''
  );
}

function buildBookingCancellationEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const fName = firstName(input.customerName || input.patientName);
  const startsAt = normalizeText(input.slotStart || input.startsAt);
  const slot = startsAt ? formatSlotForLocale(startsAt, locale) : '';
  const resource = normalizeText(input.resourceLabel) || (locale === 'en' ? 'Hair TP Clinic' : 'Hair TP Clinic');
  const meeting = resolveMeetingTypeCopy({
    serviceId: input.serviceId,
    serviceLabel: input.serviceLabel,
    locationLabel: input.locationLabel,
    locale,
  });
  const service = meeting.meetingType;
  const reason = normalizeText(input.reason);

  if (locale === 'en') {
    const subject = slot
      ? `Your appointment is cancelled — ${slot}`
      : 'Your appointment is cancelled';
    const reasonLine = reason
      ? `\n\nReason given: ${reason}`
      : '';
    const text = `Hi ${fName || 'there'},

Your appointment has been cancelled. Here is what was booked:

  Meeting type: ${service}
  Location / channel: ${meeting.channel}
  Specialist: ${resource}
  Time: ${slot || '—'}${reasonLine}

You do not need to do anything else. The slot is released and we have removed it from our calendar.

To rebook, simply reply to this email or call us on ${BRAND.phoneIntlDisplay}.

Best regards,
Hair TP Clinic
${BRAND.addressEn}
${BRAND.email}`;

    const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">Your appointment is cancelled</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hi ${escapeHtml(fName) || 'there'},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Your appointment has been cancelled. Here is what was booked:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Meeting type</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Location</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Time</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot || '—')}</strong></td></tr>
    </table>
    ${reason ? `<p style="font-size:15px;line-height:24px;margin:0 0 12px;"><em>${escapeHtml(reason)}</em></p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">You do not need to do anything else — the slot is released and removed from our calendar.</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">To rebook, simply reply to this email or call us on <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneIntlDisplay}</a>.</p>`;

    const html = renderEmailShell({ locale: 'en', bodyHtml, title: subject });
    return { subject, html, text };
  }

  const subject = slot
    ? `Din bokning är avbokad — ${slot}`
    : 'Din bokning är avbokad';
  const reasonLineSv = reason ? `\n\nAngiven orsak: ${reason}` : '';
  const text = `Hej ${fName || 'där'},

Din bokning är avbokad. Här är vad som var bokat:

  Mötestyp: ${service}
  Plats / kanal: ${meeting.channel}
  Specialist: ${resource}
  Tid: ${slot || '—'}${reasonLineSv}

Du behöver inte göra något mer — tiden är ledig igen och borttagen ur vår kalender.

Vill du boka en ny tid? Svara på det här mejlet eller ring oss på ${BRAND.phoneSeDisplay}.

Vänliga hälsningar,
Hair TP Clinic
${BRAND.addressSv}
${BRAND.email}`;

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">Din bokning är avbokad</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hej ${escapeHtml(fName) || 'där'},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Din bokning är avbokad. Här är vad som var bokat:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Mötestyp</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Plats / kanal</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Tid</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot || '—')}</strong></td></tr>
    </table>
    ${reason ? `<p style="font-size:15px;line-height:24px;margin:0 0 12px;"><em>${escapeHtml(reason)}</em></p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Du behöver inte göra något mer — tiden är ledig igen och borttagen ur vår kalender.</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Vill du boka en ny tid? Svara på det här mejlet eller ring oss på <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneSeDisplay}</a>.</p>`;

  const html = renderEmailShell({ locale: 'sv', bodyHtml, title: subject });
  return { subject, html, text };
}

module.exports = {
  buildBookingCancellationEmail,
};
