'use strict';

/**
 * Booking reservation confirmation email-templates.
 *
 * Skickas till patient direkt efter POST /api/public/booking-engine/reservations
 * lyckats. Mailet säger att tiden är reserverad medan operatör bekräftar.
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');

const PLAN_A_SERVICE_IDS = ['consultation-online', 'consultation-physical', 'followup-transplant'];

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

function resolveHoldDurationCopy({ slotStart = '', expiresAt = '', locale = 'sv' } = {}) {
  const startMs = Date.parse(String(slotStart));
  const endMs = Date.parse(String(expiresAt));
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    const minutes = Math.max(1, Math.round((endMs - startMs) / 60000));
    if (minutes < 120) {
      return locale === 'en'
        ? `Your time is held for ${minutes} minutes while we confirm.`
        : `Din tid är reserverad i ${minutes} minuter medan vi bekräftar.`;
    }
    const hours = Math.max(1, Math.round(minutes / 60));
    return locale === 'en'
      ? `Your time is held for ${hours} hours while we confirm.`
      : `Din tid är reserverad i ${hours} timmar medan vi bekräftar.`;
  }
  return locale === 'en'
    ? 'Your time is held while we confirm.'
    : 'Din tid är reserverad medan vi bekräftar.';
}

/**
 * Plan A mötestyp — label, plats/kanal och ev. extra instruktion.
 */
function resolveMeetingTypeCopy({
  serviceId = '',
  serviceLabel = '',
  locationLabel = '',
  locale = 'sv',
} = {}) {
  const id = normalizeText(serviceId).toLowerCase();
  const isEn = locale === 'en';

  if (id === 'consultation-online') {
    return {
      meetingType: isEn ? 'Online meeting' : 'Online möte',
      channel: isEn
        ? 'Video call (link sent after confirmation)'
        : 'Videomöte (länk skickas efter bekräftelse)',
      instruction: isEn
        ? 'We will send a video link once your booking is confirmed by our team.'
        : 'Vi skickar en videolänk när vårt team har bekräftat din bokning.',
    };
  }
  if (id === 'consultation-physical') {
    return {
      meetingType: isEn ? 'In-clinic consultation' : 'Fysisk konsultation',
      channel:
        normalizeText(locationLabel) ||
        (isEn ? 'Hair TP Clinic, Gothenburg' : 'Hair TP Clinic, Göteborg'),
      instruction: '',
    };
  }
  if (id === 'followup-transplant') {
    return {
      meetingType: isEn ? 'Hair transplant follow-up' : 'Uppföljning hårtransplantation',
      channel:
        normalizeText(locationLabel) ||
        (isEn ? 'Hair TP Clinic, Gothenburg' : 'Hair TP Clinic, Göteborg'),
      instruction: '',
    };
  }

  const fallbackService = normalizeText(serviceLabel) || (isEn ? 'Consultation' : 'Konsultation');
  return {
    meetingType: fallbackService,
    channel: normalizeText(locationLabel) || (isEn ? 'Hair TP Clinic' : 'Hair TP Clinic'),
    instruction: '',
  };
}

function buildBookingReservationEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const fName = firstName(input.patientName);
  const slot = formatSlotForLocale(input.slotStart, locale);
  const resource = input.resourceLabel || 'Hair TP Clinic';
  const meeting = resolveMeetingTypeCopy({
    serviceId: input.serviceId,
    serviceLabel: input.serviceLabel,
    locationLabel: input.locationLabel,
    locale,
  });
  const service = meeting.meetingType;
  const holdCopy = resolveHoldDurationCopy({
    slotStart: input.slotStart,
    expiresAt: input.expiresAt,
    locale,
  });
  const confirmCallCopy =
    locale === 'en'
      ? 'We will call you within 1 hour to verify the booking and answer any questions.'
      : 'Vi ringer dig inom 1 timme för att verifiera bokningen och svara på frågor.';
  const instructionBlock = meeting.instruction
    ? locale === 'en'
      ? `\n\n${meeting.instruction}`
      : `\n\n${meeting.instruction}`
    : '';

  if (locale === 'en') {
    const subject = `Your time is reserved — ${slot}`;
    const text = `Hi ${fName || 'there'},

Thank you for booking with Hair TP Clinic. Here are your details:

  Meeting type: ${service}
  Location / channel: ${meeting.channel}
  Specialist: ${resource}
  Time: ${slot}

${holdCopy} ${confirmCallCopy}${instructionBlock}

If anything changes, reply to this email or call us at ${BRAND.phoneIntlDisplay}.

Looking forward to meeting you,
Hair TP Clinic
${BRAND.addressEn}
${BRAND.email}`;

    const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">Your time is reserved</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hi ${escapeHtml(fName) || 'there'},</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Thank you for booking with Hair TP Clinic. Here are your details:</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Meeting type</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Location</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Time</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot)}</strong></td></tr>
    </table>
    <p style="font-size:15px;line-height:24px;margin:0 0 12px;">${escapeHtml(holdCopy)} ${escapeHtml(confirmCallCopy)}</p>
    ${meeting.instruction ? `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(meeting.instruction)}</p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">If anything changes, reply to this email or call us at <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneIntlDisplay}</a>.</p>`;

    const html = renderEmailShell({ locale: 'en', bodyHtml });
    return { subject, html, text };
  }

  const subject = `Din tid är reserverad — ${slot}`;
  const text = `Hej ${fName || 'där'},

Tack för att du bokat hos Hair TP Clinic. Här är dina uppgifter:

  Mötestyp: ${service}
  Plats / kanal: ${meeting.channel}
  Specialist: ${resource}
  Tid: ${slot}

${holdCopy} ${confirmCallCopy}${instructionBlock}

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
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Mötestyp</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Plats / kanal</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Tid</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(slot)}</strong></td></tr>
    </table>
    <p style="font-size:15px;line-height:24px;margin:0 0 12px;">${escapeHtml(holdCopy)} ${escapeHtml(confirmCallCopy)}</p>
    ${meeting.instruction ? `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(meeting.instruction)}</p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">Om något ändras, svara på det här mejlet eller ring oss på <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.ink};">${BRAND.phoneSeDisplay}</a>.</p>`;

  const html = renderEmailShell({ locale: 'sv', bodyHtml });

  return { subject, html, text };
}

function buildOperatorNotificationEmail(input = {}) {
  const fName = firstName(input.patientName) || 'okänd';
  const slot = formatSlotForLocale(input.slotStart, 'sv');
  const resource = input.resourceLabel || '—';
  const meeting = resolveMeetingTypeCopy({
    serviceId: input.serviceId,
    serviceLabel: input.serviceLabel,
    locationLabel: input.locationLabel,
    locale: 'sv',
  });
  const service = meeting.meetingType;
  const phone = input.patientPhone || '—';
  const patientEmail = input.patientEmail || '—';
  const lc = input.leadContext && typeof input.leadContext === 'object' ? input.leadContext : {};
  const healthYes =
    Array.isArray(lc.healthYes) && lc.healthYes.length ? lc.healthYes.join(', ') : 'inga';
  const healthNotes = lc.healthNotes ? String(lc.healthNotes) : '';
  const timeWindow = lc.timeWindow || '—';
  const city = lc.city || '—';
  const photos = lc.photos || 'none';
  const langPref = lc.languagePref || 'sv';
  const surgeryDate = lc.surgeryDate || lc.operatedAt || '—';

  const subject = `Ny webbbokning: ${input.patientName || fName} — ${slot}`;

  const text = `Ny webbbokning via hairtpclinic.com — ring patienten inom 1 timme.

Patient:    ${input.patientName || fName}
Telefon:    ${phone}
E-post:     ${patientEmail}
Tid:        ${slot}
Mötestyp:   ${service}
Plats:      ${meeting.channel}
Specialist: ${resource}
Ärende-ID:  ${input.caseId || '—'}

Patient-kontext:
  Hälsodeklaration (ja): ${healthYes}
  Anteckningar: ${healthNotes || '—'}
  Opereringsdatum: ${surgeryDate}
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
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Mötestyp</td><td style="padding:6px 0;font-size:15px;text-align:right;">${escapeHtml(service)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Plats / kanal</td><td style="padding:6px 0;font-size:15px;text-align:right;">${escapeHtml(meeting.channel)}</td></tr>
      <tr><td style="padding:6px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Specialist</td><td style="padding:6px 0;font-size:15px;text-align:right;">${escapeHtml(resource)}</td></tr>
    </table>
    <p style="font-size:13px;line-height:20px;margin:0 0 4px;color:${BRAND.taupe};text-transform:uppercase;letter-spacing:0.05em;">Patient-kontext</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px;">
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Hälsodeklaration (ja)</td><td style="padding:4px 0;text-align:right;">${escapeHtml(healthYes)}</td></tr>
      ${healthNotes ? `<tr><td style="padding:4px 0;color:${BRAND.taupe};">Anteckningar</td><td style="padding:4px 0;text-align:right;">${escapeHtml(healthNotes)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:${BRAND.taupe};">Opereringsdatum</td><td style="padding:4px 0;text-align:right;">${escapeHtml(String(surgeryDate))}</td></tr>
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
  resolveMeetingTypeCopy,
  PLAN_A_SERVICE_IDS,
};
