#!/usr/bin/env node
/**
 * Genererar steg6-betanketid-samtycke-final-demo.html
 * source: hairtp-document-content-bundle.json (samtycke_bokning_2d, samtycke_angerratt)
 *         + steg7-tp-dhi-agreement-facit.json (betänketid 2 dagar)
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
  renderAckCheckbox,
  letterTextToBlocks,
  extractBetanketidBlocks,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const OUT = path.join(
  ROOT,
  'public/major-arcana-preview/steg6-betanketid-samtycke-final-demo.html'
);
const BUNDLE = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const FACIT7 = path.join(ROOT, 'migration/meridiq/steg7-tp-dhi-agreement-facit.json');

function loadBundleEntry(registryId) {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const entry = bundle.customerFilled.find((d) => d.registryId === registryId);
  if (!entry?.content) throw new Error(`Bundle saknar ${registryId}`);
  return entry.content;
}

function buildHtml() {
  const logo = extractLogoSvg();
  const facit7 = JSON.parse(fs.readFileSync(FACIT7, 'utf8'));
  const booking = loadBundleEntry('samtycke_bokning_2d');
  const cooling = loadBundleEntry('samtycke_angerratt');

  const betanketidHtml = extractBetanketidBlocks(facit7).map(renderFacitBlock).join('\n        ');
  const bookingHtml = letterTextToBlocks(booking.letterText)
    .map(renderFacitBlock)
    .join('\n        ');
  const coolingTitle = cooling.agreementBlocks.find((b) => b.kind === 'title');
  const coolingHtml = cooling.agreementBlocks
    .filter((b) => b.kind !== 'title')
    .map(renderFacitBlock)
    .join('\n        ');

  const bodyInner = `${renderPageHeader({
    title: 'Betänketid & Samtycke',
    step: 6,
    subtitle: 'Hair TP Clinic',
    logo,
  })}

    <div class="page-content">
      <div class="section-block" data-registry-id="betanketid_2d">
        <div class="section-title">Betänketid (2 dagar)</div>
        ${betanketidHtml}
      </div>

      <div class="section-block" data-registry-id="samtycke_bokning_2d">
        ${bookingHtml}
        <div class="checkbox-group">
          ${renderAckCheckbox(
            'Jag har tagit del av och godkänner Hair TP Clinics fullständiga boknings- och avbokningsvillkor',
            'booking-ack'
          )}
        </div>
      </div>

      <div class="section-block" data-registry-id="samtycke_angerratt">
        <div class="section-title">${coolingTitle ? coolingTitle.html : 'Ångerfrist'}</div>
        ${coolingHtml}
        <div class="checkbox-group">
          ${renderAckCheckbox(cooling.ackLabel, 'cooling-ack')}
        </div>
      </div>

      ${renderActions('Signera &amp; skicka', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: 'Steg 6 — Betänketid & Samtycke | Hair TP Clinic',
    headComment:
      '<!-- source: hairtp-document-content-bundle.json + steg7-tp-dhi-agreement-facit.json -->',
    bodyInner,
  });
}

const html = buildHtml();
writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '— betänketid + samtycke_bokning_2d + samtycke_angerratt');
