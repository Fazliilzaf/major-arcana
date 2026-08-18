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

const SESSION_TYPES = new Map([
  ['prp', { label: 'PRP' }],
  ['fue', { label: 'FUE' }],
  ['dhi', { label: 'DHI' }],
  ['consultation', { label: 'Konsultation' }],
  ['konsultation', { label: 'Konsultation' }],
  ['microneedling', { label: 'Microneedling' }],
  ['mesoterapi', { label: 'Mesoterapi' }],
]);

function normalizeTreatmentType(treatmentType) {
  return normalizeText(treatmentType)
    .toLowerCase()
    .replace(/\s+operation$/, '');
}

function treatmentSessionLabel(treatmentType, sessionNumber) {
  const t = normalizeTreatmentType(treatmentType);
  if (!t) return null;
  const sessionType = SESSION_TYPES.get(t);
  if (sessionType && sessionNumber) return `${sessionType.label} ${sessionNumber}`;
  return normalizeText(treatmentType);
}

// Bugbot-fynd på PR #1379 (2026-08-14), tre rättningar mot förra versionen:
//
//  1. Delvis länkat tillfälle splittrades. `enc:<id>` och `date:<datum>` låg
//     i skilda namnrymder som aldrig möttes — ett besök där NÅGRA foton var
//     explicit länkade (encounterId) och andra bara delade samma riktiga
//     documentDate fick FEL, TVÅ sessionsnummer för samma tillfälle. Eftersom
//     encounterId-täckning är gles är det här normalfallet, inte ett
//     kantfall. Fix: bygg en dateToEncounterIds-karta från de länkade
//     assetsen först; en olänkad syster med samma riktiga datum ärver den
//     dagens encounterId ENDAST om dagen entydigt pekar på EN encounterId —
//     är den tvetydig (två olika encounterId samma dag) gissar vi inte,
//     den behåller sin egen datum-proxy-grupp (aldrig sämre än innan).
//  2. `usedFallbackDate` slogs av så fort encounterId fanns, även om varken
//     asseten själv eller någon i dess grupp hade ett riktigt documentDate
//     — då byggde gruppens ORDNING (inte bara dess sammansättning) på
//     importedAt, en osäker signal. Fix: `usedFallbackDate` avgörs nu av om
//     GRUPPEN har något riktigt datum alls, inte längre av att encounterId
//     bara finns.
//  3. Gruppens sorteringsdatum tog "tidigaste bland documentDate||importedAt
//     per medlem" — en enda odaterad syskon-asset med ett gammalt
//     importedAt kunde då dra en annars korrekt daterad grupp till fel
//     plats i ordningen. Fix: riktiga documentDate-värden i gruppen
//     prioriteras alltid; importedAt används bara som sorteringsdatum om
//     INGEN i gruppen har ett riktigt datum.
function groupSortDate(assets) {
  const realDates = assets
    .map((a) => parseIsoDate(a.documentDate))
    .filter(Boolean)
    .sort();
  if (realDates.length) return realDates[0];
  const fallbackDates = assets
    .map((a) => parseIsoDate(a.importedAt))
    .filter(Boolean)
    .sort();
  return fallbackDates[0] || '';
}

function buildDateToLinkedEncounterIds(assets) {
  const map = new Map();
  for (const a of assets) {
    const encId = normalizeText(a.encounterId);
    const realDate = parseIsoDate(a.documentDate);
    if (!encId || !realDate) continue;
    if (!map.has(realDate)) map.set(realDate, new Set());
    map.get(realDate).add(encId);
  }
  return map;
}

/**
 * Grupperingsnyckel per VERKLIGT tillfälle, inte per asset.
 * `encounterId` sätts bara via explicit länkning (linkAssetToEncounter) och
 * är därför tillförlitlig men gles — de flesta bulk-importerade foton
 * saknar den. `dateToLinkedEncounterIds` (byggd en gång per
 * countTreatmentSession-anrop, se ovan) låter en olänkad asset ärva dagens
 * encounterId när den är entydig. Saknas både encounterId och riktigt
 * datum hålls asseten som sin egen grupp — ingen tillförlitlig signal att
 * gruppera på.
 */
function encounterGroupKey(asset, dateToLinkedEncounterIds) {
  const encId = normalizeText(asset.encounterId);
  if (encId) return `enc:${encId}`;
  const realDate = parseIsoDate(asset.documentDate);
  if (realDate) {
    const linked = dateToLinkedEncounterIds.get(realDate);
    if (linked && linked.size === 1) return `enc:${[...linked][0]}`;
    return `date:${realDate}`;
  }
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

  const dateToLinkedEncounterIds = buildDateToLinkedEncounterIds(sameTreatment);

  const groupOrder = [];
  const groupsByKey = new Map();
  for (const a of sameTreatment) {
    const key = encounterGroupKey(a, dateToLinkedEncounterIds);
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, []);
      groupOrder.push(key);
    }
    groupsByKey.get(key).push(a);
  }

  const groups = groupOrder
    .map((key) => ({ key, assets: groupsByKey.get(key) }))
    .sort((ga, gb) => {
      const da = groupSortDate(ga.assets);
      const db = groupSortDate(gb.assets);
      return da.localeCompare(db) || ga.key.localeCompare(gb.key);
    });

  const myKey = encounterGroupKey(asset, dateToLinkedEncounterIds);
  const idx = groups.findIndex((g) => g.key === myKey);
  const myGroup = idx >= 0 ? groups[idx] : null;
  const sessionNumber = idx >= 0 ? idx + 1 : groups.length + 1;
  const isSessionType = SESSION_TYPES.has(normalizeTreatmentType(treatment));
  const groupHasRealDate = myGroup
    ? myGroup.assets.some((a) => parseIsoDate(a.documentDate))
    : parseIsoDate(asset.documentDate) !== null;
  const usedFallbackDate = isSessionType && !groupHasRealDate;

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
