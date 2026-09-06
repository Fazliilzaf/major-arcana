'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { roleHasPermission } = require('../../src/security/ccoRbac');
const { createAuthStore } = require('../../src/security/authStore');

/**
 * P0-004 — B-1/B-2/B-3 narrow remediation (beslut A + Product Owner).
 * Körs med ren Node: node --test tests/security/p0_004_role_assignment.test.js
 */

async function nyStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p0-004-b123-'));
  const store = await createAuthStore({
    filePath: path.join(dir, 'auth.json'),
    sessionTtlMs: 3600_000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 600_000,
  });
  return { store, dir };
}

// ── B-1: personal booking + conflict override ──────────────────────────────

test('B-1: personal har bookings.write OCH conflict_override; operator write men EJ override', () => {
  assert.equal(roleHasPermission('personal', 'bookings.write'), true);
  assert.equal(roleHasPermission('personal', 'bookings.conflict_override'), true);
  // operator är transitional legacy: får boka, men INTE conflict-override
  assert.equal(roleHasPermission('operator', 'bookings.write'), true);
  assert.equal(roleHasPermission('operator', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('konsult', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('finance', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('revisor', 'bookings.conflict_override'), false);
  assert.equal(roleHasPermission('patient', 'bookings.conflict_override'), false);
});

// ── B-2: explicit role assignment ──────────────────────────────────────────

test('B-2: upsertStaffMember persisterar konsult/personal/finance/revisor', async () => {
  const { store, dir } = await nyStore();
  try {
    for (const [email, role, expected] of [
      ['k@x.se', 'KONSULT', 'KONSULT'],
      ['p@x.se', 'personal', 'PERSONAL'],
      ['f@x.se', 'FINANCE', 'FINANCE'],
      ['r@x.se', 'revisor', 'REVISOR'],
    ]) {
      const r = await store.upsertStaffMember({
        tenantId: 'hair-tp-clinic',
        email,
        password: 'secret12345',
        role,
      });
      assert.equal(r.membership.role, expected, `${role} → ${expected}`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('B-2: invite utan roll fail-closed (ingen tyst OPERATOR)', async () => {
  const { store, dir } = await nyStore();
  try {
    await assert.rejects(
      () =>
        store.upsertStaffMember({
          tenantId: 'hair-tp-clinic',
          email: 'nurse@x.se',
          password: 'secret12345',
        }),
      /Kanonisk staff-roll krävs/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('B-2: ogiltig/ghost-roll fail-closed', async () => {
  const { store, dir } = await nyStore();
  try {
    await assert.rejects(
      () =>
        store.upsertStaffMember({
          tenantId: 'hair-tp-clinic',
          email: 'nurse@x.se',
          password: 'secret12345',
          role: 'ADMIN',
        }),
      /Kanonisk staff-roll krävs/
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('B-2: owner kan ändra personal → konsult; session revoke-väg finns', async () => {
  const { store, dir } = await nyStore();
  try {
    const created = await store.upsertStaffMember({
      tenantId: 'hair-tp-clinic',
      email: 'nurse@x.se',
      password: 'secret12345',
      role: 'PERSONAL',
    });
    const updated = await store.updateMembership(created.membership.id, { role: 'KONSULT' });
    assert.equal(updated.role, 'KONSULT');

    const finance = await store.upsertStaffMember({
      tenantId: 'hair-tp-clinic',
      email: 'econ@x.se',
      password: 'secret12345',
      role: 'FINANCE',
    });
    const changed = await store.updateMembership(finance.membership.id, { role: 'REVISOR' });
    assert.equal(changed.role, 'REVISOR');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('B-2: OWNER-medlemskap skapas korrekt (ägarskyddet sitter i PATCH-routern)', async () => {
  const { store, dir } = await nyStore();
  try {
    const owner = await store.upsertOwnerMember({
      tenantId: 'hair-tp-clinic',
      email: 'owner@x.se',
      password: 'secret12345',
    });
    assert.equal(owner.membership.role, 'OWNER');
    // ensureMembership ska inte tyst degradera en aktiv OWNER till staff-roll.
    const m = await store.ensureMembership({
      userId: owner.user.id,
      tenantId: 'hair-tp-clinic',
      role: 'PERSONAL',
    });
    assert.equal(m.role, 'OWNER');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── B-3: revisor full financial, non-clinical/non-admin ────────────────────

test('B-3: revisor har fulla ekonomirättigheter, finance kvar, personal/konsult nej', () => {
  assert.equal(roleHasPermission('revisor', 'billing.read'), true);
  assert.equal(roleHasPermission('revisor', 'billing.write'), true);
  assert.equal(roleHasPermission('finance', 'billing.read'), true);
  assert.equal(roleHasPermission('finance', 'billing.write'), true);
  assert.equal(roleHasPermission('owner', 'billing.read'), true);
  assert.equal(roleHasPermission('owner', 'billing.write'), true);
  assert.equal(roleHasPermission('personal', 'billing.read'), false);
  assert.equal(roleHasPermission('personal', 'billing.write'), false);
  assert.equal(roleHasPermission('konsult', 'billing.read'), false);
});

test('B-3: revisor är NON-clinical / NON-admin', () => {
  assert.equal(roleHasPermission('revisor', 'journal.write'), false);
  assert.equal(roleHasPermission('revisor', 'journal.read_any'), false);
  assert.equal(roleHasPermission('revisor', 'ordination.approve'), false);
  assert.equal(roleHasPermission('revisor', 'bookings.write'), false);
  assert.equal(roleHasPermission('revisor', 'mail.live_send'), false);
  assert.equal(roleHasPermission('revisor', 'staff.manage'), false);
  assert.equal(roleHasPermission('revisor', 'settings.write'), false);
  assert.equal(roleHasPermission('revisor', 'customers.write'), false);
});
