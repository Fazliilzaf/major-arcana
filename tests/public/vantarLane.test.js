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
  assert.match(source, /const rowNeedsReply = state\.needsReply === true/);
  assert.match(source, /const rowWaitingSinceMs =\s*Date\.parse\(timing\.lastInboundAt/);
  assert.match(source, /needsReply: rowNeedsReply/);
  assert.match(source, /waitingSinceMs: rowWaitingSinceMs/);
});

test('per-rad ålders-badge ("X utan svar") på obesvarade > 24 h', () => {
  assert.match(source, /function formatWaitingAge\(ms\)/);
  // Timmar upp till 48h, därefter dagar.
  assert.match(source, /if \(hours < 48\) return Math\.max\(1, hours\) \+ ' h'/);
  // Badge: "26 h utan svar" / "3 d utan svar", annars "Obesvarad" om tid saknas.
  assert.match(source, /formatWaitingAge\(rowWaitingMs\) \+ ' utan svar'/);
  assert.match(source, /: 'Obesvarad'/);
});

test('färgtrappa: gul (warning) 24–48 h, röd (urgent) 48 h+', () => {
  assert.match(source, /\.thread-tag--warning\s*\{[\s\S]{0,80}--cco-status-warning/);
  assert.match(source, /rowWaitingMs >= 48 \* 60 \* 60 \* 1000 \? 'urgent' : 'warning'/);
});

test('äldst-först-sortering + egen räknare i lane-listan', () => {
  assert.match(
    source,
    /activeLane === 'waiting'[\s\S]{0,120}waitingSinceMs \|\| 0\) - \(b\.waitingSinceMs/
  );
  assert.match(source, /lane-row\[data-lane="waiting"\] \.ct/);
  assert.match(source, /threads\.filter\(threadIsWaiting\)\.length/);
});
