'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createClientoLinkSidecarLedger } = require('../../src/ops/clientoLinkSidecarLedger');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const checksum = (label) => digest(`checksum:${label}`);

function sourceRefs(bookingId = 'booking-1', suffix = '') {
  return ['hair_tp', 'hair-tp-clinic'].map((tenantId) => ({
    tenantId,
    bookingId,
    sourceSnapshotChecksum: checksum(`${tenantId}:source${suffix}`),
    coreChecksum: checksum(`${tenantId}:core`),
    notesChecksum: checksum(`${tenantId}:notes`),
  }));
}

function evidence(label = 'candidate') {
  return [{ type: 'candidate_manifest', ref: label, checksum: checksum(label) }];
}

const systemActor = {
  staffId: 'cliento-link-candidate-generator',
  role: 'SYSTEM',
  tenantId: 'hair-tp-clinic',
  permissions: [],
};
const reviewer = {
  staffId: 'staff-reviewer',
  role: 'STAFF',
  tenantId: 'hair-tp-clinic',
  permissions: [],
};
const owner = {
  staffId: 'owner-reviewer',
  role: 'OWNER',
  tenantId: 'hair-tp-clinic',
  permissions: ['cliento.links.write'],
};

async function fixture(t, gates = {}) {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'cliento-link-ledger-'));
  t.after(() => fsPromises.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'ledger.jsonl');
  let tick = 0;
  const ledger = await createClientoLinkSidecarLedger({
    filePath,
    gates,
    clock: () => `2026-07-18T12:00:${String(tick++).padStart(2, '0')}.000Z`,
  });
  return { ledger, filePath };
}

async function propose(ledger, overrides = {}) {
  return ledger.propose({
    linkId: 'link-1',
    sourceRefs: sourceRefs(),
    evidence: evidence(),
    idempotencyKey: 'propose-1',
    reasonCode: 'exact_booking_and_core_checksum',
    actor: systemActor,
    ...overrides,
  });
}

function transitionInput(previous, state, overrides = {}) {
  return {
    expectedPreviousEventId: previous.ledgerEventId,
    currentSourceRefs: sourceRefs(),
    canonicalPatientId: 'patient-1',
    canonicalEncounterId: 'encounter-1',
    evidence: evidence(`${state}-review`),
    idempotencyKey: `${state}-1`,
    reasonCode: `${state}_after_explicit_review`,
    actor: state === 'active' ? owner : reviewer,
    ...overrides,
  };
}

test('skrivgrinden är stängd som default och skapar ingen fil', async (t) => {
  const { ledger, filePath } = await fixture(t);
  await assert.rejects(() => propose(ledger), { code: 'ledger_write_gate_closed' });
  assert.equal(fs.existsSync(filePath), false);
  assert.deepEqual(ledger.stats().gates, {
    ledgerWriteAllowed: false,
    activationAllowed: false,
  });
});

test('proposed → approved → active → revoked är append-only och rollbackar projectionen', async (t) => {
  const { ledger, filePath } = await fixture(t, {
    ledgerWriteAllowed: true,
    activationAllowed: true,
  });
  const proposed = await propose(ledger);
  const afterProposed = await fsPromises.readFile(filePath, 'utf8');
  const approved = await ledger.transition(
    proposed.linkId,
    'approved',
    transitionInput(proposed, 'approved')
  );
  const afterApproved = await fsPromises.readFile(filePath, 'utf8');
  assert.ok(afterApproved.startsWith(afterProposed));
  const active = await ledger.transition(
    approved.linkId,
    'active',
    transitionInput(approved, 'active')
  );
  assert.equal(ledger.listActiveProjections().length, 1);
  const revoked = await ledger.transition(
    active.linkId,
    'revoked',
    transitionInput(active, 'revoked', { actor: reviewer })
  );

  assert.equal(revoked.state, 'revoked');
  assert.equal(ledger.listActiveProjections().length, 0);
  assert.deepEqual(
    ledger.getLinkHistory('link-1').map((event) => event.state),
    ['proposed', 'approved', 'active', 'revoked']
  );
  assert.equal(ledger.verifyIntegrity().ok, true);
  assert.equal((await fsPromises.readFile(filePath, 'utf8')).trim().split('\n').length, 4);
});

