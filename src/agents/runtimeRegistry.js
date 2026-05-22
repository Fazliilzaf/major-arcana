function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const RUNTIME_PROFILES = Object.freeze({
  admin: Object.freeze({
    id: 'admin-runtime.v1',
    domain: 'admin',
    policyProfile: 'admin_policy_floor.v1',
    toolAllowlist: Object.freeze([
      'templates',
      'risk_panel',
      'tenant_config',
      'audit_review',
      'incident_workflow',
    ]),
    maxTurns: 4,
  }),
  patient: Object.freeze({
    id: 'patient-runtime.v1',
    domain: 'patient',
    policyProfile: 'patient_safety_floor.v1',
    toolAllowlist: Object.freeze(['clinic_knowledge_search', 'booking_handoff']),
    maxTurns: 4,
    guardrails: Object.freeze({
      requiresKillSwitch: true,
      requiresPromptInjectionFilter: true,
      requiresHumanHandoff: true,
      requiresPiiRedaction: true,
    }),
  }),
});

function getRuntimeProfile(channel = '') {
  const normalized = normalizeText(channel).toLowerCase();
  if (normalized === 'patient') return RUNTIME_PROFILES.patient;
  return RUNTIME_PROFILES.admin;
}

module.exports = {
  RUNTIME_PROFILES,
  getRuntimeProfile,
};
