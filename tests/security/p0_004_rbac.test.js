'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PERMISSIONS,
  normalizeRole,
  roleHasPermission,
  listPermissionsForRole,
  getRoleFromRequest,
} = require('../../src/security/ccoRbac');

/**
 * P0-004 — BESLUT A (fryst).
 *
 * Kanoniska roller: owner / konsult / personal / finance (+ revisor).
 * OPERATOR är en TEKNISK LEGACY-/ÖVERGÅNGSROLL (migreringsbro för gamla STAFF).
 * Personal = sjuksköterska/operativ — kundtråd + live reply, booking (läs),
 * relevant journal. INTE global mail.send (ORD-198 bevarad).
 * Körs med ren Node: `node --test tests/security/p0_004_rbac.test.js`.
 */

test('normalisering: canonical owner/konsult/personal/finance/revisor bevaras', () => {
  assert.equal(normalizeRole('owner'), 'owner');
  assert.equal(normalizeRole('OWNER'), 'owner');
  assert.equal(normalizeRole('konsult'), 'konsult');
  assert.equal(normalizeRole('personal'), 'personal');
  assert.equal(normalizeRole('finance'), 'finance');
  assert.equal(normalizeRole('revisor'), 'revisor');
});

test('beslut A: operator är en egen legacy-/övergångsroll, inte personal', () => {
  assert.equal(normalizeRole('operator'), 'operator');
  assert.equal(normalizeRole('OPERATOR'), 'operator');
  assert.equal(normalizeRole('staff'), 'operator');
  assert.equal(normalizeRole('STAFF'), 'operator');
});

test('normalisering: klinisk doctor → konsult, patient separat, ghosts fail-closed', () => {
  assert.equal(normalizeRole('doctor'), 'konsult');
  assert.equal(normalizeRole('DOCTOR'), 'konsult');
  assert.equal(normalizeRole('patient'), null);
  assert.equal(normalizeRole('PATIENT'), null);
  assert.equal(normalizeRole('admin'), null);
  assert.equal(normalizeRole('dpo'), null);
  assert.equal(normalizeRole('staff_assistant'), null);
  assert.equal(normalizeRole(''), null);
  assert.equal(normalizeRole(null), null);
});

test('ordination.approve: OWNER + KONSULT, aldrig operator/personal/finance', () => {
  assert.equal(roleHasPermission('owner', 'ordination.approve'), true);
  assert.equal(roleHasPermission('konsult', 'ordination.approve'), true);
  assert.equal(roleHasPermission('operator', 'ordination.approve'), false);
  assert.equal(roleHasPermission('personal', 'ordination.approve'), false);
  assert.equal(roleHasPermission('finance', 'ordination.approve'), false);
});

