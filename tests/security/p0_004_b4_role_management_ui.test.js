'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLE_LABELS,
  ASSIGNABLE_ROLES,
  normalizeRoleChoice,
  buildInvitePayload,
} = require('../../public/staff-portal-role-management');

/**
 * P0-004 B-4 — OWNER Role Management UI (rena hjälpare).
 * Körs med ren Node: node --test tests/security/p0_004_b4_role_management_ui.test.js
 */

test('B-4: kanoniska roll-etiketter är mänskligt läsbara (svenska)', () => {
  assert.equal(ROLE_LABELS.OWNER, 'Ägare');
  assert.equal(ROLE_LABELS.KONSULT, 'Läkare / Konsult');
  assert.equal(ROLE_LABELS.PERSONAL, 'Personal / Sjuksköterska');
  assert.equal(ROLE_LABELS.FINANCE, 'Ekonomi');
  assert.equal(ROLE_LABELS.REVISOR, 'Revisor');
  assert.equal(ROLE_LABELS.OPERATOR, 'Legacy / Operatör');
});

test('B-4: väljbar rollista — OPERATOR endast explicit (inte default)', () => {
  assert.deepEqual(ASSIGNABLE_ROLES, ['KONSULT', 'PERSONAL', 'FINANCE', 'REVISOR', 'OPERATOR']);
});

test('B-4: normalizeRoleChoice accepterar bara kanoniska staff-roller', () => {
  assert.equal(normalizeRoleChoice('KONSULT'), 'KONSULT');
  assert.equal(normalizeRoleChoice('personal'), 'PERSONAL');
  assert.equal(normalizeRoleChoice('finance'), 'FINANCE');
  assert.equal(normalizeRoleChoice('REVISOR'), 'REVISOR');
  assert.equal(normalizeRoleChoice('OPERATOR'), 'OPERATOR');
  assert.equal(normalizeRoleChoice(''), '');
  assert.equal(normalizeRoleChoice('ADMIN'), '');
  assert.equal(normalizeRoleChoice('OWNER'), '');
  assert.equal(normalizeRoleChoice(null), '');
});

test('B-4: buildInvitePayload bygger korrekt payload för varje canonical roll', () => {
  for (const [role, expected] of [
    ['KONSULT', 'KONSULT'],
    ['PERSONAL', 'PERSONAL'],
    ['FINANCE', 'FINANCE'],
    ['REVISOR', 'REVISOR'],
  ]) {
    const p = buildInvitePayload({ email: 'x@y.se', password: 'pw', role });
    assert.deepEqual(p, { email: 'x@y.se', password: 'pw', role: expected });
  }
});

test('B-4: buildInvitePayload fail-closed på saknad/ogiltig roll (ingen tyst OPERATOR)', () => {
  assert.equal(buildInvitePayload({ email: 'x@y.se', password: 'pw', role: '' }), null);
  assert.equal(buildInvitePayload({ email: 'x@y.se', password: 'pw' }), null);
  assert.equal(buildInvitePayload({ email: 'x@y.se', password: 'pw', role: 'ADMIN' }), null);
  assert.equal(buildInvitePayload({ email: '', password: 'pw', role: 'PERSONAL' }), null);
  assert.equal(buildInvitePayload({ email: 'x@y.se', password: '', role: 'PERSONAL' }), null);
});
