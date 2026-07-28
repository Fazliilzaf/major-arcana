'use strict';

/**
 * Svarscachen för worklist-consumern har ett tak och ett svep.
 *
 * Varje post är en HEL svarspayload — `readLimit` blir 5 000 rader när limit är
 * 1000 eller ovalidierad, plus enrichment och shadow-guardrail. Cachen städades
 * tidigare bara LAT, vid läsning av samma nyckel: en nyckel som aldrig lästes
 * igen låg kvar för alltid, och antalet nycklar var obegränsat
 * (tenant × mailboxkombination × limit).
 *
 * Det spelade roll 2026-07-27 19:09 UTC: tre kalla laddningar med tre olika
 * mailboxval på 41 sekunder gav tre nycklar, alltså tre payloads inlåsta i fem
 * minuter samtidigt som shard-parsningarna körde. RSS gick från 2 291 MB till
 * 3 465 MB på 62 sekunder och Render startade om instansen — utan deploy.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearWorklistConsumerResponseCache,
  readWorklistConsumerResponseCache,
  writeWorklistConsumerResponseCache,
  WORKLIST_CONSUMER_RESPONSE_CACHE_MAX_ENTRIES: MAX,
} = require('../../src/routes/capabilities');

function payloadFor(key = '') {
  return { ok: true, rows: [{ id: key }] };
}

test.beforeEach(() => clearWorklistConsumerResponseCache());

test('cachen växer inte förbi taket när mailboxvalen varierar', () => {
  const keys = Array.from({ length: MAX + 5 }, (_value, index) => `tenant|mailbox-${index}|1000`);
  for (const key of keys) writeWorklistConsumerResponseCache(key, payloadFor(key));

  const stillCached = keys.filter((key) => readWorklistConsumerResponseCache(key));
  assert.equal(
    stillCached.length,
    MAX,
    'utan tak låg alla payloads kvar samtidigt — det var det minnet Render dog av'
  );
  assert.deepEqual(
    stillCached,
    keys.slice(keys.length - MAX),
    'det är de äldsta som ska vräkas ut, inte de nyaste'
  );
});

test('att skriva om en nyckel förnyar den i stället för att vräka ut den', () => {
  const first = 'tenant|fazli|1000';
  writeWorklistConsumerResponseCache(first, payloadFor(first));
  for (let index = 0; index < MAX - 1; index += 1) {
    const key = `tenant|annan-${index}|1000`;
    writeWorklistConsumerResponseCache(key, payloadFor(key));
  }
  // Cachen är nu exakt full och `first` är äldst. Skriv om den: den ska flytta
  // sist i ordningen, annars vräker nästa skrivning ut posten som just skrevs.
  writeWorklistConsumerResponseCache(first, payloadFor(first));
  writeWorklistConsumerResponseCache('tenant|ny|1000', payloadFor('tenant|ny|1000'));

  assert.ok(readWorklistConsumerResponseCache(first), 'omskriven nyckel ska ligga kvar');
  assert.ok(readWorklistConsumerResponseCache('tenant|ny|1000'), 'och den nya likaså');
});

test('tomma svar cachas inte alls', () => {
  writeWorklistConsumerResponseCache('tenant|tom|1000', { ok: true, rows: [] });
  assert.equal(
    readWorklistConsumerResponseCache('tenant|tom|1000'),
    null,
    'ett tomt svar får inte låsa fast en trasig laddning i fem minuter'
  );
});
