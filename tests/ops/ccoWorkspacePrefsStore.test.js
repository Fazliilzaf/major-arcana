const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoWorkspacePrefsStore } = require('../../src/ops/ccoWorkspacePrefsStore');

test('cco workspace prefs store sparar, läser och återställer panelbredder', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');

  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });

    const created = await store.saveWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      workspaceId: 'major-arcana-preview',
      leftWidth: 488,
      rightWidth: 404,
    });

    assert.equal(created.leftWidth, 488);
    assert.equal(created.rightWidth, 404);

    const fetched = await store.getWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      workspaceId: 'major-arcana-preview',
    });

    assert.equal(fetched.preferenceId, created.preferenceId);

    const reset = await store.resetWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      workspaceId: 'major-arcana-preview',
    });

    assert.equal(reset.reset, true);

    const afterReset = await store.getWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'owner-a',
      workspaceId: 'major-arcana-preview',
    });

    assert.equal(afterReset, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createCcoWorkspacePrefsStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoWorkspacePrefsStore({ filePath: '  ' }), /filePath krävs/);
});

test('saveWorkspacePrefs throws when composite key fields are missing', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-missing-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');
  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });
    await assert.rejects(
      () =>
        store.saveWorkspacePrefs({
          tenantId: 't',
          userId: '',
          workspaceId: 'w',
          leftWidth: 400,
          rightWidth: 300,
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('widths fall back to defaults when non-positive or NaN', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-widths-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');
  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });
    const bad = await store.saveWorkspacePrefs({
      tenantId: 't',
      userId: 'u',
      workspaceId: 'w',
      leftWidth: 0,
      rightWidth: -10,
    });
    assert.equal(bad.leftWidth, 458);
    assert.equal(bad.rightWidth, 372);
    const nan = await store.saveWorkspacePrefs({
      tenantId: 't',
      userId: 'u2',
      workspaceId: 'w',
      leftWidth: Number.NaN,
      rightWidth: Number.NaN,
    });
    assert.equal(nan.leftWidth, 458);
    assert.equal(nan.rightWidth, 372);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveWorkspacePrefs updates same row and preserves preferenceId', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-update-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');
  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });
    const first = await store.saveWorkspacePrefs({
      tenantId: 't',
      userId: 'u',
      workspaceId: 'w',
      leftWidth: 400,
      rightWidth: 300,
    });
    const second = await store.saveWorkspacePrefs({
      tenantId: 't',
      userId: 'u',
      workspaceId: 'w',
      leftWidth: 500,
      rightWidth: 320,
    });
    assert.equal(second.preferenceId, first.preferenceId);
    assert.equal(second.leftWidth, 500);
    assert.equal(second.rightWidth, 320);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getWorkspacePrefs returns null for other tenant and shallow copy', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-isolate-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');
  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });
    await store.saveWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'u',
      workspaceId: 'w',
      leftWidth: 420,
      rightWidth: 310,
    });
    assert.equal(
      await store.getWorkspacePrefs({ tenantId: 'tenant-b', userId: 'u', workspaceId: 'w' }),
      null
    );
    const row = await store.getWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'u',
      workspaceId: 'w',
    });
    row.leftWidth = 999;
    const again = await store.getWorkspacePrefs({
      tenantId: 'tenant-a',
      userId: 'u',
      workspaceId: 'w',
    });
    assert.equal(again.leftWidth, 420);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('resetWorkspacePrefs returns reset false when no matching prefs', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-workspace-prefs-reset-miss-'));
  const filePath = path.join(tempDir, 'cco-prefs.json');
  try {
    const store = await createCcoWorkspacePrefsStore({ filePath });
    const out = await store.resetWorkspacePrefs({
      tenantId: 't',
      userId: 'u',
      workspaceId: 'w',
    });
    assert.equal(out.reset, false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
