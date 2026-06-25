#!/usr/bin/env node
/**
 * Genererar steg7-v6-kundkort-final-demo.html från Nordbro/DHI-facit + ångerfrist.
 * source: migration/meridiq/steg7-tp-dhi-agreement-facit.json (consentApiId 170917, cooling 170955)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  extractLogoSvg,
  renderPageHeader,
  renderFacitBlock,
  renderActions,
  wrapDocument,
  writePatientDocument,
  escapeHtml,
  filterManualSignatureBlocks,
} = require('./patient-document-build-lib');

const OUT = path.join(ROOT, 'public/major-arcana-preview/steg7-v6-kundkort-final-demo.html');
const FACIT = path.join(ROOT, 'migration/meridiq/steg7-tp-dhi-agreement-facit.json');

function loadFacit() {
  return JSON.parse(fs.readFileSync(FACIT, 'utf8'));
}

function renderAckCheckbox(label, id) {
  return `<label class="check-item">
            <input type="checkbox" id="${id}" />
            <span>${escapeHtml(label)}</span>
          </label>`;
}

function buildHtml(facit) {
  const logo = extractLogoSvg();
  const agreementHtml = filterManualSignatureBlocks(facit.blocks)
    .map(renderFacitBlock)
    .join('\n        ');
  const coolingTitle = facit.cooling.blocks.find((b) => b.kind === 'title');
  const coolingBody = facit.cooling.blocks
    .filter((b) => b.kind !== 'title')
    .map(renderFacitBlock)
    .join('\n        ');

  const bodyInner = `${renderPageHeader({
    title: 'Avtal & Samtycke',
    step: 7,
    subtitle: 'Hair TP Clinic',
    logo,
  })}

    <div class="page-content">
      <div class="section-block agreement-scroll">
        <div class="section-title">Behandlingsavtal</div>
        ${agreementHtml}
      </div>

      <div class="section-block">
        <div class="section-title">${coolingTitle ? coolingTitle.html : 'Ångerfrist'}</div>
        ${coolingBody}
        <div class="checkbox-group">
          ${renderAckCheckbox(facit.cooling.ackLabel, 'cooling-ack')}
        </div>
      </div>

      <div class="section-block">
        <div class="section-title">Godkännande</div>
        <div class="checkbox-group">
          ${renderAckCheckbox(facit.bundleAckLabel, 'bundle-ack')}
        </div>
      </div>

      ${renderActions('Signera', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: 'Steg 7 — Avtal & Samtycke | Hair TP Clinic',
    headComment: '<!-- source: migration/meridiq/steg7-tp-dhi-agreement-facit.json -->',
    bodyInner,
  });
}

const facit = loadFacit();
const html = buildHtml(facit);
writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '—', facit.blocks.length, 'avtalsblock + ångerfrist');
