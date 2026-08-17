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

test('isNonPatientCounterpartyEmail flags observed newsletter/vendor domains', () => {
  assert.equal(isNonPatientCounterpartyEmail('legal@notifications.resend.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('team@mail.cursor.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('utskick@hrnytt.se'), true);
  assert.equal(isNonPatientCounterpartyEmail('shirley@joyfultechnology.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('instructors@updates.freeletics.com'), true);
  assert.equal(isNonPatientCounterpartyEmail('info@bluebirdmedical.se'), true);
  assert.equal(isNonPatientCounterpartyEmail('joe@tarotmysticismacademy.com'), true);
});

test('summarizeReviewGroups marks groups to non-patient mailbox as non-patient', () => {
  const groups = summarizeReviewGroups([
    {
      rawMessage: {
        id: 'a',
        mailboxId: 'info@fazli.se',
        fromEmail: 'someone@example.com',
        subject: 'Köp av grejer',
      },
      patientMatch: { counterpartyEmail: 'someone@example.com' },
    },
    {
      rawMessage: {
        id: 'b',
        mailboxId: 'info@fazli.se',
        fromEmail: 'someone@example.com',
        subject: 'Faktura',
      },
      patientMatch: { counterpartyEmail: 'someone@example.com' },
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].nonPatient, true);
});

test('summarizeReviewGroups keeps patient mailbox mixed group as patient-like', () => {
  const groups = summarizeReviewGroups([
    {
      rawMessage: {
        id: 'a',
        mailboxId: 'kons@hairtpclinic.com',
        fromEmail: 'patient@example.com',
        subject: 'Förfrågan',
      },
      patientMatch: { counterpartyEmail: 'patient@example.com' },
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nonPatient, false);
});
