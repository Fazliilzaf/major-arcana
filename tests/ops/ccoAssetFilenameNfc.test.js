'use strict';

/**
 * FILNAMN LAGRADES I TVÅ OLIKA REPRESENTATIONER.
 *
 * Google Drive och macOS lagrar å ä ö dekomponerat (NFD: "o" + U+0308),
 * medan resten av systemet skriver dem sammansatt (NFC: U+00F6). Samma fil
 * fick därför olika strängvärden beroende på källa — jämförelser sprack och
 * kundkortet visade namn som såg trasiga ut.
 *
 * Mätt i produktion 2026-08-04: 700 av 77 435 assets med filnamn låg i NFD,
 * varav 649 synliga i kundkorten.
 *
 * KÄND BEGRÄNSNING SOM INTE LAGAS HÄR
 * Ytterligare 610 assets har ett bokstavligt '?' i namnet, t.ex.
 * "Journal ??? Namn ??? 2024-07-09.pdf" och "Friskfo??rsa??kran-TP-...".
 * Där är tecknet redan förlorat vid någon tidigare kodning — bokstäverna finns
 * kvar men diakriterna är borta. Det går att gissa fram på svenska, men på
 * patientdokument gissar vi inte. De lämnas orörda med avsikt, och testet
 * nedan vaktar att de inte tyst skrivs om.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');

const BASE_ASSET = Object.freeze({
  patientId: 'pat-nfc-001',
  sourceSystem: 'drive',
  originalDriveFileId: 'nfc-abc',
  storageProvider: 'local',
  storageKey: 'data/cco-storage/pat-nfc-001/fil.pdf',
  mimeType: 'application/pdf',
  category: 'journal',
  fileSize: 1024,
  importedBy: 'system',
});

async function makeStore() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-nfc-'));
  const store = await createCcoPatientAssetStore({
    filePath: path.join(tmp, 'cco-patient-assets.json'),
  });
  return { tmp, store };
}

// Formerna byggs programmatiskt. Skrivna för hand i källan blir de identiska
// efter redigerarens egen normalisering, och testet hade då vaktat ingenting.
const NFC_NAMN = 'Journal-PRP-Albert-Hidenbäck-1751972672-7631.pdf'.normalize('NFC');
const NFD_NAMN = NFC_NAMN.normalize('NFD');

const NFC_SOKVAG = '/Hair TP/Patienter/Albert Hidenbäck/fil.pdf'.normalize('NFC');
const NFD_SOKVAG = NFC_SOKVAG.normalize('NFD');

test('ett NFD-filnamn lagras i NFC', async () => {
  const { tmp, store } = await makeStore();
  try {
    // Premissen: strängarna är olika före normalisering, men samma tecken.
    assert.notEqual(NFD_NAMN, NFC_NAMN);
    assert.equal(NFD_NAMN.normalize('NFC'), NFC_NAMN);

    const asset = await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: 'nfc-1',
      originalFileName: NFD_NAMN,
    });

    assert.equal(asset.originalFileName, NFC_NAMN);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en NFD-sökväg lagras i NFC', async () => {
  const { tmp, store } = await makeStore();
  try {
    assert.notEqual(NFD_SOKVAG, NFC_SOKVAG);
    const asset = await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: 'nfc-2',
      originalFileName: 'fil.pdf',
      originalDrivePath: NFD_SOKVAG,
    });

    assert.equal(asset.originalDrivePath, NFC_SOKVAG);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('namn som redan är NFC lämnas oförändrade', async () => {
  const { tmp, store } = await makeStore();
  try {
    const asset = await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: 'nfc-3',
      originalFileName: NFC_NAMN,
    });

    assert.equal(asset.originalFileName, NFC_NAMN);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('namn med bokstavligt "?" skrivs INTE om — informationen är borta', async () => {
  const { tmp, store } = await makeStore();
  try {
    const trasigt = 'Friskfo??rsa??kran-TP-DanielBodin-1739865709-7762.pdf';
    const asset = await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: 'nfc-4',
      originalFileName: trasigt,
    });

    // NFC får inte hitta på tecken som inte finns kvar i strängen.
    assert.equal(asset.originalFileName, trasigt);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('normaliseringen rör bara textfält, inte id:n eller enums', async () => {
  const { tmp, store } = await makeStore();
  try {
    const asset = await store.addAsset({
      ...BASE_ASSET,
      sourceRecordId: 'nfc-5',
      originalFileName: NFD_NAMN,
    });

    assert.equal(asset.patientId, 'pat-nfc-001');
    assert.equal(asset.sourceRecordId, 'nfc-5');
    assert.equal(asset.sourceSystem, 'drive');
    assert.equal(asset.category, 'journal');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
