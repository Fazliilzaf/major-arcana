'use strict';

/* Dossier-endpoint: GET /cco/runtime/customer/:id/dossier.
 * RBAC-grindad (mail.read), ren läsning, journalinnehåll läcker aldrig i svaret.
 * Funktionellt test mot en riktig express-app med mock-stores på app.locals. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoCustomerDossierRouter } = require('../../src/routes/ccoCustomerDossier');

async function buildFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-dossier-route-'));
  const auditEvents = [];
  const app = express();
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'u1' };
    next();
  };
  app.use(
    '/api/v1',
    createCcoCustomerDossierRouter({
      requireAuth,
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return event;
        },
      },
      config: {
        stateRoot: tempDir,
        defaultTenantId: 'hairtpclinic',
      },
    })
  );
  app.locals.ccoPatientMasterStore = {
    async getPatient() {
      return null;
    },
    async findPatientByEmail({ email }) {
      if (email !== 'patient@example.com') return null;
      return {
        id: 'patient-1',
        name: 'Anna Patient',
        personnummer: '19900101-1234',
        primaryEmail: 'patient@example.com',
        primaryPhone: '+46701234567',
      };
    },
  };
  app.locals.clientoBookingStore = {
    getBookingsForCustomer() {
      return [
        {
          id: 'b1',
          serviceLabel: 'Konsultation',
          startsAt: '2026-09-15T09:00:00.000Z',
          status: 'confirmed',
        },
      ];
    },
  };
  app.locals.ccoBookingCaseStore = {
    async listCasesForCustomer({ patientId }) {
      assert.equal(patientId, 'patient-1');
      return [{ id: 'case-1', title: 'Offertfråga', status: 'open' }];
    },
  };
  app.locals.ccoJournalStore = {
    async listEntries({ patientId }) {
      assert.equal(patientId, 'patient-1');
      return [
        { createdAt: '2026-05-10', body: 'HEMLIG JOURNALTEXT' },
        { createdAt: '2026-06-10', note: 'diagnos får inte serialiseras' },
      ];
    },
  };
  return { app, tempDir, auditEvents };
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

test('owner får email-baserad dossier med maskad identitet och journalmetadata', async () => {
  const fixture = await buildFixture();
  try {
    const res = await request(
      fixture.app,
      '/api/v1/cco/runtime/customer/patient%40example.com/dossier?email=patient%40example.com',
      { 'x-cco-role': 'owner' }
    );
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
    assert.equal(json.dossier.customerId, 'patient-1');
    assert.equal(json.dossier.identity.name, 'Anna Patient');
    assert.match(json.dossier.identity.personnummerMasked, /•/);
    assert.equal(json.dossier.contact.phones[0], '+46701234567');
    assert.equal(json.dossier.bookings.count, 1);
    assert.equal(json.dossier.cases[0].title, 'Offertfråga');
    assert.equal(json.dossier.journal.count, 2);
    assert.equal(json.dossier.journal.latestAt, '2026-06-10');
    assert.doesNotMatch(res.body, /HEMLIG JOURNALTEXT|diagnos/);
    assert.equal(fixture.auditEvents[0]?.action, 'cco.customer_dossier.read');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('utan behörig roll blockeras av mail.read', async () => {
  const fixture = await buildFixture();
  try {
    const res = await request(fixture.app, '/api/v1/cco/runtime/customer/patient-1/dossier', {
      'x-cco-role': 'personal',
    });
    assert.equal(res.status, 403);
    const json = JSON.parse(res.body);
    assert.equal(json.requiredPermission, 'mail.read');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
