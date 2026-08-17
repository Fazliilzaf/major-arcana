'use strict';

/* CCO Mail Ingestion Review UI — granskningsyta för review-kön.
 * Läser /cco/mail-ingestion/review-queue och låter owner länka rader
 * via PATCH /cco/mail-ingestion/link-patient. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/cco-mail-ingestion-review.js'),
  'utf8'
);
const page = fs.readFileSync(
  path.join(__dirname, '../../public/cco-mail-ingestion-review.html'),
  'utf8'
);

test('HTML laddar review-JS:et', () => {
  assert.match(page, /cco-mail-ingestion-review\.js/);
});

test('JS använder rätt API-endpoints', () => {
  assert.match(source, /\/cco\/mail-ingestion/);
  assert.match(source, /\/review-queue/);
  assert.match(source, /\/review-queue\/summary/);
  assert.match(source, /\/link-patient/);
  assert.match(source, /\/resolve-unmatched-sweep/);
});

test('UI har filter för brevlåda, status och antal', () => {
  assert.match(source, /cmir-mailbox/);
  assert.match(source, /cmir-status/);
  assert.match(source, /cmir-limit/);
});

test('varje rad har patientId-input och länk-knapp', () => {
  assert.match(source, /cmir-patient-input/);
  assert.match(source, /cmir-link-btn/);
});

test('det finns dry-run och commit-knapp för sweep', () => {
  assert.match(source, /cmir-sweep-dry/);
  assert.match(source, /cmir-sweep/);
});

test('länk-anropet skickar rawMessageId och patientId', () => {
  assert.match(source, /rawMessageId/);
  assert.match(source, /patientId/);
  assert.match(source, /method:\s*['"]PATCH['"]/);
});

test('UI återanvänder befintlig review-CSS', () => {
  assert.match(page, /cco-ambiguous-mail-enrichment-review\.css/);
});

test('escapeHtml finns för att skydda mot XSS', () => {
  assert.match(source, /function escapeHtml/);
  assert.match(source, /replace\(/);
});

test('visar badge per status', () => {
  assert.match(source, /cmir-badge/);
  assert.match(source, /unmatched/);
  assert.match(source, /needs_review/);
});
