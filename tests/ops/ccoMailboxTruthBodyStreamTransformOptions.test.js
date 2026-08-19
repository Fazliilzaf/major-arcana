'use strict';

/**
 * Steg 0 av bodies-externaliseringen för mail-ingestion
 * (docs/ops/cco-mail-ingestion-bodies-utkast.md).
 *
 * Transformen var hårdkodad mot mailbox-truths shard-format: samlingsnyckeln
 * 'messages' och fälten bodyText/bodyHtml. Mail-ingestion har samma FORM men
 * andra namn — { mailRawMessages: { "<id>": { ... } } }. Bägge är nu
 * parametrar med mailbox-truths värden som default.
 *
 * De befintliga sviterna (13 + 8 + 12 = 33 tester) bevisar att defaulten är
 * oförändrad. Testerna här bevisar det omvända: att parametrarna faktiskt
 * styr något. Utan dem är steg 0 en ändring utan verkan.
 *
 * Sanningen är `JSON.parse` av resultatet, inte enskilda assertions. En
 * transform som producerar ogiltig JSON skulle annars se korrekt ut fält för
 * fält och ändå ha förstört filen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBodyStreamTransform } = require('../../src/ops/ccoMailboxTruthBodyStreamTransform');

async function run(text, options = {}, chunkSize = Infinity) {
  const captured = [];
  let output = '';
  const transform = createBodyStreamTransform({
    ...options,
    onBody: async (messageKey, field, value) => {
      captured.push({ messageKey, field, value });
    },
    emit: (chunk) => {
      output += chunk;
    },
  });
  if (chunkSize === Infinity) transform.write(text);
  else {
    for (let i = 0; i < text.length; i += chunkSize) {
      transform.write(text.slice(i, i + chunkSize));
    }
  }
  const stats = await transform.finish();
  return { output, captured, stats };
}

/* Formen mail-ingestion har: samlingen på djup 1, meddelandenyckeln på 2. */
const INGESTION = {
  version: 1,
  mailAccounts: { 'a@b.se': { id: 'acc-1' } },
  mailRawMessages: {
    'raw-1': {
      id: 'raw-1',
      mailboxId: 'egzona@hairtpclinic.com',
      subject: 'Ämne med "citat"',
      bodyText: 'Rad ett\nRad två med å, ä, ö',
      bodyPreview: 'Rad ett',
    },
    'raw-2': {
      id: 'raw-2',
      mailboxId: 'kons@hairtpclinic.com',
      bodyText: 'Andra meddelandet',
      bodyPreview: 'Andra',
    },
  },
};

test('mailRawMessages som samlingsnyckel styr om bodyText', async () => {
  const { output, captured } = await run(JSON.stringify(INGESTION), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText'],
  });

  assert.equal(captured.length, 2);
  assert.deepEqual(captured.map((c) => c.messageKey).sort(), ['raw-1', 'raw-2']);

  const parsed = JSON.parse(output);
  assert.equal(parsed.mailRawMessages['raw-1'].bodyText, '');
  assert.equal(parsed.mailRawMessages['raw-2'].bodyText, '');
});

test('fält som inte står i bodyFields lämnas orörda', async () => {
  const { output } = await run(JSON.stringify(INGESTION), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText'],
  });
  const parsed = JSON.parse(output);
  // bodyPreview stannar som metadata enligt beslut 3.4 i utkastet.
  assert.equal(parsed.mailRawMessages['raw-1'].bodyPreview, 'Rad ett');
  assert.equal(parsed.mailRawMessages['raw-1'].subject, 'Ämne med "citat"');
});

test('fel samlingsnyckel styr inte om något alls', async () => {
  // Kördes mail-ingestion-data med defaultnyckeln 'messages' skulle inget
  // hittas — och migreringen rapportera noll flyttade bodies i stället för
  // att krascha. Det failet ska vara tyst men synligt i rapporten.
  const { output, captured } = await run(JSON.stringify(INGESTION), {
    bodyFields: ['bodyText'],
  });
  assert.equal(captured.length, 0);
  assert.deepEqual(JSON.parse(output), INGESTION);
});

test('bodyFields tar både array och Set', async () => {
  const somArray = await run(JSON.stringify(INGESTION), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText'],
  });
  const somSet = await run(JSON.stringify(INGESTION), {
    collectionKey: 'mailRawMessages',
    bodyFields: new Set(['bodyText']),
  });
  assert.equal(somArray.captured.length, somSet.captured.length);
  assert.equal(somArray.output, somSet.output);
});

test('tom bodyFields styr inte om något', async () => {
  const { output, captured } = await run(JSON.stringify(INGESTION), {
    collectionKey: 'mailRawMessages',
    bodyFields: [],
  });
  assert.equal(captured.length, 0);
  assert.deepEqual(JSON.parse(output), INGESTION);
});

test('flera fält kan styras om samtidigt', async () => {
  const data = {
    mailRawMessages: {
      'raw-1': { bodyText: 'text', bodyPreview: 'preview', subject: 'ämne' },
    },
  };
  const { output, captured } = await run(JSON.stringify(data), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText', 'bodyPreview'],
  });
  assert.equal(captured.length, 2);
  const parsed = JSON.parse(output);
  assert.equal(parsed.mailRawMessages['raw-1'].bodyText, '');
  assert.equal(parsed.mailRawMessages['raw-1'].bodyPreview, '');
  assert.equal(parsed.mailRawMessages['raw-1'].subject, 'ämne');
});

test('samma fältnamn på fel djup styrs inte om', async () => {
  // bodyText direkt under roten, och under ett meddelandes underobjekt.
  // Bara det på djup 3 i samlingen ska träffas.
  const data = {
    bodyText: 'pa roten',
    mailRawMessages: {
      'raw-1': {
        bodyText: 'ratt niva',
        rawJson: { bodyText: 'for djupt' },
      },
    },
  };
  const { output, captured } = await run(JSON.stringify(data), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText'],
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].value, 'ratt niva');

  const parsed = JSON.parse(output);
  assert.equal(parsed.bodyText, 'pa roten');
  assert.equal(parsed.mailRawMessages['raw-1'].bodyText, '');
  // rawJson.bodyText ligger på djup 4 och rörs INTE av steg 0. Objekthoppning
  // för rawJson är steg 1.
  assert.equal(parsed.mailRawMessages['raw-1'].rawJson.bodyText, 'for djupt');
});

test('chunkning mitt i ett värde ger samma resultat', async () => {
  const text = JSON.stringify(INGESTION);
  const helt = await run(text, { collectionKey: 'mailRawMessages', bodyFields: ['bodyText'] });
  for (const storlek of [1, 3, 7, 64]) {
    const delat = await run(
      text,
      { collectionKey: 'mailRawMessages', bodyFields: ['bodyText'] },
      storlek
    );
    assert.equal(delat.output, helt.output, `chunkstorlek ${storlek}`);
    assert.equal(delat.captured.length, helt.captured.length, `chunkstorlek ${storlek}`);
  }
});
