#!/usr/bin/env node
'use strict';

/**
 * Aktivera CCO daily digest i prod tenant-config + valfri dry-run verify.
 *
 * Usage:
 *   npm run enable:digest-prod
 *   DIGEST_RECIPIENTS=fazli@hairtpclinic.com npm run enable:digest-prod
 *   DIGEST_DRY_RUN_SEND=true npm run enable:digest-prod
 */
require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const tenantId = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const recipients = String(
  process.env.DIGEST_RECIPIENTS || 'fazli@hairtpclinic.com,contact@hairtpclinic.com'
)
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const sendHour = Number(process.env.DIGEST_SEND_HOUR || 6);
const dryRunSend = String(process.env.DIGEST_DRY_RUN_SEND || 'true').toLowerCase() === 'true';
const root = path.join(__dirname, '..');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg, detail = '') {
  console.log(`PASS: ${msg}${detail ? ` — ${detail}` : ''}`);
}

function getOwnerToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchJson(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error(parsed.error || `${res.status}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function main() {
  console.log(`Enable digest @ ${base} tenant=${tenantId}`);
  if (!recipients.length) fail('DIGEST_RECIPIENTS tom');

  const token = getOwnerToken();
  if (!token) fail('owner token saknas');
  pass('owner auth token');

  const patch = {
    digest: {
      enabled: true,
      recipients,
      sendHour: Number.isFinite(sendHour) ? Math.max(0, Math.min(23, sendHour)) : 6,
      locale: 'sv',
      senderMailbox: 'contact@hairtpclinic.com',
    },
  };

  const updated = await fetchJson('/api/v1/tenant-config', {
    method: 'PATCH',
    token,
    body: patch,
  });
  const digest = updated?.config?.digest || {};
  if (digest.enabled !== true) fail('digest.enabled inte true efter PATCH');
  if (!Array.isArray(digest.recipients) || digest.recipients.length === 0) {
    fail('digest.recipients tom efter PATCH');
  }
  pass(
    'tenant digest config',
    `recipients=${digest.recipients.join(', ')} sendHour=${digest.sendHour}`
  );

  const status = await fetchJson('/api/v1/cco/runtime/status', { token });
  const graph = status?.graph || {};
  if (graph.sendEnabled !== true) fail('graph.sendEnabled fortfarande false');
  if (graph.sendConnectorAvailable !== true) fail('graph.sendConnectorAvailable false');
  pass('Graph send connector', graph.runtimeMode || 'live');

  if (dryRunSend) {
    const preview = await fetchJson('/api/v1/ops/digest/send', {
      method: 'POST',
      token,
      body: {
        tenantId,
        dryRun: true,
        recipients,
      },
    });
    const result = preview?.result || {};
    if (!result.subject) fail('digest dry-run saknar subject');
    pass('digest dry-run', result.subject);
  }

  console.log('Digest aktiverad. Scheduler-jobb cco_daily_digest skickar vid sendHour (UTC).');
}

main().catch((err) => fail(err.message || String(err)));
