'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmexCsv, matchAmexCsv } = require('../../src/cm/cmAmexMatch');

const CSV = `Datum,Beskrivning,Belopp,Extra
04/24/2024,Alibaba.Com Singapore,"10.099,19",x
04/24/2024,"BOLT OPERATIONS OU TALLINN","212,50",x
04/25/2024,GETSMARTER CAPE TOWN,"14.360,00",x
05/01/2024,BETALNING MOTTAGEN TACK,"-40.000,00",x`;

test('parseAmexCsv: sv-belopp, MM/DD/YYYY, hoppar krediter', () => {
  const r = parseAmexCsv(CSV);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0], {
    datum: '2024-04-24',
    beskrivning: 'Alibaba.Com Singapore',
    belopp: 10099.19,
  });
});

test('matchAmexCsv: exakt en träff fyller tomt belopp; tvetydig/ingen rörs ej', () => {
  const records = [
    { id: 'r1', supplierName: 'GetSmarter', amountIncVat: 0, rawItemId: 'w1', date: '' },
    { id: 'r2', supplierName: 'Bolt', amountIncVat: 500, rawItemId: 'w2', date: '' },
    { id: 'r3', supplierName: 'Okänd AB', amountIncVat: 0, rawItemId: 'w3', date: '' },
  ];
  const raws = {
    w1: { receivedAt: '2024-04-25T10:00:00Z', fromEmail: 'x@getsmarter.com' },
    w3: { receivedAt: '2024-04-24', fromEmail: 'a@okand.se' },
  };
  const fyllda = {};
  const store = {
    getInbox: () => records,
    getNeedsReview: () => [],
    getRawItemById: (id) => raws[id] || null,
    applyReextraction: (id, ex) => {
      fyllda[id] = ex.amountIncVat;
      return { changed: ['amountIncVat'] };
    },
  };
  const res = matchAmexCsv({ cmStore: store, csvText: CSV });
  assert.equal(res.filled, 1);
  assert.equal(fyllda.r1, 14360);
  assert.equal(fyllda.r2, undefined); // hade redan belopp
  assert.equal(fyllda.r3, undefined); // ingen namnmatch
});
