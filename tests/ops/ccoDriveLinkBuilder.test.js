'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KNOWN_FOLDERS,
  MONTH_SV,
  buildFolderUrl,
  buildSearchUrl,
  buildTreatmentDriveLink,
  buildPatientDriveSearchLink,
} = require('../../src/ops/ccoDriveLinkBuilder');

test('buildFolderUrl konstruerar drive.google.com folder-URL', () => {
  const url = buildFolderUrl('abc123');
  assert.equal(url, 'https://drive.google.com/drive/folders/abc123');
});

test('buildSearchUrl utan parent ger global search-URL', () => {
  const url = buildSearchUrl('Maj 5');
  assert.equal(url, 'https://drive.google.com/drive/search?q=Maj%205');
});

test('buildSearchUrl med parent ger scope:ad search-URL', () => {
  const url = buildSearchUrl('Maj 5', 'parent-folder-id');
  assert.equal(url, 'https://drive.google.com/drive/folders/parent-folder-id#search?q=Maj%205');
});

test('buildSearchUrl URL-encodar svenska tecken (åäö)', () => {
  const url = buildSearchUrl('Östermalm åker', 'p');
  assert.match(url, /%C3%96stermalm%20%C3%A5ker/);
});

test('MONTH_SV innehåller 12 svenska månader i ordning', () => {
  assert.equal(MONTH_SV.length, 12);
  assert.equal(MONTH_SV[0], 'Januari');
  assert.equal(MONTH_SV[4], 'Maj');
  assert.equal(MONTH_SV[11], 'December');
});

test('KNOWN_FOLDERS.hair_tp har root-folder-ID', () => {
  assert.equal(KNOWN_FOLDERS.hair_tp.root, '0APPck7epTcZ-Uk9PVA');
  assert.ok(KNOWN_FOLDERS.hair_tp.tpBokade2026Maj);
});

test('KNOWN_FOLDERS.curatiio är markerad TBD (väntar på owner)', () => {
  assert.match(KNOWN_FOLDERS.curatiio.root, /_TBD$/);
});

test('buildTreatmentDriveLink utan datum returnerar brand_root-URL', () => {
  const result = buildTreatmentDriveLink({ brand: 'hair_tp', treatmentType: 'tp' });
  assert.equal(result.level, 'brand_root');
  assert.equal(result.url, 'https://drive.google.com/drive/folders/0APPck7epTcZ-Uk9PVA');
});

test('buildTreatmentDriveLink för Maj 2026 + tp ger day_search till Maj-mappen', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2026-05-07',
    brand: 'hair_tp',
    treatmentType: 'tp',
  });
  assert.equal(result.level, 'day_search');
  assert.equal(result.query, 'Maj 7');
  assert.match(result.url, /1Gof_xzKOvdote1DCjb-riNozlvpLgjbh/);
  assert.match(result.url, /Maj%207/);
  assert.match(result.hint, /Maj 7/);
});

test('buildTreatmentDriveLink för Jun 2026 + tp ger month_search till 2026-mappen', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2026-06-15',
    brand: 'hair_tp',
    treatmentType: 'tp',
  });
  assert.equal(result.level, 'month_search');
  assert.equal(result.query, 'Juni 2026');
  assert.match(result.url, /10sOs6wyliXiNs1o2SdJfn61ctXaBG0gH/);
  assert.match(result.url, /Juni%202026/);
});

test('buildTreatmentDriveLink för 2024 + tp ger year_search till Bokade-mappen', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2024-09-12',
    brand: 'hair_tp',
    treatmentType: 'tp',
  });
  assert.equal(result.level, 'year_search');
  assert.equal(result.query, 'Hair TP Clinic 2024');
  assert.match(result.url, /1d_ngTN-N4QsQ9Cgs72WmwLgIZV1-h_h5/);
});

test('buildTreatmentDriveLink för okänd behandlingstyp faller tillbaka på brand_root', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2026-05-07',
    brand: 'hair_tp',
    treatmentType: 'prp',
  });
  assert.equal(result.level, 'brand_root');
  assert.match(result.url, /0APPck7epTcZ-Uk9PVA/);
});

test('buildTreatmentDriveLink för curatiio (TBD) returnerar null URL', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2026-05-07',
    brand: 'curatiio',
    treatmentType: 'tp',
  });
  assert.equal(result.url, null);
  assert.equal(result.level, 'unknown_brand');
  assert.match(result.note, /ej konfigurerad/);
});

test('buildTreatmentDriveLink hanterar ogiltigt datum graciöst', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: 'inte-ett-datum',
    brand: 'hair_tp',
    treatmentType: 'tp',
  });
  assert.equal(result.level, 'brand_root');
  assert.match(result.note, /Ogiltigt datum/);
});

test('buildTreatmentDriveLink hanterar Date-instanser, inte bara strängar', () => {
  const date = new Date('2026-05-09T12:00:00Z');
  const result = buildTreatmentDriveLink({
    treatmentDate: date,
    brand: 'hair_tp',
    treatmentType: 'tp',
  });
  assert.equal(result.level, 'day_search');
  assert.equal(result.query, 'Maj 9');
});

test('buildPatientDriveSearchLink bygger sök-URL i hair_tp-rooten', () => {
  const result = buildPatientDriveSearchLink({
    patientName: 'Anna Karlsson',
    brand: 'hair_tp',
  });
  assert.equal(result.level, 'patient_name_search');
  assert.equal(result.query, 'Anna Karlsson');
  assert.match(result.url, /0APPck7epTcZ-Uk9PVA/);
  assert.match(result.url, /Anna%20Karlsson/);
});

test('buildPatientDriveSearchLink för curatiio (TBD) returnerar null', () => {
  const result = buildPatientDriveSearchLink({
    patientName: 'Anna Karlsson',
    brand: 'curatiio',
  });
  assert.equal(result.url, null);
  assert.equal(result.level, 'unknown_brand');
});

test('buildPatientDriveSearchLink utan namn faller tillbaka på brand_root', () => {
  const result = buildPatientDriveSearchLink({ patientName: '   ', brand: 'hair_tp' });
  assert.equal(result.level, 'brand_root');
  assert.match(result.url, /0APPck7epTcZ-Uk9PVA/);
});

test('buildTreatmentDriveLink default-brand är hair_tp', () => {
  const result = buildTreatmentDriveLink({ treatmentDate: '2026-05-07' });
  assert.equal(result.level, 'day_search');
  assert.match(result.url, /1Gof_xzKOvdote1DCjb-riNozlvpLgjbh/);
});

test('buildTreatmentDriveLink ignorerar patientName i URL (PII-skydd)', () => {
  const result = buildTreatmentDriveLink({
    treatmentDate: '2026-05-07',
    brand: 'hair_tp',
    treatmentType: 'tp',
    patientName: 'Anna Personnummer',
  });
  // URL ska INTE innehålla patientnamn
  assert.doesNotMatch(result.url, /Anna/);
  assert.doesNotMatch(result.url, /Personnummer/);
});
