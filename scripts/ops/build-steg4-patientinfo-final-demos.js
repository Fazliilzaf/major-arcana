#!/usr/bin/env node
/**
 * Genererar steg 4 patientinfo-demos (#12–14).
 * source: hairtp-document-content-bundle.json
 */
'use strict';

const path = require('path');
const {
  ROOT,
  extractLogoSvg,
  renderPageHeader,
  renderAgreementBlock,
  renderAckCheckbox,
  renderActions,
  infoTextToBlocks,
  loadBundleCustomerEntry,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const BUNDLE = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

const INFO_DOCS = [
  {
    registryId: 'prp_hair_info_sve',
    slug: 'prp-hair-info-sve',
    title: 'Patientinformation',
    subtitle: 'PRP hår · Platelet Rich Plasma',
    textKey: 'letterText',
  },
  {
    registryId: 'prp_hair_info_eng',
    slug: 'prp-hair-info-eng',
    title: 'Patient information',
    subtitle: 'PRP · Platelet Rich Plasma',
    textKey: 'letterText',
  },
  {
    registryId: 'microneedling_info',
    slug: 'microneedling-info-sve',
    title: 'Patientinformation',
    subtitle: 'Microneedling',
    textKey: 'letterTextSwe',
  },
];

function resolveText(entry, textKey) {
  const content = entry.content || {};
  const text = content[textKey] || content.letterText || '';
  if (!text) throw new Error(`Saknar text för ${entry.registryId} (${textKey})`);
  return text;
}

function buildHtml({ entry, title, subtitle, text }) {
  const logo = extractLogoSvg();
  const { blocks, ackLabel } = infoTextToBlocks(text);
  if (!blocks.length) throw new Error(`Inga block för ${entry.registryId}`);
  if (!ackLabel) throw new Error(`Saknar ack-rad för ${entry.registryId}`);

  const bodyHtml = blocks.map(renderAgreementBlock).join('\n        ');

  const bodyInner = `${renderPageHeader({
    title,
    step: 4,
    subtitle,
    logo,
  })}

    <div class="page-content" data-registry-id="${entry.registryId}">
      <div class="section-block info-scroll">
        ${bodyHtml}
        <div class="checkbox-group">
          ${renderAckCheckbox(ackLabel, 'info-ack')}
        </div>
      </div>

      ${renderActions('Signera &amp; skicka', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: `Steg 4 — ${subtitle} | Hair TP Clinic`,
    headComment: `<!-- source: hairtp-document-content-bundle.json#${entry.registryId} -->`,
    bodyInner,
  });
}

function main() {
  for (const doc of INFO_DOCS) {
    const entry = loadBundleCustomerEntry(BUNDLE, doc.registryId);
    const text = resolveText(entry, doc.textKey);
    const out = path.join(PREVIEW, `steg4-${doc.slug}-final-demo.html`);
    writePatientDocument(out, buildHtml({ entry, ...doc, text }));
    console.log('✓ Steg 4', doc.slug, '→', out);
  }
}

main();
