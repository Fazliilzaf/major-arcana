#!/usr/bin/env node
'use strict';

/**
 * Skapa prod-patienter för GetAccept-avtal som saknar patient-master-match,
 * patcha asset patientId, och valfritt synka asset store till Render.
 *
 *   node scripts/import-getaccept-missing-patients-prod.js --dry-run
 *   node scripts/import-getaccept-missing-patients-prod.js --write
 *   node scripts/import-getaccept-missing-patients-prod.js --write --sync-prod
 */

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const { getProdToken } = require('./lib/halsoHdProdClient');

const ROOT = path.join(__dirname, '..');
const CUSTOMERS_PATH = path.join(ROOT, 'data/cco-customers.json');
const ASSETS_PATH = path.join(ROOT, 'data/cco-patient-assets.json');
const LINK_STATUS_PATH = path.join(ROOT, 'data/reports/getaccept-patient-link-status.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/getaccept-missing-patient-import.json');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

function splitName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function findCustomerByClientoId(customers, clientoId) {
  let found = null;
  (function walk(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12 || found) return;
    const key = node.customerKey || node.canonicalCustomerId;
    if (key === clientoId) {
      found = node;
      return;
    }
    if (Array.isArray(node)) node.forEach((item) => walk(item, depth + 1));
    else for (const value of Object.values(node)) walk(value, depth + 1);
  })(customers);
  return found;
}

function buildPatientPayload(customer, clientoId) {
  const name = String(customer?.customerName || '').trim();
  const email = String(customer?.customerEmail || customer?.verifiedPersonalEmailNormalized || '')
    .trim()
    .toLowerCase();
  const phone = String(customer?.customerPhone || '').trim();
  const { firstName, lastName } = splitName(name);
  const now = new Date().toISOString();
  return {
    tenantId: TENANT_ID,
    displayName: name,
    firstName,
    lastName,
    primaryEmail: email,
    primaryPhone: phone,
    emails: email ? [email] : [],
    phones: phone ? [phone] : [],
    matchStatus: 'cliento_only',
    cliento: {
      source: 'cliento',
      clientoId,
      accountId: 'getaccept_missing_import',
      name,
      firstName,
      lastName,
      emails: email ? [email] : [],
      phones: phone ? [phone] : [],
      primaryEmail: email,
      primaryPhone: phone,
      importSource: 'getaccept_missing_patient',
      syncedAt: now,
    },
  };
}

async function requestJson(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const error = new Error(
      `${method} ${route} -> ${res.status}: ${parsed.error || text.slice(0, 160)}`
    );
    error.status = res.status;
    throw error;
  }
  return parsed;
}

async function syncAssetsToProd() {
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const sshHost =
    process.env.RENDER_SSH_HOST ||
    `${process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng'}@ssh.frankfurt.render.com`;
  const remoteAssets = `${process.env.RENDER_REMOTE_DATA || '/var/data'}/cco-patient-assets.json`;
  const gzPath = path.join('/tmp', 'cco-patient-assets.json.gz');
  execFileSync('sh', ['-c', `gzip -c "${ASSETS_PATH}" > "${gzPath}"`]);
  execFileSync(
    'scp',
    ['-i', sshKey, '-o', 'BatchMode=yes', gzPath, `${sshHost}:/tmp/cco-patient-assets.json.gz`],
    {
      stdio: 'inherit',
    }
  );
  execFileSync(
    'ssh',
    [
      '-i',
      sshKey,
      '-o',
      'BatchMode=yes',
      sshHost,
      `gunzip -c /tmp/cco-patient-assets.json.gz > ${remoteAssets}.new && mv ${remoteAssets}.new ${remoteAssets} && wc -c ${remoteAssets} && rm /tmp/cco-patient-assets.json.gz`,
    ],
    { stdio: 'inherit' }
  );
}

async function main() {
  const write = process.argv.includes('--write');
  const syncProd = process.argv.includes('--sync-prod');
  const dryRun = !write;

  const linkStatus = JSON.parse(await fs.readFile(LINK_STATUS_PATH, 'utf8'));
  const customers = JSON.parse(await fs.readFile(CUSTOMERS_PATH, 'utf8'));
  const assetsState = JSON.parse(await fs.readFile(ASSETS_PATH, 'utf8'));

  const rows = linkStatus.stillMissingProdPatient || [];
  const uniqueByCliento = new Map();
  for (const row of rows) {
    if (!uniqueByCliento.has(row.clientoId)) uniqueByCliento.set(row.clientoId, row);
  }

  const token = dryRun ? null : getProdToken();
  const created = [];
  const assetPatches = [];

  for (const [clientoId, row] of uniqueByCliento.entries()) {
    const customer = findCustomerByClientoId(customers, clientoId);
    if (!customer) throw new Error(`Saknar Cliento-post för ${clientoId}`);
    const payload = buildPatientPayload(customer, clientoId);
    let prodId = null;
    if (!dryRun) {
      const result = await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, payload);
      prodId = result?.patient?.id || result?.id;
      if (!prodId) throw new Error(`Ingen prod UUID efter PUT för ${clientoId}`);
    } else {
      prodId = `(dry-run uuid for ${clientoId})`;
    }
    created.push({
      clientoId,
      name: payload.displayName,
      email: payload.primaryEmail,
      prodId,
    });
    for (const assetRow of rows.filter((item) => item.clientoId === clientoId)) {
      assetPatches.push({ assetId: assetRow.assetId, prodId, email: assetRow.email });
    }
  }

  let patched = 0;
  if (write) {
    const now = new Date().toISOString();
    for (const patch of assetPatches) {
      const asset = assetsState.items[patch.assetId];
      if (!asset) throw new Error(`Saknar asset ${patch.assetId}`);
      assetsState.items[patch.assetId] = {
        ...asset,
        patientId: patch.prodId,
        updatedAt: now,
        patchNote: 'getaccept-missing-patient-import-2026-06-14',
      };
      patched += 1;
    }
    const backupDir = path.join(
      ROOT,
      'data/backups',
      `pre-getaccept-missing-import-${now.slice(0, 19).replace(/[:T]/g, '-')}`
    );
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(ASSETS_PATH, path.join(backupDir, 'cco-patient-assets.json'));
    await fs.writeFile(ASSETS_PATH, `${JSON.stringify(assetsState, null, 2)}\n`, 'utf8');
  }

  if (write && syncProd) {
    await syncAssetsToProd();
  }

  const report = {
    ok: true,
    dryRun,
    syncProd: write && syncProd,
    createdPatients: created.length,
    patchedAssets: patched,
    created,
    assetPatches,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
