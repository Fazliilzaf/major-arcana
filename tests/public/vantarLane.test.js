'use strict';

/* "Väntar"-lanen i CCO Konversationer: samlar obesvarade trådar (kunden skrev
 * sist, vi svarade inte) i mer än 24 h — även lästa. Över alla brevlådor, äldst
 * först. Läser den befintliga needsReply-signalen; ingen ny sändlogik. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('lane-raden "Väntar" finns i lane-listan', () => {
  assert.match(source, /data-lane="waiting"[\s\S]{0,80}Väntar/);
});

test('obesvarad > 24 h: threadIsWaiting + 24h-tröskel', () => {
  assert.match(source, /const WAITING_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /function threadIsWaiting\(thread\)/);
  // Kräver needsReply (kunden skrev sist) — fångar även lästa-men-obesvarade.
  assert.match(source, /thread\.needsReply !== true/);
  assert.match(source, /Date\.now\(\) - since >= WAITING_MS/);
});

test('lane-filtret använder threadIsWaiting', () => {
  assert.match(source, /if \(laneId === 'waiting'\) return threadIsWaiting\(thread\)/);
});

test('raden bär needsReply + waitingSinceMs (från senaste inkommande)', () => {
  assert.match(source, /needsReply: state\.needsReply === true/);
  assert.match(source, /waitingSinceMs: Date\.parse\(timing\.lastInboundAt/);
});

test('äldst-först-sortering + egen räknare i lane-listan', () => {
  assert.match(
    source,
    /activeLane === 'waiting'[\s\S]{0,120}waitingSinceMs \|\| 0\) - \(b\.waitingSinceMs/
  );
  assert.match(source, /lane-row\[data-lane="waiting"\] \.ct/);
  assert.match(source, /threads\.filter\(threadIsWaiting\)\.length/);
});
