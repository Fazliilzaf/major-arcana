'use strict';

/**
 * encounterNameResolver — behandling, besök/session och visitLabel från asset + syskon-assets.
 */

const { detectTreatment } = require('./documentClassifier');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function parseIsoDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function treatmentSessionLabel(treatmentType, sessionNumber) {
  const t = normalizeText(treatmentType);
  if (!t) return null;
  if (/^prp$/i.test(t) && sessionNumber) return `PRP ${sessionNumber}`;
  if (/fue|dhi/i.test(t) && sessionNumber) return `${t} ${sessionNumber}`;
  return t;
}

/**
 * Räkna session-nummer per behandling baserat på journal-assets sorterade på datum.
 *
 * CCO-STATUS.md punkt 1 (bekräftad 2026-08-13, PR #1364-#1371): saknas
 * `documentDate` faller sorteringen tillbaka på `importedAt`
 * (import-tidpunkt, inte behandlingsdatum) — verifierat mot prod att
 * detta ger uppräknade sessionNumber (upp till 16) för assets utan
 * riktigt datum. `usedFallbackDate` i returvärdet flaggar just detta,
 * så anroparen kan hålla tillbaka en osäker session-siffra i stället
 * för att skriva den som fakta (samma mönster som
 * `namingStatus: needs_review_for_naming`).
 */
function countTreatmentSession(asset, siblingAssets = []) {
  const treatment =
    normalizeText(asset.treatmentType) ||
    detectTreatment(`${asset.originalFileName || ''} ${asset.originalDrivePath || ''}`);
  if (!treatment) return { sessionNumber: null, visitLabel: null, usedFallbackDate: false };

  const sameTreatment = siblingAssets
    .filter((a) => {
      const t2 =
        normalizeText(a.treatmentType) ||
        detectTreatment(`${a.originalFileName || ''} ${a.originalDrivePath || ''}`);
      return t2 && t2.toLowerCase() === treatment.toLowerCase();
    })
    .sort((a, b) => {
      const da = parseIsoDate(a.documentDate) || parseIsoDate(a.importedAt) || '';
      const db = parseIsoDate(b.documentDate) || parseIsoDate(b.importedAt) || '';
      return da.localeCompare(db) || String(a.id).localeCompare(String(b.id));
    });

  const idx = sameTreatment.findIndex((a) => a.id === asset.id);
  const sessionNumber = idx >= 0 ? idx + 1 : sameTreatment.length + 1;
  const isSessionType = /^prp$/i.test(treatment) || /fue|dhi/i.test(treatment);
  const usedFallbackDate = isSessionType && !parseIsoDate(asset.documentDate);

  return {
    sessionNumber: isSessionType ? sessionNumber : null,
    visitLabel: treatmentSessionLabel(treatment, sessionNumber),
    treatmentType: treatment,
    usedFallbackDate,
  };
}

/**
 * @param {object} asset
 * @param {{ siblingAssets?: object[], encounterStore?: object }} ctx
 */
function resolveEncounterNaming(asset = {}, ctx = {}) {
  const siblings = Array.isArray(ctx.siblingAssets) ? ctx.siblingAssets : [];
  const fileName = normalizeText(asset.originalFileName);
  const folder = normalizeText(asset.originalDrivePath);

  let treatmentType =
    normalizeText(asset.treatmentType) || detectTreatment(`${fileName} ${folder}`) || null;

  let encounterType = 'unknown';
  const cat = normalizeText(asset.category);
  if (cat === 'journal' || cat === 'cco_journal_sign') encounterType = 'treatment';
  else if (cat.startsWith('photo_')) encounterType = 'imaging';
  else if (['form', 'consent', 'agreement'].includes(cat)) encounterType = 'administrative';
  else if (cat === 'aisia_report') encounterType = 'diagnostics';

  const sessionInfo = countTreatmentSession({ ...asset, treatmentType }, siblings);
  treatmentType = sessionInfo.treatmentType || treatmentType;

  let visitLabel = sessionInfo.visitLabel || treatmentType;
  if (!visitLabel && encounterType === 'imaging') visitLabel = 'Foto';
  if (!visitLabel && encounterType === 'administrative') visitLabel = 'Administrativt';

  return {
    treatmentType: treatmentType || null,
    encounterType,
    encounterId: normalizeText(asset.encounterId) || null,
    visitLabel: visitLabel || null,
    sessionNumber: sessionInfo.sessionNumber,
    usedFallbackDate: sessionInfo.usedFallbackDate || false,
  };
}

module.exports = {
  resolveEncounterNaming,
  countTreatmentSession,
  treatmentSessionLabel,
  parseIsoDate,
};
