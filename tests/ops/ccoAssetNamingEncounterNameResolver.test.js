'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countTreatmentSession,
  resolveEncounterNaming,
  treatmentSessionLabel,
} = require('../../src/ops/ccoAssetNaming/encounterNameResolver');

test('treatmentSessionLabel formats PRP/FUE/DHI with session number', () => {
  assert.equal(treatmentSessionLabel('PRP', 2), 'PRP 2');
  assert.equal(treatmentSessionLabel('FUE', 3), 'FUE 3');
  assert.equal(treatmentSessionLabel('DHI', 1), 'DHI 1');
  assert.equal(treatmentSessionLabel('consultation', null), 'consultation');
  assert.equal(treatmentSessionLabel('', 1), null);
});

test('countTreatmentSession returns null sessionNumber without a treatment type', () => {
  const result = countTreatmentSession({ id: 'a1' }, []);
  assert.equal(result.sessionNumber, null);
  assert.equal(result.usedFallbackDate, false);
});

test('countTreatmentSession: real documentDate on every sibling -> usedFallbackDate false', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', documentDate: '2026-01-01' },
    { id: 'a2', treatmentType: 'FUE', documentDate: '2026-02-01' },
    { id: 'a3', treatmentType: 'FUE', documentDate: '2026-03-01' },
  ];
  const result = countTreatmentSession(siblings[1], siblings);
  assert.equal(result.sessionNumber, 2);
  assert.equal(result.usedFallbackDate, false);
});

test('countTreatmentSession: missing documentDate on the asset itself -> usedFallbackDate true', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', importedAt: '2026-01-01T10:00:00Z' },
    { id: 'a2', treatmentType: 'FUE', importedAt: '2026-02-01T10:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[0], siblings);
  assert.equal(result.sessionNumber, 1);
  assert.equal(result.usedFallbackDate, true);
});

test('countTreatmentSession: non-session treatment type never sets usedFallbackDate', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'consultation', importedAt: '2026-01-01T10:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[0], siblings);
  assert.equal(result.sessionNumber, null);
  assert.equal(result.usedFallbackDate, false);
});

test('resolveEncounterNaming propagates usedFallbackDate from countTreatmentSession', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', category: 'journal', importedAt: '2026-01-01T10:00:00Z' },
  ];
  const result = resolveEncounterNaming(siblings[0], { siblingAssets: siblings });
  assert.equal(result.sessionNumber, 1);
  assert.equal(result.usedFallbackDate, true);
});

test('resolveEncounterNaming: usedFallbackDate false when documentDate is real', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', category: 'journal', documentDate: '2026-01-01' },
  ];
  const result = resolveEncounterNaming(siblings[0], { siblingAssets: siblings });
  assert.equal(result.usedFallbackDate, false);
});

