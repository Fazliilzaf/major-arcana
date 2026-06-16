const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeReadyForTreatment,
  isIdVerificationHardGateEnabled,
} = require('../../src/ops/ccoKunderFasAReadiness');

const baseAgreement = {
  bookable: true,
  coolingOff: { active: false },
};

const baseReadout = {
  missingHealthDeclaration: false,
  missingForm: false,
  missingJournal: false,
  todayVisit: false,
  fitnessSigned: false,
  hasJournalPhoto: false,
  photoConsent: { signed: true },
  identityVerified: false,
};

test('isIdVerificationHardGateEnabled default true unless env false', () => {
  const prev = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
  assert.equal(isIdVerificationHardGateEnabled(), true);
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'false';
  assert.equal(isIdVerificationHardGateEnabled(), false);
  if (prev === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
  else process.env.CCO_ID_VERIFICATION_HARD_GATE = prev;
});

test('computeReadyForTreatment false utan identityVerified när hard gate på', () => {
  const prev = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'true';
  assert.equal(
    computeReadyForTreatment({ ...baseReadout, identityVerified: false }, baseAgreement),
    false
  );
  if (prev === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
  else process.env.CCO_ID_VERIFICATION_HARD_GATE = prev;
});

test('computeReadyForTreatment true när identityVerified och övriga gates OK', () => {
  const prev = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'true';
  assert.equal(
    computeReadyForTreatment({ ...baseReadout, identityVerified: true }, baseAgreement),
    true
  );
  if (prev === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
  else process.env.CCO_ID_VERIFICATION_HARD_GATE = prev;
});

test('computeReadyForTreatment tillåter utan ID när hard gate av', () => {
  const prev = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'false';
  assert.equal(
    computeReadyForTreatment({ ...baseReadout, identityVerified: false }, baseAgreement),
    true
  );
  if (prev === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
  else process.env.CCO_ID_VERIFICATION_HARD_GATE = prev;
});
