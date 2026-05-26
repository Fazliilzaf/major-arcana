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
  return String(fullName ?? '').trim().split(/\s+/)[0] || '';
}

function formatIcsUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
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

function buildBookingReminderEmail({
  customerName = '',
  serviceLabel = '',
  startsAt = '',
  leadTimeHours = 24,
  clinicName = BRAND.clinicName || 'Hair TP Clinic',
  locale = 'sv',
} = {}) {
  const isEn = locale === 'en';
  const name = firstName(customerName) || (isEn ? 'there' : 'där');
  const when = formatSlotForLocale(startsAt, locale);
  const service = normalizeText(serviceLabel) || (isEn ? 'your appointment' : 'ditt besök');

  const subject = isEn
    ? `Reminder: ${service} — ${when}`
    : `Påminnelse: ${service} — ${when}`;

  const intro = isEn
    ? `Hi ${escapeHtml(name)}, this is a friendly reminder about your upcoming visit (${leadTimeHours}h notice).`
    : `Hej ${escapeHtml(name)}, här kommer en påminnelse om ditt kommande besök (${leadTimeHours} timmar före).`;

  const bodyHtml = `
    <p>${intro}</p>
    <p><strong>${isEn ? 'When' : 'När'}:</strong> ${escapeHtml(when)}</p>
    <p><strong>${isEn ? 'Service' : 'Tjänst'}:</strong> ${escapeHtml(service)}</p>
    <p>${isEn ? 'Need to reschedule? Reply to this email or call the clinic.' : 'Behöver du omboka? Svara på detta mejl eller ring kliniken.'}</p>
  `.trim();

  const text = isEn
    ? `Hi ${name},\n\nReminder: ${service} on ${when}.\n\n${clinicName}`
    : `Hej ${name},\n\nPåminnelse: ${service} ${when}.\n\n${clinicName}`;

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
    description: isEn ? 'Appointment reminder from Hair TP Clinic' : 'Bokningspåminnelse från Hair TP Clinic',
    location: clinicName,
  });

  return { subject, html, text, ics };
}

module.exports = {
  buildBookingReminderEmail,
  buildIcsCalendarInvite,
  formatSlotForLocale,
};
