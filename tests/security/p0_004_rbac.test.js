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
 * P0-004 — fryst kanonisk rollmodell (Product Owner).
 *
 * Täcker normalisering (granularitet får aldrig kollapsa), legacy-alias,
 * fail-closed-ghostar och den frysta permission-matrisen. Körs med ren Node
 * (ingen express) — `node --test tests/security/p0_004_rbac.test.js`.
 */

test('normalisering: canonical owner/konsult/personal/finance bevarar granularitet', () => {
  assert.equal(normalizeRole('owner'), 'owner');
  assert.equal(normalizeRole('OWNER'), 'owner');
  assert.equal(normalizeRole('konsult'), 'konsult');
  assert.equal(normalizeRole('KONSULT'), 'konsult');
  assert.equal(normalizeRole('personal'), 'personal');
  assert.equal(normalizeRole('PERSONAL'), 'personal');
  assert.equal(normalizeRole('finance'), 'finance');
  assert.equal(normalizeRole('FINANCE'), 'finance');
});

test('normalisering: patient är separat trust-modell och blir aldrig staff', () => {
  assert.equal(normalizeRole('patient'), 'anonymous');
  assert.equal(normalizeRole('PATIENT'), 'anonymous');
  assert.equal(roleHasPermission('patient', 'customers.read'), false);
  assert.equal(roleHasPermission('PATIENT', 'ordination.approve'), false);
});

test('normalisering: legacy-alias mappas till kanonisk roll, inte till topproll', () => {
  assert.equal(normalizeRole('STAFF'), 'personal'); // legacy default (Fazli-safe)
  assert.equal(normalizeRole('staff'), 'personal');
  assert.equal(normalizeRole('OPERATOR'), 'personal');
  assert.equal(normalizeRole('operator'), 'personal');
  assert.equal(normalizeRole('REVISOR'), 'finance');
  assert.equal(normalizeRole('revisor'), 'finance');
  assert.equal(normalizeRole('DOCTOR'), 'konsult');
  assert.equal(normalizeRole('doctor'), 'konsult');
});

test('normalisering: före detta ghosts fail-closed (inga falska permissions)', () => {
  assert.equal(normalizeRole('dpo'), 'anonymous');
  assert.equal(normalizeRole('DPO'), 'anonymous');
  assert.equal(normalizeRole('staff_assistant'), 'anonymous');
  assert.equal(normalizeRole('STAFF_ASSISTANT'), 'anonymous');
  assert.equal(normalizeRole('admin'), 'anonymous');
  assert.equal(normalizeRole('ADMIN'), 'anonymous');
  assert.equal(normalizeRole(''), 'anonymous');
  assert.equal(normalizeRole(null), 'anonymous');
});

test('ordination.approve: OWNER + KONSULT, aldrig personal/finance/patient', () => {
  assert.equal(roleHasPermission('owner', 'ordination.approve'), true);
  assert.equal(roleHasPermission('konsult', 'ordination.approve'), true);
  assert.equal(roleHasPermission('personal', 'ordination.approve'), false);
  assert.equal(roleHasPermission('finance', 'ordination.approve'), false);
  assert.equal(roleHasPermission('patient', 'ordination.approve'), false);
  // Legacy STAFF → personal, alltså fortfarande nekad.
  assert.equal(roleHasPermission('STAFF', 'ordination.approve'), false);
});

