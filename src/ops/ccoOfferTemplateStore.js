'use strict';

const { HAIR_TP_COOLING_OFF_DAYS } = require('./ccoHairTpCoolingOffPolicy');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const COOLING = HAIR_TP_COOLING_OFF_DAYS;

const OFFER_TEMPLATES = Object.freeze([
  {
    key: 'fue-standard',
    label: 'FUE — standard',
    wordFileHint: 'Offert_FUE_standard.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser hårtransplantation med FUE enligt överenskommen behandlingsplan. Priset inkluderar operation enligt angiven graft- och zonomfattning.',
  },
  {
    key: 'fue-premium',
    label: 'FUE — premium',
    wordFileHint: 'Offert_FUE_premium.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser premium FUE med utökad uppföljning enligt behandlingsplanen. Eventuella tillägg utanför planen offereras separat.',
  },
  {
    key: 'dhi-standard',
    label: 'DHI — standard',
    wordFileHint: 'Offert_DHI_standard.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser hårtransplantation med DHI enligt markerade zoner i behandlingsplanen.',
  },
  {
    key: 'dhi-premium',
    label: 'DHI — premium',
    wordFileHint: 'Offert_DHI_premium.docx',
    coolingOffDays: COOLING,
    agreementText: 'Offerten avser premium DHI med plan enligt konsultation och markerade zoner.',
  },
  {
    key: 'prp-single',
    label: 'PRP — enstaka',
    wordFileHint: 'Offert_PRP_enstaka.docx',
    coolingOffDays: COOLING,
    agreementText: 'Offerten avser en PRP-behandling enligt klinikens behandlingsplan.',
  },
  {
    key: 'prp-package',
    label: 'PRP — paket',
    wordFileHint: 'Offert_PRP_paket.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser PRP-paket enligt överenskommen behandlingsplan och antal tillfällen.',
  },
  {
    key: 'combo-fue-prp',
    label: 'Kombination FUE + PRP',
    wordFileHint: 'Offert_FUE_PRP.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser kombinerad FUE och PRP enligt behandlingsplan, inklusive markerade zoner och graft-omfattning.',
  },
  {
    key: 'combo-dhi-prp',
    label: 'Kombination DHI + PRP',
    wordFileHint: 'Offert_DHI_PRP.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser kombinerad DHI och PRP enligt behandlingsplan och markerade zoner.',
  },
  {
    key: 'revision',
    label: 'Revisionsbehandling',
    wordFileHint: 'Offert_revision.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser revisionsbehandling enligt konsultation och markerad omfattning i behandlingsplanen.',
  },
  {
    key: 'beard-transplant',
    label: 'Skäggtransplantation',
    wordFileHint: 'Offert_skagg.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser skäggtransplantation enligt markerade zoner i behandlingsplanen.',
  },
  {
    key: 'eyebrow-transplant',
    label: 'Ögonbrynstransplantation',
    wordFileHint: 'Offert_ogonbryn.docx',
    coolingOffDays: COOLING,
    agreementText: 'Offerten avser ögonbrynstransplantation enligt behandlingsplanen.',
  },
  {
    key: 'maintenance',
    label: 'Underhåll / uppföljning',
    wordFileHint: 'Offert_underhall.docx',
    coolingOffDays: COOLING,
    agreementText: 'Offerten avser underhålls- eller uppföljningsbehandling enligt plan.',
  },
  {
    key: 'consultation-only',
    label: 'Konsultation',
    wordFileHint: 'Offert_konsultation.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser konsultation och planeringsunderlag. Behandlingsbeslut fattas efter godkänd plan.',
  },
  {
    key: 'custom',
    label: 'Anpassad offert',
    wordFileHint: 'Offert_anpassad.docx',
    coolingOffDays: COOLING,
    agreementText:
      'Offerten avser behandling enligt bifogad behandlingsplan, inklusive markerade zoner och avtalad omfattning.',
  },
]);

function listOfferTemplates() {
  return OFFER_TEMPLATES.map((template) => ({
    key: template.key,
    label: template.label,
    wordFileHint: template.wordFileHint,
    coolingOffDays: template.coolingOffDays,
  }));
}

function getOfferTemplate(templateKey) {
  const key = normalizeText(templateKey);
  return (
    OFFER_TEMPLATES.find((item) => item.key === key) ||
    OFFER_TEMPLATES.find((item) => item.key === 'custom')
  );
}

function resolveTemplateKeyFromPlan(planSnapshot = {}, requestedKey = '') {
  const explicit = normalizeText(requestedKey);
  if (explicit && getOfferTemplate(explicit).key === explicit) {
    return explicit;
  }
  const method = normalizeText(planSnapshot?.fields?.method).toLowerCase();
  const zones = Array.isArray(planSnapshot?.fields?.zones) ? planSnapshot.fields.zones : [];
  const prp = planSnapshot?.fields?.prpIncluded === true;
  if (method.includes('dhi') && prp) return 'combo-dhi-prp';
  if (method.includes('fue') && prp) return 'combo-fue-prp';
  if (method.includes('dhi')) return zones.length > 1 ? 'dhi-premium' : 'dhi-standard';
  if (method.includes('fue')) return zones.length > 1 ? 'fue-premium' : 'fue-standard';
  if (method.includes('prp')) return 'prp-single';
  return 'custom';
}

module.exports = {
  OFFER_TEMPLATES,
  listOfferTemplates,
  getOfferTemplate,
  resolveTemplateKeyFromPlan,
};
