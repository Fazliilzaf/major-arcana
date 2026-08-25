#!/usr/bin/env node
/**
 * Genererar steg3-halsodeklaration-curatiio-final-demo.html — tvåspråkig (SV/EN).
 * Källa: Meridiq 14866 (SV) + 14865 (EN) — 29 frågor, 1:1-översättning.
 * source: migration/meridiq/questionary-catalog.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  renderMeridiqQuestion,
  renderActions,
  wrapDocument,
  writePatientDocument,
} = require('./patient-document-build-lib');

const OUT = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-halsodeklaration-curatiio-final-demo.html'
);
const CATALOG = path.join(ROOT, 'migration/meridiq/questionary-catalog.json');

function loadForm(apiId) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const form = catalog.forms.find((f) => f.apiId === apiId);
  if (!form) throw new Error('Meridiq ' + apiId + ' saknas i katalogen');
  return form;
}

const svForm = loadForm(14866);
const enForm = loadForm(14865);
if (svForm.questions.length !== enForm.questions.length) {
  throw new Error('SV/EN-formulären har olika antal frågor');
}
const N = svForm.questions.length;

// ── översättningsmap: nyckel -> { sv, en } (rå text, inga HTML-entiteter) ──
const map = {
  title: { sv: 'Hälsodeklaration', en: 'Health Declaration' },
  subtitle: { sv: 'Curatiio', en: 'Curatiio' },
  stepcount: { sv: '3 av 9', en: '3 of 9' },
  steplabel: { sv: 'Steg 3', en: 'Step 3' },
  qcount: { sv: 'Hälsodeklaration · 29 frågor', en: 'Health Declaration · 29 questions' },
  intro: { sv: 'Svara på alla frågor.', en: 'Answer all questions.' },
  yes: { sv: 'Ja', en: 'Yes' },
  no: { sv: 'Nej', en: 'No' },
  describe: { sv: 'Beskriv här…', en: 'Describe here…' },
  followup: { sv: 'Kompletterande svar', en: 'Supplementary answer' },
  date: { sv: 'Datum', en: 'Date' },
  savedraft: { sv: 'Spara utkast', en: 'Save draft' },
  sign: { sv: 'Signera & skicka', en: 'Sign & send' },
};
svForm.questions.forEach((q, i) => {
  map['q' + (i + 1)] = { sv: q.label, en: enForm.questions[i].label };
});

// ── renderar varje SV-fråga och injicerar data-i18n på etiketten ──
const questionHtml = svForm.questions
  .map((q, i) => {
    const key = 'q' + (i + 1);
    const html = renderMeridiqQuestion(q);
    return html.replace(
      /<p class="doc-text question-label"><strong>/,
      '<p class="doc-text question-label"><strong data-i18n="' + key + '">'
    );
  })
  .join('\n');

// ── header (Curatiio-logotyp + data-i18n) ──
const header = `<div class="page-header">
      <img class="header-logo" style="width:96px;height:96px" src="assets/curatiio-logo.png" alt="Curatiio" />
      <div class="header-content">
        <div class="header-top">
          <h1 class="header-title" data-i18n="title">Hälsodeklaration</h1>
          <span class="header-badge" data-i18n="stepcount">3 av 9</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="header-subtitle" data-i18n="subtitle">Curatiio</p>
          <div style="font-size:10px;font-weight:700;color:var(--t3);" data-i18n="steplabel">Steg 3</div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:33.33%"></div></div>
      </div>
    </div>`;

const bodyInner = `${header}

    <div class="page-content">
      <div class="section-block">
        <div class="section-title" data-i18n="qcount">Hälsodeklaration · ${N} frågor</div>
        <p class="doc-text" data-i18n="intro">Svara på alla frågor.</p>
      </div>

${questionHtml}

      <div class="section-block">
        <div class="field">
          <label for="fc-datum" data-i18n="date">Datum</label>
          <input id="fc-datum" type="date" />
        </div>
      </div>

      ${renderActions('Signera &amp; skicka', 'Spara utkast')}
    </div>`;

let html = wrapDocument({
  title: 'Steg 3 — Hälsodeklaration | Curatiio',
  headComment:
    '<!-- source: migration/meridiq/questionary-catalog.json apiId 14866 (SV) / 14865 (EN) -->',
  bodyInner,
});

// ── injicera data-i18n på Ja/Nej, textarea, buttons ──
html = html
  .replace(
    /<button type="button" class="yes-no-btn" data-value="yes">Ja<\/button>/g,
    '<button type="button" class="yes-no-btn" data-value="yes" data-i18n="yes">Ja</button>'
  )
  .replace(
    /<button type="button" class="yes-no-btn" data-value="no">Nej<\/button>/g,
    '<button type="button" class="yes-no-btn" data-value="no" data-i18n="no">Nej</button>'
  )
  .replace(
    /aria-label="Additional details"/g,
    'aria-label="Kompletterande svar" data-i18n-aria="followup"'
  )
  .replace(
    /placeholder="Beskriv här…"/g,
    'placeholder="Beskriv här…" data-i18n-placeholder="describe"'
  )
  .replace(
    /class="btn btn-ghost">Spara utkast<\/button>/,
    'class="btn btn-ghost" data-i18n="savedraft">Spara utkast</button>'
  )
  .replace(
    /class="btn btn-primary">Signera &amp; skicka<\/button>/,
    'class="btn btn-primary" data-i18n="sign">Signera &amp; skicka</button>'
  );

// ── lägg till toggle-CSS i head ──
const TOGGLE_CSS = `<style>
      .lang-toggle {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 99;
        display: flex;
        gap: 4px;
        padding: 4px;
        background: rgba(252, 248, 244, 0.92);
        border: 1px solid rgba(120, 105, 90, 0.16);
        border-radius: 14px;
        box-shadow:
          0 4px 10px rgba(45, 28, 18, 0.12),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
      }
      .lang-toggle button {
        appearance: none;
        border: 0;
        cursor: pointer;
        padding: 6px 14px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        background: transparent;
        color: rgba(70, 60, 50, 0.55);
      }
      .lang-toggle button.active {
        background: var(--pd-primary-bg, linear-gradient(180deg, #4a4036 0%, #2b251f 100%));
        color: var(--pd-primary-text, #fff5e3);
        box-shadow:
          inset 0 1px 0 rgba(255, 240, 220, 0.14),
          0 4px 10px rgba(40, 28, 16, 0.18);
      }
    </style>`;
// ── Curatiio-grön progresslinje (matchar symbolens gröna gradient) ──
const CURATIIO_GREEN = `<style>
      :root { --pd-progress: linear-gradient(90deg, #42a585 0%, #0d6a4f 100%); }
    </style>`;
html = html.replace('</head>', TOGGLE_CSS + CURATIIO_GREEN + '\n</head>');

// ── lägg till toggle-JS innan </body> ──
const TOGGLE_JS = `<script>
      (function () {
        var map = ${JSON.stringify(map, null, 2)};
        function setLang(l) {
          Object.keys(map).forEach(function (k) {
            document.querySelectorAll('[data-i18n="' + k + '"]').forEach(function (el) {
              if (map[k] && map[k][l] != null) el.textContent = map[k][l];
            });
          });
          document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var k = el.getAttribute('data-i18n-placeholder');
            if (map[k] && map[k][l] != null) el.setAttribute('placeholder', map[k][l]);
          });
          document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            var k = el.getAttribute('data-i18n-aria');
            if (map[k] && map[k][l] != null) el.setAttribute('aria-label', map[k][l]);
          });
          document.querySelectorAll('.lang-toggle button').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-lang-btn') === l);
          });
          try {
            localStorage.setItem('cco-lang', l);
          } catch (e) {}
        }
        document.addEventListener('DOMContentLoaded', function () {
          var bar = document.createElement('div');
          bar.className = 'lang-toggle';
          bar.innerHTML =
            '<button type="button" data-lang-btn="sv">SV</button><button type="button" data-lang-btn="en">EN</button>';
          document.body.appendChild(bar);
          bar.querySelectorAll('button').forEach(function (b) {
            b.addEventListener('click', function () {
              setLang(b.getAttribute('data-lang-btn'));
            });
          });
          var saved = 'sv';
          try {
            saved = localStorage.getItem('cco-lang') || 'sv';
          } catch (e) {}
          setLang(saved);
        });
      })();
    </script>`;
html = html.replace('</body>', TOGGLE_JS + '\n</body>');

writePatientDocument(OUT, html);
console.log('✓ Skrev', OUT, '—', N, 'frågor (SV/EN)');
