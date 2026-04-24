(() => {
  function createQueueRenderers({
    dom = {},
    helpers = {},
    state,
    windowObject = window,
  }) {
    const {
      laterMetricValueNodes = {},
      sentMetricValueNodes = {},
      mailboxMenuGrid,
      mailboxTriggerLabel,
      mailFeedBulkButtons = [],
      mailFeedDensityButtons = [],
      mailFeedFilterButtons = [],
      mailFeedLists = [],
      mailFeedSelectAllButtons = [],
      mailFeedSelectionCountNodes = [],
      mailFeedUndoButtons = [],
      mailFeedViewButtons = [],
      ownerMenuGrid,
      ownerMenuNote,
      ownerMenuToggle,
      ownerTriggerLabel,
      queueActiveLaneLabel,
      queueCollapsedList,
      queueContent,
      queueFeedCountNodes = [],
      queueHistoryCount,
      queueHistoryList,
      queueHistoryLoadMoreButton,
      queueHistoryPanel,
      queueHistoryToggle,
      queueQuickLaneStrip,
      queueLaneButtons = [],
      queueLaneCountNodes = [],
      queueSecondarySignalCountNodes = [],
      queueMailboxScopeCount,
      queueMailboxScopeLabel,
      queuePrimaryLaneTag,
      queueSummaryActNow,
      queueSummaryFocus,
      queueSummaryRisk,
      queueSummarySprint,
      queueTitle,
      queueViewJumpButtons = [],
      threadContextRows = [],
    } = dom;

    const {
      MAIL_FEEDS = {},
      QUEUE_LANE_LABELS = {},
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
      getSelectedRuntimeThread = () => null,
      hasRuntimeQueueThreads,
      isHandledRuntimeThread,
      isLaterRuntimeThread,
      isSentRuntimeThread,
      normalizeKey,
      normalizeMailboxId,
      runtimeConversationIdsMatch,
      threadContextDefinitions = {},
      toIso,
    } = helpers;

    function setQueueContextVisibility(visible) {
      const documentObject = windowObject.document;
      if (!documentObject) return;
      documentObject.querySelectorAll("[data-thread-context]").forEach((row) => {
        row.hidden = !visible;
      });
    }

    function appendThreadContextChips(row, items = []) {
      row.innerHTML = "";
      items.forEach((item) => {
        const chip = document.createElement("span");
        chip.className = `thread-context-chip thread-context-chip--${item.tone}`;
        const icon = createPillIcon(item.icon);
        if (icon) chip.appendChild(icon);
        chip.appendChild(document.createTextNode(item.value));
        row.appendChild(chip);
      });
    }

    function renderSelectedThreadInlineControls() {
      if (!queueContent) return;
      const inlineContextRow = queueContent.querySelector("[data-thread-context-inline]");
      const inlineActionRow = queueContent.querySelector("[data-thread-actions-inline]");
      if (inlineContextRow) inlineContextRow.innerHTML = "";
      if (inlineActionRow) inlineActionRow.innerHTML = "";
    }

    function renderThreadContextRows() {
      const runtimeThread = getSelectedRuntimeThread();
      const runtimeMode = normalizeKey(state.runtime.mode || "");
      if (state.runtime.live && runtimeThread) {
        setQueueContextVisibility(false);
        threadContextRows.forEach((row) => {
          row.innerHTML = "";
        });
        renderSelectedThreadInlineControls(runtimeThread);
        return;
      }

      if (
        (state.runtime.loading ||
          state.runtime.live ||
          state.runtime.authRequired ||
          runtimeMode === "offline_history" ||
          state.runtime.error) &&
        !runtimeThread
      ) {
        setQueueContextVisibility(false);
        threadContextRows.forEach((row) => {
          row.innerHTML = "";
        });
        renderSelectedThreadInlineControls(null);
        return;
      }

      setQueueContextVisibility(true);
      threadContextRows.forEach((row) => {
        const key = normalizeKey(row.dataset.threadKey);
        const definition = threadContextDefinitions[key];
        if (!definition) {
          row.innerHTML = "";
          return;
        }

        appendThreadContextChips(row, [
          { tone: "mailbox", value: definition.mailbox, icon: "mail" },
          { tone: "intent", value: definition.intent, icon: "question" },
          { tone: "deadline", value: definition.deadline, icon: "clock" },
        ]);
      });
      renderSelectedThreadInlineControls(null);
    }

    function buildQueuePillMarkup(label, tone, iconKey) {
      const classes =
        tone === "green"
          ? "chip chip-green"
          : tone === "blue"
            ? "chip chip-blue"
            : tone === "rose"
              ? "chip chip-rose"
              : tone === "violet"
                ? "chip chip-violet"
                : tone === "coral"
                  ? "chip chip-coral"
                  : tone === "amber"
                    ? "chip chip-amber"
                    : tone === "urgent"
                      ? "chip chip-urgent chip-urgent-deep"
          : "chip chip-neutral";
      return `<span class="${classes}" data-pill-icon="${escapeHtml(
        iconKey
      )}"><span class="chip-label">${escapeHtml(label)}</span></span>`;
    }

    function buildUnifiedQueueLoadingItems() {
      return [
        {
          id: "runtime-loading-1",
          avatar: typeof buildAvatarDataUri === "function" ? buildAvatarDataUri("CCO") : "",
          customerName: "Synkar live-kö",
          lastActivityAt: "",
          lastActivityLabel: "Pågår",
          ownerLabel: "System",
          displayOwnerLabel: "System",
          displaySubject: "Hämtar mejl i valt mailboxscope",
          subject: "Hämtar mejl i valt mailboxscope",
          preview: "Vänta några sekunder medan vänsterkolumnen fylls med live-mejl.",
          mailboxLabel: "Live",
          intentLabel: "Synkar",
          statusLabel: "Synkar",
          nextActionLabel: "Vänta",
          nextActionSummary: "Vänta några sekunder medan vänsterkolumnen fylls med live-mejl.",
          tags: ["all"],
        },
        {
          id: "runtime-loading-2",
          avatar: typeof buildAvatarDataUri === "function" ? buildAvatarDataUri("CCO") : "",
          customerName: "Förbereder arbetsyta",
          lastActivityAt: "",
          lastActivityLabel: "Nu",
          ownerLabel: "System",
          displayOwnerLabel: "System",
          displaySubject: "Scope och prioritering uppdateras",
          subject: "Scope och prioritering uppdateras",
          preview: "Tidigare trådval rensas innan den nya mailboxvyn öppnas.",
          mailboxLabel: "Live",
          intentLabel: "Synkar",
          statusLabel: "Förbereder",
          nextActionLabel: "Vänta",
          nextActionSummary: "Tidigare trådval rensas innan den nya mailboxvyn öppnas.",
          tags: ["all"],
        },
      ];
    }

    function buildRuntimeThreadCardPresentation(thread, selected) {
      const tags = asArray(thread.tags);
      const normalizeCardValue = (value) => String(value || "").trim().toLowerCase();
      const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const buildThreadSignalIconMarkup = (iconKey) => {
        if (typeof createPillIcon !== "function") return "";
        const iconNode = createPillIcon(iconKey);
        if (!iconNode) return "";
        if (typeof iconNode === "string") return iconNode;
        if (typeof iconNode.outerHTML === "string") return iconNode.outerHTML;
        return "";
      };
      const normalizedCustomerName = String(thread.customerName || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const genericCustomerName = [
        "okand_avsandare",
        "okand_kund",
        "unknown",
        "unknown_customer",
        "unknown_sender",
      ].includes(normalizedCustomerName);
      const subjectFallback =
        !genericCustomerName && thread.customerName
          ? `Konversation med ${thread.customerName}`
          : thread.mailboxLabel
            ? `Nytt inkommande mejl i ${thread.mailboxLabel}`
            : "Nytt inkommande mejl";
      const selectedClass = selected ? " thread-card-selected" : "";
      const crossMailboxEvidenceMode = thread.crossMailboxProvenanceEvidence === true;
      const priorityClass = tags.includes("act-now")
        ? " thread-card-act-now"
        : tags.includes("high-risk")
          ? " thread-card-high-risk"
          : "";
      const nextStepCopy = compactRuntimeCopy(thread.nextActionSummary || thread.systemHint, "", 110);
      const rawSubjectText = asText(thread.displaySubject || thread.subject).trim();
      const subjectCopy = compactRuntimeCopy(
        rawSubjectText,
        subjectFallback,
        92
      );
      const customerCopy = compactRuntimeCopy(thread.customerName, "Okänd avsändare", 42);
      const duplicatedSenderPrefixPattern = customerCopy
        ? new RegExp(`^${escapeRegExp(customerCopy).replace(/\s+/g, "\\s+")}[\\s:|,\\-–—]*`, "i")
        : null;
      const subjectContextRaw = rawSubjectText
        ? rawSubjectText.replace(duplicatedSenderPrefixPattern || /^$/, "").trim()
        : "";
      const subjectContextCopy =
        subjectContextRaw &&
        normalizeCardValue(subjectContextRaw) !== normalizeCardValue(customerCopy)
          ? compactRuntimeCopy(subjectContextRaw, "", 54)
          : "";
      const stripRepeatedLead = (value = "", leads = []) => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        asArray(leads)
          .map((lead) => asText(lead).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .forEach((lead) => {
            const leadPattern = new RegExp(`^${escapeRegExp(lead)}(?:\\s*[-:|,–—]\\s*|\\s+)`, "i");
            cleaned = cleaned.replace(leadPattern, "").trim();
          });
        return cleaned;
      };
      const extractPreviewTextFromHtml = (value = "") =>
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
      const sanitizeMailPreview = (value = "") => {
        let cleaned = stripRepeatedLead(extractPreviewTextFromHtml(value), [
          customerCopy,
          rawSubjectText,
          subjectCopy,
        ]);
        if (customerCopy) {
          cleaned = cleaned.replace(
            new RegExp(`^Från:\\s*${escapeRegExp(customerCopy)}\\s*`, "i"),
            ""
          );
        }
        cleaned = cleaned.replace(/^Från:\s*/i, "").trim();
        while (/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i.test(cleaned)) {
          cleaned = cleaned.replace(
            /^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i,
            ""
          ).trim();
        }
        cleaned = cleaned
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
        return compactRuntimeCopy(cleaned, "", 104);
      };
      const fallbackSnippet = "Ingen senaste kundsignal ännu.";
      const placeholderPreviewCopies = [
        fallbackSnippet,
        "Ingen förhandsvisning tillgänglig.",
        "Ingen förhandsvisning tillgänglig",
        "Ingen ytterligare information tillgänglig.",
        "Ingen ytterligare information tillgänglig",
      ].map((value) => normalizeCardValue(value));
      const previewLooksGeneric = (rawValue = "", cleanedValue = "") => {
        const normalizedRawPreview = normalizeCardValue(rawValue);
        const normalizedPreviewCopy = normalizeCardValue(cleanedValue);
        const previewLooksOperationalStatus =
          normalizedRawPreview.includes(normalizeCardValue("Unread inbound")) ||
          normalizedRawPreview.includes(normalizeCardValue("needs reply")) ||
          normalizedRawPreview.includes(normalizeCardValue("mailbox truth i wave"));
        const previewLooksProviderNoise =
          /^\s*du\s+f[åa]r\s+inte\s+ofta\s+e-post/i.test(cleanedValue) ||
          /^\s*you\s+don['’]t\s+often\s+get\s+email/i.test(cleanedValue) ||
          /^\s*power up your productivity with microsoft 365/i.test(cleanedValue) ||
          /^\s*get more done with apps like word/i.test(cleanedValue) ||
          /^\s*l[aä]s om varf[oö]r det h[aä]r [aä]r viktigt/i.test(cleanedValue);
        return (
          !normalizedPreviewCopy ||
          previewLooksOperationalStatus ||
          previewLooksProviderNoise ||
          placeholderPreviewCopies.includes(normalizedRawPreview) ||
          placeholderPreviewCopies.includes(normalizedPreviewCopy) ||
          normalizedPreviewCopy === normalizeCardValue(subjectCopy) ||
          normalizedPreviewCopy === normalizeCardValue(subjectContextCopy) ||
          normalizedPreviewCopy === normalizeCardValue(customerCopy)
        );
      };
      const previewMessages = asArray(thread.messages);
      const collectThreadMessagePreviewCandidates = (message = null) => {
        if (!message || typeof message !== "object") return [];
        return [
          message?.presentation?.previewText,
          message?.presentation?.conversationText,
          message?.primaryBody?.text,
        ].filter((candidate) => asText(candidate).trim());
      };
      const foundationThreadMessages =
        asArray(thread.threadDocument?.messages).length > 0
          ? asArray(thread.threadDocument?.messages)
          : asArray(thread.raw?.threadDocument?.messages);
      const preferredFoundationMessage =
        foundationThreadMessages.find((message) => {
          return (
            normalizeKey(message?.role) === "customer" &&
            collectThreadMessagePreviewCandidates(message).length > 0
          );
        }) ||
        foundationThreadMessages.find(
          (message) => collectThreadMessagePreviewCandidates(message).length > 0
        ) ||
        null;
      const latestCustomerMessage =
        previewMessages.find((entry) => normalizeKey(entry?.role) === "customer") ||
        previewMessages[0] ||
        null;
      const foundationState =
        thread.foundationState && typeof thread.foundationState === "object"
          ? thread.foundationState
          : null;
      const foundationMode =
        foundationState ||
        preferredFoundationMessage ||
        thread.mailThreadMessage ||
        thread.mailDocument ||
        thread.raw?.mailThreadMessage ||
        thread.raw?.mailDocument
          ? "foundation"
          : "legacy_fallback";
      const foundationSource =
        asText(foundationState?.source) ||
        (foundationMode === "foundation" ? "mail_foundation" : "legacy_preview_fallback");
      const previewCandidates = [
        ...collectThreadMessagePreviewCandidates(preferredFoundationMessage),
        ...collectThreadMessagePreviewCandidates(thread.mailThreadMessage),
        thread.mailDocument?.previewText,
        thread.mailDocument?.primaryBodyText,
        ...collectThreadMessagePreviewCandidates(thread.raw?.mailThreadMessage),
        thread.raw?.mailDocument?.previewText,
        thread.raw?.mailDocument?.primaryBodyText,
        thread.preview,
        thread.systemPreview,
        thread.raw?.latestInboundPreview,
        thread.raw?.preview,
        thread.raw?.systemPreview,
        thread.raw?.latestPreview,
        thread.raw?.bodyPreview,
        thread.raw?.detail,
        thread.raw?.summary,
        thread.raw?.latestMessage?.preview,
        thread.raw?.latestMessage?.bodyPreview,
        thread.raw?.latestMessage?.bodyHtml,
        thread.raw?.latestMessage?.body,
        thread.raw?.latestMessage?.detail,
        thread.raw?.latestMessage?.summary,
        thread.raw?.conversation?.preview,
        thread.raw?.conversation?.bodyPreview,
        thread.raw?.conversation?.bodyHtml,
        thread.raw?.conversation?.detail,
        thread.raw?.conversation?.summary,
        thread.raw?.bodyHtml,
        thread.raw?.customerSummary?.lastCaseSummary,
        latestCustomerMessage?.body,
        latestCustomerMessage?.bodyPreview,
      ];
      let previewCopy = "";
      for (const candidate of previewCandidates) {
        const candidateRaw = asText(candidate).replace(/\s+/g, " ").trim();
        if (!candidateRaw) continue;
        const candidatePreview = sanitizeMailPreview(candidateRaw);
        if (previewLooksGeneric(candidateRaw, candidatePreview)) continue;
        previewCopy = candidatePreview;
        break;
      }
      const hasUnread = thread.unread === true || thread.isUnread === true;
      const unreadIndicatorMarkup = hasUnread
        ? crossMailboxEvidenceMode
          ? ""
          : '<span class="thread-unread-indicator" aria-label="Oläst mejl"></span>'
        : "";
      const signalLaneId = normalizeKey(thread.primaryLaneId || "");
      const mailboxSignalValue = compactRuntimeCopy(
        asText(thread.mailboxLabel || thread.mailboxAddress || thread.mailboxesLabel),
        "",
        20
      );
      const whatSignalValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalWhat(thread, signalLaneId) || subjectContextCopy),
        "",
        18
      );
      const whySignalValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalWhy(thread, signalLaneId)),
        "",
        18
      );
      const nextSignalValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalNext(thread, signalLaneId) || nextStepCopy),
        "",
        18
      );
      const smartNextDetail = buildThreadSmartSummary(thread);
      const parseTrailDetailLive = (detail = "") =>
        asText(detail)
          .split(/[·,]/g)
          .map((part) => asText(part).trim())
          .filter(Boolean);
      const mailboxTrailFromPayload = asArray(thread.mailboxTrail)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      const mailboxTrailFromRollup = asArray(thread.rollup?.underlyingMailboxIds)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      const mailboxTrailFromDetail = parseTrailDetailLive(thread.mailboxProvenanceDetail || "");
      const mailboxTrail = mailboxTrailFromPayload.length
        ? mailboxTrailFromPayload
        : mailboxTrailFromRollup.length
          ? mailboxTrailFromRollup
          : mailboxTrailFromDetail;
      const deriveLiveInitials = (label = "") => {
        const normalizedLabel = asText(label).trim().replace(/\s+/g, " ");
        if (!normalizedLabel) return "?";
        const parts = normalizedLabel
          .split(" ")
          .map((part) => asText(part).trim())
          .filter(Boolean);
        if (!parts.length) return "?";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
      };
      const avatarInitials = asText(thread.initials) || deriveLiveInitials(customerCopy);
      const resolvedNextChipValue =
        (tags.includes("act-now") ||
          tags.includes("high-risk") ||
          signalLaneId === "act_now") &&
        smartNextDetail
          ? smartNextDetail
          : nextSignalValue;
      const rowFamily = normalizeCardValue(
        thread.rowFamily || thread.raw?.rowFamily || "human_mail"
      );
      const isCompactSystemRow =
        rowFamily === "booking_system_mail" || rowFamily === "notification/system_notice";
      const displaySubjectContextCopy = isCompactSystemRow ? "" : subjectContextCopy;
      const displayStoryCopy = (() => {
        if (!isCompactSystemRow) return previewCopy;
        const compactSystemContextCopy = compactRuntimeCopy(
          subjectContextRaw || subjectCopy,
          "",
          rowFamily === "booking_system_mail" ? 76 : 72
        );
        return compactRuntimeCopy(
          previewCopy || compactSystemContextCopy,
          compactSystemContextCopy,
          rowFamily === "booking_system_mail" ? 88 : 80
        );
      })();
      const intelligenceItems = [
        { key: "Mailbox", value: mailboxSignalValue, tone: "mailbox", icon: "mail", role: "mailbox" },
        {
          key: "Gäller",
          value: whatSignalValue,
          tone: "what",
          icon: "layers",
          role: "what",
        },
        {
          key: "Nu",
          value: whySignalValue,
          tone: "why",
          icon: "clock",
          role: "why",
        },
        {
          key: "Nästa",
          value: resolvedNextChipValue,
          tone: "next",
          icon: "bolt",
          role: "next",
        },
      ].filter((item) => item.value);
      const intelligenceMarkup = intelligenceItems.length
        ? `<div class="thread-intelligence-row">
             ${intelligenceItems
               .map((item) => {
                 const iconMarkup = buildThreadSignalIconMarkup(item.icon);
                 const isNextAction = normalizeKey(item.role) === "next";
                 const tagName = isNextAction ? "button" : "span";
                 const actionAttributes = isNextAction
                   ? ` type="button" data-runtime-studio-open data-runtime-studio-thread-id="${escapeHtml(
                       thread.id
                     )}" aria-controls="studio-shell" aria-label="Öppna svarsstudion för ${escapeHtml(
                       thread.customerName || "vald tråd"
                     )}"`
                   : "";
                 return `<${tagName} class="thread-intelligence-item thread-intelligence-item--${escapeHtml(
                   item.tone
                 )}"${actionAttributes}>
                   <span class="thread-intelligence-item-head">
                     ${
                       iconMarkup
                         ? `<span class="thread-intelligence-item-icon">${iconMarkup}</span>`
                         : ""
                     }
                   </span>
                   <span class="thread-intelligence-item-value">${escapeHtml(item.value)}</span>
                 </${tagName}>`;
               })
               .join("")}
           </div>`
        : "";
      const storyMarkup = displayStoryCopy
        ? `<p class="thread-story thread-story-inline">${escapeHtml(displayStoryCopy)}</p>`
        : "";
      const supportMarkup = intelligenceMarkup
        ? `<div class="thread-support-stack${
            selected ? " thread-support-stack-selected" : ""
          }">
            ${intelligenceMarkup}
            ${
              asText(thread.mailboxProvenanceLabel)
                ? (() => {
                    const provenanceDetail = asText(thread.mailboxProvenanceDetail);
                    const provenanceCopy = crossMailboxEvidenceMode
                      ? provenanceDetail
                      : `${thread.mailboxProvenanceLabel}${
                          provenanceDetail ? ` · ${provenanceDetail}` : ""
                        }`;
                    return provenanceCopy
                      ? `<div class="intel-card-provenance thread-card-provenance">
                    <span class="intel-card-provenance-label intel-card-provenance-derived">Mailboxspår</span>
                    <p class="intel-card-provenance-detail">${escapeHtml(provenanceCopy)}</p>
                  </div>`
                      : "";
                  })()
                : ""
            }
          </div>`
        : "";
      const crossMailboxClass = crossMailboxEvidenceMode ? " thread-card-cross-mailbox" : "";
      return {
        intelligenceMarkup,
        storyMarkup,
        supportMarkup,
        selectedClass,
        crossMailboxClass,
        priorityClass,
        crossMailboxEvidenceMode,
        customerCopy,
        displaySubjectContextCopy,
        displayStoryCopy,
        unreadIndicatorMarkup,
        rowFamily,
        foundationMode,
        foundationSource,
        thread,
        selected,
        mailboxTrail,
        avatarInitials,
        signalLaneId,
        mailboxSignalValue,
        whatSignalValue,
        whySignalValue,
        nextSignalValue: resolvedNextChipValue,
        tags,
      };
    }

    function buildThreadCardMarkup(thread, index, selected) {
      const p = buildRuntimeThreadCardPresentation(thread, selected);
      const relationshipChipValue =
        p.mailboxTrail.length > 1 ? "Samma kund har skrivit från flera mailboxar" : "";
      const footerChips = [
        {
          key: "category",
          value: asText(p.mailboxSignalValue, "Kons"),
          icon: "mail",
          toneClass: "chip-gray",
        },
        {
          key: "relationship",
          value: relationshipChipValue,
          icon: "users",
          toneClass: "chip-blue",
        },
        {
          key: "priority",
          value: asText(p.whySignalValue),
          icon: "alert",
          toneClass: "chip-pink",
        },
        {
          key: "action",
          value: asText(p.nextSignalValue),
          icon: "chevron-right",
          toneClass: "chip-green",
          interactive: "studio-open",
          runtimeThreadId: p.thread.id,
          studioAriaLabel: `Öppna svarsstudion för ${asText(p.thread.customerName || "vald tråd")}`,
        },
      ].filter((chip) => asText(chip.value));
      const extraArticleClasses = `${p.crossMailboxClass}${p.priorityClass} thread-card-live`.trim();
      const articleDataAttributes = ` data-row-family="${escapeHtml(p.rowFamily)}" data-foundation-mode="${escapeHtml(p.foundationMode)}" data-foundation-source="${escapeHtml(p.foundationSource)}"`;
      const worklistSourceKey =
        typeof normalizeKey === "function"
          ? normalizeKey(p.thread.worklistSource || "legacy") || "legacy"
          : asText(p.thread.worklistSource || "legacy")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_") || "legacy";
      const unifiedModel = {
        counterpartyLabel: p.customerCopy,
        customerInitials: p.avatarInitials,
        mailboxTrail: p.mailboxTrail,
        laneId: p.thread.primaryLaneId,
        ownerLabel: p.thread.displayOwnerLabel || p.thread.ownerLabel,
        tags: p.tags,
        signalItems: asArray(p.thread.signalItems),
        previewLine: p.displayStoryCopy,
        footerChips,
        hasOperationalSignals: false,
        isUnread: p.thread.unread === true || p.thread.isUnread === true,
        time: p.thread.lastActivityLabel,
        recordedAt: p.thread.lastActivityAt,
        stampLabel: asText(
          p.thread.displayOwnerLabel || p.thread.ownerLabel || "Ej tilldelad"
        ),
        extraArticleClasses,
        worklistSource: worklistSourceKey,
      };
      const unifiedOptions = {
        runtimeThreadId: p.thread.id,
        conversationId: p.thread.id,
        selectedConversationId: asText(state.runtime.selectedThreadId),
        worklistSource: worklistSourceKey,
        articleDataAttributes,
        skipNormalizeCardContent: false,
      };
      return buildUnifiedCardMarkup(unifiedModel, unifiedOptions);
    }

    /**
     * @deprecated Use buildUnifiedCardMarkup instead.
     * Kept temporarily during migration. Delete after 2026-05-01
     * if no regression found.
     */
    function buildThreadCardMarkup_legacy(thread, index, selected) {
      const p = buildRuntimeThreadCardPresentation(thread, selected);
      return `<article class="thread-card thread-card-live${p.crossMailboxClass}${p.selectedClass}${p.priorityClass}" data-runtime-thread="${escapeHtml(p.thread.id)}" data-worklist-source="${escapeHtml(p.thread.worklistSource || "legacy")}" data-row-family="${escapeHtml(p.rowFamily)}" data-foundation-mode="${escapeHtml(p.foundationMode)}" data-foundation-source="${escapeHtml(p.foundationSource)}">
        <div class="thread-card-head">
          <div class="thread-card-identity">
            <img class="avatar" src="${p.thread.avatar}" alt="${escapeHtml(p.thread.customerName)}" />
            <div class="thread-card-head-copy">
              <div class="thread-heading thread-heading-merged">
                ${p.unreadIndicatorMarkup}
                <p class="thread-subject">
                  <span class="thread-subject-primary">${escapeHtml(p.customerCopy)}</span>
                  ${
                    p.displaySubjectContextCopy
                      ? `<span class="thread-subject-context">${escapeHtml(
                          p.displaySubjectContextCopy
                        )}</span>`
                      : ""
                  }
                </p>
              </div>
              ${p.storyMarkup}
            </div>
          </div>
          <div class="thread-card-stamp">
            <div class="thread-card-stamp-top">
              <time datetime="${escapeHtml(p.thread.lastActivityAt || "")}">${escapeHtml(
                p.thread.lastActivityLabel
              )}</time>
            </div>
            <span class="thread-owner">${escapeHtml(p.thread.displayOwnerLabel || p.thread.ownerLabel || "Ej tilldelad")}</span>
          </div>
        </div>
        ${p.supportMarkup}
      </article>`;
    }

    function buildThreadSmartSummary(thread = {}) {
      const normalizeCompareText = (value = "") =>
        String(value || "")
          .trim()
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const stripRepeatedLead = (value = "", leads = []) => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        asArray(leads)
          .map((lead) => asText(lead).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .forEach((lead) => {
            const escapedLead = lead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const leadPattern = new RegExp(
              `^${escapedLead}(?:\\s*[-:|,–—]\\s*|\\s+)`,
              "i"
            );
            cleaned = cleaned.replace(leadPattern, "").trim();
          });
        return cleaned;
      };
      const sanitizeSummary = (value = "") => {
        let cleaned = asText(value)
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
        cleaned = stripRepeatedLead(cleaned, [
          thread?.customerName,
          thread?.displaySubject,
          thread?.subject,
          thread?.mailboxLabel,
        ]);
        cleaned = cleaned.replace(/^Från:\s*/i, "").trim();
        while (/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i.test(cleaned)) {
          cleaned = cleaned.replace(
            /^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i,
            ""
          ).trim();
        }
        cleaned = cleaned
          .replace(/^hur kan vi hjälpa dig med\s+/i, "Vill ha hjälp med ")
          .replace(/^hur kan jag få hjälp med\s+/i, "Vill ha hjälp med ")
          .replace(/^kan ni hjälpa mig med\s+/i, "Vill ha hjälp med ")
          .replace(/^hur kan vi hjälpa dig\??\s*/i, "")
          .replace(/^hur kan jag få hjälp\??\s*/i, "")
          .replace(/^kan ni hjälpa mig\??\s*/i, "")
          .replace(/^(?:hej|hello|hi)\b[,!:\-\s]*/i, "")
          .replace(/^jag vill\s+/i, "Vill ")
          .replace(/^jag behöver\s+/i, "Behöver ")
          .replace(/^vi vill\s+/i, "Vill ")
          .replace(/^skulle vilja\s+/i, "Vill ")
          .replace(/^\s*[–—-]\s*/, "")
          .trim();
        return compactRuntimeCopy(cleaned, "", 88);
      };
      const buildCompactOperationalPhrase = (value = "") => {
        const cleaned = sanitizeSummary(value);
        const normalized = normalizeCompareText(cleaned);
        if (!normalized) return "";
        if (/\bqa|fixture|verify|verification|kontrollerad|live send|inspect|sandbox\b/.test(normalized)) {
          return "Ge instruktion";
        }
        if (/\bfinasterid\b/.test(normalized)) return "Finasteridfråga";
        if (/\bpris|kostnad|prisbild\b/.test(normalized)) return "Klargör pris";
        if (/\bbild|bilder|foto|foton\b/.test(normalized)) return "Be om bilder";
        if (/\bbilaga|underlag|dokument\b/.test(normalized)) return "Granska bilaga";
        if (/\bbokning|boka|ombok|tid|datum\b/.test(normalized)) return "Klargör bokning";
        if (/\bmottaget|bekrafta.*underlag|bekrafta.*mottaget\b/.test(normalized))
          return "Bekräfta underlag";
        if (/\bsaknad|uppgift|komplettera|komplettering\b/.test(normalized))
          return "Be om uppgift";
        if (/\bf[öo]lj upp|uteblivet svar|inv[äa]nta svar\b/.test(normalized))
          return "Följ upp";
        if (/\bmedicinsk|medicin|behandling|prp\b/.test(normalized))
          return "Medicinsk fråga";
        if (/\binstruktion|n[äa]sta steg|tydligt besked\b/.test(normalized))
          return "Ge instruktion";
        if (/\bbes[öo]k\b/.test(normalized)) return "Svar före besök";
        const stopWords = new Set([
          "och",
          "att",
          "det",
          "som",
          "for",
          "att",
          "med",
          "om",
          "till",
          "pa",
          "av",
          "en",
          "ett",
          "den",
          "detta",
          "nasta",
          "steg",
          "kunden",
          "trad",
          "oppena",
          "oppna",
          "svara",
        ]);
        const phrase = cleaned
          .split(/\s+/)
          .map((part) => part.replace(/^[^A-Za-zÅÄÖåäö0-9]+|[^A-Za-zÅÄÖåäö0-9]+$/g, ""))
          .filter(Boolean)
          .filter((part) => part.length <= 18)
          .filter((part) => !/\bqa|fixture|verify|verification|kontrollerad|sandbox\b/i.test(part))
          .filter((part) => !stopWords.has(normalizeCompareText(part)))
          .slice(0, 3)
          .join(" ");
        return compactRuntimeCopy(phrase, "", 32);
      };
      const isGenericSummary = (value = "") => {
        const normalized = normalizeCompareText(value);
        if (!normalized) return true;
        return [
          "oppna traden",
          "oppna traden och ta nasta tydliga steg",
          "granska traden",
          "granska senaste aktivitet",
          "ta nasta tydliga steg",
          "ta nasta tydliga steg i samma trad",
          "svara kunden",
          "svara kunden och hall nasta steg tydligt",
          "svara kunden och ta nasta tydliga steg",
          "truth driven rad svara kunden via worklisten",
          "truth driven rad kontrollera senaste aktivitet",
          "truth preview",
          "unread inbound",
          "unread inbound and",
          "needs reply",
          "reply required",
          "aktiv konversation kraver uppfoljning",
          "folj kundens plan for nasta steg",
          "ingen forhandsvisning tillganglig",
        ].some((genericValue) => normalized === genericValue || normalized.includes(genericValue));
      };
      const normalizedNextLabel = normalizeCompareText(thread?.nextActionLabel);
      const chooseSpecificSummary = (candidates = []) =>
        candidates
          .map((candidate) => sanitizeSummary(candidate))
          .find((candidate) => {
            const normalizedCandidate = normalizeCompareText(candidate);
            return (
              normalizedCandidate &&
              normalizedCandidate !== normalizedNextLabel &&
              !isGenericSummary(candidate)
            );
          }) || "";

      const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
      const actionSummary = buildCompactOperationalPhrase(
        chooseSpecificSummary([
          raw?.latestOutcome?.recommendedAction,
          raw?.latestAction?.nextActionSummary,
          raw?.latestReplyDraft?.nextActionSummary,
          raw?.customerSummary?.historySignalActionCue,
          thread?.nextActionSummary,
        ])
      );
      if (actionSummary) return actionSummary;

      return buildCompactOperationalPhrase(
        chooseSpecificSummary([
          raw?.latestInboundPreview,
          raw?.latestMessage?.preview,
          raw?.latestMessage?.bodyPreview,
          raw?.customerSummary?.lastCaseSummary,
          thread?.preview,
          thread?.whyInFocus,
          raw?.riskStackExplanation,
          raw?.operatorCue,
        ])
      );
    }

    function buildThreadIntelAuditMarkup(thread = {}) {
      return "";
    }

    function getQueueHistoryItemInitials(label) {
      const source = asText(label).trim();
      if (!source) return "?";
      const parts = source
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 2);
      if (!parts.length) {
        return source.slice(0, 1).toUpperCase();
      }
      return parts
        .map((part) => part.slice(0, 1).toUpperCase())
        .join("")
        .slice(0, 2);
    }

    function getQueueInlineLaneSignalWhat(thread = {}, laneId = "") {
      const normalizedLaneId = normalizeKey(laneId);
      const intentLabel = asText(thread?.intentLabel);
      const normalizedIntent = normalizeKey(intentLabel);
      const intentDisplayMap = {
        pricing_question: "Prisfråga",
        price_question: "Prisfråga",
        pricing: "Prisfråga",
        prisfraga: "Prisfråga",
        booking_request: "Bokning",
        booking: "Bokning",
        bokning: "Bokning",
        consultation: "Konsultation",
        consult: "Konsultation",
        consultation_request: "Konsultation",
        contact_form: "Kontaktformulär",
        contactformular: "Kontaktformulär",
        contact_formular: "Kontaktformulär",
        kontaktformular: "Kontaktformulär",
        complaint: "Klagomål",
        klagomal: "Klagomål",
        cancellation: "Avbokning",
        cancel: "Avbokning",
        avbokning: "Avbokning",
        follow_up: "Uppföljning",
        uppfoljning: "Uppföljning",
        review: "Granskning",
        admin: "Administrativt",
        administrative: "Administrativt",
        medical: "Medicinsk fråga",
        medical_question: "Medicinsk fråga",
        medicinsk_fraga: "Medicinsk fråga",
      };
      if (intentDisplayMap[normalizedIntent]) {
        return intentDisplayMap[normalizedIntent];
      }
      if (normalizedIntent && normalizedIntent !== "oklart" && normalizedIntent !== "unclear") {
        return compactRuntimeCopy(intentLabel, "", 18);
      }
      if (normalizedLaneId === "medical") return "Medicinsk fråga";
      if (normalizedLaneId === "bookable") return "Bokning";
      if (normalizedLaneId === "review") return "Granskning";
      if (normalizedLaneId === "admin") return "Administrativt";
      return "";
    }

    function getQueueInlineLaneSignalWhy(thread = {}, laneId = "") {
      const normalizedLaneId = normalizeKey(laneId);
      const followUpAgeLabel = asText(thread?.followUpAgeLabel);
      const followUpLabel = asText(thread?.followUpLabel);
      const statusLabel = asText(thread?.statusLabel);
      const normalizedStatusLabel = normalizeKey(statusLabel);
      const nextActionLabel = asText(thread?.nextActionLabel);
      const whyInFocus = asText(thread?.whyInFocus);
      const normalizedWhy = normalizeKey(whyInFocus);
      if (normalizedLaneId === "act_now") return "Svar krävs nu";
      if (normalizedLaneId === "review") return "Behöver granskning";
      if (normalizedLaneId === "medical") return "Medicinsk bedömning";
      if (normalizedLaneId === "bookable") return "Tid kan erbjudas";
      if (normalizedLaneId === "later") {
        if (followUpAgeLabel) return followUpAgeLabel;
        return followUpLabel
          ? compactRuntimeCopy(`Följ upp ${followUpLabel}`, "Väntar på kund", 32)
          : "Väntar på kund";
      }
      if (typeof isSentRuntimeThread === "function" && isSentRuntimeThread(thread)) {
        if (followUpAgeLabel) return followUpAgeLabel;
        return followUpLabel
          ? compactRuntimeCopy(`Följ upp ${followUpLabel}`, "Väntar på svar", 32)
          : asText(thread?.waitingLabel, "Väntar på svar");
      }
      if (followUpAgeLabel) return followUpAgeLabel;
      if (asArray(thread?.tags).includes("high-risk")) {
        return normalizeKey(thread?.riskLabel) === "miss"
          ? "Miss-risk"
          : asText(thread?.riskLabel, "Hög risk");
      }
      if (followUpLabel) {
        return compactRuntimeCopy(`Följ upp ${followUpLabel}`, "Uppföljning väntar", 32);
      }
      const normalizedRiskLabel = normalizeKey(thread?.riskLabel);
      if (
        normalizedStatusLabel &&
        ["behover_svar", "svar_kravs", "needs_reply", "reply_needed"].includes(
          normalizedStatusLabel
        )
      ) {
        return "Svar krävs nu";
      }
      if (normalizedStatusLabel.includes("gransk")) {
        return "Behöver granskning";
      }
      if (normalizedWhy.includes("obesvar")) return "Svar krävs nu";
      if (normalizedWhy.includes("needs_reply")) return "Svar krävs nu";
      if (normalizedWhy.includes("behover_svar")) return "Svar krävs nu";
      if (normalizedWhy.includes("gransk")) return "Behöver granskning";
      if (normalizedWhy.includes("medicin")) return "Medicinsk bedömning";
      if (normalizedWhy.includes("erbjud") || normalizedWhy.includes("tid_kan")) {
        return "Tid kan erbjudas";
      }
      if (normalizedWhy.includes("uppfolj")) return "Uppföljning väntar";
      if (normalizedWhy.includes("miss")) return "Miss-risk";
      if (
        normalizedRiskLabel &&
        !["miss", "neutral", "tone", "follow_up", "relationship", "bevaka"].includes(
          normalizedRiskLabel
        )
      ) {
        return asText(thread?.riskLabel);
      }
      if (statusLabel && normalizeKey(statusLabel) !== normalizeKey(nextActionLabel)) {
        return compactRuntimeCopy(statusLabel, "Behöver uppmärksamhet", 18);
      }
      return "Behöver uppmärksamhet";
    }

    function getQueueInlineLaneSignalNext(thread = {}, laneId = "") {
      const normalizedLaneId = normalizeKey(laneId);
      const nextActionLabel = asText(thread?.nextActionLabel);
      if (nextActionLabel) return nextActionLabel;
      if (normalizedLaneId === "bookable") return "Erbjud tid";
      if (normalizedLaneId === "review") return "Granska tråden";
      if (normalizedLaneId === "medical") return "Läs medicinskt";
      if (normalizedLaneId === "act_now") return "Svara nu";
      return compactRuntimeCopy(thread?.nextActionSummary, "Granska tråden", 32);
    }

    function getQueueHistoryMailboxMeta(item = {}) {
      const mailboxValue = asText(item.mailboxAddress || item.mailboxLabel);
      const normalizedMailboxId = normalizeMailboxId(mailboxValue);
      const availableMailboxes =
        typeof getAvailableRuntimeMailboxes === "function" ? asArray(getAvailableRuntimeMailboxes()) : [];
      const mailboxToneMap = {
        consult: "queue-filter-chip--violet",
        kons: "queue-filter-chip--violet",
        contact: "queue-filter-chip--cyan",
        info: "queue-filter-chip--green",
        fazli: "queue-filter-chip--purple",
        egzona: "queue-filter-chip--rose",
        receipt: "queue-filter-chip--amber",
        kvitto: "queue-filter-chip--amber",
        market: "queue-filter-chip--coral",
        marknad: "queue-filter-chip--coral",
      };
      const mailboxTokens = new Set(
        [
          normalizedMailboxId,
          normalizeMailboxId(asText(mailboxValue).split("@")[0]),
          normalizeMailboxId(item.mailboxLabel),
        ].filter(Boolean)
      );
      const matchedMailbox = availableMailboxes.find((mailbox) => {
        const candidateTokens = new Set(
          [
            normalizeMailboxId(mailbox?.canonicalId),
            normalizeMailboxId(mailbox?.id),
            normalizeMailboxId(mailbox?.email),
            normalizeMailboxId(asText(mailbox?.email).split("@")[0]),
            normalizeMailboxId(mailbox?.label),
          ].filter(Boolean)
        );
        return Array.from(mailboxTokens).some((token) => candidateTokens.has(token));
      });
      const toneKey =
        normalizeKey(asText(matchedMailbox?.toneClass).replace("mailbox-option-", "")) ||
        Array.from(mailboxTokens).find((token) => mailboxToneMap[token]) ||
        "";
      return {
        icon: "mail",
        toneClass: mailboxToneMap[toneKey] || "queue-filter-chip--slate",
      };
    }

    function getQueueHistorySignalIcon(signalRole = "") {
      if (signalRole === "mailbox") return "mail";
      if (signalRole === "category" || signalRole === "what") return "layers";
      if (signalRole === "status" || signalRole === "why") return "clock";
      if (signalRole === "action" || signalRole === "next") return "bolt";
      if (signalRole === "context" || signalRole === "source") return "link";
      return "info";
    }

    function getQueueHistoryDirectionMeta(direction = "") {
      const normalizedDirection = normalizeKey(direction);
      if (normalizedDirection === "skickat") {
        return {
          icon: "send",
          toneClass: "queue-filter-chip--indigo",
        };
      }
      if (normalizedDirection === "mottaget") {
        return {
          icon: "mail",
          toneClass: "queue-filter-chip--cyan",
        };
      }
      return {
        icon: "mail",
        toneClass: "queue-filter-chip--slate",
      };
    }

    function getQueueHistoryQueueMeta() {
      return {
        icon: "layers",
        toneClass: "queue-filter-chip--slate",
      };
    }

    function buildQueueInlineLaneSignalItems(thread = {}) {
      const laneId = normalizeKey(thread?.primaryLaneId || "");
      const whatValue = compactRuntimeCopy(asText(getQueueInlineLaneSignalWhat(thread, laneId)), "", 20);
      const whyValue = compactRuntimeCopy(asText(getQueueInlineLaneSignalWhy(thread, laneId)), "", 18);
      const nextValue = compactRuntimeCopy(asText(getQueueInlineLaneSignalNext(thread, laneId)), "", 18);
      const mailboxValue = compactRuntimeCopy(
        asText(thread?.mailboxLabel || thread?.mailboxAddress),
        "",
        18
      );
      const contextValue = compactRuntimeCopy(
        asText(thread?.mailboxProvenanceLabel || thread?.worklistSourceLabel),
        "",
        22
      );
      const normalizeSignalValue = (value) =>
        asText(value)
          .trim()
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      const normalizedWhyValue = normalizeSignalValue(whyValue);
      const normalizedNextValue = normalizeSignalValue(nextValue);
      const normalizedWhatValue = normalizeSignalValue(whatValue);
      const normalizedTitleValue = normalizeSignalValue(asText(thread?.displaySubject || thread?.subject));
      const normalizedPreviewValue = normalizeSignalValue(asText(thread?.preview));
      const shouldRenderWhat =
        Boolean(whatValue) &&
        !(
          normalizedWhatValue &&
          (normalizedTitleValue.includes(normalizedWhatValue) ||
            normalizedPreviewValue.includes(normalizedWhatValue))
        );
      const shouldRenderWhy =
        Boolean(whyValue) &&
        !["behover_atgard", "behover_uppmarksamhet"].includes(normalizedWhyValue) &&
        normalizedWhyValue !== normalizedNextValue;
      const signalItems = [
        mailboxValue
          ? {
              key: "Mailbox",
              value: mailboxValue,
              tone: "mailbox",
              role: "mailbox",
            }
          : null,
        shouldRenderWhat
          ? {
              key: "Kategori",
              value: whatValue,
              tone: "category",
              role: "category",
            }
          : null,
        shouldRenderWhy
          ? {
              key: "Status",
              value: whyValue,
              tone: "status",
              role: "status",
            }
          : null,
        {
          key: "Åtgärd",
          value: nextValue,
          tone: "action",
          role: "action",
        },
        contextValue
          ? {
              key: "Kontext",
              value: contextValue,
              tone: "context",
              role: "context",
            }
          : null,
      ].filter((item) => item && item.value);
      return signalItems.slice(0, 3);
    }

    /**
     * Status-prick (urgent / waiting / active) — en gemensam regeluppsättning för live + historik.
     * Ordning: först matchande vinner (urgent → waiting → active).
     */
    const STATUS_RULES = {
      urgent: (model) => {
        const tags = asArray(model?.tags);
        const laneKey = typeof normalizeKey === "function" ? normalizeKey(model?.laneId || "") : "";
        return (
          tags.includes("act-now") ||
          tags.includes("high-risk") ||
          laneKey === "act-now" ||
          laneKey === "act_now" ||
          laneKey === "high-risk" ||
          asArray(model?.signalItems).some((s) => {
            const role = typeof normalizeKey === "function" ? normalizeKey(s?.role || s?.tone || "") : "";
            const raw = asText(s?.value !== undefined && s?.value !== null ? s.value : s?.label || "");
            return role === "why" && /hög risk|risk/i.test(raw);
          })
        );
      },
      waiting: (model) => {
        const owner = asText(model?.ownerLabel);
        const laneKey = typeof normalizeKey === "function" ? normalizeKey(model?.laneId || "") : "";
        return (
          !owner ||
          owner === "Ej tilldelad" ||
          laneKey === "history"
        );
      },
      active: () => true,
    };

    function deriveStatusDot(model = {}) {
      if (STATUS_RULES.urgent(model)) return "urgent";
      if (STATUS_RULES.waiting(model)) return "waiting";
      return "active";
    }

    function normalizeUnifiedCardCompareValue(value = "") {
      return asText(value)
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    /**
     * Anti-dublett: samma text ska inte visas på flera ställen på kortet.
     * Loggar till console när något trimmas bort.
     */
    function normalizeCardContent(raw = {}, logPrefix = "[unified-card]") {
      const customerName = asText(raw.customerName);
      let subtitle = asText(raw.subtitle);
      let previewLine = asText(raw.previewLine);
      let footerChips = asArray(raw.footerChips).map((chip) => ({
        ...chip,
        value: asText(chip?.value),
      }));

      const eq = (a, b) => {
        const na = normalizeUnifiedCardCompareValue(a);
        const nb = normalizeUnifiedCardCompareValue(b);
        return Boolean(na) && na === nb;
      };

      if (eq(subtitle, previewLine)) {
        console.log(logPrefix, "trim: preview equals subtitle; dropping preview");
        previewLine = "";
      }
      if (eq(subtitle, customerName)) {
        console.log(logPrefix, "trim: subtitle equals customer name; dropping subtitle");
        subtitle = "";
      }
      if (eq(previewLine, customerName)) {
        console.log(logPrefix, "trim: preview equals customer name; dropping preview");
        previewLine = "";
      }

      footerChips = footerChips.filter((chip) => {
        if (!chip.value) return false;
        if (subtitle && eq(chip.value, subtitle)) {
          console.log(logPrefix, `trim: chip "${asText(chip.key)}" equals subtitle; dropping chip`);
          return false;
        }
        if (previewLine && eq(chip.value, previewLine)) {
          console.log(logPrefix, `trim: chip "${asText(chip.key)}" equals preview; dropping chip`);
          return false;
        }
        return true;
      });

      const tightMode = !asText(subtitle) && !asText(previewLine);
      if (tightMode) {
        console.log(logPrefix, "trim: tight-mode (ingen subtitle/preview-variation)");
      }

      return {
        ...raw,
        subtitle,
        previewLine,
        footerChips,
        tightMode,
      };
    }

    function buildUnifiedCardIconMarkup(iconType = "") {
      if (iconType === "mail") {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 5L2 7"></path></svg>';
      }
      if (iconType === "users") {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
      }
      if (iconType === "alert") {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
      }
      if (iconType === "chevron-right") {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
      }
      if (iconType === "inbox") {
        return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>';
      }
      return "";
    }

    const UNIFIED_CARD_COPY = {
      multiMailboxSubtitle: "Samma kund har skrivit från flera mailboxar",
      mailboxTrailLabel: "MAILBOXSPÅR",
      mailboxTrailMore: "+{count} till",
      defaultCategory: "Kons",
    };

    /**
     * Gemensam v3-kortsmarkup (historik_kort_fix_v3-struktur).
     * Anropas från historik- respektive live-väg efter migrering (commit 2–3).
     *
     * @param {object} unifiedModel - Normaliserat kort (fält för status, innehåll, chips, trail).
     * @param {object} [options] - data-attribut, urval, m.m.
     */
    function buildUnifiedCardMarkup(unifiedModel = {}, options = {}) {
      const trail = asArray(unifiedModel.mailboxTrail)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      let subtitle = asText(unifiedModel.subtitle);
      if (trail.length > 1 && !subtitle) {
        subtitle = UNIFIED_CARD_COPY.multiMailboxSubtitle;
      }
      if (trail.length <= 1) {
        subtitle = "";
      }

      const counterpartyCopy = asText(unifiedModel.counterpartyLabel, "Okänd avsändare");
      const avatarText = asText(
        unifiedModel.customerInitials ||
          unifiedModel.initials ||
          (counterpartyCopy ? counterpartyCopy.slice(0, 2).toUpperCase() : "?")
      );

      const statusModel = {
        tags: unifiedModel.tags,
        laneId: unifiedModel.laneId,
        ownerLabel: unifiedModel.ownerLabel,
        signalItems: unifiedModel.signalItems,
      };
      const statusDot =
        asText(unifiedModel.statusDot) || deriveStatusDot(statusModel);

      let content;
      if (options.skipNormalizeCardContent) {
        content = {
          subtitle,
          previewLine: asText(unifiedModel.previewLine),
          footerChips: asArray(unifiedModel.footerChips),
          tightMode: false,
        };
      } else {
        content = normalizeCardContent(
          {
            customerName: counterpartyCopy,
            subtitle,
            previewLine: asText(unifiedModel.previewLine),
            footerChips: asArray(unifiedModel.footerChips),
          },
          "[unified-card]"
        );
      }

      const footerChips = content.footerChips;
      const intelligenceMarkup = footerChips.length
        ? `<div class="thread-intelligence-row queue-history-item-meta queue-history-item-meta--fullwidth card-footer">
            ${footerChips
              .map((chip) => {
                const toneClass = escapeHtml(chip.toneClass || "chip-gray");
                const chipKey = escapeHtml(chip.key || "");
                if (chip.interactive === "studio-open" && asText(chip.runtimeThreadId)) {
                  const tid = escapeHtml(chip.runtimeThreadId);
                  const aria = escapeHtml(
                    chip.studioAriaLabel || "Öppna svarsstudion"
                  );
                  return `<button class="thread-intelligence-item chip ${toneClass}" data-history-chip="${chipKey}" type="button" data-runtime-studio-open data-runtime-studio-thread-id="${tid}" aria-controls="studio-shell" aria-label="${aria}">
                  ${buildUnifiedCardIconMarkup(chip.icon)}
                  <span class="thread-intelligence-item-value">${escapeHtml(chip.value)}</span>
                </button>`;
                }
                return `<span class="thread-intelligence-item chip ${toneClass}" data-history-chip="${chipKey}">
                  ${buildUnifiedCardIconMarkup(chip.icon)}
                  <span class="thread-intelligence-item-value">${escapeHtml(chip.value)}</span>
                </span>`;
              })
              .join("")}
          </div>`
        : "";

      const showTrail = trail.length > 1;
      const visibleMailboxTrailItems = showTrail ? trail.slice(0, 3) : [];
      const mailboxTrailOverflowCount = showTrail ? Math.max(0, trail.length - visibleMailboxTrailItems.length) : 0;
      const mailboxTrailMarkup = showTrail
        ? `<div class="intel-card-provenance thread-card-provenance mailbox-trail">
            <span class="trail-bar" aria-hidden="true"></span>
            ${buildUnifiedCardIconMarkup("inbox")}
            <span class="intel-card-provenance-label intel-card-provenance-derived trail-label" data-history-pill-class="queue-history-pill--provenance">${escapeHtml(
              UNIFIED_CARD_COPY.mailboxTrailLabel
            )}</span>
            ${visibleMailboxTrailItems
              .map(
                (entry, index) =>
                  `${index > 0 ? '<span class="trail-separator" aria-hidden="true">·</span>' : ""}<span class="intel-card-provenance-detail trail-item">${escapeHtml(entry)}</span>`
              )
              .join("")}
            ${
              mailboxTrailOverflowCount > 0
                ? `<span class="trail-separator" aria-hidden="true">·</span><button class="trail-more" type="button" data-mailbox-trail-overflow="${mailboxTrailOverflowCount}">${escapeHtml(
                    UNIFIED_CARD_COPY.mailboxTrailMore.replace("{count}", String(mailboxTrailOverflowCount))
                  )}</button>`
                : ""
            }
          </div>`
        : "";

      const runtimeThreadId = asText(options.runtimeThreadId);
      const conversationId = asText(options.conversationId || runtimeThreadId);
      const selectedConversationId = asText(options.selectedConversationId);
      const isSelected =
        Boolean(conversationId) &&
        typeof runtimeConversationIdsMatch === "function" &&
        runtimeConversationIdsMatch(conversationId, selectedConversationId);

      const supportMarkup =
        intelligenceMarkup || mailboxTrailMarkup
          ? `<div class="thread-support-stack${isSelected ? " thread-support-stack-selected" : ""}">${intelligenceMarkup}${mailboxTrailMarkup}</div>`
          : "";

      const subtitleMarkup =
        content.subtitle && !content.tightMode
          ? `<span class="thread-subject-context history-card-subtitle">${escapeHtml(content.subtitle)}</span>`
          : "";
      const previewMarkup =
        content.previewLine && !content.tightMode
          ? `<div class="row-2 history-card-row-2">${escapeHtml(content.previewLine)}</div>`
          : "";

      const explanatoryLineMarkup = asText(unifiedModel.explanatoryLine)
        ? `<div class="thread-card-head-secondary"><p class="queue-history-item-text queue-history-item-text-snippet">${escapeHtml(
            unifiedModel.explanatoryLine
          )}</p></div>`
        : "";
      const secondarySnippet = asText(unifiedModel.secondarySnippet);
      const secondaryInner = secondarySnippet
        ? `<p class="queue-history-item-text queue-history-item-text-snippet">${escapeHtml(secondarySnippet)}</p>`
        : "";
      const headSecondaryClosing = `<div class="thread-card-head-secondary">${secondaryInner}</div>`;

      const selectedClass = isSelected ? " is-selected" : "";
      const selectedArticleClass = isSelected ? " thread-card-selected" : "";
      const selectedState = isSelected
        ? ' aria-current="true" data-history-selected="true"'
        : ' aria-current="false"';
      const runtimeThreadAttribute = runtimeThreadId
        ? ` data-runtime-thread="${escapeHtml(runtimeThreadId)}"`
        : "";
      const worklistSource = asText(options.worklistSource || unifiedModel.worklistSource || "legacy");
      const worklistSourceAttribute = ` data-worklist-source="${escapeHtml(worklistSource)}"`;
      const worklistSourceLabel = asText(options.worklistSourceLabel || unifiedModel.worklistSourceLabel);
      const worklistSourceLabelAttribute = worklistSourceLabel
        ? ` data-worklist-source-label="${escapeHtml(worklistSourceLabel)}"`
        : "";
      const historyConversationAttribute = conversationId
        ? ` data-history-conversation="${escapeHtml(conversationId)}"`
        : "";

      const laneId =
        typeof normalizeKey === "function"
          ? normalizeKey(unifiedModel.laneId || "")
          : asText(unifiedModel.laneId || "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_");
      const laneClass = laneId ? ` queue-history-item--lane-${laneId.replace(/_/g, "-")}` : "";
      const operationalClass = unifiedModel.hasOperationalSignals ? " has-operational-signals" : "";
      const unreadClass = unifiedModel.isUnread === true ? " queue-history-item--unread" : "";
      const loadingClass = unifiedModel.loading === true ? " is-loading" : "";

      const stampLabel = asText(
        unifiedModel.stampLabel ||
          unifiedModel.direction ||
          unifiedModel.queueLabel ||
          worklistSourceLabel ||
          unifiedModel.mailboxProvenanceLabel ||
          unifiedModel.mailboxLabel ||
          "Historik"
      );

      const extraArticleClasses = asText(unifiedModel.extraArticleClasses).trim();
      const articleDataAttributes = asText(options.articleDataAttributes);
      return `<article class="thread-card queue-history-item unified-queue-card${extraArticleClasses ? ` ${extraArticleClasses}` : ""}${selectedClass}${selectedArticleClass}${laneClass}${operationalClass}${unreadClass}${loadingClass}"${runtimeThreadAttribute}${worklistSourceAttribute}${worklistSourceLabelAttribute}${historyConversationAttribute}${articleDataAttributes}${selectedState}>
        <div class="thread-card-head card-top">
          <div class="thread-card-identity history-avatar-wrap">
            <span class="avatar queue-history-avatar history-avatar" aria-hidden="true">${escapeHtml(avatarText)}</span>
            <span class="status-dot ${escapeHtml(statusDot)}" aria-hidden="true"></span>
            <div class="thread-card-head-copy card-body">
              <div class="row-1 history-card-row-1">
                <p class="thread-subject history-card-name">
                  <span class="thread-subject-primary">${escapeHtml(counterpartyCopy)}</span>
                  ${subtitleMarkup}
                </p>
              </div>
              ${previewMarkup}
            </div>
          </div>
          <div class="thread-card-stamp history-card-meta">
            <div class="thread-card-stamp-top"><time datetime="${escapeHtml(
              unifiedModel.recordedAt || ""
            )}">${escapeHtml(unifiedModel.time || "")}</time></div>
            <span class="thread-owner">${escapeHtml(stampLabel)}</span>
          </div>
        </div>
        ${explanatoryLineMarkup}
        ${headSecondaryClosing}
        ${supportMarkup}
      </article>`;
    }

    /**
     * Mappar historik-v3:s bearbetade fält till buildUnifiedCardMarkup-modellen.
     * @param {object} item - Rå historikpost
     * @param {object} v3 - Redan härledda v3-fält (samma semantik som tidigare inline-markup)
     */
    function unifiedCardModelFromHistoryItem(item = {}, v3 = {}) {
      return {
        counterpartyLabel: v3.counterpartyCopy,
        customerInitials: v3.avatarText,
        mailboxTrail: asArray(v3.mailboxTrail),
        subtitle: asText(v3.subtitle),
        laneId: item.laneId,
        ownerLabel: item.ownerLabel,
        tags: item.tags,
        signalItems: asArray(item.signalItems),
        statusDot: asText(v3.statusDot),
        previewLine: asText(v3.previewLine),
        explanatoryLine: asText(v3.explanatoryLine),
        secondarySnippet: asText(v3.secondarySnippet),
        footerChips: asArray(v3.footerChips),
        hasOperationalSignals: Boolean(v3.hasOperationalSignals),
        isUnread: item.isUnread,
        loading: item.loading,
        time: item.time,
        recordedAt: item.recordedAt,
        stampLabel: asText(v3.stampLabel),
      };
    }

    function buildQueueHistoryCardMarkup(item, options = {}) {
      const HISTORIK_STRINGS = {
        unknownSender: "Okänd avsändare",
        history: "Historik",
        defaultCategory: "Kons",
        multiMailboxSubtitle: "Samma kund har skrivit från flera mailboxar",
        mailboxTrailLabel: "MAILBOXSPÅR",
        mailboxTrailMore: "+{count} till",
      };
      const resolveMailboxMeta =
        typeof getQueueHistoryMailboxMeta === "function"
          ? getQueueHistoryMailboxMeta
          : () => ({ icon: "mail", toneClass: "queue-filter-chip--slate" });
      const resolveSignalIcon =
        typeof getQueueHistorySignalIcon === "function"
          ? getQueueHistorySignalIcon
          : (signalRole = "") => {
              if (signalRole === "next") return "bolt";
              if (signalRole === "why") return "clock";
              if (signalRole === "what") return "layers";
              return "info";
            };
      const resolveDirectionMeta =
        typeof getQueueHistoryDirectionMeta === "function"
          ? getQueueHistoryDirectionMeta
          : (direction = "") => {
              const normalizedDirection = typeof normalizeKey === "function"
                ? normalizeKey(direction)
                : asText(direction).trim().toLowerCase();
              if (normalizedDirection === "skickat") {
                return { icon: "send", toneClass: "queue-filter-chip--indigo" };
              }
              if (normalizedDirection === "mottaget") {
                return { icon: "mail", toneClass: "queue-filter-chip--cyan" };
              }
              return { icon: "mail", toneClass: "queue-filter-chip--slate" };
            };
      const resolveQueueMeta =
        typeof getQueueHistoryQueueMeta === "function"
          ? getQueueHistoryQueueMeta
          : () => ({ icon: "layers", toneClass: "queue-filter-chip--slate" });
      const runtimeThreadId = asText(options.runtimeThreadId);
      const conversationId = asText(item.conversationId || runtimeThreadId);
      const selectedConversationId = asText(options.selectedConversationId);
      const useThreadCardClass = options.useThreadCardClass !== false;
      const worklistSource =
        typeof normalizeKey === "function"
          ? normalizeKey(item.worklistSource || "legacy") || "legacy"
          : asText(item.worklistSource || "legacy")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_") || "legacy";
      const worklistSourceLabel = asText(
        item.worklistSourceLabel || (worklistSource === "truth_primary" ? "Truth primary" : "")
      );
      const isSelected =
        Boolean(conversationId) &&
        typeof runtimeConversationIdsMatch === "function" &&
        runtimeConversationIdsMatch(conversationId, selectedConversationId);
      const runtimeThreadAttribute = runtimeThreadId
        ? ` data-runtime-thread="${escapeHtml(runtimeThreadId)}"`
        : "";
      const worklistSourceAttribute = ` data-worklist-source="${escapeHtml(worklistSource)}"`;
      const worklistSourceLabelAttribute = worklistSourceLabel
        ? ` data-worklist-source-label="${escapeHtml(worklistSourceLabel)}"`
        : "";
      const historyConversationAttribute = conversationId
        ? ` data-history-conversation="${escapeHtml(conversationId)}"`
        : "";
      const selectedClass = isSelected ? " is-selected" : "";
      const laneId =
        typeof normalizeKey === "function"
          ? normalizeKey(item.laneId || "")
          : asText(item.laneId || "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_");
      const laneClass = laneId ? ` queue-history-item--lane-${laneId.replace(/_/g, "-")}` : "";
      const signalItems = asArray(item.signalItems);
      const hasOperationalSignals = signalItems.length > 0;
      const operationalClass = hasOperationalSignals ? " has-operational-signals" : "";
      const selectedState = isSelected
        ? ' aria-current="true" data-history-selected="true"'
        : ' aria-current="false"';
      const parseMailboxTrailFromDetail = (detail = "") => {
        // TODO(backend): expose mailboxTrail: string[] from worklist/history payload.
        // Text parsing is a temporary fallback and may split incorrectly if names contain separators.
        return asText(detail)
          .split(/[·,]/g)
          .map((part) => asText(part).trim())
          .filter(Boolean);
      };
      const normalizeHistoryCardModel = (source = {}) => {
        const defaultName = HISTORIK_STRINGS.unknownSender;
        const customerName = asText(source.counterpartyLabel || defaultName, defaultName);
        const deriveHistoryInitials = (label = "") => {
          const normalizedLabel = asText(label)
            .trim()
            .replace(/\s+/g, " ");
          if (!normalizedLabel) return "?";
          const parts = normalizedLabel
            .split(" ")
            .map((part) => asText(part).trim())
            .filter(Boolean);
          if (!parts.length) return "?";
          if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
          return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
        };
        const mailboxTrailFromPayload = asArray(source.mailboxTrail)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
        const mailboxTrailFromRollup = asArray(source.rollup?.underlyingMailboxIds)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
        const mailboxTrailFromDetail = parseMailboxTrailFromDetail(
          source.mailboxProvenanceDetail || source.rollup?.provenanceDetail || ""
        );
        const mailboxTrail = mailboxTrailFromPayload.length
          ? mailboxTrailFromPayload
          : mailboxTrailFromRollup.length
            ? mailboxTrailFromRollup
            : mailboxTrailFromDetail;
        const normalizedLaneId = normalizeKey(source.laneId || "");
        const highRiskSignal = asArray(source.signalItems).some((signal = {}) => {
          const role = normalizeKey(signal.role || signal.tone || "");
          const value = normalizeKey(signal.value || "");
          return role === "why" && (value.includes("hög risk") || value.includes("risk"));
        });
        const status =
          normalizedLaneId === "act-now" || highRiskSignal
            ? "urgent"
            : normalizedLaneId === "history" || !asText(source.ownerLabel)
              ? "waiting"
              : "active";
        return {
          customerName,
          customerInitials: asText(source.initials || deriveHistoryInitials(customerName), "?"),
          mailboxTrail,
          subtitle:
            mailboxTrail.length > 1 ? HISTORIK_STRINGS.multiMailboxSubtitle : "",
          status,
        };
      };
      const normalizedHistoryModel = normalizeHistoryCardModel(item);
      const subjectMarkup = asText(item.title)
        ? `<p class="subject queue-history-item-subject">${escapeHtml(item.title)}</p>`
        : "";
      const operationalChipMarkup = hasOperationalSignals
        ? signalItems
            .map(
              (signal) => {
                const signalRole = normalizeKey(signal.role || signal.tone || "neutral");
                const signalLabel = `${asText(signal.key)}: ${asText(signal.value)}`;
                const toneClass =
                  signalRole === "next"
                    ? laneId === "act-now"
                      ? "queue-filter-chip--rose"
                      : laneId === "review"
                        ? "queue-filter-chip--urgent"
                        : laneId === "medical"
                          ? "queue-filter-chip--magenta"
                          : laneId === "bookable"
                            ? "queue-filter-chip--cyan"
                            : laneId === "later"
                              ? "queue-filter-chip--indigo"
                              : "queue-filter-chip--violet"
                    : signalRole === "why"
                      ? laneId === "act-now"
                        ? "queue-filter-chip--rose"
                        : laneId === "review"
                          ? "queue-filter-chip--urgent"
                          : laneId === "medical"
                            ? "queue-filter-chip--magenta"
                            : laneId === "bookable"
                              ? "queue-filter-chip--cyan"
                              : laneId === "later"
                                ? "queue-filter-chip--indigo"
                                : "queue-filter-chip--violet"
                      : "queue-filter-chip--slate";
                const iconKey = resolveSignalIcon(signalRole);
                return `<span class="queue-filter-chip queue-history-operational-pill queue-history-operational-pill--${escapeHtml(
                  signalRole
                )} ${toneClass}" data-signal-role="${escapeHtml(
                  signalRole
                )}" data-pill-icon="${escapeHtml(iconKey)}" title="${escapeHtml(
                  signalLabel
                )}" aria-label="${escapeHtml(signalLabel)}"><span>${escapeHtml(signal.value)}</span></span>`;
              }
            )
            .join("")
        : "";
      const detailMarkup = asText(item.detail)
        ? `<p class="preview-text queue-history-item-text${
            hasOperationalSignals ? " queue-history-item-text--operative" : ""
          }">${escapeHtml(item.detail)}</p>`
        : "";
      const mailboxMeta = resolveMailboxMeta(item);
      const sourcePill =
        worklistSource === "truth_primary" && worklistSourceLabel
          ? `<span class="queue-history-pill queue-history-pill--source queue-filter-chip--violet" data-pill-icon="layers"><span class="queue-history-pill-label">${escapeHtml(
              worklistSourceLabel
            )}</span></span>`
          : "";
      const mailboxPill = asText(item.mailboxLabel)
        ? `<span class="queue-history-pill queue-history-pill--mailbox ${escapeHtml(
            mailboxMeta.toneClass
          )}" data-pill-icon="${escapeHtml(mailboxMeta.icon)}"><span class="queue-history-pill-label">${escapeHtml(
            item.mailboxLabel
          )}</span></span>`
        : "";
      const mailboxProvenancePill = asText(item.mailboxProvenanceLabel)
        ? `<span class="queue-history-pill queue-history-pill--provenance queue-filter-chip--green" data-pill-icon="layers" title="${escapeHtml(
            item.mailboxProvenanceDetail || ""
          )}"><span class="queue-history-pill-label">${escapeHtml(
            item.mailboxProvenanceLabel
          )}</span></span>`
        : "";
      const showDirectionPill = !runtimeThreadId;
      const directionMeta = resolveDirectionMeta(item.direction);
      const directionPill = showDirectionPill && asText(item.direction)
        ? `<span class="queue-history-pill queue-history-pill--direction ${escapeHtml(
            directionMeta.toneClass
          )}" data-pill-icon="${escapeHtml(directionMeta.icon)}"><span class="queue-history-pill-label">${escapeHtml(
            item.direction
          )}</span></span>`
        : "";
      const queueMeta = resolveQueueMeta();
      const queuePill = asText(item.queueLabel)
        ? `<span class="queue-history-pill queue-history-pill--queue ${escapeHtml(
            queueMeta.toneClass
          )}" data-pill-icon="${escapeHtml(queueMeta.icon)}"><span class="queue-history-pill-label">${escapeHtml(
            item.queueLabel
          )}</span></span>`
        : "";
      const metaMarkup =
        sourcePill || operationalChipMarkup || mailboxPill || mailboxProvenancePill || directionPill || queuePill
        ? `<div class="queue-history-item-meta queue-history-item-meta--fullwidth">${sourcePill}${mailboxPill}${mailboxProvenancePill}${operationalChipMarkup}${directionPill}${queuePill}</div>`
        : "";

      const unreadClass = item.isUnread === true ? " queue-history-item--unread" : "";
      const loadingClass = item.loading === true ? " is-loading" : "";
      const freshnessMarkup =
        item.isUnread === true
          ? '<span class="queue-history-item-freshness" aria-label="Nytt oläst mejl"><span class="queue-history-item-freshness-dot"></span></span>'
          : "";

      if (!useThreadCardClass) {
        return `<article class="queue-history-item${selectedClass}${laneClass}${operationalClass}${unreadClass}${loadingClass}"${runtimeThreadAttribute}${worklistSourceAttribute}${worklistSourceLabelAttribute}${historyConversationAttribute}${selectedState}>
        <span class="avatar queue-history-avatar">${escapeHtml(item.initials || "?")}</span>
        <div class="thread-main queue-history-body">
          <div class="thread-meta queue-history-item-head">
            <div class="thread-heading queue-history-item-heading">
              <h3>${escapeHtml(item.counterpartyLabel || "Okänd avsändare")}</h3>
            </div>
            <div class="queue-history-item-time-group">${freshnessMarkup}<time class="queue-history-item-time" datetime="${escapeHtml(item.recordedAt || "")}">${escapeHtml(item.time || "")}</time></div>
          </div>
          ${subjectMarkup}
          ${detailMarkup}
        </div>
        ${metaMarkup}
      </article>`;
      }

      const counterpartyCopy = normalizedHistoryModel.customerName;
      const normalizeHistoryCompareValue = (value = "") =>
        asText(value)
          .trim()
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      const escapeHistoryRegExp = (value = "") =>
        asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stripRepeatedHistoryLead = (value = "", leads = []) => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        asArray(leads)
          .map((lead) => asText(lead).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .forEach((lead) => {
            const leadPattern = new RegExp(`^${escapeHistoryRegExp(lead)}(?:\\s*[-:|,–—]\\s*|\\s+)`, "i");
            cleaned = cleaned.replace(leadPattern, "").trim();
          });
        return cleaned;
      };
      const rawHistoryTitle = asText(item.title);
      const derivedHistoryTitle = stripRepeatedHistoryLead(rawHistoryTitle, [counterpartyCopy]);
      const primaryHistoryTitleRaw =
        derivedHistoryTitle &&
        normalizeHistoryCompareValue(derivedHistoryTitle) !== normalizeHistoryCompareValue(counterpartyCopy)
          ? derivedHistoryTitle
          : rawHistoryTitle;
      const primaryHistoryTitle = compactRuntimeCopy(
        primaryHistoryTitleRaw,
        rawHistoryTitle || "Historikrad",
        72
      );
      const avatarText = normalizedHistoryModel.customerInitials;
      const stampLabel = asText(
        item.direction ||
          item.queueLabel ||
          worklistSourceLabel ||
          item.mailboxProvenanceLabel ||
          item.mailboxLabel ||
          HISTORIK_STRINGS.history
      );
      const historySignals = [];
      const pushHistorySignal = (role, value, iconKey = "", marker = "") => {
        const signalValue = asText(value);
        const signalRole = normalizeKey(role || "what");
        if (!signalValue) return;
        const duplicate = historySignals.some(
          (entry) =>
            normalizeKey(entry.role || "") === signalRole &&
            normalizeKey(entry.value || "") === normalizeKey(signalValue)
        );
        if (duplicate) return;
        historySignals.push({
          role: signalRole,
          value: signalValue,
          iconKey: iconKey || resolveSignalIcon(signalRole),
          marker: asText(marker),
        });
      };
      asArray(item.signalItems)
        .slice(0, 3)
        .forEach((signal) => {
          const signalRole = normalizeKey(signal.role || signal.tone || "what");
          const mappedSignalRole =
            signalRole === "category"
              ? "what"
              : signalRole === "status"
                ? "why"
                : signalRole === "action"
                  ? "next"
                  : signalRole === "context"
                    ? "source"
                    : signalRole;
          pushHistorySignal(
            mappedSignalRole,
            signal.value,
            resolveSignalIcon(signalRole),
            `queue-history-operational-pill--${mappedSignalRole}`
          );
        });
      pushHistorySignal("mailbox", item.mailboxLabel, mailboxMeta.icon, "queue-history-pill--mailbox");
      pushHistorySignal(
        "source",
        worklistSourceLabel,
        "layers",
        worklistSourceLabel ? "queue-history-pill--source" : ""
      );
      if (!signalItems.length) {
        pushHistorySignal("what", item.direction, directionMeta.icon, "queue-history-operational-pill--what");
        pushHistorySignal("why", worklistSourceLabel, "layers", "queue-history-operational-pill--why");
        pushHistorySignal("next", item.queueLabel, "layers", "queue-history-operational-pill--next");
      }
      const whatSignalValue = asText(
        asArray(item.signalItems).find((signal) => normalizeKey(signal?.role || signal?.tone) === "what")?.value
      );
      const inlineContextHint = asText(
        item.inlineContext ||
          item.queueInlineContext ||
          item.presentation?.inlineContext
      );
      const inlineContextLabel = compactRuntimeCopy(
        inlineContextHint ||
          whatSignalValue ||
          asText(item.intentLabel) ||
          primaryHistoryTitle,
        "",
        72
      );
      const issueContextSource =
        inlineContextLabel ||
        whatSignalValue ||
        asText(item.intentLabel) ||
        primaryHistoryTitle ||
        counterpartyCopy;
      const issueContextLabel = compactRuntimeCopy(issueContextSource, "", 40);
      const explanatoryLineHint = compactRuntimeCopy(
        asText(
          item.explanatoryLine ||
            item.queueExplanatoryLine ||
            item.presentation?.explanatoryLine
        ),
        "",
        132
      );
      let secondaryContextFallback = stripRepeatedHistoryLead(asText(item.detail), [
        counterpartyCopy,
        rawHistoryTitle,
        primaryHistoryTitle,
        issueContextLabel,
      ]);
      if (counterpartyCopy) {
        const escapedCounterparty = counterpartyCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        secondaryContextFallback = secondaryContextFallback.replace(
          new RegExp(`^Från:\\s*${escapedCounterparty}\\s*`, "i"),
          ""
        );
      }
      secondaryContextFallback = secondaryContextFallback.replace(/^Från:\s*/i, "").trim();
      while (/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i.test(secondaryContextFallback)) {
        secondaryContextFallback = secondaryContextFallback.replace(
          /^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i,
          ""
        ).trim();
      }
      secondaryContextFallback = secondaryContextFallback.replace(/^[,.;:-]+\s*/g, "").trim();
      const snippetValue = explanatoryLineHint
        ? explanatoryLineHint
        : compactRuntimeCopy(
            asText(secondaryContextFallback),
            "",
            120
          );
      const showSnippet =
        Boolean(snippetValue) &&
        normalizeHistoryCompareValue(snippetValue) !==
          normalizeHistoryCompareValue(issueContextLabel) &&
        normalizeHistoryCompareValue(snippetValue) !==
          normalizeHistoryCompareValue(primaryHistoryTitle);
      const explicitExplanatoryLine = compactRuntimeCopy(
        asText(
          item.explanatoryLine ||
            item.queueExplanatoryLine ||
            item.presentation?.explanatoryLine ||
            (Number(item.rollup?.mailboxCount || 0) > 1
              ? "Historiken hålls ihop, men varje meddelande visar sin mailboxproveniens."
              : "")
        ),
        "",
        160
      );
      const relationshipChipValue =
        normalizedHistoryModel.mailboxTrail.length > 1
          ? HISTORIK_STRINGS.multiMailboxSubtitle
          : "";
      const priorityChipValue = asText(
        historySignals.find((signal) => signal.role === "why")?.value || item.intentLabel
      );
      const actionChipValue = asText(
        historySignals.find((signal) => signal.role === "next")?.value || item.nextActionLabel
      );
      const footerChips = [
        {
          key: "category",
          value: asText(item.mailboxLabel, HISTORIK_STRINGS.defaultCategory),
          icon: "mail",
          toneClass: "chip-gray",
        },
        {
          key: "relationship",
          value: relationshipChipValue,
          icon: "users",
          toneClass: "chip-blue",
        },
        {
          key: "priority",
          value: priorityChipValue,
          icon: "alert",
          toneClass: "chip-pink",
        },
        {
          key: "action",
          value: actionChipValue,
          icon: "chevron-right",
          toneClass: "chip-green",
        },
      ].filter((chip) => asText(chip.value));
      const previewLine = explicitExplanatoryLine || (showSnippet ? snippetValue : "");
      const unifiedModel = unifiedCardModelFromHistoryItem(item, {
        counterpartyCopy,
        avatarText,
        mailboxTrail: normalizedHistoryModel.mailboxTrail,
        subtitle: normalizedHistoryModel.subtitle,
        statusDot: normalizedHistoryModel.status,
        previewLine,
        explanatoryLine: explicitExplanatoryLine,
        secondarySnippet: showSnippet ? snippetValue : "",
        footerChips,
        hasOperationalSignals,
        stampLabel,
      });
      return buildUnifiedCardMarkup(unifiedModel, {
        runtimeThreadId,
        conversationId,
        selectedConversationId,
        worklistSource,
        worklistSourceLabel,
        skipNormalizeCardContent: true,
      });
    }

    function buildQueueInlineLaneHistoryItem(thread) {
      const primaryLaneId = normalizeKey(thread?.primaryLaneId || "");
      const counterpartyLabel = asText(thread.customerName, "Okänd avsändare");
      const mailboxLabel = asText(
        thread.mailboxLabel || thread.mailboxAddress,
        "Arbetskö"
      );
      const rawTitle = asText(thread.displaySubject || thread.subject, "Inget ämne");
      const rawDetail = asText(
        thread.preview || thread.systemPreview,
        "Ingen senaste kundsignal ännu."
      );
      const normalizeCompareText = (value = "") =>
        asText(value)
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const escapeRegex = (value = "") =>
        asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stripRepeatedLead = (value = "", leads = []) => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        asArray(leads)
          .map((lead) => asText(lead).replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .forEach((lead) => {
            const leadPattern = new RegExp(`^${escapeRegex(lead)}(?:\\s*[-:|]\\s*|\\s+)`, "i");
            cleaned = cleaned.replace(leadPattern, "").trim();
          });
        return cleaned;
      };
      const sanitizeIssueTitle = (value = "") => {
        const cleaned = stripRepeatedLead(value, [counterpartyLabel])
          .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        return compactRuntimeCopy(cleaned, asText(value), 68);
      };
      const humanizeIssueSummary = (value = "") => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        if (!cleaned) return "";
        cleaned = cleaned
          .replace(/^(?:hej|hello|hi)\b[,!:\-\s]*/i, "")
          .replace(/^hur kan vi hjälpa dig med\s+/i, "Vill ha hjälp med ")
          .replace(/^hur kan jag få hjälp med\s+/i, "Vill ha hjälp med ")
          .replace(/^kan ni hjälpa mig med\s+/i, "Vill ha hjälp med ")
          .replace(/^hur kan vi hjälpa dig\??\s*/i, "")
          .replace(/^hur kan jag få hjälp\??\s*/i, "")
          .replace(/^kan ni hjälpa mig\??\s*/i, "")
          .replace(/^(?:hej|hello|hi)\b[,!:\-\s]*/i, "")
          .replace(/^jag vill\s+/i, "Vill ")
          .replace(/^jag behöver\s+/i, "Behöver ")
          .replace(/^vi vill\s+/i, "Vill ")
          .replace(/^skulle vilja\s+/i, "Vill ")
          .replace(/^\s*[–—-]\s*/, "")
          .trim();
        const normalizedCleaned = normalizeCompareText(cleaned);
        if (
          [
            "kontaktformular",
            "kontakt formular",
            "contact form",
            "formular",
            "message",
            "meddelande",
          ].includes(normalizedCleaned)
        ) {
          cleaned = "Ärende via kontaktformulär";
        }
        return compactRuntimeCopy(cleaned, "", 72);
      };
      const sanitizeIssueDetail = (value = "", titleValue = "") => {
        let cleaned = asText(value).replace(/\s+/g, " ").trim();
        cleaned = stripRepeatedLead(cleaned, [counterpartyLabel, titleValue, rawTitle]);
        if (counterpartyLabel) {
          cleaned = cleaned.replace(
            new RegExp(`^Från:\\s*${escapeRegex(counterpartyLabel)}\\s*`, "i"),
            ""
          );
        }
        cleaned = cleaned.replace(/^Från:\s*/i, "").trim();
        while (/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i.test(cleaned)) {
          cleaned = cleaned.replace(
            /^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i,
            ""
          ).trim();
        }
        if (/\b(?:qa|cco|live|inspect|verify|verification|reply|send|sandbox|fixture)\b/i.test(titleValue || rawTitle)) {
          cleaned = cleaned.replace(
            /^(?=[A-Za-zÅÄÖåäö0-9_\-[\]()]*[-_[\]])[A-Za-zÅÄÖåäö0-9_\-[\]()]{6,}\s+/,
            ""
          ).trim();
        }
        cleaned = cleaned.replace(/^[,.;:-]+\s*/g, "").trim();
        return compactRuntimeCopy(cleaned, "", 108);
      };
      const isGenericTitle = (value = "") => {
        const normalizedValue = normalizeCompareText(value);
        if (!normalizedValue) return true;
        return [
          "kontaktformular",
          "kontakt formular",
          "contact form",
          "formular",
          "message",
          "meddelande",
        ].includes(normalizedValue);
      };
      const isSyntheticFallbackTitle = (value = "") => {
        const normalizedValue = normalizeCompareText(value);
        return (
          !normalizedValue ||
          normalizedValue === "ingen forhandsvisning tillganglig" ||
          normalizedValue === "ingen senaste kundsignal annu" ||
          normalizedValue === "aktiv trad" ||
          normalizedValue === "inget amne" ||
          normalizedValue === "nytt inkommande mejl"
        );
      };
      const isUnknownCounterparty = (value = "") => {
        const normalizedValue = normalizeCompareText(value);
        return [
          "",
          "okand avsandare",
          "okand kund",
          "unknown",
          "unknown sender",
          "unknown customer",
        ].includes(normalizedValue);
      };
      const isTechnicalTitle = (value = "") =>
        /\b(?:qa|cco|live|inspect|verify|verification|reply|send|sandbox|fixture)\b/i.test(
          asText(value)
        );
      const isPlaceholderDetail = (value = "") => {
        const normalizedValue = normalizeCompareText(value);
        return (
          !normalizedValue ||
          normalizedValue === "ingen forhandsvisning tillganglig" ||
          normalizedValue === "ingen senaste kundsignal annu" ||
          normalizedValue === "inkommande meddelande registrerat" ||
          normalizedValue === "skickat meddelande registrerat"
        );
      };
      const cleanedSubject = sanitizeIssueTitle(rawTitle);
      const cleanedPreview = sanitizeIssueDetail(rawDetail, cleanedSubject);
      const cleanedFocus = sanitizeIssueDetail(thread?.whyInFocus || thread?.raw?.operatorCue, cleanedSubject);
      const cleanedOperationalSummary = sanitizeIssueDetail(
        thread?.nextActionSummary || thread?.waitingLabel || thread?.nextActionLabel || "",
        cleanedSubject
      );
      const previewSummary = humanizeIssueSummary(cleanedPreview);
      const focusSummary = humanizeIssueSummary(cleanedFocus);
      const operationalSummary = humanizeIssueSummary(cleanedOperationalSummary);
      const subjectSummary = humanizeIssueSummary(cleanedSubject);
      let title = previewSummary;
      let titleSource = title ? "preview" : "";
      if (!title && !(isGenericTitle(subjectSummary) || isTechnicalTitle(subjectSummary))) {
        title = subjectSummary;
        titleSource = title ? "subject" : "";
      }
      if (!title) {
        title = subjectSummary || compactRuntimeCopy(cleanedPreview, cleanedSubject || rawTitle, 68);
        titleSource = title ? "fallback" : "";
      }
      if (isSyntheticFallbackTitle(title) || (isGenericTitle(title) && isPlaceholderDetail(cleanedPreview))) {
        title = !isUnknownCounterparty(counterpartyLabel)
          ? `Konversation med ${counterpartyLabel}`
          : `Nytt inkommande mejl i ${mailboxLabel}`;
        titleSource = "synthetic";
      }
      const normalizedTitle = normalizeCompareText(title);
      const normalizedLaneId = normalizeCompareText(primaryLaneId);
      const normalizedRiskLabel = normalizeCompareText(thread?.riskLabel);
      const normalizedStatusLabel = normalizeCompareText(thread?.statusLabel);
      const preferOperationalDetail =
        normalizedLaneId === "act now" ||
        normalizedRiskLabel === "hog risk" ||
        normalizedRiskLabel === "miss" ||
        Boolean(thread?.followUpAgeLabel) ||
        normalizedStatusLabel.includes("atgard");
      const detailCandidates = [];
      if (preferOperationalDetail && !isPlaceholderDetail(operationalSummary)) {
        detailCandidates.push(operationalSummary);
      }
      if (!isPlaceholderDetail(cleanedFocus)) {
        detailCandidates.push(focusSummary || cleanedFocus);
      }
      if (titleSource !== "preview" && !isPlaceholderDetail(cleanedPreview)) {
        detailCandidates.push(cleanedPreview);
      }
      const detail =
        detailCandidates.find((detailCandidate) => {
          const normalizedDetail = normalizeCompareText(detailCandidate);
          if (!normalizedDetail) return false;
          if (!normalizedTitle) return true;
          return !(
            normalizedDetail === normalizedTitle ||
            normalizedDetail.startsWith(normalizedTitle) ||
            normalizedTitle.startsWith(normalizedDetail)
          );
        }) || "";
      const normalizedDetail = normalizeCompareText(detail);
      const shouldForceFallbackDetail =
        titleSource === "synthetic" ||
        isSyntheticFallbackTitle(title) ||
        (isGenericTitle(title) && isUnknownCounterparty(counterpartyLabel));
      const resolvedDetail =
        normalizedDetail &&
        normalizedDetail !== normalizedTitle &&
        !normalizedDetail.startsWith(normalizedTitle) &&
        !normalizedTitle.startsWith(normalizedDetail)
          ? detail
          : shouldForceFallbackDetail
            ? !isPlaceholderDetail(cleanedPreview) &&
                normalizeCompareText(cleanedPreview) !== normalizedTitle
              ? cleanedPreview
              : "Ingen förhandsvisning tillgänglig."
            : "";
      const inlineContextHint = compactRuntimeCopy(
        asText(
          thread.queueInlineContext ||
            thread.presentation?.inlineContext ||
            thread.rollup?.presentation?.inlineContext
        ),
        "",
        72
      );
      const explanatoryLineHint = compactRuntimeCopy(
        asText(
          thread.queueExplanatoryLine ||
            thread.presentation?.explanatoryLine ||
            thread.rollup?.presentation?.explanatoryLine
        ),
        "",
        132
      );
      const defaultRollupInlineContext =
        thread?.rollup?.enabled === true && Number(thread?.rollup?.mailboxCount || 0) > 1
          ? "Samma kund har skrivit från flera mailboxar"
          : "";
      const defaultRollupExplanatoryLine =
        thread?.rollup?.enabled === true && Number(thread?.rollup?.mailboxCount || 0) > 1
          ? "Historiken hålls ihop, men varje meddelande visar sin mailboxproveniens."
          : "";
      const resolvedTitle = inlineContextHint || title || "Aktiv tråd";
      const finalDetail = explanatoryLineHint || defaultRollupExplanatoryLine || resolvedDetail;
      return {
        initials: getQueueHistoryItemInitials(thread.customerName),
        counterpartyLabel,
        time: asText(thread.lastActivityLabel),
        recordedAt: asText(thread.lastActivityAt),
        title: resolvedTitle,
        detail: finalDetail,
        inlineContext: inlineContextHint || defaultRollupInlineContext,
        explanatoryLine: explanatoryLineHint || defaultRollupExplanatoryLine,
        snippetText: cleanedPreview || rawDetail,
        laneId: primaryLaneId,
        signalItems:
          typeof buildQueueInlineLaneSignalItems === "function"
            ? buildQueueInlineLaneSignalItems(thread)
            : [],
        mailboxLabel,
        mailboxAddress: asText(thread.mailboxAddress),
        mailboxProvenanceLabel: asText(
          thread.mailboxProvenanceLabel ||
            (Number(thread?.rollup?.mailboxCount || 0) > 1
              ? `${thread.rollup.mailboxCount} mailboxar`
              : "")
        ),
        mailboxProvenanceDetail: asText(
          thread.mailboxProvenanceDetail || thread?.rollup?.provenanceDetail
        ),
        rollup: thread?.rollup || null,
        intentLabel: asText(thread.intentLabel),
        worklistSource: asText(thread.worklistSource || "legacy"),
        worklistSourceLabel: asText(thread.worklistSourceLabel),
        isUnread: thread?.unread === true || thread?.isUnread === true,
        direction: isSentRuntimeThread(thread) ? "Skickat" : "Mottaget",
        queueLabel: "",
      };
    }

    function getQueueCount(tag, threads = getQueueScopedRuntimeThreads()) {
      return getQueueLaneThreads(tag, threads).length;
    }

    function getSecondarySignalCount(signalKey, threads = []) {
      const activeThreads = asArray(threads).filter((thread) => !isHandledRuntimeThread(thread));
      if (!activeThreads.length) return 0;
      const normalizedSignal = normalizeKey(signalKey);
      if (normalizedSignal === "unassigned") {
        return activeThreads.filter((thread) => {
          const ownerKey = normalizeKey(thread?.ownerKey || thread?.ownerLabel || "");
          return ownerKey === "unassigned" || ownerKey === "oägd" || asArray(thread?.tags).includes("unassigned");
        }).length;
      }
      return activeThreads.filter((thread) => asArray(thread?.tags).includes(normalizedSignal)).length;
    }

    function renderRuntimeQueueLaneState() {
      const activeLaneId = normalizeKey(state.runtime.activeLaneId || "all");
      const inlinePanelState =
        typeof getRuntimeLeftColumnState === "function"
          ? getRuntimeLeftColumnState()
          : (() => {
              const inlineState =
                state.runtime && typeof state.runtime.queueInlinePanel === "object"
                  ? state.runtime.queueInlinePanel
                  : {};
              const historyState =
                state.runtime && typeof state.runtime.queueHistory === "object"
                  ? state.runtime.queueHistory
                  : {};
              const feedKey = normalizeKey(inlineState.feedKey || "");
              const laneId =
                normalizeKey(inlineState.laneId || activeLaneId || "all") || activeLaneId;
              if (historyState.open) {
                return { mode: "history", open: true, feedKey: "", laneId: "" };
              }
              if (inlineState.open && feedKey) {
                return { mode: "feed", open: true, feedKey, laneId: "" };
              }
              if (inlineState.open) {
                return { mode: "lane", open: true, feedKey: "", laneId };
              }
              return { mode: "default", open: false, feedKey: "", laneId: activeLaneId };
            })();
      const highlightedLaneId =
        inlinePanelState.mode === "lane"
          ? normalizeKey(inlinePanelState.laneId || activeLaneId || "all")
          : activeLaneId;
      if (queueActiveLaneLabel) {
        queueActiveLaneLabel.textContent =
          QUEUE_LANE_LABELS[activeLaneId] || QUEUE_LANE_LABELS.all;
      }
      queueLaneButtons.forEach((button) => {
        const laneId = normalizeKey(button.dataset.queueLane || "all");
        const isActive = laneId === highlightedLaneId;
        const isExpanded =
          inlinePanelState.mode === "lane" &&
          laneId === normalizeKey(inlinePanelState.laneId || activeLaneId || "all");
        button.classList.toggle("is-active", isActive);
        button.setAttribute("role", "button");
        button.setAttribute("tabindex", "0");
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.setAttribute("aria-controls", "queue-inline-history");
        button.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        if (laneId !== "all") {
          button.setAttribute("draggable", "true");
        }
      });
      queueViewJumpButtons.forEach((button) => {
        const feedKey = normalizeKey(button.dataset.queueViewJump || "");
        const isActive =
          inlinePanelState.mode === "feed" &&
          normalizeKey(inlinePanelState.feedKey || "") === feedKey;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("role", "button");
        button.setAttribute("tabindex", "0");
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
        button.setAttribute("aria-controls", "queue-inline-history");
        button.setAttribute("aria-expanded", isActive ? "true" : "false");
      });
      if (queueCollapsedList) {
        const rowsByLane = new Map(
          Array.from(queueCollapsedList.querySelectorAll("[data-queue-lane]")).map((row) => [
            normalizeKey(row.dataset.queueLane),
            row,
          ])
        );
        getOrderedQueueLaneIds().forEach((laneId) => {
          const row = rowsByLane.get(laneId);
          if (row) queueCollapsedList.appendChild(row);
        });
      }
    }

    function renderRuntimeQueueCounts() {
      const queueScopedThreads = getQueueScopedRuntimeThreads();
      const mailboxScopedThreads = getMailboxScopedRuntimeThreads();
      const filteredThreads = getFilteredRuntimeThreads();
      const activeLaneId = normalizeKey(state.runtime.activeLaneId || "all");
      renderRuntimeQueueLaneState();
      if (queueTitle) {
        queueTitle.textContent = `Arbetslista (${filteredThreads.length})`;
      }
      if (queueSummaryFocus) {
        queueSummaryFocus.textContent = String(filteredThreads.length);
      }
      if (queueSummaryActNow) {
        queueSummaryActNow.textContent = String(getQueueCount("act-now", filteredThreads));
      }
      if (queueSummarySprint) {
        queueSummarySprint.textContent = String(getQueueCount("sprint", filteredThreads));
      }
      if (queueSummaryRisk) {
        queueSummaryRisk.textContent = `${getQueueCount("high-risk", filteredThreads)} hög risk`;
      }
      queueLaneCountNodes.forEach((node) => {
        const lane = normalizeKey(node.dataset.queueLaneCount);
        const count = getQueueCount(lane, queueScopedThreads);
        node.textContent = String(count);
      });
      queueSecondarySignalCountNodes.forEach((node) => {
        const signalKey = normalizeKey(node.dataset.queueSecondaryCount);
        node.textContent = String(getSecondarySignalCount(signalKey, mailboxScopedThreads));
      });
      queueFeedCountNodes.forEach((node) => {
        const feedKey = normalizeKey(node.dataset.queueFeedCount);
        if (feedKey === "sent") {
          node.textContent = String(mailboxScopedThreads.filter(isSentRuntimeThread).length);
          return;
        }
        node.textContent = "0";
      });
      if (queueActiveLaneLabel) {
        queueActiveLaneLabel.textContent =
          QUEUE_LANE_LABELS[activeLaneId] || QUEUE_LANE_LABELS.all;
      }
    }

    function renderRuntimeMailboxMenu() {
      if (!mailboxMenuGrid || !mailboxTriggerLabel) return;
      const availableMailboxes = getAvailableRuntimeMailboxes();
      const selectedIds = new Set(
        asArray(
          typeof getSelectedRuntimeMailboxScopeIds === "function"
            ? getSelectedRuntimeMailboxScopeIds()
            : state.runtime.selectedMailboxIds
        )
          .map((value) => normalizeMailboxId(value))
          .filter(Boolean)
      );
      mailboxMenuGrid.innerHTML = "";
      availableMailboxes.forEach((mailbox) => {
        const mailboxScopeId = normalizeMailboxId(
          mailbox.canonicalId || mailbox.email || mailbox.id
        );
        const checked = selectedIds.has(mailboxScopeId);
        const statusLabel =
          typeof mailbox.statusLabel === "string" && mailbox.statusLabel.trim()
            ? mailbox.statusLabel.trim()
            : mailbox.custom
              ? "Custom"
              : "Live";
        const capabilityMeta =
          typeof getRuntimeMailboxCapabilityMeta === "function"
            ? getRuntimeMailboxCapabilityMeta(mailbox.email || mailbox.id)
            : "";
        const fallbackMeta =
          mailbox.signatureCopy ||
          mailbox.ownerCopy ||
          (mailbox.custom
            ? mailbox.signature?.label
              ? `Signatur: ${mailbox.signature.label}`
              : `Ägare: ${mailbox.owner || "Team"}`
            : `Källa: ${mailbox.owner || "Live"}`);
        const dropdownMeta = capabilityMeta || fallbackMeta;
        const label = document.createElement("label");
        label.className = "mailbox-option";
        if (mailbox.toneClass) {
          label.classList.add(mailbox.toneClass);
        }
        if (mailbox.custom === true) {
          label.classList.add("mailbox-option-custom");
        }
        if (capabilityMeta) {
          label.title = capabilityMeta;
        }
        label.innerHTML =
          `<input class="mailbox-option-input" type="checkbox" data-runtime-mailbox="${escapeHtml(mailboxScopeId)}"${checked ? " checked" : ""} />` +
          '<span class="mailbox-option-box" aria-hidden="true"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4 6.6 11.2l5.8-6.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" /></svg></span>' +
          `<span class="mailbox-option-copy">
            <span class="mailbox-option-primary">
              <span class="mailbox-option-name">${escapeHtml(mailbox.label)}</span>
              <span class="mailbox-option-status">${escapeHtml(statusLabel)}</span>
            </span>
            <span class="mailbox-option-secondary">
              ${
                mailbox.email
                  ? `<span class="mailbox-option-email">${escapeHtml(mailbox.email)}</span>`
                  : ""
              }
              <span class="mailbox-option-meta">${escapeHtml(dropdownMeta)}</span>
            </span>
          </span>`;
        mailboxMenuGrid.appendChild(label);
      });
      const addButton = document.createElement("button");
      addButton.className = "mailbox-option mailbox-option-add";
      addButton.type = "button";
      addButton.dataset.mailboxAdminOpen = "true";
      addButton.innerHTML =
        '<span class="mailbox-option-plus" aria-hidden="true"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" /></svg></span>' +
        '<span class="mailbox-option-name">Lägg till</span>';
      mailboxMenuGrid.appendChild(addButton);

      const selectedMailboxes = availableMailboxes.filter((mailbox) =>
        selectedIds.has(
          normalizeMailboxId(mailbox.canonicalId || mailbox.email || mailbox.id)
        )
      );
      const selectedCount = selectedMailboxes.length || (availableMailboxes.length ? availableMailboxes.length : 0);
      let compactScopeLabel = "Inga mail";
      if (!availableMailboxes.length) {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Inga mailboxar";
        compactScopeLabel = "Inga mail";
      } else if (selectedMailboxes.length === availableMailboxes.length) {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Alla mailboxar";
        compactScopeLabel = "Alla mail";
      } else if (selectedMailboxes.length === 1) {
        mailboxTriggerLabel.textContent = `Hair TP Clinic - ${selectedMailboxes[0].label}`;
        compactScopeLabel = compactRuntimeCopy(selectedMailboxes[0].label, "Mailbox", 18);
      } else if (selectedMailboxes.length > 1) {
        mailboxTriggerLabel.textContent = `Hair TP Clinic - ${selectedMailboxes[0].label} +${selectedMailboxes.length - 1}`;
        compactScopeLabel = compactRuntimeCopy(
          `${selectedMailboxes[0].label} +${selectedMailboxes.length - 1}`,
          "Valda mail",
          18
        );
      } else {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Inga mailboxar";
        compactScopeLabel = "Inga mail";
      }
      if (queueMailboxScopeLabel) {
        queueMailboxScopeLabel.textContent = compactScopeLabel;
      }
      if (queueMailboxScopeCount) {
        queueMailboxScopeCount.textContent = String(selectedCount);
      }
    }

    function renderRuntimeOwnerMenu() {
      if (!ownerMenuGrid || !ownerTriggerLabel) return;
      const ownerOptions = getAvailableRuntimeOwners();
      const ownerScopeAvailability = getOwnerScopeAvailability(ownerOptions);
      ownerMenuGrid.innerHTML = "";
      ownerOptions.forEach((owner) => {
        const checked = normalizeKey(state.runtime.selectedOwnerKey || "all") === owner.id;
        const label = document.createElement("label");
        label.className = "mailbox-option";
        label.innerHTML =
          `<input class="mailbox-option-input" type="radio" name="runtime-owner-scope" data-runtime-owner="${escapeHtml(owner.id)}"${checked ? " checked" : ""} />` +
          '<span class="mailbox-option-box" aria-hidden="true"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.4 6.6 11.2l5.8-6.3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" /></svg></span>' +
          `<span class="mailbox-option-name">${escapeHtml(owner.label)}</span>`;
        ownerMenuGrid.appendChild(label);
      });

      const selectedOwner = ownerOptions.find(
        (owner) => owner.id === normalizeKey(state.runtime.selectedOwnerKey || "all")
      );
      ownerTriggerLabel.textContent = asText(selectedOwner?.label, "Alla ägare");
      if (ownerMenuNote) {
        ownerMenuNote.textContent = ownerScopeAvailability.note;
        ownerMenuNote.hidden = !ownerScopeAvailability.note;
      }
      if (ownerMenuToggle) {
        ownerMenuToggle.disabled = ownerScopeAvailability.disableMenu === true;
        if (ownerMenuToggle.disabled) {
          ownerMenuToggle.checked = false;
        }
      }
      const ownerTrigger = ownerTriggerLabel.closest(".mailbox-trigger");
      if (ownerTrigger) {
        ownerTrigger.classList.toggle("is-disabled", ownerScopeAvailability.disableMenu === true);
      }
    }

    function renderRuntimeQueue() {
      renderRuntimeMailboxMenu();
      renderRuntimeOwnerMenu();
      renderRuntimeQueueCounts();
      const runtimeMode = normalizeKey(state.runtime.mode || "");

      const useUnifiedQueueList = Boolean(queueHistoryList);

      if (useUnifiedQueueList) {
        if (queueContent) {
          queueContent.hidden = true;
          queueContent.innerHTML = "";
        }
        renderSelectedThreadInlineControls(null);
        return;
      }

      if (!queueContent) return;

      if (state.runtime.loading) {
        queueContent.innerHTML = buildThreadCardMarkup(
          {
            id: "runtime-loading",
            avatar: buildAvatarDataUri("CCO"),
            customerName: "Synkar arbetskö",
            lastActivityAt: "",
            lastActivityLabel: "Pågår",
            isVIP: false,
            ownerLabel: "System",
            subject: "Hämtar live-trådar",
            preview: "Läser Comms, Graph och live runtime för nya CCO.",
            mailboxLabel: "Live",
            intentLabel: "Synkar",
            statusLabel: "Synkar",
            nextActionLabel: "Vänta",
            nextActionSummary: "Vänta några sekunder medan arbetskön fylls med live-trådar.",
            tags: [],
          },
          0,
          false
        );
        renderSelectedThreadInlineControls(null);
        return;
      }

      if (state.runtime.error && runtimeMode !== "offline_history") {
        queueContent.innerHTML = buildThreadCardMarkup(
          {
            id: "runtime-error",
            avatar: buildAvatarDataUri("CCO"),
            customerName: state.runtime.authRequired ? "Livekö ej ansluten" : "Livekö pausad",
            lastActivityAt: "",
            lastActivityLabel: "Nu",
            isVIP: false,
            ownerLabel: "System",
            subject: state.runtime.authRequired
              ? "Öppna admin och logga in igen"
              : "Live runtime otillgänglig",
            preview: state.runtime.error,
            mailboxLabel: "CCO",
            intentLabel: state.runtime.authRequired ? "Åtkomst" : state.runtime.offline ? "Offline" : "Runtime",
            statusLabel: state.runtime.authRequired ? "Session krävs" : "Otillgänglig",
            nextActionLabel: state.runtime.authRequired ? "Logga in igen" : "Försök senare",
            nextActionSummary: state.runtime.authRequired
              ? "Återställ admin-sessionen för att fylla arbetskön med live-trådar igen."
              : "Vänta tills live runtime är tillbaka eller fortsätt i offline-ytan tills dess.",
            tags: [],
          },
          0,
          false
        );
        renderSelectedThreadInlineControls(null);
        return;
      }

      const queueScopedThreads = getQueueScopedRuntimeThreads();
      const filteredThreads = getFilteredRuntimeThreads();
      if (!filteredThreads.length) {
        const ownerFiltered =
          normalizeKey(state.runtime.selectedOwnerKey || "all") !== "all" &&
          getMailboxScopedRuntimeThreads().length > 0;
        const laneFiltered =
          normalizeKey(state.runtime.activeLaneId || "all") !== "all" &&
          queueScopedThreads.length > 0;
        const activeLaneLabel =
          QUEUE_LANE_LABELS[normalizeKey(state.runtime.activeLaneId || "all")] ||
          QUEUE_LANE_LABELS.all;
        queueContent.innerHTML = buildThreadCardMarkup(
          {
            id: "runtime-empty",
            avatar: buildAvatarDataUri("CCO"),
            customerName: "Inga trådar i urvalet",
            lastActivityAt: "",
            lastActivityLabel: "Nu",
            isVIP: false,
            ownerLabel: ownerFiltered ? "Ägarvy" : laneFiltered ? "Arbetskö" : "Mailboxscope",
            subject: laneFiltered
              ? `${activeLaneLabel} har inga aktiva trådar`
              : ownerFiltered
                ? "Ägarfiltret gav inga aktiva trådar"
                : runtimeMode === "offline_history"
                  ? "Ingen historik hittades i valt mailboxscope"
                  : "Mailboxfiltret gav inga aktiva trådar",
            preview: laneFiltered
              ? "Byt kö i vänsterpanelen eller återgå till Alla trådar för att se fler konversationer."
              : ownerFiltered
                ? "Byt ägare eller återgå till Ägarvy för att se fler trådar."
                : runtimeMode === "offline_history"
                  ? "Livekön är offline och det finns ännu ingen sparad historik att visa i arbetsytan."
                  : "Välj fler mailboxar eller vänta på nästa inkommande konversation.",
            mailboxLabel: "Arbetskö",
            intentLabel: runtimeMode === "offline_history" ? "Offline historik" : "Tom kö",
            statusLabel: runtimeMode === "offline_history" ? "Historik saknas" : "Ingen match",
            nextActionLabel: runtimeMode === "offline_history" ? "Byt mailboxscope" : "Justera urval",
            nextActionSummary: laneFiltered
              ? "Återgå till Alla trådar eller byt kö för att hitta nästa aktiva konversation."
              : ownerFiltered
                ? "Byt ägarfilter eller återgå till Ägarvy för att läsa fler trådar."
                : runtimeMode === "offline_history"
                  ? "Välj ett annat mailboxscope eller invänta att livekopplingen kommer tillbaka."
                  : "Utöka mailboxscope för att fylla arbetskön med fler konversationer.",
            tags: [],
          },
          0,
          false
        );
        renderSelectedThreadInlineControls(null);
        return;
      }

      queueContent.innerHTML = filteredThreads
        .map((thread, index) =>
          buildThreadCardMarkup(thread, index, thread.id === state.runtime.selectedThreadId)
        )
        .join("");
      decorateStaticPills();
      renderSelectedThreadInlineControls();
    }

    function renderQueueHistoryList(items = []) {
      if (!queueHistoryList) return;
      if (queueHistoryList.dataset) {
        queueHistoryList.dataset.queueListMode = "history";
      }
      const enrichHistoryCardItem = (item = {}) => {
        const historyConversationId = asText(item.conversationId);
        if (
          !historyConversationId ||
          typeof buildQueueInlineLaneHistoryItem !== "function" ||
          typeof getMailboxScopedRuntimeThreads !== "function" ||
          typeof runtimeConversationIdsMatch !== "function"
        ) {
          return item;
        }
        const matchedThread = getMailboxScopedRuntimeThreads().find((thread) =>
          runtimeConversationIdsMatch(thread?.id, historyConversationId)
        );
        if (!matchedThread) return item;
        const runtimeHistoryItem = buildQueueInlineLaneHistoryItem(matchedThread);
        return {
          ...item,
          counterpartyLabel: asText(runtimeHistoryItem.counterpartyLabel, item.counterpartyLabel),
          title: asText(item.title, runtimeHistoryItem.title),
          detail: asText(runtimeHistoryItem.snippetText, runtimeHistoryItem.detail, item.detail),
          signalItems: asArray(runtimeHistoryItem.signalItems).length
            ? runtimeHistoryItem.signalItems
            : asArray(item.signalItems),
          mailboxProvenanceLabel: asText(
            runtimeHistoryItem.mailboxProvenanceLabel,
            item.mailboxProvenanceLabel
          ),
          mailboxProvenanceDetail: asText(
            runtimeHistoryItem.mailboxProvenanceDetail,
            item.mailboxProvenanceDetail
          ),
          intentLabel: asText(runtimeHistoryItem.intentLabel, item.intentLabel),
          worklistSource: asText(runtimeHistoryItem.worklistSource, item.worklistSource),
          worklistSourceLabel: asText(
            runtimeHistoryItem.worklistSourceLabel,
            item.worklistSourceLabel
          ),
          isUnread: item.isUnread === true || runtimeHistoryItem.isUnread === true,
        };
      };
      queueHistoryList.innerHTML = asArray(items)
        .map((item) =>
          buildQueueHistoryCardMarkup(enrichHistoryCardItem(item), {
            selectedConversationId: state.runtime.queueHistory?.selectedConversationId,
          })
        )
        .join("");
      if (typeof decorateStaticPills === "function") decorateStaticPills();
    }

    function renderQueueInlineLaneList(threads = []) {
      if (!queueHistoryList) return;
      if (queueHistoryList.dataset) {
        queueHistoryList.dataset.queueListMode = "live";
      }
      const renderLiveThreadCard =
        typeof buildThreadCardMarkup === "function"
          ? (thread, index, selected) => buildThreadCardMarkup(thread, index, selected)
          : typeof buildQueueHistoryCardMarkup === "function" &&
              typeof buildQueueInlineLaneHistoryItem === "function"
            ? (thread, index, selected) =>
                buildQueueHistoryCardMarkup(buildQueueInlineLaneHistoryItem(thread), {
                  runtimeThreadId: thread.id,
                  selectedConversationId: state.runtime.selectedThreadId,
                  useThreadCardClass: false,
                })
            : null;
      queueHistoryList.innerHTML = asArray(threads)
        .map((thread, index) =>
          renderLiveThreadCard
            ? renderLiveThreadCard(thread, index, thread.id === state.runtime.selectedThreadId)
            : ""
        )
        .join("");
      if (typeof decorateStaticPills === "function") decorateStaticPills();
    }

    function renderQueueHistorySection() {
      if (!queueHistoryPanel || !queueHistoryToggle) return;
      const buildUnifiedStateThread = ({
        id,
        customerName,
        lastActivityLabel = "Nu",
        ownerLabel = "System",
        subject,
        preview,
        mailboxLabel = "Arbetskö",
        statusLabel = "Info",
        nextActionLabel = "",
        nextActionSummary = "",
        tags = [],
      } = {}) => ({
        id: asText(id, `runtime-state-${normalizeKey(customerName || subject || "item") || "item"}`),
        avatar: typeof buildAvatarDataUri === "function" ? buildAvatarDataUri("CCO") : "",
        customerName: asText(customerName, "Systemstatus"),
        lastActivityAt: "",
        lastActivityLabel,
        ownerLabel,
        displayOwnerLabel: ownerLabel,
        displaySubject: asText(subject, "Statusrad"),
        subject: asText(subject, "Statusrad"),
        preview: asText(preview, "Ingen ytterligare information tillgänglig."),
        mailboxLabel,
        intentLabel: statusLabel,
        statusLabel,
        nextActionLabel: asText(nextActionLabel, statusLabel || "Granska"),
        nextActionSummary: asText(
          nextActionSummary,
          preview || "Ingen ytterligare information tillgänglig."
        ),
        tags: Array.from(new Set(["all", ...asArray(tags).filter(Boolean)])),
      });
      const useUnifiedQueueList = Boolean(queueHistoryList);
      const historyState = state.runtime.queueHistory;
      const leftColumnState =
        typeof getRuntimeLeftColumnState === "function"
          ? getRuntimeLeftColumnState()
          : (() => {
              const inlineState =
                state.runtime && typeof state.runtime.queueInlinePanel === "object"
                  ? state.runtime.queueInlinePanel
                  : {};
              const historySelection =
                state.runtime && typeof state.runtime.queueHistory === "object"
                  ? state.runtime.queueHistory
                  : {};
              const activeLaneId =
                normalizeKey(state.runtime.activeLaneId || "all") || "all";
              const feedKey = normalizeKey(inlineState.feedKey || "");
              const laneId =
                normalizeKey(inlineState.laneId || activeLaneId || "all") || activeLaneId;
              if (historySelection.open) {
                return { mode: "history", open: true, feedKey: "", laneId: "" };
              }
              if (inlineState.open && feedKey) {
                return { mode: "feed", open: true, feedKey, laneId: "" };
              }
              if (inlineState.open) {
                return { mode: "lane", open: true, feedKey: "", laneId };
              }
              return { mode: "default", open: false, feedKey: "", laneId: activeLaneId };
            })();
      const isHistoryOpen = leftColumnState.mode === "history";
      const inlineFeedKey = normalizeKey(leftColumnState.feedKey || "");
      const isFeedPanelOpen = leftColumnState.mode === "feed";
      const isLanePanelOpen = leftColumnState.mode === "lane";
      const runtimeMode = normalizeKey(state.runtime.mode || "");
      const isOpen = useUnifiedQueueList || isHistoryOpen || isLanePanelOpen || isFeedPanelOpen;
      queueHistoryToggle.classList.toggle("is-active", isHistoryOpen);
      queueHistoryToggle.setAttribute("aria-expanded", String(isHistoryOpen));
      queueHistoryPanel.hidden = !isOpen;
      queueHistoryPanel.classList.toggle("is-open", isOpen);
      if (queuePrimaryLaneTag) queuePrimaryLaneTag.hidden = isOpen;
      if (queueContent) queueContent.hidden = useUnifiedQueueList || isOpen;
      if (isOpen) {
        setQueueContextVisibility(false);
      } else {
        renderThreadContextRows();
      }

      if (queueHistoryCount) {
        const visibleCount = asArray(historyState.items).length;
        queueHistoryCount.textContent = String(visibleCount);
      }

      if (!isOpen) return;

      if (isHistoryOpen) {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "history";
        }
        if (queueTitle) {
          queueTitle.textContent = `Historik (${asArray(historyState.items).length})`;
        }

        if (historyState.loading) {
          renderQueueHistoryList([]);
          if (queueHistoryList) {
            queueHistoryList.innerHTML = '<div class="queue-history-empty">Laddar historik…</div>';
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        if (historyState.error) {
          if (queueHistoryList) {
            queueHistoryList.innerHTML = `<div class="queue-history-empty">${escapeHtml(
              historyState.error
            )}</div>`;
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        if (!asArray(historyState.items).length) {
          if (queueHistoryList) {
            queueHistoryList.innerHTML =
              '<div class="queue-history-empty">Ingen historik hittades i valt mailboxscope ännu.</div>';
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        renderQueueHistoryList(historyState.items);
        if (queueHistoryLoadMoreButton) {
          queueHistoryLoadMoreButton.hidden = !historyState.hasMore;
        }
        return;
      }

      if (useUnifiedQueueList && state.runtime.loading) {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        const loadingThreads = getQueueScopedRuntimeThreads();
        if (loadingThreads.length) {
          if (queueTitle) {
            queueTitle.textContent = `Arbetslista (${loadingThreads.length})`;
          }
          renderQueueInlineLaneList(loadingThreads);
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }
        if (queueTitle) {
          queueTitle.textContent = "Arbetslista (0)";
        }
        renderQueueInlineLaneList(buildUnifiedQueueLoadingItems());
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }

      if (useUnifiedQueueList && state.runtime.error && runtimeMode !== "offline_history") {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        if (queueTitle) {
          queueTitle.textContent = "Arbetslista (0)";
        }
        renderQueueInlineLaneList([
          buildUnifiedStateThread({
            id: "runtime-unified-error",
            customerName: state.runtime.authRequired ? "Livekö ej ansluten" : "Livekö pausad",
            ownerLabel: "System",
            subject: state.runtime.authRequired
              ? "Öppna admin och logga in igen"
              : "Live runtime otillgänglig",
            preview: state.runtime.error,
            mailboxLabel: "CCO",
            statusLabel: state.runtime.authRequired ? "Session krävs" : "Otillgänglig",
            nextActionLabel: state.runtime.authRequired ? "Logga in igen" : "Försök senare",
            nextActionSummary: state.runtime.authRequired
              ? "Återställ admin-sessionen för att fylla arbetskön med live-trådar igen."
              : "Vänta tills live runtime är tillbaka eller fortsätt i offline-ytan tills dess.",
          }),
        ]);
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }

      if (isFeedPanelOpen) {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        const feedThreads = getMailFeedRuntimeThreads(inlineFeedKey);
        const feedLabel = inlineFeedKey === "sent" ? "Skickade" : inlineFeedKey;
        if (queueTitle) {
          queueTitle.textContent = `${feedLabel} (${feedThreads.length})`;
        }
        if (!feedThreads.length) {
          renderQueueInlineLaneList([
            buildUnifiedStateThread({
              id: `runtime-feed-empty-${inlineFeedKey || "empty"}`,
              customerName: "Inga mejl i kategorin",
              ownerLabel: inlineFeedKey === "sent" ? "Skickade" : "Arbetskö",
              subject: "Det finns inga mejl att visa just nu",
              preview: "Byt kategori eller mailboxscope för att se fler trådar i vänsterkolumnen.",
              mailboxLabel: feedLabel,
              statusLabel: "Ingen match",
              nextActionLabel: "Byt kategori",
              nextActionSummary:
                "Byt kategori eller mailboxscope för att hitta nästa relevanta mejl.",
            }),
          ]);
        } else {
          renderQueueInlineLaneList(feedThreads);
        }
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }

      if (isLanePanelOpen) {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        const laneId = normalizeKey(leftColumnState.laneId || state.runtime.activeLaneId || "all");
        const laneThreads = getQueueLaneThreads(laneId, getQueueScopedRuntimeThreads());
        if (queueTitle) {
          queueTitle.textContent = `${QUEUE_LANE_LABELS[laneId] || QUEUE_LANE_LABELS.all} (${laneThreads.length})`;
        }
        if (!laneThreads.length) {
          renderQueueInlineLaneList([
            buildUnifiedStateThread({
              id: `runtime-lane-empty-${laneId || "all"}`,
              customerName: "Inga trådar i urvalet",
              ownerLabel: "Arbetskö",
              subject: `${QUEUE_LANE_LABELS[laneId] || QUEUE_LANE_LABELS.all} har inga aktiva trådar`,
              preview: "Byt kö i vänsterpanelen eller återgå till Alla trådar för att se fler konversationer.",
              mailboxLabel: "Arbetskö",
              statusLabel: "Ingen match",
              nextActionLabel: "Byt kö",
              nextActionSummary:
                "Återgå till Alla trådar eller byt kö för att hitta nästa aktiva konversation.",
            }),
          ]);
        } else {
          renderQueueInlineLaneList(laneThreads);
        }
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }

      if (useUnifiedQueueList) {
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        const activeLaneId = normalizeKey(state.runtime.activeLaneId || "all");
        const defaultThreads = getQueueLaneThreads(activeLaneId, getQueueScopedRuntimeThreads());
        const offlineEmptyMessage = asText(state.runtime.error);
        if (queueTitle) {
          queueTitle.textContent = `Arbetslista (${defaultThreads.length})`;
        }
        if (!defaultThreads.length) {
          renderQueueInlineLaneList([
            buildUnifiedStateThread({
              id: runtimeMode === "offline_history" ? "runtime-offline-empty" : "runtime-unified-empty",
              customerName: "Inga trådar i urvalet",
              ownerLabel:
                runtimeMode === "offline_history"
                  ? "Offline historik"
                  : "Arbetskö",
              subject:
                runtimeMode === "offline_history"
                  ? "Ingen historik hittades i valt mailboxscope"
                  : "Mailboxfiltret gav inga aktiva trådar",
              preview:
                runtimeMode === "offline_history"
                  ? offlineEmptyMessage ||
                    "Livekön är offline och ingen historik hittades i valt mailboxscope ännu."
                  : (() => {
                      let live =
                        "Välj fler mailboxar eller vänta på nästa inkommande konversation.";
                      if (state.runtime?.graphReadEnabled === true) {
                        live +=
                          " Tom kö direkt efter testmail är ofta normalt — ge det en minut och ladda om.";
                      }
                      if (state.runtime?.graphReadEnabled === true && state.runtime?.graphReadConnectorAvailable === false) {
                        live +=
                          " Servern saknar aktiv Graph read-connector trots att read är påslaget — kontrollera miljövariabler.";
                      }
                      return live;
                    })(),
              mailboxLabel: "Arbetskö",
              statusLabel:
                runtimeMode === "offline_history" ? "Historik saknas" : "Ingen match",
              nextActionLabel:
                runtimeMode === "offline_history" ? "Byt mailboxscope" : "Justera urval",
              nextActionSummary:
                runtimeMode === "offline_history"
                  ? "Välj ett annat mailboxscope eller invänta att livekopplingen kommer tillbaka."
                  : "Utöka mailboxscope för att fylla arbetskön med fler konversationer.",
            }),
          ]);
        } else {
          renderQueueInlineLaneList(defaultThreads);
        }
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }
    }

    function renderMailFeedUndoState() {
      const pending = state.pendingMailFeedDelete;
      mailFeedUndoButtons.forEach((button) => {
        const isActive =
          pending.active &&
          normalizeKey(button.dataset.mailFeedUndo) === normalizeKey(pending.feed) &&
          !pending.committing;
        button.hidden = !isActive;
        button.disabled = pending.committing;
      });
    }

    function formatMailFeedResumeValue(value) {
      const iso = toIso(value);
      if (!iso) return "Ingen tid satt";
      return new windowObject.Intl.DateTimeFormat("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    }

    function getMailFeedRuntimeThreads(feedKey) {
      const normalizedFeed = normalizeKey(feedKey);
      const scopedThreads = getMailboxScopedRuntimeThreads();
      if (normalizedFeed === "later") {
        return scopedThreads.filter(isLaterRuntimeThread);
      }
      if (normalizedFeed === "sent") {
        return scopedThreads.filter(isSentRuntimeThread);
      }
      return [];
    }

    function getSelectedMailFeedThread(feedKey) {
      const threads = getMailFeedRuntimeThreads(feedKey);
      if (!threads.length) return null;
      const selectedKey = normalizeKey(state.selectedMailFeedKey[normalizeKey(feedKey)]);
      return threads.find((thread) => normalizeKey(thread.id) === selectedKey) || threads[0] || null;
    }

    function updateMailFeedMetrics(feedKey, threads) {
      const normalizedFeed = normalizeKey(feedKey);
      if (normalizedFeed === "later") {
        if (laterMetricValueNodes.count) {
          laterMetricValueNodes.count.textContent = String(threads.length);
        }
        if (laterMetricValueNodes.vip) {
          laterMetricValueNodes.vip.textContent = String(threads.filter((thread) => thread.isVIP).length);
        }
        const nextResumeIso = threads
          .map((thread) => toIso(thread?.raw?.followUpDueAt || thread?.raw?.followUpSuggestedAt || ""))
          .filter(Boolean)
          .sort()[0];
        if (laterMetricValueNodes.resume) {
          laterMetricValueNodes.resume.textContent = formatMailFeedResumeValue(nextResumeIso);
        }
        return;
      }
      if (normalizedFeed === "sent") {
        if (sentMetricValueNodes.count) {
          sentMetricValueNodes.count.textContent = String(threads.length);
        }
        if (sentMetricValueNodes.vip) {
          sentMetricValueNodes.vip.textContent = String(threads.filter((thread) => thread.isVIP).length);
        }
        if (sentMetricValueNodes.scope) {
          sentMetricValueNodes.scope.textContent = String(
            getSelectedRuntimeMailboxScopeIds().length || getAvailableRuntimeMailboxes().length || 0
          );
        }
      }
    }

    function getMailFeedItems(feedKey) {
      const normalizedFeed = normalizeKey(feedKey);
      const runtimeMode = normalizeKey(state.runtime.mode || "");
      const useRuntimeFeed =
        state.runtime.live ||
        state.runtime.authRequired ||
        runtimeMode === "offline_history" ||
        runtimeMode === "runtime_error" ||
        Boolean(state.runtime.error);
      if (!useRuntimeFeed) {
        return (MAIL_FEEDS[normalizedFeed] || []).map((item) => ({
          ...item,
          ownerLabel: "Oägd",
          statusLabel: normalizedFeed === "later" ? "Parkerad" : "Skickad",
          waitingLabel: normalizedFeed === "later" ? "Ägaråtgärd" : "Inväntar svar",
          nextActionLabel: normalizedFeed === "later" ? "Återuppta senare" : "Öppna historik",
          lifecycleLabel: normalizedFeed === "later" ? "Vänteläge" : "Skickat spår",
          riskLabel: normalizedFeed === "later" ? "Bevaka" : "Låg risk",
          followUpLabel: normalizedFeed === "later" ? item.meta : "",
          isVIP: /vip/i.test(asText(item.title)) || /vip/i.test(asText(item.preview)),
          requiresAttention: normalizedFeed === "later",
          historyLabel: normalizedFeed === "sent" ? "1 händelse" : "0 händelser",
        }));
      }

      const threads = getMailFeedRuntimeThreads(normalizedFeed);
      updateMailFeedMetrics(normalizedFeed, threads);

      return threads.map((thread) => ({
        key: thread.id,
        id: thread.id,
        mailbox: thread.mailboxLabel,
        customerName: thread.customerName,
        meta:
          normalizedFeed === "later"
            ? thread.followUpAgeLabel || thread.followUpLabel || thread.nextActionLabel
            : thread.followUpAgeLabel || thread.lastActivityLabel,
        title: thread.displaySubject || thread.subject,
        preview:
          normalizedFeed === "later"
            ? compactRuntimeCopy(
                thread.nextActionSummary || thread.whyInFocus,
                "Återuppta tråden vid rätt tidpunkt.",
                132
              )
            : compactRuntimeCopy(
                thread.preview || thread.nextActionSummary,
                "Skickat innehåll finns i historiken.",
                132
              ),
        ownerLabel: thread.displayOwnerLabel || thread.ownerLabel,
        statusLabel: thread.statusLabel,
        waitingLabel: thread.waitingLabel,
        nextActionLabel: thread.nextActionLabel,
        lifecycleLabel: thread.lifecycleLabel,
        riskLabel: thread.riskLabel,
        followUpLabel: thread.followUpLabel,
        followUpAgeLabel: thread.followUpAgeLabel,
        isVIP: thread.isVIP,
        requiresAttention:
          normalizedFeed === "later" ||
          normalizeKey(thread.riskLabel) === "hög risk" ||
          normalizeKey(thread.riskLabel) === "miss" ||
          normalizeKey(thread.statusLabel).includes("åtgärd") ||
          Boolean(thread.followUpAgeLabel),
        historyLabel: `${Math.max(1, asArray(thread.historyEvents).length)} händelser`,
      }));
    }

    function getMailFeedEmptyState(feedKey) {
      const normalizedFeed = normalizeKey(feedKey);
      const runtimeMode = normalizeKey(state.runtime.mode || "");
      const mailboxScopeCount =
        getSelectedRuntimeMailboxScopeIds().length || getAvailableRuntimeMailboxes().length || 0;
      if (state.runtime.authRequired) {
        return {
          label: normalizedFeed === "later" ? "Senare" : "Skickade",
          title: "Inloggning krävs",
          meta: "CCO runtime",
          copy: "Logga in igen i admin för att läsa live-data i denna vy.",
          scope: `${mailboxScopeCount} mailboxar`,
          context: "Åtkomst krävs",
          hint: "Öppna admin och logga in igen.",
        };
      }
      if (runtimeMode === "offline_history") {
        return {
          label: normalizedFeed === "later" ? "Senare" : "Skickade",
          title: "Offline historikläge",
          meta: "CCO historik",
          copy: "Livekön är offline. Den här vyn visar bara sådant som kan härledas från sparad historik.",
          scope: `${mailboxScopeCount} mailboxar`,
          context: "Historikfallback",
          hint: "Återgå till arbetskön eller invänta att livekopplingen kommer tillbaka.",
        };
      }
      if (state.runtime.error && !state.runtime.live) {
        return {
          label: normalizedFeed === "later" ? "Senare" : "Skickade",
          title: "Live runtime saknas",
          meta: "CCO runtime",
          copy: state.runtime.error,
          scope: `${mailboxScopeCount} mailboxar`,
          context: "Otillgänglig",
          hint: "Försök igen när live runtime är tillbaka.",
        };
      }
      return {
        label: normalizedFeed === "later" ? "Senare" : "Skickade",
        title:
          normalizedFeed === "later"
            ? "Det finns inga trådar i Senare just nu"
            : "Det finns inga skickade trådar i valt scope",
        meta: "Tom vy",
        copy:
          normalizedFeed === "later"
            ? "Snoozade eller parkerade konversationer dyker upp här när de lämnar arbetskön."
            : "Skickade trådar visas här när senaste aktiviteten i scope kommer från CCO.",
        scope: `${mailboxScopeCount} mailboxar`,
        context: "Live scope",
        hint:
          normalizedFeed === "later"
            ? "Ändra mailboxscope eller svara senare i studion för att fylla vyn."
            : "Ändra mailboxscope eller skicka från studion för att fylla vyn.",
      };
    }

    function renderMailFeeds() {
      mailFeedFilterButtons.forEach((button) => {
        const feedKey = normalizeKey(button.dataset.mailFeedFilter);
        const isActive =
          normalizeKey(button.dataset.mailFeedFilterValue) === getMailFeedRuntimeState(feedKey).filter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

      mailFeedViewButtons.forEach((button) => {
        const feedKey = normalizeKey(button.dataset.mailFeedView);
        const isActive =
          normalizeKey(button.dataset.mailFeedViewValue) === getMailFeedRuntimeState(feedKey).view;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

      mailFeedDensityButtons.forEach((button) => {
        const feedKey = normalizeKey(button.dataset.mailFeedDensity);
        const isActive =
          normalizeKey(button.dataset.mailFeedDensityValue) ===
          getMailFeedRuntimeState(feedKey).density;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

      mailFeedLists.forEach((container) => {
        const feedKey = normalizeKey(container.dataset.mailFeedList);
        const runtime = getMailFeedRuntimeState(feedKey);
        const allItems = getMailFeedItems(feedKey);
        const items = getFilteredMailFeedItems(feedKey);
        const availableSelectionKeys = new Set(
          allItems.map((item) => normalizeKey(item.key)).filter(Boolean)
        );
        runtime.selectedKeys = getMailFeedSelectedKeys(feedKey).filter((key) =>
          availableSelectionKeys.has(normalizeKey(key))
        );
        container.dataset.mailFeedView = runtime.view;
        container.dataset.mailFeedDensity = runtime.density;
        container.classList.toggle("is-list-view", runtime.view === "list");
        container.innerHTML = "";
        const selectionCountNode = mailFeedSelectionCountNodes.find(
          (node) => normalizeKey(node.dataset.mailFeedSelectionCount) === feedKey
        );
        if (selectionCountNode) {
          selectionCountNode.textContent = `${runtime.selectedKeys.length} markerade`;
        }
        const selectAllButton = mailFeedSelectAllButtons.find(
          (button) => normalizeKey(button.dataset.mailFeedSelectAll) === feedKey
        );
        if (selectAllButton) {
          const visibleKeys = items.map((item) => normalizeKey(item.key)).filter(Boolean);
          const allVisibleSelected =
            visibleKeys.length > 0 && visibleKeys.every((key) => runtime.selectedKeys.includes(key));
          selectAllButton.textContent =
            allVisibleSelected && visibleKeys.length ? "Avmarkera alla" : "Markera alla";
        }
        mailFeedBulkButtons
          .filter((button) => normalizeKey(button.dataset.mailFeedBulk) === feedKey)
          .forEach((button) => {
            button.disabled = runtime.selectedKeys.length === 0;
          });
        if (!items.length) {
          const emptyCard = document.createElement("article");
          emptyCard.className = "mail-feed-card";
          const emptyState = getMailFeedEmptyState(feedKey);
          emptyCard.innerHTML =
            `<span class="mail-feed-card-label">${escapeHtml(emptyState.label)}</span>` +
            `<div class="mail-feed-card-head"><strong>${escapeHtml(emptyState.title)}</strong><span>${escapeHtml(emptyState.meta)}</span></div>` +
            `<p>${escapeHtml(emptyState.copy)}</p>` +
            `<div class="mail-feed-meta-row"><span>${escapeHtml(emptyState.scope)}</span><span>${escapeHtml(emptyState.context)}</span></div>` +
            `<div class="mail-feed-card-foot"><span>${escapeHtml(emptyState.hint)}</span></div>`;
          container.append(emptyCard);
          return;
        }

        const selectedKey = normalizeKey(state.selectedMailFeedKey[feedKey]);
        if (!items.some((item) => normalizeKey(item.key) === selectedKey)) {
          state.selectedMailFeedKey[feedKey] = items[0]?.key || "";
        }

        items.forEach((item) => {
          const card = document.createElement("article");
          card.className = "mail-feed-card";
          if (runtime.density === "compact") {
            card.classList.add("is-compact");
          }
          if (item.requiresAttention) {
            card.classList.add("is-attention");
          }
          card.dataset.mailFeedItem = feedKey;
          card.dataset.mailFeedKey = item.key;
          const isPrimarySelected = state.selectedMailFeedKey[feedKey] === item.key;
          const isBatchSelected = runtime.selectedKeys.includes(normalizeKey(item.key));
          card.classList.toggle("is-selected", isPrimarySelected);
          card.classList.toggle("is-batch-selected", isBatchSelected);
          card.innerHTML =
            `<div class="mail-feed-card-topline"><label class="mail-feed-card-selection"><input type="checkbox" data-mail-feed-select="${escapeHtml(feedKey)}" data-mail-feed-select-key="${escapeHtml(item.key)}"${isBatchSelected ? " checked" : ""} /><span>Välj</span></label><span class="mail-feed-card-label">${escapeHtml(item.mailbox)}</span><span class="mail-feed-card-stamp">${escapeHtml(item.meta)}</span></div>` +
            `<div class="mail-feed-card-head"><strong>${escapeHtml(item.customerName)}</strong><span>${escapeHtml(item.title)}</span></div>` +
            `<p>${escapeHtml(item.preview)}</p>` +
            `<div class="mail-feed-card-detail-grid"><span><strong>Ägare</strong>${escapeHtml(item.ownerLabel || "Oägd")}</span><span><strong>Status</strong>${escapeHtml(item.statusLabel || "-")}</span><span><strong>Väntar på</strong>${escapeHtml(item.waitingLabel || "-")}</span><span><strong>Nästa steg</strong>${escapeHtml(item.nextActionLabel || "-")}</span><span><strong>Historik</strong>${escapeHtml(item.historyLabel || "0 händelser")}</span></div>` +
            `<div class="mail-feed-meta-row"><span>${escapeHtml(item.mailbox)}</span><span>${escapeHtml(item.customerName)}</span><span>${escapeHtml(item.lifecycleLabel || "-")}</span><span>${escapeHtml(item.riskLabel || "-")}</span>${item.isVIP ? "<span>VIP</span>" : ""}${item.followUpLabel ? `<span>${escapeHtml(item.followUpLabel)}</span>` : ""}</div>` +
            `<div class="mail-feed-card-foot"><span>${escapeHtml(item.meta || item.waitingLabel || item.preview)}</span><button type="button" data-mail-feed-open="${escapeHtml(feedKey)}">${escapeHtml(feedKey === "later" ? "Återuppta" : "Öppna historik")}</button></div>`;
          container.append(card);
        });
      });
    }

    return Object.freeze({
      getMailFeedItems,
      getMailFeedRuntimeThreads,
      getSelectedMailFeedThread,
      renderMailFeedUndoState,
      renderMailFeeds,
      renderQueueHistorySection,
      renderRuntimeQueue,
      renderThreadContextRows,
    });
  }

  window.MajorArcanaPreviewQueueRenderers = Object.freeze({
    createQueueRenderers,
  });
})();
