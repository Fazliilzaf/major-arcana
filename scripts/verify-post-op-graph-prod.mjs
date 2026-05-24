#!/usr/bin/env node
/**
 * Verifiera post-op review auto-send via Microsoft Graph på prod.
 * Skickar riktigt testmejl till POST_OP_GRAPH_TEST_TO (default fazli@hairtpclinic.com).
 *
 * Usage:
 *   npm run verify:post-op-graph-prod
 *   POST_OP_GRAPH_TEST_TO=you@example.com npm run verify:post-op-graph-prod
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const TO = (process.env.POST_OP_GRAPH_TEST_TO || 'fazli@hairtpclinic.com').trim().toLowerCase();
const CASE_ID = process.env.POST_OP_GRAPH_CASE_ID || `post-op-graph-verify-${Date.now()}`;

let hardFail = false;

function pass(name, detail = '') {
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  hardFail = true;
}

function getOwnerToken() {
  return execSync(`node "${path.join(ROOT, 'scripts/get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`Post-op Graph send verify @ ${BASE}`);
  console.log(`case=${CASE_ID} to=${TO}`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready === true) pass('POG-01 prod readyz');
  else fail('POG-01 prod readyz');

  let token = '';
  try {
    token = getOwnerToken();
    if (!token || token.length < 8) throw new Error('empty token');
    pass('POG-02 owner auth token');
  } catch (err) {
    fail('POG-02 owner auth token', err.message || 'missing');
    process.exit(1);
  }

  const status = await fetchJson(`${BASE}/api/v1/cco/runtime/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const graphSend = status.body?.graph?.sendEnabled === true;
  const sendConnector = status.body?.graph?.sendConnectorAvailable === true;
  if (graphSend) pass('POG-03 Graph sendEnabled');
  else fail('POG-03 Graph sendEnabled', 'ARCANA_GRAPH_SEND_ENABLED=false på Render');
  if (sendConnector) pass('POG-04 Graph sendConnectorAvailable');
  else fail('POG-04 Graph sendConnectorAvailable', 'credentials/allowlist saknas');

  const trigger = await fetchJson(
    `${BASE}/api/v1/cco-bookings/${encodeURIComponent(CASE_ID)}/mark-follow-up-completed`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
      body: JSON.stringify({
        customerName: 'Post-Op Graph Verify',
        locale: 'sv',
        baseUrl: BASE,
        patientEmail: TO,
      }),
    }
  );

  if (trigger.status !== 200 || !trigger.body?.ok) {
    fail('POG-05 operator trigger', `status=${trigger.status} error=${trigger.body?.error || '-'}`);
    process.exit(1);
  }

  const gs = trigger.body.graphSend || {};
  if (gs.ok === true && gs.mode === 'graph_send_mail') {
    pass('POG-05 Graph sendMail', `${gs.from} → ${gs.to} @ ${gs.sentAt || 'sent'}`);
  } else if (gs.mode === 'submission_already_existed' && trigger.body.alreadyExists) {
    fail('POG-05 Graph sendMail', 'submission redan skickad — sätt POST_OP_GRAPH_CASE_ID till nytt värde');
  } else if (gs.mode === 'no_graph_connector') {
    fail('POG-05 Graph sendMail', 'no_graph_connector — kontrollera Render secrets');
  } else if (gs.mode === 'graph_error') {
    fail('POG-05 Graph sendMail', gs.error || 'graph_error');
  } else {
    fail('POG-05 Graph sendMail', `mode=${gs.mode || 'unknown'} ok=${gs.ok}`);
  }

  const tokenMatch = String(trigger.body.reviewLink || '').match(/\/uppfoljning\/([^/?#]+)/);
  const reviewToken = tokenMatch?.[1] || trigger.body.token || '';
  if (reviewToken) pass('POG-06 review token', reviewToken.slice(0, 12) + '…');
  else fail('POG-06 review token', 'saknas i svar');

  if (reviewToken) {
    const page = await fetch(`${BASE}/uppfoljning/${encodeURIComponent(reviewToken)}`, {
      headers: { Accept: 'text/html' },
    });
    const html = await page.text();
    if (page.status === 200 && html.includes('submit-form')) pass('POG-07 patient page HTML');
    else fail('POG-07 patient page HTML', `status=${page.status}`);
  }

  console.log('');
  if (hardFail) {
    console.log('❌ Post-op Graph send verify misslyckades');
    process.exit(1);
  }
  console.log(`✅ Post-op Graph send live — kontrollera inkorgen ${TO}`);
}

main().catch((err) => {
  console.error('verify-post-op-graph-prod:', err.message || err);
  process.exit(1);
});
