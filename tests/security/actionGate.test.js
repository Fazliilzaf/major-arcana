'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateAction, classifyAction, ACTION_LEVELS, APPROVAL_CLASSES } = require('../../src/security/actionGate');

function ctx(over = {}) {
  return {
    userId: 'anna',
    tenantId: 'hair-tp-clinic',
    role: 'PERSONAL',
    agent: 'CMO',
    action: 'website.read',
    resource: 'home',
    hasEntitlement: true,
    isDisabled: false,
    ...over,
  };
}

test('WP-007: READ (CMO website.read) → ALLOW', () => {
  assert.equal(evaluateAction(ctx()).decision, 'ALLOW');
});

test('WP-007: DRAFT (CMO website.draft) → ALLOW', () => {
  assert.equal(evaluateAction(ctx({ action: 'website.draft' })).decision, 'ALLOW');
});

test('WP-007: PREVIEW (CMO website.preview) → ALLOW', () => {
  assert.equal(evaluateAction(ctx({ action: 'website.preview' })).decision, 'ALLOW');
});

test('WP-007: WRITE (CMO website.write) → DENY (v1)', () => {
  const r = evaluateAction(ctx({ action: 'website.write' }));
  assert.equal(r.decision, 'DENY');
  assert.equal(r.reason, 'write_not_allowed_in_v1');
});

test('WP-007: DEPLOY → REQUIRE_APPROVAL (RELEASE_APPROVAL)', () => {
  const r = evaluateAction(ctx({ agent: 'COO', action: 'ops.deploy' }));
  assert.equal(r.decision, 'REQUIRE_APPROVAL');
  assert.equal(r.approval, 'RELEASE_APPROVAL');
});

test('WP-007: RESTRICTED (secrets.rotate) → REQUIRE_APPROVAL (OWNER_APPROVAL)', () => {
  const r = evaluateAction(ctx({ action: 'secrets.rotate' }));
  assert.equal(r.decision, 'REQUIRE_APPROVAL');
  assert.equal(r.approval, 'OWNER_APPROVAL');
});

test('WP-007: okänd action → DENY (fail-closed)', () => {
  assert.equal(evaluateAction(ctx({ action: 'totally.unknown.thing' })).decision, 'DENY');
});

test('WP-007: okänd agent → DENY', () => {
  assert.equal(evaluateAction(ctx({ agent: 'XYZ' })).decision, 'DENY');
});

test('WP-007: ingen entitlement → DENY', () => {
  assert.equal(evaluateAction(ctx({ hasEntitlement: false })).decision, 'DENY');
});

test('WP-007: disabled staff → DENY', () => {
  assert.equal(evaluateAction(ctx({ isDisabled: true })).decision, 'DENY');
});

test('WP-007: tenant mismatch → DENY', () => {
  assert.equal(evaluateAction(ctx({ expectedTenant: 'other-tenant' })).decision, 'DENY');
});

test('WP-007: saknad identitet → DENY', () => {
  assert.equal(evaluateAction(ctx({ userId: '' })).decision, 'DENY');
});

test('WP-007: CMO-policy kan inte användas i CFO-context', () => {
  // CFO har inte website.*-prefix.
  assert.equal(evaluateAction(ctx({ agent: 'CFO', action: 'website.draft' })).decision, 'DENY');
});

test('WP-007: CFO får finance.report (READ)', () => {
  assert.equal(evaluateAction(ctx({ agent: 'CFO', action: 'finance.report' })).decision, 'ALLOW');
});

test('WP-007: classifyAction nivåer', () => {
  assert.equal(classifyAction('website.read'), 'READ');
  assert.equal(classifyAction('website.draft'), 'DRAFT');
  assert.equal(classifyAction('website.preview'), 'PREVIEW');
  assert.equal(classifyAction('website.write'), 'WRITE');
  assert.equal(classifyAction('ops.deploy'), 'DEPLOY');
  assert.equal(classifyAction('secrets.rotate'), 'RESTRICTED');
  assert.equal(classifyAction('gibberish'), '');
});

test('WP-007: canonical nivåer + approval-klasser', () => {
  assert.deepEqual(ACTION_LEVELS, ['READ', 'DRAFT', 'PREVIEW', 'WRITE', 'DEPLOY', 'RESTRICTED']);
  assert.ok(APPROVAL_CLASSES.includes('OWNER_APPROVAL'));
  assert.ok(APPROVAL_CLASSES.includes('RELEASE_APPROVAL'));
  assert.ok(APPROVAL_CLASSES.includes('CLINICAL_APPROVAL'));
});

test('WP-007: chat är ALLOW för alla (advisory)', () => {
  for (const a of ['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']) {
    assert.equal(evaluateAction(ctx({ agent: a, action: 'chat' })).decision, 'ALLOW', a);
  }
});
