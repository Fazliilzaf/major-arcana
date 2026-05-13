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
