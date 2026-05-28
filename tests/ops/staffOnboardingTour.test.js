'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const tour = require('../../public/major-arcana-preview/app/staff-onboarding-tour.js');

test('staff onboarding tour exposes well-formed steps', () => {
  assert.ok(Array.isArray(tour.STEPS) && tour.STEPS.length >= 4);
  for (const step of tour.STEPS) {
    assert.ok(step.id, 'step has id');
    assert.ok(step.title, 'step has title');
    assert.ok(step.body, 'step has body');
    assert.ok(Object.prototype.hasOwnProperty.call(step, 'selector'), 'step declares selector (may be null)');
  }
  const ids = tour.STEPS.map((s) => s.id);
  assert.ok(ids.includes('welcome'));
  assert.ok(ids.includes('complete'));
});

test('clampStepIndex keeps the index within bounds', () => {
  assert.equal(tour.clampStepIndex(-5, 6), 0);
  assert.equal(tour.clampStepIndex(0, 6), 0);
  assert.equal(tour.clampStepIndex(3, 6), 3);
  assert.equal(tour.clampStepIndex(99, 6), 5);
  assert.equal(tour.clampStepIndex(NaN, 6), 0);
});

test('shouldAutoStart is false without a browser session (no localStorage token)', () => {
  // In Node there is no localStorage → demo/no-session → must not auto-start.
  assert.equal(tour.shouldAutoStart(), false);
});
