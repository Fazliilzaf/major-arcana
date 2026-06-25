'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SHELL_CSS = path.join(ROOT, 'public/major-arcana-preview/patient-document-shell.css');
const LOGO_SOURCE = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html'
);
const BANNED_COLORS = ['#bd7a18', '#d89636', '#a86812', '#b87318'];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadShellCss() {
  return fs.readFileSync(SHELL_CSS, 'utf8');
}

function assertNoBannedColors(html) {
  const lower = html.toLowerCase();
  for (const c of BANNED_COLORS) {
    if (lower.includes(c)) throw new Error(`Förbjuden färg ${c} — se patient-document-shell.css`);
  }
}

function extractLogoSvg(fromPath = LOGO_SOURCE) {
  const existing = fs.readFileSync(fromPath, 'utf8');
  const m = existing.match(/<svg class="header-logo"[\s\S]*?<\/svg>/);
  if (!m) throw new Error('Logo SVG saknas i ' + fromPath);
  return m[0];
}

function renderPageHeader({ title, step, total = 9, subtitle, logo, lang = 'sv' }) {
  const pct = ((step / total) * 100).toFixed(2);
  const stepBadge = lang === 'en' ? `${step} of ${total}` : `${step} av ${total}`;
  return `<div class="page-header">
      ${logo}
      <div class="header-content">
        <div class="header-top">
          <h1 class="header-title">${escapeHtml(title)}</h1>
          <span class="header-badge">${stepBadge}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="header-subtitle">${escapeHtml(subtitle)}</p>
          <div style="font-size:10px;font-weight:700;color:var(--t3);">Steg ${step}</div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
}

function renderYesNoBlock(id, tristate = false, ui = {}) {
  const yes = ui.yes || 'Ja';
  const no = ui.no || 'Nej';
  const unknown = ui.unknown || 'Vet ej';
  const placeholder = ui.placeholder || 'Beskriv här…';
  const tristateBtn = tristate
    ? `\n          <button type="button" class="yes-no-btn" data-value="unknown">${escapeHtml(unknown)}</button>`
    : '';
  const tristateClass = tristate ? ' tristate' : '';
  return `<div class="yes-no-group${tristateClass}" data-field="${id}">
          <button type="button" class="yes-no-btn" data-value="yes">${escapeHtml(yes)}</button>
          <button type="button" class="yes-no-btn" data-value="no">${escapeHtml(no)}</button>${tristateBtn}
        </div>
        <div class="sub-field" data-followup="${id}" hidden>
          <textarea rows="3" placeholder="${escapeHtml(placeholder)}" aria-label="Additional details"></textarea>
        </div>`;
}

function renderMeridiqQuestion(q, ui = {}) {
  const id = q.id;
  const label = escapeHtml(q.label);
  const wrapStart = `<div class="section-block question-block" data-meridiq-id="${id}"><p class="doc-text question-label"><strong>${label}</strong></p>`;
  const wrapEnd = '</div>';
  const tristate = q.tristate === true || id === 450979;

  if (tristate && (q.type === 'yes_no' || q.type === 'yes_no_textbox')) {
    return `${wrapStart}\n        ${renderYesNoBlock(id, true, ui)}${wrapEnd}`;
  }

  if (q.type === 'yes_no' || q.type === 'yes_no_textbox') {
    return `${wrapStart}\n        ${renderYesNoBlock(id, false, ui)}${wrapEnd}`;
  }

  if (q.type === 'input' || q.type === 'textbox') {
    return `${wrapStart}
        <div class="field">
          <input type="text" data-field="${id}" aria-label="${label}" />
        </div>${wrapEnd}`;
  }

  if (q.type === 'select' && Array.isArray(q.options)) {
    const empty = ui.selectEmpty || '— Välj —';
    const opts = q.options
      .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
      .join('\n            ');
    return `${wrapStart}
        <div class="field">
          <select data-field="${id}" aria-label="${label}">
            <option value="">${escapeHtml(empty)}</option>
            ${opts}
          </select>
        </div>${wrapEnd}`;
  }

  if (q.type === 'checkbox' && Array.isArray(q.options)) {
    const items = q.options
      .map(
        (o, i) => `<label class="check-item">
            <input type="checkbox" data-field="${id}" data-option-index="${i}" value="${escapeHtml(o)}" />
            <span>${escapeHtml(o)}</span>
          </label>`
      )
      .join('\n          ');
    return `${wrapStart}
        <div class="checkbox-group">${items}
        </div>${wrapEnd}`;
  }

  return `${wrapStart}<p class="doc-text">Okänd typ: ${escapeHtml(q.type)}</p>${wrapEnd}`;
}

function renderFacitBlock(block) {
  if (isManualSignatureBlock(block)) return '';
  const html = block.html || '';
  if (block.kind === 'title') {
    return `<h2 class="doc-agreement-title">${html}</h2>`;
  }
  if (block.kind === 'heading') {
    return `<h3 class="doc-heading">${escapeHtml(html)}</h3>`;
  }
  return `<p class="doc-text">${html}</p>`;
}

function renderActions(primary = 'Signera &amp; skicka', ghost = 'Spara utkast') {
  return `<div class="section-block">
        <div class="actions">
          <button type="button" class="btn btn-ghost">${ghost}</button>
          <button type="button" class="btn btn-primary">${primary}</button>
        </div>
      </div>`;
}

const YES_NO_SCRIPT = `
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
});`;

function wrapDocument({ title, headComment, bodyInner, lang = 'sv' }) {
  const shellCss = loadShellCss();
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  ${headComment}
  <!-- design: public/major-arcana-preview/patient-document-shell.css -->
  <style>
${shellCss}
  </style>
</head>
<body>
  <div class="page-wrapper">
${bodyInner}
  </div>
  <script>${YES_NO_SCRIPT}
  </script>
</body>
</html>`;
}

