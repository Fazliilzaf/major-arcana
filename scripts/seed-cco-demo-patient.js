#!/usr/bin/env node
'use strict';

/**
 * Seed CCO full-data demo-patient — skriver en RIK patient direkt i patient-
 * master-storen så stora kundvyn (CcoV12Canon) renderar med riktig aggregerad
 * data: HD 9-svar, allergier → varningar/risker, ekonomi, taggar, blockerare.
 *
 * Användning:
 *   node scripts/seed-cco-demo-patient.js                         # config.ccoPatientMasterStorePath
 *   SEED_TENANT_ID=<tenant> node scripts/seed-cco-demo-patient.js # annan tenant
 *   PATIENT_STORE_PATH=/tmp/x.json node scripts/seed-cco-demo-patient.js  # test/torr-körning
 *
 * OBS: Bokningar, journal och foton ligger i SEPARATA stores (booking/asset/
 * journal) och seedas inte här — de fylls via respektive ingest/bokningsflöde.
 * Detta skript ger kort-/hälso-/ekonomi-/varnings-datan som canon läser ur cardet.
 *
 * Aktivera mejl-preview (s10) i drift: sätt env ARCANA_GRAPH_READ_ENABLED=true +
 * ARCANA_GRAPH_TENANT_ID / _CLIENT_ID / _CLIENT_SECRET / _USER_ID (M365). Utan
 * dessa visar s10 tomt (ingen fejk) — koden är redo och väntar på creds.
 */

const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const config = require('../src/config');

const TENANT = process.env.SEED_TENANT_ID || 'demo-clinic';
const STORE = process.env.PATIENT_STORE_PATH || config.ccoPatientMasterStorePath;
const PATIENT_ID = 'cco-demo-anna';

const patient = {
  tenantId: TENANT,
  id: PATIENT_ID,
  displayName: 'Anna Karlsson',
  primaryEmail: 'anna.k@exempel.se',
  primaryPhone: '070-123 45 67',
  emails: ['anna.k@exempel.se'],
  phones: ['070-123 45 67'],
  tags: ['VIP', 'PRP-hår', 'Botox', 'Återkommande'],
  allergies: ['Penicillin'],
  lifetimeValue: 38400,
  lifetimeValueLabel: '~58 000',
  visitCount: 3,
  visitsThisYear: 12,
  totalValue: '38 400',
  outstandingBalance: '0 kr',
  // Blockerare/varningar i aktivt-besök + kritiska varningar:
  missingFitnessCertificate: true,
  missingPhotoConsent: true,
  healthDeclaration: {
    signedAt: '2026-06-12',
    source: 'halso_mailbox',
    allergies: ['Penicillin'],
    medications: 'Levaxin 50µg, Vitamin D',
    flags: [
      { key: 'bleeding', text: 'Blödarsjukdom', level: 'amber' },
      { key: 'hair_treatment', text: 'Pågående hårbehandling', level: 'amber' },
    ],
    answers: [
      { key: 'allergi', label: 'Allergier', value: 'Ja', detail: 'Penicillin', risk: 'red' },
      { key: 'blodfortunnande', label: 'Blodförtunnande', value: 'Nej', detail: '', risk: '' },
      { key: 'medicin', label: 'Pågående mediciner', value: 'Ja', detail: '2 st', risk: 'amber' },
      { key: 'hjartkarl', label: 'Hjärt-/kärlsjukdom', value: 'Nej', detail: '', risk: '' },
      { key: 'stralning', label: 'Strålning/kemo', value: 'Nej', detail: '', risk: '' },
      { key: 'gravid', label: 'Graviditet / amning', value: 'Nej', detail: '', risk: '' },
      { key: 'blodarsjukdom', label: 'Blödarsjukdom', value: 'Ja', detail: '', risk: 'amber' },
      { key: 'sarskador', label: 'Sårskador / blödning', value: 'Ja', detail: '', risk: 'amber' },
      {
        key: 'harbehandling',
        label: 'Pågående hårbehandling',
        value: 'Ja',
        detail: '',
        risk: 'amber',
      },
    ],
  },
};

(async () => {
  const store = await createCcoPatientMasterStore({ filePath: STORE });
  await store.upsertPatient(patient);
  const read = await store.getPatient({ tenantId: TENANT, patientId: PATIENT_ID });
  const hd = (read && read.healthDeclaration && read.healthDeclaration.answers) || [];
  const card =
    typeof store.buildPatientCardReadout === 'function'
      ? store.buildPatientCardReadout(read)
      : read;
  const cardHd = (card && card.healthDeclaration && card.healthDeclaration.answers) || [];
  console.log(
    '✓ seedad:',
    read && read.displayName,
    '· HD-svar (lagrade/i card):',
    hd.length + '/' + cardHd.length,
    '· allergier:',
    (read.allergies || []).length,
    '· tenant:',
    TENANT,
    '\n  store:',
    STORE
  );
  if (hd.length !== 9 || cardHd.length !== 9) {
    console.error('✗ Förväntade 9 HD-svar i både store och card, fick', hd.length, cardHd.length);
    process.exit(1);
  }
})().catch((e) => {
  console.error('seed-fel:', e && e.message);
  process.exit(1);
});
