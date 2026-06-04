'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMasterPatientCardLookup,
  deriveBrandFromTenant,
  deriveEncountersFromJournals,
  buildTimeline,
  buildMeridiqReadLink,
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

test('P0.7 — buildMeridiqReadLink masks ids and never leaks pnr', () => {
  // null cases
  assert.equal(buildMeridiqReadLink(), null);
  assert.equal(buildMeridiqReadLink({}), null);
  assert.equal(buildMeridiqReadLink({ meridiqMeta: null }), null);
  assert.equal(buildMeridiqReadLink({ meridiqMeta: {} }), null);
  assert.equal(buildMeridiqReadLink({ meridiqMeta: { meridiqPatientId: '' } }), null);

  // happy path — keeps first 2 chars, masks the rest
  assert.equal(
    buildMeridiqReadLink({ meridiqMeta: { meridiqPatientId: 'abc123def456' } }),
    'https://app.meridiq.com/clients?search=ab***'
  );
  // single-char id — kept as-is + ***
  assert.equal(
    buildMeridiqReadLink({ meridiqMeta: { meridiqPatientId: 'X' } }),
    'https://app.meridiq.com/clients?search=X***'
  );
  // fallback to .id when meridiqPatientId missing
  assert.equal(
    buildMeridiqReadLink({ meridiqMeta: { id: 'mer-9876' } }),
    'https://app.meridiq.com/clients?search=me***'
  );
  // pnrSuffix MUST NEVER appear in the link
  const link = buildMeridiqReadLink({
    meridiqMeta: { meridiqPatientId: 'm-7892', pnrSuffix: '1234' },
  });
  assert.ok(!link.includes('1234'), 'pnrSuffix must never leak into URL');
  assert.ok(!link.includes('7892'), 'full id must be masked');
});

test('P0.7 — master patient card exposes meridiqReadLink when meridiqMeta present', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'p999';
  const state = {
    tenantId,
    customerState: {
      directory: {
        [patientId]: {
          meridiqMeta: { hasJournal: true, meridiqPatientId: 'meridiq-1234', via: 'email' },
        },
      },
      details: {},
      identityByKey: {},
    },
  };
  const lookup = createMasterPatientCardLookup({ customerStore: fakeCustomerStore(state) });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.ok(card);
  assert.ok(card.meridiqRef.meridiqReadLink, 'meridiqReadLink expected on card');
  assert.match(card.meridiqRef.meridiqReadLink, /^https:\/\/app\.meridiq\.com\/clients\?search=/);
  assert.ok(!card.meridiqRef.meridiqReadLink.includes('1234'), 'full id leaked');
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

test('P0.6 — master patient card aggregates per-encounter photos by phase', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'pz';
  const state = {
    tenantId,
    customerState: {
      directory: { [patientId]: { name: 'Z', meridiqMeta: {} } },
      details: { [patientId]: {} },
    },
  };
  const journalEntry = {
    entryId: 'enc-1',
    treatmentDate: '2026-05-15',
    journalType: 'tp_treatment',
    status: 'signed',
    locked: true,
    createdAt: '2026-05-15T08:00:00Z',
  };
  const photos = [
    { photoId: 'ph-b1', type: 'before', encounterId: 'enc-1', takenAt: '2026-05-15T08:10:00Z', source: 'cco_camera' },
    { photoId: 'ph-a1', type: 'after', encounterId: 'enc-1', takenAt: '2026-05-15T12:00:00Z', source: 'cco_camera' },
    { photoId: 'ph-a2', type: 'after', encounterId: 'enc-1', takenAt: '2026-05-15T13:00:00Z', source: 'cco_camera' },
    { photoId: 'ph-ref', type: 'reference', encounterId: null, takenAt: '2026-05-10T08:00:00Z' },
  ];
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore(state),
    journalStore: fakeJournalStore({ [`${tenantId}:${patientId}`]: [journalEntry] }),
    photoStore: { async listForPatient() { return photos; } },
  });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.equal(card.encounters.length, 1);
  const enc = card.encounters[0];
  assert.equal(enc.photoCount, 3, 'should count 3 encounter-linked photos');
  assert.equal(enc.photos.before.length, 1);
  assert.equal(enc.photos.after.length, 2);
  assert.equal(enc.photos.reference.length, 0);

  // Timeline has subType for photo_taken with phase
  const photoEvents = card.timeline.filter((e) => e.type === 'photo');
  assert.equal(photoEvents.length, 4);
  assert.ok(photoEvents[0].subType.startsWith('photo_taken'));
  assert.ok(['before', 'after', 'reference'].includes(photoEvents[0].phase));
});

test('P0.3+ — master patient card exposes predicted drive-coupling on .drive', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'pdrive1';
  const state = {
    tenantId,
    customerState: {
      directory: { [patientId]: { name: 'D', meridiqMeta: { hasJournal: true } } },
      details: { [patientId]: {} },
    },
  };
  const journals = {
    [`${tenantId}:${patientId}`]: [
      {
        entryId: 'jd1',
        tenantId,
        patientId,
        journalType: 'tp_treatment',
        treatmentDate: '2026-05-13',
        status: 'signed',
        signedAt: '2026-05-13T10:00:00Z',
      },
    ],
  };
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore(state),
    journalStore: fakeJournalStore(journals),
  });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.ok(card.drive, 'card.drive should exist');
  assert.equal(card.drive.status, 'predicted');
  assert.equal(card.drive.predictionConfidence, 'high');
  assert.equal(card.drive.predictedFolderId, '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh');
  assert.ok(card.drive.predictedFolderUrl.includes('drive.google.com'));
  assert.equal(card.drive.predictionBasis, 'latest_booking_2026-05-13');
  assert.equal(card.drive.verifiedAt, null);
  assert.equal(card.drive.verifiedBy, null);
});

test('P0.3+ — master patient card returns drive.status=none for patient utan encounters', async () => {
  const tenantId = 'hair_tp';
  const patientId = 'pnone1';
  const state = {
    tenantId,
    customerState: {
      directory: { [patientId]: { name: 'N', meridiqMeta: {} } },
      details: { [patientId]: {} },
    },
  };
  const lookup = createMasterPatientCardLookup({
    customerStore: fakeCustomerStore(state),
    journalStore: fakeJournalStore({}),
  });
  const card = await lookup.getCard({ tenantId, patientId });
  assert.ok(card.drive);
  assert.equal(card.drive.status, 'none');
  assert.equal(card.drive.predictionConfidence, 'none');
  assert.equal(card.drive.predictedFolderId, null);
  assert.equal(card.drive.predictionBasis, 'no_bookings');
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
