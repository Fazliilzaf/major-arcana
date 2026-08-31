#!/usr/bin/env node
'use strict';

/**
 * verify-ord153-s6-prod — prod-bevis för ORD-153 §6-åtgärden (sändgrinden).
 *
 * Bevisar två vägar mot prod:
 *   (1) OFFERTMAIL är grindad: offertutskick mot testpatient ger
 *       offerEmail = {skipped:true, dryRun:true, reason:'send_gate_off'} och 0
 *       Resend-anrop (exportgrinden CCO_SEND_LIVE=av).
 *   (2) BOKNINGSBEKRÄFTELSE (driftväg) är INTE grindad: en publik reservation
 *       mot testdomän dispatcher fortfarande bekräftelsemailet (resultatet får
 *       INTE vara send_gate_off/dry-run).
 *
 * Körs av vem som helst med en giltig session. Inga inbyggda credentials.
 *
 * Krav:
 *   - Token ur env: ARCANA_SMOKE_BEARER_TOKEN (eller ARCANA_OWNER_TOKEN).
 *   - --patient-id <id>            (testpatient med ett offertunderlag)
 *   - --patient-email <addr>       (frivilligt; annars slås upp ur patient-summary)
 *   - ARCANA_TEST_EMAIL_DOMAINS    (kommaseparerad whitelist, default example.com m.fl.)
 *
 * SÄKERHET: vägrar köra om mottagarens domän inte är i whitelisten — ett
 * offertmail till en riktig patient under verifieringen vore värre än buggen.
 *
 * Exempel:
 *   ARCANA_SMOKE_BEARER_TOKEN=... node scripts/verify-ord153-s6-prod.js \
 *     --patient-id p-test-1 --patient-email test-1@example.com
 */

require('dotenv').config({ quiet: true });

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';

// ---------------------------------------------------------------------------
// CLI-arg
// ---------------------------------------------------------------------------
function readArg(name) {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx === -1 || idx + 1 >= process.argv.length) return '';
  return process.argv[idx + 1];
}

// ---------------------------------------------------------------------------
// Token (env only — inga inbyggda credentials)
// ---------------------------------------------------------------------------
function getToken() {
  const token =
    process.env.ARCANA_SMOKE_BEARER_TOKEN ||
    process.env.ARCANA_OWNER_TOKEN ||
    process.env.ARCANA_STAFF_TOKEN ||
    '';
  if (!token.trim()) {
    throw new Error(
      'Token saknas. Sätt ARCANA_SMOKE_BEARER_TOKEN (eller ARCANA_OWNER_TOKEN) i env.'
    );
  }
  return token.trim();
}

