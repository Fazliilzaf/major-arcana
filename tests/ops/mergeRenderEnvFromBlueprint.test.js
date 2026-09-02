'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseRenderYamlEnvDefaults,
  parseRenderYamlDuplicateKeys,
  mergeEnv,
} = require('../../scripts/merge-render-env-from-blueprint.js');

test('parseRenderYamlEnvDefaults läser value från render.yaml', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
  const defaults = parseRenderYamlEnvDefaults(yaml);
  assert.ok(defaults.has('ARCANA_STATE_ROOT'));
  assert.equal(defaults.get('ARCANA_STATE_ROOT'), '/var/data');
  assert.ok(defaults.has('PUBLIC_BASE_URL'));
  assert.equal(defaults.get('ARCANA_STAFF_JOURNAL_OPEN_ACCESS'), 'false');
  assert.equal(defaults.get('ARCANA_CCO_IMAP_POLL_ENABLED'), 'false');
  // ORD-78: 3 minuter var intervallet som körde slut på minnet mot
  // info@fazli.se. Blueprinten överskuggade dessutom en säker kod-default —
  // src/config.js:376 har redan 30. Måste stå på 30 innan POLL_ENABLED
  // sätts till true.
  assert.equal(defaults.get('ARCANA_CCO_IMAP_POLL_INTERVAL_MINUTES'), '30');
  assert.equal(defaults.get('ARCANA_CCO_IMAP_MAX_MESSAGES_PER_CYCLE'), '25');
  // ORD-74 2026-07-17: frysen lyft — schedulern PÅ igen; yaml avstämd mot Dashboard.
  assert.equal(defaults.get('ARCANA_SCHEDULER_ENABLED'), 'true');
  assert.equal(defaults.get('ARCANA_SCHEDULER_RUN_ON_STARTUP'), 'true');
  assert.equal(defaults.get('PUBLIC_BASE_URL'), 'https://arcana.hairtpclinic.com');
  assert.equal(defaults.get('PHOTO_REVIEW_CANARY_MAX_DECISIONS'), '500');
  assert.equal(defaults.get('DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS'), '317');
  assert.equal(defaults.get('ARCANA_SCHEDULER_CCO_TRUTH_DELTA_INTERVAL_MINUTES'), '0');
  const ccoMailboxIds =
    'kons@hairtpclinic.com,info@hairtpclinic.com,contact@hairtpclinic.com,' +
    'egzona@hairtpclinic.com,fazli@hairtpclinic.com,marknad@hairtpclinic.com,' +
    'kvitto@hairtpclinic.com,halso@hairtpclinic.com';
  assert.equal(defaults.get('ARCANA_MAILBOX_ALLOWLIST'), ccoMailboxIds);
  assert.equal(defaults.get('ARCANA_CCO_MAIL_INGESTION_POLL_MAILBOXES'), ccoMailboxIds);
  assert.equal(defaults.get('ARCANA_CCO_MAIL_INGESTION_POLL_INTERVAL_MINUTES'), '1');
  assert.equal(defaults.get('ARCANA_CCO_MAIL_INGESTION_POLL_MAX_MAILBOXES_PER_CYCLE'), '1');
  assert.ok(!defaults.has('OPENAI_API_KEY'), 'sync:false utan value ska inte ingå');
});

test('mergeEnv behåller befintliga hemligheter och fyller saknade defaults', () => {
  const existing = [{ envVar: { key: 'OPENAI_API_KEY', value: 'sk-test' } }];
  const defaults = new Map([
    ['ARCANA_STATE_ROOT', '/var/data'],
    ['OPENAI_API_KEY', ''],
  ]);
  const merged = mergeEnv(existing, defaults);
  const map = new Map(merged.map((row) => [row.key, row.value]));
  assert.equal(map.get('OPENAI_API_KEY'), 'sk-test');
  assert.equal(map.get('ARCANA_STATE_ROOT'), '/var/data');
});

test('parseRenderYamlDuplicateKeys hittar kända META-dubbletter och syntetiska dubbletter', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
  const dupKeys = new Set(parseRenderYamlDuplicateKeys(yaml).map(([key]) => key));
  // ORD-162: META_APP_ID/SECRET/REDIRECT_URI förekommer i två block (marketing sync:false
  // + CFO value:) och klassas som KNOWN BLUEPRINT DUPLICATION — de får finnas.
  assert.deepEqual(
    dupKeys,
    new Set(['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI']),
    'endast kända META-dubbletter ska finnas i render.yaml'
  );

  const dupYaml = [
    'services:',
    '  - type: web',
    '    envVars:',
    '      - key: FOO',
    '        value: bar',
    '      - key: FOO',
    '        value: baz',
    '      - key: BAR',
    '        sync: false',
  ].join('\n');
  assert.deepEqual(parseRenderYamlDuplicateKeys(dupYaml), [['FOO', 2]]);
});
