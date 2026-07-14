const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  saveCcoInboxEnrichmentCheckpoint,
  loadCcoInboxEnrichmentCheckpoint,
  clearCcoInboxEnrichmentCheckpoint,
  countEnrichedRows,
} = require('../../src/ops/ccoInboxEnrichmentCheckpoint');
const {
  resolvePublishedWorklistEnrichmentBaseline,
} = require('../../src/routes/capabilities');

test('checkpoint save/load roundtrip preserves enrichment rows', async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-checkpoint-'));
  const outputData = {
    generatedAt: '2026-06-01T00:00:00.000Z',
    conversationWorklist: [
      { conversationId: 'AAQkOne', intent: 'consultation', workflowLane: 'action_now' },
    ],
    needsReplyToday: [],
  };

  const saved = await saveCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
    outputData,
    metadata: { batchCount: 3 },
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.enrichedRowCount, 1);

  const loaded = await loadCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.enrichedRowCount, 1);
  assert.equal(loaded.outputData.conversationWorklist[0].conversationId, 'AAQkOne');
  assert.equal(countEnrichedRows(loaded.outputData), 1);

  const cleared = await clearCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(cleared.ok, true);

  const missing = await loadCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'checkpoint_missing');
});

test('checkpoint counts unique conversations across enrichment and worklist views', () => {
  const row = {
    conversationId: 'AAQkShared',
    intent: 'booking_request',
    workflowLane: 'booking',
  };
  assert.equal(
    countEnrichedRows({
      conversationEnrichment: [row, { ...row }],
      conversationWorklist: [row],
      needsReplyToday: [row],
    }),
    1
  );
});

test('consumer baseline prefers a larger published checkpoint over a smaller store entry', async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-published-baseline-'));
  const outputData = {
    conversationEnrichment: [
      { conversationId: 'one', intent: 'booking_request' },
      { conversationId: 'two', intent: 'complaint' },
    ],
  };
  await saveCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
    outputData,
    metadata: { phase: 'published_baseline', mailboxIds: ['kons@hairtpclinic.com'] },
  });

  const selected = await resolvePublishedWorklistEnrichmentBaseline({
    baseline: {
      latestObservedEntry: { id: 'small-store-entry' },
      selection: { selectedEnrichedRowCount: 1 },
    },
    stateRoot,
    tenantId: 'hair-tp-clinic',
  });

  assert.equal(selected.selection.strategy, 'published_checkpoint');
  assert.equal(selected.selection.selectedEnrichedRowCount, 2);
  assert.equal(selected.selectedConversationEnrichment.length, 2);
  await fs.rm(stateRoot, { recursive: true, force: true });
});
