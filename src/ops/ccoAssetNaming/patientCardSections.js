'use strict';

/**
 * patientCardSections — mappa assets till patientkort-sektioner.
 * Ingen Drive-länk; sektion = UI-gruppering på kundkortet.
 */

const { classifyDocument } = require('./documentClassifier');

/** @typedef {'journaler'|'formular'|'bilder'|'ritningar'|'behandlingsplan'|'offert'|'samtycken_avtal'|'eftervard'|'uppfoljning'|'kommunikation'|'tidslinje'|'ovrigt'|'needs_review'} PatientCardSection */

const SECTION_META = Object.freeze({
  journaler: { id: 'journaler', label: 'Journaler', tabId: 'journal' },
  formular: { id: 'formular', label: 'Formulär', tabId: 'form' },
  bilder: { id: 'bilder', label: 'Bilder', tabId: 'photo' },
  ritningar: { id: 'ritningar', label: 'Ritningar', tabId: 'drawing' },
  behandlingsplan: { id: 'behandlingsplan', label: 'Behandlingsplan', tabId: 'plan' },
  offert: { id: 'offert', label: 'Offert', tabId: 'offer' },
  samtycken_avtal: { id: 'samtycken_avtal', label: 'Samtycken/avtal', tabId: 'consent' },
  eftervard: { id: 'eftervard', label: 'Eftervård', tabId: 'aftercare' },
  uppfoljning: { id: 'uppfoljning', label: 'Uppföljning', tabId: 'followup' },
  kommunikation: { id: 'kommunikation', label: 'Kommunikation', tabId: 'comms' },
  tidslinje: { id: 'tidslinje', label: 'Tidslinje', tabId: 'timeline' },
  ovrigt: { id: 'ovrigt', label: 'Övrigt', tabId: 'other' },
  needs_review: { id: 'needs_review', label: 'Behöver granskning', tabId: 'review' },
});

const PHOTO_CATEGORIES = new Set(['photo_before', 'photo_during', 'photo_after']);

const SUBCATEGORY_SECTION = Object.freeze({
  journal: 'journaler',
  health_declaration: 'formular',
  fitness_certificate: 'formular',
  consent: 'samtycken_avtal',
  treatment_consent: 'samtycken_avtal',
  agreement: 'samtycken_avtal',
  offer: 'offert',
  treatment_plan: 'behandlingsplan',
  aftercare: 'eftervard',
  follow_up: 'uppfoljning',
  aisia_report: 'ritningar',
  form: 'formular',
});

const CATEGORY_SECTION = Object.freeze({
  journal: 'journaler',
  cco_journal_sign: 'journaler',
  form: 'formular',
  consent: 'samtycken_avtal',
  agreement: 'samtycken_avtal',
  photo_before: 'bilder',
  photo_during: 'bilder',
  photo_after: 'bilder',
  aisia_report: 'ritningar',
  offer: 'offert',
  other: 'ovrigt',
});

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function isDrawingAsset(asset = {}, classification = {}) {
  const hay = `${asset.originalFileName || ''} ${asset.originalDrivePath || ''}`.toLowerCase();
  if (/ritning|hairline|skiss|drawing|planritning/i.test(hay)) return true;
  if (classification.subCategory === 'treatment_plan' && /ritning|hairline/i.test(hay)) return true;
  return false;
}

/**
 * @param {object} asset
 * @param {{ classification?: object }} [ctx]
 * @returns {{ section: PatientCardSection, sectionLabel: string, tabId: string, confidence: string, signals: string[] }}
 */
function resolvePatientCardSection(asset = {}, ctx = {}) {
  const signals = [];
  const classification = ctx.classification || classifyDocument(asset);
  const cat = normalizeText(asset.category);
  const sub = normalizeText(classification.subCategory || asset.subCategory);
  const status = normalizeText(asset.status).toUpperCase();

  if (status === 'NEEDS_REVIEW' || status === 'LINK_ONLY_BLOCKER') {
    signals.push('status_needs_review');
    const meta = SECTION_META.needs_review;
    return {
      section: 'needs_review',
      sectionLabel: meta.label,
      tabId: meta.tabId,
      confidence: 'high',
      signals,
    };
  }

  if (asset.namingStatus === 'needs_review_for_naming' && PHOTO_CATEGORIES.has(cat)) {
    signals.push('naming_needs_review');
  }

  if (isDrawingAsset(asset, classification)) {
    signals.push('drawing_hint');
    const meta = SECTION_META.ritningar;
    return {
      section: 'ritningar',
      sectionLabel: meta.label,
      tabId: meta.tabId,
      confidence: 'medium',
      signals,
    };
  }

  if (sub && SUBCATEGORY_SECTION[sub]) {
    signals.push(`subCategory:${sub}`);
    const section = SUBCATEGORY_SECTION[sub];
    const meta = SECTION_META[section];
    return {
      section,
      sectionLabel: meta.label,
      tabId: meta.tabId,
      confidence: classification.confidence || 'medium',
      signals,
    };
  }

  if (cat && CATEGORY_SECTION[cat]) {
    signals.push(`category:${cat}`);
    const section = CATEGORY_SECTION[cat];
    const meta = SECTION_META[section];
    return {
      section,
      sectionLabel: meta.label,
      tabId: meta.tabId,
      confidence: classification.confidence || 'medium',
      signals,
    };
  }

  if (classification.confidence === 'low' || !cat) {
    signals.push('fallback_needs_review');
    const meta = SECTION_META.needs_review;
    return {
      section: 'needs_review',
      sectionLabel: meta.label,
      tabId: meta.tabId,
      confidence: 'low',
      signals,
    };
  }

  signals.push('fallback_ovrigt');
  const meta = SECTION_META.ovrigt;
  return {
    section: 'ovrigt',
    sectionLabel: meta.label,
    tabId: meta.tabId,
    confidence: 'low',
    signals,
  };
}

function listPatientCardSections() {
  return Object.values(SECTION_META).filter((s) => s.id !== 'needs_review' && s.id !== 'tidslinje');
}

module.exports = {
  SECTION_META,
  SUBCATEGORY_SECTION,
  CATEGORY_SECTION,
  resolvePatientCardSection,
  listPatientCardSections,
};
