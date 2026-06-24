const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoTemplateRegistry,
  TEMPLATE_TYPES,
  LEGAL_REVIEW_STATUSES,
} = require('../../src/ops/ccoTemplateRegistry');

async function withTempStore(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-templates-'));
  const filePath = path.join(tempDir, 'cco-templates.json');
  try {
    await fn(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('exports', () => {
  assert.equal(typeof createCcoTemplateRegistry, 'function');
  assert.ok(Array.isArray(TEMPLATE_TYPES) && TEMPLATE_TYPES.includes('message'));
  assert.ok(Array.isArray(LEGAL_REVIEW_STATUSES) && LEGAL_REVIEW_STATUSES.includes('approved'));
});

test('upsert -> get -> list', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });

    const t = await reg.upsert(
      {
        id: 'welcome-sv',
        name: 'Välkomstmeddelande',
        type: 'message',
        brand: 'hair-tp',
        journeyStep: 'consultation',
        subject: 'Välkommen',
        body: 'Hej och välkommen!',
        lang: 'sv',
      },
      { role: 'owner', userId: 'u1' }
    );

    assert.equal(t.id, 'welcome-sv');
    assert.equal(t.currentVersion, 1);
    assert.equal(t.legalReviewStatus, 'pending');
    assert.equal(t.revisions.length, 1);
    assert.equal(t.revisions[0].version, 1);
    assert.equal(t.revisions[0].body, 'Hej och välkommen!');

    const got = reg.get('welcome-sv');
    assert.equal(got.name, 'Välkomstmeddelande');
    assert.equal(reg.get('missing'), null);

    const all = reg.list();
    assert.equal(all.length, 1);

    // filters
    assert.equal(reg.list({ brand: 'hair-tp' }).length, 1);
    assert.equal(reg.list({ brand: 'other' }).length, 0);
    assert.equal(reg.list({ type: 'message' }).length, 1);
    assert.equal(reg.list({ type: 'document' }).length, 0);
    assert.equal(reg.list({ journeyStep: 'consultation' }).length, 1);
    assert.equal(reg.list({ legalReviewStatus: 'pending' }).length, 1);
    assert.equal(reg.list({ legalReviewStatus: 'approved' }).length, 0);
  });
});

test('upsert validation', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });
    await assert.rejects(() => reg.upsert({ name: 'x', body: 'y' }), /id krävs/);
    await assert.rejects(() => reg.upsert({ id: 'x', body: 'y' }), /name krävs/);
    await assert.rejects(() => reg.upsert({ id: 'x', name: 'y' }), /body krävs/);
  });
});

test('upsert again grows revisions; same body does not', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });

    await reg.upsert({ id: 'tpl', name: 'Mall', body: 'v1 body', subject: 'A' }, { role: 'owner' });

    // identical body -> no new revision
    const same = await reg.upsert(
      { id: 'tpl', name: 'Mall', body: 'v1 body', subject: 'A' },
      { role: 'owner' }
    );
    assert.equal(same.currentVersion, 1);
    assert.equal(same.revisions.length, 1);

    // changed body -> new revision
    const v2 = await reg.upsert(
      { id: 'tpl', name: 'Mall (uppd)', body: 'v2 body', subject: 'A' },
      { role: 'owner' }
    );
    assert.equal(v2.currentVersion, 2);
    assert.equal(v2.revisions.length, 2);
    assert.equal(v2.name, 'Mall (uppd)');

    const revs = reg.getRevisions('tpl');
    assert.equal(revs.length, 2);
    // sorted newest first
    assert.equal(revs[0].version, 2);
    assert.equal(revs[1].version, 1);
    assert.deepEqual(reg.getRevisions('missing'), []);
  });
});

test('setLegalReviewStatus', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });
    await reg.upsert({ id: 'tpl', name: 'Mall', body: 'b' }, { role: 'owner' });

    const approved = await reg.setLegalReviewStatus('tpl', 'approved', {
      role: 'legal',
      reviewer: 'Advokat AB',
      externalRef: 'CASE-123',
    });
    assert.equal(approved.legalReviewStatus, 'approved');
    assert.equal(approved.legalReview.reviewer, 'Advokat AB');
    assert.equal(approved.legalReview.externalRef, 'CASE-123');
    assert.equal(approved.legalReview.reviewedVersion, 1);
    assert.ok(approved.legalReview.reviewedAt);

    // new revision should invalidate approval
    const v2 = await reg.upsert({ id: 'tpl', name: 'Mall', body: 'b2' }, { role: 'owner' });
    assert.equal(v2.legalReviewStatus, 'pending');

    await assert.rejects(() => reg.setLegalReviewStatus('missing', 'approved'), /hittades inte/);
    await assert.rejects(() => reg.setLegalReviewStatus('tpl', 'bogus'), /Ogiltig status/);
  });
});

