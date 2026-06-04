'use strict';

/**
 * assetDisplayLabel — mänskligt visningsnamn för patientkort/tidslinje.
 * Tekniska filnamn (IMG_*, DSC*) visas aldrig som huvudnamn om displayName finns.
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function looksTechnicalName(name) {
  const n = normalizeText(name);
  if (!n) return true;
  return /^IMG[_\-\d]/i.test(n) || /^DSC/i.test(n) || /^[A-F0-9-]{36}$/i.test(n);
}

/**
 * @param {object} asset
 * @param {{ fallback?: string }} [opts]
 */
function assetDisplayLabel(asset = {}, opts = {}) {
  const human = normalizeText(asset.displayName);
  if (human && asset.namingStatus === 'manual_resolved') return human;
  if (human && !looksTechnicalName(human)) return human;

  const docTitle = normalizeText(asset.documentTitle);
  const visit = normalizeText(asset.visitLabel);
  if (visit && docTitle) return `${visit} · ${docTitle}`;
  if (docTitle) return docTitle;
  if (visit) return visit;

  const fallback = normalizeText(opts.fallback);
  if (fallback) return fallback;

  return 'Importerat dokument';
}

module.exports = { assetDisplayLabel, looksTechnicalName };
