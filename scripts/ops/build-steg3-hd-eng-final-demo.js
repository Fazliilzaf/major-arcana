#!/usr/bin/env node
/**
 * Genererar steg3-health-questionnaire-eng-final-demo.html
 * source: migration/meridiq/steg3-health-declaration-eng-facit.json
 *         (Meridiq questionary 14865 — sync via sync-steg3-hd-eng-facit-from-meridiq.js)
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
        <div class="section-title">${escapeHtml(facit.questionsSection.title)}</div>
        <p class="doc-text">${escapeHtml(facit.questionsSection.hint)}</p>
      </div>

${questionHtml}

      ${renderActions(facit.actions.primary, facit.actions.ghost)}
    </div>`;

  return wrapDocument({
    title: 'Step 3 — Health questionnaire | Hair TP Clinic',
    lang: 'en',
    headComment:
      '<!-- source: migration/meridiq/steg3-health-declaration-eng-facit.json (archive 14865) -->',
    bodyInner,
  });
}

const facit = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
const html = buildHtml(facit);
writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '—', facit.questions.length, 'questions (Meridiq 14865)');
