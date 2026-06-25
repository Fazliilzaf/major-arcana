'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PREVIEW_ROOT = path.join(ROOT, 'public/major-arcana-preview');
const CATALOG_PATH = path.join(ROOT, 'src/ops/hairtp-document-types.catalog.json');

const OFFERT_SLUG = Object.freeze({
  offert_tp: 'tp',
  offert_prp_hair: 'prp-hair',
  offert_prp_skin: 'prp-skin',
  offert_microneedling: 'microneedling',
  offert_prf: 'prf',
  offert_profilo: 'profilo',
});

/** E9 — staff-fyllda dokument (BOOKOFF B16–B24). */
const STAFF_LIVE_REGISTRY_IDS = Object.freeze([
  'journal_tp',
  'journal_tp_post_prp',
  'journal_tp_follow_4',
  'journal_tp_follow_6',
  'journal_tp_follow_12',
  'journal_prp_multi',
  'behandlingsplan_staff',
  'konsultationsmall',
  'ordination_tp',
]);

/** @type {Record<string, string>} */
const STATIC_HTML_BY_REGISTRY = Object.freeze({
  haelso_tp_sve: 'steg3-halsodeklaration-final-demo.html',
  health_tp_eng: 'steg3-health-questionnaire-eng-final-demo.html',
  friskfoers_tp: 'steg8-friskforsakran-final.html',
  samtycke_bokning_2d: 'steg6-betanketid-samtycke-final-demo.html',
  samtycke_angerratt: 'steg6-betanketid-samtycke-final-demo.html',
  prp_hair_info_sve: 'steg4-prp-hair-info-sve-final-demo.html',
  prp_hair_info_eng: 'steg4-prp-hair-info-eng-final-demo.html',
  microneedling_info: 'steg4-microneedling-info-sve-final-demo.html',
  foto_samtycke: 'steg9-foto-samtycke-final-demo.html',
  journal_tp: 'steg8-journal-tp-final-demo.html',
  journal_tp_post_prp: 'steg8-journal-tp-post-prp-final-demo.html',
  journal_tp_follow_4: 'steg8-journal-tp-follow-4-final-demo.html',
  journal_tp_follow_6: 'steg8-journal-tp-follow-6-final-demo.html',
  journal_tp_follow_12: 'steg8-journal-tp-follow-12-final-demo.html',
  journal_prp_multi: 'steg8-journal-prp-multi-final-demo.html',
  behandlingsplan_staff: 'steg5-behandlingsplan-staff-final-demo.html',
  konsultationsmall: 'steg4-konsultationsmall-final-demo.html',
  ordination_tp: 'steg8-ordination-tp-final-demo.html',
  anteckningar_kort: 'staff-anteckningar-kort-final-demo.html',
  id_verifiering: 'steg4-id-verifiering-final-demo.html',
  info_offert_tp: 'steg5-info-offert-tp-final-demo.html',
  auto_bokningsbekraftelse: 'steg2-auto-bokningsbekraftelse-final-demo.html',
  auto_bokningspaminnelse: 'auto-bokningspaminnelse-final-demo.html',
  auto_avbokningsbekraftelse: 'auto-avbokningsbekraftelse-final-demo.html',
  auto_instruktion_formular: 'steg3-auto-instruktion-formular-final-demo.html',
  auto_betanketid: 'steg6-auto-betanketid-final-demo.html',
  auto_medical_finance: 'auto-medical-finance-final-demo.html',
  auto_integritet: 'auto-integritet-final-demo.html',
  fore_efter_bildmall: 'steg8-fore-efter-bildmall-final-demo.html',
  auto_internt_sms: 'staff-auto-internt-sms-final-demo.html',
});

function normalizePhase(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (n === 5 || n === 7) return n;
  return 7;
}

function resolveOffertHtmlFile(registryId, phase) {
  const slug = OFFERT_SLUG[registryId];
  if (!slug) return null;
  const p = normalizePhase(phase);
  if (registryId === 'offert_tp' && p === 7) {
    return 'steg7-v6-kundkort-final-demo.html';
  }
  if (p === 5) return `steg5-offert-${slug}-final-demo.html`;
  return `steg7-offert-${slug}-final-demo.html`;
}

function resolveLiveDocumentRelativePath(registryId, options = {}) {
  const id = String(registryId || '').trim();
  if (!id) return null;
  if (OFFERT_SLUG[id]) return resolveOffertHtmlFile(id, options.phase);
  return STATIC_HTML_BY_REGISTRY[id] || null;
}

function resolveLiveDocumentAbsolutePath(registryId, options = {}) {
  const rel = resolveLiveDocumentRelativePath(registryId, options);
  if (!rel) return null;
  return path.join(PREVIEW_ROOT, rel);
}

function liveDocumentExists(registryId, options = {}) {
  const abs = resolveLiveDocumentAbsolutePath(registryId, options);
  if (!abs) return false;
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function listLiveRegistryIds() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return (catalog.types || []).map((t) => t.id).filter(Boolean);
}

