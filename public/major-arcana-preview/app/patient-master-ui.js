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

  function isAisiaScalpAnalysisEnabled() {
    return window.__ARCANA_ENABLE_AISIA_SCALP_ANALYSIS__ === true;
  }

  function normalizeDetailTab(tab) {
    const normalized = tab || 'profil';
    if (normalized === 'scalpanalys' && !isAisiaScalpAnalysisEnabled()) {
      return 'profil';
    }
    return normalized;
  }

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
    web_booking: 'Webbokning',
    unmatched: 'Ny i Arcana',
  };

  const ORIGIN_LABELS = {
    imported: 'Importerad',
    web_booking: 'Webbokning',
    new: 'Ny i Arcana',
  };

  const MISSING_FORM_LABELS = {
    health_declaration: 'Hälsodeklaration saknas',
    health_declaration_signature: 'Hälsodeklaration ej signerad',
    consultation_plan: 'Behandlingsplan saknas',
    consultation_plan_signature: 'Behandlingsplan ej signerad',
    treatment_agreement: 'Behandlingsavtal saknas eller ej bokningsbart',
  };

  const JOURNAL_TYPE_LABELS = {
    historical_import: 'Importerad journal',
    tp_treatment: 'TP-journal',
    prp_treatment: 'PRP-journal',
    follow_up: 'Uppföljning',
    bleph_treatment: 'Ögonlocksjournal',
    health_declaration: 'Hälsodeklaration',
    fitness_certificate: 'Friskförsäkran',
    consultation_plan: 'Behandlingsplan',
  };

  const PHOTO_LABEL_OPTIONS = ['Front', 'Vertex', 'Baksida', 'Profil', 'Annan'];
  const V9_FLAG_FILTER_VALUES = new Set([
    '',
    'has_drive_files',
    'needs_review',
    'cliento_only',
    'drive_only',
  ]);
  const V9_FLAG_FILTER_LABELS = {
    '': 'Alla kunder',
    has_drive_files: 'Med Drive-filer',
    needs_review: 'Behöver granskning',
    cliento_only: 'Endast Cliento',
    drive_only: 'Endast Drive',
  };
  const V9_FLAG_FILTER_FROM_LABEL = Object.fromEntries(
    Object.entries(V9_FLAG_FILTER_LABELS).map(([flag, label]) => [label.toLowerCase(), flag])
  );
  /** Owner facit — samma rader som kunder-mockup-v10.html vänster panel */
  const V10_FACIT_SIDEBAR_IDS = new Set([
    'all',
    'mine',
    'today_visits',
    'this_week',
    'waitlist',
    'treatment_dhi',
    'treatment_prp',
    'treatment_microneedling',
    'treatment_consultation',
    'vip',
    'risk',
    'new',
    'dormant',
    'lane_agera',
    'lane_bokningsbar',
    'lane_operation',
    'lane_eftervard',
    'lane_medicinsk',
  ]);

  /** Sidebar placement — keep in sync with public/cco-kunder-real.js SEGMENT_UI */
  const V9_SEGMENT_UI = [
    { id: 'all', side: true, chip: 'all', group: 'core' },
    { id: 'mine', side: true, group: 'core' },
    { id: 'today_visits', side: true, group: 'core' },
    { id: 'this_week', side: true, group: 'core' },
    { id: 'waitlist', side: true, group: 'core' },
    { id: 'treatment_fue', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_dhi', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_prp', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_microneedling', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_consultation', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_followup', side: true, treatment: true, group: 'treatment' },
    { id: 'treatment_curatiio', side: true, treatment: true, group: 'treatment' },
    { id: 'lane_agera', side: true, group: 'lanes' },
    { id: 'lane_bokningsbar', side: true, group: 'lanes' },
    { id: 'lane_operation', side: true, group: 'lanes' },
    { id: 'lane_eftervard', side: true, group: 'lanes' },
    { id: 'lane_medicinsk', side: true, group: 'lanes' },
    { id: 'active', chip: 'aktiva' },
    { id: 'vip', side: true, chip: 'vip', group: 'status' },
    { id: 'risk', side: true, chip: 'risk', group: 'status' },
    { id: 'new', side: true, chip: 'nya', group: 'status' },
    { id: 'dormant', side: true, chip: 'dormant', group: 'status' },
    { id: 'missing_health_declaration', side: true, chip: 'saknar-hd', group: 'status' },
    { id: 'missing_journal', side: true, group: 'status' },
    { id: 'missing_encounter', group: 'status' },
    { id: 'needs_review', side: true, group: 'status' },
    { id: 'has_drive', side: true, group: 'status' },
    { id: 'has_drive_journal', group: 'status' },
    { id: 'has_drive_document', group: 'status' },
    { id: 'drive_only', side: true, group: 'status' },
    { id: 'cliento_only', side: true, group: 'status' },
    { id: 'duplicate_email', side: true, group: 'status' },
    { id: 'getaccept', group: 'status' },
    { id: 'halso', group: 'status' },
    { id: 'photos_review', group: 'status' },
    { id: 'has_images', group: 'status' },
    { id: 'import_review', group: 'status' },
  ];
  const V9_SEGMENT_UI_BY_ID = Object.fromEntries(V9_SEGMENT_UI.map((entry) => [entry.id, entry]));
  const V9_SEGMENT_DOT_CLASS = {
    treatment_fue: 'dot--fue',
    treatment_dhi: 'dot--dhi',
    treatment_prp: 'dot--prp',
    treatment_microneedling: 'dot--microneedling',
    treatment_consultation: 'dot--consultation',
    treatment_followup: 'dot--followup',
    treatment_curatiio: 'dot--curatiio',
    vip: 'dot--vip',
    risk: 'dot--risk',
    new: 'dot--new',
    dormant: 'dot--inaktiv',
    missing_health_declaration: 'dot--missing-hd',
    missing_journal: 'dot--missing-journal',
    missing_encounter: 'dot--missing-encounter',
    needs_review: 'dot--review',
    has_drive: 'dot--drive',
    has_drive_journal: 'dot--drive-journal',
    has_drive_document: 'dot--drive-doc',
    drive_only: 'dot--drive-only',
    cliento_only: 'dot--cliento-only',
    duplicate_email: 'dot--duplicate',
    getaccept: 'dot--getaccept',
    halso: 'dot--halso',
    photos_review: 'dot--photos-review',
    has_images: 'dot--images',
    import_review: 'dot--import-review',
  };
  const V9_DOSSIER_TABS = [
    { key: 'oversikt', label: 'Översikt', accent: 'overview' },
    { key: 'profil', label: 'Profil', accent: 'studio' },
    { key: 'journal', label: 'Journal', accent: 'journal' },
    { key: 'tidslinje', label: 'Bokningar', accent: 'booking' },
    { key: 'filer', label: 'Filer', accent: 'files' },
    { key: 'avtal', label: 'Ekonomi', accent: 'economy' },
    { key: 'anteckningar', label: 'Anteckningar', accent: 'notes' },
  ];
  const V9_SECTION_TAB_JUMP = {
    historik: 'tidslinje',
    ekonomi: 'avtal',
    journal: 'journal',
    filer: 'filer',
    kontakt: 'profil',
    compliance: 'profil',
    upcoming: 'oversikt',
    ai: 'oversikt',
  };
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
    activeSegmentId: 'all',
    segmentFilter: '',
    segments: [],
    segmentTotals: {},
    staffOwnership: null,
    offset: 0,
    total: 0,
    patients: [],
    selectedPatientId: '',
    detail: null,
    detailTab: 'profil',
    blueprintWorkspaceTab: 'oversikt',
    v9SortKey: 'activity',
    v9ListView: 'list',
    detailLoading: false,
    detailShellOnly: false,
    commercialCase: null,
    kkxActiveJournalTemplate: 'tp',
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
    segmentStats: null,
    automation: null,
    reviewGroups: null,
    reviewGroupsLoading: false,
    draftProposals: null,
    draftProposalsLoading: false,
    draftProposalsPatientId: '',
    preferJournalOnMobile: false,
    pendingPatientId: '',
    pendingListReload: null,
    pendingPasswordSetup: null,
    editingTpEntryId: '',
    editingPrpEntryId: '',
    editingFollowUpEntryId: '',
    editingBlephEntryId: '',
    editingClinicalFormKey: '',
    editingClinicalEntryId: '',
    journalTimelineFilter: 'all',
    focusTimelineKey: '',
    journalLoaded: false,
    journalLoading: false,
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
    return !hasStoredStaffSession() && !isStaffJournalOpenAccess();
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
    if (
      window.__ARCANA_DEEPLINK_HYDRATED__ ||
      window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__ ||
      window.__ARCANA_MOBILE_DEEPLINK_PRIME__
    ) {
      return;
    }
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

  function isCompactFormViewport() {
    try {
      return window.matchMedia('(max-width: 1023px)').matches;
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
    if (window.history.state?.ccoMobilePatientList || window.history.state?.ccoMobilePatient)
      return;
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
    runtime.editingBlephEntryId = '';
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
        flags: normalizeText(params.get('flags')),
        segment: normalizeText(params.get('segment')),
      };
    } catch {
      return { patientId: '', view: '', flags: '', segment: '' };
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

  function defaultPhotoLabel() {
    return PHOTO_LABEL_OPTIONS[0] || 'Front';
  }

  function resolveKkxTemplateIdFromPatientAction(action, dataset = {}) {
    switch (normalizeText(action)) {
      case 'new-tp-journal':
        return 'tp';
      case 'new-prp-journal':
        return 'prp';
      case 'new-follow-up-journal':
        return normalizeText(dataset.followFormVariant) === '4_manader' ||
          !normalizeText(dataset.followFormVariant)
          ? 'follow_4'
          : '';
      case 'new-health-declaration':
        return 'pre_health';
      default:
        return '';
    }
  }

  function ensureKkxJournalMountSlot() {
    const existing = document.querySelector('[data-kkx-journal-mount]');
    if (existing) return Promise.resolve(existing);
    if (!window.CcoKundkortKkx?.openBig) return Promise.resolve(null);
    return new Promise((resolve) => {
      window.CcoKundkortKkx.openBig('Journal · arbetsyta', '<div data-kkx-journal-mount></div>', {
        onMount: (shell) => resolve(shell.querySelector('[data-kkx-journal-mount]')),
      });
    });
  }

  async function handleJournalTemplateAction(action, dataset = {}) {
    const templateId = resolveKkxTemplateIdFromPatientAction(action, dataset);
    if (!templateId) return false;
    switchDetailTab('journal');
    const slot = await ensureKkxJournalMountSlot();
    if (!slot) return false;
    await activateKkxJournalTemplate(templateId, slot, {
      prpFormVariant: normalizeText(dataset.prpFormVariant) || '',
    });
    return true;
  }

  function resolveKkxTemplateIdFromJournalType(journalType, formVariant = '') {
    const type = normalizeText(journalType);
    const variant = normalizeText(formVariant);
    if (type === 'tp_treatment') return 'tp';
    if (type === 'prp_treatment') return 'prp';
    if (type === 'follow_up') return variant === '4_manader' || !variant ? 'follow_4' : '';
    if (type === 'health_declaration' || type === 'fitness_certificate') return 'pre_health';
    return '';
  }

  async function persistConsultationPhotoLabel(entryId, attachmentId, photoId, label) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
    if (!patientId || !entryId || !attachmentId || !photoId || !planEntry) return;
    if (planEntry.entryId !== entryId || planEntry.locked) return;
    const nextLabel = normalizeText(label) || defaultPhotoLabel();
    const attachments = asArray(planEntry.attachments).map((item) => {
      if (normalizeText(item.attachmentId) !== normalizeText(attachmentId)) return item;
      return { ...item, label: nextLabel };
    });
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId: planEntry.entryId,
          personnummer: card?.personnummer || '',
          journalType: planEntry.journalType,
          formVariant: planEntry.formVariant || '',
          sourceQuestionaryId: planEntry.sourceQuestionaryId || '',
          title: planEntry.title || 'Behandlingsplan',
          fields: planEntry.fields || {},
          attachments,
        },
      });
      await loadPatientDetail(patientId);
      const kkxSlot = document.querySelector('[data-kkx-journal-mount]');
      if (kkxSlot) {
        mountKkxJournalBig(kkxSlot, { templateId: runtime.kkxActiveJournalTemplate });
      }
      setStatus('Foto-etikett sparad.', 'success');
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara foto-etikett.', 'error');
    }
  }

  function startInlinePhotoLabelEdit(labelNode) {
    if (!labelNode || labelNode.dataset.kkxLabelEditing === '1') return;
    const tile = labelNode.closest('[data-kkx-photo-tile]');
    if (!tile) return;
    const entryId = tile.getAttribute('data-kkx-plan-entry-id') || '';
    const attachmentId = tile.getAttribute('data-kkx-plan-attachment-id') || '';
    const photoId = tile.getAttribute('data-kkx-photo-tile') || '';
    if (!entryId || !attachmentId || !photoId) return;

    labelNode.dataset.kkxLabelEditing = '1';
    const current = normalizeText(labelNode.textContent) || defaultPhotoLabel();
    const editor = document.createElement('input');
    editor.type = 'text';
    editor.className = 'kkx-jfoto-label-input';
    editor.value = current;
    editor.setAttribute('list', 'kkx-photo-label-options');
    editor.setAttribute('aria-label', 'Foto-etikett');
    labelNode.replaceWith(editor);
    editor.focus();
    editor.select();

    const finish = async (commit) => {
      if (editor.dataset.kkxLabelDone === '1') return;
      editor.dataset.kkxLabelDone = '1';
      const next = commit ? normalizeText(editor.value) || defaultPhotoLabel() : current;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fl kkx-jfoto-label';
      button.dataset.kkxPhotoLabelEdit = '1';
      button.textContent = next;
      editor.replaceWith(button);
      if (commit && next !== current) {
        await persistConsultationPhotoLabel(entryId, attachmentId, photoId, next);
      }
    };

    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        void finish(false);
      }
    });
    editor.addEventListener('blur', () => {
      void finish(true);
    });
  }

  function ensurePhotoLabelDatalist(root) {
    const scope = root || document;
    if (scope.querySelector('#kkx-photo-label-options')) return;
    const datalist = document.createElement('datalist');
    datalist.id = 'kkx-photo-label-options';
    PHOTO_LABEL_OPTIONS.forEach((option) => {
      const node = document.createElement('option');
      node.value = option;
      datalist.appendChild(node);
    });
    scope.appendChild(datalist);
  }

  function isPlanUploadBlocked(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    return Boolean(planEntry && (planEntry.locked || planEntry.status === 'signed'));
  }

  async function apiRequest(path, options = {}) {
    const ccoData = window.ArcanaCcoData;
    const policy = ccoData?.policy?.PATIENT_LIST || { staleTime: 120000, gcTime: 600000 };
    if (ccoData?.fetch && options.cacheKey) {
      return ccoData.fetch(options.cacheKey, () => apiRequestRaw(path, options), {
        staleTime: options.staleTime ?? policy.staleTime,
        gcTime: options.gcTime ?? policy.gcTime,
        force: options.force === true,
      });
    }
    return apiRequestRaw(path, options);
  }

  const apiRequestRaw = (window.ArcanaCcoFetchInstrumentation?.instrumentAsyncFn || ((fn) => fn))(
    async function apiRequestImpl(path, options = {}) {
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
    },
    { getPath: (path) => path }
  );

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
    els.v9Header = document.querySelector('[data-v9-customers-header]');
    els.v9Filters = document.querySelector('[data-v9-customers-filters]');
    els.v9Sidebar = document.querySelector('[data-v9-segment-sidebar]');
    els.v9AggInsights = document.querySelector('[data-v9-agg-insights]');
    els.workspace = document.querySelector('[data-customers-workspace]');
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
    syncV9CustomersChrome();
  }

  function isV9CustomersEnabled() {
    return (
      document.documentElement.getAttribute('data-v9-enabled') === 'on' ||
      window.__ARCANA_V9_ENABLED__ === true
    );
  }

  /** Owner facit 2026-06-06: kunder-mockup-v10.html (sätt __ARCANA_V10_KUNDKORT_FACIT=false för att pausa). */
  function usesV10KundkortFacit() {
    return window.__ARCANA_V10_KUNDKORT_FACIT !== false;
  }

  /** v11 cutover av — v10 mockup är canonical kundkort-yta. */
  function usesV11DossierCutover() {
    return false;
  }

  /** ORD-28 — desktop 3-kolumn; av när v10-facit (mockupens enkolumn-dossier). */
  function usesBlueprintDesktopLayout() {
    if (usesV10KundkortFacit()) return false;
    if (!isV9CustomersEnabled()) return false;
    if (document.documentElement.getAttribute('data-cco-mobile-shell') === 'on') return false;
    if (
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(min-width: 1180px)').matches
    ) {
      return false;
    }
    return typeof window.CcoKundkortBlueprint?.renderKundkort === 'function';
  }

  /** REFERENS master-detail — bred lista + stort kort, ingen mitten-workspace. */
  function usesReferensMasterDetail() {
    // Fazli 2026-06-06: 4-panels-layout (sidebar · lista · arbetsyta · kort) är önskat läge.
    // Master-detail (3 paneler) avstängd. Sätt window.__ARCANA_REFERENS_MASTER_DETAIL = true för att slå på igen.
    if (window.__ARCANA_REFERENS_MASTER_DETAIL !== true) return false;
    if (!usesBlueprintDesktopLayout()) return false;
    if (typeof window.__renderReferensKundkort !== 'function') return false;
    if (
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(min-width: 1100px)').matches
    ) {
      return false;
    }
    return true;
  }

  function applyReferensMasterDetailLayout() {
    if (!usesReferensMasterDetail()) return;
    document.documentElement.setAttribute('data-v9-referens-master-detail', 'on');
    document.documentElement.removeAttribute('data-v9-blueprint');
    const workspace = els.workspace || document.querySelector('[data-customers-workspace]');
    if (workspace) {
      workspace.innerHTML = '';
      workspace.hidden = true;
      workspace.setAttribute('aria-hidden', 'true');
      workspace.style.setProperty('display', 'none', 'important');
    }
    const layout = document.querySelector('.customers-layout');
    if (layout) {
      layout.style.setProperty('grid-template-columns', '180px minmax(0, 1fr) 424px', 'important');
      layout.style.setProperty('gap', '18px', 'important');
    }
    const list = document.querySelector('.customers-list');
    if (list) {
      list.style.setProperty('max-width', 'none', 'important');
      list.style.setProperty('width', '100%', 'important');
    }
  }

  function clearReferensMasterDetailLayout() {
    document.documentElement.removeAttribute('data-v9-referens-master-detail');
    const layout = document.querySelector('.customers-layout');
    if (layout) {
      layout.style.removeProperty('grid-template-columns');
      layout.style.removeProperty('gap');
    }
    const list = document.querySelector('.customers-list');
    if (list) {
      list.style.removeProperty('max-width');
      list.style.removeProperty('width');
    }
    const workspace = els.workspace || document.querySelector('[data-customers-workspace]');
    if (workspace) {
      workspace.style.removeProperty('display');
    }
  }

  function clearBlueprintWorkspace() {
    const workspace = els.workspace || document.querySelector('[data-customers-workspace]');
    if (workspace) {
      workspace.innerHTML = '';
      workspace.hidden = true;
      workspace.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.removeAttribute('data-v9-blueprint');
    clearReferensMasterDetailLayout();
  }

  function openBlueprintFullDossier(root, ctx) {
    const { card, journalEntries, dossierBundle, occasionTimeline, driveFiles } = ctx;
    const deep = root?.querySelector('[data-v9-dossier-deep]');
    const body = deep?.querySelector('[data-v9-deep-body]');
    if (!deep || !body) return;
    const slideOver =
      window.CcoV9CustomersParity?.renderKundkortSlideOverHtml?.(
        card,
        journalEntries,
        dossierBundle,
        occasionTimeline,
        driveFiles
      ) || '<p class="patient-master-muted">Full dossier kunde inte renderas.</p>';
    body.innerHTML = slideOver;
    deep.hidden = false;
    deep.removeAttribute('aria-hidden');
    window.CcoV9CustomersParity?.bindKundkortSlideOver?.(body, {
      switchTab: (tab) => switchDetailTab(tab),
    });
    const close = () => {
      deep.hidden = true;
      deep.setAttribute('aria-hidden', 'true');
      body.innerHTML = '';
    };
    deep.querySelector('[data-v9-deep-close]')?.addEventListener('click', close, { once: true });
  }

  function renderBlueprintDetailPanels(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline,
    driveFiles
  ) {
    const rail = document.querySelector('[data-patient-master-rail]');
    const workspace = els.workspace || document.querySelector('[data-customers-workspace]');
    if (!rail || !window.CcoKundkortBlueprint) return false;
    els.patientRail = rail;
    const referensMasterDetail = usesReferensMasterDetail();
    if (referensMasterDetail) {
      applyReferensMasterDetailLayout();
    }
    // REFERENS-kortet är designen för panel 4 — oavsett layoutläge (4 paneler eller master-detail)
    rail.innerHTML =
      typeof window.__renderReferensKundkort === 'function'
        ? '<div class="kkref">' +
          window.__renderReferensKundkort(card, dossierBundle, journalEntries, {
            driveFiles,
            commercialCase: runtime.commercialCase || null,
            occasionTimeline,
          }) +
          '</div>'
        : window.CcoKundkortBlueprint.renderKundkort(
            card,
            journalEntries,
            dossierBundle,
            occasionTimeline,
            driveFiles
          );
    if (typeof window.__enhanceReferensKundkort === 'function') {
      window.__enhanceReferensKundkort(rail);
    }
    if (workspace && !referensMasterDetail) {
      workspace.innerHTML = window.CcoKundkortBlueprint.renderWorkspace(
        card,
        journalEntries,
        dossierBundle,
        occasionTimeline,
        { activeTab: runtime.blueprintWorkspaceTab || 'oversikt' }
      );
      workspace.hidden = false;
      workspace.setAttribute('aria-hidden', 'false');
      workspace.style.removeProperty('display');
    }
    window.CcoKundkortBlueprint.bindKundkort(rail, {
      openFullDossier: () =>
        openBlueprintFullDossier(rail, {
          card,
          journalEntries,
          dossierBundle,
          occasionTimeline,
          driveFiles,
        }),
    });
    if (workspace && !referensMasterDetail) {
      window.CcoKundkortBlueprint.bindWorkspace(workspace, {
        ctx: { card, journalEntries, dossierBundle },
        onTabChange: (tab) => {
          runtime.blueprintWorkspaceTab = tab;
        },
      });
    }
    bindKkxReferensPanel(rail, {
      card,
      journalEntries,
      dossierBundle,
      extras: { occasionTimeline },
      mountJournalBig: (slot, opts) => mountKkxJournalBig(slot, opts),
      activateJournalTemplate: (templateId, slot, opts) =>
        activateKkxJournalTemplate(templateId, slot, opts),
      resolveJournalTemplateId: (journalType, formVariant) =>
        resolveKkxTemplateIdFromJournalType(journalType, formVariant),
    });
    return true;
  }

  function bindKkxReferensPanel(rail, ctx) {
    if (!rail) return;
    const attempt = (triesLeft) => {
      const kkref = rail.querySelector('.kkref');
      if (kkref && window.CcoKundkortKkx?.bindPanel) {
        window.CcoKundkortKkx.bindPanel(kkref, ctx);
        if (typeof window.__enhanceReferensKundkort === 'function') {
          window.__enhanceReferensKundkort(rail);
        }
        return;
      }
      if (triesLeft > 0) window.requestAnimationFrame(() => attempt(triesLeft - 1));
    };
    attempt(12);
  }

  const KKX_JOURNAL_TEMPLATES = [
    {
      id: 'tp',
      label: 'TP-journal',
      journalType: 'tp_treatment',
      formVariant: 'hair_tp',
      createAction: 'new-tp-journal',
    },
    {
      id: 'prp',
      label: 'PRP-journal',
      journalType: 'prp_treatment',
      formVariant: 'prp_skin',
      createAction: 'new-prp-journal',
    },
    {
      id: 'follow_4',
      label: 'Uppföljning',
      journalType: 'follow_up',
      formVariant: '4_manader',
      createAction: 'new-follow-up-journal',
    },
    {
      id: 'pre_health',
      label: 'Pre-behandling',
      journalType: 'health_declaration',
      clinicalFormKey: 'health',
      createAction: 'new-health-declaration',
    },
  ];

  function resolveKkxTemplateForEntry(entry) {
    if (!entry?.journalType) return null;
    if (entry.journalType === 'tp_treatment') return 'tp';
    if (entry.journalType === 'prp_treatment') {
      return entry.formVariant === 'tp_post_op' ? 'prp' : 'prp';
    }
    if (entry.journalType === 'follow_up') return 'follow_4';
    if (entry.journalType === 'health_declaration') return 'pre_health';
    if (entry.journalType === 'fitness_certificate') return 'pre_health';
    return null;
  }

  function findKkxDraftEntry(entries, template) {
    if (!template) return null;
    return (
      asArray(entries).find((row) => {
        if (row.locked) return false;
        if (row.journalType !== template.journalType) return false;
        if (template.formVariant && row.formVariant && row.formVariant !== template.formVariant) {
          return false;
        }
        if (template.clinicalFormKey) {
          const key =
            window.ArcanaJournalClinicalFormKeys?.resolveEntryFormKey?.(row) ||
            (row.journalType === 'health_declaration' ? 'health' : 'fitness');
          return key === template.clinicalFormKey;
        }
        return true;
      }) || null
    );
  }

  function resolveKkxJournalEditTarget(entries, hintEntryId, hintJournalType) {
    const rows = asArray(entries);
    const normalizedHint = normalizeText(hintEntryId);
    if (normalizedHint) {
      const hit = rows.find((entry) => normalizeText(entry.entryId) === normalizedHint);
      if (hit) return hit;
    }
    if (hintJournalType) {
      const byType = rows.find(
        (entry) => entry.journalType === hintJournalType && !entry.locked && entry.canSign
      );
      if (byType) return byType;
    }
    const activeTemplate = KKX_JOURNAL_TEMPLATES.find(
      (item) => item.id === runtime.kkxActiveJournalTemplate
    );
    const activeDraft = findKkxDraftEntry(rows, activeTemplate);
    if (activeDraft) return activeDraft;
    const preferTypes = ['tp_treatment', 'prp_treatment', 'follow_up', 'health_declaration'];
    for (const journalType of preferTypes) {
      const draft = rows.find((entry) => entry.journalType === journalType && !entry.locked);
      if (draft) return draft;
    }
    return rows.find((entry) => !entry.locked && entry.canSign) || null;
  }

  function renderKkxJournalTemplatePicker(activeTemplateId) {
    return `
      <div class="kkx-jmall" data-kkx-journal-templates>
        ${KKX_JOURNAL_TEMPLATES.map(
          (template) =>
            `<button type="button" class="m${template.id === activeTemplateId ? ' act' : ''}" data-kkx-journal-template="${escapeHtml(template.id)}">${escapeHtml(template.label)}</button>`
        ).join('')}
      </div>`;
  }

  function renderKkxJournalFormMarkup(entries, entry) {
    setRuntimeEditingJournalEntry(entry);
    return [
      renderTpJournalSection(entries),
      renderPrpJournalSection(entries),
      renderFollowUpJournalSection(entries),
      renderBlephJournalSection(entries),
      renderClinicalFormSection(entries),
    ]
      .filter(Boolean)
      .join('');
  }

  function resolveKkxPlanPhotoTarget(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    const photo = asArray(planEntry?.attachments).find(
      (item) => item.type === 'consultation_photo' && item.photoId
    );
    return { planEntry, photo };
  }

  function renderKkxJournalPhotoShell(entries, entry) {
    const { planEntry, photo } = resolveKkxPlanPhotoTarget(entries);
    const photos = asArray(planEntry?.attachments).filter(
      (item) => item.type === 'consultation_photo' && item.photoId
    );
    const tiles = photos
      .slice(0, 3)
      .map((item) => {
        const label =
          normalizeText(item.label || item.fileName || item.variant || 'Foto') || 'Foto';
        const { planEntry: photoPlanEntry } = resolveKkxPlanPhotoTarget(entries);
        return `<div class="kkx-jfoto" data-kkx-photo-tile="${escapeHtml(item.photoId)}" data-kkx-plan-entry-id="${escapeHtml(photoPlanEntry?.entryId || '')}" data-kkx-plan-attachment-id="${escapeHtml(item.attachmentId || '')}"><img data-journal-photo-id="${escapeHtml(item.photoId)}" alt="${escapeHtml(label)}" loading="lazy" /><button type="button" class="fl kkx-jfoto-label" data-kkx-photo-label-edit title="Redigera etikett">${escapeHtml(label)}</button></div>`;
      })
      .join('');
    const annotateDisabled = !photo ? ' disabled' : '';
    return `
      <div class="kkx-jzon">Foton · dagens besök</div>
      <div class="kkx-jfoton" data-kkx-photo-grid>
        ${tiles}
        <label class="kkx-jfoto ny" data-kkx-ta-bild>
          + Ta bild
          <input type="file" accept="image/*,.heic,.heif" capture="environment" hidden data-kkx-photo-camera />
        </label>
      </div>
      <button type="button" class="kkx-jrita" data-kkx-open-plan-editor${annotateDisabled}${photo ? ` data-kkx-plan-photo-id="${escapeHtml(photo.photoId)}" data-kkx-plan-entry-id="${escapeHtml(planEntry.entryId)}" data-kkx-plan-attachment-id="${escapeHtml(photo.attachmentId)}"` : ''}>
        ✎ Rita på foto — hårlinje/krona
      </button>`;
  }

  async function persistKkxJournalVisibility(entry, scope) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !entry?.entryId || entry.locked) return;
    const visibility = scope === 'private' ? 'private_internal' : 'shared';
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId: entry.entryId,
          personnummer: card?.personnummer || '',
          journalType: entry.journalType,
          formVariant: entry.formVariant || '',
          sourceQuestionaryId: entry.sourceQuestionaryId || '',
          title: entry.title || 'Journal',
          fields: entry.fields || {},
          visibility,
        },
      });
      entry.visibility = visibility;
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara synlighet.', 'error');
    }
  }

  function bindKkxNoteVisibilityToggle(root, entry) {
    const toggle = root?.querySelector('[data-kkx-note-visibility]');
    if (!toggle) return;
    const scope = normalizeText(entry?.visibility) === 'private_internal' ? 'private' : 'shared';
    toggle.querySelectorAll('[data-kkx-note-scope]').forEach((node) => {
      const active =
        (node.dataset.kkxNoteScope === 'private' && scope === 'private') ||
        (node.dataset.kkxNoteScope === 'shared' && scope === 'shared');
      node.classList.toggle('act', active);
    });
    if (toggle.dataset.kkxBound === '1') return;
    toggle.dataset.kkxBound = '1';
    toggle.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-kkx-note-scope]');
      if (!btn || !toggle.contains(btn)) return;
      const nextScope = btn.dataset.kkxNoteScope === 'private' ? 'private' : 'shared';
      toggle.querySelectorAll('[data-kkx-note-scope]').forEach((node) => {
        node.classList.toggle('act', node === btn);
      });
      const liveEntry = resolveKkxJournalEditTarget(
        runtime.detail?.journalEntries,
        entry?.entryId,
        entry?.journalType
      );
      void persistKkxJournalVisibility(liveEntry, nextScope);
    });
  }

  async function activateKkxJournalTemplate(templateId, slot, options = {}) {
    if (runtime.kkxTemplateActivating) return;
    const template = KKX_JOURNAL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    runtime.kkxTemplateActivating = true;
    runtime.kkxActiveJournalTemplate = templateId;
    try {
      const entries = asArray(runtime.detail?.journalEntries);
      let entry = findKkxDraftEntry(entries, template);
      if (!entry) {
        if (template.createAction === 'new-tp-journal') await createTpJournalDraft();
        else if (template.createAction === 'new-prp-journal') {
          await createPrpJournalDraft(
            normalizeText(options.prpFormVariant) || template.formVariant || 'prp_skin'
          );
        } else if (template.createAction === 'new-follow-up-journal') {
          await createFollowUpJournalDraft(template.formVariant || '4_manader');
        } else if (template.createAction === 'new-health-declaration') {
          await createClinicalJournalDraft('health');
        }
        entry = findKkxDraftEntry(asArray(runtime.detail?.journalEntries), template);
      }
      mountKkxJournalBig(slot, {
        entryId: entry?.entryId || '',
        journalType: entry?.journalType || template.journalType,
        templateId,
      });
      slot
        .querySelector('[data-kkx-form-mount]')
        ?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    } finally {
      runtime.kkxTemplateActivating = false;
    }
  }

  function bindKkxJournalWorkspace(slot, entry) {
    if (!slot) return;
    slot.__kkxActiveEntry = entry || null;
    if (slot.dataset.kkxJournalBound === '1') return;
    slot.dataset.kkxJournalBound = '1';

    slot.addEventListener('click', (event) => {
      const labelBtn = event.target.closest('[data-kkx-photo-label-edit]');
      if (labelBtn) {
        event.preventDefault();
        startInlinePhotoLabelEdit(labelBtn);
        return;
      }
      const templateBtn = event.target.closest('[data-kkx-journal-template]');
      if (templateBtn) {
        event.preventDefault();
        const templateId = templateBtn.getAttribute('data-kkx-journal-template') || 'tp';
        void activateKkxJournalTemplate(templateId, slot);
        return;
      }
      const planBtn = event.target.closest('[data-kkx-open-plan-editor]');
      if (planBtn) {
        event.preventDefault();
        if (planBtn.disabled) {
          setStatus('Ta en bild först — sedan kan du rita hårlinje/krona.', 'info');
          return;
        }
        void openPlanEditor(
          planBtn.getAttribute('data-kkx-plan-entry-id') || '',
          planBtn.getAttribute('data-kkx-plan-attachment-id') || '',
          planBtn.getAttribute('data-kkx-plan-photo-id') || ''
        );
        return;
      }
      const signBtn = event.target.closest('[data-kkx-sign-entry]');
      if (signBtn) {
        event.preventDefault();
        const entryId = signBtn.getAttribute('data-kkx-sign-entry');
        if (!entryId) return;
        void signJournalEntry(entryId).then(() => {
          refreshJournalEnrichmentReadout(runtime.selectedPatientId);
          const activeEntry =
            asArray(runtime.detail?.journalEntries).find(
              (row) => normalizeText(row.entryId) === normalizeText(entryId)
            ) || slot.__kkxActiveEntry;
          mountKkxJournalBig(slot, {
            entryId,
            journalType: activeEntry?.journalType || '',
            templateId: runtime.kkxActiveJournalTemplate,
          });
          if (isV9CustomersEnabled()) renderDetailPanel();
        });
      }
    });

    slot.addEventListener('change', (event) => {
      const input = event.target.closest('[data-kkx-photo-camera]');
      if (!input?.files?.[0]) return;
      if (runtime.kkxPhotoUploadInflight) return;
      const file = input.files[0];
      input.value = '';
      runtime.kkxPhotoUploadInflight = true;
      void uploadConsultationPhoto(file, { defaultLabel: 'Konsultationsbild · dagens besök' })
        .then(() => {
          const ws = slot.closest('[data-kkx-journal-mount]') || slot;
          void hydrateJournalPhotoElements(ws);
          mountKkxJournalBig(slot, {
            entryId: slot.__kkxActiveEntry?.entryId || '',
            journalType: slot.__kkxActiveEntry?.journalType || '',
            templateId: runtime.kkxActiveJournalTemplate,
          });
        })
        .finally(() => {
          runtime.kkxPhotoUploadInflight = false;
        });
    });
  }

  function mountKkxJournalBig(slot, options = {}) {
    if (!slot) return;
    const card = runtime.detail?.card;
    const entries = asArray(runtime.detail?.journalEntries);
    const entry = resolveKkxJournalEditTarget(entries, options.entryId, options.journalType);
    const templateId =
      options.templateId ||
      resolveKkxTemplateForEntry(entry) ||
      runtime.kkxActiveJournalTemplate ||
      'tp';
    runtime.kkxActiveJournalTemplate = templateId;
    setRuntimeEditingJournalEntry(entry);
    const formMarkup = entry
      ? renderKkxJournalFormMarkup(entries, entry)
      : '<p class="patient-master-muted">Välj mall ovan för att skapa journalpost.</p>';
    const typeLabel =
      JOURNAL_TYPE_LABELS[entry?.journalType] || entry?.title || entry?.journalType || 'Journal';
    const ctxLine = [
      card ? displayNameForList(card) : null,
      typeLabel,
      entry?.status || (entry ? 'journal påbörjad' : 'ingen redigerbar post'),
    ]
      .filter(Boolean)
      .join(' · ');
    const visibilityScope =
      normalizeText(entry?.visibility) === 'private_internal' ? 'private' : 'shared';
    slot.innerHTML = `
      <div class="kkx-journal-big v9-surface-vellum" data-kkx-journal-workspace>
        <div class="kkx-jctx">${escapeHtml(ctxLine)}</div>
        ${renderKkxJournalTemplatePicker(templateId)}
        ${renderKkxJournalPhotoShell(entries, entry)}
        <div class="kkx-jzon">Journalpost · mall</div>
        <div class="kkx-jslot kkx-jslot--live" data-kkx-form-mount>
          ${formMarkup}
        </div>
        <div class="kkx-jzon">Anteckning · synlighet</div>
        <div class="kkx-jtog" data-kkx-note-visibility>
          <button type="button" class="t${visibilityScope === 'private' ? ' act' : ''}" data-kkx-note-scope="private">🔒 Privat intern</button>
          <button type="button" class="t${visibilityScope === 'shared' ? ' act' : ''}" data-kkx-note-scope="shared">Delad</button>
        </div>
        ${
          entry?.canSign && !entry?.locked
            ? `<div class="kkx-jfoot">
                <div class="kkx-jbtn" data-kkx-save-hint>Sparas automatiskt</div>
                <button type="button" class="kkx-jbtn sign" data-kkx-sign-entry="${escapeHtml(entry.entryId)}">✓ Signera journal</button>
              </div>
              <div class="kkx-jeffekt">Vid signering uppdateras kundresa och smart nästa steg automatiskt.</div>`
            : entry?.locked
              ? '<div class="kkx-jeffekt">Journalposten är signerad och låst.</div>'
              : ''
        }
      </div>
    `;
    bindKkxJournalWorkspace(slot, entry);
    bindKkxNoteVisibilityToggle(slot.querySelector('[data-kkx-journal-workspace]') || slot, entry);
    ensurePhotoLabelDatalist(slot);
    void hydrateJournalPhotoElements(slot);
    window.requestAnimationFrame(() => bindJournalAutosaveForms());
  }

  function setRuntimeEditingJournalEntry(entry) {
    runtime.editingTpEntryId = '';
    runtime.editingPrpEntryId = '';
    runtime.editingFollowUpEntryId = '';
    runtime.editingBlephEntryId = '';
    runtime.editingClinicalFormKey = '';
    runtime.editingClinicalEntryId = '';
    if (!entry?.entryId) return;
    const formKeyResolver = window.ArcanaJournalClinicalFormKeys?.resolveEntryFormKey;
    switch (entry.journalType) {
      case 'tp_treatment':
        runtime.editingTpEntryId = entry.entryId;
        break;
      case 'prp_treatment':
        runtime.editingPrpEntryId = entry.entryId;
        break;
      case 'follow_up':
        runtime.editingFollowUpEntryId = entry.entryId;
        break;
      case 'bleph_treatment':
        runtime.editingBlephEntryId = entry.entryId;
        break;
      case 'health_declaration':
      case 'fitness_certificate':
        runtime.editingClinicalFormKey =
          formKeyResolver?.(entry) ||
          (entry.journalType === 'health_declaration' ? 'health' : 'fitness');
        runtime.editingClinicalEntryId = entry.entryId;
        break;
      default:
        break;
    }
  }

  function isV9DemoEnabled() {
    return (
      isV9CustomersEnabled() &&
      (document.documentElement.getAttribute('data-v9-demo') === 'on' ||
        window.__ARCANA_V9_DEMO_ENABLED__ === true)
    );
  }

  function teardownV9WatchDemoChrome() {
    document.querySelector('[data-v9-watch-restore]')?.remove();
    document.querySelector('[data-v9-watch-toast]')?.remove();
    document.querySelectorAll('.v9-watch-wrap').forEach((node) => node.remove());
  }

  function syncV10FacitIntelShell() {
    if (!usesV10KundkortFacit() || !isV9CustomersEnabled()) return;
    const rail = document.querySelector('.customers-rail');
    if (!rail) return;
    rail.classList.add('intel-shell');
    const dossierOpen = Boolean(
      runtime.selectedPatientId &&
      (runtime.detail?.card || runtime.detailLoading || rail.querySelector('[data-patient-detail]'))
    );
    rail.dataset.context = dossierOpen ? 'customer' : 'booking';
  }

  function ensureV10FacitAppGrid() {
    if (!usesV10KundkortFacit() || !isV9CustomersEnabled()) return;
    const layout = document.querySelector('.customers-layout');
    const surface = layout?.closest('.customers-surface');
    if (!layout || !surface) return;

    layout.dataset.v10FacitAppGrid = 'on';

    const workspace = layout.querySelector('[data-customers-workspace]');
    if (workspace) {
      workspace.hidden = true;
      workspace.setAttribute('aria-hidden', 'true');
      workspace.classList.add('customers-workspace--v10-facit-off');
    }

    const rail = layout.querySelector('.customers-rail');
    if (rail) rail.classList.add('intel-shell');

    if (!layout.querySelector('[data-v9-customers-center]')) {
      const list = layout.querySelector('.customers-list');
      if (!list) return;

      const center = document.createElement('div');
      center.className = 'customers-center-shell';
      center.dataset.v9CustomersCenter = '';
      layout.insertBefore(center, list);

      const regHeader = surface.querySelector('.customers-register-header');
      const v9Header =
        regHeader?.querySelector('.customers-v9-header') ||
        surface.querySelector('.customers-v9-header');
      if (v9Header) center.appendChild(v9Header);

      const agg = surface.querySelector('[data-v9-agg-insights]');
      if (agg) center.appendChild(agg);

      const filters = surface.querySelector('[data-v9-customers-filters]');
      if (filters) center.appendChild(filters);

      center.appendChild(list);

      if (regHeader && !regHeader.querySelector('.customers-v9-header')) {
        regHeader.hidden = true;
        regHeader.setAttribute('aria-hidden', 'true');
      }
    }

    els.v9Header = document.querySelector('[data-v9-customers-header]');
    els.v9Filters = document.querySelector('[data-v9-customers-filters]');
    els.v9AggInsights = document.querySelector('[data-v9-agg-insights]');
    els.list = document.querySelector('[data-customer-list]');
    syncV10FacitIntelShell();
  }

  function syncV9CustomersChrome() {
    if (usesV10KundkortFacit()) {
      document.documentElement.setAttribute('data-v10-kundkort-facit', 'on');
    } else {
      document.documentElement.removeAttribute('data-v10-kundkort-facit');
    }
    const show = isV9CustomersEnabled() && runtime.mode === 'register';
    if (show && usesV10KundkortFacit()) {
      ensureV10FacitAppGrid();
    }
    if (!els.v9Header && !els.v9Filters && !els.v9Sidebar && !els.v9AggInsights) {
      resolveElements();
    }
    if (!els.v9Header && !els.v9Filters && !els.v9Sidebar && !els.v9AggInsights) return;
    if (els.v9Header) {
      els.v9Header.hidden = !show;
      els.v9Header.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    if (els.v9Filters) {
      els.v9Filters.hidden = !show;
      els.v9Filters.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    if (els.v9AggInsights) {
      els.v9AggInsights.hidden = !show;
      els.v9AggInsights.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    if (els.v9Sidebar) {
      els.v9Sidebar.hidden = !show;
      els.v9Sidebar.setAttribute('aria-hidden', show ? 'false' : 'true');
      els.v9Sidebar.classList.toggle('side-shell--v10-facit', show && usesV10KundkortFacit());
    }
  }

  function navigateShellView(view) {
    const nextView = normalizeText(view);
    if (!nextView) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', nextView);
      window.history.pushState(window.history.state, '', url.toString());
    } catch {
      /* ignore */
    }
    const navBtn = document.querySelector(`[data-nav-view="${nextView}"]`);
    if (navBtn) {
      navBtn.click();
      return;
    }
    document.querySelectorAll('[data-shell-view]').forEach((section) => {
      section.hidden = section.dataset.shellView !== nextView;
    });
  }

  function setV9AggInsightBody(key, html) {
    if (!els.v9AggInsights) return;
    const node = els.v9AggInsights.querySelector(`[data-v9-agg-body="${key}"]`);
    if (!node) return;
    node.innerHTML = html;
  }

  function renderV9AggInsights(segmentStats) {
    if (!isV9CustomersEnabled() || !els.v9AggInsights) return;
    const agg = segmentStats?.aggInsights;
    if (!agg) {
      setV9AggInsightBody('idag', 'Data saknas.');
      setV9AggInsightBody('opp', 'Data saknas.');
      setV9AggInsightBody('trend', 'Data saknas.');
      setV9AggInsightBody('risk', 'Data saknas.');
      return;
    }

    const idag = agg.idag || {};
    if (idag.count > 0) {
      const names = asArray(idag.names)
        .slice(0, 3)
        .map((name) => sanitizePatientDisplayName(name, ''))
        .filter(Boolean)
        .map((name) => escapeHtml(name))
        .join(', ');
      setV9AggInsightBody(
        'idag',
        `<strong>${formatMetricNumber(idag.count)} kunder</strong> behöver kontakt${
          names ? `: ${names}` : ''
        }`
      );
    } else {
      setV9AggInsightBody('idag', escapeHtml(idag.reason || 'Inga kontaktärenden idag.'));
    }

    const opp = agg.opp || {};
    if (opp.count > 0) {
      setV9AggInsightBody(
        'opp',
        `<strong>${formatMetricNumber(opp.count)} VIP-kunder</strong> har inte bokat på 60+ dagar`
      );
    } else {
      setV9AggInsightBody('opp', escapeHtml(opp.reason || 'Inga inaktiva VIP just nu.'));
    }

    const trend = agg.trend || {};
    if (trend.disabled || trend.pctChange == null) {
      setV9AggInsightBody('trend', escapeHtml(trend.reason || 'Trend kräver bokningshistorik.'));
    } else {
      const sign = trend.pctChange > 0 ? '+' : '';
      const dir =
        trend.direction === 'down' ? 'ned' : trend.direction === 'up' ? 'upp' : 'oförändrat';
      setV9AggInsightBody(
        'trend',
        `Snittbesök ${dir} <strong>${sign}${formatMetricNumber(trend.pctChange)}%</strong> senaste 4 veckor`
      );
    }

    const risk = agg.risk || {};
    if (risk.disabled) {
      setV9AggInsightBody('risk', escapeHtml(risk.reason || 'Bokningsdata saknas.'));
    } else if (risk.count > 0) {
      const names = asArray(risk.names)
        .slice(0, 3)
        .map((name) => sanitizePatientDisplayName(name, ''))
        .filter(Boolean)
        .map((name) => escapeHtml(name))
        .join(', ');
      setV9AggInsightBody(
        'risk',
        `<strong>${formatMetricNumber(risk.count)} kunder</strong> har bokning inom 3 dagar men saknar friskförsäkran${
          names ? `: ${names}` : ''
        }`
      );
    } else {
      setV9AggInsightBody('risk', escapeHtml(risk.reason || 'Inga riskärenden inom 3 dagar.'));
    }
  }

  function applyV9AggInsightAction(key) {
    const agg = runtime.segmentStats?.aggInsights?.[key];
    if (!agg) return;
    if (key === 'risk') {
      window.CcoV9CustomersParity?.runBulkReminder?.(window.CcoPatientMasterUi);
      return;
    }
    if (key === 'opp') {
      window.CcoV9CustomersParity?.runBulkCampaign?.(window.CcoPatientMasterUi);
      return;
    }
    if (key === 'trend' && agg.ctaView) {
      navigateShellView(agg.ctaView);
      return;
    }
    if (key === 'idag' && agg.ctaSegment) {
      applySegmentFromUi(agg.ctaSegment);
      return;
    }
    if (agg.ctaSegment) {
      applySegmentFromUi(agg.ctaSegment);
      return;
    }
    if (agg.ctaView) {
      navigateShellView(agg.ctaView);
    }
  }

  function resolveV9AggregateStats(stats, segmentStats) {
    const panel = segmentStats?.panel || {};
    const counts = segmentStats?.counts || runtime.segmentTotals || {};
    const total = Number(stats?.totalPatients ?? panel.totalPatients ?? counts.all ?? 0);
    const active = Number(counts.active ?? runtime.segmentTotals?.active ?? 0);
    const vip = Number(counts.vip ?? runtime.segmentTotals?.vip ?? 0);
    const newN = Number(counts.new ?? runtime.segmentTotals?.new ?? 0);
    return {
      total,
      active,
      vip,
      newN,
      trend: segmentStats?.aggInsights?.trend,
      panel,
    };
  }

  function v9AggKeyToKind(key) {
    const map = {
      idag: 'action',
      opp: 'opp',
      trend: 'trend',
      risk: 'risk',
    };
    return map[normalizeText(key)] || '';
  }

  function buildV9AggregateInsightRows(segmentStats) {
    const agg = segmentStats?.aggInsights;
    const rows = [];
    const push = (key, html) => {
      if (html) rows.push({ key, html });
    };
    if (agg?.idag?.count > 0) {
      const names = asArray(agg.idag.names)
        .slice(0, 3)
        .map((name) => sanitizePatientDisplayName(name, ''))
        .filter(Boolean)
        .map((name) => escapeHtml(name))
        .join(', ');
      push(
        'idag',
        `<strong>${formatMetricNumber(agg.idag.count)} kunder</strong> · Dagens besök saknar HD${
          names ? ` — ${names}` : ''
        }`
      );
    }
    if (agg?.opp?.count > 0) {
      push(
        'opp',
        `<strong>${formatMetricNumber(agg.opp.count)} kunder</strong> · Inaktiva VIP — inte bokat på 60+ dagar`
      );
    }
    if (agg?.risk?.count > 0) {
      const names = asArray(agg.risk.names)
        .slice(0, 3)
        .map((name) => sanitizePatientDisplayName(name, ''))
        .filter(Boolean)
        .map((name) => escapeHtml(name))
        .join(', ');
      push(
        'risk',
        `<strong>${formatMetricNumber(agg.risk.count)} kunder</strong> · Friskförsäkran saknas${
          names ? ` — ${names}` : ''
        }`
      );
    }
    if (agg?.trend?.pctChange != null && !agg.trend.disabled) {
      const sign = agg.trend.pctChange > 0 ? '+' : '';
      const dir =
        agg.trend.direction === 'down'
          ? 'ned'
          : agg.trend.direction === 'up'
            ? 'upp'
            : 'oförändrat';
      push(
        'trend',
        `<strong>Besökstrend</strong> · Snitt ${dir} ${sign}${formatMetricNumber(agg.trend.pctChange)}% senaste 4 veckor`
      );
    }
    while (rows.length < 3) {
      rows.push({
        key: '',
        html: 'Data saknas — inga fler aktiva signaler i batch',
        empty: true,
      });
    }
    return rows.slice(0, usesV10KundkortFacit() ? 6 : 5);
  }

  function renderV9PopulationChartHtml(segmentStats, stats) {
    const v10Facit = usesV10KundkortFacit();
    const chartTitle = v10Facit ? 'Intäkt / vecka' : 'Kundpopulation (master)';
    const panel = segmentStats?.panel || {};
    const total = Number(stats?.totalPatients ?? panel.totalPatients ?? 0);
    const totalRevenue = Number(stats?.totalRevenue ?? stats?.revenueTotal ?? 0);
    const trend = segmentStats?.aggInsights?.trend;
    let barsHtml = '';
    let xLabels = '';
    let chartValue =
      v10Facit && totalRevenue > 0
        ? formatV9Sek(totalRevenue)
        : total
          ? `${formatMetricNumber(total)} totalt`
          : '—';

    if (
      trend &&
      !trend.disabled &&
      Array.isArray(trend.buckets) &&
      trend.buckets.some((v) => v > 0)
    ) {
      const buckets = trend.buckets;
      const max = Math.max(...buckets, 1);
      barsHtml = buckets
        .map((value, index) => {
          const height = Math.max(8, Math.round((value / max) * 100));
          const current = index === buckets.length - 1 ? ' current' : '';
          return `<div class="agg-chart-bar${current}" style="height:${height}%" title="${formatMetricNumber(value)} besök"></div>`;
        })
        .join('');
      xLabels = '<span>v-4</span><span>v-2</span><span>v-1</span>';
      chartValue = `${formatMetricNumber(buckets[buckets.length - 1])} senaste v`;
    } else if (total > 0) {
      const counts = segmentStats?.counts || runtime.segmentTotals || {};
      const slices = [
        { label: 'Aktiva', value: Number(counts.active) || 0 },
        { label: 'VIP', value: Number(counts.vip) || 0 },
        { label: 'Nya', value: Number(counts.new) || 0 },
        { label: 'Inaktiv', value: Number(counts.dormant) || 0 },
        { label: 'Granska', value: Number(counts.risk ?? counts.needs_review) || 0 },
      ]
        .filter((slice) => slice.value > 0)
        .slice(0, 12);
      if (slices.length) {
        const max = Math.max(...slices.map((slice) => slice.value), 1);
        barsHtml = slices
          .map((slice, index) => {
            const height = Math.max(8, Math.round((slice.value / max) * 100));
            const current = index === slices.length - 1 ? ' current' : '';
            return `<div class="agg-chart-bar${current}" style="height:${height}%" title="${escapeHtml(slice.label)}: ${formatMetricNumber(slice.value)}"></div>`;
          })
          .join('');
        xLabels = `<span>${escapeHtml(slices[0].label)}</span><span>…</span><span>${escapeHtml(slices[slices.length - 1].label)}</span>`;
      }
    }

    if (!barsHtml) {
      return `
        <div class="agg-chart agg-chart--empty">
          <div class="agg-chart-head">
            <span class="agg-chart-title">${escapeHtml(chartTitle)}</span>
            <span class="agg-chart-value">—</span>
          </div>
          <p class="patient-master-muted agg-chart-empty">Data saknas</p>
        </div>`;
    }

    return `
        <div class="agg-chart" data-v9-population-chart>
          <div class="agg-chart-head">
            <span class="agg-chart-title">${escapeHtml(chartTitle)}</span>
            <span class="agg-chart-value">${escapeHtml(chartValue)}</span>
          </div>
          <div class="agg-chart-bars">${barsHtml}</div>
          <div class="agg-chart-x">${xLabels}</div>
        </div>`;
  }

  function renderV9AggregateActionsHtml(segmentStats) {
    if (!usesV10KundkortFacit()) return '';
    const reminderCount = Number(segmentStats?.aggInsights?.risk?.count ?? 0);
    const reminderDisabled = reminderCount <= 0;
    return `
          <div class="agg-actions" data-v9-agg-actions>
            <button type="button" class="quick-pill quick-pill--ai"${reminderDisabled ? ' disabled aria-disabled="true"' : ''} data-v9-agg-action="mass-reminder">Skicka mass-påminnelse${reminderCount > 0 ? ` (${formatMetricNumber(reminderCount)})` : ''}</button>
            <button type="button" class="quick-pill" data-v9-agg-action="export">↓ Exportera urval</button>
          </div>`;
  }

  function formatV9WatchClock(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '—';
    }
  }

  function resolveV9UpcomingTreatment(segmentStats) {
    const upcoming = segmentStats?.upcomingTreatment;
    if (upcoming && typeof upcoming === 'object') return upcoming;
    return { empty: true, reason: 'Inga kommande' };
  }

  const V9_WATCH_HIDDEN_KEY = 'cco-watch-hidden';

  function ensureV9WatchRestoreButton() {
    let restore = document.querySelector('[data-v9-watch-restore]');
    if (restore) return restore;
    restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'v9-watch-restore';
    restore.dataset.v9WatchRestore = '1';
    restore.innerHTML = '⌚ Visa Apple Watch';
    document.body.appendChild(restore);
    return restore;
  }

  function showV9WatchToast(message) {
    if (!isV9DemoEnabled()) return;
    let toast = document.querySelector('[data-v9-watch-toast]');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'v9-watch-toast';
      toast.dataset.v9WatchToast = '1';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('is-visible');
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 320);
    }, 2400);
  }

  function setV9WatchHidden(hidden) {
    const widget = document.querySelector('[data-v9-watch-widget]');
    const restore = ensureV9WatchRestoreButton();
    if (widget) widget.classList.toggle('is-hidden', hidden);
    restore.classList.toggle('is-visible', hidden);
    try {
      localStorage.setItem(V9_WATCH_HIDDEN_KEY, hidden ? '1' : '0');
    } catch (_) {
      /* private mode */
    }
  }

  function syncV9WatchHiddenState() {
    if (!isV9DemoEnabled()) {
      teardownV9WatchDemoChrome();
      return;
    }
    let hidden = false;
    try {
      hidden = localStorage.getItem(V9_WATCH_HIDDEN_KEY) === '1';
    } catch (_) {
      hidden = false;
    }
    ensureV9WatchRestoreButton();
    setV9WatchHidden(hidden);
  }

  function initV9WatchChrome() {
    if (!isV9CustomersEnabled() || !isV9DemoEnabled()) {
      teardownV9WatchDemoChrome();
      return;
    }
    ensureV9WatchRestoreButton();
    syncV9WatchHiddenState();
  }

  function renderV9WatchDismissButton() {
    return `<button type="button" class="watch-dismiss" data-v9-watch-dismiss title="Dölj">×</button>`;
  }

  function renderV9WatchWidgetHtml(segmentStats) {
    if (!isV9DemoEnabled()) return '';
    const upcoming = resolveV9UpcomingTreatment(segmentStats);

    if (upcoming.empty) {
      return `
        <div class="v9-watch-wrap">
          <div class="v9-watch-widget watch-widget watch-widget--empty" data-v9-watch-widget>
            ${renderV9WatchDismissButton()}
            <div class="watch-band-top"></div>
            <div class="watch-body" data-alert="none">
              <div class="watch-screen">
                <div class="watch-time"><span>NÄSTA</span><span class="clock">—</span></div>
                <div class="watch-kicker">Inga kommande</div>
                <div class="watch-title">${escapeHtml(upcoming.reason || 'Inga bokningar')}</div>
                <div class="watch-sub">Bokningsmotor eller kalender</div>
              </div>
            </div>
            <div class="watch-band-bottom"></div>
            <div class="watch-caption">På din handled</div>
          </div>
        </div>`;
    }

    const clock = formatV9WatchClock(upcoming.startsAt);
    const sub = [upcoming.patientName, upcoming.practitionerLabel].filter(Boolean).join(' · ');
    const alert = upcoming.alert === 'high' ? 'high' : 'normal';
    const kicker = upcoming.remindNow
      ? '⚠ Påminn nu'
      : normalizeText(upcoming.kicker) || 'Nästa besök';
    const bookingRef = upcoming.engineBookingId || upcoming.bookingCaseId || '';

    return `
        <div class="v9-watch-wrap">
          <div class="v9-watch-widget watch-widget" data-v9-watch-widget data-v9-watch-patient="${escapeHtml(upcoming.patientId || '')}" data-v9-watch-booking="${escapeHtml(bookingRef)}" data-v9-watch-starts-at="${escapeHtml(upcoming.startsAt || '')}" data-v9-watch-treatment="${escapeHtml(upcoming.treatmentLabel || '')}">
            ${renderV9WatchDismissButton()}
            <div class="watch-band-top"></div>
            <div class="watch-body" data-alert="${alert}">
              <div class="watch-screen">
                <div class="watch-time"><span>NÄSTA</span><span class="clock">${escapeHtml(clock)}</span></div>
                <div class="watch-kicker">${escapeHtml(kicker)}</div>
                <div class="watch-title">${escapeHtml(upcoming.treatmentLabel || 'Behandling')}</div>
                <div class="watch-sub">${escapeHtml(sub || '—')}</div>
                <button type="button" class="watch-ai-pill" data-v9-watch-sms title="Skicka SMS-påminnelse">Skicka SMS</button>
                <div class="watch-swipe" data-v9-watch-swipe role="button" tabindex="0" aria-label="Svep för ankomst">
                  <div class="watch-swipe-fill"></div>
                  <span class="watch-swipe-label">Svep för ankomst</span>
                  <span class="watch-swipe-arrow">→</span>
                </div>
              </div>
            </div>
            <div class="watch-band-bottom"></div>
            <div class="watch-caption">På din handled</div>
          </div>
        </div>`;
  }

  function renderV9AggregatePanelHtml() {
    const stats = runtime.stats || {};
    const segmentStats = runtime.segmentStats;
    const { total, active, vip, newN, trend } = resolveV9AggregateStats(stats, segmentStats);
    const totalTrend =
      newN > 0
        ? `+${formatMetricNumber(newN)} nya i register`
        : trend?.pctChange != null && !trend?.disabled
          ? `${trend.pctChange > 0 ? '+' : ''}${formatMetricNumber(trend.pctChange)}% besök 4 v`
          : '—';
    const activeTrend = active > 0 ? 'Aktiva i register' : '—';
    const vipTrend = vip > 0 ? 'VIP-segment' : '—';
    const ltv = resolveV9AggregateLtv(stats, segmentStats);
    const insightRows = buildV9AggregateInsightRows(segmentStats);
    const aiKicker = usesV10KundkortFacit() ? 'Veckans insikter' : 'Veckans läge';

    return `
      <section class="patient-master-card v9-aggregate-panel" data-v9-aggregate-panel>
        <div class="agg-shell">
          <div>
            <div class="agg-kicker">Översikt</div>
            <h3 class="agg-title">Kundpopulation</h3>
          </div>
          <div class="agg-stat-grid">
            <div class="agg-stat">
              <div class="agg-stat-label">Totalt</div>
              <div class="agg-stat-value">${escapeHtml(formatMetricNumber(total))}</div>
              <div class="agg-stat-trend">${escapeHtml(totalTrend)}</div>
            </div>
            <div class="agg-stat">
              <div class="agg-stat-label">Aktiva</div>
              <div class="agg-stat-value">${escapeHtml(formatMetricNumber(active))}</div>
              <div class="agg-stat-trend">${escapeHtml(activeTrend)}</div>
            </div>
            <div class="agg-stat">
              <div class="agg-stat-label">VIP</div>
              <div class="agg-stat-value">${escapeHtml(formatMetricNumber(vip))}</div>
              <div class="agg-stat-trend">${escapeHtml(vipTrend)}</div>
            </div>
            <div class="agg-stat">
              <div class="agg-stat-label">Snitt LTV</div>
              <div class="agg-stat-value">${escapeHtml(ltv.value)}</div>
              <div class="agg-stat-trend">${escapeHtml(ltv.trend)}</div>
            </div>
          </div>
          ${renderV9PopulationChartHtml(segmentStats, stats)}
          <div>
            <div class="agg-kicker">${escapeHtml(aiKicker)}</div>
          </div>
          <div class="agg-ai-list">
            ${insightRows
              .map(
                (row) =>
                  `<button type="button" class="agg-ai-row${row.empty ? ' agg-ai-row--empty' : ''}"${
                    row.key
                      ? ` data-v9-agg="${escapeHtml(row.key)}" data-kind="${escapeHtml(v9AggKeyToKind(row.key))}"`
                      : ''
                  }>${row.html}</button>`
              )
              .join('')}
          </div>
          ${renderV9AggregateActionsHtml(segmentStats)}
          ${renderV9WatchWidgetHtml(segmentStats)}
        </div>
      </section>`;
  }

  function renderV9AggregatePanel() {
    resolveElements();
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail) return;
    els.patientRail = rail;
    if (syncAuthRequiredChrome()) {
      rail.innerHTML = '';
      syncMobilePatientLayout();
      return;
    }
    rail.innerHTML = renderV9AggregatePanelHtml();
    initV9WatchChrome();
    syncV9CustomersLayoutState();
    syncMobilePatientLayout();
  }

  function refreshV9AggregatePanelIfIdle() {
    if (!isV9CustomersEnabled() || runtime.mode !== 'register') return;
    if (runtime.selectedPatientId) return;
    renderV9AggregatePanel();
  }

  function mergeSegmentsFromApi(apiSegments) {
    const list = Array.isArray(apiSegments) ? apiSegments : [];
    return list.map((seg) => {
      const fq = seg.filterQuery || {};
      const ui = V9_SEGMENT_UI_BY_ID[seg.id] || {};
      const disabled = seg.status === 'disabled' || seg.status === 'missing';
      const segmentParam = normalizeText(fq.segment);
      const flagsParam = normalizeText(fq.flags);
      return {
        id: seg.id,
        label: seg.label || seg.id,
        flags: flagsParam,
        segment: segmentParam,
        disabled,
        disabledReason: seg.reason || (disabled ? 'Data saknas' : ''),
        count: seg.count,
        status: seg.status,
        side: Boolean(ui.side),
        treatment: Boolean(ui.treatment || normalizeText(seg.id).startsWith('treatment_')),
        group: ui.group || (ui.treatment ? 'treatment' : ui.side ? 'status' : ''),
        chip: ui.chip || '',
      };
    });
  }

  function buildV9SidebarSegmentGroups(segments) {
    const byId = Object.fromEntries((segments || []).map((seg) => [seg.id, seg]));
    const groups = { core: [], treatment: [], lanes: [], status: [] };
    for (const ui of V9_SEGMENT_UI) {
      if (!ui.side) continue;
      const seg = byId[ui.id];
      if (!seg) continue;
      if (usesV10KundkortFacit() && !V10_FACIT_SIDEBAR_IDS.has(ui.id)) continue;
      const bucket =
        ui.group === 'core'
          ? 'core'
          : ui.group === 'lanes'
            ? 'lanes'
            : ui.treatment || ui.group === 'treatment' || ui.id.startsWith('treatment_')
              ? 'treatment'
              : 'status';
      groups[bucket].push(seg);
    }
    return groups;
  }

  function formatV9SegmentCountValue(seg) {
    if (!seg || seg.disabled) return '—';
    const key = normalizeText(seg.id) || 'all';
    if (key === 'all') {
      const total = runtime.segmentTotals.all;
      return formatV9ZeroCount(total, { allowZero: true });
    }
    if (Object.prototype.hasOwnProperty.call(runtime.segmentTotals, key)) {
      const value = runtime.segmentTotals[key];
      return formatV9ZeroCount(value);
    }
    if (seg.count === null || seg.count === undefined) return '—';
    return formatV9ZeroCount(seg.count);
  }

  function renderV9SegmentSidebarLinkHtml(seg, active) {
    const disabled = Boolean(seg.disabled);
    const partial = seg.status === 'partial' && !disabled;
    const countText = formatV9SegmentCountValue(seg);
    const dotClass = V9_SEGMENT_DOT_CLASS[seg.id] || '';
    const labelHtml = dotClass
      ? `<span class="side-link-label"><span class="dot ${dotClass}"></span>${escapeHtml(seg.label)}</span>`
      : escapeHtml(seg.label);
    const title = disabled
      ? seg.disabledReason || 'Data saknas'
      : partial
        ? seg.disabledReason || ''
        : '';
    return `<button type="button" class="side-link${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}${partial ? ' is-partial' : ''}" data-v9-segment="${escapeHtml(seg.id)}" aria-pressed="${active ? 'true' : 'false'}"${disabled ? ' disabled' : ''}${title ? ` title="${escapeHtml(title)}"` : ''}>${labelHtml}<span class="count${countText === '—' ? ' is-unavailable' : ''}" data-v9-segment-count="${escapeHtml(seg.id)}">${escapeHtml(countText)}</span></button>`;
  }

  function renderV9SegmentSidebarListHtml(segments, activeId) {
    return (segments || [])
      .map((seg) =>
        renderV9SegmentSidebarLinkHtml(seg, (normalizeText(activeId) || 'all') === seg.id)
      )
      .join('');
  }

  function renderV9SegmentSidebarStructure(groups, activeId) {
    const coreHtml = renderV9SegmentSidebarListHtml(groups.core, activeId);
    const treatmentHtml = renderV9SegmentSidebarListHtml(groups.treatment, activeId);
    const lanesHtml = renderV9SegmentSidebarListHtml(groups.lanes, activeId);
    const statusHtml = renderV9SegmentSidebarListHtml(groups.status, activeId);
    return `
      <div class="side-kicker">Segment</div>
      <h2 class="side-h2">Kundgrupper</h2>
      <div class="side-list" data-v9-segment-group="core">${coreHtml || '<p class="v9-segment-empty">Inga kundgrupper</p>'}</div>
      ${
        treatmentHtml
          ? `<div class="side-section"><div class="side-kicker">Behandling</div><div class="side-list" data-v9-segment-group="treatment">${treatmentHtml}</div></div>`
          : ''
      }
      ${
        lanesHtml
          ? `<div class="side-section"><div class="side-kicker">Lanes</div><div class="side-list" data-v9-segment-group="lanes">${lanesHtml}</div></div>`
          : ''
      }
      ${
        statusHtml
          ? `<div class="side-section"><div class="side-kicker">Status</div><div class="side-list" data-v9-segment-group="status">${statusHtml}</div></div>`
          : ''
      }`;
  }

  function getSegmentById(segmentId) {
    const id = normalizeText(segmentId) || 'all';
    const found = runtime.segments.find((seg) => seg.id === id);
    if (found) return found;
    if (id === 'all') {
      return {
        id: 'all',
        label: 'Alla kunder',
        flags: '',
        segment: '',
        disabled: false,
      };
    }
    return {
      id,
      label: id,
      flags: '',
      segment: id,
      disabled: false,
    };
  }

  function resolveAssignedOwnerForShell() {
    if (window.CcoKunderStaffOwner?.resolveAssignedOwner) {
      return (
        window.CcoKunderStaffOwner.resolveAssignedOwner({
          shellPayload: runtime.staffOwnership ? { staffOwnership: runtime.staffOwnership } : null,
        })?.value || ''
      );
    }
    return normalizeText(runtime.staffOwnership?.assignedOwner);
  }

  function syncV9SegmentSidebarActive() {
    if (!els.v9Sidebar || !isV9CustomersEnabled()) return;
    const activeId = normalizeText(runtime.activeSegmentId) || 'all';
    els.v9Sidebar.querySelectorAll('[data-v9-segment]').forEach((link) => {
      const id = normalizeText(link.dataset.v9Segment) || 'all';
      const isActive = id === activeId;
      link.classList.toggle('is-active', isActive);
      link.classList.toggle('active', isActive);
      link.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function renderV9SegmentSidebar(segmentStats, stats) {
    if (!isV9CustomersEnabled() || !els.v9Sidebar) return;
    if (Array.isArray(segmentStats?.segments)) {
      runtime.segments = mergeSegmentsFromApi(segmentStats.segments);
    } else if (!runtime.segments.length) {
      runtime.segments = mergeSegmentsFromApi([]);
    }
    if (!runtime.segments.length) {
      els.v9Sidebar.innerHTML = '<p class="v9-segment-sidebar-loading">Laddar segment…</p>';
      return;
    }
    const counts = segmentStats?.counts || {};
    runtime.segmentTotals = {
      ...counts,
      all: Number(stats?.totalPatients ?? segmentStats?.panel?.totalPatients ?? counts.all ?? 0),
      risk: counts.risk ?? counts.needs_review ?? 0,
    };

    const groups = buildV9SidebarSegmentGroups(runtime.segments);
    const activeId = normalizeText(runtime.activeSegmentId) || 'all';
    const renderKey = runtime.segments
      .filter((seg) => seg.side)
      .map((seg) => `${seg.id}:${seg.status}:${seg.disabled ? 1 : 0}`)
      .join('|');

    if (els.v9Sidebar.dataset.renderKey !== renderKey) {
      els.v9Sidebar.dataset.renderKey = renderKey;
      els.v9Sidebar.innerHTML = renderV9SegmentSidebarStructure(groups, activeId);
    } else {
      els.v9Sidebar.querySelectorAll('[data-v9-segment-count]').forEach((node) => {
        const seg = getSegmentById(node.dataset.v9SegmentCount);
        const countText = formatV9SegmentCountValue(seg);
        node.textContent = countText;
        node.classList.toggle('is-unavailable', countText === '—');
      });
      els.v9Sidebar.querySelectorAll('[data-v9-segment]').forEach((link) => {
        const seg = getSegmentById(link.dataset.v9Segment);
        const disabled = Boolean(seg.disabled);
        link.disabled = disabled;
        link.classList.toggle('is-disabled', disabled);
        link.classList.toggle('is-partial', seg.status === 'partial' && !disabled);
      });
    }
    syncV9SegmentSidebarActive();
  }

  function syncCustomersFilterUrl() {
    if (!isV9CustomersEnabled() || runtime.mode !== 'register') return;
    try {
      const url = new URL(window.location.href);
      const segmentId = normalizeText(runtime.activeSegmentId) || 'all';
      if (segmentId && segmentId !== 'all') {
        url.searchParams.set('segment', segmentId);
      } else {
        url.searchParams.delete('segment');
      }
      const flag = normalizeFlagFilter(runtime.flagFilter);
      if (flag) {
        url.searchParams.set('flags', flag);
      } else {
        url.searchParams.delete('flags');
      }
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      /* ignore */
    }
  }

  function applySegmentFromUi(segmentId) {
    if (runtime.mode !== 'register') return;
    const seg = getSegmentById(segmentId);
    if (!seg || seg.disabled) return;
    const nextId = normalizeText(seg.id) || 'all';
    if (nextId === runtime.activeSegmentId && !runtime.flagFilter) return;
    runtime.activeSegmentId = nextId;
    runtime.segmentFilter = normalizeText(seg.segment);
    runtime.flagFilter = normalizeText(seg.flags);
    if (!runtime.segmentFilter && !runtime.flagFilter && nextId !== 'all') {
      runtime.segmentFilter = nextId;
    }
    syncLegacyFilterSelect(runtime.flagFilter);
    syncV9FilterChipsActive();
    syncV9SegmentSidebarActive();
    runtime.selectedPatientId = '';
    runtime.detail = null;
    renderDetailEmpty();
    syncCustomersFilterUrl();
    void loadPatientList();
  }

  function applyStartupSegmentFilter(segment) {
    const segmentId = normalizeText(segment);
    if (!segmentId || segmentId === 'all') return;
    const seg = getSegmentById(segmentId);
    if (seg.disabled) return;
    runtime.activeSegmentId = segmentId;
    runtime.segmentFilter = normalizeText(seg.segment);
    runtime.flagFilter = normalizeText(seg.flags);
    if (!runtime.segmentFilter && !runtime.flagFilter) {
      runtime.segmentFilter = segmentId;
    }
    syncV9SegmentSidebarActive();
  }

  function normalizeFlagFilter(value) {
    const flag = normalizeText(value);
    return V9_FLAG_FILTER_VALUES.has(flag) ? flag : '';
  }

  function syncLegacyFilterSelect(flagFilter) {
    if (!els.filter) return;
    const flag = normalizeFlagFilter(flagFilter);
    els.filter.value = V9_FLAG_FILTER_LABELS[flag] || V9_FLAG_FILTER_LABELS[''];
  }

  function syncV9FilterChipsActive() {
    if (!els.v9Filters || !isV9CustomersEnabled()) return;
    const activeSeg = normalizeText(runtime.activeSegmentId) || 'all';
    const segmentActive = activeSeg && activeSeg !== 'all';
    const activeFlag = segmentActive ? null : normalizeFlagFilter(runtime.flagFilter);
    // ORD-21: sync segment-chips
    els.v9Filters.querySelectorAll('[data-v9-segment-chip]').forEach((chip) => {
      const seg = normalizeText(chip.getAttribute('data-v9-segment-chip') ?? '') || 'all';
      const isActive = seg === activeSeg && (seg !== 'all' || !activeFlag);
      chip.classList.toggle('is-active', isActive);
      chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    // Bakåt-kompat: sync flag-only chips (utan segment-chip attribut)
    els.v9Filters
      .querySelectorAll('[data-v9-flag-filter]:not([data-v9-segment-chip])')
      .forEach((chip) => {
        const flag = normalizeFlagFilter(chip.getAttribute('data-v9-flag-filter') ?? '');
        const isActive = activeFlag !== null && flag === activeFlag;
        chip.classList.toggle('is-active', isActive);
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
  }

  function resolveV9FilterChipCounts(stats, segmentStats) {
    const segmentCounts = segmentStats?.counts || {};
    const panel = segmentStats?.panel || {};
    const pick = (segmentKey, statsKey) => {
      if (Object.prototype.hasOwnProperty.call(segmentCounts, segmentKey)) {
        const value = segmentCounts[segmentKey];
        if (value !== null && value !== undefined) return value;
      }
      if (stats && Object.prototype.hasOwnProperty.call(stats, statsKey)) {
        return stats[statsKey];
      }
      return 0;
    };
    return {
      all: Number(panel.totalPatients ?? stats?.totalPatients ?? 0),
      // ORD-21 mockup-paritet: segment-baserade chip-counts
      active: pick('active', null),
      vip: pick('vip', null),
      risk: pick('risk', null),
      new: pick('new', null),
      dormant: pick('dormant', null),
      missing_form: pick('missing_health_declaration', null) || Number(panel.missingForm ?? 0),
      // Bakåt-kompat
      has_drive_files: pick('has_drive', null),
      needs_review: pick('needs_review', 'needsReview'),
      cliento_only: pick('cliento_only', 'clientoOnly'),
      drive_only: pick('drive_only', 'driveOnly'),
    };
  }

  function renderV9FilterChips(stats, segmentStats) {
    if (!isV9CustomersEnabled() || !els.v9Filters) return;
    if (!stats && !segmentStats) return;
    const countMap = resolveV9FilterChipCounts(stats, segmentStats);
    els.v9Filters.querySelectorAll('[data-v9-filter-count]').forEach((node) => {
      const key = normalizeText(node.dataset.v9FilterCount);
      if (!Object.prototype.hasOwnProperty.call(countMap, key)) return;
      const value = countMap[key];
      node.textContent = formatV9ZeroCount(value, { allowZero: key === 'all' });
    });
    syncV9FilterChipsActive();
  }

  function applyFlagFilterFromUi(nextFlag) {
    if (runtime.mode !== 'register') return;
    const flagFilter = normalizeFlagFilter(nextFlag);
    if (
      flagFilter === runtime.flagFilter &&
      runtime.activeSegmentId === 'all' &&
      flagFilter !== 'needs_review'
    ) {
      return;
    }
    runtime.activeSegmentId = 'all';
    runtime.segmentFilter = '';
    runtime.flagFilter = flagFilter;
    syncLegacyFilterSelect(flagFilter);
    syncV9FilterChipsActive();
    syncV9SegmentSidebarActive();
    if (runtime.flagFilter === 'needs_review') {
      setMode('identity');
      return;
    }
    runtime.selectedPatientId = '';
    runtime.detail = null;
    renderDetailEmpty();
    syncCustomersFilterUrl();
    void loadPatientList();
  }

  function applyStartupFlagFilter(flags) {
    const flagFilter = normalizeFlagFilter(flags);
    if (!flagFilter) return;
    runtime.activeSegmentId = 'all';
    runtime.segmentFilter = '';
    runtime.flagFilter = flagFilter;
    syncLegacyFilterSelect(flagFilter);
    syncV9FilterChipsActive();
    syncV9SegmentSidebarActive();
  }

  function formatMetricNumber(value) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n.toLocaleString('sv-SE') : '0';
  }

  function formatV10CompactSek(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1000) {
      const compact = n / 1000;
      return `${compact.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}k`;
    }
    return formatMetricNumber(Math.round(n));
  }

  function resolveV9AggregateLtv(stats, segmentStats) {
    const totalRevenue = Number(stats?.totalRevenue ?? stats?.revenueTotal ?? 0);
    const totalCustomers = Number(stats?.totalPatients ?? segmentStats?.panel?.totalPatients ?? 0);
    if (totalRevenue > 0 && totalCustomers > 0) {
      const avg = Math.round(totalRevenue / totalCustomers);
      const trend = segmentStats?.aggInsights?.trend;
      let trendLabel = 'Snitt i register';
      if (trend?.pctChange != null && !trend?.disabled) {
        const sign = trend.pctChange > 0 ? '+' : '';
        trendLabel = `${sign}${formatMetricNumber(trend.pctChange)}% besök 4 v`;
      }
      return { value: formatV10CompactSek(avg), trend: trendLabel, hasData: true };
    }
    return { value: '—', trend: 'Intäkt ej kopplad', hasData: false };
  }

  function renderV9MetricHeader(stats, segmentStats) {
    if (!isV9CustomersEnabled() || !els.v9Header || !stats) return;
    const countNode = els.v9Header.querySelector('[data-v9-customer-count]');
    if (countNode) {
      countNode.textContent = `${formatMetricNumber(stats.totalPatients)} kunder`;
    }
    const segCounts = segmentStats?.counts || {};
    // ORD-21 mockup-paritet: pills mappar nu till segment-counts (aktiva/VIP/risk/nya/dormant)
    // Behåller bakåt-kompat för matched/journal/review/drive om ngn pill fortf finns.
    const mapping = {
      active: segCounts.active,
      vip: segCounts.vip,
      risk: segCounts.risk,
      new: segCounts.new,
      dormant: segCounts.dormant,
      matched: stats.matched,
      journal: stats.withPersonnummer,
      review: stats.needsReview,
      drive: stats.driveOnly,
    };
    const labels = {
      active: (n) => `${formatMetricNumber(n)} aktiva`,
      vip: (n) => `${formatMetricNumber(n)} VIP`,
      risk: (n) => `${formatMetricNumber(n)} risk`,
      new: (n) => `${formatMetricNumber(n)} nya / 30 dagar`,
      dormant: (n) => `${formatMetricNumber(n)} inaktiva`,
      matched: (n) => `${formatMetricNumber(n)} kopplade`,
      journal: (n) => `${formatMetricNumber(n)} med personnummer`,
      review: (n) => `${formatMetricNumber(n)} behöver granskning`,
      drive: (n) => `${formatMetricNumber(n)} endast Drive`,
    };
    els.v9Header.querySelectorAll('[data-v9-metric]').forEach((pill) => {
      const key = pill.dataset.v9Metric;
      const textNode = pill.querySelector('[data-v9-metric-text]');
      if (!textNode || !Object.prototype.hasOwnProperty.call(mapping, key)) return;
      const value = mapping[key];
      textNode.textContent = labels[key](value ?? 0);
    });
    // Snitt LTV (read-only, "—" om data saknas)
    const ltvNode = els.v9Header.querySelector('[data-v9-snitt-ltv-value]');
    if (ltvNode) {
      const totalRevenue = Number(stats.totalRevenue ?? stats.revenueTotal ?? 0);
      const totalCustomers = Number(stats.totalPatients ?? 0);
      if (totalRevenue > 0 && totalCustomers > 0) {
        const avg = Math.round(totalRevenue / totalCustomers);
        ltvNode.textContent = `${formatMetricNumber(avg)} kr`;
      } else {
        ltvNode.textContent = '—';
      }
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
        const value = mapping[key] ?? 0;
        node.textContent = Number(value) === 0 ? '—' : String(value);
      }
    });
    renderV9MetricHeader(stats, runtime.segmentStats);
    renderV9FilterChips(stats, runtime.segmentStats);
    renderV9SegmentSidebar(runtime.segmentStats, stats);
    renderV9AggInsights(runtime.segmentStats);
    refreshV9AggregatePanelIfIdle();
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
    if (card.patientOrigin && ORIGIN_LABELS[card.patientOrigin]) {
      const originTone =
        card.patientOrigin === 'new'
          ? 'blue'
          : card.patientOrigin === 'web_booking'
            ? 'violet'
            : 'green';
      add(ORIGIN_LABELS[card.patientOrigin], originTone);
    }
    if (card.journalBlocked) {
      add('Journal spärrad', 'gold');
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
              <button class="customers-merge-dismiss" type="button" data-patient-merge-dismiss data-patient-merge-group="${escapeHtml(group.groupId)}">
                Ignorera grupp
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

  async function dismissMergeReviewGroup(groupId) {
    if (!groupId) return;
    try {
      await apiRequest('/api/v1/cco-patient-master/review-groups/dismiss', {
        method: 'POST',
        body: { groupId },
      });
      setStatus('Dubblettgrupp ignorerad.', 'success');
      await loadReviewGroups();
    } catch (error) {
      setStatus(error.message || 'Kunde inte ignorera gruppen.', 'error');
    }
  }

  function renderDraftProposalFieldList(proposal) {
    const fields =
      proposal?.draftFields && typeof proposal.draftFields === 'object' ? proposal.draftFields : {};
    const rows = Object.values(fields)
      .map((field) => {
        const title = normalizeText(field?.title) || normalizeText(field?.journalType) || 'Utkast';
        const note = normalizeText(field?.note);
        return `<li><strong>${escapeHtml(title)}</strong>${note ? `<span class="patient-master-draft-proposal-field-note">${escapeHtml(note)}</span>` : ''}</li>`;
      })
      .join('');
    return rows || '<li>Föreslaget journalutkast</li>';
  }

  function renderDraftProposalsPanel() {
    if (needsStaffLogin()) return '';
    if (runtime.draftProposalsLoading || runtime.draftProposals === null) {
      return `
          <article class="focus-customer-data-card patient-master-draft-proposals-card review-draft-proposal" data-patient-draft-proposals-host>
            <h4>CCO journalutkast</h4>
            <p class="patient-master-muted">Läser föreslagna utkast…</p>
          </article>`;
    }
    const proposals = asArray(runtime.draftProposals);
    if (!proposals.length) {
      return `
          <article class="focus-customer-data-card patient-master-draft-proposals-card review-draft-proposal" data-patient-draft-proposals-host>
            <h4>CCO journalutkast</h4>
            <p class="patient-master-muted">Inga väntande utkast för denna patient.</p>
          </article>`;
    }
    const cards = proposals
      .map((proposal) => {
        const missing = asArray(proposal.missing)
          .map((key) => MISSING_FORM_LABELS[key] || key)
          .filter(Boolean)
          .join(' · ');
        return `
          <article class="patient-master-draft-proposal review-draft-proposal" data-patient-draft-proposal="${escapeHtml(proposal.proposalId)}">
            <p class="patient-master-muted">${escapeHtml(missing || 'Saknade steg')} · kräver godkännande</p>
            <ul class="patient-master-draft-proposal-fields">${renderDraftProposalFieldList(proposal)}</ul>
            <div class="patient-master-draft-proposal-actions">
              <button type="button" class="customers-utility-button" data-review-draft-proposal="approved" data-review-draft-proposal-id="${escapeHtml(proposal.proposalId)}">Godkänn</button>
              <button type="button" class="customers-utility-button" data-review-draft-proposal="dismissed" data-review-draft-proposal-id="${escapeHtml(proposal.proposalId)}">Avvisa</button>
            </div>
          </article>`;
      })
      .join('');
    return `
          <article class="focus-customer-data-card patient-master-draft-proposals-card review-draft-proposal" data-patient-draft-proposals-host>
            <h4>CCO journalutkast</h4>
            <p class="patient-master-muted">${proposals.length} väntande förslag (J-8.2). Godkänn eller avvisa efter granskning.</p>
            ${cards}
          </article>`;
  }

  function refreshDraftProposalsHost() {
    if (runtime.detailTab !== 'journal' && runtime.detailTab !== 'anteckningar') return;
    const host = els.patientRail?.querySelector('[data-patient-draft-proposals-host]');
    if (!host) return;
    host.outerHTML = renderDraftProposalsPanel().trim();
  }

  async function loadDraftProposals(patientId) {
    const id = normalizeText(patientId || runtime.selectedPatientId);
    if (!id || needsStaffLogin()) {
      runtime.draftProposals = [];
      runtime.draftProposalsPatientId = id;
      refreshDraftProposalsHost();
      return;
    }
    if (runtime.draftProposalsLoading && runtime.draftProposalsPatientId === id) return;
    runtime.draftProposalsLoading = true;
    runtime.draftProposalsPatientId = id;
    refreshDraftProposalsHost();
    try {
      const payload = await apiRequest(
        `/api/v1/ops/cco-care/draft-proposals?patientId=${encodeURIComponent(id)}&status=pending&limit=20`
      );
      if (normalizeText(runtime.selectedPatientId) !== id) return;
      runtime.draftProposals = asArray(payload.proposals);
    } catch (error) {
      if (normalizeText(runtime.selectedPatientId) === id) {
        runtime.draftProposals = [];
      }
      console.warn('Draft proposals misslyckades.', error);
    } finally {
      runtime.draftProposalsLoading = false;
      if (normalizeText(runtime.selectedPatientId) === id) {
        refreshDraftProposalsHost();
      }
    }
  }

  async function reviewDraftProposal(proposalId, status, sourceButton = null) {
    const id = normalizeText(proposalId);
    const nextStatus = normalizeText(status).toLowerCase();
    if (!id || !['approved', 'dismissed'].includes(nextStatus)) return;

    // Optimistic UI: lock the card and show feedback so users never feel
    // "nothing happened" while the PATCH is in flight.
    const card = (sourceButton && sourceButton.closest('.patient-master-draft-proposal')) || null;
    const buttons = card ? Array.from(card.querySelectorAll('[data-review-draft-proposal]')) : [];
    const originalLabels = new Map();
    buttons.forEach((btn) => {
      originalLabels.set(btn, btn.textContent);
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      if (btn === sourceButton) {
        btn.textContent = 'Sparar…';
      }
    });
    if (card) {
      card.style.opacity = '0.55';
      card.style.pointerEvents = 'none';
      card.setAttribute('aria-busy', 'true');
    }
    const statusMessage =
      nextStatus === 'approved' ? 'Godkänner journalutkast…' : 'Avvisar journalutkast…';
    setStatus(statusMessage, 'loading');

    try {
      await apiRequest(`/api/v1/ops/cco-care/draft-proposals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setStatus(
        nextStatus === 'approved' ? 'Journalutkast godkänt.' : 'Journalutkast avvisat.',
        'success'
      );
      // Fade card out then remove to give a confirmation beat before refresh.
      if (card) {
        card.style.transition = 'opacity 180ms ease, transform 180ms ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.97)';
      }
      await loadDraftProposals(runtime.selectedPatientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte uppdatera journalutkast.', 'error');
      // Restore the card so user can retry.
      if (card) {
        card.style.opacity = '';
        card.style.pointerEvents = '';
        card.removeAttribute('aria-busy');
      }
      buttons.forEach((btn) => {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        if (originalLabels.has(btn)) {
          btn.textContent = originalLabels.get(btn);
        }
      });
    }
  }

  async function downloadGdprExport(patientId) {
    if (!patientId) return;
    const token = getAdminToken();
    const url = new URL('/api/v1/cco-patient-master/patient/gdpr-export', window.location.origin);
    url.searchParams.set('patientId', patientId);
    setStatus('Exporterar GDPR-utdrag…', 'loading');
    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const err = await response.json();
          message = err.error || message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const fileName =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ||
        `gdpr-${patientId.slice(0, 8)}.json`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus('GDPR-utdrag nedladdat.', 'success');
    } catch (error) {
      setStatus(error.message || 'Kunde inte exportera.', 'error');
    }
  }

  async function savePatientJournalAccess({ journalBlocked, journalBlockReason }) {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/patient/access', {
        method: 'PUT',
        body: {
          patientId,
          journalBlocked: Boolean(journalBlocked),
          journalBlockReason: normalizeText(journalBlockReason),
        },
      });
      if (runtime.detail?.card) {
        runtime.detail.card = { ...runtime.detail.card, ...payload.card };
      }
      if (runtime.detail?.patient) {
        runtime.detail.patient.access = payload.patient?.access;
      }
      setStatus(journalBlocked ? 'Journal spärrad.' : 'Journalspärr borttagen.', 'success');
      renderPatientDetail(
        runtime.detail.patient,
        runtime.detail.card,
        runtime.detail.journalEntries,
        runtime.detail.driveFiles,
        runtime.detail.occasionTimeline,
        runtime.detailTab
      );
    } catch (error) {
      setStatus(error.message || 'Kunde inte uppdatera journalspärr.', 'error');
    }
  }

  function renderPatientComplianceCard(card) {
    if (!card?.patientId) return '';
    const blocked = Boolean(card.journalBlocked);
    const reason = escapeHtml(card.journalBlockReason || '');
    return `
          <article class="focus-customer-data-card patient-master-compliance-card">
            <h4>GDPR &amp; journalspärr</h4>
            <p class="patient-master-muted">Exportera all profil-, journal- och filindex-data för registerutdrag. Journalspärr stoppar nya/redigerade poster (läsning kvar).</p>
            <div class="patient-master-compliance-actions">
              <button type="button" class="customers-utility-button" data-patient-action="gdpr-export">
                Exportera GDPR-utdrag
              </button>
            </div>
            <label class="patient-master-access-toggle">
              <input type="checkbox" data-patient-journal-block-toggle ${blocked ? 'checked' : ''} />
              Spärra journal för denna patient
            </label>
            <label class="patient-master-access-reason">
              <span>Anledning (valfritt)</span>
              <input type="text" data-patient-journal-block-reason value="${reason}" placeholder="t.ex. begäran om spärr" />
            </label>
            <button type="button" class="customers-utility-button" data-patient-action="save-journal-access">
              Spara journalspärr
            </button>
          </article>`;
  }

  function renderPatientDemographicsCard(card) {
    if (!card?.patientId) return '';
    const demo = card.demographics || {};
    const idStatus = escapeHtml(demo.idVerificationStatus || 'unverified');
    const idDoc = escapeHtml(demo.idVerificationDocumentType || '');
    const nextOfKinName = escapeHtml(demo.nextOfKinName || '');
    const nextOfKinPhone = escapeHtml(demo.nextOfKinPhone || '');
    const importantNote = escapeHtml(demo.importantNote || '');
    const primaryAddress = demo.primaryAddress || {};
    const addressLine = escapeHtml(
      [primaryAddress.line1, primaryAddress.postalCode, primaryAddress.city]
        .filter(Boolean)
        .join(', ')
    );
    return `
          <article class="focus-customer-data-card patient-master-demographics-card">
            <h4>Demografi &amp; ID-verifiering</h4>
            <p class="patient-master-muted">Meridiq-paritet: legitimation, närmaste anhörig, viktig notering och adress.</p>
            <label class="patient-master-access-reason">
              <span>ID-status</span>
              <select data-patient-id-status>
                <option value="unverified"${idStatus === 'unverified' ? ' selected' : ''}>Overifierad</option>
                <option value="pending"${idStatus === 'pending' ? ' selected' : ''}>Väntar</option>
                <option value="verified"${idStatus === 'verified' ? ' selected' : ''}>Verifierad</option>
                <option value="rejected"${idStatus === 'rejected' ? ' selected' : ''}>Avvisad</option>
              </select>
            </label>
            <label class="patient-master-access-reason">
              <span>Legitimationstyp</span>
              <input type="text" data-patient-id-document value="${idDoc}" placeholder="t.ex. pass, körkort, ID-kort" />
            </label>
            <label class="patient-master-access-reason">
              <span>Närmaste anhörig</span>
              <input type="text" data-patient-next-of-kin-name value="${nextOfKinName}" placeholder="Namn" />
            </label>
            <label class="patient-master-access-reason">
              <span>Anhörig telefon</span>
              <input type="tel" data-patient-next-of-kin-phone value="${nextOfKinPhone}" placeholder="+46…" />
            </label>
            <label class="patient-master-access-reason">
              <span>Viktig notering</span>
              <textarea rows="2" data-patient-important-note placeholder="Synlig för personal">${importantNote}</textarea>
            </label>
            <label class="patient-master-access-reason">
              <span>Adress</span>
              <input type="text" data-patient-address-line1 value="${escapeHtml(primaryAddress.line1 || '')}" placeholder="Gatuadress" />
            </label>
            <div class="patient-master-compliance-actions">
              <input type="text" data-patient-address-postal value="${escapeHtml(primaryAddress.postalCode || '')}" placeholder="Postnr" />
              <input type="text" data-patient-address-city value="${escapeHtml(primaryAddress.city || '')}" placeholder="Ort" />
            </div>
            ${addressLine ? `<p class="patient-master-muted">Nuvarande: ${addressLine}</p>` : ''}
            <button type="button" class="customers-utility-button" data-patient-action="save-demographics">
              Spara demografi
            </button>
          </article>`;
  }

  async function savePatientDemographics(root) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !root) return;
    setStatus('Sparar demografi…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/patient/demographics', {
        method: 'PUT',
        body: {
          patientId,
          demographics: {
            idVerification: {
              status: root.querySelector('[data-patient-id-status]')?.value || 'unverified',
              documentType: root.querySelector('[data-patient-id-document]')?.value || '',
              verifiedAt:
                root.querySelector('[data-patient-id-status]')?.value === 'verified'
                  ? new Date().toISOString()
                  : null,
            },
            nextOfKin: {
              name: root.querySelector('[data-patient-next-of-kin-name]')?.value || '',
              phone: root.querySelector('[data-patient-next-of-kin-phone]')?.value || '',
            },
            importantNote: root.querySelector('[data-patient-important-note]')?.value || '',
            addresses: {
              items: [
                {
                  type: 'home',
                  line1: root.querySelector('[data-patient-address-line1]')?.value || '',
                  postalCode: root.querySelector('[data-patient-address-postal]')?.value || '',
                  city: root.querySelector('[data-patient-address-city]')?.value || '',
                  country: 'SE',
                },
              ],
            },
          },
        },
      });
      if (payload?.card) runtime.detail.card = payload.card;
      if (payload?.patient) runtime.detail.patient = payload.patient;
      setStatus('Demografi sparad.', 'success');
      renderDetailPanel();
    } catch (error) {
      setStatus(error.message || 'Kunde inte spara demografi.', 'error');
    }
  }

  function renderPatientIntegrationsCard(card) {
    if (!card?.patientId) return '';
    const fortnoxCustomerId = escapeHtml(card.fortnoxCustomerId || '');
    const fortnoxSyncedAt = card.fortnoxSyncedAt
      ? escapeHtml(String(card.fortnoxSyncedAt).slice(0, 19).replace('T', ' '))
      : '';
    const fortnoxSyncError = escapeHtml(card.fortnoxSyncError || '');
    const fortnoxMeta = fortnoxCustomerId
      ? `<p class="patient-master-muted">Fortnox kundnr: <strong>${fortnoxCustomerId}</strong>${fortnoxSyncedAt ? ` · synkad ${fortnoxSyncedAt}` : ''}</p>`
      : `<p class="patient-master-muted">Patienten är inte synkad till Fortnox ännu.</p>`;
    const fortnoxError = fortnoxSyncError
      ? `<p class="patient-master-status is-error">${fortnoxSyncError}</p>`
      : '';
    return `
          <article class="focus-customer-data-card patient-master-integrations-card">
            <h4>Fortnox &amp; Swish</h4>
            <p class="patient-master-muted">Koppla patienten till Fortnox och ta betalt med Swish Handel direkt från kundkortet.</p>
            ${fortnoxMeta}
            ${fortnoxError}
            <div class="patient-master-compliance-actions">
              <button type="button" class="customers-utility-button" data-patient-action="sync-fortnox">
                Synka till Fortnox
              </button>
              <button type="button" class="customers-utility-button" data-patient-action="swish-payment">
                Swish-betalning
              </button>
            </div>
          </article>`;
  }

  async function syncPatientToFortnox() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Synkar patient till Fortnox…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-fortnox/sync-patient', {
        method: 'POST',
        body: { patientId },
      });
      if (payload?.patient && runtime.detail?.card) {
        runtime.detail.card = { ...runtime.detail.card, ...payload.patient };
      }
      setStatus(
        `Fortnox ${payload.action === 'updated' ? 'uppdaterad' : 'kopplad'} (kundnr ${payload.customerNumber || '—'}).`,
        'success'
      );
      renderDetailPanel();
    } catch (error) {
      setStatus(error.message || 'Kunde inte synka till Fortnox.', 'error');
    }
  }

  async function createSwishPaymentForPatient() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    const amountRaw = window.prompt('Belopp i SEK (t.ex. 500 eller 499.50):', '');
    if (!amountRaw) return;
    const message = window.prompt(
      'Meddelande till betalaren (max 50 tecken):',
      `Arcana ${card.displayName || 'patient'}`.slice(0, 50)
    );
    if (message === null) return;
    setStatus('Skapar Swish-betalningsförfrågan…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-swish/payment-request', {
        method: 'POST',
        body: {
          patientId,
          amount: amountRaw,
          message,
          payerAlias: card.primaryPhone || '',
          payeePaymentReference: patientId.slice(0, 35),
        },
      });
      const swishUrl = payload?.swishUrl || '';
      if (swishUrl) {
        const openSwish = window.confirm(
          `Swish-förfrågan skapad (${payload.payment?.amount || amountRaw} SEK). Öppna Swish-appen nu?`
        );
        if (openSwish) {
          window.location.href = swishUrl;
        }
      }
      setStatus(
        `Swish-förfrågan skapad${payload.payment?.id ? ` (${payload.payment.id})` : ''}.`,
        'success'
      );
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa Swish-betalning.', 'error');
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
              <button type="button" class="customers-utility-button" data-patient-action="gdpr-export" title="Ladda ner JSON med profil, journal och filindex">
                GDPR-export
              </button>
            </div>`;
  }

  function renderPatientNotesPanel(journalEntries) {
    const rows = asArray(journalEntries)
      .map((entry) => {
        const fields = entry?.fields || {};
        const staffNotes = normalizeText(fields.staffNotes);
        const notes = normalizeText(fields.notes);
        if (!staffNotes && !notes) return '';
        const label = JOURNAL_TYPE_LABELS[entry.journalType] || entry.journalType || 'Journalpost';
        const when = String(entry.signedAt || entry.createdAt || '').slice(0, 10);
        return `
          <article class="patient-master-note-item">
            <h5>${escapeHtml(label)}${when ? ` · ${escapeHtml(when)}` : ''}</h5>
            ${notes ? `<p><strong>Till kund:</strong> ${escapeHtml(notes)}</p>` : ''}
            ${staffNotes ? `<p class="patient-master-muted"><strong>Internt:</strong> ${escapeHtml(staffNotes)}</p>` : ''}
          </article>`;
      })
      .filter(Boolean)
      .join('');
    return `
          <article class="focus-customer-data-card patient-master-notes-card">
            <h4>Anteckningar</h4>
            ${rows || '<p class="patient-master-muted">Inga journalanteckningar ännu.</p>'}
          </article>`;
  }

  function renderV9DossierTabs(detailTab, fileCount = 0) {
    const tab = normalizeDetailTab(detailTab);
    const tabs = [...V9_DOSSIER_TABS];
    if (isAisiaScalpAnalysisEnabled()) {
      const journalIdx = tabs.findIndex((item) => item.key === 'journal');
      tabs.splice(journalIdx + 1, 0, {
        key: 'scalpanalys',
        label: isMobileViewport() ? 'Scalpanalys' : 'Hår-/scalpanalys',
        accent: 'scalp',
      });
    }
    return tabs
      .map(({ key, label, accent }) => {
        const active = tab === key;
        const fileSuffix = key === 'filer' && fileCount ? ` (${fileCount})` : '';
        return `
          <button
            type="button"
            class="patient-master-tab v9-dossier-tab${active ? ' is-active' : ''}"
            data-patient-tab="${escapeHtml(key)}"
            data-v9-tab-accent="${escapeHtml(accent)}"
            aria-pressed="${active ? 'true' : 'false'}"
          >${escapeHtml(label)}${fileSuffix}</button>`;
      })
      .join('');
  }

  function renderPatientPrimaryTabs(detailTab, fileCount = 0) {
    if (isV9CustomersEnabled()) {
      return renderV9DossierTabs(detailTab, fileCount);
    }
    const tab = normalizeDetailTab(detailTab);
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const fileLabel = fileCount ? ` (${fileCount})` : '';
    const scalpTab = isAisiaScalpAnalysisEnabled()
      ? isMobileViewport()
        ? `<button type="button" class="patient-master-tab${tab === 'scalpanalys' ? ' is-active' : ''}" data-patient-tab="scalpanalys" aria-pressed="${tab === 'scalpanalys'}">Scalpanalys</button>`
        : `<button type="button" class="patient-master-tab${tab === 'scalpanalys' ? ' is-active' : ''}" data-patient-tab="scalpanalys" aria-pressed="${tab === 'scalpanalys'}">Hår-/scalpanalys</button>`
      : '';
    if (isMobileViewport()) {
      return `
          <button type="button" class="patient-master-tab${profilActive ? ' is-active' : ''}" data-patient-tab="profil" aria-pressed="${profilActive}">Profil</button>
          ${scalpTab}
          <button type="button" class="patient-master-tab${tab === 'tidslinje' ? ' is-active' : ''}" data-patient-tab="tidslinje" aria-pressed="${tab === 'tidslinje'}">Tidslinje</button>
          <button type="button" class="patient-master-tab${filesActive ? ' is-active' : ''}" data-patient-tab="filer" aria-pressed="${filesActive}">Filer${fileLabel}</button>`;
    }
    return `
          <button type="button" class="patient-master-tab${profilActive ? ' is-active' : ''}" data-patient-tab="profil" aria-pressed="${profilActive}">Profil</button>
          <button type="button" class="patient-master-tab${journalActive ? ' is-active' : ''}" data-patient-tab="journal" aria-pressed="${journalActive}">Journal</button>
          ${scalpTab}
          <button type="button" class="patient-master-tab${tab === 'tidslinje' ? ' is-active' : ''}" data-patient-tab="tidslinje" aria-pressed="${tab === 'tidslinje'}">Tidslinje</button>
          <button type="button" class="patient-master-tab${avtalActive ? ' is-active' : ''}" data-patient-tab="avtal" aria-pressed="${avtalActive}">Avtal</button>
          <button type="button" class="patient-master-tab${filesActive ? ' is-active' : ''}" data-patient-tab="filer" aria-pressed="${filesActive}">Filer${fileLabel}</button>`;
  }

  function resolveActiveTreatmentEncounterId(entries) {
    const rows = asArray(entries);
    const plan =
      rows.find(
        (entry) =>
          entry.journalType === 'consultation_plan' && normalizeText(entry.treatmentEncounterId)
      ) || rows.find((entry) => entry.journalType === 'consultation_plan' && !entry.locked);
    if (normalizeText(plan?.treatmentEncounterId)) return plan.treatmentEncounterId;
    for (const entry of rows) {
      const encounterId = normalizeText(entry.treatmentEncounterId);
      if (encounterId) return encounterId;
    }
    return '';
  }

  function journalEntryPayload(base, entries) {
    const encounterId = resolveActiveTreatmentEncounterId(
      entries || runtime.detail?.journalEntries
    );
    if (!encounterId) return base;
    return { ...base, treatmentEncounterId: encounterId };
  }

  function syncTimelineFocusFromEntries(entries) {
    const plan = asArray(entries).find(
      (entry) =>
        entry.journalType === 'consultation_plan' && normalizeText(entry.treatmentEncounterId)
    );
    if (!plan) return;
    const hasBooking = Boolean(
      normalizeText(plan.fields?.bookingSlotStart) ||
      normalizeText(plan.fields?.bookingConfirmedAt) ||
      normalizeText(plan.fields?.bookingConversationId)
    );
    if (!hasBooking) return;
    runtime.focusTimelineKey = `encounter:${plan.treatmentEncounterId}`;
    if (runtime.detailTab === 'profil' || runtime.detailTab === 'oversikt') {
      runtime.detailTab = 'tidslinje';
    }
  }

  function focusTimelineSegmentIfNeeded(root) {
    const key = normalizeText(runtime.focusTimelineKey);
    if (!key || runtime.detailTab !== 'tidslinje' || !root) return;
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
    const node = root.querySelector(`[data-timeline-key="${escaped}"]`);
    if (!node) return;
    node.classList.add('is-timeline-focused');
    node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    runtime.focusTimelineKey = '';
  }

  function journalOccasionCategory(entry) {
    const type = entry?.journalType || '';
    if (type === 'historical_import' || entry?.source === 'drive_import') return 'archive';
    if (type === 'follow_up') return 'followup';
    if (type === 'tp_treatment' || type === 'prp_treatment' || type === 'bleph_treatment')
      return 'treatment';
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
          <section class="patient-master-history-segment${group.entries.every((entry) => entry.locked) && group.entries.length ? ' is-encounter-locked' : ''}" data-timeline-key="${escapeHtml(group.timelineKey)}">
            <header class="patient-master-history-segment-head">
              <h4>${escapeHtml(group.timelineLabel)}${group.entries.every((entry) => entry.locked) && group.entries.length ? ' · Låst' : ''}</h4>
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
          category: String(group.timelineKey || '').startsWith('archive:')
            ? 'archive'
            : 'consultation',
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
          <section class="patient-master-history-segment${group.entries.every((entry) => entry.locked) && group.entries.length ? ' is-encounter-locked' : ''}" data-timeline-key="${escapeHtml(group.timelineKey)}">
            <header class="patient-master-history-segment-head">
              <h4>${escapeHtml(group.timelineLabel)}${group.entries.every((entry) => entry.locked) && group.entries.length ? ' · Låst' : ''}</h4>
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
    const tab = normalizeDetailTab(detailTab || 'profil');
    if (isV9CustomersEnabled()) {
      return renderV9DossierTabs(tab, 0)
        .replace(/<button/g, '<span')
        .replace(/<\/button>/g, '</span>');
    }
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

  function renderPatientDetailTabsMarkup(tab, fileCount, { ariaHidden = false } = {}) {
    const tabsClass = isV9CustomersEnabled()
      ? 'patient-master-tabs v9-dossier-tabs'
      : 'patient-master-tabs';
    const hiddenAttr = ariaHidden ? ' aria-hidden="true"' : '';
    return `<div class="${tabsClass}" role="tablist"${hiddenAttr}>${renderPatientPrimaryTabs(tab, fileCount)}</div>`;
  }

  function renderPatientDetailBodyOpen() {
    return isV9CustomersEnabled() ? '<div class="v9-dossier-body">' : '';
  }

  function renderPatientDetailBodyClose() {
    return isV9CustomersEnabled() ? '</div>' : '';
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  let patientListVirtualHandle = null;

  const V9_LIST_ROW_HEIGHT_PX = 78;

  function formatV9ListDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  function resolveV9LastVisitDisplay(card) {
    const iso = card?.lastVisitAt || card?.lastBookingAt;
    if (!iso) return { date: '—', subline: '' };
    let type = normalizeText(card.lastVisitType || card.lastBookingType);
    let by = normalizeText(card.lastVisitResourceLabel);
    if (!type || !by) {
      const visitMs = Date.parse(iso) || 0;
      let best = null;
      let bestDelta = Infinity;
      for (const hb of asArray(card.historyBookings)) {
        const hbMs = Date.parse(hb.startsAt) || 0;
        if (!hbMs) continue;
        const delta = Math.abs(hbMs - visitMs);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = hb;
        }
      }
      if (best && bestDelta <= 86400000) {
        if (!type) type = normalizeText(best.serviceLabel || best.serviceName || best.title);
        if (!by) by = normalizeText(best.resourceLabel);
      }
    }
    if (!type) type = normalizeText(asArray(card.treatmentTypes)[0]);
    const subline = [type, by].filter(Boolean).join(' · ');
    return { date: formatV9ListDate(iso), subline };
  }

  function inferBirthYearFromPersonnummerYy(yy) {
    const nowY = new Date().getFullYear();
    const currentYy = nowY % 100;
    return yy > currentYy + 10 ? 1900 + yy : 2000 + yy;
  }

  function isPlausiblePersonnummerBirthYyyymmdd(yyyymmdd) {
    const year = Number(yyyymmdd.slice(0, 4));
    const month = Number(yyyymmdd.slice(4, 6));
    let day = Number(yyyymmdd.slice(6, 8));
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return false;
    if (!Number.isInteger(month) || month < 1 || month > 12) return false;
    if (day > 60) day -= 60;
    return Number.isInteger(day) && day >= 1 && day <= 31;
  }

  function resolveBirthYyyymmddFromPersonnummer(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    for (const match of raw.matchAll(/(\d{8})[- ]?(\d{4})/g)) {
      if (isPlausiblePersonnummerBirthYyyymmdd(match[1])) return match[1];
    }
    for (const match of raw.matchAll(/(?:^|[^\d])(\d{6})[- ]?(\d{4})(?:[^\d]|$)/g)) {
      const yymmdd = match[1];
      const yy = Number(yymmdd.slice(0, 2));
      const yyyymmdd = `${inferBirthYearFromPersonnummerYy(yy)}${yymmdd.slice(2)}`;
      if (isPlausiblePersonnummerBirthYyyymmdd(yyyymmdd)) return yyyymmdd;
    }
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 12 && isPlausiblePersonnummerBirthYyyymmdd(digits.slice(0, 8))) {
      return digits.slice(0, 8);
    }
    if (digits.length >= 10) {
      const yymmdd = digits.slice(0, 6);
      const yy = Number(yymmdd.slice(0, 2));
      const yyyymmdd = `${inferBirthYearFromPersonnummerYy(yy)}${yymmdd.slice(2)}`;
      if (isPlausiblePersonnummerBirthYyyymmdd(yyyymmdd)) return yyyymmdd;
    }
    return '';
  }

  function resolvePatientAgeYears(card) {
    const fromApi = Number(card?.ageYears);
    if (Number.isFinite(fromApi) && fromApi >= 0 && fromApi <= 120) return fromApi;
    const yyyymmdd = resolveBirthYyyymmddFromPersonnummer(card?.personnummer);
    if (!yyyymmdd) return null;
    const birthYear = Number(yyyymmdd.slice(0, 4));
    const birthMonth = Number(yyyymmdd.slice(4, 6));
    let birthDay = Number(yyyymmdd.slice(6, 8));
    if (birthDay > 60) birthDay -= 60;
    const now = new Date();
    let age = now.getFullYear() - birthYear;
    const month = now.getMonth() + 1;
    const day = now.getDate();
    if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
    return age >= 0 && age <= 120 ? age : null;
  }

  function formatV9ListDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('sv-SE', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  function looksLikeTechnicalPatientName(name) {
    const n = normalizeText(name);
    if (!n) return true;
    if (/\.(pdf|zip|jpe?g|png|heic|webp|gif|tiff?|docx?|xlsx?|mov|mp4)$/i.test(n)) return true;
    if (/^[a-f0-9-]{20,}$/i.test(n)) return true;
    if (
      /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}(_\d+)+(_c)?(\.[a-z0-9]+)?$/i.test(
        n
      )
    ) {
      return true;
    }
    if (/^(IMG|DSC|PXL|Screenshot)[_\s.-]?\d{3,}/i.test(n)) return true;
    if (
      !/\s/.test(n) &&
      n.length >= 18 &&
      /^[\w.-]+$/.test(n) &&
      /[_-]/.test(n) &&
      !/[åäöÅÄÖ]/.test(n)
    ) {
      const alphaWords = n
        .split(/[_\-.]+/)
        .filter((part) => /^[a-z]+$/i.test(part) && part.length > 2);
      if (alphaWords.length === 0) return true;
    }
    return false;
  }

  function sanitizePatientDisplayName(rawName, fallback = 'Namn saknas') {
    const name = normalizeText(rawName);
    if (!name || looksLikeTechnicalPatientName(name)) return fallback;
    return name;
  }

  function displayNameForList(card) {
    const candidates = [
      card?.displayName,
      [card?.firstName, card?.lastName].filter(Boolean).join(' '),
      card?.name,
      card?.fullName,
    ];
    for (const candidate of candidates) {
      const sanitized = sanitizePatientDisplayName(candidate, '');
      if (sanitized) return sanitized;
    }
    return 'Namn saknas';
  }

  function formatV9ZeroCount(value, { allowZero = false } = {}) {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (!allowZero && n === 0) return '—';
    return formatMetricNumber(n);
  }

  function v9AvatarInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }
    return String(name || '??')
      .slice(0, 2)
      .toUpperCase();
  }

  function v9AvatarGradient(name) {
    const hues = [280, 200, 160, 30, 340, 220, 260, 190];
    let hash = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i += 1) {
      hash = (hash + s.charCodeAt(i) * (i + 1)) % hues.length;
    }
    const h = hues[hash];
    return `linear-gradient(180deg, hsl(${h} 65% 78%), hsl(${h} 55% 58%))`;
  }

  function v9ContactLine(card) {
    const email = card.emailMasked || card.primaryEmail || '';
    const phone = card.phoneMasked || card.primaryPhone || '';
    if (!email && !phone) {
      return { main: 'Kontakt saknas', sub: '' };
    }
    return { main: email || '—', sub: phone || '' };
  }

  function v9BookingSubline(card) {
    if (card.hasUpcomingBooking && card.nextBookingAt) {
      const res = card.nextBookingResourceLabel ? ` · ${card.nextBookingResourceLabel}` : '';
      return `Nästa: ${formatV9ListDateTime(card.nextBookingAt)}${res}`;
    }
    if (card.onWaitlist) {
      return `Väntelista: ${card.waitingListStatus || 'ärende'}`;
    }
    if (card.lastVisitAt) {
      return `Senast: ${formatV9ListDate(card.lastVisitAt)}`;
    }
    return '—';
  }

  function resolveV9RowState(card) {
    if (card.isVip) {
      return { state: 'vip', label: 'VIP' };
    }
    if (card.segmentHints?.dormant) {
      return { state: 'inaktiv', label: 'Inaktiv' };
    }
    if (card.missingHealthDeclaration && card.hasUpcomingBooking) {
      return { state: 'risk', label: 'Risk' };
    }
    if (card.flags?.includes('needs_review') || card.matchStatus === 'needs_review') {
      return { state: 'risk', label: 'Risk' };
    }
    if (
      card.segmentHints?.new ||
      card.patientOrigin === 'new' ||
      card.matchStatus === 'unmatched'
    ) {
      return { state: 'new', label: 'Ny' };
    }
    if (card.segmentHints?.active || card.hasJournal || card.hasJournalHistory) {
      return { state: 'active', label: 'Aktiv' };
    }
    return { state: 'active', label: 'Aktiv' };
  }

  function buildV9RowBadges(card) {
    const tags = [];
    const add = (kind, label) => {
      if (!label || tags.some((item) => item.label === label)) return;
      tags.push({ kind, label });
    };
    if (card.isVip) add('vip', 'VIP');
    if (card.missingHealthDeclaration && card.hasUpcomingBooking) add('risk', 'Risk');
    else if (card.flags?.includes('needs_review') || card.matchStatus === 'needs_review') {
      add('risk', 'Granska');
    }
    if (card.segmentHints?.new || card.patientOrigin === 'new') add('new', 'Nya');
    if (card.segmentHints?.dormant) add('inaktiv', 'Inaktiv');
    if (card.missingHealthDeclaration || card.missingForm) {
      add('risk', 'Saknar formulär');
    }
    if (card.missingFitnessCertificate && card.hasUpcomingBooking) {
      add('frisk', '⚠ Friskförs');
    }
    if (card.todayVisit) add('ready', 'Idag');
    if (card.onWaitlist) add('risk', 'Väntelista');
    return tags.slice(0, 3);
  }

  function resolveV9StepStatus(jStep) {
    const toneToState = {
      amber: 'risk',
      info: 'new',
      purple: 'vip',
      teal: 'active',
      ok: 'active',
      red: 'risk',
    };
    return {
      state: toneToState[jStep.tone] || 'new',
      label: `Steg ${jStep.n}`,
    };
  }

  function resolveV9NextStepLabel(card) {
    if (window.CcoKunderSmartNextStep?.listStepLabel) {
      return window.CcoKunderSmartNextStep.listStepLabel(card);
    }
    const top = card.automationTop;
    if (top?.label) return top.label;
    if (top?.summary) return top.summary;
    if (card.nextStep) return card.nextStep;
    return 'Ingen åtgärd registrerad';
  }

  function resolveV9Revenue(card) {
    const wonRaw = Number(
      card.lifetimeValue ?? card.dealValue ?? card.pipedriveDealValue ?? Number.NaN
    );
    const potRaw = Number(card.potentialValue ?? Number.NaN);
    const hasWon = Number.isFinite(wonRaw) && wonRaw > 0;
    const hasOpen = Number.isFinite(potRaw) && potRaw > 0;
    // Won deals = LTV. Om inga vunna ännu: visa öppet Pipedrive-värde i LTV-kolumnen
    // (customers-shell sätter potentialValue från öppna affärer).
    const main = hasWon ? formatV9Sek(wonRaw) : hasOpen ? formatV9Sek(potRaw) : '—';
    const potential = hasWon && hasOpen ? `${formatV9Sek(potRaw)} pot.` : '';
    const dealCount = Number(card.pipedriveDealCount) || 0;
    let title = 'Intäkt (LTV)';
    if (main === '—') {
      title = card.pipedriveLinked
        ? 'Pipedrive kopplad — inget affärsvärde i exporten'
        : 'Intäkt ej kopplad ännu';
    } else if (!hasWon && hasOpen) {
      title = 'Pipedrive — öppen affär (ej vunnen)';
    } else if (card.lifetimeValueLabel) {
      title = card.lifetimeValueLabel;
    }
    let trend = '';
    let trendTone = 'neutral';
    if (hasWon && hasOpen && potRaw > wonRaw) {
      const pct = Math.round(((potRaw - wonRaw) / wonRaw) * 100);
      trend = `+${pct}% pot.`;
      trendTone = 'up';
    } else if (hasOpen && !hasWon) {
      trend = 'Öppen affär';
      trendTone = 'up';
    } else if (hasWon && card.lifetimeValueLabel) {
      trend = card.lifetimeValueLabel;
      trendTone = 'neutral';
    } else if (card.pipedriveLinked && dealCount > 0) {
      trend = `${dealCount} Pipedrive-affär${dealCount === 1 ? '' : 'er'}`;
      trendTone = 'neutral';
    }
    return {
      main,
      potential,
      trend,
      trendTone,
      title,
    };
  }

  function formatV9Sek(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${Math.round(n).toLocaleString('sv-SE')} kr`;
  }

  function syncV9CustomersLayoutState() {
    if (!isV9CustomersEnabled()) return;
    const layout = document.querySelector('.customers-layout');
    const list = document.querySelector('.customers-list');
    const rail = document.querySelector('.customers-rail');
    const workspace = els.workspace || document.querySelector('[data-customers-workspace]');
    const dossierOpen = Boolean(
      runtime.selectedPatientId &&
      (runtime.detail?.card ||
        runtime.detailLoading ||
        rail?.querySelector('[data-patient-detail]'))
    );
    const referensMasterDetail = usesReferensMasterDetail();
    const blueprintOpen = usesBlueprintDesktopLayout() && dossierOpen && !referensMasterDetail;
    if (layout) {
      if (dossierOpen) layout.setAttribute('data-v9-dossier-open', 'on');
      else layout.removeAttribute('data-v9-dossier-open');
    }
    if (blueprintOpen) document.documentElement.setAttribute('data-v9-blueprint', 'on');
    else document.documentElement.removeAttribute('data-v9-blueprint');
    if (list) {
      list.classList.toggle(
        'customers-list--compact',
        dossierOpen && !referensMasterDetail && !usesV10KundkortFacit()
      );
    }
    if (rail) rail.classList.toggle('customers-rail--dominant', dossierOpen && !blueprintOpen);
    syncV10FacitIntelShell();
    if (referensMasterDetail && dossierOpen) {
      applyReferensMasterDetailLayout();
    } else if (!dossierOpen) {
      clearReferensMasterDetailLayout();
    }
    if (workspace && !blueprintOpen && !dossierOpen) {
      workspace.innerHTML = '';
      workspace.hidden = true;
      workspace.setAttribute('aria-hidden', 'true');
    }
  }

  function mergeCardWithShellEnrichment(card, patientId, journalEntries) {
    if (!card) return card;
    const shell = runtime.patients.find(
      (row) => normalizeText(row?.patientId) === normalizeText(patientId || card.patientId)
    );
    if (!shell) {
      return reapplyLiveJournalReadout(card, journalEntries);
    }
    const merged = { ...card };
    const enrichKeys = [
      'phoneMasked',
      'emailMasked',
      'sourceSystem',
      'isVip',
      'nextStep',
      'nextRequirement',
      'automationTop',
      'automationSignals',
      'missingJournal',
      'hasJournal',
      'missingHealthDeclaration',
      'hasHealthDeclaration',
      'missingForm',
      'hasForm',
      'missingAgreement',
      'hasAgreement',
      'missingTreatmentPlan',
      'missingFitnessCertificate',
      'missingPhotoConsent',
      'lastEncounterAt',
      'documentBlockers',
      'blockedSteps',
      'blockedActionIds',
      'hasDocumentBlockers',
      'segmentHints',
      'hasUpcomingBooking',
      'nextBookingAt',
      'nextBookingType',
      'nextBookingResourceLabel',
      'nextBookingStatus',
      'bookingCaseStatus',
      'lastVisitAt',
      'lastBookingAt',
      'onWaitlist',
      'waitingListStatus',
      'patientOrigin',
      'todayVisit',
      'treatmentTypes',
      'pipedriveDealCount',
      'pipedriveLinked',
      'visitCount',
      'bookingCount',
      'noShowCount',
      'lifetimeValue',
      'lifetimeValueLabel',
      'dealValue',
      'pipedriveDealValue',
      'avgVisitRevenue',
    ];
    enrichKeys.forEach((key) => {
      const value = shell[key];
      if (value !== undefined && value !== null && value !== '') {
        merged[key] = value;
      }
    });
    if (Array.isArray(shell.flags) && shell.flags.length) {
      merged.flags = shell.flags;
    }
    return reapplyLiveJournalReadout(merged, journalEntries);
  }

  function reapplyLiveJournalReadout(card, journalEntries) {
    if (!card) return card;
    const entries = asArray(journalEntries);
    const kkx = window.CcoKundkortKkx;
    if (!entries.length || !kkx?.normalizeKkxReadout) return card;

    const live = kkx.normalizeKkxReadout(card, entries, null, {});
    const next = {
      ...card,
      missingJournal: live.missingJournal,
      hasJournal: live.hasJournal,
    };

    if (live.missingJournal === false) {
      if (Array.isArray(next.automationSignals)) {
        next.automationSignals = next.automationSignals.filter(
          (signal) =>
            signal?.status !== 'active' || !String(signal.ruleId || '').includes('missing_journal')
        );
      }
      if (String(next.automationTop?.ruleId || '').includes('missing_journal')) {
        next.automationTop = next.automationSignals?.[0] || null;
      }
      if (/journal saknas|saknar journal/i.test(String(next.nextStep || ''))) {
        next.nextStep = next.missingHealthDeclaration
          ? 'Saknar hälsodeklaration (inför konsultation)'
          : next.hasUpcomingBooking
            ? `Kommande: ${next.nextBookingType || 'besök'}`
            : next.nextStep?.replace(/journal saknas|saknar journal/gi, '').trim() || null;
      }
      if (kkx.resolvePanelSignals) {
        next.automationSignals = kkx.resolvePanelSignals(live, entries, null, {});
        next.automationTop = next.automationSignals[0] || next.automationTop || null;
      }
    }
    return next;
  }

  function refreshJournalEnrichmentReadout(patientId) {
    const key = normalizeText(patientId || runtime.selectedPatientId);
    if (!key || !runtime.detail?.card) return;
    const journalEntries = asArray(runtime.detail.journalEntries);
    const patched = reapplyLiveJournalReadout(runtime.detail.card, journalEntries);
    runtime.detail.card = { ...runtime.detail.card, ...patched };

    const shellRow = runtime.patients.find((row) => normalizeText(row.patientId) === key);
    if (shellRow) {
      Object.assign(shellRow, {
        missingJournal: patched.missingJournal,
        hasJournal: patched.hasJournal,
        automationSignals: patched.automationSignals,
        automationTop: patched.automationTop,
        nextStep: patched.nextStep,
      });
    }

    window.ArcanaCcoData?.invalidate?.('customers-shell');
    window.ArcanaCcoData?.invalidate?.(`journal:${key}`);
    renderPatientRows();
  }

  function resolveKunderActionContext() {
    return {
      tenantId: 'hairtpclinic',
      role: 'staff',
      surface: isMobileViewport() ? 'mobile' : 'desktop',
    };
  }

  function renderV9SmartNextStepHtml(card) {
    if (!isV9CustomersEnabled() || !card) return '';
    const mod = window.CcoKunderSmartNextStep;
    if (!mod?.renderPanel) return '';
    const inner = mod.renderPanel(card, { automation: runtime.automation });
    return `<div data-v9-smart-next-step>${inner}</div>`;
  }

  function renderV9DossierScrollBlock(
    card,
    journalEntries,
    occasionTimeline,
    driveFiles,
    { synthesisOnly = false, v10Facit = false } = {}
  ) {
    if (!isV9CustomersEnabled() || !card) return '';
    return (
      window.CcoV9CustomersParity?.renderDossierScrollHtml?.(
        card,
        journalEntries,
        occasionTimeline,
        driveFiles,
        { synthesisOnly, v10Facit }
      ) || ''
    );
  }

  function renderV9IntelligentBubblesBlock(card, journalEntries, occasionTimeline) {
    if (!isV9CustomersEnabled() || !card) return '';
    const dossierBundle = runtime.detail?.dossierBundle || runtime.detail?.documentBundle || null;
    const driveFiles = runtime.detail?.driveFiles || null;
    return (
      window.CcoV9CustomersParity?.renderIntelligentJourneyBubblesHtml?.(
        card,
        journalEntries,
        dossierBundle,
        occasionTimeline,
        driveFiles
      ) || ''
    );
  }

  async function loadPatientDocumentBundle(patientId) {
    if (!patientId) return null;
    try {
      const body = await apiRequest(
        `/api/v1/cco-patient-master/patient/dossier-bundle?patientId=${encodeURIComponent(patientId)}&includeJournal=0`,
        { cacheKey: `dossier-bundle:${patientId}`, staleTime: 30_000, gcTime: 120_000 }
      );
      if (runtime.detail && normalizeText(runtime.selectedPatientId) === normalizeText(patientId)) {
        runtime.detail.dossierBundle = body;
        runtime.detail.documentBundle = body?.documentBundle || body;
      }
      return body;
    } catch {
      return null;
    }
  }

  function renderV9QuickPillsBlock(card) {
    if (!isV9CustomersEnabled() || !card) return '';
    return window.CcoV9CustomersParity?.renderDossierQuickPillsHtml?.(card) || '';
  }

  function renderV9HiddenCameraBridge(card) {
    const uploadBlocked = Boolean(card?.journalBlocked);
    const disabledAttr = uploadBlocked ? ' disabled' : '';
    return `
      <label class="patient-master-camera-button v9-camera-bridge" hidden aria-hidden="true">
        <input type="file" accept="image/*" capture="environment" hidden data-patient-photo-camera${disabledAttr} />
      </label>`;
  }

  function renderV9IntelDrawerShell() {
    return `
      <aside class="v9-intel-drawer" data-v9-intel-drawer hidden aria-hidden="true">
        <div class="v9-intel-drawer__backdrop" data-v9-intel-drawer-close tabindex="-1" aria-hidden="true"></div>
        <div class="v9-intel-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="v9-intel-drawer-title">
          <header class="v9-intel-drawer__head">
            <strong id="v9-intel-drawer-title" data-v9-intel-drawer-title>Kundresa</strong>
            <button type="button" class="v9-intel-drawer__close" data-v9-intel-drawer-close aria-label="Stäng">✕</button>
          </header>
          <div class="v9-intel-drawer__body" data-v9-intel-drawer-body></div>
        </div>
      </aside>`;
  }
  function renderV9MockupDossierDeepShell() {
    return `
      <div class="v9-dossier-deep" data-v9-dossier-deep hidden aria-hidden="true">
        <div class="v9-dossier-deep__head">
          <strong data-v9-deep-title>Dossier</strong>
          <button type="button" class="v9-dossier-deep__close" data-v9-deep-close>Stäng</button>
        </div>
        <div class="v9-dossier-deep__body" data-v9-deep-body></div>
      </div>`;
  }

  function closeV9DossierDeepPanel() {
    const deep = document.querySelector('[data-v9-dossier-deep]');
    if (!deep) return;
    deep.hidden = true;
    deep.setAttribute('aria-hidden', 'true');
    const body = deep.querySelector('[data-v9-deep-body]');
    if (body) body.innerHTML = '';
  }

  function openV9DossierDeepPanel(mode, ctx) {
    const { card, journalEntries, driveFiles } = ctx;
    const deep = document.querySelector('[data-v9-dossier-deep]');
    const body = deep?.querySelector('[data-v9-deep-body]');
    const title = deep?.querySelector('[data-v9-deep-title]');
    if (!deep || !body) return;
    if (mode === 'journal') {
      switchDetailTab('journal');
      return;
    }
    if (mode === 'filer') {
      switchDetailTab('filer');
      return;
    }
    if (mode === 'profil') {
      switchDetailTab('profil');
      return;
    }
    if (mode === 'bookings' || mode === 'tidslinje') {
      switchDetailTab('tidslinje');
      return;
    }
    if (title) title.textContent = 'Dossier';
    body.innerHTML = `<p class="patient-master-muted">Okänt läge: ${escapeHtml(mode || '—')}</p>`;
    deep.hidden = false;
    deep.removeAttribute('aria-hidden');
  }

  function triggerV9ContextAction(root, ctx, actionKey) {
    if (!actionKey) return;
    if (actionKey === 'consent') {
      switchDetailTab('profil');
      return;
    }
    if (actionKey === 'agreement') {
      switchDetailTab('avtal');
      return;
    }
    switchDetailTab('journal');
    const selectorByAction = {
      health_tp: '[data-patient-action="new-health-declaration"]',
      fitness_tp: '[data-patient-action="new-fitness-certificate"]',
      plan: '[data-patient-action="new-consultation-plan"]',
      health_bleph: '[data-clinical-form-key="health_curatiio_bleph"]',
      fitness_bleph: '[data-clinical-form-key="fitness_curatiio_bleph"]',
    };
    const selector = selectorByAction[actionKey];
    if (!selector) return;
    const clickTarget = () => {
      const panel =
        root.querySelector('[data-patient-tab-panel="journal"]:not([hidden])') ||
        root.querySelector('[data-patient-tab-panel="journal"]') ||
        root;
      panel.querySelector(selector)?.click();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(clickTarget));
  }

  function bindV9MockupDossierHandlers(root, ctx) {
    if (!root || !isV9CustomersEnabled()) return;
    bindV9Zone1Handlers(root, ctx);
    const journeyHandlers = {
      openBook: () => {
        window.dispatchEvent(
          new CustomEvent('cco:v9-ghost-booking', {
            detail: { source: 'intel-action', patientId: ctx.card?.patientId },
          })
        );
      },
      confirmBookings: () => {
        setStatus('Öppnar bokningsytan för att bekräfta kommande tider.', 'info');
        navigateShellView('booking');
      },
      switchTab: (tabKey) => switchDetailTab(tabKey),
      openJournal: () => switchDetailTab('journal'),
      openForm: () => switchDetailTab('journal'),
    };
    if (root.querySelector('[data-kundkort-slide-over]')) {
      window.CcoV9CustomersParity?.bindKundkortSlideOver?.(root, journeyHandlers, ctx);
    } else {
      window.CcoV9CustomersParity?.bindDossierScroll?.(root, journeyHandlers);
      window.CcoV9CustomersParity?.bindIntelligentJourney?.(root, ctx, journeyHandlers);
    }
    window.CcoV9CustomersParity?.bindDossierQuickPills?.(root, {
      openPhoto: () => {
        root.querySelector('.v9-camera-bridge [data-patient-photo-camera]')?.click();
      },
      openBook: () => {
        window.dispatchEvent(
          new CustomEvent('cco:v9-ghost-booking', {
            detail: { source: 'quick-pill', patientId: ctx.card?.patientId },
          })
        );
      },
      openJournal: () => switchDetailTab('journal'),
      openReply: () => {
        document.querySelector('[data-studio-open]')?.click();
      },
      confirmBookings: () => {
        setStatus('Öppnar bokningsytan för att bekräfta kommande tider.', 'info');
        navigateShellView('booking');
      },
      openContext: (actionKey) => triggerV9ContextAction(root, ctx, actionKey),
      openDeep: (mode) => openV9DossierDeepPanel(mode, ctx),
    });
    window.CcoV9CustomersParity?.bindDossierNavigation?.(root, {
      onBack: () => closeV9DossierSelection(),
      onCloseDeep: () => closeV9DossierDeepPanel(),
    });
    const closeBtn = root.querySelector('[data-v9-deep-close]');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', closeV9DossierDeepPanel);
    }
    if (root.querySelector('.v9-mockup-dossier--referens .kkref')) {
      bindKkxReferensPanel(root, {
        card: ctx.card,
        journalEntries: ctx.journalEntries,
        dossierBundle: runtime.detail?.dossierBundle || runtime.detail?.documentBundle || null,
        extras: { occasionTimeline: ctx.occasionTimeline },
        mountJournalBig: (slot, opts) => mountKkxJournalBig(slot, opts),
        activateJournalTemplate: (templateId, slot, opts) =>
          activateKkxJournalTemplate(templateId, slot, opts),
        resolveJournalTemplateId: (journalType, formVariant) =>
          resolveKkxTemplateIdFromJournalType(journalType, formVariant),
      });
    }
  }

  function renderV9PatientTabPanelsMarkup(
    card,
    patient,
    journalEntries,
    driveFiles,
    occasionTimeline,
    tab,
    { lite = false } = {}
  ) {
    const oversiktActive = tab === 'oversikt';
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const scalpanalysActive = isAisiaScalpAnalysisEnabled() && tab === 'scalpanalys';
    const tidslinjeActive = tab === 'tidslinje';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const anteckningarActive = tab === 'anteckningar';
    const placeholder = (label) =>
      lite
        ? `<p class="patient-master-muted" data-patient-shell-placeholder">Laddar ${escapeHtml(label)}…</p>`
        : '';

    return `
        <div class="patient-master-tab-panel v9-dossier-tab-panel${oversiktActive ? ' is-active' : ''}"${oversiktActive ? '' : ' hidden'} data-patient-tab-panel="oversikt">
          ${renderV9DossierScrollBlock(card, journalEntries, occasionTimeline, driveFiles, {
            synthesisOnly: true,
          })}
        </div>

        <div class="patient-master-tab-panel v9-dossier-tab-panel${profilActive ? ' is-active' : ''}"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil">
          ${
            lite
              ? placeholder('profil')
              : `
          ${renderJournalWorkflowCallout(journalEntries)}
          ${renderScalpImagingCallout()}
          ${renderPatientIntegrationsCard(card)}
          ${renderPatientComplianceCard(card)}
          ${renderPatientDemographicsCard(card)}
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
          ${
            patient?.cliento?.createdAt
              ? `<p class="patient-master-muted">Cliento skapad: ${escapeHtml(String(patient.cliento.createdAt).slice(0, 10))}</p>`
              : ''
          }`
          }
        </div>

        <div class="patient-master-tab-panel v9-dossier-tab-panel${journalActive ? ' is-active' : ''}"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          ${
            lite
              ? placeholder('journal')
              : `
          ${renderJournalWorkflowCallout(journalEntries)}
          ${renderScalpImagingCallout()}
          ${renderDraftProposalsPanel()}
          ${
            card.journalBlocked
              ? `<p class="patient-master-block-banner">Journalen är spärrad${card.journalBlockReason ? `: ${escapeHtml(card.journalBlockReason)}` : ''}. Nya eller ändrade poster blockeras.</p>`
              : ''
          }
          ${renderJournalEntries(journalEntries)}`
          }
        </div>

        ${
          isAisiaScalpAnalysisEnabled()
            ? `<div class="patient-master-tab-panel v9-dossier-tab-panel${scalpanalysActive ? ' is-active' : ''}"${scalpanalysActive ? '' : ' hidden'} data-patient-tab-panel="scalpanalys">
          ${
            lite
              ? placeholder('scalpanalys')
              : `<div id="cco-scalp-analysis-mount" data-scalp-analysis-mount="${escapeHtml(card.patientId || runtime.selectedPatientId || '')}"></div>`
          }
        </div>`
            : ''
        }

        <div class="patient-master-tab-panel v9-dossier-tab-panel${tidslinjeActive ? ' is-active' : ''}"${tidslinjeActive ? '' : ' hidden'} data-patient-tab-panel="tidslinje">
          ${
            lite
              ? placeholder('tidslinje')
              : renderUnifiedTimelinePanel(journalEntries, driveFiles, occasionTimeline)
          }
        </div>

        <div class="patient-master-tab-panel v9-dossier-tab-panel${avtalActive ? ' is-active' : ''}"${avtalActive ? '' : ' hidden'} data-patient-tab-panel="avtal">
          ${lite ? placeholder('avtal') : renderAgreementSection()}
        </div>

        <div class="patient-master-tab-panel v9-dossier-tab-panel${filesActive ? ' is-active' : ''}"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer">
          ${lite ? placeholder('filer') : renderDriveFiles(driveFiles, card)}
        </div>

        <div class="patient-master-tab-panel v9-dossier-tab-panel${anteckningarActive ? ' is-active' : ''}"${anteckningarActive ? '' : ' hidden'} data-patient-tab-panel="anteckningar">
          ${
            lite
              ? placeholder('anteckningar')
              : `${renderDraftProposalsPanel()}${renderPatientNotesPanel(journalEntries)}`
          }
        </div>`;
  }

  function renderV10ReferensDossierHtml(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline,
    driveFiles
  ) {
    if (typeof window.__renderReferensKundkort !== 'function') return '';
    return window.__renderReferensKundkort(card, dossierBundle, journalEntries, {
      driveFiles,
      commercialCase: runtime.commercialCase || null,
      occasionTimeline,
    });
  }

  function renderV9MockupDetailShell(
    card,
    journalEntries,
    occasionTimeline,
    driveFiles,
    patient,
    tab,
    { lite = false } = {}
  ) {
    const normalizedTab = normalizeDetailTab(tab);
    const fileCount = Number(card.fileSummary?.totalFiles || driveFiles?.length || 0);
    const v11Cutover = usesV11DossierCutover();
    const v10Facit = usesV10KundkortFacit();
    if (v10Facit && !v11Cutover) {
      const dossierBundle = runtime.detail?.dossierBundle || runtime.detail?.documentBundle || null;
      const referensHtml = renderV10ReferensDossierHtml(
        card,
        journalEntries,
        dossierBundle,
        occasionTimeline,
        driveFiles
      );
      if (referensHtml) {
        return `
      <section class="patient-master-card v9-mockup-dossier v9-mockup-dossier--v10-facit v9-mockup-dossier--referens" data-patient-detail>
        <button type="button" class="dossier-close v10-referens-close" data-v9-dossier-close title="Stäng dossiér" aria-label="Stäng dossiér">×</button>
        <div class="v10-dossier-referens" data-v9-dossier-scroll aria-label="Kunddossiér">
          <div class="kkref">${referensHtml}</div>
        </div>
        ${renderV9HiddenCameraBridge(card)}
        ${renderV9IntelDrawerShell()}
        ${renderV9MockupDossierDeepShell()}
      </section>`;
      }
      return `
      <section class="patient-master-card v9-mockup-dossier v9-mockup-dossier--v10-facit" data-patient-detail>
        <div class="v9-dossier-chrome v10-dossier-chrome">
          ${renderPatientDetailHero(card, journalEntries, { loading: lite, occasionTimeline })}
        </div>
        ${renderV9DossierScrollBlock(card, journalEntries, occasionTimeline, driveFiles, {
          v10Facit: true,
        })}
        ${renderV9QuickPillsBlock(card)}
        ${renderV9HiddenCameraBridge(card)}
        ${renderV9IntelDrawerShell()}
        ${renderV9MockupDossierDeepShell()}
      </section>`;
    }
    return `
      <section class="patient-master-card v9-mockup-dossier v9-mockup-dossier--synthesis${v10Facit ? ' v9-mockup-dossier--v10-facit' : ''}${v11Cutover ? ' v9-mockup-dossier--v11-cutover' : ''}" data-patient-detail${v11Cutover ? ' data-v11-cutover="1"' : ''}>
        <div class="v9-dossier-chrome">
          ${v11Cutover ? '' : renderPatientDetailHero(card, journalEntries, { occasionTimeline })}
          ${renderV9IntelligentBubblesBlock(card, journalEntries, occasionTimeline)}
          ${v11Cutover ? '' : renderPatientDetailTabsMarkup(normalizedTab, fileCount)}
        </div>
        ${v11Cutover ? '' : renderV9SmartNextStepHtml(card)}
        ${v11Cutover ? '' : renderV9CapabilityActionsHtml(card)}
        <div class="v9-dossier-workspace"${v11Cutover ? ' hidden aria-hidden="true" data-v11-workspace-fallback="1"' : ''}>
          ${renderPatientDetailBodyOpen()}
          ${renderV9PatientTabPanelsMarkup(
            card,
            patient,
            journalEntries,
            driveFiles,
            occasionTimeline,
            normalizedTab,
            { lite }
          )}
          ${renderPatientDetailBodyClose()}
        </div>
        ${v11Cutover ? '' : renderV9QuickPillsBlock(card)}
        ${renderV9HiddenCameraBridge(card)}
        ${renderV9IntelDrawerShell()}
        ${renderV9MockupDossierDeepShell()}
      </section>`;
  }

  function ensureV9DossierDeepClosed() {
    closeV9DossierDeepPanel();
  }

  function renderV9CapabilityActionsHtml(card) {
    if (!isV9CustomersEnabled() || !card) return '';
    const actions = window.CcoKunderActions;
    if (!actions?.buildDossierBar) return '';
    const actionCtx = resolveKunderActionContext();
    const dossierBar = actions.buildDossierBar(card, actionCtx);
    const actionsHtml =
      actions.renderMatrixLegend(dossierBar) +
      actions.renderActionsHtml(dossierBar, {
        linkClass: 'v9-dossier-action',
        buttonClass: 'v9-dossier-action',
        hostId: 'v9-dossier-actions',
      });
    return `
      <div class="v9-dossier-capability" data-v9-capability-actions>
        <h3 class="v9-dossier-capability__title">Åtgärder</h3>
        <div class="v9-dossier-capability__host" data-v9-capability-host data-kunder-actions-host>
          ${actionsHtml}
        </div>
      </div>`;
  }

  function bindV9DossierCapabilityHandlers(root) {
    if (!root || !isV9CustomersEnabled()) return;
    const host = root.querySelector('[data-v9-capability-host]');
    if (!host || !window.CcoKunderActions?.bindDossierHandlers) return;
    window.CcoKunderActions.bindDossierHandlers(host, {
      scrollAssets: () => {
        runtime.detailTab = 'filer';
        renderDetailPanel();
        root
          .querySelector('[data-patient-tab-panel="filer"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      scrollCommunication: () => {
        switchDetailTab('profil');
      },
      openJournal: () => {
        switchDetailTab('journal');
      },
      openTimeline: () => {
        switchDetailTab('tidslinje');
      },
    });
  }

  function resolveV9SourceLabel(card) {
    const source = normalizeText(card?.sourceSystem).toLowerCase();
    if (source === 'cliento' || card?.clientoLinked) return 'Cliento';
    if (source === 'drive' || card?.driveLinked) return 'Drive';
    if (source === 'pipedrive' || card?.pipedriveLinked) return 'Pipedrive';
    if (card?.clientoLinked && card?.driveLinked) return 'Cliento · Drive';
    return '—';
  }

  function v9DossierContactLine(card) {
    const contact = v9ContactLine(card);
    const source = resolveV9SourceLabel(card);
    const parts = [];
    if (contact.main && contact.main !== 'Kontakt saknas') parts.push(contact.main);
    else if (contact.main) return contact.main;
    if (contact.sub) parts.push(contact.sub);
    if (source && source !== '—') parts.push(source);
    return parts.length ? parts.join(' · ') : 'Kontakt saknas';
  }

  function mapV9DossierBadgeKind(kind) {
    if (kind === 'new') return 'lifecycle';
    if (kind === 'inaktiv') return 'inaktiv';
    if (kind === 'ready') return 'engagement';
    return kind;
  }

  function buildV9DossierBadges(card) {
    return buildV9RowBadges(card).map((tag) => ({
      kind: mapV9DossierBadgeKind(tag.kind),
      label: tag.label,
    }));
  }

  function resolveV9HeroStats(card, journalEntries = [], occasionTimeline = null) {
    let visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    if (!visits && card?.lastVisitAt) visits = 1;
    if (!visits && Number(card?.fileSummary?.journalPdfs || 0) > 0) visits = 1;
    const ltv = card?.lifetimeValue ?? card?.dealValue ?? card?.pipedriveDealValue;
    const noShows = Number(card?.noShowCount ?? 0);
    const hasLtv = ltv != null && Number(ltv) > 0;
    const lastVisitLabel = card?.lastVisitAt ? String(card.lastVisitAt).slice(0, 10) : '';
    const visitTrend =
      visits > 0
        ? card?.visitsThisYear != null
          ? `+${Number(card.visitsThisYear)} i år`
          : lastVisitLabel
            ? `Senast ${lastVisitLabel}`
            : `${visits} registrerade`
        : 'Inga besök';
    const revenueTrend = hasLtv
      ? card?.revenueTrendLabel || card?.lifetimeValueLabel || 'Livstidsvärde'
      : card?.pipedriveLinked
        ? 'Pipedrive-kopplad'
        : '—';
    const noShowTrend = noShows === 0 ? 'Klockren' : `${noShows} no-show`;

    return [
      {
        label: 'Besök',
        value: String(visits),
        trend: visitTrend,
        jump: 'historik',
        iconKey: 'visits',
        icon: '📅',
      },
      {
        label: 'Intäkt',
        value: hasLtv ? formatV9Sek(ltv) : '—',
        trend: revenueTrend,
        jump: 'ekonomi',
        iconKey: 'revenue',
        icon: '💰',
      },
      {
        label: 'No-shows',
        value: String(noShows),
        trend: noShowTrend,
        jump: 'historik',
        iconKey: 'noshow',
        icon: '✕',
      },
    ];
  }

  function collectV9Zone1Blockers(card, max = 3) {
    const blockers = [];
    const seen = new Set();
    const push = (tone, text) => {
      const key = `${tone}|${text}`;
      if (!text || seen.has(key) || blockers.length >= max) return;
      seen.add(key);
      blockers.push({ tone, text });
    };

    const mod = window.CcoKunderSmartNextStep;
    const signals = mod?.sortSignals?.(card?.automationSignals || []) || [];
    for (const signal of signals) {
      if (signal.status !== 'active') continue;
      const tone = signal.risk || 'needs_review';
      if (!['blocker', 'legal_blocker', 'legal', 'needs_review'].includes(tone)) continue;
      push(tone, signal.what || signal.why || signal.next);
    }

    if (card?.journalBlocked) {
      push(
        'blocker',
        card.journalBlockReason ? `Journal spärrad: ${card.journalBlockReason}` : 'Journal spärrad'
      );
    }
    if (card?.missingHealthDeclaration && card?.hasUpcomingBooking) {
      push('blocker', 'Saknar hälsodeklaration inför kommande besök');
    }
    if (card?.missingForm) {
      push('needs_review', 'Formulär saknas före besök');
    }
    if (card?.missingFitnessCertificate && card?.hasUpcomingBooking) {
      push('blocker', 'Saknar friskförsäkran inför kommande besök');
    }
    // Owner-krav 2026-06-04: allergier + viktig anteckning ska lyftas högst upp
    const allergies = asArray(card?.allergies || card?.demographics?.allergies)
      .map((a) => (typeof a === 'string' ? a : a?.name || a?.label))
      .filter(Boolean);
    if (allergies.length) {
      push('legal_blocker', `Allergier: ${allergies.slice(0, 4).join(', ').toUpperCase()}`);
    }
    const importantNote = normalizeText(card?.importantNote || card?.demographics?.importantNote);
    if (importantNote) {
      push('needs_review', `Viktigt: ${importantNote.slice(0, 120)}`);
    }
    return blockers.slice(0, max);
  }

  function buildV9JourneySteps(card) {
    // 9-stegs kundresa per memory project_hairtp_kundresa_korrigerad_2026_06.
    // Display-only: visualiserar resa med "done/active/pending/locked" baserat på tillgängliga signaler.
    const signals = card?.automationSignals || [];
    const findSignal = (key) => signals.find((s) => String(s?.ruleId || '').includes(key));
    const hasUpcoming = Boolean(card?.hasUpcomingBooking);
    const hasJournal = Boolean(card?.hasJournal);
    const photoConsent = card?.photoConsent;
    const planStatus = normalizeText(card?.treatmentPlanStatus);
    const agreementSigned = Boolean(card?.agreementSigned || findSignal('agreement_signed'));
    const fitnessSigned = !card?.missingFitnessCertificate;
    const completedTreatment = Boolean(card?.hasCompletedTreatment || hasJournal);
    const hasFollowUp = Boolean(card?.hasFollowUpBooking || findSignal('follow_up'));
    const hasReview = Boolean(card?.hasReview || findSignal('review'));
    const sentPreInfo = Boolean(card?.preInfoSentAt || findSignal('pre_info'));
    const hasConsultDone = hasJournal || Boolean(card?.consultDoneAt);

    function step(id, label, done, active) {
      let state = 'pending';
      if (done) state = 'done';
      else if (active) state = 'active';
      return { id, label, state };
    }

    return [
      step('pre', 'Pre-info', sentPreInfo, !sentPreInfo && hasUpcoming),
      step('konsult', 'Konsult', hasConsultDone, !hasConsultDone && hasUpcoming),
      step(
        'offert',
        'Offert',
        Boolean(planStatus && planStatus !== 'draft'),
        hasConsultDone && !planStatus
      ),
      step('avtal', 'Avtal', agreementSigned, !agreementSigned && Boolean(planStatus)),
      step(
        'foto',
        'Foto-samtycke',
        Boolean(photoConsent?.signed),
        !photoConsent?.signed && agreementSigned
      ),
      step('frisk', 'Friskförs', fitnessSigned, !fitnessSigned && hasUpcoming),
      step(
        'op',
        'Operation',
        completedTreatment,
        !completedTreatment && fitnessSigned && hasUpcoming
      ),
      step('uppfolj', 'Uppfölj', hasFollowUp, completedTreatment && !hasFollowUp),
      step('omd', 'Omdöme', hasReview, hasFollowUp && !hasReview),
    ];
  }

  function renderV9JourneyStepperHtml(card) {
    if (!isV9CustomersEnabled() || !card) return '';
    const steps = buildV9JourneySteps(card);
    if (!steps.length) return '';
    return `
          <ol class="v9-journey-stepper" data-v9-journey-stepper aria-label="Kundresa 9 steg">
            ${steps
              .map(
                (s, idx) => `
              <li class="v9-journey-step v9-journey-step--${escapeHtml(s.state)}" data-v9-journey-step="${escapeHtml(s.id)}" title="${escapeHtml(s.label)} (${escapeHtml(s.state)})">
                <span class="v9-journey-step__dot" aria-hidden="true">${s.state === 'done' ? '✓' : idx + 1}</span>
                <span class="v9-journey-step__label">${escapeHtml(s.label)}</span>
              </li>`
              )
              .join('')}
          </ol>`;
  }

  function buildV9JournalStatusEntries(card) {
    // Förväntade journal/dokument per Hair TP kundresa.
    // Heuristik från befintliga signaler; ORD-23 backend ger real fill-audit per entry.
    const entries = [];
    const signals = card?.automationSignals || [];
    const findSig = (key) => signals.find((s) => String(s?.ruleId || '').includes(key));
    const hasUpcoming = Boolean(card?.hasUpcomingBooking);
    const hasJournal = Boolean(card?.hasJournal);

    function entry(id, title, icon, status, by, when, actionLabel) {
      return { id, title, icon, status, by: by || null, when: when || null, actionLabel };
    }

    // Hälsodeklaration
    const haelsoSig = findSig('health') || findSig('haelso');
    entries.push(
      entry(
        'health_declaration',
        'Hälsodeklaration',
        '📋',
        card?.missingHealthDeclaration ? 'missing' : haelsoSig ? 'partial' : 'filled',
        card?.healthDeclarationBy || null,
        card?.healthDeclarationAt || null,
        card?.missingHealthDeclaration ? 'Skicka portal-länk' : 'Visa'
      )
    );

    // Friskförsäkran
    entries.push(
      entry(
        'fitness_certificate',
        'Friskförsäkran',
        '🩺',
        card?.missingFitnessCertificate ? 'missing' : 'filled',
        card?.fitnessCertificateBy || null,
        card?.fitnessCertificateAt || null,
        card?.missingFitnessCertificate ? (hasUpcoming ? 'Begär signering' : 'Schemalägg') : 'Visa'
      )
    );

    // Foto-samtycke
    const photoSigned = Boolean(card?.photoConsent?.signed);
    entries.push(
      entry(
        'photo_consent',
        'Foto-samtycke',
        '📷',
        photoSigned ? 'filled' : 'missing',
        card?.photoConsent?.grantedBy || null,
        card?.photoConsent?.grantedAt || null,
        photoSigned ? 'Visa' : 'Begär samtycke'
      )
    );

    // Pre-op journal
    entries.push(
      entry(
        'preop_journal',
        'Pre-op journal',
        '📝',
        hasJournal ? 'filled' : 'missing',
        card?.preopBy || null,
        card?.preopAt || null,
        hasJournal ? 'Öppna' : 'Skapa'
      )
    );

    // Före-bilder
    const photoCount = Number(card?.fileSummary?.images || 0);
    entries.push(
      entry(
        'before_photos',
        'Före-bilder',
        '📸',
        photoCount >= 4 ? 'filled' : photoCount > 0 ? 'partial' : 'missing',
        null,
        null,
        photoCount >= 4 ? `${photoCount}/4 uppladdade` : 'Ta foto'
      )
    );

    // Operations-journal
    entries.push(
      entry(
        'op_journal',
        'Operations-journal',
        '⚕',
        card?.hasCompletedTreatment ? 'filled' : 'pending',
        null,
        null,
        card?.hasCompletedTreatment ? 'Öppna' : 'Schemalagd'
      )
    );

    // Efter-bilder
    entries.push(
      entry(
        'after_photos',
        'Efter-bilder',
        '📷',
        card?.hasCompletedTreatment ? 'missing' : 'pending',
        null,
        null,
        card?.hasCompletedTreatment ? 'Ta foto' : 'Efter operation'
      )
    );

    // Uppföljnings-journal
    entries.push(
      entry(
        'followup_journal',
        'Uppfölj-journal',
        '🔄',
        card?.hasFollowUpBooking ? 'partial' : 'pending',
        null,
        null,
        card?.hasFollowUpBooking ? 'Fortsätt' : 'Boka uppföljning'
      )
    );

    return entries;
  }

  function formatV9TileDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return '';
    }
  }

  function renderV9JournalStatusGridHtml(card) {
    if (!isV9CustomersEnabled() || !card) return '';
    const entries = buildV9JournalStatusEntries(card);
    if (!entries.length) return '';
    const filledCount = entries.filter((e) => e.status === 'filled').length;
    return `
        <section class="v9-journal-status" data-v9-journal-status aria-label="Journal-status">
          <header class="v9-journal-status__head">
            <span>Journal & dokument</span>
            <span>${filledCount}/${entries.length} klart</span>
          </header>
          ${entries
            .map((e) => {
              const initial = e.by ? escapeHtml(e.by.slice(0, 2).toUpperCase()) : '';
              const dateLabel = formatV9TileDate(e.when);
              return `
              <article class="v9-journal-tile" data-v9-journal-tile="${escapeHtml(e.id)}" data-status="${escapeHtml(e.status)}">
                <div class="v9-journal-tile__head">
                  <span class="v9-journal-tile__icon" aria-hidden="true">${escapeHtml(e.icon)}</span>
                  <div style="flex:1;min-width:0">
                    <h4 class="v9-journal-tile__title">${escapeHtml(e.title)}</h4>
                    <div class="v9-journal-tile__meta">
                      ${
                        e.by || dateLabel
                          ? `<span class="v9-journal-tile__by">${initial ? `<span class="v9-journal-tile__by-avatar">${initial}</span>` : ''}${e.by ? `${escapeHtml(e.by)}` : ''}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ''}</span>`
                          : '<span>Inte ifylld ännu</span>'
                      }
                    </div>
                  </div>
                </div>
                <button type="button" class="v9-journal-tile__action" data-v9-journal-action="${escapeHtml(e.id)}">${escapeHtml(e.actionLabel)}</button>
              </article>`;
            })
            .join('')}
        </section>`;
  }

  function renderV9Zone1BlockersHtml(card) {
    const items = collectV9Zone1Blockers(card);
    if (!items.length) return '';
    return `
          <div class="v9-zone1-now" aria-label="Viktigt nu">
            <div class="v9-zone1-now__kicker">Viktigt nu</div>
            ${items
              .map(
                (item) =>
                  `<div class="v9-zone1-alert" data-tone="${escapeHtml(item.tone)}">${escapeHtml(item.text)}</div>`
              )
              .join('')}
          </div>`;
  }

  function resolveV9PrimaryNextStep(card) {
    const label = resolveV9NextStepLabel(card);
    const top = card?.automationTop;
    const ruleId = String(top?.ruleId || '');
    let action = 'journal';
    if (ruleId.includes('health') || card?.missingHealthDeclaration || card?.missingForm) {
      action = 'form';
    } else if (ruleId.includes('agreement') || ruleId.includes('consent')) {
      action = 'compliance';
    } else if (ruleId.includes('booking') || card?.hasUpcomingBooking) {
      action = 'book';
    } else if (ruleId.includes('journal') || card?.missingJournal) {
      action = 'journal';
    }
    return { label, action };
  }

  function renderV9Zone1PrimaryStepHtml(card, { loading = false } = {}) {
    const { label, action } = resolveV9PrimaryNextStep(card);
    return `
          <button
            type="button"
            class="v9-zone1-primary${loading ? ' is-loading' : ''}"
            data-v9-primary-step="${escapeHtml(action)}"
            aria-label="Nästa steg: ${escapeHtml(label)}"
          >
            <span class="v9-zone1-primary__kicker">Nästa steg</span>
            <span class="v9-zone1-primary__label">${escapeHtml(label)}</span>
          </button>`;
  }

  function renderV9Zone1JumpChipsHtml() {
    return `
          <div class="v9-zone1-jumps" aria-label="Hoppa i dossiér" role="tablist">
            <button type="button" class="v9-zone1-jump" data-v9-jump="upcoming" role="tab" aria-controls="v9-section-upcoming">Besök</button>
            <button type="button" class="v9-zone1-jump" data-v9-jump="journal" role="tab" aria-controls="v9-section-journal">Journal</button>
            <button type="button" class="v9-zone1-jump" data-v9-jump="filer" role="tab" aria-controls="v9-section-filer">Filer</button>
            <button type="button" class="v9-zone1-jump" data-v9-jump="kontakt" role="tab" aria-controls="v9-section-kontakt">Kontakt</button>
          </div>
          <p class="v9-zone1-nav-hint" aria-hidden="true"><kbd>1</kbd>–<kbd>4</kbd> sektioner · <kbd>⌘K</kbd> sök · <kbd>Esc</kbd> stäng</p>`;
  }

  function scrollV9DossierSection(root, key) {
    if (window.CcoV9CustomersParity?.scrollDossierSection) {
      window.CcoV9CustomersParity.scrollDossierSection(root, key);
      return;
    }
    if (!root) return;
    const details = root.querySelector(`[data-v9-section="${key}"]`);
    if (!details) return;
    details.open = true;
    details.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function v9JumpToSection(root, key) {
    const sectionKey = normalizeText(key);
    if (!sectionKey || !root) return;
    const targetTab = V9_SECTION_TAB_JUMP[sectionKey];
    if (targetTab && targetTab !== runtime.detailTab) {
      if (switchDetailTab(targetTab)) {
        window.requestAnimationFrame(() => {
          if (targetTab === 'oversikt') {
            scrollV9DossierSection(root, sectionKey);
          }
        });
      }
      return;
    }
    scrollV9DossierSection(root, sectionKey);
  }

  function bindV9Zone1Handlers(root, ctx) {
    if (!root || !isV9CustomersEnabled()) return;
    const zone = root.querySelector('[data-v9-zone1]');
    if (!zone || zone.dataset.bound === '1') return;
    zone.dataset.bound = '1';

    zone.querySelectorAll('[data-v9-stat-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        v9JumpToSection(root, btn.getAttribute('data-v9-stat-jump') || '');
      });
    });

    zone.querySelectorAll('[data-v9-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        v9JumpToSection(root, btn.getAttribute('data-v9-jump') || '');
      });
    });

    const primary = zone.querySelector('[data-v9-primary-step]');
    if (primary) {
      primary.addEventListener('click', () => {
        const action = primary.getAttribute('data-v9-primary-step') || 'journal';
        if (action === 'book') {
          window.dispatchEvent(
            new CustomEvent('cco:v9-ghost-booking', {
              detail: { source: 'zone1-primary', patientId: ctx.card?.patientId },
            })
          );
          return;
        }
        if (action === 'form') {
          switchDetailTab('journal');
          return;
        }
        if (action === 'compliance') {
          switchDetailTab('profil');
          return;
        }
        switchDetailTab('journal');
      });
    }
  }

  function renderV10DossierHeroHtml(
    card,
    journalEntries = [],
    { loading = false, occasionTimeline = null } = {}
  ) {
    const name = displayNameForList(card);
    const contact = v9DossierContactLine(card);
    const tags = buildV9DossierBadges(card);
    const stats = resolveV9HeroStats(card, journalEntries, occasionTimeline);

    return `
        <div class="v9-dossier-zone1 v10-dossier-zone1" data-v9-zone1>
          <div class="v9-dossier-hero v10-dossier-hero" data-v9-dossier-hero${loading ? ' aria-busy="true"' : ''}>
            <div class="dossier-head">
              <div class="dossier-avatar" style="background:${v9AvatarGradient(name)}">${escapeHtml(v9AvatarInitials(name))}</div>
              <div class="dossier-head-body">
                <div class="dossier-kicker">Kunddossiér</div>
                <h2 class="dossier-name">${escapeHtml(name)}</h2>
                <div class="dossier-contact">${escapeHtml(contact)}</div>
                ${
                  tags.length
                    ? `<div class="dossier-tags">${tags
                        .map(
                          (tag) =>
                            `<span class="dossier-tag dossier-tag--${escapeHtml(tag.kind)}">${escapeHtml(tag.label)}</span>`
                        )
                        .join('')}</div>`
                    : ''
                }
              </div>
              <button type="button" class="dossier-close" data-v9-dossier-close title="Stäng dossiér" aria-label="Stäng dossiér">×</button>
            </div>
            <div class="dossier-stats">
              ${stats
                .map(
                  (stat) => `
                <div class="dossier-stat dossier-stat--${escapeHtml(stat.iconKey || 'neutral')}">
                  <div class="dossier-stat-label">${escapeHtml(stat.label)}</div>
                  <div class="dossier-stat-value">${escapeHtml(stat.value)}</div>
                  <div class="dossier-stat-trend">${escapeHtml(stat.trend)}</div>
                </div>`
                )
                .join('')}
            </div>
          </div>
        </div>`;
  }

  function renderV9DossierHeroHtml(
    card,
    journalEntries = [],
    { loading = false, occasionTimeline = null } = {}
  ) {
    if (usesV10KundkortFacit()) {
      return renderV10DossierHeroHtml(card, journalEntries, { loading, occasionTimeline });
    }
    const name = displayNameForList(card);
    const contact = v9DossierContactLine(card);
    const tags = buildV9DossierBadges(card);
    const stats = resolveV9HeroStats(card, journalEntries, occasionTimeline);
    const phone = card?.primaryPhone || card?.phoneMasked || '';
    const email = card?.primaryEmail || card?.emailMasked || '';

    return `
        <div class="v9-dossier-zone1" data-v9-zone1>
          <div class="v9-dossier-hero" data-v9-dossier-hero${loading ? ' aria-busy="true"' : ''}>
            <div class="dossier-head">
              <div class="dossier-avatar" style="background:${v9AvatarGradient(name)}">${escapeHtml(v9AvatarInitials(name))}</div>
              <div class="dossier-head-body">
                <nav class="v9-dossier-crumb" aria-label="Dossiér-navigering">
                  <button type="button" class="v9-dossier-crumb__back" data-v9-nav-back aria-label="Tillbaka till kundlistan">‹ Kunder</button>
                  <span class="v9-dossier-crumb__sep" aria-hidden="true">/</span>
                </nav>
                <div class="dossier-kicker">Kunddossiér</div>
                <h2 class="dossier-name v9-dossier-crumb__who">${escapeHtml(name)}</h2>
                <div class="dossier-contact">${escapeHtml(contact)}</div>
                ${
                  phone || email
                    ? `<div class="v9-zone1-contact-detail">
                  ${phone ? `<span>${escapeHtml(phone)}</span>` : ''}
                  ${email ? `<span>${escapeHtml(email)}</span>` : ''}
                </div>`
                    : ''
                }
                ${
                  tags.length
                    ? `<div class="dossier-tags">${tags
                        .map(
                          (tag) =>
                            `<span class="dossier-tag dossier-tag--${escapeHtml(tag.kind)}">${escapeHtml(tag.label)}</span>`
                        )
                        .join('')}</div>`
                    : ''
                }
              </div>
              <button type="button" class="dossier-close" data-v9-dossier-close title="Stäng dossiér" aria-label="Stäng dossiér">×</button>
            </div>
            ${renderV9Zone1BlockersHtml(card)}
            ${renderV9JourneyStepperHtml(card)}
            ${renderV9Zone1PrimaryStepHtml(card, { loading })}
            ${renderV9JournalStatusGridHtml(card)}
            <div class="dossier-stats">
              ${stats
                .map(
                  (stat) => `
                <button type="button" class="dossier-stat dossier-stat--jump dossier-stat--${escapeHtml(stat.iconKey || 'neutral')}" data-v9-stat-jump="${escapeHtml(stat.jump || '')}" title="Visa ${escapeHtml(stat.label.toLowerCase())}">
                  <span class="dossier-stat-icon" aria-hidden="true">${escapeHtml(stat.icon || '•')}</span>
                  <div class="dossier-stat-label">${escapeHtml(stat.label)}</div>
                  <div class="dossier-stat-value">${escapeHtml(stat.value)}</div>
                  <div class="dossier-stat-trend">${escapeHtml(stat.trend)}</div>
                </button>`
                )
                .join('')}
            </div>
            ${renderV9Zone1JumpChipsHtml()}
          </div>
        </div>`;
  }

  function renderPatientDetailHero(
    card,
    journalEntries = [],
    { loading = false, occasionTimeline = null } = {}
  ) {
    if (isV9CustomersEnabled()) {
      return renderV9DossierHeroHtml(card, journalEntries, { loading, occasionTimeline });
    }
    const displayName = displayNameForList(card);
    return `
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml(displayName.slice(0, 2).toUpperCase())}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(displayName)}</h2>
              <p class="patient-master-hero-id">${escapeHtml(card?.personnummer || 'Saknar personnummer')}</p>
              <div class="focus-customer-contact-line">
                <span>${escapeHtml(card?.primaryEmail || 'Saknar e-post')}</span>
                <span>${escapeHtml(card?.primaryPhone || 'Saknar telefon')}</span>
              </div>
              ${renderPatientHeroChipRow(card)}
            </div>
            ${renderPatientHeroActions()}
          </div>
        </article>`;
  }

  function closeV9DossierSelection() {
    if (!runtime.selectedPatientId) return;
    if (isMobileViewport()) {
      clearMobilePatientSelection();
      return;
    }
    const previousId = runtime.selectedPatientId;
    resetMobilePatientDetailState();
    renderDetailEmpty();
    syncV9CustomersLayoutState();
    if (!updatePatientRowSelection(previousId, '')) {
      renderPatientRows();
    }
    syncMobilePatientLayout();
    replaceMobilePatientListUrl();
  }

  // Nästa steg som ÅTGÄRD (imperativ) — mappar blocker-statement → vad man gör härnäst
  function nextActionLabel(text) {
    const t = String(text || '').toLowerCase();
    if (/journal sp[äa]rr/.test(t)) return 'Lås upp journal';
    if (/h[äa]lsodek|formul[äa]r/.test(t)) return 'Begär hälsodeklaration';
    if (/friskf[öo]rs/.test(t)) return 'Skicka friskförsäkran';
    if (/foto.?samtycke/.test(t)) return 'Begär foto-samtycke';
    if (/avtal|samtycke/.test(t)) return 'Skicka avtal + samtycke';
    if (/offert|behandlingsplan/.test(t)) return 'Skapa offert';
    if (/journal/.test(t)) return 'Komplettera journal';
    if (/bet[äa]nketid/.test(t)) return 'Inväntar betänketid';
    return text;
  }
  function resolveV9ListSignal(card) {
    const blockers = collectV9Zone1Blockers(card, 1);
    if (blockers.length) {
      let text = nextActionLabel(blockers[0].text);
      if (text.length > 52) text = `${text.slice(0, 49)}…`;
      return { text, tone: blockers[0].tone === 'needs_review' ? 'warn' : 'blocker' };
    }
    if (card?.hasUpcomingBooking && card?.nextBookingAt) {
      const ts = Date.parse(card.nextBookingAt);
      if (Number.isFinite(ts)) {
        const days = Math.ceil((ts - Date.now()) / 86400000);
        if (days >= 0 && days <= 3) {
          return { text: days === 0 ? 'Besök idag' : `Besök om ${days} d`, tone: 'ready' };
        }
      }
      return { text: formatV9ListDate(card.nextBookingAt), tone: 'neutral' };
    }
    return { text: '—', tone: 'neutral' };
  }

  function resolveV9NextStepToneClass(tone) {
    if (tone === 'blocker') return 'block';
    if (tone === 'legal_blocker') return 'legal';
    if (tone === 'needs_review') return 'warn';
    return tone || 'neutral';
  }

  // Behandlings-kur-progress (bara kur-typer PRP/microneedling) — klinik-standard planerat antal.
  // done = completedVisitCount (proxy: totala besök), capped till planerat.
  function v9TreatmentCycle(card) {
    const t = asArray(card && card.treatmentTypes)
      .join(' ')
      .toLowerCase();
    let planned = 0;
    let label = '';
    if (/prp/.test(t)) {
      planned = 6;
      label = 'PRP';
    } else if (/microneedl|dermapen/.test(t)) {
      planned = 4;
      label = 'Microneedling';
    }
    if (!planned) return null; // transplant/konsultation → ingen kur-progress
    const done = Math.max(0, Math.min(Number(card.completedVisitCount) || 0, planned));
    if (done <= 0) return null;
    return { label, done, planned };
  }

  function renderV9PatientRowHtml(card, selected) {
    const name = displayNameForList(card);
    const treatment =
      asArray(card.treatmentTypes).length > 0
        ? card.treatmentTypes.join(', ')
        : card.nextBookingType || (card.hasJournal ? 'Journal' : '');
    const revenue = resolveV9Revenue(card);
    const signal = resolveV9ListSignal(card);
    const age = resolvePatientAgeYears(card);
    // 9-stegs-position härledd ur list-flaggorna (Nästa steg-pillen ger exakt åtgärd)
    const jStep =
      card.missingHealthDeclaration || card.missingForm
        ? { n: 2, tone: 'amber' }
        : card.missingJournal || !card.hasJournalHistory
          ? { n: 3, tone: 'info' }
          : card.missingAgreement
            ? { n: 7, tone: 'purple' }
            : card.hasUpcomingBooking
              ? { n: 8, tone: 'teal' }
              : { n: 9, tone: 'ok' };
    // 7-kol: avatar · Kund · Besök · Kontakt · Steg · LTV · Nästa steg · chevron
    const contactEmail = card.contactEmail || card.primaryEmail || '';
    const contactPhone = card.contactPhone || card.primaryPhone || '';
    const contactHtml =
      contactEmail || contactPhone
        ? `<div class="cr-contact-email">${escapeHtml(contactEmail)}</div><div class="cr-contact-phone">${escapeHtml(contactPhone)}</div>`
        : '—';
    // "Saknar formulär" tas bort här — dubblerar Nästa steg-pillen ("Formulär saknas före besök")
    const tags = buildV9RowBadges(card).filter((t) => t.label !== 'Saknar formulär');
    const cycle = v9TreatmentCycle(card);
    const tagBits =
      tags
        .map(
          (t) => `<span class="cr-tag cr-tag--${escapeHtml(t.kind)}">${escapeHtml(t.label)}</span>`
        )
        .join('') +
      (cycle
        ? `<span class="cr-tag cr-tag--cycle">${escapeHtml(`${cycle.label} ${cycle.done}/${cycle.planned}`)}</span>`
        : '');
    const ageHtml =
      age != null ? `<div class="cr-meta-sub cr-age">${escapeHtml(`${age} år`)}</div>` : '';
    const treatmentHtml = treatment
      ? `<div class="cr-meta-sub cr-treatment">${escapeHtml(treatment)}</div>`
      : '';
    const visitBadgesHtml = tagBits
      ? `<div class="cr-visit-badges">${tagBits}</div>`
      : '<div class="cr-visit-date">—</div>';
    const stepStatus = resolveV9StepStatus(jStep);
    const signalTone = resolveV9NextStepToneClass(signal.tone || 'neutral');

    return `
          <button
            class="customer-row customer-row--gloss cr-v10${selected ? ' is-selected' : ''}"
            type="button"
            data-patient-row="${escapeHtml(card.patientId)}"
            aria-pressed="${selected ? 'true' : 'false'}"
          >
            <span class="cr-avatar cr-avatar--gloss" style="background:${v9AvatarGradient(name)}">${escapeHtml(v9AvatarInitials(name))}</span>
            <div class="cr-name-block">
              <div class="cr-name">${escapeHtml(name)}</div>
              ${ageHtml}
              ${treatmentHtml}
            </div>
            <div class="cr-last-visit">
              ${visitBadgesHtml}
            </div>
            <div class="cr-contact">${contactHtml}</div>
            <div><span class="cr-status" data-state="${escapeHtml(stepStatus.state)}"><span class="dot"></span>${escapeHtml(stepStatus.label)}</span></div>
            <div class="cr-ltv">
              <div class="cr-revenue">${escapeHtml(revenue.main)}</div>
              ${revenue.potential ? `<div class="cr-meta-sub cr-revenue-pot">${escapeHtml(revenue.potential)}</div>` : ''}
              ${revenue.trend ? `<div class="cr-revenue-trend cr-revenue-trend--${escapeHtml(revenue.trendTone || 'neutral')}">${escapeHtml(revenue.trend)}</div>` : ''}
            </div>
            <div><span class="cr-next-text cr-next-text--${escapeHtml(signalTone)}">${escapeHtml(signal.text)}</span></div>
            <div class="cr-arrow" aria-hidden="true">›</div>
          </button>
        `;
  }

  function renderV9ListHeaderHtml() {
    return `
          <div class="customer-row-head cr-v10-head" aria-hidden="true">
            <div></div>
            <div>Kund</div>
            <div>Besök</div>
            <div>Kontakt</div>
            <div>Steg</div>
            <div>LTV</div>
            <div>Nästa steg</div>
            <div></div>
          </div>
        `;
  }

  function resolveV9ListMountTarget() {
    if (!els.list || !isV9CustomersEnabled()) return els.list;
    let body = els.list.querySelector('[data-patient-list-body]');
    if (!body) {
      els.list.innerHTML = `${renderV9ListHeaderHtml()}<div data-patient-list-body></div>`;
      body = els.list.querySelector('[data-patient-list-body]');
    }
    return body || els.list;
  }

  function renderPatientRowHtml(card, selected) {
    if (isV9CustomersEnabled()) {
      return renderV9PatientRowHtml(card, selected);
    }
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
                <h3>${escapeHtml(displayNameForList(card))}</h3>
                ${
                  journalCount || imageCount
                    ? `<span class="customer-record-file-badge">${journalCount} PDF · ${imageCount} bild</span>`
                    : ''
                }
              </div>
              <div class="customer-record-meta">
                ${
                  card.personnummer
                    ? `<span>${escapeHtml(card.personnummer)}</span>`
                    : '<span class="customer-record-meta-rose">Saknar pnr</span>'
                }
                ${
                  card.matchStatus === 'matched'
                    ? '<span class="customer-record-match">Kopplad</span>'
                    : ''
                }
              </div>
            </div>
          </button>
        `;
  }

  function patientsForListRender() {
    return sortPatientsForV9Display(runtime.patients);
  }

  function sortPatientsForV9Display(patients) {
    const sorted = [...(patients || [])];
    if (!isV9CustomersEnabled()) return sorted;
    const key = runtime.v9SortKey || 'activity';
    sorted.sort((a, b) => {
      if (key === 'name') {
        return displayNameForList(a).localeCompare(displayNameForList(b), 'sv');
      }
      if (key === 'revenue') {
        return (
          Number(b.lifetimeValue ?? b.dealValue ?? 0) - Number(a.lifetimeValue ?? a.dealValue ?? 0)
        );
      }
      const ta = Date.parse(a.lastVisitAt || a.lastBookingAt || a.updatedAt || 0) || 0;
      const tb = Date.parse(b.lastVisitAt || b.lastBookingAt || b.updatedAt || 0) || 0;
      return tb - ta;
    });
    return sorted;
  }

  function syncV9ListChromeLocal() {
    if (!isV9CustomersEnabled()) return;
    resolveElements();
    if (els.list) els.list.setAttribute('data-v9-list-view', runtime.v9ListView || 'list');
    const sortBtn = document.querySelector('[data-v9-sort-trigger]');
    if (sortBtn) {
      const labels = window.CcoV9CustomersParity?.SORT_LABELS || {
        activity: '⇅ Senaste aktivitet',
        name: '⇅ Namn A–Ö',
        revenue: '⇅ Intäkt (LTV)',
      };
      sortBtn.textContent = labels[runtime.v9SortKey] || labels.activity;
    }
    const viewBtn = document.querySelector('[data-v9-view-toggle]');
    if (viewBtn) {
      const grid = runtime.v9ListView === 'grid';
      viewBtn.textContent = grid ? '▦ Rutnät' : '≡ Lista';
      viewBtn.setAttribute('aria-pressed', grid ? 'false' : 'true');
    }
  }

  function renderPatientRows() {
    if (!els.list || runtime.mode !== 'register') return;
    if (syncAuthRequiredChrome()) {
      const authCard = runtime.pendingPasswordSetup
        ? renderStaffPasswordSetupCard()
        : renderStaffLoginCard(runtime.error || 'Logga in för att läsa kundregister och journal.');
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

    patientListVirtualHandle?.destroy?.();
    patientListVirtualHandle = null;

    const listMount = isV9CustomersEnabled() ? resolveV9ListMountTarget() : els.list;
    if (!isV9CustomersEnabled() && els.list.querySelector('[data-patient-list-body]')) {
      els.list.innerHTML = '';
    }

    const listPatients = patientsForListRender();
    const hasMore = listPatients.length < runtime.total;
    const footer = hasMore
      ? `<button class="customers-utility-button patient-master-load-more" type="button" data-patient-load-more>Visa fler (${listPatients.length}/${runtime.total})</button>`
      : runtime.total
        ? `<p class="patient-master-list-meta">${runtime.total} kunder totalt</p>`
        : '';

    const virtual = window.ArcanaCcoPatientListVirtual;
    const rowHeightPx = isV9CustomersEnabled() ? V9_LIST_ROW_HEIGHT_PX : undefined;
    if (virtual?.mountVirtualPatientList) {
      patientListVirtualHandle = virtual.mountVirtualPatientList({
        container: listMount,
        items: listPatients,
        selectedId: runtime.selectedPatientId,
        renderRowHtml: (card, selected) => renderPatientRowHtml(card, selected),
        rowHeightPx,
      });
      if (footer) {
        const footerHost = isV9CustomersEnabled() ? els.list : listMount;
        const footerEl = document.createElement('div');
        footerEl.className = 'patient-master-list-footer';
        footerEl.innerHTML = footer;
        footerHost.appendChild(footerEl);
      }
    } else {
      const rows = listPatients
        .map((card) => renderPatientRowHtml(card, card.patientId === runtime.selectedPatientId))
        .join('');
      if (isV9CustomersEnabled()) {
        listMount.innerHTML = rows;
        if (footer) {
          const footerEl = document.createElement('div');
          footerEl.className = 'patient-master-list-footer';
          footerEl.innerHTML = footer;
          els.list.appendChild(footerEl);
        }
      } else {
        els.list.innerHTML = rows + footer;
      }
    }
    syncV9ListChromeLocal();
    window.CcoKundkortKkx?.sanitizeCustomerListScope?.();
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
      const row = els.list.querySelector(`[data-patient-row="${escapeSelectorValue(patientId)}"]`);
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
    if (isV9CustomersEnabled()) {
      renderV9AggregatePanel();
      clearBlueprintWorkspace();
      syncV9CustomersLayoutState();
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
    const cached = mergeCardWithShellEnrichment(
      runtime.patients.find(
        (row) => normalizeText(row?.patientId) === normalizeText(patientId)
      ) || { patientId, displayName: 'Laddar kund…' },
      patientId,
      runtime.detail?.journalEntries
    );
    const heroHtml = isV9CustomersEnabled()
      ? renderV9DossierHeroHtml(cached, [], { loading: true })
      : (() => {
          const displayName = cached?.displayName || 'Laddar kund…';
          const initials = String(displayName).slice(0, 2).toUpperCase();
          return `
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml(initials)}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(displayName)}</h2>
              <p class="patient-master-muted patient-master-loading-line">Hämtar kundkort…</p>
            </div>
          </div>
        </article>`;
        })();
    rail.innerHTML = `
      <section class="patient-master-card patient-master-card-loading" data-patient-detail data-patient-loading="true" aria-busy="true">
        ${heroHtml}
        ${renderPatientDetailTabsMarkup(runtime.detailTab, 0, { ariaHidden: true })}
        ${renderPatientDetailBodyOpen()}
        <div class="patient-master-detail-skeleton" aria-hidden="true">
          <div class="patient-master-detail-skeleton-bar"></div>
          <div class="patient-master-detail-skeleton-bar is-short"></div>
          <div class="patient-master-detail-skeleton-bar"></div>
        </div>
        ${renderPatientDetailBodyClose()}
      </section>
    `;
    syncV9CustomersLayoutState();
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

  async function mountScalpAnalysisPanel(root = els.patientRail) {
    if (!isAisiaScalpAnalysisEnabled()) return;
    if (!root || !window.CcoScalpAnalysis?.mount) return;
    const mountEl = root.querySelector('[data-scalp-analysis-mount]');
    const patientId = normalizeText(
      mountEl?.dataset?.scalpAnalysisMount || runtime.selectedPatientId
    );
    if (!mountEl || !patientId) return;
    if (runtime.scalpAnalysisPatientId === patientId && runtime.scalpAnalysisMount) return;
    runtime.scalpAnalysisMount?.unmount?.();
    runtime.scalpAnalysisMount = await window.CcoScalpAnalysis.mount(mountEl, {
      patientId,
      tenantId: runtime.tenantId || 'hairtpclinic',
      baseUrl: '',
    });
    runtime.scalpAnalysisPatientId = patientId;
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
              const label = escapeHtml(
                repairDisplayFilename(file.fileName || file.relativePath || 'PDF')
              );
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
              const label = escapeHtml(
                repairDisplayFilename(file.fileName || file.relativePath || 'Fil')
              );
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
          ${
            metaBits.length
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
    const parity = window.CcoV9CustomersParity;
    if (isV9CustomersEnabled() && usesV10KundkortFacit() && parity?.renderV10DriveFilesHtml) {
      return groupFilesByOccasion(rows)
        .map(
          (group) => `
        <details class="dossier-section v9-dossier-section" open>
          <summary>${escapeHtml(group.timelineLabel)} <span class="count">${group.files.length}</span></summary>
          ${parity.renderV10DriveFilesHtml(group.files, card)}
        </details>`
        )
        .join('');
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

  function renderScalpImagingCallout() {
    if (!isAisiaScalpAnalysisEnabled()) return '';
    const ps = runtime.scalpProtocolStatus;
    if (!ps) {
      return `
      <article class="focus-customer-data-card patient-master-workflow-card" data-scalp-imaging-callout>
        <h4>Aisia / hårscalpanalys</h4>
        <p class="patient-master-muted">Laddar imaging-status…</p>
      </article>`;
    }
    const ic = ps.imagingChecklist || {};
    const preOp = ps.protocol || {};
    const steps = [
      { label: 'Baseline hår-/scalpanalys', done: !!ic.baselineComplete },
      { label: 'Donor vänster', done: !!ic.donorLeft },
      { label: 'Donor höger', done: !!ic.donorRight },
      { label: 'Analys verifierad av behandlare', done: !!ic.analysisVerified },
    ];
    const gateLines = [];
    if (preOp.baselineImagingRequired) gateLines.push('Pre-op: baseline imaging saknas');
    if (preOp.donorRecipientImagesRequired)
      gateLines.push('Pre-op: donor/recipient-bilder ofullständiga');
    if (preOp.analysisVerifiedRequired) gateLines.push('Analys väntar på verifiering');
    const protocolMsgs = asArray(preOp.messages).slice(0, 4);
    return `
      <article class="focus-customer-data-card patient-master-workflow-card" data-scalp-imaging-callout>
        <div class="patient-master-material-head">
          <h4>Aisia / hårscalpanalys</h4>
          <button type="button" class="customers-utility-button" data-patient-tab-jump="scalpanalys">
            Öppna Hår-/scalpanalys →
          </button>
        </div>
        <p class="patient-master-muted">Stöd i konsultation och pre-op — ingen automatisk diagnos. Slutlig bedömning görs av behandlare.</p>
        <ol class="patient-master-workflow-steps">
          ${steps
            .map(
              (step) =>
                `<li class="${step.done ? 'is-done' : ''}">${escapeHtml(step.label)}${
                  step.done ? ' ✓' : ''
                }</li>`
            )
            .join('')}
        </ol>
        ${
          gateLines.length
            ? `<ul class="patient-master-workflow-steps">${gateLines
                .map((m) => `<li>${escapeHtml(m)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${
          protocolMsgs.length
            ? `<ul class="patient-master-workflow-steps">${protocolMsgs
                .map((m) => `<li>${escapeHtml(m)}</li>`)
                .join('')}</ul>`
            : ''
        }
      </article>`;
  }

  async function loadScalpProtocolStatus(patientId) {
    if (!isAisiaScalpAnalysisEnabled()) return;
    const id = normalizeText(patientId);
    if (!id) return;
    try {
      const response = await fetch(
        `/api/v1/cco/scalp-analysis/patient/${encodeURIComponent(id)}/protocol-status`,
        { credentials: 'same-origin', headers: { 'x-cco-role': 'operator' } }
      );
      if (!response.ok) return;
      runtime.scalpProtocolStatus = await response.json();
      const callout = document.querySelector('[data-scalp-imaging-callout]');
      if (callout && runtime.selectedPatientId === id) {
        callout.outerHTML = renderScalpImagingCallout();
      }
    } catch (error) {
      console.warn('Scalp protocol-status misslyckades.', error);
    }
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
                `<li class="${step.done ? 'is-done' : ''}">${escapeHtml(step.label)}${
                  step.done ? ' ✓' : ''
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
          Hälsodekl TP
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-clinical-form" data-clinical-form-key="health_curatiio_bleph">
          Hälsodekl ögonlock
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-clinical-form" data-clinical-form-key="health_curatiio_ortho">
          Hälsodekl ortopedi
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-clinical-form" data-clinical-form-key="health_curatiio_injection">
          Hälsodekl injektion
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-clinical-form" data-clinical-form-key="health_eng">
          Hälsodekl ENG
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-fitness-certificate">
          Friskförsäkran TP
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-clinical-form" data-clinical-form-key="fitness_curatiio_bleph">
          Friskförsäkran ögonlock
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-tp-journal">
          TP-journal
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-prp-journal" data-prp-form-variant="prp_skin">
          PRP-journal
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-prp-journal" data-prp-form-variant="tp_post_op">
          PRP efter TP
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-follow-up-journal" data-follow-form-variant="4_manader">
          Uppföljning 4 mån
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-follow-up-journal" data-follow-form-variant="6_manader">
          Uppföljning 6 mån
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-follow-up-journal" data-follow-form-variant="12_manader">
          Uppföljning 12 mån
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-bleph-journal">
          Ögonlocksjournal
        </button>
      </div>
      ${
        uploadBlocked
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
                `<option value="${escapeHtml(template.key)}"${
                  template.key === selectedKey ? ' selected' : ''
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

    shell
      .querySelector('[data-mobile-offer-wizard-cancel]')
      ?.addEventListener('click', closeMobileOfferWizard);
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
        asArray(runtime.offerTemplates).find((item) => item.key === formValues.templateKey)
          ?.label || formValues.templateKey;
      const summary = shell.querySelector('[data-mobile-offer-wizard-summary]');
      if (summary) {
        const noteBits = [
          formValues.notesToCustomer ? `Till kund: ${formValues.notesToCustomer}` : '',
          formValues.internalNotes ? `Internt: ${formValues.internalNotes}` : '',
        ].filter(Boolean);
        summary.textContent = `Offert på ${formValues.quotedAmount || '—'}${
          formValues.depositAmount ? ` med deposition ${formValues.depositAmount}` : ''
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
            ${
              linkedOffer
                ? `<span class="patient-master-occasion-badge is-compact">${escapeHtml(linkedOffer.quoteStatus || 'draft')}</span>`
                : ''
            }
          </div>
          ${
            linkedOffer
              ? `<p class="patient-master-muted">${escapeHtml(linkedOffer.offerType || 'Offert')} · ${escapeHtml(linkedOffer.quotedAmount || 'Pris ej satt')}</p>`
              : `<p class="patient-master-muted">Skapa offert från planen när bilder är markerade och planen är klar.</p>`
          }
          ${renderOfferStatusMeta(linkedOffer)}
          ${renderOfferTemplateSelect(linkedOffer?.offerTemplateKey || 'custom')}
          <div class="patient-master-plan-photo-actions">
            <button type="button" class="customers-utility-button" data-patient-action="create-offer-from-plan" data-patient-entry-id="${escapeHtml(planEntry.entryId)}">
              ${linkedOffer ? 'Uppdatera offert från plan' : 'Skapa offert från plan'}
            </button>
            ${
              offerDocumentUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerDocumentUrl)}" target="_blank" rel="noopener">Visa offert</a>`
                : ''
            }
            ${
              offerPdfUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerPdfUrl)}" target="_blank" rel="noopener">Ladda ner PDF</a>`
                : ''
            }
            ${
              offerWordUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerWordUrl)}" target="_blank" rel="noopener">Word-mall</a>`
                : ''
            }
            ${
              canSendForSign
                ? `<button type="button" class="customers-utility-button" data-patient-action="send-offer-for-sign">Skicka för signering</button>`
                : ''
            }
            ${
              canAccept
                ? `<button type="button" class="customers-utility-button" data-patient-action="accept-offer"${coolingActive ? ' data-patient-force-offer="1"' : ''}>${
                    coolingActive ? 'Acceptera (override betänketid)' : 'Kund accepterar'
                  }</button>`
                : ''
            }
          </div>
          ${
            runtime.offerSignUrl
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
        ${
          summaryBits.length
            ? `<p class="patient-master-muted">${escapeHtml(summaryBits.join(' · '))}</p>`
            : ''
        }
        ${
          fields.notes
            ? `<p class="patient-master-plan-notes"><strong>Till kund:</strong> ${escapeHtml(fields.notes)}</p>`
            : ''
        }
        ${
          fields.staffNotes
            ? `<p class="patient-master-plan-notes patient-master-plan-notes-internal"><strong>Internt:</strong> ${escapeHtml(fields.staffNotes)}</p>`
            : ''
        }
        ${
          fields.bookingSlotStart || planEntry.treatmentEncounterId
            ? `<p class="patient-master-muted">Bokning: ${escapeHtml(fields.bookingSlotStart || '—')}${fields.bookingServiceId ? ` · ${escapeHtml(fields.bookingServiceId)}` : ''}${planEntry.treatmentEncounterId ? ` · tillfälle ${escapeHtml(planEntry.treatmentEncounterId.slice(0, 8))}` : ''}</p>`
            : ''
        }
        ${
          photos.length
            ? `<div class="patient-master-plan-photo-toolbar">
                <span class="patient-master-muted">${photos.length} bilder</span>
                ${
                  planEntry.canEdit
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
                          ${
                            planEntry.canEdit
                              ? `<button type="button" class="patient-master-plan-photo-remove" data-patient-delete-photo="${escapeHtml(photo.photoId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-attachment-id="${escapeHtml(photo.attachmentId)}" aria-label="Ta bort bild" title="Ta bort bild"><span aria-hidden="true">×</span></button>`
                              : ''
                          }
                        </div>
                        <figcaption>
                          <strong>${escapeHtml(photo.label || photo.fileName || 'Bild')}</strong>
                          ${
                            photo.hasAnnotation
                              ? '<span class="patient-master-occasion-badge is-compact">Markerad</span>'
                              : ''
                          }
                        </figcaption>
                        <div class="patient-master-plan-photo-actions">
                          ${
                            planEntry.canEdit
                              ? `<button type="button" class="customers-utility-button" data-patient-annotate-photo="${escapeHtml(photo.attachmentId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-photo-id="${escapeHtml(photo.photoId)}">Markera plan</button>`
                              : ''
                          }
                          ${
                            planEntry.canEdit
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
        ${
          planEntry.canSign
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

  function findBlephJournalEntry(entries, entryId) {
    if (!entryId) return null;
    return (
      asArray(entries).find(
        (entry) => entry.journalType === 'bleph_treatment' && entry.entryId === entryId
      ) || null
    );
  }

  function bindJournalAutosaveForms() {
    if (!isCompactFormViewport() || !window.ArcanaMobileAutosave?.bindForm) return;
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
              formVariant: config.formVariant,
              sourceQuestionaryId: config.meridiqQuestionaryId,
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
      const config = tpForm.config || {};
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
              formVariant: config.formVariant || 'hair_tp',
              sourceQuestionaryId: config.meridiqQuestionaryId || 16411,
              title: config.title || 'TP behandlingsjournal',
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
      const formVariant =
        normalizeText(form.dataset.prpFormVariant) ||
        normalizeText(entryRoot?.dataset?.prpFormVariant) ||
        'prp_skin';
      const config = prpForm.forms?.[formVariant] || prpForm.resolveForm?.({ formVariant }) || {};
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
              formVariant: config.formVariant || formVariant,
              sourceQuestionaryId: config.meridiqQuestionaryId,
              title: config.title || 'PRP behandlingsjournal',
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
      const formVariant =
        normalizeText(form.dataset.followFormVariant) ||
        normalizeText(entryRoot?.dataset?.followFormVariant) ||
        '4_manader';
      const config =
        followForm.forms?.[formVariant] || followForm.resolveForm?.({ formVariant }) || {};
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
              formVariant: config.formVariant || formVariant,
              sourceQuestionaryId: config.meridiqQuestionaryId,
              title: config.title || 'Uppföljning',
              fields,
            },
          });
        },
      });
      window.ArcanaMobileAutosave.initMobileStepper(form);
    });

    document.querySelectorAll('[data-bleph-journal-save-form]').forEach((form) => {
      const entryId = normalizeText(form.dataset.blephEntryId) || runtime.editingBlephEntryId;
      const blephForm = window.ArcanaJournalBlephForm;
      if (!blephForm?.readForm || !entryId) return;
      const entryRoot = form.querySelector('[data-bleph-journal-form]');
      const config = blephForm.config || {};
      window.ArcanaMobileAutosave.bindForm(form, {
        patientId,
        entryId,
        formKey: 'bleph_treatment',
        readFields: () => blephForm.readForm(entryRoot),
        onSync: async (fields) => {
          await apiRequest('/api/v1/cco-journal/entry', {
            method: 'PUT',
            body: {
              patientId,
              entryId,
              personnummer: card.personnummer || '',
              journalType: 'bleph_treatment',
              formVariant: config.formVariant || 'curatiio_bleph',
              sourceQuestionaryId: config.meridiqQuestionaryId || 16388,
              title: config.title || 'Ögonlocksjournal',
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
    const parsed = window.ArcanaJournalClinicalFormKeys?.parseFormKey?.(formKey);
    const config = window.ArcanaJournalClinicalForms?.[formKey];
    if (!formKey || !entryId || !config?.render) return '';
    const entry = asArray(entries).find((row) => {
      if (row.entryId !== entryId || row.journalType !== config.journalType) return false;
      if (parsed?.formVariant && row.formVariant && row.formVariant !== parsed.formVariant)
        return false;
      return true;
    });
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
        ${config.render(entry, { locked: entry.locked, mobileSteps: isCompactFormViewport() })}
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
        ${tpForm.render(entry, { locked: entry.locked, mobileSteps: isCompactFormViewport() })}
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
      <form class="patient-master-tp-form-wrap" data-prp-journal-save-form data-prp-entry-id="${escapeHtml(entry.entryId)}" data-prp-form-variant="${escapeHtml(entry.formVariant || 'prp_skin')}">
        ${prpForm.render(entry, { locked: entry.locked, mobileSteps: isCompactFormViewport() })}
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
      <form class="patient-master-tp-form-wrap" data-follow-journal-save-form data-follow-entry-id="${escapeHtml(entry.entryId)}" data-follow-form-variant="${escapeHtml(entry.formVariant || '4_manader')}">
        ${followForm.render(entry, { locked: entry.locked, mobileSteps: isCompactFormViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderBlephJournalSection(entries) {
    const blephForm = window.ArcanaJournalBlephForm;
    if (!blephForm?.render || !runtime.editingBlephEntryId) return '';
    const entry = findBlephJournalEntry(entries, runtime.editingBlephEntryId);
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
      <form class="patient-master-tp-form-wrap" data-bleph-journal-save-form data-bleph-entry-id="${escapeHtml(entry.entryId)}">
        ${blephForm.render(entry, { locked: entry.locked, mobileSteps: isCompactFormViewport() })}
        ${signFooter}
      </form>
    `;
  }

  function renderMobileJournalSteps(entries) {
    if (!isCompactFormViewport()) return '';
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
    const blephSectionRaw = renderBlephJournalSection(rows);
    const blephSection = blephSectionRaw
      ? wrapJournalCollapse('Ögonlocksjournal', blephSectionRaw, { open: true })
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
            const isBlephEntry = entry.journalType === 'bleph_treatment';
            const isHealthEntry = entry.journalType === 'health_declaration';
            const isFitnessEntry = entry.journalType === 'fitness_certificate';
            const isClinicalEntry = isHealthEntry || isFitnessEntry;
            const typeLabel =
              JOURNAL_TYPE_LABELS[entry.journalType] || entry.journalType || 'Journal';
            const isEditingTp = isTpEntry && runtime.editingTpEntryId === entry.entryId;
            const isEditingPrp = isPrpEntry && runtime.editingPrpEntryId === entry.entryId;
            const isEditingFollowUp =
              isFollowUpEntry && runtime.editingFollowUpEntryId === entry.entryId;
            const isEditingBleph = isBlephEntry && runtime.editingBlephEntryId === entry.entryId;
            const isEditingClinical =
              isClinicalEntry &&
              runtime.editingClinicalEntryId === entry.entryId &&
              runtime.editingClinicalFormKey ===
                (window.ArcanaJournalClinicalFormKeys?.resolveEntryFormKey(entry) ||
                  (isHealthEntry ? 'health' : 'fitness'));
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
            const blephOpenButton =
              isBlephEntry && runtime.detail?.card?.patientId
                ? `<button type="button" class="customers-utility-button${isEditingBleph ? ' is-active' : ''}" data-patient-open-bleph="${escapeHtml(entry.entryId)}">${isEditingBleph ? 'Öppen' : 'Öppna'}</button>`
                : '';
            const clinicalFormKey =
              window.ArcanaJournalClinicalFormKeys?.resolveEntryFormKey(entry) ||
              (isHealthEntry ? 'health' : 'fitness');
            const clinicalOpenButton =
              isClinicalEntry && runtime.detail?.card?.patientId
                ? `<button type="button" class="customers-utility-button${isEditingClinical ? ' is-active' : ''}" data-patient-open-clinical="${escapeHtml(clinicalFormKey)}:${escapeHtml(entry.entryId)}">${isEditingClinical ? 'Öppen' : 'Öppna'}</button>`
                : '';
            const signButton =
              entry.canSign &&
              runtime.detail?.card?.patientId &&
              !isEditingTp &&
              !isEditingPrp &&
              !isEditingFollowUp &&
              !isEditingBleph &&
              !isEditingClinical
                ? `<button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">Signera</button>`
                : '';
            return `
              <li class="patient-master-journal-item${entry.locked ? ' is-locked' : ''}${isEditingTp || isEditingPrp || isEditingFollowUp || isEditingBleph || isEditingClinical ? ' is-editing' : ''}">
                <div>
                  <strong>${escapeHtml(entry.title || typeLabel)}</strong>
                  <span>${escapeHtml(entry.status || 'draft')}${entry.signedAt ? ` · signerad ${escapeHtml(String(entry.signedAt).slice(0, 10))}` : ''}</span>
                  ${openLink}
                </div>
                <div class="patient-master-journal-actions">
                  ${
                    entry.journalType === 'historical_import' || entry.source === 'drive_import'
                      ? chipHtml('Importerad', 'gold')
                      : entry.locked
                        ? chipHtml('Låst', 'violet')
                        : chipHtml('Utkast', 'blue')
                  }
                  ${tpOpenButton}
                  ${prpOpenButton}
                  ${followUpOpenButton}
                  ${blephOpenButton}
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
      ${blephSection}
      ${
        otherEntries.some((entry) => entry.journalType === 'tp_treatment')
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

    const agreementStepTitles = [
      'Patientinformation (bilaga 1)',
      'Offert accepterad',
      'Avtal skapat',
      'Signerat — bokningsbart',
    ];
    const agreementStepDone = [
      Boolean(readout?.patientInfoSent),
      Boolean(offerAccepted),
      Boolean(agreement?.agreementDocumentId),
      Boolean(readout?.bookable),
    ];

    const headerHtml = `
        <div class="patient-master-material-head">
          <h4>Behandlingsavtal</h4>
          ${
            readout?.phase
              ? `<span class="patient-master-occasion-badge is-compact">${escapeHtml(readout.phase)}</span>`
              : ''
          }
        </div>`;

    const checklistHtml = `
        <ol class="patient-master-agreement-checklist patient-master-workflow-steps">
          <li class="${readout?.patientInfoSent ? 'is-done' : ''}">Patientinformation (bilaga 1)</li>
          <li class="${offerAccepted ? 'is-done' : ''}">Offert accepterad</li>
          <li class="${agreement?.agreementDocumentId ? 'is-done' : ''}">Avtal skapat</li>
          <li class="${readout?.bookable ? 'is-done' : ''}">Signerat — bokningsbart</li>
        </ol>`;

    const badgesHtml = `
        ${
          readout?.patientInfoSentAt
            ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge">Patientinfo ${escapeHtml(String(readout.patientInfoSentAt).slice(0, 10))}</span></div>`
            : ''
        }
        ${
          agreement?.deliveryMode
            ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge is-accent">${escapeHtml(agreement.deliveryMode === 'distans' ? 'Distans (betänketid)' : 'På plats')}</span></div>`
            : ''
        }
        ${
          coolingActive
            ? `<div class="patient-master-offer-meta-badges"><span class="patient-master-status-badge">Betänketid till ${escapeHtml(String(readout.coolingOff.endsAt).slice(0, 10))}</span></div>`
            : ''
        }`;

    const documentLinksHtml = `
        ${
          runtime.agreementDocumentUrl
            ? `<p class="patient-master-muted"><a href="${escapeHtml(runtime.agreementDocumentUrl)}" target="_blank" rel="noopener">Öppna avtal (HTML)</a>${
                runtime.agreementDocumentPdfUrl
                  ? ` · <a href="${escapeHtml(runtime.agreementDocumentPdfUrl)}" target="_blank" rel="noopener">PDF</a>`
                  : ''
              }</p>`
            : ''
        }
        ${
          runtime.agreementSignUrl
            ? `<p class="patient-master-muted"><a href="${escapeHtml(runtime.agreementSignUrl)}" target="_blank" rel="noopener">Signeringssida för kund</a></p>`
            : ''
        }
        ${
          angerUrl
            ? `<p class="patient-master-muted"><a href="${escapeHtml(angerUrl)}" target="_blank" rel="noopener">Konsumentverkets ångerblankett (bilaga 3)</a></p>`
            : ''
        }`;

    const bookingHtml = readout?.bookable
      ? `<div class="patient-master-booking-ready">
                <p class="patient-master-muted"><strong>Behandlingsbokning öppen.</strong> Boka behandlingstid i CCO-tråden med kundens e-post (${escapeHtml(card?.primaryEmail || 'saknas')}). Endast behandlingstjänster (FUE/DHI m.fl.) — inte konsultation.</p>
              </div>`
      : `<p class="patient-master-muted">Behandlingsbokning spärrad tills avtalet är signerat och bokningsbart.</p>`;

    if (isCompactFormViewport()) {
      const activeStepIndex = Math.max(
        0,
        agreementStepDone.findIndex((done) => !done) === -1
          ? agreementStepTitles.length - 1
          : agreementStepDone.findIndex((done) => !done)
      );
      return `
      <div data-agreement-mobile-shell class="patient-master-agreement-mobile-shell" data-journal-active-step="${activeStepIndex}">
        <article class="focus-customer-data-card patient-master-agreement-card">
          ${headerHtml}
          <div class="cco-clinical-mobile-stepper" data-agreement-stepper>
            <div class="cco-clinical-mobile-stepper-head">
              <p class="cco-clinical-mobile-stepper-progress" data-agreement-step-progress aria-live="polite">
                Steg ${activeStepIndex + 1} av ${agreementStepTitles.length}
              </p>
              <p class="cco-clinical-mobile-stepper-title" data-agreement-step-title>
                ${escapeHtml(agreementStepTitles[activeStepIndex] || '')}
              </p>
            </div>
            <div class="cco-clinical-mobile-stepper-actions">
              <button type="button" class="customers-utility-button" data-agreement-step-prev disabled>
                Föregående
              </button>
              <button type="button" class="customers-utility-button" data-agreement-step-next>
                Nästa
              </button>
            </div>
          </div>
          <section
            class="patient-master-agreement-step cco-clinical-step-panel"
            data-agreement-step-panel="0"
            data-step-title="${escapeHtml(agreementStepTitles[0])}"
            ${activeStepIndex === 0 ? '' : ' hidden'}
          >
            <p class="patient-master-next-action">${escapeHtml(nextActionLabel)}</p>
            ${checklistHtml}
            <div class="patient-master-plan-photo-actions">
              <a class="customers-utility-button" href="${escapeHtml(patientInfoPdf)}" target="_blank" rel="noopener">Bilaga 1 PDF</a>
              <button type="button" class="customers-utility-button" data-patient-action="send-patient-info">Logga skickad patientinfo</button>
            </div>
            ${badgesHtml}
          </section>
          <section
            class="patient-master-agreement-step cco-clinical-step-panel"
            data-agreement-step-panel="1"
            data-step-title="${escapeHtml(agreementStepTitles[1])}"
            ${activeStepIndex === 1 ? '' : ' hidden'}
          >
            <p class="patient-master-muted">${offerAccepted ? 'Offerten är accepterad.' : 'Väntar på att kunden accepterar offerten.'}</p>
            ${
              canCreate
                ? `<div class="patient-master-plan-photo-actions"><button type="button" class="customers-utility-button" data-patient-action="create-agreement-from-offer">Skapa avtal från offert</button></div>`
                : ''
            }
          </section>
          <section
            class="patient-master-agreement-step cco-clinical-step-panel"
            data-agreement-step-panel="2"
            data-step-title="${escapeHtml(agreementStepTitles[2])}"
            ${activeStepIndex === 2 ? '' : ' hidden'}
          >
            <div class="patient-master-plan-photo-actions">
              ${
                canSendSign
                  ? `<button type="button" class="customers-utility-button" data-patient-action="send-agreement-for-sign">Skicka för signering</button>`
                  : ''
              }
              ${
                canAcceptAgreement
                  ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement">Signera avtal (staff)</button>`
                  : ''
              }
              ${
                canAcceptAgreement && coolingActive
                  ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement" data-patient-force-agreement="1">Tvinga signering</button>`
                  : ''
              }
            </div>
            ${documentLinksHtml}
          </section>
          <section
            class="patient-master-agreement-step cco-clinical-step-panel"
            data-agreement-step-panel="3"
            data-step-title="${escapeHtml(agreementStepTitles[3])}"
            ${activeStepIndex === 3 ? '' : ' hidden'}
          >
            ${bookingHtml}
          </section>
        </article>
      </div>
    `;
    }

    return `
      <article class="focus-customer-data-card patient-master-agreement-card">
        ${headerHtml}
        <p class="patient-master-next-action">${escapeHtml(nextActionLabel)}</p>
        ${checklistHtml}
        ${badgesHtml}
        <div class="patient-master-plan-photo-actions">
          <a class="customers-utility-button" href="${escapeHtml(patientInfoPdf)}" target="_blank" rel="noopener">Bilaga 1 PDF</a>
          <button type="button" class="customers-utility-button" data-patient-action="send-patient-info">Logga skickad patientinfo</button>
          ${
            canCreate
              ? `<button type="button" class="customers-utility-button" data-patient-action="create-agreement-from-offer">Skapa avtal från offert</button>`
              : ''
          }
          ${
            canSendSign
              ? `<button type="button" class="customers-utility-button" data-patient-action="send-agreement-for-sign">Skicka för signering</button>`
              : ''
          }
          ${
            canAcceptAgreement
              ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement">Signera avtal (staff)</button>`
              : ''
          }
          ${
            canAcceptAgreement && coolingActive
              ? `<button type="button" class="customers-utility-button" data-patient-action="accept-agreement" data-patient-force-agreement="1">Tvinga signering</button>`
              : ''
          }
        </div>
        ${documentLinksHtml}
        ${bookingHtml}
      </article>
    `;
  }

  function patchCommercialAgreementSidecars() {
    if (
      !els.patientRail?.querySelector('[data-patient-detail]:not([data-patient-loading])') ||
      !runtime.detail?.card
    ) {
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
    const normalized = normalizeDetailTab(nextTab);
    if (!runtime.detail?.card || !rail?.querySelector('[data-patient-detail]')) {
      return false;
    }
    if (isV9CustomersEnabled() && rail.querySelector('.v9-mockup-dossier')) {
      closeV9DossierDeepPanel();
    }
    if (normalized === runtime.detailTab) {
      syncMobilePatientLayout();
      window.ArcanaMobileShell?.syncFromApp?.();
      return true;
    }
    runtime.detailTab = normalized;
    if (normalized === 'journal') {
      runtime.preferJournalOnMobile = true;
      window.__ARCANA_LOAD_STAFF_DEFERRED__?.();
      void loadPatientJournalEntries(runtime.selectedPatientId);
    } else if (normalized === 'tidslinje' || normalized === 'anteckningar') {
      void loadPatientJournalEntries(runtime.selectedPatientId);
      if (normalized === 'anteckningar') {
        void loadDraftProposals(runtime.selectedPatientId);
      }
    } else {
      runtime.preferJournalOnMobile = false;
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingBlephEntryId = '';
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
    } else if (normalized === 'anteckningar') {
      const hydrate = () => {
        if (runtime.detailTab !== 'anteckningar') return;
        refreshDraftProposalsHost();
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(hydrate, { timeout: 1200 });
      } else {
        window.requestAnimationFrame(hydrate);
      }
    } else if (normalized === 'scalpanalys' && isAisiaScalpAnalysisEnabled()) {
      const hydrate = () => {
        if (runtime.detailTab !== 'scalpanalys') return;
        void mountScalpAnalysisPanel(rail);
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
    const { card: rawCard } = runtime.detail;
    const card = mergeCardWithShellEnrichment(rawCard, runtime.selectedPatientId, journalEntries);
    const journalEntries = asArray(runtime.detail.journalEntries);
    const occasionTimeline = runtime.detail?.occasionTimeline;
    const driveFiles = runtime.detail?.driveFiles;

    if (isV9CustomersEnabled()) {
      if (usesBlueprintDesktopLayout()) {
        renderBlueprintDetailPanels(card, journalEntries, null, occasionTimeline, driveFiles);
        bindV9MockupDossierHandlers(rail, { card, journalEntries, driveFiles });
        ensureV9DossierDeepClosed();
        runtime.detailShellOnly = true;
        syncV9CustomersLayoutState();
        syncMobilePatientLayout();
        return;
      }
      rail.innerHTML = renderV9MockupDetailShell(
        card,
        journalEntries,
        occasionTimeline,
        driveFiles,
        runtime.detail?.patient,
        normalizeDetailTab(runtime.detailTab),
        { lite: true }
      );
      bindV9MockupDossierHandlers(rail, { card, journalEntries, driveFiles });
      ensureV9DossierDeepClosed();
      runtime.detailShellOnly = true;
      syncV9CustomersLayoutState();
      syncMobilePatientLayout();
      return;
    }

    const tab = normalizeDetailTab(runtime.detailTab);
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const scalpanalysActive = isAisiaScalpAnalysisEnabled() && tab === 'scalpanalys';
    const tidslinjeActive = tab === 'tidslinje';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const anteckningarActive = tab === 'anteckningar';
    const fileCount = Number(
      card.fileSummary?.totalFiles || runtime.detail.driveFiles?.length || 0
    );

    rail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        ${renderPatientDetailHero(card, journalEntries)}
        ${renderV9DossierScrollBlock(card, journalEntries, runtime.detail?.occasionTimeline, driveFiles)}

        ${renderPatientDetailTabsMarkup(tab, fileCount)}
        ${renderPatientDetailBodyOpen()}

        <div class="patient-master-tab-panel"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil"></div>
        <div class="patient-master-tab-panel"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          ${renderJournalWorkflowCallout(journalEntries)}
          ${renderScalpImagingCallout()}
          ${renderJournalToolbar(card, journalEntries)}
        </div>
        ${
          isAisiaScalpAnalysisEnabled()
            ? `<div class="patient-master-tab-panel${scalpanalysActive ? '' : ' hidden'}" data-patient-tab-panel="scalpanalys">
          <p class="patient-master-muted" data-patient-shell-placeholder>Laddar hår-/scalpanalys…</p>
        </div>`
            : ''
        }
        <div class="patient-master-tab-panel"${tidslinjeActive ? '' : ' hidden'} data-patient-tab-panel="tidslinje">
          <p class="patient-master-muted" data-patient-shell-placeholder>Laddar tidslinje…</p>
        </div>
        <div class="patient-master-tab-panel"${avtalActive ? '' : ' hidden'} data-patient-tab-panel="avtal"></div>
        <div class="patient-master-tab-panel"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer"></div>
        <div class="patient-master-tab-panel"${anteckningarActive ? '' : ' hidden'} data-patient-tab-panel="anteckningar">
          <p class="patient-master-muted" data-patient-shell-placeholder>Laddar anteckningar…</p>
        </div>
        ${renderPatientDetailBodyClose()}
      </section>
    `;
    bindV9DossierCapabilityHandlers(rail);
    window.CcoV9CustomersParity?.bindDossierScroll?.(rail);
    runtime.detailShellOnly = true;
    syncMobilePatientLayout();
  }

  function scheduleFullDetailPanelHydration(patientId) {
    const hydrate = () => {
      if (normalizeText(runtime.selectedPatientId) !== normalizeText(patientId)) return;
      if (!runtime.detail?.card) return;
      renderDetailPanel();
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(hydrate);
    });
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
    const { card: rawCard, patient, journalEntries, driveFiles, occasionTimeline } = detail;
    const card = mergeCardWithShellEnrichment(rawCard, runtime.selectedPatientId, journalEntries);

    if (isV9CustomersEnabled()) {
      const tab = normalizeDetailTab(runtime.detailTab);
      const dossierBundle = runtime.detail?.dossierBundle || runtime.detail?.documentBundle || null;
      if (usesBlueprintDesktopLayout()) {
        renderBlueprintDetailPanels(
          card,
          journalEntries,
          dossierBundle,
          occasionTimeline,
          driveFiles
        );
        bindJournalPhotoOpenLinks(els.patientRail);
        void hydrateJournalPhotoElements(els.patientRail);
        void hydratePatientFileImages(els.patientRail);
        syncV9CustomersLayoutState();
        syncMobilePatientLayout();
        return;
      }
      rail.innerHTML = renderV9MockupDetailShell(
        card,
        journalEntries,
        occasionTimeline,
        driveFiles,
        patient,
        tab
      );
      bindJournalPhotoOpenLinks(els.patientRail);
      bindV9MockupDossierHandlers(rail, {
        card,
        journalEntries,
        driveFiles,
        patient,
        occasionTimeline,
      });
      bindV9DossierCapabilityHandlers(rail);
      ensureV9DossierDeepClosed();
      void hydrateJournalPhotoElements(els.patientRail);
      void hydratePatientFileImages(els.patientRail);
      syncV9CustomersLayoutState();
      syncMobilePatientLayout();
      window.requestAnimationFrame(() => {
        bindJournalAutosaveForms();
        focusTimelineSegmentIfNeeded(els.patientRail);
        if (tab === 'scalpanalys' && isAisiaScalpAnalysisEnabled() && card?.patientId) {
          void mountScalpAnalysisPanel(els.patientRail);
        }
      });
      return;
    }

    const tab = normalizeDetailTab(runtime.detailTab);
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const scalpanalysActive = isAisiaScalpAnalysisEnabled() && tab === 'scalpanalys';
    const tidslinjeActive = tab === 'tidslinje';
    const avtalActive = tab === 'avtal';
    const filesActive = tab === 'filer';
    const anteckningarActive = tab === 'anteckningar';
    const fileCount = Number(card.fileSummary?.totalFiles || driveFiles?.length || 0);

    rail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        ${renderPatientDetailHero(card, journalEntries)}

        ${renderPatientDetailTabsMarkup(tab, fileCount)}
        ${renderPatientDetailBodyOpen()}

        <div class="patient-master-tab-panel"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil">
          ${renderJournalWorkflowCallout(journalEntries)}
          ${renderScalpImagingCallout()}
          ${renderPatientIntegrationsCard(card)}
          ${renderPatientComplianceCard(card)}
          ${renderPatientDemographicsCard(card)}
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
          ${
            patient?.cliento?.createdAt
              ? `<p class="patient-master-muted">Cliento skapad: ${escapeHtml(String(patient.cliento.createdAt).slice(0, 10))}</p>`
              : ''
          }
        </div>

        <div class="patient-master-tab-panel"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          ${renderDraftProposalsPanel()}
          ${
            card.journalBlocked
              ? `<p class="patient-master-block-banner">Journalen är spärrad${card.journalBlockReason ? `: ${escapeHtml(card.journalBlockReason)}` : ''}. Nya eller ändrade poster blockeras.</p>`
              : ''
          }
          ${renderJournalEntries(journalEntries)}
        </div>

        ${
          isAisiaScalpAnalysisEnabled()
            ? `<div class="patient-master-tab-panel${scalpanalysActive ? '' : ' hidden'}" data-patient-tab-panel="scalpanalys">
          <div id="cco-scalp-analysis-mount" data-scalp-analysis-mount="${escapeHtml(card.patientId || runtime.selectedPatientId || '')}"></div>
        </div>`
            : ''
        }

        <div class="patient-master-tab-panel"${tidslinjeActive ? '' : ' hidden'} data-patient-tab-panel="tidslinje">
          ${renderUnifiedTimelinePanel(journalEntries, driveFiles, occasionTimeline)}
        </div>

        <div class="patient-master-tab-panel"${avtalActive ? '' : ' hidden'} data-patient-tab-panel="avtal">
          ${renderAgreementSection()}
        </div>

        <div class="patient-master-tab-panel"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer">
          ${renderDriveFiles(driveFiles, card)}
        </div>

        <div class="patient-master-tab-panel"${anteckningarActive ? '' : ' hidden'} data-patient-tab-panel="anteckningar">
          ${renderDraftProposalsPanel()}
          ${renderPatientNotesPanel(journalEntries)}
        </div>
        ${renderPatientDetailBodyClose()}
      </section>
    `;
    bindJournalPhotoOpenLinks(els.patientRail);
    bindV9DossierCapabilityHandlers(els.patientRail);
    window.CcoV9CustomersParity?.bindDossierScroll?.(els.patientRail);
    void hydrateJournalPhotoElements(els.patientRail);
    void hydratePatientFileImages(els.patientRail);
    syncMobilePatientLayout();
    window.requestAnimationFrame(() => {
      bindJournalAutosaveForms();
      focusTimelineSegmentIfNeeded(els.patientRail);
      if (scalpanalysActive && isAisiaScalpAnalysisEnabled() && card?.patientId) {
        void mountScalpAnalysisPanel(els.patientRail);
      }
      if (journalActive && card?.patientId) {
        if (runtime.draftProposalsPatientId !== normalizeText(card.patientId)) {
          runtime.draftProposals = null;
        }
        void loadDraftProposals(card.patientId);
      }
    });
  }

  async function loadStats() {
    if (needsStaffLogin()) return;
    if (isV9CustomersEnabled()) return;
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/stats', {
        cacheKey: 'patient-master:stats',
        staleTime: window.ArcanaCcoData?.policy?.STATIC?.staleTime,
      });
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

  async function loadPatientList({ append = false, force = false } = {}) {
    if (runtime.mode !== 'register') return;
    if (needsStaffLogin()) {
      renderPatientRows();
      return;
    }
    if (runtime.loading) {
      if (!append) {
        runtime.pendingListReload = { append: false, force: true };
      }
      return;
    }
    runtime.loading = true;
    runtime.error = '';
    if (!append) {
      runtime.offset = 0;
      runtime.patients = [];
    }
    setStatus('Läser kundregister…', 'loading');
    renderPatientRows();

    const deepLinkId = !append
      ? normalizeText(runtime.pendingPatientId || parseStartupParams().patientId)
      : '';
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
    if (runtime.segmentFilter) params.set('segment', runtime.segmentFilter);
    const assignedOwner = resolveAssignedOwnerForShell();
    if (assignedOwner) params.set('assignedOwner', assignedOwner);
    params.set('includeAutomation', '1');

    try {
      const shellKey = `customers-shell:list:${normalizeText(runtime.query)}:${runtime.flagFilter}:${runtime.segmentFilter}:${runtime.offset}:auto`;
      const payload = await apiRequest(`/api/v1/cco/staff/customers-shell?${params}`, {
        cacheKey: shellKey,
        staleTime: window.ArcanaCcoData?.policy?.PATIENT_LIST?.staleTime,
        force: force === true,
      });
      const patientsPayload = payload.patients || payload;
      const batch = filterPilotPatients(asArray(patientsPayload.patients));
      runtime.total = getPilotPatientIds().length
        ? batch.length
        : Number(patientsPayload.total || batch.length);
      runtime.patients = append ? runtime.patients.concat(batch) : batch;
      if (payload.stats) runtime.stats = payload.stats;
      if (payload.segmentStats) runtime.segmentStats = payload.segmentStats;
      if (payload.automation) runtime.automation = payload.automation;
      if (payload.staffOwnership) {
        runtime.staffOwnership = payload.staffOwnership;
        window.CcoKunderStaffOwner?.rememberShellOwnership?.(payload);
      }
      if (Array.isArray(payload.offerTemplates?.templates)) {
        runtime.offerTemplates = payload.offerTemplates.templates;
      } else if (Array.isArray(payload.offerTemplates)) {
        runtime.offerTemplates = payload.offerTemplates;
      }
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
      if (!runtime.selectedPatientId && runtime.patients[0] && !isCompactFormViewport()) {
        if (!isV9CustomersEnabled()) {
          runtime.selectedPatientId = runtime.patients[0].patientId;
          await loadPatientDetail(runtime.selectedPatientId);
        }
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
    }
    const pending = runtime.pendingListReload;
    runtime.pendingListReload = null;
    if (pending) {
      void loadPatientList(pending);
      return;
    }
    renderMetricCards();
    renderPatientRows();
  }

  function syncCustomerSearchInputs(query, exceptEl = null) {
    const next = normalizeText(query);
    document
      .querySelectorAll(
        '[data-customer-search], [data-v9-global-search-input], [data-v9-search-input]'
      )
      .forEach((el) => {
        if (el === exceptEl || el.value === next) return;
        el.value = next;
      });
    return next;
  }

  let dropdownSelectedIndex = -1;
  let dropdownOpen = false;
  let dropdownActiveInput = null;
  let dropdownOutsideClickBound = false;

  function resolveDropdownHost(input) {
    if (!input) return null;
    return (
      input.closest('[data-v9-global-search], label, .customers-filter') || input.parentElement
    );
  }

  function closeSearchDropdown(inputEl) {
    dropdownOpen = false;
    dropdownSelectedIndex = -1;
    const input = inputEl || dropdownActiveInput;
    resolveDropdownHost(input)?.querySelector('[data-search-dropdown]')?.remove();
  }

  function renderSearchDropdown(searchEl) {
    if (!searchEl) return;
    const query = normalizeText(searchEl.value);
    const dropdownHost = resolveDropdownHost(searchEl);
    if (!dropdownHost) return;
    let dropdown = dropdownHost.querySelector('[data-search-dropdown]');

    if (!query && !dropdownOpen) {
      if (dropdown) dropdown.remove();
      return;
    }

    const filteredPatients = query
      ? runtime.patients.filter(
          (p) =>
            (p.displayName || '').toLowerCase().includes(query.toLowerCase()) ||
            (p.primaryEmail || '').toLowerCase().includes(query.toLowerCase()) ||
            (p.primaryPhone || '').toLowerCase().includes(query.toLowerCase())
        )
      : runtime.patients.slice(0, 4);

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.setAttribute('data-search-dropdown', '');
      dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: 8px;
        background: var(--color-background-primary);
        border: 0.5px solid var(--color-border-secondary);
        border-radius: var(--border-radius-lg);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        z-index: 1000;
        max-height: 400px;
        overflow-y: auto;
      `;
      dropdownHost.style.position = 'relative';
      dropdownHost.appendChild(dropdown);
    }

    const header = !query
      ? '<div style="padding: 10px 12px 6px; font-size: 11px; font-weight: 500; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em;">Senaste</div>'
      : '';

    const rows = filteredPatients
      .slice(0, 10)
      .map((patient, idx) => {
        const name = displayNameForList(patient);
        const info =
          [patient.nextBookingType, patient.primaryEmail, patient.primaryPhone]
            .filter(Boolean)
            .join(' · ') || '—';
        const isSelected = idx === dropdownSelectedIndex;
        const bg = isSelected ? 'var(--color-background-secondary)' : 'transparent';
        return `
        <button
          data-dropdown-row="${escapeHtml(patient.patientId)}"
          type="button"
          style="width: 100%; padding: 12px; border: none; background: ${bg}; text-align: left; cursor: pointer; border-bottom: 0.5px solid var(--color-border-tertiary); display: flex; gap: 12px; align-items: flex-start;">
          <div style="width: 44px; height: 44px; border-radius: 50%; background: ${v9AvatarGradient(name)}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 13px; flex-shrink: 0;">${escapeHtml(v9AvatarInitials(name))}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 13px; color: var(--color-text-primary);">${escapeHtml(name)}</div>
            <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 2px;">${escapeHtml(info)}</div>
          </div>
          <div style="color: var(--color-text-secondary); font-size: 18px;">›</div>
        </button>
      `;
      })
      .join('');

    dropdown.innerHTML = header + rows;

    dropdown.querySelectorAll('[data-dropdown-row]').forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        const patientId = btn.getAttribute('data-dropdown-row');
        runtime.selectedPatientId = patientId;
        runtime.query = '';
        syncCustomerSearchInputs('');
        renderDetailPanel();
        closeSearchDropdown();
      });
      if (idx === dropdownSelectedIndex) {
        btn.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function attachDropdownToSearchInput(inputElement) {
    if (!inputElement || inputElement.dataset.dropdownBound === '1') return;
    inputElement.dataset.dropdownBound = '1';

    inputElement.addEventListener('focus', () => {
      dropdownActiveInput = inputElement;
      dropdownOpen = true;
      renderSearchDropdown(inputElement);
    });

    inputElement.addEventListener('input', (e) => {
      dropdownActiveInput = inputElement;
      dropdownSelectedIndex = -1;
      void setCustomerSearchQuery(e.target.value, { clearSelection: false, force: false });
      renderSearchDropdown(inputElement);
    });

    inputElement.addEventListener('keydown', (e) => {
      dropdownActiveInput = inputElement;
      const dropdown = resolveDropdownHost(inputElement)?.querySelector('[data-search-dropdown]');
      const rows = dropdown ? Array.from(dropdown.querySelectorAll('[data-dropdown-row]')) : [];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        dropdownSelectedIndex = Math.min(dropdownSelectedIndex + 1, rows.length - 1);
        renderSearchDropdown(inputElement);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dropdownSelectedIndex = Math.max(dropdownSelectedIndex - 1, -1);
        renderSearchDropdown(inputElement);
      } else if (e.key === 'Enter' && dropdownSelectedIndex >= 0 && rows[dropdownSelectedIndex]) {
        e.preventDefault();
        rows[dropdownSelectedIndex].click();
      } else if (e.key === 'Escape') {
        closeSearchDropdown(inputElement);
      }
    });

    if (!dropdownOutsideClickBound) {
      dropdownOutsideClickBound = true;
      document.addEventListener('click', (e) => {
        for (const inp of document.querySelectorAll(
          '[data-customer-search], [data-v9-global-search-input], [data-v9-search-input]'
        )) {
          const host = resolveDropdownHost(inp);
          if (host?.contains(e.target)) return;
        }
        closeSearchDropdown();
      });
    }
  }

  async function setCustomerSearchQuery(query, { clearSelection = true, force = true } = {}) {
    if (runtime.mode !== 'register') return [];
    runtime.query = syncCustomerSearchInputs(query);
    dropdownSelectedIndex = -1;
    if (clearSelection) {
      runtime.selectedPatientId = '';
      runtime.detail = null;
      renderDetailEmpty();
    }
    await loadPatientList({ force: force === true });
    renderSearchDropdown(
      dropdownActiveInput ||
        els.search ||
        document.querySelector('[data-v9-global-search-input]') ||
        document.querySelector('[data-customer-search]')
    );
    return runtime.patients.slice();
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
      if (prefetched && normalizeText(prefetched.patientId) === key && prefetched.payload) {
        return prefetched.payload;
      }
      if (!window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__) break;
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    return null;
  }

  async function loadPatientJournalEntries(patientId, { force = false } = {}) {
    const key = normalizeText(patientId);
    if (!key || !runtime.detail?.card) return;
    if (!force && runtime.journalLoaded && normalizeText(runtime.selectedPatientId) === key) return;
    if (runtime.journalLoading) return;
    runtime.journalLoading = true;
    try {
      const journalPolicy = window.ArcanaCcoData?.policy?.JOURNAL || {
        staleTime: 0,
        gcTime: 120000,
      };
      const payload = await apiRequest(
        `/api/v1/cco-journal/entries?patientId=${encodeURIComponent(key)}&limit=120`,
        {
          cacheKey: `journal:${key}`,
          staleTime: journalPolicy.staleTime,
          gcTime: journalPolicy.gcTime,
          force,
        }
      );
      if (normalizeText(runtime.selectedPatientId) !== key || !runtime.detail) return;
      runtime.detail.journalEntries = asArray(payload.entries);
      runtime.journalLoaded = true;
      syncTimelineFocusFromEntries(runtime.detail.journalEntries);
      if (
        runtime.detailTab === 'journal' ||
        runtime.detailTab === 'tidslinje' ||
        isV9CustomersEnabled()
      ) {
        renderDetailPanel();
      }
    } catch (error) {
      console.warn('Journal kunde inte laddas.', error);
    } finally {
      runtime.journalLoading = false;
    }
  }

  async function fetchPatientDetailFromApi(
    patientId,
    { includeDriveFiles = true, includeJournal = false } = {}
  ) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 8000) : 0;
    const driveQuery = includeDriveFiles ? '1' : '0';
    const endpoint = includeJournal
      ? `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}&includeDriveFiles=${driveQuery}&includeJournal=1`
      : `/api/v1/cco-patient-master/patient/summary?patientId=${encodeURIComponent(patientId)}&includeDriveFiles=${driveQuery}`;
    const detailPolicy = window.ArcanaCcoData?.policy?.PATIENT_DETAIL || {
      staleTime: 90000,
      gcTime: 300000,
    };
    try {
      return await apiRequest(endpoint, {
        ...(controller ? { signal: controller.signal } : {}),
        cacheKey: `patient-detail:${normalizeText(patientId)}:${includeJournal ? 'full' : 'summary'}:${driveQuery}`,
        staleTime: detailPolicy.staleTime,
        gcTime: detailPolicy.gcTime,
      });
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function prefetchPatientDetailIntent(patientId) {
    const key = normalizeText(patientId);
    if (!key || runtime.mode !== 'register' || needsStaffLogin()) return;
    if (normalizeText(runtime.selectedPatientId) === key && runtime.detail?.card) return;
    const cached = window.__ARCANA_PATIENT_PREFETCH__;
    if (cached && normalizeText(cached.patientId) === key && cached.payload) return;
    if (patientDetailInflight.has(key) || window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__) return;

    window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__ = true;
    void fetchPatientDetailFromApi(key, { includeDriveFiles: false })
      .then((payload) => {
        if (!payload) return;
        const current = window.__ARCANA_PATIENT_PREFETCH__;
        if (!current || normalizeText(current.patientId) !== key) {
          window.__ARCANA_PATIENT_PREFETCH__ = { patientId: key, payload };
        }
      })
      .catch(() => {})
      .finally(() => {
        window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__ = false;
      });
  }

  async function resolvePatientDetailPayload(patientId, { preferLite = false } = {}) {
    const key = normalizeText(patientId);
    const prefetched = window.__ARCANA_PATIENT_PREFETCH__;
    if (prefetched && normalizeText(prefetched.patientId) === key && prefetched.payload) {
      delete window.__ARCANA_PATIENT_PREFETCH__;
      return prefetched.payload;
    }

    const useLite = preferLite || isMobileViewport();
    const apiPromise = fetchPatientDetailFromApi(patientId, { includeDriveFiles: !useLite });
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

  async function enrichPatientDriveFiles(patientId) {
    const key = normalizeText(patientId);
    if (!key || normalizeText(runtime.selectedPatientId) !== key || !runtime.detail?.card) return;
    if (asArray(runtime.detail.driveFiles).length > 0) return;
    const fileTotal = Number(runtime.detail.card.fileSummary?.totalFiles || 0);
    if (fileTotal <= 0) return;

    try {
      const payload = await fetchPatientDetailFromApi(patientId, { includeDriveFiles: true });
      if (normalizeText(runtime.selectedPatientId) !== key || !runtime.detail?.card) return;
      runtime.detail = {
        ...runtime.detail,
        driveFiles: asArray(payload.driveFiles),
        occasionTimeline: asArray(payload.occasionTimeline),
      };
      scheduleDetailPanelPaint(patientId);
    } catch {
      /* best-effort */
    }
  }

  function signalDeepLinkDetailReady(patientId) {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (
        nav &&
        isMobileViewport() &&
        normalizeText(parseStartupParams().patientId) === normalizeText(patientId) &&
        !window.__ARCANA_DEEPLINK_DETAIL_READY_MS__
      ) {
        window.__ARCANA_DEEPLINK_DETAIL_READY_MS__ = performance.now() - nav.startTime;
      }
    } catch {
      /* best-effort */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('arcana-deeplink-detail-ready', {
          detail: { patientId: normalizeText(patientId) },
        })
      );
    } catch {
      /* best-effort */
    }
  }

  function railHasHydratedDeepLinkShell(patientId) {
    return (
      normalizeText(window.__ARCANA_DEEPLINK_HYDRATED__) === normalizeText(patientId) &&
      Boolean(document.querySelector('[data-patient-master-rail] .patient-master-camera-button'))
    );
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
      runtime.editingBlephEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      runtime.draftProposals = null;
      runtime.draftProposalsPatientId = '';
      runtime.draftProposalsLoading = false;
      runtime.journalLoaded = false;
      runtime.journalLoading = false;
    }
    runtime.selectedPatientId = patientId;
    if (openingNewPatient && isV9CustomersEnabled() && !isMobileViewport()) {
      runtime.detailTab = 'oversikt';
    } else if (isMobileViewport() && runtime.preferJournalOnMobile) {
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
    const alreadyHydrated = railHasHydratedDeepLinkShell(patientId);
    if (!alreadyPrimed && !alreadyHydrated) {
      renderDetailLoadingSkeleton(patientId);
    }
    syncMobilePatientLayout();
    if (isMobileViewport() && openingNewPatient) {
      pushMobilePatientDetailHistory(patientId);
    }
    try {
      const payload = await resolvePatientDetailPayload(patientId, {
        preferLite: isMobileViewport(),
      });
      runtime.detail = payload;
      runtime.journalLoaded = asArray(payload.journalEntries).length > 0;
      if (!runtime.journalLoaded) {
        runtime.detail.journalEntries = [];
      }
      syncTimelineFocusFromEntries(payload.journalEntries);
      runtime.detailLoading = false;
      const v10FacitDesktop =
        isV9CustomersEnabled() && usesV10KundkortFacit() && !isMobileViewport();
      if (v10FacitDesktop) {
        await Promise.all([
          loadPatientDocumentBundle(patientId),
          loadPatientCommercialCase(patientId),
          loadPatientTreatmentAgreement(patientId),
        ]);
      }
      if (isMobileViewport() && runtime.preferJournalOnMobile) {
        if (!alreadyHydrated) {
          renderDetailShellLite();
        }
        scheduleFullDetailPanelHydration(patientId);
      } else {
        scheduleDetailPanelPaint(patientId);
      }
      if (isMobileViewport()) {
        void enrichPatientDriveFiles(patientId);
      }
      signalDeepLinkDetailReady(patientId);
      void loadScalpProtocolStatus(patientId);
      if (isV9CustomersEnabled() && !v10FacitDesktop) {
        void loadPatientDocumentBundle(patientId).then(() => {
          if (runtime.selectedPatientId !== patientId || !runtime.detail?.card) return;
          renderDetailPanel();
        });
      }
      if (
        runtime.detailTab === 'journal' ||
        runtime.detailTab === 'tidslinje' ||
        (isMobileViewport() && runtime.preferJournalOnMobile) ||
        isV9CustomersEnabled()
      ) {
        // v9/kkx: panelens kundresa + signaler behöver journalbevis (signerad TP släcker missing_journal).
        void loadPatientJournalEntries(patientId);
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
      } else if (!v10FacitDesktop) {
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

  async function uploadConsultationPhoto(file, options = {}) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !file) return;

    if (needsStaffLogin()) {
      setStatus('Logga in för att ladda upp bilder.', 'error');
      renderPatientRows();
      return;
    }

    let uploadFile = file;
    setStatus('Förbereder bild…', 'loading');
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

    const labelChoice = options.defaultLabel || defaultPhotoLabel();

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
      // Forcera färska entries — annars serverar journal-cachen listan utan nya fotot.
      await loadPatientJournalEntries(patientId, { force: true });
      const kkxSlot = document.querySelector('[data-kkx-journal-mount]');
      if (kkxSlot) {
        mountKkxJournalBig(kkxSlot, {
          templateId: runtime.kkxActiveJournalTemplate,
        });
      }
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
        const kkxSlot = document.querySelector('[data-kkx-journal-mount]');
        if (kkxSlot) {
          mountKkxJournalBig(kkxSlot, {
            templateId: runtime.kkxActiveJournalTemplate,
          });
        }
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
    const config = tpForm.config || {};
    setStatus('Sparar TP-journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'tp_treatment',
          formVariant: config.formVariant || 'hair_tp',
          sourceQuestionaryId: config.meridiqQuestionaryId || 16411,
          title: config.title || 'TP behandlingsjournal',
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
          formVariant: config.formVariant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
          title: config.title,
          fields: config.defaultFields ? config.defaultFields(card) : {},
        },
      });
      runtime.editingClinicalFormKey = formKey;
      runtime.editingClinicalEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingBlephEntryId = '';
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
          formVariant: config.formVariant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
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
    const tpForm = window.ArcanaJournalTpForm;
    if (!patientId || !card || !tpForm) return;
    const config = tpForm.config || {};
    setStatus('Skapar TP-journal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'tp_treatment',
          formVariant: config.formVariant || 'hair_tp',
          sourceQuestionaryId: config.meridiqQuestionaryId || 16411,
          title: config.title || 'TP behandlingsjournal',
          fields: tpForm.defaultFields ? tpForm.defaultFields() : {},
        },
      });
      runtime.editingTpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingBlephEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny TP-journal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function createPrpJournalDraft(formVariant = 'prp_skin') {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const prpForm = window.ArcanaJournalPrpForm;
    const variant = normalizeText(formVariant) || 'prp_skin';
    const config = prpForm?.forms?.[variant] || prpForm?.resolveForm?.({ formVariant: variant });
    if (!patientId || !card || !config) return;
    setStatus('Skapar PRP-journal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'prp_treatment',
          formVariant: config.formVariant || variant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
          title: config.title || 'PRP behandlingsjournal',
          fields: prpForm.defaultFields ? prpForm.defaultFields(variant) : {},
        },
      });
      runtime.editingPrpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingBlephEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny PRP-journal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function createFollowUpJournalDraft(formVariant = '4_manader') {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const followForm = window.ArcanaJournalFollowUpForm;
    const variant = normalizeText(formVariant) || '4_manader';
    const config =
      followForm?.forms?.[variant] || followForm?.resolveForm?.({ formVariant: variant });
    if (!patientId || !card || !config) return;
    setStatus('Skapar uppföljningsjournal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'follow_up',
          formVariant: config.formVariant || variant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
          title: config.title || 'Uppföljning',
          fields: followForm.defaultFields ? followForm.defaultFields(variant) : {},
        },
      });
      runtime.editingFollowUpEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingBlephEntryId = '';
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
    const formVariant =
      normalizeText(form.dataset.prpFormVariant) ||
      normalizeText(entryRoot?.dataset?.prpFormVariant) ||
      'prp_skin';
    const config = prpForm.forms?.[formVariant] || prpForm.resolveForm?.({ formVariant }) || {};
    setStatus('Sparar PRP-journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'prp_treatment',
          formVariant: config.formVariant || formVariant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
          title: config.title || 'PRP behandlingsjournal',
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
    const formVariant =
      normalizeText(form.dataset.followFormVariant) ||
      normalizeText(entryRoot?.dataset?.followFormVariant) ||
      '4_manader';
    const config =
      followForm.forms?.[formVariant] || followForm.resolveForm?.({ formVariant }) || {};
    setStatus('Sparar uppföljningsjournal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'follow_up',
          formVariant: config.formVariant || formVariant,
          sourceQuestionaryId: config.meridiqQuestionaryId,
          title: config.title || 'Uppföljning',
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

  async function createBlephJournalDraft() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const blephForm = window.ArcanaJournalBlephForm;
    if (!patientId || !card || !blephForm) return;
    const config = blephForm.config || {};
    setStatus('Skapar ögonlocksjournal…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'bleph_treatment',
          formVariant: config.formVariant || 'curatiio_bleph',
          sourceQuestionaryId: config.meridiqQuestionaryId || 16388,
          title: config.title || 'Ögonlocksjournal',
          fields: blephForm.defaultFields ? blephForm.defaultFields(card) : {},
        },
      });
      runtime.editingBlephEntryId = normalizeText(payload?.entry?.entryId);
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingClinicalFormKey = '';
      runtime.editingClinicalEntryId = '';
      setStatus('Ny ögonlocksjournal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function saveBlephJournalEntry(form) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    const entryId = normalizeText(form?.dataset?.blephEntryId) || runtime.editingBlephEntryId;
    const blephForm = window.ArcanaJournalBlephForm;
    if (!patientId || !card || !entryId || !blephForm?.readForm) return;
    const entryRoot = form.querySelector('[data-bleph-journal-form]');
    const fields = blephForm.readForm(entryRoot);
    const config = blephForm.config || {};
    setStatus('Sparar ögonlocksjournal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          entryId,
          personnummer: card.personnummer || '',
          journalType: 'bleph_treatment',
          formVariant: config.formVariant || 'curatiio_bleph',
          sourceQuestionaryId: config.meridiqQuestionaryId || 16388,
          title: config.title || 'Ögonlocksjournal',
          fields,
        },
      });
      setStatus('Ögonlocksjournal sparad.', 'success');
      window.ArcanaMobileAutosave?.markFormSaved?.(form);
      runtime.editingBlephEntryId = entryId;
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
      refreshJournalEnrichmentReadout(patientId);
    } catch (error) {
      setStatus(error.message || 'Signering misslyckades.', 'error');
    }
  }

  let v9WatchSwipeState = null;

  function resetV9WatchSwipeEl(swipeEl) {
    if (!swipeEl) return;
    swipeEl.dataset.swipeState = '';
    const fill = swipeEl.querySelector('.watch-swipe-fill');
    const arrow = swipeEl.querySelector('.watch-swipe-arrow');
    if (fill) fill.style.transform = 'translateX(-100%)';
    if (arrow) {
      arrow.style.transform = 'translateY(-50%) translateX(0)';
      arrow.style.opacity = '1';
    }
  }

  function cleanupV9WatchSwipe() {
    if (!v9WatchSwipeState) return;
    document.removeEventListener('pointermove', onV9WatchSwipeMove);
    document.removeEventListener('pointerup', onV9WatchSwipeEnd);
    document.removeEventListener('pointercancel', onV9WatchSwipeEnd);
    v9WatchSwipeState = null;
  }

  function completeV9WatchSwipe(swipeEl) {
    if (!swipeEl || swipeEl.dataset.swipeState === 'ok') return;
    swipeEl.dataset.swipeState = 'ok';
    cleanupV9WatchSwipe();
    const widget = swipeEl.closest('[data-v9-watch-widget]');
    const patientId = widget?.dataset?.v9WatchPatient || '';
    const patientName =
      widget?.querySelector('.watch-sub')?.textContent?.split(' · ')[0]?.trim() || 'Kund';
    showV9WatchToast(`✓ ${patientName} markerad ankommen från handleden`);
    if (patientId) {
      void apiRequest('/api/v1/cco/staff/watch-checkin', {
        method: 'POST',
        body: {
          patientId,
          bookingId: widget?.dataset?.v9WatchBooking || null,
        },
      }).catch((error) => {
        console.warn('Watch check-in misslyckades.', error);
      });
    }
    window.setTimeout(() => resetV9WatchSwipeEl(swipeEl), 3200);
  }

  function onV9WatchSwipeMove(event) {
    if (!v9WatchSwipeState) return;
    const { swipeEl, fill, arrow, startX, width } = v9WatchSwipeState;
    const dx = Math.max(0, Math.min(width, event.clientX - startX));
    const pct = dx / Math.max(width - 22, 1);
    if (fill) fill.style.transform = `translateX(${-100 + pct * 100}%)`;
    if (arrow) arrow.style.transform = `translateY(-50%) translateX(${dx * 0.8}px)`;
    if (pct >= 0.85) {
      completeV9WatchSwipe(swipeEl);
    }
  }

  function onV9WatchSwipeEnd() {
    if (!v9WatchSwipeState) return;
    const { swipeEl, fill, arrow } = v9WatchSwipeState;
    if (swipeEl.dataset.swipeState !== 'ok') {
      if (fill) fill.style.transform = 'translateX(-100%)';
      if (arrow) arrow.style.transform = 'translateY(-50%) translateX(0)';
    }
    cleanupV9WatchSwipe();
  }

  function bindEvents() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        const row = event.target.closest('[data-patient-row]');
        if (!row || runtime.mode !== 'register') return;
        prefetchPatientDetailIntent(row.dataset.patientRow);
      },
      { passive: true, capture: true }
    );

    document.addEventListener('pointerdown', (event) => {
      if (!isV9DemoEnabled()) return;
      const swipe = event.target.closest('[data-v9-watch-swipe]');
      if (!swipe || swipe.dataset.swipeState === 'ok') return;
      const rect = swipe.getBoundingClientRect();
      v9WatchSwipeState = {
        swipeEl: swipe,
        fill: swipe.querySelector('.watch-swipe-fill'),
        arrow: swipe.querySelector('.watch-swipe-arrow'),
        startX: event.clientX,
        width: rect.width,
      };
      document.addEventListener('pointermove', onV9WatchSwipeMove);
      document.addEventListener('pointerup', onV9WatchSwipeEnd);
      document.addEventListener('pointercancel', onV9WatchSwipeEnd);
    });

    document.addEventListener('click', (event) => {
      if (isV9DemoEnabled()) {
        const dismiss = event.target.closest('[data-v9-watch-dismiss]');
        if (dismiss) {
          event.preventDefault();
          event.stopPropagation();
          setV9WatchHidden(true);
          return;
        }
        const restore = event.target.closest('[data-v9-watch-restore]');
        if (restore) {
          event.preventDefault();
          setV9WatchHidden(false);
          return;
        }
        const smsButton = event.target.closest('[data-v9-watch-sms]');
        if (smsButton && !smsButton.disabled) {
          event.preventDefault();
          const widget = smsButton.closest('[data-v9-watch-widget]');
          const patientId = widget?.dataset?.v9WatchPatient || '';
          if (!patientId) return;
          smsButton.disabled = true;
          void apiRequest('/api/v1/cco/staff/watch-sms', {
            method: 'POST',
            body: {
              patientId,
              startsAt: widget?.dataset?.v9WatchStartsAt || null,
              treatmentLabel: widget?.dataset?.v9WatchTreatment || null,
            },
          })
            .then((result) => {
              if (result?.ok && !result?.dryRun) {
                showV9WatchToast('✓ SMS skickat');
              } else {
                showV9WatchToast(result?.message || 'Dry-run — SMS-provider saknas');
              }
            })
            .catch((error) => {
              showV9WatchToast(error.message || 'SMS misslyckades');
            })
            .finally(() => {
              smsButton.disabled = false;
            });
          return;
        }
      }

      const modeButton = event.target.closest('[data-patient-master-mode]');
      if (modeButton) {
        setMode(modeButton.dataset.patientMasterMode);
        return;
      }

      const dismissMergeButton = event.target.closest('[data-patient-merge-dismiss]');
      if (dismissMergeButton && runtime.mode === 'identity') {
        void dismissMergeReviewGroup(dismissMergeButton.dataset.patientMergeGroup);
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

      const dossierClose = event.target.closest('[data-v9-dossier-close]');
      if (dossierClose && runtime.mode === 'register' && isV9CustomersEnabled()) {
        closeV9DossierSelection();
        return;
      }

      const aggInsightRow = event.target.closest('[data-v9-aggregate-panel] [data-v9-agg]');
      if (aggInsightRow && runtime.mode === 'register' && isV9CustomersEnabled()) {
        applyV9AggInsightAction(normalizeText(aggInsightRow.dataset.v9Agg));
        return;
      }

      const aggActionBtn = event.target.closest('[data-v9-aggregate-panel] [data-v9-agg-action]');
      if (aggActionBtn && runtime.mode === 'register' && isV9CustomersEnabled()) {
        if (aggActionBtn.disabled || aggActionBtn.getAttribute('aria-disabled') === 'true') {
          return;
        }
        const parityApi = {
          getRuntime: () => runtime,
          setStatus: (message, tone) => setStatus(message, tone),
        };
        const action = normalizeText(aggActionBtn.dataset.v9AggAction);
        if (action === 'mass-reminder') {
          window.CcoV9CustomersParity?.runBulkReminder?.(parityApi);
          return;
        }
        if (action === 'export') {
          window.CcoV9CustomersParity?.runBulkExport?.(parityApi);
          return;
        }
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
        runtime.detailTab = normalizeDetailTab(tab.dataset.patientTab || 'profil');
        if (tab.dataset.patientTab !== 'journal') {
          runtime.preferJournalOnMobile = false;
          runtime.editingTpEntryId = '';
          runtime.editingPrpEntryId = '';
          runtime.editingFollowUpEntryId = '';
          runtime.editingBlephEntryId = '';
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
        runtime.detailTab = normalizeDetailTab(tabJump.dataset.patientTabJump || 'journal');
        renderDetailPanel();
        return;
      }

      const openTpButton = event.target.closest('[data-patient-open-tp]');
      if (openTpButton && runtime.mode === 'register') {
        runtime.editingTpEntryId = normalizeText(openTpButton.dataset.patientOpenTp);
        runtime.editingPrpEntryId = '';
        runtime.editingFollowUpEntryId = '';
        runtime.editingBlephEntryId = '';
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
        runtime.editingBlephEntryId = '';
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
        runtime.editingBlephEntryId = '';
        runtime.editingClinicalFormKey = '';
        runtime.editingClinicalEntryId = '';
        runtime.detailTab = 'journal';
        renderDetailPanel();
        return;
      }

      const openBlephButton = event.target.closest('[data-patient-open-bleph]');
      if (openBlephButton && runtime.mode === 'register') {
        runtime.editingBlephEntryId = normalizeText(openBlephButton.dataset.patientOpenBleph);
        runtime.editingTpEntryId = '';
        runtime.editingPrpEntryId = '';
        runtime.editingFollowUpEntryId = '';
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
        runtime.editingBlephEntryId = '';
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
        void clearSmokeConsultationPhotos(clearSmokePhotosButton.dataset.patientClearSmokePhotos);
        return;
      }

      const clearPlanPhotosButton = event.target.closest('[data-patient-clear-plan-photos]');
      if (clearPlanPhotosButton && runtime.mode === 'register') {
        void deleteAllConsultationPhotos(clearPlanPhotosButton.dataset.patientClearPlanPhotos);
        return;
      }

      const draftReviewButton = event.target.closest('[data-review-draft-proposal]');
      if (draftReviewButton && runtime.mode === 'register') {
        void reviewDraftProposal(
          draftReviewButton.dataset.reviewDraftProposalId,
          draftReviewButton.dataset.reviewDraftProposal,
          draftReviewButton
        );
        return;
      }

      const actionButton = event.target.closest('[data-patient-action]');
      if (actionButton && runtime.mode === 'register') {
        if (actionButton.dataset.patientAction === 'import-historical') {
          void importHistoricalForCurrentPatient();
        } else if (
          [
            'new-tp-journal',
            'new-prp-journal',
            'new-follow-up-journal',
            'new-health-declaration',
          ].includes(actionButton.dataset.patientAction || '')
        ) {
          void handleJournalTemplateAction(
            actionButton.dataset.patientAction,
            actionButton.dataset
          );
        } else if (actionButton.dataset.patientAction === 'new-bleph-journal') {
          void createBlephJournalDraft();
        } else if (actionButton.dataset.patientAction === 'new-fitness-certificate') {
          void createClinicalJournalDraft('fitness');
        } else if (actionButton.dataset.patientAction === 'new-clinical-form') {
          void createClinicalJournalDraft(actionButton.dataset.clinicalFormKey);
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
        } else if (actionButton.dataset.patientAction === 'gdpr-export') {
          void downloadGdprExport(runtime.selectedPatientId);
        } else if (actionButton.dataset.patientAction === 'sync-fortnox') {
          void syncPatientToFortnox();
        } else if (actionButton.dataset.patientAction === 'swish-payment') {
          void createSwishPaymentForPatient();
        } else if (actionButton.dataset.patientAction === 'save-demographics') {
          void savePatientDemographics(els.patientRail);
        } else if (actionButton.dataset.patientAction === 'save-journal-access') {
          const toggle = els.patientRail?.querySelector('[data-patient-journal-block-toggle]');
          const reasonInput = els.patientRail?.querySelector('[data-patient-journal-block-reason]');
          void savePatientJournalAccess({
            journalBlocked: Boolean(toggle?.checked),
            journalBlockReason: reasonInput?.value || '',
          });
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

      const blephForm = event.target.closest('[data-bleph-journal-save-form]');
      if (blephForm && runtime.mode === 'register') {
        event.preventDefault();
        void saveBlephJournalEntry(blephForm);
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

    function bindCustomerSearchInput(input) {
      if (!input || input.dataset.patientSearchBound === '1') return;
      input.dataset.patientSearchBound = '1';
      input.addEventListener('input', () => {
        if (runtime.mode !== 'register') return;
        runtime.query = syncCustomerSearchInputs(input.value, input);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          runtime.selectedPatientId = '';
          runtime.detail = null;
          renderDetailEmpty();
          void loadPatientList({ force: true });
        }, 280);
      });
    }
    bindCustomerSearchInput(document.querySelector('[data-customer-search]'));
    bindCustomerSearchInput(document.querySelector('[data-v9-global-search-input]'));
    attachDropdownToSearchInput(document.querySelector('[data-customer-search]'));
    attachDropdownToSearchInput(document.querySelector('[data-v9-global-search-input]'));

    if (els.filter) {
      els.filter.addEventListener('change', () => {
        if (runtime.mode !== 'register') return;
        const value = normalizeText(els.filter.value);
        applyFlagFilterFromUi(V9_FLAG_FILTER_FROM_LABEL[value.toLowerCase()] || '');
      });
    }

    if (els.v9Filters && !els.v9Filters.dataset.bound) {
      els.v9Filters.dataset.bound = '1';
      els.v9Filters.addEventListener('click', (event) => {
        if (runtime.mode !== 'register' || !isV9CustomersEnabled()) return;
        // ORD-21: prioritera segment-chip framför flag-filter
        const segChip = event.target.closest('[data-v9-segment-chip]');
        if (segChip) {
          const segId = normalizeText(segChip.getAttribute('data-v9-segment-chip') ?? '') || 'all';
          if (segId === 'all') {
            applyFlagFilterFromUi('');
          } else {
            applySegmentFromUi(segId);
          }
          return;
        }
        const chip = event.target.closest('[data-v9-flag-filter]');
        if (!chip) return;
        applyFlagFilterFromUi(chip.getAttribute('data-v9-flag-filter') ?? '');
      });
    }

    if (els.v9Sidebar && !els.v9Sidebar.dataset.bound) {
      els.v9Sidebar.dataset.bound = '1';
      els.v9Sidebar.addEventListener('click', (event) => {
        const link = event.target.closest('[data-v9-segment]');
        if (!link || runtime.mode !== 'register' || !isV9CustomersEnabled()) return;
        if (link.disabled || link.classList.contains('is-disabled')) return;
        applySegmentFromUi(link.dataset.v9Segment || 'all');
      });
    }

    if (els.v9AggInsights && !els.v9AggInsights.dataset.bound) {
      els.v9AggInsights.dataset.bound = '1';
      els.v9AggInsights.addEventListener('click', (event) => {
        const card = event.target.closest('[data-v9-agg]');
        if (!card || runtime.mode !== 'register' || !isV9CustomersEnabled()) return;
        applyV9AggInsightAction(normalizeText(card.dataset.v9Agg));
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

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (runtime.mode !== 'register' || !isV9CustomersEnabled()) return;
      if (!runtime.selectedPatientId) return;
      event.preventDefault();
      closeV9DossierSelection();
    });
  }

  function onCustomersViewOpenImpl() {
    ensureCustomersShellVisible();
    resolveElements();
    applyStartupFlagFilter(parseStartupParams().flags);
    applyStartupSegmentFilter(parseStartupParams().segment);
    renderModeChrome();
    ensureMobilePatientListHistory();
    const startup = parseStartupParams();
    applyStartupFlagFilter(startup.flags);
    applyStartupSegmentFilter(startup.segment);
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
      const deferPostOpRefresh = () => {
        window.ArcanaPostOpInternalReviews?.refresh?.();
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(deferPostOpRefresh, { timeout: 5000 });
      } else {
        window.setTimeout(deferPostOpRefresh, 1800);
      }
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
        const deferSecondaryLoads = () => {
          void loadOfferTemplates();
          void loadStats();
        };
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(deferSecondaryLoads, { timeout: 3500 });
        } else {
          window.setTimeout(deferSecondaryLoads, 400);
        }
        const mobileDeepLink = deepLinkId && isMobileViewport();
        if (mobileDeepLink) {
          const loadListLater = () => {
            void loadPatientList();
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(loadListLater, { timeout: 2400 });
          } else {
            window.setTimeout(loadListLater, 320);
          }
        } else {
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
      const hydratedPayload = window.__ARCANA_DEEPLINK_HYDRATED_PAYLOAD__;
      if (
        hydratedPayload &&
        normalizeText(window.__ARCANA_DEEPLINK_HYDRATED__) === normalizeText(startup.patientId)
      ) {
        runtime.detail = hydratedPayload;
        runtime.detailLoading = false;
      } else if (!primedPatientId && !railHasPatientDetailShell()) {
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
    if (!(startup.patientId && isMobileViewport()) && !isCustomersShellActive()) {
      const deferOfferTemplates = () => {
        void loadOfferTemplates();
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(deferOfferTemplates, { timeout: 4000 });
      } else {
        window.setTimeout(deferOfferTemplates, 600);
      }
    }
    if ('serviceWorker' in navigator) {
      const unregisterWorkers = () => {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
          .catch(() => {});
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
    runtime.detailTab = normalizeDetailTab(tabKey || 'profil');
    if (tabKey === 'journal') {
      runtime.preferJournalOnMobile = true;
    } else {
      runtime.preferJournalOnMobile = false;
      runtime.editingTpEntryId = '';
      runtime.editingPrpEntryId = '';
      runtime.editingFollowUpEntryId = '';
      runtime.editingBlephEntryId = '';
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

  async function openPatient(patientId, options = {}) {
    const id = normalizeText(patientId);
    if (!id) return false;
    runtime.selectedPatientId = id;
    updatePatientRowSelection('', id);
    syncMobilePatientLayout();
    await loadPatientDetail(id);
    if (options.tab) setPatientTab(options.tab);
    return true;
  }

  async function openPatientByEmail(customerEmail, customerName = '', options = {}) {
    const email = normalizeText(customerEmail).toLowerCase();
    const nameHint = normalizeText(customerName);
    if (!email && !nameHint) return false;
    runtime.query = email || nameHint;
    const searchInput = document.querySelector('[data-customer-search]');
    if (searchInput) searchInput.value = runtime.query;
    await loadPatientList();
    const match =
      runtime.patients.find(
        (patient) => normalizeText(patient.primaryEmail).toLowerCase() === email
      ) ||
      runtime.patients.find((patient) =>
        nameHint
          ? normalizeText(patient.displayName).toLowerCase().includes(nameHint.toLowerCase())
          : false
      );
    if (!match) {
      showMobileToast(`Ingen kund hittades${email ? ` för ${email}` : ''}.`);
      return false;
    }
    return openPatient(match.patientId, options);
  }

  function renderStaffAuth() {
    resolveElements();
    if (runtime.mode !== 'register') return false;
    if (!needsStaffLogin()) return false;
    renderPatientRows();
    return true;
  }

  function refreshV10KundkortFacit() {
    if (!isV9CustomersEnabled() || !usesV10KundkortFacit()) return false;
    if (typeof window.__renderReferensKundkort !== 'function') return false;
    if (!runtime.detail?.card && !runtime.selectedPatientId) return false;
    renderDetailPanel();
    return true;
  }

  window.addEventListener('arcana:v10-kundkort-ready', () => {
    window.requestAnimationFrame(() => {
      refreshV10KundkortFacit();
    });
  });

  window.ArcanaPatientMasterUi = {
    onCustomersViewOpen,
    setMode,
    getRuntime: () => ({ ...runtime }),
    isV9CustomersEnabled,
    isV9DemoEnabled,
    needsStaffLogin,
    renderStaffAuth,
    clearMobilePatientSelection,
    goBackToPatientList,
    syncMobilePatientLayout,
    setPatientTab,
    showMobileToast,
    setCustomerSearchQuery,
    openPatient,
    openPatientByEmail,
    refreshV10KundkortFacit,
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
  window.CcoPatientMasterUi = {
    getRuntime: () => runtime,
    renderRows: renderPatientRows,
    setStatus,
    switchDetailTab,
    sortPatients: sortPatientsForV9Display,
    syncListChrome: syncV9ListChromeLocal,
    setCustomerSearchQuery,
  };
  window.CcoV9CustomersParity?.install?.(window.CcoPatientMasterUi);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchCustomersShellActivation, { once: true });
  } else {
    watchCustomersShellActivation();
  }
})();
