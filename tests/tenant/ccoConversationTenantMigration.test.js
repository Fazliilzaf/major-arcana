'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  planConversationTenantMigration,
  applyConversationTenantMigration,
} = require('../../src/ops/ccoConversationTenantMigration');

function baseState() {
  return {
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    conversationStates: {},
    idempotencyRecords: {},
  };
}

function ccoConv(key, extra = {}) {
  return {
    key,
    tenantId: 'cco',
    canonicalConversationKey: key.split(':').slice(1).join(':'),
    actionState: 'handled',
    needsReplyStatusOverride: 'handled',
    underlyingMailboxIds: [],
    ...extra,
  };
}

test('T-010: migrerar legacy cco → canonical med bevisat target', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1');

  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 1);
  assert.equal(plan.migrated[0].newKey, 'hair-tp-clinic:conv-1');

  applyConversationTenantMigration(state, plan);
  assert.ok(state.conversationStates['hair-tp-clinic:conv-1']);
  assert.equal(state.conversationStates['hair-tp-clinic:conv-1'].tenantId, 'hair-tp-clinic');
  assert.equal(state.conversationStates['cco:conv-1'], undefined);
});

test('T-019: rad utan bevisat target migreras INTE (UNRESOLVED)', () => {
  const state = baseState();
  // Ingen brevlåda → mailbox-bevis saknas; inget --target-tenant → UNRESOLVED.
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1');

  const plan = planConversationTenantMigration(state, {});
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.unresolved.length, 1);
  assert.equal(plan.unresolved[0].key, 'cco:conv-1');
});

test('T-019: mailbox-domän ger deterministiskt (bevisat) target', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1', {
    underlyingMailboxIds: ['kons@hairtpclinic.com'],
  });

  const plan = planConversationTenantMigration(state, {});
  assert.equal(plan.migrated.length, 1);
  assert.equal(plan.migrated[0].newKey, 'hair-tp-clinic:conv-1');
});

test('T-018: kollision skriver INTE över canonical state', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1');
  state.conversationStates['hair-tp-clinic:conv-1'] = {
    key: 'hair-tp-clinic:conv-1',
    tenantId: 'hair-tp-clinic',
    canonicalConversationKey: 'conv-1',
    actionState: 'archived',
    needsReplyStatusOverride: 'archived',
  };

  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.collisions.length, 1);

  // Canonical-posten är orörd.
  assert.equal(state.conversationStates['hair-tp-clinic:conv-1'].actionState, 'archived');
  // Legacy-posten ligger kvar och rörs inte heller.
  assert.ok(state.conversationStates['cco:conv-1']);
});

test('migrerar idempotency-nycklar konsistent med conversation state', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1');
  state.idempotencyRecords['cco::mail.read::u1::conv-1::ik1'] = {
    key: 'cco::mail.read::u1::conv-1::ik1',
    tenantId: 'cco',
    routeKey: 'mail.read',
    actorUserId: 'u1',
    canonicalConversationKey: 'conv-1',
    idempotencyKey: 'ik1',
    status: 'pending',
    expiresAt: '2026-09-07T00:00:00.000Z',
  };

  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 2);
  applyConversationTenantMigration(state, plan);

  assert.ok(state.conversationStates['hair-tp-clinic:conv-1']);
  assert.ok(state.idempotencyRecords['hair-tp-clinic::mail.read::u1::conv-1::ik1']);
  assert.equal(
    state.idempotencyRecords['hair-tp-clinic::mail.read::u1::conv-1::ik1'].tenantId,
    'hair-tp-clinic'
  );
  assert.equal(state.idempotencyRecords['cco::mail.read::u1::conv-1::ik1'], undefined);
});

test("'cco' som target-tenant är inte ett bevis och driver ingen migration", () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = ccoConv('cco:conv-1');

  // 'cco' är inte en tenant — B-MIG-1: target fail-closed (INVALID_TARGET),
  // ingen rad analyseras eller migreras till en påhittad klinik.
  const plan = planConversationTenantMigration(state, { targetTenant: 'cco' });
  assert.equal(plan.invalidTarget, true);
  assert.equal(plan.targetTenant, null);
  assert.equal(plan.migrated.length, 0);
});
