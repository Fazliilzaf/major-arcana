'use strict';

/**
 * P1-003/004 — dossier-routen: en autentiserad tenant → en tenant-dossier.
 * Främmande query-tenant → 403. Patient-mastern får aldrig bredda till en
 * främmande tenant (Curatiio itererar aldrig Hair TP-alias och tvärtom).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createCcoCustomerDossierRouter } = require('../../src/routes/ccoCustomerDossier');

function makePatientMasterStore(spy = []) {
  // Samma e-post finns i BÅDA tenants — nyckeln måste hålla dem isär.
  const patients = {
    'hair-tp-clinic': {
      id: 'p-hair',
      name: 'Hair TP Patient',
      personnummer: '19900101-1111',
      primaryEmail: 'shared@example.com',
    },
    curatiio: {
      id: 'p-cur',
      name: 'Curatiio Patient',
      personnummer: '19900101-2222',
      primaryEmail: 'shared@example.com',
    },
  };
  return {
    async getPatient({ tenantId }) {
      spy.push({ op: 'getPatient', tenantId });
      return patients[tenantId] || null;
    },
    async findPatientByEmail({ tenantId, email }) {
      spy.push({ op: 'findPatientByEmail', tenantId, email });
      if (email !== 'shared@example.com') return null;
      return patients[tenantId] || null;
    },
  };
}

async function buildApp({ authTenantId = 'hair-tp-clinic', role = 'owner' } = {}) {
  const patientSpy = [];
  const bookingSpy = [];
  const app = express();
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: authTenantId, userId: 'u1', role };
    next();
  };
  app.use(
    '/api/v1',
    createCcoCustomerDossierRouter({
      requireAuth,
      config: { defaultTenantId: 'hair-tp-clinic' },
    })
  );
  app.locals.ccoPatientMasterStore = makePatientMasterStore(patientSpy);
  app.locals.clientoBookingStore = {
    getBookingsForCustomer({ tenantId }) {
      bookingSpy.push(tenantId);
      return [];
    },
  };
  return { app, patientSpy, bookingSpy };
}

function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http
        .get({ port, path }, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, body })));
        })
        .on('error', (e) => {
          server.close(() => reject(e));
        });
    });
  });
}

const DOSSIER_PATH = '/api/v1/cco/runtime/customer/shared%40example.com/dossier?email=shared%40example.com';

test('T-001: Hair TP-auth läser bara Hair TP (samma e-post finns i Curatiio)', async () => {
  const { app, patientSpy } = await buildApp({ authTenantId: 'hair-tp-clinic' });
  const res = await request(app, DOSSIER_PATH);
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.dossier.tenantId, 'hair-tp-clinic');
  assert.equal(json.dossier.identity.name, 'Hair TP Patient');
  assert.equal(json.dossier.patientId, 'p-hair');
  // Patient-mastern frågades ALDRIG efter Curatiio.
  assert.ok(
    patientSpy.every((c) => c.tenantId !== 'curatiio'),
    'Hair TP-läsning fick inte röra Curatiio: ' + JSON.stringify(patientSpy)
  );
});

test('T-002: syntetisk Curatiio-auth läser bara Curatiio (ingen Hair TP-alias)', async () => {
  const { app, patientSpy } = await buildApp({ authTenantId: 'curatiio' });
  const res = await request(app, DOSSIER_PATH);
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.dossier.tenantId, 'curatiio');
  assert.equal(json.dossier.identity.name, 'Curatiio Patient');
  assert.equal(json.dossier.patientId, 'p-cur');
  // Curatiio itererade ALDRIG Hair TP-alias.
  assert.ok(
    patientSpy.every((c) => c.tenantId === 'curatiio'),
    'Curatiio-läsning fick inte röra Hair TP-alias: ' + JSON.stringify(patientSpy)
  );
});

test('T-005: samma e-post över tenants hålls isolerad (olika identiteter)', async () => {
  const hair = await buildApp({ authTenantId: 'hair-tp-clinic' });
  const cur = await buildApp({ authTenantId: 'curatiio' });

  const hairRes = await request(hair.app, DOSSIER_PATH);
  const curRes = await request(cur.app, DOSSIER_PATH);
  assert.equal(hairRes.status, 200);
  assert.equal(curRes.status, 200);

  const hairDossier = JSON.parse(hairRes.body).dossier;
  const curDossier = JSON.parse(curRes.body).dossier;
  assert.equal(hairDossier.identity.name, 'Hair TP Patient');
  assert.equal(curDossier.identity.name, 'Curatiio Patient');
  assert.notEqual(hairDossier.patientId, curDossier.patientId);
  assert.notEqual(hairDossier.identity.personnummerMasked, curDossier.identity.personnummerMasked);
});

test('T-003: Hair TP + query tenantId=curatiio → 403', async () => {
  const { app } = await buildApp({ authTenantId: 'hair-tp-clinic' });
  const res = await request(app, `${DOSSIER_PATH}&tenantId=curatiio`);
  assert.equal(res.status, 403);
  const json = JSON.parse(res.body);
  assert.equal(json.ok, false);
  assert.equal(json.error, 'tenant_scope_forbidden');
});

test('T-004: Curatiio + query tenantId=hair-tp-clinic → 403', async () => {
  const { app } = await buildApp({ authTenantId: 'curatiio' });
  const res = await request(app, `${DOSSIER_PATH}&tenantId=hair-tp-clinic`);
  assert.equal(res.status, 403);
});

test('T-011: dossiern får aldrig aggregera facts från två tenants', async () => {
  const { app, bookingSpy } = await buildApp({ authTenantId: 'hair-tp-clinic' });
  const res = await request(app, DOSSIER_PATH);
  assert.equal(res.status, 200);
  // Alla facts fick SAMMA canonical tenant — aldrig Curatiio eller en blandning.
  assert.ok(bookingSpy.length >= 1, 'booking-store anropades');
  assert.ok(
    bookingSpy.every((t) => t === 'hair-tp-clinic'),
    'booking-store fick enbart canonical tenant: ' + JSON.stringify(bookingSpy)
  );
});

test('T-009: dossier-konversationsdata använder canonical tenant (aldrig query-värdet)', async () => {
  const { app, bookingSpy } = await buildApp({ authTenantId: 'hair-tp-clinic' });
  // Samma-tenant-alias i query är tillåtet (T-024) men storen ska få canonical.
  const res = await request(app, `${DOSSIER_PATH}&tenantId=hairtpclinic`);
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.dossier.tenantId, 'hair-tp-clinic');
  assert.ok(
    bookingSpy.every((t) => t === 'hair-tp-clinic'),
    'storen fick canonical tenant även med alias i query: ' + JSON.stringify(bookingSpy)
  );
});

test('T-014: upprepad dossier-läsning är deterministisk', async () => {
  const { app } = await buildApp({ authTenantId: 'hair-tp-clinic' });
  const r1 = await request(app, DOSSIER_PATH);
  const r2 = await request(app, DOSSIER_PATH);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.deepEqual(JSON.parse(r1.body), JSON.parse(r2.body));
});
