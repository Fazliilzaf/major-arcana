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

function average(values = []) {
  const list = asArray(values)
    .map((item) => toNumber(item, NaN))
    .filter((item) => Number.isFinite(item));
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function toTrendDirection(percent = 0) {
  if (percent >= 10) return 'rising';
  if (percent <= -10) return 'falling';
  return 'stable';
}

function analyzeMonthlyRisk({
  dailySnapshots = [],
  usageAnalytics = {},
  windowDays = 30,
  generatedAt = new Date().toISOString(),
} = {}) {
  const safeWindowDays = Math.max(7, Math.min(90, Math.round(toNumber(windowDays, 30))));
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};

  const snapshots = asArray(dailySnapshots)
    .slice(-safeWindowDays)
    .filter((item) => item && typeof item === 'object');
  const halfIndex = Math.max(1, Math.floor(snapshots.length / 2));
  const firstHalf = snapshots.slice(0, halfIndex);
  const secondHalf = snapshots.slice(halfIndex);

  const firstBreach = average(firstHalf.map((item) => item.slaBreachRate));
  const secondBreach = average(secondHalf.map((item) => item.slaBreachRate));
  const firstComplaint = average(firstHalf.map((item) => item.complaintRate));
  const secondComplaint = average(secondHalf.map((item) => item.complaintRate));

  const breachTrendPercent = firstBreach > 0
    ? ((secondBreach - firstBreach) / firstBreach) * 100
    : secondBreach > 0
    ? 100
    : 0;
  const complaintTrendPercent = firstComplaint > 0
    ? ((secondComplaint - firstComplaint) / firstComplaint) * 100
    : secondComplaint > 0
    ? 100
    : 0;

  const unresolvedAvg = average(snapshots.map((item) => item.unresolvedCount));
  const unresolvedFactor = clamp(unresolvedAvg / 40, 0, 1, 0);
  const riskIndex = clamp(
    secondBreach * 0.45 + secondComplaint * 0.25 + unresolvedFactor * 0.15 + clamp(safeUsage.volatilityIndex, 0, 1, 0) * 0.15,
    0,
    1,
    0
  );

  const topDrivers = [
    { code: 'sla_breach', impact: round(secondBreach, 3), trendPercent: round(breachTrendPercent, 1) },
    { code: 'complaint_rate', impact: round(secondComplaint, 3), trendPercent: round(complaintTrendPercent, 1) },
    { code: 'unresolved_load', impact: round(unresolvedFactor, 3), trendPercent: 0 },
  ]
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 3);

  const riskLevel = riskIndex >= 0.7 ? 'high' : riskIndex >= 0.45 ? 'medium' : 'low';
  const trendDirection = toTrendDirection((breachTrendPercent + complaintTrendPercent) / 2);
  const confidence = clamp((Math.min(safeWindowDays, snapshots.length) / safeWindowDays) * 0.8 + 0.2, 0, 1, 0);

  return {
    windowDays: safeWindowDays,
    riskLevel,
    riskIndex: round(riskIndex, 3),
    trendDirection,
    breachTrendPercent: round(breachTrendPercent, 1),
    complaintTrendPercent: round(complaintTrendPercent, 1),
    unresolvedAverage: round(unresolvedAvg, 2),
    topDrivers,
    confidence: round(confidence, 3),
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  analyzeMonthlyRisk,
};
