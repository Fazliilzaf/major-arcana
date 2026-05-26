'use strict';

/**
 * Offert-utskick (P6.10.7).
 *
 * Skickas till patient när operatör/CCO bestämmer sig för att skicka en
 * offert. Mailet innehåller:
 *   - Översikt över behandling + pris
 *   - Säker token-länk till signeringssidan
 *   - Hint om bilaga (PDF) om sådan följer med (via dispatcher som
 *     bifogar `attachments` på utskicket)
 *
 * Tonen och layouten följer `emailLayout.js` så loggan/footer matchar
 * övriga transactional mejl (reservation/påminnelse/avbokning).
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || '';
}

function formatAmount(value, locale) {
  const isEn = locale === 'en';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    const raw = normalizeText(value);
    return raw || (isEn ? 'See offer' : 'Enligt offert');
  }
  return new Intl.NumberFormat(isEn ? 'en-GB' : 'sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function formatValidUntil(iso, locale) {
  const ms = Date.parse(normalizeText(iso));
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(ms));
}

/**
 * Bygger offert-mejl ({ subject, html, text }).
 *
 * @param {object} input
 * @param {string} [input.customerName]     Patientens namn för hälsning
 * @param {string} [input.offerType]        T.ex. "FUE 3000 grafts"
 * @param {string|number} [input.amount]    Pris i SEK (eller fritextsträng)
 * @param {string} [input.signUrl]          Säker token-länk till accept
 * @param {string} [input.validUntil]       ISO för giltighetstid
 * @param {string} [input.locale]           'sv' (default) eller 'en'
 * @param {boolean} [input.hasAttachment]   Visa "Bilaga: offert (PDF)"-hint
 * @param {string} [input.coolingOffNote]   Valfri text om betänketid
 * @param {string} [input.clinicName]       Default Hair TP Clinic
 */
function buildOfferEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const isEn = locale === 'en';
  const name = firstName(input.customerName) || (isEn ? 'there' : 'där');
  const offerType = normalizeText(input.offerType) || (isEn ? 'Treatment' : 'Behandling');
  const amount = formatAmount(input.amount, locale);
  const signUrl = normalizeText(input.signUrl);
  const validUntil = formatValidUntil(input.validUntil, locale);
  const hasAttachment = input.hasAttachment === true;
  const clinic = normalizeText(input.clinicName) || BRAND.clinicName;
  const coolingOff = normalizeText(input.coolingOffNote);

  const subject = isEn
    ? `Your offer from ${clinic} — ${offerType}`
    : `Din offert från ${clinic} — ${offerType}`;

  const greeting = isEn ? `Hi ${name},` : `Hej ${name},`;
  const intro = isEn
    ? `Here is your personal offer for ${offerType}. Review the details and accept whenever you are ready.`
    : `Här kommer din personliga offert för ${offerType}. Läs igenom och acceptera när du är redo.`;

  const amountLabel = isEn ? 'Price' : 'Pris';
  const validLabel = isEn ? 'Valid until' : 'Giltig till';
  const ctaLabel = isEn ? 'Open & sign offer' : 'Öppna & signera offert';
  const attachmentLine = hasAttachment
    ? isEn
      ? 'A signed PDF copy of the offer is attached for your records.'
      : 'En PDF-kopia av offerten bifogas för ditt eget arkiv.'
    : '';

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">${escapeHtml(isEn ? 'Your offer' : 'Din offert')}</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(greeting)}</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(isEn ? 'Treatment' : 'Behandling')}</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(offerType)}</strong></td></tr>
      <tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(amountLabel)}</td><td style="padding:8px 0;font-size:15px;text-align:right;"><strong>${escapeHtml(amount)}</strong></td></tr>
      ${validUntil ? `<tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(validLabel)}</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(validUntil)}</td></tr>` : ''}
    </table>
    ${
      signUrl
        ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(signUrl)}" style="display:inline-block;background:#1f2937;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>`
        : ''
    }
    ${coolingOff ? `<p style="font-size:14px;line-height:22px;margin:0 0 16px;color:${BRAND.taupe};"><em>${escapeHtml(coolingOff)}</em></p>` : ''}
    ${attachmentLine ? `<p style="font-size:14px;line-height:22px;margin:0 0 16px;color:${BRAND.taupe};">${escapeHtml(attachmentLine)}</p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 8px;">${escapeHtml(isEn ? 'Questions? Reply to this email or call us.' : 'Frågor? Svara på det här mejlet eller ring oss.')}</p>
  `;

  const textLines = [
    greeting,
    '',
    intro,
    '',
    `${amountLabel}: ${amount}`,
    validUntil ? `${validLabel}: ${validUntil}` : '',
    signUrl ? `${ctaLabel}: ${signUrl}` : '',
    coolingOff ? `\n${coolingOff}` : '',
    attachmentLine ? `\n${attachmentLine}` : '',
    '',
    isEn ? clinic : clinic,
    isEn ? BRAND.addressEn : BRAND.addressSv,
    BRAND.email,
  ].filter(Boolean);
  const text = textLines.join('\n');

  const html = renderEmailShell({ locale, bodyHtml, title: subject });

  return { subject, html, text };
}

module.exports = {
  buildOfferEmail,
};