// ---------------------------------------------------------------------------
// Assertionshjälpare (en rad per utfall)
// ---------------------------------------------------------------------------
let hardFail = false;
function pass(name, detail = '') {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  hardFail = true;
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}
function warn(name, detail = '') {
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ''}`);
}
function skip(name, detail = '') {
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
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

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1 ? '' : String(email).slice(at + 1).toLowerCase();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const patientId = readArg('patient-id').trim();
  const explicitEmail = readArg('patient-email').trim();

  if (!patientId) {
    console.error('Saknar obligatoriskt --patient-id <id>.');
    process.exit(2);
  }

  const whitelist = String(
    process.env.ARCANA_TEST_EMAIL_DOMAINS || 'example.com,example.org,example.net,test.local,mailinator.com'
  )
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  console.log(`ORD-153 §6 prod-bevis @ ${BASE}`);
  console.log(`patientId=${patientId}  host=${HOST}`);
  console.log(`testdomäner (whitelist): ${whitelist.join(', ')}\n`);

  // -- 0 · CCO_SEND_LIVE-avläsning -----------------------------------------
  // Ingen endpoint exponerar CCO_SEND_LIVE (se src/routes/diag.js flags-lista).
  // Verifieringen är bara giltig när CCO_SEND_LIVE="false" i Render. Logga det
  // högt så ett grönt resultat inte misstolkas som att grinden är på.
  warn(
    'S6-00 CCO_SEND_LIVE',
    'kan INTE läsas programmatiskt (ingen endpoint exponerar den). Bekräfta i Render att CCO_SEND_LIVE="false" innan du tolkar PASS som grönt.'
  );

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready === true) pass('S6-01 readyz');
  else fail('S6-01 readyz', JSON.stringify(ready).slice(0, 120));

  let token = '';
  try {
    token = getToken();
    pass('S6-02 auth token', 'från env');
  } catch (err) {
    fail('S6-02 auth token', err.message);
    console.error('\nRESULT: FAIL (ingen token)');
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };

  // -- 1 · Lös + validera mottagaren ----------------------------------------
  let recipientEmail = explicitEmail;
  if (!recipientEmail) {
    const summary = await getJson(
      `${BASE}/api/v1/cco-patient-master/patient/summary?patientId=${encodeURIComponent(patientId)}&lite=1`,
      auth
    );
    if (summary.status === 200) {
      const card = summary.body?.card || summary.body?.patient || summary.body?.profile || {};
      recipientEmail =
        card.primaryEmail || card.email || summary.body?.primaryEmail || summary.body?.email || '';
    }
    if (!recipientEmail) {
      fail(
        'S6-03 patient-e-post',
        `kunde inte slå upp e-post för ${patientId} — ange --patient-email explicit`
      );
      console.error('\nRESULT: FAIL');
      process.exit(1);
    }
  }

  const domain = emailDomain(recipientEmail);
  if (!whitelist.includes(domain)) {
    fail(
      'S6-03 patient-e-post (testdomän)',
      `mottagare "${recipientEmail}" har domän "${domain}" som INTE är i whitelisten. Vägrar köra.`
    );
    console.error('\nRESULT: FAIL (ej testdomän — skydd mot riktig patient)');
    process.exit(1);
  }
  pass('S6-03 patient-e-post (testdomän)', `${recipientEmail} (domän ${domain})`);

  // -- 2 · Väg 1: offertmail grindat ----------------------------------------
  const send = await postJson(
    `${BASE}/api/v1/cco-commercial/offer-send-for-sign`,
    { patientId },
    auth
  );
  if (send.status !== 200) {
    fail('S6-04 offer-send-for-sign', `HTTP ${send.status}: ${JSON.stringify(send.body).slice(0, 200)}`);
  } else {
    const email = send.body.offerEmail || {};
    const gateOk =
      email.skipped === true && email.dryRun === true && email.reason === 'send_gate_off';
    if (gateOk) {
      pass(
        'S6-04 offertmail grindad',
        `offerEmail=${JSON.stringify({ skipped: email.skipped, dryRun: email.dryRun, reason: email.reason, mode: email.mode, provider: email.provider })}`
      );
    } else {
      fail(
        'S6-04 offertmail grindad',
        `offerEmail=${JSON.stringify(email)} — förväntade {skipped:true, dryRun:true, reason:"send_gate_off"}`
      );
    }
    if (email.mode === 'live' || email.mode === 'resend' || email.provider === 'resend') {
      fail('S6-05 0 Resend-anrop', `offerEmail.mode/provider=${email.mode}/${email.provider}`);
    } else {
      pass('S6-05 0 Resend-anrop', `mode=${email.mode}, provider=${email.provider}`);
    }
  }

  // -- 3 · Väg 2: bokningsbekräftelse (driftväg) inte grindad ----------------
  const smokeEmail = `verify-ord153-s6-${Date.now()}@example.com`;
  // Publik reservation (samma mönster som verify-resend-domain-prod.js) — skapar
  // en bokning och dispatcher bekräftelse till testdomänen.
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const avail = await getJson(
    `${BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${today}&toDate=${nextMonth}&srvIds=consultation-online`
  );

  const slotRaw =
    (Array.isArray(avail.body?.slots) && avail.body.slots[0]) ||
    (Array.isArray(avail.body) && avail.body[0]) ||
    null;
  if (!slotRaw) {
    skip('S6-06 bokningsbekräftelse', 'inga publika lediga tider — driftvägen kan inte rökkollas just nu');
  } else {
    const reservation = await postJson(
      `${BASE}/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`,
      {
        contact: { name: 'ORD153 S6 Verify', email: smokeEmail, phone: '+46701234567' },
        slot: {
          slotId: slotRaw.slotId || slotRaw.id,
          startsAt: slotRaw.start || slotRaw.startsAt,
          endsAt: slotRaw.end || slotRaw.endsAt,
          resourceId: slotRaw.resourceId,
          serviceId: slotRaw.serviceId || 'consultation-online',
        },
        consent: { gdpr: true, marketing: false },
        leadContext: { service: 'consultation-online', source: 'verify-ord153-s6-prod' },
        locale: 'sv',
      }
    );

    const email = reservation.body?.emailConfirmation || {};
    const gated = email.reason === 'send_gate_off' || email.dryRun === true;
    if (reservation.status === 200 && !gated) {
      pass(
        'S6-06 bokningsbekräftelse dispatcher (inte grindad)',
        `email=${JSON.stringify({ skipped: email.skipped, reason: email.reason, mode: email.mode, provider: email.provider })}`
      );
    } else if (gated) {
      fail('S6-06 bokningsbekräftelse', `driftvägen verkar grindad: ${JSON.stringify(email)}`);
    } else {
      fail('S6-06 bokningsbekräftelse', `HTTP ${reservation.status}: ${JSON.stringify(reservation.body).slice(0, 200)}`);
    }
  }

  console.log('');
  if (hardFail) {
    console.error('RESULT: FAIL');
    process.exit(1);
  }
  console.log('RESULT: PASS');
}

main().catch((error) => {
  console.error('\nRESULT: ERROR');
  console.error(error);
  process.exit(1);
});
