'use strict';

/** B-sprint v2 — 10 signals (UX-spec V2). Dry-run only. */

const REGISTRY_VERSION = '2.0.0-b-sprint';

const RULES = Object.freeze([
  {
    id: 'customer.missing_health_declaration',
    step: 3,
    what: 'Hälsodeklaration saknas',
    why: 'Krävs inför konsultation (steg 3). Pre-info och Meridiq-länk ingår i bokningsbekräftelsen (steg 2).',
    next: 'Öppna formulärstatus / patientportal',
    risk: 'blocker',
    humanApprovalRequired: true,
    suggestedRoute: null,
    confidenceDefault: 'medium',
    v1Enabled: true,
  },
  {
    id: 'customer.missing_journal',
    step: 4,
    what: 'Journal saknas',
    why: 'Konsultation (steg 4) kräver encounter och journal.',
    next: 'Öppna journal',
    risk: 'blocker',
    humanApprovalRequired: false,
    suggestedRoute: '/journal-feed-demo.html?customerId=',
    confidenceDefault: 'high',
    v1Enabled: true,
  },
  {
    id: 'customer.missing_treatment_plan',
    step: 5,
    what: 'Behandlingsplan/offert saknas',
    why: 'Efter konsult (steg 5) — offert = behandlingsplan.',
    next: 'Skapa/skicka behandlingsplan',
    risk: 'blocker',
    humanApprovalRequired: true,
    suggestedRoute: null,
    confidenceDefault: 'low',
    v1Enabled: true,
  },
  {
    id: 'customer.cooling_off_active',
    step: 6,
    what: 'Betänketid pågår',
    why: 'Betänketid 2 dagar (steg 6). Ej bokbar för nästa steg.',
    next: 'Vänta — visa slutdatum',
    risk: 'info',
    humanApprovalRequired: false,
    suggestedRoute: null,
    confidenceDefault: 'high',
    v1Enabled: true,
  },
  {
    id: 'customer.cooling_off_passed',
    step: 6,
    what: 'Betänketid passerad',
    why: '2 dagar har gått — kan gå till avtal och samtycke (steg 7).',
    next: 'Fortsätt till avtal + behandlingssamtycke',
    risk: 'ready',
    humanApprovalRequired: false,
    suggestedRoute: null,
    confidenceDefault: 'high',
    v1Enabled: true,
  },
  {
    id: 'customer.missing_agreement_consent_bundle',
    step: 7,
    what: 'Avtal + samtycke saknas',
    why: 'Steg 7 — samma transaktion. Separata utskick är ogiltiga.',
    next: 'Legal review → bundle-signering',
    risk: 'legal_blocker',
    humanApprovalRequired: true,
    suggestedRoute: null,
    confidenceDefault: 'medium',
    v1Enabled: true,
  },
  {
    id: 'customer.missing_operation_day_insurance',
    step: 8,
    what: 'Friskförsäkran saknas',
    why: 'Operationsdagen — tablet/QR. Blockerar operationsstart.',
    next: 'Friskförsäkran på plats i kliniken',
    risk: 'blocker',
    humanApprovalRequired: false,
    suggestedRoute: null,
    confidenceDefault: 'low',
    v1Enabled: true,
  },
  {
    id: 'customer.missing_photo_consent',
    step: 9,
    what: 'Foto-samtycke saknas',
    why: 'Vid för-/efterbild — hårlinje/krona, aldrig ansikte.',
    next: 'Visa scope-prompt vid foto',
    risk: 'legal',
    humanApprovalRequired: true,
    suggestedRoute: null,
    confidenceDefault: 'low',
    v1Enabled: true,
  },
  {
    id: 'customer.has_photo_review',
    step: null,
    what: 'Bildreview väntar',
    why: 'Operatör granskar bilder — ej samma som foto-samtycke.',
    next: 'Öppna Photo Review',
    risk: 'needs_review',
    humanApprovalRequired: true,
    suggestedRoute: '/photo-review.html?focusPatientId=',
    confidenceDefault: 'high',
    v1Enabled: true,
  },
  {
    id: 'customer.ready_for_treatment',
    step: null,
    what: 'Redo för behandling',
    why: 'Komposit: betänketid OK + bundle + legal + ops-dag FF vid behov.',
    next: 'Öppna kalender / operationsflöde',
    risk: 'ready',
    humanApprovalRequired: false,
    suggestedRoute: '/kalender.html?patientId=',
    confidenceDefault: 'medium',
    v1Enabled: true,
  },
]);

function listRules() {
  return RULES.map((rule) => ({ ...rule }));
}

function getRule(ruleId) {
  const id = String(ruleId || '').trim();
  return RULES.find((rule) => rule.id === id) || null;
}

function getCatalog() {
  return {
    version: REGISTRY_VERSION,
    dryRun: true,
    ruleCount: RULES.length,
    rules: listRules(),
    enabled: isAutomationRunnerEnabled(),
  };
}

function isAutomationRunnerEnabled() {
  return String(process.env.ENABLE_AUTOMATION_RUNNER || '').toLowerCase() === 'true';
}

module.exports = {
  REGISTRY_VERSION,
  RULES,
  listRules,
  getRule,
  getCatalog,
  isAutomationRunnerEnabled,
};