test('bookings.conflict_override: separat permission, följer INTE bookings.write', () => {
  assert.equal(roleHasPermission('owner', 'bookings.conflict_override'), true);
  assert.equal(roleHasPermission('personal', 'bookings.conflict_override'), true);
  assert.equal(roleHasPermission('operator', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('konsult', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('finance', 'bookings.conflict_override'), false);
  // konsult har bookings.write men INTE conflict_override
  assert.equal(roleHasPermission('konsult', 'bookings.write'), true);
  assert.equal(roleHasPermission('konsult', 'bookings.conflict_override'), false);
  // B-1: personal har bookings.read OCH bookings.write (operativ bokningspersonal)
  assert.equal(roleHasPermission('personal', 'bookings.read'), true);
  assert.equal(roleHasPermission('personal', 'bookings.write'), true);
});

test('mail.live_send: owner + konsult + personal (P0-004), INTE operator/finance', () => {
  assert.equal(roleHasPermission('owner', 'mail.live_send'), true);
  assert.equal(roleHasPermission('konsult', 'mail.live_send'), true);
  assert.equal(roleHasPermission('personal', 'mail.live_send'), true);
  assert.equal(roleHasPermission('operator', 'mail.live_send'), false);
  assert.equal(roleHasPermission('finance', 'mail.live_send'), false);
});

test('ORD-198: mail.send/mail.read INTE för personal; portal.thread_reply INKLUSIVE personal', () => {
  assert.equal(roleHasPermission('personal', 'mail.send'), false);
  assert.equal(roleHasPermission('personal', 'mail.read'), false);
  assert.equal(roleHasPermission('personal', 'mail.write'), false);
  assert.equal(roleHasPermission('operator', 'mail.send'), true);
  assert.equal(roleHasPermission('konsult', 'mail.send'), true);
  // smala kundkanalen — alla fyra
  assert.equal(roleHasPermission('personal', 'portal.thread_reply'), true);
  assert.equal(roleHasPermission('personal', 'portal.thread_read'), true);
  assert.equal(roleHasPermission('operator', 'portal.thread_reply'), true);
});

test('journal: owner + operator/konsult + relevant personal, INTE finance', () => {
  assert.equal(roleHasPermission('owner', 'journal.read_any'), true);
  assert.equal(roleHasPermission('konsult', 'journal.read_any'), true);
  assert.equal(roleHasPermission('operator', 'journal.read_any'), true);
  assert.equal(roleHasPermission('personal', 'journal.read_any'), false);
  assert.equal(roleHasPermission('finance', 'journal.read_any'), false);
  assert.equal(roleHasPermission('personal', 'journal.read_own'), true);
  assert.equal(roleHasPermission('personal', 'journal.write'), true);
  assert.equal(roleHasPermission('finance', 'journal.write'), false);
  assert.equal(roleHasPermission('personal', 'journal.unlock'), false);
});

test('finance/CFO: owner + finance/revisor, INTE personal/konsult/operator', () => {
  assert.equal(roleHasPermission('owner', 'billing.read'), true);
  assert.equal(roleHasPermission('finance', 'billing.read'), true);
  assert.equal(roleHasPermission('revisor', 'billing.read'), true);
  assert.equal(roleHasPermission('owner', 'billing.write'), true);
  assert.equal(roleHasPermission('finance', 'billing.write'), true);
  // B-3: revisor har fulla ekonomirättigheter (write/approve/close).
  assert.equal(roleHasPermission('revisor', 'billing.write'), true);
  assert.equal(roleHasPermission('personal', 'billing.read'), false);
  assert.equal(roleHasPermission('konsult', 'billing.read'), false);
});

test('admin: owner-only', () => {
  for (const perm of [
    'staff.manage',
    'settings.write',
    'users.invite',
    'users.role_change',
    'customers.delete',
    'offer.delete',
    'agreement.delete',
  ]) {
    assert.equal(roleHasPermission('owner', perm), true, `owner saknar ${perm}`);
    assert.equal(roleHasPermission('operator', perm), false, `operator har ${perm}`);
    assert.equal(roleHasPermission('konsult', perm), false, `konsult har ${perm}`);
    assert.equal(roleHasPermission('personal', perm), false, `personal har ${perm}`);
    assert.equal(roleHasPermission('finance', perm), false, `finance har ${perm}`);
  }
});

test('listPermissionsForRole: personal är operativ men INTE klinisk/finansiell/admin', () => {
  const personal = new Set(listPermissionsForRole('personal'));
  assert.ok(personal.has('bookings.read'));
  assert.ok(personal.has('portal.thread_reply'));
  assert.ok(personal.has('journal.read_own'));
  assert.ok(personal.has('journal.write'));
  assert.ok(personal.has('customers.read'));
  assert.ok(!personal.has('mail.send'));
  assert.ok(personal.has('bookings.write')); // B-1
  assert.ok(!personal.has('ordination.approve'));
  assert.ok(!personal.has('billing.read'));
  assert.ok(!personal.has('staff.manage'));
});

test('listPermissionsForRole: finance är ekonomisk men INTE klinisk', () => {
  const finance = new Set(listPermissionsForRole('finance'));
  assert.ok(finance.has('billing.read'));
  assert.ok(finance.has('billing.write'));
  assert.ok(!finance.has('journal.write'));
  assert.ok(!finance.has('ordination.approve'));
  assert.ok(!finance.has('mail.send'));
});

test('getRoleFromRequest: verifierad auth-roll styr, aldrig klient-header i produktion', () => {
  const saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(getRoleFromRequest({ auth: { role: 'STAFF' } }), 'operator');
    assert.equal(getRoleFromRequest({ auth: { role: 'KONSULT' } }), 'konsult');
    assert.equal(
      getRoleFromRequest({ cco: { role: 'personal' }, auth: { role: 'STAFF' } }),
      'personal'
    );
    assert.equal(getRoleFromRequest({ headers: { 'x-cco-role': 'owner' } }), 'anonymous');
    assert.equal(getRoleFromRequest({}), 'anonymous');
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('getRoleFromRequest: x-cco-role hjälper bara utanför produktion', () => {
  const saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    assert.equal(getRoleFromRequest({ headers: { 'x-cco-role': 'konsult' } }), 'konsult');
    assert.equal(getRoleFromRequest({ headers: { 'x-cco-role': 'admin' } }), 'anonymous');
  } finally {
    process.env.NODE_ENV = saved;
  }
});

test('PERMISSIONS: alla nycklar refererar bara giltiga roller (inga ghosts kvar)', () => {
  const allowed = new Set(['owner', 'operator', 'konsult', 'personal', 'revisor', 'finance']);
  for (const [perm, roles] of Object.entries(PERMISSIONS)) {
    assert.ok(Array.isArray(roles), `${perm} ska vara en array`);
    for (const role of roles) {
      assert.ok(allowed.has(role), `permission ${perm} refererar okänd roll "${role}" (ghost)`);
    }
  }
});

test('kanoniska nyckelpermissions existerar och är välformade', () => {
  for (const perm of [
    'ordination.approve',
    'bookings.conflict_override',
    'bookings.write',
    'bookings.read',
    'mail.live_send',
    'mail.send',
    'portal.thread_reply',
    'journal.read_any',
    'journal.read_own',
    'journal.write',
    'billing.read',
    'billing.write',
    'settings.write',
    'staff.manage',
  ]) {
    assert.ok(Array.isArray(PERMISSIONS[perm]), `permission ${perm} saknas eller är inte array`);
    assert.ok(PERMISSIONS[perm].length > 0, `permission ${perm} har inga roller`);
  }
});
