#!/usr/bin/env node
'use strict';

/**
 * ORD-3 STAFF-auth prod verify — automation dry-run + shell signals + worklists.
 *
 *   ARCANA_PROD_URL=https://arcana.hairtpclinic.com npm run cco:verify-automation-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');
const { RULES } = require('../src/ops/ccoAutomationRegistry');

const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const SAMPLE_SIZE = Math.min(20, Math.max(10, Number(process.env.ORD3_UAT_SAMPLE || 15)));
const WORKLIST_QUEUES = [
  'health_declaration',
  'journal',
  'cooling',
  'agreement',
  'photo_review',
  'ready',
];

const FORBIDDEN = [/T-48/i, /14 dagar/i, /missing_form/i, /Auto-skicka/i, /AI föreslår/i];

const EXPECTED_RULE_IDS = RULES.map((r) => r.id);

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
  return pass;
}

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  try {
    return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    try {
      return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    } catch {
      throw err;
    }
  }
}

async function api(token, route) {
  const res = await fetch(`${BASE}${route}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body };
}

function scanForbidden(obj) {
  const blob = JSON.stringify(obj);
  for (const re of FORBIDDEN) {
    if (re.test(blob)) return re.source;
  }
  return null;
}

async function main() {
  console.log(`== verify-automation-prod ==\nBase: ${BASE}\n`);

  let token;
  try {
    token = getToken();
    record('STAFF/OWNER auth token', Boolean(token));
  } catch (err) {
    record('STAFF/OWNER auth token', false, err.message);
    process.exit(1);
  }

  const catalog = await api(token, '/api/v1/cco/automation/catalog');
  if (catalog.status !== 200) {
    record('catalog HTTP 200', false, `HTTP ${catalog.status}`);
  } else {
    const c = catalog.body;
    record('catalog enabled', c.enabled === true);
    record('catalog dryRun', c.dryRun === true);
    record('catalog ruleCount 10', c.ruleCount === 10, `got ${c.ruleCount}`);
    const ids = (c.rules || [])
      .map((r) => r.id)
      .sort()
      .join(',');
    const exp = [...EXPECTED_RULE_IDS].sort().join(',');
    record('catalog V2 rule ids', ids === exp);
    record('catalog no legacy 6-rule set', !/missing_form/.test(ids));
  }

  const shell = await api(
    token,
    `/api/v1/cco/staff/customers-shell?limit=${SAMPLE_SIZE}&offset=0&includeAutomation=1`
  );
  if (shell.status !== 200) {
    record('customers-shell+automation HTTP', false, `HTTP ${shell.status}`);
  } else {
    const patients = shell.body?.patients?.patients || [];
    record('shell automation.enabled', shell.body?.automation?.enabled === true);
    record('shell automation.dryRun', shell.body?.automation?.dryRun === true);
    record(`shell sample size`, patients.length >= 10, `n=${patients.length}`);

    let withSignals = 0;
    let withActive = 0;
    const activeByRule = Object.create(null);
    for (const p of patients) {
      const signals = p.automationSignals;
      if (!Array.isArray(signals) || signals.length !== 10) continue;
      withSignals += 1;
      const bad = scanForbidden(signals);
      if (bad) {
        record('forbidden copy in signals', false, bad);
        break;
      }
      for (const s of signals) {
        if (s.status === 'active') {
          withActive += 1;
          activeByRule[s.ruleId] = (activeByRule[s.ruleId] || 0) + 1;
        }
        if (s.dryRun !== true) {
          record('signal dryRun flag', false, s.ruleId);
        }
      }
    }
    if (!hardFail) record('forbidden copy in signals', true);
    record(
      'patients with 10 signals',
      withSignals >= Math.min(10, patients.length),
      `${withSignals}/${patients.length}`
    );
    record('at least one active signal in sample', withActive > 0, `active hits=${withActive}`);
    const topRules = Object.entries(activeByRule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ');
    console.log(`INFO: top active rules in sample — ${topRules || '(none)'}`);

    const evalPatient = patients.find((p) => p.automationTop?.status === 'active') || patients[0];
    if (evalPatient?.patientId) {
      const ev = await api(
        token,
        `/api/v1/cco/automation/evaluate?patientId=${encodeURIComponent(evalPatient.patientId)}`
      );
      record(
        'evaluate patient',
        ev.status === 200 && ev.body?.enabled === true && ev.body?.signals?.length === 10,
        ev.status === 200 ? evalPatient.patientId : `HTTP ${ev.status}`
      );
    }
  }

  for (const queue of WORKLIST_QUEUES) {
    const wl = await api(token, `/api/v1/cco/automation/worklists?queue=${queue}&limit=50`);
    const ok =
      wl.status === 200 &&
      wl.body?.enabled === true &&
      wl.body?.dryRun === true &&
      Array.isArray(wl.body?.items);
    record(
      `worklist ${queue} GET dry-run`,
      ok,
      ok ? `items=${wl.body.items.length}` : `HTTP ${wl.status}`
    );
  }

  const postProbe = await fetch(`${BASE}/api/v1/cco/automation/catalog`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  record(
    'no POST on catalog',
    postProbe.status === 404 || postProbe.status === 405,
    `HTTP ${postProbe.status}`
  );

  console.log('');
  if (hardFail) {
    console.error('✗ verify-automation-prod FAIL');
    process.exit(1);
  }
  console.log('✅ verify-automation-prod PASS');
}

main().catch((err) => {
  console.error(`FAIL: ${err.message || err}`);
  process.exit(1);
});
