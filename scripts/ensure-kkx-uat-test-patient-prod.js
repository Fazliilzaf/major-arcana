#!/usr/bin/env node
'use strict';

/**
 * Skapar/uppdaterar UAT-testpatient för KKX Del 3 journal-arbetsyta i prod.
 * Inga riktiga personuppgifter. Bekräftad testbokning kopplas via e-post → steg 1 ✓.
 *
 * Usage: npm run ensure:kkx-uat-test-patient-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

const PATIENT_ID = process.env.KKX_UAT_PATIENT_ID || 'cco-kkx-uat-del3-a';
const DISPLAY_NAME = 'Pilotkund A · TEST – raderas efter UAT';
const PRIMARY_EMAIL = process.env.KKX_UAT_PATIENT_EMAIL || 'uat-del3-kkx@arcana.invalid';
const WORKSPACE_ID = 'major-arcana-preview';
const SERVICE_ID = process.env.KKX_UAT_BOOKING_SERVICE_ID || 'consultation-physical';

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
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

async function requestJson(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: authHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const error = new Error(
      `${method} ${route} -> ${res.status}: ${parsed.error || text.slice(0, 160)}`
    );
    error.status = res.status;
    throw error;
  }
  return parsed;
}

function dateRange() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 20);
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: sunday.toISOString().slice(0, 10),
  };
}

async function upsertPatient(token) {
  const pastVisitIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  return requestJson('PUT', '/api/v1/cco-patient-master/patient', token, {
    id: PATIENT_ID,
    patientId: PATIENT_ID,
    displayName: DISPLAY_NAME,
    firstName: 'Pilotkund A',
    lastName: 'TEST',
    primaryEmail: PRIMARY_EMAIL,
    primaryPhone: '+46000000001',
    matchStatus: 'unmatched',
    notes: 'UAT Del 3 KKX journal-arbetsyta — raderas efter UAT. Inga riktiga personuppgifter.',
    pipedrive: {
      personId: `uat-del3-${PATIENT_ID}`,
      deals: [
        {
          dealId: `uat-del3-deal-${PATIENT_ID}`,
          title: 'UAT konsultation (syntetisk)',
          status: 'won',
          wonAt: pastVisitIso,
          treatmentDate: pastVisitIso,
          value: 0,
        },
      ],
    },
  });
}

async function ensureBooking(token) {
  const conversationId = `kkx-uat-del3-${PATIENT_ID}`;
  const { fromDate, toDate } = dateRange();
  const caseQs = new URLSearchParams({
    workspaceId: WORKSPACE_ID,
    conversationId,
    customerEmail: PRIMARY_EMAIL,
    customerName: DISPLAY_NAME,
  }).toString();

  const availability = await requestJson(
    'GET',
    `/api/v1/cco-booking-engine/availability?${caseQs}&fromDate=${fromDate}&toDate=${toDate}&srvIds=${encodeURIComponent(SERVICE_ID)}`,
    token
  );
  const slot = (availability.slots || [])[0];
  if (!slot) throw new Error('Ingen ledig bokningsslot för UAT-testpatient');

  await requestJson('POST', `/api/v1/cco-booking-engine/reservations?${caseQs}`, token, {
    selectedSlots: [slot],
  });

  const confirm = await requestJson('POST', `/api/v1/cco-booking-engine/confirm?${caseQs}`, token, {
    slot,
  });
  if (normalizeKey(confirm.bookingCase?.status) !== 'confirmed_external') {
    throw new Error(`Bokning ej bekräftad: ${confirm.bookingCase?.status || 'okänd'}`);
  }
  return {
    bookingCaseId: confirm.bookingCase?.bookingCaseId || '',
    slotStartsAt: slot.startsAt || slot.startAt || slot.start || '',
    conversationId,
  };
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

async function verifyShellBooking(token) {
  const shell = await requestJson(
    'GET',
    `/api/v1/cco/staff/customers-shell?limit=20&offset=0&query=${encodeURIComponent('Pilotkund A TEST')}&includeAutomation=1`,
    token
  );
  const row = (shell.patients?.patients || []).find((item) => item.patientId === PATIENT_ID);
  if (!row) throw new Error('UAT-patient saknas i customers-shell efter upsert');
  const hasBooking = Boolean(
    row.hasUpcomingBooking ||
    row.lastVisitAt ||
    row.lastBookingAt ||
    Number(row.visitCount || row.bookingCount) > 0
  );
  return { row, hasBooking };
}

async function main() {
  console.log(`Ensure KKX UAT testpatient @ ${BASE}\n`);

  const token = getToken();
  const upsert = await upsertPatient(token);
  const savedId = upsert.patient?.id || upsert.card?.patientId || PATIENT_ID;
  console.log(`OK: patient upsertad — ${savedId}`);
  console.log(`     displayName: ${upsert.patient?.displayName || DISPLAY_NAME}`);

  const getProbe = await requestJson(
    'GET',
    `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(savedId)}&includeJournal=1`,
    token
  );
  if (!getProbe.patient?.id) throw new Error('GET patient efter upsert misslyckades');

  let bookingMeta = null;
  try {
    bookingMeta = await ensureBooking(token);
    console.log(`OK: testbokning bekräftad — ${bookingMeta.bookingCaseId}`);
    console.log(`     slot: ${bookingMeta.slotStartsAt}`);
  } catch (err) {
    console.warn(
      `WARN: kunde inte skapa ny bokning (${err.message}) — fortsätter med befintlig koppling`
    );
  }

  const { row, hasBooking } = await verifyShellBooking(token);
  console.log(
    hasBooking
      ? `OK: steg 1 signal — lastVisitAt=${row.lastVisitAt || '—'} upcoming=${row.hasUpcomingBooking || false}`
      : 'WARN: shell saknar bokningssignal (steg 1 kan vara öppen tills cache/enrichment uppdaterats)'
  );

  console.log('\n--- UAT Del 3 testpatient ---');
  console.log(`patientId: ${savedId}`);
  console.log(`displayName: ${DISPLAY_NAME}`);
  console.log(`email: ${PRIMARY_EMAIL}`);
  console.log(`staff: ${BASE}/major-arcana-preview/?view=customers&v9=on`);
  if (bookingMeta?.bookingCaseId) {
    console.log(`bookingCaseId: ${bookingMeta.bookingCaseId}`);
  }
}

main().catch((err) => {
  console.error('ensure-kkx-uat-test-patient-prod:', err.message || err);
  process.exit(1);
});
