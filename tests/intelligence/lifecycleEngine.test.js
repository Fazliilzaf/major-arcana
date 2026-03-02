const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateLifecycleStatus,
  toLifecycleSortRank,
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
