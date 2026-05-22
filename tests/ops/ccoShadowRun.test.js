const test = require('node:test');
const assert = require('node:assert/strict');

const { buildShadowRunOutput, summarizeShadowReview } = require('../../src/ops/ccoShadowRun');

test('buildShadowRunOutput merges worklist with conversation snapshot', () => {
  const out = buildShadowRunOutput({
    analyzeResult: {
      data: {
        conversationWorklist: [
          {
            conversationId: 'conv-1',
            mailboxId: 'Clinic@Demo.SE',
            subject: 'Row subject',
            priorityLevel: 'high',
            priorityScore: 88,
            intent: 'booking',
            intentConfidence: 0.91,
            recommendedAction: 'reply_now',
            followUpSuggested: true,
            historySignals: { pattern: 'booking', summary: 'Prior bookings' },
          },
        ],
        suggestedDrafts: [{ conversationId: 'conv-1', recommendedMode: 'warm' }],
      },
    },
    systemStateSnapshot: {
      conversations: [
        {
          conversationId: 'conv-1',
          subject: 'Snapshot subject',
          mailboxId: 'clinic@demo.se',
          customerEmail: 'pat@patient.se',
          messages: [
            {
              direction: 'inbound',
              sentAt: '2026-04-01T08:00:00.000Z',
              bodyPreview: 'Hej jag vill boka tid tack',
            },
          ],
        },
      ],
    },
    mailboxIds: ['clinic@demo.se'],
    lookbackDays: 10,
    generatedAt: '2026-05-01T10:00:00.000Z',
  });

  assert.equal(out.generatedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(out.lookbackDays, 10);
  assert.deepEqual(out.mailboxIds, ['clinic@demo.se']);
  assert.equal(out.summary.recommendationCount, 1);
  assert.equal(out.summary.followUpCount, 1);
  assert.equal(out.summary.highPriorityCount, 1);
  assert.ok(out.summary.intents.includes('booking'));

  const row = out.recommendations[0];
  assert.equal(row.conversationId, 'conv-1');
  assert.equal(row.customerEmail, 'pat@patient.se');
  assert.equal(row.mailboxId, 'clinic@demo.se');
  assert.equal(row.recommendedMode, 'warm');
  assert.equal(row.historyPattern, 'booking');
  assert.match(row.latestInboundPreview || '', /boka/i);
});

test('summarizeShadowReview returns empty totals when no shadow entries', () => {
  const s = summarizeShadowReview({
    shadowEntries: [],
    actions: [],
    outcomes: [],
  });
  assert.equal(s.totals.recommendationCount, 0);
  assert.ok(Array.isArray(s.comparisons));
  assert.equal(s.comparisons.length, 0);
});

test('summarizeShadowReview detects mode override when operator picks different draft mode', () => {
  const recent = new Date().toISOString();
  const review = summarizeShadowReview({
    shadowEntries: [
      {
        ts: recent,
        output: {
          data: {
            recommendations: [
              {
                conversationId: 'c-mode',
                mailboxId: 'clinic@demo.se',
                customerEmail: 'u@example.com',
                subject: 'Q',
                intent: 'question',
                recommendedAction: 'reply',
                recommendedMode: 'short',
                generatedAt: recent,
              },
            ],
          },
        },
      },
    ],
    actions: [
      {
        conversationId: 'c-mode',
        actionType: 'reply_sent',
        recordedAt: recent,
        selectedMode: 'professional',
      },
    ],
    outcomes: [],
    mailboxIds: ['clinic@demo.se'],
    lookbackDays: 365,
  });

  assert.equal(review.totals.recommendationCount, 1);
  const cmp = review.comparisons[0];
  assert.equal(cmp.recommendedMode, 'short');
  assert.equal(cmp.selectedMode, 'professional');
  assert.equal(cmp.modeOverridden, true);
});

test('buildShadowRunOutput clamps lookbackDays to 1..30 and handles empty worklist', () => {
  const high = buildShadowRunOutput({
    analyzeResult: { data: {} },
    systemStateSnapshot: {},
    lookbackDays: 999,
  });
  assert.equal(high.lookbackDays, 30);
  assert.equal(high.summary.recommendationCount, 0);

  const low = buildShadowRunOutput({
    analyzeResult: { data: { conversationWorklist: [] } },
    lookbackDays: 0,
  });
  assert.equal(low.lookbackDays, 1);
});

test('buildShadowRunOutput clamps priorityScore and intentConfidence', () => {
  const out = buildShadowRunOutput({
    analyzeResult: {
      data: {
        conversationWorklist: [
          {
            conversationId: 'c-clamp',
            mailboxId: 'clinic@demo.se',
            subject: 'X',
            priorityScore: 500,
            intentConfidence: 9,
          },
        ],
      },
    },
    systemStateSnapshot: { conversations: [] },
  });
  const row = out.recommendations[0];
  assert.equal(row.priorityScore, 100);
  assert.equal(row.intentConfidence, 1);
});

test('summarizeShadowReview filters by intent when provided', () => {
  const ts = '2026-06-01T12:00:00.000Z';
  const entry = {
    ts,
    output: {
      data: {
        recommendations: [
          {
            conversationId: 'c-book',
            mailboxId: 'clinic@demo.se',
            subject: 'A',
            intent: 'booking',
            generatedAt: ts,
          },
          {
            conversationId: 'c-ask',
            mailboxId: 'clinic@demo.se',
            subject: 'B',
            intent: 'question',
            generatedAt: ts,
          },
        ],
      },
    },
  };
  const review = summarizeShadowReview({
    shadowEntries: [entry],
    actions: [],
    outcomes: [],
    mailboxIds: ['clinic@demo.se'],
    intent: 'booking',
  });
  assert.equal(review.totals.recommendationCount, 1);
  assert.equal(review.comparisons[0].conversationId, 'c-book');
});

test('summarizeShadowReview normalizes cco.reply.sent to reply_sent', () => {
  const ts = '2026-06-02T12:00:00.000Z';
  const review = summarizeShadowReview({
    shadowEntries: [
      {
        ts,
        output: {
          data: {
            recommendations: [
              {
                conversationId: 'c-alias',
                mailboxId: 'clinic@demo.se',
                subject: 'S',
                intent: 'question',
                generatedAt: ts,
              },
            ],
          },
        },
      },
    ],
    actions: [
      {
        conversationId: 'c-alias',
        actionType: 'cco.reply.sent',
        recordedAt: ts,
        selectedMode: 'short',
      },
    ],
    outcomes: [],
    mailboxIds: ['clinic@demo.se'],
  });
  assert.equal(review.comparisons[0].operatorActionType, 'reply_sent');
});
