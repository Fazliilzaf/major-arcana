'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildRepairRecord,
  isConversationRepaired,
  recordRepairBatch,
  loadRepairRegistry,
} = require('../../src/ops/ccoGraphMessageIdRepairRegistry');
const { categorizeGap } = require('../../src/ops/ccoInboxEnrichmentGapAnalysis');
const {
  alignTruthMessageToGapConversation,
} = require('../../src/ops/ccoGraphMessageIdRepairApply');

test('repair registry idempotency by conversation key + graph hash', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-registry-'));
  const tenantId = 'hair-tp-clinic';
  await recordRepairBatch({
    stateRoot: dir,
    tenantId,
    runId: 'run-1',
    records: [
      {
        conversationKey: 'box@demo.se:conv-1',
        newGraphMessageId: 'graph-msg-1',
        repairSource: 'ingestion_ledger',
      },
    ],
  });
  const loaded = await loadRepairRegistry({ stateRoot: dir, tenantId });
  assert.equal(isConversationRepaired(loaded, 'box@demo.se:conv-1', 'graph-msg-1'), true);
  assert.equal(isConversationRepaired(loaded, 'box@demo.se:conv-1', 'other-graph'), false);
});

test('categorizeGap treats repaired registry rows as graphMessageId present', () => {
  const row = categorizeGap({
    truthRow: { conversationKey: 'box@demo.se:conv-1', mailboxId: 'box@demo.se' },
    messageGroup: { graphMessageIdCount: 0, bodyPreviewCount: 1, subjectCount: 1 },
    supportedMailboxIds: new Set(['box@demo.se']),
    duplicateIndex: new Set(),
    graphMessageIdRepaired: true,
  });
  assert.notEqual(row.primaryBucket, 'missing_graphMessageId');
});

test('alignTruthMessageToGapConversation binds gap conversation key', () => {
  const aligned = alignTruthMessageToGapConversation(
    {
      graphMessageId: 'graph-abc',
      conversationId: 'wrong-id',
      folderType: 'inbox',
    },
    'box@demo.se:conv-target',
    'box@demo.se'
  );
  assert.equal(aligned.conversationId, 'conv-target');
  assert.equal(aligned.mailboxConversationId, 'box@demo.se:conv-target');
  assert.equal(aligned.graphMessageIdRepair.gapConversationKey, 'box@demo.se:conv-target');
});

test('buildRepairRecord stores hash not raw graph id in shape', () => {
  const record = buildRepairRecord({
    conversationKey: 'box@demo.se:conv-1',
    repairedByRunId: 'run-1',
    newGraphMessageId: 'super-secret-graph-id',
    oldGraphMessageId: null,
  });
  assert.ok(record.newGraphMessageIdHash);
  assert.notEqual(record.newGraphMessageIdHash, 'super-secret-graph-id');
  assert.equal(record.oldGraphMessageId, null);
});
