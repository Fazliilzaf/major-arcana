const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPortalStore } = require('../../src/ops/ccoPortalStore');

test('cco portal store sparar utkast, publicerar versioner och kvitterar notifieringar', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-portal-store-'));
  const filePath = path.join(tempDir, 'cco-portal.json');

  try {
    const store = await createCcoPortalStore({ filePath });

    const saved = await store.saveTenantPortalDraft({
      tenantId: 'tenant-a',
      customerKey: 'anna@example.com',
      customerName: 'Anna Karlsson',
      customerEmail: 'anna@example.com',
      workspaceId: 'major-arcana-preview',
      title: 'Första skissen',
      summary: 'Head och Heart',
      note: 'Skiss för kundportal',
      layers: [
        { layerId: 'layer-1', label: 'Head', products: ['AMARENA E PRUGNA'] },
        { layerId: 'layer-2', label: 'Heart', products: ['ANANAS LEGNO PAPAYA'] },
      ],
      librarySnapshot: {
        products: ['AMARENA E PRUGNA', 'ANANAS LEGNO PAPAYA'],
      },
      ownerUserId: 'owner-1',
      ownerName: 'Sara',
    });

    assert.equal(saved.draft.draftId.length > 0, true);
    assert.equal(saved.portal.currentDraftTitle, 'Första skissen');
    assert.equal(saved.portal.draftCount, 1);

    const published = await store.publishTenantPortalDraft({
      tenantId: 'tenant-a',
      customerKey: 'anna@example.com',
      customerName: 'Anna Karlsson',
      customerEmail: 'anna@example.com',
      workspaceId: 'major-arcana-preview',
      title: 'Första skissen',
      summary: 'Head och Heart',
      note: 'Skiss för kundportal',
      layers: [
        { layerId: 'layer-1', label: 'Head', products: ['AMARENA E PRUGNA'] },
        { layerId: 'layer-2', label: 'Heart', products: ['ANANAS LEGNO PAPAYA'] },
      ],
      librarySnapshot: {
        products: ['AMARENA E PRUGNA', 'ANANAS LEGNO PAPAYA'],
      },
      ownerUserId: 'owner-1',
      ownerName: 'Sara',
      notificationMessage: 'Din nya layers-skiss är redo.',
    });

    assert.equal(published.version.versionNumber, 1);
    assert.equal(published.notification.readAt, '');
    assert.equal(published.portal.currentPublishedVersionNumber, 1);
    assert.equal(published.portal.notifications.length, 1);

    const customerPortal = await store.getTenantCustomerPortal({
      tenantId: 'tenant-a',
      customerKey: 'anna@example.com',
      viewerScope: 'customer',
    });

    assert.equal(customerPortal.currentDraft, null);
    assert.equal(customerPortal.currentPublishedVersion.versionNumber, 1);
    assert.equal(customerPortal.versions.length, 1);

    const viewed = await store.markTenantPortalViewed({
      tenantId: 'tenant-a',
      customerKey: 'anna@example.com',
      actorUserId: 'anna@example.com',
      viewerScope: 'customer',
    });

    assert.equal(viewed.portal.lastViewedAt.length > 0, true);

    const acknowledged = await store.acknowledgeTenantPortalNotification({
      tenantId: 'tenant-a',
      customerKey: 'anna@example.com',
      notificationId: published.notification.notificationId,
      actorUserId: 'anna@example.com',
    });

    assert.equal(acknowledged.notification.readAt.length > 0, true);
    assert.equal(acknowledged.portal.lastAcknowledgedAt.length > 0, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getTenantPortalOverview tolererar korrupta customer records', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-portal-corrupt-'));
  const filePath = path.join(tempDir, 'cco-portal.json');

  try {
    const store = await createCcoPortalStore({ filePath });

    // Spara en korrekt skiss för att skapa tenant-state.
    await store.saveTenantPortalDraft({
      tenantId: 'tenant-b',
      customerKey: 'ok@example.com',
      customerName: 'OK Kund',
      customerEmail: 'ok@example.com',
      workspaceId: 'major-arcana-preview',
      title: 'OK',
      summary: 'OK',
      layers: [],
      librarySnapshot: { products: [] },
      ownerUserId: 'owner-1',
      ownerName: 'Sara',
    });

    // Skriv in korrupta records direkt i filen (simulerar legacy/trasig data).
    const raw = await fs.readFile(filePath, 'utf8');
    const state = JSON.parse(raw);
    state.tenants['tenant-b'].customers['null-record'] = null;
    state.tenants['tenant-b'].customers['missing-arrays'] = {
      customerKey: 'missing@example.com',
      customerName: 'Missing Arrays',
      versions: null,
      drafts: undefined,
      notifications: 'not-an-array',
    };
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));

    // Ladda om storen och hämta översikt — får inte krascha.
    const reloaded = await createCcoPortalStore({ filePath });
    const overview = await reloaded.getTenantPortalOverview({ tenantId: 'tenant-b' });

    assert.equal(overview.customerCount >= 2, true);
    assert.equal(overview.customers.some((c) => c.customerKey === 'ok@example.com'), true);
    assert.equal(overview.customers.some((c) => c.customerKey === 'missing@example.com'), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getTenantPortalOverview tål korrupta kundposter utan att krascha', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-portal-corrupt-'));
  const filePath = path.join(tempDir, 'cco-portal.json');

  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      tenants: {
        'tenant-b': {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          customers: {
            'good@example.com': {
              customerKey: 'good@example.com',
              customerName: 'Good Customer',
              versions: [],
              drafts: [],
              notifications: [],
              events: [],
            },
            'bad@example.com': null,
            'ugly@example.com': {
              customerKey: 'ugly@example.com',
              // versions/drafts/notifications saknas helt
            },
          },
        },
      },
    })
  );

  try {
    const store = await createCcoPortalStore({ filePath });
    const overview = await store.getTenantPortalOverview({ tenantId: 'tenant-b' });
    assert.equal(overview.customerCount, 2);
    assert.ok(overview.customers.some((c) => c.customerKey === 'good@example.com'));
    assert.ok(overview.customers.some((c) => c.customerKey === 'ugly@example.com'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
