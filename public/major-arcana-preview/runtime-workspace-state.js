(() => {
  function createWorkspaceStateApi({
    AUX_VIEWS,
    QUEUE_LANE_ORDER,
    asArray,
    asText,
    canonicalizeMailboxId,
    normalizeKey,
    normalizeMailboxId,
    state,
  }) {
    function normalizeView(view) {
      const requestedView = normalizeKey(view);
      return requestedView === "customers" ||
        requestedView === "automation" ||
        requestedView === "templates" ||
        requestedView === "workflows" ||
        requestedView === "analytics" ||
        AUX_VIEWS.has(requestedView)
        ? requestedView
        : "conversations";
    }

    function normalizeLaneId(laneId) {
      const normalizedLane = normalizeKey(laneId || "all") || "all";
      return normalizedLane === "all" || QUEUE_LANE_ORDER.includes(normalizedLane)
        ? normalizedLane
        : "all";
    }

    function normalizeMailboxIds(mailboxIds) {
      return Array.from(
        new Set(
          asArray(mailboxIds)
            .map((mailboxId) =>
              typeof canonicalizeMailboxId === "function"
                ? canonicalizeMailboxId(mailboxId)
                : normalizeMailboxId(mailboxId)
            )
            .filter(Boolean)
        )
      );
    }

    function ensureWorkspaceState() {
      const current = state.workspace && typeof state.workspace === "object" ? state.workspace : {};
      const currentOverlays =
        current.overlays && typeof current.overlays === "object" ? current.overlays : {};

      const next = {
        appView: normalizeView(current.appView || state.view || "conversations"),
        focusSection:
          normalizeKey(
            current.focusSection || state.runtime.activeFocusSection || "conversation"
          ) || "conversation",
        selectedThreadId: asText(current.selectedThreadId || state.runtime.selectedThreadId),
        activeLaneId: normalizeLaneId(current.activeLaneId || state.runtime.activeLaneId || "all"),
        selectedMailboxIds: normalizeMailboxIds(
          current.selectedMailboxIds || state.runtime.selectedMailboxIds
        ),
        selectedOwnerKey:
          normalizeKey(current.selectedOwnerKey || state.runtime.selectedOwnerKey || "all") ||
          "all",
        contextCollapsed: Boolean(current.contextCollapsed),
        historyExpanded:
          typeof current.historyExpanded === "boolean"
            ? current.historyExpanded
            : state.runtime.historyExpanded !== false,
        overlays: {
          studio: Boolean(currentOverlays.studio),
          note: Boolean(currentOverlays.note),
          noteMode:
            typeof currentOverlays.noteMode === "boolean"
              ? currentOverlays.noteMode
              : Boolean(state.noteMode?.open),
          schedule: Boolean(currentOverlays.schedule),
          focusContext: Boolean(currentOverlays.focusContext),
          booking: Boolean(currentOverlays.booking),
          later: Boolean(currentOverlays.later),
          mailboxAdmin:
            typeof currentOverlays.mailboxAdmin === "boolean"
              ? currentOverlays.mailboxAdmin
              : Boolean(state.mailboxAdminOpen),
          moreMenu:
            typeof currentOverlays.moreMenu === "boolean"
              ? currentOverlays.moreMenu
              : Boolean(state.moreMenuOpen),
        },
      };

      // Fas 4 perf-fix: memoize workspace-objektet via JSON-jämförelse.
      // Om data är identisk med nuvarande, behåll samma referens — Proxy:s
      // no-op-skip kommer då hoppa över hela mutationen.
      try {
        if (state.workspace && JSON.stringify(state.workspace) === JSON.stringify(next)) {
          // Inga ändringar — behåll samma referens, Proxy hoppar över.
          return state.workspace;
        }
      } catch (_e) {
        /* fallback to assign */
      }

      state.workspace = next;
      syncLegacyState();
      return state.workspace;
    }

    function syncLegacyState() {
      const workspace = ensureWorkspaceStateUnsafe();
      state.view = workspace.appView;
      state.runtime.activeFocusSection = workspace.focusSection;
      state.runtime.selectedThreadId = workspace.selectedThreadId;
      state.runtime.activeLaneId = workspace.activeLaneId;
      state.runtime.selectedMailboxIds = [...workspace.selectedMailboxIds];
      state.runtime.selectedOwnerKey = workspace.selectedOwnerKey;
      state.runtime.historyExpanded = Boolean(workspace.historyExpanded);
      state.moreMenuOpen = Boolean(workspace.overlays.moreMenu);
      state.mailboxAdminOpen = Boolean(workspace.overlays.mailboxAdmin);
      if (state.noteMode && typeof state.noteMode === "object") {
        state.noteMode.open = Boolean(workspace.overlays.noteMode);
      }
    }

    function ensureWorkspaceStateUnsafe() {
      return state.workspace;
    }

    function setView(view) {
      const workspace = ensureWorkspaceState();
      workspace.appView = normalizeView(view);
      syncLegacyState();
      return workspace.appView;
    }

    function getView() {
      return ensureWorkspaceState().appView;
    }

    function setFocusSection(section) {
      const workspace = ensureWorkspaceState();
      workspace.focusSection = normalizeKey(section) || "conversation";
      syncLegacyState();
      return workspace.focusSection;
    }

    function getFocusSection() {
      return ensureWorkspaceState().focusSection;
    }

    function setSelectedThreadId(threadId) {
      const workspace = ensureWorkspaceState();
      workspace.selectedThreadId = asText(threadId);
      syncLegacyState();
      return workspace.selectedThreadId;
    }

    function getSelectedThreadId() {
      return ensureWorkspaceState().selectedThreadId;
    }

    function ensureSelectedThread(visibleThreads = []) {
      const workspace = ensureWorkspaceState();
      const visible = asArray(visibleThreads);
      const selected = visible.find(
        (thread) => normalizeKey(thread?.id || "") === normalizeKey(workspace.selectedThreadId)
      );
      workspace.selectedThreadId = selected ? asText(selected.id) : asText(visible[0]?.id || "");
      syncLegacyState();
      return workspace.selectedThreadId;
    }

    function setActiveLaneId(laneId) {
      const workspace = ensureWorkspaceState();
      workspace.activeLaneId = normalizeLaneId(laneId);
      syncLegacyState();
      return workspace.activeLaneId;
    }

    function getActiveLaneId() {
      return ensureWorkspaceState().activeLaneId;
    }

    function setSelectedMailboxIds(mailboxIds) {
      const workspace = ensureWorkspaceState();
      workspace.selectedMailboxIds = normalizeMailboxIds(mailboxIds);
      syncLegacyState();
      return [...workspace.selectedMailboxIds];
    }

    function getSelectedMailboxIds() {
      return [...ensureWorkspaceState().selectedMailboxIds];
    }

    function setSelectedOwnerKey(ownerKey) {
      const workspace = ensureWorkspaceState();
      workspace.selectedOwnerKey = normalizeKey(ownerKey || "all") || "all";
      syncLegacyState();
      return workspace.selectedOwnerKey;
    }

    function getSelectedOwnerKey() {
      return ensureWorkspaceState().selectedOwnerKey;
    }

    function setHistoryExpanded(open) {
      const workspace = ensureWorkspaceState();
      workspace.historyExpanded = Boolean(open);
      syncLegacyState();
      return workspace.historyExpanded;
    }

    function toggleHistoryExpanded() {
      return setHistoryExpanded(!ensureWorkspaceState().historyExpanded);
    }

    function setContextCollapsed(collapsed) {
      const workspace = ensureWorkspaceState();
      workspace.contextCollapsed = Boolean(collapsed);
      syncLegacyState();
      return workspace.contextCollapsed;
    }

    function isContextCollapsed() {
      return Boolean(ensureWorkspaceState().contextCollapsed);
    }

    function setOverlayOpen(name, open) {
      const workspace = ensureWorkspaceState();
      if (!Object.prototype.hasOwnProperty.call(workspace.overlays, name)) {
        workspace.overlays[name] = false;
      }
      workspace.overlays[name] = Boolean(open);
      syncLegacyState();
      return workspace.overlays[name];
    }

    function isOverlayOpen(name) {
      return Boolean(ensureWorkspaceState().overlays[name]);
    }

    function getState() {
      return state;
    }

    ensureWorkspaceState();

    return Object.freeze({
      ensureWorkspaceState,
      ensureSelectedThread,
      getActiveLaneId,
      getFocusSection,
      getState,
      getSelectedMailboxIds,
      getSelectedOwnerKey,
      getSelectedThreadId,
      getView,
      isContextCollapsed,
      isOverlayOpen,
      setActiveLaneId,
      setContextCollapsed,
      setFocusSection,
      setHistoryExpanded,
      setOverlayOpen,
      setSelectedMailboxIds,
      setSelectedOwnerKey,
      setSelectedThreadId,
      setView,
      toggleHistoryExpanded,
    });
  }

  window.MajorArcanaPreviewWorkspaceState = Object.freeze({
    createWorkspaceStateApi,
  });
})();
