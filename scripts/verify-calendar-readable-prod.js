#!/usr/bin/env node
/**
 * Verifierar att CCO-kalendern är läsbar mot prod: antal bokningar per
 * provider (cliento / cco_engine), kundkoppling (patientId), och en
 * sammanfattning av vilka bokningar som är skrivbara enligt kalenderns
 * egen preflight (9 grindar i public/cco-kalender-shell.js).
 *
 * LÄSANDE. Skapar, ändrar och avbokar ingenting.
 *
 * Usage:
 *   FROM=2026-08-24 TO=2026-08-31 node scripts/verify-calendar-readable-prod.js
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const FROM = process.env.FROM || new Date().toISOString().slice(0, 10);
const TO = process.env.TO || FROM;

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function loadShell() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public/cco-kalender-shell.js'),
    'utf8'
  );
  const sandbox = {
    window: {},
    document: { readyState: 'loading', addEventListener() {} },
    console,
    Date,
    Intl,
    Map,
    Set,
    URLSearchParams,
    fetch: () => Promise.reject(new Error('ingen nätverksåtkomst i sandlådan')),
  };
  vm.runInNewContext(`${source}\n;this.exports = window.CcoKalenderShell;`, sandbox);
  return sandbox.exports;
}

async function main() {
  const token = getStaffToken();
  const url = `${BASE}/api/v1/cco-bookings/calendar-bundle?fromDate=${encodeURIComponent(FROM)}&toDate=${encodeURIComponent(TO)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ calendar-bundle HTTP ${res.status}`, JSON.stringify(body).slice(0, 300));
    process.exit(1);
  }

  const visits = [].concat(body.visits || []).filter(Boolean);
  const slots = [].concat(body.slots || []).filter(Boolean);

  console.log(`Kalender läsbar @ ${BASE}`);
  console.log(`Period ${FROM} → ${TO}`);
  console.log(`Bokningar (visits): ${visits.length}  ·  Tillgänglighetsslots: ${slots.length}\n`);

  const byProvider = {};
  const withoutPatient = [];
  for (const v of visits) {
    const src = String(v.source || 'okänd').toLowerCase();
    byProvider[src] = (byProvider[src] || 0) + 1;
    if (!v.patientId) withoutPatient.push(v.patientName || v.id || '(namnlös)');
  }
  console.log('Per provider:');
  for (const [k, n] of Object.entries(byProvider).sort()) console.log(`  ${k}: ${n}`);
  console.log(
    `\nBokningar utan kanonisk patientId: ${withoutPatient.length}${withoutPatient.length ? ' — ' + withoutPatient.join(', ') : ''}`
  );

  if (visits.length) {
    const shell = loadShell();
    const gates = new Map();
    let writable = 0;
    for (const v of visits) {
      const norm = {
        ...v,
        bookingId: v.id,
        serviceLabel: v.serviceName || v.title || 'Bokning',
        treatmentPresent: Boolean(v.serviceName || v.title || v.serviceId),
        resourceLabel: v.resourceLabel || 'Ej tilldelad',
        staffName: v.staffName || v.staff || '',
        practitioner: v.practitioner || v.providerName || v.staffName || v.staff || '',
        startsAt: v.startsAt || v.startAt || '',
      };
      const pre = shell.buildBookingSafetyPreflight(norm);
      if (pre.actionAllowed) writable += 1;
      for (const g of pre.gates) {
        const key = `${g.key}:${g.status}`;
        gates.set(key, (gates.get(key) || 0) + 1);
      }
    }
    console.log(`\nSkrivbara (alla 9 grindar pass): ${writable} av ${visits.length}`);
    console.log('Preflight per grind:');
    for (const [k, n] of [...gates.entries()].sort()) console.log(`  ${k}: ${n}`);
  }
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
