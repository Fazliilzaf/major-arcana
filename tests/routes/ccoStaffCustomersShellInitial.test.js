'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createCcoStaffRouter } = require('../../src/routes/ccoStaff');

const TENANT = 'hair-tp-clinic';

function requireAuth(req, _res, next) {
  req.auth = { tenantId: TENANT, userId: 'owner-1', role: 'OWNER' };
  req.currentUser = { id: 'owner-1', email: 'owner@example.test', displayName: 'Owner' };
  next();
}

function requireRole() {
  return (_req, _res, next) => next();
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test('customers-shell listfas returnerar patient-master innan global enrichment', async () => {
  const calls = [];
  const patients = [
    {
      id: 'patient-1',
      tenantId: TENANT,
      displayName: 'Anna Andersson',
      primaryEmail: 'anna@example.test',
      emails: ['anna@example.test'],
      phones: [],
      flags: [],
      fileSummary: {},
    },
    {
      id: 'patient-2',
      tenantId: TENANT,
      displayName: 'Bertil Berg',
      primaryEmail: 'bertil@example.test',
      emails: ['bertil@example.test'],
      phones: [],
      flags: [],
      fileSummary: {},
    },
  ];
  const patientMasterStore = {
    async listPatients(options) {
      calls.push(options);
      return {
        total: patients.length,
        offset: Number(options.offset) || 0,
        limit: Number(options.limit) || 60,
        patients,
      };
    },
    async getTenantStats() {
      return { totalPatients: patients.length };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    createCcoStaffRouter({
      patientMasterStore,
      authStore: {},
      config: { defaultTenantId: TENANT },
      requireAuth,
      requireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/cco/staff/customers-shell?phase=list&limit=2&offset=0`
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.provider, 'customers-shell-list');
    assert.equal(body.enrichmentPending, true);
    assert.equal(body.bookingCoverage, 'pending');
    assert.equal(body.patients.total, 2);
    assert.deepEqual(
      body.patients.patients.map((patient) => patient.patientId),
      ['patient-1', 'patient-2']
    );
  });

  assert.equal(calls.length, 1, 'Listfasen får inte göra en separat 50k-läsning för statistik.');
  assert.equal(calls[0].tenantId, TENANT);
  assert.equal(calls[0].limit, 2);
});
