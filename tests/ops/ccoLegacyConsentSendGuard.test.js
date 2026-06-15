'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertLegacyConsentSendAllowed,
  isLegacyTreatmentConsentSend,
} = require('../../src/ops/ccoLegacyConsentSendGuard');

test('legacy consent-send tillåter foto-samtycke', () => {
  assert.equal(isLegacyTreatmentConsentSend({ consentKind: 'photo_publish' }), false);
  assert.doesNotThrow(() =>
    assertLegacyConsentSendAllowed({ consentKind: 'photo_publish', templateRef: 'photo' })
  );
});

test('legacy consent-send blockerar behandlingsavtal och Meridiq-consent separat från bundle', () => {
  for (const body of [
    { consentKind: 'treatment_agreement' },
    { consentKind: 'consent_bundle' },
    { templateRef: 'meridiq_consent_behandlingsavtal_hair_tp_170917' },
    { consentApiId: 170917 },
  ]) {
    assert.equal(isLegacyTreatmentConsentSend(body), true);
    assert.throws(
      () => assertLegacyConsentSendAllowed(body),
      (error) =>
        error.statusCode === 409 && error.metadata?.code === 'treatment_agreement_bundle_required'
    );
  }
});
