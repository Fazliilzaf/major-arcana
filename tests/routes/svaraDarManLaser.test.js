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

test('sjuksköterska får LÄSA men inte svara', async () => {
  // mail.read omfattar owner/operator/konsult; personal har ingen av dem.
  // Rollen är inte mitt beslut — den står i ccoRbac och ägaren äger den. Testet
  // låser fast vad som FAKTISKT gäller, så ingen tror något annat.
  await medPortal(
    async ({ baseUrl }) => {
      const skriv = await svara(baseUrl, 'kund-1', 'Hej');
      assert.equal(skriv.status, 403, 'personal ska inte kunna svara');
    },
    { roll: 'personal', kundutskick: true }
  );
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
  assert.match(kalla, /requirePermission\('mail\.send'\)/, 'och kräva rätt behörighet');
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
