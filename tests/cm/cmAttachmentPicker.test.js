'use strict';

// ORD-117 · Tester för bilagevalet i CM-importet.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickBestAttachment,
  scoreAttachment,
  extractAmounts,
} = require('../../src/cm/cmAttachmentPicker');

test('pickBestAttachment: väljer rätt kvitto bland flera bilagor', () => {
  const attachments = [
    {
      doc: { id: 'a1', fileName: 'patientavtal.pdf' },
      text: 'Behandlingsavtal Patient: Anna Andersson',
      fileName: 'patientavtal.pdf',
    },
    {
      doc: { id: 'a2', fileName: 'faktura.pdf' },
      text: 'Faktura från Meta\nAtt betala: 7 096,00 kr',
      fileName: 'faktura.pdf',
    },
  ];
  const result = pickBestAttachment(attachments, {
    subject: 'Faktura från Facebook',
    bodyText: 'Här är fakturan för annonsering.',
    supplier: 'Meta',
    amountIncVat: 7096,
  });
  assert.equal(result.best?.id, 'a2');
  assert.ok(result.score > 50);
});

test('pickBestAttachment: markerar osäkert val när ingen bilaga stämmer', () => {
  const attachments = [
    {
      doc: { id: 'a1', fileName: 'patientavtal.pdf' },
      text: 'Behandlingsavtal Patient: Anna Andersson',
      fileName: 'patientavtal.pdf',
    },
  ];
  const result = pickBestAttachment(attachments, {
    subject: 'Faktura från Facebook',
    bodyText: 'Här är fakturan för annonsering.',
    supplier: 'Meta',
    amountIncVat: 7096,
  });
  assert.equal(result.best, null);
  assert.ok(result.reasons.includes('no_attachment_met_minimum_score'));
});

test('scoreAttachment: avdrar för patientavtal-signal', () => {
  const result = scoreAttachment({
    text: 'Behandlingsavtal\nPatient: Anna Andersson',
    fileName: 'patientavtal.pdf',
    subject: 'Faktura från Facebook',
    bodyText: '',
    supplier: 'Meta',
    amountIncVat: 7096,
  });
  assert.ok(result.score < 0);
  assert.ok(result.reasons.includes('reject_signal'));
});

test('extractAmounts: hittar belopp med svensk formatering', () => {
  const amounts = extractAmounts('Att betala: 7 096,00 kr. Rabatt: 100,00 kr.');
  assert.ok(amounts.includes(7096));
  assert.ok(amounts.includes(100));
});
