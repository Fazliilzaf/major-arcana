const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildWindowSummary,
  buildStabilityDecision,
  isReleaseGateClear,
  normalizeReadinessEntries,
  toIso,
} = require('../../src/ops/stabilityWindow');

const NOW_MS = Date.parse('2026-02-26T12:00:00.000Z');

test('stability window returns not_launched without launch timestamp', () => {
  const summary = buildWindowSummary({
    entries: [],
    windowDays: 14,
    launchedAt: null,
    nowMs: NOW_MS,
  });

  assert.equal(summary.status, 'not_launched');
  assert.equal(summary.completed, false);
  assert.equal(summary.hasNoGoTrigger, false);
  assert.ok(summary.reasons.includes('release_not_launched'));
});

test('stability window is in_progress with clean daily coverage before window completion', () => {
  const launchedAt = '2026-02-24T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-24T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 91,
      },
      {
        ts: '2026-02-25T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 92,
      },
      {
        ts: '2026-02-26T10:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 93,
      },
    ],
  });

  assert.equal(summary.status, 'in_progress');
  assert.equal(summary.completed, false);
  assert.equal(summary.daysSinceLaunch, 3);
  assert.equal(summary.expectedDays, 3);
  assert.equal(summary.daysCovered, 3);
  assert.equal(summary.coveragePercent, 100);
  assert.equal(summary.hasNoGoTrigger, false);
  assert.ok(summary.reasons.includes('window_not_complete_yet'));
});

test('stability window fails when no-go signal appears after launch', () => {
  const launchedAt = '2026-02-10T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-20T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 95,
      },
      {
        ts: '2026-02-21T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 1,
        blockingRequiredChecks: 0,
        score: 85,
      },
      {
        ts: '2026-02-22T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 90,
      },
    ],
  });

  assert.equal(summary.status, 'fail');
  assert.equal(summary.hasNoGoTrigger, true);
  assert.equal(summary.maxTriggeredNoGo, 1);
  assert.ok(summary.reasons.includes('window_contains_no_go_or_blocking_checks'));
});

test('stability decision requires clear release gate and passing window', () => {
  const passDecision = buildStabilityDecision({
    releaseEvaluation: {
      releaseGatePassed: true,
      blockers: [],
    },
    windowSummary: {
      status: 'pass',
      hasNoGoTrigger: false,
    },
    requireCompleteWindow: true,
  });
  assert.equal(passDecision.overallStatus, 'pass');
  assert.equal(passDecision.readySoFar, true);
  assert.equal(passDecision.readyForBroadGoLive, true);

  const failDecision = buildStabilityDecision({
    releaseEvaluation: {
      releaseGatePassed: false,
      blockers: [{ id: 'readiness_gate_failed' }],
    },
    windowSummary: {
      status: 'in_progress',
      hasNoGoTrigger: false,
    },
    requireCompleteWindow: true,
  });
  assert.equal(failDecision.overallStatus, 'fail');
  assert.equal(failDecision.readySoFar, false);
  assert.equal(failDecision.readyForBroadGoLive, false);
  assert.ok(failDecision.reasons.includes('release_gate_or_blockers_not_clear'));
  assert.ok(failDecision.reasons.includes('complete_stability_window_required'));
});

test('isReleaseGateClear requires gate pass and zero blockers', () => {
  assert.equal(isReleaseGateClear({ releaseGatePassed: true, blockers: [] }), true);
  assert.equal(isReleaseGateClear({ releaseGatePassed: true, blockers: [{ id: 'x' }] }), false);
  assert.equal(isReleaseGateClear({ releaseGatePassed: false, blockers: [] }), false);
  assert.equal(isReleaseGateClear(null), false);
  assert.equal(isReleaseGateClear({}), false);
});

test('normalizeReadinessEntries filtrerar bort ogiltiga ts och icke-array', () => {
  assert.deepEqual(normalizeReadinessEntries(null), []);
  const rows = normalizeReadinessEntries([
    { ts: 'not-a-date', goAllowed: true },
    { ts: '2026-03-01T08:00:00.000Z', goAllowed: true, triggeredNoGo: 2, score: 80 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ts, '2026-03-01T08:00:00.000Z');
  assert.equal(rows[0].triggeredNoGo, 2);
  assert.equal(rows[0].score, 80);
});

test('toIso returnerar null för tom eller ogiltig input', () => {
  assert.equal(toIso(null), null);
  assert.equal(toIso(''), null);
  assert.equal(toIso('invalid-date'), null);
  assert.equal(toIso('2026-04-01T10:00:00.000Z'), '2026-04-01T10:00:00.000Z');
});

test('toIso returnerar null för numerisk noll', () => {
  assert.equal(toIso(0), null);
});

test('toIso accepterar Date-objekt via String-koercing', () => {
  const d = new Date('2026-04-01T10:00:00.000Z');
  assert.equal(toIso(d), '2026-04-01T10:00:00.000Z');
});

test('toIso returnerar null för rena millisekundstal utan ISO-sträng', () => {
  assert.equal(toIso(1767225600000), null);
});

test('isReleaseGateClear sant när blockers saknas men gate är passerad', () => {
  assert.equal(isReleaseGateClear({ releaseGatePassed: true }), true);
});

test('buildWindowSummary klampar windowDays till minst 1', () => {
  const s = buildWindowSummary({ windowDays: 0, launchedAt: null, nowMs: NOW_MS });
  assert.equal(s.windowDays, 14);
});

test('buildWindowSummary klampar negativ windowDays till 1 (saknar falsy-fallback till 14)', () => {
  const s = buildWindowSummary({ windowDays: -9, launchedAt: null, nowMs: NOW_MS });
  assert.equal(s.windowDays, 1);
});

test('stability window failar vid blockingRequiredChecks utan triggeredNoGo', () => {
  const launchedAt = '2026-02-10T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-22T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 1,
        score: 90,
      },
    ],
  });
  assert.equal(summary.status, 'fail');
  assert.equal(summary.hasNoGoTrigger, true);
  assert.equal(summary.maxBlockingRequiredChecks, 1);
  assert.ok(summary.reasons.includes('window_contains_no_go_or_blocking_checks'));
});

