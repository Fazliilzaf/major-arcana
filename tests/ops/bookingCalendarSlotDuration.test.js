'use strict';

/**
 * Regressionstest (bug-hunt kalender-v8): slotDurationMinutes ska hantera
 * midnatt-spännande bokningar (sluttid <= starttid rullar över till nästa dygn)
 * istället för att klampa till 15 min.
 *
 * slotStartMinutes/slotEndMinutes/slotDurationMinutes är interna (ej i det
 * exporterade API:t), så vi extraherar källan direkt — samma mönster som
 * tests/ops/majorArcanaRuntimeDomLiveComposition.test.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SHARED_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'booking-calendar-shared.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Hittade inte ${functionName}.`);
  let depth = 0;
  let bodyStart = -1;
  for (let i = startIndex; i < source.length; i += 1) {
    if (source[i] === '{') {
      bodyStart = i;
      break;
    }
  }
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  throw new Error(`Kunde inte extrahera ${functionName}.`);
}

function loadSlotDuration() {
  const source = fs.readFileSync(SHARED_PATH, 'utf8');
  const parts = ['slotStartMinutes', 'slotEndMinutes', 'slotDurationMinutes'].map((fn) =>
    extractFunctionSource(source, fn)
  );
  return new Function(`${parts.join('\n')}\n return slotDurationMinutes;`)();
}

test('slotDurationMinutes: vanlig bokning räknar rätt', () => {
  const slotDurationMinutes = loadSlotDuration();
  assert.equal(slotDurationMinutes({ start: '14:00', end: '15:30' }), 90);
  assert.equal(slotDurationMinutes({ start: '09:00', end: '09:45' }), 45);
});

test('slotDurationMinutes: midnatt-spännande bokning rullar över dygnet (regression)', () => {
  const slotDurationMinutes = loadSlotDuration();
  // 23:30 → 00:30 = 60 min (tidigare klampades till 15)
  assert.equal(slotDurationMinutes({ start: '23:30', end: '00:30' }), 60);
  // 22:00 → 02:00 = 240 min
  assert.equal(slotDurationMinutes({ start: '22:00', end: '02:00' }), 240);
});

test('slotDurationMinutes: minsta varaktighet 15 min behålls', () => {
  const slotDurationMinutes = loadSlotDuration();
  assert.equal(slotDurationMinutes({ start: '10:00', end: '10:05' }), 15);
});
