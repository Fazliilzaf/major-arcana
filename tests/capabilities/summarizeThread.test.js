'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  summarizeThreadCapability,
  buildHeuristicSummary,
  detectKeyTokens,
} = require('../../src/capabilities/summarizeThread');
const { validateJsonSchema } = require('../../src/capabilities/schemaValidator');

const baseContext = {
  tenantId: 'tenant-a',
  actor: { id: 'owner-a', role: 'OWNER' },
  channel: 'admin',
  requestId: 'req-sum-1',
  correlationId: 'corr-sum-1',
};

test('SummarizeThread heuristic returnerar schema-valid output med 3-5 punkter', async () => {
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-1',
      customerName: 'Anna Andersson',
      subject: 'Bokning för konsultation',
      messages: [
        {
          direction: 'inbound',
          body: 'Hej, jag undrar om ni har tid på fredag kl 14:00? Vad kostar konsultationen?',
          sentAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
        {
          direction: 'outbound',
          body: 'Hej Anna, fredag 14:00 funkar bra. Konsultationen kostar 1500 kr.',
          sentAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          direction: 'inbound',
          body: 'Tack! Då bokar jag den tiden.',
          sentAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    },
  });

  const schemaResult = validateJsonSchema({
    schema: summarizeThreadCapability.outputSchema,
    value: output,
  });
  assert.equal(schemaResult.ok, true, JSON.stringify(schemaResult.errors) || 'schema invalid');

  assert.equal(output.data.source, 'heuristic');
  assert.ok(output.data.headline.length > 0);
  assert.ok(output.data.bullets.length >= 1);
  assert.ok(output.data.bullets.length <= 8);
  assert.match(output.data.headline, /Anna/);
});

test('SummarizeThread tomma trådar ger tydlig fallback', async () => {
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-empty',
      messages: [],
    },
  });
  const schemaResult = validateJsonSchema({
    schema: summarizeThreadCapability.outputSchema,
    value: output,
  });
  assert.equal(schemaResult.ok, true);
  assert.equal(output.data.bullets.length, 1);
  assert.match(output.data.bullets[0], /[Ii]nga meddelanden/);
});

test('SummarizeThread "what changed since last visit" räknar nya meddelanden', async () => {
  const lastVisit = new Date(Date.now() - 86400000).toISOString();
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: {
      conversationId: 'conv-3',
      customerName: 'Erik',
      lastVisitedAt: lastVisit,
      messages: [
        {
          direction: 'outbound',
          body: 'Hej, vi har bokat din tid.',
          sentAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          direction: 'inbound',
          body: 'Tack!',
          sentAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          direction: 'inbound',
          body: 'En sak till — kan jag flytta den till lördag istället?',
          sentAt: new Date(Date.now() - 1800000).toISOString(),
        },
      ],
    },
  });
  assert.equal(output.data.newMessagesSinceLastVisit, 2);
  assert.match(output.data.whatChangedSinceLastVisit, /2 nya meddelanden/);
});

test('detectKeyTokens extraherar tider, datum, priser och frågor', () => {
  const tokens = detectKeyTokens([
    {
      body: 'Kan jag boka 14:30 på fredag 2026-05-02? Vad kostar 5000 kr behandlingen?',
    },
    {
      body: 'Avbokar tyvärr — kan inte komma denna vecka.',
    },
  ]);
  assert.ok(tokens.times.includes('14:30'));
  assert.ok(tokens.dates.includes('2026-05-02'));
  assert.ok(tokens.prices.some((p) => /5000\s*kr/i.test(p)));
  assert.equal(tokens.questions, 2);
  assert.equal(tokens.cancellations, 1);
});

test('detectKeyTokens läser bodyPreview och text när body saknas', () => {
  const tokens = detectKeyTokens([
    { bodyPreview: 'Ring 08.15 angående 1 200 kr?' },
    { text: 'Jag kommer in imorgon för konsultation.' },
  ]);
  assert.ok(tokens.times.includes('08:15'));
  assert.ok(tokens.prices.some((p) => /1\s*200\s*kr/i.test(p)));
  assert.equal(tokens.questions, 1);
  assert.equal(tokens.bookings, 1);
});

