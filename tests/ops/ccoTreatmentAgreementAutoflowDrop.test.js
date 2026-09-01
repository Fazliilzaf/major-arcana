'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { droppedKeys } = require('../../src/ops/ccoNormalizerDropLoud');
const { createCcoTreatmentAgreementStore } = require('../../src/ops/ccoTreatmentAgreementStore');
const { buildAutoflowAgreementInput } = require('../../src/ops/offerAutoFlow');

/**
 * ORD-160 §4 — kontrollen som saknades.
 *
 * reportDroppedKeys är no-op i produktion (ORD-145), så ett fält som
 * normaliseraren inte känner igen tappas tyst. Det här testet kör autoflödets
 * FAKTISKA indata — exporterad ur offerAutoFlow, inte en kopia — genom en riktig
 * upsert och failar om något fält försvinner.
 *
 * Historiskt tappades fem fält (serviceId, status, offerAcceptedAt,
 * customerName, metadata). Följden var ett namnlöst utkast med två dagars
 * betänketid på kirurgi. Här låses motsatsen: inget fält tappas, serviceId
 * behålls och kirurgi får sju dagar.
 */
it('autoflödets avtalsindata tappas inte av normaliseraren (ORD-160 §4)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-agreement-autoflow-'));
  const filePath = path.join(tempDir, 'cco-treatment-agreements.json');
  try {
    const store = await createCcoTreatmentAgreementStore({ filePath });

    const input = buildAutoflowAgreementInput({
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-ord160',
      serviceId: '7085', // Övre ögonlocksplastik → kirurgi
      deliveryMode: 'distans',
      customerSignedName: 'Test Person',
    });

    const out = await store.upsertAgreement(input);

    assert.deepEqual(
      droppedKeys(input, out),
      [],
      'normaliseraren tappar fält ur autoflödets indata'
    );
    assert.equal(out.serviceId, '7085', 'serviceId ska behållas (§4)');
    assert.equal(out.patientName, 'Test Person', 'patientName ska bära kundens namn');
    assert.equal(out.coolingOffDays, 7, 'kirurgi (ögonlocksplastik) ska ge sju dagar');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

/**
 * ORD-160 §4, andra vägen.
 *
 * Autoflödet var inte ensamt. Den manuella routen — `/from-offer`, den personal
 * faktiskt använder — byggde sitt draft-objekt utan `serviceId`. Ett manuellt
 * skapat ögonlocksavtal fick därför två dagars betänketid där lagen kräver sju,
 * medan autoflödet fick rätt.
 *
 * Kontrollen är källnivå och inte en riktig route-körning. Det är ett medvetet
 * avkall: att montera Express-routern med autentisering och en
 * commercial-case-fixtur kostar mer än den fångar, och det som kan gå sönder här
 * är att raden försvinner ur objektet — inte att Express beter sig oväntat.
 */
it('den manuella routen skickar med serviceId till avtalet', async () => {
  const src = await fs.readFile(
    path.join(__dirname, '..', '..', 'src', 'routes', 'ccoTreatmentAgreement.js'),
    'utf8'
  );

  const draft = src.match(/const draft = \{[\s\S]*?\n {8}\};/);
  assert.ok(draft, 'hittar inte draft-objektet i /from-offer');
  assert.match(
    draft[0],
    /serviceId:/,
    'draft-objektet saknar serviceId — storen kan då inte härleda ingreppstypen ' +
      'och faller tillbaka på två dagar, även för kirurgi'
  );
  assert.match(
    draft[0],
    /commercialCase\?\.serviceId/,
    'serviceId ska komma från det kommersiella ärendet, inte hårdkodas'
  );
});
