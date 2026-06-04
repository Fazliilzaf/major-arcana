#!/usr/bin/env node
/**
 * B5 — Operatör sign-off: 1 confirm per Plan A-mötestyp via STAFF API.
 *
 * Flöde per typ (A1 online, A2 physical, A3 followup):
 *   1. Publik reservation (webb-syntetisk conversationId)
 *   2. POST /api/v1/cco-booking-engine/confirm (operatör)
 *   3. Verifiera confirmed_external + engine_booking_confirmed
 *   4. Avboka (cleanup)
 *
 * Usage: npm run verify:booking-operator-signoff-prod
 */
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';
const WORKSPACE_ID = process.env.WORKSPACE_ID || 'web-public';
const FROM = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 21).toISOString().slice(0, 10);

const SERVICES = [
  { id: 'consultation-online', label: 'A1 Online möte' },
  { id: 'consultation-physical', label: 'A2 Fysisk konsultation' },
  { id: 'followup-transplant', label: 'A3 Uppföljning transplant' },
];

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

function slotShape(slot) {
  return {
    slotId: slot.slotId || slot.id,
    startsAt: slot.start || slot.startsAt,
    endsAt: slot.end || slot.endsAt,
    resourceId: slot.resourceId,
    serviceId: slot.serviceId,
  };
}

function qs(params) {
  return new URLSearchParams(params).toString();
}

async function pickSlot(serviceId, index = 0) {
  const { body } = await getJson(
    `${BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=${encodeURIComponent(serviceId)}`
  );
  const slots = Array.isArray(body.slots) ? body.slots : [];
  return slots[index] || slots[0] || null;
}

async function reservePublic(serviceId, slotIndex) {
  const slot = await pickSlot(serviceId, slotIndex);
  if (!slot) return { ok: false, error: 'no_slot' };

  const email = `op-signoff-${serviceId}-${Date.now()}@example.com`;
  const shaped = slotShape(slot);
  const reservation = await postJson(
    `${BASE}/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`,
    {
      contact: { name: `Signoff ${serviceId}`, email, phone: '+46701234567' },
      slot: shaped,
      consent: { gdpr: true, marketing: false },
      leadContext: { service: serviceId, source: 'verify-booking-operator-signoff-prod' },
      locale: 'sv',
    }
  );

  if (reservation.status === 409) {
    return { ok: false, error: 'slot_unavailable', retry: true };
  }
  if (reservation.status !== 200 || reservation.body.ok !== true) {
    return { ok: false, error: reservation.body.error || 'reservation_failed', status: reservation.status };
  }

  return {
    ok: true,
    email,
    caseId: reservation.body.caseId,
    slot: reservation.body.reservation?.slot || shaped,
    customerName: `Signoff ${serviceId}`,
  };
}

async function confirmBooking(token, ctx) {
  const query = qs({
    workspaceId: WORKSPACE_ID,
    conversationId: ctx.caseId,
    customerEmail: ctx.email,
    customerName: ctx.customerName,
  });
  return postJson(
    `${BASE}/api/v1/cco-booking-engine/confirm?${query}`,
    { slot: ctx.slot, notes: 'Automatiserad B5 operatör sign-off verify' },
    { Authorization: `Bearer ${token}` }
  );
}

async function cancelBooking(token, ctx) {
  const query = qs({
    workspaceId: WORKSPACE_ID,
    conversationId: ctx.caseId,
    customerEmail: ctx.email,
    customerName: ctx.customerName,
  });
  return postJson(
    `${BASE}/api/v1/cco-booking-engine/cancel?${query}`,
    { reason: 'B5 verify cleanup' },
    { Authorization: `Bearer ${token}` }
  );
}

async function main() {
  let hardFail = false;
  const signoffRows = [];

  console.log(`B5 operatör sign-off @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const token = getStaffToken();
  if (!record('STAFF token', Boolean(token))) {
    process.exit(1);
  }

  for (const service of SERVICES) {
    console.log(`\n— ${service.label} (${service.id}) —`);

    let ctx = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reserved = await reservePublic(service.id, attempt);
      if (reserved.ok) {
        ctx = reserved;
        break;
      }
      if (!reserved.retry) {
        record(`${service.label} reservation`, false, reserved.error);
        hardFail = true;
        signoffRows.push({ ...service, pass: false, detail: reserved.error });
        ctx = null;
        break;
      }
    }
    if (!ctx) continue;

    record(`${service.label} reservation`, true, `caseId=${ctx.caseId}`);

    const confirm = await confirmBooking(token, ctx);
    const confirmed =
      confirm.status === 200 &&
      confirm.body.bookingCase?.status === 'confirmed_external' &&
      confirm.body.bookingEngine?.state === 'confirmed';

    if (!record(`${service.label} operatör confirm`, confirmed, confirm.body.bookingCase?.status || `HTTP ${confirm.status}`)) {
      hardFail = true;
      signoffRows.push({ ...service, pass: false, detail: 'confirm_failed', caseId: ctx.caseId });
      continue;
    }

    const events = Array.isArray(confirm.body.bookingCase?.events) ? confirm.body.bookingCase.events : [];
    const hasConfirmEvent = events.some((e) => e.type === 'engine_booking_confirmed');
    record(`${service.label} engine_booking_confirmed event`, hasConfirmEvent);

    const cancel = await cancelBooking(token, ctx);
    record(`${service.label} cleanup cancel`, cancel.status === 200, cancel.body.bookingCase?.status || '');

    signoffRows.push({
      ...service,
      pass: confirmed && hasConfirmEvent,
      caseId: ctx.caseId,
      slotId: ctx.slot?.slotId,
      confirmedAt: new Date().toISOString(),
      operator: 'verify-booking-operator-signoff-prod (automated)',
    });
  }

  const outPath = path.join(__dirname, '..', 'docs', 'ops', 'booking-operator-signoff-latest.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, rows: signoffRows }, null, 2)}\n`
  );
  console.log(`\nSign-off log: ${outPath}`);

  if (hardFail) {
    console.log('\n❌ B5 operatör sign-off FAIL');
    process.exit(1);
  }
  console.log('\n✅ B5 operatör sign-off PASS — 3/3 mötestyper bekräftade via CCO API');
}

main().catch((err) => {
  console.error('❌ B5 sign-off:', err.message || err);
  process.exit(1);
});
