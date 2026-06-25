#!/usr/bin/env node
/**
 * Genererar staff-mall final-demos B22–B26.
 * source: hairtp-document-content-bundle.json + journal-text-templates.json
 *         + journal-plan-editor / treatmentPlanEmail fältstruktur
 */
'use strict';

const path = require('path');
const {
  ROOT,
  loadBundleStaffEntry,
  loadJournalTextTemplate,
  buildStaffTemplateHtml,
  renderStaffFormField,
  renderStaffYesNoField,
  renderStaffCheckboxGroup,
  writeStaffDocument,
} = require('./staff-document-build-lib');

const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

function buildBehandlingsplanHtml() {
  const entry = loadBundleStaffEntry('behandlingsplan_staff');
  const fieldsHtml = [
    renderStaffFormField({
      key: 'method',
      label: 'Metod',
      type: 'select',
      options: ['FUE', 'DHI', 'Kombination FUE + DHI', 'PRP'],
    }),
    renderStaffFormField({
      key: 'graftsTotal',
      label: 'Grafts totalt',
      placeholder: 't.ex. 3200',
    }),
    renderStaffFormField({
      key: 'zones',
      label: 'Zoner',
      type: 'textarea',
      placeholder: 'Front, vertex, temporal…',
    }),
    renderStaffYesNoField({ key: 'prpIncluded', label: 'PRP ingår i planen?' }),
    '<div class="field-row">',
    renderStaffFormField({
      key: 'totalPrice',
      label: 'Totalpris (kr)',
      placeholder: 't.ex. 89900',
    }),
    renderStaffFormField({
      key: 'deposit20',
      label: 'Förskott 20 % (kr)',
      placeholder: 'Beräknas automatiskt i CCO',
    }),
    '</div>',
    renderStaffFormField({
      key: 'notes',
      label: 'Anteckning till kund',
      type: 'textarea',
      placeholder: 'Syns i offert och behandlingsplan…',
    }),
    renderStaffFormField({
      key: 'staffNotes',
      label: 'Intern anteckning',
      type: 'textarea',
      placeholder: 'Bara för personal — syns inte i offert',
    }),
  ].join('\n');

  return buildStaffTemplateHtml({
    registryId: 'behandlingsplan_staff',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#behandlingsplan_staff · MS 98. Mailmallar/Offert/Behandlingsplan HT · journal-plan-editor.js -->',
    headerTitle: 'Behandlingsplan / offert',
    pageTitle: 'Steg 5 — Behandlingsplan | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Konsultation',
    contextLabel: 'Personal · Konsultation',
    step: 5,
    sectionTitle: 'Plan &amp; offert · personal skapar',
    noteText: entry.content?.note || 'Dynamisk per patient/offert — genereras vid utskick.',
    fieldsHtml,
    primaryAction: 'Skicka till kund',
    ghostAction: 'Spara utkast',
  });
}

function buildKonsultationsmallHtml() {
  const entry = loadBundleStaffEntry('konsultationsmall');
  const summaryText = loadJournalTextTemplate('consultation-summary');
  const fieldsHtml = [
    renderStaffFormField({ key: 'consultationDate', label: 'Konsultationsdatum', type: 'date' }),
    renderStaffFormField({
      key: 'alternativesDiscussed',
      label: 'Behandlingsalternativ diskuterade',
      type: 'textarea',
      placeholder: 'Metod, områden, förväntningar…',
    }),
    renderStaffFormField({
      key: 'recommendedMethod',
      label: 'Rekommenderad metod',
      type: 'select',
      options: ['FUE', 'DHI', 'Kombination', 'PRP', 'Avvakta'],
    }),
    renderStaffFormField({
      key: 'patientQuestions',
      label: 'Patientens frågor och önskemål',
      type: 'textarea',
    }),
    renderStaffFormField({
      key: 'followUpPlan',
      label: 'Uppföljning / nästa steg',
      type: 'textarea',
      placeholder: 'Offert, hälsodeklaration, bokning…',
    }),
    renderStaffFormField({
      key: 'consultationNotes',
      label: 'Konsultationsanteckning',
      type: 'textarea',
      rows: 4,
    }),
  ].join('\n');

  return buildStaffTemplateHtml({
    registryId: 'konsultationsmall',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#konsultationsmall · migration/journal-text-templates.json#consultation-summary -->',
    headerTitle: 'Konsultationsmall',
    pageTitle: 'Steg 4 — Konsultationsmall | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Konsultation',
    contextLabel: 'Personal · Konsultation',
    step: 4,
    sectionTitle: 'Konsultation · dokumentera',
    introText: summaryText,
    noteText: entry.content?.text
      ? 'Patientinfo-mejl (Nordbro) skickas separat — detta är personalens konsultationsanteckning.'
      : '',
    fieldsHtml,
    primaryAction: 'Signera &amp; spara',
    ghostAction: 'Spara utkast',
  });
}

