'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  createSecureStorageProvider,
  createLocalProvider,
  buildStorageKey,
  hashPatientId,
  NotImplementedError,
} = require('../../src/ops/ccoSecureStorageProvider');

async function makeLocal() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secure-store-'));
  const provider = createLocalProvider({ rootPath: tmp });
  return { tmp, provider };
}

test('buildStorageKey: year/month/patient-hash/uuid.ext format', () => {
  const key = buildStorageKey({
    patientId: 'pat-001',
    originalFileName: 'document.pdf',
    documentDate: '2026-03-15',
  });
  // Match year/month/12-char-hex/uuid.ext
  assert.match(key, /^2026\/03\/[0-9a-f]{12}\/[0-9a-f-]{36}\.pdf$/);
});

test('buildStorageKey: faller tillbaka på importedAt om documentDate saknas', () => {
  const key = buildStorageKey({
    patientId: 'pat-002',
    mimeType: 'image/jpeg',
    importedAt: '2025-11-02T10:00:00Z',
  });
  assert.match(key, /^2025\/11\/[0-9a-f]{12}\/[0-9a-f-]{36}\.jpg$/);
});

test('buildStorageKey: hash är stabilt för samma patientId', () => {
  const h1 = hashPatientId('pat-XYZ');
  const h2 = hashPatientId('pat-XYZ');
  const h3 = hashPatientId('pat-OTHER');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.equal(h1.length, 12);
});

test('local putObject + getObject roundtrip → checksum matchar', async () => {
  const { provider } = await makeLocal();
  const body = Buffer.from('hello cco asset world');
  const put = await provider.putObject({
    body,
    contentType: 'text/plain',
    metadata: { patientId: 'pat-001', originalFileName: 'note.txt' },
  });
  assert.ok(put.storageKey);
  assert.equal(put.size, body.length);
  assert.match(put.checksum, /^[0-9a-f]{64}$/);
  assert.equal(put.deduped, false);

  const got = await provider.getObject(put.storageKey);
  assert.equal(got.size, body.length);
  assert.equal(got.checksum, put.checksum);
  assert.ok(got.buffer.equals(body));
});

test('local putObject duplicate detection → samma checksum returnerar existing key', async () => {
  const { provider } = await makeLocal();
  const body = Buffer.from('duplicate-payload-xyz');
  const a = await provider.putObject({
    body,
    contentType: 'application/pdf',
    metadata: { patientId: 'pat-dup' },
  });
  const b = await provider.putObject({
    body,
    contentType: 'application/pdf',
    metadata: { patientId: 'pat-dup' },
  });
  assert.equal(a.checksum, b.checksum);
  assert.equal(b.storageKey, a.storageKey, 'andra put returnerar existing key');
  assert.equal(b.deduped, true);
});

test('local deleteObject tar bort + exists returnerar false efter', async () => {
  const { provider } = await makeLocal();
  const put = await provider.putObject({
    body: Buffer.from('to-be-deleted'),
    metadata: { patientId: 'pat-del' },
  });
  assert.equal(await provider.exists(put.storageKey), true);
  const removed = await provider.deleteObject(put.storageKey);
  assert.equal(removed, true);
  assert.equal(await provider.exists(put.storageKey), false);
  // Idempotent: ny delete av samma key → false (inte throw)
  const removedAgain = await provider.deleteObject(put.storageKey);
  assert.equal(removedAgain, false);
});

test('local stats: räknar objects + bytes', async () => {
  const { provider } = await makeLocal();
  await provider.putObject({
    body: Buffer.from('a'.repeat(100)),
    metadata: { patientId: 'p1' },
  });
  await provider.putObject({
    body: Buffer.from('b'.repeat(200)),
    metadata: { patientId: 'p2' },
  });
  const s = await provider.stats();
  assert.equal(s.provider, 'local');
  assert.equal(s.totalObjects, 2);
  assert.equal(s.totalBytes, 300);
  assert.ok(s.rootPath);
});

test('S3 provider kastar NotImplementedError med hint om env-vars', async () => {
  const s3 = createSecureStorageProvider({ provider: 's3', bucket: null });
  await assert.rejects(
    () =>
      s3.putObject({
        body: Buffer.from('x'),
        metadata: { patientId: 'p' },
      }),
    (err) => {
      assert.ok(err instanceof NotImplementedError, 'är NotImplementedError');
      assert.match(err.message, /ARCANA_CCO_S3_BUCKET/);
      return true;
    }
  );
});

test('encrypted-fs provider kastar NotImplementedError med hint om KEK', async () => {
  const enc = createSecureStorageProvider({ provider: 'encrypted-fs' });
  await assert.rejects(
    () =>
      enc.putObject({
        body: Buffer.from('x'),
        metadata: { patientId: 'p' },
      }),
    (err) => {
      assert.ok(err instanceof NotImplementedError);
      assert.match(err.message, /ARCANA_CCO_STORAGE_KEK/);
      return true;
    }
  );
});

test('unsafe storageKey (path-traversal) avvisas', async () => {
  const { provider } = await makeLocal();
  await assert.rejects(
    () =>
      provider.putObject({
        key: '../../etc/passwd',
        body: Buffer.from('bad'),
      }),
    /unsafe/
  );
});

test('dispatcher: okänd provider kastar', () => {
  assert.throws(
    () => createSecureStorageProvider({ provider: 'badprovider' }),
    /unknown storage provider/
  );
});

test('generateThumbnailIfImage: non-image returnerar null', async () => {
  const { provider } = await makeLocal();
  const put = await provider.putObject({
    body: Buffer.from('not-an-image'),
    contentType: 'application/pdf',
    metadata: { patientId: 'p1' },
  });
  const result = await provider.generateThumbnailIfImage(
    put.storageKey,
    'application/pdf'
  );
  assert.equal(result, null);
});
