'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT: PATIENT_ROOT,
  escapeHtml,
  loadShellCss,
  assertNoBannedColors,
  extractLogoSvg,
  renderYesNoBlock,
  renderActions,
  YES_NO_SCRIPT,
} = require('./patient-document-build-lib');

const ROOT = PATIENT_ROOT;

const STAFF_SHELL_CSS = path.join(ROOT, 'public/cco-staff-shell.css');
const STAFF_DOC_SHELL_CSS = path.join(ROOT, 'public/major-arcana-preview/staff-document-shell.css');
const JOURNAL_SCHEMA_CATALOG = path.join(ROOT, 'migration/meridiq/journal-schema-catalog.json');
const BUNDLE_PATH = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const JOURNAL_TEXT_TEMPLATES = path.join(ROOT, 'migration/journal-text-templates.json');

function loadStaffShellCss() {
  return fs.readFileSync(STAFF_SHELL_CSS, 'utf8');
}

function loadStaffDocShellCss() {
  return fs.readFileSync(STAFF_DOC_SHELL_CSS, 'utf8');
}

function loadJournalSchema(schemaId) {
  const catalog = JSON.parse(fs.readFileSync(JOURNAL_SCHEMA_CATALOG, 'utf8'));
  const schema = catalog.schemas.find((s) => s.schemaId === schemaId);
  if (!schema) throw new Error(`Schema saknas: ${schemaId}`);
  return schema;
}

function renderStaffStaticTopbar(contextLabel = 'Personal · Op-dag') {
  return `<div class="cco-top-nav cco-top-nav--static" aria-label="CCO personal">
      <span class="cco-brand">CCO</span>
      <span class="cco-spacer">${escapeHtml(contextLabel)}</span>
    </div>`;
}

function renderStaffPageHeader({
  title,
  step,
  total = 9,
  subtitle,
  logo,
  stepBadge,
  staffBadge = 'Personal',
}) {
  const pct = step > 0 ? ((step / total) * 100).toFixed(2) : '0.00';
  const badge = stepBadge || (step > 0 ? `${step} av ${total}` : 'Referens');
  const staffBadgeClass = staffBadge === 'Intern' ? 'header-badge--intern' : 'header-badge--staff';
  return `<div class="page-header">
      ${logo}
      <div class="header-content">
        <div class="header-top">
          <h1 class="header-title">${escapeHtml(title)}</h1>
          <div class="header-badges">
            <span class="header-badge ${staffBadgeClass}">${escapeHtml(staffBadge)}</span>
            <span class="header-badge">${escapeHtml(badge)}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="header-subtitle">${escapeHtml(subtitle)}</p>
          ${step > 0 ? `<div style="font-size:10px;font-weight:700;color:var(--t3);">Steg ${step}</div>` : ''}
        </div>
        ${step > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
      </div>
    </div>`;
}

function renderStaffMetaBlock() {
  return `<div class="section-block staff-meta">
      <div class="section-title">Besök &amp; patient</div>
      <div class="field-row">
        <div class="field"><label for="staff-patient">Patient</label><input id="staff-patient" type="text" value="Anna Demo" readonly /></div>
        <div class="field"><label for="staff-pnr">Personnummer</label><input id="staff-pnr" type="text" value="19850312-XXXX" readonly /></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="staff-datum">Behandlingsdag</label><input id="staff-datum" type="date" /></div>
        <div class="field"><label for="staff-behandlare">Behandlare</label><input id="staff-behandlare" type="text" placeholder="Namn" /></div>
      </div>
    </div>`;
}

