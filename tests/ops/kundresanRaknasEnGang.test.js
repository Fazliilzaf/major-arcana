'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { beraknaKundresa, valjVariant, STEG, STATUS } = require('../../src/ops/kundresan');
const FACIT = require('../../config/kundresan-13-steg.json');

/**
 * ORD-200 — kundresan räknas på ett ställe.
 *
 * FELET SOM UTLÖSTE DET HÄR. Samma kund visade "STEG 1 AV 13" i lådan och
 * "STEG 4 AV 13" i kundkortet. Tre uträkningar av samma tal:
 *
 *   buildJourneyFromState()   cur: activeStep || null     total: steps.length
 *   polishReferensJourney()   cur: ... ?? doneCount       total: 9 (hårdkodat)
 *   journeyMini() / hero()    cur saknas → 0 resp. null   total: två källor
 *
 * Den värsta var doneCount: saknades ett aktivt steg visades ANTALET AVKLARADE
 * som om det vore det aktuella. Abbes hälsodeklaration var signerad — ett steg
 * klart — och skärmen skrev "steg 1". Ett sant tal om något annat än det det
 * påstod sig beskriva.
 *
 * Testerna nedan är byggda runt just den förväxlingen.
 */

test('facit har tretton steg och de är numrerade 1–13', () => {
  assert.equal(STEG.length, 13);
  assert.deepEqual(
    STEG.map((s) => s.steg),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  );
});

test('ABBE-FALLET: ett klart steg mitt i resan ger INTE "steg 1"', () => {
  // Exakt situationen från skärmbilden. Hälsodeklarationen (steg 3) är
  // signerad; steg 1 och 2 är avklarade eftersom bokningen finns. Aktivt steg
  // är alltså 4 — Konsultation. doneCount är 3. De två talen får aldrig
  // förväxlas igen.
  const resa = beraknaKundresa({
    bookingCount: 1,
    lastBookingAt: '2026-08-20T10:00:00.000Z',
    hasHealthDeclaration: true,
    hasJournal: false,
  });
  assert.equal(resa.steg, 4, 'aktivt steg är Konsultation');
  assert.equal(resa.aktivt, 'Konsultation');
  assert.equal(resa.klara, 3, 'tre steg är klara');
  assert.notEqual(resa.steg, resa.klara, 'aktuellt steg är INTE antalet klara');
});

test('vet vi inte steget blir det null — aldrig ett tal som råkar finnas', () => {
  // Kärnan i buggen. Alla steg klara → inget aktivt. Den gamla koden hade
  // returnerat doneCount (13) och påstått att kunden står på sista steget.
  const alltKlart = {
    bookingCount: 1,
    bookingConfirmationSentAt: '2026-01-01T00:00:00.000Z',
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
  };
  const resa = beraknaKundresa(alltKlart);
  assert.equal(resa.steg, null, 'inget aktivt steg → null, inte 13');
  assert.equal(resa.klara, 13);
  assert.equal(resa.procent, 100);
});

test('en helt ny kund står på steg 1, inte på noll', () => {
  const resa = beraknaKundresa({});
  assert.equal(resa.steg, 1);
  assert.equal(resa.klara, 0);
  assert.equal(resa.procent, 0);
});

test('nämnaren är antalet steg som GÄLLER kunden — inte 9, inte alltid 13', () => {
  // polishReferensJourney hårdkodade total: 9 medan rubriken sa 13. En kund
  // med överhoppade steg ska ha en nämnare som stämmer med hennes egen resa.
  const full = beraknaKundresa({ treatmentTypes: ['FUE hårtransplantation'] });
  assert.equal(full.av, 13, 'kirurgisk väg räknar alla tretton');

  const prp = beraknaKundresa({ treatmentTypes: ['PRP hår'] });
  assert.equal(prp.variant, 'nonSurgical');
  assert.equal(prp.av, 12, 'steg 8 hoppas över → tolv steg gäller');
  assert.ok(full.av !== prp.av, 'nämnaren följer kunden, inte en konstant');
});

