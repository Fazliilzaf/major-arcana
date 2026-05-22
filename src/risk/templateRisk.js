const { normalizeCategory } = require('../templates/constants');
const { evaluatePolicyFloorText } = require('../policy/floor');
const { computeSemanticRiskScore, normalizeSemanticMode } = require('./semanticScoring');

const RISK_LEVEL_COLORS = Object.freeze({
  1: 'green',
  2: 'blue',
  3: 'yellow',
  4: 'orange',
  5: 'red',
});

const RISK_ENGINE_VERSION_BASE = Object.freeze({
  ruleSetVersion: 'rules.v1',
  fusionVersion: 'fusion.weighted.v1',
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
  riskThresholdVersion = 1,
  variableValidation = null,
  enforceStrictTemplateVariables = false,
}) {
  const safeContent = normalizeText(content);
  const semanticMode = normalizeSemanticMode(process.env.ARCANA_SEMANTIC_MODEL_MODE || 'heuristic');
  const semanticEvaluation = computeSemanticRiskScore({
    content: safeContent,
    category,
    mode: semanticMode,
  });
  const semanticScore = semanticEvaluation.score;
  const { ruleHits, ruleScore } = evaluateRules(safeContent);

  let variableScorePenalty = 0;
  const reasonCodes = [];
  let strictTemplateVariableViolation = false;
  if (variableValidation) {
    if (Array.isArray(variableValidation.unknownVariables) && variableValidation.unknownVariables.length) {
      variableScorePenalty += 20;
      reasonCodes.push('UNAPPROVED_TEMPLATE_VARIABLE');
      if (enforceStrictTemplateVariables) strictTemplateVariableViolation = true;
    }
    if (
      Array.isArray(variableValidation.missingRequiredVariables) &&
      variableValidation.missingRequiredVariables.length
    ) {
      variableScorePenalty += 18;
      reasonCodes.push('MISSING_REQUIRED_DISCLAIMER');
      if (enforceStrictTemplateVariables) strictTemplateVariableViolation = true;
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

  if (strictTemplateVariableViolation && level < 4) {
    level = 4;
    policyAdjustments.push({
      reasonCode: 'STRICT_TEMPLATE_VARIABLE_POLICY',
      floorApplied: 4,
    });
  }

  const dedupedReasonCodes = Array.from(new Set(reasonCodes));
  const finalDecision = decisionForLevel(level);
  const normalizedThresholdVersion = Math.max(1, Number.parseInt(String(riskThresholdVersion), 10) || 1);
  const buildVersion = normalizeText(process.env.npm_package_version || process.env.ARCANA_BUILD_VERSION || 'dev');

  return {
    scope,
    category: normalizeCategory(category),
    tenantRiskModifier: adjustedModifier,
    riskLevel: level,
    riskColor: RISK_LEVEL_COLORS[level],
    riskScore: fusedScore,
    semanticScore,
    semanticMeta: semanticEvaluation.meta,
    ruleScore,
    decision: finalDecision,
    reasonCodes: dedupedReasonCodes,
    ruleHits,
    policyHits: policyFloorEvaluation.hits,
    policyAdjustments,
    versions: {
      ...RISK_ENGINE_VERSION_BASE,
      semanticModelVersion: semanticEvaluation.modelVersion,
      thresholdVersion: `threshold.v${normalizedThresholdVersion}`,
      buildVersion,
    },
    evaluatedAt: new Date().toISOString(),
  };
}

module.exports = {
  evaluateTemplateRisk,
  decisionForLevel,
  toRiskLevel,
  RISK_ENGINE_VERSION_BASE,
};
