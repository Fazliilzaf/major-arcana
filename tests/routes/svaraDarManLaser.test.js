'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');

/**
 * ORD-197 §2 — personalen ska kunna svara där de läser.
 *
 * DET SOM SAKNADES. Kundens meddelande når redan personalportalen:
 *
 *   patient-portal-chat.html → POST /api/patient-portal/<token>/messages
 *     → patientPortal.js appendMessage({direction:'inbound'})
 *     → ccoConversationThreadStore → staffPortal.js
 *
 * Men ingen av rutterna i staffPortal.js kunde svara. Knappen "Öppna tråd"
 * länkade till rå JSON i en ny flik, och routern skrev det själv i sitt svar:
 * "Svar skrivs i CCO-konversationen med ordinarie audit" — alltså i ett annat
 * verktyg. Läs här, byt program, svara där.
 *
 * OCH DET VIKTIGASTE: ett portalsvar är kundkommunikation. Det skickas inte
 * som mejl — det skrivs in i tråden kunden ser. Att vägen inte går via en
 * mailer gör den inte till ett undantag från utskicksspärren. Den når kunden,
 * och det är kriteriet.
 */

const NYCKEL = 'ARCANA_KUNDUTSKICK_ENABLED';

async function medPortal(run, { roll = 'operator', kundutskick = false } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord197-'));
  const tidigare = process.env[NYCKEL];
  if (kundutskick) process.env[NYCKEL] = 'true';
  else delete process.env[NYCKEL];
  const audit = [];
  try {
    const portalMessageStore = await createCcoPortalMessageStore({
      filePath: path.join(dir, 'portal-messages.json'),
    });
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: (e) => audit.push(e), query: () => audit },
        portalMessageStore,
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
      await run({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        portalMessageStore,
        audit,
      });
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    if (tidigare === undefined) delete process.env[NYCKEL];
    else process.env[NYCKEL] = tidigare;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const svara = (baseUrl, kund, text) =>
  fetch(`${baseUrl}/api/v1/staff/portal-thread/${encodeURIComponent(kund)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: text }),
  });

async function kundHarSkrivit(store, kund, text) {
  await store.appendMessage({
    tenantId: 'hair-tp-clinic',
    customerId: kund,
    direction: 'inbound',
    body: text,
    author: 'kund',
  });
}

test('personalen ser kundens meddelanden i portalen', async () => {
  await medPortal(async ({ baseUrl, portalMessageStore }) => {
    await kundHarSkrivit(portalMessageStore, 'kund-1', 'Håret ser rött ut, är det normalt?');
    const data = await fetch(`${baseUrl}/api/v1/staff/portal-thread/kund-1`).then((r) => r.json());
    assert.equal(data.ok, true);
    assert.equal(data.count, 1);
    assert.match(data.messages[0].body, /rött ut/);
    assert.equal(data.messages[0].direction, 'inbound');
  });
});

test('SPÄRREN GÄLLER — ett svar når inte kunden när utskick är avstängt', async () => {
  // Det här är hela poängen med hur rutten är byggd. Ett portalsvar går inte
  // via någon mailer, men det når kunden. Att bygga svarsrutan utan den här
  // kontrollen hade skapat exakt den väg ut till kund som ägaren förbjöd.
  await medPortal(async ({ baseUrl, portalMessageStore }) => {
    await kundHarSkrivit(portalMessageStore, 'kund-1', 'Fråga');
    const res = await svara(baseUrl, 'kund-1', 'Det är helt normalt dag 5.');
    assert.equal(res.status, 423);
    const data = await res.json();
    assert.equal(data.blockerat, true);

    // Och inget får ha smugit in i tråden.
    const efter = portalMessageStore.listMessagesForCustomer({
      tenantId: 'hair-tp-clinic',
      customerId: 'kund-1',
    });
    assert.equal(efter.length, 1, 'bara kundens egen fråga ska finnas kvar');
    assert.ok(!efter.some((m) => m.direction === 'outbound'));
  });
});

test('det blockerade svaret säger att texten INTE sparades', async () => {
  // Ett svar som tyst försvinner är värre än ett som vägras. Den som skrev tre
  // stycken ska få veta att de behöver kopieras, inte tro att de ligger kvar.
  await medPortal(async ({ baseUrl }) => {
    const data = await svara(baseUrl, 'kund-1', 'Långt svar').then((r) => r.json());
    assert.match(data.error, /sparades INTE/);
  });
});

test('blockeringen hamnar i audit — inte bara i webbläsaren', async () => {
  await medPortal(async ({ baseUrl, audit }) => {
    await svara(baseUrl, 'kund-1', 'Hej');
    assert.ok(audit.some((e) => e.action === 'staff.portal_reply_blocked'));
  });
});

test('med spärren AV går svaret in i tråden', async () => {
  // Motprovet. En spärr som alltid blockerar är ingen spärr — den är en
  // funktion som inte fungerar.
  await medPortal(
    async ({ baseUrl, portalMessageStore, audit }) => {
      await kundHarSkrivit(portalMessageStore, 'kund-1', 'Fråga');
      const res = await svara(baseUrl, 'kund-1', 'Det är helt normalt dag 5.');
      assert.equal(res.status, 201);

      const trad = portalMessageStore.listMessagesForCustomer({
        tenantId: 'hair-tp-clinic',
        customerId: 'kund-1',
      });
      assert.equal(trad.length, 2);
      const svaret = trad.find((m) => m.direction === 'outbound');
      assert.ok(svaret, 'svaret ska ligga i tråden');
      assert.match(svaret.body, /normalt dag 5/);
      assert.equal(svaret.author, 'u-1', 'vem som svarade ska stå kvar');
      assert.ok(audit.some((e) => e.action === 'staff.portal_reply_sent'));
    },
    { kundutskick: true }
  );
});

test('vyn får veta om den kan svara INNAN någon skriver', async () => {
  // Att upptäcka spärren efter att svaret är skrivet är en sämre upplevelse än
  // att se den från början — och en sämre design.
  await medPortal(async ({ baseUrl }) => {
    const av = await fetch(`${baseUrl}/api/v1/staff/portal-thread/kund-1`).then((r) => r.json());
    assert.equal(av.kanSvara, false);
    assert.match(av.svarBlockeratSkal, /kundutskick_avstangt/);
  });
  await medPortal(
    async ({ baseUrl }) => {
      const pa = await fetch(`${baseUrl}/api/v1/staff/portal-thread/kund-1`).then((r) => r.json());
      assert.equal(pa.kanSvara, true);
      assert.equal(pa.svarBlockeratSkal, null);
    },
    { kundutskick: true }
  );
});

/**
 * ORD-198 — ägaren 2026-09-04: "jag vill att personalen oavsett vem ska kunna
 * kommunicera med alla kunder."
 *
 * ORD-197 byggde svarsvägen på `mail.send`, som omfattar owner/operator/
 * konsult. Sjuksköterskorna stod utanför, och jag lade frågan på ägarens bord
 * i stället för att gissa. Han svarade. Nu gäller det här i stället.
 *
 * VARFÖR INTE BARA LÄGGA personal I mail.send. Den behörigheten styr hela
 * mejlsystemet — delad inkorg, utkast, sändning till valfri adress. Att bredda
 * den för att en sköterska ska kunna svara på en portalfråga hade gett henne
 * allt det andra på köpet. Portaltråden fick därför en egen, smalare
 * behörighet som betyder just det den heter.
 */

test('ALLA fyra personalroller kan svara — det var instruktionen', async () => {
  for (const roll of ['owner', 'operator', 'konsult', 'personal']) {
    await medPortal(
      async ({ baseUrl, portalMessageStore }) => {
        await kundHarSkrivit(portalMessageStore, 'kund-1', 'Fråga');
        const res = await svara(baseUrl, 'kund-1', `Svar från ${roll}.`);
        assert.equal(res.status, 201, `${roll} ska kunna svara`);
      },
      { roll, kundutskick: true }
    );
  }
});

test('alla fyra kan också LÄSA tråden', async () => {
  for (const roll of ['owner', 'operator', 'konsult', 'personal']) {
    await medPortal(
      async ({ baseUrl }) => {
        const res = await fetch(`${baseUrl}/api/v1/staff/portal-thread/kund-1`);
        assert.equal(res.status, 200, `${roll} ska kunna läsa`);
      },
      { roll }
    );
  }
});

test('revisor och finance står UTANFÖR — de möter inte kunden', async () => {
  // Granskning och ekonomi är inte "personalen" i ägarens mening. Att tolka
  // "oavsett vem" som "varenda roll i systemet" hade varit att läsa in mer än
  // som sades.
  for (const roll of ['revisor', 'finance']) {
    await medPortal(
      async ({ baseUrl }) => {
        const las = await fetch(`${baseUrl}/api/v1/staff/portal-thread/kund-1`);
        assert.equal(las.status, 403, `${roll} ska inte läsa kundtrådar`);
        const skriv = await svara(baseUrl, 'kund-1', 'Hej');
        assert.equal(skriv.status, 403, `${roll} ska inte svara kunder`);
      },
      { roll, kundutskick: true }
    );
  }
});

test('behörigheten är EGEN — den får inte vara mail.send i förklädnad', () => {
  // Om någon senare "förenklar" genom att peka tillbaka på mail.send får
  // sköterskorna hela mejlsystemet utan att någon beslutat det.
  const rbac = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'security', 'ccoRbac.js'),
    'utf8'
  );
  const rader = require('../../src/security/ccoRbac');
  const karta = rader.PERMISSIONS || rader.PERMISSION_MATRIX || null;
  if (karta) {
    assert.deepEqual(
      new Set(karta['portal.thread_reply']),
      new Set(['owner', 'operator', 'konsult', 'personal'])
    );
    assert.ok(
      !karta['mail.send'].includes('personal'),
      'mail.send får INTE ha breddats — det var hela poängen med en egen behörighet'
    );
  } else {
    assert.match(rbac, /'portal\.thread_reply':\s*\['owner', 'operator', 'konsult', 'personal'\]/);
    assert.match(rbac, /'mail\.send':\s*\['owner', 'operator', 'konsult'\]/);
  }
});

/**
 * Rätten att svara är meningslös om man aldrig når fram till samtalet. Före
 * ORD-198 var `assignedTo=all` hårt låst till owner och operator — en
 * sköterska såg bara sina tilldelade kunder.
 *
 * FÖRSTA VERSIONEN AV DET HÄR TESTET VAR DEKORATIVT. Den letade efter att
 * funktionen `farSeAllaKunder` FANNS. Mutationen som ändrade dess KROPP
 * tillbaka till `role === 'owner' || role === 'operator'` lämnade namnet kvar,
 * och testet var grönt. Nu mäts vad som faktiskt skickas till storen.
 */
async function medInkorg(run, { roll }) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord198-'));
  const anrop = [];
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: () => {}, query: () => [] },
        bookingCaseStore: {
          async listCases(args) {
            anrop.push(args);
            return [];
          },
        },
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
      await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, anrop });
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('en sköterska som ber om alla kunder FÅR alla kunder', async () => {
  await medInkorg(
    async ({ baseUrl, anrop }) => {
      await fetch(`${baseUrl}/api/v1/staff/delegated-inbox?limit=5&assignedTo=all`);
      assert.equal(anrop.length, 1);
      assert.equal(
        anrop[0].assignedTo,
        null,
        'null = ingen filtrering på tilldelning, alltså alla kunder'
      );
    },
    { roll: 'personal' }
  );
});

test('samma sak i Mina kunder', async () => {
  await medInkorg(
    async ({ baseUrl, anrop }) => {
      await fetch(`${baseUrl}/api/v1/staff/my-customers?assignedTo=all`);
      assert.equal(anrop[0].assignedTo, null);
    },
    { roll: 'personal' }
  );
});

test('utan assignedTo=all är det fortfarande BARA mina', async () => {
  // Motprovet. Vidgningen får inte smyga sig på som standard — en kö som visar
  // alla kunder är ingen kö.
  await medInkorg(
    async ({ baseUrl, anrop }) => {
      await fetch(`${baseUrl}/api/v1/staff/delegated-inbox?limit=5`);
      assert.equal(anrop[0].assignedTo, 'u-1', 'ska filtrera på den inloggade');
    },
    { roll: 'personal' }
  );
});

test('de kliniska köerna vidgades INTE — det beslutet är inte mitt', async () => {
  // Ägaren sa "kommunicera med alla kunder", inte "se alla kliniska köer".
  // Fotoinkorg, uppföljningar, uppgifter, prioritetsradar och dagens arbetskö
  // är kvar som de var. Att tolka in mer än som sades är att fatta hans beslut
  // åt honom.
  await medInkorg(
    async ({ baseUrl, anrop }) => {
      await fetch(`${baseUrl}/api/v1/staff/delegated-photo-inbox?assignedTo=all`);
      assert.equal(anrop[0].assignedTo, 'u-1', 'fotoinkorgen ska fortfarande vara min');
    },
    { roll: 'personal' }
  );
});

test('standard är fortfarande MINA kunder — en kö som visar allt är ingen kö', () => {
  const kod = portalHtml();
  assert.match(kod, /let _inkorgAllaKunder = false;/, 'default ska vara mina');
  assert.match(kod, /Visa alla kunder/, 'men växeln ska finnas');
});

test('tomt svar avvisas innan det blir ett meddelande', async () => {
  await medPortal(
    async ({ baseUrl }) => {
      for (const text of ['', '   ', '\n\n']) {
        const res = await svara(baseUrl, 'kund-1', text);
        assert.equal(res.status, 400, `"${text}" ska avvisas`);
      }
    },
    { kundutskick: true }
  );
});

test('utan store svarar rutten 503 i stället för att se tom ut', async () => {
  // En tom tråd och en trasig koppling ser likadana ut för den som tittar.
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord197b-'));
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: () => {}, query: () => [] },
        portalMessageStore: null,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'u-1', tenantId: 'hair-tp-clinic', role: 'operator' };
          req.cco = { role: 'operator' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const res = await fetch(`${url}/api/v1/staff/portal-thread/kund-1`);
      assert.equal(res.status, 503);
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('routern påstår inte längre att svar skrivs någon annanstans', () => {
  // Den gamla texten var sann när den skrevs och blev fel i samma stund den
  // här rutten fanns. En kvarlämnad sanning är en lögn med fördröjning.
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'staffPortal.js'),
    'utf8'
  );
  assert.match(kalla, /portal-thread\/:customerId\/reply/, 'svarsvägen ska finnas');
  // ORD-198 bytte mail.send mot en egen behörighet — se testerna längre ned.
  assert.match(kalla, /requirePermission\('portal\.thread_reply'\)/, 'och kräva rätt behörighet');
});

/* ── vyn ──────────────────────────────────────────────────────────────── */

const PORTAL_HTML = path.join(__dirname, '..', '..', 'public', 'staff-portal.html');
const portalHtml = () => fs.readFileSync(PORTAL_HTML, 'utf8');

test('vyns skript går att tolka — ORD-196b:s läxa gäller varje ändring här', () => {
  // Jag deployade ett syntaxfel till prod med 7907 gröna test bakom mig. Den
  // kontrollen körs för hela filen i portalenHarEnSession.test.js; den här
  // raden finns för att den som ändrar trådvyn ska se kravet på plats.
  const kod = portalHtml();
  const skript = [...kod.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of skript) {
    if (!m[1].trim()) continue;

    assert.doesNotThrow(() => new Function(m[1]));
  }
});

test('svarsknappen finns i inkorgen, och skickar med kundens id', () => {
  const kod = portalHtml();
  assert.match(kod, /data-oppna-trad=/, 'kortet ska ha en knapp som öppnar tråden');
  assert.match(kod, /Svara i portalen/);
});

test('vyn skickar svaret med token — inte med cookies', () => {
  // Samma fälla som ORD-196: ett nytt fetch-anrop som glömmer headern blir 401,
  // och 401 ser ut som tomt.
  const kod = portalHtml();
  const idx = kod.indexOf('/reply');
  assert.ok(idx > 0, 'svarsanropet ska finnas');
  const fonster = kod.slice(idx - 200, idx + 400);
  assert.match(fonster, /withAuth\(/, 'anropet måste gå via withAuth');
});

test('vyn visar spärren INNAN någon skriver, och låser fältet', () => {
  const kod = portalHtml();
  assert.match(kod, /function renderThreadGate/);
  assert.match(kod, /Utskick till kund är avstängt/);
  assert.match(kod, /falt\.disabled = true/, 'textfältet ska låsas, inte bara knappen');
});
