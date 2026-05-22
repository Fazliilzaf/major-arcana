const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoNoteStore } = require('../../src/ops/ccoNoteStore');

test('cco note store sparar, normaliserar och uppdaterar anteckningar per destination', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-'));
  const filePath = path.join(tempDir, 'cco-notes.json');

  try {
    const store = await createCcoNoteStore({ filePath });

    const created = await store.saveNote({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'Anna.Karlsson@Email.com',
      customerName: 'Anna Karlsson',
      destinationKey: 'Konversation',
      destinationLabel: 'Konversation',
      text: '  Kunden vill boka om nästa PRP-tid.  ',
      tags: [' Ombokning ', 'prp-serie', 'ombokning'],
      priority: 'Hög',
      visibility: 'Alla operatörer',
      templateKey: 'ombokning',
      actorUserId: 'owner-a',
    });

    assert.equal(created.destinationKey, 'konversation');
    assert.equal(created.customerId, 'anna.karlsson@email.com');
    assert.equal(created.priority, 'high');
    assert.equal(created.visibility, 'all_operators');
    assert.deepEqual(created.tags, ['ombokning', 'prp-serie']);

    const updated = await store.saveNote({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna.karlsson@email.com',
      customerName: 'Anna Karlsson',
      destinationKey: 'konversation',
      destinationLabel: 'Konversation',
      text: 'Uppdaterad anteckning',
      tags: ['uppföljning'],
      priority: 'Låg',
      visibility: 'Intern',
      templateKey: '',
      actorUserId: 'owner-a',
    });

    assert.equal(updated.noteId, created.noteId);
    assert.equal(updated.text, 'Uppdaterad anteckning');
    assert.equal(updated.priority, 'low');
    assert.equal(updated.visibility, 'internal');
    assert.deepEqual(updated.tags, ['uppföljning']);

    const notes = await store.getNotesByConversation({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna.karlsson@email.com',
    });

    assert.equal(notes.length, 1);
    assert.equal(notes[0].noteId, created.noteId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createCcoNoteStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoNoteStore({ filePath: '   ' }), /filePath krävs/);
});

test('saveNote throws when required fields are missing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-missing-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    await assert.rejects(
      () =>
        store.saveNote({
          tenantId: 't',
          workspaceId: 'w',
          conversationId: 'c',
          customerId: 'u@e.com',
          destinationKey: '   ',
          text: 'x',
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getNote matches case-insensitive ids and returns null when destination differs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-get-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    await store.saveNote({
      tenantId: 'tenant-a',
      workspaceId: 'w',
      conversationId: 'c1',
      customerId: 'User@Example.com',
      destinationKey: 'Bokning',
      text: 'Hej',
    });
    const found = await store.getNote({
      tenantId: 'tenant-a',
      workspaceId: 'w',
      conversationId: 'c1',
      customerId: 'user@example.com',
      destinationKey: 'bokning',
    });
    assert.ok(found);
    assert.equal(found.destinationKey, 'bokning');
    assert.equal(
      await store.getNote({
        tenantId: 'tenant-a',
        workspaceId: 'w',
        conversationId: 'c1',
        customerId: 'user@example.com',
        destinationKey: 'annan',
      }),
      null
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getNotesByConversation sorts by destinationKey and returns copies', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-sort-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'Zebra',
      text: 'z',
    });
    await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'Alpha',
      text: 'a',
    });
    const notes = await store.getNotesByConversation({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
    });
    assert.equal(notes.length, 2);
    assert.deepEqual(
      notes.map((n) => n.destinationKey),
      ['alpha', 'zebra']
    );
    notes[0].text = 'mutated';
    const again = await store.getNotesByConversation({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
    });
    assert.notEqual(again[0].text, 'mutated');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('unknown priority and visibility normalize to medium and team', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-prio-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    const note = await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'kund',
      text: 'x',
      priority: 'ospecificerad',
      visibility: 'publik',
    });
    assert.equal(note.priority, 'medium');
    assert.equal(note.visibility, 'team');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveNote persists whitespace-only text as empty string', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-emptytext-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    const note = await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'anteckning',
      text: '   ',
    });
    assert.equal(note.text, '');
    const again = await store.getNotesByConversation({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
    });
    assert.equal(again.length, 1);
    assert.equal(again[0].text, '');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('sanitizeTags dedupes, treats non-array tags as empty and caps at 12', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-note-store-tags-'));
  const filePath = path.join(tempDir, 'cco-notes.json');
  try {
    const store = await createCcoNoteStore({ filePath });
    const many = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    const note = await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'anteckning',
      text: 'tags',
      tags: many,
    });
    assert.equal(note.tags.length, 12);
    assert.deepEqual(note.tags, Array.from({ length: 12 }, (_, i) => `tag-${i}`));
    const withDupes = await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'anteckning',
      text: 'x',
      tags: ['Foo Bar', 'foo-bar', 'FOO  BAR'],
    });
    assert.deepEqual(withDupes.tags, ['foo-bar']);
    const nonArray = await store.saveNote({
      tenantId: 't',
      workspaceId: 'w',
      conversationId: 'c',
      customerId: 'a@e.com',
      destinationKey: 'utan-taggar',
      text: 'x',
      tags: null,
    });
    assert.deepEqual(nonArray.tags, []);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
