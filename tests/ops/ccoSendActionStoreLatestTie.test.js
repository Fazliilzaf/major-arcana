'use strict';

/* findSendByRelatedEntity och listSends gav fel ordning vid lika createdAt.
 *
 * createdAt har millisekundupplösning. Två utskick som skapas utan att vänta
 * på nätverk — t.ex. med dryRunOverride — hamnar i samma millisekund och får
 * identisk stämpel. Komparatorn `String(b.createdAt).localeCompare(...)`
 * returnerar då 0, och V8:s sort är STABIL, så elementen behåller sin
 * append-ordning. [0] blev därmed det FÖRST skapade i en funktion som lovar
 * det senaste.
 *
 * Symtomet lästes som fladdrighet eftersom utfallet beror på maskinens
 * hastighet: på en långsam maskin skiljer stämplarna och testet passerar.
 * Mätt 2026-08-19 failade tests/ops/ccoSendActionStore.test.js 5 av 10
 * lokala körningar, och två oberoende CI-jobb samtidigt.
 *
 * Testerna nedan är INTE tidsberoende. De skriver identisk createdAt rakt in
 * i det persisterade tillståndet och laddar om storen, så oavgjortläget
 * uppstår varje gång oavsett maskin.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

function tmpFile(name) {
  return path.join(os.tmpdir(), `${name}-${Date.now()}-${crypto.randomUUID()}.json`);
}

const SAMMA_TID = '2026-08-19T06:00:00.000Z';

function sendPost({ sendId, createdAt = SAMMA_TID, relatedEntityId = 'agr-1', kind = 'consent' }) {
  return {
    sendId,
    kind,
    status: 'sent',
    mode: 'dry_run',
    customerId: 'kund-1',
    to: 'agree@example.com',
    subject: 'Samtycke',
    relatedEntityKind: 'agreement',
    relatedEntityId,
    createdAt,
  };
}

/* Skriver state direkt till disk och laddar storen därifrån, så vi kontrollerar
 * både ordning och tidsstämplar exakt. */
async function withState(sends, fn) {
  const filePath = tmpFile('send-action-tie');
  await fs.writeFile(
    filePath,
    `${JSON.stringify({ version: 1, createdAt: SAMMA_TID, updatedAt: SAMMA_TID, sends })}\n`,
    'utf8'
  );
  const store = await createCcoSendActionStore({ filePath });
  try {
    await fn(store);
  } finally {
    await fs.unlink(filePath).catch(() => {});
  }
}

test('findSendByRelatedEntity väljer den sist tillagda vid identisk createdAt', async () => {
  await withState([sendPost({ sendId: 'forst' }), sendPost({ sendId: 'sist' })], async (store) => {
    const funnen = store.findSendByRelatedEntity('agreement', 'agr-1');
    assert.ok(funnen);
    // Före fixen: 'forst', eftersom stabil sort lämnade ordningen orörd.
    assert.equal(funnen.sendId, 'sist');
  });
});

test('findSendByRelatedEntity väljer nyaste när stämplarna skiljer sig', async () => {
  await withState(
    [
      sendPost({ sendId: 'ny', createdAt: '2026-08-19T06:00:05.000Z' }),
      sendPost({ sendId: 'gammal', createdAt: '2026-08-19T06:00:01.000Z' }),
    ],
    async (store) => {
      // Tidsstämpeln ska fortfarande vinna över arrayordningen.
      assert.equal(store.findSendByRelatedEntity('agreement', 'agr-1').sendId, 'ny');
    }
  );
});

test('findSendByRelatedEntity blandar inte ihop olika entiteter', async () => {
  await withState(
    [
      sendPost({ sendId: 'annan', relatedEntityId: 'agr-2' }),
      sendPost({ sendId: 'ratt', relatedEntityId: 'agr-1' }),
    ],
    async (store) => {
      assert.equal(store.findSendByRelatedEntity('agreement', 'agr-1').sendId, 'ratt');
      assert.equal(store.findSendByRelatedEntity('agreement', 'agr-2').sendId, 'annan');
    }
  );
});

test('findSendByRelatedEntity returnerar null utan träff', async () => {
  await withState([sendPost({ sendId: 'a' })], async (store) => {
    assert.equal(store.findSendByRelatedEntity('agreement', 'finns-inte'), null);
    assert.equal(store.findSendByRelatedEntity('', 'agr-1'), null);
  });
});

test('listSends sätter sist tillagda först vid identisk createdAt', async () => {
  await withState(
    [sendPost({ sendId: 'a' }), sendPost({ sendId: 'b' }), sendPost({ sendId: 'c' })],
    async (store) => {
      const ordning = store.listSends({}).map((s) => s.sendId);
      // Före fixen: ['a','b','c'] — äldst först i en lista som utger sig för
      // att vara nyast först.
      assert.deepEqual(ordning, ['c', 'b', 'a']);
    }
  );
});

test('listSends respekterar limit efter sortering', async () => {
  await withState(
    [sendPost({ sendId: 'a' }), sendPost({ sendId: 'b' }), sendPost({ sendId: 'c' })],
    async (store) => {
      assert.deepEqual(
        store.listSends({ limit: 2 }).map((s) => s.sendId),
        ['c', 'b']
      );
    }
  );
});