function assertNoMeridiqInPatientText(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const textOnly = noComments.replace(/<[^>]+>/g, ' ');
  if (/Meridiq/i.test(textOnly)) {
    throw new Error('Meridiq får inte synas i patient-synlig HTML — endast intern facit i kod');
  }
}

function writePatientDocument(outPath, html) {
  assertNoBannedColors(html);
  assertNoMeridiqInPatientText(html);
  fs.writeFileSync(outPath, html);
}

function renderAckCheckbox(label, id) {
  return `<label class="check-item">
            <input type="checkbox" id="${id}" />
            <span>${escapeHtml(label)}</span>
          </label>`;
}

function letterTextToBlocks(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const blocks = [{ kind: 'title', html: lines[0] }];
  lines.slice(1).forEach((line) => blocks.push({ kind: 'text', html: line }));
  return blocks;
}

function extractBetanketidBlocks(facit7) {
  const out = [];
  let capture = false;
  for (const block of facit7.blocks) {
    if (block.kind === 'heading' && block.html === 'Giltighetstid och betänketid') {
      capture = true;
      out.push(block);
      continue;
    }
    if (capture) {
      if (block.kind === 'heading') break;
      out.push(block);
    }
  }
  return out;
}

const AGREEMENT_HEADINGS = new Set([
  'Behandlingen',
  'Offert',
  'Giltighetstid och betänketid',
  'Betalningsvillkor',
  'Av- och ombokning',
  'Resultat',
  'Ansvar',
  'Ångerrätt',
  'Avtalsbrott och force majeure',
  'Information & samtycke',
  'Tvist',
]);

const OFFERT_ACK_LABEL =
  'Kunden bekräftar att offerten har genomgåtts och diskuterats med Kunden vid konsultation och accepterats innan eller i samband med signering av detta Avtal.';

const DEFAULT_BUNDLE_ACK =
  'Jag godkänner behandlingsavtalet och lämnar särskilt samtycke till behandling innan ångerfristen löpt ut.';

function isManualSignatureBlock(block) {
  const html = String(block?.html || '');
  const plain = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    /Ort och datum/i.test(plain) ||
    /Namnförtydligande/i.test(plain) ||
    /Namnteckning/i.test(plain) ||
    /^_{3,}/.test(plain)
  );
}

function filterManualSignatureBlocks(blocks) {
  return (blocks || []).filter((block) => !isManualSignatureBlock(block));
}

