'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMasterPatientCardLookup,
  deriveBrandFromTenant,
  deriveEncountersFromJournals,
  buildTimeline,
} = require('../../src/ops/ccoMasterPatientCardStore');

const { predictDrivePath } = require('../../src/ops/ccoDrivePathPredictor');

function fakeCustomerStore(state) {
  return {
    peekTenantCustomerState({ tenantId }) {
      if (state.tenantId === tenantId) return state.customerState;
      return null;
    },
  };
}

function fakeJournalStore(entriesByPatient) {
  return {
    async listEntries({ tenantId, patientId }) {
      return (entriesByPatient[`${tenantId}:${patientId}`] || []).slice();
    },
  };
}

test('deriveBrandFromTenant maps tenant ids to brand keys', () => {
  assert.equal(deriveBrandFromTenant('hair_tp'), 'hair_tp');
  assert.equal(deriveBrandFromTenant('curatiio'), 'curatiio');
  assert.equal(deriveBrandFromTenant('curatiio-stockholm'), 'curatiio');
  assert.equal(deriveBrandFromTenant('unknown'), 'hair_tp');
});

test('predictDrivePath returns high confidence for known Maj 2026 hair_tp', () => {
  const res = predictDrivePath({ treatmentDate: '2026-05-13', brand: 'hair_tp', treatmentType: 'tp' });
  assert.equal(res.existsConfidence, 'high');
  assert.ok(res.predictedPath.includes('Maj 2026'));
  assert.ok(res.predictedPath.includes('Maj 13'));
  assert.equal(res.driveStatus, 'pending_service_account_auth');
  assert.ok(res.searchUrl.includes('drive.google.com'));
});

test('predictDrivePath returns medium confidence for hair_tp 2026 other month', () => {
  const res = predictDrivePath({ treatmentDate: '2026-08-15', brand: 'hair_tp', treatmentType: 'tp' });
  assert.equal(res.existsConfidence, 'medium');
  assert.ok(res.predictedPath.includes('Augusti 2026'));
  assert.ok(res.predictedPath.includes('Augusti 15'));
});

test('predictDrivePath returns low confidence for old years', () => {
  const res = predictDrivePath({ treatmentDate: '2022-03-01', brand: 'hair_tp', treatmentType: 'tp' });
  assert.equal(res.existsConfidence, 'low');
  assert.ok(res.predictedPath.includes('Mars 2022'));
});

test('predictDrivePath handles missing treatmentDate gracefully', () => {
  const res = predictDrivePath({ treatmentDate: null, brand: 'hair_tp' });
  assert.equal(res.existsConfidence, 'low');
  assert.equal(res.level, 'brand_root');
});

test('predictDrivePath unknown brand returns null path', () => {
  const res = predictDrivePath({ treatmentDate: '2026-05-13', brand: 'curatiio' });
  assert.equal(res.predictedPath, null);
  assert.equal(res.existsConfidence, 'unknown');
});

test('master patient card aggregates customer + journals + drive predictions', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'p123';
  const state = {
    tenantId,
    customerState: {
      directory: {
        [patientId]: {
          name: 'Test Patient',
          meridiqMeta: { hasJournal: true, via: 'email', pnrSuffix: '1234' },
          duplicateCandidate: false,
        },
      },
      details: { [patientId]: { emails: ['test@example.com'], phone: '+46701234567' } },
      identityByKey: {},
    },
  };
  const journals = {
    [`${tenantId}:${patientId}`]: [
      {
        entryId: 'j1',
        tenantId,
        patientId,
        journalType: 'tp_treatment',
        treatmentDate: '2026-05-13',
        status: 'signed',
        signedAt: '2026-05-13T10:00:00Z',
        createdAt: '2026-05-13T09:00:00Z',
        locked: true,
      },
    ],
  };
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore(state),
    journalStore: fakeJournalStore(journals),
  });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.ok(card, 'card should be returned');
  assert.equal(card.ccoPatientId, patientId);
  assert.equal(card.meridiqRef.hasJournal, true);
  assert.equal(card.meridiqRef.pnrSuffix, '1234');
  assert.equal(card.meridiqRef.via, 'email');
  assert.equal(card.driveFolder.brand, 'hair_tp');
  assert.equal(card.driveFolder.driveStatus, 'pending_service_account_auth');
  assert.equal(card.encounters.length, 1);
  assert.equal(card.encounters[0].source, 'journal');
  assert.equal(card.encounters[0].driveExistsConfidence, 'high');
  assert.ok(card.encounters[0].predictedDrivePath.includes('Maj 13'));
  assert.equal(card.journals.length, 1);
  assert.equal(card.timeline.length, 1);
  assert.equal(card.timeline[0].type, 'journal');
});

