const VALID_BOOKING_EVENT_KINDS = new Set(['created', 'confirmed', 'cancelled', 'rescheduled']);

async function recordBookingConversationEvent({
  conversationStateStore,
  tenantId,
  conversationKey,
  bookingId,
  kind,
  actorUserId,
}) {
  if (!conversationStateStore || !conversationKey) return;
  const normalizedKind = String(kind || '').toLowerCase();
  if (!VALID_BOOKING_EVENT_KINDS.has(normalizedKind)) return;
  await conversationStateStore.writeConversationState({
    tenantId,
    canonicalConversationKey: conversationKey,
    actionState: 'handled',
    needsReplyStatusOverride: 'needs_reply',
    actionByUserId: actorUserId || 'system',
    nextActionLabel: normalizedKind,
    nextActionSummary: `Bokningshändelse: ${normalizedKind}`,
    bookingEvent: { kind: normalizedKind, bookingId, at: new Date().toISOString() },
  });
}

module.exports = { recordBookingConversationEvent };
