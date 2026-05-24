#!/usr/bin/env node
/**
 * B4 — Webb E2E verify mot hairtpclinic.com (Plan A bridge).
 *
 * Kräver Vercel env:
 *   ARCANA_BASE_URL, ARCANA_PROVIDER=booking-engine, ARCANA_BRAND_HOST
 *
 * Usage:
 *   npm run verify:booking-web-e2e-prod
 *   WEB_BASE=https://hairtpclinic.com npm run verify:booking-web-e2e-prod
 */
require('dotenv').config({ quiet: true });

const WEB_BASE = (process.env.WEB_BASE || 'https://hairtpclinic.com').replace(/\/+$/, '');
const ARCANA_BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';
const FROM = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);

const PLAN_A_MARKERS = ['Vad vill du boka?', 'Reservera tid', 'PlanABookingWizard'];
const CLIENTO_MARKERS = ['cliento.com', 'ClientoBooking', 'data-cliento'];

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
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

  console.log(`B4 webb E2E @ ${WEB_BASE} (Arcana ${ARCANA_BASE})\n`);

  const ready = await fetch(`${ARCANA_BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Arcana readyz', ready.ready === true)) hardFail = true;

  const avail = await getJson(
    `${WEB_BASE}/api/availability?fromDate=${FROM}&toDate=${TO}&serviceId=consultation-online`
  );
  if (!record('WB-01 availability HTTP', avail.status === 200, `HTTP ${avail.status}`)) {
    hardFail = true;
  } else {
    const mocked = avail.body.mocked === true;
    const slotCount = Array.isArray(avail.body.slots) ? avail.body.slots.length : 0;
    record('WB-02 availability live (mocked=false)', !mocked, mocked ? 'mock-läge — sätt ARCANA_* på Vercel' : `${slotCount} slots`);
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
      fail('WB-05 /boka Plan A UI', 'Cliento widget — deploy hairtpclinic-web med ARCANA_PROVIDER=booking-engine');
    } else {
      fail('WB-05 /boka Plan A UI', 'varken Plan A eller Cliento hittades i HTML');
    }
  }

  const arcAvail = await getJson(
    `${ARCANA_BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=consultation-online`
  );
  const slot = (arcAvail.body.slots || [])[0];
  if (!slot) {
    fail('WB-06 Arcana slot för lead-test', 'ingen slot');
    process.exit(1);
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
      fail('WB-08 booking-engine mode', `fick ${lead.body.mode || 'legacy'} — /api/lead vidarebefordrar inte till Arcana`);
    } else {
      record('WB-08 booking-engine mode', true, `caseId=${lead.body.caseId || '-'}`);
    }
    if (!lead.body.caseId) {
      fail('WB-09 caseId', 'saknas i svar');
    } else {
      record('WB-09 caseId', true, lead.body.caseId);
    }
  } else {
    fail('WB-07 /api/lead reservation', lead.body?.error || lead.body?.message || `HTTP ${lead.status}`);
  }

  if (hardFail) {
    console.log('\n❌ B4 webb E2E FAIL — se docs/strategy/cco-booking-sprint-0-checklist.md');
    process.exit(1);
  }
  console.log('\n✅ B4 webb E2E PASS — Plan A bridge live på hairtpclinic.com');
}

main().catch((err) => {
  console.error('❌ B4 webb E2E:', err.message || err);
  process.exit(1);
});
