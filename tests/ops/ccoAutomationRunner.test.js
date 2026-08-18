'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { evaluatePatientSignals, evaluateRule } = require('../../src/ops/ccoAutomationRunner');
const { REGISTRY_VERSION, RULES } = require('../../src/ops/ccoAutomationRegistry');

describe('ccoAutomationRunner conversation signals', () => {
  it('evaluerar conversation.unanswered_inbound korrekt', () => {
    const rule = RULES.find((r) => r.id === 'conversation.unanswered_inbound');
    assert.ok(rule);

    const active = evaluateRule(rule, {
      readout: {},
      conversationContext: { unanswered: { count: 3 } },
    });
    assert.strictEqual(active.status, 'active');
    assert.strictEqual(
      active.dataProvenance.includes('conversationContext.unanswered.count'),
      true
    );

    const inactive = evaluateRule(rule, {
      readout: {},
      conversationContext: { unanswered: { count: 0 } },
    });
    assert.strictEqual(inactive.status, 'inactive');
  });

  it('evaluerar conversation.sla_breach korrekt', () => {
    const rule = RULES.find((r) => r.id === 'conversation.sla_breach');
    assert.ok(rule);

    const active = evaluateRule(rule, {
      readout: {},
      conversationContext: { slaStatus: { slaStatus: 'breach' } },
    });
    assert.strictEqual(active.status, 'active');

    const inactive = evaluateRule(rule, {
      readout: {},
      conversationContext: { slaStatus: { slaStatus: 'safe' } },
    });
    assert.strictEqual(inactive.status, 'inactive');
  });

  it('evaluerar conversation.frustrated_tone korrekt', () => {
    const rule = RULES.find((r) => r.id === 'conversation.frustrated_tone');
    assert.ok(rule);

    const active = evaluateRule(rule, {
      readout: {},
      conversationContext: { sentiment: { tone: 'angry' } },
    });
    assert.strictEqual(active.status, 'active');

    const activeViaRisk = evaluateRule(rule, {
      readout: {},
      conversationContext: { dominantRisk: 'complaint' },
    });
    assert.strictEqual(activeViaRisk.status, 'active');

    const inactive = evaluateRule(rule, {
      readout: {},
      conversationContext: { sentiment: { tone: 'positive' } },
    });
    assert.strictEqual(inactive.status, 'inactive');
  });

  it('evaluerar conversation.booking_request_intent korrekt', () => {
    const rule = RULES.find((r) => r.id === 'conversation.booking_request_intent');
    assert.ok(rule);

    const active = evaluateRule(rule, {
      readout: {},
      conversationContext: { intent: { code: 'booking' } },
    });
    assert.strictEqual(active.status, 'active');

    const inactive = evaluateRule(rule, {
      readout: {},
      conversationContext: { intent: { code: 'question' } },
    });
    assert.strictEqual(inactive.status, 'inactive');
  });

  it('evaluerar conversation.follow_up_due korrekt', () => {
    const rule = RULES.find((r) => r.id === 'conversation.follow_up_due');
    assert.ok(rule);

    const active = evaluateRule(rule, {
      readout: {},
      conversationContext: { needsActionCount: 2 },
    });
    assert.strictEqual(active.status, 'active');

    const inactive = evaluateRule(rule, {
      readout: {},
      conversationContext: { needsActionCount: 0 },
    });
    assert.strictEqual(inactive.status, 'inactive');
  });

  it('evaluatePatientSignals inkluderar conversation-signals när context finns', () => {
    process.env.ENABLE_AUTOMATION_RUNNER = 'true';
    const result = evaluatePatientSignals(
      { readyForTreatment: false },
      {
        conversationContext: {
          unanswered: { count: 2 },
          slaStatus: { slaStatus: 'breach' },
          sentiment: { tone: 'frustrated' },
          intent: { code: 'booking' },
          needsActionCount: 1,
        },
      }
    );
    assert.strictEqual(result.enabled, true);
    const ids = result.signals.map((s) => s.ruleId);
    assert.ok(ids.includes('conversation.unanswered_inbound'));
    assert.ok(ids.includes('conversation.sla_breach'));
    assert.ok(ids.includes('conversation.frustrated_tone'));
    assert.ok(ids.includes('conversation.booking_request_intent'));
    assert.ok(ids.includes('conversation.follow_up_due'));
    delete process.env.ENABLE_AUTOMATION_RUNNER;
  });
});
