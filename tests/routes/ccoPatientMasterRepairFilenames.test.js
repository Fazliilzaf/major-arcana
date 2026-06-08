'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const { createCcoPatientMasterRouter, parseDryRun } = require('../../src/routes/ccoPatientMaster');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoMigrationIndexStore } = require('../../src/ops/ccoMigrationIndexStore');

const TENANT = 'hair-tp-clinic';
const ACTOR = { userId: 'u-owner-1', role: 'OWNER', displayName: 'Owner' };

function testDriveEnv() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  return {
    ARCANA_GOOGLE_DRIVE_FOLDER_ID: 'folder-test',
    ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'svc@test.iam.gserviceaccount.com',
      private_key: pem,
    }),
  };
}

function installDriveEnv() {
  const env = testDriveEnv();
  const original = {
    ARCANA_GOOGLE_DRIVE_FOLDER_ID: process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID,
    ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON: process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON,
  };
  process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID = env.ARCANA_GOOGLE_DRIVE_FOLDER_ID;
  process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON = env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON;
  return original;
}

function restoreDriveEnv(original) {
  process.env.ARCANA_GOOGLE_DRIVE_FOLDER_ID = original.ARCANA_GOOGLE_DRIVE_FOLDER_ID;
  process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON = original.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON;
}

function mockDriveFetch(name) {
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const urlText = String(url);
    if (!urlText.includes('googleapis.com')) {
      return originalFetch(url, options);
    }
    if (urlText.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        json: async () => ({ access_token: 'drive-token', expires_in: 3600 }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ name }),
    };
  };
  return () => {
    global.fetch = originalFetch;
  };
}

function fakeAuthStore() {
  const events = [];
  return {
    events,
    requireAuth(req, _res, next) {
      req.auth = { tenantId: TENANT, userId: ACTOR.userId, role: ACTOR.role };
      req.currentUser = {
        id: ACTOR.userId,
        email: 'owner@test.se',
        displayName: ACTOR.displayName,
      };
      req.currentMembership = { tenantId: TENANT, role: ACTOR.role };
      next();
    },
    async addAuditEvent(event) {
      events.push(event);
      return event;
    },
  };
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
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

async function jfetch(base, urlPath, body) {
  const res = await fetch(`${base}${urlPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function fixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'repair-filenames-'));
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tmp, 'patient-master.json'),
  });
  const migrationIndexStore = await createCcoMigrationIndexStore({
    filePath: path.join(tmp, 'migration-index.json'),
  });
  const authStore = fakeAuthStore();

  const patient = await patientMasterStore.upsertPatient({
    tenantId: TENANT,
    personnummer: '19900101-1234',
    displayName: 'Abdulaziz Cabdi Kumi',
    matchStatus: 'matched',
  });

  await migrationIndexStore.replaceScanResult({
    scanMeta: { completedAt: new Date().toISOString(), zipCount: 0, badZipCount: 0 },
    files: [
      {
        id: 'file-broken',
        personnummer: '19900101-1234',
        driveFileId: 'drive-abc',
        fileName: 'Journal ??? Abdulaziz Cabdi Kumi ??? 2024-01-10.pdf',
        relativePath: 'Journal ??? Abdulaziz Cabdi Kumi ??? 2024-01-10.pdf',
        fileType: 'journal_pdf',
      },
      {
        id: 'file-no-drive',
        personnummer: '19900101-1234',
        driveFileId: '',
        fileName: 'zip-only.pdf',
        relativePath: 'zip-only.pdf',
        fileType: 'document',
      },
    ],
  });

  const app = express();
  app.use(express.json());
  app.use(
    createCcoPatientMasterRouter({
      patientMasterStore,
      migrationIndexStore,
      authStore,
      config: { defaultTenant: TENANT },
      requireAuth: authStore.requireAuth.bind(authStore),
      requireRole,
    })
  );

  return { app, authStore, patientMasterStore, migrationIndexStore, patient, tmp };
}

test('parseDryRun defaults to true', () => {
  assert.equal(parseDryRun(undefined, true), true);
  assert.equal(parseDryRun(undefined, false), false);
  assert.equal(parseDryRun('false', true), false);
});

test('repair-filenames dryRun default gör inga skrivningar (ORD-33)', async () => {
  const restoreFetch = mockDriveFetch('Journal – Abdulaziz Cabdi Kumi – 2024-01-10.pdf');
  const originalEnv = installDriveEnv();
  const f = await fixture();
  try {
    await withServer(f.app, async (base) => {
      const res = await jfetch(base, '/cco-patient-master/repair-filenames', {
        scope: 'patient',
        patientId: f.patient.id,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.dryRun, true);
      assert.equal(res.body.appliedCount, 0);
      assert.equal(res.body.summary.changed, 1);
      assert.equal(res.body.summary.skippedNoDriveId, 1);
      assert.match(res.body.items[0].new, /–/);
      assert.notEqual(res.body.items[0].old, res.body.items[0].new);

      const stored = await f.migrationIndexStore.getFileById('file-broken');
      assert.match(stored.fileName, /\?\?\?/);
      assert.equal(f.authStore.events.length, 1);
      assert.equal(f.authStore.events[0].metadata.dryRun, true);
    });
  } finally {
    restoreFetch();
    restoreDriveEnv(originalEnv);
    await fs.rm(f.tmp, { recursive: true, force: true });
  }
});

test('repair-filenames apply kräver confirmText och skriver UTF-8-namn (ORD-33)', async () => {
  const restoreFetch = mockDriveFetch('Journal – Abdulaziz Cabdi Kumi – 2024-01-10.pdf');
  const originalEnv = installDriveEnv();
  const f = await fixture();
  try {
    await withServer(f.app, async (base) => {
      const blocked = await jfetch(base, '/cco-patient-master/repair-filenames', {
        scope: 'patient',
        patientId: f.patient.id,
        dryRun: false,
      });
      assert.equal(blocked.status, 400);

      const res = await jfetch(base, '/cco-patient-master/repair-filenames', {
        scope: 'patient',
        patientId: f.patient.id,
        dryRun: false,
        confirmText: 'REPAIR FILENAMES',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dryRun, false);
      assert.equal(res.body.appliedCount, 1);
      assert.equal(res.body.rollback.length, 1);
      assert.match(res.body.rollback[0].newName, /–/);

      const stored = await f.migrationIndexStore.getFileById('file-broken');
      assert.match(stored.fileName, /–/);
      assert.doesNotMatch(stored.fileName, /\?\?\?/);

      const again = await jfetch(base, '/cco-patient-master/repair-filenames', {
        scope: 'patient',
        patientId: f.patient.id,
        dryRun: false,
        confirmText: 'REPAIR FILENAMES',
      });
      assert.equal(again.body.appliedCount, 0);
      assert.equal(again.body.summary.changed, 0);
    });
  } finally {
    restoreFetch();
    restoreDriveEnv(originalEnv);
    await fs.rm(f.tmp, { recursive: true, force: true });
  }
});
