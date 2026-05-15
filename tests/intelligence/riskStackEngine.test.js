const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateRiskStack, normalizeRiskKind } = require('../../src/intelligence/riskStackEngine');

test('riskStackEngine: SLA breach always forces miss-risk as dominant', () => {
  const result = evaluateRiskStack({
    slaStatus: 'breach',
    tone: 'positive',
    toneConfidence: 0.9,
    followUpSuggested: false,
    relationshipStatus: 'new',
  });

  assert.equal(result.dominantRisk, 'miss');
  assert.equal(result.weightedScore, 1);
  assert.equal(result.explanation.includes('SLA'), true);
});

test('riskStackEngine: tone-risk dominates when frustrated tone is strong', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'frustrated',
    toneConfidence: 0.95,
    followUpSuggested: false,
    relationshipStatus: 'new',
    isUnanswered: false,
  });

  assert.equal(result.dominantRisk, 'tone');
  assert.equal(result.weightedScore > 0.6, true);
});

test('riskStackEngine: follow-up risk dominates for stagnated follow-up case', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'neutral',
    followUpSuggested: true,
    stagnated: true,
    lifecycleState: 'FOLLOW_UP_PENDING',
    hoursSinceInbound: 72,
    relationshipStatus: 'new',
  });

  assert.equal(result.dominantRisk, 'follow_up');
  assert.equal(result.recommendedAction.toLowerCase().includes('uppfolj'), true);
});

test('riskStackEngine: relationship risk dominates for loyal anxious customer', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'anxious',
    toneConfidence: 0.3,
    followUpSuggested: false,
    relationshipStatus: 'loyal',
    interactionCount: 9,
    isUnanswered: false,
  });

  assert.equal(result.dominantRisk, 'relationship');
  assert.equal(result.explanation.toLowerCase().includes('relation'), true);
});

test('riskStackEngine: low combined signal resolves to neutral', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'positive',
    toneConfidence: 0.2,
    followUpSuggested: false,
    relationshipStatus: 'new',
    isUnanswered: false,
    hoursSinceInbound: 1,
  });

  assert.equal(result.dominantRisk, 'neutral');
  assert.equal(result.weightedScore < 0.2, true);
});

test('riskStackEngine: history-driven reschedule signal strengthens follow-up action', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'neutral',
    followUpSuggested: true,
    lifecycleState: 'FOLLOW_UP_PENDING',
    hoursSinceInbound: 30,
    relationshipStatus: 'new',
    historySignals: {
      pattern: 'reschedule',
      summary: 'Historik visar återkommande ombokning över flera mailboxar.',
      actionCue: 'Skicka två konkreta tider direkt och be kunden välja i samma svar.',
      mailboxCount: 2,
      recentMessageCount: 4,
    },
  });

  assert.equal(result.dominantRisk, 'follow_up');
  assert.equal(result.explanation.includes('Historik visar återkommande ombokning'), true);
  assert.equal(result.recommendedAction.includes('två konkreta tider'), true);
});

test('riskStackEngine: outcome cue overrides generic follow-up action when previous no-response exists', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'neutral',
    followUpSuggested: true,
    lifecycleState: 'FOLLOW_UP_PENDING',
    hoursSinceInbound: 30,
    relationshipStatus: 'new',
    historySignals: {
      pattern: 'none',
      outcomeCode: 'no_response',
      outcomeSummary: 'Tidigare utfall: tidigare liknande tråd tappade fart utan svar.',
      outcomeActionCue: 'Gör CTA binär och tidsatt.',
    },
  });

  assert.equal(result.dominantRisk, 'follow_up');
  assert.equal(result.explanation.includes('tappade fart utan svar'), true);
  assert.equal(result.recommendedAction.includes('CTA binär och tidsatt'), true);
});

test('riskStackEngine: calibration cue steers action when repeated negative follow-up pattern exists', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'neutral',
    followUpSuggested: true,
    lifecycleState: 'FOLLOW_UP_PENDING',
    hoursSinceInbound: 30,
    relationshipStatus: 'new',
    historySignals: {
      pattern: 'none',
      calibrationSummary: 'Utfallshistorik: varm ton gav bäst resultat, men uteblivet svar återkommer i liknande trådar.',
      calibrationActionCue: 'Behåll varm ton men stäng nästa steg tydligt.',
      negativeOutcomeCount: 2,
      dominantFailureOutcome: 'no_response',
    },
  });

  assert.equal(result.dominantRisk, 'follow_up');
  assert.equal(result.explanation.includes('Utfallshistorik'), true);
  assert.equal(result.recommendedAction.includes('varm ton'), true);
});