function stripManualSignatureTail(text) {
  const lines = String(text || '').split('\n');
  while (lines.length) {
    const line = lines[lines.length - 1].trim();
    if (!line) {
      lines.pop();
      continue;
    }
    if (
      /^_{3,}/.test(line) ||
      /Ort och datum/i.test(line) ||
      /Namnförtydligande/i.test(line) ||
      /Namnteckning/i.test(line)
    ) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trimEnd();
}

function substituteDemoMergeFields(html) {
  return String(html || '')
    .replace(/\{\{patientName\}\}/g, 'Anna Demo')
    .replace(/\{\{#personnummer\}\}, \{\{personnummer\}\}\{\{\/personnummer\}\}/g, '')
    .replace(
      /\{\{#offerLabel\}\} \(\{\{offerLabel\}\}\)\{\{\/offerLabel\}\}/g,
      ' (Demo-offert HT-2042)'
    )
    .replace(/\{\{[^}]+\}\}/g, '');
}

function agreementPlainTextToBlocks(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const blocks = [{ kind: 'title', html: lines[0] }];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^_{3,}/.test(line)) break;
    if (/Ort och datum|Namnförtydligande|Namnteckning/i.test(line)) break;
    if (AGREEMENT_HEADINGS.has(line)) {
      blocks.push({ kind: 'heading', html: line });
    } else {
      blocks.push({ kind: 'text', html: line });
    }
  }
  return blocks;
}

function extractOffertSectionBlocks(blocks) {
  const out = [];
  let capture = false;
  for (const block of blocks) {
    if (block.kind === 'heading' && block.html === 'Offert') {
      capture = true;
      out.push(block);
      continue;
    }
    if (capture) {
      if (block.kind === 'heading') break;
      out.push(block);
    }
  }
  if (out.length) return out;
  const bilaga = blocks.find(
    (b) => b.kind === 'text' && /bilaga 2|lämnad offert/i.test(b.html || '')
  );
  return bilaga ? [bilaga] : blocks.slice(0, Math.min(4, blocks.length));
}

function renderAgreementBlock(block) {
  const clone = { ...block, html: substituteDemoMergeFields(block.html) };
  return renderFacitBlock(clone);
}

function loadBundleCustomerEntry(bundlePath, registryId) {
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const entry = bundle.customerFilled.find((d) => d.registryId === registryId);
  if (!entry) throw new Error(`Bundle saknar ${registryId}`);
  return entry;
}

const INFO_SECTION_HEADINGS = new Set([
  'Vad du kan förvänta:',
  'Möjliga biverkningar:',
  'What to Expect:',
  'Possible Side-Effects:',
  'About PRP',
  'Safety Information',
  'Benefits',
  'Contraindications',
  'Risks and Complications',
  'Results',
]);

const INFO_ACK_PATTERNS = [
  /^Min signatur bekräftar/i,
  /^Jag tillåter härmed min utövare/i,
  /^I hereby authorize my practitioner/i,
  /^I hereby give my voluntary consent/i,
  /^My consent and authorization/i,
];

function normalizeMeridiqInfoText(text) {
  return String(text || '')
    .replace(/\\'/g, "'")
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function extractInfoAckAndBody(lines) {
  let ackLabel = null;
  const body = [];
  for (const line of lines) {
    if (INFO_ACK_PATTERNS.some((p) => p.test(line))) {
      ackLabel = line;
      continue;
    }
    body.push(line);
  }
  return { body, ackLabel };
}

function infoTextToBlocks(text) {
  const lines = normalizeMeridiqInfoText(text);
  const { body, ackLabel } = extractInfoAckAndBody(lines);
  if (!body.length) return { blocks: [], ackLabel };
  const blocks = [{ kind: 'title', html: body[0] }];
  for (let i = 1; i < body.length; i += 1) {
    const line = body[i];
    const plain = line.replace(/:$/, '');
    if (
      INFO_SECTION_HEADINGS.has(line) ||
      INFO_SECTION_HEADINGS.has(plain) ||
      (line.endsWith(':') && line.length < 80 && !line.includes('.'))
    ) {
      blocks.push({ kind: 'heading', html: plain });
    } else {
      blocks.push({ kind: 'text', html: line });
    }
  }
  return { blocks, ackLabel };
}

module.exports = {
  ROOT,
  BANNED_COLORS,
  escapeHtml,
  loadShellCss,
  assertNoBannedColors,
  extractLogoSvg,
  renderPageHeader,
  renderYesNoBlock,
  renderMeridiqQuestion,
  renderFacitBlock,
  renderActions,
  renderAckCheckbox,
  letterTextToBlocks,
  extractBetanketidBlocks,
  AGREEMENT_HEADINGS,
  OFFERT_ACK_LABEL,
  DEFAULT_BUNDLE_ACK,
  substituteDemoMergeFields,
  isManualSignatureBlock,
  filterManualSignatureBlocks,
  stripManualSignatureTail,
  agreementPlainTextToBlocks,
  extractOffertSectionBlocks,
  renderAgreementBlock,
  loadBundleCustomerEntry,
  infoTextToBlocks,
  normalizeMeridiqInfoText,
  wrapDocument,
  writePatientDocument,
  assertNoMeridiqInPatientText,
  YES_NO_SCRIPT,
};
