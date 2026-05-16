(() => {
  function createThreadStateOps({
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
  }) {
    function updateRuntimeThread(conversationId, updater) {
      const index = state.runtime.threads.findIndex((thread) => thread.id === conversationId);
      if (index < 0) return null;
      const current = state.runtime.threads[index];
      const next = updater(current) || current;
      state.runtime.threads[index] = next;
      ensureRuntimeSelection();
      renderRuntimeConversationShell();
      renderStudioShell();
      return next;
    }

    function patchStudioThreadAfterSend(thread, draftBody, sendResult = null) {
      try {
        const draftKey = thread?.id ? "cco.studio.draft." + String(thread.id).trim().toLowerCase().replace(/[^a-z0-9._@:-]/g, "_") : "";
        if (draftKey) window.localStorage.removeItem(draftKey);
      } catch (_e) { /* ignore */ }
      const recordedAt = new Date().toISOString();
      const senderLabel = titleCaseMailbox(
        asText(
          state.studio.composeMailboxId ||
            getStudioSenderMailboxId(state.studio.selectedSignatureId, thread)
        )
      );
      const outboundConversationBody = asText(sendResult?.preview?.body, draftBody);
      const outboundConversationBodyHtml = asText(sendResult?.preview?.bodyHtml);
      const nextActionSummary = "Invänta kundens svar och håll nästa steg kort och tydligt.";
      return updateRuntimeThread(thread.id, (current) => {
        current.messages = [
          {
            id: `${current.id}:outbound:${recordedAt}`,
            author: senderLabel,
            role: "staff",
            time: formatConversationTime(recordedAt),
            recordedAt,
            body: draftBody,
            conversationBody: outboundConversationBody,
            conversationBodyHtml: outboundConversationBodyHtml,
            latest: true,
          },
          ...asArray(current.messages).map((message) => ({ ...message, latest: false })),
        ].slice(0, 8);
        current.historyEvents = [
          {
            title: "E-post skickat",
            description: current.subject,
            detail: compactRuntimeCopy(outboundConversationBody, draftBody, 220),
            time: formatConversationTime(recordedAt),
            recordedAt,
            conversationId: current.id,
            mailboxId: current.mailboxAddress,
            mailboxLabel: current.mailboxLabel,
            resultType: "message",
            type: "email",
          },
          ...asArray(current.historyEvents),
        ].slice(0, 8);
        current.lastActivityAt = recordedAt;
        current.lastActivityLabel = formatListTime(recordedAt);
        current.preview = compactRuntimeCopy(draftBody, current.preview, 124);
        current.waitingLabel = "Inväntar svar";
        current.statusLabel = "Besvarad";
        current.nextActionLabel = "Invänta svar";
        current.nextActionSummary = nextActionSummary;
        current.whyInFocus =
          "Senaste svar skickades från svarsstudion. Följ upp om kunden inte återkommer.";
        current.tags = Array.from(
          new Set(current.tags.filter((tag) => tag !== "act-now").concat(["later", "followup"]))
        );
        current.raw = {
          ...current.raw,
          isUnanswered: false,
          waitingOn: "customer",
          lastOutboundAt: recordedAt,
          previewDraftBody: draftBody,
          nextActionLabel: "Invänta svar",
          nextActionSummary,
          lastActionTakenLabel: "Svar skickat",
          lastActionTakenAt: recordedAt,
        };
        current.cards = buildRuntimeSummaryCards(current.raw, current);
        return current;
      });
    }

    function patchStudioThreadAfterReplyLater(thread, label) {
      const recordedAt = new Date().toISOString();
      const normalizedLabel = normalizeKey(label);
      const targetAt = new Date();
      if (normalizedLabel === "imorgon 09:00") {
        targetAt.setDate(targetAt.getDate() + 1);
        targetAt.setHours(9, 0, 0, 0);
      } else if (normalizedLabel === "måndag 09:00") {
        const delta = (8 - targetAt.getDay()) % 7 || 7;
        targetAt.setDate(targetAt.getDate() + delta);
        targetAt.setHours(9, 0, 0, 0);
      } else {
        targetAt.setHours(targetAt.getHours() + 1);
      }
      return updateRuntimeThread(thread.id, (current) => {
        current.waitingLabel = "Ägaråtgärd";
        current.statusLabel = "Parkerad";
        current.followUpLabel = formatDueLabel(targetAt.toISOString());
        current.nextActionLabel = "Återuppta senare";
        current.nextActionSummary = `Tråden är parkerad till ${label}.`;
        current.tags = Array.from(
          new Set(current.tags.concat(["later", "followup"]).filter((tag) => tag !== "act-now"))
        );
        current.raw = {
          ...current.raw,
          waitingOn: "owner",
          followUpDueAt: targetAt.toISOString(),
          followUpSuggestedAt: targetAt.toISOString(),
          lastActionTakenLabel: "Svara senare",
          lastActionTakenAt: recordedAt,
        };
        current.cards = buildRuntimeSummaryCards(current.raw, current);
        return current;
      });
    }

    function patchStudioThreadAfterHandled(thread, outcome) {
      const recordedAt = new Date().toISOString();
      return updateRuntimeThread(thread.id, (current) => {
        current.statusLabel = "Hanterad";
        current.waitingLabel = "Ingen åtgärd";
        current.nextActionLabel = "Ingen åtgärd just nu";
        current.nextActionSummary =
          "Tråden är hanterad och ligger utanför aktiv kö tills nytt kundsvar kommer.";
        current.tags = ["all"];
        current.raw = {
          ...current.raw,
          isUnanswered: false,
          needsReplyStatus: "handled",
          waitingOn: "none",
          lastActionTakenLabel: outcome,
          lastActionTakenAt: recordedAt,
        };
        current.cards = buildRuntimeSummaryCards(current.raw, current);
        return current;
      });
    }

    function isHandledRuntimeThread(thread) {
      const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
      const statusLabel = normalizeKey(thread?.statusLabel || "");
      const waitingOn = normalizeKey(raw.waitingOn || "");
      const nextAction = normalizeKey(thread?.nextActionLabel || raw.nextActionLabel || "");
      return (
        normalizeKey(raw.needsReplyStatus || "") === "handled" ||
        statusLabel === "hanterad" ||
        (waitingOn === "none" && nextAction.includes("ingen åtgärd"))
      );
    }

    function suggestHandledOutcome(thread, studioState) {
      if (studioState?.activeTrackKey === "booking") return "Bokad";
      if (studioState?.activeTrackKey === "medical") return "Eskalerad";
      return "Besvarat";
    }

    return {
      updateRuntimeThread,
      patchStudioThreadAfterSend,
      patchStudioThreadAfterReplyLater,
      patchStudioThreadAfterHandled,
      isHandledRuntimeThread,
      suggestHandledOutcome,
    };
  }

  window.MajorArcanaPreviewThreadOps = Object.freeze({
    createThreadStateOps,
  });
})();
