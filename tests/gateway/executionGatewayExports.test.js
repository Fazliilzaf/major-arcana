const test = require('node:test');
const assert = require('node:assert/strict');

const { maxDecision, PERSIST_ALLOWED_DECISIONS } = require('../../src/gateway/executionGateway');

test('maxDecision returns strictest known risk decision', () => {
  assert.equal(maxDecision('allow', 'blocked', 'allow_flag'), 'blocked');
  assert.equal(maxDecision('review_required', 'allow'), 'review_required');
  assert.equal(maxDecision('blocked', 'critical_escalate'), 'critical_escalate');
  assert.equal(maxDecision('allow', 'bogus', 'allow_flag'), 'allow_flag');
});

test('maxDecision utan argument eller bara okända värden ger allow', () => {
  assert.equal(maxDecision(), 'allow');
  assert.equal(maxDecision('weird', '', 'UNKNOWN'), 'allow');
});

test('maxDecision hanterar versaler och blandade beslut', () => {
  assert.equal(maxDecision('ALLOW', 'BLOCKED'), 'blocked');
  assert.equal(maxDecision('Critical_Escalate', 'allow_flag'), 'critical_escalate');
});

test('PERSIST_ALLOWED_DECISIONS gates which outcomes may persist', () => {
  assert.equal(PERSIST_ALLOWED_DECISIONS.has('allow'), true);
  assert.equal(PERSIST_ALLOWED_DECISIONS.has('allow_flag'), true);
  assert.equal(PERSIST_ALLOWED_DECISIONS.has('review_required'), true);
  assert.equal(PERSIST_ALLOWED_DECISIONS.has('blocked'), false);
  assert.equal(PERSIST_ALLOWED_DECISIONS.has('critical_escalate'), false);
});
