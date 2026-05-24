'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const TREATMENT_LABELS_SV = Object.freeze({
  'consultation-online': 'onlinekonsultation',
  'consultation-physical': 'fysiska konsultation',
  'followup-transplant': 'uppföljning efter hårtransplantation',
  'hair-transplant': 'hårtransplantation',
  transplant: 'hårtransplantation',
  prp: 'PRP-behandling',
  'prp-treatment': 'PRP-behandling',
});

const TREATMENT_LABELS_EN = Object.freeze({
  'consultation-online': 'online consultation',
  'consultation-physical': 'in-clinic consultation',
  'followup-transplant': 'hair transplant follow-up',
  'hair-transplant': 'hair transplant',
  transplant: 'hair transplant',
  prp: 'PRP treatment',
  'prp-treatment': 'PRP treatment',
});

function formatTreatmentLabel(raw, locale = 'sv') {
  const key = normalizeText(raw).toLowerCase();
  const map = locale === 'en' ? TREATMENT_LABELS_EN : TREATMENT_LABELS_SV;
  if (key && map[key]) return map[key];
  if (key) {
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return locale === 'en' ? 'treatment' : 'behandling';
}

module.exports = {
  formatTreatmentLabel,
  TREATMENT_LABELS_SV,
  TREATMENT_LABELS_EN,
};
