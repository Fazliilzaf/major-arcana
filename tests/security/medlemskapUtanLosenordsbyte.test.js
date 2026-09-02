'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuthStore } = require('../../src/security/authStore');

/**
 * ORD-165 — att ge en befintlig användare åtkomst till ytterligare en tenant
 * får inte röra hens lösenord.
 *
 * Bakgrunden: Curatiio skulle få sex medlemskap. Den enda API-vägen som fanns,
 * `POST /users/staff`, kör `setUserPassword` även när kontot redan finns
 * (authStore.js:1570). Att lägga till fyra anställda i det andra tenantet den
 * vägen hade låst ute dem från det första tills de fått nya lösenord — och
 * ingenting i koden sa det. `POST /tenants/onboard` klarar bara den inloggade
 * användaren själv; för en annan e-post kräver den lösenord.
 *
 * Det fanns alltså ingen operation för "addera åtkomst". Den heter nu
 * `POST /users/membership` och bygger på `ensureMembership`.
 *
 * Testet låser skillnaden mellan de två: den ena byter lösenord, den andra inte.
 */

const LOSEN = 'ursprungligt-losenord-123';
const NYTT = 'nagot-annat-456';

async function nyStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'auth-medlemskap-'));
  const filePath = path.join(dir, 'auth.json');
  const store = await createAuthStore({ filePath });
  return { store, dir, filePath };
}

async function skapaAnvandare(store, email) {
  const user = await store.createUser({ email, password: LOSEN, mustChangePassword: false });
  await store.ensureMembership({ userId: user.id, tenantId: 'hair-tp-clinic', role: 'STAFF' });
  return user;
}

test('ensureMembership ger åtkomst i ett andra tenant utan att röra lösenordet', async () => {
  const { store, dir } = await nyStore();
  try {
    const user = await skapaAnvandare(store, 'clara@hairtpclinic.com');

    const m = await store.ensureMembership({
      userId: user.id,
      tenantId: 'curatiio',
      role: 'STAFF',
    });
    assert.equal(m.tenantId, 'curatiio');
    assert.equal(m.role, 'STAFF');
    assert.equal(m.status, 'active');

    // Kärnan: det ursprungliga lösenordet fungerar fortfarande.
    const auth = await store.authenticateUser({
      email: 'clara@hairtpclinic.com',
      password: LOSEN,
    });
    assert.ok(auth && auth.id, 'ursprungligt lösenord ska fortfarande fungera');

    // Och båda medlemskapen finns.
    const alla = await store.listMembershipsForUser(user.id, { includeDisabled: true });
    assert.deepEqual(
      alla.map((x) => x.tenantId).sort(),
      ['curatiio', 'hair-tp-clinic'],
      'användaren ska ha åtkomst till båda, inte flyttas'
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('upsertStaffMember BYTER lösenord på en befintlig användare — därför finns den andra vägen', async () => {
  const { store, dir } = await nyStore();
  try {
    const user = await skapaAnvandare(store, 'louise@hairtpclinic.com');

    await store.upsertStaffMember({
      tenantId: 'curatiio',
      email: 'louise@hairtpclinic.com',
      password: NYTT,
    });

    const medGammalt = await store.authenticateUser({
      email: 'louise@hairtpclinic.com',
      password: LOSEN,
    });
    assert.ok(
      !medGammalt,
      'Om det här börjar fungera har upsertStaffMember slutat byta lösenord — ' +
        'då är motiveringen för POST /users/membership borta och båda vägarna ' +
        'ska ses över tillsammans.'
    );

    const medNytt = await store.authenticateUser({
      email: 'louise@hairtpclinic.com',
      password: NYTT,
    });
    assert.ok(medNytt && medNytt.id, 'det nya lösenordet ska fungera');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('ensureMembership degraderar inte en aktiv OWNER till STAFF', async () => {
  const { store, dir } = await nyStore();
  try {
    const user = await skapaAnvandare(store, 'egzona@hairtpclinic.com');
    await store.ensureMembership({ userId: user.id, tenantId: 'curatiio', role: 'OWNER' });

    const efter = await store.ensureMembership({
      userId: user.id,
      tenantId: 'curatiio',
      role: 'STAFF',
    });
    assert.equal(
      efter.role,
      'OWNER',
      'En aktiv OWNER får inte tyst bli STAFF av ett upprepat anrop.'
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('rutten finns och vägrar ta emot password', () => {
  // Läser filsystemet, inte git (se tests/meta/testerFragarInteGit).
  const rutter = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'auth.js'),
    'utf8'
  );
  assert.ok(
    rutter.includes("router.post('/users/membership'"),
    'POST /users/membership saknas — utan den finns ingen väg att addera åtkomst.'
  );
  assert.ok(
    rutter.includes('Den här vägen sätter aldrig lösenord'),
    'Rutten ska avvisa ett medskickat password i stället för att tyst ignorera det.'
  );
});