test('riskStackEngine: explicit risk overrides are clamped and can force dominant risk', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    missRisk: -5,
    toneRisk: 3,
    followUpRisk: 0.1,
    relationshipRisk: 0.1,
  });

  assert.equal(result.breakdown.missRisk, 0);
  assert.equal(result.breakdown.toneRisk, 1);
  assert.equal(result.dominantRisk, 'tone');
  assert.equal(result.weightedScore, 0.8);
});

test('riskStackEngine: breach explanation/action prefer history cue for miss risk', () => {
  const result = evaluateRiskStack({
    slaStatus: 'breach',
    historySignals: {
      actionCue: 'Skicka kort ursäkt och tydlig lösning nu.',
    },
  });

  assert.equal(result.dominantRisk, 'miss');
  assert.equal(result.recommendedAction.includes('Skicka kort ursäkt'), true);
  assert.equal(result.recommendedAction.includes('Svara omedelbart'), true);
});

test('riskStackEngine: unknown history fields normalize to neutral fallbacks', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'positive',
    historySignals: {
      pattern: 'weird',
      outcomeCode: 'other',
      dominantFailureOutcome: 'n/a',
      dominantFailureRisk: 'other',
      mailboxCount: -10,
      recentMessageCount: 'x',
      negativeOutcomeCount: -2,
    },
  });

  assert.equal(result.breakdown.followUpRisk < 0.25, true);
  assert.equal(result.breakdown.relationshipRisk < 0.25, true);
  assert.equal(result.dominantRisk, 'neutral');
});

test('normalizeRiskKind mappar okanda varden till neutral', () => {
  assert.equal(normalizeRiskKind(''), 'neutral');
  assert.equal(normalizeRiskKind('unknown_kind'), 'neutral');
});

test('normalizeRiskKind icke-sträng mappas till neutral', () => {
  assert.equal(normalizeRiskKind(null), 'neutral');
  assert.equal(normalizeRiskKind(undefined), 'neutral');
  assert.equal(normalizeRiskKind(999), 'neutral');
});

test('normalizeRiskKind ar case-insensitive', () => {
  assert.equal(normalizeRiskKind('MISS'), 'miss');
  assert.equal(normalizeRiskKind('Tone'), 'tone');
  assert.equal(normalizeRiskKind('FOLLOW_UP'), 'follow_up');
});

test('riskStackEngine: SLA warning med obesvarad tråd driver miss som dominant', () => {
  const result = evaluateRiskStack({
    slaStatus: 'warning',
    isUnanswered: true,
    hoursSinceInbound: 48,
    unansweredThresholdHours: 24,
    tone: 'positive',
    followUpSuggested: false,
    relationshipStatus: 'new',
  });
  assert.equal(result.dominantRisk, 'miss');
  assert.ok(result.explanation.toLowerCase().includes('sla'));
});

test('evaluateRiskStack null array eller saknad input ger samma tomma payload', () => {
  const a = evaluateRiskStack();
  const b = evaluateRiskStack(null);
  const c = evaluateRiskStack([]);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('riskStackEngine: tone dominant anxious recommends calming next steps', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'anxious',
    toneConfidence: 0.99,
    followUpSuggested: false,
    relationshipStatus: 'new',
    isUnanswered: false,
  });
  assert.equal(result.dominantRisk, 'tone');
  assert.ok(/lugnande/i.test(result.recommendedAction));
});

test('riskStackEngine: relationship dominant uses complaint actionCue when pattern matches', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    tone: 'neutral',
    toneConfidence: 0.5,
    followUpSuggested: false,
    relationshipStatus: 'loyal',
    interactionCount: 10,
    historySignals: {
      pattern: 'complaint',
      actionCue: 'Prioritera återkoppling enligt klagomålsrutinen.',
    },
  });
  assert.equal(result.dominantRisk, 'relationship');
  assert.ok(result.recommendedAction.includes('klagomålsrutinen'));
});

test('riskStackEngine: breach prepends outcomeActionCue ahead of actionCue', () => {
  const result = evaluateRiskStack({
    slaStatus: 'breach',
    historySignals: {
      actionCue: 'ACTION_FIRST',
      outcomeActionCue: 'OUTCOME_FIRST',
    },
  });
  assert.ok(result.recommendedAction.startsWith('OUTCOME_FIRST'));
});

test('riskStackEngine: long unanswered thread elevates miss without SLA breach', () => {
  const result = evaluateRiskStack({
    slaStatus: 'safe',
    isUnanswered: true,
    hoursSinceInbound: 100,
    unansweredThresholdHours: 10,
    tone: 'positive',
    toneConfidence: 0.2,
    followUpSuggested: false,
    relationshipStatus: 'new',
  });
  assert.equal(result.dominantRisk, 'miss');
});
