'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailTemplateStore } = require('../../src/ops/ccoMailTemplateStore');

/**
 * ORD-216 — mallistan.
 *
 * Kommunikationspanelen hämtade mallar från `/api/v1/cco-comm/templates`.
 * Den rutten finns inte någonstans i kodbasen. `catch` satte tom lista, så
 * panelen visade "Inga mallar matchar" — ett svar på en sökning användaren
 * inte gjort — i stället för att säga att hämtningen misslyckades.
 *
 * Den riktiga rutten fanns hela tiden: `/cco/runtime/mail-templates`.
 *
 * MEN ATT BARA PEKA OM HADE INFÖRT ETT SÄMRE FEL. Panelen skickade redan
 * `?brand=curatiio`, och storen sa själv "Mallar är globala i denna MVP". En
 * Curatiio-konversation hade alltså visat Hair TP:s mallar, och personalen
 * kunnat skicka hårklinikens formuleringar till en ögonlockspatient — exakt
 * den familj av fel som ORD-203…211 ägnade dagen åt att stänga.
 */

async function nyStore(templates = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord216-'));
  const filePath = path.join(dir, 'mallar.json');
  const store = await createCcoMailTemplateStore({ filePath });
  for (const t of templates) await store.saveTemplate(t);
  return store;
}

test('normalizeBrand: två stavningar av samma klinik ger samma värde', async () => {
  /**
   * Panelen säger `hair_tp`. Resten av kodbasen säger `hair-tp-clinic`. Om de
   * landade på olika värden hade en mall sparad från ett håll blivit osynlig
   * från det andra — ett fel som bara visar sig som "mallen är borta".
   */
  const store = await nyStore();
  const { normalizeBrand } = store;
  assert.equal(normalizeBrand('hair_tp'), 'hair_tp');
  assert.equal(normalizeBrand('hair-tp-clinic'), 'hair_tp');
  assert.equal(normalizeBrand('HAIR-TP'), 'hair_tp');
  assert.equal(normalizeBrand('curatiio'), 'curatiio');
  assert.equal(normalizeBrand('Curatiio'), 'curatiio');
});

test('OKÄND klinik blir GEMENSAM, inte en klinik', async () => {
  /**
   * En felstavning får inte tyst binda mallen till fel klinik — då försvinner
   * den ur den andra klinikens lista utan att någon förstår varför. Gemensam
   * är det synliga felet: mallen dyker upp på båda ställena.
   */
  const store = await nyStore();
  assert.equal(store.normalizeBrand('curatio'), null, 'felstavat band till en klinik');
  assert.equal(store.normalizeBrand('hairtpclinic.com'), null);
  assert.equal(store.normalizeBrand(''), null);
  assert.equal(store.normalizeBrand(null), null);
});

test('EN KLINIK SER ALDRIG DEN ANDRAS MALLAR — kärnan i rättelsen', async () => {
  const store = await nyStore([
    { label: 'HTP bekräftelse', body: 'Hej från Hair TP', brand: 'hair_tp' },
    { label: 'CUR bekräftelse', body: 'Hej från Curatiio', brand: 'curatiio' },
    { label: 'Gemensam kvittens', body: 'Tack för ditt mejl' },
  ]);

  const htp = store.listTemplates({ brand: 'hair_tp' }).map((t) => t.label);
  assert.ok(htp.includes('HTP bekräftelse'));
  assert.ok(htp.includes('Gemensam kvittens'), 'gemensamma ska följa med');
  assert.ok(!htp.includes('CUR bekräftelse'), 'Hair TP ser Curatiios mall');

  const cur = store.listTemplates({ brand: 'curatiio' }).map((t) => t.label);
  assert.ok(cur.includes('CUR bekräftelse'));
  assert.ok(cur.includes('Gemensam kvittens'));
  assert.ok(!cur.includes('HTP bekräftelse'), 'Curatiio ser Hair TP:s mall');
});

test('UTAN brand returneras allt — befintliga anropare är oförändrade', async () => {
  /**
   * Storen SEEDAR standardmallar vid första start. Min första version av det
   * här testet räknade absolut (3) och gick rött mot korrekt kod — mätningen
   * glömde att fatet inte var tomt när den började mäta.
   *
   * Räkningen är därför relativ: hur många FLER blev det.
   */
  const tomStore = await nyStore();
  const seedade = tomStore.listTemplates().length;
  assert.ok(seedade > 0, 'inga seedade mallar — testets premiss stämmer inte längre');

  const store = await nyStore([
    { label: 'A', body: 'a', brand: 'hair_tp' },
    { label: 'B', body: 'b', brand: 'curatiio' },
    { label: 'C', body: 'c' },
  ]);
  assert.equal(store.listTemplates().length, seedade + 3);
  assert.equal(store.listTemplates({}).length, seedade + 3);
});

