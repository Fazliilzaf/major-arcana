'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const previewDir = path.join(__dirname, '../../public/major-arcana-preview');
const svPath = path.join(previewDir, 'steg3-halsodeklaration-final-demo.html');
const enPath = path.join(previewDir, 'steg3-health-questionnaire-eng-final-demo.html');

function questionIds(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  return [...html.matchAll(/class="section-block question-block" data-meridiq-id="([^"]+)"/g)].map(
    (match) => match[1]
  );
}

test('english health questionnaire mirrors the Swedish canonical question set', () => {
  const svIds = questionIds(svPath);
  const enIds = questionIds(enPath);

  assert.equal(svIds.length, 14);
  assert.deepEqual(enIds, svIds);
});

test('english health questionnaire no longer uses the old 29-question archive form', () => {
  const html = fs.readFileSync(enPath, 'utf8');

  assert.match(html, /English mirror of the Swedish Hair TP Clinic health declaration · 14 questions/);
  assert.doesNotMatch(html, /archive form 14865/);
  assert.doesNotMatch(html, /Health questionnaire · 29 questions/);
});
