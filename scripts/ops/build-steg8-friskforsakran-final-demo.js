#!/usr/bin/env node
/**
 * Genererar steg8-friskforsakran-final.html från Meridiq 16413 (13 frågor).
 * source: migration/meridiq/questionary-catalog.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  extractLogoSvg,
  renderPageHeader,
  renderMeridiqQuestion,
  renderActions,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const OUT = path.join(ROOT, 'public/major-arcana-preview/steg8-friskforsakran-final.html');
const CATALOG = path.join(ROOT, 'migration/meridiq/questionary-catalog.json');

function loadQuestions() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const form = catalog.forms.find((f) => f.apiId === 16413);
  if (!form) throw new Error('Meridiq 16413 saknas');
  return form.questions;
}

function buildHtml(questions) {
  const logo = extractLogoSvg();
  const questionHtml = questions.map(renderMeridiqQuestion).join('\n');

  const bodyInner = `${renderPageHeader({
    title: 'Friskförsäkran',
    step: 8,
    subtitle: 'Hair TP Clinic',
    logo,
  })}

    <div class="page-content">
      <div class="section-block">
        <div class="section-title">Friskförsäkran · ${questions.length} frågor</div>
        <p class="doc-text">Svara på alla frågor.</p>
      </div>

${questionHtml}

      <div class="section-block">
        <div class="field">
          <label for="fc-datum">Datum</label>
          <input id="fc-datum" type="date" />
        </div>
      </div>

      ${renderActions('Signera &amp; skicka', 'Spara utkast')}
    </div>`;

  return wrapDocument({
    title: 'Steg 8 — Friskförsäkran | Hair TP Clinic',
    headComment: '<!-- source: migration/meridiq/questionary-catalog.json apiId 16413 -->',
    bodyInner,
  });
}

const questions = loadQuestions();
const html = buildHtml(questions);
writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '—', questions.length, 'Meridiq-frågor');
