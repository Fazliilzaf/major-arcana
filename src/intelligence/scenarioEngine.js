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

function toScenarioProbability(score = 0) {
  return round(clamp(score, 0, 1, 0), 3);
}

function evaluateScenarioEngine({
  usageAnalytics = {},
  monthlyRisk = {},
  businessThreats = {},
  forwardOutlook = {},
  worklist = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const safeUsage = usageAnalytics && typeof usageAnalytics === 'object' ? usageAnalytics : {};
  const safeMonthlyRisk = monthlyRisk && typeof monthlyRisk === 'object' ? monthlyRisk : {};
  const safeThreats = businessThreats && typeof businessThreats === 'object' ? businessThreats : {};
  const safeOutlook = forwardOutlook && typeof forwardOutlook === 'object' ? forwardOutlook : {};
  const safeWorklist = asArray(worklist).filter((item) => item && typeof item === 'object');

  const unresolvedCount = safeWorklist.filter(
    (row) => normalizeText(row?.needsReplyStatus).toLowerCase() !== 'handled'
  ).length;
  const complaintRate = clamp(safeUsage.complaintRate, 0, 1, 0);
  const volatilityIndex = clamp(
    safeUsage.volatilityIndex,
    0,
    1,
    clamp(safeOutlook.volatilityIndex, 0, 1, 0)
  );
  const monthlyRiskIndex = clamp(safeMonthlyRisk.riskIndex, 0, 1, 0);
  const strategicFlag = safeThreats.strategicFlag === true;

  const stabilizeScore = clamp(
    monthlyRiskIndex * 0.5 + volatilityIndex * 0.3 + clamp(unresolvedCount / 30, 0, 1, 0) * 0.2,
    0,
    1,
    0
  );
  const baselineScore = clamp(
    (1 - monthlyRiskIndex) * 0.45 + (1 - volatilityIndex) * 0.35 + (1 - complaintRate) * 0.2,
    0,
    1,
    0
  );
  const stressScore = clamp(
    monthlyRiskIndex * 0.45 +
      complaintRate * 0.25 +
      volatilityIndex * 0.2 +
      (strategicFlag ? 0.1 : 0),
    0,
    1,
    0
  );

  const scenarios = [
    {
      id: 'stabilization_48h',
      title: 'Stabiliseringsspår (48h)',
      probability: toScenarioProbability(stabilizeScore),
      impact: stabilizeScore >= 0.65 ? 'high' : stabilizeScore >= 0.4 ? 'medium' : 'low',
      recommendedAction:
        'Prioritera High/Critical, svara inom SLA och håll fokuslistan till max 3 aktiva trådar.',
    },
    {
      id: 'baseline_operation',
      title: 'Baslinjedrift',
      probability: toScenarioProbability(baselineScore),
      impact: baselineScore >= 0.65 ? 'high' : baselineScore >= 0.4 ? 'medium' : 'low',
      recommendedAction:
        'Fortsätt normal prioriteringsordning och följ rekommenderat svarsläge för varje intent.',
    },
    {
      id: 'stress_escalation',
      title: 'Eskaleringsrisk',
      probability: toScenarioProbability(stressScore),
      impact: stressScore >= 0.65 ? 'high' : stressScore >= 0.4 ? 'medium' : 'low',
      recommendedAction:
        'Säkra complaints samma dag och minska backlog med korta sprintpass under öppettid.',
    },
  ];

  const recommendedScenario = scenarios
    .slice()
    .sort((left, right) => right.probability - left.probability)[0];
  const confidence = round(
    clamp((1 - Math.abs(stabilizeScore - stressScore)) * 0.4 + (1 - volatilityIndex) * 0.6, 0, 1, 0),
    3
  );

  return {
    scenarios,
    recommendedScenario,
    confidence,
    generatedAt: normalizeText(generatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  evaluateScenarioEngine,
};

