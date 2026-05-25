#!/usr/bin/env node
'use strict';

/**
 * J-6.2 policy verify: publik webb-bokning och Cliento av på prod.
 */
require('dotenv').config({ quiet: true });

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail = '') => {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    hardFail = true;
  };
  const pass = (name, detail = '') => {
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
  };

  console.log(`Booking engine policy verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready !== true) fail('BE-01 readyz');
  else pass('BE-01 readyz');

  const catalog = await getJson(
    `${BASE}/api/public/booking-engine/catalog?host=${encodeURIComponent(HOST)}`
  );
  if (catalog.status !== 503 || catalog.body.error !== 'public_web_booking_disabled') {
    fail('BE-02 public catalog disabled', `${catalog.status} ${catalog.body.error || ''}`);
  } else pass('BE-02 public catalog disabled');

  const cliento = await getJson(
    `${BASE}/api/public/cliento/slots?partnerId=1650&from=2026-06-01&to=2026-06-07`
  );
  if (cliento.status !== 503 || cliento.body.error !== 'cliento_booking_disabled') {
    fail('BE-03 cliento slots disabled', `${cliento.status} ${cliento.body.error || ''}`);
  } else pass('BE-03 cliento slots disabled');

  const postRes = await fetch(`${BASE}/api/public/booking-engine/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ consent: { gdpr: true } }),
  });
  const postBody = await postRes.json().catch(() => ({}));
  if (postRes.status !== 503 || postBody.error !== 'public_web_booking_disabled') {
    fail('BE-04 reservations disabled', `${postRes.status} ${postBody.error || ''}`);
  } else pass('BE-04 reservations disabled');

  if (hardFail) {
    console.error('\n❌ Booking engine policy verify FAIL');
    process.exit(1);
  }
  console.log('\n✅ Booking engine policy verify PASS (J-6.2 guards)');
}

main().catch((error) => {
  console.error('❌', error.message || error);
  process.exit(1);
});
