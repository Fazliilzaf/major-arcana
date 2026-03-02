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

function normalizeRiskKind(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['miss', 'tone', 'follow_up', 'relationship', 'neutral'].includes(normalized)) {
    return normalized;
  }
  return 'neutral';
}

function toRiskScore(value, fallback = 0) {
  return clamp(value, 0, 1, fallback);
}

function deriveMissRisk(input = {}) {
  const isUnanswered = input.isUnanswered === true;
  const slaStatus = normalizeText(input.slaStatus).toLowerCase();
  const hoursSinceInbound = Math.max(0, toNumber(input.hoursSinceInbound, 0));
  const unansweredThresholdHours = Math.max(1, toNumber(input.unansweredThresholdHours, 24));

  if (slaStatus === 'breach') return 1;
  if (!isUnanswered) return 0.1;

  const ratio = clamp(hoursSinceInbound / unansweredThresholdHours, 0, 1, 0);
  if (slaStatus === 'warning') return clamp(0.7 + ratio * 0.2, 0, 1, 0.75);
  return clamp(0.45 + ratio * 0.4, 0, 1, 0.5);
}

function deriveToneRisk(input = {}) {
  const tone = normalizeText(input.tone).toLowerCase();
  const confidence = toRiskScore(input.toneConfidence, 0.4);
  const toneBase = {
    frustrated: 1,
    anxious: 0.85,
    urgent: 0.85,
    stressed: 0.65,
    neutral: 0.2,
    positive: 0.05,
  };
  const base = toRiskScore(toneBase[tone], 0.2);
  return clamp(base * Math.max(0.45, confidence), 0, 1, 0.1);
}

function deriveFollowUpRisk(input = {}) {
  const followUpSuggested = input.followUpSuggested === true;
  const stagnated = input.stagnated === true;
  const lifecycleState = normalizeText(input.lifecycleState).toUpperCase();
  const hoursSinceInbound = Math.max(0, toNumber(input.hoursSinceInbound, 0));

  let score = 0.15;
  if (followUpSuggested) score += 0.55;
  if (stagnated) score += 0.2;
  if (lifecycleState === 'FOLLOW_UP_PENDING') score += 0.2;
  if (hoursSinceInbound >= 48) score += 0.1;
  return clamp(score, 0, 1, 0.15);
}

function deriveRelationshipRisk(input = {}) {
  const relationshipStatus = normalizeText(input.relationshipStatus).toLowerCase();
  const tone = normalizeText(input.tone).toLowerCase();
  const repeatInteractions = Math.max(0, toNumber(input.interactionCount, 0));

  let score = 0.1;
  if (relationshipStatus === 'loyal') score += 0.35;
  if (relationshipStatus === 'returning') score += 0.2;
  if (relationshipStatus === 'dormant') score += 0.15;
  if (['frustrated', 'anxious'].includes(tone)) score += 0.2;
  if (repeatInteractions >= 6) score += 0.1;
  return clamp(score, 0, 1, 0.1);
}

function resolveRecommendedAction({ dominantRisk = 'neutral', slaStatus = 'safe', tone = '', intent = '' } = {}) {
  const safeDominantRisk = normalizeRiskKind(dominantRisk);
  const safeSla = normalizeText(slaStatus).toLowerCase();
  const safeTone = normalizeText(tone).toLowerCase();
  const safeIntent = normalizeText(intent).toLowerCase();

  if (safeDominantRisk === 'miss') {
    if (safeSla === 'breach') return 'Svara omedelbart for att undvika missad kund.';
    if (safeSla === 'warning') return 'Svara inom 1h for att undvika SLA-brott.';
    return 'Svara idag for att minska risken att missa kunden.';
  }
  if (safeDominantRisk === 'tone') {
    if (safeTone === 'frustrated') return 'Svara bekraftande och ansvarstagande inom 1h.';
    if (safeTone === 'anxious') return 'Svara lugnande med tydliga nasta steg.';
    return 'Anpassa tonen till kundens lage innan skickning.';
  }
  if (safeDominantRisk === 'follow_up') {
    if (safeIntent === 'booking_request') return 'Skicka mjuk uppfoljning med tva konkreta tidsforslag.';
    if (safeIntent === 'pricing_question') return 'Skicka tydlig prisram och erbjud uppfoljande fraga.';
    return 'Skicka en mjuk uppfoljning for att behalla momentum.';
  }
  if (safeDominantRisk === 'relationship') {
    return 'Svara personligt och stabilt for att skydda relationen.';
  }
  return 'Fortsatt enligt rekommenderad prioritet i inkorgen.';
}

