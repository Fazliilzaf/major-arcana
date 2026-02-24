const MAX_TEXT = 180;
const MAX_LONG_TEXT = 1200;
const MAX_SERVICES = 24;

const HEX_COLOR_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function toTitleFromSlug(value) {
  const raw = normalizeText(value)
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!raw) return 'Clinic';

  return raw
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSlug(value, fallback = 'item') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (normalized) return normalized;
  return normalizeSlug(fallback, 'item');
}

function readString(value, {
  fallback = '',
  allowEmpty = false,
  max = MAX_TEXT,
  strict = false,
  fieldName = 'field',
} = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    if (strict) throw new Error(`${fieldName} must be a string.`);
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (allowEmpty) return '';
    if (strict) throw new Error(`${fieldName} cannot be empty.`);
    return fallback;
  }
  if (trimmed.length > max) {
    if (strict) throw new Error(`${fieldName} is too long (max ${max}).`);
    return trimmed.slice(0, max);
  }
  return trimmed;
}

function readNumber(value, {
  fallback = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
  decimals = 1,
  strict = false,
  fieldName = 'field',
} = {}) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (strict) throw new Error(`${fieldName} must be a number.`);
    return fallback;
  }

  const rounded = integer
    ? Math.round(parsed)
    : Number(parsed.toFixed(Math.max(0, Math.min(6, decimals))));

  const clamped = Math.max(min, Math.min(max, rounded));
  return clamped;
}

function readHexColor(value, {
  fallback,
  strict = false,
  fieldName = 'field',
} = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    if (strict) throw new Error(`${fieldName} must be a hex color.`);
    return fallback;
  }
  const normalized = value.trim();
  if (!HEX_COLOR_RE.test(normalized)) {
    if (strict) throw new Error(`${fieldName} must be a valid hex color.`);
    return fallback;
  }
  return normalized;
}

function readUrl(value, {
  fallback = '',
  allowEmpty = true,
  strict = false,
  fieldName = 'field',
} = {}) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    if (strict) throw new Error(`${fieldName} must be a URL string.`);
    return fallback;
  }
  const normalized = value.trim();
  if (!normalized) {
    if (allowEmpty) return '';
    if (strict) throw new Error(`${fieldName} cannot be empty.`);
    return fallback;
  }
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('/')) {
    return normalized;
  }
  if (strict) {
    throw new Error(`${fieldName} must start with http(s):// or /.`);
  }
  return fallback;
}

function cloneService(service) {
  if (!isRecord(service)) {
    return {
      id: 'service',
      title: 'Service',
      description: '',
      durationMinutes: 60,
      fromPriceSek: 0,
    };
  }
  return {
    id: normalizeSlug(service.id || service.title || 'service'),
    title: readString(service.title, { fallback: 'Service', max: 120 }),
    description: readString(service.description, {
      fallback: '',
      max: 400,
      allowEmpty: true,
    }),
    durationMinutes: readNumber(service.durationMinutes, {
      fallback: 60,
      integer: true,
      min: 10,
      max: 1440,
    }),
    fromPriceSek: readNumber(service.fromPriceSek, {
      fallback: 0,
      integer: true,
      min: 0,
      max: 500000,
    }),
  };
}

function cloneServiceList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_SERVICES)
    .map((service) => cloneService(service));
}

function normalizeServices(value, {
  fallback = [],
  strict = false,
  fieldName = 'publicSite.services',
} = {}) {
  if (value === undefined) {
    return cloneServiceList(fallback);
  }
  if (!Array.isArray(value)) {
    if (strict) throw new Error(`${fieldName} must be an array.`);
    return cloneServiceList(fallback);
  }

  const output = [];
  const seen = new Set();

  for (const rawService of value) {
    if (!isRecord(rawService)) {
      if (strict) throw new Error(`${fieldName} contains an invalid item.`);
      continue;
    }

    const title = readString(rawService.title, {
      fallback: '',
      allowEmpty: false,
      strict,
      max: 120,
      fieldName: `${fieldName}.title`,
    });

    if (!title) continue;

    const id = normalizeSlug(rawService.id || title);
    if (seen.has(id)) continue;
    seen.add(id);

    output.push({
      id,
      title,
      description: readString(rawService.description, {
        fallback: '',
        allowEmpty: true,
        strict,
        max: 400,
        fieldName: `${fieldName}.description`,
      }),
      durationMinutes: readNumber(rawService.durationMinutes, {
        fallback: 60,
        min: 10,
        max: 1440,
        integer: true,
        strict,
        fieldName: `${fieldName}.durationMinutes`,
      }),
      fromPriceSek: readNumber(rawService.fromPriceSek, {
        fallback: 0,
        min: 0,
        max: 500000,
        integer: true,
        strict,
        fieldName: `${fieldName}.fromPriceSek`,
      }),
    });

    if (output.length >= MAX_SERVICES) break;
  }

  return output;
}

