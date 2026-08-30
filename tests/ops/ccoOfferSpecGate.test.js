'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildTreatmentAgreementHtml } = require('../../src/ops/ccoTreatmentAgreementDocument');
const { buildOfferSignPageHtml } = require('../../src/ops/ccoOfferEsign');

// ORD-150 §3 — grinden sitter på TVÅ vägar (signeringsflödet), inte på offertdokumentet.
//   buildTreatmentAgreementHtml  (ccoTreatmentAgreementDocument.js:96)
//   buildOfferSignPageHtml       (ccoOfferEsign.js:260)

test('grinden, avtalsvägen: kopplad spec → avtalet renderas', () => {
  const html = buildTreatmentAgreementHtml({
    agreement: { patientName: 'Anna', deliveryMode: 'distans' },
    commercialCase: { serviceId: '7097', offerType: 'DHI', quotedAmount: '52 000 kr' },
    origin: 'http://127.0.0.1:3100',
  });
  assert.match(html, /Behandlingsavtal/);
});

test('grinden, avtalsvägen: påstående utan koppling → BLOCKERAS', () => {
  assert.throws(
    () =>
      buildTreatmentAgreementHtml({
        agreement: { patientName: 'Anna' },
        commercialCase: { offerType: 'DHI' }, // ingen serviceId → ingen koppling
        origin: 'http://127.0.0.1:3100',
      }),
    (err) => err.code === 'OFFER_SPEC_NOT_LINKED'
  );
});

test('grinden, avtalsvägen: tjänst utan spec (skägg 7389) → BLOCKERAS', () => {
  assert.throws(
    () =>
      buildTreatmentAgreementHtml({
        agreement: { patientName: 'Anna' },
        commercialCase: { serviceId: '7389', offerType: 'Skägg' },
        origin: 'http://127.0.0.1:3100',
      }),
    (err) => err.code === 'OFFER_SPEC_NOT_LINKED'
  );
});

test('grinden, signeringsvägen: kopplad spec → sidan renderas', () => {
  const html = buildOfferSignPageHtml({
    commercialCase: { serviceId: '7097', customerName: 'Anna', quoteStatus: 'sent' },
    planSnapshot: { displayName: 'Anna', personnummer: '19960830-4698' },
    origin: 'http://127.0.0.1:3100',
  });
  assert.match(html, /Betänketid|Redo att acceptera/);
});

test('grinden, signeringsvägen: påstående utan koppling → BLOCKERAS', () => {
  assert.throws(
    () =>
      buildOfferSignPageHtml({
        commercialCase: { customerName: 'Anna', quoteStatus: 'sent' }, // ingen serviceId
        planSnapshot: { displayName: 'Anna' },
        origin: 'http://127.0.0.1:3100',
      }),
    (err) => err.code === 'OFFER_SPEC_NOT_LINKED'
  );
});

test('grinden, signeringsvägen: tjänst utan spec (ögonbryn 7104) → BLOCKERAS', () => {
  assert.throws(
    () =>
      buildOfferSignPageHtml({
        commercialCase: { serviceId: '7104', customerName: 'Anna', quoteStatus: 'sent' },
        planSnapshot: { displayName: 'Anna' },
        origin: 'http://127.0.0.1:3100',
      }),
    (err) => err.code === 'OFFER_SPEC_NOT_LINKED'
  );
});
