'use strict';

/**
 * TENANT-ISOLERINGEN FÖR PATIENTFOTON ÄR KATALOGNAMN.
 *
 * `ccoJournalPhotoStore` lägger foton på
 * `<baseDir>/<tenantId>/<patientId>/<photoId>.jpg`. Fram till den här fixen var
 * `normalizeText` — som är `trim()`, inte sanering — enda bearbetningen av de
 * tre segmenten, och `patientId` kommer rakt från `req.query` i
 * `GET /cco-journal/photo`. En inloggad personal i tenant A kunde därmed be om
 * `patientId=../<tenant-b>/<patient>` och nå utanför sin egen katalog.
 *
 * `ccoSecureStorageProvider` har haft samma spärr sedan start (se dess
 * `absolute()` och testet "unsafe storageKey (path-traversal) avvisas"). Den
 * här filen ger journalfoto-storen motsvarande täckning.
 *
 * Två lager vaktas, med flit:
 *   1. STOREN — täcker alla sex konsumenter (även patient-/personalportalen).
 *      En vakt i en enda rutt hade bara skyddat den rutten.
 *   2. RUTTEN — slår upp patientId mot registret i anroparens tenant innan
 *      sökvägen byggs, så att legitim trafik aldrig når spärren och ett
 *      främmande id avvisas som 404 i stället för 500.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoJournalPhotoStore } = require('../../src/ops/ccoJournalPhotoStore');
const { createCcoJournalRouter } = require('../../src/routes/ccoJournal');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');

async function makeStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-photo-guard-'));
  const store = await createCcoJournalPhotoStore({ baseDir: path.join(tempDir, 'photos') });
  return { store, tempDir };
}

// ── Lager 1: storen ────────────────────────────────────────────────────────

test('patientId med ../ avvisas av storen', async () => {
  const { store } = await makeStore();
  await assert.rejects(
    () => store.readPhoto({ tenantId: 'tenant-a', patientId: '../tenant-b/p-1', photoId: 'x' }),
    /unsafe patientId/
  );
});

test('tenantId med ../ avvisas av storen', async () => {
  const { store } = await makeStore();
  await assert.rejects(
    () => store.readPhoto({ tenantId: '../..', patientId: 'p-1', photoId: 'x' }),
    /unsafe tenantId/
  );
});

test('photoId med separator avvisas — filnamnet är också ett segment', async () => {
  const { store } = await makeStore();
  await assert.rejects(
    () => store.readPhoto({ tenantId: 'tenant-a', patientId: 'p-1', photoId: '../../etc/passwd' }),
    /unsafe photoId/
  );
});

test('skrivvägen är spärrad likadant — inte bara läsvägen', async () => {
  const { store } = await makeStore();
  await assert.rejects(
    () =>
      store.savePhoto({
        tenantId: 'tenant-a',
        patientId: '../tenant-b/p-1',
        buffer: Buffer.from('x'),
        mimeType: 'image/jpeg',
      }),
    /unsafe patientId/
  );
});

test('tomt segment avvisas i stället för att tyst bli baseDir-roten', async () => {
  const { store } = await makeStore();
  await assert.rejects(
    () => store.readPhoto({ tenantId: 'tenant-a', patientId: '', photoId: 'x' }),
    /patientId saknas/
  );
});

test('legitima id:n passerar oförändrade', async () => {
  const { store } = await makeStore();
  const saved = await store.savePhoto({
    tenantId: 'hair-tp-clinic',
    patientId: '0f2f33bb-4282-460d-a785-c88df9e1ac08',
    buffer: Buffer.from('bild'),
    mimeType: 'image/jpeg',
  });
  assert.ok(saved.photoId, 'ett foto ska sparas');
  const read = await store.readPhoto({
    tenantId: 'hair-tp-clinic',
    patientId: '0f2f33bb-4282-460d-a785-c88df9e1ac08',
    photoId: saved.photoId,
  });
  assert.equal(read.buffer.toString(), 'bild');
});

// ── Lager 2: rutten ────────────────────────────────────────────────────────

async function withPhotoRoute(patients, run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-photo-route-'));
  const journalStore = await createCcoJournalStore({
    filePath: path.join(tempDir, 'journal.json'),
  });
  const journalPhotoStore = await createCcoJournalPhotoStore({
    baseDir: path.join(tempDir, 'photos'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoJournalRouter({
      journalStore,
      journalPhotoStore,
      patientMasterStore: {
        async getPatient({ tenantId, patientId }) {
          return patients.find((p) => p.tenantId === tenantId && p.id === patientId) || null;
        },
        assertPatientJournalWritable() {},
      },
      authStore: {
        async addAuditEvent() {
          return true;
        },
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: { defaultTenantId: 'tenant-a' },
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rutten avvisar patientId som inte finns i anroparens tenant', async () => {
  const patients = [{ id: 'p-egen', tenantId: 'tenant-a' }];
  await withPhotoRoute(patients, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-journal/photo?patientId=p-frammande&photoId=x`);
    assert.equal(res.status, 404, 'främmande patientId ska avvisas innan sökvägen byggs');
  });
});

test('rutten avvisar traversal som 404, inte 500 — grinden ligger före spärren', async () => {
  const patients = [{ id: 'p-egen', tenantId: 'tenant-a' }];
  await withPhotoRoute(patients, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-journal/photo?patientId=${encodeURIComponent('../tenant-b/p-1')}&photoId=x`
    );
    assert.equal(res.status, 404);
  });
});
