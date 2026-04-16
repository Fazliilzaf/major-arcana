(() => {
  function createAsyncOrchestration({
    dom = {},
    helpers = {},
    refs = {},
    state,
    windowObject = window,
  }) {
    const fetchImpl =
      typeof windowObject.fetch === "function" ? windowObject.fetch.bind(windowObject) : fetch;

    const {
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
      studioShell,
      studioDeleteButton,
      studioComposeSubjectInput,
      studioComposeToInput,
      studioEditorInput,
      studioSaveDraftButton,
      targetLabel,
    } = dom;

    const {
      apiRequest,
      asArray,
      asText,
      buildRuntimeScheduleDraft,
      buildRuntimeSummaryCards,
      createIdempotencyKey,
      createNoteDraft,
      createScheduleDraft,
      ensureRuntimeSelection,
      ensureStudioState,
      formatDueLabel,
      getActiveNoteDraft,
      getAdminToken,
      getRuntimeCustomerEmail,
      getRuntimeFocusReadState,
      getRuntimeMailboxCapability,
      getRuntimeStudioTruthState,
      getRuntimeThreadById,
      isOfflineHistoryContextThread,
      getSelectedRuntimeFocusThread,
      getSelectedRuntimeThread,
      getStudioSignatureProfile,
      getStudioSignatureOverride,
      getStudioSourceMailboxId,
      loadBootstrapFeedback,
      mapPriorityValue,
      mapVisibilityValue,
      normalizeKey,
      normalizeStudioBusyState,
      normalizeText,
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
      DEFAULT_WORKSPACE,
      normalizeWorkspaceState,
      applyReplyLaterToThread,
      applyHandledToThread,
    } = helpers;

    function renderActiveFocusHistorySection() {
      const focusThread =
        typeof getSelectedRuntimeFocusThread === "function"
          ? getSelectedRuntimeFocusThread()
          : getSelectedRuntimeThread();
      const focusReadState =
        typeof getRuntimeFocusReadState === "function"
          ? getRuntimeFocusReadState(focusThread)
          : {};
      renderFocusHistorySection(focusThread, focusReadState);
    }

    function parseComposeRecipients(value = "") {
      return String(value || "")
        .split(/[;,]/)
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
        .slice(0, 20);
    }

    function loadBootstrap({
      preserveActiveDestination = true,
      applyWorkspacePrefs = false,
      quiet = false,
      forceReload = false,
    } = {}) {
      if (forceReload) {
        refs.bootstrapPromise = null;
      }

      if (refs.bootstrapPromise) {
        return refs.bootstrapPromise;
      }

      if (!quiet) {
        loadBootstrapFeedback("loading");
      }

      refs.bootstrapPromise = Promise.all([
        apiRequest("/api/v1/cco-workspace/bootstrap"),
        apiRequest("/api/v1/cco-workspace/follow-ups").catch(() => ({ followUps: [] })),
      ])
        .then(([payload, followUpPayload]) => {
          state.bootstrapped = true;
          state.bootstrapError = "";

          state.noteTemplates = Array.isArray(payload.noteTemplates) ? payload.noteTemplates : [];
          state.noteTemplatesByKey = Object.fromEntries(
            state.noteTemplates.map((template) => [normalizeKey(template.key), template])
          );
          state.noteDefinitions = payload.noteDefinitions || {};
          state.noteVisibilityRules = payload.visibilityRules || {};
          state.activity.notes = Array.isArray(payload.savedNotes) ? payload.savedNotes : [];
          state.activity.followUps = Array.isArray(followUpPayload?.followUps)
            ? followUpPayload.followUps
            : [];
          state.schedule.options = payload.scheduleOptions || {
            doctors: [],
            categories: [],
            reminders: [],
          };
          state.schedule.draft = createScheduleDraft(payload.scheduleDraft);

          const nextDrafts = {};
          for (const [key, definition] of Object.entries(state.noteDefinitions)) {
            nextDrafts[key] = createNoteDraft(definition);
          }
          state.note.drafts = nextDrafts;

          const requestedActiveKey =
            preserveActiveDestination && state.noteDefinitions[state.note.activeKey]
              ? state.note.activeKey
              : Object.keys(state.noteDefinitions)[0] || "konversation";

          renderTemplateButtons();
          renderNoteDestination(requestedActiveKey);
          renderScheduleDraft();
          renderActiveFocusHistorySection();
          renderFocusNotesSection();

          if (applyWorkspacePrefs) {
            workspaceState.left =
              Number.parseInt(
                String(payload.workspacePrefs?.leftWidth ?? DEFAULT_WORKSPACE.left),
                10
              ) || DEFAULT_WORKSPACE.left;
            workspaceState.right =
              Number.parseInt(
                String(payload.workspacePrefs?.rightWidth ?? DEFAULT_WORKSPACE.right),
                10
              ) || DEFAULT_WORKSPACE.right;
            normalizeWorkspaceState();
            state.workspacePrefsApplied = true;
          }

          if (!quiet) {
            loadBootstrapFeedback("idle");
          }

          return payload;
        })
        .catch((error) => {
          state.bootstrapError = error.message;
          loadBootstrapFeedback("error", error.message);
          throw error;
        })
        .finally(() => {
          refs.bootstrapPromise = null;
        });

      return refs.bootstrapPromise;
    }

    async function persistWorkspacePrefs() {
      if (!state.bootstrapped) return;
      try {
        await apiRequest("/api/v1/cco-workspace/preferences", {
          method: "PUT",
          body: {
            leftWidth: workspaceState.left,
            rightWidth: workspaceState.right,
          },
        });
      } catch (error) {
        console.warn("Kunde inte spara workspace-preferenser.", error);
      }
    }

    function scheduleWorkspacePrefsSave() {
      windowObject.clearTimeout(refs.persistPrefsTimer);
      refs.persistPrefsTimer = windowObject.setTimeout(() => {
        persistWorkspacePrefs();
      }, 120);
    }

    async function resetWorkspacePrefs() {
      try {
        await apiRequest("/api/v1/cco-workspace/preferences", {
          method: "DELETE",
        });
      } catch (error) {
        console.warn("Kunde inte återställa workspace-preferenser.", error);
      }

      workspaceState.left = DEFAULT_WORKSPACE.left;
      workspaceState.right = DEFAULT_WORKSPACE.right;
      normalizeWorkspaceState();
    }

    function collectScheduleDraftFromForm() {
      const reminderLabel = normalizeText(scheduleReminderSelect?.value) || "2 timmar innan";
      const reminderOption = (state.schedule.options?.reminders || []).find(
        (item) => item.label === reminderLabel
      );

      state.schedule.draft = buildRuntimeScheduleDraft({
        customerName: scheduleCustomerInput?.value,
        date: scheduleDateInput?.value,
        time: scheduleTimeInput?.value,
        doctorName: scheduleDoctorSelect?.value,
        category: scheduleCategorySelect?.value,
        reminderLeadMinutes: reminderOption?.minutes || 120,
        reminderLabel,
        notes: scheduleNotesTextarea?.value,
        recommendations: state.schedule.draft?.recommendations || {},
        linkedItems: state.schedule.draft?.linkedItems || [],
      });

      return state.schedule.draft;
    }

    function conflictMessageFrom(metadata) {
      const conflict = metadata?.conflict;
      if (!conflict) {
        return "Tiden krockar med en befintlig uppföljning.";
      }
      return `Tiden krockar med ${conflict.customerName || "en annan kund"} hos ${conflict.doctorName}.`;
    }

    async function saveNote() {
      const activeKey = normalizeText(state.note.activeKey).toLowerCase();
      const draft = getActiveNoteDraft();
      if (!activeKey || !draft) return;

      state.note.saving = true;
      setButtonBusy(noteSaveButton, true, "Spara anteckning", "Sparar…");
      setFeedback(noteFeedback, "loading", "Sparar anteckning…");

      try {
        await apiRequest("/api/v1/cco-workspace/notes/validate-visibility", {
          method: "POST",
          body: {
            destinationKey: activeKey,
            visibility: mapVisibilityValue(draft.visibility),
          },
        });

        const payload = await apiRequest("/api/v1/cco-workspace/notes", {
          method: "POST",
          body: {
            destinationKey: activeKey,
            destinationLabel: targetLabel?.textContent,
            text: draft.text,
            tags: draft.tags,
            priority: mapPriorityValue(draft.priority),
            visibility: mapVisibilityValue(draft.visibility),
            templateKey: draft.templateKey,
          },
        });

        const savedNote = payload?.note || null;
        if (savedNote && state.activity && Array.isArray(state.activity.notes)) {
          const compositeKey = [
            savedNote.tenantId,
            savedNote.workspaceId,
            savedNote.conversationId,
            savedNote.customerId,
            savedNote.destinationKey,
          ]
            .map((value) => normalizeKey(value))
            .join("|");
          const existingIndex = state.activity.notes.findIndex((note) => {
            const noteKey = [
              note?.tenantId,
              note?.workspaceId,
              note?.conversationId,
              note?.customerId,
              note?.destinationKey,
            ]
              .map((value) => normalizeKey(value))
              .join("|");
            return noteKey === compositeKey;
          });
          if (existingIndex >= 0) {
            state.activity.notes[existingIndex] = { ...savedNote };
          } else {
            state.activity.notes.push({ ...savedNote });
          }
        }

        renderFocusNotesSection();
        setFeedback(noteFeedback, "success", payload.message || "Anteckningen sparades.");
        renderNoteDestination(activeKey);
      } catch (error) {
        setFeedback(noteFeedback, "error", error.message || "Kunde inte spara anteckning.");
      } finally {
        state.note.saving = false;
        setButtonBusy(noteSaveButton, false, "Spara anteckning", "Sparar…");
      }
    }

    async function saveSchedule() {
      const draft = collectScheduleDraftFromForm();
      if (!draft) return;

      state.schedule.saving = true;
      setButtonBusy(scheduleSaveButton, true, "Schemalägg uppföljning", "Schemalägger…");
      setFeedback(scheduleFeedback, "loading", "Schemalägger uppföljning…");

      try {
        const validation = await apiRequest("/api/v1/cco-workspace/follow-ups/validate-conflict", {
          method: "POST",
          body: {
            date: draft.date,
            time: draft.time,
            doctorName: draft.doctorName,
          },
        });

        if (!validation.ok) {
          throw new Error(conflictMessageFrom({ conflict: validation.conflict }));
        }

        const payload = await apiRequest("/api/v1/cco-workspace/follow-ups", {
          method: "POST",
          body: {
            date: draft.date,
            time: draft.time,
            doctorName: draft.doctorName,
            category: draft.category,
            reminderLeadMinutes: draft.reminderLeadMinutes,
            notes: draft.notes,
          },
        });

        state.schedule.draft = createScheduleDraft(payload.scheduleDraft || payload.followUp || draft);
        renderScheduleDraft();
        setFeedback(
          scheduleFeedback,
          "success",
          payload.message || "Uppföljningen schemalades."
        );
        await loadBootstrap({
          preserveActiveDestination: true,
          applyWorkspacePrefs: false,
          quiet: true,
          forceReload: true,
        });
        const selectedThread = getSelectedRuntimeThread();
        if (selectedThread) {
          const followUpIso = toIso(
            payload?.followUp?.scheduledForIso || `${draft.date}T${draft.time}:00.000Z`
          );
          updateRuntimeThread(selectedThread.id, (current) => {
            const nextActionSummary = `Uppföljning schemalagd ${draft.date} ${draft.time} hos ${draft.doctorName}.`;
            current.followUpLabel = formatDueLabel(followUpIso);
            current.waitingLabel = "Ägaråtgärd";
            current.statusLabel = "Parkerad";
            current.nextActionLabel = "Återuppta senare";
            current.nextActionSummary = nextActionSummary;
            current.tags = Array.from(
              new Set(
                asArray(current.tags).concat(["followup", "later"]).filter((tag) => tag !== "act-now")
              )
            );
            current.raw = {
              ...current.raw,
              followUpDueAt: followUpIso,
              followUpSuggestedAt: followUpIso,
              nextActionLabel: "Återuppta senare",
              nextActionSummary,
              lastActionTakenLabel: "Uppföljning schemalagd",
              lastActionTakenAt: new Date().toISOString(),
            };
            current.cards = buildRuntimeSummaryCards(current.raw, current);
            return current;
          });
        }
        await refreshWorkspaceBootstrapForSelectedThread("follow-up save");
      } catch (error) {
        const message =
          Number(error.statusCode) === 409 && error.metadata
            ? conflictMessageFrom(error.metadata)
            : error.message || "Kunde inte schemalägga uppföljning.";
        setFeedback(scheduleFeedback, "error", message);
      } finally {
        state.schedule.saving = false;
        setButtonBusy(scheduleSaveButton, false, "Schemalägg uppföljning", "Schemalägger…");
      }
    }

    function resolveStudioSenderMailboxId(
      studioState = {},
      thread = null,
      { isComposeMode = false, studioTruthState = {} } = {}
    ) {
      if (studioTruthState?.truthDriven === true && !isComposeMode) {
        return asText(
          studioTruthState.senderMailboxId ||
            studioTruthState.sourceMailboxId ||
            studioState?.composeMailboxId ||
            getStudioSourceMailboxId(thread)
        );
      }
      return asText(studioState?.composeMailboxId || getStudioSourceMailboxId(thread));
    }

    function buildStudioPreviewUrl(studioState, thread, { isComposeMode = false, studioTruthState = {} } = {}) {
      const params = new URLSearchParams();
      const selectedProfile = getStudioSignatureProfile(studioState?.selectedSignatureId);
      const senderMailboxId = resolveStudioSenderMailboxId(studioState, thread, {
        isComposeMode,
        studioTruthState,
      });
      const signatureOverride =
        studioTruthState?.truthDriven === true
          ? null
          : getStudioSignatureOverride(selectedProfile.id, senderMailboxId);
      params.set("profile", selectedProfile.id);
      params.set("senderMailboxId", senderMailboxId);
      params.set("body", String(studioState?.draftBody || ""));
      if (signatureOverride) {
        params.set("signatureOverrideKey", asText(signatureOverride.key));
        params.set("signatureOverrideLabel", asText(signatureOverride.label));
        params.set("signatureOverrideFullName", asText(signatureOverride.fullName));
        params.set("signatureOverrideTitle", asText(signatureOverride.title));
        params.set(
          "signatureOverrideSenderMailboxId",
          asText(signatureOverride.senderMailboxId)
        );
        if (asText(signatureOverride.html)) {
          params.set("signatureOverrideHtml", asText(signatureOverride.html));
        }
      }
      return `/api/v1/cco/signature-preview?${params.toString()}`;
    }

    function resolveStudioMode() {
      return normalizeKey(state.studio?.mode || studioShell?.dataset.mode) || "reply";
    }

    function getOfflineHistoryThread() {
      const lockedThread = getLockedReplyStudioThread();
      if (resolveStudioMode() !== "compose" && state.studio?.readOnly === true && lockedThread) {
        return {
          ...lockedThread,
          offlineHistorySelection: true,
          raw: {
            ...(lockedThread.raw && typeof lockedThread.raw === "object" ? lockedThread.raw : {}),
            offlineHistorySelection: true,
          },
        };
      }
      const selectedThread = getSelectedRuntimeThread();
      if (
        typeof isOfflineHistoryContextThread === "function" &&
        isOfflineHistoryContextThread(selectedThread)
      ) {
        return selectedThread;
      }
      return null;
    }

    function getLockedReplyStudioThread() {
      const lockedThreadId = asText(state.studio?.replyContextThreadId || state.studio?.threadId);
      const selectedThread = getSelectedRuntimeThread();
      if (!lockedThreadId) {
        return selectedThread;
      }
      if (
        selectedThread &&
        typeof runtimeConversationIdsMatch === "function" &&
        runtimeConversationIdsMatch(selectedThread.id, lockedThreadId)
      ) {
        return selectedThread;
      }
      if (typeof getRuntimeThreadById === "function") {
        return getRuntimeThreadById(lockedThreadId);
      }
      return null;
    }

    function blockOfflineHistoryAction(message, target = "studio") {
      if (!getOfflineHistoryThread()) return false;
      if (target === "focusHistory" && focusHistoryMeta) {
        focusHistoryMeta.textContent = message;
      } else if (target === "focusStatus" && focusStatusLine) {
        focusStatusLine.textContent = message;
      } else {
        setStudioFeedback(message, "error");
      }
      normalizeStudioBusyState();
      return true;
    }

    async function handleStudioPreview() {
      const thread = getLockedReplyStudioThread();
      const isComposeMode = resolveStudioMode() === "compose";
      const studioState = isComposeMode ? state.studio : thread ? ensureStudioState(thread) : null;
      if (!studioState) return;
      if (
        !isComposeMode &&
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att förhandsvisa eller svara.",
          "studio"
        )
      ) {
        return;
      }
      let previewWindow = null;
      try {
        previewWindow = windowObject.open("", "_blank", "noopener");
        if (!previewWindow) {
          throw new Error("Förhandsvisningen blockerades av webbläsaren.");
        }
        previewWindow.document.open();
        previewWindow.document.write(
          "<!doctype html><html><head><title>Laddar förhandsvisning…</title></head><body style=\"font-family:Arial,sans-serif;padding:24px;background:#f7f1ea;color:#4b433d;\">Laddar förhandsvisning…</body></html>"
        );
        previewWindow.document.close();
        const authToken = getAdminToken();
        const response = await fetchImpl(
          buildStudioPreviewUrl(studioState, thread, {
            isComposeMode,
            studioTruthState:
              !isComposeMode && typeof getRuntimeStudioTruthState === "function"
                ? getRuntimeStudioTruthState(thread)
                : {},
          }),
          {
            method: "GET",
            credentials: "same-origin",
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }
        );
        const html = await response.text();
        if (!response.ok) {
          throw new Error("Kunde inte läsa signaturförhandsvisningen.");
        }
        previewWindow.document.open();
        previewWindow.document.write(html);
        previewWindow.document.close();
        setStudioFeedback("Förhandsvisningen öppnades i ett nytt fönster.", "success");
      } catch (error) {
        previewWindow?.close();
        setStudioFeedback(error.message || "Kunde inte öppna förhandsvisningen.", "error");
      }
    }

    async function handleStudioSaveDraft() {
      const thread = getLockedReplyStudioThread();
      const isComposeMode = resolveStudioMode() === "compose";
      const studioState = isComposeMode ? state.studio : thread ? ensureStudioState(thread) : null;
      if (!studioState) return;
      if (
        !isComposeMode &&
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att spara utkast.",
          "studio"
        )
      ) {
        return;
      }
      studioState.savingDraft = true;
      normalizeStudioBusyState();
      setButtonBusy(studioSaveDraftButton, true, "Spara utkast", "Sparar…");
      try {
        if (isComposeMode) {
          studioState.baseDraftBody = studioState.draftBody;
          setStudioFeedback("Compose-utkastet sparades lokalt i studion.", "success");
          return;
        }
        updateRuntimeThread(thread.id, (current) => {
          current.raw = {
            ...current.raw,
            previewDraftBody: studioState.draftBody,
            lastActionTakenLabel: "Utkast sparat",
            lastActionTakenAt: new Date().toISOString(),
          };
          return current;
        });
        studioState.baseDraftBody = studioState.draftBody;
        setStudioFeedback("Utkastet sparades i nya CCO.", "success");
        setStudioOpen(false);
        setContextCollapsed(false);
      } finally {
        studioState.savingDraft = false;
        setButtonBusy(studioSaveDraftButton, false, "Spara utkast", "Sparar…");
        normalizeStudioBusyState();
      }
    }

    async function handleStudioReplyLater(label) {
      const thread = getLockedReplyStudioThread();
      const studioState = thread ? ensureStudioState(thread) : null;
      if (!thread || !studioState) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att parkera konversationen.",
          "studio"
        )
      ) {
        return;
      }
      try {
        await applyReplyLaterToThread(thread, label, { closeStudio: true });
      } catch (error) {
        setStudioFeedback(error.message || "Kunde inte parkera tråden.", "error");
      }
    }

    async function handleStudioMarkHandled() {
      const thread = getLockedReplyStudioThread();
      const studioState = thread ? ensureStudioState(thread) : null;
      if (!thread || !studioState) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att markera konversationen som klar.",
          "studio"
        )
      ) {
        return;
      }
      const outcome = suggestHandledOutcome(thread, studioState);
      try {
        await applyHandledToThread(thread, outcome, { closeStudio: true });
      } catch (error) {
        setStudioFeedback(error.message || "Kunde inte markera konversationen som klar.", "error");
      }
    }

    async function deleteRuntimeThread(thread, idempotencyScope = "major-arcana-delete") {
      if (!thread) return false;
      await apiRequest("/api/v1/cco/delete", {
        method: "POST",
        headers: {
          "x-idempotency-key": createIdempotencyKey(idempotencyScope),
        },
        body: {
          channel: "admin",
          mailboxId: asText(thread.mailboxAddress),
          messageId: asText(thread.raw?.messageId),
          conversationId: thread.id,
          softDelete: true,
        },
      });
      state.runtime.threads = state.runtime.threads.filter((item) => item.id !== thread.id);
      ensureRuntimeSelection();
      renderRuntimeConversationShell();
      await refreshWorkspaceBootstrapForSelectedThread("delete");
      return true;
    }

    async function handleStudioDelete() {
      const thread = getLockedReplyStudioThread();
      const studioState = thread ? ensureStudioState(thread) : null;
      if (!thread || !studioState) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att radera konversationen.",
          "studio"
        )
      ) {
        return;
      }
      studioState.deleting = true;
      normalizeStudioBusyState();
      setButtonBusy(studioDeleteButton, true, "Radera", "Raderar…");
      try {
        await deleteRuntimeThread(thread, "major-arcana-delete");
        setStudioFeedback("Tråden flyttades till papperskorgen.", "success");
        setStudioOpen(false);
        setContextCollapsed(false);
      } catch (error) {
        setStudioFeedback(error.message || "Kunde inte radera tråden.", "error");
      } finally {
        studioState.deleting = false;
        setButtonBusy(studioDeleteButton, false, "Radera", "Raderar…");
        normalizeStudioBusyState();
      }
    }

    async function handleRuntimeDeleteAction(idempotencyScope = "major-arcana-delete") {
      const thread = getSelectedRuntimeThread();
      if (!thread || !state.runtime.deleteEnabled || asText(state.runtime.deletingThreadId)) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att radera konversationen.",
          "focusStatus"
        )
      ) {
        return;
      }
      state.runtime.deletingThreadId = asText(thread.id);
      renderRuntimeConversationShell();
      try {
        await deleteRuntimeThread(thread, idempotencyScope);
        if (focusStatusLine) {
          focusStatusLine.textContent = "Tråden flyttades till papperskorgen.";
        }
      } catch (error) {
        if (focusStatusLine) {
          focusStatusLine.textContent = error.message || "Kunde inte radera tråden.";
        }
      } finally {
        state.runtime.deletingThreadId = "";
        renderRuntimeConversationShell();
      }
    }

    async function handleRuntimeHandledAction() {
      const thread = getSelectedRuntimeThread();
      if (!thread) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att markera konversationen som klar.",
          "focusStatus"
        )
      ) {
        return;
      }
      const studioState = ensureStudioState(thread);
      const outcome = suggestHandledOutcome(thread, studioState);
      try {
        await applyHandledToThread(thread, outcome, { closeStudio: false });
      } catch (error) {
        if (focusStatusLine) {
          focusStatusLine.textContent =
            error.message || "Kunde inte markera konversationen som klar.";
        }
      }
    }

    async function handleFocusHistoryDelete() {
      const thread = getSelectedRuntimeThread();
      if (!thread || state.runtime.historyDeleting) return;
      if (
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att radera konversationen.",
          "focusHistory"
        )
      ) {
        return;
      }
      state.runtime.historyDeleting = true;
      renderActiveFocusHistorySection();
      try {
        await deleteRuntimeThread(thread, "major-arcana-focus-delete");
      } catch (error) {
        const activeThread = getSelectedRuntimeThread();
        state.runtime.historyDeleting = false;
        if (focusHistoryMeta) {
          focusHistoryMeta.textContent = error.message || "Kunde inte radera tråden.";
        }
        const activeFocusThread =
          typeof getSelectedRuntimeFocusThread === "function"
            ? getSelectedRuntimeFocusThread()
            : activeThread;
        const activeFocusReadState =
          typeof getRuntimeFocusReadState === "function"
            ? getRuntimeFocusReadState(activeFocusThread)
            : {};
        renderFocusHistorySection(activeFocusThread, activeFocusReadState);
        return;
      }
      state.runtime.historyDeleting = false;
      renderActiveFocusHistorySection();
    }

    async function handleStudioSend() {
      const thread = getLockedReplyStudioThread();
      const isComposeMode = resolveStudioMode() === "compose";
      const studioState = isComposeMode ? state.studio : thread ? ensureStudioState(thread) : null;
      if (!studioState) return;
      if (
        !isComposeMode &&
        blockOfflineHistoryAction(
          "Offline historik är läsläge. Öppna live-tråden för att skicka svar.",
          "studio"
        )
      ) {
        return;
      }
      if (!normalizeText(studioState.draftBody)) {
        setStudioFeedback(
          isComposeMode
            ? "Utkastet är tomt. Skriv mejlet innan du skickar."
            : "Utkastet är tomt. Skriv ett svar innan du skickar.",
          "error"
        );
        return;
      }
      const composeRecipients = isComposeMode ? parseComposeRecipients(studioState.composeTo) : [];
      if (isComposeMode && !composeRecipients.length) {
        setStudioFeedback("Fyll i minst en giltig mottagare innan du skickar.", "error");
        return;
      }
      if (isComposeMode && !normalizeText(studioState.composeSubject)) {
        setStudioFeedback("Skriv en ämnesrad innan du skickar mejlet.", "error");
        return;
      }
      const studioTruthState =
        !isComposeMode && typeof getRuntimeStudioTruthState === "function"
          ? getRuntimeStudioTruthState(thread)
          : {};
      const selectedSignatureProfile = getStudioSignatureProfile(studioState.selectedSignatureId);
      const composeSenderMailboxId = resolveStudioSenderMailboxId(studioState, thread, {
        isComposeMode,
        studioTruthState,
      });
      const signatureOverride =
        studioTruthState?.truthDriven === true
          ? null
          : getStudioSignatureOverride(
              selectedSignatureProfile.id,
              composeSenderMailboxId
            );
      if (
        studioTruthState?.truthDriven === true &&
        normalizeKey(studioState.selectedSignatureId) !==
          normalizeKey(studioTruthState.selectedSignatureId)
      ) {
        studioState.selectedSignatureId = asText(
          studioTruthState.selectedSignatureId,
          studioState.selectedSignatureId
        );
        studioState.composeMailboxId = asText(
          studioTruthState.sourceMailboxId,
          composeSenderMailboxId
        );
        normalizeStudioBusyState();
        setStudioFeedback(
          `Truth-driven studio låser signatur och source mailbox till ${asText(
            studioTruthState.sourceMailboxLabel,
            composeSenderMailboxId
          )} i ${asText(studioTruthState.waveLabel, "Wave 1")}.`,
          "error"
        );
        return;
      }
      const senderCapability =
        typeof getRuntimeMailboxCapability === 'function'
          ? getRuntimeMailboxCapability(composeSenderMailboxId)
          : null;
      if (senderCapability && senderCapability.sendAvailable !== true) {
        setStudioFeedback(
          `Skicka är inte aktivt för ${senderCapability.label || composeSenderMailboxId}.`,
          'error'
        );
        return;
      }
      if (!selectedSignatureProfile?.id) {
        setStudioFeedback(
          "Välj en signatur innan du skickar från studion.",
          "error"
        );
        return;
      }
      studioState.sending = true;
      normalizeStudioBusyState();
      try {
        const sendResult = await apiRequest("/api/v1/cco/send", {
          method: "POST",
          headers: {
            "x-idempotency-key": createIdempotencyKey(
              isComposeMode ? "major-arcana-compose-send" : "major-arcana-send"
            ),
          },
          body: {
            channel: "admin",
            mode: isComposeMode ? "compose" : "reply",
            mailboxId: isComposeMode
              ? asText(studioState.composeMailboxId || composeSenderMailboxId || getStudioSourceMailboxId(thread))
              : asText(
                  studioTruthState?.truthDriven
                    ? studioTruthState.sourceMailboxId || thread.mailboxAddress
                    : thread.mailboxAddress
                ),
            sourceMailboxId: isComposeMode
              ? asText(studioState.composeMailboxId || composeSenderMailboxId || getStudioSourceMailboxId(thread))
              : asText(
                  studioTruthState?.truthDriven
                    ? studioTruthState.sourceMailboxId || thread.mailboxAddress
                    : thread.mailboxAddress
                ),
            senderMailboxId: composeSenderMailboxId,
            signatureProfile: selectedSignatureProfile.id,
            signatureOverride,
            replyToMessageId: isComposeMode ? "" : asText(thread.raw?.messageId),
            conversationId: isComposeMode ? "" : thread.id,
            truthPrimaryStudio: studioTruthState?.truthDriven === true,
            truthPrimaryWave:
              studioTruthState?.truthDriven === true
                ? asText(studioTruthState.waveLabel, "Wave 1")
                : "",
            replyContextLocked: studioTruthState?.truthDriven === true,
            to: isComposeMode
              ? composeRecipients
              : (() => {
                  const customerEmail = getRuntimeCustomerEmail(thread);
                  return customerEmail ? [customerEmail] : [];
                })(),
            subject: isComposeMode ? normalizeText(studioState.composeSubject) : asText(thread.subject),
            body: studioState.draftBody,
          },
        });
        if (isComposeMode) {
          studioState.baseDraftBody = "";
          studioState.draftBody = "";
          studioState.composeSubject = "";
          if (studioComposeSubjectInput) {
            studioComposeSubjectInput.value = "";
          }
          if (studioEditorInput) {
            studioEditorInput.value = "";
          }
          setStudioFeedback("Nytt mejl skickat från nya CCO.", "success");
          if (studioComposeToInput) {
            studioComposeToInput.focus();
          }
          normalizeStudioBusyState();
          return;
        }
        patchStudioThreadAfterSend(thread, studioState.draftBody, sendResult);
        setStudioFeedback(
          studioTruthState?.truthDriven === true
            ? `Truth-driven studio skickade svar från ${asText(
                studioTruthState.sourceMailboxLabel,
                composeSenderMailboxId
              )} i ${asText(studioTruthState.waveLabel, "Wave 1")}.`
            : "Svar skickat från nya CCO.",
          "success"
        );
        setStudioOpen(false);
        setContextCollapsed(false);
      } catch (error) {
        setStudioFeedback(error.message || "Kunde inte skicka svaret.", "error");
      } finally {
        studioState.sending = false;
        normalizeStudioBusyState();
      }
    }

    return Object.freeze({
      deleteRuntimeThread,
      handleFocusHistoryDelete,
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
    });
  }

  window.MajorArcanaPreviewAsyncOrchestration = Object.freeze({
    createAsyncOrchestration,
  });
})();
