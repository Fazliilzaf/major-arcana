'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const {
  createCcoDelegationStore,
  bedomStatus,
  STATUS,
} = require('../../src/ops/ccoDelegationStore');

/**
 * En delegering får aldrig visas som giltig när den inte är det.
 *
 * BAKGRUND 2026-09-03: personalportalen visade den statiska dokumentkatalogen
 * under rubriken "Mina delegeringsdokument", med en hårdkodad Aktiv-pill på
 * varje rad och tre statiska demorader med påhittade giltighetsdatum. En
 * sköterska kunde tro att hon var täckt för ett moment hon inte var täckt för.
 *
 * Testerna nedan handlar därför inte om att listan renderar, utan om att
 * giltighet är RÄKNAD och faller åt det säkra hållet när något är oklart.
 */

const NU = new Date('2026-09-03T10:00:00.000Z');

async function medStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'delegering-'));
  const store = await createCcoDelegationStore({
    filePath: path.join(dir, 'cco-delegations.json'),
  });
  try {
    await run(store);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// issuedAt sätts explicit i det förflutna. Utan det använder storen
// väggklockan, och testet skulle bero på vilken minut det råkade köras —
// en delegering utfärdad EFTER det NU vi jämför mot har ju inte börjat gälla.
const bas = {
  tenantId: 'hair-tp-clinic',
  holderUserId: 'u-anna',
  task: 'Lokal infiltrationsanestesi (lidokain)',
  issuedByUserId: 'u-lakare',
  issuedAt: '2026-01-15T08:00:00.000Z',
};

test('filen börjar tom — inga påhittade delegeringar', async () => {
  await medStore(async (store) => {
    assert.deepEqual(store.listForTenant({ tenantId: 'hair-tp-clinic' }), []);
    assert.equal(store.summary({ tenantId: 'hair-tp-clinic' }).total, 0);
  });
});

test('en delegering utan slutdatum går inte att utfärda', async () => {
  await medStore(async (store) => {
    await assert.rejects(() => store.issueDelegation({ ...bas }), /validUntil krävs/);
  });
});

test('saknat slutdatum på en befintlig post är INTE giltigt', () => {
  // Skulle en post smyga in utan slutdatum — via migrering eller handpåläggning
  // — ska den falla åt det säkra hållet, inte åt det bekväma.
  const status = bedomStatus({ validUntil: null, issuedAt: '2026-01-01T00:00:00Z' }, NU);
  assert.equal(status, STATUS.SAKNAR_SLUTDATUM);
  assert.notEqual(status, STATUS.GILTIG);
});

test('utgången delegering är utgången, inte giltig', () => {
  assert.equal(
    bedomStatus({ validUntil: '2026-05-01T00:00:00Z', issuedAt: '2025-05-01T00:00:00Z' }, NU),
    STATUS.UTGANGEN
  );
});

test('återkallande slår allt — även ett slutdatum långt fram i tiden', () => {
  assert.equal(
    bedomStatus(
      {
        validUntil: '2030-12-31T00:00:00Z',
        issuedAt: '2026-01-01T00:00:00Z',
        revokedAt: '2026-06-01T00:00:00Z',
      },
      NU
    ),
    STATUS.ATERKALLAD
  );
});

test('en delegering som ännu inte börjat gälla är inte giltig — och inte utgången', () => {
  // "Har inte börjat" och "har upphört" är olika saker för den som ska veta om
  // hen får utföra momentet. Slås de ihop döljs ett felskrivet startdatum.
  const status = bedomStatus(
    { validUntil: '2030-01-01T00:00:00Z', issuedAt: '2027-01-01T00:00:00Z' },
    NU
  );
  assert.equal(status, STATUS.EJ_BORJAT);
  assert.notEqual(status, STATUS.GILTIG);
  assert.notEqual(status, STATUS.UTGANGEN);
});

test('sista giltighetsdagen räknas som giltig, dagen efter inte', () => {
  const sistaDagen = new Date('2026-09-03T23:00:00.000Z');
  assert.equal(
    bedomStatus(
      { validUntil: '2026-09-03T23:30:00Z', issuedAt: '2026-01-01T00:00:00Z' },
      sistaDagen
    ),
    STATUS.GILTIG
  );
  assert.equal(
    bedomStatus(
      { validUntil: '2026-09-03T22:30:00Z', issuedAt: '2026-01-01T00:00:00Z' },
      sistaDagen
    ),
    STATUS.UTGANGEN
  );
});

test('en läkare kan inte delegera till sig själv', async () => {
  await medStore(async (store) => {
    await assert.rejects(
      () =>
        store.issueDelegation({
          ...bas,
          holderUserId: 'u-lakare',
          validUntil: '2027-01-01T00:00:00Z',
        }),
      /kan inte utfärdas till den som utfärdar/
    );
  });
});

test('återkallad delegering går aldrig tillbaka till giltig', async () => {
  await medStore(async (store) => {
    const d = await store.issueDelegation({ ...bas, validUntil: '2030-01-01T00:00:00Z' });
    assert.equal(d.isValid, true);

    const revoked = await store.revokeDelegation({
      id: d.id,
      revokedByUserId: 'u-lakare',
      reason: 'Avslutad anställning',
    });
    assert.equal(revoked.status, STATUS.ATERKALLAD);
    assert.equal(revoked.isValid, false);

    // Ett andra återkallande ändrar ingenting och kastar inte.
    const igen = await store.revokeDelegation({ id: d.id, revokedByUserId: 'u-annan' });
    assert.equal(igen.status, STATUS.ATERKALLAD);

    const kvar = store.listForHolder({ tenantId: bas.tenantId, holderUserId: bas.holderUserId });
    assert.equal(kvar.length, 1, 'posten raderas inte — den har funnits');
    assert.equal(kvar[0].isValid, false);
  });
});

test('går ut snart flaggas, men räknas fortfarande som giltig', async () => {
  await medStore(async (store) => {
    const om10Dagar = new Date(NU.getTime() + 10 * 86400000).toISOString();
    await store.issueDelegation({ ...bas, validUntil: om10Dagar });

    const [vy] = store.listForHolder({
      tenantId: bas.tenantId,
      holderUserId: bas.holderUserId,
      nu: NU,
    });
    assert.equal(vy.isValid, true);
    assert.equal(vy.expiresSoon, true);
    assert.equal(vy.daysLeft, 10);
  });
});

test('de tre vyerna visar olika saker för olika roller', async () => {
  await medStore(async (store) => {
    await store.issueDelegation({ ...bas, validUntil: '2030-01-01T00:00:00Z' });
    await store.issueDelegation({
      ...bas,
      holderUserId: 'u-clara',
      task: 'PRP-förberedelse',
      validUntil: '2030-01-01T00:00:00Z',
    });
    await store.issueDelegation({
      ...bas,
      holderUserId: 'u-clara',
      task: 'Postoperativ omvårdnad',
      issuedByUserId: 'u-annan-lakare',
      validUntil: '2030-01-01T00:00:00Z',
    });

    // Sköterskan ser bara sina egna.
    assert.equal(store.listForHolder({ tenantId: bas.tenantId, holderUserId: 'u-anna' }).length, 1);
    // Läkaren ser bara det hen själv utfärdat.
    assert.equal(
      store.listIssuedBy({ tenantId: bas.tenantId, issuedByUserId: 'u-lakare' }).length,
      2
    );
    // Ägaren ser allt.
    assert.equal(store.listForTenant({ tenantId: bas.tenantId }).length, 3);
  });
});

test('en annan klinik ser inte den här klinikens delegeringar', async () => {
  await medStore(async (store) => {
    await store.issueDelegation({ ...bas, validUntil: '2030-01-01T00:00:00Z' });
    assert.equal(store.listForTenant({ tenantId: 'curatiio' }).length, 0);
    assert.equal(store.listForHolder({ tenantId: 'curatiio', holderUserId: 'u-anna' }).length, 0);
  });
});

test('sammanfattningen räknar rätt kategorier', async () => {
  await medStore(async (store) => {
    await store.issueDelegation({ ...bas, validUntil: '2030-01-01T00:00:00Z' });
    const snart = await store.issueDelegation({
      ...bas,
      holderUserId: 'u-b',
      validUntil: new Date(NU.getTime() + 5 * 86400000).toISOString(),
    });
    const attAterkalla = await store.issueDelegation({
      ...bas,
      holderUserId: 'u-c',
      validUntil: '2030-01-01T00:00:00Z',
    });
    await store.revokeDelegation({ id: attAterkalla.id, revokedByUserId: 'u-lakare' });

    const s = store.summary({ tenantId: bas.tenantId, nu: NU });
    assert.equal(s.total, 3);
    assert.equal(s.valid, 2);
    assert.equal(s.expiresSoon, 1);
    assert.equal(s.revoked, 1);
    assert.equal(s.notStarted, 0);
    assert.equal(snart.status, STATUS.GILTIG);
  });
});
