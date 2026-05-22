const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateLifecycleStatus,
  toLifecycleSortRank,
  normalizeLifecycleStatus,
  resolveFollowUpWindowHours,
  LIFECYCLE_STATES,
} = require('../../src/intelligence/lifecycleEngine');

test('Lifecycle engine marks DORMANT when inactivity exceeds threshold', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 4,
    lastInteractionDate: '2026-01-01T10:00:00.000Z',
    openStatus: 'closed',
    dormantDaysThreshold: 30,
    nowMs: Date.parse('2026-03-01T10:00:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'DORMANT');
  assert.equal(result.source, 'auto');
});

test('Lifecycle engine marks ACTIVE_DIALOGUE for rapid inbound/outbound exchange', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInboundAt: '2026-03-01T12:10:00.000Z',
    lastOutboundAt: '2026-03-01T12:00:00.000Z',
    microThreadWindowMinutes: 20,
    nowMs: Date.parse('2026-03-01T12:12:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'ACTIVE_DIALOGUE');
});

test('Lifecycle engine marks AWAITING_REPLY when latest outbound is after inbound', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInboundAt: '2026-03-01T10:00:00.000Z',
    lastOutboundAt: '2026-03-01T10:08:00.000Z',
    nowMs: Date.parse('2026-03-01T11:00:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'AWAITING_REPLY');
});

test('Lifecycle engine marks FOLLOW_UP_PENDING on SLA breach', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 3,
    lastInboundAt: '2026-03-01T08:00:00.000Z',
    lastOutboundAt: null,
    slaStatus: 'breach',
    hoursSinceInbound: 7,
    intent: 'complaint',
    nowMs: Date.parse('2026-03-01T15:00:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'FOLLOW_UP_PENDING');
});

test('Lifecycle engine keeps manual override authoritative', () => {
  const result = evaluateLifecycleStatus(
    {
      interactionCount: 1,
      openStatus: true,
      lastInteractionDate: '2026-03-01T08:00:00.000Z',
    },
    { manualOverride: 'HANDLED' }
  );

  assert.equal(result.lifecycleStatus, 'HANDLED');
  assert.equal(result.source, 'manual');
});

test('Lifecycle engine marks ARCHIVED after archive threshold', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 10,
    lastInteractionDate: '2025-10-01T10:00:00.000Z',
    archiveDaysThreshold: 90,
    nowMs: Date.parse('2026-03-01T10:00:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'ARCHIVED');
});

test('Lifecycle sort rank prioritizes FOLLOW_UP_PENDING before AWAITING_REPLY', () => {
  assert.equal(toLifecycleSortRank('FOLLOW_UP_PENDING') < toLifecycleSortRank('AWAITING_REPLY'), true);
});

test('normalizeLifecycleStatus maps common CRM aliases', () => {
  assert.equal(normalizeLifecycleStatus('closed'), 'HANDLED');
  assert.equal(normalizeLifecycleStatus('ACTIVE'), 'ACTIVE_DIALOGUE');
  assert.equal(normalizeLifecycleStatus('WAITING_ON_CUSTOMER'), 'AWAITING_REPLY');
  assert.equal(normalizeLifecycleStatus('NEW_LEAD'), 'NEW');
});

test('normalizeLifecycleStatus mappar follow-up-alias och blankt till NEW', () => {
  assert.equal(normalizeLifecycleStatus('FOLLOWUP_PENDING'), 'FOLLOW_UP_PENDING');
  assert.equal(normalizeLifecycleStatus('FOLLOW_UP_SCHEDULED'), 'FOLLOW_UP_PENDING');
  assert.equal(normalizeLifecycleStatus('   '), 'NEW');
  assert.equal(normalizeLifecycleStatus('totally_unknown_label'), 'NEW');
});

