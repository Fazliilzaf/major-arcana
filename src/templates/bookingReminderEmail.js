'use strict';

/**
 * Booking reminder email with ICS calendar attachment.
 *
 * Generates:
 * - HTML email body (påminnelse)
 * - ICS/iCalendar attachment (adds event to patient's calendar)
 * - Plain text fallback
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function buildIcsEvent({
  summary,
  description,
  startDate,
  startTime,
  durationMinutes = 30,
  location,
  organizerEmail,
  uid,
}) {
  const start = `${startDate.replace(/-/g, '')}T${startTime.replace(/:/g, '')}00`;
  const endDate = new Date(`${startDate}T${startTime}:00`);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  const end = endDate
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arcana//HairTP Booking//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid || `${startDate}-${startTime}@arcana.hairtpclinic.se`}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${normalizeText(summary)}`,
    `DESCRIPTION:${normalizeText(description).replace(/\n/g, '\\n')}`,
    `LOCATION:${normalizeText(location) || 'Hair TP Clinic, Stockholm'}`,
    `ORGANIZER;CN=Hair TP Clinic:mailto:${normalizeText(organizerEmail) || 'contact@hairtpclinic.com'}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Påminnelse: din tid på Hair TP Clinic',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function buildReminderEmailHtml({
  patientName,
  serviceName,
  date,
  time,
  resourceName,
  location,
  portalUrl,
  cancellationHours = 24,
}) {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2d2015;background:#faf6f2;">
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 12px rgba(70,50,30,0.06);">
    <h1 style="font-size:22px;margin:0 0 8px;color:#1a4d35;">Påminnelse om din tid</h1>
    <p style="margin:0 0 20px;color:#5c473c;font-size:15px;">Hej ${normalizeText(patientName)}!</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr><td style="padding:8px 0;color:#8a7560;font-size:13px;">Behandling</td><td style="padding:8px 0;font-weight:600;">${normalizeText(serviceName)}</td></tr>
      <tr><td style="padding:8px 0;color:#8a7560;font-size:13px;">Datum</td><td style="padding:8px 0;font-weight:600;">${normalizeText(date)}</td></tr>
      <tr><td style="padding:8px 0;color:#8a7560;font-size:13px;">Tid</td><td style="padding:8px 0;font-weight:600;">${normalizeText(time)}</td></tr>
      <tr><td style="padding:8px 0;color:#8a7560;font-size:13px;">Behandlare</td><td style="padding:8px 0;font-weight:600;">${normalizeText(resourceName)}</td></tr>
      <tr><td style="padding:8px 0;color:#8a7560;font-size:13px;">Plats</td><td style="padding:8px 0;">${normalizeText(location) || 'Hair TP Clinic'}</td></tr>
    </table>
    ${portalUrl ? `<p style="margin:0 0 16px;"><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#1a4d35;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Fyll i formulär före besöket →</a></p>` : ''}
    <p style="margin:0;font-size:13px;color:#8a7560;">Avboka senast ${cancellationHours}h före. Kontakta oss på contact@hairtpclinic.com vid frågor.</p>
  </div>
  <p style="text-align:center;margin:20px 0 0;font-size:11px;color:#b0a090;">Hair TP Clinic · Stockholm · arcana.hairtpclinic.se</p>
</body>
</html>`;
}

function buildReminderEmailPlainText({
  patientName,
  serviceName,
  date,
  time,
  resourceName,
  location,
  cancellationHours = 24,
}) {
  return `Hej ${normalizeText(patientName)}!

Påminnelse om din tid:
- Behandling: ${normalizeText(serviceName)}
- Datum: ${normalizeText(date)}
- Tid: ${normalizeText(time)}
- Behandlare: ${normalizeText(resourceName)}
- Plats: ${normalizeText(location) || 'Hair TP Clinic'}

Avboka senast ${cancellationHours}h före.
Kontakta oss på contact@hairtpclinic.com vid frågor.

Välkommen!
Hair TP Clinic`;
}

function buildCancellationEmailHtml({ patientName, serviceName, date, time }) {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2d2015;background:#faf6f2;">
  <div style="background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 12px;color:#7a3030;">Avbokningsbekräftelse</h1>
    <p>Hej ${normalizeText(patientName)},</p>
    <p>Din bokning <strong>${normalizeText(serviceName)}</strong> den ${normalizeText(date)} kl ${normalizeText(time)} är nu avbokad.</p>
    <p>Kontakta oss om du vill boka en ny tid: contact@hairtpclinic.com</p>
  </div>
</body>
</html>`;
}

function buildOfferEmailHtml({ patientName, offerTitle, totalPrice, validUntil, signUrl }) {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2d2015;background:#faf6f2;">
  <div style="background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 12px;color:#1a4d35;">Din offert från Hair TP Clinic</h1>
    <p>Hej ${normalizeText(patientName)},</p>
    <p>Vi har tagit fram en offert till dig:</p>
    <table style="width:100%;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#8a7560;">Behandling</td><td style="font-weight:600;">${normalizeText(offerTitle)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a7560;">Pris</td><td style="font-weight:600;">${totalPrice} kr</td></tr>
      <tr><td style="padding:6px 0;color:#8a7560;">Giltig till</td><td>${normalizeText(validUntil)}</td></tr>
    </table>
    ${signUrl ? `<p><a href="${signUrl}" style="display:inline-block;padding:12px 24px;background:#1a4d35;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Granska och acceptera →</a></p>` : ''}
    <p style="font-size:13px;color:#8a7560;">Offerten gäller 14 dagar. Kontakta oss vid frågor.</p>
  </div>
</body>
</html>`;
}

function buildTreatmentPlanEmailHtml({ patientName, planSummary, portalUrl }) {
  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2d2015;background:#faf6f2;">
  <div style="background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 12px;color:#1a4d35;">Din behandlingsplan</h1>
    <p>Hej ${normalizeText(patientName)},</p>
    <p>${normalizeText(planSummary) || 'Din behandlingsplan är nu klar. Granska informationen nedan och fyll i eventuella formulär innan ditt besök.'}</p>
    ${portalUrl ? `<p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#1a4d35;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Se plan och fyll i formulär →</a></p>` : ''}
  </div>
</body>
</html>`;
}

module.exports = {
  buildIcsEvent,
  buildReminderEmailHtml,
  buildReminderEmailPlainText,
  buildCancellationEmailHtml,
  buildOfferEmailHtml,
  buildTreatmentPlanEmailHtml,
};
