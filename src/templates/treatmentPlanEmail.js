'use strict';

/**
 * Behandlingsplan-utskick (P6.10.7).
 *
 * Skickas när operatör/CCO delar en signerad eller utkast-version av en
 * behandlingsplan med patient. Innehåller:
 *   - Summering av plan (metod, grafts, zoner, ev. PRP)
 *   - Länk till patientportalen (om token finns) eller PDF-bilaga
 *   - Tydlig hänvisning till svar via mejl eller telefon
 *
 * Layout via `emailLayout.js` så loggan/footer matchar övriga mejl.
 */

const { renderEmailShell, escapeHtml, BRAND } = require('./emailLayout');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(iso, locale) {
  const ms = Date.parse(normalizeText(iso));
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(ms));
}

function summarizeZones(zones, locale) {
  const list = asArray(zones)
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (!list.length) return locale === 'en' ? 'See plan' : 'Enligt plan';
  return list.join(', ');
}

/**
 * Bygger behandlingsplan-mejl ({ subject, html, text }).
 *
 * @param {object} input
 * @param {string} [input.customerName]   Patientens namn
 * @param {object} [input.plan]           Plan-objekt (method, grafts, zones, prpIncluded, consultationDate, notes)
 * @param {string} [input.viewUrl]        Token-länk till plan-visning (frivilligt)
 * @param {string} [input.locale]         'sv' (default) eller 'en'
 * @param {boolean} [input.hasAttachment] Visa "Bilaga: plan (PDF)"-hint
 * @param {string} [input.clinicName]
 */
function buildTreatmentPlanEmail(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const isEn = locale === 'en';
  const name = firstName(input.customerName) || (isEn ? 'there' : 'där');
  const plan = input.plan && typeof input.plan === 'object' ? input.plan : {};
  const method = normalizeText(plan.method) || (isEn ? 'Treatment plan' : 'Behandlingsplan');
  const grafts = normalizeText(String(plan.graftsTotal ?? plan.grafts ?? ''));
  const zones = summarizeZones(plan.zones, locale);
  const consultationDate = formatDate(plan.consultationDate, locale);
  const prpIncluded =
    plan.prpIncluded === true ? (isEn ? 'Yes' : 'Ja') : plan.prpIncluded === false ? (isEn ? 'No' : 'Nej') : '';
  const notes = normalizeText(plan.notes);
  const viewUrl = normalizeText(input.viewUrl);
  const hasAttachment = input.hasAttachment === true;
  const clinic = normalizeText(input.clinicName) || BRAND.clinicName;

  const subject = isEn
    ? `Your treatment plan from ${clinic}`
    : `Din behandlingsplan från ${clinic}`;

  const greeting = isEn ? `Hi ${name},` : `Hej ${name},`;
  const intro = isEn
    ? 'Here is a summary of the treatment plan we discussed. Please review and reach out with any questions.'
    : 'Här är en sammanfattning av behandlingsplanen vi diskuterade. Läs igenom och hör av dig om något är oklart.';

  const ctaLabel = isEn ? 'Open plan' : 'Öppna planen';
  const attachmentLine = hasAttachment
    ? isEn
      ? 'A PDF copy of the plan is attached for your records.'
      : 'En PDF-kopia av planen bifogas för ditt eget arkiv.'
    : '';

  const rows = [
    [isEn ? 'Method' : 'Metod', method],
    grafts ? [isEn ? 'Grafts' : 'Grafts', grafts] : null,
    [isEn ? 'Zones' : 'Zoner', zones],
    prpIncluded ? [isEn ? 'PRP included' : 'PRP ingår', prpIncluded] : null,
    consultationDate ? [isEn ? 'Consultation' : 'Konsultation', consultationDate] : null,
  ].filter(Boolean);

  const bodyHtml = `
    <h1 style="font-family:Georgia,serif;font-weight:300;font-size:26px;color:${BRAND.ink};margin:0 0 12px;">${escapeHtml(isEn ? 'Your treatment plan' : 'Din behandlingsplan')}</h1>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(greeting)}</p>
    <p style="font-size:15px;line-height:24px;margin:0 0 20px;">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      ${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;color:${BRAND.taupe};font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</td><td style="padding:8px 0;font-size:15px;text-align:right;">${escapeHtml(value)}</td></tr>`
        )
        .join('')}
    </table>
    ${notes ? `<p style="font-size:15px;line-height:24px;margin:0 0 20px;color:${BRAND.ink};"><strong>${escapeHtml(isEn ? 'Notes' : 'Anteckningar')}:</strong> ${escapeHtml(notes)}</p>` : ''}
    ${
      viewUrl
        ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#1f2937;color:#fff;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:600;">${escapeHtml(ctaLabel)}</a></p>`
        : ''
    }
    ${attachmentLine ? `<p style="font-size:14px;line-height:22px;margin:0 0 16px;color:${BRAND.taupe};">${escapeHtml(attachmentLine)}</p>` : ''}
    <p style="font-size:15px;line-height:24px;margin:0 0 8px;">${escapeHtml(isEn ? 'Reply to this email or call us if you have questions.' : 'Svara på det här mejlet eller ring oss om du har frågor.')}</p>
  `;

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const text = [
    greeting,
    '',
    intro,
    '',
    textRows,
    notes ? `\n${isEn ? 'Notes' : 'Anteckningar'}: ${notes}` : '',
    viewUrl ? `\n${ctaLabel}: ${viewUrl}` : '',
    attachmentLine ? `\n${attachmentLine}` : '',
    '',
    clinic,
    isEn ? BRAND.addressEn : BRAND.addressSv,
    BRAND.email,
  ]
    .filter(Boolean)
    .join('\n');

  const html = renderEmailShell({ locale, bodyHtml, title: subject });

  return { subject, html, text };
}

module.exports = {
  buildTreatmentPlanEmail,
};
