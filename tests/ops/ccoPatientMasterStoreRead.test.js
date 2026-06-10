'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

test('createCcoPatientMasterStore tolerates truncated JSON by quarantining file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pm-read-'));
  const filePath = path.join(dir, 'cco-patient-master.json');
  await fs.writeFile(filePath, '{"version":1,"tenants":', 'utf8');

  const store = await createCcoPatientMasterStore({ filePath });
  assert.ok(store);
  assert.equal(typeof store.listPatients, 'function');

  const files = await fs.readdir(dir);
  assert.equal(files.includes('cco-patient-master.json'), false);
  assert.ok(files.some((name) => name.startsWith('cco-patient-master.json.corrupt.')));

  await fs.rm(dir, { recursive: true, force: true });
});

test('createCcoPatientMasterStore tolerates empty JSON file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pm-empty-'));
  const filePath = path.join(dir, 'cco-patient-master.json');
  await fs.writeFile(filePath, '   ', 'utf8');

  const store = await createCcoPatientMasterStore({ filePath });
  assert.ok(store);
  assert.equal(typeof store.listPatients, 'function');

  await fs.rm(dir, { recursive: true, force: true });
});
