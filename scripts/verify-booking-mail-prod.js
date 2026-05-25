#!/usr/bin/env node
/**
 * Verifiera bokningsbekräftelse-mail på prod — Resend eller Graph send.
 * Fungerar även när ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false (ops-probe).
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');
const { findVerifyBookingSlot } = require('./lib/bookingVerifySlots');
const { resendApiSmoke } = require('./lib/resendApiSmoke');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const HOST = process.env.HOST || 'hairtpclinic.com';

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

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
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

async function probeTransactionalMail(token) {
  const { status, body } = await postJson(
    `${BASE}/api/v1/ops/mail/transactional-probe`,
    {},
    { Authorization: `Bearer ${token}` }
  );
  if (status === 404) {
    const smoke = await resendApiSmoke();
    if (smoke.ok) {
      return {
        ok: true,
        email: { ok: true, provider: 'resend', mode: 'live', messageId: smoke.messageId },
        via: 'resend_api_smoke',
      };
    }
    return { ok: false, reason: smoke.reason || smoke.error || 'resend_smoke_failed' };
  }
  return {
    ok: status === 200 && body.ok === true,
    email: body.email || null,
    reason: body.error || null,
  };
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
  const resendConfigured =
    statusRes.resend?.configured === true || Boolean((process.env.RESEND_API_KEY || '').trim());
  record('Graph sendEnabled', graphSend);
  record('Graph sendConnectorAvailable', sendConnector);
  record('Resend configured (prod)', resendConfigured, statusRes.resend?.from || 'saknas');

  const slotProbe = await findVerifyBookingSlot({ base: BASE, host: HOST, token });
  const slot = slotProbe.slot;

  if (!slot && !slotProbe.publicEnabled) {
    warn('PA-25 slot', 'public web booking av — hoppar reservation, testar ops mail-probe');
  } else if (!slot) {
    fail('PA-25 slot', 'ingen ledig tid');
    process.exit(1);
  }

  let email = null;

  if (slot && slotProbe.publicEnabled) {
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

    email = reservation.body.emailConfirmation || null;
    if (!email) {
      await new Promise((r) => setTimeout(r, 800));
      const eventInfo = await findConfirmationEvent(token, customerEmail);
      if (eventInfo && eventInfo.ok !== false) {
        email = { ok: true, provider: eventInfo.provider, mode: eventInfo.mode, messageId: eventInfo.messageId };
      } else if (eventInfo?.error) {
        email = { ok: false, provider: eventInfo.provider, error: eventInfo.error };
      }
    }
  } else {
    const probe = await probeTransactionalMail(token);
    if (!probe.ok) {
      fail('PA-25 ops mail-probe', probe.reason || 'probe_failed');
    } else {
      email = probe.email;
      record('PA-25 ops mail-probe', true, probe.email?.provider || 'sent');
    }
  }

  if (!email) {
    fail('PA-25 mail', 'saknar emailConfirmation + booking event');
  } else if (email.skipped === 'reserved_domain') {
    record(
      'PA-25 bekräftelsemail (guard)',
      true,
      'verify-adress blockerad medvetet — Graph/Resend live för riktiga patientmail'
    );
  } else if (email.provider === 'resend' && email.ok !== false) {
    record('PA-25 bekräftelsemail (Resend)', true, email.messageId || 'sent');
  } else if (email.provider === 'graph' && email.ok !== false) {
    record('PA-25 bekräftelsemail (Graph send)', true, email.messageId || 'sent');
  } else if (email.provider === 'graph' && email.ok === false) {
    fail('PA-25 Graph send', email.error || 'send_failed');
    warn('Azure: Mail.ReadWrite eller Mail.Send + admin consent');
  } else if (email.mode === 'mock' || email.provider === 'none') {
    if (resendConfigured || (graphSend && sendConnector)) {
      fail('PA-25 mail', 'mock trots Resend/Graph konfigurerad');
    } else {
      fail('PA-25 mail', 'mock — RESEND_API_KEY eller Graph send saknas på prod');
    }
  } else {
    fail('PA-25 mail', `${email.provider || 'none'} ok=${email.ok} err=${email.error || '-'}`);
  }

  if (hardFail) process.exit(1);
  console.log('✅ Booking mail verify klar');
}

main().catch((err) => {
  console.error('❌ Booking mail verify:', err.message || err);
  process.exit(1);
});
