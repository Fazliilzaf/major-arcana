const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoConversationNotesStore } = require('../../src/ops/ccoConversationNotesStore');

/**
 * ORD-222 — storen fick tenant. Alla anrop nedan bär den nu.
 *
 * Testerna i den här filen mätte redan rätt saker (ordning, isolering, kloner,
 * persistens, HTML-escaping) och är oförändrade i sak — bara tenanten är ny.
 * De nya testerna längst ner mäter tenanten själv.
 */
const T = 'hair-tp-clinic';

async function nyStore(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(dir, 'notes.json');
  const store = await createCcoConversationNotesStore({ filePath });
  return { dir, filePath, store };
}

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
  const { dir, store } = await nyStore('arcana-notes-');

  await assert.rejects(
    () => store.addNote({ tenantId: T, conversationKey: '', body: 'x' }),
    /conversationKey/i
  );
  await assert.rejects(
    () => store.addNote({ tenantId: T, conversationKey: 'k1', body: '  ' }),
    /body/i
  );
  await assert.rejects(
    () => store.addNote({ tenantId: T, conversationKey: 'k1', body: 'x'.repeat(2001) }),
    /2000/i
  );

  const first = await store.addNote({
    tenantId: T,
    conversationKey: 'mb:thread-1',
    body: 'First note',
    authorEmail: 'Op@Clinic.SE',
    authorName: '  Operator  ',
  });
  const second = await store.addNote({
    tenantId: T,
    conversationKey: 'mb:thread-1',
    body: 'Second note',
  });

  assert.equal(first.authorEmail, 'op@clinic.se');
  assert.equal(first.authorName, 'Operator');
  assert.ok(second.createdAt >= first.createdAt);

  const listed = store.listNotes({ tenantId: T, conversationKey: 'mb:thread-1' });
  assert.equal(listed.length, 2);
  assert.equal(listed[0].body, 'Second note');
  assert.equal(listed[1].body, 'First note');
  assert.equal(store.countNotes({ tenantId: T, conversationKey: 'mb:thread-1' }), 2);
  assert.equal(store.countNotes({ tenantId: T, conversationKey: 'missing' }), 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listNotes and countNotes return empty for blank conversationKey', async () => {
  const { dir, store } = await nyStore('arcana-notes-blank-');

  await store.addNote({ tenantId: T, conversationKey: 'real-key', body: 'stored' });

  assert.deepEqual(store.listNotes({ tenantId: T, conversationKey: '' }), []);
  assert.deepEqual(store.listNotes({ tenantId: T, conversationKey: '  \n' }), []);
  assert.equal(store.countNotes({ tenantId: T, conversationKey: '' }), 0);
  assert.equal(store.countNotes({ tenantId: T, conversationKey: '  ' }), 0);
  assert.equal(store.listNotes({ tenantId: T, conversationKey: 'real-key' }).length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('notes for distinct conversationKeys stay isolated', async () => {
  const { dir, store } = await nyStore('arcana-notes-keys-');

  await store.addNote({ tenantId: T, conversationKey: 'conv-a', body: 'only-a' });
  await store.addNote({ tenantId: T, conversationKey: 'conv-b', body: 'only-b' });
  await store.addNote({ tenantId: T, conversationKey: 'conv-a', body: 'also-a' });

  const a = store.listNotes({ tenantId: T, conversationKey: 'conv-a' });
  const b = store.listNotes({ tenantId: T, conversationKey: 'conv-b' });
  assert.equal(a.length, 2);
  assert.equal(b.length, 1);
  assert.equal(a[0].body, 'also-a');
  assert.equal(b[0].body, 'only-b');
  assert.equal(store.countNotes({ tenantId: T, conversationKey: 'conv-a' }), 2);
  assert.equal(store.countNotes({ tenantId: T, conversationKey: 'conv-b' }), 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listNotes returns clones so mutating listed rows does not change store', async () => {
  const { dir, store } = await nyStore('arcana-notes-clone-');

  await store.addNote({ tenantId: T, conversationKey: 'k', body: 'original' });
  const listed = store.listNotes({ tenantId: T, conversationKey: 'k' });
  listed[0].body = 'tampered';
  const again = store.listNotes({ tenantId: T, conversationKey: 'k' });
  assert.equal(again[0].body, 'original');

  await fs.rm(dir, { recursive: true, force: true });
});

test('conversation notes persist across store instances', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes2-'));
  const filePath = path.join(dir, 'notes.json');

  const a = await createCcoConversationNotesStore({ filePath });
  await a.addNote({ tenantId: T, conversationKey: 'persist-key', body: 'Survives reload' });

  const b = await createCcoConversationNotesStore({ filePath });
  const rows = b.listNotes({ tenantId: T, conversationKey: 'persist-key' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, 'Survives reload');

  await fs.rm(dir, { recursive: true, force: true });
});

test('addNote sets authorEmail and authorName to null when omitted or blank', async () => {
  const { dir, store } = await nyStore('arcana-notes-anon-');

  const minimal = await store.addNote({
    tenantId: T,
    conversationKey: 'k-anon',
    body: 'signed out',
  });
  assert.equal(minimal.authorEmail, null);
  assert.equal(minimal.authorName, null);

  const blank = await store.addNote({
    tenantId: T,
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
  const { dir, store } = await nyStore('arcana-notes-trim-key-');

  await store.addNote({ tenantId: T, conversationKey: '  mb:thread-trim  ', body: 'hello' });
  const listed = store.listNotes({ tenantId: T, conversationKey: 'mb:thread-trim' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].body, 'hello');

  await fs.rm(dir, { recursive: true, force: true });
});

test('addNote escapes HTML in body and authorName before storage', async () => {
  const { dir, store } = await nyStore('arcana-notes-xss-');

  const note = await store.addNote({
    tenantId: T,
    conversationKey: 'k-xss',
    body: '<script>alert(1)</script>',
    authorName: '<b>Evil</b>',
  });

  assert.equal(note.body, '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(note.authorName, '&lt;b&gt;Evil&lt;/b&gt;');

  const listed = store.listNotes({ tenantId: T, conversationKey: 'k-xss' });
  assert.equal(listed[0].body, '&lt;script&gt;alert(1)&lt;/script&gt;');

  await fs.rm(dir, { recursive: true, force: true });
});

// ── ORD-222 · tenanten ──────────────────────────────────────────────────────

test('TVÅ KLINIKER MED SAMMA KONVERSATIONSNYCKEL SER INTE VARANDRAS ANTECKNINGAR', async () => {
  /**
   * Kärnan i ORD-222. Nyckeln `customer:CUST-1` säger ingenting om klinik, och
   * innan tenanten fanns hamnade Hair TP:s och Curatiios interna anteckningar
   * om patienter i samma hink.
   */
  const { dir, store } = await nyStore('arcana-notes-tenant-');

  await store.addNote({
    tenantId: 'hair-tp-clinic',
    conversationKey: 'customer:CUST-1',
    body: 'Hair TP-anteckning',
  });
  await store.addNote({
    tenantId: 'curatiio',
    conversationKey: 'customer:CUST-1',
    body: 'Curatiio-anteckning',
  });

  const hairTp = store.listNotes({
    tenantId: 'hair-tp-clinic',
    conversationKey: 'customer:CUST-1',
  });
  const curatiio = store.listNotes({ tenantId: 'curatiio', conversationKey: 'customer:CUST-1' });

  assert.equal(hairTp.length, 1, 'Hair TP ser fler anteckningar än sina egna');
  assert.equal(curatiio.length, 1, 'Curatiio ser fler anteckningar än sina egna');
  assert.equal(hairTp[0].body, 'Hair TP-anteckning');
  assert.equal(curatiio[0].body, 'Curatiio-anteckning');
});

test('SKRIVNING UTAN TENANT KASTAR — ingen tyst standardklinik', async () => {
  // Fail-closed. En fallback på defaultTenantId hade lagt Curatiios
  // anteckningar under Hair TP och sett ut som att allt fungerade.
  const { dir, store } = await nyStore('arcana-notes-notenant-');
  await assert.rejects(
    () => store.addNote({ conversationKey: 'customer:CUST-1', body: 'vems?' }),
    /tenantId/i
  );
  await assert.rejects(
    () => store.addNote({ tenantId: '   ', conversationKey: 'customer:CUST-1', body: 'vems?' }),
    /tenantId/i
  );
  await fs.rm(dir, { recursive: true, force: true });
});

test('LÄSNING utan tenant ger tomt i stället för att kasta', async () => {
  // Medvetet asymmetriskt mot skrivningen: en trasig lista i gränssnittet ska
  // inte fälla hela konversationsvyn, men en anteckning utan klinik ska aldrig
  // skrivas.
  const { dir, store } = await nyStore('arcana-notes-readnotenant-');
  await store.addNote({ tenantId: T, conversationKey: 'k', body: 'finns' });
  assert.deepEqual(store.listNotes({ conversationKey: 'k' }), []);
  assert.equal(store.countNotes({ conversationKey: 'k' }), 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test('OLIKA STAVNINGAR AV SAMMA KLINIK ÄR SAMMA HINK', async () => {
  /**
   * Anroparna stavar Hair TP olika: ccoConversationThreadStore defaultar till
   * `'hair_tp'`, server.js och ccoCustomerComm till `hair-tp-clinic`. Utan
   * canonicalTenantId hade samma kliniks anteckningar hamnat i två hinkar, och
   * den som skrev i en vy hade inte sett dem i den andra.
   *
   * Det är inte hypotetiskt: exakt det felet FANNS redan i nyckelformen —
   * ccoCustomerComm skrev under `CUST-1` medan trådvyn läste under
   * `customer:CUST-1`.
   */
  const { dir, store } = await nyStore('arcana-notes-stavning-');

  await store.addNote({ tenantId: 'hair_tp', conversationKey: 'k', body: 'skriven som hair_tp' });
  const lastSomKanonisk = store.listNotes({ tenantId: 'hair-tp-clinic', conversationKey: 'k' });
  assert.equal(lastSomKanonisk.length, 1, 'hair_tp och hair-tp-clinic blev två hinkar');
  assert.equal(lastSomKanonisk[0].body, 'skriven som hair_tp');

  // En TYPO ska larma, inte bli en egen klinik.
  await assert.rejects(
    () => store.addNote({ tenantId: 'hairtp-clinik', conversationKey: 'k', body: 'typo' }),
    /Okänd tenant/i
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('VERSION 1-RADER FLYTTAS TILL KARANTÄN, inte till en gissad klinik', async () => {
  /**
   * Filen i repot hade två nycklar utan tenant (`customer:anon-test-001`,
   * `customer:CUST-DEMO-002`). Det finns ingenting i en sådan rad som säger
   * vilken klinik den gäller.
   *
   * Att migrera dem till defaultkliniken hade skapat ett faktum ur ingenting.
   * Att radera dem hade förstört data. De flyttas därför till
   * omigreradeUtanTenant och visas inte för någon.
   */
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-notes-v1-'));
  const filePath = path.join(dir, 'notes.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      notesByConversation: {
        'customer:anon-test-001': [{ noteId: 'n1', body: 'gammal', createdAt: '2026-05-30' }],
      },
    }),
    'utf8'
  );

  const store = await createCcoConversationNotesStore({ filePath });
  assert.equal(store.antalOmigrerade(), 1, 'raden utan tenant hamnade inte i karantän');
  assert.deepEqual(
    store.listNotes({ tenantId: T, conversationKey: 'customer:anon-test-001' }),
    [],
    'en rad utan känd klinik visades för Hair TP'
  );
  assert.deepEqual(
    store.listNotes({ tenantId: 'curatiio', conversationKey: 'customer:anon-test-001' }),
    [],
    'en rad utan känd klinik visades för Curatiio'
  );

  // Och den finns kvar på disk — flyttad, inte raderad.
  const pa_disk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(pa_disk.omigreradeUtanTenant['customer:anon-test-001'].length, 1);
  assert.equal(pa_disk.notesByConversation['customer:anon-test-001'], undefined);

  await fs.rm(dir, { recursive: true, force: true });
});
