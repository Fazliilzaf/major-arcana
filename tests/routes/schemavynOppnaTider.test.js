'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

/**
 * ORD-191 — kliniken måste kunna öppna tider själv.
 *
 * ORD-181 byggde store-metoderna och operatörs-API:t. Men ingen vy, och ingen
 * väg dit från personalportalen. Verktyget fanns alltså bara för den som kunde
 * anropa ett API för hand — vilket i praktiken betyder utvecklaren, inte
 * kliniken. Uppmätt samma dag: 11 av 14 publikt bokningsbara tjänster hade noll
 * tillgänglighetsregler.
 *
 * Vyn visar LUCKAN först, inte formuläret. En tjänst utan tider syns inte som
 * ett fel någonstans i systemet — bara som en tom kalender.
 */

async function medPortal(run, { roll = 'operator' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord191-'));
  const auditEntries = [];
  try {
    const engine = await createCcoBookingEngineStore({ filePath: path.join(dir, 'engine.json') });
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: (e) => auditEntries.push(e), query: () => auditEntries },
        getBookingEngineStore: () => engine,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'ops-1', tenantId: 'hair-tp-clinic', role: roll };
          // Rollen sätts direkt, inte via x-cco-role: headern läses bara när
          // NODE_ENV !== 'production'. Bränt tidigare samma dag.
          req.cco = { ...(req.cco || {}), role: roll };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      await run({ baseUrl: `http://127.0.0.1:${port}`, engine, auditEntries });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const hamta = (baseUrl, sokvag = '') =>
  fetch(`${baseUrl}/api/v1/staff/availability-rules${sokvag}`).then((r) => r.json());

test('vyn RÄKNAR luckan — det är det den finns för', async () => {
  await medPortal(async ({ baseUrl }) => {
    const data = await hamta(baseUrl);
    assert.equal(data.ok, true);
    assert.ok(data.utanTider > 0, 'ska rapportera hur många tjänster som saknar tider');
    const utan = data.oversikt.filter((s) => s.antalRegler === 0);
    assert.equal(utan.length, data.utanTider, 'siffran ska stämma med listan');
  });
});

test('tjänster utan tider sorteras först', async () => {
  // Man öppnar vyn för att fixa luckan, inte för att beundra det som fungerar.
  await medPortal(async ({ baseUrl }) => {
    const { oversikt } = await hamta(baseUrl);
    assert.equal(oversikt[0].antalRegler, 0);
    const antal = oversikt.map((s) => s.antalRegler);
    assert.deepEqual(
      antal,
      [...antal].sort((a, b) => a - b),
      'stigande antal regler'
    );
  });
});

test('en tid som läggs in dyker upp och luckan krymper', async () => {
  await medPortal(async ({ baseUrl }) => {
    const fore = await hamta(baseUrl);
    const res = await fetch(`${baseUrl}/api/v1/staff/availability-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'prp-hair',
        resourceId: 'egzona',
        weekdays: [1, 2, 3],
        startTimes: ['10:00', '11:00'],
      }),
    });
    assert.equal(res.status, 201);
    const efter = await hamta(baseUrl);
    assert.equal(efter.utanTider, fore.utanTider - 1, 'en tjänst mindre utan tider');
    assert.ok(efter.rules.some((r) => r.serviceId === 'prp-hair'));
  });
});

test('serverns skäl når fram ordagrant när något nekas', async () => {
  // Valideringen i ORD-181 nekar hellre än gissar. Då måste den som står i
  // vyn få veta varför, inte bara att det inte gick.
  await medPortal(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/v1/staff/availability-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'finns-inte',
        resourceId: 'egzona',
        weekdays: [1],
        startTimes: ['10:00'],
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /finns inte i katalogen/);
  });
});

test('att stänga en regel tar bort tiderna men behåller raden', async () => {
  await medPortal(async ({ baseUrl }) => {
    const skapa = await fetch(`${baseUrl}/api/v1/staff/availability-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'prp-skin',
        resourceId: 'egzona',
        weekdays: [1],
        startTimes: ['10:00'],
      }),
    }).then((r) => r.json());

    const res = await fetch(
      `${baseUrl}/api/v1/staff/availability-rules/${encodeURIComponent(skapa.rule.ruleId)}`,
      { method: 'DELETE' }
    );
    assert.equal(res.status, 200);
    const efter = await hamta(baseUrl);
    assert.ok(!efter.rules.some((r) => r.ruleId === skapa.rule.ruleId), 'borta ur aktiva listan');
    const medInaktiva = await hamta(baseUrl, '?includeInactive=true');
    assert.ok(
      medInaktiva.rules.some((r) => r.ruleId === skapa.rule.ruleId),
      'men kvar för den som frågar'
    );
  });
});

test('personal får SE men inte ändra', async () => {
  // bookings.read omfattar personal, bookings.write gör det inte. Schemat är
  // ett driftbeslut, inte något var och en ändrar i förbifarten.
  await medPortal(
    async ({ baseUrl }) => {
      const las = await fetch(`${baseUrl}/api/v1/staff/availability-rules`);
      assert.equal(las.status, 200, 'personal ska kunna se');

      const skriv = await fetch(`${baseUrl}/api/v1/staff/availability-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'prp-hair',
          resourceId: 'egzona',
          weekdays: [1],
          startTimes: ['10:00'],
        }),
      });
      assert.equal(skriv.status, 403, 'men inte ändra');
    },
    { roll: 'personal' }
  );
});

test('ändringar hamnar i audit', async () => {
  // "Varför fanns det inga tider den veckan" ska gå att svara på.
  await medPortal(async ({ baseUrl, auditEntries }) => {
    await fetch(`${baseUrl}/api/v1/staff/availability-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: 'prp-hair',
        resourceId: 'egzona',
        weekdays: [1],
        startTimes: ['10:00'],
      }),
    });
    assert.ok(
      auditEntries.some((e) => e.action === 'staff.availability_rule_created'),
      'skapandet ska loggas'
    );
  });
});

test('utan motor svarar vyn 503 i stället för att se tom ut', async () => {
  // En tom lista och en trasig koppling ser likadana ut för den som tittar.
  // 503 säger vilket det är.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord191b-'));
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        getBookingEngineStore: () => null,
        requireAuth: (req, _res, next) => {
          req.auth = { userId: 'ops-1', tenantId: 'hair-tp-clinic', role: 'operator' };
          req.cco = { role: 'operator' };
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/staff/availability-rules`);
      assert.equal(res.status, 503);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
