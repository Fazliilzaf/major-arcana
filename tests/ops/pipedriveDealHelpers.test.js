'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePipedriveDealStatus,
  isPipedriveDealWon,
  parseDealValue,
  maxIsoDate,
} = require('../../src/ops/pipedriveDealHelpers');

describe('pipedriveDealHelpers', () => {
  it('normalizes Swedish won status', () => {
    assert.equal(normalizePipedriveDealStatus('Vunnen'), 'won');
    assert.equal(normalizePipedriveDealStatus('won'), 'won');
  });

  it('detects won deal via status or wonAt', () => {
    assert.equal(isPipedriveDealWon({ status: 'Vunnen', value: '30 000' }), true);
    assert.equal(isPipedriveDealWon({ status: 'open', wonAt: '2024-01-01T10:00:00.000Z' }), true);
    assert.equal(isPipedriveDealWon({ status: 'Öppen', value: '10 000' }), false);
  });

  it('parses deal values with spaces and currency', () => {
    assert.equal(parseDealValue('30 000'), 30000);
    assert.equal(parseDealValue('12 500 kr'), 12500);
  });

  it('maxIsoDate picks latest', () => {
    assert.equal(
      maxIsoDate('2024-01-01T10:00:00.000Z', '2025-06-01T10:00:00.000Z'),
      '2025-06-01T10:00:00.000Z'
    );
  });
});
