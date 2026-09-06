'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { FINANCE_ROLES, requireAnyRole, roleHasPermission } = require('../../src/security/ccoRbac');

/**
 * P0-004 — B-5: revisor har FULLA ekonomirättigheter, men non-clinical/non-admin.
 * Körs med ren Node: node --test tests/security/p0_004_b5_finance.test.js
 */

test('B-5: FINANCE_ROLES är den enda kanoniska finanslistan (owner/finance/revisor)', () => {
  assert.deepEqual(FINANCE_ROLES, ['owner', 'finance', 'revisor']);
});

function guardPasses(role) {
  const middleware = requireAnyRole(FINANCE_ROLES);
  return new Promise((resolve) => {
    let passed = false;
    const req = { auth: { role }, headers: {} };
    const res = { status: () => ({ json: () => {} }) };
    middleware(req, res, () => {
      passed = true;
      resolve(true);
    });
    // requireAnyRole är synkron → om next inte kallats, neka.
    if (!passed) resolve(false);
  });
}

test('B-5: owner/finance/revisor passerar finansgrinden; personal/konsult/operator/patient nekas', async () => {
  assert.equal(await guardPasses('owner'), true);
  assert.equal(await guardPasses('finance'), true);
  assert.equal(await guardPasses('revisor'), true);
  assert.equal(await guardPasses('personal'), false);
  assert.equal(await guardPasses('konsult'), false);
  assert.equal(await guardPasses('operator'), false);
  assert.equal(await guardPasses('patient'), false);
  assert.equal(await guardPasses('anonymous'), false);
});

test('B-5: revisor har fulla ekonomirättigheter (read+write)', () => {
  assert.equal(roleHasPermission('revisor', 'billing.read'), true);
  assert.equal(roleHasPermission('revisor', 'billing.write'), true);
});

test('B-5: revisor är non-clinical / non-customer / non-admin', () => {
  assert.equal(roleHasPermission('revisor', 'journal.read_any'), false);
  assert.equal(roleHasPermission('revisor', 'journal.write'), false);
  assert.equal(roleHasPermission('revisor', 'ordination.approve'), false);
  assert.equal(roleHasPermission('revisor', 'bookings.write'), false);
  assert.equal(roleHasPermission('revisor', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('revisor', 'mail.live_send'), false);
  assert.equal(roleHasPermission('revisor', 'portal.thread_reply'), false);
  assert.equal(roleHasPermission('revisor', 'customers.write'), false);
  assert.equal(roleHasPermission('revisor', 'staff.manage'), false);
  assert.equal(roleHasPermission('revisor', 'settings.write'), false);
  assert.equal(roleHasPermission('revisor', 'users.invite'), false);
});

test('B-5: personal/konsult/operator får ingen CFO-elevation', () => {
  for (const role of ['personal', 'konsult', 'operator']) {
    assert.equal(roleHasPermission(role, 'billing.read'), false, `${role} har billing.read`);
    assert.equal(roleHasPermission(role, 'billing.write'), false, `${role} har billing.write`);
  }
});
