const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoWorkspaceRouter } = require('../../src/routes/ccoWorkspace');
const { createCcoCustomersRouter } = require('../../src/routes/ccoCustomers');
const { createCcoPortalStore } = require('../../src/ops/ccoPortalStore');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-portal-route-'));
  const portalStore = await createCcoPortalStore({
    filePath: path.join(tempDir, 'portal.json'),
  });
  const customerStore = await createCcoCustomerStore({
    filePath: path.join(tempDir, 'customers.json'),
  });
  const auditEvents = [];

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      tenantId: 'tenant-a',
      userId: 'anna@example.com',
      role: 'PATIENT',
    };
    next();
  });
  app.use(
    '/api/v1',
    createCcoWorkspaceRouter({
      noteStore: {
        async getNotesByConversation() {
          return [];
        },
      },
      followUpStore: {
        async getLatestFollowUp() {
          return null;
        },
      },
      bookingStore: {
        async ensureCase() {
          return null;
        },
      },
      workspacePrefsStore: {
        async getWorkspacePrefs() {
          return null;
        },
      },
      portalStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
      },
    })
  );
  app.use(
    '/api/v1',
    createCcoCustomersRouter({
      customerStore,
      portalStore,
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
      requireAuth(_req, _res, next) {
        next();
      },
      requireRole() {
        return (_req, _res, next) => next();
      },
    })
  );

  return {
    app,
    tempDir,
    portalStore,
    customerStore,
    auditEvents,
  };
}

test('cco portal router publicerar version och kundportalen ser bara publicerat läge', async () => {
  const fixture = await createFixture();

  try {
    await withServer(fixture.app, async (baseUrl) => {
      const publishResponse = await fetch(`${baseUrl}/cco-workspace/portal/publish`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          customerKey: 'anna@example.com',
          customerName: 'Anna Karlsson',
          customerEmail: 'anna@example.com',
          title: 'Layers för kunden',
          summary: 'Head och Heart',
          note: 'Nästa version redo.',
          layers: [
            { layerId: 'head', label: 'Head', products: ['AMARENA E PRUGNA'] },
            { layerId: 'heart', label: 'Heart', products: ['ANANAS LEGNO PAPAYA'] },
          ],
          librarySnapshot: {
            products: ['AMARENA E PRUGNA', 'ANANAS LEGNO PAPAYA'],
          },
        }),
      });

      assert.equal(publishResponse.status, 200);
      const publishPayload = await publishResponse.json();
      assert.equal(publishPayload.version.versionNumber, 1);
      assert.equal(publishPayload.notification.notificationId.length > 0, true);
      assert.equal(publishPayload.portalOverview.customerCount, 1);

      const customerPortalResponse = await fetch(
        `${baseUrl}/cco/customers/portal?customerKey=anna@example.com`
      );
      assert.equal(customerPortalResponse.status, 200);
      const customerPortalPayload = await customerPortalResponse.json();
      assert.equal(customerPortalPayload.portal.currentPublishedVersionNumber, 1);
      assert.equal(customerPortalPayload.portal.currentDraft, null);
      assert.equal(Array.isArray(customerPortalPayload.portal.drafts), true);
      assert.equal(customerPortalPayload.portal.drafts.length, 0);

      const ackResponse = await fetch(
        `${baseUrl}/cco/customers/portal/notifications/${publishPayload.notification.notificationId}/ack?customerKey=anna@example.com`,
        {
          method: 'POST',
        }
      );
      assert.equal(ackResponse.status, 200);
      const ackPayload = await ackResponse.json();
      assert.equal(ackPayload.notification.readAt.length > 0, true);

      const viewedResponse = await fetch(
        `${baseUrl}/cco/customers/portal/viewed?customerKey=anna@example.com`,
        {
          method: 'POST',
        }
      );
      assert.equal(viewedResponse.status, 200);
      const viewedPayload = await viewedResponse.json();
      assert.equal(viewedPayload.portal.lastViewedAt.length > 0, true);
    });

    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.portal.version.publish'),
      true
    );
    assert.equal(
      fixture.auditEvents.some((event) => event.action === 'cco.portal.notification.ack'),
      true
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