test('active kan supersedas men terminala tillstånd kan inte muteras', async (t) => {
  const { ledger } = await fixture(t, { ledgerWriteAllowed: true, activationAllowed: true });
  const proposed = await propose(ledger);
  const approved = await ledger.transition(
    proposed.linkId,
    'approved',
    transitionInput(proposed, 'approved')
  );
  const active = await ledger.transition(
    approved.linkId,
    'active',
    transitionInput(approved, 'active')
  );
  const superseded = await ledger.transition(
    active.linkId,
    'superseded',
    transitionInput(active, 'superseded')
  );
  await assert.rejects(
    () => ledger.transition(active.linkId, 'approved', transitionInput(superseded, 'again')),
    { code: 'transition_not_allowed' }
  );
  assert.equal(ledger.listActiveProjections().length, 0);
});

test('source-CAS och previous-event-CAS stoppar utan append', async (t) => {
  const { ledger, filePath } = await fixture(t, { ledgerWriteAllowed: true });
  const proposed = await propose(ledger);
  const before = await fsPromises.readFile(filePath, 'utf8');
  await assert.rejects(
    () =>
      ledger.transition(
        proposed.linkId,
        'approved',
        transitionInput(proposed, 'approved', {
          currentSourceRefs: sourceRefs('booking-1', '-drift'),
        })
      ),
    { code: 'source_snapshot_cas_mismatch' }
  );
  await assert.rejects(
    () =>
      ledger.transition(
        proposed.linkId,
        'approved',
        transitionInput(proposed, 'approved-2', { expectedPreviousEventId: 'stale-event' })
      ),
    { code: 'previous_event_cas_mismatch' }
  );
  assert.equal(await fsPromises.readFile(filePath, 'utf8'), before);
  assert.equal(ledger.stats().eventCount, 1);
});

test('idempotency replayar exakt payload och blockerar ny payload även vid samtidighet', async (t) => {
  const { ledger } = await fixture(t, { ledgerWriteAllowed: true });
  const [first, replay] = await Promise.all([propose(ledger), propose(ledger)]);
  assert.equal(first.ledgerEventId, replay.ledgerEventId);
  assert.equal(ledger.stats().eventCount, 1);
  await assert.rejects(() => propose(ledger, { reasonCode: 'different_reason' }), {
    code: 'idempotency_conflict',
  });
  assert.equal(ledger.stats().eventCount, 1);
});

test('approval kräver canonical patient och encounter; active kräver separat owner-grind', async (t) => {
  const closed = await fixture(t, { ledgerWriteAllowed: true, activationAllowed: false });
  const proposed = await propose(closed.ledger);
  await assert.rejects(
    () =>
      closed.ledger.transition(
        proposed.linkId,
        'approved',
        transitionInput(proposed, 'approved', { canonicalEncounterId: '' })
      ),
    { code: 'canonical_link_required' }
  );
  const approved = await closed.ledger.transition(
    proposed.linkId,
    'approved',
    transitionInput(proposed, 'approved-2')
  );
  await assert.rejects(
    () => closed.ledger.transition(approved.linkId, 'active', transitionInput(approved, 'active')),
    { code: 'activation_gate_closed' }
  );
  assert.equal(closed.ledger.stats().eventCount, 2);
});

test('en sourceRef kan aldrig få två aktiva projections', async (t) => {
  const { ledger } = await fixture(t, { ledgerWriteAllowed: true, activationAllowed: true });
  const first = await propose(ledger);
  const firstApproved = await ledger.transition(
    first.linkId,
    'approved',
    transitionInput(first, 'approved')
  );
  await ledger.transition(first.linkId, 'active', transitionInput(firstApproved, 'active'));

  const second = await propose(ledger, {
    linkId: 'link-2',
    idempotencyKey: 'propose-2',
  });
  const secondApproved = await ledger.transition(
    second.linkId,
    'approved',
    transitionInput(second, 'approved-2', { idempotencyKey: 'approved-2' })
  );
  await assert.rejects(
    () =>
      ledger.transition(
        second.linkId,
        'active',
        transitionInput(secondApproved, 'active-2', { idempotencyKey: 'active-2', actor: owner })
      ),
    { code: 'conflicting_active_link' }
  );
  assert.equal(ledger.listActiveProjections().length, 1);
});

test('restart läser samma kedja och tamper stoppar fail-closed', async (t) => {
  const { ledger, filePath } = await fixture(t, { ledgerWriteAllowed: true });
  await propose(ledger);
  const reopened = await createClientoLinkSidecarLedger({ filePath });
  assert.equal(reopened.verifyIntegrity().ok, true);
  assert.equal(reopened.stats().eventCount, 1);

  const event = JSON.parse((await fsPromises.readFile(filePath, 'utf8')).trim());
  event.reasonCode = 'tampered';
  await fsPromises.writeFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  await assert.rejects(() => createClientoLinkSidecarLedger({ filePath }), {
    code: 'ledger_integrity_failed',
  });
});
