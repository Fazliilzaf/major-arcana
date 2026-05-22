const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailTemplateStore, DEFAULT_TEMPLATES } = require('../../src/ops/ccoMailTemplateStore');

test('createCcoMailTemplateStore requires filePath', async () => {
  await assert.rejects(() => createCcoMailTemplateStore({ filePath: '' }), /filePath/i);
  await assert.rejects(() => createCcoMailTemplateStore({}), /filePath/i);
});

test('createCcoMailTemplateStore rejects whitespace-only filePath', async () => {
  await assert.rejects(() => createCcoMailTemplateStore({ filePath: '  \n\t' }), /filePath/i);
});

test('fresh store seeds default templates', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });
  const list = store.listTemplates();
  assert.ok(list.length >= DEFAULT_TEMPLATES.length);
  assert.ok(list.every((t) => t.templateId && t.label && t.body));
  assert.ok(list.some((t) => t.isDefault === true));
  await fs.rm(dir, { recursive: true, force: true });
});

test('getTemplate returns null for blank templateId', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-get-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  assert.equal(store.getTemplate(''), null);
  assert.equal(store.getTemplate('   '), null);

  await fs.rm(dir, { recursive: true, force: true });
});

test('saveTemplate clamps body length to 4000 characters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-body-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  const longBody = `${'w'.repeat(4000)}EXTRA`;
  const saved = await store.saveTemplate({ label: 'Long body test', body: longBody });
  assert.equal(saved.body.length, 4000);
  assert.equal(saved.body.endsWith('EXTRA'), false);

  await fs.rm(dir, { recursive: true, force: true });
});

test('saveTemplate rejects blank or whitespace-only body', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-body-blank-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  await assert.rejects(() => store.saveTemplate({ label: 'Etikett', body: '   \n\t' }), /label och body/i);

  await fs.rm(dir, { recursive: true, force: true });
});

test('saveTemplate truncates label to eighty characters', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-label-cap-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  const longLabel = `X${'y'.repeat(120)}Z`;
  const saved = await store.saveTemplate({ label: longLabel, body: 'Brödtext.' });
  assert.equal(saved.label.length, 80);
  assert.equal(saved.label.startsWith('X'), true);
  assert.equal(saved.label.endsWith('y'), true);

  await fs.rm(dir, { recursive: true, force: true });
});

test('getTemplate trims templateId before lookup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-get-trim-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  const firstId = store.listTemplates()[0].templateId;
  const got = store.getTemplate(`  ${firstId}  `);
  assert.ok(got);
  assert.equal(got.templateId, firstId);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listTemplates returns clones independent of caller mutation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-clone-'));
  const filePath = path.join(dir, 'templates.json');
  const store = await createCcoMailTemplateStore({ filePath });

  const first = store.listTemplates();
  first[0].label = 'MUTATED_SHOULD_NOT_STICK';
  const second = store.listTemplates();
  assert.notEqual(second[0].label, 'MUTATED_SHOULD_NOT_STICK');

  await fs.rm(dir, { recursive: true, force: true });
});

test('store with empty templates array on disk re-seeds defaults', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl-empty-'));
  const filePath = path.join(dir, 'templates.json');
  await fs.writeFile(
    filePath,
    `${JSON.stringify({ version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), templates: [] }, null, 2)}\n`,
    'utf8'
  );

  const store = await createCcoMailTemplateStore({ filePath });
  const list = store.listTemplates();
  assert.ok(list.length >= DEFAULT_TEMPLATES.length);

  await fs.rm(dir, { recursive: true, force: true });
});

test('saveTemplate upserts; deleteTemplate removes; persists on disk', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailtpl2-'));
  const filePath = path.join(dir, 'templates.json');
  const a = await createCcoMailTemplateStore({ filePath });
  const initial = a.listTemplates();
  const oneId = initial[0].templateId;

  const updated = await a.saveTemplate({
    templateId: oneId,
    label: 'Uppdaterad etikett',
    body: 'Ny brödtext med {{operatör}}',
    icon: '★',
  });
  assert.equal(updated.label, 'Uppdaterad etikett');
  assert.equal(a.getTemplate(oneId).body, 'Ny brödtext med {{operatör}}');

  await assert.rejects(
    () => a.saveTemplate({ label: '', body: 'x' }),
    /label och body/i,
  );

  const newTpl = await a.saveTemplate({
    label: 'Egen mall',
    body: 'Kort svar.',
  });
  assert.ok(newTpl.templateId);
  assert.equal(a.listTemplates().length, initial.length + 1);

  assert.equal(await a.deleteTemplate(newTpl.templateId), true);
  assert.equal(a.getTemplate(newTpl.templateId), null);
  assert.equal(await a.deleteTemplate('missing-id'), false);

  const b = await createCcoMailTemplateStore({ filePath });
  assert.equal(b.getTemplate(oneId).label, 'Uppdaterad etikett');
  assert.equal(b.getTemplate(newTpl.templateId), null);

  await fs.rm(dir, { recursive: true, force: true });
});
