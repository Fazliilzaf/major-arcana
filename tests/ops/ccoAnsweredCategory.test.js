'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ANSWERED_CATEGORY_PREFIX,
  ANSWERED_CATEGORY_COLOR,
  deriveAnsweredByName,
  buildAnsweredCategory,
  isAnsweredCategory,
  markAnsweredCategoryEnabled,
} = require('../../src/ops/ccoAnsweredCategory');

test('ANSWERED_CATEGORY_COLOR is a green Graph preset', () => {
  assert.equal(ANSWERED_CATEGORY_COLOR, 'preset4');
});

test('deriveAnsweredByName prefers explicit name', () => {
  assert.equal(
    deriveAnsweredByName({ actorName: 'Egzona K', actorEmail: 'egzona@x.se' }),
    'Egzona K'
  );
});

test('deriveAnsweredByName prettifies email local-part when name missing', () => {
  assert.equal(deriveAnsweredByName({ actorEmail: 'egzona.k@hairtpclinic.com' }), 'Egzona K');
  assert.equal(deriveAnsweredByName({ actorEmail: 'fazli@hairtpclinic.com' }), 'Fazli');
});

test('deriveAnsweredByName falls back to CCO', () => {
  assert.equal(deriveAnsweredByName({}), 'CCO');
  assert.equal(deriveAnsweredByName({ actorEmail: '   ' }), 'CCO');
});

test('buildAnsweredCategory embeds prefix + who', () => {
  assert.equal(
    buildAnsweredCategory({ actorEmail: 'egzona@hairtpclinic.com' }),
    'Besvarad i CCO – Egzona'
  );
  assert.ok(buildAnsweredCategory({ actorName: 'Sara' }).startsWith(ANSWERED_CATEGORY_PREFIX));
});

test('isAnsweredCategory matches any answered tag regardless of operator', () => {
  assert.equal(isAnsweredCategory('Besvarad i CCO – Egzona'), true);
  assert.equal(isAnsweredCategory('Besvarad i CCO – Fazli'), true);
  assert.equal(isAnsweredCategory('VIP'), false);
  assert.equal(isAnsweredCategory(''), false);
});

test('markAnsweredCategoryEnabled is default off and opt-in via env', () => {
  assert.equal(markAnsweredCategoryEnabled({}), false);
  assert.equal(markAnsweredCategoryEnabled({ ARCANA_CCO_MARK_ANSWERED_CATEGORY: 'false' }), false);
  assert.equal(markAnsweredCategoryEnabled({ ARCANA_CCO_MARK_ANSWERED_CATEGORY: 'true' }), true);
  assert.equal(markAnsweredCategoryEnabled({ ARCANA_CCO_MARK_ANSWERED_CATEGORY: 'TRUE' }), true);
});
