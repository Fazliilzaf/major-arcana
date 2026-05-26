#!/usr/bin/env node
'use strict';

/**
 * Rebuild secondary indexes for CCO JSON stores (Fas 6).
 */
require('dotenv').config({ quiet: true });

const path = require('node:path');
const fs = require('node:fs/promises');
const { config } = require('../src/config');
const {
  rebuildPatientMasterIndexes,
  rebuildJournalIndexes,
  rebuildBookingCasesByDate,
} = require('../src/ops/ccoStoreIndexes');

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.rebuild.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

async function rebuildStore(filePath, rebuildFn, label) {
  const state = await readJson(filePath);
  rebuildFn(state);
  if (label === 'patient-master') {
    Object.values(state.tenants || {}).forEach((bucket) => rebuildPatientMasterIndexes(bucket));
  }
  await writeJsonAtomic(filePath, state);
  console.log(`rebuilt ${label}: ${filePath}`);
}

async function main() {
  const stores = [
    {
      filePath: config.ccoPatientMasterStorePath,
      rebuild: (state) => {
        Object.values(state.tenants || {}).forEach((bucket) => rebuildPatientMasterIndexes(bucket));
      },
      label: 'patient-master',
    },
    {
      filePath: config.ccoJournalStorePath,
      rebuild: rebuildJournalIndexes,
      label: 'journal',
    },
    {
      filePath: config.ccoBookingStorePath,
      rebuild: rebuildBookingCasesByDate,
      label: 'bookings',
    },
  ];

  for (const store of stores) {
    const resolved = path.resolve(store.filePath);
    try {
      await fs.access(resolved);
    } catch {
      console.warn(`skip missing store: ${resolved}`);
      continue;
    }
    const state = await readJson(resolved);
    store.rebuild(state);
    await writeJsonAtomic(resolved, state);
    console.log(`rebuilt ${store.label}: ${resolved}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
