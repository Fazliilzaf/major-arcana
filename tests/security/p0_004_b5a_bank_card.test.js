'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { FINANCE_ROLES, requireAnyRole } = require('../../src/security/ccoRbac');

/**
 * P0-004 — B-5a: bank + kort-avstämning för REVISOR (canonical FINANCE_ROLES).
 * Körs med ren Node: node --test tests/security/p0_004_b5a_bank_card.test.js
 */

const BANK_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'cfoBankReconciliation.js'),
  'utf8'
);
const CARD_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'cfoCardReconciliation.js'),
  'utf8'
);

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
    if (!passed) resolve(false);
  });
}

test('B-5a: bank-rutterna använder kanonisk FINANCE_ROLES (ingen owner-only kvar)', () => {
  assert.match(BANK_SRC, /requireAnyRole\(FINANCE_ROLES\)/);
  assert.doesNotMatch(BANK_SRC, /requireRole\(ROLE_OWNER\)/);
  assert.doesNotMatch(BANK_SRC, /role:\s*ROLE_OWNER/);
});

test('B-5a: kort-rutterna använder kanonisk FINANCE_ROLES (ingen owner-only kvar)', () => {
  assert.match(CARD_SRC, /requireAnyRole\(FINANCE_ROLES\)/);
  assert.doesNotMatch(CARD_SRC, /requireRole\(ROLE_OWNER\)/);
  assert.doesNotMatch(CARD_SRC, /role:\s*ROLE_OWNER/);
});

test('B-5a: owner/finance/revisor får bank+card; personal/konsult/operator/patient nekas', async () => {
  assert.equal(await guardPasses('owner'), true);
  assert.equal(await guardPasses('finance'), true);
  assert.equal(await guardPasses('revisor'), true);
  assert.equal(await guardPasses('personal'), false);
  assert.equal(await guardPasses('konsult'), false);
  assert.equal(await guardPasses('operator'), false);
  assert.equal(await guardPasses('patient'), false);
  assert.equal(await guardPasses('anonymous'), false);
});

test('B-5a: revisor förblir non-clinical / non-admin (bank+card ger ingen annan access)', () => {
  const { roleHasPermission } = require('../../src/security/ccoRbac');
  assert.equal(roleHasPermission('revisor', 'journal.write'), false);
  assert.equal(roleHasPermission('revisor', 'ordination.approve'), false);
  assert.equal(roleHasPermission('revisor', 'bookings.write'), false);
  assert.equal(roleHasPermission('revisor', 'staff.manage'), false);
  assert.equal(roleHasPermission('revisor', 'settings.write'), false);
});
