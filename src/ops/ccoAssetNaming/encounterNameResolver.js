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

function sortDateForAsset(a) {
  return parseIsoDate(a.documentDate) || parseIsoDate(a.importedAt) || '';
}

// Bug #3 (upptäckt 2026-08-14 vid UI-spotcheck mot prod efter --commit, den
// ursprungliga "FUE Operation 23/25/26/30 för fyra foton, samma dag"-buggen
// från 2026-08-07): en grupperingsnyckel per VERKLIGT tillfälle, inte per
// asset. `encounterId` sätts bara via explicit länkning (linkAssetToEncounter)
// och är därför tillförlitlig men GLES täckning — de flesta bulk-importerade
// foton saknar den. Utan encounterId används riktigt documentDate som
// proxy-tillfälle (flera foton/dokument samma dag = ett besök — en rimlig
// klinisk verklighet, inte en gissning om det är ett RIKTIGT datum). Saknas
// BÅDA hålls asseten som sin egen grupp — ingen tillförlitlig signal att
// gruppera på, så den förblir individuellt numrerad och `usedFallbackDate`
// håller kvar det befintliga review-skyddet nedan.
function encounterGroupKey(asset) {
  const encId = normalizeText(asset.encounterId);
  if (encId) return `enc:${encId}`;
  const realDate = parseIsoDate(asset.documentDate);
  if (realDate) return `date:${realDate}`;
  return `asset:${normalizeText(asset.id)}`;
}

/**
 * Räkna session-nummer per behandling baserat på VERKLIGA tillfällen
 * (encounterId eller samma riktiga documentDate), inte per enskild asset.
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

  const sameTreatment = siblingAssets.filter((a) => {
    const t2 =
      normalizeText(a.treatmentType) ||
      detectTreatment(`${a.originalFileName || ''} ${a.originalDrivePath || ''}`);
    return t2 && t2.toLowerCase() === treatment.toLowerCase();
  });

  const groupOrder = [];
  const groupsByKey = new Map();
  for (const a of sameTreatment) {
    const key = encounterGroupKey(a);
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, []);
      groupOrder.push(key);
    }
    groupsByKey.get(key).push(a);
  }

  const groups = groupOrder
    .map((key) => ({ key, assets: groupsByKey.get(key) }))
    .sort((ga, gb) => {
      const da = ga.assets.map(sortDateForAsset).sort()[0] || '';
      const db = gb.assets.map(sortDateForAsset).sort()[0] || '';
      return da.localeCompare(db) || ga.key.localeCompare(gb.key);
    });

  const myKey = encounterGroupKey(asset);
  const idx = groups.findIndex((g) => g.key === myKey);
  const sessionNumber = idx >= 0 ? idx + 1 : groups.length + 1;
  const isSessionType = /^prp$/i.test(treatment) || /fue|dhi/i.test(treatment);
  const usedFallbackDate =
    isSessionType && !parseIsoDate(asset.documentDate) && !normalizeText(asset.encounterId);

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