function renderJournalField(field) {
  const id = field.meridiqQuestionId;
  const label = escapeHtml(field.label);
  const wrapStart = `<div class="journal-field" data-field-key="${escapeHtml(field.key)}" data-meridiq-id="${id}">`;
  const wrapEnd = '</div>';

  if (field.type === 'tristate') {
    return `${wrapStart}
        <p class="doc-text question-label"><strong>${label}</strong></p>
        ${renderYesNoBlock(id, false)}
      ${wrapEnd}`;
  }

  if (field.type === 'yes_no_textbox') {
    return `${wrapStart}
        <p class="doc-text question-label"><strong>${label}</strong></p>
        ${renderYesNoBlock(id, false)}
      ${wrapEnd}`;
  }

  if (field.type === 'text' || field.type === 'time') {
    const inputType = field.type === 'time' ? 'time' : 'text';
    return `${wrapStart}
        <div class="field">
          <label for="jf-${field.key}">${label}</label>
          <input id="jf-${field.key}" type="${inputType}" data-field-key="${escapeHtml(field.key)}" />
        </div>
      ${wrapEnd}`;
  }

  if (field.type === 'textarea') {
    return `${wrapStart}
        <div class="field">
          <label for="jf-${field.key}">${label}</label>
          <textarea id="jf-${field.key}" rows="3" data-field-key="${escapeHtml(field.key)}"></textarea>
        </div>
      ${wrapEnd}`;
  }

  if (field.type === 'select' && Array.isArray(field.options)) {
    const opts = field.options
      .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
      .join('\n            ');
    return `${wrapStart}
        <div class="field">
          <label for="jf-${field.key}">${label}</label>
          <select id="jf-${field.key}" data-field-key="${escapeHtml(field.key)}">
            <option value="">— Välj —</option>
            ${opts}
          </select>
        </div>
      ${wrapEnd}`;
  }

  if (field.type === 'checkboxes' && Array.isArray(field.options)) {
    const items = field.options
      .map(
        (o, i) => `<label class="check-item">
            <input type="checkbox" data-field-key="${escapeHtml(field.key)}" data-option-index="${i}" value="${escapeHtml(o)}" />
            <span>${escapeHtml(o)}</span>
          </label>`
      )
      .join('\n          ');
    return `${wrapStart}
        <p class="doc-text question-label"><strong>${label}</strong></p>
        <div class="checkbox-group">${items}
        </div>
      ${wrapEnd}`;
  }

  return `${wrapStart}<p class="doc-text">Okänd fälttyp: ${escapeHtml(field.type)}</p>${wrapEnd}`;
}

function renderJournalSection(section) {
  const fieldsHtml = section.fields.map(renderJournalField).join('\n');
  return `<div class="section-block journal-section">
      <div class="section-title">${escapeHtml(section.title)}</div>
${fieldsHtml}
    </div>`;
}

function countJournalFields(schema) {
  return schema.sections.reduce((n, s) => n + s.fields.length, 0);
}

function buildStaffJournalHtml({
  registryId,
  schemaId,
  meridiqId,
  headerTitle,
  pageTitle,
  subtitle,
  contextLabel = 'Personal · Op-dag',
  step = 8,
  stepTotal = 9,
  stepBadge,
  logo = extractLogoSvg(),
}) {
  const schema = loadJournalSchema(schemaId);
  const fieldCount = countJournalFields(schema);
  const sectionsHtml = schema.sections.map(renderJournalSection).join('\n');

  const bodyInner = `${renderStaffPageHeader({
    title: headerTitle,
    step,
    total: stepTotal,
    subtitle,
    logo,
    stepBadge,
  })}

    <div class="page-content" data-registry-id="${escapeHtml(registryId)}">
      ${renderStaffMetaBlock()}

      <div class="section-block">
        <div class="section-title">Behandlingsjournal · ${fieldCount} fält</div>
        <p class="doc-text">Fyll i alla obligatoriska fält före signering.</p>
      </div>

${sectionsHtml}

      ${renderActions('Signera &amp; lås journal', 'Spara utkast')}
    </div>`;

  return {
    html: wrapStaffDocument({
      title: pageTitle,
      headComment: `<!-- source: migration/meridiq/journal-schema-catalog.json ${schemaId} (MQ ${meridiqId}) -->`,
      bodyInner,
      contextLabel,
    }),
    fieldCount,
    sectionCount: schema.sections.length,
  };
}

