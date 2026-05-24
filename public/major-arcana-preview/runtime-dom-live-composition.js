(() => {
  function createDomLiveComposition({ dom = {}, helpers = {}, state, windowObject = window }) {
    const {
      canvas,
      closeButtons = [],
      contextButtons = [],
      conversationCollapseButton,
      conversationHistory,
      destinationButtons = [],
      focusActionRows = [],
      focusHistorySearchInput,
      focusNotesRefreshButton,
      focusSignalRows = [],
      focusTabButtons = [],
      intelActionRows = [],
      laterCloseButtons = [],
      laterOptionButtons = [],
      mailboxAdminCloseButtons = [],
      mailboxAdminFeedback,
      mailboxAdminResetButton,
      mailboxAdminList,
      mailboxAdminOpenButton,
      mailboxAdminSaveButton,
      mailboxAdminSignatureButtons = [],
      mailboxMenuGrid,
      noteCloseButtons = [],
      noteFeedback,
      noteModeCloseButtons = [],
      noteModeOptionButtons = [],
      noteOpenButtons = [],
      notePrioritySelect,
      noteSaveButton,
      noteTagAddButton,
      noteTagInput,
      noteTagsRow,
      noteText,
      noteVisibilitySelect,
      openButtons = [],
      ownerMenuGrid,
      ownerMenuToggle,
      queueActionRows = [],
      queueCollapsedList,
      queueContent,
      queueHistoryList,
      queueHistoryLoadMoreButton,
      queueHistoryToggle,
      queueLaneButtons = [],
      queueViewJumpButtons = [],
      resizeHandles = [],
      scheduleCloseButtons = [],
      scheduleFeedback,
      scheduleOpenButtons = [],
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
      studioRefineButtons = [],
      studioSaveDraftButton,
      studioSendButton,
      studioShell,
      studioTemplateButtons = [],
      studioToneButtons = [],
      studioToolButtons = [],
      studioTrackButtons = [],
      templateButtons = [],
    } = dom;

    let runtimeAuthRecoveryTimer = 0;
    let runtimeLiveRefreshTimer = 0;
    let bootstrapThreadSelectTimer = 0;
    const BOOTSTRAP_THREAD_SELECT_DEBOUNCE_MS = 200;
    const AUTH_RECOVERY_INITIAL_DELAY_MS = 2000;
    const AUTH_RECOVERY_MAX_DELAY_MS = 30000;
    let runtimeAuthRecoveryDelayMs = AUTH_RECOVERY_INITIAL_DELAY_MS;
    let runtimeAuthRecoveryPollingEnabled = false;

    // Self-healing för transient runtime-fel (502/503/504/network).
    // Auth-fel hanteras via scheduleRuntimeAuthRecovery; detta är för icke-auth-fel.
    let runtimeTransientRetryTimer = 0;
    let runtimeTransientRetryAttempt = 0;
    const RUNTIME_TRANSIENT_RETRY_INITIAL_MS = 5000;
    const RUNTIME_TRANSIENT_RETRY_MAX_MS = 30000;
    const RUNTIME_TRANSIENT_RETRY_GROWTH = 1.7;
    const RUNTIME_TRANSIENT_RETRY_MAX_ATTEMPTS = 12;
    let runtimeVisibilityRecoveryBound = false;
    let adminTokenStorageRecoveryBound = false;
    const RUNTIME_AUTH_REQUIRED_USER_MESSAGE =
      "Logga in igen i admin för att läsa aktiv kö, historikstöd och mejlkontostatus.";

    const {
      CCO_DEFAULT_REPLY_SENDER,
      CCO_DEFAULT_SIGNATURE_PROFILE,
      DEFAULT_WORKSPACE,
      FOCUS_ACTIONS = [],
      FOCUS_SIGNALS = [],
      INTEL_ACTIONS = [],
      QUEUE_ACTIONS = [],
      addTagToActiveDraft,
      apiRequest,
      applyFocusSection,
      applyLaterOption,
      applyMailboxAdminSignatureCommand,
      applyNoteModePreset,
      applyStudioMode,
      applyStudioBookingUpdateToolPhaseDraft,
      applyStudioRefineSelection,
      applyStudioTemplateSelection,
      applyStudioToneSelection,
      applyStudioTrackSelection,
      applyTemplateToActiveDraft,
      asArray,
      asNumber,
      asText,
      buildRuntimeMailboxLoadDiagnostics,
      buildRuntimeMailboxCapabilities,
      buildHistoryReadoutHref,
      hydrateRuntimeThreadWithHistoryPayload,
      buildLiveThreads,
      buildMailboxCatalog,
      buildReauthUrl,
      buildTruthPrimaryWorklistConsumerHref,
      buildWorklistDataFromTruthPrimaryOnly,
      clearAdminToken,
      canonicalizeRuntimeMailboxId,
      createIdempotencyKey,
      decorateStaticPills,
      ensureCustomerRuntimeProfilesFromLive,
      ensureRuntimeMailboxSelection,
      ensureRuntimeSelection,
      ensureStudioState,
      findRuntimeMailboxByScopeId,
      getFilteredRuntimeThreads,
      getMailFeedRuntimeThreads,
      getAdminToken,
      getAvailableRuntimeMailboxes,
      getMailboxScopedRuntimeThreads,
      getOrderedQueueLaneIds,
      getQueueLaneThreads,
      getQueueScopedRuntimeThreads,
      getQueueHistoryScopeKey,
      getRuntimeLeftColumnState,
      getRuntimeFocusReadState,
      getRuntimeStudioTruthState,
      syncSelectedCustomerIdentityForThread,
      hasMeaningfulRuntimeReentryState,
      getRequestedRuntimeMailboxIds,
      getSelectedRuntimeThreadTruth,
      getTruthPrimaryStudioMailboxIds,
      getTruthPrimaryFocusMailboxIds,
      getTruthPrimaryWorklistMailboxIds,
      getSelectedRuntimeFocusThread,
      getSelectedRuntimeThread,
      mergeTruthPrimaryWorklistData,
      reconcileRuntimeSelection,
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
      loadBookingCaseList,
      loadQueueHistory,
      normalizeKey,
      normalizeMailboxId,
      normalizeCustomMailboxDefinition,
      normalizeText,
      runtimeConversationIdsMatch,
      normalizeVisibleRuntimeScope,
      normalizeWorkspaceState,
      captureRuntimeReentrySnapshot: captureRuntimeReentrySnapshotState,
      getRuntimeReentryOutcome: getRuntimeReentryOutcomeState,
      getRuntimeReentrySnapshot: getRuntimeReentrySnapshotState,
      restoreRuntimeReentrySnapshot: restoreRuntimeReentrySnapshotState,
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
      scheduleRuntimeConversationShell,
      renderRuntimeFocusConversation,
      renderRuntimeIntel,
      renderQueueHistorySection,
      syncRuntimeVisualStateMachine,
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
      scheduleWorkspacePrefsSave,
      setAppView,
      setContextCollapsed,
      setFeedback,
      setLaterOpen,
      setMailboxAdminEditingMailbox,
      setMailboxAdminOpen,
      setNoteModeOpen,
      setNoteOpen,
      openFocusContextPanel,
      setFocusContextOpen,
      openBookingOperatorSurface,
      openBookingPanel,
      setBookingOpen,
      setScheduleOpen,
      setStudioFeedback,
      setStudioOpen,
      startResize,
      markStudioToolUsed,
      syncCurrentNoteDraftFromForm,
      syncNoteCount,
      workspaceLimits,
      workspaceSourceOfTruth,
      workspaceState,
    } = helpers;

    let interactionsBound = false;
    let liveRuntimeRequestSequence = 0;
    let liveThreadHydrationSequence = 0;
    let runtimeAnalyzeInboxFlight = null;
    let runtimeAnalyzeInboxCompletedAt = 0;
    const RUNTIME_ANALYZE_INBOX_MIN_INTERVAL_MS = 55000;
    let runtimeMailboxScopeLoadTimer = 0;
    const RUNTIME_MAILBOX_SCOPE_DEBOUNCE_MS = 450;
    let mobileInboxLoadPromise = null;
    let mobileInboxDeferredBootstrap = false;

    function paintRuntimeShell(scope = "all") {
      try {
        if (windowObject.matchMedia("(max-width: 768px)").matches) {
          const previewShellNode = windowObject.document?.querySelector?.(".preview-shell");
          const scopeKey = normalizeKey(scope);
          if (previewShellNode?.hidden === true && scopeKey !== "chrome") {
            return;
          }
        }
      } catch {
        /* ignore */
      }
      if (typeof scheduleRuntimeConversationShell === "function") {
        scheduleRuntimeConversationShell(scope);
        return;
      }
      if (typeof renderRuntimeConversationShell !== "function") return;
      if (normalizeKey(scope) === "all") {
        renderRuntimeConversationShell();
        return;
      }
      renderRuntimeConversationShell({ scope: normalizeKey(scope) || "all" });
    }

    function runtimeHasLiveThreads(threads = state.runtime?.threads) {
      return asArray(threads).some(
        (thread) => normalizeKey(thread?.worklistSource || "") !== "demo"
      );
    }

    function getTruthConsumerSignature(payload) {
      if (!payload || typeof payload !== "object") return "";
      const generatedAt = asText(payload.generatedAt || payload.metadata?.generatedAt);
      const rowCount = String(asArray(payload.rows).length);
      const deltaAt = asText(
        payload.deltaCoverage?.lastAppliedAt ||
          payload.deltaCoverage?.lastSuccessfulSyncAt ||
          payload.deltaCoverage?.updatedAt
      );
      return `${generatedAt}|${rowCount}|${deltaAt}`;
    }

    function resolveTruthPrimaryEnrichmentLegacyData(truthPrimaryPayload) {
      const enrichment =
        truthPrimaryPayload?.enrichment && typeof truthPrimaryPayload.enrichment === "object"
          ? truthPrimaryPayload.enrichment
          : null;
      if (!enrichment) {
        return { conversationWorklist: [], needsReplyToday: [], metadata: {} };
      }
      return {
        conversationWorklist: asArray(enrichment.conversationWorklist),
        needsReplyToday: asArray(enrichment.needsReplyToday),
        metadata: {
          generatedAt: asText(enrichment.generatedAt),
          entryId: asText(enrichment.entryId),
          capabilityName: asText(enrichment.capabilityName),
          rowCount: Number(enrichment.rowCount || 0),
        },
      };
    }

    function hasTruthPrimaryServerEnrichment(truthPrimaryPayload) {
      const enrichment = resolveTruthPrimaryEnrichmentLegacyData(truthPrimaryPayload);
      return (
        asArray(enrichment.conversationWorklist).length > 0 ||
        asArray(enrichment.needsReplyToday).length > 0
      );
    }

    function persistRuntimeThreadCacheIfReady({ runtimeMailboxIds = [] } = {}) {
      try {
        if (!windowObject?.CcoThreadCache?.saveThreads || !runtimeHasLiveThreads()) return;
        windowObject.CcoThreadCache.saveThreads(state.runtime.threads, {
          mailboxIds: runtimeMailboxIds,
          lastEnrichedAt: asText(state.runtime?.lastEnrichedAt),
        });
      } catch (_cacheError) {
        /* cache är best-effort */
      }
    }

    function markRuntimeEnrichmentReadyIfAvailable(truthPrimaryPayload = null) {
      if (!runtimeHasLiveThreads()) return false;
      const hasServerEnrichment =
        truthPrimaryPayload && hasTruthPrimaryServerEnrichment(truthPrimaryPayload);
      const hasCachedEnrichment = Boolean(asText(state.runtime?.lastEnrichedAt));
      if (!hasServerEnrichment && !hasCachedEnrichment) return false;
      state.runtime.loaded = true;
      state.runtime.staleCacheActive = false;
      state.runtime.loading = false;
      return true;
    }

    function paintTruthPrimaryWorklistFromPayload(
      truthPrimaryPayload,
      {
        runtimeMailboxIds = [],
        configuredTruthPrimaryMailboxIds = [],
        activeTruthPrimaryMailboxIds = [],
        status = {},
        mergeWithExisting = true,
        detectNewMail = true,
      } = {}
    ) {
      const truthRowCount = asArray(truthPrimaryPayload?.rows).length;
      if (truthRowCount === 0) {
        return { applied: false, hasNewMail: false, threadCount: 0 };
      }

      const activeIds = activeTruthPrimaryMailboxIds.length
        ? activeTruthPrimaryMailboxIds
        : configuredTruthPrimaryMailboxIds;
      const truthOnlyWorklist = buildWorklistDataFromTruthPrimaryOnly(truthPrimaryPayload, {
        truthPrimaryMailboxIds: activeIds,
        enrichmentLegacyData: resolveTruthPrimaryEnrichmentLegacyData(truthPrimaryPayload),
      });
      let incomingThreads = carryRuntimeCustomerIdentity(
        buildLiveThreads(truthOnlyWorklist, {
          historyMessages: [],
          historyEvents: [],
        })
      );
      incomingThreads = sortRuntimeThreadsDeterministic(incomingThreads);

      let hasNewMail = false;
      if (mergeWithExisting && runtimeHasLiveThreads()) {
        const existingById = new Map(
          asArray(state.runtime.threads)
            .filter((thread) => normalizeKey(thread?.worklistSource || "") !== "demo")
            .map((thread) => [normalizeKey(thread?.id), thread])
        );
        const beforeCount = existingById.size;
        incomingThreads.forEach((thread) => {
          const threadId = normalizeKey(thread?.id);
          if (!threadId || existingById.has(threadId)) return;
          existingById.set(threadId, thread);
          if (detectNewMail) hasNewMail = true;
        });
        state.runtime.threads = sortRuntimeThreadsDeterministic([...existingById.values()]);
        if (detectNewMail) {
          hasNewMail = hasNewMail || existingById.size > beforeCount;
        }
      } else {
        state.runtime.threads = incomingThreads;
        hasNewMail = detectNewMail && incomingThreads.length > 0;
      }

      const enrichmentLegacy = resolveTruthPrimaryEnrichmentLegacyData(truthPrimaryPayload);
      state.runtime.lastEnrichedAt = asText(enrichmentLegacy?.metadata?.generatedAt);

      state.runtime.truthPrimaryLegacyThreads = [];
      state.runtime.mailboxes = buildMailboxCatalog(
        state.runtime.threads.map((thread) => {
          const mailboxAddress = asText(thread?.mailboxAddress);
          return {
            mailboxId: mailboxAddress,
            mailboxAddress,
            userPrincipalName: mailboxAddress,
          };
        }),
        {
          sourceMailboxIds: Array.from(
            new Set([...runtimeMailboxIds, ...asArray(status?.graph?.allowlistMailboxIds)])
          ),
          mailboxCapabilities: state.runtime.mailboxCapabilities,
        }
      );
      state.runtime.staleCacheActive = !hasNewMail;
      state.runtime.loading = false;
      state.runtime.truthPrimaryCutover = {
        enabled: true,
        configuredMailboxIds: configuredTruthPrimaryMailboxIds,
        activeMailboxIds: activeIds,
        fallbackReason: "",
        lastAppliedAt: new Date().toISOString(),
      };
      setRuntimeModeState("live", {
        live: true,
        offline: false,
        authRequired: false,
        error: "",
      });
      if (hasTruthPrimaryServerEnrichment(truthPrimaryPayload)) {
        markRuntimeEnrichmentReadyIfAvailable(truthPrimaryPayload);
        persistRuntimeThreadCacheIfReady({ runtimeMailboxIds });
      }
      return {
        applied: true,
        hasNewMail,
        threadCount: asArray(state.runtime.threads).length,
      };
    }

    async function refreshRuntimeWorklistFromTruthDelta({
      runtimeMailboxIds = [],
      preferredThreadId = "",
      status = {},
      runAnalyzeInboxForNewMail = true,
    } = {}) {
      const configuredTruthPrimaryMailboxIds =
        typeof getTruthPrimaryWorklistMailboxIds === "function"
          ? getTruthPrimaryWorklistMailboxIds({ mailboxIds: runtimeMailboxIds })
          : [];
      if (
        !configuredTruthPrimaryMailboxIds.length ||
        typeof buildTruthPrimaryWorklistConsumerHref !== "function"
      ) {
        return { refreshed: false, hasNewMail: false };
      }

      const truthPrimaryPayload = await apiRequest(
        buildTruthPrimaryWorklistConsumerHref(configuredTruthPrimaryMailboxIds)
      );
      const consumerSig = getTruthConsumerSignature(truthPrimaryPayload);
      const previousSig = asText(state.runtime?.lastTruthConsumerSig);
      const paintResult = paintTruthPrimaryWorklistFromPayload(truthPrimaryPayload, {
        runtimeMailboxIds,
        configuredTruthPrimaryMailboxIds,
        activeTruthPrimaryMailboxIds: configuredTruthPrimaryMailboxIds,
        status,
        mergeWithExisting: true,
      });
      state.runtime.lastTruthConsumerSig = consumerSig;
      if (!paintResult.applied) {
        return { refreshed: false, hasNewMail: false };
      }

      paintRuntimeShell("queue");
      if (typeof syncRuntimeVisualStateMachine === "function") {
        syncRuntimeVisualStateMachine();
      }
      try {
        if (windowObject?.CcoThreadCache && runtimeHasLiveThreads()) {
          windowObject.CcoThreadCache.saveThreads(state.runtime.threads, {
            mailboxIds: runtimeMailboxIds,
            lastEnrichedAt: asText(state.runtime?.lastEnrichedAt),
          });
        }
      } catch (_cacheError) {
        /* cache är best-effort */
      }

      const hasNewMail =
        paintResult.hasNewMail === true ||
        (Boolean(previousSig) && consumerSig !== previousSig && paintResult.threadCount > 0);
      if (!hasNewMail) {
        markRuntimeEnrichmentReadyIfAvailable(truthPrimaryPayload);
      }
      if (hasNewMail && runAnalyzeInboxForNewMail) {
        const analyzeRequest = await requestAnalyzeInboxPayload(runtimeMailboxIds, {
          force: true,
        });
        if (analyzeRequest?.skipped !== true) {
          await continueLiveRuntimeFromAnalyzeInbox({
            analysisPayload: analyzeRequest?.payload || analyzeRequest,
            runtimeMailboxIds,
            preferredThreadId,
            isCurrentRequest: () => true,
            truthPrimaryPayload,
            activeTruthPrimaryMailboxIds: configuredTruthPrimaryMailboxIds,
            configuredTruthPrimaryMailboxIds,
            configuredFocusTruthMailboxIds:
              typeof getTruthPrimaryFocusMailboxIds === "function"
                ? getTruthPrimaryFocusMailboxIds({ mailboxIds: runtimeMailboxIds })
                : [],
            configuredStudioTruthMailboxIds:
              typeof getTruthPrimaryStudioMailboxIds === "function"
                ? getTruthPrimaryStudioMailboxIds({ mailboxIds: runtimeMailboxIds })
                : [],
            shouldApplyPhaseA: true,
            isBackgroundRefresh: true,
            options: {},
            status,
          });
        }
      } else if (runtimeHasLiveThreads()) {
        state.runtime.loaded = true;
        state.runtime.staleCacheActive = false;
        clearRuntimeBackgroundSync();
      }

      return { refreshed: true, hasNewMail };
    }

    function markRuntimeNonBlockingSync({ preserveStaleCache = true } = {}) {
      state.runtime.loading = false;
      state.runtime.backgroundSyncActive = true;
      if (preserveStaleCache && runtimeHasLiveThreads()) {
        state.runtime.staleCacheActive = true;
      }
    }

    function clearRuntimeBackgroundSync() {
      state.runtime.backgroundSyncActive = false;
    }
    let draggedQueueLaneId = "";
    const FULL_MAILBOX_LOOKBACK_DAYS = 1095;
    const RUNTIME_THREAD_HISTORY_CACHE_TTL_MS = 90_000;
    const RUNTIME_THREAD_HISTORY_CACHE_MAX = 48;
    const RUNTIME_THREAD_HISTORY_INITIAL_LIMIT = 80;
    const runtimeThreadHistoryPayloadCache = new Map();

    function normalizeRuntimeHistoryMailboxList(mailboxIds = []) {
      return [...asArray(mailboxIds)]
        .map((value) =>
          typeof canonicalizeRuntimeMailboxId === "function"
            ? canonicalizeRuntimeMailboxId(value)
            : normalizeMailboxId(value)
        )
        .filter(Boolean)
        .sort();
    }

    function buildRuntimeThreadHistoryCacheKey(
      mailboxIds = [],
      conversationId = "",
      includeBodyHtml = false,
      limit = null
    ) {
      const normalizedConversation = asText(conversationId).trim().toLowerCase();
      const mailboxKey = normalizeRuntimeHistoryMailboxList(mailboxIds).join(",");
      const bodyFlag = includeBodyHtml ? "1" : "0";
      const limitKey = Number.isFinite(limit) ? String(limit) : "all";
      return `${normalizedConversation}\x00${mailboxKey}\x00${bodyFlag}\x00${limitKey}`;
    }

    function pruneRuntimeThreadHistoryCache() {
      while (runtimeThreadHistoryPayloadCache.size > RUNTIME_THREAD_HISTORY_CACHE_MAX) {
        let oldestKey = "";
        let oldestAt = Infinity;
        for (const [key, value] of runtimeThreadHistoryPayloadCache) {
          const stamp = typeof value?.fetchedAt === "number" ? value.fetchedAt : 0;
          if (stamp < oldestAt) {
            oldestAt = stamp;
            oldestKey = key;
          }
        }
        if (!oldestKey) break;
        runtimeThreadHistoryPayloadCache.delete(oldestKey);
      }
    }

    function isPipelineDebugEnabled() {
      try {
        const hostname = asText(windowObject.location?.hostname || "");
        if (hostname === "localhost" || hostname === "127.0.0.1") return true;
        return (
          windowObject.localStorage?.getItem("cco.runtimePipelineDebug") === "1" ||
          windowObject.sessionStorage?.getItem("cco.runtimePipelineDebug") === "1"
        );
      } catch (_error) {
        return false;
      }
    }

    function debugReentrySnapshot(
      label = "reentry",
      snapshot = typeof getRuntimeReentrySnapshotState === "function"
        ? getRuntimeReentrySnapshotState()
        : null,
      outcome = typeof getRuntimeReentryOutcomeState === "function"
        ? getRuntimeReentryOutcomeState()
        : null
    ) {
      if (!isPipelineDebugEnabled()) return null;
      const payload = {
        mailboxscope: snapshot?.mailboxscope,
        selectedOwnerKey: snapshot?.selectedOwnerKey,
        activeLaneId: snapshot?.activeLaneId,
        queueInlinePanel: snapshot?.queueInlinePanel,
        queueHistory: snapshot?.queueHistory,
        outcome: outcome
          ? {
              status: outcome.status,
              reason: outcome.reason,
              exactMatch: outcome.exactMatch,
              comparedFields: outcome.comparedFields,
              matchedFields: outcome.matchedFields,
              fallbackFields: outcome.fallbackFields,
            }
          : null,
      };
      try {
        console.groupCollapsed?.(`[REENTRY] ${label}`);
        console.log(payload);
        console.groupEnd?.();
      } catch (_error) {
        console.log(`[REENTRY] ${label}`, payload);
      }
      return payload;
    }

    function debugRuntimePipeline(stageLabel = "pipeline") {
      if (!isPipelineDebugEnabled()) return null;
      const threads = asArray(state.runtime?.threads);
      const mailbox = getMailboxScopedRuntimeThreads();
      const queue =
        typeof getQueueScopedRuntimeThreads === "function"
          ? getQueueScopedRuntimeThreads()
          : mailbox;
      const activeLaneId = normalizeKey(state.runtime?.activeLaneId || "all") || "all";
      const lane = getQueueLaneThreads(activeLaneId, queue);
      const filtered = getFilteredRuntimeThreads();
      const stages = [
        ["threads", threads.length],
        ["mailbox", mailbox.length],
        ["queue", queue.length],
        ["lane", lane.length],
        ["filtered", filtered.length],
      ];
      const firstZeroStageIndex = stages.findIndex(
        ([, count], index) =>
          count === 0 && stages.slice(0, index).some(([, previous]) => previous > 0)
      );
      const payload = {
        threads: threads.length,
        mailbox: mailbox.length,
        queue: queue.length,
        lane: lane.length,
        filtered: filtered.length,
        selectedMailboxIds: workspaceSourceOfTruth.getSelectedMailboxIds(),
        selectedOwnerKey: workspaceSourceOfTruth.getSelectedOwnerKey(),
        activeLaneId,
        leftColumnState:
          typeof getRuntimeLeftColumnState === "function" ? getRuntimeLeftColumnState() : {},
        firstZeroStage: firstZeroStageIndex >= 0 ? stages[firstZeroStageIndex][0] : "",
      };
      try {
        console.groupCollapsed?.(`[PIPELINE DEBUG] ${stageLabel}`);
        console.log(payload);
        if (payload.firstZeroStage) {
          console.warn(`ZERO @ ${payload.firstZeroStage}`);
        }
        console.groupEnd?.();
      } catch (_error) {
        console.log(`[PIPELINE DEBUG] ${stageLabel}`, payload);
      }
      return payload;
    }

    windowObject.__MajorArcanaPreviewRuntimeDebug = {
      pipeline: debugRuntimePipeline,
      reentry: debugReentrySnapshot,
    };

    function captureRuntimeReentrySnapshot(reason = "state_change") {
      if (typeof captureRuntimeReentrySnapshotState !== "function") return null;
      return captureRuntimeReentrySnapshotState(reason);
    }

    function restoreRuntimeReentrySnapshot(reason = "restore", options = {}) {
      if (typeof restoreRuntimeReentrySnapshotState !== "function") return null;
      return restoreRuntimeReentrySnapshotState(reason, options);
    }

    function buildRuntimeMailAssetContentHref({
      mailboxId = "",
      messageId = "",
      attachmentId = "",
      fileName = "",
      mode = "download",
    } = {}) {
      const params = new URLSearchParams();
      if (mailboxId) params.set("mailboxId", mailboxId);
      if (messageId) params.set("messageId", messageId);
      if (attachmentId) params.set("attachmentId", attachmentId);
      if (fileName) params.set("fileName", fileName);
      params.set("mode", normalizeKey(mode) === "open" ? "open" : "download");
      return `/api/v1/cco/runtime/mail-asset/content?${params.toString()}`;
    }

    function parseMailAssetFilename(contentDisposition = "", fallbackName = "bilaga") {
      const rawHeader = asText(contentDisposition).trim();
      if (!rawHeader) return fallbackName;
      const utfMatch = rawHeader.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
      if (utfMatch?.[1]) {
        try {
          return decodeURIComponent(utfMatch[1]) || fallbackName;
        } catch (_error) {}
      }
      const plainMatch =
        rawHeader.match(/filename\s*=\s*"([^"]+)"/i) || rawHeader.match(/filename\s*=\s*([^;]+)/i);
      return asText(plainMatch?.[1], fallbackName).trim() || fallbackName;
    }

    function cloneIdentityEnvelope(value = null) {
      const safeValue = value && typeof value === "object" ? value : {};
      const customerIdentity =
        safeValue.customerIdentity && typeof safeValue.customerIdentity === "object"
          ? safeValue.customerIdentity
          : safeValue.identity && typeof safeValue.identity === "object"
            ? safeValue.identity
            : null;
      return {
        customerIdentity: customerIdentity ? JSON.parse(JSON.stringify(customerIdentity)) : null,
        hardConflictSignals: Array.isArray(safeValue.hardConflictSignals)
          ? JSON.parse(JSON.stringify(safeValue.hardConflictSignals))
          : [],
        mergeReviewDecisionsByPairId:
          safeValue.mergeReviewDecisionsByPairId &&
          typeof safeValue.mergeReviewDecisionsByPairId === "object"
            ? JSON.parse(JSON.stringify(safeValue.mergeReviewDecisionsByPairId))
            : {},
        identityProvenance:
          safeValue.identityProvenance && typeof safeValue.identityProvenance === "object"
            ? JSON.parse(JSON.stringify(safeValue.identityProvenance))
            : safeValue.provenance && typeof safeValue.provenance === "object"
              ? JSON.parse(JSON.stringify(safeValue.provenance))
              : null,
      };
    }

    function resolveRuntimeIdentityEnvelope(thread = {}) {
      const customerKey = asText(
        thread?.customerKey ||
          thread?.raw?.customerKey ||
          thread?.customerSummary?.customerKey ||
          ""
      );
      const candidateIdentity =
        thread?.customerIdentity ||
        thread?.identity ||
        thread?.raw?.customerIdentity ||
        thread?.raw?.identity ||
        thread?.customerSummary?.customerIdentity ||
        thread?.customerSummary?.identity ||
        (customerKey && state.customerRuntime?.identityByKey
          ? state.customerRuntime.identityByKey[customerKey]
          : null);
      const envelope = cloneIdentityEnvelope(candidateIdentity);
      if (
        !envelope.customerIdentity &&
        !envelope.hardConflictSignals.length &&
        !Object.keys(envelope.mergeReviewDecisionsByPairId || {}).length &&
        !envelope.identityProvenance
      ) {
        return null;
      }
      return envelope;
    }

    function carryRuntimeCustomerIdentity(threads = []) {
      return asArray(threads).map((thread) => {
        if (!thread || typeof thread !== "object") return thread;
        const envelope = resolveRuntimeIdentityEnvelope(thread);
        if (!envelope) return thread;
        const nextThread = { ...thread, ...envelope };
        if (nextThread.raw && typeof nextThread.raw === "object") {
          nextThread.raw = {
            ...nextThread.raw,
            ...envelope,
          };
        }
        if (nextThread.customerSummary && typeof nextThread.customerSummary === "object") {
          nextThread.customerSummary = {
            ...nextThread.customerSummary,
            ...envelope,
          };
        }
        return nextThread;
      });
    }

    async function fetchRuntimeMailAssetBlob(path) {
      const authToken = getAdminToken();
      const response = await windowObject.fetch(
        new URL(path, windowObject.location.origin).toString(),
        {
          method: "GET",
          credentials: "same-origin",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }
      );
      if (!response.ok) {
        let errorMessage = "Bilagan kunde inte hämtas.";
        try {
          const payload = await response.json();
          errorMessage = asText(payload?.error, errorMessage);
        } catch (_error) {
          try {
            const payloadText = await response.text();
            errorMessage = asText(payloadText, errorMessage) || errorMessage;
          } catch (_nestedError) {}
        }
        throw new Error(errorMessage);
      }
      return {
        blob: await response.blob(),
        response,
      };
    }

    async function handleRuntimeMailAssetAction(button) {
      const mailboxId = canonicalizeRuntimeMailboxId(button?.dataset?.mailAssetMailboxId);
      const messageId = asText(button?.dataset?.mailAssetMessageId);
      const attachmentId = asText(button?.dataset?.mailAssetAttachmentId);
      const fileName = asText(button?.dataset?.mailAssetName, "bilaga");
      const mode = normalizeKey(button?.dataset?.mailAssetAction) === "open" ? "open" : "download";
      if (!mailboxId || !messageId || !attachmentId) {
        throw new Error("Bilagan saknar tillräcklig metadata för att öppnas.");
      }

      let previewWindow = null;
      if (mode === "open") {
        previewWindow = windowObject.open("about:blank", "_blank");
        if (previewWindow) {
          previewWindow.document.title = fileName;
          previewWindow.document.body.innerHTML =
            '<p style="font-family: system-ui; padding: 24px; color: #5c473c;">Öppnar bilaga...</p>';
        }
      }

      try {
        const { blob, response } = await fetchRuntimeMailAssetBlob(
          buildRuntimeMailAssetContentHref({
            mailboxId,
            messageId,
            attachmentId,
            fileName,
            mode,
          })
        );
        const objectUrl = windowObject.URL.createObjectURL(blob);
        const resolvedName = parseMailAssetFilename(
          response.headers.get("content-disposition"),
          fileName
        );

        if (mode === "open") {
          if (previewWindow && !previewWindow.closed) {
            previewWindow.location.replace(objectUrl);
          } else {
            windowObject.open(objectUrl, "_blank", "noopener");
          }
        } else {
          const link = windowObject.document.createElement("a");
          link.href = objectUrl;
          link.download = resolvedName;
          windowObject.document.body.append(link);
          link.click();
          link.remove();
        }
        windowObject.setTimeout(() => {
          windowObject.URL.revokeObjectURL(objectUrl);
        }, 15000);
      } catch (error) {
        if (previewWindow && !previewWindow.closed) {
          previewWindow.close();
        }
        throw error;
      }
    }

    function summarizeRuntimeOpenFlowThread(thread = null) {
      if (!thread || typeof thread !== "object") return null;
      const messages = asArray(thread?.messages);
      const latestMessage =
        messages.find((message) => message?.latest === true) || messages[0] || null;
      const canonicalMessage =
        latestMessage?.mailThreadMessage && typeof latestMessage.mailThreadMessage === "object"
          ? latestMessage.mailThreadMessage
          : null;
      const mailDocument =
        latestMessage?.mailDocument && typeof latestMessage.mailDocument === "object"
          ? latestMessage.mailDocument
          : null;
      const threadDocument =
        thread?.threadDocument && typeof thread.threadDocument === "object"
          ? thread.threadDocument
          : null;
      const existingFoundationState =
        thread?.foundationState && typeof thread.foundationState === "object"
          ? thread.foundationState
          : null;
      let foundationState = existingFoundationState;
      if (
        !foundationState &&
        ((threadDocument &&
          (normalizeKey(threadDocument?.sourceStore) ||
            asArray(threadDocument?.messages).length > 0)) ||
          (mailDocument &&
            (normalizeKey(mailDocument?.sourceStore) ||
              asText(mailDocument?.previewText).trim().length > 0 ||
              asText(mailDocument?.primaryBodyText).trim().length > 0)))
      ) {
        foundationState = {
          source: normalizeKey(threadDocument?.sourceStore)
            ? asText(threadDocument?.sourceStore)
            : normalizeKey(mailDocument?.sourceStore)
              ? asText(mailDocument?.sourceStore)
              : "thread_document",
          label: "Mail foundation",
          messageCount: asNumber(
            threadDocument?.messageCount,
            Math.max(asArray(threadDocument?.messages).length, messages.length)
          ),
          hasQuotedContent:
            threadDocument?.hasQuotedContent === true ||
            asArray(threadDocument?.messages).some(
              (message) =>
                asArray(message?.quotedBlocks).length > 0 ||
                asArray(message?.mailThreadMessage?.quotedBlocks).length > 0 ||
                asArray(message?.mailDocument?.quotedBlocks).length > 0
            ),
          hasSignatureBlocks:
            threadDocument?.hasSignatureBlocks === true ||
            asArray(threadDocument?.messages).some(
              (message) =>
                asText(message?.signatureBlock?.html).trim().length > 0 ||
                asText(message?.mailThreadMessage?.signatureBlock?.html).trim().length > 0
            ),
          hasSystemBlocks:
            threadDocument?.hasSystemBlocks === true ||
            asArray(threadDocument?.messages).some(
              (message) =>
                asArray(message?.systemBlocks).length > 0 ||
                asArray(message?.mailThreadMessage?.systemBlocks).length > 0
            ),
        };
      }
      return {
        id: asText(thread?.id),
        mailboxAddress: canonicalizeRuntimeMailboxId(
          thread?.mailboxAddress ||
            thread?.raw?.mailboxAddress ||
            thread?.raw?.mailboxId ||
            thread?.mailboxLabel
        ),
        customerEmail: asText(
          thread?.customerEmail || thread?.raw?.customerEmail || thread?.raw?.counterpartyEmail
        ),
        previewLength: asText(thread?.preview).length,
        previewText: asText(thread?.preview).slice(0, 180),
        messageCount: messages.length,
        hasThreadDocument: Boolean(threadDocument),
        threadDocumentMessageCount: asArray(threadDocument?.messages).length,
        hasMimeBackedMessages: threadDocument?.hasMimeBackedMessages === true,
        primaryBodyTextLength: Math.max(
          asText(canonicalMessage?.primaryBody?.text).length,
          asText(mailDocument?.primaryBodyText).length
        ),
        primaryBodyHtmlLength: Math.max(
          asText(canonicalMessage?.primaryBody?.html).length,
          asText(mailDocument?.primaryBodyHtml).length
        ),
        signatureHtmlLength: asText(canonicalMessage?.signatureBlock?.html).length,
        quotedCount: asArray(canonicalMessage?.quotedBlocks).length,
        systemCount: asArray(canonicalMessage?.systemBlocks).length,
        mimeBacked: canonicalMessage?.mimeBacked === true || mailDocument?.mimeBacked === true,
        foundationState: foundationState
          ? {
              source: normalizeKey(foundationState?.source),
              mode: normalizeKey(foundationState?.mode),
              truthDriven: foundationState?.truthDriven === true,
              foundationDriven: foundationState?.foundationDriven === true,
              fallbackDriven: foundationState?.fallbackDriven === true,
            }
          : null,
      };
    }

    function summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload = null) {
      if (!historyPayload || typeof historyPayload !== "object") return null;
      const threadDocument =
        historyPayload?.threadDocument && typeof historyPayload.threadDocument === "object"
          ? historyPayload.threadDocument
          : null;
      return {
        source: asText(historyPayload?.source),
        messageCount: asArray(historyPayload?.messages).length,
        eventCount: asArray(historyPayload?.events).length,
        threadDocumentMessageCount: asArray(threadDocument?.messages).length,
        hasContent: hasRuntimeHistoryPayloadContent(historyPayload),
      };
    }

    function summarizeSelectedRuntimeThreadTruthForDiagnostics(resolvedTruth = null) {
      const truth =
        resolvedTruth && typeof resolvedTruth === "object"
          ? resolvedTruth
          : typeof getSelectedRuntimeThreadTruth === "function"
            ? getSelectedRuntimeThreadTruth()
            : null;
      if (!truth || typeof truth !== "object") return null;
      return {
        selectedThreadId: asText(truth?.selectedThreadId),
        queueHistoryConversationId: asText(truth?.queueHistoryConversationId),
        runtimeMode: normalizeKey(truth?.runtimeMode),
        leftColumnMode: normalizeKey(truth?.leftColumnMode),
        runtimeSource: normalizeKey(truth?.runtimeSource),
        focusSource: normalizeKey(truth?.focusSource),
        focusScopeActive: truth?.focusScopeActive === true,
        focusTruthPrimaryEnabled: truth?.focusTruthPrimaryEnabled === true,
        offlineHistoryReadOnly: truth?.offlineHistoryReadOnly === true,
        runtimeThread: summarizeRuntimeOpenFlowThread(truth?.runtimeThread),
        focusThread: summarizeRuntimeOpenFlowThread(truth?.focusThread),
      };
    }

    function ensureRuntimeOpenFlowDiagnostics() {
      if (!state.runtime || typeof state.runtime !== "object") return null;
      if (
        !state.runtime.openFlowDiagnostics ||
        typeof state.runtime.openFlowDiagnostics !== "object"
      ) {
        state.runtime.openFlowDiagnostics = {
          resetAt: "",
          requestSequence: 0,
          lastSelection: null,
          lastHydration: null,
          lastThreadAssignment: null,
          events: [],
        };
      }
      return state.runtime.openFlowDiagnostics;
    }

    function recordRuntimeOpenFlowEvent(type, details = {}) {
      const diagnostics = ensureRuntimeOpenFlowDiagnostics();
      if (!diagnostics) return null;
      const event = {
        capturedAt: new Date().toISOString(),
        type: normalizeKey(type || "event"),
        ...details,
      };
      diagnostics.events = [...asArray(diagnostics.events).slice(-47), event];
      return event;
    }

    function resetRuntimeOpenFlowDiagnostics({ requestSequence = 0, reason = "" } = {}) {
      state.runtime.openFlowDiagnostics = {
        resetAt: new Date().toISOString(),
        requestSequence,
        reason: normalizeKey(reason || "runtime_load"),
        lastSelection: null,
        lastHydration: null,
        lastThreadAssignment: null,
        events: [],
      };
      recordRuntimeOpenFlowEvent("open_flow_reset", {
        requestSequence,
        reason: normalizeKey(reason || "runtime_load"),
      });
    }

    function recordRuntimeThreadAssignment(
      source,
      {
        stage = "after_apply",
        selectedThreadId = "",
        historyPayload = null,
        threadCount = null,
        legacyThreadCount = null,
      } = {}
    ) {
      const normalizedSelectedThreadId = asText(
        selectedThreadId,
        asText(workspaceSourceOfTruth.getSelectedThreadId())
      );
      const selectedRuntimeThread = normalizedSelectedThreadId
        ? asArray(state.runtime?.threads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, normalizedSelectedThreadId)
          ) || null
        : null;
      const selectedLegacyThread = normalizedSelectedThreadId
        ? asArray(state.runtime?.truthPrimaryLegacyThreads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, normalizedSelectedThreadId)
          ) || null
        : null;
      const entry = {
        source: normalizeKey(source || "threads_assignment"),
        stage: normalizeKey(stage || "after_apply"),
        selectedThreadId: normalizedSelectedThreadId,
        threadCount: Number.isFinite(threadCount)
          ? threadCount
          : asArray(state.runtime?.threads).length,
        legacyThreadCount: Number.isFinite(legacyThreadCount)
          ? legacyThreadCount
          : asArray(state.runtime?.truthPrimaryLegacyThreads).length,
        selectedThreadTruth: summarizeSelectedRuntimeThreadTruthForDiagnostics(),
        historyPayload: summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload),
        selectedRuntimeThread: summarizeRuntimeOpenFlowThread(selectedRuntimeThread),
        selectedLegacyThread: summarizeRuntimeOpenFlowThread(selectedLegacyThread),
      };
      const diagnostics = ensureRuntimeOpenFlowDiagnostics();
      if (diagnostics) {
        diagnostics.lastThreadAssignment = entry;
      }
      recordRuntimeOpenFlowEvent("threads_assigned", entry);
      return entry;
    }

    function recordRuntimeHydrationSkip(
      reason,
      {
        requestedConversationId = "",
        targetConversationId = "",
        mailboxIds = [],
        selectedThread = null,
        details = {},
      } = {}
    ) {
      const hydrationDiagnostics = {
        capturedAt: new Date().toISOString(),
        sequence: liveThreadHydrationSequence,
        requestedConversationId: asText(requestedConversationId),
        targetConversationId: asText(targetConversationId),
        mailboxIds: [...asArray(mailboxIds)],
        selectedThreadTruth: summarizeSelectedRuntimeThreadTruthForDiagnostics(),
        selectedThreadBefore: summarizeRuntimeOpenFlowThread(selectedThread),
        directFetch: null,
        directApplied: false,
        search: {
          attempted: false,
          matchedConversationId: "",
          payload: null,
          applied: false,
        },
        updated: false,
        selectedThreadAfter: summarizeRuntimeOpenFlowThread(
          asArray(state.runtime?.threads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, targetConversationId)
          ) || null
        ),
        error: "",
        skipped: true,
        reason: normalizeKey(reason || "hydrate_skipped"),
        details:
          details && typeof details === "object" ? JSON.parse(JSON.stringify(details)) : null,
      };
      ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
      recordRuntimeOpenFlowEvent(normalizeKey(reason || "hydrate_skipped"), hydrationDiagnostics);
      return {
        status: "skipped",
        reason: normalizeKey(reason || "hydrate_skipped"),
      };
    }

    function setRuntimeModeState(
      mode,
      { error = "", live = false, offline = false, authRequired = false } = {}
    ) {
      const normalizedMode = normalizeKey(mode || "");
      state.runtime.mode = normalizedMode;
      state.runtime.error = error;
      state.runtime.live = live;
      state.runtime.offline = offline;
      state.runtime.authRequired = authRequired;
      if (authRequired === true) {
        state.runtime.threads = [];
        state.runtime.liveHydratedThreadIds = [];
        state.runtime.truthPrimaryLegacyThreads = [];
        state.runtime.loading = false;
        state.runtime.backgroundSyncActive = false;
        state.runtime.staleCacheActive = false;
        state.runtime.bookingShellOpen = false;
        state.runtime.bookingShellDismissed = false;
        if (typeof workspaceSourceOfTruth?.setOverlayOpen === "function") {
          workspaceSourceOfTruth.setOverlayOpen("booking", false);
        }
      }
      if (normalizedMode !== "offline_history") {
        state.runtime.offlineWorkingSetSource = "";
        state.runtime.offlineWorkingSetMeta = "";
      }
    }

    function buildOfflineWorkingSetMessagesFromSearchResults(results = []) {
      return asArray(results)
        .filter((item) => normalizeKey(item?.resultType || "message") === "message")
        .map((item) => {
          const mailboxId = asText(item?.mailboxId).toLowerCase();
          const customerEmail = asText(item?.customerEmail).toLowerCase();
          const direction =
            normalizeKey(item?.direction || "inbound") === "outbound" ? "outbound" : "inbound";
          return {
            messageId: asText(item?.messageId || `${item?.conversationId}-${item?.recordedAt}`),
            conversationId: asText(item?.conversationId),
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
            customerEmail,
            counterpartyEmail: customerEmail,
            senderEmail: direction === "outbound" ? mailboxId : customerEmail,
            senderName: asText(
              item?.customerName ||
                item?.customerLabel ||
                item?.fromName ||
                item?.senderName ||
                item?.contactName ||
                item?.contactLabel
            ),
            subject: asText(item?.subject || item?.summary || item?.title, "E-post"),
            bodyPreview: asText(
              item?.detail || item?.summary,
              "Ingen förhandsvisning tillgänglig."
            ),
            sentAt: asText(item?.recordedAt),
            recordedAt: asText(item?.recordedAt),
            direction,
          };
        })
        .filter((message) => asText(message.conversationId) && asText(message.mailboxId));
    }

    function applyRuntimeGraphStatus(graph = {}) {
      state.runtime.defaultSenderMailbox = asText(
        graph?.defaultSenderMailbox,
        CCO_DEFAULT_REPLY_SENDER
      );
      if (!state.runtime.defaultSenderMailbox) {
        state.runtime.defaultSenderMailbox = CCO_DEFAULT_REPLY_SENDER;
      }
      state.runtime.defaultSignatureProfile = asText(
        graph?.defaultSignatureProfile,
        CCO_DEFAULT_SIGNATURE_PROFILE
      );
      if (!state.runtime.defaultSignatureProfile) {
        state.runtime.defaultSignatureProfile = CCO_DEFAULT_SIGNATURE_PROFILE;
      }
      state.runtime.sendEnabled = graph?.sendEnabled === true;
      state.runtime.deleteEnabled = graph?.deleteEnabled === true;
      state.runtime.graphReadEnabled = graph?.readEnabled === true;
      state.runtime.graphReadConnectorAvailable = graph?.readConnectorAvailable === true;
      state.runtime.graphAllowlistMailboxCount = Number.isFinite(
        Number(graph?.allowlistMailboxCount)
      )
        ? Number(graph.allowlistMailboxCount)
        : 0;
      state.runtime.mailboxCapabilities =
        typeof buildRuntimeMailboxCapabilities === "function"
          ? buildRuntimeMailboxCapabilities(graph)
          : [];
    }

    function isLocalPreviewHost() {
      try {
        const host = normalizeText(
          windowObject.location?.hostname || windowObject.location?.host || ""
        )
          .split(":")[0]
          .toLowerCase();
        return ["localhost", "127.0.0.1", "::1"].includes(host);
      } catch {
        return false;
      }
    }

    function isStaffJournalOpenAccessClient() {
      try {
        if (windowObject.__ARCANA_STAFF_JOURNAL_OPEN__ === true) return true;
      } catch {
        /* ignore */
      }
      return isLocalPreviewHost();
    }

    function isMobileShellViewport() {
      try {
        return windowObject.matchMedia("(max-width: 768px)").matches;
      } catch {
        return false;
      }
    }

    function readInitialShellViewFromLocation() {
      try {
        const params = new URLSearchParams(windowObject.location?.search || "");
        return normalizeKey(params.get("view")) || "conversations";
      } catch {
        return "conversations";
      }
    }

    function shouldDeferMobileInboxBootstrap() {
      if (!isMobileShellViewport()) return false;
      const initialView = readInitialShellViewFromLocation();
      return initialView !== "conversations" && initialView !== "inbox" && initialView !== "home";
    }

    async function ensureMobileInboxReady({ backgroundRefresh = true } = {}) {
      if (!isMobileShellViewport() || isStaffJournalOpenAccessClient()) {
        return { ready: false, deferred: false };
      }
      if (state.runtime?.authRequired === true) {
        return { ready: false, authRequired: true };
      }

      const paintQueueIfAvailable = () => {
        if (runtimeHasLiveThreads() || asArray(state.runtime?.threads).length > 0) {
          const paint = () => paintRuntimeShell("queue");
          if (typeof windowObject.requestAnimationFrame === "function") {
            windowObject.requestAnimationFrame(paint);
          } else {
            paint();
          }
          return true;
        }
        return false;
      };

      if (paintQueueIfAvailable()) {
        if (backgroundRefresh && state.runtime?.loading !== true) {
          void loadLiveRuntime({
            staleWhileRevalidate: true,
            isBackgroundRefresh: true,
          }).catch((error) => {
            console.warn("CCO mobil inbox-bakgrundssync misslyckades.", error);
          });
        }
        return { ready: true, source: "memory" };
      }

      if (mobileInboxLoadPromise) {
        return mobileInboxLoadPromise;
      }

      mobileInboxLoadPromise = (async () => {
        const cachedApplied = await applyRuntimeThreadCacheIfAvailable();
        if (cachedApplied || paintQueueIfAvailable()) {
          if (backgroundRefresh) {
            await loadLiveRuntime({
              staleWhileRevalidate: true,
            }).catch((error) => {
              console.warn("CCO mobil inbox-laddning misslyckades.", error);
            });
          }
          return { ready: true, source: cachedApplied ? "cache" : "memory" };
        }

        await loadLiveRuntime({
          staleWhileRevalidate: false,
        }).catch((error) => {
          console.warn("CCO mobil inbox-laddning misslyckades.", error);
        });
        return { ready: runtimeHasLiveThreads(), source: "network" };
      })().finally(() => {
        mobileInboxLoadPromise = null;
        mobileInboxDeferredBootstrap = false;
      });

      return mobileInboxLoadPromise;
    }

    async function waitForRuntimeAuthToken({ timeoutMs, intervalMs = 60 } = {}) {
      const readToken = () =>
        normalizeText(typeof getAdminToken === "function" ? getAdminToken() : "");
      const existingToken = readToken();
      if (existingToken) return existingToken;
      const resolvedTimeout =
        typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs >= 0
          ? timeoutMs
          : isLocalPreviewHost()
            ? 1800
            : 12000;
      const deadline = Date.now() + resolvedTimeout;
      while (Date.now() < deadline) {
        await new Promise((resolve) => windowObject.setTimeout(resolve, intervalMs));
        const nextToken = readToken();
        if (nextToken) return nextToken;
      }
      return isLocalPreviewHost() || windowObject.__ARCANA_STAFF_JOURNAL_OPEN__ === true
        ? "__preview_local__"
        : "";
    }

    function clearRuntimeAuthRecoveryTimer() {
      if (runtimeAuthRecoveryTimer) {
        windowObject.clearTimeout(runtimeAuthRecoveryTimer);
        runtimeAuthRecoveryTimer = 0;
      }
    }

    function resetRuntimeAuthRecoveryBackoff() {
      runtimeAuthRecoveryDelayMs = AUTH_RECOVERY_INITIAL_DELAY_MS;
    }

    function bumpRuntimeAuthRecoveryBackoff() {
      runtimeAuthRecoveryDelayMs = Math.min(
        AUTH_RECOVERY_MAX_DELAY_MS,
        Math.max(AUTH_RECOVERY_INITIAL_DELAY_MS, runtimeAuthRecoveryDelayMs * 2)
      );
    }

    function setRuntimeAuthRecoveryPollingEnabled(enabled) {
      runtimeAuthRecoveryPollingEnabled = enabled === true;
      if (!runtimeAuthRecoveryPollingEnabled) {
        clearRuntimeAuthRecoveryTimer();
      }
    }

    function armRuntimeAuthRecoveryFromInteraction({ requestedMailboxIds = [] } = {}) {
      if (state.runtime?.authRequired !== true) return;
      setRuntimeAuthRecoveryPollingEnabled(true);
      resetRuntimeAuthRecoveryBackoff();
      scheduleRuntimeAuthRecovery({ requestedMailboxIds });
    }

    function clearRuntimeLiveRefreshTimer() {
      if (runtimeLiveRefreshTimer) {
        windowObject.clearTimeout(runtimeLiveRefreshTimer);
        runtimeLiveRefreshTimer = 0;
      }
    }

    function clearRuntimeTransientRetryTimer() {
      if (runtimeTransientRetryTimer) {
        windowObject.clearTimeout(runtimeTransientRetryTimer);
        runtimeTransientRetryTimer = 0;
      }
    }

    function resetRuntimeTransientRetry() {
      clearRuntimeTransientRetryTimer();
      runtimeTransientRetryAttempt = 0;
    }

    function scheduleRuntimeTransientRetry({ requestedMailboxIds = [] } = {}) {
      clearRuntimeTransientRetryTimer();
      if (state.runtime?.authRequired === true) return;
      if (runtimeTransientRetryAttempt >= RUNTIME_TRANSIENT_RETRY_MAX_ATTEMPTS) {
        return;
      }
      runtimeTransientRetryAttempt += 1;
      const delayMs = Math.min(
        RUNTIME_TRANSIENT_RETRY_INITIAL_MS *
          Math.pow(RUNTIME_TRANSIENT_RETRY_GROWTH, runtimeTransientRetryAttempt - 1),
        RUNTIME_TRANSIENT_RETRY_MAX_MS
      );
      const mailboxIdsSnapshot = asArray(requestedMailboxIds).slice();
      runtimeTransientRetryTimer = windowObject.setTimeout(async () => {
        runtimeTransientRetryTimer = 0;
        if (state.runtime?.authRequired === true) return;
        if (state.runtime?.mode !== "runtime_error") return;
        try {
          await loadLiveRuntime({
            requestedMailboxIds: mailboxIdsSnapshot,
          });
        } catch (error) {
          console.warn("CCO transient runtime-recovery misslyckades.", error);
        }
      }, delayMs);
    }

    function bindRuntimeVisibilityRecovery() {
      if (runtimeVisibilityRecoveryBound) return;
      const doc = windowObject?.document;
      if (!doc || typeof doc.addEventListener !== "function") return;
      doc.addEventListener("visibilitychange", () => {
        if (doc.visibilityState !== "visible") return;
        if (state.runtime?.authRequired === true) {
          const adminToken = normalizeText(
            typeof getAdminToken === "function" ? getAdminToken() : ""
          );
          if (!adminToken) {
            return;
          }
          state.runtime.authRecoveryArmed = true;
          setRuntimeAuthRecoveryPollingEnabled(true);
          resetRuntimeAuthRecoveryBackoff();
          loadLiveRuntime({
            requestedMailboxIds: getRequestedRuntimeMailboxIds(),
            preferredThreadId: getRuntimeReentryThreadId(),
            allowAuthRecovery: true,
          }).catch((error) => {
            console.warn("CCO auth visibility-recovery misslyckades.", error);
          });
          return;
        }
        if (state.runtime?.mode !== "runtime_error") return;
        resetRuntimeTransientRetry();
        loadLiveRuntime({
          requestedMailboxIds: getRequestedRuntimeMailboxIds(),
        }).catch((error) => {
          console.warn("CCO visibility-recovery misslyckades.", error);
        });
      });
      runtimeVisibilityRecoveryBound = true;
    }

    function bindAdminTokenStorageRecovery() {
      if (adminTokenStorageRecoveryBound) return;
      if (!windowObject || typeof windowObject.addEventListener !== "function") return;
      adminTokenStorageRecoveryBound = true;
      windowObject.addEventListener("storage", (event) => {
        if (event.key !== "ARCANA_ADMIN_TOKEN" || !normalizeText(event.newValue)) return;
        if (state.runtime?.authRequired !== true) return;
        state.runtime.authRecoveryArmed = true;
        setRuntimeAuthRecoveryPollingEnabled(true);
        resetRuntimeAuthRecoveryBackoff();
        loadLiveRuntime({
          requestedMailboxIds: getRequestedRuntimeMailboxIds(),
          preferredThreadId: getRuntimeReentryThreadId(),
          allowAuthRecovery: true,
        }).catch((error) => {
          console.warn("CCO auth storage-recovery misslyckades.", error);
        });
      });
    }

    function getRuntimeReentryThreadId() {
      return asText(
        state.runtime?.queueHistory?.selectedConversationId ||
          workspaceSourceOfTruth.getSelectedThreadId()
      );
    }

    function getRuntimeThreadSortTimestamp(thread = {}) {
      const newestMessage = asArray(thread?.messages)[0] || {};
      const candidates = [
        asText(thread?.lastActivityAt),
        asText(newestMessage?.recordedAt),
        asText(newestMessage?.sentAt),
        asText(thread?.raw?.lastInboundAt),
        asText(thread?.raw?.lastOutboundAt),
        asText(thread?.raw?.updatedAt),
      ];
      for (const candidate of candidates) {
        const parsed = Date.parse(candidate);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    }

    function sortRuntimeThreadsDeterministic(threads = []) {
      return asArray(threads)
        .slice()
        .sort((left, right) => {
          const timestampDiff =
            getRuntimeThreadSortTimestamp(right) - getRuntimeThreadSortTimestamp(left);
          if (timestampDiff !== 0) return timestampDiff;
          return asText(left?.id).localeCompare(asText(right?.id));
        });
    }

    function mergeRuntimeThreadsPreferNewer(existingThreads = [], incomingThreads = []) {
      const getThreadKey = (thread = {}) =>
        normalizeKey(thread?.id || thread?.conversationId || "");
      const getThreadPhaseRank = (thread = {}) => {
        const phase = asText(thread?.dataPhase).toUpperCase();
        if (phase === "B") return 2;
        if (phase === "A") return 1;
        return 0;
      };
      const mergedById = new Map();

      asArray(existingThreads).forEach((thread) => {
        const key = getThreadKey(thread);
        if (!key || mergedById.has(key)) return;
        mergedById.set(key, thread);
      });

      asArray(incomingThreads).forEach((thread) => {
        const key = getThreadKey(thread);
        if (!key) return;
        const existingThread = mergedById.get(key);
        if (!existingThread) {
          mergedById.set(key, thread);
          return;
        }
        const incomingPhaseRank = getThreadPhaseRank(thread);
        const existingPhaseRank = getThreadPhaseRank(existingThread);
        if (incomingPhaseRank > existingPhaseRank) {
          mergedById.set(key, thread);
          return;
        }
        if (incomingPhaseRank < existingPhaseRank) {
          return;
        }
        const incomingTimestamp = getRuntimeThreadSortTimestamp(thread);
        const existingTimestamp = getRuntimeThreadSortTimestamp(existingThread);
        if (incomingTimestamp > existingTimestamp) {
          mergedById.set(key, thread);
        }
      });

      return sortRuntimeThreadsDeterministic(Array.from(mergedById.values()));
    }

    function scheduleRuntimeAuthRecovery({ requestedMailboxIds = [] } = {}) {
      clearRuntimeAuthRecoveryTimer();
      if (state.runtime?.authRequired !== true) return;
      if (!runtimeAuthRecoveryPollingEnabled) return;
      const nextRequestedMailboxIds = asArray(requestedMailboxIds)
        .map((value) =>
          typeof canonicalizeRuntimeMailboxId === "function"
            ? canonicalizeRuntimeMailboxId(value)
            : normalizeMailboxId(value)
        )
        .filter(Boolean);
      const poll = async () => {
        if (state.runtime?.authRequired !== true) {
          setRuntimeAuthRecoveryPollingEnabled(false);
          resetRuntimeAuthRecoveryBackoff();
          clearRuntimeAuthRecoveryTimer();
          return;
        }
        if (!runtimeAuthRecoveryPollingEnabled) {
          clearRuntimeAuthRecoveryTimer();
          return;
        }
        const adminToken = normalizeText(
          typeof getAdminToken === "function" ? getAdminToken() : ""
        );
        if (!adminToken) {
          bumpRuntimeAuthRecoveryBackoff();
          runtimeAuthRecoveryTimer = windowObject.setTimeout(poll, runtimeAuthRecoveryDelayMs);
          return;
        }
        clearRuntimeAuthRecoveryTimer();
        await loadLiveRuntime({
          requestedMailboxIds: nextRequestedMailboxIds.length
            ? nextRequestedMailboxIds
            : getRequestedRuntimeMailboxIds(),
          preferredThreadId: getRuntimeReentryThreadId(),
          resetHistoryOnChange: false,
          allowAuthRecovery: true,
        }).catch((error) => {
          console.warn("CCO aktiv körning kunde inte återställas efter auth-recovery.", error);
          bumpRuntimeAuthRecoveryBackoff();
          if (runtimeAuthRecoveryPollingEnabled && state.runtime?.authRequired === true) {
            runtimeAuthRecoveryTimer = windowObject.setTimeout(poll, runtimeAuthRecoveryDelayMs);
          }
        });
      };
      runtimeAuthRecoveryTimer = windowObject.setTimeout(poll, 500);
    }

    function scheduleRuntimeLiveRefresh({
      requestedMailboxIds = [],
      preferredThreadId = "",
      intervalMs = 60000,
    } = {}) {
      clearRuntimeLiveRefreshTimer();
      const nextRequestedMailboxIds = asArray(requestedMailboxIds)
        .map((value) =>
          typeof canonicalizeRuntimeMailboxId === "function"
            ? canonicalizeRuntimeMailboxId(value)
            : normalizeMailboxId(value)
        )
        .filter(Boolean);
      const poll = async () => {
        if (state.runtime?.mode !== "live" || state.runtime?.authRequired === true) {
          clearRuntimeLiveRefreshTimer();
          return;
        }
        if (state.runtime.loading === true) {
          runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
          return;
        }
        const mailboxIds = nextRequestedMailboxIds.length
          ? nextRequestedMailboxIds
          : getRequestedRuntimeMailboxIds();
        if (!mailboxIds.length) {
          runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
          return;
        }
        try {
          await refreshRuntimeWorklistFromTruthDelta({
            runtimeMailboxIds: mailboxIds,
            preferredThreadId: preferredThreadId || getRuntimeReentryThreadId(),
            status: {},
            runAnalyzeInboxForNewMail: true,
          });
        } catch (error) {
          console.warn("CCO aktiv körning kunde inte uppdateras i bakgrunden.", error);
        }
        if (state.runtime?.mode === "live") {
          runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
        }
      };
      runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
    }

    function clearRuntimeBootLaneLock() {
      if (state.runtime?.bootLaneLocked === true) {
        state.runtime.bootLaneLocked = false;
      }
    }

    async function finalizeRuntimeLoad({
      preferredThreadId = "",
      resetHistoryOnChange = false,
    } = {}) {
      clearRuntimeAuthRecoveryTimer();
      ensureRuntimeMailboxSelection();
      normalizeVisibleRuntimeScope({
        allowLaneFallback: state.runtime?.bootLaneLocked !== true,
        preferredThreadId,
        resetHistoryOnChange,
      });
      if (state.customerRuntime.loaded) {
        ensureCustomerRuntimeProfilesFromLive();
        await refreshCustomerIdentitySuggestions({ quiet: true });
      }
      loadQueueHistory({ force: true, prefetch: true }).catch((queueHistoryError) => {
        console.warn("CCO queue-historik kunde inte förladdas.", queueHistoryError);
      });

      await loadBootstrap({
        preserveActiveDestination: true,
        applyWorkspacePrefs: false,
        quiet: true,
      }).catch((error) => {
        console.warn("CCO workspace bootstrap misslyckades efter aktiv körning.", error);
      });
      if (typeof loadBookingCaseList === "function" && state.runtime?.authRequired !== true) {
        loadBookingCaseList().catch((error) => {
          console.warn("CCO bokningsärenden kunde inte förladdas.", error);
        });
      }
      paintRuntimeShell("all");
    }

    function getRuntimeThreadHydrationMailboxIds(thread, fallbackMailboxIds = []) {
      const historyMailboxIds = asArray(thread?.historyMailboxOptions)
        .map((item) => canonicalizeRuntimeMailboxId(item?.id || item))
        .filter(Boolean);
      if (historyMailboxIds.length) {
        return historyMailboxIds;
      }
      const threadMailboxId = canonicalizeRuntimeMailboxId(
        thread?.mailboxAddress || thread?.raw?.mailboxAddress || thread?.raw?.mailboxId
      );
      if (threadMailboxId) {
        return [threadMailboxId];
      }
      return asArray(fallbackMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean);
    }

    function syncRuntimeMailboxSelectionForThread(thread, fallbackMailboxIds = []) {
      const nextMailboxIds = getRuntimeThreadHydrationMailboxIds(thread, fallbackMailboxIds);
      if (!nextMailboxIds.length) return [];
      const currentMailboxIds = asArray(workspaceSourceOfTruth.getSelectedMailboxIds())
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean);
      // Fas 38 (2026-05-19): UNION istället för OVERWRITE.
      // Tidigare: en thread-klick smalnade scope från ex. 7 mailboxar till
      // bara trådens egen mailbox — vilket skickar användaren in i ett
      // single-mailbox-läge utan att de bett om det. Persist-callen
      // klobberade också localStorage så reload behöll det smala scopet.
      // Nu: om current är tom → sätt till thread's mailbox; annars säkerställ
      // att thread's mailbox ingår (UNION) utan att ta bort något.
      if (!currentMailboxIds.length) {
        workspaceSourceOfTruth.setSelectedMailboxIds(nextMailboxIds);
        return nextMailboxIds;
      }
      const currentSet = new Set(currentMailboxIds.map((id) => canonicalizeRuntimeMailboxId(id)));
      const missing = nextMailboxIds.filter((id) => !currentSet.has(id));
      if (missing.length) {
        const union = [...currentMailboxIds, ...missing];
        workspaceSourceOfTruth.setSelectedMailboxIds(union);
        return union;
      }
      // Trådens mailbox redan i selection → behåll user's bredare scope
      return currentMailboxIds;
    }

    function hasRuntimeHistoryPayloadContent(historyPayload = null) {
      if (!historyPayload || typeof historyPayload !== "object") return false;
      if (asArray(historyPayload?.messages).length > 0) return true;
      if (asArray(historyPayload?.events).length > 0) return true;
      const threadDocument =
        historyPayload?.threadDocument && typeof historyPayload.threadDocument === "object"
          ? historyPayload.threadDocument
          : null;
      if (!threadDocument) return false;
      return (
        asArray(threadDocument?.messages).length > 0 ||
        Boolean(asText(threadDocument?.latestMessageId))
      );
    }

    function hasCanonicalRuntimeThreadContent(thread = null) {
      const summary = summarizeRuntimeOpenFlowThread(thread);
      if (!summary) return false;
      return (
        (summary.hasThreadDocument === true &&
          Number(summary.threadDocumentMessageCount || 0) > 0) ||
        summary.hasMimeBackedMessages === true ||
        summary.mimeBacked === true ||
        Number(summary.primaryBodyTextLength || 0) >= 320 ||
        Number(summary.primaryBodyHtmlLength || 0) >= 160 ||
        Number(summary.signatureHtmlLength || 0) >= 120 ||
        Number(summary.quotedCount || 0) > 0 ||
        Number(summary.systemCount || 0) > 0
      );
    }

    function buildRuntimeThreadHydrationSearchCandidates(thread = null) {
      if (!thread || typeof thread !== "object") {
        return {
          customerEmail: "",
          messageIds: new Set(),
          normalizedNeedles: [],
          queryTexts: [],
        };
      }

      const customerEmail = normalizeMailboxId(
        thread?.customerEmail || thread?.raw?.customerEmail || thread?.raw?.counterpartyEmail
      );
      const messageIds = new Set(
        [
          thread?.raw?.messageId,
          thread?.latestMessage?.messageId,
          ...asArray(thread?.messages).map((message) => message?.id),
        ]
          .map((value) => normalizeText(value))
          .filter(Boolean)
      );
      const rawCandidates = [
        thread?.preview,
        thread?.subject,
        thread?.displaySubject,
        thread?.latestMessage?.preview,
        thread?.latestMessage?.bodyPreview,
        ...asArray(thread?.messages).flatMap((message) => [
          message?.conversationBody,
          message?.body,
        ]),
      ];
      const queryTexts = [];
      const normalizedNeedles = [];
      rawCandidates.forEach((candidate) => {
        const text = normalizeText(candidate).replace(/\s+/g, " ").trim();
        if (!text) return;
        const needle = text.toLowerCase();
        if (normalizedNeedles.includes(needle)) return;
        normalizedNeedles.push(needle);
        queryTexts.push(text.slice(0, 180));
      });

      return {
        customerEmail,
        messageIds,
        normalizedNeedles,
        queryTexts,
      };
    }

    async function resolveRuntimeHistoryHydrationConversationId(thread, mailboxIds = []) {
      const { customerEmail, messageIds, normalizedNeedles, queryTexts } =
        buildRuntimeThreadHydrationSearchCandidates(thread);
      if (!queryTexts.length) return "";

      for (const queryText of queryTexts) {
        const searchParams = new URLSearchParams();
        searchParams.set("mailboxIds", mailboxIds.join(","));
        searchParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
        searchParams.set("resultTypes", "message");
        searchParams.set("q", queryText);
        searchParams.set("limit", "10");
        if (customerEmail) {
          searchParams.set("customerEmail", customerEmail);
        }

        const searchPayload = await apiRequest(
          `/api/v1/cco/runtime/history/search?${searchParams.toString()}`
        );
        const results = asArray(searchPayload?.results);
        if (!results.length) continue;

        const matchedResult =
          results.find((result) => {
            const resultMessageIds = [
              normalizeText(result?.messageId),
              normalizeText(result?.graphMessageId),
            ].filter(Boolean);
            return resultMessageIds.some((messageId) => messageIds.has(messageId));
          }) ||
          results.find((result) => {
            const haystack = normalizeText(
              [
                result?.title,
                result?.subject,
                result?.summary,
                result?.detail,
                result?.customerEmail,
              ].join("\n")
            ).toLowerCase();
            if (!haystack) return false;
            return normalizedNeedles.some((needle) => needle && haystack.includes(needle));
          }) ||
          null;

        if (matchedResult?.conversationId) {
          return asText(matchedResult.conversationId);
        }
      }

      return "";
    }

    async function fetchRuntimeThreadHistoryPayload({
      mailboxIds = [],
      conversationId = "",
      includeBodyHtml = false,
      bypassCache = false,
      limit = null,
    } = {}) {
      const targetConversationId = asText(conversationId);
      if (!mailboxIds.length || !targetConversationId) return null;
      const wantsBodyHtml = includeBodyHtml === true;
      const effectiveLimit = wantsBodyHtml
        ? null
        : Number.isFinite(limit)
          ? limit
          : RUNTIME_THREAD_HISTORY_INITIAL_LIMIT;
      const cacheKey = buildRuntimeThreadHistoryCacheKey(
        mailboxIds,
        targetConversationId,
        wantsBodyHtml,
        effectiveLimit
      );
      if (!bypassCache) {
        const cached = runtimeThreadHistoryPayloadCache.get(cacheKey);
        if (
          cached &&
          typeof cached.fetchedAt === "number" &&
          Date.now() - cached.fetchedAt < RUNTIME_THREAD_HISTORY_CACHE_TTL_MS &&
          cached.payload
        ) {
          return cached.payload;
        }
      }
      const params = new URLSearchParams();
      params.set("mailboxIds", mailboxIds.join(","));
      params.set("conversationId", targetConversationId);
      params.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
      params.set("includeBodyHtml", wantsBodyHtml ? "1" : "0");
      if (Number.isFinite(effectiveLimit)) {
        params.set("limit", String(effectiveLimit));
      }
      const payload = await apiRequest(`/api/v1/cco/runtime/history?${params.toString()}`);
      runtimeThreadHistoryPayloadCache.set(cacheKey, {
        fetchedAt: Date.now(),
        payload,
      });
      pruneRuntimeThreadHistoryCache();
      return payload;
    }

    let selectedRuntimeThreadHistoryBodyPromise = null;

    async function ensureSelectedRuntimeThreadHistoryBody() {
      const selectedThread = getSelectedRuntimeThread?.();
      const targetConversationId = asText(selectedThread?.id);
      if (!targetConversationId) {
        return { loaded: false, reason: "no_selected_thread" };
      }

      const threadSummary = summarizeRuntimeOpenFlowThread(selectedThread);
      if (
        threadSummary &&
        (Number(threadSummary.primaryBodyHtmlLength || 0) >= 160 ||
          Number(threadSummary.signatureHtmlLength || 0) >= 120)
      ) {
        return { loaded: true, updated: false, reason: "body_already_present" };
      }

      if (selectedRuntimeThreadHistoryBodyPromise) {
        return selectedRuntimeThreadHistoryBodyPromise;
      }

      const scopedMailboxIds = getRuntimeThreadHydrationMailboxIds(
        selectedThread,
        getRequestedRuntimeMailboxIds()
      );
      if (!scopedMailboxIds.length) {
        return { loaded: false, reason: "no_mailbox_scope" };
      }

      selectedRuntimeThreadHistoryBodyPromise = (async () => {
        try {
          let historyPayload = await fetchRuntimeThreadHistoryPayload({
            mailboxIds: scopedMailboxIds,
            conversationId: targetConversationId,
            includeBodyHtml: true,
          });
          let updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);

          if (!updated) {
            const matchedConversationId = await resolveRuntimeHistoryHydrationConversationId(
              selectedThread,
              scopedMailboxIds
            );
            if (
              matchedConversationId &&
              (!runtimeConversationIdsMatch(matchedConversationId, targetConversationId) ||
                !hasRuntimeHistoryPayloadContent(historyPayload))
            ) {
              historyPayload = await fetchRuntimeThreadHistoryPayload({
                mailboxIds: scopedMailboxIds,
                conversationId: matchedConversationId,
                includeBodyHtml: true,
              });
              updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);
            }
          }

          if (updated) {
            renderRuntimeConversationShell();
          }
          return { loaded: true, updated };
        } catch (error) {
          console.warn("CCO kunde inte ladda bodyHtml för vald tråd.", error);
          return {
            loaded: false,
            reason: "fetch_error",
            error: error instanceof Error ? error.message : String(error),
          };
        } finally {
          selectedRuntimeThreadHistoryBodyPromise = null;
        }
      })();

      return selectedRuntimeThreadHistoryBodyPromise;
    }

    function applyHydratedRuntimeThreadHistory(conversationId, historyPayload) {
      if (typeof hydrateRuntimeThreadWithHistoryPayload !== "function") {
        return false;
      }
      if (!hasRuntimeHistoryPayloadContent(historyPayload)) {
        return false;
      }
      let updated = false;
      let matchedRuntimeThread = false;
      const patchCollection = (threads = []) =>
        asArray(threads).map((thread) => {
          if (!runtimeConversationIdsMatch(thread?.id, conversationId)) {
            return thread;
          }
          matchedRuntimeThread = true;
          const hydratedThread = hydrateRuntimeThreadWithHistoryPayload(thread, historyPayload);
          updated = true;
          return hydratedThread || thread;
        });

      state.runtime.threads = patchCollection(state.runtime.threads);
      state.runtime.truthPrimaryLegacyThreads = patchCollection(
        state.runtime.truthPrimaryLegacyThreads
      );
      if (updated || matchedRuntimeThread) {
        return updated;
      }

      const selectedThread =
        typeof getSelectedRuntimeThread === "function" ? getSelectedRuntimeThread() : null;
      if (!runtimeConversationIdsMatch(selectedThread?.id, conversationId)) {
        return false;
      }

      const hydratedSelectedThread = hydrateRuntimeThreadWithHistoryPayload(
        selectedThread,
        historyPayload
      );
      if (!hydratedSelectedThread) {
        return false;
      }

      state.runtime.threads = [
        hydratedSelectedThread,
        ...asArray(state.runtime.threads).filter(
          (thread) => !runtimeConversationIdsMatch(thread?.id, conversationId)
        ),
      ];
      updated = true;
      return updated;
    }

    async function hydrateRuntimeThreadHistory(conversationId = "", { mailboxIds = [] } = {}) {
      const targetConversationId = asText(conversationId, asText(getSelectedRuntimeThread()?.id));
      if (!targetConversationId) {
        return recordRuntimeHydrationSkip("hydrate_skipped_missing_target", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
        });
      }
      if (state.runtime.live !== true) {
        return recordRuntimeHydrationSkip("hydrate_skipped_not_live", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
          selectedThread: getSelectedRuntimeThread(),
          details: {
            runtimeMode: normalizeKey(state.runtime.mode || ""),
            loading: state.runtime.loading === true,
          },
        });
      }

      const hydratedIds = new Set(asArray(state.runtime.liveHydratedThreadIds));
      if (hydratedIds.has(targetConversationId)) {
        return recordRuntimeHydrationSkip("hydrate_skipped_already_hydrated", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
          selectedThread: getSelectedRuntimeThread(),
        });
      }

      const selectedThread =
        asArray(state.runtime.threads).find((thread) =>
          runtimeConversationIdsMatch(thread?.id, targetConversationId)
        ) ||
        asArray(state.runtime.truthPrimaryLegacyThreads).find((thread) =>
          runtimeConversationIdsMatch(thread?.id, targetConversationId)
        ) ||
        getSelectedRuntimeThread();
      if (!selectedThread) {
        return recordRuntimeHydrationSkip("hydrate_skipped_thread_not_found", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
        });
      }

      const scopedMailboxIds = getRuntimeThreadHydrationMailboxIds(
        selectedThread,
        mailboxIds.length ? mailboxIds : getRequestedRuntimeMailboxIds()
      );
      if (!scopedMailboxIds.length) {
        return recordRuntimeHydrationSkip("hydrate_skipped_no_mailbox_scope", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
          selectedThread,
        });
      }

      const hydrationSequence = ++liveThreadHydrationSequence;
      const hydrationDiagnostics = {
        capturedAt: new Date().toISOString(),
        sequence: hydrationSequence,
        requestedConversationId: asText(conversationId),
        targetConversationId,
        mailboxIds: [...scopedMailboxIds],
        selectedThreadBefore: summarizeRuntimeOpenFlowThread(selectedThread),
        directFetch: null,
        directApplied: false,
        search: {
          attempted: false,
          matchedConversationId: "",
          payload: null,
          applied: false,
        },
        updated: false,
        selectedThreadAfter: null,
        error: "",
      };
      ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
      recordRuntimeOpenFlowEvent("hydrate_start", {
        sequence: hydrationSequence,
        targetConversationId,
        mailboxIds: [...scopedMailboxIds],
        selectedThreadBefore: hydrationDiagnostics.selectedThreadBefore,
      });

      try {
        let historyPayload = await fetchRuntimeThreadHistoryPayload({
          mailboxIds: scopedMailboxIds,
          conversationId: targetConversationId,
        });
        hydrationDiagnostics.directFetch = {
          conversationId: targetConversationId,
          payload: summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload),
        };
        recordRuntimeOpenFlowEvent("hydrate_direct_fetch", {
          sequence: hydrationSequence,
          targetConversationId,
          directFetch: hydrationDiagnostics.directFetch,
        });
        if (hydrationSequence !== liveThreadHydrationSequence) {
          recordRuntimeOpenFlowEvent("hydrate_aborted", {
            sequence: hydrationSequence,
            targetConversationId,
            reason: "sequence_mismatch_after_direct_fetch",
          });
          return;
        }

        let updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);
        hydrationDiagnostics.directApplied = updated;
        hydrationDiagnostics.selectedThreadAfter = summarizeRuntimeOpenFlowThread(
          asArray(state.runtime?.threads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, targetConversationId)
          ) || null
        );
        recordRuntimeOpenFlowEvent(
          updated ? "hydrate_direct_applied" : "hydrate_direct_not_applied",
          {
            sequence: hydrationSequence,
            targetConversationId,
            selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
          }
        );
        if (!updated) {
          hydrationDiagnostics.search.attempted = true;
          const matchedConversationId = await resolveRuntimeHistoryHydrationConversationId(
            selectedThread,
            scopedMailboxIds
          );
          hydrationDiagnostics.search.matchedConversationId = asText(matchedConversationId);
          recordRuntimeOpenFlowEvent(
            matchedConversationId ? "hydrate_search_match" : "hydrate_search_miss",
            {
              sequence: hydrationSequence,
              targetConversationId,
              matchedConversationId: asText(matchedConversationId),
            }
          );
          if (
            matchedConversationId &&
            (!runtimeConversationIdsMatch(matchedConversationId, targetConversationId) ||
              !hasRuntimeHistoryPayloadContent(historyPayload))
          ) {
            historyPayload = await fetchRuntimeThreadHistoryPayload({
              mailboxIds: scopedMailboxIds,
              conversationId: matchedConversationId,
            });
            hydrationDiagnostics.search.payload =
              summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload);
            recordRuntimeOpenFlowEvent("hydrate_search_fetch", {
              sequence: hydrationSequence,
              targetConversationId,
              search: hydrationDiagnostics.search,
            });
            if (hydrationSequence !== liveThreadHydrationSequence) {
              recordRuntimeOpenFlowEvent("hydrate_aborted", {
                sequence: hydrationSequence,
                targetConversationId,
                matchedConversationId: asText(matchedConversationId),
                reason: "sequence_mismatch_after_search_fetch",
              });
              return;
            }
            updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);
            hydrationDiagnostics.search.applied = updated;
            hydrationDiagnostics.selectedThreadAfter = summarizeRuntimeOpenFlowThread(
              asArray(state.runtime?.threads).find((thread) =>
                runtimeConversationIdsMatch(thread?.id, targetConversationId)
              ) || null
            );
            recordRuntimeOpenFlowEvent(
              updated ? "hydrate_search_applied" : "hydrate_search_not_applied",
              {
                sequence: hydrationSequence,
                targetConversationId,
                matchedConversationId: asText(matchedConversationId),
                selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
              }
            );
          }
        }
        hydrationDiagnostics.updated = updated;
        if (!updated) {
          ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
          recordRuntimeOpenFlowEvent("hydrate_finish", {
            sequence: hydrationSequence,
            targetConversationId,
            updated: false,
            selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
          });
          return;
        }
        hydratedIds.add(targetConversationId);
        state.runtime.liveHydratedThreadIds = Array.from(hydratedIds);
        hydrationDiagnostics.selectedThreadAfter = summarizeRuntimeOpenFlowThread(
          asArray(state.runtime?.threads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, targetConversationId)
          ) || null
        );
        ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
        recordRuntimeOpenFlowEvent("hydrate_finish", {
          sequence: hydrationSequence,
          targetConversationId,
          updated: true,
          liveHydratedThreadIds: [...state.runtime.liveHydratedThreadIds],
          selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
        });
        renderRuntimeConversationShell();
        return {
          status: "updated",
          reason: "",
        };
      } catch (error) {
        hydrationDiagnostics.error = error instanceof Error ? error.message : String(error);
        ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
        recordRuntimeOpenFlowEvent("hydrate_error", {
          sequence: hydrationSequence,
          targetConversationId,
          error: hydrationDiagnostics.error,
        });
        console.warn("CCO kunde inte hydrera rik trådhistorik för vald live-konversation.", error);
        return {
          status: "error",
          reason: "hydrate_error",
        };
      }
    }

    async function hydrateOfflineHistoryThread(conversationId = "", { mailboxIds = [] } = {}) {
      const targetConversationId = asText(conversationId, asText(getSelectedRuntimeThread()?.id));
      if (!targetConversationId) {
        return recordRuntimeHydrationSkip("offline_canonical_skipped_missing_target", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
        });
      }

      const selectedThread =
        asArray(state.runtime.threads).find((thread) =>
          runtimeConversationIdsMatch(thread?.id, targetConversationId)
        ) || getSelectedRuntimeThread();
      if (!selectedThread) {
        return recordRuntimeHydrationSkip("offline_canonical_skipped_thread_not_found", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
        });
      }

      if (hasCanonicalRuntimeThreadContent(selectedThread)) {
        return recordRuntimeHydrationSkip("offline_canonical_skipped_already_rich", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
          selectedThread,
          details: {
            runtimeMode: normalizeKey(state.runtime.mode || ""),
          },
        });
      }

      const scopedMailboxIds = getRuntimeThreadHydrationMailboxIds(
        selectedThread,
        mailboxIds.length ? mailboxIds : getRequestedRuntimeMailboxIds()
      );
      if (!scopedMailboxIds.length) {
        return recordRuntimeHydrationSkip("offline_canonical_skipped_no_mailbox_scope", {
          requestedConversationId: conversationId,
          targetConversationId,
          mailboxIds,
          selectedThread,
        });
      }

      const hydrationSequence = ++liveThreadHydrationSequence;
      const hydrationDiagnostics = {
        capturedAt: new Date().toISOString(),
        sequence: hydrationSequence,
        requestedConversationId: asText(conversationId),
        targetConversationId,
        mailboxIds: [...scopedMailboxIds],
        selectedThreadBefore: summarizeRuntimeOpenFlowThread(selectedThread),
        directFetch: null,
        directApplied: false,
        search: {
          attempted: false,
          matchedConversationId: "",
          payload: null,
          applied: false,
        },
        updated: false,
        selectedThreadAfter: null,
        error: "",
        mode: "offline_history",
      };
      ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
      recordRuntimeOpenFlowEvent("offline_canonical_start", {
        sequence: hydrationSequence,
        targetConversationId,
        mailboxIds: [...scopedMailboxIds],
        selectedThreadBefore: hydrationDiagnostics.selectedThreadBefore,
      });

      try {
        let historyPayload = await fetchRuntimeThreadHistoryPayload({
          mailboxIds: scopedMailboxIds,
          conversationId: targetConversationId,
        });
        hydrationDiagnostics.directFetch = {
          conversationId: targetConversationId,
          payload: summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload),
        };
        recordRuntimeOpenFlowEvent("offline_canonical_direct_fetch", {
          sequence: hydrationSequence,
          targetConversationId,
          directFetch: hydrationDiagnostics.directFetch,
        });

        let updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);
        hydrationDiagnostics.directApplied = updated;
        hydrationDiagnostics.selectedThreadAfter = summarizeRuntimeOpenFlowThread(
          asArray(state.runtime?.threads).find((thread) =>
            runtimeConversationIdsMatch(thread?.id, targetConversationId)
          ) || null
        );
        recordRuntimeOpenFlowEvent(
          updated ? "offline_canonical_direct_applied" : "offline_canonical_direct_not_applied",
          {
            sequence: hydrationSequence,
            targetConversationId,
            selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
          }
        );

        if (!updated) {
          hydrationDiagnostics.search.attempted = true;
          const matchedConversationId = await resolveRuntimeHistoryHydrationConversationId(
            selectedThread,
            scopedMailboxIds
          );
          hydrationDiagnostics.search.matchedConversationId = asText(matchedConversationId);
          recordRuntimeOpenFlowEvent(
            matchedConversationId
              ? "offline_canonical_search_match"
              : "offline_canonical_search_miss",
            {
              sequence: hydrationSequence,
              targetConversationId,
              matchedConversationId: asText(matchedConversationId),
            }
          );
          if (
            matchedConversationId &&
            (!runtimeConversationIdsMatch(matchedConversationId, targetConversationId) ||
              !hasRuntimeHistoryPayloadContent(historyPayload))
          ) {
            historyPayload = await fetchRuntimeThreadHistoryPayload({
              mailboxIds: scopedMailboxIds,
              conversationId: matchedConversationId,
            });
            hydrationDiagnostics.search.payload =
              summarizeRuntimeHistoryPayloadForDiagnostics(historyPayload);
            recordRuntimeOpenFlowEvent("offline_canonical_search_fetch", {
              sequence: hydrationSequence,
              targetConversationId,
              search: hydrationDiagnostics.search,
            });
            updated = applyHydratedRuntimeThreadHistory(targetConversationId, historyPayload);
            hydrationDiagnostics.search.applied = updated;
            hydrationDiagnostics.selectedThreadAfter = summarizeRuntimeOpenFlowThread(
              asArray(state.runtime?.threads).find((thread) =>
                runtimeConversationIdsMatch(thread?.id, targetConversationId)
              ) || null
            );
            recordRuntimeOpenFlowEvent(
              updated ? "offline_canonical_search_applied" : "offline_canonical_search_not_applied",
              {
                sequence: hydrationSequence,
                targetConversationId,
                matchedConversationId: asText(matchedConversationId),
                selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
              }
            );
          }
        }

        hydrationDiagnostics.updated = updated;
        ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
        recordRuntimeOpenFlowEvent("offline_canonical_finish", {
          sequence: hydrationSequence,
          targetConversationId,
          updated,
          selectedThreadAfter: hydrationDiagnostics.selectedThreadAfter,
        });
        if (!updated) {
          return {
            status: "skipped",
            reason: "offline_canonical_not_applied",
          };
        }

        renderRuntimeConversationShell();
        if (
          runtimeConversationIdsMatch(
            workspaceSourceOfTruth.getSelectedThreadId(),
            targetConversationId
          )
        ) {
          loadBootstrap({
            preserveActiveDestination: true,
            applyWorkspacePrefs: false,
            quiet: true,
          }).catch((error) => {
            console.warn(
              "CCO workspace bootstrap misslyckades efter offline canonical graft.",
              error
            );
          });
        }

        return {
          status: "updated",
          reason: "",
        };
      } catch (error) {
        hydrationDiagnostics.error = error instanceof Error ? error.message : String(error);
        ensureRuntimeOpenFlowDiagnostics().lastHydration = hydrationDiagnostics;
        recordRuntimeOpenFlowEvent("offline_canonical_error", {
          sequence: hydrationSequence,
          targetConversationId,
          error: hydrationDiagnostics.error,
        });
        console.warn("CCO kunde inte grafta rik canonical historik för vald offline-tråd.", error);
        return {
          status: "error",
          reason: "offline_canonical_error",
        };
      }
    }

    async function requestRuntimeThreadHydration(
      conversationId = "",
      { mailboxIds = [], attempt = 0, maxAttempts = 8 } = {}
    ) {
      const targetConversationId = asText(conversationId, asText(getSelectedRuntimeThread()?.id));
      if (!targetConversationId) return null;

      if (
        state.runtime.offline === true ||
        normalizeKey(state.runtime.mode || "") === "offline_history"
      ) {
        return hydrateOfflineHistoryThread(targetConversationId, {
          mailboxIds,
        });
      }

      const result = await hydrateRuntimeThreadHistory(targetConversationId, {
        mailboxIds,
      });
      const retryableReasons = new Set([
        "hydrate_skipped_not_live",
        "hydrate_skipped_thread_not_found",
        "hydrate_skipped_no_mailbox_scope",
      ]);
      const reason = normalizeKey(result?.reason || "");
      const canRetry =
        retryableReasons.has(reason) &&
        attempt + 1 < maxAttempts &&
        runtimeConversationIdsMatch(
          workspaceSourceOfTruth.getSelectedThreadId(),
          targetConversationId
        );
      if (!canRetry) {
        return result;
      }

      recordRuntimeOpenFlowEvent("hydrate_retry_scheduled", {
        targetConversationId,
        attempt: attempt + 1,
        maxAttempts,
        reason,
      });
      await new Promise((resolve) => windowObject.setTimeout(resolve, 350));
      return requestRuntimeThreadHydration(targetConversationId, {
        mailboxIds,
        attempt: attempt + 1,
        maxAttempts,
      });
    }

    function scheduleRuntimeHistoryCoverageWarmup(
      runtimeMailboxIds = [],
      { isCurrentRequest = () => true } = {}
    ) {
      if (!runtimeMailboxIds.length) return;

      windowObject.setTimeout(async () => {
        try {
          const historyStatusParams = new URLSearchParams();
          historyStatusParams.set("mailboxIds", runtimeMailboxIds.join(","));
          historyStatusParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
          const historyStatus = await apiRequest(
            `/api/v1/cco/runtime/history/status?${historyStatusParams.toString()}`
          );
          if (!isCurrentRequest()) return;
          if (
            historyStatus?.coverage?.complete === true ||
            historyStatus?.graphReadEnabled !== true
          ) {
            return;
          }
          await apiRequest("/api/v1/cco/runtime/history/backfill", {
            method: "POST",
            headers: {
              "x-idempotency-key": createIdempotencyKey("major-arcana-history-backfill"),
            },
            body: {
              mailboxIds: runtimeMailboxIds,
              lookbackDays: FULL_MAILBOX_LOOKBACK_DAYS,
              refresh: false,
            },
          });
        } catch (historyWarmupError) {
          if (!isCurrentRequest()) return;
          console.warn(
            "CCO kunde inte värma mailboxhistoriken i bakgrunden efter live-load.",
            historyWarmupError
          );
        }
      }, 0);
    }

    async function loadOfflineHistoryRuntime({
      runtimeMailboxIds = [],
      preferredThreadId = "",
      resetHistoryOnChange = false,
      offlineMessage = "",
      isCurrentRequest = () => true,
    } = {}) {
      clearRuntimeLiveRefreshTimer();
      const historyParams = new URLSearchParams();
      historyParams.set("mailboxIds", runtimeMailboxIds.join(","));
      historyParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));

      let historyMessages = [];
      let historyEvents = [];
      let offlineWorkingSetSource = "history_store";
      let offlineWorkingSetMeta =
        "Offline historikläge. Arbetskön bygger just nu på senast kända mejlhistorik.";
      let resolvedOfflineMessage =
        offlineMessage || "Den aktiva kön är offline. Visar senast kända historik i stället.";

      try {
        const historyPayload = await apiRequest(
          `/api/v1/cco/runtime/history?${historyParams.toString()}`
        );
        if (!isCurrentRequest()) return;
        historyMessages = asArray(historyPayload?.messages);
        historyEvents = asArray(historyPayload?.events);
      } catch (historyError) {
        if (!isCurrentRequest()) return;
        const historyErrorMessage =
          historyError instanceof Error ? historyError.message : String(historyError);
        try {
          const searchParams = new URLSearchParams();
          searchParams.set("mailboxIds", runtimeMailboxIds.join(","));
          searchParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
          searchParams.set("resultTypes", "message");
          searchParams.set("limit", "250");
          const searchPayload = await apiRequest(
            `/api/v1/cco/runtime/history/search?${searchParams.toString()}`
          );
          if (!isCurrentRequest()) return;
          historyMessages = buildOfflineWorkingSetMessagesFromSearchResults(searchPayload?.results);
          historyEvents = [];
          if (historyMessages.length) {
            offlineWorkingSetSource = "search_partial";
            offlineWorkingSetMeta =
              "Offline working set bygger på lokal historik och kan vara ofullständig tills livekön är tillbaka.";
            resolvedOfflineMessage =
              "Den aktiva kön är offline. Arbetskön bygger på lokal historik i valt mejlurval.";
          } else {
            offlineWorkingSetSource = "search_empty";
            offlineWorkingSetMeta =
              "Offline historikläge. Ingen lokal historik hittades i valt mejlurval ännu.";
            resolvedOfflineMessage =
              "Ingen lokal historik hittades i valt mejlurval ännu. Den aktiva kön är fortsatt offline.";
          }
        } catch (searchError) {
          if (!isCurrentRequest()) return;
          console.warn(
            "CCO kunde inte läsa lokal historiksökfallback för offline working set.",
            searchError
          );
          offlineWorkingSetSource = "search_empty";
          offlineWorkingSetMeta =
            "Offline historikläge. Ingen lokal historik hittades i valt mejlurval ännu.";
          resolvedOfflineMessage =
            historyErrorMessage ||
            "Ingen lokal historik hittades i valt mejlurval ännu. Den aktiva kön är fortsatt offline.";
        }
      }

      const mergedWorklistData = {
        conversationWorklist: [],
        inboundFeed: [],
        outboundFeed: [],
      };
      const threads = sortRuntimeThreadsDeterministic(
        carryRuntimeCustomerIdentity(
          buildLiveThreads(mergedWorklistData, {
            historyMessages,
            historyEvents,
          })
        )
      );
      state.runtime.truthPrimaryLegacyThreads = [];
      state.runtime.truthPrimaryCutover = {
        enabled: false,
        configuredMailboxIds: [],
        activeMailboxIds: [],
        fallbackReason: "",
        lastAppliedAt: "",
      };
      state.runtime.focusTruthPrimary = {
        enabled: false,
        configuredMailboxIds:
          typeof getTruthPrimaryFocusMailboxIds === "function"
            ? getTruthPrimaryFocusMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [],
        activeMailboxIds: [],
        fallbackReason:
          "Offline historikläge. Fokusytan läser inte sanningsstyrt fokus i detta läge.",
        readOnly: true,
        lastAppliedAt: new Date().toISOString(),
      };
      state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
        phase: "offline_history",
        requestedMailboxIds: runtimeMailboxIds,
        liveData: {
          conversationWorklist: [],
          needsReplyToday: [],
        },
        mergedWorklistData: {
          conversationWorklist: [],
          needsReplyToday: [],
        },
        threads,
        legacyThreads: [],
        historyPayload: {
          messages: historyMessages,
          events: historyEvents,
        },
        configuredTruthPrimaryMailboxIds: [],
        activeTruthPrimaryMailboxIds: [],
        error: resolvedOfflineMessage,
        offlineWorkingSetSource,
        offlineWorkingSetMeta,
      });
      // Fas 39 (2026-05-19): demo-fallback ska INTE trigga när användaren är
      // autentiserad. Tidigare: när live-load returnerade 0 threads behöll vi
      // de 6 hårdkodade demo-fixtures (Morten, Sara Holm, Anna Svensson osv)
      // → "Live · 6"-pillen visades MED demo-data → mellanläge.
      // Nu: bevara demo-fixtures BARA om ingen ARCANA_ADMIN_TOKEN finns
      // (= marknadsdemot utan backend).
      let _hasAdminToken_fas39 = false;
      try {
        _hasAdminToken_fas39 = Boolean(
          (typeof localStorage !== "undefined" && localStorage.getItem("ARCANA_ADMIN_TOKEN")) || ""
        );
      } catch (_e) {
        _hasAdminToken_fas39 = false;
      }
      if (
        !_hasAdminToken_fas39 &&
        threads.length === 0 &&
        Array.isArray(state.runtime.threads) &&
        state.runtime.threads.some((t) => asText(t?.worklistSource) === "demo")
      ) {
        // Demo-mode (ingen token) + tomt servar → behåll demo-fixtures
      } else {
        state.runtime.threads = threads;
      }
      state.runtime.mailboxes = buildMailboxCatalog(
        (state.runtime.threads || []).map((thread) => {
          const mailboxAddress = asText(thread?.mailboxAddress);
          return {
            mailboxId: mailboxAddress,
            mailboxAddress,
            userPrincipalName: mailboxAddress,
          };
        }),
        {
          sourceMailboxIds: runtimeMailboxIds,
          mailboxCapabilities: state.runtime.mailboxCapabilities,
        }
      );
      state.runtime.offlineWorkingSetSource = offlineWorkingSetSource;
      state.runtime.offlineWorkingSetMeta = offlineWorkingSetMeta;
      state.runtime.loading = false;
      state.runtime.loaded = true;
      state.runtime.lastSyncAt = new Date().toISOString();
      setRuntimeModeState("offline_history", {
        live: false,
        offline: true,
        authRequired: false,
        error: resolvedOfflineMessage,
      });
      if (!isCurrentRequest()) return;
      restoreRuntimeReentrySnapshot("offline_history_load", { scopeMode: "hint_only" });
      await finalizeRuntimeLoad({ preferredThreadId, resetHistoryOnChange });
      if (!isCurrentRequest()) return;
      captureRuntimeReentrySnapshot("offline_history_loaded");
    }

    function reconcileRuntimeScopeSelection(preferredThreadId, options = {}) {
      const selectionOptions = {
        preferredThreadId,
        resetHistoryOnChange: true,
        ...options,
      };
      if (selectionOptions.allowLaneFallback) {
        return normalizeVisibleRuntimeScope(selectionOptions);
      }
      return reconcileRuntimeSelection(getFilteredRuntimeThreads(), selectionOptions);
    }

    function clearOfflineHistorySelection({ reloadBootstrap = true } = {}) {
      if (!asText(state.runtime.queueHistory?.selectedConversationId)) return;
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        selectedConversationId: "",
      };
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("offline_history_cleared");
      if (reloadBootstrap) {
        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
        }).catch((error) => {
          console.warn(
            "CCO workspace bootstrap misslyckades efter att offline-historikval rensades.",
            error
          );
        });
      }
    }

    function selectOfflineHistoryConversation(
      conversationId,
      { reloadBootstrap = true, mailboxIds = [], hydrate = true } = {}
    ) {
      const nextConversationId = asText(conversationId);
      if (!nextConversationId) return;
      const currentConversationId = asText(state.runtime.queueHistory?.selectedConversationId);
      const selectionChanged = !runtimeConversationIdsMatch(
        currentConversationId,
        nextConversationId
      );
      state.runtime.queueInlinePanel = {
        ...state.runtime.queueInlinePanel,
        open: false,
        laneId: "",
        feedKey: "",
      };
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        open: true,
        selectedConversationId: nextConversationId,
      };
      workspaceSourceOfTruth.setSelectedThreadId(nextConversationId);
      syncRuntimeMailboxSelectionForThread(getSelectedRuntimeThread(), mailboxIds);
      syncSelectedCustomerIdentityForThread(getSelectedRuntimeThread());
      if (selectionChanged) {
        state.runtime.historyContextThreadId = "";
        resetRuntimeHistoryFilters();
      }
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("offline_history_selected");
      const selectedCard = Array.from(
        queueHistoryList?.querySelectorAll("[data-history-conversation]") || []
      ).find((card) =>
        runtimeConversationIdsMatch(card.dataset.historyConversation, nextConversationId)
      );
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
      if (hydrate !== false) {
        requestRuntimeThreadHydration(nextConversationId, {
          mailboxIds: asArray(mailboxIds)
            .map((value) => normalizeMailboxId(value))
            .filter(Boolean),
        }).catch((error) => {
          console.warn(
            "CCO kunde inte grafta vald offline-historiktråd till canonical source.",
            error
          );
        });
      }
      if (reloadBootstrap) {
        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
        }).catch((error) => {
          console.warn(
            "CCO workspace bootstrap misslyckades för vald offline-historiktråd.",
            error
          );
        });
      }
    }

    function setActiveRuntimeLane(laneId) {
      clearRuntimeBootLaneLock();
      const normalizedLaneId = normalizeKey(laneId || "all") || "all";
      const previousThreadId = workspaceSourceOfTruth.getSelectedThreadId();
      workspaceSourceOfTruth.setActiveLaneId(normalizedLaneId);
      reconcileRuntimeScopeSelection(previousThreadId);
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("queue_lane_changed");
      debugReentrySnapshot("AFTER ACTIVE LANE CHANGE");
      debugRuntimePipeline("AFTER ACTIVE LANE CHANGE");
      const queueStream = queueHistoryList?.closest(".queue-stream");
      if (queueStream) {
        queueStream.scrollTop = 0;
      }
      loadBootstrap({
        preserveActiveDestination: true,
        applyWorkspacePrefs: false,
        quiet: true,
      }).catch((error) => {
        console.warn("CCO workspace bootstrap misslyckades efter köbyte.", error);
      });
    }

    function selectRuntimeThread(threadId, { reloadBootstrap = true } = {}) {
      const selectedThreadTruthBefore = summarizeSelectedRuntimeThreadTruthForDiagnostics();
      const selectedThreadBefore = summarizeRuntimeOpenFlowThread(getSelectedRuntimeThread());
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        selectedConversationId: asText(threadId),
      };
      reconcileRuntimeScopeSelection(threadId);
      syncSelectedCustomerIdentityForThread(getSelectedRuntimeThread());
      const selectionEntry = {
        capturedAt: new Date().toISOString(),
        threadId: asText(threadId),
        reloadBootstrap: reloadBootstrap === true,
        selectedThreadTruthBefore,
        selectedThreadBefore,
        selectedThreadTruthAfter: summarizeSelectedRuntimeThreadTruthForDiagnostics(),
        selectedThreadAfter: summarizeRuntimeOpenFlowThread(getSelectedRuntimeThread()),
      };
      ensureRuntimeOpenFlowDiagnostics().lastSelection = selectionEntry;
      recordRuntimeOpenFlowEvent("select_thread", selectionEntry);
      paintRuntimeShell("focus");
      captureRuntimeReentrySnapshot("runtime_thread_selected");
      const selectedCard = Array.from(
        queueHistoryList?.querySelectorAll("[data-runtime-thread]") || []
      ).find((card) => card.dataset.runtimeThread === threadId);
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
      requestRuntimeThreadHydration(threadId).catch((error) => {
        console.warn("CCO kunde inte hydrera vald aktiv tråd efter selection.", error);
      });
      if (reloadBootstrap) {
        windowObject.clearTimeout(bootstrapThreadSelectTimer);
        bootstrapThreadSelectTimer = windowObject.setTimeout(() => {
          loadBootstrap({
            preserveActiveDestination: true,
            applyWorkspacePrefs: false,
            quiet: true,
          })
            .catch((error) => {
              console.warn("CCO workspace bootstrap misslyckades för vald tråd.", error);
            })
            .finally(() => {
              paintRuntimeShell("focus");
            });
        }, BOOTSTRAP_THREAD_SELECT_DEBOUNCE_MS);
      }
    }

    function handleQueueHistoryCardSelection(
      event,
      { reloadBootstrap = true, requireHistoryPanel = false } = {}
    ) {
      if (event?.__queueHistorySelectionHandled === true) return false;
      const eventTarget =
        event?.target instanceof windowObject.Element
          ? event.target
          : event?.target?.parentElement || null;
      const card = eventTarget?.closest("[data-runtime-thread], [data-history-conversation]");
      if (!card) return false;
      if (queueHistoryList && !queueHistoryList.contains(card)) return false;
      const isHistoryConversationCard =
        card.hasAttribute("data-history-conversation") && !card.hasAttribute("data-runtime-thread");
      if (requireHistoryPanel && isHistoryConversationCard && !state.runtime.queueHistory?.open) {
        return false;
      }
      const conversationId = asText(card.dataset.historyConversation || card.dataset.runtimeThread);
      if (!conversationId) return false;
      const mailboxScopedTarget = getMailboxScopedRuntimeThreads().find((thread) =>
        runtimeConversationIdsMatch(thread.id, conversationId)
      );
      event.__queueHistorySelectionHandled = true;
      if (isHistoryConversationCard && (!mailboxScopedTarget || state.runtime.live !== true)) {
        selectOfflineHistoryConversation(conversationId, { reloadBootstrap });
        applyFocusSection("conversation");
        return true;
      }
      selectRuntimeThread(conversationId, { reloadBootstrap });
      applyFocusSection("conversation");
      return true;
    }

    function openQueueInlineLane(laneId) {
      clearRuntimeBootLaneLock();
      const normalizedLaneId = normalizeKey(laneId || "all") || "all";
      const wasSameInlinePanel =
        state.runtime.queueInlinePanel.open &&
        normalizeKey(state.runtime.queueInlinePanel.feedKey || "") === "" &&
        normalizeKey(
          state.runtime.queueInlinePanel.laneId || state.runtime.activeLaneId || "all"
        ) === normalizedLaneId;
      const nextOpen = !wasSameInlinePanel;
      if (nextOpen) {
        reconcileRuntimeSelection(getQueueLaneThreads(normalizedLaneId), {
          preferredThreadId: workspaceSourceOfTruth.getSelectedThreadId(),
          resetHistoryOnChange: true,
        });
      }
      state.runtime.queueInlinePanel = {
        ...state.runtime.queueInlinePanel,
        open: nextOpen,
        laneId: normalizedLaneId,
        feedKey: "",
      };
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        open: false,
        selectedConversationId: "",
      };
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("queue_inline_lane_toggled");
      debugReentrySnapshot("AFTER QUEUE INLINE LANE TOGGLE");
      debugRuntimePipeline("AFTER QUEUE INLINE LANE TOGGLE");
      const queueStream = queueHistoryList?.closest(".queue-stream");
      if (queueStream) {
        queueStream.scrollTop = 0;
      }
    }

    function openQueueInlineFeed(feedKey) {
      const normalizedFeedKey = normalizeKey(feedKey || "");
      if (!normalizedFeedKey) return;
      const wasSameInlinePanel =
        state.runtime.queueInlinePanel.open &&
        normalizeKey(state.runtime.queueInlinePanel.feedKey || "") === normalizedFeedKey;
      const nextOpen = !wasSameInlinePanel;
      if (nextOpen) {
        reconcileRuntimeSelection(getMailFeedRuntimeThreads(normalizedFeedKey), {
          preferredThreadId: workspaceSourceOfTruth.getSelectedThreadId(),
          resetHistoryOnChange: true,
        });
      }
      state.runtime.queueInlinePanel = {
        ...state.runtime.queueInlinePanel,
        open: nextOpen,
        laneId: "",
        feedKey: nextOpen ? normalizedFeedKey : "",
      };
      state.runtime.queueHistory = {
        ...state.runtime.queueHistory,
        open: false,
        selectedConversationId: "",
      };
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("queue_inline_feed_toggled");
      debugReentrySnapshot("AFTER QUEUE INLINE FEED TOGGLE");
      debugRuntimePipeline("AFTER QUEUE INLINE FEED TOGGLE");
      const queueStream = queueHistoryList?.closest(".queue-stream");
      if (queueStream) {
        queueStream.scrollTop = 0;
      }
    }

    function refreshQueueInlineHistoryIfOpen() {
      if (!state.runtime.queueHistory.open) {
        return;
      }
      loadQueueHistory({ force: true }).catch((error) => {
        console.warn("CCO queue-historik kunde inte uppdateras i aktiv panel.", error);
      });
    }

    function setConversationHistoryOpen(open) {
      const collapseButton = conversationCollapseButton;
      const historyNode = conversationHistory;
      if (!collapseButton || !historyNode) return;
      collapseButton.setAttribute("aria-expanded", open ? "true" : "false");
      historyNode.classList.toggle("is-collapsed", !open);
      const label = collapseButton.querySelector(".conversation-collapse-label");
      if (label) {
        const olderCount = historyNode.querySelectorAll(".conversation-entry-history").length;
        label.textContent = open
          ? `Dölj ${olderCount} äldre meddelanden`
          : `Visa ${olderCount} äldre meddelanden`;
      }
      captureRuntimeReentrySnapshot("conversation_history_toggled");
    }

    async function requestAnalyzeInboxPayload(runtimeMailboxIds = [], { force = false } = {}) {
      const now = Date.now();
      if (
        !force &&
        !runtimeAnalyzeInboxFlight &&
        now - runtimeAnalyzeInboxCompletedAt < RUNTIME_ANALYZE_INBOX_MIN_INTERVAL_MS
      ) {
        return { skipped: true, reason: "debounced" };
      }
      if (runtimeAnalyzeInboxFlight) {
        return runtimeAnalyzeInboxFlight;
      }
      runtimeAnalyzeInboxFlight = apiRequest("/api/v1/capabilities/AnalyzeInbox/run", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey("major-arcana-runtime"),
        },
        body: {
          channel: "admin",
          input: {
            includeClosed: false,
            maxDrafts: 5,
            mailboxIds: runtimeMailboxIds,
          },
        },
      })
        .then((payload) => ({ skipped: false, payload }))
        .finally(() => {
          runtimeAnalyzeInboxCompletedAt = Date.now();
          runtimeAnalyzeInboxFlight = null;
        });
      return runtimeAnalyzeInboxFlight;
    }

    async function continueLiveRuntimeFromAnalyzeInbox({
      analysisPayload,
      runtimeMailboxIds,
      preferredThreadId,
      isCurrentRequest,
      truthPrimaryPromise = null,
      truthPrimaryPayload: initialTruthPrimaryPayload = null,
      activeTruthPrimaryMailboxIds: initialActiveTruthPrimaryMailboxIds = [],
      configuredTruthPrimaryMailboxIds = [],
      truthPrimaryFallbackReason: initialTruthPrimaryFallbackReason = "",
      configuredFocusTruthMailboxIds = [],
      configuredStudioTruthMailboxIds = [],
      shouldApplyPhaseA = true,
      isBackgroundRefresh = false,
      stableFocusThread = null,
      selectedThreadId = "",
      options = {},
      status = {},
    } = {}) {
      let truthPrimaryPayload = initialTruthPrimaryPayload;
      let activeTruthPrimaryMailboxIds = [...initialActiveTruthPrimaryMailboxIds];
      let truthPrimaryFallbackReason = initialTruthPrimaryFallbackReason;

      const liveData =
        analysisPayload?.output && typeof analysisPayload.output === "object"
          ? analysisPayload.output.data
          : null;
      if (!liveData || typeof liveData !== "object") {
        throw new Error("AnalyzeInbox returnerade ingen aktiv data.");
      }

      if (!truthPrimaryPayload && truthPrimaryPromise) {
        const truthPrimaryResult = await truthPrimaryPromise;
        if (!isCurrentRequest()) return;
        if (truthPrimaryResult && truthPrimaryResult.ok) {
          truthPrimaryPayload = truthPrimaryResult.payload;
          activeTruthPrimaryMailboxIds = [...configuredTruthPrimaryMailboxIds];
        } else if (truthPrimaryResult && truthPrimaryResult.error) {
          truthPrimaryFallbackReason =
            truthPrimaryResult.error instanceof Error
              ? truthPrimaryResult.error.message
              : String(truthPrimaryResult.error);
          console.warn(
            "CCO kunde inte läsa truth-primary worklist för wave 1. Faller tillbaka till legacy.",
            truthPrimaryResult.error
          );
        }
      } else if (
        truthPrimaryPayload &&
        !activeTruthPrimaryMailboxIds.length &&
        configuredTruthPrimaryMailboxIds.length
      ) {
        activeTruthPrimaryMailboxIds = [...configuredTruthPrimaryMailboxIds];
      }

      const existingQueuePreviewByThreadId = new Map(
        asArray(state.runtime.threads)
          .map((thread) => [normalizeKey(thread?.id), asText(thread?.queuePreviewText)])
          .filter((entry) => entry[0] && entry[1])
      );
      const preserveBackgroundQueuePreviewText = (threads = [], phase = "") =>
        asArray(threads).map((thread) => {
          const nextThread =
            thread && typeof thread === "object"
              ? { ...thread, dataPhase: phase || asText(thread?.dataPhase) }
              : thread;
          if (!nextThread || typeof nextThread !== "object") return nextThread;
          if (!isBackgroundRefresh || phase !== "A") return nextThread;
          const stableQueuePreviewText = existingQueuePreviewByThreadId.get(
            normalizeKey(nextThread.id)
          );
          if (!stableQueuePreviewText) return nextThread;
          return {
            ...nextThread,
            queuePreviewText: stableQueuePreviewText,
          };
        });
      let legacyThreads = carryRuntimeCustomerIdentity(
        buildLiveThreads(liveData, {
          historyMessages: [],
          historyEvents: [],
        })
      );
      legacyThreads = sortRuntimeThreadsDeterministic(
        preserveBackgroundQueuePreviewText(legacyThreads, "A")
      );
      const mergedWorklistData =
        typeof mergeTruthPrimaryWorklistData === "function"
          ? mergeTruthPrimaryWorklistData(liveData, truthPrimaryPayload, {
              truthPrimaryMailboxIds: activeTruthPrimaryMailboxIds,
            })
          : liveData;
      let threads = carryRuntimeCustomerIdentity(
        buildLiveThreads(mergedWorklistData, {
          historyMessages: [],
          historyEvents: [],
        })
      );
      threads = sortRuntimeThreadsDeterministic(preserveBackgroundQueuePreviewText(threads, "A"));
      const FAS47_MAX_WORKLIST = 40;
      if (Array.isArray(threads) && threads.length > FAS47_MAX_WORKLIST) {
        threads = threads.slice(0, FAS47_MAX_WORKLIST);
      }
      if (Array.isArray(legacyThreads) && legacyThreads.length > FAS47_MAX_WORKLIST) {
        legacyThreads = legacyThreads.slice(0, FAS47_MAX_WORKLIST);
      }
      const activeFocusTruthMailboxIds = configuredFocusTruthMailboxIds.filter((mailboxId) =>
        activeTruthPrimaryMailboxIds.includes(mailboxId)
      );
      const activeStudioTruthMailboxIds = configuredStudioTruthMailboxIds.filter((mailboxId) =>
        activeTruthPrimaryMailboxIds.includes(mailboxId)
      );
      const focusTruthEnabled =
        activeFocusTruthMailboxIds.length > 0 &&
        typeof isTruthPrimaryFocusFeatureEnabled === "function" &&
        isTruthPrimaryFocusFeatureEnabled();
      const studioTruthEnabled =
        activeStudioTruthMailboxIds.length > 0 &&
        typeof isTruthPrimaryStudioFeatureEnabled === "function" &&
        isTruthPrimaryStudioFeatureEnabled();
      const focusTruthFallbackReason = !activeFocusTruthMailboxIds.length
        ? truthPrimaryFallbackReason
        : focusTruthEnabled
          ? ""
          : "Sanningsstyrt fokus är avstängt för wave 1. Fokusytan läser ordinarie tråd medan arbetslistan fortsatt kan vara sanningsstyrd.";
      const studioTruthFallbackReason = !activeStudioTruthMailboxIds.length
        ? truthPrimaryFallbackReason
        : studioTruthEnabled
          ? ""
          : "Sanningsstyrd svarstudio är avstängd för wave 1. Svarsstudion läser och skriver via legacy-kedjan medan arbetslista och fokus kan vara sanningsstyrda.";
      const metadata = analysisPayload?.output?.metadata || {};
      recordRuntimeThreadAssignment("live_load", {
        stage: "before_apply",
        selectedThreadId: preferredThreadId,
        threadCount: threads.length,
        legacyThreadCount: legacyThreads.length,
      });
      if (shouldApplyPhaseA) {
        state.runtime.truthPrimaryLegacyThreads = legacyThreads;
        state.runtime.threads = threads;
        try {
          if (windowObject?.CcoThreadCache && Array.isArray(threads) && threads.length) {
            windowObject.CcoThreadCache.saveThreads(threads, {
              mailboxIds: runtimeMailboxIds,
            });
          }
        } catch (_cacheError) {
          /* cache är best-effort */
        }
        if (stableFocusThread) {
          const stableFocusThreadIndex = state.runtime.threads.findIndex((thread) =>
            runtimeConversationIdsMatch(thread?.id, selectedThreadId)
          );
          if (stableFocusThreadIndex >= 0) {
            const patchedThreads = [...state.runtime.threads];
            patchedThreads[stableFocusThreadIndex] = stableFocusThread;
            state.runtime.threads = patchedThreads;
          }
        }
      }
      recordRuntimeThreadAssignment("live_load", {
        stage: "after_apply",
        selectedThreadId: preferredThreadId,
        threadCount: threads.length,
        legacyThreadCount: legacyThreads.length,
      });
      if (shouldApplyPhaseA) {
        state.runtime.mailboxes = buildMailboxCatalog(
          threads.map((thread) => {
            const mailboxAddress = asText(thread?.mailboxAddress);
            return {
              mailboxId: mailboxAddress,
              mailboxAddress,
              userPrincipalName: mailboxAddress,
            };
          }),
          {
            ...metadata,
            sourceMailboxIds: Array.from(
              new Set([
                ...runtimeMailboxIds,
                ...asArray(status?.graph?.allowlistMailboxIds),
                ...asArray(metadata?.sourceMailboxIds),
              ])
            ),
            mailboxCapabilities: state.runtime.mailboxCapabilities,
          }
        );
      }
      state.runtime.defaultSenderMailbox = asText(
        metadata?.ccoDefaultSenderMailbox,
        state.runtime.defaultSenderMailbox
      );
      if (!state.runtime.defaultSenderMailbox) {
        state.runtime.defaultSenderMailbox = CCO_DEFAULT_REPLY_SENDER;
      }
      state.runtime.defaultSignatureProfile = asText(
        metadata?.ccoDefaultSignatureProfile,
        state.runtime.defaultSignatureProfile || CCO_DEFAULT_SIGNATURE_PROFILE
      );
      state.runtime.truthPrimaryCutover = {
        enabled: activeTruthPrimaryMailboxIds.length > 0,
        configuredMailboxIds: configuredTruthPrimaryMailboxIds,
        activeMailboxIds: activeTruthPrimaryMailboxIds,
        fallbackReason: truthPrimaryFallbackReason,
        lastAppliedAt: new Date().toISOString(),
      };
      state.runtime.focusTruthPrimary = {
        enabled: focusTruthEnabled,
        configuredMailboxIds: configuredFocusTruthMailboxIds,
        activeMailboxIds: activeFocusTruthMailboxIds,
        fallbackReason: focusTruthFallbackReason,
        readOnly: true,
        lastAppliedAt: new Date().toISOString(),
      };
      state.runtime.studioTruthPrimary = {
        enabled: studioTruthEnabled,
        configuredMailboxIds: configuredStudioTruthMailboxIds,
        activeMailboxIds: activeStudioTruthMailboxIds,
        fallbackReason: studioTruthFallbackReason,
        replyOnly: true,
        lastAppliedAt: new Date().toISOString(),
      };
      if (shouldApplyPhaseA) {
        state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
          phase: "live",
          requestedMailboxIds: runtimeMailboxIds,
          liveData,
          mergedWorklistData,
          threads,
          legacyThreads,
          historyPayload: null,
          truthPrimaryPayload,
          configuredTruthPrimaryMailboxIds,
          activeTruthPrimaryMailboxIds,
        });
      }
      debugRuntimePipeline("AFTER LIVE LOAD (before restore)");
      debugReentrySnapshot("BEFORE RESTORE");
      if (!isCurrentRequest()) return;
      state.runtime.loading = false;
      state.runtime.loaded = true;
      state.runtime.staleCacheActive = false;
      clearRuntimeBackgroundSync();
      setRuntimeModeState("live", {
        live: true,
        offline: false,
        authRequired: false,
        error: "",
      });
      resetRuntimeTransientRetry();
      state.runtime.lastSyncAt = new Date().toISOString();
      restoreRuntimeReentrySnapshot("live_runtime_load", { scopeMode: "hint_only" });
      debugReentrySnapshot("AFTER RESTORE");
      debugRuntimePipeline("AFTER RESTORE");
      await finalizeRuntimeLoad({
        preferredThreadId,
        resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
      });
      debugRuntimePipeline("AFTER FINALIZE");
      if (!isCurrentRequest()) return;
      if (isBackgroundRefresh) {
        state.runtime.pendingFullRefresh = false;
      }
      scheduleRuntimeHistoryCoverageWarmup(runtimeMailboxIds, {
        isCurrentRequest,
      });
      await requestRuntimeThreadHydration(preferredThreadId, {
        mailboxIds: runtimeMailboxIds,
      });
      if (!isCurrentRequest()) return;
      scheduleRuntimeLiveRefresh({
        requestedMailboxIds: runtimeMailboxIds,
        preferredThreadId,
      });
      captureRuntimeReentrySnapshot("live_runtime_loaded");
    }

    function scheduleMailboxScopeLiveReload(requestedMailboxIds = []) {
      if (runtimeMailboxScopeLoadTimer) {
        windowObject.clearTimeout(runtimeMailboxScopeLoadTimer);
      }
      const mailboxIds = asArray(requestedMailboxIds).filter(Boolean);
      runtimeMailboxScopeLoadTimer = windowObject.setTimeout(() => {
        runtimeMailboxScopeLoadTimer = 0;
        const hasLiveThreads = runtimeHasLiveThreads();
        loadLiveRuntime({
          requestedMailboxIds: mailboxIds,
          preferredThreadId: "",
          resetHistoryOnChange: true,
          staleWhileRevalidate: hasLiveThreads,
        })
          .catch((error) => {
            console.warn("CCO aktiv körning misslyckades efter mejlkontobyte.", error);
          })
          .finally(() => {
            clearRuntimeBackgroundSync();
            paintRuntimeShell("queue");
          });
      }, RUNTIME_MAILBOX_SCOPE_DEBOUNCE_MS);
    }

    async function loadLiveRuntime(options = {}) {
      if (isStaffJournalOpenAccessClient()) {
        state.runtime.loading = false;
        state.runtime.authRequired = false;
        return;
      }
      clearRuntimeLiveRefreshTimer();
      const requestedMailboxIds = asArray(options.requestedMailboxIds)
        .map((value) =>
          typeof canonicalizeRuntimeMailboxId === "function"
            ? canonicalizeRuntimeMailboxId(value)
            : normalizeMailboxId(value)
        )
        .filter(Boolean);
      const runtimeMailboxIds = requestedMailboxIds.length
        ? requestedMailboxIds
        : getRequestedRuntimeMailboxIds();
      const preferredThreadId = asText(options.preferredThreadId);
      const selectedThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());
      let stableFocusThread =
        selectedThreadId &&
        asArray(state.runtime.liveHydratedThreadIds).some((threadId) =>
          runtimeConversationIdsMatch(threadId, selectedThreadId)
        )
          ? asArray(state.runtime.threads).find((thread) =>
              runtimeConversationIdsMatch(thread?.id, selectedThreadId)
            ) || null
          : null;
      const runtimeRequestSequence = ++liveRuntimeRequestSequence;
      const isCurrentRequest = () => runtimeRequestSequence === liveRuntimeRequestSequence;
      clearRuntimeAuthRecoveryTimer();
      const isBackgroundRefresh = options.isBackgroundRefresh === true;
      const staleWhileRevalidate = options.staleWhileRevalidate === true;
      const shouldClearPhaseA = !isBackgroundRefresh && !staleWhileRevalidate;
      const shouldApplyPhaseA = !isBackgroundRefresh || staleWhileRevalidate;
      if (isBackgroundRefresh) {
        state.runtime.isBackgroundRefresh = true;
        state.runtime.backgroundRefreshSelectedThreadId = asText(
          workspaceSourceOfTruth.getSelectedThreadId()
        );
      }

      if (state.runtime?.authRequired === true && options.allowAuthRecovery !== true) {
        return;
      }

      if (
        isMobileShellViewport() &&
        options.forceReload !== true &&
        !requestedMailboxIds.length &&
        runtimeHasLiveThreads() &&
        state.runtime?.loading !== true &&
        (options.viewRestoreOnly === true ||
          (options.isBackgroundRefresh !== true &&
            options.staleWhileRevalidate === true &&
            state.runtime?.loaded === true))
      ) {
        paintRuntimeShell("queue");
        if (options.viewRestoreOnly === true && options.isBackgroundRefresh !== true) {
          return;
        }
      }

      try {
        const adminToken = await waitForRuntimeAuthToken();
        if (!isCurrentRequest()) return;
        if (!adminToken) {
          if (isBackgroundRefresh) {
            state.runtime.pendingFullRefresh = false;
          }
          state.runtime.loading = false;
          state.runtime.loaded = false;
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "auth_required",
            requestedMailboxIds: runtimeMailboxIds,
            error: "Logga in igen i admin för att läsa aktiv kö, historikstöd och mejlkontostatus.",
          });
          if (hasMeaningfulRuntimeReentryState()) {
            captureRuntimeReentrySnapshot("auth_required");
          }
          setRuntimeModeState("auth_required", {
            authRequired: true,
            error: RUNTIME_AUTH_REQUIRED_USER_MESSAGE,
          });
          setRuntimeAuthRecoveryPollingEnabled(true);
          resetRuntimeAuthRecoveryBackoff();
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: runtimeMailboxIds,
          });
          clearRuntimeLiveRefreshTimer();
          renderRuntimeConversationShell();
          return;
        }

        if (staleWhileRevalidate || runtimeHasLiveThreads()) {
          markRuntimeNonBlockingSync();
        } else {
          // Mail-pattern: kallstart blockerar inte UI — tom kö tills data kommer.
          state.runtime.loading = false;
          state.runtime.backgroundSyncActive = true;
        }
        if (shouldClearPhaseA) {
          state.runtime.truthPrimaryLegacyThreads = [];
          state.runtime.liveHydratedThreadIds = [];
          runtimeThreadHistoryPayloadCache.clear();
        }
        resetRuntimeOpenFlowDiagnostics({
          requestSequence: runtimeRequestSequence,
          reason: "live_runtime_load",
        });
        if (shouldClearPhaseA) {
          state.runtime.truthPrimaryCutover = {
            enabled: false,
            configuredMailboxIds: [],
            activeMailboxIds: [],
            fallbackReason: "",
            lastAppliedAt: "",
          };
          state.runtime.focusTruthPrimary = {
            enabled: false,
            configuredMailboxIds: [],
            activeMailboxIds: [],
            fallbackReason: "",
            readOnly: true,
            lastAppliedAt: "",
          };
          setRuntimeModeState("", {
            error: "",
            live: false,
            offline: false,
            authRequired: false,
          });
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "loading",
            requestedMailboxIds: runtimeMailboxIds,
          });
          renderRuntimeConversationShell();
        } else if (staleWhileRevalidate) {
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "cache_sync",
            requestedMailboxIds: runtimeMailboxIds,
          });
        }

        const status = await apiRequest("/api/v1/cco/runtime/status");
        if (!isCurrentRequest()) return;
        applyRuntimeGraphStatus(status?.graph || {});
        if (status?.graph?.readEnabled !== true) {
          clearRuntimeLiveRefreshTimer();
          if (isBackgroundRefresh) {
            state.runtime.pendingFullRefresh = false;
          }
          await loadOfflineHistoryRuntime({
            runtimeMailboxIds,
            preferredThreadId,
            resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
            offlineMessage:
              "Den aktiva kön är offline. Visar senaste historiken för valt mejlurval.",
            isCurrentRequest,
          });
          return;
        }

        // Truth-primary-first på kallstart: måla arbetslistan direkt om rader finns,
        // kör sedan AnalyzeInbox i bakgrunden (samma mönster som IndexedDB-cache).
        const configuredTruthPrimaryMailboxIds =
          typeof getTruthPrimaryWorklistMailboxIds === "function"
            ? getTruthPrimaryWorklistMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];
        const configuredFocusTruthMailboxIds =
          typeof getTruthPrimaryFocusMailboxIds === "function"
            ? getTruthPrimaryFocusMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];
        const configuredStudioTruthMailboxIds =
          typeof getTruthPrimaryStudioMailboxIds === "function"
            ? getTruthPrimaryStudioMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];

        let activeTruthPrimaryMailboxIds = [];
        let truthPrimaryFallbackReason = "";
        let truthPrimaryPayload = null;
        let truthPrimaryFastPathApplied = false;
        const canUseTruthPrimaryFastPath =
          !isBackgroundRefresh &&
          configuredTruthPrimaryMailboxIds.length > 0 &&
          typeof buildTruthPrimaryWorklistConsumerHref === "function" &&
          typeof buildWorklistDataFromTruthPrimaryOnly === "function";

        let truthPrimaryPromise = null;
        if (
          configuredTruthPrimaryMailboxIds.length &&
          typeof buildTruthPrimaryWorklistConsumerHref === "function"
        ) {
          if (canUseTruthPrimaryFastPath) {
            try {
              truthPrimaryPayload = await apiRequest(
                buildTruthPrimaryWorklistConsumerHref(configuredTruthPrimaryMailboxIds)
              );
              if (!isCurrentRequest()) return;
              activeTruthPrimaryMailboxIds = [...configuredTruthPrimaryMailboxIds];

              const truthRowCount = asArray(truthPrimaryPayload?.rows).length;
              if (truthRowCount > 0) {
                const bootstrapPaint = !staleWhileRevalidate && !runtimeHasLiveThreads();
                const detectNewMail =
                  !bootstrapPaint || !hasTruthPrimaryServerEnrichment(truthPrimaryPayload);
                const paintResult = paintTruthPrimaryWorklistFromPayload(truthPrimaryPayload, {
                  runtimeMailboxIds,
                  configuredTruthPrimaryMailboxIds,
                  activeTruthPrimaryMailboxIds: configuredTruthPrimaryMailboxIds,
                  status,
                  mergeWithExisting: staleWhileRevalidate || runtimeHasLiveThreads(),
                  detectNewMail,
                });
                state.runtime.lastTruthConsumerSig = getTruthConsumerSignature(truthPrimaryPayload);
                state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
                  phase: "truth_primary_fast",
                  requestedMailboxIds: runtimeMailboxIds,
                  threads: state.runtime.threads,
                  legacyThreads: [],
                  truthPrimaryPayload,
                  configuredTruthPrimaryMailboxIds,
                  activeTruthPrimaryMailboxIds: configuredTruthPrimaryMailboxIds,
                });
                paintRuntimeShell("all");
                if (typeof syncRuntimeVisualStateMachine === "function") {
                  syncRuntimeVisualStateMachine();
                }
                if (windowObject.__litSwitchover?.clearBootstrapWindow) {
                  windowObject.__litSwitchover.clearBootstrapWindow();
                }
                truthPrimaryFastPathApplied = paintResult.applied === true;
                activeTruthPrimaryMailboxIds = [...configuredTruthPrimaryMailboxIds];
                if (hasTruthPrimaryServerEnrichment(truthPrimaryPayload)) {
                  markRuntimeEnrichmentReadyIfAvailable(truthPrimaryPayload);
                  persistRuntimeThreadCacheIfReady({ runtimeMailboxIds });
                }
              }
            } catch (truthPrimaryError) {
              truthPrimaryFallbackReason =
                truthPrimaryError instanceof Error
                  ? truthPrimaryError.message
                  : String(truthPrimaryError);
              console.warn(
                "CCO kunde inte läsa truth-primary worklist för snabbstart. Fortsätter med AnalyzeInbox.",
                truthPrimaryError
              );
            }
          } else {
            truthPrimaryPromise = apiRequest(
              buildTruthPrimaryWorklistConsumerHref(configuredTruthPrimaryMailboxIds)
            ).then(
              (payload) => ({ ok: true, payload }),
              (error) => ({ ok: false, error })
            );
          }
        }

        if (!isBackgroundRefresh) {
          state.runtime.loading = false;
          if (!truthPrimaryFastPathApplied) {
            paintRuntimeShell("all");
          } else {
            paintRuntimeShell("chrome");
          }
          if (typeof syncRuntimeVisualStateMachine === "function") {
            syncRuntimeVisualStateMachine();
          }
          void finalizeRuntimeLoad({
            preferredThreadId,
            resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
          }).catch((error) => {
            console.warn("CCO finalizeRuntimeLoad misslyckades.", error);
          });
          captureRuntimeReentrySnapshot("live_runtime_early_ready");
          const deferredSequence = runtimeRequestSequence;
          void (async () => {
            try {
              const worklistReadyAtDefer =
                runtimeHasLiveThreads() || truthPrimaryFastPathApplied || staleWhileRevalidate;
              if (
                !truthPrimaryPayload &&
                configuredTruthPrimaryMailboxIds.length &&
                typeof buildTruthPrimaryWorklistConsumerHref === "function"
              ) {
                truthPrimaryPayload = await apiRequest(
                  buildTruthPrimaryWorklistConsumerHref(configuredTruthPrimaryMailboxIds)
                );
                if (deferredSequence !== liveRuntimeRequestSequence) return;
              }
              let hasNewMail = false;
              if (truthPrimaryPayload && asArray(truthPrimaryPayload.rows).length) {
                const bootstrapPaint = !worklistReadyAtDefer;
                const detectNewMail =
                  !bootstrapPaint || !hasTruthPrimaryServerEnrichment(truthPrimaryPayload);
                const paintResult = paintTruthPrimaryWorklistFromPayload(truthPrimaryPayload, {
                  runtimeMailboxIds,
                  configuredTruthPrimaryMailboxIds,
                  activeTruthPrimaryMailboxIds: configuredTruthPrimaryMailboxIds,
                  status,
                  mergeWithExisting: worklistReadyAtDefer,
                  detectNewMail,
                });
                hasNewMail = paintResult.hasNewMail === true;
                state.runtime.lastTruthConsumerSig = getTruthConsumerSignature(truthPrimaryPayload);
                if (paintResult.hasNewMail || !worklistReadyAtDefer) {
                  paintRuntimeShell("queue");
                } else {
                  paintRuntimeShell("chrome");
                }
                if (typeof syncRuntimeVisualStateMachine === "function") {
                  syncRuntimeVisualStateMachine();
                }
                try {
                  if (windowObject?.CcoThreadCache && runtimeHasLiveThreads()) {
                    windowObject.CcoThreadCache.saveThreads(state.runtime.threads, {
                      mailboxIds: runtimeMailboxIds,
                      lastEnrichedAt: asText(state.runtime?.lastEnrichedAt),
                    });
                  }
                } catch (_cacheError) {
                  /* cache är best-effort */
                }
              }

              if (
                runtimeHasLiveThreads() &&
                (!hasNewMail || hasTruthPrimaryServerEnrichment(truthPrimaryPayload))
              ) {
                markRuntimeEnrichmentReadyIfAvailable(truthPrimaryPayload);
                state.runtime.loaded = true;
                state.runtime.staleCacheActive = false;
                clearRuntimeBackgroundSync();
                scheduleRuntimeLiveRefresh({
                  requestedMailboxIds: runtimeMailboxIds,
                  preferredThreadId,
                });
                return;
              }

              const analyzeRequest = await requestAnalyzeInboxPayload(runtimeMailboxIds, {
                force: !runtimeHasLiveThreads() || hasNewMail,
              });
              if (deferredSequence !== liveRuntimeRequestSequence) return;
              if (analyzeRequest?.skipped === true) return;
              await continueLiveRuntimeFromAnalyzeInbox({
                analysisPayload: analyzeRequest?.payload || analyzeRequest,
                runtimeMailboxIds,
                preferredThreadId,
                isCurrentRequest: () => deferredSequence === liveRuntimeRequestSequence,
                truthPrimaryPromise,
                truthPrimaryPayload,
                activeTruthPrimaryMailboxIds,
                configuredTruthPrimaryMailboxIds,
                truthPrimaryFallbackReason,
                configuredFocusTruthMailboxIds,
                configuredStudioTruthMailboxIds,
                shouldApplyPhaseA: true,
                isBackgroundRefresh: false,
                stableFocusThread,
                selectedThreadId,
                options,
                status,
              });
            } catch (error) {
              console.warn("CCO bakgrunds-AnalyzeInbox misslyckades.", error);
            }
          })();
          return;
        }

        if (isBackgroundRefresh) {
          state.runtime.pendingFullRefresh = false;
          await refreshRuntimeWorklistFromTruthDelta({
            runtimeMailboxIds,
            preferredThreadId,
            status,
            runAnalyzeInboxForNewMail: true,
          });
          return;
        }

        const analyzeRequest = await requestAnalyzeInboxPayload(runtimeMailboxIds, {
          force: truthPrimaryFastPathApplied || staleWhileRevalidate,
        });
        if (!isCurrentRequest()) return;
        if (analyzeRequest?.skipped === true) {
          if (isBackgroundRefresh) {
            state.runtime.pendingFullRefresh = false;
          }
          return;
        }
        const analysisPayload = analyzeRequest?.payload || analyzeRequest;

        await continueLiveRuntimeFromAnalyzeInbox({
          analysisPayload,
          runtimeMailboxIds,
          preferredThreadId,
          isCurrentRequest,
          truthPrimaryPromise,
          truthPrimaryPayload,
          activeTruthPrimaryMailboxIds,
          configuredTruthPrimaryMailboxIds,
          truthPrimaryFallbackReason,
          configuredFocusTruthMailboxIds,
          configuredStudioTruthMailboxIds,
          shouldApplyPhaseA,
          isBackgroundRefresh,
          stableFocusThread,
          selectedThreadId,
          options,
          status,
        });
        stableFocusThread = null;
      } catch (error) {
        if (!isCurrentRequest()) return;
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (isBackgroundRefresh) {
          state.runtime.pendingFullRefresh = false;
        }
        state.runtime.loading = false;
        state.runtime.loaded = false;
        state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
          phase: isAuthFailure(statusCode, message) ? "auth_required" : "runtime_error",
          requestedMailboxIds: runtimeMailboxIds,
          error: message,
        });
        const authRequired =
          !isStaffJournalOpenAccessClient() && isAuthFailure(statusCode, message);
        if (authRequired && typeof clearAdminToken === "function") {
          clearAdminToken();
        }
        setRuntimeModeState(authRequired ? "auth_required" : "runtime_error", {
          error: authRequired ? RUNTIME_AUTH_REQUIRED_USER_MESSAGE : message,
          live: false,
          offline: normalizeKey(message).includes("offline"),
          authRequired,
        });
        clearRuntimeLiveRefreshTimer();
        if (authRequired) {
          setRuntimeAuthRecoveryPollingEnabled(true);
          resetRuntimeAuthRecoveryBackoff();
          if (hasMeaningfulRuntimeReentryState()) {
            captureRuntimeReentrySnapshot("auth_failure");
          }
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: runtimeMailboxIds,
          });
          // Auth-flow äger retry från och med nu; städa transient-retry.
          resetRuntimeTransientRetry();
        } else {
          // Transient runtime-fel (502/503/504/network/JSON-parse).
          // Schemalägg automatisk retry så att UI självläker när servern svarar igen.
          scheduleRuntimeTransientRetry({
            requestedMailboxIds: runtimeMailboxIds,
          });
        }
        renderRuntimeConversationShell();
      } finally {
        if (isBackgroundRefresh && !isCurrentRequest()) {
          state.runtime.pendingFullRefresh = false;
        }
        if (isBackgroundRefresh) {
          state.runtime.isBackgroundRefresh = false;
          state.runtime.backgroundRefreshSelectedThreadId = "";
        }
      }
    }

    function mapCachedRuntimeThreads(cached = []) {
      return asArray(cached).map((thread) =>
        thread && typeof thread === "object"
          ? {
              ...thread,
              worklistSource: asText(thread?.worklistSource, "cache") || "cache",
              dataPhase: asText(thread?.dataPhase, "cache") || "cache",
            }
          : thread
      );
    }

    function applyRuntimeScopeThreadCacheIfAvailable(requestedMailboxIds = []) {
      try {
        const hasAdminToken = Boolean(
          typeof localStorage !== "undefined" && localStorage.getItem("ARCANA_ADMIN_TOKEN")
        );
        if (!hasAdminToken || !windowObject?.CcoThreadCache?.loadThreads) {
          return Promise.resolve(false);
        }
        const mailboxIds = asArray(requestedMailboxIds).filter(Boolean);
        return windowObject.CcoThreadCache.loadThreads({ mailboxIds })
          .then((cached) => {
            if (!Array.isArray(cached) || cached.length === 0) return false;
            markRuntimeNonBlockingSync();
            state.runtime.threads = mapCachedRuntimeThreads(cached);
            state.runtime.staleCacheActive = true;
            state.runtime.loading = false;
            setRuntimeModeState("live", {
              live: true,
              offline: false,
              authRequired: false,
              error: "",
            });
            renderRuntimeConversationShell();
            if (typeof syncRuntimeVisualStateMachine === "function") {
              syncRuntimeVisualStateMachine();
            }
            return true;
          })
          .catch(() => false);
      } catch (_error) {
        return Promise.resolve(false);
      }
    }

    function applyRuntimeThreadCacheIfAvailable() {
      try {
        const hasAdminToken = Boolean(
          typeof localStorage !== "undefined" && localStorage.getItem("ARCANA_ADMIN_TOKEN")
        );
        if (!hasAdminToken || !windowObject?.CcoThreadCache?.loadThreads) {
          return Promise.resolve(false);
        }
        const mailboxIds =
          typeof getRequestedRuntimeMailboxIds === "function"
            ? getRequestedRuntimeMailboxIds()
            : [];
        const loader =
          windowObject?.CcoThreadCache?.loadCacheEntry ||
          ((options) =>
            windowObject?.CcoThreadCache?.loadThreads
              ? windowObject.CcoThreadCache.loadThreads(options).then((threads) =>
                  Array.isArray(threads) ? { threads } : null
                )
              : Promise.resolve(null));
        return loader({ mailboxIds })
          .then((entry) => {
            const cached = entry && Array.isArray(entry.threads) ? entry.threads : null;
            if (!Array.isArray(cached) || cached.length === 0) return false;
            const alreadyLive =
              state.runtime?.loaded === true ||
              asArray(state.runtime?.threads).some(
                (thread) => normalizeKey(thread?.worklistSource) !== "demo"
              );
            if (alreadyLive) return false;

            state.runtime.threads = mapCachedRuntimeThreads(cached);
            state.runtime.lastEnrichedAt = asText(entry?.lastEnrichedAt);
            state.runtime.staleCacheActive = true;
            state.runtime.backgroundSyncActive = true;
            state.runtime.loading = false;
            state.runtime.loaded = Boolean(state.runtime.lastEnrichedAt);
            setRuntimeModeState("live", {
              live: true,
              offline: false,
              authRequired: false,
              error: "",
            });
            paintRuntimeShell("chrome");
            paintRuntimeShell("queue");
            if (typeof syncRuntimeVisualStateMachine === "function") {
              syncRuntimeVisualStateMachine();
            }
            if (windowObject.__litSwitchover?.clearBootstrapWindow) {
              windowObject.__litSwitchover.clearBootstrapWindow();
            }
            try {
              windowObject.dispatchEvent(new CustomEvent("cco:runtime-update"));
            } catch (_dispatchError) {
              /* ignore */
            }
            return true;
          })
          .catch(() => false);
      } catch (_error) {
        return Promise.resolve(false);
      }
    }

    function bindWorkspaceInteractions() {
      if (interactionsBound) return;
      interactionsBound = true;

      openButtons.forEach((button) => {
        button.addEventListener("click", () => {
          runtimeActionEngine.openRuntimeStudio(button.dataset.studioMode || "reply");
        });
      });

      closeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setStudioOpen(false);
          setContextCollapsed(false);
        });
      });

      contextButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setContextCollapsed(!canvas.classList.contains("is-context-collapsed"));
        });
      });

      noteOpenButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const selectedThread =
            typeof getSelectedRuntimeThread === "function" ? getSelectedRuntimeThread() : null;
          const studioState =
            selectedThread && typeof ensureStudioState === "function"
              ? ensureStudioState(selectedThread)
              : state.studio;
          if (typeof markStudioToolUsed === "function") {
            markStudioToolUsed(studioState, "note");
          }
          if (
            selectedThread &&
            studioState &&
            typeof applyStudioBookingUpdateToolPhaseDraft === "function"
          ) {
            studioState.draftBody = applyStudioBookingUpdateToolPhaseDraft(
              selectedThread,
              studioState,
              studioState.draftBody,
              "note"
            );
          }
          runtimeActionEngine.openRuntimeNote().catch(() => {});
        });
      });

      noteCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setNoteOpen(false);
        });
      });

      const focusContextCloseButtons =
        windowObject?.document && typeof windowObject.document.querySelectorAll === "function"
          ? Array.from(windowObject.document.querySelectorAll("[data-focus-context-close]"))
          : [];
      focusContextCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setFocusContextOpen(false);
        });
      });

      scheduleOpenButtons.forEach((button) => {
        button.addEventListener("click", () => {
          runtimeActionEngine.openRuntimeSchedule({ renderDraft: true }).catch(() => {});
        });
      });

      scheduleCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setScheduleOpen(false);
        });
      });

      laterCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setLaterOpen(false);
        });
      });

      laterOptionButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyLaterOption(button.dataset.laterOption);
        });
      });

      if (studioLaterActionButton) {
        studioLaterActionButton.addEventListener("click", () => {
          openLaterDialog();
        });
      }

      if (studioPrimarySuggestion) {
        studioPrimarySuggestion.addEventListener("click", (event) => {
          event.stopPropagation();
          const thread = getSelectedRuntimeThread();
          if (!thread) return;
          if (thread.tags.includes("bookable")) {
            applyStudioTemplateSelection("confirm_booking");
            return;
          }
          applyStudioTrackSelection(state.studio.activeTrackKey || inferStudioTrackKey(thread));
        });
      }

      if (studioComposeToInput) {
        studioComposeToInput.addEventListener("input", (event) => {
          if (normalizeKey(state.studio.mode) !== "compose") return;
          state.studio.composeTo = event.target.value || "";
          setStudioFeedback("", "");
          renderStudioShell();
        });
      }

      if (studioComposeFromSelect) {
        studioComposeFromSelect.addEventListener("change", (event) => {
          const nextMailboxId = canonicalizeRuntimeMailboxId(event.target.value);
          const senderLabel = asText(
            event.target.selectedOptions?.[0]?.textContent,
            nextMailboxId || "valt mejlkonto"
          );
          if (normalizeKey(state.studio.mode) === "compose") {
            state.studio.composeMailboxId = nextMailboxId;
            renderStudioShell();
            setStudioFeedback(`Skickar från ${senderLabel}.`, "success");
            return;
          }
          const thread = getSelectedRuntimeThread();
          if (!thread) return;
          const studioTruthState =
            typeof getRuntimeStudioTruthState === "function"
              ? getRuntimeStudioTruthState(thread)
              : {};
          if (studioTruthState?.truthDriven === true) {
            renderStudioShell();
            setStudioFeedback(
              `Sanningsstyrd svarstudio låser källmejlkonto och signatur till ${asText(
                studioTruthState.sourceMailboxLabel,
                senderLabel
              )} i ${asText(studioTruthState.waveLabel, "Wave 1")}.`,
              "error"
            );
            return;
          }
          const studioState = ensureStudioState(thread);
          studioState.composeMailboxId = nextMailboxId;
          renderStudioShell();
          setStudioFeedback(`Svar skickas från ${senderLabel}.`, "success");
        });
      }

      if (studioComposeSubjectInput) {
        studioComposeSubjectInput.addEventListener("input", (event) => {
          if (normalizeKey(state.studio.mode) !== "compose") return;
          state.studio.composeSubject = event.target.value || "";
          setStudioFeedback("", "");
          renderStudioShell();
        });
      }

      if (studioEditorInput) {
        studioEditorInput.addEventListener("input", (event) => {
          if (normalizeKey(state.studio.mode) === "compose") {
            state.studio.draftBody = event.target.value || "";
            state.studio.activeTemplateKey = "";
            state.studio.activeRefineKey = "";
            setStudioFeedback("", "");
            renderStudioShell();
            return;
          }
          const thread = getSelectedRuntimeThread();
          if (!thread) return;
          const studioState = ensureStudioState(thread);
          studioState.draftBody = event.target.value || "";
          studioState.activeTemplateKey = "";
          studioState.activeRefineKey = "";
          renderStudioShell();
        });
      }

      studioTemplateButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          applyStudioTemplateSelection(button.dataset.studioTemplate);
        });
      });

      if (studioShell) {
        studioShell.addEventListener("click", (event) => {
          const signatureButton =
            event.target instanceof Element
              ? event.target.closest("[data-studio-signature]")
              : null;
          if (!signatureButton || !studioShell.contains(signatureButton)) return;
          event.stopPropagation();
          const signatureId = normalizeKey(signatureButton.dataset.studioSignature);
          const signatureProfile = getStudioSignatureProfile(signatureId);
          if (normalizeKey(state.studio.mode) === "compose") {
            state.studio.selectedSignatureId = signatureProfile.id;
            renderStudioShell();
            setStudioFeedback(`Signatur: ${signatureProfile.label}.`, "success");
            return;
          }
          const thread = getSelectedRuntimeThread();
          if (!thread) return;
          const studioTruthState =
            typeof getRuntimeStudioTruthState === "function"
              ? getRuntimeStudioTruthState(thread)
              : {};
          if (studioTruthState?.truthDriven === true) {
            renderStudioShell();
            setStudioFeedback(
              `Sanningsstyrd svarstudio låser signaturen till ${asText(
                studioTruthState.sourceMailboxLabel,
                signatureProfile.label
              )} i ${asText(studioTruthState.waveLabel, "Wave 1")}.`,
              "error"
            );
            return;
          }
          const studioState = ensureStudioState(thread);
          studioState.selectedSignatureId = signatureProfile.id;
          renderStudioShell();
          setStudioFeedback(`Signatur: ${signatureProfile.label}.`, "success");
        });
      }

      studioTrackButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          applyStudioTrackSelection(button.dataset.studioTrack);
        });
      });

      studioToneButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          applyStudioToneSelection(button.dataset.studioTone);
        });
      });

      studioRefineButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          applyStudioRefineSelection(button.dataset.studioRefine);
        });
      });

      studioToolButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          handleStudioToolAction(button.dataset.studioTool);
        });
      });

      if (studioSendButton) {
        studioSendButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void handleStudioSend();
        });
      }

      if (studioPreviewButton) {
        studioPreviewButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void handleStudioPreview();
        });
      }

      if (studioSaveDraftButton) {
        studioSaveDraftButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void handleStudioSaveDraft();
        });
      }

      if (studioDoneActionButton) {
        studioDoneActionButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void handleStudioMarkHandled();
        });
      }

      if (studioDeleteButton) {
        studioDeleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void handleStudioDelete();
        });
      }

      destinationButtons.forEach((button) => {
        button.addEventListener("click", () => {
          syncCurrentNoteDraftFromForm();
          renderNoteDestination(button.dataset.noteKey);
        });
      });

      templateButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyTemplateToActiveDraft(button.dataset.noteTemplate);
        });
      });

      if (noteText) {
        noteText.addEventListener("input", () => {
          syncCurrentNoteDraftFromForm();
          syncNoteCount();
        });
      }

      if (notePrioritySelect) {
        notePrioritySelect.addEventListener("change", syncCurrentNoteDraftFromForm);
      }

      if (noteVisibilitySelect) {
        noteVisibilitySelect.addEventListener("change", syncCurrentNoteDraftFromForm);
      }

      if (noteTagAddButton) {
        noteTagAddButton.addEventListener("click", () => {
          addTagToActiveDraft(noteTagInput?.value);
        });
      }

      if (noteTagInput) {
        noteTagInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addTagToActiveDraft(noteTagInput.value);
        });
      }

      if (noteTagsRow) {
        noteTagsRow.addEventListener("click", (event) => {
          const chip = event.target.closest("[data-note-tag]");
          if (!chip) return;
          removeTagFromActiveDraft(chip.dataset.noteTag);
        });
      }

      if (noteSaveButton) {
        noteSaveButton.addEventListener("click", () => {
          void saveNote();
        });
      }

      if (scheduleSaveButton) {
        scheduleSaveButton.addEventListener("click", () => {
          void saveSchedule();
        });
      }

      if (mailboxMenuGrid) {
        mailboxMenuGrid.addEventListener("change", (event) => {
          const input = event.target.closest("[data-runtime-mailbox]");
          if (!input) return;
          const mailboxId = normalizeMailboxId(input.dataset.runtimeMailbox);
          const nextSelected = new Set(workspaceSourceOfTruth.getSelectedMailboxIds());
          if (input.checked) {
            nextSelected.add(mailboxId);
          } else {
            nextSelected.delete(mailboxId);
          }
          const nextSelectedMailboxIds = workspaceSourceOfTruth.setSelectedMailboxIds(
            Array.from(nextSelected)
          );
          const availableMailboxIds = asArray(
            typeof getAvailableRuntimeMailboxes === "function" ? getAvailableRuntimeMailboxes() : []
          )
            .map((mailbox) =>
              canonicalizeRuntimeMailboxId(mailbox?.canonicalId || mailbox?.email || mailbox?.id)
            )
            .filter(Boolean);
          state.runtime.mailboxScopePinned =
            nextSelectedMailboxIds.length > 0 &&
            availableMailboxIds.length > 0 &&
            nextSelectedMailboxIds.length < availableMailboxIds.length;
          markRuntimeNonBlockingSync();
          workspaceSourceOfTruth.setSelectedThreadId("");
          state.runtime.historyContextThreadId = "";
          state.runtime.queueInlinePanel = {
            ...state.runtime.queueInlinePanel,
            open: false,
            laneId: "",
            feedKey: "",
          };
          state.runtime.queueHistory = {
            ...state.runtime.queueHistory,
            open: false,
            loading: false,
            loaded: false,
            error: "",
            items: [],
            selectedConversationId: "",
            hasMore: false,
            scopeKey: "",
          };
          paintRuntimeShell("queue");
          renderQueueHistorySection();
          if (typeof ensureRuntimeSelection === "function") {
            ensureRuntimeSelection();
          }
          captureRuntimeReentrySnapshot("mailboxscope_changed");
          debugReentrySnapshot("AFTER MAILBOX CHANGE");
          debugRuntimePipeline("AFTER MAILBOX CHANGE");
          refreshQueueInlineHistoryIfOpen();
          void applyRuntimeScopeThreadCacheIfAvailable(nextSelectedMailboxIds);
          if (!nextSelectedMailboxIds.length) {
            state.runtime.mailboxScopePinned = false;
            clearRuntimeBackgroundSync();
            state.runtime.queueHistory = {
              ...state.runtime.queueHistory,
              loading: false,
              loaded: true,
              error: "",
              items: [],
              selectedConversationId: "",
              hasMore: false,
              scopeKey: "",
            };
            workspaceSourceOfTruth.setSelectedThreadId("");
            renderQueueHistorySection();
            loadBootstrap({
              preserveActiveDestination: true,
              applyWorkspacePrefs: false,
              quiet: true,
            }).catch((error) => {
              console.warn("CCO workspace bootstrap misslyckades efter tomt mailboxscope.", error);
            });
            return;
          }
          scheduleMailboxScopeLiveReload(nextSelectedMailboxIds);
        });
      }

      if (ownerMenuGrid) {
        ownerMenuGrid.addEventListener("change", (event) => {
          const input = event.target.closest("[data-runtime-owner]");
          if (!input) return;
          const previousThreadId = workspaceSourceOfTruth.getSelectedThreadId();
          workspaceSourceOfTruth.setSelectedOwnerKey(input.dataset.runtimeOwner || "all");
          reconcileRuntimeScopeSelection(previousThreadId, {
            allowLaneFallback: true,
          });
          state.runtime.queueInlinePanel = {
            ...state.runtime.queueInlinePanel,
            open: false,
            laneId: "",
            feedKey: "",
          };
          paintRuntimeShell("queue");
          captureRuntimeReentrySnapshot("owner_scope_changed");
          debugReentrySnapshot("AFTER OWNER CHANGE");
          debugRuntimePipeline("AFTER OWNER CHANGE");
          refreshQueueInlineHistoryIfOpen();
          loadBootstrap({
            preserveActiveDestination: true,
            applyWorkspacePrefs: false,
            quiet: true,
          }).catch((error) => {
            console.warn("CCO workspace bootstrap misslyckades efter ägarbyte.", error);
          });
          if (ownerMenuToggle) {
            ownerMenuToggle.checked = false;
          }
        });
      }

      queueLaneButtons.forEach((button) => {
        const activateInlineLanePanel = (event) => {
          if (draggedQueueLaneId) return;
          if (event) {
            event.preventDefault();
          }
          openQueueInlineLane(button.dataset.queueLane || "all");
        };
        button.addEventListener("pointerup", activateInlineLanePanel);
        button.addEventListener("click", (event) => {
          event.preventDefault();
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activateInlineLanePanel();
        });
      });

      queueViewJumpButtons.forEach((button) => {
        const jumpToInlinePanel = (event) => {
          if (event) {
            event.preventDefault();
          }
          openQueueInlineFeed(button.dataset.queueViewJump || "sent");
        };
        button.addEventListener("pointerup", jumpToInlinePanel);
        button.addEventListener("click", (event) => {
          event.preventDefault();
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          jumpToInlinePanel();
        });
      });

      if (queueHistoryToggle) {
        const toggleQueueHistory = () => {
          const nextOpen = !state.runtime.queueHistory.open;
          const previousThreadId = workspaceSourceOfTruth.getSelectedThreadId();
          const selectedRuntimeThread =
            typeof getSelectedRuntimeThread === "function" ? getSelectedRuntimeThread() : null;
          const selectedRuntimeThreadId = asText(selectedRuntimeThread?.id || previousThreadId);
          state.runtime.queueInlinePanel = {
            ...state.runtime.queueInlinePanel,
            open: false,
            laneId: "",
            feedKey: "",
          };
          state.runtime.queueHistory = {
            ...state.runtime.queueHistory,
            open: nextOpen,
            selectedConversationId: nextOpen
              ? asText(state.runtime.queueHistory.selectedConversationId || selectedRuntimeThreadId)
              : "",
          };
          captureRuntimeReentrySnapshot("queue_history_toggled");
          if (!nextOpen) {
            reconcileRuntimeScopeSelection(previousThreadId, {
              allowLaneFallback: true,
            });
            renderRuntimeConversationShell();
            loadBootstrap({
              preserveActiveDestination: true,
              applyWorkspacePrefs: false,
              quiet: true,
            }).catch((error) => {
              console.warn(
                "CCO workspace bootstrap misslyckades efter att historikpanelen stängdes.",
                error
              );
            });
            renderQueueHistorySection();
            return;
          }
          renderQueueHistorySection();
          const nextScopeKey = getQueueHistoryScopeKey();
          loadQueueHistory({
            force:
              !state.runtime.queueHistory.loaded ||
              state.runtime.queueHistory.scopeKey !== nextScopeKey,
          }).catch((error) => {
            console.warn("CCO queue-historik kunde inte öppnas.", error);
          });
        };

        queueHistoryToggle.addEventListener("click", toggleQueueHistory);
        queueHistoryToggle.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleQueueHistory();
        });
      }

      if (queueHistoryLoadMoreButton) {
        queueHistoryLoadMoreButton.addEventListener("click", () => {
          loadQueueHistory({ append: true, force: true }).catch((error) => {
            console.warn("CCO queue-historik kunde inte läsa fler mejl.", error);
          });
        });
      }

      if (queueCollapsedList) {
        queueCollapsedList.addEventListener("dragstart", (event) => {
          const row = event.target.closest("[data-queue-lane]");
          const laneId = normalizeKey(row?.dataset.queueLane);
          if (!row || !laneId || laneId === "all") return;
          draggedQueueLaneId = laneId;
          row.classList.add("is-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", laneId);
          }
        });

        queueCollapsedList.addEventListener("dragover", (event) => {
          const row = event.target.closest("[data-queue-lane]");
          const overLaneId = normalizeKey(row?.dataset.queueLane);
          if (!row || !draggedQueueLaneId || !overLaneId || overLaneId === draggedQueueLaneId) {
            return;
          }
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
          }
        });

        queueCollapsedList.addEventListener("drop", (event) => {
          const row = event.target.closest("[data-queue-lane]");
          const overLaneId = normalizeKey(row?.dataset.queueLane);
          if (!row || !draggedQueueLaneId || !overLaneId || overLaneId === draggedQueueLaneId) {
            return;
          }
          event.preventDefault();
          const current = getOrderedQueueLaneIds();
          const next = current.filter((laneId) => laneId !== draggedQueueLaneId);
          const targetIndex = next.findIndex((laneId) => laneId === overLaneId);
          if (targetIndex >= 0) {
            next.splice(targetIndex, 0, draggedQueueLaneId);
            state.runtime.orderedLaneIds = next;
            renderRuntimeConversationShell();
          }
        });

        queueCollapsedList.addEventListener("dragend", () => {
          draggedQueueLaneId = "";
          queueCollapsedList
            .querySelectorAll(".collapsed-row.is-dragging")
            .forEach((row) => row.classList.remove("is-dragging"));
        });
      }

      if (queueHistoryList) {
        queueHistoryList.addEventListener("click", (event) => {
          handleQueueHistoryCardSelection(event, {
            reloadBootstrap: true,
            requireHistoryPanel: true,
          });
        });
      }

      resizeHandles.forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse") return;
          startResize(handle, event);
        });
        handle.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          startResize(handle, event);
        });
        handle.addEventListener("dblclick", () => {
          void resetWorkspacePrefs();
        });
      });

      if (conversationCollapseButton) {
        conversationCollapseButton.addEventListener("click", () => {
          const isOpen = conversationCollapseButton.getAttribute("aria-expanded") !== "false";
          setConversationHistoryOpen(!isOpen);
        });
      }

      if (focusHistorySearchInput) {
        focusHistorySearchInput.addEventListener("input", (event) => {
          state.runtime.historySearch = event.target.value || "";
          const focusThread =
            typeof getSelectedRuntimeFocusThread === "function"
              ? getSelectedRuntimeFocusThread()
              : getSelectedRuntimeThread();
          const focusReadState =
            typeof getRuntimeFocusReadState === "function"
              ? getRuntimeFocusReadState(focusThread)
              : {};
          renderFocusHistorySection(focusThread, focusReadState);
          captureRuntimeReentrySnapshot("history_search_changed");
        });
      }

      focusTabButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setAppView("conversations");
          applyFocusSection(button.dataset.focusSection);
        });
      });

      if (focusNotesRefreshButton) {
        focusNotesRefreshButton.addEventListener("click", () => {
          loadBootstrap({
            preserveActiveDestination: true,
            applyWorkspacePrefs: false,
            quiet: true,
            forceReload: true,
          }).catch((error) => {
            console.warn("Kunde inte uppdatera anteckningar.", error);
          });
        });
      }

      if (mailboxAdminOpenButton) {
        mailboxAdminOpenButton.addEventListener("click", () => {
          resetMailboxAdminForm({ preserveFeedback: true });
          setMailboxAdminOpen(true);
        });
      }

      mailboxAdminCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setMailboxAdminOpen(false);
          resetMailboxAdminForm({ preserveFeedback: true });
        });
      });

      if (mailboxAdminResetButton) {
        mailboxAdminResetButton.addEventListener("click", () => {
          resetMailboxAdminForm({ preserveFeedback: true });
        });
      }

      if (mailboxAdminSaveButton) {
        mailboxAdminSaveButton.addEventListener("click", () => {
          handleMailboxAdminSave();
        });
      }

      mailboxAdminSignatureButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const command = normalizeKey(button.dataset.mailboxSignatureCommand);
          if (!command) return;
          applyMailboxAdminSignatureCommand(command);
        });
      });

      if (mailboxAdminList) {
        mailboxAdminList.addEventListener("click", (event) => {
          const editButton = event.target.closest("[data-mailbox-admin-edit]");
          if (editButton) {
            const mailboxId = normalizeMailboxId(editButton.dataset.mailboxAdminEdit);
            if (!mailboxId) return;
            setMailboxAdminEditingMailbox(mailboxId);
            return;
          }
          const removeButton = event.target.closest("[data-mailbox-admin-remove]");
          if (!removeButton) return;
          const mailboxId = normalizeMailboxId(removeButton.dataset.mailboxAdminRemove);
          if (!mailboxId) return;
          const availableMailbox =
            typeof findRuntimeMailboxByScopeId === "function"
              ? findRuntimeMailboxByScopeId(mailboxId, getAvailableRuntimeMailboxes())
              : null;
          if (availableMailbox && availableMailbox.adminRemovable !== true) {
            setFeedback(
              mailboxAdminFeedback,
              "error",
              "Den här liveprofilen kan inte tas bort här."
            );
            return;
          }
          const removingLocalSignatureOnly =
            availableMailbox?.hasLiveSource === true && availableMailbox?.custom !== true;
          state.customMailboxes = state.customMailboxes.filter(
            (mailbox, index) => normalizeCustomMailboxDefinition(mailbox, index)?.id !== mailboxId
          );
          if (typeof persistCustomMailboxes === "function") {
            persistCustomMailboxes();
          }
          if (normalizeMailboxId(state.mailboxAdminEditingId) === mailboxId) {
            resetMailboxAdminForm({ preserveFeedback: true });
          }
          if (!removingLocalSignatureOnly) {
            workspaceSourceOfTruth.setSelectedMailboxIds(
              workspaceSourceOfTruth
                .getSelectedMailboxIds()
                .filter((id) => normalizeMailboxId(id) !== mailboxId)
            );
          }
          ensureRuntimeMailboxSelection();
          ensureRuntimeSelection();
          renderMailboxAdminList();
          renderRuntimeConversationShell();
          setFeedback(
            mailboxAdminFeedback,
            "success",
            removingLocalSignatureOnly
              ? "Den lokala signaturen togs bort."
              : "Mejlkontot togs bort."
          );
        });
      }

      noteModeCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setNoteModeOpen(false);
        });
      });

      noteModeOptionButtons.forEach((button) => {
        button.addEventListener("click", () => {
          applyNoteModePreset(button.dataset.noteModeOption);
        });
      });
    }

    function handleWorkspaceDocumentClick(event) {
      if (
        handleQueueHistoryCardSelection(event, {
          reloadBootstrap: true,
          requireHistoryPanel: true,
        })
      ) {
        return true;
      }

      const mailboxAdminOpenTrigger = event.target.closest("[data-mailbox-admin-open]");
      if (mailboxAdminOpenTrigger) {
        setMailboxAdminOpen(true);
        return true;
      }

      const runtimeStudioOpenButton = event.target.closest("[data-runtime-studio-open]");
      if (runtimeStudioOpenButton) {
        const runtimeStudioReadOnly =
          normalizeKey(runtimeStudioOpenButton.dataset.runtimeStudioReadOnly) === "true";
        const runtimeStudioThreadId = asText(runtimeStudioOpenButton.dataset.runtimeStudioThreadId);
        if (runtimeStudioThreadId && runtimeStudioReadOnly) {
          selectOfflineHistoryConversation(runtimeStudioThreadId, { reloadBootstrap: false });
        } else if (runtimeStudioThreadId) {
          selectRuntimeThread(runtimeStudioThreadId, { reloadBootstrap: false });
        }
        runtimeActionEngine.openRuntimeStudio("reply", runtimeStudioThreadId, {
          readOnly: runtimeStudioReadOnly,
        });
        return true;
      }

      const runtimeNoteOpenButton = event.target.closest("[data-runtime-note-open]");
      if (runtimeNoteOpenButton) {
        const runtimeNoteThreadId = asText(runtimeNoteOpenButton.dataset.runtimeNoteThreadId);
        const destinationKey = asText(runtimeNoteOpenButton.dataset.runtimeNoteDestination);
        const templateKey = asText(runtimeNoteOpenButton.dataset.runtimeNoteTemplate);
        if (runtimeNoteThreadId) {
          selectRuntimeThread(runtimeNoteThreadId, { reloadBootstrap: false });
        }
        runtimeActionEngine
          .openRuntimeNote({
            directOpen: Boolean(destinationKey || templateKey),
            destinationKey,
            templateKey,
          })
          .catch((error) => {
            console.warn("Runtime-anteckning från snabbentry misslyckades.", error);
          });
        return true;
      }

      const runtimeScheduleOpenButton = event.target.closest("[data-runtime-schedule-open]");
      if (runtimeScheduleOpenButton) {
        runtimeActionEngine.openRuntimeSchedule({ renderDraft: true }).catch((error) => {
          console.warn("Runtime-schemaläggning från snabbentry misslyckades.", error);
        });
        return true;
      }

      const focusContextOpenButton = event.target.closest("[data-focus-context-open]");
      if (focusContextOpenButton) {
        const preview = state.runtime?.focusContextPreview || state.runtime?.bookingContextPayload;
        if (preview && typeof openFocusContextPanel === "function") {
          openFocusContextPanel(preview);
        }
        return true;
      }

      const bookingContextOpenButton = event.target.closest("[data-booking-context-open]");
      if (bookingContextOpenButton) {
        const payload = state.runtime?.bookingContextPayload || state.runtime?.focusContextPreview;
        if (payload && typeof openFocusContextPanel === "function") {
          openFocusContextPanel(payload);
        }
        return true;
      }

      const bookingOpenButton = event.target.closest(
        '[data-booking-open], [data-booking-open-surface], [data-quick-action="booking_surface"]'
      );
      if (bookingOpenButton) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof openBookingOperatorSurface === "function") {
          openBookingOperatorSurface({
            scroll: false,
            message:
              "Bokningsytan öppnades. Lediga tider hämtas automatiskt när urvalet är ifyllt.",
          });
        } else {
          state.runtime = state.runtime || {};
          state.runtime.bookingShellOpen = true;
          if (typeof openBookingPanel === "function") {
            openBookingPanel();
          } else {
            setBookingOpen(true);
          }
        }
        return true;
      }

      const bookingCloseButton = event.target.closest("[data-booking-close]");
      if (bookingCloseButton) {
        setBookingOpen(false);
        return true;
      }

      const focusContextCloseButton = event.target.closest("[data-focus-context-close]");
      if (focusContextCloseButton) {
        setFocusContextOpen(false);
        return true;
      }

      const runtimeCollapseButton = event.target.closest("[data-runtime-conversation-collapse]");
      if (runtimeCollapseButton) {
        workspaceSourceOfTruth.toggleHistoryExpanded();
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        const focusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(focusThread)
            : {};
        renderRuntimeFocusConversation(focusThread, focusReadState);
        captureRuntimeReentrySnapshot("conversation_history_toggled");
        return true;
      }

      const intelDateTrigger = event.target.closest("[data-intel-date]");
      if (intelDateTrigger) {
        state.runtime.intelExpanded = state.runtime.intelExpanded === false;
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        const focusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(focusThread)
            : {};
        renderRuntimeIntel(focusThread, focusReadState);
        return true;
      }

      const runtimeReauthLink = event.target.closest("[data-runtime-reauth]");
      if (runtimeReauthLink) {
        event.preventDefault();
        armRuntimeAuthRecoveryFromInteraction({
          requestedMailboxIds: getRequestedRuntimeMailboxIds(),
        });
        windowObject.location.assign(buildReauthUrl());
        return true;
      }

      const widenMailboxButton = event.target.closest("[data-mailbox-widen-all]");
      if (widenMailboxButton) {
        event.preventDefault();
        if (typeof windowObject.__ccoWorkspace?.widenMailboxScopeToAll === "function") {
          windowObject.__ccoWorkspace.widenMailboxScopeToAll();
        }
        return true;
      }

      const quickActionButton = event.target.closest("[data-quick-action]");
      if (quickActionButton) {
        const action = quickActionButton.dataset.quickAction;
        const quickActionResult = runtimeActionEngine.handleQuickAction(quickActionButton);
        if (quickActionResult) {
          quickActionResult.catch((error) => {
            const warningByAction = {
              delete: "Runtime-radering från snabbactions misslyckades.",
              handled: "Runtime-klar från snabbactions misslyckades.",
              schedule: "Runtime-schemaläggning från snabbactions misslyckades.",
              readout: "Runtime-readout från snabbactions misslyckades.",
            };
            console.warn(warningByAction[action] || "Runtime-snabbaction misslyckades.", error);
          });
          return true;
        }
      }

      const mailAssetActionButton = event.target.closest("[data-mail-asset-action]");
      if (mailAssetActionButton) {
        event.preventDefault();
        handleRuntimeMailAssetAction(mailAssetActionButton).catch((error) => {
          console.warn("Bilageaction i fokusytan misslyckades.", error);
          windowObject.alert(asText(error?.message, "Bilagan kunde inte hämtas just nu."));
        });
        return true;
      }

      const historyMailboxButton = event.target.closest("[data-focus-history-mailbox]");
      if (historyMailboxButton) {
        state.runtime.historyMailboxFilter =
          normalizeKey(historyMailboxButton.dataset.focusHistoryMailbox) || "all";
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        const focusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(focusThread)
            : {};
        renderFocusHistorySection(focusThread, focusReadState);
        captureRuntimeReentrySnapshot("history_mailbox_filter_changed");
        return true;
      }

      const historyTypeButton = event.target.closest("[data-focus-history-type]");
      if (historyTypeButton) {
        state.runtime.historyResultTypeFilter =
          normalizeKey(historyTypeButton.dataset.focusHistoryType) || "all";
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        const focusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(focusThread)
            : {};
        renderFocusHistorySection(focusThread, focusReadState);
        captureRuntimeReentrySnapshot("history_type_filter_changed");
        return true;
      }

      const historyRangeButton = event.target.closest("[data-focus-history-range]");
      if (historyRangeButton) {
        state.runtime.historyRangeFilter =
          normalizeKey(historyRangeButton.dataset.focusHistoryRange) || "all";
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        const focusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(focusThread)
            : {};
        renderFocusHistorySection(focusThread, focusReadState);
        captureRuntimeReentrySnapshot("history_range_filter_changed");
        return true;
      }

      const historyReadoutButton = event.target.closest("[data-focus-history-readout]");
      if (historyReadoutButton) {
        const focusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : getSelectedRuntimeThread();
        windowObject.open(buildHistoryReadoutHref(focusThread), "_blank", "noopener");
        return true;
      }

      const historyDeleteButton = event.target.closest("[data-focus-history-delete]");
      if (historyDeleteButton) {
        handleFocusHistoryDelete().catch((error) => {
          console.warn("Fokusytans radering misslyckades.", error);
        });
        return true;
      }

      const customerHistoryReadoutButton = event.target.closest(
        "[data-focus-customer-history-readout]"
      );
      if (customerHistoryReadoutButton) {
        const selectedThread = getSelectedRuntimeThread();
        windowObject.open(
          buildHistoryReadoutHref(selectedThread, { customerScoped: true }),
          "_blank",
          "noopener"
        );
        return true;
      }

      const historyThreadButton = event.target.closest("[data-history-open-thread]");
      if (historyThreadButton) {
        const conversationId = asText(historyThreadButton.dataset.historyConversationId);
        if (conversationId) {
          const mailboxScopedTarget = getMailboxScopedRuntimeThreads().find((thread) =>
            runtimeConversationIdsMatch(thread.id, conversationId)
          );
          if (!mailboxScopedTarget || state.runtime.live !== true) {
            selectOfflineHistoryConversation(conversationId, { reloadBootstrap: true });
            applyFocusSection("conversation");
            return true;
          }
          if (
            mailboxScopedTarget &&
            normalizeKey(workspaceSourceOfTruth.getSelectedOwnerKey() || "all") !== "all"
          ) {
            workspaceSourceOfTruth.setSelectedOwnerKey("all");
          }
          if (
            normalizeKey(workspaceSourceOfTruth.getActiveLaneId() || "all") !== "all" &&
            !getFilteredRuntimeThreads().some((thread) =>
              runtimeConversationIdsMatch(thread.id, conversationId)
            )
          ) {
            workspaceSourceOfTruth.setActiveLaneId("all");
          }
          selectRuntimeThread(conversationId, { reloadBootstrap: true });
        }
        applyFocusSection("conversation");
        return true;
      }

      const studioChoice = event.target.closest("[data-choice-group] .studio-choice");
      if (studioChoice) {
        const group = studioChoice.closest("[data-choice-group]");
        if (!group) return false;
        const mode = group.dataset.choiceMode || "single";
        if (mode === "multiple") {
          studioChoice.classList.toggle("is-active");
          return true;
        }

        group.querySelectorAll(".studio-choice").forEach((item) => {
          item.classList.toggle("is-active", item === studioChoice);
        });
        return true;
      }

      return false;
    }

    function handleWorkspaceDocumentKeydown(event) {
      if (event.key !== "Escape") return false;

      if (state.mailboxAdminOpen) {
        setMailboxAdminOpen(false);
        return true;
      }

      if (state.noteMode.open) {
        setNoteModeOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-later-open")) {
        setLaterOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-schedule-open")) {
        setScheduleOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-note-open")) {
        setNoteOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-focus-context-open")) {
        setFocusContextOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-booking-open")) {
        setBookingOpen(false);
        return true;
      }

      if (canvas.classList.contains("is-studio-open")) {
        setStudioOpen(false);
        setContextCollapsed(false);
        return true;
      }

      return false;
    }

    async function initializeWorkspaceSurface() {
      bindWorkspaceInteractions();
      DEFAULT_WORKSPACE.left =
        Math.round(readPxVariable("--workspace-left-width")) || DEFAULT_WORKSPACE.left;
      DEFAULT_WORKSPACE.main =
        Math.round(readPxVariable("--workspace-main-width")) || DEFAULT_WORKSPACE.main;
      DEFAULT_WORKSPACE.right =
        Math.round(readPxVariable("--workspace-right-width")) || DEFAULT_WORKSPACE.right;
      workspaceState.left = DEFAULT_WORKSPACE.left;
      workspaceState.main = DEFAULT_WORKSPACE.main;
      workspaceState.right = DEFAULT_WORKSPACE.right;
      workspaceLimits.left.min = DEFAULT_WORKSPACE.left;
      workspaceLimits.right.min = DEFAULT_WORKSPACE.right;

      normalizeWorkspaceState();
      decorateStaticPills();
      renderThreadContextRows();
      renderQueueLaneShortcutRows(queueActionRows);
      renderSignalRows(focusSignalRows, FOCUS_SIGNALS);
      renderQuickActionRows(focusActionRows, FOCUS_ACTIONS);
      renderQuickActionRows(intelActionRows, INTEL_ACTIONS);
      setAppView("conversations");
      applyFocusSection("conversation");
      applyStudioMode("reply");
      renderLaterOptions(state.later.option);
      renderMailFeeds();
      renderMailFeedUndoState();
      setConversationHistoryOpen(true);
      renderMailboxOptions();
      renderMailboxAdminList();
      renderTemplateButtons();
      syncNoteCount();
      setMailboxAdminOpen(false);
      setNoteModeOpen(false);
      setFeedback(noteFeedback, "", "");
      setFeedback(scheduleFeedback, "", "");

      state.runtime.bookingShellOpen = false;
      state.runtime.bookingShellDismissed = false;
      if (typeof workspaceSourceOfTruth?.setOverlayOpen === "function") {
        workspaceSourceOfTruth.setOverlayOpen("booking", false);
      }
      if (canvas) {
        canvas.classList.remove("is-booking-open");
      }

      // Self-healing: lyssna på flikfokus så att transient-fel återställs när användaren kommer tillbaka.
      bindRuntimeVisibilityRecovery();
      bindAdminTokenStorageRecovery();

      state.runtime.bootLaneLocked = true;

      const cachedApplied = await applyRuntimeThreadCacheIfAvailable();
      const deferMobileInbox = shouldDeferMobileInboxBootstrap();
      mobileInboxDeferredBootstrap = deferMobileInbox;

      loadBootstrap({
        preserveActiveDestination: true,
        applyWorkspacePrefs: true,
        quiet: true,
      }).catch((error) => {
        console.warn("CCO workspace bootstrap misslyckades.", error);
      });

      if (!isStaffJournalOpenAccessClient()) {
        if (!deferMobileInbox) {
          loadLiveRuntime({
            staleWhileRevalidate: cachedApplied === true,
          }).catch((error) => {
            console.warn("CCO aktiv körning misslyckades.", error);
          });
        }
      }
    }

    return Object.freeze({
      bindWorkspaceInteractions,
      ensureMobileInboxReady,
      ensureSelectedRuntimeThreadHistoryBody,
      handleWorkspaceDocumentClick,
      handleWorkspaceDocumentKeydown,
      initializeWorkspaceSurface,
      loadLiveRuntime,
      requestRuntimeThreadHydration,
      selectOfflineHistoryConversation,
      selectRuntimeThread,
      setActiveRuntimeLane,
      setConversationHistoryOpen,
    });
  }

  window.MajorArcanaPreviewDomLiveComposition = Object.freeze({
    createDomLiveComposition,
  });
})();
