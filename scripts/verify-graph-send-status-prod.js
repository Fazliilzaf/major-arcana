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

function getAuthToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  try {
    return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (_staffErr) {
    return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}" --owner`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
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

  const token = getAuthToken();
  record('Auth token', Boolean(token));

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
    if (readEnabled) {
      record('Graph send live-läge', runtimeMode === 'live', runtimeMode);
    } else {
      record('Graph send-only (read av)', true, runtimeMode);
    }
  }

  let schedulerStatus = null;
  try {
    const payload = await fetchJson('/api/v1/ops/scheduler/status', token);
    schedulerStatus = payload?.scheduler || payload;
  } catch (err) {
    warn('Scheduler status', err.message || String(err));
  }
  const jobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
  const digestJob = jobs.find((job) => job?.id === 'cco_daily_digest');
  if (digestJob) {
    record('Scheduler cco_daily_digest', true, `enabled=${digestJob.enabled === true}`);
  } else {
    record('Scheduler cco_daily_digest', false, 'saknas i /ops/scheduler/status');
  }

  const allowlist = Array.isArray(schedulerStatus?.jobsAllowlist)
    ? schedulerStatus.jobsAllowlist
    : [];
  if (allowlist.includes('cco_daily_digest')) {
    record('Allowlist innehåller cco_daily_digest', true);
  } else if (allowlist.length > 0) {
    record('Allowlist innehåller cco_daily_digest', false, allowlist.join(','));
  }

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message || err}`);
  process.exit(1);
});
