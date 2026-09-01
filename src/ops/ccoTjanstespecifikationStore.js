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

const ROOT = path.resolve(__dirname, '../..');
// CCO:s tjänstekatalog — versionerad utgångspunkt, seedad ur Meridiq (engångsfrö).
// ORD-158 · väg A: repofilen är ENDA källan. Ingen data/-kopia — se
// resolveServiceCatalogPath.
const SERVICE_CATALOG_PATH = path.join(ROOT, 'src/ops', 'cco-service-catalog.json');
const DOC_CATALOG_PATH = path.join(ROOT, 'src/ops', 'hairtp-document-types.catalog.json');
const INHERITANCE_PATH = path.join(ROOT, 'src/ops', 'cco-service-inheritance.json');

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

/**
 * ORD-158 · väg A: repofilen är ENDA källan för tjänstekatalogen.
 *
 * Tidigare fanns en `data/cco-service-catalog.json`-gren ("klinikens redigerbara
 * kopia") som vann om den existerade. Men det fanns ingen skrivväg till den —
 * kommentaren beskrev en funktion som aldrig byggdes. Ändå lät den, en gång
 * seedad på Render-disken, en gitignorerad kopia skugga repofilen för evigt,
 * så nästa katalogändring aldrig nådde prod.
 *
 * Valet är väg A (ta bort skuggan), inte väg B (bygga skrivväg + sammanfogning).
 * Det står här med avsikt — se ORD-158.
 */
function resolveServiceCatalogPath() {
  return SERVICE_CATALOG_PATH;
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
      // ORD-149: momssatsen ligger per rad (explicit på alla 84). Saknat fält =
      // null, inte en tyst 25:a — samma lärdom som legalReviewStatus.
      vatRatePercent:
        typeof s.vatRatePercent === 'number' && Number.isFinite(s.vatRatePercent)
          ? s.vatRatePercent
          : null,
      fromPrice: /\bfrån\b/i.test(String(s.price ?? '')),
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
 * Avrundning — ETT ställe (ORD-149 §5). Hela kronor, vanlig avrundning.
 * exkl = round(pris / 1.25); moms = pris − exkl. Summan bevaras alltid
 * (exkl + moms === pris), vilket är det som ska stämma mot Fortnox.
 */
function roundKronor(n) {
  return Math.round(Number(n) || 0);
}

/**
 * Momssatsen (ORD-149). Per rad när ett serviceId anges; annars katalogens
 * default (top-level `vatRatePercent`) för de ställen som saknar serviceId.
 * Ingen hårdkodad 25:a i kod — saknas värdet blir svaret null, inte ett tal.
 */
function resolveVatRatePercent(serviceId = null) {
  try {
    const raw = JSON.parse(fs.readFileSync(resolveServiceCatalogPath(), 'utf8'));
    if (serviceId != null && serviceId !== '') {
      const spec = asServices(raw).find((s) => String(s.apiId) === String(serviceId));
      const pct = Number(spec?.vatRatePercent);
      return Number.isFinite(pct) && pct > 0 ? pct : null;
    }
    const pct = Number(raw.vatRatePercent);
    return Number.isFinite(pct) && pct > 0 ? pct : null;
  } catch {
    return null;
  }
}

/**
 * Priset är INKLUSIVE moms (ORD-149) — momsen räknas BAKÅT:
 *   exkl = pris / (1 + sats/100)
 *   moms = pris − exkl
 * Returnerar { grossKr, netKr, vatKr, vatRatePercent, fromPrice, zeroPrice }.
 *   - fromPrice (från-pris, spann): netKr/vatKr = null — ett spann är inget exakt belopp.
 *   - zeroPrice (0 kr): satsen finns men ingen momsrad.
 *   - saknad/ogiltig sats: netKr/vatKr = null (saknat fält betyder inget).
 */
function computePriceVatBreakdown(priceKr, vatRatePercent, { fromPrice = false } = {}) {
  const kr = Number(priceKr) || 0;
  const rate = Number(vatRatePercent);
  if (fromPrice) {
    return {
      grossKr: kr,
      netKr: null,
      vatKr: null,
      vatRatePercent: Number.isFinite(rate) && rate > 0 ? rate : null,
      fromPrice: true,
      zeroPrice: false,
    };
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      grossKr: kr,
      netKr: null,
      vatKr: null,
      vatRatePercent: null,
      fromPrice: false,
      zeroPrice: false,
    };
  }
  if (!kr) {
    return {
      grossKr: 0,
      netKr: 0,
      vatKr: 0,
      vatRatePercent: rate,
      fromPrice: false,
      zeroPrice: true,
    };
  }
  const net = roundKronor(kr / (1 + rate / 100));
  return {
    grossKr: kr,
    netKr: net,
    vatKr: kr - net,
    vatRatePercent: rate,
    fromPrice: false,
    zeroPrice: false,
  };
}

/** Momsbelopp (kr) ur ett inklusivt pris — bakåt, inte pris × sats. */
function computeVatFromPrice(priceKr, vatRatePercent = null) {
  const rate = Number.isFinite(vatRatePercent) ? vatRatePercent : resolveVatRatePercent();
  return computePriceVatBreakdown(priceKr, rate).vatKr;
}

/** Tre rader för en tjänst: exkl / moms / att betala (ORD-149 §4). */
function resolveServiceVatBreakdown(serviceId) {
  const spec = getServiceSpec(serviceId);
  if (!spec) return null;
  return computePriceVatBreakdown(spec.priceKr, spec.vatRatePercent, { fromPrice: spec.fromPrice });
}

/**
 * Tjänstespecifikationens version — en rad i katalogen (ORD-143). Offerten
 * snapshottar den vid skapandet så det går att se vad som gällde den dagen.
 */
function resolveTjanstespecVersion() {
  try {
    const raw = JSON.parse(fs.readFileSync(resolveServiceCatalogPath(), 'utf8'));
    return String(raw.tjanstespecVersion || '').trim() || '2026.03';
  } catch {
    return '2026.03';
  }
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
  DOC_CATALOG_PATH,
  INHERITANCE_PATH,
  resolveServiceCatalogPath,
  loadServices,
  listServiceSpecs,
  getServiceSpec,
  resolveServicePrice,
  resolveVatRatePercent,
  computeVatFromPrice,
  computePriceVatBreakdown,
  resolveServiceVatBreakdown,
  roundKronor,
  resolveTjanstespecVersion,
  getRequiredUnderlag,
  getUnderlagSource,
  resolveInheritance,
  loadInheritance,
  getCatalogMeta,
  parsePriceKr,
};
