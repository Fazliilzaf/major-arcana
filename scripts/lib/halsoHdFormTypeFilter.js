'use strict';

const { classifyHalsoFormSubject } = require('../../src/ops/ccoHalsoHealthDeclarationParser');

function normalizeFormTypeFilter(value = '') {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (!v || v === 'all') return '';
  if (v === 'health_declaration' || v === 'hd') return 'health_declaration';
  if (v === 'fitness_certificate' || v === 'fc') return 'fitness_certificate';
  throw new Error(`Okänt form-type filter: ${value} (hd|fc|all)`);
}

function inferFormTypeFromSubject(subject = '') {
  return classifyHalsoFormSubject(subject) || 'health_declaration';
}

function inferFormTypeFromAsset(asset = {}) {
  if (asset.formType === 'fitness_certificate' || asset.formType === 'health_declaration') {
    return asset.formType;
  }
  const haystack = [asset.originalFileName, asset.originalDrivePath, asset.metadata?.subject]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/friskf[oö]rs[aä]kran|fitness.?cert|friskforsakran/.test(haystack)) {
    return 'fitness_certificate';
  }
  return inferFormTypeFromSubject(haystack);
}

function matchesFormTypeFilter(formType, filter = '') {
  if (!filter) return true;
  return formType === filter;
}

function filterMailIndexByFormType(entries = [], formTypeFilter = '') {
  if (!formTypeFilter) return entries;
  return entries.filter((entry) =>
    matchesFormTypeFilter(inferFormTypeFromSubject(entry.subject || ''), formTypeFilter)
  );
}

function filterAssetCatalogByFormType(entries = [], formTypeFilter = '') {
  if (!formTypeFilter) return entries;
  return entries.filter((entry) =>
    matchesFormTypeFilter(inferFormTypeFromAsset(entry), formTypeFilter)
  );
}

module.exports = {
  normalizeFormTypeFilter,
  inferFormTypeFromSubject,
  inferFormTypeFromAsset,
  matchesFormTypeFilter,
  filterMailIndexByFormType,
  filterAssetCatalogByFormType,
};
