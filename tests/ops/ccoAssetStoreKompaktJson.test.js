'use strict';

/**
 * ASSETLAGRET SKRIVS KOMPAKT.
 *
 * Filen läses bara av maskiner och är den överlägset största i data/:
 * 77 526 assets, 259 MB snyggformaterat mot 196 MB kompakt (mätt 2026-08-04).
 * Skillnaden är ren indentering.
 *
 * Varför det spelar roll för minnet: JSON.stringify bygger HELA utdatan som
 * en sammanhängande sträng innan något når disk, och varje skrivning
 * serialiserar hela lagret även när en enda asset ändrats. Under bulkkörningar
 * upprepas allokeringen; 2026-08-04 föll produktionen på fjärde omgången av en
 * besökskoppling med tio patienter åt gången.
 *
 * Testet vaktar formatet, inte minnet. Att indenteringen smyger tillbaka är
 * lätt hänt — den är standard i JSON.stringify-anrop överallt annars.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');

const BASE_ASSET = Object.freeze({
  patientId: 'pat-kompakt-001',
  sourceSystem: 'drive',
  storageProvider: 'local',
  storageKey: 'data/cco-storage/pat-kompakt-001/fil.pdf',
  mimeType: 'application/pdf',
  category: 'journal',
  originalFileName: 'fil.pdf',
  fileSize: 1024,
  importedBy: 'system',
});

async function skrivEnAsset() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-kompakt-'));
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  const store = await createCcoPatientAssetStore({ filePath });
  await store.addAsset({ ...BASE_ASSET, sourceRecordId: 'kompakt-1' });
  const raa = await fs.readFile(filePath, 'utf8');
  return { tmp, raa };
}

test('lagerfilen skrivs utan indentering', async () => {
  const { tmp, raa } = await skrivEnAsset();
  try {
    // Snyggformaterad JSON börjar alltid med '{\n  "'. Kompakt gör det inte.
    assert.doesNotMatch(raa, /^\{\n\s+"/, 'filen ska inte vara indenterad');
    assert.match(raa, /^\{"/, 'filen ska börja kompakt');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('innehållet är fortfarande giltig JSON och läsbart tillbaka', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-kompakt-'));
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    const skapad = await store.addAsset({ ...BASE_ASSET, sourceRecordId: 'kompakt-2' });

    const parsad = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(parsad.items[skapad.id].sourceRecordId, 'kompakt-2');

    // Och en ny store läser tillbaka samma sak.
    const igen = await createCcoPatientAssetStore({ filePath });
    assert.equal(igen.getAsset(skapad.id).sourceRecordId, 'kompakt-2');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('kompakt är mindre än formaterat för samma innehåll', async () => {
  const { tmp, raa } = await skrivEnAsset();
  try {
    const formaterat = `${JSON.stringify(JSON.parse(raa), null, 2)}\n`;
    assert.ok(
      raa.length < formaterat.length,
      `kompakt (${raa.length}) ska vara mindre än formaterat (${formaterat.length})`
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
