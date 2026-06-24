const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoComplianceScanStore } = require('../../src/ops/ccoComplianceScanStore');

async function tempFile(name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-compliance-'));
  return { dir, filePath: path.join(dir, name) };
}

test('runFullScan records a scan readable via getLatestScan and listScans', async () => {
  const { dir } = await tempFile('scans.json');
  try {
    const store = await createCcoComplianceScanStore({
      // No filePath -> in-memory state.
      externalVersionsPath: null,
      meridiqSchemaPath: null,
      templateRegistry: null,
    });

    assert.equal(store.getLatestScan(), null);
    assert.deepEqual(store.getActiveFlags(), []);
    assert.deepEqual(store.listScans(), []);

    const result = await store.runFullScan({ triggeredBy: 'manual:test', sinceHours: 12 });
    assert.ok(result.scanId);
    assert.equal(result.triggeredBy, 'manual:test');
    assert.equal(result.sinceHours, 12);
    assert.equal(typeof result.totalFlags, 'number');
    assert.ok(Array.isArray(result.flags));

    const latest = store.getLatestScan();
    assert.equal(latest.scanId, result.scanId);

    const history = store.listScans();
    assert.equal(history.length, 1);
    assert.equal(history[0].scanId, result.scanId);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('runFullScan tolerates missing input files and emits flags instead of throwing', async () => {
  const store = await createCcoComplianceScanStore({
    externalVersionsPath: '/nope/does-not-exist/external.json',
    meridiqSchemaPath: '/nope/does-not-exist/schema.json',
    templateRegistry: null,
  });

  const result = await store.runFullScan({ triggeredBy: 'boot' });
  const codes = result.flags.map((f) => f.code);
  assert.ok(codes.includes('external_versions_unavailable'));
  assert.ok(codes.includes('meridiq_schema_unavailable'));
  assert.ok(result.totalFlags >= 2);

  const active = store.getActiveFlags();
  assert.equal(active.length, result.totalFlags);
});

test('null/undefined paths produce no-path flags, not crashes', async () => {
  const store = await createCcoComplianceScanStore({});
  const result = await store.runFullScan();
  const noPathReasons = result.flags
    .filter((f) => ['external_versions_unavailable', 'meridiq_schema_unavailable'].includes(f.code))
    .map((f) => f.detail.reason);
  assert.ok(noPathReasons.every((r) => r === 'no_path'));
});

test('getActiveFlags reflects only the latest scan', async () => {
  const store = await createCcoComplianceScanStore({
    templateRegistry: {
      list: () => [
        { id: 'tpl-1', legalReviewStatus: 'pending', version: '1.0.0' },
        { id: 'tpl-2', legalReviewStatus: 'approved', version: '2.0.0' },
      ],
    },
  });

  const first = await store.runFullScan({ triggeredBy: 'a' });
  assert.ok(first.flags.some((f) => f.code === 'template_legal_review'));
  assert.equal(store.getActiveFlags().length, first.totalFlags);

  const second = await store.runFullScan({ triggeredBy: 'b' });
  // getActiveFlags must track the second (latest) scan, not the first.
  assert.equal(store.getActiveFlags().length, second.totalFlags);
  assert.equal(store.getLatestScan().triggeredBy, 'b');
  assert.equal(store.listScans().length, 2);
  // Most-recent first.
  assert.equal(store.listScans()[0].triggeredBy, 'b');
});

test('template version drift is detected against external catalog', async () => {
  const { dir, filePath } = await tempFile('external.json');
  try {
    await fs.writeFile(
      filePath,
      JSON.stringify({
        templates: [{ id: 'tpl-1', version: '2.0.0' }],
      }),
      'utf8'
    );
    const store = await createCcoComplianceScanStore({
      externalVersionsPath: filePath,
      templateRegistry: {
        list: () => [{ id: 'tpl-1', version: '1.0.0', legalReviewStatus: 'approved' }],
      },
    });
    const result = await store.runFullScan();
    const drift = result.flags.find((f) => f.code === 'template_version_drift');
    assert.ok(drift, 'expected a version drift flag');
    assert.equal(drift.detail.localVersion, '1.0.0');
    assert.equal(drift.detail.externalVersion, '2.0.0');
    // External file exists -> no unavailable flag for it.
    assert.ok(!result.flags.some((f) => f.code === 'external_versions_unavailable'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('scans persist to filePath when provided and survive re-creation', async () => {
  const { dir, filePath } = await tempFile('scans.json');
  try {
    const store = await createCcoComplianceScanStore({ filePath });
    const result = await store.runFullScan({ triggeredBy: 'persist' });

    const reopened = await createCcoComplianceScanStore({ filePath });
    const latest = reopened.getLatestScan();
    assert.ok(latest);
    assert.equal(latest.scanId, result.scanId);
    assert.equal(latest.triggeredBy, 'persist');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('auditLog.append is invoked on runFullScan when provided', async () => {
  const entries = [];
  const store = await createCcoComplianceScanStore({
    auditLog: { append: (e) => entries.push(e) },
  });
  const result = await store.runFullScan({ triggeredBy: 'audited' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'cco.compliance_scan.run');
  assert.equal(entries[0].target.id, result.scanId);
});

test('listScans honours limit and returns copies', async () => {
  const store = await createCcoComplianceScanStore({});
  await store.runFullScan({ triggeredBy: '1' });
  await store.runFullScan({ triggeredBy: '2' });
  await store.runFullScan({ triggeredBy: '3' });

  const limited = store.listScans({ limit: 2 });
  assert.equal(limited.length, 2);
  assert.equal(limited[0].triggeredBy, '3');

  // Mutating a returned copy must not affect stored state.
  limited[0].triggeredBy = 'mutated';
  assert.equal(store.getLatestScan().triggeredBy, '3');
});
