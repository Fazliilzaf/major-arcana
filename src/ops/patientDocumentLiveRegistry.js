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

module.exports = {
  PREVIEW_ROOT,
  OFFERT_SLUG,
  STATIC_HTML_BY_REGISTRY,
  normalizePhase,
  resolveLiveDocumentRelativePath,
  resolveLiveDocumentAbsolutePath,
  liveDocumentExists,
  listLiveRegistryIds,
  buildLiveDocumentPath,
  buildLiveManifest,
};
