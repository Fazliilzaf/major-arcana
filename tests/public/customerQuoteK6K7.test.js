'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const quotePath = path.join(__dirname, '..', '..', 'public', 'customer-quote.html');

test('customer quote demo uses Hair TP 2-day offer timeline copy', () => {
  const source = fs.readFileSync(quotePath, 'utf8');

  assert.match(source, /Betänketid 2 kalenderdagar/);
  assert.match(source, /Hair TP:s operativa betänketid är 2 kalenderdagar/);
  assert.match(source, /tjänstespecifikation, patientinformation och offertunderlag/);
  assert.match(source, /Från 2026-05-22/);
  assert.doesNotMatch(source, /Betänketid 14 dagar/);
  assert.doesNotMatch(source, /14 dagars betänketid/);
});
