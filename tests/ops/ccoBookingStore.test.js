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
    assert.equal(confirmed.blocker.action, 'set_status:closed');
    assert.equal(confirmed.blocker.tone, 'ready');
    assert.equal(confirmed.events.at(-1).type, 'external_confirmation_marked');
    assert.match(confirmed.events.at(-1).detail, /Ingen direkt kalenderskrivning/);
    assert.doesNotMatch(confirmed.events.at(-1).detail, /Cliento/i);
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

    store._state.cases.find(
      (bookingCase) => bookingCase.conversationId === 'conv-offered'
    ).updatedAt = '2026-05-07T10:00:00.000Z';
    store._state.cases.find(
      (bookingCase) => bookingCase.conversationId === 'conv-slots'
    ).updatedAt = '2026-05-07T11:00:00.000Z';
    store._state.cases.find(
      (bookingCase) => bookingCase.conversationId === 'conv-empty'
    ).updatedAt = '2026-05-07T09:00:00.000Z';

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

test('ccoBookingStore skiljer på pågående och försenad uppföljning i waiting_customer', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-store-followup-'));
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const recentBase = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-followup-recent',
      customerEmail: 'recent-followup@example.com',
      status: 'waiting_customer',
      offeredAt: '2026-05-09T09:00:00.000Z',
      updatedAt: '2026-05-10T09:00:00.000Z',
      selectedSlots: [{ id: 'slot-recent', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade uppföljning.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
        },
      ],
    };
    const staleBase = {
      ...recentBase,
      conversationId: 'conv-followup-stale',
      customerEmail: 'stale-followup@example.com',
      selectedSlots: [{ id: 'slot-stale', startsAt: '2026-05-13T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade uppföljning.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    };

    const recent = await store.upsertCase(recentBase);
    const stale = await store.upsertCase(staleBase);

    assert.equal(recent.blocker.label, 'Uppföljning pågår');
    assert.equal(recent.blocker.action, 'confirm_external');
    assert.equal(recent.blocker.nextActionLabel, 'invänta kundsvar');
    assert.equal(recent.blocker.score, 12);
    assert.equal(recent.recommendedActionState, 'monitor');
    assert.match(String(recent.recommendedActionReason || ''), /bevakas/i);

    assert.equal(stale.blocker.label, 'Följ upp igen');
    assert.equal(stale.blocker.action, 'schedule_followup');
    assert.equal(stale.blocker.nextActionLabel, 'påminn kunden');
    assert.equal(stale.blocker.score, 22);
    assert.equal(stale.recommendedActionState, 'reengage_now');
    assert.match(String(stale.recommendedActionReason || ''), /återupptas nu/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore låter followUpDueAt styra när en uppföljning blir försenad', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-followup-due-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const activeCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-followup-due-active',
      customerEmail: 'due-active@example.com',
      status: 'waiting_customer',
      offeredAt: '2026-05-09T09:00:00.000Z',
      updatedAt: '2026-05-10T09:00:00.000Z',
      selectedSlots: [{ id: 'slot-due-active', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'follow_up_scheduled',
          label: 'Uppföljning schemalagd',
          detail: 'Återuppta tråden senare.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
          metadata: {
            followUpDueAt: new Date(Date.now() + 6 * 36e5).toISOString(),
          },
        },
      ],
    });

    const dueCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-followup-due-past',
      customerEmail: 'due-past@example.com',
      status: 'waiting_customer',
      offeredAt: '2026-05-09T09:00:00.000Z',
      updatedAt: '2026-05-10T09:00:00.000Z',
      selectedSlots: [{ id: 'slot-due-past', startsAt: '2026-05-12T11:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'follow_up_scheduled',
          label: 'Uppföljning schemalagd',
          detail: 'Återuppta tråden senare.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
          metadata: {
            followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
          },
        },
      ],
    });

    assert.equal(activeCase.blocker.label, 'Uppföljning pågår');
    assert.equal(activeCase.blocker.action, 'confirm_external');
    assert.equal(activeCase.waitingCustomer.urgencyLevel, 'normal');
    assert.match(String(activeCase.waitingCustomer.urgencyReason || ''), /väntas återkomma/i);
    assert.equal(
      activeCase.waitingCustomer.latestFollowUpDueAt
        ? typeof activeCase.waitingCustomer.latestFollowUpDueAt
        : 'string',
      'string'
    );

    assert.equal(dueCase.blocker.label, 'Följ upp igen');
    assert.equal(dueCase.blocker.action, 'schedule_followup');
    assert.equal(dueCase.waitingCustomer.urgencyLevel, 'high');
    assert.match(String(dueCase.waitingCustomer.urgencyReason || ''), /passerat/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore låter inte interna handoff-händelser nollställa väntetiden för kunduppföljning', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-store-wait-anchor-'));
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const bookingCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-wait-anchor',
      customerEmail: 'wait-anchor@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-anchor', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'handoff_copied',
          label: 'Överlämning kopierad',
          detail: 'Intern överlämning kopierades.',
          createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
        },
      ],
    });

    assert.equal(bookingCase.blocker.label, 'Saknar uppföljning');
    assert.equal(bookingCase.blocker.action, 'schedule_followup');
    assert.equal(bookingCase.blocker.nextActionLabel, 'schemalägg uppföljning');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore prioriterar uttryckligt kundsvar över gammal follow-up i waiting_customer', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-customer-reply-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const bookingCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-customer-reply',
      customerEmail: 'customer-reply@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-reply', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade uppföljning.',
          createdAt: new Date(Date.now() - 26 * 36e5).toISOString(),
        },
        {
          type: 'customer_replied',
          label: 'Kunden svarade',
          detail: 'Kunden återkom med svar i samma tråd.',
          createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
        },
      ],
    });

    assert.equal(bookingCase.blocker.label, 'Kundsvar inkommet');
    assert.equal(bookingCase.blocker.action, 'insert_studio');
    assert.equal(bookingCase.blocker.nextActionLabel, 'uppdatera Svarstudio');
    assert.equal(bookingCase.blocker.score, 21);
    assert.equal(bookingCase.waitingCustomer.mode, 'customer_reply');
    assert.equal(bookingCase.waitingCustomer.action, 'insert_studio');
    assert.equal(bookingCase.waitingCustomer.urgencyLevel, 'normal');
    assert.match(String(bookingCase.waitingCustomer.urgencyReason || ''), /svarat nyligen/i);
    assert.equal(bookingCase.recommendedActionState, 'act_now');
    assert.match(String(bookingCase.recommendedActionReason || ''), /uppdaterat operatörssvar/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore markerar äldre kundsvar som något som behöver bearbetas', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-customer-reply-stale-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const bookingCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-customer-reply-stale',
      customerEmail: 'customer-reply-stale@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-customer-reply-stale', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        },
        {
          type: 'customer_reply_received',
          label: 'Kundsvar mottaget',
          detail: 'Kunden svarade i samma tråd.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    });

    assert.equal(bookingCase.blocker.label, 'Bearbeta kundsvar');
    assert.equal(bookingCase.blocker.action, 'insert_studio');
    assert.equal(bookingCase.blocker.nextActionLabel, 'öppna Svarstudio');
    assert.equal(bookingCase.blocker.score, 23);
    assert.equal(bookingCase.waitingCustomer.mode, 'customer_reply');
    assert.equal(bookingCase.waitingCustomer.customerReplyStale, true);
    assert.equal(bookingCase.waitingCustomer.urgencyLevel, 'high');
    assert.match(String(bookingCase.waitingCustomer.urgencyReason || ''), /utan bearbetning/i);
    assert.equal(bookingCase.recommendedActionState, 'act_now_overdue');
    assert.match(String(bookingCase.recommendedActionReason || ''), /Svarstudio/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore prioriterar åldrade kundsvar och förfallna follow-ups före generiska offered-lägen', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-urgency-sort-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-offered-generic',
      customerEmail: 'offered-generic@example.com',
      status: 'offered',
      selectedSlots: [{ id: 'slot-offered-generic', startsAt: '2026-05-12T10:00:00.000Z' }],
    });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-followup-due-urgency',
      customerEmail: 'followup-due-urgency@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-followup-due-urgency', startsAt: '2026-05-12T11:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'follow_up_scheduled',
          label: 'Uppföljning schemalagd',
          detail: 'Återuppta tråden senare.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
          metadata: {
            followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
          },
        },
      ],
    });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-customer-reply-fresh',
      customerEmail: 'customer-reply-fresh@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-customer-reply-fresh', startsAt: '2026-05-12T12:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'customer_reply_received',
          label: 'Kundsvar mottaget',
          detail: 'Kunden svarade i samma tråd.',
          createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
        },
      ],
    });

    const blocked = await store.listCases({ tenantId: 'tenant-a', sort: 'blocked' });
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.conversationId),
      ['conv-followup-due-urgency', 'conv-customer-reply-fresh', 'conv-offered-generic']
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.blocker.score),
      [22, 21, 10]
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.recommendedActionState),
      ['reengage_now', 'act_now', 'set_customer_state']
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore återöppnar confirmed_external när kunden svarar efter bekräftelsen', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-confirmed-reply-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const confirmedCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-confirmed-reply',
      customerEmail: 'confirmed-reply@example.com',
      status: 'confirmed_external',
      confirmedExternalAt: '2026-05-09T09:00:00.000Z',
      updatedAt: '2026-05-09T09:00:00.000Z',
      selectedSlots: [{ id: 'slot-confirmed-reply', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'engine_booking_confirmed',
          label: 'Bokningen bekräftades i CCO',
          detail: 'Tiden låstes i CCO.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'customer_reply_received',
          label: 'Kundsvar mottaget',
          detail: 'Kunden återkom efter bekräftelsen.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
        },
      ],
    });

    assert.equal(confirmedCase.blocker.label, 'Kundsvar efter bekräftelse');
    assert.equal(confirmedCase.blocker.action, 'insert_studio');
    assert.equal(confirmedCase.blocker.nextActionLabel, 'uppdatera Svarstudio');
    assert.equal(confirmedCase.recommendedActionState, 'act_now');
    assert.match(String(confirmedCase.recommendedActionReason || ''), /efter bekräftelsen/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore håller confirmed_external levande när uppföljning efter bekräftelsen förfaller', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-confirmed-followup-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    const bookingCase = await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-confirmed-followup-due',
      customerEmail: 'confirmed-followup-due@example.com',
      customerName: 'Confirmed Followup Due',
      status: 'confirmed_external',
      confirmedExternalAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-confirmed-followup-due', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'engine_booking_confirmed',
          label: 'Bokningen bekräftades i CCO',
          detail: 'Tiden låstes i CCO.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'follow_up_scheduled',
          label: 'Uppföljning schemalagd',
          detail: 'Återuppta tråden om kunden inte svarar.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
          metadata: {
            followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
          },
        },
      ],
    });

    assert.equal(bookingCase.blocker.label, 'Följ upp efter bekräftelse');
    assert.equal(bookingCase.blocker.action, 'schedule_followup');
    assert.equal(bookingCase.blocker.nextActionLabel, 'påminn kunden igen');
    assert.equal(bookingCase.blocker.score, 23);
    assert.equal(bookingCase.postConfirmation?.mode, 'post_confirmation_follow_up_due');
    assert.equal(bookingCase.recommendedActionState, 'reengage_now');
    assert.match(String(bookingCase.recommendedActionReason || ''), /efter bekräftelsen/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingStore bryter blocker-likaläge med rekommenderat arbetsläge före updatedAt', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-store-priority-tie-')
  );
  try {
    const store = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });

    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-followup-due-tie',
      customerEmail: 'followup-due-tie@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-followup-due-tie', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        },
        {
          type: 'follow_up_scheduled',
          label: 'Uppföljning schemalagd',
          detail: 'Återuppta tråden senare.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
          metadata: {
            followUpDueAt: new Date(Date.now() - 25 * 36e5).toISOString(),
          },
        },
      ],
    });
    await store.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-customer-reply-tie',
      customerEmail: 'customer-reply-tie@example.com',
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-customer-reply-tie', startsAt: '2026-05-12T11:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        },
        {
          type: 'customer_reply_received',
          label: 'Kundsvar mottaget',
          detail: 'Kunden svarade i samma tråd.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    });

    const blocked = await store.listCases({ tenantId: 'tenant-a', sort: 'blocked' });
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.conversationId),
      ['conv-customer-reply-tie', 'conv-followup-due-tie']
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.blocker.score),
      [23, 23]
    );
    assert.deepEqual(
      blocked.map((bookingCase) => bookingCase.recommendedActionState),
      ['act_now_overdue', 'reengage_now']
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
