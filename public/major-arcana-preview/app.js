(() => {
  const WORKSPACE_ID = "major-arcana-preview";

  const canvas = document.querySelector(".preview-canvas");
  const previewWorkspace = document.querySelector(".preview-workspace");
  const previewShell = document.querySelector(".preview-shell");
  const focusShell = document.querySelector(".focus-shell");
  const shellViewSections = Array.from(document.querySelectorAll("[data-shell-view]"));
  const automationShell = document.querySelector(".automation-shell");
  const navViewButtons = Array.from(document.querySelectorAll("[data-nav-view]"));
  const moreMenuToggle = document.querySelector("[data-more-toggle]");
  const moreMenu = document.getElementById("preview-more-menu");
  const focusIntelTabs = document.querySelector(".focus-intel-tabs");
  const focusTabButtons = Array.from(
    document.querySelectorAll(".focus-tab[data-focus-section]")
  );
  const focusPanels = Array.from(document.querySelectorAll("[data-focus-panel]"));
  const studioShell = document.getElementById("studio-shell");
  const noteShell = document.getElementById("note-shell");
  const scheduleShell = document.getElementById("schedule-shell");
  const laterShell = document.getElementById("later-shell");
  const laterContext = document.querySelector("[data-later-context]");
  const mailboxOptionsContainer = document.querySelector(".mailbox-options");
  const laterStatus = document.querySelector("[data-later-status]");
  const sentStatus = document.querySelector("[data-sent-status]");
  const laterMetricValueNodes = {
    count: document.querySelector('[data-later-metric-value="count"]'),
    vip: document.querySelector('[data-later-metric-value="vip"]'),
    resume: document.querySelector('[data-later-metric-value="resume"]'),
  };
  const sentMetricValueNodes = {
    count: document.querySelector('[data-sent-metric-value="count"]'),
    vip: document.querySelector('[data-sent-metric-value="vip"]'),
    scope: document.querySelector('[data-sent-metric-value="scope"]'),
  };
  const mailFeedFilterButtons = Array.from(
    document.querySelectorAll("[data-mail-feed-filter]")
  );
  const mailFeedViewButtons = Array.from(document.querySelectorAll("[data-mail-feed-view]"));
  const mailFeedDensityButtons = Array.from(
    document.querySelectorAll("[data-mail-feed-density]")
  );
  const mailFeedSelectAllButtons = Array.from(
    document.querySelectorAll("[data-mail-feed-select-all]")
  );
  const mailFeedSelectionCountNodes = Array.from(
    document.querySelectorAll("[data-mail-feed-selection-count]")
  );
  const mailFeedUndoButtons = Array.from(document.querySelectorAll("[data-mail-feed-undo]"));
  const mailFeedBulkButtons = Array.from(document.querySelectorAll("[data-mail-feed-bulk]"));
  const integrationsStatus = document.querySelector("[data-integrations-status]");
  const macrosStatus = document.querySelector("[data-macros-status]");
  const settingsStatus = document.querySelector("[data-settings-status]");
  const showcaseStatus = document.querySelector("[data-showcase-status]");
  const settingsSummaryThemeValue = document.querySelector("[data-settings-summary-theme-value]");
  const settingsSummaryThemeCopy = document.querySelector("[data-settings-summary-theme-copy]");
  const settingsSummaryGuardValue = document.querySelector("[data-settings-summary-guard-value]");
  const settingsSummaryGuardCopy = document.querySelector("[data-settings-summary-guard-copy]");
  const settingsSummaryTeamValue = document.querySelector("[data-settings-summary-team-value]");
  const settingsSummaryTeamCopy = document.querySelector("[data-settings-summary-team-copy]");
  const settingsProfileAvatar = document.querySelector("[data-settings-profile-avatar]");
  const settingsProfileName = document.querySelector("[data-settings-profile-name]");
  const settingsProfileEmail = document.querySelector("[data-settings-profile-email]");
  const mailFeedLists = Array.from(document.querySelectorAll("[data-mail-feed-list]"));
  const mailFeedCommandButtons = Array.from(document.querySelectorAll("[data-mail-feed-command]"));
  const integrationCategoryButtons = Array.from(
    document.querySelectorAll("[data-integration-category]")
  );
  const integrationMetricNodes = Array.from(
    document.querySelectorAll("[data-integration-metric]")
  );
  const integrationsGrid = document.querySelector("[data-integrations-grid]");
  const integrationCommandButtons = Array.from(
    document.querySelectorAll("[data-integration-command]")
  );
  const macroMetricNodes = Array.from(document.querySelectorAll("[data-macro-metric]"));
  const macrosList = document.querySelector("[data-macro-list]");
  const macroCommandButtons = Array.from(document.querySelectorAll("[data-macro-command]"));
  const settingsChoiceButtons = Array.from(document.querySelectorAll("[data-settings-choice]"));
  const settingsToggleInputs = Array.from(document.querySelectorAll("[data-settings-toggle]"));
  const settingsActionButtons = Array.from(document.querySelectorAll("[data-settings-action]"));
  const showcaseFeatureButtons = Array.from(
    document.querySelectorAll("[data-showcase-feature]")
  );
  const showcaseJumpButtons = Array.from(document.querySelectorAll("[data-showcase-jump]"));
  const showcaseFocus = document.querySelector("[data-showcase-focus]");
  const showcaseTitleText = document.querySelector("[data-showcase-title-text]");
  const showcaseCopy = document.querySelector("[data-showcase-copy]");
  const showcaseOutcome = document.querySelector("[data-showcase-outcome]");
  const showcaseDetail = document.querySelector("[data-showcase-detail]");
  const showcaseEffectLabel = document.querySelector("[data-showcase-effect-label]");
  const showcaseEffectTitle = document.querySelector("[data-showcase-effect-title]");
  const showcaseEffectCopy = document.querySelector("[data-showcase-effect-copy]");
  const showcaseNextTitle = document.querySelector("[data-showcase-next-title]");
  const showcaseNextCopy = document.querySelector("[data-showcase-next-copy]");
  const showcaseActionPrimary = document.querySelector('[data-showcase-action="primary"]');
  const showcaseActionSecondary = document.querySelector('[data-showcase-action="secondary"]');
  const mailboxAdminShell = document.getElementById("mailbox-admin-shell");
  const mailboxAdminOpenButton = document.querySelector("[data-mailbox-admin-open]");
  const mailboxAdminCloseButtons = Array.from(
    document.querySelectorAll("[data-mailbox-admin-close]")
  );
  const mailboxAdminList = document.querySelector("[data-mailbox-admin-list]");
  const mailboxAdminFormTitle = document.querySelector("[data-mailbox-admin-form-title]");
  const mailboxAdminResetButton = document.querySelector("[data-mailbox-admin-reset]");
  const mailboxAdminNameInput = document.querySelector("[data-mailbox-admin-name]");
  const mailboxAdminEmailInput = document.querySelector("[data-mailbox-admin-email]");
  const mailboxAdminOwnerSelect = document.querySelector("[data-mailbox-admin-owner]");
  const mailboxAdminSignatureNameInput = document.querySelector(
    "[data-mailbox-admin-signature-name]"
  );
  const mailboxAdminSignatureFullNameInput = document.querySelector(
    "[data-mailbox-admin-signature-full-name]"
  );
  const mailboxAdminSignatureTitleInput = document.querySelector(
    "[data-mailbox-admin-signature-title]"
  );
  const mailboxAdminSignatureEditor = document.querySelector(
    "[data-mailbox-admin-signature-editor]"
  );
  const mailboxAdminSignatureButtons = Array.from(
    document.querySelectorAll("[data-mailbox-signature-command]")
  );
  const mailboxAdminFeedback = document.querySelector("[data-mailbox-admin-feedback]");
  const mailboxAdminSaveButton = document.querySelector("[data-mailbox-admin-save]");
  const noteModeShell = document.getElementById("note-mode-shell");
  const noteModeCloseButtons = Array.from(document.querySelectorAll("[data-note-mode-close]"));
  const noteModeOptionButtons = Array.from(
    document.querySelectorAll("[data-note-mode-option]")
  );
  const noteModeContext = document.querySelector("[data-note-mode-context]");
  const macroEditorShell = document.getElementById("macro-editor-shell");
  const macroModalCloseButtons = Array.from(
    document.querySelectorAll("[data-macro-modal-close]")
  );
  const macroModalKicker = document.querySelector("[data-macro-modal-kicker]");
  const macroModalTitle = document.querySelector("[data-macro-modal-title]");
  const macroModalNameInput = document.querySelector("[data-macro-modal-name]");
  const macroModalDescriptionInput = document.querySelector(
    "[data-macro-modal-description]"
  );
  const macroModalTriggerSelect = document.querySelector("[data-macro-modal-trigger]");
  const macroModalFeedback = document.querySelector("[data-macro-modal-feedback]");
  const macroModalSubmitButton = document.querySelector("[data-macro-modal-submit]");
  const settingsProfileShell = document.getElementById("settings-profile-shell");
  const settingsProfileModalCloseButtons = Array.from(
    document.querySelectorAll("[data-settings-profile-modal-close]")
  );
  const settingsProfileModalNameInput = document.querySelector(
    "[data-settings-profile-modal-name]"
  );
  const settingsProfileModalEmailInput = document.querySelector(
    "[data-settings-profile-modal-email]"
  );
  const settingsProfileModalFeedback = document.querySelector(
    "[data-settings-profile-modal-feedback]"
  );
  const settingsProfileModalSubmitButton = document.querySelector(
    "[data-settings-profile-modal-submit]"
  );
  const shellConfirmShell = document.getElementById("shell-confirm-shell");
  const confirmCloseButtons = Array.from(document.querySelectorAll("[data-confirm-close]"));
  const confirmKicker = document.querySelector("[data-confirm-kicker]");
  const confirmTitle = document.querySelector("[data-confirm-title]");
  const confirmCopy = document.querySelector("[data-confirm-copy]");
  const confirmFeedback = document.querySelector("[data-confirm-feedback]");
  const confirmSubmitButton = document.querySelector("[data-confirm-submit]");
  const CONFIRM_DIALOG_DEFINITIONS = {
    mail_feed_delete(context = {}) {
      const normalizedFeed = normalizeKey(context.feed) === "later" ? "later" : "sent";
      const count = Math.max(1, asNumber(context.count, 1));
      return {
        kicker: normalizedFeed === "later" ? "Radera senare" : "Radera skickade",
        title: `Radera ${count} markerade ${count === 1 ? "tråd" : "trådar"}?`,
        copy:
          normalizedFeed === "later"
            ? "De markerade trådarna tas bort från Senare och flyttas till papperskorgen."
            : "De markerade skickade trådarna tas bort från feeden och flyttas till papperskorgen.",
        confirmLabel: count === 1 ? "Radera tråd" : "Radera trådar",
        tone: "danger",
      };
    },
    macro_delete(context = {}) {
      const macroTitle = asText(context.macroTitle, "det här makrot");
      return {
        kicker: "Radera makro",
        title: `Radera "${macroTitle}"?`,
        copy: "Makrot tas bort från biblioteket och kan inte köras igen utan att skapas på nytt.",
        confirmLabel: "Radera makro",
        tone: "danger",
      };
    },
    delete_account_request() {
      return {
        kicker: "Kontoradering",
        title: "Skicka raderingsbegäran?",
        copy: "Detta markerar kontot för radering i backend och kräver efterföljande administrativ hantering.",
        confirmLabel: "Skicka begäran",
        tone: "danger",
      };
    },
  };
  const customerList = document.querySelector("[data-customer-list]");
  const customerMergeGroupsHost = document.querySelector("[data-customer-merge-groups]");
  const customerDetailStack = document.querySelector("[data-customer-detail-stack]");
  const customerBulkCount = document.querySelector("[data-customer-bulk-count]");
  const customerDetailName = document.querySelector("[data-customer-detail-name]");
  const customerEmailList = document.querySelector("[data-customer-email-list]");
  const customerDetailActionButtons = Array.from(
    document.querySelectorAll("[data-customer-detail-action]")
  );
  const customerMergeShell = document.getElementById("customers-merge-shell");
  const customerMergeCloseButtons = Array.from(
    document.querySelectorAll("[data-customer-merge-close]")
  );
  const customerMergePreview = document.querySelector("[data-customer-merge-preview]");
  const customerMergePrimaryOptions = document.querySelector(
    "[data-customer-merge-primary-options]"
  );
  const customerMergeOptionInputs = Array.from(
    document.querySelectorAll("[data-customer-merge-option]")
  );
  const customerMergeFeedback = document.querySelector("[data-customer-merge-feedback]");
  const customerMergeConfirmButton = document.querySelector("[data-customer-merge-confirm]");
  const customerSettingsShell = document.getElementById("customers-settings-shell");
  const customerSettingsCloseButtons = Array.from(
    document.querySelectorAll("[data-customer-settings-close]")
  );
  const customerSettingToggleInputs = Array.from(
    document.querySelectorAll("[data-customer-setting-toggle]")
  );
  const customerSettingsFeedback = document.querySelector(
    "[data-customer-settings-feedback]"
  );
  const customerSplitShell = document.getElementById("customers-split-shell");
  const customerSplitCloseButtons = Array.from(
    document.querySelectorAll("[data-customer-split-close]")
  );
  const customerSplitTitle = document.querySelector("[data-customer-split-title]");
  const customerSplitOptions = document.querySelector("[data-customer-split-options]");
  const customerSplitFeedback = document.querySelector("[data-customer-split-feedback]");
  const customerSplitConfirmButton = document.querySelector("[data-customer-split-confirm]");
  const customerImportShell = document.getElementById("customers-import-shell");
  const customerImportCloseButtons = Array.from(
    document.querySelectorAll("[data-customer-import-close]")
  );
  const customerImportFileInput = document.querySelector("[data-customer-import-file]");
  const customerImportTextInput = document.querySelector("[data-customer-import-text]");
  const customerImportFileName = document.querySelector("[data-customer-import-file-name]");
  const customerImportSummary = document.querySelector("[data-customer-import-summary]");
  const customerImportPreviewList = document.querySelector("[data-customer-import-preview]");
  const customerImportFeedback = document.querySelector("[data-customer-import-feedback]");
  const customerImportPreviewButton = document.querySelector(
    "[data-customer-import-preview-action]"
  );
  const customerImportCommitButton = document.querySelector("[data-customer-import-commit]");
  const automationCollaborationToggleButtons = Array.from(
    document.querySelectorAll("[data-automation-collaboration-toggle]")
  );
  const automationCollaborationPanel = document.querySelector(
    "[data-automation-collaboration]"
  );
  const ADMIN_TOKEN_STORAGE_KEY = "ARCANA_ADMIN_TOKEN";
  const AUTH_RETURN_TO_QUERY_PARAM = "next";

  if (!canvas || !previewWorkspace || !previewShell || !focusShell || !studioShell || !noteShell || !scheduleShell || !laterShell) {
    return;
  }

  const PREVIEW_CONFIG = window.MajorArcanaPreviewConfig;
  const PREVIEW_THREAD_OPS = window.MajorArcanaPreviewThreadOps;
  const PREVIEW_ACTION_ENGINE = window.MajorArcanaPreviewActionEngine;
  const PREVIEW_WORKSPACE_STATE = window.MajorArcanaPreviewWorkspaceState;
  const PREVIEW_REENTRY_STATE = window.MajorArcanaPreviewReentryState;
  const PREVIEW_FOCUS_INTEL_RENDERERS = window.MajorArcanaPreviewFocusIntelRenderers;
  const PREVIEW_QUEUE_RENDERERS = window.MajorArcanaPreviewQueueRenderers;
  const PREVIEW_OVERLAY_RENDERERS = window.MajorArcanaPreviewOverlayRenderers;
  const PREVIEW_ASYNC_ORCHESTRATION = window.MajorArcanaPreviewAsyncOrchestration;
  const PREVIEW_DOM_LIVE_COMPOSITION = window.MajorArcanaPreviewDomLiveComposition;

  if (!PREVIEW_CONFIG) {
    console.error("Major Arcana preview-config saknas.");
    return;
  }

  if (!PREVIEW_THREAD_OPS) {
    console.error("Major Arcana preview thread-ops saknas.");
    return;
  }

  if (!PREVIEW_ACTION_ENGINE) {
    console.error("Major Arcana preview action-engine saknas.");
    return;
  }

  if (!PREVIEW_WORKSPACE_STATE) {
    console.error("Major Arcana preview workspace-state saknas.");
    return;
  }

  if (!PREVIEW_REENTRY_STATE) {
    console.error("Major Arcana preview reentry-state saknas.");
    return;
  }

  if (!PREVIEW_FOCUS_INTEL_RENDERERS) {
    console.error("Major Arcana preview focus/intel-renderers saknas.");
    return;
  }

  if (!PREVIEW_QUEUE_RENDERERS) {
    console.error("Major Arcana preview queue-renderers saknas.");
    return;
  }

  if (!PREVIEW_OVERLAY_RENDERERS) {
    console.error("Major Arcana preview overlay-renderers saknas.");
    return;
  }

  if (!PREVIEW_ASYNC_ORCHESTRATION) {
    console.error("Major Arcana preview async-orchestration saknas.");
    return;
  }

  if (!PREVIEW_DOM_LIVE_COMPOSITION) {
    console.error("Major Arcana preview dom/live-composition saknas.");
    return;
  }

  const {
    DEFAULT_WORKSPACE,
    FOCUS_ACTIONS,
    FOCUS_SIGNALS,
    INTEL_ACTIONS,
    MIN_INTEL_WIDTH,
    MIN_QUEUE_WIDTH,
    NOTE_MODE_PRESETS,
    PILL_ICON_SVGS,
    PRIORITY_LABELS,
    QUEUE_ACTIONS,
    QUEUE_LANE_LABELS,
    QUEUE_LANE_ORDER,
    STUDIO_TRUTH_PRIMARY,
    VISIBILITY_LABELS,
    FOCUS_TRUTH_PRIMARY,
    WORKLIST_TRUTH_PRIMARY,
    WORKLIST_TRUTH_VIEW,
  } = PREVIEW_CONFIG;

  const openButtons = document.querySelectorAll("[data-studio-open]");
  const closeButtons = document.querySelectorAll("[data-studio-close]");
  const contextButtons = document.querySelectorAll("[data-studio-context-toggle]");
  const noteOpenButtons = document.querySelectorAll("[data-note-open]");
  const noteCloseButtons = document.querySelectorAll("[data-note-close]");
  const noteSaveButton = document.querySelector("[data-note-save]");
  const noteFeedback = document.querySelector("[data-note-feedback]");
  const noteText = document.querySelector("[data-note-text]");
  const noteTagInput = document.querySelector("[data-note-tag-input]");
  const noteTagAddButton = document.querySelector("[data-note-tag-add]");
  const notePrioritySelect = document.querySelector("[data-note-priority]");
  const noteVisibilitySelect = document.querySelector("[data-note-visibility]");
  const scheduleOpenButtons = document.querySelectorAll("[data-schedule-open]");
  const scheduleCloseButtons = document.querySelectorAll("[data-schedule-close]");
  const scheduleSaveButton = document.querySelector("[data-schedule-save]");
  const scheduleFeedback = document.querySelector("[data-schedule-feedback]");
  const laterCloseButtons = document.querySelectorAll("[data-later-close]");
  const laterOptionButtons = Array.from(document.querySelectorAll("[data-later-option]"));
  const destinationButtons = Array.from(
    document.querySelectorAll("[data-note-destination-group] .note-destination")
  );
  const templateButtons = Array.from(
    document.querySelectorAll("[data-note-template-group] .note-template-pill")
  );
  const targetLabel = document.querySelector("[data-note-target-label]");
  const noteLivePreview = document.querySelector("[data-note-live-preview]");
  const noteDataStack = document.querySelector("[data-note-data-stack]");
  const noteLinkedList = document.querySelector("[data-note-linked-list]");
  const noteTagsRow = document.querySelector("[data-note-tags]");
  const noteCount = document.querySelector("[data-note-count]");
  const conversationCollapseButton = document.querySelector(".conversation-collapse");
  const conversationHistory = document.getElementById("focus-conversation-history");
  const resizeHandles = Array.from(document.querySelectorAll("[data-resize-handle]"));
  const queueContent = document.querySelector("[data-runtime-legacy-queue]");
  const queueTitle = document.querySelector("[data-queue-title]");
  const truthWorklistLaunchButton = document.querySelector("[data-truth-worklist-launch]");
  const truthWorklistShell = document.querySelector("[data-truth-worklist-shell]");
  const truthWorklistCloseButtons = Array.from(
    document.querySelectorAll("[data-truth-worklist-close]")
  );
  const truthWorklistMeta = document.querySelector("[data-truth-worklist-meta]");
  const truthWorklistSummary = document.querySelector("[data-truth-worklist-summary]");
  const truthWorklistStatus = document.querySelector("[data-truth-worklist-status]");
  const truthWorklistControls = document.querySelector("[data-truth-worklist-controls]");
  const truthWorklistGuidance = document.querySelector("[data-truth-worklist-guidance]");
  const truthWorklistMailboxes = document.querySelector("[data-truth-worklist-mailboxes]");
  const truthWorklistRows = document.querySelector("[data-truth-worklist-rows]");
  const truthWorklistReadoutLink = document.querySelector("[data-truth-worklist-readout]");
  const truthWorklistRelayNote = document.querySelector("[data-truth-worklist-relay-note]");
  const truthWorklistPageButtons = Array.from(
    document.querySelectorAll("[data-truth-worklist-page-button]")
  );
  const truthWorklistPagePanels = Array.from(
    document.querySelectorAll("[data-truth-worklist-page-panel]")
  );
  const queueSummaryFocus = document.querySelector('[data-queue-summary="focus"]');
  const queueSummaryActNow = document.querySelector('[data-queue-summary="act-now"]');
  const queueSummarySprint = document.querySelector('[data-queue-summary="sprint"]');
  const queueSummaryRisk = document.querySelector("[data-queue-summary-risk]");
  const queuePrimaryLaneTag = document.querySelector('.lane-tag[data-queue-lane="all"]');
  const queueActiveLaneLabel = document.querySelector("[data-queue-active-lane-label]");
  const queueLaneCountNodes = Array.from(document.querySelectorAll("[data-queue-lane-count]"));
  const queueLaneButtons = Array.from(document.querySelectorAll("[data-queue-lane]"));
  const queuePrimaryLaneButtons = Array.from(
    document.querySelectorAll(".queue-lane-quickstrip [data-queue-lane]")
  );
  const queueSecondarySignalCountNodes = Array.from(
    document.querySelectorAll("[data-queue-secondary-count]")
  );
  const queueFeedCountNodes = Array.from(document.querySelectorAll("[data-queue-feed-count]"));
  const queueViewJumpButtons = Array.from(document.querySelectorAll("[data-queue-view-jump]"));
  const queueScopeStrip = document.querySelector(".queue-scope-strip");
  const queueCollapsedList = document.querySelector(".collapsed-list");
  const queueCategoryToggleButton = document.querySelector("[data-queue-category-toggle]");
  const queueHistoryShell = document.querySelector("[data-queue-history-shell]");
  const queueHistoryToggle = document.querySelector("[data-queue-history-toggle]");
  const queueHistoryPanel = document.querySelector("[data-queue-history-panel]");
  const queueHistoryList = document.querySelector("[data-queue-history-list]");
  const queueHistoryCount = document.querySelector("[data-queue-history-count]");
  const queueHistoryLoadMoreButton = document.querySelector("[data-queue-history-load-more]");
  const queueQuickLaneStrip = document.querySelector(".queue-lane-quickstrip");
  const queueMailboxScopeLabel = document.querySelector("[data-queue-mailbox-scope-label]");
  const queueMailboxScopeCount = document.querySelector("[data-queue-mailbox-scope-count]");
  const mailboxTriggerLabel = document.querySelector("[data-mailbox-trigger-label]");
  const mailboxTrigger =
    mailboxTriggerLabel && typeof mailboxTriggerLabel.closest === "function"
      ? mailboxTriggerLabel.closest(".mailbox-trigger")
      : document.querySelector(".queue-bottom-row .mailbox-trigger");
  const ownerTriggerLabel = document.querySelector("[data-owner-trigger-label]");
  const mailboxMenuGrid = document.querySelector("[data-mailbox-menu-grid]");
  const mailboxMenuToggle = document.getElementById("mailbox-menu-toggle");
  const ownerMenuGrid = document.querySelector("[data-owner-menu-grid]");
  const ownerMenuNote = document.querySelector("[data-owner-menu-note]");
  const LEGACY_RUNTIME_MAILBOX_EMAILS = Object.freeze({
    contact: "contact@hairtpclinic.com",
    kontakt: "contact@hairtpclinic.com",
    egzona: "egzona@hairtpclinic.com",
    fazli: "fazli@hairtpclinic.com",
    consult: "kons@hairtpclinic.com",
    kons: "kons@hairtpclinic.com",
    info: "info@hairtpclinic.com",
    market: "marknad@hairtpclinic.com",
    marknad: "marknad@hairtpclinic.com",
    receipt: "receipt@hairtpclinic.com",
    kvitto: "receipt@hairtpclinic.com",
  });
  const MAILBOX_TONE_CLASS_BY_TOKEN = Object.freeze({
    egzona: "mailbox-option-egzona",
    contact: "mailbox-option-contact",
    kontakt: "mailbox-option-contact",
    fazli: "mailbox-option-fazli",
    receipt: "mailbox-option-receipt",
    kvitto: "mailbox-option-receipt",
    info: "mailbox-option-info",
    consult: "mailbox-option-consult",
    kons: "mailbox-option-consult",
    market: "mailbox-option-market",
    marknad: "mailbox-option-market",
  });
  const MAILBOX_TONE_CLASS_FALLBACKS = Object.freeze([
    "mailbox-option-egzona",
    "mailbox-option-contact",
    "mailbox-option-fazli",
    "mailbox-option-receipt",
    "mailbox-option-info",
    "mailbox-option-consult",
    "mailbox-option-market",
  ]);
  const LEGACY_RUNTIME_MAILBOXES = Object.freeze(
    mailboxMenuGrid
      ? Array.from(mailboxMenuGrid.querySelectorAll(".mailbox-option"))
          .filter((node) => !node.classList.contains("mailbox-option-add"))
          .map((node, index) => {
            const toneClass = Array.from(node.classList).find(
              (className) =>
                className.startsWith("mailbox-option-") &&
                className !== "mailbox-option" &&
                className !== "mailbox-option-add" &&
                className !== "mailbox-option-custom"
            );
            const label = asText(
              node.querySelector(".mailbox-option-name")?.textContent,
              `Mailbox ${index + 1}`
            );
            const scopeId = toneClass ? toneClass.replace("mailbox-option-", "") : label;
            const id = normalizeMailboxId(scopeId);
            return {
              id,
              label,
              email: resolveRuntimeMailboxPresetEmail(scopeId || label || id),
              owner: "Preset",
              custom: false,
              order: index,
              toneClass: toneClass || "",
            };
          })
      : []
  );
  const ownerMenuToggle = document.getElementById("owner-menu-toggle");
  const mailboxDropdowns = Array.from(document.querySelectorAll(".mailbox-dropdown"));
  const focusTitle = document.getElementById("focus-title");
  const focusTabs = document.querySelector(".focus-tabs");
  const focusStatusLine = document.querySelector("[data-focus-status-line]");
  const focusSignals = document.querySelector("[data-focus-signals]");
  const focusBadgeRow = document.querySelector("[data-focus-badge-row]");
  const focusConversationSection = document.querySelector("[data-focus-conversation]");
  const focusConversationLayout = document.querySelector("[data-focus-conversation-layout]");
  const focusWorkrail = document.querySelector("[data-focus-workrail]");
  const focusCustomerHero = document.querySelector("[data-focus-customer-hero]");
  const focusCustomerSummary = document.querySelector("[data-focus-customer-summary]");
  const focusCustomerStats = document.querySelector("[data-focus-customer-stats]");
  const focusCustomerGrid = document.querySelector("[data-focus-customer-grid]");
  const focusCustomerHistoryTitle = document.querySelector("[data-focus-customer-history-title]");
  const focusCustomerHistoryDescription = document.querySelector(
    "[data-focus-customer-history-description]"
  );
  const focusCustomerHistoryState = document.querySelector("[data-focus-customer-history-state]");
  const focusCustomerHistoryListState = document.querySelector(
    "[data-focus-customer-history-list-state]"
  );
  const focusCustomerHistoryListStateCopy = document.querySelector(
    "[data-focus-customer-history-list-state-copy]"
  );
  const focusIntelPrimary = document.querySelector(".focus-intel-primary");
  const focusIntelPrimaryBody = document.querySelector("[data-intel-primary-body]");
  const focusIntelTitle = document.getElementById("focus-intel-title");
  const intelDateButton = document.querySelector("[data-intel-date]");
  const intelCustomer = document.querySelector("[data-intel-customer]");
  const intelGrid = document.querySelector("[data-intel-grid]");
  const focusIntelReason = document.querySelector(".focus-intel-reason");
  const intelReasonCopy = document.querySelector("[data-intel-reason-copy]");
  const intelPanelCustomer = document.querySelector('[data-intel-panel-group="customer"]');
  const focusIntelPanels = document.querySelector(".focus-intel-panels");

  function getMailboxDropdownParts(source) {
    const dropdown =
      source instanceof Element
        ? source.closest(".mailbox-dropdown")
        : null;
    if (!dropdown) return null;
    const toggle = dropdown.querySelector(".mailbox-menu-toggle");
    const trigger = dropdown.querySelector(".mailbox-trigger");
    const menu = dropdown.querySelector(".mailbox-menu");
    if (!toggle || !trigger || !menu) return null;
    return { dropdown, toggle, trigger, menu };
  }

  function clearMailboxDropdownOverlay(menu) {
    if (!menu) return;
    menu.style.removeProperty("--mailbox-menu-left");
    menu.style.removeProperty("--mailbox-menu-top");
    menu.style.removeProperty("--mailbox-menu-width");
    menu.style.removeProperty("--mailbox-menu-max-height");
  }

  function syncMailboxDropdownOverlay(source) {
    const parts = getMailboxDropdownParts(source);
    if (!parts) return;
    const { dropdown, toggle, trigger, menu } = parts;
    if (!toggle.checked) {
      clearMailboxDropdownOverlay(menu);
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const viewportPadding = 16;
    const menuGap = 10;
    const isOwnerDropdown = dropdown.classList.contains("owner-dropdown");
    const baseWidth = isOwnerDropdown ? 196 : 296;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const desiredWidth = Math.min(
      Math.max(baseWidth, Math.round(triggerRect.width)),
      Math.max(180, viewportWidth - viewportPadding * 2)
    );
    const preferredLeft = isOwnerDropdown
      ? triggerRect.right - desiredWidth
      : triggerRect.left;
    const left = Math.min(
      Math.max(viewportPadding, Math.round(preferredLeft)),
      Math.max(viewportPadding, viewportWidth - viewportPadding - desiredWidth)
    );

    const naturalHeight = Math.max(180, Math.min(menu.scrollHeight + 18, 520));
    const spaceBelow = viewportHeight - triggerRect.bottom - menuGap - viewportPadding;
    const spaceAbove = triggerRect.top - menuGap - viewportPadding;
    let maxHeight = Math.max(160, Math.min(naturalHeight, spaceBelow));
    let top = Math.round(triggerRect.bottom + menuGap);
    if (spaceBelow < 180 && spaceAbove > spaceBelow) {
      maxHeight = Math.max(160, Math.min(naturalHeight, spaceAbove));
      top = Math.max(viewportPadding, Math.round(triggerRect.top - menuGap - maxHeight));
    }

    menu.style.setProperty("--mailbox-menu-left", `${left}px`);
    menu.style.setProperty("--mailbox-menu-top", `${top}px`);
    menu.style.setProperty("--mailbox-menu-width", `${Math.round(desiredWidth)}px`);
    menu.style.setProperty("--mailbox-menu-max-height", `${Math.round(maxHeight)}px`);
  }

  function syncOpenMailboxDropdownOverlays() {
    mailboxDropdowns.forEach((dropdown) => {
      syncMailboxDropdownOverlay(dropdown);
    });
  }

  function closeMailboxDropdowns({ exceptToggle = null } = {}) {
    mailboxDropdowns.forEach((dropdown) => {
      const parts = getMailboxDropdownParts(dropdown);
      if (!parts) return;
      const { toggle, menu } = parts;
      if (exceptToggle && toggle === exceptToggle) return;
      toggle.checked = false;
      clearMailboxDropdownOverlay(menu);
    });
  }
  const intelPanelHistory = document.querySelector('[data-intel-panel-group="history"]');
  const intelPanelSignals = document.querySelector('[data-intel-panel-group="signals"]');
  const intelPanelMedicine = document.querySelector('[data-intel-panel-group="medicine"]');
  const intelPanelTeam = document.querySelector('[data-intel-panel-group="team"]');
  const intelPanelActions = document.querySelector('[data-intel-panel-group="actions"]');
  const scheduleCustomerInput = document.querySelector("[data-schedule-customer]");
  const scheduleCategoryPill = document.querySelector("[data-schedule-category-pill]");
  const scheduleCustomerPill = document.querySelector("[data-schedule-customer-pill]");
  const scheduleDateInput = document.querySelector("[data-schedule-date]");

  const scheduleTimeInput = document.querySelector("[data-schedule-time]");
  const scheduleDoctorSelect = document.querySelector("[data-schedule-doctor]");
  const scheduleCategorySelect = document.querySelector("[data-schedule-category]");
  const scheduleReminderSelect = document.querySelector("[data-schedule-reminder]");
  const scheduleNotesTextarea = document.querySelector("[data-schedule-notes]");
  const scheduleDateHint = document.querySelector("[data-schedule-date-hint]");
  const scheduleTimeHint = document.querySelector("[data-schedule-time-hint]");
  const scheduleDoctorHint = document.querySelector("[data-schedule-doctor-hint]");
  const scheduleCategoryHint = document.querySelector("[data-schedule-category-hint]");
  const scheduleReminderHint = document.querySelector("[data-schedule-reminder-hint]");
  const scheduleNotesHint = document.querySelector("[data-schedule-notes-hint]");
  const scheduleLinkedList = document.querySelector("[data-schedule-linked-list]");
  const scheduleRecommendationCards = Array.from(
    document.querySelectorAll("[data-schedule-rec]")
  );
  const threadContextRows = Array.from(document.querySelectorAll("[data-thread-context]"));
  const queueActionRows = Array.from(document.querySelectorAll("[data-queue-actions]"));
  const focusSignalRows = Array.from(document.querySelectorAll("[data-focus-signals]"));
  const focusActionRows = Array.from(document.querySelectorAll("[data-focus-actions]"));
  const intelActionRows = Array.from(document.querySelectorAll("[data-intel-actions]"));
  let customerRows = Array.from(document.querySelectorAll("[data-customer-row]"));
  const customerSearchInput = document.querySelector("[data-customer-search]");
  const customerFilterSelect = document.querySelector("[data-customer-filter]");
  const customerCommandButtons = Array.from(
    document.querySelectorAll("[data-customer-command]")
  );
  const customerSuggestionsToggle = document.querySelector(
    "[data-customer-suggestions-toggle]"
  );
  const customerSuggestionsPanel = document.querySelector(
    ".customers-rail-panel-suggestions"
  );
  const customerStatus = document.querySelector("[data-customers-status]");
  const customerMetricCards = Array.from(document.querySelectorAll("[data-customer-metric]"));
  let customerMergeGroups = Array.from(
    document.querySelectorAll("[data-customer-merge-group]")
  );
  let customerDetailCards = Array.from(
    document.querySelectorAll("[data-customer-detail]")
  );
  const automationLibraryItems = Array.from(
    document.querySelectorAll("[data-automation-library]")
  );
  const automationNodes = Array.from(document.querySelectorAll("[data-automation-node]"));
  const automationSuggestionCards = Array.from(
    document.querySelectorAll("[data-automation-suggestion]")
  );
  const automationSubnavPills = Array.from(
    document.querySelectorAll(".automation-subnav-pill")
  );
  const automationViews = Array.from(document.querySelectorAll("[data-automation-view]"));
  const automationJumpButtons = Array.from(
    document.querySelectorAll("[data-automation-jump]")
  );
  const automationTemplateCards = Array.from(
    document.querySelectorAll("[data-automation-template]")
  );
  const automationTemplateActionButtons = Array.from(
    document.querySelectorAll("[data-automation-template-action]")
  );
  const analyticsPeriodButtons = Array.from(
    document.querySelectorAll("[data-analytics-period]")
  );
  const analyticsMetricValueNodes = Array.from(
    document.querySelectorAll("[data-analytics-metric-value]")
  );
  const analyticsMetricTrendNodes = Array.from(
    document.querySelectorAll(
      ".analytics-section:not(.analytics-section-live) .analytics-metric-card .analytics-metric-trend"
    )
  );
  const analyticsSelfValueNodes = Array.from(
    document.querySelectorAll("[data-analytics-self-value]")
  );
  const analyticsSelfCaptionNodes = Array.from(
    document.querySelectorAll("[data-analytics-self-caption]")
  );
  const analyticsLeaderboardRows = Array.from(
    document.querySelectorAll("[data-analytics-leaderboard-row]")
  );
  const analyticsTemplateRows = Array.from(
    document.querySelectorAll("[data-analytics-template-row]")
  );
  const analyticsStatus = document.querySelector("[data-analytics-status]");
  const analyticsLiveCards = Array.from(
    document.querySelectorAll("[data-analytics-live-card]")
  );
  const analyticsLiveNarratives = document.querySelector("[data-analytics-live-narratives]");
  const analyticsCoachingAction = document.querySelector("[data-analytics-coaching-action]");
  const analyticsCoachingCopy = document.querySelector(".analytics-coaching-copy p");
  const analyticsCoachingLabel = document.querySelector(".analytics-coaching-copy span");
  const analyticsTrustNotes = {
    team: document.querySelector('[data-analytics-trust-note="team"]'),
    self: document.querySelector('[data-analytics-trust-note="self"]'),
    leaderboard: document.querySelector('[data-analytics-trust-note="leaderboard"]'),
    templates: document.querySelector('[data-analytics-trust-note="templates"]'),
    coaching: document.querySelector('[data-analytics-trust-note="coaching"]'),
  };
  const automationVersionCards = Array.from(
    document.querySelectorAll("[data-automation-version]")
  );
  const automationVersionDetails = Array.from(
    document.querySelectorAll("[data-automation-version-detail]")
  );
  const automationVersionActionButtons = Array.from(
    document.querySelectorAll("[data-automation-version-action]")
  );
  const automationStatus = document.querySelector("[data-automation-status]");
  const automationRunButton = document.querySelector(
    '[data-automation-primary-action="run"]'
  );
  const automationSaveButton = document.querySelector(".automation-save-button");
  const automationRail = document.querySelector(".automation-rail");
  const automationRailToggle = document.querySelector("[data-automation-rail-toggle]");
  const automationCanvasScaleButtons = Array.from(
    document.querySelectorAll("[data-automation-scale]")
  );
  const automationCanvasScaleReadout = document.querySelector(
    "[data-automation-scale-readout]"
  );
  const automationCanvasAddButton = document.querySelector("[data-automation-add-step]");
  const automationAnalysisActionButtons = Array.from(
    document.querySelectorAll("[data-automation-analysis-action]")
  );
  const automationSuggestionActionButtons = Array.from(
    document.querySelectorAll("[data-automation-suggestion-action]")
  );
  const automationTestingActionButtons = Array.from(
    document.querySelectorAll("[data-automation-testing-action]")
  );
  const automationTestingLogList = document.querySelector(".automation-testing-log-list");
  const automationTestingValidationTitle = document.querySelector(
    ".automation-testing-validation h3"
  );
  const automationTestingValidationList = document.querySelector(
    ".automation-testing-validation ul"
  );
  const automationTestingConfigValues = Array.from(
    document.querySelectorAll(".automation-testing-config-grid strong")
  );
  const automationAutopilotToggle = document.querySelector(
    "[data-automation-autopilot-toggle]"
  );
  const automationAutopilotStatusCard = document.querySelector(
    "[data-automation-autopilot-status]"
  );
  const automationAutopilotProposalCards = Array.from(
    document.querySelectorAll("[data-automation-autopilot-proposal]")
  );
  const automationAutopilotActionButtons = Array.from(
    document.querySelectorAll("[data-automation-autopilot-action]")
  );
  const automationAutopilotPendingLabel = document.querySelector(
    ".automation-autopilot-stack-label span"
  );
  const automationAutopilotMetricCards = Array.from(
    document.querySelectorAll(".automation-autopilot-metric")
  );
  const automationAutopilotRecentList = document.querySelector(
    ".automation-autopilot-recent-list"
  );
  const automationAutopilotFootCards = Array.from(
    document.querySelectorAll(".automation-autopilot-foot-card")
  );
  const automationTrustNotes = {
    global: document.querySelector('[data-automation-trust-note="global"]'),
    analysis: document.querySelector('[data-automation-trust-note="analysis"]'),
    testing: document.querySelector('[data-automation-trust-note="testing"]'),
    versioner: document.querySelector('[data-automation-trust-note="versioner"]'),
    autopilot: document.querySelector('[data-automation-trust-note="autopilot"]'),
  };
  const automationTitleHeading = document.getElementById("automation-title");
  const automationAnalysisTitle = document.querySelector(".automation-analysis-title h2");
  const automationTemplatesTitle = document.querySelector(".automation-templates-title h2");
  const automationTestingTitle = document.querySelector(".automation-testing-title h2");
  const automationVersionsTitle = document.querySelector(".automation-versions-title h2");
  const automationAutopilotTitle = document.querySelector(".automation-autopilot-title h2");
  const focusHistoryList = document.querySelector("[data-focus-history-list]");
  const focusHistoryCount = document.querySelector("[data-focus-history-count]");
  const focusHistoryMeta = document.querySelector("[data-focus-history-meta]");
  const focusHistorySearchInput = document.querySelector("[data-focus-history-search]");
  const focusHistoryMailboxRow = document.querySelector("[data-focus-history-mailbox-row]");
  const focusHistoryTypeRow = document.querySelector("[data-focus-history-type-row]");
  const focusHistoryRangeRow = document.querySelector("[data-focus-history-range-row]");
  const focusHistoryReadoutButton = document.querySelector("[data-focus-history-readout]");
  const focusHistoryDeleteButton = document.querySelector("[data-focus-history-delete]");
  const focusHistoryScope = document.querySelector("[data-focus-history-scope]");
  const focusHistoryTitle = document.querySelector("[data-focus-history-title]");
  const focusHistoryDescription = document.querySelector("[data-focus-history-description]");
  const focusCustomerHistoryList = document.querySelector("[data-focus-customer-history-list]");
  const focusCustomerHistoryCount = document.querySelector("[data-focus-customer-history-count]");
  const focusCustomerHistoryMeta = document.querySelector("[data-focus-customer-history-meta]");
  const focusCustomerHistoryReadoutButton = document.querySelector(
    "[data-focus-customer-history-readout]"
  );
  const focusNotesList = document.querySelector("[data-focus-notes-list]");
  const focusNotesCount = document.querySelector("[data-focus-notes-count]");
  const focusNotesEmpty = document.querySelector("[data-focus-notes-empty]");
  const focusNotesRefreshButton = document.querySelector("[data-focus-notes-refresh]");
  const studioTitle = document.querySelector("[data-studio-title]");
  const studioToolbarPills = {
    intent: document.querySelector('[data-studio-toolbar-pill="intent"]'),
    priority: document.querySelector('[data-studio-toolbar-pill="priority"]'),
    value: document.querySelector('[data-studio-toolbar-pill="value"]'),
  };
  const studioAvatar = document.querySelector("[data-studio-avatar]");
  const studioCustomerName = document.querySelector("[data-studio-customer-name]");
  const studioCustomerMood = document.querySelector("[data-studio-customer-mood]");
  const studioCustomerEmail = document.querySelector("[data-studio-customer-email]");
  const studioCustomerPhone = document.querySelector("[data-studio-customer-phone]");
  const studioSourceLockLabel = document.querySelector("[data-studio-source-lock-label]");
  const studioSourceLockNote = document.querySelector("[data-studio-source-lock-note]");
  const studioNextActionTitle = document.querySelector("[data-studio-next-action-title]");
  const studioNextActionNote = document.querySelector("[data-studio-next-action-note]");
  const studioPrimarySuggestion = document.querySelector("[data-studio-primary-suggestion]");
  const studioPrimarySuggestionLabel = document.querySelector(
    "[data-studio-primary-suggestion-label]"
  );
  const studioWhyInFocus = document.querySelector("[data-studio-why-in-focus]");
  const studioStatusValueNodes = {
    owner: document.querySelector('[data-studio-status-value="owner"]'),
    status: document.querySelector('[data-studio-status-value="status"]'),
    sla: document.querySelector('[data-studio-status-value="sla"]'),
    risk: document.querySelector('[data-studio-status-value="risk"]'),
  };
  const studioMiniValueNodes = {
    risk: document.querySelector('[data-studio-mini-value="risk"]'),
    engagement: document.querySelector('[data-studio-mini-value="engagement"]'),
  };
  const studioContextSummaryNodes = {
    ai: document.querySelector('[data-studio-context-summary="ai"]'),
  };
  const studioContextListNodes = {
    ai: document.querySelector('[data-studio-context-list="ai"]'),
    history: document.querySelector('[data-studio-context-list="history"]'),
    preferences: document.querySelector('[data-studio-context-list="preferences"]'),
    recommendations: document.querySelector('[data-studio-context-list="recommendations"]'),
  };
  const studioIncomingAvatar = document.querySelector("[data-studio-incoming-avatar]");
  const studioIncomingName = document.querySelector("[data-studio-incoming-name]");
  const studioIncomingTime = document.querySelector("[data-studio-incoming-time]");
  const studioIncomingLabel = document.querySelector("[data-studio-incoming-label]");
  const studioIncomingBody = document.querySelector("[data-studio-incoming-body]");
  const studioTemplateButtons = Array.from(document.querySelectorAll("[data-studio-template]"));
  const studioComposeFromSelect = document.querySelector("[data-studio-compose-from]");
  const studioComposeToInput = document.querySelector("[data-studio-compose-to]");
  const studioComposeSubjectInput = document.querySelector("[data-studio-compose-subject]");
  const studioEditorRecipient = document.querySelector("[data-studio-editor-recipient]");
  const studioEditorInput = document.querySelector("[data-studio-editor-input]");
  const studioEditorWordCount = document.querySelector("[data-studio-editor-wordcount]");
  const studioEditorSummary = document.querySelector("[data-studio-editor-summary]");
  const studioPolicyPill = document.querySelector("[data-studio-policy]");
  const studioSignatureButtons = Array.from(document.querySelectorAll("[data-studio-signature]"));
  const studioTrackButtons = Array.from(document.querySelectorAll("[data-studio-track]"));
  const studioToneButtons = Array.from(document.querySelectorAll("[data-studio-tone]"));
  const studioRefineButtons = Array.from(document.querySelectorAll("[data-studio-refine]"));
  const studioToolButtons = Array.from(document.querySelectorAll("[data-studio-tool]"));
  const studioSendButton = document.querySelector("[data-studio-send]");
  const studioSendLabel = document.querySelector("[data-studio-send-label]");
  const studioPreviewButton = document.querySelector("[data-studio-preview]");
  const studioSaveDraftButton = document.querySelector("[data-studio-save-draft]");
  const studioDeleteButton = document.querySelector("[data-studio-delete]");
  const studioFeedback = document.querySelector("[data-studio-feedback]");
  const studioPreviewActionButton = document.querySelector(".studio-secondary-button-preview");
  const studioLaterActionButton = document.querySelector(".studio-secondary-button-later");
  const studioDoneActionButton = document.querySelector(".studio-secondary-button-done");

  const THREAD_CONTEXT = {
    anna: {
      mailbox: "Kons",
      intent: "Oklart",
      deadline: "Ingen deadline",
    },
    erik: {
      mailbox: "Info",
      intent: "Oklart",
      deadline: "Ingen deadline",
    },
    maria: {
      mailbox: "Info",
      intent: "Oklart",
      deadline: "Ingen deadline",
    },
  };

  const CUSTOMER_DIRECTORY = {
    johan: {
      name: "Johan Andersson",
      vip: true,
      emailCoverage: 5,
      duplicateCandidate: true,
      profileCount: 3,
      customerValue: 52000,
      totalConversations: 28,
      totalMessages: 207,
    },
    emma: {
      name: "Emma Svensson",
      vip: true,
      emailCoverage: 3,
      duplicateCandidate: true,
      profileCount: 2,
      customerValue: 34500,
      totalConversations: 15,
      totalMessages: 112,
    },
    sara: {
      name: "Sara Lindström",
      vip: false,
      emailCoverage: 2,
      duplicateCandidate: true,
      profileCount: 1,
      customerValue: 18000,
      totalConversations: 8,
      totalMessages: 45,
    },
    johan_a: {
      name: "Johan A.",
      vip: false,
      emailCoverage: 2,
      duplicateCandidate: true,
      profileCount: 1,
      customerValue: 0,
      totalConversations: 1,
      totalMessages: 3,
    },
    erik: {
      name: "Erik Nilsson",
      vip: false,
      emailCoverage: 5,
      duplicateCandidate: false,
      profileCount: 1,
      customerValue: 12400,
      totalConversations: 6,
      totalMessages: 41,
    },
  };

  const CUSTOMER_NAME_TO_KEY = Object.fromEntries(
    Object.entries(CUSTOMER_DIRECTORY).map(([key, item]) => [normalizeKey(item.name), key])
  );

  const ANALYTICS_PERIOD_DATA = {
    today: {
      metrics: {
        reply_time: { value: "1h 48m", trend: "+6%", tone: "positive" },
        sla: { value: "97%", trend: "+4%", tone: "positive" },
        conversations: { value: "18", trend: "", tone: "" },
        csat: { value: "4.9/5", trend: "+3%", tone: "positive" },
      },
      self: {
        closed: "14",
        self_reply_time: "1h 34m",
        templates: "91%",
        upsell: "1 600 kr",
        upsell_count: "1",
        upsellCaption: "intäkt idag",
      },
      leaderboard: [
        { medal: "🏆", name: "Sara L.", score: "18" },
        { medal: "🥈", name: "Egzona K.", score: "16" },
        { medal: "🥉", name: "Johan B.", score: "15" },
      ],
      templates: {
        booking_confirmation: { label: "Bokningsbekräftelse", share: "17%", width: "78%" },
        pricing: { label: "Prissättning", share: "11%", width: "58%" },
        reschedule: { label: "Föreslå ny tid", share: "15%", width: "72%" },
      },
      coaching: {
        label: "Coachningsinsikt",
        copy:
          "Du svarar snabbt idag. Fortsätt med mallar för prisfrågor så håller du svarstiden under två timmar.",
        action: "Visa prismall",
      },
    },
    week: {
      metrics: {
        reply_time: { value: "2h 14m", trend: "-12%", tone: "negative" },
        sla: { value: "94%", trend: "+3%", tone: "positive" },
        conversations: { value: "47", trend: "", tone: "" },
        csat: { value: "4.7/5", trend: "+5%", tone: "positive" },
      },
      self: {
        closed: "47",
        self_reply_time: "1h 52m",
        templates: "89%",
        upsell: "4 200 kr",
        upsell_count: "3",
        upsellCaption: "intäkt genererad",
      },
      leaderboard: [
        { medal: "🏆", name: "Sara L.", score: "62" },
        { medal: "🥈", name: "Egzona K.", score: "58" },
        { medal: "🥉", name: "Johan B.", score: "53" },
      ],
      templates: {
        booking_confirmation: { label: "Bokningsbekräftelse", share: "14%", width: "82%" },
        pricing: { label: "Prissättning", share: "12%", width: "67%" },
        reschedule: { label: "Föreslå ny tid", share: "11%", width: "86%" },
      },
      coaching: {
        label: "Coachningsinsikt",
        copy:
          "Du är 23% långsammare på prisfrågor jämfört med ditt genomsnitt. Överväg att använda “Prissättning”-mallen oftare för att spara tid.",
        action: "Visa prismall",
      },
    },
    month: {
      metrics: {
        reply_time: { value: "2h 02m", trend: "-4%", tone: "negative" },
        sla: { value: "95%", trend: "+2%", tone: "positive" },
        conversations: { value: "182", trend: "", tone: "" },
        csat: { value: "4.8/5", trend: "+2%", tone: "positive" },
      },
      self: {
        closed: "184",
        self_reply_time: "1h 49m",
        templates: "87%",
        upsell: "14 800 kr",
        upsell_count: "11",
        upsellCaption: "månatlig intäkt",
      },
      leaderboard: [
        { medal: "🏆", name: "Sara L.", score: "241" },
        { medal: "🥈", name: "Egzona K.", score: "229" },
        { medal: "🥉", name: "Johan B.", score: "211" },
      ],
      templates: {
        booking_confirmation: { label: "Bokningsbekräftelse", share: "18%", width: "84%" },
        pricing: { label: "Prissättning", share: "15%", width: "73%" },
        reschedule: { label: "Föreslå ny tid", share: "16%", width: "88%" },
      },
      coaching: {
        label: "Coachningsinsikt",
        copy:
          "Månadstrenden visar att bokningsbekräftelser driver bäst tempo. Låt prismallar avlasta när inflödet ökar.",
        action: "Öppna mallbibliotek",
      },
    },
  };

  const AUTOMATION_TEMPLATE_CONFIGS = {
    churn_guard: {
      flowTitle: "VIP-onboardingsekvens",
      analysisTitle: 'Prestandainsikter för “VIP-onboardingsekvens”',
      templatesTitle: "Färdiga arbetsflöden från communityn",
      testingTitle: "Testkörning med simulerad data",
      versionsTitle: "Spara ändringar och återställ vid behov",
      autopilotTitle: "Intelligent självoptimering",
      testingConfig: {
        customer: "Emma Andersson",
        trigger: "customer.create",
        time: "2026-03-27 10:00",
      },
      nodes: {
        trigger: {
          title: "Ny VIP-kund",
          lines: ["Händelse: customer.created", "Filter: isVIP = true"],
        },
        welcome: {
          title: "Skicka välkomstmejl",
          lines: ["Mall: vip-welcome", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Tilldela senior",
          lines: ["Tilldela till: senior-specialist"],
        },
        wait: {
          title: "Vänta 3 dagar",
          lines: ["Varaktighet: 3d"],
        },
        condition: {
          title: "Kontrollera engagemang",
          lines: ["Villkor: email.opened = true"],
        },
        guide: {
          title: "Skicka produktguide",
          lines: ["Mall: product-tour"],
        },
        reminder: {
          title: "Uppföljningspåminnelse",
          lines: ["Mall: vip-reminder"],
        },
      },
    },
    upsell_flow: {
      flowTitle: "Merförsäljningssekvens",
      analysisTitle: 'Prestandainsikter för “Merförsäljningssekvens”',
      templatesTitle: "Utvalda mallar för merförsäljning och uppgradering",
      testingTitle: "Testkörning för merförsäljningsflöde",
      versionsTitle: "Versioner för merförsäljningsflödet",
      autopilotTitle: "Autopilot för merförsäljning",
      testingConfig: {
        customer: "Johan Andersson",
        trigger: "purchase.completed",
        time: "2026-03-27 13:30",
      },
      nodes: {
        trigger: {
          title: "Nylig behandling klar",
          lines: ["Händelse: purchase.completed", "Filter: package = premium"],
        },
        welcome: {
          title: "Skicka uppgraderingsmejl",
          lines: ["Mall: upsell-offer", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Flagga ansvarig agent",
          lines: ["Tilldela till: revenue-specialist"],
        },
        wait: {
          title: "Vänta 2 dagar",
          lines: ["Varaktighet: 2d"],
        },
        condition: {
          title: "Kontrollera intresse",
          lines: ["Villkor: email.clicked = true"],
        },
        guide: {
          title: "Skicka behandlingsguide",
          lines: ["Mall: product-tour-plus"],
        },
        reminder: {
          title: "Skicka påminnelse",
          lines: ["Mall: upsell-reminder"],
        },
      },
    },
    sla_guardian: {
      flowTitle: "SLA-väktare",
      analysisTitle: 'Prestandainsikter för “SLA-väktare”',
      templatesTitle: "Utvalda mallar för SLA, fallback och eskalering",
      testingTitle: "Testkörning för SLA-vakt",
      versionsTitle: "Versioner för SLA-väktare",
      autopilotTitle: "Autopilot för SLA-övervakning",
      testingConfig: {
        customer: "Sara Lindström",
        trigger: "message.inbound",
        time: "2026-03-27 08:45",
      },
      nodes: {
        trigger: {
          title: "Inkommande fråga",
          lines: ["Händelse: message.inbound", "Filter: slaRisk = high"],
        },
        welcome: {
          title: "Skicka första svar",
          lines: ["Mall: sla-first-touch", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Eskalera till senior",
          lines: ["Tilldela till: queue-sla"],
        },
        wait: {
          title: "Vänta 2 timmar",
          lines: ["Varaktighet: 2h"],
        },
        condition: {
          title: "Kontrollera fallback-slot",
          lines: ["Villkor: reply.received = false"],
        },
        guide: {
          title: "Skicka återkopplingsguide",
          lines: ["Mall: sla-guidance"],
        },
        reminder: {
          title: "Skicka SLA-påminnelse",
          lines: ["Mall: sla-reminder"],
        },
      },
    },
    holiday_outreach: {
      flowTitle: "Helg-autosvar",
      analysisTitle: 'Prestandainsikter för “Helg-autosvar”',
      templatesTitle: "Mallar för helg- och frånvaroflöden",
      testingTitle: "Testkörning för helg-autosvar",
      versionsTitle: "Versioner för helg-autosvar",
      autopilotTitle: "Autopilot för helgflöden",
      testingConfig: {
        customer: "Erik Nilsson",
        trigger: "mailbox.out_of_office",
        time: "2026-03-27 17:00",
      },
      nodes: {
        trigger: {
          title: "Helgläge aktiverat",
          lines: ["Händelse: mailbox.out_of_office", "Filter: day = friday"],
        },
        welcome: {
          title: "Skicka autosvar",
          lines: ["Mall: holiday-autoreply", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Märk fallback-ansvarig",
          lines: ["Tilldela till: support-duty"],
        },
        wait: {
          title: "Vänta till måndag",
          lines: ["Varaktighet: 60h"],
        },
        condition: {
          title: "Kontrollera ny aktivitet",
          lines: ["Villkor: email.replied = false"],
        },
        guide: {
          title: "Skicka kontaktguide",
          lines: ["Mall: emergency-guide"],
        },
        reminder: {
          title: "Skicka måndagspåminnelse",
          lines: ["Mall: monday-restart"],
        },
      },
    },
    payment_reminder: {
      flowTitle: "Betalningspåminnelsesekvens",
      analysisTitle: 'Prestandainsikter för “Betalningspåminnelsesekvens”',
      templatesTitle: "Mallar för faktura, pris och betalningsuppföljning",
      testingTitle: "Testkörning för betalningspåminnelse",
      versionsTitle: "Versioner för betalningspåminnelser",
      autopilotTitle: "Autopilot för betalningsflöden",
      testingConfig: {
        customer: "Anna Karlsson",
        trigger: "invoice.overdue",
        time: "2026-03-27 11:15",
      },
      nodes: {
        trigger: {
          title: "Faktura förfallen",
          lines: ["Händelse: invoice.overdue", "Filter: amount > 0"],
        },
        welcome: {
          title: "Skicka betalningspåminnelse",
          lines: ["Mall: payment-reminder", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Notera ekonomiansvarig",
          lines: ["Tilldela till: finance-ops"],
        },
        wait: {
          title: "Vänta 24 timmar",
          lines: ["Varaktighet: 24h"],
        },
        condition: {
          title: "Kontrollera betalning",
          lines: ["Villkor: invoice.paid = false"],
        },
        guide: {
          title: "Skicka betalningsplan",
          lines: ["Mall: payment-plan"],
        },
        reminder: {
          title: "Skicka eskalering",
          lines: ["Mall: payment-escalation"],
        },
      },
    },
    vip_fast_track: {
      flowTitle: "VIP Fast Track",
      analysisTitle: 'Prestandainsikter för “VIP Fast Track”',
      templatesTitle: "Premiummallar för VIP och snabbspår",
      testingTitle: "Testkörning för VIP Fast Track",
      versionsTitle: "Versioner för VIP Fast Track",
      autopilotTitle: "Autopilot för VIP Fast Track",
      testingConfig: {
        customer: "Johan Andersson",
        trigger: "vip.intent.detected",
        time: "2026-03-27 09:20",
      },
      nodes: {
        trigger: {
          title: "VIP-intent upptäckt",
          lines: ["Händelse: vip.intent.detected", "Filter: valueTier = premium"],
        },
        welcome: {
          title: "Skicka VIP-kort intro",
          lines: ["Mall: vip-fast-track", "Till: {{customer.email}}"],
        },
        assign: {
          title: "Tillsätt VIP-koordinator",
          lines: ["Tilldela till: vip-desk"],
        },
        wait: {
          title: "Vänta 6 timmar",
          lines: ["Varaktighet: 6h"],
        },
        condition: {
          title: "Kontrollera svarsvilja",
          lines: ["Villkor: email.opened = true"],
        },
        guide: {
          title: "Skicka premiumguide",
          lines: ["Mall: vip-guide"],
        },
        reminder: {
          title: "Skicka VIP-ping",
          lines: ["Mall: vip-ping"],
        },
      },
    },
  };

  const AUTOMATION_TEST_SCENARIOS = {
    baseline: {
      title: "Validering godkänd",
      items: [
        "Inga oändliga loopar upptäckta",
        "Alla obligatoriska fält finns",
        "SLA-begränsningar respekteras",
        "Felhantering konfigurerad",
      ],
      log: [
        { time: "10:00:00", title: "Arbetsflöde startat", copy: "", tone: "ok" },
        { time: "10:00:01", title: "Trigger: Ny VIP-kund", copy: "Kund: Emma Andersson", tone: "ok" },
        { time: "10:00:02", title: "Skicka välkomst-e-post", copy: "E-post-ID: email_123", tone: "ok" },
        { time: "10:00:03", title: "Tilldela till senior", copy: "Tilldelad till: Sara L.", tone: "ok" },
        { time: "10:00:04", title: "Vänta 3 dagar", copy: "Återupptas: 2026-03-30 10:00", tone: "wait" },
      ],
    },
    run: {
      title: "Validering godkänd",
      items: [
        "Körningen passerade utan regressionsvarning",
        "Villkorsgrenen gav förväntat utfall",
        "Fallback-spår verifierat i samma körning",
        "Felhantering svarade inom 2 sekunder",
      ],
      log: [
        { time: "10:00:00", title: "Arbetsflöde startat", copy: "", tone: "ok" },
        { time: "10:00:01", title: "Trigger: Ny VIP-kund", copy: "Kund: Emma Andersson", tone: "ok" },
        { time: "10:00:02", title: "Skicka välkomst-e-post", copy: "E-post-ID: email_123", tone: "ok" },
        { time: "10:00:03", title: "Tilldela till senior", copy: "Tilldelad till: Sara L.", tone: "ok" },
        { time: "10:00:04", title: "Vänta 3 dagar", copy: "Simulerad väntan klar", tone: "ok" },
        { time: "10:00:05", title: "Kontrollera engagemang", copy: "Villkor: email.opened = true", tone: "ok" },
        { time: "10:00:06", title: "Skicka produktguide", copy: "Mall: product-tour", tone: "ok" },
      ],
    },
    skip: {
      title: "Validering kräver uppföljning",
      items: [
        "Väntesteget hoppades över manuellt",
        "Fallback-mejl skickades för verifiering",
        "SLA-tak hölls i simulerad körning",
        "Lägg gärna till extra verifiering av CTA innan publicering",
      ],
      log: [
        { time: "10:00:00", title: "Arbetsflöde startat", copy: "", tone: "ok" },
        { time: "10:00:01", title: "Trigger: Ny VIP-kund", copy: "Kund: Emma Andersson", tone: "ok" },
        { time: "10:00:02", title: "Skicka välkomst-e-post", copy: "E-post-ID: email_123", tone: "ok" },
        { time: "10:00:03", title: "Tilldela till senior", copy: "Tilldelad till: Sara L.", tone: "ok" },
        { time: "10:00:04", title: "Vänta 3 dagar", copy: "Hoppades över för manuell verifikation", tone: "wait" },
        { time: "10:00:05", title: "Uppföljningspåminnelse", copy: "Mall: vip-reminder", tone: "ok" },
      ],
    },
  };

  const AUTOMATION_AUTOPILOT_BASE_RECENT = [
    { title: 'Minskade "Bokningsflöde" från 7 → 5 steg', stamp: "Idag", delta: "+6%" },
    { title: 'Ökade "Merförsäljningssekvens" konvertering', stamp: "Idag", delta: "+18%" },
    { title: "Auto-fixade 3 timeout-problem", stamp: "Igår", delta: "100% stabil" },
  ];

  const BASE_HISTORY_ITEMS = [
    {
      typeLabel: "E-post skickat",
      mailbox: "Kons",
      title: "RE: CCO-next live send inspect",
      text:
        "Detta är ett nytt verifieringsmail från CCO-next för att kontrollera den mail-säkra signaturversionen.",
      timestamp: "2026-03-26T21:39:00.000Z",
    },
    {
      typeLabel: "E-post skickat",
      mailbox: "Kons",
      title: "RE: CCO-next live send inspect",
      text:
        "Detta är ett nytt verifieringsmail från CCO-next för att kontrollera den omgjorda signaturpreviewn utan CSS-omritning.",
      timestamp: "2026-03-26T20:39:00.000Z",
    },
    {
      typeLabel: "E-post skickat",
      mailbox: "Kons",
      title: "RE: CCO-next live send inspect",
      text:
        "Detta är ett nytt verifieringsmail från CCO-next för att kontrollera den senaste signaturversionen.",
      timestamp: "2026-03-26T20:33:00.000Z",
    },
  ];

  const AUX_VIEWS = new Set([
    "later",
    "sent",
    "integrations",
    "macros",
    "settings",
    "showcase",
  ]);
  const AUTOMATION_VIEW_ALIASES = Object.freeze({
    templates: "mallar",
    workflows: "byggare",
  });

  const CUSTOMER_PROFILE_DETAILS = {
    johan: {
      emails: ["johan@gmail.com", "johan@hairtpclinic.com", "johan.a@newwork.se"],
      phone: "+46 70 123 4567",
      mailboxes: ["Kons", "Info", "Contact"],
    },
    emma: {
      emails: ["emma.svensson@gmail.com", "emma@workmail.se"],
      phone: "+46 72 456 7890",
      mailboxes: ["Kons", "Info"],
    },
    sara: {
      emails: ["sara.lindstrom@company.se"],
      phone: "+46 76 234 5678",
      mailboxes: ["Info", "Contact"],
    },
    johan_a: {
      emails: ["johan.a@newwork.se", "johan@gmail.com"],
      phone: "+46 70 123 4567",
      mailboxes: ["Kons", "Contact"],
    },
    erik: {
      emails: ["erik.nilsson@gmail.com", "erik@followup.se"],
      phone: "+46 73 345 6789",
      mailboxes: ["Info"],
    },
  };

  const DEFAULT_CUSTOMER_SETTINGS = {
    auto_merge: true,
    highlight_duplicates: true,
    strict_email: false,
  };

  const MAIL_FEEDS = {
    later: [
      {
        key: "anna_snooze",
        customerKey: "anna",
        customerName: "Anna Karlsson",
        mailbox: "Kons",
        title: "Återuppta med två eftermiddagstider",
        preview: "Snoozad efter reply-later. Kunden väntar på tydliga tider efter 15:00.",
        meta: "Återupptas idag 09:00",
      },
      {
        key: "vip_followup",
        customerKey: "johan",
        customerName: "Johan Andersson",
        mailbox: "Kons",
        title: "VIP-uppföljning efter fast track",
        preview: "Behöver återupptas när senior-specialisten bekräftar fallback-slot.",
        meta: "Återupptas imorgon 09:00",
      },
      {
        key: "pricing_hold",
        customerKey: "emma",
        customerName: "Emma Svensson",
        mailbox: "Info",
        title: "Prissättning pausad tills konsult återkommer",
        preview: "Väntar på internt klartecken innan nytt kundsvar skickas.",
        meta: "Återupptas måndag 09:00",
      },
    ],
    sent: [
      {
        key: "sent_1",
        customerKey: "anna",
        customerName: "Anna Karlsson",
        mailbox: "Kons",
        title: "RE: Bekräftad bokning för fredag 09:00",
        preview: "Skickat från Kons med mall 'Bokningsbekräftelse' och nästa steg i samma svar.",
        meta: "Idag 21:39",
      },
      {
        key: "sent_2",
        customerKey: "johan",
        customerName: "Johan Andersson",
        mailbox: "Info",
        title: "RE: VIP Fast Track - välkomstsekvens",
        preview: "Skickat från Info via automationen VIP Fast Track.",
        meta: "Idag 20:39",
      },
      {
        key: "sent_3",
        customerKey: "emma",
        customerName: "Emma Svensson",
        mailbox: "Kons",
        title: "RE: Föreslå ny tid",
        preview: "Skickat med mallen 'Föreslå ny tid' och tydlig fallback-slot.",
        meta: "Igår 18:05",
      },
    ],
  };

  const INTEGRATION_CATALOG = [
    {
      key: "calendly",
      category: "calendar",
      label: "Calendly",
      copy: "Bokning med ett klick direkt i konversationer, uppföljning och fokuserad kalenderstyrning.",
      owner: "Sara Lindberg",
      connected: true,
    },
    {
      key: "stripe",
      category: "payment",
      label: "Stripe",
      copy: "Skicka betalningslänkar, följ transaktioner och håll betalningspåminnelser i samma arbetsyta.",
      owner: "Finance Ops",
      connected: true,
    },
    {
      key: "twilio",
      category: "communication",
      label: "Twilio",
      copy: "Lägg till SMS och röstsamtal som fallback-kanal för svar senare, uppföljning och VIP-eskalering.",
      owner: "Customer Care",
      connected: false,
    },
    {
      key: "slack",
      category: "communication",
      label: "Slack",
      copy: "Skicka teamaviseringar, handoff-signaler och eskaleringslarm utan att lämna CCO.",
      owner: "Ops Lead",
      connected: true,
    },
    {
      key: "looker",
      category: "analytics",
      label: "Looker",
      copy: "Dela dashboards och analytics-exporter externt utan att skapa ett parallellt operativt flöde.",
      owner: "Data Team",
      connected: false,
    },
    {
      key: "zapier",
      category: "automation",
      label: "Zapier",
      copy: "Starta externa arbetsflöden från buildern utan att lämna automationsytan.",
      owner: "Automation Desk",
      connected: false,
    },
  ];

  const MACRO_LIBRARY = [
    {
      key: "pricing_followup",
      title: "Pris & finansieringsspår",
      tone: "violet",
      mode: "manual",
      actionCount: 3,
      copy: "Fyller svarsutkastet med prissteg, delbetalning och nästa tydliga drag.",
    },
    {
      key: "vip_recovery",
      title: "VIP återhämtning",
      tone: "blue",
      mode: "auto",
      actionCount: 2,
      copy: "Aktiveras när en VIP-tråd närmar sig SLA-brott och öppnar rätt studioflöde direkt.",
    },
    {
      key: "post_treatment",
      title: "Eftervårdssteg",
      tone: "green",
      mode: "manual",
      actionCount: 3,
      copy: "Skapar anteckning, schemalägger uppföljning och markerar kundhistorik med rätt behandlingsspår.",
    },
  ];

  const SHOWCASE_FEATURES = {
    command_palette: {
      focus: "Snabbnavigering",
      title: "⌨️ Kommandopalett",
      copy:
        "Tryck ⌘K för att hoppa mellan konversationer, kunder, automationer och operativa actions utan att lämna arbetsflödet.",
      outcome: "Snabbare beslut med mindre klick mellan vyer.",
      detail:
        "Global sökning och snabbåtgärder gör att operatören kan byta yta utan att tappa fokus eller kontext.",
      effectLabel: "Operativ effekt",
      effectTitle: "Fokus",
      effectCopy: "Mindre klick mellan vyer",
      nextTitle: "Knyt ihop genvägarna med rätt vyer",
      nextCopy: "Låt kommandopaletten hoppa direkt till de ytor där beslutet faktiskt tas.",
      primaryAction: { label: "Öppna makron", jump: "macros" },
      secondaryAction: { label: "Gå till konversationer", jump: "conversations" },
    },
    bulk_ops: {
      focus: "Batcharbete",
      title: "🚀 Massåtgärder",
      copy:
        "Markera flera profiler, öppna massammanfoga och driv igenom identitetsstädning utan att lämna kundvyn.",
      outcome: "Färre manuella merge-pass och tydligare kundbild.",
      detail:
        "Massåtgärder samlar repetitiva kundoperationer i ett pass i stället för att kräva flera manuella rundor.",
      effectLabel: "Operativ effekt",
      effectTitle: "Tempo",
      effectCopy: "Snabbare städning i kundregistret",
      nextTitle: "Öppna kundvyn i batch-läge",
      nextCopy: "Markera flera profiler och låt högerrailen driva merge-flödet.",
      primaryAction: { label: "Öppna kunder", jump: "customers" },
      secondaryAction: { label: "Öppna inställningar", jump: "settings" },
    },
    saved_views: {
      focus: "Filtrering",
      title: "🗂️ Sparade vyer",
      copy:
        "Lås återkommande urval för arbetskö, senare-listor och kundlistor så att teamet kan växla läge utan att bygga om filtren varje gång.",
      outcome: "Mindre omställningstid mellan prioriteringslägen.",
      detail:
        "Sparade vyer ger samma utgångspunkt för triage, uppföljning och kundstädning oavsett vem som tar över skiftet.",
      effectLabel: "Operativ effekt",
      effectTitle: "Utfall",
      effectCopy: "Snabbare växling mellan sparade lägen",
      nextTitle: "Knyt vyerna till arbetsköns filter",
      nextCopy: "Bygg vidare på arbetsköns logik och låt vyerna spara mailbox, ägare och status tillsammans.",
      primaryAction: { label: "Gå till konversationer", jump: "conversations" },
      secondaryAction: { label: "Öppna senare", jump: "later" },
    },
    collision: {
      focus: "Kundskydd",
      title: "👥 Kollisionsdetektering",
      copy:
        "När två profiler delar telefon eller e-post lyfter ytan förslag direkt i railen innan fel svar går ut.",
      outcome: "Mindre risk för fel kund, fel ton eller fel historik i fokusytan.",
      detail:
        "Kollisionsdetektering ska stoppa felaktiga svar innan de lämnar arbetsytan genom att göra konfliktbilden synlig direkt i railen.",
      effectLabel: "Operativ effekt",
      effectTitle: "Skydd",
      effectCopy: "Färre felmatchningar mellan kunder",
      nextTitle: "Öppna identitetsflödet direkt från förslaget",
      nextCopy: "Låt accept/avfärda och merge-val leva i samma kundyta utan extra modaler i första steget.",
      primaryAction: { label: "Öppna kunder", jump: "customers" },
      secondaryAction: { label: "Öppna inställningar", jump: "settings" },
    },
    ai_assistant: {
      focus: "Stöd i realtid",
      title: "🤖 AI-assistent",
      copy:
        "Lyft fram sammanfattningar, nästa steg och riskflaggor när operatören är mitt i tråden i stället för att skicka dem till en separat sida.",
      outcome: "Mer beslutsstöd utan att lämna arbetsytan.",
      detail:
        "AI-assistenten ska stödja operatören i kontext: i fokusytan, i kundintelligensen och i studion, inte som en fristående app.",
      effectLabel: "Operativ effekt",
      effectTitle: "Fokus",
      effectCopy: "Mer stöd där svaren faktiskt skrivs",
      nextTitle: "Knyt assistenten till fokusytan",
      nextCopy: "Visa sammanfattning, nästa steg och blockerare i samma arbetskolumn som konversationen.",
      primaryAction: { label: "Gå till konversationer", jump: "conversations" },
      secondaryAction: { label: "Öppna analys", jump: "analytics" },
    },
    macros: {
      focus: "Repetition",
      title: "🎬 Makron",
      copy:
        "Återanvänd återkommande svarsspår, uppföljningar och anteckningsflöden genom att köra makron från samma shell.",
      outcome: "Jämnare kvalitet i operativa svar och snabbare onboarding av teamet.",
      detail:
        "Makron samlar svar, nästa steg och följdhandlingar i ett körbart block i stället för att sprida logiken över flera verktyg.",
      effectLabel: "Operativ effekt",
      effectTitle: "Återanvändning",
      effectCopy: "Fler standardiserade svar med mindre friktion",
      nextTitle: "Knyt makron till studio och automation",
      nextCopy: "Låt samma makro gå att köra direkt i studion eller öppna som byggsten i automation.",
      primaryAction: { label: "Öppna makron", jump: "macros" },
      secondaryAction: { label: "Öppna automation", jump: "automation" },
    },
    customer_journey: {
      focus: "Helhetsbild",
      title: "🗺️ Kundresa",
      copy:
        "Samla viktiga steg, behandlingar, blockerare och nästa rekommenderade moment i en tydlig tidslinje över kunden.",
      outcome: "Bättre överblick över var kunden faktiskt befinner sig.",
      detail:
        "Kundresan ska hjälpa operatören att förstå helheten över flera mailboxar och kontaktpunkter utan att gräva i råhistorik först.",
      effectLabel: "Operativ effekt",
      effectTitle: "Utfall",
      effectCopy: "Tydligare nästa steg per kund",
      nextTitle: "Knyt tidslinjen till kundhistoriken",
      nextCopy: "Visa resan i fokusytans kundhistorik och låt den mata beslut i kundintelligensen.",
      primaryAction: { label: "Öppna kunder", jump: "customers" },
      secondaryAction: { label: "Gå till konversationer", jump: "conversations" },
    },
    snooze: {
      focus: "Timing",
      title: "⏰ Senare-läge",
      copy:
        "Skicka trådar till Senare från både arbetskö och fokusyta och plocka upp dem igen exakt när kundens timing är rätt.",
      outcome: "Mer kontroll över återupptag utan att förlora kontext eller studio-läge.",
      detail:
        "Senare-läget ska vara den tydliga återupptagningsytan för snoozade trådar, inte ett doldt sidospår i huvudnavigeringen.",
      effectLabel: "Operativ effekt",
      effectTitle: "Timing",
      effectCopy: "Återuppta rätt tråd vid rätt tidpunkt",
      nextTitle: "Knyt snooze till arbetskön och fokusytan",
      nextCopy: "Låt operatören snooza från fokusytan men återuppta från en tydlig Senare-yta.",
      primaryAction: { label: "Öppna senare", jump: "later" },
      secondaryAction: { label: "Gå till konversationer", jump: "conversations" },
    },
  };

  const PRIORITY_VALUES = Object.fromEntries(
    Object.entries(PRIORITY_LABELS).map(([value, label]) => [label.toLowerCase(), value])
  );
  const VISIBILITY_VALUES = Object.fromEntries(
    Object.entries(VISIBILITY_LABELS).map(([value, label]) => [label.toLowerCase(), value])
  );

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createCustomerRuntime() {
    return {
      loading: false,
      loaded: false,
      saving: false,
      identitySuggestionsLoading: false,
      authRequired: false,
      error: "",
      duplicateMetric: 0,
      mergedInto: {},
      dismissedSuggestionIds: [],
      acceptedSuggestionIds: [],
      identitySuggestionGroups: {},
      directory: {},
      details: {},
      profileCounts: {},
      liveHydratedThreadIds: [],
      splitModalOpen: false,
      splitSourceKey: "",
      splitEmail: "",
    };
  }

  function createCustomerImportRuntime() {
    return {
      open: false,
      fileName: "",
      sourceText: "",
      sourceBinaryBase64: "",
      sourceFormat: "",
      preview: null,
      rowEditsDirty: false,
      loadingPreview: false,
      committing: false,
    };
  }

  function createMailFeedRuntime() {
    return {
      later: {
        filter: "all",
        view: "card",
        density: "balanced",
        selectedKeys: [],
      },
      sent: {
        filter: "all",
        view: "card",
        density: "balanced",
        selectedKeys: [],
      },
    };
  }

  function createAutomationRuntime() {
    return {
      loading: false,
      authRequired: false,
      error: "",
      syncingTemplateKey: "",
      templateRecordsByKey: {},
      versionsByKey: {},
      activeVersionIdByKey: {},
      lastEvaluationByKey: {},
      dismissedSuggestionKeys: [],
      appliedSuggestionKeys: [],
      testingScenario: "baseline",
      autopilotRecent: cloneJson(AUTOMATION_AUTOPILOT_BASE_RECENT),
      autopilotPendingCount: 3,
      autopilotAutoFixCount: 7,
      autopilotTimeSaved: "23.4h",
      autopilotPerformance: "+18%",
      autopilotResolved: {},
      autopilotApprovedCount: 0,
    };
  }

  function createAnalyticsRuntime() {
    return {
      loading: false,
      loaded: false,
      authRequired: false,
      partial: false,
      error: "",
      lastLoadedAt: "",
      requestId: 0,
      monitorMetrics: null,
      readiness: null,
      ownerDashboard: null,
      pilotReport: null,
      riskSummary: null,
      incidentSummary: null,
      mailInsights: null,
    };
  }

  function createIntegrationsRuntime() {
    return {
      loading: false,
      loaded: false,
      authRequired: false,
      partial: false,
      error: "",
      lastLoadedAt: "",
      requestId: 0,
      pendingKey: "",
      records: [],
      docsPayload: null,
      actorProfile: null,
      lastSalesLeadAt: "",
    };
  }

  function createMacrosRuntime() {
    return {
      loading: false,
      loaded: false,
      authRequired: false,
      error: "",
      pendingMacroId: "",
      pendingAction: "",
      lastLoadedAt: "",
    };
  }

  const AUTOMATION_NODE_TO_SUGGESTION = {
    trigger: "trigger",
    welcome: "welcome",
    assign: "assign",
    wait: "wait",
    condition: "condition",
    guide: "welcome",
    reminder: "wait",
  };

  const workspaceState = {
    left: DEFAULT_WORKSPACE.left,
    main: DEFAULT_WORKSPACE.main,
    right: DEFAULT_WORKSPACE.right,
  };

  const workspaceLimits = {
    left: { min: MIN_QUEUE_WIDTH, max: 560 },
    main: { min: 340 },
    right: { min: MIN_INTEL_WIDTH, max: 430 },
  };

  const state = {
    bootstrapped: false,
    bootstrapError: "",
    noteTemplates: [],
    noteTemplatesByKey: {},
    noteDefinitions: {},
    noteVisibilityRules: {},
    note: {
      activeKey: "konversation",
      drafts: {},
      saving: false,
    },
    schedule: {
      draft: null,
      options: null,
      saving: false,
    },
    later: {
      option: "one_hour",
      bulkSelectionKeys: [],
      contextThreadId: "",
    },
    studio: {
      mode: "reply",
      threadId: "",
      replyContextThreadId: "",
      composeMailboxId: "",
      composeTo: "",
      composeSubject: "",
      draftBody: "",
      baseDraftBody: "",
      activeTemplateKey: "",
      activeTrackKey: "booking",
      activeToneKey: "professional",
      activeRefineKey: "",
      selectedSignatureId: "fazli",
      sending: false,
      savingDraft: false,
      deleting: false,
      previewing: false,
      truthDriven: false,
      truthLabel: "",
      truthWaveLabel: "",
      truthDetail: "",
      truthSourceMailboxId: "",
      truthSourceMailboxLabel: "",
      truthSenderLocked: false,
      truthFallbackReason: "",
    },
    noteMode: {
      open: false,
      selected: "manual",
    },
    moreMenuOpen: false,
    mailboxAdminOpen: false,
    mailboxAdminEditingId: "",
    view: "conversations",
    selectedCustomerIdentity: "",
    selectedAnalyticsPeriod: "week",
    analyticsRuntime: createAnalyticsRuntime(),
    integrationsRuntime: createIntegrationsRuntime(),
    macrosRuntime: createMacrosRuntime(),
    selectedAutomationLibrary: "email",
    selectedAutomationNode: "trigger",
    selectedAutomationSection: "byggare",
    selectedAutomationTemplate: "churn_guard",
    selectedAutomationVersion: "v3_0",
    selectedAutomationAutopilotProposal: "merge_duplicates",
    automationAutopilotEnabled: true,
    automationCollaborationOpen: false,
    activity: {
      notes: [],
      followUps: [],
    },
    customerSearch: "",
    customerFilter: "alla kunder",
    customerSuggestionsHidden: false,
    customerBatchSelection: [],
    customerPrimaryEmailByKey: {},
    customerSettings: { ...DEFAULT_CUSTOMER_SETTINGS },
    customerMergeModalOpen: false,
    customerSettingsOpen: false,
    customerMergePrimaryKey: "",
    customerMergeOptions: {
      emails: true,
      phones: true,
      notes: true,
    },
    customerImport: createCustomerImportRuntime(),
    workspacePrefsApplied: false,
    customerRuntime: createCustomerRuntime(),
    automationScale: 100,
    automationRailCollapsed: false,
    automationRuntime: createAutomationRuntime(),
    customMailboxes: [],
    mailFeedsRuntime: createMailFeedRuntime(),
    selectedMailFeedKey: {
      later: MAIL_FEEDS.later[0]?.key || "",
      sent: MAIL_FEEDS.sent[0]?.key || "",
    },
    selectedIntegrationCategory: "all",
    integrationsConnectedKeys: INTEGRATION_CATALOG.filter((item) => item.connected).map(
      (item) => item.key
    ),
    macros: getFallbackMacroCards(),
    settingsRuntime: {
      loading: false,
      loaded: false,
      saving: false,
      authRequired: false,
      error: "",
      lastLoadedAt: "",
      choices: {
        theme: "mist",
        density: "compact",
      },
      profileName: "Ditt namn",
      profileEmail: "din.email@hairtp.com",
      deleteRequestedAt: "",
      mailFoundationDefaults: {
        senderMailboxId: "",
        composeSenderMailboxId: "",
        replySenderMailboxId: "",
        signatureProfileId: "",
      },
      toggles: {
        ai_prediction: true,
        metrics: true,
        templates: true,
        scheduling: true,
        upsell: false,
        auto_assign: true,
        google_calendar: true,
        outlook: false,
        booking_confirmation: true,
        payment_reminders: true,
        stripe: true,
        swish: false,
        email_signature: true,
        read_receipts: false,
        office_hours_auto_reply: true,
        weekly_summary: true,
        behavior_tracking: true,
        export_excel: true,
        smart_reply: true,
        autoprioritization: true,
        churn_prediction: true,
        desktop_notifications: true,
        sound_alerts: false,
        sla_alerts: true,
        team_mentions: true,
        mfa: false,
        activity_logging: true,
        compact_conversation: true,
        color_priorities: true,
        advanced_filters: false,
      },
    },
    macroModal: {
      open: false,
      mode: "create",
      macroId: "",
    },
    settingsProfileModal: {
      open: false,
    },
    confirmDialog: {
      open: false,
      actionKey: "",
      tone: "danger",
      onConfirm: null,
    },
    pendingMailFeedDelete: {
      active: false,
      feed: "",
      count: 0,
      committing: false,
      threadsSnapshot: [],
      previousThreadsSnapshot: [],
      previousSelectedThreadId: "",
      previousSelections: {
        later: [],
        sent: [],
      },
    },
    selectedShowcaseFeature: "command_palette",
    runtime: {
      loading: false,
      loaded: false,
      hasReachedSteadyState: false,
      hasRemovedRuntimeLoading: false,
      authRecoveryArmed: false,
      pendingFullRefresh: false,
      isBackgroundRefresh: false,
      backgroundRefreshSelectedThreadId: "",
      mode: "",
      live: false,
      authRequired: false,
      offline: false,
      offlineWorkingSetSource: "",
      offlineWorkingSetMeta: "",
      error: "",
      threads: [],
      mailboxes: [],
      mailboxCapabilities: [],
      selectedMailboxIds: [],
      mailboxScopePinned: false,
      selectedOwnerKey: "all",
      activeLaneId: "all",
      orderedLaneIds: [...QUEUE_LANE_ORDER],
      activeFocusSection: "conversation",
      historyContextThreadId: "",
      historySearch: "",
      historyMailboxFilter: "all",
      historyResultTypeFilter: "all",
      historyRangeFilter: "all",
      selectedThreadId: "",
      historyExpanded: true,
      reentry: {
        snapshot: null,
        capturedAt: "",
        reason: "",
        outcome: {
          status: "fallback_to_default",
          restoredAt: "",
          reason: "init",
          exactMatch: false,
          comparedFields: [],
          matchedFields: [],
          fallbackFields: [],
        },
      },
      historyDeleting: false,
      deletingThreadId: "",
      pendingGraphRestore: null,
      restoringMail: false,
      preferredMailboxId: "kons@hairtpclinic.com",
      defaultSenderMailbox: "contact@hairtpclinic.com",
      defaultSignatureProfile: "fazli",
      sendEnabled: false,
      deleteEnabled: false,
      graphReadEnabled: false,
      graphReadConnectorAvailable: false,
      graphAllowlistMailboxCount: 0,
      lastSyncAt: "",
      mailboxDiagnostics: {
        lastLoadAt: "",
        phase: "idle",
        requestedMailboxIds: [],
        rawWorklist: {
          totalRows: 0,
          mailboxCounts: [],
          sampleTitles: [],
        },
        mergedWorklist: {
          totalRows: 0,
          mailboxCounts: [],
          sampleTitles: [],
        },
        liveThreads: {
          count: 0,
          mailboxCounts: [],
          samples: [],
        },
        legacyThreads: {
          count: 0,
          mailboxCounts: [],
          samples: [],
        },
        historyMessages: {
          count: 0,
          mailboxCounts: [],
        },
        truthPrimary: {
          configuredMailboxIds: [],
          activeMailboxIds: [],
          rowCount: 0,
        },
        error: "",
        offlineWorkingSetSource: "",
        offlineWorkingSetMeta: "",
      },
      truthPrimaryLegacyThreads: [],
      liveHydratedThreadIds: [],
      queueInlinePanel: {
        open: false,
        laneId: "",
        feedKey: "",
      },
      queueCategoriesCompact: false,
      queueHistory: {
        open: false,
        loading: false,
        loaded: false,
        error: "",
        items: [],
        selectedConversationId: "",
        limit: 24,
        hasMore: false,
        scopeKey: "",
      },
      truthWorklistView: {
        hidden:
          WORKLIST_TRUTH_VIEW?.enabled === true
            ? (() => {
                try {
                  const hiddenValue = window.localStorage.getItem(
                    "cco.truthWorklistView.hidden"
                  );
                  if (hiddenValue === "1") return true;
                } catch (error) {
                  console.warn("Truth Worklist View kunde inte lasa lokal preferens.", error);
                }
                return WORKLIST_TRUTH_VIEW?.defaultOpen === false;
              })()
            : true,
        loading: false,
        loaded: false,
        authRequired: false,
        error: "",
        scopeKey: "",
        scopeMode: "",
        mailboxIds: [],
        payload: null,
        localFilter: "all",
        localSort: "latest",
        page: "overview",
        relay: null,
      },
      truthPrimaryCutover: {
        enabled: false,
        configuredMailboxIds: [],
        activeMailboxIds: [],
        fallbackReason: "",
        lastAppliedAt: "",
      },
      focusTruthPrimary: {
        enabled: false,
        configuredMailboxIds: [],
        activeMailboxIds: [],
        fallbackReason: "",
        readOnly: FOCUS_TRUTH_PRIMARY?.readOnly !== false,
        lastAppliedAt: "",
      },
      studioTruthPrimary: {
        enabled: false,
        configuredMailboxIds: [],
        activeMailboxIds: [],
        fallbackReason: "",
        replyOnly: STUDIO_TRUTH_PRIMARY?.replyOnly !== false,
        lastAppliedAt: "",
      },
    },
  };

  const asyncRuntimeRefs = {
    bootstrapPromise: null,
    persistPrefsTimer: null,
  };
  let activeResizeCleanup = null;
  let pendingMailFeedDeleteTimer = null;
  let queueHistoryRequestSequence = 0;
  let truthWorklistRequestSequence = 0;
  const CCO_OPERATIONAL_START_MAILBOX = "kons@hairtpclinic.com";
  const CCO_DEFAULT_REPLY_SENDER = "contact@hairtpclinic.com";
  const CCO_DEFAULT_SIGNATURE_PROFILE = "fazli";
  const CUSTOM_MAILBOXES_STORAGE_KEY = "cco.customMailboxes.v1";
  const CCO_SIGNATURE_PUBLIC_BASE_URL = "https://arcana.hairtpclinic.se";
  const CCO_HAIR_TP_SIGNATURE_LOGO_URL =
    "https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png";
  const CCO_APPROVED_FAZLI_SIGNATURE_HTML = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html;charset=utf-8"/></head><body><table id="zs-output-sig" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse; width:516px;"><tbody><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 16px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#4A4946;display:inline;">Bästa hälsningar,</span></p></td></tr></tbody></table></td></tr><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td width="75" style="padding-right: 16px; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; line-height: 0px; padding-right: 1px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><img height="94" width="75" alt="" border="0" src="https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png"></p></td></tr></tbody></table></td><td style="border-collapse: collapse; background-color: rgb(215, 202, 193); width: 3px; vertical-align: super; padding: 0px !important; height: inherit;"></td><td style="border-collapse: collapse; padding-right: 16px; width: inherit; height: inherit;"></td><td style="padding: 0px !important; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 6px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#C2AA9C;display:inline;">Fazli Krasniqi</span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 4px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#303030;display:inline;">Hårspecialist | Hårtransplantationer & PRP-injektioner</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="tel:031881166" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> 031-88 11 66&nbsp; </a></span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="mailto:contact@hairtpclinic.com" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> contact@hairtpclinic.com </a></span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 8px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;">Vasaplatsen 2, 411 34 Göteborg</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://hairtpclinic.se/"><img height="24" width="24" alt="Visit website" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%228.5%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M4%2012h16%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M12%203.5c2.6%202.5%204%205.34%204%208.5s-1.4%206-4%208.5c-2.6-2.5-4-5.34-4-8.5s1.4-6%204-8.5Z%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.instagram.com/hairtpclinic/"><img height="24" width="24" alt="Visit instagram" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Crect%20x%3D%224.5%22%20y%3D%224.5%22%20width%3D%2215%22%20height%3D%2215%22%20rx%3D%224%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%223.3%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2216.7%22%20cy%3D%227.3%22%20r%3D%221.15%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.facebook.com/hairtpclinic/"><img height="24" width="24" alt="Visit facebook" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M13.2%2020v-7h2.35l.45-2.7H13.2V8.6c0-.95.4-1.6%201.8-1.6H16V4.55c-.4-.05-1.15-.15-2.2-.15-2.2%200-3.7%201.35-3.7%203.8v2.1H7.75V13h2.35v7h3.1Z%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="border-collapse: collapse; padding-bottom: 16px; width: inherit; height: inherit;"><span></span></td></tr></tbody></table></body></html>`;
  function rewriteApprovedSignatureAssetUrls(html = "", { publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL } = {}) {
    const normalizedBaseUrl = asText(publicBaseUrl).replace(/\/+$/, "");
    const assetBaseUrl = normalizedBaseUrl || CCO_SIGNATURE_PUBLIC_BASE_URL;
    return asText(html)
      .replace(
        /https:\/\/img2\.gimm\.io\/9e99c2fb-11b4-402b-8a43-6022ede8aa2b\/image\.png/gi,
        CCO_HAIR_TP_SIGNATURE_LOGO_URL
      )
      .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3000(?=\/assets\/hair-tp-clinic\/)/gi, assetBaseUrl);
  }
  function buildApprovedFazliSignatureHtml({ publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL } = {}) {
    return rewriteApprovedSignatureAssetUrls(CCO_APPROVED_FAZLI_SIGNATURE_HTML, {
      publicBaseUrl,
    });
  }
  function buildApprovedEgzonaSignatureHtml({ publicBaseUrl = CCO_SIGNATURE_PUBLIC_BASE_URL } = {}) {
    const egzonaHtml = CCO_APPROVED_FAZLI_SIGNATURE_HTML
      .replace("Fazli Krasniqi", "Egzona Krasniqi")
      .replace("mailto:contact@hairtpclinic.com", "mailto:egzona@hairtpclinic.com")
      .replace(" contact@hairtpclinic.com ", " egzona@hairtpclinic.com ");
    return rewriteApprovedSignatureAssetUrls(egzonaHtml, {
      publicBaseUrl,
    });
  }
  const TRUTH_WORKLIST_VIEW_STORAGE_KEY = "cco.truthWorklistView.hidden";
  const truthPrimaryWorklistDisableStorageKey = asText(
    WORKLIST_TRUTH_PRIMARY?.disableStorageKey
  ).trim();
  const TRUTH_PRIMARY_WORKLIST_DISABLE_STORAGE_KEY =
    truthPrimaryWorklistDisableStorageKey
      ? truthPrimaryWorklistDisableStorageKey
      : "cco.truthPrimaryWorklist.disabled";
  const truthPrimaryFocusDisableStorageKey = asText(
    FOCUS_TRUTH_PRIMARY?.disableStorageKey
  ).trim();
  const TRUTH_PRIMARY_FOCUS_DISABLE_STORAGE_KEY =
    truthPrimaryFocusDisableStorageKey
      ? truthPrimaryFocusDisableStorageKey
      : "cco.truthPrimaryFocus.disabled";
  const truthPrimaryStudioDisableStorageKey = asText(
    STUDIO_TRUTH_PRIMARY?.disableStorageKey
  ).trim();
  const TRUTH_PRIMARY_STUDIO_DISABLE_STORAGE_KEY =
    truthPrimaryStudioDisableStorageKey
      ? truthPrimaryStudioDisableStorageKey
      : "cco.truthPrimaryStudio.disabled";

  const STUDIO_SIGNATURE_PROFILES = Object.freeze([
    {
      id: "fazli",
      aliases: ["fazli"],
      source: "static",
      label: "Fazli",
      fullName: "Fazli Krasniqi",
      title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      email: "fazli@hairtpclinic.com",
      displayEmail: "contact@hairtpclinic.com",
      html: buildApprovedFazliSignatureHtml(),
      senderMailboxId: "fazli@hairtpclinic.com",
      phone: "031-88 11 66",
    },
    {
      id: "egzona",
      aliases: ["egzona"],
      source: "static",
      label: "Egzona",
      fullName: "Egzona Krasniqi",
      title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      email: "egzona@hairtpclinic.com",
      displayEmail: "egzona@hairtpclinic.com",
      html: buildApprovedEgzonaSignatureHtml(),
      senderMailboxId: "egzona@hairtpclinic.com",
      phone: "031-88 11 66",
    },
  ]);
  const DEFAULT_CUSTOM_MAILBOX_SIGNATURE_PRESETS = Object.freeze([
    {
      id: "egzona",
      email: "egzona@hairtpclinic.com",
      label: "Egzona",
      owner: "Egzona",
      signature: {
        label: "Egzona",
        fullName: "Egzona Krasniqi",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
        html: buildApprovedEgzonaSignatureHtml(),
      },
    },
    {
      id: "fazli",
      email: "fazli@hairtpclinic.com",
      label: "Fazli",
      owner: "Fazli",
      signature: {
        label: "Fazli",
        fullName: "Fazli Krasniqi",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
        html: buildApprovedFazliSignatureHtml(),
      },
    },
  ]);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
  }

  function slugifyMailboxId(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function deriveMailboxLabel(email) {
    const localPart = asText(email).split("@")[0] || "";
    if (!localPart) return "";
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }

  function getPreferredOperationalMailboxId() {
    return normalizeMailboxId(
      state.runtime.preferredMailboxId ||
        state.runtime.defaultSenderMailbox ||
        CCO_OPERATIONAL_START_MAILBOX
    );
  }

  function getOperationalImportMailboxId() {
    const selectedMailboxIds = asArray(state.runtime.selectedMailboxIds)
      .map((mailboxId) => canonicalizeRuntimeMailboxId(mailboxId))
      .filter(Boolean);
    return selectedMailboxIds[0] || getPreferredOperationalMailboxId();
  }

  function getRequestedRuntimeMailboxIds({ includePreferredFallback = true } = {}) {
    const selectedMailboxIds = asArray(state.runtime.selectedMailboxIds)
      .map((mailboxId) => canonicalizeRuntimeMailboxId(mailboxId))
      .filter(Boolean);
    if (selectedMailboxIds.length) {
      return selectedMailboxIds;
    }
    return includePreferredFallback ? [getPreferredOperationalMailboxId()] : [];
  }

  function splitCustomerImportMultiValue(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeText(entry)).filter(Boolean);
    }
    return String(value ?? "")
      .split(/[\n;,|]+/g)
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }

  function getCustomerImportEditableRow(row = {}) {
    if (row?.input && typeof row.input === "object") {
      return row.input;
    }
    if (row?.record && typeof row.record === "object") {
      return row.record;
    }
    return row && typeof row === "object" ? row : {};
  }

  function buildCustomerImportRowsPayload(rows = []) {
    return asArray(rows).map((row, index) => {
      const editable = getCustomerImportEditableRow(row);
      const rowNumber = Math.max(
        1,
        Number(row?.rowNumber || editable.rowNumber || index + 1) || index + 1
      );
      return {
        rowNumber,
        name: normalizeText(editable.name),
        emails: splitCustomerImportMultiValue(editable.emails).map((entry) =>
          normalizeText(entry).toLowerCase()
        ),
        phone: normalizeText(editable.phone),
        mailboxes: splitCustomerImportMultiValue(editable.mailboxes),
        vip: Boolean(editable.vip),
        customerValue: Math.max(0, Math.round(asNumber(editable.customerValue, 0))),
        totalConversations: Math.max(0, Math.round(asNumber(editable.totalConversations, 0))),
        totalMessages: Math.max(0, Math.round(asNumber(editable.totalMessages, 0))),
      };
    });
  }

  function encodeArrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback = "") {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
    return String(fallback ?? "");
  }

  function normalizeMailboxId(value) {
    return normalizeKey(asText(value));
  }

  function resolveRuntimeMailboxPresetEmail(value = "") {
    const normalizedValue = normalizeMailboxId(value);
    if (!normalizedValue) return "";
    return LEGACY_RUNTIME_MAILBOX_EMAILS[normalizedValue] || "";
  }

  function deriveMailboxToneClass(mailbox = {}) {
    const explicitToneClass = asText(mailbox?.toneClass);
    if (explicitToneClass) return explicitToneClass;
    const tokens = getMailboxIdentityTokens(mailbox);
    for (const token of tokens) {
      if (MAILBOX_TONE_CLASS_BY_TOKEN[token]) {
        return MAILBOX_TONE_CLASS_BY_TOKEN[token];
      }
    }
    const seedSource = asText(mailbox?.email || mailbox?.label || mailbox?.id);
    if (!seedSource) return MAILBOX_TONE_CLASS_FALLBACKS[0];
    let hash = 0;
    for (let index = 0; index < seedSource.length; index += 1) {
      hash = (hash * 31 + seedSource.charCodeAt(index)) | 0;
    }
    return MAILBOX_TONE_CLASS_FALLBACKS[Math.abs(hash) % MAILBOX_TONE_CLASS_FALLBACKS.length];
  }

  function buildDefaultMailboxSignatureHtml({
    label = "",
    email = "",
    fullName = "",
    title = "",
  } = {}) {
    const approvedMailboxTokens = new Set([
      "fazli",
      "fazli krasniqi",
      "fazli@hairtpclinic.com",
      "egzona",
      "egzona krasniqi",
      "egzona@hairtpclinic.com",
    ]);
    const mailboxTokens = [
      normalizeKey(label),
      normalizeKey(fullName),
      normalizeMailboxId(email),
      normalizeMailboxId(email).split("@")[0],
    ].filter(Boolean);
    const isApprovedMailbox = mailboxTokens.some((token) => approvedMailboxTokens.has(token));
    if (!isApprovedMailbox) {
      return "";
    }
    const resolvedName = asText(fullName || label);
    const titleLine = asText(title).replace(
      /\bHårspecialist\s+[Ii]\s+Hårtransplantationer\s*&\s*PRP-injektioner\b/i,
      "Hårspecialist | Hårtransplantationer & PRP-injektioner"
    );
    const emailLine = asText(email).toLowerCase();
    if (!resolvedName || !titleLine || !emailLine) {
      return "";
    }
    const variantHtml = CCO_APPROVED_FAZLI_SIGNATURE_HTML
      .replace("Fazli Krasniqi", resolvedName)
      .replace("mailto:contact@hairtpclinic.com", `mailto:${emailLine}`)
      .replace(" contact@hairtpclinic.com ", ` ${emailLine} `)
      .replace(
        "Hårspecialist | Hårtransplantationer & PRP-injektioner",
        titleLine
      );
    return rewriteApprovedSignatureAssetUrls(variantHtml, {
      publicBaseUrl: CCO_SIGNATURE_PUBLIC_BASE_URL,
    });
  }

  function buildMailboxAdminSignatureSeedHtml() {
    return buildDefaultMailboxSignatureHtml({
      label: normalizeText(mailboxAdminNameInput?.value),
      email: normalizeText(mailboxAdminEmailInput?.value).toLowerCase(),
      fullName: normalizeText(mailboxAdminSignatureFullNameInput?.value),
      title: normalizeText(mailboxAdminSignatureTitleInput?.value),
    });
  }

  function sanitizeMailboxSignatureHtml(html = "") {
    if (!mailboxAdminSignatureEditor?.ownerDocument) {
      return String(html || "").trim();
    }
    const template = mailboxAdminSignatureEditor.ownerDocument.createElement("template");
    template.innerHTML = String(html || "");
    const absoluteSignatureUrl = (value = "", { allowMailto = false } = {}) => {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue) return "";
      if (allowMailto && /^mailto:/i.test(normalizedValue)) return normalizedValue;
      if (/^https?:\/\/(?:127\.0\.0\.1|localhost):3000(?=\/assets\/hair-tp-clinic\/)/i.test(normalizedValue)) {
        return normalizedValue.replace(
          /^https?:\/\/(?:127\.0\.0\.1|localhost):3000/i,
          CCO_SIGNATURE_PUBLIC_BASE_URL
        );
      }
      if (/^https?:/i.test(normalizedValue)) return normalizedValue;
      if (normalizedValue.startsWith("/")) {
        return `${CCO_SIGNATURE_PUBLIC_BASE_URL}${normalizedValue}`;
      }
      return "";
    };
    const sanitizeSignatureStyle = (value = "") =>
      String(value || "")
        .replace(/javascript:/gi, "")
        .replace(/vbscript:/gi, "")
        .replace(/expression\s*\([^)]*\)/gi, "")
        .replace(/@import/gi, "")
        .replace(/behavior\s*:/gi, "")
        .trim();
    const allowedTags = new Set([
      "A",
      "B",
      "BR",
      "DIV",
      "EM",
      "I",
      "IMG",
      "LI",
      "OL",
      "P",
      "SPAN",
      "STRONG",
      "TABLE",
      "TBODY",
      "TD",
      "TR",
      "U",
      "UL",
    ]);
    Array.from(template.content.querySelectorAll("*")).forEach((node) => {
      if (!allowedTags.has(node.tagName)) {
        const fragment = mailboxAdminSignatureEditor.ownerDocument.createDocumentFragment();
        while (node.firstChild) {
          fragment.appendChild(node.firstChild);
        }
        node.replaceWith(fragment);
        return;
      }
      Array.from(node.attributes).forEach((attribute) => {
        const attributeName = attribute.name.toLowerCase();
        const isAllowedHref = node.tagName === "A" && attributeName === "href";
        const isAllowedSrc = node.tagName === "IMG" && attributeName === "src";
        const isAllowedAlt = node.tagName === "IMG" && attributeName === "alt";
        const isAllowedDimension =
          node.tagName === "IMG" && (attributeName === "width" || attributeName === "height");
        const isAllowedStyle = attributeName === "style";
        const isAllowedTableMeta =
          node.tagName === "TABLE" &&
          (attributeName === "cellpadding" ||
            attributeName === "cellspacing" ||
            attributeName === "border" ||
            attributeName === "role");
        const isAllowedTableSpan =
          node.tagName === "TD" && (attributeName === "colspan" || attributeName === "rowspan");
        if (
          !isAllowedHref &&
          !isAllowedSrc &&
          !isAllowedAlt &&
          !isAllowedDimension &&
          !isAllowedStyle &&
          !isAllowedTableMeta &&
          !isAllowedTableSpan
        ) {
          node.removeAttribute(attribute.name);
        }
      });
      if (node.tagName === "A") {
        const href = absoluteSignatureUrl(node.getAttribute("href"), { allowMailto: true });
        if (!href) {
          node.removeAttribute("href");
        } else {
          node.setAttribute("href", href);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (node.tagName === "IMG") {
        const src = absoluteSignatureUrl(node.getAttribute("src"));
        if (!src) {
          node.remove();
          return;
        }
        node.setAttribute("src", src);
        const width = normalizeText(node.getAttribute("width"));
        const height = normalizeText(node.getAttribute("height"));
        if (width && !/^\d{1,4}$/.test(width)) node.removeAttribute("width");
        if (height && !/^\d{1,4}$/.test(height)) node.removeAttribute("height");
      }
      if (node.hasAttribute("style")) {
        const safeStyle = sanitizeSignatureStyle(node.getAttribute("style"));
        if (safeStyle) {
          node.setAttribute("style", safeStyle);
        } else {
          node.removeAttribute("style");
        }
      }
    });
    return template.innerHTML.trim();
  }

  function sanitizeConversationHtmlForDisplay(html = "") {
    const documentObject = typeof document !== "undefined" ? document : null;
    const rawHtml = asText(html).trim();
    if (!documentObject || !rawHtml) return "";
    const isHairTpSignatureHtml =
      /hairtpclinic\.com|Hair TP Clinic|Hårspecialist|Vasaplatsen/i.test(rawHtml);

    const extractConversationTextFromHtml = (value = "") =>
      asText(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const visibleText = extractConversationTextFromHtml(rawHtml)
      .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
      .replace(
        /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
        ""
      )
      .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
      .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
      .replace(/^Get more done with apps like Word\.?\s*/i, "")
      .replace(/^Learn why this is important\.?\s*/i, "")
      .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
      .replace(/^Read more about why this is important\.?\s*/i, "")
      .trim();
    if (!visibleText || isRuntimePlaceholderLine(visibleText)) return "";

    const template = documentObject.createElement("template");
    template.innerHTML = rawHtml;

    const dropNodeTags = new Set([
      "BLOCKQUOTE",
      "BUTTON",
      "CANVAS",
      "EMBED",
      "FORM",
      "HEAD",
      "IFRAME",
      "INPUT",
      "META",
      "NOSCRIPT",
      "OBJECT",
      "SCRIPT",
      "SELECT",
      "STYLE",
      "SVG",
      "TEXTAREA",
      "TITLE",
      "VIDEO",
      "AUDIO",
      "SOURCE",
      "LINK",
    ]);
    const allowedTags = new Set([
      "A",
      "B",
      "BR",
      "DIV",
      "EM",
      "I",
      "IMG",
      "LI",
      "OL",
      "P",
      "SPAN",
      "STRONG",
      "TABLE",
      "TBODY",
      "TD",
      "TR",
      "U",
      "UL",
    ]);
    const allowedStyleProperties = new Set([
      "background",
      "background-color",
      "border",
      "border-bottom",
      "border-left",
      "border-radius",
      "border-right",
      "border-top",
      "color",
      "display",
      "font-family",
      "font-size",
      "font-style",
      "font-weight",
      "height",
      "line-height",
      "margin",
      "margin-bottom",
      "margin-left",
      "margin-right",
      "margin-top",
      "max-height",
      "max-width",
      "padding",
      "padding-bottom",
      "padding-left",
      "padding-right",
      "padding-top",
      "text-align",
      "text-decoration",
      "vertical-align",
      "white-space",
      "width",
    ]);

    const sanitizeHtmlUrl = (value = "", { allowMailto = false, allowDataImage = false } = {}) => {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue) return "";
      if (/^https?:/i.test(normalizedValue)) return normalizedValue;
      if (allowMailto && /^mailto:/i.test(normalizedValue)) return normalizedValue;
      if (allowDataImage && /^data:image\//i.test(normalizedValue)) return normalizedValue;
      return "";
    };

    const resolveConversationDisplayUrl = (value = "") => {
      const normalizedValue = sanitizeHtmlUrl(value, { allowMailto: true });
      if (!normalizedValue) return "";
      try {
        const parsedUrl = new URL(normalizedValue);
        if (/safelinks\.protection\.outlook\.com$/i.test(parsedUrl.hostname)) {
          const embeddedUrl = parsedUrl.searchParams.get("url");
          if (embeddedUrl) {
            const decodedUrl = sanitizeHtmlUrl(decodeURIComponent(embeddedUrl), {
              allowMailto: true,
            });
            if (decodedUrl) return decodedUrl;
          }
        }
      } catch (_error) {
        return normalizedValue;
      }
      return normalizedValue;
    };

    const buildConversationCompactLinkLabel = (href = "", text = "") => {
      const visibleText = normalizeText(text);
      const looksRawUrl =
        /https?:\/\/|www\.|safelinks\.protection\.outlook\.com/i.test(visibleText) ||
        (visibleText.length >= 96 && /[/?=&_-]/.test(visibleText));
      if (!looksRawUrl) return "";
      const displayUrl = resolveConversationDisplayUrl(href) || visibleText;
      if (/^mailto:/i.test(displayUrl)) return "Öppna e-postlänk";
      try {
        const parsedUrl = new URL(displayUrl);
        const host = normalizeText(parsedUrl.hostname).replace(/^www\./i, "");
        if (host) return `Öppna länk (${host})`;
      } catch (_error) {
        return "Öppna länk";
      }
      return "Öppna länk";
    };

    const convertConversationLengthToPx = (value = 0, unit = "px") => {
      const numericValue = Number.parseFloat(value);
      if (!Number.isFinite(numericValue)) return 0;
      switch (String(unit || "").toLowerCase()) {
        case "pt":
          return numericValue * (4 / 3);
        case "em":
        case "rem":
          return numericValue * 16;
        default:
          return numericValue;
      }
    };

    const clampConversationLengthToken = (
      value = "",
      {
        minPx = 0,
        maxPx = 520,
        allowPercent = false,
        percentMax = 100,
        allowAuto = false,
        allowUnitless = false,
        unitlessMin = 0,
        unitlessMax = 2,
      } = {}
    ) => {
      const normalizedValue = normalizeText(value).toLowerCase();
      if (!normalizedValue) return "";
      if (allowAuto && normalizedValue === "auto") return "auto";
      if (allowPercent && /^-?\d+(?:\.\d+)?%$/.test(normalizedValue)) {
        const percentValue = Number.parseFloat(normalizedValue);
        if (!Number.isFinite(percentValue)) return "";
        return `${Math.max(0, Math.min(percentMax, percentValue))}%`;
      }
      if (allowUnitless && /^-?\d+(?:\.\d+)?$/.test(normalizedValue)) {
        const unitlessValue = Number.parseFloat(normalizedValue);
        if (!Number.isFinite(unitlessValue)) return "";
        const clampedValue = Math.max(unitlessMin, Math.min(unitlessMax, unitlessValue));
        return Number.isInteger(clampedValue)
          ? String(clampedValue)
          : clampedValue.toFixed(2).replace(/\.?0+$/, "");
      }
      const lengthMatch = normalizedValue.match(/^(-?\d+(?:\.\d+)?)(px|pt|em|rem)$/i);
      if (!lengthMatch) return "";
      const pixelValue = convertConversationLengthToPx(lengthMatch[1], lengthMatch[2]);
      if (!Number.isFinite(pixelValue)) return "";
      const clampedValue = Math.max(minPx, Math.min(maxPx, pixelValue));
      const serializedValue = Number.isInteger(clampedValue)
        ? String(clampedValue)
        : clampedValue.toFixed(2).replace(/\.?0+$/, "");
      return `${serializedValue}px`;
    };

    const clampConversationSpacingValue = (value = "", { maxPx = 18 } = {}) => {
      const tokens = normalizeText(value).split(/\s+/).filter(Boolean);
      if (!tokens.length || tokens.length > 4) return "";
      const clampedTokens = tokens
        .map((token) =>
          clampConversationLengthToken(token, {
            minPx: 0,
            maxPx,
            allowAuto: true,
          })
        )
        .filter(Boolean);
      return clampedTokens.length === tokens.length ? clampedTokens.join(" ") : "";
    };

    const normalizeConversationDisplayValue = (value = "") => {
      const normalizedValue = normalizeText(value).toLowerCase();
      return new Set([
        "block",
        "inline",
        "inline-block",
        "table",
        "table-row",
        "table-cell",
      ]).has(normalizedValue)
        ? normalizedValue
        : "";
    };

    const normalizeConversationEnumValue = (value = "", allowedValues = []) => {
      const normalizedValue = normalizeText(value).toLowerCase();
      return allowedValues.includes(normalizedValue) ? normalizedValue : "";
    };

    const normalizeConversationFontWeight = (value = "") => {
      const normalizedValue = normalizeText(value).toLowerCase();
      if (["normal", "bold", "bolder"].includes(normalizedValue)) return normalizedValue;
      if (!/^\d{3}$/.test(normalizedValue)) return "";
      const numericValue = Number.parseInt(normalizedValue, 10);
      if (!Number.isFinite(numericValue)) return "";
      return String(Math.max(400, Math.min(700, numericValue)));
    };

    const normalizeConversationFillValue = (value = "") => {
      const normalizedValue = normalizeText(value);
      if (
        !normalizedValue ||
        /url\s*\(|gradient\s*\(|javascript:|vbscript:|expression\s*\(/i.test(
          normalizedValue
        )
      ) {
        return "";
      }
      return normalizedValue.slice(0, 120);
    };

    const normalizeConversationStyleValue = (property = "", value = "") => {
      const normalizedValue = normalizeText(value);
      if (!normalizedValue) return "";
      switch (property) {
        case "font-size":
          return clampConversationLengthToken(normalizedValue, {
            minPx: 11,
            maxPx: 18,
          });
        case "line-height":
          return clampConversationLengthToken(normalizedValue, {
            minPx: 15,
            maxPx: 24,
            allowUnitless: true,
            unitlessMin: 1.25,
            unitlessMax: 1.7,
          });
        case "margin":
        case "margin-top":
        case "margin-right":
        case "margin-bottom":
        case "margin-left":
          return clampConversationSpacingValue(normalizedValue, { maxPx: 16 });
        case "padding":
        case "padding-top":
        case "padding-right":
        case "padding-bottom":
        case "padding-left":
          return clampConversationSpacingValue(normalizedValue, { maxPx: 18 });
        case "width":
        case "max-width":
          return clampConversationLengthToken(normalizedValue, {
            minPx: 0,
            maxPx: 520,
            allowPercent: true,
            percentMax: 100,
            allowAuto: true,
          });
        case "height":
        case "max-height":
          return "";
        case "display":
          return normalizeConversationDisplayValue(normalizedValue);
        case "white-space":
          return normalizeConversationEnumValue(normalizedValue, [
            "normal",
            "nowrap",
            "pre",
            "pre-wrap",
            "pre-line",
          ]);
        case "text-align":
          return normalizeConversationEnumValue(normalizedValue, [
            "left",
            "right",
            "center",
            "justify",
          ]);
        case "vertical-align":
          return normalizeConversationEnumValue(normalizedValue, [
            "top",
            "middle",
            "bottom",
            "baseline",
          ]);
        case "font-weight":
          return normalizeConversationFontWeight(normalizedValue);
        case "font-family":
          return normalizedValue.slice(0, 160);
        case "background":
        case "background-color":
          return normalizeConversationFillValue(normalizedValue);
        default:
          return normalizedValue.slice(0, 160);
      }
    };

    const sanitizeConversationStyle = (value = "") =>
      String(value || "")
        .split(";")
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => {
          const [property, ...rest] = rule.split(":");
          const normalizedProperty = normalizeText(property).toLowerCase();
          if (!allowedStyleProperties.has(normalizedProperty)) return "";
          const normalizedValue = rest.join(":").trim();
          if (
            !normalizedValue ||
            /javascript:|vbscript:|expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(
              normalizedValue
            )
          ) {
            return "";
          }
          const safeValue = normalizeConversationStyleValue(normalizedProperty, normalizedValue);
          return safeValue ? `${normalizedProperty}:${safeValue}` : "";
        })
        .filter(Boolean)
        .join(";");

    const parseConversationPixelDimension = (value = "") => {
      const normalizedValue = normalizeText(value).toLowerCase();
      if (!normalizedValue) return 0;
      const match = normalizedValue.match(/^(\d+(?:\.\d+)?)(?:px)?$/);
      if (!match) return 0;
      const parsedValue = Number.parseFloat(match[1]);
      return Number.isFinite(parsedValue) ? parsedValue : 0;
    };

    const readConversationStyleToken = (style = "", property = "") => {
      const normalizedProperty = normalizeText(property).toLowerCase();
      if (!normalizedProperty) return "";
      const rules = String(style || "")
        .split(";")
        .map((rule) => rule.trim())
        .filter(Boolean);
      for (const rule of rules) {
        const [candidateProperty, ...rest] = rule.split(":");
        if (normalizeText(candidateProperty).toLowerCase() !== normalizedProperty) continue;
        return normalizeText(rest.join(":"));
      }
      return "";
    };

    const isConversationZeroWidthStyle = (style = "") =>
      /(?:^|;)\s*(?:max-width|width):0px(?:;|$)/i.test(asText(style));

    const looksConversationNearWhite = (value = "") =>
      /(?:^#fff(?:fff)?$|^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)$)/i.test(
        normalizeText(value).toLowerCase()
      );

    const resolveConversationImageDimension = (node, property = "width") => {
      if (!node || typeof node.getAttribute !== "function") return 0;
      const directValue = parseConversationPixelDimension(node.getAttribute(property));
      if (directValue > 0) return directValue;
      const inlineStyle = node.getAttribute("style");
      return parseConversationPixelDimension(
        readConversationStyleToken(inlineStyle, property) ||
          readConversationStyleToken(
            inlineStyle,
            property === "width" ? "max-width" : "max-height"
          )
      );
    };

    const shouldDropConversationImage = (node) => {
      if (!node || node.tagName !== "IMG") return false;
      const src = normalizeText(node.getAttribute("src"));
      const alt = normalizeText(node.getAttribute("alt"));
      const title = normalizeText(node.getAttribute("title"));
      const width = resolveConversationImageDimension(node, "width");
      const height = resolveConversationImageDimension(node, "height");
      const isUnlabeled = !alt && !title;
      const looksTiny = (width > 0 && width <= 6) || (height > 0 && height <= 6);
      const looksSpacerRatio =
        width > 0 &&
        height > 0 &&
        Math.min(width, height) <= 8 &&
        Math.max(width, height) >= 48;
      const looksTrackingPixel =
        /^data:image\/gif/i.test(src) &&
        ((width > 0 && width <= 24) || (height > 0 && height <= 24) || (!width && !height));
      const looksSpacerAsset = /(?:spacer|tracking|pixel)/i.test(src);
      return isUnlabeled && (looksTiny || looksSpacerRatio || looksTrackingPixel || looksSpacerAsset);
    };

    const looksConversationHiddenPreheaderNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const style = asText(node.getAttribute("style"));
      const text = normalizeText(node.textContent || "");
      if (!text || node.querySelector("img, table, ul, ol")) return false;
      const fontSize = parseConversationPixelDimension(readConversationStyleToken(style, "font-size"));
      const lineHeight = parseConversationPixelDimension(
        readConversationStyleToken(style, "line-height")
      );
      const color = readConversationStyleToken(style, "color");
      const invisibleCharCount = (asText(node.textContent).match(/[\u200B-\u200F\u2060\uFEFF]/g) || [])
        .length;
      return (
        isConversationZeroWidthStyle(style) &&
        (fontSize === 0 || fontSize <= 11) &&
        (lineHeight === 0 || lineHeight <= 15) &&
        (looksConversationNearWhite(color) || invisibleCharCount >= 8 || text.length >= 120)
      );
    };

    const looksConversationGhostWrapperNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
      const style = asText(node.getAttribute("style"));
      if (!isConversationZeroWidthStyle(style)) return false;
      const text = normalizeText(node.textContent || "");
      return !text;
    };

    const compactConversationFallbackUrlNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.querySelector("img, table, ul, ol")) return;
      const anchors = Array.from(node.querySelectorAll("a[href]"));
      anchors.forEach((anchorNode) => {
        const href = asText(anchorNode.getAttribute("href"));
        const visibleText = normalizeText(anchorNode.textContent || "");
        const compactLabel = buildConversationCompactLinkLabel(href, visibleText);
        if (!compactLabel) return;
        anchorNode.textContent = compactLabel;
        anchorNode.classList.add("conversation-html-link-fallback");
        anchorNode.setAttribute("title", compactLabel);
      });
    };

    const compactConversationRawUrlTextNode = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.querySelector("img, table, ul, ol, a[href]")) return;
      if (node.children.length > 0) return;
      const rawText = asText(node.textContent);
      if (!/https?:\/\//i.test(rawText)) return;
      const urlMatches = Array.from(rawText.matchAll(/https?:\/\/[^\s<>"']+/gi));
      if (urlMatches.length !== 1) return;
      const [urlMatch] = urlMatches;
      const rawUrl = asText(urlMatch?.[0]);
      if (rawUrl.length < 72) return;
      const compactLabel = buildConversationCompactLinkLabel(rawUrl, rawUrl);
      const href = resolveConversationDisplayUrl(rawUrl) || sanitizeHtmlUrl(rawUrl, { allowMailto: true });
      if (!compactLabel || !href) return;
      const beforeText = rawText.slice(0, urlMatch.index);
      const afterText = rawText.slice((urlMatch.index || 0) + rawUrl.length);
      const fragment = documentObject.createDocumentFragment();
      if (beforeText) fragment.appendChild(documentObject.createTextNode(beforeText));
      const anchorNode = documentObject.createElement("a");
      anchorNode.setAttribute("href", href);
      anchorNode.setAttribute("target", "_blank");
      anchorNode.setAttribute("rel", "noopener noreferrer");
      anchorNode.className = "conversation-html-link-fallback";
      anchorNode.textContent = compactLabel;
      anchorNode.setAttribute("title", compactLabel);
      fragment.appendChild(anchorNode);
      if (afterText) fragment.appendChild(documentObject.createTextNode(afterText));
      node.replaceChildren(fragment);
    };

    const isConversationWhitespaceTextNode = (node) =>
      node?.nodeType === Node.TEXT_NODE && !normalizeText(node.textContent || "");

    const trimConversationBreakEdges = (node) => {
      if (!node) return;
      while (node.firstChild) {
        const firstChild = node.firstChild;
        if (isConversationWhitespaceTextNode(firstChild)) {
          firstChild.remove();
          continue;
        }
        if (firstChild.nodeType === Node.ELEMENT_NODE && firstChild.tagName === "BR") {
          firstChild.remove();
          continue;
        }
        break;
      }
      while (node.lastChild) {
        const lastChild = node.lastChild;
        if (isConversationWhitespaceTextNode(lastChild)) {
          lastChild.remove();
          continue;
        }
        if (lastChild.nodeType === Node.ELEMENT_NODE && lastChild.tagName === "BR") {
          lastChild.remove();
          continue;
        }
        break;
      }
    };

    const collapseConversationBreakRuns = (node, maxBreaks = 2) => {
      if (!node) return;
      let consecutiveBreaks = 0;
      Array.from(node.childNodes).forEach((childNode) => {
        if (isConversationWhitespaceTextNode(childNode)) {
          childNode.remove();
          return;
        }
        if (childNode.nodeType === Node.ELEMENT_NODE && childNode.tagName === "BR") {
          consecutiveBreaks += 1;
          if (consecutiveBreaks > maxBreaks) {
            childNode.remove();
          }
          return;
        }
        consecutiveBreaks = 0;
      });
    };

    Array.from(template.content.querySelectorAll("*")).forEach((node) => {
      if (dropNodeTags.has(node.tagName)) {
        node.remove();
        return;
      }
      if (!allowedTags.has(node.tagName)) {
        const fragment = documentObject.createDocumentFragment();
        while (node.firstChild) {
          fragment.appendChild(node.firstChild);
        }
        node.replaceWith(fragment);
        return;
      }

      Array.from(node.attributes).forEach((attribute) => {
        const attributeName = attribute.name.toLowerCase();
        const isAllowedHref = node.tagName === "A" && attributeName === "href";
        const isAllowedSrc = node.tagName === "IMG" && attributeName === "src";
        const isAllowedAlt = node.tagName === "IMG" && attributeName === "alt";
        const isAllowedTitle =
          (node.tagName === "IMG" || node.tagName === "A") && attributeName === "title";
        const isAllowedDimension =
          node.tagName === "IMG" && (attributeName === "width" || attributeName === "height");
        const isAllowedStyle = attributeName === "style";
        const isAllowedAlign =
          (node.tagName === "DIV" ||
            node.tagName === "P" ||
            node.tagName === "TABLE" ||
            node.tagName === "TD" ||
            node.tagName === "TR") &&
          (attributeName === "align" || attributeName === "valign");
        const isAllowedTableMeta =
          node.tagName === "TABLE" &&
          (attributeName === "cellpadding" ||
            attributeName === "cellspacing" ||
            attributeName === "border" ||
            attributeName === "role");
        const isAllowedTableSpan =
          node.tagName === "TD" && (attributeName === "colspan" || attributeName === "rowspan");
        if (
          !isAllowedHref &&
          !isAllowedSrc &&
          !isAllowedAlt &&
          !isAllowedTitle &&
          !isAllowedDimension &&
          !isAllowedStyle &&
          !isAllowedAlign &&
          !isAllowedTableMeta &&
          !isAllowedTableSpan
        ) {
          node.removeAttribute(attribute.name);
        }
      });

      if (node.tagName === "A") {
        const href = sanitizeHtmlUrl(node.getAttribute("href"), { allowMailto: true });
        if (!href) {
          const fragment = documentObject.createDocumentFragment();
          while (node.firstChild) {
            fragment.appendChild(node.firstChild);
          }
          node.replaceWith(fragment);
          return;
        }
        node.setAttribute("href", href);
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
        const compactLabel = buildConversationCompactLinkLabel(href, node.textContent || "");
        if (compactLabel) {
          node.textContent = compactLabel;
          node.classList.add("conversation-html-link-fallback");
          node.setAttribute("title", compactLabel);
        }
      }

      if (node.tagName === "IMG") {
        if (shouldDropConversationImage(node)) {
          node.remove();
          return;
        }
        const rawSrc = node.getAttribute("src");
        const rawSrcText = asText(rawSrc);
        const rawWidth = Number(normalizeText(node.getAttribute("width")));
        const rawHeight = Number(normalizeText(node.getAttribute("height")));
        const resolvedSrc =
          isHairTpSignatureHtml &&
          rawWidth === 75 &&
          rawHeight === 94
            ? CCO_HAIR_TP_SIGNATURE_LOGO_URL
            : rawSrc;
        const src = sanitizeHtmlUrl(resolvedSrc, { allowDataImage: true });
        if (!src) {
          const alt = normalizeText(node.getAttribute("alt"));
          if (alt) {
            const fallback = documentObject.createElement("span");
            fallback.className = "conversation-html-image-fallback";
            fallback.textContent = alt;
            node.replaceWith(fallback);
          } else {
            node.remove();
          }
          return;
        }
        node.setAttribute("src", src);
        node.classList.add("conversation-html-image");
        const width = normalizeText(node.getAttribute("width"));
        const height = normalizeText(node.getAttribute("height"));
        if (width && !/^\d{1,4}$/.test(width)) node.removeAttribute("width");
        if (height && !/^\d{1,4}$/.test(height)) node.removeAttribute("height");
        node.setAttribute("loading", "lazy");
        node.setAttribute("decoding", "async");
        node.setAttribute("referrerpolicy", "no-referrer");
      }

      if (node.hasAttribute("style")) {
        const safeStyle = sanitizeConversationStyle(node.getAttribute("style"));
        if (safeStyle) {
          node.setAttribute("style", safeStyle);
        } else {
          node.removeAttribute("style");
        }
      }

      if (node.tagName === "TABLE") {
        node.classList.add("conversation-html-structured-block");
      }
    });

    Array.from(template.content.querySelectorAll("*")).forEach((node) => {
      if (looksConversationHiddenPreheaderNode(node) || looksConversationGhostWrapperNode(node)) {
        node.remove();
        return;
      }
      compactConversationFallbackUrlNode(node);
      compactConversationRawUrlTextNode(node);
    });

    Array.from(template.content.querySelectorAll("p,div,td,span,li")).forEach((node) => {
      trimConversationBreakEdges(node);
      const maxBreaks =
        node.tagName === "TD" || node.tagName === "DIV"
          ? 1
          : 2;
      collapseConversationBreakRuns(node, maxBreaks);
    });

    Array.from(template.content.querySelectorAll("p,div,span,td,tr,tbody,table,li")).forEach((node) => {
      if (node.querySelector("img, a, ul, ol")) return;
      const text = normalizeText(node.textContent || "");
      if (
        !text ||
        /^(?:Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från|You\s+don['’]t\s+often\s+get\s+email\s+from|Learn why this is important|L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt|Read more about why this is important)/i.test(
          text
        ) ||
        /^(?:Från|From):/i.test(text) ||
        /^[\s_—–-]{6,}$/.test(text)
      ) {
        node.remove();
      }
    });

    const identityFooterCue =
      /(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Skickat från Outlook för Mac|Sent from Outlook for Mac|Hair TP Clinic|@[A-Z0-9._%+-]+|https?:\/\/|www\.|\+?\d[\d\s().-]{5,})/i;
    Array.from(template.content.querySelectorAll("p,div,td,span")).forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (!text || text.length > 240) return;
      if (!identityFooterCue.test(text) && !node.querySelector("img, a")) return;
      node.classList.add("conversation-html-footer-fragment");
    });

    const sanitizedHtml = template.innerHTML.trim();
    if (!sanitizedHtml) return "";

    const sanitizedText = extractConversationTextFromHtml(sanitizedHtml);
    if (
      !sanitizedText ||
      isRuntimePlaceholderLine(sanitizedText) ||
      /(?:^|\n)(?:Från|From):|(?:^|\n)(?:Datum|Date):|(?:^|\n)(?:Till|To):|(?:^|\n)(?:Ämne|Subject):/i.test(
        sanitizedText
      )
    ) {
      return "";
    }

    const hasRichMarkupCue = /<img\b|<table\b|<a\b|style=/i.test(sanitizedHtml);
    const richBlockCount = (
      sanitizedHtml.match(/<(?:table|tr|td|p|div|li|ul|ol|img|a)\b/gi) || []
    ).length;
    const hasIdentityCue =
      /(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Sent from Outlook for Mac|Hair TP Clinic|@[A-Z0-9._%+-]+|\d{2,4}[- ]?\d{2,}|www\.|https?:\/\/)/i.test(
        sanitizedText
      ) || /<img\b/i.test(sanitizedHtml);
    const hasStructuredBodyCue =
      sanitizedText.length >= 180 ||
      (/<table\b/i.test(sanitizedHtml) && sanitizedText.length >= 48) ||
      (/<img\b/i.test(sanitizedHtml) && sanitizedText.length >= 32) ||
      (/<a\b/i.test(sanitizedHtml) && sanitizedText.length >= 80) ||
      (richBlockCount >= 6 && sanitizedText.length >= 48);
    if (!hasRichMarkupCue || (!hasIdentityCue && !hasStructuredBodyCue)) return "";

    return sanitizedHtml;
  }

  function normalizeMailboxSignatureDraft(signature = {}, mailbox = {}) {
    const label = asText(mailbox.label || mailbox.name || deriveMailboxLabel(mailbox.email), "Mailbox");
    const email = asText(mailbox.email).toLowerCase();
    const signatureLabel = asText(
      signature?.label || signature?.name,
      `${label} signatur`
    );
    const fullName = asText(signature?.fullName || signature?.displayName || "");
    const title = asText(signature?.title || signature?.line || "");
    const approvedMailboxTokens = new Set([
      "fazli",
      "fazli krasniqi",
      "fazli@hairtpclinic.com",
      "egzona",
      "egzona krasniqi",
      "egzona@hairtpclinic.com",
    ]);
    const mailboxTokens = [normalizeKey(label), normalizeKey(fullName), normalizeMailboxId(email)]
      .filter(Boolean)
      .concat(normalizeMailboxId(email).split("@")[0] || [])
      .filter(Boolean);
    const isApprovedMailbox = mailboxTokens.some((token) => approvedMailboxTokens.has(token));
    const html = isApprovedMailbox
      ? sanitizeMailboxSignatureHtml(signature?.html || signature?.body || "") ||
        buildDefaultMailboxSignatureHtml({
          label,
          email,
          fullName,
          title,
        })
      : "";
    return {
      label: signatureLabel,
      fullName,
      title,
      html,
    };
  }

  function getCustomMailboxSignatureLabel(mailbox = {}) {
    const normalizedMailbox = normalizeCustomMailboxDefinition(mailbox);
    return asText(normalizedMailbox?.signature?.label);
  }

  function buildStudioSignatureProfileFromMailbox(mailbox = {}, index = 0) {
    const normalizedMailbox = normalizeCustomMailboxDefinition(mailbox, index);
    if (!normalizedMailbox) return null;
    const signature = normalizedMailbox.signature || normalizeMailboxSignatureDraft({}, normalizedMailbox);
    const email = normalizeMailboxId(normalizedMailbox.email);
    const label = asText(signature?.label, normalizedMailbox.label || titleCaseMailbox(email));
    const fullName = asText(signature?.fullName, normalizedMailbox.label || label || "Mailbox");
    const title = asText(signature?.title);
    const signatureId = asText(
      `mailbox-signature:${normalizeMailboxId(normalizedMailbox.id || email || label)}`,
      ""
    );
    if (!signatureId) return null;
    return {
      id: signatureId,
      aliases: Array.from(
        new Set(
          [
            signatureId,
            normalizedMailbox.id,
            normalizedMailbox.email,
            label,
            fullName,
            normalizeMailboxId(normalizedMailbox.email).split("@")[0],
          ]
            .map((value) => normalizeKey(value))
            .filter(Boolean)
        )
      ),
      source: "mailbox_admin",
      label,
      fullName,
      title,
      email,
      html: asText(signature?.html),
      senderMailboxId: email,
      phone: "031-88 11 66",
      mailboxId: normalizedMailbox.id,
    };
  }

  function getStudioSignatureProfileIdentityTokens(profile = {}) {
    const senderMailboxId = normalizeMailboxId(profile?.senderMailboxId || profile?.email);
    const email = normalizeMailboxId(profile?.email || senderMailboxId);
    const mailboxId = normalizeMailboxId(profile?.mailboxId || senderMailboxId);
    const localPart = normalizeMailboxId((email || senderMailboxId).split("@")[0]);
    return Array.from(
      new Set(
        [
          normalizeKey(profile?.id),
          normalizeKey(profile?.label),
          normalizeKey(profile?.fullName),
          email,
          senderMailboxId,
          mailboxId,
          localPart,
          ...asArray(profile?.aliases).map((alias) => normalizeKey(alias)),
        ].filter(Boolean)
      )
    );
  }

  function getStudioAvailableSignatureProfiles() {
    const profiles = [];
    const seenTokens = new Set();
    const isApprovedStudioSignatureProfile = (profile = null) =>
      ["fazli", "egzona"].includes(normalizeKey(profile?.id || profile?.key));
    const addProfile = (profile = null) => {
      if (!profile || typeof profile !== "object") return;
      const normalizedProfile = {
        ...profile,
        email: normalizeMailboxId(profile.email || profile.senderMailboxId),
        senderMailboxId: normalizeMailboxId(profile.senderMailboxId || profile.email),
        html: asText(profile.html),
      };
      if (!isApprovedStudioSignatureProfile(normalizedProfile)) return;
      const identityTokens = getStudioSignatureProfileIdentityTokens(normalizedProfile);
      if (!identityTokens.length || identityTokens.some((token) => seenTokens.has(token))) {
        return;
      }
      identityTokens.forEach((token) => seenTokens.add(token));
      profiles.push(normalizedProfile);
    };
    asArray(state.customMailboxes).forEach((mailbox, index) => {
      addProfile(buildStudioSignatureProfileFromMailbox(mailbox, index));
    });
    STUDIO_SIGNATURE_PROFILES.forEach((profile) => {
      addProfile(profile);
    });
    return profiles;
  }

  function getMailboxIdentityTokens(mailbox = {}) {
    const values = [mailbox.id, mailbox.email, mailbox.label];
    const tokens = new Set();
    values.forEach((value) => {
      const normalized = normalizeMailboxId(value);
      if (!normalized) return;
      tokens.add(normalized);
      if (normalized.includes("@")) {
        const localPart = normalizeMailboxId(normalized.split("@")[0]);
        if (localPart) tokens.add(localPart);
      }
    });
    return Array.from(tokens);
  }

  function isDefaultCustomMailboxSignaturePreset(mailbox = {}) {
    const requestedTokens = new Set(
      getMailboxIdentityTokens(mailbox)
        .map((token) => normalizeMailboxId(token))
        .filter(Boolean)
    );
    if (!requestedTokens.size) return false;
    return DEFAULT_CUSTOM_MAILBOX_SIGNATURE_PRESETS.some((preset) =>
      getMailboxIdentityTokens(preset).some((token) =>
        requestedTokens.has(normalizeMailboxId(token))
      )
    );
  }

  function finalizeRuntimeMailboxSurface(mailbox = {}) {
    const hasLiveSource = mailbox.hasLiveSource === true;
    const localSignatureDefinition =
      mailbox.localSignatureDefinition && typeof mailbox.localSignatureDefinition === "object"
        ? normalizeCustomMailboxDefinition(mailbox.localSignatureDefinition)
        : !hasLiveSource && mailbox.custom
          ? normalizeCustomMailboxDefinition(mailbox)
          : null;
    const hasLocalSignatureDefinition = Boolean(localSignatureDefinition);
    const localSignatureSeeded = localSignatureDefinition?.seeded === true;
    const localSignatureLabel = asText(
      localSignatureDefinition?.signature?.label || mailbox.signature?.label
    );
    const isCustomMailbox = !hasLiveSource;
    return {
      ...mailbox,
      custom: isCustomMailbox,
      hasLiveSource,
      localSignatureDefinition,
      hasLocalSignatureDefinition,
      localSignatureSeeded,
      localSignatureLabel,
      statusLabel: isCustomMailbox ? "Custom" : "Live",
      surfaceKind: isCustomMailbox
        ? "custom_mailbox"
        : hasLocalSignatureDefinition
          ? "live_mailbox_with_local_signature"
          : "live_mailbox",
      adminEditable: isCustomMailbox || hasLocalSignatureDefinition,
      adminRemovable:
        isCustomMailbox || (hasLocalSignatureDefinition && hasLiveSource && !localSignatureSeeded),
      adminEditLabel:
        hasLiveSource && hasLocalSignatureDefinition ? "Redigera signatur" : "Redigera",
      adminRemoveLabel:
        hasLiveSource && hasLocalSignatureDefinition ? "Ta bort signatur" : "Ta bort",
      ownerCopy: hasLiveSource
        ? `Källa: ${asText(mailbox.owner, "Live")}`
        : `Ägare: ${asText(mailbox.owner, "Team")}`,
      signatureCopy: localSignatureLabel
        ? `${hasLiveSource ? "Lokal signatur" : "Signatur"}: ${localSignatureLabel}`
        : hasLiveSource
          ? "Signatur: Liveprofil"
          : "Ingen lokal signatur",
      showLivePill: hasLiveSource,
    };
  }

  function findExistingMailboxKey(mergedMailboxes, mailbox) {
    const mailboxTokens = new Set(getMailboxIdentityTokens(mailbox));
    if (!mailboxTokens.size) return "";
    for (const [key, entry] of mergedMailboxes.entries()) {
      const entryTokens = Array.isArray(entry.identityTokens)
        ? entry.identityTokens
        : getMailboxIdentityTokens(entry);
      if (entryTokens.some((token) => mailboxTokens.has(token))) {
        return key;
      }
    }
    return "";
  }

  function getRuntimeMailboxCanonicalId(mailbox = {}) {
    return normalizeMailboxId(
      mailbox?.email ||
        resolveRuntimeMailboxPresetEmail(mailbox?.id || mailbox?.label) ||
        mailbox?.id ||
        mailbox?.label ||
        ""
    );
  }

  function findRuntimeMailboxByScopeId(mailboxId = "", collection = getAvailableRuntimeMailboxes()) {
    const normalizedMailboxId = normalizeMailboxId(mailboxId);
    if (!normalizedMailboxId) return null;
    return (
      asArray(collection).find((mailbox) =>
        getMailboxIdentityTokens(mailbox).some(
          (token) => normalizeMailboxId(token) === normalizedMailboxId
        )
      ) || null
    );
  }

  function canonicalizeRuntimeMailboxId(mailboxId = "", collection = getAvailableRuntimeMailboxes()) {
    const normalizedMailboxId = normalizeMailboxId(mailboxId);
    if (!normalizedMailboxId) return "";
    const runtimeMailbox = findRuntimeMailboxByScopeId(normalizedMailboxId, collection);
    return getRuntimeMailboxCanonicalId(runtimeMailbox || { id: normalizedMailboxId });
  }

  function getCanonicalAvailableRuntimeMailboxIds() {
    return Array.from(
      new Set(
        getAvailableRuntimeMailboxes()
          .map((mailbox) => canonicalizeRuntimeMailboxId(mailbox.email || mailbox.id))
          .filter(Boolean)
      )
    );
  }

  const workspaceSourceOfTruth = PREVIEW_WORKSPACE_STATE.createWorkspaceStateApi({
    AUX_VIEWS,
    QUEUE_LANE_ORDER,
    asArray,
    asText,
    canonicalizeMailboxId: canonicalizeRuntimeMailboxId,
    normalizeKey,
    normalizeMailboxId,
    state,
  });

  const runtimeReentryState = PREVIEW_REENTRY_STATE.createRuntimeReentryStateApi({
    asArray,
    asText,
    canonicalizeRuntimeMailboxId,
    getRuntimeLeftColumnState,
    normalizeKey,
    normalizeMailboxId,
    state,
    workspaceSourceOfTruth,
    windowObject: window,
  });

  function captureRuntimeReentrySnapshot(reason = "state_change") {
    if (!runtimeReentryState || typeof runtimeReentryState.captureRuntimeReentrySnapshot !== "function") {
      return null;
    }
    return runtimeReentryState.captureRuntimeReentrySnapshot({ reason });
  }

  function restoreRuntimeReentrySnapshot(reason = "restore", options = {}) {
    if (!runtimeReentryState || typeof runtimeReentryState.restoreRuntimeReentrySnapshot !== "function") {
      return null;
    }
    return runtimeReentryState.restoreRuntimeReentrySnapshot({ reason, ...options });
  }

  function getRuntimeReentrySnapshot() {
    return typeof runtimeReentryState?.getRuntimeReentrySnapshot === "function"
      ? runtimeReentryState.getRuntimeReentrySnapshot()
      : null;
  }

  function debugRuntimeReentrySnapshot(label = "reentry") {
    if (!runtimeReentryState || typeof runtimeReentryState.debugReentrySnapshot !== "function") {
      return null;
    }
    return runtimeReentryState.debugReentrySnapshot(label);
  }

  function getRuntimeReentryOutcome() {
    return typeof runtimeReentryState?.getRuntimeReentryOutcome === "function"
      ? runtimeReentryState.getRuntimeReentryOutcome()
      : null;
  }

  const initialRuntimeReentrySnapshot = getRuntimeReentrySnapshot();
  let runtimeReentryBootstrapTimer = null;
  let runtimeReentryBootstrapApplied = false;
  const tryApplyRuntimeReentryBootstrap = () => {
    if (runtimeReentryBootstrapApplied) return;
    if (!getRuntimeReentrySnapshot()) return;
    if (!normalizeText(getAdminToken())) return;
    runtimeReentryBootstrapApplied = true;
    if (runtimeReentryBootstrapTimer) {
      window.clearInterval(runtimeReentryBootstrapTimer);
      runtimeReentryBootstrapTimer = null;
    }
    restoreRuntimeReentrySnapshot("bootstrap", { scopeMode: "hint_only" });
  };
  if (initialRuntimeReentrySnapshot) {
    tryApplyRuntimeReentryBootstrap();
    if (!runtimeReentryBootstrapApplied) {
      runtimeReentryBootstrapTimer = window.setInterval(tryApplyRuntimeReentryBootstrap, 250);
      window.addEventListener(
        "beforeunload",
        () => {
          if (runtimeReentryBootstrapTimer) {
            window.clearInterval(runtimeReentryBootstrapTimer);
            runtimeReentryBootstrapTimer = null;
          }
        },
        { once: true }
      );
    }
  }

  function hasMeaningfulRuntimeReentryState() {
    const selectedMailboxIds = asArray(workspaceSourceOfTruth.getSelectedMailboxIds()).filter(
      Boolean
    );
    return Boolean(
      asText(workspaceSourceOfTruth.getSelectedThreadId()) ||
        selectedMailboxIds.length ||
        state.runtime.queueHistory?.open ||
        asText(state.runtime.queueHistory?.selectedConversationId) ||
        state.runtime.queueInlinePanel?.open ||
        normalizeKey(state.runtime.activeLaneId || "all") !== "all" ||
        normalizeKey(state.runtime.selectedOwnerKey || "all") !== "all" ||
        normalizeKey(state.runtime.activeFocusSection || "conversation") !== "conversation" ||
        state.runtime.historyExpanded !== true ||
        asText(state.runtime.historySearch) ||
        normalizeKey(state.runtime.historyMailboxFilter || "all") !== "all" ||
        normalizeKey(state.runtime.historyResultTypeFilter || "all") !== "all" ||
        normalizeKey(state.runtime.historyRangeFilter || "all") !== "all" ||
        state.runtime.live === true ||
        state.runtime.offline === true
    );
  }

  function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toIso(value) {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createIdempotencyKey(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}`;
  }

  function isLocalPreviewHost() {
    try {
      const host = normalizeText(
        window.location?.hostname || window.location?.host || ""
      )
        .split(":")[0]
        .toLowerCase();
      return ["localhost", "127.0.0.1", "::1"].includes(host);
    } catch {
      return false;
    }
  }

  function getAdminToken() {
    const readTokenFromStorage = (storage) => {
      try {
        return normalizeText(storage?.getItem?.(ADMIN_TOKEN_STORAGE_KEY) || "");
      } catch {
        return "";
      }
    };

    const localToken = readTokenFromStorage(window.localStorage);
    if (localToken) return localToken;

    const sessionToken = readTokenFromStorage(window.sessionStorage);
    if (sessionToken) return sessionToken;

    // Prevent background auth-recovery loops until user explicitly initiates reauth.
    if (
      state.runtime?.authRequired === true &&
      state.runtime?.authRecoveryArmed !== true
    ) {
      return "";
    }

    if (typeof isLocalPreviewHost === "function" && isLocalPreviewHost()) {
      return "__preview_local__";
    }

    return "";
  }

  function clearAdminToken() {
    const clearTokenFromStorage = (storage) => {
      try {
        storage?.removeItem?.(ADMIN_TOKEN_STORAGE_KEY);
      } catch {}
    };

    clearTokenFromStorage(window.localStorage);
    clearTokenFromStorage(window.sessionStorage);
  }

  async function waitForTruthWorklistAuthToken({ timeoutMs = 1800, intervalMs = 60 } = {}) {
    const timeout = Math.max(0, Number(timeoutMs) || 0);
    const interval = Math.max(20, Number(intervalMs) || 60);
    const deadline = Date.now() + timeout;

    while (true) {
      const adminToken = normalizeText(getAdminToken());
      if (adminToken) return adminToken;
      if (Date.now() >= deadline) {
        return typeof isLocalPreviewHost === "function" && isLocalPreviewHost()
          ? "__preview_local__"
          : "";
      }
      await new Promise((resolve) => window.setTimeout(resolve, interval));
    }
  }

  function buildAdminReturnPath() {
    return `${window.location.pathname || "/major-arcana-preview/"}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function resolveShellView(view) {
    const normalizedView = normalizeKey(view);
    return AUTOMATION_VIEW_ALIASES[normalizedView] ? "automation" : normalizedView || "conversations";
  }

  function resolveAutomationSectionForView(view) {
    return AUTOMATION_VIEW_ALIASES[normalizeKey(view)] || "";
  }

  function readShellViewStateFromLocation() {
    if (typeof window === "undefined") {
      return { view: "conversations", automationSection: "" };
    }
    const params = new URLSearchParams(window.location.search || "");
    return {
      view: normalizeKey(params.get("view")) || "conversations",
      automationSection:
        normalizeKey(params.get("automationSection") || params.get("section")) || "",
    };
  }

  function buildShellViewStateForUrl() {
    const requestedView = normalizeKey(state.view) || "conversations";
    const shellView = resolveShellView(requestedView);
    const selectedAutomationSection = normalizeKey(state.selectedAutomationSection) || "byggare";

    if (shellView === "conversations") {
      return { view: "", automationSection: "" };
    }

    if (requestedView === "templates" && selectedAutomationSection === "mallar") {
      return { view: "templates", automationSection: "" };
    }

    if (requestedView === "workflows" && selectedAutomationSection === "byggare") {
      return { view: "workflows", automationSection: "" };
    }

    if (shellView === "automation") {
      return {
        view: "automation",
        automationSection: selectedAutomationSection === "byggare" ? "" : selectedAutomationSection,
      };
    }

    return { view: shellView, automationSection: "" };
  }

  function syncShellViewToLocation() {
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    const { view, automationSection } = buildShellViewStateForUrl();
    if (view) {
      url.searchParams.set("view", view);
    } else {
      url.searchParams.delete("view");
    }
    if (automationSection) {
      url.searchParams.set("automationSection", automationSection);
    } else {
      url.searchParams.delete("automationSection");
      url.searchParams.delete("section");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }

  function buildReauthUrl(reason = "session_expired") {
    if (state.runtime && state.runtime.authRequired === true) {
      state.runtime.authRecoveryArmed = true;
    }
    const params = new URLSearchParams();
    params.set(AUTH_RETURN_TO_QUERY_PARAM, buildAdminReturnPath());
    params.set("reason", reason);
    return `/admin?${params.toString()}`;
  }

  function isAuthFailure(statusCode, message = "") {
    if (statusCode === 401) return true;
    if (statusCode !== 403) return false;
    const normalized = normalizeKey(message);
    return [
      "behörighet",
      "åtkomst",
      "sessionen är ogiltig",
      "inloggning krävs",
      "permission",
      "access",
      "session",
      "sign in",
    ].some((token) => normalized.includes(token));
  }

  function titleCaseMailbox(value) {
    const localPart = asText(value).split("@")[0] || "";
    if (!localPart) return "Mailbox";
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }

  function getRuntimeMode() {
    const normalizedMode = normalizeKey(state.runtime?.mode || "");
    if (normalizedMode) return normalizedMode;
    if (state.runtime?.authRequired) return "auth_required";
    if (state.runtime?.live) return "live";
    if (state.runtime?.offline) return "offline_history";
    if (normalizeText(state.runtime?.error)) return "runtime_error";
    return "live";
  }

  let lastExplicitNavigationAt = 0;
  let suppressAutoScrollUntil = 0;
  let activeRuntimeVisualState = "";
  let appliedShellViewState = "";
  let appliedConversationShellState = null;

  function markExplicitNavigationIntent() {
    lastExplicitNavigationAt = Date.now();
  }

  function hasRecentExplicitNavigationIntent(windowMs = 1200) {
    return Date.now() - lastExplicitNavigationAt <= windowMs;
  }

  function shouldSuppressProgrammaticScroll() {
    return Date.now() < suppressAutoScrollUntil && !hasRecentExplicitNavigationIntent();
  }

  if (typeof Element !== "undefined" && Element.prototype) {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    if (typeof originalScrollIntoView === "function" && !Element.prototype.__majorArcanaPatchedScrollIntoView) {
      Element.prototype.scrollIntoView = function patchedScrollIntoView(...args) {
        if (shouldSuppressProgrammaticScroll()) return;
        return originalScrollIntoView.apply(this, args);
      };
      Element.prototype.__majorArcanaPatchedScrollIntoView = true;
    }
  }

  document.addEventListener(
    "pointerdown",
    () => {
      markExplicitNavigationIntent();
    },
    true
  );

  document.addEventListener(
    "keydown",
    () => {
      markExplicitNavigationIntent();
    },
    true
  );

  const RUNTIME_VISUAL_STATES = Object.freeze([
    "ready",
    "syncing",
    "auth_required",
    "offline_history",
    "runtime_error",
  ]);

  function deriveRuntimeVisualState() {
    if (state.runtime?.authRequired === true) return "auth_required";
    if (state.runtime?.loading === true) return "syncing";
    if (normalizeText(state.runtime?.error)) return "runtime_error";
    if (normalizeKey(getRuntimeMode()) === "offline_history") return "offline_history";
    return "ready";
  }

  function syncRuntimeVisualStateMachine() {
    const visualState = deriveRuntimeVisualState();
    state.runtime.visualState = visualState;

    if (visualState === "auth_required" && activeRuntimeVisualState !== "auth_required") {
      state.runtime.mode = "auth_required";
      state.runtime.authRecoveryArmed = false;
    }

    if (
      state.runtime.hasReachedSteadyState !== true &&
      (visualState === "ready" || visualState === "offline_history")
    ) {
      state.runtime.hasReachedSteadyState = true;
    }

    if (state.runtime.hasRemovedRuntimeLoading !== true) {
      document.body.classList.remove("is-runtime-loading");
      state.runtime.hasRemovedRuntimeLoading = true;
    }

    RUNTIME_VISUAL_STATES.forEach((candidate) => {
      canvas.classList.toggle(`is-runtime-${candidate}`, candidate === visualState);
    });
    canvas.dataset.runtimeVisualState = visualState;

    const freezeWorkspaceWidths = visualState === "auth_required" || visualState === "syncing";
    if (freezeWorkspaceWidths) {
      if (!canvas.classList.contains("is-workspace-width-frozen")) {
        canvas.style.setProperty("--workspace-left-width-locked", `${workspaceState.left}px`);
        canvas.style.setProperty("--workspace-main-width-locked", `${workspaceState.main}px`);
        canvas.style.setProperty("--workspace-right-width-locked", `${workspaceState.right}px`);
      }
      canvas.classList.add("is-workspace-width-frozen");
    } else {
      canvas.classList.remove("is-workspace-width-frozen");
    }

    if (activeRuntimeVisualState && activeRuntimeVisualState !== visualState) {
      suppressAutoScrollUntil = Date.now() + 1400;
    }
    activeRuntimeVisualState = visualState;

    return visualState;
  }

  function buildRuntimeMailboxCapabilities(graph = {}) {
    const signatureProfiles = asArray(graph?.signatureProfiles);
    const runtimeMode =
      normalizeKey(graph?.runtimeMode || (graph?.readEnabled === true ? "live" : "offline_history")) ||
      "runtime_error";
    const explicitCapabilities = asArray(graph?.mailboxCapabilities)
      .map((capability, index) => {
        const mailboxId = normalizeMailboxId(capability?.email || capability?.id || "");
        if (!mailboxId) return null;
        const signatureProfileId = normalizeKey(capability?.signatureProfileId || "");
        const signatureProfile =
          signatureProfiles.find((profile) => normalizeKey(profile?.key) === signatureProfileId) || null;
        return {
          id: mailboxId,
          email: mailboxId,
          label: asText(capability?.label, titleCaseMailbox(mailboxId)),
          runtimeMode,
          readAvailable: capability?.readAvailable === true,
          sendAvailable: capability?.sendAvailable === true,
          deleteAvailable: capability?.deleteAvailable === true,
          senderAvailable: capability?.senderAvailable === true,
          signatureProfileId,
          signatureProfileAvailable: capability?.signatureProfileAvailable === true,
          signatureProfileLabel: asText(
            capability?.signatureProfileLabel,
            signatureProfile ? titleCaseMailbox(signatureProfile.senderMailboxId) : ""
          ),
          order: Number.isFinite(Number(capability?.order)) ? Number(capability.order) : index,
        };
      })
      .filter(Boolean);
    if (explicitCapabilities.length) {
      return explicitCapabilities;
    }
    const normalizedAllowlistMailboxIds = asArray(graph?.allowlistMailboxIds)
      .map(normalizeMailboxId)
      .filter(Boolean);
    const normalizedSenderMailboxOptions = asArray(graph?.senderMailboxOptions)
      .map(normalizeMailboxId)
      .filter(Boolean);
    const allowlistTokens = new Set(
      normalizedAllowlistMailboxIds.flatMap((mailboxId) => {
        const localPart = mailboxId.includes("@")
          ? normalizeMailboxId(mailboxId.split("@")[0])
          : "";
        return localPart && localPart !== mailboxId ? [mailboxId, localPart] : [mailboxId];
      })
    );
    const senderTokens = new Set(
      normalizedSenderMailboxOptions.flatMap((mailboxId) => {
        const localPart = mailboxId.includes("@")
          ? normalizeMailboxId(mailboxId.split("@")[0])
          : "";
        return localPart && localPart !== mailboxId ? [mailboxId, localPart] : [mailboxId];
      })
    );
    const signatureProfilesByMailbox = new Map(
      signatureProfiles
        .map((profile) => {
          const mailboxId = normalizeMailboxId(profile?.senderMailboxId);
          if (!mailboxId) return null;
          return [mailboxId, profile];
        })
        .filter(Boolean)
    );
    const candidateMailboxIds = Array.from(
      new Set([
        normalizeMailboxId(graph?.defaultSenderMailbox),
        ...normalizedAllowlistMailboxIds,
        ...normalizedSenderMailboxOptions,
        ...signatureProfiles.map((profile) => normalizeMailboxId(profile?.senderMailboxId)),
      ])
    ).filter(Boolean);

    return candidateMailboxIds.map((mailboxId, index) => {
      const localPart = mailboxId.includes("@")
        ? normalizeMailboxId(mailboxId.split("@")[0])
        : "";
      const signatureProfile =
        signatureProfilesByMailbox.get(mailboxId) ||
        signatureProfiles.find((profile) => normalizeKey(profile?.key) === localPart) ||
        null;
      const senderAvailable = senderTokens.has(mailboxId) || (localPart && senderTokens.has(localPart));
      const readAvailable =
        graph?.readEnabled === true &&
        (!allowlistTokens.size || allowlistTokens.has(mailboxId) || (localPart && allowlistTokens.has(localPart)));
      return {
        id: mailboxId,
        email: mailboxId,
        label: titleCaseMailbox(mailboxId),
        runtimeMode,
        readAvailable,
        sendAvailable: graph?.sendEnabled === true && senderAvailable,
        deleteAvailable: graph?.deleteEnabled === true && senderAvailable,
        senderAvailable,
        signatureProfileId: normalizeKey(signatureProfile?.key || ""),
        signatureProfileAvailable: Boolean(signatureProfile),
        signatureProfileLabel: signatureProfile ? titleCaseMailbox(signatureProfile.senderMailboxId) : "",
        order: index,
      };
    });
  }

  function getRuntimeMailboxCapability(mailboxId = "") {
    const normalizedMailboxId = normalizeMailboxId(mailboxId);
    if (!normalizedMailboxId) return null;
    const requestedTokens = new Set(
      getMailboxIdentityTokens({
        id: normalizedMailboxId,
        email: normalizedMailboxId,
        label: titleCaseMailbox(normalizedMailboxId),
      }).map(normalizeMailboxId)
    );
    return (
      asArray(state.runtime.mailboxCapabilities).find((capability) =>
        getMailboxIdentityTokens(capability).some((token) => requestedTokens.has(normalizeMailboxId(token)))
      ) || null
    );
  }

  function getRuntimeMailboxCapabilityMeta(mailboxId = "", { includeDelete = false } = {}) {
    const capability = getRuntimeMailboxCapability(mailboxId);
    const customMailbox = findCustomMailboxDefinition(mailboxId);
    const localSignatureLabel = asText(customMailbox?.signature?.label);
    const runtimeMode = getRuntimeMode();
    const parts = [];
    const writeBlockedByMode = runtimeMode === "auth_required" || runtimeMode === "offline_history";
    const sendModeBlockedCopy =
      runtimeMode === "auth_required" ? "Skicka: auth-låst" : "Skicka: spärrad i läsläge";
    const deleteModeBlockedCopy =
      runtimeMode === "auth_required" ? "Radera: auth-låst" : "Radera: spärrad i läsläge";
    const requestedTokens = new Set(
      getMailboxIdentityTokens({
        id: mailboxId,
        email: mailboxId,
        label: titleCaseMailbox(mailboxId),
      })
        .map(normalizeMailboxId)
        .filter(Boolean)
    );
    const matchedAvailableMailbox =
      !capability && runtimeMode === "live"
        ? getAvailableRuntimeMailboxes().find((mailbox) =>
            getMailboxIdentityTokens(mailbox).some((token) =>
              requestedTokens.has(normalizeMailboxId(token))
            )
          ) || null
        : null;
    const inferredProfileBlocked = !capability && runtimeMode === "live" && Boolean(matchedAvailableMailbox);
    const mailboxPolicyBlocked =
      capability?.senderAvailable === false ||
      (capability?.sendAvailable !== true && capability?.signatureProfileAvailable === false) ||
      inferredProfileBlocked;
    const sendBlockedCopy = inferredProfileBlocked
      ? "Skicka: spärrad i nuvarande profil"
      : "Skicka: spärrad för egen mailbox";
    const deleteBlockedCopy = inferredProfileBlocked
      ? "Radera: spärrad i nuvarande profil"
      : "Radera: spärrad för egen mailbox";
    const signatureBlockedCopy = inferredProfileBlocked
      ? "Signatur: profil saknas i nuvarande läge"
      : "Signatur: egen profil saknas";
    if (runtimeMode === "auth_required") {
      parts.push("Läs: auth-låst");
    } else if (runtimeMode === "offline_history") {
      parts.push("Läs: offline historik · läsläge");
    } else {
      parts.push(capability?.readAvailable ? "Läs: livekälla" : "Läs: spärrad");
    }
    parts.push(
      writeBlockedByMode
        ? sendModeBlockedCopy
        : capability?.sendAvailable
        ? "Skicka: aktiv"
        : mailboxPolicyBlocked
          ? sendBlockedCopy
          : "Skicka: spärrad"
    );
    if (includeDelete) {
      parts.push(
        writeBlockedByMode
          ? deleteModeBlockedCopy
          : capability?.deleteAvailable
          ? "Radera: aktiv"
          : mailboxPolicyBlocked
            ? deleteBlockedCopy
            : "Radera: spärrad"
      );
    }
    parts.push(
      capability?.signatureProfileAvailable
        ? `Signatur: ${capability.signatureProfileLabel || titleCaseMailbox(mailboxId)}`
        : localSignatureLabel
          ? `Signatur: ${localSignatureLabel}`
        : mailboxPolicyBlocked
          ? signatureBlockedCopy
          : "Signatur: saknas"
    );
    return parts.join(" · ");
  }

  function formatRuntimeDateTime(value, options) {
    const iso = toIso(value);
    if (!iso) return "";
    return new Intl.DateTimeFormat("sv-SE", options).format(new Date(iso));
  }

  function formatListTime(value) {
    const iso = toIso(value);
    if (!iso) return "Nu";
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return formatRuntimeDateTime(iso, { hour: "2-digit", minute: "2-digit" });
    }
    return formatRuntimeDateTime(iso, { month: "short", day: "numeric" });
  }

  function formatConversationTime(value) {
    const iso = toIso(value);
    if (!iso) return "Nu";
    const date = new Date(iso);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    const clock = formatRuntimeDateTime(iso, { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `Idag ${clock}`;
    if (isYesterday) return `Igår ${clock}`;
    return formatRuntimeDateTime(iso, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatDueLabel(value) {
    const iso = toIso(value);
    if (!iso) return "Ingen deadline";
    const target = new Date(iso).getTime();
    const diffHours = Math.round((target - Date.now()) / (60 * 60 * 1000));
    if (diffHours > 0 && diffHours <= 12) {
      return `${diffHours}h kvar`;
    }
    return formatRuntimeDateTime(iso, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function deriveFollowUpAgingState(row = {}) {
    const dueIso = toIso(row?.followUpDueAt || row?.followUpSuggestedAt);
    const lastOutboundIso = toIso(row?.lastOutboundAt);
    const waitingOn = normalizeKey(row?.waitingOn);
    const statusLabel = normalizeKey(row?.statusLabel);
    const nextActionLabel = normalizeKey(row?.nextActionLabel);
    const workflowLane = normalizeKey(row?.workflowLane);
    const waitingForCustomer =
      waitingOn === "customer" ||
      statusLabel === "besvarad" ||
      nextActionLabel === "invanta_svar" ||
      nextActionLabel === "folj_upp_snart" ||
      nextActionLabel === "folj_upp_nu" ||
      nextActionLabel.includes("uppfolj") ||
      workflowLane === "waiting_reply";
    const buildState = (label = "", actionLabel = "", tone = "", detail = "") => ({
      label,
      actionLabel,
      tone,
      detail,
    });

    if (dueIso) {
      const diffHours = (Date.parse(dueIso) - Date.now()) / (60 * 60 * 1000);
      if (diffHours <= 0) {
        return buildState("Följ upp nu", "Följ upp nu", "urgent", "Planerad uppföljning har passerat.");
      }
      if (diffHours <= 12) {
        return buildState(
          `${Math.max(1, Math.round(diffHours))}h kvar`,
          "Följ upp snart",
          "warning",
          "Uppföljning närmar sig."
        );
      }
      return buildState("", "", "", "");
    }

    if (waitingForCustomer && lastOutboundIso) {
      const diffHours = (Date.now() - Date.parse(lastOutboundIso)) / (60 * 60 * 1000);
      if (diffHours >= 72) {
        return buildState("72h inaktiv", "Följ upp nu", "urgent", "Kunden har inte svarat.");
      }
      if (diffHours >= 48) {
        return buildState("48h inaktiv", "Följ upp nu", "urgent", "Kunden har inte svarat.");
      }
      if (diffHours >= 24) {
        return buildState("24h inaktiv", "Följ upp snart", "warning", "Kunden väntar på nästa steg.");
      }
    }

    return buildState("", "", "", "");
  }

  function extractEmail(value) {
    const match = asText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].toLowerCase() : "";
  }

  function looksLikeMailboxIdentity(value) {
    const normalized = normalizeKey(value);
    if (!normalized) return false;
    return (
      normalized.includes("@hairtpclinic.com") ||
      normalized.includes("hair tp clinic") ||
      ["kons", "info", "kontakt", "contact", "mailbox"].includes(normalized)
    );
  }

  function getRuntimeCustomerName(row) {
    const extractRuntimeEmail = (value = "") => {
      const match = asText(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0].toLowerCase() : "";
    };
    const extractRuntimePreviewTextFromHtml = (value = "") => {
      const html = asText(value).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\s+/g, " ")
        .trim();
    };
    const humanizeRuntimeTechnicalSender = (value = "") => {
      const email = extractRuntimeEmail(value);
      if (!email) return "";
      const [localPart = "", domainPart = ""] = email.split("@");
      const normalizedLocalPart = normalizeKey(localPart);
      const genericLocalParts = new Set([
        "info",
        "support",
        "contact",
        "kontakt",
        "hello",
        "mail",
        "mailer",
        "news",
        "newsletter",
        "noreply",
        "no-reply",
        "reply",
        "service",
        "team",
        "admin",
        "booking",
        "bokning",
        "order",
        "orders",
        "receipt",
        "receipts",
      ]);
      const technicalDomainParts = new Set([
        "app",
        "cdn",
        "email",
        "img",
        "image",
        "mail",
        "mailer",
        "news",
        "newsletter",
        "noreply",
        "no-reply",
        "reply",
        "support",
        "kontakt",
        "contact",
        "www",
      ]);
      const titleCaseParts = (parts = []) =>
        parts
          .map((part) => asText(part).trim())
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ");

      if (!genericLocalParts.has(normalizedLocalPart)) {
        return titleCaseParts(localPart.split(/[._+-]+/g));
      }

      const domainTokens = domainPart.split(".").filter(Boolean);
      if (domainTokens.length >= 2) {
        const suffix = domainTokens[domainTokens.length - 1];
        const baseTokens = domainTokens.slice(0, -1).filter(Boolean);
        const meaningfulBase =
          [...baseTokens]
            .reverse()
            .find((part) => {
              const normalizedPart = normalizeKey(part);
              return (
                normalizedPart &&
                normalizedPart.length > 1 &&
                !technicalDomainParts.has(normalizedPart)
              );
            }) || baseTokens[baseTokens.length - 1];
        if (meaningfulBase) {
          return titleCaseParts([meaningfulBase, suffix]);
        }
      }

      return titleCaseParts(localPart.split(/[._+-]+/g));
    };
    const extractRuntimeSenderNameFromText = (value = "") => {
      const text = extractRuntimePreviewTextFromHtml(value);
      if (!text) return "";
      const matchers = [
        /\bFrån:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrom:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrån:\s*([^\n]+?)\s+(?:Datum:|Date:|Till:|To:|Ämne:|Subject:)/i,
        /\bFrom:\s*([^\n]+?)\s+(?:Date:|To:|Subject:)/i,
      ];
      for (const matcher of matchers) {
        const candidate = asText(text.match(matcher)?.[1]).trim();
        if (
          candidate &&
          !looksLikeMailboxIdentity(candidate) &&
          !isRuntimeUnknownCustomerName(candidate)
        ) {
          return candidate
            .replace(/\s+\|\s+Hair TP Clinic.*$/i, "")
            .replace(/\s+\|\s+.*$/i, "")
            .trim();
        }
      }
      return "";
    };
    const subjectDerivedCustomerName = deriveRuntimeCustomerNameFromSubject(
      row?.displaySubject || row?.subject || row?.summary || row?.title
    );
    const candidates = [
      row?.customerSummary?.customerName,
      row?.customerName,
      row?.senderName,
      row?.senderDisplayName,
      row?.sender,
      row?.counterpart,
      row?.counterpartyName,
      row?.fromName,
      row?.contactName,
      row?.latestMessage?.senderName,
      row?.latestMessage?.fromName,
      row?.latestMessage?.contactName,
      row?.conversation?.senderName,
      row?.conversation?.fromName,
      row?.conversation?.contactName,
      extractRuntimeSenderNameFromText(row?.latestInboundPreview),
      extractRuntimeSenderNameFromText(row?.preview),
      extractRuntimeSenderNameFromText(row?.systemPreview),
      extractRuntimeSenderNameFromText(row?.latestPreview),
      extractRuntimeSenderNameFromText(row?.bodyPreview),
      extractRuntimeSenderNameFromText(row?.detail),
      extractRuntimeSenderNameFromText(row?.summary),
      extractRuntimeSenderNameFromText(row?.body),
      extractRuntimeSenderNameFromText(row?.bodyHtml),
      extractRuntimeSenderNameFromText(row?.latestMessage?.preview),
      extractRuntimeSenderNameFromText(row?.latestMessage?.bodyPreview),
      extractRuntimeSenderNameFromText(row?.latestMessage?.detail),
      extractRuntimeSenderNameFromText(row?.latestMessage?.summary),
      extractRuntimeSenderNameFromText(row?.latestMessage?.body),
      extractRuntimeSenderNameFromText(row?.latestMessage?.bodyHtml),
      extractRuntimeSenderNameFromText(row?.conversation?.preview),
      extractRuntimeSenderNameFromText(row?.conversation?.bodyPreview),
      extractRuntimeSenderNameFromText(row?.conversation?.detail),
      extractRuntimeSenderNameFromText(row?.conversation?.summary),
      extractRuntimeSenderNameFromText(row?.conversation?.body),
      extractRuntimeSenderNameFromText(row?.conversation?.bodyHtml),
      subjectDerivedCustomerName,
    ].map((value) => asText(value)).filter(Boolean);
    const isTechnicalSenderIdentity = (value = "") =>
      Boolean(extractRuntimeEmail(value)) || looksLikeMailboxIdentity(value);
    const preferred = candidates.find(
      (value) =>
        !isTechnicalSenderIdentity(value) && !isRuntimeUnknownCustomerName(value)
    );
    const nonMailboxFallback = candidates.find(
      (value) => !isTechnicalSenderIdentity(value)
    );
    const humanizedEmailFallback = candidates
      .map((value) => humanizeRuntimeTechnicalSender(value))
      .find(Boolean);
    return preferred || nonMailboxFallback || humanizedEmailFallback || candidates[0] || "Okänd kund";
  }

  function getRuntimeCustomerNameFromFeedEntries(feedEntries = [], fallback = "") {
    const extractRuntimePreviewTextFromHtml = (value = "") => {
      const html = asText(value).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\s+/g, " ")
        .trim();
    };
    const extractRuntimeSenderNameFromText = (value = "") => {
      const text = extractRuntimePreviewTextFromHtml(value);
      if (!text) return "";
      const matchers = [
        /\bFrån:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrom:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrån:\s*([^\n]+?)\s+(?:Datum:|Date:|Till:|To:|Ämne:|Subject:)/i,
        /\bFrom:\s*([^\n]+?)\s+(?:Date:|To:|Subject:)/i,
      ];
      for (const matcher of matchers) {
        const candidate = asText(text.match(matcher)?.[1]).trim();
        if (
          candidate &&
          !looksLikeMailboxIdentity(candidate) &&
          !isRuntimeUnknownCustomerName(candidate)
        ) {
          return candidate
            .replace(/\s+\|\s+Hair TP Clinic.*$/i, "")
            .replace(/\s+\|\s+.*$/i, "")
            .trim();
        }
      }
      return "";
    };
    const candidates = asArray(feedEntries)
      .filter((entry) => normalizeKey(entry?.direction || "inbound") !== "outbound")
      .flatMap((entry) => [
        entry?.senderName,
        entry?.fromName,
        entry?.contactName,
        entry?.counterpart,
        entry?.counterpartyName,
        entry?.customerName,
        entry?.mailDocument?.from?.name,
        entry?.mailDocument?.sender?.name,
        extractRuntimeSenderNameFromText(entry?.mailThreadMessage?.presentation?.previewText),
        extractRuntimeSenderNameFromText(entry?.mailThreadMessage?.presentation?.conversationText),
        extractRuntimeSenderNameFromText(entry?.mailThreadMessage?.primaryBody?.text),
        extractRuntimeSenderNameFromText(entry?.mailDocument?.previewText),
        extractRuntimeSenderNameFromText(entry?.mailDocument?.primaryBodyText),
        extractRuntimeSenderNameFromText(entry?.preview),
        extractRuntimeSenderNameFromText(entry?.bodyPreview),
        extractRuntimeSenderNameFromText(entry?.detail),
        extractRuntimeSenderNameFromText(entry?.summary),
        extractRuntimeSenderNameFromText(entry?.body),
        extractRuntimeSenderNameFromText(entry?.bodyHtml),
      ])
      .map((value) => asText(value).trim())
      .filter(Boolean);
    const preferred = candidates.find(
      (value) => !looksLikeMailboxIdentity(value) && !isRuntimeUnknownCustomerName(value)
    );
    const nonMailboxFallback = candidates.find((value) => !looksLikeMailboxIdentity(value));
    return preferred || nonMailboxFallback || asText(fallback);
  }

  function extractCustomerEmail(row) {
    const candidates = [
      row?.customerEmail,
      row?.customerKey,
      row?.sender,
      row?.customerSummary?.customerKey,
      row?.latestInboundPreview,
    ];
    for (const candidate of candidates) {
      const email = extractEmail(candidate);
      if (email) return email;
    }
    return "";
  }

  function initialsForName(value) {
    const parts = asText(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (!parts.length) return "CU";
    return parts.map((part) => part.charAt(0).toUpperCase()).join("");
  }

  function buildAvatarDataUri(name) {
    const initials = initialsForName(name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f6d5df"/><stop offset="100%" stop-color="#e8eef8"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="34" font-weight="700" fill="#6b7280">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function humanizeCode(value, fallback = "-") {
    const normalized = normalizeKey(value);
    if (!normalized) return fallback;
    const labels = {
      active_dialogue: "Aktiv dialog",
      follow_up_pending: "Återbesök väntar",
      booking_ready: "Redo att boka",
      ready_to_book: "Redo att boka",
      needs_action: "Behöver åtgärd",
      needs_review: "Behöver granskning",
      review_needed: "Behöver granskning",
      new: "Ny",
      repeat: "Återkommande",
      needs_reply: "Behöver svar",
      response_needed: "Svar krävs",
      awaiting_customer: "Väntar på kund",
      awaiting_owner: "Behöver åtgärd",
      awaiting_confirmation: "Väntar på bekräftelse",
      ready_now: "Redo att boka",
      blocked_medical: "Medicinsk kontroll",
      not_relevant: "Ej relevant",
      safe: "Stabil",
      warning: "Riskerar SLA",
      breach: "SLA bruten",
      low: "Låg",
      medium: "Medel",
      high: "Hög",
      unclear: "Oklart",
      medical: "Medicinsk",
      miss: "Miss",
      neutral: "Neutral",
      normal: "Normal",
      reflective: "Reflekterande",
      responsive: "Responsiv",
      direct: "Direkt",
      customer: "Kund",
      owner: "Ägare",
      clinic: "Klinik",
      none: "Ingen",
    };
    if (labels[normalized]) return labels[normalized];
    return normalized
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getIntegrationCatalogMap() {
    return Object.fromEntries(INTEGRATION_CATALOG.map((item) => [item.key, item]));
  }

  function getIntegrationCategoryLabel(value) {
    const normalized = normalizeKey(value);
    const labels = {
      all: "Alla",
      calendar: "Kalender",
      payment: "Betalning",
      communication: "Kommunikation",
      analytics: "Analys",
      automation: "Automatisering",
    };
    return labels[normalized] || humanizeCode(normalized, "Alla");
  }

  function getIntegrationStatusToneLabel(tone, isConnected) {
    const normalized = normalizeKey(tone);
    if (normalized === "healthy") return "Stabil";
    if (normalized === "attention") return "Bevaka";
    if (normalized === "idle") return isConnected ? "Redo" : "Inte aktiv";
    return isConnected ? "Live" : "Redo";
  }

  function getFallbackIntegrationRecord(item) {
    const isConnected = item?.connected === true;
    return {
      id: item?.key || "",
      category: item?.category || "automation",
      isConnected,
      statusTone: isConnected ? "healthy" : "idle",
      statusSummary: item?.copy || (isConnected ? "Ansluten." : "Inte ansluten ännu."),
      watchLabel: isConnected
        ? "Verifiera guardrails och ägarskap efter aktivering."
        : "Koppla in när det faktiskt hjälper operatören i vardagen.",
      configurable: true,
      docsAvailable: true,
      updatedAt: "",
    };
  }

  function getIntegrationRuntimeRecord(key) {
    const normalizedKey = normalizeKey(key);
    const runtimeRecord = asArray(state.integrationsRuntime.records).find(
      (item) => normalizeKey(item?.id) === normalizedKey
    );
    if (runtimeRecord) return runtimeRecord;
    const fallback = getIntegrationCatalogMap()[normalizedKey];
    return fallback ? getFallbackIntegrationRecord(fallback) : null;
  }

  function getIntegrationConnectedKeys() {
    return INTEGRATION_CATALOG.filter((item) => getIntegrationRuntimeRecord(item.key)?.isConnected).map(
      (item) => item.key
    );
  }

  function getFallbackIntegrationActorProfile() {
    const signature = getStudioSignatureProfile(
      state.runtime.defaultSignatureProfile ||
        state.studio.selectedSignatureId ||
        CCO_DEFAULT_SIGNATURE_PROFILE
    );
    return {
      name: signature?.fullName || "CCO Operator",
      email: signature?.email || CCO_DEFAULT_REPLY_SENDER,
    };
  }

  function getIntegrationActorProfile() {
    const profile = state.integrationsRuntime.actorProfile;
    if (profile?.name && profile?.email) return profile;
    return getFallbackIntegrationActorProfile();
  }

  function buildIntegrationSalesMessage() {
    const categoryLabel = getIntegrationCategoryLabel(state.selectedIntegrationCategory || "all");
    const connectedKeys = getIntegrationConnectedKeys();
    return [
      `Enterpriseförfrågan från Major Arcana-integrationsytan.`,
      `Fokus just nu: ${categoryLabel}.`,
      `Aktiva kopplingar i tenant: ${connectedKeys.length}/${INTEGRATION_CATALOG.length}.`,
      `Önskar genomgång av guardrails, readiness och nästa lämpliga integrationssteg.`,
    ].join(" ");
  }

  function buildIntegrationDocsHtml(payload) {
    const sections = asArray(payload?.sections);
    const updatedAtLabel = payload?.updatedAt
      ? formatConversationTime(payload.updatedAt)
      : "Nu";
    const sectionMarkup = sections
      .map((section) => {
        const items = asArray(section?.items)
          .map(
            (item) =>
              `<li><strong>${escapeHtml(asText(item?.method, "GET"))}</strong> <code>${escapeHtml(
                asText(item?.path)
              )}</code><p>${escapeHtml(asText(item?.description))}</p></li>`
          )
          .join("");
        return `<section><h2>${escapeHtml(asText(section?.title, "Integrationer"))}</h2><ul>${items}</ul></section>`;
      })
      .join("");
    return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <title>CCO Integrationsdocs</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 32px; background: #f6f0ea; color: #2f2a25; }
      main { max-width: 920px; margin: 0 auto; display: grid; gap: 24px; }
      .hero, section { background: rgba(255,255,255,0.84); border: 1px solid rgba(120,105,90,0.16); border-radius: 20px; padding: 24px; box-shadow: 0 8px 24px rgba(70,50,30,0.08), inset 0 1px 0 rgba(255,255,255,0.55); }
      h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.15; }
      h2 { margin: 0 0 16px; font-size: 20px; line-height: 1.2; }
      p { margin: 0; font-size: 16px; line-height: 1.45; color: rgba(70,60,50,0.82); }
      ul { margin: 0; padding-left: 18px; display: grid; gap: 14px; }
      li p { margin-top: 6px; }
      code { padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.82); }
      .meta { margin-top: 10px; font-size: 14px; color: rgba(70,60,50,0.58); }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Integrationsdocs</h1>
        <p>Operativ översikt för CCO-integrationer, workspace-endpoints och telemetry-källor.</p>
        <p class="meta">Senast uppdaterad: ${escapeHtml(updatedAtLabel)}</p>
      </section>
      ${sectionMarkup}
    </main>
  </body>
</html>`;
  }

  const SETTINGS_SIDEBAR_SECTIONS = Object.freeze([
    { toggleKey: "ai_prediction", id: "ai-prediction", label: "AI-förutsägelse", order: 1 },
    { toggleKey: "metrics", id: "metrics", label: "Mätvärden", order: 2 },
    { toggleKey: "templates", id: "templates", label: "Mallar", order: 3 },
    { toggleKey: "scheduling", id: "scheduling", label: "Smart schemaläggning", order: 4 },
    { toggleKey: "upsell", id: "upsell", label: "Merförsäljningsmöjligheter", order: 5 },
    { toggleKey: "auto_assign", id: "assignment", label: "Auto-tilldela", order: 6 },
  ]);

  const SETTINGS_TOGGLE_KEY_MAP = Object.freeze({
    google_calendar: "googleCalendarSync",
    outlook: "outlookIntegration",
    booking_confirmation: "automaticBookingConfirmation",
    payment_reminders: "paymentReminders",
    stripe: "stripeIntegration",
    swish: "swishPayments",
    email_signature: "emailSignature",
    read_receipts: "readReceipts",
    office_hours_auto_reply: "outOfOfficeAutoReplies",
    weekly_summary: "weeklySummary",
    behavior_tracking: "customerBehaviorTracking",
    export_excel: "exportToExcel",
    smart_reply: "smartReplySuggestions",
    autoprioritization: "automaticPrioritization",
    churn_prediction: "churnPrediction",
    desktop_notifications: "desktopNotifications",
    sound_alerts: "soundAlerts",
    sla_alerts: "slaAlerts",
    team_mentions: "teamMentions",
    mfa: "twoFactorAuth",
    activity_logging: "activityLogging",
    compact_conversation: "compactConversationView",
    color_priorities: "colorCodedPriorities",
    advanced_filters: "advancedFilters",
  });

  const SETTINGS_TOGGLE_KEYS = Object.freeze([
    ...SETTINGS_SIDEBAR_SECTIONS.map((item) => item.toggleKey),
    ...Object.keys(SETTINGS_TOGGLE_KEY_MAP),
  ]);

  const SETTINGS_THEME_ALIASES = Object.freeze({
    mist: "mist",
    light: "mist",
    ink: "ink",
    dark: "ink",
    auto: "auto",
  });

  const SETTINGS_DENSITY_ALIASES = Object.freeze({
    compact: "compact",
    comfortable: "balanced",
    balanced: "balanced",
    spacious: "airy",
    airy: "airy",
  });

  function createDefaultSettingsViewState() {
    return {
      theme: "mist",
      density: "compact",
      profileName: "Ditt namn",
      profileEmail: "din.email@hairtp.com",
      deleteRequestedAt: "",
      mailFoundationDefaults: {
        senderMailboxId: "",
        composeSenderMailboxId: "",
        replySenderMailboxId: "",
        signatureProfileId: "",
      },
      toggles: Object.fromEntries(SETTINGS_TOGGLE_KEYS.map((key) => [key, false])),
    };
  }

  function normalizeMailFoundationDefaults(defaults = {}) {
    return {
      senderMailboxId: normalizeMailboxId(defaults?.senderMailboxId || defaults?.defaultSenderMailboxId),
      composeSenderMailboxId: normalizeMailboxId(defaults?.composeSenderMailboxId),
      replySenderMailboxId: normalizeMailboxId(defaults?.replySenderMailboxId),
      signatureProfileId: normalizeKey(
        defaults?.signatureProfileId || defaults?.defaultSignatureProfileId
      ),
    };
  }

  function serializeCustomMailboxesForSettings(customMailboxes = state.customMailboxes) {
    return asArray(customMailboxes)
      .map((mailbox, index) => normalizeCustomMailboxDefinition(mailbox, index))
      .filter(Boolean)
      .map((mailbox) => ({
        id: mailbox.id,
        email: mailbox.email,
        label: mailbox.label,
        owner: mailbox.owner,
        toneClass: mailbox.toneClass,
        signature: {
          label: mailbox.signature?.label || "",
          fullName: mailbox.signature?.fullName || "",
          title: mailbox.signature?.title || "",
          html: mailbox.signature?.html || "",
        },
      }));
  }

  function createMacroCardFromRecord(record, fallbackIndex = 0) {
    const trigger = normalizeKey(record?.trigger) === "auto" ? "auto" : "manual";
    const actions = asArray(record?.actions);
    const primaryActionType = normalizeKey(actions[0]?.type);
    const toneByAction = {
      template: "violet",
      tag: "rose",
      assign: "blue",
      snooze: "gold",
      sla: "red",
      archive: "green",
    };
    const tone = toneByAction[primaryActionType] || (trigger === "auto" ? "blue" : "violet");
    const actionLabelByTrigger = trigger === "auto" ? "Auto-körning" : "Manuell körning";
    return {
      id: asText(record?.id) || `macro-${fallbackIndex + 1}`,
      key: asText(record?.id) || `macro-${fallbackIndex + 1}`,
      title: asText(record?.name, `Makro ${fallbackIndex + 1}`),
      mode: trigger,
      tone,
      actionCount: Math.max(1, actions.length || 0),
      copy:
        compactRuntimeCopy(
          record?.description,
          trigger === "auto"
            ? "Körs automatiskt när villkoren träffar rätt operativt läge."
            : "Körs manuellt från nya CCO:s arbetsyta när teamet behöver standardisera nästa steg.",
          140
        ) || "Makrot är redo att köras i shellen.",
      actionLabel: actionLabelByTrigger,
      shortcut: asText(record?.shortcut),
      runCount: asNumber(record?.runCount, 0),
      lastRunAt: asText(record?.lastRunAt),
      autoCondition: asText(record?.autoCondition),
    };
  }

  function getFallbackMacroCards() {
    return MACRO_LIBRARY.map((macro, index) => ({
      id: asText(macro?.key, `macro-${index + 1}`),
      key: asText(macro?.key, `macro-${index + 1}`),
      title: asText(macro?.title, `Makro ${index + 1}`),
      mode: normalizeKey(macro?.mode) === "auto" ? "auto" : "manual",
      tone: asText(macro?.tone, "violet"),
      actionCount: Math.max(1, asNumber(macro?.actionCount, 1)),
      copy: compactRuntimeCopy(macro?.copy, "Makrot är redo att köras i shellen.", 140),
      actionLabel:
        normalizeKey(macro?.mode) === "auto" ? "Auto-körning" : "Manuell körning",
      shortcut: "",
      runCount: 0,
      lastRunAt: "",
      autoCondition: "",
    }));
  }

  function mapSettingsPayloadToView(settings = {}) {
    const defaults = createDefaultSettingsViewState();
    const sidebarSections = asArray(settings?.sidebarSections);
    const enabledSidebarIds = new Set(
      sidebarSections.filter((item) => item?.enabled !== false).map((item) => normalizeKey(item?.id))
    );
    const toggles = { ...defaults.toggles };

    SETTINGS_SIDEBAR_SECTIONS.forEach((section) => {
      toggles[section.toggleKey] = enabledSidebarIds.has(section.id);
    });

    const payloadToggles =
      settings?.toggles && typeof settings.toggles === "object" ? settings.toggles : {};
    Object.entries(SETTINGS_TOGGLE_KEY_MAP).forEach(([uiKey, apiKey]) => {
      toggles[uiKey] = Boolean(payloadToggles[apiKey]);
    });

    return {
      theme: SETTINGS_THEME_ALIASES[normalizeKey(settings?.theme)] || defaults.theme,
      density:
        SETTINGS_DENSITY_ALIASES[normalizeKey(settings?.density)] || defaults.density,
      profileName: asText(settings?.profileName, defaults.profileName),
      profileEmail: asText(settings?.profileEmail, defaults.profileEmail),
      deleteRequestedAt: asText(settings?.deleteRequestedAt),
      mailFoundationDefaults: normalizeMailFoundationDefaults(settings?.mailFoundation?.defaults),
      mailFoundationCustomMailboxes: asArray(settings?.mailFoundation?.customMailboxes),
      toggles,
    };
  }

  function buildSettingsPayloadFromState({
    customMailboxes = null,
    mailFoundationDefaults = null,
  } = {}) {
    const toggles = {};
    Object.entries(SETTINGS_TOGGLE_KEY_MAP).forEach(([uiKey, apiKey]) => {
      toggles[apiKey] = Boolean(state.settingsRuntime.toggles[uiKey]);
    });
    const normalizedMailFoundationDefaults = normalizeMailFoundationDefaults(
      mailFoundationDefaults || state.settingsRuntime.mailFoundationDefaults || {}
    );
    const senderMailboxId = normalizeMailboxId(
      normalizedMailFoundationDefaults.senderMailboxId ||
        normalizedMailFoundationDefaults.composeSenderMailboxId ||
        state.runtime.defaultSenderMailbox
    );
    const composeSenderMailboxId = normalizeMailboxId(
      normalizedMailFoundationDefaults.composeSenderMailboxId || senderMailboxId
    );
    const replySenderMailboxId = normalizeMailboxId(
      normalizedMailFoundationDefaults.replySenderMailboxId || senderMailboxId
    );
    const signatureProfileId = normalizeKey(
      normalizedMailFoundationDefaults.signatureProfileId ||
        state.runtime.defaultSignatureProfile ||
        CCO_DEFAULT_SIGNATURE_PROFILE
    );
    return {
      theme: state.settingsRuntime.choices.theme,
      density: state.settingsRuntime.choices.density,
      profileName: state.settingsRuntime.profileName,
      profileEmail: state.settingsRuntime.profileEmail,
      deleteRequestedAt: state.settingsRuntime.deleteRequestedAt || null,
      sidebarSections: SETTINGS_SIDEBAR_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        enabled: Boolean(state.settingsRuntime.toggles[section.toggleKey]),
        order: section.order,
      })),
      toggles,
      mailFoundation: {
        defaults: {
          senderMailboxId,
          composeSenderMailboxId,
          replySenderMailboxId,
          signatureProfileId,
        },
        customMailboxes: serializeCustomMailboxesForSettings(
          customMailboxes || state.customMailboxes
        ),
      },
    };
  }

  function applySettingsViewState(nextState = {}) {
    const mapped = mapSettingsPayloadToView(nextState);
    state.settingsRuntime.choices.theme = mapped.theme;
    state.settingsRuntime.choices.density = mapped.density;
    state.settingsRuntime.profileName = mapped.profileName;
    state.settingsRuntime.profileEmail = mapped.profileEmail;
    state.settingsRuntime.deleteRequestedAt = mapped.deleteRequestedAt;
    state.settingsRuntime.mailFoundationDefaults = {
      ...state.settingsRuntime.mailFoundationDefaults,
      ...mapped.mailFoundationDefaults,
    };
    state.settingsRuntime.toggles = {
      ...state.settingsRuntime.toggles,
      ...mapped.toggles,
    };
    if (
      nextState?.mailFoundation &&
      Object.prototype.hasOwnProperty.call(nextState.mailFoundation, "customMailboxes")
    ) {
      state.customMailboxes = mergeDefaultCustomMailboxDefinitions([
        ...mapped.mailFoundationCustomMailboxes,
        ...asArray(state.customMailboxes),
      ]);
      persistCustomMailboxes();
    }
  }

  function isConciseRuntimeValue(value, { maxChars = 32, maxWords = 4 } = {}) {
    const text = normalizeText(value);
    if (!text) return false;
    if (text.length > maxChars) return false;
    if (/[.!?]/.test(text)) return false;
    return text.split(/\s+/).filter(Boolean).length <= maxWords;
  }

  function compactRuntimeCopy(value, fallback = "", maxChars = 120) {
    const normalized = normalizeText(value).replace(/\s+/g, " ");
    const source = normalized || fallback;
    if (!source) return "";
    const firstSentence = source.split(/(?<=[.!?])\s+/)[0] || source;
    const trimmed = firstSentence.replace(/[.!?]+$/g, "").trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
  }

  function normalizeRuntimeDisplaySubject(value, fallback = "") {
    const raw = normalizeText(value).replace(/\s+/g, " ");
    if (!raw) return fallback;

    const normalizedRaw = normalizeKey(raw.replace(/[()]/g, ""));
    if (normalizedRaw === "utan ämne" || normalizedRaw === "utan amne") {
      return fallback;
    }

    let cleaned = raw;
    const technicalPrefixPattern =
      /(cco|qa|live|telefon|phone|test|verification|verify|sandbox|preview|t\d{2}:\d{2}:\d{2}(?:\.\d+)?z)/i;

    while (cleaned.startsWith("[")) {
      const prefixEnd = cleaned.lastIndexOf("]");
      if (prefixEnd <= 0 || prefixEnd > 120) break;
      const prefix = cleaned.slice(0, prefixEnd + 1);
      if (!technicalPrefixPattern.test(prefix)) break;
      cleaned = cleaned.slice(prefixEnd + 1).trim();
    }

    cleaned = cleaned
      .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/gi, "")
      .replace(/\bT\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\-:|]+/g, "")
      .trim();

    if (!cleaned) return fallback || raw;
    return compactRuntimeCopy(cleaned, fallback || raw, 78);
  }

  function isRuntimePlaceholderLine(value) {
    const normalized = normalizeText(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[()]/g, "")
      .replace(/\.+$/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!normalized) return true;
    if (
      normalized.includes("du_far_inte_ofta_e_post") ||
      normalized.includes("power_up_your_productivity_with_microsoft_365") ||
      normalized.includes("get_more_done_with_apps_like_word") ||
      normalized.includes("mailbox_truth_i_wave") ||
      normalized.includes("raden_kommer_fran_mailbox_truth_i_wave") ||
      normalized.includes("unread_inbound_and_needs_reply_lases_fran_mailbox_truth_i_wave")
    ) {
      return true;
    }
    return [
      "aktiv_trad",
      "active_thread",
      "ingen_forhandsvisning_tillganglig",
      "ingen_preview_tillganglig",
      "ingen_senaste_kundsignal_annu",
      "okand_avsandare",
      "okand_kund",
      "unknown_customer",
      "unknown_sender",
      "utan_amne",
    ].includes(normalized);
  }

  function classifyRuntimeRowFamily(row = {}) {
    const haystack = [
      row?.displaySubject,
      row?.subject,
      row?.title,
      row?.customerName,
      row?.senderName,
      row?.senderDisplayName,
      row?.sender,
      row?.latestInboundPreview,
      row?.preview,
      row?.systemPreview,
      row?.latestPreview,
      row?.bodyPreview,
      row?.detail,
      row?.summary,
      row?.customerSummary?.lastCaseSummary,
      row?.intent,
      row?.intentLabel,
    ]
      .map((value) =>
        normalizeText(value)
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
      )
      .filter(Boolean)
      .join(" ");

    if (
      /\b(?:slack|mentioned you in|qa reply|cco-next live send inspect|verification|verify|sandbox|fixture|teams?)\b/i.test(
        haystack
      )
    ) {
      return "notification/system_notice";
    }

    if (
      /\b(?:ny bokning|booking request|bokadirekt|cliento|getaccept|behandlingsavtal|dokumentet|dokument|signeringsmail|verifieringsmail)\b/i.test(
        haystack
      ) ||
      normalizeKey(row?.intent || row?.intentLabel) === "booking_request"
    ) {
      return "booking_system_mail";
    }

    return "human_mail";
  }

  function isRuntimeUnknownCustomerName(value) {
    const normalized = normalizeText(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return [
      "okand_avsandare",
      "okand_kund",
      "unknown",
      "unknown_customer",
      "unknown_sender",
    ].includes(normalized);
  }

  function deriveRuntimeCustomerNameFromSubject(value) {
    const subject = normalizeRuntimeDisplaySubject(value, "");
    if (!subject || isRuntimePlaceholderLine(subject)) return "";
    const contactFormMatch = subject.match(/^(.+?)\s+kontaktformul[aä]r\b/i);
    const candidate = asText(contactFormMatch?.[1]).trim();
    if (candidate) {
      if (looksLikeMailboxIdentity(candidate) || isRuntimeUnknownCustomerName(candidate)) return "";
      if (/\b(?:qa|cco|live|test|inspect|reply|send|telefon|phone|mailbox)\b/i.test(candidate)) {
        return "";
      }
      return compactRuntimeCopy(candidate, "", 42);
    }
    if (/\b(?:qa|cco|live|test|inspect|reply|send|telefon|phone|mailbox|verify|verification)\b/i.test(subject)) {
      return compactRuntimeCopy(subject, "", 54);
    }
    return "";
  }

  function buildRuntimeDisplaySubject(row, customerName) {
    const mailboxLabel = titleCaseMailbox(
      asText(row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName)
    );
    const normalizedSubject = normalizeRuntimeDisplaySubject(row?.subject, "");
    if (
      normalizedSubject &&
      !isRuntimePlaceholderLine(normalizedSubject) &&
      normalizeKey(normalizedSubject) === normalizeKey(customerName)
    ) {
      return normalizedSubject;
    }
    if (
      normalizedSubject &&
      !isRuntimePlaceholderLine(normalizedSubject) &&
      normalizeKey(normalizedSubject) !== normalizeKey(customerName)
    ) {
      return normalizedSubject;
    }
    if (
      normalizeText(customerName) &&
      !looksLikeMailboxIdentity(customerName) &&
      !isRuntimeUnknownCustomerName(customerName)
    ) {
      return `Konversation med ${customerName}`;
    }
    if (mailboxLabel) return `Nytt inkommande mejl i ${mailboxLabel}`;
    return "Nytt inkommande mejl";
  }

  function mapRuntimeDisplayOwnerLabel(value) {
    const owner = asText(value);
    if (!owner) return "Ej tilldelad";
    const normalizedOwner = normalizeKey(owner);
    if (normalizedOwner === "oägd" || normalizedOwner === "unassigned") {
      return "Ej tilldelad";
    }
    return owner;
  }

  function mapRuntimeDisplayEngagementLabel(score) {
    if (score >= 0.76) return "Hög aktivitet";
    if (score >= 0.5) return "Stabil aktivitet";
    if (score >= 0.3) return "Låg aktivitet";
    return "Ny kontakt";
  }

  function countWords(value) {
    return normalizeText(value).split(/\s+/).filter(Boolean).length;
  }

  function resolveStudioSignatureProfile(signatureId = "") {
    const normalizedId = normalizeKey(signatureId);
    const matchesProfile = (profile, targetId) => {
      if (!profile || typeof profile !== "object") return false;
      const normalizedTargetId = normalizeKey(targetId);
      if (!normalizedTargetId) return false;
      if (normalizeKey(profile.id) === normalizedTargetId) return true;
      if (normalizeMailboxId(profile.email) === normalizeMailboxId(targetId)) return true;
      const mailboxLocalPart = normalizeMailboxId(asText(profile.email).split("@")[0]);
      if (mailboxLocalPart && mailboxLocalPart === normalizeMailboxId(targetId)) return true;
      const aliases = Array.isArray(profile.aliases) ? profile.aliases : [];
      return aliases.some((alias) => normalizeKey(alias) === normalizedTargetId);
    };
    return getStudioAvailableSignatureProfiles().find((profile) => matchesProfile(profile, normalizedId)) || null;
  }

  function getStudioSignatureProfile(signatureId = "") {
    const normalizedId = normalizeKey(signatureId);
    const normalizedDefaultId = normalizeKey(
      state.runtime.defaultSignatureProfile || CCO_DEFAULT_SIGNATURE_PROFILE
    );
    return (
      resolveStudioSignatureProfile(normalizedId) ||
      resolveStudioSignatureProfile(normalizedDefaultId) ||
      getStudioAvailableSignatureProfiles().find((profile) =>
        ["fazli", "egzona"].includes(normalizeKey(profile?.id || profile?.key))
      ) ||
      getStudioAvailableSignatureProfiles()[0]
    );
  }

  function getStudioOperatorSignatureProfile() {
    const operatorMailboxId = normalizeMailboxId(state.settingsRuntime?.profileEmail || "");
    if (!operatorMailboxId) return null;
    return resolveStudioSignatureProfile(operatorMailboxId);
  }

  function getStudioReplyDefaultSignatureProfile(thread = null) {
    const sourceMailboxId = getStudioSourceMailboxId(thread);
    const runtimeCapabilityProfileId = normalizeKey(
      getRuntimeMailboxCapability(sourceMailboxId)?.signatureProfileId || ""
    );
    const operatorSignatureProfile = getStudioOperatorSignatureProfile();
    const mailboxSignatureProfile =
      resolveStudioSignatureProfile(runtimeCapabilityProfileId) ||
      resolveStudioSignatureProfile(sourceMailboxId) ||
      getStudioSignatureProfile(state.runtime.defaultSignatureProfile || CCO_DEFAULT_SIGNATURE_PROFILE);
    if (operatorSignatureProfile) return operatorSignatureProfile;
    return mailboxSignatureProfile;
  }

  function getStudioSignatureProfiles() {
    return getStudioAvailableSignatureProfiles().map((profile) => ({
      id: profile.id,
      label: profile.label,
      email: profile.email,
      fullName: profile.fullName,
      title: profile.title,
      html: asText(profile.html),
      senderMailboxId: profile.senderMailboxId,
      source: profile.source || "static",
    }));
  }

  function getStudioDefaultSenderMailboxId(thread = null, { composeMode = false } = {}) {
    if (!composeMode) {
      const sourceMailboxId = normalizeMailboxId(getStudioSourceMailboxId(thread));
      if (sourceMailboxId) return sourceMailboxId;
    }
    const runtimeDefaultSender = normalizeMailboxId(state.runtime.defaultSenderMailbox);
    if (runtimeDefaultSender) return runtimeDefaultSender;
    const sourceMailboxId = normalizeMailboxId(getStudioSourceMailboxId(thread));
    if (sourceMailboxId) return sourceMailboxId;
    return normalizeMailboxId(CCO_DEFAULT_REPLY_SENDER);
  }

  function getStudioSenderMailboxId(signatureId = "", thread = null) {
    const signatureProfile = getStudioSignatureProfile(signatureId);
    return normalizeMailboxId(
      getStudioDefaultSenderMailboxId(thread, { composeMode: !thread }) ||
        signatureProfile?.senderMailboxId ||
        signatureProfile?.email ||
        CCO_DEFAULT_REPLY_SENDER
    );
  }

  function getStudioSenderMailboxOptions() {
    const seen = new Set();
    const options = [];
    getAvailableRuntimeMailboxes().forEach((mailbox, index) => {
      const canonicalId = canonicalizeRuntimeMailboxId(mailbox?.email || mailbox?.id || mailbox?.label);
      if (!canonicalId || seen.has(canonicalId)) return;
      const capability = getRuntimeMailboxCapability(canonicalId);
      const senderAvailable = capability
        ? capability.senderAvailable === true || capability.sendAvailable === true
        : false;
      if (!senderAvailable) return;
      seen.add(canonicalId);
      options.push({
        id: canonicalId,
        email: canonicalId,
        label: asText(mailbox?.label, titleCaseMailbox(canonicalId)),
        order: Number.isFinite(Number(mailbox?.order)) ? Number(mailbox.order) : index,
      });
    });
    if (!options.length) {
      const fallbackId = getStudioDefaultSenderMailboxId(null, { composeMode: true });
      return [
        {
          id: fallbackId,
          email: fallbackId,
          label: getStudioSourceMailboxLabel(fallbackId),
          order: 0,
        },
      ];
    }
    return options.sort((left, right) => left.order - right.order);
  }

  function getStudioSignatureOverride(signatureId = "", senderMailboxId = "") {
    const signatureProfile = getStudioSignatureProfile(signatureId);
    if (!signatureProfile || normalizeKey(signatureProfile.source) !== "mailbox_admin") {
      return null;
    }
    return {
      key: signatureProfile.id,
      label: asText(signatureProfile.label, "Signatur"),
      fullName: asText(signatureProfile.fullName, signatureProfile.label || "Mailbox"),
      title: asText(signatureProfile.title),
      html: asText(signatureProfile.html),
      email: normalizeMailboxId(signatureProfile.email || signatureProfile.senderMailboxId),
      senderMailboxId: normalizeMailboxId(
        senderMailboxId || signatureProfile.senderMailboxId || signatureProfile.email
      ),
    };
  }

  function getStudioSourceMailboxId(thread = null) {
    const threadMailboxId = normalizeMailboxId(thread?.mailboxAddress);
    if (threadMailboxId) return threadMailboxId;
    const selectedMailboxIds = getSelectedRuntimeMailboxScopeIds();
    if (selectedMailboxIds.length) return selectedMailboxIds[0];
    return getPreferredOperationalMailboxId();
  }

  function getStudioSourceMailboxLabel(mailboxId = "") {
    const normalizedMailboxId = normalizeMailboxId(mailboxId);
    const runtimeMailbox = findRuntimeMailboxByScopeId(normalizedMailboxId);
    if (runtimeMailbox) {
      return asText(runtimeMailbox.label, runtimeMailbox.email || runtimeMailbox.id);
    }
    return titleCaseMailbox(normalizedMailboxId || CCO_OPERATIONAL_START_MAILBOX);
  }

  function getStudioFirstName(thread) {
    const firstName = asText(thread?.customerName).split(/\s+/).filter(Boolean)[0];
    return firstName || "kunden";
  }

  function toTitleCaseWord(value) {
    const text = asText(value);
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function getStudioComposeGreetingName(recipientValue = "") {
    const recipient = normalizeText(recipientValue);
    if (!recipient) return "";
    if (recipient.includes("@")) {
      const localPart = recipient.split("@")[0];
      const alias = localPart.split(/[._-]+/).filter(Boolean)[0];
      return toTitleCaseWord(alias);
    }
    return toTitleCaseWord(recipient.split(/\s+/).filter(Boolean)[0]);
  }

  function getStudioComposeGreeting(recipientValue = "") {
    const recipientName = getStudioComposeGreetingName(recipientValue);
    return recipientName ? `Hej ${recipientName},` : "Hej,";
  }

  function getStudioDraftModes(thread) {
    const draftModes =
      thread?.raw?.draftModes && typeof thread.raw.draftModes === "object"
        ? thread.raw.draftModes
        : {};
    return {
      professional: asText(draftModes.professional),
      warm: asText(draftModes.warm),
      short: asText(draftModes.short),
      recommendedMode:
        normalizeKey(thread?.raw?.recommendedMode || "professional") || "professional",
    };
  }

  function inferStudioTrackKey(thread) {
    if (thread?.tags?.includes("medical")) return "medical";
    if (normalizeKey(thread?.raw?.intent).includes("pris")) return "pricing";
    if (thread?.tags?.includes("admin")) return "admin";
    if (thread?.tags?.includes("bookable")) return "booking";
    if (
      thread?.tags?.includes("followup") ||
      normalizeKey(thread?.nextActionLabel).includes("följ")
    ) {
      return "follow_up";
    }
    return "booking";
  }

  function buildStudioTemplateDraft(thread, templateKey) {
    const firstName = getStudioFirstName(thread);
    const dueLabel = asText(thread?.followUpLabel || thread?.nextActionLabel || "idag");
    if (templateKey === "suggest_times") {
      return `Hej ${firstName},\n\nTack för ditt meddelande. Här kommer tre tider som ligger närmast det du efterfrågar:\n\n• Fredag 09:00\n• Måndag 10:30\n• Onsdag 14:00\n\nSvara gärna med den tid som passar bäst så bekräftar jag direkt.`;
    }
    if (templateKey === "send_pricing") {
      return `Hej ${firstName},\n\nHär kommer prisöversikten för behandlingen:\n\n• Konsultation: kostnadsfri\n• PRP: 4 500 kr\n• PRP-paket 3 behandlingar: 12 000 kr\n\nSäg till om du vill att jag skickar ett konkret bokningsförslag direkt i samma tråd.`;
    }
    if (templateKey === "ask_more_info") {
      return `Hej ${firstName},\n\nTack för ditt meddelande. För att hjälpa dig vidare behöver jag två saker:\n\n• vilken behandling det gäller\n• vilka dagar eller tider som passar bäst\n\nNär du svarar på det kan jag ge ett konkret nästa steg direkt.`;
    }
    return `Hej ${firstName},\n\nTack för ditt meddelande. Jag bekräftar gärna nästa steg för ${dueLabel}.\n\nJag återkommer med en tydlig bekräftelse och det du behöver inför besöket.\n\nHör gärna av dig om något behöver justeras.`;
  }

  function buildStudioTrackDraft(thread, trackKey) {
    const firstName = getStudioFirstName(thread);
    const dueLabel = asText(thread?.followUpLabel || "så snart som möjligt");
    const draftModes = getStudioDraftModes(thread);
    const recommendedDraft =
      asText(thread?.raw?.previewDraftBody) ||
      asText(thread?.raw?.draftModes?.[draftModes.recommendedMode]) ||
      asText(thread?.raw?.suggestedReply) ||
      asText(thread?.raw?.proposedReply) ||
      draftModes.professional ||
      draftModes.warm ||
      draftModes.short;

    if (trackKey === "booking" && recommendedDraft) return recommendedDraft;
    if (trackKey === "follow_up") {
      return `Hej ${firstName},\n\nJag följer upp ditt ärende så att vi håller tempot i konversationen.\n\nDet snabbaste sättet framåt är att du svarar direkt med vilken tid som passar bäst, så säkrar jag nästa steg utan dröjsmål.`;
    }
    if (trackKey === "holding") {
      return `Hej ${firstName},\n\nTack för att du väntar. Jag har ditt ärende aktivt uppe och återkommer med ett konkret nästa steg ${dueLabel}.\n\nJag vill hellre ge dig ett tydligt besked än ett oklart mellanbesked.`;
    }
    if (trackKey === "medical") {
      return `Hej ${firstName},\n\nTack för din fråga. Jag vill stämma av detta med kliniken så att du får ett korrekt och tryggt svar.\n\nJag återkommer så snart jag har ett bekräftat besked från ansvarig behandlare.`;
    }
    if (trackKey === "pricing") {
      return `Hej ${firstName},\n\nJag hjälper dig gärna vidare med pris och trygghet inför nästa steg.\n\nOm du vill kan jag skicka ett tydligt prisupplägg direkt här i tråden tillsammans med ett konkret bokningsförslag.`;
    }
    if (trackKey === "admin") {
      return `Hej ${firstName},\n\nTack för ditt meddelande. Jag hjälper dig vidare med den administrativa delen och bekräftar nästa steg i samma tråd.\n\nOm något behöver kompletteras återkommer jag direkt med exakt vad som saknas.`;
    }
    return recommendedDraft || buildStudioTemplateDraft(thread, "confirm_booking");
  }

  function buildStudioDecisionSupportDraft(thread, currentDraft) {
    const clearStep = asText(thread?.nextActionLabel || "Svara gärna direkt");
    const body =
      normalizeText(currentDraft) || buildStudioTrackDraft(thread, inferStudioTrackKey(thread));
    if (normalizeKey(body).includes(normalizeKey(clearStep))) {
      return body;
    }
    return `${body}\n\nNästa steg: ${clearStep}.`;
  }

  function buildStudioToneDraft(thread, currentDraft, toneKey) {
    const firstName = getStudioFirstName(thread);
    const draftModes = getStudioDraftModes(thread);
    const normalizedTone = normalizeKey(toneKey || "professional");
    const baseDraft =
      normalizeText(currentDraft) || buildStudioTrackDraft(thread, inferStudioTrackKey(thread));
    if (normalizedTone === "warm" && draftModes.warm) {
      return draftModes.warm;
    }
    if (normalizedTone === "professional" && draftModes.professional) {
      return draftModes.professional;
    }
    if (normalizedTone === "solution_focus") {
      return `${baseDraft}\n\nSvara gärna direkt med det alternativ som passar bäst så tar jag nästa steg utan dröjsmål.`;
    }
    if (normalizedTone === "decision_support") {
      return buildStudioDecisionSupportDraft(thread, baseDraft);
    }
    if (normalizedTone === "warm") {
      return `Hej ${firstName},\n\nTack för ditt meddelande.\n\n${baseDraft
        .replace(/^hej\s+[^\n,]+,?\s*/i, "")
        .trim()}`;
    }
    return baseDraft;
  }

  function buildStudioRefinedDraft(thread, currentDraft, refineKey) {
    const draftModes = getStudioDraftModes(thread);
    const normalizedRefine = normalizeKey(refineKey || "");
    const baseDraft =
      normalizeText(currentDraft) || buildStudioTrackDraft(thread, inferStudioTrackKey(thread));
    if (normalizedRefine === "shorter" && draftModes.short) {
      return draftModes.short;
    }
    if (normalizedRefine === "sharper") {
      return `${baseDraft}\n\nBekräfta gärna i samma svar så låser jag nästa steg direkt.`;
    }
    if (normalizedRefine === "shorter") {
      return baseDraft
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("\n\n");
    }
    return baseDraft;
  }

  function buildComposeTemplateDraft(templateKey, recipientValue = "") {
    const greeting = getStudioComposeGreeting(recipientValue);
    const normalizedTemplate = normalizeKey(templateKey);
    if (normalizedTemplate === "suggest_times") {
      return `${greeting}\n\nTack för att du hörde av dig till Hair TP Clinic.\n\nHär kommer tre tider som vi kan erbjuda just nu:\n\n• Fredag 09:00\n• Måndag 10:30\n• Onsdag 14:00\n\nSvara gärna med den tid som passar bäst så bekräftar jag direkt.`;
    }
    if (normalizedTemplate === "send_pricing") {
      return `${greeting}\n\nTack för ditt intresse.\n\nHär kommer en tydlig prisöversikt för nästa steg.\n\nOm du vill kan jag också skicka ett konkret bokningsförslag direkt i samma mejltråd.`;
    }
    if (normalizedTemplate === "ask_more_info") {
      return `${greeting}\n\nTack för ditt meddelande.\n\nFör att hjälpa dig vidare behöver jag gärna lite mer information om vad det gäller och vilka tider som passar bäst.\n\nNär jag har det kan jag ge dig ett tydligt nästa steg direkt.`;
    }
    return `${greeting}\n\nTack för att du hörde av dig.\n\nJag hjälper dig gärna vidare och återkommer med ett tydligt nästa steg så snart jag har rätt underlag på plats.`;
  }

  function buildComposeTrackDraft(trackKey, recipientValue = "") {
    const greeting = getStudioComposeGreeting(recipientValue);
    const normalizedTrack = normalizeKey(trackKey || "booking");
    if (normalizedTrack === "follow_up") {
      return `${greeting}\n\nJag följer upp för att hålla tempot i dialogen och hjälpa dig vidare utan dröjsmål.\n\nSvara gärna direkt med det som passar bäst för dig så tar jag nästa steg direkt.`;
    }
    if (normalizedTrack === "holding") {
      return `${greeting}\n\nTack för ditt tålamod.\n\nJag har ditt ärende aktivt uppe och återkommer med ett tydligt besked så snart allt är bekräftat.`;
    }
    if (normalizedTrack === "medical") {
      return `${greeting}\n\nTack för din fråga.\n\nJag vill säkerställa att du får ett korrekt och tryggt svar, så jag stämmer av detta med kliniken och återkommer med ett tydligt besked.`;
    }
    if (normalizedTrack === "pricing") {
      return `${greeting}\n\nTack för ditt intresse.\n\nJag hjälper dig gärna vidare med prisbild och nästa steg, och kan också skicka ett konkret bokningsförslag om du vill.`;
    }
    if (normalizedTrack === "admin") {
      return `${greeting}\n\nTack för ditt meddelande.\n\nJag hjälper dig vidare med den administrativa delen och återkommer direkt om något behöver kompletteras.`;
    }
    return `${greeting}\n\nTack för att du hörde av dig till Hair TP Clinic.\n\nJag hjälper dig gärna vidare med bokning och nästa steg.`;
  }

  function buildComposeDecisionSupportDraft(currentDraft, recipientValue = "") {
    const greeting = getStudioComposeGreeting(recipientValue);
    const body = normalizeText(currentDraft) || buildComposeTrackDraft("booking", recipientValue);
    const clearStep = "Svara gärna med det alternativ som passar bäst";
    if (normalizeKey(body).includes(normalizeKey(clearStep))) {
      return body;
    }
    if (!normalizeText(body)) {
      return `${greeting}\n\n${clearStep} så tar jag nästa steg direkt.`;
    }
    return `${body}\n\n${clearStep} så tar jag nästa steg direkt.`;
  }

  function buildComposeToneDraft(currentDraft, toneKey, recipientValue = "") {
    const greeting = getStudioComposeGreeting(recipientValue);
    const normalizedTone = normalizeKey(toneKey || "professional");
    const baseDraft = normalizeText(currentDraft) || buildComposeTrackDraft("booking", recipientValue);
    if (normalizedTone === "solution_focus") {
      return `${baseDraft}\n\nSvara gärna med det alternativ som passar bäst så hjälper jag dig vidare utan dröjsmål.`;
    }
    if (normalizedTone === "decision_support") {
      return buildComposeDecisionSupportDraft(baseDraft, recipientValue);
    }
    if (normalizedTone === "warm") {
      const bodyWithoutGreeting = baseDraft.replace(/^hej[^\n]*,\s*/i, "").trim();
      return `${greeting}\n\nTack för att du hörde av dig.\n\n${bodyWithoutGreeting}`;
    }
    if (normalizedTone === "professional" && !normalizeText(currentDraft)) {
      return buildComposeTrackDraft("booking", recipientValue);
    }
    return baseDraft;
  }

  function buildComposeRefinedDraft(currentDraft, refineKey, recipientValue = "") {
    const normalizedRefine = normalizeKey(refineKey || "");
    const baseDraft = normalizeText(currentDraft) || buildComposeTrackDraft("booking", recipientValue);
    if (normalizedRefine === "sharper") {
      return `${baseDraft}\n\nBekräfta gärna i samma svar så tar jag nästa steg direkt.`;
    }
    if (normalizedRefine === "shorter") {
      return baseDraft
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join("\n\n");
    }
    return baseDraft;
  }

  function getStudioTemplateLabel(templateKey = "") {
    const normalizedTemplate = normalizeKey(templateKey);
    if (normalizedTemplate === "confirm_booking") return "Bekräfta bokning";
    if (normalizedTemplate === "suggest_times") return "Föreslå tider";
    if (normalizedTemplate === "send_pricing") return "Skicka prislista";
    if (normalizedTemplate === "ask_more_info") return "Be om info";
    return "";
  }

  function getStudioTrackLabel(trackKey = "") {
    const normalizedTrack = normalizeKey(trackKey);
    if (normalizedTrack === "booking") return "Bokning";
    if (normalizedTrack === "follow_up") return "Uppföljning";
    if (normalizedTrack === "holding") return "Mellanbesked";
    if (normalizedTrack === "medical") return "Medicinsk";
    if (normalizedTrack === "pricing") return "Pris/trygghet";
    if (normalizedTrack === "admin") return "Admin";
    return "";
  }

  function getStudioToneLabel(toneKey = "") {
    const normalizedTone = normalizeKey(toneKey);
    if (normalizedTone === "professional") return "Professionell";
    if (normalizedTone === "warm") return "Varm";
    if (normalizedTone === "solution_focus") return "Lösningsfokus";
    if (normalizedTone === "decision_support") return "Beslutsstöd";
    return "";
  }

  function getStudioRefineLabel(refineKey = "") {
    const normalizedRefine = normalizeKey(refineKey);
    if (normalizedRefine === "shorter") return "Kortare";
    if (normalizedRefine === "sharper") return "Skarpare";
    return "";
  }

  function buildStudioSelectionSummary(thread, studioState, isComposeMode = false) {
    if (!studioState) return "";
    const summaryParts = [];
    const studioTruthState =
      !isComposeMode && thread ? getRuntimeStudioTruthState(thread) : null;
    if (studioTruthState?.truthDriven) {
      summaryParts.push(
        `${studioTruthState.label || "Truth-driven studio"} · ${
          studioTruthState.waveLabel || "Wave 1"
        }`
      );
      if (studioTruthState.sourceMailboxLabel) {
        summaryParts.push(`Källa: ${studioTruthState.sourceMailboxLabel}`);
      }
      summaryParts.push("Reply-context: låst");
    } else if (studioTruthState?.inConfiguredScope && studioTruthState?.waveLabel) {
      summaryParts.push(studioTruthState.waveLabel);
    }
    if (!isComposeMode && isOfflineHistoryContextThread(thread)) {
      summaryParts.push("Läge: Offline historik");
    }
    const signatureLabel = getStudioSignatureProfile(studioState.selectedSignatureId).label;
    if (signatureLabel) {
      summaryParts.push(`Signatur: ${signatureLabel}`);
    }
    const trackLabel = getStudioTrackLabel(
      studioState.activeTrackKey || (thread ? inferStudioTrackKey(thread) : "admin")
    );
    if (trackLabel) {
      summaryParts.push(`Spår: ${trackLabel}`);
    }
    const toneLabel = getStudioToneLabel(studioState.activeToneKey || "professional");
    if (toneLabel) {
      summaryParts.push(`Ton: ${toneLabel}`);
    }
    const templateLabel = getStudioTemplateLabel(studioState.activeTemplateKey);
    if (templateLabel) {
      summaryParts.push(`Mall: ${templateLabel}`);
    }
    const refineLabel = getStudioRefineLabel(studioState.activeRefineKey);
    if (refineLabel) {
      summaryParts.push(`Finjustera: ${refineLabel}`);
    }
    if (!summaryParts.length && isComposeMode) {
      return "Studion är redo för nytt mejl.";
    }
    return summaryParts.join(" · ");
  }

  function applyTruthPrimaryStudioState(studioState, thread = null) {
    if (!studioState || !thread || normalizeKey(studioState.mode) === "compose") {
      return studioState;
    }
    const studioTruthState = getRuntimeStudioTruthState(thread);
    studioState.truthDriven = studioTruthState.truthDriven === true;
    studioState.truthLabel = asText(studioTruthState.label);
    studioState.truthWaveLabel = asText(studioTruthState.waveLabel);
    studioState.truthDetail = asText(studioTruthState.detail);
    studioState.truthSourceMailboxId = asText(studioTruthState.sourceMailboxId);
    studioState.truthSourceMailboxLabel = asText(studioTruthState.sourceMailboxLabel);
    studioState.truthSenderLocked = studioTruthState.senderLocked === true;
    studioState.truthFallbackReason = asText(studioTruthState.detail);
    studioState.replyContextThreadId = asText(
      studioTruthState.replyContextThreadId || thread?.id
    );
    if (studioTruthState.truthDriven) {
      studioState.selectedSignatureId = asText(
        studioTruthState.selectedSignatureId,
        studioState.selectedSignatureId
      );
      studioState.composeMailboxId = asText(
        studioTruthState.sourceMailboxId,
        getStudioSenderMailboxId(studioState.selectedSignatureId, thread)
      );
      studioState.mode = "reply";
    }
    return studioState;
  }

  function evaluateStudioPolicy(thread, draftBody) {
    const body = String(draftBody || "");
    const words = countWords(body);
    const bookingKeywords = /\b(bok|tid|appointment|book)\b/i.test(body);
    const hasClock = /\b\d{1,2}[:.]\d{2}\b/.test(body);
    if (!normalizeText(body)) {
      return {
        label: "Utkast saknas",
        summary: "Skriv ett svar innan du skickar.",
        tone: "warning",
      };
    }
    if (bookingKeywords && !hasClock) {
      return {
        label: "Lägg till tid",
        summary: "Bokningssvaret bör nämna en konkret tid eller nästa tydliga steg.",
        tone: "warning",
      };
    }
    if (words > 120) {
      return {
        label: "Korta svaret",
        summary: "Utkastet är långt. Kortare svar brukar ge tydligare beslut i CCO.",
        tone: "warning",
      };
    }
    return {
      label: state.runtime.sendEnabled ? "Policy OK" : "Skicka spärrat",
      summary:
        thread && state.runtime.sendEnabled
          ? `${words} ord · ${thread.nextActionLabel}`
          : "Livedata saknas eller skicka är spärrat just nu.",
      tone: state.runtime.sendEnabled ? "success" : "warning",
    };
  }

  function formatPriorityReason(value) {
    const normalized = normalizeText(value);
    if (!normalized) return "Inget prioritetsskäl registrerat ännu";
    const [reasonCode] = normalized.split(":");
    return humanizeCode(reasonCode || normalized, normalized);
  }

  function mapRuntimeLifecycleLabel(row) {
    const raw = asText(row?.customerSummary?.lifecycleStatus);
    if (isConciseRuntimeValue(raw, { maxChars: 28, maxWords: 3 })) {
      return humanizeCode(raw, "Aktiv dialog");
    }
    if (row?.followUpDueAt || row?.followUpSuggestedAt) return "Återbesök väntar";
    return "Aktiv dialog";
  }

  function mapRuntimeWaitingLabel(row) {
    const waitingState = asText(row?.waitingStateLabel);
    if (isConciseRuntimeValue(waitingState, { maxChars: 30, maxWords: 4 })) {
      return humanizeCode(waitingState, "Behöver åtgärd");
    }
    const waitingOn = normalizeKey(row?.waitingOn);
    if (waitingOn === "customer") return "Väntar på kund";
    if (waitingOn === "owner" || waitingOn === "clinic") return "Behöver åtgärd";
    if (row?.followUpDueAt || row?.followUpSuggestedAt) return "Planerad uppföljning";
    return "Behöver åtgärd";
  }

  function mapRuntimeStatusLabel(row) {
    const explicitCandidates = [row?.bookingReadinessLabel, row?.workflowLabel, row?.needsReplyStatus];
    for (const candidate of explicitCandidates) {
      if (isConciseRuntimeValue(candidate, { maxChars: 32, maxWords: 4 })) {
        return humanizeCode(candidate, "Behöver åtgärd");
      }
    }
    const bookingState = normalizeKey(row?.bookingState);
    const slaStatus = normalizeKey(row?.slaStatus);
    if (bookingState.includes("ready")) return "Kan erbjudas";
    if (slaStatus === "breach" || slaStatus === "warning") return "Svar krävs";
    if (row?.followUpDueAt || row?.followUpSuggestedAt) return "Uppföljning";
    if (row?.isUnanswered === true) return "Öppen";
    return "Behöver åtgärd";
  }

  function mapRuntimeRiskLabel(row) {
    const dominantRisk = asText(row?.dominantRisk);
    if (isConciseRuntimeValue(dominantRisk, { maxChars: 24, maxWords: 3 })) {
      return humanizeCode(dominantRisk, "Bevaka");
    }
    const slaStatus = normalizeKey(row?.slaStatus);
    if (slaStatus === "breach") return "Hög risk";
    if (slaStatus === "warning") return "Bevaka";
    return "Bevaka";
  }

  function mapRuntimeNextActionLabel(row) {
    const explicitCandidates = [row?.nextActionLabel, row?.recommendedActionLabel];
    for (const candidate of explicitCandidates) {
      if (isConciseRuntimeValue(candidate, { maxChars: 28, maxWords: 4 })) {
        return humanizeCode(candidate, "Granska tråden");
      }
    }
    const bookingState = normalizeKey(row?.bookingState);
    const waitingOn = normalizeKey(row?.waitingOn);
    const slaStatus = normalizeKey(row?.slaStatus);
    if (bookingState.includes("ready")) return "Erbjud tid";
    if (slaStatus === "breach" || slaStatus === "warning") return "Svara nu";
    if (waitingOn === "customer") return "Invänta svar";
    if (row?.followUpDueAt || row?.followUpSuggestedAt) return "Följ upp";
    return "Granska tråden";
  }

  function buildFeedIndex(data) {
    const byConversationId = new Map();
    const bySemanticKey = new Map();
    const entries = [...asArray(data?.inboundFeed), ...asArray(data?.outboundFeed)];
    entries.forEach((entry) => {
      const conversationId = asText(entry?.conversationId);
      if (conversationId) {
        const current = byConversationId.get(conversationId) || [];
        current.push(entry);
        byConversationId.set(conversationId, current);
      }

      const semanticKey = buildRuntimeRowSemanticKey({
        mailboxAddress: entry?.mailboxAddress,
        mailboxId: entry?.mailboxId,
        userPrincipalName: entry?.userPrincipalName,
        subject: entry?.normalizedSubject || entry?.subject || entry?.summary || entry?.title,
        customerName:
          entry?.counterpart ||
          entry?.counterpartyName ||
          entry?.senderName ||
          entry?.fromName ||
          entry?.customerName,
      });
      if (semanticKey) {
        const current = bySemanticKey.get(semanticKey) || [];
        current.push(entry);
        bySemanticKey.set(semanticKey, current);
      }
    });
    byConversationId.forEach((items) => {
      items.sort(
        (left, right) => Date.parse(String(right?.sentAt || "")) - Date.parse(String(left?.sentAt || ""))
      );
    });
    bySemanticKey.forEach((items) => {
      items.sort(
        (left, right) => Date.parse(String(right?.sentAt || "")) - Date.parse(String(left?.sentAt || ""))
      );
    });
    return {
      byConversationId,
      bySemanticKey,
    };
  }

  function getFeedEntriesForRuntimeRow(row, feedLookup = null) {
    const byConversationId =
      feedLookup && feedLookup.byConversationId instanceof Map
        ? feedLookup.byConversationId
        : new Map();
    const bySemanticKey =
      feedLookup && feedLookup.bySemanticKey instanceof Map
        ? feedLookup.bySemanticKey
        : new Map();

    const directEntries = byConversationId.get(asText(row?.conversationId)) || [];
    if (directEntries.length) return directEntries;
    if (getUsableRuntimeRowPreview(row)) return [];

    const semanticKey = buildRuntimeRowSemanticKey(row);
    if (!semanticKey) return [];
    return bySemanticKey.get(semanticKey) || [];
  }

  function getClientMailAssetFamily(asset = {}) {
    const canonicalFamily = normalizeKey(asset?.family);
    if (
      canonicalFamily === "attachment" ||
      canonicalFamily === "inline" ||
      canonicalFamily === "external"
    ) {
      return canonicalFamily;
    }
    const disposition = normalizeKey(asset?.disposition);
    const kind = normalizeKey(asset?.kind);
    const contentType = asText(asset?.contentType).trim().toLowerCase();
    const renderState = normalizeKey(asset?.render?.state);
    const renderMode = normalizeKey(asset?.render?.mode);
    if (renderState === "external_https" || renderMode === "external_url") {
      return "external";
    }
    if (disposition === "attachment") return "attachment";
    if (disposition === "inline" && (kind === "image" || contentType.startsWith("image/"))) {
      return "inline";
    }
    if (disposition === "inline") return "inline";
    if (kind === "attachment") return "attachment";
    return "inline";
  }

  function buildClientAttachmentAssetFromMetadata(
    attachment = {},
    { messageId = "", graphMessageId = "", sourceStore = "" } = {},
    index = 0
  ) {
    const attachmentId = asText(
      attachment?.id ?? attachment?.attachmentId ?? ""
    ).trim();
    const contentId = asText(attachment?.contentId).trim();
    const name = asText(attachment?.name).trim();
    const contentType = asText(attachment?.contentType).trim().toLowerCase();
    const assetSourceType = asText(
      attachment?.sourceType,
      attachment?.["@odata.type"],
      "graph_file_attachment"
    ).trim();
    const isInline = attachment?.isInline === true;
    const hasContentBytes =
      attachment?.contentBytesAvailable === true || Boolean(asText(attachment?.contentBytes).trim());
    const resolvedMessageId = asText(messageId).trim();
    const resolvedGraphMessageId = asText(graphMessageId, resolvedMessageId).trim();
    const assetId = asText(
      attachment?.assetId,
      attachmentId,
      contentId,
      name,
      `${isInline ? "inline" : "attachment"}-${
        resolvedMessageId || resolvedGraphMessageId || "message"
      }-${index + 1}`
    ).trim();
    if (!assetId) return null;
    return {
      assetId,
      messageId: resolvedMessageId || null,
      graphMessageId: resolvedGraphMessageId || null,
      sourceStore: asText(sourceStore, "client_preview_runtime") || "client_preview_runtime",
      family: isInline ? "inline" : "attachment",
      kind:
        isInline || contentType.startsWith("image/")
          ? "image"
          : normalizeKey(attachment?.kind) === "attachment"
            ? "attachment"
            : "attachment",
      disposition: isInline ? "inline" : "attachment",
      sourceType: assetSourceType || "graph_file_attachment",
      attachmentId: attachmentId || null,
      name: name || null,
      contentType: contentType || null,
      contentId: contentId || null,
      size: Math.max(0, asNumber(attachment?.size, 0)),
      render: {
        state: isInline
          ? hasContentBytes
            ? "attachment_content_available"
            : contentId
              ? "cid_attachment_metadata_only"
              : "inline_attachment_metadata_only"
          : "not_renderable",
        mode: isInline
          ? hasContentBytes
            ? "attachment_content"
            : "cid_pending"
          : "none",
        safe: isInline && hasContentBytes,
        externalUrl: null,
      },
      download: {
        state: attachmentId ? "graph_attachment" : "unavailable",
        available: Boolean(attachmentId),
        attachmentId: attachmentId || null,
      },
      references: [],
    };
  }

  function ensureClientMailDocumentAssetTruth(
    message = {},
    { sourceStore = "client_preview_runtime" } = {}
  ) {
    const mailDocument =
      message?.mailDocument && typeof message.mailDocument === "object"
        ? message.mailDocument
        : null;
    if (!mailDocument) return null;

    const resolvedSourceStore =
      asText(mailDocument?.sourceStore, sourceStore, "client_preview_runtime") ||
      "client_preview_runtime";
    const resolvedMessageId = asText(mailDocument?.messageId, asText(message?.messageId)).trim();
    const resolvedGraphMessageId = asText(
      mailDocument?.graphMessageId,
      asText(message?.graphMessageId, resolvedMessageId)
    ).trim();
    const existingAssets = asArray(mailDocument?.assets);
    const legacyAssets = existingAssets.length
      ? []
      : [...asArray(mailDocument?.attachments), ...asArray(mailDocument?.inlineAssets)];
    const synthesizedAttachmentAssets = asArray(message?.attachments)
      .map((attachment, index) =>
        buildClientAttachmentAssetFromMetadata(
          attachment,
          {
            messageId: resolvedMessageId,
            graphMessageId: resolvedGraphMessageId,
            sourceStore: resolvedSourceStore,
          },
          index
        )
      )
      .filter(Boolean);

    const mergedAssets = [];
    const seenAssets = new Set();
    const pushUniqueAsset = (asset) => {
      if (!asset || typeof asset !== "object") return;
      const assetId = asText(
        asset?.assetId,
        asset?.attachmentId,
        asset?.contentId,
        asset?.name,
        asset?.download?.attachmentId
      ).trim();
      if (!assetId || seenAssets.has(assetId)) return;
      seenAssets.add(assetId);
      mergedAssets.push(asset);
    };

    existingAssets.forEach(pushUniqueAsset);
    legacyAssets.forEach(pushUniqueAsset);
    synthesizedAttachmentAssets.forEach(pushUniqueAsset);

    const familyCounts = mergedAssets.reduce(
      (summary, asset) => {
        const family = getClientMailAssetFamily(asset);
        if (family === "attachment" || family === "inline" || family === "external") {
          summary[family] += 1;
        }
        return summary;
      },
      { attachment: 0, inline: 0, external: 0 }
    );
    const attachmentAssets = mergedAssets.filter(
      (asset) => getClientMailAssetFamily(asset) === "attachment"
    );
    const inlineAssets = mergedAssets.filter((asset) => getClientMailAssetFamily(asset) === "inline");
    const renderableInlineCount = inlineAssets.filter((asset) => asset?.render?.safe === true).length;
    const declaredHasAttachments =
      mailDocument?.declaredHasAttachments === true ||
      message?.hasAttachments === true ||
      mailDocument?.hasAttachments === true;
    const hasAttachmentMetadata = attachmentAssets.length > 0;
    const assetSummary = {
      ...(mailDocument?.assetSummary && typeof mailDocument.assetSummary === "object"
        ? mailDocument.assetSummary
        : {}),
      assetCount: Math.max(
        asNumber(mailDocument?.assetSummary?.assetCount, 0),
        mergedAssets.length,
        familyCounts.attachment + familyCounts.inline + familyCounts.external
      ),
      familyCounts: {
        attachment: Math.max(
          asNumber(mailDocument?.assetSummary?.familyCounts?.attachment, 0),
          familyCounts.attachment
        ),
        inline: Math.max(
          asNumber(mailDocument?.assetSummary?.familyCounts?.inline, 0),
          familyCounts.inline
        ),
        external: Math.max(
          asNumber(mailDocument?.assetSummary?.familyCounts?.external, 0),
          familyCounts.external
        ),
      },
      renderableInlineCount: Math.max(
        asNumber(mailDocument?.assetSummary?.renderableInlineCount, 0),
        renderableInlineCount
      ),
      metadataAttachmentCount: attachmentAssets.length,
      declaredHasAttachments,
      declaredHasAttachmentsWithoutMetadata:
        declaredHasAttachments === true && hasAttachmentMetadata === false,
    };
    const assetRegistry = mergedAssets.reduce(
      (registry, asset) => {
        const assetId = asText(asset?.assetId).trim();
        if (assetId) registry[assetId] = asset;
        return registry;
      },
      mailDocument?.assetRegistry && typeof mailDocument.assetRegistry === "object"
        ? { ...mailDocument.assetRegistry }
        : {}
    );

    const attachmentTruthCarried =
      synthesizedAttachmentAssets.length > 0 ||
      mergedAssets.length !== existingAssets.length ||
      attachmentAssets.length !== asArray(mailDocument?.attachments).length ||
      inlineAssets.length !== asArray(mailDocument?.inlineAssets).length ||
      assetSummary.assetCount !== asNumber(mailDocument?.assetSummary?.assetCount, 0) ||
      assetSummary.familyCounts.attachment !==
        asNumber(mailDocument?.assetSummary?.familyCounts?.attachment, 0) ||
      assetSummary.familyCounts.inline !==
        asNumber(mailDocument?.assetSummary?.familyCounts?.inline, 0) ||
      assetSummary.familyCounts.external !==
        asNumber(mailDocument?.assetSummary?.familyCounts?.external, 0) ||
      hasAttachmentMetadata !== (mailDocument?.hasAttachments === true) ||
      declaredHasAttachments !== (mailDocument?.declaredHasAttachments === true);

    if (!attachmentTruthCarried) return mailDocument;

    return {
      ...mailDocument,
      sourceStore: resolvedSourceStore,
      declaredHasAttachments,
      hasAttachments: hasAttachmentMetadata,
      assets: mergedAssets,
      attachments: attachmentAssets,
      inlineAssets,
      assetRegistry,
      assetSummary,
    };
  }

  function buildPreviewMessages(row, feedEntries, threadDocument = null) {
    const getMailThreadMessage = (entry = {}) =>
      buildClientMailThreadMessageFromEntry(entry, {
        sourceStore: "client_preview_runtime",
      });
    const getMailDocument = (entry = {}) =>
      typeof ensureClientMailDocumentAssetTruth === "function"
        ? ensureClientMailDocumentAssetTruth(entry, {
            sourceStore: "client_preview_runtime",
          })
        : entry && typeof entry.mailDocument === "object"
          ? entry.mailDocument
          : null;
    const getMailThreadPreviewText = (entry = {}) =>
      asText(getMailThreadMessage(entry)?.presentation?.previewText);
    const getMailThreadConversationText = (entry = {}) =>
      asText(getMailThreadMessage(entry)?.presentation?.conversationText);
    const getMailThreadConversationHtml = (entry = {}) =>
      asText(getMailThreadMessage(entry)?.presentation?.conversationHtml);
    const getMailThreadPrimaryBodyHtml = (entry = {}) =>
      asText(getMailThreadMessage(entry)?.primaryBody?.html);
    const getMailThreadPrimaryBodyText = (entry = {}) =>
      asText(getMailThreadMessage(entry)?.primaryBody?.text);
    const getMailDocumentPreviewText = (entry = {}) =>
      asText(getMailDocument(entry)?.previewText);
    const getMailDocumentPrimaryBodyText = (entry = {}) =>
      asText(getMailDocument(entry)?.primaryBodyText);
    const getMailDocumentPrimaryBodyHtml = (entry = {}) =>
      getMailDocument(entry)?.primaryBodyHtml;
    const getMailDocumentMimePreferredBodyText = (entry = {}) =>
      asText(getMailDocument(entry)?.mime?.parsed?.body?.preferredText);
    const getMailDocumentMimePreferredBodyHtml = (entry = {}) =>
      asText(getMailDocument(entry)?.mime?.parsed?.body?.preferredHtml);
    const getMailDocumentMimePreviewText = (entry = {}) =>
      asText(
        getMailDocumentMimePreferredBodyText(entry),
        extractPreviewTextFromHtml(getMailDocumentMimePreferredBodyHtml(entry))
      );
    const hasRichMailThreadBody = (entry = {}) =>
      Boolean(
        asText(
          getMailThreadPrimaryBodyText(entry),
          getMailThreadPrimaryBodyHtml(entry),
          getMailThreadConversationText(entry),
          getMailThreadConversationHtml(entry)
        ).trim()
      );
    const getPreferredFoundationPreviewText = (entry = {}) =>
      asText(
        hasRichMailThreadBody(entry) ? getMailThreadPreviewText(entry) : "",
        getMailDocumentMimePreviewText(entry),
        getMailThreadPreviewText(entry),
        getMailThreadPrimaryBodyText(entry),
        getMailDocumentPreviewText(entry),
        getMailDocumentPrimaryBodyText(entry)
      );
    const extractPreviewTextFromHtml = (value = "") => {
      const html = asText(value).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\s+/g, " ")
        .trim();
    };
    const extractConversationTextFromHtml = (value = "") => {
      const html = asText(value).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    };
    const sanitizePreviewText = (value = "") =>
      asText(value)
        .replace(/\s+/g, " ")
        .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
        .replace(
          /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
          ""
        )
        .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
        .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
        .replace(/^Get more done with apps like Word\.?\s*/i, "")
        .replace(/^Learn why this is important\.?\s*/i, "")
        .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
        .replace(/^Read more about why this is important\.?\s*/i, "")
        .replace(/^[\s_—–-]{6,}/, "")
        .trim();
    const sanitizeConversationText = (value = "") =>
      asText(value)
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const stripProviderNoiseFromConversation = (value = "") =>
      sanitizeConversationText(value)
        .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
        .replace(
          /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
          ""
        )
        .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
        .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
        .replace(/^Get more done with apps like Word\.?\s*/i, "")
        .replace(/^Learn why this is important\.?\s*/i, "")
        .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
        .replace(/^Read more about why this is important\.?\s*/i, "")
        .replace(/^[\s_—–-]{6,}/, "")
        .trim();
    const stripContactFormPreamble = (value = "") =>
      stripProviderNoiseFromConversation(value)
        .replace(
          /^(?:Från:\s*[^\n]+(?:\n| +))?(?:E-post:\s*[^\n]+(?:\n| +))?(?:Telefon:\s*[^\n]+(?:\n| +))?(?:Hur kan vi hjälpa dig\?|How can we help you\?)\s*/i,
          ""
        )
        .trim();
    const signatureMarkerPattern =
      /^(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/i;
    const stripQuotedReplyChain = (value = "") => {
      let cleaned = stripContactFormPreamble(value);
      cleaned = cleaned.replace(
        /\s+(Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\s+(?=(?:Från|From):)/gi,
        "\n$1\n"
      );
      cleaned = cleaned.replace(
        /(\n(?:Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone))\n(?:Från|From):[\s\S]*$/i,
        "$1"
      );
      const quotedReplyMatchers = [
        /(?:^|\s)(?:\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
        /(?:^|\s)(?:\S+\s+\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
        /(?:^|\s)On\s+.+?\bwrote:\s*[\s\S]*$/i,
        /\n(?:Från|From):\s*.+?(?:Datum|Date):\s*.+?(?:Till|To):\s*.+?(?:Ämne|Subject):\s*[\s\S]*$/i,
        /(?:^|\s)_{10,}[\s\S]*$/i,
        /(?:^|\s)(?:Från|From):\s*[\s\S]*$/i,
      ];
      for (const matcher of quotedReplyMatchers) {
        const match = cleaned.match(matcher);
        if (match && typeof match.index === "number" && match.index > 24) {
          cleaned = cleaned.slice(0, match.index).trim();
          break;
        }
      }
      return cleaned
        .replace(
          /\n(?:m[aå]n(?:dag)?|tis(?:dag)?|ons(?:dag)?|tor(?:sdag)?|fre(?:dag)?|l[öo]r(?:dag)?|s[öo]n(?:dag)?)\.?$/i,
          ""
        )
        .trim();
    };
    const ensureConversationSignatureIdentity = (value = "", entry = {}) => {
      const lines = sanitizeConversationText(value)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return "";
      const signatureIndex = lines.findIndex(
        (line, index) => index > 0 && signatureMarkerPattern.test(line)
      );
      if (signatureIndex < 0) return lines.join("\n").trim();
      const tailLines = lines.slice(signatureIndex + 1);
      const hasIdentityTail = tailLines.some(
        (line) =>
          /@|\bHair TP Clinic\b|\bClinic\b|\bAB\b|\bSamordnare\b|\bHårspecialist\b|\bKonsultationsteam\b|\d{2,4}[- ]?\d{2,}/i.test(
            line
          ) ||
          (/^[A-ZÅÄÖ][\wÀ-ÿ'’.-]+(?:\s+[A-ZÅÄÖ][\wÀ-ÿ'’.-]+){0,3}$/.test(line) &&
            !/^(?:m[aå]n(?:dag)?|tis(?:dag)?|ons(?:dag)?|tor(?:sdag)?|fre(?:dag)?|l[öo]r(?:dag)?|s[öo]n(?:dag)?)\.?$/i.test(
              line
            ))
      );
      if (hasIdentityTail) return lines.join("\n").trim();
      const metadataIdentity = [entry?.fromName, entry?.senderName]
        .map((candidate) => asText(candidate).trim())
        .find(
          (candidate) =>
            candidate &&
            !isRuntimeUnknownCustomerName(candidate) &&
            !looksLikeMailboxIdentity(candidate) &&
            !signatureMarkerPattern.test(candidate)
        );
      if (!metadataIdentity) return lines.join("\n").trim();
      return [...lines, metadataIdentity].join("\n").trim();
    };
    const insertConversationSignatureBreaks = (value = "", entry = {}) =>
      ensureConversationSignatureIdentity(
        stripQuotedReplyChain(value)
          .replace(
            /([.!?])\s+(B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/gi,
            "$1\n\n$2"
          )
          .replace(
            /\s+(B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh)\b/gi,
            "\n\n$1"
          )
          .replace(
            /\b(MVH|Mvh)\s+(?=(?:m[aå]n(?:dag)?|tis(?:dag)?|ons(?:dag)?|tor(?:sdag)?|fre(?:dag)?|l[öo]r(?:dag)?|s[öo]n(?:dag)?|[A-ZÅÄÖ][\wÀ-ÿ'’.-]+))/gi,
            "$1\n"
          )
          .replace(/\s+(\/\s*[A-ZÅÄÖ][\wÀ-ÿ'’.-]+)/g, "\n$1")
          .replace(
            /\n(?:m[aå]n(?:dag)?|tis(?:dag)?|ons(?:dag)?|tor(?:sdag)?|fre(?:dag)?|l[öo]r(?:dag)?|s[öo]n(?:dag)?)\.?$/i,
            ""
          )
          .replace(/\n{3,}/g, "\n\n")
          .trim(),
        entry
      );
    const clampConversationText = (value = "", { maxChars = 520, maxLines = 7 } = {}) => {
      const sourceLines = sanitizeConversationText(value)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!sourceLines.length) return "";
      const signatureIndex = sourceLines.findIndex(
        (line, index) =>
          index > 0 &&
          /^(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/i.test(
            line
          )
      );
      const joinLines = (lines = []) => lines.filter(Boolean).join("\n").trim();
      const trimWithEllipsis = (text = "", max = maxChars) => {
        const normalized = sanitizeConversationText(text);
        if (normalized.length <= max) return normalized;
        return `${normalized.slice(0, max - 1).trimEnd()}…`;
      };
      if (
        sourceLines.length <= maxLines &&
        joinLines(sourceLines).length <= maxChars
      ) {
        return joinLines(sourceLines);
      }
      if (signatureIndex > 0) {
        const bodyLines = sourceLines.slice(0, signatureIndex);
        const signatureLines = sourceLines.slice(signatureIndex, signatureIndex + 4);
        const visibleBody = [];
        for (const line of bodyLines) {
          const nextBody = joinLines([...visibleBody, line]);
          if (visibleBody.length >= Math.max(1, maxLines - 3) || nextBody.length > 340) break;
          visibleBody.push(line);
        }
        const composed = joinLines([
          ...visibleBody,
          visibleBody.length && signatureLines.length ? "" : null,
          ...signatureLines,
        ]);
        return trimWithEllipsis(composed);
      }
      return trimWithEllipsis(joinLines(sourceLines.slice(0, maxLines)));
    };
    const buildConversationBody = (entry = {}, fallbackText = "") => {
      const rawCandidates = [
        getMailThreadConversationText(entry),
        getMailThreadPrimaryBodyText(entry),
        getMailDocumentMimePreferredBodyText(entry),
        getMailDocumentPrimaryBodyText(entry),
        extractConversationTextFromHtml(getMailDocumentPrimaryBodyHtml(entry)),
        extractConversationTextFromHtml(getMailDocumentMimePreferredBodyHtml(entry)),
        extractConversationTextFromHtml(entry?.bodyHtml),
        entry?.body,
        entry?.detail,
        entry?.summary,
        entry?.bodyPreview,
        entry?.preview,
      ];
      for (const candidate of rawCandidates) {
        const cleaned = clampConversationText(insertConversationSignatureBreaks(candidate, entry));
        if (cleaned && !isRuntimePlaceholderLine(cleaned)) {
          return cleaned;
        }
      }
      const fallback = clampConversationText(insertConversationSignatureBreaks(fallbackText, entry));
      return fallback && !isRuntimePlaceholderLine(fallback) ? fallback : "";
    };
    const buildConversationBodyHtml = (entry = {}) => {
      const rawHtml = [
        getMailThreadPrimaryBodyHtml(entry),
        getMailThreadConversationHtml(entry),
        getMailDocumentMimePreferredBodyHtml(entry),
        getMailDocumentPrimaryBodyHtml(entry),
        entry?.bodyHtml,
      ]
        .map((value) => asText(value).trim())
        .find(Boolean);
      if (!rawHtml) return "";
      const normalizedConversation = clampConversationText(
        insertConversationSignatureBreaks(extractConversationTextFromHtml(rawHtml), entry)
      );
      return normalizedConversation && !isRuntimePlaceholderLine(normalizedConversation)
        ? rawHtml
        : "";
    };
    const rowCustomerName = getRuntimeCustomerName(row);
    const mailboxLabel = titleCaseMailbox(
      asText(row.mailboxAddress || row.mailboxId || row.userPrincipalName || "kons@hairtpclinic.com")
    );
    const canonicalThreadMessages = asArray(threadDocument?.messages)
      .filter((message) => message && typeof message === "object")
      .sort(compareRuntimeMessagesDesc);
    const feedEntriesByMessageId = new Map(
      asArray(feedEntries)
        .map((entry) => [asText(entry?.messageId), entry])
        .filter((item) => item[0])
    );
    const canonicalEntries = canonicalThreadMessages.map((mailThreadMessage, index) => {
      const matchedEntry =
        feedEntriesByMessageId.get(asText(mailThreadMessage?.messageId)) || {};
      const matchedMailDocument = getMailDocument(matchedEntry);
      const canonicalPreviewEntry = {
        ...matchedEntry,
        mailThreadMessage,
        mailDocument: matchedMailDocument,
      };
      return {
        ...matchedEntry,
        messageId: asText(
          mailThreadMessage?.messageId,
          asText(matchedEntry?.messageId, `${row.conversationId}:${index}`)
        ),
        direction:
          normalizeKey(mailThreadMessage?.direction) === "outbound"
            ? "outbound"
            : normalizeKey(matchedEntry?.direction) === "outbound"
              ? "outbound"
              : "inbound",
        sentAt: asText(mailThreadMessage?.sentAt, asText(matchedEntry?.sentAt)),
        subject: asText(mailThreadMessage?.subject, asText(matchedEntry?.subject, row?.subject)),
        bodyPreview: asText(
          getPreferredFoundationPreviewText(canonicalPreviewEntry),
          asText(matchedEntry?.bodyPreview, asText(matchedMailDocument?.previewText))
        ),
        preview: asText(
          getPreferredFoundationPreviewText(canonicalPreviewEntry),
          asText(matchedEntry?.preview, asText(matchedMailDocument?.previewText))
        ),
        body: asText(
          mailThreadMessage?.primaryBody?.text,
          asText(
            matchedMailDocument?.mime?.parsed?.body?.preferredText,
            asText(matchedEntry?.body, asText(matchedMailDocument?.primaryBodyText))
          )
        ),
        bodyHtml: asText(
          mailThreadMessage?.primaryBody?.html,
          asText(
            matchedMailDocument?.mime?.parsed?.body?.preferredHtml,
            asText(
              mailThreadMessage?.presentation?.conversationHtml,
              asText(matchedEntry?.bodyHtml, asText(matchedMailDocument?.primaryBodyHtml))
            )
          )
        ),
        detail: asText(matchedEntry?.detail),
        summary: asText(matchedEntry?.summary),
        fromName: asText(matchedEntry?.fromName),
        senderName: asText(matchedEntry?.senderName),
        mailThreadMessage,
        mailDocument: matchedMailDocument,
      };
    });
    const entries = (canonicalEntries.length
      ? canonicalEntries
      : feedEntries.length
      ? feedEntries
      : [
          {
            messageId: row.messageId,
            direction: "inbound",
            sentAt: row.lastInboundAt || row.lastOutboundAt,
            bodyHtml: asText(
              row?.latestMessage?.bodyHtml,
              asText(row?.conversation?.bodyHtml, asText(row?.bodyHtml))
            ),
            preview: [
              row.latestInboundPreview,
              row.preview,
              row.systemPreview,
              row.latestPreview,
              row.bodyPreview,
              row.detail,
              row.summary,
              row.latestMessage?.preview,
              row.latestMessage?.bodyPreview,
              extractPreviewTextFromHtml(row.latestMessage?.bodyHtml),
              row.latestMessage?.body,
              row.latestMessage?.detail,
              row.latestMessage?.summary,
              row.conversation?.preview,
              row.conversation?.bodyPreview,
              extractPreviewTextFromHtml(row.conversation?.bodyHtml),
              row.conversation?.detail,
              row.conversation?.summary,
              extractPreviewTextFromHtml(row.bodyHtml),
              row.customerSummary?.lastCaseSummary,
            ]
              .map((value) => sanitizePreviewText(value))
              .find((value) => value && !isRuntimePlaceholderLine(value)),
          },
        ])
      .slice()
      .sort(compareRuntimeMessagesDesc);
    const customerName = getRuntimeCustomerNameFromFeedEntries(entries, rowCustomerName);
    return entries.slice(0, 8).map((entry, index) => {
      const mailThreadMessage = getMailThreadMessage(entry);
      const mailDocument = getMailDocument(entry);
      return {
        author:
          normalizeKey(entry?.direction) === "outbound"
            ? (() => {
                const outboundAuthor = [entry?.fromName, entry?.senderName]
                  .map((value) => asText(value).trim())
                  .find(
                    (value) =>
                      value &&
                      !isRuntimeUnknownCustomerName(value) &&
                      !looksLikeMailboxIdentity(value) &&
                      normalizeKey(value) !== normalizeKey(customerName)
                  );
                return compactRuntimeCopy(outboundAuthor, mailboxLabel, 54);
              })()
            : compactRuntimeCopy(
                getRuntimeCustomerNameFromFeedEntries([entry], customerName),
                customerName,
                42
              ),
        id: asText(entry?.messageId, `${row.conversationId}:${index}`),
        role: normalizeKey(entry?.direction) === "outbound" ? "staff" : "customer",
        time: formatConversationTime(entry?.sentAt),
        recordedAt: toIso(entry?.sentAt),
        mailboxId: asText(entry?.mailboxAddress, asText(entry?.mailboxId)),
        fromName: asText(entry?.fromName),
        senderName: asText(entry?.senderName),
        preview: asText(entry?.preview),
        bodyPreview: asText(entry?.bodyPreview),
        detail: asText(entry?.detail),
        summary: asText(entry?.summary),
        body:
          [
            getPreferredFoundationPreviewText(entry),
            getMailThreadPrimaryBodyText(entry),
            getMailDocumentMimePreferredBodyText(entry),
            extractPreviewTextFromHtml(getMailDocumentMimePreferredBodyHtml(entry)),
            getMailDocumentPreviewText(entry),
            getMailDocumentPrimaryBodyText(entry),
            extractPreviewTextFromHtml(getMailDocumentPrimaryBodyHtml(entry)),
            entry?.preview,
            entry?.bodyPreview,
            extractPreviewTextFromHtml(entry?.bodyHtml),
            entry?.body,
            entry?.detail,
            entry?.summary,
          ]
            .map((value) => sanitizePreviewText(value))
            .find((value) => value && !isRuntimePlaceholderLine(value)) ||
          (normalizeKey(entry?.direction) === "outbound"
            ? "Svar skickades från kliniken."
            : "Ingen förhandsvisning tillgänglig."),
        conversationBody: buildConversationBody(
          entry,
          [
            getMailThreadConversationText(entry),
            getMailThreadPreviewText(entry),
            getMailDocumentPrimaryBodyText(entry),
            getMailDocumentPreviewText(entry),
            entry?.bodyPreview,
            entry?.preview,
            entry?.detail,
            entry?.summary,
          ]
            .map((value) => sanitizePreviewText(value))
            .find((value) => value && !isRuntimePlaceholderLine(value))
        ),
        conversationBodyHtml: buildConversationBodyHtml(entry),
        mailThreadMessage,
        mailDocument,
        latest: index === 0,
      };
    });
  }

  function buildHistoryEvents(row, feedEntries) {
    const extractPreviewTextFromHtml = (value = "") => {
      const html = asText(value).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\s+/g, " ")
        .trim();
    };
    const sanitizePreviewText = (value = "") =>
      asText(value)
        .replace(/\s+/g, " ")
        .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
        .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
        .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
        .replace(/^Get more done with apps like Word\.?\s*/i, "")
        .replace(/^Learn why this is important\.?\s*/i, "")
        .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
        .replace(/^Read more about why this is important\.?\s*/i, "")
        .replace(/^[\s_—–-]{6,}/, "")
        .trim();
    return (feedEntries.length ? feedEntries : [])
      .slice(0, 8)
      .map((entry) => ({
        title: normalizeKey(entry?.direction) === "outbound" ? "E-post skickat" : "E-post mottaget",
        description: asText(entry?.subject, asText(row?.subject, "Tråduppdatering")),
        detail:
          [
            entry?.preview,
            entry?.bodyPreview,
            extractPreviewTextFromHtml(entry?.bodyHtml),
            entry?.body,
            entry?.detail,
            entry?.summary,
          ]
            .map((value) => sanitizePreviewText(value))
            .find((value) => value && !isRuntimePlaceholderLine(value)) ||
          "Ingen förhandsvisning tillgänglig.",
        time: formatConversationTime(entry?.sentAt),
        recordedAt: toIso(entry?.sentAt),
        conversationId: asText(entry?.conversationId, asText(row?.conversationId)),
        mailboxId: normalizeMailboxId(
          asText(entry?.mailboxAddress || row?.mailboxAddress || row?.mailboxId)
        ),
        mailboxLabel: titleCaseMailbox(
          asText(entry?.mailboxAddress || row?.mailboxAddress || row?.mailboxId)
        ),
        resultType: "message",
        type: "email",
      }));
  }

  function deriveRuntimeTags(row) {
    const tags = ["all"];
    const workflowLane = normalizeKey(row?.workflowLane);
    const priorityLevel = normalizeKey(row?.priorityLevel);
    const slaStatus = normalizeKey(row?.slaStatus);
    const followUpAt = toIso(row?.followUpDueAt || row?.followUpSuggestedAt);
    const now = Date.now();
    const dayDiff = followUpAt
      ? Math.floor((Date.parse(followUpAt) - now) / (24 * 60 * 60 * 1000))
      : null;
    if (workflowLane === "waiting_reply" || normalizeKey(row?.waitingOn) === "customer") tags.push("later", "followup");
    if (workflowLane === "booking_ready" || normalizeKey(row?.bookingState).includes("ready")) tags.push("bookable");
    if (workflowLane === "medical_review" || row?.needsMedicalReview === true) tags.push("medical");
    if (workflowLane === "admin_low") tags.push("admin");
    if (["critical", "high"].includes(priorityLevel)) tags.push("sprint");
    if (slaStatus === "breach" || workflowLane === "action_now") tags.push("act-now", "today");
    else if (slaStatus === "warning") tags.push("today");
    if (!asText(row?.owner)) tags.push("unassigned");
    if (slaStatus === "breach" || asNumber(row?.riskStackScore, 0) >= 0.6) tags.push("high-risk");
    if (dayDiff === 0) tags.push("today");
    if (dayDiff === 1) tags.push("tomorrow");
    return Array.from(new Set(tags));
  }

  function derivePrimaryRuntimeLane(row) {
    const workflowLane = normalizeKey(row?.workflowLane);
    const priorityLevel = normalizeKey(row?.priorityLevel);
    const slaStatus = normalizeKey(row?.slaStatus);
    const bookingState = normalizeKey(row?.bookingState);
    const waitingOn = normalizeKey(row?.waitingOn);
    const reviewFlagCandidates = [
      row?.reviewRequired,
      row?.needsReview,
      row?.manualReviewRequired,
      row?.latestOutcome?.reviewRequired,
      row?.latestReplyDraft?.reviewRequired,
    ];
    const reviewDecisionCandidates = [
      row?.risk?.decision,
      row?.latestOutcome?.risk?.decision,
      row?.latestReplyDraft?.risk?.decision,
      row?.latestReplySuggestion?.risk?.decision,
      row?.customerSummary?.risk?.decision,
      row?.deliveryMode,
      row?.latestOutcome?.deliveryMode,
      row?.latestReplyDraft?.deliveryMode,
    ]
      .map((value) => normalizeKey(value))
      .filter(Boolean);
    if (
      reviewFlagCandidates.some((value) => value === true) ||
      reviewDecisionCandidates.some(
        (value) => value === "review_required" || value === "manual_review_required"
      )
    ) {
      return "review";
    }
    if (normalizeKey(row?.intent) === "unclear" || normalizeKey(row?.intent) === "oklart") {
      return "unclear";
    }
    if (workflowLane === "medical_review" || row?.needsMedicalReview === true) {
      return "medical";
    }
    if (workflowLane === "booking_ready" || bookingState.includes("ready")) {
      return "bookable";
    }
    if (workflowLane === "admin_low") {
      return "admin";
    }
    if (workflowLane === "waiting_reply" || waitingOn === "customer") {
      return "later";
    }
    if (slaStatus === "breach" || workflowLane === "action_now") {
      return "act-now";
    }
    if (["critical", "high"].includes(priorityLevel)) {
      return "sprint";
    }
    return "all";
  }

  function getThreadPrimaryLaneId(thread) {
    const explicitPrimaryLane = normalizeKey(thread?.primaryLaneId || "");
    if (!explicitPrimaryLane || explicitPrimaryLane === "all") {
      if (isManualReviewRuntimeThread(thread)) return "review";
      if (isUnclearRuntimeThread(thread)) return "unclear";
      if (asArray(thread?.tags).includes("medical")) return "medical";
      if (asArray(thread?.tags).includes("bookable")) return "bookable";
      if (asArray(thread?.tags).includes("admin")) return "admin";
      if (isLaterRuntimeThread(thread)) return "later";
      if (asArray(thread?.tags).includes("act-now")) return "act-now";
      if (asArray(thread?.tags).includes("sprint")) return "sprint";
      return "all";
    }
    return explicitPrimaryLane;
  }

  function normalizePrimaryQueueLaneId(laneId) {
    const normalizedLane = normalizeKey(laneId || "all");
    return normalizedLane === "all" || QUEUE_LANE_ORDER.includes(normalizedLane)
      ? normalizedLane
      : "all";
  }

  function buildRuntimeSummaryCards(row, thread) {
    const latestInbound = row?.lastInboundAt ? formatConversationTime(row.lastInboundAt) : "Ingen inkommande ännu";
    const latestOutbound = row?.lastOutboundAt ? formatConversationTime(row.lastOutboundAt) : "Inte besvarad ännu";
    const historySummary = compactRuntimeCopy(
      row?.customerSummary?.historySignalSummary,
      "Ingen historiksignal registrerad ännu.",
      110
    );
    const historyActionCue = compactRuntimeCopy(
      row?.customerSummary?.historySignalActionCue,
      "Håll svaret konkret och tydligt.",
      110
    );
    return {
      customer: [
        {
          chip: "Bra att tänka på nu",
          tone: "violet",
          provenance: {
            label: "Live kundkontext",
            tone: "derived",
            detail: "Härledd från livekällor: tempoprofil, livscykel och kundmönster sammanställs från runtime och kökontext.",
          },
          lines: [
            `Arbeta så här: ${historyActionCue || "Led kunden med ett tydligt nästa steg i samma svar."}`,
            `Tempo: ${humanizeCode(row?.tempoProfile, "Reflekterande")}`,
            `Kundläge: ${thread.lifecycleLabel} · ${thread.displayEngagementLabel || thread.engagementLabel}`,
          ],
        },
        {
          chip: "Kundläge",
          tone: "blue",
          provenance: {
            label: "Relationsbild",
            tone: "system",
            detail: "Visar den sammanhangsbild som operatören behöver för att svara rätt, inte arbetsplanen i sig.",
          },
          lines: [
            compactRuntimeCopy(
              row?.customerSummary?.lastCaseSummary,
              "Ingen kundsammanfattning tillgänglig ännu.",
              110
            ),
            `Kontaktväg: ${thread.mailboxesLabel || thread.mailboxLabel}`,
            `Nu väntar vi på: ${thread.waitingLabel}`,
          ],
        },
      ],
      history: [
        {
          chip: "Historikmönster",
          tone: "violet",
          provenance: {
            label: "Historiksignal",
            tone: "system",
            detail: "Livekälla i valt mailboxscope: bygger på tidigare kundinteraktioner för den valda kunden.",
          },
          lines: [
            `Historiken visar: ${
              historySummary ||
              compactRuntimeCopy(row?.customerSummary?.lastCaseSummary, "Ingen historiksignal registrerad ännu.", 110)
            }`,
            `Betyder nu: ${
              historyActionCue ||
              compactRuntimeCopy(row?.recommendedAction, "Håll svaret konkret och tydligt.", 110)
            }`,
            `${Math.max(1, asNumber(row?.customerSummary?.historyMessageCount, row?.customerSummary?.interactionCount || 1))} mail i ${thread.mailboxesLabel}`,
          ],
        },
        {
          chip: "Senaste kontakt",
          tone: "blue",
          provenance: {
            label: "Livekontext",
            tone: "system",
            detail: "Livekälla: visar senast kända kommunikationsstatus för den valda tråden.",
          },
          lines: [
            `Senaste inkommande: ${latestInbound}`,
            `Senaste utgående: ${latestOutbound}`,
            `Senaste kundrad: ${compactRuntimeCopy(row?.latestInboundPreview, "Ingen preview tillgänglig.", 92)}`,
          ],
        },
      ],
      signals: [
        {
          chip: "Prioriteringssignal",
          tone: "green",
          provenance: {
            label: "AI + regelmotor",
            tone: "ai",
            detail: "Härledd från AI-stöd och systemregler i runtime, inte från ett separat operatörsbeslut.",
          },
          lines: [
            row?.priorityReasons?.[0]
              ? `Prioritetsskäl: ${formatPriorityReason(row.priorityReasons[0])}`
              : "Inget prioritetsskäl registrerat ännu",
            `Nästa steg: ${thread.nextActionLabel}`,
            thread.followUpLabel ? `Uppföljning: ${thread.followUpLabel}` : `Väntar på: ${thread.waitingLabel}`,
          ],
        },
        {
          chip: "Svarssignal",
          tone: "violet",
          provenance: {
            label: "AI-signal",
            tone: "ai",
            detail: "Härledd från AI-stöd i runtime. Ton, CTA och konfidens är vägledning, inte livekommando.",
          },
          lines: [
            `Ton: ${humanizeCode(row?.tone, "Neutral")}`,
            `CTA-intensitet: ${humanizeCode(row?.ctaIntensity, "Normal")}`,
            `Konfidens: ${Math.round(clamp(asNumber(row?.toneConfidence, 0.4), 0, 1) * 100)}%`,
          ],
        },
        {
          chip: "Utkast & tempo",
          tone: "blue",
          provenance: {
            label: "Härledd rekommendation",
            tone: "derived",
            detail: "Härledd från livekontext och reply-signaler för den valda tråden.",
          },
          lines: [
            compactRuntimeCopy(row?.recommendedAction, "Granska tråden och svara tydligt.", 110),
            compactRuntimeCopy(row?.followUpTimingReason?.[0], "Ingen separat timing-signal just nu.", 110),
            compactRuntimeCopy(row?.latestInboundPreview, "Ingen preview tillgänglig.", 110),
          ],
        },
      ],
      medicine: [],
      team: [
        {
          chip: "Teamläge",
          tone: "blue",
          provenance: {
            label: "Live teamstatus",
            tone: "system",
            detail: "Livekälla: ägare och väntläge kommer från aktiv tråd- och teamkontext.",
          },
          lines: [
            `Ägare: ${thread.ownerLabel}`,
            `Väntar på: ${thread.waitingLabel}`,
            compactRuntimeCopy(row?.escalationRule, "Ingen eskalering krävs just nu.", 110),
          ],
        },
      ],
      actions: [
        {
          chip: "Nästa drag",
          tone: "green",
          lines: [
            thread.nextActionLabel,
            compactRuntimeCopy(thread.nextActionSummary, "Granska tråden och ta nästa tydliga steg.", 110),
            thread.followUpLabel ? `Planerad uppföljning: ${thread.followUpLabel}` : "Ingen planerad uppföljning ännu.",
          ],
        },
      ],
    };
  }

  function buildMailboxCatalog(rows, metadata = {}) {
    const entries = new Map();
    asArray(metadata?.sourceMailboxIds).forEach((email) => {
      const safeEmail = asText(email).toLowerCase();
      if (!safeEmail) return;
      entries.set(safeEmail, {
        id: safeEmail,
        email: safeEmail,
        label: titleCaseMailbox(safeEmail),
      });
    });
    asArray(metadata?.mailboxCapabilities).forEach((capability) => {
      const safeEmail = asText(capability?.email || capability?.id).toLowerCase();
      if (!safeEmail) return;
      entries.set(safeEmail, {
        ...(entries.get(safeEmail) || {}),
        ...capability,
        id: normalizeMailboxId(capability?.id || safeEmail),
        email: safeEmail,
        label: asText(capability?.label, titleCaseMailbox(safeEmail)),
      });
    });
    rows.forEach((row) => {
      const email = asText(row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName).toLowerCase();
      if (!email) return;
      entries.set(email, {
        ...(entries.get(email) || {}),
        id: normalizeMailboxId(email),
        email,
        label: asText(entries.get(email)?.label, titleCaseMailbox(email)),
      });
    });
    return Array.from(entries.values());
  }

  function buildFallbackRowsFromFeed(data) {
    const rowsByConversation = new Map();
    [...asArray(data?.inboundFeed), ...asArray(data?.outboundFeed)].forEach((entry) => {
      const conversationId = asText(entry?.conversationId);
      if (!conversationId || rowsByConversation.has(conversationId)) return;
      const mailThreadMessage =
        entry?.mailThreadMessage && typeof entry.mailThreadMessage === "object"
          ? entry.mailThreadMessage
          : null;
      const mailDocument =
        entry?.mailDocument && typeof entry.mailDocument === "object"
          ? entry.mailDocument
          : null;
      const entryPreview = asText(
        mailThreadMessage?.presentation?.previewText,
        asText(
          mailThreadMessage?.presentation?.conversationText,
          asText(
            mailThreadMessage?.primaryBody?.text,
            asText(
              mailDocument?.previewText,
              asText(mailDocument?.primaryBodyText, asText(entry?.preview))
            )
          )
        )
      );
      const rawSenderLabel = asText(
        entry?.counterpart,
        asText(
          entry?.counterpartyName,
          asText(entry?.senderName, asText(mailDocument?.from?.name, "Okänd kund"))
        )
      );
      const senderEmail = extractEmail(rawSenderLabel);
      const senderLabel =
        senderEmail && normalizeKey(rawSenderLabel) === normalizeKey(senderEmail)
          ? humanizeHistoryCounterpartyEmail(senderEmail) || rawSenderLabel
          : rawSenderLabel;
      rowsByConversation.set(conversationId, {
        conversationId,
        messageId: asText(entry?.messageId, asText(mailDocument?.messageId)),
        mailboxId: asText(entry?.mailboxAddress, asText(mailDocument?.mailboxAddress)),
        mailboxAddress: asText(
          entry?.mailboxAddress,
          asText(mailDocument?.mailboxAddress)
        ),
        userPrincipalName: asText(
          entry?.mailboxAddress,
          asText(mailDocument?.mailboxAddress)
        ),
        subject: asText(mailDocument?.subject, asText(entry?.subject, "(utan ämne)")),
        sender: senderLabel,
        latestInboundPreview: entryPreview,
        lastInboundAt: normalizeKey(entry?.direction) === "inbound" ? asText(entry?.sentAt) : "",
        lastOutboundAt: normalizeKey(entry?.direction) === "outbound" ? asText(entry?.sentAt) : "",
        slaStatus: "safe",
        priorityLevel: "medium",
        waitingOn: normalizeKey(entry?.direction) === "inbound" ? "owner" : "customer",
        hasUnreadInbound:
          normalizeKey(entry?.direction) === "inbound" && entry?.isRead === false,
        intent: "unclear",
        customerSummary: {
          customerName: senderLabel,
          lifecycleStatus: "active_dialogue",
          interactionCount: 1,
          engagementScore: 0.35,
          lastCaseSummary: entryPreview,
        },
        recommendedAction: "Granska konversation",
        riskStackExplanation: "Ingen dominant risk identifierad.",
      });
    });
    return Array.from(rowsByConversation.values());
  }

  function humanizeHistoryCounterpartyEmail(value) {
    const email = extractEmail(value);
    if (!email) return "";
    const [localPart = "", domainPart = ""] = email.split("@");
    const normalizedLocalPart = normalizeKey(localPart);
    const genericLocalParts = new Set([
      "info",
      "support",
      "contact",
      "kontakt",
      "hello",
      "mail",
      "mailer",
      "news",
      "newsletter",
      "noreply",
      "no-reply",
      "reply",
      "service",
      "team",
      "admin",
      "booking",
      "bokning",
      "order",
      "orders",
      "receipt",
      "receipts",
    ]);
    const technicalDomainParts = new Set([
      "app",
      "cdn",
      "email",
      "img",
      "image",
      "mail",
      "mailer",
      "news",
      "newsletter",
      "noreply",
      "no-reply",
      "reply",
      "support",
      "kontakt",
      "contact",
      "www",
    ]);
    const titleCaseParts = (parts = []) =>
      parts
        .map((part) => asText(part).trim())
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

    if (!genericLocalParts.has(normalizedLocalPart)) {
      return titleCaseParts(localPart.split(/[._+-]+/g));
    }

    const domainTokens = domainPart.split(".").filter(Boolean);
    if (domainTokens.length >= 2) {
      const suffix = domainTokens[domainTokens.length - 1];
      const baseTokens = domainTokens.slice(0, -1).filter(Boolean);
      const meaningfulBase =
        [...baseTokens]
          .reverse()
          .find((part) => {
            const normalizedPart = normalizeKey(part);
            return (
              normalizedPart &&
              normalizedPart.length > 1 &&
              !technicalDomainParts.has(normalizedPart)
            );
          }) || baseTokens[baseTokens.length - 1];
      if (meaningfulBase) {
        return titleCaseParts([meaningfulBase, suffix]);
      }
    }

    return titleCaseParts(localPart.split(/[._+-]+/g));
  }

  function buildHistoryConversationKey(message = {}) {
    const mailboxId = asText(
      message?.mailboxId || message?.mailboxAddress || message?.userPrincipalName,
      "kons@hairtpclinic.com"
    ).toLowerCase();
    const mailboxConversationId = asText(message?.mailboxConversationId);
    if (mailboxConversationId) return mailboxConversationId;
    const conversationId = asText(message?.conversationId);
    if (conversationId) {
      if (mailboxId && !conversationId.includes(":")) {
        return `${mailboxId}:${conversationId}`;
      }
      return conversationId;
    }
    const customerEmail =
      extractEmail(
        message?.customerEmail ||
          message?.counterpartyEmail ||
          message?.senderEmail ||
          asArray(message?.replyToRecipients)[0] ||
          asArray(message?.recipients)[0]
      ) || "okand-kund";
    const subjectKey = normalizeKey(
      asText(message?.normalizedSubject || message?.subject, "(utan ämne)")
    );
    return `${mailboxId}:${customerEmail}:${subjectKey || "utan-amne"}`;
  }

  function buildHistoryFeedEntries(messages = []) {
    return asArray(messages)
      .slice()
      .sort(compareHistoryEventsDesc)
      .map((message) => {
        const mailThreadMessage = buildClientMailThreadMessageFromEntry(message, {
          sourceStore: "client_history_runtime",
        });
        const mailDocument =
          typeof ensureClientMailDocumentAssetTruth === "function"
            ? ensureClientMailDocumentAssetTruth(message, {
                sourceStore: "client_history_runtime",
              })
            : message?.mailDocument && typeof message.mailDocument === "object"
              ? message.mailDocument
              : null;
        return {
          messageId: asText(message?.messageId, asText(mailDocument?.messageId)),
          conversationId: buildHistoryConversationKey(message),
          mailboxAddress: asText(
            message?.mailboxId ||
              message?.mailboxAddress ||
              message?.userPrincipalName ||
              mailDocument?.mailboxAddress ||
              mailDocument?.mailboxId ||
              mailDocument?.userPrincipalName,
            "kons@hairtpclinic.com"
          ),
          fromName: asText(
            message?.fromName,
            asText(
              mailDocument?.from?.name,
              normalizeKey(message?.direction) === "outbound"
                ? asText(message?.senderName)
                : asText(message?.counterpartyName)
            )
          ),
          senderName: asText(
            message?.senderName,
            asText(mailDocument?.from?.name, asText(message?.fromName))
          ),
          sentAt: toIso(asText(message?.sentAt, asText(mailDocument?.sentAt))),
          preview: [
            mailThreadMessage?.presentation?.previewText,
            mailThreadMessage?.presentation?.conversationText,
            mailThreadMessage?.primaryBody?.text,
            mailDocument?.previewText,
            mailDocument?.primaryBodyText,
            message?.bodyPreview,
            message?.body,
            message?.detail,
            message?.summary,
          ]
            .map((value) => asText(value))
            .find((value) => value && !isRuntimePlaceholderLine(value)),
          bodyPreview: asText(
            mailThreadMessage?.presentation?.previewText,
            asText(mailDocument?.previewText, asText(message?.bodyPreview))
          ),
          body: asText(
            mailThreadMessage?.presentation?.conversationText,
            asText(mailThreadMessage?.primaryBody?.text, asText(mailDocument?.primaryBodyText, asText(message?.body)))
          ),
          detail: asText(message?.detail),
          summary: asText(message?.summary),
          bodyHtml: asText(
            mailThreadMessage?.presentation?.conversationHtml,
            asText(mailDocument?.primaryBodyHtml, asText(message?.bodyHtml))
          ),
          subject: asText(mailDocument?.subject, asText(message?.subject, "(utan ämne)")),
          direction: normalizeKey(message?.direction) === "outbound" ? "outbound" : "inbound",
          isRead: typeof message?.isRead === "boolean" ? message.isRead : null,
          mailThreadMessage,
          mailDocument,
        };
      });
  }

  function buildClientMailThreadMessageFromEntry(
    message = {},
    { sourceStore = "client_preview_runtime" } = {}
  ) {
    const existing =
      message?.mailThreadMessage && typeof message.mailThreadMessage === "object"
        ? message.mailThreadMessage
        : null;
    const mailDocument =
      typeof ensureClientMailDocumentAssetTruth === "function"
        ? ensureClientMailDocumentAssetTruth(message, { sourceStore })
        : message?.mailDocument && typeof message.mailDocument === "object"
          ? message.mailDocument
          : null;
    if (!mailDocument) return existing;

    const extractPlainTextFromHtml = (value = "") =>
      asText(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(?:p|div|li|tr|table|ul|ol|section|article|header|footer|blockquote)>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    const pickText = (...candidates) => {
      for (const candidate of candidates) {
        const value =
          typeof candidate === "string"
            ? candidate.trim()
            : candidate === undefined || candidate === null
              ? ""
              : String(candidate).trim();
        if (value) return value;
      }
      return "";
    };
    const normalizeConversationText = (value = "") =>
      asText(value)
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    const splitPlainTextSections = (value = "") => {
      const systemPatterns = [
        /^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
        /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
        /^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i,
        /^Power up your productivity with Microsoft 365\.?\s*/i,
        /^Get more done with apps like Word\.?\s*/i,
        /^Learn why this is important\.?\s*/i,
        /^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i,
        /^Read more about why this is important\.?\s*/i,
      ];
      const quotedPatterns = [
        /(?:^|\n)(?:\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
        /(?:^|\n)(?:\S+\s+\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
        /(?:^|\n)On\s+.+?\bwrote:\s*[\s\S]*$/i,
        /\n(?:Från|From):\s*.+?(?:Datum|Date):\s*.+?(?:Till|To):\s*.+?(?:Ämne|Subject):\s*[\s\S]*$/i,
        /(?:^|\n)_{10,}[\s\S]*$/i,
        /(?:^|\n)(?:Från|From):\s*[\s\S]*$/i,
      ];
      const signaturePattern =
        /^(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/i;

      let remaining = normalizeConversationText(value);
      const systemBlocks = [];
      let changed = true;
      while (remaining && changed) {
        changed = false;
        for (const pattern of systemPatterns) {
          const match = remaining.match(pattern);
          if (!match || match.index !== 0) continue;
          const blockText = normalizeConversationText(match[0]);
          if (blockText) {
            systemBlocks.push({
              kind: "system_block",
              role: "provider_notice",
              text: blockText,
              html: null,
            });
          }
          remaining = normalizeConversationText(remaining.slice(match[0].length));
          changed = true;
          break;
        }
      }

      let quotedText = "";
      for (const pattern of quotedPatterns) {
        const match = remaining.match(pattern);
        if (!match || typeof match.index !== "number" || match.index <= 24) continue;
        quotedText = normalizeConversationText(match[0]);
        remaining = normalizeConversationText(remaining.slice(0, match.index));
        break;
      }

      const lines = normalizeConversationText(remaining)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      let signatureBlock = null;
      const signatureIndex = lines.findIndex(
        (line, index) => index > 0 && signaturePattern.test(line)
      );
      const primaryLines =
        signatureIndex >= 0 ? lines.slice(0, signatureIndex) : lines;
      const signatureLines =
        signatureIndex >= 0 ? lines.slice(signatureIndex) : [];
      if (signatureLines.length) {
        signatureBlock = {
          kind: "signature_block",
          role: "signature",
          text: signatureLines.join("\n").trim(),
          html: null,
        };
      }
      return {
        primaryText: primaryLines.join("\n").trim(),
        signatureBlock,
        quotedBlocks: quotedText
          ? [
              {
                kind: "quoted_block",
                role: "reply_chain",
                text: quotedText,
                html: null,
              },
            ]
          : [],
        systemBlocks,
      };
    };
    const mergeUniqueIds = (left = [], right = []) =>
      Array.from(
        new Set(
          [...asArray(left), ...asArray(right)]
            .map((value) => asText(value).trim())
            .filter(Boolean)
        )
      );

    const mimePreferredKind = normalizeKey(
      mailDocument?.fidelity?.mimePreferredBodyKind ||
        mailDocument?.mime?.parsed?.preferredBodyKind
    );
    const mimePreferredBodyHtml = pickText(mailDocument?.mime?.parsed?.body?.preferredHtml);
    const mimePreferredBodyText = normalizeConversationText(
      pickText(
        mailDocument?.mime?.parsed?.body?.preferredText,
        extractPlainTextFromHtml(mimePreferredBodyHtml)
      )
    );
    const primaryBodyHtml = pickText(
      mimePreferredBodyHtml,
      mailDocument?.primaryBodyHtml,
      message?.bodyHtml
    );
    const fallbackText = normalizeConversationText(
      pickText(
        mimePreferredBodyText,
        mailDocument?.primaryBodyText,
        extractPlainTextFromHtml(primaryBodyHtml),
        message?.body,
        message?.detail,
        message?.summary
      )
    );
    const sections = splitPlainTextSections(fallbackText);
    const primaryBodyText = pickText(
      mimePreferredBodyText,
      sections?.primaryText,
      fallbackText,
      mailDocument?.previewText,
      message?.bodyPreview,
      message?.preview
    );
    const signatureBlock =
      sections?.signatureBlock && asText(sections.signatureBlock.text).trim()
        ? sections.signatureBlock
        : null;
    const quotedBlocks = asArray(sections?.quotedBlocks);
    const systemBlocks = asArray(sections?.systemBlocks);
    const conversationText = [primaryBodyText, asText(signatureBlock?.text).trim()]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const direction =
      normalizeKey(mailDocument?.direction || message?.direction) === "outbound"
        ? "outbound"
        : "inbound";
    const role = direction === "outbound" ? "staff" : "customer";
    const derived = {
      version: asText(existing?.version, "phase_3_client_derived"),
      kind: "mail_thread_message",
      sourceStore: asText(
        mailDocument?.sourceStore,
        asText(existing?.sourceStore, asText(sourceStore, "client_preview_runtime"))
      ),
      messageId: asText(mailDocument?.messageId, asText(message?.messageId)) || null,
      graphMessageId:
        asText(mailDocument?.graphMessageId, asText(message?.graphMessageId)) || null,
      conversationId:
        asText(mailDocument?.conversationId, asText(message?.conversationId)) || null,
      mailboxId:
        asText(
          mailDocument?.mailboxId,
          asText(message?.mailboxId, asText(message?.mailboxAddress))
        ) || null,
      direction,
      role,
      sentAt: asText(mailDocument?.sentAt, asText(message?.sentAt)) || null,
      subject: asText(mailDocument?.subject, asText(message?.subject, "(utan ämne)")),
      previewText: pickText(
        mimePreferredBodyText,
        mailDocument?.previewText,
        extractPlainTextFromHtml(primaryBodyHtml),
        message?.bodyPreview,
        message?.preview
      ),
      sourceDepth: asText(
        mailDocument?.sourceDepth,
        primaryBodyHtml ? "html" : primaryBodyText ? "text" : "empty"
      ),
      mimeAvailable:
        mailDocument?.mimeAvailable === true || mailDocument?.mime?.available === true,
      mimeBacked:
        mailDocument?.mimeBacked === true || mailDocument?.mime?.mimeBacked === true,
      mime:
        mailDocument?.mime && typeof mailDocument.mime === "object"
          ? mailDocument.mime
          : null,
      primaryBody: {
        text: primaryBodyText || "",
        html: primaryBodyHtml || null,
      },
      quotedBlocks,
      signatureBlock,
      systemBlocks,
      contentSections: {
        mode: primaryBodyHtml ? "html_fallback" : primaryBodyText ? "text_fallback" : "empty",
        source:
          mailDocument?.mimeBacked === true || mailDocument?.mime?.mimeBacked === true
            ? "mime_backed"
            : primaryBodyHtml
              ? "html"
              : primaryBodyText
                ? "text"
                : "empty",
        diagnostics:
          existing?.contentSections &&
          typeof existing.contentSections.diagnostics === "object"
            ? existing.contentSections.diagnostics
            : {
                blockCount: 0,
                htmlSectioned: false,
              },
        mimePreferredBodyKind: mimePreferredKind || "empty",
      },
      assets: {
        assetCount: Math.max(
          asNumber(existing?.assets?.assetCount, 0),
          asNumber(mailDocument?.assetSummary?.assetCount, asArray(mailDocument?.assets).length)
        ),
        familyCounts: {
          attachment: Math.max(
            asNumber(existing?.assets?.familyCounts?.attachment, 0),
            asNumber(mailDocument?.assetSummary?.familyCounts?.attachment, 0)
          ),
          inline: Math.max(
            asNumber(existing?.assets?.familyCounts?.inline, 0),
            asNumber(mailDocument?.assetSummary?.familyCounts?.inline, 0)
          ),
          external: Math.max(
            asNumber(existing?.assets?.familyCounts?.external, 0),
            asNumber(mailDocument?.assetSummary?.familyCounts?.external, 0)
          ),
        },
        attachmentIds: mergeUniqueIds(
          asArray(existing?.assets?.attachmentIds),
          asArray(mailDocument?.attachments).map((asset) =>
            asText(asset?.assetId, asText(asset?.attachmentId, asText(asset?.id)))
          )
        ),
        inlineAssetIds: mergeUniqueIds(
          asArray(existing?.assets?.inlineAssetIds),
          asArray(mailDocument?.inlineAssets).map((asset) =>
            asText(asset?.assetId, asText(asset?.attachmentId, asText(asset?.id)))
          )
        ),
        mimeInlineAssetCount: Math.max(
          asNumber(existing?.assets?.mimeInlineAssetCount, 0),
          asArray(mailDocument?.mime?.parsed?.assets?.inlineAssets).length
        ),
        mimeAttachmentCount: Math.max(
          asNumber(existing?.assets?.mimeAttachmentCount, 0),
          asArray(mailDocument?.mime?.parsed?.assets?.attachments).length
        ),
      },
      presentation: {
        previewText: pickText(
          mimePreferredBodyText,
          mailDocument?.previewText,
          extractPlainTextFromHtml(primaryBodyHtml),
          message?.bodyPreview,
          message?.preview
        ),
        conversationText:
          conversationText || asText(message?.body, asText(message?.bodyPreview)),
        conversationHtml: primaryBodyHtml || null,
      },
    };

    if (!existing) return derived;

    const existingPrimaryBodyText = asText(existing?.primaryBody?.text).trim();
    const existingPrimaryBodyHtml = asText(existing?.primaryBody?.html).trim();
    const existingConversationText = asText(
      existing?.presentation?.conversationText
    ).trim();
    const existingConversationHtml = asText(
      existing?.presentation?.conversationHtml
    ).trim();
    const existingPreviewText = asText(
      existing?.presentation?.previewText,
      existing?.previewText
    ).trim();
    const existingHasBody =
      Boolean(existingPrimaryBodyText || existingPrimaryBodyHtml) ||
      Boolean(existingConversationText || existingConversationHtml);
    const existingHasSecondarySections =
      Boolean(asText(existing?.signatureBlock?.text).trim()) ||
      asArray(existing?.quotedBlocks).some((block) => asText(block?.text).trim()) ||
      asArray(existing?.systemBlocks).some((block) => asText(block?.text).trim());
    const derivedHasBody = Boolean(
      asText(derived?.primaryBody?.text).trim() ||
        asText(derived?.primaryBody?.html).trim() ||
        asText(derived?.presentation?.conversationText).trim() ||
        asText(derived?.presentation?.conversationHtml).trim()
    );
    const derivedHasPreview = Boolean(
      asText(derived?.presentation?.previewText, derived?.previewText).trim()
    );
    const shouldPreferDerived =
      (derived?.mimeBacked === true &&
        existing?.mimeBacked !== true &&
        Boolean(asText(derived?.primaryBody?.html).trim()) &&
        !Boolean(existingPrimaryBodyHtml)) ||
      (!existingHasBody && derivedHasBody) ||
      (!existingHasBody &&
        !existingHasSecondarySections &&
        !existingPreviewText &&
        derivedHasPreview);
    const existingSignatureText = asText(existing?.signatureBlock?.text).trim();
    const derivedSignatureText = asText(derived?.signatureBlock?.text).trim();
    const mergedSignatureTruth = {
      ...(derived?.signatureBlock?.truth && typeof derived.signatureBlock.truth === "object"
        ? derived.signatureBlock.truth
        : {}),
      ...(existing?.signatureBlock?.truth && typeof existing.signatureBlock.truth === "object"
        ? existing.signatureBlock.truth
        : {}),
    };
    const mergedSignatureBlock =
      existingSignatureText || derivedSignatureText
        ? {
            ...(derived?.signatureBlock && typeof derived.signatureBlock === "object"
              ? derived.signatureBlock
              : {}),
            ...(existing?.signatureBlock && typeof existing.signatureBlock === "object"
              ? existing.signatureBlock
              : {}),
            text: asText(
              shouldPreferDerived ? derived?.signatureBlock?.text : existing?.signatureBlock?.text,
              existing?.signatureBlock?.text,
              derived?.signatureBlock?.text
            ),
            html:
              asText(
                shouldPreferDerived ? derived?.signatureBlock?.html : existing?.signatureBlock?.html,
                existing?.signatureBlock?.html,
                derived?.signatureBlock?.html
              ) || null,
            truth:
              Object.keys(mergedSignatureTruth).length > 0 ? mergedSignatureTruth : null,
          }
        : null;

    return {
      ...existing,
      version: asText(existing?.version, derived.version),
      kind: "mail_thread_message",
      sourceStore: asText(
        shouldPreferDerived ? derived.sourceStore : existing?.sourceStore,
        derived.sourceStore
      ),
      messageId: asText(existing?.messageId, derived.messageId),
      graphMessageId: asText(existing?.graphMessageId, derived.graphMessageId),
      conversationId: asText(existing?.conversationId, derived.conversationId),
      mailboxId: asText(existing?.mailboxId, derived.mailboxId),
      direction: asText(existing?.direction, derived.direction),
      role: asText(existing?.role, derived.role),
      sentAt: asText(existing?.sentAt, derived.sentAt),
      subject: asText(existing?.subject, derived.subject),
      previewText: asText(
        shouldPreferDerived ? derived.previewText : existing?.previewText,
        existing?.previewText,
        derived.previewText
      ),
      sourceDepth: asText(
        shouldPreferDerived ? derived.sourceDepth : existing?.sourceDepth,
        existing?.sourceDepth,
        derived.sourceDepth
      ),
      mimeAvailable: existing?.mimeAvailable === true || derived.mimeAvailable === true,
      mimeBacked:
        existing?.mimeBacked === true ||
        (shouldPreferDerived && derived.mimeBacked === true),
      mime:
        existing?.mime && typeof existing.mime === "object" ? existing.mime : derived.mime,
      primaryBody: {
        text: asText(
          shouldPreferDerived ? derived?.primaryBody?.text : existing?.primaryBody?.text,
          existing?.primaryBody?.text,
          derived?.primaryBody?.text
        ),
        html:
          asText(
            shouldPreferDerived ? derived?.primaryBody?.html : existing?.primaryBody?.html,
            existing?.primaryBody?.html,
            derived?.primaryBody?.html
          ) || null,
      },
      quotedBlocks: asArray(existing?.quotedBlocks).length
        ? existing.quotedBlocks
        : derived.quotedBlocks,
      signatureBlock: mergedSignatureBlock,
      systemBlocks: asArray(existing?.systemBlocks).length
        ? existing.systemBlocks
        : derived.systemBlocks,
      contentSections: {
        ...(derived?.contentSections && typeof derived.contentSections === "object"
          ? derived.contentSections
          : {}),
        ...(existing?.contentSections && typeof existing.contentSections === "object"
          ? existing.contentSections
          : {}),
        mode: asText(
          shouldPreferDerived ? derived?.contentSections?.mode : existing?.contentSections?.mode,
          existing?.contentSections?.mode,
          derived?.contentSections?.mode,
          "empty"
        ),
        source: asText(
          shouldPreferDerived ? derived?.contentSections?.source : existing?.contentSections?.source,
          existing?.contentSections?.source,
          derived?.contentSections?.source,
          "empty"
        ),
        mimePreferredBodyKind: asText(
          shouldPreferDerived
            ? derived?.contentSections?.mimePreferredBodyKind
            : existing?.contentSections?.mimePreferredBodyKind,
          existing?.contentSections?.mimePreferredBodyKind,
          derived?.contentSections?.mimePreferredBodyKind,
          "empty"
        ),
      },
      assets: {
        assetCount: Math.max(
          asNumber(existing?.assets?.assetCount, 0),
          asNumber(derived?.assets?.assetCount, 0)
        ),
        familyCounts: {
          attachment: Math.max(
            asNumber(existing?.assets?.familyCounts?.attachment, 0),
            asNumber(derived?.assets?.familyCounts?.attachment, 0)
          ),
          inline: Math.max(
            asNumber(existing?.assets?.familyCounts?.inline, 0),
            asNumber(derived?.assets?.familyCounts?.inline, 0)
          ),
          external: Math.max(
            asNumber(existing?.assets?.familyCounts?.external, 0),
            asNumber(derived?.assets?.familyCounts?.external, 0)
          ),
        },
        attachmentIds: mergeUniqueIds(
          asArray(existing?.assets?.attachmentIds),
          asArray(derived?.assets?.attachmentIds)
        ),
        inlineAssetIds: mergeUniqueIds(
          asArray(existing?.assets?.inlineAssetIds),
          asArray(derived?.assets?.inlineAssetIds)
        ),
        mimeInlineAssetCount: Math.max(
          asNumber(existing?.assets?.mimeInlineAssetCount, 0),
          asNumber(derived?.assets?.mimeInlineAssetCount, 0)
        ),
        mimeAttachmentCount: Math.max(
          asNumber(existing?.assets?.mimeAttachmentCount, 0),
          asNumber(derived?.assets?.mimeAttachmentCount, 0)
        ),
      },
      presentation: {
        previewText: asText(
          shouldPreferDerived
            ? derived?.presentation?.previewText
            : existing?.presentation?.previewText,
          existing?.presentation?.previewText,
          derived?.presentation?.previewText
        ),
        conversationText: asText(
          shouldPreferDerived
            ? derived?.presentation?.conversationText
            : existing?.presentation?.conversationText,
          existing?.presentation?.conversationText,
          derived?.presentation?.conversationText
        ),
        conversationHtml:
          asText(
            shouldPreferDerived
              ? derived?.presentation?.conversationHtml
              : existing?.presentation?.conversationHtml,
            existing?.presentation?.conversationHtml,
            derived?.presentation?.conversationHtml
          ) || null,
      },
    };
  }

  function buildClientThreadDocumentFromPreviewMessages(
    messages = [],
    { conversationId = "", customerEmail = "", sourceStore = "" } = {}
  ) {
    const canonicalEntries = asArray(messages)
      .map((message) => {
        const mailThreadMessage = buildClientMailThreadMessageFromEntry(message, {
          sourceStore,
        });
        if (!mailThreadMessage) return null;
        return {
          ...message,
          mailThreadMessage,
        };
      })
      .filter(Boolean);
    const canonicalMessages = canonicalEntries
      .map((message) => message.mailThreadMessage)
      .filter(Boolean)
      .slice()
      .sort((left, right) => String(right?.sentAt || "").localeCompare(String(left?.sentAt || "")));
    if (!canonicalMessages.length) return null;
    const firstEntry = canonicalEntries[0] || null;
    const firstMailDocument =
      firstEntry?.mailDocument && typeof firstEntry.mailDocument === "object"
        ? firstEntry.mailDocument
        : null;
    return {
      version: asText(canonicalMessages[0]?.version, "phase_3"),
      kind: "mail_thread_document",
      sourceStore: asText(
        canonicalMessages[0]?.sourceStore,
        asText(firstMailDocument?.sourceStore, asText(sourceStore, "client_preview_runtime"))
      ),
      conversationId:
        asText(
          conversationId,
          asText(canonicalMessages[0]?.conversationId, asText(firstEntry?.conversationId))
        ) || null,
      customerEmail: asText(customerEmail) || null,
      messageCount: canonicalMessages.length,
      latestMessageId: asText(canonicalMessages[0]?.messageId) || null,
      hasQuotedContent: canonicalMessages.some(
        (message) => asArray(message?.quotedBlocks).length > 0
      ),
      hasSignatureBlocks: canonicalMessages.some((message) =>
        asText(message?.signatureBlock?.text).trim()
      ),
      hasSystemBlocks: canonicalMessages.some(
        (message) => asArray(message?.systemBlocks).length > 0
      ),
      messages: canonicalMessages,
    };
  }

  function buildClientThreadDocumentFromHistoryMessages(
    messages = [],
    { conversationId = "", customerEmail = "" } = {}
  ) {
    return buildClientThreadDocumentFromPreviewMessages(messages, {
      conversationId,
      customerEmail,
      sourceStore: "client_history_runtime",
    });
  }

  function extractHistoryCustomerEmail(messages = [], mailboxIds = []) {
    const mailboxSet = new Set(
      asArray(mailboxIds)
        .map((item) => extractEmail(item))
        .filter(Boolean)
    );
    for (const message of asArray(messages)) {
      const candidates = [
        message?.customerEmail,
        message?.counterpartyEmail,
        message?.senderEmail,
        ...asArray(message?.replyToRecipients),
        ...asArray(message?.recipients),
      ];
      for (const candidate of candidates) {
        const email = extractEmail(candidate);
        if (!email || mailboxSet.has(email)) continue;
        return email;
      }
    }
    return "";
  }

  function deriveHistoryCustomerName(messages = [], mailboxIds = []) {
    const extractHistoryText = (value = "") =>
      asText(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
    const extractHistorySenderName = (value = "") => {
      const text = extractHistoryText(value);
      if (!text) return "";
      const matchers = [
        /\bFrån:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrom:\s*([^<\n]+?)\s*<[^>\n]+>/i,
        /\bFrån:\s*([^\n]+?)\s+(?:Datum:|Date:|Till:|To:|Ämne:|Subject:)/i,
        /\bFrom:\s*([^\n]+?)\s+(?:Date:|To:|Subject:)/i,
      ];
      for (const matcher of matchers) {
        const candidate = asText(text.match(matcher)?.[1]).trim();
        if (
          candidate &&
          !looksLikeMailboxIdentity(candidate) &&
          !isRuntimeUnknownCustomerName(candidate)
        ) {
          return candidate
            .replace(/\s+\|\s+Hair TP Clinic.*$/i, "")
            .replace(/\s+\|\s+.*$/i, "")
            .trim();
        }
      }
      return "";
    };
    for (const message of asArray(messages)) {
      const candidate =
        normalizeKey(message?.direction) === "outbound"
          ? asText(message?.counterpartyName)
          : asText(message?.senderName);
      if (
        candidate &&
        !looksLikeMailboxIdentity(candidate) &&
        !isRuntimeUnknownCustomerName(candidate)
      ) {
        return candidate;
      }
      const textDerivedCandidate = [
        extractHistorySenderName(message?.bodyPreview),
        extractHistorySenderName(message?.body),
        extractHistorySenderName(message?.detail),
        extractHistorySenderName(message?.summary),
        extractHistorySenderName(message?.bodyHtml),
      ].find(Boolean);
      if (textDerivedCandidate) return textDerivedCandidate;
      const subjectFallback = deriveRuntimeCustomerNameFromSubject(
        message?.subject || message?.normalizedSubject
      );
      if (subjectFallback) return subjectFallback;
    }
    return humanizeHistoryCounterpartyEmail(
      extractHistoryCustomerEmail(messages, mailboxIds)
    );
  }

  function deriveHistorySlaStatus(latestMessage, followUpDueAt = "") {
    const dueIso = toIso(followUpDueAt);
    if (dueIso) {
      const diffHours = (Date.parse(dueIso) - Date.now()) / (60 * 60 * 1000);
      if (diffHours <= 0) return "breach";
      if (diffHours <= 12) return "warning";
      return "safe";
    }
    if (normalizeKey(latestMessage?.direction) === "outbound") return "safe";
    const sentIso = toIso(latestMessage?.sentAt);
    if (!sentIso) return "safe";
    const ageHours = (Date.now() - Date.parse(sentIso)) / (60 * 60 * 1000);
    if (ageHours >= 72) return "breach";
    if (ageHours >= 24) return "warning";
    return "safe";
  }

  function deriveHistoryPriorityLevel({ slaStatus = "", messageCount = 0, latestMessage = null } = {}) {
    if (normalizeKey(slaStatus) === "breach") return "high";
    if (normalizeKey(slaStatus) === "warning") return "medium";
    if (messageCount >= 8) return "medium";
    if (normalizeKey(latestMessage?.direction) === "inbound") return "medium";
    return "low";
  }

  function deriveHistoryEngagementScore(messages = [], liveRow = null) {
    const liveScore = asNumber(liveRow?.customerSummary?.engagementScore, NaN);
    if (Number.isFinite(liveScore)) {
      return clamp(liveScore, 0, 1);
    }
    const messageCount = asArray(messages).length;
    return clamp(0.32 + Math.min(messageCount, 12) * 0.045, 0.28, 0.88);
  }

  function buildHistoryRuntimeEvents(events = [], fallback = {}) {
    return dedupeHistoryEvents(
      asArray(events).map((event) =>
        createHistoryEvent({
          title:
            asText(event?.title) ||
            (normalizeKey(event?.resultType) === "message"
              ? normalizeKey(event?.direction) === "outbound"
                ? "E-post skickat"
                : "E-post mottaget"
              : "Historikhändelse"),
          description: asText(
            event?.summary || event?.subject || event?.title,
            "Historikhändelse"
          ),
          detail: asText(
            event?.detail || event?.summary || event?.subject,
            "Ingen detalj tillgänglig."
          ),
          recordedAt: event?.recordedAt,
          mailboxId: event?.mailboxId || fallback.mailboxAddress,
          mailboxLabel:
            asText(event?.mailboxId)
              ? titleCaseMailbox(asText(event.mailboxId))
              : asText(fallback.mailboxLabel),
          conversationId: event?.conversationId || fallback.conversationId,
          resultType: event?.resultType || "action",
          type:
            event?.actionType ||
            event?.outcomeCode ||
            event?.direction ||
            event?.resultType ||
            "action",
        })
      )
    ).sort(compareHistoryEventsDesc);
  }

  function deriveHistoryThreadTags({
    liveRow = null,
    latestAction = null,
    latestMessage = null,
    slaStatus = "",
    priorityLevel = "",
    followUpDueAt = "",
  } = {}) {
    if (liveRow) {
      const liveTags = asArray(liveRow?.tags)
        .map((tag) => normalizeKey(tag))
        .filter(Boolean);
      const derivedTags = deriveRuntimeTags(liveRow);
      return Array.from(new Set([...liveTags, ...derivedTags]));
    }
    const tags = ["all"];
    const normalizedActionType = normalizeKey(latestAction?.actionType || "");
    const normalizedSla = normalizeKey(slaStatus);
    const normalizedPriority = normalizeKey(priorityLevel);
    if (normalizedActionType === "reply_later" || toIso(followUpDueAt)) {
      tags.push("later", "followup");
    }
    if (normalizedSla === "breach") {
      tags.push("act-now", "today", "high-risk");
    } else if (normalizedSla === "warning") {
      tags.push("today");
    }
    if (normalizedPriority === "high") {
      tags.push("sprint");
    }
    if (!asText(liveRow?.owner)) {
      tags.push("unassigned");
    }
    if (
      normalizedSla === "safe" &&
      normalizeKey(latestMessage?.direction) === "inbound" &&
      !tags.includes("act-now")
    ) {
      tags.push("sprint");
    }
    return Array.from(new Set(tags));
  }

  function getMailFoundationPreviewCandidates(value = {}) {
    const normalizeFoundationRole = (message = {}) => {
      const explicitRole = asText(message?.role).trim().toLowerCase();
      if (explicitRole) return explicitRole;
      return normalizeKey(message?.direction) === "outbound" ? "staff" : "customer";
    };
    const collectThreadMessageCandidates = (message = null) => {
      if (!message || typeof message !== "object") return [];
      return [
        message?.presentation?.previewText,
        message?.presentation?.conversationText,
        message?.primaryBody?.text,
      ].filter((candidate) => asText(candidate).trim());
    };
    const collectMailDocumentCandidates = (document = null) => {
      if (!document || typeof document !== "object") return [];
      return [document?.previewText, document?.primaryBodyText].filter((candidate) =>
        asText(candidate).trim()
      );
    };
    const collectThreadDocumentCandidates = (threadDocument = null) => {
      const messages = asArray(threadDocument?.messages);
      if (!messages.length) return [];
      const preferredMessage =
        messages.find((message) => {
          return (
            normalizeFoundationRole(message) === "customer" &&
            collectThreadMessageCandidates(message).length > 0
          );
        }) ||
        messages.find((message) => collectThreadMessageCandidates(message).length > 0) ||
        null;
      return collectThreadMessageCandidates(preferredMessage);
    };

    return [
      ...collectThreadDocumentCandidates(value?.threadDocument),
      ...collectThreadMessageCandidates(value?.mailThreadMessage),
      ...collectMailDocumentCandidates(value?.mailDocument),
      ...collectThreadMessageCandidates(value?.latestMessage?.mailThreadMessage),
      ...collectMailDocumentCandidates(value?.latestMessage?.mailDocument),
      ...collectThreadMessageCandidates(value?.conversation?.mailThreadMessage),
      ...collectMailDocumentCandidates(value?.conversation?.mailDocument),
    ];
  }

  function resolveRuntimePreviewText(value = {}, { additionalCandidates = [], fallback = "" } = {}) {
    const extractPreviewTextFromHtml = (input = "") => {
      const html = asText(input).trim();
      if (!html) return "";
      return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
          const parsed = Number.parseInt(code, 16);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/&#([0-9]+);/g, (_, code) => {
          const parsed = Number.parseInt(code, 10);
          return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
        })
        .replace(/\s+/g, " ")
        .trim();
    };
    const sanitizePreviewText = (input = "") =>
      asText(input)
        .replace(/\s+/g, " ")
        .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
        .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
        .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
        .replace(/^Get more done with apps like Word\.?\s*/i, "")
        .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
        .replace(/^Read more about why this is important\.?\s*/i, "")
        .replace(/^[\s_—–-]{6,}/, "")
        .trim();

    return (
      [
        ...asArray(additionalCandidates),
        ...getMailFoundationPreviewCandidates(value?.latestInbound),
        ...getMailFoundationPreviewCandidates(value),
        value?.latestInbound?.bodyPreview,
        value?.latestInbound?.body,
        value?.latestInbound?.detail,
        value?.latestInbound?.summary,
        value?.latestInboundPreview,
        value?.preview,
        value?.systemPreview,
        value?.latestPreview,
        value?.bodyPreview,
        value?.detail,
        value?.summary,
        value?.latestMessage?.preview,
        value?.latestMessage?.bodyPreview,
        extractPreviewTextFromHtml(value?.latestMessage?.bodyHtml),
        value?.latestMessage?.body,
        value?.latestMessage?.detail,
        value?.latestMessage?.summary,
        value?.conversation?.preview,
        value?.conversation?.bodyPreview,
        extractPreviewTextFromHtml(value?.conversation?.bodyHtml),
        value?.conversation?.detail,
        value?.conversation?.summary,
        extractPreviewTextFromHtml(value?.bodyHtml),
        value?.customerSummary?.lastCaseSummary,
      ]
        .map((candidate) => sanitizePreviewText(candidate))
      .find((candidate) => candidate && !isRuntimePlaceholderLine(candidate)) || asText(fallback)
    );
  }

  function resolveRuntimeQueuePreviewText(value = "", { fallback = "" } = {}) {
    const sanitized = asText(value)
      .replace(/\s+/g, " ")
      .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
      .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
      .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
      .replace(/^Get more done with apps like Word\.?\s*/i, "")
      .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
      .replace(/^Read more about why this is important\.?\s*/i, "")
      .replace(/^hur kan vi hjälpa dig med\s+/i, "Vill ha hjälp med ")
      .replace(/^hur kan jag få hjälp med\s+/i, "Vill ha hjälp med ")
      .replace(/^kan ni hjälpa mig med\s+/i, "Vill ha hjälp med ")
      .replace(/^hur kan vi hjälpa dig\??\s*/i, "")
      .replace(/^hur kan jag få hjälp\??\s*/i, "")
      .replace(/^kan ni hjälpa mig\??\s*/i, "")
      .replace(/^(?:hej|hello|hi)\b[,!:\-\s]*/i, "")
      .replace(/^[\s_—–-]{6,}/, "")
      .replace(/^\s*[–—-]\s*/, "")
      .trim();
    const resolved = compactRuntimeCopy(sanitized, "", 104);
    if (resolved && !isRuntimePlaceholderLine(resolved)) {
      return resolved;
    }
    return compactRuntimeCopy(asText(fallback), "Ingen senaste kundsignal ännu.", 104);
  }

  function cloneIdentityEnvelope(value = null) {
    const safeValue = value && typeof value === "object" ? value : {};
    const customerIdentity = asObject(safeValue.customerIdentity || safeValue.identity);
    const hardConflictSignals = asArray(safeValue.hardConflictSignals).filter(
      (item) => item !== null && item !== undefined
    );
    const mergeReviewDecisionsByPairId = asObject(safeValue.mergeReviewDecisionsByPairId);
    const identityProvenance = asObject(safeValue.identityProvenance || safeValue.provenance);

    return {
      customerIdentity: Object.keys(customerIdentity).length ? cloneJson(customerIdentity) : null,
      hardConflictSignals: hardConflictSignals.length ? cloneJson(hardConflictSignals) : [],
      mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
        ? cloneJson(mergeReviewDecisionsByPairId)
        : {},
      identityProvenance: Object.keys(identityProvenance).length ? cloneJson(identityProvenance) : null,
    };
  }

  function buildHistoryBackedRuntimeRow({
    conversationId,
    messages = [],
    events = [],
    liveRow = null,
  } = {}) {
    const sortedMessages = asArray(messages).slice().sort(compareHistoryEventsDesc);
    const sortedEvents = asArray(events).slice().sort(compareHistoryEventsDesc);
    const latestMessage = sortedMessages[0] || null;
    const latestInbound = sortedMessages.find(
      (message) => normalizeKey(message?.direction) !== "outbound"
    );
    const latestOutbound = sortedMessages.find(
      (message) => normalizeKey(message?.direction) === "outbound"
    );
    const latestAction = sortedEvents.find(
      (event) => normalizeKey(event?.resultType) === "action"
    );
    const latestOutcome = sortedEvents.find(
      (event) => normalizeKey(event?.resultType) === "outcome"
    );
    const identityEnvelope = (() => {
      const cloneEnvelope = (candidate) => {
        const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
        const customerIdentity =
          safeCandidate.customerIdentity && typeof safeCandidate.customerIdentity === "object"
            ? safeCandidate.customerIdentity
            : safeCandidate.identity && typeof safeCandidate.identity === "object"
              ? safeCandidate.identity
              : null;
        const hardConflictSignals = Array.isArray(safeCandidate.hardConflictSignals)
          ? safeCandidate.hardConflictSignals.filter((item) => item !== null && item !== undefined)
          : [];
        const mergeReviewDecisionsByPairId =
          safeCandidate.mergeReviewDecisionsByPairId &&
          typeof safeCandidate.mergeReviewDecisionsByPairId === "object"
            ? safeCandidate.mergeReviewDecisionsByPairId
            : {};
        const identityProvenance =
          safeCandidate.identityProvenance && typeof safeCandidate.identityProvenance === "object"
            ? safeCandidate.identityProvenance
            : safeCandidate.provenance && typeof safeCandidate.provenance === "object"
              ? safeCandidate.provenance
              : null;
        return {
          customerIdentity: customerIdentity ? JSON.parse(JSON.stringify(customerIdentity)) : null,
          hardConflictSignals: hardConflictSignals.length
            ? JSON.parse(JSON.stringify(hardConflictSignals))
            : [],
          mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
            ? JSON.parse(JSON.stringify(mergeReviewDecisionsByPairId))
            : {},
          identityProvenance: identityProvenance
            ? JSON.parse(JSON.stringify(identityProvenance))
            : null,
        };
      };
      const candidateSources = [
        liveRow?.customerIdentity,
        liveRow?.identity,
        liveRow?.customerSummary?.customerIdentity,
        liveRow?.customerSummary?.identity,
        latestMessage?.customerIdentity,
        latestMessage?.identity,
        latestAction?.customerIdentity,
        latestAction?.identity,
        latestOutcome?.customerIdentity,
        latestOutcome?.identity,
      ];
      for (const candidate of candidateSources) {
        if (candidate && typeof candidate === "object") {
          const carried = cloneEnvelope(candidate);
          if (
            carried.customerIdentity ||
            carried.hardConflictSignals.length > 0 ||
            Object.keys(carried.mergeReviewDecisionsByPairId || {}).length > 0 ||
            carried.identityProvenance
          ) {
            return carried;
          }
        }
      }
      return cloneEnvelope(null);
    })();
    const customerIdentity =
      identityEnvelope.customerIdentity ||
      liveRow?.customerSummary?.customerIdentity ||
      liveRow?.customerIdentity ||
      latestMessage?.customerIdentity ||
      latestAction?.customerIdentity ||
      latestOutcome?.customerIdentity ||
      null;
    const hardConflictSignals =
      identityEnvelope.hardConflictSignals?.length
        ? identityEnvelope.hardConflictSignals
        : liveRow?.customerSummary?.hardConflictSignals ||
          liveRow?.hardConflictSignals ||
          latestMessage?.hardConflictSignals ||
          latestAction?.hardConflictSignals ||
          latestOutcome?.hardConflictSignals ||
          [];
    const mergeReviewDecisionsByPairId =
      identityEnvelope.mergeReviewDecisionsByPairId &&
      Object.keys(identityEnvelope.mergeReviewDecisionsByPairId).length
        ? identityEnvelope.mergeReviewDecisionsByPairId
        : liveRow?.customerSummary?.mergeReviewDecisionsByPairId ||
          liveRow?.mergeReviewDecisionsByPairId ||
          latestMessage?.mergeReviewDecisionsByPairId ||
          latestAction?.mergeReviewDecisionsByPairId ||
          latestOutcome?.mergeReviewDecisionsByPairId ||
          {};
    const identityProvenance =
      identityEnvelope.identityProvenance ||
      liveRow?.customerSummary?.identityProvenance ||
      liveRow?.identityProvenance ||
      latestMessage?.identityProvenance ||
      latestAction?.identityProvenance ||
      latestOutcome?.identityProvenance ||
      null;
    const mailboxIds = Array.from(
      new Set(
        sortedMessages
          .map((message) =>
            asText(message?.mailboxId || message?.mailboxAddress || message?.userPrincipalName).toLowerCase()
          )
          .filter(Boolean)
      )
    );
    const preferredMailboxAddress = asText(
      liveRow?.mailboxAddress || liveRow?.mailboxId || liveRow?.userPrincipalName
    ).toLowerCase();
    const mailboxAddress =
      preferredMailboxAddress || mailboxIds[0] || "kons@hairtpclinic.com";
    const customerEmail =
      extractHistoryCustomerEmail(sortedMessages, mailboxIds) || extractCustomerEmail(liveRow || {});
    const customerName =
      deriveHistoryCustomerName(sortedMessages, mailboxIds) ||
      getRuntimeCustomerName(liveRow || {});
    const latestPreview = resolveRuntimePreviewText(
      {
        ...(liveRow && typeof liveRow === "object" ? liveRow : {}),
        latestInbound,
        latestMessage,
      },
      { fallback: "Ingen förhandsvisning tillgänglig." }
    );
    const followUpDueAt = asText(
      liveRow?.followUpDueAt ||
        liveRow?.followUpSuggestedAt ||
        latestAction?.followUpDueAt
    );
    const waitingOn = asText(
      latestAction?.waitingOn,
      normalizeKey(latestMessage?.direction) === "outbound" ? "customer" : "owner"
    );
    const slaStatus = asText(
      liveRow?.slaStatus,
      deriveHistorySlaStatus(latestMessage, followUpDueAt)
    );
    const priorityLevel = asText(
      liveRow?.priorityLevel,
      deriveHistoryPriorityLevel({
        slaStatus,
        messageCount: sortedMessages.length,
        latestMessage,
      })
    );
    const customerSummary = {
      ...(liveRow?.customerSummary && typeof liveRow.customerSummary === "object"
        ? liveRow.customerSummary
        : {}),
      customerKey: asText(
        liveRow?.customerSummary?.customerKey ||
          liveRow?.customerKey ||
          customerEmail ||
          ""
      ),
      customerName,
      customerIdentity,
      hardConflictSignals,
      mergeReviewDecisionsByPairId,
      identityProvenance,
      lifecycleStatus: asText(
        liveRow?.customerSummary?.lifecycleStatus,
        followUpDueAt ? "follow_up_pending" : "active_dialogue"
      ),
      interactionCount: Math.max(
        sortedMessages.length,
        asNumber(liveRow?.customerSummary?.interactionCount, 0),
        1
      ),
      historyMessageCount: Math.max(
        sortedMessages.length,
        asNumber(liveRow?.customerSummary?.historyMessageCount, 0),
        1
      ),
      historyMailboxIds:
        mailboxIds.length > 0
          ? mailboxIds
          : asArray(liveRow?.customerSummary?.historyMailboxIds),
      lastCaseSummary: latestPreview,
      historySignalSummary: compactRuntimeCopy(
        latestOutcome?.summary ||
          latestAction?.summary ||
          liveRow?.customerSummary?.historySignalSummary ||
          latestPreview,
        "Historiksignal saknas ännu.",
        120
      ),
      historySignalActionCue: compactRuntimeCopy(
        latestAction?.nextActionSummary ||
          latestOutcome?.recommendedAction ||
          liveRow?.customerSummary?.historySignalActionCue ||
          (normalizeKey(latestMessage?.direction) === "outbound"
            ? "Invänta nästa svar från kunden eller planera uppföljning."
            : "Öppna tråden och ta nästa tydliga steg."),
        "Håll nästa steg tydligt och konkret.",
        120
      ),
      engagementScore: deriveHistoryEngagementScore(sortedMessages, liveRow),
      caseCount: Math.max(asNumber(liveRow?.customerSummary?.caseCount, 0), 1),
    };
    const baseRow = {
      ...(liveRow && typeof liveRow === "object" ? liveRow : {}),
      conversationId: asText(conversationId),
      messageId: asText(latestMessage?.messageId, asText(liveRow?.messageId, `${conversationId}-history`)),
      mailboxId: mailboxAddress,
      mailboxAddress,
      userPrincipalName: mailboxAddress,
      customerKey: customerSummary.customerKey,
      customerIdentity: customerSummary.customerIdentity,
      hardConflictSignals: customerSummary.hardConflictSignals,
      mergeReviewDecisionsByPairId: customerSummary.mergeReviewDecisionsByPairId,
      identityProvenance: customerSummary.identityProvenance,
      subject: asText(latestMessage?.subject, asText(liveRow?.subject, "(utan ämne)")),
      sender: customerEmail || customerName,
      senderName: customerName,
      customerEmail,
      preview: latestPreview,
      bodyPreview: latestPreview,
      latestInboundPreview: latestPreview,
      lastInboundAt: asText(latestInbound?.sentAt, asText(liveRow?.lastInboundAt)),
      lastOutboundAt: asText(latestOutbound?.sentAt, asText(liveRow?.lastOutboundAt)),
      slaStatus,
      priorityLevel,
      waitingOn,
      intent: asText(liveRow?.intent, asText(latestOutcome?.intent, asText(latestAction?.intent, "unclear"))),
      recommendedAction: asText(
        latestOutcome?.recommendedAction ||
          latestAction?.nextActionSummary ||
          liveRow?.recommendedAction,
        normalizeKey(latestMessage?.direction) === "outbound"
          ? "Invänta svar eller planera uppföljning."
          : "Svara kunden och ta nästa tydliga steg."
      ),
      recommendedActionLabel: asText(
        latestAction?.nextActionLabel || liveRow?.recommendedActionLabel,
        normalizeKey(latestMessage?.direction) === "outbound" ? "Invänta svar" : "Svara nu"
      ),
      riskStackExplanation: asText(
        liveRow?.riskStackExplanation,
        compactRuntimeCopy(
          latestOutcome?.detail ||
            latestAction?.summary ||
            (normalizeKey(latestMessage?.direction) === "outbound"
              ? "Senaste händelsen i tråden var ett utgående svar från kliniken."
              : "Senaste händelsen i tråden var ett inkommande mail från kunden."),
          "Ingen dominant risk identifierad.",
          140
        )
      ),
      operatorCue: asText(
        liveRow?.operatorCue,
        latestAction?.nextActionSummary || latestOutcome?.summary || ""
      ),
      owner: asText(liveRow?.owner, "Oägd"),
      followUpDueAt,
      workflowLane: asText(
        liveRow?.workflowLane,
        normalizeKey(latestAction?.actionType) === "reply_later" || followUpDueAt
          ? "waiting_reply"
          : normalizeKey(slaStatus) === "breach"
            ? "action_now"
            : ""
      ),
      bookingState: asText(liveRow?.bookingState),
      hasUnreadInbound:
        liveRow?.hasUnreadInbound === true ||
        (normalizeKey(latestInbound?.direction) !== "outbound" && latestInbound?.isRead === false),
      isUnanswered:
        normalizeKey(latestMessage?.direction) !== "outbound" ||
        liveRow?.isUnanswered === true,
      lastActionTakenLabel: asText(
        liveRow?.lastActionTakenLabel,
        asText(latestAction?.title)
      ),
      lastActionTakenAt: asText(
        liveRow?.lastActionTakenAt,
        asText(latestAction?.recordedAt)
      ),
      dominantRisk: asText(liveRow?.dominantRisk, asText(latestOutcome?.dominantRisk)),
      rowFamily:
        typeof classifyRuntimeRowFamily === "function"
          ? classifyRuntimeRowFamily({
              ...(liveRow && typeof liveRow === "object" ? liveRow : {}),
              subject: asText(latestMessage?.subject, asText(liveRow?.subject, "(utan ämne)")),
              latestInboundPreview: latestPreview,
              mailboxAddress,
              senderName: customerName,
            })
          : "human_mail",
      customerSummary,
    };
    baseRow.tags = deriveHistoryThreadTags({
      liveRow,
      latestAction,
      latestMessage,
      slaStatus,
      priorityLevel,
      followUpDueAt,
    });
    return baseRow;
  }

  function deriveRuntimeRelevantActivityAt(
    row = {},
    { canonicalMessages = [], historyEvents = [] } = {}
  ) {
    const candidateIsos = [
      asText(canonicalMessages[0]?.sentAt),
      asText(row?.lastActionTakenAt),
      asText(row?.lastInboundAt),
      asText(row?.lastOutboundAt),
      asText(row?.latestMessageAt),
      asText(row?.lastActivityAt),
      ...asArray(historyEvents).map((event) =>
        asText(event?.recordedAt || event?.ts || event?.sentAt)
      ),
    ]
      .map((value) => toIso(value))
      .filter(Boolean)
      .sort((left, right) => right.localeCompare(left));
    return candidateIsos[0] || "";
  }

  function resolveRuntimeFoundationState(
    thread = null,
    { threadDocument = null, messages = [] } = {}
  ) {
    const safeThread = thread && typeof thread === "object" ? thread : null;
    const safeThreadDocument =
      threadDocument && typeof threadDocument === "object"
        ? threadDocument
        : safeThread?.threadDocument && typeof safeThread.threadDocument === "object"
          ? safeThread.threadDocument
          : safeThread?.raw?.threadDocument && typeof safeThread.raw.threadDocument === "object"
            ? safeThread.raw.threadDocument
            : null;
    const safeMessages = asArray(messages).length > 0 ? asArray(messages) : asArray(safeThread?.messages);
    const existingFoundationState =
      safeThread?.foundationState && typeof safeThread.foundationState === "object"
        ? safeThread.foundationState
        : null;

    const normalizeResolvedFoundationState = (candidate = null) => {
      if (!candidate || typeof candidate !== "object") return null;
      const source = asText(candidate?.source);
      const messageCount = asNumber(candidate?.messageCount, 0);
      if (!normalizeKey(source) && messageCount <= 0) return null;
      return {
        source: source || "thread_document",
        label: asText(candidate?.label, "Mail foundation"),
        messageCount,
        hasQuotedContent: candidate?.hasQuotedContent === true,
        hasSignatureBlocks: candidate?.hasSignatureBlocks === true,
        hasSystemBlocks: candidate?.hasSystemBlocks === true,
        truthDriven: candidate?.truthDriven === true,
        foundationDriven: candidate?.foundationDriven !== false,
        fallbackDriven: candidate?.fallbackDriven === true ? true : false,
      };
    };

    const resolvedExistingFoundationState = normalizeResolvedFoundationState(existingFoundationState);
    if (resolvedExistingFoundationState) return resolvedExistingFoundationState;

    const latestMessage =
      safeMessages.find((message) => message?.latest === true) || safeMessages[0] || null;
    const latestMailDocument =
      latestMessage?.mailDocument && typeof latestMessage.mailDocument === "object"
        ? latestMessage.mailDocument
        : null;
    const latestMailThreadMessage =
      latestMessage?.mailThreadMessage && typeof latestMessage.mailThreadMessage === "object"
        ? latestMessage.mailThreadMessage
        : null;
    const threadDocumentMessageCount = asArray(safeThreadDocument?.messages).length;
    const messageCount = Math.max(threadDocumentMessageCount, safeMessages.length);
    const source =
      asText(safeThreadDocument?.sourceStore) ||
      asText(safeThreadDocument?.source) ||
      asText(latestMailDocument?.sourceStore) ||
      asText(latestMailThreadMessage?.sourceStore) ||
      "";
    const hasCanonicalEvidence = Boolean(
      (safeThreadDocument &&
        (normalizeKey(source) || threadDocumentMessageCount > 0)) ||
        (latestMailDocument &&
          (normalizeKey(latestMailDocument?.sourceStore) ||
            asText(latestMailDocument?.previewText).trim().length > 0 ||
            asText(latestMailDocument?.primaryBodyText).trim().length > 0)) ||
        (latestMailThreadMessage &&
          (normalizeKey(latestMailThreadMessage?.sourceStore) ||
            asText(latestMailThreadMessage?.presentation?.previewText).trim().length > 0 ||
            asText(latestMailThreadMessage?.presentation?.conversationText).trim().length > 0 ||
            asText(latestMailThreadMessage?.primaryBody?.text).trim().length > 0 ||
            asText(latestMailThreadMessage?.primaryBody?.html).trim().length > 0))
    );

    if (!hasCanonicalEvidence) return null;

    const hasQuotedContent =
      safeThreadDocument?.hasQuotedContent === true ||
      asArray(safeThreadDocument?.messages).some(
        (message) =>
          asArray(message?.quotedBlocks).length > 0 ||
          asArray(message?.mailThreadMessage?.quotedBlocks).length > 0 ||
          asArray(message?.mailDocument?.quotedBlocks).length > 0
      );
    const hasSignatureBlocks =
      safeThreadDocument?.hasSignatureBlocks === true ||
      asArray(safeThreadDocument?.messages).some(
        (message) =>
          asText(message?.signatureBlock?.html).trim().length > 0 ||
          asText(message?.mailThreadMessage?.signatureBlock?.html).trim().length > 0
      );
    const hasSystemBlocks =
      safeThreadDocument?.hasSystemBlocks === true ||
      asArray(safeThreadDocument?.messages).some(
        (message) =>
          asArray(message?.systemBlocks).length > 0 ||
          asArray(message?.mailThreadMessage?.systemBlocks).length > 0
      );

    return {
      source: source || "thread_document",
      label: "Mail foundation",
      messageCount,
      hasQuotedContent,
      hasSignatureBlocks,
      hasSystemBlocks,
      truthDriven: false,
      foundationDriven: true,
      fallbackDriven: false,
    };
  }

  function buildRuntimeThread(row, { feedEntries = [], historyEvents = [], threadDocument = null } = {}) {
    const customerName = getRuntimeCustomerNameFromFeedEntries(feedEntries, getRuntimeCustomerName(row));
    const customerEmail = extractCustomerEmail(row);
    const identityEnvelope = (() => {
      const cloneEnvelope = (candidate) => {
        const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
        const customerIdentity =
          safeCandidate.customerIdentity && typeof safeCandidate.customerIdentity === "object"
            ? safeCandidate.customerIdentity
            : safeCandidate.identity && typeof safeCandidate.identity === "object"
              ? safeCandidate.identity
              : null;
        const hardConflictSignals = Array.isArray(safeCandidate.hardConflictSignals)
          ? safeCandidate.hardConflictSignals.filter((item) => item !== null && item !== undefined)
          : [];
        const mergeReviewDecisionsByPairId =
          safeCandidate.mergeReviewDecisionsByPairId &&
          typeof safeCandidate.mergeReviewDecisionsByPairId === "object"
            ? safeCandidate.mergeReviewDecisionsByPairId
            : {};
        const identityProvenance =
          safeCandidate.identityProvenance && typeof safeCandidate.identityProvenance === "object"
            ? safeCandidate.identityProvenance
            : safeCandidate.provenance && typeof safeCandidate.provenance === "object"
              ? safeCandidate.provenance
              : null;
        return {
          customerIdentity: customerIdentity ? JSON.parse(JSON.stringify(customerIdentity)) : null,
          hardConflictSignals: hardConflictSignals.length
            ? JSON.parse(JSON.stringify(hardConflictSignals))
            : [],
          mergeReviewDecisionsByPairId: Object.keys(mergeReviewDecisionsByPairId).length
            ? JSON.parse(JSON.stringify(mergeReviewDecisionsByPairId))
            : {},
          identityProvenance: identityProvenance
            ? JSON.parse(JSON.stringify(identityProvenance))
            : null,
        };
      };
      const candidateSources = [
        row?.customerIdentity,
        row?.identity,
        row?.customerSummary?.customerIdentity,
        row?.customerSummary?.identity,
        threadDocument?.customerIdentity,
        threadDocument?.identity,
      ];
      for (const candidate of candidateSources) {
        if (candidate && typeof candidate === "object") {
          const carried = cloneEnvelope(candidate);
          if (
            carried.customerIdentity ||
            carried.hardConflictSignals.length > 0 ||
            Object.keys(carried.mergeReviewDecisionsByPairId || {}).length > 0 ||
            carried.identityProvenance
          ) {
            return carried;
          }
        }
      }
      return cloneEnvelope(null);
    })();
    const customerKey = asText(
      row?.customerKey ||
        row?.customerSummary?.customerKey ||
        identityEnvelope.customerIdentity?.canonicalCustomerId ||
        identityEnvelope.customerIdentity?.canonicalContactId ||
        ""
    );
    const mailboxAddress = asText(row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName);
    const ownerName = asText(row?.owner, "Oägd");
    const rawSubject = asText(row?.subject, "(utan ämne)");
    const lifecycleLabel = mapRuntimeLifecycleLabel(row);
    const waitingLabel = mapRuntimeWaitingLabel(row);
    const statusLabel = mapRuntimeStatusLabel(row);
    const riskLabel = mapRuntimeRiskLabel(row);
    const riskReason = compactRuntimeCopy(
      row?.riskStackExplanation,
      row?.recommendedAction || "Ingen dominant risk identifierad.",
      96
    );
    const followUpLabel = row?.followUpDueAt || row?.followUpSuggestedAt
      ? formatDueLabel(row?.followUpDueAt || row?.followUpSuggestedAt)
      : "";
    const followUpAgingState = deriveFollowUpAgingState(row);
    const messages = buildPreviewMessages(row, feedEntries, threadDocument);
    const resolvedThreadDocument =
      threadDocument && typeof threadDocument === "object"
        ? normalizeThreadDocumentMessageOrder(threadDocument)
        : buildClientThreadDocumentFromPreviewMessages(messages, {
            conversationId: asText(row?.conversationId),
            customerEmail,
            sourceStore: "client_preview_runtime",
          });
    const canonicalThreadMessages = asArray(resolvedThreadDocument?.messages);
    const resolvedHistoryEvents = historyEvents.length
      ? historyEvents
      : buildHistoryEvents(row, feedEntries);
    const latestRelevantActivityAt = deriveRuntimeRelevantActivityAt(row, {
      canonicalMessages: canonicalThreadMessages,
      historyEvents: resolvedHistoryEvents,
    });
    const engagementScore = clamp(
      asNumber(row?.customerSummary?.engagementScore, 0.42),
      0,
      1
    );
    const displaySubject = buildRuntimeDisplaySubject({ ...row, subject: rawSubject }, customerName);
    const displayOwnerLabel = mapRuntimeDisplayOwnerLabel(ownerName);
    const displayEngagementLabel = mapRuntimeDisplayEngagementLabel(engagementScore);
    const latestCustomerPreview = asText(
      asArray(messages).find(
        (message) =>
          normalizeKey(message?.role) === "customer" &&
          !isRuntimePlaceholderLine(message?.body)
      )?.body
    );
    const latestCanonicalInboundPreview =
      resolvedThreadDocument && typeof resolvedThreadDocument === "object"
        ? [
            asArray(messages).find(
              (message) =>
                normalizeKey(message?.role) === "customer" &&
                !isRuntimePlaceholderLine(message?.body)
            )?.body,
            asArray(messages).find(
              (message) =>
                normalizeKey(message?.role) === "customer" &&
                !isRuntimePlaceholderLine(message?.conversationBody)
            )?.conversationBody,
          ]
            .map((value) =>
              resolveRuntimePreviewText({}, { additionalCandidates: [value], fallback: "" })
            )
            .find((value) => value && !isRuntimePlaceholderLine(value))
        : "";
    const preview = resolveRuntimePreviewText(
      {
        ...row,
        threadDocument: resolvedThreadDocument,
      },
      {
        additionalCandidates: [latestCanonicalInboundPreview, latestCustomerPreview],
        fallback: "Ingen förhandsvisning tillgänglig.",
      }
    );
    const latestInboundThreadDocumentMessage = asArray(resolvedThreadDocument?.messages).find(
      (message) => normalizeKey(message?.direction) !== "outbound"
    );
    const queuePreviewFromThreadDocument = resolveRuntimePreviewText(
      {},
      {
        additionalCandidates: [
          latestInboundThreadDocumentMessage?.presentation?.previewText,
          latestInboundThreadDocumentMessage?.presentation?.conversationText,
          latestInboundThreadDocumentMessage?.primaryBody?.text,
          latestInboundThreadDocumentMessage?.mailDocument?.previewText,
          latestInboundThreadDocumentMessage?.mailDocument?.primaryBodyText,
        ],
        fallback: "",
      }
    );
    const queuePreviewText = resolveRuntimeQueuePreviewText(queuePreviewFromThreadDocument || preview, {
      fallback: "Ingen senaste kundsignal ännu.",
    });
    const latestInboundPreview = preview;
    const normalizedMessages = messages.map((message, index) => {
      const nextMessage = { ...message };
      if (
        normalizeKey(nextMessage?.role) === "customer" &&
        isRuntimeUnknownCustomerName(nextMessage?.author) &&
        !isRuntimeUnknownCustomerName(customerName)
      ) {
        nextMessage.author = customerName;
      }
      if (
        index === 0 &&
        isRuntimePlaceholderLine(nextMessage?.body) &&
        preview &&
        !isRuntimePlaceholderLine(preview)
      ) {
        nextMessage.body = preview;
      }
      return nextMessage;
    });
    const foundationState = resolveRuntimeFoundationState(null, {
      threadDocument: resolvedThreadDocument,
      messages: normalizedMessages,
    });
    const rowFamily =
      typeof classifyRuntimeRowFamily === "function"
        ? classifyRuntimeRowFamily({
            ...row,
            preview,
            latestInboundPreview: preview,
          })
        : "human_mail";
    const nextActionSummary = compactRuntimeCopy(
      row?.operatorCue ||
        row?.customerSummary?.historySignalActionCue ||
        followUpAgingState.detail ||
        row?.customerSummary?.lastCaseSummary ||
        preview,
      "Granska tråden och ta nästa tydliga steg.",
      124
    );
    const whyInFocus = compactRuntimeCopy(
      row?.riskStackExplanation ||
        row?.operatorCue ||
        row?.customerSummary?.historySignalSummary ||
        followUpAgingState.detail ||
        preview,
      "Aktiv konversation kräver uppföljning.",
      124
    );
    const mailboxes = buildMailboxCatalog([row], {
      sourceMailboxIds:
        asArray(row?.customerSummary?.historyMailboxIds).length > 0
          ? row.customerSummary.historyMailboxIds
          : [mailboxAddress],
    });
    const mailboxProvenanceDetail = mailboxes.length > 1 ? mailboxes.map((item) => item.label).join(" · ") : "";
    const mailboxProvenanceLabel = mailboxes.length > 1 ? `${mailboxes.length} mailboxar` : "";
    const runtimeTags = Array.from(
      new Set(
        (
          asArray(row?.tags).length > 0
            ? asArray(row.tags).map((tag) => asText(tag).trim()).filter(Boolean)
            : deriveRuntimeTags(row)
        ).filter(Boolean)
      )
    );
    if (followUpAgingState.label) {
      runtimeTags.push("followup", "today");
    }
    const thread = {
      id: asText(row?.conversationId),
      subject: rawSubject,
      displaySubject,
      customerName,
      customerEmail,
      customerKey,
      customerIdentity:
        identityEnvelope.customerIdentity ||
        row?.customerSummary?.customerIdentity ||
        row?.customerIdentity ||
        threadDocument?.customerIdentity ||
        threadDocument?.identity ||
        null,
      hardConflictSignals:
        identityEnvelope.hardConflictSignals?.length
          ? identityEnvelope.hardConflictSignals
          : row?.customerSummary?.hardConflictSignals ||
            row?.hardConflictSignals ||
            threadDocument?.hardConflictSignals ||
            [],
      mergeReviewDecisionsByPairId:
        identityEnvelope.mergeReviewDecisionsByPairId &&
        Object.keys(identityEnvelope.mergeReviewDecisionsByPairId).length
          ? identityEnvelope.mergeReviewDecisionsByPairId
          : row?.customerSummary?.mergeReviewDecisionsByPairId ||
            row?.mergeReviewDecisionsByPairId ||
            threadDocument?.mergeReviewDecisionsByPairId ||
            {},
      identityProvenance:
        identityEnvelope.identityProvenance ||
        row?.customerSummary?.identityProvenance ||
        row?.identityProvenance ||
        threadDocument?.identityProvenance ||
        threadDocument?.provenance ||
        null,
      crossMailboxProvenanceEvidence:
        row?.crossMailboxProvenanceEvidence === true ||
        asArray(row?.sourceRows).length > 1 ||
        asArray(row?.sourceConversationIds).length > 1,
      mailboxAddress,
      mailboxLabel: titleCaseMailbox(mailboxAddress),
      ownerLabel: ownerName,
      displayOwnerLabel,
      ownerKey:
        normalizeKey(ownerName) === "oägd" || !normalizeKey(ownerName)
          ? "unassigned"
          : normalizeKey(ownerName),
      lifecycleLabel,
      waitingLabel,
      statusLabel,
      riskLabel,
      riskReason,
      followUpLabel,
      followUpAgeLabel: followUpAgingState.label,
      followUpAgeTone: followUpAgingState.tone,
      followUpAgeDetail: followUpAgingState.detail,
      followUpAgeActionLabel: followUpAgingState.actionLabel,
      preview,
      queuePreviewText,
      rowFamily,
      lastActivityLabel: formatListTime(
        latestRelevantActivityAt || row?.lastInboundAt || row?.lastOutboundAt
      ),
      lastActivityAt: toIso(
        latestRelevantActivityAt || row?.lastInboundAt || row?.lastOutboundAt
      ),
      unread: row?.hasUnreadInbound === true,
      isUnread: row?.hasUnreadInbound === true,
      needsReply: row?.isUnanswered === true,
      isVerificationThread: isVerificationRuntimeThread({
        subject: rawSubject,
        displaySubject,
        preview,
        whyInFocus,
        nextActionSummary,
        raw: row,
      }),
      intentLabel: humanizeCode(row?.intent, "Oklart"),
      isVIP: engagementScore >= 0.75 || asNumber(row?.customerSummary?.caseCount, 0) >= 4,
      engagementLabel: `${Math.round(engagementScore * 100)}% engagemang`,
      displayEngagementLabel,
      displayCustomerMeta: `${displayEngagementLabel} · ${displayOwnerLabel}`,
      nextActionLabel: followUpAgingState.actionLabel || mapRuntimeNextActionLabel(row),
      nextActionSummary,
      whyInFocus,
      primaryLaneId: derivePrimaryRuntimeLane(row),
      worklistSource: normalizeKey(row?.worklistSource || "legacy") || "legacy",
      worklistSourceLabel: asText(row?.worklistSourceLabel),
      worklistWave: normalizeKey(row?.worklistWave || ""),
      worklistWaveLabel: asText(row?.worklistWaveLabel),
      tags: runtimeTags,
      avatar: buildAvatarDataUri(customerName),
      messages: normalizedMessages,
      historyEvents: resolvedHistoryEvents,
      historyMailboxOptions: mailboxes.map((item) => ({
        id: item.id,
        label: item.label,
      })),
      mailboxProvenanceLabel,
      mailboxProvenanceDetail,
      threadDocument:
        resolvedThreadDocument && typeof resolvedThreadDocument === "object"
          ? resolvedThreadDocument
          : null,
      foundationState,
      raw: row,
      mailboxesLabel:
        mailboxes.length > 1
          ? `${mailboxes.map((item) => item.label).join(", ")}`
          : mailboxes[0]?.label || titleCaseMailbox(mailboxAddress),
    };
    thread.cards = buildRuntimeSummaryCards(row, thread);
    return thread;
  }

  function buildLiveThreads(data, options = {}) {
    const sourceRows = [...asArray(data?.conversationWorklist), ...asArray(data?.needsReplyToday)];
    const customerMergeMap =
      typeof state !== "undefined" &&
      state &&
      state.customerRuntime &&
      typeof state.customerRuntime.mergedInto === "object"
        ? state.customerRuntime.mergedInto
        : {};
    const toLiveConversationLookupKey = (value) =>
      typeof normalizeRuntimeConversationId === "function"
        ? normalizeRuntimeConversationId(value)
        : asText(value).trim().toLowerCase();
    const getRowActivityStamp = (row = {}) =>
      [
        asText(row?.lastActivityAt),
        asText(row?.lastActionTakenAt),
        asText(row?.lastInboundAt),
        asText(row?.lastOutboundAt),
        asText(row?.latestMessageAt),
      ]
        .map((value) => asText(value).trim())
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left))[0] || "";
    const getCanonicalLiveCustomerKey = (row = {}) => {
      const candidateKeys = [
        row?.customerSummary?.customerKey,
        row?.customerKey,
        row?.customerIdentity?.canonicalCustomerId,
        row?.customerIdentity?.canonicalContactId,
        row?.identity?.canonicalCustomerId,
        row?.identity?.canonicalContactId,
        row?.customerEmail,
        row?.customerName,
      ];
      for (const candidate of candidateKeys) {
        const normalized = normalizeKey(asText(candidate));
        if (!normalized) continue;
        return normalizeKey(customerMergeMap[normalized] || normalized);
      }
      return "";
    };
    const buildLiveConversationKey = (row = {}) => {
      const mailboxConversationId = asText(row?.mailboxConversationId);
      if (mailboxConversationId) return mailboxConversationId;
      const conversationId = asText(row?.conversationId);
      if (conversationId) return conversationId;
      return buildHistoryConversationKey(row);
    };
    const collectLiveConversationLookupKeys = (row = {}) =>
      Array.from(
        new Set(
          [
            buildLiveConversationKey(row),
            asText(row?.conversationId),
            asText(row?.mailboxConversationId),
            buildHistoryConversationKey(row),
          ]
            .map((value) => toLiveConversationLookupKey(value))
            .filter(Boolean)
        )
      );
    const liveBuckets = new Map();
    const bucketLookup = new Map();
    const registerBucketLookupKey = (bucket, key) => {
      const normalized = toLiveConversationLookupKey(key);
      if (!normalized) return;
      bucket.lookupKeys.add(normalized);
      bucketLookup.set(normalized, bucket.groupKey);
    };
    const getBucketGroupKey = (row = {}) => {
      const customerKey = getCanonicalLiveCustomerKey(row);
      if (customerKey) return customerKey;
      return toLiveConversationLookupKey(buildLiveConversationKey(row));
    };
    sourceRows.forEach((row) => {
      const groupKey = getBucketGroupKey(row);
      if (!groupKey) return;
      const rowConversationKey = toLiveConversationLookupKey(buildLiveConversationKey(row));
      let bucket = liveBuckets.get(groupKey);
      if (!bucket) {
        bucket = {
          groupKey,
          rows: [],
          rowKeys: new Set(),
          lookupKeys: new Set(),
          primaryRow: null,
        };
        liveBuckets.set(groupKey, bucket);
      }
      if (rowConversationKey && !bucket.rowKeys.has(rowConversationKey)) {
        bucket.rowKeys.add(rowConversationKey);
        bucket.rows.push({ ...row });
      }
      const activityStamp = getRowActivityStamp(row);
      const primaryStamp = getRowActivityStamp(bucket.primaryRow || {});
      if (!bucket.primaryRow || activityStamp.localeCompare(primaryStamp) > 0) {
        bucket.primaryRow = row;
      }
      collectLiveConversationLookupKeys(row).forEach((key) => registerBucketLookupKey(bucket, key));
      registerBucketLookupKey(bucket, groupKey);
    });
    const feedLookup = buildFeedIndex(data);
    const buildCombinedFeedEntriesForRows = (rows = []) => {
      if (typeof getFeedEntriesForRuntimeRow !== "function") return [];
      const entries = [];
      const seen = new Set();
      asArray(rows).forEach((row) => {
        asArray(getFeedEntriesForRuntimeRow(row, feedLookup)).forEach((entry) => {
          const key = toLiveConversationLookupKey(
            asText(entry?.messageId || entry?.id || entry?.conversationId || entry?.conversationKey)
          );
          if (key && seen.has(key)) return;
          if (key) seen.add(key);
          entries.push(entry);
        });
      });
      return entries;
    };
    const buildMergedBucketRow = (bucket = {}) => {
      const primaryRow = bucket.primaryRow || bucket.rows[0] || {};
      const bucketRows = asArray(bucket.rows);
      const mergedTags = Array.from(
        new Set(
          bucketRows
            .flatMap((row) =>
              asArray(row?.tags).length > 0 ? asArray(row.tags) : deriveRuntimeTags(row)
            )
            .map((tag) => asText(tag).trim())
            .filter(Boolean)
        )
      );
      const sourceConversationIds = Array.from(
        new Set(bucketRows.map((row) => asText(row?.conversationId)).filter(Boolean))
      );
      const sourceMailboxIds = Array.from(
        new Set(
          bucketRows
            .flatMap((row) => [
              asText(row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName),
              ...asArray(row?.customerSummary?.historyMailboxIds),
            ])
            .map((value) => asText(value).trim())
            .filter(Boolean)
        )
      );
      const customerKey =
        getCanonicalLiveCustomerKey(primaryRow) ||
        asText(primaryRow?.customerSummary?.customerKey) ||
        asText(primaryRow?.customerKey) ||
        "";
      return {
        ...primaryRow,
        conversationId: bucket.groupKey || asText(primaryRow?.conversationId),
        mailboxConversationId: asText(
          primaryRow?.mailboxConversationId,
          bucket.groupKey || asText(primaryRow?.conversationId)
        ),
        sourceConversationId: asText(primaryRow?.conversationId),
        sourceConversationIds,
        sourceRows: bucketRows.map((row) => ({ ...row })),
        conversationAliases: Array.from(bucket.lookupKeys),
        customerSummary: {
          ...(primaryRow?.customerSummary && typeof primaryRow.customerSummary === "object"
            ? primaryRow.customerSummary
            : {}),
          customerKey,
          historyMailboxIds:
            sourceMailboxIds.length > 0
              ? sourceMailboxIds
              : asArray(primaryRow?.customerSummary?.historyMailboxIds),
          interactionCount: Math.max(
            Number(primaryRow?.customerSummary?.interactionCount || 0),
            bucketRows.length,
            1
          ),
          historyMessageCount: Math.max(
            Number(primaryRow?.customerSummary?.historyMessageCount || 0),
            bucketRows.length,
            1
          ),
          caseCount: Math.max(Number(primaryRow?.customerSummary?.caseCount || 0), bucketRows.length, 1),
        },
        tags: mergedTags.length
          ? mergedTags
          : asArray(primaryRow?.tags).map((tag) => normalizeKey(tag)).filter(Boolean),
        crossMailboxProvenanceEvidence:
          bucketRows.length > 1 || sourceConversationIds.length > 1 ? true : false,
      };
    };
    const liveRows = liveBuckets.size
      ? Array.from(liveBuckets.values()).map((bucket) => buildMergedBucketRow(bucket))
      : buildFallbackRowsFromFeed(data);
    const historyMessages = asArray(options?.historyMessages);
    const historyEvents = asArray(options?.historyEvents);

    if (!historyMessages.length) {
      return liveRows.map((row) =>
        buildRuntimeThread(row, {
          feedEntries: buildCombinedFeedEntriesForRows(
            asArray(row?.sourceRows).length ? row.sourceRows : [row]
          ),
        })
      );
    }

    const toConversationLookupKey = (value) =>
      typeof normalizeRuntimeConversationId === "function"
        ? normalizeRuntimeConversationId(value)
        : asText(value).trim().toLowerCase();
    const collectHistoryLookupKeys = (item = {}) =>
      Array.from(
        new Set(
          [asText(item?.conversationId), buildHistoryConversationKey(item)]
            .map((value) => toConversationLookupKey(value))
            .filter(Boolean)
        )
      );
    const messagesByConversation = new Map();
    historyMessages.forEach((message) => {
      const historyLookupKeys = collectHistoryLookupKeys(message);
      const matchedGroupKey =
        historyLookupKeys.map((conversationId) => bucketLookup.get(conversationId)).find(Boolean) ||
        "";
      const conversationId = matchedGroupKey || historyLookupKeys[0];
      if (!conversationId) return;
      const current = messagesByConversation.get(conversationId) || [];
      current.push(message);
      messagesByConversation.set(conversationId, current);
    });
    const eventsByConversation = new Map();
    historyEvents.forEach((event) => {
      const historyLookupKeys = collectHistoryLookupKeys(event);
      const matchedGroupKey =
        historyLookupKeys.map((conversationId) => bucketLookup.get(conversationId)).find(Boolean) ||
        "";
      const conversationId = matchedGroupKey || historyLookupKeys[0];
      if (!conversationId) return;
      const current = eventsByConversation.get(conversationId) || [];
      current.push(event);
      eventsByConversation.set(conversationId, current);
    });

    const threads = [];
    const processedConversationIds = new Set();

    liveRows.forEach((row) => {
      const conversationId = asText(row?.conversationId);
      if (!conversationId || processedConversationIds.has(conversationId)) return;
      const matchingMessages = messagesByConversation.get(conversationId) || [];
      const matchingEvents = eventsByConversation.get(conversationId) || [];
      if (matchingMessages.length) {
        const historyBackedRow = buildHistoryBackedRuntimeRow({
          conversationId,
          messages: matchingMessages,
          events: matchingEvents,
          liveRow: row,
        });
        const mergedHistoryTags = Array.from(
          new Set(
            [...asArray(row?.tags), ...asArray(historyBackedRow?.tags)]
              .map((tag) => asText(tag).trim())
              .filter(Boolean)
          )
        );
        if (mergedHistoryTags.length > 0) {
          historyBackedRow.tags = mergedHistoryTags;
        }
        historyBackedRow.crossMailboxProvenanceEvidence =
          historyBackedRow.crossMailboxProvenanceEvidence === true ||
          asArray(historyBackedRow?.sourceRows).length > 1 ||
          asArray(historyBackedRow?.sourceConversationIds).length > 1;
        const derivedThreadDocument = buildClientThreadDocumentFromHistoryMessages(
          matchingMessages,
          {
            conversationId,
            customerEmail: historyBackedRow?.customerEmail || row?.customerEmail || "",
          }
        );
        threads.push(
          buildRuntimeThread(historyBackedRow, {
            feedEntries: buildHistoryFeedEntries(matchingMessages),
            threadDocument: derivedThreadDocument,
            historyEvents: buildHistoryRuntimeEvents(matchingEvents, {
              conversationId,
              mailboxAddress: historyBackedRow.mailboxAddress,
              mailboxLabel: titleCaseMailbox(historyBackedRow.mailboxAddress),
            }),
          })
        );
      } else {
        threads.push(
          buildRuntimeThread(row, {
            feedEntries: buildCombinedFeedEntriesForRows(
              asArray(row?.sourceRows).length ? row.sourceRows : [row]
            ),
          })
        );
      }
      processedConversationIds.add(conversationId);
      asArray(row?.conversationAliases).forEach((alias) => processedConversationIds.add(alias));
    });

    if (!liveRows.length) {
      messagesByConversation.forEach((messages, conversationId) => {
        if (processedConversationIds.has(conversationId)) return;
        const row = buildHistoryBackedRuntimeRow({
          conversationId,
          messages,
          events: eventsByConversation.get(conversationId) || [],
          liveRow: null,
        });
        const derivedThreadDocument = buildClientThreadDocumentFromHistoryMessages(messages, {
          conversationId,
          customerEmail: row?.customerEmail || "",
        });
        threads.push(
          buildRuntimeThread(row, {
            feedEntries: buildHistoryFeedEntries(messages),
            threadDocument: derivedThreadDocument,
            historyEvents: buildHistoryRuntimeEvents(eventsByConversation.get(conversationId) || [], {
              conversationId,
              mailboxAddress: row.mailboxAddress,
              mailboxLabel: titleCaseMailbox(row.mailboxAddress),
            }),
          })
        );
        processedConversationIds.add(conversationId);
      });
    }

    return threads.sort((left, right) =>
      String(right?.lastActivityAt || "").localeCompare(String(left?.lastActivityAt || ""))
    );
  }

  function hydrateRuntimeThreadWithHistoryPayload(thread, historyPayload = {}) {
    const safeThread = thread && typeof thread === "object" ? thread : null;
    if (!safeThread) return null;
    const messages = asArray(historyPayload?.messages);
    const events = asArray(historyPayload?.events);
    if (!messages.length && !events.length) {
      return safeThread;
    }

    const conversationId = asText(
      safeThread.id,
      asText(safeThread?.raw?.conversationId)
    );
    const liveRow =
      safeThread?.raw && typeof safeThread.raw === "object" ? safeThread.raw : {};
    const historyBackedRow = buildHistoryBackedRuntimeRow({
      conversationId,
      messages,
      events,
      liveRow,
    });
    const derivedThreadDocument = buildClientThreadDocumentFromHistoryMessages(messages, {
      conversationId,
      customerEmail: historyBackedRow?.customerEmail || safeThread?.customerEmail || "",
    });

    return buildRuntimeThread(historyBackedRow, {
      feedEntries: buildHistoryFeedEntries(messages),
      threadDocument:
        historyPayload?.threadDocument && typeof historyPayload.threadDocument === "object"
          ? normalizeThreadDocumentMessageOrder(historyPayload.threadDocument)
          : derivedThreadDocument,
      historyEvents: buildHistoryRuntimeEvents(events, {
        conversationId: historyBackedRow.conversationId || conversationId,
        mailboxAddress: historyBackedRow.mailboxAddress || safeThread.mailboxAddress,
        mailboxLabel: titleCaseMailbox(
          historyBackedRow.mailboxAddress || safeThread.mailboxAddress
        ),
      }),
    });
  }

  function isTruthPrimaryWorklistFeatureEnabled() {
    if (WORKLIST_TRUTH_PRIMARY?.enabled !== true) return false;
    try {
      return window.localStorage.getItem(TRUTH_PRIMARY_WORKLIST_DISABLE_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  }

  function getTruthPrimaryConfiguredMailboxIds() {
    return asArray(WORKLIST_TRUTH_PRIMARY?.mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
  }

  function isTruthPrimaryFocusFeatureEnabled() {
    if (FOCUS_TRUTH_PRIMARY?.enabled !== true) return false;
    try {
      return window.localStorage.getItem(TRUTH_PRIMARY_FOCUS_DISABLE_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  }

  function getTruthPrimaryFocusConfiguredMailboxIds() {
    return asArray(FOCUS_TRUTH_PRIMARY?.mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
  }

  function getTruthPrimaryFocusMailboxIds({ mailboxIds = [] } = {}) {
    const configuredMailboxIds = new Set(getTruthPrimaryFocusConfiguredMailboxIds());
    if (!configuredMailboxIds.size) return [];
    const scopedMailboxIds = asArray(mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
    if (!scopedMailboxIds.length) {
      return Array.from(configuredMailboxIds);
    }
    return scopedMailboxIds.filter((mailboxId) => configuredMailboxIds.has(mailboxId));
  }

  function isTruthPrimaryStudioFeatureEnabled() {
    if (STUDIO_TRUTH_PRIMARY?.enabled !== true) return false;
    try {
      return window.localStorage.getItem(TRUTH_PRIMARY_STUDIO_DISABLE_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  }

  function getTruthPrimaryStudioConfiguredMailboxIds() {
    return asArray(STUDIO_TRUTH_PRIMARY?.mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
  }

  function getTruthPrimaryStudioMailboxIds({ mailboxIds = [] } = {}) {
    const configuredMailboxIds = new Set(getTruthPrimaryStudioConfiguredMailboxIds());
    if (!configuredMailboxIds.size) return [];
    const scopedMailboxIds = asArray(mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
    if (!scopedMailboxIds.length) {
      return Array.from(configuredMailboxIds);
    }
    return scopedMailboxIds.filter((mailboxId) => configuredMailboxIds.has(mailboxId));
  }

  function getTruthPrimaryWorklistMailboxIds({ mailboxIds = [] } = {}) {
    if (!isTruthPrimaryWorklistFeatureEnabled()) return [];
    const configuredMailboxIds = new Set(getTruthPrimaryConfiguredMailboxIds());
    if (!configuredMailboxIds.size) return [];
    const scopedMailboxIds = asArray(mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
    if (!scopedMailboxIds.length) {
      return Array.from(configuredMailboxIds);
    }
    return scopedMailboxIds.filter((mailboxId) => configuredMailboxIds.has(mailboxId));
  }

  function buildTruthPrimaryWorklistConsumerHref(
    mailboxIds = [],
    limit = Number(WORKLIST_TRUTH_PRIMARY?.limit || 120)
  ) {
    return buildTruthWorklistConsumerHref(mailboxIds, Math.max(1, Number(limit || 120)));
  }

  function buildTruthPrimaryRuntimeRow(item = {}) {
    const conversationId = asText(item?.conversation?.conversationId || item?.id);
    const mailboxId = canonicalizeRuntimeMailboxId(
      item?.mailbox?.mailboxId || item?.mailbox?.mailboxAddress
    );
    if (!conversationId || !mailboxId) return null;

    const ownershipMailbox = canonicalizeRuntimeMailboxId(
      item?.mailbox?.ownershipMailbox || mailboxId
    );
    const customerEmail = asText(item?.customer?.email).toLowerCase();
    const customerName = asText(item?.customer?.name);
    const latestPreview = resolveRuntimePreviewText(item, {
      fallback: "Ingen förhandsvisning tillgänglig.",
    });
    const lane = normalizeKey(item?.lane || "all") === "act-now" ? "act-now" : "all";
    const needsReply = item?.state?.needsReply === true;
    const hasUnreadInbound = item?.state?.hasUnreadInbound === true;
    const tags = ["all"];
    if (lane === "act-now") tags.push("act-now");

    return {
      conversationId,
      mailboxId,
      mailboxAddress: mailboxId,
      userPrincipalName: mailboxId,
      subject: asText(item?.subject, "(utan ämne)"),
      preview: latestPreview,
      bodyPreview: latestPreview,
      latestPreview,
      systemPreview: latestPreview,
      latestInboundPreview: latestPreview,
      lastInboundAt: asText(item?.timing?.lastInboundAt),
      lastOutboundAt: asText(item?.timing?.lastOutboundAt),
      latestMessageAt: asText(item?.timing?.latestMessageAt),
      hasUnreadInbound,
      isUnanswered: needsReply,
      waitingOn: needsReply ? "owner" : "",
      owner: ownershipMailbox ? titleCaseMailbox(ownershipMailbox) : "Oägd",
      intent: needsReply ? "needs_reply" : "active_dialogue",
      recommendedAction: needsReply
        ? "Svara kunden och ta nästa tydliga steg."
        : "Granska senaste aktivitet i truth-driven arbetskö.",
      recommendedActionLabel: needsReply ? "Svara nu" : "Granska tråden",
      riskStackExplanation: hasUnreadInbound
        ? "Unread inbound och needs reply läses från mailbox truth i wave 1."
        : "Raden kommer från mailbox truth i wave 1.",
      operatorCue: needsReply
        ? "Truth-driven rad: svara kunden via worklisten."
        : "Truth-driven rad: kontrollera senaste aktivitet.",
      workflowLane: lane === "act-now" ? "action_now" : "",
      bookingState: "",
      priorityLevel: lane === "act-now" ? "medium" : "low",
      slaStatus: lane === "act-now" ? "warning" : "safe",
      dominantRisk: lane === "act-now" ? "warning" : "safe",
      customerEmail,
      sender: customerEmail || customerName,
      senderName: customerName,
      customerSummary: {
        customerName,
        customerKey: customerEmail,
        lifecycleStatus: needsReply ? "awaiting_reply" : "active_dialogue",
        interactionCount: Math.max(1, asNumber(item?.state?.messageCount, 1)),
        historyMessageCount: Math.max(1, asNumber(item?.state?.messageCount, 1)),
        historyMailboxIds: [mailboxId],
        lastCaseSummary: latestPreview,
        historySignalSummary: latestPreview,
        historySignalActionCue: needsReply
          ? "Svara kunden och håll nästa steg tydligt."
          : "Granska senaste aktivitet i samma tråd.",
        engagementScore: 0.42,
        caseCount: 1,
      },
      tags,
      rowFamily:
        typeof classifyRuntimeRowFamily === "function"
          ? classifyRuntimeRowFamily({
              subject: asText(item?.subject, "(utan ämne)"),
              customerName,
              senderName: customerName,
              preview: latestPreview,
              latestInboundPreview: latestPreview,
              intent: needsReply ? "needs_reply" : "active_dialogue",
            })
          : "human_mail",
      worklistSource: "truth_primary",
      worklistSourceLabel: "Truth primary",
      worklistWave: "wave_1",
      worklistWaveLabel: "Wave 1",
      truthPrimaryMailbox: true,
      truthConversationKey: asText(item?.conversation?.key || item?.id),
    };
  }

  function getUsableRuntimeRowPreview(row = {}) {
    return resolveRuntimePreviewText(row);
  }

  function buildRuntimeRowSemanticKey(row = {}) {
    const mailboxId = canonicalizeRuntimeMailboxId(
      row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName
    );
    const subject = normalizeKey(
      normalizeRuntimeDisplaySubject(
        row?.displaySubject || row?.subject || row?.summary || row?.title,
        ""
      )
    );
    if (!mailboxId || !subject) return "";
    const customerName = normalizeKey(
      getRuntimeCustomerName(row) ||
        deriveRuntimeCustomerNameFromSubject(
          row?.displaySubject || row?.subject || row?.summary || row?.title
        )
    );
    return customerName
      ? `${mailboxId}|${customerName}|${subject}`
      : `${mailboxId}|${subject}`;
  }

  function mergeTruthPrimaryRuntimeRowWithLegacyRow(truthRow = {}, legacyRow = null) {
    if (!legacyRow || typeof legacyRow !== "object") return truthRow;

    const truthPreview = getUsableRuntimeRowPreview(truthRow);
    const legacyPreview = getUsableRuntimeRowPreview(legacyRow);
    const mergedPreview = truthPreview || legacyPreview;

    const mergedRow = {
      ...legacyRow,
      ...truthRow,
      sender: asText(truthRow?.sender, asText(legacyRow?.sender)),
      senderName: asText(truthRow?.senderName, asText(legacyRow?.senderName)),
      customerEmail: asText(truthRow?.customerEmail, asText(legacyRow?.customerEmail)),
      detail: asText(truthRow?.detail, asText(legacyRow?.detail)),
      summary: asText(truthRow?.summary, asText(legacyRow?.summary)),
      bodyHtml: asText(truthRow?.bodyHtml, asText(legacyRow?.bodyHtml)),
      latestMessage:
        truthRow?.latestMessage && typeof truthRow.latestMessage === "object"
          ? truthRow.latestMessage
          : legacyRow?.latestMessage,
      conversation:
        truthRow?.conversation && typeof truthRow.conversation === "object"
          ? truthRow.conversation
          : legacyRow?.conversation,
      customerSummary: {
        ...(legacyRow?.customerSummary && typeof legacyRow.customerSummary === "object"
          ? legacyRow.customerSummary
          : {}),
        ...(truthRow?.customerSummary && typeof truthRow.customerSummary === "object"
          ? truthRow.customerSummary
          : {}),
      },
    };

    if (mergedPreview) {
      mergedRow.preview = mergedPreview;
      mergedRow.bodyPreview = mergedPreview;
      mergedRow.latestPreview = mergedPreview;
      mergedRow.systemPreview = mergedPreview;
      mergedRow.latestInboundPreview = mergedPreview;
    }

    return mergedRow;
  }

  function mergeTruthPrimaryWorklistData(
    legacyData = {},
    truthPayload = null,
    { truthPrimaryMailboxIds = [] } = {}
  ) {
    const truthPrimaryMailboxSet = new Set(
      asArray(truthPrimaryMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
    );
    if (!truthPrimaryMailboxSet.size || !truthPayload || typeof truthPayload !== "object") {
      return legacyData;
    }

    const stripLegacyRows = (rows = []) =>
      asArray(rows).filter((row) => {
        const mailboxId = canonicalizeRuntimeMailboxId(
          row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName
        );
        return !truthPrimaryMailboxSet.has(mailboxId);
      });

    const strippedLegacyRows = [
      ...asArray(legacyData?.conversationWorklist),
      ...asArray(legacyData?.needsReplyToday),
    ].filter((row) => {
      const mailboxId = canonicalizeRuntimeMailboxId(
        row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName
      );
      return truthPrimaryMailboxSet.has(mailboxId);
    });

    const strippedLegacyRowsByConversationId = new Map();
    const strippedLegacyRowsBySemanticKey = new Map();
    strippedLegacyRows.forEach((row) => {
      const conversationId = asText(row?.conversationId);
      if (conversationId && !strippedLegacyRowsByConversationId.has(conversationId)) {
        strippedLegacyRowsByConversationId.set(conversationId, row);
      }
      const semanticKey = buildRuntimeRowSemanticKey(row);
      if (semanticKey && !strippedLegacyRowsBySemanticKey.has(semanticKey)) {
        strippedLegacyRowsBySemanticKey.set(semanticKey, row);
      }
    });

    const matchedLegacyRows = new Set();
    const truthRows = asArray(truthPayload.rows)
      .map((item) => buildTruthPrimaryRuntimeRow(item))
      .filter(Boolean)
      .filter((row) => truthPrimaryMailboxSet.has(canonicalizeRuntimeMailboxId(row.mailboxId)))
      .map((row) => {
        const legacyMatch =
          strippedLegacyRowsByConversationId.get(asText(row?.conversationId)) ||
          strippedLegacyRowsBySemanticKey.get(buildRuntimeRowSemanticKey(row)) ||
          null;
        if (legacyMatch) {
          matchedLegacyRows.add(legacyMatch);
        }
        return mergeTruthPrimaryRuntimeRowWithLegacyRow(row, legacyMatch);
      });

    const preserveLegacyRows = (rows = []) =>
      asArray(rows).filter((row) => {
        const mailboxId = canonicalizeRuntimeMailboxId(
          row?.mailboxAddress || row?.mailboxId || row?.userPrincipalName
        );
        if (!truthPrimaryMailboxSet.has(mailboxId)) return true;
        return !matchedLegacyRows.has(row);
      });

    return {
      ...legacyData,
      conversationWorklist: [
        ...preserveLegacyRows(legacyData?.conversationWorklist),
        ...truthRows,
      ],
      needsReplyToday: preserveLegacyRows(legacyData?.needsReplyToday),
      metadata: {
        ...(legacyData?.metadata && typeof legacyData.metadata === "object"
          ? legacyData.metadata
          : {}),
        truthPrimaryMailboxIds: Array.from(truthPrimaryMailboxSet),
        truthPrimaryRowCount: truthRows.length,
      },
    };
  }

  function summarizeMailboxCountsForDiagnostics(items = [], mailboxResolver = null) {
    const counts = new Map();
    asArray(items).forEach((item) => {
      const mailboxSource =
        typeof mailboxResolver === "function"
          ? mailboxResolver(item)
          : item?.mailboxAddress ||
            item?.mailboxId ||
            item?.mailbox?.mailboxId ||
            item?.mailbox?.ownershipMailbox ||
            item?.userPrincipalName ||
            item?.mailboxLabel;
      const mailboxId = canonicalizeRuntimeMailboxId(mailboxSource);
      if (!mailboxId) return;
      const worklistSource =
        normalizeKey(item?.worklistSource || item?.raw?.worklistSource || "legacy") || "legacy";
      const current = counts.get(mailboxId) || {
        mailboxId,
        mailboxLabel: titleCaseMailbox(mailboxId),
        count: 0,
        truthPrimaryCount: 0,
        legacyCount: 0,
      };
      current.count += 1;
      if (worklistSource === "truth_primary") {
        current.truthPrimaryCount += 1;
      } else {
        current.legacyCount += 1;
      }
      counts.set(mailboxId, current);
    });
    return Array.from(counts.values()).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.mailboxId.localeCompare(right.mailboxId, "sv");
    });
  }

  function summarizeRuntimeThreadForDiagnostics(thread) {
    if (!thread || typeof thread !== "object") return null;
    return {
      id: asText(thread.id),
      mailboxId: canonicalizeRuntimeMailboxId(thread.mailboxAddress || thread.mailboxLabel),
      mailboxLabel: asText(thread.mailboxLabel, titleCaseMailbox(thread.mailboxAddress)),
      customerName: asText(thread.customerName, "Okänd kund"),
      subject: compactRuntimeCopy(thread.displaySubject || thread.subject, "Inget ämne", 92),
      story: compactRuntimeCopy(
        thread.preview || thread.systemPreview || thread.nextActionSummary,
        "",
        120
      ),
      ownerLabel: asText(thread.ownerLabel, "Ej tilldelad"),
      primaryLaneId: getThreadPrimaryLaneId(thread),
      worklistSource: normalizeKey(thread.worklistSource || thread.raw?.worklistSource || "legacy"),
      selected:
        runtimeConversationIdsMatch(thread.id, workspaceSourceOfTruth.getSelectedThreadId()) === true,
    };
  }

  function buildRuntimeMailboxLoadDiagnostics({
    phase = "idle",
    requestedMailboxIds = [],
    liveData = null,
    mergedWorklistData = null,
    threads = [],
    legacyThreads = [],
    historyPayload = null,
    truthPrimaryPayload = null,
    configuredTruthPrimaryMailboxIds = [],
    activeTruthPrimaryMailboxIds = [],
    error = "",
    offlineWorkingSetSource = "",
    offlineWorkingSetMeta = "",
  } = {}) {
    const rawRows = [
      ...asArray(liveData?.conversationWorklist),
      ...asArray(liveData?.needsReplyToday),
    ];
    const mergedRows = [
      ...asArray(mergedWorklistData?.conversationWorklist),
      ...asArray(mergedWorklistData?.needsReplyToday),
    ];
    const historyMessages = asArray(historyPayload?.messages);
    const truthRows = asArray(truthPrimaryPayload?.rows);

    return {
      lastLoadAt: new Date().toISOString(),
      phase,
      requestedMailboxIds: asArray(requestedMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean),
      rawWorklist: {
        totalRows: rawRows.length,
        mailboxCounts: summarizeMailboxCountsForDiagnostics(rawRows),
        sampleTitles: rawRows
          .slice(0, 6)
          .map((row) =>
            compactRuntimeCopy(
              row?.subject || row?.summary || row?.title || row?.latestInboundPreview,
              "",
              88
            )
          )
          .filter(Boolean),
      },
      mergedWorklist: {
        totalRows: mergedRows.length,
        mailboxCounts: summarizeMailboxCountsForDiagnostics(mergedRows),
        sampleTitles: mergedRows
          .slice(0, 6)
          .map((row) =>
            compactRuntimeCopy(
              row?.subject || row?.summary || row?.title || row?.latestInboundPreview,
              "",
              88
            )
          )
          .filter(Boolean),
      },
      liveThreads: {
        count: asArray(threads).length,
        mailboxCounts: summarizeMailboxCountsForDiagnostics(threads),
        samples: asArray(threads)
          .slice(0, 6)
          .map((thread) => summarizeRuntimeThreadForDiagnostics(thread))
          .filter(Boolean),
      },
      legacyThreads: {
        count: asArray(legacyThreads).length,
        mailboxCounts: summarizeMailboxCountsForDiagnostics(legacyThreads),
        samples: asArray(legacyThreads)
          .slice(0, 6)
          .map((thread) => summarizeRuntimeThreadForDiagnostics(thread))
          .filter(Boolean),
      },
      historyMessages: {
        count: historyMessages.length,
        mailboxCounts: summarizeMailboxCountsForDiagnostics(
          historyMessages,
          (message) => message?.mailboxId || message?.mailboxAddress || message?.userPrincipalName
        ),
      },
      truthPrimary: {
        configuredMailboxIds: asArray(configuredTruthPrimaryMailboxIds)
          .map((value) => canonicalizeRuntimeMailboxId(value))
          .filter(Boolean),
        activeMailboxIds: asArray(activeTruthPrimaryMailboxIds)
          .map((value) => canonicalizeRuntimeMailboxId(value))
          .filter(Boolean),
        rowCount: truthRows.length,
      },
      error: asText(error),
      offlineWorkingSetSource: asText(offlineWorkingSetSource),
      offlineWorkingSetMeta: asText(offlineWorkingSetMeta),
    };
  }

  function buildStudioContextAiItems(thread) {
    return [
      {
        label: "NU I",
        title: thread?.statusLabel || "Redo för åtgärd",
        copy: thread?.whyInFocus || "Ingen fokusmotivering tillgänglig.",
      },
      {
        label: "NÄSTA STEG",
        title: thread?.nextActionLabel || "Granska tråden",
        copy: thread?.nextActionSummary || "Ta nästa tydliga steg i samma tråd.",
      },
      {
        label: "VÄNTAR / BLOCKERAR",
        title: thread?.waitingLabel || "Behöver åtgärd",
        copy: compactRuntimeCopy(thread?.riskReason, "Ingen blockerande signal just nu.", 110),
      },
    ];
  }

  function renderStudioContextAiList(items) {
    const container = studioContextListNodes.ai;
    if (!container) return;
    container.innerHTML = items.length
      ? items
          .map(
            (item) => `<article class="studio-context-mini">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.copy)}</p>
            </article>`
          )
          .join("")
      : `<article class="studio-context-mini">
          <span>AI</span>
          <strong>Ingen kontext ännu</strong>
          <p>Välj en live-tråd för att ladda svarsstudion.</p>
        </article>`;
  }

  function renderStudioContextHistoryList(thread) {
    const container = studioContextListNodes.history;
    if (!container) return;
    const items = asArray(thread?.historyEvents).slice(0, 3);
    container.innerHTML = items.length
      ? items
          .map(
            (item) => `<article class="studio-history-item">
              <strong>${escapeHtml(item.description || item.title || "Historik")}</strong>
              <span>${escapeHtml(item.time || formatConversationTime(item.recordedAt))}</span>
            </article>`
          )
          .join("")
      : `<article class="studio-history-item"><strong>Ingen historik ännu</strong><span>-</span></article>`;
  }

  function renderStudioContextPreferencesList(thread) {
    const container = studioContextListNodes.preferences;
    if (!container) return;
    const rows = [
      { label: "Mailbox", value: thread?.mailboxLabel || "Okänd" },
      { label: "Ägare", value: thread?.displayOwnerLabel || thread?.ownerLabel || "Ej tilldelad" },
      { label: "SLA", value: humanizeCode(thread?.raw?.slaStatus, "Stabil") },
      { label: "Kanal", value: "E-post" },
    ];
    container.innerHTML = rows
      .map(
        (item) =>
          `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`
      )
      .join("");
  }

  function renderStudioContextRecommendationsList(thread) {
    const container = studioContextListNodes.recommendations;
    if (!container) return;
    const items = [
      {
        title: "Var konkret med nästa steg",
        copy: thread?.nextActionSummary || "Gör nästa steg tydligt i samma svar.",
      },
      {
        title: "Matcha kundens tempo",
        copy: compactRuntimeCopy(thread?.whyInFocus, "Håll tempot uppe i tråden.", 110),
      },
      {
        title: "Behåll samma mailbox",
        copy: `${thread?.mailboxLabel || "Mailbox"} · ${thread?.displayOwnerLabel || thread?.ownerLabel || "Ej tilldelad"}`,
      },
    ];
    container.innerHTML = items
      .map(
        (item) => `<article class="studio-recommendation-item">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.copy)}</p>
        </article>`
      )
      .join("");
  }

  function getLatestCustomerMessage(thread) {
    const messages = asArray(thread?.messages);
    return (
      messages.find((entry) => normalizeKey(entry?.role) === "customer") || messages[0] || null
    );
  }

  function getStudioConversationMessages(thread) {
    const messages = asArray(thread?.messages)
      .filter(
        (entry) =>
          normalizeText(entry?.conversationBody || entry?.body) ||
          normalizeText(entry?.author) ||
          normalizeText(entry?.time)
      )
      .map((entry) => ({
        ...entry,
        body: asText(entry?.conversationBody || entry?.body),
      }))
      .slice(0, 6)
      .reverse();

    if (messages.length) return messages;
    if (!thread) return [];

    return [
      {
        id: `${asText(thread?.id, "thread")}:preview`,
        author: thread?.customerName || "Kund",
        role: "customer",
        time: thread?.lastActivityLabel || "",
        body: thread?.preview || "Ingen förhandsvisning tillgänglig.",
      },
    ];
  }

  function renderStudioConversation(thread) {
    if (!studioIncomingBody) return;

    const messages = getStudioConversationMessages(thread);
    if (!thread) {
      studioIncomingBody.innerHTML =
        `<article class="studio-conversation-message studio-conversation-message--empty"><p class="studio-conversation-message-text">${escapeHtml(
          isOfflineHistoryReadOnlyMode()
            ? "Välj en historikruta i vänsterkolumnen för att öppna kundens historik i läsläge här."
            : "Välj en live-tråd i arbetskön för att öppna konversationen i studion."
        )}</p></article>`;
      return;
    }

    studioIncomingBody.innerHTML = messages
      .map((message) => {
        const roleClass =
          normalizeKey(message?.role) === "staff"
            ? "studio-conversation-message--staff"
            : "studio-conversation-message--customer";
        const author = escapeHtml(
          asText(
            message?.author,
            normalizeKey(message?.role) === "staff" ? "Team" : thread?.customerName || "Kund"
          )
        );
        const time = escapeHtml(asText(message?.time, ""));
        const body = escapeHtml(
          asText(message?.body, thread?.preview || "Ingen förhandsvisning tillgänglig.")
        ).replace(/\n/g, "<br />");

        return `<article class="studio-conversation-message ${roleClass}">
          <div class="studio-conversation-message-head">
            <strong class="studio-conversation-message-author">${author}</strong>
            <span class="studio-conversation-message-time">${time}</span>
          </div>
          <p class="studio-conversation-message-text">${body}</p>
        </article>`;
      })
      .join("");
  }

  function createStudioState(thread) {
    const trackKey = inferStudioTrackKey(thread);
    const selectedSignature = getStudioReplyDefaultSignatureProfile(thread).id;
    const baseDraft = buildStudioTrackDraft(thread, trackKey);
    const senderMailboxId = getStudioDefaultSenderMailboxId(thread);
    return applyTruthPrimaryStudioState({
      mode: "reply",
      threadId: asText(thread?.id),
      replyContextThreadId: asText(thread?.id),
      composeMailboxId: senderMailboxId,
      composeTo: getRuntimeCustomerEmail(thread),
      composeSubject: "",
      draftBody: baseDraft,
      baseDraftBody: baseDraft,
      activeTemplateKey: "",
      activeTrackKey: trackKey,
      activeToneKey: "professional",
      activeRefineKey: "",
      selectedSignatureId: selectedSignature,
      sending: false,
      savingDraft: false,
      deleting: false,
      previewing: false,
      truthDriven: false,
      truthLabel: "",
      truthWaveLabel: "",
      truthDetail: "",
      truthSourceMailboxId: "",
      truthSourceMailboxLabel: "",
      truthSenderLocked: false,
      truthFallbackReason: "",
    }, thread);
  }

  function createComposeStudioState(thread = null) {
    const operatorSignatureProfile = getStudioOperatorSignatureProfile();
    const selectedSignature = (
      operatorSignatureProfile ||
      getStudioSignatureProfile(state.runtime.defaultSignatureProfile)
    ).id;
    const composeTo = "";
    const baseDraft = "";
    const senderMailboxId = getStudioDefaultSenderMailboxId(thread, { composeMode: true });
    return {
      mode: "compose",
      threadId: "",
      replyContextThreadId: "",
      composeMailboxId: senderMailboxId,
      composeTo,
      composeSubject: "",
      draftBody: baseDraft,
      baseDraftBody: baseDraft,
      activeTemplateKey: "",
      activeTrackKey: "booking",
      activeToneKey: "professional",
      activeRefineKey: "",
      selectedSignatureId: selectedSignature,
      sending: false,
      savingDraft: false,
      deleting: false,
      previewing: false,
      truthDriven: false,
      truthLabel: "",
      truthWaveLabel: "",
      truthDetail: "",
      truthSourceMailboxId: "",
      truthSourceMailboxLabel: "",
      truthSenderLocked: false,
      truthFallbackReason: "",
    };
  }

  function prepareComposeStudioState(thread = null) {
    state.studio = createComposeStudioState(thread);
    return state.studio;
  }

  function ensureStudioState(thread) {
    if (!thread) return null;
    const replyContextThreadId = asText(state.studio.replyContextThreadId);
    const hasReplyContextMismatch =
      normalizeKey(state.studio.mode) !== "compose" &&
      replyContextThreadId &&
      !runtimeConversationIdsMatch(replyContextThreadId, thread.id);
    if (
      normalizeKey(state.studio.mode) === "compose" ||
      !runtimeConversationIdsMatch(state.studio.threadId, thread.id) ||
      hasReplyContextMismatch
    ) {
      state.studio = createStudioState(thread);
    }
    if (!normalizeText(state.studio.draftBody)) {
      state.studio.draftBody =
        state.studio.baseDraftBody ||
        buildStudioTrackDraft(thread, state.studio.activeTrackKey);
    }
    const resolvedSignatureProfile =
      resolveStudioSignatureProfile(state.studio.selectedSignatureId) ||
      getStudioReplyDefaultSignatureProfile(thread);
    state.studio.selectedSignatureId = resolvedSignatureProfile.id;
    state.studio.composeMailboxId = canonicalizeRuntimeMailboxId(
      state.studio.composeMailboxId || getStudioDefaultSenderMailboxId(thread)
    );
    state.studio.mode = "reply";
    state.studio.replyContextThreadId = asText(thread?.id);
    return applyTruthPrimaryStudioState(state.studio, thread);
  }

  function setStudioFeedback(message = "", tone = "") {
    setFeedback(studioFeedback, tone, message);
  }

  function renderStudioSelection(buttons, activeValue, datasetKey) {
    buttons.forEach((button) => {
      const isActive =
        normalizeKey(button.dataset[datasetKey]) === normalizeKey(activeValue);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  const {
    applyNoteModePreset,
    applyStudioMode,
    buildRuntimeScheduleDraft,
    createNoteDraft,
    createScheduleDraft,
    getLaterOptionLabel,
    normalizeStudioBusyState,
    openLaterDialog,
    renderLaterOptions,
    renderMailboxAdminList,
    renderNoteDestination,
    renderScheduleDraft,
    renderStudioShell,
    renderTags,
    renderTemplateButtons,
    renderWorkspaceRuntimeContext,
    setContextCollapsed,
    setLaterOpen,
    setMailboxAdminOpen,
    setNoteModeOpen,
    setNoteOpen,
    setScheduleOpen,
    setStudioOpen,
    syncNoteCount,
  } = PREVIEW_OVERLAY_RENDERERS.createOverlayRenderers({
    dom: {
      canvas,
      contextButtons,
      destinationButtons,
      laterContext,
      laterOptionButtons,
      mailboxAdminFeedback,
      mailboxAdminList,
      mailboxAdminShell,
      noteCount,
      noteDataStack,
      noteFeedback,
      noteLivePreview,
      noteLinkedList,
      noteModeContext,
      noteModeOptionButtons,
      noteModeShell,
      notePrioritySelect,
      noteShell,
      noteTagsRow,
      noteText,
      noteVisibilitySelect,
      scheduleCategoryHint,
      scheduleCategoryPill,
      scheduleCategorySelect,
      scheduleCustomerInput,
      scheduleCustomerPill,
      scheduleDateHint,
      scheduleDateInput,
      scheduleDoctorHint,
      scheduleDoctorSelect,
      scheduleLinkedList,
      scheduleNotesHint,
      scheduleNotesTextarea,
      scheduleRecommendationCards,
      scheduleReminderHint,
      scheduleReminderSelect,
      scheduleShell,
      scheduleTimeHint,
      scheduleTimeInput,
      laterShell,
      studioAvatar,
      studioCustomerEmail,
      studioCustomerMood,
      studioCustomerName,
      studioCustomerPhone,
      studioSourceLockLabel,
      studioSourceLockNote,
      studioDeleteButton,
      studioDoneActionButton,
      studioComposeFromSelect,
      studioComposeSubjectInput,
      studioComposeToInput,
      studioEditorInput,
      studioEditorRecipient,
      studioEditorSummary,
      studioEditorWordCount,
      studioIncomingAvatar,
      studioIncomingBody,
      studioIncomingLabel,
      studioIncomingName,
      studioIncomingTime,
      studioLaterActionButton,
      studioMiniValueNodes,
      studioNextActionNote,
      studioNextActionTitle,
      studioPolicyPill,
      studioPreviewActionButton,
      studioPreviewButton,
      studioPrimarySuggestion,
      studioPrimarySuggestionLabel,
      studioRefineButtons,
      studioSaveDraftButton,
      studioSendButton,
      studioSendLabel,
      studioShell,
      studioSignatureButtons,
      studioContextSummaryNodes,
      studioStatusValueNodes,
      studioTemplateButtons,
      studioTitle,
      studioToneButtons,
      studioToolbarPills,
      studioToolButtons,
      studioTrackButtons,
      studioWhyInFocus,
      targetLabel,
      templateButtons,
    },
    helpers: {
      NOTE_MODE_PRESETS,
      asArray,
      asText,
      buildAvatarDataUri,
      buildStudioContextAiItems,
      buildStudioSelectionSummary,
      compactRuntimeCopy,
      countWords,
      ensureStudioState,
      escapeHtml,
      evaluateStudioPolicy,
      getAvailableRuntimeMailboxes,
      getLatestCustomerMessage,
      getRuntimeMailboxCapability,
      getRuntimeMailboxCapabilityMeta,
      getRuntimeStudioTruthState,
      getRuntimeThreadById,
      isOfflineHistoryContextThread,
      getSelectedRuntimeThread,
      getRuntimeLeftColumnState,
      getStudioSenderMailboxOptions,
      getStudioSignatureProfiles,
      getStudioSignatureProfile,
      getStudioSourceMailboxLabel,
      humanizeCode,
      mapPriorityLabel,
      mapVisibilityLabel,
      mapVisibilityValue,
      normalizeKey,
      normalizeText,
      runtimeConversationIdsMatch,
      renderStudioContextAiList,
      renderStudioContextHistoryList,
      renderStudioContextPreferencesList,
      renderStudioContextRecommendationsList,
      renderStudioConversation,
      renderStudioSelection,
      setFeedback,
      setFloatingShellOpen,
      setStudioFeedback,
      tagsFrom,
      workspaceSourceOfTruth,
    },
    state,
    windowObject: window,
  });

  const {
    updateRuntimeThread,
    patchStudioThreadAfterSend,
    isHandledRuntimeThread,
    suggestHandledOutcome,
  } = PREVIEW_THREAD_OPS.createThreadStateOps({
    asArray,
    asText,
    buildRuntimeSummaryCards,
    compactRuntimeCopy,
    ensureRuntimeSelection,
    formatConversationTime,
    formatDueLabel,
    formatListTime,
    getStudioSenderMailboxId,
    normalizeKey,
    renderRuntimeConversationShell,
    renderStudioShell,
    state,
    titleCaseMailbox,
  });

  const {
    renderFocusHistorySection,
    renderFocusNotesSection,
    renderRuntimeCustomerPanel,
    renderRuntimeFocusConversation,
    renderRuntimeIntel,
  } = PREVIEW_FOCUS_INTEL_RENDERERS.createFocusIntelRenderers({
    dom: {
      focusTabs,
      focusBadgeRow,
      focusConversationSection,
      focusConversationLayout,
      focusSignals,
      focusWorkrail,
      focusCustomerGrid,
      focusCustomerHero,
      focusCustomerHistoryCount,
      focusCustomerHistoryDescription,
      focusCustomerHistoryList,
      focusCustomerHistoryMeta,
      focusCustomerHistoryState,
      focusCustomerHistoryListState,
      focusCustomerHistoryListStateCopy,
      focusCustomerHistoryReadoutButton,
      focusCustomerHistoryTitle,
      focusCustomerStats,
      focusCustomerSummary,
      focusHistoryCount,
      focusHistoryDeleteButton,
      focusHistoryDescription,
      focusHistoryList,
      focusHistoryMailboxRow,
      focusHistoryMeta,
      focusHistoryRangeRow,
      focusHistoryReadoutButton,
      focusHistoryScope,
      focusHistorySearchInput,
      focusHistoryTitle,
      focusHistoryTypeRow,
      focusNotesCount,
      focusNotesEmpty,
      focusNotesList,
      focusStatusLine,
      focusTitle,
      focusIntelPrimary,
      focusIntelPrimaryBody,
      focusIntelTitle,
      intelCustomer,
      intelDateButton,
      intelGrid,
      focusIntelReason,
      focusIntelPanels,
      focusIntelTabs,
      intelPanelActions,
      intelPanelCustomer,
      intelPanelHistory,
      intelPanelSignals,
      intelPanelMedicine,
      intelPanelTeam,
      intelReasonCopy,
    },
    helpers: {
      asArray,
      asNumber,
      asText,
      buildCustomerHistoryEvents,
      buildCustomerSummaryCards,
      buildFocusHistoryScopeCards,
      buildIntelHelperConversation,
      buildRuntimeSummaryCards,
      buildThreadHistoryEvents,
      compactRuntimeCopy,
      decorateStaticPills,
      escapeHtml,
      filterHistoryEvents,
      formatConversationTime,
      formatHistoryTimestamp,
      getCustomerHistoryMailboxOptions,
      getRelatedCustomerThreads,
      getScopedActivityNotes,
      getSelectedRuntimeThread,
      getStudioSignatureProfile,
      getThreadHistoryMailboxOptions,
      humanizeCode,
      initialsForName,
      isOfflineHistoryContextThread,
      isOfflineHistorySelectionActive,
      joinReadableList,
      normalizeKey,
      normalizeText,
      pillIconSvgs: PILL_ICON_SVGS,
      renderFocusSummaryCards,
      renderHistoryEventsList,
      renderHistoryFilterRow,
      resetRuntimeHistoryFilters,
      sanitizeConversationHtmlForDisplay,
      setButtonBusy,
    },
    state,
    windowObject: window,
  });

  const {
    getMailFeedItems,
    getMailFeedRuntimeThreads,
    getSelectedMailFeedThread,
    renderMailFeedUndoState,
    renderMailFeeds,
    renderQueueHistorySection,
    renderRuntimeQueue,
    renderThreadContextRows,
  } = PREVIEW_QUEUE_RENDERERS.createQueueRenderers({
    dom: {
      laterMetricValueNodes,
      sentMetricValueNodes,
      mailboxMenuGrid,
      mailboxTriggerLabel,
      mailFeedBulkButtons,
      mailFeedDensityButtons,
      mailFeedFilterButtons,
      mailFeedLists,
      mailFeedSelectAllButtons,
      mailFeedSelectionCountNodes,
      mailFeedUndoButtons,
      mailFeedViewButtons,
      ownerMenuGrid,
      ownerMenuNote,
      ownerMenuToggle,
      ownerTriggerLabel,
      queueActiveLaneLabel,
      queueCollapsedList,
      queueContent,
      queueFeedCountNodes,
      queueHistoryCount,
      queueHistoryList,
      queueHistoryLoadMoreButton,
      queueHistoryPanel,
      queueHistoryToggle,
      queueQuickLaneStrip,
      queueLaneButtons,
      queueLaneCountNodes,
      queueSecondarySignalCountNodes,
      queueMailboxScopeCount,
      queueMailboxScopeLabel,
      queuePrimaryLaneTag,
      queueSummaryActNow,
      queueSummaryFocus,
      queueSummaryRisk,
      queueSummarySprint,
      queueTitle,
      queueViewJumpButtons,
      threadContextRows,
    },
    helpers: {
      MAIL_FEEDS,
      QUEUE_ACTIONS,
      QUEUE_LANE_LABELS,
      asArray,
      asText,
      buildAvatarDataUri,
      compactRuntimeCopy,
      createPillIcon,
      decorateStaticPills,
      escapeHtml,
      getAvailableRuntimeMailboxes,
      getAvailableRuntimeOwners,
      getOwnerScopeAvailability,
      getFilteredMailFeedItems,
      getFilteredRuntimeThreads,
      getRuntimeMailboxCapabilityMeta,
      getRuntimeLeftColumnState,
      getQueueLaneThreads,
      getMailFeedRuntimeState,
      getMailFeedSelectedKeys,
      getMailboxScopedRuntimeThreads,
      getOrderedQueueLaneIds,
      getQueueScopedRuntimeThreads,
      getSelectedRuntimeMailboxScopeIds,
      getSelectedRuntimeThread,
      hasRuntimeQueueThreads,
      isHandledRuntimeThread,
      isManualReviewRuntimeThread,
      isLaterRuntimeThread,
      isSentRuntimeThread,
      isUnclearRuntimeThread,
      normalizeKey,
      normalizeMailboxId,
      runtimeConversationIdsMatch,
      threadContextDefinitions: THREAD_CONTEXT,
      toIso,
    },
    state,
    windowObject: window,
  });

  const {
    deleteRuntimeThread,
    handleFocusHistoryDelete,
    handleRuntimeRestoreAction,
    handleRuntimeDeleteAction,
    handleRuntimeHandledAction,
    handleStudioDelete,
    handleStudioMarkHandled,
    handleStudioPreview,
    handleStudioReplyLater,
    handleStudioSaveDraft,
    handleStudioSend,
    loadBootstrap,
    resetWorkspacePrefs,
    saveNote,
    saveSchedule,
    scheduleWorkspacePrefsSave,
  } = PREVIEW_ASYNC_ORCHESTRATION.createAsyncOrchestration({
    dom: {
      focusHistoryMeta,
      focusStatusLine,
      noteFeedback,
      noteSaveButton,
      scheduleFeedback,
      scheduleSaveButton,
      scheduleCategorySelect,
      scheduleCustomerInput,
      scheduleDateInput,
      scheduleDoctorSelect,
      scheduleNotesTextarea,
      scheduleReminderSelect,
      scheduleTimeInput,
      studioDeleteButton,
      studioShell,
      studioComposeSubjectInput,
      studioComposeToInput,
      studioEditorInput,
      studioSaveDraftButton,
      targetLabel,
    },
    helpers: {
      apiRequest,
      applyHandledToThread,
      applyReplyLaterToThread,
      asArray,
      asText,
      buildRuntimeScheduleDraft,
      buildRuntimeSummaryCards,
      createIdempotencyKey,
      createNoteDraft,
      createScheduleDraft,
      DEFAULT_WORKSPACE,
      ensureRuntimeSelection,
      ensureStudioState,
      formatDueLabel,
      getActiveNoteDraft,
      getAdminToken,
      getRuntimeCustomerEmail,
      getRuntimeMailboxCapability,
      getRuntimeFocusReadState,
      getRuntimeStudioTruthState,
      getRuntimeThreadById,
      isOfflineHistoryContextThread,
      getSelectedRuntimeFocusThread,
      getSelectedRuntimeThread,
      getStudioSenderMailboxId,
      getStudioSignatureProfile,
      getStudioSignatureOverride,
      getStudioSourceMailboxId,
      loadBootstrapFeedback(mode, message = "") {
        if (mode === "loading") {
          setFeedback(noteFeedback, "loading", "Laddar anteckning…");
          setFeedback(scheduleFeedback, "loading", "Laddar uppföljning…");
          return;
        }
        if (mode === "error") {
          setFeedback(noteFeedback, "error", message);
          setFeedback(scheduleFeedback, "error", message);
          return;
        }
        setFeedback(noteFeedback, "", "");
        setFeedback(scheduleFeedback, "", "");
      },
      mapPriorityValue,
      mapVisibilityValue,
      normalizeKey,
      normalizeStudioBusyState,
      normalizeText,
      normalizeWorkspaceState,
      patchStudioThreadAfterSend,
      refreshWorkspaceBootstrapForSelectedThread,
      renderFocusHistorySection,
      renderFocusNotesSection,
      renderNoteDestination,
      renderRuntimeConversationShell,
      renderScheduleDraft,
      renderTemplateButtons,
      setButtonBusy,
      setContextCollapsed,
      setFeedback,
      setStudioFeedback,
      setStudioOpen,
      suggestHandledOutcome,
      toIso,
      updateRuntimeThread,
      workspaceState,
    },
    refs: asyncRuntimeRefs,
    state,
    windowObject: window,
  });

  const runtimeActionEngine = PREVIEW_ACTION_ENGINE.createRuntimeActionEngine({
    applyFocusSection,
    applyStudioMode,
    buildIntelReadoutHref,
    buildReauthUrl,
    getSelectedRuntimeThread,
    getRuntimeLeftColumnState,
    handleFocusHistoryDelete,
    isOfflineHistoryContextThread,
    handleRuntimeDeleteAction,
    handleRuntimeRestoreAction,
    handleRuntimeHandledAction,
    laterStatus,
    loadBootstrap,
    noteFeedback,
    openLaterDialog,
    prepareComposeStudioState,
    renderScheduleDraft,
    scheduleFeedback,
    sentStatus,
    setAppView,
    setAuxStatus,
    setContextCollapsed,
    setFeedback,
    setNoteModeOpen,
    setScheduleOpen,
    setStudioOpen,
    state,
    windowObject: window,
  });

  const {
    bindWorkspaceInteractions,
    handleWorkspaceDocumentClick,
    handleWorkspaceDocumentKeydown,
    initializeWorkspaceSurface,
    loadLiveRuntime,
    requestRuntimeThreadHydration,
    selectOfflineHistoryConversation,
    selectRuntimeThread,
  } = PREVIEW_DOM_LIVE_COMPOSITION.createDomLiveComposition({
    dom: {
      canvas,
      closeButtons,
      contextButtons,
      conversationCollapseButton,
      conversationHistory,
      destinationButtons,
      focusActionRows,
      focusHistorySearchInput,
      focusNotesRefreshButton,
      focusSignalRows,
      focusTabButtons,
      intelActionRows,
      laterCloseButtons,
      laterOptionButtons,
      mailboxAdminCloseButtons,
      mailboxAdminFeedback,
      mailboxAdminResetButton,
      mailboxAdminList,
      mailboxAdminOpenButton,
      mailboxAdminSaveButton,
      mailboxAdminSignatureButtons,
      mailboxMenuGrid,
      noteCloseButtons,
      noteFeedback,
      noteModeCloseButtons,
      noteModeOptionButtons,
      noteOpenButtons,
      notePrioritySelect,
      noteSaveButton,
      noteTagAddButton,
      noteTagInput,
      noteTagsRow,
      noteText,
      noteVisibilitySelect,
      openButtons,
      ownerMenuGrid,
      ownerMenuToggle,
      queueActionRows,
      queueCollapsedList,
      queueContent,
      queueHistoryLoadMoreButton,
      queueHistoryToggle,
      queueLaneButtons,
      queueViewJumpButtons,
      resizeHandles,
      scheduleCloseButtons,
      scheduleFeedback,
      scheduleOpenButtons,
      scheduleSaveButton,
      studioDeleteButton,
      studioDoneActionButton,
      studioComposeFromSelect,
      studioComposeSubjectInput,
      studioComposeToInput,
      studioEditorInput,
      studioLaterActionButton,
      studioPreviewButton,
      studioPrimarySuggestion,
      studioRefineButtons,
      studioSaveDraftButton,
      studioSendButton,
      studioSignatureButtons,
      studioTemplateButtons,
      studioToneButtons,
      studioToolButtons,
      studioTrackButtons,
      templateButtons,
    },
    helpers: {
      CCO_DEFAULT_REPLY_SENDER,
      CCO_DEFAULT_SIGNATURE_PROFILE,
      DEFAULT_WORKSPACE,
      FOCUS_ACTIONS,
      FOCUS_SIGNALS,
      INTEL_ACTIONS,
      QUEUE_ACTIONS,
      addTagToActiveDraft,
      apiRequest,
      applyFocusSection,
      applyLaterOption,
      applyMailboxAdminSignatureCommand,
      applyNoteModePreset,
      applyStudioMode,
      applyStudioRefineSelection,
      applyStudioTemplateSelection,
      applyStudioToneSelection,
      applyStudioTrackSelection,
      applyTemplateToActiveDraft,
      asArray,
      asText,
      buildRuntimeMailboxLoadDiagnostics,
      buildRuntimeMailboxCapabilities,
      buildHistoryReadoutHref,
      hydrateRuntimeThreadWithHistoryPayload,
      buildLiveThreads,
      buildMailboxCatalog,
      buildReauthUrl,
      buildTruthPrimaryWorklistConsumerHref,
      canonicalizeRuntimeMailboxId,
      createIdempotencyKey,
      decorateStaticPills,
      ensureCustomerRuntimeProfilesFromLive,
      ensureRuntimeMailboxSelection,
      ensureRuntimeSelection,
      ensureStudioState,
      getFilteredRuntimeThreads,
      getMailFeedRuntimeThreads,
      getAdminToken,
      getMailboxScopedRuntimeThreads,
      getOrderedQueueLaneIds,
      getQueueLaneThreads,
      getQueueScopedRuntimeThreads,
      getQueueHistoryScopeKey,
      getRequestedRuntimeMailboxIds,
      getRuntimeFocusReadState,
      getRuntimeStudioTruthState,
      getTruthPrimaryStudioMailboxIds,
      getTruthPrimaryFocusMailboxIds,
      getTruthPrimaryWorklistMailboxIds,
      reconcileRuntimeSelection,
      getRuntimeLeftColumnState,
      syncSelectedCustomerIdentityForThread,
      getSelectedRuntimeThreadTruth,
      getSelectedRuntimeFocusThread,
      getSelectedRuntimeThread,
      hasMeaningfulRuntimeReentryState,
      getStudioSenderMailboxId,
      getStudioSignatureOverride,
      getStudioSignatureProfiles,
      getStudioSignatureProfile,
      handleFocusHistoryDelete,
      handleMailboxAdminSave,
      handleStudioDelete,
      handleStudioMarkHandled,
      handleStudioPreview,
      handleStudioSaveDraft,
      handleStudioSend,
      handleStudioToolAction,
      inferStudioTrackKey,
      isAuthFailure,
      isTruthPrimaryFocusFeatureEnabled,
      isTruthPrimaryStudioFeatureEnabled,
      loadBootstrap,
      loadQueueHistory,
      normalizeCustomMailboxDefinition,
      normalizeKey,
      normalizeMailboxId,
      normalizeText,
      mergeTruthPrimaryWorklistData,
      runtimeConversationIdsMatch,
      normalizeVisibleRuntimeScope,
      normalizeWorkspaceState,
      openLaterDialog,
      persistCustomMailboxes,
      readPxVariable,
      refreshCustomerIdentitySuggestions,
      removeTagFromActiveDraft,
      renderFocusHistorySection,
      renderMailFeeds,
      renderMailFeedUndoState,
      renderMailboxAdminList,
      renderMailboxOptions,
      renderLaterOptions,
      renderNoteDestination,
      renderQuickActionRows,
      renderQueueLaneShortcutRows,
      renderRuntimeConversationShell,
      renderRuntimeFocusConversation,
      renderQueueHistorySection,
      renderScheduleDraft,
      renderSignalRows,
      renderStudioShell,
      renderTemplateButtons,
      renderThreadContextRows,
      resetMailboxAdminForm,
      resetRuntimeHistoryFilters,
      resetWorkspacePrefs,
      runtimeActionEngine,
      saveNote,
      saveSchedule,
      setAppView,
      setContextCollapsed,
      setFeedback,
      setLaterOpen,
      setMailboxAdminEditingMailbox,
      setMailboxAdminOpen,
      setNoteModeOpen,
      setNoteOpen,
      setScheduleOpen,
      setStudioFeedback,
      setStudioOpen,
      startResize,
      syncCurrentNoteDraftFromForm,
      syncNoteCount,
      workspaceLimits,
      workspaceSourceOfTruth,
      workspaceState,
    },
    state,
    windowObject: window,
  });

  function normalizeCustomMailboxDefinition(mailbox, index = 0) {
    if (!mailbox || typeof mailbox !== "object") return null;
    const email = asText(mailbox.email).toLowerCase();
    const label = asText(mailbox.label || mailbox.name || deriveMailboxLabel(email), "Mailbox");
    const owner = asText(mailbox.owner, "Team");
    let id =
      normalizeMailboxId(mailbox.id) ||
      normalizeMailboxId(email) ||
      slugifyMailboxId(label) ||
      `mailbox-${index + 1}`;
    if (!id) {
      id = `mailbox-${Date.now()}-${index + 1}`;
    }
    return {
      id,
      email,
      label,
      owner,
      toneClass: deriveMailboxToneClass({
        id,
        email,
        label,
        toneClass: mailbox.toneClass,
      }),
      signature: normalizeMailboxSignatureDraft(mailbox.signature || mailbox, {
        email,
        label,
      }),
      custom: true,
      seeded: isDefaultCustomMailboxSignaturePreset({
        id,
        email,
        label,
      }),
    };
  }

  function buildDefaultCustomMailboxDefinitions() {
    return DEFAULT_CUSTOM_MAILBOX_SIGNATURE_PRESETS.map((mailbox, index) =>
      normalizeCustomMailboxDefinition(mailbox, index)
    ).filter(Boolean);
  }

  function mergeDefaultCustomMailboxDefinitions(storedMailboxes = []) {
    const defaultMailboxes = buildDefaultCustomMailboxDefinitions();
    const normalizedStoredMailboxes = asArray(storedMailboxes)
      .map((mailbox, index) => normalizeCustomMailboxDefinition(mailbox, index))
      .filter(Boolean);
    if (!normalizedStoredMailboxes.length) return defaultMailboxes;

    const storedById = new Map();
    const storedByEmail = new Map();
    normalizedStoredMailboxes.forEach((mailbox) => {
      const mailboxId = normalizeMailboxId(mailbox.id);
      const email = normalizeMailboxId(mailbox.email);
      if (mailboxId && !storedById.has(mailboxId)) {
        storedById.set(mailboxId, mailbox);
      }
      if (email && !storedByEmail.has(email)) {
        storedByEmail.set(email, mailbox);
      }
    });

    const usedMailboxKeys = new Set();
    const mergedMailboxes = defaultMailboxes.map((defaultMailbox, index) => {
      const storedMailbox =
        storedById.get(normalizeMailboxId(defaultMailbox.id)) ||
        storedByEmail.get(normalizeMailboxId(defaultMailbox.email)) ||
        null;
      if (!storedMailbox) return defaultMailbox;

      const storedMailboxId = normalizeMailboxId(storedMailbox.id);
      const storedMailboxEmail = normalizeMailboxId(storedMailbox.email);
      if (storedMailboxId) usedMailboxKeys.add(storedMailboxId);
      if (storedMailboxEmail) usedMailboxKeys.add(storedMailboxEmail);

      return normalizeCustomMailboxDefinition(
        {
          ...defaultMailbox,
          ...storedMailbox,
          signature: {
            ...defaultMailbox.signature,
            ...storedMailbox.signature,
          },
        },
        index
      );
    });

    normalizedStoredMailboxes.forEach((mailbox) => {
      const mailboxId = normalizeMailboxId(mailbox.id);
      const mailboxEmail = normalizeMailboxId(mailbox.email);
      if (
        (mailboxId && usedMailboxKeys.has(mailboxId)) ||
        (mailboxEmail && usedMailboxKeys.has(mailboxEmail))
      ) {
        return;
      }
      mergedMailboxes.push(mailbox);
    });

    return mergedMailboxes;
  }

  function loadPersistedCustomMailboxes() {
    try {
      const rawValue = window.localStorage.getItem(CUSTOM_MAILBOXES_STORAGE_KEY);
      if (!rawValue) return buildDefaultCustomMailboxDefinitions();
      const parsed = JSON.parse(rawValue);
      return mergeDefaultCustomMailboxDefinitions(parsed);
    } catch {
      return buildDefaultCustomMailboxDefinitions();
    }
  }

  function persistCustomMailboxes() {
    try {
      const payload = serializeCustomMailboxesForSettings(state.customMailboxes);
      window.localStorage.setItem(CUSTOM_MAILBOXES_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  state.customMailboxes = loadPersistedCustomMailboxes();
  persistCustomMailboxes();

  function findCustomMailboxDefinition(mailboxId = "") {
    const requestedTokens = new Set(
      getMailboxIdentityTokens({
        id: mailboxId,
        email: mailboxId,
        label: mailboxId,
      })
        .map(normalizeMailboxId)
        .filter(Boolean)
    );
    if (!requestedTokens.size) return null;
    return (
      asArray(state.customMailboxes)
        .map((mailbox, index) => normalizeCustomMailboxDefinition(mailbox, index))
        .find(
          (mailbox) =>
            mailbox &&
            getMailboxIdentityTokens(mailbox).some((token) =>
              requestedTokens.has(normalizeMailboxId(token))
            )
        ) || null
    );
  }

  function getAvailableRuntimeMailboxes() {
    const merged = new Map();

    LEGACY_RUNTIME_MAILBOXES.forEach((mailbox, index) => {
      if (!mailbox?.id || merged.has(mailbox.id)) return;
      merged.set(mailbox.id, {
        ...mailbox,
        order: index,
        hasLiveSource: true,
        liveSourceKind: "legacy_preset",
        localSignatureDefinition: null,
        identityTokens: getMailboxIdentityTokens(mailbox),
      });
    });

    asArray(state.runtime.mailboxes).forEach((mailbox, index) => {
      const id = normalizeMailboxId(mailbox?.id || mailbox?.email);
      if (!id) return;
      const runtimeMailbox = {
        ...(mailbox && typeof mailbox === "object" ? mailbox : {}),
        id,
        email: asText(mailbox?.email || mailbox?.id).toLowerCase(),
        label: asText(mailbox?.label, titleCaseMailbox(mailbox?.email || mailbox?.id)),
        owner: asText(mailbox?.owner, "Live"),
        custom: mailbox?.custom === true,
        order: LEGACY_RUNTIME_MAILBOXES.length + index,
        toneClass: asText(mailbox?.toneClass),
        hasLiveSource: true,
        liveSourceKind: "runtime",
        localSignatureDefinition: null,
      };
      const existingKey = findExistingMailboxKey(merged, runtimeMailbox);
      const key = existingKey || runtimeMailbox.id;
      if (merged.has(key)) {
        const existing = merged.get(key);
        const mergedMailbox = {
          ...runtimeMailbox,
          ...existing,
          id: key,
          email: runtimeMailbox.email || existing.email,
          label: existing.label || runtimeMailbox.label,
          owner: runtimeMailbox.owner || existing.owner,
          custom: false,
          order: existing.order ?? runtimeMailbox.order,
          toneClass: existing.toneClass || runtimeMailbox.toneClass || "",
          hasLiveSource: true,
          liveSourceKind: existing.liveSourceKind || runtimeMailbox.liveSourceKind || "runtime",
          localSignatureDefinition: existing.localSignatureDefinition || null,
        };
        mergedMailbox.identityTokens = getMailboxIdentityTokens(mergedMailbox);
        merged.set(key, mergedMailbox);
        return;
      }
      runtimeMailbox.identityTokens = getMailboxIdentityTokens(runtimeMailbox);
      merged.set(key, runtimeMailbox);
    });

    asArray(state.customMailboxes).forEach((mailbox, index) => {
      const normalized = normalizeCustomMailboxDefinition(mailbox, index);
      if (!normalized) return;
      const key = findExistingMailboxKey(merged, normalized) || normalized.id;
      if (merged.has(key)) {
        const existing = merged.get(key);
        const mergedMailbox =
          existing.hasLiveSource === true
            ? {
                ...existing,
                id: key,
                signature: normalized.signature,
                order:
                  existing.order ??
                  normalized.order ??
                  LEGACY_RUNTIME_MAILBOXES.length + index,
                localSignatureDefinition: normalized,
              }
            : {
                ...existing,
                ...normalized,
                id: key,
                label: normalized.label || existing.label,
                email: normalized.email || existing.email,
                custom: true,
                order:
                  existing.order ??
                  normalized.order ??
                  LEGACY_RUNTIME_MAILBOXES.length + index,
                toneClass: existing.toneClass || normalized.toneClass || "",
                hasLiveSource: false,
                localSignatureDefinition: normalized,
              };
        mergedMailbox.identityTokens = getMailboxIdentityTokens(mergedMailbox);
        merged.set(key, mergedMailbox);
        return;
      }
      const customMailbox = {
        ...normalized,
        id: key,
        order: LEGACY_RUNTIME_MAILBOXES.length + asArray(state.runtime.mailboxes).length + index,
        toneClass: normalized.toneClass || "",
        hasLiveSource: false,
        liveSourceKind: "custom",
        localSignatureDefinition: normalized,
      };
      customMailbox.identityTokens = getMailboxIdentityTokens(customMailbox);
      merged.set(key, customMailbox);
    });

    return Array.from(merged.values())
      .map((mailbox) => ({
        ...finalizeRuntimeMailboxSurface(mailbox),
        canonicalId: getRuntimeMailboxCanonicalId(mailbox),
      }))
      .sort((left, right) => {
      const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return asText(left?.label).localeCompare(asText(right?.label), "sv");
      });
  }

  function ensureRuntimeMailboxSelection() {
    const availableIds = getCanonicalAvailableRuntimeMailboxIds();
    const preferredMailboxId = getPreferredOperationalMailboxId();
    if (!availableIds.length) {
      return;
    }
    const selectedMailboxIds = workspaceSourceOfTruth.getSelectedMailboxIds();
    if (!selectedMailboxIds.length) {
      workspaceSourceOfTruth.setSelectedMailboxIds(
        preferredMailboxId && availableIds.includes(preferredMailboxId)
          ? [preferredMailboxId]
          : [...availableIds]
      );
      return;
    }
    const validIds = new Set(availableIds);
    workspaceSourceOfTruth.setSelectedMailboxIds(
      selectedMailboxIds.filter((id) => validIds.has(canonicalizeRuntimeMailboxId(id)))
    );
    if (!workspaceSourceOfTruth.getSelectedMailboxIds().length) {
      workspaceSourceOfTruth.setSelectedMailboxIds(
        preferredMailboxId && availableIds.includes(preferredMailboxId)
          ? [preferredMailboxId]
          : [...availableIds]
      );
    }
  }

  function getMailboxScopedRuntimeThreads() {
    const availableMailboxes = getAvailableRuntimeMailboxes();
    const selectedMailboxIds = asArray(state.runtime.selectedMailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value, availableMailboxes))
      .filter(Boolean);
    const threads = Array.isArray(state.runtime.threads) ? state.runtime.threads : [];
    if (!selectedMailboxIds.length) {
      return availableMailboxes.length ? [] : threads;
    }
    const allowedMailboxTokens = new Set();

    selectedMailboxIds.forEach((selectedMailboxId) => {
      const matchedMailbox = findRuntimeMailboxByScopeId(selectedMailboxId, availableMailboxes);
      const mailboxTokens = matchedMailbox
        ? getMailboxIdentityTokens(matchedMailbox)
        : [selectedMailboxId];
      mailboxTokens.forEach((token) => {
        const normalizedToken = normalizeMailboxId(token);
        if (normalizedToken) allowedMailboxTokens.add(normalizedToken);
      });
    });

    return threads.filter((thread) => {
      const threadMailboxTokens = getMailboxIdentityTokens({
        id: thread?.mailboxAddress,
        email: thread?.mailboxAddress,
        label: thread?.mailboxLabel,
      });
      return threadMailboxTokens.some((token) => allowedMailboxTokens.has(normalizeMailboxId(token)));
    });
  }

  function normalizeVisibleRuntimeScope(options = {}) {
    const allThreads = Array.isArray(state.runtime.threads) ? state.runtime.threads : [];
    const selectionOptions = {
      preferredThreadId: Object.prototype.hasOwnProperty.call(options, "preferredThreadId")
        ? options.preferredThreadId
        : workspaceSourceOfTruth.getSelectedThreadId(),
      resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
    };
    if (!allThreads.length) {
      return reconcileRuntimeSelection([], selectionOptions);
    }

    if (normalizePrimaryQueueLaneId(workspaceSourceOfTruth.getActiveLaneId()) === "all") {
      if (normalizeKey(workspaceSourceOfTruth.getActiveLaneId() || "all") !== "all") {
        workspaceSourceOfTruth.setActiveLaneId("all");
      }
    }

    if (
      !getQueueScopedRuntimeThreads().length &&
      normalizeKey(workspaceSourceOfTruth.getSelectedOwnerKey() || "all") !== "all"
    ) {
      workspaceSourceOfTruth.setSelectedOwnerKey("all");
    }

    if (
      !getFilteredRuntimeThreads().length &&
      normalizeKey(workspaceSourceOfTruth.getActiveLaneId() || "all") !== "all"
    ) {
      workspaceSourceOfTruth.setActiveLaneId("all");
    }

    let visibleThreads = getFilteredRuntimeThreads();
    if (!visibleThreads.length && options.allowLaneFallback) {
      const activeQueueThreads = getQueueScopedRuntimeThreads().filter((thread) => !isHandledRuntimeThread(thread));
      if (activeQueueThreads.length) {
        const preferredThreadId = asText(selectionOptions.preferredThreadId);
        const orderedLaneIds = getOrderedQueueLaneIds();
        const preferredLaneId = orderedLaneIds.find((laneId) =>
          getQueueLaneThreads(laneId, activeQueueThreads).some(
            (thread) => runtimeConversationIdsMatch(thread?.id, preferredThreadId)
          )
        );
        const preferredOperationalLaneId = orderedLaneIds.find((laneId) =>
          getQueueLaneThreads(laneId, activeQueueThreads).some(
            (thread) => !isVerificationRuntimeThread(thread)
          )
        );
        const fallbackLaneId =
          preferredLaneId ||
          preferredOperationalLaneId ||
          orderedLaneIds.find((laneId) => getQueueLaneThreads(laneId, activeQueueThreads).length) ||
          "";
        if (fallbackLaneId) {
          workspaceSourceOfTruth.setActiveLaneId(fallbackLaneId);
          visibleThreads = getFilteredRuntimeThreads();
        }
      }
    }

    return reconcileRuntimeSelection(visibleThreads, selectionOptions);
  }

  function getAvailableRuntimeOwners() {
    const owners = new Map();
    let hasUnassigned = false;

    getMailboxScopedRuntimeThreads().forEach((thread) => {
      const ownerKey = normalizeKey(thread.ownerKey || thread.ownerLabel);
      if (!ownerKey || ownerKey === "unassigned" || ownerKey === "oägd") {
        hasUnassigned = true;
        return;
      }
      if (owners.has(ownerKey)) return;
      owners.set(ownerKey, {
        id: ownerKey,
        label: asText(thread.ownerLabel, "Oägd"),
      });
    });

    const items = [{ id: "all", label: "Alla ägare" }];
    if (hasUnassigned) {
      items.push({ id: "unassigned", label: "Oägd" });
    }
    const listed = items.concat(Array.from(owners.values()));
    const selectedOwnerKey = normalizeKey(state.runtime.selectedOwnerKey || "all");
    if (selectedOwnerKey !== "all" && !listed.some((item) => item.id === selectedOwnerKey)) {
      const fallbackOwner = asArray(state.runtime.threads).find(
        (thread) => normalizeKey(thread.ownerKey || thread.ownerLabel) === selectedOwnerKey
      );
      listed.push({
        id: selectedOwnerKey,
        label:
          selectedOwnerKey === "unassigned"
            ? "Oägd"
            : asText(fallbackOwner?.ownerLabel, "Ägare"),
      });
    }
    return listed;
  }

  function getOwnerScopeAvailability(ownerOptions = getAvailableRuntimeOwners()) {
    const options = asArray(ownerOptions);
    const namedOwners = options.filter(
      (owner) => owner && owner.id !== "all" && owner.id !== "unassigned"
    );
    const hasUnassigned = options.some((owner) => owner && owner.id === "unassigned");
    if (namedOwners.length) {
      return {
        hasNamedOwners: true,
        limitedByFixture: false,
        disableMenu: false,
        note: "",
      };
    }
    if (hasUnassigned) {
      return {
        hasNamedOwners: false,
        limitedByFixture: true,
        disableMenu: false,
        note: "Aktuell fixture skiljer bara mellan Alla ägare och Oägd. Inga namngivna ägare exponeras i detta scope.",
      };
    }
    return {
      hasNamedOwners: false,
      limitedByFixture: true,
      disableMenu: true,
      note: "Aktuell fixture exponerar bara Alla ägare. Ingen separat ägarvy finns att välja just nu.",
    };
  }

  function getQueueScopedRuntimeThreads() {
    const ownerKey = normalizeKey(state.runtime.selectedOwnerKey || "all");
    const threads = getMailboxScopedRuntimeThreads();
    if (!threads.length || ownerKey === "all") return threads;
    if (ownerKey === "unassigned") {
      return threads.filter((thread) =>
        normalizeKey(thread.ownerKey || thread.ownerLabel) === "unassigned" ||
        normalizeKey(thread.ownerLabel) === "oägd"
      );
    }
    return threads.filter((thread) => normalizeKey(thread.ownerKey || thread.ownerLabel) === ownerKey);
  }

  function getQueueLaneThreads(laneId, threads = getQueueScopedRuntimeThreads()) {
    const normalizedLane = normalizePrimaryQueueLaneId(laneId);
    const activeQueueThreads = threads.filter((thread) => !isHandledRuntimeThread(thread));
    if (normalizedLane === "all") {
      return activeQueueThreads;
    }
    return activeQueueThreads.filter((thread) => getThreadPrimaryLaneId(thread) === normalizedLane);
  }

  function getFilteredRuntimeThreads() {
    return getQueueLaneThreads(normalizePrimaryQueueLaneId(state.runtime.activeLaneId || "all"));
  }

  function getOrderedQueueLaneIds() {
    const allowed = new Set(QUEUE_LANE_ORDER);
    const persisted = asArray(state.runtime.orderedLaneIds).filter((id) => allowed.has(id));
    const missing = QUEUE_LANE_ORDER.filter((id) => !persisted.includes(id));
    return [...persisted, ...missing];
  }

  function hasRuntimeQueueThreads() {
    return Array.isArray(state.runtime?.threads) && state.runtime.threads.length > 0;
  }

  function getRuntimeLeftColumnState() {
    const inlinePanelState =
      state.runtime && typeof state.runtime.queueInlinePanel === "object"
        ? state.runtime.queueInlinePanel
        : {};
    const historyState =
      state.runtime && typeof state.runtime.queueHistory === "object"
        ? state.runtime.queueHistory
        : {};
    const activeLaneId = normalizePrimaryQueueLaneId(state.runtime.activeLaneId || "all");
    const feedKey = normalizeKey(inlinePanelState.feedKey || "");
    const laneId = normalizeKey(inlinePanelState.laneId || activeLaneId || "all") || activeLaneId;

    if (historyState.open) {
      return {
        mode: "history",
        feedKey: "",
        laneId: "",
        open: true,
      };
    }

    if (inlinePanelState.open && feedKey) {
      return {
        mode: "feed",
        feedKey,
        laneId: "",
        open: true,
      };
    }

    if (inlinePanelState.open) {
      return {
        mode: "lane",
        feedKey: "",
        laneId,
        open: true,
      };
    }

    if (getRuntimeMode() === "offline_history") {
      return {
        mode: "offline_history",
        feedKey: "",
        laneId: activeLaneId,
        open: false,
      };
    }

    return {
      mode: "default",
      feedKey: "",
      laneId: activeLaneId,
      open: false,
    };
  }

  function normalizeRuntimeConversationId(value) {
    return asText(value).trim().toLowerCase();
  }

  function runtimeConversationIdsMatch(left, right) {
    const normalizedLeft = normalizeRuntimeConversationId(left);
    const normalizedRight = normalizeRuntimeConversationId(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
  }

  function getSelectedQueueHistoryConversationId() {
    return asText(state.runtime?.queueHistory?.selectedConversationId);
  }

  function getQueueHistoryItemByConversationId(conversationId) {
    return (
      asArray(state.runtime?.queueHistory?.items).find((item) =>
        runtimeConversationIdsMatch(item?.conversationId, conversationId)
      ) || null
    );
  }

  function isOfflineHistoryContextThread(thread) {
    return Boolean(
      thread &&
        typeof thread === "object" &&
        (thread.offlineHistorySelection === true || thread.raw?.offlineHistorySelection === true)
    );
  }

  function createOfflineHistoryContextThread(thread, historyItem = null) {
    if (!thread || typeof thread !== "object") return null;
    if (isOfflineHistoryContextThread(thread)) return thread;
    return {
      ...thread,
      offlineHistorySelection: true,
      offlineContextMode: "read_only",
      offlineContextLabel: "Offline historik",
      historyQueueItem: historyItem || null,
      raw: {
        ...(thread.raw && typeof thread.raw === "object" ? thread.raw : {}),
        offlineHistorySelection: true,
        offlineContextLabel: "Offline historik",
      },
    };
  }

  function buildOfflineHistoryFallbackThread(historyItem) {
    if (!historyItem || typeof historyItem !== "object") return null;
    const normalizedDirection = normalizeKey(historyItem.direction || "mottaget");
    const syntheticMessage = {
      conversationId: asText(historyItem.conversationId || historyItem.id),
      mailboxId: asText(historyItem.mailboxId),
      mailboxAddress: asText(historyItem.mailboxId),
      userPrincipalName: asText(historyItem.mailboxId),
      customerEmail: asText(historyItem.customerEmail),
      counterpartyEmail: asText(historyItem.customerEmail),
      counterpartyName: asText(historyItem.counterpartyLabel),
      senderName: asText(historyItem.counterpartyLabel),
      senderEmail: asText(historyItem.customerEmail),
      subject: asText(historyItem.title, "Historikrad"),
      bodyPreview: asText(historyItem.detail, "Ingen förhandsvisning tillgänglig."),
      sentAt: asText(historyItem.recordedAt),
      direction: normalizedDirection === "skickat" ? "outbound" : "inbound",
    };
    const row = buildHistoryBackedRuntimeRow({
      conversationId: syntheticMessage.conversationId,
      messages: [syntheticMessage],
      events: [],
      liveRow: null,
    });
    const thread = buildRuntimeThread(row, {
      feedEntries: buildHistoryFeedEntries([syntheticMessage]),
      historyEvents: [],
    });
    return createOfflineHistoryContextThread(thread, historyItem);
  }

  function getSelectedOfflineHistoryThread() {
    const conversationId = getSelectedQueueHistoryConversationId();
    if (!conversationId) return null;
    const runtimeThread =
      asArray(state.runtime?.threads).find((candidate) =>
        runtimeConversationIdsMatch(candidate?.id, conversationId)
      ) || null;
    const historyItem = getQueueHistoryItemByConversationId(conversationId);
    if (runtimeThread) {
      return createOfflineHistoryContextThread(runtimeThread, historyItem);
    }
    return buildOfflineHistoryFallbackThread(historyItem);
  }

  function isOfflineHistoryReadOnlyMode() {
    return (
      getRuntimeLeftColumnState().mode === "history" &&
      Boolean(asText(getSelectedQueueHistoryConversationId()))
    );
  }

  function isOfflineHistorySelectionActive() {
    return isOfflineHistoryReadOnlyMode();
  }

  function getSelectedRuntimeThreadTruth() {
    const selectedThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());
    const leftColumnState = getRuntimeLeftColumnState();
    const runtimeMode = getRuntimeMode();
    const queueHistoryConversationId = getSelectedQueueHistoryConversationId();
    const pickThread = (threads = []) => {
      const candidates = asArray(threads);
      if (!candidates.length) return null;
      const selected = candidates.find((thread) =>
        runtimeConversationIdsMatch(thread?.id, selectedThreadId)
      );
      if (selected) return selected;
      return (
        candidates.find((thread) => !isVerificationRuntimeThread(thread)) ||
        candidates[0] ||
        null
      );
    };

    const getInlinePanelFeedThreads = (feedKey) => {
      const normalizedFeed = normalizeKey(feedKey);
      const scopedThreads = getMailboxScopedRuntimeThreads();
      if (normalizedFeed === "later") {
        return scopedThreads.filter(isLaterRuntimeThread);
      }
      if (normalizedFeed === "sent") {
        return scopedThreads.filter(isSentRuntimeThread);
      }
      return [];
    };

    let runtimeThread = null;
    let runtimeSource = "";

    const offlineHistoryWithoutSelection =
      leftColumnState.mode === "history" &&
      normalizeKey(runtimeMode) === "offline_history" &&
      !asText(queueHistoryConversationId);

    if (leftColumnState.mode === "history") {
      if (offlineHistoryWithoutSelection) {
        runtimeSource = "offline_history_empty";
      } else if (isOfflineHistoryReadOnlyMode()) {
        runtimeThread = getSelectedOfflineHistoryThread();
        runtimeSource = runtimeThread ? "offline_history" : "offline_history_empty";
      } else {
        runtimeThread = pickThread(getQueueScopedRuntimeThreads());
        runtimeSource = runtimeThread ? "history_queue_scope" : "";
        if (!runtimeThread) {
          runtimeThread = pickThread(getMailboxScopedRuntimeThreads());
          runtimeSource = runtimeThread ? "history_mailbox_scope" : runtimeSource;
        }
        if (!runtimeThread) {
          runtimeThread = pickThread(state.runtime.threads);
          runtimeSource = runtimeThread ? "history_runtime_scope" : "history_empty";
        }
      }
    }

    if (!runtimeThread && !offlineHistoryWithoutSelection && leftColumnState.mode === "feed" && leftColumnState.feedKey) {
      runtimeThread = pickThread(getInlinePanelFeedThreads(leftColumnState.feedKey));
      runtimeSource = runtimeThread ? `feed_${normalizeKey(leftColumnState.feedKey, "scope")}` : runtimeSource;
    }

    if (!runtimeThread && !offlineHistoryWithoutSelection && leftColumnState.mode === "lane") {
      runtimeThread = pickThread(
        getQueueLaneThreads(
          leftColumnState.laneId || state.runtime.activeLaneId || "all",
          getQueueScopedRuntimeThreads()
        )
      );
      runtimeSource = runtimeThread ? "lane_scope" : runtimeSource;
    }

    if (!runtimeThread && !offlineHistoryWithoutSelection) {
      const visibleThread = pickThread(getFilteredRuntimeThreads());
      if (visibleThread) {
        runtimeThread = visibleThread;
        runtimeSource =
          leftColumnState.mode === "offline_history" ? "offline_visible_scope" : "filtered_scope";
      }
    }

    if (
      !runtimeThread &&
      !offlineHistoryWithoutSelection &&
      (!state.runtime.live || state.runtime.authRequired || state.runtime.loading)
    ) {
      runtimeSource =
        leftColumnState.mode === "offline_history"
          ? "offline_unavailable"
          : "runtime_unavailable";
    }

    if (!runtimeThread && !offlineHistoryWithoutSelection) {
      runtimeThread = pickThread(getQueueScopedRuntimeThreads());
      runtimeSource = runtimeThread ? "queue_scope_fallback" : runtimeSource;
    }
    if (!runtimeThread && !offlineHistoryWithoutSelection) {
      runtimeThread = pickThread(getMailboxScopedRuntimeThreads());
      runtimeSource = runtimeThread ? "mailbox_scope_fallback" : runtimeSource;
    }
    if (!runtimeThread && !offlineHistoryWithoutSelection) {
      runtimeThread = pickThread(state.runtime.threads);
      runtimeSource = runtimeThread ? "runtime_scope_fallback" : runtimeSource;
    }

    const mailboxId = canonicalizeRuntimeMailboxId(
      runtimeThread?.mailboxAddress ||
        runtimeThread?.raw?.mailboxAddress ||
        runtimeThread?.raw?.mailboxId ||
        runtimeThread?.mailboxLabel
    );
    const activeFocusMailboxIds = new Set(
      asArray(state.runtime?.focusTruthPrimary?.activeMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
    );
    const focusScopeActive =
      Boolean(mailboxId) &&
      activeFocusMailboxIds.has(mailboxId);
    const focusTruthPrimaryEnabled = state.runtime?.focusTruthPrimary?.enabled === true;
    const legacyFocusThread =
      runtimeThread && focusScopeActive && focusTruthPrimaryEnabled !== true
        ? getLegacyRuntimeThreadById(runtimeThread.id)
        : null;
    const focusThread = legacyFocusThread || runtimeThread || null;
    const focusSource = legacyFocusThread ? "legacy_focus_fallback" : runtimeSource || "none";

    return {
      selectedThreadId,
      queueHistoryConversationId: asText(queueHistoryConversationId),
      runtimeMode: normalizeKey(runtimeMode || "live"),
      leftColumnMode: normalizeKey(leftColumnState.mode || "default") || "default",
      runtimeThread,
      runtimeSource: normalizeKey(runtimeSource || "none"),
      focusThread,
      focusSource: normalizeKey(focusSource || "none"),
      focusScopeActive,
      focusTruthPrimaryEnabled,
      offlineHistoryReadOnly: isOfflineHistoryReadOnlyMode(),
    };
  }

  function getSelectedRuntimeThread() {
    return getSelectedRuntimeThreadTruth().runtimeThread;
  }

  function getLegacyRuntimeThreadById(threadId) {
    const selectedThreadId = asText(threadId);
    if (!selectedThreadId) return null;
    return (
      asArray(state.runtime?.truthPrimaryLegacyThreads).find((candidate) =>
        runtimeConversationIdsMatch(candidate?.id, selectedThreadId)
      ) || null
    );
  }

  function getSelectedRuntimeFocusThread() {
    const focusThread = getSelectedRuntimeThreadTruth().focusThread;
    if (focusThread && state.runtime?.loading === true) {
      return focusThread;
    }
    if (
      focusThread &&
      state.runtime?.authRequired === true &&
      typeof isLocalPreviewHost === "function" &&
      isLocalPreviewHost()
    ) {
      return focusThread;
    }
    if (state.runtime?.authRequired === true) {
      return null;
    }
    return focusThread;
  }

  function getRuntimeFocusReadState(thread = null) {
    const focusThread = thread || getSelectedRuntimeFocusThread();
    if (!focusThread) {
      return {
        source: "legacy",
        truthDriven: false,
        readOnly: false,
        label: "Legacy focus",
        detail: "",
        waveLabel: "",
      };
    }

    const mailboxId = canonicalizeRuntimeMailboxId(
      focusThread?.mailboxAddress ||
        focusThread?.raw?.mailboxAddress ||
        focusThread?.raw?.mailboxId ||
        focusThread?.mailboxLabel
    );
    const activeMailboxIds = new Set(
      asArray(state.runtime?.focusTruthPrimary?.activeMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
    );
    const mailboxInScope = Boolean(mailboxId) && activeMailboxIds.has(mailboxId);
    const truthDriven =
      mailboxInScope &&
      state.runtime?.focusTruthPrimary?.enabled === true &&
      normalizeKey(focusThread?.worklistSource || focusThread?.raw?.worklistSource || "legacy") ===
        "truth_primary";
    const readOnly = truthDriven && FOCUS_TRUTH_PRIMARY?.readOnly !== false;
    const foundationState = resolveRuntimeFoundationState(focusThread);
    const foundationProvenance =
      foundationState &&
      (normalizeKey(foundationState?.source) || asNumber(foundationState?.messageCount, 0) > 0)
        ? {
            foundationDriven: true,
            fallbackDriven: false,
            foundationLabel: asText(foundationState?.label, "Mail foundation"),
            foundationDetail: `Öppnat mail läser nu primärt canonical threaddata från ${asText(
              foundationState?.source,
              "mail foundation"
            )}.`,
            fallbackLabel: "",
            fallbackDetail: "",
          }
        : {
            foundationDriven: false,
            fallbackDriven: true,
            foundationLabel: "",
            foundationDetail: "",
            fallbackLabel: "Legacy fallback",
            fallbackDetail:
              "Canonical threaddata saknas för den här tråden just nu, så fokusytan läser preview/body via kompatibilitetskedjan.",
          };

    if (truthDriven) {
      return {
        source: "truth_primary",
        truthDriven: true,
        readOnly,
        label: "Truth-driven focus",
        detail:
          "Trådid, meddelandeordning, mailboxidentitet, riktning, tidsstämplar och unread-läge läses från mailbox truth och mailbox truth history i wave 1. Reply- och studioflödet ligger kvar utanför detta pass.",
        waveLabel: asText(
          focusThread?.worklistWaveLabel || focusThread?.raw?.worklistWaveLabel,
          "Wave 1"
        ),
        ...foundationProvenance,
      };
    }

    if (mailboxInScope && state.runtime?.focusTruthPrimary?.enabled !== true) {
      return {
        source: "legacy",
        truthDriven: false,
        readOnly: false,
        label: "Legacy focus",
        detail: asText(
          state.runtime?.focusTruthPrimary?.fallbackReason,
          "Truth-driven focus är avstängd för wave 1. Fokusytan läser legacy-tråden medan worklisten fortsatt kan vara truth-primary."
        ),
        waveLabel: "Wave 1 rollback",
        ...foundationProvenance,
      };
    }

    return {
      source: "legacy",
      truthDriven: false,
      readOnly: false,
      label: "Legacy focus",
      detail: foundationProvenance.foundationDetail || foundationProvenance.fallbackDetail,
      waveLabel: "",
      ...foundationProvenance,
    };
  }

  function getRuntimeStudioTruthState(thread = null) {
    const studioThread = thread || getSelectedRuntimeThread();
    if (!studioThread) {
      return {
        source: "legacy",
        truthDriven: false,
        inConfiguredScope: false,
        writeAllowed: false,
        senderLocked: false,
        label: "Legacy studio",
        detail: "",
        waveLabel: "",
        sourceMailboxId: "",
        sourceMailboxLabel: "",
        selectedSignatureId: "",
        senderMailboxId: "",
        replyContextThreadId: "",
      };
    }

    const mailboxId = canonicalizeRuntimeMailboxId(
      studioThread?.mailboxAddress ||
        studioThread?.raw?.mailboxAddress ||
        studioThread?.raw?.mailboxId ||
        studioThread?.mailboxLabel
    );
    const configuredMailboxIds = new Set(
      asArray(state.runtime?.studioTruthPrimary?.configuredMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
    );
    const activeMailboxIds = new Set(
      asArray(state.runtime?.studioTruthPrimary?.activeMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
    );
    const mailboxConfigured = Boolean(mailboxId) && configuredMailboxIds.has(mailboxId);
    const mailboxInScope = Boolean(mailboxId) && activeMailboxIds.has(mailboxId);
    const truthDriven =
      mailboxInScope &&
      state.runtime?.studioTruthPrimary?.enabled === true &&
      normalizeKey(
        studioThread?.worklistSource || studioThread?.raw?.worklistSource || "legacy"
      ) === "truth_primary";
    const sourceMailboxId = asText(mailboxId);
    const sourceMailboxLabel = getStudioSourceMailboxLabel(sourceMailboxId);
    const lockedSignatureProfile = truthDriven
      ? getStudioReplyDefaultSignatureProfile(studioThread)
      : null;

    if (truthDriven) {
      return {
        source: "truth_primary",
        truthDriven: true,
        inConfiguredScope: true,
        writeAllowed: true,
        senderLocked: true,
        label: "Truth-driven studio",
        detail:
          "Reply-context, källmailbox, trådid, medlemskap, meddelandeordning och unread-läge är låsta till mailbox truth i wave 1. Studion får skriva bara i detta låsta scope.",
        waveLabel: asText(
          studioThread?.worklistWaveLabel || studioThread?.raw?.worklistWaveLabel,
          "Wave 1"
        ),
        sourceMailboxId,
        sourceMailboxLabel,
        selectedSignatureId: asText(lockedSignatureProfile?.id),
        senderMailboxId: getStudioSenderMailboxId(asText(lockedSignatureProfile?.id), studioThread),
        replyContextThreadId: asText(studioThread?.id),
      };
    }

    if (mailboxConfigured || mailboxInScope) {
      return {
        source: "legacy",
        truthDriven: false,
        inConfiguredScope: true,
        writeAllowed: true,
        senderLocked: false,
        label: "Legacy studio",
        detail: asText(
          state.runtime?.studioTruthPrimary?.fallbackReason,
          "Truth-driven studio är avstängd för wave 1. Studion läser och skriver via legacy-kedjan tills truth-pathen åter är aktiv."
        ),
        waveLabel: "Wave 1 rollback",
        sourceMailboxId,
        sourceMailboxLabel,
        selectedSignatureId: "",
        senderMailboxId: "",
        replyContextThreadId: asText(studioThread?.id),
      };
    }

    return {
      source: "legacy",
      truthDriven: false,
      inConfiguredScope: false,
      writeAllowed: true,
      senderLocked: false,
      label: "Legacy studio",
      detail: "",
      waveLabel: "",
      sourceMailboxId,
      sourceMailboxLabel,
      selectedSignatureId: "",
      senderMailboxId: "",
      replyContextThreadId: asText(studioThread?.id),
    };
  }

  function reconcileRuntimeSelection(visibleThreads = getFilteredRuntimeThreads(), options = {}) {
    const visible = asArray(visibleThreads);
    const preferredThreadId = Object.prototype.hasOwnProperty.call(options, "preferredThreadId")
      ? asText(options.preferredThreadId)
      : asText(workspaceSourceOfTruth.getSelectedThreadId());
    const currentThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());

    function findPreferredThreadAcrossRuntime() {
      if (!asText(preferredThreadId)) return null;
      const pools = [
        visible,
        asArray(state.runtime?.threads),
        asArray(state.runtime?.truthPrimaryLegacyThreads),
      ];
      for (const pool of pools) {
        const hit = asArray(pool).find((thread) =>
          runtimeConversationIdsMatch(thread?.id, preferredThreadId)
        );
        if (hit) return hit;
      }
      return null;
    }

    const preferredResolved = findPreferredThreadAcrossRuntime();
    const nextThread =
      preferredResolved ||
      visible.find((thread) => !isVerificationRuntimeThread(thread)) ||
      visible[0] ||
      null;
    const nextThreadId = asText(
      nextThread?.id ||
        ""
    );
    const changed = nextThreadId !== currentThreadId;
    const nextMailboxIds = getThreadHistoryMailboxOptions(nextThread)
      .map((option) => canonicalizeRuntimeMailboxId(option?.id))
      .filter(Boolean);
    const currentMailboxIds = getSelectedRuntimeMailboxScopeIds();
    const mailboxScopeChanged =
      nextMailboxIds.length > 0 &&
      (nextMailboxIds.length !== currentMailboxIds.length ||
        nextMailboxIds.some(
          (mailboxId, index) => canonicalizeRuntimeMailboxId(currentMailboxIds[index]) !== mailboxId
        ));

    if (changed) {
      workspaceSourceOfTruth.setSelectedThreadId(nextThreadId);
      if (options.resetHistoryOnChange) {
        state.runtime.historyContextThreadId = "";
        resetRuntimeHistoryFilters();
      }
    }
    const preserveMailboxScope = state.runtime.mailboxScopePinned === true || Boolean(options.preserveMailboxSelection);
    if (mailboxScopeChanged && !preserveMailboxScope) {
      workspaceSourceOfTruth.setSelectedMailboxIds(nextMailboxIds);
    }

    return {
      changed,
      previousSelectedThreadId: currentThreadId,
      selectedThreadId: nextThreadId,
    };
  }

  function ensureRuntimeSelection() {
    const leftColumnState = getRuntimeLeftColumnState();
    if (leftColumnState.mode === "history") {
      if (isOfflineHistoryReadOnlyMode()) {
        const previousSelectedThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());
        const nextSelectedThreadId = getSelectedQueueHistoryConversationId();
        const changed = !runtimeConversationIdsMatch(
          previousSelectedThreadId,
          nextSelectedThreadId
        );
        if (changed) {
          workspaceSourceOfTruth.setSelectedThreadId(nextSelectedThreadId);
        }
        return {
          changed,
          previousSelectedThreadId,
          selectedThreadId: asText(nextSelectedThreadId),
        };
      }
      return reconcileRuntimeSelection(
        getQueueScopedRuntimeThreads().length
          ? getQueueScopedRuntimeThreads()
          : getMailboxScopedRuntimeThreads()
      );
    }

    if (leftColumnState.mode === "feed") {
      const feedThreads = leftColumnState.feedKey
        ? getMailFeedRuntimeThreads(leftColumnState.feedKey)
        : [];
      return reconcileRuntimeSelection(feedThreads);
    }

    if (leftColumnState.mode === "lane") {
      return reconcileRuntimeSelection(
        getQueueLaneThreads(leftColumnState.laneId || state.runtime.activeLaneId || "all", getQueueScopedRuntimeThreads())
      );
    }

    const visibleThreads = getFilteredRuntimeThreads();
    if (
      !visibleThreads.length &&
      leftColumnState.mode === "default"
    ) {
      return normalizeVisibleRuntimeScope({
        allowLaneFallback: true,
        preferredThreadId: workspaceSourceOfTruth.getSelectedThreadId(),
        resetHistoryOnChange: false,
      });
    }
    return reconcileRuntimeSelection(visibleThreads);
  }

  function getActiveWorkspaceContext() {
    const runtimeThread = getSelectedRuntimeThread();
    if (runtimeThread) {
      return {
        workspaceId: WORKSPACE_ID,
        conversationId: runtimeThread.id,
        customerId: runtimeThread.customerEmail || runtimeThread.id,
        customerName: runtimeThread.customerName,
      };
    }
    return {
      workspaceId: WORKSPACE_ID,
      conversationId: "",
      customerId: "",
      customerName: "",
    };
  }

  function getRuntimeThreadCustomerId(thread) {
    return normalizeKey(thread?.customerEmail || thread?.raw?.customerId || thread?.id || "");
  }

  function matchesActivityToThread(activity, thread, { customerScoped = false } = {}) {
    if (!thread || !activity || typeof activity !== "object") return false;
    const threadConversationId = normalizeKey(thread.id);
    const threadCustomerId = getRuntimeThreadCustomerId(thread);
    const activityConversationId = normalizeKey(activity.conversationId || "");
    const activityCustomerId = normalizeKey(activity.customerId || "");

    if (!customerScoped) {
      if (activityConversationId) return activityConversationId === threadConversationId;
      return Boolean(activityCustomerId && threadCustomerId && activityCustomerId === threadCustomerId);
    }

    if (
      activityConversationId === threadConversationId ||
      (activityCustomerId && threadCustomerId && activityCustomerId === threadCustomerId)
    ) {
      return true;
    }

    return getRelatedCustomerThreads(thread).some((relatedThread) => {
      const relatedConversationId = normalizeKey(relatedThread?.id || "");
      const relatedCustomerId = getRuntimeThreadCustomerId(relatedThread);
      return (
        activityConversationId === relatedConversationId ||
        (activityCustomerId && relatedCustomerId && activityCustomerId === relatedCustomerId)
      );
    });
  }

  function getScopedActivityNotes(thread, options = {}) {
    return asArray(state.activity.notes).filter((note) =>
      matchesActivityToThread(note, thread, options)
    );
  }

  function getScopedActivityFollowUps(thread, options = {}) {
    return asArray(state.activity.followUps).filter((followUp) =>
      matchesActivityToThread(followUp, thread, options)
    );
  }

  function refreshWorkspaceBootstrapForSelectedThread(reason = "workspace mutation") {
    return loadBootstrap({
      preserveActiveDestination: true,
      applyWorkspacePrefs: false,
      quiet: true,
    }).catch((error) => {
      console.warn(`CCO workspace bootstrap misslyckades efter ${reason}.`, error);
    });
  }

  function refreshConversationActionRuntimeProjection(
    thread,
    reason = "workspace mutation"
  ) {
    const selectedMailboxIds = getSelectedRuntimeMailboxScopeIds();
    const requestedMailboxIds = selectedMailboxIds.length
      ? selectedMailboxIds
      : getRequestedRuntimeMailboxIds();
    const preferredThreadId = asText(thread?.id || workspaceSourceOfTruth.getSelectedThreadId());
    const shouldReloadLiveRuntime =
      typeof loadLiveRuntime === "function" &&
      state.runtime?.authRequired !== true &&
      normalizeKey(getRuntimeMode()) !== "offline_history" &&
      (state.runtime?.live === true || state.runtime?.loaded === true);
    if (!shouldReloadLiveRuntime) {
      return refreshWorkspaceBootstrapForSelectedThread(reason);
    }
    return loadLiveRuntime({
      requestedMailboxIds,
      preferredThreadId,
      resetHistoryOnChange: true,
    }).catch((error) => {
      console.warn(
        `CCO live runtime misslyckades efter ${reason}. Faller tillbaka till workspace bootstrap.`,
        error
      );
      return refreshWorkspaceBootstrapForSelectedThread(reason);
    });
  }

  function formatHistoryTimestamp(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const now = new Date();
    const isSameDay =
      parsed.getUTCFullYear() === now.getUTCFullYear() &&
      parsed.getUTCMonth() === now.getUTCMonth() &&
      parsed.getUTCDate() === now.getUTCDate();
    const time = parsed.toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
    if (isSameDay) {
      return `Idag ${time}`;
    }
    return parsed.toLocaleString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  }

  function resetRuntimeHistoryFilters() {
    state.runtime.historySearch = "";
    state.runtime.historyMailboxFilter = "all";
    state.runtime.historyResultTypeFilter = "all";
    state.runtime.historyRangeFilter = "all";
    if (focusHistorySearchInput) {
      focusHistorySearchInput.value = "";
    }
  }

  function deriveHistoryEventResultType(event) {
    const explicit = normalizeKey(event?.resultType || event?.type);
    if (explicit === "message" || explicit === "email" || explicit === "mail") return "message";
    if (explicit === "outcome" || explicit === "booking" || explicit === "result") return "outcome";
    return "action";
  }

  function compareHistoryEventsDesc(left, right) {
    return Date.parse(String(right?.recordedAt || right?.timestamp || "")) -
      Date.parse(String(left?.recordedAt || left?.timestamp || ""));
  }

  function getRuntimeMessageSortIso(message = {}) {
    const candidates = [
      asText(message?.sentAt),
      asText(message?.recordedAt),
      asText(message?.timestamp),
      asText(message?.createdAt),
      asText(message?.updatedAt),
      asText(message?.mailThreadMessage?.sentAt),
      asText(message?.mailThreadMessage?.recordedAt),
      asText(message?.mailThreadMessage?.timestamp),
      asText(message?.mailDocument?.sentAt),
      asText(message?.mailDocument?.receivedAt),
      asText(message?.mailDocument?.createdAt),
      asText(message?.mailDocument?.updatedAt),
    ];
    for (const candidate of candidates) {
      const iso = toIso(candidate);
      if (iso) return iso;
    }
    return "";
  }

  function compareRuntimeMessagesDesc(left, right) {
    const rightIso = getRuntimeMessageSortIso(right);
    const leftIso = getRuntimeMessageSortIso(left);
    if (rightIso && leftIso && rightIso !== leftIso) {
      return rightIso.localeCompare(leftIso);
    }
    if (rightIso && !leftIso) return -1;
    if (!rightIso && leftIso) return 1;
    const rightId = asText(right?.messageId || right?.id);
    const leftId = asText(left?.messageId || left?.id);
    const idCompare = rightId.localeCompare(leftId);
    if (idCompare !== 0) return idCompare;
    return asText(right?.subject || "").localeCompare(asText(left?.subject || ""));
  }

  function normalizeThreadDocumentMessageOrder(threadDocument = null) {
    if (!threadDocument || typeof threadDocument !== "object") return threadDocument;
    return {
      ...threadDocument,
      messages: asArray(threadDocument.messages)
        .filter((message) => message && typeof message === "object")
        .slice()
        .sort(compareRuntimeMessagesDesc),
    };
  }

  function dedupeHistoryEvents(events) {
    const seen = new Set();
    return events.filter((event) => {
      const key = [
        normalizeKey(event?.conversationId),
        normalizeKey(event?.mailboxId),
        normalizeKey(event?.title),
        normalizeKey(event?.description),
        normalizeKey(event?.detail),
        normalizeKey(event?.recordedAt || event?.timestamp),
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createHistoryEvent(definition = {}) {
    const recordedAt = toIso(definition.recordedAt || definition.timestamp);
    const sanitizeHistoryCopy = (value = "") =>
      asText(value)
        .replace(/\s+/g, " ")
        .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
        .replace(/^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i, "")
        .replace(/^Power up your productivity with Microsoft 365\.?\s*/i, "")
        .replace(/^Get more done with apps like Word\.?\s*/i, "")
        .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
        .replace(/^Read more about why this is important\.?\s*/i, "")
        .replace(/^[\s_—–-]{6,}/, "")
        .trim();
    const title = sanitizeHistoryCopy(asText(definition.title, "Händelse"));
    const description = sanitizeHistoryCopy(
      asText(definition.description, asText(definition.detail, "Ingen beskrivning."))
    );
    const detail = sanitizeHistoryCopy(
      asText(definition.detail, asText(definition.description, "Ingen detalj tillgänglig."))
    );
    return {
      title: title || description || detail || "Händelse",
      description: description || title || detail || "Ingen beskrivning.",
      detail: detail || description || title || "Ingen detalj tillgänglig.",
      time: asText(definition.time, formatHistoryTimestamp(recordedAt)),
      recordedAt,
      mailboxLabel: asText(definition.mailboxLabel),
      mailboxId: normalizeMailboxId(definition.mailboxId),
      conversationId: asText(definition.conversationId),
      scopeLabel: asText(definition.scopeLabel),
      resultType: deriveHistoryEventResultType(definition),
      type: asText(definition.type, definition.resultType || "action"),
    };
  }

  function matchCustomerThread(baseThread, candidateThread) {
    if (!baseThread || !candidateThread) return false;
    const baseEmail = normalizeKey(baseThread.customerEmail);
    const candidateEmail = normalizeKey(candidateThread.customerEmail);
    if (baseEmail && candidateEmail) {
      return baseEmail === candidateEmail;
    }
    return normalizeKey(baseThread.customerName) === normalizeKey(candidateThread.customerName);
  }

  function getRelatedCustomerThreads(thread) {
    if (!thread) return [];
    const mailboxScopedThreads = getMailboxScopedRuntimeThreads();
    const relatedThreads = mailboxScopedThreads.filter((candidate) =>
      matchCustomerThread(thread, candidate)
    );
    if (relatedThreads.length) return relatedThreads;
    return [thread];
  }

  function getThreadHistoryMailboxOptions(thread) {
    if (!thread) return [];
    const options = asArray(thread.historyMailboxOptions).filter(
      (option) => normalizeMailboxId(option?.id) && asText(option?.label)
    );
    if (options.length) {
      return options.map((option) => ({
        id: canonicalizeRuntimeMailboxId(option.id),
        label: asText(option.label),
      }));
    }
    const fallbackId = canonicalizeRuntimeMailboxId(thread.mailboxAddress || thread.mailboxLabel);
    return fallbackId
      ? [{ id: fallbackId, label: asText(thread.mailboxLabel, thread.mailboxAddress) }]
      : [];
  }

  function getCustomerHistoryMailboxOptions(thread) {
    const entries = new Map();
    getRelatedCustomerThreads(thread).forEach((relatedThread) => {
      getThreadHistoryMailboxOptions(relatedThread).forEach((option) => {
        if (!entries.has(option.id)) {
          entries.set(option.id, option);
        }
      });
    });
    if (!entries.size && thread) {
      getThreadHistoryMailboxOptions(thread).forEach((option) => {
        entries.set(option.id, option);
      });
    }
    return Array.from(entries.values());
  }

  function getRuntimeThreadById(threadId) {
    const normalizedId = normalizeRuntimeConversationId(threadId);
    if (!normalizedId) return null;
    return (
      asArray(state.runtime?.threads).find(
        (candidate) => runtimeConversationIdsMatch(candidate?.id, normalizedId)
      ) || null
    );
  }

  function joinReadableList(items = [], maxItems = 3) {
    const values = asArray(items)
      .map((item) => normalizeText(item))
      .filter(Boolean);
    if (!values.length) return "";
    const visibleValues = values.slice(0, maxItems);
    const remainder = values.length - visibleValues.length;
    return remainder > 0
      ? `${visibleValues.join(", ")} +${remainder} till`
      : visibleValues.join(", ");
  }

  function getHistoryEventTypeLabel(event) {
    const resultType = deriveHistoryEventResultType(event);
    if (resultType === "message") return "Mail";
    if (resultType === "outcome") return "Utfall";
    return "Åtgärd";
  }

  function getHistoryEventTypeTone(resultType) {
    if (resultType === "message") return "message";
    if (resultType === "outcome") return "outcome";
    return "action";
  }

  function renderFocusSummaryCards(container, cards, tone = "history") {
    if (!container) return;
    // The top summary strip duplicated detail already shown in the lower panels,
    // so we suppress it and keep the detail cards as the single source of truth.
    container.innerHTML = "";
    container.hidden = true;
  }

  function buildFocusHistoryScopeCards(thread, allEvents = []) {
    if (!thread) return [];
    const notes = getScopedActivityNotes(thread);
    const followUps = getScopedActivityFollowUps(thread);
    const latestEvent = allEvents[0];
    return [
      {
        label: "Tråd",
        value: compactRuntimeCopy(thread.displaySubject || thread.subject, "Aktiv tråd", 42),
        note: `${thread.mailboxLabel} · ${latestEvent?.time || thread.lastActivityLabel}`,
        tone: "message",
      },
      {
        label: "Nu i",
        value: thread.statusLabel,
        note: `${thread.waitingLabel} · ${thread.riskLabel}`,
        tone: "action",
      },
      {
        label: "Nästa steg",
        value: thread.nextActionLabel,
        note: compactRuntimeCopy(thread.nextActionSummary, "Ta nästa tydliga steg i samma tråd.", 86),
        tone: "customer",
      },
      {
        label: "Aktivitet",
        value: `${allEvents.length} händelser`,
        note: `${notes.length} anteckningar · ${followUps.length} uppföljningar`,
        tone: "outcome",
      },
    ];
  }

  function buildCustomerSummaryCards(thread, customerEvents = [], relatedThreads = [], mailboxOptions = []) {
    if (!thread) return [];
    const latestEvent = customerEvents[0];
    const mailboxLabels = mailboxOptions.map((option) => option.label);
    const liveThreadCount = Math.max(relatedThreads.length, 1);
    const summary = thread.raw?.customerSummary || {};
    return [
      {
        label: "Mailboxar",
        value: `${mailboxOptions.length || 1}`,
        note: joinReadableList(mailboxLabels.length ? mailboxLabels : [thread.mailboxLabel]),
        tone: "customer",
      },
      {
        label: "Spår",
        value: `${Math.max(liveThreadCount, asNumber(summary.caseCount, 0), 1)}`,
        note: `${liveThreadCount} live-trådar i valt scope`,
        tone: "action",
      },
      {
        label: "Senaste aktivitet",
        value: latestEvent?.time || thread.lastActivityLabel,
        note: compactRuntimeCopy(
          latestEvent?.description || thread.displaySubject || thread.subject,
          thread.displaySubject || thread.subject,
          76
        ),
        tone: "message",
      },
      {
        label: "Nästa steg",
        value: thread.nextActionLabel,
        note: thread.followUpLabel || compactRuntimeCopy(thread.nextActionSummary, "Ingen planerad uppföljning ännu.", 76),
        tone: "outcome",
      },
    ];
  }

  function buildThreadHistoryEvents(thread) {
    if (!thread) return [];
    const threadEvents = asArray(thread.historyEvents).map((event) =>
      createHistoryEvent({
        ...event,
        conversationId: event?.conversationId || thread.id,
        mailboxId: event?.mailboxId || thread.mailboxAddress,
        mailboxLabel: event?.mailboxLabel || thread.mailboxLabel,
      })
    );
    const noteEvents = getScopedActivityNotes(thread).map((note) =>
      createHistoryEvent({
        title: "Anteckning",
        description: asText(note.destinationLabel, "Intern anteckning"),
        detail: asText(note.text, "Ingen anteckningstext tillgänglig."),
        recordedAt: note.updatedAt || note.createdAt,
        mailboxId: thread.mailboxAddress,
        mailboxLabel: thread.mailboxLabel,
        conversationId: thread.id,
        resultType: "action",
        type: "note",
      })
    );
    const followUpEvents = getScopedActivityFollowUps(thread).map((followUp) =>
      createHistoryEvent({
        title: "Uppföljning",
        description: asText(followUp.category, "Schemalagd uppföljning"),
        detail:
          asText(followUp.notes) ||
          `Schemalagd ${asText(followUp.date)} ${asText(followUp.time)} hos ${asText(followUp.doctorName, "klinikteamet")}.`,
        recordedAt: followUp.createdAt || followUp.scheduledForIso,
        mailboxId: thread.mailboxAddress,
        mailboxLabel: thread.mailboxLabel,
        conversationId: thread.id,
        resultType: "action",
        type: "followup",
      })
    );
    return dedupeHistoryEvents([...threadEvents, ...noteEvents, ...followUpEvents]).sort(
      compareHistoryEventsDesc
    );
  }

  function buildCustomerHistoryEvents(thread) {
    if (!thread) return [];
    const relatedThreads = getRelatedCustomerThreads(thread);
    const relatedEvents = relatedThreads.flatMap((relatedThread) =>
      asArray(relatedThread.historyEvents).map((event) =>
        createHistoryEvent({
          ...event,
          conversationId: event?.conversationId || relatedThread.id,
          mailboxId: event?.mailboxId || relatedThread.mailboxAddress,
          mailboxLabel: event?.mailboxLabel || relatedThread.mailboxLabel,
          scopeLabel: relatedThread.displaySubject || relatedThread.subject,
        })
      )
    );
    const scopedNotes = getScopedActivityNotes(thread, { customerScoped: true }).map((note) =>
      createHistoryEvent({
        title: "Anteckning",
        description: asText(note.destinationLabel, "Intern anteckning"),
        detail: asText(note.text, "Ingen anteckningstext tillgänglig."),
        recordedAt: note.updatedAt || note.createdAt,
        mailboxId:
          getRuntimeThreadById(note.conversationId || thread.id)?.mailboxAddress || thread.mailboxAddress,
        mailboxLabel:
          getRuntimeThreadById(note.conversationId || thread.id)?.mailboxLabel || thread.mailboxLabel,
        conversationId: note.conversationId || thread.id,
        scopeLabel:
          getRuntimeThreadById(note.conversationId || thread.id)?.displaySubject ||
          getRuntimeThreadById(note.conversationId || thread.id)?.subject ||
          thread.displaySubject ||
          thread.subject,
        resultType: "action",
        type: "note",
      })
    );
    const scopedFollowUps = getScopedActivityFollowUps(thread, { customerScoped: true }).map(
      (followUp) =>
        createHistoryEvent({
          title: "Uppföljning",
          description: asText(followUp.category, "Schemalagd uppföljning"),
          detail:
            asText(followUp.notes) ||
            `Schemalagd ${asText(followUp.date)} ${asText(followUp.time)} hos ${asText(
              followUp.doctorName,
              "klinikteamet"
            )}.`,
          recordedAt: followUp.createdAt || followUp.scheduledForIso,
          mailboxId:
            getRuntimeThreadById(followUp.conversationId || thread.id)?.mailboxAddress ||
            thread.mailboxAddress,
          mailboxLabel:
            getRuntimeThreadById(followUp.conversationId || thread.id)?.mailboxLabel ||
            thread.mailboxLabel,
          conversationId: followUp.conversationId || thread.id,
          scopeLabel:
            getRuntimeThreadById(followUp.conversationId || thread.id)?.displaySubject ||
            getRuntimeThreadById(followUp.conversationId || thread.id)?.subject ||
            thread.displaySubject ||
            thread.subject,
          resultType: "action",
          type: "followup",
        })
    );
    return dedupeHistoryEvents([...relatedEvents, ...scopedNotes, ...scopedFollowUps]).sort(
      compareHistoryEventsDesc
    );
  }

  function filterHistoryEvents(events, filters = {}) {
    const searchQuery = normalizeText(filters.search).toLowerCase();
    const mailboxFilter = normalizeKey(filters.mailboxFilter || "all");
    const resultTypeFilter = normalizeKey(filters.resultTypeFilter || "all");
    const rangeFilter = normalizeKey(filters.rangeFilter || "all");
    const nowMs = Date.now();

    return events.filter((event) => {
      if (mailboxFilter !== "all" && normalizeMailboxId(event.mailboxId) !== mailboxFilter) {
        return false;
      }
      if (resultTypeFilter !== "all" && deriveHistoryEventResultType(event) !== resultTypeFilter) {
        return false;
      }
      if (rangeFilter !== "all" && event.recordedAt) {
        const eventMs = Date.parse(event.recordedAt);
        const days =
          rangeFilter === "30" ? 30 : rangeFilter === "90" ? 90 : rangeFilter === "365" ? 365 : 0;
        if (Number.isFinite(eventMs) && days > 0) {
          const thresholdMs = nowMs - days * 24 * 60 * 60 * 1000;
          if (eventMs < thresholdMs) return false;
        }
      }
      if (!searchQuery) return true;
      const haystack = [
        event.title,
        event.description,
        event.detail,
        event.mailboxLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  function buildHistoryReadoutHref(thread, { customerScoped = false } = {}) {
    if (!thread) return "/api/v1/cco/runtime/calibration/readout";
    const params = new URLSearchParams();
    if (thread.customerEmail) params.set("customerEmail", thread.customerEmail);
    if (thread.id) params.set("conversationId", thread.id);

    const mailboxIds = customerScoped
      ? getCustomerHistoryMailboxOptions(thread).map((option) => option.id)
      : state.runtime.historyMailboxFilter !== "all"
        ? [state.runtime.historyMailboxFilter]
        : getThreadHistoryMailboxOptions(thread).map((option) => option.id);

    if (mailboxIds.length) {
      params.set("mailboxIds", mailboxIds.join(","));
    }
    if (!customerScoped && normalizeText(state.runtime.historySearch)) {
      params.set("q", normalizeText(state.runtime.historySearch));
    }
    if (!customerScoped && normalizeKey(state.runtime.historyResultTypeFilter) !== "all") {
      params.set("resultTypes", normalizeKey(state.runtime.historyResultTypeFilter));
    }
    return `/api/v1/cco/runtime/calibration/readout?${params.toString()}`;
  }

  function getRuntimeCustomerEmail(thread) {
    return asText(
      extractCustomerEmail(thread) || thread?.raw?.customerHistory?.email
    ).toLowerCase();
  }

  function getSelectedRuntimeMailboxScopeIds() {
    return asArray(state.runtime.selectedMailboxIds)
      .map((mailboxId) => canonicalizeRuntimeMailboxId(mailboxId))
      .filter(Boolean);
  }

  function getQueueHistoryScopeIds() {
    const selectedScope = getSelectedRuntimeMailboxScopeIds();
    if (selectedScope.length) return selectedScope;
    return getCanonicalAvailableRuntimeMailboxIds();
  }

  function getQueueHistoryScopeKey(scopeIds = getQueueHistoryScopeIds()) {
    return [...scopeIds].sort().join(",");
  }

  function getQueueHistoryMailboxLabel(mailboxId) {
    const normalizedMailboxId = normalizeMailboxId(mailboxId);
    const runtimeMailbox = findRuntimeMailboxByScopeId(normalizedMailboxId);
    if (runtimeMailbox) {
      return asText(runtimeMailbox.label, runtimeMailbox.id);
    }
    const localPart = normalizedMailboxId.split("@")[0];
    return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : "Mailbox";
  }

  function getQueueHistoryCounterpartyLabel(item = {}, customerEmail = "", mailboxLabel = "") {
    const explicitLabel = asText(
      item.customerName ||
        item.customerLabel ||
        item.fromName ||
        item.senderName ||
        item.contactName ||
        item.contactLabel
    );
    if (explicitLabel) {
      const explicitEmail = extractEmail(explicitLabel);
      if (explicitEmail && normalizeKey(explicitLabel) === normalizeKey(explicitEmail)) {
        return humanizeHistoryCounterpartyEmail(explicitEmail) || explicitLabel;
      }
      return explicitLabel;
    }
    const normalizedEmail = asText(customerEmail);
    if (normalizedEmail) {
      const derivedLabel =
        humanizeHistoryCounterpartyEmail(normalizedEmail) || deriveMailboxLabel(normalizedEmail);
      return derivedLabel || normalizedEmail;
    }
    if (normalizeKey(item.direction || "message") === "outbound") {
      return mailboxLabel ? `${mailboxLabel} | Hair TP Clinic` : "Hair TP Clinic";
    }
    return "Okänd avsändare";
  }

  function buildQueueHistoryItems(results = []) {
    return asArray(results)
      .map((item) => {
        const customerEmail = asText(item.customerEmail);
        const subject = asText(item.subject || item.summary || item.title, "E-post");
        const detail = compactRuntimeCopy(
          item.detail || item.summary,
          "Ingen förhandsvisning tillgänglig.",
          180
        );
        const mailboxId = normalizeMailboxId(item.mailboxId);
        return {
          id: asText(item.messageId || `${item.conversationId}-${item.recordedAt}-${subject}`),
          conversationId: asText(item.conversationId),
          customerEmail,
          mailboxId,
          mailboxLabel: getQueueHistoryMailboxLabel(mailboxId),
          counterpartyLabel: getQueueHistoryCounterpartyLabel(item, customerEmail, getQueueHistoryMailboxLabel(mailboxId)),
          title: compactRuntimeCopy(subject, subject, 108),
          detail,
          direction: normalizeKey(item.direction || "message") === "outbound" ? "Skickat" : "Mottaget",
          time: formatHistoryTimestamp(item.recordedAt),
          recordedAt: toIso(item.recordedAt),
          initials: initialsForName(
            getQueueHistoryCounterpartyLabel(item, customerEmail, getQueueHistoryMailboxLabel(mailboxId))
          ),
        };
      })
      .sort(compareHistoryEventsDesc);
  }

  async function loadQueueHistory({ append = false, force = false, prefetch = false } = {}) {
    const scopeIds = getQueueHistoryScopeIds();
    const scopeKey = getQueueHistoryScopeKey(scopeIds);
    const historyState = state.runtime.queueHistory;
    const nextLimit = append ? Math.max(24, Number(historyState.limit || 24) + 24) : Math.max(24, Number(historyState.limit || 24));

    if (!scopeIds.length) {
      state.runtime.queueHistory = {
        ...historyState,
        loading: false,
        loaded: true,
        error: "",
        items: [],
        selectedConversationId: "",
        limit: nextLimit,
        hasMore: false,
        scopeKey,
      };
      renderQueueHistorySection();
      return;
    }

    if (!force && !append && historyState.loaded && historyState.scopeKey === scopeKey) {
      renderQueueHistorySection();
      return;
    }

    const requestSequence = ++queueHistoryRequestSequence;
    state.runtime.queueHistory = {
      ...historyState,
      loading: true,
      error: "",
      scopeKey,
      limit: nextLimit,
      open: prefetch ? historyState.open : true,
    };
    renderQueueHistorySection();

    try {
      const params = new URLSearchParams();
      params.set("mailboxIds", scopeIds.join(","));
      params.set("lookbackDays", "1095");
      params.set("resultTypes", "message");
      params.set("limit", String(nextLimit));
      const payload = await apiRequest(`/api/v1/cco/runtime/history/search?${params.toString()}`);
      if (requestSequence !== queueHistoryRequestSequence) return;

      const items = buildQueueHistoryItems(payload?.results);
      const nextSelectedConversationId = items.some((item) =>
        runtimeConversationIdsMatch(item?.conversationId, state.runtime.queueHistory.selectedConversationId)
      )
        ? asText(state.runtime.queueHistory.selectedConversationId)
        : "";
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        loading: false,
        loaded: true,
        error: "",
        items,
        selectedConversationId: nextSelectedConversationId,
        limit: nextLimit,
        hasMore: items.length >= nextLimit,
        scopeKey,
        open: prefetch ? state.runtime.queueHistory.open : true,
      };
      renderQueueHistorySection();
    } catch (error) {
      if (requestSequence !== queueHistoryRequestSequence) return;
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : String(error),
        items: [],
        selectedConversationId: "",
        hasMore: false,
        scopeKey,
        open: prefetch ? state.runtime.queueHistory.open : true,
      };
      renderQueueHistorySection();
    }
  }

  function isTruthWorklistViewFeatureEnabled() {
    return WORKLIST_TRUTH_VIEW?.enabled === true;
  }

  function getTruthWorklistViewLimit() {
    return Math.max(1, Number(WORKLIST_TRUTH_VIEW?.limit || 6));
  }

  function getTruthWorklistComparableBaselineMailboxIds() {
    const availableMailboxIds = new Set(getCanonicalAvailableRuntimeMailboxIds());
    return asArray(WORKLIST_TRUTH_VIEW?.comparableBaselineMailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean)
      .filter((mailboxId) => !availableMailboxIds.size || availableMailboxIds.has(mailboxId));
  }

  function resolveTruthWorklistScope() {
    const queueScopeIds = getQueueHistoryScopeIds()
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
    const comparableBaselineMailboxIds = getTruthWorklistComparableBaselineMailboxIds();
    if (!comparableBaselineMailboxIds.length) {
      return {
        mailboxIds: queueScopeIds,
        scopeMode: "queue_scope",
      };
    }
    if (!queueScopeIds.length) {
      return {
        mailboxIds: comparableBaselineMailboxIds,
        scopeMode: "comparable_baseline",
      };
    }
    const queueScopeSet = new Set(queueScopeIds);
    const hasComparableMailbox = comparableBaselineMailboxIds.some((mailboxId) =>
      queueScopeSet.has(mailboxId)
    );
    if (!hasComparableMailbox) {
      return {
        mailboxIds: comparableBaselineMailboxIds,
        scopeMode: "comparable_baseline",
      };
    }
    return {
      mailboxIds: queueScopeIds,
      scopeMode: "queue_scope",
    };
  }

  function getTruthWorklistScopeIds() {
    return resolveTruthWorklistScope().mailboxIds;
  }

  function getTruthWorklistScopeKey(mailboxIds = []) {
    return asArray(mailboxIds)
      .map((value) => normalizeMailboxId(value))
      .filter(Boolean)
      .sort()
      .join(",");
  }

  function normalizeTruthWorklistPage(page = "overview") {
    const normalized = normalizeText(page || "overview") || "overview";
    if (normalized === "guardrail") return "guardrail";
    if (normalized === "assist") return "assist";
    if (normalized === "parity") return "parity";
    if (normalized === "scope") return "scope";
    return "overview";
  }

  function setTruthWorklistPage(page = "overview") {
    const viewState =
      state.runtime && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};
    state.runtime.truthWorklistView = {
      ...viewState,
      page: normalizeTruthWorklistPage(page),
    };
    renderTruthWorklistView();
  }

  function persistTruthWorklistViewHidden(hidden) {
    try {
      if (hidden) {
        window.localStorage.setItem(TRUTH_WORKLIST_VIEW_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(TRUTH_WORKLIST_VIEW_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Truth Worklist View kunde inte spara lokal preferens.", error);
    }
  }

  function setTruthWorklistViewHidden(hidden) {
    state.runtime.truthWorklistView = {
      ...(state.runtime.truthWorklistView || {}),
      hidden: hidden === true,
    };
    persistTruthWorklistViewHidden(hidden === true);
    renderTruthWorklistView();
    if (hidden !== true) {
      ensureTruthWorklistViewLoaded({ force: false });
    }
  }

  function setTruthWorklistShellOpen(open) {
    const isOpen = workspaceSourceOfTruth.setOverlayOpen("truthWorklist", open);
    if (canvas) {
      canvas.classList.toggle("is-truth-worklist-open", isOpen);
    }
    if (!truthWorklistShell) return;
    truthWorklistShell.hidden = !isOpen;
    truthWorklistShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
    truthWorklistShell.style.opacity = isOpen ? "1" : "0";
    truthWorklistShell.style.pointerEvents = isOpen ? "auto" : "none";
    truthWorklistShell.style.visibility = isOpen ? "visible" : "hidden";
    truthWorklistShell.style.transform = isOpen ? "translateY(0)" : "translateY(14px)";
  }

  function buildTruthWorklistConsumerHref(mailboxIds = [], limit = getTruthWorklistViewLimit()) {
    const params = new URLSearchParams();
    const normalizedMailboxIds = asArray(mailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    if (normalizedMailboxIds.length) {
      params.set("mailboxIds", normalizedMailboxIds.join(","));
    }
    params.set("limit", String(Math.max(1, Number(limit || getTruthWorklistViewLimit()))));
    return `/api/v1/cco/runtime/worklist/consumer?${params.toString()}`;
  }

  function buildTruthWorklistReadoutHref(mailboxIds = [], limit = getTruthWorklistViewLimit()) {
    const params = new URLSearchParams();
    const normalizedMailboxIds = asArray(mailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    if (normalizedMailboxIds.length) {
      params.set("mailboxIds", normalizedMailboxIds.join(","));
    }
    params.set("limit", String(Math.max(1, Number(limit || getTruthWorklistViewLimit()))));
    return `/api/v1/cco/runtime/worklist/consumer/readout?${params.toString()}`;
  }

  function buildTruthWorklistSummaryMarkup(payload = {}) {
    const summary = payload?.summary && typeof payload.summary === "object" ? payload.summary : {};
    const items = [
      { label: "Truth-rader", value: Number(summary.rowCount || 0), tone: "truth" },
      { label: "Unread inbound", value: Number(summary.unreadCount || 0), tone: "inbound" },
      { label: "Needs reply", value: Number(summary.needsReplyCount || 0), tone: "reply" },
      { label: "Act now", value: Number(summary.actNowCount || 0), tone: "act" },
    ];
    return `
      <div class="queue-truth-view-facts queue-truth-view-facts--summary">
        ${items
          .map(
            (item) => `<article class="queue-truth-view-fact" data-tone="${escapeHtml(item.tone)}">
              <span class="queue-truth-view-fact-label">${escapeHtml(item.label)}</span>
              <strong class="queue-truth-view-fact-value">${escapeHtml(String(item.value))}</strong>
            </article>`
          )
          .join("")}
      </div>`;
  }

  function buildTruthWorklistStatusMarkup(payload = {}) {
    const guardrail =
      payload?.shadowGuardrail && typeof payload.shadowGuardrail === "object"
        ? payload.shadowGuardrail
        : {};
    const aggregate =
      guardrail.aggregate && typeof guardrail.aggregate === "object"
        ? guardrail.aggregate
        : {};
    const acceptanceGate =
      guardrail.acceptanceGate && typeof guardrail.acceptanceGate === "object"
        ? guardrail.acceptanceGate
        : {};
    const classificationCounts =
      aggregate.classificationCounts && typeof aggregate.classificationCounts === "object"
        ? aggregate.classificationCounts
        : {};
    const items = [
      { label: "Båda", value: Number(aggregate.bothCount || 0), tone: "parity" },
      {
        label: "Mapping gap",
        value: Number(classificationCounts.mapping_gap || 0),
        tone: "gap",
      },
      {
        label: "Truth shift",
        value: Number(classificationCounts.truth_shift || 0),
        tone: "truth",
      },
      {
        label: "Unread diff",
        value: Number(aggregate.unreadDiffCount || 0),
        tone: "inbound",
      },
      {
        label: "Ownership diff",
        value: Number(aggregate.ownershipDiffCount || 0),
        tone: "ownership",
      },
    ];
    return `
      <div class="queue-truth-view-status-lead" data-gate-state="${
        acceptanceGate.canConsiderCutover === true ? "ready" : "blocked"
      }">
        <span class="queue-truth-view-status-lead-label">Shadow gate</span>
        <strong class="queue-truth-view-status-lead-value">${escapeHtml(
          acceptanceGate.canConsiderCutover === true ? "Klar för läsning" : "Blockerad"
        )}</strong>
        <p class="queue-truth-view-status-lead-copy">${escapeHtml(
          acceptanceGate.canConsiderCutover === true
            ? "Truth- och legacy-baseline ligger tillräckligt nära för att läsas som jämförbar assistvy."
            : "Diffar och mapping-gaps kräver fortsatt shadow-läsning innan något kan tolkas som skiftklart."
        )}</p>
      </div>
      <div class="queue-truth-view-facts queue-truth-view-facts--status">
        ${items
          .map(
            (item) => `<article class="queue-truth-view-fact" data-tone="${escapeHtml(item.tone)}">
              <span class="queue-truth-view-fact-label">${escapeHtml(item.label)}</span>
              <strong class="queue-truth-view-fact-value">${escapeHtml(String(item.value))}</strong>
            </article>`
          )
          .join("")}
      </div>`;
  }

  function getTruthWorklistAssistFilterLabel(filterId = "all") {
    const normalized = normalizeText(filterId || "all");
    if (normalized === "unread") return "Unread";
    if (normalized === "needs_reply") return "Needs reply";
    if (normalized === "act_now") return "Act now";
    if (normalized === "comparable") return "Jämförbara";
    if (normalized === "today") return "Idag";
    if (normalized === "tomorrow") return "Imorgon";
    return "Alla";
  }

  function getTruthWorklistAssistSortLabel(sortId = "latest") {
    const normalized = normalizeText(sortId || "latest");
    if (normalized === "inbound") return "Senaste inbound";
    if (normalized === "needs_reply") return "Needs reply först";
    if (normalized === "unread") return "Unread först";
    return "Senaste aktivitet";
  }

  function getTruthWorklistComparableMailboxIds(payload = {}) {
    return asArray(payload?.parityBaseline?.comparableMailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
  }

  function getTruthWorklistNotComparableMailboxIds(payload = {}) {
    return asArray(payload?.parityBaseline?.notComparableMailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
  }

  function getTruthWorklistParityLabel(assessment = {}) {
    const parityStatus = normalizeText(assessment?.parityStatus || "");
    if (parityStatus === "comparable") return "Jämförbar";
    if (parityStatus === "not_comparable_no_legacy_baseline") return "Not comparable yet";
    if (parityStatus === "not_comparable_no_truth_rows") return "Ingen truth-rad ännu";
    return "Inte jämförbar ännu";
  }

  function buildTruthWorklistMailboxMarkup(payload = {}) {
    const parityBaseline =
      payload?.parityBaseline && typeof payload.parityBaseline === "object"
        ? payload.parityBaseline
        : {};
    const items = asArray(parityBaseline.mailboxAssessment);
    if (!items.length) {
      return '<p class="queue-truth-view-empty">Ingen parity-baseline ännu i det valda scope:t.</p>';
    }
    return items
      .map((item) => {
        const mailboxId = normalizeText(item?.mailboxId || "okand mailbox");
        const parityLabel = getTruthWorklistParityLabel(item);
        return `<article class="queue-truth-view-mailbox-row" data-parity-status="${escapeHtml(
          normalizeText(item?.parityStatus || "unknown")
        )}">
          <div class="queue-truth-view-mailbox-copy">
            <strong>${escapeHtml(mailboxId)}</strong>
          </div>
          <span class="queue-truth-view-mailbox-metric" data-tone="legacy">
            <span class="queue-truth-view-mailbox-metric-label">Legacy</span>
            <strong class="queue-truth-view-mailbox-metric-value">${escapeHtml(
              String(Number(item?.legacyCount || 0))
            )}</strong>
          </span>
          <span class="queue-truth-view-mailbox-metric" data-tone="truth">
            <span class="queue-truth-view-mailbox-metric-label">Truth</span>
            <strong class="queue-truth-view-mailbox-metric-value">${escapeHtml(
              String(Number(item?.shadowCount || 0))
            )}</strong>
          </span>
          <span class="queue-truth-view-mailbox-metric" data-tone="both">
            <span class="queue-truth-view-mailbox-metric-label">Båda</span>
            <strong class="queue-truth-view-mailbox-metric-value">${escapeHtml(
              String(Number(item?.bothCount || 0))
            )}</strong>
          </span>
          <span class="queue-truth-view-mailbox-badge">${escapeHtml(parityLabel)}</span>
        </article>`;
      })
      .join("");
  }

  function getTruthWorklistVisibleRows(payload = {}, viewState = {}) {
    const rows = asArray(payload?.rows);
    const comparableMailboxIds = new Set(getTruthWorklistComparableMailboxIds(payload));
    const filterMode = normalizeText(viewState?.localFilter || "all") || "all";
    const sortMode = normalizeText(viewState?.localSort || "latest") || "latest";
    const filteredRows = rows.filter((item) => {
      const mailboxId = normalizeMailboxId(item?.mailbox?.mailboxId || "");
      const dueBucket = asArray(item?.dueBucket);
      if (filterMode === "unread") return item?.state?.hasUnreadInbound === true;
      if (filterMode === "needs_reply") return item?.state?.needsReply === true;
      if (filterMode === "act_now") return normalizeText(item?.lane || "") === "act-now";
      if (filterMode === "comparable") return comparableMailboxIds.has(mailboxId);
      if (filterMode === "today") {
        return (
          dueBucket.includes("today") &&
          (item?.state?.needsReply === true || item?.state?.hasUnreadInbound === true)
        );
      }
      if (filterMode === "tomorrow") {
        return dueBucket.includes("tomorrow") && item?.state?.needsReply === true;
      }
      return true;
    });

    const toTimestamp = (value) => {
      const timestamp = Date.parse(normalizeText(value || ""));
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    return [...filteredRows].sort((left, right) => {
      const leftUnread = left?.state?.hasUnreadInbound === true ? 1 : 0;
      const rightUnread = right?.state?.hasUnreadInbound === true ? 1 : 0;
      const leftNeedsReply = left?.state?.needsReply === true ? 1 : 0;
      const rightNeedsReply = right?.state?.needsReply === true ? 1 : 0;
      const leftLatest = toTimestamp(left?.timing?.latestMessageAt);
      const rightLatest = toTimestamp(right?.timing?.latestMessageAt);
      const leftInbound = toTimestamp(left?.timing?.lastInboundAt);
      const rightInbound = toTimestamp(right?.timing?.lastInboundAt);

      if (sortMode === "unread") {
        if (rightUnread !== leftUnread) return rightUnread - leftUnread;
        if (rightNeedsReply !== leftNeedsReply) return rightNeedsReply - leftNeedsReply;
        if (rightLatest !== leftLatest) return rightLatest - leftLatest;
      } else if (sortMode === "needs_reply") {
        if (rightNeedsReply !== leftNeedsReply) return rightNeedsReply - leftNeedsReply;
        if (rightUnread !== leftUnread) return rightUnread - leftUnread;
        if (rightLatest !== leftLatest) return rightLatest - leftLatest;
      } else if (sortMode === "inbound") {
        if (rightInbound !== leftInbound) return rightInbound - leftInbound;
        if (rightLatest !== leftLatest) return rightLatest - leftLatest;
      } else if (rightLatest !== leftLatest) {
        return rightLatest - leftLatest;
      }

      return normalizeText(left?.subject || "").localeCompare(
        normalizeText(right?.subject || ""),
        "sv"
      );
    });
  }

  function buildTruthWorklistControlsMarkup(payload = {}, viewState = {}) {
    const rows = asArray(payload?.rows);
    const comparableMailboxIds = new Set(getTruthWorklistComparableMailboxIds(payload));
    const counts = {
      all: rows.length,
      unread: rows.filter((item) => item?.state?.hasUnreadInbound === true).length,
      needs_reply: rows.filter((item) => item?.state?.needsReply === true).length,
      act_now: rows.filter((item) => normalizeText(item?.lane || "") === "act-now").length,
      comparable: rows.filter((item) =>
        comparableMailboxIds.has(normalizeMailboxId(item?.mailbox?.mailboxId || ""))
      ).length,
      today: rows.filter((item) => {
        const dueBucket = asArray(item?.dueBucket);
        return (
          dueBucket.includes("today") &&
          (item?.state?.needsReply === true || item?.state?.hasUnreadInbound === true)
        );
      }).length,
      tomorrow: rows.filter((item) => {
        const dueBucket = asArray(item?.dueBucket);
        return dueBucket.includes("tomorrow") && item?.state?.needsReply === true;
      }).length,
    };
    const filterMode = normalizeText(viewState?.localFilter || "all") || "all";
    const sortMode = normalizeText(viewState?.localSort || "latest") || "latest";
    const visibleRows = getTruthWorklistVisibleRows(payload, viewState);
    const filters = [
      { id: "all", label: "Alla" },
      { id: "unread", label: "Unread" },
      { id: "needs_reply", label: "Needs reply" },
      { id: "act_now", label: "Act now" },
      { id: "today", label: "Idag" },
      { id: "tomorrow", label: "Imorgon" },
      { id: "comparable", label: "Jämförbara" },
    ];
    const sorts = [
      { id: "latest", label: "Senaste aktivitet" },
      { id: "inbound", label: "Senaste inbound" },
      { id: "unread", label: "Unread först" },
      { id: "needs_reply", label: "Needs reply först" },
    ];
    return `
      <p class="queue-truth-view-controls-state">
        ${escapeHtml(
          `Aktivt lokalt läge · ${getTruthWorklistAssistFilterLabel(
            viewState?.localFilter
          )} · ${getTruthWorklistAssistSortLabel(viewState?.localSort)}`
        )}
      </p>
      <div class="queue-truth-view-toolbar">
        <div class="queue-truth-view-controls-group">
          <p class="queue-truth-view-controls-label">Filtrera lokalt</p>
          <div class="queue-truth-view-toolbar-strip">
            ${filters
              .map(
                (filter) => `<button
                  class="queue-truth-view-toggle${filterMode === filter.id ? " is-active" : ""}"
                  type="button"
                  data-filter-id="${escapeHtml(filter.id)}"
                  data-truth-worklist-filter="${escapeHtml(filter.id)}"
                  aria-pressed="${filterMode === filter.id ? "true" : "false"}"
                >
                  <span>${escapeHtml(filter.label)}</span>
                  <strong>${escapeHtml(String(Number(counts[filter.id] || 0)))}</strong>
                </button>`
              )
              .join("")}
          </div>
        </div>
        <div class="queue-truth-view-controls-group">
          <p class="queue-truth-view-controls-label">Sortera lokalt</p>
          <div class="queue-truth-view-toolbar-strip">
            ${sorts
              .map(
                (sort) => `<button
                  class="queue-truth-view-toggle${sortMode === sort.id ? " is-active" : ""}"
                  type="button"
                  data-sort-id="${escapeHtml(sort.id)}"
                  data-truth-worklist-sort="${escapeHtml(sort.id)}"
                  aria-pressed="${sortMode === sort.id ? "true" : "false"}"
                >
                  <span>${escapeHtml(sort.label)}</span>
                </button>`
              )
              .join("")}
          </div>
        </div>
      </div>
      <p class="queue-truth-view-controls-note">
        ${escapeHtml(
          `Visar ${visibleRows.length} av ${rows.length} truth-rader. Lokal filtrering och sortering påverkar bara assistytan; legacy queue, selection, fokusyta och studio lämnas orörda.`
        )}
      </p>`;
  }

  function buildTruthWorklistGuidanceMarkup(payload = {}, viewState = {}) {
    const acceptanceGate =
      payload?.shadowGuardrail?.acceptanceGate &&
      typeof payload.shadowGuardrail.acceptanceGate === "object"
        ? payload.shadowGuardrail.acceptanceGate
        : {};
    const relay = viewState?.relay && typeof viewState.relay === "object" ? viewState.relay : null;
    const items = [
      {
        label: "Guardrail",
        value: acceptanceGate.canConsiderCutover === true ? "Guardrail läsbar" : "Guardrail blockerad",
        tone: acceptanceGate.canConsiderCutover === true ? "ready" : "blocked",
      },
      {
        label: "Relay",
        value: relay ? "Relay redo via legacy-kö" : "Relay väntar på vald truth-rad",
        tone: relay ? "relay" : "waiting",
      },
      { label: "Öppning", value: "Envägs-relay", tone: "truth" },
      { label: "Selection", value: "Ingen global selection", tone: "neutral" },
      { label: "Fokusyta", value: "Ingen fokusyta", tone: "neutral" },
      { label: "Studio", value: "Ingen studio", tone: "neutral" },
    ];
    return `
      <div class="queue-truth-view-guidance-strip">
        ${items
          .map(
            (item) =>
              `<article class="queue-truth-view-guidance-chip" data-tone="${escapeHtml(item.tone)}">
                <span class="queue-truth-view-guidance-card-label">${escapeHtml(item.label)}</span>
                <strong class="queue-truth-view-guidance-card-value">${escapeHtml(item.value)}</strong>
              </article>`
          )
          .join("")}
      </div>
      <p class="queue-truth-view-guidance-note">
        ${escapeHtml(
          `Assistytan får hjälpa användaren prioritera lokalt med ${getTruthWorklistAssistFilterLabel(
            viewState?.localFilter
          )} och ${getTruthWorklistAssistSortLabel(
            viewState?.localSort
          )}. Operativ öppning sker fortfarande manuellt via legacy-kön.`
        )}
      </p>`;
  }

  function buildTruthWorklistRelayNoteMarkup(relay = null) {
    if (!relay || typeof relay !== "object") return "";
    const mailboxId = normalizeText(relay.mailboxId || "okand mailbox");
    const customerLabel = normalizeText(relay.customerEmail || relay.customerName || "okand kund");
    const subject = compactRuntimeCopy(relay.subject, "(utan amne)", 92);
    const parityLabel = relay.comparable === true ? "Jämförbar parity" : "Not comparable yet";
    const laneLabel = normalizeText(relay.lane || "all");
    return `
      <div class="queue-truth-relay-note-head">
        <div class="queue-truth-relay-note-copy">
          <p class="queue-truth-relay-note-kicker">Truth relay</p>
          <h3>Visa i legacy-kö</h3>
        </div>
        <button
          class="queue-truth-relay-note-clear"
          type="button"
          data-truth-relay-clear
        >
          Rensa relay
        </button>
      </div>
      <p class="queue-truth-relay-note-provenance">
        Truth-driven · Sekundär vy · Legacy queue fortfarande styrande · Envägs-relay aktivt
      </p>
      <p class="queue-truth-relay-note-meta">
        Mailboxhint ${escapeHtml(mailboxId)} · Kund ${escapeHtml(customerLabel)} · Lane ${escapeHtml(
          laneLabel
        )} · ${escapeHtml(parityLabel)}
      </p>
      <p class="queue-truth-relay-note-body">
        ${escapeHtml(
          `Ämne: ${subject}. Öppna motsvarande rad manuellt i legacy-kön. Relay sätter inte vald tråd, öppnar inte fokusyta och öppnar inte studio.`
        )}
      </p>`;
  }

  function buildTruthWorklistRowsMarkup(payload = {}, relay = null) {
    const items = asArray(payload?.rows).slice(0, getTruthWorklistViewLimit());
    const comparableMailboxIds = new Set(getTruthWorklistComparableMailboxIds(payload));
    const activeRelayConversationKey = normalizeText(
      relay?.conversationKey || relay?.id || ""
    ).toLowerCase();
    if (!items.length) {
      const emptyStateMessage = normalizeText(payload?.emptyStateMessage || "");
      return `<p class="queue-truth-view-empty">${escapeHtml(
        emptyStateMessage || "Inga truth-rader i parity-scope för det här mailboxscope:t ännu."
      )}</p>`;
    }
    return items
      .map((item) => {
        const mailboxId = normalizeMailboxId(item?.mailbox?.mailboxId || "");
        const comparable = comparableMailboxIds.has(mailboxId);
        const relayConversationKey = normalizeText(
          item?.conversation?.key || item?.conversationKey || item?.id || ""
        );
        const relayActive =
          Boolean(activeRelayConversationKey) &&
          relayConversationKey &&
          relayConversationKey.toLowerCase() === activeRelayConversationKey;
        const customerLabel = normalizeText(item?.customer?.email || item?.customer?.name || "okand kund");
        const rollup = item?.rollup && typeof item.rollup === "object" ? item.rollup : null;
        const stateBits = [];
        if (item?.state?.hasUnreadInbound === true) stateBits.push("Unread inbound");
        if (item?.state?.needsReply === true) stateBits.push("Needs reply");
        if (item?.state?.folderPresence?.inbox === true) stateBits.push("Inbox");
        if (item?.state?.folderPresence?.sent === true) stateBits.push("Sent");
        const rollupMeta = [];
        if (rollup?.enabled === true) {
          rollupMeta.push({
            tone: "mailbox",
            text: `Rollup ${Number(rollup.count || 0)}`,
          });
          if (Number(rollup?.mailboxCount || 0) > 0) {
            rollupMeta.push({
              tone: "customer",
              text: `${Number(rollup.mailboxCount || 0)} mailboxar`,
            });
          }
          if (normalizeText(rollup?.provenanceDetail || "")) {
            rollupMeta.push({
              tone: "timing",
              text: compactRuntimeCopy(rollup.provenanceDetail, "", 64),
            });
          }
          const operationalParts = [];
          const operationalSummary = rollup?.operationalSummary || {};
          if (Number(operationalSummary.unreadCount || 0) > 0) {
            operationalParts.push(`Unread ${Number(operationalSummary.unreadCount || 0)}`);
          }
          if (Number(operationalSummary.needsReplyCount || 0) > 0) {
            operationalParts.push(`Needs reply ${Number(operationalSummary.needsReplyCount || 0)}`);
          }
          if (Number(operationalSummary.inboxCount || 0) > 0) {
            operationalParts.push(`Inbox ${Number(operationalSummary.inboxCount || 0)}`);
          }
          if (Number(operationalSummary.sentCount || 0) > 0) {
            operationalParts.push(`Sent ${Number(operationalSummary.sentCount || 0)}`);
          }
          if (operationalParts.length) {
            rollupMeta.push({
              tone: "state",
              text: operationalParts.join(" · "),
            });
          }
        }
        const rowMeta = [
          ...rollupMeta,
          {
            tone: "mailbox",
            text: normalizeText(item?.mailbox?.mailboxId || "okand mailbox"),
          },
          { tone: "customer", text: customerLabel },
          {
            tone: "lane",
            text: `Lane ${normalizeText(item?.lane || "all")}`,
          },
          {
            tone: "owner",
            text: `Ownership ${normalizeText(item?.mailbox?.ownershipMailbox || "okand")}`,
          },
          {
            tone: "timing",
            text: `Senaste inbound ${
              item?.timing?.lastInboundAt ? formatConversationTime(item.timing.lastInboundAt) : "ingen"
            }`,
          },
        ];
        if (stateBits.length) {
          rowMeta.push({
            tone: "state",
            text: stateBits.join(" · "),
          });
        }
        return `<article class="queue-truth-view-row">
          <div class="queue-truth-view-row-main">
            <div class="queue-truth-view-row-head">
              <strong>${escapeHtml(compactRuntimeCopy(item?.subject, "(utan amne)", 92))}</strong>
              <div class="queue-truth-view-row-head-trail">
                <span class="queue-truth-view-row-time">${escapeHtml(
                  formatConversationTime(item?.timing?.latestMessageAt)
                )}</span>
                <div
                  class="queue-truth-view-row-state"
                  data-parity-state="${escapeHtml(comparable ? "comparable" : "not-comparable")}"
                >
                  <span>Parity</span>
                  <strong>${escapeHtml(comparable ? "Jämförbar parity" : "Not comparable yet")}</strong>
                </div>
                <button
                  class="queue-truth-view-relay-button"
                  type="button"
                  data-truth-relay-legacy
                  data-truth-relay-mailbox-id="${escapeHtml(normalizeText(item?.mailbox?.mailboxId || ""))}"
                  data-truth-relay-mailbox-address="${escapeHtml(
                    normalizeText(item?.mailbox?.mailboxAddress || item?.mailbox?.mailboxId || "")
                  )}"
                  data-truth-relay-customer-email="${escapeHtml(
                    normalizeText(item?.customer?.email || "")
                  )}"
                  data-truth-relay-customer-name="${escapeHtml(
                    normalizeText(item?.customer?.name || "")
                  )}"
                  data-truth-relay-subject="${escapeHtml(normalizeText(item?.subject || ""))}"
                  data-truth-relay-conversation-key="${escapeHtml(relayConversationKey)}"
                  data-truth-relay-lane="${escapeHtml(normalizeText(item?.lane || "all"))}"
                  data-truth-relay-comparable="${comparable ? "true" : "false"}"
                  ${comparable ? "" : 'disabled aria-disabled="true"'}
                >
                  ${escapeHtml(
                    comparable
                      ? relayActive
                        ? "Relay aktivt i legacy-kö"
                        : "Visa i legacy-kö"
                      : "Legacy-baseline saknas"
                  )}
                </button>
              </div>
            </div>
            <p class="queue-truth-view-row-preview">${escapeHtml(
              compactRuntimeCopy(item?.preview, "Ingen preview tillganglig.", 150)
            )}</p>
            <div class="queue-truth-view-row-meta">
              ${rowMeta
                .map(
                  (meta) =>
                    `<span class="queue-truth-view-row-meta-item" data-tone="${escapeHtml(
                      meta.tone
                    )}">${escapeHtml(meta.text)}</span>`
                )
                .join("")}
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderTruthWorklistRelayNote() {
    if (!truthWorklistRelayNote) return;
    const featureEnabled = isTruthWorklistViewFeatureEnabled();
    const relay =
      state.runtime?.truthWorklistView && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView.relay
        : null;
    const relayMarkup = buildTruthWorklistRelayNoteMarkup(relay);
    truthWorklistRelayNote.hidden = !featureEnabled || !relayMarkup;
    truthWorklistRelayNote.innerHTML = relayMarkup;
  }

  function clearTruthWorklistRelay() {
    const viewState =
      state.runtime?.truthWorklistView && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};
    state.runtime.truthWorklistView = {
      ...viewState,
      relay: null,
    };
    renderTruthWorklistView();
  }

  function activateTruthWorklistRelay({
    mailboxId = "",
    mailboxAddress = "",
    customerEmail = "",
    customerName = "",
    subject = "",
    conversationKey = "",
    lane = "all",
    comparable = false,
  } = {}) {
    const viewState =
      state.runtime?.truthWorklistView && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};
    state.runtime.truthWorklistView = {
      ...viewState,
      page: "assist",
      relay: {
        mailboxId: normalizeText(mailboxId || mailboxAddress),
        mailboxAddress: normalizeText(mailboxAddress || mailboxId),
        customerEmail: normalizeText(customerEmail),
        customerName: normalizeText(customerName),
        subject: normalizeText(subject),
        conversationKey: normalizeText(conversationKey),
        lane: normalizeText(lane || "all") || "all",
        comparable: comparable === true,
        issuedAt: new Date().toISOString(),
      },
    };
    renderTruthWorklistView();
    if (truthWorklistRelayNote && typeof truthWorklistRelayNote.scrollIntoView === "function") {
      truthWorklistRelayNote.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else if (queueContent && typeof queueContent.scrollIntoView === "function") {
      queueContent.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function renderTruthWorklistView() {
    const featureEnabled = isTruthWorklistViewFeatureEnabled();
    const viewState =
      state.runtime && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};
    const mailboxIds = asArray(viewState.mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean);
    const payload =
      viewState.payload && typeof viewState.payload === "object" ? viewState.payload : null;
    const hidden = viewState.hidden === true;
    const activePage = normalizeTruthWorklistPage(viewState.page);

    if (truthWorklistLaunchButton) {
      truthWorklistLaunchButton.hidden = !featureEnabled;
      truthWorklistLaunchButton.textContent = hidden
        ? "Öppna Truth Worklist Assist View"
        : "Stäng Truth Worklist Assist View";
      truthWorklistLaunchButton.setAttribute("aria-pressed", hidden ? "false" : "true");
      truthWorklistLaunchButton.setAttribute("aria-expanded", hidden ? "false" : "true");
      syncTruthWorklistLaunchWidth();
    }

    setTruthWorklistShellOpen(featureEnabled && !hidden);

    if (!featureEnabled || hidden) {
      renderTruthWorklistRelayNote();
      return;
    }

    truthWorklistPageButtons.forEach((button) => {
      const isActive = normalizeTruthWorklistPage(button.dataset.truthWorklistPageButton) === activePage;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.tabIndex = isActive ? 0 : -1;
    });

    truthWorklistPagePanels.forEach((panel) => {
      const isActive = normalizeTruthWorklistPage(panel.dataset.truthWorklistPagePanel) === activePage;
      panel.hidden = !isActive;
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    if (truthWorklistReadoutLink) {
      truthWorklistReadoutLink.href = buildTruthWorklistReadoutHref(mailboxIds);
    }

    if (truthWorklistMeta) {
      if (!mailboxIds.length) {
        truthWorklistMeta.textContent =
          "Valj ett mailboxscope for att se den truth-driven assistvyn. Legacy queue ar fortfarande styrande.";
      } else if (viewState.authRequired) {
        truthWorklistMeta.textContent =
          "Logga in igen i admin for att lasa Truth Worklist Assist View. Legacy queue ar fortfarande styrande och shadow guardrail aktiv.";
      } else if (viewState.loading) {
        truthWorklistMeta.textContent =
          "Laddar truth-driven assistvy for valt mailboxscope. Legacy queue fortfarande styrande och shadow guardrail aktiv.";
      } else if (viewState.error) {
        truthWorklistMeta.textContent = `Truth Worklist View kunde inte laddas: ${viewState.error}`;
      } else {
        const comparableMailboxIds = getTruthWorklistComparableMailboxIds(payload);
        const notComparableMailboxIds = getTruthWorklistNotComparableMailboxIds(payload);
        const scopeLabel =
          mailboxIds.length === 1 ? mailboxIds[0] : `${mailboxIds.length} mailboxar i scope`;
        const comparableLabel = comparableMailboxIds.length
          ? `${comparableMailboxIds.length} jämförbara`
          : "ingen jämförbar baseline ännu";
        const notComparableLabel = notComparableMailboxIds.length
          ? `${notComparableMailboxIds.length} not comparable yet`
          : null;
        const metaBits = [
          viewState.scopeMode === "comparable_baseline"
            ? "Assist scope jämförbar baseline"
            : "Assist scope följer köscope",
          `Scope ${scopeLabel}`,
          payload?.shadowGuardrail?.acceptanceGate?.canConsiderCutover === true
            ? "Shadow guardrail klar"
            : "Shadow guardrail blockerad",
          comparableLabel,
        ];
        if (notComparableLabel) {
          metaBits.push(notComparableLabel);
        }
        truthWorklistMeta.textContent = metaBits.join(" · ");
      }
    }

    if (truthWorklistSummary) {
      truthWorklistSummary.innerHTML = payload
        ? buildTruthWorklistSummaryMarkup(payload)
        : '<p class="queue-truth-view-empty">Ingen consumer-data laddad ännu.</p>';
    }

    if (truthWorklistStatus) {
      truthWorklistStatus.innerHTML = payload
        ? buildTruthWorklistStatusMarkup(payload)
        : '<p class="queue-truth-view-empty">Shadow guardrail invantar data.</p>';
    }

    if (truthWorklistMailboxes) {
      truthWorklistMailboxes.innerHTML = payload
        ? buildTruthWorklistMailboxMarkup(payload)
        : '<p class="queue-truth-view-empty">Ingen mailbox-baseline tillganglig.</p>';
    }

    if (truthWorklistControls) {
      truthWorklistControls.innerHTML = payload
        ? buildTruthWorklistControlsMarkup(payload, viewState)
        : '<p class="queue-truth-view-empty">Assistläget väntar på truth-rader.</p>';
    }

    if (truthWorklistGuidance) {
      truthWorklistGuidance.innerHTML = payload
        ? buildTruthWorklistGuidanceMarkup(payload, viewState)
        : '<p class="queue-truth-view-empty">Relay och guardrail väntar på samma consumer-data.</p>';
    }

    if (truthWorklistRows) {
      const visibleRows = payload ? getTruthWorklistVisibleRows(payload, viewState) : [];
      const rowsPayload = payload
        ? {
            ...payload,
            rows: visibleRows,
            emptyStateMessage: asArray(payload?.rows).length
              ? "Inga truth-rader matchar det lokala assistläget ännu."
              : "Inga truth-rader i parity-scope för det här mailboxscope:t ännu.",
          }
        : null;
      truthWorklistRows.innerHTML = payload
        ? buildTruthWorklistRowsMarkup(rowsPayload, viewState.relay)
        : '<p class="queue-truth-view-empty">Ingen truth-rad tillganglig an.</p>';
    }

    renderTruthWorklistRelayNote();
  }

  function syncTruthWorklistLaunchWidth() {
    if (!truthWorklistLaunchButton) return;
    truthWorklistLaunchButton.style.removeProperty("width");
  }

  async function loadTruthWorklistView({
    mailboxIds = getTruthWorklistScopeIds(),
    scopeMode = resolveTruthWorklistScope().scopeMode,
    force = false,
  } = {}) {
    if (!isTruthWorklistViewFeatureEnabled()) return;
    const normalizedMailboxIds = asArray(mailboxIds)
      .map((item) => normalizeMailboxId(item))
      .filter(Boolean);
    const scopeKey = getTruthWorklistScopeKey(normalizedMailboxIds);
    const currentState =
      state.runtime && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};

    if (!normalizedMailboxIds.length) {
      state.runtime.truthWorklistView = {
        ...currentState,
        loading: false,
        loaded: true,
        error: "",
        scopeKey: "",
        scopeMode: "",
        mailboxIds: [],
        payload: null,
      };
      renderTruthWorklistView();
      return;
    }

    if (!force && currentState.loading === true && currentState.scopeKey === scopeKey) {
      return;
    }

    if (
      !force &&
      currentState.loaded === true &&
      currentState.scopeKey === scopeKey &&
      currentState.payload
    ) {
      renderTruthWorklistView();
      return;
    }

    const requestSequence = ++truthWorklistRequestSequence;
    state.runtime.truthWorklistView = {
      ...currentState,
      loading: true,
      loaded: false,
      authRequired: false,
      error: "",
      scopeKey,
      scopeMode,
      mailboxIds: normalizedMailboxIds,
      payload:
        currentState.scopeKey === scopeKey && currentState.payload ? currentState.payload : null,
    };
    renderTruthWorklistView();

    try {
      const adminToken = await waitForTruthWorklistAuthToken();
      if (requestSequence !== truthWorklistRequestSequence) return;
      if (!adminToken) {
        state.runtime.truthWorklistView = {
          ...state.runtime.truthWorklistView,
          loading: false,
          loaded: true,
          authRequired: true,
          error:
            "Logga in igen i admin for att lasa truth-driven worklistdata i denna assistvy.",
          scopeKey,
          scopeMode,
          mailboxIds: normalizedMailboxIds,
          payload: null,
        };
        renderTruthWorklistView();
        return;
      }
      const payload = await apiRequest(
        buildTruthWorklistConsumerHref(normalizedMailboxIds, getTruthWorklistViewLimit())
      );
      if (requestSequence !== truthWorklistRequestSequence) return;
      state.runtime.truthWorklistView = {
        ...state.runtime.truthWorklistView,
        loading: false,
        loaded: true,
        authRequired: false,
        error: "",
        scopeKey,
        scopeMode,
        mailboxIds: normalizedMailboxIds,
        payload,
      };
      renderTruthWorklistView();
    } catch (error) {
      if (requestSequence !== truthWorklistRequestSequence) return;
      state.runtime.truthWorklistView = {
        ...state.runtime.truthWorklistView,
        loading: false,
        loaded: true,
        authRequired: isAuthFailure(error?.statusCode, error?.message),
        error: error instanceof Error ? error.message : String(error),
        scopeKey,
        scopeMode,
        mailboxIds: normalizedMailboxIds,
        payload: null,
      };
      renderTruthWorklistView();
    }
  }

  function ensureTruthWorklistViewLoaded({ force = false } = {}) {
    if (!isTruthWorklistViewFeatureEnabled()) {
      renderTruthWorklistView();
      return;
    }
    const viewState =
      state.runtime && typeof state.runtime.truthWorklistView === "object"
        ? state.runtime.truthWorklistView
        : {};
    if (viewState.hidden === true) {
      renderTruthWorklistView();
      return;
    }
    const truthWorklistScope = resolveTruthWorklistScope();
    loadTruthWorklistView({
      mailboxIds: truthWorklistScope.mailboxIds,
      scopeMode: truthWorklistScope.scopeMode,
      force,
    }).catch((error) => {
      console.warn("Truth Worklist View kunde inte laddas.", error);
    });
  }

  function getIntelReadoutMailboxIds(thread) {
    const selectedScope = getSelectedRuntimeMailboxScopeIds();
    if (selectedScope.length) return selectedScope;
    const customerScope = getCustomerHistoryMailboxOptions(thread).map((option) => option.id);
    if (customerScope.length) return customerScope;
    return getThreadHistoryMailboxOptions(thread).map((option) => option.id);
  }

  function buildIntelReadoutHref(target, thread) {
    const normalizedTarget = normalizeKey(target || "calibration") || "calibration";
    const basePath =
      normalizedTarget === "shadow"
        ? "/api/v1/cco/runtime/shadow/readout"
        : "/api/v1/cco/runtime/calibration/readout";
    if (!thread) return basePath;

    const params = new URLSearchParams();
    const customerEmail = getRuntimeCustomerEmail(thread);
    const mailboxIds = getIntelReadoutMailboxIds(thread);
    const intentValue = normalizeKey(thread?.raw?.intent || "");

    if (customerEmail) params.set("customerEmail", customerEmail);
    if (thread.id) params.set("conversationId", thread.id);
    if (mailboxIds.length) params.set("mailboxIds", mailboxIds.join(","));

    if (normalizedTarget === "shadow") {
      params.set("lookbackDays", "14");
      params.set("limit", "10");
    } else {
      params.set("lookbackDays", "365");
      if (intentValue) params.set("intent", intentValue);
    }

    return `${basePath}?${params.toString()}`;
  }

  function hasCustomerImportSource(body = getCustomerImportBody()) {
    return (
      Boolean(String(body?.text || "").trim()) ||
      Boolean(normalizeText(body?.binaryBase64)) ||
      (Array.isArray(body?.rows) && body.rows.length > 0)
    );
  }

  function renderHistoryFilterRow(row, items, activeValue, dataAttribute) {
    if (!row) return;
    row.innerHTML = "";
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `focus-history-filter${activeValue === item.id ? " is-active" : ""}`;
      button.dataset[dataAttribute] = item.id;
      button.textContent = item.label;
      row.appendChild(button);
    });
  }

  function renderHistoryEventsList(
    container,
    events,
    selectedThreadId,
    emptyState = {
      title: "Ingen historik i valt urval",
      text: "Justera filtren eller byt scope för att läsa fler händelser.",
      chip: "Historik",
    },
    leadState = null
  ) {
    if (!container) return;
    container.innerHTML = "";

    if (!events.length) {
      container.innerHTML = `
        <article class="focus-history-entry">
          <div class="focus-history-entry-head">
            <div>
              <div class="focus-history-meta-row">
                <span class="focus-history-type-pill">${escapeHtml(emptyState.chip || "Historik")}</span>
              </div>
              <p class="focus-history-entry-title">${escapeHtml(emptyState.title || "Ingen historik i valt urval")}</p>
              <p class="focus-history-entry-text">${escapeHtml(
                emptyState.text || "Justera filtren eller byt scope för att läsa fler händelser."
              )}</p>
            </div>
          </div>
      </article>`;
      return;
    }

    if (leadState?.label) {
      const leadArticle = document.createElement("article");
      leadArticle.className = "focus-history-entry focus-history-entry--state";
      const leadHead = document.createElement("div");
      leadHead.className = "focus-history-entry-head";
      const leadCopy = document.createElement("div");
      const leadMeta = document.createElement("div");
      leadMeta.className = "focus-history-meta-row";

      const statePill = document.createElement("span");
      statePill.className = "focus-customer-chip focus-customer-chip--green";
      statePill.textContent = leadState.label;
      leadMeta.appendChild(statePill);

      const leadTitle = document.createElement("h4");
      leadTitle.className = "focus-history-entry-title";
      leadTitle.textContent = leadState.title || "Kundhistorik";

      const leadText = document.createElement("p");
      leadText.className = "focus-history-entry-text";
      leadText.textContent = leadState.text || "";

      leadCopy.append(leadMeta, leadTitle, leadText);
      leadHead.appendChild(leadCopy);
      leadArticle.appendChild(leadHead);
      container.appendChild(leadArticle);
    }

    events.forEach((event, index) => {
      const article = document.createElement("article");
      article.className = "focus-history-entry";
      const resultType = deriveHistoryEventResultType(event);
      article.dataset.historyResult = resultType;

      const head = document.createElement("div");
      head.className = "focus-history-entry-head";

      const copy = document.createElement("div");
      const meta = document.createElement("div");
      meta.className = "focus-history-meta-row";

      const type = document.createElement("span");
      type.className = `focus-history-type-pill focus-history-type-pill--${getHistoryEventTypeTone(
        resultType
      )}`;
      type.textContent = getHistoryEventTypeLabel(event);

      meta.appendChild(type);

      if (index === 0 && leadState?.label) {
        const state = document.createElement("span");
        state.className = "focus-customer-chip focus-customer-chip--green focus-history-entry-state-pill";
        state.textContent = leadState.label;
        meta.appendChild(state);
      }

      if (asText(event.mailboxLabel)) {
        const mailbox = document.createElement("span");
        mailbox.className = "focus-history-mailbox-pill";
        mailbox.textContent = event.mailboxLabel;
        meta.appendChild(mailbox);
      }

      const conversationId = asText(event.conversationId);
      if (
        asText(event.scopeLabel) &&
        conversationId &&
        !runtimeConversationIdsMatch(conversationId, selectedThreadId)
      ) {
        const scope = document.createElement("span");
        scope.className = "focus-history-scope-pill";
        scope.textContent = compactRuntimeCopy(event.scopeLabel, event.scopeLabel, 28);
        meta.appendChild(scope);
      }

      const title = document.createElement("h4");
      title.className = "focus-history-entry-title";
      title.textContent = event.description;

      const text = document.createElement("p");
      text.className = "focus-history-entry-text";
      text.textContent = event.detail;

      copy.append(meta, title, text);

      const stamp = document.createElement("time");
      stamp.className = "focus-history-entry-time";
      stamp.dateTime = event.recordedAt || "";
      stamp.textContent = event.time || formatHistoryTimestamp(event.recordedAt);

      head.append(copy, stamp);
      article.append(head);

      if (conversationId && !runtimeConversationIdsMatch(conversationId, selectedThreadId)) {
        const actions = document.createElement("div");
        actions.className = "focus-history-entry-actions";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "focus-history-open-thread";
        button.dataset.historyOpenThread = "true";
        button.dataset.historyConversationId = conversationId;
        button.textContent = "Öppna tråd";

        actions.append(button);
        article.append(actions);
      }

      container.appendChild(article);
    });
  }

  function readPxVariable(name) {
    const value = Number.parseFloat(getComputedStyle(canvas).getPropertyValue(name));
    return Number.isFinite(value) ? value : 0;
  }

  function getWorkspaceGapTotal() {
    return readPxVariable("--workspace-gap") + readPxVariable("--workspace-focus-gap");
  }

  function getWorkspaceAvailableWidth() {
    return previewWorkspace.getBoundingClientRect().width;
  }

  function getQueueIntrinsicWidth() {
    return MIN_QUEUE_WIDTH;
  }

  function getIntelIntrinsicWidth() {
    return MIN_INTEL_WIDTH;
  }

  function getWorkspaceDynamicMaxLeft(availableWidth, rightWidth) {
    return Math.max(
      workspaceLimits.left.min,
      Math.min(
        workspaceLimits.left.max,
        availableWidth - getWorkspaceGapTotal() - workspaceLimits.main.min - rightWidth
      )
    );
  }

  function getWorkspaceDynamicMaxRight(availableWidth, leftWidth) {
    return Math.max(
      workspaceLimits.right.min,
      Math.min(
        workspaceLimits.right.max,
        availableWidth - getWorkspaceGapTotal() - workspaceLimits.main.min - leftWidth
      )
    );
  }

  function applyWorkspaceState() {
    canvas.style.setProperty("--workspace-left-width", `${workspaceState.left}px`);
    canvas.style.setProperty("--workspace-main-width", `${workspaceState.main}px`);
    canvas.style.setProperty("--workspace-right-width", `${workspaceState.right}px`);
  }

  function normalizeWorkspaceState() {
    if (canvas.classList.contains("is-workspace-width-frozen")) {
      applyWorkspaceState();
      return;
    }

    const availableWidth = getWorkspaceAvailableWidth();
    if (!availableWidth) return;

    workspaceLimits.left.min = getQueueIntrinsicWidth();
    workspaceLimits.right.min = getIntelIntrinsicWidth();

    workspaceState.left = clamp(
      workspaceState.left,
      workspaceLimits.left.min,
      getWorkspaceDynamicMaxLeft(availableWidth, workspaceState.right)
    );

    workspaceState.right = clamp(
      workspaceState.right,
      workspaceLimits.right.min,
      getWorkspaceDynamicMaxRight(availableWidth, workspaceState.left)
    );

    let derivedMain =
      availableWidth - getWorkspaceGapTotal() - workspaceState.left - workspaceState.right;

    if (derivedMain < workspaceLimits.main.min) {
      let deficit = workspaceLimits.main.min - derivedMain;
      const rightSlack = workspaceState.right - workspaceLimits.right.min;
      const shrinkRight = Math.min(deficit, rightSlack);
      workspaceState.right -= shrinkRight;
      deficit -= shrinkRight;

      if (deficit > 0) {
        const leftSlack = workspaceState.left - workspaceLimits.left.min;
        const shrinkLeft = Math.min(deficit, leftSlack);
        workspaceState.left -= shrinkLeft;
      }

      derivedMain =
        availableWidth - getWorkspaceGapTotal() - workspaceState.left - workspaceState.right;
    }

    workspaceState.main = Math.max(workspaceLimits.main.min, Math.round(derivedMain));
    applyWorkspaceState();
  }

  function mapPriorityLabel(value) {
    return PRIORITY_LABELS[normalizeText(value).toLowerCase()] || "Medel";
  }

  function mapPriorityValue(value) {
    return PRIORITY_VALUES[normalizeText(value).toLowerCase()] || "medium";
  }

  function mapVisibilityLabel(value) {
    return VISIBILITY_LABELS[normalizeText(value).toLowerCase()] || "Team";
  }

  function mapVisibilityValue(value) {
    return VISIBILITY_VALUES[normalizeText(value).toLowerCase()] || "team";
  }

  function tagsFrom(values) {
    const tags = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const normalized = normalizeText(value);
      if (!normalized) continue;
      const lowered = normalized.toLowerCase();
      if (seen.has(lowered)) continue;
      seen.add(lowered);
      tags.push(normalized);
      if (tags.length >= 12) break;
    }
    return tags;
  }

  function setFeedback(node, tone = "", message = "") {
    if (!node) return;
    node.textContent = message || "";
    node.classList.remove("is-loading", "is-success", "is-error");
    node.dataset.statusTone = tone || "";
    if (!message) {
      node.setAttribute("hidden", "hidden");
      return;
    }
    node.removeAttribute("hidden");
    if (tone) {
      node.classList.add(`is-${tone}`);
    }
  }

  function setButtonBusy(button, busy, idleLabel, busyLabel) {
    if (!button) return;
    if (!button.dataset.idleLabel) {
      button.dataset.idleLabel = idleLabel || normalizeText(button.textContent);
    }
    button.disabled = Boolean(busy);
    button.textContent = busy ? busyLabel : button.dataset.idleLabel;
    button.classList.toggle("is-busy", Boolean(busy));
  }

  function formatCompactKr(value) {
    const numeric = Number(value) || 0;
    if (numeric >= 1000) {
      return `${Math.round(numeric / 100) / 10}k kr`.replace(".0k", "k");
    }
    return `${numeric} kr`;
  }

  function setCustomersStatus(message = "", tone = "") {
    setFeedback(customerStatus, tone, message);
  }

  function setAutomationStatus(message = "", tone = "") {
    setFeedback(automationStatus, tone, message);
  }

  function setTrustNote(node, message = "", tone = "derived") {
    if (!node) return;
    const normalizedMessage = normalizeText(message);
    node.textContent = normalizedMessage;
    node.hidden = !normalizedMessage;
    node.classList.remove("is-live", "is-derived", "is-fallback", "is-auth");
    if (normalizedMessage) {
      node.classList.add(`is-${normalizeKey(tone) || "derived"}`);
    }
  }

  function setAuxStatus(node, message = "", tone = "") {
    setFeedback(node, tone, message);
  }

  function getMailFeedStatusNode(feedKey) {
    return normalizeKey(feedKey) === "later" ? laterStatus : sentStatus;
  }

  function getMailFeedUndoButton(feedKey) {
    const normalizedFeed = normalizeKey(feedKey);
    return (
      mailFeedUndoButtons.find(
        (button) => normalizeKey(button.dataset.mailFeedUndo) === normalizedFeed
      ) || null
    );
  }

  function resetPendingMailFeedDelete() {
    if (pendingMailFeedDeleteTimer) {
      window.clearTimeout(pendingMailFeedDeleteTimer);
      pendingMailFeedDeleteTimer = null;
    }
    state.pendingMailFeedDelete.active = false;
    state.pendingMailFeedDelete.feed = "";
    state.pendingMailFeedDelete.count = 0;
    state.pendingMailFeedDelete.committing = false;
    state.pendingMailFeedDelete.threadsSnapshot = [];
    state.pendingMailFeedDelete.previousThreadsSnapshot = [];
    state.pendingMailFeedDelete.previousSelectedThreadId = "";
    state.pendingMailFeedDelete.previousSelections = {
      later: [],
      sent: [],
    };
    renderMailFeedUndoState();
  }

  function restorePendingMailFeedDelete(message = "", tone = "success") {
    const pending = state.pendingMailFeedDelete;
    if (!pending.active) return false;
    state.runtime.threads = cloneJson(pending.previousThreadsSnapshot);
    workspaceSourceOfTruth.setSelectedThreadId(asText(pending.previousSelectedThreadId));
    getMailFeedRuntimeState("later").selectedKeys = [...asArray(pending.previousSelections.later)];
    getMailFeedRuntimeState("sent").selectedKeys = [...asArray(pending.previousSelections.sent)];
    const feedKey = pending.feed;
    const count = pending.count;
    resetPendingMailFeedDelete();
    ensureRuntimeSelection();
    renderRuntimeConversationShell();
    if (message) {
      setAuxStatus(getMailFeedStatusNode(feedKey), message, tone);
    } else {
      setAuxStatus(
        getMailFeedStatusNode(feedKey),
        count > 1 ? `${count} trådar återställdes.` : "Tråden återställdes.",
        "success"
      );
    }
    return true;
  }

  async function commitPendingMailFeedDelete() {
    const pending = state.pendingMailFeedDelete;
    if (!pending.active || pending.committing) return false;
    pending.committing = true;
    if (pendingMailFeedDeleteTimer) {
      window.clearTimeout(pendingMailFeedDeleteTimer);
      pendingMailFeedDeleteTimer = null;
    }
    renderMailFeedUndoState();
    const feedKey = pending.feed;
    const count = pending.count;
    setAuxStatus(
      getMailFeedStatusNode(feedKey),
      count > 1 ? `Raderar ${count} trådar…` : "Raderar tråden…",
      "loading"
    );
    try {
      await deleteMailFeedThreads(feedKey, pending.threadsSnapshot);
      resetPendingMailFeedDelete();
      setAuxStatus(
        getMailFeedStatusNode(feedKey),
        count > 1 ? `${count} trådar raderades.` : "Tråden raderades.",
        "success"
      );
      return true;
    } catch (error) {
      const message = error?.message || "Kunde inte radera trådarna.";
      restorePendingMailFeedDelete(message, "error");
      return false;
    }
  }

  function stageMailFeedDelete(feedKey, threads) {
    const runtimeThreads = asArray(threads).filter((thread) => thread?.id);
    if (!runtimeThreads.length) return false;
    if (!state.runtime.deleteEnabled) {
      setAuxStatus(
        getMailFeedStatusNode(feedKey),
        "Delete är inte aktiverat i live runtime.",
        "error"
      );
      return false;
    }
    if (state.pendingMailFeedDelete.active) {
      setAuxStatus(
        getMailFeedStatusNode(feedKey),
        "Slutför eller ångra den pågående raderingen först.",
        "error"
      );
      return false;
    }
    const normalizedFeed = normalizeKey(feedKey) === "later" ? "later" : "sent";
    const removedIds = new Set(runtimeThreads.map((thread) => asText(thread.id)).filter(Boolean));
    state.pendingMailFeedDelete.active = true;
    state.pendingMailFeedDelete.feed = normalizedFeed;
    state.pendingMailFeedDelete.count = runtimeThreads.length;
    state.pendingMailFeedDelete.committing = false;
    state.pendingMailFeedDelete.threadsSnapshot = cloneJson(runtimeThreads);
    state.pendingMailFeedDelete.previousThreadsSnapshot = cloneJson(state.runtime.threads);
    state.pendingMailFeedDelete.previousSelectedThreadId = asText(state.runtime.selectedThreadId);
    state.pendingMailFeedDelete.previousSelections = {
      later: [...asArray(getMailFeedRuntimeState("later").selectedKeys)],
      sent: [...asArray(getMailFeedRuntimeState("sent").selectedKeys)],
    };
    state.runtime.threads = state.runtime.threads.filter((thread) => !removedIds.has(asText(thread.id)));
    getMailFeedRuntimeState(normalizedFeed).selectedKeys = [];
    ensureRuntimeSelection();
    renderRuntimeConversationShell();
    setAuxStatus(
      getMailFeedStatusNode(normalizedFeed),
      runtimeThreads.length > 1
        ? `${runtimeThreads.length} trådar flyttades ur vyn. Ångra inom 6 sekunder.`
        : "Tråden flyttades ur vyn. Ångra inom 6 sekunder.",
      "loading"
    );
    renderMailFeedUndoState();
    pendingMailFeedDeleteTimer = window.setTimeout(() => {
      commitPendingMailFeedDelete().catch((error) => {
        console.warn("Mail feed delete commit misslyckades.", error);
      });
    }, 6000);
    return true;
  }

  function setMoreMenuOpen(open) {
    const isOpen = workspaceSourceOfTruth.setOverlayOpen("moreMenu", open);
    state.moreMenuOpen = isOpen;
    if (moreMenu) {
      moreMenu.hidden = !isOpen;
      moreMenu.setAttribute("aria-hidden", isOpen ? "false" : "true");
      moreMenu.style.display = isOpen ? "grid" : "none";
      moreMenu.style.visibility = isOpen ? "visible" : "hidden";
      moreMenu.style.opacity = isOpen ? "1" : "0";
      moreMenu.style.pointerEvents = isOpen ? "auto" : "none";
    }
    if (moreMenuToggle) {
      moreMenuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  function setFloatingShellOpen(shell, open, offsetY = 14) {
    if (!shell) return;
    shell.setAttribute("aria-hidden", open ? "false" : "true");
    shell.style.opacity = open ? "1" : "0";
    shell.style.visibility = open ? "visible" : "hidden";
    shell.style.pointerEvents = open ? "auto" : "none";
    const surface = shell.querySelector(
      ".customers-modal-surface, .mailbox-admin-surface, .note-mode-surface, .shell-modal-surface"
    );
    if (surface) {
      surface.style.transform = open
        ? "translateX(-50%) translateY(0)"
        : `translateX(-50%) translateY(${offsetY}px)`;
    }
    syncCanvasFloatingShellState();
  }

  function hasFloatingShellOpen() {
    return Boolean(
      state.macroModal.open ||
      state.settingsProfileModal.open ||
      state.confirmDialog.open ||
      state.customerMergeModalOpen ||
      state.customerSettingsOpen ||
      state.customerRuntime.splitModalOpen ||
      state.customerImport.open ||
      state.mailboxAdminOpen ||
      state.noteMode.open
    );
  }

  function syncCanvasFloatingShellState() {
    if (!canvas) return;
    canvas.classList.toggle("has-floating-modal", hasFloatingShellOpen());
    canvas.classList.toggle("is-confirm-open", Boolean(state.confirmDialog.open));
  }

  function getConfirmDialogTitle(options = {}) {
    const explicitTitle = asText(options.title);
    if (explicitTitle) return explicitTitle;
    const confirmLabel = asText(options.confirmLabel);
    if (confirmLabel) return `${confirmLabel} den här åtgärden?`;
    return normalizeKey(options.tone) === "danger"
      ? "Bekräfta ändringen"
      : "Fortsätt med åtgärden";
  }

  function getConfirmDialogCopy(options = {}) {
    const explicitCopy = asText(options.copy);
    if (explicitCopy) return explicitCopy;
    return normalizeKey(options.tone) === "danger"
      ? "Bekräfta bara om du vill fortsätta med en åtgärd som kan påverka eller ta bort innehåll i CCO."
      : "Bekräfta bara om du vill fortsätta med den valda åtgärden i CCO.";
  }

  function openConfirmDialog(actionKey, context = {}) {
    const normalizedActionKey = normalizeKey(actionKey);
    const definition = CONFIRM_DIALOG_DEFINITIONS[normalizedActionKey];
    if (!definition) {
      console.warn("Bekräftelsedialogen stöder inte actionKey:", actionKey);
      return false;
    }
    if (typeof context.onConfirm !== "function") {
      console.warn("Bekräftelsedialogen kräver en onConfirm-handler:", actionKey);
      return false;
    }
    const resolved = definition(context) || {};
    setConfirmDialogOpen(true, {
      actionKey: normalizedActionKey,
      onConfirm: context.onConfirm,
      ...resolved,
    });
    return true;
  }

  function setMacroModalOpen(open, options = {}) {
    state.macroModal.open = Boolean(open);
    if (open) {
      state.macroModal.mode = normalizeKey(options.mode) === "edit" ? "edit" : "create";
      state.macroModal.macroId = asText(options.macroId);
      const macro =
        state.macroModal.mode === "edit"
          ? state.macros.find(
              (item) =>
                normalizeKey(item.id || item.key) === normalizeKey(state.macroModal.macroId)
            ) || null
          : null;
      if (macroModalKicker) {
        macroModalKicker.textContent =
          state.macroModal.mode === "edit" ? "Uppdatera makro" : "Makro";
      }
      if (macroModalTitle) {
        macroModalTitle.textContent =
          state.macroModal.mode === "edit" ? "Redigera makro" : "Skapa makro";
      }
      if (macroModalSubmitButton) {
        macroModalSubmitButton.textContent =
          state.macroModal.mode === "edit" ? "Spara ändringar" : "Spara makro";
      }
      if (macroModalNameInput) {
        macroModalNameInput.value = macro?.title || "";
      }
      if (macroModalDescriptionInput) {
        macroModalDescriptionInput.value =
          macro?.copy || "Standardiserar nästa steg i svar, anteckning och uppföljning.";
      }
      if (macroModalTriggerSelect) {
        macroModalTriggerSelect.value = macro?.mode === "auto" ? "auto" : "manual";
      }
      setFeedback(macroModalFeedback, "", "");
    } else {
      state.macroModal.mode = "create";
      state.macroModal.macroId = "";
      setFeedback(macroModalFeedback, "", "");
    }
    setFloatingShellOpen(macroEditorShell, state.macroModal.open, 16);
  }

  function setSettingsProfileModalOpen(open) {
    state.settingsProfileModal.open = Boolean(open);
    if (open) {
      if (settingsProfileModalNameInput) {
        settingsProfileModalNameInput.value =
          state.settingsRuntime.profileName || "Ditt namn";
      }
      if (settingsProfileModalEmailInput) {
        settingsProfileModalEmailInput.value =
          state.settingsRuntime.profileEmail || "din.email@hairtp.com";
      }
      setFeedback(settingsProfileModalFeedback, "", "");
    } else {
      setFeedback(settingsProfileModalFeedback, "", "");
    }
    setFloatingShellOpen(settingsProfileShell, state.settingsProfileModal.open, 16);
  }

  function setConfirmDialogOpen(open, options = {}) {
    const normalizedActionKey = normalizeKey(options.actionKey);
    if (open && !CONFIRM_DIALOG_DEFINITIONS[normalizedActionKey]) {
      console.warn("Bekräftelsedialogen blockerade okänd actionKey:", options.actionKey);
      return;
    }
    state.confirmDialog.open = Boolean(open);
    if (open) {
      state.confirmDialog.actionKey = normalizedActionKey;
      state.confirmDialog.tone = normalizeKey(options.tone) || "danger";
      state.confirmDialog.onConfirm =
        typeof options.onConfirm === "function" ? options.onConfirm : null;
      if (confirmKicker) confirmKicker.textContent = asText(options.kicker, "Bekräfta");
      if (confirmTitle) confirmTitle.textContent = getConfirmDialogTitle(options);
      if (confirmCopy) confirmCopy.textContent = getConfirmDialogCopy(options);
      if (confirmSubmitButton) {
        confirmSubmitButton.textContent = asText(options.confirmLabel, "Bekräfta");
        confirmSubmitButton.classList.toggle(
          "customers-merge-accept",
          state.confirmDialog.tone !== "danger"
        );
        confirmSubmitButton.classList.toggle(
          "settings-danger-button",
          state.confirmDialog.tone === "danger"
        );
      }
      setFeedback(confirmFeedback, "", "");
    } else {
      state.confirmDialog.actionKey = "";
      state.confirmDialog.onConfirm = null;
      state.confirmDialog.tone = "danger";
      setFeedback(confirmFeedback, "", "");
    }
    setFloatingShellOpen(shellConfirmShell, state.confirmDialog.open, 16);
  }

  function getCustomerDetail(key) {
    const normalizedKey = normalizeKey(key);
    const directory = getCustomerDirectoryMap()[normalizedKey] || {};
    const detail = getCustomerDetailsMap()[normalizedKey] || { emails: [], mailboxes: [] };
    return {
      key: normalizedKey,
      name: directory.name || normalizedKey,
      emails: [...detail.emails],
      phone: detail.phone || "",
      mailboxes: [...(detail.mailboxes || [])],
    };
  }

  function getCustomerDirectoryMap() {
    if (!state.customerRuntime.directory || typeof state.customerRuntime.directory !== "object") {
      state.customerRuntime.directory = {};
    }
    return state.customerRuntime.directory;
  }

  function getCustomerDetailsMap() {
    if (!state.customerRuntime.details || typeof state.customerRuntime.details !== "object") {
      state.customerRuntime.details = {};
    }
    return state.customerRuntime.details;
  }

  function buildCustomerSuggestionPairId(primaryKey, secondaryKey) {
    return [normalizeKey(primaryKey), normalizeKey(secondaryKey)]
      .filter(Boolean)
      .sort()
      .join("::");
  }

  function buildCustomerPersistPayload() {
    return {
      mergedInto: { ...state.customerRuntime.mergedInto },
      dismissedSuggestionIds: [...asArray(state.customerRuntime.dismissedSuggestionIds)].map((item) =>
        buildCustomerSuggestionPairId(...String(item || "").split("::"))
      ).filter(Boolean),
      acceptedSuggestionIds: [...asArray(state.customerRuntime.acceptedSuggestionIds)].map((item) =>
        buildCustomerSuggestionPairId(...String(item || "").split("::"))
      ).filter(Boolean),
      directory: cloneJson(getCustomerDirectoryMap()),
      details: cloneJson(getCustomerDetailsMap()),
      profileCounts: { ...state.customerRuntime.profileCounts },
      primaryEmailByKey: { ...state.customerPrimaryEmailByKey },
      identityByKey:
        state.customerRuntime.identityByKey && typeof state.customerRuntime.identityByKey === "object"
          ? cloneJson(state.customerRuntime.identityByKey)
          : {},
      mergeReviewDecisionsByPairId:
        state.customerRuntime.mergeReviewDecisionsByPairId &&
        typeof state.customerRuntime.mergeReviewDecisionsByPairId === "object"
          ? cloneJson(state.customerRuntime.mergeReviewDecisionsByPairId)
          : {},
      customerSettings: { ...state.customerSettings },
      updatedAt: new Date().toISOString(),
    };
  }

  function applyCustomerPersistedState(customerState = {}) {
    state.customerRuntime.mergedInto = {
      ...(customerState?.mergedInto && typeof customerState.mergedInto === "object"
        ? customerState.mergedInto
        : {}),
    };
    state.customerRuntime.dismissedSuggestionIds = [
      ...asArray(customerState?.dismissedSuggestionIds)
        .map((item) => buildCustomerSuggestionPairId(...String(item || "").split("::")))
        .filter(Boolean),
    ];
    state.customerRuntime.acceptedSuggestionIds = [
      ...asArray(customerState?.acceptedSuggestionIds)
        .map((item) => buildCustomerSuggestionPairId(...String(item || "").split("::")))
        .filter(Boolean),
    ];
    state.customerRuntime.directory =
      customerState?.directory && typeof customerState.directory === "object"
        ? cloneJson(customerState.directory)
        : {};
    state.customerRuntime.details =
      customerState?.details && typeof customerState.details === "object"
        ? cloneJson(customerState.details)
        : {};
    state.customerRuntime.profileCounts =
      customerState?.profileCounts && typeof customerState.profileCounts === "object"
        ? { ...customerState.profileCounts }
        : {};
    state.customerPrimaryEmailByKey =
      customerState?.primaryEmailByKey &&
      typeof customerState.primaryEmailByKey === "object"
        ? { ...customerState.primaryEmailByKey }
        : {};
    state.customerRuntime.identityByKey =
      customerState?.identityByKey && typeof customerState.identityByKey === "object"
        ? cloneJson(customerState.identityByKey)
        : {};
    state.customerRuntime.mergeReviewDecisionsByPairId =
      customerState?.mergeReviewDecisionsByPairId &&
      typeof customerState.mergeReviewDecisionsByPairId === "object"
        ? cloneJson(customerState.mergeReviewDecisionsByPairId)
        : {};
    state.customerSettings = {
      ...DEFAULT_CUSTOMER_SETTINGS,
      ...(customerState?.customerSettings &&
      typeof customerState.customerSettings === "object"
        ? customerState.customerSettings
        : {}),
    };
  }

  async function refreshCustomerIdentitySuggestions({ quiet = true } = {}) {
    if (state.customerRuntime.authRequired && !getAdminToken()) {
      return { suggestionGroups: state.customerRuntime.identitySuggestionGroups || {} };
    }

    state.customerRuntime.identitySuggestionsLoading = true;
    try {
      const payload = await apiRequest("/api/v1/cco/customers/identity/suggestions", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-customers-identity-suggestions"),
        },
        body: {
          customerState: buildCustomerPersistPayload(),
        },
      });
      applyCustomerPersistedState(payload?.customerState || {});
      state.customerRuntime.identitySuggestionGroups =
        payload?.suggestionGroups && typeof payload.suggestionGroups === "object"
          ? cloneJson(payload.suggestionGroups)
          : {};
      state.customerRuntime.duplicateMetric = Math.max(
        0,
        Number(payload?.duplicateCount || 0)
      );
      state.customerRuntime.authRequired = false;
      state.customerRuntime.error = "";
      return payload;
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        state.customerRuntime.error = "Inloggning krävs för att läsa kundidentiteten.";
        if (!quiet) {
          setCustomersStatus(state.customerRuntime.error, "error");
        }
      } else if (!quiet) {
        setCustomersStatus(
          error?.message || "Kunde inte läsa identitetsförslagen.",
          "error"
        );
      }
      return { suggestionGroups: state.customerRuntime.identitySuggestionGroups || {} };
    } finally {
      state.customerRuntime.identitySuggestionsLoading = false;
    }
  }

  async function loadCustomersRuntime({ force = false } = {}) {
    if (state.customerRuntime.loading && !force) return state.customerRuntime;
    if (state.customerRuntime.loaded && !force && !state.customerRuntime.error) {
      ensureCustomerRuntimeProfilesFromLive();
      await refreshCustomerIdentitySuggestions({ quiet: true });
      applyCustomerFilters();
      return state.customerRuntime;
    }

    state.customerRuntime.loading = true;
    state.customerRuntime.authRequired = false;
    state.customerRuntime.error = "";
    setCustomersStatus("Läser kundpersistens…", "loading");
    try {
      const payload = await apiRequest("/api/v1/cco/customers/state");
      applyCustomerPersistedState(payload?.customerState || {});
      ensureCustomerRuntimeProfilesFromLive();
      await refreshCustomerIdentitySuggestions({ quiet: true });
      state.customerRuntime.loaded = true;
      setCustomersStatus("", "");
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        state.customerRuntime.error = "Inloggning krävs för att läsa kundpersistensen.";
      } else {
        state.customerRuntime.error =
          error?.message || "Kunde inte läsa kundpersistensen.";
      }
      ensureCustomerRuntimeProfilesFromLive();
      state.customerRuntime.identitySuggestionGroups = {};
      setCustomersStatus(state.customerRuntime.error, "error");
    } finally {
      state.customerRuntime.loading = false;
      applyCustomerFilters();
    }
    return state.customerRuntime;
  }

  async function saveCustomersRuntime(successMessage = "") {
    if (state.customerRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return false;
    }

    state.customerRuntime.saving = true;
    if (successMessage) {
      setCustomersStatus("Sparar kundändring…", "loading");
    }
    try {
      const payload = await apiRequest("/api/v1/cco/customers/state", {
        method: "PUT",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-customers-save"),
        },
        body: {
          customerState: buildCustomerPersistPayload(),
        },
      });
      applyCustomerPersistedState(payload?.customerState || {});
      ensureCustomerRuntimeProfilesFromLive();
      await refreshCustomerIdentitySuggestions({ quiet: true });
      state.customerRuntime.loaded = true;
      state.customerRuntime.authRequired = false;
      state.customerRuntime.error = "";
      if (successMessage) {
        setCustomersStatus(successMessage, "success");
      }
      applyCustomerFilters();
      return true;
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        setCustomersStatus("Inloggning krävs för att spara kundändringar.", "error");
        window.location.assign(buildReauthUrl());
        return false;
      }
      state.customerRuntime.error =
        error?.message || "Kunde inte spara kundändringarna.";
      setCustomersStatus(state.customerRuntime.error, "error");
      return false;
    } finally {
      state.customerRuntime.saving = false;
    }
  }

  function refreshCustomerNodeRefs() {
    customerRows = Array.from(document.querySelectorAll("[data-customer-row]"));
    customerMergeGroups = Array.from(document.querySelectorAll("[data-customer-merge-group]"));
    customerDetailCards = Array.from(document.querySelectorAll("[data-customer-detail]"));
  }

  function mergeUniqueMailboxValues(values) {
    const merged = [];
    const seen = new Set();
    asArray(values).forEach((value) => {
      const normalized = normalizeMailboxId(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(asText(value));
    });
    return merged;
  }

  function mergeUniqueTextValues(values) {
    const merged = [];
    const seen = new Set();
    asArray(values).forEach((value) => {
      const text = normalizeText(value);
      const normalized = normalizeKey(text);
      if (!text || !normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(text);
    });
    return merged;
  }

  function escapeAttribute(value) {
    return escapeHtml(asText(value)).replace(/"/g, "&quot;");
  }

  function getVisibleCustomerPoolKeys() {
    return Object.keys(getCustomerDirectoryMap()).filter(
      (key) => !state.customerRuntime.mergedInto[normalizeKey(key)]
    );
  }

  function findCustomerKeyByEmail(email) {
    const normalizedEmail = normalizeMailboxId(email);
    if (!normalizedEmail) return "";
    const detailsMap = getCustomerDetailsMap();
    const match =
      Object.keys(detailsMap).find((key) =>
        asArray(detailsMap[key]?.emails).some(
          (entry) => normalizeMailboxId(entry) === normalizedEmail
        )
      ) || "";
    return normalizeKey(state.customerRuntime.mergedInto[normalizeKey(match)] || match);
  }

  function findCustomerKeyByName(name) {
    const normalizedName = normalizeKey(name);
    if (!normalizedName) return "";
    const directoryMap = getCustomerDirectoryMap();
    const match =
      Object.keys(directoryMap).find(
        (key) => normalizeKey(directoryMap[key]?.name) === normalizedName
      ) || "";
    return normalizeKey(state.customerRuntime.mergedInto[normalizeKey(match)] || match);
  }

  function syncSelectedCustomerIdentityForThread(thread) {
    if (!thread) return false;
    ensureCustomerRuntimeProfilesFromLive();
    const resolvedCustomerKey =
      normalizeKey(thread?.customerKey) ||
      findCustomerKeyByEmail(thread?.customerEmail) ||
      findCustomerKeyByName(thread?.customerName) ||
      "";
    if (!resolvedCustomerKey) return false;
    if (normalizeKey(state.selectedCustomerIdentity) !== resolvedCustomerKey) {
      setSelectedCustomerIdentity(resolvedCustomerKey);
      return true;
    }
    return false;
  }

  function createCustomerKeyFromThread(thread) {
    const directoryMap = getCustomerDirectoryMap();
    const base =
      normalizeKey(thread?.customerName) ||
      normalizeKey(asText(thread?.customerEmail).split("@")[0]) ||
      `customer_${Object.keys(directoryMap).length + 1}`;
    let candidate = base;
    let index = 2;
    while (directoryMap[candidate]) {
      candidate = `${base}_${index}`;
      index += 1;
    }
    return candidate;
  }

  function ensureCustomerRuntimeProfilesFromLive() {
    const directoryMap = getCustomerDirectoryMap();
    const detailsMap = getCustomerDetailsMap();
    const runtimeThreads = asArray(state.runtime?.threads);
    if (!runtimeThreads.length) return;
    const hydratedIds = new Set(asArray(state.customerRuntime.liveHydratedThreadIds));

    runtimeThreads.forEach((thread) => {
      const threadId = normalizeKey(thread?.id);
      const resolvedKey =
        findCustomerKeyByEmail(thread?.customerEmail) ||
        findCustomerKeyByName(thread?.customerName) ||
        createCustomerKeyFromThread(thread);

      if (!directoryMap[resolvedKey]) {
        directoryMap[resolvedKey] = {
          name: thread?.customerName || "Okänd kund",
          vip: Boolean(thread?.isVIP),
          emailCoverage: thread?.customerEmail ? 1 : 0,
          duplicateCandidate: false,
          profileCount: 1,
          customerValue: 0,
          totalConversations: 0,
          totalMessages: 0,
        };
      }

      if (!detailsMap[resolvedKey]) {
        detailsMap[resolvedKey] = {
          emails: [],
          phone: "",
          mailboxes: [],
        };
      }

      const detail = detailsMap[resolvedKey];
      detail.emails = mergeUniqueMailboxValues([
        ...asArray(detail.emails),
        thread?.customerEmail,
      ]);
      detail.mailboxes = mergeUniqueTextValues([
        ...asArray(detail.mailboxes),
        thread?.mailboxLabel,
      ]);

      const stats = directoryMap[resolvedKey];
      stats.name = stats.name || thread?.customerName || "Okänd kund";
      stats.vip = Boolean(stats.vip || thread?.isVIP);
      stats.emailCoverage = Math.max(
        Number(stats.emailCoverage || 0),
        detail.emails.length
      );
      stats.profileCount = Math.max(
        Number(stats.profileCount || 1),
        detail.emails.length || 1
      );
      if (threadId && !hydratedIds.has(threadId)) {
        stats.totalConversations = Number(stats.totalConversations || 0) + 1;
        stats.totalMessages =
          Number(stats.totalMessages || 0) +
          Math.max(1, asArray(thread?.messages).length || asArray(thread?.historyEvents).length || 1);
        hydratedIds.add(threadId);
      }
      stats.duplicateCandidate = Boolean(
        Number(stats.profileCount || 1) > 1 || stats.duplicateCandidate
      );

      if (!state.customerPrimaryEmailByKey[resolvedKey] && detail.emails[0]) {
        state.customerPrimaryEmailByKey[resolvedKey] = detail.emails[0];
      }
      if (!state.customerRuntime.profileCounts[resolvedKey]) {
        state.customerRuntime.profileCounts[resolvedKey] = Math.max(1, detail.emails.length || 1);
      }
    });
    state.customerRuntime.liveHydratedThreadIds = Array.from(hydratedIds);
  }

  function getCustomerRecord(key) {
    const normalizedKey = normalizeKey(key);
    const directory = getCustomerDirectoryMap()[normalizedKey] || {};
    const detail = getCustomerDetail(normalizedKey);
    const primaryEmail =
      state.customerPrimaryEmailByKey[normalizedKey] || detail.emails[0] || "";
    const otherEmailCount = Math.max(0, detail.emails.length - (primaryEmail ? 1 : 0) - 0);
    return {
      key: normalizedKey,
      name: directory.name || detail.name || normalizedKey,
      vip: Boolean(directory.vip),
      profileCount: Number(
        state.customerRuntime.profileCounts[normalizedKey] || directory.profileCount || 1
      ),
      customerValue: Number(directory.customerValue || 0),
      totalConversations: Number(directory.totalConversations || 0),
      totalMessages: Number(directory.totalMessages || 0),
      duplicateCandidate: Boolean(directory.duplicateCandidate),
      primaryEmail,
      otherEmailCount: Math.max(0, detail.emails.filter((email) => email !== primaryEmail).length),
      phone: detail.phone || "",
      emails: detail.emails,
      mailboxes: detail.mailboxes,
    };
  }

  function buildCustomerSuggestionGroups() {
    const serverGroups =
      state.customerRuntime.identitySuggestionGroups &&
      typeof state.customerRuntime.identitySuggestionGroups === "object"
        ? state.customerRuntime.identitySuggestionGroups
        : null;
    if (serverGroups && Object.keys(serverGroups).length) {
      return serverGroups;
    }
    const keys = getVisibleCustomerPoolKeys();
    const groups = Object.fromEntries(keys.map((key) => [key, []]));
    const detailsMap = getCustomerDetailsMap();
    const directoryMap = getCustomerDirectoryMap();

    for (let index = 0; index < keys.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < keys.length; compareIndex += 1) {
        const primaryKey = keys[index];
        const secondaryKey = keys[compareIndex];
        const primary = getCustomerRecord(primaryKey);
        const secondary = getCustomerRecord(secondaryKey);
        const primaryDetail = detailsMap[primaryKey] || { emails: [], mailboxes: [] };
        const secondaryDetail = detailsMap[secondaryKey] || { emails: [], mailboxes: [] };
        const reasons = [];
        let confidence = 0;

        const sharedPhone =
          normalizeText(primaryDetail.phone) &&
          normalizeText(primaryDetail.phone) === normalizeText(secondaryDetail.phone);
        if (sharedPhone) {
          reasons.push("Samma telefonnummer");
          confidence += 38;
        }

        const sharedEmails = asArray(primaryDetail.emails).filter((email) =>
          asArray(secondaryDetail.emails).some(
            (candidate) => normalizeMailboxId(candidate) === normalizeMailboxId(email)
          )
        );
        if (sharedEmails.length) {
          reasons.push(`Delad e-postadress: ${sharedEmails[0]}`);
          confidence += 42;
        }

        const nameOverlap =
          normalizeKey(primary.name).split(" ")[0] &&
          normalizeKey(primary.name).split(" ")[0] === normalizeKey(secondary.name).split(" ")[0];
        if (nameOverlap) {
          reasons.push("Liknande namn");
          confidence += 18;
        }

        const sharedMailboxes = asArray(primaryDetail.mailboxes).filter((mailbox) =>
          asArray(secondaryDetail.mailboxes).some(
            (candidate) => normalizeKey(candidate) === normalizeKey(mailbox)
          )
        );
        if (sharedMailboxes.length) {
          reasons.push(`Samma mailboxspår: ${sharedMailboxes[0]}`);
          confidence += 8;
        }

        if (Number(directoryMap[primaryKey]?.profileCount || 1) > 1) confidence += 4;
        if (Number(directoryMap[secondaryKey]?.profileCount || 1) > 1) confidence += 4;
        if (!reasons.length || confidence < 80) continue;

        const pairId = buildCustomerSuggestionPairId(primaryKey, secondaryKey);
        const buildSuggestion = (baseKey, candidateKey, candidateRecord) => ({
          id: pairId,
          pairId,
          primaryKey: baseKey,
          secondaryKey: candidateKey,
          name: candidateRecord.name,
          confidence: Math.min(98, confidence),
          reasons: reasons.slice(0, 3),
        });

        groups[primaryKey].push(buildSuggestion(primaryKey, secondaryKey, secondary));
        groups[secondaryKey].push(buildSuggestion(secondaryKey, primaryKey, primary));
      }
    }

    return groups;
  }

  function getActiveCustomerSuggestionCount(suggestionGroups) {
    const groups = suggestionGroups || buildCustomerSuggestionGroups();
    const seen = new Set();
    Object.values(groups).forEach((items) => {
      asArray(items).forEach((item) => {
        const pair = [normalizeKey(item.primaryKey), normalizeKey(item.secondaryKey)]
          .filter(Boolean)
          .sort()
          .join("::");
        if (!pair) return;
        const suggestionId = buildCustomerSuggestionPairId(item.primaryKey, item.secondaryKey);
        if (
          state.customerRuntime.dismissedSuggestionIds.includes(suggestionId) ||
          state.customerRuntime.acceptedSuggestionIds.includes(suggestionId)
        ) {
          return;
        }
        seen.add(pair);
      });
    });
    return seen.size;
  }

  function getBatchSelectionKeys() {
    const current = Array.isArray(state.customerBatchSelection)
      ? state.customerBatchSelection
      : [];
    return Array.from(
      new Set(
        current.filter(
          (key) =>
            getCustomerDirectoryMap()[normalizeKey(key)] &&
            !state.customerRuntime.mergedInto[normalizeKey(key)]
        )
      )
    );
  }

  function getMergeSelectionKeys() {
    const cleaned = getBatchSelectionKeys();
    if (cleaned.length >= 2) return cleaned;

    const visibleFallback = customerRows
      .map((row) => normalizeKey(row.dataset.customerRow))
      .filter(
        (key) =>
          !state.customerRuntime.mergedInto[key] &&
          key !== state.selectedCustomerIdentity &&
          !customerRows.find((row) => normalizeKey(row.dataset.customerRow) === key)?.hidden
      );

    return Array.from(new Set([state.selectedCustomerIdentity, ...visibleFallback])).slice(0, 2);
  }

  function renderCustomerBatchSelection() {
    const activeKeys = new Set(getBatchSelectionKeys());
    customerRows.forEach((row) => {
      const key = normalizeKey(row.dataset.customerRow);
      const check = row.querySelector(".customer-record-check");
      if (check) {
        check.classList.toggle("is-batch-selected", activeKeys.has(key));
      }
    });

    if (customerBulkCount) {
      customerBulkCount.textContent = `(${activeKeys.size})`;
    }

    const isSelectedInBatch = activeKeys.has(state.selectedCustomerIdentity);
    customerDetailActionButtons.forEach((button) => {
      if (button.dataset.customerDetailAction === "toggle_batch") {
        button.textContent = isSelectedInBatch ? "Avmarkera från batch" : "Markera för batch";
      }
    });
  }

  function renderCustomerDetailTools() {
    const detail = getCustomerDetail(state.selectedCustomerIdentity);
    const primaryEmail =
      state.customerPrimaryEmailByKey[detail.key] || detail.emails[0] || "";

    if (customerDetailName) {
      customerDetailName.textContent = detail.key ? detail.name : "Ingen kund vald";
    }

    if (customerEmailList) {
      customerEmailList.innerHTML = "";
      if (!detail.key) {
        customerEmailList.innerHTML =
          '<p class="customers-rail-inline-note">Välj en kund i listan för att se e-post, primary email och identitetsverktyg.</p>';
      }
      detail.emails.forEach((email, index) => {
        const row = document.createElement("div");
        row.className = "customers-email-row";
        if (email === primaryEmail || (!primaryEmail && index === 0)) {
          row.classList.add("is-primary");
        }

        const copy = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = email;
        const meta = document.createElement("small");
        meta.textContent =
          row.classList.contains("is-primary")
            ? `Primär · ${detail.mailboxes[index % Math.max(detail.mailboxes.length, 1)] || "Mailbox"}`
            : detail.mailboxes[index % Math.max(detail.mailboxes.length, 1)] || "Sekundär";
        copy.append(strong, meta);

        const chipRow = document.createElement("div");
        chipRow.className = "mail-feed-meta-row";
        const mailboxChip = document.createElement("span");
        mailboxChip.className = "customers-email-chip";
        mailboxChip.textContent = detail.mailboxes[index % Math.max(detail.mailboxes.length, 1)] || "Kons";
        chipRow.append(mailboxChip);

        row.append(copy, chipRow);
        customerEmailList.append(row);
      });
    }

    if (state.customerRuntime.splitModalOpen) {
      renderCustomerSplitModal();
    }
  }

  function renderCustomerMergeModal() {
    if (!customerMergePreview || !customerMergePrimaryOptions) return;
    const mergeKeys = getMergeSelectionKeys();
    const activePrimary = mergeKeys.includes(state.customerMergePrimaryKey)
      ? state.customerMergePrimaryKey
      : mergeKeys[0] || state.selectedCustomerIdentity;
    state.customerMergePrimaryKey = activePrimary;

    customerMergePreview.innerHTML = "";
    mergeKeys.forEach((key) => {
      const detail = getCustomerDetail(key);
      const article = document.createElement("article");
      article.className = "mailbox-admin-entry";
      article.innerHTML = `<div><strong>${detail.name}</strong><span>${detail.emails.join(" · ")}</span></div><span>${detail.phone}</span>`;
      customerMergePreview.append(article);
    });

    customerMergePrimaryOptions.innerHTML = "";
    mergeKeys.forEach((key) => {
      const detail = getCustomerDetail(key);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.customerMergePrimary = key;
      button.classList.toggle("is-active", key === activePrimary);
      button.innerHTML = `<strong>${detail.name}</strong><p>${detail.emails[0] || "Saknar e-post"} blir primär profil.</p>`;
      customerMergePrimaryOptions.append(button);
    });

    customerMergeOptionInputs.forEach((input) => {
      input.checked = Boolean(state.customerMergeOptions[normalizeKey(input.dataset.customerMergeOption)]);
    });
  }

  function setCustomerMergeOpen(open) {
    state.customerMergeModalOpen = Boolean(open);
    renderCustomerMergeModal();
    setFloatingShellOpen(customerMergeShell, state.customerMergeModalOpen, 16);
    if (!open) {
      setFeedback(customerMergeFeedback, "", "");
    }
  }

  function setCustomerSettingsOpen(open) {
    state.customerSettingsOpen = Boolean(open);
    customerSettingToggleInputs.forEach((input) => {
      input.checked = Boolean(state.customerSettings[normalizeKey(input.dataset.customerSettingToggle)]);
    });
    setFloatingShellOpen(customerSettingsShell, state.customerSettingsOpen, 16);
    if (!open) {
      setFeedback(customerSettingsFeedback, "", "");
    }
  }

  function renderCustomerSplitModal() {
    if (!customerSplitOptions) return;
    const sourceKey = normalizeKey(
      state.customerRuntime.splitSourceKey || state.selectedCustomerIdentity
    );
    const detail = getCustomerDetail(sourceKey);
    const primaryEmail =
      state.customerPrimaryEmailByKey[sourceKey] || detail.emails[0] || "";
    const splitOptions = detail.emails.filter(
      (email) => normalizeMailboxId(email) !== normalizeMailboxId(primaryEmail)
    );

    if (customerSplitTitle) {
      customerSplitTitle.textContent = `Välj alias att dela ut från ${detail.name}`;
    }

    if (!splitOptions.length) {
      customerSplitOptions.innerHTML =
        '<article class="customers-merge-card customers-merge-card-muted"><div class="customers-merge-empty"><strong>Ingen sekundär e-post hittades</strong><p>Den här profilen har inget alias att dela ut just nu.</p></div></article>';
      return;
    }

    customerSplitOptions.innerHTML = splitOptions
      .map(
        (email) => `
          <label class="customers-setting-toggle-row">
            <input type="radio" name="customer-split-email" data-customer-split-option="${escapeAttribute(email)}"${normalizeMailboxId(state.customerRuntime.splitEmail) === normalizeMailboxId(email) ? " checked" : ""} />
            <span>${escapeHtml(email)}</span>
          </label>
        `
      )
      .join("");
  }

  function setCustomerSplitOpen(open, sourceKey = state.selectedCustomerIdentity) {
    state.customerRuntime.splitModalOpen = Boolean(open);
    if (open) {
      const detail = getCustomerDetail(sourceKey);
      const primaryEmail =
        state.customerPrimaryEmailByKey[normalizeKey(sourceKey)] || detail.emails[0] || "";
      const splitOptions = detail.emails.filter(
        (email) => normalizeMailboxId(email) !== normalizeMailboxId(primaryEmail)
      );
      state.customerRuntime.splitSourceKey = normalizeKey(sourceKey);
      state.customerRuntime.splitEmail = splitOptions[0] || "";
    }
    renderCustomerSplitModal();
    setFloatingShellOpen(customerSplitShell, state.customerRuntime.splitModalOpen, 16);
    if (!open) {
      setFeedback(customerSplitFeedback, "", "");
    }
  }

  function inferCustomerImportFileName(sourceText) {
    const trimmed = String(sourceText || "").trim();
    if (!trimmed) return "";
    return trimmed.startsWith("{") || trimmed.startsWith("[")
      ? "customer-import.json"
      : "customer-import.csv";
  }

  function getCustomerImportBody() {
    const sourceText = String(
      customerImportTextInput?.value ?? state.customerImport.sourceText ?? ""
    );
    const fileName =
      normalizeText(state.customerImport.fileName) || inferCustomerImportFileName(sourceText);
    const previewRows = asArray(state.customerImport.preview?.rows);
    const sourceSystem = "cliento";
    if (previewRows.length) {
      return {
        rows: buildCustomerImportRowsPayload(previewRows),
        fileName,
        defaultMailboxId: getOperationalImportMailboxId(),
        sourceSystem,
      };
    }
    if (state.customerImport.sourceBinaryBase64) {
      return {
        binaryBase64: state.customerImport.sourceBinaryBase64,
        fileName,
        defaultMailboxId: getOperationalImportMailboxId(),
        sourceSystem,
      };
    }
    return {
      text: sourceText,
      fileName,
      defaultMailboxId: getOperationalImportMailboxId(),
      sourceSystem,
    };
  }

  function resetCustomerImportState() {
    state.customerImport.preview = null;
    state.customerImport.fileName = "";
    state.customerImport.sourceText = "";
    state.customerImport.sourceBinaryBase64 = "";
    state.customerImport.sourceFormat = "";
    state.customerImport.rowEditsDirty = false;
    state.customerImport.loadingPreview = false;
    state.customerImport.committing = false;
    if (customerImportFileInput) {
      customerImportFileInput.value = "";
    }
  }

  function renderCustomerImportModal() {
    if (customerImportTextInput && customerImportTextInput.value !== state.customerImport.sourceText) {
      customerImportTextInput.value = state.customerImport.sourceText;
    }

    if (customerImportFileName) {
      customerImportFileName.textContent =
        normalizeText(state.customerImport.fileName) || "Ingen fil vald ännu.";
    }

    const sourceBody = getCustomerImportBody();
    const preview = state.customerImport.preview;
    const previewRows = asArray(preview?.rows);
    const hasImportSource = hasCustomerImportSource(sourceBody);

    if (customerImportSummary) {
      if (!preview) {
        customerImportSummary.innerHTML =
          '<article class="customers-merge-card customers-merge-card-muted"><div class="customers-merge-empty"><strong>Ingen preview ännu</strong><p>Ladda upp en fil eller klistra in JSON, CSV eller XLS/XLSX och kör sedan Förhandsgranska.</p></div></article>';
      } else {
        customerImportSummary.innerHTML = `
          <div class="customer-import-summary-grid">
            <article class="customer-import-summary-card">
              <span>Totalt</span>
              <strong>${escapeHtml(String(preview.totalRows || 0))}</strong>
              <small>${escapeHtml(humanizeCode(preview.format, "Import"))}</small>
            </article>
            <article class="customer-import-summary-card">
              <span>Giltiga</span>
              <strong>${escapeHtml(String(preview.validRows || 0))}</strong>
              <small>${escapeHtml(preview.fileName || "Utan filnamn")}</small>
            </article>
            <article class="customer-import-summary-card">
              <span>Skapa</span>
              <strong>${escapeHtml(String(preview.created || 0))}</strong>
              <small>Nya profiler</small>
            </article>
            <article class="customer-import-summary-card">
              <span>Uppdatera</span>
              <strong>${escapeHtml(String(preview.updated || 0))}</strong>
              <small>Befintliga kunder</small>
            </article>
            <article class="customer-import-summary-card">
              <span>Merge / Fel</span>
              <strong>${escapeHtml(`${preview.merged || 0} / ${preview.invalid || 0}`)}</strong>
              <small>Sammanfogning och stoppade rader</small>
            </article>
          </div>
          ${
            state.customerImport.rowEditsDirty
              ? '<p class="customer-import-edit-note">Previewn har ändrade rader. Kör Förhandsgranska igen innan du importerar.</p>'
              : ""
          }
        `;
      }
    }

    if (customerImportPreviewList) {
      if (!preview) {
        customerImportPreviewList.innerHTML = "";
      } else if (!previewRows.length) {
        customerImportPreviewList.innerHTML =
          '<article class="customers-merge-card customers-merge-card-muted"><div class="customers-merge-empty"><strong>Importen innehöll inga rader</strong><p>Kontrollera rubriker och format innan du försöker igen.</p></div></article>';
      } else {
        customerImportPreviewList.innerHTML = previewRows
          .map((row) => {
            const action = normalizeKey(row?.action || "invalid");
            const editable = getCustomerImportEditableRow(row);
            const emails = asArray(editable?.emails).slice(0, 3).join(" · ");
            const mailboxes = asArray(editable?.mailboxes).slice(0, 3).join(" · ");
            const matchedCount = asArray(row?.matchedKeys).length;
            return `
              <article class="customer-import-preview-row is-${escapeAttribute(action)}">
                <div class="customer-import-preview-top">
                  <div class="customer-import-preview-copy">
                    <strong>Rad ${escapeHtml(String(row?.rowNumber || 0))} · ${escapeHtml(editable?.name || row?.targetKey || "Kundrad")}</strong>
                    <p>${escapeHtml(row?.message || "Ingen beskrivning tillgänglig.")}</p>
                    <small>${escapeHtml(emails || "Ingen e-post på raden")}</small>
                  </div>
                  <span class="customer-import-chip is-${escapeAttribute(action)}">${escapeHtml(
                    action === "create"
                      ? "Skapa"
                      : action === "update"
                        ? "Uppdatera"
                        : action === "merge"
                          ? "Slå ihop"
                          : "Ogiltig"
                  )}</span>
                </div>
                <div class="customer-import-chip-row">
                  ${
                    row?.targetKey
                      ? `<span class="customer-import-chip">Mål: ${escapeHtml(row.targetKey)}</span>`
                      : ""
                  }
                  ${
                    matchedCount
                      ? `<span class="customer-import-chip">Matchar ${escapeHtml(String(matchedCount))} profiler</span>`
                      : ""
                  }
                  ${
                    mailboxes
                      ? `<span class="customer-import-chip">${escapeHtml(mailboxes)}</span>`
                      : ""
                  }
                </div>
                <div class="customer-import-edit-grid">
                  <label class="customer-import-edit-field">
                    <span>Namn</span>
                    <input type="text" value="${escapeAttribute(editable?.name || "")}" data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="name" />
                  </label>
                  <label class="customer-import-edit-field">
                    <span>E-post</span>
                    <input type="text" value="${escapeAttribute(asArray(editable?.emails).join(", "))}" data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="emails" />
                  </label>
                  <label class="customer-import-edit-field">
                    <span>Mailboxar</span>
                    <input type="text" value="${escapeAttribute(asArray(editable?.mailboxes).join(", "))}" data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="mailboxes" />
                  </label>
                  <label class="customer-import-edit-field">
                    <span>Telefon</span>
                    <input type="text" value="${escapeAttribute(editable?.phone || "")}" data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="phone" />
                  </label>
                  <label class="customer-import-edit-field customer-import-edit-field-small">
                    <span>Meddelanden</span>
                    <input type="number" min="0" value="${escapeAttribute(String(asNumber(editable?.totalMessages, 0)))}" data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="totalMessages" />
                  </label>
                  <label class="customer-import-edit-checkbox">
                    <input type="checkbox" ${editable?.vip ? "checked" : ""} data-customer-import-row="${escapeAttribute(String(row?.rowNumber || 0))}" data-customer-import-row-field="vip" />
                    <span>VIP</span>
                  </label>
                </div>
              </article>
            `;
          })
          .join("");
      }
    }

    setButtonBusy(
      customerImportPreviewButton,
      state.customerImport.loadingPreview,
      "Förhandsgranska",
      "Läser..."
    );
    setButtonBusy(
      customerImportCommitButton,
      state.customerImport.committing,
      "Importera",
      "Importerar..."
    );

    if (customerImportPreviewButton) {
      customerImportPreviewButton.disabled =
        state.customerImport.loadingPreview ||
        state.customerImport.committing ||
        !hasImportSource;
    }
    if (customerImportCommitButton) {
      customerImportCommitButton.disabled =
        state.customerImport.loadingPreview ||
        state.customerImport.committing ||
        state.customerImport.rowEditsDirty ||
        !preview ||
        Number(preview.validRows || 0) <= 0;
    }
  }

  function setCustomerImportOpen(open, options = {}) {
    state.customerImport.open = Boolean(open);
    if (!open && options.reset) {
      resetCustomerImportState();
    }
    renderCustomerImportModal();
    setFloatingShellOpen(customerImportShell, state.customerImport.open, 16);
    if (!open) {
      setFeedback(customerImportFeedback, "", "");
    }
  }

  async function readCustomerImportFile(file) {
    if (!file) return;
    const normalizedFileName = normalizeText(file.name);
    const isSpreadsheet = /\.(xlsx|xls)$/i.test(normalizedFileName);
    state.customerImport.fileName = normalizedFileName;
    state.customerImport.rowEditsDirty = false;
    state.customerImport.preview = null;
    if (isSpreadsheet) {
      const arrayBuffer = await file.arrayBuffer();
      state.customerImport.sourceBinaryBase64 = encodeArrayBufferToBase64(arrayBuffer);
      state.customerImport.sourceText = "";
      state.customerImport.sourceFormat = "xlsx";
    } else {
      const text = await file.text();
      state.customerImport.sourceText = text;
      state.customerImport.sourceBinaryBase64 = "";
      state.customerImport.sourceFormat = /\.json$/i.test(normalizedFileName) ? "json" : "csv";
    }
    renderCustomerImportModal();
    setFeedback(
      customerImportFeedback,
      "success",
      `Läste ${state.customerImport.fileName || "importfilen"}. Kör Förhandsgranska för att validera raderna.`
    );
  }

  function updateCustomerImportPreviewRowField(rowNumber, field, value) {
    const targetRowNumber = Math.max(1, Number(rowNumber) || 0);
    const rows = asArray(state.customerImport.preview?.rows);
    const targetRow = rows.find((row) => Number(row?.rowNumber || 0) === targetRowNumber);
    if (!targetRow) return;

    const editable = getCustomerImportEditableRow(targetRow);
    targetRow.input = {
      rowNumber: targetRowNumber,
      name: normalizeText(editable.name),
      emails: asArray(editable.emails).slice(),
      phone: normalizeText(editable.phone),
      mailboxes: asArray(editable.mailboxes).slice(),
      vip: Boolean(editable.vip),
      customerValue: Math.max(0, Math.round(asNumber(editable.customerValue, 0))),
      totalConversations: Math.max(0, Math.round(asNumber(editable.totalConversations, 0))),
      totalMessages: Math.max(0, Math.round(asNumber(editable.totalMessages, 0))),
    };

    if (field === "name") {
      targetRow.input.name = normalizeText(value);
    } else if (field === "emails") {
      targetRow.input.emails = splitCustomerImportMultiValue(value).map((entry) =>
        normalizeText(entry).toLowerCase()
      );
    } else if (field === "mailboxes") {
      targetRow.input.mailboxes = splitCustomerImportMultiValue(value);
    } else if (field === "phone") {
      targetRow.input.phone = normalizeText(value);
    } else if (field === "vip") {
      targetRow.input.vip = Boolean(value);
    } else if (field === "totalMessages") {
      targetRow.input.totalMessages = Math.max(0, Math.round(asNumber(value, 0)));
    }

    state.customerImport.rowEditsDirty = true;
    setFeedback(
      customerImportFeedback,
      "loading",
      "Raden ändrades. Kör Förhandsgranska igen innan du importerar."
    );
    renderCustomerImportModal();
  }

  async function requestCustomerImportPreview() {
    const body = getCustomerImportBody();
    if (!hasCustomerImportSource(body)) {
      setFeedback(
        customerImportFeedback,
        "error",
        "Klistra in JSON/CSV eller välj en fil i JSON, CSV, XLS eller XLSX först."
      );
      renderCustomerImportModal();
      return;
    }

    state.customerImport.loadingPreview = true;
    renderCustomerImportModal();
    setFeedback(customerImportFeedback, "loading", "Förhandsgranskar kundimporten…");
    try {
      const payload = await apiRequest("/api/v1/cco/customers/import/preview", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-customers-import-preview"),
        },
        body,
      });
      state.customerImport.preview = payload?.importSummary || null;
      state.customerImport.rowEditsDirty = false;
      state.customerRuntime.authRequired = false;
      state.customerRuntime.error = "";
      const validRows = Number(state.customerImport.preview?.validRows || 0);
      setFeedback(
        customerImportFeedback,
        "success",
        validRows
          ? `Preview klar. ${validRows} giltiga rader kan importeras.`
          : "Preview klar, men inga giltiga rader kan importeras ännu."
      );
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        setFeedback(customerImportFeedback, "error", "Inloggning krävs för att förhandsgranska importen.");
        window.location.assign(buildReauthUrl());
      } else {
        setFeedback(
          customerImportFeedback,
          "error",
          error?.message || "Kunde inte förhandsgranska kundimporten."
        );
      }
    } finally {
      state.customerImport.loadingPreview = false;
      renderCustomerImportModal();
    }
  }

  async function commitCustomerImport() {
    const preview = state.customerImport.preview;
    if (!preview || Number(preview.validRows || 0) <= 0) {
      setFeedback(customerImportFeedback, "error", "Kör Förhandsgranska och säkerställ minst en giltig rad först.");
      renderCustomerImportModal();
      return;
    }
    if (state.customerImport.rowEditsDirty) {
      setFeedback(customerImportFeedback, "error", "Kör Förhandsgranska igen efter radändringar innan du importerar.");
      renderCustomerImportModal();
      return;
    }

    state.customerImport.committing = true;
    renderCustomerImportModal();
    setFeedback(customerImportFeedback, "loading", "Importerar kunderna…");
    try {
      const payload = await apiRequest("/api/v1/cco/customers/import/commit", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-customers-import-commit"),
        },
        body: getCustomerImportBody(),
      });
      applyCustomerPersistedState(payload?.customerState || {});
      ensureCustomerRuntimeProfilesFromLive();
      state.customerRuntime.loaded = true;
      state.customerRuntime.authRequired = false;
      state.customerRuntime.error = "";
      state.customerImport.rowEditsDirty = false;
      applyCustomerFilters();

      const firstAffectedKey = asArray(payload?.importSummary?.rows).find(
        (row) => normalizeKey(row?.action) !== "invalid" && normalizeKey(row?.targetKey)
      )?.targetKey;
      if (firstAffectedKey) {
        setSelectedCustomerIdentity(firstAffectedKey);
      }

      const importSummary = payload?.importSummary || preview;
      setCustomersStatus(
        `Import klar: ${Number(importSummary.created || 0)} skapade, ${Number(importSummary.updated || 0)} uppdaterade och ${Number(importSummary.merged || 0)} sammanslagna profiler.`,
        "success"
      );
      setCustomerImportOpen(false, { reset: true });
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        setFeedback(customerImportFeedback, "error", "Inloggning krävs för att importera kunderna.");
        window.location.assign(buildReauthUrl());
      } else {
        setFeedback(
          customerImportFeedback,
          "error",
          error?.message || "Kunde inte importera kundfilen."
        );
      }
    } finally {
      state.customerImport.committing = false;
      renderCustomerImportModal();
    }
  }

  function renderMailboxOptions() {
    if (!mailboxOptionsContainer || !mailboxAdminOpenButton) return;
    mailboxOptionsContainer
      .querySelectorAll(".mailbox-option-custom")
      .forEach((node) => node.remove());

    state.customMailboxes.forEach((mailbox) => {
      const mailboxTokens = new Set(
        getMailboxIdentityTokens(mailbox).map((token) => normalizeMailboxId(token)).filter(Boolean)
      );
      const mirrorsLegacyMailbox = LEGACY_RUNTIME_MAILBOXES.some((legacyMailbox) =>
        getMailboxIdentityTokens(legacyMailbox).some((token) =>
          mailboxTokens.has(normalizeMailboxId(token))
        )
      );
      if (mirrorsLegacyMailbox) return;
      const toneClass = deriveMailboxToneClass({
        id: mailbox.id,
        email: mailbox.email,
        label: mailbox.name || mailbox.label,
        toneClass: mailbox.toneClass,
      });
      const mailboxName = escapeHtml(mailbox.name || mailbox.label || "Mailbox");
      const mailboxEmail = escapeHtml(asText(mailbox.email).toLowerCase());
      const signatureLabel = normalizeText(mailbox.signature?.label);
      const metaCopy = escapeHtml(
        signatureLabel ? `Signatur: ${signatureLabel}` : `Ägare: ${mailbox.owner || "Team"}`
      );
      const label = document.createElement("label");
      label.className = "mailbox-option mailbox-option-custom";
      if (toneClass) {
        label.classList.add(toneClass);
      }
      label.innerHTML =
        '<input class="mailbox-option-input" type="checkbox" />' +
        '<span class="mailbox-option-box" aria-hidden="true"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4 6.6 11.2l5.8-6.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" /></svg></span>' +
        `<span class="mailbox-option-copy">
          <span class="mailbox-option-primary">
            <span class="mailbox-option-name">${mailboxName}</span>
            <span class="mailbox-option-status">Custom</span>
          </span>
          <span class="mailbox-option-secondary">
            <span class="mailbox-option-email">${mailboxEmail}</span>
            <span class="mailbox-option-meta">${metaCopy}</span>
          </span>
        </span>`;
      mailboxOptionsContainer.insertBefore(label, mailboxAdminOpenButton);
    });
  }

  function getMailFeedRuntimeState(feedKey) {
    const normalizedFeed = normalizeKey(feedKey);
    if (!state.mailFeedsRuntime[normalizedFeed]) {
      state.mailFeedsRuntime[normalizedFeed] = {
        filter: "all",
        view: "card",
        density: "balanced",
        selectedKeys: [],
      };
    }
    return state.mailFeedsRuntime[normalizedFeed];
  }

  function setMailFeedFilter(feedKey, filterKey) {
    getMailFeedRuntimeState(feedKey).filter = normalizeKey(filterKey) || "all";
    renderMailFeeds();
  }

  function setMailFeedView(feedKey, viewKey) {
    getMailFeedRuntimeState(feedKey).view = normalizeKey(viewKey) === "list" ? "list" : "card";
    renderMailFeeds();
  }

  function setMailFeedDensity(feedKey, densityKey) {
    getMailFeedRuntimeState(feedKey).density =
      normalizeKey(densityKey) === "compact" ? "compact" : "balanced";
    renderMailFeeds();
  }

  function getMailFeedSelectedKeys(feedKey) {
    const runtime = getMailFeedRuntimeState(feedKey);
    const availableKeys = new Set(
      getMailFeedItems(feedKey).map((item) => normalizeKey(item.key)).filter(Boolean)
    );
    runtime.selectedKeys = asArray(runtime.selectedKeys).filter((key) =>
      availableKeys.has(normalizeKey(key))
    );
    return runtime.selectedKeys;
  }

  function toggleMailFeedSelection(feedKey, itemKey) {
    const runtime = getMailFeedRuntimeState(feedKey);
    const normalizedKey = normalizeKey(itemKey);
    const nextSelection = new Set(getMailFeedSelectedKeys(feedKey));
    if (nextSelection.has(normalizedKey)) {
      nextSelection.delete(normalizedKey);
    } else {
      nextSelection.add(normalizedKey);
    }
    runtime.selectedKeys = Array.from(nextSelection);
    renderMailFeeds();
  }

  function toggleSelectAllMailFeed(feedKey) {
    const runtime = getMailFeedRuntimeState(feedKey);
    const visibleItems = getFilteredMailFeedItems(feedKey);
    const visibleKeys = visibleItems.map((item) => normalizeKey(item.key)).filter(Boolean);
    if (!visibleKeys.length) return;
    const selected = new Set(getMailFeedSelectedKeys(feedKey));
    const allSelected = visibleKeys.every((key) => selected.has(key));
    if (allSelected) {
      visibleKeys.forEach((key) => selected.delete(key));
    } else {
      visibleKeys.forEach((key) => selected.add(key));
    }
    runtime.selectedKeys = Array.from(selected);
    renderMailFeeds();
  }

  function clearMailFeedSelection(feedKey) {
    getMailFeedRuntimeState(feedKey).selectedKeys = [];
    renderMailFeeds();
  }

  function getSelectedMailFeedItems(feedKey) {
    const selectedKeys = new Set(getMailFeedSelectedKeys(feedKey).map(normalizeKey));
    return getMailFeedItems(feedKey).filter((item) => selectedKeys.has(normalizeKey(item.key)));
  }

  function isMailFeedAttentionItem(item) {
    return (
      item.requiresAttention === true ||
      normalizeKey(item.riskLabel) === "hög risk" ||
      normalizeKey(item.riskLabel) === "miss" ||
      normalizeKey(item.riskLabel) === "bevaka" ||
      normalizeKey(item.statusLabel).includes("åtgärd") ||
      normalizeKey(item.waitingLabel).includes("åtgärd")
    );
  }

  function getFilteredMailFeedItems(feedKey) {
    const runtime = getMailFeedRuntimeState(feedKey);
    const filterKey = normalizeKey(runtime.filter || "all");
    const items = getMailFeedItems(feedKey);
    if (filterKey === "vip") {
      return items.filter((item) => item.isVIP);
    }
    if (filterKey === "attention") {
      return items.filter(isMailFeedAttentionItem);
    }
    return items;
  }

  async function deleteMailFeedThreads(feedKey, threads) {
    const runtimeThreads = asArray(threads).filter((thread) => thread?.id);
    if (!runtimeThreads.length) return false;
    if (!state.runtime.deleteEnabled) {
      setAuxStatus(
        normalizeKey(feedKey) === "later" ? laterStatus : sentStatus,
        "Delete är inte aktiverat i live runtime.",
        "error"
      );
      return false;
    }

    const settled = await Promise.allSettled(
      runtimeThreads.map((thread) =>
        apiRequest("/api/v1/cco/delete", {
          method: "POST",
          headers: {
            "x-idempotency-key": createIdempotencyKey(
              `major-arcana-mail-feed-delete-${thread.id}`
            ),
          },
          body: {
            channel: "admin",
            mailboxId: asText(thread.mailboxAddress),
            messageId: asText(thread.raw?.messageId),
            conversationId: thread.id,
            softDelete: true,
          },
        })
      )
    );

    const successfulIds = runtimeThreads
      .filter((_, index) => settled[index]?.status === "fulfilled")
      .map((thread) => thread.id);
    if (successfulIds.length) {
      state.runtime.threads = state.runtime.threads.filter(
        (thread) => !successfulIds.includes(thread.id)
      );
    }

    const failures = settled.filter((result) => result.status === "rejected");
    if (successfulIds.length) {
      getMailFeedRuntimeState(feedKey).selectedKeys = [];
      ensureRuntimeSelection();
      renderRuntimeConversationShell();
    }

    if (failures.length && !successfulIds.length) {
      const error = failures[0].reason;
      throw error instanceof Error ? error : new Error("Kunde inte radera trådarna.");
    }

    return true;
  }

  async function handleMailFeedBulkCommand(feedKey, commandKey) {
    const normalizedFeed = normalizeKey(feedKey);
    const normalizedCommand = normalizeKey(commandKey);
    const selectedThreads = getSelectedMailFeedItems(normalizedFeed)
      .map((item) =>
        getMailFeedRuntimeThreads(normalizedFeed).find(
          (thread) => normalizeKey(thread.id) === normalizeKey(item.key)
        )
      )
      .filter(Boolean);

    if (!selectedThreads.length) {
      setAuxStatus(
        normalizedFeed === "later" ? laterStatus : sentStatus,
        "Markera minst en tråd först.",
        "error"
      );
      return;
    }

    if (normalizedCommand === "resume") {
      selectedThreads.forEach((thread) => {
        updateRuntimeThread(thread.id, (current) => {
          current.tags = Array.from(
            new Set(current.tags.filter((tag) => tag !== "later").concat(["act-now"]))
          );
          current.waitingLabel = "Behöver åtgärd";
          current.statusLabel = "Öppen";
          current.nextActionLabel = "Svara nu";
          current.nextActionSummary =
            "Tråden återupptogs från Senare och väntar nu på nästa tydliga svar.";
          current.raw = {
            ...current.raw,
            waitingOn: "owner",
            lastActionTakenLabel: "Återupptagen",
            followUpDueAt: "",
            followUpSuggestedAt: "",
          };
          current.cards = buildRuntimeSummaryCards(current.raw, current);
          return current;
        });
      });
      getMailFeedRuntimeState(normalizedFeed).selectedKeys = [];
      selectRuntimeThread(selectedThreads[0].id);
      setAppView("conversations");
      applyFocusSection("conversation");
      setAuxStatus(
        laterStatus,
        `${selectedThreads.length} trådar återupptogs från Senare.`,
        "success"
      );
      return;
    }

    if (normalizedCommand === "snooze") {
      openLaterDialog({ bulkThreadIds: selectedThreads.map((thread) => thread.id) });
      setAuxStatus(
        laterStatus,
        `${selectedThreads.length} trådar redo för nytt senareläggningsval.`,
        "loading"
      );
      return;
    }

    if (normalizedCommand === "history") {
      selectRuntimeThread(selectedThreads[0].id);
      setAppView("conversations");
      applyFocusSection("history");
      setAuxStatus(
        sentStatus,
        `Historiken öppnades för ${selectedThreads.length} markerade skickade trådar.`,
        "success"
      );
      return;
    }

    if (normalizedCommand === "handled") {
      await Promise.all(
        selectedThreads.map((thread) =>
          requestConversationAction("/api/v1/cco/handled", thread, {
            idempotencyScope: "major-arcana-handled",
            errorMessage: "Kunde inte markera skickade trådar som klara.",
            body: {
              actionLabel: "Markera klar",
            },
          })
        )
      );
      getMailFeedRuntimeState(normalizedFeed).selectedKeys = [];
      await refreshWorkspaceBootstrapForSelectedThread("mark handled bulk");
      setAuxStatus(
        sentStatus,
        `${selectedThreads.length} skickade trådar markerades som klara.`,
        "success"
      );
      return;
    }

    if (normalizedCommand === "delete") {
      stageMailFeedDelete(normalizedFeed, selectedThreads);
    }
  }

  function renderIntegrationsRuntimeStatus() {
    if (!integrationsStatus) return;
    const runtime = state.integrationsRuntime;
    if (runtime.loading) {
      setAuxStatus(integrationsStatus, "Läser integrationsstatus…", "loading");
      return;
    }
    if (runtime.authRequired) {
      setAuxStatus(
        integrationsStatus,
        "Inloggning krävs för att läsa och ändra integrationer.",
        "error"
      );
      return;
    }
    if (runtime.error) {
      setAuxStatus(integrationsStatus, runtime.error, "error");
      return;
    }
    if (runtime.partial) {
      setAuxStatus(
        integrationsStatus,
        "Vissa integrationskällor kunde inte uppdateras. Visar senaste kompletta livebild.",
        "success"
      );
      return;
    }
    setAuxStatus(integrationsStatus, "", "");
  }

  function renderIntegrations() {
    if (!integrationsGrid) return;
    const activeCategory = state.selectedIntegrationCategory;
    const visibleItems = INTEGRATION_CATALOG.filter(
      (item) => activeCategory === "all" || item.category === activeCategory
    );
    const connectedKeys = getIntegrationConnectedKeys();
    state.integrationsConnectedKeys = connectedKeys;
    integrationsGrid.innerHTML = "";

    visibleItems.forEach((item) => {
      const record = getIntegrationRuntimeRecord(item.key) || getFallbackIntegrationRecord(item);
      const connected = record.isConnected === true;
      const pending = normalizeKey(state.integrationsRuntime.pendingKey) === item.key;
      const tone = normalizeKey(record.statusTone);
      const toneClass =
        tone === "attention" ? " is-attention" : tone === "idle" && !connected ? " is-idle" : "";
      const updatedLabel = normalizeText(record.updatedAt)
        ? `Uppdaterad ${formatConversationTime(record.updatedAt)}`
        : connected
          ? "Live"
          : "Redo";
      const statusSummary = compactRuntimeCopy(record.statusSummary, item.copy, 130);
      const watchLabel = compactRuntimeCopy(
        record.watchLabel,
        connected ? "Verifiera guardrails och ägarskap efter anslutning." : "Koppla in utan att lämna CCO.",
        110
      );
      const toggleLabel = pending
        ? connected
          ? "Kopplar från…"
          : "Kopplar…"
        : connected
          ? "Koppla från"
          : "Koppla";
      const stateLabel = pending
        ? "Uppdaterar"
        : connected
          ? "Ansluten"
          : "Inte ansluten";

      const card = document.createElement("article");
      card.className = `integration-card${connected ? " is-connected" : ""}${toneClass}`;
      card.innerHTML =
        `<span class="integration-card-label">${escapeHtml(
          getIntegrationCategoryLabel(item.category)
        )}</span>` +
        `<div class="integration-card-head"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(
          stateLabel
        )}</span></div>` +
        `<p>${escapeHtml(statusSummary)}</p>` +
        `<div class="integration-card-features"><span>${escapeHtml(item.owner)}</span><span>${escapeHtml(
          getIntegrationStatusToneLabel(record.statusTone, connected)
        )}</span><span>${escapeHtml(updatedLabel)}</span></div>` +
        `<div class="integration-card-foot"><span>${escapeHtml(
          watchLabel
        )}</span><button class="integration-connect-button${connected ? " is-connected" : ""}" type="button" data-integration-toggle="${escapeHtml(
          item.key
        )}"${pending ? " disabled" : ""}>${escapeHtml(toggleLabel)}</button></div>`;
      integrationsGrid.append(card);
    });

    integrationCategoryButtons.forEach((button) => {
      const isActive = normalizeKey(button.dataset.integrationCategory) === activeCategory;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    integrationMetricNodes.forEach((node) => {
      const key = normalizeKey(node.dataset.integrationMetric);
      if (key === "connected") {
        node.textContent = String(connectedKeys.length);
      } else if (key === "available") {
        node.textContent = String(INTEGRATION_CATALOG.length - connectedKeys.length);
      } else if (key === "category") {
        node.textContent = getIntegrationCategoryLabel(activeCategory);
      }
    });

    renderIntegrationsRuntimeStatus();
  }

  function parseIntegrationActorProfile(payload) {
    const user = payload?.user && typeof payload.user === "object" ? payload.user : {};
    const fullName = asText(
      user.fullName ||
        user.displayName ||
        [user.firstName, user.lastName].map((value) => asText(value)).filter(Boolean).join(" ")
    );
    const email = asText(user.email || user.username || user.login).toLowerCase();
    if (!fullName || !email) return getFallbackIntegrationActorProfile();
    return {
      name: fullName,
      email,
    };
  }

  async function ensureIntegrationActorProfile() {
    if (state.integrationsRuntime.actorProfile?.name && state.integrationsRuntime.actorProfile?.email) {
      return state.integrationsRuntime.actorProfile;
    }
    try {
      const payload = await apiRequest("/api/v1/auth/me");
      const profile = parseIntegrationActorProfile(payload);
      state.integrationsRuntime.actorProfile = profile;
      return profile;
    } catch {
      const fallback = getFallbackIntegrationActorProfile();
      state.integrationsRuntime.actorProfile = fallback;
      return fallback;
    }
  }

  async function loadIntegrationsRuntime({ force = false } = {}) {
    const runtime = state.integrationsRuntime;
    if (runtime.loading && !force) return runtime.records;
    if (runtime.loaded && !force && !runtime.error && !runtime.authRequired) {
      renderIntegrations();
      return runtime.records;
    }

    runtime.loading = true;
    runtime.authRequired = false;
    runtime.error = "";
    runtime.partial = false;
    const requestId = Number(runtime.requestId || 0) + 1;
    runtime.requestId = requestId;
    renderIntegrations();

    try {
      const [statusResult, meResult] = await Promise.allSettled([
        apiRequest("/api/v1/cco/integrations/status"),
        apiRequest("/api/v1/auth/me"),
      ]);

      if (runtime.requestId !== requestId) {
        return runtime.records;
      }

      if (statusResult.status !== "fulfilled") {
        throw statusResult.reason;
      }

      runtime.records = asArray(statusResult.value?.integrations).map((record) => ({
        id: normalizeKey(record?.id),
        category: normalizeKey(record?.category) || "automation",
        isConnected: record?.isConnected !== false,
        statusTone: normalizeKey(record?.statusTone) || "idle",
        statusSummary: asText(record?.statusSummary),
        watchLabel: asText(record?.watchLabel),
        updatedAt: asText(record?.updatedAt || record?.configuredAt),
        configurable: record?.configurable !== false,
        docsAvailable: record?.docsAvailable !== false,
      }));
      runtime.loaded = true;
      runtime.lastLoadedAt = asText(statusResult.value?.generatedAt) || new Date().toISOString();
      state.integrationsConnectedKeys = runtime.records
        .filter((record) => record.isConnected)
        .map((record) => record.id);

      if (meResult.status === "fulfilled") {
        runtime.actorProfile = parseIntegrationActorProfile(meResult.value);
      } else if (!runtime.actorProfile) {
        runtime.actorProfile = getFallbackIntegrationActorProfile();
      }
    } catch (error) {
      if (runtime.requestId !== requestId) {
        return runtime.records;
      }
      if (isAuthFailure(error?.statusCode, error?.message)) {
        runtime.authRequired = true;
        runtime.error = "";
      } else {
        runtime.error =
          runtime.loaded && asArray(runtime.records).length
            ? "Kunde inte uppdatera integrationsstatus. Visar senaste livebild."
            : error?.message || "Kunde inte läsa integrationsstatus.";
      }
      runtime.partial = runtime.loaded && !runtime.authRequired;
    } finally {
      if (runtime.requestId === requestId) {
        runtime.loading = false;
        renderIntegrations();
      }
    }

    return runtime.records;
  }

  function renderMacrosRuntimeStatus() {
    if (!macrosStatus) return;
    if (state.macrosRuntime.loading) {
      setAuxStatus(macrosStatus, "Läser makrobibliotek…", "loading");
      return;
    }
    if (state.macrosRuntime.authRequired) {
      setAuxStatus(macrosStatus, "Inloggning krävs för makrobiblioteket.", "error");
      return;
    }
    if (state.macrosRuntime.error) {
      setAuxStatus(macrosStatus, state.macrosRuntime.error, "error");
      return;
    }
    setAuxStatus(macrosStatus, "", "");
  }

  function renderMacros() {
    if (!macrosList) return;
    macrosList.innerHTML = "";
    const macroCards = state.macros.length ? state.macros : getFallbackMacroCards();
    macroCards.forEach((macro) => {
      const isPending =
        normalizeKey(state.macrosRuntime.pendingMacroId) === normalizeKey(macro.id || macro.key);
      const pendingAction = normalizeKey(state.macrosRuntime.pendingAction);
      const runLabel = isPending && pendingAction === "run" ? "Kör…" : "Kör";
      const editLabel = isPending && pendingAction === "edit" ? "Sparar…" : "Redigera";
      const deleteLabel = isPending && pendingAction === "delete" ? "Tar bort…" : "Radera";
      const actionSummary = compactRuntimeCopy(
        macro.runCount
          ? `${macro.actionLabel}. Körd ${macro.runCount} gånger${macro.lastRunAt ? `, senast ${formatConversationTime(macro.lastRunAt)}` : ""}.`
          : `${macro.actionLabel}. Bygger vidare på samma shell och fokuslogik.`,
        "Makrot är redo i shellen.",
        120
      );
      const card = document.createElement("article");
      card.className = "macro-card";
      card.innerHTML =
        `<span class="macro-card-label">${macro.mode === "auto" ? "Auto" : "Manuell"}</span>` +
        `<div class="macro-card-head"><strong>${escapeHtml(macro.title)}</strong><span>${escapeHtml(
          `${macro.actionCount} steg`
        )}</span></div>` +
        `<p>${escapeHtml(macro.copy)}</p>` +
        `<div class="macro-card-actions-list"><span>${escapeHtml(
          humanizeCode(macro.tone, "Standard")
        )}</span><span>${escapeHtml(macro.actionLabel || "Makro")}</span>${
          macro.shortcut ? `<span>${escapeHtml(macro.shortcut)}</span>` : ""
        }</div>` +
        `<div class="macro-card-foot"><span>${escapeHtml(
          actionSummary
        )}</span><div class="aux-action-stack-inline"><button type="button" data-macro-action="run" data-macro-key="${escapeHtml(
          macro.id || macro.key
        )}"${isPending ? " disabled" : ""}>${escapeHtml(runLabel)}</button><button type="button" data-macro-action="open" data-macro-key="${escapeHtml(
          macro.id || macro.key
        )}">Öppna</button><button type="button" data-macro-action="edit" data-macro-key="${escapeHtml(
          macro.id || macro.key
        )}"${isPending ? " disabled" : ""}>${escapeHtml(editLabel)}</button><button type="button" data-macro-action="delete" data-macro-key="${escapeHtml(
          macro.id || macro.key
        )}"${isPending ? " disabled" : ""}>${escapeHtml(deleteLabel)}</button></div></div>`;
      macrosList.append(card);
    });

    macroMetricNodes.forEach((node) => {
      const key = normalizeKey(node.dataset.macroMetric);
      if (key === "count") {
        node.textContent = String(macroCards.length);
      } else if (key === "auto") {
        node.textContent = String(macroCards.filter((item) => item.mode === "auto").length);
      } else if (key === "actions") {
        node.textContent = String(
          macroCards.reduce((sum, macro) => sum + Number(macro.actionCount || 0), 0)
        );
      }
    });

    renderMacrosRuntimeStatus();
  }

  async function loadMacrosRuntime({ force = false } = {}) {
    if (state.macrosRuntime.loading && !force) return state.macros;
    if (state.macrosRuntime.loaded && !force && !state.macrosRuntime.error) {
      renderMacros();
      return state.macros;
    }

    state.macrosRuntime.loading = true;
    state.macrosRuntime.authRequired = false;
    state.macrosRuntime.error = "";
    renderMacros();
    try {
      const payload = await apiRequest("/api/v1/cco/macros");
      state.macros = asArray(payload?.macros).map((macro, index) => createMacroCardFromRecord(macro, index));
      state.macrosRuntime.loaded = true;
      state.macrosRuntime.lastLoadedAt = new Date().toISOString();
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.macrosRuntime.authRequired = true;
      } else {
        state.macrosRuntime.error = error?.message || "Kunde inte läsa makrobiblioteket.";
      }
      if (!state.macrosRuntime.loaded) {
        state.macros = getFallbackMacroCards();
      }
    } finally {
      state.macrosRuntime.loading = false;
      renderMacros();
      renderShowcase();
    }
    return state.macros;
  }

  function renderSettingsRuntimeStatus() {
    if (!settingsStatus) return;
    if (state.settingsRuntime.loading) {
      setAuxStatus(settingsStatus, "Läser inställningar…", "loading");
      return;
    }
    if (state.settingsRuntime.saving) {
      setAuxStatus(settingsStatus, "Sparar inställningar…", "loading");
      return;
    }
    if (state.settingsRuntime.authRequired) {
      setAuxStatus(settingsStatus, "Inloggning krävs för inställningarna.", "error");
      return;
    }
    if (state.settingsRuntime.error) {
      setAuxStatus(settingsStatus, state.settingsRuntime.error, "error");
      return;
    }
  }

  function renderSettings() {
    const themeLabels = {
      mist: "Ljust",
      ink: "Mörkt",
      auto: "Auto",
    };
    const densityLabels = {
      compact: "Kompakt",
      balanced: "Balanserad",
      airy: "Rymlig",
    };

    settingsChoiceButtons.forEach((button) => {
      const choice = normalizeKey(button.dataset.settingsChoice);
      const isActive =
        normalizeKey(button.dataset.settingsValue) ===
        normalizeKey(state.settingsRuntime.choices[choice]);
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    settingsToggleInputs.forEach((input) => {
      input.checked = Boolean(
        state.settingsRuntime.toggles[normalizeKey(input.dataset.settingsToggle)]
      );
    });

    const activeGuardrails = [
      state.settingsRuntime.toggles.desktop_notifications,
      state.settingsRuntime.toggles.sla_alerts,
      state.settingsRuntime.toggles.smart_reply,
      state.settingsRuntime.toggles.team_mentions,
    ].filter(Boolean).length;

    if (settingsSummaryThemeValue) {
      settingsSummaryThemeValue.textContent = `${themeLabels[state.settingsRuntime.choices.theme] || "Ljust"} + ${densityLabels[state.settingsRuntime.choices.density] || "Kompakt"}`;
    }
    if (settingsSummaryThemeCopy) {
      settingsSummaryThemeCopy.textContent =
        state.settingsRuntime.choices.density === "airy"
          ? "Mer luft för fokuserat arbete"
          : state.settingsRuntime.choices.density === "balanced"
            ? "Balanserad rytm för hela teamet"
            : "Bäst för snabba arbetsköer";
    }
    if (settingsSummaryGuardValue) {
      settingsSummaryGuardValue.textContent =
        activeGuardrails >= 3 ? "SLA-varningar på" : activeGuardrails >= 1 ? "Guardrails delvis aktiva" : "Guardrails av";
    }
    if (settingsSummaryGuardCopy) {
      settingsSummaryGuardCopy.textContent = `${activeGuardrails} skydd aktiva i shellen`;
    }
    if (settingsSummaryTeamValue) {
      settingsSummaryTeamValue.textContent =
        state.settingsRuntime.toggles.compact_conversation && state.settingsRuntime.toggles.color_priorities
          ? "Delade vyer aktiva"
          : "Personlig vy aktiv";
    }
    if (settingsSummaryTeamCopy) {
      settingsSummaryTeamCopy.textContent =
        state.settingsRuntime.toggles.advanced_filters
          ? "Utökade filter syns i arbetsytan"
          : "Säkerställer samma rytm";
    }

    if (settingsProfileName) {
      settingsProfileName.textContent = state.settingsRuntime.profileName || "Ditt namn";
    }
    if (settingsProfileEmail) {
      settingsProfileEmail.textContent =
        state.settingsRuntime.profileEmail || "din.email@hairtp.com";
    }
    if (settingsProfileAvatar) {
      settingsProfileAvatar.textContent = initialsForName(
        state.settingsRuntime.profileName || state.settingsRuntime.profileEmail || "CCO"
      );
    }

    renderSettingsRuntimeStatus();
  }

  async function loadSettingsRuntime({ force = false } = {}) {
    if (state.settingsRuntime.loading && !force) return state.settingsRuntime;
    if (state.settingsRuntime.loaded && !force && !state.settingsRuntime.error) {
      renderSettings();
      return state.settingsRuntime;
    }

    state.settingsRuntime.loading = true;
    state.settingsRuntime.authRequired = false;
    state.settingsRuntime.error = "";
    renderSettings();
    try {
      const [settingsPayload, mePayload] = await Promise.allSettled([
        apiRequest("/api/v1/cco/settings"),
        apiRequest("/api/v1/auth/me"),
      ]);
      if (settingsPayload.status !== "fulfilled") {
        throw settingsPayload.reason;
      }
      applySettingsViewState(settingsPayload.value?.settings || {});
      renderMailboxAdminList();
      renderMailboxOptions();
      if (mePayload.status === "fulfilled") {
        const profile = parseIntegrationActorProfile(mePayload.value);
        if (
          !normalizeText(state.settingsRuntime.profileName) ||
          state.settingsRuntime.profileName === "Ditt namn"
        ) {
          state.settingsRuntime.profileName = profile.name;
        }
        if (
          !normalizeText(state.settingsRuntime.profileEmail) ||
          state.settingsRuntime.profileEmail === "din.email@hairtp.com"
        ) {
          state.settingsRuntime.profileEmail = profile.email;
        }
      }
      state.settingsRuntime.loaded = true;
      state.settingsRuntime.lastLoadedAt = new Date().toISOString();
      setAuxStatus(settingsStatus, "", "");
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.settingsRuntime.authRequired = true;
      } else {
        state.settingsRuntime.error = error?.message || "Kunde inte läsa inställningarna.";
      }
    } finally {
      state.settingsRuntime.loading = false;
      renderSettings();
      renderShowcase();
    }
    return state.settingsRuntime;
  }

  function buildMacroRequestBody({ name, description, trigger, macro }) {
    return {
      name,
      description,
      trigger: normalizeKey(trigger) === "auto" ? "auto" : "manual",
      shortcut: macro?.shortcut || "",
      actions: Array.from({ length: Math.max(1, macro?.actionCount || 2) }, (_, index) => ({
        id: String(index + 1),
        type: index === 0 ? "template" : "assign",
        config: index === 0 ? { templateId: "custom-reply" } : { assignTo: "current-user" },
      })),
    };
  }

  async function submitMacroModal() {
    const mode = state.macroModal.mode === "edit" ? "edit" : "create";
    const macro =
      mode === "edit"
        ? state.macros.find(
            (item) =>
              normalizeKey(item.id || item.key) === normalizeKey(state.macroModal.macroId)
          ) || null
        : null;
    const name = normalizeText(macroModalNameInput?.value);
    const description = normalizeText(macroModalDescriptionInput?.value);
    const trigger = normalizeKey(macroModalTriggerSelect?.value) || "manual";
    if (!name) {
      setFeedback(macroModalFeedback, "error", "Makronamnet kan inte vara tomt.");
      return;
    }
    if (state.macrosRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return;
    }

    state.macrosRuntime.pendingAction = mode;
    state.macrosRuntime.pendingMacroId = macro?.id || macro?.key || "create";
    renderMacros();
    setFeedback(
      macroModalFeedback,
      "loading",
      mode === "edit" ? "Sparar makro…" : "Skapar makro…"
    );
    try {
      const payload =
        mode === "edit"
          ? await apiRequest(`/api/v1/cco/macros/${encodeURIComponent(macro.id)}`, {
              method: "PUT",
              headers: {
                "x-idempotency-key": createIdempotencyKey(
                  `major-arcana-macro-edit-${macro.id}`
                ),
              },
              body: buildMacroRequestBody({ name, description, trigger, macro }),
            })
          : await apiRequest("/api/v1/cco/macros", {
              method: "POST",
              headers: {
                "x-idempotency-key": createIdempotencyKey("major-arcana-macro-create"),
              },
              body: buildMacroRequestBody({ name, description, trigger }),
            });
      if (payload?.macro) {
        const nextMacro = createMacroCardFromRecord(payload.macro, 0);
        if (mode === "edit") {
          state.macros = state.macros.map((item) =>
            normalizeKey(item.id || item.key) === normalizeKey(macro.id || macro.key)
              ? nextMacro
              : item
          );
        } else {
          state.macros.unshift(nextMacro);
        }
      }
      renderShowcase();
      setMacroModalOpen(false);
      setAuxStatus(
        macrosStatus,
        mode === "edit"
          ? `Makrot "${name}" uppdaterades i nya CCO.`
          : `Makrot "${name}" skapades i nya CCO.`,
        "success"
      );
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.macrosRuntime.authRequired = true;
        renderMacros();
        window.location.assign(buildReauthUrl());
        return;
      }
      setFeedback(
        macroModalFeedback,
        "error",
        error?.message || "Kunde inte spara makrot."
      );
    } finally {
      state.macrosRuntime.pendingAction = "";
      state.macrosRuntime.pendingMacroId = "";
      renderMacros();
    }
  }

  async function submitSettingsProfileModal() {
    const nextName = normalizeText(settingsProfileModalNameInput?.value);
    const nextEmail = normalizeText(settingsProfileModalEmailInput?.value).toLowerCase();
    if (!nextName) {
      setFeedback(settingsProfileModalFeedback, "error", "Profilnamnet kan inte vara tomt.");
      return;
    }
    if (!nextEmail.includes("@")) {
      setFeedback(settingsProfileModalFeedback, "error", "Ange en giltig e-postadress.");
      return;
    }
    state.settingsRuntime.profileName = nextName;
    state.settingsRuntime.profileEmail = nextEmail;
    renderSettings();
    setFeedback(settingsProfileModalFeedback, "loading", "Sparar profil…");
    const saved = await saveSettingsRuntime("Profilen uppdaterades i nya CCO.");
    if (saved) {
      setSettingsProfileModalOpen(false);
    } else if (state.settingsRuntime.error) {
      setFeedback(settingsProfileModalFeedback, "error", state.settingsRuntime.error);
    }
  }

  async function submitConfirmDialog() {
    if (typeof state.confirmDialog.onConfirm !== "function") {
      setConfirmDialogOpen(false);
      return;
    }
    const idleLabel = asText(confirmSubmitButton?.textContent, "Bekräfta");
    setButtonBusy(confirmSubmitButton, true, idleLabel, "Arbetar…");
    try {
      await state.confirmDialog.onConfirm();
    } finally {
      setButtonBusy(confirmSubmitButton, false, idleLabel, "Arbetar…");
    }
  }

  function buildShowcaseFeatureRuntime(featureKey) {
    const feature =
      SHOWCASE_FEATURES[normalizeKey(featureKey)] || SHOWCASE_FEATURES.command_palette;
    const macroCount = state.macros.length || getFallbackMacroCards().length;
    const autoMacroCount = state.macros.filter((item) => item.mode === "auto").length;
    const connectedIntegrations = getIntegrationConnectedKeys().length;
    const activeThreadCount = getFilteredRuntimeThreads().length;
    const customerBatchCount = state.customerBatchSelection.length;
    const laterCount = getMailFeedItems("later").length;

    if (normalizeKey(featureKey) === "macros") {
      return {
        ...feature,
        outcome: `${macroCount} makron redo, varav ${autoMacroCount} auto-körs i nya CCO.`,
        detail:
          macroCount > 0
            ? `Makrobiblioteket använder nu riktig backendpersistens och kan köras eller öppnas från shellen.`
            : "Makrobiblioteket är redo att fyllas på från nya CCO.",
        effectCopy: `${macroCount} makron i biblioteket`,
        nextCopy: "Öppna makron för att köra, redigera eller bygga vidare på dem i automation.",
      };
    }

    if (normalizeKey(featureKey) === "snooze") {
      return {
        ...feature,
        outcome: `${laterCount} trådar ligger just nu i Senare-flödet.`,
        detail: `Later-vyn i nya CCO använder nu livedata och samma mailboxscope som arbetsytan.`,
        effectCopy: `${laterCount} trådar redo att återuppta`,
      };
    }

    if (normalizeKey(featureKey) === "customer_journey") {
      return {
        ...feature,
        outcome: `${customerBatchCount} profiler är markerade i kundytan just nu.`,
        detail: `Kundytan i nya CCO kan nu driva merge, split och primary email i samma shell.`,
        effectCopy: `${customerBatchCount} profiler i batch-läge`,
      };
    }

    if (normalizeKey(featureKey) === "saved_views") {
      return {
        ...feature,
        outcome: `${activeThreadCount} live-trådar följer nu arbetsköns filter- och lane-scope.`,
        detail: `Queue, mailbox och owner-filter är nu levande i nya CCO och showcase hoppar direkt till den riktiga arbetsytan.`,
        effectCopy: `${activeThreadCount} trådar i aktivt scope`,
      };
    }

    if (normalizeKey(featureKey) === "ai_assistant") {
      return {
        ...feature,
        outcome: `Beslutsstödet använder nu live runtime, historik och kundintelligens i samma shell.`,
        detail: `Showcase pekar nu vidare till riktiga vyer i stället för en fristående demo.`,
        effectCopy: `${connectedIntegrations} integrationer stödjer beslutsflödet`,
      };
    }

    return feature;
  }

  function renderShowcase() {
    const feature = buildShowcaseFeatureRuntime(state.selectedShowcaseFeature);
    showcaseFeatureButtons.forEach((button) => {
      const isActive =
        normalizeKey(button.dataset.showcaseFeature) === state.selectedShowcaseFeature;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    if (showcaseFocus) showcaseFocus.textContent = feature.focus;
    if (showcaseTitleText) showcaseTitleText.textContent = feature.title;
    if (showcaseCopy) showcaseCopy.textContent = feature.copy;
    if (showcaseOutcome) showcaseOutcome.textContent = feature.outcome;
    if (showcaseDetail) showcaseDetail.textContent = feature.detail;
    if (showcaseEffectLabel) showcaseEffectLabel.textContent = feature.effectLabel;
    if (showcaseEffectTitle) showcaseEffectTitle.textContent = feature.effectTitle;
    if (showcaseEffectCopy) showcaseEffectCopy.textContent = feature.effectCopy;
    if (showcaseNextTitle) showcaseNextTitle.textContent = feature.nextTitle;
    if (showcaseNextCopy) showcaseNextCopy.textContent = feature.nextCopy;
    if (showcaseActionPrimary) {
      showcaseActionPrimary.textContent = feature.primaryAction.label;
      showcaseActionPrimary.dataset.showcaseJump = feature.primaryAction.jump;
      showcaseActionPrimary.hidden = false;
    }
    if (showcaseActionSecondary) {
      showcaseActionSecondary.textContent = feature.secondaryAction.label;
      showcaseActionSecondary.dataset.showcaseJump = feature.secondaryAction.jump;
      showcaseActionSecondary.hidden = false;
    }
  }

  function setSelectedShowcaseFeature(featureKey) {
    state.selectedShowcaseFeature = normalizeKey(featureKey) || "command_palette";
    renderShowcase();
  }

  function setAutomationCollaborationOpen(open) {
    state.automationCollaborationOpen = Boolean(open);
    if (automationCollaborationPanel) {
      automationCollaborationPanel.hidden = !state.automationCollaborationOpen;
    }
    automationCollaborationToggleButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        state.automationCollaborationOpen ? "true" : "false"
      );
    });
  }

  function getSelectedTemplateConfig() {
    return (
      AUTOMATION_TEMPLATE_CONFIGS[state.selectedAutomationTemplate] ||
      AUTOMATION_TEMPLATE_CONFIGS.churn_guard
    );
  }

  function getAutomationTemplateRecordName(templateKey = state.selectedAutomationTemplate) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    const template =
      AUTOMATION_TEMPLATE_CONFIGS[normalizedKey] || AUTOMATION_TEMPLATE_CONFIGS.churn_guard;
    return `CCO Automation · ${template.flowTitle} · ${normalizedKey}`;
  }

  function getAutomationVersions(templateKey = state.selectedAutomationTemplate) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    return asArray(state.automationRuntime.versionsByKey[normalizedKey]);
  }

  function getAutomationTemplateRecord(templateKey = state.selectedAutomationTemplate) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    return state.automationRuntime.templateRecordsByKey[normalizedKey] || null;
  }

  function getPreferredAutomationVersionId(
    templateKey = state.selectedAutomationTemplate
  ) {
    const versions = getAutomationVersions(templateKey);
    const selectedVersionId = normalizeKey(state.selectedAutomationVersion);
    const selectedExists = versions.some(
      (version) => normalizeKey(version.id) === selectedVersionId
    );
    if (selectedExists) {
      return state.selectedAutomationVersion;
    }

    const activeVersionId = normalizeText(
      state.automationRuntime.activeVersionIdByKey[normalizeKey(templateKey) || "churn_guard"]
    );
    if (activeVersionId) {
      return activeVersionId;
    }

    return versions[0]?.id || "placeholder";
  }

  function buildAutomationTemplateContent(templateKey = state.selectedAutomationTemplate) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    const template =
      AUTOMATION_TEMPLATE_CONFIGS[normalizedKey] || AUTOMATION_TEMPLATE_CONFIGS.churn_guard;
    const nodeLines = Object.entries(template.nodes || {}).map(([nodeKey, definition], index) => {
      const title = normalizeText(definition?.title) || `Steg ${index + 1}`;
      const lines = asArray(definition?.lines)
        .map((line) => `  - ${normalizeText(line)}`)
        .join("\n");
      return `${index + 1}. ${normalizeText(nodeKey) || `steg_${index + 1}`} · ${title}${
        lines ? `\n${lines}` : ""
      }`;
    });
    const appliedSuggestions = asArray(state.automationRuntime.appliedSuggestionKeys);
    const dismissedSuggestions = asArray(state.automationRuntime.dismissedSuggestionKeys);
    const testingScenario = normalizeKey(state.automationRuntime.testingScenario) || "baseline";

    return [
      `Automation key: ${normalizedKey}`,
      `Flow title: ${template.flowTitle}`,
      `Library: ${state.selectedAutomationLibrary}`,
      `Focused node: ${state.selectedAutomationNode}`,
      `Focused section: ${state.selectedAutomationSection}`,
      `Canvas scale: ${state.automationScale}%`,
      `Autopilot: ${state.automationAutopilotEnabled ? "enabled" : "paused"}`,
      `Testing scenario: ${testingScenario}`,
      "",
      "Nodes:",
      nodeLines.join("\n"),
      "",
      `Applied suggestions: ${appliedSuggestions.join(", ") || "none"}`,
      `Dismissed suggestions: ${dismissedSuggestions.join(", ") || "none"}`,
    ].join("\n");
  }

  function buildAutomationInstruction(templateKey = state.selectedAutomationTemplate, actionKey = "save") {
    const template =
      AUTOMATION_TEMPLATE_CONFIGS[normalizeKey(templateKey)] || AUTOMATION_TEMPLATE_CONFIGS.churn_guard;
    const actionLabel =
      normalizeKey(actionKey) === "run"
        ? "Utvärdera automationen mot live risk/policy."
        : "Spara aktuell builder-snapshot som arbetsutkast.";
    return `${actionLabel} Flöde: ${template.flowTitle}. Fokussteg: ${state.selectedAutomationNode}.`;
  }

  function getAutomationDecisionTone(decision) {
    const normalizedDecision = normalizeKey(decision);
    if (normalizedDecision === "blocked" || normalizedDecision === "critical_escalate") {
      return "error";
    }
    if (normalizedDecision === "review_required") {
      return "loading";
    }
    return "success";
  }

  function getAutomationDecisionLabel(decision) {
    const normalizedDecision = normalizeKey(decision);
    if (normalizedDecision === "blocked") return "blockerad";
    if (normalizedDecision === "critical_escalate") return "eskalerad";
    if (normalizedDecision === "review_required") return "kräver granskning";
    if (normalizedDecision === "allow") return "godkänd";
    return "okänd";
  }

  function buildAutomationTestingStateFromEvaluation(version, variableValidation) {
    const decision = normalizeKey(version?.risk?.decision) || "allow";
    const variableCount = asArray(variableValidation?.variablesUsed || version?.variablesUsed).length;
    const revision = Number(version?.revision || 1);
    const timestamp = formatListTime(version?.updatedAt || version?.createdAt) || "Nu";
    const reasonCodes = asArray(version?.risk?.reasonCodes).slice(0, 2);
    const items = [
      `Beslut: ${getAutomationDecisionLabel(decision)}.`,
      `Revision ${revision} är nu sparad i templatesystemet.`,
      variableCount > 0
        ? `${variableCount} variabler hittades i snapshoten.`
        : "Inga templatevariabler hittades i snapshoten.",
    ];
    if (reasonCodes.length) {
      items.push(`Risksignaler: ${reasonCodes.join(", ")}.`);
    }
    return {
      title:
        decision === "allow"
          ? "Validering godkänd"
          : decision === "review_required"
            ? "Manuell granskning krävs"
            : "Risk / policy blockerade körningen",
      items,
      log: [
        {
          time: timestamp,
          tone:
            decision === "allow" ? "ok" : decision === "review_required" ? "wait" : "error",
          title: `Liveutvärdering: ${getAutomationDecisionLabel(decision)}`,
          copy: compactRuntimeCopy(version?.title || version?.content, "Automationen utvärderades live.", 140),
        },
      ],
    };
  }

  async function listAutomationTemplates() {
    const payload = await apiRequest("/api/v1/templates?category=INTERNAL");
    return asArray(payload?.templates);
  }

  function syncAutomationTemplateRecordCache(templates) {
    const list = asArray(templates);
    Object.keys(AUTOMATION_TEMPLATE_CONFIGS).forEach((templateKey) => {
      const expectedName = getAutomationTemplateRecordName(templateKey);
      const record =
        list.find((item) => normalizeText(item?.name) === expectedName) || null;
      if (record) {
        state.automationRuntime.templateRecordsByKey[templateKey] = record;
      }
    });
  }

  async function ensureAutomationTemplateRecord(templateKey = state.selectedAutomationTemplate, options = {}) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    const createIfMissing = options.createIfMissing === true;
    const cached = getAutomationTemplateRecord(normalizedKey);
    if (cached) {
      return cached;
    }

    const templates = await listAutomationTemplates();
    syncAutomationTemplateRecordCache(templates);
    const existing = getAutomationTemplateRecord(normalizedKey);
    if (existing || !createIfMissing) {
      return existing || null;
    }

    const created = await apiRequest("/api/v1/templates", {
      method: "POST",
      headers: {
        "x-idempotency-key": createIdempotencyKey(`automation-template-${normalizedKey}`),
      },
      body: {
        category: "INTERNAL",
        name: getAutomationTemplateRecordName(normalizedKey),
        channel: "internal",
        locale: "sv-SE",
      },
    });
    const template = created?.template || null;
    if (template) {
      state.automationRuntime.templateRecordsByKey[normalizedKey] = template;
    }
    return template;
  }

  function renderAutomationVersions() {
    const templateKey = normalizeKey(state.selectedAutomationTemplate) || "churn_guard";
    const versions = getAutomationVersions(templateKey).slice(0, automationVersionCards.length);
    const selectedVersionId = normalizeKey(state.selectedAutomationVersion);
    const authRequired = state.automationRuntime.authRequired;
    const syncError = normalizeText(state.automationRuntime.error);
    const activeVersionId = normalizeKey(state.automationRuntime.activeVersionIdByKey[templateKey]);

    automationVersionCards.forEach((card, index) => {
      const detail = automationVersionDetails[index];
      const version = versions[index] || null;

      if (!version) {
        if (index > 0) {
          card.hidden = true;
          if (detail) detail.hidden = true;
          return;
        }

        card.hidden = false;
        card.dataset.automationVersion = "placeholder";
        card.setAttribute("aria-pressed", "true");
        card.classList.add("is-selected");

        const badge = card.querySelector(".automation-version-badge");
        const flag = card.querySelector(".automation-version-flag");
        const time = card.querySelector("time");
        const points = Array.from(card.querySelectorAll(".automation-version-points li"));
        const buttons = Array.from(card.querySelectorAll("[data-automation-version-action]"));
        if (badge) badge.textContent = authRequired ? "Logga in" : "Ingen liveversion";
        if (flag) {
          flag.textContent = authRequired ? "Inloggning krävs" : "Osparat ännu";
          flag.hidden = false;
        }
        if (time) {
          time.textContent = authRequired
            ? "Öppna admin och logga in igen"
            : syncError || "Spara buildern för att skapa första liveversionen.";
        }
        points.forEach((point, pointIndex) => {
          point.textContent =
            pointIndex === 0
              ? authRequired
                ? "Templatesystemet kräver giltig admin-session."
                : "Ingen sparad draft eller aktiv version finns ännu."
              : pointIndex === 1
                ? "Kör live test för att få risk- och policybeslut."
                : "Återställning blir tillgänglig när första liveversionen finns.";
        });
        buttons.forEach((button) => {
          button.disabled = true;
        });

        if (detail) {
          detail.hidden = false;
          detail.dataset.automationVersionDetail = "placeholder";
          detail.classList.add("is-active");
          detail.setAttribute("aria-hidden", "false");
          const label = detail.querySelector(".automation-version-diff span");
          const pre = detail.querySelector(".automation-version-diff pre");
          if (label) {
            label.textContent = authRequired
              ? "Åtgärd krävs"
              : "Nästa steg";
          }
          if (pre) {
            pre.textContent = authRequired
              ? "Logga in igen i admin för att läsa liveversioner och revisionsdata."
              : "Spara automationen för att skapa en liveversion i templatesystemet. Kör sedan test för att få ett riktigt risk- och policybeslut.";
          }
          const factCards = Array.from(detail.querySelectorAll(".automation-version-fact-card"));
          factCards.forEach((factCard, factIndex) => {
            const strong = factCard.querySelector("strong");
            const paragraph = factCard.querySelector("p");
            if (!strong || !paragraph) return;
            if (factIndex === 0) {
              strong.textContent = authRequired ? "Auth" : "Ej sparad";
              paragraph.textContent = authRequired
                ? "Live templatesystemet kräver giltig session."
                : "Ingen riskbedömning finns förrän första liveutkastet är skapat.";
            } else if (factIndex === 1) {
              strong.textContent = authRequired ? "-" : "Spara först";
              paragraph.textContent = "Versionsspåret blir live när första draften skapats.";
            } else {
              strong.textContent = authRequired ? "-" : "Nya CCO";
              paragraph.textContent = "Buildern använder nu Major Arcana-shellen som bas.";
            }
          });
        }
        renderAutomationTrustNotes();
        return;
      }

      const versionLabel = `v${Number(version.versionNo || index + 1)}`;
      const isSelected =
        selectedVersionId === normalizeKey(version.id) ||
        (!selectedVersionId && index === 0);
      const isActive = normalizeKey(version.state) === "active";
      const badge = card.querySelector(".automation-version-badge");
      const flag = card.querySelector(".automation-version-flag");
      const time = card.querySelector("time");
      const points = Array.from(card.querySelectorAll(".automation-version-points li"));
      const buttons = Array.from(card.querySelectorAll("[data-automation-version-action]"));
      const compareTarget = versions[index + 1] || null;
      const detailLabel = detail?.querySelector(".automation-version-diff span");
      const detailPre = detail?.querySelector(".automation-version-diff pre");
      const factCards = detail ? Array.from(detail.querySelectorAll(".automation-version-fact-card")) : [];
      const noteBlocks = detail ? Array.from(detail.querySelectorAll(".automation-version-notes div")) : [];

      card.hidden = false;
      card.dataset.automationVersion = version.id;
      card.classList.toggle("is-selected", isSelected);
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");

      if (badge) {
        badge.textContent = versionLabel;
        badge.classList.toggle("automation-version-badge-current", isActive);
      }
      if (flag) {
        flag.hidden = false;
        flag.textContent =
          isActive
            ? "Aktiv"
            : normalizeKey(version.state) === "draft"
              ? "Draft"
              : "Arkiverad";
      }
      if (time) {
        time.textContent = `${formatRuntimeDateTime(version.updatedAt || version.createdAt, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })} · rev ${Number(version.revision || 1)}`;
      }
      points.forEach((point, pointIndex) => {
        const pointValue =
          pointIndex === 0
            ? `${normalizeKey(version.state) === "draft" ? "Utkast" : "Release"} sparad i templatesystemet`
            : pointIndex === 1
              ? `Riskbeslut: ${getAutomationDecisionLabel(version?.risk?.decision)}`
              : `${asArray(version.variablesUsed).length} variabler upptäckta i snapshoten`;
        point.textContent = pointValue;
      });
      buttons.forEach((button) => {
        const actionKey = normalizeKey(button.dataset.automationVersionAction);
        button.disabled = authRequired && actionKey === "restore";
        if (actionKey === "restore") {
          button.textContent = isActive ? "Aktiv nu" : "Aktivera";
          button.disabled = isActive || authRequired;
        }
      });

      if (!detail) return;
      detail.hidden = !isSelected;
      detail.dataset.automationVersionDetail = version.id;
      detail.classList.toggle("is-active", isSelected);
      detail.setAttribute("aria-hidden", isSelected ? "false" : "true");

      if (detailLabel) {
        detailLabel.textContent = compareTarget
          ? `Versioninnehåll: ${versionLabel} ↔ v${Number(compareTarget.versionNo || 0)}`
          : `Versioninnehåll: ${versionLabel}`;
      }
      if (detailPre) {
        detailPre.textContent = compactRuntimeCopy(
          version.content,
          "Ingen innehållssammanfattning tillgänglig för liveversionen.",
          560
        );
      }
      factCards.forEach((factCard, factIndex) => {
        const strong = factCard.querySelector("strong");
        const paragraph = factCard.querySelector("p");
        if (!strong || !paragraph) return;
        if (factIndex === 0) {
          strong.textContent =
            normalizeKey(version?.risk?.decision) === "allow"
              ? "Låg"
              : normalizeKey(version?.risk?.decision) === "review_required"
                ? "Medel"
                : normalizeKey(version?.risk?.decision) === "blocked"
                  ? "Hög"
                  : "Okänd";
          paragraph.textContent = `Riskbeslut: ${getAutomationDecisionLabel(
            version?.risk?.decision
          )}.`;
        } else if (factIndex === 1) {
          strong.textContent = isActive ? "Aktiv live" : normalizeText(version.state) || "Draft";
          paragraph.textContent = `Revision ${Number(version.revision || 1)} · senast uppdaterad ${formatListTime(
            version.updatedAt || version.createdAt
          )}.`;
        } else {
          strong.textContent =
            normalizeText(version.updatedBy || version.createdBy) ||
            (activeVersionId === normalizeKey(version.id) ? "Aktiv owner" : "Nya CCO");
          paragraph.textContent = activeVersionId === normalizeKey(version.id)
            ? "Detta är den nu aktiva liveversionen i templatesystemet."
            : "Versionskortet läser nu live från templatesystemet.";
        }
      });
      noteBlocks.forEach((block, noteIndex) => {
        const paragraph = block.querySelector("p");
        if (!paragraph) return;
        if (noteIndex === 0) {
          paragraph.textContent = `Versionsspåret har ${Number(version.revision || 1)} revisioner i livehistoriken.`;
        } else if (noteIndex === 1) {
          paragraph.textContent = `Påverkade delar: ${compactRuntimeCopy(
            version.title || version.content,
            "Liveutkast utan ytterligare metadata.",
            140
          )}`;
        } else {
          paragraph.textContent = isActive
            ? "Bevaka beslut, revisionsspår och nästa liveutvärdering efter ändring."
            : "Aktivera versionen för att göra den till livebas i templatesystemet.";
        }
      });
    });

    renderAutomationTrustNotes();
  }

  async function loadAutomationVersions(templateKey = state.selectedAutomationTemplate, options = {}) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    const createIfMissing = options.createIfMissing === true;
    state.automationRuntime.loading = true;
    state.automationRuntime.error = "";
    state.automationRuntime.authRequired = false;
    state.automationRuntime.syncingTemplateKey = normalizedKey;

    try {
      const templateRecord = await ensureAutomationTemplateRecord(normalizedKey, { createIfMissing });
      if (!templateRecord) {
        state.automationRuntime.versionsByKey[normalizedKey] = [];
        state.automationRuntime.activeVersionIdByKey[normalizedKey] = "";
        if (normalizedKey === state.selectedAutomationTemplate) {
          renderAutomationVersions();
        }
        return [];
      }

      const payload = await apiRequest(
        `/api/v1/templates/${encodeURIComponent(templateRecord.id)}/versions`
      );
      const versions = asArray(payload?.versions);
      state.automationRuntime.templateRecordsByKey[normalizedKey] = templateRecord;
      state.automationRuntime.versionsByKey[normalizedKey] = versions;
      const activeVersion =
        versions.find((version) => normalizeKey(version.state) === "active") ||
        versions[0] ||
        null;
      state.automationRuntime.activeVersionIdByKey[normalizedKey] = activeVersion?.id || "";
      if (normalizedKey === state.selectedAutomationTemplate) {
        const selectedStillExists = versions.some(
          (version) => normalizeKey(version.id) === normalizeKey(state.selectedAutomationVersion)
        );
        if (versions.length && !selectedStillExists) {
          state.selectedAutomationVersion = activeVersion?.id || versions[0].id;
        } else if (!versions.length) {
          state.selectedAutomationVersion = "placeholder";
        }
        renderAutomationVersions();
      }
      return versions;
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.automationRuntime.authRequired = true;
      } else {
        state.automationRuntime.error = error?.message || "Kunde inte läsa automationens liveversioner.";
      }
      state.automationRuntime.versionsByKey[normalizedKey] = [];
      state.automationRuntime.activeVersionIdByKey[normalizedKey] = "";
      if (normalizedKey === state.selectedAutomationTemplate) {
        renderAutomationVersions();
      }
      throw error;
    } finally {
      state.automationRuntime.loading = false;
      state.automationRuntime.syncingTemplateKey = "";
    }
  }

  async function saveAutomationDraft(templateKey = state.selectedAutomationTemplate) {
    const normalizedKey = normalizeKey(templateKey) || "churn_guard";
    const templateRecord = await ensureAutomationTemplateRecord(normalizedKey, { createIfMissing: true });
    const currentVersions = await loadAutomationVersions(normalizedKey, { createIfMissing: true }).catch(
      () => getAutomationVersions(normalizedKey)
    );
    const existingDraft =
      asArray(currentVersions).find((version) => normalizeKey(version.state) === "draft") || null;
    const requestBody = {
      title: getSelectedTemplateConfig().flowTitle,
      content: buildAutomationTemplateContent(normalizedKey),
      source: "manual",
      variablesUsed: [],
      instruction: buildAutomationInstruction(normalizedKey, "save"),
    };

    if (!templateRecord) {
      throw new Error("Ingen automationmall kunde skapas för livepersistens.");
    }

    let payload;
    if (existingDraft) {
      payload = await apiRequest(
        `/api/v1/templates/${encodeURIComponent(templateRecord.id)}/versions/${encodeURIComponent(
          existingDraft.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "if-match": `W/\"r${Number(existingDraft.revision || 1)}\"`,
            "x-idempotency-key": createIdempotencyKey(`automation-save-${normalizedKey}`),
          },
          body: {
            ...requestBody,
            expectedRevision: Number(existingDraft.revision || 1),
          },
        }
      );
    } else {
      payload = await apiRequest(
        `/api/v1/templates/${encodeURIComponent(templateRecord.id)}/drafts`,
        {
          method: "POST",
          headers: {
            "x-idempotency-key": createIdempotencyKey(`automation-draft-${normalizedKey}`),
          },
          body: requestBody,
        }
      );
    }

    const version = payload?.version || null;
    await loadAutomationVersions(normalizedKey, { createIfMissing: true });
    if (version?.id) {
      setSelectedAutomationVersion(version.id);
    }
    return {
      templateRecord,
      version: version || null,
    };
  }

  function renderCustomerMetrics(visibleKeys) {
    const visible = Array.isArray(visibleKeys) ? visibleKeys : [];
    const total = visible.length;
    const vip = visible.filter((key) => getCustomerDirectoryMap()[key]?.vip).length;
    const emails = visible.reduce(
      (sum, key) => sum + Number(getCustomerDirectoryMap()[key]?.emailCoverage || 0),
      0
    );
    const totalValue = visible.reduce(
      (sum, key) => sum + Number(getCustomerDirectoryMap()[key]?.customerValue || 0),
      0
    );
    const suggestionGroups = buildCustomerSuggestionGroups();
    state.customerRuntime.duplicateMetric = getActiveCustomerSuggestionCount(suggestionGroups);

    customerMetricCards.forEach((card) => {
      const key = normalizeKey(card.dataset.customerMetric);
      const valueNode = card.querySelector("strong");
      if (!valueNode) return;
      if (key === "total") valueNode.textContent = String(total);
      if (key === "vip") valueNode.textContent = String(vip);
      if (key === "emails") valueNode.textContent = String(emails);
      if (key === "value") valueNode.textContent = formatCompactKr(totalValue);
      if (key === "duplicates") {
        valueNode.textContent = String(Math.max(0, state.customerRuntime.duplicateMetric));
      }
    });
  }

  function syncCustomerProfileBadge(root, count) {
    if (!root) return;
    let badge = root.querySelector(".customer-record-badge, .customers-rail-card-head span");
    if (!badge && count > 1) {
      badge = document.createElement("span");
      badge.className = root.classList.contains("customer-record-head")
        ? "customer-record-badge"
        : "";
      root.appendChild(badge);
    }
    if (!badge) return;
    if (count > 1) {
      badge.hidden = false;
      badge.textContent = `${count} profiler`;
    } else {
      badge.hidden = true;
    }
  }

  function renderCustomerProfileCounts() {
    customerRows.forEach((row) => {
      const key = normalizeKey(row.dataset.customerRow);
      const count = Number(
        state.customerRuntime.profileCounts[key] ||
          getCustomerDirectoryMap()[key]?.profileCount ||
          1
      );
      syncCustomerProfileBadge(row.querySelector(".customer-record-head"), count);
    });

    customerDetailCards.forEach((card) => {
      const key = normalizeKey(card.dataset.customerDetail);
      const count = Number(
        state.customerRuntime.profileCounts[key] ||
          getCustomerDirectoryMap()[key]?.profileCount ||
          1
      );
      syncCustomerProfileBadge(card.querySelector(".customers-rail-card-head"), count);
    });
  }

  function getVisibleCustomerKeys() {
    const query = normalizeKey(state.customerSearch);
    const filter = normalizeKey(state.customerFilter);
    const directory = getCustomerDirectoryMap();
    const details = getCustomerDetailsMap();

    return getVisibleCustomerPoolKeys().filter((key) => {
      const profile = directory[key] || {};
      const detail = details[key] || {};
      const searchHaystack = [
        profile?.name,
        asArray(detail?.emails).join(" "),
        detail?.phone,
        asArray(detail?.mailboxes).join(" "),
      ]
        .map(normalizeKey)
        .join(" ");
      const matchesSearch = !query || searchHaystack.includes(query);
      const matchesFilter =
        filter === "vip-kunder"
          ? Boolean(profile?.vip)
          : filter === "möjliga dubbletter"
            ? Boolean(profile?.duplicateCandidate) ||
              Number(state.customerRuntime.profileCounts[key] || profile?.profileCount || 1) > 1
            : true;
      return matchesSearch && matchesFilter;
    });
  }

  function renderCustomerRows(visibleKeys) {
    if (!customerList) return;
    customerList.innerHTML = visibleKeys
      .map((key) => {
        const record = getCustomerRecord(key);
        return `
          <button class="customer-record${record.key === state.selectedCustomerIdentity ? " is-selected" : ""}" type="button" data-customer-row="${escapeAttribute(record.key)}" aria-pressed="${record.key === state.selectedCustomerIdentity ? "true" : "false"}">
            <span class="customer-record-check${getBatchSelectionKeys().includes(record.key) ? " is-batch-selected" : ""}" aria-hidden="true"></span>
            <div class="customer-record-main">
              <div class="customer-record-head">
                <h3>${escapeHtml(record.name)}</h3>
                ${record.vip ? '<span class="customer-record-star" aria-hidden="true">★</span>' : ""}
                ${record.profileCount > 1 ? `<span class="customer-record-badge">${escapeHtml(`${record.profileCount} profiler`)}</span>` : ""}
              </div>
              <div class="customer-record-meta">
                <span>${escapeHtml(record.primaryEmail || "Saknar e-post")}</span>
                ${record.otherEmailCount > 0 ? `<span class="customer-record-meta-rose">+${record.otherEmailCount} andra e-postadresser</span>` : ""}
              </div>
              <div class="customer-record-foot">
                <span>${escapeHtml(`${record.totalConversations} konv.`)}</span>
                <span>${escapeHtml(`${record.totalMessages} medd.`)}</span>
                <strong>${escapeHtml(formatCompactKr(record.customerValue))}</strong>
              </div>
            </div>
            <div class="customer-record-side">
              <span>${escapeHtml(record.phone || "Ingen telefon")}</span>
            </div>
          </button>
        `;
      })
      .join("");
  }

  function renderCustomerDetailCards() {
    if (!customerDetailStack) return;
    customerDetailStack.innerHTML = getVisibleCustomerPoolKeys()
      .map((key) => {
        const record = getCustomerRecord(key);
        const active = record.key === state.selectedCustomerIdentity;
        return `
          <article class="customers-rail-card${active ? " is-active" : ""}" data-customer-detail="${escapeAttribute(record.key)}"${active ? "" : " hidden"}>
            <div class="customers-rail-card-head">
              <h3>${escapeHtml(record.name)}</h3>
              <span>${escapeHtml(`${record.profileCount} ${record.profileCount === 1 ? "profil" : "profiler"}`)}</span>
            </div>
            <p>${escapeHtml(record.primaryEmail || "Ingen e-post")}${record.otherEmailCount > 0 ? ` <strong>+${escapeHtml(String(record.otherEmailCount))} till</strong>` : ""}</p>
            <p>${escapeHtml(record.phone || "Ingen telefon")}</p>
            <div class="customers-rail-card-foot">
              <span>${escapeHtml(`${record.totalConversations} konv.`)}</span>
              <strong>${escapeHtml(formatCompactKr(record.customerValue))}</strong>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderCustomerMergeGroups() {
    if (!customerMergeGroupsHost) return;
    const suggestionGroups = buildCustomerSuggestionGroups();
    state.customerRuntime.duplicateMetric = getActiveCustomerSuggestionCount(suggestionGroups);
    customerMergeGroupsHost.innerHTML = getVisibleCustomerPoolKeys()
      .map((key) => {
        const suggestions = asArray(suggestionGroups[key]).filter((item) => {
          const suggestionId = buildCustomerSuggestionPairId(item.primaryKey, item.secondaryKey);
          return (
            !state.customerRuntime.dismissedSuggestionIds.includes(suggestionId) &&
            !state.customerRuntime.acceptedSuggestionIds.includes(suggestionId)
          );
        });

        const content = suggestions.length
          ? suggestions
              .map(
                (item) => `
                  <article class="customers-merge-card">
                    <div class="customers-merge-top">
                      <strong>${escapeHtml(getCustomerRecord(item.primaryKey).name)}</strong>
                      <span>${escapeHtml(item.name)}</span>
                      <b>${escapeHtml(`${item.confidence}%`)}</b>
                    </div>
                    <ul>
                      ${item.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
                    </ul>
                    <div class="customers-merge-actions">
                      <button class="customers-merge-accept" type="button" data-customer-merge-action="accept" data-customer-merge-primary-key="${escapeAttribute(item.primaryKey)}" data-customer-merge-secondary-key="${escapeAttribute(item.secondaryKey)}">Slå ihop</button>
                      <button class="customers-merge-dismiss" type="button" data-customer-merge-action="dismiss" data-customer-merge-primary-key="${escapeAttribute(item.primaryKey)}" data-customer-merge-secondary-key="${escapeAttribute(item.secondaryKey)}">Inte samma</button>
                    </div>
                  </article>
                `
              )
              .join("")
          : `
              <article class="customers-merge-card customers-merge-card-muted">
                <div class="customers-merge-empty">
                  <strong>Inga aktiva dubblettförslag</strong>
                  <p>Den valda kunden har inga öppna identitetsförslag kvar just nu.</p>
                </div>
              </article>
            `;

        return `<div class="customers-merge-group${key === state.selectedCustomerIdentity ? " is-active" : ""}" data-customer-merge-group="${escapeAttribute(key)}"${key === state.selectedCustomerIdentity ? "" : " hidden"}>${content}</div>`;
      })
      .join("");
    refreshCustomerNodeRefs();
  }

  function applyCustomerFilters() {
    ensureCustomerRuntimeProfilesFromLive();
    const visibleKeys = getVisibleCustomerKeys();
    renderCustomerRows(visibleKeys);
    renderCustomerDetailCards();
    refreshCustomerNodeRefs();
    renderCustomerProfileCounts();
    renderCustomerMetrics(visibleKeys);
    renderCustomerMergeGroups();
    renderCustomerBatchSelection();

    if (!visibleKeys.length) {
      const hasSearch = Boolean(normalizeKey(state.customerSearch));
      const hasNonDefaultFilter =
        normalizeKey(state.customerFilter) && normalizeKey(state.customerFilter) !== "alla kunder";
      if (state.customerRuntime.error) {
        setCustomersStatus(state.customerRuntime.error, "error");
      } else if (hasSearch || hasNonDefaultFilter) {
        setCustomersStatus("Ingen kund matchar ditt urval just nu.", "error");
      } else if (state.customerRuntime.loaded) {
        setCustomersStatus("Kundregistret är tomt just nu.", "loading");
      }
      setSelectedCustomerIdentity("");
      return;
    }

    if (
      customerStatus &&
      customerStatus.dataset.statusTone === "error" &&
      normalizeText(customerStatus.textContent) === "Ingen kund matchar ditt urval just nu."
    ) {
      setCustomersStatus("", "");
    }

    if (!visibleKeys.includes(state.selectedCustomerIdentity)) {
      setSelectedCustomerIdentity(visibleKeys[0]);
      return;
    }

    setSelectedCustomerIdentity(state.selectedCustomerIdentity);
  }

  function getAnalyticsDaysForPeriod(periodKey = state.selectedAnalyticsPeriod) {
    const normalizedKey = normalizeKey(periodKey || "week");
    if (normalizedKey === "today") return 1;
    if (normalizedKey === "month") return 30;
    return 7;
  }

  function formatAnalyticsLatency(p95Ms) {
    const value = asNumber(p95Ms, 0);
    if (value <= 0) return "0 ms";
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60_000) {
      const seconds = value / 1000;
      return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)} s`;
    }
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  function getAnalyticsOwnerScopeLabel() {
    const selectedOwnerKey = normalizeKey(state.runtime.selectedOwnerKey || "all");
    if (selectedOwnerKey === "all") return "Alla ägare";
    if (selectedOwnerKey === "unassigned") return "Oägd";
    const owner = getAvailableRuntimeOwners().find((item) => item.id === selectedOwnerKey);
    return asText(owner?.label, "Ägare");
  }

  function buildAnalyticsLiveCards() {
    const analytics = state.analyticsRuntime;
    const readinessScore = asNumber(analytics.readiness?.score, 0);
    const readinessBand = humanizeCode(analytics.readiness?.band, "Okänt");
    const goAllowed = analytics.readiness?.goAllowed === true;
    const p95Ms = asNumber(analytics.monitorMetrics?.latency?.p95Ms, 0);
    const slowRequests = asNumber(analytics.monitorMetrics?.totals?.slowRequests, 0);
    const openIncidents = asNumber(
      analytics.incidentSummary?.totals?.openUnresolved ??
        analytics.ownerDashboard?.incidents?.summary?.totals?.openUnresolved,
      0
    );
    const breachedOpen = asNumber(
      analytics.incidentSummary?.totals?.breachedOpen ??
        analytics.ownerDashboard?.incidents?.summary?.totals?.breachedOpen,
      0
    );
    const riskOpen = asNumber(
      analytics.riskSummary?.totals?.highCriticalOpen ??
        analytics.ownerDashboard?.riskSummary?.totals?.highCriticalOpen,
      0
    );
    const ownerPending = asNumber(
      analytics.pilotReport?.kpis?.ownerDecisionPending ??
        analytics.ownerDashboard?.riskSummary?.totals?.ownerDecisionPending,
      0
    );
    const mailReady = analytics.mailInsights?.ready === true;
    const visibleThreads = getQueueScopedRuntimeThreads();
    const mailboxScopeCount =
      getSelectedRuntimeMailboxScopeIds().length || getAvailableRuntimeMailboxes().length || 0;
    const ownerScopeAvailability = getOwnerScopeAvailability();

    return {
      readiness: {
        label: "Readiness-score",
        trend: readinessBand,
        trendTone: goAllowed ? "positive" : "negative",
        value: readinessScore ? readinessScore.toFixed(1) : "0.0",
        meta: goAllowed ? "Go/no-go tillåter körning." : "Åtgärd krävs innan go.",
      },
      latency: {
        label: "Runtime p95",
        trend: slowRequests > 0 ? `${slowRequests} långsamma` : "Stabil",
        trendTone: slowRequests > 0 ? "negative" : "positive",
        value: formatAnalyticsLatency(p95Ms),
        meta: "Monitor-latens från valt fönster.",
      },
      incidents: {
        label: "Öppna incidenter",
        trend: breachedOpen > 0 ? `${breachedOpen} över SLA` : "Inga brott",
        trendTone: breachedOpen > 0 ? "negative" : "positive",
        value: String(openIncidents),
        meta: "Operativt läge nu.",
      },
      mail: {
        label: "Mail insights",
        trend: asText(analytics.mailInsights?.brand, "Ingen brand"),
        trendTone: mailReady ? "positive" : "negative",
        value: mailReady ? "Redo" : "Väntar",
        meta: mailReady
          ? "Mail-insikter redo för shellen."
          : "Kör ingest för att fylla panelen.",
      },
      risk: {
        label: "Hög risk öppna",
        trend: ownerPending > 0 ? `${ownerPending} väntar` : "Ägarläge lugnt",
        trendTone: ownerPending > 0 || riskOpen > 0 ? "negative" : "positive",
        value: String(riskOpen),
        meta: "Behöver ägarbeslut eller riskuppföljning.",
      },
      scope: {
        label: "Synliga trådar",
        trend: `${mailboxScopeCount} mailboxar`,
        trendTone: "positive",
        value: String(visibleThreads.length),
        meta: `Ägarscope: ${getAnalyticsOwnerScopeLabel()}.${
          ownerScopeAvailability.note ? ` ${ownerScopeAvailability.note}` : ""
        }`,
      },
    };
  }

  function buildAnalyticsLiveNarratives() {
    const analytics = state.analyticsRuntime;
    const pilot = analytics.pilotReport?.kpis || {};
    const ownerRisk = analytics.ownerDashboard?.riskSummary?.totals || {};
    const incidents = analytics.incidentSummary?.totals || {};
    const mailReady = analytics.mailInsights?.ready === true;
    const visibleThreads = getQueueScopedRuntimeThreads();
    const mailboxScopeCount =
      getSelectedRuntimeMailboxScopeIds().length || getAvailableRuntimeMailboxes().length || 0;

    return [
      {
        kicker: "Pilotrapport",
        body: `${asNumber(pilot.templatesTotal, 0)} mallar totalt, ${asNumber(
          pilot.templatesWithActiveVersion,
          0
        )} aktiva och ${asNumber(pilot.evaluationsTotal, 0)} utvärderingar i valt fönster.`,
      },
      {
        kicker: "Riskläge",
        body: `${asNumber(ownerRisk.highCriticalOpen, 0)} hög/kritisk öppna. ${asNumber(
          pilot.ownerDecisionPending,
          0
        )} väntar på owner-beslut.`,
      },
      {
        kicker: "Incidentspår",
        body: `${asNumber(incidents.openUnresolved, 0)} öppna incidenter, ${asNumber(
          incidents.breachedOpen,
          0
        )} över SLA. ${mailReady ? "Mail-insikter redo." : "Mail-insikter väntar på ingest."} ${visibleThreads.length} trådar i ${mailboxScopeCount} mailboxscope.`,
      },
    ];
  }

  function renderAnalyticsRuntime() {
    const analytics = state.analyticsRuntime;

    if (analyticsStatus) {
      if (analytics.loading) {
        setFeedback(analyticsStatus, "loading", "Laddar live analytics…");
      } else if (analytics.error) {
        setFeedback(analyticsStatus, "error", analytics.error);
      } else {
        setFeedback(analyticsStatus, "", "");
      }
    }

    const cards = buildAnalyticsLiveCards();
    analyticsLiveCards.forEach((card) => {
      const metricKey = normalizeKey(card.dataset.analyticsLiveCard);
      const metric = cards[metricKey];
      if (!metric) return;

      const labelNode = card.querySelector("[data-analytics-live-label]");
      const trendNode = card.querySelector("[data-analytics-live-trend]");
      const valueNode = card.querySelector("[data-analytics-live-value]");
      const metaNode = card.querySelector("[data-analytics-live-meta]");

      if (labelNode) labelNode.textContent = metric.label;
      if (trendNode) {
        trendNode.textContent = metric.trend;
        trendNode.classList.toggle(
          "analytics-metric-trend-positive",
          metric.trendTone === "positive"
        );
        trendNode.classList.toggle(
          "analytics-metric-trend-negative",
          metric.trendTone !== "positive"
        );
      }
      if (valueNode) valueNode.textContent = metric.value;
      if (metaNode) metaNode.textContent = metric.meta;
    });

    if (analyticsLiveNarratives) {
      analyticsLiveNarratives.innerHTML = buildAnalyticsLiveNarratives()
        .map(
          (item) => `
            <article class="analytics-live-story">
              <span class="analytics-live-story-kicker">${escapeHtml(item.kicker)}</span>
              <p class="analytics-live-story-body">${escapeHtml(item.body)}</p>
            </article>
          `
        )
        .join("");
    }

    renderAnalyticsTrustNotes();
  }

  function buildAnalyticsAuthBlockedPeriodData(periodKey = state.selectedAnalyticsPeriod) {
    const fallback =
      ANALYTICS_PERIOD_DATA[normalizeKey(periodKey)] || ANALYTICS_PERIOD_DATA.week;
    return {
      metrics: {
        reply_time: {
          value: "Låst",
          trend: "Inloggning krävs",
          tone: "negative",
        },
        sla: {
          value: "Låst",
          trend: "Auth krävs",
          tone: "negative",
        },
        conversations: {
          value: "Låst",
          trend: "Ägarvy låst",
          tone: "negative",
        },
        csat: {
          value: "Låst",
          trend: "Ingen livebild",
          tone: "negative",
        },
      },
      self: {
        closed: "Låst",
        self_reply_time: "Låst",
        templates: "Låst",
        upsell: "Låst",
        upsell_count: "—",
        upsellCaption: "logga in för personlig analytics",
      },
      leaderboard: [
        {
          medal: "•",
          name: "Logga in för live-ranking",
          score: "Låst",
        },
      ],
      templates: Object.fromEntries(
        Object.entries(fallback.templates).map(([key, template]) => [
          key,
          {
            label: template.label,
            share: "Låst",
            width: "0%",
          },
        ])
      ),
      coaching: {
        label: "Inloggning krävs",
        copy:
          "Lower dashboard är spärrad tills analytics-källorna kan läsas med giltig admin-session.",
        action: "Logga in",
        target: "auth",
        templateTarget: "",
        disabled: false,
      },
    };
  }

  function renderAnalyticsTrustNotes(
    periodData = buildDerivedAnalyticsPeriodData(state.selectedAnalyticsPeriod)
  ) {
    const analytics = state.analyticsRuntime;
    const authRequired = analytics.authRequired === true;
    const authLocked = authRequired && !analytics.loaded;
    const partialAuth = authRequired && analytics.loaded;
    const leaderboardPlaceholder = normalizeKey(periodData?.leaderboard?.[0]?.name).includes(
      "ingen live-ranking ännu"
    );
    const authLeaderboardPlaceholder = normalizeKey(periodData?.leaderboard?.[0]?.name).includes(
      "logga in för live-ranking"
    );

    setTrustNote(
      analyticsTrustNotes.team,
      authLocked
        ? "Auth-låst: teamkortet visar inga fallback-KPI:er som om de vore live analytics."
        : partialAuth
          ? "Härledd från livekällor: KPI-raden bygger på live telemetry och aktivt scope. Vissa owner-källor kräver ny inloggning."
          : analytics.loaded
            ? "Härledd från livekällor: KPI-raden bygger på live telemetry, aktivt mailboxscope och runtime-kön."
            : "Fallback/vänteläge: KPI-raden väntar på första livebilden och ska inte läsas som analytics-sanning ännu.",
      authLocked || partialAuth ? "auth" : analytics.loaded ? "derived" : "fallback"
    );

    setTrustNote(
      analyticsTrustNotes.self,
      authLocked
        ? "Auth-låst: personlig analytics väntar på att admin-sessionen återställs."
        : partialAuth
          ? "Härledd från livekällor: din prestation följer samma live-scope som teamkortet, men owner-data är delvis auth-låst."
          : analytics.loaded
            ? "Härledd från livekällor: din prestation byggs från live telemetry och aktivt runtime-scope, inte från en separat self-feed."
            : "Fallback/vänteläge: självkortet väntar på en verifierad livebild.",
      authLocked || partialAuth ? "auth" : analytics.loaded ? "derived" : "fallback"
    );

    setTrustNote(
      analyticsTrustNotes.leaderboard,
      authLocked || authLeaderboardPlaceholder
        ? "Auth-låst: leaderboarden väntar på live-ranking med giltig admin-session."
        : leaderboardPlaceholder
          ? "Fallback/vänteläge: ingen separat live-ranking hittades, så ytan visar vänteläge i stället för statiska fallbacknamn."
          : "Härledd från livekällor: leaderboarden följer den ranking som finns i aktuell analytics-sammanställning.",
      authLocked || authLeaderboardPlaceholder
        ? "auth"
        : leaderboardPlaceholder
          ? "fallback"
          : "derived"
    );

    setTrustNote(
      analyticsTrustNotes.templates,
      authLocked
        ? "Auth-låst: mallandelar visas inte som analytics-sanning utan giltig admin-session."
        : analytics.loaded
          ? "Härledd från livekällor: mallandelarna byggs från synligt scope och vald period, inte från en separat performance-feed."
          : "Fallback/vänteläge: mallandelar väntar på analytics-laddning innan de kan tolkas.",
      authLocked ? "auth" : analytics.loaded ? "derived" : "fallback"
    );

    setTrustNote(
      analyticsTrustNotes.coaching,
      authLocked
        ? "Auth-låst: coachningen väntar på att analytics-källorna kan läsas med giltig session."
        : partialAuth
          ? "Härledd från livekällor: coachningen bygger på live telemetry och scope, men vissa owner-källor är auth-låsta."
          : analytics.loaded
            ? "Härledd från livekällor: coachningen bygger på live telemetry och runtime-scope, inte från en separat coachingtjänst."
            : "Fallback/vänteläge: coachningen väntar på live analytics innan den kan tolkas som vägledning.",
      authLocked || partialAuth ? "auth" : analytics.loaded ? "derived" : "fallback"
    );
  }

  async function loadAnalyticsRuntime({ force = false } = {}) {
    if (!force && state.analyticsRuntime.loading) return;

    const requestId = state.analyticsRuntime.requestId + 1;
    state.analyticsRuntime.requestId = requestId;
    state.analyticsRuntime.loading = true;
    state.analyticsRuntime.authRequired = false;
    if (!state.analyticsRuntime.loaded) {
      state.analyticsRuntime.error = "";
    }
    renderAnalyticsRuntime();

    const days = getAnalyticsDaysForPeriod();
    const requests = [
      ["monitorMetrics", "/api/v1/monitor/metrics"],
      ["readiness", "/api/v1/monitor/readiness"],
      ["ownerDashboard", "/api/v1/dashboard/owner"],
      ["pilotReport", `/api/v1/reports/pilot?days=${days}`],
      ["riskSummary", "/api/v1/risk/summary"],
      ["incidentSummary", "/api/v1/incidents/summary"],
      ["mailInsights", "/api/v1/mail/insights"],
    ];

    const settled = await Promise.allSettled(
      requests.map(([, path]) => apiRequest(path))
    ).catch((error) => {
      throw error;
    });

    if (requestId !== state.analyticsRuntime.requestId) return;

    let successCount = 0;
    const nextValues = {};
    const failures = [];
    let hasAuthFailure = false;

    settled.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === "fulfilled") {
        nextValues[key] = result.value;
        successCount += 1;
        return;
      }
      nextValues[key] = state.analyticsRuntime[key] || null;
      const statusCode = Number(result.reason?.statusCode || result.reason?.status || 0);
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason || "");
      if (isAuthFailure(statusCode, message)) {
        hasAuthFailure = true;
      }
      failures.push(result.reason);
    });

    if (!successCount && !state.analyticsRuntime.loaded) {
      const firstFailure = failures[0];
      const message =
        firstFailure instanceof Error ? firstFailure.message : "Kunde inte läsa live analytics.";
      const statusCode = Number(firstFailure?.statusCode || firstFailure?.status || 0);
      state.analyticsRuntime.loading = false;
      state.analyticsRuntime.authRequired = hasAuthFailure;
      state.analyticsRuntime.error = isAuthFailure(statusCode, message)
        ? "Inloggning krävs för analytics i nya CCO."
        : message;
      renderAnalyticsRuntime();
      renderAnalyticsPeriod();
      return;
    }

    state.analyticsRuntime.loading = false;
    state.analyticsRuntime.loaded = true;
    state.analyticsRuntime.authRequired = hasAuthFailure;
    state.analyticsRuntime.partial = failures.length > 0;
    state.analyticsRuntime.lastLoadedAt = new Date().toISOString();
    Object.assign(state.analyticsRuntime, nextValues);
    state.analyticsRuntime.error =
      failures.length > 0
        ? hasAuthFailure
          ? "Vissa analytics-källor kräver inloggning. Visar senaste kompletta livebild där det går."
          : "Vissa analytics-källor kunde inte läsas. Visar senaste kompletta livebild."
        : "";
    renderAnalyticsRuntime();
    renderAnalyticsPeriod();
  }

  function buildDerivedAnalyticsPeriodData(periodKey = state.selectedAnalyticsPeriod) {
    const fallback =
      ANALYTICS_PERIOD_DATA[normalizeKey(periodKey)] || ANALYTICS_PERIOD_DATA.week;
    if (state.analyticsRuntime.authRequired && !state.analyticsRuntime.loaded) {
      return buildAnalyticsAuthBlockedPeriodData(periodKey);
    }
    if (!state.analyticsRuntime.loaded) return fallback;

    const visibleThreads = getQueueScopedRuntimeThreads();
    const conversationCount = Math.max(
      visibleThreads.length,
      asNumber(state.analyticsRuntime.pilotReport?.kpis?.evaluationsTotal, 0)
    );
    const totalMessages = visibleThreads.reduce(
      (sum, thread) =>
        sum +
        Math.max(
          1,
          asArray(thread?.messages).length || asArray(thread?.historyEvents).length || 1
        ),
      0
    );
    const vipCount = visibleThreads.filter((thread) => thread?.isVIP).length;
    const readinessScore = asNumber(state.analyticsRuntime.readiness?.score, 0);
    const p95Ms = asNumber(state.analyticsRuntime.monitorMetrics?.latency?.p95Ms, 0);
    const riskOpen =
      asNumber(state.analyticsRuntime.riskSummary?.totals?.highCriticalOpen, 0) ||
      asNumber(state.analyticsRuntime.ownerDashboard?.riskSummary?.totals?.highCriticalOpen, 0);
    const ownerPending =
      asNumber(state.analyticsRuntime.pilotReport?.kpis?.ownerDecisionPending, 0) ||
      asNumber(state.analyticsRuntime.ownerDashboard?.riskSummary?.totals?.ownerDecisionPending, 0);
    const incidentOpen =
      asNumber(state.analyticsRuntime.incidentSummary?.totals?.openUnresolved, 0) ||
      asNumber(state.analyticsRuntime.ownerDashboard?.incidents?.summary?.totals?.openUnresolved, 0);
    const macrosCount = state.macros.length || getFallbackMacroCards().length;
    const templateBase = Math.max(1, macrosCount * 5);
    const templateUsagePercent = Math.min(
      99,
      Math.max(42, Math.round((asNumber(state.analyticsRuntime.pilotReport?.kpis?.templatesWithActiveVersion, 0) / templateBase) * 100) || 0)
    );
    const replyMinutes = Math.max(18, Math.round((p95Ms || 6600000) / 60000));
    const replyHours = Math.floor(replyMinutes / 60);
    const replyRemainderMinutes = replyMinutes % 60;
    const replyTimeLabel = `${replyHours}h ${String(replyRemainderMinutes).padStart(2, "0")}m`;
    const slaValue = `${Math.min(99, Math.max(72, Math.round(readinessScore || 88)))}%`;
    const csatScore = (
      4 +
      Math.min(0.9, Math.max(0.1, readinessScore / 1000 + (vipCount ? 0.18 : 0.12)))
    ).toFixed(1);
    const upsellValue = Math.max(
      1200,
      vipCount * 1400 + ownerPending * 350 + Math.round(conversationCount * 45)
    );
    const bookingCount = visibleThreads.filter((thread) => {
      const text = normalizeKey(
        `${thread?.subject || ""} ${thread?.statusLabel || ""} ${thread?.nextActionLabel || ""}`
      );
      return text.includes("bok") || text.includes("tid") || text.includes("ready");
    }).length;
    const pricingCount = visibleThreads.filter((thread) => {
      const text = normalizeKey(
        `${thread?.subject || ""} ${thread?.preview || ""} ${thread?.nextActionSummary || ""}`
      );
      return text.includes("pris") || text.includes("price") || text.includes("kost");
    }).length;
    const rescheduleCount = visibleThreads.filter((thread) => {
      const text = normalizeKey(
        `${thread?.subject || ""} ${thread?.followUpLabel || ""} ${asArray(thread?.tags).join(" ")}`
      );
      return text.includes("ombok") || text.includes("later") || text.includes("followup");
    }).length;
    const templateCounts = {
      booking_confirmation: bookingCount,
      pricing: pricingCount,
      reschedule: rescheduleCount,
    };
    const templateCountTotal = Object.values(templateCounts).reduce((sum, value) => sum + value, 0);
    const templateRows = Object.fromEntries(
      Object.entries(templateCounts).map(([key, count]) => {
        const fallbackRow = fallback.templates[key];
        const share =
          templateCountTotal > 0 ? Math.round((count / Math.max(templateCountTotal, 1)) * 100) : 0;
        return [
          key,
          {
            label: fallbackRow.label,
            share: `${share}%`,
            width:
              templateCountTotal > 0 ? `${Math.min(92, Math.max(26, share || 12))}%` : "0%",
          },
        ];
      })
    );

    const medalByIndex = ["🏆", "🥈", "🥉"];
    const leaderboardCandidates = asArray(
      state.analyticsRuntime.ownerDashboard?.leaderboard ||
        state.analyticsRuntime.ownerDashboard?.owners ||
        state.analyticsRuntime.pilotReport?.leaderboard ||
        state.analyticsRuntime.pilotReport?.owners
    )
      .map((item) => ({
        name:
          asText(item?.name) ||
          asText(item?.ownerName) ||
          asText(item?.label) ||
          "Operatör",
        score:
          asNumber(item?.score, 0) ||
          asNumber(item?.resolvedCount, 0) ||
          asNumber(item?.conversationCount, 0) ||
          asNumber(item?.handled, 0),
      }))
      .filter((item) => normalizeText(item.name));
    const leaderboard =
      leaderboardCandidates.length > 0
        ? leaderboardCandidates.slice(0, 3).map((item, index) => ({
            medal: medalByIndex[index] || "•",
            name: item.name,
            score: String(item.score || item.score === 0 ? item.score : "0"),
          }))
        : [
            {
              medal: "•",
              name: "Ingen live-ranking ännu",
              score: "Väntar",
            },
          ];

    const coachingAction =
      ownerPending > 0
        ? "Öppna historik"
        : riskOpen > 0 || incidentOpen > 0
          ? "Visa riskläge"
          : "Öppna mallbibliotek";
    const coachingCopy =
      ownerPending > 0
        ? `${ownerPending} ärenden väntar på owner-beslut i live-läget. Prioritera tydliga nästa steg för att minska kötrycket.`
        : riskOpen > 0 || incidentOpen > 0
          ? `Live-datan visar ${riskOpen} riskärenden och ${incidentOpen} öppna incidenter. Fokusera på guardrails och svarstid i samma scope.`
          : `Readiness ligger på ${slaValue} och ${conversationCount} konversationer syns i aktivt scope. Använd mallar och makron för att hålla tempot stabilt.`;

    return {
      metrics: {
        reply_time: {
          value: replyTimeLabel,
          trend: p95Ms ? `${formatAnalyticsLatency(p95Ms)} p95` : fallback.metrics.reply_time.trend,
          tone: p95Ms && p95Ms <= 7200000 ? "positive" : "negative",
        },
        sla: {
          value: slaValue,
          trend:
            ownerPending > 0
              ? `${ownerPending} väntar`
              : incidentOpen > 0
                ? `${incidentOpen} incidenter`
                : "Stabil",
          tone: ownerPending > 0 || incidentOpen > 0 ? "negative" : "positive",
        },
        conversations: {
          value: String(conversationCount),
          trend: `${visibleThreads.length} live`,
          tone: "positive",
        },
        csat: {
          value: `${csatScore}/5`,
          trend: vipCount > 0 ? `${vipCount} VIP` : "Blandat inflöde",
          tone: "positive",
        },
      },
      self: {
        closed: String(Math.max(visibleThreads.length, conversationCount)),
        self_reply_time: replyTimeLabel,
        templates: `${templateUsagePercent}%`,
        upsell: `${upsellValue.toLocaleString("sv-SE")} kr`,
        upsell_count: String(Math.max(1, vipCount + Math.round(ownerPending / 2))),
        upsellCaption: ownerPending > 0 ? "möjlig intäkt i väntläge" : "live-potential i scope",
      },
      leaderboard,
      templates: templateRows,
      coaching: {
        label: ownerPending > 0 ? "Coachningsinsikt" : fallback.coaching.label,
        copy: coachingCopy,
        action: coachingAction,
        target:
          ownerPending > 0
            ? "history"
            : riskOpen > 0 || incidentOpen > 0
              ? "risk"
              : "templates",
        templateTarget: "payment_reminder",
      },
    };
  }

  function renderAnalyticsPeriod() {
    const periodData = buildDerivedAnalyticsPeriodData(state.selectedAnalyticsPeriod);

    analyticsMetricValueNodes.forEach((node) => {
      const metric = periodData.metrics[node.dataset.analyticsMetricValue];
      if (metric) {
        node.textContent = metric.value;
      }
    });

    analyticsMetricTrendNodes.forEach((node, index) => {
      const key = index === 0 ? "reply_time" : index === 1 ? "sla" : "csat";
      const metric = periodData.metrics[key];
      if (!metric || !metric.trend) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.textContent = metric.trend;
      node.classList.toggle("analytics-metric-trend-positive", metric.tone === "positive");
      node.classList.toggle("analytics-metric-trend-negative", metric.tone !== "positive");
    });

    analyticsSelfValueNodes.forEach((node) => {
      const key = node.dataset.analyticsSelfValue;
      const value = periodData.self[key];
      if (value !== undefined) {
        node.textContent = value;
      }
    });

    analyticsSelfCaptionNodes.forEach((node) => {
      const key = node.dataset.analyticsSelfCaption;
      const value = periodData.self[`${key}Caption`];
      if (value !== undefined) {
        node.textContent = value;
      }
    });

    analyticsLeaderboardRows.forEach((row) => {
      const item = periodData.leaderboard[Number(row.dataset.analyticsLeaderboardRow) || 0];
      row.hidden = !item;
      row.setAttribute("aria-hidden", item ? "false" : "true");
      if (!item) return;
      const badge = row.querySelector("div span");
      const name = row.querySelector("div strong");
      const score = row.querySelector("b");
      if (badge) badge.textContent = item.medal;
      if (name) name.textContent = item.name;
      if (score) score.textContent = item.score;
    });

    analyticsTemplateRows.forEach((row) => {
      const template = periodData.templates[row.dataset.analyticsTemplateRow];
      if (!template) return;
      const title = row.querySelector(".analytics-template-row-head strong");
      const share = row.querySelector(".analytics-template-row-head span");
      const bar = row.querySelector(".analytics-template-bar span");
      if (title) title.textContent = template.label;
      if (share) share.textContent = template.share;
      if (bar) bar.style.width = template.width;
    });

    if (analyticsCoachingLabel) {
      analyticsCoachingLabel.textContent = periodData.coaching.label;
    }
    if (analyticsCoachingCopy) {
      analyticsCoachingCopy.textContent = periodData.coaching.copy;
    }
    if (analyticsCoachingAction) {
      analyticsCoachingAction.textContent = periodData.coaching.action;
      analyticsCoachingAction.disabled = periodData.coaching.disabled === true;
    }

    renderAnalyticsTrustNotes(periodData);
  }

  function renderAutomationTrustNotes() {
    const authRequired = state.automationRuntime.authRequired === true;

    setTrustNote(
      automationTrustNotes.global,
      authRequired
        ? "Auth-låst: live save, test och aktivering kräver ny admin-session. Buildern och senaste läsbara versioner kan fortfarande granskas."
        : "Livekälla: spara, testkör och versionsspår går mot templatesystemet. Builder, analys och autopilot innehåller också shell-lokala ytor.",
      authRequired ? "auth" : "live"
    );
    setTrustNote(
      automationTrustNotes.analysis,
      "Shell-lokal: analyskort och copy är härledd UI tills en separat livekälla verifieras.",
      "fallback"
    );
    setTrustNote(
      automationTrustNotes.testing,
      authRequired
        ? "Auth-låst: Kör test kräver giltig admin-session. Hoppa över väntan förblir shell-lokal simulering även när auth saknas."
        : "Delad sanning: Kör test använder live evaluate. Hoppa över väntan är shell-lokal simulering för testing-vyn.",
      authRequired ? "auth" : "derived"
    );
    setTrustNote(
      automationTrustNotes.versioner,
      authRequired
        ? "Auth-låst: versionskort kan visa senaste läsbara livebild, men aktivering kräver ny inloggning."
        : "Livekälla: versionskort och aktivering läser och skriver till templatesystemets livehistorik.",
      authRequired ? "auth" : "live"
    );
    setTrustNote(
      automationTrustNotes.autopilot,
      "Shell-lokal: autopilotförslag, pending count och senaste optimeringar saknar separat livekälla.",
      "fallback"
    );

    if (automationRunButton && !automationRunButton.classList.contains("is-busy")) {
      automationRunButton.disabled = authRequired || state.automationRuntime.loading;
    }
    if (automationSaveButton && !automationSaveButton.classList.contains("is-busy")) {
      automationSaveButton.disabled = authRequired || state.automationRuntime.loading;
    }
    automationTestingActionButtons.forEach((button) => {
      if (normalizeKey(button.dataset.automationTestingAction) === "run") {
        button.disabled = authRequired || state.automationRuntime.loading;
      }
    });
    automationVersionCards.forEach((card) => {
      const versionKey = normalizeKey(card.dataset.automationVersion);
      const restoreButton = card.querySelector('[data-automation-version-action="restore"]');
      if (!restoreButton) return;
      if (authRequired || state.automationRuntime.loading) {
        restoreButton.disabled = true;
        return;
      }
      const isActiveVersion =
        versionKey &&
        versionKey !== "placeholder" &&
        versionKey === normalizeKey(state.automationRuntime.activeVersionIdByKey[state.selectedAutomationTemplate]);
      restoreButton.disabled = isActiveVersion;
    });
  }

  function renderAutomationTemplateConfig() {
    const template = getSelectedTemplateConfig();
    if (automationTitleHeading) automationTitleHeading.textContent = template.flowTitle;
    if (automationAnalysisTitle) automationAnalysisTitle.textContent = template.analysisTitle;
    if (automationTemplatesTitle) automationTemplatesTitle.textContent = template.templatesTitle;
    if (automationTestingTitle) automationTestingTitle.textContent = template.testingTitle;
    if (automationVersionsTitle) automationVersionsTitle.textContent = template.versionsTitle;
    if (automationAutopilotTitle) automationAutopilotTitle.textContent = template.autopilotTitle;

    const configValues = [template.testingConfig.customer, template.testingConfig.trigger, template.testingConfig.time];
    automationTestingConfigValues.forEach((node, index) => {
      if (configValues[index]) {
        node.textContent = configValues[index];
      }
    });

    automationNodes.forEach((node) => {
      const definition = template.nodes[normalizeKey(node.dataset.automationNode)];
      if (!definition) return;
      const title = node.querySelector("strong");
      const lines = Array.from(node.querySelectorAll("p"));
      if (title) title.textContent = definition.title;
      lines.forEach((line, index) => {
        line.innerHTML = definition.lines[index]
          ? definition.lines[index].replace(/: ([^:]+)$/, ': <b>$1</b>')
          : "";
      });
    });

    renderAutomationTrustNotes();
  }

  function renderAutomationTestingState() {
    const liveScenario =
      state.automationRuntime.lastEvaluationByKey[
        normalizeKey(state.selectedAutomationTemplate) || "churn_guard"
      ] || null;
    const scenario =
      liveScenario ||
      AUTOMATION_TEST_SCENARIOS[state.automationRuntime.testingScenario] ||
      AUTOMATION_TEST_SCENARIOS.baseline;

    if (automationTestingValidationTitle) {
      automationTestingValidationTitle.textContent = scenario.title;
    }
    if (automationTestingValidationList) {
      automationTestingValidationList.innerHTML = "";
      scenario.items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        automationTestingValidationList.appendChild(li);
      });
    }
    if (automationTestingLogList) {
      automationTestingLogList.innerHTML = "";
      scenario.log.forEach((entry) => {
        const article = document.createElement("article");
        article.className = `automation-testing-log-row is-${entry.tone}`;
        article.innerHTML = `<span>${entry.time}</span><div><strong>${entry.title}</strong>${
          entry.copy ? `<p>${entry.copy}</p>` : ""
        }</div>`;
        automationTestingLogList.appendChild(article);
      });
    }

    renderAutomationTrustNotes();
  }

  function renderAutomationSuggestions() {
    automationSuggestionCards.forEach((card) => {
      const key = normalizeKey(card.dataset.automationSuggestion);
      const dismissed = state.automationRuntime.dismissedSuggestionKeys.includes(key);
      card.hidden = dismissed;
      card.classList.toggle(
        "is-applied",
        state.automationRuntime.appliedSuggestionKeys.includes(key)
      );
    });
  }

  function renderAutomationAutopilot() {
    const pendingCount = Math.max(0, state.automationRuntime.autopilotPendingCount);
    if (automationAutopilotPendingLabel) {
      automationAutopilotPendingLabel.textContent = `Väntar på godkännande (${pendingCount})`;
    }

    automationAutopilotProposalCards.forEach((card) => {
      const key = normalizeKey(card.dataset.automationAutopilotProposal);
      const resolution = state.automationRuntime.autopilotResolved[key];
      const hidden = resolution === "approved" || resolution === "dismissed";
      card.hidden = hidden;
      card.classList.toggle("is-selected", !hidden && key === state.selectedAutomationAutopilotProposal);
      card
        .querySelectorAll("[data-automation-autopilot-action]")
        .forEach((button) => (button.disabled = !state.automationAutopilotEnabled));
    });

    if (automationAutopilotMetricCards[0]) {
      const node = automationAutopilotMetricCards[0].querySelector("strong");
      if (node) node.textContent = String(pendingCount);
    }
    if (automationAutopilotMetricCards[1]) {
      const node = automationAutopilotMetricCards[1].querySelector("strong");
      if (node) node.textContent = String(state.automationRuntime.autopilotAutoFixCount);
    }
    if (automationAutopilotMetricCards[2]) {
      const node = automationAutopilotMetricCards[2].querySelector("strong");
      if (node) node.textContent = state.automationRuntime.autopilotTimeSaved;
    }

    if (automationAutopilotRecentList) {
      automationAutopilotRecentList.innerHTML = "";
      state.automationRuntime.autopilotRecent.forEach((item) => {
        const article = document.createElement("article");
        article.className = "automation-autopilot-recent-item";
        article.innerHTML = `<div><strong>${item.title}</strong><p>${item.stamp}</p></div><span>${item.delta}</span>`;
        automationAutopilotRecentList.appendChild(article);
      });
    }

    if (automationAutopilotFootCards[0]) {
      automationAutopilotFootCards[0].querySelector("strong").textContent = String(
        47 + state.automationRuntime.autopilotApprovedCount
      );
    }
    if (automationAutopilotFootCards[1]) {
      automationAutopilotFootCards[1].querySelector("strong").textContent =
        state.automationRuntime.autopilotTimeSaved;
    }
    if (automationAutopilotFootCards[2]) {
      automationAutopilotFootCards[2].querySelector("strong").textContent =
        state.automationRuntime.autopilotPerformance;
    }

    renderAutomationTrustNotes();
  }

  function applyCustomerMerge(primaryKey, secondaryKeys, options = {}) {
    const normalizedPrimaryKey = normalizeKey(primaryKey);
    const secondary = asArray(secondaryKeys)
      .map((key) => normalizeKey(key))
      .filter((key) => key && key !== normalizedPrimaryKey);
    if (!normalizedPrimaryKey || !secondary.length) return false;

    const directoryMap = getCustomerDirectoryMap();
    const detailsMap = getCustomerDetailsMap();
    const primaryRecord = directoryMap[normalizedPrimaryKey];
    const primaryDetail = detailsMap[normalizedPrimaryKey];
    if (!primaryRecord || !primaryDetail) return false;

    const keepEmails = options.keepAllEmails !== false;
    const keepPhones = options.keepAllPhones !== false;
    const combineNotes = options.combineNotes !== false;

    secondary.forEach((secondaryKey) => {
      const secondaryRecord = directoryMap[secondaryKey];
      const secondaryDetail = detailsMap[secondaryKey];
      if (!secondaryRecord || !secondaryDetail) return;

      if (keepEmails) {
        primaryDetail.emails = mergeUniqueMailboxValues([
          ...asArray(primaryDetail.emails),
          ...asArray(secondaryDetail.emails),
        ]);
      }
      if (keepPhones && !primaryDetail.phone && secondaryDetail.phone) {
        primaryDetail.phone = secondaryDetail.phone;
      }
      primaryDetail.mailboxes = mergeUniqueTextValues([
        ...asArray(primaryDetail.mailboxes),
        ...asArray(secondaryDetail.mailboxes),
      ]);

      primaryRecord.vip = Boolean(primaryRecord.vip || secondaryRecord.vip);
      primaryRecord.duplicateCandidate = false;
      primaryRecord.emailCoverage = Math.max(
        Number(primaryRecord.emailCoverage || 0),
        primaryDetail.emails.length
      );
      primaryRecord.profileCount =
        Number(primaryRecord.profileCount || 1) +
        Number(secondaryRecord.profileCount || 1);
      primaryRecord.customerValue =
        Number(primaryRecord.customerValue || 0) + Number(secondaryRecord.customerValue || 0);
      primaryRecord.totalConversations =
        Number(primaryRecord.totalConversations || 0) +
        Number(secondaryRecord.totalConversations || 0);
      primaryRecord.totalMessages =
        Number(primaryRecord.totalMessages || 0) + Number(secondaryRecord.totalMessages || 0);

      state.customerRuntime.profileCounts[normalizedPrimaryKey] = Number(
        primaryRecord.profileCount || primaryDetail.emails.length || 1
      );
      state.customerRuntime.mergedInto[secondaryKey] = normalizedPrimaryKey;

      if (keepEmails) {
        delete state.customerPrimaryEmailByKey[secondaryKey];
      }
      if (combineNotes) {
        primaryRecord.duplicateCandidate = false;
      }
    });

    const preferredPrimaryEmail =
      normalizeText(options.primaryEmail) ||
      state.customerPrimaryEmailByKey[normalizedPrimaryKey] ||
      primaryDetail.emails[0] ||
      "";
    if (preferredPrimaryEmail) {
      state.customerPrimaryEmailByKey[normalizedPrimaryKey] = preferredPrimaryEmail;
    }
    primaryRecord.name = normalizeText(options.primaryName) || primaryRecord.name;
    if (normalizeText(options.primaryPhone)) {
      primaryDetail.phone = normalizeText(options.primaryPhone);
    }

    return true;
  }

  function applyCustomerIdentityPayload(payload = {}) {
    applyCustomerPersistedState(payload?.customerState || {});
    state.customerRuntime.identitySuggestionGroups =
      payload?.suggestionGroups && typeof payload.suggestionGroups === "object"
        ? cloneJson(payload.suggestionGroups)
        : {};
    state.customerRuntime.duplicateMetric = Math.max(
      0,
      Number(payload?.duplicateCount || 0)
    );
    ensureCustomerRuntimeProfilesFromLive();
    state.customerRuntime.loaded = true;
    state.customerRuntime.authRequired = false;
    state.customerRuntime.error = "";
    applyCustomerFilters();
  }

  async function persistCustomerIdentityAction(path, body, successMessage) {
    const payload = await apiRequest(path, {
      method: "POST",
      headers: {
        "x-idempotency-key": createIdempotencyKey(path.replace(/[^a-z0-9]+/gi, "-")),
      },
      body: {
        ...body,
        customerState: buildCustomerPersistPayload(),
      },
    });
    applyCustomerIdentityPayload(payload || {});
    if (successMessage) {
      setCustomersStatus(successMessage, "success");
    }
    return payload;
  }

  function splitCustomerProfileLocally(customerKey, emailToSplit) {
    const normalizedKey = normalizeKey(customerKey);
    const normalizedEmail = normalizeMailboxId(emailToSplit);
    if (!normalizedKey || !normalizedEmail) return "";

    const directoryMap = getCustomerDirectoryMap();
    const detailsMap = getCustomerDetailsMap();
    const record = directoryMap[normalizedKey];
    const detail = detailsMap[normalizedKey];
    if (!record || !detail) return "";

    const emails = asArray(detail.emails);
    const splitAlias = emails.find((entry) => normalizeMailboxId(entry) === normalizedEmail);
    if (!splitAlias || emails.length < 2) return "";

    const remainingEmails = emails.filter((entry) => normalizeMailboxId(entry) !== normalizedEmail);
    const splitShare = Math.max(1, Math.round(Number(record.totalConversations || 1) / emails.length));
    const splitMessages = Math.max(1, Math.round(Number(record.totalMessages || 1) / emails.length));
    const splitLtv = Math.max(0, Math.round(Number(record.customerValue || 0) / emails.length));
    const rootName = splitAlias.split("@")[0] || record.name;
    const normalizedName = rootName
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    detail.emails = remainingEmails;
    state.customerPrimaryEmailByKey[normalizedKey] =
      state.customerPrimaryEmailByKey[normalizedKey] &&
      remainingEmails.some(
        (entry) =>
          normalizeMailboxId(entry) ===
          normalizeMailboxId(state.customerPrimaryEmailByKey[normalizedKey])
      )
        ? state.customerPrimaryEmailByKey[normalizedKey]
        : remainingEmails[0] || "";

    record.profileCount = Math.max(1, Number(record.profileCount || emails.length) - 1);
    record.emailCoverage = remainingEmails.length;
    record.totalConversations = Math.max(
      1,
      Number(record.totalConversations || 1) - splitShare
    );
    record.totalMessages = Math.max(1, Number(record.totalMessages || 1) - splitMessages);
    record.customerValue = Math.max(0, Number(record.customerValue || 0) - splitLtv);
    record.duplicateCandidate = remainingEmails.length > 1;
    state.customerRuntime.profileCounts[normalizedKey] = Number(record.profileCount || 1);

    const newKeyBase = normalizeKey(normalizedName) || `${normalizedKey}_split`;
    let newKey = newKeyBase;
    let index = 2;
    while (directoryMap[newKey]) {
      newKey = `${newKeyBase}_${index}`;
      index += 1;
    }

    directoryMap[newKey] = {
      name: normalizedName || splitAlias,
      vip: false,
      emailCoverage: 1,
      duplicateCandidate: false,
      profileCount: 1,
      customerValue: splitLtv,
      totalConversations: splitShare,
      totalMessages: splitMessages,
    };
    detailsMap[newKey] = {
      emails: [splitAlias],
      phone: "",
      mailboxes: asArray(detail.mailboxes).slice(0, 1),
    };
    state.customerPrimaryEmailByKey[newKey] = splitAlias;
    state.customerRuntime.profileCounts[newKey] = 1;

    return newKey;
  }

  function handleCustomerCommand(commandKey) {
    const key = normalizeKey(commandKey);
    if (key === "bulk_merge") {
      setCustomerMergeOpen(true);
      setCustomersStatus("Massammanfoga öppnades med markerade profiler.", "loading");
      return;
    }
    if (key === "export") {
      const payload = {
        generatedAt: new Date().toISOString(),
        customers: getVisibleCustomerPoolKeys().map((customerKey) => ({
          ...getCustomerRecord(customerKey),
          emails: [...getCustomerDetail(customerKey).emails],
          mailboxes: [...getCustomerDetail(customerKey).mailboxes],
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cco-kunder-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      setCustomersStatus("Exporterade aktuell kundbild från nya CCO.", "success");
      return;
    }
    if (key === "import") {
      renderCustomerImportModal();
      setCustomerImportOpen(true);
      setCustomersStatus("Importpanelen öppnades i nya CCO.", "success");
      return;
    }
    if (key === "settings") {
      setCustomerSettingsOpen(true);
      setCustomersStatus("Inställningar för matchningsregler är öppnade.", "success");
    }
  }

  function setCustomerSuggestionsHidden(hidden) {
    state.customerSuggestionsHidden = Boolean(hidden);
    if (customerSuggestionsPanel) {
      customerSuggestionsPanel.classList.toggle("is-collapsed", state.customerSuggestionsHidden);
    }
    if (customerSuggestionsToggle) {
      customerSuggestionsToggle.textContent = state.customerSuggestionsHidden
        ? "Visa förslag"
        : "Dölj förslag";
      customerSuggestionsToggle.setAttribute(
        "aria-pressed",
        state.customerSuggestionsHidden ? "true" : "false"
      );
    }
  }

  async function handleAutomationPrimaryAction(actionKey, button) {
    const key = normalizeKey(actionKey);
    if (!button || !key) return;

    const flowLabel = getSelectedTemplateConfig().flowTitle;
    const idleLabel = key === "run" ? "Testkör" : "Spara";
    const busyLabel = key === "run" ? "Kör..." : "Sparar...";

    setButtonBusy(button, true, idleLabel, busyLabel);

    try {
      if (key === "run") {
        const { templateRecord, version } = await saveAutomationDraft();
        const payload = await apiRequest(
          `/api/v1/templates/${encodeURIComponent(templateRecord.id)}/versions/${encodeURIComponent(
            version.id
          )}/evaluate`,
          {
            method: "POST",
            headers: {
              "x-idempotency-key": createIdempotencyKey(
                `automation-evaluate-${normalizeKey(state.selectedAutomationTemplate)}`
              ),
            },
            body: {
              instruction: buildAutomationInstruction(state.selectedAutomationTemplate, "run"),
            },
          }
        );
        state.automationRuntime.lastEvaluationByKey[
          normalizeKey(state.selectedAutomationTemplate) || "churn_guard"
        ] = buildAutomationTestingStateFromEvaluation(
          payload?.version,
          payload?.variableValidation
        );
        state.automationRuntime.testingScenario = "run";
        renderAutomationTestingState();
        setAutomationSubnav("testing");
        await loadAutomationVersions(state.selectedAutomationTemplate, { createIfMissing: true });
        if (payload?.version?.id) {
          setSelectedAutomationVersion(payload.version.id);
        }
        setAutomationStatus(
          `Testkörningen av "${flowLabel}" utvärderades live och blev ${getAutomationDecisionLabel(
            payload?.version?.risk?.decision
          )}.`,
          getAutomationDecisionTone(payload?.version?.risk?.decision)
        );
        return;
      }

      const { version } = await saveAutomationDraft();
      setAutomationStatus(
        `Ändringarna i "${flowLabel}" sparades live som version v${Number(
          version?.versionNo || 0
        )}.`,
        "success"
      );
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.automationRuntime.authRequired = true;
        setAutomationStatus("Logga in igen i admin för att spara eller testköra automationen.", "error");
      } else {
        setAutomationStatus(error?.message || "Automationen kunde inte sparas live.", "error");
      }
      renderAutomationVersions();
    } finally {
      setButtonBusy(button, false, idleLabel, busyLabel);
      renderAutomationTrustNotes();
    }
  }

  function setAutomationCanvasScale(nextScale) {
    const clampedScale = Math.min(115, Math.max(85, Number(nextScale) || 100));
    state.automationScale = clampedScale;
    if (automationCanvasScaleReadout) {
      automationCanvasScaleReadout.textContent = `${clampedScale}%`;
    }
    if (automationShell) {
      automationShell.style.setProperty("--automation-flow-scale", String(clampedScale / 100));
    }
  }

  function setAutomationRailCollapsed(collapsed) {
    state.automationRailCollapsed = Boolean(collapsed);
    if (automationRail) {
      automationRail.classList.toggle("is-collapsed", state.automationRailCollapsed);
    }
    if (automationRailToggle) {
      automationRailToggle.textContent = state.automationRailCollapsed ? "+" : "×";
      automationRailToggle.setAttribute(
        "aria-label",
        state.automationRailCollapsed ? "Visa förslag" : "Stäng förslag"
      );
      automationRailToggle.setAttribute(
        "aria-pressed",
        state.automationRailCollapsed ? "true" : "false"
      );
    }
  }

  async function handleCustomerMergeAction(button, actionKey) {
    const primaryKey = normalizeKey(button.dataset.customerMergePrimaryKey);
    const secondaryKey = normalizeKey(button.dataset.customerMergeSecondaryKey);
    const cardId = buildCustomerSuggestionPairId(primaryKey, secondaryKey);
    if (!primaryKey || !secondaryKey) return;

    const normalizedAction = normalizeKey(actionKey);
    try {
      if (normalizedAction === "accept") {
        await persistCustomerIdentityAction(
          "/api/v1/cco/customers/identity/merge",
          {
            primaryKey,
            secondaryKeys: [secondaryKey],
            suggestionId: cardId,
          },
          "Profilerna sparades som sammanslagna i nya CCO."
        );
      } else {
        await persistCustomerIdentityAction(
          "/api/v1/cco/customers/identity/dismiss",
          {
            suggestionId: cardId,
          },
          "Förslaget markerades som inte samma och sparades."
        );
      }
      setSelectedCustomerIdentity(primaryKey);
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        window.location.assign(buildReauthUrl());
      } else {
        setCustomersStatus(
          error?.message || "Kunde inte uppdatera identitetsförslaget.",
          "error"
        );
      }
    }
  }

  function handleAnalyticsTemplateJump(targetTemplate) {
    setAppView("automation");
    setAutomationSubnav("mallar");
    if (targetTemplate) {
      setSelectedAutomationTemplate(targetTemplate);
    }
    setAutomationStatus("Öppnade mallbiblioteket från huvud-analys för att följa upp insikten.", "success");
  }

  function handleAnalyticsCoachingAction() {
    const coaching = buildDerivedAnalyticsPeriodData(state.selectedAnalyticsPeriod)?.coaching || {};
    const target = normalizeKey(coaching.target);

    if (target === "auth") {
      window.open(buildReauthUrl("analytics_auth"), "_blank", "noopener");
      return;
    }

    if (target === "history") {
      setAppView("conversations");
      applyFocusSection("history");
      setContextCollapsed(false);
      return;
    }

    if (target === "risk") {
      setAppView("conversations");
      applyFocusSection("conversation");
      setContextCollapsed(false);
      return;
    }

    handleAnalyticsTemplateJump(coaching.templateTarget || "payment_reminder");
  }

  function applyAutomationSuggestionAction(card, actionKey) {
    const key = normalizeKey(card?.dataset.automationSuggestion);
    if (!key) return;

    if (normalizeKey(actionKey) === "dismiss") {
      if (!state.automationRuntime.dismissedSuggestionKeys.includes(key)) {
        state.automationRuntime.dismissedSuggestionKeys.push(key);
      }
      renderAutomationSuggestions();
      setAutomationStatus("AI-förslaget avfärdades och builder-railen städades upp.", "success");
      return;
    }

    if (!state.automationRuntime.appliedSuggestionKeys.includes(key)) {
      state.automationRuntime.appliedSuggestionKeys.push(key);
    }

    if (key === "wait") {
      const waitNode = automationNodes.find(
        (node) => normalizeKey(node.dataset.automationNode) === "wait"
      );
      if (waitNode) {
        const title = waitNode.querySelector("strong");
        const line = waitNode.querySelector("p");
        if (title) title.textContent = "Vänta 2 dagar";
        if (line) line.innerHTML = "Varaktighet: <b>2d</b>";
      }
      setAutomationStatus("Väntesteget kortades till 2 dagar i buildern.", "success");
    } else if (key === "welcome") {
      setSelectedAutomationTemplate("vip_fast_track");
      setAutomationStatus("Förslaget kopplades till mallen VIP Fast Track.", "success");
    } else if (key === "assign") {
      setAutomationStatus("Felhantering markerades som nästa steg i automationens backlog.", "loading");
    } else if (key === "condition") {
      setAutomationStatus("Det dubbla e-poststeget markerades för sammanslagning i nästa save.", "success");
    }

    renderAutomationSuggestions();
  }

  function handleAutomationTestingAction(actionKey) {
    if (normalizeKey(actionKey) === "skip") {
      state.automationRuntime.testingScenario = "skip";
      renderAutomationTestingState();
      setAutomationStatus("Väntesteget hoppades över och fallback-spåret verifieras i testloggen.", "success");
      return;
    }

    const testingRunButton = automationTestingActionButtons.find(
      (button) => normalizeKey(button.dataset.automationTestingAction) === "run"
    );
    handleAutomationPrimaryAction("run", testingRunButton || automationRunButton).catch((error) => {
      console.warn("Automation testing-run misslyckades.", error);
    });
  }

  function handleAutomationAnalysisAction(actionKey) {
    const key = normalizeKey(actionKey);
    if (key === "optimize") {
      setAutomationSubnav("byggare");
      setSelectedAutomationNode("wait");
      setAutomationStatus("Flaskhals-steget är nu i fokus i byggaren för vidare optimering.", "success");
      return;
    }

    setAutomationSubnav("versioner");
    setSelectedAutomationVersion(getPreferredAutomationVersionId());
    setAutomationStatus("Versionsytan öppnades för att visa mer release- och diffkontext.", "loading");
  }

  async function handleAutomationVersionAction(versionKey, actionKey) {
    setSelectedAutomationVersion(versionKey);
    const version = getAutomationVersions().find(
      (item) => normalizeKey(item.id) === normalizeKey(versionKey)
    );
    if (normalizeKey(actionKey) === "restore") {
      if (!version?.id) {
        setAutomationStatus("Ingen liveversion finns att aktivera ännu.", "error");
        return;
      }
      try {
        const templateRecord = await ensureAutomationTemplateRecord(state.selectedAutomationTemplate, {
          createIfMissing: false,
        });
        if (!templateRecord) {
          throw new Error("Automationmallen hittades inte i templatesystemet.");
        }
        const payload = await apiRequest(
          `/api/v1/templates/${encodeURIComponent(templateRecord.id)}/versions/${encodeURIComponent(
            version.id
          )}/activate`,
          {
            method: "POST",
            headers: {
              "x-idempotency-key": createIdempotencyKey(
                `automation-activate-${normalizeKey(state.selectedAutomationTemplate)}`
              ),
            },
            body: {},
          }
        );
        await loadAutomationVersions(state.selectedAutomationTemplate, { createIfMissing: true });
        if (payload?.version?.id) {
          setSelectedAutomationVersion(payload.version.id);
        }
        setAutomationStatus(
          `Version v${Number(payload?.version?.versionNo || version.versionNo || 0)} aktiverades live.`,
          "success"
        );
      } catch (error) {
        if (isAuthFailure(error?.statusCode, error?.message)) {
          state.automationRuntime.authRequired = true;
          setAutomationStatus("Logga in igen i admin för att aktivera en liveversion.", "error");
        } else {
          setAutomationStatus(error?.message || "Kunde inte aktivera liveversionen.", "error");
        }
        renderAutomationVersions();
      }
      return;
    }
    if (normalizeKey(actionKey) === "compare") {
      setAutomationStatus(
        `Versionsjämförelsen för v${Number(version?.versionNo || 0)} visas nu från livehistoriken.`,
        "loading"
      );
      return;
    }
    setAutomationStatus(
      `Innehållet för v${Number(version?.versionNo || 0)} visas nu i versionsdetaljen.`,
      "success"
    );
  }

  function handleAutomationAutopilotAction(card, actionKey) {
    const key = normalizeKey(card?.dataset.automationAutopilotProposal);
    if (!key) return;
    const title = normalizeText(card.querySelector("h3")?.textContent) || "Autopilot-förslag";

    if (normalizeKey(actionKey) === "approve") {
      state.automationRuntime.autopilotResolved[key] = "approved";
      state.automationRuntime.autopilotPendingCount = Math.max(
        0,
        state.automationRuntime.autopilotPendingCount - 1
      );
      state.automationRuntime.autopilotAutoFixCount += 1;
      state.automationRuntime.autopilotApprovedCount += 1;
      state.automationRuntime.autopilotRecent.unshift({
        title,
        stamp: "Nu",
        delta: key === "reduce_sla" ? "+4%" : key === "error_handling" ? "Stabiliserat" : "+6%",
      });
      state.automationRuntime.autopilotRecent = state.automationRuntime.autopilotRecent.slice(0, 3);
      setAutomationStatus("Autopilot-förslaget godkändes och flyttades till senaste optimeringar.", "success");
    } else {
      state.automationRuntime.autopilotResolved[key] = "dismissed";
      state.automationRuntime.autopilotPendingCount = Math.max(
        0,
        state.automationRuntime.autopilotPendingCount - 1
      );
      setAutomationStatus("Autopilot-förslaget avfärdades och togs bort från väntelistan.", "success");
    }

    renderAutomationAutopilot();
    const nextVisible = automationAutopilotProposalCards.find((proposal) => !proposal.hidden);
    if (nextVisible) {
      setSelectedAutomationAutopilotProposal(nextVisible.dataset.automationAutopilotProposal);
    }
  }

  function toggleCustomerBatchSelection(customerKey) {
    const normalizedKey = normalizeKey(customerKey);
    if (!normalizedKey) return;
    const nextSelection = new Set(state.customerBatchSelection);
    if (nextSelection.has(normalizedKey)) {
      nextSelection.delete(normalizedKey);
    } else {
      nextSelection.add(normalizedKey);
    }
    state.customerBatchSelection = Array.from(nextSelection);
    renderCustomerBatchSelection();
  }

  async function handleCustomerDetailAction(actionKey) {
    const key = normalizeKey(actionKey);
    const detail = getCustomerDetail(state.selectedCustomerIdentity);
    if (key === "primary_email") {
      const emails = detail.emails;
      if (!emails.length) return;
      const currentIndex = Math.max(
        0,
        emails.indexOf(state.customerPrimaryEmailByKey[detail.key] || emails[0])
      );
      const nextEmail = emails[(currentIndex + 1) % emails.length];
      try {
        await persistCustomerIdentityAction(
          "/api/v1/cco/customers/identity/primary-email",
          {
            customerKey: detail.key,
            email: nextEmail,
          },
          `Primär e-post för ${detail.name} sparades i nya CCO.`
        );
        renderCustomerDetailTools();
      } catch (error) {
        if (isAuthFailure(error?.statusCode, error?.message)) {
          state.customerRuntime.authRequired = true;
          window.location.assign(buildReauthUrl());
        } else {
          setCustomersStatus(
            error?.message || `Kunde inte sätta primär e-post för ${detail.name}.`,
            "error"
          );
        }
      }
      return;
    }

    if (key === "merge_settings") {
      setCustomerMergeOpen(true);
      setCustomersStatus("Merge-val öppnades för den valda kunden.", "loading");
      return;
    }

    if (key === "split_profile") {
      const primaryEmail =
        state.customerPrimaryEmailByKey[detail.key] || detail.emails[0] || "";
      const splitOptions = detail.emails.filter(
        (email) => normalizeMailboxId(email) !== normalizeMailboxId(primaryEmail)
      );
      if (!splitOptions.length) {
        setCustomersStatus(`Profilen ${detail.name} har inget alias att dela ut ännu.`, "error");
        return;
      }
      setCustomerSplitOpen(true, detail.key);
      setCustomersStatus(`Split-vyn öppnades för ${detail.name}.`, "loading");
      return;
    }

    if (key === "toggle_batch") {
      toggleCustomerBatchSelection(detail.key);
      setCustomersStatus(
        state.customerBatchSelection.includes(detail.key)
          ? `${detail.name} lades till i batchurvalet.`
          : `${detail.name} togs bort från batchurvalet.`,
        "success"
      );
    }
  }

  async function confirmCustomerMerge() {
    const mergeKeys = getMergeSelectionKeys();
    if (mergeKeys.length < 2) {
      setFeedback(customerMergeFeedback, "error", "Markera minst två profiler att slå ihop.");
      return;
    }

    const primaryKey = state.customerMergePrimaryKey || mergeKeys[0];
    const secondaryKeys = mergeKeys.filter((key) => key !== primaryKey);
    const mergedParts = customerMergeOptionInputs
      .filter((input) => input.checked)
      .map((input) => normalizeText(input.closest("label")?.textContent))
      .filter(Boolean);

    setFeedback(customerMergeFeedback, "loading", "Sparar sammanslagningen…");
    setCustomersStatus("Massammanfogningen är genomförd i nya CCO.", "loading");
    try {
      await persistCustomerIdentityAction(
        "/api/v1/cco/customers/identity/merge",
        {
          primaryKey,
          secondaryKeys,
          options: {
            keepAllEmails: customerMergeOptionInputs.some(
              (input) => normalizeKey(input.dataset.customerMergeOption) === "emails" && input.checked
            ),
            keepAllPhones: customerMergeOptionInputs.some(
              (input) => normalizeKey(input.dataset.customerMergeOption) === "phones" && input.checked
            ),
            combineNotes: customerMergeOptionInputs.some(
              (input) => normalizeKey(input.dataset.customerMergeOption) === "notes" && input.checked
            ),
          },
        },
        "Massammanfogningen sparades i backend."
      );
      state.customerBatchSelection = [primaryKey];
      setSelectedCustomerIdentity(primaryKey);
      setFeedback(
        customerMergeFeedback,
        "success",
        `Profilerna slogs ihop. Behöll ${mergedParts.join(", ").toLowerCase() || "vald data"}.`
      );
      window.setTimeout(() => setCustomerMergeOpen(false), 240);
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        window.location.assign(buildReauthUrl());
      } else {
        setFeedback(
          customerMergeFeedback,
          "error",
          error?.message || "Kunde inte spara sammanslagningen."
        );
      }
    }
  }

  async function confirmCustomerSplit() {
    const sourceKey = normalizeKey(state.customerRuntime.splitSourceKey || state.selectedCustomerIdentity);
    const splitEmail = normalizeText(state.customerRuntime.splitEmail);
    if (!sourceKey || !splitEmail) {
      setFeedback(customerSplitFeedback, "error", "Välj en e-postadress att dela ut.");
      return;
    }

    setFeedback(customerSplitFeedback, "loading", "Sparar uppdelningen…");
    setCustomersStatus(`Skapade en separat profil för ${splitEmail}.`, "loading");
    try {
      const payload = await persistCustomerIdentityAction(
        "/api/v1/cco/customers/identity/split",
        {
          customerKey: sourceKey,
          email: splitEmail,
        },
        `Profilen för ${splitEmail} sparades som egen kundpost.`
      );
      setSelectedCustomerIdentity(normalizeKey(payload?.newKey) || sourceKey);
      setFeedback(
        customerSplitFeedback,
        "success",
        `${splitEmail} delades ut till en egen profil.`
      );
      window.setTimeout(() => setCustomerSplitOpen(false), 240);
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.customerRuntime.authRequired = true;
        window.location.assign(buildReauthUrl());
      } else {
        setFeedback(
          customerSplitFeedback,
          "error",
          error?.message || "Kunde inte dela upp profilen."
        );
      }
    }
  }

  function setMailboxAdminSignatureEditorHtml(html = "", { markAuto = false } = {}) {
    if (!mailboxAdminSignatureEditor) return;
    const safeHtml = sanitizeMailboxSignatureHtml(html) || buildMailboxAdminSignatureSeedHtml();
    mailboxAdminSignatureEditor.innerHTML = safeHtml;
    mailboxAdminSignatureEditor.dataset.autoHtml = markAuto ? safeHtml : "";
  }

  function syncMailboxAdminSignatureEditorFromFields({ force = false } = {}) {
    if (!mailboxAdminSignatureEditor) return;
    const nextHtml = buildMailboxAdminSignatureSeedHtml();
    const currentHtml = sanitizeMailboxSignatureHtml(mailboxAdminSignatureEditor.innerHTML || "");
    const lastAutoHtml = sanitizeMailboxSignatureHtml(
      mailboxAdminSignatureEditor.dataset.autoHtml || ""
    );
    if (force || !currentHtml || currentHtml === lastAutoHtml) {
      mailboxAdminSignatureEditor.innerHTML = nextHtml;
    }
    mailboxAdminSignatureEditor.dataset.autoHtml = nextHtml;
  }

  function renderMailboxAdminFormState() {
    const isEditing = Boolean(normalizeMailboxId(state.mailboxAdminEditingId));
    if (mailboxAdminFormTitle) {
      mailboxAdminFormTitle.textContent = isEditing ? "Redigera mailbox" : "Lägg till mailbox";
    }
    if (mailboxAdminResetButton) {
      mailboxAdminResetButton.hidden = !isEditing;
    }
    if (mailboxAdminSaveButton) {
      mailboxAdminSaveButton.textContent = isEditing ? "Spara mailbox" : "Lägg till mailbox";
    }
  }

  function resetMailboxAdminForm({ preserveFeedback = false } = {}) {
    state.mailboxAdminEditingId = "";
    if (mailboxAdminNameInput) mailboxAdminNameInput.value = "";
    if (mailboxAdminEmailInput) mailboxAdminEmailInput.value = "";
    if (mailboxAdminOwnerSelect) mailboxAdminOwnerSelect.value = "Fazli";
    if (mailboxAdminSignatureNameInput) mailboxAdminSignatureNameInput.value = "";
    if (mailboxAdminSignatureFullNameInput) mailboxAdminSignatureFullNameInput.value = "";
    if (mailboxAdminSignatureTitleInput) mailboxAdminSignatureTitleInput.value = "";
    syncMailboxAdminSignatureEditorFromFields({ force: true });
    renderMailboxAdminFormState();
    renderMailboxAdminList();
    if (!preserveFeedback) {
      setFeedback(mailboxAdminFeedback, "", "");
    }
  }

  function setMailboxAdminEditingMailbox(mailboxId = "") {
    const mailbox = findCustomMailboxDefinition(mailboxId);
    if (!mailbox) {
      resetMailboxAdminForm({ preserveFeedback: true });
      return;
    }
    state.mailboxAdminEditingId = mailbox.id;
    if (mailboxAdminNameInput) mailboxAdminNameInput.value = mailbox.label || "";
    if (mailboxAdminEmailInput) mailboxAdminEmailInput.value = mailbox.email || "";
    if (mailboxAdminOwnerSelect) {
      mailboxAdminOwnerSelect.value = mailbox.owner || "Team";
    }
    if (mailboxAdminSignatureNameInput) {
      mailboxAdminSignatureNameInput.value = mailbox.signature?.label || "";
    }
    if (mailboxAdminSignatureFullNameInput) {
      mailboxAdminSignatureFullNameInput.value = mailbox.signature?.fullName || "";
    }
    if (mailboxAdminSignatureTitleInput) {
      mailboxAdminSignatureTitleInput.value = mailbox.signature?.title || "";
    }
    const storedSignatureHtml = sanitizeMailboxSignatureHtml(mailbox.signature?.html || "");
    if (storedSignatureHtml) {
      setMailboxAdminSignatureEditorHtml(storedSignatureHtml, { markAuto: false });
    } else {
      syncMailboxAdminSignatureEditorFromFields({ force: true });
    }
    renderMailboxAdminFormState();
    renderMailboxAdminList();
    setFeedback(mailboxAdminFeedback, "", "");
  }

  function applyMailboxAdminSignatureCommand(command = "") {
    if (!mailboxAdminSignatureEditor || !command) return;
    mailboxAdminSignatureEditor.focus();
    if (typeof document.execCommand !== "function") return;
    document.execCommand(command, false, null);
  }

  async function handleMailboxAdminSave() {
    const mailboxName = normalizeText(mailboxAdminNameInput?.value);
    const mailboxEmail = normalizeText(mailboxAdminEmailInput?.value).toLowerCase();
    const ownerName = normalizeText(mailboxAdminOwnerSelect?.value) || "Team";
    const signatureLabel = normalizeText(mailboxAdminSignatureNameInput?.value);
    const signatureFullName = normalizeText(mailboxAdminSignatureFullNameInput?.value);
    const signatureTitle = normalizeText(mailboxAdminSignatureTitleInput?.value);
    const signatureHtml = sanitizeMailboxSignatureHtml(mailboxAdminSignatureEditor?.innerHTML || "");
    const mailboxLabel = mailboxName || deriveMailboxLabel(mailboxEmail);
    const editingId = normalizeMailboxId(state.mailboxAdminEditingId);
    if (!mailboxEmail || !mailboxEmail.includes("@")) {
      setFeedback(mailboxAdminFeedback, "error", "Ange en giltig mailboxadress.");
      return;
    }
    if (!mailboxLabel) {
      setFeedback(mailboxAdminFeedback, "error", "Ange ett namn för mailboxen.");
      return;
    }

    const existingMailboxes = getAvailableRuntimeMailboxes();
    if (
      existingMailboxes.some((item) => {
        const itemId = normalizeMailboxId(item.id);
        if (itemId === editingId) return false;
        return (
          normalizeMailboxId(item.email) === normalizeMailboxId(mailboxEmail) ||
          normalizeKey(item.label) === normalizeKey(mailboxLabel)
        );
      })
    ) {
      setFeedback(mailboxAdminFeedback, "error", "Mailboxen finns redan i listan.");
      return;
    }

    let mailboxId =
      editingId ||
      slugifyMailboxId(mailboxLabel) ||
      slugifyMailboxId(mailboxEmail) ||
      `mailbox-${Date.now()}`;
    const existingIds = new Set(existingMailboxes.map((item) => normalizeMailboxId(item.id)));
    if (!editingId && existingIds.has(mailboxId)) {
      let suffix = 2;
      let candidate = `${mailboxId}-${suffix}`;
      while (existingIds.has(candidate)) {
        suffix += 1;
        candidate = `${mailboxId}-${suffix}`;
      }
      mailboxId = candidate;
    }

    const mailbox = normalizeCustomMailboxDefinition({
      id: mailboxId,
      email: mailboxEmail,
      label: mailboxLabel,
      owner: ownerName,
      signature: {
        label: signatureLabel,
        fullName: signatureFullName,
        title: signatureTitle,
        html:
          signatureHtml ||
          buildDefaultMailboxSignatureHtml({
            label: mailboxLabel,
            email: mailboxEmail,
            fullName: signatureFullName,
            title: signatureTitle,
          }),
      },
    });
    const previousCustomMailboxes = state.customMailboxes.slice();
    if (editingId) {
      state.customMailboxes = state.customMailboxes.map((entry, index) => {
        const normalized = normalizeCustomMailboxDefinition(entry, index);
        return normalized?.id === editingId ? mailbox : entry;
      });
    } else {
      state.customMailboxes.push(mailbox);
    }
    const nextCustomMailboxes = state.customMailboxes;

    try {
      const payload = await apiRequest("/api/v1/cco/settings", {
        method: "PUT",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-mailbox-admin-save"),
        },
        body: buildSettingsPayloadFromState({
          customMailboxes: nextCustomMailboxes,
        }),
      });
      if (payload?.settings) {
        applySettingsViewState(payload.settings);
        state.settingsRuntime.loaded = true;
        state.settingsRuntime.lastLoadedAt = new Date().toISOString();
      } else {
        state.customMailboxes = nextCustomMailboxes;
        persistCustomMailboxes();
      }
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.settingsRuntime.authRequired = true;
        state.customMailboxes = previousCustomMailboxes;
        window.location.assign(buildReauthUrl());
        return;
      }
      state.customMailboxes = previousCustomMailboxes;
      setFeedback(
        mailboxAdminFeedback,
        "error",
        error?.message || "Kunde inte spara mailboxen."
      );
      return;
    }

    if (!workspaceSourceOfTruth.getSelectedMailboxIds().includes(mailbox.id)) {
      workspaceSourceOfTruth.setSelectedMailboxIds(
        workspaceSourceOfTruth.getSelectedMailboxIds().concat(mailbox.id)
      );
    }
    resetMailboxAdminForm({ preserveFeedback: true });
    ensureRuntimeMailboxSelection();
    ensureRuntimeSelection();
    renderMailboxAdminList();
    renderMailboxOptions();
    renderStudioShell();
    renderRuntimeConversationShell();
    setFeedback(
      mailboxAdminFeedback,
      "success",
      editingId
        ? `Mailboxen ${mailbox.label} uppdaterades.`
        : `Mailboxen ${mailbox.label} lades till.`
    );
  }

  function exitAuxViewToConversations({
    feedKey = "",
    threadId = "",
    statusNode = null,
    message = "",
    tone = "success",
    focusSection = "conversation",
    restoreContext = true,
  } = {}) {
    const normalizedFeed = normalizeKey(feedKey);
    if (threadId) {
      selectRuntimeThread(threadId);
    }
    if (normalizedFeed === "later" || normalizedFeed === "sent") {
      clearMailFeedSelection(normalizedFeed);
    }
    closeMailboxDropdowns();
    if (restoreContext) {
      setStudioOpen(false);
      setContextCollapsed(false);
    }
    setMoreMenuOpen(false);
    setAppView("conversations");
    applyFocusSection(focusSection);
    normalizeWorkspaceState();
    renderRuntimeConversationShell();
    if (statusNode && message) {
      setAuxStatus(statusNode, message, tone);
    }
  }

  function handleMailFeedCommand(commandKey) {
    const key = normalizeKey(commandKey);
    const activeFeedKey = state.view === "later" ? "later" : state.view === "sent" ? "sent" : "";
    const selectedFeedThread = activeFeedKey ? getSelectedMailFeedThread(activeFeedKey) : null;
    if (key === "resume") {
      exitAuxViewToConversations({
        feedKey: activeFeedKey,
        statusNode: laterStatus,
        message: "Den valda tråden återupptas nu i konversationsytan.",
        tone: "success",
        focusSection: "conversation",
        threadId: asText(selectedFeedThread?.id),
      });
      return;
    }
    if (key === "history") {
      exitAuxViewToConversations({
        feedKey: activeFeedKey,
        statusNode: sentStatus,
        message: "Historiken öppnades i fokusytan för det skickade spåret.",
        tone: "success",
        focusSection: "history",
        threadId: asText(selectedFeedThread?.id),
        restoreContext: false,
      });
      return;
    }
    if (state.view === "later") {
      exitAuxViewToConversations({
        feedKey: activeFeedKey,
        statusNode: laterStatus,
        message: "Du är tillbaka i konversationsytan.",
        tone: "success",
        focusSection: "conversation",
        threadId: asText(selectedFeedThread?.id),
      });
      return;
    }
    if (state.view === "sent") {
      exitAuxViewToConversations({
        feedKey: activeFeedKey,
        statusNode: sentStatus,
        message: "Du är tillbaka i inkorgen från skickat-vyn.",
        tone: "success",
        focusSection: "conversation",
        threadId: asText(selectedFeedThread?.id),
      });
      return;
    }
    exitAuxViewToConversations({ focusSection: "conversation" });
  }

  async function handleIntegrationToggle(integrationKey) {
    const key = normalizeKey(integrationKey);
    if (!key) return;
    if (state.integrationsRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return;
    }

    const record = getIntegrationRuntimeRecord(key);
    if (!record) return;

    state.integrationsRuntime.pendingKey = key;
    let feedbackMessage = "";
    let feedbackTone = "";
    renderIntegrations();
    try {
      const action = record.isConnected ? "disconnect" : "connect";
      const payload = await apiRequest(`/api/v1/cco/integrations/${key}/${action}`, {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey(`major-arcana-integration-${key}-${action}`),
        },
      });
      const nextRecord = payload?.integration
        ? {
            id: normalizeKey(payload.integration.id),
            category: normalizeKey(payload.integration.category) || record.category,
            isConnected: payload.integration.isConnected !== false,
            statusTone: normalizeKey(payload.integration.statusTone) || "idle",
            statusSummary: asText(payload.integration.statusSummary),
            watchLabel: asText(payload.integration.watchLabel),
            updatedAt: asText(payload.integration.updatedAt || payload.integration.configuredAt),
            configurable: payload.integration.configurable !== false,
            docsAvailable: payload.integration.docsAvailable !== false,
          }
        : null;
      if (nextRecord) {
        const currentRecords = asArray(state.integrationsRuntime.records).filter(
          (item) => normalizeKey(item?.id) !== key
        );
        currentRecords.push(nextRecord);
        state.integrationsRuntime.records = currentRecords;
        state.integrationsRuntime.loaded = true;
        state.integrationsRuntime.authRequired = false;
        state.integrationsRuntime.error = "";
        state.integrationsRuntime.partial = false;
      }
      feedbackMessage = nextRecord?.isConnected
          ? nextRecord.watchLabel || "Integrationen anslöts och är redo för uppföljning."
          : "Integrationen kopplades från utan att metadata togs bort.";
      feedbackTone = "success";
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.integrationsRuntime.authRequired = true;
        renderIntegrations();
        window.location.assign(buildReauthUrl());
        return;
      }
      feedbackMessage = error?.message || "Kunde inte uppdatera integrationskopplingen.";
      feedbackTone = "error";
    } finally {
      state.integrationsRuntime.pendingKey = "";
      renderIntegrations();
      if (feedbackMessage) {
        setAuxStatus(integrationsStatus, feedbackMessage, feedbackTone);
      }
    }
  }

  async function handleIntegrationCommand(commandKey) {
    const key = normalizeKey(commandKey);
    if (state.integrationsRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return;
    }

    if (key === "docs") {
      const docsWindow = window.open("", "_blank", "noopener");
      setAuxStatus(integrationsStatus, "Läser integrationsdocs…", "loading");
      try {
        const payload = await apiRequest("/api/v1/cco/integrations/docs");
        state.integrationsRuntime.docsPayload = payload;
        if (docsWindow) {
          docsWindow.document.open();
          docsWindow.document.write(buildIntegrationDocsHtml(payload));
          docsWindow.document.close();
        }
        setAuxStatus(integrationsStatus, "Integrationsdocs öppnades i ett nytt fönster.", "success");
      } catch (error) {
        if (docsWindow) docsWindow.close();
        if (isAuthFailure(error?.statusCode, error?.message)) {
          state.integrationsRuntime.authRequired = true;
          renderIntegrations();
          window.location.assign(buildReauthUrl());
          return;
        }
        setAuxStatus(
          integrationsStatus,
          error?.message || "Kunde inte läsa integrationsdokumentationen.",
          "error"
        );
      }
      return;
    }

    setAuxStatus(integrationsStatus, "Skickar enterprise-förfrågan…", "loading");
    try {
      const actor = await ensureIntegrationActorProfile();
      const payload = await apiRequest("/api/v1/cco/integrations/contact-sales", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-integration-sales"),
        },
        body: {
          name: actor.name,
          email: actor.email,
          message: buildIntegrationSalesMessage(),
        },
      });
      state.integrationsRuntime.lastSalesLeadAt =
        asText(payload?.createdAt) || new Date().toISOString();
      setAuxStatus(
        integrationsStatus,
        "Sales-förfrågan skickades från nya CCO och loggades i backend.",
        "success"
      );
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.integrationsRuntime.authRequired = true;
        renderIntegrations();
        window.location.assign(buildReauthUrl());
        return;
      }
      setAuxStatus(
        integrationsStatus,
        error?.message || "Kunde inte skicka sales-förfrågan.",
        "error"
      );
    }
  }

  async function handleMacroCommand(commandKey) {
    const key = normalizeKey(commandKey);
    if (key !== "create") return;
    if (state.macrosRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return;
    }
    setMacroModalOpen(true, { mode: "create" });
    setAuxStatus(macrosStatus, "Makromodalen är öppnad i nya CCO.", "success");
  }

  async function handleMacroCardAction(actionKey, macroKey) {
    const normalizedAction = normalizeKey(actionKey);
    const normalizedKey = normalizeKey(macroKey);
    const macro = state.macros.find((item) => normalizeKey(item.id || item.key) === normalizedKey);
    if (!macro) return;

    if (normalizedAction === "open") {
      setAppView("automation");
      setAutomationSubnav("byggare");
      setAuxStatus(
        macrosStatus,
        `Makrot "${macro.title}" öppnades i automationens arbetsyta.`,
        "success"
      );
      return;
    }

    if (state.macrosRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return;
    }

    if (normalizedAction === "edit") {
      setMacroModalOpen(true, {
        mode: "edit",
        macroId: macro.id || macro.key,
      });
      setAuxStatus(macrosStatus, `Makrot "${macro.title}" öppnades för redigering.`, "success");
      return;
    }

    if (normalizedAction === "delete") {
      openConfirmDialog("macro_delete", {
        macroTitle: macro.title,
        onConfirm: async () => {
          state.macrosRuntime.pendingAction = "delete";
          state.macrosRuntime.pendingMacroId = macro.id || macro.key;
          renderMacros();
          setFeedback(confirmFeedback, "loading", "Raderar makro…");
          try {
            const payload = await apiRequest(`/api/v1/cco/macros/${encodeURIComponent(macro.id)}`, {
              method: "DELETE",
              headers: {
                "x-idempotency-key": createIdempotencyKey(`major-arcana-macro-delete-${macro.id}`),
              },
            });
            if (payload?.deleted !== true) {
              throw new Error("Makrot kunde inte bekräftas som raderat.");
            }
            state.macros = state.macros.filter(
              (item) => normalizeKey(item.id || item.key) !== normalizedKey
            );
            renderShowcase();
            setConfirmDialogOpen(false);
            setAuxStatus(macrosStatus, `Makrot "${macro.title}" togs bort.`, "success");
          } catch (error) {
            if (isAuthFailure(error?.statusCode, error?.message)) {
              state.macrosRuntime.authRequired = true;
              renderMacros();
              window.location.assign(buildReauthUrl());
              return;
            }
            setFeedback(
              confirmFeedback,
              "error",
              error?.message || "Kunde inte radera makrot."
            );
          } finally {
            state.macrosRuntime.pendingAction = "";
            state.macrosRuntime.pendingMacroId = "";
            renderMacros();
          }
        },
      });
      return;
    }

    state.macrosRuntime.pendingAction = normalizedAction;
    state.macrosRuntime.pendingMacroId = macro.id || macro.key;
    renderMacros();

    try {
      if (normalizedAction === "run") {
        const payload = await apiRequest(`/api/v1/cco/macros/${encodeURIComponent(macro.id)}/run`, {
          method: "POST",
          headers: {
            "x-idempotency-key": createIdempotencyKey(`major-arcana-macro-run-${macro.id}`),
          },
        });
        if (payload?.macro) {
          const nextMacro = createMacroCardFromRecord(payload.macro, 0);
          state.macros = state.macros.map((item) =>
            normalizeKey(item.id || item.key) === normalizedKey ? nextMacro : item
          );
        }
        setAppView("conversations");
        applyStudioMode("reply");
        setStudioOpen(true);
        renderShowcase();
        setAuxStatus(macrosStatus, `Makrot "${macro.title}" kördes från nya CCO.`, "success");
      }
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.macrosRuntime.authRequired = true;
        renderMacros();
        window.location.assign(buildReauthUrl());
        return;
      }
      setAuxStatus(
        macrosStatus,
        error?.message || "Kunde inte uppdatera makrot.",
        "error"
      );
    } finally {
      state.macrosRuntime.pendingAction = "";
      state.macrosRuntime.pendingMacroId = "";
      renderMacros();
    }
  }

  async function saveSettingsRuntime(successMessage = "Inställningen sparades.") {
    if (state.settingsRuntime.authRequired && !getAdminToken()) {
      window.location.assign(buildReauthUrl());
      return false;
    }

    state.settingsRuntime.saving = true;
    state.settingsRuntime.error = "";
    renderSettings();
    let feedbackMessage = "";
    let feedbackTone = "";
    try {
      const payload = await apiRequest("/api/v1/cco/settings", {
        method: "PUT",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-settings-save"),
        },
        body: buildSettingsPayloadFromState(),
      });
      if (payload?.settings) {
        applySettingsViewState(payload.settings);
        state.settingsRuntime.loaded = true;
        state.settingsRuntime.lastLoadedAt = new Date().toISOString();
      }
      renderShowcase();
      feedbackMessage = successMessage;
      feedbackTone = "success";
      return true;
    } catch (error) {
      if (isAuthFailure(error?.statusCode, error?.message)) {
        state.settingsRuntime.authRequired = true;
        renderSettings();
        window.location.assign(buildReauthUrl());
        return false;
      }
      state.settingsRuntime.error = error?.message || "Kunde inte spara inställningarna.";
      renderSettings();
      return false;
    } finally {
      state.settingsRuntime.saving = false;
      renderSettings();
      if (feedbackMessage) {
        setAuxStatus(settingsStatus, feedbackMessage, feedbackTone);
      }
    }
  }

  function handleSettingsChoice(choiceKey, valueKey) {
    state.settingsRuntime.choices[normalizeKey(choiceKey)] = normalizeKey(valueKey);
    renderSettings();
    saveSettingsRuntime("Valet sparades i nya CCO.").catch((error) => {
      console.warn("Settings choice-save misslyckades.", error);
    });
  }

  function handleSettingsToggle(toggleKey, checked) {
    state.settingsRuntime.toggles[normalizeKey(toggleKey)] = Boolean(checked);
    renderSettings();
    saveSettingsRuntime("Inställningen sparades i nya CCO.").catch((error) => {
      console.warn("Settings toggle-save misslyckades.", error);
    });
  }

  async function handleSettingsAction(actionKey) {
    const key = normalizeKey(actionKey);
    if (key === "show_shortcuts") {
      setSelectedShowcaseFeature("command_palette");
      setAppView("showcase");
      setAuxStatus(showcaseStatus, "Kommandopaletten är nu i fokus i showcase-vyn.", "success");
      return;
    }
    if (key === "edit_profile") {
      setSettingsProfileModalOpen(true);
      setAuxStatus(settingsStatus, "Profilredigeringen öppnades i nya CCO.", "success");
      return;
    }
    if (key === "delete_account") {
      openConfirmDialog("delete_account_request", {
        onConfirm: async () => {
          state.settingsRuntime.saving = true;
          renderSettings();
          setFeedback(confirmFeedback, "loading", "Skickar raderingsbegäran…");
          try {
            const payload = await apiRequest("/api/v1/cco/settings/request-delete-account", {
              method: "POST",
              headers: {
                "x-idempotency-key": createIdempotencyKey("major-arcana-settings-delete-request"),
              },
              body: {},
            });
            state.settingsRuntime.deleteRequestedAt = asText(payload?.deleteRequestedAt);
            setConfirmDialogOpen(false);
            setAuxStatus(
              settingsStatus,
              "Kontot markerades för radering i backend och väntar på uppföljning.",
              "success"
            );
          } catch (error) {
            if (isAuthFailure(error?.statusCode, error?.message)) {
              state.settingsRuntime.authRequired = true;
              renderSettings();
              window.location.assign(buildReauthUrl());
              return;
            }
            state.settingsRuntime.error =
              error?.message || "Kunde inte flagga kontot för radering.";
            setFeedback(confirmFeedback, "error", state.settingsRuntime.error);
          } finally {
            state.settingsRuntime.saving = false;
            renderSettings();
          }
        },
      });
      return;
    }
  }

  function createPillIcon(iconKey) {
    const svgMarkup = PILL_ICON_SVGS[normalizeKey(iconKey)];
    if (!svgMarkup) return null;
    const icon = document.createElement("span");
    icon.className = "pill-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = svgMarkup;
    return icon;
  }

  function decorateStaticPills() {
    document.querySelectorAll("[data-pill-icon]").forEach((node) => {
      if (node.querySelector(".pill-icon")) return;
      const icon = createPillIcon(node.dataset.pillIcon);
      if (!icon) return;
      node.prepend(icon);
    });
  }

  function renderRuntimeFocusSignals() {
    renderSignalRows(focusSignalRows, []);
  }

  function deriveIntelVipStatus(thread) {
    if (thread?.isVIP) return "vip";
    const engagementScore = clamp(asNumber(thread?.raw?.customerSummary?.engagementScore, 0.42), 0, 1);
    if (engagementScore >= 0.72) return "high_value";
    if (engagementScore >= 0.54) return "loyal";
    return "standard";
  }

  function deriveIntelRelationshipSensitivity(thread) {
    if (!thread) return "medium";
    const tags = asArray(thread.tags);
    if (tags.includes("high-risk") || tags.includes("act-now")) return "high";
    if (tags.includes("sprint") || tags.includes("today")) return "medium";
    return "low";
  }

  function buildIntelJourneyEvents(thread) {
    const events = [];
    const historyItems = asArray(thread?.historyEvents);
    const firstEvent = historyItems[historyItems.length - 1];
    const latestEvent = historyItems[0];
    if (firstEvent?.recordedAt) {
      events.push({
        id: `${thread.id}-first-contact`,
        type: "contact",
        label: "Första kontakt",
        date: formatConversationTime(firstEvent.recordedAt),
        note: compactRuntimeCopy(firstEvent.detail || firstEvent.description, "Relation etablerad.", 72),
        tone: "neutral",
      });
    }
    if (asText(thread?.raw?.plannedTreatment || thread?.raw?.treatmentContext || thread?.raw?.medicalContext)) {
      events.push({
        id: `${thread.id}-treatment`,
        type: "treatment",
        label: asText(
          thread.raw.plannedTreatment || thread.raw.treatmentContext || thread.raw.medicalContext,
          "Behandlingsspår"
        ),
        date: thread.followUpLabel || thread.lastActivityLabel || "Nuvarande spår",
        note: compactRuntimeCopy(thread.riskReason || thread.nextActionSummary, "Följ klinikens plan för nästa steg.", 72),
        tone: "success",
      });
    }
    if (thread?.followUpLabel) {
      events.push({
        id: `${thread.id}-follow-up`,
        type: "follow_up",
        label: "Planerad uppföljning",
        date: thread.followUpLabel,
        note: compactRuntimeCopy(thread.nextActionSummary, "Följ upp kunden i rätt tid.", 72),
        tone: "warn",
      });
    }
    events.push({
      id: `${thread.id}-current-state`,
      type: "status",
      label: thread?.lifecycleLabel || "Aktiv dialog",
      date: latestEvent?.recordedAt ? formatConversationTime(latestEvent.recordedAt) : thread?.lastActivityLabel || "Nu",
      note: compactRuntimeCopy(thread?.whyInFocus, "Aktiv kundrelation i live-spåret.", 72),
        tone: asArray(thread?.tags).includes("high-risk") ? "warn" : "neutral",
    });
    return events.slice(0, 4);
  }

  function buildIntelHelperConversation(thread) {
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const customerSummary =
      raw.customerSummary && typeof raw.customerSummary === "object" ? raw.customerSummary : {};
    const recentTreatments = asArray(
      raw.recentTreatments || customerSummary.recentTreatments || raw.treatmentHistory || customerSummary.treatments
    )
      .map((entry) => asText(entry))
      .filter(Boolean)
      .slice(0, 4);
    const medicalFlags = asArray(raw.medicalFlags)
      .map((entry) => asText(entry))
      .filter(Boolean)
      .slice(0, 3);
    if (raw.needsMedicalReview === true || asArray(thread?.tags).includes("medical")) {
      medicalFlags.unshift("Medicinsk granskning");
    }
    if (asText(raw.dominantRisk)) {
      medicalFlags.push(humanizeCode(raw.dominantRisk, asText(raw.dominantRisk)));
    }
    return {
      ...raw,
      customerName: thread?.customerName,
      owner: thread?.ownerLabel,
      customerSince:
        asText(raw.customerSince) ||
        asText(customerSummary.customerSince) ||
        asText(asArray(thread?.historyEvents)[asArray(thread?.historyEvents).length - 1]?.recordedAt),
      lifecycleStage: asText(raw.lifecycleStage || customerSummary.lifecycleStatus || thread?.lifecycleLabel),
      journeyStage: asText(raw.journeyStage || raw.lifecycleStage || customerSummary.lifecycleStatus || thread?.lifecycleLabel),
      journeyEvents: buildIntelJourneyEvents(thread),
      vipStatus: asText(raw.vipStatus || customerSummary.vipStatus || deriveIntelVipStatus(thread)),
      lifetimeValue: asNumber(raw.lifetimeValue ?? customerSummary.lifetimeValue ?? customerSummary.totalValue, 0),
      relationshipSensitivity: asText(
        raw.relationshipSensitivity || customerSummary.relationshipSensitivity || deriveIntelRelationshipSensitivity(thread)
      ),
      duplicateState: asText(raw.duplicateState || customerSummary.duplicateState || "clear"),
      duplicateNote: asText(raw.duplicateNote || customerSummary.duplicateNote),
      consentStatus:
        raw.consentStatus && typeof raw.consentStatus === "object"
          ? raw.consentStatus
          : customerSummary.consentStatus && typeof customerSummary.consentStatus === "object"
            ? customerSummary.consentStatus
            : {},
      insuranceContext: asText(raw.insuranceContext || customerSummary.insuranceContext || thread?.mailboxesLabel),
      plannedTreatment: asText(raw.plannedTreatment || raw.caseType || raw.treatmentContext || raw.medicalContext),
      returnVisitState: asText(raw.returnVisitState || customerSummary.returnVisitState || thread?.lifecycleLabel),
      recentTreatments,
      medicalFlags: Array.from(new Set(medicalFlags)).slice(0, 3),
      treatmentContext: asText(raw.treatmentContext || raw.medicalContext || thread?.riskReason),
      customerContext: asText(raw.customerContext || customerSummary.lastCaseSummary || thread?.whyInFocus),
      followUpDeadline: thread?.followUpLabel,
      nextActionSummary: thread?.nextActionSummary,
      queueReason: thread?.whyInFocus,
      activeEditor: asText(raw.activeEditor || raw.ownerEditing),
      activeViewers: asArray(raw.activeViewers),
      collisionState: asText(raw.collisionState),
      draftOwner: asText(raw.draftOwner || raw.owner),
      draftUpdatedAt: asText(raw.draftUpdatedAt || raw.lastActionTakenAt || raw.lastOutboundAt || raw.lastInboundAt),
      handoffRequest: asText(raw.handoffRequest),
      handoffTarget: asText(raw.handoffTarget),
      handoffNote: asText(raw.handoffNote || raw.escalationRule),
      handoffStatusDetail: asText(raw.handoffStatusDetail || raw.escalationRule),
    };
  }

  function renderRuntimeConversationShell() {
    if (state.runtime?.pendingFullRefresh === true) {
      return;
    }
    ensureRuntimeSelection();
    renderRuntimeQueue();
    renderQueueCategoryStripMode();
    renderTruthWorklistView();
    ensureTruthWorklistViewLoaded({ force: false });
    renderQueueLaneShortcutRows(queueActionRows);
    renderQueueHistorySection();
    renderMailFeeds();
    renderThreadContextRows();
    const backgroundRefreshSelectedThreadId = asText(
      state.runtime?.backgroundRefreshSelectedThreadId
    );
    const shouldSkipFocusRefresh =
      state.runtime?.isBackgroundRefresh === true &&
      Boolean(backgroundRefreshSelectedThreadId) &&
      runtimeConversationIdsMatch(
        backgroundRefreshSelectedThreadId,
        workspaceSourceOfTruth.getSelectedThreadId()
      );
    const selectedThread = getSelectedRuntimeThread();
    const selectedFocusThread = getSelectedRuntimeFocusThread();
    if (!shouldSkipFocusRefresh) {
      syncSelectedCustomerIdentityForThread(selectedFocusThread || selectedThread);
      const focusReadState = getRuntimeFocusReadState(selectedFocusThread);
      const focusNotesHeading = document.querySelector(".focus-notes-head h3");
      if (focusNotesHeading) {
        focusNotesHeading.textContent = selectedFocusThread
          ? `Anteckningar för ${selectedFocusThread.customerName}`
          : state.runtime.authRequired
            ? "Anteckningar kräver inloggning"
            : "Anteckningar";
      }
      renderRuntimeFocusSignals(selectedFocusThread, focusReadState);
      const focusQuickActions = focusReadState.readOnly
        ? []
        : (() => {
              const base = [...FOCUS_ACTIONS];
              if (state.runtime.pendingGraphRestore && state.runtime.deleteEnabled) {
                base.push({
                  label: "Återställ",
                  tone: "compose",
                  action: "restore",
                  icon: "undo",
                });
              }
              return base;
            })();
      renderQuickActionRows(focusActionRows, focusQuickActions);
      renderRuntimeFocusConversation(selectedFocusThread, focusReadState);
      renderRuntimeCustomerPanel(selectedFocusThread, focusReadState);
      renderFocusHistorySection(selectedFocusThread, focusReadState);
      renderFocusNotesSection();
      renderQuickActionRows(intelActionRows, INTEL_ACTIONS);
      renderRuntimeIntel(selectedFocusThread, focusReadState);
    }
    renderStudioShell();
    renderWorkspaceRuntimeContext();
    renderAnalyticsRuntime();
    if (!shouldSkipFocusRefresh) {
      renderRuntimeIntel(selectedFocusThread, getRuntimeFocusReadState(selectedFocusThread));
    }
    const runtimeVisualState = syncRuntimeVisualStateMachine();
    const isPreviewReady =
      runtimeVisualState === "ready" ||
      runtimeVisualState === "offline_history" ||
      (state.runtime.hasReachedSteadyState === true && runtimeVisualState === "syncing");
    if (isPreviewReady) {
      document.body.classList.add("is-preview-ready");
    }
  }

  function isLaterRuntimeThread(thread) {
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const lastAction = normalizeKey(raw.lastActionTakenLabel || "");
    const nextAction = normalizeKey(thread?.nextActionLabel || raw.nextActionLabel || "");
    const waitingOn = normalizeKey(raw.waitingOn || "");
    return (
      asArray(thread?.tags).includes("later") ||
      lastAction.includes("svara senare") ||
      lastAction.includes("reply later") ||
      nextAction.includes("återuppta senare") ||
      nextAction.includes("resume later") ||
      (waitingOn === "owner" &&
        Boolean(asText(raw.followUpDueAt || raw.followUpSuggestedAt || thread?.followUpLabel)))
    );
  }

  function isSentRuntimeThread(thread) {
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const lastAction = normalizeKey(raw.lastActionTakenLabel || "");
    const lastOutboundAt = toIso(raw.lastOutboundAt || "");
    const lastInboundAt = toIso(raw.lastInboundAt || "");
    const historyContainsSent = asArray(thread?.historyEvents)
      .slice(0, 4)
      .some((event) => {
        const haystack = `${asText(event?.title)} ${asText(event?.description)}`.toLowerCase();
        return haystack.includes("e-post skickat") || haystack.includes("email sent");
      });
    return (
      lastAction.includes("svar skickat") ||
      lastAction.includes("reply sent") ||
      historyContainsSent ||
      (lastOutboundAt &&
        (!lastInboundAt || Date.parse(lastOutboundAt) >= Date.parse(lastInboundAt)))
    );
  }

  function isVerificationRuntimeThread(thread) {
    if (!thread || typeof thread !== "object") return false;
    if (thread.isVerificationThread === true) return true;
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const haystack = normalizeKey(
      [
        thread?.subject,
        thread?.displaySubject,
        thread?.preview,
        thread?.whyInFocus,
        thread?.nextActionSummary,
        raw?.subject,
        raw?.latestInboundPreview,
        raw?.riskStackExplanation,
        raw?.operatorCue,
      ]
        .map((value) => asText(value))
        .filter(Boolean)
        .join(" ")
    );
    if (!haystack) return false;
    return [
      /\bcco-next\b/i,
      /\bcco qa\b/i,
      /\bqa-trad\b/i,
      /\blive send inspect\b/i,
      /\bverifieringsmail\b/i,
      /\bkontrollerad cco\b/i,
      /\blive end-to-end verifiering\b/i,
      /\bend-to-end verifiering i nya cco\b/i,
      /\bkontrollerat live-test\b/i,
      /\blive-test\b/i,
    ].some((pattern) => pattern.test(haystack));
  }

  function isManualReviewRuntimeThread(thread) {
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const decisionCandidates = [
      raw?.risk?.decision,
      raw?.latestOutcome?.risk?.decision,
      raw?.latestReplyDraft?.risk?.decision,
      raw?.latestReplySuggestion?.risk?.decision,
      raw?.customerSummary?.risk?.decision,
      raw?.deliveryMode,
      raw?.latestOutcome?.deliveryMode,
      raw?.latestReplyDraft?.deliveryMode,
    ]
      .map((value) => normalizeKey(value))
      .filter(Boolean);

    if (
      decisionCandidates.some(
        (value) => value === "review_required" || value === "manual_review_required"
      )
    ) {
      return true;
    }

    const reviewFlagCandidates = [
      raw?.reviewRequired,
      raw?.needsReview,
      raw?.manualReviewRequired,
      raw?.latestOutcome?.reviewRequired,
      raw?.latestReplyDraft?.reviewRequired,
    ];
    return reviewFlagCandidates.some((value) => value === true);
  }

  function isUnclearRuntimeThread(thread) {
    const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
    const intentCandidates = [
      raw?.intent,
      raw?.latestOutcome?.intent,
      raw?.latestReplyDraft?.intent,
      raw?.latestAction?.intent,
      thread?.intentLabel,
    ]
      .map((value) => normalizeKey(value))
      .filter(Boolean);
    return intentCandidates.includes("unclear") || intentCandidates.includes("oklart");
  }

  function renderQuickActionRows(rows, items) {
    const selectedThread = getSelectedRuntimeThread();
    const isDeletingThread = Boolean(asText(state.runtime.deletingThreadId));
    rows.forEach((row) => {
      row.innerHTML = "";
      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `quick-action-pill quick-action-pill--${item.tone}`;
        button.dataset.quickAction = item.action;
        const isDeleteAction = item.action === "delete";
        const isRestoreAction = item.action === "restore";
        if (item.mode) {
          button.dataset.quickMode = item.mode;
        }
        if (item.target) {
          button.dataset.quickTarget = item.target;
        }
        if (isDeleteAction) {
          const deleteDisabled =
            !selectedThread || !state.runtime.deleteEnabled || isDeletingThread;
          button.disabled = deleteDisabled;
          button.setAttribute("aria-disabled", String(deleteDisabled));
        }
        if (isRestoreAction) {
          const restoreDisabled =
            !state.runtime.pendingGraphRestore ||
            !state.runtime.deleteEnabled ||
            state.runtime.restoringMail === true;
          button.disabled = restoreDisabled;
          button.setAttribute("aria-disabled", String(restoreDisabled));
        }
        const icon = createPillIcon(item.icon);
        if (icon) button.appendChild(icon);
        button.appendChild(
          document.createTextNode(
            isDeleteAction && isDeletingThread
              ? "Raderar…"
              : isRestoreAction && state.runtime.restoringMail
                ? "Återställer…"
                : item.label
          )
        );
        row.appendChild(button);
      });
    });
  }

  function renderQueueLaneShortcutRows(rows) {
    const selectedThread = getSelectedRuntimeThread();
    const isDeletingThread = Boolean(asText(state.runtime.deletingThreadId));
    const runtimeMode = normalizeKey(state.runtime.mode || "");
    const leftColumnState = getRuntimeLeftColumnState();
    const shouldHideShortcutRows =
      runtimeMode === "offline_history" ||
      !hasRuntimeQueueThreads() &&
      (state.runtime.loading === true ||
        state.runtime.authRequired === true ||
        Boolean(asText(state.runtime.error)));
    const activeLaneId = normalizePrimaryQueueLaneId(state.runtime.activeLaneId || "all");
    const activeViewLaneId = normalizeKey(
      leftColumnState.mode === "lane" ? leftColumnState.laneId || activeLaneId || "all" : activeLaneId
    ) || "all";
    const activeFeedKey = normalizeKey(leftColumnState.feedKey || "");
    const isFeedViewActive = leftColumnState.mode === "feed" && Boolean(activeFeedKey);
    const isHistoryViewActive = leftColumnState.mode === "history";
    const activeLaneLabel = isHistoryViewActive
      ? "Historik"
      : isFeedViewActive
        ? activeFeedKey === "sent"
          ? "Skickade"
          : activeFeedKey
        : QUEUE_LANE_LABELS[activeViewLaneId] || QUEUE_LANE_LABELS.all;
    const shortcutActions = QUEUE_ACTIONS.filter(
      (item) => item.action === "handled" || item.action === "delete"
    );

    rows.forEach((row) => {
      row.hidden = shouldHideShortcutRows;
      const labelNode = row.querySelector("[data-queue-active-lane-label]");
      const strip = row.querySelector("[data-queue-action-strip]");
      if (!strip) return;
      if (shouldHideShortcutRows) {
        if (labelNode) labelNode.textContent = "";
        strip.innerHTML = "";
        return;
      }
      if (labelNode) {
        const activeLabelSource = isHistoryViewActive
          ? queueHistoryToggle
          : isFeedViewActive
            ? queueViewJumpButtons.find(
                (button) => normalizeKey(button.dataset.queueViewJump || "") === activeFeedKey
              ) || null
          : queueLaneButtons.find(
              (button) => normalizeKey(button.dataset.queueLane || "all") === activeViewLaneId
            ) ||
            queueLaneButtons.find(
              (button) => normalizeKey(button.dataset.queueLane || "all") === "all"
            ) ||
            null;
        const activeLaneIcon = activeLabelSource?.querySelector("svg")?.cloneNode(true) || null;
        labelNode.textContent = "";
        labelNode.style.color = activeLabelSource
          ? window.getComputedStyle(activeLabelSource).color
          : "";
        if (activeLaneIcon) {
          activeLaneIcon.setAttribute("aria-hidden", "true");
          labelNode.appendChild(activeLaneIcon);
        }
        labelNode.appendChild(document.createTextNode(activeLaneLabel));
      }
      strip.innerHTML = "";
      shortcutActions.forEach((item) => {
        const button = document.createElement("button");
        const isDeleteAction = item.action === "delete";
        const isHandledAction = item.action === "handled";
        button.type = "button";
        button.className = `queue-history-head-action queue-history-head-action--${isDeleteAction ? "delete" : "done"}`;
        button.dataset.quickAction = item.action;
        button.setAttribute("aria-label", item.label);
        button.setAttribute("title", item.label);
        const shortcutDisabled =
          !selectedThread ||
          (isDeleteAction &&
            (!state.runtime.deleteEnabled || isDeletingThread)) ||
          (isHandledAction && isHandledRuntimeThread(selectedThread));
        button.disabled = shortcutDisabled;
        button.setAttribute("aria-disabled", String(shortcutDisabled));
        const icon = isHandledAction
          ? (() => {
              const wrapper = document.createElement("span");
              wrapper.className = "pill-icon";
              wrapper.setAttribute("aria-hidden", "true");
              wrapper.innerHTML =
                '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4 6.6 11.2l5.8-6.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>';
              return wrapper;
            })()
          : createPillIcon(item.icon);
        if (icon) button.appendChild(icon);
        strip.appendChild(button);
      });
    });
  }

  function renderQueueCategoryStripMode() {
    if (!queueScopeStrip || !queueCollapsedList || !queueCategoryToggleButton) return;
    const isCompact = state.runtime?.queueCategoriesCompact === true;
    queueScopeStrip.classList.toggle("is-compact", isCompact);
    queueCategoryToggleButton.classList.toggle("is-compact", isCompact);
    queueCategoryToggleButton.setAttribute("aria-pressed", isCompact ? "true" : "false");
    queueCategoryToggleButton.setAttribute("aria-expanded", isCompact ? "false" : "true");
    queueCategoryToggleButton.setAttribute(
      "aria-label",
      isCompact ? "Visa full storlek" : "Visa kompakt läge"
    );
    queueCategoryToggleButton.setAttribute(
      "title",
      isCompact ? "Visa full storlek" : "Visa kompakt läge"
    );
    const iconHost = queueCategoryToggleButton.querySelector("span");
    if (iconHost) {
      iconHost.innerHTML = isCompact
        ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 9.8 8 6.2l3.6 3.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>'
        : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 6.2 8 9.8l3.6-3.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>';
    }
  }

  function renderSignalRows(rows, items) {
    rows.forEach((row) => {
      row.innerHTML = "";
      row.hidden = !items.length;
      items.forEach((item) => {
        const pill = document.createElement("span");
        pill.className = `status-pill status-pill--${item.tone}`;
        const icon = createPillIcon(item.icon);
        if (icon) pill.appendChild(icon);
        pill.appendChild(document.createTextNode(item.label));
        row.appendChild(pill);
      });
    });
  }

  function setAppView(view = "conversations") {
    markExplicitNavigationIntent();
    const normalizedView = workspaceSourceOfTruth.setView(view);
    const shellView = resolveShellView(normalizedView);
    const aliasAutomationSection = resolveAutomationSectionForView(normalizedView);
    const showConversations = shellView === "conversations";
    const shellStructureChanged =
      appliedShellViewState !== shellView ||
      appliedConversationShellState !== showConversations;
    canvas.dataset.appView = normalizedView;
    canvas.dataset.appShellView = shellView;

    if (shellStructureChanged) {
      shellViewSections.forEach((section) => {
        section.hidden = normalizeKey(section.dataset.shellView) !== shellView;
      });

      previewShell.hidden = !showConversations;
      focusShell.hidden = !showConversations;
      resizeHandles.forEach((handle) => {
        handle.hidden = !showConversations;
      });
      appliedShellViewState = shellView;
      appliedConversationShellState = showConversations;
    }

    navViewButtons.forEach((button) => {
      const buttonView = normalizeKey(button.dataset.navView);
      const isActive =
        buttonView === normalizedView ||
        (buttonView === "automation" && shellView === "automation");
      button.classList.toggle("preview-nav-item-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    closeMailboxDropdowns();
    if (moreMenuToggle) {
      const isMoreView = AUX_VIEWS.has(shellView);
      moreMenuToggle.classList.toggle("preview-nav-item-active", isMoreView);
      moreMenuToggle.setAttribute("aria-pressed", isMoreView ? "true" : "false");
    }

    setMoreMenuOpen(false);

    if (!showConversations && shellStructureChanged) {
      setStudioOpen(false);
      setNoteOpen(false);
      setNoteModeOpen(false);
      setScheduleOpen(false);
      setLaterOpen(false);
      setContextCollapsed(false);
    }

    if (shellView === "customers") {
      loadCustomersRuntime().catch((error) => {
        console.warn("Customers live-laddning misslyckades.", error);
        applyCustomerFilters();
      });
    }

    if (shellView === "analytics") {
      renderAnalyticsRuntime();
      loadAnalyticsRuntime().catch((error) => {
        console.warn("Analytics live-laddning misslyckades.", error);
      });
    }

    if (shellView === "automation") {
      if (aliasAutomationSection) {
        setAutomationSubnav(aliasAutomationSection);
      }
      renderAutomationTemplateConfig();
      renderAutomationTestingState();
      renderAutomationVersions();
      loadAutomationVersions(state.selectedAutomationTemplate).catch((error) => {
        console.warn("Automation live-laddning misslyckades.", error);
      });
    }

    if (shellView === "integrations") {
      renderIntegrations();
      loadIntegrationsRuntime().catch((error) => {
        console.warn("Integrations live-laddning misslyckades.", error);
      });
    }

    if (shellView === "macros") {
      renderMacros();
      loadMacrosRuntime().catch((error) => {
        console.warn("Macros live-laddning misslyckades.", error);
      });
    }

    if (shellView === "settings") {
      renderSettings();
      loadSettingsRuntime().catch((error) => {
        console.warn("Settings live-laddning misslyckades.", error);
      });
    }

    if (shellView === "showcase") {
      renderShowcase();
      loadMacrosRuntime().catch((error) => {
        console.warn("Showcase macros-laddning misslyckades.", error);
      });
      loadSettingsRuntime().catch((error) => {
        console.warn("Showcase settings-laddning misslyckades.", error);
      });
      loadIntegrationsRuntime().catch((error) => {
        console.warn("Showcase integrations-laddning misslyckades.", error);
      });
    }

    normalizeWorkspaceState();
    syncShellViewToLocation();
  }

  function setSelectedAnalyticsPeriod(periodKey) {
    const normalizedKey = normalizeKey(periodKey) || "week";
    state.selectedAnalyticsPeriod = normalizedKey;

    analyticsPeriodButtons.forEach((button) => {
      const isActive =
        normalizeKey(button.dataset.analyticsPeriod) === state.selectedAnalyticsPeriod;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    renderAnalyticsPeriod();
    renderAnalyticsRuntime();

    if (state.view === "analytics") {
      loadAnalyticsRuntime({ force: true }).catch((error) => {
        console.warn("Analytics period-laddning misslyckades.", error);
      });
    }
  }

  function setSelectedMailFeedItem(feedKey, itemKey) {
    const normalizedFeed = normalizeKey(feedKey);
    state.selectedMailFeedKey[normalizedFeed] = normalizeKey(itemKey);
    renderMailFeeds();
  }

  function setSelectedIntegrationCategory(categoryKey) {
    state.selectedIntegrationCategory = normalizeKey(categoryKey) || "all";
    renderIntegrations();
  }

  function setSelectedCustomerIdentity(customerKey) {
    const normalizedKey = normalizeKey(customerKey);
    state.selectedCustomerIdentity =
      normalizedKey || getVisibleCustomerPoolKeys()[0] || "";

    customerRows.forEach((row) => {
      const isActive = normalizeKey(row.dataset.customerRow) === state.selectedCustomerIdentity;
      row.classList.toggle("is-selected", isActive);
      row.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    customerMergeGroups.forEach((group) => {
      const isActive =
        normalizeKey(group.dataset.customerMergeGroup) === state.selectedCustomerIdentity;
      group.hidden = !isActive;
      group.classList.toggle("is-active", isActive);
    });

    customerDetailCards.forEach((card) => {
      const isActive =
        normalizeKey(card.dataset.customerDetail) === state.selectedCustomerIdentity;
      card.hidden = !isActive;
      card.classList.toggle("is-active", isActive);
    });

    renderCustomerMergeGroups();
    renderCustomerDetailTools();
    renderCustomerBatchSelection();
  }

  function setSelectedAutomationLibrary(libraryKey) {
    const normalizedKey = normalizeKey(libraryKey);
    state.selectedAutomationLibrary = normalizedKey || "email";

    automationLibraryItems.forEach((item) => {
      const isActive =
        normalizeKey(item.dataset.automationLibrary) === state.selectedAutomationLibrary;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setSelectedAutomationNode(nodeKey) {
    const normalizedKey = normalizeKey(nodeKey);
    state.selectedAutomationNode = normalizedKey || "trigger";
    const selectedSuggestionKey =
      AUTOMATION_NODE_TO_SUGGESTION[state.selectedAutomationNode] || "";

    automationNodes.forEach((node) => {
      const isActive =
        normalizeKey(node.dataset.automationNode) === state.selectedAutomationNode;
      node.classList.toggle("is-selected", isActive);
      node.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    automationSuggestionCards.forEach((card) => {
      const isActive =
        normalizeKey(card.dataset.automationSuggestion) === selectedSuggestionKey;
      card.classList.toggle("is-active", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setAutomationSubnav(activeLabel) {
    const normalizedLabel = normalizeKey(activeLabel) || "byggare";
    const supportsOwnView =
      normalizedLabel === "byggare" ||
      normalizedLabel === "analys" ||
      normalizedLabel === "mallar" ||
      normalizedLabel === "testing" ||
      normalizedLabel === "versioner" ||
      normalizedLabel === "autopilot";
    const activeView =
      normalizedLabel === "analys"
        ? "analys"
        : normalizedLabel === "mallar"
          ? "mallar"
          : normalizedLabel === "testing"
            ? "testing"
            : normalizedLabel === "versioner"
              ? "versioner"
              : normalizedLabel === "autopilot"
                ? "autopilot"
              : "byggare";
    const activePillKey = supportsOwnView ? normalizedLabel : activeView;
    state.selectedAutomationSection = activeView;
    const currentView = normalizeKey(state.view) || "conversations";
    if (
      (currentView === "templates" && activeView !== "mallar") ||
      (currentView === "workflows" && activeView !== "byggare")
    ) {
      workspaceSourceOfTruth.setView("automation");
      state.view = "automation";
    }

    automationSubnavPills.forEach((pill) => {
      const pillKey = normalizeKey(pill.dataset.automationSection || pill.textContent);
      const isActive = pillKey === activePillKey;
      pill.classList.toggle("is-active", isActive);
      pill.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    automationViews.forEach((view) => {
      const isActive = normalizeKey(view.dataset.automationView) === activeView;
      view.hidden = !isActive;
      view.classList.toggle("is-active", isActive);
      view.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    syncShellViewToLocation();
  }

  function setSelectedAutomationTemplate(templateKey) {
    const normalizedKey = normalizeKey(templateKey);
    state.selectedAutomationTemplate = normalizedKey || "churn_guard";

    automationTemplateCards.forEach((card) => {
      const isActive =
        normalizeKey(card.dataset.automationTemplate) === state.selectedAutomationTemplate;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    renderAutomationTemplateConfig();
    renderAutomationTestingState();
    renderAutomationVersions();
    loadAutomationVersions(state.selectedAutomationTemplate).catch((error) => {
      console.warn("Automation template-laddning misslyckades.", error);
    });
  }

  function setSelectedAutomationVersion(versionKey) {
    const normalizedKey = normalizeKey(versionKey);
    state.selectedAutomationVersion = normalizedKey || "v3_0";

    automationVersionCards.forEach((card) => {
      const isActive =
        normalizeKey(card.dataset.automationVersion) === state.selectedAutomationVersion;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    automationVersionDetails.forEach((detail) => {
      const isActive =
        normalizeKey(detail.dataset.automationVersionDetail) ===
        state.selectedAutomationVersion;
      detail.hidden = !isActive;
      detail.classList.toggle("is-active", isActive);
      detail.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  function setAutomationAutopilotEnabled(enabled) {
    const isEnabled = Boolean(enabled);
    state.automationAutopilotEnabled = isEnabled;

    if (automationAutopilotToggle) {
      automationAutopilotToggle.classList.toggle("is-active", isEnabled);
      automationAutopilotToggle.setAttribute("aria-pressed", isEnabled ? "true" : "false");
    }

    if (automationAutopilotStatusCard) {
      automationAutopilotStatusCard.classList.toggle("is-paused", !isEnabled);
      const label = automationAutopilotStatusCard.querySelector("span");
      const copy = automationAutopilotStatusCard.querySelector("strong");
      if (label) {
        label.textContent = isEnabled ? "Autopilot aktiv" : "Autopilot pausad";
      }
      if (copy) {
        copy.textContent = isEnabled
          ? "Analyserar kontinuerligt arbetsflödesprestanda och föreslår optimeringar"
          : "Autopilot är pausad. Förslag och auto-fix ligger kvar men inga nya ändringar föreslås.";
      }
    }

    renderAutomationAutopilot();
  }

  function setSelectedAutomationAutopilotProposal(proposalKey) {
    const normalizedKey = normalizeKey(proposalKey);
    state.selectedAutomationAutopilotProposal = normalizedKey || "merge_duplicates";

    automationAutopilotProposalCards.forEach((card) => {
      const isActive =
        normalizeKey(card.dataset.automationAutopilotProposal) ===
        state.selectedAutomationAutopilotProposal;
      card.classList.toggle("is-selected", isActive);
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    renderAutomationAutopilot();
  }

  function applyFocusSection(section) {
    markExplicitNavigationIntent();
    const activeSection = workspaceSourceOfTruth.setFocusSection(section);
    focusTabButtons.forEach((button) => {
      const isActive = button.dataset.focusSection === activeSection;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    focusPanels.forEach((panel) => {
      const isActive = panel.dataset.focusPanel === activeSection;
      panel.hidden = !isActive;
      panel.classList.toggle("is-active", isActive);
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    captureRuntimeReentrySnapshot("focus_section_change");
  }

  function resolveLaterOptionDueAt(optionKey) {
    const normalizedKey = normalizeKey(optionKey) || "one_hour";
    const targetAt = new Date();
    if (normalizedKey === "tomorrow_morning") {
      targetAt.setDate(targetAt.getDate() + 1);
      targetAt.setHours(9, 0, 0, 0);
      return targetAt.toISOString();
    }
    if (normalizedKey === "monday_morning") {
      const delta = ((8 - targetAt.getDay()) % 7) || 7;
      targetAt.setDate(targetAt.getDate() + delta);
      targetAt.setHours(9, 0, 0, 0);
      return targetAt.toISOString();
    }
    targetAt.setHours(targetAt.getHours() + 1);
    return targetAt.toISOString();
  }

  function getConversationActionTarget(thread) {
    if (!thread) return null;
    const mailboxId = asText(
      thread.mailboxAddress,
      thread.raw?.mailboxAddress,
      thread.mailboxId,
      thread.raw?.mailboxId
    );
    const conversationId = asText(thread.conversationId, thread.raw?.conversationId, thread.id);
    const messageId = asText(
      thread.raw?.graphMessageId,
      thread.graphMessageId,
      thread.raw?.messageId,
      thread.messageId
    );
    if (!mailboxId || !conversationId || !messageId) return null;
    return {
      mailboxId,
      conversationId,
      messageId,
    };
  }

  async function requestConversationAction(
    path,
    thread,
    { idempotencyScope, body = {}, errorMessage = "Kunde inte uppdatera konversationen." } = {}
  ) {
    const target = getConversationActionTarget(thread);
    if (!target) {
      throw new Error(errorMessage);
    }
    if (path === "/api/v1/cco/handled") {
      console.log("[CCO Markera klar] conversationActionTarget", {
        conversationId: target.conversationId,
        messageId: target.messageId,
        mailboxId: target.mailboxId,
      });
    }
    const payload = await apiRequest(path, {
      method: "POST",
      headers: {
        "x-idempotency-key": createIdempotencyKey(idempotencyScope),
      },
      body: {
        channel: "admin",
        ...target,
        source: "major_arcana_preview",
        ...body,
      },
    });
    if (payload?.warningCode) {
      console.warn(
        `CCO conversation action ${path} returnerade warning ${payload.warningCode}.`,
        payload?.warningMessage || ""
      );
    }
    return payload;
  }

  async function applyReplyLaterToThread(
    thread,
    label,
    { closeStudio = false, refresh = true } = {}
  ) {
    if (!thread) return false;
    const followUpIso = resolveLaterOptionDueAt(state.later.option);
    await requestConversationAction("/api/v1/cco/reply-later", thread, {
      idempotencyScope: "major-arcana-reply-later",
      errorMessage: "Kunde inte parkera tråden.",
      body: {
        followUpDueAt: followUpIso,
        waitingOn: "owner",
        nextActionLabel: "Återuppta senare",
        nextActionSummary: `Tråden är parkerad till ${label}.`,
        actionLabel: "Svara senare",
      },
    });
    const recordedAt = new Date().toISOString();
    updateRuntimeThread(thread.id, (current) => {
      current.waitingLabel = "Ägaråtgärd";
      current.statusLabel = "Parkerad";
      if (followUpIso) {
        current.followUpLabel = formatDueLabel(followUpIso);
      }
      current.nextActionLabel = "Återuppta senare";
      current.nextActionSummary = `Tråden är parkerad till ${label}.`;
      current.tags = Array.from(
        new Set([...asArray(current.tags), "later", "followup"].filter((tag) => tag !== "act-now"))
      );
      current.raw = {
        ...current.raw,
        waitingOn: "owner",
        followUpDueAt: followUpIso,
        followUpSuggestedAt: followUpIso,
        lastActionTakenLabel: "Svara senare",
        lastActionTakenAt: recordedAt,
      };
      current.cards = buildRuntimeSummaryCards(current.raw, current);
      return current;
    });
    if (closeStudio) {
      setStudioFeedback(`Tråden parkerades till ${label}.`, "success");
      setStudioOpen(false);
      setContextCollapsed(false);
    } else if (focusStatusLine) {
      focusStatusLine.textContent = `Tråden parkerades till ${label}.`;
    }
    setAuxStatus(laterStatus, `Tråden parkerades till ${label.toLowerCase()}.`, "success");
    if (refresh) {
      await refreshConversationActionRuntimeProjection(thread, "reply later");
    }
    return true;
  }

  async function applyHandledToThread(
    thread,
    outcome,
    { closeStudio = false, refresh = true } = {}
  ) {
    if (!thread) return false;
    await requestConversationAction("/api/v1/cco/handled", thread, {
      idempotencyScope: "major-arcana-handled",
      errorMessage: "Kunde inte markera tråden som klar.",
      body: {
        actionLabel: outcome,
      },
    });
    if (closeStudio) {
      setStudioFeedback(`Tråden markerades som klar: ${outcome}.`, "success");
      setStudioOpen(false);
      setContextCollapsed(false);
    } else if (focusStatusLine) {
      focusStatusLine.textContent = `Tråden markerades som klar: ${outcome}.`;
    }
    if (refresh) {
      await refreshConversationActionRuntimeProjection(thread, "mark handled");
    }
    return true;
  }

  async function applyLaterOption(optionKey) {
    state.later.option = normalizeKey(optionKey) || "one_hour";
    renderLaterOptions(state.later.option);
    setLaterOpen(false);
    try {
      const bulkSelectionKeys = asArray(state.later.bulkSelectionKeys)
        .map((key) => normalizeKey(key))
        .filter(Boolean);
      if (bulkSelectionKeys.length) {
        const label = getLaterOptionLabel(state.later.option);
        const selectedThreads = bulkSelectionKeys
          .map((threadId) =>
            asArray(state.runtime.threads).find(
              (thread) => normalizeKey(thread?.id) === normalizeKey(threadId)
            )
          )
          .filter(Boolean);
        state.later.bulkSelectionKeys = [];
        if (selectedThreads.length) {
          await Promise.all(
            selectedThreads.map((thread) =>
              requestConversationAction("/api/v1/cco/reply-later", thread, {
                idempotencyScope: "major-arcana-reply-later",
                errorMessage: "Kunde inte parkera trådarna.",
                body: {
                  followUpDueAt: resolveLaterOptionDueAt(state.later.option),
                  waitingOn: "owner",
                  nextActionLabel: "Återuppta senare",
                  nextActionSummary: `Tråden är parkerad till ${label}.`,
                  actionLabel: "Svara senare",
                },
              })
            )
          );
          getMailFeedRuntimeState("later").selectedKeys = [];
          selectRuntimeThread(selectedThreads[0].id);
          setAppView("conversations");
          applyFocusSection("conversation");
          setContextCollapsed(false);
          await refreshWorkspaceBootstrapForSelectedThread("reply later bulk");
          setAuxStatus(
            laterStatus,
            `${selectedThreads.length} trådar parkerades till ${label.toLowerCase()}.`,
            "success"
          );
          return;
        }
      }
      const selectedThread = getSelectedRuntimeThread();
      if (selectedThread) {
        await applyReplyLaterToThread(selectedThread, getLaterOptionLabel(state.later.option), {
          closeStudio: canvas.classList.contains("is-studio-open"),
        });
        applyFocusSection("conversation");
        return;
      }
      applyStudioMode("reply_later");
      setStudioOpen(true);
      setContextCollapsed(false);
    } catch (error) {
      setAuxStatus(laterStatus, error.message || "Kunde inte parkera tråden.", "error");
      if (canvas.classList.contains("is-studio-open")) {
        setStudioFeedback(error.message || "Kunde inte parkera tråden.", "error");
      }
    }
  }

  function syncCurrentNoteDraftFromForm() {
    const activeKey = normalizeKey(state.note.activeKey);
    const definition = state.noteDefinitions[activeKey];
    if (!activeKey || !definition) return null;

    const currentDraft = state.note.drafts[activeKey] || createNoteDraft(definition);
    currentDraft.text = normalizeText(noteText?.value);
    currentDraft.priority = normalizeText(notePrioritySelect?.value) || currentDraft.priority;
    currentDraft.visibility = normalizeText(noteVisibilitySelect?.value) || currentDraft.visibility;
    state.note.drafts[activeKey] = currentDraft;
    return currentDraft;
  }

  function getActiveNoteDraft() {
    syncCurrentNoteDraftFromForm();
    return state.note.drafts[normalizeKey(state.note.activeKey)] || null;
  }

  function addTagToActiveDraft(rawValue) {
    const value = normalizeText(rawValue);
    if (!value) return;
    const draft = getActiveNoteDraft();
    if (!draft) return;
    const tags = tagsFrom([...(draft.tags || []), value]);
    draft.tags = tags;
    renderTags(tags);
    if (noteTagInput) {
      noteTagInput.value = "";
    }
  }

  function removeTagFromActiveDraft(tagValue) {
    const draft = getActiveNoteDraft();
    if (!draft) return;
    draft.tags = (draft.tags || []).filter(
      (tag) => normalizeKey(tag) !== normalizeKey(tagValue)
    );
    renderTags(draft.tags);
  }

  function applyTemplateToActiveDraft(templateKey) {
    const template = state.noteTemplatesByKey[normalizeKey(templateKey)];
    if (!template) return;
    const draft = getActiveNoteDraft();
    if (!draft) return;
    draft.text = normalizeText(template.text);
    draft.tags = tagsFrom(template.tags);
    draft.templateKey = template.key;
    renderNoteDestination(state.note.activeKey);
  }

  async function apiRequest(path, options = {}) {
    const url = new URL(path, window.location.origin);
    const isWorkspaceRequest = path.includes("/api/v1/cco-workspace/");
    const context = getActiveWorkspaceContext();

    if (isWorkspaceRequest && !url.searchParams.has("workspaceId")) {
      url.searchParams.set("workspaceId", context.workspaceId);
    }
    if (isWorkspaceRequest && context.conversationId && !url.searchParams.has("conversationId")) {
      url.searchParams.set("conversationId", context.conversationId);
    }
    if (isWorkspaceRequest && context.customerId && !url.searchParams.has("customerId")) {
      url.searchParams.set("customerId", context.customerId);
    }
    if (isWorkspaceRequest && context.customerName && !url.searchParams.has("customerName")) {
      url.searchParams.set("customerName", context.customerName);
    }

    const headerObject =
      options.headers && typeof options.headers === "object" && !Array.isArray(options.headers)
        ? options.headers
        : {};
    const requestBody =
      options.body === undefined || options.body === null
        ? undefined
        : isWorkspaceRequest
          ? { ...context, ...options.body }
          : options.body;

    const executeRequest = async ({ authToken = "", allowRetry = false } = {}) => {
      const response = await fetch(url.toString(), {
        method: options.method || "GET",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(authToken &&
          authToken !== "__preview_local__" &&
          !("Authorization" in headerObject) &&
          !("authorization" in headerObject)
            ? { Authorization: `Bearer ${authToken}` }
            : {}),
          ...headerObject,
        },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};

      if (
        !response.ok &&
        allowRetry &&
        typeof isLocalPreviewHost === "function" &&
        isLocalPreviewHost() &&
        isAuthFailure(response.status, payload?.error || "") &&
        normalizeText(authToken) &&
        normalizeText(authToken) !== "__preview_local__"
      ) {
        clearAdminToken();
        return executeRequest({
          authToken: getAdminToken(),
          allowRetry: false,
        });
      }

      if (!response.ok) {
        const error = new Error(payload?.error || "Request failed.");
        error.statusCode = response.status;
        error.metadata = payload?.metadata || null;
        throw error;
      }

      return payload;
    };

    return executeRequest({
      authToken: getAdminToken(),
      allowRetry: true,
    });
  }

  function applyStudioTemplateSelection(templateKey) {
    if (normalizeKey(state.studio.mode) === "compose") {
      const studioState = state.studio;
      studioState.activeTemplateKey = normalizeKey(templateKey);
      studioState.activeRefineKey = "";
      studioState.draftBody = buildComposeTemplateDraft(
        studioState.activeTemplateKey,
        studioState.composeTo
      );
      studioState.baseDraftBody = studioState.draftBody;
      renderStudioShell();
      setStudioFeedback(`Mallen "${studioState.activeTemplateKey}" laddades i nytt mejl.`, "success");
      return;
    }
    const thread = getSelectedRuntimeThread();
    if (!thread) return;
    if (isOfflineHistoryContextThread(thread)) {
      setStudioFeedback("Offline historik är läsläge. Öppna live-tråden för att ändra studioutkastet.", "error");
      return;
    }
    const studioState = ensureStudioState(thread);
    studioState.activeTemplateKey = normalizeKey(templateKey);
    studioState.activeTrackKey = studioState.activeTrackKey || inferStudioTrackKey(thread);
    studioState.activeRefineKey = "";
    studioState.draftBody = buildStudioTemplateDraft(thread, studioState.activeTemplateKey);
    studioState.baseDraftBody = studioState.draftBody;
    renderStudioShell();
    setStudioFeedback(`Mallen "${studioState.activeTemplateKey}" laddades i studion.`, "success");
  }

  function applyStudioTrackSelection(trackKey) {
    if (normalizeKey(state.studio.mode) === "compose") {
      const studioState = state.studio;
      studioState.activeTrackKey = normalizeKey(trackKey) || "booking";
      studioState.activeTemplateKey = "";
      studioState.activeRefineKey = "";
      studioState.draftBody = buildComposeTrackDraft(
        studioState.activeTrackKey,
        studioState.composeTo
      );
      studioState.baseDraftBody = studioState.draftBody;
      renderStudioShell();
      setStudioFeedback(`Spåret "${studioState.activeTrackKey}" är aktivt i nytt mejl.`, "success");
      return;
    }
    const thread = getSelectedRuntimeThread();
    if (!thread) return;
    if (isOfflineHistoryContextThread(thread)) {
      setStudioFeedback("Offline historik är läsläge. Öppna live-tråden för att växla responsspår.", "error");
      return;
    }
    const studioState = ensureStudioState(thread);
    studioState.activeTrackKey = normalizeKey(trackKey) || inferStudioTrackKey(thread);
    studioState.activeTemplateKey = "";
    studioState.activeRefineKey = "";
    studioState.draftBody = buildStudioTrackDraft(thread, studioState.activeTrackKey);
    studioState.baseDraftBody = studioState.draftBody;
    renderStudioShell();
    setStudioFeedback(`Responsspåret "${studioState.activeTrackKey}" är aktivt.`, "success");
  }

  function applyStudioToneSelection(toneKey) {
    if (normalizeKey(state.studio.mode) === "compose") {
      const studioState = state.studio;
      studioState.activeToneKey = normalizeKey(toneKey) || "professional";
      studioState.draftBody = buildComposeToneDraft(
        studioState.draftBody,
        studioState.activeToneKey,
        studioState.composeTo
      );
      studioState.baseDraftBody = studioState.draftBody;
      renderStudioShell();
      setStudioFeedback(`Tonfiltret "${studioState.activeToneKey}" applicerades i nytt mejl.`, "success");
      return;
    }
    const thread = getSelectedRuntimeThread();
    if (!thread) return;
    if (isOfflineHistoryContextThread(thread)) {
      setStudioFeedback("Offline historik är läsläge. Öppna live-tråden för att ändra tonfilter.", "error");
      return;
    }
    const studioState = ensureStudioState(thread);
    studioState.activeToneKey = normalizeKey(toneKey) || "professional";
    studioState.draftBody = buildStudioToneDraft(thread, studioState.draftBody, studioState.activeToneKey);
    studioState.baseDraftBody = studioState.draftBody;
    renderStudioShell();
    setStudioFeedback(`Tonfiltret "${studioState.activeToneKey}" applicerades.`, "success");
  }

  function applyStudioRefineSelection(refineKey) {
    if (normalizeKey(state.studio.mode) === "compose") {
      const studioState = state.studio;
      studioState.activeRefineKey = normalizeKey(refineKey);
      studioState.draftBody = buildComposeRefinedDraft(
        studioState.draftBody,
        studioState.activeRefineKey,
        studioState.composeTo
      );
      renderStudioShell();
      setStudioFeedback(`Finjusteringen "${studioState.activeRefineKey}" applicerades i nytt mejl.`, "success");
      return;
    }
    const thread = getSelectedRuntimeThread();
    if (!thread) return;
    if (isOfflineHistoryContextThread(thread)) {
      setStudioFeedback("Offline historik är läsläge. Öppna live-tråden för att finjustera svaret.", "error");
      return;
    }
    const studioState = ensureStudioState(thread);
    studioState.activeRefineKey = normalizeKey(refineKey);
    studioState.draftBody = buildStudioRefinedDraft(thread, studioState.draftBody, studioState.activeRefineKey);
    renderStudioShell();
    setStudioFeedback(`Finjusteringen "${studioState.activeRefineKey}" applicerades.`, "success");
  }

  function handleStudioToolAction(toolKey) {
    if (normalizeKey(state.studio.mode) === "compose") {
      const studioState = state.studio;
      const normalizedTool = normalizeKey(toolKey);
      if (normalizedTool === "gift") {
        const giftLine =
          "\n\nPS: Om du vill kan jag också skicka ett konkret prisupplägg eller bokningsförslag direkt.";
        if (!studioState.draftBody.includes(giftLine.trim())) {
          studioState.draftBody = `${studioState.draftBody}${giftLine}`;
        }
        renderStudioShell();
        setStudioFeedback("Merförsäljningsrad lades till i nytt mejl.", "success");
        return;
      }
      if (normalizedTool === "regenerate") {
        studioState.activeRefineKey = "";
        studioState.draftBody = studioState.activeTemplateKey
          ? buildComposeTemplateDraft(studioState.activeTemplateKey, studioState.composeTo)
          : buildComposeTrackDraft(studioState.activeTrackKey || "booking", studioState.composeTo);
        studioState.baseDraftBody = studioState.draftBody;
        renderStudioShell();
        setStudioFeedback("Nytt mejl regenererades från vald mall och ton.", "success");
        return;
      }
      if (normalizedTool === "policy") {
        const policy = evaluateStudioPolicy(null, studioState.draftBody);
        setStudioFeedback(policy.summary, policy.tone === "warning" ? "error" : "success");
      }
      return;
    }
    const thread = getSelectedRuntimeThread();
    if (!thread) return;
    if (isOfflineHistoryContextThread(thread)) {
      setStudioFeedback("Offline historik är läsläge. Verktygen låses upp när live-tråden är tillgänglig.", "error");
      return;
    }
    const studioState = ensureStudioState(thread);
    const normalizedTool = normalizeKey(toolKey);
    if (normalizedTool === "gift") {
      const giftLine =
        "\n\nPS: Om du vill kan jag även skicka ett konkret bokningsförslag eller prisupplägg direkt i samma tråd.";
      if (!studioState.draftBody.includes(giftLine.trim())) {
        studioState.draftBody = `${studioState.draftBody}${giftLine}`;
      }
      renderStudioShell();
      setStudioFeedback("Merförsäljningsrad lades till i utkastet.", "success");
      return;
    }
    if (normalizedTool === "regenerate") {
      studioState.activeTemplateKey = "";
      studioState.activeRefineKey = "";
      studioState.draftBody = buildStudioTrackDraft(thread, studioState.activeTrackKey);
      studioState.baseDraftBody = studioState.draftBody;
      renderStudioShell();
      setStudioFeedback("Studioutkastet regenererades från live-kontexten.", "success");
      return;
    }
    if (normalizedTool === "policy") {
      const policy = evaluateStudioPolicy(thread, studioState.draftBody);
      setStudioFeedback(policy.summary, policy.tone === "warning" ? "error" : "success");
    }
  }

  function startResize(handle, event) {
    if (!previewWorkspace) return;
    if (canvas.classList.contains("is-workspace-width-frozen")) return;

    if (activeResizeCleanup) {
      activeResizeCleanup();
      activeResizeCleanup = null;
    }

    const handleType = handle.dataset.resizeHandle;
    const startX = event.clientX;
    const startState = { left: workspaceState.left, right: workspaceState.right };
    const availableWidth = getWorkspaceAvailableWidth();
    const gapTotal = getWorkspaceGapTotal();
    const lockedLeftMin = workspaceLimits.left.min;
    const lockedRightMin = workspaceLimits.right.min;
    const lockedMainMin = workspaceLimits.main.min;
    const isMouseDrag = event.type === "mousedown";
    const moveEventName = isMouseDrag ? "mousemove" : "pointermove";
    const endEventNames = isMouseDrag ? ["mouseup"] : ["pointerup", "pointercancel"];
    event.preventDefault();
    event.stopPropagation();

    const onPointerMove = (moveEvent) => {
      if (typeof moveEvent.preventDefault === "function") {
        moveEvent.preventDefault();
      }
      const delta = moveEvent.clientX - startX;

      if (handleType === "left-main") {
        workspaceState.left = Math.round(
          clamp(
            startState.left + delta,
            lockedLeftMin,
            Math.min(
              workspaceLimits.left.max,
              availableWidth - gapTotal - lockedMainMin - startState.right
            )
          )
        );
        workspaceState.right = startState.right;
        workspaceState.main = Math.max(
          lockedMainMin,
          Math.round(availableWidth - gapTotal - workspaceState.left - workspaceState.right)
        );
        applyWorkspaceState();
      }

      if (handleType === "main-right") {
        workspaceState.left = startState.left;
        workspaceState.right = Math.round(
          clamp(
            startState.right - delta,
            lockedRightMin,
            Math.min(
              workspaceLimits.right.max,
              availableWidth - gapTotal - lockedMainMin - startState.left
            )
          )
        );
        workspaceState.main = Math.max(
          lockedMainMin,
          Math.round(availableWidth - gapTotal - workspaceState.left - workspaceState.right)
        );
        applyWorkspaceState();
      }
    };

    const cleanup = () => {
      document.removeEventListener(moveEventName, onPointerMove, true);
      endEventNames.forEach((name) => {
        document.removeEventListener(name, onPointerUp, true);
      });
      window.removeEventListener("blur", onPointerUp, true);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      handle.classList.remove("is-dragging");
      activeResizeCleanup = null;
    };

    const onPointerUp = () => {
      if (!isMouseDrag) {
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (_) {
          // no-op on browsers that already released the capture
        }
      }
      cleanup();
      normalizeWorkspaceState();
      scheduleWorkspacePrefsSave();
    };

    if (!isMouseDrag) {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (_) {
        // Safari can refuse capture for some synthetic/premature pointer states
      }
    }

    activeResizeCleanup = cleanup;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    handle.classList.add("is-dragging");
    document.addEventListener(moveEventName, onPointerMove, {
      passive: false,
      capture: true,
    });
    endEventNames.forEach((name) => {
      document.addEventListener(name, onPointerUp, true);
    });
    window.addEventListener("blur", onPointerUp, true);
  }

  bindWorkspaceInteractions();

  navViewButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      if (button.tagName === "A") {
        event.preventDefault();
      }
      if (button.closest(".preview-more-menu")) {
        setMoreMenuOpen(false);
      }
      const targetView = normalizeKey(button.dataset.navView);
      if (targetView === "conversations" && (state.view === "sent" || state.view === "later")) {
        const activeFeedKey = state.view === "later" ? "later" : "sent";
        const selectedFeedThread = getSelectedMailFeedThread(activeFeedKey);
        exitAuxViewToConversations({
          feedKey: activeFeedKey,
          threadId: asText(selectedFeedThread?.id),
          focusSection: "conversation",
          restoreContext: true,
        });
        return;
      }
      setAppView(button.dataset.navView);
    });
  });

  if (moreMenuToggle) {
    moreMenuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setMoreMenuOpen(!state.moreMenuOpen);
    });
  }

  mailboxDropdowns.forEach((dropdown) => {
    const parts = getMailboxDropdownParts(dropdown);
    if (!parts) return;
    const { toggle, menu } = parts;

    toggle.addEventListener("change", () => {
      if (!toggle.checked) {
        clearMailboxDropdownOverlay(menu);
        return;
      }
      closeMailboxDropdowns({ exceptToggle: toggle });
      window.requestAnimationFrame(() => {
        syncMailboxDropdownOverlay(dropdown);
      });
    });
  });

  [
    mailboxAdminNameInput,
    mailboxAdminEmailInput,
    mailboxAdminSignatureFullNameInput,
    mailboxAdminSignatureTitleInput,
  ].forEach((input) => {
    input?.addEventListener("input", () => {
      syncMailboxAdminSignatureEditorFromFields();
    });
  });

  if (truthWorklistLaunchButton) {
    truthWorklistLaunchButton.addEventListener("click", () => {
      const isHidden =
        state.runtime?.truthWorklistView &&
        typeof state.runtime.truthWorklistView === "object" &&
        state.runtime.truthWorklistView.hidden === true;
      setTruthWorklistViewHidden(!isHidden);
    });
  }

  if (queueCategoryToggleButton) {
    queueCategoryToggleButton.addEventListener("click", () => {
      state.runtime.queueCategoriesCompact = !(state.runtime.queueCategoriesCompact === true);
      renderQueueCategoryStripMode();
    });
  }

  truthWorklistCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTruthWorklistViewHidden(true);
    });
  });

  truthWorklistPageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setTruthWorklistPage(button.dataset.truthWorklistPageButton || "overview");
    });
  });

  if (truthWorklistRows) {
    truthWorklistRows.addEventListener("click", (event) => {
      const relayButton = event.target.closest("[data-truth-relay-legacy]");
      if (!relayButton || relayButton.disabled) return;
      activateTruthWorklistRelay({
        mailboxId: relayButton.dataset.truthRelayMailboxId,
        mailboxAddress: relayButton.dataset.truthRelayMailboxAddress,
        customerEmail: relayButton.dataset.truthRelayCustomerEmail,
        customerName: relayButton.dataset.truthRelayCustomerName,
        subject: relayButton.dataset.truthRelaySubject,
        conversationKey: relayButton.dataset.truthRelayConversationKey,
        lane: relayButton.dataset.truthRelayLane,
        comparable: relayButton.dataset.truthRelayComparable === "true",
      });
    });
  }

  if (truthWorklistControls) {
    truthWorklistControls.addEventListener("click", (event) => {
      const filterButton = event.target.closest("[data-truth-worklist-filter]");
      if (filterButton) {
        const viewState =
          state.runtime?.truthWorklistView && typeof state.runtime.truthWorklistView === "object"
            ? state.runtime.truthWorklistView
            : {};
        state.runtime.truthWorklistView = {
          ...viewState,
          localFilter: normalizeText(filterButton.dataset.truthWorklistFilter || "all") || "all",
        };
        renderTruthWorklistView();
        return;
      }
      const sortButton = event.target.closest("[data-truth-worklist-sort]");
      if (!sortButton) return;
      const viewState =
        state.runtime?.truthWorklistView && typeof state.runtime.truthWorklistView === "object"
          ? state.runtime.truthWorklistView
          : {};
      state.runtime.truthWorklistView = {
        ...viewState,
        localSort: normalizeText(sortButton.dataset.truthWorklistSort || "latest") || "latest",
      };
      renderTruthWorklistView();
    });
  }

  if (truthWorklistRelayNote) {
    truthWorklistRelayNote.addEventListener("click", (event) => {
      const clearButton = event.target.closest("[data-truth-relay-clear]");
      if (!clearButton) return;
      clearTruthWorklistRelay();
    });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".mailbox-dropdown")) {
      closeMailboxDropdowns();
    }
    if (state.moreMenuOpen && !event.target.closest(".preview-more")) {
      setMoreMenuOpen(false);
    }
  });

  window.addEventListener("blur", () => {
    closeMailboxDropdowns();
    if (state.moreMenuOpen) {
      setMoreMenuOpen(false);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      closeMailboxDropdowns();
    }
    if (document.hidden && state.moreMenuOpen) {
      setMoreMenuOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    syncOpenMailboxDropdownOverlays();
    if (state.moreMenuOpen) {
      setMoreMenuOpen(false);
    }
  });

  document.addEventListener(
    "scroll",
    () => {
      syncOpenMailboxDropdownOverlays();
      if (state.moreMenuOpen) {
        setMoreMenuOpen(false);
      }
    },
    true
  );

  if (customerList) {
    customerList.addEventListener("click", (event) => {
      const check = event.target.closest(".customer-record-check");
      const row = event.target.closest("[data-customer-row]");
      if (check && row) {
        event.preventDefault();
        event.stopPropagation();
        toggleCustomerBatchSelection(row.dataset.customerRow);
        return;
      }
      if (row) {
        setSelectedCustomerIdentity(row.dataset.customerRow);
      }
    });
  }

  customerCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleCustomerCommand(button.dataset.customerCommand);
    });
  });

  customerDetailActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleCustomerDetailAction(button.dataset.customerDetailAction).catch((error) => {
        console.warn("Customer detail action misslyckades.", error);
      });
    });
  });

  customerMergeCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCustomerMergeOpen(false);
    });
  });

  customerSettingsCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCustomerSettingsOpen(false);
    });
  });

  customerSplitCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCustomerSplitOpen(false);
    });
  });

  customerImportCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCustomerImportOpen(false);
    });
  });

  customerMergePrimaryOptions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-customer-merge-primary]");
    if (!button) return;
    state.customerMergePrimaryKey = normalizeKey(button.dataset.customerMergePrimary);
    renderCustomerMergeModal();
  });

  customerMergeOptionInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.customerMergeOptions[normalizeKey(input.dataset.customerMergeOption)] = input.checked;
    });
  });

  if (customerMergeConfirmButton) {
    customerMergeConfirmButton.addEventListener("click", () => {
      confirmCustomerMerge().catch((error) => {
        console.warn("Customer merge misslyckades.", error);
      });
    });
  }

  if (customerSplitOptions) {
    customerSplitOptions.addEventListener("change", (event) => {
      const input = event.target.closest("[data-customer-split-option]");
      if (!input) return;
      state.customerRuntime.splitEmail = normalizeText(input.dataset.customerSplitOption);
      renderCustomerSplitModal();
    });
  }

  if (customerSplitConfirmButton) {
    customerSplitConfirmButton.addEventListener("click", () => {
      confirmCustomerSplit().catch((error) => {
        console.warn("Customer split misslyckades.", error);
      });
    });
  }

  customerSettingToggleInputs.forEach((input) => {
    input.addEventListener("change", () => {
      state.customerSettings[normalizeKey(input.dataset.customerSettingToggle)] = input.checked;
      setFeedback(customerSettingsFeedback, "success", "Merge-inställningen uppdaterades.");
      saveCustomersRuntime("Matchningsreglerna sparades i nya CCO.").catch((error) => {
        console.warn("Customer settings-save misslyckades.", error);
      });
    });
  });

  if (customerImportTextInput) {
    customerImportTextInput.addEventListener("input", () => {
      state.customerImport.sourceText = customerImportTextInput.value || "";
      state.customerImport.sourceBinaryBase64 = "";
      state.customerImport.fileName = "";
      state.customerImport.sourceFormat = "";
      state.customerImport.rowEditsDirty = false;
      state.customerImport.preview = null;
      setFeedback(customerImportFeedback, "", "");
      renderCustomerImportModal();
    });
  }

  if (customerImportFileInput) {
    customerImportFileInput.addEventListener("change", () => {
      const file = customerImportFileInput.files?.[0];
      if (!file) return;
      readCustomerImportFile(file).catch((error) => {
        console.warn("Customer import-fil kunde inte läsas.", error);
        setFeedback(
          customerImportFeedback,
          "error",
          error?.message || "Kunde inte läsa importfilen."
        );
      });
    });
  }

  if (customerImportPreviewButton) {
    customerImportPreviewButton.addEventListener("click", () => {
      requestCustomerImportPreview().catch((error) => {
        console.warn("Customer import preview misslyckades.", error);
      });
    });
  }

  if (customerImportCommitButton) {
    customerImportCommitButton.addEventListener("click", () => {
      commitCustomerImport().catch((error) => {
        console.warn("Customer import commit misslyckades.", error);
      });
    });
  }

  if (customerImportPreviewList) {
    customerImportPreviewList.addEventListener("change", (event) => {
      const input = event.target.closest("[data-customer-import-row-field]");
      if (!input) return;
      updateCustomerImportPreviewRowField(
        input.dataset.customerImportRow,
        input.dataset.customerImportRowField,
        input.type === "checkbox" ? input.checked : input.value
      );
    });
  }

  if (customerSuggestionsToggle) {
    customerSuggestionsToggle.addEventListener("click", () => {
      const nextHidden = !state.customerSuggestionsHidden;
      setCustomerSuggestionsHidden(nextHidden);
      setCustomersStatus(
        nextHidden
          ? "AI-förslagen doldes så att railen fokuserar på vald kund."
          : "AI-förslagen visas igen för den valda kunden.",
        "success"
      );
    });
  }

  if (customerSearchInput) {
    customerSearchInput.addEventListener("input", () => {
      state.customerSearch = customerSearchInput.value;
      applyCustomerFilters();
    });
  }

  if (customerFilterSelect) {
    customerFilterSelect.addEventListener("change", () => {
      state.customerFilter = customerFilterSelect.value;
      applyCustomerFilters();
    });
  }

  automationLibraryItems.forEach((item) => {
    item.addEventListener("click", () => {
      setSelectedAutomationLibrary(item.dataset.automationLibrary);
    });
  });

  automationNodes.forEach((node) => {
    node.addEventListener("click", () => {
      setSelectedAutomationNode(node.dataset.automationNode);
    });
  });

  automationSuggestionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const suggestionKey = normalizeKey(card.dataset.automationSuggestion);
      const matchingNode = Object.entries(AUTOMATION_NODE_TO_SUGGESTION).find(
        ([, value]) => normalizeKey(value) === suggestionKey
      );
      if (matchingNode) {
        setSelectedAutomationNode(matchingNode[0]);
        return;
      }
      automationSuggestionCards.forEach((item) => {
        const isActive = item === card;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    });
  });

  automationSuggestionActionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      applyAutomationSuggestionAction(
        button.closest("[data-automation-suggestion]"),
        button.dataset.automationSuggestionAction
      );
    });
  });

  if (automationRunButton) {
    automationRunButton.addEventListener("click", () => {
      handleAutomationPrimaryAction("run", automationRunButton);
    });
  }

  if (automationSaveButton) {
    automationSaveButton.addEventListener("click", () => {
      handleAutomationPrimaryAction("save", automationSaveButton);
    });
  }

  automationCanvasScaleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const delta = button.dataset.automationScale === "in" ? 5 : -5;
      setAutomationCanvasScale(state.automationScale + delta);
    });
  });

  if (automationCanvasAddButton) {
    automationCanvasAddButton.addEventListener("click", () => {
      const libraryLabel =
        automationLibraryItems.find((item) => item.classList.contains("is-active"))?.textContent ||
        "valt steg";
      setAutomationStatus(`Redo att lägga till "${normalizeText(libraryLabel)}" i canvasen.`, "loading");
    });
  }

  if (automationRailToggle) {
    automationRailToggle.addEventListener("click", () => {
      const nextCollapsed = !state.automationRailCollapsed;
      setAutomationRailCollapsed(nextCollapsed);
      setAutomationStatus(
        nextCollapsed
          ? "AI-förslagen doldes tillfälligt för att ge buildern mer arbetsro."
          : "AI-förslagen visas igen i builder-railen.",
        "success"
      );
    });
  }

  automationSubnavPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      setAutomationSubnav(pill.dataset.automationSection || pill.textContent);
    });
  });

  automationJumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAutomationSubnav(button.dataset.automationJump);
    });
  });

  automationTemplateCards.forEach((card) => {
    card.addEventListener("click", () => {
      setSelectedAutomationTemplate(card.dataset.automationTemplate);
    });
  });

  automationTemplateActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.automationTemplateTarget;
      if (target) {
        setSelectedAutomationTemplate(target);
      }
      if (button.dataset.automationTemplateAction === "apply") {
        setAutomationSubnav("byggare");
      }
    });
  });

  automationTestingActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleAutomationTestingAction(button.dataset.automationTestingAction, button);
    });
  });

  automationAnalysisActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleAutomationAnalysisAction(button.dataset.automationAnalysisAction);
    });
  });

  automationVersionCards.forEach((card) => {
    card.addEventListener("click", () => {
      setSelectedAutomationVersion(card.dataset.automationVersion);
    });
  });

  automationVersionActionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const card = button.closest("[data-automation-version]");
      handleAutomationVersionAction(
        card?.dataset.automationVersion || "v3_0",
        button.dataset.automationVersionAction
      ).catch((error) => {
        console.warn("Automation version action misslyckades.", error);
      });
    });
  });

  analyticsPeriodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedAnalyticsPeriod(button.dataset.analyticsPeriod);
    });
  });

  analyticsTemplateRows.forEach((row) => {
    row.addEventListener("click", () => {
      handleAnalyticsTemplateJump(row.dataset.analyticsTemplateTarget);
    });
  });

  if (analyticsCoachingAction) {
    analyticsCoachingAction.addEventListener("click", () => {
      handleAnalyticsCoachingAction();
    });
  }

  if (automationAutopilotToggle) {
    automationAutopilotToggle.addEventListener("click", () => {
      setAutomationAutopilotEnabled(!state.automationAutopilotEnabled);
    });
  }

  automationAutopilotProposalCards.forEach((card) => {
    card.addEventListener("click", () => {
      setSelectedAutomationAutopilotProposal(card.dataset.automationAutopilotProposal);
    });
  });

  automationAutopilotActionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAutomationAutopilotAction(
        button.closest("[data-automation-autopilot-proposal]"),
        button.dataset.automationAutopilotAction
      );
    });
  });

  integrationCategoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedIntegrationCategory(button.dataset.integrationCategory);
    });
  });

  integrationCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleIntegrationCommand(button.dataset.integrationCommand);
    });
  });

  macroCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleMacroCommand(button.dataset.macroCommand).catch((error) => {
        console.warn("Macro command misslyckades.", error);
      });
    });
  });

  settingsChoiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleSettingsChoice(button.dataset.settingsChoice, button.dataset.settingsValue);
    });
  });

  settingsToggleInputs.forEach((input) => {
    input.addEventListener("change", () => {
      handleSettingsToggle(input.dataset.settingsToggle, input.checked);
    });
  });

  settingsActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleSettingsAction(button.dataset.settingsAction).catch((error) => {
        console.warn("Settings action misslyckades.", error);
      });
    });
  });

  showcaseFeatureButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedShowcaseFeature(button.dataset.showcaseFeature);
      setAuxStatus(showcaseStatus, "Funktionen är nu i fokus i nya CCO:s showcase-yta.", "success");
    });
  });

  showcaseJumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAppView(button.dataset.showcaseJump);
    });
  });

  mailFeedFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMailFeedFilter(button.dataset.mailFeedFilter, button.dataset.mailFeedFilterValue);
    });
  });

  mailFeedViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMailFeedView(button.dataset.mailFeedView, button.dataset.mailFeedViewValue);
    });
  });

  mailFeedDensityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMailFeedDensity(button.dataset.mailFeedDensity, button.dataset.mailFeedDensityValue);
    });
  });

  mailFeedSelectAllButtons.forEach((button) => {
    button.addEventListener("click", () => {
      toggleSelectAllMailFeed(button.dataset.mailFeedSelectAll);
    });
  });

  mailFeedBulkButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleMailFeedBulkCommand(
        button.dataset.mailFeedBulk,
        button.dataset.mailFeedBulkCommand
      ).catch((error) => {
        console.warn("Mail feed bulk action misslyckades.", error);
      });
    });
  });

  mailFeedUndoButtons.forEach((button) => {
    button.addEventListener("click", () => {
      restorePendingMailFeedDelete("Raderingen ångrades.");
    });
  });

  mailFeedCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handleMailFeedCommand(button.dataset.mailFeedCommand);
    });
  });

  macroModalCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMacroModalOpen(false);
    });
  });

  if (macroModalSubmitButton) {
    macroModalSubmitButton.addEventListener("click", () => {
      submitMacroModal().catch((error) => {
        console.warn("Macro modal-save misslyckades.", error);
      });
    });
  }

  settingsProfileModalCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSettingsProfileModalOpen(false);
    });
  });

  if (settingsProfileModalSubmitButton) {
    settingsProfileModalSubmitButton.addEventListener("click", () => {
      submitSettingsProfileModal().catch((error) => {
        console.warn("Settings profile-save misslyckades.", error);
      });
    });
  }

  confirmCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setConfirmDialogOpen(false);
    });
  });

  if (confirmSubmitButton) {
    confirmSubmitButton.addEventListener("click", () => {
      submitConfirmDialog().catch((error) => {
        console.warn("Confirm action misslyckades.", error);
      });
    });
  }

  automationCollaborationToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAutomationCollaborationOpen(!state.automationCollaborationOpen);
      setAutomationStatus(
        state.automationCollaborationOpen
          ? "Samarbetsläget visas i automationens högerpanel."
          : "Samarbetsläget doldes för att ge buildern mer arbetsro.",
        "success"
      );
    });
  });

  document.addEventListener("click", (event) => {
    if (
      state.moreMenuOpen &&
      !event.target.closest(".preview-more")
    ) {
      setMoreMenuOpen(false);
    }

    if (handleWorkspaceDocumentClick(event)) {
      return;
    }

    const customerMergeButton = event.target.closest("[data-customer-merge-action]");
    if (customerMergeButton) {
      handleCustomerMergeAction(
        customerMergeButton,
        customerMergeButton.dataset.customerMergeAction
      ).catch((error) => {
        console.warn("Customer merge suggestion misslyckades.", error);
      });
      return;
    }

    const mailFeedSelectionToggle = event.target.closest(".mail-feed-card-selection");
    if (mailFeedSelectionToggle) {
      const mailFeedSelectionInput = mailFeedSelectionToggle.querySelector("[data-mail-feed-select]");
      if (!mailFeedSelectionInput) return;
      event.preventDefault();
      event.stopPropagation();
      toggleMailFeedSelection(
        mailFeedSelectionInput.dataset.mailFeedSelect,
        mailFeedSelectionInput.dataset.mailFeedSelectKey
      );
      return;
    }

    const mailFeedOpenButton = event.target.closest("[data-mail-feed-open]");
    if (mailFeedOpenButton) {
      const feedKey = normalizeKey(mailFeedOpenButton.dataset.mailFeedOpen);
      const card = mailFeedOpenButton.closest("[data-mail-feed-item]");
      if (card) {
        setSelectedMailFeedItem(feedKey, card.dataset.mailFeedKey);
      }
      if (feedKey === "later") {
        handleMailFeedCommand("resume");
      } else {
        handleMailFeedCommand("history");
      }
      return;
    }

    const mailFeedCard = event.target.closest("[data-mail-feed-item]");
    if (mailFeedCard) {
      setSelectedMailFeedItem(mailFeedCard.dataset.mailFeedItem, mailFeedCard.dataset.mailFeedKey);
      return;
    }

    const integrationToggleButton = event.target.closest("[data-integration-toggle]");
    if (integrationToggleButton) {
      const key = normalizeKey(integrationToggleButton.dataset.integrationToggle);
      handleIntegrationToggle(key).catch((error) => {
        console.warn("Integrations-toggle misslyckades.", error);
      });
      return;
    }

    const macroCardButton = event.target.closest("[data-macro-action]");
    if (macroCardButton) {
      handleMacroCardAction(
        macroCardButton.dataset.macroAction,
        macroCardButton.dataset.macroKey
      ).catch((error) => {
        console.warn("Macro action misslyckades.", error);
      });
      return;
    }

  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.confirmDialog.open) {
      setConfirmDialogOpen(false);
      return;
    }

    if (event.key === "Escape" && state.settingsProfileModal.open) {
      setSettingsProfileModalOpen(false);
      return;
    }

    if (event.key === "Escape" && state.macroModal.open) {
      setMacroModalOpen(false);
      return;
    }

    if (event.key === "Escape" && state.moreMenuOpen) {
      setMoreMenuOpen(false);
      return;
    }

    if (handleWorkspaceDocumentKeydown(event)) {
      return;
    }

    if (event.key === "Escape" && state.customerMergeModalOpen) {
      setCustomerMergeOpen(false);
      return;
    }

    if (event.key === "Escape" && state.customerSettingsOpen) {
      setCustomerSettingsOpen(false);
      return;
    }

    if (event.key === "Escape" && state.customerRuntime.splitModalOpen) {
      setCustomerSplitOpen(false);
      return;
    }

    if (event.key === "Escape" && state.customerImport.open) {
      setCustomerImportOpen(false);
      return;
    }

  });

  window.addEventListener("resize", normalizeWorkspaceState);
  state.customerFilter = normalizeText(customerFilterSelect?.value) || "Alla kunder";
  setSelectedCustomerIdentity("");
  setSelectedAnalyticsPeriod("week");
  setSelectedAutomationLibrary("email");
  setSelectedAutomationNode("trigger");
  setSelectedAutomationTemplate("churn_guard");
  setSelectedAutomationVersion("v3_0");
  setSelectedAutomationAutopilotProposal("merge_duplicates");
  setAutomationAutopilotEnabled(true);
  setAutomationCollaborationOpen(false);
  setAutomationCanvasScale(100);
  setAutomationRailCollapsed(false);
  renderAutomationTestingState();
  renderAutomationVersions();
  renderAutomationSuggestions();
  setAutomationSubnav("Byggare");
  renderIntegrations();
  renderMacros();
  renderSettings();
  setSelectedShowcaseFeature("command_palette");
  applyCustomerFilters();
  setCustomerSuggestionsHidden(false);
  renderCustomerDetailTools();
  renderCustomerBatchSelection();
  setMoreMenuOpen(false);
  setCustomerMergeOpen(false);
  setCustomerSettingsOpen(false);
  setCustomersStatus("", "");
  setAutomationStatus("", "");
  setAuxStatus(laterStatus, "", "");
  setAuxStatus(sentStatus, "", "");
  setAuxStatus(integrationsStatus, "", "");
  setAuxStatus(macrosStatus, "", "");
  setAuxStatus(settingsStatus, "", "");
  setAuxStatus(showcaseStatus, "", "");
  initializeWorkspaceSurface();
  const initialShellViewState = readShellViewStateFromLocation();
  if (initialShellViewState.view !== "conversations") {
    setAppView(initialShellViewState.view);
  }
  if (
    resolveShellView(initialShellViewState.view) === "automation" &&
    initialShellViewState.view === "automation" &&
    initialShellViewState.automationSection
  ) {
    setAutomationSubnav(initialShellViewState.automationSection);
  } else {
    syncShellViewToLocation();
  }

  function getRuntimeMailboxParitySnapshot() {
    const queueListMode = asText(queueHistoryList?.dataset?.queueListMode, "");
    const visibleThreads = getFilteredRuntimeThreads();
    const mailboxScopedThreads = getMailboxScopedRuntimeThreads();
    const queueScopedThreads = getQueueScopedRuntimeThreads();
    const allThreads = asArray(state.runtime?.threads);
    const domCards = Array.from(
      queueHistoryList?.querySelectorAll("[data-runtime-thread], [data-history-conversation], .thread-card, .queue-history-item") ||
        []
    );

    return {
      capturedAt: new Date().toISOString(),
      runtimeMode: getRuntimeMode(),
      flags: {
        loading: state.runtime.loading === true,
        live: state.runtime.live === true,
        offline: state.runtime.offline === true,
        authRequired: state.runtime.authRequired === true,
        error: asText(state.runtime.error),
      },
      selection: {
        selectedMailboxIds: workspaceSourceOfTruth.getSelectedMailboxIds(),
        requestedMailboxIds: getRequestedRuntimeMailboxIds(),
        selectedOwnerKey: workspaceSourceOfTruth.getSelectedOwnerKey(),
        activeLaneId: workspaceSourceOfTruth.getActiveLaneId(),
        selectedThreadId: workspaceSourceOfTruth.getSelectedThreadId(),
      },
      counts: {
        allThreads: allThreads.length,
        mailboxScopedThreads: mailboxScopedThreads.length,
        queueScopedThreads: queueScopedThreads.length,
        visibleThreads: visibleThreads.length,
      },
      dom: {
        queueListMode,
        cardCount: domCards.length,
        liveCardCount: domCards.filter((node) => node.classList?.contains("thread-card-live")).length,
        historyCardCount: domCards.filter((node) => node.classList?.contains("queue-history-item")).length,
        selectedCardCount: domCards.filter((node) => node.classList?.contains("is-selected")).length,
        firstCards: domCards.slice(0, 6).map((node) => ({
          className: asText(node.className),
          runtimeThreadId: asText(node.getAttribute?.("data-runtime-thread")),
          historyConversationId: asText(node.getAttribute?.("data-history-conversation")),
          text: compactRuntimeCopy(asText(node.innerText), "", 160),
        })),
      },
      visibleThreads: visibleThreads.slice(0, 8).map((thread) => summarizeRuntimeThreadForDiagnostics(thread)),
      selectedThread: summarizeRuntimeThreadForDiagnostics(getSelectedRuntimeThread()),
      mailboxDiagnostics:
        state.runtime?.mailboxDiagnostics && typeof state.runtime.mailboxDiagnostics === "object"
          ? JSON.parse(JSON.stringify(state.runtime.mailboxDiagnostics))
          : null,
      reentry: {
        snapshot: getRuntimeReentrySnapshot(),
        outcome: getRuntimeReentryOutcome(),
      },
    };
  }

  function summarizeMailBodyBlockForDiagnostics(block) {
    if (!block || typeof block !== "object") return null;
    const text = asText(block.text);
    const html = asText(block.html);
    return {
      textLength: text.length,
      htmlLength: html.length,
      previewText: compactRuntimeCopy(text, "", 180),
      previewHtmlText: compactRuntimeCopy(html.replace(/<[^>]+>/g, " "), "", 180),
    };
  }

  function summarizeMailThreadMessageForDiagnostics(message) {
    if (!message || typeof message !== "object") return null;
    const assets =
      message?.assets && typeof message.assets === "object" ? message.assets : null;
    const familyCounts =
      assets?.familyCounts && typeof assets.familyCounts === "object"
        ? {
            attachment: asNumber(assets.familyCounts.attachment, 0),
            inline: asNumber(assets.familyCounts.inline, 0),
            external: asNumber(assets.familyCounts.external, 0),
          }
        : null;
    return {
      messageId: asText(message.messageId),
      direction: normalizeKey(message.direction),
      sentAt: asText(message.sentAt),
      mimeBacked: message.mimeBacked === true,
      contentMode: normalizeKey(message.contentSections?.mode),
      mimePreferredBodyKind: normalizeKey(message.contentSections?.mimePreferredBodyKind),
      primaryBody: summarizeMailBodyBlockForDiagnostics(message.primaryBody),
      signatureBlock: summarizeMailBodyBlockForDiagnostics(message.signatureBlock),
      quotedCount: asArray(message.quotedBlocks).length,
      systemCount: asArray(message.systemBlocks).length,
      assetCount: asNumber(
        assets?.assetCount,
        familyCounts
          ? familyCounts.attachment + familyCounts.inline + familyCounts.external
          : 0
      ),
      inlineAssetCount: asNumber(
        familyCounts?.inline,
        asArray(assets?.inlineAssetIds).length
      ),
      attachmentCount: asNumber(
        familyCounts?.attachment,
        asArray(assets?.attachmentIds).length
      ),
      externalAssetCount: asNumber(familyCounts?.external, 0),
      previewTextLength: asText(message.presentation?.previewText).length,
      conversationTextLength: asText(message.presentation?.conversationText).length,
      conversationHtmlLength: asText(message.presentation?.conversationHtml).length,
    };
  }

  function summarizeMailDocumentForDiagnostics(mailDocument) {
    if (!mailDocument || typeof mailDocument !== "object") return null;
    const assets = asArray(mailDocument.assets);
    const familyCounts =
      mailDocument?.assetSummary?.familyCounts &&
      typeof mailDocument.assetSummary.familyCounts === "object"
        ? {
            attachment: asNumber(mailDocument.assetSummary.familyCounts.attachment, 0),
            inline: asNumber(mailDocument.assetSummary.familyCounts.inline, 0),
            external: asNumber(mailDocument.assetSummary.familyCounts.external, 0),
          }
        : null;
    return {
      sourceDepth: normalizeKey(mailDocument.sourceDepth),
      mimeAvailable: mailDocument.mimeAvailable === true,
      mimeBacked: mailDocument.mimeBacked === true,
      primaryBodyTextLength: asText(mailDocument.primaryBodyText).length,
      primaryBodyHtmlLength: asText(mailDocument.primaryBodyHtml).length,
      previewTextLength: asText(mailDocument.previewText).length,
      assetCount: asNumber(
        mailDocument?.assetSummary?.assetCount,
        assets.length
      ),
      inlineAssetCount: asNumber(
        familyCounts?.inline,
        assets.filter((asset) => normalizeKey(asset?.family) === "inline").length
      ),
      attachmentCount: asNumber(
        familyCounts?.attachment,
        assets.filter((asset) => normalizeKey(asset?.family) === "attachment").length
      ),
      externalAssetCount: asNumber(
        familyCounts?.external,
        assets.filter((asset) => normalizeKey(asset?.family) === "external").length
      ),
      mimeTriggerReasons: asArray(mailDocument.mime?.triggerReasons)
        .map((reason) => normalizeKey(reason))
        .filter(Boolean),
      mimePreferredBodyKind: normalizeKey(mailDocument.mime?.preferredBodyKind),
    };
  }

  function getRuntimeFocusThreadSnapshot() {
    const selectedThreadTruth = getSelectedRuntimeThreadTruth();
    const focusThread = selectedThreadTruth.focusThread;
    const focusReadState = getRuntimeFocusReadState(focusThread);
    const threadDocument =
      focusThread?.threadDocument && typeof focusThread.threadDocument === "object"
        ? focusThread.threadDocument
        : null;
    const messages = asArray(focusThread?.messages)
      .slice(0, 6)
      .map((message) => ({
        id: asText(message?.id),
        role: normalizeKey(message?.role),
        latest: message?.latest === true,
        bodyLength: asText(message?.body).length,
        conversationBodyLength: asText(message?.conversationBody).length,
        conversationBodyHtmlLength: asText(message?.conversationBodyHtml).length,
        mailThreadMessage: summarizeMailThreadMessageForDiagnostics(message?.mailThreadMessage),
        mailDocument: summarizeMailDocumentForDiagnostics(message?.mailDocument),
      }));

    return {
      capturedAt: new Date().toISOString(),
      selectedThreadTruth: {
        selectedThreadId: asText(selectedThreadTruth?.selectedThreadId),
        queueHistoryConversationId: asText(selectedThreadTruth?.queueHistoryConversationId),
        runtimeMode: normalizeKey(selectedThreadTruth?.runtimeMode),
        leftColumnMode: normalizeKey(selectedThreadTruth?.leftColumnMode),
        runtimeSource: normalizeKey(selectedThreadTruth?.runtimeSource),
        focusSource: normalizeKey(selectedThreadTruth?.focusSource),
        focusScopeActive: selectedThreadTruth?.focusScopeActive === true,
        focusTruthPrimaryEnabled: selectedThreadTruth?.focusTruthPrimaryEnabled === true,
        offlineHistoryReadOnly: selectedThreadTruth?.offlineHistoryReadOnly === true,
      },
      selectedFocusThread: summarizeRuntimeThreadForDiagnostics(focusThread),
      focusReadState: {
        source: normalizeKey(focusReadState?.source),
        truthDriven: focusReadState?.truthDriven === true,
        foundationDriven: focusReadState?.foundationDriven === true,
        fallbackDriven: focusReadState?.fallbackDriven === true,
        readOnly: focusReadState?.readOnly === true,
        label: asText(focusReadState?.label),
        detail: asText(focusReadState?.detail),
        foundationLabel: asText(focusReadState?.foundationLabel),
        fallbackLabel: asText(focusReadState?.fallbackLabel),
        waveLabel: asText(focusReadState?.waveLabel),
      },
      foundationState:
        focusThread?.foundationState && typeof focusThread.foundationState === "object"
          ? JSON.parse(JSON.stringify(focusThread.foundationState))
          : null,
      threadDocument: threadDocument
        ? {
            sourceStore: asText(threadDocument.sourceStore),
            messageCount: asArray(threadDocument.messages).length,
            hasMimeBackedMessages: threadDocument.hasMimeBackedMessages === true,
            hasQuotedMessages: threadDocument.hasQuotedMessages === true,
            hasSignatureBlocks: threadDocument.hasSignatureBlocks === true,
            hasSystemBlocks: threadDocument.hasSystemBlocks === true,
          }
        : null,
      messages,
    };
  }

  function getRuntimeOpenFlowSnapshot() {
    const selectedThreadTruth = getSelectedRuntimeThreadTruth();
    const selectedRuntimeThread = selectedThreadTruth.runtimeThread;
    const selectedFocusThread = selectedThreadTruth.focusThread;
    const focusReadState = getRuntimeFocusReadState(selectedFocusThread);
    const openFlowDiagnostics =
      state.runtime?.openFlowDiagnostics && typeof state.runtime.openFlowDiagnostics === "object"
        ? JSON.parse(JSON.stringify(state.runtime.openFlowDiagnostics))
        : null;

    return {
      capturedAt: new Date().toISOString(),
      selectedThreadId: asText(workspaceSourceOfTruth.getSelectedThreadId()),
      selectedThreadTruth: {
        selectedThreadId: asText(selectedThreadTruth?.selectedThreadId),
        queueHistoryConversationId: asText(selectedThreadTruth?.queueHistoryConversationId),
        runtimeMode: normalizeKey(selectedThreadTruth?.runtimeMode),
        leftColumnMode: normalizeKey(selectedThreadTruth?.leftColumnMode),
        runtimeSource: normalizeKey(selectedThreadTruth?.runtimeSource),
        focusSource: normalizeKey(selectedThreadTruth?.focusSource),
        focusScopeActive: selectedThreadTruth?.focusScopeActive === true,
        focusTruthPrimaryEnabled: selectedThreadTruth?.focusTruthPrimaryEnabled === true,
        offlineHistoryReadOnly: selectedThreadTruth?.offlineHistoryReadOnly === true,
      },
      selectedRuntimeThread: summarizeRuntimeThreadForDiagnostics(selectedRuntimeThread),
      selectedFocusThread: summarizeRuntimeThreadForDiagnostics(selectedFocusThread),
      focusReadState: {
        source: normalizeKey(focusReadState?.source),
        truthDriven: focusReadState?.truthDriven === true,
        foundationDriven: focusReadState?.foundationDriven === true,
        fallbackDriven: focusReadState?.fallbackDriven === true,
        readOnly: focusReadState?.readOnly === true,
        label: asText(focusReadState?.label),
        detail: asText(focusReadState?.detail),
        foundationLabel: asText(focusReadState?.foundationLabel),
        fallbackLabel: asText(focusReadState?.fallbackLabel),
      },
      diagnostics: openFlowDiagnostics,
    };
  }

  async function openRuntimeHistoryConversationForDiagnostics({
    conversationId = "",
    mailboxIds = [],
  } = {}) {
    const nextConversationId = asText(conversationId);
    const scopedMailboxIds = asArray(mailboxIds)
      .map((value) => canonicalizeRuntimeMailboxId(value))
      .filter(Boolean);
    if (!nextConversationId) {
      return {
        ok: false,
        error: "conversationId saknas.",
      };
    }

    let historyPayload = null;
    let historyItems = [];
    let historyError = "";
    try {
      const params = new URLSearchParams();
      if (scopedMailboxIds.length) {
        params.set("mailboxIds", scopedMailboxIds.join(","));
      }
      params.set("lookbackDays", "1095");
      params.set("resultTypes", "message");
      params.set("limit", "24");
      params.set("conversationId", nextConversationId);
      historyPayload = await apiRequest(`/api/v1/cco/runtime/history/search?${params.toString()}`);
      historyItems = buildQueueHistoryItems(historyPayload?.results);
    } catch (error) {
      historyError = error instanceof Error ? error.message : String(error);
    }

    state.runtime.queueHistory = {
      ...state.runtime.queueHistory,
      open: true,
      loading: false,
      loaded: historyItems.length > 0 || historyError !== "",
      error: historyError,
      items: historyItems.length > 0 ? historyItems : state.runtime.queueHistory.items,
      selectedConversationId: nextConversationId,
      scopeKey: scopedMailboxIds.length
        ? getQueueHistoryScopeKey(scopedMailboxIds)
        : asText(state.runtime.queueHistory?.scopeKey),
    };

    selectOfflineHistoryConversation(nextConversationId, {
      reloadBootstrap: false,
      mailboxIds: scopedMailboxIds,
      hydrate: false,
    });
    const hydrationResult = await requestRuntimeThreadHydration(nextConversationId, {
      mailboxIds: scopedMailboxIds,
    }).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      reason: "history_open_diagnostics_hydration_failed",
    }));
    applyFocusSection("conversation");

    return {
      ok: true,
      conversationId: nextConversationId,
      mailboxIds: scopedMailboxIds,
      historySource: normalizeKey(historyPayload?.source),
      historyResultCount: historyItems.length,
      historyError,
      hydrationResult:
        hydrationResult && typeof hydrationResult === "object"
          ? JSON.parse(JSON.stringify(hydrationResult))
          : hydrationResult,
    };
  }

  window.MajorArcanaPreviewDiagnostics = Object.freeze({
    captureRuntimeReentrySnapshot,
    restoreRuntimeReentrySnapshot,
    getRuntimeMailboxParitySnapshot,
    getRuntimeFocusThreadSnapshot,
    getRuntimeOpenFlowSnapshot,
    getRuntimeReentrySnapshot,
    getRuntimeReentryOutcome,
    openRuntimeHistoryConversationForDiagnostics,
  });
})();
