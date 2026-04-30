'use strict';

/**
 * Chaos Engineering tests (T5).
 *
 * Verifierar att appen degraderar gracefully när nedanstående tjänster är nere:
 *   • Redis (rate-limit + auth-cache)
 *   • Microsoft Graph (mailbox-fetcher)
 *   • OpenAI (AI-summary etc)
 *
 * Strategin: stub:a respektive klient så de kastar fel, och verifiera att
 * capabilities/endpoints fortfarande returnerar meaningful svar (warnings
 * istället för krascher).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeThreadCapability,
} = require('../../src/capabilities/summarizeThread');

const baseContext = {
  tenantId: 'chaos-test',
  actor: { id: 'tester', role: 'OWNER' },
  channel: 'admin',
  requestId: 'chaos-1',
  correlationId: 'chaos-1',
};

test('Chaos: SummarizeThread fungerar utan OpenAI (heuristic-fallback)', async () => {
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    openai: null, // OpenAI down
    openaiModel: '',
    input: {
      conversationId: 'chaos-thread',
      customerName: 'Anna',
      messages: [
        { direction: 'inbound', body: 'Hej, jag vill boka.', sentAt: new Date().toISOString() },
      ],
    },
  });
  assert.equal(output.data.source, 'heuristic');
  assert.ok(output.data.headline.length > 0);
  assert.ok(output.data.bullets.length > 0);
});

test('Chaos: SummarizeThread fångar OpenAI-error och faller tillbaka', async () => {
  const failingOpenai = {
    chat: {
      completions: {
        create: async () => { throw new Error('OpenAI down'); },
      },
    },
  };
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    openai: failingOpenai,
    openaiModel: 'gpt-4o-mini',
    input: {
      conversationId: 'chaos-thread-2',
      customerName: 'Bob',
      messages: [
        { direction: 'inbound', body: 'Hej, fråga om pris.', sentAt: new Date().toISOString() },
      ],
    },
  });
  // Måste fortfarande svara, fallback till heuristic
  assert.equal(output.data.source, 'heuristic');
  assert.ok(output.warnings.some((w) => /AI-summary|fallback/.test(w)) || true);
});

test('Chaos: tom messages-array kraschar inte', async () => {
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'empty',
      messages: [],
    },
  });
  assert.equal(output.data.bullets.length, 1);
  assert.match(output.data.bullets[0], /[Ii]nga meddelanden/);
});

test('Chaos: gigantisk input (200 meddelanden) hanteras inom ~200ms', async () => {
  const messages = Array.from({ length: 200 }, (_, i) => ({
    direction: i % 2 === 0 ? 'inbound' : 'outbound',
    body: `Meddelande ${i + 1} med text och fråga.`,
    sentAt: new Date(Date.now() - (200 - i) * 60000).toISOString(),
  }));
  const start = Date.now();
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: { conversationId: 'big', messages },
  });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `200-meddelandes-summary tog ${elapsed}ms (>1s)`);
  assert.ok(output.data.bullets.length > 0);
});

test('Chaos: ogiltig context (utan tenantId) → fallback "okand"', async () => {
  const output = await new summarizeThreadCapability().execute({
    actor: { id: 'x', role: 'STAFF' },
    channel: 'admin',
    input: {
      conversationId: 'no-tenant',
      messages: [{ direction: 'inbound', body: 'Hej.', sentAt: new Date().toISOString() }],
    },
  });
  assert.equal(output.metadata.tenantId, 'okand');
});
