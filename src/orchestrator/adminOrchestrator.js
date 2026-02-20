const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');

const AGENTS = Object.freeze({
  ARCANA: 'ARCANA',
  CAO: 'CAO',
  CMO: 'CMO',
  COO: 'COO',
  CLINICAL_GUARD: 'CLINICAL_GUARD',
});

const INTENTS = Object.freeze({
  TEMPLATE_LIBRARY: 'template_library',
  RISK_REVIEW: 'risk_review',
  STAFF_ADMIN: 'staff_admin',
  TENANT_BRANDING: 'tenant_branding',
  AUDIT_REVIEW: 'audit_review',
  GENERAL_ADMIN: 'general_admin',
});

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function inferIntent(prompt) {
  const text = normalizeText(prompt).toLowerCase();
  if (!text) {
    return {
      intent: INTENTS.GENERAL_ADMIN,
      confidence: 0.2,
      reasons: ['empty_prompt'],
    };
  }

  const rules = [
    {
      intent: INTENTS.TEMPLATE_LIBRARY,
      regex: /\b(template|mall|draft|utkast|activate|aktivera|version|aftercare|konsultation)\b/i,
      confidence: 0.82,
      reason: 'template_keywords',
    },
    {
      intent: INTENTS.RISK_REVIEW,
      regex: /\b(risk|policy|critical|high|summary|flag|escalate|eskaler)\b/i,
      confidence: 0.85,
      reason: 'risk_keywords',
    },
    {
      intent: INTENTS.STAFF_ADMIN,
      regex: /\b(staff|user|användare|behörighet|role|roll|invite|disable|enable)\b/i,
      confidence: 0.8,
      reason: 'staff_keywords',
    },
    {
      intent: INTENTS.TENANT_BRANDING,
      regex: /\b(tenant|brand|tone|assistant|profil|modifier|white-label)\b/i,
      confidence: 0.78,
      reason: 'tenant_keywords',
    },
    {
      intent: INTENTS.AUDIT_REVIEW,
      regex: /\b(audit|logg|historik|spårbar|report|rapport)\b/i,
      confidence: 0.77,
      reason: 'audit_keywords',
    },
  ];

  for (const rule of rules) {
    if (rule.regex.test(text)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        reasons: [rule.reason],
      };
    }
  }

  return {
    intent: INTENTS.GENERAL_ADMIN,
    confidence: 0.55,
    reasons: ['fallback_general'],
  };
}

function selectAgents(intent) {
  const map = {
    [INTENTS.TEMPLATE_LIBRARY]: [AGENTS.ARCANA, AGENTS.CAO, AGENTS.CLINICAL_GUARD],
    [INTENTS.RISK_REVIEW]: [AGENTS.ARCANA, AGENTS.CLINICAL_GUARD, AGENTS.COO],
    [INTENTS.STAFF_ADMIN]: [AGENTS.ARCANA, AGENTS.COO],
    [INTENTS.TENANT_BRANDING]: [AGENTS.ARCANA, AGENTS.CMO, AGENTS.CAO],
    [INTENTS.AUDIT_REVIEW]: [AGENTS.ARCANA, AGENTS.COO, AGENTS.CAO],
    [INTENTS.GENERAL_ADMIN]: [AGENTS.ARCANA, AGENTS.CAO],
  };
  return map[intent] ? [...map[intent]] : [AGENTS.ARCANA];
}

function buildActionPlan({ intent, role }) {
  const common = [{ step: 'validate_tenant_scope', owner: AGENTS.ARCANA }];
  const byIntent = {
    [INTENTS.TEMPLATE_LIBRARY]: [
      { step: 'inspect_template_status', owner: AGENTS.CAO },
      { step: 'generate_or_update_draft', owner: AGENTS.CAO },
      { step: 'run_risk_policy_checks', owner: AGENTS.CLINICAL_GUARD },
      { step: 'request_owner_action_if_needed', owner: AGENTS.ARCANA },
    ],
    [INTENTS.RISK_REVIEW]: [
      { step: 'fetch_risk_evaluations', owner: AGENTS.CLINICAL_GUARD },
      { step: 'rank_high_critical_open', owner: AGENTS.COO },
      { step: 'propose_owner_actions', owner: AGENTS.ARCANA },
    ],
    [INTENTS.STAFF_ADMIN]: [
      { step: 'review_staff_memberships', owner: AGENTS.COO },
      { step: 'enforce_role_constraints', owner: AGENTS.ARCANA },
      { step: 'prepare_staff_change', owner: AGENTS.COO },
    ],
    [INTENTS.TENANT_BRANDING]: [
      { step: 'read_tenant_config', owner: AGENTS.CAO },
      { step: 'propose_brand_tone_update', owner: AGENTS.CMO },
      { step: 'validate_safety_floor', owner: AGENTS.CLINICAL_GUARD },
    ],
    [INTENTS.AUDIT_REVIEW]: [
      { step: 'load_recent_audit_events', owner: AGENTS.COO },
      { step: 'highlight_compliance_gaps', owner: AGENTS.ARCANA },
    ],
    [INTENTS.GENERAL_ADMIN]: [
      { step: 'classify_request', owner: AGENTS.ARCANA },
      { step: 'route_to_owner_panel_action', owner: AGENTS.CAO },
    ],
  };

  const steps = [...common, ...(byIntent[intent] || byIntent[INTENTS.GENERAL_ADMIN])];
  if (role !== 'OWNER') {
    steps.push({ step: 'owner_approval_required_for_mutations', owner: AGENTS.ARCANA });
  }
  return steps;
}

