'use strict';

const { CANONICAL_PUBLIC_ORIGIN } = require('./canonicalPublicOrigin');

/**
 * Brand Configuration — Hair TP Clinic + Curatiio.
 *
 * Samma system, olika varumärke beroende på domän.
 *
 * ⚠ LÄS DETTA FÖRE DU ÄNDRAR NÅGOT HÄR.
 *
 * FILEN STYR INGENTING I DRIFT. Uppmätt 2026-09-04: ingen produktionskod
 * require:ar den. Enda referenserna i hela repot är två testfiler.
 * `emailFrom`, `smsFrom` och `phoneDisplay` har NOLL användningar utanför den
 * här filen.
 *
 * Filhuvudet sa tidigare att den styr "kontaktinfo, SMS-avsändare,
 * e-postmallar". Det gjorde den inte, och den formuleringen är farligare än
 * felaktiga värden: den som rättar ett telefonnummer här tror att jobbet är
 * gjort, och kunden ser fortfarande det gamla numret.
 *
 * VAR SAKERNA FAKTISKT BESTÄMS:
 *
 *   E-postavsändare   src/infra/resendConfig.js — env RESEND_FROM /
 *                     ARCANA_GRAPH_DEFAULT_SENDER, annars
 *                     DEFAULT_GRAPH_FROM = contact@hairtpclinic.com.
 *                     Uppmätt i prod: ingen av dem är satt. ALL post,
 *                     inklusive Curatiios, går alltså ut från Hair TP:s adress.
 *
 *   SMS-avsändare     src/sms/smsConnector.js (egen CLINIC_PHONE-konstant)
 *   Avbokningskontakt config/avbokning-kontakt.json (hämtad från hemsidorna)
 *   Publika sidan     src/tenant/publicSiteProfile.js
 *
 * Värdena nedan är ändå rättade mot klinikernas hemsidor 2026-09-04, så att
 * filen inte ljuger den dag någon börjar läsa den.
 */

const BRANDS = Object.freeze({
  'hair-tp-clinic': {
    id: 'hair-tp-clinic',
    name: 'Hair TP Clinic',
    shortName: 'HairTP',
    domain: 'hairtpclinic.com',
    domains: ['hairtpclinic.com', 'hairtpclinic.se', 'arcana.hairtpclinic.se'],
    logoUrl: 'https://arcana.hairtpclinic.com/htp-logo-email.png',
    logoAlt: 'Hair TP Clinic',
    colors: {
      primary: '#1a4d35',
      secondary: '#6b5f58',
      background: '#faf6f2',
      card: '#ffffff',
      accent: '#1a4d35',
    },
    contact: {
      email: 'contact@hairtpclinic.com',
      phone: '+4631881166',
      phoneDisplay: '031 88 11 66',
      address: 'Vasaplatsen 2, 411 34 Göteborg',
    },
    smsFrom: 'HairTP',
    emailFrom: 'contact@hairtpclinic.com',
    emailFromName: 'Hair TP Clinic',
    website: 'https://hairtpclinic.com',
    bookingUrl: 'https://hairtpclinic.com/boka',
    // ORD-86: kanonisk värd. `domains` ovan behåller .se med flit — det är
    // domänIGENKÄNNING, inte en genererad länk.
    patientPortalUrl: `${CANONICAL_PUBLIC_ORIGIN}/patient/`,
    services: [
      'fue',
      'dhi',
      'beard',
      'eyebrow',
      'prp-hair',
      'prp-skin',
      'microneedling',
      'followup',
      'consultation-online',
      'consultation-physical',
      'followup-transplant',
    ],
    locale: 'sv-SE',
  },
  curatiio: {
    id: 'curatiio',
    name: 'Curatiio',
    shortName: 'Curatiio',
    domain: 'curatiio.com',
    domains: ['curatiio.com', 'curatiio.se'],
    logoUrl: null, // TODO: Curatiio logga
    logoAlt: 'Curatiio',
    colors: {
      primary: '#2d2d5f',
      secondary: '#5a5a8a',
      background: '#f8f7fc',
      card: '#ffffff',
      accent: '#2d2d5f',
    },
    // ORD-202 §3 — rättat mot curatiio.com/kontakt 2026-09-04.
    // Stod tidigare info@curatiio.com och Hair TP:s nummer (+4631881166).
    // Curatiio har egen adress och eget nummer; båda står på deras hemsida.
    contact: {
      email: 'contact@curatiio.com',
      phone: '+4631882244',
      phoneDisplay: '031-88 22 44',
      address: 'Vasaplatsen 2, 411 34 Göteborg',
    },
    smsFrom: 'Curatiio',
    emailFrom: 'contact@curatiio.com',
    emailFromName: 'Curatiio',
    website: 'https://curatiio.com',
    bookingUrl: 'https://curatiio.com/boka',
    patientPortalUrl: 'https://curatiio.com/patient/',
    services: [
      'consultation-curatiio-aesthetic',
      'consultation-bleph',
      'consultation-ortho',
      'bleph-upper',
      'bleph-lower',
      'bleph-combined',
      'botox',
      'fillers',
      'profhilo',
      'ortho-treatment',
    ],
    locale: 'sv-SE',
  },
});

function getBrandConfig(brandId) {
  const id = String(brandId || '')
    .trim()
    .toLowerCase();
  return BRANDS[id] || BRANDS['hair-tp-clinic'];
}

function getBrandForHost(host) {
  const { resolveBrandForHost } = require('./resolveBrand');
  const brandId = resolveBrandForHost(host, { defaultBrand: 'hair-tp-clinic' });
  return getBrandConfig(brandId);
}

function getAllBrands() {
  return Object.values(BRANDS);
}

function getBrandSmsFrom(brandId) {
  return getBrandConfig(brandId).smsFrom;
}

function getBrandEmailFrom(brandId) {
  const brand = getBrandConfig(brandId);
  return { email: brand.emailFrom, name: brand.emailFromName };
}

module.exports = {
  BRANDS,
  getBrandConfig,
  getBrandForHost,
  getAllBrands,
  getBrandSmsFrom,
  getBrandEmailFrom,
};