test('detectKeyTokens räknar bokningssignal separat från avbokning', () => {
  const tokens = detectKeyTokens([{ body: 'Vi bokar dig nu — reserverar kl 16:00.' }]);
  assert.equal(tokens.bookings, 1);
  assert.equal(tokens.cancellations, 0);
  assert.ok(tokens.times.includes('16:00'));
});

test('buildHeuristicSummary respekterar fakta — hittar inte på tider eller priser', () => {
  const result = buildHeuristicSummary({
    messages: [
      {
        direction: 'inbound',
        body: 'Bara en kort fråga.',
        sentAt: new Date().toISOString(),
      },
    ],
    customerName: 'Test',
    subject: 'Fråga',
  });
  // Inga tider, datum eller priser i input → får inte synas i bullets
  const allText = result.bullets.join(' ');
  assert.doesNotMatch(allText, /\d{2}:\d{2}/);
  assert.doesNotMatch(allText, /\d+\s*kr/);
});

test('buildHeuristicSummary sorterar på recordedAt när sentAt saknas', () => {
  const earlier = '2026-01-10T10:00:00.000Z';
  const later = '2026-01-11T12:00:00.000Z';
  const result = buildHeuristicSummary({
    messages: [
      { direction: 'inbound', body: 'Nyare rad', recordedAt: later },
      { direction: 'outbound', body: 'Äldre rad', recordedAt: earlier },
    ],
  });
  assert.match(result.headline, /2 meddelanden/);
  assert.match(result.bullets[0], /Nyare rad/);
});

test('buildHeuristicSummary använder etiketten kund vid blankt kundnamn', () => {
  const result = buildHeuristicSummary({
    messages: [
      {
        direction: 'inbound',
        body: 'Hej',
        sentAt: new Date('2026-03-01T12:00:00.000Z').toISOString(),
      },
    ],
    customerName: '   \t',
  });
  assert.match(result.headline, /mellan kund och kliniken/);
});

test('SummarizeThread blockerar för många meddelanden via schema (maxItems 200)', async () => {
  const tooMany = Array.from({ length: 201 }, (_, i) => ({
    direction: 'inbound',
    body: `msg ${i}`,
    sentAt: new Date().toISOString(),
  }));
  const inputSchemaResult = validateJsonSchema({
    schema: summarizeThreadCapability.inputSchema,
    value: { messages: tooMany },
  });
  assert.equal(inputSchemaResult.ok, false);
});

test('SummarizeThread saknad tenantId ger metadata okand', async () => {
  const output = await new summarizeThreadCapability().execute({
    channel: 'admin',
    input: {
      conversationId: 'c1',
      messages: [{ direction: 'inbound', body: 'Hej', sentAt: new Date().toISOString() }],
    },
  });
  assert.equal(output.metadata.tenantId, 'okand');
});

test('SummarizeThread kapar langt conversationId till 1024 tecken', async () => {
  const longId = `id-${'x'.repeat(1100)}`;
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    input: {
      conversationId: longId,
      messages: [{ direction: 'inbound', body: 'Kort', sentAt: new Date().toISOString() }],
    },
  });
  assert.equal(output.data.conversationId.length, 1024);
  assert.ok(output.data.conversationId.endsWith('…'));
});

test('SummarizeThread openai som kastar ger varning och heuristic source', async () => {
  const openai = {
    chat: {
      completions: {
        create: async () => {
          throw new Error('rate limit');
        },
      },
    },
  };
  const output = await new summarizeThreadCapability().execute({
    ...baseContext,
    openai,
    openaiModel: 'gpt-4o-mini',
    input: {
      conversationId: 'c-openai-fail',
      messages: [{ direction: 'inbound', body: 'Hej', sentAt: new Date().toISOString() }],
    },
  });
  assert.equal(output.data.source, 'heuristic');
  assert.ok(output.warnings.some((w) => /AI-summary kunde inte genereras/i.test(w)));
});

test('detectKeyTokens tom array ger inga träffar', () => {
  const tokens = detectKeyTokens([]);
  assert.deepEqual(tokens.times, []);
  assert.deepEqual(tokens.dates, []);
  assert.deepEqual(tokens.prices, []);
  assert.equal(tokens.bookings, 0);
  assert.equal(tokens.cancellations, 0);
  assert.equal(tokens.questions, 0);
});
