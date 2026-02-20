const { normalizeCategory } = require('../templates/constants');
const { evaluatePolicyFloorText } = require('../policy/floor');

const RISK_LEVEL_COLORS = Object.freeze({
  1: 'green',
  2: 'blue',
  3: 'yellow',
  4: 'orange',
  5: 'red',
});

const RULES = Object.freeze([
  {
    id: 'NO_DIAGNOSIS_POLICY',
    label: 'Diagnosuttryck',
    regex: /\b(diagnos|diagnostiser[a-z]*|du har sjukdomen|du lider av)\b/i,
    weight: 48,
  },
  {
    id: 'NO_GUARANTEE_POLICY',
    label: 'Garantilöfte',
    regex: /\b(garanti|garanterar|100\s*%|helt säker effekt)\b/i,
    weight: 45,
  },
  {
    id: 'ACUTE_ESCALATION_REQUIRED',
    label: 'Akut utan eskalering',
    regex: /\b(akut|svår smärta|andningssvårigheter|ring 112)\b/i,
    weight: 38,
    requiresEscalationPhrase: true,
  },
  {
    id: 'UNSAFE_MEDICAL_CLAIM',
    label: 'Medicinsk säkerhetsrisk',
    regex: /\b(läkande garanti|botar|riskfri behandling|utan biverkningar)\b/i,
    weight: 42,
  },
]);

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function computeSemanticScore(content, category) {
  const text = normalizeText(content).toLowerCase();
  if (!text) return 0;

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

  return Math.min(100, score);
}

function evaluateRules(content) {
  const text = normalizeText(content);
  const textLower = text.toLowerCase();
  const ruleHits = [];

  for (const rule of RULES) {
    const matched = rule.regex.test(text);
    if (!matched) continue;

    let effectiveWeight = rule.weight;

    if (rule.requiresEscalationPhrase) {
      const hasAcute = /akut|svår smärta|andningssvårigheter/i.test(text);
      const hasEscalation = /ring\s*112|kontakta\s*akut/i.test(textLower);
      if (!hasAcute) {
        continue;
      }
      if (hasEscalation) {
        effectiveWeight = Math.max(10, Math.floor(rule.weight * 0.35));
      }
    }

    ruleHits.push({
      id: rule.id,
      label: rule.label,
      weight: effectiveWeight,
    });
  }

  const ruleScore = Math.min(
    100,
    ruleHits.reduce((sum, hit) => sum + hit.weight, 0)
  );

  return {
    ruleHits,
    ruleScore,
  };
}

function toRiskLevel(score) {
  if (score >= 85) return 5;
  if (score >= 65) return 4;
  if (score >= 45) return 3;
  if (score >= 25) return 2;
  return 1;
}

function decisionForLevel(level) {
  if (level <= 2) return 'allow';
  if (level === 3) return 'review_required';
  return 'blocked';
}

function evaluateTemplateRisk({
  scope = 'output',
  content = '',
  category = '',
  tenantRiskModifier = 0,
  variableValidation = null,
}) {
  const safeContent = normalizeText(content);
  const semanticScore = computeSemanticScore(safeContent, category);
  const { ruleHits, ruleScore } = evaluateRules(safeContent);

  let variableScorePenalty = 0;
  const reasonCodes = [];
  if (variableValidation) {
    if (Array.isArray(variableValidation.unknownVariables) && variableValidation.unknownVariables.length) {
      variableScorePenalty += 20;
      reasonCodes.push('UNAPPROVED_TEMPLATE_VARIABLE');
    }
    if (
      Array.isArray(variableValidation.missingRequiredVariables) &&
      variableValidation.missingRequiredVariables.length
    ) {
      variableScorePenalty += 18;
      reasonCodes.push('MISSING_REQUIRED_DISCLAIMER');
    }
  }

  const adjustedModifier = Math.max(-10, Math.min(10, Number(tenantRiskModifier) || 0));
  const fusedScore = Math.min(
    100,
    Math.max(0, Math.round(ruleScore * 0.58 + semanticScore * 0.42 + adjustedModifier + variableScorePenalty))
  );

  let level = toRiskLevel(fusedScore);
  const policyAdjustments = [];

  for (const hit of ruleHits) {
    reasonCodes.push(hit.id);
  }

  const policyFloorEvaluation = evaluatePolicyFloorText({
    text: safeContent,
    context: 'templates',
  });

  if (Array.isArray(policyFloorEvaluation.hits)) {
    for (const hit of policyFloorEvaluation.hits) {
      reasonCodes.push(hit.id);
      const floor = Number(hit.floor) || 1;
      if (floor > level) {
        level = floor;
        policyAdjustments.push({
          reasonCode: hit.id,
          floorApplied: floor,
        });
      }
    }
  }

  const dedupedReasonCodes = Array.from(new Set(reasonCodes));
  const finalDecision = decisionForLevel(level);

  return {
    scope,
    category: normalizeCategory(category),
    tenantRiskModifier: adjustedModifier,
    riskLevel: level,
    riskColor: RISK_LEVEL_COLORS[level],
    riskScore: fusedScore,
    semanticScore,
    ruleScore,
    decision: finalDecision,
    reasonCodes: dedupedReasonCodes,
    ruleHits,
    policyHits: policyFloorEvaluation.hits,
    policyAdjustments,
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateTemplateRisk,
  decisionForLevel,
  toRiskLevel,
};
