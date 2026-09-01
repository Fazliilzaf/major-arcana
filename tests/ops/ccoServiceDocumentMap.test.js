'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { dokumentForTjanst, harledGrupp, GRUND } = require('../../src/ops/ccoServiceDocumentMap');
const katalog = require('../../src/ops/hairtp-document-types.catalog.json');
const tjansteKatalog = require('../../src/ops/cco-service-catalog.json');

/**
 * ORD-148 byggd. Svaren gavs 2026-08-30 och låg i en order i tre dagar utan att
 * nå katalogen — 0 av 62 rader hade serviceIds när det byggdes 2026-09-01.
 *
 * Det som kan gå fel är inte "glömde ett JA". Det är journalmatchningen:
 * kolumnerna är ömsesidigt uteslutande, och en botoxrad som råkar bära alla tre
 * ger kundkortet tre journaler på en behandling. Det märks inte i en diff.
 */

const TJANSTER = (() => {
  const A = Array.isArray(tjansteKatalog)
    ? tjansteKatalog
    : tjansteKatalog.services || Object.values(tjansteKatalog).find(Array.isArray) || [];
  return A.filter((s) => s && s.apiId != null);
})();

const RADER = Array.isArray(katalog)
  ? katalog
  : katalog.documents || Object.values(katalog).find(Array.isArray);

test('varje tjänst i katalogen hamnar i en grupp', () => {
  const utan = TJANSTER.filter((s) => !harledGrupp(s)).map((s) => `${s.apiId} ${s.name}`);
  assert.deepEqual(
    utan,
    [],
    'En ny tjänst som ingen regel fångar får inga dokument alls — personalen ' +
      'ser en bokning utan papper och märker det först i rummet:\n' +
      utan.map((u) => `  - ${u}`).join('\n')
  );
});

test('ingen tjänst bär mer än en estetikjournal', () => {
  // ORD-148 §3, ordagrant: "En botoxrad ska bära botox, inte alla tre."
  const JOURNALER = ['journal_estetik_botox', 'journal_estetik_filler', 'journal_estetik_profhilo'];
  const krock = TJANSTER.map((s) => ({ s, d: dokumentForTjanst(s).dokument }))
    .filter(({ d }) => JOURNALER.filter((j) => d.includes(j)).length > 1)
    .map(
      ({ s, d }) => `${s.apiId} ${s.name}: ${JOURNALER.filter((j) => d.includes(j)).join(', ')}`
    );

  assert.deepEqual(krock, [], `Flera journaler på en behandling:\n${krock.join('\n')}`);
});

test('grunddokumenten finns på varje tjänst', () => {
  const brister = [];
  for (const s of TJANSTER) {
    const { dokument } = dokumentForTjanst(s);
    const saknade = GRUND.filter((g) => !dokument.includes(g));
    if (saknade.length) brister.push(`${s.apiId} ${s.name}: saknar ${saknade.join(', ')}`);
  }
  assert.deepEqual(
    brister,
    [],
    'Ägarbeslut 2026-08-30: id_verifiering och de andra grunddokumenten gäller ' +
      'överallt, utan undantag:\n' +
      brister.join('\n')
  );
});

test('katalogens serviceIds stämmer med regeln, rad för rad', () => {
  // Katalogen är genererad ur ccoServiceDocumentMap. Skiljer de sig har någon
  // handredigerat JSON:en — och då är regeln inte längre sanningen om systemet.
  const forvantat = new Map();
  for (const s of TJANSTER) {
    for (const d of dokumentForTjanst(s).dokument) {
      if (!forvantat.has(d)) forvantat.set(d, []);
      forvantat.get(d).push(String(s.apiId));
    }
  }

  const fel = [];
  for (const rad of RADER) {
    const vantat = (forvantat.get(rad.id) || []).slice().sort();
    const faktiskt = (rad.serviceIds || []).slice().sort();
    if (vantat.length === 0 && faktiskt.length === 0) continue;

    if (vantat.join() !== faktiskt.join()) {
      const extra = faktiskt.filter((x) => !vantat.includes(x));
      const saknas = vantat.filter((x) => !faktiskt.includes(x));
      fel.push(
        `${rad.id}: ${faktiskt.length} i katalogen, ${vantat.length} enligt regeln` +
          (extra.length ? ` · för mycket: ${extra.join(',')}` : '') +
          (saknas.length ? ` · saknas: ${saknas.join(',')}` : '')
      );
    }
  }

  assert.deepEqual(fel, [], `Katalogen och regeln har glidit isär:\n${fel.join('\n')}`);
});

test('inget serviceId pekar på en tjänst som inte finns', () => {
  const kanda = new Set(TJANSTER.map((s) => String(s.apiId)));
  const spoken = [];
  for (const rad of RADER) {
    for (const id of rad.serviceIds || []) {
      if (!kanda.has(String(id))) spoken.push(`${rad.id} → ${id}`);
    }
  }
  assert.deepEqual(
    spoken,
    [],
    'Ett dokument väntar på en tjänst som tagits bort ur tjänstekatalogen:\n' + spoken.join('\n')
  );
});

test('konsultationen för estetiska injektioner öppnar ingen journal', () => {
  // Ägarbeslut 2026-09-01. Botox, filler och profhilo har skilda journaler och
  // vilken det blir vet man först efter konsultationen. En tom journal av fel
  // sort är värre än ingen — den ser ifylld ut i kundkortet.
  const s = TJANSTER.find((x) => String(x.apiId) === '8694');
  assert.ok(s, '8694 Estetiska injektioner · Konsultation saknas i tjänstekatalogen');
  const { dokument } = dokumentForTjanst(s);
  const journaler = dokument.filter((d) => d.startsWith('journal_'));
  assert.deepEqual(journaler, [], `8694 ska inte bära någon journal, bar: ${journaler.join(', ')}`);
  assert.ok(dokument.includes('konsultationsmall'), 'men konsultationsmallen ska finnas');
});
