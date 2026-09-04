'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const vm = require('node:vm');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const server = require('../../src/ops/kundresan');

/**
 * ORD-200 §3 — servern och webbläsaren måste ge SAMMA svar.
 *
 * Det räckte inte att bygga en serverberäkning. Så länge vyerna räknade själva
 * fanns problemet kvar — det hade bara flyttat in en fjärde uträkning bredvid
 * de tre gamla.
 *
 * Lösningen är att det är SAMMA FIL. src/ops/kundresan.js serveras på
 * /kundresan.js och laddas av index.html. Testerna nedan kör den i en
 * webbläsarliknande sandlåda (utan `module`) och jämför svaren rad för rad mot
 * serverns.
 *
 * Klarar en portad kopia det här testet i dag glider den ändå isär i morgon.
 * Poängen är att det INTE finns någon kopia att glida.
 */

const KALLA = path.join(__dirname, '..', '..', 'src', 'ops', 'kundresan.js');
const FACIT = require('../../config/kundresan-13-steg.json');

/** Kör filen som en webbläsare gör: ingen `module`, bara ett globalt objekt. */
function laddaSomWebblasare() {
  const kod = fs.readFileSync(KALLA, 'utf8');
  const sandlada = { globalThis: null, console };
  sandlada.globalThis = sandlada;
  vm.createContext(sandlada);
  vm.runInContext(kod, sandlada, { filename: 'kundresan.js' });
  assert.ok(sandlada.ArcanaKundresa, 'filen ska exponera ArcanaKundresa i webbläsaren');
  return sandlada.ArcanaKundresa.skapaKundresa(FACIT);
}

const FALL = [
  ['tom kund', {}],
  ['ABBE: bokning + signerad HD', { bookingCount: 1, hasHealthDeclaration: true }],
  ['journal finns', { bookingCount: 1, hasHealthDeclaration: true, hasJournal: true }],
  ['PRP — icke-kirurgisk', { treatmentTypes: ['PRP hår'], bookingCount: 2 }],
  ['ögonlocksplastik — kirurgi', { treatmentTypes: ['Övre ögonlocksplastik'] }],
  [
    'allt klart',
    {
      bookingCount: 1,
      hasHealthDeclaration: true,
      hasJournal: true,
      hasTreatmentPlan: true,
      coolingOffPassed: true,
      hasAgreement: true,
      hasFitnessCertificate: true,
      hasPhotoConsent: true,
      treatmentDone: true,
      depositPaid: true,
      followUpComplete: true,
      hasPublishConsent: true,
    },
  ],
  ['överhoppade steg', { skipSteps: [8, 9], bookingCount: 1 }],
];

test('webbläsaren och servern ger IDENTISKA svar på varje fall', () => {
  const klient = laddaSomWebblasare();
  for (const [namn, kort] of FALL) {
    const s = server.beraknaKundresa(kort);
    const k = klient.beraknaKundresa(kort);
    assert.deepEqual(
      { steg: k.steg, av: k.av, klara: k.klara, aktivt: k.aktivt, variant: k.variant },
      { steg: s.steg, av: s.av, klara: s.klara, aktivt: s.aktivt, variant: s.variant },
      `"${namn}" gav olika svar`
    );
  }
});

test('och identiska steglistor, inte bara identiska summor', () => {
  // Två uträkningar kan råka landa på samma tal och ändå ha olika bild av
  // vilka steg som är klara. Då syns skillnaden i listan, inte i rubriken.
  //
  // JSON på båda sidor: objekt födda inne i en vm-sandlåda har en annan
  // Array-prototyp än nodens egna, och deepEqual i strict-läge jämför även
  // prototypen. Utan serialiseringen jämför testet realm, inte innehåll — och
  // hade varit rött oavsett hur lika svaren är.
  const klient = laddaSomWebblasare();
  const platt = (r) => JSON.parse(JSON.stringify(r.lista.map((x) => [x.steg, x.status])));
  for (const [namn, kort] of FALL) {
    assert.deepEqual(
      platt(klient.beraknaKundresa(kort)),
      platt(server.beraknaKundresa(kort)),
      `"${namn}" gav olika steglistor`
    );
  }
});

test('filen fungerar i BÅDA miljöerna — inte en som råkar gå i test', () => {
  // Node-vägen sätter module.exports, webbläsarvägen sätter globalThis.
  // Bryts den ena tyst är hela poängen borta.
  assert.equal(typeof server.beraknaKundresa, 'function', 'Node-vägen');
  assert.equal(typeof laddaSomWebblasare().beraknaKundresa, 'function', 'webbläsarvägen');
});

/* ── vyerna ───────────────────────────────────────────────────────────── */

