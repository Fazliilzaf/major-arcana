#!/usr/bin/env node
'use strict';

/**
 * smoke-test-scalp-analysis.js — verifierar scalp analysis MVP endpoints.
 */

const http = require('node:http');
const PATIENT = 'anon-scalp-smoke-' + Date.now();
const TENANT = 'hairtpclinic';
const PORT = Number(process.env.PORT || 3100);

function curl(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          'x-cco-role': 'operator',
          ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Smoke-test: scalp analysis MVP ===');

  const ready = await curl('GET', '/readyz');
  if (ready.status !== 200) {
    console.error('FAIL: server not ready', ready.status);
    process.exit(1);
  }
  console.log('Step 0: readyz PASS');

  const create = await curl('POST', '/api/v1/cco/scalp-analysis/sessions', {
    patientId: PATIENT,
    sessionType: 'consultation',
    source: 'aisia_ds3',
  });
  if (create.status !== 201) {
    console.error('FAIL: create session', create.status, create.data);
    process.exit(1);
  }
  const sessionId = create.data.session?.id;
  console.log('Step 1: create session PASS', sessionId);

  const metrics = await curl('POST', `/api/v1/cco/scalp-analysis/sessions/${sessionId}/metrics`, {
    metrics: [{ metricType: 'total_hair_count', value: 88, unit: 'count', source: 'manual' }],
  });
  if (metrics.status !== 201) {
    console.error('FAIL: add metrics', metrics.status, metrics.data);
    process.exit(1);
  }
  console.log('Step 2: add metrics PASS');

  const verify = await curl('POST', `/api/v1/cco/scalp-analysis/sessions/${sessionId}/verify`, {
    clinicianNotes: 'Smoke verify',
  });
  if (verify.status !== 200 || verify.data.session?.status !== 'verified') {
    console.error('FAIL: verify', verify.status, verify.data);
    process.exit(1);
  }
  console.log('Step 3: verify PASS');

  const bundle = await curl(
    'GET',
    `/api/v1/cco/scalp-analysis/patient/${encodeURIComponent(PATIENT)}`
  );
  if (bundle.status !== 200 || bundle.data.sessions?.length < 1) {
    console.error('FAIL: patient bundle', bundle.status, bundle.data);
    process.exit(1);
  }
  console.log('Step 4: patient bundle PASS');

  const timeline = await curl(
    'GET',
    `/api/v1/cco-customers/${encodeURIComponent(PATIENT)}/journal-timeline?tenantId=${TENANT}`
  );
  if (timeline.status !== 200) {
    console.error('FAIL: timeline', timeline.status, timeline.data);
    process.exit(1);
  }
  const scalpEvents = (timeline.data.events || []).filter((e) =>
    String(e.type || '').startsWith('scalp_')
  );
  console.log('Step 5: timeline PASS (scalp events:', scalpEvents.length, ')');

  console.log('=== ALL PASS ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
