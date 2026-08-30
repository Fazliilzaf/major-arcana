'use strict';

/**
 * ORD-150 · Tjänstespecifikationer — katalogen + grinden.
 *
 * Femton tjänstespecifikationer (SP-förteckningen §2.3, mars 2026) täcker delar
 * av de 84 tjänsterna. Mappningen är EXPLICIT (`serviceToSpec`), aldrig
 * namnmatchad — samma regel och skäl som `cco-service-inheritance.json`
 * (ORD-142 tappade ett dokument på filnamn i två dygn).
 *
 * Versionen är `currentVersion` — samma fältnamn och semantik som
 * `ccoTemplateRegistry` (ingen andra versionsmodell). Saknas en koppling betyder
 * det "saknar spec", aldrig tyst "har en".
 *
 * Grinden (orderns viktigaste punkt) — fail-closed:
 *   påstående + kopplad version   →  får skickas
 *   påstående + ingen koppling    →  BLOCKERAS (kastar OFFER_SPEC_NOT_LINKED)
 *   inget påstående               →  får skickas
 */

const fs = require('node:fs');
const path = require('node:path');

const KATALOG_PATH = path.join(__dirname, 'cco-tjanstespec-katalog.json');

function readKatalog() {
  return JSON.parse(fs.readFileSync(KATALOG_PATH, 'utf8'));
}

function normalizeId(value) {
  return String(value ?? '').trim();
}

/** Alla 15 specar (katalograder med clinics i plural + legalReviewStatus). */
function listSpecifications() {
  const raw = readKatalog();
  return Array.isArray(raw.specifications) ? raw.specifications : [];
}

function getSpecification(specId) {
  const key = normalizeId(specId);
  if (!key) return null;
  return listSpecifications().find((s) => s.id === key) || null;
}

/** Vilken spec täcker en tjänst? null = ingen koppling (saknar spec). */
function resolveServiceSpecification(serviceId) {
  const key = normalizeId(serviceId);
  if (!key) return null;
  const raw = readKatalog();
  const specId = raw.serviceToSpec && raw.serviceToSpec[key];
  return specId ? getSpecification(specId) : null;
}

/** Versionen för en spec — `currentVersion`, samma fält som ccoTemplateRegistry. */
function resolveSpecificationVersion(specId) {
  const spec = getSpecification(specId);
  return spec ? Number(spec.currentVersion) || null : null;
}

/** De tjänster som EXPLICIT saknar spec (skägg/ögonbryn — dokumentet måste skrivas). */
function listServicesMissingSpecification() {
  const raw = readKatalog();
  return Array.isArray(raw.missingSpecServiceIds) ? raw.missingSpecServiceIds.slice() : [];
}

function isServiceMissingSpecification(serviceId) {
  return listServicesMissingSpecification().includes(normalizeId(serviceId));
}

/**
 * Grinden — fail-closed. En offert som gör påståendet ("tjänstespecifikation
 * tillhandahållits") får inte skickas utan en kopplad specifikation.
 * Kastar { code: 'OFFER_SPEC_NOT_LINKED', statusCode: 403 }.
 */
function assertOfferSpecSatisfied({ serviceId, makesClaim = false } = {}) {
  if (!makesClaim) return { ok: true, satisfied: 'no_claim' };
  const spec = resolveServiceSpecification(serviceId);
  if (!spec) {
    const err = new Error(
      `Offerten påstår att tjänstespecifikation tillhandahållits, men tjänsten ${normalizeId(serviceId) || '(okänd)'} har ingen kopplad specifikation.`
    );
    err.code = 'OFFER_SPEC_NOT_LINKED';
    err.statusCode = 403;
    throw err;
  }
  return {
    ok: true,
    satisfied: 'linked',
    specId: spec.id,
    version: Number(spec.currentVersion) || null,
  };
}

module.exports = {
  KATALOG_PATH,
  listSpecifications,
  getSpecification,
  resolveServiceSpecification,
  resolveSpecificationVersion,
  listServicesMissingSpecification,
  isServiceMissingSpecification,
  assertOfferSpecSatisfied,
};