test('stability window failar när fönstret är klart men dagstäckning understiger windowDays', () => {
  const launchedAt = '2026-01-01T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-20T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 92,
      },
      {
        ts: '2026-02-21T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 93,
      },
    ],
  });
  assert.equal(summary.completed, true);
  assert.equal(summary.hasNoGoTrigger, false);
  assert.equal(summary.daysCovered, 2);
  assert.equal(summary.status, 'fail');
  assert.ok(summary.reasons.includes('insufficient_daily_coverage'));
});

test('buildWindowSummary exkluderar poster efter nowMs och före launch', () => {
  const launchedAt = '2026-02-25T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-26T14:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 90,
      },
      {
        ts: '2026-02-24T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 88,
      },
      {
        ts: '2026-02-25T15:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 91,
      },
    ],
  });
  assert.equal(summary.entriesCount, 1);
  assert.equal(summary.dayBuckets.length, 1);
});

test('buildStabilityDecision använder tom window-summary när windowSummary saknas', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: null,
    requireCompleteWindow: false,
  });
  assert.equal(d.overallStatus, 'not_launched');
  assert.equal(d.readyForBroadGoLive, false);
  assert.equal(d.readySoFar, true);
  assert.ok(d.reasons.includes('release_not_launched'));
});

test('buildStabilityDecision använder default window när windowSummary är primitiv', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: 0,
    requireCompleteWindow: false,
  });
  assert.equal(d.overallStatus, 'not_launched');
});

test('buildStabilityDecision lägger complete_stability_window_required vid in_progress och krav', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'in_progress', hasNoGoTrigger: false },
    requireCompleteWindow: true,
  });
  assert.equal(d.overallStatus, 'in_progress');
  assert.ok(d.reasons.includes('complete_stability_window_required'));
  assert.ok(d.reasons.includes('stability_window_in_progress'));
});

test('buildWindowSummary treats NaN windowDays as 14', () => {
  const s = buildWindowSummary({ windowDays: NaN, launchedAt: null, nowMs: NOW_MS });
  assert.equal(s.windowDays, 14);
});

test('buildWindowSummary sets hasNoGoTrigger when goAllowed is false', () => {
  const launchedAt = '2026-02-24T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-25T12:00:00.000Z',
        goAllowed: false,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 70,
      },
    ],
  });
  assert.equal(summary.hasNoGoTrigger, true);
  assert.equal(summary.goAllowedAll, false);
});

test('normalizeReadinessEntries coerces string numeric fields', () => {
  const rows = normalizeReadinessEntries([
    {
      ts: '2026-03-01T08:00:00.000Z',
      triggeredNoGo: '3',
      blockingRequiredChecks: '1',
      score: '88.5',
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].triggeredNoGo, 3);
  assert.equal(rows[0].blockingRequiredChecks, 1);
  assert.equal(rows[0].score, 88.5);
});

test('buildStabilityDecision returns fail when window fails even if release gate clear', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'fail', hasNoGoTrigger: true },
    requireCompleteWindow: false,
  });
  assert.equal(d.overallStatus, 'fail');
  assert.equal(d.readyForBroadGoLive, false);
  assert.equal(d.readySoFar, false);
  assert.ok(d.reasons.includes('stability_window_failed'));
});

test('buildWindowSummary exkluderar poster äldre än rolling cutoff eller före launch', () => {
  const launchedAt = '2026-02-24T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-11T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 90,
      },
      {
        ts: '2026-02-25T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 91,
      },
    ],
  });
  assert.equal(summary.entriesCount, 1);
  assert.equal(summary.dayBuckets.length, 1);
});

test('normalizeReadinessEntries filtrerar bort ts som bara är whitespace', () => {
  assert.deepEqual(normalizeReadinessEntries([{ ts: '   \t', goAllowed: true }]), []);
});

test('buildWindowSummary accepterar windowDays som numerisk sträng', () => {
  const s = buildWindowSummary({ windowDays: '7', launchedAt: null, nowMs: NOW_MS });
  assert.equal(s.windowDays, 7);
});

