'use strict';

/**
 * Tjänstespecifikation (ORD-133 · §3).
 *
 * Tjänstespecifikationen är INTE ett dokument bland de 45. Den är en rad i
 * tjänstekatalogen som offert och journal refererar till via `serviceId`:
 *
 *   - serviceId          (apiId från Meridiq, stabil referens)
 *   - metod/omfattning   (category + name)
 *   - tid                (durationMin / duration)
 *   - pris               (en nivå per tjänst — aldrig fritext i ett dokument)
 *   - krävda underlag    (reverse-mappning av katalogens `serviceIds`)
 *
 * Kanonisk prisdata: `migration/meridiq-service-catalog.json` (82 tjänster).
 * Ändras priset ändras det på ett ställe; dokument som refererar tjänsten
 * behåller det pris de skrevs med via sin egen snapshot (se document instance).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const MERIDIQ_CATALOG_PATH = path.join(ROOT, 'migration', 'meridiq-service-catalog.json');
const DOC_CATALOG_PATH = path.join(ROOT, 'src/ops', 'hairtp-document-types.catalog.json');

let cachedServices = null;

function asServices(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.services)) return raw.services;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function parsePriceKr(price) {
  if (typeof price === 'number') return price;
  const digits = String(price || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function loadServices() {
  if (cachedServices) return cachedServices;
  const raw = JSON.parse(fs.readFileSync(MERIDIQ_CATALOG_PATH, 'utf8'));
  cachedServices = asServices(raw)
    .filter((s) => s && s.apiId != null)
    .map((s) => ({
      serviceId: String(s.apiId),
      name: typeof s.name === 'string' ? s.name.trim() : '',
      category: typeof s.category === 'string' ? s.category.trim() : '',
      brand: typeof s.brand === 'string' ? s.brand.trim() : '',
      priceLabel: typeof s.price === 'string' ? s.price.trim() : String(s.price ?? ''),
      priceKr: parsePriceKr(s.price),
      durationMin: typeof s.durationMin === 'number' ? s.durationMin : null,
      duration: typeof s.duration === 'string' ? s.duration.trim() : '',
      active: s.active !== false,
    }));
  return cachedServices;
}

function listServiceSpecs({ activeOnly = false } = {}) {
  const all = loadServices();
  return activeOnly ? all.filter((s) => s.active) : all;
}

function getServiceSpec(serviceId) {
  const key = String(serviceId ?? '').trim();
  if (!key) return null;
  return loadServices().find((s) => s.serviceId === key) || null;
}

/** Pris för en tjänst — referens, aldrig inklistrad text i ett dokument. */
function resolveServicePrice(serviceId) {
  const spec = getServiceSpec(serviceId);
  return spec ? spec.priceLabel : null;
}

/**
 * Krävda underlag för en tjänst — det är katalogens `serviceIds` sett från
 * andra hållet: vilka dokumenttyper som listar `serviceId` i sitt `serviceIds`.
 * (Datat fylls ur Fazlis arbetsblad; tomt tills dess.)
 */
function getRequiredUnderlag(serviceId) {
  const key = String(serviceId ?? '').trim();
  if (!key) return [];
  let docCatalog;
  try {
    docCatalog = JSON.parse(fs.readFileSync(DOC_CATALOG_PATH, 'utf8'));
  } catch {
    return [];
  }
  const types = Array.isArray(docCatalog?.types) ? docCatalog.types : [];
  return types
    .filter((t) => Array.isArray(t.serviceIds) && t.serviceIds.includes(key))
    .map((t) => t.id);
}

module.exports = {
  MERIDIQ_CATALOG_PATH,
  DOC_CATALOG_PATH,
  loadServices,
  listServiceSpecs,
  getServiceSpec,
  resolveServicePrice,
  getRequiredUnderlag,
  parsePriceKr,
};
