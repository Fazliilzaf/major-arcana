'use strict';

/* CCO kontrollerad send — steg 2a. Mottagar-allowlist-store: add/remove/isAllowed/
 * list, per-tenant-isolering, idempotens, soft-remove, audit på mutationer, rå
 * adress aldrig i audit-detalj. SKICKAR INGENTING. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoRecipientAllowlistStore,
  isPlausibleEmail,
  maskAddress,
} = require('../../src/ops/ccoRecipientAllowlistStore');

function fakeAudit() {
  const events = [];
  return { append: (e) => events.push(e), events };
}

async function newStore(auditLog) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-recip-allow-'));
  const filePath = path.join(dir, 'cco-recipient-allowlist.json');
  const store = await createCcoRecipientAllowlistStore({ filePath, auditLog });
  return { store, dir, filePath };
}

test('add → isAllowed true; list visar aktiv post', async () => {
  const audit = fakeAudit();
  const { store } = await newStore(audit);
  const entry = await store.addRecipient('hairtpclinic', 'Anna@Mail.SE', {
    actor: { role: 'operator', userId: 'u1' },
    note: 'patient',
  });
  assert.equal(entry.address, undefined); // rå adress exponeras inte i svar
  assert.equal(entry.addressHash, undefined);
  assert.equal(entry.active, true);
  assert.equal(entry.addressMasked, 'an***@mail.se');
  assert.equal(store.isAllowed('hairtpclinic', 'anna@mail.se'), true);
  assert.equal(store.isAllowed('hairtpclinic', 'ANNA@mail.se'), true); // case-insensitiv
  const list = store.listRecipients('hairtpclinic');
  assert.equal(list.length, 1);
  assert.equal(list[0].address, undefined);
  assert.equal(list[0].addressMasked, 'an***@mail.se');
});

test('ogiltig adress avvisas (400), inget lagras', async () => {
  const { store } = await newStore(fakeAudit());
  await assert.rejects(
    () => store.addRecipient('hairtpclinic', 'inte-en-adress', { actor: {} }),
    (e) => e.statusCode === 400
  );
  assert.equal(store.listRecipients('hairtpclinic').length, 0);
});

test('per-tenant-isolering: en tenants allowlist läcker inte till en annan', async () => {
  const { store } = await newStore(fakeAudit());
  await store.addRecipient('tenant-a', 'p@x.se', { actor: {} });
  assert.equal(store.isAllowed('tenant-a', 'p@x.se'), true);
  assert.equal(store.isAllowed('tenant-b', 'p@x.se'), false);
});

test('soft-remove: isAllowed blir false men posten finns kvar (audit-historik)', async () => {
  const { store } = await newStore(fakeAudit());
  await store.addRecipient('t', 'p@x.se', { actor: { userId: 'u1' } });
  const removed = await store.removeRecipient('t', 'P@x.se', { actor: { userId: 'u2' } });
  assert.equal(removed.active, false);
  assert.equal(removed.removedBy, 'u2');
  assert.equal(store.isAllowed('t', 'p@x.se'), false);
  assert.equal(store.listRecipients('t').length, 0); // default: bara aktiva
  assert.equal(store.listRecipients('t', { includeInactive: true }).length, 1);
});

test('re-add återaktiverar en borttagen adress', async () => {
  const audit = fakeAudit();
  const { store } = await newStore(audit);
  await store.addRecipient('t', 'p@x.se', { actor: {} });
  await store.removeRecipient('t', 'p@x.se', { actor: {} });
  const re = await store.addRecipient('t', 'p@x.se', { actor: {} });
  assert.equal(re.active, true);
  assert.equal(store.isAllowed('t', 'p@x.se'), true);
  const added = audit.events.filter((e) => e.action === 'communication.recipient_allowlist.added');
  assert.equal(added.at(-1).detail.reactivated, true);
});

test('mutationer loggas i audit; rå adress läcker aldrig till audit-detalj', async () => {
  const audit = fakeAudit();
  const { store } = await newStore(audit);
  await store.addRecipient('t', 'anna@mail.se', { actor: { role: 'operator', userId: 'u1' } });
  await store.removeRecipient('t', 'anna@mail.se', { actor: { role: 'owner', userId: 'u2' } });
  const actions = audit.events.map((e) => e.action);
  assert.ok(actions.includes('communication.recipient_allowlist.added'));
  assert.ok(actions.includes('communication.recipient_allowlist.removed'));
  for (const e of audit.events) {
    const blob = JSON.stringify(e);
    assert.ok(!blob.includes('anna@mail.se'), 'rå adress ska inte finnas i audit');
    assert.equal(e.target.kind, 'comm_recipient_allowlist');
    assert.equal(e.detail.recipientMasked, 'an***@mail.se');
  }
});

test('rå adress lagras på disk för exakt matchning, men inte i list/add-svar', async () => {
  const { store, filePath } = await newStore(fakeAudit());
  const added = await store.addRecipient('t', 'Anna@Mail.SE', { actor: {} });
  const listed = store.listRecipients('t')[0];
  const raw = await fs.readFile(filePath, 'utf8');
  assert.ok(raw.includes('"address": "anna@mail.se"'), 'rå adress behövs bara i persistent store');
  assert.equal(added.address, undefined);
  assert.equal(listed.address, undefined);
  assert.equal(added.addressMasked, 'an***@mail.se');
  assert.equal(listed.addressMasked, 'an***@mail.se');
});

test('isAllowed är fail-closed på ogiltig/ tom input', async () => {
  const { store } = await newStore(fakeAudit());
  assert.equal(store.isAllowed('', 'p@x.se'), false);
  assert.equal(store.isAllowed('t', ''), false);
  assert.equal(store.isAllowed('t', 'skräp'), false);
});

test('remove av ogiltig adress avvisas (400), utan audit-noop', async () => {
  const audit = fakeAudit();
  const { store } = await newStore(audit);
  await assert.rejects(
    () => store.removeRecipient('t', 'skräp', { actor: {} }),
    (e) => e.statusCode === 400
  );
  assert.equal(audit.events.length, 0);
});

test('persisteras till disk och läses tillbaka av en ny store-instans', async () => {
  const audit = fakeAudit();
  const { store, filePath } = await newStore(audit);
  await store.addRecipient('t', 'p@x.se', { actor: {} });
  const reopened = await createCcoRecipientAllowlistStore({ filePath, auditLog: audit });
  assert.equal(reopened.isAllowed('t', 'p@x.se'), true);
});

test('samtidiga add på samma tenant serialiseras (ingen lost update)', async () => {
  const { store } = await newStore(fakeAudit());
  await Promise.all(
    ['a@x.se', 'b@x.se', 'c@x.se', 'd@x.se', 'e@x.se'].map((addr) =>
      store.addRecipient('t', addr, { actor: {} })
    )
  );
  assert.equal(store.listRecipients('t').length, 5);
});

test('samtidiga add över olika tenants tappar inga updates i gemensam fil', async () => {
  const { store, filePath } = await newStore(fakeAudit());
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store.addRecipient(`tenant-${i}`, `patient${i}@x.se`, { actor: {} })
    )
  );
  const reopened = await createCcoRecipientAllowlistStore({ filePath, auditLog: fakeAudit() });
  for (let i = 0; i < 12; i += 1) {
    assert.equal(reopened.isAllowed(`tenant-${i}`, `patient${i}@x.se`), true);
  }
});

test('hjälpfunktioner: isPlausibleEmail / maskAddress', () => {
  assert.equal(isPlausibleEmail('a@b.se'), true);
  assert.equal(isPlausibleEmail('a@b'), false);
  assert.equal(isPlausibleEmail(''), false);
  assert.equal(maskAddress('anna@mail.se'), 'an***@mail.se');
});
