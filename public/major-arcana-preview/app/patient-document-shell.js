/**
 * E8 — Patient document live shell: signering + audit + PDF mot CCO API.
 * source: docs/implementation/patient-documents-live/IMPLEMENTATION-CHECKLIST.md D4.2
 */
(function patientDocumentShell(global) {
  'use strict';

  const ADMIN_TOKEN_KEY = 'arcana_admin_token';
  const PASSTHROUGH_KEY = 'arcana_patient_doc_live_token';
  const STATUS_ID = 'arcana-patient-doc-sign-status';
  const BANNER_ID = 'arcana-patient-doc-sign-banner';

  function readBoot() {
    return global.__ARCANA_PATIENT_DOC_LIVE__ || {};
  }

  function readSign() {
    return global.__ARCANA_PATIENT_DOC_SIGN__ || null;
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function setAdminToken(token) {
    const value = normalizeText(token);
    if (!value) return;
    try {
      global.localStorage.setItem(ADMIN_TOKEN_KEY, value);
    } catch {
      try {
        global.sessionStorage.setItem(ADMIN_TOKEN_KEY, value);
      } catch {
        /* private mode */
      }
    }
  }

  function restoreAuthFromOpener() {
    try {
      const passthrough = normalizeText(global.sessionStorage.getItem(PASSTHROUGH_KEY));
      if (passthrough) {
        setAdminToken(passthrough);
        global.sessionStorage.removeItem(PASSTHROUGH_KEY);
      }
    } catch {
      /* private mode */
    }
  }

  async function tryPreviewBootstrapSession() {
    try {
      const response = await fetch(
        new URL('/api/v1/auth/preview-bootstrap-session', global.location.origin),
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        }
      );
      if (!response.ok) return false;
      const payload = await response.json().catch(() => ({}));
      if (!normalizeText(payload?.token)) return false;
      setAdminToken(payload.token);
      return true;
    } catch {
      return false;
    }
  }

  async function ensureAuthReady() {
    restoreAuthFromOpener();
    if (getAdminToken()) return true;
    if (global.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return true;
    return tryPreviewBootstrapSession();
  }

  function getAdminToken() {
    try {
      const local = normalizeText(global.localStorage.getItem(ADMIN_TOKEN_KEY));
      if (local) {
        if (local !== '__preview_local__') return local;
        if (global.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return local;
      }
      const session = normalizeText(global.sessionStorage.getItem(ADMIN_TOKEN_KEY));
      if (session) {
        if (session !== '__preview_local__') return session;
        if (global.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return session;
      }
    } catch {
      /* private mode */
    }
    if (global.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return '__preview_local__';
    return '';
  }

  async function apiRequest(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    };
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const sign = readSign();
    if (sign?.tenantId) headers['x-cco-tenant'] = sign.tenantId;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(new URL(path, global.location.origin), {
      method: options.method || 'GET',
      headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : JSON.stringify(options.body),
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  function ensureStatusHost() {
    let host = document.getElementById(STATUS_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = STATUS_ID;
    host.className = 'pd-sign-status';
    host.hidden = true;
    const wrapper = document.querySelector('.page-wrapper') || document.body;
    wrapper.appendChild(host);
    return host;
  }

  function showBanner(message) {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      banner.className = 'pd-sign-banner';
      const wrapper = document.querySelector('.page-wrapper') || document.body;
      wrapper.insertBefore(banner, wrapper.firstChild);
    }
    banner.textContent = message;
    banner.hidden = !message;
  }

  function showStatus(message, tone, details = {}) {
    const host = ensureStatusHost();
    host.hidden = !message;
    host.dataset.tone = tone || '';
    const pdfLink =
      details.pdfUrl && tone === 'success'
        ? `<p class="pd-sign-status__pdf"><a href="${escapeAttr(details.pdfUrl)}" target="_blank" rel="noopener">Öppna signerad PDF</a></p>`
        : details.auditNote && tone === 'success'
          ? `<p class="pd-sign-status__meta">${escapeHtml(details.auditNote)}</p>`
          : '';
    const entryLine = details.entryId
      ? `<p class="pd-sign-status__meta">Post-ID: <code>${escapeHtml(details.entryId)}</code></p>`
      : '';
    host.innerHTML = `<p class="pd-sign-status__msg">${escapeHtml(message)}</p>${entryLine}${pdfLink}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function collectDomFields() {
    const fields = {};
    document.querySelectorAll('.yes-no-group[data-field]').forEach((group) => {
      const key = group.dataset.field;
      if (!key) return;
      const active = group.querySelector('.yes-no-btn.active');
      fields[key] = active ? active.dataset.value || '' : '';
    });
    document
      .querySelectorAll('input[data-field], textarea[data-field], select[data-field]')
      .forEach((el) => {
        const key = el.dataset.field;
        if (!key) return;
        fields[key] = String(el.value || '').trim();
      });
    document.querySelectorAll('[data-followup] textarea[data-field]').forEach((el) => {
      const key = el.dataset.field;
      if (!key) return;
      fields[key] = String(el.value || '').trim();
    });
    return fields;
  }

  function collectExtraFields(sign) {
    const extra = {};
    (sign.extraFields || []).forEach(({ selector, key, type }) => {
      const el = document.querySelector(selector);
      if (!el || !key) return;
      if (type === 'checkbox') extra[key] = el.checked === true;
      else extra[key] = String(el.value || '').trim();
    });
    return extra;
  }

  function validateAcks(sign) {
    const selectors = sign.requiredAckSelectors || [];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) return false;
      if (el.type === 'checkbox' && !el.checked) return false;
    }
    return selectors.length > 0 || true;
  }

  function promptSignedName(sign) {
    const name = global.prompt(sign.promptName || 'Patientens namn för signering:') || '';
    const trimmed = normalizeText(name);
    if (!trimmed) throw new Error('Signering avbruten — namn saknas.');
    return trimmed;
  }

  function journalPdfUrl(patientId, entryId, tenantId) {
    if (!entryId) return null;
    const params = new URLSearchParams({
      patientId,
      tenantId: tenantId || 'hair_tp',
    });
    return `/api/v1/cco-journal-quick/entry/${encodeURIComponent(entryId)}/pdf?${params}`;
  }

  function agreementPdfUrl(patientId, documentId) {
    if (!documentId) return null;
    const params = new URLSearchParams({
      patientId,
      documentId,
    });
    return `/api/v1/cco-treatment-agreement/document.pdf?${params}`;
  }

  async function submitCcoForm(sign, patientId) {
    const signedByName = promptSignedName(sign);
    const payload = await apiRequest('/api/v1/cco-forms/submit', {
      method: 'POST',
      body: {
        tenantId: sign.tenantId,
        patientId,
        formType: sign.formType,
        formVariant: sign.formVariant,
        title: sign.title,
        fields: { ...collectDomFields(), ...collectExtraFields(sign) },
        signedByName,
        autoSign: sign.autoSign !== false,
      },
    });
    const entryId = payload?.entry?.entryId || null;
    return {
      entryId,
      pdfUrl: journalPdfUrl(patientId, entryId, sign.tenantId),
      message: payload.autoSigned ? 'Formulär signerat och PDF arkiveras.' : 'Formulär sparat.',
      auditActions: [
        'journal.form_submitted',
        payload.autoSigned ? 'journal.form_signed' : null,
      ].filter(Boolean),
    };
  }

  async function loadPatientAgreement(patientId) {
    return apiRequest(
      `/api/v1/cco-treatment-agreement/patient-agreement?patientId=${encodeURIComponent(patientId)}`
    );
  }

  async function ensureTreatmentAgreementReady(patientId) {
    let payload = await loadPatientAgreement(patientId);
    let agreement = payload?.agreement || null;

    if (!agreement) {
      await apiRequest('/api/v1/cco-treatment-agreement/from-offer', {
        method: 'POST',
        body: { patientId, deliveryMode: 'plats' },
      });
      payload = await loadPatientAgreement(patientId);
      agreement = payload?.agreement || null;
    }

    if (!agreement) {
      throw new Error(
        'Behandlingsavtal saknas. Acceptera offerten på kundkortet och skapa avtal där först.'
      );
    }

    const status = normalizeText(agreement.agreementStatus).toLowerCase();
    if (status !== 'sent' && status !== 'cooling_off' && status !== 'signed') {
      await apiRequest('/api/v1/cco-treatment-agreement/send-for-sign', {
        method: 'POST',
        body: { patientId },
      });
      payload = await loadPatientAgreement(patientId);
      agreement = payload?.agreement || agreement;
    }

    if (normalizeText(agreement?.agreementStatus).toLowerCase() === 'signed') {
      throw new Error('Behandlingsavtalet är redan signerat.');
    }

    return agreement;
  }

  async function acceptTreatmentAgreement(sign, patientId) {
    await ensureTreatmentAgreementReady(patientId);
    const customerSignedName = promptSignedName(sign);
    const payload = await apiRequest('/api/v1/cco-treatment-agreement/accept', {
      method: 'POST',
      body: {
        patientId,
        customerSignedName,
        consent_ack: true,
      },
    });
    const agreement = payload?.agreement || null;
    const pdfId = agreement?.agreementDocumentPdfId || agreement?.agreementDocumentId || null;
    return {
      entryId: agreement?.agreementId || pdfId,
      pdfUrl: agreementPdfUrl(patientId, pdfId),
      message: 'Behandlingsavtal och samtycke signerat.',
      auditActions: ['agreement_signed'],
    };
  }

  async function submitConsentJournal(sign, patientId) {
    const patientSignedName = promptSignedName(sign);
    const boot = readBoot();
    const created = await apiRequest('/api/v1/cco-journal/entry', {
      method: 'PUT',
      body: {
        patientId,
        journalType: sign.journalType,
        title: sign.title,
        source: 'patient_doc_live',
        fields: {
          registryId: boot.registryId,
          consentKind: sign.consentKind,
          consentApiId: sign.consentApiId,
          patientSignedName,
          domFields: collectDomFields(),
          signedVia: 'patient-document-shell',
        },
      },
    });
    const entryId = created?.entry?.entryId;
    if (!entryId) throw new Error('Journalpost saknar entryId.');
    const signed = await apiRequest('/api/v1/cco-journal/entry/sign', {
      method: 'POST',
      body: { patientId, entryId },
    });
    const finalId = signed?.entry?.entryId || entryId;
    return {
      entryId: finalId,
      pdfUrl: journalPdfUrl(patientId, finalId, sign.tenantId),
      message: 'Samtycke signerat och PDF arkiveras.',
      auditActions: ['cco.journal.entry.sign'],
    };
  }

  async function submitPhotoConsent(sign, patientId) {
    const patientSignedName = promptSignedName(sign);
    const photoId = sign.photoId || 'scope-hairline-crown';
    const payload = await apiRequest(
      `/api/v1/cco-photo-consents/${encodeURIComponent(patientId)}/${encodeURIComponent(photoId)}`,
      {
        method: 'POST',
        body: {
          status: 'granted',
          note: `scope=${sign.scope || 'hairline_crown'}; signedBy=${patientSignedName}; registry=foto_samtycke`,
        },
      }
    );
    return {
      entryId: `${patientId}::${photoId}`,
      pdfUrl: null,
      message: 'Foto-samtycke registrerat.',
      auditNote:
        'Scope-consent sparat i CCO (audit cco.photo_consent.set). Ingen PDF — gäller hårlinje/krona, inte enskilda foton.',
      auditActions: ['cco.photo_consent.set'],
      consent: payload,
    };
  }

  async function runSign(sign, patientId) {
    switch (sign.handler) {
      case 'cco_form':
        return submitCcoForm(sign, patientId);
      case 'treatment_agreement':
        return acceptTreatmentAgreement(sign, patientId);
      case 'consent_journal':
        return submitConsentJournal(sign, patientId);
      case 'photo_consent':
        return submitPhotoConsent(sign, patientId);
      default:
        throw new Error(`Okänd sign-handler: ${sign.handler}`);
    }
  }

  function bindPrimaryAction(sign, patientId) {
    const primaryBtn = document.querySelector('.actions .btn-primary, .btn.btn-primary');
    if (!primaryBtn) return;

    if (sign.disabled) {
      primaryBtn.disabled = true;
      showBanner(sign.disabledReason || 'Signering är inte tillgänglig på denna sida.');
      return;
    }

    if (sign.requiresPatientId && !patientId) {
      primaryBtn.disabled = true;
      showBanner('Öppna dokumentet från kundkortet (patientId följer med automatiskt).');
      return;
    }

    if (!getAdminToken()) {
      primaryBtn.disabled = true;
      showBanner(
        'Inloggning saknas. Öppna via CCO kundkort (samma flik) eller logga in i /major-arcana-preview/ först.'
      );
      return;
    }

    primaryBtn.addEventListener('click', async () => {
      if (!validateAcks(sign)) {
        showStatus('Godkänn obligatoriska kryssrutor innan signering.', 'error');
        return;
      }
      primaryBtn.disabled = true;
      showStatus('Signerar…', 'loading');
      try {
        const result = await runSign(sign, patientId);
        showStatus(result.message, 'success', result);
        try {
          global.dispatchEvent(
            new global.CustomEvent('cco:patient-doc-signed', {
              detail: {
                registryId: readBoot().registryId,
                patientId,
                ...result,
              },
            })
          );
        } catch {
          /* ignore */
        }
      } catch (error) {
        showStatus(error.message || 'Signering misslyckades.', 'error');
        primaryBtn.disabled = false;
      }
    });
  }

  async function init() {
    const sign = readSign();
    if (!sign || !sign.handler) return;
    await ensureAuthReady();
    const boot = readBoot();
    const params = new URLSearchParams(global.location.search || '');
    const patientId = normalizeText(boot.patientId || params.get('patientId'));
    bindPrimaryAction(sign, patientId);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ArcanaPatientDocumentShell = Object.freeze({
    init,
    readSign,
    collectDomFields,
    ensureAuthReady,
    stashAuthForLiveNavigation(token) {
      const value = normalizeText(token || getAdminToken());
      if (!value) return false;
      try {
        global.sessionStorage.setItem(PASSTHROUGH_KEY, value);
        return true;
      } catch {
        return false;
      }
    },
  });
})(window);