function buildOrdinationTpHtml() {
  loadBundleStaffEntry('ordination_tp');
  const stubText = loadJournalTextTemplate('prescription-standard');
  const fieldsHtml = [
    renderStaffFormField({ key: 'ordinationDate', label: 'Datum', type: 'date' }),
    renderStaffFormField({
      key: 'prescriber',
      label: 'Ordinerande behandlare',
      placeholder: 'Namn',
    }),
    renderStaffFormField({
      key: 'carbocainMl',
      label: 'Carbocain® (mepivakain m. adrenalin 20 mg/ml) — ml',
      placeholder: 'ml',
    }),
    renderStaffFormField({
      key: 'marcainMl',
      label: 'Marcain® (bupivakain m. adrenalin 5 mg/ml) — ml',
      placeholder: 'ml',
    }),
    renderStaffFormField({
      key: 'adrenalinMl',
      label: 'Adrenalin 1 mg/ml i NaCl — ml',
      placeholder: 'ml',
    }),
    renderStaffFormField({
      key: 'tribonatMl',
      label: 'Tribonat® (buffertlösning) — ml',
      placeholder: 'ml',
    }),
    renderStaffFormField({
      key: 'ordinationNotes',
      label: 'Övrig ordination / anteckning',
      type: 'textarea',
      rows: 4,
    }),
  ].join('\n');

  return buildStaffTemplateHtml({
    registryId: 'ordination_tp',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#ordination_tp · migration/journal-text-templates.json#prescription-standard · MS-LOKAL ordination docx -->',
    headerTitle: 'Ordination · lokalbedövning TP',
    pageTitle: 'Steg 8 — Ordination TP | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Op-dag',
    contextLabel: 'Personal · Op-dag',
    step: 8,
    sectionTitle: 'Ordination · lokalbedövning',
    introText: stubText,
    noteText: 'Full Word-mall: SharePoint NY Ordination – Lokalbedövning vid hår-.docx',
    fieldsHtml,
    primaryAction: 'Signera &amp; arkivera',
    ghostAction: 'Spara utkast',
  });
}

function buildAnteckningarKortHtml() {
  const entry = loadBundleStaffEntry('anteckningar_kort');
  const fieldsHtml = [
    renderStaffFormField({
      key: 'noteCategory',
      label: 'Typ',
      type: 'select',
      options: ['Allmänt', 'Bokning', 'Kliniskt', 'Ekonomi', 'Uppföljning', 'Internt'],
    }),
    renderStaffFormField({
      key: 'notes',
      label: 'Anteckning till kund (valfritt)',
      type: 'textarea',
      rows: 4,
      placeholder: 'Syns i journal/offert där det är relevant…',
    }),
    renderStaffFormField({
      key: 'staffNotes',
      label: 'Intern anteckning',
      type: 'textarea',
      rows: 5,
      placeholder: 'Bara personal — fritext på patientkortet',
    }),
    renderStaffFormField({
      key: 'pinImportant',
      label: 'Viktig notering på kort',
      type: 'textarea',
      rows: 2,
      placeholder: 'Synlig varning/notis högst upp på kundkortet',
    }),
  ].join('\n');

  return buildStaffTemplateHtml({
    registryId: 'anteckningar_kort',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#anteckningar_kort · patient-master-ui.js -->',
    headerTitle: 'Anteckningar · patientkort',
    pageTitle: 'Anteckningar på patientkort | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Internt',
    contextLabel: 'Personal · Patientkort',
    step: 4,
    stepBadge: 'Patientkort',
    sectionTitle: 'Fritext · sparas på kundkort',
    noteText: entry.content?.note || 'Fritext i CCO patientkort — by design, ingen fast mall.',
    fieldsHtml,
    primaryAction: 'Spara anteckning',
    ghostAction: 'Visa historik',
    includeMeta: true,
  });
}

