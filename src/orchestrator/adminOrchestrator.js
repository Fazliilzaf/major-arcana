const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');

const AGENTS = Object.freeze({
  ARCANA: 'ARCANA',
  CAO: 'CAO',
  CMO: 'CMO',
  COO: 'COO',
  CFO: 'CFO',
  CLINICAL_GUARD: 'CLINICAL_GUARD',
});

const INTENTS = Object.freeze({
  TEMPLATE_LIBRARY: 'template_library',
  RISK_REVIEW: 'risk_review',
  STAFF_ADMIN: 'staff_admin',
  TENANT_BRANDING: 'tenant_branding',
  AUDIT_REVIEW: 'audit_review',
  FINANCE_GOVERNANCE: 'finance_governance',
  MARKETING_CAMPAIGN: 'marketing_campaign',
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
      intent: INTENTS.MARKETING_CAMPAIGN,
      regex:
        /\b(kampanj|campaign|marketing|utm|publicering|publicera|ads|annons|outreach|content\s*plan|go-live|golive)\b/i,
      confidence: 0.84,
      reason: 'marketing_keywords',
    },
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
      intent: INTENTS.FINANCE_GOVERNANCE,
      regex:
        /\b(finans|budget|cost|kostnad|roi|lönsam|runway|marginal|revenue|intäkt|burn|forecast)\b/i,
      confidence: 0.83,
      reason: 'finance_keywords',
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
    [INTENTS.MARKETING_CAMPAIGN]: [
      AGENTS.ARCANA,
      AGENTS.CMO,
      AGENTS.CLINICAL_GUARD,
      AGENTS.CAO,
      AGENTS.COO,
      AGENTS.CFO,
    ],
    [INTENTS.TEMPLATE_LIBRARY]: [AGENTS.ARCANA, AGENTS.CAO, AGENTS.CLINICAL_GUARD],
    [INTENTS.RISK_REVIEW]: [AGENTS.ARCANA, AGENTS.CLINICAL_GUARD, AGENTS.COO, AGENTS.CFO],
    [INTENTS.STAFF_ADMIN]: [AGENTS.ARCANA, AGENTS.COO],
    [INTENTS.TENANT_BRANDING]: [AGENTS.ARCANA, AGENTS.CMO, AGENTS.CAO],
    [INTENTS.AUDIT_REVIEW]: [AGENTS.ARCANA, AGENTS.COO, AGENTS.CAO, AGENTS.CFO],
    [INTENTS.FINANCE_GOVERNANCE]: [AGENTS.ARCANA, AGENTS.CFO, AGENTS.COO],
    [INTENTS.GENERAL_ADMIN]: [AGENTS.ARCANA, AGENTS.CAO],
  };
  return map[intent] ? [...map[intent]] : [AGENTS.ARCANA];
}

