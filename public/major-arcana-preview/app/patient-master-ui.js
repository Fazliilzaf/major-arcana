/**
 * Fas 2 — Kundregister (patient master) i Kunder-vyn.
 * Läser /api/v1/cco-patient-master/* och renderar lista + kundkort.
 */
(() => {
  'use strict';

  if (window.__ARCANA_PATIENT_MASTER_UI_BOOTED__) return;
  window.__ARCANA_PATIENT_MASTER_UI_BOOTED__ = true;

  const ADMIN_TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const PAGE_SIZE = 60;

  const FLAG_LABELS = {
    missing_email: 'Saknar e-post',
    missing_phone: 'Saknar telefon',
    missing_personnummer: 'Saknar personnummer',
    duplicate_email: 'Dubblett e-post',
    drive_only: 'Endast Drive',
    cliento_only: 'Endast Cliento',
    needs_review: 'Granska',
  };

  const MATCH_LABELS = {
    matched: 'Kopplad',
    cliento_only: 'Cliento',
    drive_only: 'Drive',
    needs_review: 'Granska',
  };

  const JOURNAL_TYPE_LABELS = {
    historical_import: 'Importerad journal',
    tp_treatment: 'TP-journal',
    prp_treatment: 'PRP-journal',
    follow_up: 'Uppföljning',
    health_declaration: 'Hälsodeklaration',
    fitness_certificate: 'Friskförsäkran',
    consultation_plan: 'Behandlingsplan',
  };

  const PHOTO_LABEL_OPTIONS = ['Front', 'Vertex', 'Baksida', 'Profil', 'Annan'];
  const photoObjectUrls = new Set();
  const fileObjectUrls = new Set();
  const patientDetailInflight = new Map();

  const runtime = {
    mode: 'register',
    loading: false,
    loaded: false,
    error: '',
    authRequired: false,
    query: '',
    flagFilter: '',
    offset: 0,
    total: 0,
    patients: [],
    selectedPatientId: '',
    detail: null,
    detailTab: 'profil',
    detailLoading: false,
    detailShellOnly: false,
    commercialCase: null,
    offerDocumentUrl: '',
    offerDocumentPdfUrl: '',
    offerDocumentWordUrl: '',
    offerSignUrl: '',
    treatmentAgreement: null,
    agreementReadout: null,
    agreementDocumentUrl: '',
    agreementDocumentPdfUrl: '',
    agreementSignUrl: '',
    offerTemplates: [],
    stats: null,
    reviewGroups: null,
    reviewGroupsLoading: false,
    preferJournalOnMobile: false,
    pendingPatientId: '',
    pendingPasswordSetup: null,
    editingTpEntryId: '',
    editingPrpEntryId: '',
    editingFollowUpEntryId: '',
    editingClinicalFormKey: '',
    editingClinicalEntryId: '',
    journalTimelineFilter: 'all',
  };

  const JOURNAL_TIMELINE_FILTERS = [
    { id: 'all', label: 'Alla' },
    { id: 'consultation', label: 'Konsultation' },
    { id: 'treatment', label: 'Behandling' },
    { id: 'followup', label: 'Uppföljning' },
    { id: 'archive', label: 'Arkiv' },
  ];

  const els = {
    shell: null,
    list: null,
    rail: null,
    identityRail: null,
    patientRail: null,
    status: null,
    search: null,
    filter: null,
    metrics: null,
    title: null,
    subtitle: null,
    modeButtons: [],
  };

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function repairDisplayFilename(name) {
    if (window.ArcanaMobileCore?.repairDisplayFilename) {
      return window.ArcanaMobileCore.repairDisplayFilename(name);
    }
    return normalizeText(name);
  }

  function isLocalPreviewHost() {
    try {
      const host = window.location.hostname.split(':')[0].toLowerCase();
      return ['localhost', '127.0.0.1', '::1'].includes(host);
    } catch {
      return false;
    }
  }

  function isStaffJournalOpenAccess() {
    try {
      if (window.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return true;
    } catch {
      /* ignore */
    }
    return isLocalPreviewHost();
  }

  function hasStoredStaffSession() {
    try {
      const local = normalizeText(window.localStorage.getItem(ADMIN_TOKEN_KEY));
      if (local && local !== '__preview_local__') return true;
      const session = normalizeText(window.sessionStorage.getItem(ADMIN_TOKEN_KEY));
      if (session && session !== '__preview_local__') return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function needsStaffLogin() {
    if (runtime.pendingPasswordSetup) return true;
    return !hasStoredStaffSession();
  }

  function clearStaffTokens() {
    try {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  function resetAuthMobileLayout() {
    if (!isMobileViewport() || runtime.mode !== 'register') return;
    const hadDetail =
      Boolean(normalizeText(runtime.selectedPatientId)) ||
      document.documentElement.hasAttribute('data-cco-patient-detail');
    resetMobilePatientDetailState();
    document.documentElement.removeAttribute('data-cco-patient-detail');
    try {
      delete window.__ARCANA_MOBILE_DEEPLINK_PRIME__;
    } catch {
      /* ignore */
    }
    if (hadDetail) {
      replaceMobilePatientListUrl();
    }
  }

  function syncAuthRequiredChrome() {
    const required = needsStaffLogin() || runtime.authRequired;
    if (required) {
      resetAuthMobileLayout();
      document.documentElement.setAttribute('data-cco-auth-required', 'on');
      window.ArcanaPostOpInternalReviews?.hide?.();
      window.ArcanaMobileCore?.forceUnlockBodyScroll?.();
      window.ArcanaMobileCore?.enhanceStickyCtas?.();
    } else {
      document.documentElement.removeAttribute('data-cco-auth-required');
    }
    return required;
  }

  function setAdminToken(token) {
    const normalized = normalizeText(token);
    if (!normalized) return;
    try {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, normalized);
    } catch {
      /* ignore */
    }
    try {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, normalized);
    } catch {
      /* ignore */
    }
  }

  function renderStaffLoginCard(message = '') {
    return `
      <section class="patient-master-card patient-master-auth-card">
        <h2>Logga in</h2>
        <p class="patient-master-muted">${escapeHtml(message || 'Logga in för att läsa kundregister och journal.')}</p>
        <form class="patient-master-login-form" data-staff-login-form>
          <label class="patient-master-login-field">
            <span class="patient-master-muted">E-post</span>
            <input type="email" name="email" autocomplete="username" inputmode="email" required />
          </label>
          <label class="patient-master-login-field">
            <span class="patient-master-muted">Lösenord</span>
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <label class="patient-master-login-field patient-master-login-field--tenant">
            <span class="patient-master-muted">Klinik</span>
            <input type="text" name="tenantId" value="hair-tp-clinic" autocomplete="organization" />
          </label>
          <button type="submit" class="customers-utility-button patient-master-login-button">Logga in</button>
          <p class="patient-master-muted" data-staff-login-status aria-live="polite"></p>
        </form>
      </section>
    `;
  }

  function renderStaffPasswordSetupCard() {
    const setup = runtime.pendingPasswordSetup || {};
    return `
      <section class="patient-master-card patient-master-auth-card">
        <h2>Välj ditt lösenord</h2>
        <p class="patient-master-muted">Detta är din första inloggning. Välj ett eget lösenord (minst 10 tecken). Du loggar in igen direkt efteråt — ingen extra verifiering.</p>
        <form class="patient-master-login-form" data-staff-setup-password-form>
          <label class="patient-master-login-field">
            <span class="patient-master-muted">E-post</span>
            <input type="email" name="email" value="${escapeHtml(setup.email || '')}" readonly />
          </label>
          <label class="patient-master-login-field">
            <span class="patient-master-muted">Nytt lösenord</span>
            <input type="password" name="newPassword" autocomplete="new-password" minlength="10" required />
          </label>
          <label class="patient-master-login-field">
            <span class="patient-master-muted">Bekräfta lösenord</span>
            <input type="password" name="confirmPassword" autocomplete="new-password" minlength="10" required />
          </label>
          <button type="submit" class="customers-utility-button patient-master-login-button">Spara och logga in igen</button>
          <p class="patient-master-muted" data-staff-setup-password-status aria-live="polite"></p>
        </form>
      </section>
    `;
  }

  async function authRequest(path, options = {}) {
    const response = await fetch(new URL(path, window.location.origin).toString(), {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-arcana-client': 'major_arcana_admin',
        ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  async function completeStaffAuthSession(payload) {
    const token = normalizeText(payload?.token);
    if (!token) throw new Error('Inloggning misslyckades (saknar token).');
    setAdminToken(token);
    runtime.authRequired = false;
    runtime.error = '';
    runtime.loaded = false;
    runtime.patients = [];
    syncAuthRequiredChrome();
    setStatus('Inloggad.', 'success');
    void loadStats();
    void loadPatientList();
    window.ArcanaPostOpInternalReviews?.refresh?.();
  }

  async function submitStaffPasswordSetup(form) {
    const setup = runtime.pendingPasswordSetup;
    if (!setup?.token || !setup?.currentPassword) {
      runtime.pendingPasswordSetup = null;
      runtime.error = 'Lösenordsinställningen avbröts. Logga in igen.';
      renderPatientRows();
      return;
    }
    const statusEl = form.querySelector('[data-staff-setup-password-status]');
    const submitBtn = form.querySelector('[type="submit"]');
    const newPassword = String(form.newPassword?.value || '');
    const confirmPassword = String(form.confirmPassword?.value || '');
    if (newPassword.length < 10) {
      if (statusEl) statusEl.textContent = 'Lösenordet måste vara minst 10 tecken.';
      return;
    }
    if (newPassword !== confirmPassword) {
      if (statusEl) statusEl.textContent = 'Lösenorden matchar inte.';
      return;
    }
    if (statusEl) statusEl.textContent = 'Sparar lösenord…';
    if (submitBtn) submitBtn.disabled = true;
    try {
      await authRequest('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${setup.token}` },
        body: {
          currentPassword: setup.currentPassword,
          newPassword,
          revokeOtherSessions: true,
          revokeCurrentSession: true,
        },
      });
      runtime.pendingPasswordSetup = null;
      clearStaffTokens();
      runtime.authRequired = true;
      runtime.error = 'Klart! Logga in med ditt nya lösenord.';
      syncAuthRequiredChrome();
      renderPatientRows();
      setStatus('Lösenord sparat. Logga in igen.', 'success');
    } catch (error) {
      runtime.error = error.message || 'Kunde inte spara lösenord.';
      if (statusEl) statusEl.textContent = runtime.error;
      setStatus(runtime.error, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function submitStaffLogin(form) {
    const statusEl = form.querySelector('[data-staff-login-status]');
    const submitBtn = form.querySelector('[type="submit"]');
    const email = normalizeText(form.email?.value);
    const password = String(form.password?.value || '');
    const tenantId = normalizeText(form.tenantId?.value) || 'hair-tp-clinic';
    if (!email || !password) {
      if (statusEl) statusEl.textContent = 'Ange e-post och lösenord.';
      return;
    }
    if (statusEl) statusEl.textContent = 'Loggar in…';
    if (submitBtn) submitBtn.disabled = true;
    try {
      const response = await authRequest('/api/v1/auth/login', {
        method: 'POST',
        body: { client: 'major_arcana_admin', email, password, tenantId },
      });
      if (response?.requiresMfa) {
        const mfaTicket = normalizeText(response.mfaTicket);
        const code = window.prompt('MFA krävs. Ange 6-siffrig kod.', '');
        if (!code) throw new Error('MFA-kod krävs.');
        const mfaResponse = await authRequest('/api/v1/auth/mfa/verify', {
          method: 'POST',
          body: { mfaTicket, code: normalizeText(code), tenantId },
        });
        await completeStaffAuthSession(mfaResponse);
        return;
      }
      if (response?.requiresTenantSelection) {
        throw new Error('Välj klinik i admin — flera tenants kopplade till kontot.');
      }
      if (response?.user?.mustChangePassword && response?.token) {
        runtime.pendingPasswordSetup = {
          email,
          currentPassword: password,
          token: response.token,
        };
        runtime.authRequired = true;
        runtime.error = '';
        syncAuthRequiredChrome();
        renderPatientRows();
        return;
      }
      await completeStaffAuthSession(response);
    } catch (error) {
      runtime.authRequired = true;
      runtime.error = error.message || 'Inloggning misslyckades.';
      if (statusEl) statusEl.textContent = runtime.error;
      setStatus(runtime.error, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function getPilotPatientIds() {
    try {
      const ids = window.__ARCANA_PILOT_PATIENT_IDS__;
      return Array.isArray(ids) ? ids.map((id) => normalizeText(id)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function filterPilotPatients(patients) {
    const pilotIds = getPilotPatientIds();
    if (!pilotIds.length) return patients;
    const allowed = new Set(pilotIds);
    return asArray(patients).filter((row) => allowed.has(normalizeText(row?.patientId)));
  }

  function getAdminToken() {
    try {
      const local = normalizeText(window.localStorage.getItem(ADMIN_TOKEN_KEY));
      if (local && local !== '__preview_local__') return local;
      const session = normalizeText(window.sessionStorage.getItem(ADMIN_TOKEN_KEY));
      if (session && session !== '__preview_local__') return session;
    } catch {
      /* ignore */
    }
    if (isStaffJournalOpenAccess()) {
      return '__preview_local__';
    }
    return '';
  }

  function isAuthFailure(statusCode, message) {
    const code = Number(statusCode || 0);
    const text = normalizeText(message).toLowerCase();
    return (
      code === 401 || code === 403 || text.includes('inloggning') || text.includes('unauthorized')
    );
  }

  function isMobileViewport() {
    try {
      return window.matchMedia('(max-width: 768px)').matches;
    } catch {
      return false;
    }
  }

  let mobilePatientHistoryDepth = 0;
  let suppressMobilePatientPopstate = false;

  function isMobilePatientDetailActive() {
    return (
      isMobileViewport() &&
      runtime.mode === 'register' &&
      Boolean(normalizeText(runtime.selectedPatientId))
    );
  }

  function syncMobilePatientLayout() {
    const active = isMobilePatientDetailActive();
    if (active) {
      document.documentElement.setAttribute('data-cco-patient-detail', 'on');
    } else {
      document.documentElement.removeAttribute('data-cco-patient-detail');
    }
    window.ArcanaMobileShell?.syncFromApp?.();
  }

  function ensureMobilePatientListHistory() {
    if (!isMobileViewport() || runtime.mode !== 'register') return;
    if (window.history.state?.ccoMobilePatientList || window.history.state?.ccoMobilePatient) return;
    const startup = parseStartupParams();
    if (startup.patientId || runtime.pendingPatientId) return;
    try {
      window.history.replaceState({ ccoMobilePatientList: true }, '', buildPatientDeepLink(''));
    } catch {
      /* ignore */
    }
  }

  function pushMobilePatientDetailHistory(patientId) {
    if (!isMobileViewport() || runtime.mode !== 'register' || !patientId) return;
    try {
      const state = { ccoMobilePatient: patientId };
      const url = buildPatientDeepLink(patientId);
      if (window.history.state?.ccoMobilePatientList) {
        window.history.pushState(state, '', url);
        mobilePatientHistoryDepth += 1;
        return;
      }
      if (window.history.state?.ccoMobilePatient === patientId) return;
      if (!window.history.state?.ccoMobilePatient) {
        window.history.replaceState(state, '', url);
        mobilePatientHistoryDepth = 0;
        return;
      }
      window.history.pushState(state, '', url);
      mobilePatientHistoryDepth += 1;
    } catch {
      /* ignore */
    }
  }

  function resetMobilePatientDetailState() {
    runtime.selectedPatientId = '';
    runtime.detail = null;
    runtime.detailLoading = false;
    runtime.commercialCase = null;
    runtime.offerDocumentUrl = '';
    runtime.offerDocumentPdfUrl = '';
    runtime.offerDocumentWordUrl = '';
    runtime.offerSignUrl = '';
    runtime.treatmentAgreement = null;
    runtime.agreementReadout = null;
    runtime.agreementDocumentUrl = '';
    runtime.agreementDocumentPdfUrl = '';
    runtime.agreementSignUrl = '';
    runtime.editingTpEntryId = '';
    runtime.editingPrpEntryId = '';
    runtime.editingFollowUpEntryId = '';
    runtime.editingClinicalFormKey = '';
    runtime.editingClinicalEntryId = '';
  }

  function clearMobilePatientSelection({ fromPopstate = false } = {}) {
    if (!runtime.selectedPatientId) {
      syncMobilePatientLayout();
      if (!fromPopstate) {
        replaceMobilePatientListUrl();
      }
      return;
    }
    resetMobilePatientDetailState();
    const listHasRows = Boolean(document.querySelector('[data-customer-list] [data-patient-row]'));
    renderDetailEmpty();
    if (!listHasRows || !runtime.loaded) {
      renderPatientRows();
    } else {
      setStatus('', '');
    }
    syncMobilePatientLayout();
    if (!fromPopstate) {
      replaceMobilePatientListUrl();
      if (mobilePatientHistoryDepth > 0) {
        suppressMobilePatientPopstate = true;
        mobilePatientHistoryDepth -= 1;
        window.history.back();
      }
    }
  }

  function replaceMobilePatientListUrl() {
    try {
      const startup = parseStartupParams();
      if (!startup.patientId && !window.history.state?.ccoMobilePatient) return;
      window.history.replaceState({ ccoMobilePatientList: true }, '', buildPatientDeepLink(''));
      runtime.pendingPatientId = '';
      mobilePatientHistoryDepth = 0;
    } catch {
      /* ignore */
    }
  }

  function goBackToPatientList() {
    if (!isMobilePatientDetailActive()) return;
    if (mobilePatientHistoryDepth > 0) {
      window.history.back();
      return;
    }
    clearMobilePatientSelection();
  }

  function wrapJournalCollapse(title, bodyHtml, { open = false, className = '' } = {}) {
    const content = String(bodyHtml || '').trim();
    if (!content) return '';
    return `
      <details class="patient-master-journal-collapse ${className}"${open ? ' open' : ''}>
        <summary class="patient-master-journal-collapse-summary">${escapeHtml(title)}</summary>
        <div class="patient-master-journal-collapse-body">${content}</div>
      </details>
    `;
  }

  function isOnline() {
    return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  }

  function parseStartupParams() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return {
        patientId: normalizeText(params.get('patientId')),
        view: normalizeText(params.get('view')),
      };
    } catch {
      return { patientId: '', view: '' };
    }
  }

  function isCustomersShellActive() {
    try {
      if (parseStartupParams().view === 'customers') return true;
      const canvas = document.querySelector('.preview-canvas');
      if (canvas?.dataset?.appShellView === 'customers') return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function ensureCustomersShellVisible() {
    if (!isCustomersShellActive()) return;
    document.querySelectorAll('[data-shell-view]').forEach((section) => {
      section.hidden = section.dataset.shellView !== 'customers';
    });
  }

  function buildPatientDeepLink(patientId) {
    try {
      const url = new URL(window.location.origin);
      url.pathname = '/staff';
      url.search = '';
      url.hash = '';
      url.searchParams.set('view', 'customers');
      if (patientId) {
        url.searchParams.set('patientId', patientId);
      }
      return url.toString();
    } catch {
      const qs = new URLSearchParams({ view: 'customers' });
      if (patientId) qs.set('patientId', patientId);
      return `${window.location.origin}/staff?${qs.toString()}`;
    }
  }

  function promptPhotoLabel() {
    const choice = window.prompt(
      `Etikett för bilden?\n${PHOTO_LABEL_OPTIONS.map((label, index) => `${index + 1}. ${label}`).join('\n')}\n\nSkriv nummer eller egen text:`,
      '1'
    );
    if (choice === null) return null;
    const trimmed = normalizeText(choice);
    const index = Number(trimmed);
    if (Number.isFinite(index) && index >= 1 && index <= PHOTO_LABEL_OPTIONS.length) {
      return PHOTO_LABEL_OPTIONS[index - 1];
    }
    return trimmed || 'Konsultationsbild';
  }

  function isPlanUploadBlocked(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    return Boolean(planEntry && (planEntry.locked || planEntry.status === 'signed'));
  }

  async function apiRequest(path, options = {}) {
    const token = getAdminToken();
    const headers = {
      Accept: 'application/json',
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(new URL(path, window.location.origin), {
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

  function setStatus(message = '', tone = '') {
    if (!els.status) return;
    els.status.hidden = !message;
    els.status.textContent = message;
    els.status.dataset.statusTone = tone;
  }

  function resolveElements() {
    els.shell = document.querySelector('[data-shell-view="customers"]');
    els.list = document.querySelector('[data-customer-list]');
    els.rail = document.querySelector('.customers-rail');
    els.identityRail = document.querySelector('[data-patient-identity-rail]');
    els.patientRail = document.querySelector('[data-patient-master-rail]');
    els.status = document.querySelector('[data-customers-status]');
    els.search = document.querySelector('[data-customer-search]');
    els.filter = document.querySelector('[data-customer-filter]');
    els.metrics = document.querySelector('.customers-metric-row');
    els.title = document.querySelector('#customers-title');
    els.subtitle = els.shell?.querySelector('[data-customers-lead]');
    els.modeButtons = Array.from(document.querySelectorAll('[data-patient-master-mode]'));
    els.mergeGroupsHost = document.querySelector('[data-customer-merge-groups]');
  }

  function renderModeChrome() {
    const isRegister = runtime.mode === 'register';
    els.modeButtons.forEach((button) => {
      const active = button.dataset.patientMasterMode === runtime.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (els.title) {
      els.title.textContent = isRegister ? 'Kundregister' : 'Kundidentitetshantering';
    }
    if (els.subtitle) {
      if (isRegister) {
        els.subtitle.textContent = '';
        els.subtitle.hidden = true;
      } else {
        els.subtitle.textContent =
          'Hantera kundprofiler, slå ihop dubbletter och få full överblick.';
        els.subtitle.hidden = false;
      }
    }
    if (els.identityRail) {
      els.identityRail.hidden = isRegister;
    }
    if (els.patientRail) {
      els.patientRail.hidden = !isRegister;
    }
    if (els.metrics) {
      els.metrics.hidden = !isRegister;
    }
  }

  function renderMetricCards() {
    if (!els.metrics || !runtime.stats) return;
    const stats = runtime.stats;
    const mapping = {
      total: stats.totalPatients,
      matched: stats.matched,
      journal: stats.withPersonnummer,
      review: stats.needsReview,
      drive: stats.driveOnly,
    };
    els.metrics.querySelectorAll('[data-patient-metric]').forEach((card) => {
      const key = card.dataset.patientMetric;
      const node = card.querySelector('strong');
      if (node && Object.prototype.hasOwnProperty.call(mapping, key)) {
        node.textContent = String(mapping[key] ?? 0);
      }
    });
  }

  function chipHtml(label, tone = 'blue') {
    return `<span class="focus-customer-chip focus-customer-chip--${tone}">${escapeHtml(label)}</span>`;
  }

  function renderPatientFlags(card) {
    const chips = [];
    const seen = new Set();
    const add = (label, tone) => {
      const key = normalizeText(label).toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      chips.push(chipHtml(label, tone));
    };
    if (card.matchStatus) {
      const tone =
        card.matchStatus === 'matched'
          ? 'green'
          : card.matchStatus === 'needs_review'
            ? 'gold'
            : 'blue';
      add(MATCH_LABELS[card.matchStatus] || card.matchStatus, tone);
    }
    if (card.pipedriveLinked) {
      const dealLabel =
        Number(card.pipedriveDealCount) > 0
          ? `Pipedrive (${card.pipedriveDealCount})`
          : 'Pipedrive';
      add(dealLabel, 'violet');
    }
    if (card.hasJournalHistory) {
      add('Importerad journal', 'green');
    } else if (card.clientoLinked && !card.driveLinked) {
      add('Cliento', 'blue');
    }
    asArray(card.flags)
      .slice(0, 3)
      .forEach((flag) => {
        add(FLAG_LABELS[flag] || flag, flag === 'needs_review' ? 'gold' : 'violet');
      });
    return chips.join('');
  }

  const REVIEW_REASON_LABELS = {
    shared_email: 'Samma e-post',
    shared_phone: 'Samma telefon',
    shared_personnummer: 'Samma personnummer',
  };

  function formatDealValue(deal) {
    const value = normalizeText(deal?.value);
    if (!value || value === '0') return '—';
    const currency = normalizeText(deal?.currency);
    return currency ? `${value} ${currency}` : value;
  }

  function renderPipedriveSection(patient) {
    const pipedrive = patient?.pipedrive;
    if (!pipedrive) return '';
    const deals = asArray(pipedrive.deals);
    if (!deals.length) {
      return `
          <article class="focus-customer-data-card patient-master-pipedrive-card">
            <h4>Pipedrive</h4>
            <p class="patient-master-muted">Kopplad person (ID ${escapeHtml(pipedrive.personId || '—')}) utan affärer i exporten.</p>
          </article>`;
    }
    const rows = deals
      .slice(0, 40)
      .map(
        (deal) => `
            <tr>
              <td>${escapeHtml(deal.title || '—')}</td>
              <td>${escapeHtml(deal.stage || '—')}</td>
              <td>${escapeHtml(deal.status || '—')}</td>
              <td>${escapeHtml(formatDealValue(deal))}</td>
              <td>${escapeHtml(deal.pipeline || '—')}</td>
            </tr>`
      )
      .join('');
    const more =
      deals.length > 40
        ? `<p class="patient-master-muted">Visar 40 av ${deals.length} affärer.</p>`
        : '';
    return `
          <article class="focus-customer-data-card patient-master-pipedrive-card">
            <h4>Pipedrive · ${deals.length} affär${deals.length === 1 ? '' : 'er'}</h4>
            <p class="patient-master-muted">Person-ID ${escapeHtml(pipedrive.personId || '—')}${pipedrive.matchMethod ? ` · match via ${escapeHtml(pipedrive.matchMethod)}` : ''}</p>
            <div class="patient-master-pipedrive-table-wrap">
              <table class="patient-master-pipedrive-table">
                <thead>
                  <tr>
                    <th>Affär</th>
                    <th>Fas</th>
                    <th>Status</th>
                    <th>Värde</th>
                    <th>Pipeline</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            ${more}
          </article>`;
  }

  function renderReviewGroupsPanel() {
    if (!els.mergeGroupsHost) return;
    if (needsStaffLogin()) {
      els.mergeGroupsHost.innerHTML = renderStaffLoginCard(
        'Logga in för att granska och slå ihop dubbletter.'
      );
      return;
    }
    if (runtime.reviewGroupsLoading) {
      els.mergeGroupsHost.innerHTML =
        '<p class="patient-master-muted">Läser granskningsgrupper…</p>';
      return;
    }
    const groups = asArray(runtime.reviewGroups?.groups);
    if (!groups.length) {
      els.mergeGroupsHost.innerHTML =
        '<p class="patient-master-muted">Inga dubblettgrupper att slå ihop just nu. Filtrera kundregister på «Granska» för enstaka poster.</p>';
      return;
    }
    const cards = groups
      .map((group, index) => {
        const reasons = asArray(group.reasons)
          .map((reason) => REVIEW_REASON_LABELS[reason] || reason)
          .filter(Boolean);
        const primaryId = group.suggestedPrimaryId || group.members?.[0]?.patientId || '';
        const memberRows = asArray(group.members)
          .map((member) => {
            const isPrimary = member.patientId === primaryId;
            return `
              <li class="${isPrimary ? 'is-primary' : ''}">
                <strong>${escapeHtml(member.displayName || 'Okänd')}</strong>
                <span>${escapeHtml(member.primaryEmail || member.primaryPhone || member.personnummer || '—')}</span>
                ${isPrimary ? '<em>Primär</em>' : ''}
              </li>`;
          })
          .join('');
        const secondaryIds = asArray(group.members)
          .map((member) => member.patientId)
          .filter((id) => id && id !== primaryId);
        return `
          <article class="customers-merge-card" data-patient-merge-group="${escapeHtml(group.groupId)}">
            <div class="customers-merge-top">
              <strong>Grupp ${index + 1}</strong>
              <span>${group.members.length} poster</span>
            </div>
            <ul>${reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            <ul class="patient-master-merge-members">${memberRows}</ul>
            <div class="customers-merge-actions">
              <button class="customers-merge-accept" type="button" data-patient-merge-accept data-patient-merge-primary="${escapeHtml(primaryId)}" data-patient-merge-secondary="${escapeHtml(secondaryIds.join(','))}">
                Slå ihop
              </button>
            </div>
          </article>`;
      })
      .join('');
    els.mergeGroupsHost.innerHTML = `
      <div class="customers-merge-group is-active" data-patient-merge-groups-live>
        <p class="patient-master-muted">${groups.length} grupp${groups.length === 1 ? '' : 'er'} med delad e-post, telefon eller personnummer (${runtime.reviewGroups?.total || groups.length} totalt).</p>
        ${cards}
      </div>`;
  }

  async function loadReviewGroups() {
    if (needsStaffLogin()) {
      renderReviewGroupsPanel();
      return;
    }
    runtime.reviewGroupsLoading = true;
    renderReviewGroupsPanel();
    try {
      runtime.reviewGroups = await apiRequest('/api/v1/cco-patient-master/review-groups?limit=120');
    } catch (error) {
      runtime.reviewGroups = { groups: [], total: 0 };
      setStatus(error.message || 'Kunde inte läsa granskningsgrupper.', 'error');
    } finally {
      runtime.reviewGroupsLoading = false;
      renderReviewGroupsPanel();
    }
  }

  async function mergeReviewGroup(primaryPatientId, secondaryPatientIds) {
    if (!primaryPatientId || !asArray(secondaryPatientIds).length) return;
    setStatus('Slår ihop patientposter…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/merge', {
        method: 'POST',
        body: {
          primaryPatientId,
          secondaryPatientIds,
        },
      });
      setStatus(
        `Slog ihop ${payload.removedPatientIds?.length || 0} poster${payload.journalMoved ? ` (${payload.journalMoved} journaler flyttade)` : ''}.`,
        'success'
      );
      await Promise.all([loadReviewGroups(), loadStats()]);
      if (runtime.mode === 'register') {
        runtime.selectedPatientId = '';
        runtime.detail = null;
        renderDetailEmpty();
        void loadPatientList();
      }
    } catch (error) {
      setStatus(error.message || 'Kunde inte slå ihop poster.', 'error');
    }
  }

  function renderPatientHeroChipRow(card) {
    if (isMobileViewport()) return '';
    const flags = renderPatientFlags(card);
    if (!flags) return '';
    return `<div class="focus-customer-chip-row">${flags}</div>`;
  }

  function renderPatientHeroActions() {
    return `
            <div class="patient-master-hero-actions">
              <button type="button" class="customers-utility-button patient-master-copy-link patient-master-colleague-link-copy" data-patient-action="copy-patient-link" title="Kopiera kollegelänk till kundkort (kräver CCO-inloggning)">
                Kopiera kollegelänk
              </button>
              <button type="button" class="customers-utility-button patient-master-copy-link patient-master-colleague-link-qr" data-patient-action="show-patient-qr" title="QR för kollega — kräver CCO-inloggning">
                QR för kollega
              </button>
            </div>`;
  }

  function renderPatientPrimaryTabs(detailTab, fileCount = 0) {
    const tab = detailTab || 'profil';
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const fileLabel = fileCount ? ` (${fileCount})` : '';
    if (isMobileViewport()) {
      return `
          <button type="button" class="patient-master-tab${profilActive ? ' is-active' : ''}" data-patient-tab="profil" aria-pressed="${profilActive}">Profil</button>
          <button type="button" class="patient-master-tab${tab === 'tidslinje' ? ' is-active' : ''}" data-patient-tab="tidslinje" aria-pressed="${tab === 'tidslinje'}">Tidslinje</button>
          <button type="button" class="patient-master-tab${filesActive ? ' is-active' : ''}" data-patient-tab="filer" aria-pressed="${filesActive}">Filer${fileLabel}</button>`;
    }
    return `
          <button type="button" class="patient-master-tab${profilActive ? ' is-active' : ''}" data-patient-tab="profil" aria-pressed="${profilActive}">Profil</button>
          <button type="button" class="patient-master-tab${journalActive ? ' is-active' : ''}" data-patient-tab="journal" aria-pressed="${journalActive}">Journal</button>
          <button type="button" class="patient-master-tab${tab === 'tidslinje' ? ' is-active' : ''}" data-patient-tab="tidslinje" aria-pressed="${tab === 'tidslinje'}">Tidslinje</button>
          <button type="button" class="patient-master-tab${avtalActive ? ' is-active' : ''}" data-patient-tab="avtal" aria-pressed="${avtalActive}">Avtal</button>
          <button type="button" class="patient-master-tab${filesActive ? ' is-active' : ''}" data-patient-tab="filer" aria-pressed="${filesActive}">Filer${fileLabel}</button>`;
  }

  function journalOccasionCategory(entry) {
    const type = entry?.journalType || '';
    if (type === 'historical_import' || entry?.source === 'drive_import') return 'archive';
    if (type === 'follow_up') return 'followup';
    if (type === 'tp_treatment' || type === 'prp_treatment') return 'treatment';
    return 'consultation';
  }

  function journalOccasionKey(entry) {
    const encounterId = normalizeText(entry?.treatmentEncounterId);
    if (encounterId) return `encounter:${encounterId}`;
    const date = String(
      entry?.fields?.consultationDate || entry?.signedAt || entry?.createdAt || ''
    ).slice(0, 10);
    if (journalOccasionCategory(entry) === 'archive') {
      const year = date.slice(0, 4) || '0000';
      return `archive:${year}`;
    }
    return `date:${date || 'unknown'}`;
  }

  function journalOccasionLabel(entry) {
    const category = journalOccasionCategory(entry);
    const date = String(
      entry?.fields?.consultationDate || entry?.signedAt || entry?.createdAt || ''
    ).slice(0, 10);
    if (normalizeText(entry?.treatmentEncounterId)) {
      return `Tillfälle ${entry.treatmentEncounterId.slice(0, 8)}… · ${date || 'datum saknas'}`;
    }
    if (category === 'archive') return `Arkiv ${date.slice(0, 4) || '—'}`;
    if (category === 'followup') return `Uppföljning · ${date || 'datum saknas'}`;
    if (category === 'treatment') return `Behandling · ${date || 'datum saknas'}`;
    return `Konsultation · ${date || 'datum saknas'}`;
  }

  function groupJournalEntriesByOccasion(entries) {
    const groups = new Map();
    for (const entry of asArray(entries)) {
      const key = journalOccasionKey(entry);
      if (!groups.has(key)) {
        groups.set(key, {
          timelineKey: key,
          timelineLabel: journalOccasionLabel(entry),
          timelineSort: String(
            entry?.fields?.consultationDate || entry?.signedAt || entry?.createdAt || ''
          ).slice(0, 10),
          category: journalOccasionCategory(entry),
          entries: [],
        });
      }
      groups.get(key).entries.push(entry);
    }
    return [...groups.values()].sort((a, b) =>
      String(b.timelineSort || '').localeCompare(String(a.timelineSort || ''))
    );
  }

  function renderJournalTimelineFilters() {
    const active = runtime.journalTimelineFilter || 'all';
    return `
      <div class="patient-master-timeline-filters" role="toolbar" aria-label="Filtrera tidslinje">
        ${JOURNAL_TIMELINE_FILTERS.map(
          (filter) => `
            <button type="button" class="patient-master-timeline-filter${active === filter.id ? ' is-active' : ''}" data-journal-timeline-filter="${escapeHtml(filter.id)}">
              ${escapeHtml(filter.label)}
            </button>`
        ).join('')}
      </div>`;
  }

  function renderJournalTimelineItem(entry) {
    const typeLabel = JOURNAL_TYPE_LABELS[entry.journalType] || entry.journalType || 'Journal';
    const photos = asArray(entry.attachments).filter((item) => item.type === 'consultation_photo');
    const photoMeta = photos.length
      ? ` · ${photos.length} bild${photos.length === 1 ? '' : 'er'}`
      : entry.treatmentEncounterId
        ? ` · ${entry.treatmentEncounterId.slice(0, 8)}…`
        : '';
    return `
      <li class="patient-master-timeline-item${entry.locked ? ' is-locked' : ''}">
        <strong>${escapeHtml(entry.title || typeLabel)}</strong>
        <span>${escapeHtml(entry.status || 'draft')}${entry.signedAt ? ` · ${escapeHtml(String(entry.signedAt).slice(0, 10))}` : ''}${photoMeta}</span>
      </li>`;
  }

  function renderJournalTimelineSegments(entries) {
    const filter = runtime.journalTimelineFilter || 'all';
    const groups = groupJournalEntriesByOccasion(entries).filter(
      (group) => filter === 'all' || group.category === filter
    );
    if (!groups.length) {
      return `<p class="patient-master-muted">Inga journalposter matchar filtret.</p>`;
    }
    return `
      <div class="patient-master-history-segments patient-master-journal-timeline">
        ${groups
          .map(
            (group) => `
          <section class="patient-master-history-segment">
            <header class="patient-master-history-segment-head">
              <h4>${escapeHtml(group.timelineLabel)}</h4>
              <span>${group.entries.length} post${group.entries.length === 1 ? '' : 'er'}</span>
            </header>
            <ul class="patient-master-journal-list patient-master-timeline-list">
              ${group.entries.map((entry) => renderJournalTimelineItem(entry)).join('')}
            </ul>
          </section>`
          )
          .join('')}
      </div>`;
  }

  function renderUnifiedTimelinePanel(journalEntries, driveFiles, occasionTimeline) {
    const journalGroups = groupJournalEntriesByOccasion(journalEntries);
    const fileGroups = groupFilesByOccasion(driveFiles);
    const merged = new Map();
    for (const group of journalGroups) {
      merged.set(group.timelineKey, {
        ...group,
        fileCount: 0,
        journalPdfCount: 0,
        imageCount: 0,
      });
    }
    for (const group of fileGroups) {
      const existing = merged.get(group.timelineKey);
      if (existing) {
        existing.fileCount = group.files.length;
        existing.journalPdfCount = group.files.filter(isJournalPdf).length;
        existing.imageCount = group.files.filter(isPreviewableImage).length;
        existing.timelineLabel = existing.timelineLabel || group.timelineLabel;
      } else {
        merged.set(group.timelineKey, {
          timelineKey: group.timelineKey,
          timelineLabel: group.timelineLabel,
          timelineSort: group.timelineSort,
          category: String(group.timelineKey || '').startsWith('archive:') ? 'archive' : 'consultation',
          entries: [],
          fileCount: group.files.length,
          journalPdfCount: group.files.filter(isJournalPdf).length,
          imageCount: group.files.filter(isPreviewableImage).length,
          files: group.files,
        });
      }
    }
    for (const item of asArray(occasionTimeline)) {
      const existing = merged.get(item.timelineKey);
      if (existing) {
        existing.fileCount = Math.max(existing.fileCount || 0, Number(item.fileCount || 0));
        existing.journalPdfCount = Math.max(
          existing.journalPdfCount || 0,
          Number(item.journalPdfCount || 0)
        );
        existing.imageCount = Math.max(existing.imageCount || 0, Number(item.imageCount || 0));
      }
    }
    const filter = runtime.journalTimelineFilter || 'all';
    const groups = [...merged.values()]
      .filter((group) => filter === 'all' || group.category === filter)
      .sort((a, b) => String(b.timelineSort || '').localeCompare(String(a.timelineSort || '')));
    if (!groups.length) {
      return `<p class="patient-master-muted">Ingen tidslinje att visa ännu.</p>`;
    }
    return `
      ${renderJournalTimelineFilters()}
      <div class="patient-master-history-segments">
        ${groups
          .map(
            (group) => `
          <section class="patient-master-history-segment">
            <header class="patient-master-history-segment-head">
              <h4>${escapeHtml(group.timelineLabel)}</h4>
              <span>${group.entries.length} journal · ${group.fileCount || 0} filer</span>
            </header>
            ${
              group.entries.length
                ? `<ul class="patient-master-journal-list patient-master-timeline-list">${group.entries
                    .map((entry) => renderJournalTimelineItem(entry))
                    .join('')}</ul>`
                : ''
            }
            ${
              group.files?.length
                ? `<div class="patient-master-timeline-files">${renderOccasionGroup(group)}</div>`
                : group.fileCount
                  ? `<p class="patient-master-muted">${group.journalPdfCount || 0} PDF · ${group.imageCount || 0} bilder i Filer</p>`
                  : ''
            }
          </section>`
          )
          .join('')}
      </div>`;
  }

  function renderPatientPrimaryTabsSkeleton(detailTab) {
    const tab = detailTab || 'profil';
    const journalish = tab === 'journal' || runtime.preferJournalOnMobile;
    if (isMobileViewport()) {
      const profilActive = tab === 'profil';
      const tidslinjeActive = tab === 'tidslinje';
      const filesActive = tab === 'filer';
      return `
          <span class="patient-master-tab${profilActive ? ' is-active' : ''}">Profil</span>
          <span class="patient-master-tab${tidslinjeActive ? ' is-active' : ''}">Tidslinje</span>
          <span class="patient-master-tab${filesActive ? ' is-active' : ''}">Filer</span>`;
    }
    return `
          <span class="patient-master-tab${journalish ? '' : ' is-active'}">Profil</span>
          <span class="patient-master-tab${journalish ? ' is-active' : ''}">Journal</span>
          <span class="patient-master-tab${tab === 'tidslinje' ? ' is-active' : ''}">Tidslinje</span>
          <span class="patient-master-tab">Avtal</span>
          <span class="patient-master-tab">Filer</span>`;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function renderPatientRows() {
    if (!els.list || runtime.mode !== 'register') return;
    if (syncAuthRequiredChrome()) {
      const authCard = runtime.pendingPasswordSetup
        ? renderStaffPasswordSetupCard()
        : renderStaffLoginCard(
            runtime.error || 'Logga in för att läsa kundregister och journal.'
          );
      els.list.innerHTML = authCard;
      renderDetailEmpty();
      return;
    }
    if (runtime.loading && !runtime.patients.length) {
      els.list.innerHTML = '<p class="patient-master-empty">Laddar kundregister…</p>';
      return;
    }
    if (!runtime.patients.length) {
      els.list.innerHTML = `<p class="patient-master-empty">${escapeHtml(
        runtime.error || 'Inga kunder matchar sökningen.'
      )}</p>`;
      return;
    }

    const rows = runtime.patients
      .map((card) => {
        const selected = card.patientId === runtime.selectedPatientId;
        const journalCount = Number(card.fileSummary?.journalPdfs || 0);
        const imageCount = Number(card.fileSummary?.images || 0);
        return `
          <button
            class="customer-record customer-record--compact${selected ? ' is-selected' : ''}"
            type="button"
            data-patient-row="${escapeHtml(card.patientId)}"
            aria-pressed="${selected ? 'true' : 'false'}"
          >
            <div class="customer-record-main">
              <div class="customer-record-head">
                <h3>${escapeHtml(card.displayName || 'Okänd kund')}</h3>
                ${journalCount || imageCount
            ? `<span class="customer-record-file-badge">${journalCount} PDF · ${imageCount} bild</span>`
            : ''
          }
              </div>
              <div class="customer-record-meta">
                ${card.personnummer
            ? `<span>${escapeHtml(card.personnummer)}</span>`
            : '<span class="customer-record-meta-rose">Saknar pnr</span>'
          }
                ${card.matchStatus === 'matched'
            ? '<span class="customer-record-match">Kopplad</span>'
            : ''
          }
              </div>
            </div>
          </button>
        `;
      })
      .join('');

    const hasMore = runtime.patients.length < runtime.total;
    const footer = hasMore
      ? `<button class="customers-utility-button patient-master-load-more" type="button" data-patient-load-more>Visa fler (${runtime.patients.length}/${runtime.total})</button>`
      : runtime.total
        ? `<p class="patient-master-list-meta">${runtime.total} kunder totalt</p>`
        : '';

    els.list.innerHTML = rows + footer;
  }

  function escapeSelectorValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(String(value));
    }
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function updatePatientRowSelection(previousId, nextId) {
    if (!els.list) return false;
    let touched = false;
    const mark = (patientId, selected) => {
      if (!patientId) return;
      const row = els.list.querySelector(
        `[data-patient-row="${escapeSelectorValue(patientId)}"]`
      );
      if (!row) return;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-pressed', selected ? 'true' : 'false');
      touched = true;
    };
    if (previousId && previousId !== nextId) mark(previousId, false);
    if (nextId) mark(nextId, true);
    return touched;
  }

  function railHasPatientDetailUi() {
    const rail = document.querySelector('[data-patient-master-rail]');
    return Boolean(
      rail?.querySelector('[data-patient-detail]:not([data-patient-loading="true"])') ||
      rail?.querySelector('button[data-patient-tab]')
    );
  }

  function railHasPatientDetailShell() {
    const rail = document.querySelector('[data-patient-master-rail]');
    return Boolean(rail?.querySelector('[data-patient-detail]'));
  }

  function renderDetailEmpty() {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail) return;
    els.patientRail = rail;
    if (syncAuthRequiredChrome()) {
      rail.innerHTML = '';
      syncMobilePatientLayout();
      return;
    }
    rail.innerHTML = `
      <section class="patient-master-card patient-master-card-empty">
        <h2>Välj en kund</h2>
        <p>Öppna ett kundkort i listan för profil, journal och importerade filer.</p>
      </section>
    `;
    syncMobilePatientLayout();
  }

  function renderDetailLoadError(patientId, message) {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail) return;
    els.patientRail = rail;
    const offlineHint = isOnline() ? '' : ' Du verkar vara offline.';
    rail.innerHTML = `
      <section class="patient-master-card patient-master-card-error" data-patient-detail data-patient-load-error="true">
        <h2>Kunde inte ladda kund</h2>
        <p class="patient-master-muted">${escapeHtml(message || 'Nätverksfel')}${offlineHint}</p>
        <button type="button" class="customers-utility-button" data-patient-action="retry-detail-load">
          Försök igen
        </button>
      </section>
    `;
    syncMobilePatientLayout();
  }

  function renderDetailLoadingSkeleton(patientId) {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail) return;
    els.patientRail = rail;
    const cached = runtime.patients.find((row) => normalizeText(row?.patientId) === normalizeText(patientId));
    const displayName = cached?.displayName || 'Laddar kund…';
    const initials = String(displayName).slice(0, 2).toUpperCase();
    rail.innerHTML = `
      <section class="patient-master-card patient-master-card-loading" data-patient-detail data-patient-loading="true" aria-busy="true">
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml(initials)}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(displayName)}</h2>
              <p class="patient-master-muted patient-master-loading-line">Hämtar kundkort…</p>
            </div>
          </div>
        </article>
        <div class="patient-master-tabs" role="tablist" aria-hidden="true">${renderPatientPrimaryTabsSkeleton(runtime.detailTab)}
        </div>
        <div class="patient-master-detail-skeleton" aria-hidden="true">
          <div class="patient-master-detail-skeleton-bar"></div>
          <div class="patient-master-detail-skeleton-bar is-short"></div>
          <div class="patient-master-detail-skeleton-bar"></div>
        </div>
      </section>
    `;
    syncMobilePatientLayout();
    window.ArcanaMobileShell?.syncFromApp?.();
  }

  function fileViewUrl(file) {
    if (file?.viewUrl) return file.viewUrl;
    if (file?.id) return `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(file.id)}`;
    return '';
  }

  function attachmentViewUrl(attachment) {
    if (attachment?.fileId) {
      return `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(attachment.fileId)}`;
    }
    return '';
  }

  function journalPhotoUrl(photoId, variant = '') {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !photoId) return '';
    const params = new URLSearchParams({
      patientId,
      photoId: String(photoId),
    });
    if (variant) params.set('variant', variant);
    return `/api/v1/cco-journal/photo?${params.toString()}`;
  }

  function revokePhotoObjectUrls() {
    for (const bucket of [photoObjectUrls, fileObjectUrls]) {
      bucket.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      bucket.clear();
    }
  }

  async function fetchPatientFileObjectUrl(fileId) {
    const normalizedId = normalizeText(fileId);
    if (!normalizedId) return '';
    const primaryUrl = `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(normalizedId)}`;
    const token = getAdminToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(new URL(primaryUrl, window.location.origin), {
      headers,
      credentials: 'same-origin',
    });
    if (!response.ok) return '';
    let blob = await response.blob();
    const contentType = response.headers.get('content-type') || '';
    if (blob.type === '' && contentType) {
      blob = new Blob([blob], { type: contentType.split(';')[0] });
    }
    const objectUrl = URL.createObjectURL(blob);
    fileObjectUrls.add(objectUrl);
    return objectUrl;
  }

  async function hydratePatientFileImages(root = els.patientRail) {
    if (!root) return;
    const images = root.querySelectorAll('img[data-patient-file-id]');
    await Promise.all(
      Array.from(images).map(async (img) => {
        const fileId = normalizeText(img.dataset.patientFileId);
        if (!fileId || img.dataset.loaded === 'true') return;
        img.classList.add('is-loading');
        const objectUrl = await fetchPatientFileObjectUrl(fileId);
        img.classList.remove('is-loading');
        if (!objectUrl) {
          img.alt = 'Kunde inte visa bild';
          img.classList.add('is-broken');
          return;
        }
        img.src = objectUrl;
        img.dataset.loaded = 'true';
        const tileLink = img.closest('a.patient-master-image-tile');
        if (tileLink) tileLink.href = objectUrl;
      })
    );
  }

  async function fetchJournalPhotoObjectUrl(photoId, variant = '') {
    const primaryUrl = journalPhotoUrl(photoId, variant);
    if (!primaryUrl) return '';

    const token = getAdminToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const fetchPhoto = async (url) =>
      fetch(new URL(url, window.location.origin), {
        headers,
        credentials: 'same-origin',
      });

    let response = await fetchPhoto(primaryUrl);
    if (!response.ok && variant === 'annotated') {
      response = await fetchPhoto(journalPhotoUrl(photoId));
    }
    if (!response.ok) return '';

    let blob = await response.blob();
    const contentType = response.headers.get('content-type') || '';
    if (blob.type === '' && contentType.startsWith('image/')) {
      blob = new Blob([blob], { type: contentType.split(';')[0] });
    }
    const objectUrl = URL.createObjectURL(blob);
    photoObjectUrls.add(objectUrl);
    return objectUrl;
  }

  async function hydrateJournalPhotoElements(root = els.patientRail) {
    if (!root) return;
    const images = root.querySelectorAll('img[data-journal-photo-id]');
    await Promise.all(
      Array.from(images).map(async (img) => {
        const photoId = normalizeText(img.dataset.journalPhotoId);
        const variant = normalizeText(img.dataset.journalPhotoVariant);
        if (!photoId || img.dataset.loaded === 'true') return;
        img.classList.add('is-loading');
        const objectUrl = await fetchJournalPhotoObjectUrl(photoId, variant);
        img.classList.remove('is-loading');
        if (!objectUrl) {
          if (variant && !img.dataset.fallbackTried) {
            img.dataset.fallbackTried = 'true';
            img.dataset.journalPhotoVariant = '';
            void hydrateJournalPhotoElements(root);
            return;
          }
          img.alt = 'Kunde inte visa bild';
          img.classList.add('is-broken');
          img.closest('.patient-master-plan-photo')?.classList.add('is-broken-photo');
          const link = img.closest('a[data-journal-photo-link]');
          if (link && !link.dataset.brokenLabel) {
            link.dataset.brokenLabel = 'true';
            link.textContent = 'Bilden kunde inte laddas';
          }
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'customers-utility-button';
          retry.textContent = 'Visa bild igen';
          retry.addEventListener('click', () => {
            img.dataset.loaded = '';
            img.dataset.fallbackTried = '';
            img.classList.remove('is-broken');
            void hydrateJournalPhotoElements(root);
          });
          img.insertAdjacentElement('afterend', retry);
          return;
        }
        img.onerror = () => {
          if (variant && !img.dataset.fallbackTried) {
            img.dataset.fallbackTried = 'true';
            img.dataset.journalPhotoVariant = '';
            img.dataset.loaded = '';
            img.removeAttribute('src');
            void hydrateJournalPhotoElements(root);
          }
        };
        img.src = objectUrl;
        img.dataset.loaded = 'true';
        const previewLink = img.closest('a[data-journal-photo-link]');
        if (previewLink) previewLink.href = objectUrl;
      })
    );
  }

  function bindJournalPhotoOpenLinks(root = els.patientRail) {
    if (!root) return;
    root.querySelectorAll('[data-journal-photo-open]').forEach((link) => {
      if (link.dataset.boundJournalPhotoOpen === 'true') return;
      link.dataset.boundJournalPhotoOpen = 'true';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const photoId = normalizeText(link.dataset.journalPhotoOpen);
        if (!photoId) return;

        const figure = link.closest('.patient-master-plan-photo');
        const annotateButton = figure?.querySelector('[data-patient-annotate-photo]');
        if (
          annotateButton &&
          runtime.mode === 'register' &&
          window.matchMedia('(max-width: 768px)').matches
        ) {
          void openPlanEditor(
            annotateButton.dataset.patientEntryId,
            annotateButton.dataset.patientAnnotatePhoto,
            annotateButton.dataset.patientPhotoId
          );
          return;
        }

        void fetchJournalPhotoObjectUrl(photoId).then((objectUrl) => {
          if (objectUrl) window.open(objectUrl, '_blank', 'noopener');
        });
      });
    });
  }

  function isPreviewableImage(file) {
    const name = String(file?.fileName || file?.relativePath || '').toLowerCase();
    return file?.fileType === 'image' || /\.(jpe?g|png|webp|gif|heic|heif|dng)$/i.test(name);
  }

  function isJournalPdf(file) {
    const name = String(file?.fileName || file?.relativePath || '').toLowerCase();
    return file?.fileType === 'journal_pdf' || name.endsWith('.pdf');
  }

  function renderFilesEmpty(card) {
    if (!card?.personnummer) {
      return `
        <p class="patient-master-muted">Inga Drive-filer — personnummer saknas.</p>
        <p class="patient-master-muted">Bilder och journal-PDF importeras från Google Drive-mappar som är namngivna med personnummer. Cliento-kunder utan matchning får inga filer ännu.</p>
      `;
    }
    if (!card?.driveLinked) {
      return `
        <p class="patient-master-muted">Inga indexerade Drive-filer för detta personnummer.</p>
        <p class="patient-master-muted">Kör migration scan om zip/mappar lagts till efter senaste import.</p>
      `;
    }
    return '<p class="patient-master-muted">Inga indexerade Drive-filer för detta personnummer.</p>';
  }

  function fileOccasion(file) {
    return file?.occasionContext && typeof file.occasionContext === 'object'
      ? file.occasionContext
      : {};
  }

  function renderOccasionGroup(group) {
    const images = group.files.filter(isPreviewableImage);
    const pdfs = group.files.filter(isJournalPdf);
    const other = group.files.filter((file) => !isPreviewableImage(file) && !isJournalPdf(file));

    const metaBits = [
      pdfs.length ? `${pdfs.length} PDF` : '',
      images.length ? `${images.length} bild${images.length === 1 ? '' : 'er'}` : '',
    ].filter(Boolean);

    const pdfList = pdfs.length
      ? `
        <ul class="patient-master-file-list patient-master-file-list--compact">
          ${pdfs
        .map((file) => {
          const href = fileViewUrl(file);
          const label = escapeHtml(repairDisplayFilename(file.fileName || file.relativePath || 'PDF'));
          return `
                <li>
                  <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>
                  <span>PDF</span>
                </li>
              `;
        })
        .join('')}
        </ul>
      `
      : '';

    const imageGrid = images.length
      ? `
        <div class="patient-master-file-section patient-master-file-section--compact">
          <div class="patient-master-image-grid">
            ${images
        .map((file) => {
          const href = fileViewUrl(file);
          const label = escapeHtml(repairDisplayFilename(file.fileName || 'Bild'));
          return `
                  <a class="patient-master-image-tile" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${label}">
                    <img src="" data-patient-file-id="${escapeHtml(file.id)}" alt="${label}" loading="lazy" decoding="async" />
                  </a>
                `;
        })
        .join('')}
          </div>
        </div>
      `
      : '';

    const otherList = other.length
      ? `
        <ul class="patient-master-file-list patient-master-file-list--compact">
          ${other
        .map((file) => {
          const href = fileViewUrl(file);
          const label = escapeHtml(repairDisplayFilename(file.fileName || file.relativePath || 'Fil'));
          const link = href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>`
            : `<strong>${label}</strong>`;
          return `
                <li>
                  ${link}
                  <span>${escapeHtml(file.fileType || 'fil')}</span>
                </li>
              `;
        })
        .join('')}
        </ul>
      `
      : '';

    return `
      <section class="patient-master-segment">
        <header class="patient-master-segment-head">
          <h4>${escapeHtml(group.timelineLabel)}</h4>
          ${metaBits.length
        ? `<span class="patient-master-segment-meta">${escapeHtml(metaBits.join(' · '))}</span>`
        : ''
      }
        </header>
        ${pdfList}
        ${imageGrid}
        ${otherList}
      </section>
    `;
  }

  function renderDriveFiles(files, card) {
    const rows = asArray(files);
    if (!rows.length) {
      return renderFilesEmpty(card);
    }
    return groupFilesByOccasion(rows)
      .map((group) => renderOccasionGroup(group))
      .join('');
  }

  function renderMaterialPreview(files, card) {
    const rows = asArray(files);
    const total = Number(card?.fileSummary?.totalFiles || rows.length || 0);
    if (!total) {
      return `
        <article class="focus-customer-data-card patient-master-history-card">
          <h4>Kundhistorik</h4>
          ${renderFilesEmpty(card)}
        </article>
      `;
    }

    const journalPdfs = Number(card.fileSummary?.journalPdfs || 0);
    const images = Number(card.fileSummary?.images || 0);

    return `
      <article class="focus-customer-data-card patient-master-history-card">
        <div class="patient-master-material-head">
          <h4>Kundhistorik</h4>
          <p class="patient-master-muted">${journalPdfs} journal-PDF · ${images} bilder · ${total} filer</p>
        </div>
        <div class="patient-master-history-segments">
          ${renderDriveFiles(rows, card)}
        </div>
      </article>
    `;
  }

  function groupFilesByOccasion(files) {
    const groups = new Map();
    for (const file of asArray(files)) {
      const ctx = fileOccasion(file);
      const key = ctx.timelineKey || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          timelineKey: key,
          timelineLabel:
            ctx.timelineLabel || ctx.capturedLabel || ctx.occasionLabel || 'Okänt tillfälle',
          timelineSort: ctx.timelineSort || '0000-00-00',
          capturedLabel: ctx.capturedLabel || '',
          occasionLabel: ctx.occasionLabel || '',
          files: [],
        });
      }
      groups.get(key).files.push(file);
    }
    return [...groups.values()].sort((a, b) =>
      String(b.timelineSort || '').localeCompare(String(a.timelineSort || ''))
    );
  }

  function hasSignedHealthDeclaration(entries) {
    return asArray(entries).some(
      (entry) =>
        entry.journalType === 'health_declaration' &&
        (entry.locked || entry.signedAt || entry.signatureStatus === 'signed')
    );
  }

  function hasHealthDeclarationDraft(entries) {
    return asArray(entries).some((entry) => entry.journalType === 'health_declaration');
  }

  function renderJournalWorkflowCallout(entries) {
    const rows = asArray(entries);
    const planEntry = findConsultationPlanEntry(entries);
    const linkedOffer =
      planEntry && runtime.commercialCase?.linkedJournalEntryId === planEntry.entryId
        ? runtime.commercialCase
        : null;
    const photos = planEntry
      ? asArray(planEntry.attachments).filter((item) => item.type === 'consultation_photo')
      : [];
    const steps = [
      { label: 'Hälsodeklaration', done: rows.some((e) => e.journalType === 'health_declaration') },
      { label: 'Skapa behandlingsplan', done: !!planEntry },
      {
        label: 'Ta bilder och markera zoner',
        done: photos.some((photo) => photo.hasAnnotation),
      },
      { label: 'Skapa offert från plan', done: !!linkedOffer?.offerDocumentId },
    ];

    return `
      <article class="focus-customer-data-card patient-master-workflow-card">
        <div class="patient-master-material-head">
          <h4>Behandlingsplan & offert</h4>
          <button type="button" class="customers-utility-button" data-patient-tab-jump="journal">
            Öppna Journal →
          </button>
        </div>
        <p class="patient-master-muted">Nytt arbete sker under <strong>Journal</strong>: ta bild, markera zoner och skapa offert.</p>
        <ol class="patient-master-workflow-steps">
          ${steps
        .map(
          (step) =>
            `<li class="${step.done ? 'is-done' : ''}">${escapeHtml(step.label)}${step.done ? ' ✓' : ''
            }</li>`
        )
        .join('')}
        </ol>
      </article>
    `;
  }

  function renderJournalToolbar(card, entries) {
    const uploadBlocked = isPlanUploadBlocked(entries);
    const healthReady = hasSignedHealthDeclaration(entries);
    const planBlocked = !healthReady;
    const disabledAttr = uploadBlocked ? ' disabled' : '';
    const disabledClass = uploadBlocked ? ' is-disabled' : '';
    const planDisabledAttr = planBlocked ? ' disabled' : '';
    const planDisabledClass = planBlocked ? ' is-disabled' : '';
    return `
      <div class="patient-master-journal-intro">
        <h4>Journalverktyg</h4>
        <p class="patient-master-muted">Ta bild direkt i konsultationen, markera zoner och skapa offert här.</p>
      </div>
      <div class="patient-master-journal-toolbar">
        <label class="customers-utility-button patient-master-camera-button patient-master-upload-button${disabledClass}">
          Ta bild
          <input type="file" accept="image/*" capture="environment" hidden data-patient-photo-camera${disabledAttr} />
        </label>
        <label class="customers-utility-button patient-master-upload-button${disabledClass}">
          Välj från galleri
          <input type="file" accept="image/*,.heic,.heif" multiple hidden data-patient-photo-gallery${disabledAttr} />
        </label>
        <button class="customers-utility-button${planDisabledClass}" type="button" data-patient-action="new-consultation-plan"${planDisabledAttr}>
          Behandlingsplan
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="import-historical">
          Importera historik
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-health-declaration">
          Hälsodekl
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-fitness-certificate">
          Friskförsäkran
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-tp-journal">
          TP-journal
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-prp-journal">
          PRP-journal
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-follow-up-journal">
          Uppföljning
        </button>
      </div>
      ${uploadBlocked
        ? `<p class="patient-master-upload-blocked">Behandlingsplanen är signerad och låst. Skapa en ny plan om du ska ta fler bilder.</p>`
        : planBlocked
          ? `<p class="patient-master-upload-blocked">Signera hälsodeklarationen innan du skapar behandlingsplan.</p>`
          : ''
      }
      <p class="patient-master-muted">${Number(card.fileSummary?.journalPdfs || 0)} journal-PDF i index · ${Number(card.fileSummary?.images || 0)} bilder</p>
    `;
  }

  function findConsultationPlanEntry(entries) {
    const rows = asArray(entries);
    return (
      rows.find((entry) => entry.journalType === 'consultation_plan' && entry.canEdit) ||
      rows.find((entry) => entry.journalType === 'consultation_plan') ||
      null
    );
  }

  function renderOfferTemplateSelect(selectedKey) {
    const templates = asArray(runtime.offerTemplates);
    if (!templates.length) {
      return '';
    }
    return `
      <label class="patient-master-offer-template">
        <span class="patient-master-muted">Offertmall</span>
        <select data-patient-offer-template>
          ${templates
        .map(
          (template) =>
            `<option value="${escapeHtml(template.key)}"${template.key === selectedKey ? ' selected' : ''
            }>${escapeHtml(template.label)}</option>`
        )
        .join('')}
        </select>
      </label>
    `;
  }

  function renderOfferStatusMeta(linkedOffer) {
    if (!linkedOffer) return '';
    const bits = [];
    if (linkedOffer.offerTemplateKey) {
      bits.push(`Mall: ${linkedOffer.offerTemplateKey}`);
    }
    if (linkedOffer.coolingOffEndsAt) {
      bits.push(`Betänketid till ${String(linkedOffer.coolingOffEndsAt).slice(0, 10)}`);
    }
    if (linkedOffer.quoteAcceptedAt) {
      bits.push(`Accepterad ${String(linkedOffer.quoteAcceptedAt).slice(0, 10)}`);
    }
    if (!bits.length) return '';
    if (isMobileViewport()) {
      return `<div class="patient-master-offer-meta-badges">${bits
        .map(
          (bit, index) =>
            `<span class="patient-master-status-badge${index === 0 ? ' is-accent' : ''}">${escapeHtml(bit)}</span>`
        )
        .join('')}</div>`;
    }
    return `<p class="patient-master-muted">${escapeHtml(bits.join(' · '))}</p>`;
  }

  let offerWizardEntryId = '';
  let offerWizardStep = 1;
  let offerWizardPreviewHtml = '';

  function ensureMobileOfferWizard() {
    let shell = document.getElementById('cco-mobile-offer-wizard');
    if (shell) return shell;

    shell = document.createElement('div');
    shell.id = 'cco-mobile-offer-wizard';
    shell.className = 'cco-mobile-offer-wizard';
    shell.hidden = true;
    shell.innerHTML = `
      <div class="cco-mobile-offer-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="cco-mobile-offer-wizard-title">
        <div class="cco-mobile-offer-wizard-steps" aria-hidden="true">
          <span class="cco-mobile-offer-wizard-step is-active" data-offer-wizard-step-indicator="1">1 Pris</span>
          <span class="cco-mobile-offer-wizard-step" data-offer-wizard-step-indicator="2">2 Anteckning</span>
          <span class="cco-mobile-offer-wizard-step" data-offer-wizard-step-indicator="3">3 Förhandsgranska</span>
        </div>
        <h3 id="cco-mobile-offer-wizard-title">Skapa offert</h3>
        <form data-mobile-offer-wizard-form>
          <div data-mobile-offer-wizard-step="1">
            <label class="cco-mobile-offer-wizard-field">
              <span>Pris i offerten</span>
              <input type="text" name="quotedAmount" placeholder="t.ex. 75 000 kr" autocomplete="off" />
            </label>
            <label class="cco-mobile-offer-wizard-field">
              <span>Deposition (valfritt)</span>
              <input type="text" name="depositAmount" placeholder="t.ex. 5 000 kr" autocomplete="off" />
            </label>
            <label class="cco-mobile-offer-wizard-field">
              <span>Offertmall</span>
              <select name="templateKey" data-mobile-offer-wizard-template></select>
            </label>
          </div>
          <div data-mobile-offer-wizard-step="2" hidden>
            <label class="cco-mobile-offer-wizard-field">
              <span>Anteckning till kund</span>
              <textarea name="notesToCustomer" rows="3" placeholder="Syns i offerten"></textarea>
            </label>
            <label class="cco-mobile-offer-wizard-field">
              <span>Intern anteckning</span>
              <textarea name="internalNotes" rows="3" placeholder="Bara för personal"></textarea>
            </label>
          </div>
          <div data-mobile-offer-wizard-step="3" hidden>
            <p class="patient-master-muted" data-mobile-offer-wizard-summary></p>
            <div class="cco-mobile-offer-wizard-preview-wrap">
              <iframe class="cco-mobile-offer-wizard-preview" data-mobile-offer-wizard-preview title="Förhandsgranskning av offert"></iframe>
            </div>
            <p class="patient-master-muted cco-mobile-offer-wizard-preview-hint" data-mobile-offer-wizard-preview-hint hidden>
              Förhandsgranskning kunde inte laddas — du kan fortfarande skapa offerten.
            </p>
          </div>
          <div class="cco-mobile-offer-wizard-actions">
            <button type="button" class="customers-utility-button" data-mobile-offer-wizard-cancel>Avbryt</button>
            <button type="button" class="customers-utility-button" data-mobile-offer-wizard-back hidden>Tillbaka</button>
            <button type="button" class="customers-utility-button" data-mobile-offer-wizard-next>Nästa</button>
            <button type="submit" class="customers-utility-button" data-mobile-offer-wizard-submit hidden>Skapa offert</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(shell);

    shell.querySelector('[data-mobile-offer-wizard-cancel]')?.addEventListener('click', closeMobileOfferWizard);
    shell.querySelector('[data-mobile-offer-wizard-back]')?.addEventListener('click', () => {
      setMobileOfferWizardStep(Math.max(1, offerWizardStep - 1));
    });
    shell.querySelector('[data-mobile-offer-wizard-next]')?.addEventListener('click', () => {
      const form = shell.querySelector('[data-mobile-offer-wizard-form]');
      if (offerWizardStep === 1) {
        const quotedAmount = normalizeText(form?.quotedAmount?.value);
        if (!quotedAmount) {
          setStatus('Ange pris i offerten.', 'error');
          return;
        }
        setMobileOfferWizardStep(2);
        return;
      }
      if (offerWizardStep === 2) {
        setMobileOfferWizardStep(3);
      }
    });
    shell.querySelector('[data-mobile-offer-wizard-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitMobileOfferWizard();
    });

    return shell;
  }

  function populateMobileOfferWizardTemplates(selectNode) {
    if (!selectNode) return;
    const templates = asArray(runtime.offerTemplates);
    selectNode.innerHTML = templates.length
      ? templates
        .map(
          (template) =>
            `<option value="${escapeHtml(template.key)}">${escapeHtml(template.label || template.key)}</option>`
        )
        .join('')
      : '<option value="custom">Anpassad</option>';
  }

  function readMobileOfferWizardForm() {
    const form = document.querySelector('[data-mobile-offer-wizard-form]');
    return {
      quotedAmount: normalizeText(form?.quotedAmount?.value),
      depositAmount: normalizeText(form?.depositAmount?.value),
      templateKey: normalizeText(form?.templateKey?.value) || 'custom',
      notesToCustomer: normalizeText(form?.notesToCustomer?.value),
      internalNotes: normalizeText(form?.internalNotes?.value),
    };
  }

  async function loadMobileOfferPreview() {
    const entryId = offerWizardEntryId;
    const patientId = runtime.selectedPatientId;
    const shell = document.getElementById('cco-mobile-offer-wizard');
    if (!shell || !patientId || !entryId) return;
    const formValues = readMobileOfferWizardForm();
    const previewFrame = shell.querySelector('[data-mobile-offer-wizard-preview]');
    const previewHint = shell.querySelector('[data-mobile-offer-wizard-preview-hint]');
    if (previewFrame) previewFrame.removeAttribute('srcdoc');
    if (previewHint) previewHint.hidden = true;
    offerWizardPreviewHtml = '';
    setStatus('Laddar förhandsgranskning…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-from-plan', {
        method: 'POST',
        body: {
          patientId,
          entryId,
          ...formValues,
          previewOnly: true,
        },
      });
      offerWizardPreviewHtml = payload.previewHtml || '';
      if (previewFrame && offerWizardPreviewHtml) {
        previewFrame.srcdoc = offerWizardPreviewHtml;
      } else if (previewHint) {
        previewHint.hidden = false;
      }
      setStatus('', '');
    } catch (error) {
      if (previewHint) previewHint.hidden = false;
      setStatus(error.message || 'Kunde inte förhandsgranska offerten.', 'error');
    }
  }

  function setMobileOfferWizardStep(step) {
    offerWizardStep = step >= 3 ? 3 : step >= 2 ? 2 : 1;
    const shell = document.getElementById('cco-mobile-offer-wizard');
    if (!shell) return;
    shell.querySelector('[data-mobile-offer-wizard-step="1"]').hidden = offerWizardStep !== 1;
    shell.querySelector('[data-mobile-offer-wizard-step="2"]').hidden = offerWizardStep !== 2;
    shell.querySelector('[data-mobile-offer-wizard-step="3"]').hidden = offerWizardStep !== 3;
    shell.querySelector('[data-mobile-offer-wizard-back]').hidden = offerWizardStep === 1;
    shell.querySelector('[data-mobile-offer-wizard-next]').hidden = offerWizardStep === 3;
    shell.querySelector('[data-mobile-offer-wizard-submit]').hidden = offerWizardStep !== 3;
    shell.querySelectorAll('[data-offer-wizard-step-indicator]').forEach((node) => {
      const nodeStep = Number(node.getAttribute('data-offer-wizard-step-indicator') || 0);
      node.classList.toggle('is-active', nodeStep === offerWizardStep);
      node.classList.toggle('is-done', nodeStep < offerWizardStep);
    });

    if (offerWizardStep === 3) {
      const formValues = readMobileOfferWizardForm();
      const templateLabel =
        asArray(runtime.offerTemplates).find((item) => item.key === formValues.templateKey)?.label ||
        formValues.templateKey;
      const summary = shell.querySelector('[data-mobile-offer-wizard-summary]');
      if (summary) {
        const noteBits = [
          formValues.notesToCustomer ? `Till kund: ${formValues.notesToCustomer}` : '',
          formValues.internalNotes ? `Internt: ${formValues.internalNotes}` : '',
        ].filter(Boolean);
        summary.textContent = `Offert på ${formValues.quotedAmount || '—'}${formValues.depositAmount ? ` med deposition ${formValues.depositAmount}` : ''
          } (${templateLabel || 'Anpassad'}).${noteBits.length ? ` ${noteBits.join(' · ')}` : ''}`;
      }
      void loadMobileOfferPreview();
    }
  }

  function openMobileOfferWizard(entryId) {
    if (!isMobileViewport()) return false;
    offerWizardEntryId = normalizeText(entryId);
    const shell = ensureMobileOfferWizard();
    populateMobileOfferWizardTemplates(shell.querySelector('[data-mobile-offer-wizard-template]'));
    const form = shell.querySelector('[data-mobile-offer-wizard-form]');
    if (form) {
      form.reset();
      if (form.templateKey && !form.templateKey.value) {
        form.templateKey.value = 'custom';
      }
      const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
      const fields =
        planEntry?.fields && typeof planEntry.fields === 'object' ? planEntry.fields : {};
      if (form.notesToCustomer) form.notesToCustomer.value = fields.notes || '';
      if (form.internalNotes) form.internalNotes.value = fields.staffNotes || '';
    }
    setMobileOfferWizardStep(1);
    shell.hidden = false;
    shell.dataset.open = 'true';
    shell.querySelector('[name="quotedAmount"]')?.focus?.();
    return true;
  }

  function closeMobileOfferWizard() {
    const shell = document.getElementById('cco-mobile-offer-wizard');
    if (shell) {
      shell.hidden = true;
      shell.dataset.open = 'false';
      shell.querySelector('[data-mobile-offer-wizard-preview]')?.removeAttribute('srcdoc');
    }
    offerWizardEntryId = '';
    offerWizardStep = 1;
    offerWizardPreviewHtml = '';
  }

  async function submitMobileOfferWizard() {
    const entryId = offerWizardEntryId;
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId) return;
    const formValues = readMobileOfferWizardForm();
    if (!formValues.quotedAmount) {
      setStatus('Ange pris i offerten.', 'error');
      setMobileOfferWizardStep(1);
      return;
    }
    closeMobileOfferWizard();
    setStatus('Skapar offert från behandlingsplan…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-from-plan', {
        method: 'POST',
        body: {
          patientId,
          entryId,
          ...formValues,
        },
      });
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerDocumentUrl = payload.offerDocumentUrl || '';
      runtime.offerDocumentPdfUrl = payload.offerDocumentPdfUrl || '';
      runtime.offerDocumentWordUrl = payload.offerDocumentWordUrl || '';
      setStatus('Offert skapad från behandlingsplan.', 'success');
      runtime.detailTab = 'journal';
      if (payload.offerDocumentPdfUrl) {
        window.open(payload.offerDocumentPdfUrl, '_blank', 'noopener');
      } else if (payload.offerDocumentUrl) {
        window.open(payload.offerDocumentUrl, '_blank', 'noopener');
      }
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa offert.', 'error');
    }
  }

  function renderConsultationPlanSection(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    if (!planEntry) {
      return `
        <article class="focus-customer-data-card patient-master-plan-card">
          <h4>Konsultation — behandlingsplan</h4>
          <p class="patient-master-muted">Skapa en plan och ladda upp bilder från konsultationen. Markera zoner direkt på bilden.</p>
        </article>
      `;
    }

    const photos = asArray(planEntry.attachments).filter(
      (item) => item.type === 'consultation_photo' && item.photoId
    );
    const fields = planEntry.fields && typeof planEntry.fields === 'object' ? planEntry.fields : {};
    const summaryBits = [
      fields.method ? `Metod: ${fields.method}` : '',
      fields.graftsTotal ? `Grafts: ${fields.graftsTotal}` : '',
      Array.isArray(fields.zones) && fields.zones.length ? `Zoner: ${fields.zones.join(', ')}` : '',
    ].filter(Boolean);

    const commercial = runtime.commercialCase;
    const linkedOffer = commercial?.linkedJournalEntryId === planEntry.entryId ? commercial : null;
    const offerDocumentUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentUrl || '';
    const offerPdfUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document.pdf?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentPdfUrl || '';
    const offerWordUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document.doc?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentWordUrl || '';
    const canSendForSign = linkedOffer && linkedOffer.quoteStatus !== 'accepted';
    const canAccept =
      linkedOffer && linkedOffer.quoteStatus === 'sent' && linkedOffer.quoteStatus !== 'accepted';
    const coolingActive =
      linkedOffer?.coolingOffEndsAt && Date.parse(linkedOffer.coolingOffEndsAt) > Date.now();

    const offerBody = `
        <div class="patient-master-offer-box">
          <div class="patient-master-material-head">
            <h4>Offert</h4>
            ${linkedOffer
        ? `<span class="patient-master-occasion-badge is-compact">${escapeHtml(linkedOffer.quoteStatus || 'draft')}</span>`
        : ''
      }
          </div>
          ${linkedOffer
        ? `<p class="patient-master-muted">${escapeHtml(linkedOffer.offerType || 'Offert')} · ${escapeHtml(linkedOffer.quotedAmount || 'Pris ej satt')}</p>`
        : `<p class="patient-master-muted">Skapa offert från planen när bilder är markerade och planen är klar.</p>`
      }
          ${renderOfferStatusMeta(linkedOffer)}
          ${renderOfferTemplateSelect(linkedOffer?.offerTemplateKey || 'custom')}
          <div class="patient-master-plan-photo-actions">
            <button type="button" class="customers-utility-button" data-patient-action="create-offer-from-plan" data-patient-entry-id="${escapeHtml(planEntry.entryId)}">
              ${linkedOffer ? 'Uppdatera offert från plan' : 'Skapa offert från plan'}
            </button>
            ${offerDocumentUrl
        ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerDocumentUrl)}" target="_blank" rel="noopener">Visa offert</a>`
        : ''
      }
            ${offerPdfUrl
        ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerPdfUrl)}" target="_blank" rel="noopener">Ladda ner PDF</a>`
        : ''
      }
            ${offerWordUrl
        ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerWordUrl)}" target="_blank" rel="noopener">Word-mall</a>`
        : ''
      }
            ${canSendForSign
        ? `<button type="button" class="customers-utility-button" data-patient-action="send-offer-for-sign">Skicka för signering</button>`
        : ''
      }
            ${canAccept
        ? `<button type="button" class="customers-utility-button" data-patient-action="accept-offer"${coolingActive ? ' data-patient-force-offer="1"' : ''}>${coolingActive ? 'Acceptera (override betänketid)' : 'Kund accepterar'
        }</button>`
        : ''
      }
          </div>
          ${runtime.offerSignUrl
        ? `<p class="patient-master-muted">Signeringssida: <a href="${escapeHtml(runtime.offerSignUrl)}" target="_blank" rel="noopener">${escapeHtml(runtime.offerSignUrl)}</a></p>`
        : linkedOffer?.esignStatus === 'sent' && linkedOffer?.esignToken
          ? `<p class="patient-master-muted">Signeringssida: <a href="/api/v1/cco-commercial/offer-sign-page?token=${encodeURIComponent(linkedOffer.esignToken)}" target="_blank" rel="noopener">Öppna kundsignering</a></p>`
          : ''
      }
        </div>`;

    const planBody = `
      <article class="focus-customer-data-card patient-master-plan-card">
        <div class="patient-master-material-head">
          <h4>${escapeHtml(planEntry.title || 'Konsultation — behandlingsplan')}</h4>
          <span class="patient-master-muted">${escapeHtml(planEntry.status || 'draft')}</span>
        </div>
        ${summaryBits.length
        ? `<p class="patient-master-muted">${escapeHtml(summaryBits.join(' · '))}</p>`
        : ''
      }
        ${fields.notes ? `<p class="patient-master-plan-notes"><strong>Till kund:</strong> ${escapeHtml(fields.notes)}</p>` : ''
      }
        ${fields.staffNotes
        ? `<p class="patient-master-plan-notes patient-master-plan-notes-internal"><strong>Internt:</strong> ${escapeHtml(fields.staffNotes)}</p>`
        : ''
      }
        ${fields.bookingSlotStart || planEntry.treatmentEncounterId
        ? `<p class="patient-master-muted">Bokning: ${escapeHtml(fields.bookingSlotStart || '—')}${fields.bookingServiceId ? ` · ${escapeHtml(fields.bookingServiceId)}` : ''}${planEntry.treatmentEncounterId ? ` · tillfälle ${escapeHtml(planEntry.treatmentEncounterId.slice(0, 8))}` : ''}</p>`
        : ''
      }
        ${photos.length
        ? `<div class="patient-master-plan-photo-toolbar">
                <span class="patient-master-muted">${photos.length} bilder</span>
                ${planEntry.canEdit
          ? `<button type="button" class="customers-utility-button patient-master-photo-clear-smoke" data-patient-clear-smoke-photos="${escapeHtml(planEntry.entryId)}">Rensa smoke-bilder</button>
                    <button type="button" class="customers-utility-button patient-master-photo-clear-all" data-patient-clear-plan-photos="${escapeHtml(planEntry.entryId)}">Rensa alla bilder</button>`
          : ''
        }
              </div>
              <div class="patient-master-plan-photo-grid">
                ${photos
          .map((photo) => {
            const variant = photo.annotatedPreviewAvailable ? 'annotated' : '';
            return `
                      <figure class="patient-master-plan-photo">
                        <div class="patient-master-plan-photo-media">
                          <a class="patient-master-plan-photo-link" href="#" data-journal-photo-link data-journal-photo-open="${escapeHtml(photo.photoId)}">
                            <img
                              data-journal-photo-id="${escapeHtml(photo.photoId)}"
                              data-journal-photo-variant="${escapeHtml(variant)}"
                              src=""
                              alt="${escapeHtml(photo.fileName || photo.label || 'Konsultationsbild')}"
                              loading="lazy"
                            />
                          </a>
                          ${planEntry.canEdit
                ? `<button type="button" class="patient-master-plan-photo-remove" data-patient-delete-photo="${escapeHtml(photo.photoId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-attachment-id="${escapeHtml(photo.attachmentId)}" aria-label="Ta bort bild" title="Ta bort bild"><span aria-hidden="true">×</span></button>`
                : ''
              }
                        </div>
                        <figcaption>
                          <strong>${escapeHtml(photo.label || photo.fileName || 'Bild')}</strong>
                          ${photo.hasAnnotation
                ? '<span class="patient-master-occasion-badge is-compact">Markerad</span>'
                : ''
              }
                        </figcaption>
                        <div class="patient-master-plan-photo-actions">
                          ${planEntry.canEdit
                ? `<button type="button" class="customers-utility-button" data-patient-annotate-photo="${escapeHtml(photo.attachmentId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-photo-id="${escapeHtml(photo.photoId)}">Markera plan</button>`
                : ''
              }
                          ${planEntry.canEdit
                ? `<button type="button" class="customers-utility-button patient-master-photo-delete" data-patient-delete-photo="${escapeHtml(photo.photoId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-attachment-id="${escapeHtml(photo.attachmentId)}">Ta bort</button>`
                : ''
              }
                          <a class="patient-master-open-link" href="#" data-journal-photo-open="${escapeHtml(photo.photoId)}">Original</a>
                        </div>
                      </figure>
                    `;
          })
          .join('')}
              </div>`
        : `<p class="patient-master-muted">Inga bilder ännu. Tryck <strong>Ta bild</strong> ovan.</p>`
      }
        ${planEntry.canSign
        ? `<button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(planEntry.entryId)}">Signera behandlingsplan</button>`
        : ''
      }
      </article>`;

    return (
      wrapJournalCollapse('Behandlingsplan', planBody, { open: true }) +
      wrapJournalCollapse('Offert', offerBody, { open: Boolean(linkedOffer) })
    );
  }

  function findTpJournalEntry(entries, entryId) {
    if (!entryId) return null;
    return (
      asArray(entries).find(
        (entry) => entry.journalType === 'tp_treatment' && entry.entryId === entryId
      ) || null
    );
  }

  function findPrpJournalEntry(entries, entryId) {
    if (!entryId) return null;
    return (
      asArray(entries).find(
        (entry) => entry.journalType === 'prp_treatment' && entry.entryId === entryId
      ) || null
    );
  }

  function findFollowUpJournalEntry(entries, entryId) {
    if (!entryId) return null;
    return (
      asArray(entries).find(
        (entry) => entry.journalType === 'follow_up' && entry.entryId === entryId
      ) || null
    );
  }

  function bindJournalAutosaveForms() {
    if (!isMobileViewport() || !window.ArcanaMobileAutosave?.bindForm) return;
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;

    document.querySelectorAll('[data-clinical-journal-save-form]').forEach((form) => {
      const formKey = normalizeText(form.dataset.clinicalFormKey) || runtime.editingClinicalFormKey;
      const entryId = normalizeText(form.dataset.clinicalEntryId) || runtime.editingClinicalEntryId;
      const config = window.ArcanaJournalClinicalForms?.[formKey];
      if (!config?.readForm || !entryId) return;
      const entryRoot = form.querySelector('[data-clinical-journal-form]');
      window.ArcanaMobileAutosave.bindForm(form, {
        patientId,
        entryId,
        formKey,
        readFields: () => config.readForm(entryRoot),
        onSync: async (fields) => {
          await apiRequest('/api/v1/cco-journal/entry', {
            method: 'PUT',
            body: {
              patientId,
              entryId,
              personnummer: card.personnummer || '',
              journalType: config.journalType,
              title: config.title,
              fields,
            },
          });
        },
      });
      window.ArcanaMobileAutosave.initMobileStepper(form);
    });

    document.querySelectorAll('[data-tp-journal-save-form]').forEach((form) => {
      const entryId = normalizeText(form.dataset.tpEntryId) || runtime.editingTpEntryId;
      const tpForm = window.ArcanaJournalTpForm;
      if (!tpForm?.readForm || !entryId) return;
      const entryRoot = form.querySelector('[data-tp-journal-form]');
      window.ArcanaMobileAutosave.bindForm(form, {
        patientId,
        entryId,
        formKey: 'tp_treatment',
        readFields: () => tpForm.readForm(entryRoot),
        onSync: async (fields) => {
          await apiRequest('/api/v1/cco-journal/entry', {
            method: 'PUT',
            body: {
              patientId,
              entryId,
              personnummer: card.personnummer || '',
              journalType: 'tp_treatment',
              title: 'TP behandlingsjournal',
              fields,
            },
          });
        },
      });
      window.ArcanaMobileAutosave.initMobileStepper(form);
    });

    document.querySelectorAll('[data-prp-journal-save-form]').forEach((form) => {
      const entryId = normalizeText(form.dataset.prpEntryId) || runtime.editingPrpEntryId;
      const prpForm = window.ArcanaJournalPrpForm;
      if (!prpForm?.readForm || !entryId) return;
      const entryRoot = form.querySelector('[data-prp-journal-form]');
      window.ArcanaMobileAutosave.bindForm(form, {
        patientId,
        entryId,
        formKey: 'prp_treatment',
        readFields: () => prpForm.readForm(entryRoot),
        onSync: async (fields) => {
          await apiRequest('/api/v1/cco-journal/entry', {
            method: 'PUT',
            body: {
              patientId,
              entryId,
              personnummer: card.personnummer || '',
              journalType: 'prp_treatment',
              title: 'PRP behandlingsjournal',
              fields,
            },
          });
        },
      });
      window.ArcanaMobileAutosave.initMobileStepper(form);
    });

    document.querySelectorAll('[data-follow-journal-save-form]').forEach((form) => {
      const entryId = normalizeText(form.dataset.followEntryId) || runtime.editingFollowUpEntryId;
      const followForm = window.ArcanaJournalFollowUpForm;
      if (!followForm?.readForm || !entryId) return;
      const entryRoot = form.querySelector('[data-follow-journal-form]');
      window.ArcanaMobileAutosave.bindForm(form, {
        patientId,
        entryId,
        formKey: 'follow_up',
        readFields: () => followForm.readForm(entryRoot),
        onSync: async (fields) => {
          await apiRequest('/api/v1/cco-journal/entry', {
            method: 'PUT',
            body: {
              patientId,
              entryId,
              personnummer: card.personnummer || '',
              journalType: 'follow_up',
              title: 'Uppföljning',
              fields,
            },
          });
        },
      });
      window.ArcanaMobileAutosave.initMobileStepper(form);
    });
  }


  function renderClinicalFormSection(entries) {
    const formKey = runtime.editingClinicalFormKey;
    const entryId = runtime.editingClinicalEntryId;
    const config = window.ArcanaJournalClinicalForms?.[formKey];
    if (!formKey || !entryId || !config?.render) return '';
    const entry = asArray(entries).find(
      (row) => row.entryId === entryId && row.journalType === config.journalType
    );
    if (!entry) return '';
    const signFooter =
      entry.canSign && !entry.locked
        ? `
        <div class="patient-master-tp-footer">
          <button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">
            Signera och lås
          </button>
        </div>`
        : '';
    return `
      <form class="patient-master-tp-form-wrap" data-clinical-journal-save-form data-clinical-form-key="${escapeHtml(formKey)}" data-clinical-entry-id="${escapeHtml(entry.entryId)}">
        ${config.render(entry, { locked: entry.locked, mobileSteps: isMobileViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderTpJournalSection(entries) {
    const tpForm = window.ArcanaJournalTpForm;
    if (!tpForm?.render || !runtime.editingTpEntryId) return '';
    const entry = findTpJournalEntry(entries, runtime.editingTpEntryId);
    if (!entry) return '';
    const signFooter =
      entry.canSign && !entry.locked
        ? `
        <div class="patient-master-tp-footer">
          <button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">
            Signera och lås journal
          </button>
        </div>`
        : '';
    return `
      <form class="patient-master-tp-form-wrap" data-tp-journal-save-form data-tp-entry-id="${escapeHtml(entry.entryId)}">
        ${tpForm.render(entry, { locked: entry.locked, mobileSteps: isMobileViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderPrpJournalSection(entries) {
    const prpForm = window.ArcanaJournalPrpForm;
    if (!prpForm?.render || !runtime.editingPrpEntryId) return '';
    const entry = findPrpJournalEntry(entries, runtime.editingPrpEntryId);
    if (!entry) return '';
    const signFooter =
      entry.canSign && !entry.locked
        ? `
        <div class="patient-master-tp-footer">
          <button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">
            Signera och lås journal
          </button>
        </div>`
        : '';
    return `
      <form class="patient-master-tp-form-wrap" data-prp-journal-save-form data-prp-entry-id="${escapeHtml(entry.entryId)}">
        ${prpForm.render(entry, { locked: entry.locked, mobileSteps: isMobileViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderFollowUpJournalSection(entries) {
    const followForm = window.ArcanaJournalFollowUpForm;
    if (!followForm?.render || !runtime.editingFollowUpEntryId) return '';
    const entry = findFollowUpJournalEntry(entries, runtime.editingFollowUpEntryId);
    if (!entry) return '';
    const signFooter =
      entry.canSign && !entry.locked
        ? `
        <div class="patient-master-tp-footer">
          <button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">
            Signera och lås journal
          </button>
        </div>`
        : '';
    return `
      <form class="patient-master-tp-form-wrap" data-follow-journal-save-form data-follow-entry-id="${escapeHtml(entry.entryId)}">
        ${followForm.render(entry, { locked: entry.locked, mobileSteps: isMobileViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderMobileJournalSteps(entries) {
    if (!isMobileViewport()) return '';
    const rows = asArray(entries);
    const hasHealth = rows.some(
      (entry) => entry.journalType === 'health_declaration' && entry.locked
    );
    const hasPlan = rows.some((entry) => entry.journalType === 'consultation_plan');
    const hasSignedPlan = rows.some(
      (entry) => entry.journalType === 'consultation_plan' && entry.locked
    );
    let active = 1;
    if (hasHealth) active = 2;
    if (hasPlan) active = 3;
    if (hasSignedPlan) active = 4;
    const steps = ['Anteckning', 'Bilder', 'Plan', 'Signera'];
    const currentLabel = steps[Math.max(0, Math.min(steps.length - 1, active - 1))] || '';
    return `
      <p class="patient-master-muted cco-mobile-journal-progress" aria-live="polite">
        Steg ${active} av 4 · ${escapeHtml(currentLabel)}
      </p>
    `;
  }

  function renderJournalEntries(entries) {
    const rows = asArray(entries);
    const mobileSteps = renderMobileJournalSteps(rows);
    const toolbar = runtime.detail?.card ? renderJournalToolbar(runtime.detail.card, rows) : '';
    const planSection = renderConsultationPlanSection(rows);
    const tpSectionRaw = renderTpJournalSection(rows);
    const tpSection = tpSectionRaw
      ? wrapJournalCollapse('TP-journal', tpSectionRaw, { open: true })
      : '';
    const prpSectionRaw = renderPrpJournalSection(rows);
    const prpSection = prpSectionRaw
      ? wrapJournalCollapse('PRP-journal', prpSectionRaw, { open: true })
      : '';
    const followUpSectionRaw = renderFollowUpJournalSection(rows);
    const followUpSection = followUpSectionRaw
      ? wrapJournalCollapse('Uppföljning', followUpSectionRaw, { open: true })
      : '';
    const clinicalSection = renderClinicalFormSection(rows);
    const otherEntries = rows.filter((entry) => entry.journalType !== 'consultation_plan');

    const listMarkup = otherEntries.length
      ? `
      <ul class="patient-master-journal-list">
        ${otherEntries
        .map((entry) => {
          const attachment = asArray(entry.attachments)[0];
          const href = attachmentViewUrl(attachment);
          const openLink = href
            ? `<a class="patient-master-open-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">Öppna PDF</a>`
            : '';
          const isTpEntry = entry.journalType === 'tp_treatment';
          const isPrpEntry = entry.journalType === 'prp_treatment';
          const isFollowUpEntry = entry.journalType === 'follow_up';
          const isHealthEntry = entry.journalType === 'health_declaration';
          const isFitnessEntry = entry.journalType === 'fitness_certificate';
          const isClinicalEntry = isHealthEntry || isFitnessEntry;
          const typeLabel =
            JOURNAL_TYPE_LABELS[entry.journalType] || entry.journalType || 'Journal';
          const isEditingTp = isTpEntry && runtime.editingTpEntryId === entry.entryId;
          const isEditingPrp = isPrpEntry && runtime.editingPrpEntryId === entry.entryId;
          const isEditingFollowUp =
            isFollowUpEntry && runtime.editingFollowUpEntryId === entry.entryId;
          const isEditingClinical =
            isClinicalEntry &&
            runtime.editingClinicalEntryId === entry.entryId &&
            ((isHealthEntry && runtime.editingClinicalFormKey === 'health') ||
              (isFitnessEntry && runtime.editingClinicalFormKey === 'fitness'));
          const tpOpenButton =
            isTpEntry && runtime.detail?.card?.patientId
              ? `<button type="button" class="customers-utility-button${isEditingTp ? ' is-active' : ''}" data-patient-open-tp="${escapeHtml(entry.entryId)}">${isEditingTp ? 'Öppen' : 'Öppna'}</button>`
              : '';
          const prpOpenButton =
            isPrpEntry && runtime.detail?.card?.patientId
              ? `<button type="button" class="customers-utility-button${isEditingPrp ? ' is-active' : ''}" data-patient-open-prp="${escapeHtml(entry.entryId)}">${isEditingPrp ? 'Öppen' : 'Öppna'}</button>`
              : '';
          const followUpOpenButton =
            isFollowUpEntry && runtime.detail?.card?.patientId
              ? `<button type="button" class="customers-utility-button${isEditingFollowUp ? ' is-active' : ''}" data-patient-open-follow-up="${escapeHtml(entry.entryId)}">${isEditingFollowUp ? 'Öppen' : 'Öppna'}</button>`
              : '';
          const clinicalOpenButton =
            isClinicalEntry && runtime.detail?.card?.patientId
              ? `<button type="button" class="customers-utility-button${isEditingClinical ? ' is-active' : ''}" data-patient-open-clinical="${escapeHtml(isHealthEntry ? 'health' : 'fitness')}:${escapeHtml(entry.entryId)}">${isEditingClinical ? 'Öppen' : 'Öppna'}</button>`
              : '';
          const signButton =
            entry.canSign &&
              runtime.detail?.card?.patientId &&
              !isEditingTp &&
              !isEditingPrp &&
              !isEditingFollowUp &&
              !isEditingClinical
              ? `<button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">Signera</button>`
              : '';
          return `
              <li class="patient-master-journal-item${entry.locked ? ' is-locked' : ''}${isEditingTp || isEditingPrp || isEditingFollowUp || isEditingClinical ? ' is-editing' : ''}">
                <div>
                  <strong>${escapeHtml(entry.title || typeLabel)}</strong>
                  <span>${escapeHtml(entry.status || 'draft')}${entry.signedAt ? ` · signerad ${escapeHtml(String(entry.signedAt).slice(0, 10))}` : ''}</span>
                  ${openLink}
                </div>
                <div class="patient-master-journal-actions">
                  ${entry.journalType === 'historical_import' || entry.source === 'drive_import'
              ? chipHtml('Importerad', 'gold')
              : entry.locked
                ? chipHtml('Låst', 'violet')
                : chipHtml('Utkast', 'blue')
            }
                  ${tpOpenButton}
                  ${prpOpenButton}
                  ${followUpOpenButton}
                  ${clinicalOpenButton}
                  ${signButton}
                </div>
              </li>
            `;
        })
        .join('')}
      </ul>`
      : `<p class="patient-master-muted">Inga övriga journalposter ännu.</p>`;

    return `
      ${mobileSteps}
      ${toolbar}
      ${planSection}
      ${clinicalSection}
      ${tpSection}
      ${prpSection}
      ${followUpSection}
      ${otherEntries.some((entry) => entry.journalType === 'tp_treatment')
        ? `<p class="patient-master-muted patient-master-tp-hint">TP-journal fylls i efter behandlingsdagen — öppna utkastet och signera när det är klart.</p>`
        : ''
      }
      ${listMarkup}
    `;
  }

  function renderAgreementSection() {
    const agreement = runtime.treatmentAgreement;
    const readout = runtime.agreementReadout;
    const commercial = runtime.commercialCase;
    const card = runtime.detail?.card;
    const offerAccepted = commercial?.quoteStatus === 'accepted';
    const patientInfoPdf =
      readout?.patientInfoPdfUrl || '/patientinformation/hartransplantation-dhi-prp-minimal.pdf';
    const angerUrl = readout?.angerBlanketUrl || '';
    const coolingActive = readout?.coolingOff?.active;
    const canCreate = offerAccepted && (!agreement || agreement.agreementStatus === 'draft');
    const canSendSign =
      agreement?.agreementDocumentId &&
      agreement.agreementStatus !== 'bookable' &&
      agreement.agreementStatus !== 'signed';
    const canAcceptAgreement =
      agreement &&
      (agreement.agreementStatus === 'sent' || agreement.agreementStatus === 'cooling_off');

    const nextActionLabel = readout?.bookable
      ? 'Nästa: Boka behandlingstid i CCO-tråden.'
      : canSendSign
        ? 'Nästa: Skicka avtalet för signering.'
        : canCreate
          ? 'Nästa: Skapa avtal från accepterad offert.'
          : !readout?.patientInfoSent
            ? 'Nästa: Logga skickad patientinformation (bilaga 1).'
            : !offerAccepted
              ? 'Nästa: Få offerten accepterad av kunden.'
              : readout?.nextStep || 'Följ juristflödet steg för steg.';

    return `
      <article class="focus-customer-data-card patient-master-agreement-card">
        <div class="patient-master-material-head">
          <h4>Behandlingsavtal</h4>
          ${readout?.phase
        ? `<span class="patient-master-occasion-badge is-compact">${escapeHtml(readout.phase)}</span>`
        : ''
      }
        </div>
        <p class="patient-master-next-action">${escapeHtml(nextActionLabel)}</p>
        <ol class="patient-master-agreement-checklist patient-master-workflow-steps">
          <li class="${readout?.patientInfoSent ? 'is-done' : ''}">Patientinformation (bilaga 1)</li>
          <li class="${offerAccepted ? 'is-done' : ''}">Offert accepterad</li>
          <li class="${agreement?.agreementDocumentId ? 'is-done' : ''}">Avtal skapat</li>
          <li class="${readout?.bookable ? 'is-done' : ''}">Signerat — bokningsbart</li>
        </ol>
        ${readout?.patientInfoSentAt
        ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge">Patientinfo ${escapeHtml(String(readout.patientInfoSentAt).slice(0, 10))}</span></div>`
        : ''
      }
        ${agreement?.deliveryMode
        ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge is-accent">${escapeHtml(agreement.deliveryMode === 'distans' ? 'Distans (betänketid)' : 'På plats')}</span></div>`
        : ''
      }
        ${coolingActive
        ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge">Betänketid till ${escapeHtml(String(readout.coolingOff.endsAt).slice(0, 10))}</span></div>`
        : ''
      }
        <div class="patient-master-plan-photo-actions">
          <a class="customers-utility-button" href="${escapeHtml(patientInfoPdf)}" target="_blank" rel="noopener">Bilaga 1 PDF</a>
          <button type="button" class="customers-utility-button" data-patient-action="send-patient-info">Logga skickad patientinfo</button>
          ${canCreate
        ? `<button type="button" class="customers-utility-button" data-patient-action="create-agreement-from-offer">Skapa avtal från offert</button>`
        : ''
      }
          ${canSendSign
        ? `<button type="button" class="customers-utility-button" data-patient-action="send-agreement-for-sign">Skicka för signering</button>`
        : ''
      }
          ${canAcceptAgreement
        ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement">Signera avtal (staff)</button>`
        : ''
      }
          ${canAcceptAgreement && coolingActive
        ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement" data-patient-force-agreement="1">Tvinga signering</button>`
        : ''
      }
        </div>
        ${runtime.agreementDocumentUrl
        ? `<p class="patient-master-muted"><a href="${escapeHtml(runtime.agreementDocumentUrl)}" target="_blank" rel="noopener">Öppna avtal (HTML)</a>${runtime.agreementDocumentPdfUrl
          ? ` · <a href="${escapeHtml(runtime.agreementDocumentPdfUrl)}" target="_blank" rel="noopener">PDF</a>`
          : ''
        }</p>`
        : ''
      }
        ${runtime.agreementSignUrl
        ? `<p class="patient-master-muted"><a href="${escapeHtml(runtime.agreementSignUrl)}" target="_blank" rel="noopener">Signeringssida för kund</a></p>`
        : ''
      }
        ${angerUrl
        ? `<p class="patient-master-muted"><a href="${escapeHtml(angerUrl)}" target="_blank" rel="noopener">Konsumentverkets ångerblankett (bilaga 3)</a></p>`
        : ''
      }
        ${readout?.bookable
        ? `<div class="patient-master-booking-ready">
                <p class="patient-master-muted"><strong>Behandlingsbokning öppen.</strong> Boka behandlingstid i CCO-tråden med kundens e-post (${escapeHtml(card.primaryEmail || 'saknas')}). Endast behandlingstjänster (FUE/DHI m.fl.) — inte konsultation.</p>
              </div>`
        : `<p class="patient-master-muted">Behandlingsbokning spärrad tills avtalet är signerat och bokningsbart.</p>`
      }
      </article>
    `;
  }

  function patchCommercialAgreementSidecars() {
    if (!els.patientRail?.querySelector('[data-patient-detail]:not([data-patient-loading])') || !runtime.detail?.card) {
      return false;
    }
    const { journalEntries } = runtime.detail;

    const avtalPanel = els.patientRail.querySelector('[data-patient-tab-panel="avtal"]');
    if (avtalPanel) {
      avtalPanel.innerHTML = renderAgreementSection();
    }

    const workflowCard = els.patientRail.querySelector(
      '[data-patient-tab-panel="profil"] .patient-master-workflow-card'
    );
    if (workflowCard) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderJournalWorkflowCallout(journalEntries).trim();
      const next = wrapper.firstElementChild;
      if (next) workflowCard.replaceWith(next);
    }

    if (runtime.detailTab === 'journal') {
      void hydrateJournalPhotoElements(els.patientRail);
      window.requestAnimationFrame(() => bindJournalAutosaveForms());
    } else if (
      runtime.detailTab === 'profil' ||
      runtime.detailTab === 'filer' ||
      runtime.detailTab === 'tidslinje'
    ) {
      void hydratePatientFileImages(els.patientRail);
    }

    return true;
  }

  function switchDetailTab(nextTab) {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (rail) els.patientRail = rail;
    const normalized = nextTab || 'profil';
    if (!runtime.detail?.card || !rail?.querySelector('[data-patient-detail]')) {
      return false;
    }
    if (normalized === runtime.detailTab) {
      syncMobilePatientLayout();
      window.ArcanaMobileShell?.syncFromApp?.();
      return true;
    }
    runtime.detailTab = normalized;
    if (normalized === 'journal') {
      runtime.preferJournalOnMobile = true;
    } else {
      runtime.preferJournalOnMobile = false;
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
    }
    rail.querySelectorAll('[data-patient-tab]').forEach((button) => {
      const active = (button.dataset.patientTab || '') === normalized;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    rail.querySelectorAll('[data-patient-tab-panel]').forEach((panel) => {
      const isActive = (panel.dataset.patientTabPanel || '') === normalized;
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', 'hidden');
      }
    });
    syncMobilePatientLayout();
    window.ArcanaMobileShell?.syncFromApp?.();
    if (normalized === 'journal') {
      const hydrate = () => {
        if (runtime.detailTab !== 'journal') return;
        void hydrateJournalPhotoElements(rail);
        bindJournalAutosaveForms();
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(hydrate, { timeout: 1200 });
      } else {
        window.requestAnimationFrame(hydrate);
      }
    } else if (normalized === 'profil' || normalized === 'filer' || normalized === 'tidslinje') {
      const hydrate = () => {
        if (runtime.detailTab !== normalized) return;
        void hydratePatientFileImages(rail);
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(hydrate, { timeout: 1200 });
      } else {
        window.requestAnimationFrame(hydrate);
      }
    }
    return true;
  }

  function renderDetailShellLite() {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail || !runtime.detail?.card) return;
    els.patientRail = rail;
    const { card } = runtime.detail;
    const tab = runtime.detailTab;
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const tidslinjeActive = tab === 'tidslinje';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const fileCount = Number(card.fileSummary?.totalFiles || runtime.detail.driveFiles?.length || 0);

    rail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml((card.displayName || '?').slice(0, 2).toUpperCase())}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(card.displayName || 'Okänd kund')}</h2>
              <p class="patient-master-hero-id">${escapeHtml(card.personnummer || 'Saknar personnummer')}</p>
              <div class="focus-customer-contact-line">
                <span>${escapeHtml(card.primaryEmail || 'Saknar e-post')}</span>
                <span>${escapeHtml(card.primaryPhone || 'Saknar telefon')}</span>
              </div>
              ${renderPatientHeroChipRow(card)}
            </div>
            ${renderPatientHeroActions()}
          </div>
        </article>

        <div class="patient-master-tabs" role="tablist">${renderPatientPrimaryTabs(tab, fileCount)}
        </div>

        <div class="patient-master-tab-panel"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil"></div>
        <div class="patient-master-tab-panel"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          <p class="patient-master-muted" data-patient-shell-placeholder>Laddar journal…</p>
        </div>
        <div class="patient-master-tab-panel"${tidslinjeActive ? '' : ' hidden'} data-patient-tab-panel="tidslinje">
          <p class="patient-master-muted" data-patient-shell-placeholder>Laddar tidslinje…</p>
        </div>
        <div class="patient-master-tab-panel"${avtalActive ? '' : ' hidden'} data-patient-tab-panel="avtal"></div>
        <div class="patient-master-tab-panel"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer"></div>
      </section>
    `;
    runtime.detailShellOnly = true;
    syncMobilePatientLayout();
  }

  function scheduleFullDetailPanelHydration(patientId) {
    const hydrate = () => {
      if (normalizeText(runtime.selectedPatientId) !== normalizeText(patientId)) return;
      if (!runtime.detail?.card) return;
      renderDetailPanel();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(hydrate, { timeout: 320 });
    } else {
      window.requestAnimationFrame(hydrate);
    }
  }

  function renderDetailPanel() {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail) return;
    els.patientRail = rail;
    if (runtime.detailLoading && !runtime.detail?.card) {
      renderDetailLoadingSkeleton(runtime.selectedPatientId);
      return;
    }
    const detail = runtime.detail;
    if (!detail?.card) {
      renderDetailEmpty();
      return;
    }
    runtime.detailShellOnly = false;
    revokePhotoObjectUrls();
    const { card, patient, journalEntries, driveFiles, occasionTimeline } = detail;
    const tab = runtime.detailTab;
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const tidslinjeActive = tab === 'tidslinje';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const fileCount = Number(card.fileSummary?.totalFiles || driveFiles?.length || 0);

    rail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml((card.displayName || '?').slice(0, 2).toUpperCase())}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(card.displayName || 'Okänd kund')}</h2>
              <p class="patient-master-hero-id">${escapeHtml(card.personnummer || 'Saknar personnummer')}</p>
              <div class="focus-customer-contact-line">
                <span>${escapeHtml(card.primaryEmail || 'Saknar e-post')}</span>
                <span>${escapeHtml(card.primaryPhone || 'Saknar telefon')}</span>
              </div>
              ${renderPatientHeroChipRow(card)}
            </div>
            ${renderPatientHeroActions()}
          </div>
        </article>

        <div class="patient-master-tabs" role="tablist">${renderPatientPrimaryTabs(tab, fileCount)}
        </div>

        <div class="patient-master-tab-panel"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil">
          ${renderJournalWorkflowCallout(journalEntries)}
          <article class="focus-customer-data-card patient-master-identity-card">
            <h4>Identitet</h4>
            <dl class="focus-customer-dl">
              <div><dt>Personnummer</dt><dd>${escapeHtml(card.personnummer || '—')}</dd></div>
              <div><dt>Matchning</dt><dd>${escapeHtml(MATCH_LABELS[card.matchStatus] || card.matchStatus || '—')}</dd></div>
              <div><dt>Cliento</dt><dd>${card.clientoLinked ? 'Ja' : 'Nej'}</dd></div>
              <div><dt>Drive</dt><dd>${card.driveLinked ? 'Ja' : 'Nej'}</dd></div>
              <div><dt>Pipedrive</dt><dd>${card.pipedriveLinked ? `Ja (${card.pipedriveDealCount || 0} affärer)` : 'Nej'}</dd></div>
            </dl>
          </article>
          ${renderPipedriveSection(patient)}
          ${renderMaterialPreview(driveFiles, card)}
          ${patient?.cliento?.createdAt
        ? `<p class="patient-master-muted">Cliento skapad: ${escapeHtml(String(patient.cliento.createdAt).slice(0, 10))}</p>`
        : ''
      }
        </div>

        <div class="patient-master-tab-panel"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          ${renderJournalEntries(journalEntries)}
        </div>

        <div class="patient-master-tab-panel"${tidslinjeActive ? '' : ' hidden'} data-patient-tab-panel="tidslinje">
          ${renderUnifiedTimelinePanel(journalEntries, driveFiles, occasionTimeline)}
        </div>

        <div class="patient-master-tab-panel"${avtalActive ? '' : ' hidden'} data-patient-tab-panel="avtal">
          ${renderAgreementSection()}
        </div>

        <div class="patient-master-tab-panel"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer">
          ${renderDriveFiles(driveFiles, card)}
        </div>
      </section>
    `;
    bindJournalPhotoOpenLinks(els.patientRail);
    void hydrateJournalPhotoElements(els.patientRail);
    void hydratePatientFileImages(els.patientRail);
    syncMobilePatientLayout();
    window.requestAnimationFrame(() => bindJournalAutosaveForms());
  }

  async function loadStats() {
    if (needsStaffLogin()) return;
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/stats');
      runtime.stats = payload.stats || null;
      renderMetricCards();
    } catch (error) {
      if (isAuthFailure(error.statusCode, error.message)) {
        runtime.authRequired = true;
        runtime.error = 'Inloggning krävs. Logga in nedan.';
        renderPatientRows();
      }
      console.warn('Patient stats misslyckades.', error);
    }
  }

  async function loadPatientList({ append = false } = {}) {
    if (runtime.mode !== 'register') return;
    if (needsStaffLogin()) {
      renderPatientRows();
      return;
    }
    if (runtime.loading) return;
    runtime.loading = true;
    runtime.error = '';
    if (!append) {
      runtime.offset = 0;
      runtime.patients = [];
    }
    setStatus('Läser kundregister…', 'loading');
    renderPatientRows();

    const deepLinkId = !append ? normalizeText(runtime.pendingPatientId || parseStartupParams().patientId) : '';
    let detailPromise = null;
    if (deepLinkId) {
      runtime.pendingPatientId = '';
      runtime.preferJournalOnMobile = true;
      if (runtime.selectedPatientId !== deepLinkId || !runtime.detail?.card) {
        detailPromise = loadPatientDetail(deepLinkId);
      }
    }

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(runtime.offset),
    });
    if (runtime.query) params.set('q', runtime.query);
    if (runtime.flagFilter) params.set('flags', runtime.flagFilter);

    try {
      const payload = await apiRequest(`/api/v1/cco-patient-master/patients?${params}`);
      const batch = filterPilotPatients(asArray(payload.patients));
      runtime.total = getPilotPatientIds().length
        ? batch.length
        : Number(payload.total || batch.length);
      runtime.patients = append ? runtime.patients.concat(batch) : batch;
      runtime.loaded = true;
      runtime.authRequired = false;
      setStatus('', '');
      if (detailPromise) {
        if (deepLinkId && isMobileViewport()) {
          void detailPromise.catch((error) => {
            console.warn('Patient deep link misslyckades.', error);
          });
        } else {
          await detailPromise.catch((error) => {
            console.warn('Patient deep link misslyckades.', error);
          });
          if (runtime.detail?.card) {
            scheduleDetailPanelPaint(deepLinkId);
          }
        }
      }
      if (!runtime.selectedPatientId && runtime.patients[0] && !isMobileViewport()) {
        runtime.selectedPatientId = runtime.patients[0].patientId;
        await loadPatientDetail(runtime.selectedPatientId);
      }
    } catch (error) {
      runtime.error = isAuthFailure(error.statusCode, error.message)
        ? 'Inloggning krävs. Logga in nedan.'
        : error.message || 'Kunde inte läsa kundregistret.';
      runtime.authRequired = isAuthFailure(error.statusCode, error.message);
      if (runtime.authRequired) {
        clearStaffTokens();
        runtime.authRequired = true;
      }
      setStatus(runtime.error, 'error');
    } finally {
      runtime.loading = false;
      renderPatientRows();
    }
  }

  async function loadOfferTemplates() {
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-templates');
      runtime.offerTemplates = asArray(payload.templates);
    } catch {
      runtime.offerTemplates = [];
    }
  }

  async function loadPatientTreatmentAgreement(patientId) {
    if (!patientId) {
      runtime.treatmentAgreement = null;
      runtime.agreementReadout = null;
      runtime.agreementDocumentUrl = '';
      runtime.agreementDocumentPdfUrl = '';
      runtime.agreementSignUrl = '';
      return;
    }
    try {
      const payload = await apiRequest(
        `/api/v1/cco-treatment-agreement/patient-agreement?patientId=${encodeURIComponent(patientId)}`
      );
      runtime.treatmentAgreement = payload.agreement || null;
      runtime.agreementReadout = payload.agreementReadout || null;
      const agreement = runtime.treatmentAgreement;
      runtime.agreementDocumentUrl =
        agreement?.agreementDocumentId && patientId
          ? `/api/v1/cco-treatment-agreement/document?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(agreement.agreementDocumentId)}`
          : '';
      runtime.agreementDocumentPdfUrl =
        agreement?.agreementDocumentPdfId && patientId
          ? `/api/v1/cco-treatment-agreement/document.pdf?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(agreement.agreementDocumentPdfId)}`
          : '';
      runtime.agreementSignUrl = '';
    } catch {
      runtime.treatmentAgreement = null;
      runtime.agreementReadout = null;
      runtime.agreementDocumentUrl = '';
      runtime.agreementDocumentPdfUrl = '';
      runtime.agreementSignUrl = '';
    }
  }

  async function loadPatientCommercialCase(patientId) {
    if (!patientId) {
      runtime.commercialCase = null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
      return;
    }
    try {
      const payload = await apiRequest(
        `/api/v1/cco-commercial/patient-case?patientId=${encodeURIComponent(patientId)}`
      );
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
    } catch {
      runtime.commercialCase = null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
    }
  }

  async function loadPatientDetail(patientId) {
    if (!patientId || runtime.mode !== 'register') return;
    const key = normalizeText(patientId);
    const inflight = patientDetailInflight.get(key);
    if (inflight) return inflight;

    const promise = loadPatientDetailInternal(patientId);
    patientDetailInflight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (patientDetailInflight.get(key) === promise) {
        patientDetailInflight.delete(key);
      }
    }
  }

  function scheduleDetailPanelPaint(patientId) {
    const paint = () => {
      if (normalizeText(runtime.selectedPatientId) !== normalizeText(patientId)) return;
      if (!runtime.detail?.card) return;
      if (runtime.detailShellOnly) {
        renderDetailPanel();
        return;
      }
      if (railHasPatientDetailUi()) return;
      renderDetailPanel();
    };
    paint();
    window.requestAnimationFrame(paint);
    window.setTimeout(paint, 0);
    window.setTimeout(paint, 120);
  }

  async function waitForPrefetchedPatient(patientId, maxMs = 800) {
    const key = normalizeText(patientId);
    const deadline = performance.now() + maxMs;
    while (performance.now() < deadline) {
      const prefetched = window.__ARCANA_PATIENT_PREFETCH__;
      if (
        prefetched &&
        normalizeText(prefetched.patientId) === key &&
        prefetched.payload
      ) {
        return prefetched.payload;
      }
      if (!window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__) break;
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    return null;
  }

  async function fetchPatientDetailFromApi(patientId) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 8000) : 0;
    try {
      return await apiRequest(
        `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`,
        controller ? { signal: controller.signal } : {}
      );
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  async function resolvePatientDetailPayload(patientId) {
    const key = normalizeText(patientId);
    const prefetched = window.__ARCANA_PATIENT_PREFETCH__;
    if (
      prefetched &&
      normalizeText(prefetched.patientId) === key &&
      prefetched.payload
    ) {
      delete window.__ARCANA_PATIENT_PREFETCH__;
      return prefetched.payload;
    }

    const apiPromise = fetchPatientDetailFromApi(patientId);
    if (!window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__) {
      return apiPromise;
    }

    try {
      return await Promise.race([
        waitForPrefetchedPatient(patientId, 2500).then((payload) => {
          if (!payload) throw new Error('prefetch-miss');
          delete window.__ARCANA_PATIENT_PREFETCH__;
          return payload;
        }),
        apiPromise,
      ]);
    } catch {
      return apiPromise;
    }
  }

  async function loadPatientDetailInternal(patientId) {
    resolveElements();
    if (!patientId || runtime.mode !== 'register') return;
    const openingNewPatient = runtime.selectedPatientId !== patientId;
    const previousPatientId = runtime.selectedPatientId;
    if (openingNewPatient) {
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
    }
    runtime.selectedPatientId = patientId;
    if (isMobileViewport() && runtime.preferJournalOnMobile) {
      runtime.detailTab = 'journal';
    }
    runtime.detailLoading = true;
    if (openingNewPatient) {
      if (!updatePatientRowSelection(previousPatientId, patientId)) {
        renderPatientRows();
      }
    }
    const alreadyPrimed =
      normalizeText(window.__ARCANA_MOBILE_DEEPLINK_PRIME__) === normalizeText(patientId) &&
      Boolean(els.patientRail?.querySelector('[data-patient-loading="true"]'));
    if (!alreadyPrimed) {
      renderDetailLoadingSkeleton(patientId);
    }
    syncMobilePatientLayout();
    if (isMobileViewport() && openingNewPatient) {
      pushMobilePatientDetailHistory(patientId);
    }
    try {
      const payload = await resolvePatientDetailPayload(patientId);
      runtime.detail = payload;
      runtime.detailLoading = false;
      if (isMobileViewport() && runtime.preferJournalOnMobile) {
        renderDetailShellLite();
        scheduleFullDetailPanelHydration(patientId);
      } else {
        scheduleDetailPanelPaint(patientId);
      }
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav && isMobileViewport() && normalizeText(parseStartupParams().patientId) === normalizeText(patientId)) {
          window.__ARCANA_DEEPLINK_DETAIL_READY_MS__ = performance.now() - nav.startTime;
        }
      } catch {
        /* best-effort */
      }
      if (isMobileViewport()) {
        void Promise.all([
          loadPatientCommercialCase(patientId),
          loadPatientTreatmentAgreement(patientId),
        ]).then(() => {
          if (runtime.selectedPatientId !== patientId || !runtime.detail?.card) return;
          const patch = () => {
            if (runtime.selectedPatientId !== patientId || !runtime.detail?.card) return;
            patchCommercialAgreementSidecars();
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(patch, { timeout: 1200 });
          } else {
            window.setTimeout(patch, 0);
          }
        });
      } else {
        await Promise.all([
          loadPatientCommercialCase(patientId),
          loadPatientTreatmentAgreement(patientId),
        ]);
        renderDetailPanel();
      }
    } catch (error) {
      runtime.detail = null;
      const message =
        error?.name === 'AbortError'
          ? 'Tidsgräns — kontrollera nätverket och försök igen.'
          : error.message || 'Kunde inte läsa kundkortet.';
      renderDetailLoadError(patientId, message);
      setStatus(message, 'error');
    } finally {
      runtime.detailLoading = false;
      if (normalizeText(window.__ARCANA_MOBILE_DEEPLINK_PRIME__) === normalizeText(patientId)) {
        delete window.__ARCANA_MOBILE_DEEPLINK_PRIME__;
      }
    }
  }

  function setMode(mode) {
    runtime.mode = mode === 'identity' ? 'identity' : 'register';
    renderModeChrome();
    window.dispatchEvent(
      new CustomEvent('arcana-patient-master-mode', { detail: { mode: runtime.mode } })
    );
    if (runtime.mode === 'register') {
      void loadStats();
      void loadPatientList();
    } else {
      setStatus('', '');
      void loadReviewGroups();
    }
  }

  let searchTimer = null;

  async function importHistoricalForCurrentPatient() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Importerar historisk journal…', 'loading');
    try {
      const result = await apiRequest('/api/v1/cco-journal/import-historical', {
        method: 'POST',
        body: { patientId },
      });
      setStatus(
        `Importerade ${Number(result.created || 0)} poster (${Number(result.skipped || 0)} fanns redan).`,
        'success'
      );
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Import misslyckades.', 'error');
    }
  }

  async function createOfferFromPlan(entryId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId) return;
    if (openMobileOfferWizard(entryId)) return;
    const quotedAmount = window.prompt('Pris i offerten (t.ex. 75 000 kr):', '') || '';
    const depositAmount = window.prompt('Deposition (valfritt):', '') || '';
    const templateSelect = document.querySelector('[data-patient-offer-template]');
    const templateKey = templateSelect?.value || '';
    setStatus('Skapar offert från behandlingsplan…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-from-plan', {
        method: 'POST',
        body: {
          patientId,
          entryId,
          quotedAmount,
          depositAmount,
          templateKey,
        },
      });
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerDocumentUrl = payload.offerDocumentUrl || '';
      runtime.offerDocumentPdfUrl = payload.offerDocumentPdfUrl || '';
      runtime.offerDocumentWordUrl = payload.offerDocumentWordUrl || '';
      setStatus('Offert skapad från behandlingsplan.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa offert.', 'error');
    }
  }

  async function sendOfferForSign() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Skickar offert för signering…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-send-for-sign', {
        method: 'POST',
        body: { patientId },
      });
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerSignUrl = payload.offerSignUrl || '';
      setStatus('Offert skickad. Betänketid startad.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skicka offert.', 'error');
    }
  }

  async function acceptOffer(forceAccept) {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const customerSignedName =
      window.prompt('Kundens namn för accept:', runtime.detail?.card?.displayName || '') || '';
    if (!customerSignedName) return;
    setStatus('Registrerar accept…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-accept', {
        method: 'POST',
        body: {
          patientId,
          customerSignedName,
          forceAccept: forceAccept === true,
        },
      });
      runtime.commercialCase = payload.commercialCase || null;
      setStatus('Offert accepterad.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte acceptera offert.', 'error');
    }
  }

  async function sendPatientInfo() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const channel =
      window.prompt('Kanal (t.ex. e-post, sms, utskrift vid konsultation):', 'e-post') || 'manual';
    setStatus('Loggar utskick av patientinformation…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-treatment-agreement/send-patient-info', {
        method: 'POST',
        body: { patientId, channel },
      });
      runtime.treatmentAgreement = payload.agreement || null;
      runtime.agreementReadout = payload.agreementReadout || null;
      setStatus('Patientinformation loggad som skickad.', 'success');
      runtime.detailTab = 'avtal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte logga patientinfo.', 'error');
    }
  }

  async function createAgreementFromOffer() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const deliveryMode =
      window.prompt('Leveransläge: skriv "distans" eller "plats":', 'plats') || 'plats';
    setStatus('Skapar behandlingsavtal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-treatment-agreement/from-offer', {
        method: 'POST',
        body: {
          patientId,
          deliveryMode: deliveryMode.toLowerCase().includes('dist') ? 'distans' : 'plats',
        },
      });
      runtime.treatmentAgreement = payload.agreement || null;
      runtime.agreementReadout = payload.agreementReadout || null;
      runtime.agreementDocumentUrl = payload.agreementDocumentUrl || '';
      setStatus('Behandlingsavtal skapat.', 'success');
      runtime.detailTab = 'avtal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa avtal.', 'error');
    }
  }

  async function sendAgreementForSign() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Skickar avtal för signering…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-treatment-agreement/send-for-sign', {
        method: 'POST',
        body: { patientId },
      });
      runtime.treatmentAgreement = payload.agreement || null;
      runtime.agreementReadout = payload.agreementReadout || null;
      runtime.agreementSignUrl = payload.agreementSignUrl || '';
      setStatus('Avtal skickat för signering.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skicka avtal.', 'error');
    }
  }

  async function acceptAgreement(forceAccept) {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const customerSignedName =
      window.prompt('Kundens namn för signering:', runtime.detail?.card?.displayName || '') || '';
    if (!customerSignedName) return;
    setStatus('Registrerar avtalssignering…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-treatment-agreement/accept', {
        method: 'POST',
        body: {
          patientId,
          customerSignedName,
          forceAccept: forceAccept === true,
        },
      });
      runtime.treatmentAgreement = payload.agreement || null;
      runtime.agreementReadout = payload.agreementReadout || null;
      setStatus('Behandlingsavtal signerat.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte signera avtal.', 'error');
    }
  }

  async function createConsultationPlan() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const entries = asArray(runtime.detail?.journalEntries);
    if (!patientId || !card) return;
    if (!hasSignedHealthDeclaration(entries)) {
      setStatus(
        hasHealthDeclarationDraft(entries)
          ? 'Signera hälsodeklarationen innan behandlingsplan skapas.'
          : 'Skapa och signera hälsodeklaration innan behandlingsplan.',
        'error'
      );
      return;
    }
    setStatus('Skapar behandlingsplan…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'consultation_plan',
          title: 'Konsultation — behandlingsplan',
          fields: {
            consultationDate: new Date().toISOString().slice(0, 10),
          },
        },
      });
      setStatus('Behandlingsplan skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa behandlingsplan.', 'error');
    }
  }

  async function copyPatientDeepLink() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const url = buildPatientDeepLink(patientId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Kopiera länken:', url);
        return;
      }
      setStatus('Kollegelänk kopierad (kräver CCO-inloggning).', 'success');
    } catch {
      setStatus('Kunde inte kopiera länken.', 'error');
    }
  }

  function closePatientQrOverlay() {
    document.querySelector('.patient-master-qr-overlay')?.remove();
  }

  function showPatientQrCode() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    closePatientQrOverlay();
    const url = buildPatientDeepLink(patientId);
    const qrSrc = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=280&margin=1`;
    const overlay = document.createElement('div');
    overlay.className = 'patient-master-qr-overlay';
    overlay.innerHTML = `
      <div class="patient-master-qr-card" role="dialog" aria-modal="true" aria-label="QR-kod för kollega">
        <h4>QR — ${escapeHtml(runtime.detail?.card?.displayName || 'Kund')}</h4>
        <img src="${escapeHtml(qrSrc)}" alt="QR-kod till kundkort för kollega" width="240" height="240" />
        <p class="patient-master-muted">För kollegor med CCO-inloggning. Skanna för att öppna kundkortet — utan inloggning kommer du till inloggningssidan.</p>
        <button type="button" class="customers-utility-button" data-patient-qr-close>Stäng</button>
      </div>
    `;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-patient-qr-close]')) {
        closePatientQrOverlay();
      }
    });
    document.body.appendChild(overlay);
  }

  async function uploadConsultationPhotos(files) {
    const queue = Array.from(files || []).filter(Boolean);
    if (!queue.length) return;
    for (const file of queue) {
      await uploadConsultationPhoto(file);
    }
  }

  async function uploadConsultationPhoto(file) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !file) return;

    if (needsStaffLogin()) {
      setStatus('Logga in för att ladda upp bilder.', 'error');
      renderPatientRows();
      return;
    }

    let uploadFile = file;
    if (window.ArcanaJournalPhotoClient?.compressForUpload) {
      try {
        uploadFile = await window.ArcanaJournalPhotoClient.compressForUpload(file);
      } catch {
        uploadFile = file;
      }
    }

    if (!isOnline()) {
      setStatus('Ingen internetanslutning. Bilden sparades inte.', 'error');
      return;
    }

    if (isPlanUploadBlocked(runtime.detail?.journalEntries)) {
      setStatus('Behandlingsplanen är signerad. Skapa en ny plan för fler bilder.', 'error');
      return;
    }

    const labelChoice = promptPhotoLabel();
    if (labelChoice === null) return;

    const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
    const formData = new FormData();
    formData.append('photo', uploadFile);
    formData.append('patientId', patientId);
    if (card?.personnummer) formData.append('personnummer', card.personnummer);
    if (planEntry?.entryId) formData.append('entryId', planEntry.entryId);
    formData.append('label', labelChoice || file.name || 'Konsultationsbild');

    const token = getAdminToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    setStatus(
      planEntry ? 'Laddar upp konsultationsbild…' : 'Skapar behandlingsplan och laddar upp bild…',
      'loading'
    );
    try {
      const response = await fetch(new URL('/api/v1/cco-journal/photo', window.location.origin), {
        method: 'POST',
        headers,
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Behandlingsplanen är signerad. Skapa en ny plan för fler bilder.');
        }
        if (response.status === 413) {
          throw new Error('Bilden är för stor (max 12 MB). Välj en mindre bild.');
        }
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setStatus('Bild sparad i journalen.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Uppladdning misslyckades.', 'error');
    }
  }

  async function openPlanEditor(entryId, attachmentId, photoId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId || !attachmentId || !photoId) return;
    if (!window.ArcanaJournalPlanEditor?.open) {
      setStatus('Plan-editor saknas — ladda om sidan.', 'error');
      return;
    }

    let annotations = { shapes: [] };
    let planSummary = {};
    const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
    const attachment = asArray(planEntry?.attachments).find(
      (item) => item.attachmentId === attachmentId
    );
    if (attachment?.annotations && typeof attachment.annotations === 'object') {
      annotations = attachment.annotations;
    }
    if (attachment?.planSummary && typeof attachment.planSummary === 'object') {
      planSummary = attachment.planSummary;
    } else if (planEntry?.fields && typeof planEntry.fields === 'object') {
      planSummary = planEntry.fields;
    }

    try {
      const payload = await apiRequest(
        `/api/v1/cco-journal/plan-annotation?patientId=${encodeURIComponent(patientId)}&photoId=${encodeURIComponent(photoId)}`
      );
      if (payload.annotation?.annotations) annotations = payload.annotation.annotations;
      if (payload.annotation?.planSummary) planSummary = payload.annotation.planSummary;
    } catch {
      /* use attachment fallback */
    }

    const imageUrl = await fetchJournalPhotoObjectUrl(photoId);
    if (!imageUrl) {
      setStatus('Kunde inte ladda bilden för markering.', 'error');
      return;
    }

    window.ArcanaJournalPlanEditor.open({
      imageUrl,
      annotations,
      planSummary,
      onSave: async (payload) => {
        await apiRequest('/api/v1/cco-journal/plan-annotation', {
          method: 'PUT',
          body: {
            patientId,
            entryId,
            attachmentId,
            photoId,
            annotations: payload.annotations,
            planSummary: payload.planSummary,
            previewDataUrl: payload.previewDataUrl,
          },
        });
        setStatus('Behandlingsplan sparad.', 'success');
        await loadPatientDetail(patientId);
      },
    });
  }

  async function deleteConsultationPhoto(entryId, attachmentId, photoId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId || !attachmentId || !photoId) return;
    const ok = window.confirm('Ta bort bilden från behandlingsplanen?');
    if (!ok) return;
    setStatus('Tar bort bild…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/photo', {
        method: 'DELETE',
        body: { patientId, entryId, attachmentId, photoId },
      });
      setStatus('Bilden togs bort.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte ta bort bilden.', 'error');
    }
  }

  function consultationPlanPhotosFromEntry(entry) {
    return asArray(entry?.attachments).filter(
      (item) => item.type === 'consultation_photo' && item.photoId
    );
  }

  async function clearPlanConsultationPhotos(entryId, { smokeOnly = false } = {}) {
    const patientId = runtime.selectedPatientId;
    const planEntry = findConsultationPlanEntry(runtime.detail?.entries || []);
    if (!patientId || !entryId || !planEntry || planEntry.entryId !== entryId) return;
    const photos = consultationPlanPhotosFromEntry(planEntry);
    if (!photos.length) return;
    const label = smokeOnly ? 'smoke/E2E-bilder' : `alla ${photos.length} bilder`;
    const ok = window.confirm(
      smokeOnly
        ? 'Ta bort smoke- och E2E-testbilder från behandlingsplanen? Det går inte att ångra.'
        : `Ta bort alla ${photos.length} bilder från behandlingsplanen? Det går inte att ångra.`
    );
    if (!ok) return;
    setStatus(`Tar bort ${label}…`, 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/plan-photos/clear', {
        method: 'POST',
        body: { patientId, entryId, smokeOnly },
      });
      const removed = Number(payload?.removedCount) || 0;
      setStatus(
        removed
          ? `${removed} ${smokeOnly ? 'smoke-bilder' : 'bilder'} togs bort.`
          : 'Inga matchande bilder att ta bort.',
        removed ? 'success' : 'info'
      );
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte rensa bilder.', 'error');
    }
  }

  async function clearSmokeConsultationPhotos(entryId) {
    return clearPlanConsultationPhotos(entryId, { smokeOnly: true });
  }

  async function deleteAllConsultationPhotos(entryId) {
    return clearPlanConsultationPhotos(entryId, { smokeOnly: false });
  }

  async function saveTpJournalEntry(form) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const entryId = normalizeText(form?.dataset?.tpEntryId) || runtime.editingTpEntryId;
    const tpForm = window.ArcanaJournalTpForm;
    if (!patientId || !card || !entryId || !tpForm?.readForm) return;
    const entryRoot = form.querySelector('[data-tp-journal-form]');
    const fields = tpForm.readForm(entryRoot);
    setStatus('Sparar TP-journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'tp_treatment',
          title: 'TP behandlingsjournal',
          fields,
        },
      });
      setStatus('TP-journal sparad.', 'success');
      window.ArcanaMobileAutosave?.markFormSaved?.(form);
      runtime.editingTpEntryId = entryId;
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara journal.', 'error');
    }
  }

  async function createClinicalJournalDraft(formKey) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const config = window.ArcanaJournalClinicalForms?.[formKey];
    if (!patientId || !card || !config) return;
    setStatus(`Skapar ${config.title.toLowerCase()}…`, 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: config.journalType,
          title: config.title,
          fields: config.defaultFields ? config.defaultFields(card) : {},
        },
      });
      runtime.editingClinicalFormKey = formKey;
      runtime.editingClinicalEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      setStatus(`${config.title} skapad.`, 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa formulär.', 'error');
    }
  }

  async function saveClinicalJournalEntry(form) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const formKey = normalizeText(form?.dataset?.clinicalFormKey) || runtime.editingClinicalFormKey;
    const entryId = normalizeText(form?.dataset?.clinicalEntryId) || runtime.editingClinicalEntryId;
    const config = window.ArcanaJournalClinicalForms?.[formKey];
    if (!patientId || !card || !entryId || !config?.readForm) return;
    const entryRoot = form.querySelector('[data-clinical-journal-form]');
    const fields = config.readForm(entryRoot);
    setStatus(`Sparar ${config.title.toLowerCase()}…`, 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: config.journalType,
          title: config.title,
          fields,
        },
      });
      setStatus(`${config.title} sparad.`, 'success');
      window.ArcanaMobileAutosave?.markFormSaved?.(form);
      runtime.editingClinicalFormKey = formKey;
      runtime.editingClinicalEntryId = entryId;
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara formulär.', 'error');
    }
  }

  async function createTpJournalDraft() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    setStatus('Skapar TP-journal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'tp_treatment',
          title: 'TP behandlingsjournal',
          fields: {},
        },
      });
      runtime.editingTpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny TP-journal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function createPrpJournalDraft() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    setStatus('Skapar PRP-journal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'prp_treatment',
          title: 'PRP behandlingsjournal',
          fields: {},
        },
      });
      runtime.editingPrpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny PRP-journal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function createFollowUpJournalDraft() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    setStatus('Skapar uppföljningsjournal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'follow_up',
          title: 'Uppföljning',
          fields: {},
        },
      });
      runtime.editingFollowUpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny uppföljningsjournal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function savePrpJournalEntry(form) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const entryId = normalizeText(form?.dataset?.prpEntryId) || runtime.editingPrpEntryId;
    const prpForm = window.ArcanaJournalPrpForm;
    if (!patientId || !card || !entryId || !prpForm?.readForm) return;
    const entryRoot = form.querySelector('[data-prp-journal-form]');
    const fields = prpForm.readForm(entryRoot);
    setStatus('Sparar PRP-journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'prp_treatment',
          title: 'PRP behandlingsjournal',
          fields,
        },
      });
      setStatus('PRP-journal sparad.', 'success');
      window.ArcanaMobileAutosave?.markFormSaved?.(form);
      runtime.editingPrpEntryId = entryId;
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara journal.', 'error');
    }
  }

  async function saveFollowUpJournalEntry(form) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const entryId = normalizeText(form?.dataset?.followEntryId) || runtime.editingFollowUpEntryId;
    const followForm = window.ArcanaJournalFollowUpForm;
    if (!patientId || !card || !entryId || !followForm?.readForm) return;
    const entryRoot = form.querySelector('[data-follow-journal-form]');
    const fields = followForm.readForm(entryRoot);
    setStatus('Sparar uppföljningsjournal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'follow_up',
          title: 'Uppföljning',
          fields,
        },
      });
      setStatus('Uppföljningsjournal sparad.', 'success');
      window.ArcanaMobileAutosave?.markFormSaved?.(form);
      runtime.editingFollowUpEntryId = entryId;
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara journal.', 'error');
    }
  }

  async function signJournalEntry(entryId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId) return;
    setStatus('Signerar journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry/sign', {
        method: 'POST',
        body: { patientId, entryId },
      });
      setStatus('Journal signerad och låst.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Signering misslyckades.', 'error');
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-patient-master-mode]');
      if (modeButton) {
        setMode(modeButton.dataset.patientMasterMode);
        return;
      }

      const mergeButton = event.target.closest('[data-patient-merge-accept]');
      if (mergeButton && runtime.mode === 'identity') {
        const primaryId = normalizeText(mergeButton.dataset.patientMergePrimary);
        const secondaryRaw = normalizeText(mergeButton.dataset.patientMergeSecondary);
        const secondaryIds = secondaryRaw
          .split(',')
          .map((item) => normalizeText(item))
          .filter(Boolean);
        void mergeReviewGroup(primaryId, secondaryIds);
        return;
      }

      const row = event.target.closest('[data-patient-row]');
      if (row && runtime.mode === 'register') {
        void loadPatientDetail(row.dataset.patientRow);
        return;
      }

      const loadMore = event.target.closest('[data-patient-load-more]');
      if (loadMore && runtime.mode === 'register') {
        runtime.offset += PAGE_SIZE;
        void loadPatientList({ append: true });
        return;
      }

      const timelineFilter = event.target.closest('[data-journal-timeline-filter]');
      if (timelineFilter && runtime.mode === 'register' && runtime.detail?.card) {
        runtime.journalTimelineFilter = timelineFilter.dataset.journalTimelineFilter || 'all';
        if (runtime.detailTab === 'tidslinje') {
          renderDetailPanel();
        } else {
          switchDetailTab('tidslinje');
        }
        return;
      }

      const tab = event.target.closest('[data-patient-tab]');
      if (tab && runtime.mode === 'register') {
        if (switchDetailTab(tab.dataset.patientTab || 'profil')) {
          return;
        }
        runtime.detailTab = tab.dataset.patientTab || 'profil';
        if (tab.dataset.patientTab !== 'journal') {
          runtime.preferJournalOnMobile = false;
          runtime.editingTpEntryId = '';
          runtime.editingPrpEntryId = '';
          runtime.editingFollowUpEntryId = '';
          runtime.editingClinicalFormKey = '';
          runtime.editingClinicalEntryId = '';
        }
        renderDetailPanel();
        return;
      }

      const tabJump = event.target.closest('[data-patient-tab-jump]');
      if (tabJump && runtime.mode === 'register') {
        if (switchDetailTab(tabJump.dataset.patientTabJump || 'journal')) {
          return;
        }
        runtime.detailTab = tabJump.dataset.patientTabJump || 'journal';
        renderDetailPanel();
        return;
      }

      const openTpButton = event.target.closest('[data-patient-open-tp]');
      if (openTpButton && runtime.mode === 'register') {
        runtime.editingTpEntryId = normalizeText(openTpButton.dataset.patientOpenTp);
        runtime.editingPrpEntryId = '';
        runtime.editingFollowUpEntryId = '';
        runtime.editingClinicalFormKey = '';
        runtime.editingClinicalEntryId = '';
        runtime.detailTab = 'journal';
        renderDetailPanel();
        return;
      }

      const openPrpButton = event.target.closest('[data-patient-open-prp]');
      if (openPrpButton && runtime.mode === 'register') {
        runtime.editingPrpEntryId = normalizeText(openPrpButton.dataset.patientOpenPrp);
        runtime.editingTpEntryId = '';
        runtime.editingFollowUpEntryId = '';
        runtime.editingClinicalFormKey = '';
        runtime.editingClinicalEntryId = '';
        runtime.detailTab = 'journal';
        renderDetailPanel();
        return;
      }

      const openFollowUpButton = event.target.closest('[data-patient-open-follow-up]');
      if (openFollowUpButton && runtime.mode === 'register') {
        runtime.editingFollowUpEntryId = normalizeText(
          openFollowUpButton.dataset.patientOpenFollowUp
        );
        runtime.editingTpEntryId = '';
        runtime.editingPrpEntryId = '';
        runtime.editingClinicalFormKey = '';
        runtime.editingClinicalEntryId = '';
        runtime.detailTab = 'journal';
        renderDetailPanel();
        return;
      }

      const openClinicalButton = event.target.closest('[data-patient-open-clinical]');
      if (openClinicalButton && runtime.mode === 'register') {
        const raw = normalizeText(openClinicalButton.dataset.patientOpenClinical);
        const [formKey, entryId] = raw.split(':');
        runtime.editingClinicalFormKey = formKey;
        runtime.editingClinicalEntryId = normalizeText(entryId);
        runtime.editingTpEntryId = '';
        runtime.editingPrpEntryId = '';
        runtime.editingFollowUpEntryId = '';
        runtime.detailTab = 'journal';
        renderDetailPanel();
        return;
      }

      const signButton = event.target.closest('[data-patient-sign-entry]');
      if (signButton && runtime.mode === 'register') {
        void signJournalEntry(signButton.dataset.patientSignEntry);
        return;
      }

      const annotateButton = event.target.closest('[data-patient-annotate-photo]');
      if (annotateButton && runtime.mode === 'register') {
        void openPlanEditor(
          annotateButton.dataset.patientEntryId,
          annotateButton.dataset.patientAnnotatePhoto,
          annotateButton.dataset.patientPhotoId
        );
        return;
      }

      const deletePhotoButton = event.target.closest('[data-patient-delete-photo]');
      if (deletePhotoButton && runtime.mode === 'register') {
        void deleteConsultationPhoto(
          deletePhotoButton.dataset.patientEntryId,
          deletePhotoButton.dataset.patientAttachmentId,
          deletePhotoButton.dataset.patientDeletePhoto
        );
        return;
      }

      const clearSmokePhotosButton = event.target.closest('[data-patient-clear-smoke-photos]');
      if (clearSmokePhotosButton && runtime.mode === 'register') {
        void clearSmokeConsultationPhotos(
          clearSmokePhotosButton.dataset.patientClearSmokePhotos
        );
        return;
      }

      const clearPlanPhotosButton = event.target.closest('[data-patient-clear-plan-photos]');
      if (clearPlanPhotosButton && runtime.mode === 'register') {
        void deleteAllConsultationPhotos(clearPlanPhotosButton.dataset.patientClearPlanPhotos);
        return;
      }

      const actionButton = event.target.closest('[data-patient-action]');
      if (actionButton && runtime.mode === 'register') {
        if (actionButton.dataset.patientAction === 'import-historical') {
          void importHistoricalForCurrentPatient();
        } else if (actionButton.dataset.patientAction === 'new-tp-journal') {
          void createTpJournalDraft();
        } else if (actionButton.dataset.patientAction === 'new-prp-journal') {
          void createPrpJournalDraft();
        } else if (actionButton.dataset.patientAction === 'new-follow-up-journal') {
          void createFollowUpJournalDraft();
        } else if (actionButton.dataset.patientAction === 'new-health-declaration') {
          void createClinicalJournalDraft('health');
        } else if (actionButton.dataset.patientAction === 'new-fitness-certificate') {
          void createClinicalJournalDraft('fitness');
        } else if (actionButton.dataset.patientAction === 'new-consultation-plan') {
          void createConsultationPlan();
        } else if (actionButton.dataset.patientAction === 'create-offer-from-plan') {
          void createOfferFromPlan(actionButton.dataset.patientEntryId);
        } else if (actionButton.dataset.patientAction === 'send-offer-for-sign') {
          void sendOfferForSign();
        } else if (actionButton.dataset.patientAction === 'accept-offer') {
          void acceptOffer(actionButton.dataset.patientForceOffer === '1');
        } else if (actionButton.dataset.patientAction === 'send-patient-info') {
          void sendPatientInfo();
        } else if (actionButton.dataset.patientAction === 'create-agreement-from-offer') {
          void createAgreementFromOffer();
        } else if (actionButton.dataset.patientAction === 'send-agreement-for-sign') {
          void sendAgreementForSign();
        } else if (actionButton.dataset.patientAction === 'accept-agreement') {
          void acceptAgreement(actionButton.dataset.patientForceAgreement === '1');
        } else if (actionButton.dataset.patientAction === 'copy-patient-link') {
          void copyPatientDeepLink();
        } else if (actionButton.dataset.patientAction === 'show-patient-qr') {
          showPatientQrCode();
        } else if (actionButton.dataset.patientAction === 'retry-detail-load') {
          if (runtime.selectedPatientId) {
            void loadPatientDetail(runtime.selectedPatientId);
          }
        }
      }
    });

    document.addEventListener('submit', (event) => {
      const tpForm = event.target.closest('[data-tp-journal-save-form]');
      if (tpForm && runtime.mode === 'register') {
        event.preventDefault();
        void saveTpJournalEntry(tpForm);
        return;
      }

      const prpForm = event.target.closest('[data-prp-journal-save-form]');
      if (prpForm && runtime.mode === 'register') {
        event.preventDefault();
        void savePrpJournalEntry(prpForm);
        return;
      }

      const followForm = event.target.closest('[data-follow-journal-save-form]');
      if (followForm && runtime.mode === 'register') {
        event.preventDefault();
        void saveFollowUpJournalEntry(followForm);
        return;
      }

      const clinicalForm = event.target.closest('[data-clinical-journal-save-form]');
      if (clinicalForm && runtime.mode === 'register') {
        event.preventDefault();
        void saveClinicalJournalEntry(clinicalForm);
        return;
      }

      const form = event.target.closest('[data-staff-login-form]');
      if (form && runtime.mode === 'register') {
        event.preventDefault();
        void submitStaffLogin(form);
        return;
      }

      const setupForm = event.target.closest('[data-staff-setup-password-form]');
      if (setupForm && runtime.mode === 'register') {
        event.preventDefault();
        void submitStaffPasswordSetup(setupForm);
      }
    });

    document.addEventListener('change', (event) => {
      const cameraInput = event.target.closest('[data-patient-photo-camera]');
      const galleryInput = event.target.closest('[data-patient-photo-gallery]');
      const uploadInput =
        cameraInput || galleryInput || event.target.closest('[data-patient-photo-upload]');
      if (!uploadInput || runtime.mode !== 'register') return;
      const files = uploadInput.files ? Array.from(uploadInput.files) : [];
      uploadInput.value = '';
      if (!files.length) return;
      if (files.length === 1) void uploadConsultationPhoto(files[0]);
      else void uploadConsultationPhotos(files);
    });

    window.addEventListener('online', () => {
      if (runtime.mode === 'register') {
        setStatus('Anslutning återställd.', 'success');
        if (
          runtime.selectedPatientId &&
          !runtime.detail?.card &&
          document.querySelector('[data-patient-load-error="true"]')
        ) {
          void loadPatientDetail(runtime.selectedPatientId);
        }
      }
    });
    window.addEventListener('offline', () => {
      if (runtime.mode === 'register') {
        setStatus('Ingen internetanslutning.', 'error');
      }
    });

    if (els.search) {
      els.search.addEventListener('input', () => {
        if (runtime.mode !== 'register') return;
        runtime.query = normalizeText(els.search.value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          runtime.selectedPatientId = '';
          runtime.detail = null;
          renderDetailEmpty();
          void loadPatientList();
        }, 280);
      });
    }

    if (els.filter) {
      els.filter.addEventListener('change', () => {
        if (runtime.mode !== 'register') return;
        const value = normalizeText(els.filter.value);
        const flagMap = {
          'matchade kunder': '',
          'med drive-filer': 'has_drive_files',
          'behöver granskning': 'needs_review',
          'endast cliento': 'cliento_only',
          'endast drive': 'drive_only',
          'importerad journal': '',
        };
        runtime.flagFilter = flagMap[value.toLowerCase()] || '';
        if (runtime.flagFilter === 'needs_review' && runtime.mode !== 'identity') {
          setMode('identity');
          return;
        }
        runtime.selectedPatientId = '';
        runtime.detail = null;
        renderDetailEmpty();
        void loadPatientList();
      });
    }

    window.addEventListener('popstate', () => {
      if (suppressMobilePatientPopstate) {
        suppressMobilePatientPopstate = false;
        return;
      }
      if (!isMobileViewport() || runtime.mode !== 'register') return;
      const state = window.history.state;
      if (!state?.ccoMobilePatient && runtime.selectedPatientId) {
        mobilePatientHistoryDepth = Math.max(0, mobilePatientHistoryDepth - 1);
        resetMobilePatientDetailState();
        renderDetailEmpty();
        renderPatientRows();
        syncMobilePatientLayout();
        return;
      }
      const historyPatientId = normalizeText(state?.ccoMobilePatient);
      if (historyPatientId && historyPatientId !== runtime.selectedPatientId) {
        void loadPatientDetail(historyPatientId);
      }
    });

    try {
      window.matchMedia('(max-width: 768px)').addEventListener('change', syncMobilePatientLayout);
    } catch {
      window.addEventListener('resize', syncMobilePatientLayout);
    }
  }

  function onCustomersViewOpenImpl() {
    ensureCustomersShellVisible();
    resolveElements();
    renderModeChrome();
    ensureMobilePatientListHistory();
    const startup = parseStartupParams();
    if (startup.patientId) {
      runtime.pendingPatientId = startup.patientId;
      runtime.preferJournalOnMobile = true;
    }
    if (runtime.mode === 'register') {
      if (needsStaffLogin() || runtime.authRequired) {
        if (runtime.authRequired) {
          clearStaffTokens();
        }
        resetAuthMobileLayout();
        renderDetailEmpty();
        renderPatientRows();
        return;
      }
      window.ArcanaPostOpInternalReviews?.refresh?.();
      const deepLinkId = normalizeText(runtime.pendingPatientId || startup.patientId);
      const preserveDetail =
        deepLinkId &&
        isMobileViewport() &&
        normalizeText(runtime.selectedPatientId) === deepLinkId &&
        (runtime.detailLoading ||
          Boolean(runtime.detail?.card) ||
          patientDetailInflight.has(normalizeText(deepLinkId)) ||
          railHasPatientDetailShell());
      if (!preserveDetail) {
        renderDetailEmpty();
      }
      if (
        deepLinkId &&
        isMobileViewport() &&
        !runtime.detail?.card &&
        !patientDetailInflight.has(normalizeText(deepLinkId)) &&
        !railHasPatientDetailShell()
      ) {
        runtime.selectedPatientId = deepLinkId;
        renderDetailLoadingSkeleton(deepLinkId);
        syncMobilePatientLayout();
      }
      if (!runtime.loaded && !runtime.loading) {
        void loadOfferTemplates();
        const mobileDeepLink = deepLinkId && isMobileViewport();
        if (mobileDeepLink) {
          void loadPatientList();
          void loadStats();
        } else {
          void loadStats();
          void loadPatientList();
        }
      } else {
        renderPatientRows();
        syncMobilePatientLayout();
      }
      if (isMobileViewport() && els.search && !runtime.selectedPatientId && !startup.patientId) {
        window.setTimeout(() => {
          try {
            els.search.focus({ preventScroll: true });
          } catch {
            els.search.focus();
          }
        }, 180);
      }
    }
  }

  let customersViewOpenQueued = false;
  function onCustomersViewOpen() {
    if (customersViewOpenQueued) return;
    customersViewOpenQueued = true;
    const run = () => {
      customersViewOpenQueued = false;
      onCustomersViewOpenImpl();
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      window.setTimeout(run, 0);
    }
  }

  function bootstrap() {
    resolveElements();
    renderModeChrome();
    const startup = parseStartupParams();
    const primedPatientId = normalizeText(window.__ARCANA_MOBILE_DEEPLINK_PRIME__ || '');
    if (startup.patientId) {
      runtime.pendingPatientId = startup.patientId;
    }
    if (startup.patientId && isMobileViewport()) {
      runtime.selectedPatientId = startup.patientId;
      runtime.preferJournalOnMobile = true;
      runtime.detailTab = 'journal';
      if (!primedPatientId && !railHasPatientDetailShell()) {
        renderDetailLoadingSkeleton(startup.patientId);
      }
      if (!needsStaffLogin()) {
        void loadPatientDetail(startup.patientId);
      }
    } else if (isCustomersShellActive()) {
      onCustomersViewOpen();
    } else {
      renderDetailEmpty();
    }
    bindEvents();
    if (!(startup.patientId && isMobileViewport())) {
      void loadOfferTemplates();
    }
    if ('serviceWorker' in navigator) {
      const unregisterWorkers = () => {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
          .catch(() => { });
      };
      if (startup.patientId && isMobileViewport()) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(unregisterWorkers, { timeout: 4000 });
        } else {
          window.setTimeout(unregisterWorkers, 0);
        }
      } else {
        unregisterWorkers();
      }
    }
  }

  function setPatientTab(tabKey) {
    if (!runtime.detail?.card) return false;
    if (switchDetailTab(tabKey || 'profil')) {
      return true;
    }
    runtime.detailTab = tabKey || 'profil';
    if (tabKey === 'journal') {
      runtime.preferJournalOnMobile = true;
    } else {
      runtime.preferJournalOnMobile = false;
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
    }
    renderDetailPanel();
    syncMobilePatientLayout();
    window.ArcanaMobileShell?.syncFromApp?.();
    return true;
  }

  function showMobileToast(message) {
    setStatus(message, 'info');
  }

  function renderStaffAuth() {
    resolveElements();
    if (runtime.mode !== 'register') return false;
    if (!needsStaffLogin()) return false;
    renderPatientRows();
    return true;
  }

  window.ArcanaPatientMasterUi = {
    onCustomersViewOpen,
    setMode,
    getRuntime: () => ({ ...runtime }),
    needsStaffLogin,
    renderStaffAuth,
    clearMobilePatientSelection,
    goBackToPatientList,
    syncMobilePatientLayout,
    setPatientTab,
    showMobileToast,
  };

  function shouldBootstrapMobileDeepLinkNow() {
    try {
      if (!isMobileViewport()) return false;
      const startup = parseStartupParams();
      return Boolean(normalizeText(startup.patientId));
    } catch {
      return false;
    }
  }

  let bootstrapStarted = false;

  function runBootstrapOnce() {
    if (bootstrapStarted) return;
    bootstrapStarted = true;
    bootstrap();
  }

  function bootWhenPatientRailReady() {
    if (!shouldBootstrapMobileDeepLinkNow()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runBootstrapOnce, { once: true });
      } else {
        runBootstrapOnce();
      }
      return;
    }

    if (document.querySelector('[data-patient-master-rail]')) {
      runBootstrapOnce();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-patient-master-rail]')) {
        observer.disconnect();
        runBootstrapOnce();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        observer.disconnect();
        runBootstrapOnce();
      },
      { once: true }
    );
  }

  function watchCustomersShellActivation() {
    const canvas = document.querySelector('.preview-canvas');
    if (!canvas) return;
    const openIfCustomers = () => {
      if (canvas.dataset.appShellView !== 'customers' || runtime.mode !== 'register') return;
      if (runtime.loading || runtime.loaded) return;
      onCustomersViewOpen();
    };
    openIfCustomers();
    const observer = new MutationObserver(openIfCustomers);
    observer.observe(canvas, { attributes: true, attributeFilter: ['data-app-shell-view'] });
  }

  bootWhenPatientRailReady();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchCustomersShellActivation, { once: true });
  } else {
    watchCustomersShellActivation();
  }
})();
