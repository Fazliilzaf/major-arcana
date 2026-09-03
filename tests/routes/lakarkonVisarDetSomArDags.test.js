'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { createCcoBookingCaseStore } = require('../../src/ops/ccoBookingCaseStore');

/**
 * ORD-180 — fönstret mätt där det gäller: i läkarens kö, över HTTP.
 *
 * Enhetstesterna i tests/ops/ordinationsfonstretT14.test.js mäter beräkningen.
 * Det här mäter att den är inkopplad. En regel som är riktig men inte anropad
 * är samma sak som ingen regel — det är precis vad ORD-179 handlade om.
 */

const DYGN = 24 * 3600000;
const om = (dagar) => new Date(Date.now() + dagar * DYGN).toISOString();

async function medPortal(fall, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord180-'));
  const auditEntries = [];
  const ccoAuditLog = { append: (e) => auditEntries.push(e), query: () => auditEntries };
  const bookingCaseStore = await createCcoBookingCaseStore({
    filePath: path.join(dir, 'cases.json'),
    auditLog: ccoAuditLog,
  });
  for (const c of fall) {
    await bookingCaseStore.createCase(c, { role: 'operator', userId: 'ops-1' });
  }

  const app = express();
  app.use(express.json());
  app.use(
    createStaffPortalRouter({
      config: { stateRoot: dir },
      bookingCaseStore,
      ccoAuditLog,
      requireAuth: (req, _res, next) => {
        req.auth = { userId: 'arya', tenantId: 'hair-tp-clinic', role: 'konsult' };
        // Rollen sätts DIREKT, inte via x-cco-role-headern. Headern läses bara
        // när NODE_ENV !== 'production', och den som kör sviten med
        // NODE_ENV=production i skalet får då 403 på varje anrop — ett rött
        // test som inte handlar om det testet påstår sig mäta. Bränt en gång
        // tidigare i dag.
        req.cco = { ...(req.cco || {}), role: 'konsult' };
        next();
      },
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run({ baseUrl: `http://127.0.0.1:${port}`, bookingCaseStore });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const arende = (id, serviceId, startsAt, extra = {}) => ({
  id,
  tenantId: 'hair-tp-clinic',
  state: 'confirmed',
  customerName: id,
  serviceId,
  startsAt,
  bookingId: `bk-${id}`,
  ...extra,
});

/**
 * mode=all med flit. Endpointen defaultar till mode=pending, vilket filtrerar
 * på BESLUTETS status. Det här testet mäter fönstret — alltså vilka ärenden
 * som över huvud taget kommer in i kön. Två helt olika filter, och med
 * defaulten hade jag mätt fel av dem.
 */
async function hamtaKon(baseUrl, mode = 'all') {
  const res = await fetch(`${baseUrl}/api/v1/staff/ordination-reviews?mode=${mode}`, {
    headers: { 'x-cco-role': 'konsult' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  return (body.items || body.reviews || []).map((item) => item.id);
}

test('kön visar den som är inom fjorton dygn — inte den som ligger ett halvår bort', async () => {
  await medPortal(
    [
      arende('nara', 'fue', om(7)),
      arende('langt-bort', 'dhi', om(180)),
      arende('passerad', 'fue', om(-30)),
    ],
    async ({ baseUrl }) => {
      const ids = await hamtaKon(baseUrl);
      assert.ok(ids.includes('nara'), 'sju dygn bort ska synas');
      assert.ok(!ids.includes('langt-bort'), 'ett halvår bort ska inte synas ännu');
      assert.ok(!ids.includes('passerad'), 'bakåt i tiden ska inte med');
    }
  );
});

test('en konsultation nästa vecka hamnar inte i läkarkön', async () => {
  // Ägaren: "det är inte på konsultationer ordinationer ska skapas."
  await medPortal([arende('konsult', 'consultation-physical', om(5))], async ({ baseUrl }) => {
    assert.deepEqual(await hamtaKon(baseUrl), []);
  });
});

test('ett påbörjat beslut syns ALLTID, oavsett fönster', async () => {
  // Viktig gräns. Utan den hade ett godkännande kunnat försvinna ur läkarens
  // vy för att kunden bokade om till långt fram — beslutet finns, men blir
  // osynligt. Ett fattat beslut ska aldrig gömmas av en tidsregel.
  await medPortal(
    [
      arende('godkand-langt-bort', 'fue', om(200), {
        ordinationReview: {
          status: 'approved',
          decidedBy: 'arya',
          decidedAt: new Date().toISOString(),
        },
      }),
    ],
    async ({ baseUrl }) => {
      assert.ok((await hamtaKon(baseUrl)).includes('godkand-langt-bort'));
    }
  );
});

test('en transplantation utan tid göms inte', async () => {
  // Fail-safe: ett ingrepp ingen kan tidsätta är inte ett avklarat ärende.
  await medPortal([arende('utan-tid', 'dhi', null)], async ({ baseUrl }) => {
    assert.ok((await hamtaKon(baseUrl)).includes('utan-tid'));
  });
});

test('gränsen håller på båda sidor om fjorton dygn', async () => {
  await medPortal(
    [arende('trettonhalv', 'fue', om(13.5)), arende('fjortonhalv', 'fue', om(14.5))],
    async ({ baseUrl }) => {
      const ids = await hamtaKon(baseUrl);
      assert.ok(ids.includes('trettonhalv'));
      assert.ok(!ids.includes('fjortonhalv'));
    }
  );
});

test('kön bär fönstret med sig så att vyn kan förklara varför', async () => {
  await medPortal([arende('nara', 'fue', om(3))], async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/v1/staff/ordination-reviews?mode=all`, {
      headers: { 'x-cco-role': 'konsult' },
    });
    const body = await res.json();
    const item = (body.items || body.reviews || [])[0];
    assert.ok(item, 'ärendet ska finnas i svaret');
    assert.equal(item.ordinationsfonster.status, 'oppet');
    assert.ok(item.ordinationsfonster.timmarKvar > 0);
    assert.ok(item.ordinationsfonster.oppnarAt, 'och när fönstret öppnade');
  });
});