test('SPÄRR ORD-129: ögonlocksplastik är kirurgi, aldrig icke-kirurgisk', () => {
  // Curatiio är inte synonymt med icke-kirurgiskt. Klassas bleph som
  // nonSurgical hoppas steg 8 friskförsäkran över på ett ingrepp som kräver
  // den — en patient opereras utan signerad försäkran.
  for (const typ of ['Övre ögonlocksplastik', 'Ögonlocksplastik', 'bleph-upper']) {
    const resa = beraknaKundresa({ treatmentTypes: [typ] });
    assert.equal(resa.variant, 'minorSurgery', `${typ} ska vara kirurgi`);
    const steg8 = resa.lista.find((r) => r.steg === 8);
    assert.notEqual(steg8.status, STATUS.HOPPAT, 'friskförsäkran får ALDRIG hoppas över');
    assert.equal(resa.av, 13);
  }
});

test('SPÄRR ORD-122: bildsamtycke hoppas aldrig över — GDPR', () => {
  // Varianten byter bara titeln. Gäller alla vägar.
  for (const typ of ['PRP hud', 'FUE hårtransplantation', 'Botox']) {
    const resa = beraknaKundresa({ treatmentTypes: [typ] });
    const steg9 = resa.lista.find((r) => r.steg === 9);
    assert.notEqual(steg9.status, STATUS.HOPPAT, `${typ}: samtycket ska finnas kvar`);
  }
  const prp = beraknaKundresa({ treatmentTypes: ['PRP hår'] });
  assert.equal(prp.lista.find((r) => r.steg === 9).titel, 'Bildsamtycke', 'bara titeln byts');
});

test('SPÄRR ORD-159: betänketiden hoppas inte över', () => {
  // Varianten bar tidigare skip:true på steg 6. Avtalet lovade sju dagars
  // betänketid (lag 2021:363) medan flödet inte visade steget alls.
  for (const variant of Object.keys(FACIT.varianter)) {
    const o = FACIT.varianter[variant]['6'];
    assert.ok(!o || o.skip !== true, `${variant} får inte hoppa över betänketiden`);
  }
});

test('en aktiv signal markerar steget som blockerat', () => {
  const resa = beraknaKundresa(
    { bookingCount: 1 },
    { signaler: [{ ruleId: 'customer.missing_health_declaration' }] }
  );
  const hd = resa.lista.find((r) => r.steg === 3);
  assert.equal(hd.blockerad, true, 'signalen ska synas på steget');
  assert.equal(resa.steg, 3, 'och det är där kunden står');
});

test('signalen matchas med OCH utan customer-prefix', () => {
  // Registret prefixar; kortet gör det inte alltid. Att bara känna igen den
  // ena formen hade gjort halva signalerna osynliga.
  for (const id of ['missing_journal', 'customer.missing_journal']) {
    const resa = beraknaKundresa(
      { bookingCount: 1, hasHealthDeclaration: true },
      { signaler: [{ ruleId: id }] }
    );
    assert.equal(resa.lista.find((r) => r.steg === 4).blockerad, true, id);
  }
});

test('svaret säger var det kommer ifrån', () => {
  // När vyerna byter till servern ska det gå att se i svaret att det ÄR
  // serverns tal — inte en gammal klientuträkning som råkar se likadan ut.
  assert.equal(beraknaKundresa({}).kalla, 'server');
});

test('stegen står INTE i beräkningen — annars är det en fjärde definition', () => {
  // Hela poängen. Fanns titlarna både i JSON och i JS vore problemet flyttat,
  // inte löst.
  const kod = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'kundresan.js'),
    'utf8'
  );
  for (const titel of ['Bokning konsultation', 'Hälsodeklaration', 'Friskförsäkran']) {
    assert.ok(!kod.includes(titel), `"${titel}" får inte stå i kundresan.js — den läses ur facit`);
  }
  assert.match(kod, /require\('\.\.\/\.\.\/config\/kundresan-13-steg\.json'\)/);
});

