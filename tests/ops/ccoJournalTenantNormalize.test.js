'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');

/**
 * ORD-165 §3 — tenant-stavningen normaliseras vid inskrivning. Mutationstestet
 * skriver en journal med tenantId 'hair_tp' och visar att det fångas (lagras
 * som 'hair-tp-clinic'), och att en okänd variant avvisas i stället för att
 * skapa en fjärde stavning.
 */
async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-tenant-'));
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  return { store, dir };
}

test('ORD-165 §3: hair_tp normaliseras till hair-tp-clinic vid inskrivning', async () => {
  const { store, dir } = await makeStore();
  try {
    const entry = await store.upsertEntry({
      tenantId: 'hair_tp',
      patientId: 'p1',
      journalType: 'fitness_certificate',
      formVariant: 'curatiio_op',
    });
    assert.equal(entry.tenantId, 'hair-tp-clinic', 'hair_tp ska lagras som hair-tp-clinic');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('ORD-165 §3: alla Hair TP-varianter landar på hair-tp-clinic', async () => {
  const { store, dir } = await makeStore();
  try {
    for (const variant of ['hair_tp', 'hairtpclinic', 'hairtp-clinic', 'hair-tp-clinic']) {
      const entry = await store.upsertEntry({
        tenantId: variant,
        patientId: `p-${variant}`,
        journalType: 'fitness_certificate',
      });
      assert.equal(entry.tenantId, 'hair-tp-clinic', `${variant} ska normaliseras`);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('ORD-165 §3: okänd tenant avvisas vid inskrivning', async () => {
  const { store, dir } = await makeStore();
  try {
    await assert.rejects(
      () =>
        store.upsertEntry({
          tenantId: 'typo-hair-tp',
          patientId: 'p1',
          journalType: 'fitness_certificate',
        }),
      /Okänd tenant/,
      'en okänd tenant-sträng får inte nå storen'
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