function buildIdVerifieringHtml() {
  const entry = loadBundleStaffEntry('id_verifiering');
  const methods = entry.content?.methods || [];
  const methodLabels = {
    in_person: 'Vid besök (leg visad)',
    manual_id_upload: 'Uppladdat ID (kundportal)',
    selfie_match: 'Selfie-match',
    bankid_se: 'BankID',
    eu_wallet: 'EU Digital Identity Wallet',
  };
  const methodOptions = methods.map((m) => methodLabels[m] || m);

  const fieldsHtml = [
    renderStaffFormField({
      key: 'verificationStatus',
      label: 'Status',
      type: 'select',
      options: [
        'Ej verifierad',
        'Väntar uppladdning',
        'Väntar granskning',
        'Verifierad',
        'Avvisad',
      ],
    }),
    renderStaffFormField({
      key: 'verificationMethod',
      label: 'Verifieringsmetod',
      type: 'select',
      options: methodOptions,
    }),
    renderStaffCheckboxGroup({
      key: 'idDocumentType',
      label: 'Visa legitimation för personal',
      options: ['Pass', 'Körkort', 'Nationellt ID', 'Svenskt ID'],
    }),
    renderStaffFormField({
      key: 'idNumber',
      label: 'Ange ID-nummer',
      placeholder: 'Enligt visad legitimation',
    }),
    renderStaffFormField({ key: 'verifiedAt', label: 'Verifierad datum', type: 'date' }),
    renderStaffFormField({ key: 'reviewedBy', label: 'Granskad av', placeholder: 'Personal' }),
    renderStaffFormField({
      key: 'rejectionReason',
      label: 'Avvisningsorsak (om avvisad)',
      type: 'textarea',
      rows: 2,
    }),
  ].join('\n');

  return buildStaffTemplateHtml({
    registryId: 'id_verifiering',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#id_verifiering · src/ops/patientIdentityVerification.js · ID-kontroll: cco-templates friskförsäkran facit -->',
    headerTitle: 'ID-verifiering',
    pageTitle: 'ID-verifiering | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Konsultation &amp; Op-dag',
    contextLabel: 'Personal · ID-kontroll',
    step: 4,
    stepBadge: 'Steg 4 + 8',
    sectionTitle: 'ID-kontroll · process',
    noteText: entry.content?.note || 'Process-dokument — status unverified → verified med audit.',
    fieldsHtml,
    primaryAction: 'Markera verifierad',
    ghostAction: 'Spara utkast',
  });
}

const DEMOS = [
  {
    registryId: 'behandlingsplan_staff',
    out: 'steg5-behandlingsplan-staff-final-demo.html',
    build: buildBehandlingsplanHtml,
  },
  {
    registryId: 'konsultationsmall',
    out: 'steg4-konsultationsmall-final-demo.html',
    build: buildKonsultationsmallHtml,
  },
  {
    registryId: 'ordination_tp',
    out: 'steg8-ordination-tp-final-demo.html',
    build: buildOrdinationTpHtml,
  },
  {
    registryId: 'anteckningar_kort',
    out: 'staff-anteckningar-kort-final-demo.html',
    build: buildAnteckningarKortHtml,
  },
  {
    registryId: 'id_verifiering',
    out: 'steg4-id-verifiering-final-demo.html',
    build: buildIdVerifieringHtml,
  },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length
  ? DEMOS.filter((d) => only.includes(d.registryId) || only.includes(d.out))
  : DEMOS;

if (!targets.length) {
  console.error('Okänt filter:', only.join(', '));
  process.exit(1);
}

for (const demo of targets) {
  const outPath = path.join(PREVIEW, demo.out);
  const html = demo.build();
  writeStaffDocument(outPath, html);
  console.log('✓ Skrev', outPath);
}
