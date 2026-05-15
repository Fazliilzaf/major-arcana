const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoConversationStateStore,
} = require('../../src/ops/ccoConversationStateStore');
const {
  createCcoMailboxTruthWorklistReadModel,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');

test('ccoConversationStateStore stores operator overlay on tenantId + canonicalConversationKey', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-conversation-state-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');

  try {
    const store = await createCcoConversationStateStore({ filePath });

    const first = await store.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'explicitMergeGroupId:merge-1',
      canonicalConversationSource: 'merge_identity',
      canonicalConversationType: 'explicitMergeGroupId',
      primaryConversationId: 'conv-1',
      underlyingConversationIds: ['conv-1', 'conv-2'],
      underlyingMailboxIds: ['contact@hairtpclinic.com', 'kons@hairtpclinic.com'],
      actionState: 'handled',
      needsReplyStatusOverride: 'handled',
      actionAt: '2026-04-16T08:00:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@hairtpclinic.se',
      idempotencyKey: 'handled-1',
    });

    const second = await store.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'explicitMergeGroupId:merge-1',
      canonicalConversationSource: 'merge_identity',
      canonicalConversationType: 'explicitMergeGroupId',
      primaryConversationId: 'conv-1',
      underlyingConversationIds: ['conv-1', 'conv-2'],
      underlyingMailboxIds: ['contact@hairtpclinic.com', 'kons@hairtpclinic.com'],
      actionState: 'reply_later',
      needsReplyStatusOverride: 'needs_reply',
      actionAt: '2026-04-16T09:00:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@hairtpclinic.se',
      idempotencyKey: 'later-1',
      followUpDueAt: '2026-04-17T09:00:00.000Z',
      waitingOn: 'owner',
      nextActionLabel: 'Svara i morgon',
      nextActionSummary: 'Återkoppla efter ny inbound',
    });

    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    assert.equal(second.actionState, 'reply_later');
    assert.equal(second.followUpDueAt, '2026-04-17T09:00:00.000Z');

    const active = store.getActiveState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'explicitMergeGroupId:merge-1',
    });
    assert.equal(active.actionState, 'reply_later');
    assert.deepEqual(active.underlyingMailboxIds, [
      'contact@hairtpclinic.com',
      'kons@hairtpclinic.com',
    ]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('ccoConversationStateStore replays matching idempotency, blocks in-progress, and rejects payload mismatch', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-conversation-idem-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');

  try {
    const store = await createCcoConversationStateStore({ filePath });
    const scope = {
      tenantId: 'tenant-a',
      routeKey: '/api/v1/cco/reply-later',
      actorUserId: 'owner-a',
      canonicalConversationKey: 'conversationKey:contact@hairtpclinic.com:conv-1',
      idempotencyKey: 'idem-1',
    };

    const first = await store.reserveIdempotency({
      ...scope,
      payload: { action: 'reply_later', followUpDueAt: '2026-04-16T12:00:00.000Z' },
    });
    assert.equal(first.status, 'started');

    const pendingReplay = await store.reserveIdempotency({
      ...scope,
      payload: { action: 'reply_later', followUpDueAt: '2026-04-16T12:00:00.000Z' },
    });
    assert.equal(pendingReplay.status, 'in_progress');

    await store.completeIdempotency({
      ...scope,
      responseSnapshot: { ok: true, action: 'reply_later' },
    });

    const replay = await store.reserveIdempotency({
      ...scope,
      payload: { action: 'reply_later', followUpDueAt: '2026-04-16T12:00:00.000Z' },
    });
    assert.equal(replay.status, 'replay');
    assert.equal(replay.existing.responseSnapshot.ok, true);

    const mismatch = await store.reserveIdempotency({
      ...scope,
      payload: { action: 'reply_later', followUpDueAt: '2026-04-17T12:00:00.000Z' },
    });
    assert.equal(mismatch.status, 'mismatch');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('worklist consumer projection applies reply_later and handled overrides from conversation state store', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-conversation-projection-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');

  try {
    const conversationStateStore = await createCcoConversationStateStore({ filePath });
    const truthStore = {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-1',
            conversationId: 'conv-1',
            graphMessageId: 'msg-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Patient behöver hjälp',
            bodyPreview: 'Kan ni återkomma med tider?',
            from: {
              address: 'patient@example.com',
              name: 'Patient Example',
            },
            receivedAt: '2026-04-16T07:00:00.000Z',
          },
        ];
      },
    };

    const model = createCcoMailboxTruthWorklistReadModel({
      store: truthStore,
      tenantId: 'tenant-a',
      conversationStateStore,
    });

    const baseline = model.buildConsumerModel({ mailboxIds: [] });
    assert.equal(baseline.rows.length, 1);
    assert.equal(baseline.rows[0].lane, 'act-now');

    await conversationStateStore.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: baseline.rows[0].conversation.key,
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      primaryConversationId: 'conv-1',
      underlyingConversationIds: ['conv-1'],
      underlyingMailboxIds: ['contact@hairtpclinic.com'],
      actionState: 'reply_later',
      needsReplyStatusOverride: 'needs_reply',
      followUpDueAt: '2026-04-17T09:00:00.000Z',
      waitingOn: 'owner',
      actionAt: '2026-04-16T08:00:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@hairtpclinic.se',
      idempotencyKey: 'projection-later-1',
    });

    const laterProjection = model.buildConsumerModel({ mailboxIds: [] });
    assert.equal(laterProjection.rows.length, 1);
    assert.equal(laterProjection.rows[0].lane, 'later');
    assert.equal(laterProjection.rows[0].state.operatorState.actionState, 'reply_later');

    await conversationStateStore.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: baseline.rows[0].conversation.key,
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      primaryConversationId: 'conv-1',
      underlyingConversationIds: ['conv-1'],
      underlyingMailboxIds: ['contact@hairtpclinic.com'],
      actionState: 'handled',
      needsReplyStatusOverride: 'handled',
      actionAt: '2026-04-16T08:30:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@hairtpclinic.se',
      idempotencyKey: 'projection-handled-1',
    });

    const handledProjection = model.buildConsumerModel({ mailboxIds: [] });
    assert.equal(handledProjection.rows.length, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeConversationState rejects unknown actionState', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-convstate-bad-action-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');
  try {
    const store = await createCcoConversationStateStore({ filePath });
    await assert.rejects(
      () =>
        store.writeConversationState({
          tenantId: 'tenant-a',
          canonicalConversationKey: 'conversationKey:mb@x.com:conv-bad-action',
          canonicalConversationSource: 'mailbox_conversation_fallback',
          canonicalConversationType: 'conversationKey',
          primaryConversationId: 'conv-bad-action',
          underlyingConversationIds: ['conv-bad-action'],
          underlyingMailboxIds: ['mb@x.com'],
          actionState: 'snoozed',
          needsReplyStatusOverride: 'needs_reply',
          actionAt: '2026-04-16T08:00:00.000Z',
          actionByUserId: 'owner-a',
          actionByEmail: 'owner@x.se',
          idempotencyKey: 'bad-action-1',
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeConversationState rejects unknown needsReplyStatusOverride', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-convstate-bad-override-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');
  try {
    const store = await createCcoConversationStateStore({ filePath });
    await assert.rejects(
      () =>
        store.writeConversationState({
          tenantId: 'tenant-a',
          canonicalConversationKey: 'conversationKey:mb@x.com:conv-bad-override',
          canonicalConversationSource: 'mailbox_conversation_fallback',
          canonicalConversationType: 'conversationKey',
          primaryConversationId: 'conv-bad-override',
          underlyingConversationIds: ['conv-bad-override'],
          underlyingMailboxIds: ['mb@x.com'],
          actionState: 'handled',
          needsReplyStatusOverride: 'maybe_later',
          actionAt: '2026-04-16T08:00:00.000Z',
          actionByUserId: 'owner-a',
          actionByEmail: 'owner@x.se',
          idempotencyKey: 'bad-override-1',
        }),
      /obligatoriska/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('supersedeConversationState defaults unknown reason to manual_clear', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-convstate-supersede-reason-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');
  try {
    const store = await createCcoConversationStateStore({ filePath });
    await store.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'conversationKey:mb@x.com:conv-super',
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      primaryConversationId: 'conv-super',
      underlyingConversationIds: ['conv-super'],
      underlyingMailboxIds: ['mb@x.com'],
      actionState: 'reply_later',
      needsReplyStatusOverride: 'needs_reply',
      actionAt: '2026-04-16T08:00:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@x.se',
      idempotencyKey: 'super-1',
    });
    const out = await store.supersedeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: 'conversationKey:mb@x.com:conv-super',
      supersededReason: 'not_a_catalog_reason',
    });
    assert.equal(out.superseded, true);
    assert.equal(out.supersededReason, 'manual_clear');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('migrateConversationState returns null when from and to keys are identical', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-convstate-migrate-same-'));
  const filePath = path.join(tmpDir, 'cco-conversation-state.json');
  try {
    const store = await createCcoConversationStateStore({ filePath });
    const key = 'conversationKey:mb@x.com:conv-same';
    await store.writeConversationState({
      tenantId: 'tenant-a',
      canonicalConversationKey: key,
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      primaryConversationId: 'conv-same',
      underlyingConversationIds: ['conv-same'],
      underlyingMailboxIds: ['mb@x.com'],
      actionState: 'handled',
      needsReplyStatusOverride: 'handled',
      actionAt: '2026-04-16T08:00:00.000Z',
      actionByUserId: 'owner-a',
      actionByEmail: 'owner@x.se',
      idempotencyKey: 'mig-same-1',
    });
    const migrated = await store.migrateConversationState({
      tenantId: 'tenant-a',
      fromCanonicalConversationKey: key,
      toCanonicalConversationKey: key,
    });
    assert.equal(migrated, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
