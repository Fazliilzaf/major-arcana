'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  createAutomationConversationBridge,
} = require('../../src/ops/ccoAutomationConversationBridge');

async function createTruthStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-bridge-'));
  const store = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'truth.json'),
  });
  return { store, tempDir };
}

async function createPatientMasterStore(patients = []) {
  return {
    async listPatients() {
      return { patients };
    },
  };
}

test('bridge records synthetic sent message in truth store', async () => {
  const { store, tempDir } = await createTruthStore();
  try {
    const patientMasterStore = await createPatientMasterStore([
      { patientId: 'p-1', primaryEmail: 'kund@test.se', displayName: 'Kund' },
    ]);
    const bridge = createAutomationConversationBridge({
      ccoMailboxTruthStore: store,
      patientMasterStore,
      defaultTenantId: 'hair-tp-clinic',
    });

    const result = await bridge.recordAutomationSend({
      mailboxId: 'contact@hairtpclinic.com',
      fromEmail: 'contact@hairtpclinic.com',
      toEmail: 'kund@test.se',
      toName: 'Kund',
      subject: 'Bokningsbekräftelse',
      bodyHtml: '<p>Din bokning är bekräftad.</p>',
      bodyText: 'Din bokning är bekräftad.',
      sentAt: '2026-08-17T10:00:00.000Z',
      tenantId: 'hair-tp-clinic',
      automationType: 'booking_confirmation',
      sendResult: { ok: true, provider: 'graph', mode: 'live' },
    });

    assert.equal(result.recorded, true);
    assert.ok(result.graphMessageId.startsWith('cco-auto-'));
    assert.ok(result.mailboxConversationId);
    assert.equal(result.patientId, 'p-1');

    const messages = store.listMessages({
      mailboxIds: ['contact@hairtpclinic.com'],
      folderTypes: ['sent'],
    });
    assert.equal(messages.length, 1);
    const msg = messages[0];
    assert.equal(msg.folderType, 'sent');
    assert.equal(msg.fromEmail, 'contact@hairtpclinic.com');
    assert.deepEqual(msg.toEmails, ['kund@test.se']);
    assert.equal(msg.subject, 'Bokningsbekräftelse');
    assert.ok(msg.mailboxConversationId);
    assert.ok(msg.graphMessageId.startsWith('cco-auto-'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('bridge reuses existing conversation id for same recipient', async () => {
  const { store, tempDir } = await createTruthStore();
  try {
    const existingConversationId = 'contact@hairtpclinic.com:existing-thread';
    await store.recordFolderPage({
      account: { mailboxId: 'contact@hairtpclinic.com', mailboxAddress: 'contact@hairtpclinic.com' },
      folder: { folderType: 'inbox' },
      messages: [
        {
          graphMessageId: 'graph-123',
          conversationId: 'existing-thread',
          subject: 'Bokningsbekräftelse',
          from: { address: 'kund@test.se', name: 'Kund' },
          fromEmail: 'kund@test.se',
          toRecipients: [{ address: 'contact@hairtpclinic.com' }],
          toEmails: ['contact@hairtpclinic.com'],
          receivedAt: '2026-08-17T09:00:00.000Z',
          folderType: 'inbox',
        },
      ],
      complete: true,
    });

    const bridge = createAutomationConversationBridge({
      ccoMailboxTruthStore: store,
      patientMasterStore: null,
      defaultTenantId: 'hair-tp-clinic',
    });

    const result = await bridge.recordAutomationSend({
      mailboxId: 'contact@hairtpclinic.com',
      toEmail: 'kund@test.se',
      subject: 'Bokningsbekräftelse',
      bodyHtml: '<p>Tack</p>',
      automationType: 'booking_confirmation',
    });

    assert.equal(result.recorded, true);
    assert.equal(result.reusedConversation, true);
    assert.equal(result.mailboxConversationId, existingConversationId);

    const sentMessages = store.listMessages({
      mailboxIds: ['contact@hairtpclinic.com'],
      folderTypes: ['sent'],
    });
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].mailboxConversationId, existingConversationId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('bridge skips when recipient is missing', async () => {
  const { store, tempDir } = await createTruthStore();
  try {
    const bridge = createAutomationConversationBridge({
      ccoMailboxTruthStore: store,
      patientMasterStore: null,
    });
    const result = await bridge.recordAutomationSend({
      mailboxId: 'contact@hairtpclinic.com',
      subject: 'Hej',
      automationType: 'test',
    });
    assert.equal(result.recorded, false);
    assert.equal(result.reason, 'missing_mailbox_or_recipient');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