function clonePublicSiteProfile(value) {
  if (!isRecord(value)) {
    return buildDefaultPublicSiteProfile({ tenantId: 'clinic', defaultBrand: '' });
  }

  return {
    clinicName: readString(value.clinicName, { fallback: 'Clinic', max: 120 }),
    city: readString(value.city, { fallback: '', allowEmpty: true, max: 80 }),
    tagline: readString(value.tagline, { fallback: '', allowEmpty: true, max: 160 }),
    heroTitle: readString(value.heroTitle, { fallback: 'Hair transplant clinic', max: 140 }),
    heroSubtitle: readString(value.heroSubtitle, {
      fallback: '',
      allowEmpty: true,
      max: MAX_LONG_TEXT,
    }),
    primaryCtaLabel: readString(value.primaryCtaLabel, { fallback: 'Book consultation', max: 80 }),
    primaryCtaUrl: readUrl(value.primaryCtaUrl, { fallback: '', allowEmpty: true }),
    secondaryCtaLabel: readString(value.secondaryCtaLabel, {
      fallback: 'Read more',
      allowEmpty: true,
      max: 80,
    }),
    secondaryCtaUrl: readUrl(value.secondaryCtaUrl, { fallback: '', allowEmpty: true }),
    services: cloneServiceList(value.services),
    trustRating: readNumber(value.trustRating, {
      fallback: 4.8,
      min: 0,
      max: 5,
      integer: false,
      decimals: 1,
    }),
    trustReviewCount: readNumber(value.trustReviewCount, {
      fallback: 0,
      min: 0,
      max: 100000,
      integer: true,
    }),
    trustSurgeons: readNumber(value.trustSurgeons, {
      fallback: 0,
      min: 0,
      max: 100,
      integer: true,
    }),
    contactPhone: readString(value.contactPhone, { fallback: '', allowEmpty: true, max: 80 }),
    contactEmail: readString(value.contactEmail, { fallback: '', allowEmpty: true, max: 160 }),
    contactAddress: readString(value.contactAddress, {
      fallback: '',
      allowEmpty: true,
      max: MAX_LONG_TEXT,
    }),
    contactBookingUrl: readUrl(value.contactBookingUrl, { fallback: '', allowEmpty: true }),
    themeAccent: readHexColor(value.themeAccent, { fallback: '#0F766E' }),
    themeAccentSoft: readHexColor(value.themeAccentSoft, { fallback: '#D7F3EF' }),
    themeCanvasFrom: readHexColor(value.themeCanvasFrom, { fallback: '#FFF7EC' }),
    themeCanvasTo: readHexColor(value.themeCanvasTo, { fallback: '#F5F9FF' }),
  };
}

