const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEMPLATE_CATEGORIES,
  normalizeCategory,
  isValidCategory,
} = require('../../src/templates/constants');

test('normalizeCategory uppercases trimmed string', () => {
  assert.equal(normalizeCategory('  booking  '), 'BOOKING');
  assert.equal(normalizeCategory(null), '');
});

test('normalizeCategory returns empty for icke-sträng', () => {
  assert.equal(normalizeCategory(undefined), '');
  assert.equal(normalizeCategory(42), '');
  assert.equal(normalizeCategory(''), '');
});

test('isValidCategory accepts only known template categories', () => {
  assert.equal(isValidCategory('BOOKING'), true);
  assert.equal(isValidCategory('booking'), true);
  assert.equal(isValidCategory('UNKNOWN'), false);
});

test('isValidCategory trimmar och avvisar tom eller okänd kategori', () => {
  assert.equal(isValidCategory('  AFTERCARE '), true);
  assert.equal(isValidCategory(''), false);
  assert.equal(isValidCategory('   '), false);
  assert.equal(isValidCategory('RETENTION'), false);
});

test('TEMPLATE_CATEGORIES is frozen and includes core buckets', () => {
  assert.throws(() => {
    TEMPLATE_CATEGORIES.push('X');
  });
  assert.ok(TEMPLATE_CATEGORIES.includes('INTERNAL'));
  assert.ok(TEMPLATE_CATEGORIES.includes('CONSULTATION'));
});

test('TEMPLATE_CATEGORIES har exakt fem unika poster', () => {
  assert.equal(TEMPLATE_CATEGORIES.length, 5);
  assert.equal(new Set(TEMPLATE_CATEGORIES).size, 5);
});

test('normalizeCategory hanterar tabs/newlines runt värdet', () => {
  assert.equal(normalizeCategory('\n\t lead \t\n'), 'LEAD');
  assert.equal(normalizeCategory(' internal\r\n'), 'INTERNAL');
});

test('normalizeCategory blandad versaler/gemener blir enhetligt versaler', () => {
  assert.equal(normalizeCategory('CoNsUlTaTiOn'), 'CONSULTATION');
});

test('TEMPLATE_CATEGORIES och isValidCategory är konsistenta', () => {
  for (const cat of TEMPLATE_CATEGORIES) {
    assert.equal(isValidCategory(cat), true);
    assert.equal(normalizeCategory(cat), cat);
  }
});

test('isValidCategory avvisar nästan-korrekta värden', () => {
  assert.equal(isValidCategory('BOOKING!'), false);
  assert.equal(isValidCategory('CONSULTATIONS'), false);
  assert.equal(isValidCategory('AFTER CARE'), false);
});

test('isValidCategory returnerar false for icke-sträng', () => {
  assert.equal(isValidCategory(null), false);
  assert.equal(isValidCategory(undefined), false);
  assert.equal(isValidCategory(123), false);
});
