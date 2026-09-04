'use strict';

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatSlotForLocale(isoStart, locale = 'sv') {
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

function formatIcsUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function buildIcsCalendarInvite({
  uid = '',
  startsAt = '',
  durationMinutes = 60,
  summary = '',
  description = '',
  location = '',
  organizerEmail = 'booking@hairtpclinic.com',
} = {}) {
  const startMs = Date.parse(startsAt);
  const endMs = Number.isFinite(startMs)
    ? startMs + Math.max(15, Number(durationMinutes) || 60) * 60 * 1000
    : startMs;
  const eventUid = normalizeText(uid) || `arcana-${Date.now()}@hairtpclinic.com`;
  const dtStamp = formatIcsUtc(new Date().toISOString());
  const dtStart = formatIcsUtc(startsAt);
  const dtEnd = formatIcsUtc(new Date(endMs).toISOString());

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hair TP Clinic//Arcana Booking//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventUid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${String(summary || 'Besök Hair TP Clinic').replace(/\n/g, ' ')}`,
    `DESCRIPTION:${String(description || '').replace(/\n/g, '\\n')}`,
    location ? `LOCATION:${String(location).replace(/\n/g, ' ')}` : '',
    `ORGANIZER;CN=Hair TP Clinic:mailto:${organizerEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

/**
 * ORD-205 — omboka-länken i påminnelsen.
 *
 * SIDORNA HAR FUNNITS HELA TIDEN. ORD-190 byggde /avboka/:token och
 * /omboka/:token med slot-picker och atomiskt lås, och ORD-202 satte reglerna:
 * kunden får OMBOKA men inte AVBOKA. Påminnelsen sa ändå bara "svara på detta
 * mejl eller ring kliniken" och länkade ingenstans.
 *
 * BARA OMBOKA-LÄNKEN SKICKAS. Avbokningssidan svarar 405 med hänvisning till
 * telefon och mejl — att länka dit hade varit att bjuda in kunden till en dörr
 * som är låst. Avbokning står i stället som text, med klinikens egna uppgifter.
 *
 * LÄNKEN UTELÄMNAS HELLRE ÄN BLIR HALV. `buildBookingActionLinks` returnerar
 * null när token eller bas-URL saknas. Då faller mejlet tillbaka på den gamla
 * texten. En trasig omboka-länk är värre än ingen: kunden klickar, får ett fel,
 * och ringer i tron att bokningen tappats bort.
 */
function avbokningsText(kontakt, isEn) {
  if (!kontakt) {
    return isEn
      ? 'Need to cancel? Reply to this email or call the clinic.'
      : 'Behöver du avboka? Svara på detta mejl eller ring kliniken.';
  }
  const epost = escapeHtml(kontakt.epost || '');
  const tel = escapeHtml(kontakt.telefonVisas || kontakt.telefon || '');
  return isEn
    ? `Need to cancel? Email <a href="mailto:${epost}">${epost}</a> or call ${tel}.`
    : `Behöver du avboka? Mejla <a href="mailto:${epost}">${epost}</a> eller ring ${tel}.`;
}

function buildBookingReminderEmail({
  customerName = '',
  serviceLabel = '',
  startsAt = '',
  leadTimeHours = 24,
  clinicName = BRAND.clinicName || 'Hair TP Clinic',
  locale = 'sv',
  actionLinks = null,
  avbokningKontakt = null,
} = {}) {
  const isEn = locale === 'en';
  const name = firstName(customerName) || (isEn ? 'there' : 'där');
  const when = formatSlotForLocale(startsAt, locale);
  const service = normalizeText(serviceLabel) || (isEn ? 'your appointment' : 'ditt besök');

  const subject = isEn ? `Reminder: ${service} — ${when}` : `Påminnelse: ${service} — ${when}`;

  const intro = isEn
    ? `Hi ${escapeHtml(name)}, this is a friendly reminder about your upcoming visit (${leadTimeHours}h notice).`
    : `Hej ${escapeHtml(name)}, här kommer en påminnelse om ditt kommande besök (${leadTimeHours} timmar före).`;

  const rebookUrl = normalizeText(actionLinks && actionLinks.rebookUrl);
  const ombokaHtml = rebookUrl
    ? `<p>${isEn ? 'Need a different time?' : 'Passar inte tiden?'} <a href="${escapeHtml(rebookUrl)}">${isEn ? 'Reschedule here' : 'Omboka här'}</a>.</p>`
    : `<p>${isEn ? 'Need to reschedule? Reply to this email or call the clinic.' : 'Behöver du omboka? Svara på detta mejl eller ring kliniken.'}</p>`;

  const bodyHtml = `
    <p>${intro}</p>
    <p><strong>${isEn ? 'When' : 'När'}:</strong> ${escapeHtml(when)}</p>
    <p><strong>${isEn ? 'Service' : 'Tjänst'}:</strong> ${escapeHtml(service)}</p>
    ${ombokaHtml}
    <p>${avbokningsText(avbokningKontakt, isEn)}</p>
  `.trim();

  /**
   * Textversionen bär samma länk. Många läser i klienter som visar text, och
   * en påminnelse där bara HTML-versionen går att agera på är halvfärdig.
   */
  const ombokaText = rebookUrl
    ? isEn
      ? `\nNeed a different time? Reschedule here: ${rebookUrl}\n`
      : `\nPassar inte tiden? Omboka här: ${rebookUrl}\n`
    : '';
  const avbokaText = avbokningKontakt
    ? isEn
      ? `Need to cancel? Email ${avbokningKontakt.epost} or call ${avbokningKontakt.telefonVisas || avbokningKontakt.telefon}.\n`
      : `Behöver du avboka? Mejla ${avbokningKontakt.epost} eller ring ${avbokningKontakt.telefonVisas || avbokningKontakt.telefon}.\n`
    : '';

  const text = isEn
    ? `Hi ${name},\n\nReminder: ${service} on ${when}.\n${ombokaText}${avbokaText}\n${clinicName}`
    : `Hej ${name},\n\nPåminnelse: ${service} ${when}.\n${ombokaText}${avbokaText}\n${clinicName}`;

  const html = renderEmailShell({
    title: subject,
    preheader: isEn ? 'Your appointment is coming up' : 'Ditt besök närmar sig',
    bodyHtml,
    locale,
  });

  const ics = buildIcsCalendarInvite({
    uid: `reminder-${startsAt}-${service}`.replace(/\s+/g, '-').slice(0, 120),
    startsAt,
    summary: `${service} — ${clinicName}`,
    description: isEn
      ? 'Appointment reminder from Hair TP Clinic'
      : 'Bokningspåminnelse från Hair TP Clinic',
    location: clinicName,
  });

  return { subject, html, text, ics };
}

module.exports = {
  buildBookingReminderEmail,
  buildIcsCalendarInvite,
  formatSlotForLocale,
};
