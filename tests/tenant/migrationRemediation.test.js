'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  planConversationTenantMigration,
  applyConversationTenantMigration,
} = require('../../src/ops/ccoConversationTenantMigration');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(REPO_ROOT, 'scripts', 'migrate-conversation-tenant.js');

function baseState() {
  return {
    version: 1,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    conversationStates: {},
    idempotencyRecords: {},
  };
}

function validConv(key, extra = {}) {
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

function validIdem(key) {
  return {
    key,
    tenantId: 'cco',
    routeKey: 'mail.read',
    actorUserId: 'u1',
    canonicalConversationKey: 'conv-1',
    idempotencyKey: 'ik1',
    status: 'pending',
    expiresAt: '2026-09-07T00:00:00.000Z',
  };
}

// ── B-MIG-1 — case/whitespace-okänslig cco-reject ──────────────────────────

test('MIG-R1: cco target avvisas (INVALID_TARGET)', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
  const plan = planConversationTenantMigration(state, { targetTenant: 'cco' });
  assert.equal(plan.invalidTarget, true);
  assert.equal(plan.migrated.length, 0);
});

test('MIG-R2: CCO target avvisas', () => {
  const plan = planConversationTenantMigration(baseState(), { targetTenant: 'CCO' });
  assert.equal(plan.invalidTarget, true);
  assert.equal(plan.migrated.length, 0);
});

test('MIG-R3: CcO (blandad case) och whitespace-varianter avvisas', () => {
  for (const variant of ['CcO', 'cCo', ' cco ', '  cco', 'CCO  ', 'c c o']) {
    const plan = planConversationTenantMigration(baseState(), { targetTenant: variant });
    assert.equal(plan.invalidTarget, true, `${variant} ska avvisas`);
    assert.equal(plan.migrated.length, 0);
  }
});

test('MIG-R4: valid canonical Hair TP target accepteras', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.invalidTarget, false);
  assert.equal(plan.targetTenant, 'hair-tp-clinic');
  assert.equal(plan.migrated.length, 1);
});

test('MIG-R5: valid Curatiio target accepteras och mappar INTE till Hair TP', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
  const plan = planConversationTenantMigration(state, { targetTenant: 'curatiio' });
  assert.equal(plan.invalidTarget, false);
  assert.equal(plan.targetTenant, 'curatiio');
  assert.equal(plan.migrated.length, 1);
  assert.equal(plan.migrated[0].newKey, 'curatiio:conv-1');
});

// ── B-MIG-2 — malformed row safety ─────────────────────────────────────────

test('MIG-R6: malformed null row + apply → original bevarad, ej fabricerad', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = null;
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.invalid.length, 1);
  applyConversationTenantMigration(state, plan);
  // Original är kvar; inget canonical-replacement fabricerades.
  assert.ok(Object.prototype.hasOwnProperty.call(state.conversationStates, 'cco:conv-1'));
  assert.equal(state.conversationStates['cco:conv-1'], null);
  assert.equal(state.conversationStates['hair-tp-clinic:conv-1'], undefined);
});

test('MIG-R7: malformed string/number/array row + apply → bevarad', () => {
  for (const bad of ['just-a-string', 42, ['a', 'b']]) {
    const state = baseState();
    state.conversationStates['cco:conv-1'] = bad;
    const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
    assert.equal(plan.migrated.length, 0);
    assert.equal(plan.invalid.length, 1);
    applyConversationTenantMigration(state, plan);
    assert.ok(Object.prototype.hasOwnProperty.call(state.conversationStates, 'cco:conv-1'));
    assert.deepEqual(state.conversationStates['cco:conv-1'], bad);
  }
});

test('MIG-R8: empty object → bevarad, ej migrerad', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = {};
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.invalid.length, 1);
  applyConversationTenantMigration(state, plan);
  assert.ok(Object.prototype.hasOwnProperty.call(state.conversationStates, 'cco:conv-1'));
});

test('MIG-R9: saknad konversationsidentitet (canonicalConversationKey) → bevarad', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = {
    actionState: 'handled',
    needsReplyStatusOverride: 'handled',
  };
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.invalid.length, 1);
  applyConversationTenantMigration(state, plan);
  assert.ok(Object.prototype.hasOwnProperty.call(state.conversationStates, 'cco:conv-1'));
});

