'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseRenderYamlEnvDefaults, mergeEnv } = require('../../scripts/merge-render-env-from-blueprint.js');

test('parseRenderYamlEnvDefaults läser value från render.yaml', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
  const defaults = parseRenderYamlEnvDefaults(yaml);
  assert.ok(defaults.has('ARCANA_STATE_ROOT'));
  assert.equal(defaults.get('ARCANA_STATE_ROOT'), '/var/data');
  assert.ok(defaults.has('PUBLIC_BASE_URL'));
  assert.equal(defaults.get('ARCANA_STAFF_JOURNAL_OPEN_ACCESS'), 'true');
  assert.ok(!defaults.has('OPENAI_API_KEY'), 'sync:false utan value ska inte ingå');
});

test('mergeEnv behåller befintliga hemligheter och fyller saknade defaults', () => {
  const existing = [{ envVar: { key: 'OPENAI_API_KEY', value: 'sk-test' } }];
  const defaults = new Map([['ARCANA_STATE_ROOT', '/var/data'], ['OPENAI_API_KEY', '']]);
  const merged = mergeEnv(existing, defaults);
  const map = new Map(merged.map((row) => [row.key, row.value]));
  assert.equal(map.get('OPENAI_API_KEY'), 'sk-test');
  assert.equal(map.get('ARCANA_STATE_ROOT'), '/var/data');
});
