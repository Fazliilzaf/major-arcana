#!/usr/bin/env node
/**
 * Builds browser-facing Meridiq content bundle for steg 7/8/9 preview overlays.
 * Run: npm run build:meridiq-step789-preview
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'public/major-arcana-preview/data/meridiq-step789-content.json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function findConsent(catalog, apiId) {
  return catalog.consents.find((entry) => entry.apiId === apiId) || null;
}

function findForm(catalog, apiId) {
  return catalog.forms.find((entry) => entry.apiId === apiId) || null;
}

function findDocType(catalog, id) {
  return catalog.types.find((entry) => entry.id === id) || null;
}

function deriveTextOn(question) {
  if (question.id === 450970) return 'no';
  if (question.type === 'yes_no_textbox') return 'yes';
  if (question.type === 'yes_no' && question.id === 450972) return 'yes';
  return null;
}

function normalizeQuestion(question) {
  const normalized = {
    id: question.id,
    type: question.type,
    meridiqType: question.type,
    label: question.label,
    required: question.required === true,
    sortOrder: question.sortOrder,
    options: Array.isArray(question.options) ? question.options : null,
  };
  if (question.type === 'yes_no' || question.type === 'yes_no_textbox') {
    normalized.textOn = deriveTextOn(question);
  }
  return normalized;
}

function pickConsentFields(entry) {
  if (!entry) return null;
  return {
    apiId: entry.apiId,
    title: entry.title,
    brand: entry.brand,
    version: entry.version,
    isActive: entry.isActive === true,
    letterText: entry.letterText || '',
  };
}

const consentCatalog = readJson('migration/meridiq/consent-catalog.json');
const questionaryCatalog = readJson('migration/meridiq/questionary-catalog.json');
const agreementFacit = readJson('migration/meridiq/steg7-tp-dhi-agreement-facit.json');
const docTypes = readJson('src/ops/hairtp-document-types.catalog.json');

const form16413 = findForm(questionaryCatalog, 16413);
if (!form16413) {
  console.error('Missing Meridiq form apiId 16413');
  process.exit(1);
}

const fotoDoc = findDocType(docTypes, 'foto_samtycke');
if (!fotoDoc) {
  console.error('Missing hairtp document type foto_samtycke');
  process.exit(1);
}

const output = {
  generatedAt: new Date().toISOString(),
  cacheVersion: 'hairtp-step789-kundkort-v5',
  sources: {
    consentCatalog: 'migration/meridiq/consent-catalog.json',
    questionaryCatalog: 'migration/meridiq/questionary-catalog.json',
    steg7AgreementFacit: 'migration/meridiq/steg7-tp-dhi-agreement-facit.json',
    serviceBindings: 'migration/meridiq/service-bindings-catalog.json',
    documentRegistry: 'src/ops/hairtp-document-types.catalog.json',
    journeyScope: 'docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md',
  },
  steg7: {
    serviceBinding: { treatment: 'tp', consentApiId: 170917 },
    consents: {
      agreement: pickConsentFields(findConsent(consentCatalog, 170917)),
      cooling: pickConsentFields(findConsent(consentCatalog, 170955)),
    },
    agreementBlocks: agreementFacit.blocks,
    coolingBlocks: agreementFacit.cooling.blocks,
    bundleAckLabel: agreementFacit.bundleAckLabel,
  },
  steg8: {
    form: {
      apiId: form16413.apiId,
      title: form16413.title,
      brand: form16413.brand,
      arcanaJournalType: form16413.arcanaJournalType,
      questionCount: form16413.questionCount,
      questions: form16413.questions.map(normalizeQuestion),
    },
    legalIntro: {
      source: 'new',
      html: '<strong>Vad signerar du?</strong> Att du bekräftar dina svar nedan stämmer, att du varit ärlig om hälsotillstånd, mediciner och allergier, och att informationen får sparas i din patientjournal hos Hair TP Clinic i 10 år enligt journallagen.',
    },
  },
  steg9: {
    document: {
      id: fotoDoc.id,
      name: fotoDoc.name,
      number: fotoDoc.number,
      journeyStep: fotoDoc.journeyStep,
      formProvider: fotoDoc.formProvider,
    },
    scope: {
      source: 'docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md',
      summary: 'Hårlinje och krona för journalföring och behandlingsuppföljning. Aldrig ansikte.',
      bullets: [
        'Före/efter-bilder av hårlinje och krona får tas och sparas i patientjournalen.',
        'Bilder får användas internt för uppföljning — inte för marknadsföring utan separat samtycke.',
      ],
    },
    ackLabel:
      'Jag godkänner att Hair TP Clinic tar och sparar före/efter-bilder enligt scope ovan (hårlinje/krona — aldrig ansikte).',
    subtitle: 'Samma dag som för-/efterbild · scope sparas i journalen',
  },
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Wrote ${OUT_PATH} (${output.steg8.form.questions.length} steg8 questions)`);
