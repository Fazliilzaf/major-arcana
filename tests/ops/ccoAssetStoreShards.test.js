'use strict';

/**
 * DELAD PERSISTENS I ASSETLAGRET.
 *
 * Före: varje save() serialiserade hela lagret — 196 MB som en sammanhängande
 * sträng i minnet, även för en enda ändrad asset. 2026-08-04 fällde den
 * upprepningen produktionen mitt i en bulkkörning (502, uptime 2 280 s -> 26 s).
 *
 * Efter: assets ligger i 64 shards efter en stabil hash av id:t. save() sveper
 * updatedAt och skriver bara de shards som berörts.
 *
 * MONOLITEN FINNS KVAR MED FLIT. Tre produktionstjänster och ett femtiotal
 * skript öppnar data/cco-patient-assets.json direkt, förbi lagret. Den
 * regenereras därför vid varje enskild skrivning och vid flushBatch — men
 * INTE vid varje checkpoint under en pågående batch. Det är där vinsten
 * ligger: en bulkkörning skriver shards många gånger och monoliten en gång.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');

const BASE = Object.freeze({
  patientId: 'pat-shard-001',
  sourceSystem: 'drive',
  storageProvider: 'local',
  storageKey: 'data/cco-storage/x.pdf',
  mimeType: 'application/pdf',
  category: 'journal',
  originalFileName: 'x.pdf',
  fileSize: 10,
  importedBy: 'system',
});

async function tempdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-shard-'));
}

function shardDir(filePath) {
  return path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}.shards`);
}

async function shardFiler(filePath) {
  return (await fs.readdir(shardDir(filePath))).filter((f) => f.startsWith('shard-')).sort();
}

test('en monolit migreras till shards vid första öppning', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    // Skriv en monolit som om den kom från gamla formatet.
    const monolit = {
      schemaVersion: '1.1.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      items: {},
      audit: [],
    };
    for (let i = 0; i < 40; i += 1) {
      monolit.items['id-' + i] = {
        ...BASE,
        id: 'id-' + i,
        sourceRecordId: 'rec-' + i,
        status: 'DISCOVERED',
      };
    }
    await fs.writeFile(filePath, JSON.stringify(monolit), 'utf8');

    const store = await createCcoPatientAssetStore({ filePath });

    // Alla 40 finns kvar i minnet.
    assert.equal(store.listItemsForEnrichment('t').length, 40);
    assert.equal(store.getAsset('id-7').sourceRecordId, 'rec-7');

    // Och de ligger nu i shards.
    assert.equal((await shardFiler(filePath)).length, 64);
    const meta = JSON.parse(await fs.readFile(path.join(shardDir(filePath), 'meta.json'), 'utf8'));
    assert.equal(meta.shardCount, 64);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('data överlever en omladdning från shards', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const forst = await createCcoPatientAssetStore({ filePath });
    const skapad = [];
    for (let i = 0; i < 25; i += 1) {
      skapad.push(await forst.addAsset({ ...BASE, sourceRecordId: 'r-' + i }));
    }

    const igen = await createCcoPatientAssetStore({ filePath });
    assert.equal(igen.listItemsForEnrichment('t').length, 25);
    for (const a of skapad) {
      assert.equal(igen.getAsset(a.id).sourceRecordId, a.sourceRecordId);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en ändring skriver BARA den berörda sharden', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    const assets = [];
    for (let i = 0; i < 60; i += 1) {
      assets.push(await store.addAsset({ ...BASE, sourceRecordId: 'r-' + i }));
    }

    const dir = shardDir(filePath);
    const filer = await shardFiler(filePath);
    const fore = new Map();
    for (const f of filer) fore.set(f, (await fs.stat(path.join(dir, f))).mtimeMs);

    // Vänta så mtime hinner ticka, ändra sedan EN asset.
    await new Promise((r) => setTimeout(r, 20));
    await store.transitionStatus(assets[0].id, 'NEEDS_REVIEW', { actor: { role: 'system' } });

    let andrade = 0;
    for (const f of filer) {
      if ((await fs.stat(path.join(dir, f))).mtimeMs !== fore.get(f)) andrade += 1;
    }

    // Kärnan i hela ändringen: en asset rör en shard, inte alla 64.
    assert.equal(andrade, 1, 'exakt en shard ska ha skrivits om');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en raderad asset försvinner ur sin shard', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const auditLog = {
      events: [],
      append(e) {
        this.events.push(e);
      },
    };
    const store = await createCcoPatientAssetStore({ filePath, auditLog });
    const kvar = await store.addAsset({ ...BASE, sourceRecordId: 'behall' });
    const bort = await store.addAsset({ ...BASE, sourceRecordId: 'radera' });

    await store.transitionStatus(bort.id, 'NEEDS_REVIEW', { actor: { role: 'system' } });
    await store.transitionStatus(bort.id, 'REJECTED', { actor: { role: 'system' } });
    await store.hardDeleteAsset(bort.id, {
      actor: { role: 'OWNER', userId: 'u' },
      reason: 'test',
      technicalReason: 'shard-test',
    });

    // En radering syns inte i en updatedAt-svep — den måste fångas separat.
    const igen = await createCcoPatientAssetStore({ filePath });
    assert.equal(igen.getAsset(bort.id), null, 'raderad asset ska vara borta efter omladdning');
    assert.ok(igen.getAsset(kvar.id), 'den andra ska finnas kvar');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en ensam skrivning ror INTE monoliten direkt', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    await store.addAsset({ ...BASE, sourceRecordId: 'forst' });
    await store.flushCompatMonolith();
    const fore = (await fs.stat(filePath)).mtimeMs;

    await new Promise((r) => setTimeout(r, 20));
    await store.addAsset({ ...BASE, sourceRecordId: 'debounce' });

    // Karnan i debouncen: shardarna skrevs, men de 196 MB vantar.
    assert.equal(
      (await fs.stat(filePath)).mtimeMs,
      fore,
      'monoliten ska inte skrivas synkront vid en ensam andring'
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('den vantande monolit-skrivningen gar att tvinga fram', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    const a = await store.addAsset({ ...BASE, sourceRecordId: 'kompat' });

    assert.equal(await store.flushCompatMonolith(), true, 'det ska finnas nagot att skriva');
    const monolit = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(monolit.items[a.id].sourceRecordId, 'kompat');

    // Inget vantar langre.
    assert.equal(await store.flushCompatMonolith(), false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('shardarna ar sanningen aven om monoliten aldrig hinner skrivas', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    const a = await store.addAsset({ ...BASE, sourceRecordId: 'bara-shard' });
    // Ingen flushCompatMonolith: simulerar att processen dor med timern kvar.

    const igen = await createCcoPatientAssetStore({ filePath });
    assert.equal(
      igen.getAsset(a.id).sourceRecordId,
      'bara-shard',
      'ingen data far ga forlorad nar monoliten ar inaktuell'
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('en batch skriver monoliten en gång, inte per checkpoint', async () => {
  const tmp = await tempdir();
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  try {
    const store = await createCcoPatientAssetStore({ filePath });
    await store.addAsset({ ...BASE, sourceRecordId: 'forst' });
    // Baslinje: tvinga fram monoliten, annars ar den debouncad och finns inte an.
    await store.flushCompatMonolith();
    const fore = (await fs.stat(filePath)).mtimeMs;

    await new Promise((r) => setTimeout(r, 20));
    store.beginBatch();
    await store.addAsset({ ...BASE, sourceRecordId: 'batch-1' });
    await store.checkpointBatch();
    await store.addAsset({ ...BASE, sourceRecordId: 'batch-2' });
    await store.checkpointBatch();

    // Under batchen ska monoliten INTE ha rörts — det är den dyra skrivningen.
    assert.equal(
      (await fs.stat(filePath)).mtimeMs,
      fore,
      'monoliten ska ligga still under batchen'
    );

    await store.flushBatch();
    assert.notEqual((await fs.stat(filePath)).mtimeMs, fore, 'flush ska regenerera monoliten');

    const monolit = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(Object.keys(monolit.items).length, 3);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