// Bug #3, upptäckt 2026-08-14 vid UI-spotcheck efter --commit: countTreatmentSession
// gav varje ENSKILD asset ett unikt löpnummer inom en treatmentType — även när flera
// foton kom från exakt samma verkliga behandlingstillfälle. Detta är den ursprungliga
// "FUE Operation 23/25/26/30 för fyra foton, samma dag"-buggen från 2026-08-07 —
// skild från de två rotorsaker (alias-kollision, datum-fallback) som #1374/#1375
// fixade. Fix: gruppera på encounterId när det finns (explicit länkat via
// linkAssetToEncounter), annars på riktigt documentDate som proxy-tillfälle — ett
// tillfälle = ETT sessionsnummer, oavsett hur många foton/dokument det innehåller.
test('countTreatmentSession: flera assets med SAMMA encounterId delar ETT sessionsnummer', () => {
  const siblings = [
    { id: 'p1', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
    { id: 'p2', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
    { id: 'p3', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
    { id: 'p4', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
  ];
  for (const sibling of siblings) {
    const result = countTreatmentSession(sibling, siblings);
    assert.equal(
      result.sessionNumber,
      1,
      `${sibling.id} ska få sessionsnummer 1, inte ett löpnummer`
    );
  }
});

test('countTreatmentSession: encounterId ordnar flera distinkta tillfällen korrekt, oavsett antal foton per tillfälle', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', documentDate: '2026-01-01', encounterId: 'enc-1' },
    { id: 'a2', treatmentType: 'FUE', documentDate: '2026-01-01', encounterId: 'enc-1' },
    { id: 'b1', treatmentType: 'FUE', documentDate: '2026-02-01', encounterId: 'enc-2' },
    { id: 'b2', treatmentType: 'FUE', documentDate: '2026-02-01', encounterId: 'enc-2' },
    { id: 'b3', treatmentType: 'FUE', documentDate: '2026-02-01', encounterId: 'enc-2' },
  ];
  assert.equal(countTreatmentSession(siblings[0], siblings).sessionNumber, 1);
  assert.equal(countTreatmentSession(siblings[1], siblings).sessionNumber, 1);
  assert.equal(countTreatmentSession(siblings[2], siblings).sessionNumber, 2);
  assert.equal(countTreatmentSession(siblings[3], siblings).sessionNumber, 2);
  assert.equal(countTreatmentSession(siblings[4], siblings).sessionNumber, 2);
});

test('countTreatmentSession: utan encounterId men med samma RIKTIGA documentDate grupperas som proxy-tillfälle (samma bugg-scenario, ingen manuell länkning gjord)', () => {
  const siblings = [
    { id: 'p1', treatmentType: 'FUE', documentDate: '2026-03-06' },
    { id: 'p2', treatmentType: 'FUE', documentDate: '2026-03-06' },
    { id: 'p3', treatmentType: 'FUE', documentDate: '2026-03-06' },
    { id: 'p4', treatmentType: 'FUE', documentDate: '2026-03-06' },
  ];
  for (const sibling of siblings) {
    const result = countTreatmentSession(sibling, siblings);
    assert.equal(result.sessionNumber, 1);
    assert.equal(result.usedFallbackDate, false, 'riktigt datum finns — inte en gissning');
  }
});

test('countTreatmentSession: olika encounterId samma dag ger fortfarande olika sessionsnummer (två riktiga tillfällen, en dag)', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', documentDate: '2026-05-01', encounterId: 'morgon' },
    { id: 'b1', treatmentType: 'PRP', documentDate: '2026-05-01', encounterId: 'eftermiddag' },
  ];
  const rA = countTreatmentSession(siblings[0], siblings);
  const rB = countTreatmentSession(siblings[1], siblings);
  assert.notEqual(rA.sessionNumber, rB.sessionNumber);
});

test('countTreatmentSession: assets utan både encounterId och riktigt datum slås INTE ihop (ingen tillförlitlig grupperingssignal) — bevarar befintlig fallback-numrering och usedFallbackDate-skydd', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', importedAt: '2026-01-01T10:00:00Z' },
    { id: 'a2', treatmentType: 'FUE', importedAt: '2026-01-01T11:00:00Z' },
  ];
  const rA = countTreatmentSession(siblings[0], siblings);
  const rB = countTreatmentSession(siblings[1], siblings);
  assert.notEqual(rA.sessionNumber, rB.sessionNumber);
  assert.equal(rA.usedFallbackDate, true);
  assert.equal(rB.usedFallbackDate, true);
});

test('countTreatmentSession: regression — encounterId-grupperade tillfällen och rent datum-baserade tillfällen samsorteras kronologiskt korrekt', () => {
  const siblings = [
    { id: 'jan1', treatmentType: 'FUE', documentDate: '2026-01-01' },
    { id: 'jan2', treatmentType: 'FUE', documentDate: '2026-01-01' },
    { id: 'feb1', treatmentType: 'FUE', documentDate: '2026-02-01', encounterId: 'enc-feb' },
    { id: 'feb2', treatmentType: 'FUE', documentDate: '2026-02-01', encounterId: 'enc-feb' },
    { id: 'mar1', treatmentType: 'FUE', documentDate: '2026-03-01' },
  ];
  assert.equal(countTreatmentSession(siblings[0], siblings).sessionNumber, 1);
  assert.equal(countTreatmentSession(siblings[1], siblings).sessionNumber, 1);
  assert.equal(countTreatmentSession(siblings[2], siblings).sessionNumber, 2);
  assert.equal(countTreatmentSession(siblings[3], siblings).sessionNumber, 2);
  assert.equal(countTreatmentSession(siblings[4], siblings).sessionNumber, 3);
});

