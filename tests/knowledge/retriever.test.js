const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createKnowledgeRetriever } = require('../../src/knowledge/retriever');

test('createKnowledgeRetriever tolerates missing knowledge directory', async () => {
  const dir = path.join(os.tmpdir(), `arcana-missing-know-${Date.now()}`);
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.equal(Array.isArray(await r.search('något')), true);
  assert.deepEqual(await r.search('något'), []);
});

test('createKnowledgeRetriever search ranks markdown by term overlap', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(dir, 'prp.md'),
    'Källa: https://example.com/kb/prp\n\nPRP-behandling stärker hårväxt efter transplantation.',
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'booking.md'),
    'Allmän text om lunch och parkering utan medicinska nyckelord.',
    'utf8'
  );

  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('PRP transplantation', { limit: 4 });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].source, 'prp.md');
  assert.equal(hits[0].attribution, 'https://example.com/kb/prp');
  assert.ok(hits[0].score > 0);
});

test('createKnowledgeRetriever returns no hits when query is only stop words', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-stop-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'x.md'), 'Synlig uniktermxyz123', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search('och att det'), []);
});

test('createKnowledgeRetriever search returnerar tom lista for tom eller whitespace query', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-emptyq-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'a.md'), 'unikEMPTYQ999 finns', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search(''), []);
  assert.deepEqual(await r.search('   \t'), []);
});

test('createKnowledgeRetriever search med limit 0 ger tom lista', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-lim0-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'a.md'), 'unikLIM0abc finns här.', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search('unikLIM0abc', { limit: 0 }), []);
});

test('createKnowledgeRetriever search med bara skiljetecken ger tom lista', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-punct-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'a.md'), 'unikPUNCT999 text', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search('?! . , '), []);
});

test('createKnowledgeRetriever search respekterar limit', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-limit-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'one.md'), 'unikLIMIT777 forsta', 'utf8');
  await fs.writeFile(path.join(dir, 'two.md'), 'unikLIMIT777 andra', 'utf8');
  await fs.writeFile(path.join(dir, 'three.md'), 'unikLIMIT777 tredje', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('unikLIMIT777', { limit: 2 });
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.content.includes('unikLIMIT777')));
  const allowed = new Set(['one.md', 'two.md', 'three.md']);
  assert.ok(hits.every((h) => allowed.has(h.source)));
});

test('createKnowledgeRetriever indexerar underkataloger och .txt', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-sub-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(dir, 'nested'), { recursive: true });
  await fs.writeFile(path.join(dir, 'nested', 'deep.txt'), 'unikSUBDIR888 text', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('unikSUBDIR888');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, path.join('nested', 'deep.txt'));
});

test('createKnowledgeRetriever rebuild refreshes index after file change', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-re-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'v1.md'), 'Endast gammalt innehåll.', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search('nyckelordfresh999'), []);

  await fs.writeFile(path.join(dir, 'v2.md'), 'nyckelordfresh999 finns här.', 'utf8');
  await r.rebuild();
  const hits = await r.search('nyckelordfresh999');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, 'v2.md');
});

test('createKnowledgeRetriever leaves attribution empty when Källa header saknas', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-attr-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'plain.md'), 'unikATTR777 text utan kallrad.', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('unikATTR777');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].attribution, '');
});

test('createKnowledgeRetriever ignores non-md/txt files in index', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-ext-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'only.json'), '{"text":"unikJSON555"}', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('unikJSON555');
  assert.deepEqual(hits, []);
});

test('createKnowledgeRetriever tom katalog utan indexerbara filer ger inga träffar', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-emptydir-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.deepEqual(await r.search('vad'), []);
});

test('createKnowledgeRetriever flerstyckesfil matchar termer i olika stycken', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-multi-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(dir, 'multi.md'),
    'Första stycke unikMULTIAAA.\n\nAndra stycke unikMULTIBBB.',
    'utf8'
  );
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const a = await r.search('unikMULTIAAA');
  const b = await r.search('unikMULTIBBB');
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].source, 'multi.md');
  assert.equal(b[0].source, 'multi.md');
});

test('createKnowledgeRetriever sökning är case-insensitive', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-case-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'c.md'), 'unikCASE555 med versaler', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('UnIkCaSe555');
  assert.equal(hits.length, 1);
  assert.ok(hits[0].content.includes('unikCASE555'));
});

test('createKnowledgeRetriever applies simple Swedish term variants', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-stem-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'stem.md'), 'Vi arbetar med behandling varje dag.', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('behandlingen');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, 'stem.md');
});

test('createKnowledgeRetriever exponerar knowledgeDir som absolut sökväg', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-abs-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'x.md'), 'unikABSpath1', 'utf8');
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  assert.equal(r.knowledgeDir, path.resolve(dir));
});

test('createKnowledgeRetriever rankar högre score när samma term upprepas i chunk', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-repsc-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'sparse.md'), 'unikREPscore222 en gång.', 'utf8');
  await fs.writeFile(
    path.join(dir, 'dense.md'),
    'unikREPscore222 unikREPscore222 unikREPscore222 tre gånger.',
    'utf8'
  );
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('unikREPscore222', { limit: 2 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].source, 'dense.md');
  assert.ok(hits[0].score > hits[1].score);
});

test('createKnowledgeRetriever sökning matchar plural med -arna via stamvariant', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-know-arna-'));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(dir, 'care.md'),
    'Vid försämring eller rodnad efter behandling, kontakta kliniken.',
    'utf8'
  );
  const r = await createKnowledgeRetriever({ knowledgeDir: dir });
  const hits = await r.search('försämringarna');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, 'care.md');
});
