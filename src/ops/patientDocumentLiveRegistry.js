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
  offert_botox: 'botox',
  offert_filler: 'filler',
  offert_op: 'op',
  offert_ortopedi: 'ortopedi',
});

/** E9 — staff-fyllda dokument (BOOKOFF B16–B24 + ordination_recept 2026-07-19). */
const STAFF_LIVE_REGISTRY_IDS = Object.freeze([
  'journal_tp',
  'journal_tp_post_prp',
  'journal_tp_follow_4',
  'journal_tp_follow_8',
  'journal_tp_follow_12',
  'journal_prp_multi',
  'behandlingsplan_staff',
  'konsultationsmall',
  'ordination_tp',
  'ordination_recept',
  // ORD-126 estetik-journaler (staff-fyllda).
  'journal_estetik_botox',
  'journal_estetik_filler',
  'journal_estetik_profhilo',
  'journal_estetik_ortopedi',
  'journal_estetik_op',
]);

/**
 * @type {Record<string, string>}
 *
 * VIKTIGT: suffixet "-final-demo.html" är HISTORISKT. Dessa filer är INTE
 * demo/mockups — de är godkända produktionsdokument som används live av
 * patient- och staff-flöden. Byt inte namn eller radera dem utan en stor
 * refactor av alla konsumenter (konversationer, journal, admin, mail).
 */
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
  journal_tp_follow_8: 'steg8-journal-tp-follow-8-final-demo.html',
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
  hyalase_info: 'steg4-hyalase-info-sve-final-demo.html',
  botulinum_info: 'steg4-botulinum-info-final-demo.html',
  ordination_recept: 'steg8-ordination-recept-final-demo.html',
  curatiio_botox_info: 'curatiio-botox-info-final-demo.html',
  curatiio_filler_info: 'curatiio-filler-info-final-demo.html',
  curatiio_ogonlock_info: 'curatiio-ogonlock-info-final-demo.html',
  curatiio_ortoped_info: 'curatiio-ortoped-info-final-demo.html',
  curatiio_prf_hud_info: 'curatiio-prf-hud-info-final-demo.html',
  curatiio_profhilo_info: 'curatiio-profhilo-info-final-demo.html',
  curatiio_prp_hud_mn_info: 'curatiio-prp-hud-mn-info-final-demo.html',
  // ORD-126 estetik-journaler (Curatiio) + friskförsäkran för op.
  journal_estetik_botox: 'steg8-journal-botox-curatiio-final-demo.html',
  journal_estetik_filler: 'steg8-journal-filler-curatiio-final-demo.html',
  journal_estetik_profhilo: 'steg8-journal-profhilo-curatiio-final-demo.html',
  journal_estetik_ortopedi: 'steg8-journal-ortopedi-curatiio-final-demo.html',
  journal_estetik_op: 'steg8-journal-bleph-curatiio-final-demo.html',
  friskfoers_curatiio_op: 'steg8-friskforsakran-final.html',
  // ORD-141 rad 1 (2026-08-30) — för-/eftervård. Filerna ligger i public/ (serveras
  // som patientinformationssidor), inte i PREVIEW_ROOT. Per-rad sökväg via objekt
  // { file, root } — rader med plain string faller tillbaka på PREVIEW_ROOT som i dag.
  // En fil bär två registry-id (förberedelse + eftervård är två tillfällen i samma dokument).
  forberedelse_tp: { file: 'patientinformation-hartransplantation-dhi-prp-minimal.html', root: 'public' },
  eftervard_tp: { file: 'patientinformation-hartransplantation-dhi-prp-minimal.html', root: 'public' },
  forberedelse_curatiio: { file: 'patientinformation-ogonlocksplastik-curatiio.html', root: 'public' },
  eftervard_curatiio: { file: 'patientinformation-ogonlocksplastik-curatiio.html', root: 'public' },
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
  const value = STATIC_HTML_BY_REGISTRY[id];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.file || null;
  return null;
}

// ORD-141 rad 1 — per-rad sökväg. En rad kan bära { file, root: 'public' } för
// filer utanför PREVIEW_ROOT; en plain string (eller root utan värde) faller
// tillbaka på PREVIEW_ROOT som i dag. De 60 befintliga demofilerna rörs inte.
function resolveRegistryRoot(rootHint) {
  return String(rootHint || '').trim().toLowerCase() === 'public'
    ? path.join(ROOT, 'public')
    : PREVIEW_ROOT;
}

function resolveLiveDocumentAbsolutePath(registryId, options = {}) {
  const id = String(registryId || '').trim();
  if (!id) return null;
  if (OFFERT_SLUG[id]) return path.join(PREVIEW_ROOT, resolveOffertHtmlFile(id, options.phase));
  const value = STATIC_HTML_BY_REGISTRY[id];
  if (!value) return null;
  if (typeof value === 'string') return path.join(PREVIEW_ROOT, value);
  return path.join(resolveRegistryRoot(value.root), value.file);
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

/** Pending-varianter (legalReviewStatus: 'pending') är inte live ännu — de får
 *  inte synas i manifestet eller kräva ett demo-HTML förrän de är godkända. */
function isPendingType(type) {
  return String(type?.legalReviewStatus ?? '').trim().toLowerCase() === 'pending';
}

function listLiveRegistryIds() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return (catalog.types || [])
    .filter((type) => !isPendingType(type))
    .map((type) => type.id)
    .filter(Boolean);
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
  isPendingType,
  listLiveRegistryIds,
  listStaffLiveRegistryIds,
  isStaffLiveRegistry,
  buildLiveDocumentPath,
  buildLiveManifest,
  renderPatientDocDevIndexHtml,
};
