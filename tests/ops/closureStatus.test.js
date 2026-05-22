const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_EXPECTED_REMAINING,
  buildClosureStatus,
  buildProgressSnapshot,
  buildStabilityTimeline,
} = require('../../src/ops/closureStatus');

test('progress snapshot tracks expected and unexpected remaining blockers', () => {
  const progress = buildProgressSnapshot({
    remainingIds: ['external_pentest_evidence', 'unexpected_internal_regression'],
    expectedRemainingIds: DEFAULT_EXPECTED_REMAINING,
  });

  assert.deepEqual(progress.remainingExpectedIds, ['external_pentest_evidence']);
  assert.deepEqual(progress.remainingUnexpectedIds, ['unexpected_internal_regression']);
  assert.equal(progress.totalCount, 4);
  assert.equal(progress.completedExpectedCount, 2);
  assert.equal(progress.percent, 50);
});

test('stability timeline computes remaining days and estimated ready timestamp', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-02-01T12:00:00.000Z' },
    stabilityWindow: { windowDays: 14, daysSinceLaunch: 3, completed: false },
  });

  assert.equal(timeline.windowDays, 14);
  assert.equal(timeline.daysSinceLaunch, 3);
  assert.equal(timeline.remainingDays, 11);
  assert.equal(timeline.completed, false);
  assert.equal(timeline.estimatedReadyAt, '2026-02-15T12:00:00.000Z');
});

test('buildStabilityTimeline completed true ger remainingDays 0', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-02-01T12:00:00.000Z' },
    stabilityWindow: { windowDays: 14, daysSinceLaunch: 2, completed: true },
  });
  assert.equal(timeline.remainingDays, 0);
  assert.equal(timeline.completed, true);
});

test('buildStabilityTimeline ogiltig launchedAt ger null för launchedAt och estimatedReadyAt', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: 'not-a-date' },
    stabilityWindow: { windowDays: 10, daysSinceLaunch: 1, completed: false },
  });
  assert.equal(timeline.launchedAt, null);
  assert.equal(timeline.estimatedReadyAt, null);
});

test('buildProgressSnapshot tomma listor ger percent 100 och totalCount 0', () => {
  const progress = buildProgressSnapshot({
    remainingIds: [],
    expectedRemainingIds: [],
  });
  assert.equal(progress.totalCount, 0);
  assert.equal(progress.percent, 100);
  assert.equal(progress.completedExpectedCount, 0);
});

test('buildProgressSnapshot deduplicerar remainingIds', () => {
  const progress = buildProgressSnapshot({
    remainingIds: [
      'external_pentest_evidence',
      'external_pentest_evidence',
      'formal_live_signoff',
    ],
    expectedRemainingIds: DEFAULT_EXPECTED_REMAINING,
  });
  assert.deepEqual(progress.remainingIds, ['external_pentest_evidence', 'formal_live_signoff']);
  assert.equal(progress.remainingExpectedIds.length, 2);
});

test('buildProgressSnapshot inga kvarvarande blockers ger 100 procent mot forvantade', () => {
  const progress = buildProgressSnapshot({
    remainingIds: [],
    expectedRemainingIds: ['alpha', 'beta'],
  });
  assert.equal(progress.totalCount, 2);
  assert.equal(progress.completedExpectedCount, 2);
  assert.equal(progress.percent, 100);
});

test('buildStabilityTimeline laser windowDays fran postLaunch nar stabilityWindow saknas', () => {
  const timeline = buildStabilityTimeline({
    release: {
      launchedAt: '2026-03-01T00:00:00.000Z',
      postLaunchStabilization: {
        requiredDays: 21,
        daysSinceLaunch: 5,
      },
    },
  });
  assert.equal(timeline.windowDays, 21);
  assert.equal(timeline.daysSinceLaunch, 5);
  assert.equal(timeline.remainingDays, 16);
  assert.equal(timeline.estimatedReadyAt, '2026-03-22T00:00:00.000Z');
});

test('buildStabilityTimeline clampar ogiltigt windowDays till 14', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-03-01T00:00:00.000Z' },
    stabilityWindow: { windowDays: 0, daysSinceLaunch: 1, completed: false },
  });
  assert.equal(timeline.windowDays, 14);
  assert.equal(timeline.remainingDays, 13);
});

