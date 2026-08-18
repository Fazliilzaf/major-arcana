'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCcoConversationContextService,
} = require('../../src/ops/ccoConversationContextService');

function makeThreadStore({ threads = [], counts = {} } = {}) {
  return {
    async buildThreadsForCustomer(customerId, { tenantId }) {
      return {
        threads: threads.map((t) => ({ ...t })),
        counts: { ...counts },
        summary: {},
        mailboxes: [],
      };
    },
  };
}

function makeSlaMonitor() {
  return {
    evaluateSlaMonitor(input = {}) {
      return {
        hoursSinceInbound: 5,
        slaStatus: 'safe',
        hoursRemaining: 43,
        slaThreshold: 48,
        withinOpeningHours: true,
        answered: false,
        stagnated: false,
        followUpSuggested: false,
        isUnanswered: false,
        unansweredThresholdHours: 24,
        ...input.overrides,
      };
    },
  };
}

function makeRiskStackEngine() {
  return {
    evaluateRiskStack(input = {}) {
      return {
        dominantRisk: input.slaStatus === 'breach' ? 'miss' : 'neutral',
        weightedScore: input.slaStatus === 'breach' ? 0.85 : 0.1,
        explanation: 'test-explanation',
        recommendedAction: 'test-action',
        breakdown: {
          missRisk: 0.1,
          toneRisk: 0.1,
          followUpRisk: 0.1,
          relationshipRisk: 0.1,
          weighted: {},
        },
      };
    },
  };
}

function makeTemperatureEngine() {
  return {
    evaluateCustomerTemperature(input = {}) {
      return {
        temperature: input.slaStatus === 'breach' ? 'at_risk' : 'stable',
        drivers: ['test-driver'],
        score: input.slaStatus === 'breach' ? 0.9 : 0.2,
      };
    },
  };
}

test('buildContextForCustomer returns full context shape', async () => {
  const nowMs = Date.parse('2026-07-15T12:00:00.000Z');
  const customerId = 'cust-ctx-1';
  const tenantId = 'hairtpclinic';
  const threads = [
    {
      threadId: 't1',
      conversationId: 'c1',
      kind: 'incoming_mail',
      direction: 'inbound',
      ts: '2026-07-15T08:00:00.000Z',
      threadStatus: 'unanswered',
      systemMail: false,
      handled: false,
      mailboxId: 'a@b.com',
    },
    {
      threadId: 't2',
      conversationId: 'c2',
      kind: 'outgoing_mail',
      direction: 'outbound',
      ts: '2026-07-14T08:00:00.000Z',
      threadStatus: 'sent',
      systemMail: false,
      handled: false,
      mailboxId: 'a@b.com',
    },
  ];

  const service = createCcoConversationContextService({
    threadStore: makeThreadStore({ threads, counts: { unanswered: 1, needs_approval: 0 } }),
    slaMonitor: makeSlaMonitor(),
    riskStackEngine: makeRiskStackEngine(),
    customerTemperatureEngine: makeTemperatureEngine(),
  });

  const context = await service.buildContextForCustomer(customerId, { tenantId, nowMs });

  assert.equal(context.customerId, customerId);
  assert.equal(context.tenantId, tenantId);
  assert.equal(context.conversationKey, null);
  assert.equal(context.latestInboundAt, '2026-07-15T08:00:00.000Z');
  assert.equal(context.latestOutboundAt, '2026-07-14T08:00:00.000Z');
  assert.equal(context.unanswered.count, 1);
  assert.equal(context.activeThreadCount, 2);
  assert.equal(context.needsActionCount, 1);
  assert.equal(context.slaStatus.slaStatus, 'safe');
  assert.equal(context.dominantRisk, 'neutral');
  assert.ok(context.risk.explanation);
  assert.ok(context.temperature.temperature);
  assert.equal(context.sentiment, null);
  assert.equal(context.intent, null);
});