function normalizePublicSiteProfile(value, {
  fallback,
  strict = false,
} = {}) {
  const base = clonePublicSiteProfile(fallback || {});

  if (value === undefined) {
    return base;
  }

  if (!isRecord(value)) {
    if (strict) throw new Error('publicSite must be an object.');
    return base;
  }

  return {
    clinicName: readString(value.clinicName, {
      fallback: base.clinicName,
      strict,
      max: 120,
      fieldName: 'publicSite.clinicName',
    }),
    city: readString(value.city, {
      fallback: base.city,
      allowEmpty: true,
      strict,
      max: 80,
      fieldName: 'publicSite.city',
    }),
    tagline: readString(value.tagline, {
      fallback: base.tagline,
      allowEmpty: true,
      strict,
      max: 160,
      fieldName: 'publicSite.tagline',
    }),
    heroTitle: readString(value.heroTitle, {
      fallback: base.heroTitle,
      strict,
      max: 140,
      fieldName: 'publicSite.heroTitle',
    }),
    heroSubtitle: readString(value.heroSubtitle, {
      fallback: base.heroSubtitle,
      allowEmpty: true,
      strict,
      max: MAX_LONG_TEXT,
      fieldName: 'publicSite.heroSubtitle',
    }),
    primaryCtaLabel: readString(value.primaryCtaLabel, {
      fallback: base.primaryCtaLabel,
      strict,
      max: 80,
      fieldName: 'publicSite.primaryCtaLabel',
    }),
    primaryCtaUrl: readUrl(value.primaryCtaUrl, {
      fallback: base.primaryCtaUrl,
      allowEmpty: true,
      strict,
      fieldName: 'publicSite.primaryCtaUrl',
    }),
    secondaryCtaLabel: readString(value.secondaryCtaLabel, {
      fallback: base.secondaryCtaLabel,
      allowEmpty: true,
      strict,
      max: 80,
      fieldName: 'publicSite.secondaryCtaLabel',
    }),
    secondaryCtaUrl: readUrl(value.secondaryCtaUrl, {
      fallback: base.secondaryCtaUrl,
      allowEmpty: true,
      strict,
      fieldName: 'publicSite.secondaryCtaUrl',
    }),
    services: normalizeServices(value.services, {
      fallback: base.services,
      strict,
      fieldName: 'publicSite.services',
    }),
    trustRating: readNumber(value.trustRating, {
      fallback: base.trustRating,
      min: 0,
      max: 5,
      integer: false,
      decimals: 1,
      strict,
      fieldName: 'publicSite.trustRating',
    }),
    trustReviewCount: readNumber(value.trustReviewCount, {
      fallback: base.trustReviewCount,
      min: 0,
      max: 100000,
      integer: true,
      strict,
      fieldName: 'publicSite.trustReviewCount',
    }),
    trustSurgeons: readNumber(value.trustSurgeons, {
      fallback: base.trustSurgeons,
      min: 0,
      max: 100,
      integer: true,
      strict,
      fieldName: 'publicSite.trustSurgeons',
    }),
    contactPhone: readString(value.contactPhone, {
      fallback: base.contactPhone,
      allowEmpty: true,
      strict,
      max: 80,
      fieldName: 'publicSite.contactPhone',
    }),
    contactEmail: readString(value.contactEmail, {
      fallback: base.contactEmail,
      allowEmpty: true,
      strict,
      max: 160,
      fieldName: 'publicSite.contactEmail',
    }),
    contactAddress: readString(value.contactAddress, {
      fallback: base.contactAddress,
      allowEmpty: true,
      strict,
      max: MAX_LONG_TEXT,
      fieldName: 'publicSite.contactAddress',
    }),
    contactBookingUrl: readUrl(value.contactBookingUrl, {
      fallback: base.contactBookingUrl,
      allowEmpty: true,
      strict,
      fieldName: 'publicSite.contactBookingUrl',
    }),
    themeAccent: readHexColor(value.themeAccent, {
      fallback: base.themeAccent,
      strict,
      fieldName: 'publicSite.themeAccent',
    }),
    themeAccentSoft: readHexColor(value.themeAccentSoft, {
      fallback: base.themeAccentSoft,
      strict,
      fieldName: 'publicSite.themeAccentSoft',
    }),
    themeCanvasFrom: readHexColor(value.themeCanvasFrom, {
      fallback: base.themeCanvasFrom,
      strict,
      fieldName: 'publicSite.themeCanvasFrom',
    }),
    themeCanvasTo: readHexColor(value.themeCanvasTo, {
      fallback: base.themeCanvasTo,
      strict,
      fieldName: 'publicSite.themeCanvasTo',
    }),
  };
}

