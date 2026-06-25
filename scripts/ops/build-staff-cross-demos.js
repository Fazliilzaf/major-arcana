#!/usr/bin/env node
/**
 * Genererar read-only staff-referens final-demos C35–C36.
 * source: hairtp-document-content-bundle.json#information
 */
'use strict';

const path = require('path');
const {
  ROOT,
  loadBundleInformationEntry,
  buildStaffReadonlyReferenceHtml,
  renderStaffRefTable,
  renderStaffPre,
  writeStaffDocument,
} = require('./staff-document-build-lib');
const { escapeHtml } = require('./patient-document-build-lib');

const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

function renderSection(title, innerHtml) {
  return `<div class="section-block">
      <div class="section-title">${escapeHtml(title)}</div>
      ${innerHtml}
    </div>`;
}

function buildForeEfterBildmallHtml() {
  const entry = loadBundleInformationEntry('fore_efter_bildmall');
  const content = entry.content || {};
  const display = content.stageDisplay || {};
  const stageRows = (content.reviewStages || []).map((stage) => [
    stage.id,
    display[stage.id] || stage.label || stage.id,
    stage.category,
  ]);
  const areaRows = (content.bodyAreas || []).map((area) => [area.id, area.label]);

  const bodySectionsHtml = [
    renderSection(
      'Journal foto-protokoll',
      `<p class="doc-text">${escapeHtml(content.note || 'Journal foto-protokoll kopplas till encounter; publicering = separat steg 9.')}</p>`
    ),
    renderSection('Foto-stadier', renderStaffRefTable(['ID', 'Visning', 'Kategori'], stageRows)),
    renderSection('Kroppszoner / områden', renderStaffRefTable(['ID', 'Etikett'], areaRows)),
    renderSection(
      'Op-dag · CCO',
      `<p class="doc-text source-note">Taxonomi från photoReviewNaming — ingen binär bildmall i repo. Personal tar bild via CCO kamera-flöde kopplat till encounter.</p>`
    ),
  ].join('\n');

  return buildStaffReadonlyReferenceHtml({
    registryId: 'fore_efter_bildmall',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#fore_efter_bildmall · src/ops/ccoAssetNaming/photoReviewNaming.js -->',
    headerTitle: 'Före/efter-bildmallar',
    pageTitle: 'Före/efter-bild · foto-protokoll | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Op-dag · journal → bild',
    contextLabel: 'Personal · Op-dag',
    step: 8,
    stepBadge: 'Steg 8–9',
    bodySectionsHtml,
    footnote: 'Read-only referens · bilder tas i CCO — publicering kräver steg 9 samtycke',
  });
}

function buildAutoInterntSmsHtml() {
  const entry = loadBundleInformationEntry('auto_internt_sms');
  const content = entry.content || {};
  const sample = content.operatorEmailSample || {};

  const bodySectionsHtml = [
    content.channelNote
      ? renderSection('Kanal', `<p class="doc-text">${escapeHtml(content.channelNote)}</p>`)
      : '',
    sample.subject
      ? renderSection(
          'E-post · ämnesrad (intern)',
          `<p class="doc-text"><strong>${escapeHtml(sample.subject)}</strong></p>`
        )
      : '',
    sample.text
      ? renderSection(
          'E-post · brödtext (intern)',
          `<p class="doc-text source-note">Exempel till operatör/admin — skickas inte till patient.</p>
        ${renderStaffPre(sample.text)}`
        )
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return buildStaffReadonlyReferenceHtml({
    registryId: 'auto_internt_sms',
    sourceComment:
      '<!-- source: hairtp-document-content-bundle.json#auto_internt_sms · docs/strategy/CLIENTO-INVENTORY.md · src/templates/bookingReservationEmail.js -->',
    headerTitle: 'Internt meddelande · bokning',
    pageTitle: 'Internt SMS/e-post · bokning | Hair TP Clinic',
    subtitle: 'Hair TP Clinic · Endast personal/admin',
    contextLabel: 'Personal · Intern',
    step: 0,
    stepBadge: 'Intern',
    staffBadge: 'Intern',
    bodySectionsHtml,
    footnote: 'Read-only · operatör-meddelande — ej patientkanal',
  });
}

const DEMOS = [
  {
    registryId: 'fore_efter_bildmall',
    out: 'steg8-fore-efter-bildmall-final-demo.html',
    build: buildForeEfterBildmallHtml,
  },
  {
    registryId: 'auto_internt_sms',
    out: 'staff-auto-internt-sms-final-demo.html',
    build: buildAutoInterntSmsHtml,
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
