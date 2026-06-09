#!/usr/bin/env node
'use strict';

/**
 * Prod Graph send status — utan att skicka testmejl.
 */
require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const root = path.join(__dirname, '..');

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchJson(pathname, token) {
  const res = await fetch(`${base}${pathname}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  let hardFail = false;
  const record = (name, pass, detail = '') => {
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!pass) hardFail = true;
  };
  const warn = (name, detail = '') => {
    console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const ready = await fetch(`${base}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  record('Prod readyz', ready.ready === true, ready.reason || '');

  const token = getStaffToken();
  record('STAFF-token', Boolean(token));

  const status = await fetchJson('/api/v1/cco/runtime/status', token);
  const graph = status.graph || {};
  const readEnabled = graph.readEnabled === true;
  const sendEnabled = graph.sendEnabled === true;
  const sendConnectorAvailable = graph.sendConnectorAvailable === true;
  const runtimeMode = String(graph.runtimeMode || 'unknown');

  record('Graph sendEnabled', sendEnabled);
  record('Graph sendConnectorAvailable', sendConnectorAvailable);
  if (readEnabled) {
    warn('Graph readEnabled', 'READ är på — förväntat send-only läge med READ=false');
  } else {
    record('Graph read av (send-only)', true);
  }
  if (sendEnabled && sendConnectorAvailable) {
    record('Graph send live-läge', runtimeMode === 'live', runtimeMode);
  }

  const scheduler = status.scheduler || {};
  const jobs = Array.isArray(scheduler.jobs) ? scheduler.jobs : [];
  const digestJob = jobs.find((job) => job?.id === 'cco_daily_digest');
  if (digestJob) {
    record('Scheduler cco_daily_digest registrerat', true, `enabled=${digestJob.enabled === true}`);
  } else {
    record('Scheduler cco_daily_digest registrerat', false, 'saknas i status');
  }

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message || err}`);
  process.exit(1);
});
