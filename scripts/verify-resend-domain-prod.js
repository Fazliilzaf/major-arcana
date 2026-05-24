#!/usr/bin/env node
'use strict';

/**
 * B3b — Verify separat Resend-domän och prod-leverans.
 *
 * Checks:
 *   RB3b-01 RESEND_API_KEY finns (lokal .env eller prod reservation → provider resend)
 *   RB3b-02 Domän verifierad i Resend (GET /domains)
 *   RB3b-03 RESEND_FROM matchar verifierad domän
 *   RB3b-04 RESEND_REPLY_TO satt (svar till M365-inkorg)
 *   RB3b-05 Prod reservation använder Resend (valfritt hårt krav om STRICT=1)
 *
 * Usage:
 *   npm run verify:resend-domain-prod
 *   RESEND_API_KEY=re_... npm run verify:resend-domain-prod
 *   STRICT=1 npm run verify:resend-domain-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');
const {
  extractEmailAddress,
  resolveResendDomain,
  resolveResendFrom,
  resolveResendReplyTo,
  getResendRuntimeSummary,
} = require('../src/infra/resendConfig');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const STRICT = String(process.env.STRICT || '0').toLowerCase() === '1' || process.env.STRICT === '1';
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

async function fetchResendDomains(apiKey) {
  const res = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend domains HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body) ? body : [];
  return list;
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
      };
    }
  }
  return null;
}

async function probeProdResendProvider() {
  const avail = await getJson(
    `${BASE}/api/public/booking-engine/availability?host=${encodeURIComponent(HOST)}&fromDate=${FROM}&toDate=${TO}&srvIds=consultation-online`
  );
  const slot = (avail.body.slots || [])[0];
  if (!slot) return { ok: false, reason: 'no_slot' };

  const customerEmail = `resend-domain-verify-${Date.now()}@example.com`;
  const reservation = await postJson(
    `${BASE}/api/public/booking-engine/reservations?host=${encodeURIComponent(HOST)}`,
    {
      contact: {
        name: 'Resend Domain Verify',
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
      leadContext: { service: 'consultation-online', source: 'verify-resend-domain-prod' },
      locale: 'sv',
    }
  );

  let email = reservation.body.emailConfirmation || null;
  if (!email && reservation.status === 200) {
    await new Promise((r) => setTimeout(r, 800));
    const token = getStaffToken();
    const eventInfo = await findConfirmationEvent(token, customerEmail);
    if (eventInfo) email = { ok: true, ...eventInfo };
  }

  return {
    ok: reservation.status === 200 && reservation.body.ok === true,
    email,
    customerEmail,
  };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  const summary = getResendRuntimeSummary();
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const expectedDomain = resolveResendDomain().toLowerCase();
  const expectedFrom = resolveResendFrom();
  const expectedMailbox = extractEmailAddress(expectedFrom);
  const replyTo = resolveResendReplyTo();

  console.log(`B3b Resend domain verify @ ${BASE}\n`);
  console.log(`  domain: ${expectedDomain}`);
  console.log(`  from: ${expectedFrom}`);
  console.log(`  reply-to: ${replyTo}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  if (!apiKey) {
    warn('RB3b-01 RESEND_API_KEY', 'saknas lokalt — hoppar domän-API, testar prod provider');
  } else if (!record('RB3b-01 RESEND_API_KEY', true, 'lokal nyckel')) {
    hardFail = true;
  }

  if (!record('RB3b-04 RESEND_REPLY_TO', Boolean(replyTo), replyTo || 'saknas')) {
    hardFail = true;
  }

  if (apiKey) {
    try {
      const domains = await fetchResendDomains(apiKey);
      const match = domains.find((row) => String(row.name || '').toLowerCase() === expectedDomain);
      const status = String(match?.status || '').toLowerCase();
      if (!match) {
        fail('RB3b-02 domän i Resend', `${expectedDomain} saknas — lägg till på resend.com/domains`);
      } else if (!record('RB3b-02 domän verifierad', status === 'verified', `${expectedDomain} status=${status || 'unknown'}`)) {
        hardFail = true;
      }

      const fromDomain = extractEmailAddress(expectedFrom).split('@')[1] || '';
      if (!record('RB3b-03 from matchar domän', fromDomain === expectedDomain, expectedMailbox)) {
        hardFail = true;
      }
    } catch (err) {
      fail('RB3b-02 Resend domains API', err.message || String(err));
    }
  } else {
    warn('RB3b-02 domän i Resend', 'kräver RESEND_API_KEY lokalt');
    warn('RB3b-03 from matchar domän', 'kräver RESEND_API_KEY lokalt');
  }

  let prodProvider = 'unknown';
  try {
    const probe = await probeProdResendProvider();
    if (!probe.ok) {
      fail('RB3b-05 prod reservation', probe.reason || 'reservation_failed');
    } else {
      prodProvider = probe.email?.provider || 'unknown';
      const resendLive = prodProvider === 'resend' && probe.email?.ok !== false;
      if (resendLive) {
        record('RB3b-05 prod leverans via Resend', true, probe.email.messageId || 'sent');
      } else if (STRICT) {
        fail('RB3b-05 prod leverans via Resend', `provider=${prodProvider} (STRICT=1 kräver resend)`);
      } else {
        warn(
          'RB3b-05 prod leverans via Resend',
          `provider=${prodProvider} — Graph täcker B3; kör provision:resend-go-live-prod för B3b`
        );
      }
    }
  } catch (err) {
    fail('RB3b-05 prod probe', err.message || String(err));
  }

  if (hardFail) process.exit(1);
  if (prodProvider === 'resend') {
    console.log('\n✅ B3b Resend-domän live — separat leverans från Graph');
  } else {
    console.log('\n✅ B3b verify klar — domän/check OK; prod använder Graph tills Resend provisioneras');
  }
}

main().catch((err) => {
  console.error('❌ Resend domain verify:', err.message || err);
  process.exit(1);
});
