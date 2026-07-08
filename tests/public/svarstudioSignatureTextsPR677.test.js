'use strict';

/* PR 677 — Svarstudions signaturval använder klinikens riktiga v9-uppgifter.
 * Låser bort de gamla placeholder-uppgifterna från admin#cco utan att röra
 * live-send eller rik HTML-signatur. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'), 'utf8');

test('PR677: Svarstudio-signaturerna använder riktiga v9-uppgifter', () => {
  for (const expected of [
    'Bästa hälsningar,',
    'Fazli Krasniqi',
    'Egzona Krasniqi',
    'Hårspecialist | Hårtransplantationer & PRP-injektioner',
    '031-88 11 66',
    'contact@hairtpclinic.com',
    'Vasaplatsen 2, 411 34 Göteborg',
    'hairtpclinic.com',
  ]) {
    assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('PR677: gamla placeholder-signaturer är borta från Svarstudio', () => {
  for (const stale of [
    'Dr. Fazli',
    'Medical Director',
    'Egzona M.',
    'Customer Lead',
    'Sveavägen 42',
    '113 50 Stockholm',
    '08-555 123 45',
  ]) {
    assert.doesNotMatch(source, new RegExp(stale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
