const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoSettingsStore } = require('../../src/ops/ccoSettingsStore');

test('cco settings store preserves mailFoundation when generic settings are updated later', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-store-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });

    await store.saveTenantSettings({
      tenantId: 'tenant-a',
      settings: {
        theme: 'mist',
        mailFoundation: {
          defaults: {
            senderMailboxId: 'support@hairtpclinic.com',
            signatureProfileId: 'mailbox-signature:support@hairtpclinic.com',
          },
          customMailboxes: [
            {
              id: 'support@hairtpclinic.com',
              email: 'support@hairtpclinic.com',
              label: 'Support',
              signature: {
                label: 'Support',
                fullName: 'Hair TP Support',
                title: 'Supportteam',
              },
            },
          ],
        },
      },
    });

    await store.saveTenantSettings({
      tenantId: 'tenant-a',
      settings: {
        theme: 'ink',
        density: 'airy',
      },
    });

    const settings = await store.getTenantSettings({ tenantId: 'tenant-a' });
    assert.equal(settings.theme, 'ink');
    assert.equal(settings.density, 'airy');
    assert.equal(
      settings.mailFoundation.defaults.senderMailboxId,
      'support@hairtpclinic.com'
    );
    assert.equal(
      settings.mailFoundation.defaults.signatureProfileId,
      'mailbox-signature:support@hairtpclinic.com'
    );
    assert.equal(settings.mailFoundation.customMailboxes.length, 1);
    assert.equal(
      settings.mailFoundation.customMailboxes[0].email,
      'support@hairtpclinic.com'
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createCcoSettingsStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoSettingsStore({ filePath: '  ' }), /filePath krävs/);
});

test('getTenantSettings rejects blank tenantId', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-tenant-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await assert.rejects(() => store.getTenantSettings({ tenantId: '' }), /tenantId krävs/);
    await assert.rejects(() => store.getTenantSettings({ tenantId: '   ' }), /tenantId krävs/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveTenantSettings maps theme and density aliases', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-alias-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await store.saveTenantSettings({
      tenantId: 't1',
      settings: { theme: 'light', density: 'comfortable' },
    });
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.theme, 'mist');
    assert.equal(s.density, 'balanced');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveTenantSettings partial toggles leave other defaults intact', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-toggles-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await store.saveTenantSettings({
      tenantId: 't1',
      settings: { toggles: { soundAlerts: true, slaAlerts: false } },
    });
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.toggles.soundAlerts, true);
    assert.equal(s.toggles.slaAlerts, false);
    assert.equal(s.toggles.googleCalendarSync, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('requestDeleteAccount sets deleteRequestedAt and trims actor', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-delete-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await store.saveTenantSettings({ tenantId: 't1', settings: { theme: 'ink' } });
    const out = await store.requestDeleteAccount({ tenantId: 't1', actorUserId: '  owner-1  ' });
    assert.ok(out.deleteRequestedAt);
    assert.match(out.deleteRequestedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(out.actorUserId, 'owner-1');
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.deleteRequestedAt, out.deleteRequestedAt);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('default tenant settings include Cliento migration lead time defaults', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-lead-time-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    const settings = await store.getTenantSettings({ tenantId: 'hair-tp-clinic' });
    assert.equal(settings.bookingReminderLeadTime.globalDefaultHours, 24);
    assert.equal(settings.bookingReminderLeadTime.channelDefaults.online, 4);
    assert.equal(settings.bookingReminderLeadTime.channelDefaults.physical, 24);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getTenantSettings returns a shallow copy of settings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-copy-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    const a = await store.getTenantSettings({ tenantId: 't1' });
    a.theme = 'mutated';
    const b = await store.getTenantSettings({ tenantId: 't1' });
    assert.notEqual(b.theme, 'mutated');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveTenantSettings unknown theme and density fall back to defaults', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-unknown-theme-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await store.saveTenantSettings({
      tenantId: 't1',
      settings: { theme: 'neon', density: 'cozy' },
    });
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.theme, 'mist');
    assert.equal(s.density, 'compact');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveTenantSettings replaces invalid sidebarSections with default layout', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-sidebar-shape-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    await store.saveTenantSettings({
      tenantId: 't1',
      settings: { sidebarSections: 'not-an-array' },
    });
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.sidebarSections.length, 6);
    assert.ok(s.sidebarSections.some((row) => row.id === 'metrics'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('saveTenantSettings caps sidebarSections at twelve entries', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-settings-sidebar-cap-'));
  try {
    const store = await createCcoSettingsStore({
      filePath: path.join(tempDir, 'settings.json'),
    });
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `sec-${i}`,
      label: `L${i}`,
      enabled: true,
      order: i + 1,
    }));
    await store.saveTenantSettings({ tenantId: 't1', settings: { sidebarSections: many } });
    const s = await store.getTenantSettings({ tenantId: 't1' });
    assert.equal(s.sidebarSections.length, 12);
    assert.equal(s.sidebarSections[0].id, 'sec-0');
    assert.equal(s.sidebarSections[11].id, 'sec-11');
    assert.equal(s.sidebarSections.some((row) => row.id === 'sec-14'), false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
