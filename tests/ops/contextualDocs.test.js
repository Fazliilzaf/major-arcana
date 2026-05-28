'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  getDocumentLibrary,
  isAllowedDocPath,
  getDocContent,
  getSectionDocs,
  parseFrontmatter,
} = require('../../src/ops/contextualDocs');

test('document library catalogs every repo doc, grouped by segment', async () => {
  const lib = await getDocumentLibrary();
  assert.ok(lib.totalDocuments >= 100, `expected many docs, got ${lib.totalDocuments}`);
  assert.ok(Array.isArray(lib.segments) && lib.segments.length >= 5);
  const ids = lib.segments.map((s) => s.sectionId);
  assert.ok(ids.includes('strategy'));
  assert.ok(ids.includes('ops'));
  // Sum of per-segment counts equals the total.
  const sum = lib.segments.reduce((n, s) => n + s.documents.length, 0);
  assert.equal(sum, lib.totalDocuments);
  for (const seg of lib.segments) {
    for (const doc of seg.documents) {
      assert.ok(doc.path && doc.title, 'doc has path + title');
      assert.match(doc.path, /\.md$/i);
    }
  }
});

test('isAllowedDocPath allows docs + top-level md, blocks traversal/absolute/non-md', () => {
  assert.equal(isAllowedDocPath('docs/strategy/x.md'), true);
  assert.equal(isAllowedDocPath('README.md'), true);
  assert.equal(isAllowedDocPath('../../etc/passwd'), false);
  assert.equal(isAllowedDocPath('docs/../server.js'), false);
  assert.equal(isAllowedDocPath('/etc/hosts'), false);
  assert.equal(isAllowedDocPath('docs/x.txt'), false);
  assert.equal(isAllowedDocPath(''), false);
});

test('getDocContent refuses path traversal', async () => {
  const result = await getDocContent('../package.json');
  assert.equal(result.ok, false);
});

test('parseFrontmatter reads fields; no frontmatter → empty', () => {
  const meta = parseFrontmatter('---\nowner: COO\nsection: ops\n---\n# Title\nbody');
  assert.equal(meta.owner, 'COO');
  assert.equal(meta.section, 'ops');
  assert.deepEqual(parseFrontmatter('# No frontmatter\n'), {});
});

test('getSectionDocs merges curated + frontmatter-declared docs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'docs-fm-'));
  try {
    await fs.mkdir(path.join(root, 'docs', 'strategy'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'docs', 'strategy', 'demo.md'),
      '---\nsection: booking\ntitle: Demo Doc\n---\n# Demo\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'docs', 'strategy', 'plain.md'),
      '# Plain, no frontmatter\n',
      'utf8'
    );
    const booking = await getSectionDocs('booking', root);
    const paths = booking.map((d) => d.path);
    // Curated booking docs are still present…
    assert.ok(paths.includes('docs/strategy/cco-booking-mvp-spec.md'));
    // …and the frontmatter-declared doc was appended with its title override.
    const demo = booking.find((d) => d.path === 'docs/strategy/demo.md');
    assert.ok(demo, 'frontmatter doc placed into booking');
    assert.equal(demo.title, 'Demo Doc');
    // A doc without a section declaration stays out.
    assert.ok(!paths.includes('docs/strategy/plain.md'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('frontmatter section placement works against the live repo', async () => {
  // The embeddings runbook declares `section: ops` — it should self-place.
  const ops = await getSectionDocs('ops');
  assert.ok(
    ops.some((d) => d.path === 'docs/ops/runbooks/knowledge-embeddings-runbook.md'),
    'runbook auto-appears in ops via frontmatter'
  );
});
