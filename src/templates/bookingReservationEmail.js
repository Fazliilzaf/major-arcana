'use strict';

/**
 * Booking reservation confirmation email-templates.
 *
 * Skickas till patient direkt efter POST /api/public/booking-engine/reservations
 * lyckats. Mailet säger att tiden är reserverad i 72 h och att en operatör
 * hör av sig inom 1 timme för att slutgiltigt bekräfta.
 *
 * Locale: SV / EN väljs baserat på `locale`-input (auto-detekt från
 * accept-language eller URL kan adderas senare).
 *
 * Tonen är samma som Hair TP Clinics övriga kommunikation: varm,
 * professionell, ärlig. INGA AI-genererade ord — statisk mall.
 *
 * Layout (logga, brand-färger, footer) kommer från ./emailLayout.js
 * så alla transactional emails delar samma identitet utan copy-paste.
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');

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
  return String(fullName ?? '').trim().split(/\s+/)[0] || '';
}

/**
 * Bygg booking-reservation-confirmation-email.
 *
 * @param {object} input
 * @param {string} input.patientName        Fullständigt namn
 * @param {string} input.slotStart          ISO 8601 start
 * @param {string} input.resourceLabel      "Fazli Krasniqi", "Egzona Krasniqi" eller "Dr. Arya Emami"
 * @param {string} input.serviceLabel       "Kostnadsfri konsultation"
 * @param {string} input.caseId             Synthetic conversationId
 * @param {string} input.expiresAt          ISO 8601 — när reservation upphör (72h)
 * @param {'sv'|'en'} input.locale          Default 'sv'
 * @returns {{subject: string, html: string, text: string}}
 */
function buildBookingReservationEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const fName = firstName(input.patientName);
  const slot = formatSlotForLocale(input.slotStart, locale);
  const resource = input.resourceLabel || 'Hair TP Clinic';
  const service = input.serviceLabel || (locale === 'en' ? 'Free consultation' : 'Kostnadsfri konsultation');
  const expiresHours = 72;

  if (locale === 'en') {
    const subject = `Your appointment is reserved — ${slot}`;
    const text = `Hi ${fName || 'there'},

Thank you for booking with Hair TP Clinic. Here are your details:

  Service: ${service}
  Specialist: ${resource}
  Time: ${slot}

Your time is held for ${expiresHours} hours while we confirm. We will call you within 1 hour to verify the booking and answer any questions.

If anything changes, reply to this email or call us at ${BRAND.phoneIntlDisplay}.

Looking forward to meeting you,
Hair TP Clinic
${BRAND.addressEn}
${BRAND.email}`;

    const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">Your appointment is reserved</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hi ${escapeHtml(fName) || 'there'},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Thank you for booking with Hair TP Clinic. Here are your details:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Service</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Time</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot)}</strong></td></tr>
    </table>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Your time is held for <strong>${expiresHours} hours</strong> while we confirm. We will call you within 1 hour to verify the booking and answer any questions.</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">If anything changes, reply to this email or call us at <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneIntlDisplay}</a>.</p>`;

    const html = renderEmailShell({ locale: 'en', bodyHtml });
    return { subject, html, text };
  }

  // SV (default)
  const subject = `Din tid är reserverad — ${slot}`;
  const text = `Hej ${fName || 'där'},

Tack för att du bokat hos Hair TP Clinic. Här är dina uppgifter:

  Behandling: ${service}
  Specialist: ${resource}
  Tid: ${slot}

Din tid är reserverad i ${expiresHours} timmar medan vi bekräftar. Vi ringer dig inom 1 timme för att verifiera bokningen och svara på frågor.

Om något ändras, svara på det här mejlet eller ring oss på ${BRAND.phoneSeDisplay}.

Vi ses snart,
Hair TP Clinic
${BRAND.addressSv}
${BRAND.email}`;

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">Din tid är reserverad</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hej ${escapeHtml(fName) || 'där'},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Tack för att du bokat hos Hair TP Clinic. Här är dina uppgifter:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Behandling</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Tid</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot)}</strong></td></tr>
    </table>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Din tid är reserverad i <strong>${expiresHours} timmar</strong> medan vi bekräftar. Vi ringer dig inom 1 timme för att verifiera bokningen och svara på frågor.</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Om något ändras, svara på det här mejlet eller ring oss på <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneSeDisplay}</a>.</p>`;

  const html = renderEmailShell({ locale: 'sv', bodyHtml });

  return { subject, html, text };
}

/**
 * Bygg operatörs-notifiering — skickas till kliniken (INTE patienten) när en
 * webbbokning kommer in, så operatör ser ärendet direkt i inkorgen utöver
 * CCO-kö-kortet. Intern ton, all patient-kontext samlad.
 *
 * @param {object} input
 * @param {string} input.patientName
 * @param {string} input.patientEmail
 * @param {string} input.patientPhone
 * @param {string} input.slotStart       ISO 8601
 * @param {string} input.resourceLabel
 * @param {string} input.serviceLabel
 * @param {string} input.caseId
 * @param {object} [input.leadContext]    { healthYes[], healthNotes, timeWindow, city, photos, languagePref }
 * @returns {{subject: string, html: string, text: string}}
 */
function buildOperatorNotificationEmail(input = {}) {
  const fName = firstName(input.patientName) || 'okänd';
  const slot = formatSlotForLocale(input.slotStart, 'sv');
  const resource = input.resourceLabel || '—';
  const service = input.serviceLabel || '—';
  const phone = input.patientPhone || '—';
  const patientEmail = input.patientEmail || '—';
  const lc = (input.leadContext && typeof input.leadContext === 'object') ? input.leadContext : {};
  const healthYes = Array.isArray(lc.healthYes) && lc.healthYes.length ? lc.healthYes.join(', ') : 'inga';
  const healthNotes = lc.healthNotes ? String(lc.healthNotes) : '';
  const timeWindow = lc.timeWindow || '—';
  const city = lc.city || '—';
  const photos = lc.photos || 'none';
  const langPref = lc.languagePref || 'sv';

  const subject = `Ny webbbokning: ${input.patientName || fName} — ${slot}`;

  const text = `Ny webbbokning via hairtpclinic.com — ring patienten inom 1 timme.

