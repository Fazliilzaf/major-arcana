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

function toTrendSlope(values = []) {
  const series = asArray(values)
    .map((item) => toNumber(item, NaN))
    .filter((item) => Number.isFinite(item));
  if (series.length <= 1) return 0;
  return (series[series.length - 1] - series[0]) / (series.length - 1);
}

function resolveRiskForecast(projectedHealthScore = 100, volatilityIndex = 0) {
  const health = clamp(projectedHealthScore, 0, 100, 100);
  const volatility = clamp(volatilityIndex, 0, 1, 0);
  const riskScore = clamp((100 - health) / 100 * 0.75 + volatility * 0.25, 0, 1, 0);
  const level = riskScore >= 0.7 ? 'high' : riskScore >= 0.45 ? 'medium' : 'low';
  return {
    level,
    score: round(riskScore, 3),
    projectedHealthScore: round(health, 1),
  };
}

function resolveCapacityForecast({ backlogCount = 0, avgResponseTimeHours = 0, complaintRate = 0 } = {}) {
  const safeBacklog = Math.max(0, toNumber(backlogCount, 0));
  const safeResponse = Math.max(0, toNumber(avgResponseTimeHours, 0));
  const safeComplaintRate = clamp(complaintRate, 0, 1, 0);
  const loadScore = clamp(
    clamp(safeBacklog / 40, 0, 1, 0) * 0.5 +
      clamp(safeResponse / 24, 0, 1, 0) * 0.35 +
      safeComplaintRate * 0.15,
    0,
    1,
    0
  );

  let state = 'comfortable';
  if (loadScore >= 0.65) state = 'strained';
  else if (loadScore >= 0.4) state = 'balanced';

  return {
    state,
    loadScore: round(loadScore, 3),
    backlogCount: safeBacklog,
  };
}

function resolvePreparationActions({ riskForecast = null, capacityForecast = null } = {}) {
  const riskLevel = normalizeText(riskForecast?.level).toLowerCase();
  const capacityState = normalizeText(capacityForecast?.state).toLowerCase();
  const actions = [];

  if (riskLevel === 'high') {
    actions.push('Prioritera High/Critical och SLA-breach kommande 48h.');
  } else if (riskLevel === 'medium') {
    actions.push('Håll fokus på obesvarade med högst prioritet varje morgon.');
  }

  if (capacityState === 'strained') {
    actions.push('Aktivera sprintläge och håll fokuslistan till max 3 ärenden åt gången.');
  } else if (capacityState === 'balanced') {
    actions.push('Fördela svarspass i två block under öppettid för stabil genomströmning.');
  }

  if (!actions.length) {
    actions.push('Nuvarande trend är stabil. Fortsätt med nuvarande prioriteringsordning.');
  }

  return actions.slice(0, 3);
}

function evaluateForwardOutlook({
  healthHistory = [],
  dailySnapshots = [],
  usageAnalytics = {},
  horizonDays = 7,
  generatedAt = new Date().toISOString(),
} = {}) {
  const safeHorizonDays = Math.max(1, Math.min(30, Math.round(toNumber(horizonDays, 7))));
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};

  const scoreSeries = asArray(healthHistory)
    .map((point) => toNumber(point?.score, NaN))
    .filter((score) => Number.isFinite(score));
  const fallbackFromDaily = asArray(dailySnapshots)
    .map((item) => toNumber(item?.healthScore, NaN))
    .filter((score) => Number.isFinite(score));

  const effectiveSeries = scoreSeries.length ? scoreSeries : fallbackFromDaily;
  const latestScore = effectiveSeries.length ? effectiveSeries[effectiveSeries.length - 1] : 75;
  const slopePerDay = toTrendSlope(effectiveSeries);
  const projectedHealthScore = clamp(latestScore + slopePerDay * safeHorizonDays, 0, 100, latestScore);
  const volatilityIndex = clamp(
    safeUsage.volatilityIndex,
    0,
    1,
    clamp(Math.abs(slopePerDay) / 8, 0, 1, 0)
  );

  const latestSnapshot = asArray(dailySnapshots).slice(-1)[0] || {};
  const capacityForecast = resolveCapacityForecast({
    backlogCount: latestSnapshot.unresolvedCount ?? safeUsage?.snapshot?.unresolvedCount ?? 0,
    avgResponseTimeHours: safeUsage.avgResponseTimeHours,
    complaintRate: latestSnapshot.complaintRate ?? safeUsage.complaintRate ?? 0,
  });
  const riskForecast = resolveRiskForecast(projectedHealthScore, volatilityIndex);
  const recommendedPreparation = resolvePreparationActions({
    riskForecast,
    capacityForecast,
  });

  const confidence = clamp(
    (Math.min(14, effectiveSeries.length) / 14) * 0.7 + (1 - volatilityIndex) * 0.3,
    0,
    1,
    0
  );

  return {
    horizonDays: safeHorizonDays,
    riskForecast,
    capacityForecast,
    recommendedPreparation,
    volatilityIndex: round(volatilityIndex, 3),
    confidence: round(confidence, 3),
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  evaluateForwardOutlook,
};
