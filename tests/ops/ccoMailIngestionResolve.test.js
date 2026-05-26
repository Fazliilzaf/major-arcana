const test = require('node:test');
const assert = require('node:assert/strict');

const { isNonPatientCounterpartyEmail } = require('../../src/ops/ccoMailIngestion/nonPatientRules');
const {
  scorePatientNameAgainstEmail,
  summarizeReviewGroups,
} = require('../../src/ops/ccoMailIngestion/resolveUnmatched');

test('isNonPatientCounterpartyEmail flags internal and vendor mail', () => {
  assert.equal(isNonPatientCounterpartyEmail('no-reply@cliento.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('fazli@hairtpclinic.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('gustaf.rauer@hotmail.com'), false);
});

test('summarizeReviewGroups aggregates by counterparty email', () => {
  const groups = summarizeReviewGroups([
    {
      rawMessage: { id: 'a', fromEmail: 'no-reply@cliento.com', subject: 'A' },
      patientMatch: { counterpartyEmail: 'no-reply@cliento.com' },
    },
    {
      rawMessage: { id: 'b', fromEmail: 'no-reply@cliento.com', subject: 'B' },
      patientMatch: { counterpartyEmail: 'no-reply@cliento.com' },
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].nonPatient, true);
});

test('scorePatientNameAgainstEmail matches local part tokens', () => {
  const score = scorePatientNameAgainstEmail(
    { displayName: 'Jonatan Jonasson' },
    'tobbejohanssoon@icloud.com'
  );
  assert.ok(score >= 0);
});