test('normalizeLifecycleStatus icke-sträng normaliseras till NEW', () => {
  assert.equal(normalizeLifecycleStatus(null), 'NEW');
  assert.equal(normalizeLifecycleStatus(42), 'NEW');
});

test('toLifecycleSortRank ger lagre siffra for mer bradskande status an ARCHIVED', () => {
  assert.ok(toLifecycleSortRank('FOLLOW_UP_PENDING') < toLifecycleSortRank('NEW'));
  assert.ok(toLifecycleSortRank('NEW') < toLifecycleSortRank('ARCHIVED'));
});

test('resolveFollowUpWindowHours tack anxiety_pre_op och pricing_question', () => {
  assert.equal(resolveFollowUpWindowHours('anxiety_pre_op'), 48);
  assert.equal(resolveFollowUpWindowHours('pricing_question'), 72);
  assert.equal(resolveFollowUpWindowHours('cancellation'), 72);
});

test('resolveFollowUpWindowHours uses intent-specific windows', () => {
  assert.equal(resolveFollowUpWindowHours('complaint'), 48);
  assert.equal(resolveFollowUpWindowHours('booking_request'), 72);
  assert.equal(resolveFollowUpWindowHours('unclear'), 72);
});

test('resolveFollowUpWindowHours nullish intent faller tillbaka till unclear-fonster', () => {
  assert.equal(resolveFollowUpWindowHours(null), 72);
  assert.equal(resolveFollowUpWindowHours(undefined), 72);
  assert.equal(resolveFollowUpWindowHours(''), 72);
});

test('resolveFollowUpWindowHours follow_up intent anvander 48h fonster', () => {
  assert.equal(resolveFollowUpWindowHours('follow_up'), 48);
});

test('evaluateLifecycleStatus marks FOLLOW_UP_PENDING when followUpSuggested', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInboundAt: '2026-03-01T10:00:00.000Z',
    lastOutboundAt: '2026-03-01T10:05:00.000Z',
    followUpSuggested: true,
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.lifecycleStatus, 'FOLLOW_UP_PENDING');
});

test('evaluateLifecycleStatus handles null input defensively', () => {
  const result = evaluateLifecycleStatus(null);
  assert.equal(result.lifecycleStatus, 'NEW');
  assert.equal(result.source, 'auto');
});

test('evaluateLifecycleStatus treats array input like null', () => {
  const fromArray = evaluateLifecycleStatus([]);
  const fromNull = evaluateLifecycleStatus(null);
  assert.deepEqual(fromArray, fromNull);
});