const APP = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app');
const las = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

/**
 * Kod utan kommentarer.
 *
 * Testet nedan letar efter ett mönster som med AVSIKT står kvar i en kommentar:
 * beskrivningen av vad felet var. Samma fälla har slagit till två gånger förut
 * i dag — testet går rött på min egen förklaring, och frestelsen blir att tona
 * ner kravet i stället för att strippa kommentarerna.
 */
function utanKommentarer(kod) {
  return kod
    .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

test('doneCount-fallbacken är BORTA ur referensvyn', () => {
  // Felet som startade allt: saknades ett aktivt steg visades ANTALET
  // AVKLARADE som om det vore det aktuella.
  const kod = utanKommentarer(las('cco-kundkort-referens.js')).replace(/\s+/g, ' ');
  assert.ok(
    !/\? active\.id : doneCount/.test(kod),
    'cur får inte längre falla tillbaka på doneCount'
  );
  assert.match(kod, /\? active\.id : null/, 'okänt steg ska bli null');
  // Kontroll att strippningen inte gjort testet tandlöst: förklaringen ska
  // fortfarande stå kvar i filen.
  assert.match(las('cco-kundkort-referens.js'), /doneCount/, 'förklaringen ska finnas kvar');
});

test('nämnaren 9 är borta — den räknas nu', () => {
  const kod = las('cco-kundkort-referens.js');
  assert.ok(
    !/polishReferensJourney\(canonicalJourney, steps, cur, 9\)/.test(kod),
    'total får inte skickas in som hårdkodad nia'
  );
  assert.match(kod, /polishReferensJourney\(canonicalJourney, steps, cur, steps\.length\)/);
});

test('minivyn visar "—" i stället för "Steg 0"', () => {
  // `cur || 0` ritade kunden som stående före början av sin egen resa.
  const kod = las('cco-v13-render.js');
  assert.ok(!/'<span class="step-badge">Steg ' \+\s*\(cur \|\| 0\)/.test(kod));
  assert.match(kod, /cur != null && cur > 0 \? cur : '—'/);
});

test('klara + pågår + kommande summerar till nämnaren', () => {
  // Stod "1 klara · 1 pågår · 12 kommande" med total 13 — fjorton av tretton.
  // Kommande räknades ur STEGNUMRET i stället för ur stegens tillstånd.
  const kod = las('cco-v13-render.js');
  assert.ok(!/Math\.max\(0, total - \(cur > 0 \? cur : 0\)\)/.test(kod), 'gamla formeln ska bort');
  assert.match(kod, /var kommande = Math\.max\(0, total - done - pagar\);/);
});

test('adaptern använder den kanoniska beräkningen när den finns', () => {
  const kod = las('cco-v11-rail-adapters.js');
  assert.match(kod, /global\.ArcanaKundresa/);
  assert.match(kod, /skapaKundresa/);
  assert.match(kod, /kalla: 'kanon'/, 'svaret ska säga varifrån det kom');
});

test('vyn laddar SERVERNS fil, inte en kopia i app-katalogen', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'index.html'),
    'utf8'
  );
  assert.match(html, /src="\/kundresan\.js/, 'serverns fil');
  assert.match(html, /src="\/kundresan-facit\.js/, 'och serverns facit');
  assert.ok(
    !fs.existsSync(path.join(APP, 'kundresan.js')),
    'det får INTE finnas en kopia i app-katalogen'
  );
});

/* ── rutterna ─────────────────────────────────────────────────────────── */

async function medPortal(run) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord200c-'));
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: () => {}, query: () => [] },
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'u-1', tenantId: 'hair-tp-clinic', role: 'personal' };
          req.cco = { role: 'personal' };
          next();
        },
      })
    );
    const srv = http.createServer(app);
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      await run(`http://127.0.0.1:${srv.address().port}`);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('/kundresan.js serverar exakt samma byte som servern kör', async () => {
  await medPortal(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/kundresan.js`);
    assert.equal(res.status, 200);
    const levererad = await res.text();
    assert.equal(levererad, fs.readFileSync(KALLA, 'utf8'), 'filen får inte skilja sig en byte');
  });
});

test('facit-skriptet sätter globalen vyn väntar sig', async () => {
  await medPortal(async (baseUrl) => {
    const js = await fetch(`${baseUrl}/kundresan-facit.js`).then((r) => r.text());
    assert.match(js, /globalThis\.ArcanaKundresanFacit = /);
    const sandlada = { globalThis: null };
    sandlada.globalThis = sandlada;
    vm.createContext(sandlada);
    vm.runInContext(js, sandlada);
    assert.equal(sandlada.ArcanaKundresanFacit.steg.length, 13);
  });
});