function loadBundleInformationEntry(registryId) {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  const entry = (bundle.information || []).find((d) => d.registryId === registryId);
  if (!entry) throw new Error(`Bundle information saknar ${registryId}`);
  return entry;
}

function renderStaffRefTable(headers, rows) {
  const head = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map(
      (cells) => `<tr>${cells.map((c) => `<td>${escapeHtml(String(c ?? '—'))}</td>`).join('')}</tr>`
    )
    .join('\n          ');
  return `<table class="staff-ref-table">
        <thead><tr>${head}</tr></thead>
        <tbody>
          ${body}
        </tbody>
      </table>`;
}

function renderStaffPre(text) {
  if (!text) return '';
  return `<pre class="staff-ref-pre">${escapeHtml(String(text))}</pre>`;
}

function buildStaffReadonlyReferenceHtml({
  registryId,
  sourceComment,
  headerTitle,
  pageTitle,
  subtitle,
  contextLabel = 'Personal · Op-dag',
  step = 0,
  stepTotal = 9,
  stepBadge,
  staffBadge = 'Personal',
  bodySectionsHtml,
  footnote = 'Read-only referens · ingen signering',
  logo = extractLogoSvg(),
}) {
  const bodyInner = `${renderStaffPageHeader({
    title: headerTitle,
    step,
    total: stepTotal,
    subtitle,
    logo,
    stepBadge,
    staffBadge,
  })}

    <div class="page-content" data-registry-id="${escapeHtml(registryId)}">
${bodySectionsHtml}
      <p class="staff-readonly-note">${escapeHtml(footnote)}</p>
    </div>`;

  return wrapStaffDocument({
    title: pageTitle,
    headComment: sourceComment,
    bodyInner,
    contextLabel,
    includeYesNoScript: false,
  });
}

function loadBundleStaffEntry(registryId) {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  const entry = bundle.staffFilled.find((d) => d.registryId === registryId);
  if (!entry) throw new Error(`Bundle saknar staff ${registryId}`);
  return entry;
}

function loadJournalTextTemplate(templateId) {
  const catalog = JSON.parse(fs.readFileSync(JOURNAL_TEXT_TEMPLATES, 'utf8'));
  const hit = catalog.templates.find((t) => t.id === templateId);
  if (!hit) throw new Error(`journal-text-templates saknar ${templateId}`);
  return hit.text;
}

function renderStaffFormField({
  key,
  label,
  type = 'text',
  options,
  placeholder,
  rows = 3,
  value = '',
}) {
  const id = `sf-${key}`;
  const lbl = escapeHtml(label);
  if (type === 'select') {
    const opts = (options || [])
      .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
      .join('\n            ');
    return `<div class="field"><label for="${id}">${lbl}</label><select id="${id}" data-field-key="${escapeHtml(key)}"><option value="">— Välj —</option>
            ${opts}
          </select></div>`;
  }
  if (type === 'textarea') {
    return `<div class="field"><label for="${id}">${lbl}</label><textarea id="${id}" rows="${rows}" data-field-key="${escapeHtml(key)}" placeholder="${escapeHtml(placeholder || '')}">${escapeHtml(value)}</textarea></div>`;
  }
  return `<div class="field"><label for="${id}">${lbl}</label><input id="${id}" type="${type}" data-field-key="${escapeHtml(key)}" placeholder="${escapeHtml(placeholder || '')}" value="${escapeHtml(value)}" /></div>`;
}

function renderStaffYesNoField({ key, label }) {
  return `<div class="journal-field">
        <p class="doc-text question-label"><strong>${escapeHtml(label)}</strong></p>
        ${renderYesNoBlock(key, false)}
      </div>`;
}

function renderStaffCheckboxGroup({ key, label, options }) {
  const items = (options || [])
    .map(
      (option) => `<label class="check-item">
            <input type="checkbox" data-field-key="${escapeHtml(key)}" value="${escapeHtml(option)}" />
            <span>${escapeHtml(option)}</span>
          </label>`
    )
    .join('\n          ');
  return `<div class="journal-field">
        <p class="doc-text question-label"><strong>${escapeHtml(label)}</strong></p>
        <div class="checkbox-group">${items}
        </div>
      </div>`;
}

