#!/usr/bin/env node
/**
 * Builds full Hair TP document content bundle (36-doc list + supplementary consents).
 * Run: npm run build:hairtp-document-content
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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

function pickConsentFields(entry) {
  if (!entry) return null;
  return {
    apiId: entry.apiId,
    title: entry.title,
    brand: entry.brand,
    version: entry.version,
    isActive: entry.isActive === true,
    letterText: entry.letterText || '',
    letterTextLength: (entry.letterText || '').length,
    publishBeforeAfterPhotos: entry.publishBeforeAfterPhotos === true,
  };
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

function pickFormFields(form) {
  if (!form) return null;
  return {
    apiId: form.apiId,
    title: form.title,
    brand: form.brand,
    isActive: form.isActive === true,
    version: form.version,
    arcanaJournalType: form.arcanaJournalType || null,
    questionCount: form.questionCount,
    questions: (form.questions || []).map(normalizeQuestion),
  };
}

function contentStatusForConsent(consent, hasFacitBlocks) {
  if (!consent) return 'MISSING';
  const len = (consent.letterText || '').length;
  if (len > 80) return 'FULL';
  if (hasFacitBlocks) return 'FULL';
  if (consent.apiId) return 'PARTIAL';
  return 'MISSING';
}

function contentStatusForForm(form) {
  if (!form) return 'MISSING';
  if ((form.questions || []).length > 0) return form.isActive === false ? 'PARTIAL' : 'FULL';
  return 'PARTIAL';
}

function buildEmailSample(buildFn, input) {
  try {
    const result = buildFn(input);
    return {
      subject: result.subject || '',
      text: result.text || '',
      htmlLength: (result.html || '').length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

const consentCatalog = readJson('migration/meridiq/consent-catalog.json');
const questionaryCatalog = readJson('migration/meridiq/questionary-catalog.json');
const agreementFacit = readJson('migration/meridiq/steg7-tp-dhi-agreement-facit.json');
const docTypes = readJson('src/ops/hairtp-document-types.catalog.json');
const journalTextTemplates = readJson('migration/journal-text-templates.json');
const pupMarkdown = readText('docs/legal/personuppgiftspolicy-pub-maj-arcana.md');

const { buildBookingConfirmationEmail } = require('../src/templates/bookingConfirmationEmail');
const { buildBookingReminderEmail } = require('../src/templates/bookingReminderEmail');
const { buildBookingCancellationEmail } = require('../src/templates/bookingCancellationEmail');
const { buildOfferEmail } = require('../src/templates/offerEmail');
const { buildOutreachMessage } = require('../src/ops/ccoPatientOutreach');
const { getMedicalFinanceInfo } = require('../src/ops/ccoPatientPaymentPrepare');

const demoSlot = '2026-06-15T09:00:00+02:00';
const emailDemo = {
  customerName: 'Anna Testsson',
  slotStart: demoSlot,
  serviceLabel: 'Hårtransplantation — konsultation',
  resourceLabel: 'Dr. Behandlare',
  locale: 'sv',
};

function buildConsentDoc(registryId, label, consentApiId, options = {}) {
  const registry = findDocType(docTypes, registryId);
  const consent = consentApiId ? findConsent(consentCatalog, consentApiId) : null;
  const facitBlocks =
    options.facitBlocks ||
    (consentApiId === 170917 ? agreementFacit.blocks : null) ||
    (consentApiId === 170955 ? agreementFacit.cooling.blocks : null);
  const status = contentStatusForConsent(
    consent,
    Array.isArray(facitBlocks) && facitBlocks.length > 0
  );
  const blockers = [];
  if (status === 'PARTIAL' && !facitBlocks) {
    blockers.push('NEEDS_FACIT: letterText tom i Meridiq-export');
  }
  if (options.versionConflict) blockers.push(options.versionConflict);
  return {
    registryId,
    label: label || registry?.name || consent?.title,
    filler: 'patient',
    contentStatus: status,
    blockers,
    sources: [
      consentApiId ? `migration/meridiq/consent-catalog.json#${consentApiId}` : null,
      facitBlocks ? 'migration/meridiq/steg7-tp-dhi-agreement-facit.json' : null,
      registry ? 'src/ops/hairtp-document-types.catalog.json' : null,
    ].filter(Boolean),
    meridiq: consent ? pickConsentFields(consent) : { consentApiId },
    content: {
      letterText: consent?.letterText || '',
      agreementBlocks: facitBlocks || null,
      bundleAckLabel: consentApiId === 170917 ? agreementFacit.bundleAckLabel : null,
    },
  };
}

function buildFormDoc(registryId, formApiId, options = {}) {
  const registry = findDocType(docTypes, registryId);
  const form = findForm(questionaryCatalog, formApiId);
  const status = options.forceStatus || contentStatusForForm(form);
  const blockers = [];
  if (form && form.isActive === false) {
    blockers.push('Meridiq isActive=false — arkivtext finns men ej aktiv i G4');
  }
  if (!form) blockers.push('Form saknas i questionary-catalog');
  return {
    registryId,
    label: form?.title || registry?.name,
    filler: options.filler || registry?.filler || 'patient',
    contentStatus: status,
    blockers,
    sources: [
      `migration/meridiq/questionary-catalog.json#${formApiId}`,
      'src/ops/hairtp-document-types.catalog.json',
    ],
    meridiq: form
      ? {
          questionaryApiId: form.apiId,
          ...pickFormFields(form),
        }
      : { questionaryApiId: formApiId },
  };
}

const customerFilled = [
  buildFormDoc('haelso_tp_sve', 16414),
  buildFormDoc('health_tp_eng', 14865),
  buildFormDoc('friskfoers_tp', 16413),
  buildConsentDoc('offert_tp', 'Behandlingsavtal / offert | TP', 170917),
  buildConsentDoc('offert_prp_hair', 'Behandlingsavtal / offert | PRP hår', 170945),
  buildConsentDoc('offert_prp_skin', 'Behandlingsavtal / offert | PRP hud', 170944),
  buildConsentDoc(
    'offert_microneedling',
    'Behandlingsavtal / offert | Microneedling och PRP',
    170946
  ),
  buildConsentDoc('offert_prf', 'Behandlingsavtal / offert | PRF hud', 170947),
  buildConsentDoc('offert_profilo', 'Behandlingsavtal / offert | Profhilo', 170948),
  buildConsentDoc('samtycke_bokning_2d', 'Samtycke vid bokning inom 2 dagar', 154369, {
    versionConflict: 'VERSION_CONFLICT: registry=2 dagar, Meridiq-titel=14 dagar (apiId 154369)',
  }),
  buildConsentDoc(
    'samtycke_angerratt',
    'Begäran och samtycke till behandling under ångerfristen (14 dagar)',
    170955
  ),
  buildConsentDoc('prp_hair_info_sve', 'PRP hår – Platelet Rich Plasma (SWE)', 152994),
  buildConsentDoc('prp_hair_info_eng', 'PRP – Platelet Rich Plasma (ENG)', 152987),
  {
    registryId: 'microneedling_info',
    label: 'Microneedling (SWE / ENG)',
    filler: 'patient',
    contentStatus: 'FULL',
    blockers: [],
    sources: [
      'migration/meridiq/consent-catalog.json#152998',
      'migration/meridiq/consent-catalog.json#152997',
    ],
    meridiq: {
      swe: pickConsentFields(findConsent(consentCatalog, 152998)),
      eng: pickConsentFields(findConsent(consentCatalog, 152997)),
    },
    content: {
      letterTextSwe: findConsent(consentCatalog, 152998)?.letterText || '',
      letterTextEng: findConsent(consentCatalog, 152997)?.letterText || '',
    },
  },
  buildConsentDoc(null, 'Hyalase (SWE)', 152991),
  {
    registryId: 'botulinum_info',
    label: 'Botulinumtoxin (SWE / ENG)',
    filler: 'patient',
    contentStatus: 'FULL',
    blockers: ['Ej i 36-doc registry — supplementary consent vid Hair TP-användning'],
    sources: [
      'migration/meridiq/consent-catalog.json#152988',
      'migration/meridiq/consent-catalog.json#152981',
    ],
    meridiq: {
      swe: pickConsentFields(findConsent(consentCatalog, 152988)),
      eng: pickConsentFields(findConsent(consentCatalog, 152981)),
    },
    content: {
      letterTextSwe: findConsent(consentCatalog, 152988)?.letterText || '',
      letterTextEng: findConsent(consentCatalog, 152981)?.letterText || '',
    },
  },
  {
    registryId: 'foto_samtycke',
    label: 'Samtycke till foto-publicering (vid signering i Hair TP)',
    filler: 'patient',
    contentStatus: 'PARTIAL',
    blockers: ['NEEDS_FACIT: saknar consent-catalog-post — journey-scope finns i steg 9'],
    sources: [
      'docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md',
      'src/ops/hairtp-document-types.catalog.json#foto_samtycke',
    ],
    meridiq: { consentApiId: null },
    content: {
      scope: {
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
  },
];

const staffFilled = [
  buildFormDoc('journal_tp', 16411, { filler: 'staff' }),
  buildFormDoc('journal_tp_post_prp', 16412, { filler: 'staff' }),
  buildFormDoc('journal_tp_follow_4', 16407, { filler: 'staff' }),
  buildFormDoc('journal_tp_follow_6', 16409, { filler: 'staff' }),
  buildFormDoc('journal_tp_follow_12', 16390, { filler: 'staff' }),
  buildFormDoc('journal_prp_multi', 14988, { filler: 'staff' }),
  {
    registryId: 'behandlingsplan_staff',
    label: 'Behandlingsplan / offert (skapas av personal)',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Manual — ingen fast Meridiq-text; genereras per patient/offert'],
    sources: ['src/ops/hairtp-document-types.catalog.json', 'MA-Archive/offert-word/ (ej i repo)'],
    content: { note: 'Skapas av personal; PDF/offert bifogas vid utskick (offerEmail)' },
  },
  {
    registryId: 'konsultationsmall',
    label: 'Konsultationsmall | Hair TP Clinic',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Stub-text — full Word-mall i SharePoint enligt SHAREPOINT-TEMPLATE-INVENTORY'],
    sources: ['migration/journal-text-templates.json#consultation-summary'],
    content: {
      templateId: 'consultation-summary',
      text: journalTextTemplates.templates.find((t) => t.id === 'consultation-summary')?.text || '',
    },
  },
  {
    registryId: 'ordination_tp',
    label: 'Ordinationsmall | Hårtransplantation',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Stub-text — SharePoint: NY Ordination – Lokalbedövning vid hår-.docx'],
    sources: [
      'migration/journal-text-templates.json#prescription-standard',
      'docs/strategy/SHAREPOINT-TEMPLATE-INVENTORY.md',
    ],
    content: {
      templateId: 'prescription-standard',
      text:
        journalTextTemplates.templates.find((t) => t.id === 'prescription-standard')?.text || '',
    },
  },
  {
    registryId: 'ordination_recept',
    label: 'Ordination (recept)',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Ingen Meridiq questionary — recept/ordination via manuell mall eller e-recept'],
    sources: ['docs/strategy/MERIDIQ-INVENTORY.md#Ordinationer'],
    content: {
      note: 'Samma stub som ordinationsmall tills SharePoint/e-recept kopplas',
      text:
        journalTextTemplates.templates.find((t) => t.id === 'prescription-standard')?.text || '',
    },
  },
  {
    registryId: 'anteckningar_kort',
    label: 'Anteckningar på patientkort',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Fri text — ingen fast mall i arkiv'],
    sources: ['src/ops/hairtp-document-types.catalog.json'],
    content: { note: 'Fri textfält i CCO patientkort' },
  },
  {
    registryId: 'id_verifiering',
    label: 'ID-verifiering (pass/körkort/legitimation)',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Process — ej formulärtext; audit via ccoIdVerificationStore'],
    sources: [
      'src/ops/ccoIdVerificationStore.js',
      'docs/strategy/COMMUNICATION-TEMPLATE-REGISTRY.md#ID-verifiering',
    ],
    content: {
      method: 'staff_confirm_4_last_digits',
      note: 'Personal verifierar legitimation vid ankomst; loggas som audit-event',
    },
  },
];

const information = [
  {
    registryId: 'info_offert_tp',
    label: 'Offert & Behandlingsplan | TP',
    filler: 'system_auto',
    contentStatus: 'FULL',
    blockers: [],
    sources: ['src/templates/offerEmail.js'],
    content: {
      emailSample: buildEmailSample(buildOfferEmail, {
        ...emailDemo,
        offerAmount: 89000,
        signUrl: 'https://hairtpclinic.com/sign/demo',
        coolingOffNote:
          'Enligt lag har du minst två dagars betänketid innan avtalet blir bindande.',
      }),
    },
  },
  {
    registryId: 'auto_bokningsbekraftelse',
    label: 'Bokningsbekräftelse (SMS/e-post)',
    filler: 'system_auto',
    contentStatus: 'PARTIAL',
    blockers: ['SMS-mall saknas i kod — e-post FULL via bookingConfirmationEmail.js'],
    sources: ['src/templates/bookingConfirmationEmail.js', 'docs/strategy/CLIENTO-INVENTORY.md'],
    content: {
      emailSample: buildEmailSample(buildBookingConfirmationEmail, emailDemo),
      smsNote: 'Cliento: avsändare HairTP — exakt SMS-text ej exporterad till repo',
    },
  },
  {
    registryId: 'auto_bokningspaminnelse',
    label: 'Bokningspåminnelse (SMS/e-post)',
    filler: 'system_auto',
    contentStatus: 'PARTIAL',
    blockers: ['SMS-mall saknas i kod'],
    sources: ['src/templates/bookingReminderEmail.js'],
    content: {
      emailSample: buildEmailSample(buildBookingReminderEmail, emailDemo),
    },
  },
  {
    registryId: 'auto_avbokningsbekraftelse',
    label: 'Avbokningsbekräftelse (SMS/e-post)',
    filler: 'system_auto',
    contentStatus: 'PARTIAL',
    blockers: ['SMS-mall saknas i kod'],
    sources: ['src/templates/bookingCancellationEmail.js'],
    content: {
      emailSample: buildEmailSample(buildBookingCancellationEmail, emailDemo),
    },
  },
  {
    registryId: 'auto_instruktion_formular',
    label: 'Fyll i hälsodeklaration / friskförsäkran (instruktion till kund)',
    filler: 'system_auto',
    contentStatus: 'FULL',
    blockers: [],
    sources: ['src/ops/ccoPatientOutreach.js'],
    content: {
      health_declaration: buildOutreachMessage({
        outreachType: 'health_declaration',
        patientName: 'Anna',
        linkUrl: 'https://hairtpclinic.com/screen',
      }),
      fitness_certificate: buildOutreachMessage({
        outreachType: 'fitness_certificate',
        patientName: 'Anna',
        linkUrl: 'https://hairtpclinic.com/friskforsakran',
      }),
    },
  },
  {
    registryId: 'auto_betanketid',
    label: 'Betänketid enligt lag (14 dagar) (e-post)',
    filler: 'system_auto',
    contentStatus: 'PARTIAL',
    blockers: ['Ingen dedikerad e-postmall — coolingOffNote i offerEmail + avtalstext i facit'],
    sources: ['src/templates/offerEmail.js', 'migration/meridiq/steg7-tp-dhi-agreement-facit.json'],
    content: {
      coolingOffNote: 'Enligt lag har du minst två dagars betänketid innan avtalet blir bindande.',
      agreementCoolingExcerpt: agreementFacit.cooling.blocks,
    },
  },
  {
    registryId: 'auto_medical_finance',
    label: 'Medical Finance – betalningsinformation (e-post)',
    filler: 'system_auto',
    contentStatus: 'PARTIAL',
    blockers: ['Ingen patient-e-postmall — operatörsinfo via payment prepare'],
    sources: ['src/ops/ccoPatientPaymentPrepare.js'],
    content: getMedicalFinanceInfo(),
  },
  {
    registryId: 'auto_integritet',
    label: 'Personuppgiftspolicy / integritetsinformation',
    filler: 'system_auto',
    contentStatus: 'FULL',
    blockers: ['NEEDS_LEGAL_REVIEW: repo markerar UTKAST i filhuvud'],
    sources: ['docs/legal/personuppgiftspolicy-pub-maj-arcana.md'],
    content: {
      format: 'markdown',
      text: pupMarkdown,
    },
  },
  {
    registryId: 'fore_efter_bildmall',
    label: 'Före/efter-bildmallar (journal → bild)',
    filler: 'staff',
    contentStatus: 'PARTIAL',
    blockers: ['Ingen binär mall i repo — kategorier i photoReviewNaming'],
    sources: ['src/ops/ccoAssetNaming/photoReviewNaming.js'],
    content: {
      stages: ['Före', 'Under', 'Efter', 'Uppföljning'],
      note: 'Journal foto-protokoll kopplas till encounter; publicering = separat steg 9',
    },
  },
  {
    registryId: 'auto_internt_sms',
    label: 'Internt SMS vid bokning/avbokning (personal, ej till kund)',
    filler: 'system_auto',
    contentStatus: 'MISSING',
    blockers: ['Ingen intern SMS-mall i src/sms — endast Cliento-dokumentation'],
    sources: ['docs/strategy/CLIENTO-INVENTORY.md', 'src/sms/smsConnector.js'],
    content: {
      operatorEmailSample: buildEmailSample(
        require('../src/templates/bookingReservationEmail').buildOperatorNotificationEmail,
        {
          patientName: 'Anna Testsson',
          slotStart: demoSlot,
          patientPhone: '+46701234567',
          patientEmail: 'anna@example.com',
        }
      ),
    },
  },
];

function summarizeSection(items) {
  const counts = { FULL: 0, PARTIAL: 0, MISSING: 0 };
  for (const item of items) {
    counts[item.contentStatus] = (counts[item.contentStatus] || 0) + 1;
  }
  return counts;
}

const output = {
  generatedAt: new Date().toISOString(),
  cacheVersion: 'hairtp-document-content-v1',
  description:
    'Samlad Hair TP content-bundle för Cloud — alla kund/personal/info-dokument från Meridiq + facit + CCO-mallar',
  sources: {
    consentCatalog: 'migration/meridiq/consent-catalog.json',
    questionaryCatalog: 'migration/meridiq/questionary-catalog.json',
    tpAgreementFacit: 'migration/meridiq/steg7-tp-dhi-agreement-facit.json',
    documentRegistry: 'src/ops/hairtp-document-types.catalog.json',
    journalTextTemplates: 'migration/journal-text-templates.json',
    emailTemplates: 'src/templates/',
    outreach: 'src/ops/ccoPatientOutreach.js',
    pup: 'docs/legal/personuppgiftspolicy-pub-maj-arcana.md',
  },
  summary: {
    customerFilled: summarizeSection(customerFilled),
    staffFilled: summarizeSection(staffFilled),
    information: summarizeSection(information),
    totalDocuments: customerFilled.length + staffFilled.length + information.length,
  },
  customerFilled,
  staffFilled,
  information,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const sizeMb = (fs.statSync(OUT_PATH).size / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${OUT_PATH} (${output.summary.totalDocuments} docs, ${sizeMb} MB)`);
console.log('Summary:', JSON.stringify(output.summary));