function buildDefaultPublicSiteProfile({ tenantId, defaultBrand = '' }) {
  const normalizedTenant = normalizeSlug(tenantId || '', 'clinic');
  const normalizedBrand = normalizeSlug(defaultBrand || '', '');

  if (
    normalizedTenant === 'hair-tp-clinic' ||
    normalizedTenant === 'hair-to-clinic' ||
    normalizedBrand === 'hair-tp-clinic'
  ) {
    return {
      clinicName: 'Hair TP Clinic',
      city: 'Goteborg',
      tagline: 'Medicinsk precision. Naturliga resultat.',
      heroTitle: 'Hartransplantation med kliniskt fokus',
      heroSubtitle:
        'Vi planerar varje behandling utifran medicinsk bedomning, donor-kapacitet och langsiktig strategi.',
      primaryCtaLabel: 'Boka konsultation',
      primaryCtaUrl: 'https://hairtpclinic.se/boka',
      secondaryCtaLabel: 'Se fore/efter',
      secondaryCtaUrl: 'https://hairtpclinic.se/resultat',
      services: [
        {
          id: 'fue-core',
          title: 'FUE Bas',
          description: 'For vikande harfaste och mindre omraden.',
          durationMinutes: 300,
          fromPriceSek: 42000,
        },
        {
          id: 'fue-density',
          title: 'FUE Densitet+',
          description: 'Tatere uppbyggnad i front och mid-scalp.',
          durationMinutes: 420,
          fromPriceSek: 50000,
        },
        {
          id: 'prp',
          title: 'PRP Har Standard',
          description: 'Kompletterande behandling for har och aterhamtning.',
          durationMinutes: 60,
          fromPriceSek: 4300,
        },
      ],
      trustRating: 4.9,
      trustReviewCount: 231,
      trustSurgeons: 3,
      contactPhone: '031 88 11 66',
      contactEmail: 'contact@hairtpclinic.com',
      contactAddress: 'Vasaplatsen 2, 411 34 Goteborg',
      contactBookingUrl: 'https://hairtpclinic.se/boka',
      themeAccent: '#CABAAE',
      themeAccentSoft: '#EFE5DE',
      themeCanvasFrom: '#FAF6F3',
      themeCanvasTo: '#F3F7FF',
    };
  }

  if (normalizedTenant === 'curatiio' || normalizedBrand === 'curatiio') {
    return {
      clinicName: 'Curatiio',
      city: 'Stockholm',
      tagline: 'Personlig konsultation och smartare patientresa.',
      heroTitle: 'Vard i premiumformat med medicinsk trygghet',
      heroSubtitle: 'Digital triage, tydlig process och snabb uppfoljning i samma flode.',
      primaryCtaLabel: 'Boka konsultation',
      primaryCtaUrl: '',
      secondaryCtaLabel: 'Las mer',
      secondaryCtaUrl: '',
      services: [],
      trustRating: 4.8,
      trustReviewCount: 0,
      trustSurgeons: 0,
      contactPhone: '',
      contactEmail: '',
      contactAddress: '',
      contactBookingUrl: '',
      themeAccent: '#4E6F68',
      themeAccentSoft: '#DCEBE7',
      themeCanvasFrom: '#F4FBF8',
      themeCanvasTo: '#EFF6FF',
    };
  }

  const title = toTitleFromSlug(normalizedTenant);

  return {
    clinicName: title,
    city: '',
    tagline: 'Specialistvard med tydlig process och personlig uppfoljning.',
    heroTitle: `${title} - konsultation och behandling`,
    heroSubtitle: 'Vi anpassar varje behandlingsplan efter medicinska forutsattningar och malbild.',
    primaryCtaLabel: 'Boka konsultation',
    primaryCtaUrl: '',
    secondaryCtaLabel: 'Las mer',
    secondaryCtaUrl: '',
    services: [],
    trustRating: 4.8,
    trustReviewCount: 0,
    trustSurgeons: 0,
    contactPhone: '',
    contactEmail: '',
    contactAddress: '',
    contactBookingUrl: '',
    themeAccent: '#0F766E',
    themeAccentSoft: '#D7F3EF',
    themeCanvasFrom: '#FFF7EC',
    themeCanvasTo: '#F5F9FF',
  };
}

module.exports = {
  buildDefaultPublicSiteProfile,
  clonePublicSiteProfile,
  normalizePublicSiteProfile,
};
