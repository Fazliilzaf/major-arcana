#!/usr/bin/env node
/**
 * Skapar en bekräftad testbokning i major-arcana-preview så kalender-E2E kan klicka event.
 * Cleanup: avbokar samma ärende efter lyckad verify (sätt ARCANA_E2E_KEEP_BOOKING=1 för att behålla).
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');
const { resolveSmokePatientId } = require('./lib/resolve-smoke-patient-prod');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const WORKSPACE_ID = 'major-arcana-preview';
const SERVICE_ID = process.env.ARCANA_E2E_CALENDAR_SERVICE_ID || 'consultation-physical';
const KEEP = process.env.ARCANA_E2E_KEEP_BOOKING === '1';

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function authHeaders(token) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-arcana-client': 'major_arcana_admin',
  };
}

function dateRange() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 13);
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: sunday.toISOString().slice(0, 10),
  };
}

function qs(params) {
  return new URLSearchParams(params).toString();
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function postJson(url, payload, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function fetchPatient(token, patientId) {
  const { status, body } = await getJson(
    `${BASE}/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`,
    token
  );
  if (status !== 200) throw new Error(`patient_lookup_failed_${status}`);
  return body?.patient || body;
}

async function main() {
  const token = getStaffToken();
  const patientId = await resolveSmokePatientId({
    base: BASE,
    token,
    preferredId: process.env.ARCANA_SMOKE_PATIENT_ID || '',
  });
  const patient = await fetchPatient(token, patientId);
  const customerEmail = String(patient?.primaryEmail || patient?.email || '').trim();
  const customerName = String(patient?.displayName || patient?.name || 'E2E Kalender').trim();
  if (!customerEmail) throw new Error('Smoke-patient saknar e-post');

  const conversationId = `e2e-cal-smoke-${Date.now()}`;
  const { fromDate, toDate } = dateRange();
  const caseQs = qs({
    workspaceId: WORKSPACE_ID,
    conversationId,
    customerEmail,
    customerName,
  });

  console.log(`Seed kalender-smoke @ ${BASE}`);
  console.log(`Patient ${patientId.slice(0, 8)} · ${customerEmail}`);
  console.log(`Intervall ${fromDate} → ${toDate}\n`);

  const availability = await getJson(
    `${BASE}/api/v1/cco-booking-engine/availability?${caseQs}&fromDate=${fromDate}&toDate=${toDate}&srvIds=${encodeURIComponent(SERVICE_ID)}`,
    token
  );
  if (availability.status !== 200) {
    throw new Error(availability.body?.error || `availability_${availability.status}`);
  }
  const slot = (availability.body?.slots || [])[0];
  if (!slot) throw new Error('Ingen ledig slot i intervallet');

  const reserve = await postJson(
    `${BASE}/api/v1/cco-booking-engine/reservations?${caseQs}`,
    { selectedSlots: [slot] },
    token
  );
  if (reserve.status !== 200) {
    throw new Error(reserve.body?.error || `reserve_${reserve.status}`);
  }

  const confirm = await postJson(
    `${BASE}/api/v1/cco-booking-engine/confirm?${caseQs}`,
    { slot },
    token
  );
  if (confirm.status !== 200 || confirm.body?.bookingCase?.status !== 'confirmed_external') {
    throw new Error(confirm.body?.error || `confirm_${confirm.status}`);
  }

  const bookingCaseId = confirm.body?.bookingCase?.bookingCaseId || '';
  const slotIso = String(slot.startsAt || slot.startAt || slot.start || '').slice(0, 10);
  console.log('OK: Testbokning bekräftad');
  console.log(`  bookingCaseId: ${bookingCaseId}`);
  console.log(`  slot: ${slotIso} ${slot.startsAt || slot.startAt || ''}`);
  console.log(`  conversationId: ${conversationId}`);

  if (!KEEP) {
    const cancel = await postJson(
      `${BASE}/api/v1/cco-booking-engine/cancel?${caseQs}`,
      { reason: 'E2E calendar smoke cleanup' },
      token
    );
    if (cancel.status === 200) {
      console.log('\nOK: Testbokning avbokad (cleanup). Sätt ARCANA_E2E_KEEP_BOOKING=1 för att behålla.');
    } else {
      console.warn('\nWARN: Cleanup misslyckades — behåll manuellt eller avboka i UI.', cancel.body?.error);
    }
  } else {
    console.log('\nBehåller bokning (ARCANA_E2E_KEEP_BOOKING=1). Öppna kalendern för smoke.');
  }
}

main().catch((err) => {
  console.error('Seed kalender-smoke misslyckades:', err.message || err);
  process.exit(1);
});
