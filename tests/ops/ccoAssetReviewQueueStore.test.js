'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoAssetReviewQueueStore,
  VALID_REASONS,
  VALID_DECISIONS,
} = require('../../src/ops/ccoAssetReviewQueueStore');

function makeMemoryAuditLog() {
  const events = [];
  return { events, append: (e) => events.push(e) };
}

async function makeStore() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-asset-review-store-'));
  const filePath = path.join(tmp, 'cco-asset-review-queue.json');
  const audit = makeMemoryAuditLog();
  const store = await createCcoAssetReviewQueueStore({ filePath, auditLog: audit });
  return { tmp, filePath, audit, store };
}

test('exports canonical enums per owner-spec', () => {
  assert.deepEqual(
    [...VALID_REASONS].sort(),
    [
      'ambiguous_patient',
      'duplicate_candidate',
      'low_confidence',
      'no_patient_match',
      'unknown_format',
    ]
  );
  assert.deepEqual(
    [...VALID_DECISIONS].sort(),
    ['approve', 'mark_duplicate', 'reassign', 'reject']
  );
});

test('enqueue persists, gets UUID, and emits asset.review_enqueued', async () => {
  const { tmp, store, audit, filePath } = await makeStore();
  try {
    const item = await store.enqueue({
      assetId: 'asset-001',
      reason: 'ambiguous_patient',
      suggestedPatientId: 'pat-007',
      confidence: 'medium',
    });
    assert.ok(item.id);
    assert.equal(item.assetId, 'asset-001');
    assert.equal(item.reason, 'ambiguous_patient');
    assert.equal(item.suggestedPatientId, 'pat-007');
    assert.equal(item.decision, null);
    assert.equal(item.reviewedBy, null);

    const ev = audit.events.find((e) => e.action === 'asset.review_enqueued');
    assert.ok(ev);
    assert.equal(ev.target.kind, 'asset_review_item');
    assert.equal(ev.detail.assetId, 'asset-001');

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(Object.keys(raw.items).length, 1);
    assert.equal(raw.schemaVersion, '1.0.0');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('enqueue rejects missing assetId and invalid reason/confidence', async () => {
  const { tmp, store } = await makeStore();
  try {
    await assert.rejects(
      () => store.enqueue({ reason: 'low_confidence' }),
      /assetId/
    );
    await assert.rejects(
      () => store.enqueue({ assetId: 'a', reason: 'whatever' }),
      /invalid reason/
    );
    await assert.rejects(
      () =>
        store.enqueue({
          assetId: 'a',
          reason: 'low_confidence',
          confidence: 'tippy_top',
        }),
      /invalid confidence/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('listPending excludes resolved items and sorts newest first', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.enqueue({ assetId: 'a1', reason: 'no_patient_match' });
    await new Promise((res) => setTimeout(res, 5));
    const b = await store.enqueue({ assetId: 'a2', reason: 'duplicate_candidate' });
    await store.resolveItem(a.id, { decision: 'reject', reviewedBy: 'staff-001' });
    const pending = store.listPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, b.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('resolveItem validates decision + reviewedBy and emits asset.review_resolved', async () => {
  const { tmp, store, audit } = await makeStore();
  try {
    const item = await store.enqueue({
      assetId: 'a1',
      reason: 'duplicate_candidate',
      confidence: 'high',
    });
    const resolved = await store.resolveItem(item.id, {
      decision: 'mark_duplicate',
      reviewedBy: 'staff-002',
    });
    assert.equal(resolved.decision, 'mark_duplicate');
    assert.equal(resolved.reviewedBy, 'staff-002');
    assert.ok(resolved.reviewedAt);
    const ev = audit.events.find((e) => e.action === 'asset.review_resolved');
    assert.ok(ev);
    assert.equal(ev.detail.decision, 'mark_duplicate');

    await assert.rejects(
      () => store.resolveItem(item.id, { decision: 'approve', reviewedBy: 'x' }),
      /redan löst/
    );
    await assert.rejects(
      () => store.resolveItem('nope', { decision: 'approve', reviewedBy: 'staff' }),
      /hittades inte/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('resolveItem rejects bad decision and missing reviewedBy', async () => {
  const { tmp, store } = await makeStore();
  try {
    const item = await store.enqueue({ assetId: 'a1', reason: 'low_confidence' });
    await assert.rejects(
      () => store.resolveItem(item.id, { decision: 'tba', reviewedBy: 'staff' }),
      /invalid decision/
    );
    await assert.rejects(
      () => store.resolveItem(item.id, { decision: 'approve', reviewedBy: '' }),
      /reviewedBy/
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stats returns counts per reason + per decision + pending', async () => {
  const { tmp, store } = await makeStore();
  try {
    const a = await store.enqueue({ assetId: 'a1', reason: 'ambiguous_patient' });
    await store.enqueue({ assetId: 'a2', reason: 'duplicate_candidate' });
    await store.enqueue({ assetId: 'a3', reason: 'low_confidence' });
    await store.resolveItem(a.id, { decision: 'approve', reviewedBy: 'staff' });
    const s = store.stats();
    assert.equal(s.total, 3);
    assert.equal(s.pending, 2);
    assert.equal(s.resolved, 1);
    assert.equal(s.byReason.ambiguous_patient, 1);
    assert.equal(s.byReason.duplicate_candidate, 1);
    assert.equal(s.byReason.low_confidence, 1);
    assert.equal(s.byDecision.approve, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('persists across re-open', async () => {
  const { tmp, store, filePath } = await makeStore();
  try {
    const item = await store.enqueue({ assetId: 'a1', reason: 'unknown_format' });
    const re = await createCcoAssetReviewQueueStore({ filePath });
    assert.deepEqual(re.getItem(item.id).reason, 'unknown_format');
    assert.equal(re.listPending().length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
