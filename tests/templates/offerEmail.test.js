'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOfferEmail } = require('../../src/templates/offerEmail');

test('buildOfferEmail builds svensk offert med CTA-länk', () => {
  const result = buildOfferEmail({
    customerName: 'Anna Test',
    offerType: 'FUE 3000 grafts',
    amount: 65000,
    signUrl: 'https://example.com/o/abc',
    validUntil: '2026-06-30T23:00:00.000Z',
  });
  assert.match(result.subject, /Din offert/i);
  assert.match(result.subject, /FUE/);
  assert.match(result.html, /Anna/);
  assert.match(result.html, /FUE 3000 grafts/);
  assert.match(result.html, /https:\/\/example\.com\/o\/abc/);
  assert.match(result.html, /Öppna &amp; signera offert/);
  assert.match(result.text, /Anna/);
});

test('buildOfferEmail engelsk variant vid locale=en', () => {
  const result = buildOfferEmail({
    customerName: 'John Smith',
    offerType: 'FUE 3000 grafts',
    amount: 65000,
    signUrl: 'https://example.com/o/abc',
    locale: 'en',
  });
  assert.match(result.subject, /Your offer/);
  assert.match(result.html, /Open &amp; sign offer/);
  assert.match(result.text, /Open & sign offer/);
});

test('buildOfferEmail visar bilage-hint när hasAttachment=true', () => {
  const result = buildOfferEmail({
    customerName: 'Anna',
    offerType: 'PRP hår',
    amount: 4500,
    hasAttachment: true,
  });
  assert.match(result.html, /PDF-kopia/);
  assert.match(result.text, /PDF-kopia/);
});

test('buildOfferEmail amount-fallback för icke-numeriskt värde', () => {
  const result = buildOfferEmail({
    customerName: 'Anna',
    offerType: 'TP',
    amount: 'Enligt avtal',
  });
  assert.match(result.html, /Enligt avtal/);
});
