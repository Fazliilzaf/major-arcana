'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoPatientAssetStore,
  VALID_STATUSES,
  VALID_CATEGORIES,
  VALID_SOURCE_SYSTEMS,
} = require('../../src/ops/ccoPatientAssetStore');

function makeMemoryAuditLog() {
  const events = [];
  return {
    events,
    append(event) {
      events.push(event);
    },
  };
}

async function makeStore() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-asset-store-'));
  const filePath = path.join(tmp, 'cco-patient-assets.json');
  const audit = makeMemoryAuditLog();
  const store = await createCcoPatientAssetStore({ filePath, auditLog: audit });
  return { tmp, filePath, audit, store };
}

const BASE_ASSET = Object.freeze({
  patientId: 'pat-001',
  sourceSystem: 'drive',
  sourceRecordId: 'drive-file-abc123',
  originalDriveFileId: 'abc123',
  originalDrivePath: '/Hair TP/2026/Maj/example.pdf',
  originalFileName: 'example.pdf',
  storageProvider: 'local',
  storageKey: 'data/cco-storage/pat-001/example.pdf',
  mimeType: 'application/pdf',
  category: 'journal',
  fileSize: 1024,
  importedBy: 'system',
  importRunId: 'run-001',
});

test('exports canonical enums per owner-spec', () => {
  assert.ok(VALID_STATUSES.includes('DISCOVERED'));
  assert.ok(VALID_STATUSES.includes('LINK_ONLY_BLOCKER'));
  assert.equal(VALID_STATUSES.length, 10);
  assert.ok(VALID_CATEGORIES.includes('journal'));
  assert.ok(VALID_CATEGORIES.includes('aisia_report'));
  assert.equal(VALID_CATEGORIES.length, 9);
  assert.deepEqual(
    [...VALID_SOURCE_SYSTEMS].sort(),
    ['cco_camera', 'drive', 'meridiq', 'old_cco', 'upload'].sort()
  );
});

