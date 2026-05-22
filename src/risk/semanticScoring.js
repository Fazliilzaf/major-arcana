const { normalizeCategory } = require('../templates/constants');

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clamp100(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sigmoid(x) {
  const safeX = Math.max(-60, Math.min(60, Number(x || 0)));
  return 1 / (1 + Math.exp(-safeX));
}

function computeHeuristicSemanticScore(content, category) {
  const text = normalizeText(content).toLowerCase();
  if (!text) {
    return {
      score: 0,
      modelVersion: 'semantic.heuristic.v1',
      meta: {
        mode: 'heuristic',
      },
    };
  }

  let score = 8;
  if (text.length > 600) score += 6;
  if (text.includes('måste') || text.includes('alltid')) score += 5;
  if (text.includes('omedelbart')) score += 5;
  if (text.includes('garanti')) score += 14;
  if (text.includes('diagnos')) score += 14;
  if (text.includes('akut') && !text.includes('ring 112')) score += 16;

  const normalizedCategory = normalizeCategory(category);
  if (normalizedCategory === 'AFTERCARE' && text.includes('symtom')) score += 4;
  if (normalizedCategory === 'CONSULTATION' && text.includes('resultat')) score += 4;

  return {
    score: clamp100(score),
    modelVersion: 'semantic.heuristic.v1',
    meta: {
      mode: 'heuristic',
    },
  };
}

function buildLinearFeatures(text = '', category = '') {
  const normalized = normalizeText(text).toLowerCase();
  const normalizedCategory = normalizeCategory(category);

  const featureCount = (regex) => {
    const matches = normalized.match(regex);
    return Array.isArray(matches) ? matches.length : 0;
  };

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const tokenCount = tokens.length;

  const hasAcuteNoEscalation =
    /(akut|svår smärta|andningssvårigheter)/i.test(normalized) &&
    !/(ring\s*112|kontakta\s*akut)/i.test(normalized);

  return {
    bias: 1,
    length: clamp01(tokenCount / 180),
    absolutes: clamp01(featureCount(/\b(alltid|måste|omedelbart|garanterar|100\s*%)\b/gi) / 4),
    diagnosis: clamp01(featureCount(/\b(diagnos|diagnostiser[a-z]*|du har sjukdomen|du lider av)\b/gi) / 2),
    guarantee: clamp01(featureCount(/\b(garanti|garanterar|100\s*%|riskfri|utan biverkningar|botar)\b/gi) / 3),
    acuteNoEscalation: hasAcuteNoEscalation ? 1 : 0,
    piiIntensity: clamp01(featureCount(/\b(personnummer|journalnummer|bankid|passnummer)\b/gi) / 2),
    consultationContext:
      normalizedCategory === 'CONSULTATION' && /\b(resultat|utfall|effekt)\b/i.test(normalized)
        ? 1
        : 0,
    aftercareSymptoms:
      normalizedCategory === 'AFTERCARE' && /\b(symtom|försämring|biverkning)\b/i.test(normalized)
        ? 1
        : 0,
  };
}

const LINEAR_WEIGHTS_V1 = Object.freeze({
  bias: -1.55,
  length: 0.85,
  absolutes: 1.25,
  diagnosis: 2.1,
  guarantee: 2.3,
  acuteNoEscalation: 2.0,
  piiIntensity: 0.9,
  consultationContext: 0.45,
  aftercareSymptoms: 0.4,
});

function computeLinearSemanticScore(content, category) {
  const features = buildLinearFeatures(content, category);
  let z = 0;
  for (const [name, weight] of Object.entries(LINEAR_WEIGHTS_V1)) {
    z += Number(weight || 0) * Number(features[name] || 0);
  }
  const probability = sigmoid(z);
  return {
    score: clamp100(probability * 100),
    modelVersion: 'semantic.linear.v1',
    meta: {
      mode: 'linear',
      probability: Number(probability.toFixed(4)),
      features,
    },
  };
}

function normalizeSemanticMode(value = 'heuristic') {
  const normalized = normalizeText(value).toLowerCase();
  if (['heuristic', 'linear', 'hybrid'].includes(normalized)) return normalized;
  return 'heuristic';
}

function computeSemanticRiskScore({
  content = '',
  category = '',
  mode = 'heuristic',
} = {}) {
  const normalizedMode = normalizeSemanticMode(mode);
  if (normalizedMode === 'linear') {
    return computeLinearSemanticScore(content, category);
  }

  const heuristic = computeHeuristicSemanticScore(content, category);
  if (normalizedMode === 'heuristic') {
    return heuristic;
  }

  const linear = computeLinearSemanticScore(content, category);
  const blendedScore = clamp100(heuristic.score * 0.45 + linear.score * 0.55);
  return {
    score: blendedScore,
    modelVersion: 'semantic.hybrid.v1',
    meta: {
      mode: 'hybrid',
      components: {
        heuristic: heuristic.score,
        linear: linear.score,
      },
    },
  };
}

module.exports = {
  computeSemanticRiskScore,
  normalizeSemanticMode,
};
