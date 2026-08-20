'use strict';

/**
 * patientId i legacy ccoBookingStore.
 *
 * ccoBookingStore.js ar legacy men anvands fortfarande av ccoBookings.js.
 * Routen filtrerar /calendar-bundle pa patientId, men storen hade inget
 * sadant falt. Dessa tester lagger fast kontraktet:
 *   - patientId kan sparas pa en case-post
 *   - upsertCase raderar inte ett befintligt patientId av misstag
 *   - explicit patientId uppdaterar ett befintligt
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-booking-store-test-'));
  const filePath = path.join(dir, 'cco-bookings.json');
  const store = await createCcoBookingStore({ filePath });
  return { store, dir, filePath };
}

test('normalizeBookingCase bevarar patientId', async () => {
  const { store } = await tempStore();
  const created = await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    patientId: 'pat-123',
    status: 'needs_triage',
  });
  assert.equal(created.patientId, 'pat-123');
});

test('upsertCase raderar inte befintligt patientId nar nytt ar tomt', async () => {
  const { store } = await tempStore();
  const first = await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    patientId: 'pat-123',
    status: 'needs_triage',
  });
  assert.equal(first.patientId, 'pat-123');

  // En uppdatering utan patientId ska inte radera det befintliga.
  const second = await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    status: 'slots_ready',
  });
  assert.equal(second.patientId, 'pat-123');
});

test('upsertCase uppdaterar patientId nar nytt explicit anges', async () => {
  const { store } = await tempStore();
  await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    patientId: 'pat-123',
    status: 'needs_triage',
  });

  const updated = await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    patientId: 'pat-456',
    status: 'needs_triage',
  });
  assert.equal(updated.patientId, 'pat-456');
});

test('listCases inkluderar patientId i utdata', async () => {
  const { store } = await tempStore();
  await store.upsertCase({
    tenantId: 'hair-tp-clinic',
    workspaceId: 'major-arcana-preview',
    conversationId: 'conv-1',
    customerEmail: 'anna@example.se',
    patientId: 'pat-123',
    status: 'needs_triage',
  });

  const cases = await store.listCases({ tenantId: 'hair-tp-clinic', limit: 10 });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].patientId, 'pat-123');
});
