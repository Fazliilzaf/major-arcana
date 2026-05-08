/**
 * app/state-paths.js — first extracted module from app.js (per APP-JS-MODULE-PLAN.md, Steg 1).
 *
 * Innehåller bara key-path-mappingarna för state.ui / state.selection / state.status /
 * state.prefs / state.data / state.forms. Pure data, inga dependencies utöver native JS.
 *
 * app.js läser dessa via window.__AppPaths istället för att deklarera dem lokalt.
 *
 * Detta är första pragmatiska Steg 1 av modulrefactor — small, isolated, zero-risk.
 * Större extraktioner (state-Proxy + renderApp) följer i senare iterationer.
 */
(() => {
  'use strict';

  // state.ui — UI-flaggor (modaler, navigation, panels)
  const UI_KEY_PATHS = Object.freeze({
    // Top-level UI-flaggor
    moreMenuOpen: ['moreMenuOpen'],
    mailboxAdminOpen: ['mailboxAdminOpen'],
    mailboxAdminEditingId: ['mailboxAdminEditingId'],
    automationCollaborationOpen: ['automationCollaborationOpen'],
    automationRailCollapsed: ['automationRailCollapsed'],
    customerMergeModalOpen: ['customerMergeModalOpen'],
    customerSettingsOpen: ['customerSettingsOpen'],
    customerSuggestionsHidden: ['customerSuggestionsHidden'],
    // Nested top-level
    noteModeOpen: ['noteMode', 'open'],
    macroModalOpen: ['macroModal', 'open'],
    settingsProfileModalOpen: ['settingsProfileModal', 'open'],
    confirmDialogOpen: ['confirmDialog', 'open'],
    pendingMailFeedDeleteActive: ['pendingMailFeedDelete', 'active'],
    // Runtime-nested
    queueInlinePanelOpen: ['runtime', 'queueInlinePanel', 'open'],
    queueHistoryOpen: ['runtime', 'queueHistory', 'open'],
    queueCategoriesCompact: ['runtime', 'queueCategoriesCompact'],
    truthWorklistViewHidden: ['runtime', 'truthWorklistView', 'hidden'],
    historyExpanded: ['runtime', 'historyExpanded'],
    // Navigation (vilken stor vy/pane är aktiv)
    view: ['view'],
    activeFocusSection: ['runtime', 'activeFocusSection'],
  });

  // state.selection — all selection-state (16 + 6 keys)
  const SELECTION_KEY_PATHS = Object.freeze({
    // Top-level
    customerIdentity: ['selectedCustomerIdentity'],
    analyticsPeriod: ['selectedAnalyticsPeriod'],
    automationLibrary: ['selectedAutomationLibrary'],
    automationNode: ['selectedAutomationNode'],
    automationSection: ['selectedAutomationSection'],
    automationTemplate: ['selectedAutomationTemplate'],
    automationVersion: ['selectedAutomationVersion'],
    automationAutopilotProposal: ['selectedAutomationAutopilotProposal'],
    integrationCategory: ['selectedIntegrationCategory'],
    showcaseFeature: ['selectedShowcaseFeature'],
    customerMergePrimaryKey: ['customerMergePrimaryKey'],
    // Nested top-level
    mailFeedKeyLater: ['selectedMailFeedKey', 'later'],
    mailFeedKeySent: ['selectedMailFeedKey', 'sent'],
    // Runtime-nested
    threadId: ['runtime', 'selectedThreadId'],
    mailboxIds: ['runtime', 'selectedMailboxIds'],
    ownerKey: ['runtime', 'selectedOwnerKey'],
    laneId: ['runtime', 'activeLaneId'],
    historyContextThreadId: ['runtime', 'historyContextThreadId'],
    historyConversationId: ['runtime', 'queueHistory', 'selectedConversationId'],
  });

  // state.status — loading/error-flaggor (28 keys)
  const STATUS_KEY_PATHS = Object.freeze({
    bootstrapped: ['bootstrapped'],
    bootstrapError: ['bootstrapError'],
    // Runtime status
    loading: ['runtime', 'loading'],
    loaded: ['runtime', 'loaded'],
    hasReachedSteadyState: ['runtime', 'hasReachedSteadyState'],
    hasRemovedRuntimeLoading: ['runtime', 'hasRemovedRuntimeLoading'],
    authRecoveryArmed: ['runtime', 'authRecoveryArmed'],
    pendingFullRefresh: ['runtime', 'pendingFullRefresh'],
    isBackgroundRefresh: ['runtime', 'isBackgroundRefresh'],
    backgroundRefreshSelectedThreadId: ['runtime', 'backgroundRefreshSelectedThreadId'],
    mode: ['runtime', 'mode'],
    live: ['runtime', 'live'],
    authRequired: ['runtime', 'authRequired'],
    offline: ['runtime', 'offline'],
    offlineWorkingSetSource: ['runtime', 'offlineWorkingSetSource'],
    offlineWorkingSetMeta: ['runtime', 'offlineWorkingSetMeta'],
    error: ['runtime', 'error'],
    lastSyncAt: ['runtime', 'lastSyncAt'],
    historyDeleting: ['runtime', 'historyDeleting'],
    deletingThreadId: ['runtime', 'deletingThreadId'],
    restoringMail: ['runtime', 'restoringMail'],
    // Sub-runtime status
    queueHistoryLoading: ['runtime', 'queueHistory', 'loading'],
    queueHistoryLoaded: ['runtime', 'queueHistory', 'loaded'],
    queueHistoryError: ['runtime', 'queueHistory', 'error'],
    truthWorklistViewLoading: ['runtime', 'truthWorklistView', 'loading'],
    truthWorklistViewLoaded: ['runtime', 'truthWorklistView', 'loaded'],
    truthWorklistViewAuthRequired: ['runtime', 'truthWorklistView', 'authRequired'],
    truthWorklistViewError: ['runtime', 'truthWorklistView', 'error'],
  });

  // state.data — domain-data (server-levererat)
  const DATA_KEY_PATHS = Object.freeze({
    threads: ['runtime', 'threads'],
    mailboxes: ['runtime', 'mailboxes'],
    mailboxCapabilities: ['runtime', 'mailboxCapabilities'],
    queueHistoryItems: ['runtime', 'queueHistory', 'items'],
    truthPrimaryLegacyThreads: ['runtime', 'truthPrimaryLegacyThreads'],
    noteTemplates: ['noteTemplates'],
    noteDefinitions: ['noteDefinitions'],
    customMailboxes: ['customMailboxes'],
    macros: ['macros'],
  });

  // state.forms — live form/draft-state
  const FORMS_KEY_PATHS = Object.freeze({
    // Studio (compose / reply)
    studioMode: ['studio', 'mode'],
    studioThreadId: ['studio', 'threadId'],
    studioComposeMailboxId: ['studio', 'composeMailboxId'],
    studioComposeTo: ['studio', 'composeTo'],
    studioComposeSubject: ['studio', 'composeSubject'],
    studioDraftBody: ['studio', 'draftBody'],
    studioActiveTemplate: ['studio', 'activeTemplateKey'],
    studioActiveTrack: ['studio', 'activeTrackKey'],
    studioActiveTone: ['studio', 'activeToneKey'],
    studioSignature: ['studio', 'selectedSignatureId'],
    studioSending: ['studio', 'sending'],
    // Note
    noteActiveKey: ['note', 'activeKey'],
    noteDrafts: ['note', 'drafts'],
    noteSaving: ['note', 'saving'],
    // Schedule
    scheduleDraft: ['schedule', 'draft'],
    scheduleOptions: ['schedule', 'options'],
    scheduleSaving: ['schedule', 'saving'],
    // Later
    laterOption: ['later', 'option'],
    laterBulkSelectionKeys: ['later', 'bulkSelectionKeys'],
    laterContextThreadId: ['later', 'contextThreadId'],
    // Customer-vyn
    customerSearch: ['customerSearch'],
    customerFilter: ['customerFilter'],
    customerBatchSelection: ['customerBatchSelection'],
    customerMergeOptions: ['customerMergeOptions'],
    // History-filter
    historySearch: ['runtime', 'historySearch'],
    historyMailboxFilter: ['runtime', 'historyMailboxFilter'],
    historyResultTypeFilter: ['runtime', 'historyResultTypeFilter'],
    historyRangeFilter: ['runtime', 'historyRangeFilter'],
  });

  // state.prefs — preferences (persisted-värden)
  const PREFS_KEY_PATHS = Object.freeze({
    // Top-level
    automationAutopilotEnabled: ['automationAutopilotEnabled'],
    automationScale: ['automationScale'],
    workspacePrefsApplied: ['workspacePrefsApplied'],
    // Runtime-nested
    preferredMailboxId: ['runtime', 'preferredMailboxId'],
    defaultSenderMailbox: ['runtime', 'defaultSenderMailbox'],
    defaultSignatureProfile: ['runtime', 'defaultSignatureProfile'],
    sendEnabled: ['runtime', 'sendEnabled'],
    deleteEnabled: ['runtime', 'deleteEnabled'],
    graphReadEnabled: ['runtime', 'graphReadEnabled'],
    graphReadConnectorAvailable: ['runtime', 'graphReadConnectorAvailable'],
    mailboxScopePinned: ['runtime', 'mailboxScopePinned'],
    // Settings runtime
    themeChoice: ['settingsRuntime', 'choices', 'theme'],
    densityChoice: ['settingsRuntime', 'choices', 'density'],
    profileName: ['settingsRuntime', 'profileName'],
    profileEmail: ['settingsRuntime', 'profileEmail'],
  });

  // Exponera till app.js via global namespace
  window.__AppPaths = Object.freeze({
    UI: UI_KEY_PATHS,
    SELECTION: SELECTION_KEY_PATHS,
    STATUS: STATUS_KEY_PATHS,
    DATA: DATA_KEY_PATHS,
    FORMS: FORMS_KEY_PATHS,
    PREFS: PREFS_KEY_PATHS,
  });
})();
