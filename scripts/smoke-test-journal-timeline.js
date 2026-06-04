#!/usr/bin/env node
'use strict';

/**
 * smoke-test-journal-timeline.js — verifierar /journal-timeline-endpoint
 *
 * Steg:
 *   1. Skapa journal (draft)
 *   2. Signera (auto-PDF + asset via hook)
 *   3. Skapa rättelse (med reason)
 *   4. Signera rättelse (auto-PDF + asset)
 *   5. Curl /journal-timeline
 *   6. Verifiera event-typer + thread-relations + counters
 *
 * Använder anon-patient + sandbox-state.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const REPO = '/Users/fazlikrasniqi/Code/major-arcana';
const PORT = 3097;
const TENANT = 'hairtpclinic';
const PATIENT = 'anon-patient-timeline-' + Date.now();

// Sandbox via env-overrides
const SANDBOX = path.join(os.tmpdir(), 'cco-tl-' + Date.now());
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

async function main() {
  console.log('=== Smoke-test: /journal-timeline ===');
  console.log('Sandbox:', SANDBOX);
  console.log('Patient:', PATIENT);
  console.log('');

  // Sätt sandbox-state-root via env
  process.env.CCO_STATE_ROOT = SANDBOX;
  process.env.PORT = String(PORT);

  // Starta server inline
  console.log('Starting server...');
  const { spawn } = require('child_process');
  const server = spawn('node', ['server.js'], {
    cwd: REPO, env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  server.stdout.on('data', (d) => {
    if (!ready && d.toString().includes('listening')) ready = true;
  });
  server.stderr.on('data', (d) => process.stderr.write('[server.err] ' + d));

  // Vänta tills servern är redo
  await new Promise((resolve) => {
    const t0 = Date.now();
    const tick = setInterval(async () => {
      if (Date.now() - t0 > 15000) { clearInterval(tick); resolve(); return; }
      try {
        const res = await curl('GET', '/api/v1/health');
        if (res.status < 500) { clearInterval(tick); resolve(); }
      } catch {}
    }, 300);
  });

  console.log('Server upp. Skapar journal-data...');
  console.log('');

  // Step 1: skapa journal-entry via API
  let entryId, correctionEntryId;
  try {
    const create = await curl('PUT', '/api/v1/cco-journal-quick/entry', {
      tenantId: TENANT,
      patientId: PATIENT,
      journalType: 'consultation_plan',
      title: 'Timeline-test',
      fields: { note: 'Original' },
    });
    if (create.status !== 200) throw new Error('upsert failed: ' + JSON.stringify(create.data));
    entryId = create.data.entry?.entryId || create.data.entryId;
    console.log('  ✅ Draft skapad: ' + entryId);

    const sign = await curl('POST', '/api/v1/cco-journal-quick/entry/sign', {
      tenantId: TENANT, patientId: PATIENT, entryId,
    });
    if (sign.status !== 200) throw new Error('sign failed: ' + JSON.stringify(sign.data));
    console.log('  ✅ Original signerad');

    const corr = await curl('POST', '/api/v1/cco-journal-quick/entry/correction', {
      tenantId: TENANT, patientId: PATIENT, entryId,
      reason: 'Felaktig dosering — rättas till korrekt värde enligt protokoll.',
      fields: { note: 'Rättad text' },
    });
    if (corr.status !== 200) throw new Error('correction failed: ' + JSON.stringify(corr.data));
    correctionEntryId = corr.data.correction?.entryId;
    console.log('  ✅ Rättelse skapad: ' + correctionEntryId);

    const signCorr = await curl('POST', '/api/v1/cco-journal-quick/entry/sign', {
      tenantId: TENANT, patientId: PATIENT, entryId: correctionEntryId,
    });
    if (signCorr.status !== 200) throw new Error('correction sign failed: ' + JSON.stringify(signCorr.data));
    console.log('  ✅ Rättelse signerad');
  } catch (err) {
    console.error('FEL i setup:', err.message);
    server.kill();
    process.exit(2);
  }

  // Vänta 1s så hookar hinner persistera
  await new Promise(r => setTimeout(r, 1000));

  // Step 2: hämta journal-timeline
  console.log('');
  console.log('Step 2: GET /journal-timeline');
  const tl = await curl('GET', '/api/v1/cco-customers/' + encodeURIComponent(PATIENT) + '/journal-timeline?tenantId=' + TENANT);
  if (tl.status !== 200) {
    console.error('FEL: timeline returnerade ' + tl.status + ' ' + JSON.stringify(tl.data));
    server.kill();
    process.exit(2);
  }
  const data = tl.data;
  const types = new Set((data.events || []).map(e => e.type));
  const counters = data.counters || {};
  const threads = data.threads || {};

  console.log('  totalEvents:', counters.totalEvents);
  console.log('  byType:', Object.keys(counters.byType || {}).join(', '));
  console.log('  byTone:', JSON.stringify(counters.byTone));
  console.log('  threads:', Object.keys(threads).length);

  // Verifiera
  const expectedTypes = [
    'journal_draft_created', 'journal_signed', 'pdf_archived',
    'correction_created', 'correction_signed',
    'journal_pdf_asset_imported',
  ];
  const checks = {
    'endpoint returnerade 200': tl.status === 200,
    'ownerMandate=no_drive_links_in_ui': data.ownerMandate === 'no_drive_links_in_ui',
    'counters.journalEntries === 2': counters.journalEntries === 2,
    'counters.signedEntries === 2': counters.signedEntries === 2,
    'counters.corrections === 1': counters.corrections === 1,
    'counters.threads === 1': counters.threads === 1,
    'event-type journal_draft_created finns': types.has('journal_draft_created'),
    'event-type journal_signed finns': types.has('journal_signed'),
    'event-type pdf_archived finns': types.has('pdf_archived'),
    'event-type correction_created finns': types.has('correction_created'),
    'event-type correction_signed finns': types.has('correction_signed'),
    'event-type journal_pdf_asset_imported finns': types.has('journal_pdf_asset_imported'),
    'event-type asset_status_transition finns': types.has('asset_status_transition'),
    'thread innehåller original-entry': !!threads[entryId],
    'thread.corrections har 1 entry': (threads[entryId]?.corrections || []).length === 1,
    'thread.corrections[0].correctionReason satt': !!(threads[entryId]?.corrections?.[0]?.correctionReason),
    'events sorterade DESC kronologiskt': (function() {
      const tss = (data.events || []).map(e => e.ts);
      for (let i = 1; i < tss.length; i++) {
        if (tss[i-1] < tss[i]) return false;
      }
      return true;
    })(),
    'inga Drive-länkar i events': (data.events || []).every(e => !JSON.stringify(e).includes('drive.google.com')),
    'ccoSourceOnly: true på asset-imports': (data.events || []).filter(e => e.type === 'journal_pdf_asset_imported').every(e => e.detail?.ccoSourceOnly === true),
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
