function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function round(value, precision = 2) {
  const factor = 10 ** Math.max(0, toNumber(precision, 2));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDayKeyFromMs(ms) {
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function toNeedsReplyStatus(value = '') {
  return normalizeText(value).toLowerCase() === 'handled' ? 'handled' : 'needs_reply';
}

function toTrendPercent(current = 0, previous = 0) {
  const safeCurrent = toNumber(current, 0);
  const safePrevious = toNumber(previous, 0);
  if (safePrevious <= 0) {
    if (safeCurrent <= 0) return 0;
    return 100;
  }
  return ((safeCurrent - safePrevious) / safePrevious) * 100;
}

function toTrendLabel(percent = 0) {
  const safePercent = round(percent, 0);
  if (safePercent > 0) return `+${safePercent}%`;
  return `${safePercent}%`;
}

function average(values = [], precision = 2) {
  const list = asArray(values)
    .map((value) => toNumber(value, NaN))
    .filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  const sum = list.reduce((acc, value) => acc + value, 0);
  return round(sum / list.length, precision);
}

function computeWorklistSnapshotMetrics(worklist = []) {
  const unresolved = asArray(worklist).filter(
    (row) => toNeedsReplyStatus(row?.needsReplyStatus) !== 'handled'
  );
  const unresolvedCount = unresolved.length;

  const slaBreachCount = unresolved.filter((row) => {
    const status = normalizeText(row?.slaStatus).toLowerCase();
    if (status === 'breach') return true;
    return false;
  }).length;

  const unansweredOver48hCount = unresolved.filter(
    (row) => toNumber(row?.hoursSinceInbound, 0) >= 48
  ).length;

  const complaintCount = unresolved.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'complaint'
  ).length;

  const frustratedCount = unresolved.filter(
    (row) => normalizeText(row?.tone).toLowerCase() === 'frustrated'
  ).length;

  const escalationCount = unresolved.filter((row) => row?.escalationRequired === true).length;

  const bookingCount = unresolved.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'booking_request'
  ).length;

  const denominator = Math.max(1, unresolvedCount);
  const slaBreachRate = unresolvedCount ? slaBreachCount / denominator : 0;
  const complaintRate = unresolvedCount ? complaintCount / denominator : 0;
  const frustratedRate = unresolvedCount ? frustratedCount / denominator : 0;
  const escalationRate = unresolvedCount ? escalationCount / denominator : 0;
  const conversionSignal = unresolvedCount ? bookingCount / denominator : 0;

  return {
    unresolvedCount,
    unansweredOver48hCount,
    slaBreachCount,
    slaBreachRate: round(clamp(slaBreachRate, 0, 1), 4),
    complaintCount,
    complaintRate: round(clamp(complaintRate, 0, 1), 4),
    frustratedCount,
    frustratedRate: round(clamp(frustratedRate, 0, 1), 4),
    escalationCount,
    escalationRate: round(clamp(escalationRate, 0, 1), 4),
    bookingCount,
    conversionSignal: round(clamp(conversionSignal, 0, 1), 4),
  };
}

function computeHealthScore({
  snapshotMetrics = {},
  avgResponseTimeHours = 0,
  recommendationFollowRate = 0,
  ccoUsageRate = 0,
  sprintCompletionRate = 0,
} = {}) {
  const safeSnapshot =
    snapshotMetrics && typeof snapshotMetrics === 'object' && !Array.isArray(snapshotMetrics)
      ? snapshotMetrics
      : {};

  const unansweredOver48hCount = Math.max(0, toNumber(safeSnapshot.unansweredOver48hCount, 0));
  const slaBreachRate = clamp(safeSnapshot.slaBreachRate, 0, 1, 0);
  const complaintRate = clamp(safeSnapshot.complaintRate, 0, 1, 0);
  const frustratedRate = clamp(safeSnapshot.frustratedRate, 0, 1, 0);
  const escalationRate = clamp(safeSnapshot.escalationRate, 0, 1, 0);
  const safeAvgResponseHours = Math.max(0, toNumber(avgResponseTimeHours, 0));
  const safeFollowRate = clamp(recommendationFollowRate, 0, 1, 0);
  const safeUsageRate = clamp(ccoUsageRate, 0, 1, 0);
  const safeSprintCompletionRate = clamp(sprintCompletionRate, 0, 1, 0);

  let score = 100;
  score -= unansweredOver48hCount * 3;
  score -= slaBreachRate * 40;
  score -= complaintRate * 25;
  score -= frustratedRate * 15;
  score -= escalationRate * 15;
  score -= Math.max(0, safeAvgResponseHours - 6) * 1.5;
  score += safeFollowRate * 10;
  score += safeUsageRate * 8;
  score += safeSprintCompletionRate * 7;

  return Math.round(clamp(score, 0, 100, 0));
}

function toVolatilityIndex(healthHistory = []) {
  const series = asArray(healthHistory)
    .map((point) => toNumber(point?.score, NaN))
    .filter((value) => Number.isFinite(value));
  if (series.length <= 1) return 0;
  const mean = series.reduce((acc, value) => acc + value, 0) / series.length;
  const variance =
    series.reduce((acc, value) => acc + (value - mean) ** 2, 0) / series.length;
  const stdDev = Math.sqrt(variance);
  return round(clamp(stdDev / 20, 0, 1, 0), 3);
}

