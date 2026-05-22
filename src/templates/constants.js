const TEMPLATE_CATEGORIES = Object.freeze([
  'BOOKING',
  'CONSULTATION',
  'AFTERCARE',
  'LEAD',
  'INTERNAL',
]);

function normalizeCategory(category) {
  if (typeof category !== 'string') return '';
  return category.trim().toUpperCase();
}

function isValidCategory(category) {
  return TEMPLATE_CATEGORIES.includes(normalizeCategory(category));
}

module.exports = {
  TEMPLATE_CATEGORIES,
  normalizeCategory,
  isValidCategory,
};
