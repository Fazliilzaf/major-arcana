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

function applyJourneyStep(displayName, journeyStep) {
  const step = normalizeText(journeyStep);
  if (!step || !displayName) return displayName;
  return `Steg ${step} · ${displayName}`;
}

/**
 * @param {object} asset — med category/subCategory/documentTitle fyllda
 * @param {object} ctx — encounter resolver output
 */
function buildAssetDisplayName(asset = {}, ctx = {}) {
  const cat = normalizeText(asset.category);
  const sub = normalizeText(asset.subCategory);
  const journeyStep = normalizeText(ctx.journeyStep || asset.journeyStep);

  if (cat === 'journal' || cat === 'cco_journal_sign') {
    return {
      displayName: applyJourneyStep(buildJournalDisplayName(asset, ctx), journeyStep),
      namingConfidence: ctx.namingConfidence || 'high',
    };
  }
  if (cat === 'form' || sub === 'health_declaration' || sub === 'fitness_certificate') {
    return {
      displayName: applyJourneyStep(buildFormDisplayName(asset, ctx), journeyStep),
      namingConfidence: ctx.namingConfidence || 'high',
    };
  }
  if (cat === 'consent' || cat === 'agreement' || sub === 'consent' || sub === 'agreement') {
    return {
      displayName: applyJourneyStep(buildConsentAgreementDisplayName(asset, ctx), journeyStep),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (cat === 'offer' || sub === 'offer') {
    return {
      displayName: applyJourneyStep(buildOfferDisplayName(asset, ctx), journeyStep),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (sub === 'treatment_plan' || /behandlingsplan|ritning/i.test(asset.originalFileName || '')) {
    return {
      displayName: applyJourneyStep(buildTreatmentPlanDisplayName(asset, ctx), journeyStep),
      namingConfidence: ctx.namingConfidence || 'medium',
    };
  }
  if (sub === 'aftercare') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: applyJourneyStep(
        `${date} · Eftervård · ${docStatusLabel(asset) || 'dokument'}`,
        journeyStep
      ),
      namingConfidence: 'medium',
    };
  }
  if (sub === 'follow_up') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: applyJourneyStep(
        `${date} · Uppföljning · ${docStatusLabel(asset) || 'dokument'}`,
        journeyStep
      ),
      namingConfidence: 'medium',
    };
  }
  if (cat === 'aisia_report') {
    const date = parseIsoDate(asset.documentDate) || 'okänt datum';
    return {
      displayName: applyJourneyStep(
        `${date} · Aisia · Rapport · ${docStatusLabel(asset) || 'importerad'}`,
        journeyStep
      ),
      namingConfidence: 'high',
    };
  }

  return {
    displayName: applyJourneyStep(buildGenericDocumentDisplayName(asset, ctx), journeyStep),
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
