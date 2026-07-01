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
  STATUS_TRANSITIONS,
  SOFT_DELETE_TARGETS,
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

// Helper: bygg ett asset i en given slut-status via legitima transitions
async function buildAssetAtStatus(store, status, overrides = {}) {
  const a = await store.addAsset({ ...BASE_ASSET, ...overrides });
  switch (status) {
    case 'DISCOVERED':
      return a;
    case 'IMPORTING':
      return store.transitionStatus(a.id, 'IMPORTING');
    case 'IMPORTED_TO_CCO': {
      await store.transitionStatus(a.id, 'IMPORTING');
      return store.transitionStatus(a.id, 'IMPORTED_TO_CCO');
    }
    case 'VERIFIED_IN_CCO': {
      await store.transitionStatus(a.id, 'IMPORTING');
      await store.transitionStatus(a.id, 'IMPORTED_TO_CCO');
      await store.recordChecksumVerified(a.id, 'sha256:' + 'a'.repeat(64));
      return store.transitionStatus(a.id, 'VERIFIED_IN_CCO');
    }
    case 'VISIBLE_ON_PATIENT_CARD': {
      await store.transitionStatus(a.id, 'IMPORTING');
      await store.transitionStatus(a.id, 'IMPORTED_TO_CCO');
      await store.recordChecksumVerified(a.id, 'sha256:' + 'a'.repeat(64));
      await store.transitionStatus(a.id, 'VERIFIED_IN_CCO');
      return store.markAsVisibleOnPatientCard(a.id);
    }
    case 'NEEDS_REVIEW':
      return store.transitionStatus(a.id, 'NEEDS_REVIEW');
    case 'DUPLICATE':
      return store.transitionStatus(a.id, 'DUPLICATE');
    case 'FAILED_IMPORT':
      return store.transitionStatus(a.id, 'FAILED_IMPORT');
    case 'LINK_ONLY_BLOCKER':
      return store.transitionStatus(a.id, 'LINK_ONLY_BLOCKER');
    case 'REJECTED':
      // via NEEDS_REVIEW -> REJECTED
      await store.transitionStatus(a.id, 'NEEDS_REVIEW');
      return store.transitionStatus(a.id, 'REJECTED');
    default:
      throw new Error('unknown status: ' + status);
  }
}

// -----------------------------------------------------------------------------
// Original 10 tests (uppdaterade där state-machine bryts)
// -----------------------------------------------------------------------------

