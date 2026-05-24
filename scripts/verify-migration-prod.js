#!/usr/bin/env node
'use strict';

/**
 * C1–C5 — Verify migration track on prod.
 *
 * Checks:
 *   MC-01 migration status HTTP (OWNER)
 *   MC-02 Drive index hydrated (totalProfiles > 0)
 *   MC-03 patient master count
 *   MC-04 journal historical imports
 *   MC-05 SharePoint manifest ↔ GitHub
 *   MC-06 PDL/EU Frankfurt documentation
 *
 * Usage:
 *   npm run verify:migration-prod
 */

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const REPO_ROOT = path.join(__dirname, '..');

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`Migration verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const token = getStaffToken();
  if (!record('Auth token', Boolean(token))) process.exit(1);

  const status = await getJson(`${BASE}/api/v1/cco-migration/status`, {
    Authorization: `Bearer ${token}`,
  });

  if (status.status === 403) {
    fail('MC-01 migration/status', '403 — kräver OWNER-token (ARCANA_OWNER_TOKEN)');
  } else if (!record('MC-01 migration/status HTTP', status.status === 200, `HTTP ${status.status}`)) {
    hardFail = true;
  } else {
    const indexProfiles = Number(status.body?.indexStats?.totalProfiles || 0);
    const indexFiles = Number(status.body?.indexStats?.totalFiles || 0);
    const patientTotal = Number(status.body?.patientStats?.total || 0);
    const historicalEntries = Number(status.body?.journalImportStats?.historicalImportEntries || 0);
    const patientsWithHistorical = Number(status.body?.journalImportStats?.patientsWithHistorical || 0);

    if (status.body.driveApiConfigured === true) {
      record('C1 Drive API configured', true);
    } else {
      record('C1 Drive API configured', false, 'sätt ARCANA_GOOGLE_* på Render');
    }

    if (indexProfiles >= 20) {
      record('C1/MC-02 migration index profiles', true, `${indexProfiles} profiler, ${indexFiles} filer`);
    } else if (indexProfiles > 0) {
      record('C1/MC-02 migration index profiles', true, `${indexProfiles} (pilot — mål ≥20)`);
    } else {
      fail('C1/MC-02 migration index profiles', 'index tom — kör migration:scan-drive-api på prod/data');
    }

    if (patientTotal >= 100) {
      record('MC-03 patient master', true, `${patientTotal} kunder`);
    } else if (patientTotal > 0) {
      record('MC-03 patient master', true, `${patientTotal} (pilot)`);
    } else {
      fail('MC-03 patient master', '0 kunder');
    }

    if (historicalEntries > 0) {
      record(
        'C2/MC-04 journal historical imports',
        true,
        `${historicalEntries} poster, ${patientsWithHistorical} patienter`
      );
    } else {
      record(
        'C2/MC-04 journal historical imports',
        false,
        '0 historiska poster — kör migration:import-journals eller OWNER API'
      );
    }
  }

  const manifestPath = path.join(REPO_ROOT, 'docs', 'migration', 'sharepoint-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail('C4 sharepoint manifest in repo', manifestPath);
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    const missing = files.filter((file) => !fs.existsSync(path.join(REPO_ROOT, file.githubPath || '')));
    if (missing.length === 0) {
      record('C4 sharepoint manifest github paths', true, `${files.length} filer`);
    } else {
      fail('C4 sharepoint manifest github paths', `${missing.length} saknas i repo`);
    }
  }

  const pdlPath = path.join(REPO_ROOT, 'docs', 'legal', 'pdl-mdr-assessment.md');
  const pdlText = fs.readFileSync(pdlPath, 'utf8');
  const hasFrankfurt =
    /Frankfurt/i.test(pdlText) && /EU\/EES|EU-region|data residency/i.test(pdlText);
  if (!record('C5 PDL + EU Frankfurt doc', hasFrankfurt)) {
    hardFail = true;
  }

  console.log(hardFail ? '\nMigration verify: FAIL' : '\nMigration verify: PASS');
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
