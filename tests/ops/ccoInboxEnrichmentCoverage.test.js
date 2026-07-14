const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEnrichmentRowConversationKey,
  hasCcoEnrichmentSignals,
  resolveGapConversationId,
  resolveEnrichmentRowConversationId,
  computeCcoInboxEnrichmentCoverage,
} = require('../../src/ops/ccoInboxEnrichmentCoverage');

test('hasCcoEnrichmentSignals detects intent and workflowLane', () => {
  assert.equal(hasCcoEnrichmentSignals({ intent: 'consultation' }), true);
  assert.equal(hasCcoEnrichmentSignals({ workflowLane: 'action_now' }), true);
  assert.equal(hasCcoEnrichmentSignals({ intent: 'unknown' }), false);
  assert.equal(hasCcoEnrichmentSignals({}), false);
});

test('resolveGapConversationId prefers canonical conversationKey', () => {
  const mailboxId = 'contact@hairtpclinic.com';
  const canonicalKey = `${mailboxId}:AAQkMissing`;
  assert.equal(
    resolveGapConversationId({
      mailboxId,
      conversationId: 'AAQkMissing',
      mailboxConversationId: 'AAQkMissing',
      conversationKey: canonicalKey,
    }),
    canonicalKey
  );
  assert.equal(
    resolveGapConversationId({
      mailboxId,
      conversationId: 'AAQkMissing',
      mailboxConversationId: 'AAQkMissing',
    }),
    canonicalKey
  );
});

test('resolveEnrichmentRowConversationId prefers persisted canonical key', () => {
  assert.equal(
    resolveEnrichmentRowConversationId({
      conversationKey: 'kons@hairtpclinic.com:canonical',
      mailboxId: 'kons@hairtpclinic.com',
      conversationId: 'legacy',
    }),
    'kons@hairtpclinic.com:canonical'
  );
  assert.equal(
    resolveEnrichmentRowConversationId({
      mailboxId: 'kons@hairtpclinic.com',
      conversationId: 'fallback',
    }),
    'kons@hairtpclinic.com:fallback'
  );
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
          conversationKey: `${mailboxId}:AAQkMissing`,
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
              conversationEnrichment: [
                {
                  conversationId: 'AAQkEnriched',
                  mailboxId,
                  intent: 'consultation',
                  workflowLane: 'action_now',
                },
              ],
              conversationWorklist: [],
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
  assert.ok(coverage.gapConversationIds.includes(`${mailboxId}:AAQkMissing`));
  assert.equal(
    buildEnrichmentRowConversationKey({
      conversationId: 'AAQkEnriched',
      mailboxId,
    }).includes('AAQkEnriched'),
    true
  );
});

test('computeCcoInboxEnrichmentCoverage scopes reads per mailbox and yields between chunks', async () => {
  const mailboxIds = ['kons@hairtpclinic.com', 'fazli@hairtpclinic.com'];
  const listCalls = [];
  let yieldCount = 0;
  const truthStore = {
    listMessages({ mailboxIds: requestedMailboxIds } = {}) {
      listCalls.push(requestedMailboxIds);
      const mailboxId = requestedMailboxIds[0];
      return Array.from({ length: 30 }, (_, index) => ({
        mailboxId,
        mailboxAddress: mailboxId,
        conversationId: `${mailboxId}-conversation-${index}`,
        mailboxConversationId: `${mailboxId}-conversation-${index}`,
        folderType: 'inbox',
        direction: 'inbound',
        isRead: false,
        receivedAt: new Date().toISOString(),
        subject: `Message ${index}`,
      }));
    },
  };
  const capabilityAnalysisStore = { async list() { return []; } };

  const coverage = await computeCcoInboxEnrichmentCoverage({
    tenantId: 'hair-tp-clinic',
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore: truthStore,
    customerState: null,
    eventLoopYieldEveryRows: 25,
    yieldControl: async () => {
      yieldCount += 1;
    },
  });

  assert.deepEqual(listCalls, [[mailboxIds[0]], [mailboxIds[1]]]);
  assert.equal(coverage.truthConversationCount, 60);
  assert.equal(coverage.gapCount, 60);
  assert.equal(yieldCount, 4);
});

test('coverage matches Graph enrichment to a contact-form rollup conversation key', async () => {
  const mailboxId = 'kons@hairtpclinic.com';
  const graphId = 'AAQkContactFormGraphId=';
  const truthStore = {
    listMessages() {
      return [
        {
          mailboxId,
          conversationId: `${mailboxId}:${graphId}::contact-form:patient%40example.com`,
          conversationKey: `${mailboxId}:${graphId}::contact-form:patient%40example.com`,
          folderType: 'inbox',
          direction: 'inbound',
          isRead: false,
          receivedAt: new Date().toISOString(),
          subject: 'Kontaktformulär',
        },
      ];
    },
  };
  const capabilityAnalysisStore = {
    async list() {
      return [
        {
          id: 'entry-rollup',
          ts: '2026-07-14T08:00:00.000Z',
          input: { mailboxIds: [mailboxId] },
          output: {
            data: {
              conversationEnrichment: [
                {
                  conversationId: `${mailboxId}:${graphId}`,
                  mailboxId,
                  intent: 'booking_request',
                  workflowLane: 'booking',
                },
              ],
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
  });

  assert.equal(coverage.truthConversationCount, 1);
  assert.equal(coverage.enrichedConversationCount, 1);
  assert.equal(coverage.gapCount, 0);
});
