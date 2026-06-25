'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  escapeHtml,
  loadShellCss,
  assertNoBannedColors,
  extractLogoSvg,
  renderFacitBlock,
  substituteDemoMergeFields,
} = require('./patient-document-build-lib');

const BUNDLE_PATH = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const INFO_SHELL_CSS = path.join(ROOT, 'public/major-arcana-preview/info-document-shell.css');

function loadInfoShellCss() {
  return fs.readFileSync(INFO_SHELL_CSS, 'utf8');
}

function loadBundleInformationEntry(registryId) {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  const entry = (bundle.information || []).find((d) => d.registryId === registryId);
  if (!entry) throw new Error(`Bundle information saknar ${registryId}`);
  return entry;
}

function substituteInfoMergeFields(text) {
  return substituteDemoMergeFields(String(text || ''))
    .replace(/\{\{firstName\}\}/g, 'Anna')
    .replace(/\{\{bookingDate\}\}/g, '15 juni 2026')
    .replace(/\{\{bookingStartTime\}\}/g, '09:00')
    .replace(/\{\{serviceName\}\}/g, 'Hårtransplantation — konsultation')
    .replace(/\{\{bookingSpecialRequest\}\}/g, '—')
    .replace(/\{\{clinicLocation\}\}/g, 'Hair TP Clinic, Vasaplatsen 2')
    .replace(/\{\{originalDate\}\}/g, '15 juni 2026 kl. 09:00')
    .replace(/\{\{consultationDate\}\}/g, '15 juni 2026')
    .replace(/\{\{practitioner\}\}/g, 'Dr. Behandlare')
    .replace(/\{\{[^}]+\}\}/g, '—');
}

function renderInfoPre(text) {
  if (!text) return '';
  return `<pre class="info-pre">${escapeHtml(substituteInfoMergeFields(text))}</pre>`;
}

function renderInfoSection(title, innerHtml) {
  if (!innerHtml) return '';
  return `<div class="section-block info-scroll">
      <div class="section-title">${escapeHtml(title)}</div>
      ${innerHtml}
    </div>`;
}

function renderInfoPageHeader({
  title,
  step,
  total = 9,
  subtitle,
  logo,
  stepBadge,
  kind = 'Auto',
}) {
  const pct = step > 0 ? ((step / total) * 100).toFixed(2) : '0.00';
  const badge = stepBadge || (step > 0 ? `${step} av ${total}` : 'Auto');
  return `<div class="page-header">
      ${logo}
      <div class="header-content">
        <div class="header-top">
          <h1 class="header-title">${escapeHtml(title)}</h1>
          <div class="header-badges">
            <span class="header-badge header-badge--auto">${escapeHtml(kind)}</span>
            <span class="header-badge">${escapeHtml(badge)}</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <p class="header-subtitle">${escapeHtml(subtitle)}</p>
          ${step > 0 ? `<div style="font-size:10px;font-weight:700;color:var(--t3);">Steg ${step}</div>` : ''}
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
}

function wrapInfoDocument({ title, headComment, bodyInner }) {
  const css = [loadShellCss(), loadInfoShellCss()].join('\n');
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  ${headComment}
  <!-- design: info-document-shell.css + patient-document-shell.css -->
  <style>
${css}
  </style>
</head>
<body>
  <div class="page-wrapper">
${bodyInner}
  </div>
</body>
</html>`;
}

function assertNoMeridiqInInfoText(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const textOnly = noComments.replace(/<[^>]+>/g, ' ');
  if (/Meridiq/i.test(textOnly)) {
    throw new Error('Meridiq får inte synas i info-synlig HTML');
  }
}

function assertNoNavLinks(html) {
  if (/<a\s[^>]*href=/i.test(html)) {
    throw new Error('Info-dokument får inte innehålla navigationslänkar');
  }
}

function writeInfoDocument(outPath, html) {
  assertNoBannedColors(html);
  assertNoMeridiqInInfoText(html);
  assertNoNavLinks(html);
  fs.writeFileSync(outPath, html);
}

function buildSmsEmailSections(content) {
  const parts = [];
  if (content.smsText) {
    parts.push(
      renderInfoSection(
        'SMS',
        `<p class="info-channel-label">Kanal · SMS</p>${renderInfoPre(content.smsText)}`
      )
    );
  }
  if (content.emailSample?.subject) {
    parts.push(
      renderInfoSection(
        'E-post · ämnesrad',
        `<p class="doc-text"><strong>${escapeHtml(substituteInfoMergeFields(content.emailSample.subject))}</strong></p>`
      )
    );
  }
  if (content.emailSample?.text) {
    parts.push(
      renderInfoSection(
        'E-post · brödtext',
        `<p class="info-channel-label">Kanal · e-post (exempel)</p>${renderInfoPre(content.emailSample.text)}`
      )
    );
  }
  if (content.emailBody) {
    parts.push(
      renderInfoSection(
        'E-post · mall',
        `<p class="info-channel-label">Kanal · e-post</p>${renderInfoPre(content.emailBody)}`
      )
    );
  }
  return parts.join('\n');
}

function buildInfoDocumentHtml({
  registryId,
  sourceComment,
  headerTitle,
  pageTitle,
  subtitle,
  step = 0,
  stepBadge,
  kind = 'Auto',
  bodySectionsHtml,
  footnote = 'Read-only · skickas automatiskt av CCO',
}) {
  const logo = extractLogoSvg();
  const bodyInner = `${renderInfoPageHeader({
    title: headerTitle,
    step,
    subtitle,
    logo,
    stepBadge,
    kind,
  })}

    <div class="page-content" data-registry-id="${escapeHtml(registryId)}">
${bodySectionsHtml}
      <p class="info-readonly-note">${escapeHtml(footnote)}</p>
    </div>`;

  return wrapInfoDocument({
    title: pageTitle,
    headComment: sourceComment,
    bodyInner,
  });
}

module.exports = {
  ROOT,
  escapeHtml,
  loadBundleInformationEntry,
  substituteInfoMergeFields,
  renderInfoPre,
  renderInfoSection,
  renderFacitBlock,
  buildSmsEmailSections,
  buildInfoDocumentHtml,
  writeInfoDocument,
};