test('BEFINTLIGA MALLAR utan brand blir gemensamma — ingen försvinner', async () => {
  /**
   * Uppgraderingen får inte gömma något. Mallar som sparades innan fältet
   * fanns saknar det, och måste synas för båda klinikerna precis som förut.
   */
  const store = await nyStore([{ label: 'Gammal', body: 'skriven före ORD-216' }]);
  const sparad = store.listTemplates().find((t) => t.label === 'Gammal');
  assert.ok(sparad, 'mallen sparades inte');
  assert.equal(sparad.brand, null, 'saknat brand ska bli null, inte undefined');
  for (const brand of ['hair_tp', 'curatiio']) {
    const etiketter = store.listTemplates({ brand }).map((t) => t.label);
    assert.ok(etiketter.includes('Gammal'), `${brand} tappade den gamla mallen`);
  }

  // Och de SEEDADE standardmallarna får inte heller försvinna för någon.
  const alla = store.listTemplates().length;
  for (const brand of ['hair_tp', 'curatiio']) {
    assert.equal(
      store.listTemplates({ brand }).length,
      alla,
      `${brand} tappade seedade mallar — de saknar brand och är alltså gemensamma`
    );
  }
});

// ── Inkoppling: route och panel ────────────────────────────────────────────

const ROT = path.join(__dirname, '..', '..');
const ROUTE = fs.readFileSync(path.join(ROT, 'src', 'routes', 'ccoConversation.js'), 'utf8');
const PANEL = fs.readFileSync(path.join(ROT, 'public', 'cco-komm-panel.js'), 'utf8');

test('ROUTEN skickar brand vidare och redovisar vilken filtrering som gällde', () => {
  assert.match(ROUTE, /listTemplates\(\{ brand \}\)/, 'routen filtrerar inte');
  assert.match(ROUTE, /appliedBrand: brand/, 'svaret säger inte vilken filtrering som gällde');
});

test('PANELEN anropar den route som faktiskt finns', () => {
  assert.match(PANEL, /\/api\/v1\/cco\/runtime\/mail-templates\?brand=/, 'fel route');

  /**
   * KOMMENTARERNA BORT FÖRST. Förklaringen till rättelsen citerar den gamla
   * rutten, och ett rått mönster träffar citatet — testet underkände sin egen
   * dokumentation. Tredje gången i dag samma fälla: att läsa en kommentar och
   * kalla den kod.
   */
  const utanKommentarer = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/cco-comm\/templates/.test(utanKommentarer),
    'den obefintliga rutten anropas fortfarande'
  );
});

test('PANELEN kraschar inte på storens form', () => {
  /**
   * Renderaren anropar `tpl.channel.toUpperCase()` och `tpl.mergeFields.length`
   * rakt av. Storen har varken `channel` eller `mergeFields`. Utan anpassning
   * hade omkopplingen bytt en tom lista mot ett kastat undantag.
   */
  assert.match(PANEL, /function anpassaMall\(/, 'anpassningen saknas');

  const kropp = PANEL.slice(PANEL.indexOf('function anpassaMall('));
  const slut = kropp.indexOf('\n  }');
  const fn = kropp.slice(0, slut);
  for (const falt of ['channel', 'mergeFields', 'subject', 'bodyMarkdown', 'journeyStep']) {
    assert.match(fn, new RegExp(falt), `${falt} defaultas inte`);
  }
  assert.match(fn, /Array\.isArray\(raw\.mergeFields\)/, 'mergeFields kan bli undefined');
});

test('PANELEN skiljer trasig hämtning från tom lista', () => {
  assert.match(PANEL, /function commTemplatesFel\(/, 'felstatusen finns inte');
  assert.match(PANEL, /Mallarna kunde inte hämtas/, 'felet visas inte för användaren');
  assert.match(PANEL, /Kliniken har inga mallar ännu/, 'tomt läge saknar egen text');
  // Och den gamla lögnen ska inte vara enda utvägen längre.
  assert.match(PANEL, /const fel = commTemplatesFel\(\);/);
});
