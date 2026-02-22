(function () {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const RISK_FILTERS_KEY = 'ARCANA_ADMIN_RISK_FILTERS';
  const AUDIT_FILTERS_KEY = 'ARCANA_ADMIN_AUDIT_FILTERS';
  const TEMPLATE_LIST_FILTERS_KEY = 'ARCANA_ADMIN_TEMPLATE_LIST_FILTERS';
  const LIST_SCROLL_STATE_KEY = 'ARCANA_ADMIN_LIST_SCROLL_STATE';
  const TOAST_AUTO_DISMISS_MS = 6000;
  const BRAND_PRIMARY_COLORS = Object.freeze(['#1A73E8', '#2B7FFF', '#2563EB', '#3B82F6']);
  const BRAND_ACCENT_COLORS = Object.freeze(['#A855F7', '#9333EA', '#8B5CF6', '#C084FC']);
  const DEFAULT_BRAND_PRIMARY_COLOR = '#1A73E8';
  const DEFAULT_BRAND_ACCENT_COLOR = '#A855F7';

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
    role: '',
    tenantId: '',
    pendingLoginTicket: '',
    availableTenants: [],
    templates: [],
    versions: [],
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
  };

  const els = {
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
    toastViewport: document.getElementById('toastViewport'),
    sessionMeta: document.getElementById('sessionMeta'),
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
    settingsSection: document.getElementById('settingsSection'),
    overviewSection: document.getElementById('overviewSection'),
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
    monitorPanelStatus: document.getElementById('monitorPanelStatus'),
    monitorResult: document.getElementById('monitorResult'),
    loadStateManifestBtn: document.getElementById('loadStateManifestBtn'),
    createStateBackupBtn: document.getElementById('createStateBackupBtn'),
    listStateBackupsBtn: document.getElementById('listStateBackupsBtn'),
    previewPruneBackupsBtn: document.getElementById('previewPruneBackupsBtn'),
    runPruneBackupsBtn: document.getElementById('runPruneBackupsBtn'),
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
    saveTenantConfigBtn: document.getElementById('saveTenantConfigBtn'),
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
  };

  let activeModalResolver = null;
  let activeModalOptions = null;
  let activeModalFocusReturn = null;

  function setText(el, value) {
    if (!el) return;
    el.textContent = String(value ?? '');
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
      allOption.textContent = 'Alla';
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
      allOption.textContent = 'Alla';
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
      { value: '', label: 'Alla' },
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
      return `${raw} Gå till Reviews/Incidents och sätt owner action först.`;
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

  function toPrettyJson(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
    const compact = Object.entries(value).reduce((acc, [key, item]) => {
      if (!Array.isArray(item) || item.length === 0) return acc;
      acc[key] = item;
      return acc;
    }, {});
    return JSON.stringify(compact, null, 2);
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
      els.tonePreviewMeta.textContent = `assistant=${assistant} • tone=${tone} • brand=${brand} • riskModifier=${prefix}${formatCompactNumber(
        modifier,
        1
      )} • primary=${primaryColor} • accent=${accentColor}`;
    }
    if (els.tonePreviewText) {
      els.tonePreviewText.textContent = buildTonePreviewText(tone, assistant, brand);
    }
    if (els.tonePreviewLogo) {
      if (logoUrl) {
        els.tonePreviewLogo.src = logoUrl;
        els.tonePreviewLogo.alt = `${brand} logo`;
        els.tonePreviewLogo.onerror = () => {
          els.tonePreviewLogo.classList.add('hidden');
        };
        els.tonePreviewLogo.onload = () => {
          els.tonePreviewLogo.classList.remove('hidden');
        };
        els.tonePreviewLogo.classList.remove('hidden');
      } else {
        els.tonePreviewLogo.removeAttribute('src');
        els.tonePreviewLogo.alt = 'Brand logo preview';
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
      'Du är nu inbjuden till Arcana Executive OS.',
      `Inloggning: ${window.location.origin}/admin.html`,
      `Tenant: ${safeTenant || '-'}`,
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
      els.staffInvitePreview.textContent = content || 'Ingen invite-text ännu.';
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
      if (els.selectedStaffMeta) els.selectedStaffMeta.textContent = 'Ingen staff vald.';
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
    const role = String(selected?.membership?.role || '-');
    const status = String(selected?.membership?.status || '-');
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
        `role: ${role}`,
        `status: ${status}`,
        `membershipId: ${membershipId}`,
        `userId: ${userId}`,
        `createdAt: ${createdAt}`,
        `updatedAt: ${updatedAt}`,
        isCurrentMembership ? 'session: current' : 'session: other',
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
          label = 'Promote OWNER';
          enabled = true;
        } else if (role === 'OWNER') {
          nextRole = 'STAFF';
          label = 'Demote STAFF';
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
    if (!isLoggedIn) {
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      if (els.tenantSelectionSelect) els.tenantSelectionSelect.innerHTML = '';
      state.pendingLoginTicket = '';
    }
  }

  function setSessionMeta() {
    if (!els.sessionMeta) return;
    if (!state.token || !state.tenantId || !state.role) {
      els.sessionMeta.textContent = 'Inte inloggad';
      return;
    }
    els.sessionMeta.textContent = `Tenant: ${state.tenantId} • Roll: ${state.role}`;
  }

  function renderTenantSwitchOptions() {
    if (!els.tenantSwitchSelect) return;
    const previous = els.tenantSwitchSelect.value || state.tenantId || '';
    const memberships = Array.isArray(state.availableTenants) ? state.availableTenants : [];

    els.tenantSwitchSelect.innerHTML = '';
    if (!memberships.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Tenant';
      els.tenantSwitchSelect.appendChild(option);
      return;
    }

    for (const membership of memberships) {
      const tenantId = membership?.tenantId || membership?.membership?.tenantId || '';
      if (!tenantId) continue;
      const role = membership?.role || membership?.membership?.role || 'okänd';
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
      option.textContent = `${tenant.tenantId} (${tenant.role || 'okänd'})`;
      els.tenantSelectionSelect.appendChild(option);
    }
    const hasOptions = els.tenantSelectionSelect.options.length > 0;
    els.tenantSelectionPanel.classList.toggle('hidden', !hasOptions);
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
    if (els.refreshTenantsBtn) els.refreshTenantsBtn.disabled = !writer;
    if (els.onboardTenantBtn) els.onboardTenantBtn.disabled = !owner;
    if (els.loadSessionsBtn) els.loadSessionsBtn.disabled = !writer;
    if (els.loadStateManifestBtn) els.loadStateManifestBtn.disabled = !owner;
    if (els.createStateBackupBtn) els.createStateBackupBtn.disabled = !owner;
    if (els.listStateBackupsBtn) els.listStateBackupsBtn.disabled = !owner;
    if (els.previewPruneBackupsBtn) els.previewPruneBackupsBtn.disabled = !owner;
    if (els.runPruneBackupsBtn) els.runPruneBackupsBtn.disabled = !owner;
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

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
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
      `${handled}/${total} owner-hanterade • pending: ${pending}`,
      tone
    );
  }

  function renderSlaIndicatorKpi(highCriticalOpen) {
    const incidents = Array.isArray(highCriticalOpen) ? highCriticalOpen : [];
    setText(els.slaIndicatorValue, incidents.length);

    if (!incidents.length) {
      setKpiMeta(els.slaIndicatorMeta, 'Inga öppna incidents.', 'ok');
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

    const text = `Breach:${buckets.breached} • Kritisk:${buckets.critical} • Varning:${buckets.warn}`;
    const tone = buckets.breached > 0 ? 'bad' : buckets.critical > 0 || buckets.warn > 0 ? 'warn' : 'ok';
    setKpiMeta(els.slaIndicatorMeta, text, tone);
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
        title: `${highCriticalOpen} high/critical incidents öppna`,
        detail: 'Prioritera incidenthantering och owner action.',
      });
    }
    if (l3Count > 0) {
      notifications.push({
        tone: 'warn',
        title: `${l3Count} reviews väntar`,
        detail: 'L3-utvärderingar behöver manuell granskning.',
      });
    }
    if (pendingOwner > 0) {
      notifications.push({
        tone: 'warn',
        title: `${pendingOwner} owner decisions pending`,
        detail: 'Hantera pending-rader för bättre coverage.',
      });
    }
    if (totalTemplates > 0 && activeTemplates < totalTemplates) {
      notifications.push({
        tone: 'warn',
        title: `${totalTemplates - activeTemplates} mallar utan aktiv version`,
        detail: `Aktiva: ${activeTemplates}/${totalTemplates}.`,
      });
    } else if (totalTemplates > 0) {
      notifications.push({
        tone: 'ok',
        title: 'Alla mallar är aktiva',
        detail: `${activeTemplates}/${totalTemplates} mallar har aktiv version.`,
      });
    }

    const latestEvent = Array.isArray(recentAuditEvents) ? recentAuditEvents[0] : null;
    if (latestEvent) {
      notifications.push({
        tone: 'ok',
        title: `Senaste audit: ${toActionLabel(latestEvent.action)}`,
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
      `Total: ${stats.total}`,
      `Pending: ${stats.pending}`,
      `Revision requested: ${stats.revisionRequested}`,
      `Escalated: ${stats.escalated}`,
      `High/Critical open: ${stats.highCriticalOpen}`,
      `Valda rader: ${state.selectedRiskIds.length}`,
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
          title: `Risk evaluated (L${currentEvaluation.riskLevel || '-'})`,
          detail: `Decision: ${currentEvaluation.decision || '-'} • Owner: ${
            currentEvaluation.ownerDecision || 'pending'
          }`,
        });
      }
      const ownerActions = Array.isArray(currentEvaluation?.ownerActions)
        ? currentEvaluation.ownerActions
        : [];
      for (const action of ownerActions) {
        events.push({
          ts: action?.createdAt || currentEvaluation?.updatedAt || currentEvaluation?.evaluatedAt,
          title: `Owner action: ${action?.action || '-'}`,
          detail: `${action?.note ? `Notering: ${action.note}` : 'Ingen notering'}${
            action?.actorUserId ? ` • actor: ${action.actorUserId}` : ''
          }`,
        });
      }
      if (!events.length && currentEvaluation?.updatedAt) {
        events.push({
          ts: currentEvaluation.updatedAt,
          title: 'Senaste uppdatering',
          detail: 'Ingen extra historik tillgänglig.',
        });
      }
      events.sort((a, b) => {
        const bMs = parseIsoToMs(b.ts) || 0;
        const aMs = parseIsoToMs(a.ts) || 0;
        return bMs - aMs;
      });

      if (!events.length) {
        els.riskDetailTimeline.innerHTML = '<li class="muted mini">Ingen timeline ännu.</li>';
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
        els.riskDetailTimeline.innerHTML = '<li class="muted mini">Ingen timeline ännu.</li>';
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
          <span class="chip">${escapeHtml(evaluation.decision || '-')}</span>
          <span class="chip">Owner: ${escapeHtml(evaluation.ownerDecision || 'pending')}</span>
          <span class="chip">Actions: ${escapeHtml(ownerActions.length)}</span>
        </div>
        <div class="mini" style="margin-top:8px"><strong>Reason codes:</strong> ${
          reasonCodes.length
            ? escapeHtml(reasonCodes.join(', '))
            : '<span class="muted">-</span>'
        }</div>
        <div class="mini" style="margin-top:4px"><strong>Policy:</strong> ${escapeHtml(policySummary)}</div>
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
        decision: evaluation.decision,
        ownerDecision: evaluation.ownerDecision || 'pending',
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
        label: 'Closed',
        className: 'sla-ok',
        detail: `Stängd med ownerDecision=${ownerDecision}. Mål: ${formatDurationCompact(targetMs)}.`,
      };
    }

    const elapsedMs = Math.max(0, Date.now() - openedAtMs);
    const remainingMs = targetMs - elapsedMs;
    if (remainingMs <= 0) {
      return {
        label: `Breached ${formatDurationCompact(Math.abs(remainingMs))}`,
        className: 'sla-breached',
        detail: `SLA överskriden. Mål: ${formatDurationCompact(targetMs)}.`,
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
            setStatus(els.riskActionStatus, `Sparar owner action (${action})...`);
            await applyOwnerAction(evaluationId, action, noteDialog.value || '');
            setStatus(els.riskActionStatus, `Owner action sparad: ${action}.`);
            await loadDashboard();
            await loadRiskEvaluationDetail(evaluationId);
          } catch (error) {
            setStatus(els.riskActionStatus, error.message || 'Kunde inte spara owner action.', true);
          }
        });
      });
  }

  function renderRiskTable(evaluations) {
    saveListScrollPosition('riskReviewsWrap', els.riskReviewsWrap);
    saveListScrollPosition('riskIncidentsWrap', els.riskIncidentsWrap);
    state.riskEvaluations = Array.isArray(evaluations) ? evaluations : [];
    const displayEvaluations = state.riskEvaluations.filter(
      (item) => Number(item?.riskLevel || 0) >= 3
    );
    const reviews = displayEvaluations.filter((item) => Number(item?.riskLevel || 0) === 3);
    const incidents = displayEvaluations.filter((item) => Number(item?.riskLevel || 0) >= 4);
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
      renderRiskEmptyRow(els.riskReviewsTableBody, 12, 'Inga reviews (L3) för valt filter.');
      renderRiskEmptyRow(els.riskIncidentsTableBody, 11, 'Inga incidents (L4-L5) för valt filter.');
      syncSelectAllCheckbox(els.riskSelectAllReviews, []);
      syncSelectAllCheckbox(els.riskSelectAllIncidents, []);
      renderRiskDetail(null);
      restoreListScrollPosition('riskReviewsWrap', els.riskReviewsWrap);
      restoreListScrollPosition('riskIncidentsWrap', els.riskIncidentsWrap);
      return;
    }

    for (const evaluation of reviews) {
      const tr = document.createElement('tr');
      const evaluationId = String(evaluation.id || '');
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
        <td>${escapeHtml(evaluation.decision || '-')}</td>
        <td>${escapeHtml(evaluation.ownerDecision || 'pending')}</td>
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
              }>request_revision</option>
              <option value="approve_exception" ${
                selectedAction === 'approve_exception' ? 'selected' : ''
              }>approve_exception</option>
              <option value="mark_false_positive" ${
                selectedAction === 'mark_false_positive' ? 'selected' : ''
              }>mark_false_positive</option>
              <option value="escalate" ${selectedAction === 'escalate' ? 'selected' : ''}>escalate</option>
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
      const evaluationId = String(evaluation.id || '');
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
        <td class="code">${escapeHtml(evaluation.id || '-')}</td>
        <td class="code">${escapeHtml(evaluation.templateId || '-')}<br/>v:${escapeHtml(evaluation.templateVersionId || '-')}</td>
        <td><span class="chip">${escapeHtml(categoryLabel)}</span></td>
        <td class="mini">${escapeHtml(updatedAtLabel)}<br/><span class="muted">${escapeHtml(ageLabel)}</span></td>
        <td><span class="badge"><span class="dot ${dotClassForRiskLevel(riskLevel)}"></span>L${riskLevel}</span></td>
        <td>${escapeHtml(evaluation.decision || '-')}</td>
        <td>${escapeHtml(evaluation.ownerDecision || 'pending')}</td>
        <td class="mini" title="${escapeHtml(reasonCodes.join(', '))}">${escapeHtml(reasonCodesShort || '-')}${reasonCodes.length > 3 ? ' ...' : ''}<br/><span class="muted">${reasonCodes.length} st</span></td>
        <td>
          <div class="actions">
            <select data-eid="${escapeHtml(evaluation.id || '')}" class="ownerActionSelect">
              <option value="request_revision" ${
                selectedAction === 'request_revision' ? 'selected' : ''
              }>request_revision</option>
              <option value="approve_exception" ${
                selectedAction === 'approve_exception' ? 'selected' : ''
              }>approve_exception</option>
              <option value="mark_false_positive" ${
                selectedAction === 'mark_false_positive' ? 'selected' : ''
              }>mark_false_positive</option>
              <option value="escalate" ${selectedAction === 'escalate' ? 'selected' : ''}>escalate</option>
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
      renderRiskEmptyRow(els.riskReviewsTableBody, 12, 'Inga reviews (L3) för valt filter.');
    }
    if (!incidents.length) {
      renderRiskEmptyRow(els.riskIncidentsTableBody, 11, 'Inga incidents (L4-L5) för valt filter.');
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
    scrollToSection(els.reviewsQueueSection || els.reviewsIncidentsSection);
  }

  async function openIncidentsQueue() {
    applyRiskFilterPreset('high_critical');
    await loadDashboard();
    scrollToSection(els.incidentsQueueSection || els.reviewsIncidentsSection);
  }

  function scrollToSection(sectionEl) {
    if (!sectionEl) return;
    setActiveSectionNav(sectionEl.id);
    sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function setActiveSectionNav(targetId) {
    if (!els.sectionNav) return;
    const resolvedTargetId = resolveSectionNavTarget(targetId);
    els.sectionNav.querySelectorAll('.sectionNavBtn').forEach((button) => {
      const currentTarget = String(button.getAttribute('data-target') || '').trim();
      button.classList.toggle('active', currentTarget && currentTarget === resolvedTargetId);
    });
  }

  function syncSectionNavFromViewport() {
    if (!els.sectionNav) return;
    const candidates = [
      els.overviewSection,
      els.templateLifecycleSection,
      els.reviewsQueueSection,
      els.incidentsQueueSection,
      els.reviewsIncidentsSection,
      els.auditSection,
      els.teamSection,
      els.settingsSection,
    ].filter(Boolean);
    if (!candidates.length) return;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const section of candidates) {
      const rect = section.getBoundingClientRect();
      const distance = Math.abs(rect.top - 140);
      if (distance < bestDistance) {
        best = section;
        bestDistance = distance;
      }
    }
    if (best?.id) setActiveSectionNav(best.id);
  }

  async function applyBulkOwnerAction() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan köra bulk action.');
      const selectedIds = state.selectedRiskIds.filter(Boolean);
      if (!selectedIds.length) throw new Error('Markera minst en riskutvärdering först.');

      const action = String(els.riskBulkAction?.value || '').trim().toLowerCase();
      if (!action) throw new Error('Välj owner action.');

      const note = String(els.riskBulkNote?.value || '').trim();
      const confirmResult = await openAppModal({
        title: 'Bulk owner action',
        message: `Applicera "${action}" på ${selectedIds.length} valda riskutvärderingar?`,
        confirmLabel: 'Applicera',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.riskActionStatus, 'Bulk action avbruten.');
        return;
      }

      setStatus(els.riskActionStatus, `Applicerar ${action} på ${selectedIds.length} rader...`);
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
      if (!isOwner()) throw new Error('Endast OWNER kan sätta owner action.');
      const action = String(button?.getAttribute('data-owner-action') || '')
        .trim()
        .toLowerCase();
      const evaluationId =
        String(button?.getAttribute('data-eid') || '').trim() ||
        String(state.selectedRiskEvaluationId || '').trim();
      if (!action) throw new Error('Saknar owner action.');
      if (!evaluationId) throw new Error('Välj en riskutvärdering först.');

      const note = String(els.riskDetailNoteInput?.value || '').trim();
      setStatus(els.riskActionStatus, `Sparar owner action (${action})...`);
      await applyOwnerAction(evaluationId, action, note);
      setStatus(els.riskActionStatus, `Owner action sparad: ${action}.`);
      if (els.riskDetailNoteInput) els.riskDetailNoteInput.value = '';
      await loadDashboard();
      await loadRiskEvaluationDetail(evaluationId);
    } catch (error) {
      setStatus(els.riskActionStatus, error.message || 'Kunde inte spara owner action.', true);
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
      { label: 'Loaded', value: state.auditEvents.length, dot: 'ok' },
      { label: 'Visible', value: visibleEvents.length, dot: 'info' },
      { label: 'Success', value: success, dot: 'ok' },
      { label: 'Error', value: error, dot: error > 0 ? 'bad' : 'ok' },
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
          <span class="mini muted">${escapeHtml(event?.outcome || '-')}</span>
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
      const role = item?.membership?.role || '-';
      const status = item?.membership?.status || '-';
      const membershipId = item?.membership?.id || '';
      const isOwnerMembership = role === 'OWNER';
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
          ? `<button class="btn small staffRoleBtn" data-mid="${membershipId}" data-role="STAFF">Demote STAFF</button>`
          : '<span class="mini muted">immutable</span>'
        : `<button class="btn small staffToggleBtn" data-mid="${membershipId}" data-next="${
            status === 'active' ? 'disabled' : 'active'
          }">${status === 'active' ? 'Disable' : 'Enable'}</button>
           <button class="btn small staffRoleBtn" data-mid="${membershipId}" data-role="OWNER">Promote OWNER</button>
           <button class="btn small staffResetPwdBtn" data-mid="${membershipId}">Reset lösenord</button>`;

      const tr = document.createElement('tr');
      if (isSelected) tr.classList.add('staff-row-active');
      tr.innerHTML = `
        <td>${email}</td>
        <td>${role}</td>
        <td>${status}</td>
        <td class="mini">${updatedAt}</td>
        <td>
          <div class="seg">
            <button class="btn small staffSelectBtn" data-mid="${membershipId}">Profil</button>
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
          setStatus(els.staffStatus, 'Uppdaterar staff-status...');
          await api(`/users/staff/${membershipId}`, {
            method: 'PATCH',
            body: { status: nextStatus },
          });
          setStatus(els.staffStatus, `Staff-status uppdaterad till ${nextStatus}.`);
          await loadStaffMembers();
          await loadDashboard();
        } catch (error) {
          setStatus(els.staffStatus, error.message || 'Kunde inte uppdatera staff-status.', true);
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
      const status = session?.revokedAt ? 'revoked' : 'active';
      const userEmail = entry?.user?.email || '-';
      const role = entry?.membership?.role || session?.role || '-';
      const lastSeen = session?.lastSeenAt || session?.createdAt || '-';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="code">${escapeHtml(sessionId || '-')} ${isCurrent ? '<span class="chip">current</span>' : ''}</td>
        <td>${escapeHtml(userEmail)}</td>
        <td>${escapeHtml(role)}</td>
        <td class="mini">${escapeHtml(lastSeen)}</td>
        <td>${escapeHtml(status)}</td>
        <td>
          ${
            status === 'active'
              ? `<button class="btn small revokeSessionBtn" data-session-id="${escapeHtml(sessionId)}" ${
                  isCurrent ? 'title="Aktuell session"' : ''
                }>${isCurrent ? 'Logga ut denna' : 'Avsluta'}</button>`
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

  function fillTenantConfig(config) {
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

  function clearVersionEditor() {
    state.selectedVersionId = '';
    state.lastVariableValidation = null;
    setText(els.selectedVersionMeta, 'Ingen version vald.');
    if (els.versionTitleInput) els.versionTitleInput.value = '';
    if (els.versionContentInput) els.versionContentInput.value = '';
    if (els.versionRiskBlock) els.versionRiskBlock.textContent = '';
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
            <span class="chip">locale: ${escapeHtml(template.locale || '-')}</span>
            <span class="chip">channel: ${escapeHtml(template.channel || '-')}</span>
            <span class="chip">${template.currentActiveVersionId ? 'active' : 'utan aktiv version'}</span>
            <span class="chip">${escapeHtml(template.status || 'active')}</span>
            ${
              riskSnapshot
                ? `<span class="badge"><span class="dot ${riskSnapshot.dotClass}"></span>L${riskSnapshot.riskLevel} • ${escapeHtml(riskSnapshot.decision)}</span>`
                : '<span class="chip muted">risk: -</span>'
            }
          </div>
          <div class="mini muted">Uppdaterad: ${escapeHtml(formatDateTime(template.updatedAt, true))}</div>
          <div class="footer">
            <button class="btn small templateSelectBtn" data-tid="${escapeHtml(template.id)}">${selected ? 'Vald' : 'Öppna'}</button>
            <button class="btn small templateNewDraftBtn" data-tid="${escapeHtml(template.id)}">Ny draft</button>
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
        <td>${escapeHtml(template.status || 'active')}</td>
        <td class="code">${template.currentActiveVersionId ? 'yes' : '-'}</td>
        <td>${riskSnapshot ? `<span class="badge"><span class="dot ${riskSnapshot.dotClass}"></span>L${riskSnapshot.riskLevel}</span>` : '<span class="muted mini">-</span>'}</td>
        <td class="mini">${escapeHtml(formatDateTime(template.updatedAt, true))}</td>
        <td><button class="btn small templateSelectBtn" data-tid="${escapeHtml(template.id)}">${selected ? 'Vald' : 'Välj'}</button></td>
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
        <td>${version.state}</td>
        <td>${riskLevel}</td>
        <td><button class="btn small versionSelectBtn" data-vid="${version.id}">${selected ? 'Vald' : 'Öppna'}</button></td>
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
      `v${version.versionNo} · state=${version.state} · createdAt=${version.createdAt}`
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
      return;
    }
    const response = await api(`/templates/${state.selectedTemplateId}/versions/${versionId}`);
    fillVersionEditor(response?.version || null);
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
        `${template.name} · ${template.category} · locale=${template.locale} · channel=${template.channel}`
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
      setStatus(els.versionStatus, 'Sparar draft...');
      const response = await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}`, {
        method: 'PATCH',
        body: {
          title: (els.versionTitleInput?.value || '').trim(),
          content: els.versionContentInput?.value || '',
          instruction: (els.draftInstructionInput?.value || '').trim(),
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
        `Riskutvärdering klar • L${response?.version?.risk?.riskLevel || '-'} (${response?.version?.risk?.decision || '-'})`
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
      setStatus(els.versionStatus, `Version aktiverad • state=${response?.version?.state || 'active'}.`);
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
          `Staff ${statusCode}: ${email}. Invite-text kopierad (${autoGenerated ? 'auto-lösenord' : 'manuellt lösenord'}).`
        );
      } catch {
        setStatus(
          els.staffStatus,
          `Staff ${statusCode}: ${email}. Invite-text klar i panelen.`
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
      title: 'Kopiera invite-text',
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
      throw new Error('Lösenordet är för svagt för invite-texten.');
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
        throw new Error('Skapa först en invite-text eller fyll i e-post + lösenord.');
      }
      const inviteMessage = buildStaffInviteMessage({ email, password, tenantId: state.tenantId });
      setStaffInvitePreview(inviteMessage);
      await copyText(inviteMessage);
      setStatus(els.staffStatus, 'Invite-text kopierad.');
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte kopiera invite-text.', true);
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
        title: 'Reset staff-lösenord',
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

      setStatus(els.riskLabStatus, 'Kör risk preview...');
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
      setStatus(els.riskLabStatus, error.message || 'Kunde inte köra risk preview.', true);
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
      await loadDashboard();
    } catch (error) {
      setStatus(els.orchestratorStatus, error.message || 'Kunde inte köra orchestrator.', true);
    }
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
      `Tenant: ${data?.tenantId || '-'}`,
      `Brand: ${data?.brand || '-'}`,
      `Mail-dir: ${data?.paths?.mailDir || '-'}`,
      '',
      `Meddelanden använda: ${counts.messagesUsed ?? 0}`,
      `Trådar: ${counts.threads ?? 0}`,
      `Inbound: ${counts.inbound ?? 0}`,
      `Outbound: ${counts.outbound ?? 0}`,
      `QA-par: ${counts.qaPairs ?? 0}`,
      `Template seeds: ${counts.templateSeeds ?? 0}`,
      '',
      'Summary (preview):',
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
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • unknownVars=${unknown} • missingRequired=${missing}`;
    });
    const lines = [
      `Seed preview: selected=${response?.selected ?? 0}`,
      `Tenant: ${response?.tenantId || '-'}`,
      '',
      ...(rows.length ? rows : ['(inga preview-rader)']),
    ];
    els.mailInsightsResult.textContent = lines.join('\n');
  }

  function renderMailSeedApplyResult(response) {
    if (!els.mailInsightsResult) return;
    const templates = Array.isArray(response?.templates) ? response.templates : [];
    const rows = templates.map((item, index) => {
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • decision=${item?.decision || '-'} • risk=L${item?.riskLevel ?? '-'}`;
    });
    const lines = [
      `Seed apply: created=${response?.created ?? 0} av selected=${response?.selected ?? 0}`,
      `Tenant: ${response?.tenantId || '-'}`,
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
        dryRun ? 'Kör seed preview...' : 'Skapar drafts från seeds...'
      );

      const response = await api('/mail/template-seeds/apply', {
        method: 'POST',
        body: payload,
      });

      if (dryRun) {
        renderMailSeedPreview(response);
        setStatus(
          els.mailInsightsStatus,
          `Preview klar: ${response?.selected ?? 0} seeds valda.`
        );
        return;
      }

      renderMailSeedApplyResult(response);
      setStatus(
        els.mailInsightsStatus,
        `Klart: ${response?.created ?? 0} drafts skapade från seeds.`
      );
      await loadDashboard();
      await loadTemplates({ preserveSelection: false });
      await loadMailInsights();
    } catch (error) {
      setStatus(
        els.mailInsightsStatus,
        error.message || 'Kunde inte köra seed → draft.',
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

  async function loadMonitorStatus() {
    try {
      setStatus(els.monitorPanelStatus, 'Laddar monitor-status...');
      const response = await api('/monitor/status');
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(response, null, 2);
      }
      const templatesTotal = response?.kpis?.templatesTotal ?? 0;
      const evaluationsTotal = response?.kpis?.evaluationsTotal ?? 0;
      const highCriticalOpen = response?.kpis?.highCriticalOpen ?? 0;
      setStatus(
        els.monitorPanelStatus,
        `Monitor uppdaterad: templates=${templatesTotal}, evaluations=${evaluationsTotal}, highCriticalOpen=${highCriticalOpen}`
      );
    } catch (error) {
      setStatus(els.monitorPanelStatus, error.message || 'Kunde inte läsa monitor-status.', true);
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
      setStatus(els.opsStatus, 'Kör prune preview...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: true },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Prune preview klar: ${response?.deletedCount ?? 0} filer skulle tas bort.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra prune preview.', true);
    }
  }

  async function runPruneBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const confirmResult = await openAppModal({
        title: 'Prune backups',
        message: 'Kör prune på backup-katalogen enligt retention-reglerna?',
        confirmLabel: 'Kör prune',
        cancelLabel: 'Avbryt',
        confirmTone: 'danger',
      });
      if (!confirmResult.confirmed) {
        setStatus(els.opsStatus, 'Prune avbruten.');
        return;
      }
      setStatus(els.opsStatus, 'Kör prune...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: false },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Prune klar: ${response?.deletedCount ?? 0} filer borttagna.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte pruna backups.', true);
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
      setStatus(els.opsStatus, `Läser restore preview för ${fileName}...`);
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
      setStatus(els.opsStatus, `Restore preview klart: ${restoreCount} stores kan återställas.`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra restore preview.', true);
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

  async function loadDashboard() {
    const riskQuery = getRiskFilterQuery();
    const [dashboard, riskEvaluations, tenantConfig] = await Promise.all([
      api('/dashboard/owner?minRiskLevel=1&auditLimit=30'),
      api(`/risk/evaluations?${riskQuery}`),
      api('/tenant-config'),
    ]);

    state.tenantId = dashboard.tenantId || state.tenantId;

    setText(els.templatesTotal, dashboard?.templates?.total ?? 0);
    setText(els.templatesActive, dashboard?.templates?.withActiveVersion ?? 0);
    setText(els.riskTotal, dashboard?.riskSummary?.totals?.evaluations ?? 0);
    setText(els.riskOpen, dashboard?.riskSummary?.totals?.highCriticalOpen ?? 0);
    renderOwnerCoverageKpi(dashboard?.riskSummary || {});
    renderSlaIndicatorKpi(dashboard?.riskSummary?.highCriticalOpen || []);
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

    renderRiskTable(riskEvaluations?.evaluations || []);
    fillTenantConfig(tenantConfig?.config || {});
    setStatus(els.tenantConfigStatus, '');
  }

  async function refreshAll() {
    await loadSessionProfile();
    await loadTenants();
    await loadDashboard();
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
      const response = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: els.emailInput.value.trim(),
          password: els.passwordInput.value,
          tenantId: (els.tenantInput.value || '').trim(),
        },
      });

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
      await refreshAll();
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Inloggning misslyckades.', true);
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
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll();
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
      await refreshAll();
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Kunde inte byta tenant.', true);
      renderTenantSwitchOptions();
    }
  }

  async function restoreSession() {
    if (!state.token) {
      setAuthVisible(false);
      state.availableTenants = [];
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
      await refreshAll();
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      state.token = '';
      state.role = '';
      state.tenantId = '';
      state.availableTenants = [];
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
    setStatus(els.tenantOnboardStatus, '');
    if (els.riskLabResult) els.riskLabResult.textContent = 'Ingen preview körd ännu.';
    if (els.orchestratorResult) els.orchestratorResult.textContent = 'Ingen körning ännu.';
    if (els.calibrationResult) els.calibrationResult.textContent = 'Inget kalibreringsförslag ännu.';
    if (els.pilotReportResult) els.pilotReportResult.textContent = 'Ingen rapport körd ännu.';
    if (els.mailInsightsResult) els.mailInsightsResult.textContent = 'Ingen mail-data ännu.';
    if (els.monitorResult) els.monitorResult.textContent = 'Ingen monitor-data ännu.';
    if (els.opsResult) els.opsResult.textContent = 'Ingen ops-data ännu.';
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
    setKpiMeta(els.slaIndicatorMeta, 'Inga öppna incidents.');
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
    if (els.templateResultsMeta) els.templateResultsMeta.textContent = '';
    if (els.templateSelectionMeta) els.templateSelectionMeta.textContent = '0 valda';
    if (els.templateBulkStatus) els.templateBulkStatus.textContent = '';
    if (els.templateSelectAll) {
      els.templateSelectAll.checked = false;
      els.templateSelectAll.indeterminate = false;
    }
    if (els.tenantCatalog) els.tenantCatalog.textContent = 'Ingen data ännu.';
    if (els.staffInvitePreview) {
      els.staffInvitePreview.textContent = 'Ingen invite-text ännu.';
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
  els.refreshBtn?.addEventListener('click', () => refreshAll().catch((error) => alert(error.message || 'Kunde inte uppdatera.')));
  els.logoutBtn?.addEventListener('click', logout);
  els.saveTenantConfigBtn?.addEventListener('click', saveTenantConfig);
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
    const button = event.target.closest('.tonePresetBtn');
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
  els.sectionNav?.addEventListener('click', (event) => {
    const button = event.target.closest('.sectionNavBtn');
    if (!button) return;
    const targetId = String(button.getAttribute('data-target') || '').trim();
    if (!targetId) return;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    event.preventDefault();
    scrollToSection(targetEl);
  });
  let sectionNavScrollRaf = 0;
  window.addEventListener('scroll', () => {
    if (sectionNavScrollRaf) return;
    sectionNavScrollRaf = window.requestAnimationFrame(() => {
      sectionNavScrollRaf = 0;
      syncSectionNavFromViewport();
    });
  });

  els.createTemplateBtn?.addEventListener('click', createTemplate);
  els.templateFilterSelect?.addEventListener('change', () => {
    loadTemplates({ preserveSelection: false }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte filtrera mallar.', true);
    });
  });
  els.templateCategoryChips?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-template-category-chip]');
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
    const button = event.target.closest('button[data-template-var]');
    if (!button) return;
    insertTemplateVariable(button.getAttribute('data-template-var'));
  });
  els.appendSignatureBtn?.addEventListener('click', () => {
    appendTemplateSignatureToContent();
  });
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
      setStatus(els.staffStatus, 'Välj en staff-rad först.');
      return;
    }
    resetStaffPasswordFlow(membershipId);
  });
  els.selectedStaffRoleBtn?.addEventListener('click', () => {
    const membershipId = String(state.selectedStaffMembershipId || '').trim();
    const nextRole = String(els.selectedStaffRoleBtn?.dataset?.role || '').trim().toUpperCase();
    if (!membershipId || !nextRole) {
      setStatus(els.staffStatus, 'Välj en giltig staff-rad först.');
      return;
    }
    updateStaffRole(membershipId, nextRole);
  });
  els.copySelectedStaffInviteBtn?.addEventListener('click', () => {
    const member = getStaffMemberByMembershipId(state.selectedStaffMembershipId);
    if (!member) {
      setStatus(els.staffStatus, 'Välj en staff-rad först.');
      return;
    }
    copyInviteForMember(member).catch((error) => {
      setStatus(els.staffStatus, error.message || 'Kunde inte kopiera invite-text.', true);
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
  els.loadStateManifestBtn?.addEventListener('click', loadStateManifest);
  els.createStateBackupBtn?.addEventListener('click', createStateBackup);
  els.listStateBackupsBtn?.addEventListener('click', listStateBackups);
  els.previewPruneBackupsBtn?.addEventListener('click', previewPruneBackups);
  els.runPruneBackupsBtn?.addEventListener('click', runPruneBackups);
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
    const button = event.target.closest('button[data-owner-action]');
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
      setStatus(els.riskActionStatus, error.message || 'Kunde inte applicera high/critical-filter.', true);
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
    const item = event.target.closest('[data-aid]');
    if (!item) return;
    const eventId = String(item.getAttribute('data-aid') || '').trim();
    if (!eventId) return;
    state.selectedAuditEventId = eventId;
    applyAuditFiltersAndRender();
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

  syncRiskFilterInputs();
  syncAuditFilterInputs();
  syncTemplateFilterInputs();
  bindScrollableListPersistence();
  syncSectionNavFromViewport();
  renderTonePreview();
  renderTeamSummary([]);

  updateLifecyclePermissions();
  restoreSession();
})();
