#!/usr/bin/env node
/**
 * Genererar steg9-foto-samtycke-final-demo.html (#15).
 * source: hairtp-document-content-bundle.json (scope + ackLabel; full Nordbro-text PARTIAL/ORD-24)
 */
'use strict';

const path = require('path');
const {
  ROOT,
  escapeHtml,
  extractLogoSvg,
  renderPageHeader,
  renderAckCheckbox,
  renderActions,
  loadBundleCustomerEntry,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const BUNDLE = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const OUT = path.join(ROOT, 'public/major-arcana-preview/steg9-foto-samtycke-final-demo.html');

function buildHtml(entry) {
  const logo = extractLogoSvg();
  const content = entry.content || {};
  const scope = content.scope || {};
  const bullets = Array.isArray(scope.bullets) ? scope.bullets : [];
  const bulletHtml = bullets
    .map((b) => `<li class="doc-text">${escapeHtml(b)}</li>`)
    .join('\n          ');

  const bodyInner = `${renderPageHeader({
    title: 'Foto-samtycke',
    step: 9,
    subtitle: 'Hair TP Clinic',
    logo,
  })}

    <div class="page-content" data-registry-id="foto_samtycke">
      <div class="section-block">
        <div class="section-title">Samtycke till foto-publicering</div>
        <p class="doc-text">${escapeHtml(scope.summary || '')}</p>
        <ul class="doc-list">
          ${bulletHtml}
        </ul>
        <p class="doc-text">${escapeHtml(content.subtitle || '')}</p>
        <div class="checkbox-group">
          ${renderAckCheckbox(content.ackLabel, 'photo-ack')}
        </div>
      </div>

      ${renderActions('Signera &amp; skicka', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: 'Steg 9 — Foto-samtycke | Hair TP Clinic',
    headComment: '<!-- source: hairtp-document-content-bundle.json#foto_samtycke -->',
    bodyInner,
  });
}

const entry = loadBundleCustomerEntry(BUNDLE, 'foto_samtycke');
if (!entry.content?.ackLabel) throw new Error('foto_samtycke saknar ackLabel');
writePatientDocument(OUT, buildHtml(entry));
console.log('✓ Skrev', OUT, '— foto-samtycke scope + ack');
