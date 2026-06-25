/**
 * Canonical live URLs for patient/staff document shells (BOOKOFF L-kolumn).
 * Route: /major-arcana-preview/patient-doc/{registryId}[?phase=5|7]
 */
(function (global) {
  'use strict';

  const OFFERT_IDS = new Set([
    'offert_tp',
    'offert_prp_hair',
    'offert_prp_skin',
    'offert_microneedling',
    'offert_prf',
    'offert_profilo',
  ]);

  function normalizePhase(value) {
    const n = Number.parseInt(String(value ?? ''), 10);
    if (n === 5 || n === 7) return n;
    return 7;
  }

  function buildUrl(registryId, options = {}) {
    const id = String(registryId || '').trim();
    if (!id) return '';
    let url = `/major-arcana-preview/patient-doc/${encodeURIComponent(id)}`;
    if (OFFERT_IDS.has(id)) {
      url += `?phase=${normalizePhase(options.phase || options.journeyStep)}`;
    }
    const patientId = String(options.patientId || '').trim();
    if (patientId) {
      url += url.includes('?') ? '&' : '?';
      url += `patientId=${encodeURIComponent(patientId)}`;
    }
    return url;
  }

  function stashAuthForLiveNavigation() {
    try {
      const token =
        global.localStorage?.getItem('arcana_admin_token') ||
        global.sessionStorage?.getItem('arcana_admin_token') ||
        '';
      if (token) global.sessionStorage.setItem('arcana_patient_doc_live_token', token);
    } catch {
      /* private mode */
    }
  }

  function open(registryId, options = {}) {
    stashAuthForLiveNavigation();
    const url = buildUrl(registryId, options);
    if (!url) return false;
    global.location.assign(url);
    return true;
  }

  function openInNewTab(registryId, options = {}) {
    stashAuthForLiveNavigation();
    const url = buildUrl(registryId, options);
    if (!url) return false;
    global.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  global.CcoPatientDocumentLive = Object.freeze({
    buildUrl,
    open,
    openInNewTab,
    OFFERT_IDS,
  });
})(typeof window !== 'undefined' ? window : globalThis);