test('buildWindowSummary sätter minScore till lägsta score bland relevanta poster', () => {
  const launchedAt = '2026-02-24T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-24T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 95,
      },
      {
        ts: '2026-02-25T12:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 80,
      },
    ],
  });
  assert.equal(summary.minScore, 80);
});

test('buildStabilityDecision readyForBroadGoLive true vid status pass även om hasNoGoTrigger saknas', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'pass' },
    requireCompleteWindow: false,
  });
  assert.equal(d.readyForBroadGoLive, true);
  assert.equal(d.readySoFar, false);
});

test('buildStabilityDecision readySoFar true när pass-summary har hasNoGoTrigger false', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'pass', hasNoGoTrigger: false },
    requireCompleteWindow: true,
  });
  assert.equal(d.readyForBroadGoLive, true);
  assert.equal(d.readySoFar, true);
  assert.equal(d.overallStatus, 'pass');
  assert.ok(!d.reasons.includes('complete_stability_window_required'));
});

test('normalizeReadinessEntries tolererar null-element i listan', () => {
  const rows = normalizeReadinessEntries([
    null,
    { ts: '2026-03-01T08:00:00.000Z', goAllowed: true, score: 70 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 70);
});

test('buildWindowSummary slår ihop flera poster samma UTC-dag i samma dayBucket', () => {
  const launchedAt = '2026-02-24T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [
      {
        ts: '2026-02-25T08:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 90,
      },
      {
        ts: '2026-02-25T18:00:00.000Z',
        goAllowed: true,
        triggeredNoGo: 0,
        blockingRequiredChecks: 0,
        score: 92,
      },
    ],
  });
  assert.equal(summary.entriesCount, 2);
  assert.equal(summary.dayBuckets.length, 1);
  assert.equal(summary.dayBuckets[0].count, 2);
});

test('buildWindowSummary expectedDays begränsas av windowDays när daysSinceLaunch är större', () => {
  const launchedAt = '2026-01-01T00:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [],
  });
  assert.equal(summary.windowDays, 14);
  assert.ok(summary.daysSinceLaunch > 14);
  assert.equal(summary.expectedDays, 14);
});

test('normalizeReadinessEntries tom array ger tom array', () => {
  assert.deepEqual(normalizeReadinessEntries([]), []);
});

test('buildStabilityDecision behåller overall not_launched när windowSummary är not_launched', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'not_launched', hasNoGoTrigger: false },
    requireCompleteWindow: false,
  });
  assert.equal(d.overallStatus, 'not_launched');
  assert.equal(d.readyForBroadGoLive, false);
  assert.ok(d.reasons.includes('release_not_launched'));
});

test('buildWindowSummary coveragePercent 0 när inga dagbuckets under pågående launch', () => {
  const launchedAt = '2026-02-25T12:00:00.000Z';
  const summary = buildWindowSummary({
    windowDays: 14,
    launchedAt,
    nowMs: NOW_MS,
    entries: [],
  });
  assert.equal(summary.status, 'in_progress');
  assert.equal(summary.daysCovered, 0);
  assert.equal(summary.coveragePercent, 0);
});

test('buildStabilityDecision lägger complete_stability_window_required vid not_launched om krav finns', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'not_launched', hasNoGoTrigger: false },
    requireCompleteWindow: true,
  });
  assert.ok(d.reasons.includes('complete_stability_window_required'));
  assert.ok(d.reasons.includes('release_not_launched'));
});

test('toIso returnerar null för ts som bara är whitespace', () => {
  assert.equal(toIso('   \t'), null);
});

test('isReleaseGateClear falskt när blockers är sträng med length större än 0', () => {
  assert.equal(isReleaseGateClear({ releaseGatePassed: true, blockers: 'x' }), false);
});

test('normalizeReadinessEntries sätter goAllowed till false när egenskap saknas', () => {
  const rows = normalizeReadinessEntries([{ ts: '2026-03-01T08:00:00.000Z' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].goAllowed, false);
});

test('buildStabilityDecision lägger complete_stability_window_required även vid window fail', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'fail', hasNoGoTrigger: true },
    requireCompleteWindow: true,
  });
  assert.ok(d.reasons.includes('stability_window_failed'));
  assert.ok(d.reasons.includes('complete_stability_window_required'));
});

test('buildStabilityDecision ackumulerar gate- och window-fail reasons', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: false, blockers: [{ id: 'x' }] },
    windowSummary: { status: 'fail', hasNoGoTrigger: true },
    requireCompleteWindow: false,
  });
  assert.ok(d.reasons.includes('release_gate_or_blockers_not_clear'));
  assert.ok(d.reasons.includes('stability_window_failed'));
});

test('buildStabilityDecision utan complete reason när window pass och krav avstängt', () => {
  const d = buildStabilityDecision({
    releaseEvaluation: { releaseGatePassed: true, blockers: [] },
    windowSummary: { status: 'pass', hasNoGoTrigger: false },
    requireCompleteWindow: false,
  });
  assert.equal(d.overallStatus, 'pass');
  assert.ok(!d.reasons.includes('complete_stability_window_required'));
});