test('Lifecycle engine transitions when previousState differs', () => {
  const result = evaluateLifecycleStatus({
    previousState: 'AWAITING_REPLY',
    lastInboundAt: '2026-03-01T10:00:00.000Z',
    lastOutboundAt: null,
    slaStatus: 'breach',
    hoursSinceInbound: 10,
    nowMs: Date.parse('2026-03-01T20:00:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'FOLLOW_UP_PENDING');
  assert.deepEqual(result.transition, {
    from: 'AWAITING_REPLY',
    to: 'FOLLOW_UP_PENDING',
  });
});

test('Lifecycle engine clamps follow-up window override and threshold behavior', () => {
  const result = evaluateLifecycleStatus({
    lastInboundAt: '2026-03-01T08:00:00.000Z',
    lastOutboundAt: null,
    interactionCount: 2,
    intent: 'booking_request',
    followUpWindowHours: 1, // clamps to 24
    hoursSinceInbound: 23.9,
    nowMs: Date.parse('2026-03-01T20:00:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'ACTIVE_DIALOGUE');
});

test('Lifecycle engine archive hint overrides handled hint', () => {
  const result = evaluateLifecycleStatus({
    archived: true,
    needsReplyStatus: 'handled',
    lastInteractionDate: '2026-03-01T10:00:00.000Z',
  });
  assert.equal(result.lifecycleStatus, 'ARCHIVED');
});

test('Lifecycle manual override normalizes aliases and sort rank', () => {
  const result = evaluateLifecycleStatus(
    { lifecycleStatus: 'ACTIVE_DIALOGUE' },
    { manualOverride: 'waiting_on_customer' }
  );
  assert.equal(result.lifecycleStatus, 'AWAITING_REPLY');
  assert.equal(result.sortRank, toLifecycleSortRank('AWAITING_REPLY'));
  assert.equal(result.source, 'manual');
});

test('LIFECYCLE_STATES ar frusen (immutable)', () => {
  assert.equal(Object.isFrozen(LIFECYCLE_STATES), true);
});

test('normalizeLifecycleStatus trimmar kanoniska tillstand', () => {
  assert.equal(normalizeLifecycleStatus('  dormant  '), 'DORMANT');
  assert.equal(normalizeLifecycleStatus('HANDLED'), 'HANDLED');
});

test('normalizeLifecycleStatus mappar WAITING till AWAITING_REPLY', () => {
  assert.equal(normalizeLifecycleStatus('WAITING'), 'AWAITING_REPLY');
});

test('toLifecycleSortRank okand status efter normalisering ger NEW-rank', () => {
  const rankNew = toLifecycleSortRank('totally_unknown');
  assert.equal(rankNew, toLifecycleSortRank('NEW'));
});

test('evaluateLifecycleStatus klampar archiveDaysThreshold uppat till 60', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInteractionDate: '2025-12-01T10:00:00.000Z',
    archiveDaysThreshold: 10,
    nowMs: Date.parse('2026-03-01T10:00:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'ARCHIVED');
});

test('evaluateLifecycleStatus klampar microThreadWindowMinutes uppat till 15', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInboundAt: '2026-03-01T12:00:00.000Z',
    lastOutboundAt: '2026-03-01T12:05:00.000Z',
    microThreadWindowMinutes: 10,
    nowMs: Date.parse('2026-03-01T12:06:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'ACTIVE_DIALOGUE');
});

test('evaluateLifecycleStatus klampar dormantDaysThreshold uppat till 7', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 3,
    lastInteractionDate: '2026-02-20T10:00:00.000Z',
    dormantDaysThreshold: 3,
    nowMs: Date.parse('2026-03-01T10:00:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'DORMANT');
});

test('evaluateLifecycleStatus marks FOLLOW_UP_PENDING when hoursSinceInbound reaches window exactly', () => {
  const result = evaluateLifecycleStatus({
    interactionCount: 2,
    lastInboundAt: '2026-03-01T08:00:00.000Z',
    lastOutboundAt: null,
    intent: 'complaint',
    hoursSinceInbound: 48,
    slaStatus: 'safe',
    nowMs: Date.parse('2026-03-01T20:00:00.000Z'),
  });
  assert.equal(result.lifecycleStatus, 'FOLLOW_UP_PENDING');
});

test('evaluateLifecycleStatus sets daysSinceLastInteraction to 0 when last inbound is in the future', () => {
  const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const r = evaluateLifecycleStatus({
    lastInboundAt: future,
    lastOutboundAt: null,
    interactionCount: 2,
    nowMs: Date.now(),
  });
  assert.equal(r.daysSinceLastInteraction, 0);
});

test('evaluateLifecycleStatus accepts manualOverride on the input payload', () => {
  const r = evaluateLifecycleStatus({
    manualOverride: 'dormant',
    lifecycleStatus: 'NEW',
  });
  assert.equal(r.lifecycleStatus, 'DORMANT');
  assert.equal(r.source, 'manual');
});

test('evaluateLifecycleStatus options manualOverride overrides input manualOverride', () => {
  const r = evaluateLifecycleStatus(
    { manualOverride: 'HANDLED' },
    { manualOverride: 'ARCHIVED' }
  );
  assert.equal(r.lifecycleStatus, 'ARCHIVED');
  assert.equal(r.source, 'manual');
});
