'use strict';

/**
 * P1-003/004 B-1 — thread-action state var tenant-blind (keyades enbart
 * `customerId::threadId`). Nu keyas state PER TENANT och legacy-rekord migreras
 * in i hair-tp-clinic. En tenant får aldrig läsa eller skriva en annan tenants
 * handled/snoozed/read-state.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createCcoConversationThreadStore } = require('../../src/ops/ccoConversationThreadStore');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-thread-iso-'));
  return path.join(dir, 'states.json');
}

test('B-1: mark_handled i Hair TP syns INTE i Curatiio (samma customerId/threadId)', async () => {
  const filePath = tmpFile();
  const store = await createCcoConversationThreadStore({ filePath });

  store.performAction({
    customerId: 'shared-cust',
    threadId: 'shared-thread',
    action: 'mark_handled',
    tenantId: 'hair-tp-clinic',
  });

  const hair = store.getThreadState('hair-tp-clinic', 'shared-cust', 'shared-thread');
  assert.ok(hair, 'Hair TP ska ha ett state-rekord');
  assert.equal(hair.handled, true);

  // Curatiio ska INTE se Hair TP:s state — ingen tenant-breddning.
  const curatiio = store.getThreadState('curatiio', 'shared-cust', 'shared-thread');
  assert.equal(curatiio, null, 'Curatiio fick inte se Hair TP:s thread-state');
});

test('B-1: snooze i Curatiio påverkar INTE Hair TP:s state', async () => {
  const filePath = tmpFile();
  const store = await createCcoConversationThreadStore({ filePath });

  store.performAction({
    customerId: 'shared-cust',
    threadId: 'shared-thread',
    action: 'snooze',
    snoozeUntilIso: '2026-12-31T00:00:00.000Z',
    tenantId: 'curatiio',
  });

  const curatiio = store.getThreadState('curatiio', 'shared-cust', 'shared-thread');
  assert.ok(curatiio?.snoozedUntil, 'Curatiio snooze ska finnas i Curatiios state');

  const hair = store.getThreadState('hair-tp-clinic', 'shared-cust', 'shared-thread');
  assert.equal(hair, null, 'Hair TP fick inte se Curatiios state');
});

test('B-1: alias-normalisering — hair_tp och hair-tp-clinic delar samma state-nyckel', async () => {
  const filePath = tmpFile();
  const store = await createCcoConversationThreadStore({ filePath });

  store.performAction({
    customerId: 'c1',
    threadId: 't1',
    action: 'mark_handled',
    tenantId: 'hair_tp',
  });

  // 'hair_tp' normaliseras → hair-tp-clinic, så samma rekord.
  const canonical = store.getThreadState('hair-tp-clinic', 'c1', 't1');
  assert.ok(canonical, 'hair_tp och hair-tp-clinic ska dela nyckel');
  assert.equal(canonical.handled, true);
});

test('B-1: legacy tenant-löst state migreras in i hair-tp-clinic, aldrig till Curatiio', async () => {
  const filePath = tmpFile();
  // Pre-fix-format: nyckel `customerId::threadId` (2 segment, utan tenant).
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      threadStates: {
        'legacy-cust::legacy-thread': {
          customerId: 'legacy-cust',
          threadId: 'legacy-thread',
          handled: true,
          snoozedUntil: null,
          readAt: null,
          linkedJourneyStep: null,
          history: [],
        },
      },
    })
  );

  const store = await createCcoConversationThreadStore({ filePath });

  const hair = store.getThreadState('hair-tp-clinic', 'legacy-cust', 'legacy-thread');
  assert.ok(hair, 'legacy-rekordet ska migreras in i hair-tp-clinic');
  assert.equal(hair.handled, true, 'handled-flaggan ska bevaras genom migrationen');

  const curatiio = store.getThreadState('curatiio', 'legacy-cust', 'legacy-thread');
  assert.equal(curatiio, null, 'legacy-state får aldrig läcka till Curatiio');
});

test('B-1: buildThreadsForCustomer slår upp state per tenant', async () => {
  const filePath = tmpFile();
  const customerId = 'cust-b1';
  const store = await createCcoConversationThreadStore({
    filePath,
    mailboxTruthStore: {
      listLoadedMailboxes: () => [],
      listMessages: () => [
        {
          mailboxId: 'contact@hairtpclinic.com',
          graphMessageId: 'g-b1',
          conversationId: 'conv-b1',
          folderType: 'inbox',
          direction: 'inbound',
          subject: 'B1',
          bodyPreview: 'x',
          fromEmail: 'patient@example.com',
          receivedAt: '2026-06-01T10:00:00.000Z',
          customerIdentity: { customerId, canonicalCustomerId: customerId },
        },
      ],
    },
    historyMailboxIds: ['contact@hairtpclinic.com'],
  });

  store.performAction({
    customerId,
    threadId: 'conv-b1',
    action: 'mark_handled',
    tenantId: 'hair-tp-clinic',
  });

  const hair = await store.buildThreadsForCustomer(customerId, { tenantId: 'hair-tp-clinic' });
  const hairThread = hair.threads.find((t) => t.threadId === 'conv-b1');
  assert.equal(hairThread.handled, true, 'Hair TP-läsning ser handled');

  const curatiio = await store.buildThreadsForCustomer(customerId, { tenantId: 'curatiio' });
  const curThread = curatiio.threads.find((t) => t.threadId === 'conv-b1');
  assert.equal(curThread.handled, false, 'Curatiio-läsning ser INTE Hair TP handled');
});