test('bookings.conflict_override: separat behörighet, följer INTE bookings.write', () => {
  // owner + särskilt behörig personal
  assert.equal(roleHasPermission('owner', 'bookings.conflict_override'), true);
  assert.equal(roleHasPermission('personal', 'bookings.conflict_override'), true);
  assert.equal(roleHasPermission('konsult', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('finance', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('patient', 'bookings.conflict_override'), false);
  // Konsult har bookings.write men INTE conflict_override — garantin om
  // att override är en egen permission.
  assert.equal(roleHasPermission('konsult', 'bookings.write'), true);
  assert.equal(roleHasPermission('konsult', 'bookings.conflict_override'), false);
  // Vanlig operational personal har både write och override (initial grant).
  assert.equal(roleHasPermission('personal', 'bookings.write'), true);
  assert.equal(roleHasPermission('personal', 'bookings.conflict_override'), true);
});

test('mail.live_send: owner + konsult + personal (inte längre owner-only)', () => {
  assert.equal(roleHasPermission('owner', 'mail.live_send'), true);
  assert.equal(roleHasPermission('konsult', 'mail.live_send'), true);
  assert.equal(roleHasPermission('personal', 'mail.live_send'), true);
  assert.equal(roleHasPermission('finance', 'mail.live_send'), false);
  assert.equal(roleHasPermission('patient', 'mail.live_send'), false);
  // P0-003 safety: mail.write/mail.send finns kvar och separata.
  assert.equal(roleHasPermission('personal', 'mail.send'), true);
  assert.equal(roleHasPermission('personal', 'mail.write'), true);
  assert.equal(roleHasPermission('finance', 'mail.send'), false);
});

test('journal: owner + konsult + relevant personal, INTE finance', () => {
  // read_any reserverad owner + konsult
  assert.equal(roleHasPermission('owner', 'journal.read_any'), true);
  assert.equal(roleHasPermission('konsult', 'journal.read_any'), true);
  assert.equal(roleHasPermission('personal', 'journal.read_any'), false);
  assert.equal(roleHasPermission('finance', 'journal.read_any'), false);
  // read_own finnas för personal
  assert.equal(roleHasPermission('personal', 'journal.read_own'), true);
  assert.equal(roleHasPermission('finance', 'journal.read_own'), false);
  assert.equal(roleHasPermission('personal', 'journal.write'), true);
  assert.equal(roleHasPermission('finance', 'journal.write'), false);
  // lock/unlock är känsligare
  assert.equal(roleHasPermission('personal', 'journal.unlock'), false);
  assert.equal(roleHasPermission('owner', 'journal.unlock'), true);
});

test('finance/CFO: owner + finance, INTE personal/konsult', () => {
  assert.equal(roleHasPermission('owner', 'billing.read'), true);
  assert.equal(roleHasPermission('finance', 'billing.read'), true);
  assert.equal(roleHasPermission('owner', 'billing.write'), true);
  assert.equal(roleHasPermission('finance', 'billing.write'), true);
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
    assert.equal(roleHasPermission('konsult', perm), false, `konsult har ${perm}`);
    assert.equal(roleHasPermission('personal', perm), false, `personal har ${perm}`);
    assert.equal(roleHasPermission('finance', perm), false, `finance har ${perm}`);
  }
});

test('listPermissionsForRole: personal är operativ men INTE klinisk/finansiell/admin', () => {
  const personal = new Set(listPermissionsForRole('personal'));
  assert.ok(personal.has('bookings.write'));
  assert.ok(personal.has('mail.live_send'));
  assert.ok(personal.has('customers.read'));
  assert.ok(!personal.has('ordination.approve'));
  assert.ok(!personal.has('billing.read'));
  assert.ok(!personal.has('staff.manage'));
  assert.ok(!personal.has('settings.write'));
});

test('listPermissionsForRole: finance är ekonomisk men INTE klinisk', () => {
  const finance = new Set(listPermissionsForRole('finance'));
  assert.ok(finance.has('billing.read'));
  assert.ok(finance.has('billing.write'));
  assert.ok(!finance.has('journal.write'));
  assert.ok(!finance.has('ordination.approve'));
  assert.ok(!finance.has('portal.thread_reply'));
});

test('getRoleFromRequest: verifierad auth-roll styr, aldrig klient-header i produktion', () => {
  const saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    // Rolig från auth → respekteras
    assert.equal(getRoleFromRequest({ auth: { role: 'STAFF' } }), 'personal');
    assert.equal(getRoleFromRequest({ auth: { role: 'KONSULT' } }), 'konsult');
    // ccop-roll vinner (attachRole) — men alltid normaliserad
    assert.equal(
      getRoleFromRequest({ cco: { role: 'PERSONAL' }, auth: { role: 'STAFF' } }),
      'personal'
    );
    // Ingen auth-roll → x-cco-role får INTE ge behörighet i produktion
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

test('PERMISSIONS: alla nycklar refererar bara canonical roller (inga ghosts kvar)', () => {
  const allowed = new Set(['owner', 'konsult', 'personal', 'finance']);
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
    'mail.live_send',
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
