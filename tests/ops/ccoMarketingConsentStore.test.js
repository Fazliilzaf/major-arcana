const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoMarketingConsentStore,
  VALID_CHANNELS,
} = require('../../src/ops/ccoMarketingConsentStore');

async function mkStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-marketing-consent-'));
  const filePath = path.join(tempDir, 'cco-marketing-consent.json');
  const store = await createCcoMarketingConsentStore({ filePath });
  return { store, filePath, tempDir };
}

test('VALID_CHANNELS exporteras som array av kanaler', () => {
  assert.ok(Array.isArray(VALID_CHANNELS));
  assert.deepEqual(VALID_CHANNELS, ['email', 'sms', 'post', 'phone']);
});

test('setOptIn -> getStatus -> canSendMarketing true', async () => {
  const { store } = await mkStore();

  const result = await store.setOptIn('Cust-1', 'email', {
    actorRole: 'staff',
    ipAddress: '203.0.113.7',
    templateVersion: 'v3',
    source: 'web_form',
    note: 'Anmälde via webformulär.',
  });
  assert.equal(result.state, 'opted_in');
  assert.equal(result.channel, 'email');
  assert.equal(result.customerId, 'cust-1');

  const status = store.getStatus('cust-1');
  assert.equal(status.customerId, 'cust-1');
  assert.equal(status.channels.email.state, 'opted_in');
  assert.equal(status.channels.email.optedIn, true);
  assert.equal(status.channels.sms.state, 'unknown');

  const can = store.canSendMarketing('cust-1', 'email');
  assert.equal(can.canSend, true);
  assert.equal(can.currentState, 'opted_in');
});

test('setOptOut -> canSendMarketing false', async () => {
  const { store } = await mkStore();

  await store.setOptIn('cust-2', 'sms', { actorRole: 'staff' });
  let can = store.canSendMarketing('cust-2', 'sms');
  assert.equal(can.canSend, true);

  const out = await store.setOptOut('cust-2', 'sms', {
    actorRole: 'staff',
    reason: 'Kunden bad om stopp.',
    source: 'staff_admin',
  });
  assert.equal(out.state, 'opted_out');

  can = store.canSendMarketing('cust-2', 'sms');
  assert.equal(can.canSend, false);
  assert.equal(can.currentState, 'opted_out');
  assert.ok(can.reason);
});

test('canSendMarketing false när inget samtycke finns', () => {
  return mkStore().then(({ store }) => {
    const can = store.canSendMarketing('nobody', 'email');
    assert.equal(can.canSend, false);
    assert.equal(can.currentState, 'unknown');
  });
});

test('ogiltig kanal avvisas', async () => {
  const { store } = await mkStore();

  await assert.rejects(
    () => store.setOptIn('cust-3', 'carrier-pigeon', { actorRole: 'staff' }),
    /Ogiltig kanal/
  );
  await assert.rejects(
    () => store.setOptOut('cust-3', 'fax', { actorRole: 'staff' }),
    /Ogiltig kanal/
  );
  await assert.rejects(() => store.createUnsubscribeToken('cust-3', 'fax', {}), /Ogiltig kanal/);

  const can = store.canSendMarketing('cust-3', 'fax');
  assert.equal(can.canSend, false);
  assert.equal(can.currentState, 'invalid_channel');
});

test('createUnsubscribeToken returnerar en token', async () => {
  const { store } = await mkStore();

  await store.setOptIn('cust-4', 'email', { actorRole: 'staff' });
  const token = await store.createUnsubscribeToken('cust-4', 'email', { sendId: 'send-99' });
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 16);
});

test('stats sammanfattar samtycken och tokens', async () => {
  const { store } = await mkStore();

  await store.setOptIn('a', 'email', { actorRole: 'staff' });
  await store.setOptIn('b', 'sms', { actorRole: 'staff' });
  await store.setOptOut('c', 'email', { actorRole: 'staff' });
  await store.createUnsubscribeToken('a', 'email', {});

  const s = store.stats();
  assert.equal(s.totalConsents, 3);
  assert.equal(s.totalTokens, 1);
  assert.equal(s.byState.opted_in, 2);
  assert.equal(s.byState.opted_out, 1);
  assert.equal(s.byChannel.email.opted_in, 1);
  assert.equal(s.byChannel.email.opted_out, 1);
  assert.equal(s.byChannel.sms.opted_in, 1);
});

test('persistens: state återläses från fil', async () => {
  const { store, filePath } = await mkStore();

  await store.setOptIn('persist-1', 'post', { actorRole: 'staff' });
  await store.createUnsubscribeToken('persist-1', 'post', { sendId: 's1' });

  const reopened = await createCcoMarketingConsentStore({ filePath });
  const status = reopened.getStatus('persist-1');
  assert.equal(status.channels.post.state, 'opted_in');

  const s = reopened.stats();
  assert.equal(s.totalConsents, 1);
  assert.equal(s.totalTokens, 1);

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(raw.version, 1);
  assert.ok(Array.isArray(raw.consents));
  assert.ok(Array.isArray(raw.tokens));
});

test('auditLog.append anropas när det finns', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-marketing-audit-'));
  const filePath = path.join(tempDir, 'cco-marketing-consent.json');
  const events = [];
  const auditLog = { append: (e) => events.push(e) };

  const store = await createCcoMarketingConsentStore({ filePath, auditLog });
  await store.setOptIn('audit-1', 'email', { actorRole: 'owner' });
  await store.setOptOut('audit-1', 'email', { actorRole: 'owner', reason: 'x' });

  assert.equal(events.length, 2);
  assert.equal(events[0].action, 'cco.marketing_consent.opt_in');
  assert.equal(events[1].action, 'cco.marketing_consent.opt_out');
  assert.equal(events[0].target.kind, 'marketing_consent');
});