test('conversationKey scopes threads', async () => {
  const nowMs = Date.parse('2026-07-15T12:00:00.000Z');
  const threads = [
    {
      threadId: 'scoped',
      conversationId: 'conv-scoped',
      kind: 'incoming_mail',
      direction: 'inbound',
      ts: '2026-07-15T08:00:00.000Z',
      threadStatus: 'unanswered',
      systemMail: false,
      handled: false,
    },
    {
      threadId: 'other',
      conversationId: 'conv-other',
      kind: 'incoming_mail',
      direction: 'inbound',
      ts: '2026-07-15T07:00:00.000Z',
      threadStatus: 'unanswered',
      systemMail: false,
      handled: false,
    },
  ];

  const service = createCcoConversationContextService({
    threadStore: makeThreadStore({ threads, counts: { unanswered: 2 } }),
    slaMonitor: makeSlaMonitor(),
    riskStackEngine: makeRiskStackEngine(),
    customerTemperatureEngine: makeTemperatureEngine(),
  });

  const context = await service.buildContextForCustomer('cust', {
    tenantId: 't',
    conversationKey: 'conv-scoped',
    nowMs,
  });

  assert.equal(context.conversationKey, 'conv-scoped');
  assert.equal(context.unanswered.count, 1);
  assert.equal(context.latestInboundAt, '2026-07-15T08:00:00.000Z');
});

test('includeAiSummary calls aiSummaryResolver and includes sentiment/intent', async () => {
  const nowMs = Date.parse('2026-07-15T12:00:00.000Z');
  const threads = [
    {
      threadId: 't1',
      kind: 'incoming_mail',
      direction: 'inbound',
      ts: '2026-07-15T08:00:00.000Z',
      threadStatus: 'unanswered',
      systemMail: false,
      handled: false,
    },
  ];

  let calledKey = null;
  let calledTenantId = null;
  const aiSummaryResolver = async (key, tenantId) => {
    calledKey = key;
    calledTenantId = tenantId;
    return {
      sentiment: { code: 'negative', label: 'Negativ', tone: 'frustrated', confidence: 0.9 },
      intent: { code: 'complaint', label: 'Klagomål', confidence: 0.8 },
      risk: 'Stämning: Negativ · Avsikt: Klagomål',
    };
  };

  const service = createCcoConversationContextService({
    threadStore: makeThreadStore({ threads, counts: { unanswered: 1 } }),
    slaMonitor: makeSlaMonitor(),
    riskStackEngine: makeRiskStackEngine(),
    customerTemperatureEngine: makeTemperatureEngine(),
    aiSummaryResolver,
  });

  const context = await service.buildContextForCustomer('cust', {
    tenantId: 't',
    conversationKey: 't1',
    nowMs,
    includeAiSummary: true,
  });

  assert.equal(calledKey, 't1');
  assert.equal(calledTenantId, 't');
  assert.equal(context.sentiment?.tone, 'frustrated');
  assert.equal(context.intent?.code, 'complaint');
});

test('aiSummaryResolver errors are swallowed', async () => {
  const service = createCcoConversationContextService({
    threadStore: makeThreadStore({ threads: [], counts: {} }),
    slaMonitor: makeSlaMonitor(),
    riskStackEngine: makeRiskStackEngine(),
    customerTemperatureEngine: makeTemperatureEngine(),
    aiSummaryResolver: async () => {
      throw new Error('fail');
    },
  });

  const context = await service.buildContextForCustomer('cust', {
    tenantId: 't',
    conversationKey: 'k1',
    includeAiSummary: true,
  });

  assert.equal(context.sentiment, null);
  assert.equal(context.intent, null);
});

test('factory validates required dependencies', () => {
  assert.throws(() => createCcoConversationContextService({}));
  assert.throws(() =>
    createCcoConversationContextService({ threadStore: { buildThreadsForCustomer: () => {} } })
  );
});
