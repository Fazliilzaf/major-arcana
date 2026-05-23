(() => {
  function createOverlayRenderers({ dom = {}, helpers = {}, state, windowObject = window }) {
    const documentObject = windowObject.document;

    const {
      canvas,
      contextButtons = [],
      destinationButtons = [],
      laterContext,
      laterOptionButtons = [],
      mailboxAdminFeedback,
      mailboxAdminList,
      mailboxAdminShell,
      noteCount,
      noteDataStack,
      noteFeedback,
      noteLivePreview,
      noteLinkedList,
      noteModeContext,
      noteModeOptionButtons = [],
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
      scheduleRecommendationCards = [],
      scheduleReminderHint,
      scheduleReminderSelect,
      scheduleShell,
      scheduleTimeHint,
      scheduleTimeInput,
      laterShell,
      focusContextShell,
      focusContextTitle,
      focusContextLabel,
      focusContextBody,
      focusContextMeta,
      focusContextItems,
      bookingShell,
      bookingShellTitle,
      bookingShellStatus,
      bookingShellMount,
      studioAvatar,
      studioCustomerEmail,
      studioCustomerMood,
      studioCustomerName,
      studioCustomerPhone,
      studioSourceLockLabel,
      studioSourceLockNote,
      studioDeleteButton,
      studioComposeFromSelect,
      studioDoneActionButton,
      studioComposeSubjectInput,
      studioComposeToInput,
      studioEditorInlineUpdate,
      studioEditorInlineUpdateLabel,
      studioEditorInlineUpdateCopy,
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
      studioMiniValueNodes = {},
      studioNextActionNote,
      studioNextActionTitle,
      studioPolicyPill,
      studioPreviewActionButton,
      studioPreviewButton,
      studioPrimarySuggestion,
      studioPrimarySuggestionLabel,
      studioTemplateHelper,
      studioTemplateHelperLabel,
      studioTemplateHelperCopy,
      studioRefineButtons = [],
      studioCtaHelper,
      studioCtaHelperLabel,
      studioCtaHelperCopy,
      studioSaveDraftButton,
      studioSendButton,
      studioSendLabel,
      studioShell,
      studioSignatureButtons = [],
      studioContextSummaryNodes = {},
      studioStatusValueNodes = {},
      studioTemplateButtons = [],
      studioTitle,
      studioToneButtons = [],
      studioGuidanceHelper,
      studioGuidanceHelperLabel,
      studioGuidanceHelperCopy,
      studioToolbarPills = {},
      studioToolButtons = [],
      studioTrackButtons = [],
      studioWhyInFocus,
      targetLabel,
      templateButtons = [],
    } = dom;

    const {
      NOTE_MODE_PRESETS = {},
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
      getStudioBookingUpdateVariant,
      getStudioBookingUpdateWorkModeCopy,
      getStudioBookingUpdateWorkModeLabel,
      getStudioRecommendedTemplateKey,
      getStudioRecommendedToolOrder,
      getStudioRecommendedToolKey,
      getStudioRecommendedToolLeadLabel,
      getStudioRecommendedToolReason,
      getStudioRecommendedBookingCtaCopy,
      getStudioRecommendedBookingCtaLabel,
      getStudioRefineLabel,
      getStudioRecommendedRefineKey,
      getStudioRecommendedToneKey,
      getStudioToneLabel,
      getRuntimeThreadById,
      getScheduleBookingThread,
      isOfflineHistoryContextThread,
      getSelectedRuntimeThread,
      getStudioSenderMailboxOptions,
      getStudioSignatureProfiles,
      getStudioSignatureProfile,
      getStudioResolvedTemplateLabel,
      getStudioSourceMailboxLabel,
      humanizeCode,
      mapPriorityLabel,
      mapVisibilityLabel,
      mapVisibilityValue,
      normalizeKey,
      normalizeText,
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
      runtimeConversationIdsMatch,
      runtimeThreadHistoryBodyRef = null,
      workspaceSourceOfTruth,
    } = helpers;

    function normalizeStudioBusyState() {
      const studioState = state.studio;
      const isComposeMode =
        normalizeKey(studioState?.mode || studioShell?.dataset.mode) === "compose";
      const selectedThread = getSelectedRuntimeThread();
      const hasThread = Boolean(selectedThread);
      const isOfflineHistoryReply =
        !isComposeMode &&
        Boolean(
          typeof isOfflineHistoryContextThread === "function" &&
          isOfflineHistoryContextThread(selectedThread)
        );
      if (!studioSendButton || !studioSaveDraftButton || !studioDeleteButton || !studioSendLabel) {
        return;
      }
      const hasComposeRecipient = normalizeText(studioState?.composeTo);
      const hasComposeSubject = normalizeText(studioState?.composeSubject);
      const signatureProfile = getStudioSignatureProfile(studioState?.selectedSignatureId);
      const senderMailboxId = asText(
        studioState?.composeMailboxId || state.runtime.defaultSenderMailbox
      );
      const senderCapability =
        typeof getRuntimeMailboxCapability === "function"
          ? getRuntimeMailboxCapability(senderMailboxId)
          : null;
      const senderCanSend = senderCapability
        ? senderCapability.sendAvailable === true
        : state.runtime.sendEnabled;
      const senderHasSignature = Boolean(signatureProfile?.id);
      studioSendButton.disabled =
        studioState.sending ||
        studioState.deleting ||
        !senderCanSend ||
        !senderHasSignature ||
        state.runtime.authRequired ||
        !normalizeText(studioState.draftBody) ||
        isOfflineHistoryReply ||
        (!isComposeMode && !hasThread) ||
        (isComposeMode && (!hasComposeRecipient || !hasComposeSubject));
      studioSendLabel.textContent = studioState.sending
        ? "Skickar…"
        : isComposeMode
          ? "Skicka mejl"
          : "Skicka svar";
      studioSaveDraftButton.disabled =
        studioState.sending ||
        studioState.deleting ||
        state.runtime.authRequired ||
        isOfflineHistoryReply ||
        (!isComposeMode && !hasThread);
      studioDeleteButton.disabled =
        studioState.sending ||
        studioState.deleting ||
        isComposeMode ||
        isOfflineHistoryReply ||
        !hasThread ||
        !state.runtime.deleteEnabled ||
        state.runtime.authRequired;
      if (studioPreviewButton) {
        studioPreviewButton.disabled =
          state.runtime.authRequired ||
          isOfflineHistoryReply ||
          !normalizeText(studioState?.draftBody) ||
          (!isComposeMode && !hasThread);
      }
      if (studioLaterActionButton) {
        studioLaterActionButton.disabled =
          state.runtime.authRequired || !hasThread || isComposeMode || isOfflineHistoryReply;
      }
      if (studioDoneActionButton) {
        studioDoneActionButton.disabled =
          state.runtime.authRequired || !hasThread || isComposeMode || isOfflineHistoryReply;
      }
    }

    function applyStudioMode(mode = "reply") {
      const normalizedMode = normalizeKey(mode) || "reply";
      state.studio.mode = normalizedMode;
      if (studioShell) {
        studioShell.dataset.mode = normalizedMode;
      }
      [studioPreviewActionButton, studioLaterActionButton, studioDoneActionButton].forEach(
        (button) => {
          button?.classList.remove("is-active");
        }
      );

      if (normalizedMode === "reply_later") {
        studioLaterActionButton?.classList.add("is-active");
        return;
      }

      if (normalizedMode === "complete") {
        studioDoneActionButton?.classList.add("is-active");
        return;
      }

      studioPreviewActionButton?.classList.add("is-active");
    }

    function renderStudioShell() {
      const studioMode = normalizeKey(state.studio.mode || studioShell?.dataset.mode) || "reply";
      const isComposeMode = studioMode === "compose";
      const runtimeSelectedThread = getSelectedRuntimeThread();
      let lockedReplyThreadId = !isComposeMode
        ? asText(state.studio.replyContextThreadId || state.studio.threadId)
        : "";
      if (!isComposeMode && runtimeSelectedThread) {
        const selectedRuntimeThreadId = asText(runtimeSelectedThread.id);
        if (
          selectedRuntimeThreadId &&
          (!lockedReplyThreadId ||
            !runtimeConversationIdsMatch(lockedReplyThreadId, selectedRuntimeThreadId))
        ) {
          lockedReplyThreadId = selectedRuntimeThreadId;
          state.studio.threadId = selectedRuntimeThreadId;
          state.studio.replyContextThreadId = selectedRuntimeThreadId;
        }
      }
      const composeThreadId = isComposeMode ? asText(state.studio.threadId) : "";
      const composeThread =
        isComposeMode && composeThreadId
          ? runtimeSelectedThread &&
            typeof runtimeConversationIdsMatch === "function" &&
            runtimeConversationIdsMatch(runtimeSelectedThread.id, composeThreadId)
            ? runtimeSelectedThread
            : (Array.isArray(state.runtime?.threads) ? state.runtime.threads : []).find(
                (candidate) =>
                  typeof runtimeConversationIdsMatch === "function" &&
                  runtimeConversationIdsMatch(candidate?.id, composeThreadId)
              ) || null
          : null;
      let lockedReplyThread =
        !isComposeMode && lockedReplyThreadId
          ? runtimeSelectedThread &&
            typeof runtimeConversationIdsMatch === "function" &&
            runtimeConversationIdsMatch(runtimeSelectedThread.id, lockedReplyThreadId)
            ? runtimeSelectedThread
            : typeof getRuntimeThreadById === "function"
              ? getRuntimeThreadById(lockedReplyThreadId)
              : null
          : null;
      if (!isComposeMode && runtimeSelectedThread && (!lockedReplyThreadId || !lockedReplyThread)) {
        lockedReplyThreadId = asText(runtimeSelectedThread.id);
        lockedReplyThread = runtimeSelectedThread;
        state.studio.threadId = lockedReplyThreadId;
        state.studio.replyContextThreadId = lockedReplyThreadId;
        state.studio.mode = "reply";
      }
      const thread = isComposeMode
        ? composeThread
        : lockedReplyThreadId
          ? lockedReplyThread
          : runtimeSelectedThread;
      const isStandaloneCompose = isComposeMode && !thread;
      const isOfflineHistoryReply =
        !isComposeMode &&
        Boolean(
          state.studio?.readOnly === true ||
          (typeof isOfflineHistoryContextThread === "function" &&
            isOfflineHistoryContextThread(thread))
        );
      const isAuthBlocked =
        state.runtime.authRequired || (!thread && !state.runtime.loading && !isComposeMode);
      const studioState = isComposeMode ? state.studio : thread ? ensureStudioState(thread) : null;
      const studioTruthState =
        !isComposeMode && thread && typeof getRuntimeStudioTruthState === "function"
          ? getRuntimeStudioTruthState(thread)
          : {};
      const bookingStudioMode = normalizeKey(studioState?.bookingStudioMode);
      const hasBookingUpdateStudioContext = bookingStudioMode === "booking_update";
      const bookingStudioVariant = hasBookingUpdateStudioContext
        ? normalizeKey(getStudioBookingUpdateVariant(studioState))
        : normalizeKey(studioState?.bookingStudioVariant);
      const recommendedTemplateKey = normalizeKey(getStudioRecommendedTemplateKey(studioState));
      const recommendedToolOrder = hasBookingUpdateStudioContext
        ? asArray(getStudioRecommendedToolOrder(studioState)).map((toolKey) =>
            normalizeKey(toolKey)
          )
        : [];
      const recommendedToolKey = normalizeKey(getStudioRecommendedToolKey(studioState));
      const recommendedToolReason = hasBookingUpdateStudioContext
        ? asText(getStudioRecommendedToolReason(studioState))
        : "";
      const recommendedToneKey = hasBookingUpdateStudioContext
        ? normalizeKey(getStudioRecommendedToneKey(studioState))
        : "";
      const recommendedRefineKey = hasBookingUpdateStudioContext
        ? normalizeKey(getStudioRecommendedRefineKey(studioState))
        : "";
      const bookingStudioSummaryLabel = asText(studioState?.bookingStudioSummaryLabel);
      const bookingStudioReason = asText(studioState?.bookingStudioReason);
      const bookingStudioChangedFrom = asText(studioState?.bookingStudioChangedFrom);
      const bookingStudioChangedTo = asText(studioState?.bookingStudioChangedTo);
      const bookingStudioDeltaLabel =
        bookingStudioChangedFrom && bookingStudioChangedTo
          ? `${bookingStudioChangedFrom} -> ${bookingStudioChangedTo}`
          : "";
      const bookingReplyShape = hasBookingUpdateStudioContext
        ? getStudioBookingCompletionReplyShape(studioState)
        : "";
      const isTruthDrivenStudio = !isComposeMode && studioTruthState?.truthDriven === true;
      const isTruthScopeRollback =
        !isComposeMode &&
        studioTruthState?.inConfiguredScope === true &&
        isTruthDrivenStudio !== true;
      const studioWaveLabel = asText(studioTruthState?.waveLabel, "Wave 1");
      const signatureProfile = getStudioSignatureProfile(studioState?.selectedSignatureId);
      const latestCustomerMessage = getLatestCustomerMessage(thread);
      const policy = evaluateStudioPolicy(thread, studioState?.draftBody || "");
      const composeMailboxLabel = getStudioSourceMailboxLabel(studioState?.composeMailboxId);
      const composeRecipient = normalizeText(studioState?.composeTo);
      const composeSubject = normalizeText(studioState?.composeSubject);
      const senderMailboxOptions = getStudioSenderMailboxOptions();
      const selectedSenderMailboxId = asText(
        studioState?.composeMailboxId || senderMailboxOptions[0]?.id || ""
      );
      const selectedSenderLabel =
        getStudioSourceMailboxLabel(selectedSenderMailboxId) ||
        composeMailboxLabel ||
        "Valt mejlkonto";
      const signatureProfiles = getStudioSignatureProfiles();
      const studioSignatureRow =
        studioShell?.querySelector("[data-studio-signature-options]") || null;
      const nextSignatureButtonsMarkup = signatureProfiles
        .map(
          (profile) =>
            `<button class="studio-choice" type="button" data-studio-signature="${escapeHtml(
              profile.id
            )}" data-studio-signature-source="${escapeHtml(
              profile.source || "static"
            )}">${escapeHtml(profile.label)}</button>`
        )
        .join("");
      if (studioSignatureRow && studioSignatureRow.innerHTML !== nextSignatureButtonsMarkup) {
        studioSignatureRow.innerHTML = nextSignatureButtonsMarkup;
      }
      const renderedStudioSignatureButtons = studioSignatureRow
        ? Array.from(studioSignatureRow.querySelectorAll("[data-studio-signature]"))
        : studioSignatureButtons;
      const studioInlineToolButtons = studioShell
        ? Array.from(studioShell.querySelectorAll(".studio-tool-button"))
        : [];
      const studioContextTabs = {
        ai: studioShell?.querySelector('label[for="studio-context-ai"]') || null,
        history: studioShell?.querySelector('label[for="studio-context-history"]') || null,
        preferences: studioShell?.querySelector('label[for="studio-context-preferences"]') || null,
        recommendations:
          studioShell?.querySelector('label[for="studio-context-recommendations"]') || null,
      };
      const studioContextCounts = {
        ai: thread ? buildStudioContextAiItems(thread).length : 0,
        history: asArray(thread?.historyEvents).slice(0, 3).length,
        preferences: thread ? 4 : 0,
        recommendations: thread ? 3 : 0,
      };

      if (studioShell) {
        studioShell.dataset.mode = studioMode;
        studioShell.dataset.readOnly = isOfflineHistoryReply ? "true" : "false";
        studioShell.dataset.truthPrimary = isTruthDrivenStudio ? "true" : "false";
        studioShell.dataset.runtimeSource = isTruthDrivenStudio ? "truth_primary" : "legacy";
        studioShell.dataset.replyContextLocked = isTruthDrivenStudio ? "true" : "false";
      }

      if (studioTitle) {
        studioTitle.textContent = isComposeMode ? "Nytt mejl" : "Svarstudio";
      }
      if (studioToolbarPills.intent) {
        studioToolbarPills.intent.textContent = isComposeMode
          ? selectedSenderLabel
          : isTruthDrivenStudio
            ? studioTruthState.label || "Sanningsstyrd svarstudio"
            : thread?.intentLabel || "Ingen tråd";
      }
      if (studioToolbarPills.priority) {
        studioToolbarPills.priority.textContent = isComposeMode
          ? composeRecipient
            ? "Mottagare vald"
            : "Utan kundkontext"
          : isTruthDrivenStudio
            ? studioWaveLabel
            : thread?.isVIP
              ? "VIP"
              : thread?.riskLabel || "Normal";
      }
      if (studioToolbarPills.value) {
        studioToolbarPills.value.textContent = isComposeMode
          ? signatureProfile?.label || "Signatur"
          : isTruthDrivenStudio
            ? `Källa: ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || "-"}`
            : thread?.engagementLabel || "0% engagemang";
      }
      if (studioAvatar) {
        studioAvatar.src =
          thread?.avatar ||
          buildAvatarDataUri(composeRecipient || signatureProfile?.label || "CCO");
        studioAvatar.alt =
          thread?.customerName || composeRecipient || signatureProfile?.label || "CCO";
      }
      if (studioCustomerName) {
        studioCustomerName.textContent =
          thread?.customerName || (isComposeMode ? "Nytt mejl" : "Ingen vald kund");
      }
      if (studioCustomerMood) {
        studioCustomerMood.textContent = isComposeMode
          ? thread
            ? `Vald kund · nytt mejl från ${selectedSenderLabel}`
            : `Fristående nytt mejl från ${selectedSenderLabel}`
          : isOfflineHistoryReply
            ? `Offline historik · läsläge · aktiva åtgärder spärrade · ${thread.mailboxLabel || selectedSenderLabel}`
            : isTruthDrivenStudio
              ? `${studioTruthState.label || "Sanningsstyrd svarstudio"} · ${studioWaveLabel} · svarskontext låst · ${composeMailboxLabel || thread.mailboxLabel || selectedSenderLabel}`
              : isTruthScopeRollback
                ? `${studioTruthState.waveLabel || "Wave 1 rollback"} · svarsstudio-fallback till legacy · ${composeMailboxLabel || thread?.mailboxLabel || selectedSenderLabel}`
                : thread
                  ? `${thread.lifecycleLabel} · ${thread.waitingLabel}`
                  : state.runtime.loading
                    ? "Laddar aktiv kontext"
                    : isAuthBlocked
                      ? "Logga in för att låsa upp svarsstudion"
                      : "Välj en aktiv tråd i arbetskön";
      }
      if (studioCustomerEmail) {
        studioCustomerEmail.textContent =
          thread?.customerEmail ||
          composeRecipient ||
          (isComposeMode ? "Ange mottagare" : "Ingen e-post");
      }
      if (studioCustomerPhone) {
        studioCustomerPhone.textContent = signatureProfile.phone;
      }
      if (studioSourceLockLabel) {
        studioSourceLockLabel.textContent = isComposeMode
          ? composeMailboxLabel || selectedSenderLabel || "Valt mejlkonto"
          : isOfflineHistoryReply
            ? thread?.mailboxLabel || selectedSenderLabel || "Valt mejlkonto"
            : isTruthDrivenStudio
              ? composeMailboxLabel ||
                studioTruthState?.sourceMailboxLabel ||
                selectedSenderLabel ||
                "Valt mejlkonto"
              : thread?.mailboxLabel || selectedSenderLabel || "Valt mejlkonto";
      }
      if (studioSourceLockNote) {
        studioSourceLockNote.textContent = isComposeMode
          ? composeMailboxLabel
            ? `Från ${composeMailboxLabel} · svarskontext låst`
            : `Från ${selectedSenderLabel} · svarskontext låst`
          : isOfflineHistoryReply
            ? `Källa låst till ${thread?.mailboxLabel || selectedSenderLabel} · läsläge`
            : isTruthDrivenStudio
              ? `Källa låst till ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || selectedSenderLabel} · svarskontext låst`
              : `Källa låst till ${thread?.mailboxLabel || selectedSenderLabel}`;
      }
      if (studioNextActionTitle) {
        studioNextActionTitle.textContent = isComposeMode
          ? hasBookingUpdateStudioContext
            ? bookingStudioVariant === "follow_up_update" &&
              bookingReplyShape === "two_paragraph_reply"
              ? "Kort uppföljning till kund"
              : bookingStudioVariant === "customer_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                ? "Kort ersättning till kund"
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Kompakt bekräftelse till kund"
                  : "Uppdatera kundförslag"
            : "Skriv nytt mejl"
          : isOfflineHistoryReply
            ? "Offline historik · läsläge"
            : isTruthDrivenStudio
              ? `${studioWaveLabel} · Svara från ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || "låst mejlkonto"}`
              : thread?.nextActionLabel || "Välj en tråd";
      }
      if (studioNextActionNote) {
        studioNextActionNote.textContent = isComposeMode
          ? hasBookingUpdateStudioContext
            ? compactRuntimeCopy(
                bookingStudioVariant === "follow_up_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                  ? bookingStudioDeltaLabel
                    ? `Kort uppföljning nu: ${bookingStudioDeltaLabel} är den enda tiden kunden behöver svara på.`
                    : "Kort uppföljning nu: kunden behöver bara svara på den uppdaterade tiden i samma tråd."
                  : bookingStudioVariant === "customer_update" &&
                      bookingReplyShape === "two_paragraph_reply"
                    ? bookingStudioDeltaLabel
                      ? `Kort ersättning nu: ${bookingStudioDeltaLabel} är den enda svarspunkten i tråden.`
                      : "Kort ersättning nu: den nya tiden är nu den enda svarspunkten i samma tråd."
                    : bookingReplyShape === "compact_three_paragraph_reply"
                      ? bookingStudioDeltaLabel
                        ? `Kompakt bekräftelse nu: landa direkt i ${bookingStudioDeltaLabel}.`
                        : "Kompakt bekräftelse nu: landa direkt i den uppdaterade tiden i samma tråd."
                      : bookingStudioReason,
                "Det här utkastet ersätter ett tidigare kundförslag med en ny tid.",
                112
              )
            : thread
              ? `Startar en ny kontakt med ${thread.customerName}. Vi förifyller mottagaren åt dig.`
              : `Fristående compose från ${selectedSenderLabel}. Välj mall, ton och signatur innan du skickar.`
          : isOfflineHistoryReply
            ? "Historikkontexten är läsbar här, men svar, förhandsvisning, senare, klar och radera kräver aktiv tråd."
            : isTruthDrivenStudio
              ? asText(
                  studioTruthState?.detail,
                  "Sanningsstyrd svarstudio låser svarskontext, källmejlkonto och canonical thread identity i wave 1."
                )
              : isTruthScopeRollback
                ? asText(
                    studioTruthState?.detail,
                    "Wave 1 ligger i legacy fallback tills sanningsstyrd svarstudio kan återaktiveras."
                  )
                : thread
                  ? compactRuntimeCopy(
                      thread.nextActionSummary,
                      "Ta nästa tydliga steg i samma tråd.",
                      72
                    )
                  : "Ingen aktiv tråd vald";
      }
      if (studioPrimarySuggestionLabel) {
        studioPrimarySuggestionLabel.textContent = isComposeMode
          ? hasBookingUpdateStudioContext
            ? bookingStudioVariant === "follow_up_update" &&
              bookingReplyShape === "two_paragraph_reply"
              ? "Följ upp kort"
              : bookingStudioVariant === "customer_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                ? "Ersätt kort"
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Bekräfta kort"
                  : composeRecipient
                    ? `Skriv till ${composeRecipient}`
                    : "Fyll i mottagare"
            : composeRecipient
              ? `Skriv till ${composeRecipient}`
              : "Fyll i mottagare"
          : isOfflineHistoryReply
            ? "Läs historiken"
            : isTruthDrivenStudio
              ? thread?.nextActionLabel || "Öppna tråd"
              : thread?.followUpLabel
                ? `Återuppta ${thread.followUpLabel}`
                : thread?.nextActionLabel || "Öppna tråd";
      }
      if (studioPrimarySuggestion) {
        studioPrimarySuggestion.disabled =
          isComposeMode || !thread || state.runtime.authRequired || isOfflineHistoryReply;
      }
      if (studioWhyInFocus) {
        studioWhyInFocus.textContent = isComposeMode
          ? hasBookingUpdateStudioContext
            ? compactRuntimeCopy(
                bookingStudioVariant === "follow_up_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                  ? bookingStudioDeltaLabel
                    ? `Kort uppföljning i fokus. Ändrat: ${bookingStudioDeltaLabel}.`
                    : "Kort uppföljning i fokus. Kunden behöver bara svara på den uppdaterade tiden."
                  : bookingStudioVariant === "customer_update" &&
                      bookingReplyShape === "two_paragraph_reply"
                    ? bookingStudioDeltaLabel
                      ? `Kort ersättning i fokus. Ändrat: ${bookingStudioDeltaLabel}.`
                      : "Kort ersättning i fokus. Den nya tiden är nu den enda svarspunkten."
                    : bookingReplyShape === "compact_three_paragraph_reply"
                      ? bookingStudioDeltaLabel
                        ? `Kompakt bekräftelse i fokus. Ändrat: ${bookingStudioDeltaLabel}.`
                        : "Kompakt bekräftelse i fokus. Landa direkt i den uppdaterade tiden."
                      : bookingStudioDeltaLabel
                        ? `Uppdaterat bokningsförslag. Ändrat: ${bookingStudioDeltaLabel}.`
                        : bookingStudioReason,
                "Det här svaret uppdaterar kunden efter en ombokning.",
                88
              )
            : thread
              ? compactRuntimeCopy(
                  thread.whyInFocus,
                  "Vald kundkontext ger extra stöd för ett nytt mejl.",
                  88
                )
              : "Det här är ett fristående nytt mejl. Lägg till mottagare, välj mall och håll tonen tydlig."
          : isOfflineHistoryReply
            ? `${thread?.whyInFocus || "Historiken är tillgänglig i läsläge."} Operativa actions kräver aktiv tråd.`
            : isTruthDrivenStudio
              ? `${compactRuntimeCopy(
                  thread?.whyInFocus,
                  "Sanningsstyrd svarstudio är aktiv för wave 1.",
                  88
                )} Källmejlkonto, svarskontext och trådform hålls låsta till mejlsanning.`
              : isTruthScopeRollback
                ? asText(
                    studioTruthState?.detail,
                    "Wave 1 ligger i ordinarie fallback i svarsstudion tills den sanningsstyrda vägen är tillbaka."
                  )
                : thread?.whyInFocus || state.runtime.error || "Ingen fokusmotivering ännu.";
      }
      if (studioStatusValueNodes.owner) {
        studioStatusValueNodes.owner.textContent = thread?.ownerLabel || "-";
      }
      if (studioStatusValueNodes.status) {
        studioStatusValueNodes.status.textContent = thread?.statusLabel || "-";
      }
      if (studioStatusValueNodes.sla) {
        studioStatusValueNodes.sla.textContent =
          thread?.followUpLabel || humanizeCode(thread?.raw?.slaStatus, "-");
      }
      if (studioStatusValueNodes.risk) {
        studioStatusValueNodes.risk.textContent = thread?.riskLabel || "-";
      }
      if (studioMiniValueNodes.risk) {
        studioMiniValueNodes.risk.textContent = thread?.riskLabel || "Ingen risk";
      }
      if (studioMiniValueNodes.engagement) {
        studioMiniValueNodes.engagement.textContent = thread?.engagementLabel || "0%";
      }

      if (studioContextSummaryNodes.ai) {
        studioContextSummaryNodes.ai.textContent = isTruthDrivenStudio
          ? `${studioTruthState.label || "Sanningsstyrd svarstudio"} · ${studioWaveLabel} · ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || "valt mejlkonto"} · svarskontext låst`
          : thread?.whyInFocus || "Ingen AI-sammanfattning tillgänglig ännu.";
      }
      renderStudioContextAiList(thread ? buildStudioContextAiItems(thread) : []);
      renderStudioContextHistoryList(thread);
      renderStudioContextPreferencesList(thread);
      renderStudioContextRecommendationsList(thread);

      if (studioIncomingAvatar) {
        studioIncomingAvatar.src =
          thread?.avatar || buildAvatarDataUri(thread?.customerName || "CCO");
        studioIncomingAvatar.alt = thread?.customerName || "CCO";
      }
      if (studioIncomingName) {
        studioIncomingName.textContent =
          thread?.customerName || (isComposeMode ? "Nytt mejl" : "Ingen vald kund");
      }
      if (studioIncomingTime) {
        studioIncomingTime.textContent =
          latestCustomerMessage?.time ||
          thread?.lastActivityLabel ||
          (isComposeMode
            ? "Nu"
            : isOfflineHistoryReply
              ? "Offline historik"
              : "Ingen aktiv tråd vald");
      }
      if (studioIncomingLabel) {
        studioIncomingLabel.textContent = isComposeMode
          ? hasBookingUpdateStudioContext
            ? bookingStudioVariant === "follow_up_update" &&
              bookingReplyShape === "two_paragraph_reply"
              ? "Kort uppföljning:"
              : bookingStudioVariant === "customer_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                ? "Kort ersättning:"
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Kompakt bekräftelse:"
                  : "Skrivkontext:"
            : "Skrivkontext:"
          : isOfflineHistoryReply
            ? "Historik i offline-läge:"
            : isTruthDrivenStudio
              ? "Sanningsstyrd trådkontext:"
              : thread
                ? "Konversation i tråden:"
                : "Aktiv kontext:";
      }
      if (studioIncomingBody) {
        renderStudioConversation(thread);
      }

      if (studioEditorRecipient) {
        const recipient =
          thread?.customerEmail ||
          thread?.customerName ||
          composeRecipient ||
          "Ingen vald mottagare";
        studioEditorRecipient.textContent = `Till: ${recipient}`;
      }
      if (studioComposeToInput) {
        studioComposeToInput.value = composeRecipient;
        studioComposeToInput.disabled = state.runtime.authRequired;
      }
      if (studioComposeFromSelect) {
        const nextOptionsMarkup = senderMailboxOptions
          .map(
            (mailbox) =>
              `<option value="${escapeHtml(mailbox.id)}">${escapeHtml(
                `${mailbox.label} · ${mailbox.email}`
              )}</option>`
          )
          .join("");
        if (studioComposeFromSelect.innerHTML !== nextOptionsMarkup) {
          studioComposeFromSelect.innerHTML = nextOptionsMarkup;
        }
        studioComposeFromSelect.value = selectedSenderMailboxId;
        studioComposeFromSelect.disabled =
          state.runtime.authRequired ||
          isOfflineHistoryReply ||
          (!isComposeMode && !thread) ||
          isTruthDrivenStudio;
        studioComposeFromSelect.title = isTruthDrivenStudio
          ? `Sanningsstyrd svarstudio låser källmejlkonto till ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || "vald mailbox"} i ${studioWaveLabel}.`
          : "";
      }
      if (studioComposeSubjectInput) {
        studioComposeSubjectInput.value = composeSubject;
        studioComposeSubjectInput.disabled = state.runtime.authRequired;
      }
      if (studioEditorInlineUpdate) {
        const shouldShowBookingUpdateInline = isComposeMode && hasBookingUpdateStudioContext;
        studioEditorInlineUpdate.hidden = !shouldShowBookingUpdateInline;
        if (studioEditorInlineUpdateLabel) {
          studioEditorInlineUpdateLabel.textContent = shouldShowBookingUpdateInline
            ? getStudioBookingUpdateWorkModeLabel(studioState)
            : hasBookingUpdateStudioContext && bookingReplyShape === "two_paragraph_reply"
              ? bookingStudioVariant === "follow_up_update"
                ? "Läge: kort uppföljning"
                : "Läge: kort ersättning"
              : hasBookingUpdateStudioContext &&
                  bookingReplyShape === "compact_three_paragraph_reply"
                ? "Läge: kompakt bekräftelse"
                : bookingStudioSummaryLabel || "Läge: Uppdaterat bokningsförslag";
        }
        if (studioEditorInlineUpdateCopy) {
          studioEditorInlineUpdateCopy.textContent = shouldShowBookingUpdateInline
            ? compactRuntimeCopy(
                bookingStudioVariant === "follow_up_update" &&
                  bookingReplyShape === "two_paragraph_reply"
                  ? bookingStudioDeltaLabel
                    ? `${bookingStudioDeltaLabel}. Kort uppföljning: kunden behöver bara svara på den nya tiden i samma tråd.`
                    : "Kort uppföljning: kunden behöver bara svara på den nya tiden i samma tråd."
                  : bookingStudioVariant === "customer_update" &&
                      bookingReplyShape === "two_paragraph_reply"
                    ? bookingStudioDeltaLabel
                      ? `${bookingStudioDeltaLabel}. Kort ersättning: gör den nya tiden till enda svarspunkt i tråden.`
                      : "Kort ersättning: gör den nya tiden till enda svarspunkt i tråden."
                    : bookingReplyShape === "compact_three_paragraph_reply"
                      ? bookingStudioDeltaLabel
                        ? `${bookingStudioDeltaLabel}. Kompakt bekräftelse: landa direkt i den nya tiden.`
                        : "Kompakt bekräftelse: landa direkt i den nya tiden."
                      : [
                          bookingStudioDeltaLabel
                            ? `${bookingStudioDeltaLabel}. ${bookingStudioReason}`
                            : bookingStudioReason,
                          getStudioBookingUpdateWorkModeCopy(studioState),
                        ]
                          .filter(Boolean)
                          .join(" "),
                bookingReplyShape === "two_paragraph_reply"
                  ? "Kort uppdatering: den nya tiden är nu den enda kunden behöver svara på."
                  : bookingReplyShape === "compact_three_paragraph_reply"
                    ? "Kompakt bekräftelse: landa direkt i den nya tiden."
                    : "Tidigare kundförslag har ersatts med en ny tid.",
                132
              )
            : "";
        }
      }
      const bookingTemplateButton = studioTemplateButtons.find(
        (button) => normalizeKey(button.dataset.studioTemplate) === "confirm_booking"
      );
      if (bookingTemplateButton) {
        bookingTemplateButton.textContent = hasBookingUpdateStudioContext
          ? bookingStudioVariant === "follow_up_update" &&
            bookingReplyShape === "two_paragraph_reply"
            ? "Följ upp kundförslag"
            : bookingStudioVariant === "customer_update" &&
                bookingReplyShape === "two_paragraph_reply"
              ? "Ersätt kundförslag"
              : bookingReplyShape === "compact_three_paragraph_reply"
                ? "Bekräfta uppdaterad tid"
                : "Uppdatera kundförslag"
          : "Bekräfta bokning";
        bookingTemplateButton.title = hasBookingUpdateStudioContext
          ? bookingStudioVariant === "follow_up_update" &&
            bookingReplyShape === "two_paragraph_reply"
            ? "Följ upp det uppdaterade kundförslaget med ett kort svarssteg."
            : bookingStudioVariant === "customer_update" &&
                bookingReplyShape === "two_paragraph_reply"
              ? "Ersätt det tidigare kundförslaget och gör den nya tiden till enda svarspunkt."
              : bookingReplyShape === "compact_three_paragraph_reply"
                ? "Bekräfta den uppdaterade tiden med ett kompakt kundsvar."
                : "Uppdatera tidigare kundförslag efter ombokning."
          : "Bekräfta eller skicka första bokningsförslaget.";
      }
      const templateRow = studioTemplateButtons[0]?.parentElement || null;
      if (templateRow && recommendedTemplateKey) {
        studioTemplateButtons
          .slice()
          .sort((leftButton, rightButton) => {
            const leftRank =
              normalizeKey(leftButton.dataset.studioTemplate) === recommendedTemplateKey ? 0 : 1;
            const rightRank =
              normalizeKey(rightButton.dataset.studioTemplate) === recommendedTemplateKey ? 0 : 1;
            return leftRank - rightRank;
          })
          .forEach((button) => {
            templateRow.appendChild(button);
          });
      }
      if (studioTemplateHelper) {
        studioTemplateHelper.hidden = !hasBookingUpdateStudioContext;
      }
      if (studioTemplateHelperLabel) {
        studioTemplateHelperLabel.textContent = hasBookingUpdateStudioContext
          ? bookingStudioVariant === "follow_up_update"
            ? bookingReplyShape === "two_paragraph_reply"
              ? "Rekommenderat nu · kort uppföljning"
              : "Rekommenderat nu · följ upp"
            : bookingStudioVariant === "customer_update"
              ? bookingReplyShape === "two_paragraph_reply"
                ? "Rekommenderat nu · kort ersättning"
                : "Rekommenderat nu · ersätt"
              : bookingReplyShape === "compact_three_paragraph_reply"
                ? "Rekommenderat nu · kompakt bekräftelse"
                : "Rekommenderat nu · uppdatera"
          : "";
      }
      if (studioTemplateHelperCopy) {
        studioTemplateHelperCopy.textContent = hasBookingUpdateStudioContext
          ? compactRuntimeCopy(
              bookingStudioVariant === "follow_up_update"
                ? bookingReplyShape === "two_paragraph_reply"
                  ? bookingStudioDeltaLabel
                    ? `Kunden väntar fortfarande. Håll svaret kort och följ upp att ${bookingStudioDeltaLabel} nu är den enda tiden att svara på.`
                    : "Kunden väntar fortfarande. Håll svaret kort och följ upp den nya tiden som enda beslutspunkt."
                  : bookingStudioDeltaLabel
                    ? `Kunden väntar fortfarande. Följ upp att ${bookingStudioDeltaLabel} nu är rätt tid i samma tråd.`
                    : bookingStudioReason
                : bookingStudioVariant === "customer_update"
                  ? bookingReplyShape === "two_paragraph_reply"
                    ? bookingStudioDeltaLabel
                      ? `Tidigare förslag ersattes av ${bookingStudioDeltaLabel}. Håll svaret kort och gör den nya tiden till enda svarspunkt.`
                      : "Håll svaret kort och gör den nya tiden till enda svarspunkt i samma tråd."
                    : bookingStudioDeltaLabel
                      ? `Tidigare förslag ersattes av ${bookingStudioDeltaLabel}. Ersätt kundsvaret med den nya tiden.`
                      : bookingStudioReason
                  : bookingReplyShape === "compact_three_paragraph_reply"
                    ? bookingStudioDeltaLabel
                      ? `Tidigare förslag ersattes av ${bookingStudioDeltaLabel}. Håll bekräftelsen kompakt och landa i den nya tiden direkt.`
                      : "Håll bekräftelsen kompakt och landa i den nya tiden direkt."
                    : bookingStudioDeltaLabel
                      ? `Tidigare förslag ersattes av ${bookingStudioDeltaLabel}. Uppdatera kundsvaret med den nya tiden.`
                      : bookingStudioReason,
              bookingReplyShape === "two_paragraph_reply"
                ? "Håll svaret kort och gör den nya tiden till enda svarspunkt i tråden."
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Håll bekräftelsen kompakt och landa i den nya tiden direkt."
                  : "Tidigare kundförslag har ändrats. Uppdatera svaret med den nya tiden.",
              132
            )
          : "";
      }
      if (studioGuidanceHelper) {
        studioGuidanceHelper.hidden = !hasBookingUpdateStudioContext;
      }
      if (studioGuidanceHelperLabel) {
        studioGuidanceHelperLabel.textContent = hasBookingUpdateStudioContext
          ? getStudioBookingUpdateWorkModeLabel(studioState)
          : "";
      }
      if (studioGuidanceHelperCopy) {
        studioGuidanceHelperCopy.textContent = hasBookingUpdateStudioContext
          ? compactRuntimeCopy(
              getStudioBookingUpdateWorkModeCopy(studioState),
              bookingReplyShape === "two_paragraph_reply"
                ? "Håll svaret kort och låt den nya tiden bli enda svarspunkt i tråden."
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Håll svaret kompakt och landa direkt i den nya tiden."
                  : "Lösningsfokus passar bäst när ett tidigare kundförslag har ersatts.",
              132
            )
          : "";
      }
      if (studioCtaHelper) {
        studioCtaHelper.hidden = !hasBookingUpdateStudioContext;
      }
      if (studioCtaHelperLabel) {
        studioCtaHelperLabel.textContent = hasBookingUpdateStudioContext
          ? getStudioRecommendedBookingCtaLabel(studioState)
          : "";
      }
      if (studioCtaHelperCopy) {
        studioCtaHelperCopy.textContent = hasBookingUpdateStudioContext
          ? compactRuntimeCopy(
              getStudioRecommendedBookingCtaCopy(studioState),
              bookingReplyShape === "two_paragraph_reply"
                ? bookingStudioVariant === "follow_up_update"
                  ? "Be om ett kort svar på den nya tiden i samma tråd."
                  : "Be om ett kort ja på den nya tiden i samma tråd."
                : bookingReplyShape === "compact_three_paragraph_reply"
                  ? "Be om en kort bekräftelse på den nya tiden i samma tråd."
                  : "Be kunden återkomma i samma tråd om den uppdaterade tiden passar.",
              132
            )
          : "";
      }
      if (studioEditorInput) {
        if (studioEditorInput.value !== String(studioState?.draftBody || "")) {
          studioEditorInput.value = String(studioState?.draftBody || "");
        }
        studioEditorInput.disabled =
          state.runtime.authRequired || (!isComposeMode && (!thread || isOfflineHistoryReply));
      }
      if (studioEditorWordCount) {
        studioEditorWordCount.textContent = `${countWords(studioState?.draftBody || "")} ord`;
      }
      if (studioEditorSummary) {
        const senderLabel =
          composeMailboxLabel ||
          studioTruthState?.sourceMailboxLabel ||
          selectedSenderLabel ||
          "Valt mejlkonto";
        const nextStepLabel = isComposeMode
          ? "Skicka mejl"
          : compactRuntimeCopy(
              thread?.nextActionLabel || thread?.recommendedActionLabel,
              "Skicka svar",
              48
            );
        const replySummaryParts = [`Från: ${senderLabel}`, `Signatur: ${signatureProfile.label}`];
        if (hasBookingUpdateStudioContext) {
          const completionSummaryLabel = hasStudioBookingClosingSequence(studioState)
            ? getStudioBookingCompletionLabel(studioState).replace(
                /^Redo att skicka ·\s*/i,
                "Läge: "
              )
            : "";
          replySummaryParts.unshift(
            completionSummaryLabel ||
              bookingStudioSummaryLabel ||
              "Läge: Uppdaterat bokningsförslag"
          );
          replySummaryParts.push(getStudioBookingUpdateWorkModeLabel(studioState));
          if (bookingStudioDeltaLabel) {
            replySummaryParts.push(`Ändrat: ${bookingStudioDeltaLabel}`);
          }
          replySummaryParts.push(
            getStudioRecommendedBookingCtaLabel(studioState).replace(
              /^Avsluta nu ·\s*/i,
              "Avslut: "
            )
          );
        }
        if (normalizeText(nextStepLabel)) {
          replySummaryParts.push(`Nästa steg: ${nextStepLabel}`);
        }
        studioEditorSummary.textContent = isComposeMode
          ? replySummaryParts.join(" · ")
          : isOfflineHistoryReply
            ? `Offline historik · läsläge · ${thread.customerName} · ${thread.mailboxLabel}`
            : thread
              ? replySummaryParts.join(" · ")
              : state.runtime.authRequired
                ? "Logga in igen för att läsa studioförslag."
                : "Välj en tråd för att ladda studiokontext.";
      }
      if (studioPolicyPill) {
        studioPolicyPill.textContent = isOfflineHistoryReply
          ? "Offline läsläge"
          : isComposeMode && hasBookingUpdateStudioContext
            ? "Bokning uppdaterad"
            : isTruthDrivenStudio
              ? "Truth guardrail aktiv"
              : policy.label;
      }

      renderStudioSelection(
        studioTemplateButtons,
        studioState?.activeTemplateKey || "",
        "studioTemplate"
      );
      renderStudioSelection(
        renderedStudioSignatureButtons,
        studioState?.selectedSignatureId || "",
        "studioSignature"
      );
      renderStudioSelection(studioTrackButtons, studioState?.activeTrackKey || "", "studioTrack");
      renderStudioSelection(studioToneButtons, studioState?.activeToneKey || "", "studioTone");
      renderStudioSelection(
        studioRefineButtons,
        studioState?.activeRefineKey || "",
        "studioRefine"
      );
      studioToneButtons.forEach((button) => {
        const toneKey = normalizeKey(button.dataset.studioTone);
        const isRecommended = hasBookingUpdateStudioContext && toneKey === recommendedToneKey;
        const baseLabel = asText(button.textContent, "Ton");
        button.classList.toggle("is-recommended", isRecommended);
        button.dataset.recommended = isRecommended ? "true" : "false";
        button.title = isRecommended ? `${baseLabel} · rekommenderat i detta läge` : baseLabel;
      });
      studioRefineButtons.forEach((button) => {
        const refineKey = normalizeKey(button.dataset.studioRefine);
        const isRecommended = hasBookingUpdateStudioContext && refineKey === recommendedRefineKey;
        const baseLabel = asText(button.textContent, "Finjustering");
        button.classList.toggle("is-recommended", isRecommended);
        button.dataset.recommended = isRecommended ? "true" : "false";
        button.title = isRecommended ? `${baseLabel} · rekommenderat i detta läge` : baseLabel;
      });
      const getInlineToolKey = (button) =>
        button?.hasAttribute("data-note-open") ? "note" : normalizeKey(button?.dataset?.studioTool);
      const regenerateButton = studioToolButtons.find(
        (button) => normalizeKey(button.dataset.studioTool) === "regenerate"
      );
      const editorToolsRow = studioInlineToolButtons[0]?.parentElement || null;
      if (editorToolsRow && recommendedToolOrder.length) {
        studioInlineToolButtons
          .slice()
          .sort((leftButton, rightButton) => {
            const leftKey = getInlineToolKey(leftButton);
            const rightKey = getInlineToolKey(rightButton);
            const leftIndex = recommendedToolOrder.indexOf(leftKey);
            const rightIndex = recommendedToolOrder.indexOf(rightKey);
            const leftRank = leftIndex === -1 ? recommendedToolOrder.length + 1 : leftIndex;
            const rightRank = rightIndex === -1 ? recommendedToolOrder.length + 1 : rightIndex;
            return leftRank - rightRank;
          })
          .forEach((button) => {
            editorToolsRow.appendChild(button);
          });
      }
      studioTemplateButtons.forEach((button) => {
        const templateKey = normalizeKey(button.dataset.studioTemplate);
        const isPromoted = hasBookingUpdateStudioContext && templateKey === recommendedTemplateKey;
        const baseLabel = asText(button.textContent, "Mall");
        button.classList.toggle("is-promoted", isPromoted);
        button.dataset.promoted = isPromoted ? "true" : "false";
        button.title = isPromoted ? `${baseLabel} · starta här i detta läge` : baseLabel;
      });
      studioInlineToolButtons.forEach((button) => {
        const toolKey = getInlineToolKey(button);
        const rank = recommendedToolOrder.indexOf(toolKey);
        const isPromotedPrimary = hasBookingUpdateStudioContext && rank === 0;
        const isPromotedSecondary = hasBookingUpdateStudioContext && rank === 1;
        const baseLabel = asText(
          button.getAttribute("aria-label") || button.dataset.studioTool || toolKey,
          "Verktyg"
        );
        const toolReason = hasBookingUpdateStudioContext
          ? asText(getStudioRecommendedToolReason(studioState, toolKey))
          : "";
        button.classList.toggle("is-promoted", isPromotedPrimary);
        button.classList.toggle("is-promoted-secondary", isPromotedSecondary);
        button.dataset.promoted = isPromotedPrimary ? "true" : "false";
        button.dataset.promotedRank = rank >= 0 ? String(rank) : "";
        if ((isPromotedPrimary || isPromotedSecondary) && normalizeText(toolReason)) {
          const promotedLead = asText(
            getStudioRecommendedToolLeadLabel(studioState, rank),
            isPromotedPrimary ? "Starta här." : "Nästa verktyg."
          );
          button.dataset.promotedTitle = `${baseLabel} · ${promotedLead} ${toolReason}`;
        } else {
          button.dataset.promotedTitle = "";
        }
        if (isPromotedPrimary && normalizeText(toolReason)) {
          button.title = button.dataset.promotedTitle;
        } else if (isPromotedSecondary && normalizeText(toolReason)) {
          button.title = button.dataset.promotedTitle;
        } else {
          button.title = baseLabel;
        }
      });
      if (regenerateButton) {
        regenerateButton.title = hasBookingUpdateStudioContext
          ? `${getStudioRecommendedBookingCtaLabel(studioState)} · regenerera med rätt avslut för detta läge. ${recommendedToolReason}`
          : "Bygg ett nytt utkast från aktuell kontext.";
      }

      const disableChoiceControls =
        (!thread && !isComposeMode) || state.runtime.authRequired || isOfflineHistoryReply;
      [
        ...studioTemplateButtons,
        ...studioTrackButtons,
        ...studioToneButtons,
        ...studioRefineButtons,
        ...studioToolButtons,
      ].forEach((button) => {
        button.disabled = disableChoiceControls;
        button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
      });
      const disableSignatureControls = disableChoiceControls || isTruthDrivenStudio;
      renderedStudioSignatureButtons.forEach((button) => {
        const buttonLabel = asText(button.textContent, "Signatur");
        button.disabled = disableSignatureControls;
        button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
        button.title = isTruthDrivenStudio
          ? `${buttonLabel} · låst av sanningsstyrd svarstudio`
          : buttonLabel;
      });
      studioInlineToolButtons.forEach((button) => {
        const buttonLabel = asText(
          button.getAttribute("aria-label") || button.dataset.studioTool,
          "Verktyg"
        );
        button.disabled = disableChoiceControls;
        button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
        button.title = isOfflineHistoryReply
          ? `${buttonLabel} · spärrad i läsläge`
          : asText(button.dataset.promotedTitle, buttonLabel);
      });
      Object.entries(studioContextTabs).forEach(([key, tab]) => {
        if (!tab) return;
        const count = Number(studioContextCounts[key] || 0);
        const label = asText(tab.textContent);
        tab.dataset.count = String(count);
        tab.dataset.empty = count > 0 ? "false" : "true";
        tab.title =
          count > 0
            ? `${label} · ${count} tillgängliga stödmarkörer`
            : `${label} · ingen extra kontext i nuvarande läge`;
      });
      normalizeStudioBusyState();
      if (studioPrimarySuggestion) {
        studioPrimarySuggestion.setAttribute(
          "aria-disabled",
          studioPrimarySuggestion.disabled ? "true" : "false"
        );
        studioPrimarySuggestion.title = isOfflineHistoryReply
          ? "Offline historik · aktiv tråd krävs för att använda förslaget"
          : asText(studioPrimarySuggestionLabel?.textContent, "Primärt förslag");
      }
      const defaultStudioFeedback = state.runtime.authRequired
        ? "Logga in igen i admin för att skicka, spara eller radera från svarsstudion."
        : isOfflineHistoryReply
          ? "Offline historik är läsläge. Svar, förhandsvisning, senare, klar, radera och anteckningar kräver aktiv tråd."
          : isTruthDrivenStudio
            ? `${studioTruthState.label || "Sanningsstyrd svarstudio"} · ${studioWaveLabel} · ${composeMailboxLabel || studioTruthState?.sourceMailboxLabel || "vald mailbox"} · svarskontext låst.`
            : "";
      setStudioFeedback(
        defaultStudioFeedback,
        state.runtime.authRequired || isOfflineHistoryReply
          ? "error"
          : defaultStudioFeedback
            ? "success"
            : ""
      );
    }

    function setContextCollapsed(collapsed) {
      const isCollapsed = workspaceSourceOfTruth.setContextCollapsed(collapsed);
      if (canvas) {
        canvas.classList.toggle("is-context-collapsed", isCollapsed);
      }
      contextButtons.forEach((button) => {
        button.textContent = isCollapsed ? "Visa kontext" : "Dölj kontext";
      });
    }

    function setStudioOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("studio", open);
      if (canvas) {
        canvas.classList.toggle("is-studio-open", isOpen);
      }
      if (!studioShell) return;
      studioShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      studioShell.style.opacity = isOpen ? "1" : "0";
      studioShell.style.pointerEvents = isOpen ? "auto" : "none";
      studioShell.style.visibility = isOpen ? "visible" : "hidden";
      studioShell.style.transform = isOpen ? "translateY(0)" : "translateY(16px)";
      if (isOpen) {
        renderStudioShell();
        const ensureBodyLoad =
          typeof runtimeThreadHistoryBodyRef?.ensureSelectedRuntimeThreadHistoryBody === "function"
            ? runtimeThreadHistoryBodyRef.ensureSelectedRuntimeThreadHistoryBody
            : null;
        if (ensureBodyLoad) {
          ensureBodyLoad().catch((error) => {
            console.warn("CCO kunde inte lazy-ladda bodyHtml när studion öppnades.", error);
          });
        }
      } else {
        setStudioFeedback("", "");
      }
    }

    function setNoteOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("note", open);
      if (canvas) {
        canvas.classList.toggle("is-note-open", isOpen);
      }
      if (!noteShell) return;
      noteShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      noteShell.style.opacity = isOpen ? "1" : "0";
      noteShell.style.pointerEvents = isOpen ? "auto" : "none";
      noteShell.style.visibility = isOpen ? "visible" : "hidden";
      noteShell.style.transform = isOpen ? "translateY(0)" : "translateY(14px)";
    }

    function renderFocusContextShell(payload = {}) {
      const label = asText(payload.label, "Kontext");
      const title = asText(payload.title, label);
      const body = asText(payload.body, "");
      const meta = asText(payload.meta, "");
      const items = asArray(payload.items)
        .map((item) => asText(item))
        .filter(Boolean);
      if (focusContextTitle) focusContextTitle.textContent = title;
      if (focusContextLabel) focusContextLabel.textContent = label;
      if (focusContextBody) focusContextBody.textContent = body;
      if (focusContextMeta) {
        if (meta) {
          focusContextMeta.textContent = meta;
          focusContextMeta.hidden = false;
        } else {
          focusContextMeta.textContent = "";
          focusContextMeta.hidden = true;
        }
      }
      if (focusContextItems) {
        if (items.length) {
          focusContextItems.innerHTML = items
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("");
          focusContextItems.hidden = false;
        } else {
          focusContextItems.innerHTML = "";
          focusContextItems.hidden = true;
        }
      }
    }

    function setFocusContextOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("focusContext", open);
      if (canvas) {
        canvas.classList.toggle("is-focus-context-open", isOpen);
      }
      if (!focusContextShell) return;
      focusContextShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      focusContextShell.style.opacity = isOpen ? "1" : "0";
      focusContextShell.style.pointerEvents = isOpen ? "auto" : "none";
      focusContextShell.style.visibility = isOpen ? "visible" : "hidden";
      focusContextShell.style.transform = isOpen ? "translateY(0)" : "translateY(14px)";
    }

    function openFocusContextPanel(payload = {}) {
      state.runtime = state.runtime || {};
      state.runtime.focusContextPayload = {
        label: asText(payload.label, "Kontext"),
        title: asText(payload.title, payload.label || "Kontext"),
        body: asText(payload.body, ""),
        meta: asText(payload.meta, ""),
        items: asArray(payload.items)
          .map((item) => asText(item))
          .filter(Boolean),
      };
      renderFocusContextShell(state.runtime.focusContextPayload);
      setFocusContextOpen(true);
    }

    function renderBookingShellChrome(payload = {}) {
      const title = asText(payload.title, "Bokningsarbete");
      const status = asText(payload.status, "Behöver triage");
      if (bookingShellTitle) bookingShellTitle.textContent = title;
      if (bookingShellStatus) bookingShellStatus.textContent = status;
    }

    function setBookingOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("booking", open);
      state.runtime = state.runtime || {};
      state.runtime.bookingShellOpen = isOpen;
      if (!isOpen) {
        state.runtime.bookingShellDismissed = true;
      }
      if (canvas) {
        canvas.classList.toggle("is-booking-open", isOpen);
      }
      if (!bookingShell) return;
      bookingShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      bookingShell.style.opacity = isOpen ? "1" : "0";
      bookingShell.style.pointerEvents = isOpen ? "auto" : "none";
      bookingShell.style.visibility = isOpen ? "visible" : "hidden";
      bookingShell.style.transform = isOpen ? "translateY(0)" : "translateY(14px)";
      const surface = document.querySelector("[data-booking-surface]");
      if (surface) {
        surface.hidden = !isOpen;
        surface.setAttribute("aria-hidden", isOpen ? "false" : "true");
      }
      const dock = document.querySelector("[data-booking-workspace-dock]");
      if (dock) {
        const unified = state.runtime?.bookingWorkrailUnified === true;
        const hideDock = isOpen || unified;
        dock.hidden = hideDock;
        dock.setAttribute("aria-hidden", hideDock ? "true" : "false");
      }
    }

    function openBookingPanel(payload = {}) {
      renderBookingShellChrome(payload);
      setBookingOpen(true);
    }

    function setScheduleOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("schedule", open);
      if (canvas) {
        canvas.classList.toggle("is-schedule-open", isOpen);
      }
      if (!scheduleShell) return;
      scheduleShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      scheduleShell.style.opacity = isOpen ? "1" : "0";
      scheduleShell.style.pointerEvents = isOpen ? "auto" : "none";
      scheduleShell.style.visibility = isOpen ? "visible" : "hidden";
      scheduleShell.style.transform = isOpen ? "translateY(0)" : "translateY(14px)";
    }

    function renderLaterOptions(activeKey = state.later.option) {
      state.later.option = normalizeKey(activeKey) || "one_hour";
      laterOptionButtons.forEach((button) => {
        const isActive = normalizeKey(button.dataset.laterOption) === state.later.option;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function renderLaterContext() {
      if (!laterContext) return;
      const bulkSelectionKeys = asArray(state.later.bulkSelectionKeys)
        .map((key) => normalizeKey(key))
        .filter(Boolean);
      const preferredThreadId = asText(state.later.contextThreadId);
      const selectedThread =
        (preferredThreadId ? getRuntimeThreadById(preferredThreadId) : null) ||
        (bulkSelectionKeys.length ? getRuntimeThreadById(bulkSelectionKeys[0]) : null) ||
        getSelectedRuntimeThread() ||
        null;

      if (!selectedThread) {
        laterContext.textContent =
          bulkSelectionKeys.length > 1
            ? `${bulkSelectionKeys.length} markerade trådar påverkas av senareläggningen.`
            : "Den valda tråden används för det här senareläggningsvalet.";
        laterContext.hidden = false;
        return;
      }

      const customerLabel = asText(
        selectedThread.customerName || selectedThread.customerLabel,
        "Vald kund"
      );
      const mailboxLabel = asText(
        selectedThread.mailboxLabel || selectedThread.mailboxesLabel,
        "Valt mejlkonto"
      );
      const subjectSummary = compactRuntimeCopy(
        asText(
          selectedThread.subject || selectedThread.preview || selectedThread.nextActionSummary,
          "Tråden väljs från aktiv arbetskö."
        ),
        "Tråden väljs från aktiv arbetskö.",
        92
      );

      laterContext.textContent =
        bulkSelectionKeys.length > 1
          ? `${bulkSelectionKeys.length} markerade trådar senareläggs från ${mailboxLabel}. Första tråd: ${customerLabel} · ${subjectSummary}`
          : `${customerLabel} · ${mailboxLabel} · ${subjectSummary}`;
      laterContext.hidden = false;
    }

    function setLaterOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("later", open);
      if (canvas) {
        canvas.classList.toggle("is-later-open", isOpen);
      }
      if (laterShell) {
        laterShell.setAttribute("aria-hidden", isOpen ? "false" : "true");
      }
    }

    function openLaterDialog(options = {}) {
      const hasExplicitBulkSelection = Object.prototype.hasOwnProperty.call(
        options,
        "bulkThreadIds"
      );
      const bulkThreadIds = asArray(hasExplicitBulkSelection ? options.bulkThreadIds : [])
        .map((key) => normalizeKey(key))
        .filter(Boolean);
      const selectedThread = getSelectedRuntimeThread();
      state.later.bulkSelectionKeys = bulkThreadIds;
      state.later.contextThreadId = asText(
        options.threadId ||
          bulkThreadIds[0] ||
          selectedThread?.id ||
          state.studio.replyContextThreadId ||
          state.studio.threadId
      );
      renderLaterContext();
      renderLaterOptions(state.later.option);
      setLaterOpen(true);
    }

    function getLaterOptionLabel(optionKey) {
      const normalizedKey = normalizeKey(optionKey);
      if (normalizedKey === "tomorrow_morning") return "Imorgon 09:00";
      if (normalizedKey === "monday_morning") return "Måndag 09:00";
      return "Om 1 timme";
    }

    function renderMailboxAdminList() {
      if (!mailboxAdminList) return;
      const rows = getAvailableRuntimeMailboxes().map((mailbox) => ({
        id: mailbox.id,
        name: mailbox.label,
        email: mailbox.email,
        owner: mailbox.owner || (mailbox.custom ? "Team" : "Live"),
        toneClass: mailbox.toneClass || "",
        signatureLabel: asText(mailbox.signature?.label),
        custom: mailbox.custom === true,
        hasLiveSource: mailbox.hasLiveSource === true,
        localSignatureLabel: asText(mailbox.localSignatureLabel),
        ownerCopy: asText(mailbox.ownerCopy),
        signatureCopy: asText(mailbox.signatureCopy),
        adminEditable: mailbox.adminEditable === true,
        adminRemovable: mailbox.adminRemovable === true,
        adminEditLabel: asText(mailbox.adminEditLabel, "Redigera"),
        adminRemoveLabel: asText(mailbox.adminRemoveLabel, "Ta bort"),
        showLivePill: mailbox.showLivePill === true,
      }));
      mailboxAdminList.innerHTML = "";
      rows.forEach((mailbox) => {
        const row = documentObject.createElement("div");
        const isEditing =
          normalizeKey(state.mailboxAdminEditingId || "") === normalizeKey(mailbox.id);
        const ownerCopy =
          mailbox.ownerCopy ||
          (mailbox.custom ? `Ägare: ${mailbox.owner}` : `Källa: ${mailbox.owner}`);
        const signatureCopy =
          mailbox.signatureCopy ||
          (mailbox.signatureLabel
            ? `${mailbox.hasLiveSource ? "Lokal signatur" : "Signatur"}: ${mailbox.signatureLabel}`
            : mailbox.custom
              ? "Ingen lokal signatur"
              : "Signatur: Liveprofil");
        const liveStatePill = mailbox.showLivePill
          ? '<span class="mailbox-admin-entry-pill mailbox-admin-entry-pill-live">Live</span>'
          : "";
        const localSignaturePill =
          mailbox.hasLiveSource && mailbox.localSignatureLabel
            ? '<span class="mailbox-admin-entry-pill mailbox-admin-entry-pill-local">Lokal signatur</span>'
            : "";
        row.className = `mailbox-admin-entry${isEditing ? " is-active" : ""}`;
        row.innerHTML = `<div class="mailbox-admin-entry-copy">
            <div class="mailbox-admin-entry-top">
              <div class="mailbox-admin-entry-identity">
                <span class="mailbox-admin-entry-tone ${escapeHtml(mailbox.toneClass)}" aria-hidden="true"></span>
                <div class="mailbox-admin-entry-headline">
                  <strong class="mailbox-admin-entry-name ${escapeHtml(mailbox.toneClass)}">${escapeHtml(mailbox.name)}</strong>
                  <span class="mailbox-admin-entry-email">${escapeHtml(mailbox.email || mailbox.owner)}</span>
                </div>
              </div>
              <div class="mailbox-admin-entry-actions">${
                mailbox.adminEditable
                  ? `<button class="customers-utility-button" type="button" data-mailbox-admin-edit="${escapeHtml(
                      mailbox.id
                    )}">${escapeHtml(mailbox.adminEditLabel)}</button>`
                  : ""
              }${
                mailbox.adminRemovable
                  ? `<button class="customers-utility-button" type="button" data-mailbox-admin-remove="${escapeHtml(
                      mailbox.id
                    )}">${escapeHtml(mailbox.adminRemoveLabel)}</button>`
                  : ""
              }</div>
            </div>
            <div class="mailbox-admin-entry-subline">
              <div class="mailbox-admin-entry-meta">
                <span class="mailbox-admin-entry-pill">${escapeHtml(ownerCopy)}</span>
                <span class="mailbox-admin-entry-pill mailbox-admin-entry-pill-signature">${escapeHtml(
                  signatureCopy
                )}</span>${localSignaturePill}${liveStatePill}
              </div>
            </div>
          </div>`;
        mailboxAdminList.append(row);
      });
    }

    function setMailboxAdminOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("mailboxAdmin", open);
      renderMailboxAdminList();
      setFloatingShellOpen(mailboxAdminShell, isOpen, 16);
      if (!isOpen) {
        setFeedback(mailboxAdminFeedback, "", "");
      }
    }

    function renderNoteModeOptions() {
      noteModeOptionButtons.forEach((button) => {
        const isActive = normalizeKey(button.dataset.noteModeOption) === state.noteMode.selected;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function setNoteModeOpen(open) {
      const isOpen = workspaceSourceOfTruth.setOverlayOpen("noteMode", open);
      renderNoteModeOptions();
      renderWorkspaceRuntimeContext();
      setFloatingShellOpen(noteModeShell, isOpen, 14);
    }

    function renderTags(tags) {
      if (!noteTagsRow) return;
      noteTagsRow.innerHTML = "";
      tags.forEach((tag) => {
        const chip = documentObject.createElement("button");
        chip.type = "button";
        chip.className = "note-tag-chip";
        chip.dataset.noteTag = tag;
        chip.title = `Ta bort tagg ${tag}`;
        chip.textContent = tag;
        noteTagsRow.appendChild(chip);
      });
    }

    function renderNoteDataCards(cards) {
      if (!noteDataStack) return;
      noteDataStack.innerHTML = "";
      cards.forEach((card) => {
        const article = documentObject.createElement("article");
        article.className = "note-data-card";

        const head = documentObject.createElement("div");
        head.className = "note-data-card-head";

        const label = documentObject.createElement("span");
        label.textContent = card.label;

        const meta = documentObject.createElement("small");
        meta.textContent = card.meta;

        const value = documentObject.createElement("p");
        value.textContent = card.value;

        head.append(label, meta);
        article.append(head, value);
        noteDataStack.appendChild(article);
      });
    }

    function renderLinkedItems(items) {
      if (!noteLinkedList) return;
      noteLinkedList.innerHTML = "";
      items.forEach((item) => {
        const row = documentObject.createElement("li");
        row.textContent = item;
        noteLinkedList.appendChild(row);
      });
    }

    function renderScheduleLinkedItems(items) {
      if (!scheduleLinkedList) return;
      scheduleLinkedList.innerHTML = "";
      items.forEach((item) => {
        const row = documentObject.createElement("li");
        row.textContent = item;
        scheduleLinkedList.appendChild(row);
      });
    }

    function syncNoteCount() {
      if (!noteText || !noteCount) return;
      noteCount.textContent = String(normalizeText(noteText.value).length);
    }

    function renderTemplateButtons() {
      templateButtons.forEach((button, index) => {
        const template = state.noteTemplates[index];
        if (!template) {
          button.hidden = true;
          button.disabled = true;
          return;
        }

        button.hidden = false;
        button.disabled = false;
        button.dataset.noteTemplate = template.key;
        button.textContent = template.label;
      });
    }

    function renderVisibilityOptionsForDestination(destinationKey, selectedLabel) {
      if (!noteVisibilitySelect) return;
      const allowedValues = state.noteVisibilityRules[normalizeKey(destinationKey)] || ["team"];
      const previousValue = selectedLabel || "Team";
      noteVisibilitySelect.innerHTML = "";
      allowedValues.forEach((value) => {
        const option = documentObject.createElement("option");
        option.value = mapVisibilityLabel(value);
        option.textContent = mapVisibilityLabel(value);
        noteVisibilitySelect.appendChild(option);
      });

      const normalizedSelected = mapVisibilityLabel(mapVisibilityValue(previousValue));
      if (allowedValues.map(mapVisibilityLabel).includes(normalizedSelected)) {
        noteVisibilitySelect.value = normalizedSelected;
        return;
      }

      noteVisibilitySelect.value = mapVisibilityLabel(allowedValues[0]);
    }

    function setActiveTemplate(activeKey = null) {
      templateButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.noteTemplate === activeKey);
      });
    }

    function createNoteDraft(definition = {}) {
      return {
        text: normalizeText(definition.text || definition.defaultText),
        tags: tagsFrom(definition.tags || definition.defaultTags),
        priority: mapPriorityLabel(definition.priority),
        visibility: mapVisibilityLabel(definition.visibility),
        templateKey: normalizeKey(definition.templateKey) || null,
      };
    }

    function createScheduleDraft(draft = {}) {
      return {
        customerName: normalizeText(draft.customerName),
        date: normalizeText(draft.date),
        time: normalizeText(draft.time),
        doctorName: normalizeText(draft.doctorName) || "Dr. Eriksson",
        category: normalizeText(draft.category) || "Ombokning",
        reminderLeadMinutes: Number(draft.reminderLeadMinutes) || 120,
        reminderLabel: normalizeText(draft.reminderLabel) || "2 timmar innan",
        notes: normalizeText(draft.notes) || "",
        metadata:
          draft.metadata && typeof draft.metadata === "object" && !Array.isArray(draft.metadata)
            ? { ...draft.metadata }
            : {},
        recommendations: draft.recommendations || {},
        linkedItems: Array.isArray(draft.linkedItems) ? [...draft.linkedItems] : [],
      };
    }

    function getRuntimeNoteContextSummary(thread) {
      if (!thread) {
        return state.runtime.authRequired
          ? "Logga in igen för att läsa aktiv kontext."
          : "Ingen aktiv tråd vald ännu.";
      }
      const subject = compactRuntimeCopy(thread.subject, "Aktiv konversation", 48);
      const nextAction = compactRuntimeCopy(
        thread.nextActionLabel || thread.nextActionSummary,
        "nästa steg",
        48
      );
      return `${thread.customerName} · ${subject} · fokus på ${nextAction.toLowerCase()}.`;
    }

    function getRuntimeConversationSignal(thread) {
      if (!thread) return "";
      const summary = [
        thread.customerName,
        normalizeText(thread.subject) || thread.intentLabel || "Aktiv tråd",
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" · ");
      return compactRuntimeCopy(summary, `${thread.customerName || "Vald kund"} · aktiv tråd`, 112);
    }

    function getRuntimeLinkedItems(thread, fallbackItems = []) {
      if (!thread) return Array.isArray(fallbackItems) ? [...fallbackItems] : [];
      const linkedItems = [
        normalizeText(thread.customerName) ? `Kund · ${thread.customerName}` : "",
        normalizeText(thread.subject)
          ? `Ärende · ${compactRuntimeCopy(thread.subject, thread.intentLabel || "Aktiv tråd", 72)}`
          : "",
        normalizeText(thread.mailboxLabel) ? `Mejlkonto · ${thread.mailboxLabel}` : "",
        normalizeText(thread.ownerLabel) ? `Ansvar · ${thread.ownerLabel}` : "",
        normalizeText(thread.followUpLabel || thread.nextActionLabel)
          ? `Nästa steg · ${thread.followUpLabel || thread.nextActionLabel}`
          : "",
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean);
      return linkedItems.length
        ? linkedItems
        : Array.isArray(fallbackItems)
          ? [...fallbackItems]
          : [];
    }

    function buildRuntimeNoteCards(thread, destinationKey, fallbackCards = []) {
      if (!thread) return Array.isArray(fallbackCards) ? [...fallbackCards] : [];
      const destination = normalizeKey(destinationKey);
      const raw = thread.raw && typeof thread.raw === "object" ? thread.raw : {};
      const mailboxOwnerSummary = [thread.mailboxLabel, thread.ownerLabel]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(" · ");
      const cards = [
        {
          label: "Kund och tråd",
          value: getRuntimeConversationSignal(thread),
          meta: mailboxOwnerSummary || "Nuvarande arbetsyta",
        },
        {
          label: "Vad ärendet gäller",
          value: thread.intentLabel || humanizeCode(raw.intent, "Oklart"),
          meta: "Tolkad från aktiv tråd",
        },
        {
          label: "Nästa steg",
          value: compactRuntimeCopy(
            thread.nextActionSummary || thread.nextActionLabel,
            "Granska tråden och svara tydligt.",
            120
          ),
          meta: "Operativ signal",
        },
        {
          label: "Mailbox och ansvar",
          value: `${thread.mailboxLabel} · ${thread.ownerLabel}`,
          meta: "Arbetsyta",
        },
      ];

      if (destination === "medicinsk") {
        cards[1] = {
          label: "Medicinsk signal",
          value: compactRuntimeCopy(
            raw.medicalContext || raw.riskStackExplanation || thread.riskReason,
            "Ingen särskild medicinsk signal registrerad.",
            120
          ),
          meta: "Medicinsk kontext",
        };
      } else if (destination === "betalning") {
        cards[1] = {
          label: "Betalningssignal",
          value: compactRuntimeCopy(
            raw.paymentContext || raw.customerSummary?.lastCaseSummary || thread.whyInFocus,
            "Ingen särskild betalningssignal registrerad.",
            120
          ),
          meta: "Kundsignal",
        };
      } else if (destination === "sla") {
        cards[1] = {
          label: "SLA-status",
          value: humanizeCode(raw.slaStatus, "Stabil"),
          meta: "Live signal",
        };
        cards[2] = {
          label: "Riskbild",
          value: compactRuntimeCopy(thread.riskReason, thread.riskLabel, 120),
          meta: "Risksignal",
        };
      } else if (destination === "uppfoljning") {
        cards[0] = {
          label: "Föreslagen uppföljning",
          value: thread.followUpLabel || "Ingen planerad uppföljning ännu",
          meta: "Live signal",
        };
        cards[1] = {
          label: "Kategori",
          value: normalizeText(raw.intent)
            ? humanizeCode(raw.intent, "Uppföljning")
            : "Uppföljning",
          meta: "Kundkontext",
        };
        cards[2] = {
          label: "Åtgärd",
          value: compactRuntimeCopy(
            thread.nextActionSummary,
            "Schemalägg nästa tydliga steg för kunden.",
            120
          ),
          meta: "Föreslaget nästa steg",
        };
      }

      return cards;
    }

    function buildRuntimeNoteDefinition(definition = {}, destinationKey) {
      const thread = getSelectedRuntimeThread();
      const destination = normalizeKey(destinationKey);
      if (!thread) {
        const target =
          normalizeText(definition.targetLabel) || humanizeCode(destinationKey, "Anteckning");
        return {
          ...definition,
          targetLabel: target,
          livePreview: state.runtime.authRequired
            ? "Logga in igen för att läsa aktiv kontext."
            : `${target} · välj en aktiv tråd för att aktivera anteckningen`,
          defaultText: state.runtime.authRequired
            ? "Logga in igen för att läsa aktiv kontext innan du skriver anteckningen."
            : `Välj en aktiv tråd i arbetskön innan du skapar en anteckning i ${target.toLowerCase()}.`,
          dataCards: [],
          linkedItems: [],
        };
      }
      const threadSummary = compactRuntimeCopy(
        thread.nextActionSummary || thread.whyInFocus,
        "Granska tråden och ta nästa tydliga steg.",
        180
      );
      const destinationPrefix =
        destination === "medicinsk"
          ? "Medicinsk kontext"
          : destination === "betalning"
            ? "Betalningskontext"
            : destination === "sla"
              ? "SLA / eskalering"
              : destination === "uppfoljning"
                ? "Uppföljning"
                : destination === "kundprofil"
                  ? "Kundprofil"
                  : "Konversation";
      return {
        ...definition,
        livePreview:
          destination === "medicinsk"
            ? `Medicinsk journal · ${thread.customerName} · ${thread.mailboxLabel}`
            : destination === "betalning"
              ? `Ekonomispår · ${thread.customerName} · ${thread.mailboxLabel}`
              : destination === "sla"
                ? `SLA-system · ${thread.statusLabel} · ${thread.mailboxLabel}`
                : destination === "uppfoljning"
                  ? `Uppföljningskö · ${thread.followUpLabel || thread.nextActionLabel}`
                  : `${destinationPrefix} · ${thread.customerName} · ${thread.subject}`,
        defaultText:
          normalizeText(definition.defaultText) || `${destinationPrefix}: ${threadSummary}`,
        dataCards: buildRuntimeNoteCards(thread, destination, definition.dataCards || []),
        linkedItems: getRuntimeLinkedItems(thread, definition.linkedItems || []),
      };
    }

    function buildRuntimeScheduleDraft(baseDraft = {}) {
      const baseMetadata =
        baseDraft.metadata &&
        typeof baseDraft.metadata === "object" &&
        !Array.isArray(baseDraft.metadata)
          ? baseDraft.metadata
          : {};
      const isBookingDraft =
        normalizeKey(baseDraft.category) === "bokning" ||
        normalizeKey(baseMetadata.bookingFollowUpSource) === "booking_surface";
      const bookingThread =
        isBookingDraft && typeof getScheduleBookingThread === "function"
          ? getScheduleBookingThread()
          : null;
      const thread = bookingThread || getSelectedRuntimeThread();
      const draft = createScheduleDraft(baseDraft);
      if (!thread) {
        return {
          ...draft,
          customerName: "",
          date: "",
          time: "",
          notes: state.runtime.authRequired
            ? "Logga in igen för att läsa aktiv kontext innan du schemalägger uppföljning."
            : "",
          recommendations: {
            preferredDay: "",
            timeWindow: "",
            doctorName: draft.doctorName,
            avgReplyHours: "",
          },
          linkedItems: [],
        };
      }
      const raw = thread.raw && typeof thread.raw === "object" ? thread.raw : {};
      const category =
        normalizeText(baseDraft.category) ||
        (normalizeKey(raw.intent) === "booking"
          ? "Konsultation"
          : normalizeKey(raw.intent) === "follow_up"
            ? "Uppföljning"
            : "Ombokning");
      const runtimeLinkedItems = getRuntimeLinkedItems(thread, []);
      const draftLinkedItems = asArray(baseDraft.linkedItems || draft.linkedItems || [])
        .map((item) => normalizeText(item))
        .filter(Boolean);
      const linkedItems = isBookingDraft
        ? [...runtimeLinkedItems, ...draftLinkedItems].filter(
            (item, index, items) => items.indexOf(item) === index
          )
        : getRuntimeLinkedItems(thread, draftLinkedItems);
      return {
        ...draft,
        customerName: thread.customerName,
        doctorName:
          normalizeText(baseDraft.doctorName) || normalizeText(raw.doctorName) || draft.doctorName,
        category,
        notes:
          normalizeText(baseDraft.notes) ||
          `${thread.nextActionLabel}: ${compactRuntimeCopy(
            thread.nextActionSummary || thread.whyInFocus,
            "Ta nästa tydliga steg i tråden.",
            160
          )}`,
        recommendations: {
          preferredDay:
            normalizeText(baseDraft.recommendations?.preferredDay) ||
            normalizeText(raw.preferredDayLabel) ||
            "Närmaste tillgängliga dag",
          timeWindow:
            normalizeText(baseDraft.recommendations?.timeWindow) ||
            normalizeText(raw.preferredWindowLabel) ||
            thread.followUpLabel ||
            "09:00-12:00",
          doctorName:
            normalizeText(baseDraft.recommendations?.doctorName) ||
            normalizeText(raw.doctorName) ||
            draft.doctorName,
          avgReplyHours:
            normalizeText(baseDraft.recommendations?.avgReplyHours) ||
            normalizeText(raw.avgReplyHours) ||
            "2h",
        },
        linkedItems,
      };
    }

    function renderWorkspaceRuntimeContext() {
      const thread = getSelectedRuntimeThread();
      if (noteModeContext) {
        noteModeContext.textContent = getRuntimeNoteContextSummary(thread);
      }
      if (scheduleCustomerPill) {
        scheduleCustomerPill.textContent = thread?.customerName || "Ingen aktiv tråd vald";
      }
      if (scheduleCategoryPill) {
        scheduleCategoryPill.textContent =
          thread?.followUpLabel || thread?.nextActionLabel || "Ingen aktiv tråd vald";
      }
    }

    function buildDynamicNoteModePreset(optionKey) {
      const thread = getSelectedRuntimeThread();
      const normalizedOption = normalizeKey(optionKey);
      const fallback = NOTE_MODE_PRESETS[normalizedOption] || NOTE_MODE_PRESETS.manual;
      if (!thread) {
        if (normalizedOption === "manual") {
          return {
            templateKey: null,
            text: "",
            tags: ["Manuell"],
          };
        }
        return {
          templateKey: null,
          text: state.runtime.authRequired
            ? "Logga in igen för att läsa aktiv kontext innan AI-läget används."
            : "Välj en aktiv tråd i arbetskön innan du använder AI-läget.",
          tags: ["AI", "Väntar på aktiv tråd"],
        };
      }
      if (normalizedOption === "ai-summary") {
        return {
          templateKey: null,
          text: `AI-sammanfattning:\n- Kund: ${thread.customerName}\n- Nu i: ${thread.statusLabel}\n- Nästa steg: ${thread.nextActionLabel}\n- Fokus: ${compactRuntimeCopy(thread.whyInFocus, "Ingen fokusmotivering.", 96)}`,
          tags: ["AI", "Sammanfattning", thread.intentLabel || "Signal"],
        };
      }
      if (normalizedOption === "ai-extract") {
        return {
          templateKey: null,
          text: `Extraherade detaljer:\n- Mailbox: ${thread.mailboxLabel}\n- Ägare: ${thread.ownerLabel}\n- Väntar på: ${thread.waitingLabel}\n- Uppföljning: ${thread.followUpLabel || "Ingen planerad"}`,
          tags: ["AI", "Detaljer", thread.mailboxLabel],
        };
      }
      if (normalizedOption === "ai-action-items") {
        return {
          templateKey: null,
          text: `Åtgärdspunkter:\n1. ${thread.nextActionLabel}.\n2. ${compactRuntimeCopy(thread.nextActionSummary, "Ta nästa tydliga steg i tråden.", 72)}\n3. ${thread.followUpLabel ? `Säkra uppföljning: ${thread.followUpLabel}.` : "Schemalägg uppföljning om kunden inte svarar."}`,
          tags: ["AI", "Åtgärder", thread.followUpLabel ? "Uppföljning" : "Nästa steg"],
        };
      }
      return fallback;
    }

    function renderNoteDestination(key) {
      const destinationKey = normalizeKey(key);
      const baseDefinition = state.noteDefinitions[destinationKey];
      if (!baseDefinition) return;
      const definition = buildRuntimeNoteDefinition(baseDefinition, destinationKey);
      const thread = getSelectedRuntimeThread();

      state.note.activeKey = destinationKey;
      let draft = state.note.drafts[destinationKey] || createNoteDraft(definition);
      if (!thread) {
        draft = createNoteDraft(definition);
        state.note.drafts[destinationKey] = draft;
      } else {
        state.note.drafts[destinationKey] = draft;
      }
      const normalizedBaseDefault = normalizeText(baseDefinition.defaultText);
      if (!normalizeText(draft.text) || normalizeText(draft.text) === normalizedBaseDefault) {
        draft.text = normalizeText(definition.defaultText);
      }

      destinationButtons.forEach((button) => {
        const isActive = button.dataset.noteKey === destinationKey;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

      if (targetLabel) {
        targetLabel.textContent = definition.targetLabel;
      }

      if (noteLivePreview) {
        noteLivePreview.textContent = definition.livePreview;
      }

      if (noteText) {
        noteText.value = draft.text;
      }

      if (notePrioritySelect) {
        notePrioritySelect.value = mapPriorityLabel(draft.priority);
      }

      renderVisibilityOptionsForDestination(destinationKey, draft.visibility);
      draft.priority = notePrioritySelect ? notePrioritySelect.value : draft.priority;
      draft.visibility = noteVisibilitySelect ? noteVisibilitySelect.value : draft.visibility;
      renderNoteDataCards(definition.dataCards || []);
      renderLinkedItems(definition.linkedItems || []);
      renderTags(draft.tags);
      setActiveTemplate(draft.templateKey);
      syncNoteCount();
    }

    function hydrateScheduleSelect(select, values, selectedValue) {
      if (!select) return;
      select.innerHTML = "";
      values.forEach((value) => {
        const option = documentObject.createElement("option");
        option.value = value;
        option.textContent = value;
        option.selected = value === selectedValue;
        select.appendChild(option);
      });
      if (selectedValue && values.includes(selectedValue)) {
        select.value = selectedValue;
      }
    }

    function renderScheduleDraft() {
      const draft = buildRuntimeScheduleDraft(state.schedule.draft);
      const options = state.schedule.options;
      const thread = getSelectedRuntimeThread();
      if (!draft || !options) return;
      renderWorkspaceRuntimeContext();

      if (scheduleCustomerInput) scheduleCustomerInput.value = draft.customerName;
      if (scheduleDateInput) scheduleDateInput.value = draft.date;
      if (scheduleTimeInput) scheduleTimeInput.value = draft.time;
      if (scheduleNotesTextarea) scheduleNotesTextarea.value = draft.notes;

      hydrateScheduleSelect(scheduleDoctorSelect, options.doctors || [], draft.doctorName);
      hydrateScheduleSelect(scheduleCategorySelect, options.categories || [], draft.category);
      hydrateScheduleSelect(
        scheduleReminderSelect,
        (options.reminders || []).map((item) => item.label),
        draft.reminderLabel
      );

      if (scheduleDateHint) {
        scheduleDateHint.textContent = thread ? "Nästa fredag" : "Välj aktiv tråd för datumförslag";
      }
      if (scheduleTimeHint) {
        scheduleTimeHint.textContent = thread
          ? "Baserat på preferenser"
          : "Välj aktiv tråd för tidsfönster";
      }
      if (scheduleDoctorHint) {
        scheduleDoctorHint.textContent = thread
          ? "Kundpreferens"
          : "Välj aktiv tråd för behandlare";
      }
      if (scheduleCategoryHint) {
        scheduleCategoryHint.textContent = thread ? "Från kontext" : "Välj aktiv tråd för kategori";
      }
      if (scheduleReminderHint) {
        scheduleReminderHint.textContent = thread
          ? "Baserat på kundbeteende"
          : "Aktiveras med aktiv kontext";
      }
      if (scheduleNotesHint) {
        scheduleNotesHint.textContent = thread
          ? "Auto-genererat från behandlingsserie"
          : "Lägg till aktiv kontext för att förifylla noteringar";
      }

      const recommendations = draft.recommendations || {};
      scheduleRecommendationCards.forEach((card) => {
        const key = card.dataset.scheduleRec;
        const strong = card.querySelector("strong");
        if (!strong) return;
        if (key === "preferredDay") {
          strong.textContent =
            recommendations.preferredDay || (thread ? "Fredag" : "Välj aktiv tråd");
        }
        if (key === "timeWindow") {
          strong.textContent =
            recommendations.timeWindow || (thread ? "09:00-12:00" : "Välj aktiv tråd");
        }
        if (key === "doctorName") {
          strong.textContent = recommendations.doctorName || "Dr. Eriksson";
        }
        if (key === "avgReplyHours") {
          strong.textContent =
            recommendations.avgReplyHours || (thread ? "2.5h" : "Live-data krävs");
        }
      });

      renderScheduleLinkedItems(draft.linkedItems || []);
    }

    function applyNoteModePreset(optionKey) {
      const normalizedKey = normalizeKey(optionKey) || "manual";
      state.noteMode.selected = normalizedKey;
      const activeKey = state.noteDefinitions[state.note.activeKey]
        ? state.note.activeKey
        : Object.keys(state.noteDefinitions)[0] || state.note.activeKey;
      const definition = state.noteDefinitions[activeKey];
      if (definition && normalizedKey !== "manual") {
        const preset = buildDynamicNoteModePreset(normalizedKey);
        const draft = state.note.drafts[activeKey] || createNoteDraft(definition);
        draft.text = preset.text;
        draft.tags = tagsFrom(preset.tags);
        draft.templateKey = preset.templateKey;
        state.note.drafts[activeKey] = draft;
        renderNoteDestination(activeKey);
        setFeedback(noteFeedback, "success", "Anteckningen förifylldes från valt AI-läge.");
      } else {
        setFeedback(noteFeedback, "", "");
      }
      setNoteModeOpen(false);
      setNoteOpen(true);
    }

    return Object.freeze({
      applyNoteModePreset,
      applyStudioMode,
      buildRuntimeScheduleDraft,
      createNoteDraft,
      createScheduleDraft,
      getLaterOptionLabel,
      normalizeStudioBusyState,
      openLaterDialog,
      renderLaterOptions,
      renderLaterContext,
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
      openFocusContextPanel,
      renderFocusContextShell,
      setFocusContextOpen,
      openBookingPanel,
      renderBookingShellChrome,
      setBookingOpen,
      setScheduleOpen,
      setStudioOpen,
      syncNoteCount,
    });
  }

  window.MajorArcanaPreviewOverlayRenderers = Object.freeze({
    createOverlayRenderers,
  });
})();
