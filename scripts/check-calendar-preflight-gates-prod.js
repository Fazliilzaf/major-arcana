#!/usr/bin/env node
/**
 * Läser en riktig dag ur prod-kalendern och kör kalenderns EGEN preflight
 * (buildBookingSafetyPreflight ur public/cco-kalender-shell.js) mot varje slot.
 *
 * Syftet: se vad de nio grindarna faktiskt säger om riktig data — särskilt
 * grind 7 (vårdgivare) och grind 9 (provider-write) — utan att gissa utifrån
 * kodläsning och utan att klicka i UI:t.
 *
 * LÄSANDE. Skapar, ändrar och avbokar ingenting.
 *
 * Usage:
 *   DAY=2026-08-24 node scripts/check-calendar-preflight-gates-prod.js
 *   DAY=2026-08-24 CASE=<bookingCaseId> node ...   # lyft fram en viss bokning
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const DAY = process.env.DAY || new Date().toISOString().slice(0, 10);
const CASE = (process.env.CASE || '').trim();

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Laddar shellen i en VM-sandlåda — samma mönster som testharnessen. */
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

function describe(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') return `${JSON.stringify(value)}  ⟵ OBJEKT`;
  return JSON.stringify(value);
}

async function main() {
  const token = getStaffToken();
  // Shellens levande väg (rad 196): calendar-bundle. /calendar/day svarar 502.
  const url =
    `${BASE}/api/v1/cco-bookings/calendar-bundle?fromDate=${encodeURIComponent(DAY)}` +
    `&toDate=${encodeURIComponent(DAY)}`;
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

  // RIKTIGA bokningar = visits. slots är bokningsbara tider (tillgänglighet),
  // inte bokningar — de har ingen patient och ska inte granskas som bokningar.
  const raw = [].concat(body.visits || []).filter(Boolean);
  const slotCount = [].concat(body.slots || [], body.items || []).filter(Boolean).length;

  // Samma normalisering som shellens normalizeVisit (rad 160–189) — de fält
  // grindarna faktiskt läser. Medvetet ordagrann för att inte avvika.
  const slots = raw.map((visit) => ({
    ...visit,
    bookingId: visit.id,
    serviceLabel: visit.serviceName || visit.title || 'Bokning',
    treatmentPresent: Boolean(visit.serviceName || visit.title || visit.serviceId),
    resourceLabel: visit.resourceLabel || 'Ej tilldelad',
    staffName: visit.staffName || visit.staff || '',
    practitioner: visit.practitioner || visit.providerName || visit.staffName || visit.staff || '',
    startsAt: visit.startsAt || visit.startAt || '',
  }));

  console.log(`Kalender-preflight @ ${BASE}`);
  console.log(`Dag ${DAY} — ${raw.length} bokningar (visits), ${slotCount} tillgänglighetsslots\n`);

  if (!slots.length) {
    console.log('Inga bokningar (visits) denna dag. Endast tillgänglighetsslots finns.');
    process.exit(0);
  }

  const shell = loadShell();
  const picked = CASE ? slots.filter((s) => JSON.stringify(s).includes(CASE)) : slots;
  const list = picked.length ? picked : slots;

  if (CASE && !picked.length) {
    console.log(`⚠️  Hittade ingen post som nämner ${CASE} — visar alla i stället.\n`);
  }

  const summary = new Map();

  for (const slot of list.slice(0, 12)) {
    const pre = shell.buildBookingSafetyPreflight(slot);
    const label = slot.patientName || slot.title || slot.bookingId || '(namnlös)';
    console.log(`── ${label}  ·  source=${JSON.stringify(slot.source)}`);
    console.log(`   actionAllowed: ${pre.actionAllowed}`);
    console.log(
      `   råfält: practitioner=${describe(slot.practitioner)}` +
        ` staffName=${describe(slot.staffName)} providerName=${describe(slot.providerName)}` +
        ` practitionerLabel=${describe(slot.practitionerLabel)}`
    );
    for (const gate of pre.gates) {
      const mark = gate.status === 'pass' ? '✓' : '✗';
      console.log(`   ${mark} ${gate.key}`);
      const key = `${gate.key}:${gate.status}`;
      summary.set(key, (summary.get(key) || 0) + 1);
    }
    const vard = Object.fromEntries(pre.fields)['Vårdgivare'];
    console.log(`   fält Vårdgivare: ${JSON.stringify(vard)}`);
    console.log('');
  }

  console.log('── Sammanfattning per grind ──');
  for (const [key, count] of [...summary.entries()].sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
