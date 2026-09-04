'use strict';

/**
 * Shared email layout helpers for all Hair TP Clinic transactional emails.
 *
 * Single source of truth för:
 *  - Logo URL (samma som header på hairtpclinic.com — htp-logo.svg konverterad
 *    till 480x602 retina-PNG på /assets/htp-logo-circle-email.png)
 *  - Brand-färger, font-stack, container-styling
 *  - Header (logga + valfri rubrik) och footer (signatur + kontaktinfo)
 *
 * Använd via:
 *   const { renderEmailShell, BRAND } = require('./emailLayout');
 *   const html = renderEmailShell({
 *     locale: 'sv',
 *     bodyHtml: `<p>...</p>`,
 *     showLogo: true, // default
 *   });
 *
 * Anledning till DRY-helper: när vi adderar nya transactional emails
 * (post-op review, no-show-uppföljning, marknadsförings-blast) ska
 * loggan + brand-färger vara identiska över alla mejl utan copy-paste.
 *
 * Loggan hämtas från hairtpclinic.com/assets — så när Vercel deployar
 * en uppdaterad SVG → PNG, slår den igenom i alla mejl utan att
 * Arcana behöver redeployas.
 */

const BRAND = {
  // Färger från hairtpclinic.com (tailwind config)
  ink: '#231F1D', // primary text
  taupe: '#6B5F58', // secondary text + footer
  cream: '#FAF6F2', // page background
  white: '#FFFFFF', // card background
  divider: '#EFE6E0', // subtle border
  // Logo — hostas på Arcana/Render (arcana.hairtpclinic.com) eftersom den
  // deployar pålitligt. Samma sköld-logga som headern på hairtpclinic.com
  // (htp-logo.svg → 480x602 retina-PNG i public/htp-logo-email.png).
  logoUrl: 'https://arcana.hairtpclinic.com/htp-logo-email.png',
  logoAlt: 'Hair TP Clinic',
  logoDisplayWidth: 120, // rendered width in email (px)
  // Footer-kontakt
  clinicName: 'Hair TP Clinic',
  addressSv: 'Vasaplatsen 2, 411 34 Göteborg',
  addressEn: 'Vasaplatsen 2, 411 34 Gothenburg',
  email: 'contact@hairtpclinic.com',
  phoneIntl: '+4631881166',
  phoneSeDisplay: '031 88 11 66',
  phoneIntlDisplay: '+46 31 88 11 66',
};

/**
 * HTML escape — undvik XSS i transactional templates.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * ORD-206 — sidfoten följer kliniken, inte konstanten.
 *
 * BRAND ovan är helt och hållet Hair TP: logga, adress, contact@hairtpclinic.com
 * och 031 88 11 66. Varje mejl som gick genom skalet bar den foten — även
 * Curatiios ögonlocks- och ortopedipatienter. Efter ORD-205 fick en
 * Curatiio-patient rätt avbokningsnummer i brödtexten och fel klinik längst ner,
 * i samma brev.
 *
 * Samma familj som ORD-203 (avsändaradressen) och ORD-200 (kundresans steg):
 * klinikidentiteten var inte genomförd hela vägen ut.
 */
const { avbokningsKontakt } = require('../ops/avbokningsKontakt');

/** Klinikens identitet för mejlfoten. Faller alltid tillbaka, aldrig tomt. */
function klinikIdentitet(tenantId) {
  const k = avbokningsKontakt(tenantId) || {};
  return {
    namn: k.namn || BRAND.clinicName,
    epost: k.epost || BRAND.email,
    telefon: k.telefon || BRAND.phoneIntl,
    telefonVisas: k.telefonVisas || BRAND.phoneSeDisplay,
    adress: k.adress || BRAND.addressSv,
    adressEn: k.adressEn || BRAND.addressEn,
    // null betyder "ingen logga finns", inte "använd standardloggan".
    // Hair TP:s sköld på ett Curatiio-brev är precis felet som rättas här.
    logotyp: Object.prototype.hasOwnProperty.call(k, 'logotyp') ? k.logotyp : BRAND.logoUrl,
  };
}