function buildStaffTemplateHtml({
  registryId,
  sourceComment,
  headerTitle,
  pageTitle,
  subtitle,
  contextLabel = 'Personal · Op-dag',
  step = 8,
  stepTotal = 9,
  stepBadge,
  sectionTitle,
  introText,
  noteText,
  fieldsHtml,
  primaryAction = 'Signera &amp; lås',
  ghostAction = 'Spara utkast',
  includeMeta = true,
  logo = extractLogoSvg(),
}) {
  const introBlock = introText
    ? `<div class="section-block">
        <p class="doc-text">${escapeHtml(introText)}</p>
        ${noteText ? `<p class="doc-text source-note">${escapeHtml(noteText)}</p>` : ''}
      </div>`
    : noteText
      ? `<div class="section-block"><p class="doc-text source-note">${escapeHtml(noteText)}</p></div>`
      : '';

  const bodyInner = `${renderStaffPageHeader({
    title: headerTitle,
    step,
    total: stepTotal,
    subtitle,
    logo,
    stepBadge,
  })}

    <div class="page-content" data-registry-id="${escapeHtml(registryId)}">
      ${includeMeta ? renderStaffMetaBlock() : ''}
      ${introBlock}
      <div class="section-block">
        <div class="section-title">${escapeHtml(sectionTitle)}</div>
${fieldsHtml}
      </div>
      ${renderActions(primaryAction, ghostAction)}
    </div>`;

  return wrapStaffDocument({
    title: pageTitle,
    headComment: sourceComment,
    bodyInner,
    contextLabel,
  });
}

function wrapStaffDocument({
  title,
  headComment,
  bodyInner,
  contextLabel = 'Personal · Op-dag',
  includeYesNoScript = true,
}) {
  const css = [loadStaffShellCss(), loadShellCss(), loadStaffDocShellCss()].join('\n');
  const scriptBlock = includeYesNoScript
    ? `<script>${YES_NO_SCRIPT}
  </script>`
    : '';
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  ${headComment}
  <!-- design: staff-document-shell.css + patient-document-shell.css + cco-staff-shell.css (utan nav-länkar) -->
  <style>
${css}
  </style>
</head>
<body class="cco-shell" data-cco-shell="staff">
${renderStaffStaticTopbar(contextLabel)}
  <div class="page-wrapper staff-doc">
${bodyInner}
  </div>
  ${scriptBlock}
</body>
</html>`;
}

function assertNoMeridiqInStaffText(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const textOnly = noComments.replace(/<[^>]+>/g, ' ');
  if (/Meridiq/i.test(textOnly)) {
    throw new Error('Meridiq får inte synas i staff-synlig HTML');
  }
}

function assertNoNavLinks(html) {
  if (/<a\s[^>]*href=/i.test(html)) {
    throw new Error('Staff-dokument får inte innehålla navigationslänkar');
  }
}

function writeStaffDocument(outPath, html) {
  assertNoBannedColors(html);
  assertNoMeridiqInStaffText(html);
  assertNoNavLinks(html);
  fs.writeFileSync(outPath, html);
}

module.exports = {
  ROOT,
  loadJournalSchema,
  loadBundleStaffEntry,
  loadBundleInformationEntry,
  loadJournalTextTemplate,
  countJournalFields,
  buildStaffJournalHtml,
  buildStaffTemplateHtml,
  buildStaffReadonlyReferenceHtml,
  renderStaffFormField,
  renderStaffYesNoField,
  renderStaffCheckboxGroup,
  renderStaffPageHeader,
  renderStaffMetaBlock,
  renderStaffRefTable,
  renderStaffPre,
  renderJournalSection,
  renderJournalField,
  wrapStaffDocument,
  writeStaffDocument,
  renderActions,
  extractLogoSvg,
};
