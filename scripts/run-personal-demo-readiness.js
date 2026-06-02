#!/usr/bin/env node
'use strict';

/**
 * run-personal-demo-readiness.js — route preflight + E2E + manifest update
 * Kör: node scripts/run-personal-demo-readiness.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REPO = path.join(__dirname, '..');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const ROLE = process.env.CCO_PERSONAL_DEMO_ROLE || 'owner';
const TENANT = 'hairtpclinic';
const MANIFEST_PATH = path.join(REPO, 'data/reports/cco-personal-demo-manifest.json');

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      url,
      {
        method,
        headers: {
          'x-cco-role': ROLE,
          'x-cco-tenant': TENANT,
          'x-cco-user': 'personal-demo-readiness',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (_) {
            json = { _raw: data.slice(0, 200) };
          }
          resolve({ status: res.statusCode || 0, json, raw: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function verdict(status, expected) {
  if (expected.includes(status)) return 'PASS';
  if (status >= 500) return 'FAIL';
  if (status === 404) return 'FAIL';
  return 'FAIL';
}

async function probeRoute(route) {
  const r = await request(route.method || 'GET', route.path, route.body);
  const ok = route.expected.includes(r.status);
  return { ...route, status: r.status, result: ok ? 'PASS' : 'FAIL', json: r.json };
}

async function probePilot(customerId) {
  const feed = await request(
    'GET',
    `/api/v1/cco-customers/${customerId}/journal-feed?tenantId=${TENANT}`
  );
  const timeline = await request(
    'GET',
    `/api/v1/cco-customers/${customerId}/journal-timeline?tenantId=${TENANT}`
  );
  const forms = await request(
    'GET',
    `/api/v1/cco-forms/patient/${customerId}/missing?treatment=fue&tenantId=${TENANT}`
  );
  return {
    customerId,
    journalFeed: feed.status === 200 ? 'PASS' : 'FAIL',
    journalTimeline: timeline.status === 200 ? 'PASS' : 'FAIL',
    forms: forms.status === 200 ? 'PASS' : 'FAIL',
    feedItems: feed.json?.items?.length ?? 0,
    timelineEvents: timeline.json?.counters?.totalEvents ?? 0,
  };
}

async function runE2E(patientId) {
  const steps = [];
  let fail = 0;

  const create = await request('PUT', '/api/v1/cco-journal-quick/entry', {
    tenantId: TENANT,
    patientId,
    journalType: 'consultation_plan',
    title: 'Readiness E2E 0604',
    bodyText: 'Anonym pilotpost.',
  });
  const entryId = create.json?.entry?.entryId;
  steps.push({ step: 'create_draft', status: create.status, pass: !!entryId });
  if (!entryId) fail += 1;

  const sign = await request('POST', '/api/v1/cco-journal-quick/entry/sign', {
    tenantId: TENANT,
    patientId,
    entryId,
  });
  const locked = !!sign.json?.entry?.locked;
  steps.push({ step: 'sign_lock', status: sign.status, pass: locked });
  if (!locked) fail += 1;

  const edit = await request('PUT', '/api/v1/cco-journal-quick/entry', {
    tenantId: TENANT,
    patientId,
    entryId,
    bodyText: 'Försök ändra låst post',
  });
  const editBlocked =
    edit.status >= 400 || /låst|locked|immutable/i.test(String(edit.json?.error || ''));
  steps.push({ step: 'edit_locked_blocked', status: edit.status, pass: editBlocked });

  const corr = await request('POST', '/api/v1/cco-journal-quick/entry/correction', {
    tenantId: TENANT,
    patientId,
    entryId,
    reason: 'Readiness E2E correction 0604',
    fields: { bodyText: 'Korrigerad anonym text.' },
  });
  const corrId = corr.json?.correction?.entryId || corr.json?.entry?.entryId;
  steps.push({ step: 'create_correction', status: corr.status, pass: !!corrId });
  if (!corrId) fail += 1;

  const corrSign = await request('POST', '/api/v1/cco-journal-quick/entry/sign', {
    tenantId: TENANT,
    patientId,
    entryId: corrId,
  });
  steps.push({
    step: 'sign_correction',
    status: corrSign.status,
    pass: !!corrSign.json?.entry?.locked,
  });

  const feed = await request(
    'GET',
    `/api/v1/cco-customers/${patientId}/journal-feed?tenantId=${TENANT}`
  );
  const timeline = await request(
    'GET',
    `/api/v1/cco-customers/${patientId}/journal-timeline?tenantId=${TENANT}`
  );
  steps.push({
    step: 'feed_visible',
    status: feed.status,
    pass: feed.status === 200 && (feed.json?.items?.length || 0) >= 1,
  });
  steps.push({
    step: 'timeline_visible',
    status: timeline.status,
    pass: timeline.status === 200 && (timeline.json?.counters?.totalEvents || 0) >= 1,
  });

  return { patientId, result: fail === 0 ? 'PASS' : 'FAIL', steps };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const pilotId = manifest.pilotCustomers?.[0]?.customerId || 'cco-pilot-20260602-a';

  console.log('=== Personal Demo Readiness ===');
  console.log('Base:', BASE);
  console.log('');

  const routes = [
    { name: 'kunder.html', path: '/kunder.html', expected: [200] },
    { name: 'personal-start', path: '/cco-personal-start.html', expected: [200] },
    {
      name: 'journal-feed',
      path: `/api/v1/cco-customers/${pilotId}/journal-feed?tenantId=${TENANT}`,
      expected: [200],
    },
    {
      name: 'journal-timeline',
      path: `/api/v1/cco-customers/${pilotId}/journal-timeline?tenantId=${TENANT}`,
      expected: [200],
    },
    {
      name: 'forms-missing',
      path: `/api/v1/cco-forms/patient/${pilotId}/missing?treatment=fue&tenantId=${TENANT}`,
      expected: [200],
    },
    {
      name: 'journal-entries',
      path: `/api/v1/cco-journal-quick/entries?tenantId=${TENANT}&patientId=${pilotId}`,
      expected: [200],
    },
    {
      name: 'journal-entry',
      path: '/api/v1/cco-journal-quick/entry',
      method: 'PUT',
      body: {},
      expected: [400],
    },
    {
      name: 'journal-sign',
      path: '/api/v1/cco-journal-quick/entry/sign',
      method: 'POST',
      body: {},
      expected: [400],
    },
    {
      name: 'journal-correction',
      path: '/api/v1/cco-journal-quick/entry/correction',
      method: 'POST',
      body: {},
      expected: [400],
    },
    { name: 'finance.html', path: '/finance.html', expected: [200] },
    { name: 'finance-review.html', path: '/finance-review.html', expected: [200] },
  ];

  const routeResults = [];
  for (const route of routes) {
    const r = await probeRoute(route);
    routeResults.push(r);
    console.log(`${r.result}  ${r.status}  ${route.name}`);
  }

  console.log('\n--- pilot customers ---');
  const pilotResults = [];
  for (const p of manifest.pilotCustomers || []) {
    const pr = await probePilot(p.customerId);
    pilotResults.push({ ...p, ...pr });
    p.journalFeed = pr.journalFeed;
    p.journalTimeline = pr.journalTimeline;
    p.forms = pr.forms;
    console.log(
      `${p.redactedLabel}: feed=${pr.journalFeed} timeline=${pr.journalTimeline} forms=${pr.forms}`
    );
  }

  console.log('\n--- E2E journal ---');
  const e2e = await runE2E(pilotId);
  for (const s of e2e.steps) console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.step} (${s.status})`);
  console.log('E2E:', e2e.result);

  manifest.generatedAt = new Date().toISOString();
  manifest.version = '1.1.0';
  manifest.deadline = '2026-06-04';
  manifest.routePreflight = routeResults.map(({ name, path, status, result }) => ({
    name,
    path,
    status,
    result,
  }));
  manifest.e2eJournal = e2e;
  manifest.pilotCustomers = manifest.pilotCustomers.map((p) => {
    const pr = pilotResults.find((x) => x.customerId === p.customerId);
    return pr
      ? { ...p, journalFeed: pr.journalFeed, journalTimeline: pr.journalTimeline, forms: pr.forms }
      : p;
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const reportPath = path.join(REPO, 'data/reports/cco-personal-demo-readiness-run.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: manifest.generatedAt, routeResults, pilotResults, e2e }, null, 2)
  );

  const failed =
    routeResults.filter((r) => r.result === 'FAIL').length + (e2e.result === 'FAIL' ? 1 : 0);
  console.log('\nReport:', reportPath);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
