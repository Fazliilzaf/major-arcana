#!/usr/bin/env node
/**
 * Verify BOOKOFF V-kolumn — extended live checks for all 36 registryIds.
 * Local: ARCANA_PROD_URL=http://127.0.0.1:3100 npm run verify:patient-doc-v-column
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const {
  listLiveRegistryIds,
  buildLiveDocumentPath,
  isStaffLiveRegistry,
  OFFERT_SLUG,
} = require('../src/ops/patientDocumentLiveRegistry');
const { isE8SignRegistry } = require('../src/ops/patientDocumentSignRegistry');
const { assertNoMeridiqInPatientText } = require('./ops/patient-document-build-lib');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'src/ops/hairtp-document-types.catalog.json');
const BANNED_COLORS = ['#bd7a18', '#d89636', '#a86812', '#b87318'];

const BASE = (process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const client = BASE.startsWith('https') ? https : http;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    client
      .get(`${BASE}${urlPath}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          })
        );
      })
      .on('error', reject);
  });
}

function loadCatalogById() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const map = new Map();
  for (const row of catalog.types || []) {
    if (row.id) map.set(row.id, row);
  }
  return map;
}

function assertNoBannedColors(html, label) {
  const lower = html.toLowerCase();
  for (const color of BANNED_COLORS) {
    if (lower.includes(color)) return `förbjuden färg ${color}`;
  }
  return null;
}

function assertNoMeridiqVisible(html) {
  try {
    assertNoMeridiqInPatientText(html);
    return null;
  } catch (error) {
    return error.message || 'Meridiq i synlig text';
  }
}

function assertRegistryId(res, registryId) {
  const headerRegistry = String(res.headers['x-arcana-patient-doc-registry'] || '').trim();
  if (headerRegistry === registryId) return null;
  if (res.body.includes(`data-registry-id="${registryId}"`)) return null;
  return 'saknar header eller data-registry-id';
}

function expectedStepPattern(catalogRow, phase) {
  const display = Number(catalogRow?.journeyStepDisplay || 0);
  if (!display || display < 2) return null;
  const lang = String(catalogRow?.language || 'sv').toLowerCase();
  const sep = lang === 'en' ? ' of ' : ' av ';
  if (OFFERT_SLUG[catalogRow.id] && phase === 5) return `${display}${sep}9`;
  if (OFFERT_SLUG[catalogRow.id] && phase === 7) return `7${sep}9`;
  if (display >= 2 && display <= 9) return `${display}${sep}9`;
  return null;
}

async function main() {
  const checks = [];
  const pass = (name, detail = '') => checks.push({ name, ok: true, detail });
  const fail = (name, detail = '') => checks.push({ name, ok: false, detail });

  const catalogById = loadCatalogById();
  const ids = listLiveRegistryIds();
  if (ids.length === 36) pass('catalog registry count', '36');
  else fail('catalog registry count', String(ids.length));

  for (const registryId of ids) {
    const catalogRow = catalogById.get(registryId) || {};
    const phases = OFFERT_SLUG[registryId] ? [5, 7] : [null];
    for (const phase of phases) {
      const label = phase ? `${registryId}?phase=${phase}` : registryId;
      const urlPath = buildLiveDocumentPath(registryId, { phase: phase || 7 });
      try {
        const res = await get(urlPath);
        if (res.status !== 200) {
          fail(`${label} · HTTP`, String(res.status));
          continue;
        }
        pass(`${label} · HTTP`, '200');

        const registryErr = assertRegistryId(res, registryId);
        if (!registryErr) pass(`${label} · registry-id`);
        else fail(`${label} · registry-id`, registryErr);

        if (
          res.body.includes('page-wrapper') &&
          (res.body.includes('page-header') || res.body.includes('header-title'))
        ) {
          pass(`${label} · shell-layout`);
        } else {
          fail(`${label} · shell-layout`);
        }

        if (/<meta[^>]+viewport/i.test(res.body)) pass(`${label} · viewport`);
        else fail(`${label} · viewport`);

        const colorErr = assertNoBannedColors(res.body, label);
        if (!colorErr) pass(`${label} · färger`);
        else fail(`${label} · färger`, colorErr);

        const mqErr = assertNoMeridiqVisible(res.body);
        if (!mqErr) pass(`${label} · no-meridiq-text`);
        else fail(`${label} · no-meridiq-text`, mqErr);

        const stepPat = expectedStepPattern(catalogRow, phase);
        if (!stepPat || res.body.includes(stepPat)) pass(`${label} · steg-badge`, stepPat || 'n/a');
        else fail(`${label} · steg-badge`, `saknar "${stepPat}"`);

        if (isStaffLiveRegistry(registryId)) {
          if (String(res.headers['x-arcana-patient-doc-audience'] || '') === 'staff') {
            pass(`${label} · staff-audience`);
          } else {
            fail(`${label} · staff-audience`);
          }
        }

        if (isE8SignRegistry(registryId) && (!phase || phase === 7)) {
          if (res.body.includes('__ARCANA_PATIENT_DOC_SIGN__')) pass(`${label} · sign-boot`);
          else fail(`${label} · sign-boot`);
        }
      } catch (error) {
        fail(`${label} · fetch`, error.message);
      }
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== verify:patient-doc-v-column (${BASE}) ===\n`);
  for (const check of checks) {
    console.log(
      `${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`
    );
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} kontroller passerade.\n`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
