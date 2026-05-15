const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateTempoProfile } = require('../../src/intelligence/tempoEngine');

test('Tempo engine classifies responsive profile', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 2,
    responseCount: 4,
    interactionDensity: 1.2,
    toneTrend: 'neutral',
    warmthScore: 0.82,
  });

  assert.equal(result.tempoProfile, 'responsive');
  assert.equal(result.recommendedFollowUpDelayDays, 3);
  assert.equal(result.ctaIntensity, 'direct');
});

test('Tempo engine classifies hesitant profile for anxious tone', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 10,
    responseCount: 2,
    interactionDensity: 0.4,
    toneTrend: 'anxious',
    warmthScore: 0.6,
  });

  assert.equal(result.tempoProfile, 'hesitant');
  assert.equal(result.recommendedFollowUpDelayDays, 4);
  assert.equal(result.ctaIntensity, 'soft');
});

test('Tempo engine classifies low engagement with long latency', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 140,
    responseCount: 1,
    interactionDensity: 0.1,
    toneTrend: 'neutral',
    warmthScore: 0.2,
  });

  assert.equal(result.tempoProfile, 'low_engagement');
  assert.equal(result.recommendedFollowUpDelayDays, 7);
  assert.equal(result.ctaIntensity, 'soft');
});

test('Tempo engine classifies low engagement when few responses and low warmth', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 48,
    responseCount: 1,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.35,
  });

  assert.equal(result.tempoProfile, 'low_engagement');
});

test('Tempo engine classifies responsive when interaction density is very high', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 24,
    responseCount: 2,
    interactionDensity: 0.95,
    toneTrend: 'neutral',
    warmthScore: 0.5,
  });

  assert.equal(result.tempoProfile, 'responsive');
  assert.equal(result.ctaIntensity, 'direct');
});

test('Tempo engine classifies reflective baseline between bands', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 48,
    responseCount: 2,
    interactionDensity: 0.5,
    toneTrend: 'neutral',
    warmthScore: 0.55,
  });

  assert.equal(result.tempoProfile, 'reflective');
  assert.equal(result.recommendedFollowUpDelayDays, 5);
  assert.equal(result.ctaIntensity, 'normal');
});

test('Tempo engine treats non-object input as empty profile', () => {
  const result = evaluateTempoProfile(null);
  assert.equal(result.tempoProfile, 'reflective');
});

test('Tempo engine prioritizes low_engagement over anxious tone when latency is extreme', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 120,
    responseCount: 5,
    toneTrend: 'anxious',
    warmthScore: 0.9,
  });
  assert.equal(result.tempoProfile, 'low_engagement');
});

test('Tempo engine boundary checks: exactly 96h is not forced low_engagement', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 96,
    responseCount: 2,
    interactionDensity: 0.3,
    toneTrend: 'neutral',
    warmthScore: 0.5,
  });
  assert.equal(result.tempoProfile, 'reflective');
});

test('Tempo engine clamps and normalizes invalid numerics to safe defaults', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: -10,
    responseCount: -2.8,
    interactionDensity: 'not-a-number',
    warmthScore: 2,
  });
  assert.equal(result.tempoProfile, 'responsive');
  assert.equal(result.ctaIntensity, 'direct');
});

test('Tempo engine maps frustrated tone till hesitant profil', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 12,
    responseCount: 3,
    interactionDensity: 0.3,
    toneTrend: 'Frustrated',
    warmthScore: 0.5,
  });
  assert.equal(result.tempoProfile, 'hesitant');
  assert.equal(result.ctaIntensity, 'soft');
});

test('Tempo engine klassar responsive vid latency 6h och minst tre svar', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 6,
    responseCount: 3,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.5,
  });
  assert.equal(result.tempoProfile, 'responsive');
});

test('Tempo engine klassar responsive vid warmthScore grans 0.75', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 48,
    responseCount: 2,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.75,
  });
  assert.equal(result.tempoProfile, 'responsive');
});

test('Tempo engine klassar reflective nar warmthScore 0.74 och inga starka signaler', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 48,
    responseCount: 2,
    interactionDensity: 0.2,
    toneTrend: 'positive',
    warmthScore: 0.74,
  });
  assert.equal(result.tempoProfile, 'reflective');
});

test('Tempo engine klassar responsive vid interactionDensity exakt 0.9', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 24,
    responseCount: 1,
    interactionDensity: 0.9,
    toneTrend: 'neutral',
    warmthScore: 0.5,
  });
  assert.equal(result.tempoProfile, 'responsive');
});

test('Tempo engine treats undefined input like empty object', () => {
  const result = evaluateTempoProfile(undefined);
  assert.equal(result.tempoProfile, 'reflective');
  assert.equal(result.recommendedFollowUpDelayDays, 5);
});

test('Tempo engine treats array input as empty profile', () => {
  assert.equal(evaluateTempoProfile([]).tempoProfile, 'reflective');
  assert.equal(evaluateTempoProfile(['x']).tempoProfile, 'reflective');
});

test('Tempo engine maps stressed tone to hesitant', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 20,
    responseCount: 2,
    interactionDensity: 0.3,
    toneTrend: '  STRESSED  ',
    warmthScore: 0.5,
  });
  assert.equal(result.tempoProfile, 'hesitant');
});

test('Tempo engine forces low_engagement when latency just over 96h', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 97,
    responseCount: 4,
    interactionDensity: 0.5,
    toneTrend: 'neutral',
    warmthScore: 0.8,
  });
  assert.equal(result.tempoProfile, 'low_engagement');
});

test('Tempo engine low_engagement for zero responses and warmth under 0.4', () => {
  const result = evaluateTempoProfile({
    replyLatencyHours: 24,
    responseCount: 0,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.35,
  });
  assert.equal(result.tempoProfile, 'low_engagement');
});

test('evaluateTempoProfile skips low_engagement band when warmth is exactly 0.4 with one response', () => {
  const r = evaluateTempoProfile({
    replyLatencyHours: 48,
    responseCount: 1,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.4,
  });
  assert.equal(r.tempoProfile, 'reflective');
});

test('evaluateTempoProfile requires latency at most 6h for fast-reply responsive branch', () => {
  const r = evaluateTempoProfile({
    replyLatencyHours: 6.01,
    responseCount: 3,
    interactionDensity: 0.2,
    toneTrend: 'neutral',
    warmthScore: 0.5,
  });
  assert.equal(r.tempoProfile, 'reflective');
});

test('evaluateTempoProfile string input matches empty object tempo', () => {
  const a = evaluateTempoProfile('not-an-object');
  const b = evaluateTempoProfile({});
  assert.equal(a.tempoProfile, b.tempoProfile);
  assert.equal(a.recommendedFollowUpDelayDays, b.recommendedFollowUpDelayDays);
  assert.equal(a.ctaIntensity, b.ctaIntensity);
});
