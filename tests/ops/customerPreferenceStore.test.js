const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCustomerPreferenceStore } = require('../../src/ops/customerPreferenceStore');

test('setPreferredMailbox + flush persists; getPreference normalizes email', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref-'));
  const filePath = path.join(dir, 'customer-preferences.json');

  const store = await createCustomerPreferenceStore({ filePath });
  const row = await store.setPreferredMailbox({
    tenantId: 'tenant-a',
    customerEmail: 'Pat@Example.com',
    preferredMailboxId: 'Kons@Clinic.se',
    reason: '  Bokningsflöde  ',
  });
  assert.equal(row.customerEmail, 'pat@example.com');
  assert.equal(row.preferredMailboxId, 'kons@clinic.se');
  assert.equal(row.preferenceReason, 'Bokningsflöde');

  await store.flush();

  const again = store.getPreference({ tenantId: 'tenant-a', customerEmail: 'pat@example.com' });
  assert.ok(again);
  assert.equal(again.preferredMailboxId, 'kons@clinic.se');

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.ok(raw.entries['tenant-a::pat@example.com']);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listPreferences and countPreferences filter by tenant', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref2-'));
  const filePath = path.join(dir, 'customer-preferences.json');
  const store = await createCustomerPreferenceStore({ filePath });

  await store.setPreferredMailbox({
    tenantId: 't1',
    customerEmail: 'a@x.com',
    preferredMailboxId: 'm1@clinic.se',
  });
  await store.setPreferredMailbox({
    tenantId: 't2',
    customerEmail: 'b@x.com',
    preferredMailboxId: 'm2@clinic.se',
  });
  await store.flush();

  assert.equal(store.countPreferences({ tenantId: 't1' }), 1);
  assert.equal(store.countPreferences(), 2);

  const t1List = store.listPreferences({ tenantId: 't1' });
  assert.equal(t1List.length, 1);
  assert.equal(t1List[0].customerEmail, 'a@x.com');

  const byMailbox = store.listPreferences({ tenantId: 't1', preferredMailboxId: 'm1@clinic.se' });
  assert.equal(byMailbox.length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('setPreferredMailbox with missing tenant or email returns null', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref3-'));
  const filePath = path.join(dir, 'customer-preferences.json');
  const store = await createCustomerPreferenceStore({ filePath });

  assert.equal(await store.setPreferredMailbox({ tenantId: '', customerEmail: 'a@b.com', preferredMailboxId: 'x@y.com' }), null);
  assert.equal(await store.setPreferredMailbox({ tenantId: 't', customerEmail: '  ', preferredMailboxId: 'x@y.com' }), null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listPreferences filters by preferredMailboxId across tenants when tenantId omitted', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref-mailbox-'));
  const filePath = path.join(dir, 'customer-preferences.json');
  const store = await createCustomerPreferenceStore({ filePath });

  await store.setPreferredMailbox({
    tenantId: 't-alpha',
    customerEmail: 'a@x.com',
    preferredMailboxId: 'shared@clinic.se',
  });
  await store.setPreferredMailbox({
    tenantId: 't-beta',
    customerEmail: 'b@x.com',
    preferredMailboxId: 'other@clinic.se',
  });
  await store.setPreferredMailbox({
    tenantId: 't-beta',
    customerEmail: 'c@x.com',
    preferredMailboxId: 'SHARED@clinic.se',
  });
  await store.flush();

  const shared = store.listPreferences({ preferredMailboxId: 'shared@clinic.se' });
  assert.equal(shared.length, 2);
  const emails = new Set(shared.map((r) => r.customerEmail));
  assert.deepEqual(emails, new Set(['a@x.com', 'c@x.com']));

  await fs.rm(dir, { recursive: true, force: true });
});

test('getPreference returns null for unknown key or invalid lookup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref4-'));
  const filePath = path.join(dir, 'customer-preferences.json');
  const store = await createCustomerPreferenceStore({ filePath });

  await store.setPreferredMailbox({
    tenantId: 'tenant-x',
    customerEmail: 'known@x.com',
    preferredMailboxId: 'desk@clinic.se',
  });
  assert.equal(store.getPreference({ tenantId: 'other', customerEmail: 'known@x.com' }), null);
  assert.equal(store.getPreference({ tenantId: 'tenant-x', customerEmail: 'missing@x.com' }), null);
  assert.equal(store.getPreference({ tenantId: '', customerEmail: 'known@x.com' }), null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('setPreferredMailbox clears preferredMailboxId when blank mailbox id', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref5-'));
  const filePath = path.join(dir, 'customer-preferences.json');
  const store = await createCustomerPreferenceStore({ filePath });

  await store.setPreferredMailbox({
    tenantId: 't',
    customerEmail: 'a@x.com',
    preferredMailboxId: 'm@clinic.se',
  });
  await store.setPreferredMailbox({
    tenantId: 't',
    customerEmail: 'a@x.com',
    preferredMailboxId: '   ',
  });
  const row = store.getPreference({ tenantId: 't', customerEmail: 'a@x.com' });
  assert.equal(row.preferredMailboxId, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('second store instance loads preferences written by first after flush', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cust-pref6-'));
  const filePath = path.join(dir, 'customer-preferences.json');

  const first = await createCustomerPreferenceStore({ filePath });
  await first.setPreferredMailbox({
    tenantId: 'tenant-reload',
    customerEmail: 'Reload@X.com',
    preferredMailboxId: 'info@clinic.se',
    reason: 'cross-session',
  });
  await first.flush();

  const second = await createCustomerPreferenceStore({ filePath });
  const loaded = second.getPreference({ tenantId: 'tenant-reload', customerEmail: 'reload@x.com' });
  assert.ok(loaded);
  assert.equal(loaded.preferredMailboxId, 'info@clinic.se');
  assert.equal(loaded.preferenceReason, 'cross-session');

  await fs.rm(dir, { recursive: true, force: true });
});
