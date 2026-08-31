'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseRenderYamlEnvDefaults,
  parseRenderYamlSecretKeys,
} = require('../../scripts/merge-render-env-from-blueprint.js');

/**
 * ORD-156 §3 — antalet får aldrig dölja en tom hemlighet.
 *
 * 2026-08-31, kvällen: 97 env-nycklar i Render, alltså långt över golvet på 25,
 * medan 28 hemligheter var tomma. Räkningen var grön och miljön obrukbar —
 * Graph, Resend, Cliento, BankID och OpenAI saknade alla värden.
 *
 * Orsaken är strukturell: nycklar med `sync: false` bärs ALDRIG av Blueprinten.
 * En återställning ur render.yaml fyller därför inte i dem, hur grön räkningen
 * än blir efteråt. De måste räknas för sig.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const YAML = fs.readFileSync(path.join(REPO_ROOT, 'render.yaml'), 'utf8');

test('sync:false-nycklar plockas ut som hemligheter, inte som defaults', () => {
  const yaml = [
    'services:',
    '  - name: api',
    '    envVars:',
    '      - key: OPEN_VALUE',
    '        value: "1"',
    '      - key: A_SECRET',
    '        sync: false',
    '      - key: ANOTHER_VALUE',
    '        value: "hej"',
    '      - key: B_SECRET',
    '        sync: false',
  ].join('\n');

  const defaults = parseRenderYamlEnvDefaults(yaml);
  const secrets = parseRenderYamlSecretKeys(yaml);

  assert.deepEqual([...defaults.keys()], ['OPEN_VALUE', 'ANOTHER_VALUE']);
  assert.deepEqual(secrets, ['A_SECRET', 'B_SECRET']);

  // Ingen nyckel får hamna i båda listorna — då hade en hemlighet kunnat
  // "återställas" med ett värde Blueprinten inte har.
  const overlap = secrets.filter((k) => defaults.has(k));
  assert.deepEqual(overlap, [], 'en nyckel kan inte både ha värde och vara sync:false');
});

test('den riktiga render.yaml har både värdesatta nycklar och hemligheter', () => {
  const defaults = parseRenderYamlEnvDefaults(YAML);
  const secrets = parseRenderYamlSecretKeys(YAML);

  assert.ok(defaults.size > 50, `förväntade många värdesatta nycklar, fick ${defaults.size}`);
  assert.ok(secrets.length > 0, 'render.yaml ska ha sync:false-nycklar');

  // De fyra Graph-nycklarna är de som CI redan bevakade som "kritiska". De ska
  // klassas som hemligheter — annars trodde man att en restore fyller dem.
  for (const key of [
    'ARCANA_GRAPH_TENANT_ID',
    'ARCANA_GRAPH_CLIENT_ID',
    'ARCANA_GRAPH_CLIENT_SECRET',
    'ARCANA_GRAPH_USER_ID',
  ]) {
    assert.ok(secrets.includes(key), `${key} ska vara en hemlighet (sync: false)`);
    assert.equal(defaults.has(key), false, `${key} får inte se ut som en återställbar default`);
  }
});

test('golvet härleds ur blueprinten, inte ur en hårdkodad siffra', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'verify-render-env-count.js'),
    'utf8'
  );
  // Ett golv på 25 mot 122 deklarerade nycklar hade passerat med 100 saknade.
  assert.match(
    src,
    /RENDER_ENV_MIN_COUNT \|\| declared\.size/,
    'golvet ska följa render.yaml — annars glider det isär från verkligheten igen'
  );
  assert.doesNotMatch(
    src,
    /RENDER_ENV_MIN_COUNT \|\| '25'/,
    'den hårdkodade 25:an får inte komma tillbaka'
  );
});

test('hemligheter rapporteras separat från antalet', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts', 'verify-render-env-count.js'),
    'utf8'
  );
  assert.match(src, /parseRenderYamlSecretKeys/, 'hemligheterna måste läsas ut');
  assert.match(
    src,
    /Hemligheter\s*:/,
    'de ska stå på en egen rad i utskriften, inte gömmas i totalen'
  );
});