test('master patient card returns null for unknown patient', async () => {
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore({ tenantId: 'hair_tp', customerState: { directory: {}, details: {} } }),
  });
  const card = await lookup.getCard({ tenantId: 'hair_tp', patientId: 'missing' });
  assert.equal(card, null);
});

test('master patient card summary counts patients with meridiqMeta', async () => {
  const tenantId = 'hair_tp';
  const state = {
    tenantId,
    customerState: {
      directory: {
        a: { name: 'A', meridiqMeta: { hasJournal: true } },
        b: { name: 'B', noMeridiqJournal: true },
        c: { name: 'C', meridiqMeta: { hasJournal: true }, duplicateCandidate: true },
        d: { name: 'D', driveFolderId: 'drv_xyz' },
      },
      details: {},
    },
  };
  const lookup = createMasterPatientCardLookup({ customerStore: fakeCustomerStore(state) });
  const sum = await lookup.summary({ tenantId });
  assert.equal(sum.totalPatients, 4);
  assert.equal(sum.withMeridiqMeta, 2);
  assert.equal(sum.noMeridiqJournal, 1);
  assert.equal(sum.duplicateCandidates, 1);
  assert.equal(sum.withDriveFolderId, 1);
  assert.equal(sum.driveStatus, 'pending_service_account_auth');
});

test('buildTimeline merges and sorts events by timestamp desc', () => {
  const tl = buildTimeline({
    journals: [{ entryId: 'j1', createdAt: '2026-01-01T10:00:00Z', journalType: 'tp_treatment', status: 'signed' }],
    photos: [{ photoId: 'p1', takenAt: '2026-03-15T08:00:00Z' }],
    consents: [{ consentId: 'c1', kind: 'photo', status: 'granted', updatedAt: '2026-02-01T09:00:00Z' }],
    agreements: [{ agreementId: 'a1', state: 'signed', signedAt: '2026-04-10T15:00:00Z' }],
    forms: [],
  });
  assert.equal(tl.length, 4);
  // sorted desc
  assert.equal(tl[0].type, 'agreement');
  assert.equal(tl[1].type, 'photo');
  assert.equal(tl[2].type, 'consent');
  assert.equal(tl[3].type, 'journal');
});

test('master patient card aggregates consents/agreements/forms when stores provided', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'p999';
  const state = {
    tenantId,
    customerState: {
      directory: { [patientId]: { name: 'X', meridiqMeta: {} } },
      details: { [patientId]: {} },
    },
  };
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore(state),
    journalStore: fakeJournalStore({}),
    photoStore: { async listForPatient() { return [{ photoId: 'ph1', takenAt: '2026-05-01T10:00:00Z' }]; } },
    photoConsentStore: { getConsent() { return { consentId: 'pc1', status: 'granted', updatedAt: '2026-05-02T10:00:00Z' }; } },
    marketingConsentStore: { async listForPatient() { return [{ consentId: 'mc1', status: 'granted', updatedAt: '2026-05-03T10:00:00Z' }]; } },
    agreementStore: { async listForCustomer() { return [{ agreementId: 'ag1', state: 'signed', signedAt: '2026-05-04T10:00:00Z' }]; } },
    formStore: { async listForPatient() { return [{ formId: 'fm1', type: 'health_declaration', submittedAt: '2026-05-05T10:00:00Z' }]; } },
  });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.equal(card.photos.length, 1);
  assert.equal(card.consents.length, 2);
  assert.equal(card.consents[0].kind, 'photo');
  assert.equal(card.consents[1].kind, 'marketing');
  assert.equal(card.agreements.length, 1);
  assert.equal(card.forms.length, 1);
  assert.equal(card.timeline.length, 5);
  // newest first
  assert.equal(card.timeline[0].type, 'form');
});

test('deriveEncountersFromJournals creates one encounter per journal entry', () => {
  const enc = deriveEncountersFromJournals([
    { entryId: 'e1', treatmentDate: '2026-05-01', status: 'signed', locked: true, journalType: 'tp_treatment' },
    { entryId: 'e2', createdAt: '2026-04-01T08:00:00Z', status: 'draft', locked: false, journalType: 'follow_up' },
  ]);
  assert.equal(enc.length, 2);
  assert.equal(enc[0].source, 'journal');
  assert.equal(enc[0].journalType, 'tp_treatment');
  assert.equal(enc[1].journalType, 'follow_up');
});
