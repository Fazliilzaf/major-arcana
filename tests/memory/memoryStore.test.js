const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMemoryStore } = require('../../src/memory/store');

test('createMemoryStore persists conversations across reopen', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('hair-tp-clinic');
  assert.match(id, /^[0-9a-f-]{36}$/i);
  await store.appendMessage(id, 'user', 'Hej');
  await store.appendMessage(id, 'assistant', 'Hej igen');

  const reopened = await createMemoryStore({ filePath: fp });
  const convo = await reopened.getConversation(id);
  assert.equal(convo.messages.length, 2);
  assert.equal(convo.messages[0].role, 'user');
});

test('appendMessage rejects invalid roles', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-role-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('x');
  await assert.rejects(() => store.appendMessage(id, 'system', 'nope'), /Invalid role/);
});

test('ensureConversation fills missing brand and deleteConversation toggles', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-del-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation(null);
  assert.equal((await store.getConversation(id)).brand, null);
  await store.ensureConversation(id, 'curatiio');
  assert.equal((await store.getConversation(id)).brand, 'curatiio');

  assert.equal(await store.deleteConversation('no-such'), false);
  assert.equal(await store.deleteConversation(id), true);
  assert.equal(await store.getConversation(id), null);
});

test('setSummary and replaceMessages update conversation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-sum-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('b');
  await store.setSummary(id, 'Kort minne');
  await store.replaceMessages(id, [{ role: 'user', content: 'Endast detta', ts: '2026-01-01T00:00:00.000Z' }]);
  const convo = await store.getConversation(id);
  assert.equal(convo.summary, 'Kort minne');
  assert.equal(convo.messages.length, 1);
  assert.equal(convo.messages[0].content, 'Endast detta');
});

test('setSummary med null tolkas som tom sträng', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-sumnull-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('b');
  await store.setSummary(id, null);
  assert.equal((await store.getConversation(id)).summary, '');
});

test('replaceMessages tommer meddelanden nar payload inte ar array', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-repl-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('c');
  await store.replaceMessages(id, [{ role: 'user', content: 'x' }]);
  await store.replaceMessages(id, null);
  assert.deepEqual((await store.getConversation(id)).messages, []);
});

test('appendMessage lagrar tom sträng som content', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-empty-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('d');
  await store.appendMessage(id, 'user', '');
  assert.equal((await store.getConversation(id)).messages[0].content, '');
});

test('appendMessage normaliserar undefined content till tom sträng', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-undef-content-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('d');
  await store.appendMessage(id, 'assistant', undefined);
  assert.equal((await store.getConversation(id)).messages[0].content, '');
});

test('createConversation blank brand blir null', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-blankbrand-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('   ');
  assert.equal((await store.getConversation(id)).brand, null);
});

test('createMemoryStore med ttl tar bort gamla konversationer vid reopen', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-ttl-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp, ttlMs: 60_000 });
  const id = await store.createConversation('e');
  const raw = JSON.parse(await fs.readFile(fp, 'utf8'));
  raw.conversations[id].updatedAt = new Date(Date.now() - 120_000).toISOString();
  await fs.writeFile(fp, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

  const reopened = await createMemoryStore({ filePath: fp, ttlMs: 60_000 });
  assert.equal(await reopened.getConversation(id), null);
});

test('createMemoryStore kastar vid korrupt json (inte ENOENT)', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-badjson-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fp, '{ not valid json', 'utf8');
  await assert.rejects(() => createMemoryStore({ filePath: fp }), SyntaxError);
});

test('ttl prune tar bort konversation med ogiltig updatedAt', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-ttl-badts-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const id = '00000000-0000-4000-8000-000000000001';
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    fp,
    JSON.stringify({
      conversations: {
        [id]: {
          id,
          brand: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: 'not-a-date',
          summary: '',
          messages: [],
        },
      },
    }),
    'utf8'
  );

  const reopened = await createMemoryStore({ filePath: fp, ttlMs: 60_000 });
  assert.equal(await reopened.getConversation(id), null);
});

test('ensureConversation byter inte befintligt brand', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-brand-keep-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('alpha');
  await store.ensureConversation(id, 'beta');
  assert.equal((await store.getConversation(id)).brand, 'alpha');
});

test('createConversation icke-sträng brand blir null', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-brandtype-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation(123);
  assert.equal((await store.getConversation(id)).brand, null);
});

test('appendMessage avvisar tool-roll', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-toolrole-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp });
  const id = await store.createConversation('x');
  await assert.rejects(() => store.appendMessage(id, 'tool', 'data'), /Invalid role/);
});

test('createMemoryStore med ttlMs 0 stadar inte bort gamla konversationer', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mem-ttl-zero-'));
  const fp = path.join(dir, 'memory.json');
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const store = await createMemoryStore({ filePath: fp, ttlMs: 0 });
  const id = await store.createConversation('x');
  const raw = JSON.parse(await fs.readFile(fp, 'utf8'));
  raw.conversations[id].updatedAt = new Date(Date.now() - 120_000).toISOString();
  await fs.writeFile(fp, JSON.stringify(raw, null, 2), 'utf8');
  const reopened = await createMemoryStore({ filePath: fp, ttlMs: 0 });
  assert.ok(await reopened.getConversation(id));
});
