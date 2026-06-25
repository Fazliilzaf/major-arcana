#!/usr/bin/env node
/**
 * Genererar steg 5 (offert) + steg 7 (signering) final-demo för offert #4–9.
 * source: hairtp-document-content-bundle.json + meridiq facit JSON
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  extractLogoSvg,
  renderPageHeader,
  renderActions,
  renderAckCheckbox,
  extractOffertSectionBlocks,
  renderAgreementBlock,
  loadBundleCustomerEntry,
  agreementPlainTextToBlocks,
  filterManualSignatureBlocks,
  OFFERT_ACK_LABEL,
  DEFAULT_BUNDLE_ACK,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const BUNDLE = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');
const MERIDIQ = path.join(ROOT, 'migration/meridiq');

const OFFERT_VARIANTS = [
  {
    registryId: 'offert_tp',
    slug: 'tp',
    facit: 'steg7-tp-dhi-agreement-facit.json',
    skipSteg7: true,
  },
  { registryId: 'offert_prp_hair', slug: 'prp-hair', facit: 'prp-behandling-agreement-facit.json' },
  { registryId: 'offert_prp_skin', slug: 'prp-skin', facit: 'prp-behandling-agreement-facit.json' },
  { registryId: 'offert_microneedling', slug: 'microneedling' },
  { registryId: 'offert_prf', slug: 'prf' },
  { registryId: 'offert_profilo', slug: 'profilo' },
];

const DEMO_PRICES = {
  tp: [
    ['Behandling', 'Hårtransplantation DHI'],
    ['Omfattning', '3 200 graft'],
    ['Totalpris', '89 900 kr'],
    ['Förskott 20 %', '17 980 kr'],
  ],
  'prp-hair': [
    ['Behandling', 'PRP hår'],
    ['Antal tillfällen', '4'],
    ['Totalpris', '12 800 kr'],
  ],
  'prp-skin': [
    ['Behandling', 'PRP hud'],
    ['Antal tillfällen', '3'],
    ['Totalpris', '9 600 kr'],
  ],
  microneedling: [
    ['Behandling', 'Microneedling + PRP'],
    ['Antal tillfällen', '3'],
    ['Totalpris', '11 500 kr'],
  ],
  prf: [
    ['Behandling', 'PRF hud'],
    ['Antal tillfällen', '2'],
    ['Totalpris', '8 900 kr'],
  ],
  profilo: [
    ['Behandling', 'Profhilo'],
    ['Antal tillfällen', '2'],
    ['Totalpris', '7 400 kr'],
  ],
};

function loadCooling() {
  const facit = JSON.parse(
    fs.readFileSync(path.join(MERIDIQ, 'steg7-tp-dhi-agreement-facit.json'), 'utf8')
  );
  return facit.cooling;
}

function resolveAgreementBlocks(entry, facitFile) {
  const content = entry.content || {};
  if (Array.isArray(content.agreementBlocks) && content.agreementBlocks.length) {
    return filterManualSignatureBlocks(content.agreementBlocks);
  }
  if (facitFile) {
    const facit = JSON.parse(fs.readFileSync(path.join(MERIDIQ, facitFile), 'utf8'));
    if (Array.isArray(facit.blocks) && facit.blocks.length) {
      return filterManualSignatureBlocks(facit.blocks);
    }
  }
  const text = content.agreementText || content.letterText || '';
  return filterManualSignatureBlocks(agreementPlainTextToBlocks(text));
}

function renderDemoPriceRows(slug) {
  const rows = DEMO_PRICES[slug] || [];
  if (!rows.length) return '';
  const lines = rows
    .map(
      ([label, value]) =>
        `<p class="doc-text"><strong>${label}:</strong> <span class="demo-value">${value}</span></p>`
    )
    .join('\n        ');
  return `<div class="section-block" data-demo-prices="1">
        <div class="section-title">Offertuppgifter (demo)</div>
        ${lines}
      </div>`;
}

function buildSteg5Html({ entry, slug, blocks }) {
  const logo = extractLogoSvg();
  const offertBlocks = extractOffertSectionBlocks(blocks);
  const offertHtml = offertBlocks.map(renderAgreementBlock).join('\n        ');
  const title = entry.label.replace('Behandlingsavtal / offert |', 'Offert ·').trim();

  const bodyInner = `${renderPageHeader({
    title: 'Offert & Behandlingsplan',
    step: 5,
    subtitle: title,
    logo,
  })}

    <div class="page-content" data-registry-id="${entry.registryId}">
      ${renderDemoPriceRows(slug)}

      <div class="section-block">
        <div class="section-title">Offert</div>
        ${offertHtml}
        <div class="checkbox-group">
          ${renderAckCheckbox(OFFERT_ACK_LABEL, 'offer-ack')}
        </div>
      </div>

      ${renderActions('Godkänn offert', 'Begär ändring')}
    </div>`;

  return wrapDocument({
    title: `Steg 5 — Offert | ${title}`,
    headComment: `<!-- source: hairtp-document-content-bundle.json#${entry.registryId} -->`,
    bodyInner,
  });
}

function buildSteg7Html({ entry, blocks, cooling, bundleAckLabel }) {
  const logo = extractLogoSvg();
  const agreementHtml = blocks.map(renderAgreementBlock).join('\n        ');
  const coolingTitle = cooling.blocks.find((b) => b.kind === 'title');
  const coolingBody = cooling.blocks
    .filter((b) => b.kind !== 'title')
    .map(renderAgreementBlock)
    .join('\n        ');
  const title = entry.label.replace('Behandlingsavtal / offert |', 'Avtal ·').trim();

  const bodyInner = `${renderPageHeader({
    title: 'Avtal & Samtycke',
    step: 7,
    subtitle: title,
    logo,
  })}

    <div class="page-content" data-registry-id="${entry.registryId}">
      <div class="section-block agreement-scroll">
        <div class="section-title">Behandlingsavtal</div>
        ${agreementHtml}
      </div>

      <div class="section-block">
        <div class="section-title">${coolingTitle ? coolingTitle.html : 'Ångerfrist'}</div>
        ${coolingBody}
        <div class="checkbox-group">
          ${renderAckCheckbox(cooling.ackLabel, 'cooling-ack')}
        </div>
      </div>

      <div class="section-block">
        <div class="section-title">Godkännande</div>
        <div class="checkbox-group">
          ${renderAckCheckbox(bundleAckLabel, 'bundle-ack')}
        </div>
      </div>

      ${renderActions('Signera', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: `Steg 7 — Avtal & Samtycke | ${title}`,
    headComment: `<!-- source: hairtp-document-content-bundle.json#${entry.registryId} -->`,
    bodyInner,
  });
}

function main() {
  const cooling = loadCooling();
  let steg5Count = 0;
  let steg7Count = 0;

  for (const variant of OFFERT_VARIANTS) {
    const entry = loadBundleCustomerEntry(BUNDLE, variant.registryId);
    entry.registryId = variant.registryId;
    const blocks = resolveAgreementBlocks(entry, variant.facit);
    const bundleAckLabel = entry.content?.bundleAckLabel || DEFAULT_BUNDLE_ACK;

    const steg5Path = path.join(PREVIEW, `steg5-offert-${variant.slug}-final-demo.html`);
    writePatientDocument(steg5Path, buildSteg5Html({ entry, slug: variant.slug, blocks }));
    steg5Count += 1;
    console.log('✓ Steg 5', variant.slug, '→', steg5Path);

    if (!variant.skipSteg7) {
      const steg7Path = path.join(PREVIEW, `steg7-offert-${variant.slug}-final-demo.html`);
      writePatientDocument(steg7Path, buildSteg7Html({ entry, blocks, cooling, bundleAckLabel }));
      steg7Count += 1;
      console.log('✓ Steg 7', variant.slug, '→', steg7Path);
    }
  }

  console.log(`Klart — ${steg5Count} steg 5 + ${steg7Count} steg 7 offert-demos`);
}

main();
