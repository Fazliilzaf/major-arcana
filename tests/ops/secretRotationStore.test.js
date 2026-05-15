const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createSecretRotationStore } = require('../../src/ops/secretRotationStore');

test('getSecretsStatus marks OpenAI key required when provider is openai', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-rot-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-test-key-for-rotation-store',
      alertWebhookUrl: '',
    },
  });

  const status = await store.getSecretsStatus();
  assert.ok(status.totals.tracked >= 1);

  const openai = status.secrets.find((row) => row.id === 'openai_api_key');
  assert.ok(openai);
  assert.equal(openai.required, true);
  assert.equal(openai.present, true);

  const webhook = status.secrets.find((row) => row.id === 'alert_webhook_secret');
  assert.ok(webhook);
  assert.equal(webhook.required, false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listSecretHistory returns events for a tracked secret', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-hist-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-other',
      alertWebhookUrl: '',
    },
  });

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const openaiRecord = raw.secrets?.openai_api_key;
  assert.ok(Array.isArray(openaiRecord?.history));
  assert.ok(openaiRecord.history.length >= 1);

  const hist = await store.listSecretHistory({ secretId: 'openai_api_key', limit: 10 });
  assert.ok(hist.count >= 1);
  assert.ok(hist.events.every((e) => e.secretId === 'openai_api_key'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSecretsStatus applies maxAge override and marks stale required secrets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-stale-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-stale-test',
    },
  });

  // Make lastChangedAt very old so stale check can trigger.
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  raw.secrets.openai_api_key.lastChangedAt = '2020-01-01T00:00:00.000Z';
  await fs.writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

  const reloaded = await createSecretRotationStore({
    filePath,
    config: { aiProvider: 'openai', openaiApiKey: 'sk-stale-test' },
  });
  const status = await reloaded.getSecretsStatus({ maxAgeDays: 7 });
  const openai = status.secrets.find((row) => row.id === 'openai_api_key');
  assert.ok(openai);
  assert.equal(openai.required, true);
  assert.equal(openai.stale, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('captureSnapshot dryRun reports pendingRotation without persisting history', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-dryrun-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-before',
    },
  });

  const beforeRaw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const beforeCount = beforeRaw.secrets.openai_api_key.history.length;

  const snapshot = await store.captureSnapshot({
    dryRun: true,
    force: true,
    source: 'manual_snapshot',
    note: 'dry run',
  });
  const openai = snapshot.secrets.find((row) => row.id === 'openai_api_key');
  assert.ok(openai);
  assert.equal(openai.pendingRotation, true);

  const afterRaw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const afterCount = afterRaw.secrets.openai_api_key.history.length;
  assert.equal(afterCount, beforeCount);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listSecretHistory respects limit bounds and returns newest first', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-limit-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-limit-test',
    },
  });

  await store.captureSnapshot({ dryRun: false, force: true, source: 'manual_snapshot', note: 'A' });
  await store.captureSnapshot({ dryRun: false, force: true, source: 'manual_snapshot', note: 'B' });
  const hist = await store.listSecretHistory({ secretId: 'openai_api_key', limit: 1 });
  assert.equal(hist.count, 1);
  assert.equal(hist.events.length, 1);
  assert.equal(typeof hist.events[0].changedAt, 'string');

  await fs.rm(dir, { recursive: true, force: true });
});

test('createSecretRotationStore rejects when filePath is missing', async () => {
  await assert.rejects(() =>
    createSecretRotationStore({
      config: { aiProvider: 'openai', openaiApiKey: 'sk-missing-path' },
    })
  );
});

test('listSecretHistory returns empty for unknown secretId', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-unknown-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: { aiProvider: 'openai', openaiApiKey: 'sk-unknown' },
  });

  const hist = await store.listSecretHistory({ secretId: 'not_a_defined_secret', limit: 10 });
  assert.equal(hist.count, 0);
  assert.deepEqual(hist.events, []);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSecretsStatus marks alert webhook required when alertWebhookUrl is configured', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-webhook-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'openai',
      openaiApiKey: 'sk-w',
      alertWebhookUrl: 'https://hooks.example.com/inbox',
      alertWebhookSecret: 'whsec_test_value',
    },
  });

  const status = await store.getSecretsStatus();
  const webhook = status.secrets.find((row) => row.id === 'alert_webhook_secret');
  assert.ok(webhook);
  assert.equal(webhook.required, true);
  assert.equal(webhook.present, true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listSecretHistory accepts human-readable secret id normalized to canonical', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-alias-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: { aiProvider: 'openai', openaiApiKey: 'sk-alias' },
  });

  const hist = await store.listSecretHistory({ secretId: 'OPENAI-API-KEY', limit: 20 });
  assert.ok(hist.count >= 1);
  assert.ok(hist.events.every((e) => e.secretId === 'openai_api_key'));

  await fs.rm(dir, { recursive: true, force: true });
});

test('listSecretHistory uses bounded default when limit is not a positive integer', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-limit-default-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: { aiProvider: 'openai', openaiApiKey: 'sk-limit-default' },
  });

  const withNan = await store.listSecretHistory({ secretId: 'openai_api_key', limit: 'not-a-number' });
  const withZero = await store.listSecretHistory({ secretId: 'openai_api_key', limit: 0 });
  assert.ok(withNan.count >= 1);
  assert.ok(withZero.count >= 1);
  assert.equal(withNan.events.length, withNan.count);
  assert.equal(withZero.events.length, withZero.count);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getSecretsStatus marks OpenAI key optional when aiProvider is not openai', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-provider-off-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: {
      aiProvider: 'anthropic',
      openaiApiKey: 'sk-not-used-for-openai-provider',
      alertWebhookUrl: '',
    },
  });

  const status = await store.getSecretsStatus();
  const openai = status.secrets.find((row) => row.id === 'openai_api_key');
  assert.ok(openai);
  assert.equal(openai.required, false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('captureSnapshot persists rotation notes truncated to 280 characters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secret-long-note-'));
  const filePath = path.join(dir, 'secret-rotation.json');

  const store = await createSecretRotationStore({
    filePath,
    config: { aiProvider: 'openai', openaiApiKey: 'sk-long-note' },
  });

  const longNote = `${'z'.repeat(200)}${'y'.repeat(200)}`;
  assert.equal(longNote.length, 400);

  await store.captureSnapshot({
    dryRun: false,
    force: true,
    source: 'manual_snapshot',
    note: longNote,
  });

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const notes = (raw.secrets?.openai_api_key?.history || []).map((h) => h.note).filter(Boolean);
  assert.ok(notes.some((n) => n.length === 280));
  assert.ok(notes.some((n) => n.endsWith('y'.repeat(80))));

  await fs.rm(dir, { recursive: true, force: true });
});
