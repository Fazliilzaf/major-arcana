#!/usr/bin/env node
/**
 * D2/D3/D4 — Verify CMO connectors live on prod.
 *
 * Checks:
 *   CM-01 connectors/status HTTP + summary
 *   CM-02 >=3 channels mode=live status=ok
 *   CM-03 CMO analytics ≠ insufficient_data (when metrics hydrated)
 *   CM-04 health alert uses sustained window (no immediate false positive on fresh deploy)
 *
 * Usage:
 *   npm run verify:cmo-connectors-prod
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`CMO connectors verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const token = getStaffToken();
  if (!record('STAFF token', Boolean(token))) process.exit(1);

  const status = await getJson(`${BASE}/api/v1/marketing/connectors/status?window=7d&force=1`, {
    Authorization: `Bearer ${token}`,
  });
  if (!record('CM-01 connectors/status HTTP', status.status === 200, `HTTP ${status.status}`)) {
    hardFail = true;
  }

  const items = Array.isArray(status.body.items) ? status.body.items : [];
  const liveOk = items.filter((item) => item.status === 'ok' && item.mode === 'live');
  const fixtureOk = items.filter((item) => item.status === 'ok' && item.mode === 'fixture');

  if (liveOk.length >= 3) {
    record('CM-02 live connectors ok', true, `${liveOk.length} kanaler: ${liveOk.map((i) => i.channel).join(', ')}`);
  } else if (fixtureOk.length >= 3) {
    fail(
      'CM-02 live connectors ok',
      `fortfarande fixture (${fixtureOk.length} ok) — kör npm run apply:cmo-connectors-prod`
    );
  } else {
    fail('CM-02 live connectors ok', `ok live=${liveOk.length} fixture=${fixtureOk.length}`);
  }

  const analytics = await postJson(
    `${BASE}/api/v1/agents/CMO/run`,
    { mode: 'analytics', period: 'weekly', channel: 'admin' },
    { Authorization: `Bearer ${token}` }
  );
  const analyticsStatus =
    analytics.body?.output?.data?.status ||
    analytics.body?.data?.status ||
    analytics.body?.result?.data?.status ||
    'unknown';

  if (!record('CM-03 CMO analytics HTTP', analytics.status === 200, `HTTP ${analytics.status}`)) {
    hardFail = true;
  } else if (analyticsStatus === 'insufficient_data' && liveOk.length >= 3) {
    fail('CM-03 analytics status', 'insufficient_data trots live connectors');
  } else {
    record('CM-03 analytics status', analyticsStatus === 'ok' || liveOk.length < 3, analyticsStatus);
  }

  const summary = status.body.summary || {};
  record(
    'CM-04 sustained alert config',
    typeof summary.sustainedAlertAfterMs === 'number' || summary.healthAlert === false,
    `healthAlert=${summary.healthAlert} afterMs=${summary.sustainedAlertAfterMs || '-'}`
  );

  for (const item of items) {
    record(`CM-05 ${item.channel}`, item.status === 'ok', `${item.mode} — ${item.message || '-'}`);
    if (item.status !== 'ok' && item.status !== 'not_configured') hardFail = true;
  }

  if (hardFail) {
    console.log('\n❌ CMO connectors verify FAIL');
    process.exit(1);
  }
  console.log('\n✅ CMO connectors verify PASS — live fetch aktiv');
}

main().catch((err) => {
  console.error('❌ CMO connectors verify:', err.message || err);
  process.exit(1);
});
