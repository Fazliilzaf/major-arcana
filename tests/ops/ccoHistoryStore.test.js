const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');

test('cco history store deduperar meddelanden och sammanfogar coverage-fönster', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-store-'));
  const filePath = path.join(tmpDir, 'cco-history.json');

  try {
    const store = await createCcoHistoryStore({ filePath });

    await store.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-01-01T00:00:00.000Z',
      windowEndIso: '2026-01-31T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-1',
          conversationId: 'conv-1',
          subject: 'PRP uppföljning',
          customerEmail: 'patient@example.com',
          sentAt: '2026-01-15T10:00:00.000Z',
          direction: 'inbound',
          senderEmail: 'patient@example.com',
          recipients: ['kons@hairtpclinic.com'],
        },
      ],
    });

    await store.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-01-15T00:00:00.000Z',
      windowEndIso: '2026-02-15T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-1',
          conversationId: 'conv-1',
          subject: 'PRP uppföljning',
          customerEmail: 'patient@example.com',
          sentAt: '2026-01-15T10:00:00.000Z',
          direction: 'inbound',
          senderEmail: 'patient@example.com',
          recipients: ['kons@hairtpclinic.com'],
        },
        {
          messageId: 'msg-2',
          conversationId: 'conv-1',
          subject: 'PRP uppföljning',
          customerEmail: 'patient@example.com',
          sentAt: '2026-02-10T09:00:00.000Z',
          direction: 'outbound',
          bodyHtml:
            '<div><p>Kontrollerat svar</p><img src="https://arcana.hairtpclinic.se/assets/hair-tp-clinic/hairtpclinic-mark-light.svg" alt="Hair TP Clinic" /></div>',
          senderEmail: 'kons@hairtpclinic.com',
          recipients: ['patient@example.com'],
        },
      ],
    });

    const summary = store.getMailboxSummary({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
    });
    assert.equal(summary.messageCount, 2);
    assert.equal(summary.coverageWindowCount, 1);
    assert.equal(summary.coverageStartIso, '2026-01-01T00:00:00.000Z');
    assert.equal(summary.coverageEndIso, '2026-02-15T00:00:00.000Z');

    const messages = await store.listMailboxMessages({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
    });
    assert.deepEqual(
      messages.map((message) => message.messageId),
      ['msg-2', 'msg-1']
    );
    assert.equal(
      String(messages[0]?.bodyHtml || '').includes('hairtpclinic-mark-light.svg'),
      true
    );

    const missingWindows = store.getMissingMailboxWindows({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      startIso: '2026-01-01T00:00:00.000Z',
      endIso: '2026-03-01T00:00:00.000Z',
    });
    assert.deepEqual(missingWindows, [
      {
        startIso: '2026-02-15T00:00:00.000Z',
        endIso: '2026-03-01T00:00:00.000Z',
      },
    ]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('cco history store bevarar lang inline-image html utan att kapa bort avslutande markup', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-store-inline-html-'));
  const filePath = path.join(tmpDir, 'cco-history.json');
  const longDataImage = `data:image/png;base64,${'QUJD'.repeat(7000)}`;

  try {
    const store = await createCcoHistoryStore({ filePath });

    await store.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'contact@hairtpclinic.com',
      windowStartIso: '2026-04-01T00:00:00.000Z',
      windowEndIso: '2026-04-30T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-inline-html-1',
          conversationId: 'conv-inline-html-1',
          subject: 'Grafisk signatur',
          customerEmail: 'patient@example.com',
          sentAt: '2026-04-07T10:00:00.000Z',
          direction: 'outbound',
          bodyHtml: `<div><p>Hej!</p><img src="${longDataImage}" alt="Hair TP Clinic" /></div>`,
          senderEmail: 'contact@hairtpclinic.com',
          recipients: ['patient@example.com'],
        },
      ],
    });

    const messages = await store.listMailboxMessages({
      tenantId: 'tenant-a',
      mailboxId: 'contact@hairtpclinic.com',
    });
    const bodyHtml = String(messages[0]?.bodyHtml || '');
    assert.equal(bodyHtml.length > 24000, true);
    assert.equal(bodyHtml.includes('data:image/png;base64,'), true);
    assert.equal(bodyHtml.endsWith('</div>'), true);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('cco history store sparar och listar kundutfall utan dubletter per konversation + utfallskod', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-outcomes-'));
  const filePath = path.join(tmpDir, 'cco-history.json');

  try {
    const store = await createCcoHistoryStore({ filePath });

    await store.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      outcomeLabel: 'Ombokad',
      recordedAt: '2026-02-11T10:00:00.000Z',
      actorUserId: 'owner-a',
    });

    await store.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      outcomeLabel: 'Ombokad',
      recordedAt: '2026-02-11T11:00:00.000Z',
      actorUserId: 'owner-a',
      recommendedMode: 'warm',
      priorityLevel: 'High',
      priorityScore: 67,
      dominantRisk: 'follow_up',
      recommendedAction: 'Upprepa två tydliga tider direkt.',
      historySignalPattern: 'reschedule',
      intent: 'reschedule',
    });

    await store.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-2',
      mailboxId: 'info@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'no_response',
      outcomeLabel: 'Ingen respons',
      recordedAt: '2026-02-12T09:00:00.000Z',
      actorUserId: 'owner-a',
      dominantRisk: 'follow_up',
    });

    const outcomes = await store.listCustomerOutcomes({
      tenantId: 'tenant-a',
      customerEmail: 'patient@example.com',
      mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
    });

    assert.equal(outcomes.length, 2);
    assert.deepEqual(
      outcomes.map((outcome) => [outcome.conversationId, outcome.outcomeCode, outcome.recordedAt]),
      [
        ['conv-2', 'no_response', '2026-02-12T09:00:00.000Z'],
        ['conv-1', 'rebooked', '2026-02-11T11:00:00.000Z'],
      ]
    );
    assert.equal(outcomes[1].recommendedMode, 'warm');
    assert.equal(outcomes[1].priorityLevel, 'High');
    assert.equal(outcomes[1].dominantRisk, 'follow_up');
    assert.equal(outcomes[1].recommendedAction, 'Upprepa två tydliga tider direkt.');
    assert.equal(outcomes[1].historySignalPattern, 'reschedule');

    const summary = await store.summarizeOutcomeEvaluations({
      tenantId: 'tenant-a',
      customerEmail: 'patient@example.com',
      mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
    });
    assert.equal(summary.totalOutcomeCount, 2);
    assert.equal(summary.positiveOutcomeCount, 1);
    assert.equal(summary.negativeOutcomeCount, 1);
    assert.equal(summary.preferredMode, 'warm');
    assert.equal(summary.preferredAction, 'Upprepa två tydliga tider direkt.');
    assert.equal(summary.dominantFailureOutcome, 'no_response');
    assert.equal(summary.dominantFailureRisk, 'follow_up');
    assert.equal(
      summary.actionSummaryByIntent.find((item) => item.intent === 'reschedule')?.best?.label,
      'Upprepa två tydliga tider direkt.'
    );
    assert.equal(
      summary.modeSummaryByIntent.find((item) => item.intent === 'reschedule')?.best?.key,
      'warm'
    );
    assert.equal(summary.mailboxComparisonSummary.length, 2);
    assert.equal(summary.failurePatternSummary[0]?.key, 'follow_up');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('cco history store söker alias-aware historik och deduperar samma mail över flera mailboxar', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-search-'));
  const filePath = path.join(tmpDir, 'cco-history.json');

  try {
    const store = await createCcoHistoryStore({ filePath });

    await store.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
      windowStartIso: '2026-03-01T00:00:00.000Z',
      windowEndIso: '2026-03-31T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-shared-kons',
          conversationId: 'conv-search-1',
          subject: 'PRP uppföljning',
          customerEmail: 'patient+vip@example.com',
          sentAt: '2026-03-11T10:00:00.000Z',
          direction: 'inbound',
          bodyPreview: 'Hej, jag vill boka om min tid.',
          senderEmail: 'patient+vip@example.com',
          recipients: ['kons@hairtpclinic.com'],
          internetMessageId: '<shared-message@example.com>',
        },
      ],
    });

    await store.upsertMailboxWindow({
      tenantId: 'tenant-a',
      mailboxId: 'info@hairtpclinic.com',
      windowStartIso: '2026-03-01T00:00:00.000Z',
      windowEndIso: '2026-03-31T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-shared-info',
          conversationId: 'conv-search-1',
          subject: 'Re: PRP uppföljning',
          customerEmail: 'patient@example.com',
          sentAt: '2026-03-11T10:00:00.000Z',
          direction: 'inbound',
          bodyPreview: 'Hej, jag vill boka om min tid.',
          senderEmail: 'patient@example.com',
          recipients: ['info@hairtpclinic.com'],
          internetMessageId: '<shared-message@example.com>',
        },
      ],
    });

    await store.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-search-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'reply_sent',
      actionLabel: 'Svar skickat',
      subject: 'PRP uppföljning',
      recordedAt: '2026-03-11T11:00:00.000Z',
      nextActionLabel: 'Invänta kundens svar',
      nextActionSummary: 'Vänta på kundens bekräftelse och följ upp vid behov.',
      intent: 'reschedule',
    });
    await store.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-search-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      subject: 'PRP uppföljning',
      recordedAt: '2026-03-11T12:00:00.000Z',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden har svarat och tråden bör öppnas igen.',
      intent: 'reschedule',
    });

    const results = await store.searchHistoryRecords({
      tenantId: 'tenant-a',
      mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
      customerEmail: 'patient@example.com',
      queryText: 'PRP',
      sinceIso: '2026-03-01T00:00:00.000Z',
      untilIso: '2026-03-31T23:59:59.000Z',
      limit: 10,
    });

    assert.equal(results.length, 3);
    assert.equal(results.filter((item) => item.resultType === 'message').length, 1);
    assert.equal(results.filter((item) => item.resultType === 'action').length, 2);
    assert.equal(results.find((item) => item.actionType === 'customer_replied')?.actionType, 'customer_replied');
    assert.equal(
      results.find((item) => item.actionType === 'customer_replied')?.nextActionLabel,
      'Återuppta tråden'
    );

    const filteredResults = await store.searchHistoryRecords({
      tenantId: 'tenant-a',
      mailboxIds: ['kons@hairtpclinic.com', 'info@hairtpclinic.com'],
      customerEmail: 'patient@example.com',
      queryText: 'PRP',
      intent: 'reschedule',
      resultTypes: ['action'],
      actionTypes: ['customer_replied'],
      sinceIso: '2026-03-01T00:00:00.000Z',
      untilIso: '2026-03-31T23:59:59.000Z',
      limit: 10,
    });

    assert.equal(filteredResults.length, 1);
    assert.equal(filteredResults.every((item) => item.resultType === 'action'), true);
    assert.equal(filteredResults[0]?.actionType, 'customer_replied');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('createCcoHistoryStore rejects missing filePath', async () => {
  await assert.rejects(() => createCcoHistoryStore({}), /filePath/i);
  await assert.rejects(() => createCcoHistoryStore({ filePath: '' }), /filePath/i);
});

