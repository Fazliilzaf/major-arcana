(() => {
  function createRuntimeReentryStateApi({
    asArray,
    asText,
    canonicalizeRuntimeMailboxId,
    getRuntimeLeftColumnState = () => ({ mode: "default" }),
    normalizeKey,
    normalizeMailboxId,
    state,
    workspaceSourceOfTruth,
    windowObject = window,
  }) {
    const STORAGE_KEY = "cco.runtimeReentryState.v1";
    const REENTRY_STATUS = Object.freeze({
      RESTORED_FROM_SAVED_STATE: "restored_from_saved_state",
      RESTORED_WITH_PARTIAL_FALLBACK: "restored_with_partial_fallback",
      FALLBACK_TO_DEFAULT: "fallback_to_default",
    });

    function cloneJson(value) {
      if (value === undefined || value === null) return null;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return null;
      }
    }

    function readSessionRecord() {
      try {
        const rawValue = windowObject.sessionStorage.getItem(STORAGE_KEY);
        if (!rawValue) return null;
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch (_error) {
        return null;
      }
    }

    function writeSessionRecord(record = null) {
      try {
        if (!record) {
          windowObject.sessionStorage.removeItem(STORAGE_KEY);
          return true;
        }
        windowObject.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        return true;
      } catch (_error) {
        return false;
      }
    }

    function normalizeMailboxScope(mailboxIds = []) {
      return Array.from(
        new Set(
          asArray(mailboxIds)
            .map((mailboxId) =>
              typeof canonicalizeRuntimeMailboxId === "function"
                ? canonicalizeRuntimeMailboxId(mailboxId)
                : normalizeMailboxId(mailboxId)
            )
            .filter(Boolean)
        )
      );
    }

    function getCurrentSnapshot() {
      const runtime = state.runtime && typeof state.runtime === "object" ? state.runtime : {};
      const leftColumnState =
        typeof getRuntimeLeftColumnState === "function" ? getRuntimeLeftColumnState() : {};
      const queueInlinePanel =
        runtime.queueInlinePanel && typeof runtime.queueInlinePanel === "object"
          ? runtime.queueInlinePanel
          : {};
      const queueHistory =
        runtime.queueHistory && typeof runtime.queueHistory === "object"
          ? runtime.queueHistory
          : {};
      return {
        version: 1,
        capturedAt: new Date().toISOString(),
        runtimeMode: normalizeKey(runtime.mode || ""),
        leftColumnMode: normalizeKey(leftColumnState.mode || "default") || "default",
        mailboxscope: normalizeMailboxScope(workspaceSourceOfTruth.getSelectedMailboxIds()),
        selectedThreadId: asText(workspaceSourceOfTruth.getSelectedThreadId()),
        selectedOwnerKey: normalizeKey(
          workspaceSourceOfTruth.getSelectedOwnerKey() || runtime.selectedOwnerKey || "all"
        ) || "all",
        activeLaneId: normalizeKey(
          workspaceSourceOfTruth.getActiveLaneId() || runtime.activeLaneId || "all"
        ) || "all",
        activeFocusSection: normalizeKey(runtime.activeFocusSection || "conversation") || "conversation",
        historyExpanded: runtime.historyExpanded !== false,
        historyContextThreadId: asText(runtime.historyContextThreadId),
        historySearch: asText(runtime.historySearch),
        historyMailboxFilter: normalizeKey(runtime.historyMailboxFilter || "all") || "all",
        historyResultTypeFilter: normalizeKey(runtime.historyResultTypeFilter || "all") || "all",
        historyRangeFilter: normalizeKey(runtime.historyRangeFilter || "all") || "all",
        queueInlinePanel: {
          open: queueInlinePanel.open === true,
          laneId: normalizeKey(queueInlinePanel.laneId || ""),
          feedKey: normalizeKey(queueInlinePanel.feedKey || ""),
        },
        queueHistory: {
          open: queueHistory.open === true,
          selectedConversationId: asText(queueHistory.selectedConversationId),
          scopeKey: asText(queueHistory.scopeKey),
        },
      };
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

    function debugReentrySnapshot(label = "reentry", snapshot = getRuntimeReentrySnapshot()) {
      if (!isPipelineDebugEnabled()) return null;
      const currentSnapshot = snapshot && typeof snapshot === "object" ? cloneJson(snapshot) : null;
      const currentOutcome = getRuntimeReentryOutcome();
      const payload = {
        mailboxscope: currentSnapshot?.mailboxscope,
        selectedOwnerKey: currentSnapshot?.selectedOwnerKey,
        activeLaneId: currentSnapshot?.activeLaneId,
        queueInlinePanel: currentSnapshot?.queueInlinePanel,
        queueHistory: currentSnapshot?.queueHistory,
        outcome: currentOutcome
          ? {
              status: currentOutcome.status,
              reason: currentOutcome.reason,
              exactMatch: currentOutcome.exactMatch,
              comparedFields: currentOutcome.comparedFields,
              matchedFields: currentOutcome.matchedFields,
              fallbackFields: currentOutcome.fallbackFields,
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

    function hasUserStateSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object") return false;
      const mailboxScope = normalizeMailboxScope(snapshot.mailboxscope);
      if (mailboxScope.length > 0) return true;
      if (asText(snapshot.selectedThreadId)) return true;
      if (normalizeKey(snapshot.selectedOwnerKey || "all") !== "all") return true;
      if (normalizeKey(snapshot.activeLaneId || "all") !== "all") return true;
      if (normalizeKey(snapshot.activeFocusSection || "conversation") !== "conversation") {
        return true;
      }
      if (snapshot.historyExpanded === false) return true;
      if (asText(snapshot.historyContextThreadId)) return true;
      if (asText(snapshot.historySearch)) return true;
      if (normalizeKey(snapshot.historyMailboxFilter || "all") !== "all") return true;
      if (normalizeKey(snapshot.historyResultTypeFilter || "all") !== "all") return true;
      if (normalizeKey(snapshot.historyRangeFilter || "all") !== "all") return true;
      if (
        snapshot.queueInlinePanel &&
        typeof snapshot.queueInlinePanel === "object" &&
        (snapshot.queueInlinePanel.open === true ||
          asText(snapshot.queueInlinePanel.laneId) ||
          asText(snapshot.queueInlinePanel.feedKey))
      ) {
        return true;
      }
      if (
        snapshot.queueHistory &&
        typeof snapshot.queueHistory === "object" &&
        (snapshot.queueHistory.open === true ||
          asText(snapshot.queueHistory.selectedConversationId) ||
          asText(snapshot.queueHistory.scopeKey))
      ) {
        return true;
      }
      return false;
    }

    function mergeRuntimeReentrySnapshots(previousSnapshot, nextSnapshot) {
      const previous = previousSnapshot && typeof previousSnapshot === "object" ? previousSnapshot : {};
      const next = nextSnapshot && typeof nextSnapshot === "object" ? nextSnapshot : {};
      const previousQueueInlinePanel =
        previous.queueInlinePanel && typeof previous.queueInlinePanel === "object"
          ? previous.queueInlinePanel
          : {};
      const nextQueueInlinePanel =
        next.queueInlinePanel && typeof next.queueInlinePanel === "object" ? next.queueInlinePanel : {};
      const previousQueueHistory =
        previous.queueHistory && typeof previous.queueHistory === "object" ? previous.queueHistory : {};
      const nextQueueHistory =
        next.queueHistory && typeof next.queueHistory === "object" ? next.queueHistory : {};
      const nextMailboxScope = normalizeMailboxScope(next.mailboxscope);
      const previousMailboxScope = normalizeMailboxScope(previous.mailboxscope);
      const nextLeftColumnMode = normalizeKey(next.leftColumnMode || "default") || "default";
      const previousLeftColumnMode =
        normalizeKey(previous.leftColumnMode || "default") || "default";
      const nextSelectedOwnerKey = normalizeKey(next.selectedOwnerKey || "all") || "all";
      const previousSelectedOwnerKey = normalizeKey(previous.selectedOwnerKey || "all") || "all";
      const nextActiveLaneId = normalizeKey(next.activeLaneId || "all") || "all";
      const previousActiveLaneId = normalizeKey(previous.activeLaneId || "all") || "all";
      const nextActiveFocusSection =
        normalizeKey(next.activeFocusSection || "conversation") || "conversation";
      const previousActiveFocusSection =
        normalizeKey(previous.activeFocusSection || "conversation") || "conversation";
      const nextHistoryMailboxFilter = normalizeKey(next.historyMailboxFilter || "all") || "all";
      const previousHistoryMailboxFilter =
        normalizeKey(previous.historyMailboxFilter || "all") || "all";
      const nextHistoryResultTypeFilter =
        normalizeKey(next.historyResultTypeFilter || "all") || "all";
      const previousHistoryResultTypeFilter =
        normalizeKey(previous.historyResultTypeFilter || "all") || "all";
      const nextHistoryRangeFilter = normalizeKey(next.historyRangeFilter || "all") || "all";
      const previousHistoryRangeFilter = normalizeKey(previous.historyRangeFilter || "all") || "all";
      const mergedLeftColumnMode =
        nextLeftColumnMode !== "default" ? nextLeftColumnMode : previousLeftColumnMode;
      const mergedSelectedThreadId = asText(next.selectedThreadId) || asText(previous.selectedThreadId);
      const mergedQueueHistoryOpen =
        mergedLeftColumnMode === "history"
          ? true
          : nextQueueHistory.open === true;
      const mergedQueueHistorySelectedConversationId =
        mergedLeftColumnMode === "history"
          ? asText(nextQueueHistory.selectedConversationId) ||
            mergedSelectedThreadId ||
            asText(previousQueueHistory.selectedConversationId)
          : asText(nextQueueHistory.selectedConversationId);
      const mergedQueueHistoryScopeKey =
        mergedLeftColumnMode === "history"
          ? asText(nextQueueHistory.scopeKey) || asText(previousQueueHistory.scopeKey)
          : asText(nextQueueHistory.scopeKey);

      return {
        ...previous,
        ...next,
        leftColumnMode: mergedLeftColumnMode,
        mailboxscope: nextMailboxScope.length ? nextMailboxScope : previousMailboxScope,
        selectedThreadId: mergedSelectedThreadId,
        selectedOwnerKey:
          nextSelectedOwnerKey !== "all" ? nextSelectedOwnerKey : previousSelectedOwnerKey,
        activeLaneId: nextActiveLaneId !== "all" ? nextActiveLaneId : previousActiveLaneId,
        activeFocusSection:
          nextActiveFocusSection !== "conversation"
            ? nextActiveFocusSection
            : previousActiveFocusSection,
        historyExpanded:
          next.historyExpanded === false || previous.historyExpanded === false
            ? false
            : true,
        historyContextThreadId:
          asText(next.historyContextThreadId) || asText(previous.historyContextThreadId),
        historySearch: asText(next.historySearch) || asText(previous.historySearch),
        historyMailboxFilter:
          nextHistoryMailboxFilter !== "all"
            ? nextHistoryMailboxFilter
            : previousHistoryMailboxFilter,
        historyResultTypeFilter:
          nextHistoryResultTypeFilter !== "all"
            ? nextHistoryResultTypeFilter
            : previousHistoryResultTypeFilter,
        historyRangeFilter:
          nextHistoryRangeFilter !== "all" ? nextHistoryRangeFilter : previousHistoryRangeFilter,
        queueInlinePanel: {
          ...previousQueueInlinePanel,
          ...nextQueueInlinePanel,
          open: nextQueueInlinePanel.open === true || previousQueueInlinePanel.open === true,
          laneId:
            normalizeKey(nextQueueInlinePanel.laneId || "") ||
            normalizeKey(previousQueueInlinePanel.laneId || ""),
          feedKey:
            normalizeKey(nextQueueInlinePanel.feedKey || "") ||
            normalizeKey(previousQueueInlinePanel.feedKey || ""),
        },
        queueHistory: {
          ...previousQueueHistory,
          ...nextQueueHistory,
          open: mergedQueueHistoryOpen,
          selectedConversationId: mergedQueueHistorySelectedConversationId,
          scopeKey: mergedQueueHistoryScopeKey,
        },
      };
    }

    function getRuntimeReentrySnapshot() {
      const record = readSessionRecord();
      if (!record) return null;
      if (record.snapshot && typeof record.snapshot === "object") {
        return cloneJson(record.snapshot);
      }
      if (record && typeof record === "object" && record.version) {
        const cloned = cloneJson(record);
        return cloned && typeof cloned === "object" ? cloned : null;
      }
      return null;
    }

    function getRuntimeReentryRecord() {
      const record = readSessionRecord();
      return record ? cloneJson(record) : null;
    }

    function getRuntimeReentryOutcome() {
      const reentry = state.runtime?.reentry;
      const outcome =
        reentry && typeof reentry.outcome === "object" ? reentry.outcome : null;
      return outcome ? cloneJson(outcome) : {
        status: REENTRY_STATUS.FALLBACK_TO_DEFAULT,
        restoredAt: "",
        reason: "init",
        exactMatch: false,
        comparedFields: [],
        matchedFields: [],
        fallbackFields: [],
      };
    }

    function setRuntimeReentryOutcome(outcome = {}) {
      if (!state.runtime || typeof state.runtime !== "object") return null;
      const normalizedOutcome = {
        status: normalizeKey(outcome.status) || REENTRY_STATUS.FALLBACK_TO_DEFAULT,
        restoredAt: asText(outcome.restoredAt),
        reason: normalizeKey(outcome.reason || ""),
        exactMatch: outcome.exactMatch === true,
        comparedFields: asArray(outcome.comparedFields).map((field) => asText(field)).filter(Boolean),
        matchedFields: asArray(outcome.matchedFields).map((field) => asText(field)).filter(Boolean),
        fallbackFields: asArray(outcome.fallbackFields).map((field) => asText(field)).filter(Boolean),
        savedSnapshot: outcome.savedSnapshot ? cloneJson(outcome.savedSnapshot) : null,
        restoredSnapshot: outcome.restoredSnapshot ? cloneJson(outcome.restoredSnapshot) : null,
      };
      state.runtime.reentry = {
        ...(state.runtime.reentry && typeof state.runtime.reentry === "object"
          ? state.runtime.reentry
          : {}),
        outcome: normalizedOutcome,
      };
      return normalizedOutcome;
    }

    function captureRuntimeReentrySnapshot({ reason = "state_change" } = {}) {
      const snapshot = getCurrentSnapshot();
      const currentRecord = readSessionRecord();
      const currentSnapshot =
        currentRecord && currentRecord.snapshot && typeof currentRecord.snapshot === "object"
          ? currentRecord.snapshot
          : null;
      const normalizedReason = normalizeKey(reason || "state_change");
      const preservePreviousReasons = new Set([
        "live_runtime_load",
        "live_runtime_loaded",
        "auth_failure",
        "auth_required",
        "offline_history_load",
        "offline_history_loaded",
        "focus_section_change",
        "runtime_thread_selected",
      ]);
      if (
        currentSnapshot &&
        hasUserStateSnapshot(currentSnapshot) &&
        preservePreviousReasons.has(normalizedReason)
      ) {
        const mergedSnapshot = mergeRuntimeReentrySnapshots(currentSnapshot, snapshot);
        const mergedRecord = {
          version: mergedSnapshot.version,
          capturedAt: mergedSnapshot.capturedAt,
          reason: normalizedReason,
          snapshot: mergedSnapshot,
        };
        writeSessionRecord(mergedRecord);
        if (state.runtime && typeof state.runtime === "object") {
          state.runtime.reentry = {
            ...(state.runtime.reentry && typeof state.runtime.reentry === "object"
              ? state.runtime.reentry
              : {}),
            snapshot: cloneJson(mergedSnapshot),
            capturedAt: asText(mergedSnapshot.capturedAt),
            reason: normalizedReason,
          };
        }
        return cloneJson(mergedSnapshot);
      }
      writeSessionRecord({
        version: snapshot.version,
        capturedAt: snapshot.capturedAt,
        reason: normalizedReason,
        snapshot,
      });
      if (state.runtime && typeof state.runtime === "object") {
        state.runtime.reentry = {
          ...(state.runtime.reentry && typeof state.runtime.reentry === "object"
            ? state.runtime.reentry
            : {}),
          snapshot: cloneJson(snapshot),
          capturedAt: snapshot.capturedAt,
          reason: normalizedReason,
        };
      }
      return snapshot;
    }

    function compareSnapshotFields(savedSnapshot = null, restoredSnapshot = null) {
      const saved = savedSnapshot && typeof savedSnapshot === "object" ? savedSnapshot : null;
      const restored =
        restoredSnapshot && typeof restoredSnapshot === "object" ? restoredSnapshot : null;
      if (!saved || !restored) {
        return {
          status: REENTRY_STATUS.FALLBACK_TO_DEFAULT,
          exactMatch: false,
          comparedFields: [],
          matchedFields: [],
          fallbackFields: [],
        };
      }

      const compare = [
        ["runtimeMode", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["leftColumnMode", (left, right) => normalizeKey(left) === normalizeKey(right)],
        [
          "mailboxscope",
          (left, right) => {
            const leftValues = normalizeMailboxScope(left);
            const rightValues = normalizeMailboxScope(right);
            return (
              leftValues.length === rightValues.length &&
              leftValues.every((value, index) => value === rightValues[index])
            );
          },
        ],
        ["selectedThreadId", (left, right) => asText(left) === asText(right)],
        ["selectedOwnerKey", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["activeLaneId", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["activeFocusSection", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["historyExpanded", (left, right) => Boolean(left) === Boolean(right)],
        ["historyContextThreadId", (left, right) => asText(left) === asText(right)],
        ["historySearch", (left, right) => asText(left) === asText(right)],
        ["historyMailboxFilter", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["historyResultTypeFilter", (left, right) => normalizeKey(left) === normalizeKey(right)],
        ["historyRangeFilter", (left, right) => normalizeKey(left) === normalizeKey(right)],
        [
          "queueInlinePanel.open",
          (left, right) => Boolean(left?.open) === Boolean(right?.open),
        ],
        [
          "queueInlinePanel.laneId",
          (left, right) => normalizeKey(left?.laneId) === normalizeKey(right?.laneId),
        ],
        [
          "queueInlinePanel.feedKey",
          (left, right) => normalizeKey(left?.feedKey) === normalizeKey(right?.feedKey),
        ],
        ["queueHistory.open", (left, right) => Boolean(left?.open) === Boolean(right?.open)],
        [
          "queueHistory.selectedConversationId",
          (left, right) => asText(left?.selectedConversationId) === asText(right?.selectedConversationId),
        ],
        [
          "queueHistory.scopeKey",
          (left, right) => asText(left?.scopeKey) === asText(right?.scopeKey),
        ],
      ];

      const comparedFields = [];
      const matchedFields = [];
      const fallbackFields = [];

      compare.forEach(([field, comparator]) => {
        comparedFields.push(field);
        const fieldPath = field.split(".");
        const readField = (snapshot) =>
          fieldPath.reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), snapshot);
        const matched = Boolean(comparator(readField(saved), readField(restored)));
        if (matched) {
          matchedFields.push(field);
        } else {
          fallbackFields.push(field);
        }
      });

      const exactMatch = fallbackFields.length === 0;
      return {
        status: exactMatch
          ? REENTRY_STATUS.RESTORED_FROM_SAVED_STATE
          : matchedFields.length > 0
            ? REENTRY_STATUS.RESTORED_WITH_PARTIAL_FALLBACK
            : REENTRY_STATUS.FALLBACK_TO_DEFAULT,
        exactMatch,
        comparedFields,
        matchedFields,
        fallbackFields,
      };
    }

    function applyRuntimeReentrySnapshot(
      snapshot,
      { reason = "restore", scopeMode = "authoritative" } = {}
    ) {
      const savedSnapshot = snapshot && typeof snapshot === "object" ? snapshot : null;
      if (!savedSnapshot) {
        const fallbackOutcome = {
          status: REENTRY_STATUS.FALLBACK_TO_DEFAULT,
          restoredAt: new Date().toISOString(),
          reason: normalizeKey(reason || "restore"),
          exactMatch: false,
          comparedFields: [],
          matchedFields: [],
          fallbackFields: [],
          savedSnapshot: null,
          restoredSnapshot: getCurrentSnapshot(),
        };
        setRuntimeReentryOutcome(fallbackOutcome);
        return fallbackOutcome;
      }

      const applyScope = scopeMode !== "hint_only";
      const applyPanelState = scopeMode !== "hint_only";
      const mailboxscope = normalizeMailboxScope(savedSnapshot.mailboxscope);
      if (applyScope && (mailboxscope.length || Array.isArray(savedSnapshot.mailboxscope))) {
        workspaceSourceOfTruth.setSelectedMailboxIds(mailboxscope);
      }
      if (asText(savedSnapshot.selectedThreadId)) {
        workspaceSourceOfTruth.setSelectedThreadId(asText(savedSnapshot.selectedThreadId));
      }
      if (applyScope && asText(savedSnapshot.selectedOwnerKey)) {
        workspaceSourceOfTruth.setSelectedOwnerKey(asText(savedSnapshot.selectedOwnerKey));
      }
      if (applyScope && asText(savedSnapshot.activeLaneId)) {
        workspaceSourceOfTruth.setActiveLaneId(asText(savedSnapshot.activeLaneId));
      }
      if (asText(savedSnapshot.activeFocusSection)) {
        workspaceSourceOfTruth.setFocusSection(asText(savedSnapshot.activeFocusSection));
      }
      if (typeof savedSnapshot.historyExpanded === "boolean") {
        workspaceSourceOfTruth.setHistoryExpanded(savedSnapshot.historyExpanded);
      }

      const runtime = state.runtime && typeof state.runtime === "object" ? state.runtime : null;
      if (runtime) {
        const savedLeftColumnMode =
          normalizeKey(savedSnapshot.leftColumnMode || "default") || "default";
        if (applyPanelState) {
          runtime.queueInlinePanel = {
            ...(runtime.queueInlinePanel && typeof runtime.queueInlinePanel === "object"
              ? runtime.queueInlinePanel
              : {}),
            open: savedSnapshot.queueInlinePanel?.open === true,
            laneId: normalizeKey(savedSnapshot.queueInlinePanel?.laneId || ""),
            feedKey: normalizeKey(savedSnapshot.queueInlinePanel?.feedKey || ""),
          };
          runtime.queueHistory = {
            ...(runtime.queueHistory && typeof runtime.queueHistory === "object"
              ? runtime.queueHistory
              : {}),
            open:
              savedLeftColumnMode === "history" || savedSnapshot.queueHistory?.open === true,
            selectedConversationId:
              savedLeftColumnMode === "history"
                ? asText(
                    savedSnapshot.queueHistory?.selectedConversationId ||
                      savedSnapshot.selectedThreadId
                  )
                : "",
            scopeKey:
              savedLeftColumnMode === "history"
                ? asText(savedSnapshot.queueHistory?.scopeKey)
                : "",
          };
        }
      }

      const restoredSnapshot = getCurrentSnapshot();
      const comparison = compareSnapshotFields(savedSnapshot, restoredSnapshot);
      const outcome = {
        status: comparison.status,
        restoredAt: new Date().toISOString(),
        reason: normalizeKey(reason || "restore"),
        scopeMode: normalizeKey(scopeMode || "authoritative"),
        exactMatch: comparison.exactMatch,
        comparedFields: comparison.comparedFields,
        matchedFields: comparison.matchedFields,
        fallbackFields: comparison.fallbackFields,
        savedSnapshot: cloneJson(savedSnapshot),
        restoredSnapshot: cloneJson(restoredSnapshot),
      };
      setRuntimeReentryOutcome(outcome);
      if (state.runtime && typeof state.runtime === "object") {
        state.runtime.reentry = {
          ...(state.runtime.reentry && typeof state.runtime.reentry === "object"
            ? state.runtime.reentry
            : {}),
          snapshot: cloneJson(savedSnapshot),
          capturedAt: asText(savedSnapshot.capturedAt),
          restoredAt: outcome.restoredAt,
          outcome: cloneJson(outcome),
        };
      }
      return outcome;
    }

    function restoreRuntimeReentrySnapshot({ reason = "restore", scopeMode = "authoritative" } = {}) {
      const snapshot = getRuntimeReentrySnapshot();
      if (!snapshot) {
        return applyRuntimeReentrySnapshot(null, { reason, scopeMode });
      }
      return applyRuntimeReentrySnapshot(snapshot, { reason, scopeMode });
    }

    return Object.freeze({
      applyRuntimeReentrySnapshot,
      captureRuntimeReentrySnapshot,
      compareSnapshotFields,
      debugReentrySnapshot,
      getRuntimeReentryOutcome,
      getRuntimeReentryRecord,
      getRuntimeReentrySnapshot,
      getCurrentSnapshot,
      restoreRuntimeReentrySnapshot,
      setRuntimeReentryOutcome,
      statuses: REENTRY_STATUS,
    });
  }

  window.MajorArcanaPreviewReentryState = Object.freeze({
    createRuntimeReentryStateApi,
  });
})();
