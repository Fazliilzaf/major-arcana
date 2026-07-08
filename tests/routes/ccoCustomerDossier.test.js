'use strict';

/* Dossier-endpoint: GET /cco/runtime/customer/:id/dossier.
 * RBAC-grindad (mail.read), ren läsning, journalinnehåll läcker aldrig i svaret.
 * Funktionellt test mot en riktig express-app med mock-stores på app.locals. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createCcoCustomerDossierRouter } = require('../../src/routes/ccoCustomerDossier');

function buildApp() {
  const app = express();
  // Stub-auth: sätter tenant, låter attachRole/requirePermission avgöra via x-cco-role.
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'u1' };
    next();
  };
  app.use('/api/v1', createCcoCustomerDossierRouter({ requireAuth }));
  app.locals.ccoPatientMasterStore = {
    getPatient: async () => ({ name: 'Anna Karlsson', emails: ['anna@mail.se'] }),
  };
  app.locals.ccoBookingStore = {
    getBookingsForCustomer: async () => [
      { id: 'b1', serviceLabel: 'Konsultation', startsAt: '2026-09-15T09:00', status: 'confirmed' },
    ],
  };
  app.locals.ccoJournalStore = {
    listEntries: async () => [{ createdAt: '2026-05-10', body: 'HEMLIG JOURNALTEXT' }],
  };
  return app;
}

function request(app, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http
        .get({ port, path, headers }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body });
          });
        })
        .on('error', (e) => {
          server.close();
          reject(e);
        });
    });
  });
}

test('owner får dossier med identitet + bokningar (mail.read)', async () => {
  const app = buildApp();
  const res = await request(app, '/api/v1/cco/runtime/customer/CUST-1/dossier', {
    'x-cco-role': 'owner',
  });
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.ok, true);
  assert.equal(json.dossier.identity.name, 'Anna Karlsson');
  assert.equal(json.dossier.bookings.count, 1);
  assert.equal(json.dossier.journal.count, 1);
});

test('journalinnehåll läcker ALDRIG i endpoint-svaret', async () => {
  const app = buildApp();
  const res = await request(app, '/api/v1/cco/runtime/customer/CUST-1/dossier', {
    'x-cco-role': 'owner',
  });
  assert.doesNotMatch(res.body, /HEMLIG JOURNALTEXT/);
});

test('utan behörig roll → blockeras (inte 200)', async () => {
  const app = buildApp();
  const res = await request(app, '/api/v1/cco/runtime/customer/CUST-1/dossier', {
    'x-cco-role': 'gäst',
  });
  assert.notEqual(res.status, 200);
});
