'use strict';

/**
 * Hair TP operational betänketid (steg 6, 9-stegs kundresa).
 * Not the same as Distansavtalslagen 14-day withdrawal right in contract PDFs.
 *
 * Legacy: existing records may still carry older multi-day coolingOffEndsAt —
 * never rewritten on signed/archived cases without owner GO.
 * New offers/agreements default to HAIR_TP_COOLING_OFF_DAYS (2).
 */
const HAIR_TP_COOLING_OFF_DAYS = (() => {
  const raw = Number(process.env.CCO_HAIR_TP_COOLING_OFF_DAYS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30) return Math.floor(raw);
  return 2;
})();

/** @deprecated Use HAIR_TP_COOLING_OFF_DAYS — alias for importers */
const DEFAULT_COOLING_OFF_DAYS = HAIR_TP_COOLING_OFF_DAYS;

function resolveHairTpCoolingOffDays(explicitDays) {
  const n = Number(explicitDays);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return HAIR_TP_COOLING_OFF_DAYS;
}

/**
 * When persisting a new sent offer/agreement, use policy default unless explicit override.
 * Signed/archived rows keep their stored coolingOffDays / coolingOffEndsAt.
 */
function coolingOffDaysForNewHairTpRecord(storedDays) {
  return resolveHairTpCoolingOffDays(storedDays);
}

module.exports = {
  HAIR_TP_COOLING_OFF_DAYS,
  DEFAULT_COOLING_OFF_DAYS,
  resolveHairTpCoolingOffDays,
  coolingOffDaysForNewHairTpRecord,
};
