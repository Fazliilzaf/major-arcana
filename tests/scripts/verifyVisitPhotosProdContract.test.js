'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '../../scripts/verify-visit-photos-prod.js'),
  'utf8'
);

test('visit-photo visual verify suppresses onboarding before capture', () => {
  assert.match(source, /localStorage\.setItem\('cco\.onboardingTour\.v1', 'done'\)/);
  assert.match(source, /await waitForDetail\([\s\S]*await dismissTour\(page\)/);
  assert.match(source, /page\.locator\('\[data-v11-rk-besok\]'\)/);
});
