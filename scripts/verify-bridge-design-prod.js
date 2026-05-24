#!/usr/bin/env node
/**
 * A5 + E3–E5 — Verify bridge design on prod.
 *
 * Checks:
 *   BR-E4 catalog resources = Plan A doctors only (3)
 *   BR-E3 POST /public/web-events → gateway run_id
 *   BR-E5 honeypot on reservations + web-events blocks bots
 *   BR-A5 IDB v2 exposed on preview (static asset check)
 *
 * Usage:
 *   npm run verify:bridge-design-prod
 */
require('dotenv').config({ quiet: true });

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const BRAND_HOST = (process.env.ARCANA_BRAND_HOST || 'hairtpclinic.com').trim();

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
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

  console.log(`Bridge design verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const catalogUrl = `${BASE}/api/public/booking-engine/catalog?host=${encodeURIComponent(BRAND_HOST)}`;
  const catalog = await fetch(catalogUrl).then((r) => r.json()).catch(() => ({}));
  const resources = Array.isArray(catalog.resources) ? catalog.resources : [];
  const resourceIds = resources.map((item) => String(item.id || '')).sort();
  if (resourceIds.length === 3 && resourceIds.join(',') === 'arya,egzona,fazli') {
    record('BR-E4 public catalog resources', true, resourceIds.join(', '));
  } else {
    fail('BR-E4 public catalog resources', `got ${resourceIds.join(', ') || '(none)'}`);
  }

  const webEvent = await postJson(
    `${BASE}/api/public/web-events?host=${encodeURIComponent(BRAND_HOST)}`,
    {
      eventType: 'form_submit',
      host: BRAND_HOST,
      source: 'verify-bridge-design-prod',
      submittedAt: new Date().toISOString(),
      contact: { email: 'verify-bridge@example.com', name: 'Verify Bot' },
      page: '/verify-bridge',
      metadata: { verify: true },
    }
  );
  if (webEvent.status === 200 && webEvent.body.ok === true && webEvent.body.runId) {
    record('BR-E3 web-events gateway audit', true, `runId=${webEvent.body.runId}`);
  } else {
    fail(
      'BR-E3 web-events gateway audit',
      `HTTP ${webEvent.status} ${JSON.stringify(webEvent.body)}`
    );
  }

  const honeypotReservation = await postJson(
    `${BASE}/api/public/booking-engine/reservations?host=${encodeURIComponent(BRAND_HOST)}`,
    {
      website: 'https://spam.example',
      consent: { gdpr: true },
      contact: { name: 'Bot', email: 'bot@example.com', phone: '0701234567' },
      slot: {
        slotId: 'fake',
        start: '2026-12-01T10:00:00.000Z',
        resourceId: 'fazli',
        serviceId: 'consultation-online',
      },
    }
  );
  if (honeypotReservation.status === 400 && honeypotReservation.body.error === 'abuse_detected') {
    record('BR-E5 reservations honeypot', true);
  } else {
    fail(
      'BR-E5 reservations honeypot',
      `HTTP ${honeypotReservation.status} ${JSON.stringify(honeypotReservation.body)}`
    );
  }

  const honeypotWebEvent = await postJson(
    `${BASE}/api/public/web-events?host=${encodeURIComponent(BRAND_HOST)}`,
    {
      website: 'filled',
      eventType: 'exit_intent',
      host: BRAND_HOST,
    }
  );
  if (honeypotWebEvent.status === 400 && honeypotWebEvent.body.error === 'abuse_detected') {
    record('BR-E5 web-events honeypot', true);
  } else {
    fail(
      'BR-E5 web-events honeypot',
      `HTTP ${honeypotWebEvent.status} ${JSON.stringify(honeypotWebEvent.body)}`
    );
  }

  const idbRes = await fetch(`${BASE}/major-arcana-preview/app/thread-cache-idb.js`);
  const idbSource = idbRes.ok ? await idbRes.text() : '';
  if (idbRes.ok && idbSource.includes('DB_VERSION = 2') && idbSource.includes('workspace')) {
    record('BR-A5 IDB v2 workspace snapshot asset', true);
  } else {
    fail('BR-A5 IDB v2 workspace snapshot asset', 'thread-cache-idb.js saknar v2/workspace');
  }

  console.log(hardFail ? '\nBridge design verify: FAIL' : '\nBridge design verify: PASS');
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
