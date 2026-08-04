'use strict';

/**
 * 1 450 DOKUMENT VAR OSYNLIGA FÖR KLASSIFICERAREN PÅ GRUND AV TECKENKODNING.
 *
 * Drive-filnamn är delvis dubbelkodade: UTF-8-byten för "ä" (C3 A4) har
 * tolkats som Latin-1 och blivit "Ã¤". Mätt mot det verkliga Drive-indexet
 * (91 504 filer):
 *
 *   hälsodeklaration   600 klassificerade   753 missade   (56 %)
 *   friskförsäkran      410 klassificerade   697 missade   (63 %)
 *
 * `FORM_PATTERNS` är korrekt skrivna — `/h[aä]lsodekl/i` — men kan omöjligt
 * matcha "HÃ¤lsodekl", eftersom "Ã" varken är "a" eller "ä". Dokumenten föll
 * till kategorin `other` och blev därför aldrig hälsodeklarationer i
 * kundkortet, trots att filerna hela tiden funnits i Google Drive.
 *
 * Det farliga med en sådan här fix är att den förstör korrekt kodade namn.
 * "ä" är U+00E4, som ryms i Latin-1 men inte är giltig UTF-8 ensam — en
 * ovillkorlig avkodning hade gjort "Hälsodeklaration" till skräp. Därför
 * vaktas BÅDA riktningarna här.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyDocument,
  repairMojibake,
} = require('../../src/ops/ccoAssetNaming/documentClassifier');

// Byggs ur bytes så att filen inte själv råkar bli normaliserad av en
// editor eller ett formateringsverktyg.
const MOJIBAKE_HD = Buffer.from('Hälsodeklaration.pdf', 'utf8').toString('latin1');
const MOJIBAKE_FF = Buffer.from('Friskförsäkran.pdf', 'utf8').toString('latin1');

test('riggen producerar faktisk mojibake', () => {
  assert.ok(MOJIBAKE_HD.includes('Ã'), 'testdatan ska vara dubbelkodad');
  assert.notEqual(MOJIBAKE_HD, 'Hälsodeklaration.pdf');
});

test('dubbelkodat filnamn repareras', () => {
  assert.equal(repairMojibake(MOJIBAKE_HD), 'Hälsodeklaration.pdf');
  assert.equal(repairMojibake(MOJIBAKE_FF), 'Friskförsäkran.pdf');
});

test('korrekt kodat filnamn lämnas orört — det är den farliga riktningen', () => {
  assert.equal(repairMojibake('Hälsodeklaration.pdf'), 'Hälsodeklaration.pdf');
  assert.equal(repairMojibake('Friskförsäkran.pdf'), 'Friskförsäkran.pdf');
  assert.equal(repairMojibake('Journal PRP 2024.pdf'), 'Journal PRP 2024.pdf');
  assert.equal(repairMojibake(''), '');
  assert.equal(repairMojibake(null), '');
});

test('dubbelkodad hälsodeklaration klassificeras nu som form', () => {
  const result = classifyDocument({
    originalFileName: MOJIBAKE_HD,
    mimeType: 'application/pdf',
  });
  assert.equal(result.subCategory, 'health_declaration');
  assert.equal(result.documentTitle, 'Hälsodeklaration');
});

test('dubbelkodad friskförsäkran klassificeras nu som friskförsäkran', () => {
  const result = classifyDocument({
    originalFileName: MOJIBAKE_FF,
    mimeType: 'application/pdf',
  });
  assert.equal(result.subCategory, 'fitness_certificate');
  assert.equal(result.documentTitle, 'Friskförsäkran');
});

test('korrekt kodade namn klassificeras precis som förut', () => {
  const hd = classifyDocument({
    originalFileName: 'Hälsodeklaration.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(hd.subCategory, 'health_declaration');

  const ff = classifyDocument({
    originalFileName: 'Friskförsäkran.pdf',
    mimeType: 'application/pdf',
  });
  assert.equal(ff.subCategory, 'fitness_certificate');
});

test('formulärtyp läses medvetet bara ur filnamnet, inte ur mappen', () => {
  // detectFormTitle(fileName) — mappen ingår inte, och det ändras inte här.
  // Vaktas så att en framtida "förbättring" inte råkar börja klassificera
  // varenda fil i en mapp som heter Hälsodeklaration.
  const result = classifyDocument({
    originalFileName: 'scan001.pdf',
    originalDrivePath: 'Patienter/Hälsodeklaration/scan001.pdf',
    mimeType: 'application/pdf',
  });
  assert.notEqual(result.subCategory, 'health_declaration');
});

test('mojibake i mappsökvägen repareras för behandlingsdetektion', () => {
  // Mappen används av detectTreatment(haystack) — där gör reparationen nytta.
  const result = classifyDocument({
    originalFileName: 'journal.pdf',
    originalDrivePath: Buffer.from('Patienter/Ögonlock/journal.pdf', 'utf8').toString('latin1'),
    mimeType: 'application/pdf',
  });
  assert.equal(result.treatmentType, 'Ögonlocksplastik');
});

test('ett namn utan mojibake-signatur rörs inte ens vid försök', () => {
  // Ren ASCII går aldrig genom avkodningen — ingen risk för regression.
  const before = 'Halsodeklaration_2023.pdf';
  assert.equal(repairMojibake(before), before);
  assert.equal(
    classifyDocument({ originalFileName: before, mimeType: 'application/pdf' }).subCategory,
    'health_declaration'
  );
});
