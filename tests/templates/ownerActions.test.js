const test = require('node:test');
const assert = require('node:assert/strict');

const { OWNER_ACTIONS } = require('../../src/templates/ownerActions');

test('OWNER_ACTIONS exposes stable string constants', () => {
  assert.equal(OWNER_ACTIONS.APPROVE_EXCEPTION, 'approve_exception');
  assert.equal(OWNER_ACTIONS.MARK_FALSE_POSITIVE, 'mark_false_positive');
  assert.equal(OWNER_ACTIONS.REQUEST_REVISION, 'request_revision');
  assert.equal(OWNER_ACTIONS.ESCALATE, 'escalate');
});

test('OWNER_ACTIONS object is frozen', () => {
  assert.equal(Object.isFrozen(OWNER_ACTIONS), true);
});

test('OWNER_ACTIONS contains exactly four unique action codes', () => {
  const values = Object.values(OWNER_ACTIONS);
  assert.equal(values.length, 4);
  assert.equal(new Set(values).size, 4);
});

test('OWNER_ACTIONS values are lowercase snake_case strings', () => {
  for (const value of Object.values(OWNER_ACTIONS)) {
    assert.match(value, /^[a-z]+(?:_[a-z]+)*$/);
  }
});