Patient:    ${input.patientName || fName}
Telefon:    ${phone}
E-post:     ${patientEmail}
Tid:        ${slot}
Behandling: ${service}
Specialist: ${resource}
Ärende-ID:  ${input.caseId || '—'}

Patient-kontext:
  Hälsodeklaration (ja): ${healthYes}
  Anteckningar: ${healthNotes || '—'}
  Önskat tidsfönster: ${timeWindow}
  Stad: ${city}
  Foton: ${photos}
  Språk: ${langPref}

Hantera ärendet i CCO-vyn.`;

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:24px;color:${BRAND.ink};margin:0 0 8px;">Ny webbbokning</h1>
    <p style="font-size:14px;line-height:22px;margin:0 0 20px;color:${BRAND.taupe};">Ring patienten inom 1 timme för att bekräfta.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Patient</td><td style="padding:6px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(input.patientName || fName)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Telefon</td><td style="padding:6px 0;font-size:15px;text-align:right;"><a href="tel:${escapeHtml(phone)}" style="color:${BRAND.ink};">${escapeHtml(phone)}</a></td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">E-post</td><td style="padding:6px 0;font-size:15px;text-align:right;"><a href="mailto:${escapeHtml(patientEmail)}" style="color:${BRAND.ink};">${escapeHtml(patientEmail)}</a></td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Tid</td><td style="padding:6px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot)}</strong></td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Behandling</td><td style="padding:6px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:6px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
    </table>
    <p style="font-size:13px;line-height:20px;margin:0 0 4px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:0.05em;">Patient-kontext</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Hälsodeklaration (ja)</td><td style="padding:4px 0;text-align:right;">${escapeHtml(healthYes)}</td></tr>
      ${healthNotes ? `<tr><td style="padding:4px 0;color:${BRAND.taupe};">Anteckningar</td><td style="padding:4px 0;text-align:right;">${escapeHtml(healthNotes)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Önskat tidsfönster</td><td style="padding:4px 0;text-align:right;">${escapeHtml(timeWindow)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Stad</td><td style="padding:4px 0;text-align:right;">${escapeHtml(city)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Foton</td><td style="padding:4px 0;text-align:right;">${escapeHtml(photos)}</td></tr>
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Språk</td><td style="padding:4px 0;text-align:right;">${escapeHtml(langPref)}</td></tr>
    </table>
    <p style="font-size:13px;line-height:20px;margin:0;color:${BRAND.taupe};">Ärende-ID: ${escapeHtml(input.caseId || '—')} · Hantera i CCO-vyn.</p>`;

  const html = renderEmailShell({ locale: 'sv', bodyHtml, showFooter: false });
  return { subject, html, text };
}

module.exports = {
  buildBookingReservationEmail,
  buildOperatorNotificationEmail,
};
