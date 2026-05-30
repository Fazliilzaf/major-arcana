#!/usr/bin/env node
'use strict';

/**
 * verify-aisia-cco-integration.js — CCO Integration Verification Sprint för Aisia FAS 1.
 * Kör isolerad API-integration + statisk UI-kontroll. Skriver JSON-sammanfattning till stdout.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

const REPO = path.join(__dirname, '..');

const { createCcoScalpAnalysisRouter } = require('../src/routes/ccoScalpAnalysis');
const { createCcoScalpAnalysisStore } = require('../src/ops/ccoScalpAnalysisStore');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { attachRole } = require('../src/security/ccoRbac');

const ANON_PATIENT = `anon-aisia-verify-${Date.now()}`;
const ENCOUNTER_ID = `enc-aisia-${Date.now()}`;

const MIN_PDF = Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`, 'utf8');
const MIN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const EXPECTED_TIMELINE = [
  'scalp_analysis_imported',
  'scalp_image_added',
  'scalp_metrics_added',
  'scalp_analysis_verified',
  'scalp_comparison_created',
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildMultipart(fields, files) {
  const boundary = `----aisiaVerify${Date.now()}`;
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );
  }
  for (const file of files) {
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    );
    chunks.push(file.buffer);
    chunks.push('\r\n');
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    body: Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c, 'utf8')))),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function apiFetch(baseUrl, method, urlPath, { headers = {}, body = null } = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, { method, headers, body });
  let data = {};
  const raw = await res.text();
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw: raw.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function runApiIntegration() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aisia-verify-'));
  const scalpStore = await createCcoScalpAnalysisStore({
    filePath: path.join(dir, 'scalp.json'),
  });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(dir, 'assets.json'),
  });
  const secureStorage = createSecureStorageProvider({
    provider: 'local',
    rootPath: path.join(dir, 'storage'),
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoScalpAnalysisRouter({
      resolveStores: () => ({ scalpStore, assetStore, secureStorage }),
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: { defaultTenantId: 'hairtpclinic' },
      attachRole,
    })
  );

  const results = {
    patientId: ANON_PATIENT,
    tempDir: dir,
    endpoints: [],
    timelineEvents: [],
    assets: [],
    storageVerified: [],
    rbac: [],
    audit: [],
    swedishAdapter: null,
    protocolStatus: null,
    comparison: null,
    errors: [],
  };

  const op = { 'x-cco-role': 'operator' };
  const personal = { 'x-cco-role': 'personal' };
  const revisor = { 'x-cco-role': 'revisor' };

  await withServer(app, async (baseUrl) => {
    async function step(name, method, urlPath, opts = {}) {
      const res = await apiFetch(baseUrl, method, urlPath, opts);
      results.endpoints.push({
        name,
        method,
        path: urlPath,
        status: res.status,
        ok: res.status < 400,
      });
      if (res.status >= 400 && !opts.expectFail) {
        results.errors.push(`${name}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
      }
      return res;
    }

    const forbiddenWrite = await step(
      'RBAC personal write denied',
      'POST',
      '/cco/scalp-analysis/sessions',
      {
        headers: { 'content-type': 'application/json', ...personal },
        body: JSON.stringify({ patientId: ANON_PATIENT }),
        expectFail: true,
      }
    );
    results.rbac.push({
      test: 'personal scalp.write',
      pass: forbiddenWrite.status === 403,
      status: forbiddenWrite.status,
    });

    const forbiddenRead = await step(
      'RBAC revisor read denied',
      'GET',
      `/cco/scalp-analysis/patient/${ANON_PATIENT}`,
      { headers: revisor, expectFail: true }
    );
    results.rbac.push({
      test: 'revisor scalp.read',
      pass: forbiddenRead.status === 403,
      status: forbiddenRead.status,
    });

    const baseline = await step('POST baseline session', 'POST', '/cco/scalp-analysis/sessions', {
      headers: { 'content-type': 'application/json', ...op },
      body: JSON.stringify({
        patientId: ANON_PATIENT,
        encounterId: ENCOUNTER_ID,
        sessionType: 'consultation',
        source: 'aisia_ds3',
      }),
    });
    const baselineId = baseline.data.session?.id;

    const followUp = await step('POST follow_up session', 'POST', '/cco/scalp-analysis/sessions', {
      headers: { 'content-type': 'application/json', ...op },
      body: JSON.stringify({
        patientId: ANON_PATIENT,
        sessionType: 'follow_up',
        source: 'aisia_ds3',
      }),
    });
    const followUpId = followUp.data.session?.id;

    const pdfMultipart = buildMultipart({}, [
      {
        fieldName: 'file',
        filename: 'anon-aisia-report.pdf',
        contentType: 'application/pdf',
        buffer: MIN_PDF,
      },
    ]);
    const pdfImport = await step(
      'POST import-report PDF',
      'POST',
      `/cco/scalp-analysis/sessions/${baselineId}/import-report`,
      {
        headers: { 'content-type': pdfMultipart.contentType, ...op },
        body: pdfMultipart.body,
      }
    );
    const reportAssetId = pdfImport.data.reportAsset?.id;

    const imgMultipart = buildMultipart({ zone: 'donor_left' }, [
      {
        fieldName: 'files',
        filename: 'anon-scalp-donor-left.png',
        contentType: 'image/png',
        buffer: MIN_PNG,
      },
    ]);
    const imgImport = await step(
      'POST import-images',
      'POST',
      `/cco/scalp-analysis/sessions/${baselineId}/import-images`,
      {
        headers: { 'content-type': imgMultipart.contentType, ...op },
        body: imgMultipart.body,
      }
    );

    const metrics = await step(
      'POST metrics',
      'POST',
      `/cco/scalp-analysis/sessions/${baselineId}/metrics`,
      {
        headers: { 'content-type': 'application/json', ...op },
        body: JSON.stringify({
          metrics: [
            { metricType: 'total_hair_count', value: 120, unit: 'count', source: 'manual' },
            { metricType: 'donor_density', value: 85, unit: 'count', source: 'manual' },
          ],
        }),
      }
    );

    const forbiddenVerify = await step(
      'RBAC personal verify denied',
      'POST',
      `/cco/scalp-analysis/sessions/${baselineId}/verify`,
      {
        headers: { 'content-type': 'application/json', ...personal },
        body: JSON.stringify({ clinicianNotes: 'should fail' }),
        expectFail: true,
      }
    );
    results.rbac.push({
      test: 'personal scalp.verify',
      pass: forbiddenVerify.status === 403,
      status: forbiddenVerify.status,
    });

    const verify = await step(
      'POST verify session',
      'POST',
      `/cco/scalp-analysis/sessions/${baselineId}/verify`,
      {
        headers: { 'content-type': 'application/json', ...op },
        body: JSON.stringify({ clinicianNotes: 'Verifierad av behandlare — ingen auto-diagnos.' }),
      }
    );

    await step(
      'POST follow_up metrics',
      'POST',
      `/cco/scalp-analysis/sessions/${followUpId}/metrics`,
      {
        headers: { 'content-type': 'application/json', ...op },
        body: JSON.stringify({
          metrics: [
            { metricType: 'total_hair_count', value: 130, unit: 'count', source: 'manual' },
          ],
        }),
      }
    );

    const comparison = await step('POST comparison', 'POST', '/cco/scalp-analysis/comparisons', {
      headers: { 'content-type': 'application/json', ...op },
      body: JSON.stringify({
        patientId: ANON_PATIENT,
        baselineSessionId: baselineId,
        comparisonSessionId: followUpId,
      }),
    });
    results.comparison = comparison.data.comparison || null;

    await step('GET patient bundle', 'GET', `/cco/scalp-analysis/patient/${ANON_PATIENT}`, {
      headers: op,
    });

    const protocol = await step(
      'GET protocol-status',
      'GET',
      `/cco/scalp-analysis/patient/${ANON_PATIENT}/protocol-status`,
      { headers: op }
    );
    results.protocolStatus = protocol.data;

    const patientView = await step(
      'GET patient-view (svenska)',
      'GET',
      `/cco/scalp-analysis/patient/${ANON_PATIENT}/patient-view`,
      { headers: op }
    );
    results.swedishAdapter = {
      disclaimer: patientView.data.disclaimer || '',
      sessionCount: patientView.data.sessions?.length || 0,
      sampleMetricLabel: patientView.data.sessions?.[0]?.metrics?.[0]?.label || null,
      hasSwedishLabel:
        String(patientView.data.sessions?.[0]?.metrics?.[0]?.label || '').includes('Hårantal') ||
        String(patientView.data.sessions?.[0]?.metrics?.[0]?.label || '').includes('Donor'),
    };

    await step('GET meta/enums', 'GET', '/cco/scalp-analysis/meta/enums', { headers: op });

    const bundle = scalpStore.getPatientBundle(ANON_PATIENT);
    results.timelineEvents = (bundle.timeline || []).map((e) => e.type);
    const missingEvents = EXPECTED_TIMELINE.filter((t) => !results.timelineEvents.includes(t));

    const allAssets = assetStore.listAssetsForPatient(ANON_PATIENT);
    for (const asset of allAssets) {
      results.assets.push({
        id: asset.id,
        category: asset.category,
        patientId: asset.patientId,
        encounterId: asset.encounterId,
        storageKey: asset.storageKey,
        checksum: asset.checksum,
        status: asset.status,
        sourceSystem: asset.sourceSystem,
      });

      const stored = await secureStorage.getObject(asset.storageKey);
      const match = stored.checksum === asset.checksum && stored.buffer?.length > 0;
      const pdfUnchanged =
        asset.category === 'aisia_report'
          ? stored.buffer.equals(MIN_PDF)
          : asset.category.startsWith('photo_')
            ? stored.buffer.equals(MIN_PNG)
            : true;
      results.storageVerified.push({
        assetId: asset.id,
        checksumMatch: match,
        originalBytesPreserved: pdfUnchanged,
        storageKey: asset.storageKey,
      });
    }

    const scalpJson = JSON.parse(await fs.readFile(path.join(dir, 'scalp.json'), 'utf8'));
    const auditEntries = Array.isArray(scalpJson.audit) ? scalpJson.audit : [];
    const auditHasBinary = auditEntries.some((e) =>
      JSON.stringify(e).match(/iVBORw0KGgo|%%EOF|%PDF/)
    );
    results.audit.push({
      entryCount: auditEntries.length,
      actions: [...new Set(auditEntries.map((e) => e.action))],
      noRawPatientBinaryInPayload: !auditHasBinary,
    });

    results.patientLink = {
      patientId: ANON_PATIENT,
      encounterIdOnBaseline: verify.data.session?.encounterId === ENCOUNTER_ID,
      reportAssetLinked: !!reportAssetId,
      imageImportCount: imgImport.data.count,
    };

    results.categoryCheck = {
      reportIsAisiaReport: allAssets.some((a) => a.category === 'aisia_report'),
      imageIsPhotoBefore:
        allAssets.some((a) => a.category === 'photo_before') ||
        allAssets.some((a) => a.category === 'photo_after'),
      sourceSystemAisia: allAssets.every((a) => a.sourceSystem === 'aisia_ds3'),
    };

    results.timelineComplete = missingEvents.length === 0;
    results.missingTimelineEvents = missingEvents;
    results.verifyStatus = verify.data.session?.status === 'verified';
    results.metricsLocalized =
      metrics.data.metrics?.[0]?.labelSv === 'Hårantal' ||
      metrics.data.metrics?.[0]?.displaySv === 'Hårantal';

    if (!results.timelineComplete) {
      results.errors.push(`Saknade timeline-events: ${missingEvents.join(', ')}`);
    }
    if (!results.categoryCheck.reportIsAisiaReport) {
      results.errors.push('PDF asset category !== aisia_report');
    }
    if (results.audit.some((a) => !a.noRawPatientBinaryInPayload)) {
      results.errors.push('Audit payload innehåller rå binärdata');
    }
  });

  results.pass = results.errors.length === 0;
  return results;
}

async function runStaticUiChecks() {
  const patientUi = await fs.readFile(
    path.join(REPO, 'public/major-arcana-preview/app/patient-master-ui.js'),
    'utf8'
  );
  const indexHtml = await fs.readFile(
    path.join(REPO, 'public/major-arcana-preview/index.html'),
    'utf8'
  );
  const scalpJs = await fs.readFile(path.join(REPO, 'public/cco-scalp-analysis.js'), 'utf8');

  const checks = [];

  function add(name, pass, detail) {
    checks.push({ name, pass, detail });
  }

  add(
    'Desktop flik Hår-/scalpanalys',
    patientUi.includes('data-patient-tab="scalpanalys"') && patientUi.includes('Hår-/scalpanalys'),
    'patient-master-ui.js desktop tabs'
  );
  add(
    'Mobil flik Scalpanalys',
    patientUi.includes('isMobileViewport()') &&
      patientUi.includes('data-patient-tab="scalpanalys"') &&
      patientUi.includes('>Scalpanalys<'),
    'patient-master-ui.js mobile tabs'
  );
  add(
    'CcoScalpAnalysis.mount på scalpanalys-panel',
    patientUi.includes("normalized === 'scalpanalys'") &&
      patientUi.includes('CcoScalpAnalysis.mount'),
    'patient-master-ui.js mount'
  );
  add(
    'Pre-op callout renderScalpImagingCallout',
    patientUi.includes('renderScalpImagingCallout') &&
      patientUi.includes('loadScalpProtocolStatus'),
    'konsultation/pre-op status gate'
  );
  add(
    'index.html laddar scalp CSS/JS',
    indexHtml.includes('/cco-scalp-analysis.css') && indexHtml.includes('/cco-scalp-analysis.js'),
    'index.html assets'
  );
  add(
    'UI: ingen auto-diagnos text',
    !scalpJs.match(/diagnos|behandlingsrekommendation/i) ||
      scalpJs.includes('inte automatisk behandlingsrekommendation'),
    'cco-scalp-analysis.js compliance copy'
  );
  add(
    'UI: patientvy sektion',
    scalpJs.includes('Patientvy (förenklad svenska)'),
    'cco-scalp-analysis.js patient view'
  );
  add(
    'UI: jämförelse-knapp',
    scalpJs.includes('onCreateComparison') && scalpJs.includes('comparisonSessionId'),
    'cco-scalp-analysis.js comparison API field'
  );

  const journalTabsIntact =
    patientUi.includes('data-patient-tab="journal"') &&
    patientUi.includes('data-patient-tab="filer"');
  add('Journal/Filer-flikar oförändrade (desktop)', journalTabsIntact, 'desktop tab bar');

  return {
    checks,
    pass: checks.every((c) => c.pass),
  };
}

async function checkNoPatientDataInGitTrackedPaths() {
  const tracked = ['data/cco-scalp-analysis.json', 'data/cco-patient-assets.json'];
  const findings = [];
  for (const rel of tracked) {
    try {
      const raw = await fs.readFile(path.join(REPO, rel), 'utf8');
      if (raw.includes(ANON_PATIENT)) {
        findings.push(`${rel} innehåller test-patientId (förväntat lokalt, ska ej committas)`);
      }
    } catch {
      // file may not exist
    }
  }
  const gitStatus = await fs.readFile(path.join(REPO, '.gitignore'), 'utf8').catch(() => '');
  return {
    anonPatientInRepoData: findings,
    note: 'Verifiering använder temp-dir; inga binärfiler skrivs till git-tracked paths av scriptet.',
    secureStorageInGitignore:
      gitStatus.includes('cco-secure') || gitStatus.includes('secure-storage'),
  };
}

async function main() {
  console.log('=== Aisia CCO Integration Verification Sprint ===\n');

  const api = await runApiIntegration();
  console.log('API integration:', api.pass ? 'PASS' : 'FAIL');
  if (api.errors.length) {
    api.errors.forEach((e) => console.log('  ERROR:', e));
  }
  console.log('  Timeline events:', api.timelineEvents.join(', '));
  console.log('  Assets:', api.assets.length);
  console.log('  RBAC:', api.rbac.every((r) => r.pass) ? 'PASS' : 'FAIL');

  const ui = await runStaticUiChecks();
  console.log('\nStatic UI checks:', ui.pass ? 'PASS' : 'FAIL');
  ui.checks.filter((c) => !c.pass).forEach((c) => console.log('  FAIL:', c.name, '—', c.detail));

  const compliance = await checkNoPatientDataInGitTrackedPaths();

  const summary = {
    verifiedAt: new Date().toISOString(),
    commit: '8694455d',
    phase: 'FAS 1 MVP — Integration Verification Sprint',
    apiIntegration: api,
    staticUi: ui,
    compliance,
    overallPass: api.pass && ui.pass,
  };

  console.log('\n=== SUMMARY JSON ===');
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.overallPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
