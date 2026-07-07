'use strict';

/**
 * Brand Configuration — Hair TP Clinic + Curatiio.
 *
 * Samma system, olika varumärke beroende på domän.
 * Styr: logga, färger, kontaktinfo, SMS-avsändare, e-postmallar.
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
    patientPortalUrl: 'https://arcana.hairtpclinic.se/patient/',
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
    contact: {
      email: 'info@curatiio.com',
      phone: '+4631881166',
      phoneDisplay: '031 88 11 66',
      address: 'Vasaplatsen 2, 411 34 Göteborg',
    },
    smsFrom: 'Curatiio',
    emailFrom: 'info@curatiio.com',
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
