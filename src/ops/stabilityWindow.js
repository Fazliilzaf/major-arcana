function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function toUtcDay(value) {
  const iso = toIso(value);
  if (!iso) return '';
  return iso.slice(0, 10);
}

function isReleaseGateClear(evaluation = null) {
  const releaseGatePassed = evaluation?.releaseGatePassed === true;
  const blockerCount = Number(evaluation?.blockers?.length || 0);
  return releaseGatePassed && blockerCount === 0;
}

function normalizeReadinessEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((item) => ({
      ts: toIso(item?.ts),
      goAllowed: item?.goAllowed === true,
      triggeredNoGo: Number(item?.triggeredNoGo || 0),
      blockingRequiredChecks: Number(item?.blockingRequiredChecks || 0),
      score: Number(item?.score || 0),
    }))
    .filter((item) => item.ts);
}

function buildWindowSummary({
  entries = [],
  windowDays = 14,
  launchedAt = null,
  nowMs = Date.now(),
}) {
  const safeWindowDays = Math.max(1, Number(windowDays) || 14);
  const cutoffMs = nowMs - safeWindowDays * 24 * 60 * 60 * 1000;
  const launchMs = Date.parse(String(launchedAt || ''));
  const hasLaunch = Number.isFinite(launchMs);
  const normalizedEntries = normalizeReadinessEntries(entries);
  const relevant = normalizedEntries
    .filter((item) => {
      const ts = Date.parse(String(item.ts || ''));
      if (!Number.isFinite(ts)) return false;
      if (ts < cutoffMs || ts > nowMs) return false;
      if (hasLaunch && ts < launchMs) return false;
      return true;
    })
    .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));

  const dayBucketsMap = new Map();
  let goAllowedAll = true;
  let maxTriggeredNoGo = 0;
  let maxBlockingRequiredChecks = 0;
  let minScore = null;
  for (const item of relevant) {
    if (item.goAllowed !== true) goAllowedAll = false;
    if (Number.isFinite(item.triggeredNoGo) && item.triggeredNoGo > maxTriggeredNoGo) {
      maxTriggeredNoGo = item.triggeredNoGo;
    }
    if (
      Number.isFinite(item.blockingRequiredChecks) &&
      item.blockingRequiredChecks > maxBlockingRequiredChecks
    ) {
      maxBlockingRequiredChecks = item.blockingRequiredChecks;
    }
    if (Number.isFinite(item.score)) {
      minScore = minScore === null ? item.score : Math.min(minScore, item.score);
    }
    const dayKey = toUtcDay(item.ts);
    if (!dayKey) continue;
    const current = dayBucketsMap.get(dayKey) || {
      day: dayKey,
      count: 0,
      goAllowedAll: true,
      maxTriggeredNoGo: 0,
      maxBlockingRequiredChecks: 0,
      minScore: null,
    };
    current.count += 1;
    if (item.goAllowed !== true) current.goAllowedAll = false;
    if (item.triggeredNoGo > current.maxTriggeredNoGo) current.maxTriggeredNoGo = item.triggeredNoGo;
    if (item.blockingRequiredChecks > current.maxBlockingRequiredChecks) {
      current.maxBlockingRequiredChecks = item.blockingRequiredChecks;
    }
    current.minScore =
      current.minScore === null ? item.score : Math.min(Number(current.minScore), Number(item.score));
    dayBucketsMap.set(dayKey, current);
  }

  const dayBuckets = [...dayBucketsMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  const daysCovered = dayBuckets.length;
  const daysSinceLaunch = hasLaunch
    ? Math.max(0, Math.ceil((nowMs - launchMs) / (24 * 60 * 60 * 1000)))
    : null;
  const completed = hasLaunch ? daysSinceLaunch >= safeWindowDays : false;
  const expectedDays = hasLaunch
    ? Math.max(1, Math.min(safeWindowDays, daysSinceLaunch || 0))
    : safeWindowDays;
  const coveragePercent = expectedDays <= 0
    ? 100
    : Number(((daysCovered / expectedDays) * 100).toFixed(2));
  const hasNoGoTrigger =
    relevant.length > 0 && (maxTriggeredNoGo > 0 || !goAllowedAll || maxBlockingRequiredChecks > 0);

  let status = 'not_launched';
  if (hasLaunch) {
    if (hasNoGoTrigger) status = 'fail';
    else if (!completed) status = 'in_progress';
    else if (daysCovered < safeWindowDays) status = 'fail';
    else status = 'pass';
  }

  const reasons = [];
  if (!hasLaunch) reasons.push('release_not_launched');
  if (hasNoGoTrigger) reasons.push('window_contains_no_go_or_blocking_checks');
  if (hasLaunch && completed && daysCovered < safeWindowDays) reasons.push('insufficient_daily_coverage');
  if (hasLaunch && !completed) reasons.push('window_not_complete_yet');

  return {
    windowDays: safeWindowDays,
    status,
    completed,
    daysSinceLaunch,
    expectedDays,
    daysCovered,
    coveragePercent,
    entriesCount: relevant.length,
    goAllowedAll,
    maxTriggeredNoGo,
    maxBlockingRequiredChecks,
    minScore,
    hasNoGoTrigger,
    reasons,
    dayBuckets,
  };
}

function buildStabilityDecision({
  releaseEvaluation = null,
  windowSummary = null,
  requireCompleteWindow = false,
}) {
  const releaseGateClear = isReleaseGateClear(releaseEvaluation);
  const window = windowSummary && typeof windowSummary === 'object'
    ? windowSummary
    : buildWindowSummary({});
  const readyForBroadGoLive = releaseGateClear && window.status === 'pass';
  const readySoFar = releaseGateClear && window.status !== 'fail' && window.hasNoGoTrigger === false;
  const overallStatus = readyForBroadGoLive
    ? 'pass'
    : window.status === 'fail' || !releaseGateClear
      ? 'fail'
      : window.status;
  const reasons = [];
  if (!releaseGateClear) reasons.push('release_gate_or_blockers_not_clear');
  if (window.status === 'fail') reasons.push('stability_window_failed');
  if (window.status === 'in_progress') reasons.push('stability_window_in_progress');
  if (window.status === 'not_launched') reasons.push('release_not_launched');
  if (requireCompleteWindow && window.status !== 'pass') reasons.push('complete_stability_window_required');
  return {
    overallStatus,
    readySoFar,
    readyForBroadGoLive,
    reasons,
  };
}

module.exports = {
  normalizeReadinessEntries,
  toIso,
  isReleaseGateClear,
  buildWindowSummary,
  buildStabilityDecision,
};
