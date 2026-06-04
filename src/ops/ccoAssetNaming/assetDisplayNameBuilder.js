'use strict';

const { parseIsoDate } = require('./encounterNameResolver');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function docStatusLabel(asset = {}) {
  const st = normalizeText(asset.status).toUpperCase();
  if (
    ['journal', 'form', 'consent', 'agreement', 'cco_journal_sign'].includes(
      normalizeText(asset.category)
    )
  ) {
    if (st === 'VISIBLE_ON_PATIENT_CARD' || st === 'VERIFIED_IN_CCO') return 'signerad';
  }
  if (st === 'NEEDS_REVIEW') return 'review';
  if (st === 'REJECTED') return 'avvisad';
  if (st === 'DUPLICATE') return 'dubblett';
  if (st === 'VISIBLE_ON_PATIENT_CARD') return 'synlig';
  return null;
}

function buildJournalDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const treatment =
    normalizeText(ctx.visitLabel) ||
    normalizeText(asset.visitLabel) ||
    normalizeText(asset.treatmentType) ||
    'Behandling';
  const status = docStatusLabel(asset) || 'journal';
  return `${date} · ${treatment} · Journal · ${status}`;
}

function buildFormDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const title = normalizeText(asset.documentTitle) || 'Formulär';
  const status = docStatusLabel(asset) || 'signerad';
  return `${date} · ${title} · ${status}`;
}

function buildConsentAgreementDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const docType =
    normalizeText(asset.documentTitle) || (asset.category === 'agreement' ? 'Avtal' : 'Samtycke');
  const treatment = normalizeText(asset.treatmentType) || normalizeText(ctx.treatmentType);
  const status = docStatusLabel(asset) || 'signerad';
  const parts = [date, docType];
  if (treatment) parts.push(treatment);
  parts.push(status);
  return parts.join(' · ');
}

function buildOfferDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const treatment =
    normalizeText(asset.treatmentType) || normalizeText(ctx.treatmentType) || 'Behandling';
  const version = asset.version ? `v${asset.version}` : null;
  const state =
    normalizeText(asset.offerState || ctx.offerState) || docStatusLabel(asset) || 'utkast';
  const parts = [date, 'Offert', treatment, state];
  if (version) parts.push(version);
  return parts.join(' · ');
}

function buildTreatmentPlanDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const variant =
    normalizeText(asset.subCategory) === 'hairline_drawing'
      ? 'Hairline-ritning'
      : 'Behandlingsplan';
  const version = asset.version ? `v${asset.version}` : null;
  const parts = [date, 'Behandlingsplan', variant];
  if (version) parts.push(version);
  return parts.join(' · ');
}

function buildGenericDocumentDisplayName(asset = {}, ctx = {}) {
  const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt) || 'okänt datum';
  const title = normalizeText(asset.documentTitle) || normalizeText(asset.category) || 'Dokument';
  const status = docStatusLabel(asset);
  return status ? `${date} · ${title} · ${status}` : `${date} · ${title}`;
}

/**
 * @param {object} asset — med category/subCategory/documentTitle fyllda
 * @param {object} ctx — encounter resolver output
 */
function buildAssetDisplayName(asset = {}, ctx = {}) {
  const cat = normalizeText(asset.category);
  const sub = normalizeText(asset.subCategory);

  if (cat === 'journal' || cat === 'cco_journal_sign') {
    return {
      displayName: buildJournalDisplayName(asset, ctx),
      namingConfidence: ctx.namingConfidence || 'high',
    };
  }
  if (cat === 'form' || sub === 'health_declaration' || sub === 'fitness_certificate') {
    return {
      displayName: buildFormDisplayName(asset, ctx),
      namingConfidence: ctx.namingConfidence || 'high',
    };
  }
  if (cat === 'consent' || cat === 'agreement' || sub === 'consent' || sub === 'agreement') {
    return {
      displayName: buildConsentAgreementDisplayName(asset, ctx),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (cat === 'offer' || sub === 'offer') {
    return {
      displayName: buildOfferDisplayName(asset, ctx),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (sub === 'treatment_plan' || /behandlingsplan|ritning/i.test(asset.originalFileName || '')) {
    return {
      displayName: buildTreatmentPlanDisplayName(asset, ctx),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (sub === 'aftercare') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: `${date} · Eftervård · ${docStatusLabel(asset) || 'dokument'}`,
      namingConfidence: 'medium',
    };
  }
  if (sub === 'follow_up') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: `${date} · Uppföljning · ${docStatusLabel(asset) || 'dokument'}`,
      namingConfidence: 'medium',
    };
  }
  if (cat === 'aisia_report') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: `${date} · Aisia · Rapport · ${docStatusLabel(asset) || 'importerad'}`,
      namingConfidence: 'high',
    };
  }

  return {
    displayName: buildGenericDocumentDisplayName(asset, ctx),
    namingConfidence: ctx.namingConfidence || 'low',
  };
}

module.exports = {
  buildAssetDisplayName,
  buildJournalDisplayName,
  buildFormDisplayName,
  buildConsentAgreementDisplayName,
  buildOfferDisplayName,
  buildTreatmentPlanDisplayName,
  docStatusLabel,
};
