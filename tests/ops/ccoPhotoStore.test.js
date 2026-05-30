'use strict';

/**
 * P0.6 — ccoPhotoStore tests (foto/encounter-koppling).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPhotoStore, VALID_TYPES, VALID_SOURCES } =
  require('../../src/ops/ccoPhotoStore');
const { roleHasPermission } = require('../../src/security/ccoRbac');

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cco-photos-'));
}

function fakeAudit() {
  const events = [];
  return {
    events,
    append: (e) => events.push(e),
  };
}

test('P0.6.1 — addPhoto persists metadata + assigns photoId', async () => {
  const dir = await mkTmp();
  const audit = fakeAudit();
  const store = await createCcoPhotoStore({
    filePath: path.join(dir, 'photos.json'),
    auditLog: audit,
  });
  const photo = await store.addPhoto(
    {
      tenantId: 't1',
      patientId: 'p1',
      type: 'before',
      source: 'cco_camera',
      mimeType: 'image/jpeg',
      sizeBytes: 12345,
    },
    { actor: { role: 'operator', userId: 'u1' } }
  );
  assert.ok(photo.photoId);
  assert.equal(photo.type, 'before');
  assert.equal(photo.source, 'cco_camera');
  assert.equal(photo.sizeBytes, 12345);
  assert.equal(audit.events.length, 1);
  assert.equal(audit.events[0].action, 'photo.write');
});

test('P0.6.2 — invalid type rejected, invalid source rejected', async () => {
  const dir = await mkTmp();
  const store = await createCcoPhotoStore({ filePath: path.join(dir, 'p.json') });
  await assert.rejects(
    () => store.addPhoto({ tenantId: 't1', patientId: 'p1', type: 'bogus' }),
    /invalid photo type/
  );
  await assert.rejects(
    () =>
      store.addPhoto({
        tenantId: 't1',
        patientId: 'p1',
        type: 'before',
        source: 'pirate',
      }),
    /invalid photo source/
  );
});

test('P0.6.3 — linkPhotoToEncounter binds photo to encounter + treatmentDate', async () => {
  const dir = await mkTmp();
  const audit = fakeAudit();
  const store = await createCcoPhotoStore({
    filePath: path.join(dir, 'p.json'),
    auditLog: audit,
  });
  const photo = await store.addPhoto(
    { tenantId: 't1', patientId: 'p1', type: 'before' },
    { actor: { role: 'konsult' } }
  );
  const linked = await store.linkPhotoToEncounter({
    tenantId: 't1',
    patientId: 'p1',
    photoId: photo.photoId,
    encounterId: 'enc-42',
    treatmentDate: '2026-05-30',
    actor: { role: 'konsult', userId: 'u1' },
  });
  assert.equal(linked.encounterId, 'enc-42');
  assert.equal(linked.treatmentDate, '2026-05-30');
  // Verify on disk persisted
  const raw = JSON.parse(await fs.readFile(path.join(dir, 'p.json'), 'utf8'));
  assert.equal(raw.photos[0].encounterId, 'enc-42');
});

test('P0.6.4 — listForPatient + listForEncounter + bucketByPhase', async () => {
  const dir = await mkTmp();
  const store = await createCcoPhotoStore({ filePath: path.join(dir, 'p.json') });
  for (const [type, encId] of [
    ['before', 'enc-1'],
    ['after', 'enc-1'],
    ['during', 'enc-1'],
    ['reference', null],
    ['after', 'enc-2'],
  ]) {
    await store.addPhoto({
      tenantId: 't1',
      patientId: 'p1',
      type,
      encounterId: encId || undefined,
    });
  }
  const all = store.listForPatient({ tenantId: 't1', patientId: 'p1' });
  assert.equal(all.length, 5);
  const enc1 = store.listForEncounter({
    tenantId: 't1',
    patientId: 'p1',
    encounterId: 'enc-1',
  });
  assert.equal(enc1.length, 3);
  const bucket = store.bucketByPhase({
    tenantId: 't1',
    patientId: 'p1',
    encounterId: 'enc-1',
  });
  assert.equal(bucket.before.length, 1);
  assert.equal(bucket.after.length, 1);
  assert.equal(bucket.during.length, 1);
  assert.equal(bucket.reference.length, 0);
});

test('P0.6.5 — audit emitted on add/link/read/delete', async () => {
  const dir = await mkTmp();
  const audit = fakeAudit();
  const store = await createCcoPhotoStore({
    filePath: path.join(dir, 'p.json'),
    auditLog: audit,
  });
  const photo = await store.addPhoto(
    { tenantId: 't1', patientId: 'p1', type: 'after' },
    { actor: { role: 'owner' } }
  );
  await store.linkPhotoToEncounter({
    tenantId: 't1',
    patientId: 'p1',
    photoId: photo.photoId,
    encounterId: 'enc-99',
    actor: { role: 'owner' },
  });
  store.listForPatient({ tenantId: 't1', patientId: 'p1', actor: { role: 'operator' } });
  await store.deletePhoto({
    tenantId: 't1',
    patientId: 'p1',
    photoId: photo.photoId,
    actor: { role: 'owner' },
  });
  const actions = audit.events.map((e) => e.action);
  assert.deepEqual(actions, [
    'photo.write',
    'photo.write',
    'photo.read',
    'photo.delete',
  ]);
});

test('P0.6.6 — stats by type/source/linked', async () => {
  const dir = await mkTmp();
  const store = await createCcoPhotoStore({ filePath: path.join(dir, 'p.json') });
  await store.addPhoto({
    tenantId: 't1',
    patientId: 'p1',
    type: 'before',
    source: 'cco_camera',
    encounterId: 'e-1',
  });
  await store.addPhoto({
    tenantId: 't1',
    patientId: 'p1',
    type: 'after',
    source: 'cco_camera',
    encounterId: 'e-1',
  });
  await store.addPhoto({
    tenantId: 't1',
    patientId: 'p2',
    type: 'reference',
    source: 'drive',
  });
  const s = store.stats({ tenantId: 't1' });
  assert.equal(s.total, 3);
  assert.equal(s.byType.before, 1);
  assert.equal(s.byType.after, 1);
  assert.equal(s.byType.reference, 1);
  assert.equal(s.bySource.cco_camera, 2);
  assert.equal(s.bySource.drive, 1);
  assert.equal(s.linkedToEncounter, 2);
  assert.equal(s.unlinked, 1);
});

test('P0.6.7 — deletePhoto 404 if missing, getPhoto returns null if missing', async () => {
  const dir = await mkTmp();
  const store = await createCcoPhotoStore({ filePath: path.join(dir, 'p.json') });
  assert.equal(store.getPhoto({ tenantId: 't1', patientId: 'p1', photoId: 'nope' }), null);
  await assert.rejects(
    () => store.deletePhoto({ tenantId: 't1', patientId: 'p1', photoId: 'nope' }),
    /hittades inte/
  );
});

test('P0.6.8 — RBAC: photo.read/write/delete map to expected roles', () => {
  // photo.read = owner, operator, konsult, personal
  assert.equal(roleHasPermission('owner', 'photo.read'), true);
  assert.equal(roleHasPermission('operator', 'photo.read'), true);
  assert.equal(roleHasPermission('konsult', 'photo.read'), true);
  assert.equal(roleHasPermission('personal', 'photo.read'), true);
  assert.equal(roleHasPermission('revisor', 'photo.read'), false);

  // photo.write = owner, operator, konsult
  assert.equal(roleHasPermission('owner', 'photo.write'), true);
  assert.equal(roleHasPermission('operator', 'photo.write'), true);
  assert.equal(roleHasPermission('konsult', 'photo.write'), true);
  assert.equal(roleHasPermission('personal', 'photo.write'), false);
  assert.equal(roleHasPermission('revisor', 'photo.write'), false);

  // photo.delete = owner only
  assert.equal(roleHasPermission('owner', 'photo.delete'), true);
  assert.equal(roleHasPermission('operator', 'photo.delete'), false);
  assert.equal(roleHasPermission('konsult', 'photo.delete'), false);
  assert.equal(roleHasPermission('personal', 'photo.delete'), false);
});

test('P0.6.9 — VALID_TYPES + VALID_SOURCES exported', () => {
  assert.deepEqual([...VALID_TYPES].sort(), ['after', 'before', 'consent', 'during', 'reference']);
  assert.ok(VALID_SOURCES.includes('cco_camera'));
  assert.ok(VALID_SOURCES.includes('drive'));
});
