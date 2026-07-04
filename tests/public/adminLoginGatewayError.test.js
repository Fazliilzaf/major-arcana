'use strict';

/* Regression — admin-inloggning dumpade hela 502-felsidans HTML i UI:t. Orsak:
 * api() gjorde `data = { error: text }` när svaret inte var JSON, så en HTML-
 * felsida (gateway 502/503/504) blev felmeddelandet och renderades som text.
 * Nu ger icke-JSON-fel ett rent, statusbaserat meddelande via describeHttpError
 * och den råa kroppen läcker aldrig ut. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(repoRoot, 'public', 'admin.js'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  let depth = 0;
  let i = src.indexOf('{', start);
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return src.slice(start, i);
}

const describeHttpError = new Function(
  extractFunction(source, 'describeHttpError') + '\nreturn describeHttpError;'
)();

test('gateway-statusar ger rent, statusbaserat meddelande', () => {
  for (const status of [502, 503, 504]) {
    const msg = describeHttpError(status);
    assert.match(msg, new RegExp('HTTP ' + status));
    assert.match(msg, /Servern svarar inte/);
  }
});

test('behörighets- och övriga statusar mappas rent', () => {
  assert.match(describeHttpError(401), /Behörighet saknas/);
  assert.match(describeHttpError(403), /Behörighet saknas/);
  assert.match(describeHttpError(404), /hittades inte/);
  assert.match(describeHttpError(429), /För många försök/);
  assert.match(describeHttpError(500), /Något gick fel \(HTTP 500\)/);
});

test('meddelandet innehåller aldrig rå markup', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.doesNotMatch(describeHttpError(status), /<!doctype|<html|<style|<head/i);
  }
});

test('api() läcker inte längre den råa svarskroppen som fel', () => {
  // Den gamla buggen: `data = { error: text }` på parse-fel.
  assert.doesNotMatch(source, /data = \{ error: text \|\| 'Ogiltigt svar\.' \}/);
  // Icke-JSON-fel går via describeHttpError.
  assert.match(source, /new Error\(apiError \|\| describeHttpError\(response\.status\)\)/);
  // Vid parse-fel behålls ingen rå kropp som data.
  assert.match(source, /parsedJson = true;/);
  assert.match(source, /return parsedJson && data \? data : \{\};/);
});
