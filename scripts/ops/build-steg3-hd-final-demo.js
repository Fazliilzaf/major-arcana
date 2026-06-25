#!/usr/bin/env node
/**
 * Genererar steg3-halsodeklaration-final-demo.html från Meridiq 16414 + Word-intro/GDPR.
 * source: migration/meridiq/questionary-catalog.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { assertNoMeridiqInPatientText } = require('./patient-document-build-lib');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html');
const SHELL_CSS = path.join(ROOT, 'public/major-arcana-preview/patient-document-shell.css');
const BANNED_COLORS = ['#bd7a18', '#d89636', '#a86812', '#b87318'];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadQuestions() {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'migration/meridiq/questionary-catalog.json'), 'utf8')
  );
  const form = catalog.forms.find((f) => f.apiId === 16414);
  if (!form) throw new Error('Meridiq 16414 saknas');
  return form.questions;
}

function renderYesNoBlock(id, tristate = false) {
  const tristateBtn = tristate
    ? '\n          <button type="button" class="yes-no-btn" data-value="unknown">Vet ej</button>'
    : '';
  const tristateClass = tristate ? ' tristate' : '';
  return `<div class="yes-no-group${tristateClass}" data-field="${id}">
          <button type="button" class="yes-no-btn" data-value="yes">Ja</button>
          <button type="button" class="yes-no-btn" data-value="no">Nej</button>${tristateBtn}
        </div>
        <div class="sub-field" data-followup="${id}" hidden>
          <textarea rows="3" placeholder="Beskriv här…" aria-label="Kompletterande svar"></textarea>
        </div>`;
}

function renderQuestion(q) {
  const id = q.id;
  const label = escapeHtml(q.label);
  const wrapStart = `<div class="section-block question-block" data-meridiq-id="${id}"><p class="doc-text question-label"><strong>${label}</strong></p>`;
  const wrapEnd = '</div>';

  if (id === 450979) {
    return `${wrapStart}\n        ${renderYesNoBlock(id, true)}${wrapEnd}`;
  }

  if (q.type === 'yes_no' || q.type === 'yes_no_textbox') {
    return `${wrapStart}\n        ${renderYesNoBlock(id)}${wrapEnd}`;
  }

  if (q.type === 'input') {
    return `${wrapStart}
        <div class="field">
          <input type="text" inputmode="decimal" data-field="${id}" aria-label="${label}" />
        </div>${wrapEnd}`;
  }

  return `${wrapStart}<p class="doc-text">Okänd typ: ${escapeHtml(q.type)}</p>${wrapEnd}`;
}

function loadShellCss() {
  return fs.readFileSync(SHELL_CSS, 'utf8');
}

function assertNoBannedColors(html) {
  const lower = html.toLowerCase();
  for (const c of BANNED_COLORS) {
    if (lower.includes(c))
      throw new Error(`Förbjuden färg ${c} i genererad HTML — se patient-document-shell.css`);
  }
}

function extractLogoSvg() {
  const existing = fs.readFileSync(OUT, 'utf8');
  const m = existing.match(/<svg class="header-logo"[\s\S]*?<\/svg>/);
  if (!m) throw new Error('Logo SVG saknas i befintlig fil');
  return m[0];
}

function buildHtml(questions) {
  const logo = extractLogoSvg();
  const questionHtml = questions.map(renderQuestion).join('\n');
  const shellCss = loadShellCss();

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Steg 3 — Hälsodeklaration | Hair TP Clinic</title>
  <!-- source: migration/meridiq/questionary-catalog.json apiId 16414 -->
  <!-- intro/gdpr: SharePoint 1. Hälsodeklaration TP, PRP, Microneedling PRF.docx -->
  <!-- design: public/major-arcana-preview/patient-document-shell.css -->
  <style>
${shellCss}
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="page-header">
      ${logo}
      <div class="header-content">
        <div class="header-top">
          <h1 class="header-title">Hälsodeklaration</h1>
          <span class="header-badge">3 av 9</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="header-subtitle">Hair TP Clinic</p>
          <div style="font-size:10px;font-weight:700;color:var(--t3);">Steg 3</div>
        </div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
      </div>
    </div>

    <div class="page-content">
      <div class="section-block">
        <div class="section-title">Inför konsultation</div>
        <p class="doc-text">För att vi ska kunna ge dig en trygg och korrekt rådgivning inför din konsultation ber vi dig att svara på några frågor om din hälsa. Uppgifterna hjälper oss att bedöma vad som passar just dig.</p>
        <p class="doc-text source-note">Används vid konsultationer för PRP (hår &amp; hud), Microneedling PRF och hårtransplantationer.</p>
      </div>

      <div class="section-block">
        <div class="section-title">Personuppgifter</div>
        <div class="field"><label for="fn">Förnamn</label><input id="fn" type="text" autocomplete="given-name" /></div>
        <div class="field"><label for="en">Efternamn</label><input id="en" type="text" autocomplete="family-name" /></div>
        <div class="field"><label for="pnr">Personnummer</label><input id="pnr" type="text" inputmode="numeric" placeholder="ÅÅÅÅMMDD-XXXX" /></div>
        <div class="field"><label for="adr">Adress</label><input id="adr" type="text" autocomplete="street-address" /></div>
        <div class="field-row">
          <div class="field"><label for="postnr">Postnummer</label><input id="postnr" type="text" /></div>
          <div class="field"><label for="ort">Postort</label><input id="ort" type="text" /></div>
        </div>
        <div class="field"><label for="epost">E-postadress</label><input id="epost" type="email" autocomplete="email" /></div>
        <div class="field"><label for="tel">Telefonnummer</label><input id="tel" type="tel" autocomplete="tel" /></div>
      </div>

      <div class="section-block">
        <div class="section-title">Hälsodeklaration · 14 frågor</div>
        <p class="doc-text">Svara på alla frågor.</p>
      </div>

${questionHtml}

      <div class="section-block">
        <div class="section-title">Övrigt</div>
        <div class="field">
          <label for="kontakt">Hur kom du i kontakt med Hair TP Clinic?</label>
          <input id="kontakt" type="text" />
        </div>
        <div class="field">
          <label for="datum">Datum</label>
          <input id="datum" type="date" />
        </div>
      </div>

      <div class="section-block">
        <div class="section-title">Personuppgifter &amp; utskick</div>
        <label class="consent-item">
          <input type="checkbox" id="gdpr-lagring" />
          <span>Jag godkänner att mina uppgifter sparas i Hair TP Clinics system enligt patientdatalagen och GDPR.</span>
        </label>
        <label class="consent-item">
          <input type="checkbox" id="gdpr-mail" />
          <span>Jag ger mitt godkännande till att ta emot utskick på mail från Hair TP Clinic.</span>
        </label>
      </div>

      <div class="section-block">
        <div class="actions">
          <button type="button" class="btn btn-ghost">Spara utkast</button>
          <button type="button" class="btn btn-primary">Signera &amp; skicka</button>
        </div>
      </div>
    </div>
  </div>
  <script>
document.querySelectorAll('.yes-no-group').forEach((group) => {
  group.querySelectorAll('.yes-no-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.yes-no-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const fieldId = group.dataset.field;
      const follow = document.querySelector('[data-followup="' + fieldId + '"]');
      if (follow) {
        const show = btn.dataset.value === 'yes';
        follow.hidden = !show;
        if (!show) {
          const ta = follow.querySelector('textarea');
          if (ta) ta.value = '';
        }
      }
    });
  });
});
  </script>
</body>
</html>
`;
}

const questions = loadQuestions();
const html = buildHtml(questions);
assertNoBannedColors(html);
assertNoMeridiqInPatientText(html);
fs.writeFileSync(OUT, html);
console.log('✓ Skrev', OUT, '—', questions.length, 'Meridiq-frågor');
