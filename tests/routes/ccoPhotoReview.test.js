'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoPhotoReviewRouter } = require('../../src/routes/ccoPhotoReview');
const {
  applyPhotoReviewDecision,
  applyPhotoReviewReassign,
  applyPhotoReviewReject,
  requireReason,
} = require('../../src/routes/ccoPhotoReviewWrite');
const { attachRole } = require('../../src/security/ccoRbac');

function createMockStore(initial = {}) {
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
    async patchAssetForReview(id, patch) {
      items[id] = { ...items[id], ...patch };
      return items[id];
    },
    async transitionStatus(id, status) {
      items[id] = { ...items[id], status };
      return items[id];
    },
    async markAsVisibleOnPatientCard(id) {
      items[id] = { ...items[id], status: 'VISIBLE_ON_PATIENT_CARD' };
      return items[id];
    },
  };
}

function createAudit() {
  const items = [];
  return {
    append(entry) {
      items.push(entry);
    },
    query({ action } = {}) {
      return action ? items.filter((i) => i.action === action) : items;
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

test('photo-review summary counts NEEDS_REVIEW photos only (Fas 1 read-only)', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-1',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      originalFileName: 'photo-test.jpg',
      storageKey: '2026/05/x.jpg',
      checksum: 'sha256:abc',
      importedAt: '2026-05-30T10:00:00.000Z',
    },
  };

  const app = express();
  app.use((req, _res, next) => {
    req.headers['x-cco-role'] = 'operator';
    next();
  });
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: async () => ({ assetStore: createMockStore(items) }),
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
      writeEnabled: false,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/photo-review/summary`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pendingPhotos, 1);
    assert.equal(body.readOnly, true);
    assert.equal(body.writeEnabled, false);
    assert.equal(body.phase, 'fas1_readonly');
  });
});

test('photo-review approve requires reason and writes audit detail', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-2',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      originalFileName: 'secret.jpg',
      storageKey: '2026/05/x/y.jpg',
      checksum: 'sha256:abc',
      fileSize: 100,
    },
  };
  const store = createMockStore(items);
  const auditLog = createAudit();

  assert.throws(() => requireReason({ reason: 'ab' }), /reason krävs/);

  const result = await applyPhotoReviewDecision(
    store,
    'a1',
    {
      decision: 'approve',
      category: 'photo_before',
      reason: 'test_approve reason',
    },
    {
      actor: { role: 'operator', userId: 'tester' },
      auditLog,
      pilotConfig: { patientIds: ['pat-2'], maxDecisions: 20 },
    }
  );

  assert.equal(result.decision, 'approve');
  assert.equal(result.asset.status, 'VISIBLE_ON_PATIENT_CARD');
  assert.equal(result.asset.category, 'photo_before');
  assert.equal(auditLog.items.length, 1);
  assert.equal(auditLog.items[0].action, 'photo_review.decision');
  assert.equal(auditLog.items[0].detail.oldStatus, 'NEEDS_REVIEW');
  assert.equal(auditLog.items[0].detail.newStatus, 'VISIBLE_ON_PATIENT_CARD');
  assert.equal(auditLog.items[0].detail.reviewer, 'tester');
});

test('photo-review reassign keeps NEEDS_REVIEW without alsoApprove', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-2',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      checksum: 'c',
      fileSize: 10,
    },
  };
  const store = createMockStore(items);
  const auditLog = createAudit();

  const result = await applyPhotoReviewReassign(
    store,
    'a1',
    { category: 'photo_after', reason: 'category uncertain', alsoApprove: false },
    {
      actor: { role: 'operator', userId: 'tester' },
      auditLog,
      pilotConfig: { patientIds: ['pat-2'], maxDecisions: 20 },
    }
  );

  assert.equal(result.decision, 'reassign');
  assert.equal(result.asset.status, 'NEEDS_REVIEW');
  assert.equal(result.asset.category, 'photo_after');
});

test('photo-review decide endpoint not mounted when writeEnabled=false', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-2',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['x-cco-role'] = 'operator';
    next();
  });
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: async () => ({ assetStore: createMockStore(items) }),
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
      writeEnabled: false,
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/photo-review/assets/a1/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
      body: JSON.stringify({
        decision: 'approve',
        category: 'photo_before',
        reason: 'test reason',
      }),
    });
    assert.equal(res.status, 404);
  });
});

test('photo-review decide endpoint returns 409 for non-review asset when write enabled', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-2',
      status: 'VISIBLE_ON_PATIENT_CARD',
      category: 'photo_during',
      mimeType: 'image/jpeg',
    },
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.headers['x-cco-role'] = 'operator';
    next();
  });
  app.use(
    '/api/v1/cco',
    createCcoPhotoReviewRouter({
      resolveStores: async () => ({ assetStore: createMockStore(items) }),
      attachRole,
      requirePermission: () => (_req, _res, next) => next(),
      auditLog: null,
      writeEnabled: true,
      pilotConfig: { patientIds: ['pat-2'], maxDecisions: 20 },
    })
  );

  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/photo-review/assets/a1/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
      body: JSON.stringify({
        decision: 'approve',
        category: 'photo_before',
        reason: 'test reason',
      }),
    });
    assert.equal(res.status, 409);
  });
});

test('photo-review approve blocks missing fileSize', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-2',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      checksum: 'c',
      fileSize: 0,
    },
  };
  const store = createMockStore(items);

  await assert.rejects(
    () =>
      applyPhotoReviewDecision(
        store,
        'a1',
        { decision: 'approve', category: 'photo_before', reason: 'missing file size' },
        {
          actor: { role: 'operator', userId: 'tester' },
          auditLog: createAudit(),
          pilotConfig: { patientIds: ['pat-2'], maxDecisions: 20 },
        }
      ),
    (err) => /fileSize/.test(err.message)
  );
});

test('photo-review full cohort allows any pilot patient', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'any-patient-id',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      checksum: 'c',
      fileSize: 10,
    },
  };
  const store = createMockStore(items);

  await applyPhotoReviewReject(
    store,
    'a1',
    { reason: 'full cohort reject test' },
    {
      actor: { role: 'operator', userId: 'tester' },
      auditLog: createAudit(),
      pilotConfig: { fullCohort: true, patientIds: [], maxDecisions: 0 },
    }
  );

  assert.equal(store.getAsset('a1').status, 'REJECTED');
});

test('photo-review pilot blocks non-pilot patient', async () => {
  const items = {
    a1: {
      id: 'a1',
      patientId: 'pat-other',
      status: 'NEEDS_REVIEW',
      category: 'photo_during',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      checksum: 'c',
      fileSize: 10,
    },
  };
  const store = createMockStore(items);

  await assert.rejects(
    () =>
      applyPhotoReviewDecision(
        store,
        'a1',
        { decision: 'reject', reason: 'not in pilot' },
        {
          actor: { role: 'operator', userId: 'tester' },
          auditLog: createAudit(),
          pilotConfig: { patientIds: ['pat-2'], maxDecisions: 20 },
        }
      ),
    (err) => err.message === 'pilot_patient_not_allowed'
  );
});
