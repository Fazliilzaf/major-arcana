'use strict';

/* Paritet V2 ↔ gamla vyn: V2:s arbetslista frågade tidigare bara ett smalt,
 * sticky brevlåde-urval (fazli+kons) med limit 120 → visade ~99 trådar mot gamla
 * vyns ~160 (som frågar alla brevlådor med limit 500). Två rotorsaker:
 *   1) getTruthPrimaryWorklistMailboxIds returnerade det scopade urvalet när det
 *      var satt → fastnade på 2 brevlådor. Nu returnerar den ALLTID hela det
 *      konfigurerade live-scopet.
 *   2) WORKLIST_TRUTH_PRIMARY listade bara 7 brevlådor (halso@ saknades) med
 *      limit 120. Nu: alla 8 live-brevlådor + limit 500 (matchar gamla vyn).
 * Dessa tester låser båda. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PREVIEW = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');
const CONFIG = fs.readFileSync(path.join(PREVIEW, 'runtime-config.js'), 'utf8');
const APP = fs.readFileSync(path.join(PREVIEW, 'app.js'), 'utf8');

// De 8 live-brevlådorna (spegel av src/ops/ccoMailIngestion/poller.js LIVE_MAILBOXES).
const LIVE_MAILBOXES = [
  'kons@hairtpclinic.com',
  'info@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
  'marknad@hairtpclinic.com',
  'kvitto@hairtpclinic.com',
  'halso@hairtpclinic.com',
];

function primaryBlock(source) {
  const start = source.indexOf('WORKLIST_TRUTH_PRIMARY:');
  assert.ok(start > -1, 'WORKLIST_TRUTH_PRIMARY ska finnas i runtime-config.js');
  return source.slice(start, start + 500);
}

test('WORKLIST_TRUTH_PRIMARY täcker alla 8 live-brevlådor (halso@ inkluderad)', () => {
  const block = primaryBlock(CONFIG);
  for (const mailbox of LIVE_MAILBOXES) {
    assert.ok(
      block.includes(mailbox),
      `WORKLIST_TRUTH_PRIMARY ska innehålla ${mailbox} (paritet med gamla vyn)`
    );
  }
});

test('WORKLIST_TRUTH_PRIMARY.limit är 500 (matchar gamla vyns limit)', () => {
  const block = primaryBlock(CONFIG);
  assert.match(block, /limit: 500/, 'limit ska vara 500, inte 120');
  assert.doesNotMatch(block, /limit: 120/, 'den gamla limiten 120 får inte ligga kvar');
});

test('getTruthPrimaryWorklistMailboxIds hämtar det VALDA scopet (inte alltid alla 8 → hänger UI:t)', () => {
  const start = APP.indexOf('function getTruthPrimaryWorklistMailboxIds');
  assert.ok(start > -1, 'getTruthPrimaryWorklistMailboxIds ska finnas');
  const body = APP.slice(start, start + 900);
  // Arbetslistan ska hämta det valda scopet (default EN brevlåda). Att alltid
  // hämta alla 8 — även chunkat — drog in hundratals trådar och hängde UI:t.
  assert.match(
    body,
    /if \(scopedMailboxIds\.length\)/,
    'ska returnera det valda scopet när ett urval finns'
  );
  assert.match(
    body,
    /return getTruthPrimaryConfiguredMailboxIds\(\);/,
    'tomt urval → konfigurerat scope som fallback'
  );
});

test('default-scopet är EN brevlåda, inte alla (annars laddas hundratals trådar och UI:t hänger)', () => {
  const start = APP.indexOf('function ensureRuntimeMailboxSelection');
  assert.ok(start > -1, 'ensureRuntimeMailboxSelection ska finnas');
  const body = APP.slice(start, start + 900);
  assert.doesNotMatch(
    body,
    /const defaultScope = availableIds;/,
    'default får inte vara ALLA tillgängliga brevlådor'
  );
  assert.match(
    body,
    /getPreferredOperationalMailboxId\(\)/,
    'default ska utgå från den operativa brevlådan (en)'
  );
});