test('MIG-R10: malformed idempotency row → bevarad, ej fabricerad', () => {
  const state = baseState();
  state.idempotencyRecords['cco::mail.read::u1::conv-1::ik1'] = null;
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.invalid.length, 1);
  applyConversationTenantMigration(state, plan);
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      state.idempotencyRecords,
      'cco::mail.read::u1::conv-1::ik1'
    )
  );
});

test('MIG-R11: mixed valid + malformed dataset → ingen tyst dataförlust', () => {
  const state = baseState();
  state.conversationStates['cco:good'] = validConv('cco:good');
  state.conversationStates['cco:bad'] = null;
  state.conversationStates['cco:badstring'] = 'nonsense';
  const plan = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan.migrated.length, 1);
  assert.equal(plan.migrated[0].key, 'cco:good');
  assert.equal(plan.invalid.length, 2);
  applyConversationTenantMigration(state, plan);
  // Valid rad migrerad.
  assert.ok(state.conversationStates['hair-tp-clinic:good']);
  assert.equal(state.conversationStates['cco:good'], undefined);
  // Malformed rader orörda.
  assert.equal(state.conversationStates['cco:bad'], null);
  assert.equal(state.conversationStates['cco:badstring'], 'nonsense');
});

// ── Kollision / unknown target / idempotens / backup / dry-run ─────────────

test('MIG-R12: kollision skriver inte över canonical record', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
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
  applyConversationTenantMigration(state, plan);
  assert.equal(state.conversationStates['hair-tp-clinic:conv-1'].actionState, 'archived');
  assert.ok(state.conversationStates['cco:conv-1']);
});

test('MIG-R13: unknown target → ingen gissning, ingen mutation', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1'); // ingen mailbox
  const before = JSON.stringify(state);
  const plan = planConversationTenantMigration(state, {});
  assert.equal(plan.migrated.length, 0);
  assert.equal(plan.unresolved.length, 1);
  assert.equal(JSON.stringify(state), before);
});

test('MIG-R14: andra säkra körningen är idempotent', () => {
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
  const plan1 = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  applyConversationTenantMigration(state, plan1);
  // Andra körningen: inga 'cco'-rader kvar att migrera.
  const plan2 = planConversationTenantMigration(state, { targetTenant: 'hair-tp-clinic' });
  assert.equal(plan2.counts.conversationStatesLegacyCco, 0);
  assert.equal(plan2.migrated.length, 0);
});

// ── CLI-level: backup + dry-run byte-identitet ─────────────────────────────

function makeTmpStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-cli-'));
  const file = path.join(dir, 'state.json');
  const state = baseState();
  state.conversationStates['cco:conv-1'] = validConv('cco:conv-1');
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return { dir, file };
}

test('MIG-R15: backup skapas före lyckad --apply-skrivning', () => {
  const { file } = makeTmpStateFile();
  const res = spawnSync(
    process.execPath,
    [CLI, '--file', file, '--target-tenant', 'hair-tp-clinic', '--apply'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(res.status, 0, res.stderr);
  const backups = fs.readdirSync(path.dirname(file)).filter((n) => n.includes('.bak-'));
  assert.equal(backups.length, 1, 'backup ska finnas');
  // Migreringen är utförd i huvudfilen.
  const migrated = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(migrated.conversationStates['hair-tp-clinic:conv-1']);
});

test('MIG-R16: dry-run lämnar filen byte-identisk', () => {
  const { file } = makeTmpStateFile();
  const before = fs.readFileSync(file, 'utf8');
  const res = spawnSync(
    process.execPath,
    [CLI, '--file', file, '--target-tenant', 'hair-tp-clinic'],
    {
      encoding: 'utf8',
    }
  );
  assert.equal(res.status, 0, res.stderr);
  const after = fs.readFileSync(file, 'utf8');
  assert.equal(after, before, 'dry-run får inte skriva');
});

test('CLI: INVALID_TARGET_TENANT ger non-zero exit och ingen mutation', () => {
  const { file } = makeTmpStateFile();
  const before = fs.readFileSync(file, 'utf8');
  const res = spawnSync(
    process.execPath,
    [CLI, '--file', file, '--target-tenant', 'CCO', '--apply'],
    {
      encoding: 'utf8',
    }
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /INVALID_TARGET_TENANT/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'ingen mutation vid INVALID target');
});
