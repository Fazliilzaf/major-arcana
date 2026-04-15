(() => {
  function createRuntimeActionEngine({
    applyFocusSection,
    applyStudioMode,
    buildIntelReadoutHref,
    buildReauthUrl,
    getSelectedRuntimeThread,
    isOfflineHistoryContextThread,
    handleRuntimeDeleteAction,
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
    windowObject = window,
  }) {
    function loadOverlayBootstrap() {
      return Promise.resolve(
        loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
        })
      ).catch(() => {});
    }

    function openRuntimeStudio(mode = "reply", preferredThreadId = "", options = {}) {
      const normalizedMode = String(mode || "").trim().toLowerCase() || "reply";
      const selectedThread = getSelectedRuntimeThread();
      const readOnly =
        normalizedMode !== "compose" &&
        (options?.readOnly === true ||
          (typeof isOfflineHistoryContextThread === "function" &&
            isOfflineHistoryContextThread(selectedThread)));
      if (normalizedMode === "compose" && typeof prepareComposeStudioState === "function") {
        prepareComposeStudioState();
        setAppView("conversations");
        state.studio.readOnly = false;
      } else {
        const lockedThreadId = String(preferredThreadId || selectedThread?.id || "").trim();
        state.studio.mode = normalizedMode;
        state.studio.threadId = lockedThreadId;
        state.studio.replyContextThreadId = lockedThreadId;
        state.studio.readOnly = readOnly;
      }
      applyStudioMode(mode);
      applyFocusSection("conversation");
      setStudioOpen(true);
      setContextCollapsed(false);
    }

    function openRuntimeNote() {
      const selectedThread = getSelectedRuntimeThread();
      if (
        typeof isOfflineHistoryContextThread === "function" &&
        isOfflineHistoryContextThread(selectedThread)
      ) {
        setFeedback(
          noteFeedback,
          "error",
          "Offline historik är läsläge. Öppna live-tråden för att skapa anteckningar."
        );
        return Promise.resolve(false);
      }
      return loadOverlayBootstrap().finally(() => {
        setFeedback(noteFeedback, "", "");
        setNoteModeOpen(true);
      });
    }

    function openRuntimeSchedule({ renderDraft = false } = {}) {
      const selectedThread = getSelectedRuntimeThread();
      if (
        typeof isOfflineHistoryContextThread === "function" &&
        isOfflineHistoryContextThread(selectedThread)
      ) {
        setFeedback(
          scheduleFeedback,
          "error",
          "Offline historik är läsläge. Öppna live-tråden för att schemalägga uppföljning."
        );
        return Promise.resolve(false);
      }
      return loadOverlayBootstrap().finally(() => {
        setFeedback(scheduleFeedback, "", "");
        if (renderDraft) {
          renderScheduleDraft();
        }
        setScheduleOpen(true);
      });
    }

    function openReadout(target) {
      const selectedThread = getSelectedRuntimeThread();
      if (state.runtime.authRequired && !selectedThread) {
        windowObject.open(buildReauthUrl("session_expired"), "_blank", "noopener");
        return Promise.resolve(true);
      }
      windowObject.open(buildIntelReadoutHref(target, selectedThread), "_blank", "noopener");
      return Promise.resolve(true);
    }

    function handleQuickAction(button) {
      if (!button) return false;

      const action = button.dataset.quickAction;
      if (!action) return false;

      if (action === "studio") {
        openRuntimeStudio(button.dataset.quickMode || "reply");
        return Promise.resolve(true);
      }

      if (action === "customer_history") {
        applyFocusSection("customer");
        return Promise.resolve(true);
      }

      if (action === "history") {
        applyFocusSection("history");
        return Promise.resolve(true);
      }

      if (action === "delete") {
        const isQueueDeleteContext = Boolean(
          button.closest(".queue-action-row") || button.closest(".queue-scope-strip")
        );
        return Promise.resolve(
          handleRuntimeDeleteAction(
            isQueueDeleteContext
              ? "major-arcana-queue-delete"
              : "major-arcana-focus-delete"
          )
        ).then(() => true);
      }

      if (action === "handled") {
        return Promise.resolve(handleRuntimeHandledAction()).then(() => true);
      }

      if (action === "later_feed") {
        setAppView("later");
        setAuxStatus(
          laterStatus,
          "Snoozade konversationer öppnades från arbetskön.",
          "success"
        );
        return Promise.resolve(true);
      }

      if (action === "sent_feed") {
        setAppView("sent");
        setAuxStatus(
          sentStatus,
          "Skickade meddelanden öppnades från arbetskön.",
          "success"
        );
        return Promise.resolve(true);
      }

      if (action === "later") {
        openLaterDialog();
        return Promise.resolve(true);
      }

      if (action === "schedule") {
        return openRuntimeSchedule().then(() => true);
      }

      if (action === "readout") {
        return openReadout(button.dataset.quickTarget).then(() => true);
      }

      return false;
    }

    return Object.freeze({
      openRuntimeNote,
      openRuntimeSchedule,
      openRuntimeStudio,
      handleQuickAction,
    });
  }

  window.MajorArcanaPreviewActionEngine = Object.freeze({
    createRuntimeActionEngine,
  });
})();
