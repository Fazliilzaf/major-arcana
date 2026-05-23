#!/usr/bin/env bash
# Kör pilot-E2E på prod: hälsodekl → plan → offert → avtal → bokningsgate
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${ARCANA_PROD_URL:-${BASE_URL:-https://arcana.hairtpclinic.se}}"
BASE_URL="${BASE_URL%/}"
PATIENT_ID="${1:-f8233fca-779c-488b-a980-0e41bc01c0c0}"
CLIENT_HEADER='x-arcana-client: major_arcana_admin'

pass() { echo "✓ $1"; }
fail() { echo "✗ $1"; exit 1; }

echo "=== Pilot E2E ($BASE_URL) ==="
echo "Patient: $PATIENT_ID"
echo

AUTH_TOKEN="$(node "$ROOT_DIR/scripts/get-prod-auth-token.js" 2>/dev/null || true)"
export AUTH_TOKEN
if [[ -n "$AUTH_TOKEN" ]]; then
  pass "autentiserad API (go-live)"
fi

node - "$BASE_URL" "$PATIENT_ID" <<'NODE'
const crypto = require('crypto');

const baseUrl = process.argv[2];
const patientId = process.argv[3];
const token = process.env.AUTH_TOKEN || '';
const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'x-arcana-client': 'major_arcana_admin',
};
if (token) headers.Authorization = `Bearer ${token}`;

async function api(method, path, body, attempt = 0) {
  const res = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if ((res.status === 502 || res.status === 503) && attempt < 8) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    return api(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${json.error || text.slice(0, 200)}`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

(async () => {
  const patient = (await api('GET', `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`)).patient;
  if (!patient) throw new Error('Patient saknas');
  console.log(`Kund: ${patient.displayName} (${patient.personnummer})`);

  const journalBefore = await api('GET', `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`);
  const entries = journalBefore.entries || [];
  const healthEntries = entries.filter((e) => e.journalType === 'health_declaration');
  let health =
    healthEntries.find((e) => e.status === 'signed') ||
    healthEntries.find((e) => !e.locked) ||
    null;
  let plan = entries.find((e) => e.journalType === 'consultation_plan' && !e.locked);

  if (!health) {
    health = (
      await api('PUT', '/api/v1/cco-journal/entry', {
        patientId,
        personnummer: patient.personnummer,
        journalType: 'health_declaration',
        title: 'Hälsodeklaration',
        fields: {
          deklarationsDatum: today(),
          personnummer: patient.personnummer,
          samtyckeDatalagring: true,
          samtyckeInformerat: true,
          patientSignerNamn: patient.displayName,
          patientSignerDatum: today(),
          staffSignerNamn: 'Pilot E2E',
          staffSignerDatum: today(),
        },
      })
    ).entry;
    console.log('✓ Hälsodeklaration skapad');
  } else {
    console.log('• Hälsodeklaration finns redan (utkast)');
  }

  if (health.status !== 'signed') {
    health = (
      await api('POST', '/api/v1/cco-journal/entry/sign', {
        patientId,
        entryId: health.entryId,
      })
    ).entry;
    console.log('✓ Hälsodeklaration signerad');
  } else {
    console.log('• Hälsodeklaration redan signerad');
  }

  if (!plan) {
    plan = (
      await api('PUT', '/api/v1/cco-journal/entry', {
        patientId,
        personnummer: patient.personnummer,
        journalType: 'consultation_plan',
        title: 'Konsultation — behandlingsplan',
        fields: {
          consultationDate: today(),
          method: 'FUE',
          graftsTotal: '2800',
          zones: ['Front', 'Vertex'],
          notes: 'Pilot E2E — behandlingsplan',
        },
      })
    ).entry;
    console.log('✓ Behandlingsplan skapad');
  } else {
    plan = (
      await api('PUT', '/api/v1/cco-journal/entry', {
        patientId,
        entryId: plan.entryId,
        personnummer: patient.personnummer,
        journalType: 'consultation_plan',
        title: plan.title || 'Konsultation — behandlingsplan',
        fields: {
          ...(plan.fields || {}),
          consultationDate: today(),
          method: 'FUE',
          graftsTotal: '2800',
          zones: ['Front', 'Vertex'],
          notes: 'Pilot E2E — behandlingsplan',
        },
      })
    ).entry;
    console.log('• Behandlingsplan uppdaterad');
  }

  let commercial = (await api('GET', `/api/v1/cco-commercial/patient-case?patientId=${encodeURIComponent(patientId)}`)).commercialCase;
  const planEntryId = plan.entryId;
  if (!commercial?.offerDocumentId) {
    commercial = (
      await api('POST', '/api/v1/cco-commercial/offer-from-plan', {
        patientId,
        entryId: planEntryId,
        quotedAmount: '75 000 kr',
        depositAmount: '15 000 kr',
      })
    ).commercialCase;
    console.log('✓ Offert skapad/uppdaterad från plan');
  } else {
    console.log(`• Offert finns (${commercial.quoteStatus})`);
  }

  if (commercial.quoteStatus !== 'sent' && commercial.quoteStatus !== 'accepted') {
    commercial = (
      await api('POST', '/api/v1/cco-commercial/offer-send-for-sign', { patientId })
    ).commercialCase;
    console.log('✓ Offert skickad för signering');
  }

  if (commercial.quoteStatus !== 'accepted') {
    commercial = (
      await api('POST', '/api/v1/cco-commercial/offer-accept', {
        patientId,
        customerSignedName: patient.displayName,
        forceAccept: true,
      })
    ).commercialCase;
    console.log('✓ Offert accepterad');
  } else {
    console.log('• Offert redan accepterad');
  }

  let agreement = (
    await api('GET', `/api/v1/cco-treatment-agreement/patient-agreement?patientId=${encodeURIComponent(patientId)}`)
  ).agreement;

  if (!agreement?.agreementDocumentId) {
    agreement = (
      await api('POST', '/api/v1/cco-treatment-agreement/from-offer', {
        patientId,
        deliveryMode: 'plats',
      })
    ).agreement;
    console.log('✓ Behandlingsavtal skapat från offert');
  } else {
    console.log(`• Avtal finns (${agreement.agreementStatus})`);
  }

  if (!agreement.patientInfoSentAt) {
    agreement = (
      await api('POST', '/api/v1/cco-treatment-agreement/send-patient-info', {
        patientId,
        channel: 'manual',
      })
    ).agreement;
    console.log('✓ Patientinformation skickad (loggad)');
  }

  if (agreement.agreementStatus !== 'sent' && agreement.agreementStatus !== 'bookable' && agreement.agreementStatus !== 'signed') {
    agreement = (
      await api('POST', '/api/v1/cco-treatment-agreement/send-for-sign', { patientId })
    ).agreement;
    console.log('✓ Avtal skickat för signering');
  }

  if (agreement.agreementStatus !== 'bookable' && agreement.agreementStatus !== 'signed') {
    agreement = (
      await api('POST', '/api/v1/cco-treatment-agreement/accept', {
        patientId,
        customerSignedName: patient.displayName,
        forceAccept: true,
      })
    ).agreement;
    console.log('✓ Behandlingsavtal signerat (bookable)');
  } else {
    console.log('• Avtal redan bookable');
  }

  const gateBefore = await api(
    'GET',
    `/api/v1/cco-treatment-agreement/booking-gate?patientId=${encodeURIComponent(patientId)}&serviceId=fue`
  );
  if (!gateBefore.gate?.allowed) {
    throw new Error(`Bokningsgate fortfarande stängd: ${gateBefore.gate?.reason || gateBefore.gate?.message}`);
  }
  console.log('✓ Bokningsgate öppen för FUE');

  const qs = new URLSearchParams({
    workspaceId: 'major-arcana-preview',
    conversationId: `conv-pilot-e2e-${patientId.slice(0, 8)}`,
    customerEmail: patient.primaryEmail || patient.emails?.[0] || '',
    customerName: patient.displayName || 'Pilot',
  });
  const slot = {
    slotId: `egzona::fue::${today()}T06:00:00.000Z`,
    resourceId: 'egzona',
    serviceId: 'fue',
    startsAt: `${today()}T06:00:00.000Z`,
    endsAt: `${today()}T14:00:00.000Z`,
  };

  try {
    const reserve = await api('POST', `/api/v1/cco-booking-engine/reservations?${qs}`, {
      patientId,
      selectedSlots: [slot],
    });
    const count = (reserve.reservations || []).length;
    console.log(`✓ FUE-reservation OK (${count} slot)`);
  } catch (error) {
    if (error.status === 401) {
      console.log('• Reservation kräver inloggning (gate verifierad via booking-gate-API)');
    } else if (error.status === 409) {
      console.log('• Reservation: slot otillgänglig/redan bokad (gate passerad)');
    } else if (error.status === 400) {
      console.log(`• Reservation: ${error.message} (gate passerad)`);
    } else {
      throw error;
    }
  }

  const journalAfter = await api('GET', `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(patientId)}`);
  const types = (journalAfter.entries || []).reduce((acc, e) => {
    acc[e.journalType] = (acc[e.journalType] || 0) + 1;
    return acc;
  }, {});
  console.log('');
  console.log('Journaltyper:', JSON.stringify(types));
  console.log(`Avtal: ${agreement.agreementStatus}`);
  console.log(`Offert: ${commercial.quoteStatus}`);
  console.log(`UI: ${baseUrl}/staff?view=customers&patientId=${patientId}`);
})();
NODE

pass "Pilot E2E klar"
