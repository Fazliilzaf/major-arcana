(() => {
  function createDomLiveComposition({
    dom = {},
    helpers = {},
    state,
    windowObject = window,
  }) {
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
    let runtimeMailboxScopeCommitTimer = 0;
    const MAILBOX_SCOPE_EMPTY_COMMIT_DELAY_MS = 900;
    const MAILBOX_SCOPE_NON_EMPTY_COMMIT_DELAY_MS = 140;

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
      scheduleWorkspacePrefsSave,
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
    } = helpers;

    let interactionsBound = false;
    let liveRuntimeRequestSequence = 0;
    let liveThreadHydrationSequence = 0;
    let draggedQueueLaneId = "";
    const FULL_MAILBOX_LOOKBACK_DAYS = 1095;

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
      outcome =
        typeof getRuntimeReentryOutcomeState === "function" ? getRuntimeReentryOutcomeState() : null
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
        ([, count], index) => count === 0 && stages.slice(0, index).some(([, previous]) => previous > 0)
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
        } catch (_error) {
        }
      }
      const plainMatch = rawHeader.match(/filename\s*=\s*"([^"]+)"/i) || rawHeader.match(/filename\s*=\s*([^;]+)/i);
      return asText(plainMatch?.[1], fallbackName).trim() || fallbackName;
    }

    function cloneIdentityEnvelope(value = null) {
      const safeValue = value && typeof value === "object" ? value : {};
      const customerIdentity = safeValue.customerIdentity && typeof safeValue.customerIdentity === "object"
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
          safeValue.mergeReviewDecisionsByPairId && typeof safeValue.mergeReviewDecisionsByPairId === "object"
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
      const response = await windowObject.fetch(new URL(path, windowObject.location.origin).toString(), {
        method: "GET",
        credentials: "same-origin",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!response.ok) {
        let errorMessage = "Bilagan kunde inte hämtas.";
        try {
          const payload = await response.json();
          errorMessage = asText(payload?.error, errorMessage);
        } catch (_error) {
          try {
            const payloadText = await response.text();
            errorMessage = asText(payloadText, errorMessage) || errorMessage;
          } catch (_nestedError) {
          }
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
        latestMessage?.mailThreadMessage &&
        typeof latestMessage.mailThreadMessage === "object"
          ? latestMessage.mailThreadMessage
          : null;
      const mailDocument =
        latestMessage?.mailDocument &&
        typeof latestMessage.mailDocument === "object"
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
          (normalizeKey(threadDocument?.sourceStore) || asArray(threadDocument?.messages).length > 0)) ||
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
        mimeBacked:
          canonicalMessage?.mimeBacked === true || mailDocument?.mimeBacked === true,
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
          details && typeof details === "object"
            ? JSON.parse(JSON.stringify(details))
            : null,
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
          const direction = normalizeKey(item?.direction || "inbound") === "outbound"
            ? "outbound"
            : "inbound";
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
            bodyPreview: asText(item?.detail || item?.summary, "Ingen förhandsvisning tillgänglig."),
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

    async function waitForRuntimeAuthToken({ timeoutMs = 6000, intervalMs = 60 } = {}) {
      // Give the admin session a small startup grace window so we do not flash
      // "session krävs" before the live token has had a chance to hydrate.
      const readToken = () =>
        normalizeText(typeof getAdminToken === "function" ? getAdminToken() : "");
      const existingToken = readToken();
      if (existingToken) return existingToken;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise((resolve) =>
          windowObject.setTimeout(resolve, intervalMs)
        );
        const nextToken = readToken();
        if (nextToken) return nextToken;
      }
      return isLocalPreviewHost() ? "__preview_local__" : "";
    }

    function clearRuntimeAuthRecoveryTimer() {
      if (runtimeAuthRecoveryTimer) {
        windowObject.clearTimeout(runtimeAuthRecoveryTimer);
        runtimeAuthRecoveryTimer = 0;
      }
    }

    function clearRuntimeLiveRefreshTimer() {
      if (runtimeLiveRefreshTimer) {
        windowObject.clearTimeout(runtimeLiveRefreshTimer);
        runtimeLiveRefreshTimer = 0;
      }
    }

    function clearRuntimeMailboxScopeCommitTimer() {
      if (runtimeMailboxScopeCommitTimer) {
        windowObject.clearTimeout(runtimeMailboxScopeCommitTimer);
        runtimeMailboxScopeCommitTimer = 0;
      }
    }

    function hasRuntimeAdminToken() {
      return Boolean(normalizeText(getAdminToken?.() || ""));
    }

    function clearRuntimeStoredAdminToken() {
      try {
        windowObject.localStorage?.removeItem?.("ARCANA_ADMIN_TOKEN");
      } catch {}
      try {
        windowObject.sessionStorage?.removeItem?.("ARCANA_ADMIN_TOKEN");
      } catch {}
    }

    async function verifyRuntimeAdminToken(adminToken = "") {
      const normalizedToken = normalizeText(adminToken);
      if (!normalizedToken) {
        return { ok: false, definitive: true };
      }
      if (
        normalizedToken === "__preview_local__" ||
        (typeof isLocalPreviewHost === "function" && isLocalPreviewHost())
      ) {
        return { ok: true, definitive: true };
      }
      try {
        const response = await windowObject.fetch("/api/v1/auth/me", {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Authorization: `Bearer ${normalizedToken}`,
          },
        });
        if (response.ok) {
          return { ok: true, definitive: true };
        }
        if (response.status === 401 || response.status === 403) {
          return { ok: false, definitive: true };
        }
        return { ok: true, definitive: false };
      } catch {
        return { ok: true, definitive: false };
      }
    }

    function getRuntimeReentryThreadId() {
      return asText(
        state.runtime?.queueHistory?.selectedConversationId ||
          workspaceSourceOfTruth.getSelectedThreadId()
      );
    }

    function scheduleRuntimeAuthRecovery({ requestedMailboxIds = [] } = {}) {
      clearRuntimeAuthRecoveryTimer();
      const nextRequestedMailboxIds = asArray(requestedMailboxIds)
        .map((value) =>
          typeof canonicalizeRuntimeMailboxId === "function"
            ? canonicalizeRuntimeMailboxId(value)
            : normalizeMailboxId(value)
        )
        .filter(Boolean);
      const poll = async () => {
        if (state.runtime?.authRequired !== true) {
          clearRuntimeAuthRecoveryTimer();
          return;
        }
        const adminToken = normalizeText(
          typeof getAdminToken === "function" ? getAdminToken() : ""
        );
        if (!adminToken) {
          runtimeAuthRecoveryTimer = windowObject.setTimeout(poll, 500);
          return;
        }
        clearRuntimeAuthRecoveryTimer();
        await loadLiveRuntime({
          requestedMailboxIds: nextRequestedMailboxIds.length
            ? nextRequestedMailboxIds
            : getRequestedRuntimeMailboxIds(),
          preferredThreadId: getRuntimeReentryThreadId(),
          resetHistoryOnChange: false,
        }).catch((error) => {
          console.warn("CCO live runtime kunde inte återställas efter auth-recovery.", error);
        });
      };
      runtimeAuthRecoveryTimer = windowObject.setTimeout(poll, 500);
    }

    function scheduleRuntimeLiveRefresh({
      requestedMailboxIds = [],
      preferredThreadId = "",
      intervalMs = 20000,
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
        if (state.runtime?.mode !== "live") {
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
          await loadLiveRuntime({
            requestedMailboxIds: mailboxIds,
            preferredThreadId: preferredThreadId || getRuntimeReentryThreadId(),
            resetHistoryOnChange: false,
          });
        } catch (error) {
          console.warn("CCO live runtime kunde inte uppdateras i bakgrunden.", error);
        }
        if (state.runtime?.mode === "live") {
          runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
        }
      };
      runtimeLiveRefreshTimer = windowObject.setTimeout(poll, intervalMs);
    }

    async function finalizeRuntimeLoad({
      preferredThreadId = "",
      resetHistoryOnChange = false,
      restoredFocusSection = "",
      restoredSelectedThreadId = "",
    } = {}) {
      clearRuntimeAuthRecoveryTimer();
      const effectivePreferredThreadId =
        asText(preferredThreadId) || asText(workspaceSourceOfTruth.getSelectedThreadId());
      ensureRuntimeMailboxSelection();
      normalizeVisibleRuntimeScope({
        allowLaneFallback: true,
        preferredThreadId: effectivePreferredThreadId,
        resetHistoryOnChange,
      });
      if (state.customerRuntime.loaded) {
        ensureCustomerRuntimeProfilesFromLive();
        await refreshCustomerIdentitySuggestions({ quiet: true });
      }
      renderRuntimeConversationShell();
      loadQueueHistory({ force: true, prefetch: true }).catch((queueHistoryError) => {
        console.warn("CCO queue-historik kunde inte förladdas.", queueHistoryError);
      });

      await loadBootstrap({
        preserveActiveDestination: true,
        applyWorkspacePrefs: false,
        quiet: true,
      }).catch((error) => {
        console.warn("CCO workspace bootstrap misslyckades efter live runtime.", error);
      });

      const normalizedRestoredFocusSection = normalizeKey(restoredFocusSection || "");
      const normalizedCurrentFocusSection = normalizeKey(workspaceSourceOfTruth.getFocusSection() || "");
      const normalizedRestoredSelectedThreadId = asText(
        restoredSelectedThreadId,
        effectivePreferredThreadId
      );
      const currentSelectedThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());
      if (
        normalizedRestoredFocusSection &&
        normalizedRestoredFocusSection !== normalizedCurrentFocusSection &&
        runtimeConversationIdsMatch(currentSelectedThreadId, normalizedRestoredSelectedThreadId)
      ) {
        workspaceSourceOfTruth.setFocusSection(normalizedRestoredFocusSection);
        renderRuntimeConversationShell();
      }
    }

    async function restoreRuntimeHistorySurfaceIfNeeded({
      restoredLeftColumnMode = "",
      restoredSelectedConversationId = "",
      restoredScopeKey = "",
    } = {}) {
      const normalizedRestoredLeftColumnMode = normalizeKey(restoredLeftColumnMode || "");
      if (normalizedRestoredLeftColumnMode !== "history") return false;
      const nextSelectedConversationId = asText(
        restoredSelectedConversationId,
        workspaceSourceOfTruth.getSelectedThreadId()
      );
      if (!nextSelectedConversationId) return false;
      const nextScopeKey = getQueueHistoryScopeKey();
      const shouldForceReload =
        !state.runtime.queueHistory?.loaded ||
        (asText(state.runtime.queueHistory?.scopeKey) &&
          asText(state.runtime.queueHistory?.scopeKey) !== asText(nextScopeKey));
      state.runtime.queueInlinePanel = {
        ...(state.runtime.queueInlinePanel && typeof state.runtime.queueInlinePanel === "object"
          ? state.runtime.queueInlinePanel
          : {}),
        open: false,
        laneId: "",
        feedKey: "",
      };
      state.runtime.queueHistory = {
        ...(state.runtime.queueHistory && typeof state.runtime.queueHistory === "object"
          ? state.runtime.queueHistory
          : {}),
        open: true,
        selectedConversationId: nextSelectedConversationId,
        scopeKey: asText(restoredScopeKey || nextScopeKey),
      };
      renderRuntimeConversationShell();
      await loadQueueHistory({ force: shouldForceReload }).catch((queueHistoryError) => {
        console.warn("CCO kunde inte återställa Historik som mailboxyta efter reload.", queueHistoryError);
      });
      return true;
    }

    function restoreRuntimeFocusSectionIfNeeded({
      restoredFocusSection = "",
      restoredSelectedThreadId = "",
      preferredThreadId = "",
    } = {}) {
      const normalizedRestoredFocusSection = normalizeKey(restoredFocusSection || "");
      if (!normalizedRestoredFocusSection) return false;
      const currentFocusSection = normalizeKey(workspaceSourceOfTruth.getFocusSection() || "");
      const currentSelectedThreadId = asText(workspaceSourceOfTruth.getSelectedThreadId());
      const expectedThreadId = asText(
        restoredSelectedThreadId,
        preferredThreadId || currentSelectedThreadId
      );
      if (
        normalizedRestoredFocusSection === currentFocusSection ||
        !runtimeConversationIdsMatch(currentSelectedThreadId, expectedThreadId)
      ) {
        return false;
      }
      workspaceSourceOfTruth.setFocusSection(normalizedRestoredFocusSection);
      renderRuntimeConversationShell();
      return true;
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
      const hasSameSelection =
        currentMailboxIds.length === nextMailboxIds.length &&
        currentMailboxIds.every(
          (mailboxId, index) => canonicalizeRuntimeMailboxId(mailboxId) === nextMailboxIds[index]
        );
      if (!hasSameSelection) {
        workspaceSourceOfTruth.setSelectedMailboxIds(nextMailboxIds);
      }
      return nextMailboxIds;
    }

    function runtimeMailboxScopeMatches(left = [], right = []) {
      const normalizedLeft = asArray(left)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
        .sort();
      const normalizedRight = asArray(right)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean)
        .sort();
      return (
        normalizedLeft.length === normalizedRight.length &&
        normalizedLeft.every((mailboxId, index) => mailboxId === normalizedRight[index])
      );
    }

    function shouldPreserveStableRuntimeWorkspace(nextMailboxIds = []) {
      const normalizedNextMailboxIds = asArray(nextMailboxIds)
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean);
      const selectedMailboxIds = asArray(workspaceSourceOfTruth.getSelectedMailboxIds())
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean);
      const requestedMailboxIds = asArray(getRequestedRuntimeMailboxIds())
        .map((value) => canonicalizeRuntimeMailboxId(value))
        .filter(Boolean);
      const referenceMailboxIds = selectedMailboxIds.length
        ? selectedMailboxIds
        : requestedMailboxIds;
      const hasStableThreads = asArray(state.runtime?.threads).length > 0;
      const hasStableRuntimeSurface =
        (state.runtime?.live === true || state.runtime?.loaded === true) &&
        state.runtime?.authRequired !== true &&
        hasStableThreads;
      if (!hasStableRuntimeSurface) return false;
      if (!referenceMailboxIds.length || !normalizedNextMailboxIds.length) return false;
      return runtimeMailboxScopeMatches(referenceMailboxIds, normalizedNextMailboxIds);
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

    function getPendingRuntimeMailboxSelectionIds() {
      if (!mailboxMenuGrid || typeof mailboxMenuGrid.querySelectorAll !== "function") {
        return asArray(workspaceSourceOfTruth.getSelectedMailboxIds())
          .map((value) => normalizeMailboxId(value))
          .filter(Boolean);
      }
      return Array.from(mailboxMenuGrid.querySelectorAll("input[data-runtime-mailbox]:checked"))
        .map((input) => normalizeMailboxId(input?.dataset?.runtimeMailbox))
        .filter(Boolean);
    }

    function applyRuntimeMailboxScopeSelection(nextSelectedMailboxIds = []) {
      const normalizedNextSelectedMailboxIds = asArray(nextSelectedMailboxIds)
        .map((value) => normalizeMailboxId(value))
        .filter(Boolean);
      const currentSelectedMailboxIds = asArray(workspaceSourceOfTruth.getSelectedMailboxIds())
        .map((value) => normalizeMailboxId(value))
        .filter(Boolean);
      if (runtimeMailboxScopeMatches(currentSelectedMailboxIds, normalizedNextSelectedMailboxIds)) {
        state.runtime.mailboxScopePinned = normalizedNextSelectedMailboxIds.length > 0;
        return normalizedNextSelectedMailboxIds;
      }
      const committedMailboxIds = workspaceSourceOfTruth.setSelectedMailboxIds(
        normalizedNextSelectedMailboxIds
      );
      state.runtime.mailboxScopePinned = committedMailboxIds.length > 0;
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
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("mailboxscope_changed");
      debugReentrySnapshot("AFTER MAILBOX CHANGE");
      debugRuntimePipeline("AFTER MAILBOX CHANGE");
      refreshQueueInlineHistoryIfOpen();
      if (!committedMailboxIds.length) {
        state.runtime.mailboxScopePinned = false;
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
        return committedMailboxIds;
      }
      loadLiveRuntime({
        requestedMailboxIds: committedMailboxIds,
        preferredThreadId: "",
        resetHistoryOnChange: true,
      }).catch((error) => {
        console.warn("CCO live runtime misslyckades efter mailboxbyte.", error);
      });
      return committedMailboxIds;
    }

    function scheduleRuntimeMailboxScopeSelectionCommit() {
      clearRuntimeMailboxScopeCommitTimer();
      const pendingMailboxIds = getPendingRuntimeMailboxSelectionIds();
      const currentMailboxIds = asArray(workspaceSourceOfTruth.getSelectedMailboxIds())
        .map((value) => normalizeMailboxId(value))
        .filter(Boolean);
      const delayMs =
        !pendingMailboxIds.length && currentMailboxIds.length
          ? MAILBOX_SCOPE_EMPTY_COMMIT_DELAY_MS
          : MAILBOX_SCOPE_NON_EMPTY_COMMIT_DELAY_MS;
      runtimeMailboxScopeCommitTimer = windowObject.setTimeout(() => {
        runtimeMailboxScopeCommitTimer = 0;
        applyRuntimeMailboxScopeSelection(getPendingRuntimeMailboxSelectionIds());
      }, delayMs);
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
      const {
        customerEmail,
        messageIds,
        normalizedNeedles,
        queryTexts,
      } = buildRuntimeThreadHydrationSearchCandidates(thread);
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
    } = {}) {
      const targetConversationId = asText(conversationId);
      if (!mailboxIds.length || !targetConversationId) return null;
      const params = new URLSearchParams();
      params.set("mailboxIds", mailboxIds.join(","));
      params.set("conversationId", targetConversationId);
      params.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
      params.set("includeBodyHtml", "1");
      return apiRequest(`/api/v1/cco/runtime/history?${params.toString()}`);
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

    async function hydrateRuntimeThreadHistory(
      conversationId = "",
      { mailboxIds = [] } = {}
    ) {
      const targetConversationId = asText(
        conversationId,
        asText(getSelectedRuntimeThread()?.id)
      );
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

        let updated = applyHydratedRuntimeThreadHistory(
          targetConversationId,
          historyPayload
        );
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
        console.warn(
          "CCO kunde inte hydrera rik trådhistorik för vald live-konversation.",
          error
        );
        return {
          status: "error",
          reason: "hydrate_error",
        };
      }
    }

    async function hydrateOfflineHistoryThread(
      conversationId = "",
      { mailboxIds = [] } = {}
    ) {
      const targetConversationId = asText(
        conversationId,
        asText(getSelectedRuntimeThread()?.id)
      );
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
          updated
            ? "offline_canonical_direct_applied"
            : "offline_canonical_direct_not_applied",
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
              updated
                ? "offline_canonical_search_applied"
                : "offline_canonical_search_not_applied",
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
        console.warn(
          "CCO kunde inte grafta rik canonical historik för vald offline-tråd.",
          error
        );
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
      const targetConversationId = asText(
        conversationId,
        asText(getSelectedRuntimeThread()?.id)
      );
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

    function scheduleRuntimeThinHistoryRefresh({
      runtimeMailboxIds = [],
      liveData = null,
      mergedWorklistData = null,
      metadata = {},
      requestedMailboxIds = [],
      configuredTruthPrimaryMailboxIds = [],
      activeTruthPrimaryMailboxIds = [],
      truthPrimaryPayload = null,
      isCurrentRequest = () => true,
    } = {}) {
      if (
        !runtimeMailboxIds.length ||
        !liveData ||
        typeof liveData !== "object" ||
        !mergedWorklistData ||
        typeof mergedWorklistData !== "object"
      ) {
        return;
      }

      windowObject.setTimeout(async () => {
        try {
          const historyParams = new URLSearchParams();
          historyParams.set("mailboxIds", runtimeMailboxIds.join(","));
          historyParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));
          historyParams.set("includeBodyHtml", "0");
          const historyPayload = await apiRequest(
            `/api/v1/cco/runtime/history?${historyParams.toString()}`
          );
          if (!isCurrentRequest()) return;

          const legacyThreads = carryRuntimeCustomerIdentity(
            buildLiveThreads(liveData, {
            historyMessages: historyPayload?.messages,
            historyEvents: historyPayload?.events,
            })
          );
          const threads = carryRuntimeCustomerIdentity(
            buildLiveThreads(mergedWorklistData, {
            historyMessages: historyPayload?.messages,
            historyEvents: historyPayload?.events,
            })
          );

          recordRuntimeThreadAssignment("thin_history_refresh", {
            stage: "before_apply",
            historyPayload,
            threadCount: threads.length,
            legacyThreadCount: legacyThreads.length,
          });
          state.runtime.truthPrimaryLegacyThreads = legacyThreads;
          state.runtime.threads = threads;
          recordRuntimeThreadAssignment("thin_history_refresh", {
            stage: "after_apply",
            historyPayload,
            threadCount: threads.length,
            legacyThreadCount: legacyThreads.length,
          });
          state.runtime.mailboxes = buildMailboxCatalog(
            threads.map((thread) => ({
              mailboxId: thread.mailboxAddress,
              mailboxAddress: thread.mailboxAddress,
              userPrincipalName: thread.mailboxAddress,
            })),
            {
              ...metadata,
              sourceMailboxIds: Array.from(
                new Set([
                  ...requestedMailboxIds,
                  ...asArray(metadata?.sourceMailboxIds),
                ])
              ),
              mailboxCapabilities: state.runtime.mailboxCapabilities,
            }
          );
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "live",
            requestedMailboxIds,
            liveData,
            mergedWorklistData,
            threads,
            legacyThreads,
            historyPayload,
            truthPrimaryPayload,
            configuredTruthPrimaryMailboxIds,
            activeTruthPrimaryMailboxIds,
          });
          renderRuntimeConversationShell();
        } catch (historyLoadError) {
          console.warn(
            "CCO kunde inte ladda tunn mailboxhistorik i bakgrunden efter initial live-load.",
            historyLoadError
          );
        }
      }, 0);
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
      state.runtime.startupLocked = false;
      const historyParams = new URLSearchParams();
      historyParams.set("mailboxIds", runtimeMailboxIds.join(","));
      historyParams.set("lookbackDays", String(FULL_MAILBOX_LOOKBACK_DAYS));

      let historyMessages = [];
      let historyEvents = [];
      let offlineWorkingSetSource = "history_store";
      let offlineWorkingSetMeta =
        "Offline historikläge. Arbetskön bygger just nu på senast kända mailboxhistorik.";
      let resolvedOfflineMessage =
        offlineMessage ||
        "Livekön är offline. Visar senast kända historik i stället.";

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
          historyMessages = buildOfflineWorkingSetMessagesFromSearchResults(
            searchPayload?.results
          );
          historyEvents = [];
          if (historyMessages.length) {
            offlineWorkingSetSource = "search_partial";
            offlineWorkingSetMeta =
              "Offline working set bygger på lokal historik och kan vara ofullständig tills livekön är tillbaka.";
            resolvedOfflineMessage =
              "Livekön är offline. Arbetskön bygger på lokal historik i valt mailboxscope.";
          } else {
            offlineWorkingSetSource = "search_empty";
            offlineWorkingSetMeta =
              "Offline historikläge. Ingen lokal historik hittades i valt mailboxscope ännu.";
            resolvedOfflineMessage =
              "Ingen lokal historik hittades i valt mailboxscope ännu. Livekön är fortsatt offline.";
          }
        } catch (searchError) {
          if (!isCurrentRequest()) return;
          console.warn(
            "CCO kunde inte läsa lokal historiksökfallback för offline working set.",
            searchError
          );
          offlineWorkingSetSource = "search_empty";
          offlineWorkingSetMeta =
            "Offline historikläge. Ingen lokal historik hittades i valt mailboxscope ännu.";
          resolvedOfflineMessage =
            historyErrorMessage ||
            "Ingen lokal historik hittades i valt mailboxscope ännu. Livekön är fortsatt offline.";
        }
      }

      const threads = carryRuntimeCustomerIdentity(
        buildLiveThreads(
          {
            conversationWorklist: [],
            inboundFeed: [],
            outboundFeed: [],
          },
          {
            historyMessages,
            historyEvents,
          }
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
        fallbackReason: "Offline historikläge. Fokusytan läser inte truth-driven focus i detta läge.",
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
      state.runtime.threads = threads;
      state.runtime.mailboxes = buildMailboxCatalog(
        threads.map((thread) => ({
          mailboxId: thread.mailboxAddress,
          mailboxAddress: thread.mailboxAddress,
          userPrincipalName: thread.mailboxAddress,
        })),
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
          console.warn("CCO workspace bootstrap misslyckades efter att offline-historikval rensades.", error);
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
      const selectionChanged = !runtimeConversationIdsMatch(currentConversationId, nextConversationId);
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
          console.warn("CCO kunde inte grafta vald offline-historiktråd till canonical source.", error);
        });
      }
      if (reloadBootstrap) {
        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
        }).catch((error) => {
          console.warn("CCO workspace bootstrap misslyckades för vald offline-historiktråd.", error);
        });
      }
    }

    function setActiveRuntimeLane(laneId) {
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
      renderRuntimeConversationShell();
      captureRuntimeReentrySnapshot("runtime_thread_selected");
      const selectedCard = Array.from(
        queueHistoryList?.querySelectorAll("[data-runtime-thread]") || []
      ).find((card) => card.dataset.runtimeThread === threadId);
      if (selectedCard) {
        selectedCard.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
      requestRuntimeThreadHydration(threadId).catch((error) => {
        console.warn("CCO kunde inte hydrera vald live-tråd efter selection.", error);
      });
      if (reloadBootstrap) {
        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
        }).catch((error) => {
          console.warn("CCO workspace bootstrap misslyckades för vald tråd.", error);
        });
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
        card.hasAttribute("data-history-conversation") &&
        !card.hasAttribute("data-runtime-thread");
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
      const normalizedLaneId = normalizeKey(laneId || "all") || "all";
      const wasSameInlinePanel =
        state.runtime.queueInlinePanel.open &&
        normalizeKey(state.runtime.queueInlinePanel.feedKey || "") === "" &&
        normalizeKey(state.runtime.queueInlinePanel.laneId || state.runtime.activeLaneId || "all") ===
          normalizedLaneId;
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
      if (
        !state.runtime.queueHistory.open
      ) {
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

    async function loadLiveRuntime(options = {}) {
      clearRuntimeLiveRefreshTimer();
      const deferInitialRender = options.deferInitialRender === true;
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
      const preserveStableWorkspace = shouldPreserveStableRuntimeWorkspace(runtimeMailboxIds);
      const shouldHonorReentryRestore =
        preserveStableWorkspace !== true &&
        state.runtime.loaded !== true &&
        state.runtime.live !== true;
      const preferredThreadId = asText(options.preferredThreadId);
      const runtimeRequestSequence = ++liveRuntimeRequestSequence;
      const isCurrentRequest = () => runtimeRequestSequence === liveRuntimeRequestSequence;
      state.runtime.startupLocked = !preserveStableWorkspace;
      state.runtime.loading = true;
      state.runtime.truthPrimaryLegacyThreads = [];
      state.runtime.liveHydratedThreadIds = [];
      clearRuntimeAuthRecoveryTimer();
      resetRuntimeOpenFlowDiagnostics({
        requestSequence: runtimeRequestSequence,
        reason: "live_runtime_load",
      });
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
      if (!deferInitialRender || preserveStableWorkspace) {
        renderRuntimeConversationShell();
      }

      try {
        const adminToken = await waitForRuntimeAuthToken();
        if (!isCurrentRequest()) return;
        if (!adminToken) {
          state.runtime.loading = false;
          state.runtime.loaded = false;
          state.runtime.startupLocked = false;
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "auth_required",
            requestedMailboxIds: runtimeMailboxIds,
            error:
              "Logga in igen i admin för att läsa livekö, historikfallback och mailboxstatus.",
          });
          if (hasMeaningfulRuntimeReentryState()) {
            captureRuntimeReentrySnapshot("auth_required");
          }
          setRuntimeModeState("auth_required", {
            authRequired: true,
            error:
              "Logga in igen i admin för att läsa livekö, historikfallback och mailboxstatus.",
          });
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: runtimeMailboxIds,
          });
          clearRuntimeLiveRefreshTimer();
          renderRuntimeConversationShell();
          return;
        }

        const status = await apiRequest("/api/v1/cco/runtime/status");
        if (!isCurrentRequest()) return;
        applyRuntimeGraphStatus(status?.graph || {});
        if (status?.graph?.readEnabled !== true) {
          clearRuntimeLiveRefreshTimer();
          await loadOfflineHistoryRuntime({
            runtimeMailboxIds,
            preferredThreadId,
            resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
            offlineMessage:
              "Livekön är offline. Visar senaste historiken för valt mailboxscope.",
            isCurrentRequest,
          });
          return;
        }

        const analysisPayload = await apiRequest("/api/v1/capabilities/AnalyzeInbox/run", {
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
        });
        if (!isCurrentRequest()) return;

        const liveData =
          analysisPayload?.output && typeof analysisPayload.output === "object"
            ? analysisPayload.output.data
            : null;
        if (!liveData || typeof liveData !== "object") {
          throw new Error("AnalyzeInbox returnerade ingen live-data.");
        }

        const configuredTruthPrimaryMailboxIds =
          typeof getTruthPrimaryWorklistMailboxIds === "function"
            ? getTruthPrimaryWorklistMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];
        let activeTruthPrimaryMailboxIds = [];
        let truthPrimaryFallbackReason = "";
        let truthPrimaryPayload = null;
        const configuredFocusTruthMailboxIds =
          typeof getTruthPrimaryFocusMailboxIds === "function"
            ? getTruthPrimaryFocusMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];
        const configuredStudioTruthMailboxIds =
          typeof getTruthPrimaryStudioMailboxIds === "function"
            ? getTruthPrimaryStudioMailboxIds({ mailboxIds: runtimeMailboxIds })
            : [];

        if (
          configuredTruthPrimaryMailboxIds.length &&
          typeof buildTruthPrimaryWorklistConsumerHref === "function"
        ) {
          try {
            truthPrimaryPayload = await apiRequest(
              buildTruthPrimaryWorklistConsumerHref(configuredTruthPrimaryMailboxIds)
            );
            if (!isCurrentRequest()) return;
            activeTruthPrimaryMailboxIds = [...configuredTruthPrimaryMailboxIds];
          } catch (truthPrimaryError) {
            truthPrimaryFallbackReason =
              truthPrimaryError instanceof Error
                ? truthPrimaryError.message
                : String(truthPrimaryError);
            console.warn(
              "CCO kunde inte läsa truth-primary worklist för wave 1. Faller tillbaka till legacy.",
              truthPrimaryError
            );
          }
        }

        const legacyThreads = carryRuntimeCustomerIdentity(
          buildLiveThreads(liveData, {
            historyMessages: [],
            historyEvents: [],
          })
        );
        const mergedWorklistData =
          typeof mergeTruthPrimaryWorklistData === "function"
            ? mergeTruthPrimaryWorklistData(liveData, truthPrimaryPayload, {
                truthPrimaryMailboxIds: activeTruthPrimaryMailboxIds,
              })
            : liveData;
        const threads = carryRuntimeCustomerIdentity(
          buildLiveThreads(mergedWorklistData, {
            historyMessages: [],
            historyEvents: [],
          })
        );
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
            : "Truth-driven focus är avstängd för wave 1. Fokusytan läser legacy-tråden medan worklisten fortsatt kan vara truth-primary.";
        const studioTruthFallbackReason = !activeStudioTruthMailboxIds.length
          ? truthPrimaryFallbackReason
          : studioTruthEnabled
            ? ""
            : "Truth-driven studio är avstängd för wave 1. Studion läser och skriver via legacy-kedjan medan worklist och fokus kan vara truth-driven.";
        const metadata = analysisPayload?.output?.metadata || {};
        recordRuntimeThreadAssignment("live_load", {
          stage: "before_apply",
          selectedThreadId: preferredThreadId,
          threadCount: threads.length,
          legacyThreadCount: legacyThreads.length,
        });
        state.runtime.truthPrimaryLegacyThreads = legacyThreads;
        state.runtime.threads = threads;
        recordRuntimeThreadAssignment("live_load", {
          stage: "after_apply",
          selectedThreadId: preferredThreadId,
          threadCount: threads.length,
          legacyThreadCount: legacyThreads.length,
        });
        state.runtime.mailboxes = buildMailboxCatalog(
          threads.map((thread) => ({
            mailboxId: thread.mailboxAddress,
            mailboxAddress: thread.mailboxAddress,
            userPrincipalName: thread.mailboxAddress,
          })),
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
        debugRuntimePipeline("AFTER LIVE LOAD (before restore)");
        debugReentrySnapshot("BEFORE RESTORE");
        if (!isCurrentRequest()) return;
        state.runtime.loading = false;
        state.runtime.loaded = true;
        state.runtime.startupLocked = false;
        setRuntimeModeState("live", {
          live: true,
          offline: false,
          authRequired: false,
          error: "",
        });
        state.runtime.lastSyncAt = new Date().toISOString();
        const reentryOutcome = restoreRuntimeReentrySnapshot("live_runtime_load", {
          preferInitialSnapshot: true,
          scopeMode: "hint_only",
        });
        const restoredReentrySnapshot = shouldHonorReentryRestore
          ? reentryOutcome?.savedSnapshot || reentryOutcome?.restoredSnapshot || null
          : null;
        const restoredFocusSection = asText(restoredReentrySnapshot?.activeFocusSection);
        const restoredSelectedThreadId = asText(restoredReentrySnapshot?.selectedThreadId);
        const restoredLeftColumnMode = normalizeKey(restoredReentrySnapshot?.leftColumnMode || "");
        const restoredHistoryConversationId = asText(
          restoredReentrySnapshot?.queueHistory?.selectedConversationId ||
            restoredSelectedThreadId
        );
        const restoredHistoryScopeKey = asText(restoredReentrySnapshot?.queueHistory?.scopeKey);
        debugReentrySnapshot("AFTER RESTORE");
        debugRuntimePipeline("AFTER RESTORE");
        await finalizeRuntimeLoad({
          preferredThreadId,
          resetHistoryOnChange: Boolean(options.resetHistoryOnChange),
          restoredFocusSection,
          restoredSelectedThreadId,
        });
        debugRuntimePipeline("AFTER FINALIZE");
        if (!isCurrentRequest()) return;
        scheduleRuntimeThinHistoryRefresh({
          runtimeMailboxIds,
          liveData,
          mergedWorklistData,
          metadata,
          requestedMailboxIds: runtimeMailboxIds,
          configuredTruthPrimaryMailboxIds,
          activeTruthPrimaryMailboxIds,
          truthPrimaryPayload,
          isCurrentRequest,
        });
        scheduleRuntimeHistoryCoverageWarmup(runtimeMailboxIds, {
          isCurrentRequest,
        });
        await requestRuntimeThreadHydration(preferredThreadId, {
          mailboxIds: runtimeMailboxIds,
        });
        if (!isCurrentRequest()) return;
        if (shouldHonorReentryRestore) {
          await restoreRuntimeHistorySurfaceIfNeeded({
            restoredLeftColumnMode,
            restoredSelectedConversationId: restoredHistoryConversationId,
            restoredScopeKey: restoredHistoryScopeKey,
          });
          restoreRuntimeFocusSectionIfNeeded({
            restoredFocusSection,
            restoredSelectedThreadId,
            preferredThreadId,
          });
        }
        scheduleRuntimeLiveRefresh({
          requestedMailboxIds: runtimeMailboxIds,
          preferredThreadId,
        });
        captureRuntimeReentrySnapshot("live_runtime_loaded");
      } catch (error) {
        if (!isCurrentRequest()) return;
        const message = error instanceof Error ? error.message : String(error);
        const statusCode = Number(error?.statusCode || error?.status || 0);
        state.runtime.loading = false;
        state.runtime.loaded = false;
        state.runtime.startupLocked = false;
        state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
          phase: isAuthFailure(statusCode, message) ? "auth_required" : "runtime_error",
          requestedMailboxIds: runtimeMailboxIds,
          error: message,
        });
        setRuntimeModeState(
          isAuthFailure(statusCode, message) ? "auth_required" : "runtime_error",
          {
            error: message,
            live: false,
            offline: normalizeKey(message).includes("offline"),
            authRequired: isAuthFailure(statusCode, message),
          }
        );
        clearRuntimeLiveRefreshTimer();
        if (isAuthFailure(statusCode, message)) {
          if (hasMeaningfulRuntimeReentryState()) {
            captureRuntimeReentrySnapshot("auth_failure");
          }
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: runtimeMailboxIds,
          });
        }
        renderRuntimeConversationShell();
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
          runtimeActionEngine.openRuntimeNote().catch(() => {});
        });
      });

      noteCloseButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setNoteOpen(false);
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
            nextMailboxId || "vald mailbox"
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
              `Truth-driven studio låser källmailbox och signatur till ${asText(
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
              `Truth-driven studio låser signaturen till ${asText(
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
          scheduleRuntimeMailboxScopeSelectionCommit();
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
          renderRuntimeConversationShell();
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
        button.addEventListener("click", jumpToInlinePanel);
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
          const selectedRuntimeThreadId = asText(
            selectedRuntimeThread?.id || previousThreadId
          );
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
              console.warn("CCO workspace bootstrap misslyckades efter att historikpanelen stängdes.", error);
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
            (mailbox, index) =>
              normalizeCustomMailboxDefinition(mailbox, index)?.id !== mailboxId
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
            removingLocalSignatureOnly ? "Den lokala signaturen togs bort." : "Mailboxen togs bort."
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
        const runtimeStudioThreadId = asText(
          runtimeStudioOpenButton.dataset.runtimeStudioThreadId
        );
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
        runtimeActionEngine.openRuntimeNote().catch((error) => {
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
        windowObject.location.assign(buildReauthUrl());
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
            console.warn(
              warningByAction[action] || "Runtime-snabbaction misslyckades.",
              error
            );
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
          const mailboxScopedTarget = getMailboxScopedRuntimeThreads().find(
            (thread) => runtimeConversationIdsMatch(thread.id, conversationId)
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

      if (canvas.classList.contains("is-studio-open")) {
        setStudioOpen(false);
        setContextCollapsed(false);
        return true;
      }

      return false;
    }

    function initializeWorkspaceSurface() {
      state.runtime.startupLocked = true;
      state.runtime.loading = true;
      state.runtime.loaded = false;
      state.runtime.live = false;
      state.runtime.authRequired = false;
      state.runtime.error = "";
      state.runtime.selectedThreadId = "";
      state.runtime.historyContextThreadId = "";
      state.runtime.threads = [];
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

      if (!hasRuntimeAdminToken()) {
        state.runtime.startupLocked = false;
        state.runtime.loading = false;
        state.runtime.loaded = false;
        state.runtime.live = false;
        state.runtime.authRequired = true;
        state.runtime.error =
          "Logga in i admin för att läsa livekö, historikfallback och mailboxstatus.";
        state.runtime.threads = [];
        state.runtime.truthPrimaryLegacyThreads = [];
        state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
          phase: "auth_required",
          requestedMailboxIds: getRequestedRuntimeMailboxIds(),
          error: state.runtime.error,
        });
        renderRuntimeConversationShell();
        scheduleRuntimeAuthRecovery({
          requestedMailboxIds: getRequestedRuntimeMailboxIds(),
        });
        return;
      }

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
      renderRuntimeConversationShell();

      windowObject.setTimeout(async () => {
        const adminToken = normalizeText(getAdminToken?.() || "");
        if (!adminToken) {
          state.runtime.startupLocked = false;
          state.runtime.loading = false;
          state.runtime.loaded = false;
          state.runtime.live = false;
          state.runtime.authRequired = true;
          state.runtime.error =
            "Logga in i admin för att läsa livekö, historikfallback och mailboxstatus.";
          state.runtime.threads = [];
          state.runtime.truthPrimaryLegacyThreads = [];
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "auth_required",
            requestedMailboxIds: getRequestedRuntimeMailboxIds(),
            error: state.runtime.error,
          });
          renderRuntimeConversationShell();
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: getRequestedRuntimeMailboxIds(),
          });
          return;
        }

        const tokenState = await verifyRuntimeAdminToken(adminToken);
        if (!tokenState.ok && tokenState.definitive) {
          clearRuntimeStoredAdminToken();
          state.runtime.startupLocked = false;
          state.runtime.loading = false;
          state.runtime.loaded = false;
          state.runtime.live = false;
          state.runtime.authRequired = true;
          state.runtime.error =
            "Admin-sessionen har gått ut. Logga in igen för att läsa livekö och mailboxstatus.";
          state.runtime.threads = [];
          state.runtime.truthPrimaryLegacyThreads = [];
          state.runtime.mailboxDiagnostics = buildRuntimeMailboxLoadDiagnostics({
            phase: "auth_required",
            requestedMailboxIds: getRequestedRuntimeMailboxIds(),
            error: state.runtime.error,
          });
          renderRuntimeConversationShell();
          scheduleRuntimeAuthRecovery({
            requestedMailboxIds: getRequestedRuntimeMailboxIds(),
          });
          return;
        }

        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: true,
          quiet: true,
        }).catch((error) => {
          console.warn("CCO workspace bootstrap misslyckades.", error);
        });

        loadLiveRuntime({ deferInitialRender: true }).catch((error) => {
          console.warn("CCO live runtime misslyckades.", error);
        });
      }, 0);
    }

    return Object.freeze({
      bindWorkspaceInteractions,
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