test('addAsset persists with UUID, default status, and emits asset.imported', async () => {
  const { tmp, store, audit, filePath } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    assert.ok(created.id);
    assert.equal(created.patientId, 'pat-001');
    assert.equal(created.status, 'DISCOVERED');
    assert.equal(created.category, 'journal');
    assert.equal(created.sourceSystem, 'drive');
    // audit emitted
    const ev = audit.events.find((e) => e.action === 'asset.imported');
    assert.ok(ev, 'asset.imported event should be emitted');
    // PII-safety: no patient names in detail
    assert.equal(ev.detail.patientId, 'pat-001');
    assert.equal(ev.detail.category, 'journal');
    assert.ok(!ev.detail.email);
    assert.ok(!ev.detail.personnummer);
    // persisted to disk
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(Object.keys(raw.items).length, 1);
    assert.equal(raw.schemaVersion, '1.0.0');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('addAsset rejects missing patientId / sourceSystem and invalid enum', async () => {
  const { tmp, store } = await makeStore();
  try {
    await assert.rejects(
      () => store.addAsset({ sourceSystem: 'drive', category: 'journal' }),
      /patientId/
    );
    await assert.rejects(
      () => store.addAsset({ patientId: 'p1', category: 'journal' }),
      /sourceSystem/
    );
    await assert.rejects(
      () =>
        store.addAsset({
          patientId: 'p1',
          sourceSystem: 'INVALID_SOURCE',
          category: 'journal',
        }),
      /invalid sourceSystem/
    );
    await assert.rejects(
      () =>
        store.addAsset({
          patientId: 'p1',
          sourceSystem: 'drive',
          category: 'wrong_category',
        }),
      /invalid category/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('updateAssetStatus walks the state-machine and emits asset.status_changed', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    const updated = await store.updateAssetStatus(
      created.id,
      'IMPORTING',
      'starting copy'
    );
    assert.equal(updated.status, 'IMPORTING');
    assert.ok(updated.statusHistory.length >= 1);
    const last = updated.statusHistory[updated.statusHistory.length - 1];
    assert.equal(last.from, 'DISCOVERED');
    assert.equal(last.to, 'IMPORTING');
    assert.equal(last.reason, 'starting copy');
    // audit
    const ev = audit.events.find((e) => e.action === 'asset.status_changed');
    assert.ok(ev);
    assert.equal(ev.detail.from, 'DISCOVERED');
    assert.equal(ev.detail.to, 'IMPORTING');
    // invalid status rejects
    await assert.rejects(
      () => store.updateAssetStatus(created.id, 'NOT_A_STATUS'),
      /invalid status/
    );
    // missing id throws 404
    await assert.rejects(
      () => store.updateAssetStatus('does-not-exist', 'IMPORTED_TO_CCO'),
      /hittades inte/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('listAssetsForPatient filters by category/status and emits asset.read', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    await store.addAsset({ ...BASE_ASSET, category: 'journal' });
    await store.addAsset({ ...BASE_ASSET, category: 'photo_before' });
    await store.addAsset({ ...BASE_ASSET, category: 'consent', patientId: 'pat-002' });

    const allForP1 = store.listAssetsForPatient('pat-001');
    assert.equal(allForP1.length, 2);

    const onlyJournal = store.listAssetsForPatient('pat-001', { category: 'journal' });
    assert.equal(onlyJournal.length, 1);
    assert.equal(onlyJournal[0].category, 'journal');

    const onlyDiscovered = store.listAssetsForPatient('pat-001', {
      status: 'DISCOVERED',
    });
    assert.equal(onlyDiscovered.length, 2);

    const reads = audit.events.filter((e) => e.action === 'asset.read');
    assert.equal(reads.length, 3);
    // PII-safety: read-event has count only, not a payload of names
    assert.equal(reads[0].detail.scope, 'patient');
    assert.ok(typeof reads[0].detail.count === 'number');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('listAssetsForEncounter + getAsset + linkAssetToEncounter', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET, encounterId: 'enc-1' });
    const b = await store.addAsset({ ...BASE_ASSET, encounterId: 'enc-2' });

    const enc1 = store.listAssetsForEncounter('enc-1');
    assert.equal(enc1.length, 1);
    assert.equal(enc1[0].id, a.id);

    assert.equal(store.getAsset(b.id).encounterId, 'enc-2');
    assert.equal(store.getAsset('nope'), null);

    const moved = await store.linkAssetToEncounter(b.id, 'enc-1');
    assert.equal(moved.encounterId, 'enc-1');
    assert.equal(store.listAssetsForEncounter('enc-1').length, 2);

    const linkEv = audit.events.find((e) => e.action === 'asset.linked_to_encounter');
    assert.ok(linkEv);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsLinkOnlyBlocker + markAsVisibleOnPatientCard emit dedicated audits', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    const flagged = await store.markAsLinkOnlyBlocker(created.id, 'no_binary_yet');
    assert.equal(flagged.status, 'LINK_ONLY_BLOCKER');
    assert.ok(audit.events.some((e) => e.action === 'asset.link_only_blocker_flagged'));

    // Now resurrect through visible
    const visible = await store.markAsVisibleOnPatientCard(created.id);
    assert.equal(visible.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.ok(
      audit.events.some(
        (e) =>
          e.action === 'asset.status_changed' &&
          e.detail.to === 'VISIBLE_ON_PATIENT_CARD'
      )
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('recordChecksumVerified stores SHA-256 and emits asset.checksum_verified', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    const hash = 'a'.repeat(64);
    const updated = await store.recordChecksumVerified(created.id, hash);
    assert.equal(updated.checksum, hash);
    const ev = audit.events.find((e) => e.action === 'asset.checksum_verified');
    assert.ok(ev);
    assert.equal(ev.detail.algo, 'sha256');
    await assert.rejects(() => store.recordChecksumVerified(created.id, ''), /checksum/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stats returns counts only — no PII, with link_only and duplicate counters', async () => {
  const { tmp, store } = await makeStore();
  try {
    await store.addAsset({ ...BASE_ASSET, category: 'journal' });
    const b = await store.addAsset({ ...BASE_ASSET, category: 'photo_after' });
    const c = await store.addAsset({ ...BASE_ASSET, category: 'consent' });
    await store.markAsLinkOnlyBlocker(b.id, 'no_binary');
    await store.updateAssetStatus(c.id, 'DUPLICATE', 'same checksum');
    const s = store.stats('tenant-a');
    assert.equal(s.total, 3);
    assert.equal(s.linkOnlyCount, 1);
    assert.equal(s.duplicateCount, 1);
    assert.equal(s.byStatus.LINK_ONLY_BLOCKER, 1);
    assert.equal(s.byStatus.DUPLICATE, 1);
    assert.equal(s.byStatus.DISCOVERED, 1);
    assert.equal(s.byCategory.journal, 1);
    assert.equal(s.bySourceSystem.drive, 3);
    assert.equal(s.tenantId, 'tenant-a');
    // No PII leakage — stats has no patient-id / name field
    assert.ok(!('patientId' in s));
    assert.ok(!('patients' in s));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('persists across re-open (atomic-write + readJson)', async () => {
  const { tmp, store, filePath } = await makeStore();
  try {
    await store.addAsset({ ...BASE_ASSET, category: 'agreement' });
    // Re-instantiate
    const re = await createCcoPatientAssetStore({ filePath });
    const list = re.listAssetsForPatient('pat-001');
    assert.equal(list.length, 1);
    assert.equal(list[0].category, 'agreement');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
