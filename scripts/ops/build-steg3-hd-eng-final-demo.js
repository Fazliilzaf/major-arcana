#!/usr/bin/env node
/**
 * Genererar steg3-health-questionnaire-eng-final-demo.html
 * source: migration/meridiq/steg3-health-declaration-eng-facit.json
 *         (English translation of Meridiq 16414 — not archive form 14865)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  escapeHtml,
  extractLogoSvg,
  renderPageHeader,
  renderMeridiqQuestion,
  renderActions,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const FACIT = path.join(ROOT, 'migration/meridiq/steg3-health-declaration-eng-facit.json');
const OUT = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-health-questionnaire-eng-final-demo.html'
);
const LOGO_SOURCE = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html'
);

function buildHtml(facit) {
  const logo = extractLogoSvg(LOGO_SOURCE);
  const ui = facit.ui || {};
  const questionHtml = facit.questions.map((q) => renderMeridiqQuestion(q, ui)).join('\n');
  const pd = facit.personalData;

  const bodyInner = `${renderPageHeader({
    title: 'Health questionnaire',
    step: 3,
    subtitle: 'Hair TP Clinic',
    logo,
    lang: 'en',
  })}

    <div class="page-content" data-registry-id="${facit.registryId}">
      <div class="section-block">
        <div class="section-title">${escapeHtml(facit.intro.title)}</div>
        <p class="doc-text">${escapeHtml(facit.intro.body)}</p>
        <p class="doc-text source-note">${escapeHtml(facit.intro.note)}</p>
      </div>

      <div class="section-block">
        <div class="section-title">${escapeHtml(pd.title)}</div>
        <div class="field"><label for="fn">${escapeHtml(pd.firstName)}</label><input id="fn" type="text" autocomplete="given-name" /></div>
        <div class="field"><label for="en">${escapeHtml(pd.lastName)}</label><input id="en" type="text" autocomplete="family-name" /></div>
        <div class="field"><label for="pnr">${escapeHtml(pd.personnummer)}</label><input id="pnr" type="text" inputmode="numeric" placeholder="YYYYMMDD-XXXX" /></div>
        <div class="field"><label for="adr">${escapeHtml(pd.address)}</label><input id="adr" type="text" autocomplete="street-address" /></div>
        <div class="field-row">
          <div class="field"><label for="postnr">${escapeHtml(pd.postalCode)}</label><input id="postnr" type="text" /></div>
          <div class="field"><label for="ort">${escapeHtml(pd.city)}</label><input id="ort" type="text" /></div>
        </div>
        <div class="field"><label for="epost">${escapeHtml(pd.email)}</label><input id="epost" type="email" autocomplete="email" /></div>
        <div class="field"><label for="tel">${escapeHtml(pd.phone)}</label><input id="tel" type="tel" autocomplete="tel" /></div>
      </div>

      <div class="section-block">
        <div class="section-title">${escapeHtml(facit.questionsSection.title)}</div>
        <p class="doc-text">${escapeHtml(facit.questionsSection.hint)}</p>
      </div>

${questionHtml}

      <div class="section-block">
        <div class="section-title">${escapeHtml(facit.other.title)}</div>
        <div class="field">
          <label for="kontakt">${escapeHtml(facit.other.contact)}</label>
          <input id="kontakt" type="text" />
        </div>
        <div class="field">
          <label for="datum">${escapeHtml(facit.other.date)}</label>
          <input id="datum" type="date" />
        </div>
      </div>

      <div class="section-block">
        <div class="section-title">${escapeHtml(facit.gdpr.title)}</div>
        <label class="consent-item">
          <input type="checkbox" id="gdpr-lagring" />
          <span>${escapeHtml(facit.gdpr.storage)}</span>
        </label>
        <label class="consent-item">
          <input type="checkbox" id="gdpr-mail" />
          <span>${escapeHtml(facit.gdpr.email)}</span>
        </label>
      </div>

      ${renderActions(facit.actions.primary, facit.actions.ghost)}
    </div>`;

  return wrapDocument({
    title: 'Step 3 — Health questionnaire | Hair TP Clinic',
    lang: 'en',
    headComment:
      '<!-- source: migration/meridiq/steg3-health-declaration-eng-facit.json (translation of 16414) -->',
    bodyInner,
  });
}

const facit = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
const html = buildHtml(facit);
writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '—', facit.questions.length, 'questions (ENG, from 16414)');