function buildSuggestedApiCalls(intent) {
  const map = {
    [INTENTS.TEMPLATE_LIBRARY]: [
      'GET /api/v1/templates',
      'POST /api/v1/templates/:templateId/drafts/generate',
      'POST /api/v1/templates/:templateId/versions/:versionId/evaluate',
    ],
    [INTENTS.RISK_REVIEW]: [
      'GET /api/v1/risk/evaluations',
      'GET /api/v1/risk/summary',
      'POST /api/v1/risk/evaluations/:evaluationId/owner-action',
    ],
    [INTENTS.STAFF_ADMIN]: [
      'GET /api/v1/users/staff',
      'POST /api/v1/users/staff',
      'PATCH /api/v1/users/staff/:membershipId',
    ],
    [INTENTS.TENANT_BRANDING]: ['GET /api/v1/tenant-config', 'PATCH /api/v1/tenant-config'],
    [INTENTS.AUDIT_REVIEW]: ['GET /api/v1/audit/events', 'GET /api/v1/dashboard/owner'],
    [INTENTS.GENERAL_ADMIN]: ['GET /api/v1/dashboard/owner'],
  };
  return map[intent] ? [...map[intent]] : map[INTENTS.GENERAL_ADMIN];
}

function composeDraftResponse({ intent, tenantConfig, role, prompt }) {
  const assistantName = normalizeText(tenantConfig?.assistantName || 'Arcana');
  const toneStyle = normalizeText(tenantConfig?.toneStyle || 'professional-warm');
  const brandProfile = normalizeText(tenantConfig?.brandProfile || 'clinic');

  return [
    `${assistantName} orkestrerar detta som intent "${intent}".`,
    `Tenantprofil: ${brandProfile}, ton: ${toneStyle}, roll: ${role}.`,
    'Nästa steg: kör föreslagna API-anrop i ordning och logga owner-beslut där risk kräver manuell åtgärd.',
    `Uppgift: ${normalizeText(prompt)}`,
  ].join(' ');
}

function enforceOutputSafety({ text, tenantRiskModifier }) {
  const initialPolicy = evaluatePolicyFloorText({
    text,
    context: 'orchestrator',
  });
  const initialRisk = evaluateTemplateRisk({
    scope: 'output',
    category: 'INTERNAL',
    content: text,
    tenantRiskModifier,
  });

  if (!initialPolicy.blocked && initialRisk.decision !== 'blocked') {
    return {
      text,
      policy: initialPolicy,
      risk: initialRisk,
      safetyAdjusted: false,
    };
  }

  const safeText =
    'För att följa säkerhetspolicyn är svaret begränsat. Gå vidare via owner-panelen: granska risk, välj owner action och fortsätt med godkända administrativa steg.';

  const safePolicy = evaluatePolicyFloorText({
    text: safeText,
    context: 'orchestrator',
  });
  const safeRisk = evaluateTemplateRisk({
    scope: 'output',
    category: 'INTERNAL',
    content: safeText,
    tenantRiskModifier,
  });

  return {
    text: safeText,
    policy: safePolicy,
    risk: safeRisk,
    safetyAdjusted: true,
  };
}

async function runAdminOrchestration({
  prompt,
  role,
  tenantId,
  tenantConfig,
}) {
  const inference = inferIntent(prompt);
  const selectedAgents = selectAgents(inference.intent);
  const plan = buildActionPlan({ intent: inference.intent, role });
  const suggestedApiCalls = buildSuggestedApiCalls(inference.intent);
  const draftResponse = composeDraftResponse({
    intent: inference.intent,
    tenantConfig,
    role,
    prompt,
  });
  const tenantRiskModifier = Number(tenantConfig?.riskSensitivityModifier ?? 0);
  const safeOutput = enforceOutputSafety({
    text: draftResponse,
    tenantRiskModifier,
  });

  return {
    tenantId,
    role,
    intent: inference.intent,
    confidence: inference.confidence,
    reasons: inference.reasons,
    selectedAgents,
    plan,
    suggestedApiCalls,
    output: {
      text: safeOutput.text,
      safetyAdjusted: safeOutput.safetyAdjusted,
      policy: safeOutput.policy,
      risk: safeOutput.risk,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  AGENTS,
  INTENTS,
  runAdminOrchestration,
};
