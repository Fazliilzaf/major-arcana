'use strict';

/**
 * Curatiio Fas 1 — brand-separation runtime.
 *
 * Läser `migration/curatiio-services-seed.json` och slår ihop seed-tjänster
 * i `ccoBookingEngineStore.state.services` utan att röra Hair TP-katalogen.
 * Säkerställer att `service.brand === 'curatiio'` är satt på samtliga
 * Curatiio-tjänster så att brand-isolation kan enforceras i:
 *   - listPublicServices({ brand: 'curatiio' })
 *   - listPublicResources({ brand: 'curatiio' })
 *   - listAvailability({ brand: 'curatiio' })
 *
 * Fas 1 lägger ENDAST till tjänster — inga nya resurser, inga schedules.
 * Fas 2 (curatiio.se widget) och Fas 3 (publik go-live) är utanför scope.
 *
 * Källan av sanning: `migration/curatiio-services-seed.json`. Filen kan
 * uppdateras additivt utan kodändring — engine plockar upp förändringar
 * vid omstart.
 */

const fs = require('node:fs');
const path = require('node:path');

const CURATIIO_BRAND_KEY = 'curatiio';
const CURATIIO_SEED_PATH = 'migration/curatiio-services-seed.json';
const HAIR_TP_BRAND_KEY = 'hair-tp-clinic';

function normalizeBrandKey(value) {
  const key = normalizeText(value).toLowerCase();
  if (!key) return '';
  if (key === HAIR_TP_BRAND_KEY || key === 'hair tp clinic' || key === 'hairtp') {
    return HAIR_TP_BRAND_KEY;
  }
  return key;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Läs in Curatiio seed från `migration/curatiio-services-seed.json`.
 * Returnerar `{ services: [], globalRules: {} }` (tomt om filen saknas).
 */
function loadCuratiioCatalogSeed({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, CURATIIO_SEED_PATH);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      services: asArray(parsed.services),
      globalRules: asObject(parsed.globalRules),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { services: [], globalRules: {} };
    }
    throw error;
  }
}

/**
 * Slå ihop Curatiio seed-services i state.services additivt.
 * - Befintliga services behålls (Hair TP).
 * - Service med `brand === 'curatiio'` skrivs in om id saknas, eller
 *   uppdateras med seed-värden för label, durationMinutes, pricing osv.
 *
 * Returnerar `{ changed: boolean, addedIds: string[], updatedIds: string[] }`.
 */
function mergeCuratiioCatalogIntoEngineState(state, { repoRoot = process.cwd() } = {}) {
  const seed = loadCuratiioCatalogSeed({ repoRoot });
  if (!seed.services.length) {
    return { changed: false, addedIds: [], updatedIds: [] };
  }
  const services = asArray(state.services);
  const byId = new Map(services.map((service) => [normalizeText(service.id), service]));
  const addedIds = [];
  const updatedIds = [];

  for (const seedService of seed.services) {
    const id = normalizeText(seedService.id);
    if (!id) continue;
    const safeSeed = {
      ...asObject(seedService),
      brand: CURATIIO_BRAND_KEY,
      catalogSource: normalizeText(seedService.catalogSource) || 'curatiio_seed',
    };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, safeSeed);
      addedIds.push(id);
      continue;
    }
    const merged = {
      ...existing,
      ...safeSeed,
      brand: CURATIIO_BRAND_KEY,
      pricing: {
        ...(asObject(existing.pricing) || {}),
        ...(asObject(safeSeed.pricing) || {}),
      },
    };
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      byId.set(id, merged);
      updatedIds.push(id);
    }
  }

  if (!addedIds.length && !updatedIds.length) {
    return { changed: false, addedIds, updatedIds };
  }
  state.services = Array.from(byId.values());
  return { changed: true, addedIds, updatedIds };
}

/**
 * Avgör om ett service-objekt tillhör en specifik brand.
 *
 * Regler:
 *   - brand-arg saknas → matchar allt (bakåtkompatibilitet).
 *   - brand-arg = 'curatiio' → kräver `service.brand === 'curatiio'`.
 *   - brand-arg = 'hair-tp-clinic' → matchar service utan brand ELLER
 *     service.brand === 'hair-tp-clinic' (Hair TP-defaults har inte brand
 *     satt idag — så vi accepterar tom brand som Hair TP).
 *   - Annan brand-key → exakt match på service.brand.
 */
function serviceMatchesBrand(service = {}, brand = '') {
  const brandKey = normalizeBrandKey(brand);
  if (!brandKey) return true;
  const serviceBrand = normalizeBrandKey(service.brand);
  if (brandKey === HAIR_TP_BRAND_KEY) {
    return !serviceBrand || serviceBrand === HAIR_TP_BRAND_KEY;
  }
  return serviceBrand === brandKey;
}

/**
 * Samma regel för resurser (Fas 1: alla resurser saknar brand → tillhör Hair TP).
 * När Curatiio-resurser tillkommer (Fas 2) behåller de samma regel.
 */
function resourceMatchesBrand(resource = {}, brand = '') {
  const brandKey = normalizeBrandKey(brand);
  if (!brandKey) return true;
  const resourceBrand = normalizeBrandKey(resource.brand);
  if (brandKey === HAIR_TP_BRAND_KEY) {
    return !resourceBrand || resourceBrand === HAIR_TP_BRAND_KEY;
  }
  return resourceBrand === brandKey;
}

module.exports = {
  CURATIIO_BRAND_KEY,
  CURATIIO_SEED_PATH,
  loadCuratiioCatalogSeed,
  mergeCuratiioCatalogIntoEngineState,
  serviceMatchesBrand,
  resourceMatchesBrand,
};