function computeUsageAnalytics({
  windowDays = 14,
  auditEvents = [],
  analysisEntries = [],
  currentConversationWorklist = [],
  previousConversationWorklist = [],
  healthHistory = [],
} = {}) {
  const safeWindowDays = Math.max(1, Math.min(90, Math.round(toNumber(windowDays, 14))));
  const safeAuditEvents = asArray(auditEvents);
  const safeAnalysisEntries = asArray(analysisEntries);

  const ccoAuditEvents = safeAuditEvents.filter((event) => {
    const action = normalizeText(event?.action).toLowerCase();
    return action.startsWith('cco.') || action === 'capability.run.complete';
  });

  const activeDaySet = new Set();
  ccoAuditEvents.forEach((event) => {
    const key = toDayKeyFromMs(toTimestampMs(event?.ts || event?.metadata?.timestamp));
    if (key) activeDaySet.add(key);
  });
  safeAnalysisEntries.forEach((entry) => {
    const key = toDayKeyFromMs(toTimestampMs(entry?.ts));
    if (key) activeDaySet.add(key);
  });
  const ccoUsageRate = round(clamp(activeDaySet.size / safeWindowDays, 0, 1), 3);

  const itemCompletedEvents = ccoAuditEvents.filter(
    (event) => normalizeText(event?.action).toLowerCase() === 'cco.sprint.item_completed'
  );
  const sprintStartEvents = ccoAuditEvents.filter(
    (event) => normalizeText(event?.action).toLowerCase() === 'cco.sprint.start'
  );
  const sprintCompleteEvents = ccoAuditEvents.filter(
    (event) => normalizeText(event?.action).toLowerCase() === 'cco.sprint.complete'
  );

  const avgResponseTimeHours = average(
    itemCompletedEvents
      .map((event) => toNumber(event?.metadata?.slaAgeHours, NaN))
      .filter((value) => Number.isFinite(value)),
    2
  );

  const draftModeEvents = ccoAuditEvents.filter(
    (event) => normalizeText(event?.action).toLowerCase() === 'cco.draft.mode_selected'
  );
  const followRate = draftModeEvents.length
    ? round(
        clamp(
          draftModeEvents.filter((event) => event?.metadata?.ignoredRecommended !== true).length /
            draftModeEvents.length,
          0,
          1
        ),
        3
      )
    : 0;

  const sprintCompletionRate = sprintStartEvents.length
    ? round(clamp(sprintCompleteEvents.length / sprintStartEvents.length, 0, 1), 3)
    : 0;

  const currentSnapshot = computeWorklistSnapshotMetrics(currentConversationWorklist);
  const previousSnapshot = computeWorklistSnapshotMetrics(previousConversationWorklist);

  const slaBreachTrendPercent = round(
    toTrendPercent(currentSnapshot.slaBreachRate, previousSnapshot.slaBreachRate),
    2
  );
  const complaintTrendPercent = round(
    toTrendPercent(currentSnapshot.complaintRate, previousSnapshot.complaintRate),
    2
  );
  const conversionTrendPercent = round(
    toTrendPercent(currentSnapshot.conversionSignal, previousSnapshot.conversionSignal),
    2
  );

  const highRiskHandledFirstRate = itemCompletedEvents.length
    ? round(
        clamp(
          itemCompletedEvents.filter((event) => {
            const priority = normalizeText(event?.metadata?.priorityLevel).toLowerCase();
            return priority === 'critical' || priority === 'high';
          }).length / itemCompletedEvents.length,
          0,
          1
        ),
        3
      )
    : 0;

  const stressIndex = round(
    clamp(
      currentSnapshot.slaBreachRate * 0.45 +
        currentSnapshot.complaintRate * 0.2 +
        currentSnapshot.frustratedRate * 0.15 +
        clamp(currentSnapshot.unansweredOver48hCount / 10, 0, 1) * 0.2,
      0,
      1
    ),
    3
  );

  const engagementScore = round(
    clamp(
      ccoUsageRate * 0.4 +
        followRate * 0.25 +
        sprintCompletionRate * 0.2 +
        (1 - clamp(avgResponseTimeHours / 24, 0, 1)) * 0.15,
      0,
      1
    ),
    3
  );

  const healthScore = computeHealthScore({
    snapshotMetrics: currentSnapshot,
    avgResponseTimeHours,
    recommendationFollowRate: followRate,
    ccoUsageRate,
    sprintCompletionRate,
  });

  const volatilityIndex = toVolatilityIndex(healthHistory);

  return {
    ccoUsageRate,
    avgResponseTimeHours,
    systemRecommendationFollowRate: followRate,
    ignoredRecommendedRate: round(draftModeEvents.length ? 1 - followRate : 0, 3),
    slaBreachTrend: toTrendLabel(slaBreachTrendPercent),
    slaBreachTrendPercent,
    complaintTrendPercent,
    conversionTrendPercent,
    stressIndex,
    engagementScore,
    sprintCompletionRate,
    complaintRate: round(currentSnapshot.complaintRate, 3),
    conversionSignal: round(currentSnapshot.conversionSignal, 3),
    highRiskHandledFirstRate,
    unansweredOver48hCount: currentSnapshot.unansweredOver48hCount,
    slaBreachRate: round(currentSnapshot.slaBreachRate, 3),
    frustratedCount: currentSnapshot.frustratedCount,
    escalationCount: currentSnapshot.escalationCount,
    healthScore,
    volatilityIndex,
    snapshot: currentSnapshot,
    baselineSnapshot: previousSnapshot,
    activeDays: activeDaySet.size,
    windowDays: safeWindowDays,
  };
}

module.exports = {
  computeUsageAnalytics,
  computeWorklistSnapshotMetrics,
  computeHealthScore,
};

