'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listSpecifications,
  getSpecification,
  resolveServiceSpecification,
  resolveSpecificationVersion,
  listServicesMissingSpecification,
  isServiceMissingSpecification,
  assertOfferSpecSatisfied,
} = require('../../src/ops/ccoTjanstespecKatalog');

test('ORD-150: 15 specar är katalograder med clinics i plural + legalReviewStatus pending', () => {
  const specs = listSpecifications();
  assert.equal(specs.length, 15);
  for (const spec of specs) {
    assert.ok(Array.isArray(spec.clinics) && spec.clinics.length > 0, `${spec.id} ska ha clinics (plural)`);
    assert.equal(spec.legalReviewStatus, 'pending', `${spec.id} ska vara pending — ingen mall godkänns av kod`);
    assert.equal(typeof spec.currentVersion, 'number', `${spec.id} ska bära currentVersion`);
  }
  // clinics: 10 curatiio + 5 hairtp.
  assert.equal(specs.filter((s) => s.clinics.includes('curatiio')).length, 10);
  assert.equal(specs.filter((s) => s.clinics.includes('hairtp')).length, 5);
});

test('ORD-150: explicit mappning — 52 tjänster kopplade, aldrig namnmatchning', () => {
  const raw = require('../../src/ops/cco-tjanstespec-katalog.json');
  assert.equal(Object.keys(raw.serviceToSpec).length, 52);

  // Tydliga fall löser till rätt spec (Botox → spec_botox, inte gissat på namn).
  assert.equal(resolveServiceSpecification('7382').id, 'spec_botox');
  assert.equal(resolveServiceSpecification('7377').id, 'spec_fillers');
  assert.equal(resolveServiceSpecification('7097').id, 'spec_tp');
  assert.equal(resolveServiceSpecification('7114').id, 'spec_prp_har');
  // En tjänst utan koppling ger null — inte en tyst gissning.
  assert.equal(resolveServiceSpecification('8694'), null); // konsultation
  assert.equal(resolveServiceSpecification('saknas'), null);
});

test('ORD-150: de 11 skägg/ögonbryn saknar spec — synligt, inte tyst', () => {
  const expected = ['7389', '7127', '7144', '7387', '7388', '7397', '7398', '7399', '7400', '7401', '7104'];
  assert.deepEqual(listServicesMissingSpecification(), expected);
  for (const id of expected) {
    assert.equal(isServiceMissingSpecification(id), true);
    assert.equal(resolveServiceSpecification(id), null);
  }
  // Konsultationer/uppföljningar är inte "saknar spec" — de är utanför mappningen avsiktligt.
  assert.equal(isServiceMissingSpecification('8694'), false);
});

test('ORD-150 §3 grinden: påstående + koppling → får skickas', () => {
  const r = assertOfferSpecSatisfied({ serviceId: '7097', makesClaim: true });
  assert.equal(r.ok, true);
  assert.equal(r.satisfied, 'linked');
  assert.equal(r.specId, 'spec_tp');
  assert.equal(r.version, 1);
});

test('ORD-150 §3 grinden: påstående + ingen koppling → BLOCKERAS (fail-closed)', () => {
  assert.throws(
    () => assertOfferSpecSatisfied({ serviceId: '7389', makesClaim: true }),
    (err) => err.code === 'OFFER_SPEC_NOT_LINKED' && err.statusCode === 403
  );
});

test('ORD-150 §3 grinden: inget påstående → får skickas även utan koppling', () => {
  const r = assertOfferSpecSatisfied({ serviceId: '7389', makesClaim: false });
  assert.equal(r.ok, true);
  assert.equal(r.satisfied, 'no_claim');
});

test('ORD-150 §2: versionen hämtas ur currentVersion (samma fält som ccoTemplateRegistry)', () => {
  assert.equal(resolveSpecificationVersion('spec_tp'), 1);
  assert.equal(resolveSpecificationVersion('spec_botox'), 1);
  assert.equal(resolveSpecificationVersion('saknas'), null);
});
