const {
  computeHealthScore,
  computeWorklistSnapshotMetrics,
} = require('./usageAnalyticsEngine');
const { composeWeeklyBrief } = require('./weeklyBriefComposer');
const { analyzeMonthlyRisk } = require('./monthlyRiskAnalyzer');
const { analyzeBusinessThreats } = require('./businessThreatAnalyzer');
const { evaluateForwardOutlook } = require('./forwardOutlookEngine');
const { evaluateScenarioEngine } = require('./scenarioEngine');

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

function toDayKey(value) {
  const ts = toTimestampMs(value);
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function round(value, precision = 3) {
  const factor = 10 ** Math.max(0, toNumber(precision, 3));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function buildDailySnapshotsFromAnalysisEntries({
  analysisEntries = [],
  usageAnalytics = {},
  windowDays = 35,
} = {}) {
  const safeWindowDays = Math.max(7, Math.min(90, Math.round(toNumber(windowDays, 35))));
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};
  const followRate = Math.max(0, Math.min(1, toNumber(safeUsage.systemRecommendationFollowRate, 0.5)));
  const usageRate = Math.max(0, Math.min(1, toNumber(safeUsage.ccoUsageRate, 0.5)));
  const sprintRate = Math.max(0, Math.min(1, toNumber(safeUsage.sprintCompletionRate, 0.5)));
  const avgResponse = Math.max(0, toNumber(safeUsage.avgResponseTimeHours, 8));

  const groupedByDay = new Map();
  const sortedEntries = asArray(analysisEntries)
    .filter((entry) => entry && typeof entry === 'object')
    .slice()
    .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));

  for (const entry of sortedEntries) {
    const dayKey = toDayKey(entry?.ts);
    if (!dayKey) continue;
    groupedByDay.set(dayKey, entry);
  }

  return Array.from(groupedByDay.entries())
    .slice(-safeWindowDays)
    .map(([dayKey, entry]) => {
      const worklist = asArray(entry?.output?.data?.conversationWorklist);
      const snapshot = computeWorklistSnapshotMetrics(worklist);
      const healthScore = computeHealthScore({
        snapshotMetrics: snapshot,
        avgResponseTimeHours: avgResponse,
        recommendationFollowRate: followRate,
        ccoUsageRate: usageRate,
        sprintCompletionRate: sprintRate,
      });
      return {
        dayKey,
        ts: normalizeText(entry?.ts) || `${dayKey}T12:00:00.000Z`,
        healthScore,
        unresolvedCount: snapshot.unresolvedCount,
        slaBreachRate: snapshot.slaBreachRate,
        complaintRate: snapshot.complaintRate,
      };
    });
}

function buildHealthHistory(dailySnapshots = []) {
  return asArray(dailySnapshots)
    .map((item) => {
      const ts = toIso(item?.ts || item?.dayKey);
      if (!ts) return null;
      return {
        ts,
        score: Math.max(0, Math.min(100, toNumber(item?.healthScore, 0))),
        slaBreachRate: round(Math.max(0, Math.min(1, toNumber(item?.slaBreachRate, 0))), 4),
      };
    })
    .filter(Boolean)
    .slice(-30);
}

function inferUsageAnalytics({ usageAnalytics = {}, dailySnapshots = [], conversationWorklist = [] } = {}) {
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};
  if (Object.keys(safeUsage).length > 0) return safeUsage;

  const safeDaily = asArray(dailySnapshots);
  const safeWorklist = asArray(conversationWorklist);
  const snapshot = computeWorklistSnapshotMetrics(safeWorklist);
  const activeDays = safeDaily.length;
  const healthScore = safeDaily.length
    ? toNumber(safeDaily[safeDaily.length - 1]?.healthScore, 75)
    : computeHealthScore({
        snapshotMetrics: snapshot,
        avgResponseTimeHours: 8,
        recommendationFollowRate: 0.5,
        ccoUsageRate: 0.5,
        sprintCompletionRate: 0.5,
      });
  return {
    ccoUsageRate: round(Math.max(0, Math.min(1, activeDays / 14)), 3),
    avgResponseTimeHours: 8,
    systemRecommendationFollowRate: 0.5,
    sprintCompletionRate: 0.5,
    complaintRate: snapshot.complaintRate,
    slaBreachRate: snapshot.slaBreachRate,
    slaBreachTrend: '0%',
    slaBreachTrendPercent: 0,
    complaintTrendPercent: 0,
    conversionTrendPercent: 0,
    conversionSignal: snapshot.conversionSignal,
    volatilityIndex: 0.2,
    healthScore: Math.round(healthScore),
    snapshot,
  };
}

function evaluateStrategicInsights({
  analysisEntries = [],
  usageAnalytics = {},
  redFlagState = {},
  adaptiveFocusState = {},
  recoveryState = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const sortedEntries = asArray(analysisEntries)
    .filter((entry) => entry && typeof entry === 'object')
    .slice()
    .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));
  const latestEntry = sortedEntries[sortedEntries.length - 1] || null;
  const conversationWorklist = asArray(latestEntry?.output?.data?.conversationWorklist);
  const dailySnapshots = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: sortedEntries,
    usageAnalytics,
    windowDays: 35,
  });
  const effectiveUsageAnalytics = inferUsageAnalytics({
    usageAnalytics,
    dailySnapshots,
    conversationWorklist,
  });
  const healthHistory = buildHealthHistory(dailySnapshots);

  const monthlyRisk = analyzeMonthlyRisk({
    dailySnapshots,
    usageAnalytics: effectiveUsageAnalytics,
    windowDays: 30,
    generatedAt,
  });
  const businessThreats = analyzeBusinessThreats({
    usageAnalytics: effectiveUsageAnalytics,
    monthlyRisk,
    worklist: conversationWorklist,
    generatedAt,
  });
  const forwardOutlook = evaluateForwardOutlook({
    healthHistory,
    dailySnapshots,
    usageAnalytics: effectiveUsageAnalytics,
    horizonDays: 7,
    generatedAt,
  });
  const scenarioAnalysis = evaluateScenarioEngine({
    usageAnalytics: effectiveUsageAnalytics,
    monthlyRisk,
    businessThreats,
    forwardOutlook,
    worklist: conversationWorklist,
    generatedAt,
  });
  const weeklyBrief = composeWeeklyBrief({
    usageAnalytics: effectiveUsageAnalytics,
    redFlagState,
    adaptiveFocusState,
    monthlyRisk,
    businessThreats,
    forwardOutlook,
    scenarioAnalysis,
    generatedAt,
  });

  return {
    weeklyBrief,
    monthlyRisk,
    scenarioAnalysis,
    businessThreats,
    forwardOutlook,
    recoveryState:
      recoveryState && typeof recoveryState === 'object' ? recoveryState : {},
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  buildDailySnapshotsFromAnalysisEntries,
  evaluateStrategicInsights,
};

