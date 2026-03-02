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
