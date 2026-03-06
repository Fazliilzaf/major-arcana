(function () {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const RISK_FILTERS_KEY = 'ARCANA_ADMIN_RISK_FILTERS';
  const AUDIT_FILTERS_KEY = 'ARCANA_ADMIN_AUDIT_FILTERS';
  const TEMPLATE_LIST_FILTERS_KEY = 'ARCANA_ADMIN_TEMPLATE_LIST_FILTERS';
  const LIST_SCROLL_STATE_KEY = 'ARCANA_ADMIN_LIST_SCROLL_STATE';
  const LANGUAGE_KEY = 'ARCANA_ADMIN_LANGUAGE';
  const DENSITY_KEY = 'ARCANA_ADMIN_DENSITY';
  const TOAST_AUTO_DISMISS_MS = 6000;
  const DASHBOARD_STREAM_RETRY_MIN_MS = 1500;
  const DASHBOARD_STREAM_RETRY_MAX_MS = 15000;
  const DASHBOARD_STREAM_REFRESH_DEBOUNCE_MS = 1200;
  const CCO_AUTO_REFRESH_BOOT_MS = 1200;
  const CCO_AUTO_REFRESH_INTERVAL_MS = 45000;
  const CCO_AUTO_REFRESH_RETRY_MS = 12000;
  const BRAND_PRIMARY_COLORS = Object.freeze(['#d8b38f', '#e6c6a5', '#c89f79', '#b78761']);
  const BRAND_ACCENT_COLORS = Object.freeze(['#2e2016', '#3a2a1e', '#4c3a2c', '#6b5747']);
  const DEFAULT_BRAND_PRIMARY_COLOR = '#d8b38f';
  const DEFAULT_BRAND_ACCENT_COLOR = '#2e2016';
  const SUPPORTED_LANGUAGES = Object.freeze(['sv', 'en']);
  const SECTION_GROUP_HASH_MAP = Object.freeze({
    overviewSection: '#overview',
    ccoWorkspaceSection: '#cco',
    templateLifecycleSection: '#templates',
    reviewsIncidentsSection: '#reviews',
    auditSection: '#audit',
    teamSection: '#team',
    settingsSection: '#settings',
    opsSection: '#ops',
  });
  const ADMIN_PRIMARY_PATH = '/admin';
  const CCO_PRIMARY_PATH = '/cco';
  const CCO_UNANSWERED_PRIMARY_PATH = '/unanswered';
  const CCO_THREAD_QUERY_PARAM = 'thread';
  const CCO_WORKSPACE_SESSION_KEY = 'ARCANA_CCO_WORKSPACE_STATE';
  const CCO_LAST_SEEN_AT_KEY = 'ARCANA_CCO_LAST_SEEN_AT';
  const CCO_EVIDENCE_QUERY_PARAM = 'evidence';
  const CCO_EVIDENCE_ALLOWED_HOSTS = Object.freeze([
    'arcana-staging.onrender.com',
    'arcana.hairtpclinic.se',
    'localhost',
    '127.0.0.1',
  ]);
  const TRANSLATIONS = Object.freeze({
    sv: {
      brand_title: 'Major Arcana',
      label_language: 'Språk',
      density_compact: 'Kompakt vy',
      density_regular: 'Standardvy',
      language_sv: 'Svenska',
      language_en: 'English',
      session_not_logged: 'Inte inloggad',
      session_tenant: 'Klinik',
      session_role: 'Roll',
      tenant_option: 'Klinik',
      switch_tenant: 'Byt klinik',
      refresh: 'Uppdatera',
      logout: 'Logga ut',
      login_title: 'Logga in',
      label_email: 'E-post',
      label_tenant_optional: 'Klinik (valfri)',
      label_password: 'Lösenord',
      label_multi_tenant: 'Flera kliniker hittades. Välj klinik:',
      continue: 'Fortsätt',
      nav_overview: 'Översikt',
      nav_cco: 'CCO',
      nav_templates: 'Mallar',
      nav_reviews: 'Granskningar',
      nav_incidents: 'Incidenter',
      nav_audit: 'Revision',
      nav_team: 'Team',
      nav_settings: 'Inställningar',
      nav_ops: 'Drift',
      kpi_templates: 'Mallar',
      nav_unanswered: 'Obesvarade',
      kpi_owner_coverage: 'Ägaråtgärdstäckning',
      kpi_readiness: 'Beredskap',
      kpi_pilot_report: 'Pilotrapport',
      monitor_scheduler_jobs: 'Schedulerjobb (krav)',
      monitor_readiness_history: 'Beredskapshistorik',
      monitor_readiness_nogo: 'Beredskapsblockeringar (No-Go)',
      open_queue: 'Öppna kö',
      see_incidents: 'Se incidenter',
      overview_insights: 'Översiktsinsikter',
      latest_activity: 'Senaste aktivitet',
      risk_trends: 'Risktrender (7 dagar)',
      quick_actions: 'Snabbåtgärder',
      quick_create_template: 'Skapa mall',
      quick_generate_draft: 'Skapa utkast med AI',
      quick_review_flagged: 'Granska flaggade utkast',
      notifications: 'Notifieringar',
      tenant_config: 'Klinikinställningar',
      save_config: 'Spara inställningar',
      template_categories: 'Mallkategorier',
      risk_levels: 'Risknivåer',
      my_tenants: 'Mina kliniker',
      refresh_tenants: 'Uppdatera kliniklista',
      onboard_tenant: 'Lägg till ny klinik',
      onboard_tenant_btn: 'Lägg till klinik',
    },
    en: {
      brand_title: 'Major Arcana',
      label_language: 'Language',
      density_compact: 'Compact view',
      density_regular: 'Standard view',
      language_sv: 'Swedish',
      language_en: 'English',
      session_not_logged: 'Not signed in',
      session_tenant: 'Clinic',
      session_role: 'Role',
      tenant_option: 'Clinic',
      switch_tenant: 'Switch clinic',
      refresh: 'Refresh',
      logout: 'Sign out',
      login_title: 'Sign in',
      label_email: 'Email',
      label_tenant_optional: 'Clinic (optional)',
      label_password: 'Password',
      label_multi_tenant: 'Multiple clinics found. Select clinic:',
      continue: 'Continue',
      nav_overview: 'Overview',
      nav_cco: 'CCO',
      nav_templates: 'Templates',
      nav_reviews: 'Reviews',
      nav_incidents: 'Incidents',
      nav_audit: 'Audit',
      nav_team: 'Team',
      nav_settings: 'Settings',
      nav_ops: 'Operations',
      nav_unanswered: 'Unanswered',
      kpi_templates: 'Templates',
      kpi_owner_coverage: 'Owner action coverage',
      kpi_readiness: 'Readiness',
      kpi_pilot_report: 'Pilot report',
      monitor_scheduler_jobs: 'Scheduler jobs (required)',
      monitor_readiness_history: 'Readiness history',
      monitor_readiness_nogo: 'Readiness blockers (No-Go)',
      open_queue: 'Open queue',
      see_incidents: 'View incidents',
      overview_insights: 'Overview insights',
      latest_activity: 'Latest activity',
      risk_trends: 'Risk trends (7 days)',
      quick_actions: 'Quick actions',
      quick_create_template: 'Create template',
      quick_generate_draft: 'Generate draft with AI',
      quick_review_flagged: 'Review flagged drafts',
      notifications: 'Notifications',
      tenant_config: 'Clinic settings',
      save_config: 'Save settings',
      template_categories: 'Template categories',
      risk_levels: 'Risk levels',
      my_tenants: 'My clinics',
      refresh_tenants: 'Refresh clinic list',
      onboard_tenant: 'Add new clinic',
      onboard_tenant_btn: 'Add clinic',
    },
  });

  function isCcoRoutePath(pathname = '') {
    const normalized = String(pathname || '').trim().toLowerCase();
    return (
      normalized.endsWith('/cco') ||
      normalized.endsWith('/ccp') ||
      normalized.endsWith('/agents/cco') ||
      normalized.endsWith('/admin/cco')
    );
  }

  function isUnansweredRoutePath(pathname = '') {
    void pathname;
    return false;
  }

  function getEventTargetElement(event = null) {
    if (!event) return null;
    const target = event.target;
    if (target instanceof Element) return target;
    if (target && target.parentElement instanceof Element) return target.parentElement;
    return null;
  }

  function closestFromEventTarget(event = null, selector = '') {
    const safeSelector = String(selector || '').trim();
    if (!safeSelector) return null;
    const targetEl = getEventTargetElement(event);
    if (!targetEl) return null;
    return targetEl.closest(safeSelector);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isCcoInteractionDebugEnabled() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('cco_debug_clicks') === '1') return true;
    try {
      return localStorage.getItem('ARCANA_CCO_DEBUG_CLICKS') === '1';
    } catch {
      return false;
    }
  }

  function logCcoInteraction(eventName = '', payload = {}) {
    if (!isCcoInteractionDebugEnabled()) return;
    try {
      const stamp = new Date().toISOString();
      console.info(`[CCO click-debug] ${stamp} ${String(eventName || '').trim()}`, payload);
    } catch {
      // Ignore console failures.
    }
  }

  function readCcoViewModeFromLocation() {
    return 'all';
  }

  function readCcoThreadFromLocation() {
    if (!isCcoRoutePath(window.location.pathname || '')) return '';
    const searchParams = new URLSearchParams(window.location.search || '');
    return String(searchParams.get(CCO_THREAD_QUERY_PARAM) || '').trim();
  }

  function isCcoEvidenceModeEnabled() {
    const searchParams = new URLSearchParams(window.location.search || '');
    const requested = searchParams.get(CCO_EVIDENCE_QUERY_PARAM) === '1';
    if (!requested) return false;
    const host = String(window.location.hostname || '').trim().toLowerCase();
    return CCO_EVIDENCE_ALLOWED_HOSTS.includes(host);
  }

  function readCcoLastSeenAtMs() {
    try {
      const raw = String(localStorage.getItem(CCO_LAST_SEEN_AT_KEY) || '').trim();
      if (!raw) {
        const now = Date.now();
        persistCcoLastSeenAtMs(now);
        return now;
      }
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
      const now = Date.now();
      persistCcoLastSeenAtMs(now);
      return now;
    } catch {
      return Date.now();
    }
  }

  function persistCcoLastSeenAtMs(value = Date.now()) {
    const safeValue = Number(value);
    const iso = Number.isFinite(safeValue) ? new Date(safeValue).toISOString() : new Date().toISOString();
    try {
      localStorage.setItem(CCO_LAST_SEEN_AT_KEY, iso);
    } catch {
      // ignore localStorage failures
    }
    return iso;
  }

  function readCcoWorkspaceSessionState() {
    try {
      const raw = sessionStorage.getItem(CCO_WORKSPACE_SESSION_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch {
      return {};
    }
  }

  function readArcanaUiBuildMarker() {
    const fromMeta = document
      .querySelector('meta[name="arcana-ui-build"]')
      ?.getAttribute('content');
    const safeMeta = String(fromMeta || '').trim();
    if (safeMeta) return safeMeta;
    const script = document.querySelector('script[src*="/admin.js"]');
    const src = String(script?.getAttribute('src') || '').trim();
    if (!src) return '';
    try {
      const url = new URL(src, window.location.origin);
      return String(url.searchParams.get('v') || '').trim();
    } catch {
      return '';
    }
  }

  function maybeResetArcanaUiClientState() {
    const params = new URLSearchParams(window.location.search || '');
    const shouldReset = params.get('arcana_reset') === '1';
    const buildKey = 'ARCANA_UI_BUILD';
    const build = readArcanaUiBuildMarker();
    try {
      const previousBuild = String(localStorage.getItem(buildKey) || '').trim();
      if (build && build !== previousBuild) {
        localStorage.setItem(buildKey, build);
      }
      if (!shouldReset) return false;
      sessionStorage.removeItem(CCO_WORKSPACE_SESSION_KEY);
      localStorage.removeItem(CCO_LAST_SEEN_AT_KEY);
      localStorage.removeItem(RISK_FILTERS_KEY);
      localStorage.removeItem(AUDIT_FILTERS_KEY);
      localStorage.removeItem(TEMPLATE_LIST_FILTERS_KEY);
      localStorage.removeItem(LIST_SCROLL_STATE_KEY);
      localStorage.removeItem(DENSITY_KEY);
      localStorage.removeItem(LANGUAGE_KEY);
    } catch {
      // Ignore storage failures (private mode etc).
    }
    params.delete('arcana_reset');
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash || ''}`;
    window.location.replace(nextUrl);
    return true;
  }

  if (maybeResetArcanaUiClientState()) return;

  const initialCcoWorkspaceSession = readCcoWorkspaceSessionState();

  function sanitizeCcoDraftMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries = Object.entries(value)
      .slice(0, 50)
      .map(([conversationId, draft]) => [String(conversationId || '').trim(), String(draft || '')]);
    const safe = {};
    for (const [conversationId, draft] of entries) {
      if (!conversationId || !draft.trim()) continue;
      safe[conversationId] = draft.slice(0, 12000);
    }
    return safe;
  }

  function sanitizeCcoScrollMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe = {};
    for (const [conversationId, scrollTopRaw] of Object.entries(value).slice(0, 50)) {
      const conversationKey = String(conversationId || '').trim();
      const scrollTop = Number(scrollTopRaw);
      if (!conversationKey || !Number.isFinite(scrollTop) || scrollTop < 0) continue;
      safe[conversationKey] = Math.round(scrollTop);
    }
    return safe;
  }

  function sanitizeCcoDraftModeMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe = {};
    for (const [conversationIdRaw, modeRaw] of Object.entries(value).slice(0, 50)) {
      const conversationId = String(conversationIdRaw || '').trim();
      const mode = String(modeRaw || '').trim().toLowerCase();
      if (!conversationId) continue;
      if (!['short', 'warm', 'professional'].includes(mode)) continue;
      safe[conversationId] = mode;
    }
    return safe;
  }

  function sanitizeCcoSystemFlagMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe = {};
    for (const [conversationIdRaw, flagRaw] of Object.entries(value).slice(0, 200)) {
      const conversationId = String(conversationIdRaw || '').trim();
      if (!conversationId) continue;
      if (flagRaw === true || String(flagRaw || '').trim().toLowerCase() === 'true') {
        safe[conversationId] = true;
        continue;
      }
      if (flagRaw === false || String(flagRaw || '').trim().toLowerCase() === 'false') {
        safe[conversationId] = false;
      }
    }
    return safe;
  }

  function sanitizeCcoSystemPatternList(value = []) {
    const source = Array.isArray(value) ? value : [];
    const dedupe = new Set();
    const safe = [];
    for (const entry of source.slice(0, 200)) {
      const normalized = String(entry || '').trim().toLowerCase();
      if (!normalized || normalized.length < 2) continue;
      if (dedupe.has(normalized)) continue;
      dedupe.add(normalized);
      safe.push(normalized.slice(0, 240));
    }
    return safe;
  }

  function sanitizeCcoDeleteCapabilityStatus(value = null) {
    const source = value && typeof value === 'object' ? value : {};
    const deleteEnabled = source.deleteEnabled === true;
    const reason = String(source.reason || '').trim();
    const reasonCode = String(source.reasonCode || '').trim();
    return {
      deleteEnabled,
      reason: reason || '',
      reasonCode: reasonCode || '',
    };
  }

  function sanitizeCcoSignaturePreviewExpanded(value = false) {
    if (value === true || value === 1) return true;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return normalized === 'true' || normalized === '1';
  }

  function sanitizeCcoIncludeSignature(value = true) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'false' || normalized === '0') return false;
    return true;
  }

  function sanitizeCcoMailboxFiltersExpanded(value = false) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    return false;
  }

  function sanitizeCcoExtraFiltersExpanded(value = false) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    return false;
  }

  function sanitizeCcoWorkspaceCompact(value = true) {
    if (value === false || value === 0) return false;
    if (value === true || value === 1) return true;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'false' || normalized === '0') return false;
    return true;
  }

  function sanitizeCcoCenterReadTab(value = 'conversation') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'customer') return 'customer';
    return 'conversation';
  }

  const CCO_LOCKED_MAILBOX_ALLOWLIST = Object.freeze([
    'egzona@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
    'marknad@hairtpclinic.com',
  ]);
  const CCO_LOCKED_MAILBOX_ALLOWLIST_SET = new Set(
    CCO_LOCKED_MAILBOX_ALLOWLIST.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  );

  function sanitizeCcoMailboxFilter(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'all') return 'all';
    if (!CCO_LOCKED_MAILBOX_ALLOWLIST_SET.has(normalized)) return 'all';
    return normalized.slice(0, 320);
  }

  function sanitizeCcoSearchQuery(value = '') {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  function sanitizeCcoShowSystemMessages(value = false) {
    if (value === true || value === 1) return true;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return normalized === 'true' || normalized === '1';
  }

  function sanitizeCcoViewMode(value = '') {
    void value;
    return 'all';
  }

  const CCO_MAIL_VIEW_MODES = Object.freeze(['queue', 'inbound', 'sent']);

  function sanitizeCcoMailViewMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (CCO_MAIL_VIEW_MODES.includes(normalized)) return normalized;
    return 'queue';
  }

  const CCO_INDICATOR_VIEW_FILTERS = Object.freeze([
    'all',
    'new',
    'critical',
    'high',
    'medium',
    'handled',
  ]);

  function sanitizeCcoIndicatorViewFilter(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (CCO_INDICATOR_VIEW_FILTERS.includes(normalized)) return normalized;
    return 'all';
  }

  const CCO_INDICATOR_OVERRIDE_STATES = Object.freeze([
    'new',
    'medium',
    'high',
    'critical',
    'handled',
  ]);

  function sanitizeCcoIndicatorOverrideState(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (CCO_INDICATOR_OVERRIDE_STATES.includes(normalized)) return normalized;
    return '';
  }

  function sanitizeCcoIndicatorOverrideMap(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe = {};
    for (const [conversationIdRaw, rawOverride] of Object.entries(value).slice(0, 500)) {
      const conversationId = String(conversationIdRaw || '').trim();
      if (!conversationId) continue;
      const source = rawOverride && typeof rawOverride === 'object' ? rawOverride : {};
      const overrideState = sanitizeCcoIndicatorOverrideState(source.state || rawOverride);
      if (!overrideState) continue;
      const overrideBy = String(source.overrideBy || source.by || '').trim().slice(0, 120);
      const overrideAt = toIso(source.overrideAt || source.at) || new Date().toISOString();
      safe[conversationId] = {
        state: overrideState,
        overrideBy,
        overrideAt,
      };
    }
    return safe;
  }

  function sanitizeCcoSlaFilter(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['all', 'breach', 'warning', 'safe', 'new'].includes(normalized)) {
      return normalized;
    }
    return 'all';
  }

  function sanitizeCcoLifecycleFilter(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (
      [
        'all',
        'new',
        'active_dialogue',
        'awaiting_reply',
        'follow_up_pending',
        'dormant',
        'handled',
        'archived',
      ].includes(normalized)
    ) {
      return normalized;
    }
    return 'all';
  }

  const CCO_DENSITY_MODES = Object.freeze(['focus', 'work', 'overview']);
  const CCO_DEFAULT_DENSITY_MODE = 'work';
  const CCO_VISUAL_LIMITS = Object.freeze({
    sprint: 3,
    high: 7,
    needs: 12,
    maxVisibleRows: 15,
  });
  const CCO_COLUMN_RESIZE_BREAKPOINT = 1360;
  const CCO_COLUMN_WIDTH_LIMITS = Object.freeze({
    leftMin: 260,
    leftMax: 280,
    rightMin: 380,
    rightMax: 460,
    centerMin: 520,
  });

  function sanitizeCcoDensityMode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (CCO_DENSITY_MODES.includes(normalized)) return normalized;
    return CCO_DEFAULT_DENSITY_MODE;
  }

  function defaultCcoSectionExpandedState() {
    return {
      sprint: true,
      high: true,
      needs: true,
      rest: false,
    };
  }

  function sanitizeCcoSectionExpandedState(value = null) {
    const fallback = defaultCcoSectionExpandedState();
    const safe = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      sprint: safe.sprint !== false,
      high: safe.high !== false,
      needs: safe.needs !== false,
      rest: safe.rest === true,
    };
  }

  function sanitizeCcoColumnLayout(value = null) {
    const safe = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const left = Number(safe.left);
    const right = Number(safe.right);
    return {
      left: Number.isFinite(left) ? Math.round(left) : null,
      right: Number.isFinite(right) ? Math.round(right) : null,
    };
  }

  function loadLanguage() {
    const raw = String(localStorage.getItem(LANGUAGE_KEY) || 'sv')
      .trim()
      .toLowerCase();
    return SUPPORTED_LANGUAGES.includes(raw) ? raw : 'sv';
  }

  function loadDensityMode() {
    const raw = String(localStorage.getItem(DENSITY_KEY) || 'regular')
      .trim()
      .toLowerCase();
    return raw === 'compact' ? 'compact' : 'regular';
  }

  function parseStorageJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
      return parsed;
    } catch {
      return fallback;
    }
  }

  function loadRiskFilters() {
    const parsed = parseStorageJson(RISK_FILTERS_KEY, {});
    const minRiskLevel = Number.parseInt(String(parsed.minRiskLevel ?? '3'), 10);
    const maxRiskLevel = Number.parseInt(String(parsed.maxRiskLevel ?? '5'), 10);
    const sinceDays = Number.parseInt(String(parsed.sinceDays ?? '14'), 10);
    const ownerDecision = typeof parsed.ownerDecision === 'string' ? parsed.ownerDecision.trim() : '';
    const decision = typeof parsed.decision === 'string' ? parsed.decision.trim() : '';
    const category = typeof parsed.category === 'string' ? parsed.category.trim() : '';
    const state = typeof parsed.state === 'string' ? parsed.state.trim() : '';
    const reasonCode = typeof parsed.reasonCode === 'string' ? parsed.reasonCode.trim() : '';
    const search = typeof parsed.search === 'string' ? parsed.search.trim() : '';
    const minNormalized = Number.isFinite(minRiskLevel) ? Math.max(1, Math.min(5, minRiskLevel)) : 3;
    const maxNormalized = Number.isFinite(maxRiskLevel) ? Math.max(1, Math.min(5, maxRiskLevel)) : 5;
    return {
      minRiskLevel: Math.min(minNormalized, maxNormalized),
      maxRiskLevel: Math.max(minNormalized, maxNormalized),
      sinceDays: Number.isFinite(sinceDays) ? Math.max(0, Math.min(365, sinceDays)) : 14,
      ownerDecision,
      decision,
      category,
      state,
      reasonCode,
      search,
    };
  }

  function loadAuditFilters() {
    const parsed = parseStorageJson(AUDIT_FILTERS_KEY, {});
    const sinceDays = Number.parseInt(String(parsed.sinceDays ?? '14'), 10);
    const limit = Number.parseInt(String(parsed.limit ?? '200'), 10);
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      action: typeof parsed.action === 'string' ? parsed.action : '',
      actorUserId: typeof parsed.actorUserId === 'string' ? parsed.actorUserId : '',
      targetType: typeof parsed.targetType === 'string' ? parsed.targetType : '',
      outcome: typeof parsed.outcome === 'string' ? parsed.outcome : '',
      severity: typeof parsed.severity === 'string' ? parsed.severity : '',
      sinceDays: Number.isFinite(sinceDays) ? Math.max(0, Math.min(365, sinceDays)) : 14,
      limit: Number.isFinite(limit) ? Math.max(50, Math.min(500, limit)) : 200,
    };
  }

  function loadTemplateListFilters() {
    const parsed = parseStorageJson(TEMPLATE_LIST_FILTERS_KEY, {});
    const sort = typeof parsed.sort === 'string' ? parsed.sort : 'updated_desc';
    const view = String(parsed.view || 'table').trim() === 'card' ? 'card' : 'table';
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      category: typeof parsed.category === 'string' ? parsed.category : '',
      status: typeof parsed.status === 'string' ? parsed.status : '',
      sort,
      view,
    };
  }

  function loadListScrollState() {
    const parsed = parseStorageJson(LIST_SCROLL_STATE_KEY, {});
    const normalized = {};
    for (const [key, rawValue] of Object.entries(parsed)) {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) continue;
      normalized[key] = Math.round(value);
    }
    return normalized;
  }

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    language: loadLanguage(),
    densityMode: loadDensityMode(),
    role: '',
    tenantId: '',
    pendingLoginTicket: '',
    pendingMfaTicket: '',
    availableTenants: [],
    templates: [],
    versions: [],
    versionRevisions: [],
    selectedRevisionFrom: null,
    selectedRevisionTo: null,
    selectedRollbackRevision: null,
    sessions: [],
    selectedTemplateId: '',
    selectedVersionId: '',
    selectedTemplateIds: [],
    riskEvaluations: [],
    selectedRiskEvaluationId: '',
    selectedRiskIds: [],
    auditEvents: [],
    selectedAuditEventId: '',
    staffMembers: [],
    staffFilters: {
      search: '',
      status: '',
    },
    filteredStaffMembershipIds: [],
    selectedStaffMembershipId: '',
    lastInviteMessage: '',
    profile: null,
    calibrationSuggestion: null,
    ccoInboxData: null,
    ccoInboxViewMode: sanitizeCcoViewMode(
      readCcoViewModeFromLocation() || initialCcoWorkspaceSession.viewMode || 'all'
    ),
    ccoMailViewMode: sanitizeCcoMailViewMode(initialCcoWorkspaceSession.mailViewMode || 'queue'),
    ccoInboxMailboxFilter: sanitizeCcoMailboxFilter(initialCcoWorkspaceSession.mailboxFilter || 'all'),
    ccoInboxSlaFilter: sanitizeCcoSlaFilter(initialCcoWorkspaceSession.slaFilter || 'all'),
    ccoInboxLifecycleFilter: sanitizeCcoLifecycleFilter(
      initialCcoWorkspaceSession.lifecycleFilter || 'all'
    ),
    ccoIndicatorViewFilter: sanitizeCcoIndicatorViewFilter(
      initialCcoWorkspaceSession.indicatorViewFilter || 'all'
    ),
    ccoInboxSearchQuery: sanitizeCcoSearchQuery(initialCcoWorkspaceSession.searchQuery || ''),
    ccoInboxShowSystemMessages: sanitizeCcoShowSystemMessages(
      initialCcoWorkspaceSession.showSystemMessages
    ),
    ccoInboxDensityMode: sanitizeCcoDensityMode(
      initialCcoWorkspaceSession.densityMode || CCO_DEFAULT_DENSITY_MODE
    ),
    ccoMailboxFiltersExpanded: sanitizeCcoMailboxFiltersExpanded(
      initialCcoWorkspaceSession.mailboxFiltersExpanded
    ),
    ccoExtraFiltersExpanded: sanitizeCcoExtraFiltersExpanded(
      initialCcoWorkspaceSession.extraFiltersExpanded
    ),
    ccoWorkspaceCompact: sanitizeCcoWorkspaceCompact(initialCcoWorkspaceSession.workspaceCompact),
    ccoCenterReadTab: sanitizeCcoCenterReadTab(initialCcoWorkspaceSession.centerReadTab),
    ccoColumnLayout: sanitizeCcoColumnLayout(initialCcoWorkspaceSession.columnLayout),
    ccoInboxSectionExpanded: sanitizeCcoSectionExpandedState(
      initialCcoWorkspaceSession.sectionExpanded
    ),
    ccoSelectedConversationId:
      readCcoThreadFromLocation() ||
      String(initialCcoWorkspaceSession.selectedConversationId || '').trim(),
    ccoDraftOverrideByConversationId: sanitizeCcoDraftMap(
      initialCcoWorkspaceSession.draftsByConversationId
    ),
    ccoDraftModeByConversationId: sanitizeCcoDraftModeMap(
      initialCcoWorkspaceSession.draftModeByConversationId
    ),
    ccoSystemMessageByConversationId: sanitizeCcoSystemFlagMap(
      initialCcoWorkspaceSession.systemMessageByConversationId
    ),
    ccoIndicatorOverrideByConversationId: sanitizeCcoIndicatorOverrideMap(
      initialCcoWorkspaceSession.indicatorOverrideByConversationId
    ),
    ccoSystemMessageSenderPatterns: sanitizeCcoSystemPatternList(
      initialCcoWorkspaceSession.systemMessageSenderPatterns
    ),
    ccoSystemMessageSubjectPatterns: sanitizeCcoSystemPatternList(
      initialCcoWorkspaceSession.systemMessageSubjectPatterns
    ),
    ccoDeleteCapability: sanitizeCcoDeleteCapabilityStatus(),
    ccoSelectedMessageContextByConversationId: {},
    ccoDraftEvaluationByConversationId: {},
    ccoSenderMailboxId: 'contact@hairtpclinic.com',
    ccoSenderMailboxOptions: [],
    ccoSignatureProfile: 'egzona',
    ccoSignatureProfiles: [],
    ccoIncludeSignature: sanitizeCcoIncludeSignature(
      initialCcoWorkspaceSession.includeSignature
    ),
    ccoSignaturePreviewExpanded: sanitizeCcoSignaturePreviewExpanded(
      initialCcoWorkspaceSession.signaturePreviewExpanded
    ),
    ccoConversationScrollTopByConversationId: sanitizeCcoScrollMap(
      initialCcoWorkspaceSession.scrollTopByConversationId
    ),
    ccoSprintActive: false,
    ccoSprintQueueIds: [],
    ccoSprintCompletedIds: [],
    ccoSprintLabelByConversationId: {},
    ccoSprintInitialTotal: 0,
    ccoSprintId: '',
    ccoSprintStartedAtMs: 0,
    ccoSprintMetrics: null,
    ccoSprintLatestFeedback: null,
    ccoUsageAnalytics: null,
    ccoRedFlagState: null,
    ccoAdaptiveFocusState: null,
    ccoRecoveryState: null,
    ccoStrategicInsights: null,
    ccoAdaptiveFocusShowAll: false,
    ccoFocusWorkloadMinutes: 0,
    ccoCustomerSummaryExpanded: false,
    ccoPendingSoftBreakConversationId: '',
    ccoIndicatorContextConversationId: '',
    ccoSelectedFeedMessageId: String(initialCcoWorkspaceSession.selectedFeedMessageId || '').trim(),
    ccoLastSeenAtMs: readCcoLastSeenAtMs(),
    ccoSeenConversationIds: {},
    writingIdentityProfiles: [],
    selectedWritingIdentityMailbox: '',
    riskFilters: loadRiskFilters(),
    auditFilters: loadAuditFilters(),
    templateListFilters: loadTemplateListFilters(),
    listScrollState: loadListScrollState(),
    templateMeta: {
      categories: [],
      variableWhitelist: {},
      requiredVariables: {},
      signaturesByChannel: {},
      ownerActions: [],
    },
    templateMetaTenantId: '',
    lastVariableValidation: null,
    lastToastKey: '',
    lastToastAt: 0,
    toastSequence: 0,
    activeSectionGroup: 'overviewSection',
    dashboardStreamController: null,
    dashboardStreamReconnectTimer: null,
    dashboardStreamRetryMs: DASHBOARD_STREAM_RETRY_MIN_MS,
    dashboardStreamActiveKey: '',
    dashboardStreamRunId: 0,
    dashboardRealtimeRefreshTimer: null,
    ccoAutoRefreshTimer: null,
    ccoAutoRefreshInFlight: false,
    ccoInboxBriefRunInFlight: false,
    ccoInboxLoading: false,
    ccoInboxLastSyncAt: '',
    ccoAutoSwitchToInboundPending: false,
    monitorDetailsVisible: false,
    ccoEvidenceMode: isCcoEvidenceModeEnabled(),
  };

  if (state.ccoInboxSlaFilter === 'unanswered') {
    state.ccoInboxSlaFilter = 'all';
  }
  state.ccoWorkspaceCompact = true;

  const els = {
    adminHeader: document.getElementById('adminHeader'),
    loginPanel: document.getElementById('loginPanel'),
    dashboardPanel: document.getElementById('dashboardPanel'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    tenantInput: document.getElementById('tenantInput'),
    tenantSelectionPanel: document.getElementById('tenantSelectionPanel'),
    tenantSelectionSelect: document.getElementById('tenantSelectionSelect'),
    completeTenantSelectionBtn: document.getElementById('completeTenantSelectionBtn'),
    loginBtn: document.getElementById('loginBtn'),
    loginStatus: document.getElementById('loginStatus'),
    appModalBackdrop: document.getElementById('appModalBackdrop'),
    appModalDialog: document.getElementById('appModalDialog'),
    appModalTitle: document.getElementById('appModalTitle'),
    appModalSubtitle: document.getElementById('appModalSubtitle'),
    appModalInputLabel: document.getElementById('appModalInputLabel'),
    appModalInput: document.getElementById('appModalInput'),
    appModalTextarea: document.getElementById('appModalTextarea'),
    appModalHint: document.getElementById('appModalHint'),
    appModalCancelBtn: document.getElementById('appModalCancelBtn'),
    appModalConfirmBtn: document.getElementById('appModalConfirmBtn'),
    appModalCloseBtn: document.getElementById('appModalCloseBtn'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerReviews: document.getElementById('drawerReviews'),
    drawerIncidents: document.getElementById('drawerIncidents'),
    drawerAudit: document.getElementById('drawerAudit'),
    drawerReviewsTitle: document.getElementById('drawerReviewsTitle'),
    drawerReviewsMeta: document.getElementById('drawerReviewsMeta'),
    drawerReviewsReasons: document.getElementById('drawerReviewsReasons'),
    drawerIncidentsTitle: document.getElementById('drawerIncidentsTitle'),
    drawerIncidentsMeta: document.getElementById('drawerIncidentsMeta'),
    drawerIncidentsReasons: document.getElementById('drawerIncidentsReasons'),
    drawerAuditTitle: document.getElementById('drawerAuditTitle'),
    drawerAuditMeta: document.getElementById('drawerAuditMeta'),
    drawerAuditCorrelation: document.getElementById('drawerAuditCorrelation'),
    toastViewport: document.getElementById('toastViewport'),
    sessionMeta: document.getElementById('sessionMeta'),
    languageSelect: document.getElementById('languageSelect'),
    densityToggleBtn: document.getElementById('densityToggleBtn'),
    tenantSwitchSelect: document.getElementById('tenantSwitchSelect'),
    switchTenantBtn: document.getElementById('switchTenantBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    templatesTotal: document.getElementById('templatesTotal'),
    templatesActive: document.getElementById('templatesActive'),
    riskTotal: document.getElementById('riskTotal'),
    riskOpen: document.getElementById('riskOpen'),
    ownerCoverageValue: document.getElementById('ownerCoverageValue'),
    ownerCoverageMeta: document.getElementById('ownerCoverageMeta'),
    slaIndicatorValue: document.getElementById('slaIndicatorValue'),
    slaIndicatorMeta: document.getElementById('slaIndicatorMeta'),
    readinessBandValue: document.getElementById('readinessBandValue'),
    readinessBandMeta: document.getElementById('readinessBandMeta'),
    pilotReportValue: document.getElementById('pilotReportValue'),
    pilotReportMeta: document.getElementById('pilotReportMeta'),
    latestActivityList: document.getElementById('latestActivityList'),
    riskTrendBars: document.getElementById('riskTrendBars'),
    riskTrendMeta: document.getElementById('riskTrendMeta'),
    quickCreateTemplateBtn: document.getElementById('quickCreateTemplateBtn'),
    quickGenerateDraftBtn: document.getElementById('quickGenerateDraftBtn'),
    quickReviewFlaggedBtn: document.getElementById('quickReviewFlaggedBtn'),
    openReviewsQueueBtn: document.getElementById('openReviewsQueueBtn'),
    openIncidentsQueueBtn: document.getElementById('openIncidentsQueueBtn'),
    overviewNotificationsList: document.getElementById('overviewNotificationsList'),
    sectionNav: document.getElementById('sectionNav'),
    templateLifecycleSection: document.getElementById('templateLifecycleSection'),
    reviewsQueueSection: document.getElementById('reviewsQueueSection'),
    incidentsQueueSection: document.getElementById('incidentsQueueSection'),
    reviewsIncidentsSection: document.getElementById('reviewsIncidentsSection'),
    auditSection: document.getElementById('auditSection'),
    teamSection: document.getElementById('teamSection'),
    opsSection: document.getElementById('opsSection'),
    settingsSection: document.getElementById('settingsSection'),
    overviewSection: document.getElementById('overviewSection'),
    ccoWorkspaceSection: document.getElementById('ccoWorkspaceSection'),
    ccoWorkspaceLayout: document.getElementById('ccoWorkspaceLayout'),
    ccoInboxControlsColumn: document.getElementById('ccoInboxControlsColumn'),
    ccoCenterColumn: document.getElementById('ccoCenterColumn'),
    ccoReplyColumn: document.getElementById('ccoReplyColumn'),
    ccoResizeHandleLeft: document.getElementById('ccoResizeHandleLeft'),
    ccoResizeHandleRight: document.getElementById('ccoResizeHandleRight'),
    openCcoWorkspaceBtn: document.getElementById('openCcoWorkspaceBtn'),
    ccoWorkspaceEntryStatus: document.getElementById('ccoWorkspaceEntryStatus'),
    ccoOverviewSummaryList: document.getElementById('ccoOverviewSummaryList'),
    categoryBadges: document.getElementById('categoryBadges'),
    riskBadges: document.getElementById('riskBadges'),
    riskQueueSummary: document.getElementById('riskQueueSummary'),
    riskReviewsWrap: document.getElementById('riskReviewsWrap'),
    riskIncidentsWrap: document.getElementById('riskIncidentsWrap'),
    riskReviewsTableBody: document.getElementById('riskReviewsTableBody'),
    riskIncidentsTableBody: document.getElementById('riskIncidentsTableBody'),
    riskReviewsCount: document.getElementById('riskReviewsCount'),
    riskIncidentsCount: document.getElementById('riskIncidentsCount'),
    riskSelectAllReviews: document.getElementById('riskSelectAllReviews'),
    riskSelectAllIncidents: document.getElementById('riskSelectAllIncidents'),
    riskActionStatus: document.getElementById('riskActionStatus'),
    riskDetailMeta: document.getElementById('riskDetailMeta'),
    riskDetailSummary: document.getElementById('riskDetailSummary'),
    riskDetailSla: document.getElementById('riskDetailSla'),
    riskDetailTimeline: document.getElementById('riskDetailTimeline'),
    riskDetailQuickActions: document.getElementById('riskDetailQuickActions'),
    riskDetailNoteInput: document.getElementById('riskDetailNoteInput'),
    riskDetailBlock: document.getElementById('riskDetailBlock'),
    riskBulkAction: document.getElementById('riskBulkAction'),
    riskBulkNote: document.getElementById('riskBulkNote'),
    applyRiskBulkBtn: document.getElementById('applyRiskBulkBtn'),
    riskShowPendingBtn: document.getElementById('riskShowPendingBtn'),
    riskShowHighCriticalBtn: document.getElementById('riskShowHighCriticalBtn'),
    riskClearFiltersBtn: document.getElementById('riskClearFiltersBtn'),
    auditSearchInput: document.getElementById('auditSearchInput'),
    auditActionFilter: document.getElementById('auditActionFilter'),
    auditActorFilter: document.getElementById('auditActorFilter'),
    auditTargetTypeFilter: document.getElementById('auditTargetTypeFilter'),
    auditOutcomeFilter: document.getElementById('auditOutcomeFilter'),
    auditSeverityFilter: document.getElementById('auditSeverityFilter'),
    auditSinceDaysFilter: document.getElementById('auditSinceDaysFilter'),
    auditLimitFilter: document.getElementById('auditLimitFilter'),
    applyAuditFilterBtn: document.getElementById('applyAuditFilterBtn'),
    clearAuditFilterBtn: document.getElementById('clearAuditFilterBtn'),
    auditSummary: document.getElementById('auditSummary'),
    auditTimeline: document.getElementById('auditTimeline'),
    auditDetailMeta: document.getElementById('auditDetailMeta'),
    auditDetailFacts: document.getElementById('auditDetailFacts'),
    auditDetailDiffMeta: document.getElementById('auditDetailDiffMeta'),
    auditDetailDiff: document.getElementById('auditDetailDiff'),
    auditDetailRaw: document.getElementById('auditDetailRaw'),
    staffEmailInput: document.getElementById('staffEmailInput'),
    staffPasswordInput: document.getElementById('staffPasswordInput'),
    copyInviteMessageBtn: document.getElementById('copyInviteMessageBtn'),
    staffInvitePreview: document.getElementById('staffInvitePreview'),
    generateStaffPasswordBtn: document.getElementById('generateStaffPasswordBtn'),
    createStaffBtn: document.getElementById('createStaffBtn'),
    refreshStaffBtn: document.getElementById('refreshStaffBtn'),
    staffSearchInput: document.getElementById('staffSearchInput'),
    staffStatusFilter: document.getElementById('staffStatusFilter'),
    staffEnableFilteredBtn: document.getElementById('staffEnableFilteredBtn'),
    staffDisableFilteredBtn: document.getElementById('staffDisableFilteredBtn'),
    teamSummaryTotal: document.getElementById('teamSummaryTotal'),
    teamSummaryActive: document.getElementById('teamSummaryActive'),
    teamSummaryDisabled: document.getElementById('teamSummaryDisabled'),
    teamSummaryOwners: document.getElementById('teamSummaryOwners'),
    staffStatus: document.getElementById('staffStatus'),
    staffTableBody: document.getElementById('staffTableBody'),
    selectedStaffMeta: document.getElementById('selectedStaffMeta'),
    selectedStaffDetails: document.getElementById('selectedStaffDetails'),
    resetSelectedStaffPasswordBtn: document.getElementById('resetSelectedStaffPasswordBtn'),
    selectedStaffRoleBtn: document.getElementById('selectedStaffRoleBtn'),
    copySelectedStaffInviteBtn: document.getElementById('copySelectedStaffInviteBtn'),
    profileEmailValue: document.getElementById('profileEmailValue'),
    profileRoleValue: document.getElementById('profileRoleValue'),
    profileTenantValue: document.getElementById('profileTenantValue'),
    profileSessionExpiresValue: document.getElementById('profileSessionExpiresValue'),
    profilePermissionsValue: document.getElementById('profilePermissionsValue'),
    profileTenantsValue: document.getElementById('profileTenantsValue'),
    currentPasswordInput: document.getElementById('currentPasswordInput'),
    newPasswordInput: document.getElementById('newPasswordInput'),
    changeOwnPasswordBtn: document.getElementById('changeOwnPasswordBtn'),
    refreshProfileBtn: document.getElementById('refreshProfileBtn'),
    profileStatus: document.getElementById('profileStatus'),
    sessionsScopeSelect: document.getElementById('sessionsScopeSelect'),
    sessionsIncludeRevoked: document.getElementById('sessionsIncludeRevoked'),
    loadSessionsBtn: document.getElementById('loadSessionsBtn'),
    sessionsStatus: document.getElementById('sessionsStatus'),
    sessionsTableBody: document.getElementById('sessionsTableBody'),
    riskLabCategory: document.getElementById('riskLabCategory'),
    riskLabScope: document.getElementById('riskLabScope'),
    riskLabContent: document.getElementById('riskLabContent'),
    riskLabVariables: document.getElementById('riskLabVariables'),
    runRiskPreviewBtn: document.getElementById('runRiskPreviewBtn'),
    riskLabStatus: document.getElementById('riskLabStatus'),
    riskLabResult: document.getElementById('riskLabResult'),
    orchestratorPromptInput: document.getElementById('orchestratorPromptInput'),
    runOrchestratorBtn: document.getElementById('runOrchestratorBtn'),
    orchestratorStatus: document.getElementById('orchestratorStatus'),
    orchestratorResult: document.getElementById('orchestratorResult'),
    orchestratorMetaSummary: document.getElementById('orchestratorMetaSummary'),
    orchestratorMetaResult: document.getElementById('orchestratorMetaResult'),
    runIncidentIntelligenceBtn: document.getElementById('runIncidentIntelligenceBtn'),
    incidentIntelTimeframeDays: document.getElementById('incidentIntelTimeframeDays'),
    incidentIntelIncludeClosed: document.getElementById('incidentIntelIncludeClosed'),
    incidentIntelligenceStatus: document.getElementById('incidentIntelligenceStatus'),
    incidentIntelligenceSummary: document.getElementById('incidentIntelligenceSummary'),
    incidentIntelligenceSeverity: document.getElementById('incidentIntelligenceSeverity'),
    incidentIntelligenceRisk: document.getElementById('incidentIntelligenceRisk'),
    incidentIntelligencePatterns: document.getElementById('incidentIntelligencePatterns'),
    incidentIntelligenceRecommendations: document.getElementById('incidentIntelligenceRecommendations'),
    runDailyBriefBtn: document.getElementById('runDailyBriefBtn'),
    dailyBriefTimeframeDays: document.getElementById('dailyBriefTimeframeDays'),
    dailyBriefMaxTasks: document.getElementById('dailyBriefMaxTasks'),
    dailyBriefIncludeClosed: document.getElementById('dailyBriefIncludeClosed'),
    dailyBriefStatus: document.getElementById('dailyBriefStatus'),
    dailyBriefPriority: document.getElementById('dailyBriefPriority'),
    dailyBriefSeverity: document.getElementById('dailyBriefSeverity'),
    dailyBriefSummary: document.getElementById('dailyBriefSummary'),
    dailyBriefRecommendations: document.getElementById('dailyBriefRecommendations'),
    runCcoInboxBtn: document.getElementById('runCcoInboxBtn'),
    ccoInboxMaxDrafts: document.getElementById('ccoInboxMaxDrafts'),
    ccoInboxIncludeClosed: document.getElementById('ccoInboxIncludeClosed'),
    ccoInboxStatus: document.getElementById('ccoInboxStatus'),
    ccoDebugOverlay: document.getElementById('ccoDebugOverlay'),
    ccoInboxMailboxMeta: document.getElementById('ccoInboxMailboxMeta'),
    ccoInboxPriority: document.getElementById('ccoInboxPriority'),
    ccoInboxRiskFlags: document.getElementById('ccoInboxRiskFlags'),
    ccoCenterListTitle: document.getElementById('ccoCenterListTitle'),
    ccoInboxModeToggle: document.getElementById('ccoInboxModeToggle'),
    ccoIndicatorFilterRow: document.getElementById('ccoIndicatorFilterRow'),
    ccoInboxModeMeta: document.getElementById('ccoInboxModeMeta'),
    ccoInboxSummary: document.getElementById('ccoInboxSummary'),
    ccoUnansweredPanel: document.getElementById('ccoUnansweredPanel'),
    ccoUnansweredCriticalCount: document.getElementById('ccoUnansweredCriticalCount'),
    ccoUnansweredHighCount: document.getElementById('ccoUnansweredHighCount'),
    ccoUnansweredMediumCount: document.getElementById('ccoUnansweredMediumCount'),
    ccoInboxMailboxFilters: document.getElementById('ccoInboxMailboxFilters'),
    ccoInboxMailboxSelect: document.getElementById('ccoInboxMailboxSelect'),
    ccoInboxSlaFilters: document.getElementById('ccoInboxSlaFilters'),
    ccoInboxStateFilters: document.getElementById('ccoInboxStateFilters'),
    ccoInboxSearchInput: document.getElementById('ccoInboxSearchInput'),
    ccoInboxShowSystemToggle: document.getElementById('ccoInboxShowSystemToggle'),
    ccoInboxSearchMeta: document.getElementById('ccoInboxSearchMeta'),
    ccoMailboxFiltersBlock: document.getElementById('ccoMailboxFiltersBlock'),
    ccoMailboxFiltersToggleBtn: document.getElementById('ccoMailboxFiltersToggleBtn'),
    ccoMailboxFiltersChevron: document.getElementById('ccoMailboxFiltersChevron'),
    ccoExtraFiltersBlock: document.getElementById('ccoExtraFiltersBlock'),
    ccoExtraFiltersToggleBtn: document.getElementById('ccoExtraFiltersToggleBtn'),
    ccoExtraFiltersChevron: document.getElementById('ccoExtraFiltersChevron'),
    ccoWorkspaceCompactToggleBtn: document.getElementById('ccoWorkspaceCompactToggleBtn'),
    ccoSprintShell: document.getElementById('ccoSprintShell'),
    ccoInboxDensityFilters: document.getElementById('ccoInboxDensityFilters'),
    ccoInboxFeedView: document.getElementById('ccoInboxFeedView'),
    ccoInboxFeedList: document.getElementById('ccoInboxFeedList'),
    ccoInboxWorklist: document.getElementById('ccoInboxWorklist'),
    ccoSoftBreakPanel: document.getElementById('ccoSoftBreakPanel'),
    ccoInboxGroupAcuteList: document.getElementById('ccoInboxGroupAcuteList'),
    ccoInboxGroupTodayList: document.getElementById('ccoInboxGroupTodayList'),
    ccoInboxGroupFollowupList: document.getElementById('ccoInboxGroupFollowupList'),
    ccoInboxGroupOtherList: document.getElementById('ccoInboxGroupOtherList'),
    ccoInboxGroupAcuteCount: document.getElementById('ccoInboxGroupAcuteCount'),
    ccoInboxGroupTodayCount: document.getElementById('ccoInboxGroupTodayCount'),
    ccoInboxGroupFollowupCount: document.getElementById('ccoInboxGroupFollowupCount'),
    ccoInboxGroupOtherCount: document.getElementById('ccoInboxGroupOtherCount'),
    ccoInboxGroupAcuteMeta: document.getElementById('ccoInboxGroupAcuteMeta'),
    ccoInboxGroupTodayMeta: document.getElementById('ccoInboxGroupTodayMeta'),
    ccoInboxGroupFollowupMeta: document.getElementById('ccoInboxGroupFollowupMeta'),
    ccoInboxGroupOtherMeta: document.getElementById('ccoInboxGroupOtherMeta'),
    ccoInboxGroupAcuteBlock: document.getElementById('ccoInboxGroupSprint'),
    ccoInboxGroupTodayBlock: document.getElementById('ccoInboxGroupHigh'),
    ccoInboxGroupFollowupBlock: document.getElementById('ccoInboxGroupNeeds'),
    ccoInboxGroupOtherBlock: document.getElementById('ccoInboxGroupRest'),
    ccoFocusShowAllBtn: document.getElementById('ccoFocusShowAllBtn'),
    ccoStatusCounts: document.getElementById('ccoStatusCounts'),
    ccoCenterColumn: document.getElementById('ccoCenterColumn'),
    ccoCenterLoadingState: document.getElementById('ccoCenterLoadingState'),
    ccoCenterLoadingMeta: document.getElementById('ccoCenterLoadingMeta'),
    ccoCenterEmptyState: document.getElementById('ccoCenterEmptyState'),
    ccoCenterEmptyStateMeta: document.getElementById('ccoCenterEmptyStateMeta'),
    ccoCenterRefreshBtn: document.getElementById('ccoCenterRefreshBtn'),
    ccoClearFiltersBtn: document.getElementById('ccoClearFiltersBtn'),
    ccoShowSystemMailsBtn: document.getElementById('ccoShowSystemMailsBtn'),
    ccoSwitchInboundBtn: document.getElementById('ccoSwitchInboundBtn'),
    ccoSwitchOverviewBtn: document.getElementById('ccoSwitchOverviewBtn'),
    ccoConversationColumn: document.getElementById('ccoConversationColumn'),
    ccoConversationMeta: document.getElementById('ccoConversationMeta'),
    ccoConversationPreview: document.getElementById('ccoConversationPreview'),
    ccoConversationHistoryList: document.getElementById('ccoConversationHistoryList'),
    ccoCenterTabConversationBtn: document.getElementById('ccoCenterTabConversationBtn'),
    ccoCenterTabCustomerBtn: document.getElementById('ccoCenterTabCustomerBtn'),
    ccoReadTabConversation: document.getElementById('ccoReadTabConversation'),
    ccoReadTabCustomer: document.getElementById('ccoReadTabCustomer'),
    ccoCustomerSummaryPanel: document.getElementById('ccoCustomerSummaryPanel'),
    ccoCustomerSummaryName: document.getElementById('ccoCustomerSummaryName'),
    ccoCustomerSummarySub: document.getElementById('ccoCustomerSummarySub'),
    ccoCustomerSummaryToggleBtn: document.getElementById('ccoCustomerSummaryToggleBtn'),
    ccoCustomerLifecycleValue: document.getElementById('ccoCustomerLifecycleValue'),
    ccoCustomerInteractionsValue: document.getElementById('ccoCustomerInteractionsValue'),
    ccoCustomerLastInteractionValue: document.getElementById('ccoCustomerLastInteractionValue'),
    ccoCustomerEngagementValue: document.getElementById('ccoCustomerEngagementValue'),
    ccoCustomerTempoValue: document.getElementById('ccoCustomerTempoValue'),
    ccoCustomerFollowupValue: document.getElementById('ccoCustomerFollowupValue'),
    ccoCustomerLastCaseValue: document.getElementById('ccoCustomerLastCaseValue'),
    ccoCustomerTimelineList: document.getElementById('ccoCustomerTimelineList'),
    ccoReplyColumn: document.getElementById('ccoReplyColumn'),
    ccoReplyColumnTitle: document.getElementById('ccoReplyColumnTitle'),
    ccoReplyReadOnlyBanner: document.getElementById('ccoReplyReadOnlyBanner'),
    ccoDraftSubjectInput: document.getElementById('ccoDraftSubjectInput'),
    ccoDraftToInput: document.getElementById('ccoDraftToInput'),
    ccoSenderMailboxSelect: document.getElementById('ccoSenderMailboxSelect'),
    ccoSignatureProfileSelect: document.getElementById('ccoSignatureProfileSelect'),
    ccoInsertSignatureToggle: document.getElementById('ccoInsertSignatureToggle'),
    ccoToggleSignaturePreviewBtn: document.getElementById('ccoToggleSignaturePreviewBtn'),
    ccoSignaturePreviewLabel: document.getElementById('ccoSignaturePreviewLabel'),
    ccoSignaturePreview: document.getElementById('ccoSignaturePreview'),
    ccoReplyEmptyState: document.getElementById('ccoReplyEmptyState'),
    ccoReplyMainBlocks: document.getElementById('ccoReplyMainBlocks'),
    ccoComposeStudio: document.getElementById('ccoComposeStudio'),
    ccoReplyRefreshBtn: document.getElementById('ccoReplyRefreshBtn'),
    ccoReplyShowSystemToggle: document.getElementById('ccoReplyShowSystemToggle'),
    ccoDraftRiskIndicator: document.getElementById('ccoDraftRiskIndicator'),
    ccoDraftPolicyIndicator: document.getElementById('ccoDraftPolicyIndicator'),
    ccoDraftConfidence: document.getElementById('ccoDraftConfidence'),
    ccoDraftRecommendedActionRow: document.getElementById('ccoDraftRecommendedActionRow'),
    ccoDraftRecommendedAction: document.getElementById('ccoDraftRecommendedAction'),
    ccoDraftModeHint: document.getElementById('ccoDraftModeHint'),
    ccoDraftModeShortBtn: document.getElementById('ccoDraftModeShortBtn'),
    ccoDraftModeWarmBtn: document.getElementById('ccoDraftModeWarmBtn'),
    ccoDraftModeProfessionalBtn: document.getElementById('ccoDraftModeProfessionalBtn'),
    ccoReplyContextStrip: document.getElementById('ccoReplyContextStrip'),
    ccoReplyingToContext: document.getElementById('ccoReplyingToContext'),
    ccoDraftBodyInput: document.getElementById('ccoDraftBodyInput'),
    ccoCopyReplyBtn: document.getElementById('ccoCopyReplyBtn'),
    ccoMarkHandledBtn: document.getElementById('ccoMarkHandledBtn'),
    ccoFlagCriticalBtn: document.getElementById('ccoFlagCriticalBtn'),
    ccoMarkSystemMailBtn: document.getElementById('ccoMarkSystemMailBtn'),
    ccoHidePatternBtn: document.getElementById('ccoHidePatternBtn'),
    ccoDeleteMailBtn: document.getElementById('ccoDeleteMailBtn'),
    ccoSnoozeBtn: document.getElementById('ccoSnoozeBtn'),
    ccoRefineImproveBtn: document.getElementById('ccoRefineImproveBtn'),
    ccoRefineShortenBtn: document.getElementById('ccoRefineShortenBtn'),
    ccoRefineSofterBtn: document.getElementById('ccoRefineSofterBtn'),
    ccoRefineProfessionalBtn: document.getElementById('ccoRefineProfessionalBtn'),
    ccoSendBtn: document.getElementById('ccoSendBtn'),
    ccoStickySnoozeBtn: document.getElementById('ccoStickySnoozeBtn'),
    ccoStickyDeleteBtn: document.getElementById('ccoStickyDeleteBtn'),
    ccoIndicatorContextMenu: document.getElementById('ccoIndicatorContextMenu'),
    ccoSendStatus: document.getElementById('ccoSendStatus'),
    ccoInboxNeedsReplyList: document.getElementById('ccoInboxNeedsReplyList'),
    ccoInboxDraftsList: document.getElementById('ccoInboxDraftsList'),
    ccoSprintStatusBar: document.getElementById('ccoSprintStatusBar'),
    ccoFocusHeading: document.getElementById('ccoFocusHeading'),
    ccoSprintProgress: document.getElementById('ccoSprintProgress'),
    ccoFocusWorkload: document.getElementById('ccoFocusWorkload'),
    ccoFocusWorkloadInfoBtn: document.getElementById('ccoFocusWorkloadInfoBtn'),
    ccoFocusWorkloadBreakdown: document.getElementById('ccoFocusWorkloadBreakdown'),
    ccoFocusScheduleStatus: document.getElementById('ccoFocusScheduleStatus'),
    ccoStartSprintBtn: document.getElementById('ccoStartSprintBtn'),
    ccoSprintQueueList: document.getElementById('ccoSprintQueueList'),
    ccoSprintStressMeta: document.getElementById('ccoSprintStressMeta'),
    ccoSprintFeedback: document.getElementById('ccoSprintFeedback'),
    ccoRedFlagBanner: document.getElementById('ccoRedFlagBanner'),
    ccoPerformancePanel: document.getElementById('ccoPerformancePanel'),
    fetchCalibrationSuggestionBtn: document.getElementById('fetchCalibrationSuggestionBtn'),
    applyCalibrationSuggestionBtn: document.getElementById('applyCalibrationSuggestionBtn'),
    calibrationNoteInput: document.getElementById('calibrationNoteInput'),
    calibrationStatus: document.getElementById('calibrationStatus'),
    calibrationResult: document.getElementById('calibrationResult'),
    reportDaysInput: document.getElementById('reportDaysInput'),
    runPilotReportBtn: document.getElementById('runPilotReportBtn'),
    reportStatus: document.getElementById('reportStatus'),
    pilotReportResult: document.getElementById('pilotReportResult'),
    refreshMailInsightsBtn: document.getElementById('refreshMailInsightsBtn'),
    previewMailSeedsBtn: document.getElementById('previewMailSeedsBtn'),
    applyMailSeedsBtn: document.getElementById('applyMailSeedsBtn'),
    mailSeedsCategory: document.getElementById('mailSeedsCategory'),
    mailSeedsLimit: document.getElementById('mailSeedsLimit'),
    mailSeedsNamePrefix: document.getElementById('mailSeedsNamePrefix'),
    mailInsightsStatus: document.getElementById('mailInsightsStatus'),
    mailInsightsResult: document.getElementById('mailInsightsResult'),
    refreshMonitorBtn: document.getElementById('refreshMonitorBtn'),
    toggleMonitorDetailsBtn: document.getElementById('toggleMonitorDetailsBtn'),
    runSchedulerSuiteBtn: document.getElementById('runSchedulerSuiteBtn'),
    previewReadinessOutputGateRemediationBtn: document.getElementById('previewReadinessOutputGateRemediationBtn'),
    runReadinessOutputGateRemediationBtn: document.getElementById('runReadinessOutputGateRemediationBtn'),
    previewReadinessOwnerMfaRemediationBtn: document.getElementById('previewReadinessOwnerMfaRemediationBtn'),
    runReadinessOwnerMfaRemediationBtn: document.getElementById('runReadinessOwnerMfaRemediationBtn'),
    monitorPanelStatus: document.getElementById('monitorPanelStatus'),
    monitorResult: document.getElementById('monitorResult'),
    monitorObservabilitySummary: document.getElementById('monitorObservabilitySummary'),
    monitorObservabilityResult: document.getElementById('monitorObservabilityResult'),
    monitorPublicChatBetaSummary: document.getElementById('monitorPublicChatBetaSummary'),
    monitorPublicChatBetaResult: document.getElementById('monitorPublicChatBetaResult'),
    monitorPatientConversionSummary: document.getElementById('monitorPatientConversionSummary'),
    monitorPatientConversionResult: document.getElementById('monitorPatientConversionResult'),
    monitorSchedulerSummary: document.getElementById('monitorSchedulerSummary'),
    monitorSchedulerResult: document.getElementById('monitorSchedulerResult'),
    monitorReadinessHistorySummary: document.getElementById('monitorReadinessHistorySummary'),
    monitorReadinessHistoryResult: document.getElementById('monitorReadinessHistoryResult'),
    monitorReadinessNoGoSummary: document.getElementById('monitorReadinessNoGoSummary'),
    monitorReadinessNoGoResult: document.getElementById('monitorReadinessNoGoResult'),
    monitorRemediationSummary: document.getElementById('monitorRemediationSummary'),
    monitorRemediationResult: document.getElementById('monitorRemediationResult'),
    loadStateManifestBtn: document.getElementById('loadStateManifestBtn'),
    createStateBackupBtn: document.getElementById('createStateBackupBtn'),
    listStateBackupsBtn: document.getElementById('listStateBackupsBtn'),
    previewPruneBackupsBtn: document.getElementById('previewPruneBackupsBtn'),
    runPruneBackupsBtn: document.getElementById('runPruneBackupsBtn'),
    listSchedulerReportsBtn: document.getElementById('listSchedulerReportsBtn'),
    previewPruneReportsBtn: document.getElementById('previewPruneReportsBtn'),
    runPruneReportsBtn: document.getElementById('runPruneReportsBtn'),
    restoreBackupFileInput: document.getElementById('restoreBackupFileInput'),
    previewStateRestoreBtn: document.getElementById('previewStateRestoreBtn'),
    runStateRestoreBtn: document.getElementById('runStateRestoreBtn'),
    opsStatus: document.getElementById('opsStatus'),
    opsResult: document.getElementById('opsResult'),
    riskMinFilter: document.getElementById('riskMinFilter'),
    riskMaxFilter: document.getElementById('riskMaxFilter'),
    riskDecisionFilter: document.getElementById('riskDecisionFilter'),
    riskOwnerDecisionFilter: document.getElementById('riskOwnerDecisionFilter'),
    riskStateFilter: document.getElementById('riskStateFilter'),
    riskCategoryFilter: document.getElementById('riskCategoryFilter'),
    riskSinceDaysFilter: document.getElementById('riskSinceDaysFilter'),
    riskReasonFilter: document.getElementById('riskReasonFilter'),
    riskSearchFilter: document.getElementById('riskSearchFilter'),
    applyRiskFilterBtn: document.getElementById('applyRiskFilterBtn'),
    assistantName: document.getElementById('assistantName'),
    toneStyle: document.getElementById('toneStyle'),
    brandProfile: document.getElementById('brandProfile'),
    brandLogoUrl: document.getElementById('brandLogoUrl'),
    brandPrimaryColor: document.getElementById('brandPrimaryColor'),
    brandAccentColor: document.getElementById('brandAccentColor'),
    riskModifier: document.getElementById('riskModifier'),
    riskModifierRange: document.getElementById('riskModifierRange'),
    riskModifierDisplay: document.getElementById('riskModifierDisplay'),
    tonePresetButtons: document.getElementById('tonePresetButtons'),
    tonePreviewCard: document.getElementById('tonePreviewCard'),
    tonePreviewMeta: document.getElementById('tonePreviewMeta'),
    tonePreviewText: document.getElementById('tonePreviewText'),
    tonePreviewLogo: document.getElementById('tonePreviewLogo'),
    tonePreviewPrimaryDot: document.getElementById('tonePreviewPrimaryDot'),
    tonePreviewAccentDot: document.getElementById('tonePreviewAccentDot'),
    tonePreviewPrimaryBtn: document.getElementById('tonePreviewPrimaryBtn'),
    tonePreviewAccentBtn: document.getElementById('tonePreviewAccentBtn'),
    templateEmailSignature: document.getElementById('templateEmailSignature'),
    templateAllowlistOverrides: document.getElementById('templateAllowlistOverrides'),
    templateRequiredOverrides: document.getElementById('templateRequiredOverrides'),
    publicSiteClinicName: document.getElementById('publicSiteClinicName'),
    publicSiteCity: document.getElementById('publicSiteCity'),
    publicSiteTagline: document.getElementById('publicSiteTagline'),
    publicSiteHeroTitle: document.getElementById('publicSiteHeroTitle'),
    publicSiteHeroSubtitle: document.getElementById('publicSiteHeroSubtitle'),
    publicSitePrimaryCtaLabel: document.getElementById('publicSitePrimaryCtaLabel'),
    publicSitePrimaryCtaUrl: document.getElementById('publicSitePrimaryCtaUrl'),
    publicSiteSecondaryCtaLabel: document.getElementById('publicSiteSecondaryCtaLabel'),
    publicSiteSecondaryCtaUrl: document.getElementById('publicSiteSecondaryCtaUrl'),
    publicSiteTrustRating: document.getElementById('publicSiteTrustRating'),
    publicSiteTrustReviewCount: document.getElementById('publicSiteTrustReviewCount'),
    publicSiteTrustSurgeons: document.getElementById('publicSiteTrustSurgeons'),
    publicSiteContactPhone: document.getElementById('publicSiteContactPhone'),
    publicSiteContactEmail: document.getElementById('publicSiteContactEmail'),
    publicSiteContactAddress: document.getElementById('publicSiteContactAddress'),
    publicSiteContactBookingUrl: document.getElementById('publicSiteContactBookingUrl'),
    publicSiteThemeAccent: document.getElementById('publicSiteThemeAccent'),
    publicSiteThemeAccentSoft: document.getElementById('publicSiteThemeAccentSoft'),
    publicSiteThemeCanvasFrom: document.getElementById('publicSiteThemeCanvasFrom'),
    publicSiteThemeCanvasTo: document.getElementById('publicSiteThemeCanvasTo'),
    publicSiteServicesJson: document.getElementById('publicSiteServicesJson'),
    saveTenantConfigBtn: document.getElementById('saveTenantConfigBtn'),
    refreshWritingIdentityBtn: document.getElementById('refreshWritingIdentityBtn'),
    autoExtractWritingIdentityBtn: document.getElementById('autoExtractWritingIdentityBtn'),
    writingIdentitySampleSize: document.getElementById('writingIdentitySampleSize'),
    writingIdentityStatus: document.getElementById('writingIdentityStatus'),
    writingIdentityMailboxSelect: document.getElementById('writingIdentityMailboxSelect'),
    writingIdentityMailboxFilter: document.getElementById('writingIdentityMailboxFilter'),
    writingIdentityCount: document.getElementById('writingIdentityCount'),
    writingIdentityTableBody: document.getElementById('writingIdentityTableBody'),
    writingIdentityMailboxInput: document.getElementById('writingIdentityMailboxInput'),
    writingIdentityGreeting: document.getElementById('writingIdentityGreeting'),
    writingIdentityClosing: document.getElementById('writingIdentityClosing'),
    writingIdentityFormality: document.getElementById('writingIdentityFormality'),
    writingIdentityWarmth: document.getElementById('writingIdentityWarmth'),
    writingIdentitySentenceLength: document.getElementById('writingIdentitySentenceLength'),
    writingIdentityCtaStyle: document.getElementById('writingIdentityCtaStyle'),
    writingIdentityEmojiUsage: document.getElementById('writingIdentityEmojiUsage'),
    saveWritingIdentityBtn: document.getElementById('saveWritingIdentityBtn'),
    writingIdentityEditStatus: document.getElementById('writingIdentityEditStatus'),
    writingIdentityProfileMeta: document.getElementById('writingIdentityProfileMeta'),
    tenantConfigStatus: document.getElementById('tenantConfigStatus'),
    refreshTenantsBtn: document.getElementById('refreshTenantsBtn'),
    tenantCatalog: document.getElementById('tenantCatalog'),
    onboardTenantId: document.getElementById('onboardTenantId'),
    onboardOwnerEmail: document.getElementById('onboardOwnerEmail'),
    onboardOwnerPassword: document.getElementById('onboardOwnerPassword'),
    onboardAssistantName: document.getElementById('onboardAssistantName'),
    onboardToneStyle: document.getElementById('onboardToneStyle'),
    onboardBrandProfile: document.getElementById('onboardBrandProfile'),
    onboardRiskModifier: document.getElementById('onboardRiskModifier'),
    onboardTenantBtn: document.getElementById('onboardTenantBtn'),
    tenantOnboardStatus: document.getElementById('tenantOnboardStatus'),
    templateNameInput: document.getElementById('templateNameInput'),
    templateCategoryInput: document.getElementById('templateCategoryInput'),
    templateChannelInput: document.getElementById('templateChannelInput'),
    templateLocaleInput: document.getElementById('templateLocaleInput'),
    createTemplateBtn: document.getElementById('createTemplateBtn'),
    templateFilterSelect: document.getElementById('templateFilterSelect'),
    templateCategoryChips: document.getElementById('templateCategoryChips'),
    templateSearchInput: document.getElementById('templateSearchInput'),
    templateStatusFilterSelect: document.getElementById('templateStatusFilterSelect'),
    templateSortSelect: document.getElementById('templateSortSelect'),
    templateViewTableBtn: document.getElementById('templateViewTableBtn'),
    templateViewCardBtn: document.getElementById('templateViewCardBtn'),
    templateBulkAction: document.getElementById('templateBulkAction'),
    applyTemplateBulkBtn: document.getElementById('applyTemplateBulkBtn'),
    templateClearSelectionBtn: document.getElementById('templateClearSelectionBtn'),
    templateSelectionMeta: document.getElementById('templateSelectionMeta'),
    templateBulkStatus: document.getElementById('templateBulkStatus'),
    templateCardList: document.getElementById('templateCardList'),
    templateTableWrap: document.getElementById('templateTableWrap'),
    templateSelectAll: document.getElementById('templateSelectAll'),
    templateResultsMeta: document.getElementById('templateResultsMeta'),
    templateStatus: document.getElementById('templateStatus'),
    templateTableBody: document.getElementById('templateTableBody'),
    versionTableBody: document.getElementById('versionTableBody'),
    selectedTemplateMeta: document.getElementById('selectedTemplateMeta'),
    selectedVersionMeta: document.getElementById('selectedVersionMeta'),
    versionTitleInput: document.getElementById('versionTitleInput'),
    draftInstructionInput: document.getElementById('draftInstructionInput'),
    versionContentInput: document.getElementById('versionContentInput'),
    templateVariableMeta: document.getElementById('templateVariableMeta'),
    templateRequiredVariables: document.getElementById('templateRequiredVariables'),
    templateVariablePicker: document.getElementById('templateVariablePicker'),
    templateValidationList: document.getElementById('templateValidationList'),
    templateSignatureStatus: document.getElementById('templateSignatureStatus'),
    appendSignatureBtn: document.getElementById('appendSignatureBtn'),
    generateDraftBtn: document.getElementById('generateDraftBtn'),
    saveDraftBtn: document.getElementById('saveDraftBtn'),
    evaluateBtn: document.getElementById('evaluateBtn'),
    activateBtn: document.getElementById('activateBtn'),
    archiveBtn: document.getElementById('archiveBtn'),
    cloneBtn: document.getElementById('cloneBtn'),
    versionStatus: document.getElementById('versionStatus'),
    versionRiskBlock: document.getElementById('versionRiskBlock'),
    revisionFromSelect: document.getElementById('revisionFromSelect'),
    revisionToSelect: document.getElementById('revisionToSelect'),
    loadRevisionDiffBtn: document.getElementById('loadRevisionDiffBtn'),
    rollbackRevisionSelect: document.getElementById('rollbackRevisionSelect'),
    rollbackRevisionNoteInput: document.getElementById('rollbackRevisionNoteInput'),
    rollbackRevisionBtn: document.getElementById('rollbackRevisionBtn'),
    revisionStatus: document.getElementById('revisionStatus'),
    revisionSummary: document.getElementById('revisionSummary'),
    revisionDiffBlock: document.getElementById('revisionDiffBlock'),
  };

  let activeModalResolver = null;
  let activeModalOptions = null;
  let activeModalFocusReturn = null;
  let sectionMotionFrame = 0;
  let modeTransitionTimer = 0;
  let ccoColumnResizeState = null;

  function setText(el, value) {
    if (!el) return;
    el.textContent = String(value ?? '');
  }

  function t(key, fallback = '') {
    const lang = SUPPORTED_LANGUAGES.includes(state.language) ? state.language : 'sv';
    const scoped = TRANSLATIONS[lang] || TRANSLATIONS.sv || {};
    const base = TRANSLATIONS.sv || {};
    if (Object.prototype.hasOwnProperty.call(scoped, key)) return scoped[key];
    if (Object.prototype.hasOwnProperty.call(base, key)) return base[key];
    return String(fallback || key || '');
  }

  function applyLanguage() {
    const lang = SUPPORTED_LANGUAGES.includes(state.language) ? state.language : 'sv';
    state.language = lang;
    document.documentElement.lang = lang;
    if (els.languageSelect) {
      els.languageSelect.value = lang;
    }
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = String(element.getAttribute('data-i18n') || '').trim();
      if (!key) return;
      const fallback = element.dataset.i18nFallback || element.textContent || '';
      element.textContent = t(key, fallback);
    });
    setSessionMeta();
    renderTenantSwitchOptions();
    applyDensityMode();
    setMonitorDetailsVisible(state.monitorDetailsVisible);
  }

  function setLanguage(nextLanguage) {
    const normalized = String(nextLanguage || '').trim().toLowerCase();
    state.language = SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'sv';
    localStorage.setItem(LANGUAGE_KEY, state.language);
    applyLanguage();
  }

  function applyDensityMode() {
    const compact = state.densityMode === 'compact';
    document.body.classList.toggle('compact', compact);
    if (!els.densityToggleBtn) return;
    els.densityToggleBtn.classList.toggle('active', compact);
    els.densityToggleBtn.setAttribute('aria-pressed', compact ? 'true' : 'false');
    els.densityToggleBtn.textContent = compact
      ? t('density_regular', 'Standardvy')
      : t('density_compact', 'Kompakt vy');
  }

  function setDensityMode(nextMode) {
    const normalized = String(nextMode || '')
      .trim()
      .toLowerCase();
    state.densityMode = normalized === 'compact' ? 'compact' : 'regular';
    localStorage.setItem(DENSITY_KEY, state.densityMode);
    applyDensityMode();
  }

  function toggleDensityMode() {
    setDensityMode(state.densityMode === 'compact' ? 'regular' : 'compact');
  }

  function isEnglishLanguage() {
    return state.language === 'en';
  }

  function formatRoleLabel(roleRaw) {
    const role = String(roleRaw || '').trim().toUpperCase();
    if (role === 'OWNER') return isEnglishLanguage() ? 'OWNER' : 'ÄGARE';
    if (role === 'STAFF') return isEnglishLanguage() ? 'STAFF' : 'MEDARBETARE';
    return roleRaw || '-';
  }

  function formatStatusLabel(statusRaw) {
    const status = String(statusRaw || '').trim().toLowerCase();
    const map = {
      active: isEnglishLanguage() ? 'Active' : 'Aktiv',
      disabled: isEnglishLanguage() ? 'Disabled' : 'Inaktiv',
      revoked: isEnglishLanguage() ? 'Revoked' : 'Återkallad',
      open: isEnglishLanguage() ? 'Open' : 'Öppen',
      closed: isEnglishLanguage() ? 'Closed' : 'Stängd',
      pending: isEnglishLanguage() ? 'Pending' : 'Väntar',
      success: isEnglishLanguage() ? 'Success' : 'Lyckad',
      error: isEnglishLanguage() ? 'Error' : 'Fel',
      draft: isEnglishLanguage() ? 'Draft' : 'Utkast',
      archived: isEnglishLanguage() ? 'Archived' : 'Arkiverad',
    };
    if (Object.prototype.hasOwnProperty.call(map, status)) return map[status];
    return statusRaw || '-';
  }

  function formatDecisionLabel(decisionRaw) {
    const decision = String(decisionRaw || '').trim().toLowerCase();
    const map = {
      allow: isEnglishLanguage() ? 'Allowed' : 'Tillåten',
      allow_flag: isEnglishLanguage() ? 'Allowed (flagged)' : 'Tillåten (flaggad)',
      review_required: isEnglishLanguage() ? 'Needs review' : 'Kräver granskning',
      blocked: isEnglishLanguage() ? 'Blocked' : 'Blockerad',
      critical_escalate: isEnglishLanguage() ? 'Critical escalation' : 'Kritisk eskalering',
    };
    if (Object.prototype.hasOwnProperty.call(map, decision)) return map[decision];
    return decisionRaw || '-';
  }

  function formatOwnerDecisionLabel(valueRaw) {
    const value = String(valueRaw || '').trim().toLowerCase();
    const map = {
      pending: isEnglishLanguage() ? 'Pending' : 'Väntar',
      approved_exception: isEnglishLanguage() ? 'Approved exception' : 'Godkänd avvikelse',
      false_positive: isEnglishLanguage() ? 'False positive' : 'Falskt positiv',
      revision_requested: isEnglishLanguage() ? 'Revision requested' : 'Revidering begärd',
      escalated: isEnglishLanguage() ? 'Escalated' : 'Eskalerad',
    };
    if (Object.prototype.hasOwnProperty.call(map, value)) return map[value];
    return valueRaw || '-';
  }

  function formatOwnerActionLabel(actionRaw) {
    const action = String(actionRaw || '').trim().toLowerCase();
    const map = {
      request_revision: isEnglishLanguage() ? 'Request revision' : 'Begär revidering',
      approve_exception: isEnglishLanguage() ? 'Approve exception' : 'Godkänn avvikelse',
      mark_false_positive: isEnglishLanguage() ? 'Mark false positive' : 'Markera falskt positiv',
      escalate: isEnglishLanguage() ? 'Escalate' : 'Eskalera',
    };
    if (Object.prototype.hasOwnProperty.call(map, action)) return map[action];
    return actionRaw || '-';
  }

  function formatTemplateStateLabel(stateRaw) {
    const value = String(stateRaw || '').trim().toLowerCase();
    const map = {
      draft: isEnglishLanguage() ? 'Draft' : 'Utkast',
      active: isEnglishLanguage() ? 'Active' : 'Aktiv',
      archived: isEnglishLanguage() ? 'Archived' : 'Arkiverad',
      review_required: isEnglishLanguage() ? 'Needs review' : 'Kräver granskning',
      blocked: isEnglishLanguage() ? 'Blocked' : 'Blockerad',
    };
    if (Object.prototype.hasOwnProperty.call(map, value)) return map[value];
    return stateRaw || '-';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeTemplateCategory(value) {
    return String(value || '')
      .trim()
      .toUpperCase();
  }

  function normalizeTemplateChannel(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function parseRevisionNumber(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function buildRevisionEtag(revision) {
    const safeRevision = parseRevisionNumber(revision);
    if (!safeRevision) return '';
    return `W/\"r${safeRevision}\"`;
  }

  function extractTemplateVariables(content) {
    if (typeof content !== 'string' || !content) return [];
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const variables = new Set();
    let match = null;
    while ((match = regex.exec(content)) !== null) {
      const key = String(match[1] || '').trim();
      if (key) variables.add(key);
    }
    return Array.from(variables);
  }

  function getSelectedTemplate() {
    const id = String(state.selectedTemplateId || '').trim();
    if (!id) return null;
    return state.templates.find((item) => String(item?.id || '') === id) || null;
  }

  function getTemplatePolicyByCategory(category) {
    const normalized = normalizeTemplateCategory(category);
    const allowlist = Array.isArray(state.templateMeta?.variableWhitelist?.[normalized])
      ? state.templateMeta.variableWhitelist[normalized]
      : [];
    const required = Array.isArray(state.templateMeta?.requiredVariables?.[normalized])
      ? state.templateMeta.requiredVariables[normalized]
      : [];
    return { normalized, allowlist, required };
  }

  function getTemplateSignatureByChannel(channel) {
    const normalized = normalizeTemplateChannel(channel);
    const raw = state.templateMeta?.signaturesByChannel?.[normalized];
    return typeof raw === 'string' ? raw.trim() : '';
  }

  function renderTemplateCategoryOptions() {
    const categories = Array.isArray(state.templateMeta?.categories)
      ? state.templateMeta.categories
      : [];
    if (!categories.length) {
      renderTemplateCategoryChips([]);
      return;
    }

    if (els.templateCategoryInput) {
      const current = String(els.templateCategoryInput.value || 'CONSULTATION').trim();
      els.templateCategoryInput.innerHTML = '';
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        els.templateCategoryInput.appendChild(option);
      }
      const fallback = categories[0] || 'CONSULTATION';
      els.templateCategoryInput.value = categories.includes(current) ? current : fallback;
    }

    if (els.templateFilterSelect) {
      const current = String(els.templateFilterSelect.value || '').trim();
      els.templateFilterSelect.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = isEnglishLanguage() ? 'All' : 'Alla';
      els.templateFilterSelect.appendChild(allOption);
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        els.templateFilterSelect.appendChild(option);
      }
      const fallback = categories.includes(current) ? current : '';
      els.templateFilterSelect.value = fallback;
    }

    if (els.riskCategoryFilter) {
      const current = String(
        els.riskCategoryFilter.value || state.riskFilters?.category || ''
      ).trim();
      els.riskCategoryFilter.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = isEnglishLanguage() ? 'All' : 'Alla';
      els.riskCategoryFilter.appendChild(allOption);
      for (const category of categories) {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        els.riskCategoryFilter.appendChild(option);
      }
      els.riskCategoryFilter.value = categories.includes(current) ? current : '';
    }

    renderTemplateCategoryChips(categories);
  }

  function renderTemplateCategoryChips(categories = []) {
    if (!els.templateCategoryChips) return;
    const selected = String(state.templateListFilters?.category || '').trim();
    const options = [
      { value: '', label: isEnglishLanguage() ? 'All' : 'Alla' },
      ...categories.map((category) => ({ value: category, label: category })),
    ];

    els.templateCategoryChips.innerHTML = '';
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn small';
      button.textContent = option.label;
      button.setAttribute('data-template-category-chip', option.value);
      const active = String(option.value || '').trim() === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      els.templateCategoryChips.appendChild(button);
    }
  }

  function syncTemplateCategoryChipSelection() {
    if (!els.templateCategoryChips) return;
    const selected = String(state.templateListFilters?.category || '').trim();
    els.templateCategoryChips
      .querySelectorAll('button[data-template-category-chip]')
      .forEach((button) => {
        const value = String(button.getAttribute('data-template-category-chip') || '').trim();
        const active = value === selected;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
  }

  function renderTemplateEditorAssist() {
    const template = getSelectedTemplate();
    const content = String(els.versionContentInput?.value || '');
    const usedVariables = extractTemplateVariables(content);

    if (!template) {
      if (els.templateVariableMeta) {
        els.templateVariableMeta.textContent = 'Välj en mall för att se variabelpolicy.';
      }
      if (els.templateRequiredVariables) els.templateRequiredVariables.innerHTML = '';
      if (els.templateVariablePicker) els.templateVariablePicker.innerHTML = '';
      if (els.templateValidationList) {
        els.templateValidationList.innerHTML =
          '<div class="template-validation-item">Ingen mall/version vald.</div>';
      }
      if (els.templateSignatureStatus) {
        els.templateSignatureStatus.textContent = 'Signatur: okänd';
      }
      if (els.appendSignatureBtn) els.appendSignatureBtn.disabled = true;
      return;
    }

    const policy = getTemplatePolicyByCategory(template.category);
    const unknown = usedVariables.filter((name) => !policy.allowlist.includes(name));
    const missingRequired = policy.required.filter((name) => !usedVariables.includes(name));
    const signature = getTemplateSignatureByChannel(template.channel);
    const hasSignature = Boolean(signature && content.includes(signature));
    const canEditVersion = canTemplateWrite() && Boolean(state.selectedVersionId);

    if (els.templateVariableMeta) {
      els.templateVariableMeta.textContent = `${template.category} · ${template.channel} · ${usedVariables.length} variabler i innehåll`;
    }

    if (els.templateRequiredVariables) {
      els.templateRequiredVariables.innerHTML = '';
      if (!policy.required.length) {
        const empty = document.createElement('span');
        empty.className = 'template-variable-chip';
        empty.textContent = 'Inga required-variabler';
        els.templateRequiredVariables.appendChild(empty);
      } else {
        for (const variableName of policy.required) {
          const chip = document.createElement('span');
          const exists = usedVariables.includes(variableName);
          chip.className = `template-variable-chip ${exists ? 'ok' : 'warn'}`;
          chip.textContent = exists ? `✓ {{${variableName}}}` : `⚠ {{${variableName}}}`;
          els.templateRequiredVariables.appendChild(chip);
        }
      }
    }

    if (els.templateVariablePicker) {
      els.templateVariablePicker.innerHTML = '';
      if (!policy.allowlist.length) {
        const empty = document.createElement('span');
        empty.className = 'template-variable-chip';
        empty.textContent = 'Ingen allowlist hittades';
        els.templateVariablePicker.appendChild(empty);
      } else {
        for (const variableName of policy.allowlist) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'template-variable-chip btn';
          btn.setAttribute('data-template-var', variableName);
          btn.textContent = `{{${variableName}}}`;
          btn.disabled = !canEditVersion;
          els.templateVariablePicker.appendChild(btn);
        }
      }
    }

    if (els.templateValidationList) {
      const items = [];
      if (!unknown.length) {
        items.push({
          tone: 'good',
          text: 'Allowlist: alla använda variabler är godkända.',
        });
      } else {
        items.push({
          tone: 'bad',
          text: `Okända variabler: ${unknown.map((item) => `{{${item}}}`).join(', ')}`,
        });
      }

      if (!missingRequired.length) {
        items.push({
          tone: 'good',
          text: 'Required: inga obligatoriska variabler saknas.',
        });
      } else {
        items.push({
          tone: 'warn',
          text: `Saknade required: ${missingRequired.map((item) => `{{${item}}}`).join(', ')}`,
        });
      }

      const serverValidation =
        state.lastVariableValidation &&
        state.lastVariableValidation.versionId === state.selectedVersionId
          ? state.lastVariableValidation.data
          : null;
      if (serverValidation) {
        const unknownServer = Array.isArray(serverValidation.unknownVariables)
          ? serverValidation.unknownVariables
          : [];
        const missingServer = Array.isArray(serverValidation.missingRequiredVariables)
          ? serverValidation.missingRequiredVariables
          : [];
        const serverTone = serverValidation.ok ? 'good' : unknownServer.length ? 'bad' : 'warn';
        items.push({
          tone: serverTone,
          text: serverValidation.ok
            ? 'Server-validering: OK på senaste save/evaluate.'
            : `Server-validering: unknown=${unknownServer.length}, missingRequired=${missingServer.length}.`,
        });
      }

      const currentVersion = state.versions.find((item) => item.id === state.selectedVersionId);
      const risk = currentVersion?.risk || null;
      if (risk) {
        items.push({
          tone: risk.riskLevel >= 4 ? 'bad' : risk.riskLevel === 3 ? 'warn' : 'good',
          text: `Senaste risk: L${risk.riskLevel} (${risk.decision}) • score ${risk.riskScore}`,
        });
      } else {
        items.push({
          tone: 'warn',
          text: 'Ingen riskutvärdering ännu. Kör Evaluate innan activation.',
        });
      }

      els.templateValidationList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('div');
        row.className = `template-validation-item ${item.tone}`;
        row.textContent = item.text;
        els.templateValidationList.appendChild(row);
      }
    }

    if (els.templateSignatureStatus) {
      if (!signature) {
        els.templateSignatureStatus.textContent = `Signatur: ingen konfigurerad för channel "${template.channel}"`;
      } else {
        els.templateSignatureStatus.textContent = hasSignature
          ? `Signatur: OK för channel "${template.channel}"`
          : `Signatur saknas för channel "${template.channel}"`;
      }
    }

    if (els.appendSignatureBtn) {
      els.appendSignatureBtn.disabled = !canEditVersion || !signature || hasSignature;
    }
  }

  function insertTemplateVariable(variableName) {
    const input = els.versionContentInput;
    if (!input || input.disabled) return;
    const variable = String(variableName || '').trim();
    if (!variable) return;
    const token = `{{${variable}}}`;

    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    input.value = nextValue;
    const caret = start + token.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    renderTemplateEditorAssist();
  }

  function appendTemplateSignatureToContent() {
    const template = getSelectedTemplate();
    const input = els.versionContentInput;
    if (!template || !input || input.disabled) return;
    const signature = getTemplateSignatureByChannel(template.channel);
    if (!signature) return;

    const current = String(input.value || '').trimEnd();
    if (current.includes(signature)) {
      renderTemplateEditorAssist();
      return;
    }
    input.value = current ? `${current}\n\n${signature}` : signature;
    renderTemplateEditorAssist();
  }

  function rememberVariableValidation(versionId, variableValidation) {
    if (!variableValidation || typeof variableValidation !== 'object') {
      state.lastVariableValidation = null;
      return;
    }
    state.lastVariableValidation = {
      versionId: String(versionId || ''),
      data: variableValidation,
    };
  }

  function formatVersionActionError(action, error) {
    const raw = String(error?.message || '').trim();
    if (!raw) return 'Okänt fel.';

    if (action === 'activate' && /owner/i.test(raw)) {
      return `${raw} Gå till Granskningar/Incidenter och sätt ägaråtgärd först.`;
    }
    if (action === 'activate' && /risk\/policy/i.test(raw)) {
      return `${raw} Kör Evaluate och hantera riskbeslut innan activation.`;
    }
    if ((action === 'save' || action === 'evaluate') && /Bara draft-versioner kan ändras/i.test(raw)) {
      return `${raw} Klona aktiv version för att skapa en ny draft.`;
    }
    return raw;
  }

  function parseJsonObjectInput(rawValue, fieldName) {
    const text = String(rawValue || '').trim();
    if (!text) return {};
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${fieldName} måste vara giltig JSON.`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldName} måste vara ett JSON-objekt.`);
    }
    return parsed;
  }

  function parseJsonArrayInput(rawValue, fieldName) {
    const text = String(rawValue || '').trim();
    if (!text) return [];

    let normalized = text
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\u2060]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    normalized = normalized.replace(/\(\s*publicSite\.services[^)]*\)\s*$/i, '').trim();

    const firstBracket = normalized.indexOf('[');
    const lastBracket = normalized.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const prefix = normalized.slice(0, firstBracket).trim();
      const suffix = normalized.slice(lastBracket + 1).trim();
      if (prefix || suffix) {
        normalized = normalized.slice(firstBracket, lastBracket + 1).trim();
      }
    }

    const candidates = [];
    const seen = new Set();
    const addCandidate = (value) => {
      const next = String(value || '').trim();
      if (!next || seen.has(next)) return;
      seen.add(next);
      candidates.push(next);
    };
    addCandidate(normalized);

    const normalizeJsonLikeObject = (source) =>
      String(source || '')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/"([^"]+)'(?=\s*:)/g, '"$1"')
        .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":')
        .replace(/([{,]\s*)'([^'\\]+?)'\s*:/g, '$1"$2":')
        .replace(/:\s*'([^'\\]*)'/g, ': "$1"');

    addCandidate(normalized.replace(/,\s*([}\]])/g, '$1'));
    addCandidate(normalizeJsonLikeObject(normalized));
    addCandidate(normalizeJsonLikeObject(normalized.replace(/,\s*([}\]])/g, '$1')));

    let lastErrorMessage = '';
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) {
          return parsed;
        }

        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.services)) {
            return parsed.services;
          }
          if (parsed.publicSite && typeof parsed.publicSite === 'object' && Array.isArray(parsed.publicSite.services)) {
            return parsed.publicSite.services;
          }
        }

        throw new Error(`${fieldName} måste vara en JSON-array.`);
      } catch (error) {
        lastErrorMessage = String(error?.message || '').trim();
      }
    }

    const suffix = lastErrorMessage ? ` (${lastErrorMessage})` : '';
    throw new Error(`${fieldName} måste vara giltig JSON-array${suffix}.`);
  }

  function toPrettyJson(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
    const compact = Object.entries(value).reduce((acc, [key, item]) => {
      if (!Array.isArray(item) || item.length === 0) return acc;
      acc[key] = item;
      return acc;
    }, {});
    return JSON.stringify(compact, null, 2);
  }

  function toPrettyJsonAny(value, fallback = '{}') {
    if (Array.isArray(value)) return JSON.stringify(value, null, 2);
    if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
    return fallback;
  }

  function inferToastTone(message, isError = false) {
    if (isError) return 'error';
    const normalized = String(message || '').toLowerCase();
    if (/(warn|warning|varning|review_required|pending|l3)/.test(normalized)) return 'warn';
    return 'success';
  }

  function inferToastTitle(tone) {
    if (tone === 'error') return 'Fel';
    if (tone === 'warn') return 'Observera';
    if (tone === 'success') return 'Klart';
    return 'Info';
  }

  function shouldPinToast(message, tone) {
    const normalized = String(message || '').toLowerCase();
    if (tone === 'error') return true;
    return /(critical|kritisk|high\/critical|incident|blocked|sla|l5)/.test(normalized);
  }

  function isProgressStatus(message) {
    const normalized = String(message || '')
      .trim()
      .toLowerCase();
    if (!normalized) return false;
    if (normalized.endsWith('...')) return true;
    return /^(laddar|sparar|genererar|utv[aä]rderar|aktiverar|arkiverar|uppdaterar|h[aä]mtar|k[öo]r|avslutar|skapar)\b/.test(
      normalized
    );
  }

  function removeToast(node) {
    if (!node) return;
    if (node.classList.contains('closing')) return;
    node.classList.add('closing');
    window.setTimeout(() => {
      node.remove();
    }, 220);
  }

  function pushToast(message, { tone = 'success', title = '', sticky = false, durationMs } = {}) {
    const text = String(message || '').trim();
    if (!text || !els.toastViewport) return;

    const toastTone = ['success', 'warn', 'error'].includes(tone) ? tone : 'success';
    const toastTitle = title || inferToastTitle(toastTone);
    const duplicate = Array.from(els.toastViewport.querySelectorAll('.toast')).find((toastNode) => {
      const nodeTone = String(toastNode.className || '').toLowerCase();
      const nodeTitle = String(toastNode.querySelector('.toast-title')?.textContent || '').trim();
      const nodeMessage = String(toastNode.querySelector('.toast-message')?.textContent || '').trim();
      return nodeTone.includes(` ${toastTone}`) && nodeTitle === toastTitle && nodeMessage === text;
    });
    if (duplicate) {
      removeToast(duplicate);
    }
    const ttl = Number.isFinite(Number(durationMs)) ? Math.max(1800, Number(durationMs)) : TOAST_AUTO_DISMISS_MS;
    const toastId = `toast-${Date.now()}-${++state.toastSequence}`;

    const node = document.createElement('article');
    node.className = `toast ${toastTone}`;
    node.setAttribute('data-toast-id', toastId);
    node.innerHTML = `
      <div class="toast-header">
        <div class="toast-title">${escapeHtml(toastTitle)}</div>
        <button class="toast-close" type="button" aria-label="Stäng notis">×</button>
      </div>
      <div class="toast-message">${escapeHtml(text)}</div>
    `;

    const closeBtn = node.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => removeToast(node));

    els.toastViewport.prepend(node);

    const overflow = els.toastViewport.querySelectorAll('.toast');
    overflow.forEach((item, index) => {
      if (index > 5) removeToast(item);
    });

    if (!sticky) {
      window.setTimeout(() => {
        removeToast(node);
      }, ttl);
    }
  }

  function maybeToastFromStatus(message, isError = false) {
    const text = String(message || '').trim();
    if (!text) return;
    if (!isError && isProgressStatus(text)) return;
    if (!isError && /^ingen\b/i.test(text)) return;
    if (
      !isError &&
      !/(klar|skapad|sparad|aktiverad|arkiverad|klonad|inloggad|avslutad|uppdaterad|onboardad|bytte tenant|lösenord genererat|applicerat)/i.test(
        text
      )
    ) {
      return;
    }

    const tone = inferToastTone(text, isError);
    const dedupeKey = `${tone}:${text}`;
    const now = Date.now();
    if (dedupeKey === state.lastToastKey && now - state.lastToastAt < 1200) {
      return;
    }
    state.lastToastKey = dedupeKey;
    state.lastToastAt = now;

    pushToast(text, {
      tone,
      sticky: shouldPinToast(text, tone),
    });
  }

  function setStatus(el, message, isError = false, options = {}) {
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#ffb2b2' : '#9aa6bb';
    const toastMode = options && typeof options === 'object' ? options.toast || 'auto' : 'auto';
    if (toastMode === 'none') return;
    maybeToastFromStatus(message, isError);
  }

  function normalizeWritingMailbox(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function isValidWritingMailbox(value = '') {
    const mailbox = normalizeWritingMailbox(value);
    if (!mailbox || mailbox.length > 320) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox);
  }

  function toWritingIdentityProfile(source = {}) {
    const safe = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const sentenceLength = String(safe.sentenceLength || '').trim().toLowerCase();
    const ctaStyle = String(safe.ctaStyle || '').trim();
    const greetingStyle = String(safe.greetingStyle || '').trim();
    const closingStyle = String(safe.closingStyle || '').trim();
    const formalityLevel = Number(safe.formalityLevel);
    const warmthIndex = Number(safe.warmthIndex);
    return {
      greetingStyle: greetingStyle || 'Hej,',
      closingStyle: closingStyle || 'Vänliga hälsningar',
      formalityLevel: Number.isFinite(formalityLevel)
        ? Math.max(0, Math.min(10, Math.round(formalityLevel)))
        : 5,
      ctaStyle: ctaStyle || 'balanced',
      sentenceLength: ['short', 'medium', 'long'].includes(sentenceLength) ? sentenceLength : 'medium',
      emojiUsage: safe.emojiUsage === true,
      warmthIndex: Number.isFinite(warmthIndex) ? Math.max(0, Math.min(10, Math.round(warmthIndex))) : 5,
    };
  }

  function getWritingProfileRecord(mailbox = '') {
    const normalizedMailbox = normalizeWritingMailbox(mailbox);
    if (!normalizedMailbox) return null;
    return (
      (Array.isArray(state.writingIdentityProfiles) ? state.writingIdentityProfiles : []).find(
        (item) => normalizeWritingMailbox(item?.mailbox) === normalizedMailbox
      ) || null
    );
  }

  function fillWritingIdentityForm(record = null) {
    const profile = toWritingIdentityProfile(record?.profile || {});
    const mailbox = normalizeWritingMailbox(record?.mailbox || '');
    if (els.writingIdentityMailboxInput) {
      els.writingIdentityMailboxInput.value = mailbox;
    }
    if (els.writingIdentityGreeting) els.writingIdentityGreeting.value = profile.greetingStyle;
    if (els.writingIdentityClosing) els.writingIdentityClosing.value = profile.closingStyle;
    if (els.writingIdentityFormality) els.writingIdentityFormality.value = String(profile.formalityLevel);
    if (els.writingIdentityWarmth) els.writingIdentityWarmth.value = String(profile.warmthIndex);
    if (els.writingIdentitySentenceLength) els.writingIdentitySentenceLength.value = profile.sentenceLength;
    if (els.writingIdentityCtaStyle) els.writingIdentityCtaStyle.value = profile.ctaStyle;
    if (els.writingIdentityEmojiUsage) {
      els.writingIdentityEmojiUsage.value = profile.emojiUsage ? 'true' : 'false';
    }
    if (els.writingIdentityProfileMeta) {
      if (!record) {
        els.writingIdentityProfileMeta.textContent = 'Ingen profil vald.';
      } else {
        const version = Number(record.version || 1);
        const source = String(record.source || 'auto').trim() || 'auto';
        const updatedAt = formatDateTime(record.updatedAt || record.createdAt || '', true);
        els.writingIdentityProfileMeta.textContent = `Mailbox: ${mailbox} • v${version} • source=${source} • uppdaterad ${updatedAt}`;
      }
    }
  }

  function renderWritingIdentityProfiles() {
    const profiles = Array.isArray(state.writingIdentityProfiles) ? state.writingIdentityProfiles : [];
    if (els.writingIdentityCount) {
      els.writingIdentityCount.textContent = `Profiler: ${profiles.length}`;
    }

    if (els.writingIdentityMailboxSelect) {
      const current = normalizeWritingMailbox(state.selectedWritingIdentityMailbox);
      els.writingIdentityMailboxSelect.innerHTML = '<option value="">Välj mailbox</option>';
      for (const item of profiles) {
        const mailbox = normalizeWritingMailbox(item?.mailbox);
        if (!mailbox) continue;
        const option = document.createElement('option');
        option.value = mailbox;
        option.textContent = mailbox;
        els.writingIdentityMailboxSelect.appendChild(option);
      }
      els.writingIdentityMailboxSelect.value = current;
    }

    if (!els.writingIdentityTableBody) return;
    els.writingIdentityTableBody.innerHTML = '';
    if (!profiles.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="muted">Inga profiler laddade.</td>';
      els.writingIdentityTableBody.appendChild(tr);
      return;
    }

    const selectedMailbox = normalizeWritingMailbox(state.selectedWritingIdentityMailbox);
    for (const item of profiles) {
      const mailbox = normalizeWritingMailbox(item?.mailbox);
      if (!mailbox) continue;
      const tr = document.createElement('tr');
      if (mailbox === selectedMailbox) tr.classList.add('staff-row-active');
      const version = Number(item?.version || 1);
      const source = String(item?.source || 'auto').trim() || 'auto';
      const updatedAt = formatDateTime(item?.updatedAt || item?.createdAt || '', true);
      tr.innerHTML = `
        <td class="code">${escapeHtml(mailbox)}</td>
        <td>${version}</td>
        <td>${escapeHtml(source)}</td>
        <td class="mini">${escapeHtml(updatedAt)}</td>
        <td><button type="button" class="btn small writingIdentitySelectBtn" data-mailbox="${escapeHtml(mailbox)}">Välj</button></td>
      `;
      els.writingIdentityTableBody.appendChild(tr);
    }

    els.writingIdentityTableBody.querySelectorAll('.writingIdentitySelectBtn').forEach((button) => {
      button.addEventListener('click', () => {
        const mailbox = normalizeWritingMailbox(button.getAttribute('data-mailbox') || '');
        if (!mailbox) return;
        state.selectedWritingIdentityMailbox = mailbox;
        const record = getWritingProfileRecord(mailbox);
        fillWritingIdentityForm(record);
        renderWritingIdentityProfiles();
      });
    });
  }

  async function loadWritingIdentityProfiles({ quiet = false, mailbox = '' } = {}) {
    try {
      const mailboxFilter = normalizeWritingMailbox(mailbox);
      const query = new URLSearchParams();
      if (isValidWritingMailbox(mailboxFilter)) {
        query.set('mailbox', mailboxFilter);
      }
      const path = query.toString()
        ? `/cco/writing-identities?${query.toString()}`
        : '/cco/writing-identities';
      if (!quiet) setStatus(els.writingIdentityStatus, 'Laddar Writing Identity-profiler...');
      const response = await api(path);
      const profiles = Array.isArray(response?.profiles) ? response.profiles : [];
      state.writingIdentityProfiles = profiles
        .map((item) => ({
          mailbox: normalizeWritingMailbox(item?.mailbox),
          version: Number(item?.version || 1),
          source: String(item?.source || 'auto').trim() || 'auto',
          profile: toWritingIdentityProfile(item?.profile || {}),
          createdAt: item?.createdAt || '',
          updatedAt: item?.updatedAt || '',
        }))
        .filter((item) => isValidWritingMailbox(item.mailbox))
        .sort((left, right) => String(left.mailbox).localeCompare(String(right.mailbox)));

      const selectedMailbox = normalizeWritingMailbox(state.selectedWritingIdentityMailbox);
      if (!selectedMailbox || !getWritingProfileRecord(selectedMailbox)) {
        state.selectedWritingIdentityMailbox = state.writingIdentityProfiles[0]?.mailbox || '';
      }
      const selectedRecord = getWritingProfileRecord(state.selectedWritingIdentityMailbox);
      fillWritingIdentityForm(selectedRecord);
      renderWritingIdentityProfiles();
      if (!quiet) {
        setStatus(els.writingIdentityStatus, `Writing Identity-profiler laddade: ${state.writingIdentityProfiles.length}.`);
      }
    } catch (error) {
      if (!quiet) {
        setStatus(
          els.writingIdentityStatus,
          error.message || 'Kunde inte läsa Writing Identity-profiler.',
          true
        );
      }
    }
  }

  async function saveWritingIdentityProfile() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan spara Writing Identity.');
      const mailbox = normalizeWritingMailbox(els.writingIdentityMailboxInput?.value || '');
      if (!isValidWritingMailbox(mailbox)) {
        throw new Error('Mailbox måste vara giltig email/UPN.');
      }

      const profile = toWritingIdentityProfile({
        greetingStyle: els.writingIdentityGreeting?.value,
        closingStyle: els.writingIdentityClosing?.value,
        formalityLevel: els.writingIdentityFormality?.value,
        ctaStyle: els.writingIdentityCtaStyle?.value,
        sentenceLength: els.writingIdentitySentenceLength?.value,
        emojiUsage: String(els.writingIdentityEmojiUsage?.value || '').trim() === 'true',
        warmthIndex: els.writingIdentityWarmth?.value,
      });

      setStatus(els.writingIdentityEditStatus, `Sparar Writing Identity för ${mailbox}...`);
      const response = await api(`/cco/writing-identities/${encodeURIComponent(mailbox)}`, {
        method: 'PUT',
        body: {
          mailbox,
          profile,
        },
      });

      const savedMailbox = normalizeWritingMailbox(response?.profile?.mailbox || mailbox);
      state.selectedWritingIdentityMailbox = savedMailbox;
      await loadWritingIdentityProfiles({ quiet: true });
      setStatus(
        els.writingIdentityEditStatus,
        `Writing Identity sparad för ${savedMailbox} (v${Number(response?.profile?.version || 1)}).`
      );
    } catch (error) {
      setStatus(
        els.writingIdentityEditStatus,
        error.message || 'Kunde inte spara Writing Identity.',
        true
      );
    }
  }

  async function autoExtractWritingIdentityProfiles() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan köra auto-extraktion.');
      const sampleSizeRaw = Number(els.writingIdentitySampleSize?.value || 40);
      const sampleSize = Math.max(30, Math.min(50, Number.isFinite(sampleSizeRaw) ? Math.round(sampleSizeRaw) : 40));
      if (els.writingIdentitySampleSize) {
        els.writingIdentitySampleSize.value = String(sampleSize);
      }
      const mailboxFilter = normalizeWritingMailbox(els.writingIdentityMailboxFilter?.value || '');
      const mailboxes = isValidWritingMailbox(mailboxFilter) ? [mailboxFilter] : [];

      setStatus(els.writingIdentityStatus, 'Kör auto-extraktion av Writing Identity...');
      const response = await api('/cco/writing-identities/auto-extract', {
        method: 'POST',
        body: {
          sampleSize,
          mailboxes,
        },
      });

      const updatedProfiles = Array.isArray(response?.updatedProfiles) ? response.updatedProfiles : [];
      await loadWritingIdentityProfiles({ quiet: true });
      setStatus(
        els.writingIdentityStatus,
        `Auto-extraktion klar. Uppdaterade profiler: ${updatedProfiles.length}.`
      );
    } catch (error) {
      setStatus(
        els.writingIdentityStatus,
        error.message || 'Kunde inte auto-extrahera Writing Identity.',
        true
      );
    }
  }

  function isModalOpen() {
    return Boolean(els.appModalBackdrop && !els.appModalBackdrop.classList.contains('hidden'));
  }

  function getModalInputNode() {
    if (els.appModalInput && !els.appModalInput.classList.contains('hidden')) return els.appModalInput;
    if (els.appModalTextarea && !els.appModalTextarea.classList.contains('hidden')) return els.appModalTextarea;
    return null;
  }

  function readModalInputValue() {
    const node = getModalInputNode();
    return node ? String(node.value || '') : '';
  }

  function setModalHint(message, isError = false) {
    if (!els.appModalHint) return;
    const text = String(message || '').trim();
    if (!text) {
      els.appModalHint.textContent = '';
      els.appModalHint.classList.add('hidden');
      els.appModalHint.classList.remove('error');
      return;
    }
    els.appModalHint.textContent = text;
    els.appModalHint.classList.remove('hidden');
    els.appModalHint.classList.toggle('error', Boolean(isError));
  }

  function resetModalInputState() {
    if (els.appModalInput) {
      els.appModalInput.classList.add('hidden');
      els.appModalInput.classList.remove('input-error');
      els.appModalInput.type = 'text';
      els.appModalInput.value = '';
      els.appModalInput.placeholder = '';
    }
    if (els.appModalTextarea) {
      els.appModalTextarea.classList.add('hidden');
      els.appModalTextarea.classList.remove('input-error');
      els.appModalTextarea.value = '';
      els.appModalTextarea.placeholder = '';
    }
    if (els.appModalInputLabel) {
      els.appModalInputLabel.classList.add('hidden');
      els.appModalInputLabel.textContent = '';
    }
    setModalHint('', false);
  }

  function nudgeModalDialog() {
    if (!els.appModalDialog) return;
    els.appModalDialog.classList.remove('modal-nudge');
    void els.appModalDialog.offsetWidth;
    els.appModalDialog.classList.add('modal-nudge');
  }

  function handleBlockedModalDismiss() {
    const message = String(
      activeModalOptions?.blockedDismissHint || 'Stäng via knapparna i dialogen.'
    ).trim();
    if (message) setModalHint(message, false);
    nudgeModalDialog();
  }

  function closeAppModal(result = { confirmed: false, value: '' }) {
    if (!els.appModalBackdrop) return;
    if (els.appModalBackdrop.classList.contains('hidden') && !activeModalResolver) return;

    els.appModalBackdrop.classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (els.appModalDialog) {
      els.appModalDialog.classList.remove('modal-nudge');
    }

    const resolver = activeModalResolver;
    activeModalResolver = null;
    activeModalOptions = null;

    if (activeModalFocusReturn && typeof activeModalFocusReturn.focus === 'function') {
      activeModalFocusReturn.focus();
    }
    activeModalFocusReturn = null;

    resetModalInputState();

    if (resolver) {
      resolver({
        confirmed: Boolean(result?.confirmed),
        value: String(result?.value || ''),
      });
    }
  }

  function validateModalSubmission(options = {}) {
    const value = readModalInputValue();
    const normalized = String(value).trim();
    const requiredExact = String(options.requiredExact || '');
    const allowEmpty = options.allowEmpty !== false;

    if (requiredExact) {
      if (normalized !== requiredExact) {
        setModalHint(`Fel bekräftelse. Skriv exakt: ${requiredExact}`, true);
        const node = getModalInputNode();
        node?.classList.add('input-error');
        node?.focus();
        node?.select?.();
        return { ok: false, value };
      }
    } else if (!allowEmpty && !normalized) {
      setModalHint('Detta fält är obligatoriskt.', true);
      const node = getModalInputNode();
      node?.classList.add('input-error');
      node?.focus();
      return { ok: false, value };
    }

    const node = getModalInputNode();
    node?.classList.remove('input-error');
    if (options.hint) {
      setModalHint(String(options.hint || ''), false);
    } else {
      setModalHint('', false);
    }
    return { ok: true, value };
  }

  function handleAppModalConfirm() {
    if (!activeModalResolver) return;
    const options = activeModalOptions || {};
    const validation = validateModalSubmission(options);
    if (!validation.ok) return;
    closeAppModal({ confirmed: true, value: validation.value });
  }

  function openAppModal(options = {}) {
    if (!els.appModalBackdrop || !els.appModalTitle || !els.appModalConfirmBtn || !els.appModalCancelBtn) {
      const fallbackMessage = String(options.message || options.title || 'Bekräfta');
      if (options.inputMode && options.inputMode !== 'none') {
        const fallback = window.prompt(fallbackMessage, String(options.defaultValue || ''));
        return Promise.resolve({
          confirmed: fallback !== null,
          value: fallback === null ? '' : String(fallback),
        });
      }
      return Promise.resolve({
        confirmed: window.confirm(fallbackMessage),
        value: '',
      });
    }

    if (activeModalResolver) {
      closeAppModal({ confirmed: false, value: '' });
    }

    const normalized = {
      title: String(options.title || 'Bekräfta'),
      message: String(options.message || ''),
      confirmLabel: String(options.confirmLabel || 'Bekräfta'),
      cancelLabel: String(options.cancelLabel || 'Avbryt'),
      inputMode: ['none', 'text', 'textarea'].includes(String(options.inputMode || '').trim())
        ? String(options.inputMode || 'none').trim()
        : 'none',
      inputLabel: String(options.inputLabel || ''),
      inputPlaceholder: String(options.inputPlaceholder || ''),
      defaultValue: String(options.defaultValue || ''),
      inputType: ['text', 'password', 'email', 'search'].includes(String(options.inputType || '').trim())
        ? String(options.inputType || 'text').trim()
        : 'text',
      hint: String(options.hint || ''),
      requiredExact: String(options.requiredExact || ''),
      allowEmpty: options.allowEmpty !== false,
      confirmTone: String(options.confirmTone || 'primary').toLowerCase() === 'danger' ? 'danger' : 'primary',
      closeOnEscape: options.closeOnEscape === true,
      closeOnBackdrop: options.closeOnBackdrop === true,
      blockedDismissHint: String(options.blockedDismissHint || 'Stäng via knapparna i dialogen.'),
    };

    activeModalOptions = normalized;
    activeModalFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    els.appModalTitle.textContent = normalized.title;
    if (els.appModalSubtitle) {
      els.appModalSubtitle.textContent = normalized.message;
    }
    els.appModalConfirmBtn.textContent = normalized.confirmLabel;
    els.appModalCancelBtn.textContent = normalized.cancelLabel;
    els.appModalConfirmBtn.classList.remove('danger', 'primary');
    els.appModalConfirmBtn.classList.add(normalized.confirmTone === 'danger' ? 'danger' : 'primary');

    resetModalInputState();
    if (normalized.hint) {
      setModalHint(normalized.hint, false);
    }

    if (normalized.inputMode === 'text' && els.appModalInput) {
      if (els.appModalInputLabel) {
        els.appModalInputLabel.textContent = normalized.inputLabel || 'Notering';
        els.appModalInputLabel.classList.remove('hidden');
      }
      els.appModalInput.classList.remove('hidden');
      els.appModalInput.type = normalized.inputType;
      els.appModalInput.placeholder = normalized.inputPlaceholder;
      els.appModalInput.value = normalized.defaultValue;
    } else if (normalized.inputMode === 'textarea' && els.appModalTextarea) {
      if (els.appModalInputLabel) {
        els.appModalInputLabel.textContent = normalized.inputLabel || 'Text';
        els.appModalInputLabel.classList.remove('hidden');
      }
      els.appModalTextarea.classList.remove('hidden');
      els.appModalTextarea.placeholder = normalized.inputPlaceholder;
      els.appModalTextarea.value = normalized.defaultValue;
    }

    els.appModalBackdrop.classList.remove('hidden');
    document.body.classList.add('modal-open');

    const focusTarget = getModalInputNode() || els.appModalConfirmBtn;
    window.setTimeout(() => {
      focusTarget?.focus();
      if (focusTarget && typeof focusTarget.select === 'function' && normalized.requiredExact) {
        focusTarget.select();
      }
    }, 0);

    return new Promise((resolve) => {
      activeModalResolver = resolve;
    });
  }

  function clampNumber(value, min, max, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function formatCompactNumber(value, decimals = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    if (Number.isInteger(numeric)) return String(numeric);
    return numeric.toFixed(decimals);
  }

  function normalizeRiskModifier(value) {
    const clamped = clampNumber(value, -10, 10, 0);
    return Number(formatCompactNumber(clamped, 1));
  }

  function describeRiskModifier(modifier) {
    if (modifier <= -6) return 'mycket konservativ';
    if (modifier <= -2) return 'konservativ';
    if (modifier < 2) return 'neutral';
    if (modifier < 6) return 'aggressiv';
    return 'mycket aggressiv';
  }

  function renderRiskModifierDisplay() {
    if (!els.riskModifierDisplay) return;
    const modifier = normalizeRiskModifier(els.riskModifier?.value);
    const prefix = modifier > 0 ? '+' : '';
    els.riskModifierDisplay.textContent = `${prefix}${formatCompactNumber(modifier, 1)} • ${describeRiskModifier(
      modifier
    )}`;
  }

  function syncRiskModifierControls(source = 'number') {
    const primaryValue =
      source === 'range'
        ? normalizeRiskModifier(els.riskModifierRange?.value)
        : normalizeRiskModifier(els.riskModifier?.value);

    if (els.riskModifier) {
      els.riskModifier.value = formatCompactNumber(primaryValue, 1);
    }
    if (els.riskModifierRange) {
      els.riskModifierRange.value = formatCompactNumber(primaryValue, 1);
    }
    renderRiskModifierDisplay();
    return primaryValue;
  }

  function buildTonePreviewText(toneStyle, assistantName, brandProfile) {
    const tone = String(toneStyle || '').trim().toLowerCase();
    const assistant = String(assistantName || '').trim() || 'Arcana';
    const brand = String(brandProfile || '').trim() || 'kliniken';

    if (tone === 'concise-executive') {
      return `Hej {{patient_name}},\n\nDin förfrågan är registrerad. ${assistant} koordinerar nästa steg och du får återkoppling från ${brand} inom kort.\n\nMvh\n${assistant}`;
    }
    if (tone === 'empathetic-clinical') {
      return `Hej {{patient_name}},\n\nTack för att du hörde av dig. Vi förstår att detta är viktigt för dig och ${assistant} hjälper dig vidare med tydliga nästa steg från ${brand}.\n\nVänligen\n${assistant}`;
    }
    if (tone === 'luxury-premium') {
      return `Hej {{patient_name}},\n\nVarmt välkommen till ${brand}. ${assistant} ser till att din konsultationsupplevelse blir personlig, diskret och professionell.\n\nMed vänlig hälsning\n${assistant}`;
    }
    return `Hej {{patient_name}},\n\nTack för din förfrågan till ${brand}. ${assistant} hjälper dig gärna med nästa steg och återkommer så snart som möjligt.\n\nMed vänlig hälsning\n${assistant}`;
  }

  function normalizeBrandColorForUi(value, palette, fallback) {
    const normalized = String(value || '').trim().toUpperCase();
    if (palette.includes(normalized)) return normalized;
    return fallback;
  }

  function applyBrandPreview(primaryColor, accentColor) {
    if (els.tonePreviewPrimaryDot) {
      els.tonePreviewPrimaryDot.style.backgroundColor = primaryColor;
    }
    if (els.tonePreviewAccentDot) {
      els.tonePreviewAccentDot.style.backgroundColor = accentColor;
    }
    if (els.tonePreviewPrimaryBtn) {
      els.tonePreviewPrimaryBtn.style.backgroundColor = primaryColor;
      els.tonePreviewPrimaryBtn.style.borderColor = primaryColor;
      els.tonePreviewPrimaryBtn.style.color = '#ffffff';
    }
    if (els.tonePreviewAccentBtn) {
      els.tonePreviewAccentBtn.style.borderColor = accentColor;
      els.tonePreviewAccentBtn.style.color = accentColor;
    }
    if (els.tonePreviewCard) {
      els.tonePreviewCard.style.borderColor = `${accentColor}44`;
      els.tonePreviewCard.style.boxShadow = `inset 0 0 0 1px ${primaryColor}22`;
    }
  }

  function updateTonePresetButtons() {
    if (!els.tonePresetButtons) return;
    const currentTone = String(els.toneStyle?.value || '')
      .trim()
      .toLowerCase();
    els.tonePresetButtons.querySelectorAll('.tonePresetBtn').forEach((button) => {
      const tone = String(button.getAttribute('data-tone') || '')
        .trim()
        .toLowerCase();
      const active = Boolean(tone && tone === currentTone);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function renderTonePreview() {
    const assistant = String(els.assistantName?.value || '').trim() || 'Arcana';
    const tone = String(els.toneStyle?.value || '').trim() || 'professional-warm';
    const brand = String(els.brandProfile?.value || '').trim() || 'Hair TP Clinic';
    const logoUrl = String(els.brandLogoUrl?.value || '').trim();
    const primaryColor = normalizeBrandColorForUi(
      els.brandPrimaryColor?.value,
      BRAND_PRIMARY_COLORS,
      DEFAULT_BRAND_PRIMARY_COLOR
    );
    const accentColor = normalizeBrandColorForUi(
      els.brandAccentColor?.value,
      BRAND_ACCENT_COLORS,
      DEFAULT_BRAND_ACCENT_COLOR
    );
    if (els.brandPrimaryColor && els.brandPrimaryColor.value !== primaryColor) {
      els.brandPrimaryColor.value = primaryColor;
    }
    if (els.brandAccentColor && els.brandAccentColor.value !== accentColor) {
      els.brandAccentColor.value = accentColor;
    }
    const modifier = syncRiskModifierControls('number');

    if (els.tonePreviewMeta) {
      const prefix = modifier > 0 ? '+' : '';
      els.tonePreviewMeta.textContent = `assistent=${assistant} • ton=${tone} • varumärke=${brand} • riskmodifierare=${prefix}${formatCompactNumber(
        modifier,
        1
      )} • primär=${primaryColor} • accent=${accentColor}`;
    }
    if (els.tonePreviewText) {
      els.tonePreviewText.textContent = buildTonePreviewText(tone, assistant, brand);
    }
    if (els.tonePreviewLogo) {
      if (logoUrl) {
        els.tonePreviewLogo.src = logoUrl;
        els.tonePreviewLogo.alt = `${brand} logga`;
        els.tonePreviewLogo.onerror = () => {
          els.tonePreviewLogo.classList.add('hidden');
        };
        els.tonePreviewLogo.onload = () => {
          els.tonePreviewLogo.classList.remove('hidden');
        };
        els.tonePreviewLogo.classList.remove('hidden');
      } else {
        els.tonePreviewLogo.removeAttribute('src');
        els.tonePreviewLogo.alt = 'Förhandsvisning av logga';
        els.tonePreviewLogo.classList.add('hidden');
      }
    }
    applyBrandPreview(primaryColor, accentColor);
    updateTonePresetButtons();
  }

  function generateStrongPassword(length = 14) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const size = Math.max(10, Math.min(32, Number(length) || 14));
    let output = '';
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(Math.random() * chars.length);
      output += chars[index];
    }
    return output;
  }

  function looksLikeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getPasswordStrength(password) {
    const value = String(password || '');
    let score = 0;
    if (value.length >= 10) score += 1;
    if (value.length >= 14) score += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (score <= 2) return { level: 'weak', label: 'svagt' };
    if (score <= 4) return { level: 'medium', label: 'ok' };
    return { level: 'strong', label: 'starkt' };
  }

  function copyText(text) {
    if (!navigator.clipboard?.writeText) return Promise.reject(new Error('Clipboard saknas.'));
    return navigator.clipboard.writeText(String(text || ''));
  }

  function buildStaffInviteMessage({ email, password, tenantId }) {
    const safeEmail = String(email || '').trim();
    const safePassword = String(password || '').trim();
    const safeTenant = String(tenantId || '').trim();
    return [
      `Hej ${safeEmail},`,
      '',
      'Du är nu inbjuden till Major Arcana.',
      `Inloggning: ${window.location.origin}/admin.html`,
      `Klinik: ${safeTenant || '-'}`,
      `E-post: ${safeEmail}`,
      `Temporärt lösenord: ${safePassword}`,
      '',
      'Byt lösenord direkt efter första inloggning.',
    ].join('\n');
  }

  function setStaffInvitePreview(message = '') {
    const content = String(message || '').trim();
    state.lastInviteMessage = content;
    if (els.staffInvitePreview) {
      els.staffInvitePreview.textContent = content || 'Ingen inbjudningstext ännu.';
    }
    if (els.copyInviteMessageBtn) {
      els.copyInviteMessageBtn.disabled = !content;
    }
  }

  function getStaffMemberByMembershipId(membershipId) {
    const targetId = String(membershipId || '').trim();
    if (!targetId) return null;
    return (
      state.staffMembers.find((item) => String(item?.membership?.id || '') === targetId) || null
    );
  }

  function renderSelectedStaffProfile() {
    const selected = getStaffMemberByMembershipId(state.selectedStaffMembershipId);
    if (!selected) {
      state.selectedStaffMembershipId = '';
      if (els.selectedStaffMeta) els.selectedStaffMeta.textContent = 'Ingen medarbetare vald.';
      if (els.selectedStaffDetails) {
        els.selectedStaffDetails.textContent =
          'Välj en rad i tabellen för att se detaljer och nästa steg.';
      }
      if (els.resetSelectedStaffPasswordBtn) els.resetSelectedStaffPasswordBtn.disabled = true;
      if (els.selectedStaffRoleBtn) {
        els.selectedStaffRoleBtn.disabled = true;
        els.selectedStaffRoleBtn.textContent = 'Ändra roll';
        delete els.selectedStaffRoleBtn.dataset.role;
      }
      if (els.copySelectedStaffInviteBtn) els.copySelectedStaffInviteBtn.disabled = true;
      return;
    }

    const email = String(selected?.user?.email || '-');
    const roleRaw = String(selected?.membership?.role || '-');
    const statusRaw = String(selected?.membership?.status || '-');
    const role = formatRoleLabel(roleRaw);
    const status = formatStatusLabel(statusRaw);
    const createdAt = formatDateTime(selected?.membership?.createdAt || selected?.user?.createdAt);
    const updatedAt = formatDateTime(selected?.membership?.updatedAt || selected?.user?.updatedAt);
    const membershipId = String(selected?.membership?.id || '-');
    const userId = String(selected?.user?.id || '-');
    const activeOwnerCount = (Array.isArray(state.staffMembers) ? state.staffMembers : []).filter(
      (item) => item?.membership?.role === 'OWNER' && item?.membership?.status === 'active'
    ).length;
    const currentMembershipId = String(state.profile?.membership?.id || '').trim();
    const isCurrentMembership = Boolean(
      membershipId !== '-' && currentMembershipId && membershipId === currentMembershipId
    );

    if (els.selectedStaffMeta) {
      els.selectedStaffMeta.textContent = `${email} • ${role} • ${status}`;
    }
    if (els.selectedStaffDetails) {
      els.selectedStaffDetails.textContent = [
        `email: ${email}`,
        `roll: ${role}`,
        `status: ${status}`,
        `membershipId: ${membershipId}`,
        `userId: ${userId}`,
        `createdAt: ${createdAt}`,
        `updatedAt: ${updatedAt}`,
        isCurrentMembership
          ? isEnglishLanguage()
            ? 'session: current'
            : 'session: aktuell'
          : isEnglishLanguage()
          ? 'session: other'
          : 'session: annan',
      ].join('\n');
    }
    const canReset = isOwner() && role !== 'OWNER';
    if (els.resetSelectedStaffPasswordBtn) els.resetSelectedStaffPasswordBtn.disabled = !canReset;
    if (els.selectedStaffRoleBtn) {
      let nextRole = '';
      let label = 'Ändra roll';
      let enabled = false;

      if (isOwner()) {
        if (role === 'STAFF') {
          nextRole = 'OWNER';
          label = isEnglishLanguage() ? 'Promote OWNER' : 'Befordra till ÄGARE';
          enabled = true;
        } else if (role === 'OWNER') {
          nextRole = 'STAFF';
          label = isEnglishLanguage() ? 'Demote STAFF' : 'Sänk till MEDARBETARE';
          enabled = activeOwnerCount > 1 && !isCurrentMembership;
        }
      }

      els.selectedStaffRoleBtn.textContent = label;
      if (nextRole) els.selectedStaffRoleBtn.dataset.role = nextRole;
      else delete els.selectedStaffRoleBtn.dataset.role;
      els.selectedStaffRoleBtn.disabled = !enabled;
    }
    if (els.copySelectedStaffInviteBtn) {
      els.copySelectedStaffInviteBtn.disabled = !canReset;
    }
  }

  function selectStaffMember(membershipId) {
    state.selectedStaffMembershipId = String(membershipId || '').trim();
    renderSelectedStaffProfile();
    renderStaffTable(state.staffMembers);
  }

  function renderProfileCard(profile = null) {
    const data = profile && typeof profile === 'object' ? profile : null;
    setText(els.profileEmailValue, data?.user?.email || '-');
    setText(els.profileRoleValue, data?.membership?.role || state.role || '-');
    setText(els.profileTenantValue, data?.membership?.tenantId || state.tenantId || '-');
    setText(
      els.profileSessionExpiresValue,
      data?.session?.expiresAt ? formatDateTime(data.session.expiresAt) : '-'
    );
    setText(els.profilePermissionsValue, Array.isArray(data?.permissions) ? data.permissions.length : 0);
    setText(els.profileTenantsValue, Array.isArray(data?.memberships) ? data.memberships.length : 0);
  }

  function readStaffFiltersFromInputs() {
    state.staffFilters = {
      search: String(els.staffSearchInput?.value || '')
        .trim()
        .toLowerCase(),
      status: String(els.staffStatusFilter?.value || '').trim().toLowerCase(),
    };
  }

  function getFilteredStaffMembers(members = []) {
    const search = state.staffFilters.search || '';
    const statusFilter = state.staffFilters.status || '';
    return members.filter((item) => {
      const email = String(item?.user?.email || '').toLowerCase();
      const role = String(item?.membership?.role || '').toLowerCase();
      const status = String(item?.membership?.status || '').toLowerCase();

      if (search) {
        const haystack = `${email} ${role} ${status}`;
        if (!haystack.includes(search)) return false;
      }
      if (statusFilter === 'owner') return role === 'owner';
      if (statusFilter) return status === statusFilter;
      return true;
    });
  }

  function renderTeamSummary(members = []) {
    const total = members.length;
    const active = members.filter((item) => item?.membership?.status === 'active').length;
    const disabled = members.filter((item) => item?.membership?.status === 'disabled').length;
    const owners = members.filter((item) => item?.membership?.role === 'OWNER').length;

    setText(els.teamSummaryTotal, total);
    setText(els.teamSummaryActive, active);
    setText(els.teamSummaryDisabled, disabled);
    setText(els.teamSummaryOwners, owners);
  }

  function setAuthVisible(isLoggedIn) {
    els.loginPanel.classList.toggle('hidden', isLoggedIn);
    els.dashboardPanel.classList.toggle('hidden', !isLoggedIn);
    if (isLoggedIn) {
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      if (els.tenantSelectionSelect) els.tenantSelectionSelect.innerHTML = '';
      state.pendingLoginTicket = '';
      clearPendingMfa();
      setActiveSectionGroup(state.activeSectionGroup || 'overviewSection', {
        targetId: resolveDefaultTargetForGroup(state.activeSectionGroup || 'overviewSection'),
        scroll: false,
      });
    }
    if (!isLoggedIn) {
      syncWorkspaceTheme('');
      clearCcoAutoRefreshTimer();
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      if (els.tenantSelectionSelect) els.tenantSelectionSelect.innerHTML = '';
      state.pendingLoginTicket = '';
      clearPendingMfa();
    }
  }

  function setSessionMeta() {
    if (!els.sessionMeta) return;
    if (!state.token || !state.tenantId || !state.role) {
      els.sessionMeta.textContent = t('session_not_logged', 'Inte inloggad');
      return;
    }
    els.sessionMeta.textContent = `${t('session_tenant', 'Klinik')}: ${state.tenantId} • ${t(
      'session_role',
      'Roll'
    )}: ${formatRoleLabel(state.role)}`;
  }

  function renderTenantSwitchOptions() {
    if (!els.tenantSwitchSelect) return;
    const previous = els.tenantSwitchSelect.value || state.tenantId || '';
    const memberships = Array.isArray(state.availableTenants) ? state.availableTenants : [];

    els.tenantSwitchSelect.innerHTML = '';
    if (!memberships.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = t('tenant_option', 'Klinik');
      els.tenantSwitchSelect.appendChild(option);
      return;
    }

    for (const membership of memberships) {
      const tenantId = membership?.tenantId || membership?.membership?.tenantId || '';
      if (!tenantId) continue;
      const role = formatRoleLabel(membership?.role || membership?.membership?.role || 'okänd');
      const assistantName = membership?.config?.assistantName || '';
      const option = document.createElement('option');
      option.value = tenantId;
      option.textContent = assistantName
        ? `${tenantId} · ${assistantName} (${role})`
        : `${tenantId} (${role})`;
      els.tenantSwitchSelect.appendChild(option);
    }

    const hasPrevious = memberships.some((item) => item.tenantId === previous);
    els.tenantSwitchSelect.value = hasPrevious ? previous : state.tenantId || memberships[0]?.tenantId || '';
  }

  function renderPendingTenantSelection(tenants = []) {
    if (!els.tenantSelectionPanel || !els.tenantSelectionSelect) return;
    els.tenantSelectionSelect.innerHTML = '';
    for (const tenant of tenants) {
      if (!tenant?.tenantId) continue;
      const option = document.createElement('option');
      option.value = tenant.tenantId;
      option.textContent = `${tenant.tenantId} (${formatRoleLabel(tenant.role || 'okänd')})`;
      els.tenantSelectionSelect.appendChild(option);
    }
    const hasOptions = els.tenantSelectionSelect.options.length > 0;
    els.tenantSelectionPanel.classList.toggle('hidden', !hasOptions);
  }

  function clearPendingMfa() {
    state.pendingMfaTicket = '';
  }

  function isOwner() {
    return state.role === 'OWNER';
  }

  function canTemplateWrite() {
    return state.role === 'OWNER' || state.role === 'STAFF';
  }

  function persistRiskFilters() {
    localStorage.setItem(RISK_FILTERS_KEY, JSON.stringify(state.riskFilters));
  }

  function persistAuditFilters() {
    localStorage.setItem(AUDIT_FILTERS_KEY, JSON.stringify(state.auditFilters));
  }

  function persistTemplateListFilters() {
    localStorage.setItem(TEMPLATE_LIST_FILTERS_KEY, JSON.stringify(state.templateListFilters));
  }

  function persistListScrollState() {
    localStorage.setItem(LIST_SCROLL_STATE_KEY, JSON.stringify(state.listScrollState || {}));
  }

  function saveListScrollPosition(key, node) {
    if (!key || !node) return;
    const top = Number(node.scrollTop);
    if (!Number.isFinite(top) || top < 0) return;
    state.listScrollState[key] = Math.round(top);
    persistListScrollState();
  }

  function restoreListScrollPosition(key, node) {
    if (!key || !node) return;
    const raw = Number(state.listScrollState?.[key]);
    if (!Number.isFinite(raw) || raw <= 0) {
      if (raw === 0) node.scrollTop = 0;
      return;
    }
    const maxTop = Math.max(0, Number(node.scrollHeight || 0) - Number(node.clientHeight || 0));
    node.scrollTop = Math.min(Math.round(raw), maxTop);
  }

  function bindScrollableListPersistence() {
    const targets = [
      ['templateTableWrap', els.templateTableWrap],
      ['riskReviewsWrap', els.riskReviewsWrap],
      ['riskIncidentsWrap', els.riskIncidentsWrap],
      ['auditTimeline', els.auditTimeline],
    ];
    for (const [key, node] of targets) {
      if (!node) continue;
      node.addEventListener(
        'scroll',
        () => {
          saveListScrollPosition(key, node);
        },
        { passive: true }
      );
      restoreListScrollPosition(key, node);
    }
  }

  function updateLifecyclePermissions() {
    const writer = canTemplateWrite();
    const owner = isOwner();
    const hasSession = Boolean(state.token);
    const hasTemplate = Boolean(state.selectedTemplateId);
    const hasVersion = Boolean(state.selectedVersionId);

    if (els.createTemplateBtn) els.createTemplateBtn.disabled = !writer;
    if (els.generateDraftBtn) els.generateDraftBtn.disabled = !writer || !hasTemplate;
    if (els.saveDraftBtn) els.saveDraftBtn.disabled = !writer || !hasVersion;
    if (els.evaluateBtn) els.evaluateBtn.disabled = !writer || !hasVersion;
    if (els.cloneBtn) els.cloneBtn.disabled = !writer || !hasVersion;
    if (els.activateBtn) els.activateBtn.disabled = !owner || !hasVersion;
    if (els.archiveBtn) els.archiveBtn.disabled = !owner || !hasVersion;
    if (els.revisionFromSelect) els.revisionFromSelect.disabled = !writer || !hasVersion;
    if (els.revisionToSelect) els.revisionToSelect.disabled = !writer || !hasVersion;
    if (els.loadRevisionDiffBtn) {
      els.loadRevisionDiffBtn.disabled =
        !writer || !hasVersion || state.versionRevisions.length === 0;
    }
    if (els.rollbackRevisionSelect) {
      els.rollbackRevisionSelect.disabled =
        !owner || !hasVersion || state.versionRevisions.length === 0;
    }
    if (els.rollbackRevisionNoteInput) els.rollbackRevisionNoteInput.disabled = !owner || !hasVersion;
    if (els.rollbackRevisionBtn) {
      els.rollbackRevisionBtn.disabled =
        !owner || !hasVersion || state.versionRevisions.length === 0;
    }
    if (els.createStaffBtn) els.createStaffBtn.disabled = !owner;
    if (els.generateStaffPasswordBtn) els.generateStaffPasswordBtn.disabled = !owner;
    if (els.copyInviteMessageBtn) {
      const hasInviteText = Boolean(String(state.lastInviteMessage || '').trim());
      els.copyInviteMessageBtn.disabled = !owner || !hasInviteText;
    }
    if (els.refreshStaffBtn) els.refreshStaffBtn.disabled = !owner;
    if (els.staffSearchInput) els.staffSearchInput.disabled = !owner;
    if (els.staffStatusFilter) els.staffStatusFilter.disabled = !owner;
    if (els.staffEnableFilteredBtn) els.staffEnableFilteredBtn.disabled = !owner;
    if (els.staffDisableFilteredBtn) els.staffDisableFilteredBtn.disabled = !owner;
    if (els.resetSelectedStaffPasswordBtn || els.copySelectedStaffInviteBtn) {
      const selected = getStaffMemberByMembershipId(state.selectedStaffMembershipId);
      const canResetSelected = Boolean(
        owner && selected && String(selected?.membership?.role || '').toUpperCase() !== 'OWNER'
      );
      if (els.resetSelectedStaffPasswordBtn) {
        els.resetSelectedStaffPasswordBtn.disabled = !canResetSelected;
      }
      if (els.copySelectedStaffInviteBtn) {
        els.copySelectedStaffInviteBtn.disabled = !canResetSelected;
      }
    }
    if (els.currentPasswordInput) els.currentPasswordInput.disabled = !hasSession;
    if (els.newPasswordInput) els.newPasswordInput.disabled = !hasSession;
    if (els.changeOwnPasswordBtn) els.changeOwnPasswordBtn.disabled = !hasSession;
    if (els.refreshProfileBtn) els.refreshProfileBtn.disabled = !hasSession;
    if (els.runRiskPreviewBtn) els.runRiskPreviewBtn.disabled = !writer;
    if (els.runOrchestratorBtn) els.runOrchestratorBtn.disabled = !writer;
    if (els.fetchCalibrationSuggestionBtn) els.fetchCalibrationSuggestionBtn.disabled = !writer;
    if (els.applyCalibrationSuggestionBtn) els.applyCalibrationSuggestionBtn.disabled = !owner;
    if (els.runPilotReportBtn) els.runPilotReportBtn.disabled = !writer;
    if (els.refreshMailInsightsBtn) els.refreshMailInsightsBtn.disabled = !writer;
    if (els.previewMailSeedsBtn) els.previewMailSeedsBtn.disabled = !owner;
    if (els.applyMailSeedsBtn) els.applyMailSeedsBtn.disabled = !owner;
    if (els.mailSeedsCategory) els.mailSeedsCategory.disabled = !owner;
    if (els.mailSeedsLimit) els.mailSeedsLimit.disabled = !owner;
    if (els.mailSeedsNamePrefix) els.mailSeedsNamePrefix.disabled = !owner;
    if (els.refreshMonitorBtn) els.refreshMonitorBtn.disabled = !writer;
    if (els.runSchedulerSuiteBtn) els.runSchedulerSuiteBtn.disabled = !owner;
    if (els.refreshTenantsBtn) els.refreshTenantsBtn.disabled = !writer;
    if (els.onboardTenantBtn) els.onboardTenantBtn.disabled = !owner;
    if (els.refreshWritingIdentityBtn) els.refreshWritingIdentityBtn.disabled = !writer;
    if (els.writingIdentityMailboxSelect) els.writingIdentityMailboxSelect.disabled = !writer;
    if (els.writingIdentityMailboxFilter) els.writingIdentityMailboxFilter.disabled = !writer;
    if (els.writingIdentitySampleSize) els.writingIdentitySampleSize.disabled = !owner;
    if (els.autoExtractWritingIdentityBtn) els.autoExtractWritingIdentityBtn.disabled = !owner;
    if (els.writingIdentityMailboxInput) els.writingIdentityMailboxInput.disabled = !owner;
    if (els.writingIdentityGreeting) els.writingIdentityGreeting.disabled = !owner;
    if (els.writingIdentityClosing) els.writingIdentityClosing.disabled = !owner;
    if (els.writingIdentityFormality) els.writingIdentityFormality.disabled = !owner;
    if (els.writingIdentityWarmth) els.writingIdentityWarmth.disabled = !owner;
    if (els.writingIdentitySentenceLength) els.writingIdentitySentenceLength.disabled = !owner;
    if (els.writingIdentityCtaStyle) els.writingIdentityCtaStyle.disabled = !owner;
    if (els.writingIdentityEmojiUsage) els.writingIdentityEmojiUsage.disabled = !owner;
    if (els.saveWritingIdentityBtn) els.saveWritingIdentityBtn.disabled = !owner;
    if (els.loadSessionsBtn) els.loadSessionsBtn.disabled = !writer;
    if (els.loadStateManifestBtn) els.loadStateManifestBtn.disabled = !owner;
    if (els.createStateBackupBtn) els.createStateBackupBtn.disabled = !owner;
    if (els.listStateBackupsBtn) els.listStateBackupsBtn.disabled = !owner;
    if (els.previewPruneBackupsBtn) els.previewPruneBackupsBtn.disabled = !owner;
    if (els.runPruneBackupsBtn) els.runPruneBackupsBtn.disabled = !owner;
    if (els.listSchedulerReportsBtn) els.listSchedulerReportsBtn.disabled = !owner;
    if (els.previewPruneReportsBtn) els.previewPruneReportsBtn.disabled = !owner;
    if (els.runPruneReportsBtn) els.runPruneReportsBtn.disabled = !owner;
    if (els.previewStateRestoreBtn) els.previewStateRestoreBtn.disabled = !owner;
    if (els.runStateRestoreBtn) els.runStateRestoreBtn.disabled = !owner;
    if (els.restoreBackupFileInput) els.restoreBackupFileInput.disabled = !owner;
    if (els.riskBulkAction) els.riskBulkAction.disabled = !owner;
    if (els.riskBulkNote) els.riskBulkNote.disabled = !owner;
    if (els.applyRiskBulkBtn) els.applyRiskBulkBtn.disabled = !owner;
    if (els.riskSelectAllReviews) els.riskSelectAllReviews.disabled = !owner;
    if (els.riskSelectAllIncidents) els.riskSelectAllIncidents.disabled = !owner;
    if (els.riskShowPendingBtn) els.riskShowPendingBtn.disabled = !writer;
    if (els.riskShowHighCriticalBtn) els.riskShowHighCriticalBtn.disabled = !writer;
    if (els.riskClearFiltersBtn) els.riskClearFiltersBtn.disabled = !writer;
    if (els.applyRiskFilterBtn) els.applyRiskFilterBtn.disabled = !writer;
    if (els.quickCreateTemplateBtn) els.quickCreateTemplateBtn.disabled = !writer;
    if (els.quickGenerateDraftBtn) els.quickGenerateDraftBtn.disabled = !writer;
    if (els.quickReviewFlaggedBtn) els.quickReviewFlaggedBtn.disabled = !writer;
    if (els.openReviewsQueueBtn) els.openReviewsQueueBtn.disabled = !writer;
    if (els.openIncidentsQueueBtn) els.openIncidentsQueueBtn.disabled = !writer;
    if (els.switchTenantBtn) {
      const tenantCount = Array.isArray(state.availableTenants) ? state.availableTenants.length : 0;
      els.switchTenantBtn.disabled = !writer || tenantCount < 2;
    }
    if (els.tenantSwitchSelect) {
      const tenantCount = Array.isArray(state.availableTenants) ? state.availableTenants.length : 0;
      els.tenantSwitchSelect.disabled = !writer || tenantCount < 2;
    }

    const lockEditor = !writer || !hasVersion;
    if (els.draftInstructionInput) {
      els.draftInstructionInput.disabled = !writer || !hasTemplate;
    }
    [els.versionTitleInput, els.versionContentInput].forEach((el) => {
      if (!el) return;
      el.disabled = lockEditor;
    });
    if (els.templateVariablePicker) {
      els.templateVariablePicker
        .querySelectorAll('button[data-template-var]')
        .forEach((button) => {
          button.disabled = lockEditor;
        });
    }
    if (els.appendSignatureBtn) {
      els.appendSignatureBtn.disabled = lockEditor;
    }

    [els.staffEmailInput, els.staffPasswordInput].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });

    [
      els.assistantName,
      els.toneStyle,
      els.brandProfile,
      els.brandLogoUrl,
      els.brandPrimaryColor,
      els.brandAccentColor,
      els.riskModifier,
      els.riskModifierRange,
      els.templateEmailSignature,
      els.templateAllowlistOverrides,
      els.templateRequiredOverrides,
      els.saveTenantConfigBtn,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });
    if (els.tonePresetButtons) {
      els.tonePresetButtons.querySelectorAll('.tonePresetBtn').forEach((button) => {
        button.disabled = !owner;
      });
    }

    if (els.sessionsScopeSelect) {
      els.sessionsScopeSelect.disabled = !writer;
      const tenantOption = els.sessionsScopeSelect.querySelector('option[value="tenant"]');
      if (tenantOption) tenantOption.disabled = !owner;
      if (!owner && els.sessionsScopeSelect.value === 'tenant') {
        els.sessionsScopeSelect.value = 'me';
      }
    }
    if (els.sessionsIncludeRevoked) els.sessionsIncludeRevoked.disabled = !writer;

    updateTemplateBulkControls();
    renderTemplateEditorAssist();

    if (els.calibrationNoteInput) els.calibrationNoteInput.disabled = !owner;
    [
      els.onboardTenantId,
      els.onboardOwnerEmail,
      els.onboardOwnerPassword,
      els.onboardAssistantName,
      els.onboardToneStyle,
      els.onboardBrandProfile,
      els.onboardRiskModifier,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });
  }

  function buildAuthHeaders({ includeJson = true, auth = true } = {}) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
    return headers;
  }

  async function api(path, { method = 'GET', body, auth = true, headers = null } = {}) {
    const requestHeaders = {
      ...buildAuthHeaders({ includeJson: true, auth }),
      ...(headers && typeof headers === 'object' ? headers : {}),
    };
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Ogiltigt svar.' };
    }

    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function clearDashboardRealtimeRefreshTimer() {
    if (state.dashboardRealtimeRefreshTimer) {
      clearTimeout(state.dashboardRealtimeRefreshTimer);
      state.dashboardRealtimeRefreshTimer = null;
    }
  }

  function stopDashboardStream({ resetRetry = true } = {}) {
    state.dashboardStreamRunId += 1;
    if (state.dashboardStreamController) {
      try {
        state.dashboardStreamController.abort();
      } catch {
        // Ignore abort errors for stale streams.
      }
      state.dashboardStreamController = null;
    }
    if (state.dashboardStreamReconnectTimer) {
      clearTimeout(state.dashboardStreamReconnectTimer);
      state.dashboardStreamReconnectTimer = null;
    }
    clearDashboardRealtimeRefreshTimer();
    state.dashboardStreamActiveKey = '';
    if (resetRetry) {
      state.dashboardStreamRetryMs = DASHBOARD_STREAM_RETRY_MIN_MS;
    }
  }

  function shouldRefreshFromAuditAction(action) {
    const normalized = String(action || '')
      .trim()
      .toLowerCase();
    if (!normalized) return false;
    if (normalized === 'dashboard.owner.read') return false;
    if (normalized === 'audit.events.read') return false;
    return true;
  }

  function scheduleDashboardRealtimeRefresh(action) {
    if (!shouldRefreshFromAuditAction(action)) return;
    if (!state.token || !state.tenantId) return;
    if (state.dashboardRealtimeRefreshTimer) return;
    state.dashboardRealtimeRefreshTimer = setTimeout(async () => {
      state.dashboardRealtimeRefreshTimer = null;
      if (!state.token || !state.tenantId) return;
      try {
        await Promise.all([loadDashboard(), loadAuditEvents()]);
      } catch {
        // Ignore transient refresh errors from live stream.
      }
    }, DASHBOARD_STREAM_REFRESH_DEBOUNCE_MS);
  }

  function isCcoWorkspaceActive() {
    return String(state.activeSectionGroup || '').trim() === 'ccoWorkspaceSection';
  }

  function shouldRunCcoAutoRefresh() {
    if (!state.token) return false;
    if (!isCcoWorkspaceActive()) return false;
    if (document.visibilityState === 'hidden') return false;
    return true;
  }

  function clearCcoAutoRefreshTimer() {
    if (state.ccoAutoRefreshTimer) {
      clearTimeout(state.ccoAutoRefreshTimer);
      state.ccoAutoRefreshTimer = null;
    }
  }

  async function runCcoAutoRefreshTick() {
    if (!shouldRunCcoAutoRefresh()) {
      clearCcoAutoRefreshTimer();
      return;
    }
    if (state.ccoAutoRefreshInFlight || state.ccoInboxBriefRunInFlight) {
      scheduleCcoAutoRefresh({ delayMs: CCO_AUTO_REFRESH_RETRY_MS });
      return;
    }
    state.ccoAutoRefreshInFlight = true;
    try {
      if (canTemplateWrite()) {
        await runCcoInboxBrief({ quiet: true });
      } else {
        await loadCcoInboxBrief({ quiet: true });
      }
    } finally {
      state.ccoAutoRefreshInFlight = false;
      scheduleCcoAutoRefresh({ delayMs: CCO_AUTO_REFRESH_INTERVAL_MS });
    }
  }

  function scheduleCcoAutoRefresh({ delayMs = CCO_AUTO_REFRESH_INTERVAL_MS, immediate = false } = {}) {
    clearCcoAutoRefreshTimer();
    if (!shouldRunCcoAutoRefresh()) return;
    const rawDelay = Number(delayMs);
    const safeDelay = immediate
      ? CCO_AUTO_REFRESH_BOOT_MS
      : Number.isFinite(rawDelay)
      ? Math.max(3000, rawDelay)
      : CCO_AUTO_REFRESH_INTERVAL_MS;
    state.ccoAutoRefreshTimer = setTimeout(() => {
      state.ccoAutoRefreshTimer = null;
      runCcoAutoRefreshTick().catch(() => {
        scheduleCcoAutoRefresh({ delayMs: CCO_AUTO_REFRESH_RETRY_MS });
      });
    }, safeDelay);
  }

  function syncCcoAutoRefresh({ immediate = false } = {}) {
    if (!shouldRunCcoAutoRefresh()) {
      clearCcoAutoRefreshTimer();
      return;
    }
    scheduleCcoAutoRefresh({
      immediate: immediate === true,
      delayMs: immediate === true ? CCO_AUTO_REFRESH_BOOT_MS : CCO_AUTO_REFRESH_INTERVAL_MS,
    });
  }

  function currentDashboardStreamKey() {
    if (!state.token || !state.tenantId) return '';
    return `${state.tenantId}:${state.token}`;
  }

  function parseSseEnvelope(raw) {
    if (typeof raw !== 'string') return null;
    const lines = raw.split('\n');
    let event = 'message';
    let id = '';
    const dataLines = [];

    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        event = line.slice(6).trim() || 'message';
        continue;
      }
      if (line.startsWith('id:')) {
        id = line.slice(3).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    const rawData = dataLines.join('\n');
    let data = null;
    if (rawData) {
      try {
        data = JSON.parse(rawData);
      } catch {
        data = { raw: rawData };
      }
    }
    return { event, id, data };
  }

  function handleDashboardStreamEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') return;
    const payload = envelope.data && typeof envelope.data === 'object' ? envelope.data : null;
    if (!payload) return;
    if (payload.tenantId && payload.tenantId !== state.tenantId) return;
    if (envelope.event === 'audit') {
      scheduleDashboardRealtimeRefresh(payload.action);
      return;
    }
    if (envelope.event === 'status') {
      scheduleDashboardRealtimeRefresh('dashboard.status.stream');
    }
  }

  function scheduleDashboardStreamReconnect(streamKey) {
    if (!streamKey || streamKey !== currentDashboardStreamKey()) return;
    if (state.dashboardStreamReconnectTimer) return;
    const delayMs = Math.max(
      DASHBOARD_STREAM_RETRY_MIN_MS,
      Math.min(DASHBOARD_STREAM_RETRY_MAX_MS, Number(state.dashboardStreamRetryMs) || DASHBOARD_STREAM_RETRY_MIN_MS)
    );
    state.dashboardStreamReconnectTimer = setTimeout(() => {
      state.dashboardStreamReconnectTimer = null;
      ensureDashboardStreamConnected();
    }, delayMs);
    state.dashboardStreamRetryMs = Math.min(
      DASHBOARD_STREAM_RETRY_MAX_MS,
      Math.round(delayMs * 1.8)
    );
  }

  async function openDashboardStream(runId, streamKey) {
    const controller = new AbortController();
    state.dashboardStreamController = controller;

    try {
      const response = await fetch(`${API_BASE}/dashboard/owner/stream`, {
        method: 'GET',
        headers: {
          ...buildAuthHeaders({ includeJson: false, auth: true }),
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          stopDashboardStream();
          return;
        }
        throw new Error(`dashboard stream HTTP ${response.status}`);
      }
      if (!response.body || typeof response.body.getReader !== 'function') {
        throw new Error('Dashboard stream saknar läsbar body.');
      }

      state.dashboardStreamRetryMs = DASHBOARD_STREAM_RETRY_MIN_MS;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (runId === state.dashboardStreamRunId) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!chunk.value) continue;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

        let splitIndex = buffer.indexOf('\n\n');
        while (splitIndex !== -1) {
          const rawEnvelope = buffer.slice(0, splitIndex).trim();
          buffer = buffer.slice(splitIndex + 2);
          if (rawEnvelope) {
            const envelope = parseSseEnvelope(rawEnvelope);
            handleDashboardStreamEnvelope(envelope);
          }
          splitIndex = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('[admin] dashboard stream disconnected', error?.message || error);
      }
    } finally {
      if (state.dashboardStreamController === controller) {
        state.dashboardStreamController = null;
      }
    }

    if (runId !== state.dashboardStreamRunId) return;
    scheduleDashboardStreamReconnect(streamKey);
  }

  function ensureDashboardStreamConnected() {
    const streamKey = currentDashboardStreamKey();
    if (!streamKey) {
      stopDashboardStream();
      return;
    }
    if (state.dashboardStreamActiveKey === streamKey && state.dashboardStreamController) {
      return;
    }

    stopDashboardStream({ resetRetry: false });
    state.dashboardStreamActiveKey = streamKey;
    state.dashboardStreamRunId += 1;
    const runId = state.dashboardStreamRunId;

    openDashboardStream(runId, streamKey).catch(() => {
      scheduleDashboardStreamReconnect(streamKey);
    });
  }

  function dotClassForRiskLevel(level) {
    const n = Number(level) || 1;
    if (n >= 4) return 'bad';
    if (n === 3) return 'warn';
    return 'ok';
  }

  function renderBadges(container, items) {
    container.innerHTML = '';
    for (const item of items) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.marginRight = '8px';
      badge.style.marginBottom = '8px';
      badge.innerHTML = `<span class="dot ${item.dot || 'ok'}"></span>${item.label}: <strong>${item.value}</strong>`;
      container.appendChild(badge);
    }
  }

  function setKpiMeta(el, text, tone = '') {
    if (!el) return;
    el.className = `kpi-meta${tone ? ` ${tone}` : ''}`;
    el.textContent = text || '';
  }

  function renderOwnerCoverageKpi(riskSummary) {
    const total = Number(riskSummary?.totals?.evaluations || 0);
    const pending = Number(riskSummary?.byOwnerDecision?.pending || 0);
    const handled = Math.max(0, total - pending);
    const percent = total > 0 ? Math.round((handled / total) * 100) : 0;

    setText(els.ownerCoverageValue, `${percent}%`);

    if (!total) {
      setKpiMeta(els.ownerCoverageMeta, 'Ingen riskhistorik ännu.');
      return;
    }

    const tone = percent >= 90 ? 'ok' : percent >= 60 ? 'warn' : 'bad';
    setKpiMeta(
      els.ownerCoverageMeta,
      isEnglishLanguage()
        ? `${handled}/${total} owner handled • pending: ${pending}`
        : `${handled}/${total} ägarhanterade • väntar: ${pending}`,
      tone
    );
  }

  function renderSlaIndicatorKpi(highCriticalOpen) {
    const incidents = Array.isArray(highCriticalOpen) ? highCriticalOpen : [];
    setText(els.slaIndicatorValue, incidents.length);

    if (!incidents.length) {
      setKpiMeta(els.slaIndicatorMeta, 'Inga öppna incidenter.', 'ok');
      return;
    }

    const buckets = {
      breached: 0,
      critical: 0,
      warn: 0,
      ok: 0,
    };

    for (const evaluation of incidents) {
      const sla = computeIncidentSla(evaluation);
      if (sla.className === 'sla-breached') buckets.breached += 1;
      else if (sla.className === 'sla-critical') buckets.critical += 1;
      else if (sla.className === 'sla-warn') buckets.warn += 1;
      else buckets.ok += 1;
    }

    const text = isEnglishLanguage()
      ? `Breach:${buckets.breached} • Critical:${buckets.critical} • Warning:${buckets.warn}`
      : `Brist:${buckets.breached} • Kritisk:${buckets.critical} • Varning:${buckets.warn}`;
    const tone = buckets.breached > 0 ? 'bad' : buckets.critical > 0 || buckets.warn > 0 ? 'warn' : 'ok';
    setKpiMeta(els.slaIndicatorMeta, text, tone);
  }

  function formatReadinessBandLabel(bandRaw) {
    const band = String(bandRaw || '')
      .trim()
      .toLowerCase();
    if (!band) return '-';
    const map = {
      no_go: isEnglishLanguage() ? 'No-go' : 'No-go',
      limited_beta: isEnglishLanguage() ? 'Limited beta' : 'Begränsad beta',
      controlled_go: isEnglishLanguage() ? 'Controlled go' : 'Kontrollerad go',
    };
    if (Object.prototype.hasOwnProperty.call(map, band)) return map[band];
    return bandRaw || '-';
  }

  function renderReadinessKpi(readiness = null) {
    if (!els.readinessBandValue || !els.readinessBandMeta) return;
    if (!readiness || typeof readiness !== 'object') {
      setText(els.readinessBandValue, '-');
      setKpiMeta(
        els.readinessBandMeta,
        isEnglishLanguage() ? 'Waiting for monitor data.' : 'Väntar på monitor-data.'
      );
      return;
    }

    const score = Number(readiness?.score || 0);
    const scoreRounded = Number.isFinite(score) ? Number(score.toFixed(2)) : 0;
    const triggeredNoGo = Number(readiness?.goNoGo?.triggeredNoGoCount || 0);
    const remediationSummary = readiness?.remediation?.summary || {};
    const remediationTotal = Number(remediationSummary?.total || 0);
    const remediationP0 = Number(remediationSummary?.byPriority?.P0 || 0);
    const potentialGain = Number(remediationSummary?.potentialScoreGain || 0);
    const goAllowed = readiness?.goNoGo?.allowed === true;

    let tone = 'ok';
    if (triggeredNoGo > 0 || remediationP0 > 0) tone = 'bad';
    else if (!goAllowed || remediationTotal > 0) tone = 'warn';

    setText(els.readinessBandValue, formatReadinessBandLabel(readiness?.band));
    const metaText = isEnglishLanguage()
      ? `Score ${scoreRounded} • no-go ${triggeredNoGo} • P0 ${remediationP0} • actions ${remediationTotal} • gain ${potentialGain}`
      : `Poäng ${scoreRounded} • no-go ${triggeredNoGo} • P0 ${remediationP0} • åtgärder ${remediationTotal} • möjlig ökning ${potentialGain}`;
    setKpiMeta(
      els.readinessBandMeta,
      metaText,
      tone
    );
  }

  function renderPilotReportKpi(monitorStatus = null) {
    if (!els.pilotReportValue || !els.pilotReportMeta) return;
    const pilotReport = monitorStatus?.gates?.pilotReport || null;
    if (!pilotReport || typeof pilotReport !== 'object') {
      setText(els.pilotReportValue, '-');
      setKpiMeta(
        els.pilotReportMeta,
        isEnglishLanguage() ? 'Waiting for monitor data.' : 'Väntar på monitor-data.'
      );
      return;
    }

    const ageHoursRaw = Number(pilotReport?.ageHours);
    const ageHours = Number.isFinite(ageHoursRaw) ? Number(ageHoursRaw.toFixed(1)) : null;
    const maxAgeHours = Number(pilotReport?.maxAgeHours || 0);
    const healthy = pilotReport?.healthy === true;
    const noGo = pilotReport?.noGo === true;
    const latestReportFile = String(pilotReport?.latestReport?.fileName || '-');

    let tone = 'ok';
    if (noGo || !healthy) tone = 'bad';
    else if (ageHours !== null && ageHours > 24) tone = 'warn';

    setText(els.pilotReportValue, ageHours === null ? '-' : `${ageHours}h`);
    setKpiMeta(
      els.pilotReportMeta,
      isEnglishLanguage()
        ? `healthy=${healthy ? 'yes' : 'no'} • no-go=${noGo ? 'yes' : 'no'} • maxAge=${maxAgeHours}h • latest=${latestReportFile}`
        : `healthy=${healthy ? 'ja' : 'nej'} • no-go=${noGo ? 'ja' : 'nej'} • maxAge=${maxAgeHours}h • senaste=${latestReportFile}`,
      tone
    );
  }

  function toActionLabel(action) {
    const value = String(action || '').trim();
    if (!value) return '-';
    return value.replace(/\./g, ' · ');
  }

  function parseIsoDateMs(value) {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : null;
  }

  function formatDateTime(value) {
    const ms = parseIsoDateMs(value);
    if (ms === null) return '-';
    return new Date(ms).toLocaleString('sv-SE', { hour12: false });
  }

  function formatRelativeAge(value) {
    const ms = parseIsoDateMs(value);
    if (ms === null) return '-';
    const deltaMs = Date.now() - ms;
    if (!Number.isFinite(deltaMs)) return '-';
    if (deltaMs < 30 * 1000) return 'Nyss';
    if (deltaMs <= 0) return 'Nu';
    return `${formatDurationCompact(deltaMs)} sedan`;
  }

  function renderLatestActivity(events = []) {
    if (!els.latestActivityList) return;
    if (!Array.isArray(events) || events.length === 0) {
      els.latestActivityList.innerHTML = '<li class="muted mini">Ingen aktivitet ännu.</li>';
      return;
    }
    const sorted = [...events]
      .sort((a, b) => (parseIsoDateMs(b?.ts) || 0) - (parseIsoDateMs(a?.ts) || 0))
      .slice(0, 5);

    els.latestActivityList.innerHTML = sorted
      .map((event) => {
        const action = toActionLabel(event?.action);
        const ts = formatDateTime(event?.ts);
        const actor = event?.actorUserId || '-';
        const target = `${event?.targetType || '-'}:${event?.targetId || '-'}`;
        return `
          <li>
            <div class="mini"><strong>${escapeHtml(action)}</strong></div>
            <div class="mini muted">${escapeHtml(ts)} • ${escapeHtml(actor)}</div>
            <div class="mini code">${escapeHtml(target)}</div>
          </li>
        `;
      })
      .join('');
  }

  function renderRiskTrendBars(riskSummary = {}) {
    if (!els.riskTrendBars || !els.riskTrendMeta) return;
    const byLevel = riskSummary?.byLevel && typeof riskSummary.byLevel === 'object' ? riskSummary.byLevel : {};
    const levels = [1, 2, 3, 4, 5].map((level) => {
      const count = Number(byLevel[level] ?? byLevel[String(level)] ?? 0);
      return { level, count: Number.isFinite(count) ? count : 0 };
    });
    const total = levels.reduce((sum, item) => sum + item.count, 0);
    if (!total) {
      els.riskTrendBars.innerHTML = '<div class="mini muted">Ingen riskhistorik ännu.</div>';
      els.riskTrendMeta.textContent = 'Väntar på data.';
      return;
    }
    els.riskTrendBars.innerHTML = levels
      .map((item) => {
        const pct = Math.max(0, Math.min(100, Math.round((item.count / total) * 100)));
        return `
          <div class="risk-trend-row">
            <span>L${item.level}</span>
            <div class="risk-trend-track">
              <div class="risk-trend-fill level-${item.level}" style="width:${pct}%"></div>
            </div>
            <span>${item.count}</span>
          </div>
        `;
      })
      .join('');
    els.riskTrendMeta.textContent = `Distribution av ${total} utvärderingar i valt fönster.`;
  }

  function renderOverviewNotifications({
    templates = {},
    riskSummary = {},
    recentAuditEvents = [],
  } = {}) {
    if (!els.overviewNotificationsList) return;
    const notifications = [];
    const totalTemplates = Number(templates?.total || 0);
    const activeTemplates = Number(templates?.withActiveVersion || 0);
    const highCriticalOpen = Number(riskSummary?.totals?.highCriticalOpen || 0);
    const l3Count = Number(riskSummary?.byLevel?.[3] ?? riskSummary?.byLevel?.['3'] ?? 0);
    const pendingOwner = Number(riskSummary?.byOwnerDecision?.pending || 0);

    if (highCriticalOpen > 0) {
      notifications.push({
        tone: 'bad',
        title: isEnglishLanguage()
          ? `${highCriticalOpen} high/critical incidents open`
          : `${highCriticalOpen} höga/kritiska incidenter öppna`,
        detail: isEnglishLanguage()
          ? 'Prioritize incident handling and owner actions.'
          : 'Prioritera incidenthantering och ägaråtgärder.',
      });
    }
    if (l3Count > 0) {
      notifications.push({
        tone: 'warn',
        title: isEnglishLanguage() ? `${l3Count} reviews pending` : `${l3Count} granskningar väntar`,
        detail: isEnglishLanguage()
          ? 'L3 evaluations need manual review.'
          : 'L3-utvärderingar behöver manuell granskning.',
      });
    }
    if (pendingOwner > 0) {
      notifications.push({
        tone: 'warn',
        title: isEnglishLanguage()
          ? `${pendingOwner} owner decisions pending`
          : `${pendingOwner} ägarbeslut väntar`,
        detail: isEnglishLanguage()
          ? 'Handle pending rows to improve coverage.'
          : 'Hantera väntande rader för bättre täckning.',
      });
    }
    if (totalTemplates > 0 && activeTemplates < totalTemplates) {
      notifications.push({
        tone: 'warn',
        title: isEnglishLanguage()
          ? `${totalTemplates - activeTemplates} templates without active version`
          : `${totalTemplates - activeTemplates} mallar utan aktiv version`,
        detail: isEnglishLanguage()
          ? `Active: ${activeTemplates}/${totalTemplates}.`
          : `Aktiva: ${activeTemplates}/${totalTemplates}.`,
      });
    } else if (totalTemplates > 0) {
      notifications.push({
        tone: 'ok',
        title: isEnglishLanguage() ? 'All templates are active' : 'Alla mallar är aktiva',
        detail: isEnglishLanguage()
          ? `${activeTemplates}/${totalTemplates} templates have active version.`
          : `${activeTemplates}/${totalTemplates} mallar har aktiv version.`,
      });
    }

    const latestEvent = Array.isArray(recentAuditEvents) ? recentAuditEvents[0] : null;
    if (latestEvent) {
      notifications.push({
        tone: 'ok',
        title: `${isEnglishLanguage() ? 'Latest audit' : 'Senaste revision'}: ${toActionLabel(
          latestEvent.action
        )}`,
        detail: `${formatDateTime(latestEvent.ts)} • ${latestEvent.actorUserId || '-'}`,
      });
    }

    if (!notifications.length) {
      els.overviewNotificationsList.innerHTML =
        '<li class="notification-item"><div class="notification-detail">Inga notifieringar ännu.</div></li>';
      return;
    }

    els.overviewNotificationsList.innerHTML = notifications
      .slice(0, 8)
      .map(
        (item) => `
          <li class="notification-item ${escapeHtml(item.tone || '')}">
            <div class="notification-title">${escapeHtml(item.title || '-')}</div>
            <div class="notification-detail">${escapeHtml(item.detail || '-')}</div>
          </li>
        `
      )
      .join('');
  }

  function normalizeOwnerDecision(value) {
    return String(value || 'pending').trim().toLowerCase();
  }

  function ownerActionFromDecision(value) {
    const normalized = normalizeOwnerDecision(value);
    if (normalized === 'approved_exception') return 'approve_exception';
    if (normalized === 'false_positive') return 'mark_false_positive';
    if (normalized === 'escalated') return 'escalate';
    return 'request_revision';
  }

  function renderRiskQueueSummary(evaluations = []) {
    if (!els.riskQueueSummary) return;
    const stats = {
      total: evaluations.length,
      pending: 0,
      revisionRequested: 0,
      escalated: 0,
      highCriticalOpen: 0,
    };

    for (const evaluation of evaluations) {
      const ownerDecision = normalizeOwnerDecision(evaluation.ownerDecision);
      if (ownerDecision === 'pending') stats.pending += 1;
      if (ownerDecision === 'revision_requested') stats.revisionRequested += 1;
      if (ownerDecision === 'escalated') stats.escalated += 1;
      if (Number(evaluation.riskLevel || 0) >= 4 && ['pending', 'revision_requested'].includes(ownerDecision)) {
        stats.highCriticalOpen += 1;
      }
    }

    const rows = [
      `${isEnglishLanguage() ? 'Total' : 'Totalt'}: ${stats.total}`,
      `${isEnglishLanguage() ? 'Pending' : 'Väntar'}: ${stats.pending}`,
      `${isEnglishLanguage() ? 'Revision requested' : 'Revidering begärd'}: ${
        stats.revisionRequested
      }`,
      `${isEnglishLanguage() ? 'Escalated' : 'Eskalerade'}: ${stats.escalated}`,
      `${isEnglishLanguage() ? 'High/Critical open' : 'Hög/Kritisk öppna'}: ${stats.highCriticalOpen}`,
      `${isEnglishLanguage() ? 'Selected rows' : 'Valda rader'}: ${state.selectedRiskIds.length}`,
    ];
    els.riskQueueSummary.innerHTML = rows.map((row) => `<span class="chip">${escapeHtml(row)}</span>`).join('');
  }

  function renderRiskDetail(evaluation) {
    if (!els.riskDetailMeta || !els.riskDetailBlock) return;

    const setQuickActionsState = (currentEvaluation) => {
      if (!els.riskDetailQuickActions) return;
      const selectedAction = ownerActionFromDecision(currentEvaluation?.ownerDecision || 'pending');
      const canEdit = Boolean(currentEvaluation?.id) && isOwner();
      els.riskDetailQuickActions
        .querySelectorAll('button[data-owner-action]')
        .forEach((btn) => {
          const action = String(btn.getAttribute('data-owner-action') || '').trim();
          btn.textContent = formatOwnerActionLabel(action);
          btn.disabled = !canEdit;
          btn.classList.toggle('active', canEdit && action === selectedAction);
          if (currentEvaluation?.id) {
            btn.setAttribute('data-eid', currentEvaluation.id);
          } else {
            btn.removeAttribute('data-eid');
          }
        });
      if (els.riskDetailNoteInput) {
        els.riskDetailNoteInput.disabled = !canEdit;
      }
    };

    const formatDateTime = (value) => {
      const ms = parseIsoToMs(value);
      if (ms === null) return '-';
      return new Date(ms).toLocaleString('sv-SE', { hour12: false });
    };

    const renderTimeline = (currentEvaluation) => {
      if (!els.riskDetailTimeline) return;
      const events = [];
      if (currentEvaluation?.evaluatedAt) {
        events.push({
          ts: currentEvaluation.evaluatedAt,
          title: `${isEnglishLanguage() ? 'Risk evaluated' : 'Risk utvärderad'} (L${
            currentEvaluation.riskLevel || '-'
          })`,
          detail: `${isEnglishLanguage() ? 'Decision' : 'Beslut'}: ${formatDecisionLabel(
            currentEvaluation.decision || '-'
          )} • ${isEnglishLanguage() ? 'Owner' : 'Ägare'}: ${
            formatOwnerDecisionLabel(currentEvaluation.ownerDecision || 'pending')
          }`,
        });
      }
      const ownerActions = Array.isArray(currentEvaluation?.ownerActions)
        ? currentEvaluation.ownerActions
        : [];
      for (const action of ownerActions) {
        events.push({
          ts: action?.createdAt || currentEvaluation?.updatedAt || currentEvaluation?.evaluatedAt,
          title: `${isEnglishLanguage() ? 'Owner action' : 'Ägaråtgärd'}: ${formatOwnerActionLabel(
            action?.action || '-'
          )}`,
          detail: `${action?.note ? `Notering: ${action.note}` : 'Ingen notering'}${
            action?.actorUserId
              ? ` • ${isEnglishLanguage() ? 'actor' : 'aktör'}: ${action.actorUserId}`
              : ''
          }`,
        });
      }
      if (!events.length && currentEvaluation?.updatedAt) {
        events.push({
          ts: currentEvaluation.updatedAt,
          title: isEnglishLanguage() ? 'Latest update' : 'Senaste uppdatering',
          detail: isEnglishLanguage()
            ? 'No additional history available.'
            : 'Ingen extra historik tillgänglig.',
        });
      }
      events.sort((a, b) => {
        const bMs = parseIsoToMs(b.ts) || 0;
        const aMs = parseIsoToMs(a.ts) || 0;
        return bMs - aMs;
      });

      if (!events.length) {
        els.riskDetailTimeline.innerHTML = `<li class="muted mini">${
          isEnglishLanguage() ? 'No timeline yet.' : 'Ingen tidslinje ännu.'
        }</li>`;
        return;
      }
      els.riskDetailTimeline.innerHTML = events
        .map(
          (event) => `
            <li>
              <div class="risk-timeline-title">${escapeHtml(event.title || '-')}</div>
              <div class="mini muted">${escapeHtml(formatDateTime(event.ts))}</div>
              <div class="mini">${escapeHtml(event.detail || '-')}</div>
            </li>
          `
        )
        .join('');
    };

    if (!evaluation) {
      els.riskDetailMeta.textContent = 'Ingen utvärdering vald.';
      if (els.riskDetailSummary) els.riskDetailSummary.textContent = 'Ingen detaljerad riskdata ännu.';
      if (els.riskDetailSla) {
        els.riskDetailSla.className = 'mini muted';
        els.riskDetailSla.textContent = 'Ingen incident-SLA.';
      }
      if (els.riskDetailTimeline) {
        els.riskDetailTimeline.innerHTML = `<li class="muted mini">${
          isEnglishLanguage() ? 'No timeline yet.' : 'Ingen tidslinje ännu.'
        }</li>`;
      }
      els.riskDetailBlock.textContent = 'Ingen detaljerad riskdata ännu.';
      setQuickActionsState(null);
      return;
    }

    const ownerActions = Array.isArray(evaluation.ownerActions) ? evaluation.ownerActions : [];
    const reasonCodes = Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : [];
    const policyAdjustments = Array.isArray(evaluation.policyAdjustments)
      ? evaluation.policyAdjustments
      : [];
    const sla = computeIncidentSla(evaluation);
    const policySummary = policyAdjustments.length
      ? policyAdjustments
          .map((item) => `${item.reasonCode || 'policy_rule'}→L${item.floorApplied || '?'}`)
          .join(', ')
      : '-';

    els.riskDetailMeta.textContent = `${evaluation.id} · template=${evaluation.templateId} · version=${evaluation.templateVersionId} · updated=${evaluation.updatedAt || evaluation.evaluatedAt || '-'}`;
    if (els.riskDetailSummary) {
      els.riskDetailSummary.innerHTML = `
        <div class="seg">
          <span class="chip">Risk L${escapeHtml(evaluation.riskLevel || '-')}</span>
          <span class="chip">${escapeHtml(formatDecisionLabel(evaluation.decision || '-'))}</span>
          <span class="chip">${isEnglishLanguage() ? 'Owner' : 'Ägare'}: ${escapeHtml(
            formatOwnerDecisionLabel(evaluation.ownerDecision || 'pending')
          )}</span>
          <span class="chip">${isEnglishLanguage() ? 'Actions' : 'Åtgärder'}: ${escapeHtml(
            ownerActions.length
          )}</span>
        </div>
        <div class="mini" style="margin-top:8px"><strong>${
          isEnglishLanguage() ? 'Reason codes' : 'Orsakskoder'
        }:</strong> ${
          reasonCodes.length
            ? escapeHtml(reasonCodes.join(', '))
            : '<span class="muted">-</span>'
        }</div>
        <div class="mini" style="margin-top:4px"><strong>${
          isEnglishLanguage() ? 'Policy' : 'Policy'
        }:</strong> ${escapeHtml(policySummary)}</div>
      `;
    }
    if (els.riskDetailSla) {
      const tone =
        sla.className === 'sla-breached'
          ? 'bad'
          : sla.className === 'sla-critical' || sla.className === 'sla-warn'
          ? 'warn'
          : 'ok';
      els.riskDetailSla.className = `kpi-meta ${tone}`;
      els.riskDetailSla.textContent =
        Number(evaluation.riskLevel || 0) >= 4
          ? `SLA: ${sla.label} • ${sla.detail}`
          : 'SLA: N/A (endast incidents L4-L5 har SLA).';
    }
    renderTimeline(evaluation);
    setQuickActionsState(evaluation);
    els.riskDetailBlock.textContent = JSON.stringify(
      {
        riskLevel: evaluation.riskLevel,
        decision: formatDecisionLabel(evaluation.decision),
        ownerDecision: formatOwnerDecisionLabel(evaluation.ownerDecision || 'pending'),
        scores: {
          riskScore: evaluation.riskScore,
          semanticScore: evaluation.semanticScore,
          ruleScore: evaluation.ruleScore,
        },
        reasonCodes,
        policyAdjustments,
        ownerActions,
      },
      null,
      2
    );
  }

  async function loadRiskEvaluationDetail(evaluationId) {
    const normalizedId = String(evaluationId || '').trim();
    if (!normalizedId) {
      state.selectedRiskEvaluationId = '';
      renderRiskDetail(null);
      return;
    }

    state.selectedRiskEvaluationId = normalizedId;
    const cached = state.riskEvaluations.find((item) => item.id === normalizedId) || null;
    if (cached) renderRiskDetail(cached);

    try {
      const response = await api(`/risk/evaluations/${encodeURIComponent(normalizedId)}`);
      const detailedEvaluation = response?.evaluation || null;
      if (detailedEvaluation?.id) {
        state.riskEvaluations = state.riskEvaluations.map((item) =>
          item.id === detailedEvaluation.id ? { ...item, ...detailedEvaluation } : item
        );
      }
      renderRiskDetail(detailedEvaluation || cached || null);
    } catch (error) {
      renderRiskDetail(cached || null);
      setStatus(
        els.riskActionStatus,
        error.message || 'Kunde inte läsa detaljer för riskutvärdering.',
        true
      );
    }
  }

  async function applyOwnerAction(evaluationId, action, note) {
    const normalizedEvaluationId = String(evaluationId || '').trim();
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedEvaluationId || !normalizedAction) return;
    await api(`/risk/evaluations/${encodeURIComponent(normalizedEvaluationId)}/owner-action`, {
      method: 'POST',
      body: { action: normalizedAction, note: String(note || '').trim() },
    });
  }

  function parseIsoToMs(value) {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : null;
  }

  function formatDurationCompact(ms) {
    const minutesTotal = Math.max(0, Math.round(ms / 60000));
    if (minutesTotal < 60) return `${minutesTotal}m`;
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  function computeIncidentSla(evaluation) {
    const level = Number(evaluation?.riskLevel || 0);
    if (level < 4) {
      return { label: '-', className: 'sla-ok', detail: 'Ingen incident-SLA för denna risknivå.' };
    }

    const providedSla =
      evaluation?.incidentSla && typeof evaluation.incidentSla === 'object'
        ? evaluation.incidentSla
        : evaluation?.sla && typeof evaluation.sla === 'object'
        ? evaluation.sla
        : null;

    if (providedSla) {
      const slaState = String(providedSla.state || '')
        .trim()
        .toLowerCase();
      const remainingMs = Number(providedSla.remainingMs || 0);
      const targetMinutes = Number(providedSla.targetMinutes || 0);
      const targetMs = targetMinutes > 0 ? targetMinutes * 60 * 1000 : level >= 5 ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
      const deadlineLabel = formatDateTime(providedSla.deadline);
      const targetLabel = formatDurationCompact(targetMs);

      if (slaState === 'resolved') {
        return {
          label: isEnglishLanguage() ? 'Closed' : 'Stängd',
          className: 'sla-ok',
          detail: `${isEnglishLanguage() ? 'Resolved' : 'Löst'} • ${
            isEnglishLanguage() ? 'Target' : 'Mål'
          }: ${targetLabel}.`,
        };
      }
      if (slaState === 'breached') {
        return {
          label: `${isEnglishLanguage() ? 'Breached' : 'Överskriden'} ${formatDurationCompact(
            Math.abs(remainingMs)
          )}`,
          className: 'sla-breached',
          detail: `${isEnglishLanguage() ? 'Deadline' : 'Deadline'}: ${deadlineLabel} • ${
            isEnglishLanguage() ? 'Target' : 'Mål'
          }: ${targetLabel}.`,
        };
      }
      if (slaState === 'critical') {
        return {
          label: `${formatDurationCompact(Math.max(0, remainingMs))} kvar`,
          className: 'sla-critical',
          detail: `${isEnglishLanguage() ? 'Critical SLA window' : 'Kritiskt SLA-fönster'} • ${
            isEnglishLanguage() ? 'Deadline' : 'Deadline'
          }: ${deadlineLabel}.`,
        };
      }
      if (slaState === 'warn') {
        return {
          label: `${formatDurationCompact(Math.max(0, remainingMs))} kvar`,
          className: 'sla-warn',
          detail: `${isEnglishLanguage() ? 'Warning SLA window' : 'Varningsfönster för SLA'} • ${
            isEnglishLanguage() ? 'Deadline' : 'Deadline'
          }: ${deadlineLabel}.`,
        };
      }
      if (slaState === 'ok') {
        return {
          label: `${formatDurationCompact(Math.max(0, remainingMs))} kvar`,
          className: 'sla-ok',
          detail: `${isEnglishLanguage() ? 'Within SLA' : 'Inom SLA'} • ${
            isEnglishLanguage() ? 'Deadline' : 'Deadline'
          }: ${deadlineLabel}.`,
        };
      }
    }

    const targetMs = level >= 5 ? 30 * 60 * 1000 : 4 * 60 * 60 * 1000;
    const ownerDecision = normalizeOwnerDecision(evaluation?.ownerDecision);
    const openedAtMs =
      parseIsoToMs(evaluation?.evaluatedAt) ??
      parseIsoToMs(evaluation?.updatedAt) ??
      parseIsoToMs(evaluation?.createdAt);

    if (!openedAtMs) {
      return {
        label: 'N/A',
        className: 'sla-warn',
        detail: `Mål: ${formatDurationCompact(targetMs)} (saknar tidsstämpel).`,
      };
    }

    const isOpen = ownerDecision === 'pending' || ownerDecision === 'revision_requested';
    if (!isOpen) {
      return {
        label: isEnglishLanguage() ? 'Closed' : 'Stängd',
        className: 'sla-ok',
        detail: `${
          isEnglishLanguage() ? 'Closed with ownerDecision' : 'Stängd med ägarbeslut'
        }=${formatOwnerDecisionLabel(ownerDecision)}. ${
          isEnglishLanguage() ? 'Target' : 'Mål'
        }: ${formatDurationCompact(targetMs)}.`,
      };
    }

    const elapsedMs = Math.max(0, Date.now() - openedAtMs);
    const remainingMs = targetMs - elapsedMs;
    if (remainingMs <= 0) {
      return {
        label: `${
          isEnglishLanguage() ? 'Breached' : 'Överskriden'
        } ${formatDurationCompact(Math.abs(remainingMs))}`,
        className: 'sla-breached',
        detail: `${isEnglishLanguage() ? 'SLA breached' : 'SLA överskriden'}. ${
          isEnglishLanguage() ? 'Target' : 'Mål'
        }: ${formatDurationCompact(targetMs)}.`,
      };
    }

    const ratioLeft = remainingMs / targetMs;
    if (ratioLeft <= 0.25) {
      return {
        label: `${formatDurationCompact(remainingMs)} kvar`,
        className: 'sla-critical',
        detail: `Akut: <25% av SLA kvar. Mål: ${formatDurationCompact(targetMs)}.`,
      };
    }

    if (ratioLeft <= 0.5) {
      return {
        label: `${formatDurationCompact(remainingMs)} kvar`,
        className: 'sla-warn',
        detail: `Varning: <50% av SLA kvar. Mål: ${formatDurationCompact(targetMs)}.`,
      };
    }

    return {
      label: `${formatDurationCompact(remainingMs)} kvar`,
      className: 'sla-ok',
      detail: `Inom SLA. Mål: ${formatDurationCompact(targetMs)}.`,
    };
  }

  function renderRiskEmptyRow(tbody, colSpan, text) {
    if (!tbody) return;
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${colSpan}" class="muted">${escapeHtml(text)}</td>`;
    tbody.appendChild(row);
  }

  function closeAllDrawers() {
    [els.drawerReviews, els.drawerIncidents, els.drawerAudit].forEach((drawer) => {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    });
    if (els.drawerBackdrop) {
      els.drawerBackdrop.classList.remove('is-open');
      els.drawerBackdrop.setAttribute('aria-hidden', 'true');
    }
  }

  function renderDrawerReasons(targetEl, reasonCodes) {
    if (!targetEl) return;
    const codes = Array.isArray(reasonCodes) ? reasonCodes.filter(Boolean) : [];
    if (!codes.length) {
      targetEl.innerHTML = `<span class="muted">Inga triggers registrerade.</span>`;
      return;
    }
    targetEl.innerHTML = codes
      .map((item) => `<span class="badge" style="margin:4px 6px 0 0;"><span class="dot"></span>${escapeHtml(item)}</span>`)
      .join('');
  }

  function openRiskDrawer(evaluation) {
    if (!evaluation || typeof evaluation !== 'object') return;
    const riskLevel = Number(evaluation.riskLevel || 0);
    const isIncident = riskLevel >= 4;
    const drawer = isIncident ? els.drawerIncidents : els.drawerReviews;
    if (!drawer) return;

    const title = String(evaluation.templateId || evaluation.id || 'Riskdetalj');
    const categoryLabel = String(evaluation.category || '-');
    const decisionLabel = formatDecisionLabel(evaluation.decision || '-');
    const ownerLabel = formatOwnerDecisionLabel(evaluation.ownerDecision || 'pending');
    const updatedAtLabel = formatDateTime(evaluation.updatedAt || evaluation.evaluatedAt || '');
    const scoreLine = `Risk L${escapeHtml(riskLevel || '-')} • score ${escapeHtml(
      Number(evaluation.riskScore || 0)
    )}`;

    if (isIncident) {
      if (els.drawerIncidentsTitle) els.drawerIncidentsTitle.textContent = title;
      if (els.drawerIncidentsMeta) {
        els.drawerIncidentsMeta.innerHTML = `
          <div class="mini"><span class="muted">Kategori:</span> <strong>${escapeHtml(categoryLabel)}</strong></div>
          <div class="mini"><span class="muted">Beslut:</span> <strong>${escapeHtml(decisionLabel)}</strong></div>
          <div class="mini"><span class="muted">Ägare:</span> <strong>${escapeHtml(ownerLabel)}</strong></div>
          <div class="mini"><span class="muted">Uppdaterad:</span> <strong>${escapeHtml(updatedAtLabel)}</strong></div>
          <div class="mini muted" style="margin-top:6px">${scoreLine}</div>
        `;
      }
      renderDrawerReasons(els.drawerIncidentsReasons, evaluation.reasonCodes);
    } else {
      if (els.drawerReviewsTitle) els.drawerReviewsTitle.textContent = title;
      if (els.drawerReviewsMeta) {
        els.drawerReviewsMeta.innerHTML = `
          <div class="mini"><span class="muted">Kategori:</span> <strong>${escapeHtml(categoryLabel)}</strong></div>
          <div class="mini"><span class="muted">Beslut:</span> <strong>${escapeHtml(decisionLabel)}</strong></div>
          <div class="mini"><span class="muted">Ägare:</span> <strong>${escapeHtml(ownerLabel)}</strong></div>
          <div class="mini"><span class="muted">Uppdaterad:</span> <strong>${escapeHtml(updatedAtLabel)}</strong></div>
          <div class="mini muted" style="margin-top:6px">${scoreLine}</div>
        `;
      }
      renderDrawerReasons(els.drawerReviewsReasons, evaluation.reasonCodes);
    }

    closeAllDrawers();
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    if (els.drawerBackdrop) {
      els.drawerBackdrop.classList.add('is-open');
      els.drawerBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function openAuditDrawer(event) {
    if (!event || typeof event !== 'object' || !els.drawerAudit) return;

    if (els.drawerAuditTitle) {
      els.drawerAuditTitle.textContent = String(event.action || 'Revision');
    }
    if (els.drawerAuditMeta) {
      const riskLevel = extractAuditRiskLevel(event);
      const riskText = riskLevel === null ? '-' : `L${riskLevel}`;
      els.drawerAuditMeta.innerHTML = `
        <div class="mini"><span class="muted">Tid:</span> <strong>${escapeHtml(
          formatEventTime(event.ts)
        )}</strong></div>
        <div class="mini"><span class="muted">Åtgärd:</span> <strong>${escapeHtml(
          event.action || '-'
        )}</strong></div>
        <div class="mini"><span class="muted">Mål:</span> <strong>${escapeHtml(
          event.targetType || '-'
        )}:${escapeHtml(event.targetId || '-')}</strong></div>
        <div class="mini"><span class="muted">Aktör:</span> <strong>${escapeHtml(
          event.actorUserId || '-'
        )}</strong></div>
        <div class="mini"><span class="muted">Utfall:</span> <strong>${escapeHtml(
          formatStatusLabel(event.outcome || '-')
        )}</strong></div>
        <div class="mini"><span class="muted">Risk:</span> <strong>${escapeHtml(riskText)}</strong></div>
      `;
    }
    if (els.drawerAuditCorrelation) {
      const correlationId =
        String(event.correlationId || event.metadata?.correlationId || '').trim() || '-';
      els.drawerAuditCorrelation.textContent = correlationId;
    }

    closeAllDrawers();
    els.drawerAudit.classList.add('is-open');
    els.drawerAudit.setAttribute('aria-hidden', 'false');
    if (els.drawerBackdrop) {
      els.drawerBackdrop.classList.add('is-open');
      els.drawerBackdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function getRiskEvaluationById(evaluationId) {
    const normalized = String(evaluationId || '').trim();
    if (!normalized) return null;
    return state.riskEvaluations.find((item) => String(item.id || '') === normalized) || null;
  }

  function syncSelectAllCheckbox(checkbox, visibleIds) {
    if (!checkbox) return;
    const selectedVisibleCount = visibleIds.filter((id) => state.selectedRiskIds.includes(id)).length;
    checkbox.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    checkbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  }

  function bindRiskRowInteractions(reviews, incidents) {
    const canEdit = isOwner();
    const tableRoots = ['#riskReviewsTableBody', '#riskIncidentsTableBody'];

    document
      .querySelectorAll(`${tableRoots[0]} .riskSelectChk, ${tableRoots[1]} .riskSelectChk`)
      .forEach((checkbox) => {
        checkbox.disabled = !canEdit;
        checkbox.addEventListener('change', () => {
          const id = String(checkbox.getAttribute('data-eid') || '');
          if (!id) return;
          if (checkbox.checked) {
            if (!state.selectedRiskIds.includes(id)) state.selectedRiskIds.push(id);
          } else {
            state.selectedRiskIds = state.selectedRiskIds.filter((item) => item !== id);
          }
          renderRiskQueueSummary(state.riskEvaluations);
          syncSelectAllCheckbox(
            els.riskSelectAllReviews,
            reviews.map((item) => String(item.id || '')).filter(Boolean)
          );
          syncSelectAllCheckbox(
            els.riskSelectAllIncidents,
            incidents.map((item) => String(item.id || '')).filter(Boolean)
          );
        });
      });

    document
      .querySelectorAll(`${tableRoots[0]} .riskOpenBtn, ${tableRoots[1]} .riskOpenBtn`)
      .forEach((btn) => {
        btn.addEventListener('click', async () => {
          const evaluationId = btn.getAttribute('data-eid') || '';
          if (!evaluationId) return;
          await loadRiskEvaluationDetail(evaluationId);
          renderRiskTable(state.riskEvaluations);
          openRiskDrawer(getRiskEvaluationById(evaluationId));
        });
      });

    document
      .querySelectorAll(`${tableRoots[0]} .ownerActionBtn, ${tableRoots[1]} .ownerActionBtn`)
      .forEach((btn) => {
        btn.disabled = !canEdit;
        btn.addEventListener('click', async () => {
          const evaluationId = btn.getAttribute('data-eid');
          const select = document.querySelector(`.ownerActionSelect[data-eid="${evaluationId}"]`);
          const action = select ? select.value : 'request_revision';
          const noteDialog = await openAppModal({
            title: 'Owner action',
            message: `Spara action "${action}" för vald riskutvärdering.`,
            inputMode: 'text',
            inputLabel: 'Notering (valfritt)',
            inputPlaceholder: 'Ex. Kontext för beslut',
            defaultValue: 'Owner panel action',
            confirmLabel: 'Spara action',
            cancelLabel: 'Avbryt',
          });
          if (!noteDialog.confirmed) {
            setStatus(els.riskActionStatus, 'Owner action avbruten.');
            return;
          }
          try {
            setStatus(els.riskActionStatus, `Sparar ägaråtgärd (${formatOwnerActionLabel(action)})...`);
            await applyOwnerAction(evaluationId, action, noteDialog.value || '');
            setStatus(els.riskActionStatus, `Owner action sparad: ${action}.`);
            await loadDashboard();
            await loadRiskEvaluationDetail(evaluationId);
          } catch (error) {
            setStatus(els.riskActionStatus, error.message || 'Kunde inte spara ägaråtgärd.', true);
          }
        });
      });

    document
      .querySelectorAll(`${tableRoots[0]} tr[data-eid], ${tableRoots[1]} tr[data-eid]`)
      .forEach((row) => {
        row.classList.add('row-link');
        row.setAttribute('tabindex', '0');
        row.addEventListener('click', async (event) => {
          if (
            closestFromEventTarget(
              event,
              'button, input, select, textarea, a, summary, details, label, [data-owner-action]'
            )
          ) {
            return;
          }
          const evaluationId = row.getAttribute('data-eid') || '';
          if (!evaluationId) return;
          await loadRiskEvaluationDetail(evaluationId);
          renderRiskTable(state.riskEvaluations);
          openRiskDrawer(getRiskEvaluationById(evaluationId));
        });
        row.addEventListener('keydown', async (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          const evaluationId = row.getAttribute('data-eid') || '';
          if (!evaluationId) return;
          await loadRiskEvaluationDetail(evaluationId);
          renderRiskTable(state.riskEvaluations);
          openRiskDrawer(getRiskEvaluationById(evaluationId));
        });
      });
  }

  function renderRiskTable(evaluations, incidentRows = null) {
    saveListScrollPosition('riskReviewsWrap', els.riskReviewsWrap);
    saveListScrollPosition('riskIncidentsWrap', els.riskIncidentsWrap);
    const sourceRows = Array.isArray(evaluations) ? evaluations : [];
    const reviews = sourceRows.filter((item) => Number(item?.riskLevel || 0) === 3);
    const incidents = Array.isArray(incidentRows)
      ? incidentRows.filter((item) => Number(item?.riskLevel || 0) >= 4)
      : sourceRows.filter((item) => Number(item?.riskLevel || 0) >= 4);
    const displayEvaluations = [...reviews, ...incidents];
    state.riskEvaluations = displayEvaluations;
    const visibleIds = displayEvaluations.map((item) => String(item.id || '')).filter(Boolean);
    state.selectedRiskIds = state.selectedRiskIds.filter((item) => visibleIds.includes(item));
    if (state.selectedRiskEvaluationId && !visibleIds.includes(state.selectedRiskEvaluationId)) {
      state.selectedRiskEvaluationId = '';
    }

    if (els.riskReviewsTableBody) els.riskReviewsTableBody.innerHTML = '';
    if (els.riskIncidentsTableBody) els.riskIncidentsTableBody.innerHTML = '';
    if (els.riskReviewsCount) els.riskReviewsCount.textContent = `(${reviews.length})`;
    if (els.riskIncidentsCount) els.riskIncidentsCount.textContent = `(${incidents.length})`;
    renderRiskQueueSummary(state.riskEvaluations);

    if (!displayEvaluations.length) {
      renderRiskEmptyRow(els.riskReviewsTableBody, 12, 'Inga granskningar (L3) för valt filter.');
      renderRiskEmptyRow(els.riskIncidentsTableBody, 11, 'Inga incidenter (L4-L5) för valt filter.');
      syncSelectAllCheckbox(els.riskSelectAllReviews, []);
      syncSelectAllCheckbox(els.riskSelectAllIncidents, []);
      renderRiskDetail(null);
      restoreListScrollPosition('riskReviewsWrap', els.riskReviewsWrap);
      restoreListScrollPosition('riskIncidentsWrap', els.riskIncidentsWrap);
      return;
    }

    for (const evaluation of reviews) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      const evaluationId = String(evaluation.id || '');
      tr.setAttribute('data-eid', evaluationId);
      if (evaluationId && evaluationId === state.selectedRiskEvaluationId) tr.classList.add('risk-row-selected');
      const reasonCodes = Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : [];
      const reasonCodesShort = reasonCodes.length ? reasonCodes.slice(0, 3).join(', ') : '';
      const ownerDecision = String(evaluation.ownerDecision || '');
      const riskLevel = Number(evaluation.riskLevel || 1);
      const riskScore = Number(evaluation.riskScore || 0);
      const semanticScore = Number(evaluation.semanticScore || 0);
      const ruleScore = Number(evaluation.ruleScore || 0);
      const policyAdjustments = Array.isArray(evaluation.policyAdjustments)
        ? evaluation.policyAdjustments
        : [];
      const policyHitRows = policyAdjustments
        .map(
          (item) =>
            `${escapeHtml(item.reasonCode || 'policy_rule')}→L${escapeHtml(item.floorApplied || '?')}`
        )
        .join('<br/>');
      const reasonCodesFull = reasonCodes.length
        ? reasonCodes.map((item) => escapeHtml(item)).join('<br/>')
        : '-';
      const selectedAction = ownerActionFromDecision(ownerDecision);
      const isChecked = state.selectedRiskIds.includes(evaluationId);
      const categoryLabel = String(evaluation.category || '-');
      const updatedAt = evaluation.updatedAt || evaluation.evaluatedAt || '';
      const updatedAtLabel = formatDateTime(updatedAt);
      const ageLabel = formatRelativeAge(updatedAt);
      tr.innerHTML = `
        <td><input type="checkbox" class="riskSelectChk" data-eid="${evaluationId}" ${isChecked ? 'checked' : ''} /></td>
        <td class="code">${escapeHtml(evaluation.id || '-')}</td>
        <td class="code">${escapeHtml(evaluation.templateId || '-')}<br/>v:${escapeHtml(evaluation.templateVersionId || '-')}</td>
        <td><span class="chip">${escapeHtml(categoryLabel)}</span></td>
        <td class="mini">${escapeHtml(updatedAtLabel)}<br/><span class="muted">${escapeHtml(ageLabel)}</span></td>
        <td><span class="badge"><span class="dot ${dotClassForRiskLevel(riskLevel)}"></span>L${riskLevel}</span></td>
        <td>${escapeHtml(formatDecisionLabel(evaluation.decision || '-'))}</td>
        <td>${escapeHtml(formatOwnerDecisionLabel(evaluation.ownerDecision || 'pending'))}</td>
        <td class="mini">
          risk: <strong>${riskScore}</strong><br/>
          sem: ${semanticScore}<br/>
          rule: ${ruleScore}
        </td>
        <td class="mini">
          ${policyAdjustments.length ? policyHitRows : '-'}
        </td>
        <td class="mini" title="${escapeHtml(reasonCodes.join(', '))}">${escapeHtml(reasonCodesShort || '-')}${reasonCodes.length > 3 ? ' ...' : ''}<br/><span class="muted">${reasonCodes.length} st</span></td>
        <td>
          <div class="actions">
            <select data-eid="${escapeHtml(evaluation.id || '')}" class="ownerActionSelect">
              <option value="request_revision" ${
                selectedAction === 'request_revision' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('request_revision'))}</option>
              <option value="approve_exception" ${
                selectedAction === 'approve_exception' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('approve_exception'))}</option>
              <option value="mark_false_positive" ${
                selectedAction === 'mark_false_positive' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('mark_false_positive'))}</option>
              <option value="escalate" ${selectedAction === 'escalate' ? 'selected' : ''}>${escapeHtml(
                formatOwnerActionLabel('escalate')
              )}</option>
            </select>
            <button class="btn small ownerActionBtn" data-eid="${escapeHtml(evaluation.id || '')}">Spara</button>
            <button class="btn small riskOpenBtn" data-eid="${escapeHtml(evaluation.id || '')}">Visa</button>
          </div>
          <details class="mini" style="margin-top:6px">
            <summary class="muted">Detaljer</summary>
            <div class="code" style="margin-top:6px">Uppdaterad: ${escapeHtml(evaluation.updatedAt || evaluation.evaluatedAt || '-')}</div>
            <div class="code" style="margin-top:4px">${reasonCodesFull}</div>
          </details>
        </td>
      `;
      if (els.riskReviewsTableBody) els.riskReviewsTableBody.appendChild(tr);
    }

    for (const evaluation of incidents) {
      const tr = document.createElement('tr');
      tr.classList.add('row-link');
      const evaluationId = String(evaluation.id || '');
      const incidentId = String(evaluation.incidentId || evaluationId);
      tr.setAttribute('data-eid', evaluationId);
      if (evaluationId && evaluationId === state.selectedRiskEvaluationId) tr.classList.add('risk-row-selected');
      const reasonCodes = Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : [];
      const reasonCodesShort = reasonCodes.length ? reasonCodes.slice(0, 3).join(', ') : '';
      const ownerDecision = String(evaluation.ownerDecision || '');
      const selectedAction = ownerActionFromDecision(ownerDecision);
      const isChecked = state.selectedRiskIds.includes(evaluationId);
      const riskLevel = Number(evaluation.riskLevel || 1);
      const sla = computeIncidentSla(evaluation);
      const categoryLabel = String(evaluation.category || '-');
      const updatedAt = evaluation.updatedAt || evaluation.evaluatedAt || '';
      const updatedAtLabel = formatDateTime(updatedAt);
      const ageLabel = formatRelativeAge(updatedAt);
      tr.innerHTML = `
        <td><input type="checkbox" class="riskSelectChk" data-eid="${evaluationId}" ${isChecked ? 'checked' : ''} /></td>
        <td><span class="badge sla-chip ${escapeHtml(sla.className)}" title="${escapeHtml(sla.detail)}">${escapeHtml(sla.label)}</span></td>
        <td class="code">${escapeHtml(incidentId || '-')}</td>
        <td class="code">${escapeHtml(evaluation.templateId || '-')}<br/>v:${escapeHtml(evaluation.templateVersionId || '-')}</td>
        <td><span class="chip">${escapeHtml(categoryLabel)}</span></td>
        <td class="mini">${escapeHtml(updatedAtLabel)}<br/><span class="muted">${escapeHtml(ageLabel)}</span></td>
        <td><span class="badge"><span class="dot ${dotClassForRiskLevel(riskLevel)}"></span>L${riskLevel}</span></td>
        <td>${escapeHtml(formatDecisionLabel(evaluation.decision || '-'))}</td>
        <td>${escapeHtml(formatOwnerDecisionLabel(evaluation.ownerDecision || 'pending'))}</td>
        <td class="mini" title="${escapeHtml(reasonCodes.join(', '))}">${escapeHtml(reasonCodesShort || '-')}${reasonCodes.length > 3 ? ' ...' : ''}<br/><span class="muted">${reasonCodes.length} st</span></td>
        <td>
          <div class="actions">
            <select data-eid="${escapeHtml(evaluation.id || '')}" class="ownerActionSelect">
              <option value="request_revision" ${
                selectedAction === 'request_revision' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('request_revision'))}</option>
              <option value="approve_exception" ${
                selectedAction === 'approve_exception' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('approve_exception'))}</option>
              <option value="mark_false_positive" ${
                selectedAction === 'mark_false_positive' ? 'selected' : ''
              }>${escapeHtml(formatOwnerActionLabel('mark_false_positive'))}</option>
              <option value="escalate" ${selectedAction === 'escalate' ? 'selected' : ''}>${escapeHtml(
                formatOwnerActionLabel('escalate')
              )}</option>
            </select>
            <button class="btn small ownerActionBtn" data-eid="${escapeHtml(evaluation.id || '')}">Spara</button>
            <button class="btn small riskOpenBtn" data-eid="${escapeHtml(evaluation.id || '')}">Visa</button>
          </div>
          <details class="mini" style="margin-top:6px">
            <summary class="muted">Detaljer</summary>
            <div class="code" style="margin-top:6px">Uppdaterad: ${escapeHtml(evaluation.updatedAt || evaluation.evaluatedAt || '-')}</div>
          </details>
        </td>
      `;
      if (els.riskIncidentsTableBody) els.riskIncidentsTableBody.appendChild(tr);
    }

    if (!reviews.length) {
      renderRiskEmptyRow(els.riskReviewsTableBody, 12, 'Inga granskningar (L3) för valt filter.');
    }
    if (!incidents.length) {
      renderRiskEmptyRow(els.riskIncidentsTableBody, 11, 'Inga incidenter (L4-L5) för valt filter.');
    }

    bindRiskRowInteractions(reviews, incidents);
    syncSelectAllCheckbox(
      els.riskSelectAllReviews,
      reviews.map((item) => String(item.id || '')).filter(Boolean)
    );
    syncSelectAllCheckbox(
      els.riskSelectAllIncidents,
      incidents.map((item) => String(item.id || '')).filter(Boolean)
    );

    if (!state.selectedRiskEvaluationId && displayEvaluations[0]?.id) {
      void loadRiskEvaluationDetail(displayEvaluations[0].id);
    } else if (state.selectedRiskEvaluationId) {
      const activeRow = displayEvaluations.find((item) => item.id === state.selectedRiskEvaluationId);
      if (activeRow) renderRiskDetail(activeRow);
    }
    restoreListScrollPosition('riskReviewsWrap', els.riskReviewsWrap);
    restoreListScrollPosition('riskIncidentsWrap', els.riskIncidentsWrap);
  }

  function normalizeRiskRange(minRaw, maxRaw) {
    const minParsed = Number.parseInt(String(minRaw ?? '3'), 10);
    const maxParsed = Number.parseInt(String(maxRaw ?? '5'), 10);
    const minNormalized = Number.isFinite(minParsed) ? Math.max(1, Math.min(5, minParsed)) : 3;
    const maxNormalized = Number.isFinite(maxParsed) ? Math.max(1, Math.min(5, maxParsed)) : 5;
    return {
      minRiskLevel: Math.min(minNormalized, maxNormalized),
      maxRiskLevel: Math.max(minNormalized, maxNormalized),
    };
  }

  function syncRiskFilterInputs() {
    const normalizedRange = normalizeRiskRange(
      state.riskFilters?.minRiskLevel,
      state.riskFilters?.maxRiskLevel
    );
    state.riskFilters.minRiskLevel = normalizedRange.minRiskLevel;
    state.riskFilters.maxRiskLevel = normalizedRange.maxRiskLevel;
    if (els.riskMinFilter) els.riskMinFilter.value = String(state.riskFilters.minRiskLevel);
    if (els.riskMaxFilter) els.riskMaxFilter.value = String(state.riskFilters.maxRiskLevel);
    if (els.riskDecisionFilter) els.riskDecisionFilter.value = state.riskFilters.decision || '';
    if (els.riskOwnerDecisionFilter) {
      els.riskOwnerDecisionFilter.value = state.riskFilters.ownerDecision || '';
    }
    if (els.riskStateFilter) els.riskStateFilter.value = state.riskFilters.state || '';
    if (els.riskCategoryFilter) els.riskCategoryFilter.value = state.riskFilters.category || '';
    if (els.riskSinceDaysFilter) els.riskSinceDaysFilter.value = String(state.riskFilters.sinceDays || 14);
    if (els.riskReasonFilter) els.riskReasonFilter.value = state.riskFilters.reasonCode || '';
    if (els.riskSearchFilter) els.riskSearchFilter.value = state.riskFilters.search || '';
  }

  function readRiskFiltersFromInputs() {
    const normalizedRange = normalizeRiskRange(
      els.riskMinFilter?.value || state.riskFilters?.minRiskLevel || 3,
      els.riskMaxFilter?.value || state.riskFilters?.maxRiskLevel || 5
    );
    const sinceParsed = Number.parseInt(
      String(els.riskSinceDaysFilter?.value || state.riskFilters?.sinceDays || 14),
      10
    );
    state.riskFilters = {
      minRiskLevel: normalizedRange.minRiskLevel,
      maxRiskLevel: normalizedRange.maxRiskLevel,
      sinceDays: Number.isFinite(sinceParsed) ? Math.max(0, Math.min(365, sinceParsed)) : 14,
      ownerDecision: String(els.riskOwnerDecisionFilter?.value || '').trim(),
      decision: String(els.riskDecisionFilter?.value || '').trim(),
      category: String(els.riskCategoryFilter?.value || '').trim(),
      state: String(els.riskStateFilter?.value || '').trim(),
      reasonCode: String(els.riskReasonFilter?.value || '').trim(),
      search: String(els.riskSearchFilter?.value || '').trim(),
    };
    persistRiskFilters();
    syncRiskFilterInputs();
    return state.riskFilters;
  }

  function applyRiskFilterPreset(preset) {
    if (preset === 'pending') {
      state.riskFilters = {
        ...state.riskFilters,
        minRiskLevel: 1,
        maxRiskLevel: 5,
        ownerDecision: 'pending',
        decision: '',
        category: '',
        state: 'open',
        sinceDays: 14,
        reasonCode: '',
        search: '',
      };
    } else if (preset === 'high_critical') {
      state.riskFilters = {
        ...state.riskFilters,
        minRiskLevel: 4,
        maxRiskLevel: 5,
        ownerDecision: '',
        decision: '',
        category: '',
        state: 'open',
        sinceDays: 14,
        reasonCode: '',
        search: '',
      };
    } else {
      state.riskFilters = {
        ...state.riskFilters,
        minRiskLevel: 3,
        maxRiskLevel: 5,
        ownerDecision: '',
        decision: '',
        category: '',
        state: '',
        sinceDays: 14,
        reasonCode: '',
        search: '',
      };
    }
    persistRiskFilters();
    syncRiskFilterInputs();
  }

  async function openReviewsQueue() {
    applyRiskFilterPreset('pending');
    await loadDashboard();
    setActiveSectionGroup('reviewsIncidentsSection', {
      targetId: els.reviewsQueueSection?.id || els.reviewsIncidentsSection?.id || '',
      scroll: true,
    });
  }

  async function openIncidentsQueue() {
    applyRiskFilterPreset('high_critical');
    await loadDashboard();
    setActiveSectionGroup('reviewsIncidentsSection', {
      targetId: els.incidentsQueueSection?.id || els.reviewsIncidentsSection?.id || '',
      scroll: true,
    });
  }

  function resolveSectionGroupTarget(targetId) {
    const normalized = String(targetId || '').trim();
    if (!normalized) return 'overviewSection';
    if (normalized === 'reviewsQueueSection' || normalized === 'incidentsQueueSection') {
      return 'reviewsIncidentsSection';
    }
    const targetEl = document.getElementById(normalized);
    const group = String(targetEl?.getAttribute('data-section-group') || '').trim();
    return group || normalized;
  }

  function resolveSectionGroupFromHash(hashValue) {
    const hash = String(hashValue || '')
      .trim()
      .toLowerCase();
    if (!hash) return '';
    if (hash === '#cco-workspace') return 'ccoWorkspaceSection';
    const entry = Object.entries(SECTION_GROUP_HASH_MAP).find(
      ([, hashTarget]) => String(hashTarget || '').trim().toLowerCase() === hash
    );
    return entry ? entry[0] : '';
  }

  function persistCcoWorkspaceSessionState() {
    try {
      const payload = {
        selectedConversationId: String(state.ccoSelectedConversationId || '').trim(),
        viewMode: sanitizeCcoViewMode(state.ccoInboxViewMode),
        mailViewMode: sanitizeCcoMailViewMode(state.ccoMailViewMode),
        mailboxFilter: sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter),
        slaFilter: sanitizeCcoSlaFilter(state.ccoInboxSlaFilter),
        lifecycleFilter: sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter),
        indicatorViewFilter: sanitizeCcoIndicatorViewFilter(state.ccoIndicatorViewFilter),
        searchQuery: sanitizeCcoSearchQuery(state.ccoInboxSearchQuery),
        showSystemMessages: sanitizeCcoShowSystemMessages(state.ccoInboxShowSystemMessages),
        densityMode: sanitizeCcoDensityMode(state.ccoInboxDensityMode),
        mailboxFiltersExpanded: sanitizeCcoMailboxFiltersExpanded(state.ccoMailboxFiltersExpanded),
        extraFiltersExpanded: sanitizeCcoExtraFiltersExpanded(state.ccoExtraFiltersExpanded),
        workspaceCompact: sanitizeCcoWorkspaceCompact(state.ccoWorkspaceCompact),
        centerReadTab: sanitizeCcoCenterReadTab(state.ccoCenterReadTab),
        columnLayout: sanitizeCcoColumnLayout(state.ccoColumnLayout),
        sectionExpanded: sanitizeCcoSectionExpandedState(state.ccoInboxSectionExpanded),
        includeSignature: sanitizeCcoIncludeSignature(state.ccoIncludeSignature),
        signaturePreviewExpanded: sanitizeCcoSignaturePreviewExpanded(
          state.ccoSignaturePreviewExpanded
        ),
        draftsByConversationId: sanitizeCcoDraftMap(state.ccoDraftOverrideByConversationId),
        draftModeByConversationId: sanitizeCcoDraftModeMap(state.ccoDraftModeByConversationId),
        systemMessageByConversationId: sanitizeCcoSystemFlagMap(
          state.ccoSystemMessageByConversationId
        ),
        indicatorOverrideByConversationId: sanitizeCcoIndicatorOverrideMap(
          state.ccoIndicatorOverrideByConversationId
        ),
        systemMessageSenderPatterns: sanitizeCcoSystemPatternList(
          state.ccoSystemMessageSenderPatterns
        ),
        systemMessageSubjectPatterns: sanitizeCcoSystemPatternList(
          state.ccoSystemMessageSubjectPatterns
        ),
        scrollTopByConversationId: sanitizeCcoScrollMap(state.ccoConversationScrollTopByConversationId),
        selectedFeedMessageId: String(state.ccoSelectedFeedMessageId || '').trim(),
      };
      sessionStorage.setItem(CCO_WORKSPACE_SESSION_KEY, JSON.stringify(payload));
    } catch {
      // Ignorera sessionStorage-fel (t.ex. privat läge)
    }
  }

  function syncCcoThreadRouteState(conversationId = '') {
    if (state.activeSectionGroup !== 'ccoWorkspaceSection') return;
    const safeConversationId = String(conversationId || '').trim();
    const url = new URL(window.location.href);
    url.pathname = CCO_PRIMARY_PATH;
    url.hash = '';
    if (safeConversationId) {
      url.searchParams.set(CCO_THREAD_QUERY_PARAM, safeConversationId);
    } else {
      url.searchParams.delete(CCO_THREAD_QUERY_PARAM);
    }
    const nextUrl = `${url.pathname}${url.search}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === nextUrl) return;
    window.history.replaceState(null, '', nextUrl);
  }

  function setSelectedCcoConversation(conversationId = '', { syncRoute = true } = {}) {
    state.ccoSelectedConversationId = String(conversationId || '').trim();
    logCcoInteraction('set-selected-conversation', {
      conversationId: state.ccoSelectedConversationId || null,
      syncRoute: syncRoute === true,
    });
    if (state.ccoSelectedConversationId) {
      state.ccoSeenConversationIds = {
        ...state.ccoSeenConversationIds,
        [state.ccoSelectedConversationId]: true,
      };
    }
    if (syncRoute) syncCcoThreadRouteState(state.ccoSelectedConversationId);
    persistCcoWorkspaceSessionState();
  }

  function buildSectionCanonicalUrl(groupId) {
    const normalized = String(groupId || '').trim();
    if (!normalized) return '';
    if (normalized === 'ccoWorkspaceSection') {
      const threadId = String(state.ccoSelectedConversationId || '').trim();
      const basePath = CCO_PRIMARY_PATH;
      return threadId
        ? `${basePath}?${CCO_THREAD_QUERY_PARAM}=${encodeURIComponent(threadId)}`
        : basePath;
    }
    const hash = SECTION_GROUP_HASH_MAP[normalized] || SECTION_GROUP_HASH_MAP.overviewSection;
    return `${ADMIN_PRIMARY_PATH}${hash}`;
  }

  function syncSectionHash(groupId) {
    const nextUrl = buildSectionCanonicalUrl(groupId);
    if (!nextUrl) return;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (String(currentUrl).trim() === String(nextUrl).trim()) return;
    window.history.replaceState(null, '', nextUrl);
  }

  function runModeTransition(previousGroupId, nextGroupId) {
    const wasCco = String(previousGroupId || '').trim() === 'ccoWorkspaceSection';
    const isCco = String(nextGroupId || '').trim() === 'ccoWorkspaceSection';
    if (wasCco === isCco) return;
    document.body.classList.add('mode-switching');
    if (modeTransitionTimer) clearTimeout(modeTransitionTimer);
    modeTransitionTimer = setTimeout(() => {
      document.body.classList.remove('mode-switching');
    }, 170);
  }

  function isCcoColumnResizeViewport() {
    return window.innerWidth > CCO_COLUMN_RESIZE_BREAKPOINT;
  }

  function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    if (numeric < min) return min;
    if (numeric > max) return max;
    return numeric;
  }

  function readCcoColumnWidthsFromGrid() {
    const layoutEl = els.ccoWorkspaceLayout;
    if (!layoutEl) return { left: null, right: null };
    const computed = window.getComputedStyle(layoutEl).gridTemplateColumns || '';
    const parts = computed
      .split(/\s+/)
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (parts.length < 3) return { left: null, right: null };
    const left = Number.parseFloat(parts[0]);
    const right = Number.parseFloat(parts[parts.length - 1]);
    return {
      left: Number.isFinite(left) ? Math.round(left) : null,
      right: Number.isFinite(right) ? Math.round(right) : null,
    };
  }

  function normalizeCcoColumnLayoutForWidth(layoutWidth, input = {}, preferredSide = '') {
    const width = Number(layoutWidth);
    if (!Number.isFinite(width) || width <= 0) return { left: null, right: null };
    const limits = CCO_COLUMN_WIDTH_LIMITS;
    const fallbackLeft = 260;
    const fallbackRight = 420;
    const rawLeft = Number(input?.left);
    const rawRight = Number(input?.right);
    const hasLeft = Number.isFinite(rawLeft) && rawLeft > 0;
    const hasRight = Number.isFinite(rawRight) && rawRight > 0;
    let left = clampNumber(
      hasLeft ? rawLeft : fallbackLeft,
      limits.leftMin,
      Math.min(limits.leftMax, width - limits.rightMin - limits.centerMin)
    );
    let right = clampNumber(
      hasRight ? rawRight : fallbackRight,
      limits.rightMin,
      Math.min(limits.rightMax, width - limits.leftMin - limits.centerMin)
    );

    let center = width - left - right;
    if (center < limits.centerMin) {
      let shortage = limits.centerMin - center;
      if (preferredSide === 'left') {
        const reducibleLeft = Math.max(0, left - limits.leftMin);
        const reduceBy = Math.min(reducibleLeft, shortage);
        left -= reduceBy;
        shortage -= reduceBy;
      } else if (preferredSide === 'right') {
        const reducibleRight = Math.max(0, right - limits.rightMin);
        const reduceBy = Math.min(reducibleRight, shortage);
        right -= reduceBy;
        shortage -= reduceBy;
      }
      if (shortage > 0) {
        const reducibleLeft = Math.max(0, left - limits.leftMin);
        const reduceLeft = Math.min(reducibleLeft, Math.ceil(shortage / 2));
        left -= reduceLeft;
        shortage -= reduceLeft;
      }
      if (shortage > 0) {
        const reducibleRight = Math.max(0, right - limits.rightMin);
        const reduceRight = Math.min(reducibleRight, shortage);
        right -= reduceRight;
        shortage -= reduceRight;
      }
      center = width - left - right;
      if (center < limits.centerMin) {
        const fallbackMaxLeft = Math.max(limits.leftMin, width - right - limits.centerMin);
        left = clampNumber(left, limits.leftMin, fallbackMaxLeft);
        const fallbackMaxRight = Math.max(limits.rightMin, width - left - limits.centerMin);
        right = clampNumber(right, limits.rightMin, fallbackMaxRight);
      }
    }
    return { left: Math.round(left), right: Math.round(right) };
  }

  function updateCcoResizeHandlePositions() {
    const layoutEl = els.ccoWorkspaceLayout;
    if (!layoutEl || !els.ccoResizeHandleLeft || !els.ccoResizeHandleRight) return;
    if (layoutEl.getAttribute('data-resize-enabled') !== 'true') return;
    const rect = layoutEl.getBoundingClientRect();
    const width = Math.round(rect.width || 0);
    if (width <= 0) return;
    const columnLayout = normalizeCcoColumnLayoutForWidth(width, state.ccoColumnLayout || {});
    if (!Number.isFinite(columnLayout.left) || !Number.isFinite(columnLayout.right)) return;
    els.ccoResizeHandleLeft.style.left = `${columnLayout.left}px`;
    els.ccoResizeHandleRight.style.left = `${width - columnLayout.right}px`;
  }

  function applyCcoColumnLayout({ persist = false, preferredSide = '' } = {}) {
    const layoutEl = els.ccoWorkspaceLayout;
    if (!layoutEl) return;
    if (!isCcoColumnResizeViewport()) {
      layoutEl.removeAttribute('data-resize-enabled');
      layoutEl.style.removeProperty('grid-template-columns');
      if (els.ccoResizeHandleLeft) els.ccoResizeHandleLeft.style.left = '';
      if (els.ccoResizeHandleRight) els.ccoResizeHandleRight.style.left = '';
      return;
    }
    const rect = layoutEl.getBoundingClientRect();
    const width = Math.round(rect.width || 0);
    if (width <= 0) return;
    const base =
      state.ccoColumnLayout?.left || state.ccoColumnLayout?.right
        ? state.ccoColumnLayout
        : readCcoColumnWidthsFromGrid();
    const normalized = normalizeCcoColumnLayoutForWidth(width, base, preferredSide);
    if (!Number.isFinite(normalized.left) || !Number.isFinite(normalized.right)) return;
    state.ccoColumnLayout = normalized;
    layoutEl.setAttribute('data-resize-enabled', 'true');
    layoutEl.style.gridTemplateColumns = `${normalized.left}px minmax(${CCO_COLUMN_WIDTH_LIMITS.centerMin}px, 1fr) ${normalized.right}px`;
    updateCcoResizeHandlePositions();
    if (persist) persistCcoWorkspaceSessionState();
  }

  function startCcoColumnResize(side = 'left', event) {
    if (!event || event.button !== 0) return;
    if (!isCcoColumnResizeViewport()) return;
    const layoutEl = els.ccoWorkspaceLayout;
    if (!layoutEl) return;
    const rect = layoutEl.getBoundingClientRect();
    const width = Math.round(rect.width || 0);
    if (width <= 0) return;
    const current = normalizeCcoColumnLayoutForWidth(width, state.ccoColumnLayout || {}, side);
    ccoColumnResizeState = {
      side,
      pointerId: event.pointerId,
      startX: Number(event.clientX || 0),
      startLeft: current.left,
      startRight: current.right,
    };
    const handle = side === 'right' ? els.ccoResizeHandleRight : els.ccoResizeHandleLeft;
    if (handle?.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // ignore capture failures
      }
    }
    handle?.classList.add('is-dragging');
    document.body.classList.add('cco-col-resizing');
    event.preventDefault();
  }

  function moveCcoColumnResize(side = 'left', event) {
    const active = ccoColumnResizeState;
    if (!active || active.side !== side) return;
    if (active.pointerId !== undefined && event.pointerId !== active.pointerId) return;
    const deltaX = Number(event.clientX || 0) - Number(active.startX || 0);
    if (!Number.isFinite(deltaX)) return;
    const nextLayout =
      side === 'left'
        ? { left: active.startLeft + deltaX, right: active.startRight }
        : { left: active.startLeft, right: active.startRight - deltaX };
    state.ccoColumnLayout = nextLayout;
    applyCcoColumnLayout({ persist: false, preferredSide: side });
    event.preventDefault();
  }

  function stopCcoColumnResize(side = 'left', event) {
    const active = ccoColumnResizeState;
    if (!active || active.side !== side) return;
    if (active.pointerId !== undefined && event.pointerId !== active.pointerId) return;
    const handle = side === 'right' ? els.ccoResizeHandleRight : els.ccoResizeHandleLeft;
    if (handle?.releasePointerCapture) {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        // ignore release failures
      }
    }
    handle?.classList.remove('is-dragging');
    document.body.classList.remove('cco-col-resizing');
    ccoColumnResizeState = null;
    applyCcoColumnLayout({ persist: true });
  }

  function initCcoColumnResizers() {
    if (els.ccoResizeHandleLeft && !els.ccoResizeHandleLeft.dataset.bound) {
      els.ccoResizeHandleLeft.addEventListener('pointerdown', (event) => {
        startCcoColumnResize('left', event);
      });
      els.ccoResizeHandleLeft.addEventListener('pointermove', (event) => {
        moveCcoColumnResize('left', event);
      });
      els.ccoResizeHandleLeft.addEventListener('pointerup', (event) => {
        stopCcoColumnResize('left', event);
      });
      els.ccoResizeHandleLeft.addEventListener('pointercancel', (event) => {
        stopCcoColumnResize('left', event);
      });
      els.ccoResizeHandleLeft.dataset.bound = '1';
    }
    if (els.ccoResizeHandleRight && !els.ccoResizeHandleRight.dataset.bound) {
      els.ccoResizeHandleRight.addEventListener('pointerdown', (event) => {
        startCcoColumnResize('right', event);
      });
      els.ccoResizeHandleRight.addEventListener('pointermove', (event) => {
        moveCcoColumnResize('right', event);
      });
      els.ccoResizeHandleRight.addEventListener('pointerup', (event) => {
        stopCcoColumnResize('right', event);
      });
      els.ccoResizeHandleRight.addEventListener('pointercancel', (event) => {
        stopCcoColumnResize('right', event);
      });
      els.ccoResizeHandleRight.dataset.bound = '1';
    }
    applyCcoColumnLayout({ persist: false });
  }

  function updateWorkspaceViewportMetrics() {
    const headerHeight = Number(els.adminHeader?.offsetHeight || 0);
    const navHeight = Number(els.sectionNav?.offsetHeight || 0);
    const compactCco = document.body.classList.contains('cco-compact-header');
    const floor = compactCco ? 96 : 150;
    const topPadding = compactCco ? 10 : 34;
    let computed = Math.max(floor, Math.round(headerHeight + navHeight + topPadding));
    if (compactCco) {
      computed = Math.min(110, computed);
    }
    document.documentElement.style.setProperty('--headerHeight', `${computed}px`);
    applyCcoColumnLayout({ persist: false });
  }

  function resolveDefaultTargetForGroup(groupId) {
    const normalized = String(groupId || '').trim();
    if (!normalized) return 'overviewSection';
    if (normalized === 'reviewsIncidentsSection') {
      return resolveSectionNavTarget(normalized);
    }
    return normalized;
  }

  function refreshSectionVisualState(groupId) {
    const normalized = String(groupId || '').trim();
    const sections = Array.from(document.querySelectorAll('[data-section-group]'));
    sections.forEach((section) => {
      const currentGroup = String(section.getAttribute('data-section-group') || '').trim();
      const isActive = currentGroup === normalized;
      section.classList.toggle('group-active', isActive);
      section.classList.remove('section-motion-enter');
    });

    if (sectionMotionFrame) cancelAnimationFrame(sectionMotionFrame);
    sectionMotionFrame = requestAnimationFrame(() => {
      sections.forEach((section) => {
        const currentGroup = String(section.getAttribute('data-section-group') || '').trim();
        const isActive = currentGroup === normalized;
        if (!isActive || section.classList.contains('hidden')) return;
        section.classList.add('section-motion-enter');
      });
    });
  }

  function syncWorkspaceTheme(groupId) {
    const normalized = String(groupId || '').trim();
    const ccoModeActive =
      normalized === 'ccoWorkspaceSection' || isCcoRoutePath(window.location.pathname || '');
    document.body.classList.toggle('cco-light-mode', ccoModeActive);
    document.body.classList.toggle('cco-compact-header', ccoModeActive);
  }

  function setActiveSectionGroup(nextGroupId, options = {}) {
    const previousGroupId = state.activeSectionGroup;
    const groupId = resolveSectionGroupTarget(nextGroupId);
    const enteringCco =
      String(groupId || '').trim() === 'ccoWorkspaceSection' &&
      String(previousGroupId || '').trim() !== 'ccoWorkspaceSection';
    const leavingCco =
      String(groupId || '').trim() !== 'ccoWorkspaceSection' &&
      String(previousGroupId || '').trim() === 'ccoWorkspaceSection';
    runModeTransition(previousGroupId, groupId);
    state.activeSectionGroup = groupId;
    syncWorkspaceTheme(groupId);
    document.querySelectorAll('[data-section-group]').forEach((section) => {
      const currentGroup = String(section.getAttribute('data-section-group') || '').trim();
      section.classList.toggle('hidden', currentGroup !== groupId);
    });
    refreshSectionVisualState(groupId);

    const targetId = String(options.targetId || resolveDefaultTargetForGroup(groupId)).trim();
    if (targetId) setActiveSectionNav(targetId);
    updateWorkspaceViewportMetrics();
    if (options.syncHash !== false) syncSectionHash(groupId);

    if (options.scroll) {
      const focusEl =
        (targetId && document.getElementById(targetId)) ||
        document.querySelector(`[data-section-group="${groupId}"]`);
      focusEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (enteringCco) {
      state.ccoAdaptiveFocusShowAll = false;
      state.ccoFocusWorkloadMinutes = 0;
      hideCcoSoftBreakPanel();
      postCcoUsageEvent('workspace_open', {
        route: '/cco',
        workspaceId: 'cco',
      });
    }
    if (leavingCco) {
      state.ccoLastSeenAtMs = Date.now();
      state.ccoSeenConversationIds = {};
      persistCcoLastSeenAtMs(state.ccoLastSeenAtMs);
      persistCcoWorkspaceSessionState();
    }
    const shouldImmediateCcoRefresh = isCcoWorkspaceActive() && (enteringCco || !state.ccoInboxData);
    syncCcoAutoRefresh({ immediate: shouldImmediateCcoRefresh });
  }

  function scrollToSection(sectionEl) {
    if (!sectionEl) return;
    setActiveSectionGroup(sectionEl.id, {
      targetId: sectionEl.id,
      scroll: true,
    });
  }

  function resolveSectionNavTarget(targetId) {
    const normalized = String(targetId || '').trim();
    if (!normalized) return '';
    if (normalized === String(els.reviewsIncidentsSection?.id || '')) {
      if (Number(state.riskFilters?.minRiskLevel || 0) >= 4 && els.incidentsQueueSection?.id) {
        return els.incidentsQueueSection.id;
      }
      if (els.reviewsQueueSection?.id) return els.reviewsQueueSection.id;
    }
    return normalized;
  }

  function pruneLegacyCcoUnansweredNavButtons() {
    if (!els.sectionNav) return;
    const legacyButtons = Array.from(
      els.sectionNav.querySelectorAll(
        '.sectionNavBtn[data-target="ccoWorkspaceSection"][data-cco-view="unanswered"], .sectionNavBtn[data-target="ccoWorkspaceSection"][data-i18n="nav_unanswered"]'
      )
    );
    const fallbackByLabel = Array.from(
      els.sectionNav.querySelectorAll('.sectionNavBtn[data-target="ccoWorkspaceSection"]')
    ).filter((button) => {
      const label = String(button.textContent || '').trim().toLowerCase();
      return label === 'obesvarade' || label === 'unanswered';
    });
    const allLegacyButtons = [...legacyButtons, ...fallbackByLabel];
    allLegacyButtons.forEach((button) => button.remove());
  }

  function setActiveSectionNav(targetId) {
    if (!els.sectionNav) return;
    pruneLegacyCcoUnansweredNavButtons();
    const resolvedTargetId = resolveSectionNavTarget(targetId);
    const ccoViewMode = sanitizeCcoViewMode(state.ccoInboxViewMode);
    els.sectionNav.querySelectorAll('.sectionNavBtn').forEach((button) => {
      const currentTarget = String(button.getAttribute('data-target') || '').trim();
      if (!currentTarget || currentTarget !== resolvedTargetId) {
        button.classList.remove('active');
        return;
      }
      if (currentTarget === 'ccoWorkspaceSection') {
        const buttonView = sanitizeCcoViewMode(button.getAttribute('data-cco-view') || 'all');
        button.classList.toggle('active', buttonView === ccoViewMode);
        return;
      }
      button.classList.add('active');
    });
  }

  function resolveInitialSectionGroup() {
    const fromHash = resolveSectionGroupFromHash(window.location.hash || '');
    if (fromHash) return fromHash;
    if (isCcoRoutePath(window.location.pathname || '')) {
      return 'ccoWorkspaceSection';
    }
    return state.activeSectionGroup || 'overviewSection';
  }

  async function applyBulkOwnerAction() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan köra bulk action.');
      const selectedIds = state.selectedRiskIds.filter(Boolean);
      if (!selectedIds.length) throw new Error('Markera minst en riskutvärdering först.');

      const action = String(els.riskBulkAction?.value || '').trim().toLowerCase();
      if (!action) throw new Error('Välj ägaråtgärd.');
      const actionLabel = formatOwnerActionLabel(action);

      const note = String(els.riskBulkNote?.value || '').trim();
      const confirmResult = await openAppModal({
        title: isEnglishLanguage() ? 'Bulk owner action' : 'Massuppdatera ägaråtgärd',
        message: isEnglishLanguage()
          ? `Apply "${actionLabel}" to ${selectedIds.length} selected risk evaluations?`
          : `Applicera "${actionLabel}" på ${selectedIds.length} valda riskutvärderingar?`,
        confirmLabel: 'Applicera',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.riskActionStatus, 'Bulk action avbruten.');
        return;
      }

      setStatus(els.riskActionStatus, `Applicerar ${actionLabel} på ${selectedIds.length} rader...`);
      let success = 0;
      const failures = [];
      for (const evaluationId of selectedIds) {
        try {
          await applyOwnerAction(evaluationId, action, note);
          success += 1;
        } catch (error) {
          failures.push({
            evaluationId,
            message: error.message || 'okänt fel',
          });
        }
      }

      state.selectedRiskIds = [];
      await loadDashboard();

      if (failures.length) {
        const failedPreview = failures
          .slice(0, 3)
          .map((item) => `${item.evaluationId}: ${item.message}`)
          .join(' | ');
        setStatus(
          els.riskActionStatus,
          `Bulk action klar: ${success} OK, ${failures.length} fel. ${failedPreview}`,
          true
        );
      } else {
        setStatus(els.riskActionStatus, `Bulk action klar: ${success}/${selectedIds.length} uppdaterade.`);
      }
    } catch (error) {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte köra bulk action.', true);
    }
  }

  async function applyRiskDetailOwnerAction(button) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan sätta ägaråtgärd.');
      const action = String(button?.getAttribute('data-owner-action') || '')
        .trim()
        .toLowerCase();
      const evaluationId =
        String(button?.getAttribute('data-eid') || '').trim() ||
        String(state.selectedRiskEvaluationId || '').trim();
      if (!action) throw new Error('Saknar ägaråtgärd.');
      if (!evaluationId) throw new Error('Välj en riskutvärdering först.');

      const note = String(els.riskDetailNoteInput?.value || '').trim();
      setStatus(els.riskActionStatus, `Sparar ägaråtgärd (${formatOwnerActionLabel(action)})...`);
      await applyOwnerAction(evaluationId, action, note);
      setStatus(els.riskActionStatus, `Ägaråtgärd sparad: ${formatOwnerActionLabel(action)}.`);
      if (els.riskDetailNoteInput) els.riskDetailNoteInput.value = '';
      await loadDashboard();
      await loadRiskEvaluationDetail(evaluationId);
    } catch (error) {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte spara ägaråtgärd.', true);
    }
  }

  function safeLower(value) {
    return String(value ?? '').toLowerCase();
  }

  function parseEventTimeMs(event) {
    const timeMs = Date.parse(String(event?.ts || ''));
    return Number.isFinite(timeMs) ? timeMs : 0;
  }

  function formatEventTime(value) {
    const date = new Date(value || '');
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleString('sv-SE', { hour12: false });
  }

  function extractAuditRiskLevel(event) {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const candidates = [
      metadata.riskLevel,
      metadata.previewRiskLevel,
      metadata.evaluationRiskLevel,
      metadata.level,
    ];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) {
        return Math.round(parsed);
      }
    }
    const decision = safeLower(metadata.decision || event?.decision || '');
    if (decision === 'blocked') return 4;
    if (decision === 'review_required') return 3;
    if (decision === 'allow') return 1;
    return null;
  }

  function isAuditObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function flattenAuditObject(value, prefix = '', target = {}) {
    if (!isAuditObject(value)) {
      if (prefix) target[prefix] = value;
      return target;
    }
    const keys = Object.keys(value);
    if (!keys.length) {
      if (prefix) target[prefix] = value;
      return target;
    }
    for (const key of keys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const next = value[key];
      if (isAuditObject(next)) {
        flattenAuditObject(next, path, target);
      } else {
        target[path] = next;
      }
    }
    return target;
  }

  function toAuditDiffValue(value) {
    if (value === undefined) return '—';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function areAuditValuesEqual(left, right) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return String(left) === String(right);
    }
  }

  function formatAuditDiffValue(value) {
    const normalized = toAuditDiffValue(value);
    if (normalized.length > 280) {
      return `${normalized.slice(0, 277)}...`;
    }
    return normalized;
  }

  function extractAuditDiffRows(event) {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};

    if (Array.isArray(metadata.diff)) {
      const rows = metadata.diff
        .filter((item) => item && typeof item === 'object' && String(item.field || '').trim())
        .map((item) => ({
          field: String(item.field || '').trim(),
          before: item.before,
          after: item.after,
        }));
      if (rows.length) return rows;
    }

    const hasBeforeAfter = isAuditObject(metadata.before) || isAuditObject(metadata.after);
    if (hasBeforeAfter) {
      const beforeMap = flattenAuditObject(isAuditObject(metadata.before) ? metadata.before : {});
      const afterMap = flattenAuditObject(isAuditObject(metadata.after) ? metadata.after : {});
      const keys = Array.from(new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])).sort((a, b) =>
        a.localeCompare(b)
      );
      const rows = [];
      for (const key of keys) {
        const beforeValue = Object.prototype.hasOwnProperty.call(beforeMap, key) ? beforeMap[key] : undefined;
        const afterValue = Object.prototype.hasOwnProperty.call(afterMap, key) ? afterMap[key] : undefined;
        if (!areAuditValuesEqual(beforeValue, afterValue)) {
          rows.push({
            field: key,
            before: beforeValue,
            after: afterValue,
          });
        }
      }
      if (rows.length) return rows;
    }

    if (isAuditObject(metadata.patch)) {
      const patchRows = Object.keys(metadata.patch).map((field) => ({
        field,
        before: undefined,
        after: metadata.patch[field],
      }));
      if (patchRows.length) return patchRows;
    }

    if (Object.prototype.hasOwnProperty.call(metadata, 'from') || Object.prototype.hasOwnProperty.call(metadata, 'to')) {
      return [
        {
          field: 'value',
          before: metadata.from,
          after: metadata.to,
        },
      ];
    }

    return [];
  }

  function renderAuditDiffRows(rows = []) {
    if (!els.auditDetailDiff || !els.auditDetailDiffMeta) return;
    els.auditDetailDiff.innerHTML = '';

    if (!rows.length) {
      setText(els.auditDetailDiffMeta, 'Ingen strukturerad before/after-diff i denna händelse.');
      const empty = document.createElement('div');
      empty.className = 'audit-diff-row muted mini';
      empty.textContent = 'Ingen diff tillgänglig.';
      els.auditDetailDiff.appendChild(empty);
      return;
    }

    setText(els.auditDetailDiffMeta, `Ändringsdiff (${rows.length})`);
    for (const row of rows) {
      const fieldLabel = String(row?.field || '').trim() || '-';
      const beforeValue = formatAuditDiffValue(row?.before);
      const afterValue = formatAuditDiffValue(row?.after);
      const container = document.createElement('div');
      container.className = 'audit-diff-row';
      container.innerHTML = `
        <div class="audit-diff-row-header">${escapeHtml(fieldLabel)}</div>
        <div class="audit-diff-row-values">
          <span class="audit-diff-value before">${escapeHtml(beforeValue)}</span>
          <span class="audit-diff-arrow">→</span>
          <span class="audit-diff-value after">${escapeHtml(afterValue)}</span>
        </div>
      `;
      els.auditDetailDiff.appendChild(container);
    }
  }

  function renderAuditDetail(event) {
    if (!event) {
      setText(els.auditDetailMeta, 'Ingen audit-händelse vald.');
      if (els.auditDetailFacts) {
        els.auditDetailFacts.innerHTML = '<li>Välj en händelse i listan för detaljer.</li>';
      }
      renderAuditDiffRows([]);
      if (els.auditDetailRaw) {
        els.auditDetailRaw.textContent = 'Ingen audit-händelse vald.';
      }
      return;
    }

    const riskLevel = extractAuditRiskLevel(event);
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const decision = metadata?.decision || '-';
    const outcome = event?.outcome || '-';

    setText(
      els.auditDetailMeta,
      `${event?.action || '-'} • ${formatEventTime(event?.ts)} • ${event?.targetType || '-'}:${event?.targetId || '-'}`
    );

    if (els.auditDetailFacts) {
      const facts = [
        `<li><strong>Event ID:</strong> <span class="code">${escapeHtml(event?.id || '-')}</span></li>`,
        `<li><strong>Actor:</strong> <span class="code">${escapeHtml(event?.actorUserId || '-')}</span></li>`,
        `<li><strong>Outcome:</strong> ${escapeHtml(outcome)}</li>`,
        `<li><strong>Risk:</strong> ${riskLevel ? `L${riskLevel}` : '-'}</li>`,
        `<li><strong>Decision:</strong> ${escapeHtml(decision || '-')}</li>`,
      ];
      const metadataKeys = Object.keys(metadata);
      if (metadataKeys.length) {
        const previewKeys = metadataKeys
          .slice(0, 5)
          .map((key) => `${key}=${JSON.stringify(metadata[key])}`)
          .join(' • ');
        facts.push(`<li><strong>Metadata:</strong> <span class="code">${escapeHtml(previewKeys)}</span></li>`);
      }
      els.auditDetailFacts.innerHTML = facts.join('');
    }

    renderAuditDiffRows(extractAuditDiffRows(event));

    if (els.auditDetailRaw) {
      els.auditDetailRaw.textContent = JSON.stringify(event, null, 2);
    }
  }

  function getAuditSeverityClass(event) {
    const riskLevel = extractAuditRiskLevel(event);
    if (riskLevel === null) return null;
    if (riskLevel >= 4) return 'bad';
    if (riskLevel === 3) return 'warn';
    return 'ok';
  }

  function collectUnique(items, selector) {
    const set = new Set();
    for (const item of items) {
      const value = String(selector(item) || '').trim();
      if (value) set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function renderAuditFilterOptions(events = []) {
    const actions = collectUnique(events, (event) => event?.action);
    const targetTypes = collectUnique(events, (event) => event?.targetType);

    if (els.auditActionFilter) {
      const current = state.auditFilters.action;
      els.auditActionFilter.innerHTML = '<option value="">Alla</option>';
      for (const value of actions) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        els.auditActionFilter.appendChild(option);
      }
      els.auditActionFilter.value = actions.includes(current) ? current : '';
    }

    if (els.auditTargetTypeFilter) {
      const current = state.auditFilters.targetType;
      els.auditTargetTypeFilter.innerHTML = '<option value="">Alla</option>';
      for (const value of targetTypes) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        els.auditTargetTypeFilter.appendChild(option);
      }
      els.auditTargetTypeFilter.value = targetTypes.includes(current) ? current : '';
    }
  }

  function syncAuditFilterInputs() {
    if (els.auditSearchInput) els.auditSearchInput.value = state.auditFilters.search;
    if (els.auditActorFilter) els.auditActorFilter.value = state.auditFilters.actorUserId;
    if (els.auditOutcomeFilter) els.auditOutcomeFilter.value = state.auditFilters.outcome;
    if (els.auditSeverityFilter) els.auditSeverityFilter.value = state.auditFilters.severity;
    if (els.auditSinceDaysFilter) els.auditSinceDaysFilter.value = String(state.auditFilters.sinceDays);
    if (els.auditLimitFilter) els.auditLimitFilter.value = String(state.auditFilters.limit);
  }

  function readAuditFiltersFromInputs() {
    const sinceDays = Number.parseInt(String(els.auditSinceDaysFilter?.value || state.auditFilters.sinceDays), 10);
    const limit = Number.parseInt(String(els.auditLimitFilter?.value || state.auditFilters.limit), 10);
    state.auditFilters = {
      search: String(els.auditSearchInput?.value || '').trim(),
      action: String(els.auditActionFilter?.value || '').trim(),
      actorUserId: String(els.auditActorFilter?.value || '').trim(),
      targetType: String(els.auditTargetTypeFilter?.value || '').trim(),
      outcome: String(els.auditOutcomeFilter?.value || '').trim(),
      severity: String(els.auditSeverityFilter?.value || '').trim(),
      sinceDays: Number.isFinite(sinceDays) ? Math.max(0, Math.min(365, sinceDays)) : 14,
      limit: Number.isFinite(limit) ? Math.max(50, Math.min(500, limit)) : 200,
    };
    persistAuditFilters();
  }

  function filterAuditEvents(events = []) {
    const now = Date.now();
    const search = safeLower(state.auditFilters.search);
    const action = safeLower(state.auditFilters.action);
    const actorUserId = safeLower(state.auditFilters.actorUserId);
    const targetType = safeLower(state.auditFilters.targetType);
    const outcome = safeLower(state.auditFilters.outcome);
    const severity = safeLower(state.auditFilters.severity);
    const sinceDays = Number(state.auditFilters.sinceDays || 0);
    const sinceMs = sinceDays > 0 ? now - sinceDays * 24 * 60 * 60 * 1000 : 0;

    const filtered = events.filter((event) => {
      const eventAction = safeLower(event?.action);
      const eventOutcome = safeLower(event?.outcome);
      const eventActor = safeLower(event?.actorUserId);
      const eventTargetType = safeLower(event?.targetType);
      const eventTargetId = safeLower(event?.targetId);
      const metadataRaw = safeLower(JSON.stringify(event?.metadata || {}));
      const riskLevel = extractAuditRiskLevel(event);
      const ts = parseEventTimeMs(event);

      if (action && eventAction !== action) return false;
      if (outcome && eventOutcome !== outcome) return false;
      if (actorUserId && !eventActor.includes(actorUserId)) return false;
      if (targetType && eventTargetType !== targetType) return false;
      if (sinceMs > 0 && ts > 0 && ts < sinceMs) return false;
      if (search) {
        const haystack = `${eventAction} ${eventOutcome} ${eventActor} ${eventTargetType} ${eventTargetId} ${metadataRaw}`;
        if (!haystack.includes(search)) return false;
      }
      if (severity === 'none' && riskLevel !== null) return false;
      if (severity === 'low' && !(riskLevel !== null && riskLevel <= 2)) return false;
      if (severity === 'moderate' && riskLevel !== 3) return false;
      if (severity === 'high_critical' && !(riskLevel !== null && riskLevel >= 4)) return false;
      return true;
    });

    filtered.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    return filtered;
  }

  function renderAuditSummary(visibleEvents = []) {
    if (!els.auditSummary) return;
    const success = visibleEvents.filter((event) => safeLower(event?.outcome) === 'success').length;
    const error = visibleEvents.filter((event) => safeLower(event?.outcome) === 'error').length;
    const highCritical = visibleEvents.filter((event) => {
      const riskLevel = extractAuditRiskLevel(event);
      return riskLevel !== null && riskLevel >= 4;
    }).length;

    els.auditSummary.innerHTML = '';
    const badges = [
      { label: isEnglishLanguage() ? 'Loaded' : 'Laddade', value: state.auditEvents.length, dot: 'ok' },
      { label: isEnglishLanguage() ? 'Visible' : 'Visade', value: visibleEvents.length, dot: 'info' },
      { label: isEnglishLanguage() ? 'Success' : 'Lyckade', value: success, dot: 'ok' },
      { label: isEnglishLanguage() ? 'Errors' : 'Fel', value: error, dot: error > 0 ? 'bad' : 'ok' },
      { label: 'L4-L5', value: highCritical, dot: highCritical > 0 ? 'bad' : 'ok' },
    ];

    for (const badge of badges) {
      const item = document.createElement('span');
      item.className = 'badge';
      const dotClass = badge.dot === 'bad' ? 'bad' : badge.dot === 'warn' ? 'warn' : 'ok';
      item.innerHTML = `<span class="dot ${dotClass}"></span>${badge.label}: <strong>${badge.value}</strong>`;
      els.auditSummary.appendChild(item);
    }
  }

  function renderAuditTimeline(events = []) {
    if (!els.auditTimeline) return;
    saveListScrollPosition('auditTimeline', els.auditTimeline);
    els.auditTimeline.innerHTML = '';

    if (!events.length) {
      const empty = document.createElement('li');
      empty.className = 'audit-timeline-item muted mini';
      empty.textContent = 'Ingen audit-händelse matchar filtret.';
      els.auditTimeline.appendChild(empty);
      renderAuditDetail(null);
      restoreListScrollPosition('auditTimeline', els.auditTimeline);
      return;
    }

    const existingSelected = events.find((event) => event?.id === state.selectedAuditEventId);
    if (!existingSelected) {
      state.selectedAuditEventId = String(events[0]?.id || '');
    }

    for (const event of events) {
      const isActive = String(event?.id || '') === state.selectedAuditEventId;
      const severityClass = getAuditSeverityClass(event);
      const li = document.createElement('li');
      li.className = `audit-timeline-item${isActive ? ' active' : ''}`;
      li.setAttribute('data-aid', String(event?.id || ''));
      li.innerHTML = `
        <div class="audit-timeline-item-title">
          ${severityClass ? `<span class="dot ${severityClass}"></span>` : ''}
          <span>${escapeHtml(event?.action || '-')}</span>
          <span class="mini muted">${escapeHtml(formatStatusLabel(event?.outcome || '-'))}</span>
        </div>
        <div class="mini muted">${escapeHtml(formatEventTime(event?.ts))}</div>
        <div class="mini code">${escapeHtml(event?.targetType || '-')}:${escapeHtml(event?.targetId || '-')}</div>
      `;
      els.auditTimeline.appendChild(li);
    }

    const selected = events.find((event) => String(event?.id || '') === state.selectedAuditEventId) || events[0];
    renderAuditDetail(selected);
    restoreListScrollPosition('auditTimeline', els.auditTimeline);
  }

  function applyAuditFiltersAndRender() {
    const filtered = filterAuditEvents(state.auditEvents);
    renderAuditSummary(filtered);
    renderAuditTimeline(filtered);
  }

  async function loadAuditEvents() {
    const limit = Number.isFinite(Number(state.auditFilters.limit))
      ? Math.max(50, Math.min(500, Number(state.auditFilters.limit)))
      : 200;
    const response = await api(`/audit/events?limit=${encodeURIComponent(limit)}`);
    const events = Array.isArray(response?.events) ? response.events : [];
    state.auditEvents = events;
    renderAuditFilterOptions(events);
    syncAuditFilterInputs();
    applyAuditFiltersAndRender();
  }

  function renderStaffTable(members) {
    if (!els.staffTableBody) return;
    readStaffFiltersFromInputs();
    renderTeamSummary(members);
    els.staffTableBody.innerHTML = '';
    const owner = isOwner();
    const filteredMembers = getFilteredStaffMembers(Array.isArray(members) ? members : []);
    state.filteredStaffMembershipIds = filteredMembers
      .map((item) => String(item?.membership?.id || ''))
      .filter(Boolean);
    const tenantMembers = Array.isArray(state.staffMembers) ? state.staffMembers : [];
    const activeOwnerCount = tenantMembers.filter(
      (item) => item?.membership?.role === 'OWNER' && item?.membership?.status === 'active'
    ).length;
    const currentMembershipId = String(state.profile?.membership?.id || '').trim();

    const hasSelectedMembership = filteredMembers.some(
      (item) => String(item?.membership?.id || '') === state.selectedStaffMembershipId
    );
    if (!hasSelectedMembership && !getStaffMemberByMembershipId(state.selectedStaffMembershipId)) {
      state.selectedStaffMembershipId = '';
    }

    if (filteredMembers.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="muted">Inga staff-medlemmar matchar filtret.</td>';
      els.staffTableBody.appendChild(tr);
      renderSelectedStaffProfile();
      return;
    }

    for (const item of filteredMembers) {
      const email = item?.user?.email || '-';
      const roleRaw = item?.membership?.role || '-';
      const statusRaw = item?.membership?.status || '-';
      const role = formatRoleLabel(roleRaw);
      const status = formatStatusLabel(statusRaw);
      const membershipId = item?.membership?.id || '';
      const isOwnerMembership = String(roleRaw).toUpperCase() === 'OWNER';
      const isCurrentMembership = Boolean(
        membershipId && currentMembershipId && membershipId === currentMembershipId
      );
      const canDemoteOwner = isOwnerMembership && activeOwnerCount > 1 && !isCurrentMembership;
      const updatedAt = formatDateTime(item?.membership?.updatedAt || item?.user?.updatedAt);
      const isSelected = Boolean(
        membershipId && state.selectedStaffMembershipId && membershipId === state.selectedStaffMembershipId
      );
      const actionControls = isOwnerMembership
        ? canDemoteOwner
          ? `<button class="btn small staffRoleBtn" data-mid="${membershipId}" data-role="STAFF">${
              isEnglishLanguage() ? 'Demote STAFF' : 'Sänk till MEDARBETARE'
            }</button>`
          : `<span class="mini muted">${isEnglishLanguage() ? 'Locked' : 'Låst'}</span>`
        : `<button class="btn small staffToggleBtn" data-mid="${membershipId}" data-next="${
            statusRaw === 'active' ? 'disabled' : 'active'
          }">${
            statusRaw === 'active'
              ? isEnglishLanguage()
                ? 'Disable'
                : 'Inaktivera'
              : isEnglishLanguage()
              ? 'Enable'
              : 'Aktivera'
          }</button>
           <button class="btn small staffRoleBtn" data-mid="${membershipId}" data-role="OWNER">${
             isEnglishLanguage() ? 'Promote OWNER' : 'Befordra till ÄGARE'
           }</button>
           <button class="btn small staffResetPwdBtn" data-mid="${membershipId}">${
             isEnglishLanguage() ? 'Reset password' : 'Återställ lösenord'
           }</button>`;

      const tr = document.createElement('tr');
      if (isSelected) tr.classList.add('staff-row-active');
      tr.innerHTML = `
        <td>${email}</td>
        <td>${role}</td>
        <td>${status}</td>
        <td class="mini">${updatedAt}</td>
        <td>
          <div class="seg">
            <button class="btn small staffSelectBtn" data-mid="${membershipId}">${
              isEnglishLanguage() ? 'Profile' : 'Profil'
            }</button>
            ${actionControls}
          </div>
        </td>
      `;
      els.staffTableBody.appendChild(tr);
    }

    els.staffTableBody.querySelectorAll('.staffSelectBtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const membershipId = btn.getAttribute('data-mid') || '';
        selectStaffMember(membershipId);
      });
    });

    els.staffTableBody.querySelectorAll('.staffToggleBtn').forEach((btn) => {
      btn.disabled = !owner;
      btn.addEventListener('click', async () => {
        const membershipId = btn.getAttribute('data-mid');
        const nextStatus = btn.getAttribute('data-next');
        if (!membershipId || !nextStatus) return;
        try {
          setStatus(els.staffStatus, 'Uppdaterar medarbetarstatus...');
          await api(`/users/staff/${membershipId}`, {
            method: 'PATCH',
            body: { status: nextStatus },
          });
          setStatus(
            els.staffStatus,
            `${isEnglishLanguage() ? 'Member status updated to' : 'Medarbetarstatus uppdaterad till'} ${formatStatusLabel(nextStatus)}.`
          );
          await loadStaffMembers();
          await loadDashboard();
        } catch (error) {
          setStatus(els.staffStatus, error.message || 'Kunde inte uppdatera medarbetarstatus.', true);
        }
      });
    });

    els.staffTableBody.querySelectorAll('.staffResetPwdBtn').forEach((btn) => {
      btn.disabled = !owner;
      btn.addEventListener('click', async () => {
        const membershipId = btn.getAttribute('data-mid') || '';
        if (!membershipId) return;
        await resetStaffPasswordFlow(membershipId);
      });
    });

    els.staffTableBody.querySelectorAll('.staffRoleBtn').forEach((btn) => {
      btn.disabled = !owner;
      btn.addEventListener('click', async () => {
        const membershipId = btn.getAttribute('data-mid') || '';
        const nextRole = btn.getAttribute('data-role') || '';
        if (!membershipId || !nextRole) return;
        await updateStaffRole(membershipId, nextRole);
      });
    });

    renderSelectedStaffProfile();
  }

  function renderSessionsTable(entries = [], currentSessionId = '') {
    if (!els.sessionsTableBody) return;
    els.sessionsTableBody.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="muted">Inga sessioner hittades.</td>';
      els.sessionsTableBody.appendChild(tr);
      return;
    }

    for (const entry of entries) {
      const session = entry?.session || entry || {};
      const sessionId = session?.id || '';
      const isCurrent = currentSessionId && sessionId === currentSessionId;
      const statusRaw = session?.revokedAt ? 'revoked' : 'active';
      const status = formatStatusLabel(statusRaw);
      const userEmail = entry?.user?.email || '-';
      const role = formatRoleLabel(entry?.membership?.role || session?.role || '-');
      const lastSeen = session?.lastSeenAt || session?.createdAt || '-';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="code">${escapeHtml(sessionId || '-')} ${
          isCurrent ? `<span class="chip">${isEnglishLanguage() ? 'current' : 'aktuell'}</span>` : ''
        }</td>
        <td>${escapeHtml(userEmail)}</td>
        <td>${escapeHtml(role)}</td>
        <td class="mini">${escapeHtml(lastSeen)}</td>
        <td>${escapeHtml(status)}</td>
        <td>
          ${
            statusRaw === 'active'
              ? `<button class="btn small revokeSessionBtn" data-session-id="${escapeHtml(sessionId)}" ${
                  isCurrent ? `title="${isEnglishLanguage() ? 'Current session' : 'Aktuell session'}"` : ''
                }>${isCurrent ? (isEnglishLanguage() ? 'Sign out this' : 'Logga ut denna') : isEnglishLanguage() ? 'Revoke' : 'Avsluta'}</button>`
              : '<span class="mini muted">-</span>'
          }
        </td>
      `;
      els.sessionsTableBody.appendChild(tr);
    }

    const canManage = canTemplateWrite();
    els.sessionsTableBody.querySelectorAll('.revokeSessionBtn').forEach((btn) => {
      btn.disabled = !canManage;
      btn.addEventListener('click', async () => {
        const sessionId = btn.getAttribute('data-session-id') || '';
        if (!sessionId) return;
        await revokeSessionById(sessionId);
      });
    });
  }

  async function loadSessionsPanel() {
    if (!canTemplateWrite()) {
      state.sessions = [];
      renderSessionsTable([], '');
      return;
    }

    try {
      let scope = String(els.sessionsScopeSelect?.value || 'me').trim().toLowerCase();
      if (!isOwner() && scope === 'tenant') {
        scope = 'me';
        if (els.sessionsScopeSelect) els.sessionsScopeSelect.value = 'me';
      }
      const includeRevoked = Boolean(els.sessionsIncludeRevoked?.checked);

      setStatus(els.sessionsStatus, 'Laddar sessioner...');
      const query = new URLSearchParams({
        scope,
        includeRevoked: includeRevoked ? '1' : '0',
        limit: '100',
      });
      const response = await api(`/auth/sessions?${query.toString()}`);

      state.sessions = Array.isArray(response?.sessions) ? response.sessions : [];
      renderSessionsTable(state.sessions, response?.currentSessionId || '');
      setStatus(
        els.sessionsStatus,
        `Sessioner: ${response?.count ?? state.sessions.length} (scope: ${response?.scope || scope})`
      );
    } catch (error) {
      state.sessions = [];
      renderSessionsTable([], '');
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    }
  }

  async function revokeSessionById(sessionId) {
    if (!sessionId) return;
    const confirmResult = await openAppModal({
      title: 'Avsluta session',
      message: 'Avsluta vald session direkt?',
      confirmLabel: 'Avsluta',
      cancelLabel: 'Avbryt',
      confirmTone: 'danger',
    });
    if (!confirmResult.confirmed) return;

    try {
      setStatus(els.sessionsStatus, 'Avslutar session...');
      const response = await api(`/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: 'POST',
        body: {
          reason: 'owner_panel_revoke',
        },
      });
      if (response?.currentSessionRevoked) {
        setStatus(els.sessionsStatus, 'Nuvarande session avslutades. Loggar ut...');
        logout();
        return;
      }
      setStatus(els.sessionsStatus, 'Session avslutad.');
      await loadSessionsPanel();
    } catch (error) {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte avsluta session.', true);
    }
  }

  function getPublicSiteConfigFromTenantConfig(config) {
    const source = config?.publicSite && typeof config.publicSite === 'object'
      ? config.publicSite
      : {};
    return {
      clinicName: String(source.clinicName || ''),
      city: String(source.city || ''),
      tagline: String(source.tagline || ''),
      heroTitle: String(source.heroTitle || ''),
      heroSubtitle: String(source.heroSubtitle || ''),
      primaryCtaLabel: String(source.primaryCtaLabel || ''),
      primaryCtaUrl: String(source.primaryCtaUrl || ''),
      secondaryCtaLabel: String(source.secondaryCtaLabel || ''),
      secondaryCtaUrl: String(source.secondaryCtaUrl || ''),
      trustRating: clampNumber(source.trustRating, 0, 5, 0),
      trustReviewCount: Math.round(clampNumber(source.trustReviewCount, 0, 100000, 0)),
      trustSurgeons: Math.round(clampNumber(source.trustSurgeons, 0, 100, 0)),
      contactPhone: String(source.contactPhone || ''),
      contactEmail: String(source.contactEmail || ''),
      contactAddress: String(source.contactAddress || ''),
      contactBookingUrl: String(source.contactBookingUrl || ''),
      themeAccent: String(source.themeAccent || ''),
      themeAccentSoft: String(source.themeAccentSoft || ''),
      themeCanvasFrom: String(source.themeCanvasFrom || ''),
      themeCanvasTo: String(source.themeCanvasTo || ''),
      services: Array.isArray(source.services) ? source.services : [],
    };
  }

  function fillPublicSiteConfigInputs(publicSite) {
    if (els.publicSiteClinicName) els.publicSiteClinicName.value = publicSite.clinicName || '';
    if (els.publicSiteCity) els.publicSiteCity.value = publicSite.city || '';
    if (els.publicSiteTagline) els.publicSiteTagline.value = publicSite.tagline || '';
    if (els.publicSiteHeroTitle) els.publicSiteHeroTitle.value = publicSite.heroTitle || '';
    if (els.publicSiteHeroSubtitle) els.publicSiteHeroSubtitle.value = publicSite.heroSubtitle || '';
    if (els.publicSitePrimaryCtaLabel) {
      els.publicSitePrimaryCtaLabel.value = publicSite.primaryCtaLabel || '';
    }
    if (els.publicSitePrimaryCtaUrl) els.publicSitePrimaryCtaUrl.value = publicSite.primaryCtaUrl || '';
    if (els.publicSiteSecondaryCtaLabel) {
      els.publicSiteSecondaryCtaLabel.value = publicSite.secondaryCtaLabel || '';
    }
    if (els.publicSiteSecondaryCtaUrl) {
      els.publicSiteSecondaryCtaUrl.value = publicSite.secondaryCtaUrl || '';
    }
    if (els.publicSiteTrustRating) {
      els.publicSiteTrustRating.value = formatCompactNumber(publicSite.trustRating, 1);
    }
    if (els.publicSiteTrustReviewCount) {
      els.publicSiteTrustReviewCount.value = String(publicSite.trustReviewCount || 0);
    }
    if (els.publicSiteTrustSurgeons) {
      els.publicSiteTrustSurgeons.value = String(publicSite.trustSurgeons || 0);
    }
    if (els.publicSiteContactPhone) els.publicSiteContactPhone.value = publicSite.contactPhone || '';
    if (els.publicSiteContactEmail) els.publicSiteContactEmail.value = publicSite.contactEmail || '';
    if (els.publicSiteContactAddress) els.publicSiteContactAddress.value = publicSite.contactAddress || '';
    if (els.publicSiteContactBookingUrl) {
      els.publicSiteContactBookingUrl.value = publicSite.contactBookingUrl || '';
    }
    if (els.publicSiteThemeAccent) els.publicSiteThemeAccent.value = publicSite.themeAccent || '';
    if (els.publicSiteThemeAccentSoft) {
      els.publicSiteThemeAccentSoft.value = publicSite.themeAccentSoft || '';
    }
    if (els.publicSiteThemeCanvasFrom) {
      els.publicSiteThemeCanvasFrom.value = publicSite.themeCanvasFrom || '';
    }
    if (els.publicSiteThemeCanvasTo) els.publicSiteThemeCanvasTo.value = publicSite.themeCanvasTo || '';
    if (els.publicSiteServicesJson) {
      els.publicSiteServicesJson.value = toPrettyJsonAny(publicSite.services, '[]');
    }
  }

  function buildPublicSitePayloadFromInputs() {
    return {
      clinicName: String(els.publicSiteClinicName?.value || '').trim(),
      city: String(els.publicSiteCity?.value || '').trim(),
      tagline: String(els.publicSiteTagline?.value || '').trim(),
      heroTitle: String(els.publicSiteHeroTitle?.value || '').trim(),
      heroSubtitle: String(els.publicSiteHeroSubtitle?.value || '').trim(),
      primaryCtaLabel: String(els.publicSitePrimaryCtaLabel?.value || '').trim(),
      primaryCtaUrl: String(els.publicSitePrimaryCtaUrl?.value || '').trim(),
      secondaryCtaLabel: String(els.publicSiteSecondaryCtaLabel?.value || '').trim(),
      secondaryCtaUrl: String(els.publicSiteSecondaryCtaUrl?.value || '').trim(),
      trustRating: clampNumber(els.publicSiteTrustRating?.value, 0, 5, 0),
      trustReviewCount: Math.round(clampNumber(els.publicSiteTrustReviewCount?.value, 0, 100000, 0)),
      trustSurgeons: Math.round(clampNumber(els.publicSiteTrustSurgeons?.value, 0, 100, 0)),
      contactPhone: String(els.publicSiteContactPhone?.value || '').trim(),
      contactEmail: String(els.publicSiteContactEmail?.value || '').trim(),
      contactAddress: String(els.publicSiteContactAddress?.value || '').trim(),
      contactBookingUrl: String(els.publicSiteContactBookingUrl?.value || '').trim(),
      themeAccent: String(els.publicSiteThemeAccent?.value || '').trim(),
      themeAccentSoft: String(els.publicSiteThemeAccentSoft?.value || '').trim(),
      themeCanvasFrom: String(els.publicSiteThemeCanvasFrom?.value || '').trim(),
      themeCanvasTo: String(els.publicSiteThemeCanvasTo?.value || '').trim(),
      services: parseJsonArrayInput(
        els.publicSiteServicesJson?.value,
        'publicSite.services'
      ),
    };
  }

  function fillTenantConfig(config) {
    const publicSite = getPublicSiteConfigFromTenantConfig(config);
    els.assistantName.value = config.assistantName || '';
    els.toneStyle.value = config.toneStyle || '';
    els.brandProfile.value = config.brandProfile || '';
    if (els.brandLogoUrl) {
      els.brandLogoUrl.value = String(config?.brandLogoUrl || '').trim();
    }
    if (els.brandPrimaryColor) {
      els.brandPrimaryColor.value = normalizeBrandColorForUi(
        config?.brandPrimaryColor,
        BRAND_PRIMARY_COLORS,
        DEFAULT_BRAND_PRIMARY_COLOR
      );
    }
    if (els.brandAccentColor) {
      els.brandAccentColor.value = normalizeBrandColorForUi(
        config?.brandAccentColor,
        BRAND_ACCENT_COLORS,
        DEFAULT_BRAND_ACCENT_COLOR
      );
    }
    const normalizedModifier = normalizeRiskModifier(config.riskSensitivityModifier ?? 0);
    els.riskModifier.value = String(normalizedModifier);
    if (els.riskModifierRange) {
      els.riskModifierRange.value = String(normalizedModifier);
    }
    if (els.templateEmailSignature) {
      els.templateEmailSignature.value = String(
        config?.templateSignaturesByChannel?.email || ''
      );
    }
    if (els.templateAllowlistOverrides) {
      els.templateAllowlistOverrides.value = toPrettyJson(
        config?.templateVariableAllowlistByCategory || {}
      );
    }
    if (els.templateRequiredOverrides) {
      els.templateRequiredOverrides.value = toPrettyJson(
        config?.templateRequiredVariablesByCategory || {}
      );
    }
    fillPublicSiteConfigInputs(publicSite);

    const canEdit = isOwner();
    [
      els.assistantName,
      els.toneStyle,
      els.brandProfile,
      els.brandLogoUrl,
      els.brandPrimaryColor,
      els.brandAccentColor,
      els.riskModifier,
      els.riskModifierRange,
      els.templateEmailSignature,
      els.templateAllowlistOverrides,
      els.templateRequiredOverrides,
      els.publicSiteClinicName,
      els.publicSiteCity,
      els.publicSiteTagline,
      els.publicSiteHeroTitle,
      els.publicSiteHeroSubtitle,
      els.publicSitePrimaryCtaLabel,
      els.publicSitePrimaryCtaUrl,
      els.publicSiteSecondaryCtaLabel,
      els.publicSiteSecondaryCtaUrl,
      els.publicSiteTrustRating,
      els.publicSiteTrustReviewCount,
      els.publicSiteTrustSurgeons,
      els.publicSiteContactPhone,
      els.publicSiteContactEmail,
      els.publicSiteContactAddress,
      els.publicSiteContactBookingUrl,
      els.publicSiteThemeAccent,
      els.publicSiteThemeAccentSoft,
      els.publicSiteThemeCanvasFrom,
      els.publicSiteThemeCanvasTo,
      els.publicSiteServicesJson,
      els.saveTenantConfigBtn,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !canEdit;
    });
    if (els.tonePresetButtons) {
      els.tonePresetButtons.querySelectorAll('.tonePresetBtn').forEach((button) => {
        button.disabled = !canEdit;
      });
    }
    renderTonePreview();
  }

  function getSelectedVersionSnapshot() {
    if (!state.selectedVersionId) return null;
    return state.versions.find((item) => item.id === state.selectedVersionId) || null;
  }

  function formatRevisionOptionLabel(revision) {
    const revisionNo = Number(revision?.revision || 0);
    const source = String(revision?.source || '').trim() || '-';
    const createdAt = formatDateTime(revision?.createdAt || '', true);
    return `r${revisionNo} · ${source} · ${createdAt}`;
  }

  function renderRevisionControls() {
    const revisions = Array.isArray(state.versionRevisions) ? state.versionRevisions : [];
    const optionRows = revisions
      .map((item) => ({
        revision: Number(item?.revision || 0),
        label: formatRevisionOptionLabel(item),
      }))
      .filter((item) => Number.isFinite(item.revision) && item.revision > 0);

    const revisionSet = new Set(optionRows.map((item) => item.revision));
    const latestRevision = optionRows.length ? optionRows[optionRows.length - 1].revision : null;
    const previousRevision = optionRows.length > 1 ? optionRows[optionRows.length - 2].revision : latestRevision;

    if (!revisionSet.has(Number(state.selectedRevisionTo || 0))) {
      state.selectedRevisionTo = latestRevision;
    }
    if (!revisionSet.has(Number(state.selectedRevisionFrom || 0))) {
      state.selectedRevisionFrom = previousRevision;
    }
    if (!revisionSet.has(Number(state.selectedRollbackRevision || 0))) {
      state.selectedRollbackRevision = previousRevision || latestRevision;
    }

    const renderSelect = (selectEl, selectedValue) => {
      if (!selectEl) return;
      selectEl.innerHTML = '';
      if (!optionRows.length) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-';
        selectEl.appendChild(emptyOption);
        return;
      }
      optionRows.forEach((row) => {
        const option = document.createElement('option');
        option.value = String(row.revision);
        option.textContent = row.label;
        if (Number(selectedValue || 0) === row.revision) {
          option.selected = true;
        }
        selectEl.appendChild(option);
      });
    };

    renderSelect(els.revisionFromSelect, state.selectedRevisionFrom);
    renderSelect(els.revisionToSelect, state.selectedRevisionTo);
    renderSelect(els.rollbackRevisionSelect, state.selectedRollbackRevision);

    if (els.revisionSummary) {
      if (!optionRows.length) {
        els.revisionSummary.textContent = 'Ingen revisionsdata ännu.';
      } else {
        const selectedTo = Number(state.selectedRevisionTo || latestRevision || 0);
        const selectedRollback = Number(state.selectedRollbackRevision || 0);
        els.revisionSummary.textContent = `Revisioner: ${optionRows.length} · aktuell r${selectedTo} · rollback-target r${selectedRollback || '-'}`;
      }
    }
    updateLifecyclePermissions();
  }

  function clearRevisionPanel({
    statusText = '',
    summaryText = 'Ingen revisionsdata ännu.',
    diffText = 'Välj en version för att ladda revisioner.',
  } = {}) {
    state.versionRevisions = [];
    state.selectedRevisionFrom = null;
    state.selectedRevisionTo = null;
    state.selectedRollbackRevision = null;
    if (els.revisionFromSelect) els.revisionFromSelect.innerHTML = '<option value="">-</option>';
    if (els.revisionToSelect) els.revisionToSelect.innerHTML = '<option value="">-</option>';
    if (els.rollbackRevisionSelect) els.rollbackRevisionSelect.innerHTML = '<option value="">-</option>';
    if (els.rollbackRevisionNoteInput) els.rollbackRevisionNoteInput.value = '';
    setText(els.revisionStatus, statusText);
    setText(els.revisionSummary, summaryText);
    setText(els.revisionDiffBlock, diffText);
    updateLifecyclePermissions();
  }

  async function loadVersionRevisions({ silent = false } = {}) {
    if (!state.selectedTemplateId || !state.selectedVersionId) {
      clearRevisionPanel();
      return;
    }
    try {
      if (!silent) setStatus(els.revisionStatus, 'Laddar revisionshistorik...');
      const response = await api(
        `/templates/${encodeURIComponent(state.selectedTemplateId)}/versions/${encodeURIComponent(
          state.selectedVersionId
        )}/revisions?limit=80`
      );
      state.versionRevisions = Array.isArray(response?.revisions) ? response.revisions : [];
      renderRevisionControls();
      if (!silent) {
        setStatus(
          els.revisionStatus,
          `Revisionshistorik laddad (${state.versionRevisions.length}).`
        );
      }
    } catch (error) {
      clearRevisionPanel({
        statusText: '',
        summaryText: 'Kunde inte läsa revisionshistorik.',
        diffText: 'Ingen diff tillgänglig.',
      });
      setStatus(
        els.revisionStatus,
        error.message || 'Kunde inte läsa revisionshistorik.',
        true
      );
    }
  }

  async function loadRevisionDiff() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj template/version först.');
      }
      const fromRevision = parseRevisionNumber(els.revisionFromSelect?.value);
      const toRevision = parseRevisionNumber(els.revisionToSelect?.value);
      if (!toRevision) throw new Error('Välj revision att jämföra mot.');

      state.selectedRevisionFrom = fromRevision;
      state.selectedRevisionTo = toRevision;

      setStatus(els.revisionStatus, 'Laddar revision-diff...');
      const query = new URLSearchParams();
      if (fromRevision) query.set('from', String(fromRevision));
      query.set('to', String(toRevision));
      const response = await api(
        `/templates/${encodeURIComponent(state.selectedTemplateId)}/versions/${encodeURIComponent(
          state.selectedVersionId
        )}/revisions/diff?${query.toString()}`
      );

      const rows = Array.isArray(response?.diff) ? response.diff : [];
      if (!rows.length) {
        setText(
          els.revisionDiffBlock,
          `Diff r${response?.fromRevision || 0} -> r${response?.toRevision || toRevision}: inga fältskillnader.`
        );
        setStatus(els.revisionStatus, 'Diff klar (inga ändringar).');
        return;
      }

      const lines = [
        `Diff r${response?.fromRevision || 0} -> r${response?.toRevision || toRevision} (${rows.length} ändringar)`,
        '',
      ];
      rows.forEach((row, index) => {
        const field = String(row?.field || `field_${index + 1}`);
        let beforeValue = '';
        let afterValue = '';
        try {
          beforeValue = JSON.stringify(row?.before ?? null);
        } catch {
          beforeValue = String(row?.before ?? '');
        }
        try {
          afterValue = JSON.stringify(row?.after ?? null);
        } catch {
          afterValue = String(row?.after ?? '');
        }
        lines.push(`${index + 1}. ${field}`);
        lines.push(`   before: ${beforeValue}`);
        lines.push(`   after : ${afterValue}`);
      });
      setText(els.revisionDiffBlock, lines.join('\n'));
      setStatus(els.revisionStatus, `Diff klar (${rows.length} ändringar).`);
    } catch (error) {
      setStatus(els.revisionStatus, error.message || 'Kunde inte läsa revision-diff.', true);
    }
  }

  async function rollbackRevision() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan rollbacka revisioner.');
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj template/version först.');
      }
      const targetRevision = parseRevisionNumber(els.rollbackRevisionSelect?.value);
      if (!targetRevision) throw new Error('Välj revision att rollbacka till.');
      const currentVersion = getSelectedVersionSnapshot();
      const expectedRevision = parseRevisionNumber(currentVersion?.revision);

      const confirmResult = await openAppModal({
        title: 'Rollback draft-revision',
        message: `Återställ draft till revision r${targetRevision}?`,
        confirmLabel: 'Rollback',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.revisionStatus, 'Rollback avbruten.');
        return;
      }

      const note = String(els.rollbackRevisionNoteInput?.value || '').trim();
      const headers = {};
      const ifMatch = buildRevisionEtag(expectedRevision);
      if (ifMatch) headers['If-Match'] = ifMatch;

      setStatus(els.revisionStatus, `Rollback till r${targetRevision} pågår...`);
      const response = await api(
        `/templates/${encodeURIComponent(state.selectedTemplateId)}/versions/${encodeURIComponent(
          state.selectedVersionId
        )}/revisions/${encodeURIComponent(String(targetRevision))}/rollback`,
        {
          method: 'POST',
          headers,
          body: {
            note,
            expectedRevision: expectedRevision || undefined,
          },
        }
      );
      if (els.rollbackRevisionNoteInput) els.rollbackRevisionNoteInput.value = '';
      const newRevision = Number(response?.version?.revision || 0);
      setStatus(
        els.revisionStatus,
        `Rollback klar: r${targetRevision} återställd (ny revision r${newRevision || '-'})`
      );
      await loadDashboard();
      await loadTemplates({ preserveSelection: true });
      if (response?.version?.id) {
        await selectVersion(response.version.id);
      }
    } catch (error) {
      setStatus(els.revisionStatus, error.message || 'Kunde inte rollbacka revision.', true);
    }
  }

  function clearVersionEditor() {
    state.selectedVersionId = '';
    state.lastVariableValidation = null;
    setText(els.selectedVersionMeta, 'Ingen version vald.');
    if (els.versionTitleInput) els.versionTitleInput.value = '';
    if (els.versionContentInput) els.versionContentInput.value = '';
    if (els.versionRiskBlock) els.versionRiskBlock.textContent = '';
    clearRevisionPanel();
    renderTemplateEditorAssist();
    updateLifecyclePermissions();
  }

  async function loadTemplateMeta({ force = false } = {}) {
    const hasMeta = Array.isArray(state.templateMeta?.categories) && state.templateMeta.categories.length > 0;
    const sameTenant = state.templateMetaTenantId && state.templateMetaTenantId === state.tenantId;
    if (!force && hasMeta && sameTenant) {
      renderTemplateCategoryOptions();
      renderTemplateEditorAssist();
      return state.templateMeta;
    }

    const response = await api('/templates/meta');
    state.templateMeta = {
      categories: Array.isArray(response?.categories) ? response.categories : [],
      variableWhitelist:
        response?.variableWhitelist && typeof response.variableWhitelist === 'object'
          ? response.variableWhitelist
          : {},
      requiredVariables:
        response?.requiredVariables && typeof response.requiredVariables === 'object'
          ? response.requiredVariables
          : {},
      signaturesByChannel:
        response?.signaturesByChannel && typeof response.signaturesByChannel === 'object'
          ? response.signaturesByChannel
          : {},
      ownerActions: Array.isArray(response?.ownerActions) ? response.ownerActions : [],
    };
    state.templateMetaTenantId = state.tenantId || '';
    renderTemplateCategoryOptions();
    renderTemplateEditorAssist();
    return state.templateMeta;
  }

  function syncTemplateFilterInputs() {
    if (els.templateSearchInput) els.templateSearchInput.value = state.templateListFilters.search || '';
    if (els.templateFilterSelect) els.templateFilterSelect.value = state.templateListFilters.category || '';
    if (els.templateStatusFilterSelect) els.templateStatusFilterSelect.value = state.templateListFilters.status || '';
    if (els.templateSortSelect) els.templateSortSelect.value = state.templateListFilters.sort || 'updated_desc';
    syncTemplateCategoryChipSelection();
    updateTemplateViewButtons();
  }

  function readTemplateFilterInputs() {
    state.templateListFilters = {
      search: String(els.templateSearchInput?.value || '').trim(),
      category: String(els.templateFilterSelect?.value || '').trim(),
      status: String(els.templateStatusFilterSelect?.value || '').trim(),
      sort: String(els.templateSortSelect?.value || 'updated_desc').trim() || 'updated_desc',
      view: String(state.templateListFilters?.view || 'table').trim() === 'card' ? 'card' : 'table',
    };
    persistTemplateListFilters();
    syncTemplateCategoryChipSelection();
  }

  function updateTemplateViewButtons() {
    const view = String(state.templateListFilters?.view || 'table').trim() === 'card' ? 'card' : 'table';
    if (els.templateViewTableBtn) {
      els.templateViewTableBtn.classList.toggle('active', view === 'table');
      els.templateViewTableBtn.setAttribute('aria-pressed', view === 'table' ? 'true' : 'false');
    }
    if (els.templateViewCardBtn) {
      els.templateViewCardBtn.classList.toggle('active', view === 'card');
      els.templateViewCardBtn.setAttribute('aria-pressed', view === 'card' ? 'true' : 'false');
    }
  }

  function setTemplateView(nextView) {
    const normalizedView = String(nextView || '').trim() === 'card' ? 'card' : 'table';
    state.templateListFilters.view = normalizedView;
    persistTemplateListFilters();
    updateTemplateViewButtons();
    renderTemplateTable();
  }

  function getFilteredTemplates() {
    const search = String(state.templateListFilters.search || '').toLowerCase();
    const category = String(state.templateListFilters.category || '').trim();
    const status = String(state.templateListFilters.status || '').trim();
    const sort = String(state.templateListFilters.sort || 'updated_desc').trim();

    let items = [...state.templates];
    if (category) {
      items = items.filter((template) => String(template?.category || '') === category);
    }
    if (status === 'with_active') {
      items = items.filter((template) => Boolean(template?.currentActiveVersionId));
    } else if (status === 'without_active') {
      items = items.filter((template) => !template?.currentActiveVersionId);
    }
    if (search) {
      items = items.filter((template) => {
        const haystack = [
          template?.name,
          template?.category,
          template?.locale,
          template?.channel,
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(search);
      });
    }

    const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'sv-SE');
    const compareTsDesc = (a, b) => String(b || '').localeCompare(String(a || ''));
    if (sort === 'name_asc') {
      items.sort((a, b) => compareText(a?.name, b?.name));
    } else if (sort === 'name_desc') {
      items.sort((a, b) => compareText(b?.name, a?.name));
    } else if (sort === 'category_asc') {
      items.sort((a, b) => {
        const byCategory = compareText(a?.category, b?.category);
        if (byCategory !== 0) return byCategory;
        return compareText(a?.name, b?.name);
      });
    } else if (sort === 'risk_desc') {
      items.sort((a, b) => {
        const riskB = Number(getTemplateRiskSnapshot(b?.id)?.riskLevel || 0);
        const riskA = Number(getTemplateRiskSnapshot(a?.id)?.riskLevel || 0);
        if (riskB !== riskA) return riskB - riskA;
        return compareTsDesc(a?.updatedAt, b?.updatedAt);
      });
    } else {
      items.sort((a, b) => compareTsDesc(a?.updatedAt, b?.updatedAt));
    }
    return { items, total: state.templates.length };
  }

  function getTemplateRiskSnapshot(templateId) {
    const id = String(templateId || '').trim();
    if (!id) return null;
    const matches = state.riskEvaluations
      .filter((item) => String(item?.templateId || '') === id)
      .slice()
      .sort((a, b) => String(b?.updatedAt || b?.evaluatedAt || '').localeCompare(String(a?.updatedAt || a?.evaluatedAt || '')));
    const latest = matches[0];
    if (!latest) return null;
    const riskLevel = Number(latest?.riskLevel || 0);
    if (!Number.isFinite(riskLevel) || riskLevel <= 0) return null;
    return {
      riskLevel,
      dotClass: dotClassForRiskLevel(riskLevel),
      decision: String(latest?.decision || '-'),
    };
  }

  function syncTemplateSelectionMeta(visibleTemplateIds = []) {
    const visibleIds = Array.isArray(visibleTemplateIds)
      ? visibleTemplateIds.map((item) => String(item || '')).filter(Boolean)
      : [];
    const selectedVisibleCount = visibleIds.filter((id) => state.selectedTemplateIds.includes(id)).length;
    if (els.templateSelectionMeta) {
      els.templateSelectionMeta.textContent =
        selectedVisibleCount > 0
          ? `${selectedVisibleCount} valda`
          : '0 valda';
    }
    if (els.templateSelectAll) {
      els.templateSelectAll.checked =
        visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
      els.templateSelectAll.indeterminate =
        selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    }
    updateTemplateBulkControls();
  }

  function setTemplateSelection(templateId, checked) {
    const id = String(templateId || '').trim();
    if (!id) return;
    if (checked) {
      if (!state.selectedTemplateIds.includes(id)) state.selectedTemplateIds.push(id);
    } else {
      state.selectedTemplateIds = state.selectedTemplateIds.filter((item) => item !== id);
    }
  }

  function updateTemplateBulkControls() {
    const writer = canTemplateWrite();
    const owner = isOwner();
    const selectedCount = state.selectedTemplateIds.length;
    const action = String(els.templateBulkAction?.value || 'evaluate_latest').trim();
    const ownerOnlyAction = action === 'archive_active';

    if (els.templateBulkAction) els.templateBulkAction.disabled = !writer;
    if (els.templateSelectAll) els.templateSelectAll.disabled = !writer;
    if (els.applyTemplateBulkBtn) {
      els.applyTemplateBulkBtn.disabled =
        !writer || selectedCount === 0 || (ownerOnlyAction && !owner);
    }
    if (els.templateClearSelectionBtn) {
      els.templateClearSelectionBtn.disabled = !writer || selectedCount === 0;
    }
  }

  async function resolveTemplateVersionForBulk(template, action) {
    if (!template?.id) return '';
    if (action === 'archive_active') {
      return String(template.currentActiveVersionId || '').trim();
    }
    if (!Number(template?.latestVersionNo || 0)) return '';
    const response = await api(`/templates/${encodeURIComponent(template.id)}/versions`);
    const versions = Array.isArray(response?.versions) ? response.versions : [];
    return String(versions[0]?.id || '').trim();
  }

  async function applyTemplateBulkAction() {
    try {
      const action = String(els.templateBulkAction?.value || 'evaluate_latest').trim();
      const selectedIds = [...new Set(state.selectedTemplateIds)].filter(Boolean);
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet för template-bulk.');
      if (!selectedIds.length) throw new Error('Välj minst en mall först.');
      if (action === 'archive_active' && !isOwner()) {
        throw new Error('Endast OWNER kan arkivera aktiva versioner.');
      }

      const selectedTemplates = selectedIds
        .map((id) => state.templates.find((item) => String(item?.id || '') === id))
        .filter(Boolean);
      if (!selectedTemplates.length) throw new Error('Inga valda mallar hittades i listan.');

      setStatus(
        els.templateBulkStatus,
        `Kör bulk action (${action}) för ${selectedTemplates.length} mallar...`
      );

      let successCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      const failedItems = [];

      for (const template of selectedTemplates) {
        try {
          const versionId = await resolveTemplateVersionForBulk(template, action);
          if (!versionId) {
            skippedCount += 1;
            continue;
          }

          if (action === 'evaluate_latest') {
            await api(
              `/templates/${encodeURIComponent(template.id)}/versions/${encodeURIComponent(versionId)}/evaluate`,
              { method: 'POST', body: {} }
            );
          } else if (action === 'clone_latest') {
            await api(
              `/templates/${encodeURIComponent(template.id)}/versions/${encodeURIComponent(versionId)}/clone`,
              { method: 'POST', body: {} }
            );
          } else if (action === 'archive_active') {
            await api(
              `/templates/${encodeURIComponent(template.id)}/versions/${encodeURIComponent(versionId)}/archive`,
              { method: 'POST', body: {} }
            );
          } else {
            throw new Error('Ogiltig bulk action.');
          }

          successCount += 1;
        } catch (error) {
          failedCount += 1;
          failedItems.push({
            name: template?.name || template?.id || 'template',
            message: error?.message || 'okänt fel',
          });
        }
      }

      state.selectedTemplateIds = [];
      await refreshAll();

      const summary = `Bulk klart • success=${successCount}, skipped=${skippedCount}, failed=${failedCount}`;
      if (failedCount > 0) {
        const sample = failedItems
          .slice(0, 3)
          .map((item) => `${item.name}: ${item.message}`)
          .join(' • ');
        setStatus(els.templateBulkStatus, `${summary}. ${sample}`, true);
      } else {
        setStatus(els.templateBulkStatus, summary);
      }
    } catch (error) {
      setStatus(els.templateBulkStatus, error.message || 'Kunde inte köra template-bulk.', true);
    }
  }

  function renderTemplateTable() {
    saveListScrollPosition('templateTableWrap', els.templateTableWrap);
    const selectedId = state.selectedTemplateId;
    if (els.templateTableBody) els.templateTableBody.innerHTML = '';
    if (els.templateCardList) els.templateCardList.innerHTML = '';
    const { items, total } = getFilteredTemplates();
    const visibleTemplateIds = items.map((item) => String(item?.id || '')).filter(Boolean);
    state.selectedTemplateIds = state.selectedTemplateIds.filter((id) =>
      visibleTemplateIds.includes(id)
    );
    syncTemplateSelectionMeta(visibleTemplateIds);
    const view = String(state.templateListFilters?.view || 'table').trim() === 'card' ? 'card' : 'table';

    if (els.templateResultsMeta) {
      els.templateResultsMeta.textContent = `Visar ${items.length} av ${total} mallar`;
    }
    if (els.templateTableWrap) els.templateTableWrap.classList.toggle('hidden', view !== 'table');
    if (els.templateCardList) els.templateCardList.classList.toggle('hidden', view !== 'card');
    updateTemplateViewButtons();

    if (!items.length) {
      if (view === 'card' && els.templateCardList) {
        const empty = document.createElement('div');
        empty.className = 'muted mini';
        empty.textContent = 'Inga mallar matchar valt filter.';
        els.templateCardList.appendChild(empty);
      } else if (els.templateTableBody) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="muted">Inga mallar matchar valt filter.</td>';
        els.templateTableBody.appendChild(row);
      }
      restoreListScrollPosition('templateTableWrap', els.templateTableWrap);
      updateLifecyclePermissions();
      return;
    }

    const selectTemplateHandler = async (templateId) => {
      await selectTemplate(templateId, { preserveVersion: false });
    };

    if (view === 'card' && els.templateCardList) {
      for (const template of items) {
        const card = document.createElement('article');
        card.className = 'template-card';
        const selected = template.id === selectedId;
        const checked = state.selectedTemplateIds.includes(template.id);
        const riskSnapshot = getTemplateRiskSnapshot(template.id);
        card.innerHTML = `
          <div class="title">
            <span>${escapeHtml(template.name)}</span>
            <span class="chip">${escapeHtml(template.category || '-')}</span>
          </div>
          <label class="selection">
            <input type="checkbox" class="templateSelectChk" data-tid="${escapeHtml(template.id)}" ${checked ? 'checked' : ''} />
            Välj för bulk
          </label>
          <div class="meta">
            <span class="chip">${
              isEnglishLanguage() ? 'Locale' : 'Språk'
            }: ${escapeHtml(template.locale || '-')}</span>
            <span class="chip">${
              isEnglishLanguage() ? 'Channel' : 'Kanal'
            }: ${escapeHtml(template.channel || '-')}</span>
            <span class="chip">${
              template.currentActiveVersionId
                ? isEnglishLanguage()
                  ? 'Active version'
                  : 'Aktiv version'
                : isEnglishLanguage()
                ? 'No active version'
                : 'Utan aktiv version'
            }</span>
            <span class="chip">${escapeHtml(formatTemplateStateLabel(template.status || 'active'))}</span>
            ${
              riskSnapshot
                ? `<span class="badge"><span class="dot ${riskSnapshot.dotClass}"></span>L${riskSnapshot.riskLevel} • ${escapeHtml(riskSnapshot.decision)}</span>`
                : `<span class="chip muted">${isEnglishLanguage() ? 'Risk' : 'Risk'}: -</span>`
            }
          </div>
          <div class="mini muted">Uppdaterad: ${escapeHtml(formatDateTime(template.updatedAt, true))}</div>
          <div class="footer">
            <button class="btn small templateSelectBtn" data-tid="${escapeHtml(template.id)}">${
              selected
                ? isEnglishLanguage()
                  ? 'Selected'
                  : 'Vald'
                : isEnglishLanguage()
                ? 'Open'
                : 'Öppna'
            }</button>
            <button class="btn small templateNewDraftBtn" data-tid="${escapeHtml(template.id)}">${
              isEnglishLanguage() ? 'New draft' : 'Ny draft'
            }</button>
          </div>
        `;
        els.templateCardList.appendChild(card);
      }
      els.templateCardList.querySelectorAll('.templateSelectBtn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const templateId = btn.getAttribute('data-tid') || '';
          if (!templateId) return;
          await selectTemplateHandler(templateId);
        });
      });
      els.templateCardList.querySelectorAll('.templateNewDraftBtn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const templateId = btn.getAttribute('data-tid') || '';
          if (!templateId) return;
          await selectTemplate(templateId, { preserveVersion: false });
          if (els.draftInstructionInput) {
            els.draftInstructionInput.focus();
            els.draftInstructionInput.select();
          }
        });
      });
      els.templateCardList.querySelectorAll('.templateSelectChk').forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          const templateId = checkbox.getAttribute('data-tid') || '';
          setTemplateSelection(templateId, checkbox.checked);
          syncTemplateSelectionMeta(visibleTemplateIds);
          updateLifecyclePermissions();
        });
      });
      updateLifecyclePermissions();
      restoreListScrollPosition('templateTableWrap', els.templateTableWrap);
      return;
    }

    for (const template of items) {
      const tr = document.createElement('tr');
      const selected = template.id === selectedId;
      const checked = state.selectedTemplateIds.includes(template.id);
      const riskSnapshot = getTemplateRiskSnapshot(template.id);
      tr.innerHTML = `
        <td class="template-select-col"><input type="checkbox" class="templateSelectChk" data-tid="${escapeHtml(template.id)}" ${checked ? 'checked' : ''} /></td>
        <td>${escapeHtml(template.name)}</td>
        <td>${escapeHtml(template.category)}</td>
        <td>${escapeHtml(formatTemplateStateLabel(template.status || 'active'))}</td>
        <td class="code">${
          template.currentActiveVersionId ? (isEnglishLanguage() ? 'yes' : 'ja') : '-'
        }</td>
        <td>${riskSnapshot ? `<span class="badge"><span class="dot ${riskSnapshot.dotClass}"></span>L${riskSnapshot.riskLevel}</span>` : '<span class="muted mini">-</span>'}</td>
        <td class="mini">${escapeHtml(formatDateTime(template.updatedAt, true))}</td>
        <td><button class="btn small templateSelectBtn" data-tid="${escapeHtml(template.id)}">${
          selected
            ? isEnglishLanguage()
              ? 'Selected'
              : 'Vald'
            : isEnglishLanguage()
            ? 'Select'
            : 'Välj'
        }</button></td>
      `;
      if (els.templateTableBody) els.templateTableBody.appendChild(tr);
    }

    els.templateTableBody?.querySelectorAll('.templateSelectBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const templateId = btn.getAttribute('data-tid');
        await selectTemplateHandler(templateId);
      });
    });
    els.templateTableBody?.querySelectorAll('.templateSelectChk').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const templateId = checkbox.getAttribute('data-tid') || '';
        setTemplateSelection(templateId, checkbox.checked);
        syncTemplateSelectionMeta(visibleTemplateIds);
        updateLifecyclePermissions();
      });
    });
    restoreListScrollPosition('templateTableWrap', els.templateTableWrap);
    updateLifecyclePermissions();
  }

  function renderVersionTable() {
    const selectedId = state.selectedVersionId;
    els.versionTableBody.innerHTML = '';

    for (const version of state.versions) {
      const tr = document.createElement('tr');
      const riskLevel = version?.risk?.riskLevel || '-';
      const selected = version.id === selectedId;
      tr.innerHTML = `
        <td>${version.versionNo}</td>
        <td>${escapeHtml(formatTemplateStateLabel(version.state || 'draft'))}</td>
        <td>${riskLevel}</td>
        <td><button class="btn small versionSelectBtn" data-vid="${version.id}">${
          selected
            ? isEnglishLanguage()
              ? 'Selected'
              : 'Vald'
            : isEnglishLanguage()
            ? 'Open'
            : 'Öppna'
        }</button></td>
      `;
      els.versionTableBody.appendChild(tr);
    }

    els.versionTableBody.querySelectorAll('.versionSelectBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const versionId = btn.getAttribute('data-vid');
        await selectVersion(versionId);
      });
    });
  }

  function fillVersionEditor(version) {
    if (!version) {
      clearVersionEditor();
      return;
    }
    state.selectedVersionId = version.id;
    setText(
      els.selectedVersionMeta,
      `v${version.versionNo} · ${
        isEnglishLanguage() ? 'status' : 'status'
      }=${formatTemplateStateLabel(version.state || 'draft')} · ${
        isEnglishLanguage() ? 'created' : 'skapad'
      }=${version.createdAt} · revision=r${Number(version.revision || 1)}`
    );
    if (els.versionTitleInput) els.versionTitleInput.value = version.title || '';
    if (els.versionContentInput) els.versionContentInput.value = version.content || '';
    if (els.versionRiskBlock) {
      els.versionRiskBlock.textContent = version.risk
        ? JSON.stringify(version.risk, null, 2)
        : 'Ingen riskutvärdering ännu.';
    }
    if (
      state.lastVariableValidation &&
      state.lastVariableValidation.versionId !== version.id
    ) {
      state.lastVariableValidation = null;
    }
    renderTemplateEditorAssist();
    updateLifecyclePermissions();
  }

  async function selectVersion(versionId) {
    if (!state.selectedTemplateId || !versionId) return;
    const local = state.versions.find((item) => item.id === versionId);
    if (local) {
      fillVersionEditor(local);
      await loadVersionRevisions({ silent: true });
      return;
    }
    const response = await api(`/templates/${state.selectedTemplateId}/versions/${versionId}`);
    fillVersionEditor(response?.version || null);
    await loadVersionRevisions({ silent: true });
  }

  async function loadVersionsForSelectedTemplate({ preserveVersion = true } = {}) {
    if (!state.selectedTemplateId) {
      state.versions = [];
      els.versionTableBody.innerHTML = '';
      clearVersionEditor();
      return;
    }

    const response = await api(`/templates/${state.selectedTemplateId}/versions`);
    state.versions = Array.isArray(response?.versions) ? response.versions : [];
    renderVersionTable();

    if (!state.versions.length) {
      clearVersionEditor();
      return;
    }

    const keepId =
      preserveVersion && state.selectedVersionId && state.versions.some((v) => v.id === state.selectedVersionId)
        ? state.selectedVersionId
        : state.versions[0].id;
    await selectVersion(keepId);
  }

  async function selectTemplate(templateId, { preserveVersion = true } = {}) {
    state.selectedTemplateId = templateId || '';
    const template = state.templates.find((item) => item.id === state.selectedTemplateId);
    if (template) {
      setText(
        els.selectedTemplateMeta,
        `${template.name} · ${template.category} · ${
          isEnglishLanguage() ? 'Locale' : 'Språk'
        }=${template.locale} · ${isEnglishLanguage() ? 'Channel' : 'Kanal'}=${template.channel}`
      );
    } else {
      setText(els.selectedTemplateMeta, 'Ingen mall vald.');
    }
    renderTemplateEditorAssist();
    renderTemplateTable();
    await loadVersionsForSelectedTemplate({ preserveVersion });
    updateLifecyclePermissions();
  }

  async function loadTemplates({ preserveSelection = true } = {}) {
    try {
      await loadTemplateMeta();
    } catch (error) {
      setStatus(els.templateStatus, error.message || 'Kunde inte läsa template metadata.', true);
    }

    const response = await api('/templates');
    state.templates = Array.isArray(response?.templates) ? response.templates : [];
    readTemplateFilterInputs();
    renderTemplateTable();

    if (!state.templates.length) {
      state.selectedTemplateId = '';
      state.selectedTemplateIds = [];
      state.versions = [];
      setText(els.selectedTemplateMeta, 'Ingen mall vald.');
      els.versionTableBody.innerHTML = '';
      clearVersionEditor();
      syncTemplateSelectionMeta([]);
      renderTemplateEditorAssist();
      return;
    }

    const { items: filteredTemplates } = getFilteredTemplates();
    const selectedExists = state.templates.some((item) => item.id === state.selectedTemplateId);
    const selectedVisible = filteredTemplates.some((item) => item.id === state.selectedTemplateId);
    const keepTemplateId =
      preserveSelection && state.selectedTemplateId && selectedExists && selectedVisible
        ? state.selectedTemplateId
        : filteredTemplates[0]?.id || state.templates[0].id;
    await selectTemplate(keepTemplateId, { preserveVersion: true });
  }

  async function createTemplate() {
    try {
      setStatus(els.templateStatus, 'Skapar mall...');
      const name = (els.templateNameInput?.value || '').trim();
      if (!name) throw new Error('Mallnamn krävs.');

      const response = await api('/templates', {
        method: 'POST',
        body: {
          name,
          category: els.templateCategoryInput?.value || 'CONSULTATION',
          channel: (els.templateChannelInput?.value || 'email').trim(),
          locale: (els.templateLocaleInput?.value || 'sv-SE').trim(),
        },
      });

      setStatus(els.templateStatus, 'Mall skapad.');
      if (els.templateNameInput) els.templateNameInput.value = '';
      await loadDashboard();
      await loadTemplates({ preserveSelection: false });
      if (response?.template?.id) await selectTemplate(response.template.id, { preserveVersion: false });
    } catch (error) {
      setStatus(els.templateStatus, error.message || 'Kunde inte skapa mall.', true);
    }
  }

  async function generateDraft() {
    try {
      if (!state.selectedTemplateId) throw new Error('Välj en mall först.');
      setStatus(els.versionStatus, 'Genererar draft...');
      const response = await api(`/templates/${state.selectedTemplateId}/drafts/generate`, {
        method: 'POST',
        body: {
          instruction: (els.draftInstructionInput?.value || '').trim(),
          title: (els.versionTitleInput?.value || '').trim(),
        },
      });
      rememberVariableValidation(response?.version?.id, response?.variableValidation);
      const unknownCount = Array.isArray(response?.variableValidation?.unknownVariables)
        ? response.variableValidation.unknownVariables.length
        : 0;
      const missingCount = Array.isArray(response?.variableValidation?.missingRequiredVariables)
        ? response.variableValidation.missingRequiredVariables.length
        : 0;
      if (els.draftInstructionInput) els.draftInstructionInput.value = '';
      setStatus(
        els.versionStatus,
        `Draft skapad (${response?.generation?.provider || 'ai'}) • unknown=${unknownCount}, missing=${missingCount}.`
      );
      await loadDashboard();
      await loadTemplates({ preserveSelection: true });
      if (response?.version?.id) await selectVersion(response.version.id);
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('generate', error) || 'Kunde inte generera draft.',
        true
      );
    }
  }

  async function saveDraft() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      const currentVersion = getSelectedVersionSnapshot();
      const expectedRevision = parseRevisionNumber(currentVersion?.revision);
      const ifMatch = buildRevisionEtag(expectedRevision);
      setStatus(els.versionStatus, 'Sparar draft...');
      const response = await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}`, {
        method: 'PATCH',
        headers: ifMatch ? { 'If-Match': ifMatch } : null,
        body: {
          title: (els.versionTitleInput?.value || '').trim(),
          content: els.versionContentInput?.value || '',
          instruction: (els.draftInstructionInput?.value || '').trim(),
          expectedRevision: expectedRevision || undefined,
        },
      });
      rememberVariableValidation(state.selectedVersionId, response?.variableValidation);
      const decision = response?.version?.risk?.decision || '-';
      setStatus(els.versionStatus, `Draft sparad • riskbeslut: ${decision}.`);
      await loadTemplates({ preserveSelection: true });
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('save', error) || 'Kunde inte spara draft.',
        true
      );
    }
  }

  async function evaluateVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Utvärderar risk...');
      const response = await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/evaluate`, {
        method: 'POST',
        body: {
          instruction: (els.draftInstructionInput?.value || '').trim(),
        },
      });
      rememberVariableValidation(state.selectedVersionId, response?.variableValidation);
      setStatus(
        els.versionStatus,
        `Riskutvärdering klar • L${response?.version?.risk?.riskLevel || '-'} (${formatDecisionLabel(
          response?.version?.risk?.decision || '-'
        )})`
      );
      await refreshAll();
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('evaluate', error) || 'Kunde inte utvärdera version.',
        true
      );
    }
  }

  async function activateVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Aktiverar version...');
      const response = await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/activate`, {
        method: 'POST',
        body: {},
      });
      setStatus(
        els.versionStatus,
        `Version aktiverad • status=${formatTemplateStateLabel(response?.version?.state || 'active')}.`
      );
      await refreshAll();
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('activate', error) || 'Kunde inte aktivera version.',
        true
      );
    }
  }

  async function archiveVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Arkiverar version...');
      await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/archive`, {
        method: 'POST',
        body: {},
      });
      setStatus(els.versionStatus, 'Version arkiverad.');
      await refreshAll();
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('archive', error) || 'Kunde inte arkivera version.',
        true
      );
    }
  }

  async function cloneVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Klonar version...');
      const response = await api(
        `/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/clone`,
        {
          method: 'POST',
          body: {},
        }
      );
      setStatus(els.versionStatus, 'Version klonad.');
      await refreshAll();
      if (response?.version?.id) await selectVersion(response.version.id);
    } catch (error) {
      setStatus(
        els.versionStatus,
        formatVersionActionError('clone', error) || 'Kunde inte klona version.',
        true
      );
    }
  }

  async function loadStaffMembers() {
    if (!isOwner()) {
      state.staffMembers = [];
      state.selectedStaffMembershipId = '';
      renderStaffTable(state.staffMembers);
      return;
    }
    const response = await api('/users/staff');
    state.staffMembers = Array.isArray(response?.members) ? response.members : [];
    if (state.selectedStaffMembershipId) {
      const exists = state.staffMembers.some(
        (item) => String(item?.membership?.id || '') === state.selectedStaffMembershipId
      );
      if (!exists) state.selectedStaffMembershipId = '';
    }
    renderStaffTable(state.staffMembers);
  }

  async function loadSessionProfile() {
    if (!state.token) {
      state.profile = null;
      renderProfileCard(null);
      return null;
    }
    const me = await api('/auth/me');
    state.profile = me || null;
    applyAuthContext({
      membership: me?.membership || null,
      memberships: me?.memberships || (me?.membership ? [me.membership] : []),
    });
    renderProfileCard(state.profile);
    return state.profile;
  }

  async function createStaffMember() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan hantera staff.');
      const email = String(els.staffEmailInput?.value || '')
        .trim()
        .toLowerCase();
      if (!looksLikeEmail(email)) throw new Error('Ange en giltig e-postadress.');

      let password = String(els.staffPasswordInput?.value || '').trim();
      let autoGenerated = false;
      if (!password) {
        password = generateStrongPassword(14);
        autoGenerated = true;
        if (els.staffPasswordInput) els.staffPasswordInput.value = password;
      }
      const strength = getPasswordStrength(password);
      if (strength.level === 'weak') {
        throw new Error('Lösenordet är för svagt. Använd minst 10 tecken med blandade tecken.');
      }

      setStatus(els.staffStatus, 'Skapar/uppdaterar staff...');
      const response = await api('/users/staff', {
        method: 'POST',
        body: {
          email,
          password,
        },
      });
      const statusCode = response?.createdUser ? 'skapad' : 'uppdaterad';
      const inviteMessage = buildStaffInviteMessage({
        email,
        password,
        tenantId: state.tenantId,
      });
      setStaffInvitePreview(inviteMessage);

      if (response?.membership?.id) {
        state.selectedStaffMembershipId = String(response.membership.id);
      }

      if (els.staffEmailInput) els.staffEmailInput.value = '';
      if (els.staffPasswordInput) els.staffPasswordInput.value = '';

      await loadStaffMembers();
      await loadDashboard();

      try {
        await copyText(inviteMessage);
        setStatus(
          els.staffStatus,
          `Medarbetare ${statusCode}: ${email}. Inbjudningstext kopierad (${autoGenerated ? 'auto-lösenord' : 'manuellt lösenord'}).`
        );
      } catch {
        setStatus(
          els.staffStatus,
          `Medarbetare ${statusCode}: ${email}. Inbjudningstext klar i panelen.`
        );
      }
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte skapa staff.', true);
    }
  }

  async function copyInviteForMember(member) {
    const email = String(member?.user?.email || '').trim().toLowerCase();
    if (!looksLikeEmail(email)) throw new Error('Saknar giltig e-post för vald användare.');

    const modal = await openAppModal({
      title: 'Kopiera inbjudningstext',
      message: `Ange temporärt lösenord för ${email}.`,
      inputMode: 'text',
      inputType: 'password',
      inputLabel: 'Temporärt lösenord',
      inputPlaceholder: 'Minst 10 tecken',
      defaultValue: '',
      allowEmpty: false,
      confirmLabel: 'Kopiera',
      cancelLabel: 'Avbryt',
    });
    if (!modal.confirmed) return;
    const password = String(modal.value || '').trim();
    const strength = getPasswordStrength(password);
    if (strength.level === 'weak') {
      throw new Error('Lösenordet är för svagt för inbjudningstexten.');
    }

    const inviteMessage = buildStaffInviteMessage({
      email,
      password,
      tenantId: state.tenantId,
    });
    setStaffInvitePreview(inviteMessage);
    await copyText(inviteMessage);
    setStatus(els.staffStatus, `Invite-text kopierad för ${email}.`);
  }

  async function copyCurrentInviteMessage() {
    try {
      const existing = String(state.lastInviteMessage || '').trim();
      if (existing) {
        await copyText(existing);
        setStatus(els.staffStatus, 'Invite-text kopierad.');
        return;
      }

      const email = String(els.staffEmailInput?.value || '')
        .trim()
        .toLowerCase();
      const password = String(els.staffPasswordInput?.value || '').trim();
      if (!looksLikeEmail(email) || !password) {
        throw new Error('Skapa först en inbjudningstext eller fyll i e-post + lösenord.');
      }
      const inviteMessage = buildStaffInviteMessage({ email, password, tenantId: state.tenantId });
      setStaffInvitePreview(inviteMessage);
      await copyText(inviteMessage);
      setStatus(els.staffStatus, 'Invite-text kopierad.');
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte kopiera inbjudningstext.', true);
    }
  }

  async function resetStaffPasswordFlow(membershipId) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan resetta staff-lösenord.');
      const member = getStaffMemberByMembershipId(membershipId);
      const email = String(member?.user?.email || '').trim().toLowerCase();
      const role = String(member?.membership?.role || '').toUpperCase();
      if (!member || !email) throw new Error('Kunde inte hitta vald användare.');
      if (role === 'OWNER') throw new Error('OWNER-lösenord hanteras via profilpanelen.');

      const modal = await openAppModal({
        title: 'Återställ medarbetarlösenord',
        message: `Ange nytt temporärt lösenord för ${email}.`,
        inputMode: 'text',
        inputType: 'password',
        inputLabel: 'Nytt lösenord',
        inputPlaceholder: 'Minst 10 tecken',
        defaultValue: generateStrongPassword(14),
        allowEmpty: false,
        confirmLabel: 'Resetta',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!modal.confirmed) return;
      const newPassword = String(modal.value || '').trim();
      const strength = getPasswordStrength(newPassword);
      if (strength.level === 'weak') {
        throw new Error('Lösenordet är för svagt. Använd minst 10 tecken och blandade tecken.');
      }

      setStatus(els.staffStatus, `Resetar lösenord för ${email}...`);
      await api('/users/staff', {
        method: 'POST',
        body: {
          email,
          password: newPassword,
        },
      });

      const inviteMessage = buildStaffInviteMessage({
        email,
        password: newPassword,
        tenantId: state.tenantId,
      });
      setStaffInvitePreview(inviteMessage);
      state.selectedStaffMembershipId = membershipId;
      await loadStaffMembers();
      await loadSessionsPanel();
      try {
        await copyText(inviteMessage);
        setStatus(els.staffStatus, `Lösenord reset för ${email}. Invite-text kopierad.`);
      } catch {
        setStatus(els.staffStatus, `Lösenord reset för ${email}.`);
      }
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte resetta lösenord.', true);
    }
  }

  async function updateStaffRole(membershipId, nextRole) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan ändra roll.');
      const role = String(nextRole || '').trim().toUpperCase();
      if (!['STAFF', 'OWNER'].includes(role)) {
        throw new Error('Ogiltig roll.');
      }

      const member = getStaffMemberByMembershipId(membershipId);
      const email = String(member?.user?.email || '').trim().toLowerCase();
      const currentRole = String(member?.membership?.role || '').trim().toUpperCase();
      if (!member || !email) throw new Error('Kunde inte hitta vald användare.');
      if (currentRole === 'OWNER') throw new Error('Owner-medlemskap kan inte ändras här.');
      if (currentRole === role) {
        setStatus(els.staffStatus, `${email} har redan rollen ${role}.`);
        return;
      }

      const isPromote = role === 'OWNER';
      const isDemote = role === 'STAFF';

      if (isPromote || isDemote) {
        const confirmWord = isPromote ? 'PROMOTE' : 'DEMOTE';
        const title = isPromote ? 'Promote till OWNER' : 'Demote till STAFF';
        const message = isPromote
          ? `Du är på väg att ge OWNER-rättigheter till ${email}.`
          : `Du är på väg att ta bort OWNER-rättigheter för ${email}.`;
        const hint = isPromote
          ? 'Detta ger full åtkomst till tenanten.'
          : 'Detta begränsar åtkomst till STAFF-nivå.';
        const confirmLabel = isPromote ? 'Promote' : 'Demote';
        const confirm = await openAppModal({
          title,
          message,
          inputMode: 'text',
          inputLabel: 'Bekräfta',
          inputPlaceholder: `Skriv ${confirmWord}`,
          requiredExact: confirmWord,
          hint,
          confirmLabel,
          cancelLabel: 'Avbryt',
          confirmTone: 'danger',
        });
        if (!confirm.confirmed) return;
      }

      setStatus(els.staffStatus, `Uppdaterar roll för ${email}...`);
      await api(`/users/staff/${membershipId}`, {
        method: 'PATCH',
        body: { role },
      });

      state.selectedStaffMembershipId = String(membershipId);
      await loadStaffMembers();
      await loadDashboard();
      await loadSessionsPanel();
      setStatus(els.staffStatus, `Roll uppdaterad: ${email} → ${role}.`);
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte ändra roll.', true);
    }
  }

  async function changeOwnPassword() {
    try {
      if (!state.token) throw new Error('Logga in först.');
      const currentPassword = String(els.currentPasswordInput?.value || '');
      const newPassword = String(els.newPasswordInput?.value || '');
      if (!currentPassword || !newPassword) {
        throw new Error('Fyll i nuvarande och nytt lösenord.');
      }
      if (newPassword.trim().length < 10) {
        throw new Error('Nytt lösenord måste vara minst 10 tecken.');
      }
      if (newPassword === currentPassword) {
        throw new Error('Nytt lösenord måste skilja sig från nuvarande.');
      }
      const strength = getPasswordStrength(newPassword);
      if (strength.level === 'weak') {
        throw new Error('Nytt lösenord är för svagt.');
      }

      setStatus(els.profileStatus, 'Byter lösenord...');
      const response = await api('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        },
      });

      if (els.currentPasswordInput) els.currentPasswordInput.value = '';
      if (els.newPasswordInput) els.newPasswordInput.value = '';
      setStatus(
        els.profileStatus,
        `Lösenord uppdaterat. Avslutade sessioner: ${response?.revokedSessions ?? 0}.`
      );
      await loadSessionProfile();
      await loadSessionsPanel();
    } catch (error) {
      setStatus(els.profileStatus, error.message || 'Kunde inte byta lösenord.', true);
    }
  }

  async function applyFilteredStaffStatus(nextStatus) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan hantera staff.');
      const targetStatus = String(nextStatus || '').trim().toLowerCase();
      if (!['active', 'disabled'].includes(targetStatus)) {
        throw new Error('Ogiltig status för bulk-uppdatering.');
      }

      const targets = getFilteredStaffMembers(state.staffMembers).filter((item) => {
        const membershipId = String(item?.membership?.id || '').trim();
        const role = String(item?.membership?.role || '').toUpperCase();
        const current = String(item?.membership?.status || '').toLowerCase();
        return Boolean(membershipId) && role !== 'OWNER' && current !== targetStatus;
      });

      if (targets.length === 0) {
        setStatus(els.staffStatus, 'Inga filtrerade staff-medlemmar behöver uppdateras.');
        return;
      }

      const confirmResult = await openAppModal({
        title: 'Bulk staff-uppdatering',
        message: `Uppdatera ${targets.length} staff-medlemmar till "${targetStatus}"?`,
        confirmLabel: 'Uppdatera',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) return;

      setStatus(els.staffStatus, `Uppdaterar ${targets.length} staff-medlemmar...`);
      let updated = 0;
      let failed = 0;
      for (const item of targets) {
        const membershipId = String(item?.membership?.id || '').trim();
        if (!membershipId) continue;
        try {
          await api(`/users/staff/${membershipId}`, {
            method: 'PATCH',
            body: { status: targetStatus },
          });
          updated += 1;
        } catch {
          failed += 1;
        }
      }

      await loadStaffMembers();
      await loadDashboard();
      if (failed > 0) {
        setStatus(
          els.staffStatus,
          `Bulk klar med fel: ${updated} uppdaterade, ${failed} misslyckades.`,
          true
        );
      } else {
        setStatus(els.staffStatus, `Bulk klar: ${updated} uppdaterade till ${targetStatus}.`);
      }
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte bulk-uppdatera staff.', true);
    }
  }

  async function runRiskPreview() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet.');
      const category = els.riskLabCategory?.value || 'CONSULTATION';
      const scope = els.riskLabScope?.value || 'output';
      const content = (els.riskLabContent?.value || '').trim();
      const rawVariables = (els.riskLabVariables?.value || '').trim();
      if (!content) throw new Error('Ange text att utvärdera.');

      const variables = rawVariables
        ? rawVariables
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;

      setStatus(els.riskLabStatus, 'Kör riskförhandsgranskning...');
      const response = await api('/risk/preview', {
        method: 'POST',
        body: {
          category,
          scope,
          content,
          variables,
        },
      });
      if (els.riskLabResult) {
        els.riskLabResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.riskLabStatus,
        `Klar: risk L${response?.evaluation?.riskLevel || '-'} (${response?.evaluation?.decision || '-'})`
      );
      await loadDashboard();
    } catch (error) {
      setStatus(els.riskLabStatus, error.message || 'Kunde inte köra riskförhandsgranskning.', true);
    }
  }

  function renderOrchestratorMeta(metaResponse = null) {
    if (!els.orchestratorMetaSummary || !els.orchestratorMetaResult) return;

    const agents = metaResponse?.agents && typeof metaResponse.agents === 'object'
      ? metaResponse.agents
      : {};
    const intents = metaResponse?.intents && typeof metaResponse.intents === 'object'
      ? metaResponse.intents
      : {};
    const roadmap = metaResponse?.roadmap && typeof metaResponse.roadmap === 'object'
      ? metaResponse.roadmap
      : {};
    const policyFloor = metaResponse?.policyFloor && typeof metaResponse.policyFloor === 'object'
      ? metaResponse.policyFloor
      : {};
    const phases = Array.isArray(roadmap?.phases) ? roadmap.phases : [];
    const policyRules = Array.isArray(policyFloor?.rules) ? policyFloor.rules : [];
    const agentLabels = Object.values(agents).map((item) => String(item || '').trim()).filter(Boolean);
    const intentLabels = Object.values(intents).map((item) => String(item || '').trim()).filter(Boolean);

    if (agentLabels.length === 0 && intentLabels.length === 0 && phases.length === 0) {
      els.orchestratorMetaSummary.textContent = '';
      els.orchestratorMetaResult.textContent = isEnglishLanguage()
        ? 'No orchestrator roadmap data yet.'
        : 'Ingen orkestreringsfärdplan ännu.';
      return;
    }

    els.orchestratorMetaSummary.textContent = isEnglishLanguage()
      ? `agents=${agentLabels.length} intents=${intentLabels.length} phases=${phases.length} policyRules=${policyRules.length}`
      : `agents=${agentLabels.length} intents=${intentLabels.length} faser=${phases.length} policyRules=${policyRules.length}`;

    const lines = [];
    lines.push(
      `roadmapVersion=${String(roadmap?.version || '-')} | policyVersion=${String(policyFloor?.version || '-')} | policyImmutable=${policyFloor?.immutable === true ? 'yes' : 'no'}`
    );
    lines.push(`agents: ${agentLabels.join(', ') || '-'}`);
    lines.push(`intents: ${intentLabels.join(', ') || '-'}`);
    lines.push('');
    lines.push(isEnglishLanguage() ? 'roadmap phases:' : 'roadmap-faser:');
    if (phases.length === 0) {
      lines.push(isEnglishLanguage() ? '- no phases available' : '- inga faser tillgängliga');
    } else {
      phases.forEach((phase, index) => {
        const label = String(phase?.label || phase?.id || `phase_${index + 1}`);
        const status = String(phase?.status || '-');
        const phaseAgents = Array.isArray(phase?.agents)
          ? phase.agents.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        const capabilities = Array.isArray(phase?.capabilities)
          ? phase.capabilities.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        lines.push(
          `${index + 1}. ${label} [${status}] | agents=${phaseAgents.join(',') || '-'} | capabilities=${capabilities.join(',') || '-'}`
        );
      });
    }
    lines.push('');
    lines.push(
      `policyFloorRules(${policyRules.length}): ${policyRules.map((item) => String(item?.id || '').trim()).filter(Boolean).join(', ') || '-'}`
    );
    els.orchestratorMetaResult.textContent = lines.join('\n');
  }

  async function loadOrchestratorMeta({ updateStatus = false } = {}) {
    try {
      const response = await api('/orchestrator/meta');
      renderOrchestratorMeta(response);
      if (updateStatus) {
        const phases = Array.isArray(response?.roadmap?.phases) ? response.roadmap.phases.length : 0;
        setStatus(els.orchestratorStatus, `Roadmap laddad: phases=${phases}`);
      }
    } catch (error) {
      renderOrchestratorMeta(null);
      if (updateStatus) {
        setStatus(
          els.orchestratorStatus,
          error.message || 'Kunde inte läsa orkestreringsfärdplan.',
          true
        );
      }
    }
  }

  async function runOrchestrator() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet.');
      const prompt = (els.orchestratorPromptInput?.value || '').trim();
      if (!prompt) throw new Error('Skriv en intern uppgift först.');

      setStatus(els.orchestratorStatus, 'Kör orchestrator...');
      const response = await api('/orchestrator/admin-run', {
        method: 'POST',
        body: { prompt },
      });
      if (els.orchestratorResult) {
        els.orchestratorResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.orchestratorStatus,
        `Klar: intent=${response?.intent || '-'} risk=L${response?.output?.risk?.riskLevel || '-'}`
      );
      await Promise.all([loadDashboard(), loadOrchestratorMeta()]);
    } catch (error) {
      setStatus(els.orchestratorStatus, error.message || 'Kunde inte köra orchestrator.', true);
    }
  }

  function readIncidentIntelligenceOptions() {
    const rawDays = Number(els.incidentIntelTimeframeDays?.value || 14);
    const timeframeDays = Number.isFinite(rawDays) ? Math.max(1, Math.min(90, rawDays)) : 14;
    if (els.incidentIntelTimeframeDays) {
      els.incidentIntelTimeframeDays.value = String(timeframeDays);
    }
    return {
      includeClosed: Boolean(els.incidentIntelIncludeClosed?.checked),
      timeframeDays,
    };
  }

  function renderIncidentIntelligenceList(targetEl, rows = [], emptyMessage = '') {
    if (!targetEl) return;
    const safeRows = Array.isArray(rows) ? rows.filter((item) => String(item || '').trim()) : [];
    if (safeRows.length === 0) {
      targetEl.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'muted mini';
      li.textContent = emptyMessage;
      targetEl.appendChild(li);
      return;
    }
    targetEl.innerHTML = '';
    safeRows.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = row;
      targetEl.appendChild(li);
    });
  }

  function normalizeIncidentIntelligenceOutput(payload = null) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload?.output?.data && typeof payload.output === 'object') return payload.output;
    if (payload?.data && payload?.metadata) return payload;
    if (payload?.entry?.output?.data) return payload.entry.output;
    return null;
  }

  function renderIncidentIntelligence(output = null) {
    const normalized = normalizeIncidentIntelligenceOutput(output);
    const data = normalized?.data && typeof normalized.data === 'object' ? normalized.data : null;
    if (!data) {
      if (els.incidentIntelligenceSummary) {
        els.incidentIntelligenceSummary.textContent = 'Ingen incidentanalys ännu.';
      }
      if (els.incidentIntelligenceSeverity) {
        els.incidentIntelligenceSeverity.textContent = 'L3=0, L4=0, L5=0';
      }
      if (els.incidentIntelligenceRisk) {
        els.incidentIntelligenceRisk.textContent = '-';
      }
      renderIncidentIntelligenceList(
        els.incidentIntelligencePatterns,
        [],
        'Inga mönster ännu.'
      );
      renderIncidentIntelligenceList(
        els.incidentIntelligenceRecommendations,
        [],
        'Inga rekommendationer ännu.'
      );
      return;
    }

    const breakdown =
      data.severityBreakdown && typeof data.severityBreakdown === 'object'
        ? data.severityBreakdown
        : {};
    const l3 = Number(breakdown.L3 || 0);
    const l4 = Number(breakdown.L4 || 0);
    const l5 = Number(breakdown.L5 || 0);

    if (els.incidentIntelligenceSummary) {
      els.incidentIntelligenceSummary.textContent = String(data.summary || 'Ingen sammanfattning.');
    }
    if (els.incidentIntelligenceSeverity) {
      els.incidentIntelligenceSeverity.textContent = `L3=${l3}, L4=${l4}, L5=${l5}`;
    }
    if (els.incidentIntelligenceRisk) {
      els.incidentIntelligenceRisk.textContent = String(data.escalationRisk || '-');
    }
    renderIncidentIntelligenceList(
      els.incidentIntelligencePatterns,
      Array.isArray(data.recurringPatterns) ? data.recurringPatterns.slice(0, 3) : [],
      'Inga återkommande mönster upptäckta.'
    );
    renderIncidentIntelligenceList(
      els.incidentIntelligenceRecommendations,
      Array.isArray(data.recommendations) ? data.recommendations.slice(0, 5) : [],
      'Inga rekommendationer ännu.'
    );
  }

  async function loadIncidentIntelligence({ quiet = true } = {}) {
    try {
      const response = await api('/capabilities/analysis?capability=SummarizeIncidents&limit=1');
      const entry = Array.isArray(response?.entries) && response.entries.length > 0
        ? response.entries[0]
        : null;
      if (entry?.output) {
        renderIncidentIntelligence(entry.output);
        const generatedAt = String(entry?.output?.data?.generatedAt || entry?.createdAt || '').trim();
        if (!quiet) {
          setStatus(
            els.incidentIntelligenceStatus,
            generatedAt ? `Incidentanalys laddad (${generatedAt}).` : 'Incidentanalys laddad.'
          );
        }
        return;
      }
      renderIncidentIntelligence(null);
      if (!quiet) {
        setStatus(els.incidentIntelligenceStatus, 'Ingen tidigare incidentanalys hittades.');
      }
    } catch (error) {
      renderIncidentIntelligence(null);
      if (!quiet) {
        setStatus(
          els.incidentIntelligenceStatus,
          error.message || 'Kunde inte läsa incidentanalys.',
          true
        );
      }
    }
  }

  async function runIncidentIntelligence() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet.');
      const input = readIncidentIntelligenceOptions();
      setStatus(els.incidentIntelligenceStatus, 'Kör SummarizeIncidents...');
      const response = await api('/capabilities/SummarizeIncidents/run', {
        method: 'POST',
        body: {
          channel: 'admin',
          input,
        },
      });
      renderIncidentIntelligence(response?.output || null);
      const generatedAt = String(response?.output?.data?.generatedAt || '').trim();
      setStatus(
        els.incidentIntelligenceStatus,
        generatedAt
          ? `Incidentanalys uppdaterad (${generatedAt}).`
          : 'Incidentanalys uppdaterad.'
      );
    } catch (error) {
      setStatus(
        els.incidentIntelligenceStatus,
        error.message || 'Kunde inte köra incidentanalys.',
        true
      );
    }
  }

  function readDailyBriefOptions() {
    const rawDays = Number(els.dailyBriefTimeframeDays?.value || 14);
    const rawMaxTasks = Number(els.dailyBriefMaxTasks?.value || 5);
    const timeframeDays = Number.isFinite(rawDays) ? Math.max(1, Math.min(90, rawDays)) : 14;
    const maxTasks = Number.isFinite(rawMaxTasks) ? Math.max(1, Math.min(5, rawMaxTasks)) : 5;
    if (els.dailyBriefTimeframeDays) els.dailyBriefTimeframeDays.value = String(timeframeDays);
    if (els.dailyBriefMaxTasks) els.dailyBriefMaxTasks.value = String(maxTasks);
    return {
      includeClosed: Boolean(els.dailyBriefIncludeClosed?.checked),
      timeframeDays,
      maxTasks,
      includeEvidence: true,
    };
  }

  function normalizeDailyBriefOutput(payload = null) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload?.output?.data && typeof payload.output === 'object') return payload.output;
    if (payload?.data && payload?.metadata) return payload;
    if (payload?.entry?.output?.data) return payload.entry.output;
    return null;
  }

  function renderDailyBrief(output = null) {
    const normalized = normalizeDailyBriefOutput(output);
    const data = normalized?.data && typeof normalized.data === 'object' ? normalized.data : null;
    if (!data) {
      if (els.dailyBriefPriority) els.dailyBriefPriority.textContent = '-';
      if (els.dailyBriefSeverity) els.dailyBriefSeverity.textContent = 'L3=0, L4=0, L5=0';
      if (els.dailyBriefSummary) els.dailyBriefSummary.textContent = 'Ingen daily brief an.';
      renderIncidentIntelligenceList(
        els.dailyBriefRecommendations,
        [],
        'Inga rekommendationer an.'
      );
      return;
    }

    const incidentSummary =
      data.incidentSummary && typeof data.incidentSummary === 'object' ? data.incidentSummary : {};
    const severity =
      incidentSummary.severityBreakdown && typeof incidentSummary.severityBreakdown === 'object'
        ? incidentSummary.severityBreakdown
        : {};
    const l3 = Number(severity.L3 || 0);
    const l4 = Number(severity.L4 || 0);
    const l5 = Number(severity.L5 || 0);

    if (els.dailyBriefPriority) {
      els.dailyBriefPriority.textContent = String(data.priorityLevel || '-');
    }
    if (els.dailyBriefSeverity) {
      els.dailyBriefSeverity.textContent = `L3=${l3}, L4=${l4}, L5=${l5}`;
    }
    if (els.dailyBriefSummary) {
      els.dailyBriefSummary.textContent = String(data.executiveSummary || 'Ingen summary.');
    }
    renderIncidentIntelligenceList(
      els.dailyBriefRecommendations,
      Array.isArray(incidentSummary.recommendations) ? incidentSummary.recommendations.slice(0, 5) : [],
      'Inga rekommendationer an.'
    );
  }

  async function loadDailyBrief({ quiet = true } = {}) {
    try {
      const response = await api('/agents/analysis?agent=COO&limit=1');
      const entry = Array.isArray(response?.entries) && response.entries.length > 0
        ? response.entries[0]
        : null;
      if (entry?.output) {
        renderDailyBrief(entry.output);
        if (!quiet) {
          const generatedAt = String(entry?.output?.data?.generatedAt || '').trim();
          setStatus(
            els.dailyBriefStatus,
            generatedAt ? `Daily brief laddad (${generatedAt}).` : 'Daily brief laddad.'
          );
        }
        return;
      }
      renderDailyBrief(null);
      if (!quiet) setStatus(els.dailyBriefStatus, 'Ingen tidigare daily brief hittades.');
    } catch (error) {
      renderDailyBrief(null);
      if (!quiet) {
        setStatus(els.dailyBriefStatus, error.message || 'Kunde inte lasa daily brief.', true);
      }
    }
  }

  async function runDailyBrief() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behorighet.');
      const input = readDailyBriefOptions();
      setStatus(els.dailyBriefStatus, 'Kor COO Daily Brief...');
      const response = await api('/agents/COO/run', {
        method: 'POST',
        body: {
          channel: 'admin',
          input,
        },
      });
      renderDailyBrief(response?.output || null);
      const generatedAt = String(response?.output?.data?.generatedAt || '').trim();
      setStatus(
        els.dailyBriefStatus,
        generatedAt ? `Daily brief uppdaterad (${generatedAt}).` : 'Daily brief uppdaterad.'
      );
    } catch (error) {
      setStatus(els.dailyBriefStatus, error.message || 'Kunde inte kora daily brief.', true);
    }
  }

  function readCcoInboxOptions() {
    const rawMaxDrafts = Number(els.ccoInboxMaxDrafts?.value || 5);
    const maxDrafts = Number.isFinite(rawMaxDrafts) ? Math.max(1, Math.min(5, rawMaxDrafts)) : 5;
    if (els.ccoInboxMaxDrafts) {
      els.ccoInboxMaxDrafts.value = String(maxDrafts);
    }
    return {
      includeClosed: Boolean(els.ccoInboxIncludeClosed?.checked),
      maxDrafts,
    };
  }

  function generateClientIdempotencyKey(prefix = 'cco') {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now()}-${random}`;
  }

  const CCO_DEFAULT_SENDER_MAILBOX = 'contact@hairtpclinic.com';
  const CCO_DEFAULT_SIGNATURE_PROFILE = 'egzona';
  const CCO_SIGNATURE_SPLIT_PATTERN =
    /\n(?:Med vanliga halsningar,|Med vanlig halsning,|Basta halsningar,)\n[\s\S]*$/i;

  function normalizeCcoSignatureProfileKey(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'fazli') return 'fazli';
    return 'egzona';
  }

  function resolveDefaultSignatureForSenderMailbox(mailboxId = '') {
    const normalized = String(mailboxId || '').trim().toLowerCase();
    if (normalized === 'fazli@hairtpclinic.com') return 'fazli';
    return 'egzona';
  }

  function getCcoSignatureProfilesFromMetadata() {
    const outputMeta =
      state.ccoInboxData?.metadata && typeof state.ccoInboxData.metadata === 'object'
        ? state.ccoInboxData.metadata
        : {};
    const rawProfiles = Array.isArray(outputMeta.ccoSignatureProfiles)
      ? outputMeta.ccoSignatureProfiles
      : [];
    const normalizedProfiles = rawProfiles
      .map((item) => {
        const key = normalizeCcoSignatureProfileKey(item?.key);
        const fullName = String(item?.fullName || '').trim();
        const title = String(item?.title || '').trim();
        const senderMailboxId = String(item?.senderMailboxId || '').trim();
        if (!fullName || !title) return null;
        return {
          key,
          fullName,
          title,
          senderMailboxId,
        };
      })
      .filter(Boolean);
    if (normalizedProfiles.length) return normalizedProfiles;
    return [
      {
        key: 'egzona',
        fullName: 'Egzona Krasniqi',
        title: 'Hårspecialist I Hårtransplantationer & PRP-injektioner',
        senderMailboxId: 'egzona@hairtpclinic.com',
      },
      {
        key: 'fazli',
        fullName: 'Fazli Krasniqi',
        title: 'Hårspecialist I Hårtransplantationer & PRP-injektioner',
        senderMailboxId: 'fazli@hairtpclinic.com',
      },
    ];
  }

  function getCcoSenderMailboxOptionsFromMetadata() {
    const outputMeta =
      state.ccoInboxData?.metadata && typeof state.ccoInboxData.metadata === 'object'
        ? state.ccoInboxData.metadata
        : {};
    const fromMetadata = Array.isArray(outputMeta.ccoSenderMailboxOptions)
      ? outputMeta.ccoSenderMailboxOptions
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(Boolean)
      : [];
    const set = new Set(fromMetadata);
    if (!set.size) {
      set.add(CCO_DEFAULT_SENDER_MAILBOX);
      set.add('info@hairtpclinic.com');
      set.add('kons@hairtpclinic.com');
      set.add('marknad@hairtpclinic.com');
      set.add('egzona@hairtpclinic.com');
      set.add('fazli@hairtpclinic.com');
    }
    return Array.from(set);
  }

  function getCcoSelectedSignatureProfile() {
    const profiles = Array.isArray(state.ccoSignatureProfiles) ? state.ccoSignatureProfiles : [];
    const selectedKey = normalizeCcoSignatureProfileKey(state.ccoSignatureProfile);
    const selected = profiles.find((item) => item.key === selectedKey);
    if (selected) return selected;
    return profiles[0] || {
      key: 'egzona',
      fullName: 'Egzona Krasniqi',
      title: 'Hårspecialist I Hårtransplantationer & PRP-injektioner',
      senderMailboxId: 'egzona@hairtpclinic.com',
    };
  }

  function removeCcoSignatureFromDraft(text = '') {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    return normalized.replace(CCO_SIGNATURE_SPLIT_PATTERN, '').trimEnd();
  }

  function buildCcoSignatureBlock({
    profile = null,
    senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
  } = {}) {
    const resolvedProfile =
      profile && typeof profile === 'object' ? profile : getCcoSelectedSignatureProfile();
    const safeSenderMailbox =
      String(senderMailboxId || '').trim().toLowerCase() || CCO_DEFAULT_SENDER_MAILBOX;
    const safeTitle =
      String(resolvedProfile.title || '').trim() ||
      'Hårspecialist I Hårtransplantationer & PRP-injektioner';
    return [
      'Bästa hälsningar,',
      resolvedProfile.fullName,
      safeTitle,
      '031-88 11 66',
      safeSenderMailbox,
      'Vasaplatsen 2, 411 34 Göteborg',
    ].join('\n');
  }

  function getCcoSignatureSocialIconSvg(type = 'web') {
    if (type === 'instagram') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5Zm5.25-2.75a1.25 1.25 0 1 1 0 2.5a1.25 1.25 0 0 1 0-2.5Z"/></svg>';
    }
    if (type === 'facebook') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.4-.1c-2.4 0-4 1.4-4 4.1V11H8v3h2.9v8h2.6Z"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm7.9 9h-3.2a15 15 0 0 0-1.1-5A8 8 0 0 1 19.9 11ZM12 4.1c1.1 1.2 2 3.7 2.4 6.9H9.6c.4-3.2 1.3-5.7 2.4-6.9ZM4.1 13h3.2a15 15 0 0 0 1.1 5A8 8 0 0 1 4.1 13Zm0-2A8 8 0 0 1 8.4 6c-.5 1.3-.9 3-1.1 5H4.1Zm7.9 8a9 9 0 0 1-2.4-6h4.8a9 9 0 0 1-2.4 6Zm3.6-1c.5-1.3.9-3 1.1-5h3.2a8 8 0 0 1-4.3 5Z"/></svg>';
  }

  function buildCcoSignaturePreviewHtml({
    profile = null,
    senderMailboxId = CCO_DEFAULT_SENDER_MAILBOX,
  } = {}) {
    const resolvedProfile =
      profile && typeof profile === 'object' ? profile : getCcoSelectedSignatureProfile();
    const safeSenderMailbox =
      String(senderMailboxId || '').trim().toLowerCase() || CCO_DEFAULT_SENDER_MAILBOX;
    const safeName = String(resolvedProfile.fullName || '').trim() || 'Hair TP Clinic';
    const safeTitle =
      String(resolvedProfile.title || '').trim() ||
      'Hårspecialist I Hårtransplantationer & PRP-injektioner';
    const logoUrl = `${window.location.origin}/assets/hair-tp-clinic/hairtpclinic-mark-light.svg`;
    const websiteUrl = 'https://hairtpclinic.se';
    const instagramUrl = 'https://www.instagram.com/hairtpclinic/';
    const facebookUrl = 'https://www.facebook.com/hairtpclinic';

    return `
      <div class="cco-signature-rich">
        <img class="cco-signature-rich-logo" src="${escapeHtml(logoUrl)}" alt="Hair TP Clinic" />
        <div class="cco-signature-rich-content">
          <div class="cco-signature-rich-greeting">Bästa hälsningar,</div>
          <div class="cco-signature-rich-name">${escapeHtml(safeName)}</div>
          <div class="cco-signature-rich-title">${escapeHtml(safeTitle)}</div>
          <div class="cco-signature-rich-line">031-88 11 66</div>
          <div class="cco-signature-rich-line">${escapeHtml(safeSenderMailbox)}</div>
          <div class="cco-signature-rich-line">Vasaplatsen 2, 411 34 Göteborg</div>
          <div class="cco-signature-rich-links">
            <a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer" aria-label="Webb">${getCcoSignatureSocialIconSvg(
              'web'
            )}</a>
            <a href="${escapeHtml(instagramUrl)}" target="_blank" rel="noreferrer" aria-label="Instagram">${getCcoSignatureSocialIconSvg(
              'instagram'
            )}</a>
            <a href="${escapeHtml(facebookUrl)}" target="_blank" rel="noreferrer" aria-label="Facebook">${getCcoSignatureSocialIconSvg(
              'facebook'
            )}</a>
          </div>
        </div>
      </div>
    `;
  }

  function applyCcoSignatureToDraft({
    body = '',
    senderMailboxId = state.ccoSenderMailboxId,
    signatureProfile = null,
  } = {}) {
    const baseBody = removeCcoSignatureFromDraft(body);
    const signature = buildCcoSignatureBlock({
      profile: signatureProfile || getCcoSelectedSignatureProfile(),
      senderMailboxId,
    });
    if (!baseBody) return signature;
    return `${baseBody}\n\n${signature}`;
  }

  function syncCcoSignatureSelectors() {
    if (els.ccoSenderMailboxSelect) {
      const senderOptions = Array.isArray(state.ccoSenderMailboxOptions)
        ? state.ccoSenderMailboxOptions
        : [];
      const desiredValue =
        String(state.ccoSenderMailboxId || '').trim().toLowerCase() || CCO_DEFAULT_SENDER_MAILBOX;
      if (senderOptions.length) {
        const optionsHtml = senderOptions
          .map((mailboxId) => {
            const selected = mailboxId === desiredValue ? ' selected' : '';
            const suffix = mailboxId === CCO_DEFAULT_SENDER_MAILBOX ? ' · standardkonto' : '';
            const shortLabel = formatCcoMailboxShortLabel(mailboxId) || mailboxId;
            return `<option value="${escapeHtml(mailboxId)}"${selected} title="${escapeHtml(
              mailboxId
            )}">${escapeHtml(shortLabel)}${suffix}</option>`;
          })
          .join('');
        els.ccoSenderMailboxSelect.innerHTML = optionsHtml;
      }
      if (!senderOptions.includes(desiredValue) && senderOptions.length) {
        state.ccoSenderMailboxId = senderOptions[0];
      } else {
        state.ccoSenderMailboxId = desiredValue;
      }
      els.ccoSenderMailboxSelect.value = state.ccoSenderMailboxId;
    }

    if (els.ccoSignatureProfileSelect) {
      const profiles = Array.isArray(state.ccoSignatureProfiles) ? state.ccoSignatureProfiles : [];
      const selectedKey = normalizeCcoSignatureProfileKey(state.ccoSignatureProfile);
      const optionsHtml = profiles
        .map((profile) => {
          const selected = profile.key === selectedKey ? ' selected' : '';
          return `<option value="${escapeHtml(profile.key)}"${selected}>${escapeHtml(
            profile.fullName
          )}</option>`;
        })
        .join('');
      if (optionsHtml) els.ccoSignatureProfileSelect.innerHTML = optionsHtml;
      const hasSelected = profiles.some((item) => item.key === selectedKey);
      state.ccoSignatureProfile = hasSelected
        ? selectedKey
        : normalizeCcoSignatureProfileKey(profiles[0]?.key || CCO_DEFAULT_SIGNATURE_PROFILE);
      els.ccoSignatureProfileSelect.value = state.ccoSignatureProfile;
    }

    if (els.ccoInsertSignatureToggle) {
      els.ccoInsertSignatureToggle.checked = sanitizeCcoIncludeSignature(state.ccoIncludeSignature);
    }
  }

  function renderCcoSignaturePreview() {
    if (!els.ccoSignaturePreview) return;
    const profile = getCcoSelectedSignatureProfile();
    const safeName = String(profile?.fullName || '').trim() || 'Hair TP Clinic';
    const previewHtml = buildCcoSignaturePreviewHtml({
      profile,
      senderMailboxId: state.ccoSenderMailboxId,
    });
    if (els.ccoSignaturePreviewLabel) {
      els.ccoSignaturePreviewLabel.textContent = `Signatur: ${safeName}`;
    }
    const expanded = sanitizeCcoSignaturePreviewExpanded(state.ccoSignaturePreviewExpanded);
    if (els.ccoToggleSignaturePreviewBtn) {
      els.ccoToggleSignaturePreviewBtn.textContent = expanded
        ? 'Dölj signaturförhandsvisning'
        : 'Förhandsvisa med signatur';
      els.ccoToggleSignaturePreviewBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    els.ccoSignaturePreview.classList.toggle('is-collapsed', !expanded);
    els.ccoSignaturePreview.innerHTML = previewHtml;
  }

  function toggleCcoSignaturePreview() {
    state.ccoSignaturePreviewExpanded = !sanitizeCcoSignaturePreviewExpanded(
      state.ccoSignaturePreviewExpanded
    );
    persistCcoWorkspaceSessionState();
    renderCcoSignaturePreview();
  }

  function createCcoSprintId() {
    return generateClientIdempotencyKey('cco-sprint');
  }

  function toIsoOrNow(value) {
    const parsed = Date.parse(String(value || ''));
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return new Date().toISOString();
  }

  function toCcoTelemetryNumber(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  }

  function toCcoSprintSlaAgeHours(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*h$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function buildCcoOpenConversationRows(data = null) {
    return getSortedCcoConversations(data).filter(
      (row) => String(row?.needsReplyStatus || '').trim() !== 'handled'
    );
  }

  function summarizeCcoPriorityCounts(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    return safeRows.reduce(
      (acc, row) => {
        const priority = String(row?.priorityLevel || '').trim().toLowerCase();
        if (priority === 'critical') acc.critical += 1;
        if (priority === 'high') acc.high += 1;
        return acc;
      },
      { critical: 0, high: 0 }
    );
  }

  async function postCcoSprintEvent(eventType, metadata = {}) {
    const sprintId = String(metadata?.sprintId || state.ccoSprintId || '').trim();
    if (!sprintId) return null;
    try {
      return await api('/cco/sprint/event', {
        method: 'POST',
        headers: {
          'x-idempotency-key': generateClientIdempotencyKey(`cco-sprint-${eventType}`),
        },
        body: {
          channel: 'admin',
          eventType,
          sprintId,
          ...metadata,
        },
      });
    } catch (error) {
      console.warn('CCO sprint-telemetri misslyckades', error);
      return null;
    }
  }

  async function postCcoUsageEvent(eventType, metadata = {}) {
    const safeEventType = String(eventType || '').trim();
    if (!safeEventType) return null;
    try {
      return await api('/cco/usage/event', {
        method: 'POST',
        headers: {
          'x-idempotency-key': generateClientIdempotencyKey(`cco-usage-${safeEventType}`),
        },
        body: {
          channel: 'admin',
          eventType: safeEventType,
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      });
    } catch (error) {
      console.warn('CCO usage-telemetri misslyckades', error);
      return null;
    }
  }

  async function loadCcoMetrics({ since = '7d' } = {}) {
    try {
      const previousFocusActive = state.ccoAdaptiveFocusState?.isActive === true;
      const response = await api(`/cco/metrics?since=${encodeURIComponent(String(since || '7d'))}`);
      state.ccoSprintMetrics = response && typeof response === 'object' ? response : null;
      state.ccoSprintLatestFeedback =
        state.ccoSprintMetrics?.latestSprintFeedback &&
        typeof state.ccoSprintMetrics.latestSprintFeedback === 'object'
          ? state.ccoSprintMetrics.latestSprintFeedback
          : null;
      state.ccoUsageAnalytics =
        state.ccoSprintMetrics?.usageAnalytics &&
        typeof state.ccoSprintMetrics.usageAnalytics === 'object'
          ? state.ccoSprintMetrics.usageAnalytics
          : null;
      state.ccoRedFlagState =
        state.ccoSprintMetrics?.redFlagState &&
        typeof state.ccoSprintMetrics.redFlagState === 'object'
          ? state.ccoSprintMetrics.redFlagState
          : null;
      state.ccoAdaptiveFocusState =
        state.ccoSprintMetrics?.adaptiveFocusState &&
        typeof state.ccoSprintMetrics.adaptiveFocusState === 'object'
          ? state.ccoSprintMetrics.adaptiveFocusState
          : null;
      state.ccoRecoveryState =
        state.ccoSprintMetrics?.recoveryState &&
        typeof state.ccoSprintMetrics.recoveryState === 'object'
          ? state.ccoSprintMetrics.recoveryState
          : null;
      state.ccoStrategicInsights =
        state.ccoSprintMetrics?.strategicInsights &&
        typeof state.ccoSprintMetrics.strategicInsights === 'object'
          ? state.ccoSprintMetrics.strategicInsights
          : null;
      const currentFocusActive = state.ccoAdaptiveFocusState?.isActive === true;
      if (!currentFocusActive) {
        state.ccoAdaptiveFocusShowAll = false;
        state.ccoFocusWorkloadMinutes = 0;
      }
      if (previousFocusActive !== currentFocusActive) {
        postCcoUsageEvent('focus_mode_toggled', {
          isActive: currentFocusActive,
          source: 'system',
          workspaceId: 'cco',
        });
      }
      return state.ccoSprintMetrics;
    } catch (error) {
      console.warn('CCO metrics-hämtning misslyckades', error);
      return null;
    }
  }

  function normalizePriorityLevelForUi(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical') return 'Critical';
    if (normalized === 'high') return 'High';
    if (normalized === 'medium') return 'Medium';
    return 'Low';
  }

  function formatCcoPriorityLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical' || normalized === 'kritisk') return 'Kritisk';
    if (normalized === 'high' || normalized === 'hög' || normalized === 'hog') return 'Hög';
    if (normalized === 'medium' || normalized === 'medel') return 'Medel';
    return 'Låg';
  }

  function formatCcoConfidenceLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'high' || normalized === 'hög' || normalized === 'hog') return 'Hög';
    if (normalized === 'medium' || normalized === 'medel') return 'Medel';
    return 'Låg';
  }

  function formatCcoIntentLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      booking_request: 'Bokningsförfrågan',
      pricing_question: 'Prisfråga',
      anxiety_pre_op: 'Oro inför behandling',
      complaint: 'Klagomål',
      cancellation: 'Avbokning',
      follow_up: 'Uppföljning',
      unclear: 'Oklart',
    };
    return map[normalized] || (String(value || '').trim() || 'Oklart');
  }

  function formatCcoIntentIcon(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      booking_request: '📅',
      follow_up: '💬',
      pricing_question: '💰',
      complaint: '⚠',
      anxiety_pre_op: '😟',
      cancellation: '🗓',
      unclear: '❔',
    };
    return map[normalized] || '❔';
  }

  function formatCcoIntentChip(value = '') {
    return `${formatCcoIntentIcon(value)} ${formatCcoIntentLabel(value)}`;
  }

  function formatCcoToneLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      neutral: 'Neutral',
      stressed: 'Stressad',
      anxious: 'Orolig',
      frustrated: 'Frustrerad',
      urgent: 'Brådskande',
      positive: 'Positiv',
    };
    return map[normalized] || (String(value || '').trim() || 'Neutral');
  }

  function formatCcoToneIcon(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      anxious: '😟',
      frustrated: '😡',
      urgent: '⏰',
      stressed: '😵',
      positive: '🙂',
      neutral: '😐',
    };
    return map[normalized] || '😐';
  }

  function formatCcoToneChip(value = '') {
    return `${formatCcoToneIcon(value)} ${formatCcoToneLabel(value)}`;
  }

  function normalizeCcoMessageClassification(value = '') {
    return String(value || '').trim().toLowerCase() === 'system_mail'
      ? 'system_mail'
      : 'actionable';
  }

  function normalizeCcoLifecycleStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (
      [
        'new',
        'active_dialogue',
        'awaiting_reply',
        'follow_up_pending',
        'dormant',
        'handled',
        'archived',
      ].includes(normalized)
    ) {
      return normalized;
    }
    if (normalized === 'new_lead') return 'new';
    if (normalized === 'waiting' || normalized === 'waiting_on_customer') return 'awaiting_reply';
    if (normalized === 'follow_up_scheduled') return 'follow_up_pending';
    if (normalized === 'closed' || normalized === 'resolved') return 'handled';
    return 'new';
  }

  function formatCcoLifecycleLabel(value = '') {
    const normalized = normalizeCcoLifecycleStatus(value);
    const map = {
      new: 'Ny',
      active_dialogue: 'Aktiv dialog',
      awaiting_reply: 'Väntar svar',
      follow_up_pending: 'Uppföljning väntar',
      dormant: 'Vilande',
      handled: 'Hanterad',
      archived: 'Arkiverad',
    };
    return map[normalized] || 'Ny';
  }

  function formatCcoCaseStatusLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'open') return 'Öppen';
    if (normalized === 'waiting') return 'Väntar på kund';
    if (normalized === 'closed') return 'Stängd';
    if (normalized === 'follow_up_scheduled') return 'Uppföljning planerad';
    return 'Öppen';
  }

  function formatCcoTempoLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      responsive: 'Responsiv',
      reflective: 'Reflekterande',
      hesitant: 'Tveksam',
      low_engagement: 'Lågt engagemang',
    };
    return map[normalized] || 'Reflekterande';
  }

  function formatCcoDateTimeValue(value = '') {
    const ms = Date.parse(String(value || '').trim());
    if (!Number.isFinite(ms)) return '-';
    return new Date(ms).toLocaleString('sv-SE', { hour12: false });
  }

  function formatCcoTimingReasonLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      booking_next_weekday: 'Bokning nästa vardag',
      weekday_window: 'Optimalt vardagsfönster',
      pricing_2_3_days: 'Prisfråga 2–3 dagar',
      complaint_same_day: 'Klagomål samma dag',
      anxiety_evening_window: 'Oro: kvällsfönster',
      same_day_complaint_window: 'Snabbt klagomålsfönster',
      sunday_blocked: 'Söndag blockerad',
      tempo_responsive: 'Responsiv kundtempo',
      tempo_hesitant: 'Tveksam kundtempo',
      tempo_low_engagement: 'Lågt engagemang',
    };
    return map[normalized] || normalized || 'Standardfönster';
  }

  function normalizeCcoCustomerSummary(value = null, fallback = {}) {
    const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const timelineRaw = Array.isArray(safeValue.timeline) ? safeValue.timeline : [];
    const timeline = timelineRaw
      .map((entry) => ({
        conversationId: String(entry?.conversationId || '').trim(),
        subject: String(entry?.subject || '(utan ämne)').trim() || '(utan ämne)',
        status: String(entry?.status || 'open').trim() || 'open',
        occurredAt: String(entry?.occurredAt || '').trim() || null,
      }))
      .filter((entry) => entry.conversationId)
      .slice(0, 6);

    const safeFallback = fallback && typeof fallback === 'object' ? fallback : {};
    const interactionCount = Number(safeValue.interactionCount);
    const caseCount = Number(safeValue.caseCount);
    const engagementScore = Number(safeValue.engagementScore);
    const daysSinceLastInteraction = Number(safeValue.daysSinceLastInteraction);
    const daysSinceLastClosedCase = Number(safeValue.daysSinceLastClosedCase);
    return {
      customerKey:
        String(safeValue.customerKey || safeFallback.customerKey || '').trim() || 'unknown-customer',
      customerName:
        String(safeValue.customerName || safeFallback.customerName || 'Okänd kund').trim() ||
        'Okänd kund',
      lifecycleStatus: normalizeCcoLifecycleStatus(
        safeValue.lifecycleStatus || safeFallback.lifecycleStatus
      ),
      lifecycleSource:
        String(safeValue.lifecycleSource || safeFallback.lifecycleSource || 'auto').trim() || 'auto',
      interactionCount: Number.isFinite(interactionCount)
        ? Math.max(0, Math.round(interactionCount))
        : 0,
      caseCount: Number.isFinite(caseCount) ? Math.max(0, Math.round(caseCount)) : 0,
      lastInteractionAt: String(
        safeValue.lastInteractionAt || safeFallback.lastInteractionAt || ''
      ).trim() || null,
      daysSinceLastInteraction: Number.isFinite(daysSinceLastInteraction)
        ? Math.max(0, Math.round(daysSinceLastInteraction))
        : null,
      engagementScore: Number.isFinite(engagementScore)
        ? Math.max(0, Math.min(1, engagementScore))
        : 0,
      lastCaseSummary:
        String(safeValue.lastCaseSummary || safeFallback.lastCaseSummary || '').trim() || '-',
      daysSinceLastClosedCase: Number.isFinite(daysSinceLastClosedCase)
        ? Math.max(0, Math.round(daysSinceLastClosedCase))
        : null,
      timeline,
    };
  }

  function formatCcoSlaStatusLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    const map = {
      safe: 'säker',
      warning: 'varning',
      breach: 'överskriden',
    };
    return map[normalized] || 'säker';
  }

  function formatCcoSlaStatusChip(value = '') {
    const normalized = normalizeCcoSlaStatus(value);
    if (normalized === 'breach') return '🔴 SLA brott';
    if (normalized === 'warning') return '🟠 SLA varning';
    return '🟢 SLA säker';
  }

  function getCcoSlaChipClass(value = '') {
    const normalized = normalizeCcoSlaStatus(value);
    if (normalized === 'breach') return 'sla-breach';
    if (normalized === 'warning') return 'sla-warning';
    return 'sla-safe';
  }

  function getCcoSlaSortRank(value = '') {
    const normalized = normalizeCcoSlaStatus(value);
    if (normalized === 'breach') return 3;
    if (normalized === 'warning') return 2;
    return 1;
  }

  function getCcoLifecycleSortRank(value = '') {
    const normalized = normalizeCcoLifecycleStatus(value);
    const map = {
      follow_up_pending: 1,
      active_dialogue: 2,
      new: 3,
      awaiting_reply: 4,
      dormant: 5,
      handled: 6,
      archived: 7,
    };
    return Number(map[normalized] || 6);
  }

  function formatCcoSlaCountdown(hoursRemaining, slaStatus = '') {
    const normalized = normalizeCcoSlaStatus(slaStatus);
    const remaining = Number(hoursRemaining);
    if (normalized === 'breach') return 'SLA passerad';
    if (!Number.isFinite(remaining)) return 'SLA-tid okänd';
    const rounded = Math.max(0, Math.round(remaining * 10) / 10);
    return `${rounded}h kvar till SLA-brist`;
  }

  function getCcoClinicWindowByDay(dayIndex = 0) {
    if (dayIndex >= 1 && dayIndex <= 5) {
      return { startMinutes: 8 * 60, endMinutes: 20 * 60 };
    }
    if (dayIndex === 6) {
      return { startMinutes: 8 * 60, endMinutes: 18 * 60 };
    }
    return null;
  }

  function formatCcoWeekdaySv(dayIndex = 0) {
    const weekdays = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
    return weekdays[dayIndex] || 'vardag';
  }

  function formatCcoClock(date = new Date()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function getCcoClinicScheduleStatus(now = new Date()) {
    const current = now instanceof Date ? new Date(now.getTime()) : new Date();
    const currentDay = current.getDay();
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    const todayWindow = getCcoClinicWindowByDay(currentDay);
    if (
      todayWindow &&
      currentMinutes >= todayWindow.startMinutes &&
      currentMinutes < todayWindow.endMinutes
    ) {
      return {
        isOpen: true,
        message: '',
        nextOpenAt: null,
      };
    }

    for (let offset = 0; offset < 8; offset += 1) {
      const probe = new Date(current.getTime());
      probe.setSeconds(0, 0);
      probe.setDate(current.getDate() + offset);
      const window = getCcoClinicWindowByDay(probe.getDay());
      if (!window) continue;
      if (offset === 0 && currentMinutes < window.startMinutes) {
        probe.setHours(Math.floor(window.startMinutes / 60), window.startMinutes % 60, 0, 0);
        return {
          isOpen: false,
          message: `Kliniken är stängd. Nästa arbetspass: ${formatCcoClock(probe)}.`,
          nextOpenAt: probe,
        };
      }
      if (offset > 0) {
        probe.setHours(Math.floor(window.startMinutes / 60), window.startMinutes % 60, 0, 0);
        return {
          isOpen: false,
          message: `Kliniken är stängd. Nästa arbetspass: ${formatCcoWeekdaySv(
            probe.getDay()
          )} ${formatCcoClock(probe)}.`,
          nextOpenAt: probe,
        };
      }
    }

    return {
      isOpen: false,
      message: 'Kliniken är stängd.',
      nextOpenAt: null,
    };
  }

  function formatCcoFocusCountdown(row = null, scheduleState = null) {
    if (!row || typeof row !== 'object') return 'Paus';
    const schedule = scheduleState && typeof scheduleState === 'object' ? scheduleState : null;
    if (schedule && schedule.isOpen === false) return 'Paus';
    const normalized = normalizeCcoSlaStatus(row?.slaStatus);
    const remaining = Number(row?.hoursRemaining);
    if (normalized === 'breach') return 'SLA passerad';
    if (!Number.isFinite(remaining)) return 'SLA okänd';
    const rounded = Math.max(0, Math.round(remaining * 10) / 10);
    return `${rounded}h kvar`;
  }

  function buildCcoWorkloadBreakdownSummary(rows = []) {
    const source = Array.isArray(rows) ? rows : [];
    const total = source.reduce(
      (sum, row) => sum + clampCcoWorkloadMinutes(row?.estimatedWorkMinutes, 4),
      0
    );
    const aggregate = {
      base: 0,
      toneAdjustment: 0,
      priorityAdjustment: 0,
      warmthAdjustment: 0,
      lengthAdjustment: 0,
    };
    source.forEach((row) => {
      const breakdown = normalizeCcoWorkloadBreakdown(row?.workloadBreakdown, 4);
      aggregate.base += breakdown.base;
      aggregate.toneAdjustment += breakdown.toneAdjustment;
      aggregate.priorityAdjustment += breakdown.priorityAdjustment;
      aggregate.warmthAdjustment += breakdown.warmthAdjustment;
      aggregate.lengthAdjustment += breakdown.lengthAdjustment;
    });
    return { total, aggregate };
  }

  function formatCcoNeedsReplyLabel(value = '') {
    return String(value || '').trim().toLowerCase() === 'handled' ? 'Hanterad' : 'Behöver svar';
  }

  function formatCcoRecommendedAction(value = '') {
    const raw = String(value || '').trim();
    const normalized = raw.toLowerCase();
    const map = {
      'ask for more info': 'Be om mer info',
      'be om mer info': 'Be om mer info',
      escalate: 'Eskalera',
      'book appointment': 'Boka tid',
      'boka tid': 'Boka tid',
      'follow up': 'Följ upp',
      'följ upp': 'Följ upp',
      'provide reassurance': 'Ge lugnande återkoppling',
      'svara med prisinformation': 'Svara med prisinformation',
    };
    return map[normalized] || raw || 'Be om mer info';
  }

  function formatCcoSprintStatusLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'all clear') return 'Allt klart';
    if (normalized === 'immediate action') return 'Omedelbar åtgärd';
    if (normalized === 'attention needed') return 'Behöver uppmärksamhet';
    if (normalized === 'sprint complete') return 'Fokuskö klar';
    if (normalized === 'quick win') return 'Snabb vinst';
    return String(value || '').trim() || 'Behöver uppmärksamhet';
  }

  function normalizeCcoSlaStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['safe', 'warning', 'breach'].includes(normalized)) return normalized;
    if (normalized === 'ok') return 'safe';
    if (normalized === 'breached') return 'breach';
    if (['due_48h', 'due_24h', 'aging_24h', 'aging_48h'].includes(normalized)) return 'warning';
    return 'safe';
  }

  function normalizeCcoMailboxKey(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || '';
  }

  function isCcoAllowedMailbox(value = '') {
    const normalized = normalizeCcoMailboxKey(value);
    return normalized ? CCO_LOCKED_MAILBOX_ALLOWLIST_SET.has(normalized) : false;
  }

  function resolveCcoMailboxCandidates(row = null) {
    if (!row || typeof row !== 'object') return [];
    const candidates = [
      row.mailboxAddress,
      row.userPrincipalName,
      row.mailboxId,
    ]
      .map((item) => normalizeCcoMailboxKey(item))
      .filter(Boolean);
    return Array.from(new Set(candidates));
  }

  function resolveCcoMailboxLabel(row = null) {
    const candidates = resolveCcoMailboxCandidates(row);
    if (!candidates.length) return '';
    for (const candidate of candidates) {
      if (isCcoAllowedMailbox(candidate)) return candidate;
    }
    return candidates[0];
  }

  function formatCcoMailboxShortLabel(value = '') {
    const mailbox = normalizeCcoMailboxKey(value);
    if (!mailbox) return '';
    const localPart = mailbox.includes('@') ? mailbox.split('@')[0] : mailbox;
    if (!localPart) return mailbox;
    return localPart;
  }

  function isCcoAllowedMailboxRow(row = null) {
    const candidates = resolveCcoMailboxCandidates(row);
    if (!candidates.length) return false;
    return candidates.some((candidate) => isCcoAllowedMailbox(candidate));
  }

  function resolveCcoUnansweredThresholdHours(intent = '') {
    const normalizedIntent = String(intent || '').trim().toLowerCase();
    if (normalizedIntent === 'complaint') return 6;
    if (normalizedIntent === 'booking_request') return 12;
    if (normalizedIntent === 'pricing_question') return 24;
    return 24;
  }

  function isCcoConversationUnanswered(row = null) {
    if (!row || typeof row !== 'object') return false;
    if (String(row.needsReplyStatus || '').trim().toLowerCase() === 'handled') return false;
    if (typeof row.isUnanswered === 'boolean') return row.isUnanswered === true;
    const threshold =
      Number.isFinite(Number(row.unansweredThresholdHours)) && Number(row.unansweredThresholdHours) > 0
        ? Number(row.unansweredThresholdHours)
        : resolveCcoUnansweredThresholdHours(row.intent);
    const hoursSinceInbound = Number(row.hoursSinceInbound || 0);
    if (!Number.isFinite(hoursSinceInbound)) return false;
    return hoursSinceInbound >= threshold;
  }

  function isCcoConversationNewSinceLastVisit(row = null) {
    if (!row || typeof row !== 'object') return false;
    const conversationId = String(row.conversationId || '').trim();
    if (!conversationId) return false;
    if (state.ccoSeenConversationIds?.[conversationId] === true) return false;
    const lastInboundMs = Date.parse(String(row.lastInboundAt || ''));
    if (!Number.isFinite(lastInboundMs)) return false;
    return lastInboundMs > Number(state.ccoLastSeenAtMs || 0);
  }

  function classifyCcoRelationshipStatus(row = null) {
    if (!row || typeof row !== 'object') return 'new';
    const summary = row.customerSummary && typeof row.customerSummary === 'object'
      ? row.customerSummary
      : {};
    const lifecycleStatus = String(summary.lifecycleStatus || '').trim().toLowerCase();
    const interactionCount = Number(summary.interactionCount || 0);
    if (lifecycleStatus === 'dormant') return 'dormant';
    if (interactionCount >= 6 || lifecycleStatus === 'handled') return 'loyal';
    if (
      ['active_dialogue', 'awaiting_reply', 'follow_up_pending'].includes(lifecycleStatus) ||
      interactionCount >= 3
    ) {
      return 'returning';
    }
    return 'new';
  }

  function formatCcoRelationshipChip(status = 'new') {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'dormant') return '💤 Vilande';
    if (normalized === 'loyal') return '⭐ Lojal';
    if (normalized === 'returning') return '🔁 Återkommande';
    return '🆕 Ny';
  }

  function formatCcoRelationshipShortLabel(status = 'new') {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'dormant') return 'Vilande';
    if (normalized === 'loyal') return 'Lojal';
    if (normalized === 'returning') return 'Återkommande';
    return 'Ny';
  }

  function getCcoSlaToneClass(row = null) {
    const status = normalizeCcoSlaStatus(row?.slaStatus);
    if (status === 'breach') return 'sla-tone-breach';
    if (status === 'warning') return 'sla-tone-warning';
    return '';
  }

  function sanitizeCcoPreviewText(value = '') {
    let text = String(value || '');
    if (!text) return '';
    text = text
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/\.cco-[\w-]+\s*\{[^}]*\}/gi, ' ')
      .replace(/\.signature-[\w-]+\s*\{[^}]*\}/gi, ' ')
      .replace(/(^|\s)([.#][\w-]+)\s*\{[^}]*\}/g, ' ')
      .replace(/[a-z0-9_.#:-]+\s*\{[^{}]*\}/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return text;
  }

  function isLikelyCcoSystemMessage(row = null) {
    if (!row || typeof row !== 'object') return false;
    const conversationId = String(row.conversationId || '').trim();
    if (conversationId) {
      const manualFlag = state.ccoSystemMessageByConversationId?.[conversationId];
      if (manualFlag === true) return true;
      if (manualFlag === false) return false;
    }
    if (normalizeCcoMessageClassification(row.messageClassification) === 'system_mail') return true;
    const subject = safeLower(row.subject || '');
    const preview = safeLower(row.latestInboundPreview || '');
    const sender = safeLower(row.sender || '');
    const haystack = `${subject} ${preview} ${sender}`;
    const senderPatterns = sanitizeCcoSystemPatternList(state.ccoSystemMessageSenderPatterns);
    if (senderPatterns.some((pattern) => pattern && sender.includes(pattern))) {
      return true;
    }
    const subjectPatterns = sanitizeCcoSystemPatternList(state.ccoSystemMessageSubjectPatterns);
    const subjectHaystack = `${subject} ${preview}`;
    if (subjectPatterns.some((pattern) => pattern && subjectHaystack.includes(pattern))) {
      return true;
    }
    const knownNoisePatterns = [
      'power up your productivity with microsoft 365',
      'verify your email',
      'du får inte ofta e-post',
      'get more done with apps like word',
      'microsoft 365',
      'noreply@',
      'no-reply@',
      'do-not-reply',
      'unsubscribe',
      'orderbekräftelse',
      'orderbekraftelse',
      'beställningsbekräftelse',
      'bestallningsbekraftelse',
      'kvitto',
      'receipt',
      'faktura',
      'invoice',
      'kampanj',
      'newsletter',
      'bekräfta din e-post',
      'bekrafta din e-post',
    ];
    const matchesNoise = knownNoisePatterns.some((pattern) => haystack.includes(pattern));
    if (!matchesNoise) return false;
    const intent = safeLower(row.intent || 'unclear');
    const priority = safeLower(row.priorityLevel || '');
    const highPriority = ['critical', 'high', 'kritisk', 'hög', 'hog'].includes(priority);
    return !highPriority && ['unclear', 'follow_up'].includes(intent);
  }

  function extractEmailFromText(text = '') {
    const source = String(text || '').trim().toLowerCase();
    if (!source) return '';
    const match = source.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return String(match?.[0] || '').trim().toLowerCase();
  }

  function isCcoSystemMessageRow(row = null) {
    return isLikelyCcoSystemMessage(row);
  }

  function enrichCcoConversationRow(row = null) {
    if (!row || typeof row !== 'object') return row;
    const relationshipStatus = classifyCcoRelationshipStatus(row);
    const lifecycleStatus = normalizeCcoLifecycleStatus(row?.customerSummary?.lifecycleStatus);
    return {
      ...row,
      latestInboundPreview: sanitizeCcoPreviewText(row.latestInboundPreview || ''),
      mailboxLabel: resolveCcoMailboxLabel(row),
      lifecycleStatus,
      relationshipStatus,
      relationshipLabel: formatCcoRelationshipChip(relationshipStatus),
      isUnanswered: isCcoConversationUnanswered(row),
      isNewSinceLastVisit: isCcoConversationNewSinceLastVisit(row),
    };
  }

  function getCcoFilteredConversations(rows = [], options = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const includeSystemMessages = sanitizeCcoShowSystemMessages(state.ccoInboxShowSystemMessages);
    const searchQuery = sanitizeCcoSearchQuery(state.ccoInboxSearchQuery);
    const withMeta = options && options.withMeta === true;
    let filtered = source
      .map((row) => enrichCcoConversationRow(row))
      .filter((row) => isCcoAllowedMailboxRow(row))
      .filter((row) => row?.deleted !== true);
    const totalAllowedRows = filtered.length;
    let hiddenSystemRows = 0;

    if (!includeSystemMessages) {
      const beforeSystemFilter = filtered.length;
      filtered = filtered.filter((row) => !isLikelyCcoSystemMessage(row));
      hiddenSystemRows = Math.max(0, beforeSystemFilter - filtered.length);
    }
    const totalAfterSystemFilter = filtered.length;

    const mailboxFilter = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter);
    if (mailboxFilter !== 'all') {
      filtered = filtered.filter(
        (row) => normalizeCcoMailboxKey(row.mailboxLabel) === mailboxFilter
      );
    }

    const slaFilter = sanitizeCcoSlaFilter(state.ccoInboxSlaFilter);
    if (slaFilter === 'new') {
      filtered = filtered.filter((row) => row.isNewSinceLastVisit === true);
    } else if (['breach', 'warning', 'safe'].includes(slaFilter)) {
      filtered = filtered.filter((row) => normalizeCcoSlaStatus(row.slaStatus) === slaFilter);
    }

    const lifecycleFilter = sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter);
    if (lifecycleFilter !== 'all') {
      filtered = filtered.filter(
        (row) => normalizeCcoLifecycleStatus(row.lifecycleStatus) === lifecycleFilter
      );
    }

    const totalBeforeSearch = filtered.length;
    if (searchQuery) {
      const needle = searchQuery.toLowerCase();
      filtered = filtered.filter((row) => {
        const customerName = safeLower(row?.customerSummary?.customerName || '');
        const sender = safeLower(row?.sender || '');
        const subject = safeLower(row?.subject || '');
        const preview = safeLower(row?.latestInboundPreview || '');
        const mailbox = safeLower(row?.mailboxLabel || '');
        const history = asArray(row?.customerSummary?.timeline)
          .slice(0, 12)
          .map((entry) =>
            `${safeLower(entry?.subject || '')} ${safeLower(entry?.status || '')} ${safeLower(
              entry?.occurredAt || ''
            )}`
          )
          .join(' ');
        return `${customerName} ${sender} ${subject} ${preview} ${mailbox} ${history}`.includes(
          needle
        );
      });
    }

    if (!withMeta) return filtered;

    return {
      rows: filtered,
      meta: {
        includeSystemMessages,
        hiddenSystemRows,
        totalAllowedRows,
        totalAfterSystemFilter,
        totalBeforeSearch,
        searchQuery,
        matchedRows: filtered.length,
      },
    };
  }

  function normalizeCcoPriorityReasons(value = []) {
    const source = Array.isArray(value) ? value : [];
    return source
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function normalizeCcoDraftMode(value = '', fallback = 'professional') {
    const normalized = String(value || '').trim().toLowerCase();
    if (['short', 'warm', 'professional'].includes(normalized)) return normalized;
    if (fallback === '') return '';
    return ['short', 'warm', 'professional'].includes(fallback) ? fallback : 'professional';
  }

  function normalizeCcoDraftModes(value = null, fallbackReply = '') {
    const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const fallbackText =
      String(fallbackReply || '').trim() ||
      'Hej,\n\nTack för ditt meddelande.\n\nVänligen återkom med mer information så hjälper vi dig vidare.';
    return {
      short: String(safeValue.short || '').trim() || fallbackText,
      warm: String(safeValue.warm || '').trim() || fallbackText,
      professional: String(safeValue.professional || '').trim() || fallbackText,
    };
  }

  function normalizeCcoDraftStructure(value = null) {
    const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      acknowledgement:
        String(safeValue.acknowledgement || '').trim() || 'Tack för ditt meddelande.',
      coreAnswer:
        String(safeValue.coreAnswer || '').trim() ||
        'Vi har tagit emot ditt ärende och återkommer med tydlig återkoppling.',
      cta:
        String(safeValue.cta || '').trim() ||
        'Vänligen återkom med kompletterande information så hjälper vi dig vidare.',
    };
  }

  function clampCcoWorkloadMinutes(value, fallback = 4) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return Math.max(2, Math.min(25, Math.round(fallback)));
    return Math.max(2, Math.min(25, Math.round(parsed)));
  }

  function normalizeCcoWorkloadBreakdown(value = null, fallbackMinutes = 4) {
    const safe = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const numeric = (key, fallback = 0) => {
      const parsed = Number(safe[key]);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const base = numeric('base', fallbackMinutes);
    const toneAdjustment = numeric('toneAdjustment', 0);
    const priorityAdjustment = numeric('priorityAdjustment', 0);
    const warmthAdjustment = numeric('warmthAdjustment', 0);
    const lengthAdjustment = numeric('lengthAdjustment', 0);
    return {
      base,
      toneAdjustment,
      priorityAdjustment,
      warmthAdjustment,
      lengthAdjustment,
    };
  }

  function resolveCcoWorkloadWarmth(row = null) {
    const summary = row?.customerSummary && typeof row.customerSummary === 'object'
      ? row.customerSummary
      : {};
    const lifecycle = String(summary.lifecycleStatus || '').trim().toLowerCase();
    const interactionCount = Number(summary.interactionCount || 0);
    if (lifecycle === 'dormant') return 'dormant';
    if (interactionCount >= 6 || lifecycle === 'handled') return 'loyal';
    if (
      ['active_dialogue', 'awaiting_reply', 'follow_up_pending'].includes(lifecycle) ||
      interactionCount >= 3
    ) {
      return 'returning';
    }
    return 'new';
  }

  function estimateCcoFallbackWorkload(row = null) {
    const intent = String(row?.intent || '').trim().toLowerCase();
    const tone = String(row?.tone || '').trim().toLowerCase();
    const priority = normalizePriorityLevelForUi(row?.priorityLevel);
    const warmth = resolveCcoWorkloadWarmth(row);
    const previewLength = String(row?.latestInboundPreview || '').trim().length;
    const baseByIntent = {
      complaint: 8,
      booking_request: 5,
      pricing_question: 4,
      follow_up: 3,
      cancellation: 3,
    };
    const toneAdjustments = {
      frustrated: 3,
      anxious: 2,
      urgent: 2,
      stressed: 1,
      positive: -1,
    };
    const priorityAdjustments = {
      Critical: 3,
      High: 2,
      Medium: 1,
      Low: 0,
    };
    const warmthAdjustments = {
      new: 1,
      returning: 0,
      loyal: -1,
      dormant: 1,
    };
    const lengthAdjustment = previewLength >= 1200 ? 3 : previewLength >= 800 ? 2 : 0;
    const breakdown = {
      base: Number.isFinite(baseByIntent[intent]) ? baseByIntent[intent] : 4,
      toneAdjustment: Number.isFinite(toneAdjustments[tone]) ? toneAdjustments[tone] : 0,
      priorityAdjustment: Number.isFinite(priorityAdjustments[priority]) ? priorityAdjustments[priority] : 0,
      warmthAdjustment: Number.isFinite(warmthAdjustments[warmth]) ? warmthAdjustments[warmth] : 0,
      lengthAdjustment,
    };
    const total = clampCcoWorkloadMinutes(
      breakdown.base +
        breakdown.toneAdjustment +
        breakdown.priorityAdjustment +
        breakdown.warmthAdjustment +
        breakdown.lengthAdjustment,
      4
    );
    return {
      estimatedWorkMinutes: total,
      workloadBreakdown: breakdown,
    };
  }

  function resolveCcoWorkload(row = null) {
    const estimatedMinutes = Number(row?.estimatedWorkMinutes);
    const fallback = estimateCcoFallbackWorkload(row);
    const estimatedWorkMinutes = Number.isFinite(estimatedMinutes)
      ? clampCcoWorkloadMinutes(estimatedMinutes, fallback.estimatedWorkMinutes)
      : fallback.estimatedWorkMinutes;
    const workloadBreakdown = normalizeCcoWorkloadBreakdown(
      row?.workloadBreakdown,
      fallback.workloadBreakdown.base
    );
    return {
      estimatedWorkMinutes,
      workloadBreakdown,
    };
  }

  function formatCcoDraftModeLabel(value = '') {
    const normalized = normalizeCcoDraftMode(value, 'professional');
    if (normalized === 'short') return 'Kort';
    if (normalized === 'warm') return 'Varm';
    return 'Professionell';
  }

  function normalizeCcoInboxOutput(payload = null) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload?.output?.data && typeof payload.output === 'object') return payload.output;
    if (payload?.data && payload?.metadata) return payload;
    if (payload?.entry?.output?.data) return payload.entry.output;
    return null;
  }

  function buildCcoFallbackConversationRowsFromFeed(feedEntries = [], { direction = 'inbound' } = {}) {
    const source = Array.isArray(feedEntries) ? feedEntries : [];
    if (!source.length) return [];
    const normalizedDirection = String(direction || '').trim().toLowerCase() === 'outbound'
      ? 'outbound'
      : 'inbound';
    const nowMs = Date.now();
    const rows = [];
    for (const item of source) {
      const conversationId = String(item?.conversationId || '').trim();
      if (!conversationId) continue;
      const sentAt = String(item?.sentAt || item?.receivedAt || '').trim();
      const sentMs = Date.parse(sentAt);
      const hoursSinceInbound = Number.isFinite(sentMs)
        ? Math.max(0, Number(((nowMs - sentMs) / 3600000).toFixed(1)))
        : 0;
      rows.push({
        conversationId,
        messageId: String(item?.messageId || '').trim(),
        mailboxId: String(item?.mailboxId || item?.mailboxAddress || '').trim(),
        mailboxAddress: String(item?.mailboxAddress || item?.mailboxId || '').trim(),
        userPrincipalName: String(item?.userPrincipalName || '').trim(),
        subject: String(item?.subject || '(utan ämne)').trim() || '(utan ämne)',
        sender: String(item?.counterpart || item?.sender || item?.recipient || 'okänd avsändare').trim() || 'okänd avsändare',
        latestInboundPreview: sanitizeCcoPreviewText(item?.preview || item?.bodyPreview || ''),
        hoursSinceInbound,
        lastInboundAt: normalizedDirection === 'inbound' ? sentAt : '',
        lastOutboundAt: normalizedDirection === 'outbound' ? sentAt : '',
        slaStatus: 'safe',
        hoursRemaining: 0,
        slaThreshold: 48,
        isUnanswered: normalizedDirection === 'inbound',
        unansweredThresholdHours: 24,
        stagnated: false,
        stagnationHours: 0,
        followUpSuggested: false,
        intent: 'unclear',
        intentConfidence: 0.3,
        tone: 'neutral',
        toneConfidence: 0.4,
        priorityLevel: 'Medium',
        priorityScore: 0,
        priorityReasons: [],
        customerKey: extractEmailFromText(item?.counterpart || item?.sender || item?.recipient || ''),
        customerSummary: null,
        lifecycleStatus: 'new',
        tempoProfile: 'reflective',
        recommendedFollowUpDelayDays: 5,
        ctaIntensity: 'normal',
        followUpSuggestedAt: null,
        followUpTimingReason: [],
        followUpUrgencyLevel: 'normal',
        followUpManualApprovalRequired: true,
        estimatedWorkMinutes: 4,
        workloadBreakdown: normalizeCcoWorkloadBreakdown(null, 4),
        recommendedAction: normalizedDirection === 'inbound' ? 'Granska och svara' : 'Skickat svar registrerat',
        escalationRequired: false,
        messageClassification: normalizeCcoMessageClassification(item?.messageClassification || 'regular'),
        needsReplyStatus: normalizedDirection === 'inbound' ? 'needs_reply' : 'handled',
        confidenceLevel: 'Low',
        draftModes: normalizeCcoDraftModes(null, ''),
        recommendedMode: 'professional',
        structureUsed: normalizeCcoDraftStructure(null),
        proposedReply: '',
      });
    }
    return rows;
  }

  function buildCcoConversationMap(data = null) {
    const safeData = data && typeof data === 'object' ? data : {};
    const map = new Map();
    const worklist = Array.isArray(safeData.conversationWorklist)
      ? safeData.conversationWorklist
      : [];
    const needsReplyToday = Array.isArray(safeData.needsReplyToday)
      ? safeData.needsReplyToday
      : [];
    const inboundFeed = Array.isArray(safeData.inboundFeed)
      ? safeData.inboundFeed
      : [];
    const outboundFeed = Array.isArray(safeData.outboundFeed)
      ? safeData.outboundFeed
      : [];
    const drafts = Array.isArray(safeData.suggestedDrafts) ? safeData.suggestedDrafts : [];
    const worklistSeed = [...worklist, ...needsReplyToday];
    if (!worklistSeed.length) {
      const inboundFallbackRows = buildCcoFallbackConversationRowsFromFeed(inboundFeed, {
        direction: 'inbound',
      });
      worklistSeed.push(...inboundFallbackRows);
      if (!worklistSeed.length) {
        const outboundFallbackRows = buildCcoFallbackConversationRowsFromFeed(outboundFeed, {
          direction: 'outbound',
        });
        worklistSeed.push(...outboundFallbackRows);
      }
    }
    const customerSummaries = Array.isArray(safeData.customerSummaries)
      ? safeData.customerSummaries
      : [];
    const customerSummaryByKey = new Map();
    for (const summary of customerSummaries) {
      const normalized = normalizeCcoCustomerSummary(summary);
      if (!normalized.customerKey) continue;
      customerSummaryByKey.set(normalized.customerKey, normalized);
    }

    for (const row of worklistSeed) {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId) continue;
      const mailboxLabel = resolveCcoMailboxLabel(row);
      if (!isCcoAllowedMailbox(mailboxLabel)) continue;
      const customerKey = String(row?.customerKey || '').trim();
      const fallbackCustomer = {
        customerKey,
        customerName: String(row?.sender || 'Okänd kund').trim() || 'Okänd kund',
      };
      const customerSummary = normalizeCcoCustomerSummary(
        row?.customerSummary,
        customerSummaryByKey.get(customerKey) || fallbackCustomer
      );
      map.set(conversationId, {
        conversationId,
        messageId: String(row?.messageId || '').trim(),
        mailboxId: String(row?.mailboxId || '').trim(),
        mailboxAddress: mailboxLabel,
        userPrincipalName: mailboxLabel,
        subject: String(row?.subject || '(utan ämne)').trim() || '(utan ämne)',
        sender: String(row?.sender || 'okänd avsändare').trim() || 'okänd avsändare',
        latestInboundPreview: sanitizeCcoPreviewText(row?.latestInboundPreview || ''),
        hoursSinceInbound: Number(row?.hoursSinceInbound || 0),
        lastInboundAt: String(row?.lastInboundAt || '').trim(),
        lastOutboundAt: String(row?.lastOutboundAt || '').trim(),
        slaStatus: normalizeCcoSlaStatus(row?.slaStatus),
        hoursRemaining: Number.isFinite(Number(row?.hoursRemaining))
          ? Number(row?.hoursRemaining)
          : 0,
        slaThreshold: Number.isFinite(Number(row?.slaThreshold))
          ? Math.max(1, Number(row?.slaThreshold))
          : 48,
        isUnanswered: row?.isUnanswered === true,
        unansweredThresholdHours: Number.isFinite(Number(row?.unansweredThresholdHours))
          ? Math.max(1, Number(row?.unansweredThresholdHours))
          : resolveCcoUnansweredThresholdHours(row?.intent),
        stagnated: row?.stagnated === true,
        stagnationHours: Number.isFinite(Number(row?.stagnationHours))
          ? Math.max(0, Number(row?.stagnationHours))
          : 0,
        followUpSuggested: row?.followUpSuggested === true,
        intent: String(row?.intent || 'unclear').trim() || 'unclear',
        intentConfidence: Number(row?.intentConfidence || 0.3),
        tone: String(row?.tone || 'neutral').trim() || 'neutral',
        toneConfidence: Number(row?.toneConfidence || 0.4),
        priorityLevel: normalizePriorityLevelForUi(row?.priorityLevel),
        priorityScore: Number(row?.priorityScore || 0),
        priorityReasons: normalizeCcoPriorityReasons(row?.priorityReasons),
        customerKey: customerSummary.customerKey,
        customerSummary,
        lifecycleStatus: normalizeCcoLifecycleStatus(customerSummary.lifecycleStatus),
        tempoProfile: String(row?.tempoProfile || 'reflective').trim() || 'reflective',
        recommendedFollowUpDelayDays: Number.isFinite(Number(row?.recommendedFollowUpDelayDays))
          ? Math.max(0, Number(row?.recommendedFollowUpDelayDays))
          : 5,
        ctaIntensity: String(row?.ctaIntensity || 'normal').trim() || 'normal',
        followUpSuggestedAt: String(row?.followUpSuggestedAt || '').trim() || null,
        followUpTimingReason: Array.isArray(row?.followUpTimingReason)
          ? row.followUpTimingReason.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
          : [],
        followUpUrgencyLevel: String(row?.followUpUrgencyLevel || 'normal').trim() || 'normal',
        followUpManualApprovalRequired: row?.followUpManualApprovalRequired !== false,
        estimatedWorkMinutes: clampCcoWorkloadMinutes(row?.estimatedWorkMinutes, 4),
        workloadBreakdown: normalizeCcoWorkloadBreakdown(row?.workloadBreakdown, 4),
        recommendedAction: String(row?.recommendedAction || 'Be om mer info').trim() || 'Be om mer info',
        escalationRequired: Boolean(row?.escalationRequired),
        messageClassification: normalizeCcoMessageClassification(row?.messageClassification),
        needsReplyStatus: String(row?.needsReplyStatus || 'needs_reply').trim() === 'handled'
          ? 'handled'
          : 'needs_reply',
        confidenceLevel: 'Low',
        draftModes: normalizeCcoDraftModes(row?.draftModes, ''),
        recommendedMode: normalizeCcoDraftMode(row?.recommendedMode, 'professional'),
        structureUsed: normalizeCcoDraftStructure(row?.structureUsed),
        proposedReply: '',
      });
    }

    for (const draft of drafts) {
      const conversationId = String(draft?.conversationId || '').trim();
      if (!conversationId) continue;
      const mailboxLabel = resolveCcoMailboxLabel(draft);
      if (!isCcoAllowedMailbox(mailboxLabel)) continue;
      const customerKey = String(draft?.customerKey || '').trim();
      const fallbackCustomer = {
        customerKey,
        customerName: String(draft?.sender || 'Okänd kund').trim() || 'Okänd kund',
      };
      const customerSummary = normalizeCcoCustomerSummary(
        draft?.customerSummary,
        customerSummaryByKey.get(customerKey) || fallbackCustomer
      );
      const current = map.get(conversationId) || {
        conversationId,
        messageId: String(draft?.messageId || '').trim(),
        mailboxId: String(draft?.mailboxId || '').trim(),
        mailboxAddress: mailboxLabel,
        userPrincipalName: mailboxLabel,
        subject: String(draft?.subject || '(utan ämne)').trim() || '(utan ämne)',
        sender: String(draft?.sender || 'okänd avsändare').trim() || 'okänd avsändare',
        latestInboundPreview: sanitizeCcoPreviewText(draft?.latestInboundPreview || ''),
        hoursSinceInbound: Number(draft?.hoursSinceInbound || 0),
        lastInboundAt: '',
        lastOutboundAt: String(draft?.lastOutboundAt || '').trim(),
        slaStatus: normalizeCcoSlaStatus(draft?.slaStatus),
        hoursRemaining: Number.isFinite(Number(draft?.hoursRemaining))
          ? Number(draft?.hoursRemaining)
          : 0,
        slaThreshold: Number.isFinite(Number(draft?.slaThreshold))
          ? Math.max(1, Number(draft?.slaThreshold))
          : 48,
        isUnanswered: draft?.isUnanswered === true,
        unansweredThresholdHours: Number.isFinite(Number(draft?.unansweredThresholdHours))
          ? Math.max(1, Number(draft?.unansweredThresholdHours))
          : resolveCcoUnansweredThresholdHours(draft?.intent),
        stagnated: draft?.stagnated === true,
        stagnationHours: Number.isFinite(Number(draft?.stagnationHours))
          ? Math.max(0, Number(draft?.stagnationHours))
          : 0,
        followUpSuggested: draft?.followUpSuggested === true,
        intent: String(draft?.intent || 'unclear').trim() || 'unclear',
        intentConfidence: Number(draft?.intentConfidence || 0.3),
        tone: String(draft?.tone || 'neutral').trim() || 'neutral',
        toneConfidence: Number(draft?.toneConfidence || 0.4),
        priorityLevel: normalizePriorityLevelForUi(draft?.priorityLevel),
        priorityScore: Number(draft?.priorityScore || 0),
        priorityReasons: normalizeCcoPriorityReasons(draft?.priorityReasons),
        customerKey: customerSummary.customerKey,
        customerSummary,
        lifecycleStatus: normalizeCcoLifecycleStatus(customerSummary.lifecycleStatus),
        tempoProfile: String(draft?.tempoProfile || 'reflective').trim() || 'reflective',
        recommendedFollowUpDelayDays: Number.isFinite(Number(draft?.recommendedFollowUpDelayDays))
          ? Math.max(0, Number(draft?.recommendedFollowUpDelayDays))
          : 5,
        ctaIntensity: String(draft?.ctaIntensity || 'normal').trim() || 'normal',
        followUpSuggestedAt: String(draft?.followUpSuggestedAt || '').trim() || null,
        followUpTimingReason: Array.isArray(draft?.followUpTimingReason)
          ? draft.followUpTimingReason.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
          : [],
        followUpUrgencyLevel: String(draft?.followUpUrgencyLevel || 'normal').trim() || 'normal',
        followUpManualApprovalRequired: draft?.followUpManualApprovalRequired !== false,
        estimatedWorkMinutes: clampCcoWorkloadMinutes(draft?.estimatedWorkMinutes, 4),
        workloadBreakdown: normalizeCcoWorkloadBreakdown(draft?.workloadBreakdown, 4),
        recommendedAction: String(draft?.recommendedAction || 'Be om mer info').trim() || 'Be om mer info',
        escalationRequired: Boolean(draft?.escalationRequired),
        messageClassification: normalizeCcoMessageClassification(draft?.messageClassification),
        needsReplyStatus: 'needs_reply',
        confidenceLevel: 'Low',
        draftModes: normalizeCcoDraftModes(null, ''),
        recommendedMode: 'professional',
        structureUsed: normalizeCcoDraftStructure(null),
        proposedReply: '',
      };
      const nextPriorityReasons = normalizeCcoPriorityReasons(draft?.priorityReasons);
      if ((!current.priorityReasons || !current.priorityReasons.length) && nextPriorityReasons.length) {
        current.priorityReasons = nextPriorityReasons;
      }
      if (!current.customerKey && customerSummary.customerKey) {
        current.customerKey = customerSummary.customerKey;
      }
      current.customerSummary = normalizeCcoCustomerSummary(
        draft?.customerSummary,
        current.customerSummary || customerSummary
      );
      current.tempoProfile = String(draft?.tempoProfile || current.tempoProfile || 'reflective')
        .trim()
        .toLowerCase();
      const nextDelayDays = Number(draft?.recommendedFollowUpDelayDays);
      if (Number.isFinite(nextDelayDays) && nextDelayDays >= 0) {
        current.recommendedFollowUpDelayDays = nextDelayDays;
      }
      if (String(draft?.ctaIntensity || '').trim()) {
        current.ctaIntensity = String(draft?.ctaIntensity).trim().toLowerCase();
      }
      if (draft?.followUpSuggestedAt) {
        current.followUpSuggestedAt = String(draft.followUpSuggestedAt).trim() || null;
      }
      if (Array.isArray(draft?.followUpTimingReason)) {
        current.followUpTimingReason = draft.followUpTimingReason
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 6);
      }
      if (String(draft?.followUpUrgencyLevel || '').trim()) {
        current.followUpUrgencyLevel = String(draft.followUpUrgencyLevel).trim().toLowerCase();
      }
      if (typeof draft?.followUpManualApprovalRequired === 'boolean') {
        current.followUpManualApprovalRequired = draft.followUpManualApprovalRequired;
      }
      const nextEstimatedWorkMinutes = Number(draft?.estimatedWorkMinutes);
      if (Number.isFinite(nextEstimatedWorkMinutes)) {
        current.estimatedWorkMinutes = clampCcoWorkloadMinutes(nextEstimatedWorkMinutes, 4);
      }
      if (draft?.workloadBreakdown && typeof draft.workloadBreakdown === 'object') {
        current.workloadBreakdown = normalizeCcoWorkloadBreakdown(
          draft.workloadBreakdown,
          current.estimatedWorkMinutes || 4
        );
      }
      current.confidenceLevel = String(draft?.confidenceLevel || current.confidenceLevel || 'Low').trim() || 'Low';
      const nextIntentConfidence = Number(draft?.intentConfidence);
      if (Number.isFinite(nextIntentConfidence)) {
        current.intentConfidence = Math.max(0, Math.min(1, nextIntentConfidence));
      }
      const nextToneConfidence = Number(draft?.toneConfidence);
      if (Number.isFinite(nextToneConfidence)) {
        current.toneConfidence = Math.max(0, Math.min(1, nextToneConfidence));
      }
      const nextHoursRemaining = Number(draft?.hoursRemaining);
      if (Number.isFinite(nextHoursRemaining)) {
        current.hoursRemaining = nextHoursRemaining;
      }
      const nextSlaThreshold = Number(draft?.slaThreshold);
      if (Number.isFinite(nextSlaThreshold) && nextSlaThreshold > 0) {
        current.slaThreshold = nextSlaThreshold;
      }
      if (typeof draft?.stagnated === 'boolean') {
        current.stagnated = draft.stagnated;
      }
      const nextStagnationHours = Number(draft?.stagnationHours);
      if (Number.isFinite(nextStagnationHours) && nextStagnationHours >= 0) {
        current.stagnationHours = nextStagnationHours;
      }
      if (typeof draft?.followUpSuggested === 'boolean') {
        current.followUpSuggested = draft.followUpSuggested;
      }
      const fallbackDraftText = String(
        draft?.suggestedReply || draft?.proposedReply || current.proposedReply || ''
      ).trim();
      current.draftModes = normalizeCcoDraftModes(draft?.draftModes, fallbackDraftText);
      current.recommendedMode = normalizeCcoDraftMode(
        draft?.recommendedMode,
        current.recommendedMode || 'professional'
      );
      current.structureUsed = normalizeCcoDraftStructure(draft?.structureUsed);
      current.proposedReply = String(
        current.draftModes[current.recommendedMode] ||
          current.draftModes.professional ||
          fallbackDraftText
      ).trim();
      if (!current.subject) {
        current.subject = String(draft?.subject || '(utan ämne)').trim() || '(utan ämne)';
      }
      if (!current.mailboxId) current.mailboxId = String(draft?.mailboxId || '').trim();
      if (!current.mailboxAddress) {
        current.mailboxAddress = String(draft?.mailboxAddress || '').trim();
      }
      if (!current.userPrincipalName) {
        current.userPrincipalName = String(draft?.userPrincipalName || '').trim();
      }
      if (!current.messageId) current.messageId = String(draft?.messageId || '').trim();
      if (typeof draft?.isUnanswered === 'boolean') {
        current.isUnanswered = draft.isUnanswered;
      }
      current.messageClassification = normalizeCcoMessageClassification(
        draft?.messageClassification || current.messageClassification
      );
      const nextUnansweredThresholdHours = Number(draft?.unansweredThresholdHours);
      if (Number.isFinite(nextUnansweredThresholdHours) && nextUnansweredThresholdHours > 0) {
        current.unansweredThresholdHours = Math.max(1, nextUnansweredThresholdHours);
      }
      map.set(conversationId, current);
    }

    for (const row of map.values()) {
      const workload = resolveCcoWorkload(row);
      row.estimatedWorkMinutes = workload.estimatedWorkMinutes;
      row.workloadBreakdown = workload.workloadBreakdown;
    }

    return map;
  }

  function getSortedCcoConversations(data = null) {
    const rows = Array.from(buildCcoConversationMap(data).values());
    rows.sort((a, b) => {
      const lifecycleRankDiff =
        getCcoLifecycleSortRank(
          a?.lifecycleStatus || a?.customerSummary?.lifecycleStatus
        ) -
        getCcoLifecycleSortRank(
          b?.lifecycleStatus || b?.customerSummary?.lifecycleStatus
        );
      if (lifecycleRankDiff !== 0) return lifecycleRankDiff;
      const slaRankDiff = getCcoSlaSortRank(b.slaStatus) - getCcoSlaSortRank(a.slaStatus);
      if (slaRankDiff !== 0) return slaRankDiff;
      if (Number(b.priorityScore || 0) !== Number(a.priorityScore || 0)) {
        return Number(b.priorityScore || 0) - Number(a.priorityScore || 0);
      }
      return Number(b.hoursSinceInbound || 0) - Number(a.hoursSinceInbound || 0);
    });
    return rows;
  }

  function isCcoDebugMode() {
    const metadata =
      state.ccoInboxData?.metadata && typeof state.ccoInboxData.metadata === 'object'
        ? state.ccoInboxData.metadata
        : {};
    if (metadata.debugMode === true) return true;
    return Boolean(metadata.snapshotDebug && typeof metadata.snapshotDebug === 'object');
  }

  function getCcoSprintSlotLabel(index) {
    if (index === 0) return 'Kritisk';
    if (index === 1) return 'Hög';
    return 'Snabb vinst';
  }

  function isCcoCriticalToneForFocus(row = null) {
    const tone = String(row?.tone || '').trim().toLowerCase();
    return ['frustrated', 'urgent', 'anxious'].includes(tone);
  }

  function buildCcoSprintQueueRows(openRows = []) {
    const rows = Array.isArray(openRows) ? openRows.filter(Boolean) : [];
    const byRank = (left, right) => {
      const leftBreach = normalizeCcoSlaStatus(left?.slaStatus) === 'breach' ? 1 : 0;
      const rightBreach = normalizeCcoSlaStatus(right?.slaStatus) === 'breach' ? 1 : 0;
      if (leftBreach !== rightBreach) return rightBreach - leftBreach;
      const leftComplaint = String(left?.intent || '').trim().toLowerCase() === 'complaint' ? 1 : 0;
      const rightComplaint = String(right?.intent || '').trim().toLowerCase() === 'complaint' ? 1 : 0;
      if (leftComplaint !== rightComplaint) return rightComplaint - leftComplaint;
      const leftCriticalTone = isCcoCriticalToneForFocus(left) ? 1 : 0;
      const rightCriticalTone = isCcoCriticalToneForFocus(right) ? 1 : 0;
      if (leftCriticalTone !== rightCriticalTone) return rightCriticalTone - leftCriticalTone;
      const leftScore = Number(left?.priorityScore || 0);
      const rightScore = Number(right?.priorityScore || 0);
      if (leftScore !== rightScore) return rightScore - leftScore;
      return Number(right?.hoursSinceInbound || 0) - Number(left?.hoursSinceInbound || 0);
    };
    const mandatory = rows
      .filter((row) => {
        const isCritical = safeLower(row?.priorityLevel || '') === 'critical';
        const isBreach = normalizeCcoSlaStatus(row?.slaStatus) === 'breach';
        return isCritical || isBreach;
      })
      .sort(byRank);
    const mandatoryIds = new Set(
      mandatory.map((row) => String(row?.conversationId || '').trim()).filter(Boolean)
    );
    const remaining = rows.filter(
      (row) => !mandatoryIds.has(String(row?.conversationId || '').trim())
    );
    const queueBase = [...mandatory, ...remaining].sort(byRank).slice(0, 3);
    return queueBase.map((row, index) => {
      let sprintLabel = getCcoSprintSlotLabel(index);
      if (normalizeCcoSlaStatus(row?.slaStatus) === 'breach') sprintLabel = 'SLA-brott';
      else if (safeLower(row?.priorityLevel || '') === 'critical') sprintLabel = 'Kritisk';
      else if (safeLower(row?.priorityLevel || '') === 'high') sprintLabel = 'Hög';
      return {
        ...row,
        sprintLabel,
      };
    });
  }

  function getCcoVisibleConversations(rows = []) {
    const source = Array.isArray(rows) ? rows : [];
    const enriched = source.map((row) => enrichCcoConversationRow(row));
    if (state.ccoSprintActive) {
      const queueSet = new Set(
        Array.isArray(state.ccoSprintQueueIds) ? state.ccoSprintQueueIds.slice(0, 3) : []
      );
      return enriched.filter((row) => queueSet.has(String(row?.conversationId || '').trim()));
    }

    const adaptiveFocusActive = state.ccoAdaptiveFocusState?.isActive === true;
    if (adaptiveFocusActive && state.ccoAdaptiveFocusShowAll !== true) {
      const focused = enriched.filter((row) => {
        const priority = safeLower(row?.priorityLevel || '');
        if (priority === 'critical' || priority === 'high') return true;
        return normalizeCcoSlaStatus(row?.slaStatus) === 'breach';
      });
      if (focused.length) return getCcoFilteredConversations(focused.slice(0, 3));
      return getCcoFilteredConversations(enriched.slice(0, 3));
    }

    return getCcoFilteredConversations(enriched);
  }

  function syncCcoSprintState(openRows = [], plannedRows = []) {
    const planned = Array.isArray(plannedRows) ? plannedRows.slice(0, 3) : [];
    const plannedIds = planned.map((row) => String(row?.conversationId || '').trim()).filter(Boolean);
    const plannedLabels = {};
    for (const row of planned) {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId) continue;
      plannedLabels[conversationId] = String(row?.sprintLabel || '').trim() || 'Snabb vinst';
    }

    if (!state.ccoSprintActive) {
      state.ccoSprintQueueIds = plannedIds;
      state.ccoSprintCompletedIds = [];
      state.ccoSprintLabelByConversationId = plannedLabels;
      state.ccoSprintInitialTotal = plannedIds.length;
      return;
    }

    const previousQueue = Array.isArray(state.ccoSprintQueueIds)
      ? state.ccoSprintQueueIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    const openSet = new Set(
      (Array.isArray(openRows) ? openRows : [])
        .map((row) => String(row?.conversationId || '').trim())
        .filter(Boolean)
    );
    const completed = Array.isArray(state.ccoSprintCompletedIds)
      ? state.ccoSprintCompletedIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [];

    for (const conversationId of previousQueue) {
      if (openSet.has(conversationId)) continue;
      if (!completed.includes(conversationId)) completed.push(conversationId);
    }

    const nextQueue = previousQueue.filter((conversationId) => openSet.has(conversationId));
    state.ccoSprintQueueIds = nextQueue;
    state.ccoSprintCompletedIds = completed;

    const nextLabels = {};
    nextQueue.forEach((conversationId, index) => {
      const fromState = String(state.ccoSprintLabelByConversationId?.[conversationId] || '').trim();
      const fromPlanned = String(plannedLabels[conversationId] || '').trim();
      nextLabels[conversationId] = fromState || fromPlanned || getCcoSprintSlotLabel(index);
    });
    state.ccoSprintLabelByConversationId = nextLabels;

    const completionTotal = state.ccoSprintQueueIds.length + state.ccoSprintCompletedIds.length;
    state.ccoSprintInitialTotal = Math.max(Number(state.ccoSprintInitialTotal || 0), completionTotal);
  }

  function renderCcoSprintPanel(openRows = [], plannedRows = []) {
    const safeOpenRows = Array.isArray(openRows) ? openRows : [];
    const safePlannedRows = Array.isArray(plannedRows) ? plannedRows.slice(0, 3) : [];
    const usageAnalytics =
      state.ccoUsageAnalytics && typeof state.ccoUsageAnalytics === 'object'
        ? state.ccoUsageAnalytics
        : null;
    const redFlagState =
      state.ccoRedFlagState && typeof state.ccoRedFlagState === 'object'
        ? state.ccoRedFlagState
        : null;
    const adaptiveFocusState =
      state.ccoAdaptiveFocusState && typeof state.ccoAdaptiveFocusState === 'object'
        ? state.ccoAdaptiveFocusState
        : null;
    const recoveryState =
      state.ccoRecoveryState && typeof state.ccoRecoveryState === 'object'
        ? state.ccoRecoveryState
        : null;
    const adaptiveFocusActive = adaptiveFocusState?.isActive === true;
    const openMap = new Map(
      safeOpenRows.map((row) => [String(row?.conversationId || '').trim(), row])
    );
    const sprintRows = state.ccoSprintActive
      ? state.ccoSprintQueueIds
          .map((conversationId) => openMap.get(String(conversationId || '').trim()))
          .filter(Boolean)
      : safePlannedRows;
    const focusRows = sprintRows.slice(0, 3);
    const focusCount = focusRows.length;
    const totalOpenCount = safeOpenRows.length;
    const workloadSummary = buildCcoWorkloadBreakdownSummary(focusRows);
    const scheduleState = getCcoClinicScheduleStatus(new Date());

    const priorityCounts = summarizeCcoPriorityCounts(safeOpenRows);
    const hasCritical = safeOpenRows.some(
      (row) =>
        safeLower(row.priorityLevel) === 'critical' ||
        row.escalationRequired === true ||
        normalizeCcoSlaStatus(row.slaStatus) === 'breach'
    );
    let statusText = 'Allt klart';
    let statusClass = 'status-all-clear';
    if (hasCritical) {
      statusText = 'Omedelbar åtgärd';
      statusClass = 'status-immediate';
    } else if (safeOpenRows.length > 0) {
      statusText = 'Behöver uppmärksamhet';
      statusClass = 'status-attention';
    }

    if (els.ccoSprintStatusBar) {
      els.ccoSprintStatusBar.textContent = statusText;
      applyCcoIndicatorClass(
        els.ccoSprintStatusBar,
        ['status-all-clear', 'status-attention', 'status-immediate'],
        statusClass
      );
    }
    if (els.ccoStatusCounts) {
      els.ccoStatusCounts.textContent = `${priorityCounts.critical} kritiska | ${priorityCounts.high} höga | ${safeOpenRows.length} öppna`;
    }
    if (els.ccoFocusHeading) {
      els.ccoFocusHeading.textContent = `IDAG – FOKUS (${focusCount} av ${totalOpenCount})`;
    }
    if (els.ccoFocusWorkload) {
      const nextMinutes = Math.max(0, Number(workloadSummary.total || 0));
      const previousMinutes = Number(state.ccoFocusWorkloadMinutes || 0);
      els.ccoFocusWorkload.textContent = `≈ ${Math.round(nextMinutes)} min arbete`;
      if (previousMinutes !== nextMinutes) {
        els.ccoFocusWorkload.classList.remove('is-updated');
        // Force reflow so transition restarts when value changes.
        void els.ccoFocusWorkload.offsetWidth;
        els.ccoFocusWorkload.classList.add('is-updated');
      }
      state.ccoFocusWorkloadMinutes = nextMinutes;
    }
    if (els.ccoFocusWorkloadBreakdown) {
      const aggregate = workloadSummary.aggregate;
      els.ccoFocusWorkloadBreakdown.innerHTML = [
        `Bas: ${Math.round(aggregate.base)} min`,
        `Ton: ${aggregate.toneAdjustment >= 0 ? '+' : ''}${Math.round(aggregate.toneAdjustment)}`,
        `Prioritet: ${aggregate.priorityAdjustment >= 0 ? '+' : ''}${Math.round(
          aggregate.priorityAdjustment
        )}`,
        `Relation: ${aggregate.warmthAdjustment >= 0 ? '+' : ''}${Math.round(
          aggregate.warmthAdjustment
        )}`,
        `Längd: ${aggregate.lengthAdjustment >= 0 ? '+' : ''}${Math.round(aggregate.lengthAdjustment)}`,
        `Totalt: ${Math.round(workloadSummary.total)} min`,
      ]
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join('');
    }
    if (els.ccoFocusWorkloadInfoBtn) {
      els.ccoFocusWorkloadInfoBtn.disabled = focusCount === 0;
      if (focusCount === 0 && els.ccoFocusWorkloadBreakdown) {
        els.ccoFocusWorkloadBreakdown.classList.remove('visible');
        els.ccoFocusWorkloadInfoBtn.setAttribute('aria-expanded', 'false');
      }
    }
    if (els.ccoFocusScheduleStatus) {
      if (!focusCount) {
        els.ccoFocusScheduleStatus.textContent = 'Allt under kontroll. Inga ärenden kräver svar just nu.';
      } else if (scheduleState.isOpen === false) {
        els.ccoFocusScheduleStatus.textContent = `${scheduleState.message} Du har ${Math.round(
          workloadSummary.total
        )} min planerat arbete.`;
      } else {
        els.ccoFocusScheduleStatus.textContent = '';
      }
    }

    document.body.classList.toggle('cco-focus-mode', adaptiveFocusActive);

    if (els.ccoFocusShowAllBtn) {
      els.ccoFocusShowAllBtn.textContent =
        state.ccoAdaptiveFocusShowAll === true ? 'Visa fokus' : 'Visa alla';
      els.ccoFocusShowAllBtn.setAttribute(
        'aria-pressed',
        state.ccoAdaptiveFocusShowAll === true ? 'true' : 'false'
      );
    }

    if (els.ccoRedFlagBanner) {
      const drivers = Array.isArray(redFlagState?.primaryDrivers)
        ? redFlagState.primaryDrivers
            .map((driver) => String(driver || '').trim().replace(/_/g, ' '))
            .filter(Boolean)
            .slice(0, 3)
        : [];
      if (redFlagState?.isActive === true) {
        const delta = Number(redFlagState.delta || 0);
        const deltaLabel = Number.isFinite(delta)
          ? `${delta > 0 ? '+' : ''}${Math.round(delta)}`
          : '-';
        const driversLabel = drivers.length ? drivers.join(' + ') : 'okänd drivare';
        const actionLabel = String(redFlagState.recommendedAction || '').trim();
        els.ccoRedFlagBanner.innerHTML = `
          <div style="font-weight:600">⚠ Operativ avvikelse upptäckt</div>
          <div>Hälsopoäng ${escapeHtml(deltaLabel)} på 48h · Primär orsak: ${escapeHtml(driversLabel)}</div>
          <div>${escapeHtml(actionLabel || 'Rekommendation: prioritera högrisk-ärenden kommande 48h.')}</div>
        `;
        els.ccoRedFlagBanner.classList.add('visible');
      } else if (recoveryState?.recovered === true) {
        els.ccoRedFlagBanner.innerHTML =
          '<div style="font-weight:600">✔ Stabilisering uppnådd</div><div>Fokusläge avslutat. Systemet är tillbaka i normal drift.</div>';
        els.ccoRedFlagBanner.classList.add('visible');
      } else {
        els.ccoRedFlagBanner.textContent = '';
        els.ccoRedFlagBanner.classList.remove('visible');
      }
    }

    if (els.ccoPerformancePanel) {
      if (usageAnalytics) {
        const usagePct = Math.round(Math.max(0, Math.min(1, Number(usageAnalytics.ccoUsageRate || 0))) * 100);
        const avgResponse = Number(usageAnalytics.avgResponseTimeHours || 0);
        const followPct = Math.round(
          Math.max(0, Math.min(1, Number(usageAnalytics.systemRecommendationFollowRate || 0))) * 100
        );
        const stressDelta = String(usageAnalytics.slaBreachTrend || '').trim() || '0%';
        const strategic = state.ccoStrategicInsights && typeof state.ccoStrategicInsights === 'object'
          ? state.ccoStrategicInsights
          : null;
        const weeklyBrief = strategic?.weeklyBrief && typeof strategic.weeklyBrief === 'object'
          ? strategic.weeklyBrief
          : null;
        const monthlyRisk = strategic?.monthlyRisk && typeof strategic.monthlyRisk === 'object'
          ? strategic.monthlyRisk
          : null;
        const scenarioAnalysis =
          strategic?.scenarioAnalysis && typeof strategic.scenarioAnalysis === 'object'
            ? strategic.scenarioAnalysis
            : null;
        const businessThreats =
          strategic?.businessThreats && typeof strategic.businessThreats === 'object'
            ? strategic.businessThreats
            : null;
        const forwardOutlook =
          strategic?.forwardOutlook && typeof strategic.forwardOutlook === 'object'
            ? strategic.forwardOutlook
            : null;
        const weeklyMode = String(weeklyBrief?.mode || 'normal').trim();
        const monthlyLevel = String(monthlyRisk?.riskLevel || 'low').trim();
        const monthlyLevelLabel = (() => {
          const normalized = monthlyLevel.toLowerCase();
          if (normalized === 'critical' || normalized === 'kritisk') return 'Kritisk';
          if (normalized === 'high' || normalized === 'hög') return 'Hög';
          if (normalized === 'medium' || normalized === 'medel') return 'Medel';
          if (normalized === 'low' || normalized === 'låg') return 'Låg';
          return monthlyLevel || '-';
        })();
        const threatCount = Array.isArray(businessThreats?.threats) ? businessThreats.threats.length : 0;
        const recommendedScenario = String(scenarioAnalysis?.recommendedScenario?.title || '').trim();
        const volatilityIndex = Number(forwardOutlook?.volatilityIndex || 0);
        const confidence = Number(forwardOutlook?.confidence || 0);
        const topRecommendation = Array.isArray(weeklyBrief?.recommendations)
          ? String(weeklyBrief.recommendations[0] || '').trim()
          : '';
        els.ccoPerformancePanel.innerHTML = `
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Använder du CCO</span>
            <span class="cco-performance-item-value">${escapeHtml(`${usagePct}%`)}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Snitt-svarstid</span>
            <span class="cco-performance-item-value">${escapeHtml(`${avgResponse.toFixed(1)}h`)}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Följer rekommendation</span>
            <span class="cco-performance-item-value">${escapeHtml(`${followPct}%`)}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">SLA-brist trend</span>
            <span class="cco-performance-item-value">${escapeHtml(stressDelta)}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Veckobrief</span>
            <span class="cco-performance-item-value">${escapeHtml(
              weeklyMode === 'focus' ? 'Fokusläge' : 'Normal'
            )}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Månadsrisk</span>
            <span class="cco-performance-item-value">${escapeHtml(monthlyLevelLabel)}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Strategiska hot</span>
            <span class="cco-performance-item-value">${escapeHtml(String(threatCount))}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Framåtblick</span>
            <span class="cco-performance-item-value">${escapeHtml(
              `${Math.round(Math.max(0, Math.min(1, volatilityIndex)) * 100)}% vol`
            )}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Scenarioläge</span>
            <span class="cco-performance-item-value">${escapeHtml(recommendedScenario || '-')}</span>
          </div>
          <div class="cco-performance-item">
            <span class="cco-performance-item-label">Prognos-konfidens</span>
            <span class="cco-performance-item-value">${escapeHtml(
              `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`
            )}</span>
          </div>
          <div class="cco-performance-item" style="grid-column: 1 / -1;">
            <span class="cco-performance-item-label">Topprekommendation</span>
            <span class="cco-performance-item-value" style="font-size:13px;font-weight:500">${escapeHtml(
              topRecommendation || 'Ingen rekommendation ännu.'
            )}</span>
          </div>
        `;
        els.ccoPerformancePanel.classList.add('visible');
      } else {
        els.ccoPerformancePanel.innerHTML = '';
        els.ccoPerformancePanel.classList.remove('visible');
      }
    }

    const isComplete =
      state.ccoSprintActive &&
      sprintRows.length === 0 &&
      Number(state.ccoSprintInitialTotal || 0) > 0;
    const sprintFeedback =
      state.ccoSprintLatestFeedback && typeof state.ccoSprintLatestFeedback === 'object'
        ? state.ccoSprintLatestFeedback
        : null;
    const stressIndex =
      state.ccoSprintMetrics?.stressProxyIndex &&
      typeof state.ccoSprintMetrics.stressProxyIndex === 'object'
        ? state.ccoSprintMetrics.stressProxyIndex
        : null;

    if (els.ccoWorkspaceLayout) {
      els.ccoWorkspaceLayout.classList.toggle('sprint-active', state.ccoSprintActive && !isComplete);
    }

    if (els.ccoStartSprintBtn) {
      if (isComplete) {
        els.ccoStartSprintBtn.textContent = 'Starta nästa fokus';
      } else if (state.ccoSprintActive) {
        els.ccoStartSprintBtn.textContent = 'Avsluta fokus';
      } else {
        els.ccoStartSprintBtn.textContent = 'Starta fokus';
      }
      els.ccoStartSprintBtn.disabled = false;
    }

    if (els.ccoSprintProgress) {
      if (isComplete) {
        els.ccoSprintProgress.textContent = 'Fokuskö klar';
      } else if (state.ccoSprintActive) {
        const done = Number(state.ccoSprintCompletedIds.length || 0);
        const total = Math.max(Number(state.ccoSprintInitialTotal || 0), done + sprintRows.length);
        els.ccoSprintProgress.textContent = `Framsteg: ${done}/${total}`;
      } else if (focusCount > 0) {
        const showAllHint = totalOpenCount > focusCount ? ' · Visa alla' : '';
        els.ccoSprintProgress.textContent = `${focusCount} av ${totalOpenCount}${showAllHint}`;
      } else {
        els.ccoSprintProgress.textContent = '🟢 Allt under kontroll. Inga ärenden kräver svar just nu.';
      }
    }

    if (els.ccoSprintStressMeta) {
      if (stressIndex) {
        const score = Number(stressIndex.score || 0);
        const level = formatCcoPriorityLabel(String(stressIndex.level || 'Low').trim() || 'Low');
        els.ccoSprintStressMeta.textContent = `Stressindex: ${score} (${level})`;
      } else {
        els.ccoSprintStressMeta.textContent = 'Stressindex: -';
      }
    }

    if (els.ccoSprintFeedback) {
      if (isComplete) {
        const handled = Math.max(
          0,
          Number((sprintFeedback?.itemsCompleted ?? state.ccoSprintCompletedIds.length) || 0)
        );
        const resolvedCritical = Math.max(0, Number(sprintFeedback?.resolvedCritical || 0));
        const slaLine = sprintFeedback?.slaImproved ? '✓ SLA förbättrad' : '✓ SLA oförändrad';
        const safeHandled = Number.isFinite(handled) ? handled : 0;
        const safeCritical = Number.isFinite(resolvedCritical) ? resolvedCritical : 0;
        els.ccoSprintFeedback.innerHTML = [
          'Fokuskö klar',
          `✓ ${safeHandled} konversationer hanterade`,
          `✓ ${safeCritical} kritiska lösta`,
          slaLine,
          '✓ Föreslagen paus: 2 minuter',
        ]
          .map((line) => `<div>${escapeHtml(line)}</div>`)
          .join('');
        els.ccoSprintFeedback.classList.add('visible');
      } else {
        els.ccoSprintFeedback.textContent = '';
        els.ccoSprintFeedback.classList.remove('visible');
      }
    }

    if (!els.ccoSprintQueueList) return;
    if (isComplete) {
      els.ccoSprintQueueList.innerHTML = '<li class="mini muted">Fokuskö klar</li>';
      return;
    }
    if (!sprintRows.length) {
      els.ccoSprintQueueList.innerHTML =
        '<li class="mini muted">🟢 Allt under kontroll. Inga ärenden kräver svar just nu.</li>';
      return;
    }

    els.ccoSprintQueueList.innerHTML = sprintRows
      .slice(0, 3)
      .map((row, index) => {
        const conversationId = String(row?.conversationId || '').trim();
        const sprintLabel =
          String(state.ccoSprintLabelByConversationId?.[conversationId] || '').trim() ||
          String(row?.sprintLabel || '').trim() ||
          getCcoSprintSlotLabel(index);
        const normalizedPriority = safeLower(row?.priorityLevel || 'low');
        const priorityClass = ['critical', 'high', 'medium', 'low'].includes(normalizedPriority)
          ? `priority-${normalizedPriority}`
          : 'priority-low';
        const relationshipStatus = String(row?.relationshipStatus || classifyCcoRelationshipStatus(row))
          .trim()
          .toLowerCase();
        const relationshipLabel = formatCcoRelationshipShortLabel(relationshipStatus);
        const countdownLabel = formatCcoFocusCountdown(row, scheduleState);
        const intentLabel = formatCcoIntentLabel(row?.intent || 'unclear');
        const actionLabel = formatCcoRecommendedAction(row?.recommendedAction || '');
        const ctaLabel =
          String(row?.intent || '').trim().toLowerCase() === 'complaint'
            ? 'Svara nu'
            : String(row?.intent || '').trim().toLowerCase() === 'booking_request'
            ? 'Skicka förslag'
            : String(row?.intent || '').trim().toLowerCase() === 'follow_up'
            ? 'Uppföljning'
            : actionLabel || 'Svara nu';
        const focusSeverityIcon =
          normalizeCcoSlaStatus(row?.slaStatus) === 'breach' || normalizedPriority === 'critical'
            ? '🔴'
            : normalizedPriority === 'high'
            ? '🟡'
            : '🟢';
        const workload = clampCcoWorkloadMinutes(row?.estimatedWorkMinutes, 4);
        return `
          <li class="cco-sprint-item ${priorityClass}">
            <div class="cco-sprint-item-label">${escapeHtml(sprintLabel)}</div>
            <button class="cco-sprint-item-btn ccoSprintSelectBtn" data-conversation-id="${escapeHtml(
              conversationId
            )}">
              <div class="cco-sprint-item-subject">[ ${focusSeverityIcon} ${escapeHtml(intentLabel)} - ${escapeHtml(
                relationshipLabel
              )} - ${escapeHtml(countdownLabel)} ]</div>
              <div class="cco-sprint-item-meta">Rekommendation: ${escapeHtml(actionLabel)}</div>
              <div class="cco-sprint-item-action">CTA: ${escapeHtml(ctaLabel)} · ≈ ${escapeHtml(
                `${workload} min`
              )}</div>
            </button>
          </li>
        `;
      })
      .join('');

    els.ccoSprintQueueList.querySelectorAll('.ccoSprintSelectBtn').forEach((button) => {
      button.addEventListener('click', () => {
        const conversationId = String(button.getAttribute('data-conversation-id') || '').trim();
        if (!conversationId) return;
        setSelectedCcoConversation(conversationId);
        renderCcoInbox(state.ccoInboxData);
      });
    });
  }

  function stopCcoSprint({ message = 'Fokus avslutad. Full inkorg visas igen.' } = {}) {
    state.ccoSprintActive = false;
    state.ccoSprintQueueIds = [];
    state.ccoSprintCompletedIds = [];
    state.ccoSprintLabelByConversationId = {};
    state.ccoSprintInitialTotal = 0;
    state.ccoSprintId = '';
    state.ccoSprintStartedAtMs = 0;
    state.ccoSprintLatestFeedback = null;
    hideCcoSoftBreakPanel();
    renderCcoInbox(state.ccoInboxData);
    setStatus(els.ccoInboxStatus, message);
  }

  async function startCcoSprint() {
    if (state.ccoSprintActive && state.ccoSprintQueueIds.length) {
      stopCcoSprint();
      return;
    }
    const data =
      state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object'
        ? state.ccoInboxData.data
        : null;
    if (!data) {
      setStatus(els.ccoInboxStatus, 'Kör CCO inkorgsbrief innan fokus startas.', true);
      return;
    }

    const openRows = buildCcoOpenConversationRows(data);
    const plannedRows = buildCcoSprintQueueRows(openRows);
    if (!plannedRows.length) {
      state.ccoSprintActive = false;
      state.ccoSprintQueueIds = [];
      state.ccoSprintCompletedIds = [];
      state.ccoSprintLabelByConversationId = {};
      state.ccoSprintInitialTotal = 0;
      state.ccoSprintId = '';
      state.ccoSprintStartedAtMs = 0;
      state.ccoSprintLatestFeedback = null;
      renderCcoInbox(state.ccoInboxData);
      setStatus(els.ccoInboxStatus, 'Allt klart: inga fokusobjekt att starta.');
      return;
    }

    const sprintId = createCcoSprintId();
    const startedAtMs = Date.now();
    state.ccoSprintActive = true;
    state.ccoSprintId = sprintId;
    state.ccoSprintStartedAtMs = startedAtMs;
    state.ccoSprintQueueIds = plannedRows
      .map((row) => String(row?.conversationId || '').trim())
      .filter(Boolean);
    state.ccoSprintCompletedIds = [];
    state.ccoSprintLabelByConversationId = {};
    plannedRows.forEach((row, index) => {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId) return;
      state.ccoSprintLabelByConversationId[conversationId] =
        String(row?.sprintLabel || '').trim() || getCcoSprintSlotLabel(index);
    });
    state.ccoSprintInitialTotal = state.ccoSprintQueueIds.length;
    state.ccoSprintLatestFeedback = null;
    setSelectedCcoConversation(state.ccoSprintQueueIds[0] || '');
    renderCcoInbox(state.ccoInboxData);
    setStatus(els.ccoInboxStatus, 'Fokus startad. Fokusläge aktivt.');

    const priorityCounts = summarizeCcoPriorityCounts(plannedRows);
    await postCcoSprintEvent('start', {
      sprintId,
      queueSize: plannedRows.length,
      criticalCount: priorityCounts.critical,
      highCount: priorityCounts.high,
      timestamp: toIsoOrNow(startedAtMs),
    });
    const metrics = await loadCcoMetrics({ since: '7d' });
    if (metrics) renderCcoInbox(state.ccoInboxData);
  }

  async function markCcoSprintConversationCompleted(conversationId, conversationMeta = null) {
    if (!state.ccoSprintActive) return;
    const key = String(conversationId || '').trim();
    if (!key) return;
    if (!state.ccoSprintQueueIds.includes(key)) return;
    const data =
      state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object'
        ? state.ccoInboxData.data
        : null;
    const openRows = buildCcoOpenConversationRows(data);
    const row = openRows.find((item) => String(item?.conversationId || '').trim() === key) || null;
    const fallbackMeta = conversationMeta && typeof conversationMeta === 'object' ? conversationMeta : {};
    const priorityLevel = String(row?.priorityLevel || fallbackMeta.priorityLevel || 'Low').trim() || 'Low';
    const slaAgeHours = toCcoTelemetryNumber(
      row?.hoursSinceInbound ?? fallbackMeta.hoursSinceInbound,
      0
    );
    state.ccoSprintQueueIds = state.ccoSprintQueueIds.filter((item) => item !== key);
    if (!state.ccoSprintCompletedIds.includes(key)) {
      state.ccoSprintCompletedIds.push(key);
    }
    delete state.ccoSprintLabelByConversationId[key];

    await postCcoSprintEvent('item_completed', {
      sprintId: state.ccoSprintId,
      conversationId: key,
      priorityLevel,
      slaAge: `${slaAgeHours.toFixed(1)}h`,
      slaAgeHours,
      handledAt: new Date().toISOString(),
    });

    if (!state.ccoSprintQueueIds.length && Number(state.ccoSprintInitialTotal || 0) > 0) {
      const remainingOpenRows = buildCcoOpenConversationRows(data);
      const remainingPriority = summarizeCcoPriorityCounts(remainingOpenRows);
      const durationMs = Math.max(0, Date.now() - Number(state.ccoSprintStartedAtMs || Date.now()));
      await postCcoSprintEvent('complete', {
        sprintId: state.ccoSprintId,
        durationMs,
        itemsCompleted: Number(state.ccoSprintCompletedIds.length || 0),
        remainingHigh: remainingPriority.high,
        remainingCritical: remainingPriority.critical,
        timestamp: new Date().toISOString(),
      });
      const metrics = await loadCcoMetrics({ since: '7d' });
      if (metrics) renderCcoInbox(state.ccoInboxData);
    }
  }

  function getCcoSelectedConversation() {
    const data = state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object'
      ? state.ccoInboxData.data
      : null;
    if (!data) return null;
    const baseRows = getCcoFilteredConversations(
      getSortedCcoConversations(data).filter(
        (row) => String(row?.needsReplyStatus || '').trim().toLowerCase() !== 'handled'
      )
    );
    const rows = applyCcoIndicatorViewFilter(baseRows, state.ccoIndicatorViewFilter);
    if (!rows.length) return null;
    const selectedId = String(state.ccoSelectedConversationId || '').trim();
    const selected = rows.find((row) => row.conversationId === selectedId);
    if (selected) return selected;
    return rows[0];
  }

  function getCcoSelectedFeedEntry(data = null) {
    if (!isCcoReadOnlyMailViewMode()) return null;
    const mode = sanitizeCcoMailViewMode(state.ccoMailViewMode);
    const direction = mode === 'sent' ? 'outbound' : 'inbound';
    const entries = getCcoFeedEntries(data, direction);
    const visibleEntries = entries.filter((entry) =>
      matchesCcoIndicatorViewFilter(entry?.row || entry, state.ccoIndicatorViewFilter)
    );
    if (!visibleEntries.length) return null;
    const selectedFeedId = String(state.ccoSelectedFeedMessageId || '').trim();
    if (selectedFeedId) {
      const byId = visibleEntries.find((entry) => entry.feedId === selectedFeedId);
      if (byId) return byId;
    }
    const selectedConversationId = String(state.ccoSelectedConversationId || '').trim();
    if (selectedConversationId) {
      const byConversation = visibleEntries.find(
        (entry) => String(entry.conversationId || '').trim() === selectedConversationId
      );
      if (byConversation) return byConversation;
    }
    return visibleEntries[0];
  }

  function renderCcoReadOnlyFeedDetail(feedEntry = null) {
    if (!feedEntry || typeof feedEntry !== 'object') return false;
    const mode = sanitizeCcoMailViewMode(state.ccoMailViewMode);
    const viewLabel = formatCcoMailViewModeLabel(mode);
    const sentAtLabel = feedEntry.sentAt ? formatCcoDateTimeValue(feedEntry.sentAt) : '-';
    const mailboxShort = formatCcoMailboxShortLabel(feedEntry.mailboxAddress) || feedEntry.mailboxAddress;
    if (els.ccoConversationMeta) {
      els.ccoConversationMeta.textContent = `${viewLabel} · ${feedEntry.counterpart} · ${mailboxShort} · ${sentAtLabel}`;
    }
    if (els.ccoConversationPreview) {
      els.ccoConversationPreview.textContent =
        String(feedEntry.preview || '').trim() || 'Ingen förhandsvisning tillgänglig.';
    }
    const row = feedEntry.row && typeof feedEntry.row === 'object' ? feedEntry.row : null;
    if (row) {
      renderCcoConversationHistory(row);
      renderCcoCustomerSummary(row);
      renderCcoReplyContext(row);
    } else {
      if (els.ccoConversationHistoryList) {
        els.ccoConversationHistoryList.innerHTML = '<li class="muted mini">Ingen historik tillgänglig för valt mail.</li>';
      }
      renderCcoCustomerSummary(null);
      renderCcoReplyContext(null);
    }
    setCcoReplyEmptyState(false, {
      emptyMessage: 'Skrivskyddad vy. Byt till Arbetskö för att svara.',
    });
    return true;
  }

  function getCcoDraftBody(conversation = null) {
    if (!conversation) return '';
    const conversationId = String(conversation.conversationId || '').trim();
    const override = state.ccoDraftOverrideByConversationId?.[conversationId];
    if (typeof override === 'string' && override.trim()) return override;
    const selectedMode = getCcoSelectedDraftMode(conversation);
    const byMode = getCcoDraftBodyByMode(conversation, selectedMode);
    if (byMode) return byMode;
    return String(conversation.proposedReply || '').trim();
  }

  function getCcoDraftBodyByMode(conversation = null, mode = 'professional') {
    if (!conversation || typeof conversation !== 'object') return '';
    const draftModes =
      conversation.draftModes && typeof conversation.draftModes === 'object'
        ? conversation.draftModes
        : null;
    if (!draftModes) return '';
    const normalizedMode = normalizeCcoDraftMode(mode, 'professional');
    return String(draftModes[normalizedMode] || '').trim();
  }

  function getCcoRecommendedDraftMode(conversation = null) {
    const mode = normalizeCcoDraftMode(conversation?.recommendedMode, 'professional');
    return mode;
  }

  function getCcoSelectedDraftMode(conversation = null) {
    if (!conversation || typeof conversation !== 'object') return 'professional';
    const conversationId = String(conversation.conversationId || '').trim();
    const stateMode = String(state.ccoDraftModeByConversationId?.[conversationId] || '')
      .trim()
      .toLowerCase();
    if (['short', 'warm', 'professional'].includes(stateMode)) return stateMode;
    return getCcoRecommendedDraftMode(conversation);
  }

  function setCcoDraftModeForConversation(conversationId, mode = 'professional') {
    const key = String(conversationId || '').trim();
    if (!key) return;
    const normalizedMode = normalizeCcoDraftMode(mode, 'professional');
    state.ccoDraftModeByConversationId = {
      ...state.ccoDraftModeByConversationId,
      [key]: normalizedMode,
    };
    persistCcoWorkspaceSessionState();
  }

  function renderCcoDraftModeControls(conversation = null) {
    const controls = [
      { mode: 'short', el: els.ccoDraftModeShortBtn },
      { mode: 'warm', el: els.ccoDraftModeWarmBtn },
      { mode: 'professional', el: els.ccoDraftModeProfessionalBtn },
    ];
    if (!conversation) {
      controls.forEach(({ el }) => {
        if (!el) return;
        el.disabled = true;
        el.classList.remove('is-active', 'is-recommended');
      });
      if (els.ccoDraftModeHint) {
        els.ccoDraftModeHint.textContent = 'Rekommenderat läge: -';
      }
      return;
    }

    const selectedMode = getCcoSelectedDraftMode(conversation);
    const recommendedMode = getCcoRecommendedDraftMode(conversation);
    controls.forEach(({ mode, el }) => {
      if (!el) return;
      el.disabled = false;
      el.classList.toggle('is-active', mode === selectedMode);
      el.classList.toggle('is-recommended', mode === recommendedMode);
    });

    if (els.ccoDraftModeHint) {
      els.ccoDraftModeHint.textContent = `Rekommenderat läge: ${formatCcoDraftModeLabel(
        recommendedMode
      )}`;
    }
  }

  function applyCcoDraftModeSelection(mode = 'professional') {
    const conversation = getCcoSelectedConversation();
    if (!conversation) return;
    const recommendedMode = getCcoRecommendedDraftMode(conversation);
    const selectedMode = normalizeCcoDraftMode(mode, getCcoRecommendedDraftMode(conversation));
    setCcoDraftModeForConversation(conversation.conversationId, selectedMode);
    const modeDraft =
      getCcoDraftBodyByMode(conversation, selectedMode) ||
      String(conversation.proposedReply || '').trim();
    const nextDraft = removeCcoSignatureFromDraft(modeDraft);
    if (els.ccoDraftBodyInput) {
      els.ccoDraftBodyInput.value = nextDraft;
    }
    setCcoDraftBodyForConversation(conversation.conversationId, nextDraft);
    renderCcoDraftModeControls(conversation);
    postCcoUsageEvent('draft_mode_selected', {
      conversationId: String(conversation.conversationId || '').trim(),
      selectedMode,
      recommendedMode,
      ignoredRecommended: selectedMode !== recommendedMode,
      workspaceId: 'cco',
    });
    setStatus(
      els.ccoSendStatus,
      `Svarsläge bytt till ${formatCcoDraftModeLabel(selectedMode).toLowerCase()}.`
    );
  }

  function setCcoDraftBodyForConversation(conversationId, value) {
    const key = String(conversationId || '').trim();
    if (!key) return;
    state.ccoDraftOverrideByConversationId = {
      ...state.ccoDraftOverrideByConversationId,
      [key]: String(value || ''),
    };
    persistCcoWorkspaceSessionState();
  }

  function rememberCcoConversationScroll(conversationId, scrollTopRaw) {
    const key = String(conversationId || '').trim();
    const scrollTop = Number(scrollTopRaw);
    if (!key || !Number.isFinite(scrollTop) || scrollTop < 0) return;
    state.ccoConversationScrollTopByConversationId = {
      ...state.ccoConversationScrollTopByConversationId,
      [key]: Math.round(scrollTop),
    };
    persistCcoWorkspaceSessionState();
  }

  function restoreCcoConversationScroll(conversationId) {
    const key = String(conversationId || '').trim();
    if (!key || !els.ccoConversationColumn) return;
    const savedScrollTop = Number(state.ccoConversationScrollTopByConversationId?.[key] || 0);
    if (!Number.isFinite(savedScrollTop)) return;
    requestAnimationFrame(() => {
      if (!els.ccoConversationColumn) return;
      els.ccoConversationColumn.scrollTop = Math.max(0, Math.round(savedScrollTop));
    });
  }

  function setCcoDraftEvaluationForConversation(conversationId, payload = {}) {
    const key = String(conversationId || '').trim();
    if (!key) return;
    state.ccoDraftEvaluationByConversationId = {
      ...state.ccoDraftEvaluationByConversationId,
      [key]: {
        decision: String(payload?.decision || '').trim().toLowerCase(),
        riskSummary: payload?.riskSummary && typeof payload.riskSummary === 'object'
          ? payload.riskSummary
          : null,
        policySummary: payload?.policySummary && typeof payload.policySummary === 'object'
          ? payload.policySummary
          : null,
      },
    };
  }

  function getCcoDraftEvaluationForConversation(conversationId) {
    const key = String(conversationId || '').trim();
    if (!key) return null;
    const entry = state.ccoDraftEvaluationByConversationId?.[key];
    return entry && typeof entry === 'object' ? entry : null;
  }

  function formatCcoRiskIndicator(conversation = null, evaluation = null) {
    const outputRisk =
      evaluation?.riskSummary && typeof evaluation.riskSummary === 'object'
        ? evaluation.riskSummary.output
        : null;
    if (outputRisk && typeof outputRisk === 'object') {
      const riskLevel = Number(outputRisk.riskLevel);
      const riskScore = Number(outputRisk.riskScore);
      const levelLabel = Number.isFinite(riskLevel) ? `L${Math.max(0, Math.round(riskLevel))}` : 'L-';
      const scoreLabel = Number.isFinite(riskScore) ? `${Math.max(0, Math.round(riskScore))}` : '-';
      const riskDecision = formatDecisionLabel(String(outputRisk.decision || '-'));
      return `${levelLabel} · ${riskDecision} · poäng ${scoreLabel}`;
    }
    if (!conversation) return '-';
    return `${formatCcoPriorityLabel(conversation.priorityLevel)} (${Math.round(Number(conversation.priorityScore || 0))}/100)`;
  }

  function formatCcoPolicyIndicator(conversation = null, evaluation = null) {
    const policySummary =
      evaluation?.policySummary && typeof evaluation.policySummary === 'object'
        ? evaluation.policySummary
        : null;
    if (policySummary) {
      const blocked = policySummary.blocked === true;
      const reasons = Array.isArray(policySummary.reasonCodes)
        ? policySummary.reasonCodes.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      if (blocked) {
        return reasons.length
          ? `Blockerad (${reasons.slice(0, 3).join(', ')})`
          : 'Blockerad';
      }
      return reasons.length
        ? `Godkänd (${reasons.slice(0, 3).join(', ')})`
        : 'Godkänd';
    }
    if (!conversation) return '-';
    return conversation.escalationRequired ? 'Granska extra (eskalering)' : 'Ej utvärderad ännu';
  }

  function getCcoPriorityBadgeClass(priorityLevel) {
    const normalized = String(priorityLevel || '').trim().toLowerCase();
    if (normalized === 'critical' || normalized === 'kritisk') return 'badge-critical';
    if (normalized === 'high' || normalized === 'hög' || normalized === 'hog') return 'badge-high';
    if (normalized === 'medium' || normalized === 'medel') return 'badge-medium';
    return 'badge-low';
  }

  function applyCcoIndicatorClass(el, allowedClasses, activeClass) {
    if (!el) return;
    allowedClasses.forEach((name) => el.classList.remove(name));
    if (activeClass) el.classList.add(activeClass);
  }

  function classifyCcoInboxSection(row = null) {
    if (!row || typeof row !== 'object') return 'other';
    const slaStatus = normalizeCcoSlaStatus(row.slaStatus);
    const priority = String(row.priorityLevel || '').trim().toLowerCase();
    const intent = String(row.intent || '').trim().toLowerCase();
    if (slaStatus === 'breach' || priority === 'critical' || row.escalationRequired) {
      return 'acute';
    }
    if (slaStatus === 'warning' || priority === 'high' || priority === 'hög' || priority === 'hog') {
      return 'today';
    }
    if (row.followUpSuggested || row.stagnated || intent === 'follow_up') {
      return 'followup';
    }
    return 'other';
  }

  function inferCcoDominantRisk(row = null) {
    if (!row || typeof row !== 'object') return 'neutral';
    const explicitRisk = String(row?.dominantRisk || '').trim().toLowerCase();
    if (['miss', 'tone', 'follow_up', 'relationship', 'neutral'].includes(explicitRisk)) {
      return explicitRisk;
    }
    const slaStatus = normalizeCcoSlaStatus(row?.slaStatus);
    if (slaStatus === 'breach') return 'miss';
    if (row.isUnanswered === true) return 'miss';
    const tone = String(row?.tone || '').trim().toLowerCase();
    if (['frustrated', 'anxious', 'urgent', 'stressed'].includes(tone)) return 'tone';
    if (row.followUpSuggested === true || row.stagnated === true) return 'follow_up';
    const relationship = String(row?.relationshipStatus || '').trim().toLowerCase();
    if (['loyal', 'returning'].includes(relationship)) return 'relationship';
    return 'neutral';
  }

  function formatCcoRecommendedActionForThread(row = null) {
    const action = String(row?.recommendedAction || '').trim();
    if (action) return action;
    const dominantRisk = inferCcoDominantRisk(row);
    if (dominantRisk === 'miss') return 'Svara inom 1h';
    if (dominantRisk === 'tone') return 'Svara lugnande och tydligt';
    if (dominantRisk === 'follow_up') return 'Skicka mjuk uppföljning idag';
    if (dominantRisk === 'relationship') return 'Svara personligt för att stärka relationen';
    return 'Be om mer info';
  }

  function resolveCcoIndicatorAutoState(row = null) {
    if (!row || typeof row !== 'object') return 'neutral';
    const priority = safeLower(row?.priorityLevel || '');
    const slaStatus = normalizeCcoSlaStatus(row?.slaStatus);
    if (priority === 'critical' || slaStatus === 'breach') return 'critical';
    const needsReplyToday = classifyCcoInboxSection(row) === 'today';
    if (priority === 'high' || needsReplyToday) return 'high';
    if (priority === 'medium') return 'medium';
    const hasNewInbound = row?.isNewSinceLastVisit === true;
    const handledStatus = String(row?.needsReplyStatus || '').trim().toLowerCase() === 'handled';
    if (hasNewInbound || (handledStatus && hasNewInbound)) return 'new';
    if (handledStatus && !hasNewInbound) return 'handled';
    return 'neutral';
  }

  function getCcoIndicatorOverrideRecord(conversationId = '') {
    const key = String(conversationId || '').trim();
    if (!key) return null;
    const record = state.ccoIndicatorOverrideByConversationId?.[key];
    if (!record || typeof record !== 'object') return null;
    const overrideState = sanitizeCcoIndicatorOverrideState(record.state);
    if (!overrideState) return null;
    return {
      state: overrideState,
      overrideAt: toIso(record.overrideAt) || new Date().toISOString(),
      overrideBy: String(record.overrideBy || '').trim(),
    };
  }

  function getCcoThreadIndicatorState(row = null) {
    const conversationId = String(row?.conversationId || '').trim();
    const overrideRecord = getCcoIndicatorOverrideRecord(conversationId);
    if (overrideRecord) {
      return {
        state: overrideRecord.state,
        isOverridden: true,
      };
    }
    return {
      state: resolveCcoIndicatorAutoState(row),
      isOverridden: false,
    };
  }

  function mapCcoIndicatorStateToClassName(state = '') {
    const normalized = sanitizeCcoIndicatorOverrideState(state) || 'neutral';
    if (normalized === 'new') return 'state-new';
    if (normalized === 'medium') return 'state-medium';
    if (normalized === 'high') return 'state-high';
    if (normalized === 'critical') return 'state-critical';
    if (normalized === 'handled') return 'state-handled';
    return 'state-neutral';
  }

  function buildCcoCheckmarkIconMarkup({ state = 'neutral', isOverridden = false } = {}) {
    const className = mapCcoIndicatorStateToClassName(state);
    const overrideClass = isOverridden === true ? ' is-overridden' : '';
    return `<span class="cco-thread-indicator ${className}${overrideClass}" aria-hidden="true"></span>`;
  }

  function formatCcoIndicatorStateLabel(state = '') {
    const normalized = sanitizeCcoIndicatorOverrideState(state);
    if (normalized === 'new') return 'Ny (blå)';
    if (normalized === 'medium') return 'Medel (gul)';
    if (normalized === 'high') return 'Hög (orange)';
    if (normalized === 'critical') return 'Kritisk (röd)';
    if (normalized === 'handled') return 'Hanterad (grön)';
    return 'Auto';
  }

  function formatCcoMailViewModeLabel(value = 'queue') {
    const mode = sanitizeCcoMailViewMode(value);
    if (mode === 'inbound') return 'Alla inkomna';
    if (mode === 'sent') return 'Skickat';
    return 'Arbetskö';
  }

  function formatCcoDensityModeLabel(value = CCO_DEFAULT_DENSITY_MODE) {
    const mode = sanitizeCcoDensityMode(value);
    if (mode === 'focus') return 'Fokus';
    if (mode === 'overview') return 'Översikt';
    return 'Arbete';
  }

  function getCcoIndicatorStateForFilter(row = null) {
    const resolved = getCcoThreadIndicatorState(row);
    const stateValue = sanitizeCcoIndicatorOverrideState(resolved?.state || '');
    if (stateValue) return stateValue;
    return 'neutral';
  }

  function matchesCcoIndicatorViewFilter(row = null, filterValue = 'all') {
    const activeFilter = sanitizeCcoIndicatorViewFilter(filterValue || state.ccoIndicatorViewFilter);
    if (activeFilter === 'all') return true;
    const indicatorState = getCcoIndicatorStateForFilter(row);
    return indicatorState === activeFilter;
  }

  function applyCcoIndicatorViewFilter(rows = [], filterValue = 'all') {
    const source = Array.isArray(rows) ? rows : [];
    const activeFilter = sanitizeCcoIndicatorViewFilter(filterValue || state.ccoIndicatorViewFilter);
    if (activeFilter === 'all') return source;
    return source.filter((row) => matchesCcoIndicatorViewFilter(row, activeFilter));
  }

  function renderCcoIndicatorFilterRow(rows = []) {
    if (!els.ccoIndicatorFilterRow) return;
    const source = Array.isArray(rows) ? rows : [];
    const counts = {
      all: source.length,
      new: 0,
      critical: 0,
      high: 0,
      medium: 0,
      handled: 0,
    };
    for (const row of source) {
      const key = getCcoIndicatorStateForFilter(row);
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    }
    const labels = {
      all: 'Alla',
      new: 'Ny/återkommit',
      critical: 'Kritisk',
      high: 'Hög',
      medium: 'Medel',
      handled: 'Hanterad',
    };
    const indicatorClassByFilter = {
      all: 'state-neutral',
      new: 'state-new',
      critical: 'state-critical',
      high: 'state-high',
      medium: 'state-medium',
      handled: 'state-handled',
    };
    const activeFilter = sanitizeCcoIndicatorViewFilter(state.ccoIndicatorViewFilter);
    els.ccoIndicatorFilterRow
      .querySelectorAll('button[data-cco-indicator-filter]')
      .forEach((button) => {
        const value = sanitizeCcoIndicatorViewFilter(
          String(button.getAttribute('data-cco-indicator-filter') || 'all')
        );
        const count = Number(counts[value] || 0);
        const isActive = value === activeFilter;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const tooltipLabel = `${labels[value] || labels.all}: ${count}`;
        button.setAttribute('title', tooltipLabel);
        button.setAttribute('aria-label', tooltipLabel);
        button.textContent = '';
        const ring = document.createElement('span');
        ring.className = `cco-thread-indicator ${indicatorClassByFilter[value] || 'state-neutral'}`;
        ring.setAttribute('aria-hidden', 'true');
        const labelEl = document.createElement('span');
        labelEl.className = 'cco-indicator-filter-label';
        labelEl.textContent = labels[value] || labels.all;
        const countEl = document.createElement('span');
        countEl.className = 'cco-count-inline cco-indicator-filter-count';
        countEl.textContent = String(count);
        button.append(ring, labelEl, countEl);
      });
  }

  function buildCcoThreadMarkup(row = null, selectedId = '', debugMode = false) {
    if (!row || typeof row !== 'object') return '';
    const isActive = row.conversationId === selectedId;
    const conversationId = String(row.conversationId || '').trim();
    const status = formatCcoNeedsReplyLabel(row.needsReplyStatus);
    const safeHours = Number(row.hoursSinceInbound || 0);
    const meta = `${safeHours.toFixed(1)}h sedan`;
    const mailboxLabel = row.mailboxLabel || resolveCcoMailboxLabel(row);
    const mailboxShortLabel = formatCcoMailboxShortLabel(mailboxLabel) || mailboxLabel;
    const relationshipStatus = String(row.relationshipStatus || classifyCcoRelationshipStatus(row))
      .trim()
      .toLowerCase();
    const relationshipClass = ['new', 'returning', 'loyal', 'dormant'].includes(relationshipStatus)
      ? `relationship-${relationshipStatus}`
      : 'relationship-new';
    const relationshipLabel = row.relationshipLabel || formatCcoRelationshipChip(relationshipStatus);
    const lifecycleLabel = formatCcoLifecycleLabel(row.lifecycleStatus || row?.customerSummary?.lifecycleStatus);
    const priorityClass = getCcoPriorityBadgeClass(row.priorityLevel);
    const slaChipClass = getCcoSlaChipClass(row.slaStatus);
    const slaToneClass = getCcoSlaToneClass(row);
    const isNew = row.isNewSinceLastVisit === true;
    const dominantRisk = inferCcoDominantRisk(row);
    const highRisk = ['critical', 'high'].includes(safeLower(row.priorityLevel || ''));
    const unansweredChip = row.isUnanswered === true
      ? `<span class="cco-thread-chip">Obesvarad ≥ ${Math.max(1, Number(row.unansweredThresholdHours || 24))}h</span>`
      : '';
    const scoreChip = debugMode
      ? `<span class="cco-thread-chip">Poäng ${Math.round(Number(row.priorityScore || 0))}</span>`
      : '';
    const followUpChip = row.followUpSuggested
      ? '<span class="cco-thread-chip">🔁 Följ upp</span>'
      : '';
    const systemMessageChip = isLikelyCcoSystemMessage(row)
      ? '<span class="cco-thread-chip system-message">Systemmail</span>'
      : '';
    const allChips = [
      `<span class="cco-priority-badge ${priorityClass}">${escapeHtml(formatCcoPriorityLabel(row.priorityLevel))}</span>`,
      `<span class="cco-thread-chip ${slaChipClass}">${escapeHtml(formatCcoSlaStatusChip(row.slaStatus))}</span>`,
      `<span class="cco-thread-chip">${escapeHtml(formatCcoIntentChip(row.intent))}</span>`,
      `<span class="cco-thread-chip">${escapeHtml(formatCcoToneChip(row.tone))}</span>`,
      `<span class="cco-thread-chip">${escapeHtml(lifecycleLabel)}</span>`,
      `<span class="cco-thread-chip ${relationshipClass}">${escapeHtml(relationshipLabel)}</span>`,
      `<span class="cco-thread-chip">${escapeHtml(status)}</span>`,
      unansweredChip,
      followUpChip,
      systemMessageChip,
      scoreChip,
    ].filter(Boolean);
    const indicator = getCcoThreadIndicatorState(row);
    const indicatorMarkup = buildCcoCheckmarkIconMarkup(indicator);
    const primaryChip = allChips[0] || '';
    const tagMarkup = primaryChip
      ? `<span class="cco-thread-tags">${primaryChip}</span>`
      : '';
    const previewText = String(
      row.latestInboundPreview || row.lastMessagePreview || row.recommendedAction || ''
    ).trim();
    const previewMarkup = previewText
      ? `<span class="cco-thread-preview">${escapeHtml(previewText)}</span>`
      : '';
    return `
      <li class="cco-thread${isActive ? ' active' : ''}${slaToneClass ? ` ${slaToneClass}` : ''}${isNew ? ' thread-new' : ''} sprint-focus" data-dominant-risk="${escapeHtml(
        dominantRisk
      )}" data-high-risk="${highRisk ? 'true' : 'false'}" data-cco-conversation-id="${escapeHtml(
        conversationId
      )}" data-cco-indicator-state="${escapeHtml(indicator.state)}" data-cco-indicator-overridden="${
        indicator.isOverridden ? 'true' : 'false'
      }">
        <button type="button" class="cco-thread-btn ccoConversationSelectBtn" data-conversation-id="${escapeHtml(
          conversationId
        )}">
          <span class="cco-thread-head">${indicatorMarkup}<span class="cco-thread-subject">${escapeHtml(
      row.subject
    )}</span></span>
          <span class="cco-thread-meta">${escapeHtml(row.sender)} · <span title="${escapeHtml(mailboxLabel)}">${escapeHtml(mailboxShortLabel)}</span> · ${meta}</span>
          ${previewMarkup}
          ${tagMarkup}
        </button>
      </li>
    `;
  }

  function renderCcoSectionRows(listEl, rows = [], selectedId = '', debugMode = false, emptyText = 'Inga konversationer i kö.') {
    if (!listEl) return;
    if (!Array.isArray(rows) || !rows.length) {
      listEl.innerHTML = `<li class="muted mini" style="padding:12px 14px">${escapeHtml(emptyText)}</li>`;
      return;
    }
    listEl.innerHTML = rows
      .map((row) => buildCcoThreadMarkup(row, selectedId, debugMode))
      .filter(Boolean)
      .join('');
  }

  function renderCcoMailboxFilterRow(rows = []) {
    if (!els.ccoInboxMailboxFilters) return;
    const safeRows = Array.isArray(rows) ? rows : [];
    const presentMailboxLabels = new Set(
      safeRows.map((row) => resolveCcoMailboxLabel(row)).filter((mailbox) => isCcoAllowedMailbox(mailbox))
    );
    const mailboxCounts = safeRows.reduce((acc, row) => {
      const mailbox = resolveCcoMailboxLabel(row);
      if (!isCcoAllowedMailbox(mailbox)) return acc;
      acc[mailbox] = Number(acc[mailbox] || 0) + 1;
      return acc;
    }, {});
    // Always show the full locked mailbox allowlist so operators can
    // switch to any approved mailbox even when there are no messages yet.
    const filterOptions = CCO_LOCKED_MAILBOX_ALLOWLIST.slice();

    const activeFilter = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter);
    const hasActiveFilter = activeFilter === 'all' || filterOptions.includes(activeFilter);
    if (!hasActiveFilter) {
      state.ccoInboxMailboxFilter = 'all';
    }
    const mailboxEntries = filterOptions.map((mailbox) => ({
      label: formatCcoMailboxShortLabel(mailbox),
      title: mailbox,
      value: mailbox,
      count: Number(mailboxCounts[mailbox] || 0),
    }));
    const favoriteLimit = 5;
    const rankedFavorites = mailboxEntries
      .slice()
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))
      .slice(0, favoriteLimit);
    const selectedFavoriteValue = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter);
    if (
      selectedFavoriteValue !== 'all' &&
      !rankedFavorites.some((entry) => sanitizeCcoMailboxFilter(entry.value) === selectedFavoriteValue)
    ) {
      const selectedEntry = mailboxEntries.find(
        (entry) => sanitizeCcoMailboxFilter(entry.value) === selectedFavoriteValue
      );
      if (selectedEntry) {
        if (rankedFavorites.length >= favoriteLimit) {
          rankedFavorites[rankedFavorites.length - 1] = selectedEntry;
        } else {
          rankedFavorites.push(selectedEntry);
        }
      }
    }
    const buttons = [
      {
        label: 'Alla',
        value: 'all',
        count: safeRows.length,
      },
      ...rankedFavorites,
    ];
    if (els.ccoInboxMailboxSelect) {
      const options = [
        {
          value: 'all',
          label: 'Alla postlådor',
          count: safeRows.length,
        },
        ...filterOptions.map((mailbox) => ({
          value: mailbox,
          label: formatCcoMailboxShortLabel(mailbox) || mailbox,
          count: Number(mailboxCounts[mailbox] || 0),
          title: mailbox,
        })),
      ];
      els.ccoInboxMailboxSelect.innerHTML = options
        .map((entry) => {
          const value = sanitizeCcoMailboxFilter(entry.value);
          const isActive =
            sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter) === sanitizeCcoMailboxFilter(value);
          const label =
            value === 'all'
              ? `${entry.label} (${Number(entry.count || 0)})`
              : `${entry.label} · ${Number(entry.count || 0)}`;
          const title = entry.title ? ` title="${escapeHtml(entry.title)}"` : '';
          return `<option value="${escapeHtml(value)}"${isActive ? ' selected' : ''}${title}>${escapeHtml(
            label
          )}</option>`;
        })
        .join('');
      const selectedFilter = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter);
      if (els.ccoInboxMailboxSelect.value !== selectedFilter) {
        els.ccoInboxMailboxSelect.value = selectedFilter;
      }
    }
    els.ccoInboxMailboxFilters.innerHTML = buttons
      .map((entry) => {
        const value = normalizeCcoMailboxKey(entry.value);
        const isActive = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter) === sanitizeCcoMailboxFilter(value);
        const hasMessages = value === 'all' || presentMailboxLabels.has(value);
        const labelHtml = value === 'all'
          ? `<span>${escapeHtml(entry.label)}</span>`
          : `<span class="cco-filter-btn-mailbox-label">${escapeHtml(entry.label)}</span>`;
        const countHtml = Number(entry.count || 0) > 0
          ? `<span class="cco-count-inline cco-filter-btn-mailbox-count">${Number(entry.count || 0)}</span>`
          : '';
        const title = entry.title
          ? ` title="${escapeHtml(entry.title)}"`
          : '';
        const innerClass = value === 'all' ? '' : ' class="cco-filter-btn-mailbox"';
        return `<button type="button" class="cco-filter-btn${isActive ? ' is-active' : ''}" data-cco-mailbox-filter="${escapeHtml(
          value || 'all'
        )}"${hasMessages ? '' : ' data-empty="true"'}${title}><span${innerClass}>${labelHtml}${countHtml}</span></button>`;
      })
      .join('');
  }

  function renderCcoSearchControls() {
    if (els.ccoInboxSearchInput) {
      const nextValue = sanitizeCcoSearchQuery(state.ccoInboxSearchQuery);
      if (els.ccoInboxSearchInput.value !== nextValue) {
        els.ccoInboxSearchInput.value = nextValue;
      }
    }
    if (els.ccoInboxShowSystemToggle) {
      els.ccoInboxShowSystemToggle.checked = sanitizeCcoShowSystemMessages(
        state.ccoInboxShowSystemMessages
      );
    }
    if (els.ccoReplyShowSystemToggle) {
      els.ccoReplyShowSystemToggle.checked = sanitizeCcoShowSystemMessages(
        state.ccoInboxShowSystemMessages
      );
    }
  }

  function renderCcoMailboxFiltersVisibility() {
    const expanded = sanitizeCcoMailboxFiltersExpanded(state.ccoMailboxFiltersExpanded);
    state.ccoMailboxFiltersExpanded = expanded;
    if (els.ccoMailboxFiltersBlock) {
      els.ccoMailboxFiltersBlock.classList.toggle('is-collapsed', !expanded);
    }
    if (els.ccoMailboxFiltersToggleBtn) {
      els.ccoMailboxFiltersToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (els.ccoMailboxFiltersChevron) {
      els.ccoMailboxFiltersChevron.textContent = expanded ? '▾' : '▸';
    }
  }

  function renderCcoExtraFiltersVisibility() {
    const expanded = sanitizeCcoExtraFiltersExpanded(state.ccoExtraFiltersExpanded);
    state.ccoExtraFiltersExpanded = expanded;
    if (els.ccoExtraFiltersBlock) {
      els.ccoExtraFiltersBlock.classList.toggle('is-collapsed', !expanded);
    }
    if (els.ccoExtraFiltersToggleBtn) {
      els.ccoExtraFiltersToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }
    if (els.ccoExtraFiltersChevron) {
      els.ccoExtraFiltersChevron.textContent = expanded ? '▾' : '▸';
    }
  }

  function isCcoDebugOverlayEnabled() {
    return state.ccoEvidenceMode === true || isCcoInteractionDebugEnabled();
  }

  function renderCcoDebugOverlay(snapshot = null) {
    if (!els.ccoDebugOverlay) return;
    if (!isCcoDebugOverlayEnabled()) {
      els.ccoDebugOverlay.classList.add('hidden');
      els.ccoDebugOverlay.textContent = '';
      return;
    }
    const safe = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const parts = [
      `mode=${sanitizeCcoMailViewMode(safe.mode || state.ccoMailViewMode)}`,
      `view=${sanitizeCcoDensityMode(safe.view || state.ccoInboxDensityMode)}`,
      `loading=${safe.loading === true || state.ccoInboxLoading === true ? 'true' : 'false'}`,
      `total=${Number.isFinite(Number(safe.totalRows)) ? Number(safe.totalRows) : 0}`,
      `open=${Number.isFinite(Number(safe.openRows)) ? Number(safe.openRows) : 0}`,
      `filtered=${Number.isFinite(Number(safe.filteredRows)) ? Number(safe.filteredRows) : 0}`,
      `visible=${Number.isFinite(Number(safe.visibleRows)) ? Number(safe.visibleRows) : 0}`,
      `feed=${Number.isFinite(Number(safe.feedCount)) ? Number(safe.feedCount) : 0}`,
      `mailbox=${sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter)}`,
      `sla=${sanitizeCcoSlaFilter(state.ccoInboxSlaFilter)}`,
      `lifecycle=${sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter)}`,
      `search="${sanitizeCcoSearchQuery(state.ccoInboxSearchQuery)}"`,
      `system=${sanitizeCcoShowSystemMessages(state.ccoInboxShowSystemMessages) ? 'on' : 'off'}`,
    ];
    const firstItem = String(safe.firstItemSubject || '').trim();
    if (firstItem) {
      parts.push(`first="${firstItem.slice(0, 80)}"`);
    }
    if (safe.sections && typeof safe.sections === 'object') {
      const sectionParts = [];
      for (const sectionKey of ['sprint', 'high', 'needs', 'rest']) {
        const section = safe.sections[sectionKey];
        if (!section || typeof section !== 'object') continue;
        const shown = Number(section.shown || 0);
        const total = Number(section.total || 0);
        const cap = Number(section.cap || 0);
        sectionParts.push(`${sectionKey}:${shown}/${total}(cap:${cap})`);
      }
      if (sectionParts.length) {
        parts.push(`sections=${sectionParts.join(',')}`);
      }
    }
    if (Number.isFinite(Number(safe.containerHeight))) {
      parts.push(`container=${Math.round(Number(safe.containerHeight))}px`);
    }
    if (String(safe.containerOverflowY || '').trim()) {
      parts.push(`overflowY=${String(safe.containerOverflowY).trim()}`);
    }
    if (Number.isFinite(Number(safe.computedVisibleRows))) {
      parts.push(`computedVisible=${Number(safe.computedVisibleRows)}`);
    }
    const reason = String(safe.reason || '').trim();
    if (reason) {
      parts.push(`reason="${reason}"`);
    }
    els.ccoDebugOverlay.classList.remove('hidden');
    els.ccoDebugOverlay.textContent = `[CCO DEBUG] ${parts.join(' | ')}`;
  }

  function setCcoLoadingState(isLoading = false, message = '') {
    const loading = isLoading === true;
    state.ccoInboxLoading = loading;
    if (els.ccoCenterColumn) {
      els.ccoCenterColumn.classList.toggle('is-loading', loading);
      if (loading) {
        els.ccoCenterColumn.classList.remove('is-empty');
      }
    }
    if (els.ccoCenterLoadingMeta) {
      els.ccoCenterLoadingMeta.textContent = message || (loading ? 'Synkar arbetskö och läsyta.' : '');
    }
    renderCcoDebugOverlay({
      loading,
      reason: message || '',
    });
  }

  function renderCcoWorkspaceCompactState() {
    const compact = sanitizeCcoWorkspaceCompact(state.ccoWorkspaceCompact);
    state.ccoWorkspaceCompact = compact;
    if (els.ccoSprintShell) {
      els.ccoSprintShell.classList.toggle('is-collapsed', compact);
    }
    if (els.ccoWorkspaceCompactToggleBtn) {
      els.ccoWorkspaceCompactToggleBtn.textContent = compact
        ? 'Visa fokusdetaljer'
        : 'Dölj fokusdetaljer';
      els.ccoWorkspaceCompactToggleBtn.setAttribute('aria-expanded', compact ? 'false' : 'true');
      els.ccoWorkspaceCompactToggleBtn.setAttribute('aria-pressed', compact ? 'false' : 'true');
    }
  }

  function renderCcoCenterReadTab() {
    const tab = sanitizeCcoCenterReadTab(state.ccoCenterReadTab);
    state.ccoCenterReadTab = tab;
    const isConversationTab = tab === 'conversation';
    if (els.ccoCenterTabConversationBtn) {
      els.ccoCenterTabConversationBtn.classList.toggle('is-active', isConversationTab);
      els.ccoCenterTabConversationBtn.setAttribute('aria-selected', isConversationTab ? 'true' : 'false');
    }
    if (els.ccoCenterTabCustomerBtn) {
      els.ccoCenterTabCustomerBtn.classList.toggle('is-active', !isConversationTab);
      els.ccoCenterTabCustomerBtn.setAttribute('aria-selected', !isConversationTab ? 'true' : 'false');
    }
    if (els.ccoReadTabConversation) {
      els.ccoReadTabConversation.classList.toggle('is-active', isConversationTab);
    }
    if (els.ccoReadTabCustomer) {
      els.ccoReadTabCustomer.classList.toggle('is-active', !isConversationTab);
    }
  }

  function setCcoCenterReadTab(tab = 'conversation', { persist = true } = {}) {
    state.ccoCenterReadTab = sanitizeCcoCenterReadTab(tab);
    renderCcoCenterReadTab();
    if (persist) persistCcoWorkspaceSessionState();
  }

  function renderCcoSearchMeta(meta = null) {
    if (!els.ccoInboxSearchMeta) return;
    if (state.ccoInboxLoading === true) {
      els.ccoInboxSearchMeta.textContent = 'Hämtar mail…';
      return;
    }
    const safeMeta = meta && typeof meta === 'object' ? meta : {};
    const includeSystemMessages = safeMeta.includeSystemMessages === true;
    const hiddenSystemRows = Number(safeMeta.hiddenSystemRows || 0);
    const totalBeforeSearch = Number(safeMeta.totalBeforeSearch || 0);
    const matchedRows = Number(safeMeta.matchedRows || 0);
    const searchQuery = sanitizeCcoSearchQuery(safeMeta.searchQuery);
    const parts = [];

    if (searchQuery) {
      parts.push(`Visar ${matchedRows} av ${totalBeforeSearch} efter sökning`);
    } else {
      parts.push(`Visar ${totalBeforeSearch} konversationer`);
    }
    if (searchQuery) {
      parts.push(`Sök: "${searchQuery}"`);
    }
    if (!includeSystemMessages && hiddenSystemRows > 0) {
      parts.push(`${hiddenSystemRows} systemmail dolda`);
    }
    if (state.ccoInboxLastSyncAt) {
      parts.push(`Senast synk: ${formatCcoDateTimeValue(state.ccoInboxLastSyncAt)}`);
    }

    els.ccoInboxSearchMeta.textContent = parts.join(' · ');
  }

  function renderCcoSlaFilterRow() {
    if (!els.ccoInboxSlaFilters) return;
    const activeFilter = sanitizeCcoSlaFilter(state.ccoInboxSlaFilter);
    const options = [
      { value: 'all', label: 'Alla' },
      { value: 'breach', label: '🔴 SLA-brist' },
      { value: 'warning', label: '🟡 Varning' },
      { value: 'safe', label: '🟢 Säker' },
      { value: 'new', label: '🆕 Nya' },
    ];
    els.ccoInboxSlaFilters.innerHTML = options
      .map((entry) => {
        const isActive = activeFilter === entry.value;
        return `<button type="button" class="cco-filter-btn${isActive ? ' is-active' : ''}" data-cco-sla-filter="${escapeHtml(
          entry.value
        )}">${escapeHtml(entry.label)}</button>`;
      })
      .join('');
  }

  function renderCcoLifecycleFilterRow() {
    if (!els.ccoInboxStateFilters) return;
    const activeFilter = sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter);
    const options = [
      { value: 'all', label: 'Alla statusar' },
      { value: 'follow_up_pending', label: 'Uppföljning väntar' },
      { value: 'active_dialogue', label: 'Aktiv dialog' },
      { value: 'new', label: 'Ny' },
      { value: 'awaiting_reply', label: 'Väntar svar' },
      { value: 'dormant', label: 'Vilande' },
      { value: 'handled', label: 'Hanterad' },
      { value: 'archived', label: 'Arkiverad' },
    ];
    els.ccoInboxStateFilters.innerHTML = options
      .map((entry) => {
        const isActive = activeFilter === entry.value;
        return `<button type="button" class="cco-filter-btn${isActive ? ' is-active' : ''}" data-cco-state-filter="${escapeHtml(
          entry.value
        )}">${escapeHtml(entry.label)}</button>`;
      })
      .join('');
  }

  function renderCcoUnansweredPanel(unansweredRows = []) {
    const rows = Array.isArray(unansweredRows) ? unansweredRows : [];
    const critical = rows.filter((row) => safeLower(row?.priorityLevel || '') === 'critical').length;
    const high = rows.filter((row) => safeLower(row?.priorityLevel || '') === 'high').length;
    const medium = rows.filter((row) => safeLower(row?.priorityLevel || '') === 'medium').length;
    if (els.ccoUnansweredCriticalCount) els.ccoUnansweredCriticalCount.textContent = String(critical);
    if (els.ccoUnansweredHighCount) els.ccoUnansweredHighCount.textContent = String(high);
    if (els.ccoUnansweredMediumCount) els.ccoUnansweredMediumCount.textContent = String(medium);
    if (!els.ccoUnansweredPanel) return;
    els.ccoUnansweredPanel.classList.toggle('is-empty', rows.length === 0);
  }

  function renderCcoDensityFilterRow() {
    if (!els.ccoInboxDensityFilters) return;
    const activeMode = sanitizeCcoDensityMode(state.ccoInboxDensityMode);
    const options = [
      { value: 'focus', label: 'Fokus' },
      { value: 'work', label: 'Arbete' },
      { value: 'overview', label: 'Översikt' },
    ];
    els.ccoInboxDensityFilters.innerHTML = options
      .map((entry) => {
        const isActive = entry.value === activeMode;
        return `<button type="button" class="cco-filter-btn${isActive ? ' is-active' : ''}" data-cco-density-mode="${escapeHtml(
          entry.value
        )}">${escapeHtml(entry.label)}</button>`;
      })
      .join('');
  }

  function renderCcoMailViewModeToggle() {
    const activeMode = sanitizeCcoMailViewMode(state.ccoMailViewMode);
    state.ccoMailViewMode = activeMode;
    if (!els.ccoInboxModeToggle) return;
    els.ccoInboxModeToggle
      .querySelectorAll('button[data-cco-mail-view]')
      .forEach((button) => {
        const buttonMode = sanitizeCcoMailViewMode(
          String(button.getAttribute('data-cco-mail-view') || '').trim()
        );
        const isActive = buttonMode === activeMode;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
  }

  function isCcoReadOnlyMailViewMode() {
    const mode = sanitizeCcoMailViewMode(state.ccoMailViewMode);
    return mode === 'inbound' || mode === 'sent';
  }

  function closeCcoIndicatorContextMenu() {
    state.ccoIndicatorContextConversationId = '';
    if (!els.ccoIndicatorContextMenu) return;
    els.ccoIndicatorContextMenu.classList.remove('visible');
    els.ccoIndicatorContextMenu.setAttribute('aria-hidden', 'true');
  }

  function openCcoIndicatorContextMenu({
    conversationId = '',
    clientX = 0,
    clientY = 0,
  } = {}) {
    const safeConversationId = String(conversationId || '').trim();
    if (!safeConversationId || !els.ccoIndicatorContextMenu) return;
    state.ccoIndicatorContextConversationId = safeConversationId;
    const menu = els.ccoIndicatorContextMenu;
    menu.classList.add('visible');
    menu.setAttribute('aria-hidden', 'false');
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const rect = menu.getBoundingClientRect();
    const margin = 10;
    const maxLeft = Math.max(margin, viewportWidth - rect.width - margin);
    const maxTop = Math.max(margin, viewportHeight - rect.height - margin);
    const left = Math.min(Math.max(margin, Number(clientX || 0)), maxLeft);
    const top = Math.min(Math.max(margin, Number(clientY || 0)), maxTop);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  async function setCcoIndicatorOverride(conversationId = '', overrideState = '') {
    const safeConversationId = String(conversationId || '').trim();
    const normalizedState = sanitizeCcoIndicatorOverrideState(overrideState);
    if (!safeConversationId || !normalizedState) return;
    const actor = String(state.profile?.email || state.profile?.user?.email || state.profile?.id || '')
      .trim()
      .slice(0, 120);
    state.ccoIndicatorOverrideByConversationId = {
      ...(state.ccoIndicatorOverrideByConversationId || {}),
      [safeConversationId]: {
        state: normalizedState,
        overrideBy: actor,
        overrideAt: new Date().toISOString(),
      },
    };
    persistCcoWorkspaceSessionState();
    await postCcoUsageEvent('indicator_override_set', {
      conversationId: safeConversationId,
      overrideState: normalizedState,
      overrideBy: actor || null,
      overrideAt: new Date().toISOString(),
    });
  }

  async function clearCcoIndicatorOverride(conversationId = '') {
    const safeConversationId = String(conversationId || '').trim();
    if (!safeConversationId) return;
    const nextMap = { ...(state.ccoIndicatorOverrideByConversationId || {}) };
    if (!Object.prototype.hasOwnProperty.call(nextMap, safeConversationId)) return;
    delete nextMap[safeConversationId];
    state.ccoIndicatorOverrideByConversationId = nextMap;
    persistCcoWorkspaceSessionState();
    await postCcoUsageEvent('indicator_override_cleared', {
      conversationId: safeConversationId,
      clearedAt: new Date().toISOString(),
    });
  }

  function buildCcoFallbackFeedEntries(rows = [], direction = 'inbound') {
    const safeRows = Array.isArray(rows) ? rows : [];
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    if (normalizedDirection === 'outbound') {
      return safeRows
        .filter((row) => String(row?.lastOutboundAt || '').trim())
        .map((row) => ({
          feedId: `${String(row?.conversationId || '').trim()}:outbound`,
          conversationId: String(row?.conversationId || '').trim(),
          messageId: String(row?.messageId || '').trim(),
          direction: 'outbound',
          subject: String(row?.subject || '(utan ämne)').trim() || '(utan ämne)',
          counterpart: `Till ${String(row?.sender || 'kund').trim() || 'kund'}`,
          mailboxAddress: resolveCcoMailboxLabel(row),
          sentAt: String(row?.lastOutboundAt || '').trim(),
          preview: 'Skickat svar registrerat.',
        }));
    }
    return safeRows
      .filter((row) => String(row?.lastInboundAt || '').trim())
      .map((row) => ({
        feedId: `${String(row?.conversationId || '').trim()}:inbound`,
        conversationId: String(row?.conversationId || '').trim(),
        messageId: String(row?.messageId || '').trim(),
        direction: 'inbound',
        subject: String(row?.subject || '(utan ämne)').trim() || '(utan ämne)',
        counterpart: String(row?.sender || 'okänd avsändare').trim() || 'okänd avsändare',
        mailboxAddress: resolveCcoMailboxLabel(row),
        sentAt: String(row?.lastInboundAt || '').trim(),
        preview: sanitizeCcoPreviewText(row?.latestInboundPreview || ''),
      }));
  }

  function normalizeCcoFeedEntry(raw = null, direction = 'inbound') {
    if (!raw || typeof raw !== 'object') return null;
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    const conversationId = String(raw.conversationId || '').trim();
    if (!conversationId) return null;
    const feedId = String(raw.feedId || '').trim() || `${conversationId}:${normalizedDirection}:${String(raw.messageId || '').trim() || 'item'}`;
    const mailboxAddress = resolveCcoMailboxLabel(raw);
    if (!isCcoAllowedMailbox(mailboxAddress)) return null;
    const sentAt = String(raw.sentAt || '').trim();
    const preview = sanitizeCcoPreviewText(raw.preview || raw.bodyPreview || '');
    const counterpart = String(raw.counterpart || raw.sender || raw.recipient || '').trim();
    return {
      feedId,
      conversationId,
      messageId: String(raw.messageId || '').trim(),
      direction: normalizedDirection,
      subject: String(raw.subject || '(utan ämne)').trim() || '(utan ämne)',
      counterpart: counterpart || (normalizedDirection === 'inbound' ? 'okänd avsändare' : 'okänd mottagare'),
      mailboxAddress,
      sentAt,
      preview,
    };
  }

  function getCcoFeedEntries(data = null, direction = 'inbound') {
    const safeData = data && typeof data === 'object' ? data : {};
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    const sourceField = normalizedDirection === 'outbound' ? 'outboundFeed' : 'inboundFeed';
    const sourceFromData = asArray(safeData[sourceField]);
    const sortedRows = getSortedCcoConversations(safeData).map((row) => enrichCcoConversationRow(row));
    const source = sourceFromData.length
      ? sourceFromData
      : buildCcoFallbackFeedEntries(sortedRows, normalizedDirection);
    const readOnlyMailView = isCcoReadOnlyMailViewMode();
    const includeSystemMessages = readOnlyMailView
      ? true
      : sanitizeCcoShowSystemMessages(state.ccoInboxShowSystemMessages);
    const searchQuery = sanitizeCcoSearchQuery(state.ccoInboxSearchQuery).toLowerCase();
    const mailboxFilter = sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter);
    const lifecycleFilter = sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter);
    const slaFilter = sanitizeCcoSlaFilter(state.ccoInboxSlaFilter);
    const rowByConversationId = new Map(
      sortedRows.map((row) => [String(row?.conversationId || '').trim(), row])
    );
    const entries = source
      .map((item) => normalizeCcoFeedEntry(item, normalizedDirection))
      .filter(Boolean)
      .filter((entry) => {
        if (mailboxFilter !== 'all' && normalizeCcoMailboxKey(entry.mailboxAddress) !== mailboxFilter) return false;
        return true;
      })
      .map((entry) => {
        const row = rowByConversationId.get(entry.conversationId) || null;
        return {
          ...entry,
          row,
          isSystemMessage: isLikelyCcoSystemMessage(row || entry),
          isNewSinceLastVisit: row?.isNewSinceLastVisit === true,
          lifecycleStatus: normalizeCcoLifecycleStatus(row?.lifecycleStatus || row?.customerSummary?.lifecycleStatus),
          slaStatus: normalizeCcoSlaStatus(row?.slaStatus),
          priorityLevel: normalizePriorityLevelForUi(row?.priorityLevel || 'Low'),
        };
      })
      .filter((entry) => (includeSystemMessages ? true : entry.isSystemMessage !== true))
      .filter((entry) => {
        if (readOnlyMailView) return true;
        if (lifecycleFilter !== 'all') return entry.lifecycleStatus === lifecycleFilter;
        return true;
      })
      .filter((entry) => {
        if (readOnlyMailView) return true;
        if (slaFilter === 'all') return true;
        if (slaFilter === 'new') return entry.isNewSinceLastVisit === true;
        return entry.slaStatus === slaFilter;
      })
      .filter((entry) => {
        if (!searchQuery) return true;
        const haystack = `${safeLower(entry.subject)} ${safeLower(entry.counterpart)} ${safeLower(entry.preview)} ${safeLower(entry.mailboxAddress)}`;
        return haystack.includes(searchQuery);
      })
      .sort((left, right) => {
        const leftTs = Date.parse(String(left.sentAt || ''));
        const rightTs = Date.parse(String(right.sentAt || ''));
        const leftSafe = Number.isFinite(leftTs) ? leftTs : 0;
        const rightSafe = Number.isFinite(rightTs) ? rightTs : 0;
        return rightSafe - leftSafe;
      });
    return entries;
  }

  function renderCcoFeedList(entries = [], mode = 'inbound') {
    if (!els.ccoInboxFeedList) return;
    const selectedFeedId = String(state.ccoSelectedFeedMessageId || '').trim();
    const selectedConversationId = String(state.ccoSelectedConversationId || '').trim();
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!safeEntries.length) {
      els.ccoInboxFeedList.innerHTML = `<li class="muted mini" style="padding:12px 14px">Inga mail i vyn ${escapeHtml(
        formatCcoMailViewModeLabel(mode)
      ).toLowerCase()}.</li>`;
      return;
    }
    els.ccoInboxFeedList.innerHTML = safeEntries
      .slice(0, 600)
      .map((entry) => {
        const selected = entry.feedId === selectedFeedId || (!selectedFeedId && entry.conversationId === selectedConversationId);
        const indicator = getCcoThreadIndicatorState(entry.row || entry);
        const indicatorMarkup = buildCcoCheckmarkIconMarkup(indicator);
        const sentAtLabel = entry.sentAt ? formatCcoDateTimeValue(entry.sentAt) : '-';
        const mailboxShort = formatCcoMailboxShortLabel(entry.mailboxAddress) || entry.mailboxAddress;
        const directionChip = mode === 'sent' ? 'Skickat' : 'Inkommet';
        return `
          <li class="cco-feed-item${selected ? ' is-selected' : ''}" data-cco-feed-id="${escapeHtml(entry.feedId)}" data-cco-conversation-id="${escapeHtml(entry.conversationId)}">
            <button type="button" class="cco-feed-item-btn ccoFeedSelectBtn" data-cco-feed-id="${escapeHtml(
              entry.feedId
            )}" data-conversation-id="${escapeHtml(entry.conversationId)}">
              <span class="cco-feed-item-top">
                ${indicatorMarkup}
                <span class="cco-feed-item-subject">${escapeHtml(entry.subject)}</span>
              </span>
              <span class="cco-feed-item-meta">${escapeHtml(entry.counterpart)} · <span title="${escapeHtml(
          entry.mailboxAddress
        )}">${escapeHtml(mailboxShort)}</span> · ${escapeHtml(sentAtLabel)}</span>
              <span class="cco-feed-item-preview">${escapeHtml(String(entry.preview || '').trim())}</span>
              <span class="cco-thread-tags"><span class="cco-thread-chip">${escapeHtml(directionChip)}</span></span>
            </button>
          </li>
        `;
      })
      .join('');
  }

  function showCcoSoftBreakPanel(conversationId = '') {
    const safeConversationId = String(conversationId || '').trim();
    if (!safeConversationId || !els.ccoSoftBreakPanel) return false;
    state.ccoPendingSoftBreakConversationId = safeConversationId;
    els.ccoSoftBreakPanel.classList.add('visible');
    return true;
  }

  function hideCcoSoftBreakPanel() {
    state.ccoPendingSoftBreakConversationId = '';
    if (!els.ccoSoftBreakPanel) return;
    els.ccoSoftBreakPanel.classList.remove('visible');
  }

  function getCcoDensityVisibility(mode = CCO_DEFAULT_DENSITY_MODE, sectionTotals = {}) {
    const normalized = sanitizeCcoDensityMode(mode);
    if (normalized === 'focus') {
      return { sprint: true, high: false, needs: false, rest: false };
    }
    if (normalized === 'overview') {
      return { sprint: true, high: true, needs: true, rest: true };
    }
    const safeTotals = {
      sprint: Math.max(0, Number(sectionTotals?.sprint || 0)),
      high: Math.max(0, Number(sectionTotals?.high || 0)),
      needs: Math.max(0, Number(sectionTotals?.needs || 0)),
      rest: Math.max(0, Number(sectionTotals?.rest || 0)),
    };
    const visibility = { sprint: true, high: true, needs: false, rest: false };
    const primaryRows = safeTotals.sprint + safeTotals.high;
    // Keep Arbete as a focused view, but avoid dead-looking queues when the
    // focused sections are nearly empty and remaining rows exist downstream.
    if (primaryRows < 2 && safeTotals.needs > 0) {
      visibility.needs = true;
    }
    const visibleSoFar = primaryRows + (visibility.needs ? safeTotals.needs : 0);
    if (visibleSoFar < 2 && safeTotals.rest > 0) {
      visibility.rest = true;
    }
    return visibility;
  }

  function getCcoSectionRenderOrder(sectionTotals = {}) {
    const hasHigh = Number(sectionTotals.high || 0) > 0;
    return hasHigh
      ? ['sprint', 'high', 'needs', 'rest']
      : ['sprint', 'needs', 'high', 'rest'];
  }

  function applyCcoSectionDomOrder(order = []) {
    if (!els.ccoInboxWorklist) return;
    const lookup = {
      sprint: els.ccoInboxGroupAcuteBlock,
      high: els.ccoInboxGroupTodayBlock,
      needs: els.ccoInboxGroupFollowupBlock,
      rest: els.ccoInboxGroupOtherBlock,
    };
    for (const sectionKey of order) {
      const node = lookup[sectionKey];
      if (!node) continue;
      els.ccoInboxWorklist.appendChild(node);
    }
  }

  function capCcoSectionRows(rows = [], limit = 0, selectedId = '') {
    const source = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const total = source.length;
    const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
    let visible = safeLimit > 0 ? source.slice(0, safeLimit) : [];
    if (!selectedId) {
      return {
        visibleRows: visible,
        shown: visible.length,
        total,
      };
    }
    const selectedIndex = source.findIndex((row) => String(row?.conversationId || '').trim() === selectedId);
    if (selectedIndex === -1) {
      return {
        visibleRows: visible,
        shown: visible.length,
        total,
      };
    }
    const alreadyVisible = visible.some((row) => String(row?.conversationId || '').trim() === selectedId);
    if (alreadyVisible || safeLimit <= 0) {
      return {
        visibleRows: visible,
        shown: visible.length,
        total,
      };
    }
    const selectedRow = source[selectedIndex];
    if (!selectedRow) {
      return {
        visibleRows: visible,
        shown: visible.length,
        total,
      };
    }
    if (visible.length < safeLimit) {
      visible = [...visible, selectedRow];
    } else if (visible.length > 0) {
      visible = [selectedRow, ...visible.slice(0, Math.max(0, safeLimit - 1))];
    }
    const deduped = [];
    const seen = new Set();
    for (const row of visible) {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId || seen.has(conversationId)) continue;
      seen.add(conversationId);
      deduped.push(row);
    }
    return {
      visibleRows: deduped.slice(0, safeLimit),
      shown: deduped.slice(0, safeLimit).length,
      total,
    };
  }

  function setCcoSectionSummary({
    section = 'sprint',
    shown = 0,
    total = 0,
    indicator = '',
    cta = '',
    hiddenByDensity = false,
  } = {}) {
    const countEls = {
      sprint: els.ccoInboxGroupAcuteCount,
      high: els.ccoInboxGroupTodayCount,
      needs: els.ccoInboxGroupFollowupCount,
      rest: els.ccoInboxGroupOtherCount,
    };
    const metaEls = {
      sprint: els.ccoInboxGroupAcuteMeta,
      high: els.ccoInboxGroupTodayMeta,
      needs: els.ccoInboxGroupFollowupMeta,
      rest: els.ccoInboxGroupOtherMeta,
    };
    const countEl = countEls[section];
    const metaEl = metaEls[section];
    if (countEl) {
      countEl.textContent = shown < total ? `${shown}/${total}` : String(total);
    }
    if (!metaEl) return;
    const parts = [];
    if (hiddenByDensity && total > 0) {
      parts.push('Dolt i valt läge');
    }
    if (shown < total) {
      parts.push(`${shown} av ${total} visas`);
    }
    if (indicator) parts.push(indicator);
    if (cta) parts.push(cta);
    metaEl.textContent = parts.join(' · ');
  }

  function renderCcoWorklist(data = null) {
    if (!els.ccoInboxWorklist) return;
    const sortedRows = getSortedCcoConversations(data).map((row) => enrichCcoConversationRow(row));
    const openRows = sortedRows.filter(
      (row) => String(row?.needsReplyStatus || '').trim().toLowerCase() !== 'handled'
    );
    const queueRows = openRows.length > 0 ? openRows : sortedRows;
    const usingHandledFallback = openRows.length === 0 && sortedRows.length > 0;
    if (state.ccoSprintActive === true) {
      const validOpenConversationIds = new Set(
        openRows.map((row) => String(row?.conversationId || '').trim()).filter(Boolean)
      );
      const safeSprintQueueIds = (Array.isArray(state.ccoSprintQueueIds) ? state.ccoSprintQueueIds : [])
        .map((value) => String(value || '').trim())
        .filter((value) => validOpenConversationIds.has(value));
      const queueChanged =
        safeSprintQueueIds.length !==
        (Array.isArray(state.ccoSprintQueueIds) ? state.ccoSprintQueueIds : []).length;
      if (!safeSprintQueueIds.length) {
        state.ccoSprintActive = false;
        state.ccoSprintQueueIds = [];
        state.ccoSprintCompletedIds = [];
        state.ccoSprintLabelByConversationId = {};
        state.ccoSprintInitialTotal = 0;
        state.ccoSprintId = '';
        state.ccoSprintStartedAtMs = 0;
        state.ccoSprintLatestFeedback = null;
        hideCcoSoftBreakPanel();
      } else if (queueChanged) {
        state.ccoSprintQueueIds = safeSprintQueueIds;
      }
    }
    if (!queueRows.length && state.ccoWorkspaceCompact !== true) {
      state.ccoWorkspaceCompact = true;
    }
    const unansweredRows = queueRows.filter((row) => row.isUnanswered === true);
    const filteredResult = getCcoFilteredConversations(queueRows, { withMeta: true });
    const filteredRows = filteredResult.rows;
    const indicatorViewFilter = sanitizeCcoIndicatorViewFilter(state.ccoIndicatorViewFilter);
    const indicatorFilteredRows = applyCcoIndicatorViewFilter(filteredRows, indicatorViewFilter);
    const hasFilteredRows = Array.isArray(filteredRows) && filteredRows.length > 0;
    const hasIndicatorFilteredRows =
      Array.isArray(indicatorFilteredRows) && indicatorFilteredRows.length > 0;
    let selectedId = String(state.ccoSelectedConversationId || '').trim();
    const debugMode = isCcoDebugMode();
    const densityMode = sanitizeCcoDensityMode(state.ccoInboxDensityMode);
    const mailViewMode = sanitizeCcoMailViewMode(state.ccoMailViewMode);
    if (els.ccoWorkspaceLayout) {
      els.ccoWorkspaceLayout.setAttribute('data-cco-density-mode', densityMode);
    }
    let sectionExpanded = sanitizeCcoSectionExpandedState(state.ccoInboxSectionExpanded);
    const firstFilteredSubject = String(
      indicatorFilteredRows[0]?.subject ||
        indicatorFilteredRows[0]?.latestInboundPreview ||
        filteredRows[0]?.subject ||
        filteredRows[0]?.latestInboundPreview ||
        ''
    ).trim();
    state.ccoInboxSectionExpanded = sectionExpanded;

    if (state.ccoSprintActive !== true) {
      hideCcoSoftBreakPanel();
    }

    renderCcoMailboxFilterRow(openRows);
    renderCcoMailboxFiltersVisibility();
    renderCcoExtraFiltersVisibility();
    renderCcoSlaFilterRow();
    renderCcoLifecycleFilterRow();
    renderCcoSearchControls();
    renderCcoSearchMeta(filteredResult.meta);
    renderCcoDensityFilterRow();
    renderCcoMailViewModeToggle();
    if (mailViewMode === 'queue') {
      renderCcoIndicatorFilterRow(filteredRows);
    }
    renderCcoWorkspaceCompactState();
    renderCcoCenterReadTab();
    renderCcoUnansweredPanel(unansweredRows);

    if (els.ccoCenterListTitle) {
      els.ccoCenterListTitle.textContent = formatCcoMailViewModeLabel(mailViewMode);
    }
    if (els.ccoInboxModeMeta) {
      const handledFallbackSuffix =
        mailViewMode === 'queue' && usingHandledFallback
          ? ' · Öppen kö saknas, visar hanterade konversationer'
          : '';
      els.ccoInboxModeMeta.textContent = `Vy: ${formatCcoMailViewModeLabel(mailViewMode)}${handledFallbackSuffix}`;
    }
    if (els.ccoInboxDensityFilters) {
      els.ccoInboxDensityFilters.style.display = mailViewMode === 'queue' ? '' : 'none';
    }
    if (els.ccoInboxFeedView) {
      els.ccoInboxFeedView.hidden = mailViewMode === 'queue';
    }
    if (els.ccoInboxWorklist) {
      els.ccoInboxWorklist.style.display = mailViewMode === 'queue' ? '' : 'none';
    }
    if (els.ccoSwitchInboundBtn && mailViewMode !== 'queue') {
      els.ccoSwitchInboundBtn.hidden = true;
      els.ccoSwitchInboundBtn.disabled = true;
    }
    if (mailViewMode !== 'queue') {
      const feedDirection = mailViewMode === 'sent' ? 'outbound' : 'inbound';
      const feedEntries = getCcoFeedEntries(data, feedDirection);
      renderCcoIndicatorFilterRow(feedEntries.map((entry) => entry?.row || entry));
      const visibleFeedEntries = feedEntries.filter((entry) =>
        matchesCcoIndicatorViewFilter(entry?.row || entry, indicatorViewFilter)
      );
      const indicatorFilterLabels = {
        all: 'Alla',
        new: 'Blå',
        critical: 'Röd',
        high: 'Orange',
        medium: 'Gul',
        handled: 'Grön',
      };
      const indicatorFilterLabel = indicatorFilterLabels[indicatorViewFilter] || indicatorFilterLabels.all;
      const selectedFeedId = String(state.ccoSelectedFeedMessageId || '').trim();
      let selectedFeed =
        visibleFeedEntries.find((entry) => entry.feedId === selectedFeedId) ||
        visibleFeedEntries.find((entry) => entry.conversationId === selectedId) ||
        null;
      if (!selectedFeed && visibleFeedEntries.length) {
        selectedFeed = visibleFeedEntries[0];
        state.ccoSelectedFeedMessageId = selectedFeed.feedId;
      }
      if (!selectedFeed) {
        state.ccoSelectedFeedMessageId = '';
      }
      if (selectedFeed?.conversationId) {
        setSelectedCcoConversation(selectedFeed.conversationId, { syncRoute: false });
      } else {
        setSelectedCcoConversation('', { syncRoute: false });
      }
      renderCcoFeedList(visibleFeedEntries, mailViewMode);
      renderCcoIndicatorFilterRow(visibleFeedEntries.map((entry) => entry?.row || entry));
      const feedViewEmptyMessage =
        feedEntries.length === 0
          ? `Inga mail i ${formatCcoMailViewModeLabel(mailViewMode).toLowerCase()} för valda filter.`
          : indicatorViewFilter !== 'all'
          ? `Statusfilter ${indicatorFilterLabel.toLowerCase()} matchar inga mail i ${formatCcoMailViewModeLabel(
              mailViewMode
            ).toLowerCase()}.`
          : '';
      setCcoCenterEmptyState(visibleFeedEntries.length === 0, {
        emptyMessage:
          visibleFeedEntries.length === 0 ? feedViewEmptyMessage : '',
      });
      hideCcoSoftBreakPanel();
      if (els.ccoInboxRiskFlags) {
        els.ccoInboxRiskFlags.textContent = `${visibleFeedEntries.length} mail`;
      }
      persistCcoWorkspaceSessionState();
      els.ccoInboxFeedList?.querySelectorAll('.ccoFeedSelectBtn').forEach((button) => {
        button.addEventListener('click', () => {
          const feedId = String(button.getAttribute('data-cco-feed-id') || '').trim();
          const conversationId = String(button.getAttribute('data-conversation-id') || '').trim();
          state.ccoSelectedFeedMessageId = feedId;
          if (conversationId) {
            setSelectedCcoConversation(conversationId, { syncRoute: false });
          }
          renderCcoInbox(state.ccoInboxData);
        });
      });
      els.ccoInboxFeedList?.querySelectorAll('.cco-feed-item').forEach((itemEl) => {
        itemEl.addEventListener('contextmenu', (event) => {
          const indicatorEl = closestFromEventTarget(event, '.cco-thread-indicator');
          if (!indicatorEl) return;
          const conversationId = String(itemEl.getAttribute('data-cco-conversation-id') || '').trim();
          if (!conversationId) return;
          event.preventDefault();
          event.stopPropagation();
          openCcoIndicatorContextMenu({
            conversationId,
            clientX: event.clientX,
            clientY: event.clientY,
          });
        });
      });
      renderCcoDebugOverlay({
        mode: mailViewMode,
        view: densityMode,
        totalRows: queueRows.length,
        openRows: openRows.length,
        filteredRows: visibleFeedEntries.length,
        visibleRows: visibleFeedEntries.length,
        feedCount: feedEntries.length,
        containerHeight: Number(els.ccoInboxWorklist?.getBoundingClientRect?.().height || 0),
        containerOverflowY: getComputedStyle(els.ccoInboxWorklist || document.body).overflowY,
        computedVisibleRows: visibleFeedEntries.length,
        firstItemSubject: String(
          selectedFeed?.subject ||
            selectedFeed?.preview ||
            visibleFeedEntries[0]?.subject ||
            visibleFeedEntries[0]?.preview ||
            firstFilteredSubject
        ).trim(),
        reason:
          feedEntries.length === 0
            ? `Feed (${feedDirection}) tom för valda filter`
            : visibleFeedEntries.length === 0 && indicatorViewFilter !== 'all'
            ? `Statusfilter ${indicatorFilterLabel} matchar 0`
            : usingHandledFallback
            ? 'Öppen kö saknas, feed används för visning'
            : '',
      });
      return;
    }

    const selectedInVisibleQueue = indicatorFilteredRows.some(
      (row) => String(row?.conversationId || '').trim() === selectedId
    );
    if (!selectedInVisibleQueue) {
      const nextSelectedId = String(indicatorFilteredRows[0]?.conversationId || '').trim();
      if (nextSelectedId !== selectedId) {
        setSelectedCcoConversation(nextSelectedId, { syncRoute: false });
      }
      selectedId = nextSelectedId;
    }

    const actionableUnansweredRows = indicatorFilteredRows.filter((row) => !isCcoSystemMessageRow(row));
    const sprintSeedRows = buildCcoSprintQueueRows(actionableUnansweredRows);
    const sprintRows = state.ccoSprintActive
      ? state.ccoSprintQueueIds
          .map((conversationId) =>
            indicatorFilteredRows.find(
              (row) => String(row?.conversationId || '').trim() === String(conversationId || '').trim()
            )
          )
          .filter((row) => !isCcoSystemMessageRow(row))
          .filter(Boolean)
      : sprintSeedRows
          .map((seed) =>
            indicatorFilteredRows.find(
              (row) => String(row?.conversationId || '').trim() === String(seed?.conversationId || '').trim()
            )
          )
          .filter(Boolean);
    const sprintIdSet = new Set(sprintRows.map((row) => String(row?.conversationId || '').trim()));

    const highRows = indicatorFilteredRows.filter((row) => {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId || sprintIdSet.has(conversationId)) return false;
      if (isCcoSystemMessageRow(row)) return false;
      const priority = safeLower(row?.priorityLevel || '');
      return priority === 'critical' || priority === 'high' || normalizeCcoSlaStatus(row?.slaStatus) === 'breach';
    });
    const highIdSet = new Set(highRows.map((row) => String(row?.conversationId || '').trim()));

    const needsRows = indicatorFilteredRows.filter((row) => {
      const conversationId = String(row?.conversationId || '').trim();
      if (!conversationId || sprintIdSet.has(conversationId) || highIdSet.has(conversationId)) return false;
      if (isCcoSystemMessageRow(row)) return false;
      return row.isUnanswered === true || row.followUpSuggested === true || row.stagnated === true;
    });
    const needsIdSet = new Set(needsRows.map((row) => String(row?.conversationId || '').trim()));

    const restRows = indicatorFilteredRows.filter((row) => {
      const conversationId = String(row?.conversationId || '').trim();
      return (
        conversationId &&
        !sprintIdSet.has(conversationId) &&
        !highIdSet.has(conversationId) &&
        !needsIdSet.has(conversationId)
      );
    });

    const sectionTotals = {
      sprint: sprintRows.length,
      high: highRows.length,
      needs: needsRows.length,
      rest: restRows.length,
    };
    const nonSprintTotal =
      Number(sectionTotals.high || 0) +
      Number(sectionTotals.needs || 0) +
      Number(sectionTotals.rest || 0);
    const allNonSprintCollapsed =
      sectionExpanded.high !== true &&
      sectionExpanded.needs !== true &&
      sectionExpanded.rest !== true;
    if (mailViewMode === 'queue' && nonSprintTotal > 0 && allNonSprintCollapsed) {
      sectionExpanded = defaultCcoSectionExpandedState();
      state.ccoInboxSectionExpanded = sectionExpanded;
      persistCcoWorkspaceSessionState();
    }
    const sectionOrder = getCcoSectionRenderOrder(sectionTotals);
    applyCcoSectionDomOrder(sectionOrder);

    if (
      state.ccoPendingSoftBreakConversationId &&
      !indicatorFilteredRows.some(
        (row) => String(row?.conversationId || '').trim() === state.ccoPendingSoftBreakConversationId
      )
    ) {
      hideCcoSoftBreakPanel();
    }

    const densityVisibility = getCcoDensityVisibility(densityMode, sectionTotals);
    const sectionInputs = {
      sprint: sprintRows,
      high: highRows,
      needs: needsRows,
      rest: restRows,
    };
    const sectionCaps = {
      sprint: CCO_VISUAL_LIMITS.sprint,
      high: CCO_VISUAL_LIMITS.high,
      needs: CCO_VISUAL_LIMITS.needs,
      rest: Number.MAX_SAFE_INTEGER,
    };
    const sectionOutputs = {
      sprint: { visibleRows: [], shown: 0, total: sprintRows.length },
      high: { visibleRows: [], shown: 0, total: highRows.length },
      needs: { visibleRows: [], shown: 0, total: needsRows.length },
      rest: { visibleRows: [], shown: 0, total: restRows.length },
    };

    let remainingVisibleBudget = CCO_VISUAL_LIMITS.maxVisibleRows;
    for (const section of ['sprint', 'high', 'needs', 'rest']) {
      const total = sectionTotals[section];
      const isVisibleByMode = densityVisibility[section] === true;
      const isExpanded = sectionExpanded[section] === true;
      if (!isVisibleByMode || !isExpanded || total === 0) {
        sectionOutputs[section] = { visibleRows: [], shown: 0, total };
        continue;
      }
      const baseCap = sectionCaps[section];
      const capWithBudget = Math.max(0, Math.min(baseCap, remainingVisibleBudget));
      const capped = capCcoSectionRows(sectionInputs[section], capWithBudget, selectedId);
      sectionOutputs[section] = capped;
      remainingVisibleBudget = Math.max(0, remainingVisibleBudget - capped.shown);
    }

    const visibleQueueRows =
      Number(sectionOutputs.sprint.shown || 0) +
      Number(sectionOutputs.high.shown || 0) +
      Number(sectionOutputs.needs.shown || 0) +
      Number(sectionOutputs.rest.shown || 0);
    const fallbackInboundCount =
      hasFilteredRows === true ? 0 : getCcoFeedEntries(data, 'inbound').length;
    const hasDefaultQueueFilters =
      sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter) === 'all' &&
      sanitizeCcoSlaFilter(state.ccoInboxSlaFilter) === 'all' &&
      sanitizeCcoLifecycleFilter(state.ccoInboxLifecycleFilter) === 'all' &&
      sanitizeCcoSearchQuery(state.ccoInboxSearchQuery) === '';
    if (
      mailViewMode === 'queue' &&
      state.ccoAutoSwitchToInboundPending === true &&
      hasFilteredRows !== true &&
      fallbackInboundCount > 0 &&
      hasDefaultQueueFilters
    ) {
      state.ccoMailViewMode = 'inbound';
      state.ccoAutoSwitchToInboundPending = false;
      persistCcoWorkspaceSessionState();
      if (els.ccoInboxStatus) {
        setStatus(
          els.ccoInboxStatus,
          `Arbetskön är tom just nu. Visar ${fallbackInboundCount} inkomna mail i stället.`
        );
      }
      renderCcoInbox(state.ccoInboxData);
      return;
    }
    if (els.ccoSwitchInboundBtn) {
      const showInboundShortcut = hasFilteredRows !== true && fallbackInboundCount > 0;
      els.ccoSwitchInboundBtn.hidden = !showInboundShortcut;
      els.ccoSwitchInboundBtn.disabled = !showInboundShortcut;
    }
    const hasRowsHiddenByCurrentView = hasIndicatorFilteredRows && visibleQueueRows === 0;
    const indicatorFilterLabels = {
      all: 'Alla',
      new: 'Blå',
      critical: 'Röd',
      high: 'Orange',
      medium: 'Gul',
      handled: 'Grön',
    };
    const indicatorFilterLabel = indicatorFilterLabels[indicatorViewFilter] || indicatorFilterLabels.all;
    if (hasRowsHiddenByCurrentView) {
      setCcoCenterEmptyState(true, {
        emptyMessage: `Valda filter matchar ${indicatorFilteredRows.length} konversationer men inga syns i läget ${formatCcoDensityModeLabel(
          densityMode
        )}. Byt till Översikt eller justera filter.`,
      });
    } else if (!hasIndicatorFilteredRows && hasFilteredRows && indicatorViewFilter !== 'all') {
      setCcoCenterEmptyState(true, {
        emptyMessage: `Statusfilter ${indicatorFilterLabel.toLowerCase()} matchar inga konversationer i arbetskön.`,
      });
    } else {
      setCcoCenterEmptyState(!hasIndicatorFilteredRows, {
        emptyMessage: hasIndicatorFilteredRows
          ? ''
          : fallbackInboundCount > 0
          ? `Arbetskön är tom. Det finns ${fallbackInboundCount} inkomna mail i vyn "Alla inkomna".`
          : `Vald mailbox: ${
              sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter) === 'all'
                ? 'Alla'
                : formatCcoMailboxShortLabel(state.ccoInboxMailboxFilter)
            } · ${
              sanitizeCcoShowSystemMessages(state.ccoInboxShowSystemMessages)
                ? 'Systemmail visas'
                : 'Systemmail döljs'
            }`,
      });
    }
    let queueReason = '';
    if (hasRowsHiddenByCurrentView) {
      queueReason = `Dolt av läge/filter (${formatCcoDensityModeLabel(densityMode)})`;
    } else if (!hasIndicatorFilteredRows && hasFilteredRows && indicatorViewFilter !== 'all') {
      queueReason = `Statusfilter ${indicatorFilterLabel} matchar 0`;
    } else if (!hasFilteredRows && fallbackInboundCount > 0) {
      queueReason = `Arbetskö tom, ${fallbackInboundCount} inkomna finns`;
    } else if (!hasFilteredRows) {
      queueReason = 'Inga konversationer efter urval';
    } else if (usingHandledFallback) {
      queueReason = 'Öppen kö saknas, visar hanterade konversationer';
    }
    renderCcoDebugOverlay({
      mode: 'queue',
      view: densityMode,
      totalRows: queueRows.length,
      openRows: openRows.length,
      filteredRows: indicatorFilteredRows.length,
      visibleRows: visibleQueueRows,
      feedCount: getCcoFeedEntries(data, 'inbound').length,
      sections: {
        sprint: {
          shown: sectionOutputs.sprint.shown,
          total: sectionOutputs.sprint.total,
          cap: sectionCaps.sprint,
        },
        high: {
          shown: sectionOutputs.high.shown,
          total: sectionOutputs.high.total,
          cap: sectionCaps.high,
        },
        needs: {
          shown: sectionOutputs.needs.shown,
          total: sectionOutputs.needs.total,
          cap: sectionCaps.needs,
        },
        rest: {
          shown: sectionOutputs.rest.shown,
          total: sectionOutputs.rest.total,
          cap: Number.isFinite(sectionCaps.rest) ? sectionCaps.rest : 999,
        },
      },
      containerHeight: Number(els.ccoInboxWorklist?.getBoundingClientRect?.().height || 0),
      containerOverflowY: getComputedStyle(els.ccoInboxWorklist || document.body).overflowY,
      computedVisibleRows: visibleQueueRows,
      firstItemSubject: firstFilteredSubject,
      reason: queueReason,
    });

    setCcoSectionSummary({
      section: 'sprint',
      shown: sectionOutputs.sprint.shown,
      total: sectionOutputs.sprint.total,
      indicator: sectionTotals.sprint > 0 ? '🎯 Fokus nu' : '',
      cta: sectionTotals.sprint > sectionOutputs.sprint.shown ? 'Expandera sektion' : '',
      hiddenByDensity: densityVisibility.sprint !== true,
    });
    const highCriticalCount = highRows.filter(
      (row) =>
        normalizeCcoSlaStatus(row?.slaStatus) === 'breach' || safeLower(row?.priorityLevel || '') === 'critical'
    ).length;
    setCcoSectionSummary({
      section: 'high',
      shown: sectionOutputs.high.shown,
      total: sectionOutputs.high.total,
      indicator: highCriticalCount > 0 ? `🔥 ${highCriticalCount} kritiska` : '',
      cta: sectionTotals.high > 0 ? 'Prioritera nu' : '',
      hiddenByDensity: densityVisibility.high !== true,
    });
    setCcoSectionSummary({
      section: 'needs',
      shown: sectionOutputs.needs.shown,
      total: sectionOutputs.needs.total,
      indicator: sectionTotals.needs > 5 ? '⚠ Kräver fokus' : '',
      cta: sectionTotals.needs > 0 ? 'Planera idag' : '',
      hiddenByDensity: densityVisibility.needs !== true,
    });
    setCcoSectionSummary({
      section: 'rest',
      shown: sectionOutputs.rest.shown,
      total: sectionOutputs.rest.total,
      indicator: '',
      cta:
        sectionOutputs.rest.total > sectionOutputs.rest.shown
          ? `Visa ${sectionOutputs.rest.total - sectionOutputs.rest.shown} till`
          : '',
      hiddenByDensity: densityVisibility.rest !== true,
    });

    const emptyText =
      state.ccoSprintActive && Number(state.ccoSprintInitialTotal || 0) > 0
        ? 'Fokuskö klar'
        : sanitizeCcoSlaFilter(state.ccoInboxSlaFilter) === 'new'
        ? 'Inga nya konversationer sedan senaste besök.'
        : 'Inga konversationer i kö.';

    renderCcoSectionRows(
      els.ccoInboxGroupAcuteList,
      sectionOutputs.sprint.visibleRows,
      selectedId,
      debugMode,
      densityVisibility.sprint ? 'Ingen fokuskö i kö.' : 'Dolt i valt läge.'
    );
    renderCcoSectionRows(
      els.ccoInboxGroupTodayList,
      sectionOutputs.high.visibleRows,
      selectedId,
      debugMode,
      densityVisibility.high ? 'Ingen hög/kritisk i kö.' : 'Dolt i valt läge.'
    );
    renderCcoSectionRows(
      els.ccoInboxGroupFollowupList,
      sectionOutputs.needs.visibleRows,
      selectedId,
      debugMode,
      densityVisibility.needs ? 'Inget som kräver svar idag.' : 'Dolt i valt läge.'
    );
    renderCcoSectionRows(
      els.ccoInboxGroupOtherList,
      sectionOutputs.rest.visibleRows,
      selectedId,
      debugMode,
      densityVisibility.rest ? 'Inga övriga konversationer.' : emptyText
    );

    // Keep details open/closed state explicit so density mode is a pure view layer.
    const blockBySection = {
      sprint: els.ccoInboxGroupAcuteBlock,
      high: els.ccoInboxGroupTodayBlock,
      needs: els.ccoInboxGroupFollowupBlock,
      rest: els.ccoInboxGroupOtherBlock,
    };
    for (const section of ['sprint', 'high', 'needs', 'rest']) {
      const block = blockBySection[section];
      if (!block) continue;
      const sectionVisible = densityVisibility[section] === true;
      block.classList.toggle('cco-density-hidden', !sectionVisible);
      // Do not mutate open-state for hidden sections; otherwise density switches
      // can accidentally persist collapsed states and make Arbete/Översikt look empty.
      if (sectionVisible) {
        block.open = sectionExpanded[section] === true;
      }
    }

  }

  function formatCcoLifecycleSourceLabel(value = '') {
    return String(value || '').trim().toLowerCase() === 'manual' ? 'Manuell' : 'Automatisk';
  }

  function formatCcoFollowUpSummary(conversation = null) {
    if (!conversation || typeof conversation !== 'object') return '-';
    const suggestedAt = String(conversation.followUpSuggestedAt || '').trim();
    if (suggestedAt) {
      const reason =
        Array.isArray(conversation.followUpTimingReason) && conversation.followUpTimingReason.length
          ? ` · ${formatCcoTimingReasonLabel(conversation.followUpTimingReason[0])}`
          : '';
      return `${formatCcoDateTimeValue(suggestedAt)}${reason}`;
    }
    if (conversation.followUpSuggested) {
      const delay = Number(conversation.recommendedFollowUpDelayDays || 0);
      const urgency = String(conversation.followUpUrgencyLevel || 'normal').trim();
      return `${delay} dagar · ${urgency}`;
    }
    return 'Ingen trigger';
  }

  function renderCcoCustomerSummary(conversation = null) {
    const panel = els.ccoCustomerSummaryPanel;
    if (!panel) return;
    panel.classList.toggle('is-expanded', state.ccoCustomerSummaryExpanded === true);
    if (els.ccoCustomerSummaryToggleBtn) {
      els.ccoCustomerSummaryToggleBtn.textContent = state.ccoCustomerSummaryExpanded
        ? 'Visa mindre'
        : 'Visa mer';
    }

    if (!conversation || typeof conversation !== 'object') {
      if (els.ccoCustomerSummaryName) els.ccoCustomerSummaryName.textContent = 'Ingen kund vald.';
      if (els.ccoCustomerSummarySub) {
        els.ccoCustomerSummarySub.textContent = 'Välj en konversation för kundöversikt.';
      }
      if (els.ccoCustomerLifecycleValue) els.ccoCustomerLifecycleValue.textContent = '-';
      if (els.ccoCustomerInteractionsValue) els.ccoCustomerInteractionsValue.textContent = '-';
      if (els.ccoCustomerLastInteractionValue) els.ccoCustomerLastInteractionValue.textContent = '-';
      if (els.ccoCustomerEngagementValue) els.ccoCustomerEngagementValue.textContent = '-';
      if (els.ccoCustomerTempoValue) els.ccoCustomerTempoValue.textContent = '-';
      if (els.ccoCustomerFollowupValue) els.ccoCustomerFollowupValue.textContent = '-';
      if (els.ccoCustomerLastCaseValue) els.ccoCustomerLastCaseValue.textContent = '-';
      if (els.ccoCustomerTimelineList) {
        els.ccoCustomerTimelineList.innerHTML = '<li>Ingen tidslinje ännu.</li>';
      }
      return;
    }

    const summary = normalizeCcoCustomerSummary(conversation.customerSummary, {
      customerKey: conversation.customerKey,
      customerName: conversation.sender,
    });
    if (els.ccoCustomerSummaryName) {
      els.ccoCustomerSummaryName.textContent = summary.customerName || 'Okänd kund';
    }
    if (els.ccoCustomerSummarySub) {
      const daysText =
        Number.isFinite(summary.daysSinceLastInteraction) && summary.daysSinceLastInteraction >= 0
          ? `${summary.daysSinceLastInteraction} dagar sedan`
          : 'okänd tid';
      els.ccoCustomerSummarySub.textContent = `${formatCcoLifecycleLabel(summary.lifecycleStatus)} · ${summary.caseCount} ärenden · Senast ${daysText}`;
    }
    if (els.ccoCustomerLifecycleValue) {
      els.ccoCustomerLifecycleValue.textContent = `${formatCcoLifecycleLabel(
        summary.lifecycleStatus
      )} (${formatCcoLifecycleSourceLabel(summary.lifecycleSource)})`;
    }
    if (els.ccoCustomerInteractionsValue) {
      els.ccoCustomerInteractionsValue.textContent = String(summary.interactionCount || 0);
    }
    if (els.ccoCustomerLastInteractionValue) {
      els.ccoCustomerLastInteractionValue.textContent = summary.lastInteractionAt
        ? formatCcoDateTimeValue(summary.lastInteractionAt)
        : '-';
    }
    if (els.ccoCustomerEngagementValue) {
      const engagementPercent = Math.round(Number(summary.engagementScore || 0) * 100);
      els.ccoCustomerEngagementValue.textContent = `${engagementPercent}%`;
    }
    if (els.ccoCustomerTempoValue) {
      const cta = String(conversation.ctaIntensity || 'normal').trim();
      const delayDays = Number(conversation.recommendedFollowUpDelayDays || 0);
      els.ccoCustomerTempoValue.textContent = `${formatCcoTempoLabel(
        conversation.tempoProfile
      )} · ${delayDays}d · ${cta}`;
    }
    if (els.ccoCustomerFollowupValue) {
      const manualText = conversation.followUpManualApprovalRequired === false ? '' : ' · manuell';
      els.ccoCustomerFollowupValue.textContent = `${formatCcoFollowUpSummary(
        conversation
      )}${manualText}`;
    }
    if (els.ccoCustomerLastCaseValue) {
      els.ccoCustomerLastCaseValue.textContent = summary.lastCaseSummary || '-';
    }
    if (els.ccoCustomerTimelineList) {
      if (!summary.timeline.length) {
        els.ccoCustomerTimelineList.innerHTML = '<li>Ingen tidslinje ännu.</li>';
      } else {
        els.ccoCustomerTimelineList.innerHTML = summary.timeline
          .map((entry) => {
            const when = entry.occurredAt ? formatCcoDateTimeValue(entry.occurredAt) : '-';
            const status = formatCcoCaseStatusLabel(entry.status);
            return `<li>${escapeHtml(when)} · ${escapeHtml(entry.subject)} · ${escapeHtml(
              status
            )}</li>`;
          })
          .join('');
      }
    }
  }

  function toCcoHistoryTimestampMs(value = '') {
    const ts = Date.parse(String(value || '').trim());
    return Number.isFinite(ts) ? ts : 0;
  }

  function buildCcoConversationHistoryEntries(conversation = null) {
    if (!conversation || typeof conversation !== 'object') return [];
    const entries = [];
    const conversationId = String(conversation.conversationId || '').trim();
    const inboundPreview = String(conversation.latestInboundPreview || '').trim();
    const inboundAt = String(conversation.lastInboundAt || '').trim();
    const outboundAt = String(conversation.lastOutboundAt || '').trim();
    if (inboundPreview || inboundAt) {
      entries.push({
        entryId: `${conversationId}:inbound`,
        timestamp: inboundAt || '',
        role: 'inbound',
        label: `Inkommande · ${conversation.sender || 'kund'}`,
        excerpt: inboundPreview || 'Inkommande meddelande',
      });
    }
    if (outboundAt) {
      entries.push({
        entryId: `${conversationId}:outbound`,
        timestamp: outboundAt,
        role: 'outbound',
        label: 'Utgående · Kliniken',
        excerpt: 'Senaste svar registrerat i konversationen.',
      });
    }
    const timeline = asArray(conversation?.customerSummary?.timeline).slice(0, 12);
    timeline.forEach((item, index) => {
      const occurredAt = String(item?.occurredAt || '').trim();
      const subject = String(item?.subject || '').trim();
      const status = formatCcoCaseStatusLabel(item?.status);
      entries.push({
        entryId: `${conversationId}:timeline:${index}`,
        timestamp: occurredAt || '',
        role: 'timeline',
        label: `Historik · ${status}`,
        excerpt: subject || 'Tidigare ärende',
      });
    });
    return entries
      .sort((left, right) => toCcoHistoryTimestampMs(right.timestamp) - toCcoHistoryTimestampMs(left.timestamp))
      .slice(0, 20);
  }

  function renderCcoReplyContext(conversation = null) {
    if (!els.ccoReplyContextStrip || !els.ccoReplyingToContext) return;
    if (!conversation || typeof conversation !== 'object') {
      els.ccoReplyContextStrip.textContent = 'Ingen konversation vald.';
      els.ccoReplyingToContext.textContent = 'Välj ett meddelande i historiken för att svara med kontext.';
      if (els.ccoMarkSystemMailBtn) {
        els.ccoMarkSystemMailBtn.textContent = 'Markera som systemmail';
      }
      if (els.ccoHidePatternBtn) {
        els.ccoHidePatternBtn.disabled = true;
        els.ccoHidePatternBtn.title = 'Välj en konversation först.';
      }
      applyCcoSnoozeButtonState();
      applyCcoDeleteButtonState();
      return;
    }
    const conversationId = String(conversation.conversationId || '').trim();
    const context = state.ccoSelectedMessageContextByConversationId?.[conversationId] || null;
    const senderMailbox = String(state.ccoSenderMailboxId || '').trim() || CCO_DEFAULT_SENDER_MAILBOX;
    const senderMailboxShort = formatCcoMailboxShortLabel(senderMailbox) || senderMailbox;
    const slaLabel = formatCcoSlaStatusLabel(conversation.slaStatus);
    const riskLabel = formatCcoRecommendedAction(conversation.recommendedAction);
    els.ccoReplyContextStrip.textContent = `${conversation.sender} · ${senderMailboxShort} · SLA ${slaLabel} · ${riskLabel}`;
    if (context && context.excerpt) {
      els.ccoReplyingToContext.textContent = `Svarar på: ${context.label} — ${context.excerpt}`;
    } else {
      els.ccoReplyingToContext.textContent = 'Välj ett meddelande i historiken för att svara med kontext.';
    }
    if (els.ccoMarkSystemMailBtn) {
      const isSystemMessage = isLikelyCcoSystemMessage(conversation);
      els.ccoMarkSystemMailBtn.textContent = isSystemMessage
        ? 'Avmarkera systemmail'
        : 'Markera som systemmail';
    }
    if (els.ccoHidePatternBtn) {
      els.ccoHidePatternBtn.disabled = false;
      els.ccoHidePatternBtn.title = 'Dölj avsändare eller ämnesmönster från fokusköer.';
    }
    applyCcoSnoozeButtonState();
    applyCcoDeleteButtonState();
  }

  function applyCcoSnoozeButtonState() {
    const hasConversation = !!getCcoSelectedConversation();
    const buttons = [els.ccoSnoozeBtn, els.ccoStickySnoozeBtn].filter(Boolean);
    for (const button of buttons) {
      button.disabled = !hasConversation;
      button.title = hasConversation
        ? 'Skapar en påminnelse för vald konversation.'
        : 'Välj en konversation först.';
    }
  }

  function applyCcoDeleteButtonState() {
    const buttons = [els.ccoDeleteMailBtn, els.ccoStickyDeleteBtn].filter(Boolean);
    if (!buttons.length) return;
    const capability = sanitizeCcoDeleteCapabilityStatus(state.ccoDeleteCapability);
    const hasConversation = !!getCcoSelectedConversation();
    const enabledByBackend = capability.deleteEnabled === true;
    const disabled = !hasConversation || !enabledByBackend;
    for (const button of buttons) {
      button.disabled = disabled;
    }
    if (!enabledByBackend) {
      const reason = capability.reason || 'Radera mail är inte aktiverat i denna miljö.';
      for (const button of buttons) {
        button.title = reason;
      }
      return;
    }
    if (!hasConversation) {
      for (const button of buttons) {
        button.title = 'Välj en konversation först.';
      }
      return;
    }
    for (const button of buttons) {
      button.title = 'Flyttar valt mail till papperskorg (Deleted Items).';
    }
  }

  function renderCcoReplyModeState() {
    const readOnlyMode = isCcoReadOnlyMailViewMode();
    if (els.ccoReplyColumn) {
      els.ccoReplyColumn.classList.toggle('is-readonly', readOnlyMode);
    }
    if (els.ccoReplyColumnTitle) {
      els.ccoReplyColumnTitle.textContent = readOnlyMode ? 'Läspanel' : 'Svarsstudio';
    }
    if (els.ccoReplyReadOnlyBanner) {
      els.ccoReplyReadOnlyBanner.hidden = !readOnlyMode;
      els.ccoReplyReadOnlyBanner.textContent = 'Skrivskyddad vy. Byt till Arbetskö för att svara.';
    }
  }

  function setCcoReplyEmptyState(isEmpty = false, { emptyMessage = '' } = {}) {
    renderCcoReplyModeState();
    if (els.ccoReplyColumn) {
      els.ccoReplyColumn.classList.toggle('is-empty', isEmpty === true);
    }
    if (els.ccoReplyShowSystemToggle) {
      els.ccoReplyShowSystemToggle.checked = sanitizeCcoShowSystemMessages(
        state.ccoInboxShowSystemMessages
      );
    }
    if (els.ccoReplyEmptyState) {
      const detailEl = els.ccoReplyEmptyState.querySelector('.mini.muted');
      if (detailEl && emptyMessage) detailEl.textContent = emptyMessage;
    }
    if (els.ccoDraftBodyInput) {
      els.ccoDraftBodyInput.disabled = isEmpty === true;
    }
    if (isEmpty === true) {
      applyCcoSnoozeButtonState();
      applyCcoDeleteButtonState();
    }
  }

  function setCcoCenterEmptyState(isEmpty = false, { emptyMessage = '' } = {}) {
    if (state.ccoInboxLoading === true) {
      if (els.ccoCenterColumn) {
        els.ccoCenterColumn.classList.remove('is-empty');
      }
      return;
    }
    if (els.ccoCenterColumn) {
      els.ccoCenterColumn.classList.toggle('is-empty', isEmpty === true);
    }
    if (els.ccoCenterEmptyStateMeta) {
      els.ccoCenterEmptyStateMeta.textContent =
        emptyMessage || 'Inga mail matchar vyn just nu. Uppdatera inkorg eller justera urval.';
    }
  }

  function renderCcoConversationHistory(conversation = null) {
    if (!els.ccoConversationHistoryList) return;
    if (!conversation || typeof conversation !== 'object') {
      els.ccoConversationHistoryList.innerHTML = '<li class="muted mini">Ingen historik än.</li>';
      return;
    }
    const conversationId = String(conversation.conversationId || '').trim();
    const entries = buildCcoConversationHistoryEntries(conversation);
    if (!entries.length) {
      els.ccoConversationHistoryList.innerHTML = '<li class="muted mini">Ingen historik än.</li>';
      return;
    }
    const selectedContext = state.ccoSelectedMessageContextByConversationId?.[conversationId] || null;
    let selectedEntryId = String(selectedContext?.entryId || '').trim();
    if (!entries.some((entry) => entry.entryId === selectedEntryId)) {
      selectedEntryId = entries[0].entryId;
    }
    const selectedEntry = entries.find((entry) => entry.entryId === selectedEntryId) || entries[0];
    state.ccoSelectedMessageContextByConversationId = {
      ...(state.ccoSelectedMessageContextByConversationId || {}),
      [conversationId]: {
        entryId: selectedEntry.entryId,
        label: selectedEntry.label,
        excerpt: selectedEntry.excerpt,
      },
    };

    els.ccoConversationHistoryList.innerHTML = entries
      .map((entry) => {
        const isSelected = entry.entryId === selectedEntry.entryId;
        const when = entry.timestamp ? formatCcoDateTimeValue(entry.timestamp) : '-';
        return `
          <li>
            <button type="button" class="cco-conversation-history-item${isSelected ? ' is-selected' : ''}" data-cco-history-entry-id="${escapeHtml(
              entry.entryId
            )}">
              <span class="cco-conversation-history-meta">${escapeHtml(entry.label)} · ${escapeHtml(when)}</span>
              <span class="cco-conversation-history-body">${escapeHtml(entry.excerpt)}</span>
            </button>
          </li>
        `;
      })
      .join('');
  }

  function renderCcoDetail(data = null) {
    const readOnlyMode = isCcoReadOnlyMailViewMode();
    renderCcoReplyModeState();
    const selectedFeedEntry = getCcoSelectedFeedEntry(data);
    if (readOnlyMode && selectedFeedEntry) {
      renderCcoReadOnlyFeedDetail(selectedFeedEntry);
      return;
    }
    const conversation = getCcoSelectedConversation();
    if (!conversation) {
      setCcoReplyEmptyState(!readOnlyMode, {
        emptyMessage: readOnlyMode
          ? 'Skrivskyddad vy. Välj ett mail i listan för att läsa.'
          : 'Välj en tråd i arbetskön för att öppna svarsläget. Du kan även uppdatera inkorgen eller visa systemmail.',
      });
      if (els.ccoConversationMeta) {
        els.ccoConversationMeta.textContent = readOnlyMode
          ? 'Skrivskyddad vy · ingen mailrad vald.'
          : 'Ingen konversation vald.';
      }
      if (els.ccoConversationPreview) {
        els.ccoConversationPreview.textContent = readOnlyMode
          ? 'Välj en rad i listan för att öppna läspanelen.'
          : 'Ingen förhandsvisning än.';
      }
      if (els.ccoConversationHistoryList) {
        els.ccoConversationHistoryList.innerHTML = '<li class="muted mini">Ingen historik än.</li>';
      }
      if (els.ccoDraftSubjectInput) els.ccoDraftSubjectInput.value = '';
      if (els.ccoDraftToInput) els.ccoDraftToInput.value = '';
      if (els.ccoDraftSubjectInput) els.ccoDraftSubjectInput.disabled = true;
      if (els.ccoDraftToInput) els.ccoDraftToInput.disabled = true;
      if (els.ccoSenderMailboxSelect) els.ccoSenderMailboxSelect.disabled = true;
      if (els.ccoSignatureProfileSelect) els.ccoSignatureProfileSelect.disabled = true;
      if (els.ccoInsertSignatureToggle) els.ccoInsertSignatureToggle.disabled = true;
      if (els.ccoDraftRiskIndicator) els.ccoDraftRiskIndicator.textContent = '-';
      if (els.ccoDraftPolicyIndicator) els.ccoDraftPolicyIndicator.textContent = '-';
      if (els.ccoDraftConfidence) els.ccoDraftConfidence.textContent = '-';
      if (els.ccoDraftRecommendedActionRow) {
        els.ccoDraftRecommendedActionRow.textContent = '🎯 Rekommenderad åtgärd: -';
      }
      if (els.ccoDraftRecommendedAction) els.ccoDraftRecommendedAction.textContent = '-';
      if (els.ccoDraftBodyInput) els.ccoDraftBodyInput.value = '';
      renderCcoDraftModeControls(null);
      applyCcoIndicatorClass(
        els.ccoDraftRiskIndicator,
        ['risk-critical', 'risk-high', 'risk-medium', 'risk-low'],
        ''
      );
      applyCcoIndicatorClass(
        els.ccoDraftPolicyIndicator,
        ['policy-blocked', 'policy-ok'],
        ''
      );
      syncCcoSignatureSelectors();
      renderCcoSignaturePreview();
      renderCcoCustomerSummary(null);
      renderCcoReplyContext(null);
      applyCcoSnoozeButtonState();
      return;
    }

    if (readOnlyMode) {
      setCcoReplyEmptyState(false, {
        emptyMessage:
          'Skrivskyddad vy. Byt till Arbetskö för att svara.',
      });
    } else {
      setCcoReplyEmptyState(false);
    }

    setSelectedCcoConversation(conversation.conversationId);
    if (els.ccoDraftSubjectInput) els.ccoDraftSubjectInput.disabled = readOnlyMode;
    if (els.ccoDraftToInput) els.ccoDraftToInput.disabled = readOnlyMode;
    if (els.ccoSenderMailboxSelect) els.ccoSenderMailboxSelect.disabled = readOnlyMode;
    if (els.ccoSignatureProfileSelect) els.ccoSignatureProfileSelect.disabled = readOnlyMode;
    if (els.ccoInsertSignatureToggle) els.ccoInsertSignatureToggle.disabled = readOnlyMode;
    const evaluation = getCcoDraftEvaluationForConversation(conversation.conversationId);
    const previewText = sanitizeCcoPreviewText(conversation.latestInboundPreview || '');
    if (els.ccoConversationMeta) {
      const toneConfidenceRaw = Number(conversation.toneConfidence || 0.4);
      const toneConfidencePct = Number.isFinite(toneConfidenceRaw)
        ? `${Math.round(Math.max(0, Math.min(1, toneConfidenceRaw)) * 100)}%`
        : '-';
      const slaCountdown = formatCcoSlaCountdown(
        conversation.hoursRemaining,
        conversation.slaStatus
      );
      const lastInboundLabel = conversation.lastInboundAt
        ? formatCcoDateTimeValue(conversation.lastInboundAt)
        : '-';
      const lastOutboundLabel = conversation.lastOutboundAt
        ? formatCcoDateTimeValue(conversation.lastOutboundAt)
        : '-';
      els.ccoConversationMeta.textContent =
        `${conversation.sender} · ${formatCcoIntentLabel(conversation.intent)} · Ton: ${formatCcoToneLabel(conversation.tone)} (${toneConfidencePct}) · SLA: ${formatCcoSlaStatusLabel(conversation.slaStatus)} · ${slaCountdown} · ${formatCcoPriorityLabel(conversation.priorityLevel)} · ` +
        `${conversation.escalationRequired ? 'Eskalering krävs' : 'Normal'} · Senast inkommet: ${lastInboundLabel} · Senast svarat: ${lastOutboundLabel}`;
    }
    if (els.ccoConversationPreview) {
      els.ccoConversationPreview.textContent = previewText || 'Ingen förhandsvisning tillgänglig.';
    }
    renderCcoConversationHistory(conversation);
    if (els.ccoDraftSubjectInput) {
      els.ccoDraftSubjectInput.value = conversation.subject;
    }
    if (els.ccoDraftToInput) {
      if (!String(els.ccoDraftToInput.value || '').trim()) {
        els.ccoDraftToInput.value = '';
      }
    }
    if (els.ccoDraftRiskIndicator) {
      els.ccoDraftRiskIndicator.textContent = formatCcoRiskIndicator(conversation, evaluation);
      const riskLevel = Number(evaluation?.riskSummary?.output?.riskLevel);
      let riskClass = 'risk-low';
      if (Number.isFinite(riskLevel) && riskLevel >= 5) riskClass = 'risk-critical';
      else if (Number.isFinite(riskLevel) && riskLevel >= 4) riskClass = 'risk-high';
      else if (Number.isFinite(riskLevel) && riskLevel >= 3) riskClass = 'risk-medium';
      applyCcoIndicatorClass(
        els.ccoDraftRiskIndicator,
        ['risk-critical', 'risk-high', 'risk-medium', 'risk-low'],
        riskClass
      );
    }
    if (els.ccoDraftPolicyIndicator) {
      els.ccoDraftPolicyIndicator.textContent = formatCcoPolicyIndicator(conversation, evaluation);
      const isBlocked = evaluation?.policySummary?.blocked === true;
      applyCcoIndicatorClass(
        els.ccoDraftPolicyIndicator,
        ['policy-blocked', 'policy-ok'],
        isBlocked ? 'policy-blocked' : 'policy-ok'
      );
    }
    if (els.ccoDraftConfidence) {
      els.ccoDraftConfidence.textContent = formatCcoConfidenceLabel(String(conversation.confidenceLevel || 'Low'));
    }
    if (els.ccoDraftRecommendedAction) {
      els.ccoDraftRecommendedAction.textContent = `${formatCcoRecommendedAction(conversation.recommendedAction)}${previewText ? ' · Förhandsvisning maskerad' : ''}`;
    }
    if (els.ccoDraftRecommendedActionRow) {
      els.ccoDraftRecommendedActionRow.textContent = `🎯 Rekommenderad åtgärd: ${formatCcoRecommendedAction(
        conversation.recommendedAction
      )}`;
    }
    renderCcoDraftModeControls(conversation);
    syncCcoSignatureSelectors();
    renderCcoSignaturePreview();
    if (els.ccoDraftBodyInput) {
      els.ccoDraftBodyInput.value = removeCcoSignatureFromDraft(getCcoDraftBody(conversation));
      els.ccoDraftBodyInput.disabled = readOnlyMode;
    }
    renderCcoCustomerSummary(conversation);
    renderCcoReplyContext(conversation);
    restoreCcoConversationScroll(conversation.conversationId);
  }

  function applyCcoConversationMutation(conversationId, mutate) {
    const safeData = state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object'
      ? state.ccoInboxData.data
      : null;
    if (!safeData) return;
    const mutateRow = (row) => {
      if (!row || String(row.conversationId || '').trim() !== conversationId) return row;
      return mutate({ ...row });
    };
    if (Array.isArray(safeData.conversationWorklist)) {
      safeData.conversationWorklist = safeData.conversationWorklist.map(mutateRow);
    }
    if (Array.isArray(safeData.needsReplyToday)) {
      safeData.needsReplyToday = safeData.needsReplyToday.map(mutateRow);
    }
    if (Array.isArray(safeData.suggestedDrafts)) {
      safeData.suggestedDrafts = safeData.suggestedDrafts.map(mutateRow);
    }
  }

  function buildSelectedCcoSendPayload() {
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const draftBody = String(els.ccoDraftBodyInput?.value || '').trim();
    if (!draftBody) throw new Error('Svarsutkast saknas.');
    const senderMailboxId =
      String(state.ccoSenderMailboxId || '').trim().toLowerCase() || CCO_DEFAULT_SENDER_MAILBOX;
    const signatureProfile = normalizeCcoSignatureProfileKey(state.ccoSignatureProfile);
    const includeSignature = sanitizeCcoIncludeSignature(state.ccoIncludeSignature);
    const finalBody = includeSignature
      ? applyCcoSignatureToDraft({
          body: draftBody,
          senderMailboxId,
          signatureProfile: getCcoSelectedSignatureProfile(),
        })
      : removeCcoSignatureFromDraft(draftBody);
    const toRaw = String(els.ccoDraftToInput?.value || '').trim();
    const to = toRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!to.length) throw new Error('Ange minst en mottagare i fältet Till.');
    return {
      conversation,
      payload: {
        mailboxId: String(conversation.mailboxId || '').trim(),
        senderMailboxId,
        signatureProfile,
        includeSignature,
        replyToMessageId: String(conversation.messageId || '').trim(),
        conversationId: String(conversation.conversationId || '').trim(),
        to,
        subject: String(els.ccoDraftSubjectInput?.value || conversation.subject || '').trim(),
        body: finalBody,
        idempotencyKey: generateClientIdempotencyKey('cco-send'),
      },
    };
  }

  function renderCcoInbox(output = null) {
    const normalized = normalizeCcoInboxOutput(output);
    const data = normalized?.data && typeof normalized.data === 'object' ? normalized.data : null;
    const metadata =
      normalized?.metadata && typeof normalized.metadata === 'object'
        ? normalized.metadata
        : {};
    if (state.ccoInboxLoading === true) {
      setCcoLoadingState(false);
    }
    state.ccoInboxData = normalized;
    state.ccoSignatureProfiles = getCcoSignatureProfilesFromMetadata();
    state.ccoSenderMailboxOptions = getCcoSenderMailboxOptionsFromMetadata();
    if (!String(state.ccoSenderMailboxId || '').trim()) {
      state.ccoSenderMailboxId = String(
        metadata.ccoDefaultSenderMailbox || CCO_DEFAULT_SENDER_MAILBOX
      )
        .trim()
        .toLowerCase();
    }
    if (!String(state.ccoSignatureProfile || '').trim()) {
      state.ccoSignatureProfile = normalizeCcoSignatureProfileKey(
        metadata.ccoDefaultSignatureProfile || CCO_DEFAULT_SIGNATURE_PROFILE
      );
    }
    syncCcoSignatureSelectors();
    renderCcoSignaturePreview();
    if (!data) {
      state.ccoAutoSwitchToInboundPending = false;
      state.ccoInboxLastSyncAt = '';
      setSelectedCcoConversation('');
      state.ccoDraftEvaluationByConversationId = {};
      state.ccoSprintActive = false;
      state.ccoSprintQueueIds = [];
      state.ccoSprintCompletedIds = [];
      state.ccoSprintLabelByConversationId = {};
      state.ccoSprintInitialTotal = 0;
      state.ccoSprintId = '';
      state.ccoSprintStartedAtMs = 0;
      state.ccoSprintMetrics = null;
      state.ccoSprintLatestFeedback = null;
      state.ccoUsageAnalytics = null;
      state.ccoRedFlagState = null;
      state.ccoAdaptiveFocusState = null;
      state.ccoRecoveryState = null;
      state.ccoStrategicInsights = null;
      state.ccoAdaptiveFocusShowAll = false;
      state.ccoFocusWorkloadMinutes = 0;
      if (els.ccoInboxPriority) {
        els.ccoInboxPriority.textContent = '-';
        applyCcoIndicatorClass(
          els.ccoInboxPriority,
          ['badge-critical', 'badge-high', 'badge-medium', 'badge-low'],
          'badge-low'
        );
      }
      if (els.ccoInboxRiskFlags) els.ccoInboxRiskFlags.textContent = '0 / 0';
      if (els.ccoInboxSummary) els.ccoInboxSummary.textContent = 'Ingen inkorgsbrief än.';
      if (els.ccoInboxMailboxMeta) els.ccoInboxMailboxMeta.textContent = '';
      if (els.ccoWorkspaceEntryStatus) {
        els.ccoWorkspaceEntryStatus.textContent = 'Ingen inkorgssammanfattning än.';
      }
      if (els.ccoFocusHeading) {
        els.ccoFocusHeading.textContent = 'IDAG – FOKUS (0 av 0)';
      }
      if (els.ccoFocusWorkload) {
        els.ccoFocusWorkload.textContent = '≈ 0 min arbete';
        els.ccoFocusWorkload.classList.remove('is-updated');
      }
      if (els.ccoFocusWorkloadBreakdown) {
        els.ccoFocusWorkloadBreakdown.innerHTML = '';
        els.ccoFocusWorkloadBreakdown.classList.remove('visible');
      }
      if (els.ccoFocusWorkloadInfoBtn) {
        els.ccoFocusWorkloadInfoBtn.setAttribute('aria-expanded', 'false');
      }
      if (els.ccoFocusScheduleStatus) {
        els.ccoFocusScheduleStatus.textContent = '';
      }
      renderIncidentIntelligenceList(
        els.ccoOverviewSummaryList,
        [],
        'Ingen CCO-data än.'
      );
      if (els.ccoSendStatus) els.ccoSendStatus.textContent = '';
      renderCcoSprintPanel([], []);
      renderCcoWorklist(null);
      renderCcoDetail(null);
      renderIncidentIntelligenceList(
        els.ccoInboxNeedsReplyList,
        [],
        'Inga konversationer i kö.'
      );
      renderIncidentIntelligenceList(els.ccoInboxDraftsList, [], 'Inga utkast än.');
      return;
    }

    const slaBreaches = Array.isArray(data.slaBreaches) ? data.slaBreaches.length : 0;
    const riskFlags = Array.isArray(data.riskFlags) ? data.riskFlags.length : 0;
    state.ccoInboxLastSyncAt = String(data.generatedAt || metadata.generatedAt || '').trim();
    const sortedRows = getSortedCcoConversations(data)
      .map((row) => enrichCcoConversationRow(row))
      .filter((row) => isCcoAllowedMailboxRow(row));
    const sourceMailboxIds = Array.from(
      new Set(sortedRows.map((row) => resolveCcoMailboxLabel(row)).filter((mailbox) => isCcoAllowedMailbox(mailbox)))
    ).slice(0, 8);
    const mailboxCount = sourceMailboxIds.length;
    const messageCount = sortedRows.length;

    if (els.ccoInboxPriority) {
      const priorityLabel = String(normalizePriorityLevelForUi(data.priorityLevel));
      els.ccoInboxPriority.textContent = formatCcoPriorityLabel(priorityLabel);
      applyCcoIndicatorClass(
        els.ccoInboxPriority,
        ['badge-critical', 'badge-high', 'badge-medium', 'badge-low'],
        getCcoPriorityBadgeClass(priorityLabel)
      );
    }
    if (els.ccoInboxRiskFlags) {
      els.ccoInboxRiskFlags.textContent = `${slaBreaches} / ${riskFlags}`;
    }
    if (els.ccoInboxMailboxMeta) {
      const sourceMailboxShortLabels = sourceMailboxIds
        .map((mailbox) => formatCcoMailboxShortLabel(mailbox))
        .filter(Boolean);
      const suffix = sourceMailboxShortLabels.length
        ? ` · ${sourceMailboxShortLabels.join(', ')}`
        : '';
      els.ccoInboxMailboxMeta.textContent = `${mailboxCount} postlådor · ${messageCount} meddelanden${suffix}`;
    }
    if (els.ccoWorkspaceEntryStatus) {
      els.ccoWorkspaceEntryStatus.textContent =
        `${mailboxCount} postlådor · ${messageCount} meddelanden · ${formatCcoPriorityLabel(normalizePriorityLevelForUi(data.priorityLevel))}`;
    }
    if (els.ccoInboxSummary) {
      els.ccoInboxSummary.textContent = String(data.executiveSummary || 'Ingen sammanfattning.');
    }

    const openRows = sortedRows.filter(
      (row) => String(row?.needsReplyStatus || '').trim() !== 'handled'
    );
    const unansweredRows = openRows.filter((row) => row.isUnanswered === true);
    const overviewSummaryRows = openRows
      .slice(0, 3)
      .map(
        (item) =>
          `${item.subject} · ${formatCcoPriorityLabel(normalizePriorityLevelForUi(item.priorityLevel))} · ${formatCcoIntentLabel(item.intent || 'unclear')}`
      );
    renderIncidentIntelligenceList(
      els.ccoOverviewSummaryList,
      overviewSummaryRows,
      'Inga öppna CCO-konversationer.'
    );
    const plannedRows = buildCcoSprintQueueRows(unansweredRows);
    syncCcoSprintState(unansweredRows, plannedRows);
    const validConversationIds = new Set(sortedRows.map((row) => String(row.conversationId || '').trim()));
    const nextEvaluations = {};
    for (const [conversationId, evaluation] of Object.entries(
      state.ccoDraftEvaluationByConversationId || {}
    )) {
      if (!validConversationIds.has(String(conversationId || '').trim())) continue;
      nextEvaluations[conversationId] = evaluation;
    }
    state.ccoDraftEvaluationByConversationId = nextEvaluations;
    const nextDraftOverrides = {};
    for (const [conversationId, draft] of Object.entries(state.ccoDraftOverrideByConversationId || {})) {
      if (!validConversationIds.has(String(conversationId || '').trim())) continue;
      nextDraftOverrides[conversationId] = String(draft || '');
    }
    state.ccoDraftOverrideByConversationId = nextDraftOverrides;
    const nextDraftModes = {};
    for (const [conversationId, mode] of Object.entries(state.ccoDraftModeByConversationId || {})) {
      const key = String(conversationId || '').trim();
      if (!validConversationIds.has(key)) continue;
      const normalizedMode = normalizeCcoDraftMode(mode, '');
      if (!['short', 'warm', 'professional'].includes(normalizedMode)) continue;
      nextDraftModes[key] = normalizedMode;
    }
    state.ccoDraftModeByConversationId = nextDraftModes;
    const nextConversationScroll = {};
    for (const [conversationId, scrollTop] of Object.entries(
      state.ccoConversationScrollTopByConversationId || {}
    )) {
      if (!validConversationIds.has(String(conversationId || '').trim())) continue;
      const safeScrollTop = Number(scrollTop);
      if (!Number.isFinite(safeScrollTop) || safeScrollTop < 0) continue;
      nextConversationScroll[conversationId] = Math.round(safeScrollTop);
    }
    state.ccoConversationScrollTopByConversationId = nextConversationScroll;
    const selectableRows = getCcoFilteredConversations(openRows);
    const selectedStillExists = selectableRows.some(
      (row) => row.conversationId === state.ccoSelectedConversationId
    );
    if (!selectedStillExists && selectableRows.length) {
      setSelectedCcoConversation(selectableRows[0].conversationId);
    }
    if (!selectableRows.length) {
      setSelectedCcoConversation('');
    }
    persistCcoWorkspaceSessionState();
    renderCcoSprintPanel(unansweredRows, plannedRows);
    renderCcoWorklist(data);
    renderCcoDetail(data);

    const visibleForContext = selectableRows;
    renderIncidentIntelligenceList(
      els.ccoInboxNeedsReplyList,
      visibleForContext
        .filter((item) => item.needsReplyStatus !== 'handled')
        .slice(0, 5)
        .map(
          (item) =>
            `${item.subject} · ${formatCcoPriorityLabel(item.priorityLevel)} · ${formatCcoIntentLabel(item.intent)}`
        ),
      'Inga konversationer i kö.'
    );
    renderIncidentIntelligenceList(
      els.ccoInboxDraftsList,
      visibleForContext
        .slice(0, 5)
        .map((item) => `${item.subject} · konfidens ${formatCcoConfidenceLabel(item.confidenceLevel || 'Low')}`),
      'Inga utkast än.'
    );
  }

  async function loadCcoInboxBrief({ quiet = true } = {}) {
    const shouldShowLoading =
      quiet !== true ||
      !(state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object');
    if (shouldShowLoading) {
      setCcoLoadingState(true, 'Hämtar mail och uppdaterar arbetskön…');
      renderCcoSearchMeta();
    }
    try {
      await loadCcoDeleteCapabilityStatus({ quiet: true });
      const response = await api('/agents/analysis?agent=CCO&limit=1');
      const entry = Array.isArray(response?.entries) && response.entries.length > 0
        ? response.entries[0]
        : null;
      if (entry?.output) {
        state.ccoAutoSwitchToInboundPending = true;
        renderCcoInbox(entry.output);
        await loadCcoMetrics({ since: '7d' });
        renderCcoInbox(state.ccoInboxData);
        if (!quiet) {
          const generatedAt = String(entry?.output?.data?.generatedAt || entry?.createdAt || '').trim();
          setStatus(
            els.ccoInboxStatus,
            generatedAt ? `CCO inkorgsbrief laddad (${generatedAt}).` : 'CCO inkorgsbrief laddad.'
          );
        }
        return;
      }
      renderCcoInbox(null);
      if (!quiet) setStatus(els.ccoInboxStatus, 'Ingen tidigare CCO inkorgsbrief hittades.');
    } catch (error) {
      renderCcoInbox(null);
      if (!quiet) {
        setStatus(els.ccoInboxStatus, error.message || 'Kunde inte läsa CCO inkorgsbrief.', true);
      }
    } finally {
      if (shouldShowLoading) {
        setCcoLoadingState(false);
      }
    }
  }

  async function loadCcoDeleteCapabilityStatus({ quiet = true } = {}) {
    try {
      const response = await api('/cco/delete/status');
      state.ccoDeleteCapability = sanitizeCcoDeleteCapabilityStatus({
        deleteEnabled: response?.deleteEnabled === true,
        reason: response?.reason || '',
        reasonCode: response?.reasonCode || '',
      });
    } catch (error) {
      state.ccoDeleteCapability = sanitizeCcoDeleteCapabilityStatus({
        deleteEnabled: false,
        reason: error?.message || 'Kunde inte läsa delete-status.',
        reasonCode: 'CCO_DELETE_STATUS_FETCH_FAILED',
      });
      if (!quiet) {
        setStatus(
          els.ccoInboxStatus,
          state.ccoDeleteCapability.reason || 'Kunde inte läsa delete-status.',
          true
        );
      }
    }
    applyCcoDeleteButtonState();
    applyCcoSnoozeButtonState();
  }

  async function runCcoInboxBrief({ quiet = false, forceLoading = false } = {}) {
    if (state.ccoInboxBriefRunInFlight) {
      if (!quiet) {
        setStatus(els.ccoInboxStatus, 'CCO inkorgsbrief körs redan.');
      }
      return;
    }
    state.ccoInboxBriefRunInFlight = true;
    const shouldShowLoading =
      forceLoading === true ||
      quiet !== true ||
      !(state.ccoInboxData?.data && typeof state.ccoInboxData.data === 'object');
    if (shouldShowLoading) {
      setCcoLoadingState(true, 'Hämtar mail och uppdaterar arbetskön…');
      renderCcoSearchMeta();
    }
    try {
      if (state.ccoEvidenceMode === true) {
        state.ccoDeleteCapability = sanitizeCcoDeleteCapabilityStatus({
          deleteEnabled: false,
          reason: 'Evidensläge är skrivskyddat.',
          reasonCode: 'CCO_EVIDENCE_READ_ONLY',
        });
        renderCcoInbox(createCcoEvidenceInboxOutput());
        if (!quiet) {
          setStatus(
            els.ccoInboxStatus,
            'Evidensläge aktivt: maskad dummydata laddad (5 trådar, 10 inkomna, 10 skickat).'
          );
        }
        return;
      }
      if (!canTemplateWrite()) throw new Error('Du saknar behorighet.');
      await loadCcoDeleteCapabilityStatus({ quiet: true });
      const input = readCcoInboxOptions();
      if (!quiet) {
        setStatus(els.ccoInboxStatus, 'Kör CCO inkorgsbrief...');
      }
      const response = await api('/agents/CCO/run', {
        method: 'POST',
        body: {
          channel: 'admin',
          input,
        },
      });
      state.ccoAutoSwitchToInboundPending = true;
      renderCcoInbox(response?.output || null);
      await loadCcoMetrics({ since: '7d' });
      renderCcoInbox(state.ccoInboxData);
      const generatedAt = String(response?.output?.data?.generatedAt || '').trim();
      if (!quiet) {
        setStatus(
          els.ccoInboxStatus,
          generatedAt
            ? `CCO inkorgsbrief uppdaterad (${generatedAt}).`
            : 'CCO inkorgsbrief uppdaterad.'
        );
      }
    } catch (error) {
      if (!quiet) {
        setStatus(els.ccoInboxStatus, error.message || 'Kunde inte köra CCO inkorgsbrief.', true);
      }
    } finally {
      if (shouldShowLoading) {
        setCcoLoadingState(false);
      }
      state.ccoInboxBriefRunInFlight = false;
      if (!state.ccoAutoRefreshInFlight) {
        syncCcoAutoRefresh({ immediate: false });
      }
    }
  }

  async function runCcoConversationAction(action = 'handled') {
    if (!canTemplateWrite()) throw new Error('Du saknar behorighet.');
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const response = await api('/capabilities/CcoConversationAction/run', {
      method: 'POST',
      headers: {
        'x-idempotency-key': generateClientIdempotencyKey(`cco-${action}`),
      },
      body: {
        channel: 'admin',
        input: {
          action,
          conversationId: conversation.conversationId,
          messageId: conversation.messageId,
          mailboxId: conversation.mailboxId,
          subject: conversation.subject,
        },
      },
    });
    const output = response?.output?.data || {};
    applyCcoConversationMutation(conversation.conversationId, (row) => ({
      ...row,
      needsReplyStatus: output.needsReplyStatus || row.needsReplyStatus,
      priorityLevel: output.priorityLevel || row.priorityLevel,
      recommendedAction:
        action === 'flag_critical' ? 'Eskalera' : row.recommendedAction,
      escalationRequired: action === 'flag_critical' ? true : row.escalationRequired,
    }));
    if (action === 'handled') {
      await markCcoSprintConversationCompleted(conversation.conversationId, conversation);
      setStatus(els.ccoSendStatus, 'Konversation markerad som hanterad.');
    } else {
      setStatus(els.ccoSendStatus, 'Konversation flaggad som kritisk.');
    }
    renderCcoInbox(state.ccoInboxData);
  }

  async function toggleCcoSystemMailForSelectedConversation() {
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const conversationId = String(conversation.conversationId || '').trim();
    const current = state.ccoSystemMessageByConversationId?.[conversationId];
    const nextValue = current === true ? false : true;
    state.ccoSystemMessageByConversationId = {
      ...(state.ccoSystemMessageByConversationId || {}),
      [conversationId]: nextValue,
    };
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
    renderCcoDetail(state.ccoInboxData?.data || null);
    setStatus(
      els.ccoSendStatus,
      nextValue === true
        ? 'Konversation markerad som systemmail.'
        : 'Konversation avmarkerad som systemmail.'
    );
  }

  async function hideCcoSenderOrPatternForSelectedConversation() {
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const senderPattern = extractEmailFromText(conversation.sender || '');
    const subjectSnippet = String(conversation.subject || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    const defaultPattern = senderPattern || subjectSnippet || '';
    const input = window.prompt(
      'Dölj avsändare/mönster (e-post för avsändare eller textmönster för ämne).',
      defaultPattern
    );
    if (input === null) {
      setStatus(els.ccoSendStatus, 'Inget mönster sparat.');
      return;
    }
    const normalized = String(input || '').trim().toLowerCase();
    if (!normalized) {
      throw new Error('Ange en avsändare eller ett ämnesmönster.');
    }
    const looksLikeEmail = normalized.includes('@');
    if (looksLikeEmail) {
      const nextSenderPatterns = sanitizeCcoSystemPatternList([
        ...(Array.isArray(state.ccoSystemMessageSenderPatterns) ? state.ccoSystemMessageSenderPatterns : []),
        normalized,
      ]);
      state.ccoSystemMessageSenderPatterns = nextSenderPatterns;
    } else {
      const nextSubjectPatterns = sanitizeCcoSystemPatternList([
        ...(Array.isArray(state.ccoSystemMessageSubjectPatterns) ? state.ccoSystemMessageSubjectPatterns : []),
        normalized,
      ]);
      state.ccoSystemMessageSubjectPatterns = nextSubjectPatterns;
    }
    state.ccoSystemMessageByConversationId = {
      ...(state.ccoSystemMessageByConversationId || {}),
      [String(conversation.conversationId || '').trim()]: true,
    };
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
    renderCcoDetail(state.ccoInboxData?.data || null);
    setStatus(
      els.ccoSendStatus,
      looksLikeEmail
        ? `Döljer framtida mail från ${normalized}.`
        : `Döljer framtida mail med mönstret "${normalized}".`
    );
  }

  async function snoozeSelectedCcoConversation() {
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const userInput = window.prompt(
      'Återkom senare (antal timmar eller datum YYYY-MM-DD HH:MM)',
      '24'
    );
    if (userInput === null) {
      setStatus(els.ccoSendStatus, 'Påminnelse avbruten.');
      return;
    }
    const trimmed = String(userInput || '').trim();
    if (!trimmed) throw new Error('Ange timmar eller datum.');
    let untilIso = '';
    const asHours = Number(trimmed);
    if (Number.isFinite(asHours) && asHours > 0) {
      untilIso = new Date(Date.now() + asHours * 60 * 60 * 1000).toISOString();
    } else {
      const parsed = Date.parse(trimmed);
      if (!Number.isFinite(parsed)) throw new Error('Ogiltigt datumformat.');
      untilIso = new Date(parsed).toISOString();
    }
    applyCcoConversationMutation(conversation.conversationId, (row) => ({
      ...row,
      needsReplyStatus: 'handled',
      followUpSuggested: true,
      followUpSuggestedAt: untilIso,
      recommendedAction: `Återkom ${formatCcoDateTimeValue(untilIso)}`,
    }));
    await markCcoSprintConversationCompleted(conversation.conversationId, conversation);
    setStatus(els.ccoSendStatus, `Påminnelse satt till ${formatCcoDateTimeValue(untilIso)}.`);
    renderCcoInbox(state.ccoInboxData);
  }

  async function deleteSelectedCcoConversation() {
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const capability = sanitizeCcoDeleteCapabilityStatus(state.ccoDeleteCapability);
    if (capability.deleteEnabled !== true) {
      throw new Error(capability.reason || 'Radera mail är inte aktiverat i denna miljö.');
    }
    const confirmed = window.confirm(
      'Radera mail? Rekommenderat beteende är mjuk radering (papperskorg).'
    );
    if (!confirmed) {
      setStatus(els.ccoSendStatus, 'Radering avbruten.');
      return;
    }
    await api('/cco/delete', {
      method: 'POST',
      headers: {
        'x-idempotency-key': generateClientIdempotencyKey('cco-delete'),
      },
      body: {
        channel: 'admin',
        mailboxId: String(conversation.mailboxId || '').trim(),
        messageId: String(conversation.messageId || '').trim(),
        conversationId: String(conversation.conversationId || '').trim(),
        softDelete: true,
      },
    });

    applyCcoConversationMutation(conversation.conversationId, (row) => ({
      ...row,
      deleted: true,
      needsReplyStatus: 'handled',
    }));
    await markCcoSprintConversationCompleted(conversation.conversationId, conversation);
    renderCcoInbox(state.ccoInboxData);
    setStatus(els.ccoSendStatus, 'Mail flyttat till papperskorg.');
  }

  async function runCcoRefineDraft(instruction = 'improve') {
    if (!canTemplateWrite()) throw new Error('Du saknar behorighet.');
    const conversation = getCcoSelectedConversation();
    if (!conversation) throw new Error('Välj en konversation först.');
    const currentDraft = String(els.ccoDraftBodyInput?.value || '').trim();
    if (!currentDraft) throw new Error('Inget utkast att förfina.');

    setStatus(els.ccoSendStatus, 'Förfinar svar via gateway...');
    const response = await api('/capabilities/RefineReplyDraft/run', {
      method: 'POST',
      headers: {
        'x-idempotency-key': generateClientIdempotencyKey(`cco-refine-${instruction}`),
      },
      body: {
        channel: 'admin',
        input: {
          conversationId: conversation.conversationId,
          messageId: conversation.messageId,
          mailboxId: conversation.mailboxId,
          subject: conversation.subject,
          draft: currentDraft,
          instruction,
        },
      },
    });
    const refinedReply = String(response?.output?.data?.refinedReply || '').trim();
    if (!refinedReply) throw new Error('Förfining returnerade tomt svar.');
    const nextDraft = removeCcoSignatureFromDraft(refinedReply);
    setCcoDraftBodyForConversation(conversation.conversationId, nextDraft);
    setCcoDraftEvaluationForConversation(conversation.conversationId, response);
    if (els.ccoDraftBodyInput) els.ccoDraftBodyInput.value = nextDraft;
    renderCcoDetail(state.ccoInboxData?.data || null);
    setStatus(els.ccoSendStatus, 'Svar förfinat och risk/policy-kontrollerat.');
  }

  async function sendCcoReply() {
    if (!canTemplateWrite()) throw new Error('Du saknar behorighet.');
    const { conversation, payload } = buildSelectedCcoSendPayload();
    if (!window.confirm('Skicka detta svar via Microsoft Graph nu?')) {
      setStatus(els.ccoSendStatus, 'Skick avbröts.');
      return;
    }
    setStatus(els.ccoSendStatus, 'Skickar via Graph (manuell trigger)...');
    const response = await api('/cco/send', {
      method: 'POST',
      headers: {
        'x-idempotency-key': payload.idempotencyKey,
      },
      body: {
        channel: 'admin',
        ...payload,
      },
    });
    const decision = String(response?.decision || '').trim().toLowerCase();
    setCcoDraftEvaluationForConversation(conversation.conversationId, response);
    if (decision && decision !== 'allow' && decision !== 'allow_flag') {
      throw new Error('Skick blockerades av risk/policy.');
    }
    applyCcoConversationMutation(conversation.conversationId, (row) => ({
      ...row,
      needsReplyStatus: 'handled',
    }));
    await markCcoSprintConversationCompleted(conversation.conversationId, conversation);
    setStatus(
      els.ccoSendStatus,
      `E-post skickad via Graph från ${state.ccoSenderMailboxId || CCO_DEFAULT_SENDER_MAILBOX}.`
    );
    renderCcoDetail(state.ccoInboxData?.data || null);
    renderCcoInbox(state.ccoInboxData);
  }

  async function fetchCalibrationSuggestion() {
    try {
      setStatus(els.calibrationStatus, 'Hämtar kalibreringsförslag...');
      const response = await api('/risk/calibration/suggestion');
      state.calibrationSuggestion = response?.suggestion || null;
      if (els.calibrationResult) {
        els.calibrationResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.calibrationStatus,
        `Förslag: ${response?.suggestion?.suggestedModifier ?? '-'} (${response?.suggestion?.reason || 'okänt'})`
      );
    } catch (error) {
      setStatus(
        els.calibrationStatus,
        error.message || 'Kunde inte hämta kalibreringsförslag.',
        true
      );
    }
  }

  async function applyCalibrationSuggestion() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan applicera förslag.');
      if (!state.calibrationSuggestion) throw new Error('Hämta ett kalibreringsförslag först.');

      setStatus(els.calibrationStatus, 'Applicerar kalibreringsförslag...');
      const note = (els.calibrationNoteInput?.value || '').trim();
      const response = await api('/risk/calibration/apply-suggestion', {
        method: 'POST',
        body: {
          suggestedModifier: state.calibrationSuggestion.suggestedModifier,
          note,
        },
      });

      if (els.calibrationResult) {
        els.calibrationResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.calibrationStatus,
        `Applicerat: riskSensitivityModifier=${response?.settings?.riskSensitivityModifier ?? '-'}`
      );
      state.calibrationSuggestion = null;
      await refreshAll();
    } catch (error) {
      setStatus(
        els.calibrationStatus,
        error.message || 'Kunde inte applicera kalibreringsförslag.',
        true
      );
    }
  }

  async function runPilotReport() {
    try {
      const days = Number(els.reportDaysInput?.value || 14);
      const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(90, days)) : 14;
      if (els.reportDaysInput) els.reportDaysInput.value = String(safeDays);

      setStatus(els.reportStatus, 'Genererar pilotrapport...');
      const response = await api(`/reports/pilot?days=${encodeURIComponent(safeDays)}`);
      if (els.pilotReportResult) {
        els.pilotReportResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.reportStatus,
        `Rapport klar: evaluations=${response?.kpis?.evaluationsTotal ?? 0}, highCritical=${response?.kpis?.highCriticalTotal ?? 0}`
      );
    } catch (error) {
      setStatus(els.reportStatus, error.message || 'Kunde inte generera pilotrapport.', true);
    }
  }

  function renderMailInsights(data) {
    if (!els.mailInsightsResult) return;
    if (!data?.ready) {
      const guidance = Array.isArray(data?.guidance) ? data.guidance : [];
      const message = guidance.length
        ? guidance.map((line) => `- ${line}`).join('\n')
        : '- Ingen mail-data hittades för tenant ännu.';
      els.mailInsightsResult.textContent = [
        'Mail-insikter saknas',
        '',
        message,
      ].join('\n');
      return;
    }

    const counts = data?.report?.counts || {};
    const lines = [
      `Klinik: ${data?.tenantId || '-'}`,
      `Varumärke: ${data?.brand || '-'}`,
      `E-postmapp: ${data?.paths?.mailDir || '-'}`,
      '',
      `Meddelanden använda: ${counts.messagesUsed ?? 0}`,
      `Trådar: ${counts.threads ?? 0}`,
      `Inkommande: ${counts.inbound ?? 0}`,
      `Utgående: ${counts.outbound ?? 0}`,
      `QA-par: ${counts.qaPairs ?? 0}`,
      `Mallfrön: ${counts.templateSeeds ?? 0}`,
      '',
      'Sammanfattning (förhandsvisning):',
      (data?.previews?.summary || '').slice(0, 500) || '(saknas)',
    ];

    els.mailInsightsResult.textContent = lines.join('\n');
  }

  function getMailSeedApplyPayload({ forceDryRun } = {}) {
    const limitRaw = Number.parseInt(String(els.mailSeedsLimit?.value || '8'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 8;
    if (els.mailSeedsLimit) els.mailSeedsLimit.value = String(limit);

    const category = String(els.mailSeedsCategory?.value || '').trim();
    const namePrefix = String(els.mailSeedsNamePrefix?.value || '').trim();

    const payload = {
      limit,
      dryRun: Boolean(forceDryRun),
    };
    if (category) payload.category = category;
    if (namePrefix) payload.namePrefix = namePrefix;
    return payload;
  }

  function renderMailSeedPreview(response) {
    if (!els.mailInsightsResult) return;
    const preview = Array.isArray(response?.preview) ? response.preview : [];
    const rows = preview.map((item, index) => {
      const unknown = Array.isArray(item?.unknownVariables) ? item.unknownVariables.length : 0;
      const missing = Array.isArray(item?.missingRequiredVariables)
        ? item.missingRequiredVariables.length
        : 0;
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • okändaVariabler=${unknown} • saknadeObligatoriska=${missing}`;
    });
    const lines = [
      `Seed-förhandsvisning: valda=${response?.selected ?? 0}`,
      `Klinik: ${response?.tenantId || '-'}`,
      '',
      ...(rows.length ? rows : ['(inga förhandsrader)']),
    ];
    els.mailInsightsResult.textContent = lines.join('\n');
  }

  function renderMailSeedApplyResult(response) {
    if (!els.mailInsightsResult) return;
    const templates = Array.isArray(response?.templates) ? response.templates : [];
    const rows = templates.map((item, index) => {
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • beslut=${item?.decision || '-'} • risk=L${item?.riskLevel ?? '-'}`;
    });
    const lines = [
      `Mallfröimport: skapade=${response?.created ?? 0} av valda=${response?.selected ?? 0}`,
      `Klinik: ${response?.tenantId || '-'}`,
      '',
      ...(rows.length ? rows : ['(inga skapade mallar)']),
    ];
    els.mailInsightsResult.textContent = lines.join('\n');
  }

  async function applyMailTemplateSeeds({ dryRun }) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan köra seed → draft.');
      const payload = getMailSeedApplyPayload({ forceDryRun: dryRun });
      setStatus(
        els.mailInsightsStatus,
        dryRun ? 'Kör mallfrö-förhandsvisning...' : 'Skapar utkast från mallfrön...'
      );

      const response = await api('/mail/template-seeds/apply', {
        method: 'POST',
        body: payload,
      });

      if (dryRun) {
        renderMailSeedPreview(response);
        setStatus(
          els.mailInsightsStatus,
          `Förhandsvisning klar: ${response?.selected ?? 0} mallfrön valda.`
        );
        return;
      }

      renderMailSeedApplyResult(response);
      setStatus(
        els.mailInsightsStatus,
        `Klart: ${response?.created ?? 0} utkast skapade från mallfrön.`
      );
      await loadDashboard();
      await loadTemplates({ preserveSelection: false });
      await loadMailInsights();
    } catch (error) {
      setStatus(
        els.mailInsightsStatus,
        error.message || 'Kunde inte köra mallfrön → utkast.',
        true
      );
    }
  }

  async function loadMailInsights() {
    try {
      setStatus(els.mailInsightsStatus, 'Laddar mail-insikter...');
      const response = await api('/mail/insights');
      renderMailInsights(response);
      if (response?.ready) {
        const qaPairs = Number(response?.report?.counts?.qaPairs || 0);
        setStatus(els.mailInsightsStatus, `Mail-insikter laddade (QA-par: ${qaPairs}).`);
      } else {
        setStatus(els.mailInsightsStatus, 'Ingen mail-ingest hittad ännu.');
      }
    } catch (error) {
      setStatus(els.mailInsightsStatus, error.message || 'Kunde inte läsa mail-insikter.', true);
    }
  }

  function remediationPriorityRank(priorityRaw) {
    const priority = String(priorityRaw || '')
      .trim()
      .toUpperCase();
    if (priority === 'P0') return 0;
    if (priority === 'P1') return 1;
    if (priority === 'P2') return 2;
    if (priority === 'P3') return 3;
    return 9;
  }

  function renderMonitorObservability(observabilityResponse = null) {
    if (!els.monitorObservabilitySummary || !els.monitorObservabilityResult) return;
    const summary = observabilityResponse?.summary && typeof observabilityResponse.summary === 'object'
      ? observabilityResponse.summary
      : null;
    if (!summary) {
      els.monitorObservabilitySummary.textContent = '';
      els.monitorObservabilityResult.textContent = isEnglishLanguage()
        ? 'No observability data yet.'
        : 'Ingen observabilitetsdata ännu.';
      return;
    }

    const status = String(summary?.overallStatus || 'unknown').toLowerCase();
    const alerts = Number(summary?.triggeredAlertsCount || 0);
    const hasTraffic = summary?.hasTraffic === true;
    const sampledRequests = Number(summary?.sampledRequests || 0);
    const metrics = observabilityResponse?.metrics && typeof observabilityResponse.metrics === 'object'
      ? observabilityResponse.metrics
      : {};
    const thresholds =
      observabilityResponse?.thresholds && typeof observabilityResponse.thresholds === 'object'
        ? observabilityResponse.thresholds
        : {};
    const checks = Array.isArray(observabilityResponse?.checks) ? observabilityResponse.checks : [];
    const triggeredAlerts = Array.isArray(observabilityResponse?.triggeredAlerts)
      ? observabilityResponse.triggeredAlerts
      : [];

    els.monitorObservabilitySummary.textContent = isEnglishLanguage()
      ? `status=${status} alerts=${alerts} hasTraffic=${hasTraffic ? 'yes' : 'no'} sampled=${sampledRequests}`
      : `status=${status} varningar=${alerts} harTrafik=${hasTraffic ? 'ja' : 'nej'} urval=${sampledRequests}`;

    const lines = [];
    lines.push(
      `mätvärden: felgradProcent=${Number(metrics?.errorRatePct || 0)} p95Ms=${Number(metrics?.p95Ms || 0)} p99Ms=${Number(metrics?.p99Ms || 0)} långsammaAnrop=${Number(metrics?.slowRequests || 0)}`
    );
    lines.push(
      `gränsvärden: maxFelgradProcent=${Number(thresholds?.maxErrorRatePct || 0)} maxP95Ms=${Number(thresholds?.maxP95Ms || 0)} maxLångsammaAnrop=${Number(thresholds?.maxSlowRequests || 0)}`
    );
    lines.push(`skapad: ${formatDateTime(observabilityResponse?.generatedAt)}`);
    lines.push('');
    lines.push(
      isEnglishLanguage()
        ? `checks (${checks.length}):`
        : `kontroller (${checks.length}):`
    );
    checks.forEach((check) => {
      lines.push(
        `- ${String(check?.id || '-')} status=${String(check?.status || '-')} krävs=${check?.required === true ? 'ja' : 'nej'} mål=${String(check?.target || '-')}`
      );
    });
    lines.push('');
    if (triggeredAlerts.length === 0) {
      lines.push(
        isEnglishLanguage() ? 'No triggered alerts.' : 'Inga aktiva varningar.'
      );
    } else {
      lines.push(
        isEnglishLanguage() ? 'Triggered alerts:' : 'Aktiva varningar:'
      );
      triggeredAlerts.forEach((alert) => {
        lines.push(
          `- ${String(alert?.id || '-')} target=${String(alert?.target || '-')} value=${JSON.stringify(alert?.value || {})}`
        );
      });
    }
    els.monitorObservabilityResult.textContent = lines.join('\n');
  }

  function renderMonitorPublicChatBeta(statusResponse = null) {
    if (!els.monitorPublicChatBetaSummary || !els.monitorPublicChatBetaResult) return;
    const beta = statusResponse?.security?.publicChatBeta;
    if (!beta || typeof beta !== 'object') {
      els.monitorPublicChatBetaSummary.textContent = '';
      els.monitorPublicChatBetaResult.textContent = isEnglishLanguage()
        ? 'No patient beta gate data yet.'
        : 'Ingen patient-beta-gate-data ännu.';
      return;
    }

    const enabled = beta?.enabled === true;
    const keyConfigured = beta?.keyConfigured === true;
    const allowHostsCount = Number(beta?.allowHostsCount || 0);
    const allowLocalhost = beta?.allowLocalhost === true;
    const headerName = String(beta?.headerName || 'x-arcana-beta-key');
    const ready = !enabled || keyConfigured || allowHostsCount > 0;

    els.monitorPublicChatBetaSummary.textContent = isEnglishLanguage()
      ? `enabled=${enabled ? 'yes' : 'no'} ready=${ready ? 'yes' : 'no'} key=${keyConfigured ? 'yes' : 'no'} allowHosts=${allowHostsCount}`
      : `aktiverad=${enabled ? 'ja' : 'nej'} redo=${ready ? 'ja' : 'nej'} nyckel=${keyConfigured ? 'ja' : 'nej'} tillåtnaVärdar=${allowHostsCount}`;

    const lines = [
      `rubrikNamn=${headerName}`,
      `tillåtLokalhost=${allowLocalhost ? 'ja' : 'nej'}`,
      `nyckelKonfigurerad=${keyConfigured ? 'ja' : 'nej'}`,
      `antalTillåtnaVärdar=${allowHostsCount}`,
    ];
    if (enabled && !ready) {
      lines.push(
        isEnglishLanguage()
          ? 'Action: set ARCANA_PUBLIC_CHAT_BETA_KEY or ARCANA_PUBLIC_CHAT_BETA_ALLOW_HOSTS.'
          : 'Åtgärd: sätt ARCANA_PUBLIC_CHAT_BETA_KEY eller ARCANA_PUBLIC_CHAT_BETA_ALLOW_HOSTS.'
      );
    } else if (enabled) {
      lines.push(
        isEnglishLanguage()
          ? 'Patient beta gate is active and configured.'
          : 'Patient-beta-gate är aktiv och konfigurerad.'
      );
    } else {
      lines.push(
        isEnglishLanguage()
          ? 'Patient beta gate is disabled (open access mode).'
          : 'Patient-beta-gate är avstängd (öppet läge).'
      );
    }
    els.monitorPublicChatBetaResult.textContent = lines.join('\n');
  }

  function renderMonitorPatientConversion(statusResponse = null) {
    if (!els.monitorPatientConversionSummary || !els.monitorPatientConversionResult) return;
    const feedback = statusResponse?.patientChannel?.conversionFeedback;
    if (!feedback || typeof feedback !== 'object') {
      els.monitorPatientConversionSummary.textContent = '';
      els.monitorPatientConversionResult.textContent = isEnglishLanguage()
        ? 'No patient conversion signal data yet.'
        : 'Ingen patientkonverteringssignaldata ännu.';
      return;
    }

    const summary = feedback?.summary && typeof feedback.summary === 'object' ? feedback.summary : {};
    const check = feedback?.check && typeof feedback.check === 'object' ? feedback.check : {};
    const value = check?.value && typeof check.value === 'object' ? check.value : {};
    const totalRequests = Number(summary?.totalRequests || 0);
    const deniedRatePct = Number(summary?.deniedRatePct || 0);
    const conversionRatePct = Number(summary?.conversionIntentRatePct || 0);
    const feedbackHealthy = summary?.feedbackHealthy === true;
    const latestEventAt = summary?.latestEventAt || value?.latestEventAt || null;
    const ageHoursRaw = summary?.ageHoursSinceLatest ?? value?.ageHoursSinceLatest;
    const ageHoursSinceLatest = Number.isFinite(Number(ageHoursRaw))
      ? Number(ageHoursRaw)
      : null;
    const status = String(check?.status || 'unknown').toLowerCase();
    const windowDays = Number(feedback?.windowDays || statusResponse?.patientChannel?.windowDays || 0);

    els.monitorPatientConversionSummary.textContent = isEnglishLanguage()
      ? `status=${status} healthy=${feedbackHealthy ? 'yes' : 'no'} requests=${totalRequests} deniedRate=${deniedRatePct}% conversionRate=${conversionRatePct}%`
      : `status=${status} frisk=${feedbackHealthy ? 'ja' : 'nej'} förfrågningar=${totalRequests} nekadAndel=${deniedRatePct}% konverteringsgrad=${conversionRatePct}%`;

    const lines = [
      `fönsterDagar=${windowDays}`,
      `senasteHändelse=${formatDateTime(latestEventAt)} (${formatRelativeAge(latestEventAt)})`,
      `ålderTimmarSedanSenaste=${ageHoursSinceLatest !== null ? ageHoursSinceLatest : '-'}`,
      `feedbackFrisk=${feedbackHealthy ? 'ja' : 'nej'}`,
    ];
    if (check?.evidence) {
      lines.push(`evidence: ${String(check.evidence)}`);
    }

    const topDeniedHosts = Array.isArray(summary?.topDeniedHosts) ? summary.topDeniedHosts : [];
    const topSignals = Array.isArray(summary?.topIntentSignals) ? summary.topIntentSignals : [];
    const daily = Array.isArray(summary?.daily) ? summary.daily : [];

    lines.push('');
	      lines.push(isEnglishLanguage() ? 'Top denied hosts:' : 'Topp nekade värdar:');
    if (topDeniedHosts.length === 0) {
      lines.push(isEnglishLanguage() ? '- none' : '- inga');
    } else {
      topDeniedHosts.slice(0, 5).forEach((item) => {
        lines.push(`- ${String(item?.key || '-')} count=${Number(item?.count || 0)}`);
      });
    }

    lines.push('');
	    lines.push(isEnglishLanguage() ? 'Top intent signals:' : 'Topp intentsignaler:');
    if (topSignals.length === 0) {
      lines.push(isEnglishLanguage() ? '- none' : '- inga');
    } else {
      topSignals.slice(0, 6).forEach((item) => {
        lines.push(`- ${String(item?.key || '-')} count=${Number(item?.count || 0)}`);
      });
    }

    lines.push('');
    lines.push(isEnglishLanguage() ? 'Recent daily series:' : 'Senaste dagsserie:');
    if (daily.length === 0) {
      lines.push(isEnglishLanguage() ? '- no events in window' : '- inga event i fönstret');
    } else {
      daily.slice(-7).forEach((item) => {
        lines.push(
	          `${String(item?.date || '-')} förfrågningar=${Number(item?.totalRequests || 0)} nekade=${Number(item?.deniedRequests || 0)} konverteringssignaler=${Number(item?.conversionIntentRequests || 0)}`
        );
      });
    }

    els.monitorPatientConversionResult.textContent = lines.join('\n');
  }

  function renderMonitorScheduler(statusResponse = null) {
    if (!els.monitorSchedulerSummary || !els.monitorSchedulerResult) return;
    const scheduler = statusResponse?.runtime?.scheduler || null;
    if (!scheduler || typeof scheduler !== 'object') {
      els.monitorSchedulerSummary.textContent = '';
      els.monitorSchedulerResult.textContent = isEnglishLanguage()
        ? 'No scheduler data yet.'
        : 'Ingen scheduler-data ännu.';
      return;
    }

    const requiredOrder = [
      'alert_probe',
      'nightly_pilot_report',
      'backup_prune',
      'restore_drill_preview',
    ];
    const byId = new Map(
      (Array.isArray(scheduler?.jobs) ? scheduler.jobs : []).map((job) => [String(job?.id || ''), job])
    );
    const jobs = requiredOrder
      .map((jobId) => byId.get(jobId))
      .filter((job) => Boolean(job));

    if (jobs.length === 0) {
      els.monitorSchedulerSummary.textContent = isEnglishLanguage()
        ? 'Required jobs missing in monitor status.'
	        : 'Obligatoriska jobb saknas i monitor-status.';
      els.monitorSchedulerResult.textContent = isEnglishLanguage()
        ? 'No scheduler job details available.'
	        : 'Ingen scheduler-jobbdetalj tillgänglig.';
      return;
    }

    const stale = jobs.filter((job) => String(job?.freshnessStatus || '') === 'red').length;
    const warn = jobs.filter((job) => String(job?.freshnessStatus || '') === 'yellow').length;
    const running = jobs.filter((job) => job?.running === true).length;
    els.monitorSchedulerSummary.textContent = isEnglishLanguage()
      ? `required=${jobs.length} stale=${stale} warn=${warn} running=${running}`
	      : `krav=${jobs.length} inaktuella=${stale} varning=${warn} kör=${running}`;

    const lines = jobs.map((job) => {
      const id = String(job?.id || '-');
      const enabled = job?.enabled === true ? (isEnglishLanguage() ? 'yes' : 'ja') : isEnglishLanguage() ? 'no' : 'nej';
      const freshness = String(job?.freshnessStatus || 'unknown');
      const lastSuccess = formatDateTime(job?.lastSuccessAt);
      const lastSuccessAge = formatRelativeAge(job?.lastSuccessAt);
      const nextRun = formatDateTime(job?.nextRunAt);
      const lastStatus = String(job?.lastStatus || '-');
	      return `${id} | aktiverad=${enabled} | färskhet=${freshness} | senasteLyckad=${lastSuccess} (${lastSuccessAge}) | nästaKörning=${nextRun} | status=${lastStatus}`;
    });
    els.monitorSchedulerResult.textContent = lines.join('\n');
  }

  function renderReadinessHistory(historyResponse = null) {
    if (!els.monitorReadinessHistorySummary || !els.monitorReadinessHistoryResult) return;
    const entries = Array.isArray(historyResponse?.entries) ? historyResponse.entries : [];
    const trend = historyResponse?.trend && typeof historyResponse.trend === 'object'
      ? historyResponse.trend
      : null;

    if (entries.length === 0) {
      els.monitorReadinessHistorySummary.textContent = '';
      els.monitorReadinessHistoryResult.textContent = isEnglishLanguage()
        ? 'No readiness history yet.'
	        : 'Ingen beredskapshistorik ännu.';
      return;
    }

    const latest = entries[0] || {};
    const latestScore = Number(latest?.score || 0);
    const latestBand = String(latest?.band || '-');
    const latestGoAllowed = latest?.goAllowed === true;
    const latestRequiredBlockers = Number(latest?.blockingRequiredChecks || 0);
    const latestNoGo = Number(latest?.triggeredNoGo || 0);
    const latestRemediation = Number(latest?.remediationTotal || 0);
    const scoreDelta = Number(trend?.scoreDelta || 0);
    const requiredDelta = Number(trend?.blockingRequiredChecksDelta || 0);
    const scoreDeltaLabel = Number.isFinite(scoreDelta)
      ? `${scoreDelta >= 0 ? '+' : ''}${Number(scoreDelta.toFixed(2))}`
      : '-';
    const requiredDeltaLabel = Number.isFinite(requiredDelta)
      ? `${requiredDelta >= 0 ? '+' : ''}${requiredDelta}`
      : '-';

    els.monitorReadinessHistorySummary.textContent = isEnglishLanguage()
      ? `latest score=${Number(latestScore.toFixed(2))} (${scoreDeltaLabel}) band=${latestBand} goAllowed=${latestGoAllowed ? 'yes' : 'no'} required=${latestRequiredBlockers} (${requiredDeltaLabel}) noGo=${latestNoGo} remediation=${latestRemediation}`
	      : `senaste poäng=${Number(latestScore.toFixed(2))} (${scoreDeltaLabel}) band=${latestBand} goTillåten=${latestGoAllowed ? 'ja' : 'nej'} obligatoriska=${latestRequiredBlockers} (${requiredDeltaLabel}) noGo=${latestNoGo} åtgärder=${latestRemediation}`;

    const lines = entries.slice(0, 10).map((item) => {
      const ts = formatDateTime(item?.ts);
      const age = formatRelativeAge(item?.ts);
      const score = Number(item?.score || 0);
      const band = String(item?.band || '-');
      const goAllowed = item?.goAllowed === true;
      const requiredBlockers = Number(item?.blockingRequiredChecks || 0);
      const triggeredNoGo = Number(item?.triggeredNoGo || 0);
      const remediationTotal = Number(item?.remediationTotal || 0);
      const remediationP0 = Number(item?.remediationP0 || 0);
	      return `${ts} (${age}) | poäng=${Number(score.toFixed(2))} | band=${band} | go=${goAllowed ? 'ja' : 'nej'} | obligatoriska=${requiredBlockers} | noGo=${triggeredNoGo} | åtgärder=${remediationTotal} (P0=${remediationP0})`;
    });
    els.monitorReadinessHistoryResult.textContent = lines.join('\n');
  }

  function formatReadinessNoGoDetail(detail) {
    if (!detail || typeof detail !== 'object') return String(detail ?? '-');
    const fields = [
      ['templateId', 'template'],
      ['versionId', 'version'],
      ['versionNo', 'vNo'],
      ['category', 'category'],
      ['reason', 'reason'],
      ['policyRuleId', 'policyRule'],
      ['riskLevel', 'risk'],
      ['decision', 'decision'],
      ['ownerDecision', 'ownerDecision'],
      ['activatedAt', 'activatedAt'],
    ];
    const parts = [];
    for (const [key, label] of fields) {
      const value = detail?.[key];
      if (value === undefined || value === null || value === '') continue;
      parts.push(`${label}=${String(value)}`);
    }
    if (parts.length > 0) return parts.join(' ');
    try {
      return JSON.stringify(detail);
    } catch {
      return '[detail]';
    }
  }

  function renderReadinessNoGo(readiness = null) {
    if (!els.monitorReadinessNoGoSummary || !els.monitorReadinessNoGoResult) return;
    const goNoGo = readiness?.goNoGo && typeof readiness.goNoGo === 'object' ? readiness.goNoGo : {};
    const triggers = (Array.isArray(readiness?.noGoTriggers) ? readiness.noGoTriggers : []).filter(
      (item) => String(item?.status || '').toLowerCase() === 'triggered'
    );
    const goAllowed = goNoGo?.allowed === true;
    const blockersGreen = goNoGo?.blockerCategoriesGreen === true;
    const requiredBlockerCount = Number(goNoGo?.blockingRequiredChecksCount || 0);
    const requiredBlockerIds = Array.isArray(goNoGo?.blockingRequiredCheckIds)
      ? goNoGo.blockingRequiredCheckIds.map((item) => String(item || '')).filter(Boolean)
      : [];
    const requiredBlockerDetails = Array.isArray(readiness?.evidence?.blockingRequiredChecks?.checks)
      ? readiness.evidence.blockingRequiredChecks.checks
      : [];
    const ids = Array.isArray(goNoGo?.triggeredNoGoIds)
      ? goNoGo.triggeredNoGoIds.map((item) => String(item || '')).filter(Boolean)
      : triggers.map((item) => String(item?.id || '')).filter(Boolean);

    if (triggers.length === 0) {
      els.monitorReadinessNoGoSummary.textContent = isEnglishLanguage()
        ? `goAllowed=${goAllowed ? 'yes' : 'no'} blockersGreen=${blockersGreen ? 'yes' : 'no'} requiredBlockers=${requiredBlockerCount} triggered=0`
	        : `goTillåten=${goAllowed ? 'ja' : 'nej'} blockeringarGröna=${blockersGreen ? 'ja' : 'nej'} obligatoriskaBlockeringar=${requiredBlockerCount} utlösta=0`;

      const lines = [];
      if (requiredBlockerCount > 0) {
        lines.push(
          isEnglishLanguage()
            ? `Required blockers (${requiredBlockerCount}): ${requiredBlockerIds.join(',') || '-'}`
	            : `Obligatoriska blockeringar (${requiredBlockerCount}): ${requiredBlockerIds.join(',') || '-'}`
        );
        requiredBlockerDetails.slice(0, 6).forEach((item) => {
          lines.push(
	            `   - ${String(item?.checkId || '-')} status=${String(item?.status || '-')} kategori=${String(item?.categoryId || '-')}`
          );
          if (item?.target) {
	            lines.push(`     mål: ${String(item.target)}`);
          }
        });
        if (requiredBlockerDetails.length > 6) {
	          lines.push(`   ... +${requiredBlockerDetails.length - 6} fler obligatoriska blockeringar`);
        }
      } else {
        lines.push(
          isEnglishLanguage()
            ? 'No active no-go blockers.'
            : 'Inga aktiva No-Go blockeringar.'
        );
      }
      els.monitorReadinessNoGoResult.textContent = lines.join('\n');
      return;
    }

      els.monitorReadinessNoGoSummary.textContent = isEnglishLanguage()
      ? `goAllowed=${goAllowed ? 'yes' : 'no'} blockersGreen=${blockersGreen ? 'yes' : 'no'} requiredBlockers=${requiredBlockerCount} triggered=${triggers.length} ids=${ids.join(',') || '-'}`
	        : `goTillåten=${goAllowed ? 'ja' : 'nej'} blockeringarGröna=${blockersGreen ? 'ja' : 'nej'} obligatoriskaBlockeringar=${requiredBlockerCount} utlösta=${triggers.length} id=${ids.join(',') || '-'}`;

    const lines = [];
    if (requiredBlockerCount > 0) {
      lines.push(
        isEnglishLanguage()
          ? `Required blockers (${requiredBlockerCount}): ${requiredBlockerIds.join(',') || '-'}`
	          : `Obligatoriska blockeringar (${requiredBlockerCount}): ${requiredBlockerIds.join(',') || '-'}`
      );
      requiredBlockerDetails.slice(0, 5).forEach((item) => {
        lines.push(
	          `   - ${String(item?.checkId || '-')} status=${String(item?.status || '-')} kategori=${String(item?.categoryId || '-')}`
        );
      });
      lines.push('');
    }
    triggers.forEach((trigger, index) => {
      const id = String(trigger?.id || '-');
      const label = String(trigger?.label || id);
      const evidence = String(trigger?.evidence || '-');
      const violations = Number(trigger?.value?.violations || 0);
      const details = Array.isArray(trigger?.value?.details) ? trigger.value.details : [];
      lines.push(`[${id}] ${label}`);
	      lines.push(`   underlag: ${evidence}`);
	      if (violations > 0) lines.push(`   överträdelser: ${violations}`);
      details.slice(0, 3).forEach((detail, detailIndex) => {
	        lines.push(`   detalj${detailIndex + 1}: ${formatReadinessNoGoDetail(detail)}`);
      });
      if (details.length > 3) {
	        lines.push(`   ... +${details.length - 3} fler detaljer`);
      }
      if (index < triggers.length - 1) lines.push('');
    });
    els.monitorReadinessNoGoResult.textContent = lines.join('\n');
  }

  function renderMonitorRemediation(readiness) {
    const remediation = readiness?.remediation || null;
    const summary = remediation?.summary || {};
    const byPriority = summary?.byPriority || {};
    const total = Number(summary?.total || 0);
    const p0 = Number(byPriority?.P0 || 0);
    const p1 = Number(byPriority?.P1 || 0);
    const p2 = Number(byPriority?.P2 || 0);
    const p3 = Number(byPriority?.P3 || 0);
    const potentialGain = Number(summary?.potentialScoreGain || 0);

    if (els.monitorRemediationSummary) {
      els.monitorRemediationSummary.textContent = isEnglishLanguage()
        ? `Actions=${total} (P0=${p0}, P1=${p1}, P2=${p2}, P3=${p3}) | potentialGain=${potentialGain}`
	        : `Åtgärder=${total} (P0=${p0}, P1=${p1}, P2=${p2}, P3=${p3}) | möjligPoängökning=${potentialGain}`;
    }

    if (!els.monitorRemediationResult) return;

    const actionList = Array.isArray(remediation?.actions) ? remediation.actions : [];
    const nextActions = actionList
      .slice()
      .sort((a, b) => {
        const byPriorityOrder =
          remediationPriorityRank(a?.priority) - remediationPriorityRank(b?.priority);
        if (byPriorityOrder !== 0) return byPriorityOrder;
        const byRequired = Number(Boolean(b?.required)) - Number(Boolean(a?.required));
        if (byRequired !== 0) return byRequired;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      })
      .slice(0, 8);

    if (nextActions.length === 0) {
      els.monitorRemediationResult.textContent = isEnglishLanguage()
        ? 'No remediation actions right now.'
	        : 'Inga åtgärder just nu.';
      return;
    }

    const goAllowedLabel =
      readiness?.goNoGo?.allowed === true
        ? isEnglishLanguage()
          ? 'yes'
          : 'ja'
        : isEnglishLanguage()
          ? 'no'
          : 'nej';
    const lines = [
      isEnglishLanguage()
        ? `Readiness: score=${readiness?.score ?? '-'} band=${readiness?.band || '-'} goAllowed=${goAllowedLabel}`
	        : `Beredskap: poäng=${readiness?.score ?? '-'} band=${readiness?.band || '-'} goTillåten=${goAllowedLabel}`,
      isEnglishLanguage() ? `Critical path (P0): ${p0}` : `Kritisk väg (P0): ${p0}`,
      '',
	      isEnglishLanguage() ? 'Top actions:' : 'Toppåtgärder:',
    ];

    nextActions.forEach((action, index) => {
      const priority = String(action?.priority || '-').toUpperCase();
      const owner = String(action?.owner || '-');
      const title = String(action?.title || action?.relatedId || '-');
      const targetState = String(action?.targetState || '-');
      const impact = Number(action?.scoreImpactMax || 0);
      lines.push(
        isEnglishLanguage()
          ? `${index + 1}. [${priority}] ${title} | owner=${owner} | target=${targetState} | impact<=${impact}`
	          : `${index + 1}. [${priority}] ${title} | ansvarig=${owner} | mål=${targetState} | påverkan<=${impact}`
      );
      if (action?.playbook) {
        lines.push(
          isEnglishLanguage()
            ? `   playbook: ${String(action.playbook)}`
	            : `   körplan: ${String(action.playbook)}`
        );
      }
    });

    els.monitorRemediationResult.textContent = lines.join('\n');
  }

  function setMonitorDetailsVisible(visible) {
    const nextVisible = Boolean(visible);
    state.monitorDetailsVisible = nextVisible;
    if (els.monitorResult) els.monitorResult.classList.toggle('hidden', !nextVisible);
    if (els.toggleMonitorDetailsBtn) {
      els.toggleMonitorDetailsBtn.textContent = nextVisible
        ? isEnglishLanguage()
          ? 'Hide details'
          : 'Dölj detaljer'
        : isEnglishLanguage()
          ? 'Show details'
          : 'Visa detaljer';
      els.toggleMonitorDetailsBtn.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
    }
  }

  async function loadMonitorStatus() {
    try {
      setStatus(els.monitorPanelStatus, 'Laddar monitor-status...');
      const [statusResponse, readinessResponse, readinessHistoryResponse, observabilityResponse] = await Promise.all([
        api('/monitor/status'),
        api('/monitor/readiness'),
        api('/monitor/readiness/history?limit=30'),
        api('/monitor/observability?areaLimit=12'),
      ]);
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(
          {
            status: statusResponse,
            readiness: readinessResponse,
            readinessHistory: readinessHistoryResponse,
            observability: observabilityResponse,
          },
          null,
          2
        );
      }
      renderReadinessKpi(readinessResponse);
      renderPilotReportKpi(statusResponse);
      renderMonitorObservability(observabilityResponse);
      renderMonitorPublicChatBeta(statusResponse);
      renderMonitorPatientConversion(statusResponse);
      renderMonitorScheduler(statusResponse);
      renderReadinessHistory(readinessHistoryResponse);
      renderReadinessNoGo(readinessResponse);
      renderMonitorRemediation(readinessResponse);
      const band = readinessResponse?.band || '-';
      const requiredBlockers = Number(readinessResponse?.goNoGo?.blockingRequiredChecksCount || 0);
      const triggeredNoGoCount = Number(readinessResponse?.goNoGo?.triggeredNoGoCount || 0);
      setStatus(
        els.monitorPanelStatus,
        `Monitor uppdaterad. Band=${band}, blockeringar=${requiredBlockers}, noGo=${triggeredNoGoCount}.`
      );
    } catch (error) {
      renderReadinessKpi(null);
      renderPilotReportKpi(null);
      renderMonitorObservability(null);
      renderMonitorPublicChatBeta(null);
      renderMonitorPatientConversion(null);
      renderMonitorScheduler(null);
      renderReadinessHistory(null);
      renderReadinessNoGo(null);
      if (els.monitorRemediationSummary) els.monitorRemediationSummary.textContent = '';
      if (els.monitorRemediationResult) {
        els.monitorRemediationResult.textContent = isEnglishLanguage()
          ? 'Readiness remediation could not be loaded.'
          : 'Beredskapsåtgärd kunde inte laddas.';
      }
      setStatus(els.monitorPanelStatus, error.message || 'Kunde inte läsa monitor-status.', true);
    }
  }

  async function runSchedulerRequiredSuite() {
    if (!isOwner()) {
      if (els.monitorResult) els.monitorResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.monitorPanelStatus, 'Kör scheduler-suite (required jobs)...');
      const response = await api('/ops/scheduler/run', {
        method: 'POST',
        body: { jobId: 'required_suite' },
      });
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(response, null, 2);
      }
      const succeeded = Number(response?.suite?.succeeded || 0);
      const total = Number(response?.suite?.total || 0);
      const failed = Number(response?.suite?.failed || 0);
      setStatus(
        els.monitorPanelStatus,
        `Scheduler-suite klar: ${succeeded}/${total} lyckades, failed=${failed}`,
        failed > 0
      );
      await loadMonitorStatus();
    } catch (error) {
      setStatus(
        els.monitorPanelStatus,
        error.message || 'Kunde inte köra scheduler-suite.',
        true
      );
    }
  }

  async function runReadinessOutputGateRemediation({ dryRun = true } = {}) {
    if (!isOwner()) {
      if (els.monitorResult) els.monitorResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(
        els.monitorPanelStatus,
        dryRun
          ? 'Förhandsvisning: beredskapsåtgärd (output gate)...'
          : 'Kör beredskapsåtgärd (output gate)...'
      );
      const response = await api('/ops/readiness/remediate-output-gates', {
        method: 'POST',
        body: {
          dryRun,
          limit: 50,
          detailsLimit: 8,
        },
      });
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(response, null, 2);
      }
      const candidates = Number(response?.candidates || 0);
      const fixable = Number(response?.fixableCandidates || 0);
      const fixed = Number(response?.fixedCount || 0);
      const remaining = Number(response?.remainingFixableAfterApply || 0);
      setStatus(
        els.monitorPanelStatus,
        dryRun
          ? `Förhandsvisning klar: kandidater=${candidates}, åtgärdbara=${fixable}`
          : `Åtgärd klar: kandidater=${candidates}, åtgärdbara=${fixable}, åtgärdade=${fixed}, kvar=${remaining}`,
        !dryRun && remaining > 0
      );
      await loadMonitorStatus();
    } catch (error) {
      setStatus(
        els.monitorPanelStatus,
        error.message || 'Kunde inte köra beredskapsåtgärd.',
        true
      );
    }
  }

  async function runReadinessOwnerMfaRemediation({ dryRun = true } = {}) {
    if (!isOwner()) {
      if (els.monitorResult) els.monitorResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(
        els.monitorPanelStatus,
        dryRun
          ? 'Förhandsvisning: beredskapsåtgärd (owner MFA-medlemskap)...'
          : 'Kör beredskapsåtgärd (owner MFA-medlemskap)...'
      );
      const response = await api('/ops/readiness/remediate-owner-mfa-memberships', {
        method: 'POST',
        body: {
          dryRun,
          limit: 50,
          detailsLimit: 8,
        },
      });
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(response, null, 2);
      }
      const candidates = Number(response?.disableCandidates || 0);
      const attempted = Number(response?.attemptedCandidates || response?.attempted || 0);
      const disabled = Number(response?.disabledCount || 0);
      const skipped = Number(response?.skippedCount || 0);
      const remaining = Number(response?.remainingNonCompliantOwners || 0);
      setStatus(
        els.monitorPanelStatus,
        dryRun
          ? `Förhandsvisning klar: kandidater_att_inaktivera=${candidates}, försökta=${attempted}`
          : `Åtgärd klar: försökta=${attempted}, inaktiverade=${disabled}, hoppade_över=${skipped}, kvar_icke_följsamma=${remaining}`,
        !dryRun && remaining > 0
      );
      await loadMonitorStatus();
    } catch (error) {
      setStatus(
        els.monitorPanelStatus,
        error.message || 'Kunde inte köra owner-MFA-åtgärd.',
        true
      );
    }
  }

  async function loadStateManifest() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Laddar state manifest...');
      const response = await api('/ops/state/manifest');
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const count = Array.isArray(response?.stores) ? response.stores.length : 0;
      setStatus(els.opsStatus, `State manifest klart (stores: ${count}).`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte läsa state manifest.', true);
    }
  }

  function getRestoreFileName() {
    return String(els.restoreBackupFileInput?.value || '').trim();
  }

  async function createStateBackup() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Skapar backup...');
      const response = await api('/ops/state/backup', {
        method: 'POST',
        body: {},
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const fileName = response?.backup?.fileName || '-';
      if (els.restoreBackupFileInput && response?.backup?.fileName) {
        els.restoreBackupFileInput.value = response.backup.fileName;
      }
      setStatus(els.opsStatus, `Backup skapad: ${fileName}`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte skapa backup.', true);
    }
  }

  async function listStateBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Laddar backups...');
      const response = await api('/ops/state/backups?limit=20');
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const latestFile = response?.backups?.[0]?.fileName || '';
      if (els.restoreBackupFileInput && latestFile) {
        els.restoreBackupFileInput.value = latestFile;
      }
      setStatus(els.opsStatus, `Backups: ${response?.count ?? 0}`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte läsa backups.', true);
    }
  }

  async function previewPruneBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Kör förhandsvisning av rensning...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: true },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Förhandsvisning klar: ${response?.deletedCount ?? 0} filer skulle tas bort.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra förhandsvisning av rensning.', true);
    }
  }

  async function runPruneBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const confirmResult = await openAppModal({
        title: 'Rensa säkerhetskopior',
        message: 'Kör rensning på backup-katalogen enligt retention-reglerna?',
        confirmLabel: 'Kör rensning',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.opsStatus, 'Rensning avbruten.');
        return;
      }
      setStatus(els.opsStatus, 'Kör rensning...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: false },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Rensning klar: ${response?.deletedCount ?? 0} filer borttagna.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte pruna backups.', true);
    }
  }

  async function listSchedulerReports() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Laddar scheduler-rapporter...');
      const response = await api('/ops/reports?limit=20');
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(els.opsStatus, `Scheduler-rapporter: ${response?.count ?? 0}`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte läsa scheduler-rapporter.', true);
    }
  }

  async function previewPruneSchedulerReports() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Kör förhandsvisning av rapport-rensning...');
      const response = await api('/ops/reports/prune', {
        method: 'POST',
        body: { dryRun: true },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Förhandsvisning av rapport-rensning klar: ${response?.deletedCount ?? 0} filer skulle tas bort.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra förhandsvisning av rapport-rensning.', true);
    }
  }

  async function runPruneSchedulerReports() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const confirmResult = await openAppModal({
        title: 'Rensa scheduler-rapporter',
        message: 'Kör rensning på scheduler-genererade pilotrapporter enligt retention-reglerna?',
        confirmLabel: 'Kör rensning',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.opsStatus, 'Rapport-rensning avbruten.');
        return;
      }
      setStatus(els.opsStatus, 'Kör rapport-rensning...');
      const response = await api('/ops/reports/prune', {
        method: 'POST',
        body: { dryRun: false },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Rapport-rensning klar: ${response?.deletedCount ?? 0} filer borttagna.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra rapport-rensning.', true);
    }
  }

  async function previewStateRestore() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const fileName = getRestoreFileName();
      if (!fileName) throw new Error('Ange backupfil att förhandsgranska.');
      setStatus(els.opsStatus, `Läser förhandsvisning av återställning för ${fileName}...`);
      const response = await api('/ops/state/restore', {
        method: 'POST',
        body: {
          fileName,
          dryRun: true,
        },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const restoreCount = Array.isArray(response?.preview?.stores)
        ? response.preview.stores.filter((store) => store?.willRestore).length
        : 0;
      setStatus(els.opsStatus, `Förhandsvisning klar: ${restoreCount} stores kan återställas.`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra förhandsvisning av återställning.', true);
    }
  }

  async function runStateRestore() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const fileName = getRestoreFileName();
      if (!fileName) throw new Error('Ange backupfil att återställa.');
      const expectedConfirm = `RESTORE ${fileName}`;
      const confirmResult = await openAppModal({
        title: 'Restore state',
        message: `Detta skriver över state-filerna.\nSkriv exakt för att fortsätta:`,
        inputMode: 'text',
        inputLabel: 'Bekräftelse',
        inputPlaceholder: expectedConfirm,
        defaultValue: '',
        requiredExact: expectedConfirm,
        hint: `Kräver exakt text: ${expectedConfirm}`,
        confirmLabel: 'Återställ',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.opsStatus, 'Restore avbruten.');
        return;
      }

      setStatus(els.opsStatus, `Återställer state från ${fileName}...`);
      const response = await api('/ops/state/restore', {
        method: 'POST',
        body: {
          fileName,
          dryRun: false,
          confirmText: expectedConfirm,
        },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const restoredCount = Array.isArray(response?.restore?.stores)
        ? response.restore.stores.filter((store) => store?.restored).length
        : 0;
      setStatus(els.opsStatus, `Restore klart: ${restoredCount} stores återställda.`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte återställa backup.', true);
    }
  }

  function renderTenantCatalog(tenants = []) {
    if (!els.tenantCatalog) return;
    if (!Array.isArray(tenants) || tenants.length === 0) {
      els.tenantCatalog.textContent = 'Inga tenants hittades.';
      return;
    }

    const rows = tenants.map((tenant) => {
      const tenantId = tenant?.tenantId || '-';
      const role = tenant?.role || '-';
      const assistantName = tenant?.config?.assistantName || '-';
      const toneStyle = tenant?.config?.toneStyle || '-';
      const brandProfile = tenant?.config?.brandProfile || '-';
      const riskModifier = tenant?.config?.riskSensitivityModifier ?? 0;
      return `${tenantId} | role=${role} | assistant=${assistantName} | tone=${toneStyle} | brand=${brandProfile} | riskModifier=${riskModifier}`;
    });
    els.tenantCatalog.textContent = rows.join('\n');
  }

  async function loadTenants() {
    const response = await api('/tenants/my');
    const tenants = Array.isArray(response?.tenants) ? response.tenants : [];
    state.availableTenants = tenants;
    renderTenantSwitchOptions();
    setSessionMeta();
    updateLifecyclePermissions();
    renderTenantCatalog(tenants);
    return tenants;
  }

  function getRiskFilterQuery() {
    const filters = readRiskFiltersFromInputs();
    const params = new URLSearchParams();
    params.set('minRiskLevel', String(filters.minRiskLevel));
    params.set('maxRiskLevel', String(filters.maxRiskLevel));
    params.set('limit', '100');
    if (filters.ownerDecision) params.set('ownerDecision', filters.ownerDecision);
    if (filters.decision) params.set('decision', filters.decision);
    if (filters.category) params.set('category', filters.category);
    if (filters.state) params.set('state', filters.state);
    if (filters.reasonCode) params.set('reasonCode', filters.reasonCode);
    if (filters.search) params.set('search', filters.search);
    if (Number.isFinite(filters.sinceDays) && Number(filters.sinceDays) > 0) {
      params.set('sinceDays', String(filters.sinceDays));
    }
    return params.toString();
  }

  function getIncidentStatusHint(filters = {}) {
    const ownerDecision = String(filters?.ownerDecision || '')
      .trim()
      .toLowerCase();
    const stateFilter = String(filters?.state || '')
      .trim()
      .toLowerCase();

    if (ownerDecision === 'pending' || ownerDecision === 'revision_requested') return 'open';
    if (ownerDecision === 'escalated') return 'escalated';
    if (ownerDecision === 'approved_exception' || ownerDecision === 'false_positive') return 'resolved';
    if (stateFilter === 'open') return 'open';
    return 'all';
  }

  function getIncidentSeverityHint(filters = {}) {
    const minRiskLevel = Number(filters?.minRiskLevel || 1);
    const maxRiskLevel = Number(filters?.maxRiskLevel || 5);

    if (maxRiskLevel < 4) return 'none';
    if (minRiskLevel >= 5) return 'L5';
    if (maxRiskLevel <= 4) return 'L4';
    return '';
  }

  function getIncidentFilterQuery(filters = {}) {
    const params = new URLSearchParams();
    params.set('limit', '200');
    params.set('status', getIncidentStatusHint(filters));

    const severity = getIncidentSeverityHint(filters);
    if (severity === 'L4' || severity === 'L5') params.set('severity', severity);

    if (Number.isFinite(filters?.sinceDays) && Number(filters.sinceDays) > 0) {
      params.set('sinceDays', String(filters.sinceDays));
    }
    if (filters?.search) params.set('search', String(filters.search).trim());
    return params.toString();
  }

  function toIncidentRiskRow(incident) {
    if (!incident || typeof incident !== 'object') return null;
    const sourceEvaluationId = String(incident.sourceEvaluationId || '').trim();
    const incidentId = String(incident.id || '').trim();
    const rowId = sourceEvaluationId || incidentId;
    if (!rowId) return null;

    const severity = String(incident.severity || '').trim().toUpperCase();
    const riskLevel = Number(
      incident.riskLevel !== undefined
        ? incident.riskLevel
        : severity === 'L5'
        ? 5
        : 4
    );

    return {
      id: rowId,
      incidentId: incidentId || rowId,
      sourceEvaluationId: sourceEvaluationId || rowId,
      templateId: incident.templateId || '',
      templateVersionId: incident.templateVersionId || '',
      category: incident.category || '',
      riskLevel: Number.isFinite(riskLevel) ? riskLevel : 4,
      decision: incident.decision || 'blocked',
      ownerDecision: incident.ownerDecision || 'pending',
      reasonCodes: Array.isArray(incident.reasonCodes) ? incident.reasonCodes : [],
      ownerActions: [],
      ownerActionsCount: Number(incident.ownerActionsCount || 0),
      evaluatedAt: incident.openedAt || incident.updatedAt || null,
      updatedAt: incident.updatedAt || incident.openedAt || null,
      incidentStatus: incident.status || '',
      incidentSeverity: severity || '',
      incidentSla: incident.sla && typeof incident.sla === 'object' ? incident.sla : null,
    };
  }

  function normalizeIncidentRowsForRiskTable(rawIncidents, filters = {}) {
    const source = Array.isArray(rawIncidents) ? rawIncidents : [];
    const minRiskLevel = Math.max(1, Math.min(5, Number(filters?.minRiskLevel || 1)));
    const maxRiskLevel = Math.max(minRiskLevel, Math.min(5, Number(filters?.maxRiskLevel || 5)));
    const ownerDecisionFilter = String(filters?.ownerDecision || '')
      .trim()
      .toLowerCase();
    const decisionFilter = String(filters?.decision || '')
      .trim()
      .toLowerCase();
    const categoryFilter = String(filters?.category || '')
      .trim()
      .toUpperCase();
    const stateFilter = String(filters?.state || '')
      .trim()
      .toLowerCase();
    const reasonCodeFilter = String(filters?.reasonCode || '')
      .trim()
      .toLowerCase();
    const searchFilter = String(filters?.search || '')
      .trim()
      .toLowerCase();

    const rows = [];
    for (const incident of source) {
      const row = toIncidentRiskRow(incident);
      if (!row) continue;

      if (row.riskLevel < 4) continue;
      if (row.riskLevel < minRiskLevel || row.riskLevel > maxRiskLevel) continue;

      const normalizedOwnerDecision = String(row.ownerDecision || '').trim().toLowerCase();
      if (ownerDecisionFilter && normalizedOwnerDecision !== ownerDecisionFilter) continue;

      const normalizedDecision = String(row.decision || '').trim().toLowerCase();
      if (decisionFilter && normalizedDecision !== decisionFilter) continue;

      const normalizedCategory = String(row.category || '').trim().toUpperCase();
      if (categoryFilter && normalizedCategory !== categoryFilter) continue;

      const normalizedIncidentStatus = String(row.incidentStatus || '').trim().toLowerCase();
      if (stateFilter === 'open' && normalizedIncidentStatus !== 'open') continue;
      if (stateFilter === 'closed' && normalizedIncidentStatus === 'open') continue;

      if (reasonCodeFilter) {
        const hasReasonCode = (Array.isArray(row.reasonCodes) ? row.reasonCodes : []).some((code) =>
          String(code || '').toLowerCase().includes(reasonCodeFilter)
        );
        if (!hasReasonCode) continue;
      }

      if (searchFilter) {
        const haystack = [
          row.id,
          row.incidentId,
          row.sourceEvaluationId,
          row.templateId,
          row.templateVersionId,
          row.category,
          row.decision,
          row.ownerDecision,
          row.incidentStatus,
          row.incidentSeverity,
          ...(Array.isArray(row.reasonCodes) ? row.reasonCodes : []),
        ]
          .map((part) => String(part || '').toLowerCase())
          .join(' ');
        if (!haystack.includes(searchFilter)) continue;
      }

      rows.push(row);
    }

    return rows;
  }

  async function loadDashboard() {
    const riskQuery = getRiskFilterQuery();
    const incidentQuery = getIncidentFilterQuery(state.riskFilters);
    const [dashboard, riskEvaluations, incidents, tenantConfig] = await Promise.all([
      api('/dashboard/owner?minRiskLevel=1&auditLimit=30'),
      api(`/risk/evaluations?${riskQuery}`),
      api(`/incidents?${incidentQuery}`),
      api('/tenant-config'),
    ]);

    state.tenantId = dashboard.tenantId || state.tenantId;
    const incidentSummary = dashboard?.incidents?.summary || null;
    const incidentOpen = Array.isArray(dashboard?.incidents?.open)
      ? dashboard.incidents.open
      : [];

    setText(els.templatesTotal, dashboard?.templates?.total ?? 0);
    setText(els.templatesActive, dashboard?.templates?.withActiveVersion ?? 0);
    setText(els.riskTotal, dashboard?.riskSummary?.totals?.evaluations ?? 0);
    setText(
      els.riskOpen,
      incidentSummary?.totals?.openUnresolved ?? dashboard?.riskSummary?.totals?.highCriticalOpen ?? 0
    );
    renderOwnerCoverageKpi(dashboard?.riskSummary || {});
    renderSlaIndicatorKpi(incidentOpen.length ? incidentOpen : dashboard?.riskSummary?.highCriticalOpen || []);
    renderLatestActivity(dashboard?.recentAuditEvents || []);
    renderRiskTrendBars(dashboard?.riskSummary || {});
    renderOverviewNotifications({
      templates: dashboard?.templates || {},
      riskSummary: dashboard?.riskSummary || {},
      recentAuditEvents: dashboard?.recentAuditEvents || [],
    });

    const categoryBadges = Object.entries(dashboard?.templates?.byCategory || {}).map(([label, value]) => ({
      label,
      value,
      dot: 'ok',
    }));
    renderBadges(els.categoryBadges, categoryBadges);

    const riskBadges = Object.entries(dashboard?.riskSummary?.byLevel || {}).map(([level, count]) => ({
      label: `L${level}`,
      value: count,
      dot: dotClassForRiskLevel(level),
    }));
    renderBadges(els.riskBadges, riskBadges);

    const riskRows = Array.isArray(riskEvaluations?.evaluations) ? riskEvaluations.evaluations : [];
    const reviewRows = riskRows.filter((item) => Number(item?.riskLevel || 0) === 3);
    const incidentRows = normalizeIncidentRowsForRiskTable(incidents?.incidents || [], state.riskFilters);
    renderRiskTable(reviewRows, incidentRows);
    fillTenantConfig(tenantConfig?.config || {});
    setStatus(els.tenantConfigStatus, '');
    await Promise.all([
      loadIncidentIntelligence({ quiet: true }),
      loadDailyBrief({ quiet: true }),
      loadCcoInboxBrief({ quiet: true }),
      loadWritingIdentityProfiles({ quiet: true }),
    ]);
  }

  function resolveRefreshScope() {
    return state.activeSectionGroup === 'ccoWorkspaceSection' ? 'cco' : 'all';
  }

  function createCcoEvidenceInboxOutput() {
    const now = Date.now();
    const mailboxes = [
      'contact@hairtpclinic.com',
      'egzona@hairtpclinic.com',
      'fazli@hairtpclinic.com',
      'info@hairtpclinic.com',
      'kons@hairtpclinic.com',
      'marknad@hairtpclinic.com',
    ];
    const indicatorStates = ['critical', 'high', 'medium', 'new', 'handled'];
    const conversationWorklist = Array.from({ length: 5 }, (_unused, index) => {
      const mailbox = mailboxes[index % mailboxes.length];
      const conversationId = `evidence-conv-${index + 1}`;
      const inboundAt = new Date(now - (index + 1) * 60 * 60 * 1000).toISOString();
      const outboundAt =
        index % 2 === 0
          ? new Date(now - (index + 2) * 60 * 60 * 1000).toISOString()
          : '';
      const priorityByIndex = ['Critical', 'High', 'Medium', 'Low', 'Low'];
      const slaByIndex = ['breach', 'warning', 'warning', 'safe', 'safe'];
      const needsReplyByIndex = ['awaiting_reply', 'awaiting_reply', 'follow_up_pending', 'new', 'handled'];
      const dominantRiskByIndex = ['miss', 'tone', 'follow_up', 'relationship', 'neutral'];
      return {
        conversationId,
        messageId: `evidence-message-${index + 1}`,
        mailboxId: mailbox,
        mailboxAddress: mailbox,
        userPrincipalName: mailbox,
        subject: `Evidensrad ${index + 1} · Maskerad tråd`,
        sender: `Kund ${index + 1}`,
        senderEmail: `kund${index + 1}@example.invalid`,
        latestInboundPreview: `Detta är maskad dummytext för evidensläge (${index + 1}/5).`,
        hoursSinceInbound: index + 1,
        lastInboundAt: inboundAt,
        lastOutboundAt: outboundAt,
        slaStatus: slaByIndex[index],
        hoursRemaining: index === 0 ? -2 : Math.max(1, 12 - index * 2),
        slaThreshold: index === 0 ? 6 : 24,
        isUnanswered: index !== 4,
        stagnated: index === 2,
        followUpSuggested: index === 2 || index === 3,
        intent: ['complaint', 'booking_request', 'follow_up', 'pricing_question', 'follow_up'][index],
        intentConfidence: 0.88 - index * 0.05,
        tone: ['frustrated', 'anxious', 'neutral', 'positive', 'neutral'][index],
        toneConfidence: 0.77 - index * 0.04,
        priorityLevel: priorityByIndex[index],
        priorityScore: 95 - index * 12,
        priorityReasons: ['Evidensläge: maskad prioriteringssignal'],
        customerKey: `evidence-customer-${index + 1}`,
        customerSummary: {
          customerKey: `evidence-customer-${index + 1}`,
          customerName: `Kund ${index + 1}`,
          lifecycleStatus: ['new', 'returning', 'active_dialogue', 'returning', 'active_dialogue'][index],
          lifecycleSource: 'auto',
          interactionCount: 1 + index,
          engagementScore: Math.max(0.1, 0.75 - index * 0.1),
          caseCount: 1 + index,
          daysSinceLastInteraction: index,
          lastInteractionAt: inboundAt,
          lastCaseSummary: `Maskerad sammanfattning ${index + 1}`,
          timeline: [
            {
              occurredAt: inboundAt,
              subject: `Evidenshistorik ${index + 1}`,
              status: 'active_dialogue',
            },
          ],
        },
        lifecycleStatus: ['new', 'returning', 'active_dialogue', 'returning', 'active_dialogue'][index],
        tempoProfile: ['steady', 'rapid', 'reflective', 'steady', 'reflective'][index],
        recommendedFollowUpDelayDays: [0, 1, 2, 3, 5][index],
        ctaIntensity: ['high', 'normal', 'normal', 'low', 'low'][index],
        followUpSuggestedAt:
          index === 2 ? new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString() : '',
        followUpTimingReason: index === 2 ? ['follow_up_due'] : [],
        confidenceLevel: ['High', 'High', 'Medium', 'Medium', 'Low'][index],
        recommendedAction: [
          'Svara direkt – risk för missat ärende',
          'Svara lugnande inom 1h',
          'Skicka mjuk uppföljning idag',
          'Svara personligt för att stärka relationen',
          'Markera som hanterad',
        ][index],
        needsReplyStatus: needsReplyByIndex[index],
        dominantRisk: dominantRiskByIndex[index],
        relationshipStatus: ['new', 'returning', 'active', 'returning', 'active'][index],
        indicatorState: indicatorStates[index],
        isNewSinceLastVisit: index === 3,
        hasNewInboundSinceHandled: index === 3,
        escalationRequired: index === 0,
      };
    });

    const inboundFeed = Array.from({ length: 10 }, (_unused, index) => {
      const mailbox = mailboxes[index % mailboxes.length];
      const conversationId = `evidence-conv-${(index % 5) + 1}`;
      return {
        feedId: `evidence-inbound-${index + 1}`,
        conversationId,
        messageId: `evidence-inbound-message-${index + 1}`,
        direction: 'inbound',
        subject: `Inkommande ${index + 1} · Maskerad`,
        counterpart: `avsändare${index + 1}@example.invalid`,
        mailboxAddress: mailbox,
        sentAt: new Date(now - (index + 1) * 35 * 60 * 1000).toISOString(),
        preview: `Maskad inbound preview ${index + 1}.`,
      };
    });

    const outboundFeed = Array.from({ length: 10 }, (_unused, index) => {
      const mailbox = mailboxes[index % mailboxes.length];
      const conversationId = `evidence-conv-${(index % 5) + 1}`;
      return {
        feedId: `evidence-outbound-${index + 1}`,
        conversationId,
        messageId: `evidence-outbound-message-${index + 1}`,
        direction: 'outbound',
        subject: `Skickat ${index + 1} · Maskerad`,
        counterpart: `Till mottagare${index + 1}@example.invalid`,
        mailboxAddress: mailbox,
        sentAt: new Date(now - (index + 1) * 28 * 60 * 1000).toISOString(),
        preview: `Maskad outbound preview ${index + 1}.`,
      };
    });

    return {
      data: {
        generatedAt: new Date(now).toISOString(),
        priorityLevel: 'High',
        slaBreaches: conversationWorklist.filter((row) => row.slaStatus === 'breach'),
        riskFlags: conversationWorklist.slice(0, 3).map((row) => ({
          conversationId: row.conversationId,
          reason: 'Evidensläge',
        })),
        conversationWorklist,
        needsReplyToday: conversationWorklist.filter((row) => row.isUnanswered === true),
        suggestedDrafts: conversationWorklist.slice(0, 3),
        customerSummaries: conversationWorklist.map((row) => row.customerSummary),
        inboxSummary:
          'Evidensläge aktivt: maskad data för UI-verifiering (5 trådar, 10 inkomna, 10 skickat).',
        inboxStatus: 'Behöver uppmärksamhet',
        inboundFeed,
        outboundFeed,
        metadata: {
          evidenceMode: true,
        },
      },
      metadata: {
        generatedAt: new Date(now).toISOString(),
        ccoDefaultSenderMailbox: 'contact@hairtpclinic.com',
        ccoDefaultSignatureProfile: 'egzona',
        sourceMailboxIds: mailboxes,
        mailboxCount: mailboxes.length,
        messageCount: conversationWorklist.length,
      },
    };
  }

  async function refreshAll({ scope = 'all' } = {}) {
    const normalizedScope = String(scope || '').trim().toLowerCase() === 'cco' ? 'cco' : 'all';
    await loadSessionProfile();
    await loadTenants();
    if (normalizedScope === 'cco') {
      if (canTemplateWrite()) {
        await runCcoInboxBrief({ quiet: true, forceLoading: true });
      } else {
        await loadCcoInboxBrief({ quiet: true });
      }
      return;
    }
    await loadDashboard();
    await loadOrchestratorMeta();
    await loadStaffMembers();
    await loadSessionsPanel();
    await loadTemplates({ preserveSelection: true });
    await loadAuditEvents();
    await loadMailInsights();
    await loadMonitorStatus();
    if (isOwner()) {
      await loadStateManifest();
    } else if (els.opsResult) {
      els.opsResult.textContent = 'Endast OWNER.';
      setStatus(els.opsStatus, '');
      if (els.restoreBackupFileInput) els.restoreBackupFileInput.value = '';
    }
    ensureDashboardStreamConnected();
  }

  function applyAuthContext({ token, membership, memberships }) {
    if (typeof token === 'string' && token) {
      state.token = token;
      localStorage.setItem(TOKEN_KEY, state.token);
    }
    if (membership?.role) state.role = membership.role;
    if (membership?.tenantId) state.tenantId = membership.tenantId;

    const list = Array.isArray(memberships) ? memberships.filter((item) => item?.tenantId) : [];
    state.availableTenants = list.length ? list : membership?.tenantId ? [membership] : [];
    renderTenantSwitchOptions();
    setSessionMeta();
    updateLifecyclePermissions();
  }

  async function handleLogin() {
    try {
      setStatus(els.loginStatus, 'Loggar in...');
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      state.pendingLoginTicket = '';
      clearPendingMfa();
      const response = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: els.emailInput.value.trim(),
          password: els.passwordInput.value,
          tenantId: (els.tenantInput.value || '').trim(),
        },
      });

      if (response?.requiresMfa) {
        const mfaTicket = String(response?.mfaTicket || '').trim();
        if (!mfaTicket) {
          throw new Error('mfaTicket saknas för MFA-verifiering.');
        }
        state.pendingMfaTicket = mfaTicket;
        const promptedCode = window.prompt('MFA krävs. Ange 6-siffrig kod för att fortsätta.', '');
        const normalizedCode = String(promptedCode || '').trim();
        if (!normalizedCode) {
          throw new Error('MFA-kod krävs för att fortsätta.');
        }
        await verifyMfa(normalizedCode);
        updateLifecyclePermissions();
        return;
      }

      if (response?.requiresTenantSelection) {
        state.pendingLoginTicket = response.loginTicket || '';
        renderPendingTenantSelection(response.tenants || []);
        if (!state.pendingLoginTicket) {
          throw new Error('loginTicket saknas för tenant-val.');
        }
        setStatus(els.loginStatus, 'Välj tenant för att slutföra inloggning.');
        updateLifecyclePermissions();
        return;
      }

      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships: response?.memberships || (response?.membership ? [response.membership] : []),
      });

      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll({ scope: resolveRefreshScope() });
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Inloggning misslyckades.', true);
    }
  }

  async function verifyMfa(codeOverride = '') {
    try {
      const mfaTicket = String(state.pendingMfaTicket || '').trim();
      const code = String(codeOverride || '').trim();
      if (!mfaTicket || !code) {
        throw new Error('Ange MFA-kod först.');
      }
      setStatus(els.loginStatus, 'Verifierar MFA...');
      const response = await api('/auth/mfa/verify', {
        method: 'POST',
        auth: false,
        body: {
          mfaTicket,
          code,
          tenantId: (els.tenantInput.value || '').trim(),
        },
      });

      if (response?.requiresTenantSelection) {
        state.pendingLoginTicket = response.loginTicket || '';
        clearPendingMfa();
        renderPendingTenantSelection(response.tenants || []);
        if (!state.pendingLoginTicket) {
          throw new Error('loginTicket saknas för tenant-val.');
        }
        setStatus(els.loginStatus, 'Välj tenant för att slutföra inloggning.');
        updateLifecyclePermissions();
        return;
      }

      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships: response?.memberships || (response?.membership ? [response.membership] : []),
      });

      clearPendingMfa();
      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll({ scope: resolveRefreshScope() });
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'MFA-verifiering misslyckades.', true);
    }
  }

  async function completeTenantSelection() {
    try {
      const loginTicket = String(state.pendingLoginTicket || '').trim();
      const tenantId = String(els.tenantSelectionSelect?.value || '').trim();
      if (!loginTicket || !tenantId) {
        throw new Error('Välj tenant först.');
      }
      setStatus(els.loginStatus, 'Slutför tenant-val...');
      const response = await api('/auth/select-tenant', {
        method: 'POST',
        auth: false,
        body: { loginTicket, tenantId },
      });
      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships: response?.memberships || (response?.membership ? [response.membership] : []),
      });
      state.pendingLoginTicket = '';
      clearPendingMfa();
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll({ scope: resolveRefreshScope() });
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Tenant-val misslyckades.', true);
    }
  }

  async function switchTenant() {
    try {
      const targetTenantId = String(els.tenantSwitchSelect?.value || '').trim();
      if (!targetTenantId) throw new Error('Välj tenant att byta till.');
      if (targetTenantId === state.tenantId) {
        setSessionMeta();
        return;
      }

      stopDashboardStream({ resetRetry: false });
      setStatus(els.loginStatus, 'Byter tenant...');
      const response = await api('/auth/switch-tenant', {
        method: 'POST',
        body: { tenantId: targetTenantId },
      });
      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships:
          response?.memberships ||
          (Array.isArray(state.availableTenants) && state.availableTenants.length
            ? state.availableTenants
            : response?.membership
            ? [response.membership]
            : []),
      });
      setStatus(els.loginStatus, `Bytte tenant till ${state.tenantId}.`);
      await refreshAll({ scope: resolveRefreshScope() });
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Kunde inte byta tenant.', true);
      renderTenantSwitchOptions();
    }
  }

  async function restoreSession() {
    if (state.ccoEvidenceMode === true) {
      stopDashboardStream();
      clearCcoAutoRefreshTimer();
      state.token = '';
      state.role = 'OWNER';
      state.tenantId = 'hair-tp-clinic';
      state.availableTenants = [
        {
          tenantId: 'hair-tp-clinic',
          role: 'OWNER',
          config: {
            assistantName: 'Arcana (Evidensläge)',
          },
        },
      ];
      renderTenantSwitchOptions();
      setSessionMeta();
      updateLifecyclePermissions();
      setAuthVisible(true);
      setStatus(els.loginStatus, 'Evidensläge aktivt (ingen inloggning krävs).');
      await runCcoInboxBrief({ quiet: true });
      return;
    }
    if (!state.token) {
      stopDashboardStream();
      setAuthVisible(false);
      state.availableTenants = [];
      state.writingIdentityProfiles = [];
      state.selectedWritingIdentityMailbox = '';
      fillWritingIdentityForm(null);
      renderWritingIdentityProfiles();
      renderTenantSwitchOptions();
      setSessionMeta();
      updateLifecyclePermissions();
      return;
    }
    try {
      const me = await api('/auth/me');
      applyAuthContext({
        membership: me?.membership || null,
        memberships: me?.memberships || (me?.membership ? [me.membership] : []),
      });
      setAuthVisible(true);
      await refreshAll({ scope: resolveRefreshScope() });
    } catch {
      stopDashboardStream();
      localStorage.removeItem(TOKEN_KEY);
      state.token = '';
      state.role = '';
      state.tenantId = '';
      state.availableTenants = [];
      state.writingIdentityProfiles = [];
      state.selectedWritingIdentityMailbox = '';
      fillWritingIdentityForm(null);
      renderWritingIdentityProfiles();
      setAuthVisible(false);
      renderTenantSwitchOptions();
      setSessionMeta();
      updateLifecyclePermissions();
    }
  }

  async function saveTenantConfig() {
    try {
      setStatus(els.tenantConfigStatus, 'Sparar...');
      const allowlistOverrides = parseJsonObjectInput(
        els.templateAllowlistOverrides?.value,
        'templateVariableAllowlistByCategory'
      );
      const requiredOverrides = parseJsonObjectInput(
        els.templateRequiredOverrides?.value,
        'templateRequiredVariablesByCategory'
      );
      const body = {
        assistantName: els.assistantName.value.trim(),
        toneStyle: els.toneStyle.value.trim(),
        brandProfile: els.brandProfile.value.trim(),
        brandLogoUrl: String(els.brandLogoUrl?.value || '').trim(),
        brandPrimaryColor: normalizeBrandColorForUi(
          els.brandPrimaryColor?.value,
          BRAND_PRIMARY_COLORS,
          DEFAULT_BRAND_PRIMARY_COLOR
        ),
        brandAccentColor: normalizeBrandColorForUi(
          els.brandAccentColor?.value,
          BRAND_ACCENT_COLORS,
          DEFAULT_BRAND_ACCENT_COLOR
        ),
        riskSensitivityModifier: normalizeRiskModifier(els.riskModifier.value),
        templateVariableAllowlistByCategory: allowlistOverrides,
        templateRequiredVariablesByCategory: requiredOverrides,
        templateSignaturesByChannel: {
          email: String(els.templateEmailSignature?.value || '').trim(),
        },
        publicSite: buildPublicSitePayloadFromInputs(),
      };
      await api('/tenant-config', {
        method: 'PATCH',
        body,
      });
      setStatus(els.tenantConfigStatus, 'Sparad.');
      await loadDashboard();
    } catch (error) {
      setStatus(els.tenantConfigStatus, error.message || 'Kunde inte spara config.', true);
    }
  }

  async function onboardTenant() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan onboarda tenant.');
      const tenantId = String(els.onboardTenantId?.value || '').trim().toLowerCase();
      if (!tenantId) throw new Error('Ange tenantId.');

      const body = { tenantId };
      const ownerEmail = String(els.onboardOwnerEmail?.value || '').trim();
      const ownerPassword = String(els.onboardOwnerPassword?.value || '');
      const assistantName = String(els.onboardAssistantName?.value || '').trim();
      const toneStyle = String(els.onboardToneStyle?.value || '').trim();
      const brandProfile = String(els.onboardBrandProfile?.value || '').trim();
      const riskModifierRaw = String(els.onboardRiskModifier?.value || '').trim();

      if (ownerEmail) body.ownerEmail = ownerEmail;
      if (ownerPassword) body.ownerPassword = ownerPassword;
      if (assistantName) body.assistantName = assistantName;
      if (toneStyle) body.toneStyle = toneStyle;
      if (brandProfile) body.brandProfile = brandProfile;
      if (riskModifierRaw) body.riskSensitivityModifier = Number(riskModifierRaw);

      setStatus(els.tenantOnboardStatus, 'Onboardar tenant...');
      const response = await api('/tenants/onboard', {
        method: 'POST',
        body,
      });
      const onboardedTenantId = response?.tenant?.tenantId || tenantId;
      setStatus(els.tenantOnboardStatus, `Tenant onboardad: ${onboardedTenantId}`);

      if (els.onboardOwnerPassword) els.onboardOwnerPassword.value = '';
      await loadTenants();
      if (els.tenantSwitchSelect) {
        els.tenantSwitchSelect.value = onboardedTenantId;
      }
    } catch (error) {
      setStatus(els.tenantOnboardStatus, error.message || 'Kunde inte onboarda tenant.', true);
    }
  }

  function logout() {
    stopDashboardStream();
    clearCcoAutoRefreshTimer();
    state.ccoLastSeenAtMs = Date.now();
    persistCcoLastSeenAtMs(state.ccoLastSeenAtMs);
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
    state.role = '';
    state.tenantId = '';
    state.pendingLoginTicket = '';
    state.availableTenants = [];
    state.templates = [];
    state.versions = [];
    state.sessions = [];
    state.staffMembers = [];
    state.staffFilters = {
      search: '',
      status: '',
    };
    state.filteredStaffMembershipIds = [];
    state.selectedStaffMembershipId = '';
    state.lastInviteMessage = '';
    state.profile = null;
    state.calibrationSuggestion = null;
    state.ccoInboxData = null;
    state.ccoInboxViewMode = 'all';
    state.ccoMailViewMode = 'queue';
    state.ccoInboxMailboxFilter = 'all';
    state.ccoInboxSlaFilter = 'all';
    state.ccoInboxLifecycleFilter = 'all';
    state.ccoInboxSearchQuery = '';
    state.ccoInboxShowSystemMessages = false;
    state.ccoMailboxFiltersExpanded = true;
    state.ccoExtraFiltersExpanded = false;
    state.ccoWorkspaceCompact = true;
    state.ccoCenterReadTab = 'conversation';
    state.ccoSelectedConversationId = '';
    state.ccoDraftOverrideByConversationId = {};
    state.ccoDraftModeByConversationId = {};
    state.ccoSystemMessageByConversationId = {};
    state.ccoIndicatorOverrideByConversationId = {};
    state.ccoSystemMessageSenderPatterns = [];
    state.ccoSystemMessageSubjectPatterns = [];
    state.ccoSelectedMessageContextByConversationId = {};
    state.ccoSelectedFeedMessageId = '';
    state.ccoDraftEvaluationByConversationId = {};
    state.ccoIncludeSignature = true;
    state.ccoSignaturePreviewExpanded = false;
    state.ccoConversationScrollTopByConversationId = {};
    state.ccoSprintActive = false;
    state.ccoSprintQueueIds = [];
    state.ccoSprintCompletedIds = [];
    state.ccoSprintLabelByConversationId = {};
    state.ccoSprintInitialTotal = 0;
    state.ccoSprintId = '';
    state.ccoSprintStartedAtMs = 0;
    state.ccoSprintMetrics = null;
    state.ccoSprintLatestFeedback = null;
    state.ccoCustomerSummaryExpanded = false;
    state.ccoIndicatorContextConversationId = '';
    state.ccoSeenConversationIds = {};
    state.riskEvaluations = [];
    state.selectedRiskEvaluationId = '';
    state.selectedRiskIds = [];
    state.auditEvents = [];
    state.selectedAuditEventId = '';
    state.selectedTemplateId = '';
    state.selectedVersionId = '';
    state.selectedTemplateIds = [];
    state.riskFilters = loadRiskFilters();
    state.auditFilters = loadAuditFilters();
    state.templateListFilters = loadTemplateListFilters();
    try {
      sessionStorage.removeItem(CCO_WORKSPACE_SESSION_KEY);
    } catch {
      // Ignorera sessionStorage-fel
    }
    syncRiskFilterInputs();
    setAuthVisible(false);
    setStatus(els.loginStatus, '');
    setStatus(els.staffStatus, '');
    setStatus(els.sessionsStatus, '');
    setStatus(els.riskLabStatus, '');
    setStatus(els.orchestratorStatus, '');
    setStatus(els.calibrationStatus, '');
    setStatus(els.reportStatus, '');
    setStatus(els.riskActionStatus, '');
    setStatus(els.mailInsightsStatus, '');
    setStatus(els.monitorPanelStatus, '');
    setStatus(els.opsStatus, '');
    setStatus(els.profileStatus, '');
    if (els.staffSearchInput) els.staffSearchInput.value = '';
    if (els.staffStatusFilter) els.staffStatusFilter.value = '';
    if (els.ccoInboxSearchInput) els.ccoInboxSearchInput.value = '';
    if (els.ccoInboxShowSystemToggle) els.ccoInboxShowSystemToggle.checked = false;
    if (els.ccoInboxSearchMeta) els.ccoInboxSearchMeta.textContent = '';
    setStatus(els.tenantOnboardStatus, '');
    if (els.riskLabResult) els.riskLabResult.textContent = 'Ingen förhandsgranskning körd ännu.';
    if (els.orchestratorResult) els.orchestratorResult.textContent = 'Ingen körning ännu.';
    if (els.orchestratorMetaSummary) els.orchestratorMetaSummary.textContent = '';
    if (els.orchestratorMetaResult) {
      els.orchestratorMetaResult.textContent = isEnglishLanguage()
        ? 'No orchestrator roadmap data yet.'
        : 'Ingen orkestreringsfärdplan ännu.';
    }
    if (els.calibrationResult) els.calibrationResult.textContent = 'Inget kalibreringsförslag ännu.';
    if (els.pilotReportResult) els.pilotReportResult.textContent = 'Ingen rapport körd ännu.';
    if (els.mailInsightsResult) els.mailInsightsResult.textContent = 'Ingen mail-data ännu.';
    if (els.monitorResult) els.monitorResult.textContent = 'Ingen monitor-data ännu.';
    setMonitorDetailsVisible(false);
    if (els.monitorObservabilitySummary) els.monitorObservabilitySummary.textContent = '';
    if (els.monitorObservabilityResult) {
      els.monitorObservabilityResult.textContent = isEnglishLanguage()
        ? 'No observability data yet.'
        : 'Ingen observabilitetsdata ännu.';
    }
    if (els.monitorPublicChatBetaSummary) els.monitorPublicChatBetaSummary.textContent = '';
    if (els.monitorPublicChatBetaResult) {
      els.monitorPublicChatBetaResult.textContent = isEnglishLanguage()
        ? 'No patient beta gate data yet.'
        : 'Ingen patient-beta-gate-data ännu.';
    }
    if (els.monitorSchedulerSummary) els.monitorSchedulerSummary.textContent = '';
    if (els.monitorSchedulerResult) {
      els.monitorSchedulerResult.textContent = 'Ingen scheduler-data ännu.';
    }
    if (els.monitorReadinessHistorySummary) els.monitorReadinessHistorySummary.textContent = '';
    if (els.monitorReadinessHistoryResult) {
      els.monitorReadinessHistoryResult.textContent = isEnglishLanguage()
        ? 'No readiness history yet.'
        : 'Ingen beredskapshistorik ännu.';
    }
    if (els.monitorReadinessNoGoSummary) els.monitorReadinessNoGoSummary.textContent = '';
    if (els.monitorReadinessNoGoResult) {
      els.monitorReadinessNoGoResult.textContent = isEnglishLanguage()
        ? 'No active no-go blockers.'
        : 'Inga aktiva No-Go blockeringar.';
    }
    if (els.monitorRemediationSummary) els.monitorRemediationSummary.textContent = '';
    if (els.monitorRemediationResult) {
      els.monitorRemediationResult.textContent = 'Ingen beredskapsåtgärd ännu.';
    }
    if (els.opsResult) els.opsResult.textContent = 'Ingen ops-data ännu.';
    if (els.incidentIntelTimeframeDays) els.incidentIntelTimeframeDays.value = '14';
    if (els.incidentIntelIncludeClosed) els.incidentIntelIncludeClosed.checked = false;
    renderIncidentIntelligence(null);
    setStatus(els.incidentIntelligenceStatus, '');
    if (els.dailyBriefTimeframeDays) els.dailyBriefTimeframeDays.value = '14';
    if (els.dailyBriefMaxTasks) els.dailyBriefMaxTasks.value = '5';
    if (els.dailyBriefIncludeClosed) els.dailyBriefIncludeClosed.checked = false;
    renderDailyBrief(null);
    setStatus(els.dailyBriefStatus, '');
    if (els.ccoInboxMaxDrafts) els.ccoInboxMaxDrafts.value = '5';
    if (els.ccoInboxIncludeClosed) els.ccoInboxIncludeClosed.checked = false;
    renderCcoInbox(null);
    setStatus(els.ccoInboxStatus, '');
    if (els.latestActivityList) {
      els.latestActivityList.innerHTML = '<li class="muted mini">Ingen aktivitet ännu.</li>';
    }
    if (els.riskTrendBars) {
      els.riskTrendBars.innerHTML = '<div class="mini muted">Ingen riskhistorik ännu.</div>';
    }
    if (els.riskTrendMeta) {
      els.riskTrendMeta.textContent = 'Väntar på data.';
    }
    if (els.overviewNotificationsList) {
      els.overviewNotificationsList.innerHTML =
        '<li class="notification-item"><div class="notification-detail">Inga notifieringar ännu.</div></li>';
    }
    setText(els.ownerCoverageValue, '0%');
    setText(els.slaIndicatorValue, '0');
    setKpiMeta(els.ownerCoverageMeta, 'Ingen riskhistorik ännu.');
    setKpiMeta(els.slaIndicatorMeta, 'Inga öppna incidenter.');
    setText(els.readinessBandValue, '-');
    setKpiMeta(els.readinessBandMeta, 'Väntar på monitor-data.');
    setText(els.pilotReportValue, '-');
    setKpiMeta(els.pilotReportMeta, 'Väntar på monitor-data.');
    if (els.riskQueueSummary) els.riskQueueSummary.innerHTML = '';
    renderRiskDetail(null);
    if (els.riskReviewsTableBody) els.riskReviewsTableBody.innerHTML = '';
    if (els.riskIncidentsTableBody) els.riskIncidentsTableBody.innerHTML = '';
    if (els.riskReviewsCount) els.riskReviewsCount.textContent = '';
    if (els.riskIncidentsCount) els.riskIncidentsCount.textContent = '';
    if (els.riskBulkNote) els.riskBulkNote.value = '';
    if (els.riskDetailNoteInput) els.riskDetailNoteInput.value = '';
    if (els.riskBulkAction) els.riskBulkAction.value = 'request_revision';
    if (els.auditSummary) els.auditSummary.innerHTML = '';
    if (els.auditTimeline) {
      els.auditTimeline.innerHTML = '<li class="audit-timeline-item muted mini">Ingen audit-data ännu.</li>';
    }
    renderAuditDetail(null);
    if (els.riskSelectAllReviews) {
      els.riskSelectAllReviews.checked = false;
      els.riskSelectAllReviews.indeterminate = false;
    }
    if (els.riskSelectAllIncidents) {
      els.riskSelectAllIncidents.checked = false;
      els.riskSelectAllIncidents.indeterminate = false;
    }
    if (els.restoreBackupFileInput) els.restoreBackupFileInput.value = '';
    if (els.brandLogoUrl) els.brandLogoUrl.value = '';
    if (els.brandPrimaryColor) els.brandPrimaryColor.value = DEFAULT_BRAND_PRIMARY_COLOR;
    if (els.brandAccentColor) els.brandAccentColor.value = DEFAULT_BRAND_ACCENT_COLOR;
    if (els.templateEmailSignature) els.templateEmailSignature.value = '';
    if (els.templateAllowlistOverrides) els.templateAllowlistOverrides.value = '{}';
    if (els.templateRequiredOverrides) els.templateRequiredOverrides.value = '{}';
    if (els.publicSiteClinicName) els.publicSiteClinicName.value = '';
    if (els.publicSiteCity) els.publicSiteCity.value = '';
    if (els.publicSiteTagline) els.publicSiteTagline.value = '';
    if (els.publicSiteHeroTitle) els.publicSiteHeroTitle.value = '';
    if (els.publicSiteHeroSubtitle) els.publicSiteHeroSubtitle.value = '';
    if (els.publicSitePrimaryCtaLabel) els.publicSitePrimaryCtaLabel.value = '';
    if (els.publicSitePrimaryCtaUrl) els.publicSitePrimaryCtaUrl.value = '';
    if (els.publicSiteSecondaryCtaLabel) els.publicSiteSecondaryCtaLabel.value = '';
    if (els.publicSiteSecondaryCtaUrl) els.publicSiteSecondaryCtaUrl.value = '';
    if (els.publicSiteTrustRating) els.publicSiteTrustRating.value = '0';
    if (els.publicSiteTrustReviewCount) els.publicSiteTrustReviewCount.value = '0';
    if (els.publicSiteTrustSurgeons) els.publicSiteTrustSurgeons.value = '0';
    if (els.publicSiteContactPhone) els.publicSiteContactPhone.value = '';
    if (els.publicSiteContactEmail) els.publicSiteContactEmail.value = '';
    if (els.publicSiteContactAddress) els.publicSiteContactAddress.value = '';
    if (els.publicSiteContactBookingUrl) els.publicSiteContactBookingUrl.value = '';
    if (els.publicSiteThemeAccent) els.publicSiteThemeAccent.value = '';
    if (els.publicSiteThemeAccentSoft) els.publicSiteThemeAccentSoft.value = '';
    if (els.publicSiteThemeCanvasFrom) els.publicSiteThemeCanvasFrom.value = '';
    if (els.publicSiteThemeCanvasTo) els.publicSiteThemeCanvasTo.value = '';
    if (els.publicSiteServicesJson) els.publicSiteServicesJson.value = '[]';
    if (els.templateResultsMeta) els.templateResultsMeta.textContent = '';
    if (els.templateSelectionMeta) els.templateSelectionMeta.textContent = '0 valda';
    if (els.templateBulkStatus) els.templateBulkStatus.textContent = '';
    if (els.templateSelectAll) {
      els.templateSelectAll.checked = false;
      els.templateSelectAll.indeterminate = false;
    }
    if (els.tenantCatalog) els.tenantCatalog.textContent = 'Ingen data ännu.';
    if (els.staffInvitePreview) {
      els.staffInvitePreview.textContent = 'Ingen inbjudningstext ännu.';
    }
    if (els.staffEmailInput) els.staffEmailInput.value = '';
    if (els.staffPasswordInput) els.staffPasswordInput.value = '';
    if (els.currentPasswordInput) els.currentPasswordInput.value = '';
    if (els.newPasswordInput) els.newPasswordInput.value = '';
    renderProfileCard(null);
    renderSelectedStaffProfile();
    renderSessionsTable([], '');
    renderTenantSwitchOptions();
    renderAuditFilterOptions([]);
    syncAuditFilterInputs();
    syncTemplateFilterInputs();
    setSessionMeta();
    updateLifecyclePermissions();
  }

  els.loginBtn?.addEventListener('click', handleLogin);
  els.completeTenantSelectionBtn?.addEventListener('click', completeTenantSelection);
  els.switchTenantBtn?.addEventListener('click', switchTenant);
  els.refreshBtn?.addEventListener('click', () =>
    refreshAll({ scope: resolveRefreshScope() }).catch((error) =>
      alert(error.message || 'Kunde inte uppdatera.')
    )
  );
  els.logoutBtn?.addEventListener('click', logout);
  els.saveTenantConfigBtn?.addEventListener('click', saveTenantConfig);
  els.refreshWritingIdentityBtn?.addEventListener('click', () => {
    const mailbox = normalizeWritingMailbox(els.writingIdentityMailboxFilter?.value || '');
    loadWritingIdentityProfiles({ mailbox }).catch((error) => {
      setStatus(
        els.writingIdentityStatus,
        error.message || 'Kunde inte läsa Writing Identity-profiler.',
        true
      );
    });
  });
  els.autoExtractWritingIdentityBtn?.addEventListener('click', autoExtractWritingIdentityProfiles);
  els.saveWritingIdentityBtn?.addEventListener('click', saveWritingIdentityProfile);
  els.writingIdentityMailboxSelect?.addEventListener('change', () => {
    const mailbox = normalizeWritingMailbox(els.writingIdentityMailboxSelect?.value || '');
    state.selectedWritingIdentityMailbox = mailbox;
    const record = getWritingProfileRecord(mailbox);
    fillWritingIdentityForm(record);
    renderWritingIdentityProfiles();
  });
  els.writingIdentityMailboxFilter?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const mailbox = normalizeWritingMailbox(els.writingIdentityMailboxFilter?.value || '');
    loadWritingIdentityProfiles({ mailbox }).catch((error) => {
      setStatus(
        els.writingIdentityStatus,
        error.message || 'Kunde inte läsa Writing Identity-profiler.',
        true
      );
    });
  });
  [
    els.assistantName,
    els.toneStyle,
    els.brandProfile,
    els.brandLogoUrl,
    els.brandPrimaryColor,
    els.brandAccentColor,
    els.templateEmailSignature,
  ].forEach((input) => {
    input?.addEventListener('input', () => {
      renderTonePreview();
    });
    input?.addEventListener('change', () => {
      renderTonePreview();
    });
  });
  els.riskModifier?.addEventListener('input', () => {
    syncRiskModifierControls('number');
    renderTonePreview();
  });
  els.riskModifierRange?.addEventListener('input', () => {
    syncRiskModifierControls('range');
    renderTonePreview();
  });
  els.tonePresetButtons?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, '.tonePresetBtn');
    if (!button || button.disabled) return;
    const tone = String(button.getAttribute('data-tone') || '').trim();
    if (!tone || !els.toneStyle) return;
    els.toneStyle.value = tone;
    renderTonePreview();
  });
  els.refreshTenantsBtn?.addEventListener('click', () => {
    loadTenants().catch((error) => {
      setStatus(els.tenantOnboardStatus, error.message || 'Kunde inte läsa tenants.', true);
    });
  });
  els.onboardTenantBtn?.addEventListener('click', onboardTenant);
  els.languageSelect?.addEventListener('change', (event) => {
    const nextLanguage = String(event?.target?.value || '').trim().toLowerCase();
    setLanguage(nextLanguage);
    if (state.token) {
      refreshAll({ scope: resolveRefreshScope() }).catch((error) => {
        setStatus(els.loginStatus, error.message || 'Kunde inte uppdatera språkvy.', true);
      });
    }
  });
  els.densityToggleBtn?.addEventListener('click', () => {
    toggleDensityMode();
  });
  els.sectionNav?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, '.sectionNavBtn');
    if (!button) return;
    const targetId = String(button.getAttribute('data-target') || '').trim();
    if (!targetId) return;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    if (targetId === 'ccoWorkspaceSection') {
      state.ccoInboxViewMode = sanitizeCcoViewMode(button.getAttribute('data-cco-view') || 'all');
      if (state.ccoInboxSlaFilter === 'unanswered') {
        state.ccoInboxSlaFilter = 'all';
      }
      persistCcoWorkspaceSessionState();
      setActiveSectionNav(targetId);
      renderCcoInbox(state.ccoInboxData);
    }
    event.preventDefault();
    scrollToSection(targetEl);
  });
  els.openCcoWorkspaceBtn?.addEventListener('click', () => {
    const target = els.ccoWorkspaceSection || document.getElementById('ccoWorkspaceSection');
    if (!target) return;
    scrollToSection(target);
  });

  els.createTemplateBtn?.addEventListener('click', createTemplate);
  els.templateFilterSelect?.addEventListener('change', () => {
    loadTemplates({ preserveSelection: false }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte filtrera mallar.', true);
    });
  });
  els.templateCategoryChips?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-template-category-chip]');
    if (!button) return;
    const category = String(button.getAttribute('data-template-category-chip') || '').trim();
    if (els.templateFilterSelect) {
      els.templateFilterSelect.value = category;
    }
    state.templateListFilters.category = category;
    persistTemplateListFilters();
    syncTemplateCategoryChipSelection();
    loadTemplates({ preserveSelection: false }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte filtrera mallar.', true);
    });
  });
  els.templateStatusFilterSelect?.addEventListener('change', () => {
    loadTemplates({ preserveSelection: false }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte filtrera mallar.', true);
    });
  });
  els.templateSortSelect?.addEventListener('change', () => {
    loadTemplates({ preserveSelection: true }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte sortera mallar.', true);
    });
  });
  els.templateSearchInput?.addEventListener('input', () => {
    readTemplateFilterInputs();
    renderTemplateTable();
  });
  els.templateViewTableBtn?.addEventListener('click', () => {
    setTemplateView('table');
  });
  els.templateViewCardBtn?.addEventListener('click', () => {
    setTemplateView('card');
  });
  els.templateBulkAction?.addEventListener('change', () => {
    updateTemplateBulkControls();
  });
  els.applyTemplateBulkBtn?.addEventListener('click', () => {
    applyTemplateBulkAction();
  });
  els.templateClearSelectionBtn?.addEventListener('click', () => {
    state.selectedTemplateIds = [];
    renderTemplateTable();
    setStatus(els.templateBulkStatus, 'Valda mallar rensade.');
  });
  els.templateSelectAll?.addEventListener('change', () => {
    const { items } = getFilteredTemplates();
    const visibleIds = items.map((item) => String(item?.id || '')).filter(Boolean);
    if (els.templateSelectAll?.checked) {
      state.selectedTemplateIds = [...new Set([...state.selectedTemplateIds, ...visibleIds])];
    } else {
      state.selectedTemplateIds = state.selectedTemplateIds.filter((id) => !visibleIds.includes(id));
    }
    renderTemplateTable();
  });
  els.versionContentInput?.addEventListener('input', () => {
    renderTemplateEditorAssist();
  });
  els.templateVariablePicker?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-template-var]');
    if (!button) return;
    insertTemplateVariable(button.getAttribute('data-template-var'));
  });
  els.appendSignatureBtn?.addEventListener('click', () => {
    appendTemplateSignatureToContent();
  });
  els.revisionFromSelect?.addEventListener('change', () => {
    state.selectedRevisionFrom = parseRevisionNumber(els.revisionFromSelect?.value);
  });
  els.revisionToSelect?.addEventListener('change', () => {
    state.selectedRevisionTo = parseRevisionNumber(els.revisionToSelect?.value);
  });
  els.rollbackRevisionSelect?.addEventListener('change', () => {
    state.selectedRollbackRevision = parseRevisionNumber(els.rollbackRevisionSelect?.value);
  });
  els.loadRevisionDiffBtn?.addEventListener('click', loadRevisionDiff);
  els.rollbackRevisionBtn?.addEventListener('click', rollbackRevision);
  els.generateDraftBtn?.addEventListener('click', generateDraft);
  els.saveDraftBtn?.addEventListener('click', saveDraft);
  els.evaluateBtn?.addEventListener('click', evaluateVersion);
  els.activateBtn?.addEventListener('click', activateVersion);
  els.archiveBtn?.addEventListener('click', archiveVersion);
  els.cloneBtn?.addEventListener('click', cloneVersion);
  els.createStaffBtn?.addEventListener('click', createStaffMember);
  els.generateStaffPasswordBtn?.addEventListener('click', async () => {
    if (!isOwner()) return;
    const generated = generateStrongPassword(14);
    if (els.staffPasswordInput) els.staffPasswordInput.value = generated;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generated);
        setStatus(els.staffStatus, 'Lösenord genererat och kopierat till clipboard.');
      } else {
        setStatus(els.staffStatus, 'Lösenord genererat.');
      }
    } catch {
      setStatus(els.staffStatus, 'Lösenord genererat.');
    }
  });
  els.copyInviteMessageBtn?.addEventListener('click', () => {
    copyCurrentInviteMessage();
  });
  els.refreshStaffBtn?.addEventListener('click', () => {
    loadStaffMembers().catch((error) => {
      setStatus(els.staffStatus, error.message || 'Kunde inte läsa staff-lista.', true);
    });
  });
  els.staffSearchInput?.addEventListener('input', () => {
    renderStaffTable(state.staffMembers);
  });
  els.staffStatusFilter?.addEventListener('change', () => {
    renderStaffTable(state.staffMembers);
  });
  els.staffEnableFilteredBtn?.addEventListener('click', () => {
    applyFilteredStaffStatus('active');
  });
  els.staffDisableFilteredBtn?.addEventListener('click', () => {
    applyFilteredStaffStatus('disabled');
  });
  els.resetSelectedStaffPasswordBtn?.addEventListener('click', () => {
    const membershipId = String(state.selectedStaffMembershipId || '').trim();
    if (!membershipId) {
      setStatus(els.staffStatus, 'Välj en medarbetarrad först.');
      return;
    }
    resetStaffPasswordFlow(membershipId);
  });
  els.selectedStaffRoleBtn?.addEventListener('click', () => {
    const membershipId = String(state.selectedStaffMembershipId || '').trim();
    const nextRole = String(els.selectedStaffRoleBtn?.dataset?.role || '').trim().toUpperCase();
    if (!membershipId || !nextRole) {
      setStatus(els.staffStatus, 'Välj en giltig medarbetarrad först.');
      return;
    }
    updateStaffRole(membershipId, nextRole);
  });
  els.copySelectedStaffInviteBtn?.addEventListener('click', () => {
    const member = getStaffMemberByMembershipId(state.selectedStaffMembershipId);
    if (!member) {
      setStatus(els.staffStatus, 'Välj en medarbetarrad först.');
      return;
    }
    copyInviteForMember(member).catch((error) => {
      setStatus(els.staffStatus, error.message || 'Kunde inte kopiera inbjudningstext.', true);
    });
  });
  els.changeOwnPasswordBtn?.addEventListener('click', () => {
    changeOwnPassword();
  });
  els.refreshProfileBtn?.addEventListener('click', () => {
    loadSessionProfile().catch((error) => {
      setStatus(els.profileStatus, error.message || 'Kunde inte ladda profil.', true);
    });
  });
  els.loadSessionsBtn?.addEventListener('click', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.sessionsScopeSelect?.addEventListener('change', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.sessionsIncludeRevoked?.addEventListener('change', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.runRiskPreviewBtn?.addEventListener('click', runRiskPreview);
  els.runOrchestratorBtn?.addEventListener('click', runOrchestrator);
  els.runIncidentIntelligenceBtn?.addEventListener('click', runIncidentIntelligence);
  els.runDailyBriefBtn?.addEventListener('click', runDailyBrief);
  els.runCcoInboxBtn?.addEventListener('click', () => {
    logCcoInteraction('run-cco-inbox-brief-click', {
      source: 'runCcoInboxBtn',
    });
    runCcoInboxBrief();
  });
  els.ccoReplyRefreshBtn?.addEventListener('click', () => {
    runCcoInboxBrief().catch((error) => {
      setStatus(els.ccoInboxStatus, error.message || 'Kunde inte uppdatera inkorgen.', true);
    });
  });
  els.ccoCenterRefreshBtn?.addEventListener('click', () => {
    runCcoInboxBrief().catch((error) => {
      setStatus(els.ccoInboxStatus, error.message || 'Kunde inte uppdatera inkorgen.', true);
    });
  });
  els.ccoClearFiltersBtn?.addEventListener('click', () => {
    state.ccoInboxMailboxFilter = 'all';
    state.ccoInboxSlaFilter = 'all';
    state.ccoInboxLifecycleFilter = 'all';
    state.ccoInboxSearchQuery = '';
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoShowSystemMailsBtn?.addEventListener('click', () => {
    state.ccoInboxShowSystemMessages = true;
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoSwitchInboundBtn?.addEventListener('click', () => {
    state.ccoMailViewMode = 'inbound';
    state.ccoAutoSwitchToInboundPending = false;
    closeCcoIndicatorContextMenu();
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoSwitchOverviewBtn?.addEventListener('click', () => {
    state.ccoMailViewMode = 'queue';
    state.ccoInboxDensityMode = 'overview';
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoStartSprintBtn?.addEventListener('click', () => {
    startCcoSprint().catch((error) => {
      setStatus(els.ccoInboxStatus, error.message || 'Kunde inte starta fokus.', true);
    });
  });
  els.ccoFocusShowAllBtn?.addEventListener('click', () => {
    if (state.ccoAdaptiveFocusState?.isActive !== true) return;
    state.ccoAdaptiveFocusShowAll = state.ccoAdaptiveFocusShowAll !== true;
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoFocusWorkloadInfoBtn?.addEventListener('click', () => {
    if (!els.ccoFocusWorkloadBreakdown) return;
    const isVisible = els.ccoFocusWorkloadBreakdown.classList.toggle('visible');
    els.ccoFocusWorkloadInfoBtn?.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
  });
  els.ccoSoftBreakPanel?.addEventListener('click', (event) => {
    const actionButton = closestFromEventTarget(event, 'button[data-cco-soft-break-action]');
    if (!actionButton) return;
    const action = String(actionButton.getAttribute('data-cco-soft-break-action') || '').trim();
    if (action === 'cancel') {
      hideCcoSoftBreakPanel();
      setStatus(els.ccoInboxStatus, 'Fokus fortsätter.');
      return;
    }
    const pendingConversationId = String(state.ccoPendingSoftBreakConversationId || '').trim();
    if (!pendingConversationId) {
      hideCcoSoftBreakPanel();
      return;
    }
    if (action === 'pause') {
      state.ccoSprintActive = false;
      setStatus(els.ccoInboxStatus, 'Fokus pausad. Full inkorg visas igen.');
    } else if (action === 'replace') {
      const queue = (Array.isArray(state.ccoSprintQueueIds) ? state.ccoSprintQueueIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value) => value !== pendingConversationId);
      while (queue.length > 2) queue.pop();
      queue.push(pendingConversationId);
      state.ccoSprintQueueIds = queue.slice(0, 3);
      state.ccoSprintActive = true;
      setStatus(els.ccoInboxStatus, 'Fokus uppdaterad med vald tråd.');
    } else if (action === 'abort') {
      stopCcoSprint({ message: 'Fokus avbruten. Full inkorg visas igen.' });
    }
    hideCcoSoftBreakPanel();
    setSelectedCcoConversation(pendingConversationId);
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxMailboxFilters?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-mailbox-filter]');
    if (!button) return;
    const nextFilter = sanitizeCcoMailboxFilter(button.getAttribute('data-cco-mailbox-filter') || 'all');
    if (nextFilter === sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter)) return;
    state.ccoInboxMailboxFilter = nextFilter;
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxMailboxSelect?.addEventListener('change', () => {
    const nextFilter = sanitizeCcoMailboxFilter(els.ccoInboxMailboxSelect?.value || 'all');
    if (nextFilter === sanitizeCcoMailboxFilter(state.ccoInboxMailboxFilter)) return;
    state.ccoInboxMailboxFilter = nextFilter;
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoMailboxFiltersToggleBtn?.addEventListener('click', () => {
    state.ccoMailboxFiltersExpanded = !sanitizeCcoMailboxFiltersExpanded(state.ccoMailboxFiltersExpanded);
    persistCcoWorkspaceSessionState();
    renderCcoMailboxFiltersVisibility();
  });
  els.ccoExtraFiltersToggleBtn?.addEventListener('click', () => {
    state.ccoExtraFiltersExpanded = !sanitizeCcoExtraFiltersExpanded(state.ccoExtraFiltersExpanded);
    persistCcoWorkspaceSessionState();
    renderCcoExtraFiltersVisibility();
  });
  els.ccoWorkspaceCompactToggleBtn?.addEventListener('click', () => {
    state.ccoWorkspaceCompact = !sanitizeCcoWorkspaceCompact(state.ccoWorkspaceCompact);
    persistCcoWorkspaceSessionState();
    renderCcoWorkspaceCompactState();
  });
  els.ccoInboxSlaFilters?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-sla-filter]');
    if (!button) return;
    const nextFilter = sanitizeCcoSlaFilter(button.getAttribute('data-cco-sla-filter') || 'all');
    state.ccoInboxSlaFilter = nextFilter;
    state.ccoInboxViewMode = 'all';
    setActiveSectionNav('ccoWorkspaceSection');
    syncCcoThreadRouteState(state.ccoSelectedConversationId);
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxStateFilters?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-state-filter]');
    if (!button) return;
    const nextFilter = sanitizeCcoLifecycleFilter(
      button.getAttribute('data-cco-state-filter') || 'all'
    );
    state.ccoInboxLifecycleFilter = nextFilter;
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxSearchInput?.addEventListener('input', () => {
    state.ccoInboxSearchQuery = sanitizeCcoSearchQuery(els.ccoInboxSearchInput?.value || '');
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxShowSystemToggle?.addEventListener('change', () => {
    state.ccoInboxShowSystemMessages = sanitizeCcoShowSystemMessages(
      els.ccoInboxShowSystemToggle?.checked
    );
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoReplyShowSystemToggle?.addEventListener('change', () => {
    state.ccoInboxShowSystemMessages = sanitizeCcoShowSystemMessages(
      els.ccoReplyShowSystemToggle?.checked
    );
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxModeToggle?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-mail-view]');
    if (!button) return;
    const nextMode = sanitizeCcoMailViewMode(button.getAttribute('data-cco-mail-view') || 'queue');
    if (nextMode === sanitizeCcoMailViewMode(state.ccoMailViewMode)) return;
    logCcoInteraction('mail-view-toggle', {
      previousMode: sanitizeCcoMailViewMode(state.ccoMailViewMode),
      nextMode,
    });
    state.ccoMailViewMode = nextMode;
    state.ccoAutoSwitchToInboundPending = false;
    state.ccoSelectedFeedMessageId = '';
    closeCcoIndicatorContextMenu();
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoIndicatorFilterRow?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-indicator-filter]');
    if (!button) return;
    const nextFilter = sanitizeCcoIndicatorViewFilter(
      button.getAttribute('data-cco-indicator-filter') || 'all'
    );
    if (nextFilter === sanitizeCcoIndicatorViewFilter(state.ccoIndicatorViewFilter)) return;
    state.ccoIndicatorViewFilter = nextFilter;
    closeCcoIndicatorContextMenu();
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxDensityFilters?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-density-mode]');
    if (!button) return;
    const nextMode = sanitizeCcoDensityMode(button.getAttribute('data-cco-density-mode') || 'work');
    if (nextMode === sanitizeCcoDensityMode(state.ccoInboxDensityMode)) return;
    logCcoInteraction('density-mode-toggle', {
      previousMode: sanitizeCcoDensityMode(state.ccoInboxDensityMode),
      nextMode,
    });
    state.ccoInboxDensityMode = nextMode;
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxWorklist?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, '.ccoConversationSelectBtn');
    const rowScope = button
      ? null
      : closestFromEventTarget(event, '.cco-thread[data-cco-conversation-id]') ||
        closestFromEventTarget(event, '[data-cco-conversation-id]');
    const rowButton = rowScope?.querySelector?.('.ccoConversationSelectBtn') || null;
    const conversationId = String(
      button?.getAttribute('data-conversation-id') ||
        rowButton?.getAttribute?.('data-conversation-id') ||
        rowScope?.getAttribute('data-cco-conversation-id') ||
        ''
    ).trim();
    const clickedEl = getEventTargetElement(event);
    const topElementAtPoint =
      Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
        ? document.elementFromPoint(event.clientX, event.clientY)
        : null;
    logCcoInteraction('worklist-row-click', {
      conversationId,
      sprintActive: state.ccoSprintActive === true,
      mode: sanitizeCcoMailViewMode(state.ccoMailViewMode),
      clickedTag: clickedEl?.tagName || null,
      topElementTag: topElementAtPoint?.tagName || null,
      topElementClass: topElementAtPoint?.className || null,
    });
    if (!conversationId) return;
    if (state.ccoSprintActive === true) {
      const sprintSet = new Set(
        (Array.isArray(state.ccoSprintQueueIds) ? state.ccoSprintQueueIds : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean)
      );
      if (!sprintSet.has(conversationId)) {
        const shown = showCcoSoftBreakPanel(conversationId);
        if (shown) {
          setStatus(
            els.ccoInboxStatus,
            'Du lämnar fokuskön. Välj: pausa, byt ut tråd eller avbryt fokus.'
          );
          return;
        }
      }
    }
    hideCcoSoftBreakPanel();
    setSelectedCcoConversation(conversationId);
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoInboxWorklist?.addEventListener('contextmenu', (event) => {
    const indicatorEl = closestFromEventTarget(event, '.cco-thread-indicator');
    if (!indicatorEl) return;
    const scope = closestFromEventTarget(event, '[data-cco-conversation-id]');
    const conversationId = String(scope?.getAttribute('data-cco-conversation-id') || '').trim();
    if (!conversationId) return;
    event.preventDefault();
    event.stopPropagation();
    logCcoInteraction('worklist-row-context-menu', {
      conversationId,
      clientX: Number(event.clientX || 0),
      clientY: Number(event.clientY || 0),
    });
    openCcoIndicatorContextMenu({
      conversationId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  });
  els.ccoInboxWorklist?.addEventListener('toggle', (event) => {
    const details = closestFromEventTarget(event, 'details');
    if (!details) return;
    if (details.classList.contains('cco-density-hidden')) return;
    const sectionKey =
      String(details.getAttribute('data-cco-section') || '').trim().toLowerCase() || 'rest';
    if (!['sprint', 'high', 'needs', 'rest'].includes(sectionKey)) return;
    logCcoInteraction('worklist-section-toggle', {
      section: sectionKey,
      open: details.open === true,
    });
    const nextExpanded = sanitizeCcoSectionExpandedState(state.ccoInboxSectionExpanded);
    nextExpanded[sectionKey] = details.open === true;
    state.ccoInboxSectionExpanded = nextExpanded;
    persistCcoWorkspaceSessionState();
  });
  els.ccoIndicatorContextMenu?.addEventListener('click', async (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-indicator-override]');
    if (!button) return;
    const action = String(button.getAttribute('data-cco-indicator-override') || '').trim();
    const conversationId = String(state.ccoIndicatorContextConversationId || '').trim();
    closeCcoIndicatorContextMenu();
    if (!conversationId) return;
    if (action === 'auto') {
      await clearCcoIndicatorOverride(conversationId);
      setStatus(els.ccoInboxStatus, 'Statusindikator återställd till auto.');
      renderCcoInbox(state.ccoInboxData);
      return;
    }
    const overrideState = sanitizeCcoIndicatorOverrideState(action);
    if (!overrideState) return;
    await setCcoIndicatorOverride(conversationId, overrideState);
    setStatus(els.ccoInboxStatus, `Statusindikator satt till ${formatCcoIndicatorStateLabel(overrideState)}.`);
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoUnansweredPanel?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, '[data-cco-set-filter]');
    if (!button) return;
    const nextFilter = sanitizeCcoSlaFilter(button.getAttribute('data-cco-set-filter') || 'breach');
    state.ccoInboxViewMode = 'all';
    state.ccoInboxSlaFilter = nextFilter;
    setActiveSectionNav('ccoWorkspaceSection');
    syncCcoThreadRouteState(state.ccoSelectedConversationId);
    persistCcoWorkspaceSessionState();
    renderCcoInbox(state.ccoInboxData);
  });
  els.ccoCustomerSummaryToggleBtn?.addEventListener('click', () => {
    state.ccoCustomerSummaryExpanded = state.ccoCustomerSummaryExpanded !== true;
    renderCcoCustomerSummary(getCcoSelectedConversation());
  });
  els.ccoDraftBodyInput?.addEventListener('input', () => {
    const conversation = getCcoSelectedConversation();
    if (!conversation) return;
    setCcoDraftBodyForConversation(conversation.conversationId, els.ccoDraftBodyInput.value);
  });
  els.ccoDraftModeShortBtn?.addEventListener('click', () => {
    applyCcoDraftModeSelection('short');
  });
  els.ccoDraftModeWarmBtn?.addEventListener('click', () => {
    applyCcoDraftModeSelection('warm');
  });
  els.ccoDraftModeProfessionalBtn?.addEventListener('click', () => {
    applyCcoDraftModeSelection('professional');
  });
  els.ccoConversationColumn?.addEventListener('scroll', () => {
    const conversationId = String(state.ccoSelectedConversationId || '').trim();
    if (!conversationId) return;
    rememberCcoConversationScroll(conversationId, Number(els.ccoConversationColumn?.scrollTop || 0));
  });
  els.ccoConversationHistoryList?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-cco-history-entry-id]');
    if (!button) return;
    const conversation = getCcoSelectedConversation();
    if (!conversation) return;
    const conversationId = String(conversation.conversationId || '').trim();
    const entryId = String(button.getAttribute('data-cco-history-entry-id') || '').trim();
    if (!entryId) return;
    const historyEntries = buildCcoConversationHistoryEntries(conversation);
    const selected = historyEntries.find((entry) => entry.entryId === entryId);
    if (!selected) return;
    state.ccoSelectedMessageContextByConversationId = {
      ...(state.ccoSelectedMessageContextByConversationId || {}),
      [conversationId]: {
        entryId: selected.entryId,
        label: selected.label,
        excerpt: selected.excerpt,
      },
    };
    renderCcoDetail(state.ccoInboxData?.data || null);
  });
  els.ccoCenterTabConversationBtn?.addEventListener('click', () => {
    setCcoCenterReadTab('conversation');
  });
  els.ccoCenterTabCustomerBtn?.addEventListener('click', () => {
    setCcoCenterReadTab('customer');
  });
  document.addEventListener('click', (event) => {
    if (!els.ccoIndicatorContextMenu?.classList.contains('visible')) return;
    const withinMenu = closestFromEventTarget(event, '#ccoIndicatorContextMenu');
    if (withinMenu) return;
    closeCcoIndicatorContextMenu();
  });
  document.addEventListener('contextmenu', (event) => {
    if (!els.ccoIndicatorContextMenu?.classList.contains('visible')) return;
    const withinMenu = closestFromEventTarget(event, '#ccoIndicatorContextMenu');
    if (withinMenu) return;
    closeCcoIndicatorContextMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeCcoIndicatorContextMenu();
  });
  els.ccoSenderMailboxSelect?.addEventListener('change', () => {
    const selectedMailboxId = String(els.ccoSenderMailboxSelect?.value || '')
      .trim()
      .toLowerCase();
    if (!selectedMailboxId) return;
    state.ccoSenderMailboxId = selectedMailboxId;
    state.ccoSignatureProfile = resolveDefaultSignatureForSenderMailbox(selectedMailboxId);
    syncCcoSignatureSelectors();
    renderCcoSignaturePreview();
    const conversation = getCcoSelectedConversation();
    if (conversation) {
      setCcoDraftBodyForConversation(conversation.conversationId, els.ccoDraftBodyInput?.value || '');
    }
    persistCcoWorkspaceSessionState();
  });
  els.ccoSignatureProfileSelect?.addEventListener('change', () => {
    state.ccoSignatureProfile = normalizeCcoSignatureProfileKey(
      String(els.ccoSignatureProfileSelect?.value || '').trim()
    );
    syncCcoSignatureSelectors();
    renderCcoSignaturePreview();
    const conversation = getCcoSelectedConversation();
    if (conversation) {
      setCcoDraftBodyForConversation(conversation.conversationId, els.ccoDraftBodyInput?.value || '');
    }
    persistCcoWorkspaceSessionState();
  });
  els.ccoInsertSignatureToggle?.addEventListener('change', () => {
    state.ccoIncludeSignature = sanitizeCcoIncludeSignature(els.ccoInsertSignatureToggle?.checked);
    persistCcoWorkspaceSessionState();
  });
  els.ccoToggleSignaturePreviewBtn?.addEventListener('click', () => {
    toggleCcoSignaturePreview();
  });
  els.ccoCopyReplyBtn?.addEventListener('click', () => {
    const text = String(els.ccoDraftBodyInput?.value || '').trim();
    if (!text) {
      setStatus(els.ccoSendStatus, 'Inget svar att kopiera.');
      return;
    }
    copyText(text)
      .then(() => setStatus(els.ccoSendStatus, 'Svar kopierat till urklipp.'))
      .catch((error) => setStatus(els.ccoSendStatus, error.message || 'Kunde inte kopiera.', true));
  });
  els.ccoMarkHandledBtn?.addEventListener('click', () => {
    runCcoConversationAction('handled').catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte markera hanterad.', true);
    });
  });
  els.ccoFlagCriticalBtn?.addEventListener('click', () => {
    runCcoConversationAction('flag_critical').catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte flagga som kritisk.', true);
    });
  });
  els.ccoMarkSystemMailBtn?.addEventListener('click', () => {
    toggleCcoSystemMailForSelectedConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte uppdatera systemmail-status.', true);
    });
  });
  els.ccoHidePatternBtn?.addEventListener('click', () => {
    hideCcoSenderOrPatternForSelectedConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte spara mönster.', true);
    });
  });
  els.ccoDeleteMailBtn?.addEventListener('click', () => {
    deleteSelectedCcoConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte radera mail.', true);
    });
  });
  els.ccoStickyDeleteBtn?.addEventListener('click', () => {
    deleteSelectedCcoConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte radera mail.', true);
    });
  });
  els.ccoSnoozeBtn?.addEventListener('click', () => {
    snoozeSelectedCcoConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte sätta påminnelse.', true);
    });
  });
  els.ccoStickySnoozeBtn?.addEventListener('click', () => {
    snoozeSelectedCcoConversation().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte sätta påminnelse.', true);
    });
  });
  els.ccoRefineImproveBtn?.addEventListener('click', () => {
    runCcoRefineDraft('improve').catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte förbättra svaret.', true);
    });
  });
  els.ccoRefineShortenBtn?.addEventListener('click', () => {
    runCcoRefineDraft('shorten').catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte förkorta svaret.', true);
    });
  });
  els.ccoRefineSofterBtn?.addEventListener('click', () => {
    const conversation = getCcoSelectedConversation();
    if (!conversation) {
      setStatus(els.ccoSendStatus, 'Välj en konversation först.');
      return;
    }
    applyCcoDraftModeSelection('warm');
    setStatus(els.ccoSendStatus, 'Svarsläge satt till varm ton.');
  });
  els.ccoRefineProfessionalBtn?.addEventListener('click', () => {
    runCcoRefineDraft('professional').catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte ändra ton.', true);
    });
  });
  els.ccoSendBtn?.addEventListener('click', () => {
    sendCcoReply().catch((error) => {
      setStatus(els.ccoSendStatus, error.message || 'Kunde inte skicka via Graph.', true);
    });
  });
  els.fetchCalibrationSuggestionBtn?.addEventListener('click', fetchCalibrationSuggestion);
  els.applyCalibrationSuggestionBtn?.addEventListener('click', applyCalibrationSuggestion);
  els.runPilotReportBtn?.addEventListener('click', runPilotReport);
  els.refreshMailInsightsBtn?.addEventListener('click', loadMailInsights);
  els.previewMailSeedsBtn?.addEventListener('click', () =>
    applyMailTemplateSeeds({ dryRun: true })
  );
  els.applyMailSeedsBtn?.addEventListener('click', () =>
    applyMailTemplateSeeds({ dryRun: false })
  );
  els.refreshMonitorBtn?.addEventListener('click', loadMonitorStatus);
  els.toggleMonitorDetailsBtn?.addEventListener('click', () => {
    setMonitorDetailsVisible(!state.monitorDetailsVisible);
  });
  els.runSchedulerSuiteBtn?.addEventListener('click', runSchedulerRequiredSuite);
  els.previewReadinessOutputGateRemediationBtn?.addEventListener('click', () =>
    runReadinessOutputGateRemediation({ dryRun: true })
  );
  els.runReadinessOutputGateRemediationBtn?.addEventListener('click', () =>
    runReadinessOutputGateRemediation({ dryRun: false })
  );
  els.previewReadinessOwnerMfaRemediationBtn?.addEventListener('click', () =>
    runReadinessOwnerMfaRemediation({ dryRun: true })
  );
  els.runReadinessOwnerMfaRemediationBtn?.addEventListener('click', () =>
    runReadinessOwnerMfaRemediation({ dryRun: false })
  );
  els.loadStateManifestBtn?.addEventListener('click', loadStateManifest);
  els.createStateBackupBtn?.addEventListener('click', createStateBackup);
  els.listStateBackupsBtn?.addEventListener('click', listStateBackups);
  els.previewPruneBackupsBtn?.addEventListener('click', previewPruneBackups);
  els.runPruneBackupsBtn?.addEventListener('click', runPruneBackups);
  els.listSchedulerReportsBtn?.addEventListener('click', listSchedulerReports);
  els.previewPruneReportsBtn?.addEventListener('click', previewPruneSchedulerReports);
  els.runPruneReportsBtn?.addEventListener('click', runPruneSchedulerReports);
  els.previewStateRestoreBtn?.addEventListener('click', previewStateRestore);
  els.runStateRestoreBtn?.addEventListener('click', runStateRestore);
  els.quickCreateTemplateBtn?.addEventListener('click', () => {
    scrollToSection(els.templateLifecycleSection);
    els.templateNameInput?.focus();
  });
  els.quickGenerateDraftBtn?.addEventListener('click', () => {
    scrollToSection(els.templateLifecycleSection);
    if (!state.selectedTemplateId && state.templates[0]?.id) {
      selectTemplate(state.templates[0].id, { preserveVersion: false }).catch((error) => {
        setStatus(els.templateStatus, error.message || 'Kunde inte välja mall för draft.', true);
      });
    }
    els.draftInstructionInput?.focus();
  });
  els.quickReviewFlaggedBtn?.addEventListener('click', () => {
    openReviewsQueue().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte öppna review-kön.', true);
    });
  });
  els.openReviewsQueueBtn?.addEventListener('click', () => {
    openReviewsQueue().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte öppna review-kön.', true);
    });
  });
  els.openIncidentsQueueBtn?.addEventListener('click', () => {
    openIncidentsQueue().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte öppna incidents.', true);
    });
  });
  els.applyRiskBulkBtn?.addEventListener('click', applyBulkOwnerAction);
  els.riskDetailQuickActions?.addEventListener('click', (event) => {
    const button = closestFromEventTarget(event, 'button[data-owner-action]');
    if (!button) return;
    applyRiskDetailOwnerAction(button);
  });
  els.riskShowPendingBtn?.addEventListener('click', () => {
    openReviewsQueue().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte applicera pending-filter.', true);
    });
  });
  els.riskShowHighCriticalBtn?.addEventListener('click', () => {
    openIncidentsQueue().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte applicera högt/kritiskt filter.', true);
    });
  });
  els.riskClearFiltersBtn?.addEventListener('click', () => {
    applyRiskFilterPreset('clear');
    loadDashboard().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte rensa riskfilter.', true);
    });
  });
  els.riskSelectAllReviews?.addEventListener('change', () => {
    const reviewIds = state.riskEvaluations
      .filter((item) => Number(item?.riskLevel || 0) === 3)
      .map((item) => String(item.id || ''))
      .filter(Boolean);
    if (els.riskSelectAllReviews?.checked) {
      state.selectedRiskIds = [...new Set([...state.selectedRiskIds, ...reviewIds])];
    } else {
      state.selectedRiskIds = state.selectedRiskIds.filter((item) => !reviewIds.includes(item));
    }
    renderRiskTable(state.riskEvaluations);
  });
  els.riskSelectAllIncidents?.addEventListener('change', () => {
    const incidentIds = state.riskEvaluations
      .filter((item) => Number(item?.riskLevel || 0) >= 4)
      .map((item) => String(item.id || ''))
      .filter(Boolean);
    if (els.riskSelectAllIncidents?.checked) {
      state.selectedRiskIds = [...new Set([...state.selectedRiskIds, ...incidentIds])];
    } else {
      state.selectedRiskIds = state.selectedRiskIds.filter((item) => !incidentIds.includes(item));
    }
    renderRiskTable(state.riskEvaluations);
  });
  const runRiskFilterRefresh = (errorMessage) => {
    loadDashboard().catch((error) => {
      setStatus(els.riskActionStatus, error.message || errorMessage, true);
    });
  };
  els.applyRiskFilterBtn?.addEventListener('click', () => {
    runRiskFilterRefresh('Kunde inte applicera riskfilter.');
  });
  els.riskReasonFilter?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runRiskFilterRefresh('Kunde inte applicera riskfilter.');
  });
  els.riskSearchFilter?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runRiskFilterRefresh('Kunde inte applicera riskfilter.');
  });
  els.applyAuditFilterBtn?.addEventListener('click', () => {
    readAuditFiltersFromInputs();
    loadAuditEvents().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte applicera audit-filter.', true);
    });
  });
  els.clearAuditFilterBtn?.addEventListener('click', () => {
    state.auditFilters = {
      search: '',
      action: '',
      actorUserId: '',
      targetType: '',
      outcome: '',
      severity: '',
      sinceDays: 14,
      limit: 200,
    };
    persistAuditFilters();
    syncAuditFilterInputs();
    loadAuditEvents().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte rensa audit-filter.', true);
    });
  });
  els.auditTimeline?.addEventListener('click', (event) => {
    const item = closestFromEventTarget(event, '[data-aid]');
    if (!item) return;
    const eventId = String(item.getAttribute('data-aid') || '').trim();
    if (!eventId) return;
    state.selectedAuditEventId = eventId;
    applyAuditFiltersAndRender();
    const selectedEvent =
      state.auditEvents.find((entry) => String(entry?.id || '') === eventId) || null;
    openAuditDrawer(selectedEvent);
  });
  els.auditSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    readAuditFiltersFromInputs();
    loadAuditEvents().catch((error) => {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte köra audit-sökning.', true);
    });
  });
  els.appModalConfirmBtn?.addEventListener('click', () => {
    handleAppModalConfirm();
  });
  els.appModalCancelBtn?.addEventListener('click', () => {
    closeAppModal({ confirmed: false, value: '' });
  });
  els.appModalCloseBtn?.addEventListener('click', () => {
    closeAppModal({ confirmed: false, value: '' });
  });
  els.drawerBackdrop?.addEventListener('click', () => {
    closeAllDrawers();
  });
  document.addEventListener('click', (event) => {
    if (!closestFromEventTarget(event, '[data-drawer-close]')) return;
    closeAllDrawers();
  });
  els.appModalDialog?.addEventListener('animationend', (event) => {
    if (event.animationName !== 'modalNudge') return;
    els.appModalDialog?.classList.remove('modal-nudge');
  });
  els.appModalBackdrop?.addEventListener('mousedown', (event) => {
    if (event.target !== els.appModalBackdrop) return;
    if (activeModalOptions?.closeOnBackdrop) {
      closeAppModal({ confirmed: false, value: '' });
      return;
    }
    handleBlockedModalDismiss();
  });
  document.addEventListener('keydown', (event) => {
    if (!isModalOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (activeModalOptions?.closeOnEscape) {
        closeAppModal({ confirmed: false, value: '' });
        return;
      }
      handleBlockedModalDismiss();
      return;
    }
    if (event.key === 'Enter') {
      const target = event.target;
      const isTextareaTarget = Boolean(target && target === els.appModalTextarea);
      if (isTextareaTarget && !event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      handleAppModalConfirm();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (isModalOpen()) return;
    const hasOpenDrawer = [els.drawerReviews, els.drawerIncidents, els.drawerAudit].some((drawer) =>
      drawer?.classList.contains('is-open')
    );
    if (!hasOpenDrawer) return;
    event.preventDefault();
    closeAllDrawers();
  });
  window.addEventListener('beforeunload', () => {
    if (state.activeSectionGroup === 'ccoWorkspaceSection') {
      state.ccoLastSeenAtMs = Date.now();
      persistCcoLastSeenAtMs(state.ccoLastSeenAtMs);
    }
    stopDashboardStream({ resetRetry: false });
    clearCcoAutoRefreshTimer();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearCcoAutoRefreshTimer();
      return;
    }
    syncCcoAutoRefresh({ immediate: isCcoWorkspaceActive() });
  });
  window.addEventListener('resize', () => {
    updateWorkspaceViewportMetrics();
  });

  syncRiskFilterInputs();
  syncAuditFilterInputs();
  syncTemplateFilterInputs();
  bindScrollableListPersistence();
  applyLanguage();
  initCcoColumnResizers();
  state.activeSectionGroup = resolveInitialSectionGroup();
  setActiveSectionGroup(state.activeSectionGroup || 'overviewSection', {
    targetId: resolveDefaultTargetForGroup(state.activeSectionGroup || 'overviewSection'),
    scroll: false,
  });
  renderCcoWorkspaceCompactState();
  renderCcoCenterReadTab();
  renderTonePreview();
  renderTeamSummary([]);
  fillWritingIdentityForm(null);
  renderWritingIdentityProfiles();

  updateLifecyclePermissions();
  restoreSession();
})();
