'use strict';

/* findPatientByPhone — telefon-uppslag för inbound-SMS-matchning (följdsteg).
 * Speglar findPatientByEmail: matchar primaryPhone/phones, normaliserar numret,
 * hoppar över merged. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

async function store() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-phone-'));
  return createCcoPatientMasterStore({ filePath: path.join(dir, 'pm.json') });
}

test('hittar kund på normaliserat telefonnummer', async () => {
  const s = await store();
  await s.upsertPatient({ tenantId: 'hairtpclinic', name: 'Anna', primaryPhone: '070-123 45 67' });
  const hit = await s.findPatientByPhone({ tenantId: 'hairtpclinic', phone: '+46701234567' });
  // Formatvariation (+46 vs 0) ska matcha samma normaliserade nyckel.
  assert.ok(hit, 'kund hittades på telefonnummer');
  assert.equal(hit.displayName, 'Anna');
  assert.equal(hit.primaryPhone, '0701234567');
});

test('okänt nummer → null', async () => {
  const s = await store();
  await s.upsertPatient({ tenantId: 'hairtpclinic', name: 'Anna', primaryPhone: '0701234567' });
  const miss = await s.findPatientByPhone({ tenantId: 'hairtpclinic', phone: '+46700000000' });
  assert.equal(miss, null);
});

test('tomt nummer → null (ingen krasch)', async () => {
  const s = await store();
  assert.equal(await s.findPatientByPhone({ tenantId: 'hairtpclinic', phone: '' }), null);
  assert.equal(await s.findPatientByPhone({ tenantId: 'hairtpclinic' }), null);
});
