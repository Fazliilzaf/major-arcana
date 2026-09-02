'use strict';

/**
 * ORD-165 §3 — tenant-stavningen, normaliserad på ETT ställe.
 *
 * Bara TENANT-namnrymden. `hair_tp` betyder tre olika saker i koden — tenant
 * (~30 ställen), brand (~15) och formVariant (~9). Den här modulen rör ENBART
 * tenant och får ALDRIG användas på brand- eller formVariant-värden.
 *
 * Kanoniskt värde är mätt i prod 2026-09-02, inte valt:
 *   42 526 rader   hair-tp-clinic
 *      767 rader   hairtpclinic
 *        0 rader   hair_tp
 *
 * Regler:
 *   - kända Hair TP-varianter → hair-tp-clinic
 *   - curatiio → curatiio (egen tenant, modell B)
 *   - ser ut som Hair TP men är ingen känd variant → null (typo — anroparen ska larma)
 *   - allt annat → passeras oförändrat (en annan, giltig tenant)
 */

const HAIR_TP_CANONICAL = 'hair-tp-clinic';

const HAIR_TP_VARIANTS = Object.freeze([
  'hair-tp-clinic',
  'hairtpclinic',
  'hairtp-clinic',
  'hair_tp',
]);

const KNOWN_TENANTS = Object.freeze([HAIR_TP_CANONICAL, 'curatiio']);

function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Ser värdet ut som Hair TP (utan att vara en känd variant)? */
function looksLikeHairTp(key) {
  return key.includes('hairtp') || key.includes('hair-tp') || key.includes('hair_tp');
}

/**
 * Kända Hair TP-varianter → kanonisk tenant. Hair TP-typo → null. Annan tenant
 * → passeras oförändrat.
 *
 * @param {string} value
 * @returns {string|null}
 */
function canonicalTenantId(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (HAIR_TP_VARIANTS.includes(key)) return HAIR_TP_CANONICAL;
  if (key === 'curatiio') return 'curatiio';
  if (looksLikeHairTp(key)) return null; // typo av Hair TP — larma, inte anta
  return raw; // en annan, giltig tenant
}

/**
 * Är värdet en av klinikens EGNA tenants?
 *
 * Hette tidigare det här men returnerade `canonicalTenantId(value) !== null`,
 * vilket gav `true` för varje sträng som inte var tom eller en Hair TP-typo:
 * `isKnownTenantId('acme-corp')` → true, `isKnownTenantId('SLUMPSTRÄNG')` → true.
 * En grind byggd på den hade släppt igenom allt. Mätt och rättat 2026-09-02.
 */
function isKnownTenantId(value) {
  const canonical = canonicalTenantId(value);
  return canonical !== null && KNOWN_TENANTS.includes(canonical);
}

/** Är värdet en giltig tenant-sträng (känd ELLER en annan, avsiktlig tenant)? */
function isAcceptableTenantId(value) {
  return canonicalTenantId(value) !== null;
}

module.exports = {
  HAIR_TP_CANONICAL,
  HAIR_TP_VARIANTS,
  KNOWN_TENANTS,
  canonicalTenantId,
  isKnownTenantId,
  isAcceptableTenantId,
};
