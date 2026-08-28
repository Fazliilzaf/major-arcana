'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAllDocumentTypes,
  getDocumentTypeById,
  filterDocumentTypes,
  resolveTypeClinics,
} = require('../../src/ops/ccoDocumentTypeRegistry');
const {
  buildPatientDocumentBundle,
  groupForType,
  typeAppliesToPatient,
} = require('../../src/ops/ccoPatientDocumentAggregator');

test('document registry exposes 58 types (56 live + 2 pending ORD-138/139)', () => {
  const types = getAllDocumentTypes();
  assert.equal(types.length, 58);
  assert.ok(getDocumentTypeById('offert_profilo'));
  assert.equal(getDocumentTypeById('offert_profilo').clinic, 'curatiio');
  // ORD-137 §1 + ORD-139 §1: pending-varianter finns men är inte live.
  assert.ok(getDocumentTypeById('auto_medical_finance_curatiio'));
  assert.ok(getDocumentTypeById('journal_estetik_follow'));
});

test('ORD-126: estetik journal types exist for curatiio', () => {
  for (const id of [
    'journal_estetik_botox',
    'journal_estetik_filler',
    'journal_estetik_profhilo',
    'journal_estetik_ortopedi',
    'journal_estetik_op',
    'friskfoers_curatiio_op',
  ]) {
    const row = getDocumentTypeById(id);
    assert.ok(row, `${id} should exist in the catalog`);
    assert.ok((row.clinics || []).includes('curatiio'), `${id} should apply to curatiio`);
  }
  const op = getDocumentTypeById('journal_estetik_op');
  assert.deepEqual(op.requiredFor, ['op_dag']);
  assert.deepEqual(getDocumentTypeById('journal_estetik_botox').requiredFor, ['behandlingsdag']);
});

test('filterDocumentTypes respects filler and flow', () => {
  const patientIntake = filterDocumentTypes({ filler: 'patient', category: 'intake' });
  assert.ok(patientIntake.length >= 4);
  assert.ok(patientIntake.every((row) => row.filler === 'patient'));
  const tpFlow = filterDocumentTypes({ flow: 'tp' });
  assert.ok(tpFlow.some((row) => row.id === 'offert_tp'));
});

test('buildPatientDocumentBundle groups documents for TP card', async () => {
  const bundle = await buildPatientDocumentBundle({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-test-1',
    card: {
      treatmentTypes: ['tp'],
      missingHealthDeclaration: true,
      hasUpcomingBooking: true,
    },
    journalEntries: [],
    documentInstanceStore: {
      listForPatient: async () => [],
    },
  });

  assert.equal(bundle.ready, true);
  assert.ok(bundle.counts.total > 0);
  assert.ok(Array.isArray(bundle.documents.offers));
  assert.ok(Array.isArray(bundle.documents.healthForms));
  assert.ok(Array.isArray(bundle.documents.journaler));
  assert.ok(Array.isArray(bundle.documents.autoDokument));
  const health = bundle.documents.healthForms.find((row) =>
    String(row.title).includes('Hälsodeklaration')
  );
  assert.equal(health?.status, 'pending');
});

test('groupForType maps offers and auto docs', () => {
  assert.equal(groupForType(getDocumentTypeById('offert_tp')), 'offers');
  assert.equal(groupForType(getDocumentTypeById('auto_bokningsbekraftelse')), 'autoDocs');
  assert.equal(groupForType(getDocumentTypeById('journal_tp')), 'journals');
});

test('ORD-133: fyra nya Curatiio-offerter är curatiio-only och gäller sitt flöde', () => {
  for (const [id, flow] of [
    ['offert_botox', 'botox'],
    ['offert_filler', 'filler'],
    ['offert_op', 'op'],
    ['offert_ortopedi', 'ortopedi'],
  ]) {
    const row = getDocumentTypeById(id);
    assert.ok(row, `${id} should exist`);
    assert.deepEqual(resolveTypeClinics(row), ['curatiio']);
    assert.equal(typeAppliesToPatient(row, {}, flow), true);
    assert.equal(typeAppliesToPatient(row, {}, 'tp'), false);
  }
});

test('ORD-133: sju Curatiio-beskrivningar finns och gäller sitt flöde', () => {
  for (const [id, flow] of [
    ['curatiio_botox_info', 'botox'],
    ['curatiio_filler_info', 'filler'],
    ['curatiio_ogonlock_info', 'op'],
    ['curatiio_ortoped_info', 'ortopedi'],
    ['curatiio_prf_hud_info', 'prf'],
    ['curatiio_profhilo_info', 'profhilo'],
    ['curatiio_prp_hud_mn_info', 'prp_skin'],
  ]) {
    const row = getDocumentTypeById(id);
    assert.ok(row, `${id} should exist`);
    assert.equal(typeAppliesToPatient(row, {}, flow), true);
    assert.equal(typeAppliesToPatient(row, {}, 'tp'), false);
  }
});

test('shared skin docs apply on both clinics; profhilo is curatiio-only', () => {
  const prpSkin = getDocumentTypeById('offert_prp_skin');
  assert.deepEqual(resolveTypeClinics(prpSkin), ['hairtp', 'curatiio']);
  assert.equal(typeAppliesToPatient(prpSkin, {}, 'prp_skin'), true);

  const profhilo = getDocumentTypeById('offert_profilo');
  assert.deepEqual(resolveTypeClinics(profhilo), ['curatiio']);
  assert.equal(typeAppliesToPatient(profhilo, {}, 'profhilo'), true);
  assert.equal(typeAppliesToPatient(profhilo, {}, 'prp_skin'), false);

  const curatiioSkin = filterDocumentTypes({ clinic: 'curatiio', flow: 'prp_skin' });
  assert.ok(curatiioSkin.some((row) => row.id === 'offert_prp_skin'));
  assert.ok(!curatiioSkin.some((row) => row.id === 'offert_tp'));
});
