'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  getSchema,
  emptyFieldsForSchema,
  resolveFormVariantFromMeridiq,
  schemaId,
} = require('../../src/ops/ccoJournalSchemas');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');

test('journal schema catalog exposes bleph_treatment curatiio_bleph from Meridiq 16388', () => {
  const schema = getSchema('bleph_treatment', 'curatiio_bleph');
  assert.ok(schema);
  assert.equal(schema.meridiqQuestionaryId, 16388);
  assert.equal(schema.fieldCount, 15);
  assert.ok(schema.emptyDefaults.fornamn === '');
  assert.ok(schema.emptyDefaults.e_postadress === null);
});

test('journal schema catalog exposes follow_up variants from Meridiq', () => {
  const fourMonth = getSchema('follow_up', '4_manader');
  const sixMonth = getSchema('follow_up', '6_manader');
  const twelveMonth = getSchema('follow_up', '12_manader');
  assert.ok(fourMonth);
  assert.ok(sixMonth);
  assert.ok(twelveMonth);
  assert.equal(fourMonth.meridiqQuestionaryId, 16407);
  assert.equal(sixMonth.meridiqQuestionaryId, 16409);
  assert.equal(twelveMonth.meridiqQuestionaryId, 16390);
  assert.equal(fourMonth.fieldCount, 8);
  assert.equal(sixMonth.fieldCount, 8);
  assert.equal(twelveMonth.fieldCount, 1);
  assert.ok(fourMonth.emptyDefaults.ser_lakningen_normal_ut === null);
});

test('journal schema catalog exposes prp_treatment variants from Meridiq', () => {
  const postOp = getSchema('prp_treatment', 'tp_post_op');
  const skin = getSchema('prp_treatment', 'prp_skin');
  assert.ok(postOp);
  assert.ok(skin);
  assert.equal(postOp.meridiqQuestionaryId, 16412);
  assert.equal(skin.meridiqQuestionaryId, 14988);
  assert.equal(postOp.fieldCount, 24);
  assert.equal(skin.fieldCount, 12);
  assert.ok(skin.emptyDefaults.vilken_behandling_utfors_vid_detta_tillfalle);
  assert.equal(Array.isArray(skin.emptyDefaults.vilken_behandling_utfors_vid_detta_tillfalle), true);
});

test('journal schema catalog exposes tp_treatment hair_tp from Meridiq 16411', () => {
  const schema = getSchema('tp_treatment', 'hair_tp');
  assert.ok(schema);
  assert.equal(schema.meridiqQuestionaryId, 16411);
  assert.equal(schema.fieldCount, 52);
  assert.equal(schema.sections.length, 7);
  assert.ok(schema.emptyDefaults.metodFue === null);
  assert.ok(schema.emptyDefaults.omradeVikar === null);
  assert.ok(schema.emptyDefaults.ytterligareOmradeText === '');
});

test('journal schema catalog exposes health_declaration hair_tp from Meridiq 16414', () => {
  const schema = getSchema('health_declaration', 'hair_tp');
  assert.ok(schema);
  assert.equal(schema.meridiqQuestionaryId, 16414);
  assert.ok(schema.emptyDefaults.rokerNikotin === null);
  assert.ok(schema.emptyDefaults.hjartKarlsjukdomText === '');
});

test('resolveFormVariantFromMeridiq maps service binding to curatiio_injection', () => {
  const variant = resolveFormVariantFromMeridiq({
    journalType: 'health_declaration',
    meridiqServiceApiId: 8694,
  });
  assert.equal(variant, 'curatiio_injection');
});

test('journal store persists formVariant and schema-backed defaults', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-schema-store-'));
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'journal.json') });
  const entry = await store.upsertEntry({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    personnummer: '19960830-4698',
    journalType: 'health_declaration',
    formVariant: 'curatiio_bleph',
    sourceQuestionaryId: 16415,
    title: 'Hälsodeklaration | Ögonlocksplastik',
    fields: {},
    actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
  });

  assert.equal(entry.formVariant, 'curatiio_bleph');
  assert.equal(entry.sourceQuestionaryId, '16415');
  assert.equal(entry.fields.kannerSigFrisk, null);
  assert.equal(schemaId(entry.journalType, entry.formVariant), 'health_declaration:curatiio_bleph');

  const prpDefaults = emptyFieldsForSchema('prp_treatment', 'prp_skin');
  assert.ok(prpDefaults.har_patientens_halsodeklaration_granskats_infor_ === null);

  const tpDefaults = emptyFieldsForSchema('tp_treatment', 'hair_tp');
  assert.ok(tpDefaults.ingreppTypFaststalld === null);
  assert.ok(tpDefaults.metodFue === null);
  assert.ok(tpDefaults.omradeKrona === null);
  assert.equal(Object.keys(tpDefaults).length, 63);
});
