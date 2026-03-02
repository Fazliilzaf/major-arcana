function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max, fallback = min) {
  const numeric = toNumber(value, fallback);
  return Math.max(min, Math.min(max, numeric));
}

function evaluateTempoProfile(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const replyLatencyHours = Math.max(0, toNumber(safeInput.replyLatencyHours, 72));
  const responseCount = Math.max(0, Math.round(toNumber(safeInput.responseCount, 0)));
  const interactionDensity = Math.max(0, toNumber(safeInput.interactionDensity, 0));
  const toneTrend = normalizeText(safeInput.toneTrend).toLowerCase();
  const warmthScore = clamp(safeInput.warmthScore, 0, 1, 0.4);

  if (replyLatencyHours > 96 || (responseCount <= 1 && warmthScore < 0.4)) {
    return {
      tempoProfile: 'low_engagement',
      recommendedFollowUpDelayDays: 7,
      ctaIntensity: 'soft',
    };
  }

  if (
    toneTrend === 'anxious' ||
    toneTrend === 'stressed' ||
    toneTrend === 'frustrated'
  ) {
    return {
      tempoProfile: 'hesitant',
      recommendedFollowUpDelayDays: 4,
      ctaIntensity: 'soft',
    };
  }

  if (
    (replyLatencyHours <= 6 && responseCount >= 3) ||
    interactionDensity >= 0.9 ||
    warmthScore >= 0.75
  ) {
    return {
      tempoProfile: 'responsive',
      recommendedFollowUpDelayDays: 3,
      ctaIntensity: 'direct',
    };
  }

  return {
    tempoProfile: 'reflective',
    recommendedFollowUpDelayDays: 5,
    ctaIntensity: 'normal',
  };
}

module.exports = {
  evaluateTempoProfile,
};
