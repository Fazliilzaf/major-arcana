'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  tolkaNavPost,
  lasNavigation,
  distinktaPaneler,
  jamforMotFacit,
} = require('../../src/infra/personalportalensVyer');

const FACIT = require('../../config/personalportalens-vyer.json');
const HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'staff-portal.html'),
  'utf8'
);

/**
 * ORD-212 — baslinjen för personalportalens vyer, som en mätning i stället
 * för en siffra i ett dokument.
 *
 * Baslinjen 2026-09-03 skrev "24 nav-etiketter … kvar: 21 vyer". Ett dygn
 * senare var det 3 roller och 26 paneler, och radnumren pekade på annan kod.
 * Dokumentet hade inte fel när det skrevs — det åldrades, tyst.
 */

const NAV = lasNavigation(HTML);

test('rollerna är exakt tre — inte fler, inte färre', () => {
  /**
   * FÖRSTA PARSERN HITTADE FEM. Två andra objekt på samma indrag matchade
   * roll-regexen, och `indexOf('nav: [')` framåt gav dem sjuksköterskans nav.
   * De två falska var kopior av en riktig och såg därför fullt trovärdiga ut.
   *
   * Testet finns för att den sortens bortfall inte ska kunna se ut som ett
   * resultat.
   */
  assert.deepEqual(Object.keys(NAV).sort(), ['admin', 'doctor', 'nurse']);
});

test('ÖPPNA TIDER ÄR MED — posten som föll bort ur första mätningen', () => {
  /**
   * ORD-191 skrev en fyra rader lång kommentar mellan `{ section: 'Schema' }`
   * och `{ id: 'availability' }`. Den delare som användes krävde `{` direkt
   * efter blanktecken, så de två slogs ihop, `section` matchade först, och
   * vyn föll bort.
   *
   * Alltså den NYASTE vyn — den som har mest kommentar runt sig för att den
   * är mest omdiskuterad. Samma familj som Loopias kapade brevlådelista: ett
   * bortfall ser exakt ut som ett komplett resultat.
   */
  const idn = NAV.admin.filter((p) => p.typ === 'panel').map((p) => p.id);
  assert.ok(idn.includes('availability'), 'Öppna tider saknas i mätningen igen');
});

test('kommentarer räknas inte som nav-poster', () => {
  // Motprovet mot rättelsen ovan: strippningen får inte vara så aggressiv att
  // den äter riktiga poster, och inte så slapp att den släpper in kommentarer.
  const alla = Object.values(NAV).flat();
  for (const p of alla) {
    if (p.typ === 'avsnitt') assert.ok(p.namn && !p.namn.includes('//'));
    else assert.match(p.id, /^[a-z][a-z0-9-]*$/, `"${p.id}" ser inte ut som ett panel-id`);
  }
});

test('EN BORTKOMMENTERAD NAV-POST RÄKNAS INTE', () => {
  /**
   * Mutationen som tog bort kommentar-strippningen ÖVERLEVDE först: efter att
   * delaren bytts mot balanserade klamrar föll inte längre Öppna tider bort,
   * så strippningen såg onödig ut. Den är den inte — den skyddar mot det
   * omvända felet.
   *
   * Att kommentera bort en vy är precis hur man tar en ur drift tillfälligt.
   * Räknas den ändå säger baslinjen att portalen har en vy som ingen kan nå.
   */
  const html = `
        const ROLES = {
          nurse: {
            nav: [
              { section: 'Test' },
              { id: 'riktig', icon: 'x', label: 'Riktig' },
              // { id: 'avstangd', icon: 'x', label: 'Avstängd' },
            ],
          },
        };
  `;
  const idn = (lasNavigation(html).nurse || []).filter((p) => p.typ === 'panel').map((p) => p.id);
  assert.deepEqual(idn, ['riktig'], 'en bortkommenterad vy räknades som levande');
});

test('jamforMotFacit ser även vyer som FINNS I FACIT men inte i koden', () => {
  /**
   * Andra riktningen, som ingen av mutationerna mot den riktiga portalen nådde
   * — där slår `saknasIFacit` till först. Utan det här testet kunde
   * `saknasIKoden` returnera tom lista rakt av och allt förbli grönt.
   *
   * Riktningen spelar roll: en vy som tagits bort ur portalen men står kvar i
   * facit gör att facit beskriver något som inte finns, och nästa läsare
   * planerar utifrån en vy som inte går att öppna.
   */
  const r = jamforMotFacit(['a', 'b'], { a: {}, b: {}, borttagen: {} });
  assert.equal(r.stammer, false);
  assert.deepEqual(r.saknasIKoden, ['borttagen']);
  assert.deepEqual(r.saknasIFacit, []);

  const tvartom = jamforMotFacit(['a', 'ny'], { a: {} });
  assert.deepEqual(tvartom.saknasIFacit, ['ny']);
  assert.deepEqual(tvartom.saknasIKoden, []);

  assert.equal(jamforMotFacit(['a'], { a: {} }).stammer, true, 'lika listor ska stämma');
});

