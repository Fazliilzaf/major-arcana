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

test('m365_halso-formulär utan känd titel får medium confidence', () => {
  // Kategorin 'form' är satt av importören för m365_halso; även när
  // filnamnet är så korrupt att vi inte kan avgöra exakt formulärtyp
  // (t.ex. "scan-...") är det säkrare än ett generiskt form-fall
  // eftersom källsystemet enbart hanterar hälsorelaterade formulär.
  const result = classifyDocument({
    originalFileName: 'scan-12345.pdf',
    category: 'form',
    sourceSystem: 'm365_halso',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'form');
  assert.equal(result.subCategory, 'form');
  assert.equal(result.confidence, 'medium');
});

test('ospecificerat formulär från annat system förblir low confidence', () => {
  const result = classifyDocument({
    originalFileName: 'form-123.pdf',
    category: 'form',
    sourceSystem: 'upload',
    mimeType: 'application/pdf',
  });
  assert.equal(result.confidence, 'low');
});

test('H+?lsodeklaration med category other klassificeras som hälsodeklaration', () => {
  const result = classifyDocument({
    originalFileName: 'H+?lsodeklaration ??? Niklas Mattsson.pdf',
    category: 'other',
    sourceSystem: 'drive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.subCategory, 'health_declaration');
  assert.equal(result.documentTitle, 'Hälsodeklaration');
  assert.equal(result.confidence, 'high');
});

test('CF7-fil klassificeras som samtycke', () => {
  const result = classifyDocument({
    originalFileName: 'CF7-1720444624-3526.pdf',
    category: 'other',
    sourceSystem: 'drive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'consent');
  assert.equal(result.subCategory, 'consent');
  assert.equal(result.documentTitle, 'Samtycke');
  assert.equal(result.confidence, 'high');
});

test("Medication timing klassificeras som journal/läkemedelsinstruktion", () => {
  const result = classifyDocument({
    originalFileName: 'medication timing – Viktor Björkholm – 2023-10-04.pdf',
    category: 'other',
    sourceSystem: 'drive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'journal'); // medication_timing mappas till journal (klinisk info)
  assert.equal(result.subCategory, 'medication_timing');
  assert.equal(result.documentTitle, 'Läkemedelsinstruktion');
  assert.equal(result.confidence, 'high');
});

test('patientnamn+datum utan annan ledtråd förblir low confidence other', () => {
  const result = classifyDocument({
    originalFileName: 'josef aksöz 2024-05-01 10-40-49.pdf',
    category: 'other',
    sourceSystem: 'pipedrive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'other');
  assert.equal(result.confidence, 'low');
});

test('pipedrive_smartdoc med subCategory får medium confidence', () => {
  const result = classifyDocument({
    originalFileName: 'Filip Frank 2026-06-15 19-45-09.pdf',
    category: 'other',
    subCategory: 'pipedrive_smartdoc',
    sourceSystem: 'pipedrive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'other');
  assert.equal(result.subCategory, 'pipedrive_smartdoc');
  assert.equal(result.documentTitle, 'Smartdoc');
  assert.equal(result.confidence, 'medium');
});

test('korrupt friskförsäkran med +? och ?? klassificeras', () => {
  const result = classifyDocument({
    originalFileName: 'Friskf+?rs+?kran H+?rtransplantation ??? Jonathan Woodley.pdf',
    category: 'form',
    sourceSystem: 'drive',
    mimeType: 'application/pdf',
  });
  assert.equal(result.subCategory, 'fitness_certificate');
  assert.equal(result.documentTitle, 'Friskförsäkran');
});

test('operationstimestamps klassificeras som journal', () => {
  const result = classifyDocument({
    originalFileName: 'FUE-Timestamps.pdf',
    category: 'other',
    sourceSystem: 'drive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'journal');
  assert.equal(result.subCategory, 'operation_timestamps');
  assert.equal(result.documentTitle, 'Operationstimestamps');
});

test('medicindeligering klassificeras som journal/läkemedelslista', () => {
  const result = classifyDocument({
    originalFileName: 'Bernard Bukowski medicindeligering.pdf',
    category: 'other',
    sourceSystem: 'drive_import',
    mimeType: 'application/pdf',
  });
  assert.equal(result.category, 'journal');
  assert.equal(result.subCategory, 'medication_list');
  assert.equal(result.documentTitle, 'Läkemedelslista');
});

test('elektroniskt visitkort klassificeras som other/medium', () => {
  const result = classifyDocument({
    originalFileName: 'elektroniskt-visitkort.vcf',
    category: 'other',
    sourceSystem: 'm365_halso',
    mimeType: 'text/vcard',
  });
  assert.equal(result.category, 'other');
  assert.equal(result.subCategory, 'contact_card');
  assert.equal(result.documentTitle, 'Visitkort');
  assert.equal(result.confidence, 'high');
});

test('operationsvideo i OP-mapp klassificeras som medium', () => {
  const result = classifyDocument({
    originalFileName: 'IMG_5071.MOV',
    category: 'other',
    subCategory: 'unknown',
    sourceSystem: 'drive_import',
    mimeType: 'video/quicktime',
    originalDrivePath: 'Hair TP Clinic 2025 /Januari 2025 /Januari 11/Alexander Bergenstav - 19960910-0574 (FUE)/Alexander Bergenstav - 2025-01-11 OP (FUE)/IMG_5071.MOV',
  });
  assert.equal(result.category, 'other');
  assert.equal(result.subCategory, 'operation_video');
  assert.equal(result.documentTitle, 'Operationsvideo');
  assert.equal(result.confidence, 'medium');
});
