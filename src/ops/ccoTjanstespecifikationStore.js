'use strict';

/**
 * Tjänstespecifikation (ORD-133 · §3).
 *
 * Tjänstespecifikationen är INTE ett dokument bland de 45. Den är en rad i
 * CCO:s tjänstekatalog som offert och journal refererar till via `serviceId`:
 *
 *   - serviceId          (CCO:s eget id — seedat från Meridiqs apiId)
 *   - metod/omfattning   (category + name)
 *   - tid                (durationMin / duration)
 *   - pris               (en nivå per tjänst — aldrig fritext i ett dokument)
 *   - krävda underlag    (reverse-mappning av katalogens `serviceIds`)
 *
 * Källa: CCO:s tjänstekatalog är kanonisk. Riktningen är enkelriktad och
 * slutar i CCO (ORD-134) — Meridiq-exporten var ett engångsfrö (82 tjänster);
 * CCO äger nu datan och ingen import skriver över det kliniken matat in.
 * Ändras priset ändras det på ett ställe; dokument som refererar tjänsten
 * behåller det pris de skrevs med via sin snapshot.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../config');

const ROOT = path.resolve(__dirname, '../..');
// CCO:s tjänstekatalog — versionerad utgångspunkt, seedad ur Meridiq (engångsfrö).
const SERVICE_CATALOG_PATH = path.join(ROOT, 'src/ops', 'cco-service-catalog.json');
// Klinikens redigerbara kopia — på beständig disk via config.dataDir
// (/var/data i prod, ./data lokalt), precis som de andra storarna. Seedas från
// SERVICE_CATALOG_PATH vid första start om den saknas.
const LIVE_SERVICE_CATALOG_PATH = path.join(config.dataDir, 'cco-service-catalog.json');
const DOC_CATALOG_PATH = path.join(ROOT, 'src/ops', 'hairtp-document-types.catalog.json');
const INHERITANCE_PATH = path.join(ROOT, 'src/ops', 'cco-service-inheritance.json');

let cachedServices = null;
let cachedCatalogPath = null;

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

/**
 * Vilken fil läses? Klinikens kopia (`data/`) vinner om den finns; annars
 * seedas den från den versionerade utgångspunkten (`src/ops/`). Seedern får
 * aldrig krascha — faller tillbaka på repofilen om `data/` inte kan skrivas.
 */
function resolveServiceCatalogPath() {
  if (cachedCatalogPath) return cachedCatalogPath;
  if (fs.existsSync(LIVE_SERVICE_CATALOG_PATH)) {
    cachedCatalogPath = LIVE_SERVICE_CATALOG_PATH;
    return cachedCatalogPath;
  }
  if (fs.existsSync(SERVICE_CATALOG_PATH)) {
    try {
      fs.mkdirSync(path.dirname(LIVE_SERVICE_CATALOG_PATH), { recursive: true });
      fs.copyFileSync(SERVICE_CATALOG_PATH, LIVE_SERVICE_CATALOG_PATH);
      cachedCatalogPath = LIVE_SERVICE_CATALOG_PATH;
    } catch {
      cachedCatalogPath = SERVICE_CATALOG_PATH;
    }
    return cachedCatalogPath;
  }
  cachedCatalogPath = SERVICE_CATALOG_PATH;
  return cachedCatalogPath;
}

function loadServices() {
  if (cachedServices) return cachedServices;
  const raw = JSON.parse(fs.readFileSync(resolveServiceCatalogPath(), 'utf8'));
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

/**
 * Katalogmetadata — `exportedAt` ska synas i API-svaret (ORD-134 · punkt 2)
 * så att en gammal prislista går att se utan att öppna en JSON-fil.
 */
function getCatalogMeta() {
  const raw = JSON.parse(fs.readFileSync(resolveServiceCatalogPath(), 'utf8'));
  return {
    exportedAt: raw.exportedAt || null,
    source: raw.source || null,
    count: asServices(raw).length,
  };
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
 * Momssatsen — en enda uppgift i tjänstekatalogen (ORD-143). Estetisk
 * verksamhet = momspliktig. Ändras satsen ändras den här, inte i mallar.
 */
function resolveVatRatePercent() {
  try {
    const raw = JSON.parse(fs.readFileSync(resolveServiceCatalogPath(), 'utf8'));
    const pct = Number(raw.vatRatePercent);
    return Number.isFinite(pct) && pct > 0 ? pct : 25;
  } catch {
    return 25;
  }
}

/** Momsbelopp ur pris (kr), avrundat till hela kronor. */
function computeVatFromPrice(priceKr, vatRatePercent = null) {
  const pct = Number.isFinite(vatRatePercent) ? vatRatePercent : resolveVatRatePercent();
  const kr = Number(priceKr) || 0;
  if (!kr) return 0;
  return Math.round(kr * (pct / 100));
}

/**
 * Ärv-tabellen (ORD-135): explicit tjänst → huvudtjänst, ej namnmatchning.
 * Returnerar `{ rootServiceId, chain, inherited }` så att man ser varifrån
 * ett krav kommer.
 */
function loadInheritance() {
  try {
    return JSON.parse(fs.readFileSync(INHERITANCE_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}

function resolveInheritance(serviceId) {
  const key = String(serviceId ?? '').trim();
  const table = loadInheritance().inheritsFrom || {};
  const chain = [key];
  const seen = new Set([key]);
  let current = key;
  while (table[current]) {
    current = String(table[current]);
    if (seen.has(current)) break; // cykelskydd
    seen.add(current);
    chain.push(current);
  }
  return { rootServiceId: current, chain, inherited: chain.length > 1 };
}

/**
 * Krävda underlag för en tjänst — det är katalogens `serviceIds` sett från
 * andra hållet: vilka dokumenttyper som listar `serviceId` i sitt `serviceIds`.
 * Ärvda tjänster (ORD-135) får huvudtjänstens underlag.
 * (Datat fylls ur Fazlis arbetsblad; tomt tills dess.)
 */
function getRequiredUnderlag(serviceId) {
  const key = String(serviceId ?? '').trim();
  if (!key) return [];
  const { rootServiceId } = resolveInheritance(key);
  let docCatalog;
  try {
    docCatalog = JSON.parse(fs.readFileSync(DOC_CATALOG_PATH, 'utf8'));
  } catch {
    return [];
  }
  const types = Array.isArray(docCatalog?.types) ? docCatalog.types : [];
  return types
    .filter((t) => Array.isArray(t.serviceIds) && t.serviceIds.includes(rootServiceId))
    .map((t) => t.id);
}

/**
 * Källan för en tjänsts underlag — för utdata: direkt eller ärvd (med kedja).
 */
function getUnderlagSource(serviceId) {
  const key = String(serviceId ?? '').trim();
  if (!key) return { serviceId: key, inherited: false, chain: [] };
  const { rootServiceId, chain, inherited } = resolveInheritance(key);
  return { serviceId: key, rootServiceId, inherited, chain };
}

module.exports = {
  SERVICE_CATALOG_PATH,
  LIVE_SERVICE_CATALOG_PATH,
  DOC_CATALOG_PATH,
  INHERITANCE_PATH,
  resolveServiceCatalogPath,
  loadServices,
  listServiceSpecs,
  getServiceSpec,
  resolveServicePrice,
  resolveVatRatePercent,
  computeVatFromPrice,
  getRequiredUnderlag,
  getUnderlagSource,
  resolveInheritance,
  loadInheritance,
  getCatalogMeta,
  parsePriceKr,
};