test('tolkaNavPost skiljer avsnitt, panel och utgående länk', () => {
  assert.deepEqual(tolkaNavPost("{ section: 'Schema' }"), { typ: 'avsnitt', namn: 'Schema' });

  const panel = tolkaNavPost("{ id: 'audit', icon: 'x', label: 'Audit-logg' }");
  assert.equal(panel.typ, 'panel');
  assert.equal(panel.id, 'audit');

  // Kalendern lämnar portalen. Den är en länk, inte en panel — och ska inte
  // räknas som en vy portalen ansvarar för.
  const lank = tolkaNavPost("{ id: 'kalender', icon: 'x', label: 'K', href: '/kalender.html' }");
  assert.equal(lank.typ, 'lank');
  assert.equal(lank.href, '/kalender.html');
});

test('NAVIGATIONEN STÄMMER MED FACIT — i båda riktningarna', () => {
  /**
   * En panel i koden men inte i facit är en vy ingen tagit ställning till:
   * den kan vara en kuliss som ser levande ut. En panel i facit men inte i
   * koden betyder att facit beskriver en portal som inte finns.
   *
   * Båda är fel, och den ena upptäcks inte av ett test som bara räknar.
   */
  const uppmatta = distinktaPaneler(NAV);
  const r = jamforMotFacit(uppmatta, FACIT.paneler);
  assert.deepEqual(r.saknasIFacit, [], 'nya vyer utan status i facit');
  assert.deepEqual(r.saknasIKoden, [], 'facit beskriver vyer som inte finns');
  assert.equal(uppmatta.length, FACIT._matt_2026_09_04.distinktaPaneler);
});

test('PANEL_TARGET har en post per panel — oberoende kontroll av listan', () => {
  /**
   * Andra vägen in på samma fråga. Navigationen och deep-link-tabellen skrivs
   * på olika ställen i filen; att de råkar ha samma antal av misstag är
   * osannolikt, medan att BÅDA missar samma vy är precis vad som händer när
   * någon lägger till en panel och glömmer halva inkopplingen.
   */
  const start = HTML.indexOf('const PANEL_TARGET = {');
  assert.notEqual(start, -1);
  const slut = HTML.indexOf('\n      };', start);
  const kropp = HTML.slice(start, slut).replace(/^[ \t]*\/\/.*$/gm, '');
  const nycklar = [...kropp.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:/gm)].map((m) => m[1]);

  assert.deepEqual(nycklar.sort(), distinktaPaneler(NAV), 'PANEL_TARGET och navigationen glider');
});

test('de fem kulisserna står kvar som kulisser — och skälet står med', () => {
  /**
   * Baslinjen fann fem hårdkodade vyer 2026-09-03. Ingen har byggts sedan
   * dess. Testet håller siffran ärlig åt båda hållen: byggs en av dem ska
   * facit uppdateras, och tillkommer en ny kuliss ska den räknas.
   */
  const kulisser = Object.entries(FACIT.paneler)
    .filter(([, v]) => v.status === 'kuliss')
    .map(([k]) => k)
    .sort();
  assert.deepEqual(kulisser, ['catalog', 'docs', 'history', 'overview', 'staff']);

  for (const id of kulisser) {
    assert.ok(FACIT.paneler[id]._not, `${id} saknar skäl — status utan skäl är en gissning`);
  }
});

test('en levande panel måste ha en endpoint, en kuliss får inte ha en', () => {
  /**
   * Utan den här regeln kan status sättas till "levande" på vad som helst,
   * och facit blir en önskelista i stället för en mätning.
   */
  for (const [id, v] of Object.entries(FACIT.paneler)) {
    if (v.status === 'levande' || v.status === 'tom') {
      assert.match(v.endpoint || '', /^\/api\//, `${id}: status ${v.status} utan endpoint`);
    } else {
      assert.equal(v.status, 'kuliss', `${id}: okänd status "${v.status}"`);
      assert.equal(v.endpoint, undefined, `${id}: kuliss med endpoint — mät om`);
    }
  }
});

test('PERSONALÖVERSIKT ÄR EN KULISS trots att /staff/team hämtas', () => {
  /**
   * Fällan som nästan lurade mätningen. Endpointen finns i filen, så en
   * grep-baserad klassificering hade sagt "levande". Svaret går till
   * `_staffTeam` — listan i tilldelningsrullgardinen — och rör aldrig panelen.
   *
   * En endpoint i filen är inte en endpoint i vyn.
   */
  assert.equal(FACIT.paneler.staff.status, 'kuliss');
  assert.match(HTML, /_staffTeam = Array\.isArray\(data\.staff\)/);
  assert.ok(!/liveStaffOverview|liveTeamList/.test(HTML), 'panelen har fått en live-behållare');
});
