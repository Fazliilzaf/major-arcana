'use strict';

/**
 * apiRequest måste överleva icke-JSON-svar.
 *
 * Live-fynd 2026-07-26: workspace-bootstrap fick HTML där JSON väntades.
 * JSON.parse kördes FÖRE response.ok-kollen, så ett 401/404 med HTML-kropp
 * kastade "Unexpected token '<'" — den riktiga statuskoden gick förlorad och
 * auth-retryn kunde aldrig trigga. Testet låser fast den defensiva parsningen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js'),
  'utf8'
);

function apiRequestImplSource() {
  const start = APP.indexOf('async function apiRequestImpl(path, options = {}) {');
  assert.ok(start > -1, 'apiRequestImpl ska finnas');
  const end = APP.indexOf('\n  function applyStudioTemplateSelection', start);
  assert.ok(end > start, 'kunde inte avgränsa apiRequestImpl');
  return APP.slice(start, end);
}

test('JSON.parse sker aldrig oskyddat före response.ok-kollen', () => {
  const source = apiRequestImplSource();

  // Den gamla, oskyddade formen får inte finnas kvar.
  assert.doesNotMatch(
    source,
    /const payload = text \? JSON\.parse\(text\) : \{\};/,
    'oskyddad JSON.parse ska vara borttagen'
  );

  // Parsningen ska ligga i try/catch och spara felet i stället för att kasta.
  assert.match(source, /try \{\s*payload = JSON\.parse\(text\);/);
  assert.match(source, /catch \(parseError\) \{[\s\S]{0,120}payloadParseError = parseError;/);
});

test('HTTP-statusen bevaras även när kroppen är HTML', () => {
  const source = apiRequestImplSource();
  // Fel-objektet ska bära statusCode och markera icke-JSON-svaret.
  assert.match(source, /error\.statusCode = response\.status;/);
  assert.match(source, /error\.nonJsonResponse = /);
  // Felmeddelandet ska nämna content-type så orsaken syns i konsolen.
  assert.match(source, /content-type/);
});

test('auth-retryn ligger kvar FÖRE felkastningen så 401 med HTML kan återhämtas', () => {
  const source = apiRequestImplSource();
  const retryIndex = source.indexOf('isAuthFailure(response.status');
  const throwIndex = source.indexOf('if (!response.ok) {');
  assert.ok(retryIndex > -1, 'auth-retryn ska finnas kvar');
  assert.ok(
    retryIndex < throwIndex,
    'retry-grenen måste utvärderas före felkastningen, annars kan 401 aldrig återhämtas'
  );
});

test('2xx med icke-JSON returnerar inte tyst ett tomt objekt', () => {
  const source = apiRequestImplSource();
  // Efter ok-kollen ska ett kvarvarande parse-fel kastas, inte returneras som {}.
  const okIndex = source.indexOf('if (!response.ok) {');
  const tail = source.slice(okIndex);
  assert.match(
    tail,
    /if \(payloadParseError\) \{[\s\S]{0,400}throw error;/,
    '2xx med trasig kropp ska kasta, inte se ut som en giltig payload'
  );
});
