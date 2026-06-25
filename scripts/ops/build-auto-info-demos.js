#!/usr/bin/env node
/**
 * Genererar read-only auto/info final-demos C27–C34.
 * source: public/major-arcana-preview/data/hairtp-document-content-bundle.json
 */
'use strict';

const path = require('path');
const {
  ROOT,
  escapeHtml,
  loadBundleInformationEntry,
  substituteInfoMergeFields,
  renderInfoPre,
  renderInfoSection,
  renderFacitBlock,
  buildSmsEmailSections,
  buildInfoDocumentHtml,
  writeInfoDocument,
} = require('./info-document-build-lib');

const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

function buildInfoOffertTp() {
  const entry = loadBundleInformationEntry('info_offert_tp');
  return buildInfoDocumentHtml({
    registryId: 'info_offert_tp',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#info_offert_tp · src/templates/offerEmail.js -->',
    headerTitle: 'Offert & behandlingsplan · TP',
    pageTitle: 'Steg 5 — Offert & behandlingsplan (auto) | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Automatiskt utskick',
    step: 5,
    bodySectionsHtml: buildSmsEmailSections(entry.content || {}),
  });
}

function buildAutoSmsEmail(registryId, opts) {
  const entry = loadBundleInformationEntry(registryId);
  return buildInfoDocumentHtml({
    registryId,
    sourceComment: `<!-- source: hairtp-document-content-bundle.json#${registryId} -->`,
    bodySectionsHtml: buildSmsEmailSections(entry.content || {}),
    ...opts,
  });
}

function buildInstruktionFormular() {
  const entry = loadBundleInformationEntry('auto_instruktion_formular');
  const content = entry.content || {};
  const hd = content.health_declaration || {};
  const fc = content.fitness_certificate || {};

  const bodySectionsHtml = [
    renderInfoSection(
      'Hälsodeklaration · steg 3',
      `<p class="info-channel-label">Instruktion till kund</p>
        <p class="doc-text"><strong>${escapeHtml(substituteInfoMergeFields(hd.subject))}</strong></p>
        ${renderInfoPre(hd.text)}`
    ),
    renderInfoSection(
      'Friskförsäkran · steg 8',
      `<p class="info-channel-label">Instruktion till kund</p>
        <p class="doc-text"><strong>${escapeHtml(substituteInfoMergeFields(fc.subject))}</strong></p>
        ${renderInfoPre(fc.text)}`
    ),
  ].join('\n');

  return buildInfoDocumentHtml({
    registryId: 'auto_instruktion_formular',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#auto_instruktion_formular · src/ops/ccoPatientOutreach.js -->',
    headerTitle: 'Instruktion HD / FC',
    pageTitle: 'Instruktion formulär HD & FC | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Automatiskt utskick',
    step: 3,
    stepBadge: 'Steg 3 + 8',
    bodySectionsHtml,
  });
}

function buildBetanketid() {
  const entry = loadBundleInformationEntry('auto_betanketid');
  const content = entry.content || {};
  const excerptHtml = (content.agreementCoolingExcerpt || [])
    .map((block) => renderFacitBlock(block))
    .join('\n        ');
  const sections = [
    content.coolingOffNote
      ? renderInfoSection('Betänketid · notis', renderInfoPre(content.coolingOffNote))
      : '',
    excerptHtml
      ? renderInfoSection(
          'Ångerfrist · utdrag avtal',
          `<div class="info-scroll">${excerptHtml}</div>`
        )
      : '',
    buildSmsEmailSections(content),
  ]
    .filter(Boolean)
    .join('\n');

  return buildInfoDocumentHtml({
    registryId: 'auto_betanketid',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#auto_betanketid · offerEmail.js + steg7-tp-dhi-agreement-facit.json -->',
    headerTitle: 'Betänketid enligt lag',
    pageTitle: 'Steg 6 — Betänketid (auto) | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · E-post vid offert',
    step: 6,
    bodySectionsHtml: sections,
  });
}

