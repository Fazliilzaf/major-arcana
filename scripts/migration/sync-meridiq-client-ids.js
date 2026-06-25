#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const {
  resolveMeridiqCredentials,
  listClients,
  normalizeMeridiqClient,
  normalizeEmail,
  normalizePhone,
} = require('./lib/meridiqApi');

const ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const args = { dryRun: true, commit: false, tenantId: 'hair_tp' };
  for (const raw of argv.slice(2)) {
    if (raw === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--tenant=')) args.tenantId = raw.split('=')[1];
    else if (raw.startsWith('--cookie-file=')) args.cookieFile = raw.split('=')[1];
    else if (raw.startsWith('--meridiq-api-token=')) args.apiToken = raw.split('=')[1];
  }
  return args;
}

function loadCustomerState(tenantId) {
  const fp = path.join(ROOT, 'data', 'cco-customers.json');
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const tenant = raw.tenants?.[tenantId];
  if (!tenant?.customerState?.directory) {
    throw new Error(`Tenant ${tenantId} saknar customerState.directory`);
  }
  return {
    raw,
    tenant,
    directory: tenant.customerState.directory,
    details: tenant.customerState.details || {},
  };
}

function buildClientoIndex(directory, details) {
  const byEmail = new Map();
  const byPhone = new Map();
  for (const [key, dir] of Object.entries(directory)) {
    const det = details[key] || {};
    for (const email of det.emails || []) {
      const ne = normalizeEmail(email);
      if (ne && !byEmail.has(ne)) byEmail.set(ne, key);
    }
    const phone = normalizePhone(det.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, key);
    void dir;
  }
  return { byEmail, byPhone };
}

function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

async function main() {
  const args = parseArgs(process.argv);
  const creds = resolveMeridiqCredentials(args);
  if (!creds.ok) {
    console.error('[sync-meridiq-ids] saknar credentials:', creds.missing.join(', '));
    console.error('Kör: npm run migration:preflight-meridiq');
    process.exit(2);
  }

  console.log('[sync-meridiq-ids] hämtar client-lista från Meridiq API…');
  const clients = (await listClients(creds))
    .map(normalizeMeridiqClient)
    .filter((c) => c.meridiqClientId);
  console.log('[sync-meridiq-ids] clients from API:', clients.length);

  const { raw, directory, details } = loadCustomerState(args.tenantId);
  const index = buildClientoIndex(directory, details);

  const stats = {
    matchedByEmail: 0,
    matchedByPhone: 0,
    alreadyHadId: 0,
    updated: 0,
    unmatchedApiClients: 0,
    eligibleWithoutId: 0,
  };

  const matchedKeys = new Set();

  for (const client of clients) {
    let key = null;
    let via = null;
    if (client.email && index.byEmail.has(client.email)) {
      key = index.byEmail.get(client.email);
      via = 'email';
      stats.matchedByEmail += 1;
    } else if (client.phone && index.byPhone.has(client.phone)) {
      key = index.byPhone.get(client.phone);
      via = 'phone';
      stats.matchedByPhone += 1;
    }
    if (!key) {
      stats.unmatchedApiClients += 1;
      continue;
    }
    matchedKeys.add(key);
    const dir = directory[key];
    dir.meridiqMeta = dir.meridiqMeta || {};
    if (dir.meridiqMeta.meridiqPatientId || dir.meridiqMeta.id) {
      stats.alreadyHadId += 1;
      continue;
    }
    dir.meridiqMeta.meridiqPatientId = client.meridiqClientId;
    dir.meridiqMeta.id = client.meridiqClientId;
    dir.meridiqMeta.apiSyncedAt = new Date().toISOString();
    if (!dir.meridiqMeta.via && via) dir.meridiqMeta.via = via;
    stats.updated += 1;
  }

  for (const [key, dir] of Object.entries(directory)) {
    if (dir.meridiqMeta?.hasJournal && !(dir.meridiqMeta.meridiqPatientId || dir.meridiqMeta.id)) {
      stats.eligibleWithoutId += 1;
    }
  }

  console.log('[sync-meridiq-ids] ─── COUNTS ───');
  console.log('[sync-meridiq-ids] api clients:', clients.length);
  console.log('[sync-meridiq-ids] matchedByEmail:', stats.matchedByEmail);
  console.log('[sync-meridiq-ids] matchedByPhone:', stats.matchedByPhone);
  console.log('[sync-meridiq-ids] updated with meridiqPatientId:', stats.updated);
  console.log('[sync-meridiq-ids] alreadyHadId:', stats.alreadyHadId);
  console.log('[sync-meridiq-ids] unmatchedApiClients:', stats.unmatchedApiClients);
  console.log(
    '[sync-meridiq-ids] eligibleWithoutId (after):',
    stats.eligibleWithoutId - stats.updated
  );

  if (args.dryRun) {
    console.log('[sync-meridiq-ids] --dry-run: ingen write');
    return;
  }

  writeJsonAtomic(path.join(ROOT, 'data', 'cco-customers.json'), raw);
  console.log('[sync-meridiq-ids] wrote data/cco-customers.json');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[sync-meridiq-ids] FATAL:', error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildClientoIndex };
