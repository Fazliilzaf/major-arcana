'use strict';

/**
 * Follow-up draft planner (P6.4.8).
 *
 * Skapar plan-rader för automatiska uppföljnings-utkast 4 / 6 / 12 månader
 * efter signerad TP-transplant. Planern är ren och stateless — scheduler
 * (`cco_followup_draft_generator`) ansvarar för att persistera planState
 * och att skapa konkreta journalutkast (via `journalStore.upsertEntry`).
 *
 * Inputs:
 *   - signedEncounters: [{ encounterId, patientId, tenantId, type, signedAt, ... }]
 *   - existingFollowups: [{ patientId, treatmentEncounterId, formVariant, locked, ... }]
 *   - plannedState: [{ tenantId, encounterId, followupMonth, plannedAt, draftEntryId? }]
 *   - today: Date|string (default = nu)
 *   - leadDays: hur långt i förväg vi vill skapa draft (default 30 dygn)
 *
 * Output:
 *   { planned: [PlanRow], summary: { tenantId, transplantCount, plannedCount, ... } }
 *
 * En PlanRow skapas per (encounter, månad) där:
 *   - encounter.type är transplant-kompatibel (transplant/tp/tp_treatment)
 *   - encounter.signedAt finns
 *   - signedAt + N månader ≤ today + leadDays
 *   - ingen befintlig follow-up matchar (encounter, månad)
 *   - ingen prior plannedState matchar (encounter, månad)
 */

const FOLLOWUP_MONTHS = Object.freeze([4, 6, 12]);

const FOLLOWUP_VARIANT_BY_MONTH = Object.freeze({
  4: '4_manader',
  6: '6_manader',
  12: '12_manader',
});

const TRANSPLANT_ENCOUNTER_KEYS = new Set([
  'transplant',
  'tp_treatment',
  'tp',
  'tp_transplant',
  'hair_transplant',
  'hairtransplant',
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

function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function addMonthsUtc(date, months) {
  const next = new Date(date.getTime());
  const desiredMonth = next.getUTCMonth() + Math.max(0, Number(months) || 0);
  next.setUTCMonth(desiredMonth);
  return next;
}

function isTransplantEncounter(input = {}) {
  const safe = asObject(input);
  const type = normalizeKey(safe.type || safe.encounterType || safe.journalType);
  if (TRANSPLANT_ENCOUNTER_KEYS.has(type)) return true;
  if (normalizeKey(safe.formVariant) === 'hair_tp' && type === 'tp_treatment') return true;
  return false;
}

function normalizeSignedEncounter(input = {}) {
  const safe = asObject(input);
  const encounterId = normalizeText(safe.encounterId || safe.treatmentEncounterId || safe.entryId);
  const patientId = normalizeText(safe.patientId);
  const tenantId = normalizeText(safe.tenantId);
  const signedAt = parseDate(safe.signedAt || safe.signed_at);
  if (!encounterId || !patientId || !tenantId || !signedAt) return null;
  return {
    encounterId,
    patientId,
    tenantId,
    type: normalizeKey(safe.type || safe.encounterType || safe.journalType) || 'tp_treatment',
    signedAt: signedAt.toISOString(),
    signedAtMs: signedAt.getTime(),
    raw: safe,
  };
}

function existingFollowupKey(entry = {}) {
  const safe = asObject(entry);
  const encounterId = normalizeText(safe.treatmentEncounterId || safe.encounterId);
  const variant = normalizeKey(safe.formVariant);
  return encounterId && variant ? `${encounterId}::${variant}` : '';
}

function plannedStateKey(entry = {}) {
  const safe = asObject(entry);
  const encounterId = normalizeText(safe.encounterId);
  const month = Number(safe.followupMonth);
  if (!encounterId || !Number.isFinite(month)) return '';
  return `${encounterId}::${FOLLOWUP_VARIANT_BY_MONTH[month] || `${month}_manader`}`;
}

function planFollowupDrafts({
  signedEncounters = [],
  existingFollowups = [],
  plannedState = [],
  today,
  leadDays = 30,
  tenantId = '',
} = {}) {
  const todayDate = parseDate(today) || new Date();
  const horizonMs = todayDate.getTime() + Math.max(0, Number(leadDays) || 0) * 24 * 60 * 60 * 1000;
  const tenantFilter = normalizeText(tenantId);

  const encounters = asArray(signedEncounters)
    .map(normalizeSignedEncounter)
    .filter(Boolean)
    .filter((entry) => (tenantFilter ? entry.tenantId === tenantFilter : true))
    .filter((entry) => isTransplantEncounter(entry));

  const existingKeys = new Set(
    asArray(existingFollowups)
      .map(existingFollowupKey)
      .filter(Boolean)
  );

  const plannedKeys = new Set(
    asArray(plannedState)
      .map(plannedStateKey)
      .filter(Boolean)
  );

  const planned = [];

  for (const encounter of encounters) {
    for (const month of FOLLOWUP_MONTHS) {
      const dueDate = addMonthsUtc(new Date(encounter.signedAtMs), month);
      if (dueDate.getTime() > horizonMs) continue;
      const variant = FOLLOWUP_VARIANT_BY_MONTH[month];
      const key = `${encounter.encounterId}::${variant}`;
      const dueIso = dueDate.toISOString();
      if (existingKeys.has(key)) {
        planned.push({
          status: 'skipped_existing',
          reason: 'follow_up_entry_exists',
          encounterId: encounter.encounterId,
          patientId: encounter.patientId,
          tenantId: encounter.tenantId,
          signedAt: encounter.signedAt,
          followupMonth: month,
          formVariant: variant,
          dueAt: dueIso,
        });
        continue;
      }
      if (plannedKeys.has(key)) {
        planned.push({
          status: 'skipped_already_planned',
          reason: 'planned_state_recorded',
          encounterId: encounter.encounterId,
          patientId: encounter.patientId,
          tenantId: encounter.tenantId,
          signedAt: encounter.signedAt,
          followupMonth: month,
          formVariant: variant,
          dueAt: dueIso,
        });
        continue;
      }
      planned.push({
        status: 'planned',
        encounterId: encounter.encounterId,
        patientId: encounter.patientId,
        tenantId: encounter.tenantId,
        signedAt: encounter.signedAt,
        followupMonth: month,
        formVariant: variant,
        dueAt: dueIso,
        journalType: 'follow_up',
        title: `Uppföljning ${month} mån`,
        source: 'cco_followup_draft_planner',
      });
    }
  }

  const transplantCount = encounters.length;
  const plannedCount = planned.filter((row) => row.status === 'planned').length;
  const skippedExistingCount = planned.filter((row) => row.status === 'skipped_existing').length;
  const skippedAlreadyPlannedCount = planned.filter(
    (row) => row.status === 'skipped_already_planned'
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    tenantId: tenantFilter,
    horizonDays: Math.max(0, Number(leadDays) || 0),
    transplantCount,
    plannedCount,
    skippedExistingCount,
    skippedAlreadyPlannedCount,
    planned,
  };
}

module.exports = {
  FOLLOWUP_MONTHS,
  FOLLOWUP_VARIANT_BY_MONTH,
  TRANSPLANT_ENCOUNTER_KEYS,
  addMonthsUtc,
  isTransplantEncounter,
  normalizeSignedEncounter,
  planFollowupDrafts,
};