test('closure status marks expected blockers with timeline-aware message', () => {
  const closure = buildClosureStatus({
    finalization: {
      summary: {
        failedSteps: [
          'check_pentest_evidence',
          'report_release_readiness',
          'report_stability_window',
          'release_go_live_gate',
        ],
      },
    },
    releaseReadiness: {
      failedChecks: ['pentestEvidenceOk'],
    },
    stability: {
      release: {
        status: 'launched',
        releaseGateClear: true,
        launchedAt: '2026-02-10T00:00:00.000Z',
      },
      stabilityWindow: {
        status: 'in_progress',
        completed: false,
        windowDays: 14,
        daysSinceLaunch: 5,
      },
      decision: {
        readyForBroadGoLive: false,
      },
    },
  });

  assert.equal(closure.done, false);
  assert.equal(closure.progress.percent, 0);
  assert.equal(closure.timeline.remainingDays, 9);
  assert.deepEqual(
    closure.remaining.map((item) => item.id),
    DEFAULT_EXPECTED_REMAINING
  );
  const stabilityEntry = closure.remaining.find((item) => item.id === 'stability_window_14_30d');
  assert.ok(stabilityEntry.reason.includes('kvar: 9 dagar'));
  assert.ok(stabilityEntry.reason.includes('2026-02-24T00:00:00.000Z'));
});

test('closure status requires explicit final live signoff lock when available', () => {
  const baseInput = {
    finalization: {
      summary: {
        failedSteps: [],
      },
    },
    releaseReadiness: {
      failedChecks: [],
    },
    stability: {
      release: {
        status: 'launched',
        releaseGateClear: true,
        launchedAt: '2026-02-10T00:00:00.000Z',
        finalLiveSignoff: {
          locked: false,
          lockedAt: null,
          lockedBy: null,
          note: '',
        },
      },
      stabilityWindow: {
        status: 'pass',
        completed: true,
        windowDays: 14,
        daysSinceLaunch: 16,
      },
      decision: {
        readyForBroadGoLive: true,
      },
    },
  };

  const pending = buildClosureStatus(baseInput);
  assert.equal(pending.formalSignoffPending, true);
  assert.ok(pending.remaining.some((item) => item.id === 'formal_live_signoff'));

  const locked = buildClosureStatus({
    ...baseInput,
    stability: {
      ...baseInput.stability,
      release: {
        ...baseInput.stability.release,
        finalLiveSignoff: {
          locked: true,
          lockedAt: '2026-02-26T12:00:00.000Z',
          lockedBy: 'owner-1',
          note: 'final lock',
        },
      },
    },
  });
  assert.equal(locked.formalSignoffPending, false);
  assert.equal(locked.done, true);
  assert.equal(locked.finalLiveSignoff.locked, true);
  assert.equal(locked.finalLiveSignoff.lockedBy, 'owner-1');
});

test('buildProgressSnapshot tolererar icke-array remainingIds', () => {
  const progress = buildProgressSnapshot({
    remainingIds: 'not-array',
    expectedRemainingIds: DEFAULT_EXPECTED_REMAINING,
  });
  assert.deepEqual(progress.remainingIds, []);
  assert.deepEqual(progress.remainingExpectedIds, []);
  assert.equal(progress.percent, 100);
});

test('buildProgressSnapshot tolererar icke-array expectedRemainingIds', () => {
  const progress = buildProgressSnapshot({
    remainingIds: ['external_pentest_evidence'],
    expectedRemainingIds: {},
  });
  assert.deepEqual(progress.expectedIds, []);
  assert.deepEqual(progress.remainingUnexpectedIds, ['external_pentest_evidence']);
  assert.equal(progress.totalCount, 1);
  assert.equal(progress.percent, 0);
});

test('buildStabilityTimeline klarar null eller icke-objekt stability', () => {
  const fromNull = buildStabilityTimeline(null);
  assert.equal(fromNull.windowDays, 14);
  assert.equal(fromNull.launchedAt, null);
  assert.equal(fromNull.estimatedReadyAt, null);
  assert.equal(fromNull.completed, false);

  const fromString = buildStabilityTimeline('not-an-object');
  assert.equal(fromString.windowDays, 14);
  assert.equal(fromString.daysSinceLaunch, 0);
});

