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

test('getTruthPrimaryWorklistMailboxIds returnerar ALLTID hela det konfigurerade scopet', () => {
  const start = APP.indexOf('function getTruthPrimaryWorklistMailboxIds');
  assert.ok(start > -1, 'getTruthPrimaryWorklistMailboxIds ska finnas');
  const body = APP.slice(start, start + 900);
  // Får inte längre kortsluta på ett scopat/sticky urval.
  assert.doesNotMatch(
    body,
    /if \(scopedMailboxIds\.length\)/,
    'huvudlistan får inte strypas till ett smalt sticky-urval'
  );
  assert.match(
    body,
    /return getTruthPrimaryConfiguredMailboxIds\(\);/,
    'ska returnera hela det konfigurerade live-scopet (alla 8)'
  );
});
