#!/usr/bin/env node
/**
 * Verifiera bokningsbekräftelse-mail på prod — Graph send (Resend valfritt).
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';
const FROM = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function warn(name, detail = '') {
  console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function findConfirmationEvent(token, customerEmail) {
  const { body } = await getJson(
    `${BASE}/api/v1/cco-bookings/cases?customerEmail=${encodeURIComponent(customerEmail)}&limit=5&source=web`,
    { Authorization: `Bearer ${token}` }
  );
  const cases = Array.isArray(body.cases) ? body.cases : [];
  for (const bookingCase of cases) {
    const events = Array.isArray(bookingCase.events) ? bookingCase.events : [];
    const hit = events.find((event) => String(event?.type || '') === 'reservation_confirmation_sent');
    if (hit) {
      return {
        provider: hit.metadata?.provider || 'unknown',
        mode: hit.metadata?.mode || 'live',
        messageId: hit.metadata?.messageId || null,
        detail: hit.detail || '',
      };
    }
    const failed = events.find((event) => String(event?.type || '') === 'reservation_confirmation_failed');
    if (failed) {
      return {
        ok: false,
        provider: failed.metadata?.provider || 'unknown',
        error: failed.metadata?.error || failed.detail || 'failed',
      };
    }
  }
  return null;
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const token = getStaffToken();
  const statusRes = await getJson(`${BASE}/api/v1/cco/runtime/status`, {
    Authorization: `Bearer ${token}`,
  }).then((r) => r.body);

  const graphSend = statusRes.graph?.sendEnabled === true;
  const sendConnector = statusRes.graph?.sendConnectorAvailable === true;
  record('Graph sendEnabled', graphSend);
  record('Graph sendConnectorAvailable', sendConnector);

  const avail = await getJson(
    `${BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=consultation-online`
  );
  const slot = (avail.body.slots || [])[0];
  if (!slot) {
    fail('PA-25 slot', 'ingen ledig tid');
    process.exit(1);
  }

  const customerEmail = `booking-mail-verify-${Date.now()}@example.com`;
  const reservation = await postJson(
    `${BASE}/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`,
    {
      contact: {
        name: 'Plan A Verify',
        email: customerEmail,
        phone: '+46701234567',
      },
      slot: {
        slotId: slot.slotId || slot.id,
        startsAt: slot.start || slot.startsAt,
        endsAt: slot.end || slot.endsAt,
        resourceId: slot.resourceId,
        serviceId: slot.serviceId || 'consultation-online',
      },
      consent: { gdpr: true, marketing: false },
      leadContext: { service: 'consultation-online', source: 'verify-booking-mail-prod' },
      locale: 'sv',
    }
  );

  if (!record('PA-25 reservation', reservation.status === 200 && reservation.body.ok === true)) {
    hardFail = true;
  }

  let email = reservation.body.emailConfirmation || null;
  if (!email) {
    await new Promise((r) => setTimeout(r, 800));
    const eventInfo = await findConfirmationEvent(token, customerEmail);
    if (eventInfo && eventInfo.ok !== false) {
      email = { ok: true, provider: eventInfo.provider, mode: eventInfo.mode, messageId: eventInfo.messageId };
    } else if (eventInfo?.error) {
      email = { ok: false, provider: eventInfo.provider, error: eventInfo.error };
    }
  }

  if (!email) {
    fail('PA-25 mail', 'saknar emailConfirmation + booking event');
  } else if (email.provider === 'resend' && email.ok) {
    record('PA-25 bekräftelsemail (Resend)', true, email.messageId || 'sent');
  } else if (email.provider === 'graph' && email.ok) {
    record('PA-25 bekräftelsemail (Graph send)', true, email.messageId || 'sent');
  } else if (email.provider === 'graph' && !email.ok) {
    fail('PA-25 Graph send', email.error || 'send_failed');
    warn('Azure: Mail.ReadWrite eller Mail.Send + admin consent');
  } else if (email.mode === 'mock' || email.provider === 'none') {
    if (graphSend && sendConnector) {
      fail('PA-25 mail', 'mock trots Graph send — kontrollera send-allowlist');
    } else {
      fail('PA-25 mail', 'mock — ARCANA_GRAPH_SEND_ENABLED eller connector saknas');
    }
  } else {
    fail('PA-25 mail', `${email.provider || 'none'} ok=${email.ok} err=${email.error || '-'}`);
  }

  if (hardFail) process.exit(1);
  console.log('✅ Booking mail verify klar — Graph send räcker (Resend valfritt)');
}

main().catch((err) => {
  console.error('❌ Booking mail verify:', err.message || err);
  process.exit(1);
});