test('buildStabilityTimeline treats NaN windowDays as fallback 14', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-04-01T00:00:00.000Z' },
    stabilityWindow: { windowDays: Number.NaN, daysSinceLaunch: 2, completed: false },
  });
  assert.equal(timeline.windowDays, 14);
  assert.equal(timeline.remainingDays, 12);
});

test('buildStabilityTimeline clamps negative daysSinceLaunch to 0', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-04-01T00:00:00.000Z' },
    stabilityWindow: { windowDays: 10, daysSinceLaunch: -3, completed: false },
  });
  assert.equal(timeline.daysSinceLaunch, 0);
  assert.equal(timeline.remainingDays, 10);
});

test('buildStabilityTimeline remainingDays is 0 when daysSinceLaunch exceeds window', () => {
  const timeline = buildStabilityTimeline({
    release: { launchedAt: '2026-04-01T00:00:00.000Z' },
    stabilityWindow: { windowDays: 7, daysSinceLaunch: 20, completed: false },
  });
  assert.equal(timeline.remainingDays, 0);
  assert.equal(timeline.completed, false);
});

test('buildClosureStatus skips pentest blocker when gates are clean', () => {
  const closure = buildClosureStatus({
    finalization: { summary: { failedSteps: [] } },
    releaseReadiness: { failedChecks: [] },
    stability: {
      release: {
        status: 'launched',
        releaseGateClear: true,
        launchedAt: '2026-02-10T00:00:00.000Z',
        finalLiveSignoff: {
          locked: true,
          lockedAt: '2026-02-26T12:00:00.000Z',
          lockedBy: 'owner-1',
          note: 'ok',
        },
      },
      stabilityWindow: {
        status: 'pass',
        completed: true,
        windowDays: 14,
        daysSinceLaunch: 16,
      },
      decision: { readyForBroadGoLive: true },
    },
  });
  assert.equal(closure.pentestBlocked, false);
  assert.equal(closure.done, true);
  assert.equal(closure.remaining.length, 0);
});

test('buildClosureStatus stability blocker använder kort reason när status inte är in_progress', () => {
  const closure = buildClosureStatus({
    finalization: { summary: { failedSteps: [] } },
    releaseReadiness: { failedChecks: [] },
    stability: {
      decision: { readyForBroadGoLive: false },
      stabilityWindow: { status: 'failed', completed: false, windowDays: 14, daysSinceLaunch: 2 },
      release: {
        status: 'launched',
        releaseGateClear: true,
        launchedAt: '2026-02-10T00:00:00.000Z',
      },
    },
  });
  const entry = closure.remaining.find((item) => item.id === 'stability_window_14_30d');
  assert.ok(entry);
  assert.equal(entry.reason, 'Stabilitetsfönstret är inte godkänt.');
});

test('buildClosureStatus sätter lockedAt till null vid ogiltig ISO-tidsstämpel', () => {
  const closure = buildClosureStatus({
    finalization: { summary: { failedSteps: [] } },
    releaseReadiness: { failedChecks: [] },
    stability: {
      release: {
        status: 'launched',
        releaseGateClear: true,
        launchedAt: '2026-02-10T00:00:00.000Z',
        finalLiveSignoff: {
          locked: true,
          lockedAt: 'not-valid-iso',
          lockedBy: 'owner-1',
        },
      },
      stabilityWindow: { status: 'pass', completed: true, windowDays: 14, daysSinceLaunch: 16 },
      decision: { readyForBroadGoLive: true },
    },
  });
  assert.equal(closure.finalLiveSignoff.locked, true);
  assert.equal(closure.finalLiveSignoff.lockedAt, null);
});

test('buildProgressSnapshot deduplicerar expectedRemainingIds', () => {
  const progress = buildProgressSnapshot({
    remainingIds: [],
    expectedRemainingIds: ['alpha', 'alpha', 'beta'],
  });
  assert.deepEqual(progress.expectedIds, ['alpha', 'beta']);
  assert.equal(progress.totalCount, 2);
  assert.equal(progress.percent, 100);
});