/**
 * Logo-blocket i toppen av alla mejl.
 * Använder pixel-mått width="120" height="144" så Outlook/Gmail
 * renderar konsekvent oavsett mörkt/ljust läge.
 *
 * SAKNAS LOGGAN VISAS INGEN. Curatiio har ingen egen (brandConfig: logoUrl
 * null, TODO). Att falla tillbaka på Hair TP:s hade gjort brevet fel på det
 * mest synliga stället.
 */
function renderLogoHeader(tenantId) {
  const k = klinikIdentitet(tenantId);
  if (!k.logotyp) return '';
  return `<div style="text-align:center;margin:0 0 24px;">
    <img src="${k.logotyp}" alt="${escapeHtml(k.namn)}" width="${BRAND.logoDisplayWidth}" height="144" style="display:inline-block;width:${BRAND.logoDisplayWidth}px;height:auto;border:0;outline:none;text-decoration:none;">
  </div>`;
}

/**
 * Standard-footer med signatur, adress, telefon och email-länk.
 * Anpassar adress + telefonformat efter locale, och klinik efter tenantId.
 */
function renderFooter(locale = 'sv', tenantId = null) {
  const isEn = locale === 'en';
  const k = klinikIdentitet(tenantId);
  const closing = isEn ? 'Looking forward to meeting you,' : 'Vi ses snart,';
  const address = isEn ? k.adressEn : k.adress;
  return `<p style="font-size:14px;line-height:22px;margin:32px 0 0;color:${BRAND.taupe};">
    ${closing}<br>
    <strong style="color:${BRAND.ink};">${escapeHtml(k.namn)}</strong><br>
    ${escapeHtml(address)}<br>
    <a href="mailto:${escapeHtml(k.epost)}" style="color:${BRAND.taupe};">${escapeHtml(k.epost)}</a> · <a href="tel:${escapeHtml(k.telefon)}" style="color:${BRAND.taupe};">${escapeHtml(k.telefonVisas)}</a>
  </p>`;
}

/**
 * Wrappar email-body i den gemensamma shell (DOCTYPE, brand-bakgrund,
 * card-container, logga, footer).
 *
 * @param {object} input
 * @param {'sv'|'en'} input.locale            Default 'sv'
 * @param {string} input.bodyHtml             HTML mellan header och footer
 * @param {boolean} [input.showLogo=true]     Visa logo-blocket i toppen
 * @param {boolean} [input.showFooter=true]   Visa standard-footern
 * @param {string} [input.bodyAccent]         Valfri extra inline-style på <body>
 * @returns {string} Komplett HTML-dokument klart för send
 */
function renderEmailShell(input = {}) {
  const locale = input.locale === 'en' ? 'en' : 'sv';
  const lang = locale;
  const showLogo = input.showLogo !== false;
  const showFooter = input.showFooter !== false;
  const body = input.bodyHtml || '';
  // ORD-206 — utan tenantId blir det Hair TP, som förut. Anropare som vet
  // vilken klinik brevet gäller skickar med den och får rätt fot.
  const tenantId = input.tenantId || null;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Helvetica,sans-serif;color:${BRAND.ink};background:${BRAND.cream};padding:24px;${input.bodyAccent || ''}">
  <div style="max-width:560px;margin:0 auto;background:${BRAND.white};border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(35,31,29,0.06);">
    ${showLogo ? renderLogoHeader(tenantId) : ''}
    ${body}
    ${showFooter ? renderFooter(locale, tenantId) : ''}
  </div>
</body></html>`;
}

module.exports = {
  BRAND,
  escapeHtml,
  klinikIdentitet,
  renderLogoHeader,
  renderFooter,
  renderEmailShell,
};
