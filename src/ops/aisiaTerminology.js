'use strict';

/**
 * aisiaTerminology.js — Swedish terminology adapter for Aisia DS-3 metrics/zones.
 * Original EN values stay in store; UI uses translate* helpers.
 * source: docs/strategy/AISIA-SWEDISH-TERMINOLOGY.md
 */

const METRIC_LABELS_SV = Object.freeze({
  total_hair_count: 'Hårantal',
  average_hair_diameter: 'Hårdiameter',
  fine_hair_count: 'Antal tunna hårstrån',
  medium_hair_count: 'Antal medeltjocka hårstrån',
  coarse_hair_count: 'Antal grova hårstrån',
  empty_follicle_count: 'Tomma hårsäcksenheter',
  hair_follicle_count: 'Hårsäckar',
  hair_follicle_condition: 'Påverkade/skadade hårsäckar',
  miniaturization_suspicion: 'Misstanke om miniaturisering',
  donor_density: 'Donortäthet',
  donor_quality: 'Donorkvalitet',
  recipient_zone_assessment: 'Bedömning mottagaryta',
  grease_level: 'Talgnivå / oljenivå',
  sensitivity_level: 'Känslighetsnivå',
  porphyrin_level: 'Porfyrinnivå',
  stratum_corneum_status: 'Hornlager',
  scalp_skin_type: 'Hårbottentyp',
  inflammatory_scalp: 'Inflammatorisk hårbotten',
  traumatic_scalp: 'Skadad/irriterad hårbotten',
  telangiectasia_severity: 'Ytliga blodkärl / telangiektasier',
  dandruff_type: 'Mjälltyp',
  oily_scalp: 'Fet hårbotten',
  dry_scalp: 'Torr hårbotten',
  neutral_scalp: 'Normal hårbotten',
  donor_zone: 'Donorområde',
  recipient_zone: 'Mottagaryta',
  hair_caliber: 'Hårkaliber',
  follicular_unit_density: 'Follikulär enhetstäthet',
  scalp_inflammation: 'Hårbotteninflammation',
  donor_risk: 'Donorrisk',
  recommended_graft_range: 'Rekommenderat graft-intervall',
  follow_up_comparison_needed: 'Uppföljningsjämförelse behövs',
  case_complexity_score: 'Ärendekomplexitet',
});

const ZONE_LABELS_SV = Object.freeze({
  global_front: 'Globalbild framifrån',
  global_left: 'Globalbild vänster',
  global_right: 'Globalbild höger',
  global_back: 'Globalbild bakifrån',
  donor_occipital: 'Donor occipital',
  donor_left: 'Donor vänster',
  donor_right: 'Donor höger',
  hairline_frontal: 'Hairline / frontal',
  mid_scalp: 'Mid-scalp',
  crown: 'Crown / vertex',
  problem_area: 'Problemområde',
});

const SPECTRUM_LABELS_SV = Object.freeze({
  white: 'Vitt ljus (RGB)',
  cross_polarized: 'Korspolariserat ljus',
  uv: 'UV-ljus',
});

const MAGNIFICATION_LABELS_SV = Object.freeze({
  '10x': '10× förstoring',
  '50x': '50× förstoring',
  '100x': '100× förstoring',
  '200x': '200× förstoring',
});

const SESSION_TYPE_LABELS_SV = Object.freeze({
  consultation: 'Konsultation',
  pre_op: 'Pre-op',
  post_op: 'Post-op',
  follow_up: 'Uppföljning',
});

const SESSION_STATUS_LABELS_SV = Object.freeze({
  draft: 'Utkast',
  imported: 'Importerad',
  verified: 'Verifierad',
  needs_review: 'Behöver granskning',
  rejected: 'Avvisad',
});

const PATIENT_VIEW_DISCLAIMER =
  'Resultatet används som stöd i konsultationen. Slutlig bedömning görs av klinikens personal.';

function normalizeKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function translateMetric(metricType) {
  const key = normalizeKey(metricType);
  return METRIC_LABELS_SV[key] || metricType || '—';
}

function translateZone(zone) {
  const key = normalizeKey(zone);
  return ZONE_LABELS_SV[key] || zone || '—';
}

function translateSpectrum(spectrum) {
  const key = normalizeKey(spectrum);
  return SPECTRUM_LABELS_SV[key] || spectrum || '—';
}

function translateMagnification(magnification) {
  const key = normalizeKey(magnification);
  return MAGNIFICATION_LABELS_SV[key] || magnification || '—';
}

function translateSessionType(sessionType) {
  const key = normalizeKey(sessionType);
  return SESSION_TYPE_LABELS_SV[key] || sessionType || '—';
}

function translateSessionStatus(status) {
  const key = normalizeKey(status);
  return SESSION_STATUS_LABELS_SV[key] || status || '—';
}

function localizeMetric(metric) {
  if (!metric || typeof metric !== 'object') return metric;
  return {
    ...metric,
    labelSv: translateMetric(metric.metricType),
    displaySv: metric.displaySv || translateMetric(metric.metricType),
  };
}

function localizeSessionSummary(session, metrics = []) {
  const rows = metrics.map((m) => ({
    label: translateMetric(m.metricType),
    value: m.value,
    unit: m.unit || '',
    verified: !!m.verified,
  }));
  return {
    sessionDate: session?.date || session?.createdAt,
    sessionTypeLabel: translateSessionType(session?.sessionType),
    statusLabel: translateSessionStatus(session?.status),
    metrics: rows,
    disclaimer: PATIENT_VIEW_DISCLAIMER,
  };
}

module.exports = {
  METRIC_LABELS_SV,
  ZONE_LABELS_SV,
  SPECTRUM_LABELS_SV,
  MAGNIFICATION_LABELS_SV,
  SESSION_TYPE_LABELS_SV,
  SESSION_STATUS_LABELS_SV,
  PATIENT_VIEW_DISCLAIMER,
  translateMetric,
  translateZone,
  translateSpectrum,
  translateMagnification,
  translateSessionType,
  translateSessionStatus,
  localizeMetric,
  localizeSessionSummary,
};