function isStaffLiveRegistry(registryId) {
  return STAFF_LIVE_REGISTRY_IDS.includes(String(registryId || '').trim());
}

function listStaffLiveRegistryIds() {
  return [...STAFF_LIVE_REGISTRY_IDS];
}

function buildLiveDocumentPath(registryId, options = {}) {
  const id = String(registryId || '').trim();
  if (!id) return '';
  let url = `/major-arcana-preview/patient-doc/${encodeURIComponent(id)}`;
  if (OFFERT_SLUG[id]) {
    const phase = normalizePhase(options.phase);
    url += `?phase=${phase}`;
  }
  const patientId = String(options.patientId || '').trim();
  if (patientId) {
    url += url.includes('?') ? '&' : '?';
    url += `patientId=${encodeURIComponent(patientId)}`;
  }
  return url;
}

function buildLiveManifest() {
  return listLiveRegistryIds().map((registryId) => {
    const phase5 = OFFERT_SLUG[registryId] ? liveDocumentExists(registryId, { phase: 5 }) : null;
    const phase7 = OFFERT_SLUG[registryId] ? liveDocumentExists(registryId, { phase: 7 }) : null;
    const exists = OFFERT_SLUG[registryId]
      ? Boolean(phase5 && phase7)
      : liveDocumentExists(registryId);
    return {
      registryId,
      livePath: buildLiveDocumentPath(registryId, { phase: 7 }),
      htmlFile: resolveLiveDocumentRelativePath(registryId, { phase: 7 }),
      exists,
      audience: isStaffLiveRegistry(registryId) ? 'staff' : 'patient',
      ...(OFFERT_SLUG[registryId]
        ? {
            phases: {
              5: resolveLiveDocumentRelativePath(registryId, { phase: 5 }),
              7: resolveLiveDocumentRelativePath(registryId, { phase: 7 }),
            },
          }
        : {}),
    };
  });
}

function renderPatientDocDevIndexHtml(options = {}) {
  const shellHash = String(options.shellHash || 'e8');
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const labels = new Map((catalog.types || []).map((t) => [t.id, t.name || t.id]));
  const numbers = new Map((catalog.types || []).map((t) => [t.id, t.number || '']));
  const manifest = buildLiveManifest().sort((a, b) =>
    String(numbers.get(a.registryId)).localeCompare(String(numbers.get(b.registryId)), 'sv', {
      numeric: true,
    })
  );

  const rows = manifest
    .map((row) => {
      const label = labels.get(row.registryId) || row.registryId;
      const num = numbers.get(row.registryId);
      const badge = row.audience === 'staff' ? 'Personal' : 'Patient';
      const phaseLinks = row.phases
        ? `<a href="/major-arcana-preview/patient-doc/${encodeURIComponent(row.registryId)}?phase=5">steg 5</a> · <a href="/major-arcana-preview/patient-doc/${encodeURIComponent(row.registryId)}?phase=7">steg 7</a>`
        : `<a href="${row.livePath}">live</a>`;
      return `<tr><td>${num}</td><td><code>${row.registryId}</code></td><td>${label}</td><td>${badge}</td><td>${phaseLinks}</td><td><code>${row.htmlFile || '—'}</code></td></tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CCO patient-doc dev-index · 36 typer</title>
  <link rel="stylesheet" href="./patient-document-shell.css" />
  <style>
    body{font-family:Inter,system-ui,sans-serif;background:#faf6f2;color:#2b251f;padding:24px}
    .patient-doc-dev-index{max-width:1100px;margin:0 auto}
    h1{font-size:28px;margin:0 0 8px}
    p.meta{color:#8a8174;margin:0 0 24px}
    table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.82);border-radius:16px;overflow:hidden}
    th,td{padding:12px 14px;border-bottom:1px solid rgba(120,105,90,.16);text-align:left;vertical-align:top;font-size:14px}
    th{background:rgba(245,232,216,.6);font-weight:650}
    a{color:#2b251f}
    code{font-size:12px}
  </style>
</head>
<body class="patient-doc-dev-index">
  <h1>Patient-doc dev-index (E5)</h1>
  <p class="meta">${manifest.length} registryId · shell <code>patient-document-shell.js</code> · manifest <a href="/api/v1/cco/patient-documents/live/manifest">JSON</a></p>
  <table>
    <thead><tr><th>#</th><th>registryId</th><th>Namn</th><th>Publik</th><th>Länkar</th><th>demo HTML</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <script src="./app/patient-document-shell.js?v=${shellHash}"></script>
</body>
</html>`;
}

module.exports = {
  PREVIEW_ROOT,
  OFFERT_SLUG,
  STAFF_LIVE_REGISTRY_IDS,
  STATIC_HTML_BY_REGISTRY,
  normalizePhase,
  resolveLiveDocumentRelativePath,
  resolveLiveDocumentAbsolutePath,
  liveDocumentExists,
  listLiveRegistryIds,
  listStaffLiveRegistryIds,
  isStaffLiveRegistry,
  buildLiveDocumentPath,
  buildLiveManifest,
  renderPatientDocDevIndexHtml,
};
