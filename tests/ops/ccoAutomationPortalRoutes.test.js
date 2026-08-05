'use strict';

/**
 * SIGNALERNA FÖR STEG 5 OCH 7 SKA VARA KLICKBARA.
 *
 * Offert (steg 5) och avtal + samtycke (steg 7) hanteras redan av
 * kundportalen cco-patient-offer-portal-v3, som kunden når via ett esignToken
 * per ärende. Token är per kund — portalens URL kan därför inte ligga
 * statiskt i en regel.
 *
 * Rätt mål för suggestedRoute är PERSONALENS yta: kundens workspace, där
 * offerten skapas och portaldelningen utlöses. Samma mönster som registrets
 * övriga rutter — sökvägen slutar med parameternamnet så att konsumenten
 * hänger på patient-id:t.
 *
 * Ingenting här skickar något automatiskt. Regeln blir en klickbar väg till
 * rätt arbetsyta, inget mer: humanApprovalRequired ska ligga kvar, och
 * runnerns dryRun-fält är orört.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { RULES } = require('../../src/ops/ccoAutomationRegistry');

function rule(id) {
  const found = (RULES || []).find((item) => item.id === id);
  assert.ok(found, `regeln ${id} ska finnas i registret`);
  return found;
}

const WORKSPACE_ROUTE = '/major-arcana-preview/?view=customers&workspace=1&patientId=';

test('missing_treatment_plan pekar på personalens workspace', () => {
  const r = rule('customer.missing_treatment_plan');
  assert.equal(r.suggestedRoute, WORKSPACE_ROUTE);
  // Skyddet mot automatiska utskick ska vara orört.
  assert.equal(r.humanApprovalRequired, true);
  assert.equal(r.risk, 'blocker');
});

test('missing_agreement_consent_bundle pekar på personalens workspace', () => {
  const r = rule('customer.missing_agreement_consent_bundle');
  assert.equal(r.suggestedRoute, WORKSPACE_ROUTE);
  assert.equal(r.humanApprovalRequired, true);
  assert.equal(r.risk, 'legal_blocker');
});

test('rutten slutar med parameternamn, som registrets övriga rutter', () => {
  // Konsumenten hänger på patient-id sist. En route som inte slutar med '='
  // ger en trasig länk för varje kund.
  for (const id of [
    'customer.missing_treatment_plan',
    'customer.missing_agreement_consent_bundle',
  ]) {
    assert.match(rule(id).suggestedRoute, /=$/, `${id}: rutten ska sluta med '='`);
  }
});

test('inga andra regler ändrades', () => {
  // Övriga åtta regler behåller sina rutter (tre satta, fem null).
  const forvantat = {
    'customer.missing_health_declaration': null,
    'customer.missing_journal': '/journal-feed-demo.html?customerId=',
    'customer.cooling_off_active': null,
    'customer.cooling_off_passed': null,
    'customer.missing_operation_day_insurance': null,
    'customer.missing_photo_consent': null,
    'customer.has_photo_review': '/photo-review.html?focusPatientId=',
    'customer.ready_for_treatment': '/kalender.html?patientId=',
  };
  for (const [id, route] of Object.entries(forvantat)) {
    assert.equal(rule(id).suggestedRoute, route, `${id} ska vara orörd`);
  }
});
