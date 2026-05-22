const test = require('node:test');
const assert = require('node:assert/strict');

const { RUNTIME_PROFILES, getRuntimeProfile } = require('../../src/agents/runtimeRegistry');

test('getRuntimeProfile returns patient profile for patient channel', () => {
  const p = getRuntimeProfile(' patient ');
  assert.equal(p, RUNTIME_PROFILES.patient);
  assert.equal(p.domain, 'patient');
  assert.ok(p.toolAllowlist.includes('clinic_knowledge_search'));
  assert.equal(p.guardrails.requiresPiiRedaction, true);
});

test('getRuntimeProfile defaults to admin for unknown channel', () => {
  assert.equal(getRuntimeProfile(''), RUNTIME_PROFILES.admin);
  assert.equal(getRuntimeProfile('staff'), RUNTIME_PROFILES.admin);
  assert.equal(getRuntimeProfile('ADMIN'), RUNTIME_PROFILES.admin);
});

test('getRuntimeProfile utan argument ger admin', () => {
  assert.equal(getRuntimeProfile(), RUNTIME_PROFILES.admin);
});

test('getRuntimeProfile faller tillbaka till admin for nullish eller icke-sträng', () => {
  assert.equal(getRuntimeProfile(null), RUNTIME_PROFILES.admin);
  assert.equal(getRuntimeProfile(undefined), RUNTIME_PROFILES.admin);
  assert.equal(getRuntimeProfile(42), RUNTIME_PROFILES.admin);
});

test('getRuntimeProfile kanner igen patient oberoende av casing', () => {
  assert.equal(getRuntimeProfile('PATIENT'), RUNTIME_PROFILES.patient);
  assert.equal(getRuntimeProfile('Patient'), RUNTIME_PROFILES.patient);
});

test('getRuntimeProfile kraver exakt patient-kanal inte substring', () => {
  assert.equal(getRuntimeProfile('patient_portal'), RUNTIME_PROFILES.admin);
  assert.equal(getRuntimeProfile('the_patient'), RUNTIME_PROFILES.admin);
});

test('RUNTIME_PROFILES object graph is frozen', () => {
  assert.equal(Object.isFrozen(RUNTIME_PROFILES), true);
  assert.equal(Object.isFrozen(RUNTIME_PROFILES.admin), true);
  assert.equal(Object.isFrozen(RUNTIME_PROFILES.patient.toolAllowlist), true);
});

test('RUNTIME_PROFILES admin har forvantad identitet och verktygslista', () => {
  const { admin } = RUNTIME_PROFILES;
  assert.equal(admin.id, 'admin-runtime.v1');
  assert.equal(admin.domain, 'admin');
  assert.equal(admin.policyProfile, 'admin_policy_floor.v1');
  assert.ok(admin.toolAllowlist.includes('templates'));
  assert.equal(admin.maxTurns, 4);
});

test('RUNTIME_PROFILES admin saknar patient-specifika guardrails', () => {
  assert.equal(RUNTIME_PROFILES.admin.guardrails, undefined);
});

test('RUNTIME_PROFILES patient har forvantade guardrails', () => {
  const { patient } = RUNTIME_PROFILES;
  assert.equal(patient.id, 'patient-runtime.v1');
  assert.equal(patient.policyProfile, 'patient_safety_floor.v1');
  assert.equal(patient.guardrails.requiresKillSwitch, true);
  assert.equal(patient.guardrails.requiresPromptInjectionFilter, true);
  assert.equal(patient.guardrails.requiresHumanHandoff, true);
});

test('toolAllowlist values är unika per profil', () => {
  const adminTools = RUNTIME_PROFILES.admin.toolAllowlist;
  const patientTools = RUNTIME_PROFILES.patient.toolAllowlist;
  assert.equal(new Set(adminTools).size, adminTools.length);
  assert.equal(new Set(patientTools).size, patientTools.length);
});