test('facit är ordagrant porterat från webbläsarkoden', () => {
  // Kontroll att JSON-filen inte glidit från CANONICAL_COPY. Gör den det finns
  // två sanningar igen, tyst.
  const kkx = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'app',
      'cco-kundkort-kkx.js'
    ),
    'utf8'
  );
  for (const s of STEG) {
    assert.ok(
      kkx.includes(`title: '${s.titel}'`) || kkx.includes(`'${s.titel}'`),
      `steg ${s.steg} "${s.titel}" ska finnas i kkx`
    );
  }
});

/* ── API:t ────────────────────────────────────────────────────────────── */

const http = require('node:http');
const os = require('node:os');
const fsp = require('node:fs/promises');
const express = require('express');
const { createStaffPortalRouter } = require('../../src/routes/staffPortal');

async function medApi(run, { roll = 'personal' } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord200-'));
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: () => {}, query: () => [] },
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'u-1', tenantId: 'hair-tp-clinic', role: roll };
          req.cco = { ...(req.cco || {}), role: roll };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const fraga = (baseUrl, kort, signaler) =>
  fetch(`${baseUrl}/api/v1/staff/kundresa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card: kort, signals: signaler || [] }),
  }).then((r) => r.json());

test('API:t ger samma svar som beräkningen — ingen egen matematik i rutten', async () => {
  const kort = { bookingCount: 1, hasHealthDeclaration: true, hasJournal: false };
  await medApi(async (baseUrl) => {
    const via = await fraga(baseUrl, kort);
    const direkt = beraknaKundresa(kort);
    assert.equal(via.steg, direkt.steg);
    assert.equal(via.av, direkt.av);
    assert.equal(via.klara, direkt.klara);
    assert.equal(via.aktivt, direkt.aktivt);
  });
});

test('ABBE-FALLET genom API:t: steg 4, inte steg 1', async () => {
  await medApi(async (baseUrl) => {
    const r = await fraga(baseUrl, {
      bookingCount: 1,
      lastBookingAt: '2026-08-20T10:00:00.000Z',
      hasHealthDeclaration: true,
    });
    assert.equal(r.steg, 4);
    assert.equal(r.klara, 3);
    assert.equal(r.aktivt, 'Konsultation');
  });
});

test('hela personalen får fråga — annars räknar vyerna själva igen', async () => {
  // customers.read omfattar owner/operator/konsult/personal. Vore rutten
  // snävare hade de vyer som inte får fråga tvingats behålla sin egen
  // uträkning, och problemet vore tillbaka för dem.
  for (const roll of ['owner', 'operator', 'konsult', 'personal']) {
    await medApi(
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/v1/staff/kundresa/steg`);
        assert.equal(res.status, 200, `${roll} ska få hämta stegen`);
        const data = await res.json();
        assert.equal(data.antal, 13);
      },
      { roll }
    );
  }
});

test('stegdefinitionen serveras som data — en vy behöver ingen egen kopia', async () => {
  await medApi(async (baseUrl) => {
    const data = await fetch(`${baseUrl}/api/v1/staff/kundresa/steg`).then((r) => r.json());
    assert.equal(data.steg.length, 13);
    assert.equal(data.steg[3].titel, 'Konsultation');
    assert.equal(data.steg[3].ruleId, 'missing_journal');
  });
});

test('valjVariant gissar konservativt — okänt blir kanoniska hairTP', () => {
  assert.equal(valjVariant({}), 'hairTP');
  assert.equal(valjVariant({ treatmentTypes: ['Något helt okänt'] }), 'hairTP');
  assert.equal(valjVariant({ pathVariant: 'nonSurgical' }), 'nonSurgical', 'uttalat val vinner');
  assert.equal(
    valjVariant({ pathVariant: 'finns-inte' }),
    'hairTP',
    'okänd variant faller tillbaka'
  );
});
