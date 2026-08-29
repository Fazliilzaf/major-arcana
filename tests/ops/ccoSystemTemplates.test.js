'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoTemplateRegistry } = require('../../src/ops/ccoTemplateRegistry');
const {
  ensureSystemTemplates,
  PORTAL_REPLY_TEMPLATE,
  SYSTEM_TEMPLATES,
} = require('../../src/ops/ccoSystemTemplates');

const quiet = { log() {}, warn() {} };

async function withRegistry(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-system-templates-'));
  try {
    const registry = await createCcoTemplateRegistry({
      filePath: path.join(dir, 'cco-templates.json'),
    });
    await fn(registry);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('systemmallen registreras vid uppstart och hamnar i pending', async () => {
  await withRegistry(async (registry) => {
    assert.equal(registry.get(PORTAL_REPLY_TEMPLATE.id), null);

    const result = await ensureSystemTemplates(registry, quiet);
    assert.deepEqual(result.created, [PORTAL_REPLY_TEMPLATE.id]);
    assert.deepEqual(result.failed, []);

    const tpl = registry.get(PORTAL_REPLY_TEMPLATE.id);
    assert.ok(tpl, 'mallen ska finnas efter uppstart');
    assert.equal(
      tpl.legalReviewStatus,
      'pending',
      'en systemmall får aldrig registreras som godkänd av kod'
    );
    assert.equal(tpl.revisions.length, 1);
  });
});

test('omstart ger ingen ny revision (idempotent)', async () => {
  await withRegistry(async (registry) => {
    await ensureSystemTemplates(registry, quiet);
    const first = registry.get(PORTAL_REPLY_TEMPLATE.id);

    const second = await ensureSystemTemplates(registry, quiet);
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.existing, [PORTAL_REPLY_TEMPLATE.id]);

    const after = registry.get(PORTAL_REPLY_TEMPLATE.id);
    assert.equal(after.revisions.length, first.revisions.length);
    assert.equal(after.currentVersion, first.currentVersion);
  });
});

test('en godkänd systemmall avgodkänns INTE av efterföljande deployer', async () => {
  await withRegistry(async (registry) => {
    await ensureSystemTemplates(registry, quiet);
    await registry.setLegalReviewStatus(PORTAL_REPLY_TEMPLATE.id, 'approved', {
      role: 'owner',
      reviewer: 'test',
    });
    assert.equal(registry.get(PORTAL_REPLY_TEMPLATE.id).legalReviewStatus, 'approved');

    // Fem omstarter i rad — motsvarar fem deployer.
    for (let i = 0; i < 5; i += 1) await ensureSystemTemplates(registry, quiet);

    assert.equal(
      registry.get(PORTAL_REPLY_TEMPLATE.id).legalReviewStatus,
      'approved',
      'ett godkännande som försvinner vid deploy stoppar utskicken utan att någon märker det'
    );
  });
});

test('ändrad malltext ger ny revision och kräver nytt godkännande', async () => {
  await withRegistry(async (registry) => {
    await ensureSystemTemplates(registry, quiet);
    await registry.setLegalReviewStatus(PORTAL_REPLY_TEMPLATE.id, 'approved', {
      role: 'owner',
      reviewer: 'test',
    });

    await registry.upsert(
      { ...PORTAL_REPLY_TEMPLATE, body: 'Ny text som juridik inte har sett' },
      { role: 'system' }
    );

    const tpl = registry.get(PORTAL_REPLY_TEMPLATE.id);
    assert.equal(tpl.revisions.length, 2);
    assert.equal(
      tpl.legalReviewStatus,
      'pending',
      'ny copy till patient måste granskas om, annars går ogranskad text ut'
    );
  });
});

test('uppstarten fälls inte av ett trasigt register', async () => {
  const broken = {
    get() {
      return null;
    },
    async upsert() {
      throw new Error('disken är full');
    },
  };
  const result = await ensureSystemTemplates(broken, quiet);
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.failed, SYSTEM_TEMPLATES.map((t) => t.id));
});

test('utan register händer ingenting, och inget kastas', async () => {
  const result = await ensureSystemTemplates(null, quiet);
  assert.deepEqual(result, { created: [], existing: [], failed: [] });
});
