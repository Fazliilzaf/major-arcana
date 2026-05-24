#!/usr/bin/env node
/**
 * Plan A curl verification (PA-21–24) against a running Arcana instance.
 * Usage: BASE=http://127.0.0.1:3099 node scripts/plan-a-verify-curl.mjs
 */
const BASE = (process.env.BASE || 'http://127.0.0.1:3099').replace(/\/+$/, '');
const HOST = process.env.HOST || 'hairtpclinic.com';
const FROM = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 21).toISOString().slice(0, 10);

function pickSlot(slots, index = 0) {
  const list = Array.isArray(slots) ? slots : [];
  return list[index] || list[0] || null;
}

function isSlotConflict(status, body) {
  if (status === 409) return true;
  const err = String(body?.error || '').toLowerCase();
  return err.includes('slot') || err.includes('ledig') || err.includes('unavailable');
}

const PLAN_A_BOOKABLE = ['consultation-online', 'consultation-physical', 'followup-transplant'];
const PLAN_A_CATALOG = [
  'consultation-online',
  'consultation-physical',
  'followup-transplant',
  'fue',
  'dhi',
  'beard',
  'eyebrow',
  'prp-hair',
  'prp-skin',
  'microneedling',
  'followup',
];

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function postJson(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function assert(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  console.log(`Plan A verify @ ${BASE} host=${HOST} ${FROM}..${TO}\n`);

  const catalog = await getJson(`/api/public/booking-engine/catalog?host=${encodeURIComponent(HOST)}`);
  const ids = (catalog.body.services || []).map((s) => s.id);
  const pa21 = assert(
    'PA-21 catalog',
    ids.length === PLAN_A_CATALOG.length && PLAN_A_CATALOG.every((id) => ids.includes(id)),
    `${ids.length} ids: ${ids.join(', ')}`
  );

  let firstSlots = {};
  for (const serviceId of PLAN_A_BOOKABLE) {
    const avail = await getJson(
      `/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=${serviceId}`
    );
    const count = (avail.body.slots || []).length;
    firstSlots[serviceId] = avail.body.slots?.[0] || null;
    assert(`PA-22 availability ${serviceId}`, count > 0, `${count} slots`);
  }

  const onlineSlot = firstSlots['consultation-online'];
  let pa23 = false;
  if (onlineSlot) {
    const slotPayload = {
      slotId: onlineSlot.slotId || onlineSlot.id,
      startsAt: onlineSlot.start || onlineSlot.startsAt,
      endsAt: onlineSlot.end || onlineSlot.endsAt,
      resourceId: onlineSlot.resourceId,
      serviceId: onlineSlot.serviceId,
    };
    const basePayload = {
      slot: slotPayload,
      consent: { gdpr: true, marketing: false },
      leadContext: { service: 'consultation-online', source: 'plan-a-verify' },
    };
    const first = await postJson(`/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`, {
      ...basePayload,
      contact: { name: 'Plan A Verify', email: `plan-a-${Date.now()}@example.com`, phone: '+46701234567' },
    });
    const second = await postJson(`/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`, {
      ...basePayload,
      contact: { name: 'Plan A Verify Dup', email: `plan-a-dup-${Date.now()}@example.com`, phone: '+46701234568' },
    });
    pa23 = assert('PA-23 reservation A1 first', first.status === 200 && first.body.ok === true)
      && assert(
        'PA-23 reservation A1 duplicate 409',
        isSlotConflict(second.status, second.body),
        `status=${second.status} error=${second.body?.error || '-'}`
      );
  } else {
    assert('PA-23 reservation A1', false, 'no slot');
  }

  for (const serviceId of ['consultation-physical', 'followup-transplant']) {
    const avail = await getJson(
      `/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=${serviceId}`
    );
    const slot = pickSlot(avail.body.slots, serviceId === 'consultation-physical' ? 1 : 2);
    if (!slot) {
      assert(`PA-24 reservation ${serviceId}`, false, 'no slot');
      continue;
    }
    const payload = {
      contact: {
        name: `Plan A ${serviceId}`,
        email: `plan-a-${serviceId}-${Date.now()}@example.com`,
        phone: '+46701234568',
      },
      slot: {
        slotId: slot.slotId || slot.id,
        startsAt: slot.start || slot.startsAt,
        endsAt: slot.end || slot.endsAt,
        resourceId: slot.resourceId,
        serviceId: slot.serviceId,
      },
      consent: { gdpr: true, marketing: false },
      leadContext: {
        service: serviceId,
        source: 'plan-a-verify',
        ...(serviceId === 'followup-transplant' ? { surgeryDate: '2024-06-01' } : {}),
      },
    };
    const res = await postJson(`/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`, payload);
    assert(`PA-24 reservation ${serviceId}`, res.status === 200 && res.body.ok === true, `status=${res.status}`);
  }

  if (!pa21) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
