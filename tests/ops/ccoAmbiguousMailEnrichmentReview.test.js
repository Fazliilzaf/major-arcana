'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoAmbiguousMailEnrichmentReviewStore,
  REVIEW_ACTIONS,
} = require('../../src/ops/ccoAmbiguousMailEnrichmentReviewStore');
const {
  scoreDeterministicCandidateMatch,
  buildCandidateId,
  MIN_APPROVE_MATCH_FIELDS,
} = require('../../src/ops/ccoAmbiguousMailEnrichmentReviewService');
const {
  applySingleApprovedGraphMessageIdRepair,
} = require('../../src/ops/ccoGraphMessageIdRepairApply');
const {
  isConversationRepaired,
  recordRepairBatch,
  loadRepairRegistry,
} = require('../../src/ops/ccoGraphMessageIdRepairRegistry');

test('review store records all decision actions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ambiguous-review-'));
  const store = await createCcoAmbiguousMailEnrichmentReviewStore({
    stateRoot: dir,
    tenantId: 'hair-tp-clinic',
  });

  for (const action of REVIEW_ACTIONS) {
    const input = {
      conversationKey: `box@demo.se:conv-${action}`,
      action,
      reviewer: 'owner@test.se',
      candidateId:
        action === 'approve_single_match' || action === 'reject_candidate' ? 'cand-1' : null,
      reason: action === 'exclude_non_actionable' ? 'system outbound noise' : null,
      matchedFields: ['mailbox', 'conversationId', 'subjectHash'],
    };
    const saved = await store.recordDecision(input);
    assert.equal(saved.action, action);
  }

  const stats = store.stats();
  assert.equal(stats.totalDecisions, REVIEW_ACTIONS.length);
});

test('exclude_non_actionable requires reason', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ambiguous-review-'));
  const store = await createCcoAmbiguousMailEnrichmentReviewStore({
    stateRoot: dir,
    tenantId: 'hair-tp-clinic',
  });
  await assert.rejects(
    () =>
      store.recordDecision({
        conversationKey: 'box@demo.se:conv-x',
        action: 'exclude_non_actionable',
        reviewer: 'owner@test.se',
      }),
    /reason krävs/
  );
});

test('scoreDeterministicCandidateMatch requires three fields for approve', () => {
  const gapRow = {
    conversationKey: 'contact@hairtpclinic.com:conv-abc',
    mailboxId: 'contact@hairtpclinic.com',
    subjectToken: 'hdeadbeef1234567',
    latestDate: '2026-05-01T10:00:00.000Z',
    direction: 'inbound',
    ingestionMatched: true,
    internetMessageIdHashes: new Set(['abc123']),
    truthFromHashes: new Set(['fromhash1']),
  };

  const weak = scoreDeterministicCandidateMatch(gapRow, {
    mailboxId: 'contact@hairtpclinic.com',
    conversationId: 'conv-abc',
  });
  assert.equal(weak.approvable, false);
  assert.equal(weak.matchCount, 2);

  const strong = scoreDeterministicCandidateMatch(gapRow, {
    mailboxId: 'contact@hairtpclinic.com',
    conversationId: 'conv-abc',
    subjectHash: 'deadbeef1234567',
    receivedAt: '2026-05-01T10:05:00.000Z',
    internetMessageId: '<msg@example.com>',
    fromHash: 'fromhash1',
  });
  assert.ok(strong.matchCount >= MIN_APPROVE_MATCH_FIELDS);
  assert.equal(strong.approvable, true);
});

test('buildCandidateId is stable for same fingerprint', () => {
  const candidate = {
    mailboxId: 'contact@hairtpclinic.com',
    conversationId: 'conv-1',
    internetMessageId: '<a@b.c>',
    subjectHash: 'abc',
    receivedAt: '2026-05-01',
    fromHash: 'fh',
    toHash: 'th',
  };
  assert.equal(buildCandidateId(candidate), buildCandidateId({ ...candidate }));
});

test('applySingleApprovedGraphMessageIdRepair is idempotent via registry', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ambiguous-apply-'));
  const tenantId = 'hair-tp-clinic';
  const conversationKey = 'box@demo.se:conv-1';
  const candidate = {
    source: 'ingestion_ledger',
    graphMessageId: 'graph-123',
    rawMessageId: 'raw-1',
    mailboxId: 'box@demo.se',
    conversationId: 'conv-1',
  };

  const truthStore = {
    async recordFolderPage() {
      return { ok: true };
    },
  };
  const ingestionStore = {
    getRawMessage() {
      return {
        id: 'raw-1',
        mailboxId: 'box@demo.se',
        conversationId: 'conv-1',
        graphMessageId: 'graph-123',
        folderType: 'inbox',
        subject: 'Hej',
      };
    },
    getLedgerByRawMessageId() {
      return { rawMessageId: 'raw-1' };
    },
  };

  await recordRepairBatch({
    stateRoot: dir,
    tenantId,
    runId: 'pre',
    records: [{ conversationKey, newGraphMessageId: 'graph-123', repairSource: 'test' }],
  });

  const registry = await loadRepairRegistry({ stateRoot: dir, tenantId });
  assert.equal(isConversationRepaired(registry, conversationKey, 'graph-123'), true);

  const result = await applySingleApprovedGraphMessageIdRepair({
    truthStore,
    ingestionStore,
    conversationKey,
    candidate,
    stateRoot: dir,
    tenantId,
    runId: 'retry',
  });
  assert.equal(result.outcome, 'already_repaired');
  assert.equal(result.skipped, true);
});
