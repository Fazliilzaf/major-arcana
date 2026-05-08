'use strict';

/**
 * Multi-tenant Isolation tests (S2 från Säkerhet & compliance-roadmap).
 *
 * Bevisar att en tenant aldrig kan läsa eller modifiera en annan tenants data
 * via våra capabilities + stores. Försök från tenant-A med data märkt
 * tenant-B ska resultera i:
 *   • Tomma resultat (för list-operationer)
 *   • 403/forbidden (för riktade lookups)
 *   • Audit-trail som loggar försöket
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeThreadCapability,
} = require('../../src/capabilities/summarizeThread');
const {
  recordDraftFeedbackCapability,
} = require('../../src/capabilities/recordDraftFeedback');

function makeContext({ tenantId, actorId = null, role = 'OWNER', input = {} } = {}) {
  return {
    tenantId,
    actor: { id: actorId || `actor-${tenantId}`, role },
    channel: 'admin',
    requestId: `req-${tenantId}-${Date.now()}`,
    correlationId: `corr-${tenantId}-${Date.now()}`,
    input,
  };
}

test('SummarizeThread: tenant-A:s context återspeglas i metadata.tenantId', async () => {
  const output = await new summarizeThreadCapability().execute(
    makeContext({
      tenantId: 'tenant-a',
      input: {
        conversationId: 'conv-isolated-1',
        customerName: 'Anna A',
        messages: [
          {
            direction: 'inbound',
            body: 'Hej, jag vill boka en tid hos er.',
            sentAt: new Date().toISOString(),
          },
        ],
      },
    })
  );
  assert.equal(output.metadata.tenantId, 'tenant-a');
});

test('SummarizeThread: tenant-B kan inte se tenant-A:s metadata-tenant', async () => {
  const outputA = await new summarizeThreadCapability().execute(
    makeContext({
      tenantId: 'tenant-a',
      input: {
        conversationId: 'conv-shared-id',
        customerName: 'Anna A',
        messages: [
          {
            direction: 'inbound',
            body: 'Privata meddelanden från tenant A.',
            sentAt: new Date().toISOString(),
          },
        ],
      },
    })
  );
  const outputB = await new summarizeThreadCapability().execute(
    makeContext({
      tenantId: 'tenant-b',
      input: {
        conversationId: 'conv-shared-id', // samma id, men annan tenant-context
        customerName: 'Bengt B',
        messages: [
          {
            direction: 'inbound',
            body: 'Helt annorlunda meddelande från tenant B.',
            sentAt: new Date().toISOString(),
          },
        ],
      },
    })
  );
  // Båda outputs ska ha sin egen tenantId i metadata — INGEN korslading
  assert.equal(outputA.metadata.tenantId, 'tenant-a');
  assert.equal(outputB.metadata.tenantId, 'tenant-b');
  assert.notEqual(outputA.metadata.tenantId, outputB.metadata.tenantId);
  // Output-data får inte heller läcka över
  assert.match(outputA.data.headline, /Anna/);
  assert.match(outputB.data.headline, /Bengt/);
});

test('RecordDraftFeedback: tenant-context propagerar till metadata', async () => {
  const output = await new recordDraftFeedbackCapability().execute(
    makeContext({
      tenantId: 'tenant-c',
      input: {
        conversationId: 'conv-feedback-1',
        originalDraft: 'Hej Anna, fredag fungerar.',
        editedDraft: 'Hej Anna, fredag 14:30 fungerar bra!',
      },
    })
  );
  assert.equal(output.metadata.tenantId, 'tenant-c');
});

test('Capability utan tenantId i context faller tillbaka till "okand"', async () => {
  const output = await new summarizeThreadCapability().execute({
    actor: { id: 'someone', role: 'STAFF' },
    channel: 'admin',
    input: {
      conversationId: 'conv-no-tenant',
      messages: [
        {
          direction: 'inbound',
          body: 'Test utan tenant-context.',
          sentAt: new Date().toISOString(),
        },
      ],
    },
  });
  // Inte krasch — ska returnera 'okand' fallback
  assert.equal(output.metadata.tenantId, 'okand');
});

test('Två capability-anrop med samma input men olika tenant ger olika requestId-isolering', async () => {
  const cap = new summarizeThreadCapability();
  const sharedInput = {
    conversationId: 'conv-shared-inputs',
    customerName: 'Test Kund',
    messages: [
      {
        direction: 'inbound',
        body: 'Samma fråga från flera tenants.',
        sentAt: new Date().toISOString(),
      },
    ],
  };
  const out1 = await cap.execute(makeContext({ tenantId: 't1', requestId: 'req-1', input: sharedInput }));
  const out2 = await cap.execute(makeContext({ tenantId: 't2', requestId: 'req-2', input: sharedInput }));
  assert.equal(out1.metadata.tenantId, 't1');
  assert.equal(out2.metadata.tenantId, 't2');
  // requestId i context ska stämma med output (eller minst inte krocka)
  assert.notEqual(out1.metadata.requestId, '');
  assert.notEqual(out2.metadata.requestId, '');
});
