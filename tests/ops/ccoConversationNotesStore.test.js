const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoConversationNotesStore } = require('../../src/ops/ccoConversationNotesStore');

test('createCcoConversationNotesStore requires filePath', async () => {
  await assert.rejects(() => createCcoConversationNotesStore({}), /filePath/i);
});

test('createCcoConversationNotesStore rejects whitespace-only filePath', async () => {
  await assert.rejects(
    () => createCcoConversationNotesStore({ filePath: '   \n\t  ' }),
    /filePath/i
  );
});

test('addNote and listNotes: validation and newest-first order', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  await assert.rejects(() => store.addNote({ conversationKey: '', body: 'x' }), /conversationKey/i);
  await assert.rejects(() => store.addNote({ conversationKey: 'k1', body: '  ' }), /body/i);
  await assert.rejects(
    () => store.addNote({ conversationKey: 'k1', body: 'x'.repeat(2001) }),
    /2000/i,
  );

  const first = await store.addNote({
    conversationKey: 'mb:thread-1',
    body: 'First note',
    authorEmail: 'Op@Clinic.SE',
    authorName: '  Operator  ',
  });
  const second = await store.addNote({
    conversationKey: 'mb:thread-1',
    body: 'Second note',
  });

  assert.equal(first.authorEmail, 'op@clinic.se');
  assert.equal(first.authorName, 'Operator');
  assert.ok(second.createdAt >= first.createdAt);

  const listed = store.listNotes({ conversationKey: 'mb:thread-1' });
  assert.equal(listed.length, 2);
  assert.equal(listed[0].body, 'Second note');
  assert.equal(listed[1].body, 'First note');
  assert.equal(store.countNotes({ conversationKey: 'mb:thread-1' }), 2);
  assert.equal(store.countNotes({ conversationKey: 'missing' }), 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listNotes and countNotes return empty for blank conversationKey', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-blank-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  await store.addNote({ conversationKey: 'real-key', body: 'stored' });

  assert.deepEqual(store.listNotes({ conversationKey: '' }), []);
  assert.deepEqual(store.listNotes({ conversationKey: '  \n' }), []);
  assert.equal(store.countNotes({ conversationKey: '' }), 0);
  assert.equal(store.countNotes({ conversationKey: '  ' }), 0);
  assert.equal(store.listNotes({ conversationKey: 'real-key' }).length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('notes for distinct conversationKeys stay isolated', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-keys-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  await store.addNote({ conversationKey: 'conv-a', body: 'only-a' });
  await store.addNote({ conversationKey: 'conv-b', body: 'only-b' });
  await store.addNote({ conversationKey: 'conv-a', body: 'also-a' });

  const a = store.listNotes({ conversationKey: 'conv-a' });
  const b = store.listNotes({ conversationKey: 'conv-b' });
  assert.equal(a.length, 2);
  assert.equal(b.length, 1);
  assert.equal(a[0].body, 'also-a');
  assert.equal(b[0].body, 'only-b');
  assert.equal(store.countNotes({ conversationKey: 'conv-a' }), 2);
  assert.equal(store.countNotes({ conversationKey: 'conv-b' }), 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listNotes returns clones so mutating listed rows does not change store', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-clone-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  await store.addNote({ conversationKey: 'k', body: 'original' });
  const listed = store.listNotes({ conversationKey: 'k' });
  listed[0].body = 'tampered';
  const again = store.listNotes({ conversationKey: 'k' });
  assert.equal(again[0].body, 'original');

  await fs.rm(dir, { recursive: true, force: true });
});

test('conversation notes persist across store instances', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes2-'));
  const filePath = path.join(dir, 'notes.json');

  const a = await createCcoConversationNotesStore({ filePath });
  await a.addNote({ conversationKey: 'persist-key', body: 'Survives reload' });

  const b = await createCcoConversationNotesStore({ filePath });
  const rows = b.listNotes({ conversationKey: 'persist-key' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'Survives reload');

  await fs.rm(dir, { recursive: true, force: true });
});

test('addNote sets authorEmail and authorName to null when omitted or blank', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-anon-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  const minimal = await store.addNote({ conversationKey: 'k-anon', body: 'signed out' });
  assert.equal(minimal.authorEmail, null);
  assert.equal(minimal.authorName, null);

  const blank = await store.addNote({
    conversationKey: 'k-anon',
    body: 'blank meta',
    authorEmail: '   ',
    authorName: '\t\n',
  });
  assert.equal(blank.authorEmail, null);
  assert.equal(blank.authorName, null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('addNote trims conversationKey so listNotes finds the same thread', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-trim-key-'));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });

  await store.addNote({ conversationKey: '  mb:thread-trim  ', body: 'hello' });
  const listed = store.listNotes({ conversationKey: 'mb:thread-trim' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].body, 'hello');

  await fs.rm(dir, { recursive: true, force: true });
});
