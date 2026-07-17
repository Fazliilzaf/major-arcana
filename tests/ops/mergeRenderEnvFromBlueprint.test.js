'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseRenderYamlEnvDefaults,
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
  assert.equal(defaults.get('ARCANA_CCO_IMAP_POLL_INTERVAL_MINUTES'), '3');
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