test('exports canonical enums per owner-spec', () => {
  assert.ok(VALID_STATUSES.includes('DISCOVERED'));
  assert.ok(VALID_STATUSES.includes('LINK_ONLY_BLOCKER'));
  assert.equal(VALID_STATUSES.length, 10);
  assert.ok(VALID_CATEGORIES.includes('journal'));
  assert.ok(VALID_CATEGORIES.includes('aisia_report'));
  assert.equal(VALID_CATEGORIES.length, 9);
  assert.deepEqual(
    [...VALID_SOURCE_SYSTEMS].sort(),
    [
      'aisia_ds3',
      'cco_camera',
      'cco_journal_sign',
      'drive',
      'drive_import',
      'getaccept_import',
      'm365_halso',
      'meridiq',
      'old_cco',
      'upload',
    ].sort()
  );
  // P0.B++ — nya exports
  assert.ok(STATUS_TRANSITIONS);
  assert.deepEqual(
    [...SOFT_DELETE_TARGETS].sort(),
    ['DUPLICATE', 'NEEDS_REVIEW', 'REJECTED'].sort()
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
    const ev = audit.events.find((e) => e.action === 'asset.imported');
    assert.ok(ev);
    assert.equal(ev.detail.patientId, 'pat-001');
    assert.equal(ev.detail.category, 'journal');
    assert.ok(!ev.detail.email);
    assert.ok(!ev.detail.personnummer);
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(Object.keys(raw.items).length, 1);
    assert.equal(raw.schemaVersion, '1.1.0');
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
    const updated = await store.updateAssetStatus(created.id, 'IMPORTING', 'starting copy');
    assert.equal(updated.status, 'IMPORTING');
    assert.ok(updated.statusHistory.length >= 1);
    const last = updated.statusHistory[updated.statusHistory.length - 1];
    assert.equal(last.from, 'DISCOVERED');
    assert.equal(last.to, 'IMPORTING');
    assert.equal(last.reason, 'starting copy');
    const ev = audit.events.find((e) => e.action === 'asset.status_changed');
    assert.ok(ev);
    assert.equal(ev.detail.from, 'DISCOVERED');
    assert.equal(ev.detail.to, 'IMPORTING');
    await assert.rejects(
      () => store.updateAssetStatus(created.id, 'NOT_A_STATUS'),
      /invalid status/
    );
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

test('markAsLinkOnlyBlocker emits dedicated audit (DISCOVERED -> LINK_ONLY_BLOCKER)', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    const flagged = await store.markAsLinkOnlyBlocker(created.id, 'no_binary_yet');
    assert.equal(flagged.status, 'LINK_ONLY_BLOCKER');
    assert.ok(audit.events.some((e) => e.action === 'asset.link_only_blocker_flagged'));
    // VISIBLE_ON_PATIENT_CARD direkt från LINK_ONLY_BLOCKER är förbjudet:
    await assert.rejects(
      () => store.markAsVisibleOnPatientCard(created.id),
      /VERIFIED_IN_CCO|forbidden transition/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('recordChecksumVerified stores SHA-256 and emits asset.checksum_verified', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const created = await store.addAsset({ ...BASE_ASSET });
    const hash = 'sha256:' + 'a'.repeat(64);
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
  // OWNER-SKÄRPNING #5: Drive-provenance + saknad checksum → räknas som blocker.
  // BASE_ASSET har originalDriveFileId='abc123' och inget checksum,
  // så alla 3 räknas som blockers tills checksum är satt.
  const { tmp, store } = await makeStore();
  try {
    await store.addAsset({
      ...BASE_ASSET,
      category: 'journal',
      checksum: 'sha256:' + 'a'.repeat(64),
    });
    const b = await store.addAsset({
      ...BASE_ASSET,
      category: 'photo_after',
      checksum: 'sha256:' + 'b'.repeat(64),
    });
    const c = await store.addAsset({
      ...BASE_ASSET,
      category: 'consent',
      checksum: 'sha256:' + 'c'.repeat(64),
    });
    await store.markAsLinkOnlyBlocker(b.id, 'no_binary');
    await store.updateAssetStatus(c.id, 'DUPLICATE', 'same checksum');
    const s = store.stats('tenant-a');
    assert.equal(s.total, 3);
    assert.equal(s.linkOnlyCount, 1);
    assert.equal(s.linkOnlyBlockerCount, 1);
    assert.equal(s.duplicateCount, 1);
    assert.equal(s.byStatus.LINK_ONLY_BLOCKER, 1);
    assert.equal(s.byStatus.DUPLICATE, 1);
    assert.equal(s.byStatus.DISCOVERED, 1);
    assert.equal(s.byCategory.journal, 1);
    assert.equal(s.bySourceSystem.drive, 3);
    assert.equal(s.tenantId, 'tenant-a');
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
    const re = await createCcoPatientAssetStore({ filePath });
    const list = re.listAssetsForPatient('pat-001');
    assert.equal(list.length, 1);
    assert.equal(list[0].category, 'agreement');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// P0.B++ guards — transitionStatus (5)
// -----------------------------------------------------------------------------

test('transitionStatus: valid DISCOVERED -> IMPORTING transitionerar OK', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    const next = await store.transitionStatus(a.id, 'IMPORTING', { reason: 'go' });
    assert.equal(next.status, 'IMPORTING');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('transitionStatus: invalid transition DISCOVERED -> VISIBLE_ON_PATIENT_CARD kastar 409', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    await assert.rejects(
      () => store.transitionStatus(a.id, 'VISIBLE_ON_PATIENT_CARD'),
      /forbidden transition/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('transitionStatus: NEEDS_REVIEW → DUPLICATE tillåten', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'NEEDS_REVIEW');
    const updated = await store.transitionStatus(a.id, 'DUPLICATE', { reason: 'duplicate' });
    assert.equal(updated.status, 'DUPLICATE');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('transitionStatus: REJECTED är terminal — alla transitions kastar', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'REJECTED');
    await assert.rejects(() => store.transitionStatus(a.id, 'DISCOVERED'), /forbidden transition/);
    await assert.rejects(
      () => store.transitionStatus(a.id, 'VERIFIED_IN_CCO'),
      /forbidden transition/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('transitionStatus: emit asset.status_changed audit med from/to/reason', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    await store.transitionStatus(a.id, 'IMPORTING', { reason: 'r1' });
    const ev = audit.events.find(
      (e) => e.action === 'asset.status_changed' && e.detail.to === 'IMPORTING'
    );
    assert.ok(ev);
    assert.equal(ev.detail.from, 'DISCOVERED');
    assert.equal(ev.detail.reason, 'r1');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('transitionStatus: full happy-path DISCOVERED -> IMPORTING -> IMPORTED -> VERIFIED -> VISIBLE', async () => {
  const { tmp, store } = await makeStore();
  try {
    const visible = await buildAssetAtStatus(store, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(visible.status, 'VISIBLE_ON_PATIENT_CARD');
    // Och VISIBLE -> NEEDS_REVIEW är tillåtet
    const reviewed = await store.transitionStatus(visible.id, 'NEEDS_REVIEW');
    assert.equal(reviewed.status, 'NEEDS_REVIEW');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// markAsVisibleOnPatientCard (6)
// -----------------------------------------------------------------------------

test('markAsVisibleOnPatientCard: full guards uppfyllda -> OK', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'VERIFIED_IN_CCO');
    const visible = await store.markAsVisibleOnPatientCard(a.id);
    assert.equal(visible.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.ok(audit.events.some((e) => e.action === 'asset.linked_to_patient'));
    assert.ok(
      audit.events.some(
        (e) => e.action === 'asset.status_changed' && e.detail.to === 'VISIBLE_ON_PATIENT_CARD'
      )
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsVisibleOnPatientCard: saknad storageKey -> error listar storageKey', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET, storageKey: 'placeholder' });
    // Walka till VERIFIED men nolla storageKey efter
    await store.transitionStatus(a.id, 'IMPORTING');
    await store.transitionStatus(a.id, 'IMPORTED_TO_CCO');
    await store.recordChecksumVerified(a.id, 'sha256:' + 'a'.repeat(64));
    await store.transitionStatus(a.id, 'VERIFIED_IN_CCO');
    // Manuell mutering via _state (test-only)
    store._state().items[a.id].storageKey = null;
    await assert.rejects(() => store.markAsVisibleOnPatientCard(a.id), /storageKey/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsVisibleOnPatientCard: saknad checksum -> error listar checksum', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    await store.transitionStatus(a.id, 'IMPORTING');
    await store.transitionStatus(a.id, 'IMPORTED_TO_CCO');
    // Hoppa över recordChecksumVerified
    await store.transitionStatus(a.id, 'VERIFIED_IN_CCO');
    await assert.rejects(() => store.markAsVisibleOnPatientCard(a.id), /checksum/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsVisibleOnPatientCard: utan patientId KASTAR ALLTID — review-bypass existerar inte', async () => {
  // OWNER-SKÄRPNING #1: patientId är obligatoriskt. Review-approval är vägen
  // TILL patientId via reassignToPatient(), inte ett sätt att kringgå guarden.
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'VERIFIED_IN_CCO');
    // Nolla patientId post-hoc
    store._state().items[a.id].patientId = '';
    await assert.rejects(() => store.markAsVisibleOnPatientCard(a.id), /patientId krävs ALLTID/);
    // Även med (gammal) "reviewApproved"-flagga är det förbjudet:
    await assert.rejects(
      () => store.markAsVisibleOnPatientCard(a.id, { reviewApproved: true }),
      /patientId krävs ALLTID/
    );
    // patientId='unknown' (sentinel) räknas också som saknat
    store._state().items[a.id].patientId = 'unknown';
    await assert.rejects(() => store.markAsVisibleOnPatientCard(a.id), /patientId krävs ALLTID/);
    // När patientId är riktigt satt → OK
    store._state().items[a.id].patientId = 'pat-resolved';
    const ok = await store.markAsVisibleOnPatientCard(a.id);
    assert.equal(ok.status, 'VISIBLE_ON_PATIENT_CARD');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('reassignToPatient: happy path NEEDS_REVIEW → VERIFIED_IN_CCO → sedan markAsVisibleOnPatientCard fungerar', async () => {
  // OWNER-SKÄRPNING #1: reassignToPatient är vägen TILL patientId.
  const { tmp, store, audit } = await makeStore();
  try {
    // Bygg asset i NEEDS_REVIEW utan patientId (orphan)
    const a = await store.addAsset({
      ...BASE_ASSET,
      patientId: 'temp-anon',
      checksum: 'sha256:' + 'b'.repeat(64),
    });
    await store.transitionStatus(a.id, 'NEEDS_REVIEW');
    // Nolla patientId
    store._state().items[a.id].patientId = '';

    // markAsVisibleOnPatientCard ska KASTA (ingen patientId)
    await assert.rejects(() => store.markAsVisibleOnPatientCard(a.id), /patientId krävs ALLTID/);

    // reassignToPatient → sätter patientId + confidence='medium' + VERIFIED_IN_CCO
    const reassigned = await store.reassignToPatient(a.id, {
      patientId: 'pat-resolved-by-staff',
      reviewItemId: 'review-001',
      actor: { userId: 'staff-A', role: 'staff' },
      reason: 'manuellt verifierad mot patientkort',
    });
    assert.equal(reassigned.patientId, 'pat-resolved-by-staff');
    assert.equal(reassigned.confidence, 'medium');
    assert.equal(reassigned.status, 'VERIFIED_IN_CCO');

    // Audit-event: asset.reassigned_to_patient med reviewItemId
    const ev = audit.events.find((e) => e.action === 'asset.reassigned_to_patient');
    assert.ok(ev, 'asset.reassigned_to_patient audit saknas');
    assert.equal(ev.detail.reviewItemId, 'review-001');
    assert.equal(ev.detail.newPatientId, 'pat-resolved-by-staff');

    // Nu fungerar markAsVisibleOnPatientCard
    const visible = await store.markAsVisibleOnPatientCard(a.id);
    assert.equal(visible.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(visible.patientId, 'pat-resolved-by-staff');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('reassignToPatient: bara körbar från NEEDS_REVIEW — annars 409', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'VERIFIED_IN_CCO');
    await assert.rejects(
      () =>
        store.reassignToPatient(a.id, {
          patientId: 'pat-other',
          actor: { userId: 'staff-A' },
        }),
      /NEEDS_REVIEW/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('reassignToPatient: patientId="unknown" eller tomt avvisas', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    await store.transitionStatus(a.id, 'NEEDS_REVIEW');
    await assert.rejects(
      () => store.reassignToPatient(a.id, { patientId: '', actor: { userId: 'u' } }),
      /patientId krävs/
    );
    await assert.rejects(
      () => store.reassignToPatient(a.id, { patientId: 'unknown', actor: { userId: 'u' } }),
      /patientId krävs/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsVisibleOnPatientCard: fel current-status (IMPORTED_TO_CCO) -> error', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'IMPORTED_TO_CCO');
    // sätt checksum så vi inte fastnar där först
    await store.recordChecksumVerified(a.id, 'sha256:' + 'a'.repeat(64));
    await assert.rejects(
      () => store.markAsVisibleOnPatientCard(a.id),
      /status=VERIFIED_IN_CCO|VERIFIED_IN_CCO \(was/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('markAsVisibleOnPatientCard: asset finns inte -> 404', async () => {
  const { tmp, store } = await makeStore();
  try {
    await assert.rejects(() => store.markAsVisibleOnPatientCard('does-not-exist'), /hittades inte/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// softDeleteAsset (3)
// -----------------------------------------------------------------------------

test('softDeleteAsset: default REJECTED från NEEDS_REVIEW', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'NEEDS_REVIEW');
    const r = await store.softDeleteAsset(a.id, {
      reason: 'staff_reject',
      actor: { userId: 'u1' },
    });
    assert.equal(r.status, 'REJECTED');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('softDeleteAsset: target=DUPLICATE från DISCOVERED', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    const r = await store.softDeleteAsset(a.id, {
      target: 'DUPLICATE',
      reason: 'same checksum',
      actor: { userId: 'sys' },
    });
    assert.equal(r.status, 'DUPLICATE');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('softDeleteAsset: invalid target kastar 400', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET });
    await assert.rejects(
      () => store.softDeleteAsset(a.id, { target: 'FAILED_IMPORT', actor: { userId: 'u' } }),
      /REJECTED, DUPLICATE eller NEEDS_REVIEW/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// hardDeleteAsset (4)
// -----------------------------------------------------------------------------

test('hardDeleteAsset: tekniskt fel utan klinisk relevans -> raderar och returnerar info', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
    });
    const r = await store.hardDeleteAsset(a.id, {
      technicalReason: 'corrupted_file_redownload_needed',
      actor: { userId: 'admin-1', role: 'admin' },
    });
    assert.ok(r);
    assert.equal(r.deletedAssetId, a.id);
    assert.equal(r.technicalReason, 'corrupted_file_redownload_needed');
    assert.equal(store.getAsset(a.id), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('hardDeleteAsset: journalrelevant + VERIFIED -> kastar 409, måste använda softDelete', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'VERIFIED_IN_CCO', {
      isJournalRelevant: true,
    });
    await assert.rejects(
      () =>
        store.hardDeleteAsset(a.id, {
          technicalReason: 'whatever',
          actor: { userId: 'admin' },
        }),
      /journalrelevant|softDeleteAsset/
    );
    // Asset ska fortfarande finnas kvar
    assert.ok(store.getAsset(a.id));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('hardDeleteAsset: saknad technicalReason / actor -> 400', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({ ...BASE_ASSET, isJournalRelevant: false });
    await assert.rejects(
      () => store.hardDeleteAsset(a.id, { actor: { userId: 'u' } }),
      /technicalReason/
    );
    await assert.rejects(
      () => store.hardDeleteAsset(a.id, { technicalReason: 'x' }),
      /actor\.userId/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('hardDeleteAsset: emittar asset.hard_deleted audit med fullt detail-record', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
    });
    await store.hardDeleteAsset(a.id, {
      technicalReason: 'duplicate_test_record',
      actor: { userId: 'admin-2', role: 'admin' },
    });
    const ev = audit.events.find((e) => e.action === 'asset.hard_deleted');
    assert.ok(ev);
    assert.equal(ev.detail.technicalReason, 'duplicate_test_record');
    assert.equal(ev.detail.previousStatus, 'DISCOVERED');
    assert.equal(typeof ev.detail.deletedAt, 'string');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING #2 — audit-actions (soft_deleted, hard_deleted med snapshot)
// -----------------------------------------------------------------------------

test('OS#2: softDeleteAsset emittar dedikerat asset.soft_deleted med previousStatus/newStatus/reason', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await buildAssetAtStatus(store, 'NEEDS_REVIEW');
    await store.softDeleteAsset(a.id, {
      reason: 'staff_reject_invalid_file',
      actor: { userId: 'staff-2', role: 'staff' },
      target: 'REJECTED',
    });
    const ev = audit.events.find((e) => e.action === 'asset.soft_deleted');
    assert.ok(ev, 'asset.soft_deleted audit saknas');
    assert.equal(ev.detail.previousStatus, 'NEEDS_REVIEW');
    assert.equal(ev.detail.newStatus, 'REJECTED');
    assert.equal(ev.detail.reason, 'staff_reject_invalid_file');
    assert.equal(ev.detail.target, 'REJECTED');
    // Dessutom: status_changed-event ska också finnas
    assert.ok(
      audit.events.some((e) => e.action === 'asset.status_changed' && e.detail.to === 'REJECTED')
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#2: hardDeleteAsset emittar asset.hard_deleted med fullAssetSnapshot', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
    });
    await store.hardDeleteAsset(a.id, {
      technicalReason: 'corrupt_metadata_re_import_planned',
      actor: { userId: 'admin-9', role: 'admin' },
    });
    const ev = audit.events.find((e) => e.action === 'asset.hard_deleted');
    assert.ok(ev);
    assert.ok(ev.detail.fullAssetSnapshot, 'fullAssetSnapshot saknas');
    assert.equal(ev.detail.fullAssetSnapshot.id, a.id);
    assert.equal(ev.detail.fullAssetSnapshot.patientId, BASE_ASSET.patientId);
    assert.equal(ev.detail.fullAssetSnapshot.sourceSystem, BASE_ASSET.sourceSystem);
    assert.equal(ev.detail.fullAssetSnapshot.storageKey, BASE_ASSET.storageKey);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#2: hardDeleteAsset KASTAR om auditLog saknas', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-asset-store-noaudit-'));
  try {
    const filePath = path.join(tmp, 'cco-patient-assets.json');
    // INGEN auditLog
    const store = await createCcoPatientAssetStore({ filePath });
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
    });
    await assert.rejects(
      () =>
        store.hardDeleteAsset(a.id, {
          technicalReason: 'tekniskt_fel',
          actor: { userId: 'admin' },
        }),
      /auditLog krävs/
    );
    // Asset ska fortfarande finnas
    assert.ok(store.getAsset(a.id));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING P0.B++++ — hardDelete audit PII-mask
// -----------------------------------------------------------------------------

test('P0.B++++: hardDeleteAsset audit payload innehåller hashad originalFileName, inte rå', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
      // Lägg ett filnamn som ÄR PII-känsligt (skulle kunna innehålla pnr/namn)
      originalFileName: 'pat-firstname-lastname-19000101-1234.pdf',
    });
    await store.hardDeleteAsset(a.id, {
      technicalReason: 'pii_mask_test',
      actor: { userId: 'admin-pii', role: 'admin' },
    });
    const ev = audit.events.find((e) => e.action === 'asset.hard_deleted');
    assert.ok(ev, 'asset.hard_deleted saknas');
    const snap = ev.detail.fullAssetSnapshot;
    assert.ok(snap, 'fullAssetSnapshot saknas');
    // Rå originalFileName får INTE finnas i snapshot
    assert.equal(snap.originalFileName, undefined, 'rå originalFileName läckte in i audit-payload');
    // Hash-fältet ska finnas, prefix 'sha256:', 16 hex-tecken
    assert.ok(
      typeof snap.originalFileName_hash === 'string' &&
        /^sha256:[0-9a-f]{16}$/.test(snap.originalFileName_hash),
      `förväntade sha256:<16 hex> men fick ${snap.originalFileName_hash}`
    );
    // Hashen är inte själva filnamnet
    assert.ok(
      !snap.originalFileName_hash.includes('19000101'),
      'hash får inte innehålla pnr-fragment'
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('P0.B++++: hardDeleteAsset audit payload innehåller struktur-hashad originalDrivePath, inte rå', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
      // 4-segments path där varje segment KAN innehålla PII
      originalDrivePath: '/Hair TP/Patient Firstname Lastname/2026/journal.pdf',
    });
    await store.hardDeleteAsset(a.id, {
      technicalReason: 'pii_mask_path_test',
      actor: { userId: 'admin-pii', role: 'admin' },
    });
    const ev = audit.events.find((e) => e.action === 'asset.hard_deleted');
    const snap = ev.detail.fullAssetSnapshot;
    // Rå path får INTE finnas
    assert.equal(
      snap.originalDrivePath,
      undefined,
      'rå originalDrivePath läckte in i audit-payload'
    );
    // Struktur-hash ska finnas
    assert.ok(
      typeof snap.originalDrivePath_structure === 'string',
      'originalDrivePath_structure saknas'
    );
    assert.equal(snap.originalDrivePath_depth, 4, 'fel depth — förväntade 4 segment');
    // Strukturformat: seg-<hash8>/seg-<hash8>/seg-<hash8>/seg-<hash8>
    assert.match(
      snap.originalDrivePath_structure,
      /^seg-[0-9a-f]{8}\/seg-[0-9a-f]{8}\/seg-[0-9a-f]{8}\/seg-[0-9a-f]{8}$/,
      `oväntat strukturformat: ${snap.originalDrivePath_structure}`
    );
    // Säkert: inga rå PII-fragment
    assert.ok(
      !snap.originalDrivePath_structure.toLowerCase().includes('firstname'),
      'rå patient-namn läckte in i path-struktur'
    );
    assert.ok(
      !snap.originalDrivePath_structure.toLowerCase().includes('lastname'),
      'rå patient-namn läckte in i path-struktur'
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('P0.B++++: hardDeleteAsset audit bevarar originalDriveFileId (opaque ID, OK)', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      isJournalRelevant: false,
      category: 'other',
      originalDriveFileId: 'drv-opaque-id-abc123XYZ',
    });
    await store.hardDeleteAsset(a.id, {
      technicalReason: 'drive_id_preservation_test',
      actor: { userId: 'admin-pii', role: 'admin' },
    });
    const ev = audit.events.find((e) => e.action === 'asset.hard_deleted');
    const snap = ev.detail.fullAssetSnapshot;
    // Drive-file-id är opaque och bevaras
    assert.equal(snap.originalDriveFileId, 'drv-opaque-id-abc123XYZ');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('P0.B++++: maskPiiInAuditPayload är pure (returnerar ny objekt, muterar inte input)', async () => {
  const { maskPiiInAuditPayload: mask } = require('../../src/ops/ccoPatientAssetStore');
  const input = {
    id: 'a-1',
    patientId: 'p-1',
    originalFileName: 'sensitive.pdf',
    originalDrivePath: '/a/b/c',
    originalDriveFileId: 'drv-123',
  };
  const out = mask(input);
  // Input oförändrad
  assert.equal(input.originalFileName, 'sensitive.pdf');
  assert.equal(input.originalDrivePath, '/a/b/c');
  // Output korrekt maskad
  assert.equal(out.originalFileName, undefined);
  assert.equal(out.originalDrivePath, undefined);
  assert.ok(out.originalFileName_hash);
  assert.ok(out.originalDrivePath_structure);
  assert.equal(out.originalDrivePath_depth, 3);
  assert.equal(out.originalDriveFileId, 'drv-123');
  // patientId bevaras (är ett internt ID, inte direkt PII per asset-schema)
  assert.equal(out.patientId, 'p-1');
});

// -----------------------------------------------------------------------------
// stats() 9 nya counters (3)
// -----------------------------------------------------------------------------

test('stats: alla 9 nya counters returneras med 0 på tom store', async () => {
  const { tmp, store } = await makeStore();
  try {
    const s = store.stats();
    assert.equal(s.total, 0);
    assert.equal(s.linkOnlyBlockerCount, 0);
    assert.equal(s.visibleOnPatientCardCount, 0);
    assert.equal(s.verifiedButNotVisibleCount, 0);
    assert.equal(s.importedButNotVerifiedCount, 0);
    assert.equal(s.needsReviewCount, 0);
    assert.equal(s.failedImportCount, 0);
    assert.equal(s.assetsWithoutChecksumCount, 0);
    assert.equal(s.assetsWithoutStorageKeyCount, 0);
    assert.equal(s.assetsWithoutPatientIdCount, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stats: blandning av statusar räknas korrekt över alla 9 counters', async () => {
  // OWNER-SKÄRPNING #5: BASE_ASSET har originalDriveFileId='abc123'. Asset utan
  // checksum + Drive-provenance räknas som linkOnlyBlocker oavsett status-fält.
  // Av de 6 assets nedan har bara VISIBLE och VERIFIED checksum (satt via
  // recordChecksumVerified i buildAssetAtStatus). IMPORTED_TO_CCO,
  // NEEDS_REVIEW, FAILED_IMPORT och LINK_ONLY_BLOCKER saknar checksum → 4 blockers.
  const { tmp, store } = await makeStore();
  try {
    // 1: VISIBLE
    await buildAssetAtStatus(store, 'VISIBLE_ON_PATIENT_CARD');
    // 1: VERIFIED (not visible)
    await buildAssetAtStatus(store, 'VERIFIED_IN_CCO');
    // 1: IMPORTED_TO_CCO (not verified)
    await buildAssetAtStatus(store, 'IMPORTED_TO_CCO');
    // 1: NEEDS_REVIEW
    await buildAssetAtStatus(store, 'NEEDS_REVIEW');
    // 1: FAILED_IMPORT
    await buildAssetAtStatus(store, 'FAILED_IMPORT');
    // 1: LINK_ONLY_BLOCKER
    await buildAssetAtStatus(store, 'LINK_ONLY_BLOCKER');

    const s = store.stats();
    assert.equal(s.total, 6);
    assert.equal(s.visibleOnPatientCardCount, 1);
    assert.equal(s.verifiedButNotVisibleCount, 1);
    assert.equal(s.importedButNotVerifiedCount, 1);
    assert.equal(s.needsReviewCount, 1);
    assert.equal(s.failedImportCount, 1);
    // OWNER-SKÄRPNING #5: blocker-criterion (Drive-provenance + saknad binär)
    // räknar både den explicit LINK_ONLY_BLOCKER + alla utan checksum med Drive-id
    assert.equal(
      s.linkOnlyBlockerCount,
      4,
      'IMPORTED_TO_CCO, NEEDS_REVIEW, FAILED_IMPORT, LINK_ONLY_BLOCKER har Drive-id + saknad checksum'
    );
    assert.ok(s.assetsWithoutChecksumCount >= 1);
    assert.equal(s.assetsWithoutStorageKeyCount, 0); // BASE_ASSET sätter storageKey för alla
    assert.equal(s.assetsWithoutPatientIdCount, 0); // BASE_ASSET sätter patientId
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING #3 — cutoverReadiness-block i stats()
// -----------------------------------------------------------------------------

test('OS#3: stats.cutoverReadiness är ALDRIG ready på tom store (empty_store)', async () => {
  const { tmp, store } = await makeStore();
  try {
    const s = store.stats();
    assert.ok(s.cutoverReadiness);
    assert.equal(s.cutoverReadiness.ready, false);
    assert.equal(s.cutoverReadiness.reason, 'empty_store');
    assert.match(s.cutoverReadiness.message, /Tom store|aldrig körts/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#3: cutoverReadiness reason=link_only_blockers_remain om LINK_ONLY_BLOCKER finns', async () => {
  const { tmp, store } = await makeStore();
  try {
    await buildAssetAtStatus(store, 'LINK_ONLY_BLOCKER');
    const s = store.stats();
    assert.equal(s.cutoverReadiness.ready, false);
    assert.equal(s.cutoverReadiness.reason, 'link_only_blockers_remain');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#3: cutoverReadiness ready=true med all_imported_and_verified när alla checks passerar', async () => {
  const { tmp, store } = await makeStore();
  try {
    // 1 asset hela vägen till VISIBLE_ON_PATIENT_CARD
    await buildAssetAtStatus(store, 'VISIBLE_ON_PATIENT_CARD');
    const s = store.stats();
    assert.equal(s.cutoverReadiness.ready, true);
    assert.equal(s.cutoverReadiness.reason, 'all_imported_and_verified');
    assert.match(s.cutoverReadiness.message, /Cutover-ready/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING #5 — Drive-provenance + saknad binär = LINK_ONLY_BLOCKER
// -----------------------------------------------------------------------------

test('OS#5: asset i DISCOVERED med originalDriveFileId men saknad storageKey räknas som LINK_ONLY_BLOCKER i stats', async () => {
  const { tmp, store } = await makeStore();
  try {
    // Skapa asset DISCOVERED men nolla storageKey efter (med Drive-provenance)
    const a = await store.addAsset({
      ...BASE_ASSET,
      originalDriveFileId: 'drive-abc-789',
    });
    store._state().items[a.id].storageKey = null;
    store._state().items[a.id].checksum = null;
    const s = store.stats();
    // Trots status=DISCOVERED ska den räknas som blocker (har Drive-provenance + saknad binär)
    assert.equal(s.linkOnlyBlockerCount, 1, 'Drive-provenance + saknad binär ska räknas');
    // cutoverReadiness ska peka på link_only_blockers_remain
    assert.equal(s.cutoverReadiness.reason, 'link_only_blockers_remain');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#5: asset utan Drive-provenance + saknad storageKey räknas INTE som LINK_ONLY_BLOCKER', async () => {
  const { tmp, store } = await makeStore();
  try {
    // Source = cco_camera utan originalDriveFileId — räknas inte som blocker
    const a = await store.addAsset({
      ...BASE_ASSET,
      sourceSystem: 'cco_camera',
      originalDriveFileId: null,
      originalDrivePath: null,
    });
    store._state().items[a.id].storageKey = null;
    store._state().items[a.id].checksum = null;
    const s = store.stats();
    assert.equal(s.linkOnlyBlockerCount, 0, 'utan Drive-provenance: inte blocker');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#5: pipeline auto-sätter LINK_ONLY_BLOCKER om Drive-provenance + ingen body', async () => {
  // Detta testas mer detaljerat i ccoAssetImportPipeline.test.js,
  // men vi verifierar här att assetStore + stats samverkar.
  const { tmp, store } = await makeStore();
  try {
    const a = await store.addAsset({
      ...BASE_ASSET,
      originalDriveFileId: 'drive-no-body-001',
      storageKey: 'pending-no-binary', // sentinel som pipelinen sätter
      checksum: null,
      fileSize: 0,
      status: 'LINK_ONLY_BLOCKER',
    });
    const s = store.stats();
    assert.equal(s.linkOnlyBlockerCount, 1);
    assert.equal(s.byStatus.LINK_ONLY_BLOCKER, 1);
    assert.equal(
      s.assetsWithoutStorageKeyCount,
      1,
      'pending-no-binary räknas som "utan storageKey"'
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stats: assetsWithoutPatientIdCount exkluderar REJECTED', async () => {
  const { tmp, store } = await makeStore();
  try {
    // 1 asset i REJECTED med tom patientId
    const a = await buildAssetAtStatus(store, 'REJECTED');
    store._state().items[a.id].patientId = '';
    // 1 asset i NEEDS_REVIEW med tom patientId — räknas
    const b = await buildAssetAtStatus(store, 'NEEDS_REVIEW');
    store._state().items[b.id].patientId = '';

    const s = store.stats();
    assert.equal(s.assetsWithoutPatientIdCount, 1, 'REJECTED ska exkluderas');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
