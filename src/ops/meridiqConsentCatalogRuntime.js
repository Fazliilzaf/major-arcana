'use strict';

/**
 * Meridiq consent catalog runtime (P6.8.8).
 *
 * Läser `migration/meridiq/consent-catalog.json` (39 Meridiq-samtycken),
 * normaliserar till en stabil shape och bygger en staff-readout grupperad
 * per brand (Hair TP Clinic / Curatiio / övrigt).
 *
 * Per-tjänst-bindning (P6.8.9) skjuts upp — kräver mappnings-spec mot
 * `service-bindings-catalog.json`. Denna runtime exponerar bara katalogen
 * i operatorsläsning + är förberedd för att senare wirea bindning.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CATALOG_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migration',
  'meridiq',
  'consent-catalog.json'
);

const DEFAULT_SERVICE_BINDINGS_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'migration',
  'meridiq',
  'service-bindings-catalog.json'
);

const TREATMENT_TYPE_MATCHERS = Object.freeze([
  { type: 'fue', patterns: ['fue', 'hårtransplantation', 'hartransplantation'] },
  { type: 'dhi', patterns: ['dhi'] },
  { type: 'prp', patterns: ['prp'] },
  { type: 'microneedling', patterns: ['microneedling'] },
  { type: 'hair_transplant', patterns: ['hair', 'transplant', 'hår'] },
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deriveLocale(title = '') {
  const upper = String(title || '').toUpperCase();
  if (upper.includes('- ENG')) return 'en';
  if (upper.includes('- SWE')) return 'sv';
  return 'sv';
}

function deriveBrandKey(brand = '') {
  const raw = normalizeText(brand).toLowerCase();
  if (!raw) return 'other';
  if (raw.includes('hair') && raw.includes('tp')) return 'hair_tp_clinic';
  if (raw.includes('curatiio') || raw.includes('curaito') || raw.includes('curatio')) {
    return 'curatiio';
  }
  return 'other';
}

function normalizeConsentEntry(raw = {}) {
  const safe = asObject(raw);
  const apiIdRaw = safe.apiId ?? safe.id ?? safe.api_id;
  const apiId = Number(apiIdRaw);
  if (!Number.isFinite(apiId)) return null;
  const title = normalizeText(safe.title) || `Samtycke ${apiId}`;
  const brand = normalizeText(safe.brand);
  const versionRaw = safe.version ?? safe.consentVersion ?? '0';
  const version = normalizeText(String(versionRaw)) || '0';
  return {
    id: `meridiq-consent-${apiId}`,
    apiId,
    title,
    brand: brand || 'Övrigt',
    brandKey: deriveBrandKey(brand),
    locale: deriveLocale(title),
    version,
    isActive: safe.isActive !== false,
    publishBeforeAfterPhotos: safe.publishBeforeAfterPhotos === true,
    letterText: normalizeText(safe.letterText),
    hasLetterText: Boolean(normalizeText(safe.letterText)),
    letterTextLength: normalizeText(safe.letterText).length,
    source: 'meridiq_consent_catalog',
  };
}

/**
 * Läs och normalisera samtyckes-katalogen från Meridiq.
 *
 * @param {object} options
 * @param {string} [options.filePath] — överrid för test/migrering.
 * @returns {{ catalog: object, consents: Array }}
 */
function loadMeridiqConsentCatalog({ filePath } = {}) {
  const resolvedPath = filePath || DEFAULT_CATALOG_PATH;
  let payload;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    payload = JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        catalog: {
          source: 'meridiq_consent_catalog',
          filePath: resolvedPath,
          exportedAt: '',
          count: 0,
          loaded: 0,
        },
        consents: [],
      };
    }
    throw error;
  }
  const safe = asObject(payload);
  const consents = asArray(safe.consents).map(normalizeConsentEntry).filter(Boolean);
  return {
    catalog: {
      source: normalizeText(safe.source) || 'meridiq_consent_catalog',
      filePath: resolvedPath,
      exportedAt: normalizeText(safe.exportedAt),
      count: Number(safe.count) || consents.length,
      loaded: consents.length,
    },
    consents,
  };
}

function bucketByBrand(consents = []) {
  const groups = new Map();
  for (const entry of asArray(consents)) {
    const key = entry.brandKey || 'other';
    if (!groups.has(key)) {
      groups.set(key, {
        brandKey: key,
        brandLabel: entry.brand || (key === 'other' ? 'Övrigt' : key),
        consents: [],
      });
    }
    groups.get(key).consents.push(entry);
  }
  for (const group of groups.values()) {
    group.consents.sort((left, right) => {
      const titleCompare = String(left.title).localeCompare(String(right.title), 'sv');
      if (titleCompare !== 0) return titleCompare;
      return left.apiId - right.apiId;
    });
  }
  return Array.from(groups.values()).sort((left, right) => {
    const order = { hair_tp_clinic: 0, curatiio: 1, other: 2 };
    const leftOrder = order[left.brandKey] ?? 9;
    const rightOrder = order[right.brandKey] ?? 9;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.brandLabel).localeCompare(String(right.brandLabel), 'sv');
  });
}

