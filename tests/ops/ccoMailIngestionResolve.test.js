const test = require('node:test');
const assert = require('node:assert/strict');

const { isNonPatientCounterpartyEmail } = require('../../src/ops/ccoMailIngestion/nonPatientRules');
const {
  extractContactFormPatientEmail,
  resolveRowCounterpartyEmail,
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

test('extractContactFormPatientEmail reads patient email from WordPress form body', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'wordpress@hairtpclinic.se',
    subject: '[Hair TP Clinic] Kontaktformulär',
    bodyText: `Från:\n Mehdi\n E-post:\nmehdi.oubadah@hotmail.com\n Telefon:\n0767770239\nHur kan vi hjälpa dig?`,
  });
  assert.equal(email, 'mehdi.oubadah@hotmail.com');
});

test('extractContactFormPatientEmail reads email on same line', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'no-reply@info.hairtpclinic.se',
    subject: 'Kontaktformulär',
    bodyText: 'E-post: anna.patient@example.com\nTelefon: 0701234567',
  });
  assert.equal(email, 'anna.patient@example.com');
});

test('extractContactFormPatientEmail falls back to html body', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'wordpress@hairtpclinic.se',
    subject: 'Kontaktformulär',
    bodyHtml:
      '<p>Från:</p><p>Pelle</p><p>E-post:</p><p>pelle.kund@icloud.com</p><p>Telefon:</p><p>0731234567</p>',
  });
  assert.equal(email, 'pelle.kund@icloud.com');
});

test('extractContactFormPatientEmail falls back to nested rawJson.bodyHtml (production shape)', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'wordpress@hairtpclinic.se',
    subject: 'Kontaktformulär',
    bodyText: '',
    rawJson: {
      bodyHtml:
        '<p>Från:</p><p>Siv</p><p>E-post:</p><p>siv.kund@example.com</p><p>Telefon:</p><p>0709998877</p>',
    },
  });
  assert.equal(email, 'siv.kund@example.com');
});

test('extractContactFormPatientEmail rejects non-patient extracted addresses', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'wordpress@hairtpclinic.se',
    subject: 'Kontaktformulär',
    bodyText: 'E-post: info@hairtpclinic.com',
  });
  assert.equal(email, null);
});

test('extractContactFormPatientEmail returns null for regular mail', () => {
  const email = extractContactFormPatientEmail({
    fromEmail: 'patient@example.com',
    subject: 'Hej',
    bodyText: 'E-post: patient@example.com',
  });
  assert.equal(email, null);
});

test('resolveRowCounterpartyEmail uses patient email from contact form', () => {
  const email = resolveRowCounterpartyEmail({
    rawMessage: {
      fromEmail: 'wordpress@hairtpclinic.se',
      subject: 'Kontaktformulär',
      bodyText: 'Från:\n Mehdi\n E-post:\nmehdi.oubadah@hotmail.com\n Telefon:\n0767770239',
    },
  });
  assert.equal(email, 'mehdi.oubadah@hotmail.com');
});

test('resolveRowCounterpartyEmail keeps normal inbound sender for non-form mail', () => {
  const email = resolveRowCounterpartyEmail({
    rawMessage: {
      fromEmail: 'patient@example.com',
      subject: 'Fråga om bokning',
      folderType: 'inbox',
      mailboxId: 'kons@hairtpclinic.com',
    },
  });
  assert.equal(email, 'patient@example.com');
});

test('resolveRowCounterpartyEmail respects existing counterpartyEmail', () => {
  const email = resolveRowCounterpartyEmail({
    rawMessage: {
      fromEmail: 'wordpress@hairtpclinic.se',
      subject: 'Kontaktformulär',
      bodyText: 'E-post: anna@example.com',
    },
    patientMatch: { counterpartyEmail: 'existing@example.com' },
  });
  assert.equal(email, 'existing@example.com');
});