test('snapshotForSend returns a frozen immutable snapshot', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });
    await reg.upsert(
      { id: 'tpl', name: 'Mall', body: 'kropp', subject: 'Ämne', lang: 'sv' },
      { role: 'owner' }
    );
    await reg.setLegalReviewStatus('tpl', 'approved', { role: 'legal', reviewer: 'r' });

    const snap = reg.snapshotForSend('tpl', 'sv');
    assert.equal(snap.templateId, 'tpl');
    assert.equal(snap.version, 1);
    assert.equal(snap.subject, 'Ämne');
    assert.equal(snap.body, 'kropp');
    assert.equal(snap.lang, 'sv');
    assert.equal(snap.requestedLang, 'sv');
    assert.equal(snap.legalReviewStatus, 'approved');
    assert.equal(snap.legalApproved, true);
    assert.ok(snap.snapshotAt);
    assert.ok(snap.snapshotId);

    // frozen
    assert.ok(Object.isFrozen(snap));
    assert.throws(() => {
      'use strict';
      snap.body = 'tampered';
    });

    // mutating returned snapshot must not affect store state
    const again = reg.snapshotForSend('tpl');
    assert.equal(again.body, 'kropp');

    await assert.rejects(
      () => Promise.resolve().then(() => reg.snapshotForSend('missing')),
      /hittades inte/
    );
  });
});

test('stats', async () => {
  await withTempStore(async (filePath) => {
    const reg = await createCcoTemplateRegistry({ filePath });
    await reg.upsert({ id: 'm1', name: 'M1', type: 'message', body: 'a' }, { role: 'owner' });
    await reg.upsert({ id: 'm1', name: 'M1', type: 'message', body: 'a2' }, { role: 'owner' });
    await reg.upsert({ id: 'd1', name: 'D1', type: 'document', body: 'b' }, { role: 'owner' });
    await reg.setLegalReviewStatus('d1', 'approved', { role: 'legal' });

    const s = reg.stats();
    assert.equal(s.total, 2);
    assert.equal(s.totalRevisions, 3); // m1 has 2, d1 has 1
    assert.equal(s.byType.message, 1);
    assert.equal(s.byType.document, 1);
    assert.equal(s.byLegalReviewStatus.approved, 1);
    assert.equal(s.byLegalReviewStatus.pending, 1);
  });
});

test('persistence across reloads', async () => {
  await withTempStore(async (filePath) => {
    const reg1 = await createCcoTemplateRegistry({ filePath });
    await reg1.upsert({ id: 'tpl', name: 'Mall', body: 'v1' }, { role: 'owner' });
    await reg1.upsert({ id: 'tpl', name: 'Mall', body: 'v2' }, { role: 'owner' });
    await reg1.setLegalReviewStatus('tpl', 'in_review', { role: 'legal' });

    const reg2 = await createCcoTemplateRegistry({ filePath });
    const t = reg2.get('tpl');
    assert.ok(t);
    assert.equal(t.currentVersion, 2);
    assert.equal(t.revisions.length, 2);
    assert.equal(t.legalReviewStatus, 'in_review');
    assert.equal(reg2.getRevisions('tpl').length, 2);
    assert.equal(reg2.stats().total, 1);
  });
});

test('auditLog is invoked when provided', async () => {
  await withTempStore(async (filePath) => {
    const events = [];
    const auditLog = { append: (e) => events.push(e) };
    const reg = await createCcoTemplateRegistry({ filePath, auditLog });
    await reg.upsert({ id: 'tpl', name: 'Mall', body: 'a' }, { role: 'owner', userId: 'u9' });
    await reg.setLegalReviewStatus('tpl', 'approved', { role: 'legal' });

    assert.equal(events.length, 2);
    assert.equal(events[0].action, 'cco.template.create');
    assert.equal(events[0].target.id, 'tpl');
    assert.equal(events[1].action, 'cco.template.legal_review');
  });
});