function buildMedicalFinance() {
  const entry = loadBundleInformationEntry('auto_medical_finance');
  const content = entry.content || {};
  const contact = content.contact || {};
  const inner = [
    content.message ? `<p class="doc-text">${escapeHtml(content.message)}</p>` : '',
    content.provider
      ? `<p class="doc-text"><strong>Leverantör:</strong> ${escapeHtml(content.provider)}</p>`
      : '',
    contact.label
      ? `<p class="doc-text"><strong>Kontakt:</strong> ${escapeHtml(contact.label)}</p>`
      : '',
    contact.url ? `<p class="doc-text"><strong>Webb:</strong> ${escapeHtml(contact.url)}</p>` : '',
    content.mode
      ? `<p class="doc-text source-note">Läge: ${escapeHtml(content.mode)} · kräver manuell åtgärd i CCO</p>`
      : '',
  ]
    .filter(Boolean)
    .join('\n        ');

  return buildInfoDocumentHtml({
    registryId: 'auto_medical_finance',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#auto_medical_finance · src/ops/ccoPatientPaymentPrepare.js -->',
    headerTitle: 'Medical Finance',
    pageTitle: 'Medical Finance · betalningsinfo | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Extern finansiering',
    step: 0,
    stepBadge: 'Cross',
    bodySectionsHtml: renderInfoSection('Medical Finance · extern finansiering', inner),
    footnote: 'Read-only · ingen API-koppling — personal dokumenterar manuellt',
  });
}

function buildIntegritet() {
  const entry = loadBundleInformationEntry('auto_integritet');
  return buildInfoDocumentHtml({
    registryId: 'auto_integritet',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#auto_integritet · docs/legal/personuppgiftspolicy-pub-maj-arcana.md -->',
    headerTitle: 'Personuppgiftspolicy',
    pageTitle: 'Integritetspolicy | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Information',
    step: 0,
    stepBadge: 'Cross',
    kind: 'Info',
    bodySectionsHtml: renderInfoSection(
      'Integritetstext · facit',
      renderInfoPre(entry.content?.text || '')
    ),
    footnote: 'Read-only · publiceras på webb/patientkanaler enligt legal',
  });
}

const DEMOS = [
  {
    registryId: 'info_offert_tp',
    out: 'steg5-info-offert-tp-final-demo.html',
    build: buildInfoOffertTp,
  },
  {
    registryId: 'auto_bokningsbekraftelse',
    out: 'steg2-auto-bokningsbekraftelse-final-demo.html',
    build: () =>
      buildAutoSmsEmail('auto_bokningsbekraftelse', {
        headerTitle: 'Bokningsbekräftelse',
        pageTitle: 'Steg 2 — Bokningsbekräftelse (auto) | Hair TP Clinic',
        subtitle: 'Hair TP Clinic · SMS & e-post',
        step: 2,
      }),
  },
  {
    registryId: 'auto_bokningspaminnelse',
    out: 'auto-bokningspaminnelse-final-demo.html',
    build: () =>
      buildAutoSmsEmail('auto_bokningspaminnelse', {
        headerTitle: 'Bokningspåminnelse',
        pageTitle: 'Bokningspåminnelse (auto) | Hair TP Clinic',
        subtitle: 'Hair TP Clinic · SMS',
        step: 0,
        stepBadge: 'Cross',
      }),
  },
  {
    registryId: 'auto_avbokningsbekraftelse',
    out: 'auto-avbokningsbekraftelse-final-demo.html',
    build: () =>
      buildAutoSmsEmail('auto_avbokningsbekraftelse', {
        headerTitle: 'Avbokningsbekräftelse',
        pageTitle: 'Avbokningsbekräftelse (auto) | Hair TP Clinic',
        subtitle: 'Hair TP Clinic · SMS & e-post',
        step: 0,
        stepBadge: 'Cross',
      }),
  },
  {
    registryId: 'auto_instruktion_formular',
    out: 'steg3-auto-instruktion-formular-final-demo.html',
    build: buildInstruktionFormular,
  },
  {
    registryId: 'auto_betanketid',
    out: 'steg6-auto-betanketid-final-demo.html',
    build: buildBetanketid,
  },
  {
    registryId: 'auto_medical_finance',
    out: 'auto-medical-finance-final-demo.html',
    build: buildMedicalFinance,
  },
  { registryId: 'auto_integritet', out: 'auto-integritet-final-demo.html', build: buildIntegritet },
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
  writeInfoDocument(outPath, html);
  console.log('✓ Skrev', outPath);
}
