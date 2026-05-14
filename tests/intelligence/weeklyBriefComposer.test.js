const test = require('node:test');
const assert = require('node:assert/strict');

const { composeWeeklyBrief } = require('../../src/intelligence/weeklyBriefComposer');

test('composeWeeklyBrief switches to focus structure when focus mode is active', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 58,
      avgResponseTimeHours: 10.2,
      systemRecommendationFollowRate: 0.61,
      slaBreachTrend: '+14%',
      volatilityIndex: 0.62,
    },
    redFlagState: {
      isActive: true,
      delta: -12,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
      recommendedAction: 'Prioritera high-risk ärenden 48h',
      severity: 'high',
    },
    adaptiveFocusState: { isActive: true },
  });

  assert.equal(result.mode, 'focus');
  assert.equal(result.focusActive, true);
  assert.equal(result.structureOrder[0], 'stabilization_actions');
  assert.equal(result.recommendations.length <= 3, true);
});

test('composeWeeklyBrief keeps normal structure when focus is inactive', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 84,
      avgResponseTimeHours: 5.1,
      systemRecommendationFollowRate: 0.77,
      slaBreachTrend: '-10%',
      volatilityIndex: 0.25,
    },
    adaptiveFocusState: { isActive: false },
    redFlagState: { isActive: false },
  });

  assert.equal(result.mode, 'normal');
  assert.equal(result.structureOrder[0], 'strategic_signals');
});

test('composeWeeklyBrief labels drivers from threat codes when red flag omits primaryDrivers', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 60,
      avgResponseTimeHours: 9,
      systemRecommendationFollowRate: 0.5,
      slaBreachTrend: '+5%',
      volatilityIndex: 0.5,
    },
    redFlagState: { isActive: true, primaryDrivers: [], severity: 'high' },
    adaptiveFocusState: { isActive: false },
    businessThreats: {
      threats: [{ code: 'sla_drift', recommendedAction: 'Minska SLA-backlog.' }],
    },
  });

  assert.equal(result.focusActive, true);
  assert.ok(result.primaryDrivers.some((d) => d.includes('sla')));
});

test('composeWeeklyBrief merges outlook and scenario recommendations in normal mode', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 82,
      avgResponseTimeHours: 5,
      systemRecommendationFollowRate: 0.8,
      slaBreachTrend: '0%',
      volatilityIndex: 0.2,
    },
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
    forwardOutlook: { recommendedPreparation: ['Morgonblock för triage.'] },
    scenarioAnalysis: { recommendedScenario: { recommendedAction: 'Behåll baslinjerytm.' } },
  });

  assert.equal(result.mode, 'normal');
  assert.ok(result.recommendations.length >= 1);
  assert.ok(result.recommendations.some((r) => /triage|baslinj/i.test(r)));
});

test('composeWeeklyBrief tolerates null usageAnalytics', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: null,
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
    generatedAt: '2026-06-01T08:00:00.000Z',
  });

  assert.equal(result.mode, 'normal');
  assert.ok(result.metrics.some((m) => m.label === 'Health Score'));
  assert.equal(result.generatedAt, '2026-06-01T08:00:00.000Z');
});

test('composeWeeklyBrief uses monthly risk severity when red flag omits severity', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 80 },
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
    monthlyRisk: { riskLevel: 'high' },
  });

  assert.equal(result.severity, 'high');
});

test('composeWeeklyBrief trims generatedAt and normalizes unknown severity to lowercase string', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 80 },
    redFlagState: { isActive: false, severity: ' CRITICAL ' },
    adaptiveFocusState: { isActive: false },
    generatedAt: ' 2026-06-01T08:00:00.000Z ',
  });
  assert.equal(result.generatedAt, '2026-06-01T08:00:00.000Z');
  assert.equal(result.severity, 'critical');
});

test('composeWeeklyBrief caps and formats percentage metrics safely', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 999,
      avgResponseTimeHours: -10,
      systemRecommendationFollowRate: 9,
      slaBreachTrend: '',
      volatilityIndex: -1,
    },
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
  });
  const metricMap = Object.fromEntries(result.metrics.map((m) => [m.label, m.value]));
  assert.equal(metricMap['Health Score'], '100');
  assert.equal(metricMap['Snitt-svarstid'], '0h');
  assert.equal(metricMap['Följer rekommendation'], '100%');
  assert.equal(metricMap['SLA-trend'], '0%');
  assert.equal(metricMap['Volatilitet'], '0');
});

test('composeWeeklyBrief limits primary drivers to four normalized labels', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {},
    redFlagState: {
      isActive: true,
      primaryDrivers: [
        'SLA_BREACH',
        'complaint_spike',
        'tone_escalation',
        'conversion_drop',
        'ignored_extra',
      ],
    },
    adaptiveFocusState: { isActive: false },
  });
  assert.equal(result.primaryDrivers.length, 4);
  assert.equal(result.primaryDrivers[0], 'sla breach');
  assert.equal(result.primaryDrivers[1], 'complaint spike');
});

test('composeWeeklyBrief enters focus mode when only adaptiveFocus is active', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 72 },
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: true },
  });
  assert.equal(result.mode, 'focus');
  assert.equal(result.focusActive, true);
  assert.equal(result.structureOrder[0], 'stabilization_actions');
});

test('composeWeeklyBrief focus summary prefixes positive redFlag delta with plus', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 80 },
    redFlagState: { isActive: true, delta: 4, primaryDrivers: ['sla_breach'] },
    adaptiveFocusState: { isActive: false },
  });
  assert.match(result.summary, /\+4 på 48h/);
});

test('composeWeeklyBrief focus summary uses okända drivare when no primary or threat codes', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {},
    redFlagState: { isActive: true, delta: -2, primaryDrivers: [] },
    adaptiveFocusState: { isActive: false },
    businessThreats: { threats: [] },
  });
  assert.ok(/okända drivare/i.test(result.summary));
});

test('composeWeeklyBrief tolerates null businessThreats in focus mode', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 70 },
    redFlagState: { isActive: true, delta: -1, primaryDrivers: ['complaint_spike'] },
    adaptiveFocusState: { isActive: false },
    businessThreats: null,
  });
  assert.equal(result.mode, 'focus');
  assert.ok(result.primaryDrivers.some((d) => d.includes('complaint')));
});

test('composeWeeklyBrief default severity medium when red flag and monthly omit levels', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: { healthScore: 75 },
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
    monthlyRisk: {},
  });
  assert.equal(result.severity, 'medium');
});

