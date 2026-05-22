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

function resolvePreviousHealthScore48h(history = [], nowMs = Date.now()) {
  const thresholdMs = nowMs - 48 * 60 * 60 * 1000;
  const candidates = asArray(history)
    .map((point) => ({
      tsMs: toTimestampMs(point?.ts),
      score: toNumber(point?.score, NaN),
    }))
    .filter((point) => Number.isFinite(point.tsMs) && Number.isFinite(point.score))
    .filter((point) => point.tsMs <= thresholdMs)
    .sort((left, right) => right.tsMs - left.tsMs);
  if (!candidates.length) return null;
  return candidates[0].score;
}

function resolveClusterSignals(clusterSignals = {}, usageMetrics = {}) {
  const source =
    clusterSignals && typeof clusterSignals === 'object' && !Array.isArray(clusterSignals)
      ? clusterSignals
      : {};
  const metrics =
    usageMetrics && typeof usageMetrics === 'object' && !Array.isArray(usageMetrics)
      ? usageMetrics
      : {};

  const slaBreachRateUp =
    source.slaBreachRateUp === true ||
    toNumber(source.slaBreachTrendPercent, toNumber(metrics.slaBreachTrendPercent, 0)) > 0;
  const complaintSpike =
    source.complaintSpike === true ||
    toNumber(source.complaintTrendPercent, toNumber(metrics.complaintTrendPercent, 0)) > 0;
  const conversionDrop =
    source.conversionDrop === true ||
    toNumber(source.conversionTrendPercent, toNumber(metrics.conversionTrendPercent, 0)) < 0;
  const volatilityValue = toNumber(source.volatilityIndex, toNumber(metrics.volatilityIndex, 0));
  const volatilityHigh = volatilityValue > 0.6;

  return {
    slaBreachRateUp,
    complaintSpike,
    conversionDrop,
    volatilityHigh,
    volatilityIndex: round(volatilityValue, 3),
  };
}

function toRecommendedAction(primaryDrivers = []) {
  const drivers = asArray(primaryDrivers).map((item) => normalizeText(item).toLowerCase());
  const hasSla = drivers.includes('sla_breach');
  const hasComplaint = drivers.includes('complaint_spike');
  const hasConversion = drivers.includes('conversion_drop');
  if (hasSla && hasComplaint) return 'Prioritera high-risk ärenden kommande 48h.';
  if (hasSla) return 'Säkra svar inom SLA för High/Critical först.';
  if (hasComplaint) return 'Prioritera complaint-svar med professionellt svarsläge.';
  if (hasConversion) return 'Fokusera på bokningsflöde och tydlig CTA.';
  return 'Stabilisera arbetsflödet med fokus på kritiska ärenden.';
}

function evaluateRedFlag({
  healthHistory = [],
  currentHealthScore = 100,
  previousHealthScore48h = null,
  clusterSignals = {},
  usageMetrics = {},
  nowMs = Date.now(),
} = {}) {
  const safeNowMs = Number.isFinite(toNumber(nowMs, NaN)) ? toNumber(nowMs, Date.now()) : Date.now();
  const currentScore = round(toNumber(currentHealthScore, 100), 2);
  const hasExplicitPreviousScore =
    previousHealthScore48h !== null &&
    previousHealthScore48h !== undefined &&
    Number.isFinite(Number(previousHealthScore48h));
  const baselineScore =
    hasExplicitPreviousScore
      ? toNumber(previousHealthScore48h, currentScore)
      : resolvePreviousHealthScore48h(healthHistory, safeNowMs) ?? currentScore;
  const delta = round(currentScore - baselineScore, 2);

  const rapidDropTriggered = delta <= -10;
  const criticalThresholdTriggered = currentScore < 60;

  const cluster = resolveClusterSignals(clusterSignals, usageMetrics);
  const activeClusterSignals = [
    cluster.slaBreachRateUp ? 'sla_breach' : '',
    cluster.complaintSpike ? 'complaint_spike' : '',
    cluster.conversionDrop ? 'conversion_drop' : '',
    cluster.volatilityHigh ? 'volatility' : '',
  ].filter(Boolean);
  const clusterTriggered = activeClusterSignals.length >= 2;

  const isActive = rapidDropTriggered || criticalThresholdTriggered || clusterTriggered;

  let triggerType = '';
  if (rapidDropTriggered) triggerType = 'rapid_drop';
  else if (criticalThresholdTriggered) triggerType = 'critical_threshold';
  else if (clusterTriggered) triggerType = 'cluster';

  const primaryDrivers = [];
  if (rapidDropTriggered) primaryDrivers.push('health_drop');
  activeClusterSignals.forEach((driver) => {
    if (!primaryDrivers.includes(driver)) primaryDrivers.push(driver);
  });
  if (!primaryDrivers.length && criticalThresholdTriggered) primaryDrivers.push('health_threshold');

  const severity = (() => {
    if (!isActive) return 'none';
    if (currentScore < 50) return 'high';
    if (delta <= -15) return 'high';
    if (activeClusterSignals.length >= 3) return 'high';
    return 'medium';
  })();

  return {
    isActive,
    triggerType: triggerType || 'none',
    delta,
    baselineHealthScore48h: round(baselineScore, 2),
    currentHealthScore: round(currentScore, 2),
    primaryDrivers,
    recommendedAction: isActive ? toRecommendedAction(primaryDrivers) : '',
    severity,
    clusterSignals: cluster,
    clusterTriggered,
    criticalThresholdTriggered,
    rapidDropTriggered,
  };
}

module.exports = {
  evaluateRedFlag,
};