// Bugbot-fynd på PR #1379 (2026-08-14), Medium #1: gles encounterId-täckning
// är normalfallet, inte ett kantfall — några foton från ett besök länkade,
// andra bara samma riktiga datum, fick tidigare FEL, två sessionsnummer för
// samma tillfälle.
test('countTreatmentSession: delvis länkat tillfälle — några syskon har encounterId, andra bara samma riktiga datum, slås ihop till ETT sessionsnummer', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
    { id: 'a2', treatmentType: 'FUE', documentDate: '2026-01-15', encounterId: 'enc-1' },
    { id: 'a3', treatmentType: 'FUE', documentDate: '2026-01-15' },
    { id: 'a4', treatmentType: 'FUE', documentDate: '2026-01-15' },
  ];
  for (const sibling of siblings) {
    const result = countTreatmentSession(sibling, siblings);
    assert.equal(result.sessionNumber, 1, `${sibling.id} ska ingå i samma tillfälle`);
  }
});

test('countTreatmentSession: tvetydig dag (två olika encounterId samma datum) gissar INTE var en olänkad syster hör hemma', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', documentDate: '2026-05-01', encounterId: 'morgon' },
    { id: 'b1', treatmentType: 'PRP', documentDate: '2026-05-01', encounterId: 'eftermiddag' },
    { id: 'c1', treatmentType: 'PRP', documentDate: '2026-05-01' },
  ];
  const rA = countTreatmentSession(siblings[0], siblings);
  const rB = countTreatmentSession(siblings[1], siblings);
  const rC = countTreatmentSession(siblings[2], siblings);
  assert.notEqual(rC.sessionNumber, rA.sessionNumber);
  assert.notEqual(rC.sessionNumber, rB.sessionNumber);
});

// Bugbot-fynd, Medium #2: usedFallbackDate slogs av så fort encounterId
// fanns, även om ordningen i praktiken byggde på importedAt.
test('countTreatmentSession: encounterId utan NÅGOT riktigt datum i gruppen — usedFallbackDate ska vara true (ordningen bygger på importedAt, inte fakta)', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', encounterId: 'enc-1', importedAt: '2026-01-01T10:00:00Z' },
    { id: 'a2', treatmentType: 'PRP', encounterId: 'enc-1', importedAt: '2026-01-01T11:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[0], siblings);
  assert.equal(result.usedFallbackDate, true);
});

test('countTreatmentSession: encounterId utan eget documentDate men en SYSKON i samma encounter har riktigt datum — usedFallbackDate false (gruppen är förankrad)', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', encounterId: 'enc-1', documentDate: '2026-01-15' },
    { id: 'a2', treatmentType: 'PRP', encounterId: 'enc-1', importedAt: '2026-01-01T11:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[1], siblings);
  assert.equal(result.usedFallbackDate, false);
});

// Bugbot-fynd, Low #3: en enda odaterad syskon-asset kunde dra en annars
// korrekt daterad grupp till fel plats i den kronologiska ordningen.
test('countTreatmentSession: en enstaka odaterad syskon-asset (bara importedAt) drar INTE hela gruppens sorteringsordning fel', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', documentDate: '2026-03-01', encounterId: 'enc-a' },
    { id: 'a2', treatmentType: 'FUE', encounterId: 'enc-a', importedAt: '2020-01-01T00:00:00Z' },
    { id: 'b1', treatmentType: 'FUE', documentDate: '2026-01-01', encounterId: 'enc-b' },
  ];
  const rA = countTreatmentSession(siblings[0], siblings);
  const rB = countTreatmentSession(siblings[2], siblings);
  assert.ok(
    rB.sessionNumber < rA.sessionNumber,
    'grupp B (verkligt datum januari) ska rankas före grupp A (verkligt datum mars), oavsett en syskon-assets gamla importedAt'
  );
});
