const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_EXPECTED_REMAINING = Object.freeze([
  'external_pentest_evidence',
  'stability_window_14_30d',
  'formal_live_signoff',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function clampPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function uniqueIds(list = []) {
  return [...new Set((Array.isArray(list) ? list : []).map((item) => normalizeText(item)).filter(Boolean))];
}

function buildProgressSnapshot({
  remainingIds = [],
  expectedRemainingIds = DEFAULT_EXPECTED_REMAINING,
} = {}) {
  const expected = uniqueIds(expectedRemainingIds);
  const remaining = uniqueIds(remainingIds);
  const remainingSet = new Set(remaining);
  const expectedSet = new Set(expected);
  const expectedRemaining = expected.filter((id) => remainingSet.has(id));
  const expectedDone = expected.length - expectedRemaining.length;
  const unexpectedRemaining = remaining.filter((id) => !expectedSet.has(id));
  const total = expected.length + unexpectedRemaining.length;
  const completed = Math.max(0, expectedDone);
  const percent = total <= 0 ? 100 : Number(((completed / total) * 100).toFixed(2));

  return {
    expectedIds: expected,
    remainingIds: remaining,
    remainingExpectedIds: expectedRemaining,
    remainingUnexpectedIds: unexpectedRemaining,
    completedExpectedCount: completed,
    totalCount: total,
    percent,
  };
}

function buildStabilityTimeline(stability = null) {
  const source = stability && typeof stability === 'object' ? stability : {};
  const release = source.release && typeof source.release === 'object' ? source.release : {};
  const windowSource =
    source.stabilityWindow && typeof source.stabilityWindow === 'object'
      ? source.stabilityWindow
      : {};
  const postLaunch =
    release.postLaunchStabilization && typeof release.postLaunchStabilization === 'object'
      ? release.postLaunchStabilization
      : {};

  const launchedAt = toIso(release.launchedAt);
  const windowDays = clampPositiveInt(windowSource.windowDays || postLaunch.requiredDays, 14);
  const daysSinceLaunch = clampPositiveInt(
    windowSource.daysSinceLaunch || postLaunch.daysSinceLaunch,
    0
  );
  const completed = windowSource.completed === true;
  const remainingDays = completed ? 0 : Math.max(0, windowDays - daysSinceLaunch);

  let estimatedReadyAt = null;
  if (launchedAt) {
    const launchMs = Date.parse(launchedAt);
    if (Number.isFinite(launchMs)) {
      estimatedReadyAt = new Date(launchMs + windowDays * DAY_MS).toISOString();
    }
  }

  return {
    launchedAt,
    windowDays,
    daysSinceLaunch,
    remainingDays,
    estimatedReadyAt,
    completed,
  };
}

function buildClosureStatus({
  finalization = null,
  releaseReadiness = null,
  stability = null,
  expectedRemainingIds = DEFAULT_EXPECTED_REMAINING,
} = {}) {
  const finalizationFailedSteps = Array.isArray(finalization?.summary?.failedSteps)
    ? finalization.summary.failedSteps
    : [];
  const releaseFailedChecks = Array.isArray(releaseReadiness?.failedChecks)
    ? releaseReadiness.failedChecks
    : [];

  const pentestBlocked =
    finalizationFailedSteps.includes('check_pentest_evidence') ||
    finalizationFailedSteps.includes('report_release_readiness') ||
    releaseFailedChecks.includes('pentestEvidenceOk');

  const stabilityReadyForBroadGoLive = stability?.decision?.readyForBroadGoLive === true;
  const stabilityStatus = normalizeText(stability?.stabilityWindow?.status || '');
  const stabilityBlocked =
    finalizationFailedSteps.includes('report_stability_window') ||
    finalizationFailedSteps.includes('release_go_live_gate') ||
    stabilityReadyForBroadGoLive !== true;

  const releaseGateClear = stability?.release?.releaseGateClear === true;
  const launched = normalizeText(stability?.release?.status || '').toLowerCase() === 'launched';
  const finalLiveSignoff =
    stability?.release?.finalLiveSignoff && typeof stability.release.finalLiveSignoff === 'object'
      ? stability.release.finalLiveSignoff
      : null;
  const finalLiveSignoffLocked = finalLiveSignoff?.locked === true;
  const finalLiveSignoffLockedAt = toIso(finalLiveSignoff?.lockedAt);
  const finalLiveSignoffLockedBy = normalizeText(finalLiveSignoff?.lockedBy) || null;
  const formalSignoffPending =
    stabilityReadyForBroadGoLive !== true
      ? true
      : finalLiveSignoff
        ? finalLiveSignoffLocked !== true
        : !(launched && releaseGateClear && stabilityReadyForBroadGoLive);

  const timeline = buildStabilityTimeline(stability);
  const remaining = [];
  if (pentestBlocked) {
    remaining.push({
      id: 'external_pentest_evidence',
      status: 'open',
      reason: 'Extern pentest-evidence saknas/ogiltig enligt gate-validering.',
      command: 'npm run check:pentest:evidence:strict',
    });
  }
  if (stabilityBlocked) {
    const details =
      stabilityStatus === 'in_progress'
        ? `Stabilitetsfönstret är pågående men inte komplett (kvar: ${timeline.remainingDays} dagar, tidigast klar: ${timeline.estimatedReadyAt || 'okänt'}).`
        : 'Stabilitetsfönstret är inte godkänt.';
    remaining.push({
      id: 'stability_window_14_30d',
      status: 'open',
      reason: details,
      command: 'npm run report:stability-window:strict',
    });
  }
  if (formalSignoffPending) {
    remaining.push({
      id: 'formal_live_signoff',
      status: 'open',
      reason:
        stabilityReadyForBroadGoLive !== true
          ? 'Formell live sign-off kan inte låsas innan stabilitetsfönstret är godkänt.'
          : 'Formell live sign-off (Owner + Risk + Ops) saknas eller är inte låst efter stabilitetsfönstret.',
      command: 'npm run release:cycle:final-lock',
    });
  }

  const progress = buildProgressSnapshot({
    remainingIds: remaining.map((item) => item.id),
    expectedRemainingIds,
  });

  return {
    done: remaining.length === 0,
    releaseGateClear,
    launched,
    stabilityStatus: stabilityStatus || null,
    stabilityReadyForBroadGoLive,
    pentestBlocked,
    stabilityBlocked,
    formalSignoffPending,
    finalLiveSignoff: {
      available: Boolean(finalLiveSignoff),
      locked: finalLiveSignoffLocked,
      lockedAt: finalLiveSignoffLockedAt,
      lockedBy: finalLiveSignoffLockedBy,
    },
    timeline,
    progress,
    remaining,
  };
}

module.exports = {
  DEFAULT_EXPECTED_REMAINING,
  buildClosureStatus,
  buildProgressSnapshot,
  buildStabilityTimeline,
};
