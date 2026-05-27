#!/usr/bin/env node
'use strict';

/**
 * Migrate JSON file stores → SQLite.
 *
 * Usage:
 *   node scripts/migrate-json-to-sqlite.js
 *   node scripts/migrate-json-to-sqlite.js --verify
 *   node scripts/migrate-json-to-sqlite.js --dry-run
 *
 * Creates: data/arcana.sqlite (or ARCANA_SQLITE_PATH)
 * Keeps: JSON files as backup (not deleted)
 */

const path = require('node:path');
const fs = require('node:fs');
const { createSqliteDatabase, migrateJsonToSqlite, createCollectionStore } = require('../src/infra/sqliteStore');

const STATE_ROOT = process.env.ARCANA_STATE_ROOT || './data';
const DB_PATH = process.env.ARCANA_SQLITE_PATH || path.join(STATE_ROOT, 'arcana.sqlite');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

const COLLECTIONS = [
  { json: 'cco-patient-master.json', collection: 'patients', idField: 'patientId', indexes: ['personnummer', 'email', 'phone', 'name'] },
  { json: 'cco-journal.json', collection: 'journal_entries', idField: 'entryId', indexes: ['patientId', 'journalType', 'status'] },
  { json: 'cco-treatment-encounters.json', collection: 'encounters', idField: 'encounterId', indexes: ['patientId', 'serviceId', 'status'] },
  { json: 'cco-treatment-agreements.json', collection: 'agreements', idField: 'agreementId', indexes: ['patientId', 'status'] },
  { json: 'cco-commercial.json', collection: 'commercial', idField: 'caseId', indexes: ['patientId', 'quoteStatus'] },
  { json: 'cco-booking-engine.json', collection: 'bookings', idField: 'bookingId', indexes: ['serviceId', 'status', 'customerEmail'] },
  { json: 'cco-pos.json', collection: 'pos_orders', idField: 'orderId', indexes: ['patientId', 'status'] },
  { json: 'cco-qms.json', collection: 'qms', idField: 'id', indexes: [] },
  { json: 'cm-expense.json', collection: 'cm_expenses', idField: 'id', indexes: ['expenseType', 'approvalStatus', 'supplierName'] },
  { json: 'templates.json', collection: 'templates', idField: 'id', indexes: ['category', 'status'] },
  { json: 'auth.json', collection: 'auth', idField: 'id', indexes: [] },
  { json: 'audit.json', collection: 'audit_events', idField: 'id', indexes: ['action', 'actorUserId'] },
  { json: 'tenant-config.json', collection: 'tenant_config', idField: 'id', indexes: [] },
];

console.log(`SQLite Migration Tool`);
console.log(`DB path: ${DB_PATH}`);
console.log(`State root: ${STATE_ROOT}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : VERIFY ? 'VERIFY' : 'MIGRATE'}`);
console.log('─'.repeat(60));

if (DRY_RUN) {
  console.log('\nDry run — checking which files exist:\n');
  for (const col of COLLECTIONS) {
    const jsonPath = path.join(STATE_ROOT, col.json);
    const exists = fs.existsSync(jsonPath);
    const size = exists ? (fs.statSync(jsonPath).size / 1024).toFixed(1) + ' KB' : '—';
    console.log(`  ${exists ? '✅' : '⬜'} ${col.json.padEnd(35)} ${size.padStart(10)} → ${col.collection}`);
  }
  console.log('\nRun without --dry-run to migrate.');
  process.exit(0);
}

const db = createSqliteDatabase({ dbPath: DB_PATH });

if (VERIFY) {
  console.log('\nVerifying existing SQLite database:\n');
  for (const col of COLLECTIONS) {
    const store = createCollectionStore({ db, collectionName: col.collection, indexes: col.indexes });
    const count = store.count();
    const jsonPath = path.join(STATE_ROOT, col.json);
    let jsonCount = 0;
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (Array.isArray(raw)) jsonCount = raw.length;
        else jsonCount = Object.keys(raw).reduce((sum, k) => sum + (Array.isArray(raw[k]) ? raw[k].length : 1), 0);
      } catch { jsonCount = '?'; }
    }
    const match = count >= jsonCount ? '✅' : '⚠️';
    console.log(`  ${match} ${col.collection.padEnd(20)} SQLite: ${String(count).padStart(6)} | JSON: ${String(jsonCount).padStart(6)}`);
  }
  db.close();
  process.exit(0);
}

// MIGRATE
console.log('\nMigrating JSON → SQLite:\n');
const results = [];

for (const col of COLLECTIONS) {
  const jsonPath = path.join(STATE_ROOT, col.json);
  const result = migrateJsonToSqlite({
    jsonFilePath: jsonPath,
    db,
    collectionName: col.collection,
    idField: col.idField,
    indexes: col.indexes,
  });
  results.push({ ...result, collection: col.collection, json: col.json });
  const icon = result.ok ? '✅' : '❌';
  console.log(`  ${icon} ${col.collection.padEnd(20)} ${String(result.migrated || 0).padStart(6)} records ${result.error ? '— ' + result.error : ''}`);
}

db.close();

const totalMigrated = results.reduce((sum, r) => sum + (r.migrated || 0), 0);
const totalFailed = results.filter((r) => !r.ok).length;
console.log('\n' + '─'.repeat(60));
console.log(`Total: ${totalMigrated} records migrated across ${results.length} collections.`);
if (totalFailed > 0) console.log(`⚠️  ${totalFailed} collections had errors.`);
else console.log('✅ All migrations successful.');
console.log(`\nJSON files NOT deleted — kept as backup.`);
console.log(`SQLite database: ${DB_PATH}`);
