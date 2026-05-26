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
        requestedView === "calendar" ||
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
            // Fas 42 (2026-05-20): filtrera bort "*"-wildcard och andra
            // icke-email-entries. En "*"-mailbox i urvalet får live-fetchen
            // att begära en katalog-katalog-mailbox som inte finns → hänger
            // och fryser render-pipen. Bara riktiga email-adresser tillåts.
            .filter((id) => Boolean(id) && id !== "*" && id.indexOf("@") !== -1)
        )
      );
    }

    // Fas 27C (2026-05-18): localStorage-persistens flyttad in i workspace
    // SoT. Tidigare ägdes detta av cco-shims.js som simulerade cb.click()
    // för att applicera persisted state → orsakade auto-popup-buggar.
    // Nu skriver setSelectedMailboxIds() direkt till localStorage och
    // loadPersistedMailboxIds() läses vid init (ensureWorkspaceState).
    const LS_MAILBOX_KEY = "cco.selectedMailboxIds.v1";

    function loadPersistedMailboxIds() {
      try {
        const raw = localStorage.getItem(LS_MAILBOX_KEY);
        if (!raw) return null;
        const arr = JSON.parse(raw);
        return Array.isArray(arr) && arr.length > 0
          ? normalizeMailboxIds(arr)
          : null;
      } catch (_e) {
        return null;
      }
    }

    function persistMailboxIds(mailboxIds) {
      try {
        const safe = Array.isArray(mailboxIds) ? mailboxIds : [];
        localStorage.setItem(LS_MAILBOX_KEY, JSON.stringify(safe));
      } catch (_e) {
        /* localStorage blockerad i privat-läge — tyst fallback. */
      }
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
        selectedMailboxIds: (() => {
          // Fas 27C: fallback-kedja för att hämta persisted state:
          // 1. current.selectedMailboxIds (om något redan satt i workspace)
          // 2. state.runtime.selectedMailboxIds (från app.js init)
          // 3. localStorage cco.selectedMailboxIds.v1 (vår nya persistens)
          // 4. tom array
          const fromCurrent = normalizeMailboxIds(current.selectedMailboxIds);
          if (fromCurrent.length) return fromCurrent;
          const fromState = normalizeMailboxIds(state.runtime.selectedMailboxIds);
          if (fromState.length) return fromState;
          return loadPersistedMailboxIds() || [];
        })(),
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
      // Fas 35 (2026-05-19): ta bort autoselect av första tråden.
      // Tidigare hamnade CCO ALLTID i första-tråden-state vid bootstrap
      // (Anna Karlsson + Akut ombokning), vilket triggade journey-
      // recommendations + showcase-fixture-data — fel state om
      // användaren inte aktivt valt tråden.
      // Nu: ingen tråd vald = tom focus-pane med "Välj en aktiv tråd…".
      workspace.selectedThreadId = selected ? asText(selected.id) : "";
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
      // Fas 27C: auto-persistens vid varje set. Tidigare var detta ansvar
      // av en shim som simulerade cb.click() → render-loopar. Nu skrivs
      // direkt till localStorage utan UI-side-effects.
      persistMailboxIds(workspace.selectedMailboxIds);
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
