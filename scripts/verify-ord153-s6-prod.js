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
 *   - --patient-email <addr>       (frivillig KORSKONTROLL, inte en override)
 *   - ARCANA_TEST_EMAIL_DOMAINS    (kommaseparerad whitelist, default example.com m.fl.)
 *
 * SÄKERHET: vägrar köra om mottagarens domän inte är i whitelisten — ett
 * offertmail till en riktig patient under verifieringen vore värre än buggen.
 *
 * Mottagaren slås ALLTID upp ur patient-summary, aldrig ur --patient-email.
 * Anledningen: /offer-send-for-sign tar bara emot patientId — det är SERVERN
 * som väljer adress ur journalen. En version som litade på --patient-email lät
 * `--patient-email x@example.com` passera domänkollen medan servern skickade
 * till patientens riktiga adress; skyddet kunde alltså kringgås av precis den
 * flagga som fanns för bekvämlighet. Anges flaggan nu måste den MATCHA den
 * uppslagna adressen, annars avbryts körningen.
 *
 * Exempel:
 *   ARCANA_SMOKE_BEARER_TOKEN=... node scripts/verify-ord153-s6-prod.js \
 *     --patient-id p-test-1 --patient-email test-1@example.com
 */

require('dotenv').config({ quiet: true });

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
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
// Timeout på varje anrop — utan den hänger hela verifieringen tyst om prod
// slutar svara, och en smoke som aldrig avslutas är värre än en som failar.
const HTTP_TIMEOUT_MS = Number(process.env.ARCANA_SMOKE_TIMEOUT_MS || 20000);

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function emailDomain(email) {
  const at = String(email || '').lastIndexOf('@');
  return at === -1
    ? ''
    : String(email)
        .slice(at + 1)
        .toLowerCase();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const patientId = readArg('patient-id').trim();
  const explicitEmail = readArg('patient-email').trim();

  if (!patientId) {
    fail('S6-arg patient-id', 'saknar obligatoriskt --patient-id <id>');
    console.error('\nRESULT: FAIL');
    process.exit(1);
  }

  // mailinator.com är medvetet BORTA ur defaulten: det är en riktig, publikt
  // läsbar brevlåda, inte en reserverad testdomän. Skulle grinden råka vara på
  // hamnar ett skarpt offertmail i en inkorg vem som helst kan läsa. Kvar står
  // bara RFC 2606-reserverade namn + test.local, som aldrig kan leverera.
  const whitelist = String(
    process.env.ARCANA_TEST_EMAIL_DOMAINS || 'example.com,example.org,example.net,test.local'
  )
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  // Repots egna UAT-patienter ligger på arcana.invalid, och .invalid/.test är
  // reserverade av RFC 2606/6761 — de kan per definition inte resolva, alltså
  // kan inget mail nå en riktig inkorg via dem. Utan den här regeln vägrade
  // scriptet köra mot just de patienter som finns till för ändamålet.
  const RESERVED_TEST_TLD = /\.(invalid|test)$/;
  const isTestDomain = (d) => whitelist.includes(d) || RESERVED_TEST_TLD.test(d);

  console.log(`ORD-153 §6 prod-bevis @ ${BASE}`);
  console.log(`patientId=${patientId}  host=${HOST}`);
  console.log(`testdomäner (whitelist): ${whitelist.join(', ')} + *.invalid, *.test\n`);

  // -- 0 · CCO_SEND_LIVE-avläsning -----------------------------------------
  // _diag/env exponerar numera resolved.ccoSendLive — det EFFEKTIVA värdet via
  // samma ccoSendLiveGate som dispatchen grindar på. Hela verifieringen är bara
  // meningsfull när grinden är STÄNGD: med öppen grind bevisar ett PASS på
  // S6-04 ingenting alls. Därför hård FAIL, inte WARN.
  const diag = await getJson(`${BASE}/api/v1/_diag/env`);
  const sendLive = diag.body?.resolved?.ccoSendLive;
  if (sendLive === false) {
    pass(
      'S6-00 CCO_SEND_LIVE',
      `grinden stängd (rått värde: ${JSON.stringify(diag.body?.env?.CCO_SEND_LIVE)})`
    );
  } else if (sendLive === true) {
    fail(
      'S6-00 CCO_SEND_LIVE',
      'grinden är ÖPPEN — verifieringen kan inte bevisa något om sändgrinden. Stäng den i Render först.'
    );
    console.error('\nRESULT: FAIL (grinden öppen)');
    process.exit(1);
  } else {
    fail(
      'S6-00 CCO_SEND_LIVE',
      `resolved.ccoSendLive saknas i /_diag/env (HTTP ${diag.status}) — deployen är äldre än ORD-153 §6-fixen. Kan inte tolka resultatet.`
    );
    console.error('\nRESULT: FAIL (kan inte läsa grinden)');
    process.exit(1);
  }

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
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
  // ALLTID ur patient-summary. Se säkerhetsnoten i filhuvudet: servern väljer
  // mottagare ur journalen utifrån patientId, så en adress från kommandoraden
  // säger ingenting om vem mailet faktiskt går till.
  const summary = await getJson(
    `${BASE}/api/v1/cco-patient-master/patient/summary?patientId=${encodeURIComponent(patientId)}&lite=1`,
    auth
  );
  let recipientEmail = '';
  if (summary.status === 200) {
    const card = summary.body?.card || summary.body?.patient || summary.body?.profile || {};
    recipientEmail =
      card.primaryEmail || card.email || summary.body?.primaryEmail || summary.body?.email || '';
  }
  if (!recipientEmail) {
    fail(
      'S6-03 patient-e-post',
      `kunde inte slå upp e-post för ${patientId} (HTTP ${summary.status}) — vägrar gissa mottagare`
    );
    console.error('\nRESULT: FAIL (okänd mottagare)');
    process.exit(1);
  }

  // --patient-email är en korskontroll, inte en override: matchar den inte den
  // uppslagna adressen pekar antingen flaggan eller patientId på fel patient.
  if (explicitEmail && explicitEmail.toLowerCase() !== recipientEmail.toLowerCase()) {
    fail(
      'S6-03 patient-e-post (korskontroll)',
      `--patient-email "${explicitEmail}" matchar inte patientens uppslagna adress "${recipientEmail}"`
    );
    console.error('\nRESULT: FAIL (motstridig mottagare)');
    process.exit(1);
  }

  const domain = emailDomain(recipientEmail);
  if (!isTestDomain(domain)) {
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
    fail(
      'S6-04 offertmail grindad',
      `HTTP ${send.status}: ${JSON.stringify(send.body).slice(0, 200)}`
    );
    // Varje assertion ska ge exakt en rad, även när den föregående dog. Utan
    // detta försvann S6-05 och S6-04b tyst ur utskriften vid HTTP-fel.
    fail('S6-05 0 Resend-anrop', 'ej utvärderad — S6-04 gav inget svar att läsa');
    fail('S6-04b faktisk mottagare', 'ej utvärderad — S6-04 gav inget svar att läsa');
  } else {
    const email = send.body.offerEmail;
    // offerEmail kan vara null: ccoCommercial.js fångar dispatch-fel och svarar
    // ändå 200. Ett saknat objekt är INTE ett bevis på att grinden höll — den
    // gamla versionen läste `|| {}` och lät då S6-05 passera på `undefined`.
    if (!email || typeof email !== 'object') {
      fail(
        'S6-04 offertmail grindad',
        `offerEmail saknas i svaret (${JSON.stringify(email)}) — dispatchen kan ha kastat`
      );
      fail('S6-05 0 Resend-anrop', 'kan inte avgöras utan offerEmail');
      fail('S6-04b faktisk mottagare', 'kan inte avgöras utan offerEmail');
    } else {
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
      } else if (email.mode === 'dry-run' && email.provider === 'none') {
        pass('S6-05 0 Resend-anrop', `mode=${email.mode}, provider=${email.provider}`);
      } else {
        fail(
          'S6-05 0 Resend-anrop',
          `okänd kombination mode=${email.mode}, provider=${email.provider} — förväntade dry-run/none`
        );
      }

      // Efterkontroll: grindsvaret innehåller `recipient` (den adress servern
      // FAKTISKT valde). Det är den enda kvittensen på att förhandskollen mot
      // patient-summary gällde rätt person.
      const actual = email.recipient || '';
      const actualDomain = emailDomain(actual);
      if (!actual) {
        warn(
          'S6-04b faktisk mottagare',
          'grindsvaret saknar recipient — kan inte efterkontrollera'
        );
      } else if (isTestDomain(actualDomain)) {
        pass('S6-04b faktisk mottagare', `${actual} (domän ${actualDomain})`);
      } else {
        fail(
          'S6-04b faktisk mottagare',
          `servern valde "${actual}" (domän ${actualDomain}) som INTE är i whitelisten — förhandskollen såg fel adress`
        );
      }
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
  // Två helt olika orsaker gömde sig tidigare bakom samma SKIP-rad. "Inga
  // lediga tider" går över av sig självt; "webbbokningen är avstängd" gör inte
  // det — ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false är icke-förhandlingsbar på
  // prod enligt website-booking-policy.mdc, så den här vägen är STRUKTURELLT
  // omöjlig att rökkolla där, inte tillfälligt otillgänglig. Att rapportera
  // det som "just nu" fick en permanent lucka att se ut som otur.
  if (avail.body?.error === 'public_web_booking_disabled' || avail.status === 503) {
    skip(
      'S6-06 bokningsbekräftelse',
      'publik webbbokning är AVSTÄNGD på prod (ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false) — driftvägen kan inte bevisas via den publika reservationen alls, inte bara nu. Kräver en annan väg (personalbokning) för att täckas.'
    );
  } else if (!slotRaw) {
    skip(
      'S6-06 bokningsbekräftelse',
      'inga publika lediga tider — driftvägen kan inte rökkollas just nu, försök igen senare'
    );
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

    // publicBookingEngine.js bygger emailConfirmation som
    // {ok, mode, provider, skipped, messageId, error} — det finns VARKEN
    // `reason` ELLER `dryRun` i den. Den gamla kontrollen läste just de två
    // fälten, blev därmed alltid false, och lät S6-06 passera på enbart
    // HTTP 200: grindas driftvägen i morgon hade testet förblivit grönt.
    // Kontrollen går nu på de fält som faktiskt finns.
    const email = reservation.body?.emailConfirmation;
    if (reservation.status !== 200) {
      fail(
        'S6-06 bokningsbekräftelse',
        `HTTP ${reservation.status}: ${JSON.stringify(reservation.body).slice(0, 200)}`
      );
    } else if (!email || typeof email !== 'object') {
      // Saknat objekt = svarsformen har ändrats. Får aldrig tolkas som grönt.
      fail(
        'S6-06 bokningsbekräftelse',
        'svaret saknar emailConfirmation — svarsformen har ändrats, kan inte bevisa att driftvägen är ogrindad'
      );
    } else if (email.skipped || email.mode === 'dry-run') {
      fail(
        'S6-06 bokningsbekräftelse',
        `driftvägen verkar grindad: ${JSON.stringify({ ok: email.ok, mode: email.mode, provider: email.provider, skipped: email.skipped })}`
      );
    } else if (email.ok !== true) {
      fail(
        'S6-06 bokningsbekräftelse',
        `dispatch misslyckades (inte grindat, men inte heller sänt): ${JSON.stringify({ ok: email.ok, mode: email.mode, error: email.error })}`
      );
    } else {
      // mode blir 'mock' mot en reserverad testdomän — det är väntat och
      // fortfarande ett bevis på att vägen INTE är grindad.
      pass(
        'S6-06 bokningsbekräftelse dispatcher (inte grindad)',
        `email=${JSON.stringify({ ok: email.ok, mode: email.mode, provider: email.provider, skipped: email.skipped })}`
      );
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