function resolveExplanation({ dominantRisk = 'neutral', slaStatus = 'safe', tone = '', lifecycleState = '' } = {}) {
  const safeDominantRisk = normalizeRiskKind(dominantRisk);
  const safeSla = normalizeText(slaStatus).toLowerCase();
  const safeTone = normalizeText(tone).toLowerCase();
  const safeLifecycle = normalizeText(lifecycleState).toUpperCase();

  if (safeDominantRisk === 'miss') {
    if (safeSla === 'breach') return 'SLA ar passerad och konversationen ar obesvarad.';
    if (safeSla === 'warning') return 'SLA narmar sig brott och konversationen ar obesvarad.';
    return 'Obesvarad konversation med operativ miss-risk.';
  }
  if (safeDominantRisk === 'tone') {
    return `Kundtonen ar ${safeTone || 'kanslig'} och kraver anpassat bemotande.`;
  }
  if (safeDominantRisk === 'follow_up') {
    return `Lifecycle ${safeLifecycle || 'FOLLOW_UP_PENDING'} visar behov av uppfoljning.`;
  }
  if (safeDominantRisk === 'relationship') {
    return 'Relationssignal indikerar forhojd langsiktig fortroenderisk.';
  }
  return 'Ingen dominant forhojd risk identifierad.';
}

function evaluateRiskStack(input = {}) {
  const safeInput = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const weights = {
    miss: 1.0,
    tone: 0.8,
    follow_up: 0.9,
    relationship: 0.7,
  };

  const missRisk = toRiskScore(
    safeInput.missRisk,
    deriveMissRisk(safeInput)
  );
  const toneRisk = toRiskScore(
    safeInput.toneRisk,
    deriveToneRisk(safeInput)
  );
  const followUpRisk = toRiskScore(
    safeInput.followUpRisk,
    deriveFollowUpRisk(safeInput)
  );
  const relationshipRisk = toRiskScore(
    safeInput.relationshipRisk,
    deriveRelationshipRisk(safeInput)
  );

  const weighted = {
    miss: missRisk * weights.miss,
    tone: toneRisk * weights.tone,
    follow_up: followUpRisk * weights.follow_up,
    relationship: relationshipRisk * weights.relationship,
  };

  const slaStatus = normalizeText(safeInput.slaStatus).toLowerCase();
  let dominantRisk = 'neutral';
  let weightedScore = 0;

  if (slaStatus === 'breach') {
    dominantRisk = 'miss';
    weightedScore = 1;
  } else {
    for (const [risk, score] of Object.entries(weighted)) {
      if (score > weightedScore) {
        weightedScore = score;
        dominantRisk = risk;
      }
    }
    weightedScore = clamp(weightedScore, 0, 1, 0);
    if (weightedScore < 0.2) {
      dominantRisk = 'neutral';
    }
  }

  const explanation = resolveExplanation({
    dominantRisk,
    slaStatus,
    tone: safeInput.tone,
    lifecycleState: safeInput.lifecycleState,
  });
  const recommendedAction = resolveRecommendedAction({
    dominantRisk,
    slaStatus,
    tone: safeInput.tone,
    intent: safeInput.intent,
  });

  return {
    dominantRisk: normalizeRiskKind(dominantRisk),
    weightedScore: clamp(weightedScore, 0, 1, 0),
    explanation,
    recommendedAction,
    breakdown: {
      missRisk,
      toneRisk,
      followUpRisk,
      relationshipRisk,
      weighted,
    },
  };
}

module.exports = {
  evaluateRiskStack,
  normalizeRiskKind,
};
