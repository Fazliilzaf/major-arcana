'use strict';

/**
 * Steg 1 av bodies-externaliseringen: objekthoppning för rawJson.
 *
 * mail-ingestion har 184 av 206 MB i rawJson, som är ett OBJEKT. Transformen
 * var byggd för att styra om strängvärden; att hoppa över ett nästlat objekt
 * från { till matchande } är ny logik.
 *
 * Den logiken har eget delstate. Klamrarna inuti rawJson får inte röra den
 * yttre djupräkningen — gör de det står `depth` fel för resten av filen och
 * varje efterföljande omstyrning hamnar på fel meddelande. Det är exakt den
 * klassen av fel som gav 409 brödtexter i EN fil i prod när nyckeltaket var
 * för lågt.
 *
 * SANNINGEN ÄR JSON.parse AV RESULTATET. En transform som producerar ogiltig
 * JSON ser korrekt ut i varje enskild assertion och har ändå förstört filen.
 * Varje test här parsar utdatan.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createBodyStreamTransform } = require('../../src/ops/ccoMailboxTruthBodyStreamTransform');

const OPTS = {
  collectionKey: 'mailRawMessages',
  bodyFields: ['bodyText'],
  objectFields: ['rawJson'],
};

async function run(text, options = OPTS, chunkSize = Infinity) {
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
  return { output, captured, stats, parsed: JSON.parse(output) };
}

function medMeddelande(raw) {
  return { version: 1, mailRawMessages: { 'raw-1': raw } };
}

test('rawJson styrs om och ersätts med tomt objekt', async () => {
  const { parsed, captured } = await run(
    JSON.stringify(medMeddelande({ id: 'raw-1', rawJson: { a: 1, b: 'text' } }))
  );
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].id, 'raw-1');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].field, 'rawJson');
  assert.equal(captured[0].messageKey, 'raw-1');
  assert.deepEqual(JSON.parse(captured[0].value), { a: 1, b: 'text' });
});

test('nästlade objekt i flera nivåer stänger på rätt klammer', async () => {
  const rawJson = { a: { b: { c: { d: { e: 'djupt' } } } }, efter: 1 };
  const { parsed, captured } = await run(JSON.stringify(medMeddelande({ rawJson, kvar: 'orörd' })));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].kvar, 'orörd');
  assert.deepEqual(JSON.parse(captured[0].value), rawJson);
});

test('klammer inuti en sträng stänger inte objektet', async () => {
  // Utan strängläge i delstaten stänger objektet vid "}" i texten, och resten
  // av filen skrivs ut som skräp.
  const rawJson = { text: 'ett } och ett { i texten', efter: 'kvar' };
  const { parsed, captured } = await run(JSON.stringify(medMeddelande({ rawJson, sist: 'ja' })));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].sist, 'ja');
  assert.deepEqual(JSON.parse(captured[0].value), rawJson);
});

test('escapat citattecken inuti objektet avslutar inte strängen', async () => {
  const rawJson = { text: 'han sa \\"hej\\" och } sen', n: 1 };
  const { parsed, captured } = await run(JSON.stringify(medMeddelande({ rawJson, sist: 'ja' })));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].sist, 'ja');
  assert.deepEqual(JSON.parse(captured[0].value), rawJson);
});

test('escapat backslash följt av citattecken avslutar strängen korrekt', async () => {
  // "a\\" är en sträng som slutar med backslash. Räknas backslashen som
  // escape av det avslutande citattecknet fortsätter sväljningen för långt.
  const rawJson = { text: 'slutar med backslash \\\\', efter: '}' };
  const { parsed, captured } = await run(JSON.stringify(medMeddelande({ rawJson, sist: 'ja' })));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].sist, 'ja');
  assert.deepEqual(JSON.parse(captured[0].value), rawJson);
});

test('tomt objekt hanteras', async () => {
  const { parsed, captured } = await run(
    JSON.stringify(medMeddelande({ rawJson: {}, sist: 'ja' }))
  );
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].sist, 'ja');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].value, '{}');
});

test('array som värde styrs om till tom array', async () => {
  const { parsed, captured } = await run(
    JSON.stringify(medMeddelande({ rawJson: [1, { a: '}' }, 'x'], sist: 'ja' }))
  );
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, []);
  assert.equal(parsed.mailRawMessages['raw-1'].sist, 'ja');
  assert.deepEqual(JSON.parse(captured[0].value), [1, { a: '}' }, 'x']);
});

test('objektet sist i meddelandet stänger inte meddelandet för tidigt', async () => {
  const data = {
    mailRawMessages: {
      'raw-1': { id: 'a', rawJson: { x: 1 } },
      'raw-2': { id: 'b', rawJson: { y: 2 } },
    },
  };
  const { parsed, captured } = await run(JSON.stringify(data));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.deepEqual(parsed.mailRawMessages['raw-2'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-2'].id, 'b');
  assert.equal(captured.length, 2);
  assert.deepEqual(
    captured.map((c) => c.messageKey),
    ['raw-1', 'raw-2']
  );
});

test('sträng- och objektfält i samma meddelande styrs om var för sig', async () => {
  const { parsed, captured } = await run(
    JSON.stringify(medMeddelande({ bodyText: 'brödtext', rawJson: { a: 1 }, bodyPreview: 'kvar' }))
  );
  assert.equal(parsed.mailRawMessages['raw-1'].bodyText, '');
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, {});
  assert.equal(parsed.mailRawMessages['raw-1'].bodyPreview, 'kvar');

  const falt = captured.map((c) => c.field).sort();
  assert.deepEqual(falt, ['bodyText', 'rawJson']);
});

test('djupräkningen överlever objektdiversionen', async () => {
  // Det farligaste felet: klamrarna inuti rawJson läcker till yttre `depth`,
  // varpå NÄSTA meddelandes fält hamnar på fel djup och inte styrs om.
  const data = {
    mailRawMessages: {
      'raw-1': { rawJson: { djupt: { a: { b: [1, 2, { c: 3 }] } } } },
      'raw-2': { bodyText: 'ska styras om' },
    },
    efterat: { orort: true },
  };
  const { parsed, captured, stats } = await run(JSON.stringify(data));

  assert.equal(parsed.mailRawMessages['raw-2'].bodyText, '');
  assert.deepEqual(parsed.efterat, { orort: true });
  assert.equal(stats.depthAtEnd, 0, 'obalanserat djup betyder tappad klammer');
  assert.equal(captured.length, 2);
});

test('objektfält som inte står i objectFields lämnas orört', async () => {
  const data = medMeddelande({ rawJson: { a: 1 }, annat: { b: 2 } });
  const { parsed } = await run(JSON.stringify(data));
  assert.deepEqual(parsed.mailRawMessages['raw-1'].annat, { b: 2 });
});

test('objectFields tom som default rör inte mailbox-truth', async () => {
  const data = medMeddelande({ rawJson: { a: 1 }, bodyText: 'x' });
  const { parsed, captured } = await run(JSON.stringify(data), {
    collectionKey: 'mailRawMessages',
    bodyFields: ['bodyText'],
  });
  assert.deepEqual(parsed.mailRawMessages['raw-1'].rawJson, { a: 1 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].field, 'bodyText');
});

test('chunkning mitt i objektet ger identiskt resultat', async () => {
  const data = medMeddelande({
    rawJson: { text: 'med } och { och "citat"', nästlat: { a: [1, 2] } },
    bodyText: 'brödtext med å ä ö',
    sist: 'ja',
  });
  const text = JSON.stringify(data);
  const helt = await run(text);

  for (const storlek of [1, 2, 3, 5, 13, 64]) {
    const delat = await run(text, OPTS, storlek);
    assert.equal(delat.output, helt.output, `chunkstorlek ${storlek}`);
    assert.equal(delat.captured.length, helt.captured.length, `chunkstorlek ${storlek}`);
    for (let i = 0; i < helt.captured.length; i += 1) {
      assert.equal(
        delat.captured[i].value,
        helt.captured[i].value,
        `chunkstorlek ${storlek}, värde ${i}`
      );
    }
  }
});

test('rundgång: många slumpade meddelanden ger giltig JSON', async () => {
  // Det billigaste sättet att fånga felplacerade kommatecken. Enskilda
  // assertions ser rätt ut även när strukturen är trasig; JSON.parse gör inte
  // det.
  const meddelanden = {};
  for (let i = 0; i < 200; i += 1) {
    meddelanden[`raw-${i}`] = {
      id: `raw-${i}`,
      subject: `Ämne ${i} med "citat" och \\ tecken`,
      bodyText: `Brödtext ${i}\nrad två`,
      bodyPreview: `Preview ${i}`,
      rawJson: {
        headers: { from: `a${i}@b.se`, to: ['c@d.se', 'e@f.se'] },
        body: `Innehåll med } och { och \\"escape\\" ${i}`,
        nested: { deep: { deeper: [{ x: i }, null, true] } },
      },
    };
  }
  const { parsed, captured, stats } = await run(
    JSON.stringify({ version: 1, mailRawMessages: meddelanden })
  );

  assert.equal(stats.depthAtEnd, 0);
  assert.equal(captured.length, 400, 'ett bodyText och ett rawJson per meddelande');
  for (let i = 0; i < 200; i += 1) {
    const m = parsed.mailRawMessages[`raw-${i}`];
    assert.deepEqual(m.rawJson, {});
    assert.equal(m.bodyText, '');
    assert.equal(m.bodyPreview, `Preview ${i}`);
    assert.equal(m.subject, `Ämne ${i} med "citat" och \\ tecken`);
  }
});
