'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeComplianceStatus } = require('../../src/ops/complianceCommandCenter');

test('default: areas finns och overall beräknas (mfa saknas → red)', () => {
  const r = computeComplianceStatus();
  assert.ok(Array.isArray(r.areas) && r.areas.length > 0);
  assert.ok(r.areas.some((a) => a.id === 'gdpr'));
  assert.ok(['green', 'yellow', 'red'].includes(r.overall.status));
  assert.equal(r.overall.total, r.areas.length);
  // utan mfaStatus är MFA-området rött → overall rött
  assert.equal(r.overall.status, 'red');
});

test('patientChatEnabled → PDL blir yellow med gap + nextAction', () => {
  const r = computeComplianceStatus({ patientChatEnabled: true });
  const pdl = r.areas.find((a) => a.id === 'pdl');
  assert.equal(pdl.status, 'yellow');
  assert.ok(pdl.gap);
  assert.ok(pdl.nextAction);
});

test('mfa compliant → inget rött kvar → overall yellow (ISO/SOC2 fortfarande yellow)', () => {
  const r = computeComplianceStatus({ mfaStatus: { allOwnersCompliant: true } });
  assert.equal(r.overall.red, 0);
  assert.equal(r.overall.status, 'yellow');
});

test('audit-integritet med issues → red-område', () => {
  const r = computeComplianceStatus({
    auditIntegrity: { issues: 3 },
    mfaStatus: { allOwnersCompliant: true },
  });
  assert.ok(r.overall.red >= 1);
  assert.equal(r.overall.status, 'red');
});
