const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEnrichmentRowConversationKey,
  hasCcoEnrichmentSignals,
  computeCcoInboxEnrichmentCoverage,
} = require('../../src/ops/ccoInboxEnrichmentCoverage');

test('hasCcoEnrichmentSignals detects intent and workflowLane', () => {
  assert.equal(hasCcoEnrichmentSignals({ intent: 'consultation' }), true);
  assert.equal(hasCcoEnrichmentSignals({ workflowLane: 'action_now' }), true);
  assert.equal(hasCcoEnrichmentSignals({ intent: 'unknown' }), false);
  assert.equal(hasCcoEnrichmentSignals({}), false);
});

test('computeCcoInboxEnrichmentCoverage reports gap for truth rows without enrichment', async () => {
  const mailboxId = 'contact@hairtpclinic.com';
  const truthStore = {
    listMessages() {
      return [
        {
          mailboxId,
          mailboxAddress: mailboxId,
          conversationId: 'AAQkEnriched',
          mailboxConversationId: 'AAQkEnriched',
          folderType: 'inbox',
          direction: 'inbound',
          isRead: false,
          receivedAt: new Date().toISOString(),
          subject: 'Enriched thread',
        },
        {
          mailboxId,
          mailboxAddress: mailboxId,
          conversationId: 'AAQkMissing',
          mailboxConversationId: 'AAQkMissing',
          folderType: 'inbox',
          direction: 'inbound',
          isRead: false,
          receivedAt: new Date().toISOString(),
          subject: 'Missing enrichment',
        },
      ];
    },
  };

  const capabilityAnalysisStore = {
    async list() {
      return [
        {
          id: 'entry-1',
          ts: '2026-05-20T12:00:00.000Z',
          capabilityName: 'AnalyzeInbox',
          input: { mailboxIds: [mailboxId] },
          output: {
            data: {
              generatedAt: '2026-05-20T12:00:00.000Z',
              conversationWorklist: [
                {
                  conversationId: 'AAQkEnriched',
                  mailboxId,
                  intent: 'consultation',
                  workflowLane: 'action_now',
                },
              ],
              needsReplyToday: [],
            },
          },
        },
      ];
    },
  };

  const coverage = await computeCcoInboxEnrichmentCoverage({
    tenantId: 'hair-tp-clinic',
    mailboxIds: [mailboxId],
    capabilityAnalysisStore,
    ccoMailboxTruthStore: truthStore,
    customerState: null,
  });

  assert.equal(coverage.truthConversationCount, 2);
  assert.equal(coverage.enrichedConversationCount, 1);
  assert.equal(coverage.gapCount, 1);
  assert.equal(coverage.coveragePercent, 50);
  assert.equal(coverage.readyForWork, false);
  assert.ok(coverage.gapConversationIds.includes('AAQkMissing'));
  assert.equal(
    buildEnrichmentRowConversationKey({
      conversationId: 'AAQkEnriched',
      mailboxId,
    }).includes('AAQkEnriched'),
    true
  );
});
