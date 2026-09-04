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

const { renderEmailShell, escapeHtml, BRAND, klinikIdentitet } = require('./emailLayout');
// ORD-208 — avbokningsvägen och klinikidentiteten, samma uppslag som sidorna.
const { avbokningsKontakt } = require('../ops/avbokningsKontakt');
const { resolveMeetingTypeCopy } = require('./bookingReservationEmail');
const { buildIcsCalendarInvite } = require('./bookingReminderEmail');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstName(fullName) {
  return (
    String(fullName ?? '')
      .trim()
      .split(/\s+/)[0] || ''
  );
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
  // ORD-208 — hela brevet följer kliniken. Utan tenantId blir det Hair TP.
  const tenantId = input.tenantId || null;
  const ident = klinikIdentitet(tenantId);
  const kontakt = avbokningsKontakt(tenantId);
  const fName = firstName(input.customerName);
  const startsAt = normalizeText(input.slotStart || input.startsAt);
  const slot = startsAt ? formatSlotForLocale(startsAt, locale) : '';
  const resource = normalizeText(input.resourceLabel) || ident.namn;
  const clinic = normalizeText(input.clinicName) || ident.namn;
  const meeting = resolveMeetingTypeCopy({
    serviceId: input.serviceId,
    serviceLabel: input.serviceLabel,
    locationLabel: input.locationLabel,
    locale,
    tenantId,
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
  /**
   * ORD-190 — avboka- och omboka-länken.
   *
   * Sidorna har funnits i fyra månader (/avboka/:token, /omboka/:token, med
   * slot-picker och atomiskt lås). Ingen mall byggde någon länk, så ingen kund
   * kunde nå dem. Texten sa i stället "svara på det här mejlet eller ring oss"
   * — vilket blir ett telefonsamtal för varje ombokning, på en klinik med 26
   * besök om dagen.
   *
   * FALLER TILLBAKA TILL TELEFONTEXTEN när länkarna inte går att bygga (ingen
   * token, ingen bas-URL). En trasig avbokningslänk är värre än ingen: kunden
   * klickar, får ett fel, och ringer i tron att bokningen tappats.
   */
  /**
   * ORD-208 — AVBOKA-LÄNKEN ÄR BORTA.
   *
   * Mejlet länkade till /avboka med ordet "Avboka". Sedan ORD-202 svarar den
   * sidan 405: kunden får omboka men inte avboka, och måste höra av sig.
   * Bekräftelsen gick alltså ut med en inbjudan till en låst dörr — och den
   * skickas vid VARJE bokning, inte bara inför besöket som påminnelsen.
   *
   * Ingenting har nått en kund: alla tre grindar är avstängda. Men det hade
   * skett första dagen de öppnades.
   *
   * Samma rättelse som ORD-205 gjorde i påminnelsen: omboka länkas, avboka
   * står som text med klinikens egna uppgifter.
   */
  const links = input.actionLinks || null;
  const rebookUrl = links && normalizeText(links.rebookUrl);
  const reschedule = rebookUrl
    ? isEn
      ? 'Need a different time? Use the link below.'
      : 'Passar inte tiden? Använd länken nedan.'
    : isEn
      ? 'Need to reschedule? Reply to this email or call us.'
      : 'Behöver du omboka? Svara på det här mejlet eller ring oss.';

  const linkHtml = rebookUrl
    ? `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">
        <a href="${escapeHtml(rebookUrl)}" style="color:${BRAND.ink};">${escapeHtml(
          isEn ? 'Change time' : 'Boka om tiden'
        )}</a>
      </p>`
    : '';
  const linkText = rebookUrl ? `\n${isEn ? 'Change time' : 'Boka om tiden'}: ${rebookUrl}\n` : '';

  // Avbokning görs inte här. Utan vägen vidare sitter kunden fast med en tid.
  const avbokaHtml = `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">${
    isEn
      ? `Need to cancel? Email <a href="mailto:${escapeHtml(kontakt.epost)}">${escapeHtml(kontakt.epost)}</a> or call ${escapeHtml(kontakt.telefonVisas)}.`
      : `Behöver du avboka? Mejla <a href="mailto:${escapeHtml(kontakt.epost)}">${escapeHtml(kontakt.epost)}</a> eller ring ${escapeHtml(kontakt.telefonVisas)}.`
  }</p>`;
  const avbokaText = isEn
    ? `\nNeed to cancel? Email ${kontakt.epost} or call ${kontakt.telefonVisas}.\n`
    : `\nBehöver du avboka? Mejla ${kontakt.epost} eller ring ${kontakt.telefonVisas}.\n`;

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
    ${linkHtml}
    ${avbokaHtml}
  `;

  const text = `${greeting}

${intro}

  ${isEn ? 'Meeting type' : 'Mötestyp'}: ${service}
  ${isEn ? 'Location' : 'Plats / kanal'}: ${meeting.channel}
  ${isEn ? 'Specialist' : 'Specialist'}: ${resource}
  ${isEn ? 'Time' : 'Tid'}: ${slot || '—'}

${reschedule}
${linkText}${avbokaText}
${clinic}
${isEn ? ident.adressEn : ident.adress}
${ident.epost}`;

  const html = renderEmailShell({ locale, bodyHtml, title: subject, tenantId });

  const ics = startsAt
    ? buildIcsCalendarInvite({
        uid: `confirmation-${startsAt}-${service}`.replace(/\s+/g, '-').slice(0, 120),
        startsAt,
        durationMinutes: Number(input.durationMinutes) || 60,
        summary: `${service} — ${clinic}`,
        description: isEn ? `Confirmed appointment at ${clinic}` : `Bekräftad tid hos ${clinic}`,
        location: meeting.channel,
        organizerName: clinic,
        organizerEmail: ident.epost,
      })
    : '';

  return { subject, html, text, ics };
}

module.exports = {
  buildBookingConfirmationEmail,
};
