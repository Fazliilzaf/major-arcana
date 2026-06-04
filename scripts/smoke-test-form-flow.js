#!/usr/bin/env node
'use strict';

/**
 * smoke-test-form-flow.js — verifierar Hälsodeklaration + Friskförsäkran
 * end-to-end via /api/v1/cco-forms.
 *
 * Steg:
 *   1. POST /api/v1/cco-forms/submit (health_declaration, autoSign=true)
 *      -> journal-entry skapas + signeras + PDF + asset (via #222-hook)
 *   2. POST /api/v1/cco-forms/submit (fitness_certificate, autoSign=true)
 *   3. GET /api/v1/cco-forms/patient/:id/missing?treatment=fue
 *      -> verifiera readyForTreatment + counts
 *   4. GET /api/v1/cco-customers/:id/journal-timeline
 *      -> verifiera form_submitted + form_signed events finns
 *
 * Anon test-data only.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const REPO = '/Users/fazlikrasniqi/Code/major-arcana';
const PORT = 3098;
const TENANT = 'hair_tp';
const PATIENT = 'anon-form-patient-' + Date.now();
const ENCOUNTER = 'anon-encounter-' + Date.now();
const SANDBOX = path.join(os.tmpdir(), 'cco-forms-' + Date.now());
fs.mkdirSync(SANDBOX, { recursive: true });

function curl(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: PORT, path: urlPath, method,
      headers: { 'x-cco-role': 'owner', 'x-cco-tenant': TENANT, 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer() {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      const r = await curl('GET', '/api/v1/health');
      if (r.status < 500) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('Server timeout');
}

async function main() {
  console.log('=== Smoke-test: Hälsodeklaration + Friskförsäkran ===');
  console.log('Sandbox:', SANDBOX);
  console.log('Patient:', PATIENT);

  process.env.CCO_STATE_ROOT = SANDBOX;
  process.env.PORT = String(PORT);
  const server = spawn('node', ['server.js'], {
    cwd: REPO, env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write('[srv.err] ' + d));

  await waitForServer();
  console.log('Server upp.');
  console.log('');

  // Step 1: Submit Hälsodeklaration
  console.log('Step 1: POST /cco-forms/submit (health_declaration, autoSign)');
  const hd = await curl('POST', '/api/v1/cco-forms/submit', {
    tenantId: TENANT, patientId: PATIENT, encounterId: ENCOUNTER,
    formType: 'health_declaration',
    formVariant: 'hair_tp',
    fields: {
      mediciner: 'Inga',
      allergi: 'Nej',
      tidigare_kirurgi: 'Nej',
      blodförtunnande: 'Nej',
    },
    signedByName: 'Anon Patient',
    autoSign: true,
  });
  console.log('  status:', hd.status, '· autoSigned:', hd.data?.autoSigned);
  const hdEntryId = hd.data?.entry?.entryId;
  console.log('  entryId:', hdEntryId);

  // Step 2: Submit Friskförsäkran
  console.log('');
  console.log('Step 2: POST /cco-forms/submit (fitness_certificate, autoSign)');
  const ff = await curl('POST', '/api/v1/cco-forms/submit', {
    tenantId: TENANT, patientId: PATIENT, encounterId: ENCOUNTER,
    formType: 'fitness_certificate',
    formVariant: 'hair_tp',
    fields: { frisk: 'Ja', symptom_senaste_48h: 'Nej', covid_test: 'Negativ' },
    signedByName: 'Anon Patient',
    autoSign: true,
  });
  console.log('  status:', ff.status, '· autoSigned:', ff.data?.autoSigned);
  const ffEntryId = ff.data?.entry?.entryId;

  // Vänta så hookar hinner persistera assets
  await new Promise(r => setTimeout(r, 1500));

  // Step 3: Missing-endpoint
  console.log('');
  console.log('Step 3: GET /cco-forms/patient/:id/missing?treatment=fue');
  const miss = await curl('GET',
    '/api/v1/cco-forms/patient/' + encodeURIComponent(PATIENT) +
    '/missing?treatment=fue&tenantId=' + TENANT + '&encounterId=' + ENCOUNTER);
  console.log('  status:', miss.status);
  console.log('  readyForTreatment:', miss.data?.readyForTreatment);
  console.log('  counts:', JSON.stringify(miss.data?.counts));
  console.log('  fulfilled:', miss.data?.fulfilled?.map(f => f.docKey).join(', '));
  console.log('  missing:', miss.data?.missing?.map(f => f.docKey).join(', '));

  // Step 4: Timeline
  console.log('');
  console.log('Step 4: GET /journal-timeline');
  const tl = await curl('GET',
    '/api/v1/cco-customers/' + encodeURIComponent(PATIENT) + '/journal-timeline?tenantId=' + TENANT);
  const types = new Set((tl.data?.events || []).map(e => e.type));
  console.log('  status:', tl.status, '· events:', tl.data?.counters?.totalEvents);
  console.log('  event-types:', [...types].join(', '));

  // Step 5: Journal-feed
  const feed = await curl('GET',
    '/api/v1/cco-customers/' + encodeURIComponent(PATIENT) + '/journal-feed?tenantId=' + TENANT);
  const sectionCounts = feed.data?.sectionCounts || {};
  console.log('');
  console.log('Step 5: GET /journal-feed');
  console.log('  sectionCounts:', JSON.stringify(sectionCounts));

  const checks = {
    'POST submit health_declaration returnerade 200': hd.status === 200,
    'health_declaration auto-signerades': hd.data?.autoSigned === true,
    'POST submit fitness_certificate returnerade 200': ff.status === 200,
    'fitness_certificate auto-signerades': ff.data?.autoSigned === true,
    'missing-endpoint returnerade 200': miss.status === 200,
    'readyForTreatment === true (båda obligatoriska finns)': miss.data?.readyForTreatment === true,
    'fulfilled inkluderar healthDeclaration': (miss.data?.fulfilled || []).some(f => f.docKey === 'healthDeclaration'),
    'fulfilled inkluderar fitnessCertificate': (miss.data?.fulfilled || []).some(f => f.docKey === 'fitnessCertificate'),
    'timeline har form_submitted event': types.has('form_submitted'),
    'timeline har form_signed event': types.has('form_signed'),
    'timeline har pdf_archived event': types.has('pdf_archived'),
    'timeline har form_imported event (asset category=form)': types.has('form_imported'),
    'timeline ownerMandate=no_drive_links_in_ui': tl.data?.ownerMandate === 'no_drive_links_in_ui',
    'feed.journals visar 2 CCO-journal-entries': sectionCounts.journals === 2,
    'feed.forms visar 2 form-asset-PDFs': sectionCounts.forms === 2,
    'feed.ownerMandate=no_drive_links_in_ui': feed.data?.ownerMandate === 'no_drive_links_in_ui',
    'inga Drive-länkar i timeline': !JSON.stringify(tl.data?.events || []).includes('drive.google.com'),
    'inga Drive-länkar i feed': !JSON.stringify(feed.data?.items || []).includes('drive.google.com'),
  };

  console.log('');
  console.log('=== Verifiering ===');
  let pass = 0, fail = 0;
  for (const [k, v] of Object.entries(checks)) {
    console.log((v ? '  ✅' : '  ❌') + ' ' + k);
    if (v) pass += 1; else fail += 1;
  }
  console.log('');
  console.log(pass + '/' + (pass + fail) + ' kontroller passerade.');

  server.kill();
  await new Promise(r => setTimeout(r, 500));
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}

  console.log(fail === 0 ? '\n🎉 ALL CHECKS PASS' : '\n❌ ' + fail + ' check(s) failed');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FEL:', err); process.exit(2); });
