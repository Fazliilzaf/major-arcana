const test = require('node:test');
const assert = require('node:assert/strict');

const { categorizeGap } = require('../../src/ops/ccoInboxEnrichmentGapAnalysis');

test('categorizeGap flags system scrap for exclusion', () => {
  const result = categorizeGap({
    truthRow: {
      conversationKey: 'contact@hairtpclinic.com:conv-system',
      mailboxId: 'contact@hairtpclinic.com',
      subject: 'Microsoft 365 newsletter',
      latestPreview: 'unsubscribe from campaign',
      customerEmail: 'noreply@vendor.com',
      messageClassification: 'system_mail',
      lastInboundAt: '2026-01-01T00:00:00.000Z',
    },
    messageGroup: {
      graphMessageIdCount: 1,
      bodyPreviewCount: 1,
      subjectCount: 1,
      deletedOnly: false,
    },
    enrichmentRow: null,
    ingestionMatch: null,
    supportedMailboxIds: new Set(['contact@hairtpclinic.com']),
    duplicateIndex: new Set(),
    snapshotProbe: { ok: true, conversationCount: 1, messageCount: 1 },
  });
  assert.equal(result.primaryBucket, 'system_scrap_should_exclude');
  assert.equal(result.shouldExcludeFromThreshold, true);
  assert.equal(result.canFallbackEnrich, false);
});

test('categorizeGap marks parser-empty rows as fallback candidates', () => {
  const result = categorizeGap({
    truthRow: {
      conversationKey: 'contact@hairtpclinic.com:conv-human',
      mailboxId: 'contact@hairtpclinic.com',
      subject: 'Fråga om konsultation',
      latestPreview: 'Hej, jag vill boka tid?',
      customerEmail: 'patient@example.com',
      customerIdentity: { customerId: 'cust-1' },
      lastInboundAt: '2026-05-01T00:00:00.000Z',
    },
    messageGroup: {
      graphMessageIdCount: 1,
      bodyPreviewCount: 1,
      subjectCount: 1,
      deletedOnly: false,
    },
    enrichmentRow: { conversationId: 'conv-human', intent: 'unknown' },
    ingestionMatch: { matchedCount: 1 },
    supportedMailboxIds: new Set(['contact@hairtpclinic.com']),
    duplicateIndex: new Set(),
    snapshotProbe: { ok: true, conversationCount: 1, messageCount: 2 },
  });
  assert.equal(result.primaryBucket, 'enrichment_parser_empty');
  assert.equal(result.canFallbackEnrich, true);
});