function buildActionPlan({ intent, role }) {
  const common = [{ step: 'validate_tenant_scope', owner: AGENTS.ARCANA }];
  const byIntent = {
    [INTENTS.MARKETING_CAMPAIGN]: [
      { step: 'hydrate_marketing_snapshot', owner: AGENTS.CMO },
      { step: 'generate_campaign_drafts', owner: AGENTS.CMO },
      { step: 'run_compliance_and_claims', owner: AGENTS.CLINICAL_GUARD },
      { step: 'check_operational_readiness', owner: AGENTS.CAO },
      { step: 'evaluate_incident_pause', owner: AGENTS.COO },
      { step: 'check_budget_gate', owner: AGENTS.CFO },
      { step: 'prepare_cco_handoff', owner: AGENTS.CMO },
      { step: 'request_owner_action_if_needed', owner: AGENTS.ARCANA },
    ],
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
    [INTENTS.FINANCE_GOVERNANCE]: [
      { step: 'load_pilot_kpis', owner: AGENTS.CFO },
      { step: 'estimate_incident_cost_exposure', owner: AGENTS.COO },
      { step: 'propose_budget_and_priority_actions', owner: AGENTS.CFO },
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
    [INTENTS.MARKETING_CAMPAIGN]: [
      'POST /api/v1/capabilities/agents/CMO/run',
      'GET /api/v1/marketing/campaigns',
      'GET /api/v1/monitor/readiness',
      'PATCH /api/v1/marketing/campaigns/:id/approve',
    ],
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
    [INTENTS.FINANCE_GOVERNANCE]: [
      'GET /api/v1/reports/pilot?days=30',
      'GET /api/v1/incidents/summary',
      'GET /api/v1/monitor/readiness',
      'GET /api/v1/monitor/slo',
    ],
    [INTENTS.GENERAL_ADMIN]: ['GET /api/v1/dashboard/owner'],
  };
  return map[intent] ? [...map[intent]] : map[INTENTS.GENERAL_ADMIN];
}

function getOrchestratorRoadmap() {
  return {
    version: '2026-02-25',
    phases: [
      {
        id: 'phase_now',
        label: 'Current',
        status: 'active',
        agents: [AGENTS.ARCANA, AGENTS.CAO, AGENTS.CMO, AGENTS.COO, AGENTS.CLINICAL_GUARD],
        capabilities: [
          'template_library',
          'risk_review',
          'staff_admin',
          'tenant_branding',
          'audit_review',
          'marketing_campaign',
        ],
      },
      {
        id: 'phase_next',
        label: 'Next',
        status: 'active',
        agents: [AGENTS.CFO],
        capabilities: ['finance_governance', 'ops_cost_visibility', 'priority_tradeoff_support'],
      },
      {
        id: 'phase_later',
        label: 'Planned',
        status: 'planned',
        agents: ['PATIENT_BETA_CHANNEL'],
        capabilities: [
          'patient_channel_beta_gate',
          'limited_rollout_allowlist',
          'conversion_signal_feedback_loop',
        ],
      },
    ],
  };
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

function enforceOutputSafety({ text, tenantRiskModifier, riskThresholdVersion = 1 }) {
  const initialPolicy = evaluatePolicyFloorText({
    text,
    context: 'orchestrator',
  });
  const initialRisk = evaluateTemplateRisk({
    scope: 'output',
    category: 'INTERNAL',
    content: text,
    tenantRiskModifier,
    riskThresholdVersion,
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
    riskThresholdVersion,
  });

  return {
    text: safeText,
    policy: safePolicy,
    risk: safeRisk,
    safetyAdjusted: true,
  };
}

const EXECUTABLE_STEP_MAP = Object.freeze({
  inspect_template_status: {
    capability: 'AssessTemplateLibraryHealth',
    input: { staleDays: 30 },
    autoExecuteAllowed: true,
  },
  generate_or_update_draft: {
    capability: 'GenerateAdminTemplateDraft',
    input: {},
    autoExecuteAllowed: true,
  },
  run_risk_policy_checks: {
    capability: 'ValidateDisclaimers',
    input: { strictMode: false },
    autoExecuteAllowed: true,
  },
  load_recent_audit_events: {
    capability: 'BuildAuditSummary',
    input: { limit: 100 },
    autoExecuteAllowed: true,
  },
  highlight_compliance_gaps: {
    capability: 'VerifyDecisionTraceability',
    input: {},
    autoExecuteAllowed: true,
  },
  route_to_owner_panel_action: {
    capability: 'AssessAdminQualityGate',
    input: {},
    autoExecuteAllowed: true,
  },
  classify_request: {
    capability: 'GenerateAdminDailyBrief',
    input: {},
    autoExecuteAllowed: true,
  },
});

const CAO_PRIMARY_INTENTS = new Set([
  INTENTS.TEMPLATE_LIBRARY,
  INTENTS.AUDIT_REVIEW,
  INTENTS.GENERAL_ADMIN,
]);

const MARKETING_PRIMARY_INTENTS = new Set([INTENTS.MARKETING_CAMPAIGN]);

const INTENT_AGENT_EXECUTE = Object.freeze({
  [INTENTS.MARKETING_CAMPAIGN]: {
    agentName: AGENTS.CMO,
    step: 'cmo_marketing_copilot_run',
    buildInput: ({ intent, prompt }) => ({
      maxTopics: 5,
      orchestratorIntent: intent,
      orchestratorPrompt: prompt,
    }),
  },
  [INTENTS.TEMPLATE_LIBRARY]: {
    agentName: AGENTS.CAO,
    step: 'cao_admin_operator_run',
    buildInput: ({ intent, prompt }) => ({
      maxSuggestions: 5,
      strictDisclaimers: false,
      orchestratorIntent: intent,
      orchestratorPrompt: prompt,
    }),
  },
  [INTENTS.AUDIT_REVIEW]: {
    agentName: AGENTS.CAO,
    step: 'cao_admin_operator_run',
    buildInput: ({ intent, prompt }) => ({
      maxSuggestions: 3,
      strictDisclaimers: true,
      orchestratorIntent: intent,
      orchestratorPrompt: prompt,
    }),
  },
  [INTENTS.GENERAL_ADMIN]: {
    agentName: AGENTS.CAO,
    step: 'cao_admin_operator_run',
    buildInput: ({ intent, prompt }) => ({
      maxSuggestions: 3,
      orchestratorIntent: intent,
      orchestratorPrompt: prompt,
    }),
  },
});

function buildExecutablePreview(plan = [], intent = '') {
  const executableSteps = buildExecutableSteps(plan);
  const agentMapping = INTENT_AGENT_EXECUTE[intent] || null;
  return {
    executableSteps,
    recommendedAgentRun: agentMapping
      ? {
          agent: agentMapping.agentName,
          intent,
          mode: 'execute',
          label:
            agentMapping.agentName === AGENTS.CMO
              ? 'Arcana Marketing Copilot (CMO) agent-run'
              : 'Arcana Admin Operator (CAO) agent-run',
        }
      : null,
  };
}

async function executeIntentAgentRun({ intent, prompt, executeContext, tenantId }) {
  const mapping = INTENT_AGENT_EXECUTE[intent];
  if (!mapping || typeof executeContext?.runAgent !== 'function') return null;
  const snapshot =
    typeof executeContext.hydrateSnapshot === 'function'
      ? await executeContext.hydrateSnapshot(mapping.agentName, intent, prompt)
      : {};
  const result = await executeContext.runAgent({
    tenantId,
    actor: executeContext.actor,
    channel: executeContext.channel || 'admin',
    agentName: mapping.agentName,
    input: mapping.buildInput({ intent, prompt }),
    systemStateSnapshot: {
      ...snapshot,
      orchestratorContext: { intent, prompt },
    },
    correlationId: executeContext.correlationId || '',
  });
  return {
    step: mapping.step || 'cao_admin_operator_run',
    agent: mapping.agentName,
    intent,
    decision: result?.gatewayResult?.decision || 'unknown',
    ok: result?.gatewayResult?.decision === 'allow',
  };
}

function buildExecutableSteps(plan = []) {
  const steps = Array.isArray(plan) ? plan : [];
  return steps
    .map((step) => {
      const mapping = EXECUTABLE_STEP_MAP[normalizeText(step?.step)];
      if (!mapping?.autoExecuteAllowed) return null;
      return {
        step: step.step,
        owner: step.owner,
        capability: mapping.capability,
        input: mapping.input,
      };
    })
    .filter(Boolean);
}

async function executeAdminPlanSteps({
  executableSteps = [],
  runCapability,
  hydrateSnapshot,
  tenantId,
  actor,
  channel = 'admin',
  correlationId = '',
}) {
  const snapshot = typeof hydrateSnapshot === 'function' ? await hydrateSnapshot() : {};
  const executed = [];
  for (const step of executableSteps) {
    try {
      const result = await runCapability({
        tenantId,
        actor,
        channel,
        capabilityName: step.capability,
        input: step.input || {},
        systemStateSnapshot: snapshot,
        correlationId,
      });
      executed.push({
        step: step.step,
        capability: step.capability,
        decision: result?.gatewayResult?.decision || 'unknown',
        ok: result?.gatewayResult?.decision === 'allow',
      });
    } catch (error) {
      executed.push({
        step: step.step,
        capability: step.capability,
        decision: 'error',
        ok: false,
        error: normalizeText(error?.message) || 'execute_failed',
      });
    }
  }
  return executed;
}

async function runAdminOrchestration({
  prompt,
  role,
  tenantId,
  tenantConfig,
  mode = 'plan',
  executeContext = null,
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
  const riskThresholdVersion = Number.parseInt(
    String(tenantConfig?.riskThresholdVersion ?? 1),
    10
  );
  const safeOutput = enforceOutputSafety({
    text: draftResponse,
    tenantRiskModifier,
    riskThresholdVersion:
      Number.isFinite(riskThresholdVersion) && riskThresholdVersion > 0
        ? riskThresholdVersion
        : 1,
  });

  const normalizedMode = normalizeText(mode).toLowerCase() || 'plan';
  const executableSteps = buildExecutableSteps(plan);
  const executePreview = buildExecutablePreview(plan, inference.intent);
  let executedSteps = [];

  if (normalizedMode === 'execute' && executeContext) {
    if (
      (CAO_PRIMARY_INTENTS.has(inference.intent) ||
        MARKETING_PRIMARY_INTENTS.has(inference.intent)) &&
      typeof executeContext.runAgent === 'function'
    ) {
      const agentStep = await executeIntentAgentRun({
        intent: inference.intent,
        prompt,
        executeContext,
        tenantId,
      });
      if (agentStep) executedSteps.push(agentStep);
    } else if (typeof executeContext.runCapability === 'function') {
      executedSteps = await executeAdminPlanSteps({
        executableSteps,
        runCapability: executeContext.runCapability,
        hydrateSnapshot: executeContext.hydrateSnapshot,
        tenantId,
        actor: executeContext.actor,
        channel: executeContext.channel || 'admin',
        correlationId: executeContext.correlationId || '',
      });
    }
  }

  return {
    tenantId,
    role,
    mode: normalizedMode,
    intent: inference.intent,
    confidence: inference.confidence,
    reasons: inference.reasons,
    selectedAgents,
    plan,
    executableSteps,
    executePreview,
    executedSteps,
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
  EXECUTABLE_STEP_MAP,
  CAO_PRIMARY_INTENTS,
  MARKETING_PRIMARY_INTENTS,
  INTENT_AGENT_EXECUTE,
  inferIntent,
  getOrchestratorRoadmap,
  buildExecutableSteps,
  buildExecutablePreview,
  executeAdminPlanSteps,
  executeIntentAgentRun,
  runAdminOrchestration,
};
