#!/usr/bin/env node
/**
 * B4 — BEREDSKAPSKONTROLL för Plan A-bokning på hairtpclinic.com.
 *
 * VAD DET HÄR SKRIPTET INTE ÄR: en kontroll av bokningen som körs i dag.
 * hairtpclinic.com/boka laddar Clientos widget (cbk-id 4yPQXQy6WMgoZnCAOylVjx)
 * och hämtar tider från cliento.com direkt i webbläsaren. Det testas av
 * `npm run verify:booking-live-prod`. Använd det för frågan "fungerar bokningen?".
 *
 * Det här skriptet mäter om Plan A — den Arcana-drivna ersättaren — är redo att
 * skeppas. WB-05 failar med flit så länge Cliento sitter kvar på /boka. Ett FAIL
 * här betyder "ännu inte skeppat", inte "något är trasigt".
 *
 * ⚠️ VILLKORAD PROD-SKRIVNING
 * Vid WB-07 POSTar skriptet ett riktigt lead till {WEB_BASE}/api/lead.
 * Den raden nås bara om Arcana lämnar ut en slot i WB-06. Porten är
 * config.publicWebBookingEnabled (src/config.js), som läser
 * ARCANA_PUBLIC_WEB_BOOKING_ENABLED och **defaultar till true** — den är
 * alltså öppen om inte env-värdet uttryckligen sätts till false. Skriptet
 * skriver ut portens läge före WB-07 och kräver WRITE_LEAD=1 för att gå vidare.
 *
 * Kräver Vercel env:
 *   ARCANA_BASE_URL, ARCANA_PROVIDER=booking-engine, ARCANA_BRAND_HOST
 *
 * Usage:
 *   npm run check:plan-a-booking-readiness-prod            # läsande
 *   WRITE_LEAD=1 npm run check:plan-a-booking-readiness-prod  # tillåt lead-POST
 */
require('dotenv').config({ quiet: true });

const WEB_BASE = (process.env.WEB_BASE || 'https://hairtpclinic.com').replace(/\/+$/, '');
const ARCANA_BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const HOST = process.env.HOST || 'hairtpclinic.com';
const FROM = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);

const PLAN_A_MARKERS = [
  'data-booking-surface="plan-a"',
  'Vad vill du boka?',
  'Reservera tid',
  'PlanABookingWizard',
];
const CLIENTO_MARKERS = ['cliento.com', 'ClientoBooking', 'data-cliento'];

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, res };
}

async function getText(url) {
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  return { status: res.status, text: await res.text() };
}

