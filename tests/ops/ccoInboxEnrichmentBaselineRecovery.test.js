'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  recoverCcoInboxEnrichmentBaseline,
} = require('../../src/ops/ccoInboxEnrichmentBaselineRecovery');
const {
  loadCcoInboxEnrichmentCheckpoint,
} = require('../../src/ops/ccoInboxEnrichmentCheckpoint');

const mailboxId = 'contact@hairtpclinic.com';

function row(id, intent = 'follow_up') {
  return {
    conversationId: id,
    conversationKey: `${mailboxId}:${id}`,
    mailboxId,
    intent,
    workflowLane: 'action_now',
  };
}

function entry(id, rows, ts = '2026-07-13T10:00:00.000Z') {
  return {
    id,
    ts,
    tenantId: 'hair-tp-clinic',
    capability: { name: 'AnalyzeInbox' },
    input: { mailboxIds: [mailboxId] },
    output: {
      data: {
        generatedAt: ts,
        conversationEnrichment: rows,
        conversationWorklist: [],
        needsReplyToday: [],
      },
    },
  };
}

test('verified recovery selects current-truth overlap, merges live delta and publishes checkpoint', async () => {
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-baseline-recovery-'));
  const backupRoot = path.join(stateRoot, 'backups');
  const label = 'pre-enrichment-backfill-2026-07-13';
  const backupPath = path.join(backupRoot, label);
  await fs.mkdir(backupPath, { recursive: true });
  await fs.writeFile(
    path.join(backupPath, 'capability-analysis.json'),
    `${JSON.stringify({
      entries: [
        entry('stale-large', [row('stale-a'), row('stale-b'), row('stale-c')]),
        entry('current-overlap', [row('one'), row('two')], '2026-07-13T09:00:00.000Z'),
      ],
    })}\n`,
    'utf8'
  );

  const liveEntries = [entry('live-delta', [row('three', 'complaint')])];
  const appended = [];
  const capabilityAnalysisStore = {
    async list({ capabilityName }) {
      return capabilityName === 'AnalyzeInbox' ? liveEntries : [];
    },
    async append(value) {
      const saved = { ...value, id: 'published-recovery', ts: '2026-07-14T12:00:00.000Z' };
      appended.push(saved);
      return saved;
    },
  };
  const truthStore = {
    loadedMailboxIds: [],
    async ensureMailboxLoaded(requestedMailboxId) {
      this.loadedMailboxIds.push(requestedMailboxId);
    },
    listMessages({ mailboxIds }) {
      assert.deepEqual(mailboxIds, [mailboxId]);
      return ['one', 'two', 'three'].map((id) => ({
        mailboxId,
        mailboxAddress: mailboxId,
        conversationId: id,
        mailboxConversationId: id,
        conversationKey: `${mailboxId}:${id}`,
        folderType: 'inbox',
        direction: 'inbound',
        isRead: false,
        receivedAt: '2026-07-14T10:00:00.000Z',
        subject: id,
      }));
    },
  };

  const preview = await recoverCcoInboxEnrichmentBaseline({
    tenantId: 'hair-tp-clinic',
    mailboxIds: [mailboxId],
    stateRoot,
    backupDir: backupRoot,
    capabilityAnalysisStorePath: path.join(stateRoot, 'capability-analysis.json'),
    capabilityAnalysisStore,
    ccoMailboxTruthStore: truthStore,
    label,
    dryRun: true,
  });
  assert.equal(preview.selectedEntryId, 'current-overlap');
  assert.equal(preview.current.enrichedConversationCount, 1);
  assert.equal(preview.merged.enrichedConversationCount, 3);
  assert.deepEqual(truthStore.loadedMailboxIds, [mailboxId]);
  assert.equal(appended.length, 0);

  const committed = await recoverCcoInboxEnrichmentBaseline({
    tenantId: 'hair-tp-clinic',
    mailboxIds: [mailboxId],
    stateRoot,
    backupDir: backupRoot,
    capabilityAnalysisStorePath: path.join(stateRoot, 'capability-analysis.json'),
    capabilityAnalysisStore,
    ccoMailboxTruthStore: truthStore,
    label,
    actorUserId: 'owner-1',
    dryRun: false,
  });
  assert.equal(committed.publishedEntryId, 'published-recovery');
  assert.equal(appended.length, 1);
  assert.deepEqual(truthStore.loadedMailboxIds, [mailboxId, mailboxId]);

  const checkpoint = await loadCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(checkpoint.ok, true);
  assert.equal(checkpoint.enrichedRowCount, 3);
  assert.equal(checkpoint.metadata.phase, 'published_baseline');

  await fs.rm(stateRoot, { recursive: true, force: true });
});
