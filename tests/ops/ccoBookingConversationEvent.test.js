const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { recordBookingConversationEvent } = require('../../src/ops/ccoBookingConversationEvent');
const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

test('recordBookingConversationEvent skriver bokningshändelse till trådstate', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-conversation-event-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');

  try {
    const conversationStateStore = await createCcoConversationStateStore({ filePath });

    await recordBookingConversationEvent({
      conversationStateStore,
      tenantId: 'tenant-a',
      conversationKey: 'conversationKey:booking-event',
      bookingId: 'booking-456',
      kind: 'confirmed',
      actorUserId: 'owner-b',
    });

    const active = conversationStateStore.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'conversationKey:booking-event',
    });

    assert.ok(active);
    assert.equal(active.actionState, 'handled');
    assert.equal(active.needsReplyStatusOverride, 'needs_reply');
    assert.equal(active.nextActionLabel, 'confirmed');
    assert.equal(active.nextActionSummary, 'Bokningshändelse: confirmed');
    assert.equal(active.actionByUserId, 'owner-b');
    assert.ok(active.bookingEvent);
    assert.equal(active.bookingEvent.kind, 'confirmed');
    assert.equal(active.bookingEvent.bookingId, 'booking-456');
    assert.ok(active.bookingEvent.at);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('recordBookingConversationEvent gör inget vid saknad store eller key', async () => {
  await assert.doesNotReject(async () => {
    await recordBookingConversationEvent({
      conversationStateStore: null,
      tenantId: 'tenant-a',
      conversationKey: 'conversationKey:missing',
      bookingId: 'booking-789',
      kind: 'created',
    });
  });

  await assert.doesNotReject(async () => {
    await recordBookingConversationEvent({
      conversationStateStore: {},
      tenantId: 'tenant-a',
      conversationKey: '',
      bookingId: 'booking-789',
      kind: 'created',
    });
  });
});

test('recordBookingConversationEvent ignorerar ogiltigt kind', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-conversation-event-bad-')
  );
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');

  try {
    const conversationStateStore = await createCcoConversationStateStore({ filePath });

    await recordBookingConversationEvent({
      conversationStateStore,
      tenantId: 'tenant-a',
      conversationKey: 'conversationKey:bad-kind',
      bookingId: 'booking-000',
      kind: 'unknown',
    });

    const active = conversationStateStore.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'conversationKey:bad-kind',
    });

    assert.equal(active, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