function slotPayload(slot) {
  return {
    slotId: slot.slotId || slot.id,
    startsAt: slot.start || slot.startsAt,
    endsAt: slot.end || slot.endsAt,
    resourceId: slot.resourceId,
    serviceId: slot.serviceId || 'consultation-online',
  };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`B4 Plan A-beredskap @ ${WEB_BASE} (Arcana ${ARCANA_BASE})`);
  console.log('Mäter om Plan A är redo att skeppas — inte om dagens bokning fungerar.');
  console.log('För dagens bokning: npm run verify:booking-live-prod\n');

  const ready = await fetch(`${ARCANA_BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('Arcana readyz', ready.ready === true)) hardFail = true;

  const avail = await getJson(
    `${WEB_BASE}/api/availability?fromDate=${FROM}&toDate=${TO}&serviceId=consultation-online`
  );
  if (!record('WB-01 availability HTTP', avail.status === 200, `HTTP ${avail.status}`)) {
    hardFail = true;
  } else {
    const mocked = avail.body.mocked === true;
    const slotCount = Array.isArray(avail.body.slots) ? avail.body.slots.length : 0;
    record(
      'WB-02 availability live (mocked=false)',
      !mocked,
      mocked ? 'mock-läge — sätt ARCANA_* på Vercel' : `${slotCount} slots`
    );
    if (mocked) hardFail = true;
    record('WB-03 availability slots', slotCount > 0, `${slotCount} slots`);
    if (slotCount === 0) hardFail = true;
  }

  const boka = await getText(`${WEB_BASE}/boka`);
  if (!record('WB-04 /boka HTTP', boka.status === 200, `HTTP ${boka.status}`)) {
    hardFail = true;
  } else {
    const planA = PLAN_A_MARKERS.some((m) => boka.text.includes(m));
    const cliento = CLIENTO_MARKERS.some((m) => boka.text.toLowerCase().includes(m.toLowerCase()));
    if (planA) {
      record('WB-05 /boka Plan A UI', true, 'Plan A wizard aktiv');
    } else if (cliento) {
      fail(
        'WB-05 /boka Plan A UI',
        'Cliento widget — deploy hairtpclinic-web med ARCANA_PROVIDER=booking-engine'
      );
    } else {
      fail('WB-05 /boka Plan A UI', 'varken Plan A eller Cliento hittades i HTML');
    }
  }

  const arcAvail = await getJson(
    `${ARCANA_BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=consultation-online`
  );
  const gateClosed = arcAvail.body?.error === 'public_web_booking_disabled';
  console.log(
    `\nPort: config.publicWebBookingEnabled = ${gateClosed ? 'false (stängd)' : 'öppen eller okänd'}` +
      ` — ARCANA_PUBLIC_WEB_BOOKING_ENABLED, default true i src/config.js`
  );

  const slot = (arcAvail.body.slots || [])[0];
  if (!slot) {
    fail(
      'WB-06 Arcana slot för lead-test',
      gateClosed
        ? 'porten stängd (public_web_booking_disabled) — Plan A ej redo, ingen skrivning sker'
        : `ingen slot (HTTP ${arcAvail.status})`
    );
    process.exit(1);
  }

  if (process.env.WRITE_LEAD !== '1') {
    warn(
      'WB-07..09 hoppas över',
      'porten är öppen och nästa steg POSTar ett riktigt lead till prod — kör med WRITE_LEAD=1 om det är avsikten'
    );
    console.log('\n⚠️  Plan A-porten är ÖPPEN. Läsande del klar; skrivande del ej körd.');
    process.exit(hardFail ? 1 : 0);
  }

  const customerEmail = `web-e2e-${Date.now()}@example.com`;
  const leadPayload = {
    service: 'consultation-online',
    contact: {
      firstName: 'Webb',
      lastName: 'E2E',
      email: customerEmail,
      phone: '+46701234567',
      country: 'SE',
      city: 'Stockholm',
      consentGdpr: true,
      consentMarketing: false,
      languagePref: 'sv',
    },
    health: {},
    healthNotes: '',
    submittedAt: new Date().toISOString(),
    locale: 'sv',
    arcana: {
      slotId: slotPayload(slot).slotId,
      slotStart: slotPayload(slot).startsAt,
      slotEnd: slotPayload(slot).endsAt,
      serviceId: slotPayload(slot).serviceId,
      resourceId: slotPayload(slot).resourceId,
    },
  };

  const lead = await getJson(`${WEB_BASE}/api/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(leadPayload),
  });

  if (lead.status === 409 || lead.body?.error === 'slot_unavailable') {
    fail('WB-07 /api/lead reservation', 'slot_upptagen — försök igen');
  } else if (lead.status === 200 && lead.body.ok === true) {
    record('WB-07 /api/lead reservation', true, `mode=${lead.body.mode || '-'}`);
    if (lead.body.mode !== 'booking-engine') {
      fail(
        'WB-08 booking-engine mode',
        `fick ${lead.body.mode || 'legacy'} — /api/lead vidarebefordrar inte till Arcana`
      );
    } else {
      record('WB-08 booking-engine mode', true, `caseId=${lead.body.caseId || '-'}`);
    }
    if (!lead.body.caseId) {
      fail('WB-09 caseId', 'saknas i svar');
    } else {
      record('WB-09 caseId', true, lead.body.caseId);
    }
  } else {
    fail(
      'WB-07 /api/lead reservation',
      lead.body?.error || lead.body?.message || `HTTP ${lead.status}`
    );
  }

  if (hardFail) {
    console.log('\n❌ Plan A ÄNNU INTE REDO — se docs/strategy/cco-booking-sprint-0-checklist.md');
    console.log('   (Ett FAIL här betyder "inte skeppat", inte "bokningen är trasig".)');
    process.exit(1);
  }
  console.log('\n✅ Plan A REDO — Arcana-bryggan svarar och /boka bär Plan A-ytan');
}

main().catch((err) => {
  console.error('❌ Plan A-beredskap:', err.message || err);
  process.exit(1);
});
