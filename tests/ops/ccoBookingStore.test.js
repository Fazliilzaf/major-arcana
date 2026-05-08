const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');

test('ccoBookingStore skapar ärenden idempotent och begränsar kandidat-tider till tre', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-store-'));
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const base = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-booking-1',
      customerEmail: 'Anna@Example.com',
      customerName: 'Anna',
    };

    const first = await store.ensureCase(base);
    const second = await store.ensureCase(base);
    assert.equal(first.bookingCaseId, second.bookingCaseId);
    assert.equal(second.status, 'needs_triage');
    assert.equal(second.customerEmail, 'anna@example.com');
    assert.equal(second.events.length, 1);
    assert.equal(second.events[0].type, 'case_created');

    const withSlots = await store.setCandidateSlots({
      ...base,
      selectedSlots: [
        { id: 'slot-1', startsAt: '2026-05-08T09:30:00.000Z', resourceLabel: 'Dr. Eriksson' },
        { id: 'slot-2', startsAt: '2026-05-08T13:30:00.000Z', resourceLabel: 'Dr. Sara' },
        { id: 'slot-3', startsAt: '2026-05-09T09:30:00.000Z', resourceLabel: 'Dr. Eriksson' },
        { id: 'slot-4', startsAt: '2026-05-09T13:30:00.000Z', resourceLabel: 'Dr. Sara' },
      ],
    });

    assert.equal(withSlots.bookingCaseId, first.bookingCaseId);
    assert.equal(withSlots.status, 'slots_ready');
    assert.equal(withSlots.selectedSlots.length, 3);
    assert.equal(withSlots.events.at(-1).type, 'candidate_slots_selected');

    const offered = await store.updateStatus({
      ...base,
      status: 'offered',
    });
    assert.equal(offered.status, 'offered');
    assert.ok(offered.offeredAt);
    assert.equal(offered.events.at(-1).type, 'offer_draft_inserted');

    const withEvent = await store.addEvent({
      ...base,
      type: 'follow_up_opened',
      label: 'Uppföljning öppnad',
      detail: 'Operatören öppnade uppföljningsmodalen.',
      metadata: {
        bookingFollowUpReason: 'Kundväntan över 24h',
        ignoredArray: ['not persisted as top-level'],
      },
    });
    assert.equal(withEvent.events.at(-1).type, 'follow_up_opened');
    assert.equal(withEvent.events.at(-1).metadata.bookingFollowUpReason, 'Kundväntan över 24h');

    const waiting = await store.updateStatus({
      ...base,
      status: 'waiting_customer',
    });
    assert.equal(waiting.status, 'waiting_customer');
    assert.equal(waiting.events.at(-1).type, 'status_changed');
    assert.equal(waiting.events.at(-1).previousStatus, 'offered');
    assert.equal(waiting.events.at(-1).nextStatus, 'waiting_customer');

    const confirmed = await store.updateStatus({
      ...base,
      status: 'confirmed_external',
    });
    assert.equal(confirmed.status, 'confirmed_external');
    assert.ok(confirmed.confirmedExternalAt);
    assert.equal(confirmed.events.at(-1).type, 'external_confirmation_marked');
    assert.match(confirmed.events.at(-1).detail, /Ingen direkt Cliento-write/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore kan sortera bokningsärenden efter blockeringsgrad', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-store-sort-'));
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-offered',
      customerEmail: 'offered@example.com',
      status: 'offered',
      selectedSlots: [{ id: 'slot-offered', startsAt: '2026-05-10T10:00:00.000Z' }],
    });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-slots',
      customerEmail: 'slots@example.com',
      status: 'slots_ready',
      selectedSlots: [{ id: 'slot-ready', startsAt: '2026-05-09T10:00:00.000Z' }],
    });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-empty',
      customerEmail: 'empty@example.com',
      status: 'needs_triage',
    });

    store._state.cases.find((bookingCase) => bookingCase.conversationId === 'conv-offered').updatedAt =
      '2026-05-07T10:00:00.000Z';
    store._state.cases.find((bookingCase) => bookingCase.conversationId === 'conv-slots').updatedAt =
      '2026-05-07T11:00:00.000Z';
    store._state.cases.find((bookingCase) => bookingCase.conversationId === 'conv-empty').updatedAt =
      '2026-05-07T09:00:00.000Z';

    const blocked = await store.listCases({ tenantId: 'tenant-a', sort: 'blocked' });
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.conversationId),
      ['conv-empty', 'conv-slots', 'conv-offered']
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.blocker.key),
      ['candidate_slots', 'insert_studio', 'customer_state']
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.blocker.score),
      [30, 20, 10]
    );

    const recent = await store.listCases({ tenantId: 'tenant-a', sort: 'recent' });
    assert.deepEqual(
      recent.map((bookingCase) => bookingCase.conversationId),
      ['conv-slots', 'conv-offered', 'conv-empty']
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
