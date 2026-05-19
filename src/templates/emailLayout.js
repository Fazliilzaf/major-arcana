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
  ink: '#231F1D',          // primary text
  taupe: '#6B5F58',        // secondary text + footer
  cream: '#FAF6F2',        // page background
  white: '#FFFFFF',        // card background
  divider: '#EFE6E0',      // subtle border
  // Logo — hostas på Arcana/Render (ma.hairtpclinic.se) eftersom den
  // deployar pålitligt. Samma sköld-logga som headern på hairtpclinic.com
  // (htp-logo.svg → 480x602 retina-PNG i public/htp-logo-email.png).
  logoUrl: 'https://ma.hairtpclinic.se/htp-logo-email.png',
  logoAlt: 'Hair TP Clinic',
  logoDisplayWidth: 120,   // rendered width in email (px)
  // Footer-kontakt
  clinicName: 'Hair TP Clinic',
  addressSv: 'Vasaplatsen 2, 411 34 Göteborg',
  addressEn: 'Vasaplatsen 2, 411 34 Gothenburg',
  email: 'contact@hairtpclinic.com',
  phoneIntl: '+46318811166',
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
 * Logo-blocket i toppen av alla mejl.
 * Använder pixel-mått width="120" height="144" så Outlook/Gmail
 * renderar konsekvent oavsett mörkt/ljust läge.
 */
function renderLogoHeader() {
  return `<div style="text-align:center;margin:0 0 24px;">
    <img src="${BRAND.logoUrl}" alt="${BRAND.logoAlt}" width="${BRAND.logoDisplayWidth}" height="144" style="display:inline-block;width:${BRAND.logoDisplayWidth}px;height:auto;border:0;outline:none;text-decoration:none;">
  </div>`;
}

/**
 * Standard-footer med signatur, adress, telefon och email-länk.
 * Anpassar adress + telefonformat efter locale.
 */
function renderFooter(locale = 'sv') {
  const isEn = locale === 'en';
  const closing = isEn ? 'Looking forward to meeting you,' : 'Vi ses snart,';
  const address = isEn ? BRAND.addressEn : BRAND.addressSv;
  const phoneDisplay = isEn ? BRAND.phoneIntlDisplay : BRAND.phoneSeDisplay;
  return `<p style="font-size:14px;line-height:22px;margin:32px 0 0;color:${BRAND.taupe};">
    ${closing}<br>
    <strong style="color:${BRAND.ink};">${BRAND.clinicName}</strong><br>
    ${escapeHtml(address)}<br>
    <a href="mailto:${BRAND.email}" style="color:${BRAND.taupe};">${BRAND.email}</a> · <a href="tel:${BRAND.phoneIntl}" style="color:${BRAND.taupe};">${escapeHtml(phoneDisplay)}</a>
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
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Helvetica,sans-serif;color:${BRAND.ink};background:${BRAND.cream};padding:24px;${input.bodyAccent || ''}">
  <div style="max-width:560px;margin:0 auto;background:${BRAND.white};border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(35,31,29,0.06);">
    ${showLogo ? renderLogoHeader() : ''}
    ${body}
    ${showFooter ? renderFooter(locale) : ''}
  </div>
</body></html>`;
}

module.exports = {
  BRAND,
  escapeHtml,
  renderLogoHeader,
  renderFooter,
  renderEmailShell,
};
