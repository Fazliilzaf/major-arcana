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

function round(value, precision = 1) {
  const factor = 10 ** Math.max(0, toNumber(precision, 1));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function toDriverLabels(drivers = []) {
  return asArray(drivers)
    .map((item) => normalizeText(item).toLowerCase().replace(/_/g, ' '))
    .filter(Boolean)
    .slice(0, 4);
}

function toPercent(value = 0) {
  return `${Math.round(clamp(value, 0, 1, 0) * 100)}%`;
}

function composeWeeklyBrief({
  usageAnalytics = {},
  redFlagState = {},
  adaptiveFocusState = {},
  monthlyRisk = {},
  businessThreats = {},
  forwardOutlook = {},
  scenarioAnalysis = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};
  const safeRedFlag = redFlagState && typeof redFlagState === 'object' ? redFlagState : {};
  const safeFocus = adaptiveFocusState && typeof adaptiveFocusState === 'object' ? adaptiveFocusState : {};
  const safeMonthlyRisk = monthlyRisk && typeof monthlyRisk === 'object' ? monthlyRisk : {};
  const safeThreats = businessThreats && typeof businessThreats === 'object' ? businessThreats : {};
  const safeOutlook = forwardOutlook && typeof forwardOutlook === 'object' ? forwardOutlook : {};
  const safeScenarios = scenarioAnalysis && typeof scenarioAnalysis === 'object' ? scenarioAnalysis : {};

  const focusActive = safeFocus.isActive === true || safeRedFlag.isActive === true;
  const primaryDrivers = toDriverLabels(
    asArray(safeRedFlag.primaryDrivers).length
      ? safeRedFlag.primaryDrivers
      : asArray(safeThreats.threats).map((item) => item?.code)
  );

  const healthScore = Math.round(clamp(safeUsage.healthScore, 0, 100, 75));
  const responseHours = round(Math.max(0, toNumber(safeUsage.avgResponseTimeHours, 0)), 1);
  const followRate = toPercent(safeUsage.systemRecommendationFollowRate);
  const breachTrend = normalizeText(safeUsage.slaBreachTrend) || '0%';
  const volatility = round(clamp(safeUsage.volatilityIndex, 0, 1, 0), 2);

  const focusRecommendations = [
    normalizeText(safeRedFlag.recommendedAction),
    ...asArray(safeOutlook.recommendedPreparation).map((item) => normalizeText(item)),
    ...asArray(safeThreats.threats).map((item) => normalizeText(item?.recommendedAction)),
  ]
    .filter(Boolean)
    .slice(0, 3);

  const defaultRecommendations = [
    ...asArray(safeOutlook.recommendedPreparation).map((item) => normalizeText(item)),
    ...asArray(safeThreats.threats).map((item) => normalizeText(item?.recommendedAction)),
    normalizeText(safeScenarios.recommendedScenario?.recommendedAction),
  ]
    .filter(Boolean)
    .slice(0, 5);

  const recommendations = focusActive ? focusRecommendations : defaultRecommendations;
  const structureOrder = focusActive
    ? ['stabilization_actions', 'impacted_kpis', 'risk_drivers', 'secondary_improvements']
    : ['strategic_signals', 'operational_improvements', 'effect_metrics', 'long_term_trend'];

  const headline = focusActive
    ? 'Under kommande 48h bör fokus ligga på stabilisering.'
    : 'Veckoläget är stabilt med fokus på kvalitet och genomströmning.';

  const summary = focusActive
    ? `Health Score ${Math.round(toNumber(safeRedFlag.delta, 0)) >= 0 ? '+' : ''}${Math.round(
        toNumber(safeRedFlag.delta, 0)
      )} på 48h. Primära drivare: ${primaryDrivers.join(' + ') || 'okända drivare'}.`
    : `Health Score ${healthScore}. SLA-trend ${breachTrend}. Volatilitet ${volatility}.`;

  return {
    mode: focusActive ? 'focus' : 'normal',
    structureOrder,
    headline,
    summary,
    recommendations,
    metrics: [
      { label: 'Health Score', value: String(healthScore) },
      { label: 'Snitt-svarstid', value: `${responseHours}h` },
      { label: 'Följer rekommendation', value: followRate },
      { label: 'SLA-trend', value: breachTrend },
      { label: 'Volatilitet', value: String(volatility) },
    ],
    primaryDrivers,
    severity: normalizeText(safeRedFlag.severity || safeMonthlyRisk.riskLevel || 'medium').toLowerCase(),
    focusActive,
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  composeWeeklyBrief,
};

