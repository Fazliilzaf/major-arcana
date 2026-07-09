#!/usr/bin/env node
'use strict';

/**
 * Skapar/uppdaterar UAT-testpatienten för kundportalens BankID-inloggning (nivå 2)
 * DURABELT på prod (skrivs till /var/data via patient-master-API:t → överlever
 * redeploy). Fixar `l2=pnr_unmatched` som uppstår om patienten wipeats.
 *
 * Personnumret MÅSTE matcha det du signerar med i Idura test-eID
 * ("Generate your own test-user"), annars nekar owner-checken.
 *
 * Usage:
 *   ARCANA_SMOKE_BEARER_TOKEN=<owner> \
 *   node scripts/ensure-portal-bankid-uat-patient-prod.js
 *
 * Inga riktiga personuppgifter — syntetisk UAT-patient, raderas efter test.
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

// Samma id + pnr som den myntade portal-token pekar på.
const PATIENT_ID = process.env.PORTAL_UAT_PATIENT_ID || '11a2da19-5813-4ea6-8229-862a93de3cc5';
const PNR = process.env.PORTAL_UAT_PNR || '19781015-2384';
const DISPLAY_NAME = process.env.PORTAL_UAT_NAME || 'Portal BankID UAT · TEST – raderas efter UAT';
const PRIMARY_EMAIL = process.env.PORTAL_UAT_EMAIL || 'uat-portal-bankid@arcana.invalid';

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

async function upsertPatient(token) {
  return requestJson('PUT', '/api/v1/cco-patient-master/patient', token, {
    id: PATIENT_ID,
    patientId: PATIENT_ID,
    displayName: DISPLAY_NAME,
    firstName: 'Portal',
    lastName: 'BankID UAT',
    personnummer: PNR, // matchas av resolvePatientByPnr vid BankID-login
    primaryEmail: PRIMARY_EMAIL,
    matchStatus: 'unmatched',
    notes: 'UAT kundportal BankID nivå-2 — raderas efter test. Inga riktiga personuppgifter.',
  });
}

async function main() {
  console.log(`Ensure portal-BankID UAT-patient @ ${BASE}\n`);
  const token = getToken();

  const upsert = await upsertPatient(token);
  const savedId = upsert.patient?.id || upsert.card?.patientId || PATIENT_ID;
  console.log(`OK: patient upsertad (durabelt via /var/data) — ${savedId}`);

  // Verifiera att den nu finns (404 → 200).
  const getProbe = await requestJson(
    'GET',
    `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(savedId)}`,
    token
  );
  if (!getProbe.patient?.id)
    throw new Error('GET patient efter upsert misslyckades (fortfarande 404?)');
  console.log(
    `OK: GET patient → 200 (personnummer satt: ${Boolean(getProbe.patient?.personnummer)})`
  );

  // Rapportera offert-läget (read-only).
  const caseProbe = await requestJson(
    'GET',
    `/api/v1/cco-commercial/patient-case?patientId=${encodeURIComponent(savedId)}`,
    token
  );
  const c = caseProbe.commercialCase;
  console.log(
    c
      ? `INFO: offert finns — quoteStatus=${c.quoteStatus}, hasOfferPlan=${Boolean(c.offerPlan)}`
      : 'INFO: ingen offert än (commercialCase: null) — /me visar tomt offert-läge tills den seedas'
  );

  console.log('\n--- Patienten är nu durabel. Nästa steg för offerten ---');
  console.log('Ingen ren HTTP-route finns för direkt upsert av patient-register-offerten.');
  console.log('På en KÖRANDE prod-instans (Render shell), kör:');
  console.log(`
  await app.locals.ccoCommercialStore.upsertCase({
    tenantId: '<tokenens tenant, t.ex. hair-tp-clinic>',
    workspaceId: 'major-arcana-preview',
    conversationId: 'patient-register',
    customerId: '${PATIENT_ID}',
    offerPlan: { method: 'DHI', treatmentLabel: 'DHI — Hårlinje',
      price: { quotedAmount: '75 000 kr', depositAmount: '15 000 kr', currency: 'SEK' } },
    quoteStatus: 'sent',
    coolingOffEndsAt: new Date(Date.now() - 86400000).toISOString(),
  });`);
  console.log('\nSedan: BankID-login (Generate your own test-user, pnr ' + PNR + ') → l2=ok →');
  console.log('offertkort + "Signera offerten" + /me hasOffer:true, canAccept:true.');
}

main().catch((err) => {
  console.error('ensure-portal-bankid-uat-patient-prod:', err.message || err);
  process.exit(1);
});