test('upsertMailboxWindow throws when tenantId or mailboxId is blank', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-guard-'));
  const filePath = path.join(tmpDir, 'cco-history.json');
  try {
    const store = await createCcoHistoryStore({ filePath });
    await assert.rejects(
      () =>
        store.upsertMailboxWindow({
          tenantId: '  ',
          mailboxId: 'kons@x.se',
          windowStartIso: '2026-01-01T00:00:00.000Z',
          windowEndIso: '2026-01-02T00:00:00.000Z',
          messages: [],
        }),
      /tenantId och mailboxId/i
    );
    await assert.rejects(
      () =>
        store.upsertMailboxWindow({
          tenantId: 't1',
          mailboxId: '',
          windowStartIso: '2026-01-01T00:00:00.000Z',
          windowEndIso: '2026-01-02T00:00:00.000Z',
          messages: [],
        }),
      /tenantId och mailboxId/i
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('getMailboxSummary returns null for unknown mailbox; listMailboxMessages is empty', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-miss-'));
  const filePath = path.join(tmpDir, 'cco-history.json');
  try {
    const store = await createCcoHistoryStore({ filePath });
    assert.equal(store.getMailboxSummary({ tenantId: 't1', mailboxId: 'nobody@x.se' }), null);
    const rows = await store.listMailboxMessages({ tenantId: 't1', mailboxId: 'nobody@x.se' });
    assert.deepEqual(rows, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('mailbox state persists across store instances', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-reload-'));
  const filePath = path.join(tmpDir, 'cco-history.json');
  try {
    const a = await createCcoHistoryStore({ filePath });
    await a.upsertMailboxWindow({
      tenantId: 'tenant-persist',
      mailboxId: 'desk@clinic.se',
      windowStartIso: '2026-05-01T00:00:00.000Z',
      windowEndIso: '2026-05-02T00:00:00.000Z',
      messages: [
        {
          messageId: 'msg-p1',
          conversationId: 'conv-p1',
          subject: 'Hej',
          customerEmail: 'c@x.com',
          sentAt: '2026-05-01T12:00:00.000Z',
          direction: 'inbound',
          senderEmail: 'c@x.com',
          recipients: ['desk@clinic.se'],
        },
      ],
    });

    const b = await createCcoHistoryStore({ filePath });
    const summary = b.getMailboxSummary({ tenantId: 'tenant-persist', mailboxId: 'desk@clinic.se' });
    assert.ok(summary);
    assert.equal(summary.messageCount, 1);
    const listed = await b.listMailboxMessages({
      tenantId: 'tenant-persist',
      mailboxId: 'desk@clinic.se',
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].messageId, 'msg-p1');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
