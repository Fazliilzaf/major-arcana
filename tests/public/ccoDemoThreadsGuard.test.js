'use strict';

/**
 * ORD-83, andra commiten — demoThreads bakom sitt villkor.
 *
 * demoThreads beräknades ovillkorligt överst i getMailboxScopedRuntimeThreads:
 * ett fullt pass över hela trådlistan med toLowerCase + normalize("NFKD") +
 * replace PER TRÅD, vid varje anrop. Resultatet används bara när
 * shouldPreferDemoThreads är sant, vilket kräver !availableMailboxes.length —
 * alltid falskt i drift med nio brevlådor. Passet kördes alltid, användes aldrig.
 *
 * Två egenskaper låses fast:
 *   1. Med brevlådor tillgängliga rörs INTE trådlistan alls.
 *   2. Det booleska utfallet är identiskt med den gamla formeln, hela
 *      sanningstabellen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js'),
  'utf8'
);

/** Gamla formeln, ordagrant som den såg ut före ORD-83. */
function gammal({ authRequired, mailboxCount, threads, hasToken }) {
  let rord = 0;
  const demoThreads = threads.filter((t) => {
    rord += 1;
    return String(t.worklistSource || '').toLowerCase().normalize('NFKD') === 'demo';
  });
  const should =
    !authRequired && mailboxCount === 0 && demoThreads.length > 1 && !hasToken;
  return { should, rord };
}

/** Nya formeln, ordagrant som den ser ut efter ORD-83. */
function ny({ authRequired, mailboxCount, threads, hasToken }) {
  let rord = 0;
  const can = !authRequired && mailboxCount === 0 && !hasToken;
  const demoThreads = can
    ? threads.filter((t) => {
        rord += 1;
        return String(t.worklistSource || '').toLowerCase().normalize('NFKD') === 'demo';
      })
    : [];
  const should = can && demoThreads.length > 1;
  return { should, rord };
}

const TRÅDAR = [
  { worklistSource: 'demo' },
  { worklistSource: 'DEMO' },
  { worklistSource: 'live' },
  { worklistSource: '' },
];

test('sanningstabell: nya formeln ger samma utfall som den gamla', () => {
  let fall = 0;
  for (const authRequired of [true, false]) {
    for (const mailboxCount of [0, 1, 9]) {
      for (const hasToken of [true, false]) {
        for (const threads of [[], [TRÅDAR[0]], TRÅDAR]) {
          const indata = { authRequired, mailboxCount, threads, hasToken };
          assert.equal(
            ny(indata).should,
            gammal(indata).should,
            `utfallet ska matcha för ${JSON.stringify({ authRequired, mailboxCount, hasToken, n: threads.length })}`
          );
          fall += 1;
        }
      }
    }
  }
  assert.equal(fall, 36, 'hela tabellen ska ha körts');
});

test('normalfallet (nio brevlådor): trådlistan rörs inte alls', () => {
  const indata = { authRequired: false, mailboxCount: 9, threads: TRÅDAR, hasToken: false };

  assert.equal(gammal(indata).rord, 4, 'gamla vägen läste varje tråd');
  assert.equal(ny(indata).rord, 0, 'nya vägen ska inte röra en enda tråd');
  assert.equal(ny(indata).should, false);
});

test('demoläget fungerar fortfarande när villkoret håller', () => {
  const indata = { authRequired: false, mailboxCount: 0, threads: TRÅDAR, hasToken: false };

  assert.equal(ny(indata).should, true, 'två demo-trådar utan brevlådor → demoläge');
  assert.equal(ny(indata).rord, 4, 'då SKA listan byggas');
  assert.equal(ny(indata).should, gammal(indata).should);
});

test('en enda demo-tråd räcker inte — > 1 kvar', () => {
  const indata = {
    authRequired: false,
    mailboxCount: 0,
    threads: [{ worklistSource: 'demo' }, { worklistSource: 'live' }],
    hasToken: false,
  };
  assert.equal(ny(indata).should, false);
  assert.equal(ny(indata).should, gammal(indata).should);
});

test('källnivå-vakt: filtret ligger bakom villkoret i app.js', () => {
  assert.ok(
    APP.includes('const canPreferDemoThreads ='),
    'villkoret ska beräknas separat före listan'
  );
  assert.ok(
    APP.includes('const demoThreads = canPreferDemoThreads'),
    'listan ska byggas villkorligt'
  );
  assert.ok(
    APP.includes('const shouldPreferDemoThreads = canPreferDemoThreads && demoThreads.length > 1;'),
    'utfallet ska kombinera villkoret med listlängden'
  );
  // Faller detta har någon lagt tillbaka det ovillkorliga passet.
  assert.ok(
    !/const demoThreads = asArray\(state\.runtime\?\.threads\)\.filter\(/.test(APP),
    'det ovillkorliga demoThreads-passet ska vara borta'
  );
});
