'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  E8_SIGN_REGISTRY_IDS,
  isE8SignRegistry,
  resolveSignConfig,
  listE8SignRegistryIds,
  buildSignManifest,
} = require('../../src/ops/patientDocumentSignRegistry');
const { OFFERT_SLUG } = require('../../src/ops/patientDocumentLiveRegistry');

test('E8 covers 19 signera registryIds (A1–A11, A15 + hud-samtycken + Curatiio-offerter + Curatiio-friskförsäkran)', () => {
  assert.equal(E8_SIGN_REGISTRY_IDS.length, 19);
  assert.ok(isE8SignRegistry('haelso_tp_sve'));
  assert.ok(isE8SignRegistry('foto_samtycke'));
  // hud-samtycken inkopplade 2026-07-19 (ägarbeslut + medicinsk granskning godkänd)
  assert.ok(isE8SignRegistry('hyalase_info'));
  assert.ok(isE8SignRegistry('botulinum_info'));
  // ORD-164 — Curatiios friskförsäkran ska gå att signera (formVariant skiljer sig från hair_tp).
  // Varianten hette 'curatiio_op' 2026-09-01–09-02. Det namnet fanns inte i något schema —
  // det var uppfunnet här, och det här testet skrev under på det. Kanoniskt namn kommer från
  // Meridiq 16389: 'curatiio_bleph'. tests/ops/signeringsvariantHarSchema.test.js håller ihop
  // signeringsregistret med schemaregistret så att ett påhittat namn inte kan bli grönt igen.
  assert.ok(isE8SignRegistry('friskfoers_curatiio_op'));
  assert.equal(resolveSignConfig('friskfoers_curatiio_op').formVariant, 'curatiio_bleph');
  assert.equal(isE8SignRegistry('journal_tp'), false);
  assert.equal(isE8SignRegistry('ordination_recept'), false);
});

test('hud-samtycken signerar via consent_journal med Meridiq apiId', () => {
  const hy = resolveSignConfig('hyalase_info');
  assert.equal(hy.handler, 'consent_journal');
  assert.equal(hy.consentApiId, 152991);
  assert.deepEqual(hy.requiredAckSelectors, ['#consent-ack']);
  const bo = resolveSignConfig('botulinum_info');
  assert.equal(bo.handler, 'consent_journal');
  assert.equal(bo.consentApiId, 152988);
});

test('offert phase 5 disables signering', () => {
  const cfg = resolveSignConfig('offert_tp', { phase: 5 });
  assert.equal(cfg.disabled, true);
  assert.match(cfg.disabledReason, /steg 7/i);
});

test('offert phase 7 enables treatment_agreement handler', () => {
  const cfg = resolveSignConfig('offert_prp_hair', { phase: 7 });
  assert.equal(cfg.signEnabled, true);
  assert.equal(cfg.handler, 'treatment_agreement');
  assert.deepEqual(cfg.requiredAckSelectors, ['#bundle-ack', '#cooling-ack']);
});

test('all E8 ids resolve sign config', () => {
  for (const registryId of listE8SignRegistryIds()) {
    const phase = OFFERT_SLUG[registryId] ? 7 : undefined;
    const cfg = resolveSignConfig(registryId, { phase });
    assert.ok(cfg, `${registryId} saknar config`);
    assert.ok(cfg.handler, `${registryId} saknar handler`);
    if (OFFERT_SLUG[registryId]) {
      assert.equal(cfg.handler, 'treatment_agreement');
    }
  }
});

// ORD-133 la in fyra offerter i OFFERT_SLUG utan att röra E8, och då blev de
// osignerbara utan att något annat än det här testet sa ifrån. Kontrollen är
// därför riktad åt båda hållen: varje offert i live-registret ska ha en
// signeringsväg, och E8 ska inte innehålla en offert live-registret inte känner.
test('varje offert i OFFERT_SLUG har en signeringsväg i E8', () => {
  const slugIds = Object.keys(OFFERT_SLUG);
  const e8 = listE8SignRegistryIds();

  const utanSignering = slugIds.filter((id) => !e8.includes(id));
  assert.deepEqual(
    utanSignering,
    [],
    `Offerttyper i live-registret som inte går att signera: ${utanSignering.join(', ')}. ` +
      'I kundportalen ska allt signeras (ägarbeslut 2026-08-31) — lägg till dem i ' +
      'E8_SIGN_REGISTRY_IDS och SIGN_CONFIG_BY_REGISTRY.'
  );

  for (const id of slugIds) {
    const cfg = resolveSignConfig(id, { phase: 7 });
    assert.ok(cfg, `${id} saknar signeringskonfiguration`);
    assert.equal(cfg.handler, 'treatment_agreement', `${id} ska signera som avtal`);
    assert.equal(cfg.offertSlug, OFFERT_SLUG[id], `${id} bär fel offertSlug`);
  }
});

test('buildSignManifest lists all E8 rows', () => {
  const rows = buildSignManifest();
  assert.equal(rows.length, 19);
  const offertRows = rows.filter((r) => OFFERT_SLUG[r.registryId]);
  assert.equal(offertRows.length, Object.keys(OFFERT_SLUG).length);
  for (const row of offertRows) {
    assert.equal(row.signEnabledPhase7, true);
    assert.equal(row.signDisabledPhase5, true);
  }
});
