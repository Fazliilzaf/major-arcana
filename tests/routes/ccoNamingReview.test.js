'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoNamingReviewRouter } = require('../../src/routes/ccoNamingReview');
const { attachRole } = require('../../src/security/ccoRbac');

const passAuth = (_req, _res, next) => next();

function createMockAssetStore(initial = {}) {
  const items = { ...initial };
  return {
    _state() {
      return { items };
    },
    getAsset(id) {
      return items[id] || null;
    },
    listAssetsForPatient(patientId) {
      return Object.values(items).filter((a) => a.patientId === patientId);
    },
    async patchAssetNamingMetadata(id, patch, { actor, reason } = {}) {
      items[id] = { ...items[id], ...patch, _lastActor: actor, _lastReason: reason };
      return items[id];
    },
    listItemsForEnrichment() {
      return Object.values(items);
    },
  };
}

function createMockPatientStore(patients = []) {
  return {
    async listPatients({ tenantId, limit }) {
      return { patients: patients.slice(0, limit) };
    },
    async getPatient({ patientId }) {
      return patients.find((p) => p.id === patientId) || null;
    },
  };
}

function createAudit() {
  const items = [];
  return {
    append(entry) {
      items.push(entry);
    },
    items,
  };
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/cco`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('naming-review queue summary (read-only)', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = {
    a1: {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'FUE-avtal.pdf',
      treatmentType: 'FUE',
      importedAt: '2026-01-15T10:00:00.000Z',
      tenantId: 't1',
    },
  };

  const app = express();
  app.use(
    '/api/v1/cco',
    createCcoNamingReviewRouter({
      resolvePatientMasterStore: async () => createMockPatientStore(patients),
      resolveAssetStore: async () => createMockAssetStore(assets),
      requireCcoAuthenticated: passAuth,
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/naming-review/queue?tenant=t1&maskIds=false`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalReviewQueueSize, 1);
    assert.equal(body.reasonTotals.fallback_session_number, 1);
    assert.equal(body.patientsAffected, 1);
  });
});

test('naming-review resolve sets manual_resolved and writes documentDate', async () => {
  const patients = [{ id: 'p1', tenantId: 't1', name: 'Test Patient' }];
  const assets = {
    a1: {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'FUE-avtal.pdf',
      treatmentType: 'FUE',
      importedAt: '2026-01-15T10:00:00.000Z',
      namingStatus: 'needs_review_for_naming',
      tenantId: 't1',
    },
  };
  const assetStore = createMockAssetStore(assets);
  const auditLog = createAudit();

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/cco',
    createCcoNamingReviewRouter({
      resolvePatientMasterStore: async () => createMockPatientStore(patients),
      resolveAssetStore: async () => assetStore,
      requireCcoAuthenticated: passAuth,
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/naming-review/assets/a1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentDate: '2026-01-15', reason: 'Datum från journal' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.namingStatus, 'manual_resolved');
    assert.equal(body.documentDate, '2026-01-15');
    assert.equal(auditLog.items.length, 1);
    assert.equal(auditLog.items[0].action, 'naming_review.asset_resolved');
  });
});

test('naming-review resolve rejects missing reason', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = {
    a1: {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      namingStatus: 'needs_review_for_naming',
      tenantId: 't1',
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/cco',
    createCcoNamingReviewRouter({
      resolvePatientMasterStore: async () => createMockPatientStore(patients),
      resolveAssetStore: async () => createMockAssetStore(assets),
      requireCcoAuthenticated: passAuth,
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/naming-review/assets/a1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'ab' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('reason'));
  });
});

test('naming-review resolve rejects non-review asset', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = {
    a1: {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      namingStatus: 'resolved',
      tenantId: 't1',
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/cco',
    createCcoNamingReviewRouter({
      resolvePatientMasterStore: async () => createMockPatientStore(patients),
      resolveAssetStore: async () => createMockAssetStore(assets),
      requireCcoAuthenticated: passAuth,
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/naming-review/assets/a1/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Skall inte gå' }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'asset_not_in_review');
  });
});

test('naming-review patient assets lists needs_review_for_naming items', async () => {
  const patients = [{ id: 'p1', tenantId: 't1', displayName: 'Anna' }];
  const assets = {
    a1: {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'FUE-avtal.pdf',
      treatmentType: 'FUE',
      importedAt: '2026-01-15T10:00:00.000Z',
      namingStatus: 'needs_review_for_naming',
      tenantId: 't1',
    },
    a2: {
      id: 'a2',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'Konsultation.pdf',
      treatmentType: 'consultation',
      namingStatus: 'resolved',
      tenantId: 't1',
    },
  };

  const app = express();
  app.use(
    '/api/v1/cco',
    createCcoNamingReviewRouter({
      resolvePatientMasterStore: async () => createMockPatientStore(patients),
      resolveAssetStore: async () => createMockAssetStore(assets),
      requireCcoAuthenticated: passAuth,
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/naming-review/patients/p1/assets?tenant=t1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.count, 1);
    assert.equal(body.items[0].assetId, 'a1');
    assert.equal(body.patientName, 'Anna');
  });
});
