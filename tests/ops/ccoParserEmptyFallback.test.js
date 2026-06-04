'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyParserEmptyPolicy,
  buildFallbackEnrichmentRow,
} = require('../../src/ops/ccoParserEmptyFallback');
const { hasCcoEnrichmentSignals } = require('../../src/ops/ccoInboxEnrichmentCoverage');

test('classifyParserEmptyPolicy marks inbound unanswered as true_unanswered_candidate', () => {
  const result = classifyParserEmptyPolicy({
    gapRow: {
      conversationKey: 'contact@hairtpclinic.com:abc',
      direction: 'inbound',
      graphMessageIdPresent: true,
      snapshotViable: true,
      customerIdPresent: true,
      messageClassification: 'actionable',
      enrichmentRowPresent: true,
      enrichmentSignalsPresent: false,
    },
    truthRow: {
      lastInboundAt: '2026-06-01T10:00:00.000Z',
      lastOutboundAt: '2026-05-31T10:00:00.000Z',
    },
    operatorState: null,
  });
  assert.equal(result.policy, 'true_unanswered_candidate');
  assert.equal(result.applyAction, 'fallback_enrich');
  assert.equal(result.canFallbackSetNeedsAction, true);
});

test('classifyParserEmptyPolicy marks outbound as non_actionable_outbound', () => {
  const result = classifyParserEmptyPolicy({
    gapRow: {
      conversationKey: 'contact@hairtpclinic.com:abc',
      direction: 'outbound',
      graphMessageIdPresent: true,
      snapshotViable: true,
      customerIdPresent: true,
    },
    truthRow: {},
    operatorState: null,
  });
  assert.equal(result.policy, 'non_actionable_outbound');
  assert.equal(result.applyAction, 'fallback_enrich');
});

test('classifyParserEmptyPolicy leaves uncertain rows unresolved', () => {
  const result = classifyParserEmptyPolicy({
    gapRow: {
      conversationKey: 'contact@hairtpclinic.com:abc',
      direction: 'inbound',
      graphMessageIdPresent: true,
      snapshotViable: true,
      customerIdPresent: false,
      customerEmailPresent: false,
    },
    truthRow: {},
    operatorState: { actionState: 'handled' },
  });
  assert.equal(result.policy, 'unresolved_review');
  assert.equal(result.applyAction, 'leave_unresolved');
});

test('buildFallbackEnrichmentRow produces enrichment signals', () => {
  const row = buildFallbackEnrichmentRow({
    gapRow: {
      conversationKey: 'contact@hairtpclinic.com:abc',
      customerIdPresent: true,
      subjectToken: 'abc123',
    },
    truthRow: { subject: 'Hej' },
    policyRow: {
      policy: 'true_unanswered_candidate',
      fallbackSignals: {
        intent: 'follow_up',
        workflowLane: 'action_now',
        needsReplyStatus: 'needs_reply',
        messageClassification: 'actionable',
        recommendedAction: 'Review',
        priorityLevel: 'Medium',
      },
    },
  });
  assert.equal(hasCcoEnrichmentSignals(row), true);
});
