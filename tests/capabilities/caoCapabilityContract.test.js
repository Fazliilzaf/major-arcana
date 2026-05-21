const test = require('node:test');
const assert = require('node:assert/strict');

const { getAgentBundleByName, getCapabilityByName } = require('../../src/capabilities/registry');
const { validateCapabilityClass } = require('../../src/capabilities/capabilityContract');
const { buildCaoCapabilitySnapshot } = require('../fixtures/caoCapabilitySnapshot');

const CAO_BUNDLE = getAgentBundleByName('CAO');
assert.ok(CAO_BUNDLE, 'CAO bundle must exist for contract tests');

test('all CAO bundle capabilities pass capability contract validation', () => {
  for (const capabilityName of CAO_BUNDLE.capabilities) {
    const capabilityClass = getCapabilityByName(capabilityName);
    assert.ok(capabilityClass, `missing capability class: ${capabilityName}`);
    const validation = validateCapabilityClass(capabilityClass);
    assert.equal(
      validation.ok,
      true,
      `${capabilityName}: ${validation.errors.join('; ')}`
    );
  }
});

test('CAO extended capabilities execute with shared snapshot fixture', async () => {
  const snapshot = buildCaoCapabilitySnapshot();
  const extended = [
    'AssessTemplateLibraryHealth',
    'AssessAdminQualityGate',
    'GenerateAdminTemplateDraft',
    'AuditDocumentationMetadata',
    'ProposeDocumentStructure',
    'SummarizeIncidentAdmin',
    'FlagUnownedIncidents',
    'BuildAuditSummary',
    'VerifyDecisionTraceability',
    'TenantAdminHealthSummary',
    'GenerateAdminDailyBrief',
    'GenerateAdminWeeklyBrief',
    'ExplainReadinessScore',
    'GenerateGoNoGoBrief',
  ];

  for (const capabilityName of extended) {
    const capabilityClass = getCapabilityByName(capabilityName);
    assert.ok(capabilityClass, capabilityName);
    const instance = new capabilityClass();
    const result = await instance.execute({
      input: {},
      systemStateSnapshot: snapshot,
      tenantId: 'tenant-a',
      actor: { id: 'owner-a', role: 'OWNER' },
      channel: 'admin',
    });
    assert.ok(result, `${capabilityName} returned no result`);
    assert.ok(result.data && typeof result.data === 'object', `${capabilityName} missing data`);
    assert.ok(Array.isArray(result.warnings), `${capabilityName} missing warnings array`);
  }
});

test('GenerateGoNoGoBrief contract output fields', async () => {
  const capabilityClass = getCapabilityByName('GenerateGoNoGoBrief');
  const result = await new capabilityClass().execute({
    systemStateSnapshot: buildCaoCapabilitySnapshot(),
  });
  assert.equal(result.data.outputType, 'GoNoGoBrief');
  assert.equal(typeof result.data.summary, 'string');
  assert.ok(Array.isArray(result.data.recommendations));
  assert.equal(result.data.ownerDecisionRequired, true);
});
