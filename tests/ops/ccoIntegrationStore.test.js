const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoIntegrationStore } = require('../../src/ops/ccoIntegrationStore');

test('createCcoIntegrationStore rejects empty or whitespace filePath', async () => {
  await assert.rejects(() => createCcoIntegrationStore({ filePath: '' }), /filePath/i);
  await assert.rejects(() => createCcoIntegrationStore({ filePath: '  \n' }), /filePath/i);
});

test('getTenantIntegrations seeds default integration flags', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  const list = await store.getTenantIntegrations({ tenantId: 'tenant-a' });
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 1);

  const stripe = list.find((item) => item.integrationId === 'stripe');
  assert.ok(stripe);
  assert.equal(stripe.isConnected, true);
  assert.equal(stripe.source, 'default');

  await fs.rm(dir, { recursive: true, force: true });
});

test('getTenantIntegrations throws when tenantId is blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-tenant-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await assert.rejects(() => store.getTenantIntegrations({ tenantId: '' }), /tenantId/i);
  await assert.rejects(() => store.getTenantIntegrations({ tenantId: '   ' }), /tenantId/i);

  await fs.rm(dir, { recursive: true, force: true });
});

test('setIntegrationConnection throws when integrationId is blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-blank-int-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await store.getTenantIntegrations({ tenantId: 't1' });
  await assert.rejects(
    () => store.setIntegrationConnection({ tenantId: 't1', integrationId: '', isConnected: true }),
    /integrationId/i
  );
  await assert.rejects(
    () => store.setIntegrationConnection({ tenantId: 't1', integrationId: '  ', isConnected: true }),
    /integrationId/i
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('getTenantIntegrations returns sorted copies independent of caller mutation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-clone-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  const first = await store.getTenantIntegrations({ tenantId: 't1' });
  const ids = first.map((x) => x.integrationId);
  assert.deepEqual([...ids].sort((a, b) => String(a).localeCompare(String(b))), ids);
  first[0].isConnected = !first[0].isConnected;
  const second = await store.getTenantIntegrations({ tenantId: 't1' });
  assert.notEqual(second[0].isConnected, first[0].isConnected);

  await fs.rm(dir, { recursive: true, force: true });
});

test('addSalesLead rejects when tenantId is blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-lead-tenant-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await assert.rejects(
    () => store.addSalesLead({ tenantId: '   ', name: 'Bob', email: 'bob@x.com' }),
    /Ofullständig sales lead/
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('addSalesLead allows empty message string', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-lead-msg-empty-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  const lead = await store.addSalesLead({
    tenantId: 't1',
    name: 'Bob',
    email: 'bob@x.com',
    message: '',
  });
  assert.equal(lead.message, '');

  await fs.rm(dir, { recursive: true, force: true });
});

test('setIntegrationConnection appends integration ids outside default set', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-custom-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await store.getTenantIntegrations({ tenantId: 't1' });
  const rec = await store.setIntegrationConnection({
    tenantId: 't1',
    integrationId: 'HubSpotForms',
    isConnected: true,
    actorUserId: 'ops-1',
  });
  assert.equal(rec.integrationId, 'hubspotforms');
  const list = await store.getTenantIntegrations({ tenantId: 't1' });
  assert.ok(list.some((item) => item.integrationId === 'hubspotforms'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('addSalesLead rejects when email is blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-lead-email-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await assert.rejects(
    () => store.addSalesLead({ tenantId: 't1', name: 'Bob', email: '   ' }),
    /Ofullständig sales lead/
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('integration state and sales leads persist across store instances', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int-reload-'));
  const filePath = path.join(dir, 'integrations.json');

  const a = await createCcoIntegrationStore({ filePath });
  await a.getTenantIntegrations({ tenantId: 't-reload' });
  await a.setIntegrationConnection({
    tenantId: 't-reload',
    integrationId: 'Twilio',
    isConnected: true,
    actorUserId: 'actor-9',
  });
  await a.addSalesLead({
    tenantId: 't-reload',
    name: 'Cecilia',
    email: 'Cecilia@X.COM',
    message: 'Ping',
  });

  const b = await createCcoIntegrationStore({ filePath });
  const list = await b.getTenantIntegrations({ tenantId: 't-reload' });
  const twilio = list.find((item) => item.integrationId === 'twilio');
  assert.ok(twilio);
  assert.equal(twilio.isConnected, true);
  assert.equal(twilio.actorUserId, 'actor-9');

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(raw.tenants['t-reload'].salesLeads.length, 1);
  assert.equal(raw.tenants['t-reload'].salesLeads[0].email, 'cecilia@x.com');

  await fs.rm(dir, { recursive: true, force: true });
});

test('setIntegrationConnection updates record and persists', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-int2-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  await store.getTenantIntegrations({ tenantId: 't1' });
  const updated = await store.setIntegrationConnection({
    tenantId: 't1',
    integrationId: 'SlAcK',
    isConnected: false,
    actorUserId: 'owner-1',
  });
  assert.equal(updated.integrationId, 'slack');
  assert.equal(updated.isConnected, false);
  assert.equal(updated.source, 'tenant');

  const list = await store.getTenantIntegrations({ tenantId: 't1' });
  const slack = list.find((item) => item.integrationId === 'slack');
  assert.equal(slack.isConnected, false);
  assert.equal(slack.actorUserId, 'owner-1');

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.ok(raw.tenants.t1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('addSalesLead normalizes email and requires fields', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-lead-'));
  const filePath = path.join(dir, 'integrations.json');
  const store = await createCcoIntegrationStore({ filePath });

  const lead = await store.addSalesLead({
    tenantId: 't1',
    name: '  Anna  ',
    email: 'Anna@Example.COM',
    message: ' Intresse ',
    actorUserId: 'staff-1',
  });
  assert.equal(lead.name, 'Anna');
  assert.equal(lead.email, 'anna@example.com');
  assert.equal(lead.message, 'Intresse');

  await assert.rejects(
    () => store.addSalesLead({ tenantId: 't1', name: '', email: 'a@b.com' }),
    /Ofullständig sales lead/
  );

  await fs.rm(dir, { recursive: true, force: true });
});
