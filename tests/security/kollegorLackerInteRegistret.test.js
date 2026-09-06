'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');
const { PERMISSIONS } = require('../../src/security/ccoRbac');

/**
 * Kollegevyn får visa vem man kan fråga — inte dela ut personalregistret.
 *
 * BAKGRUND 2026-09-03: ägaren beslutade att personalportalen är mötespunkten
 * och att kollegor ska kunna prata med varandra. Den befintliga vägen dit var
 * GET /api/v1/staff/team, men den kräver staff.manage som bara ägaren har —
 * och den svarar med e-post, medlemskaps-id och status.
 *
 * Lösningen blev en egen, smalare väg. Det här testet håller isär de två.
 * Utan det är det en enda rad att av misstag returnera hela member-objektet.
 */

/** Medvetet bredare än vad svaret får innehålla — så testet kan se läckan. */
const MEDLEMMAR = [
  {
    user: { id: 'u-egzona', email: 'egzona@hairtpclinic.com' },
    membership: { role: 'OWNER', status: 'active', id: 'm-1', userId: 'u-egzona' },
  },
  {
    user: { id: 'u-anna', email: 'anna.lindstrom@hairtpclinic.com' },
    membership: { role: 'STAFF', status: 'active', id: 'm-2', userId: 'u-anna' },
  },
  {
    user: { id: 'u-slutat', email: 'gammal@hairtpclinic.com' },
    membership: { role: 'STAFF', status: 'revoked', id: 'm-3', userId: 'u-slutat' },
  },
  {
    user: { id: 'u-patient', email: 'kund@example.com' },
    membership: { role: 'PATIENT', status: 'active', id: 'm-4', userId: 'u-patient' },
  },
];

const authStoreStub = {
  async listTenantMembers() {
    return MEDLEMMAR;
  },
};

async function medServer(run) {
  const app = express();
  // Rollen sätts på req.cco, inte via x-cco-role-headern. Headern gäller bara
  // när NODE_ENV !== 'production' (ccoRbac.js:258), och testet ska ge samma
  // svar oavsett vad miljön råkar stå på när det körs.
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (role) req.cco = { role: String(role) };
    next();
  });
  app.use(createStaffPortalRouter({ authStore: authStoreStub }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function hamtaKollegor(baseUrl, role) {
  const res = await fetch(`${baseUrl}/api/v1/staff/colleagues`, {
    headers: { 'x-test-role': role },
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

test('all personal kommer åt kollegelistan — det var hela poängen', async () => {
  await medServer(async (baseUrl) => {
    for (const role of ['personal', 'konsult', 'operator', 'owner']) {
      const { status } = await hamtaKollegor(baseUrl, role);
      assert.equal(status, 200, `${role} borde komma åt kollegelistan`);
    }
  });
});

test('svaret bär namn och roll — aldrig e-post, medlemskaps-id eller status', async () => {
  await medServer(async (baseUrl) => {
    const { body } = await hamtaKollegor(baseUrl, 'personal');
    assert.ok(Array.isArray(body.colleagues));
    assert.ok(body.colleagues.length > 0);

    for (const kollega of body.colleagues) {
      assert.deepEqual(
        Object.keys(kollega).sort(),
        ['displayName', 'role', 'userId'],
        'kollegeobjektet har fler fält än det får ha'
      );
    }

    // Hela svaret som text: ingen adress får finnas någonstans i det.
    const rat = JSON.stringify(body);
    assert.ok(!rat.includes('@'), 'en e-postadress läckte ut i svaret');
    assert.ok(!rat.includes('m-1'), 'ett medlemskaps-id läckte ut i svaret');
  });
});

test('bara aktiv personal listas — avslutade och patienter är inte kollegor', async () => {
  await medServer(async (baseUrl) => {
    const { body } = await hamtaKollegor(baseUrl, 'personal');
    const ids = body.colleagues.map((k) => k.userId);
    assert.deepEqual(ids.sort(), ['u-anna', 'u-egzona']);
    assert.equal(body.count, 2);
  });
});

test('visningsnamnet härleds ur adressens lokala del', async () => {
  await medServer(async (baseUrl) => {
    const { body } = await hamtaKollegor(baseUrl, 'personal');
    const namn = Object.fromEntries(body.colleagues.map((k) => [k.userId, k.displayName]));
    assert.equal(namn['u-egzona'], 'Egzona');

    // KÄND BEGRÄNSNING, inte en bugg: authStore har inget namnfält, så namnet
    // härleds ur e-postadressen — och en adress bär inga diakriter.
    // "anna.lindstrom@…" blir "Anna Lindstrom", aldrig "Lindström".
    // Vill kliniken se riktiga namn behöver användaren ett eget namnfält.
    // Testet låser det som faktiskt sker, så ingen tror att namnet är korrekt.
    assert.equal(namn['u-anna'], 'Anna Lindstrom');
  });
});

test('staff.manage förblir ägarens ensak — den utvidgades inte', () => {
  // Den enkla lösningen hade varit att lägga till roller i staff.manage.
  // Det hade gett all personal e-post, status och medlemskaps-id på köpet.
  assert.deepEqual(PERMISSIONS['staff.manage'], ['owner']);
  assert.deepEqual(PERMISSIONS['staff.colleagues'], ['owner', 'konsult', 'personal']);
});

test('/staff/team och /staff/colleagues är två olika rättigheter', () => {
  // Skulle någon slå ihop dem igen ska det här testet stå i vägen.
  assert.notDeepEqual(PERMISSIONS['staff.manage'], PERMISSIONS['staff.colleagues']);
});