/**
 * Bygg staff-readout grupperad per brand. Returnerar både totals och
 * brand-buckets med kompakta entries.
 *
 * @param {object} options
 * @param {boolean} [options.activeOnly=true]
 * @param {string} [options.filePath] — overrid för test.
 */
function loadServiceBindingsCatalog({ filePath } = {}) {
  const resolvedPath = filePath || DEFAULT_SERVICE_BINDINGS_PATH;
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const payload = JSON.parse(raw);
    return {
      filePath: resolvedPath,
      services: asArray(payload.services),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { filePath: resolvedPath, services: [] };
    }
    throw error;
  }
}

function normalizeTreatmentType(value = '') {
  const key = normalizeKey(value);
  if (!key) return 'hair_transplant';
  for (const matcher of TREATMENT_TYPE_MATCHERS) {
    if (matcher.type === key) return matcher.type;
  }
  for (const matcher of TREATMENT_TYPE_MATCHERS) {
    if (matcher.patterns.some((pattern) => key.includes(pattern))) {
      return matcher.type;
    }
  }
  return 'hair_transplant';
}

function serviceMatchesTreatmentType(service = {}, treatmentType = '') {
  const type = normalizeTreatmentType(treatmentType);
  const haystack = `${normalizeKey(service.name)} ${normalizeKey(service.category)}`;
  const matcher = TREATMENT_TYPE_MATCHERS.find((item) => item.type === type);
  if (!matcher) return false;
  return matcher.patterns.some((pattern) => haystack.includes(pattern));
}

function pickServiceForTreatmentType(services = [], treatmentType = '') {
  const list = asArray(services).filter((service) => asArray(service.consents).length > 0);
  const direct = list.find((service) => serviceMatchesTreatmentType(service, treatmentType));
  if (direct) return direct;
  return list.find((service) => serviceMatchesTreatmentType(service, 'hair_transplant')) || null;
}

/**
 * Resolve consent template for a treatment type via Meridiq service bindings + catalog.
 *
 * @param {string} treatmentType — t.ex. fue, dhi, prp, hair_transplant
 * @param {object} [options]
 * @param {string} [options.catalogPath]
 * @param {string} [options.serviceBindingsPath]
 */
function resolveTemplate(treatmentType, options = {}) {
  const normalizedType = normalizeTreatmentType(treatmentType);
  const { consents } = loadMeridiqConsentCatalog({ filePath: options.catalogPath });
  const { services } = loadServiceBindingsCatalog({ filePath: options.serviceBindingsPath });
  const service = pickServiceForTreatmentType(services, normalizedType);
  const consentRef = asArray(service?.consents)[0];
  if (!consentRef?.consentApiId) {
    return {
      found: false,
      treatmentType: normalizedType,
      reason: 'no_consent_binding_for_treatment_type',
    };
  }
  const entry = consents.find((item) => item.apiId === Number(consentRef.consentApiId));
  if (!entry || entry.isActive === false) {
    return {
      found: false,
      treatmentType: normalizedType,
      reason: 'consent_catalog_entry_missing',
      consentApiId: consentRef.consentApiId,
    };
  }
  const label = `Jag godkänner behandlingssamtycket: ${entry.title}`;
  return {
    found: true,
    treatmentType: normalizedType,
    serviceApiId: service?.apiId ?? null,
    template: {
      id: entry.id,
      apiId: entry.apiId,
      title: entry.title,
      version: entry.version,
      brand: entry.brand,
      required: true,
      hasLetterText: entry.hasLetterText,
      letterText: entry.letterText,
    },
    checkboxes: [
      {
        name: 'consent_ack',
        label,
        required: true,
      },
    ],
  };
}

function buildMeridiqConsentReadout({ activeOnly = true, filePath } = {}) {
  const { catalog, consents } = loadMeridiqConsentCatalog({ filePath });
  const filtered = activeOnly ? consents.filter((entry) => entry.isActive !== false) : consents;
  const groups = bucketByBrand(filtered);
  return {
    source: catalog.source,
    filePath: catalog.filePath,
    exportedAt: catalog.exportedAt,
    declaredCount: catalog.count,
    loadedCount: catalog.loaded,
    totalCount: consents.length,
    activeCount: consents.filter((entry) => entry.isActive !== false).length,
    inactiveCount: consents.filter((entry) => entry.isActive === false).length,
    activeOnly: activeOnly === true,
    returnedCount: filtered.length,
    brands: groups.map((group) => ({
      brandKey: group.brandKey,
      brandLabel: group.brandLabel,
      count: group.consents.length,
      consents: group.consents.map((entry) => ({
        id: entry.id,
        apiId: entry.apiId,
        title: entry.title,
        brand: entry.brand,
        brandKey: entry.brandKey,
        locale: entry.locale,
        version: entry.version,
        isActive: entry.isActive,
        publishBeforeAfterPhotos: entry.publishBeforeAfterPhotos,
        hasLetterText: entry.hasLetterText,
        letterTextLength: entry.letterTextLength,
      })),
    })),
  };
}

module.exports = {
  DEFAULT_CATALOG_PATH,
  DEFAULT_SERVICE_BINDINGS_PATH,
  buildMeridiqConsentReadout,
  loadMeridiqConsentCatalog,
  loadServiceBindingsCatalog,
  normalizeConsentEntry,
  normalizeTreatmentType,
  resolveTemplate,
};
