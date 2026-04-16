(() => {
  function createFocusIntelRenderers({
    dom = {},
    helpers = {},
    state,
    windowObject = window,
  }) {
    const {
      focusTabs,
      focusBadgeRow,
      focusConversationSection,
      focusConversationLayout,
      focusWorkrail,
      focusSignals,
      focusCustomerGrid,
      focusCustomerHero,
      focusCustomerHistoryCount,
      focusCustomerHistoryDescription,
      focusCustomerHistoryList,
      focusCustomerHistoryMeta,
      focusCustomerHistoryState,
      focusCustomerHistoryListState,
      focusCustomerHistoryListStateCopy,
      focusCustomerHistoryReadoutButton,
      focusCustomerHistoryTitle,
      focusCustomerStats,
      focusCustomerSummary,
      focusHistoryCount,
      focusHistoryDeleteButton,
      focusHistoryDescription,
      focusHistoryList,
      focusHistoryMailboxRow,
      focusHistoryMeta,
      focusHistoryRangeRow,
      focusHistoryReadoutButton,
      focusHistoryScope,
      focusHistorySearchInput,
      focusHistoryTitle,
      focusHistoryTypeRow,
      focusNotesCount,
      focusNotesEmpty,
      focusNotesList,
      focusStatusLine,
      focusTitle,
      focusIntelPrimary,
      focusIntelPrimaryBody,
      focusIntelTitle,
      intelCustomer,
      intelDateButton,
      intelGrid,
      focusIntelReason,
      focusIntelPanels,
      focusIntelTabs,
      intelPanelActions,
      intelPanelCustomer,
      intelPanelHistory,
      intelPanelMedicine,
      intelPanelSignals,
      intelPanelTeam,
      intelReasonCopy,
    } = dom;

    const {
      asArray,
      asNumber,
      asText,
      buildCustomerHistoryEvents,
      buildCustomerSummaryCards,
      buildFocusHistoryScopeCards,
      buildIntelHelperConversation,
      buildRuntimeSummaryCards,
      compactRuntimeCopy,
      decorateStaticPills,
      escapeHtml,
      filterHistoryEvents,
      formatConversationTime,
      formatHistoryTimestamp,
      getCustomerHistoryMailboxOptions,
      getRelatedCustomerThreads,
      getScopedActivityNotes,
      getSelectedRuntimeThread,
      getStudioSignatureProfile,
      getThreadHistoryMailboxOptions,
      humanizeCode,
      initialsForName,
      isOfflineHistoryContextThread,
      isOfflineHistorySelectionActive,
      joinReadableList,
      normalizeKey,
      normalizeText,
      pillIconSvgs,
      renderFocusSummaryCards,
      renderHistoryEventsList,
      renderHistoryFilterRow,
      resetRuntimeHistoryFilters,
      sanitizeConversationHtmlForDisplay,
      setButtonBusy,
    } = helpers;
    const focusCustomerHistoryToneClasses = [
      "focus-customer-chip--blue",
      "focus-customer-chip--violet",
      "focus-customer-chip--gold",
      "focus-customer-chip--green",
    ];

    function setCustomerHistoryState(text, tone = "green") {
      if (!focusCustomerHistoryState) return;
      focusCustomerHistoryState.textContent = asText(text, "");
      focusCustomerHistoryState.classList.remove(...focusCustomerHistoryToneClasses);
      focusCustomerHistoryState.classList.add(`focus-customer-chip--${tone}`);
    }

    function setCustomerHistoryListState(text, copy = "", tone = "green") {
      if (focusCustomerHistoryListState) {
        focusCustomerHistoryListState.textContent = asText(text, "");
        focusCustomerHistoryListState.classList.remove(...focusCustomerHistoryToneClasses);
        focusCustomerHistoryListState.classList.add(`focus-customer-chip--${tone}`);
      }
      if (focusCustomerHistoryListStateCopy) {
        focusCustomerHistoryListStateCopy.textContent = asText(copy, "");
      }
    }

    const conversationSystemBlockPatterns = [
      /^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
      /^Vissa\s+som\s+har\s+f[aå]tt\s+det\s+h[aä]r\s+meddelandet\s+f[aå]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i,
      /^You\s+don['’]t\s+often\s+get\s+email\s+from\s+\S+\.?\s*/i,
      /^Power up your productivity with Microsoft 365\.?\s*/i,
      /^Get more done with apps like Word\.?\s*/i,
      /^Learn why this is important\.?\s*/i,
      /^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i,
      /^Read more about why this is important\.?\s*/i,
    ];
    const conversationQuotedReplyPatterns = [
      /(?:^|\n)(?:\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
      /(?:^|\n)(?:\S+\s+\d{1,2}\s+\S.+?\bskrev\b.+:)[\s\S]*$/i,
      /(?:^|\n)On\s+.+?\bwrote:\s*[\s\S]*$/i,
      /\n(?:Från|From):\s*.+?(?:Datum|Date):\s*.+?(?:Till|To):\s*.+?(?:Ämne|Subject):\s*[\s\S]*$/i,
      /(?:^|\n)_{10,}[\s\S]*$/i,
      /(?:^|\n)(?:Från|From):\s*[\s\S]*$/i,
    ];
    const conversationSignatureMarkerPattern =
      /^(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Mvh|Skickat från Outlook för Mac|Skickat från min iPhone|Sent from Outlook for Mac|Sent from my iPhone)\b/i;
    const conversationSignatureIdentityPattern =
      /(?:@[A-Z0-9._%+-]+|https?:\/\/|www\.|\+?\d[\d\s().-]{5,}|Hair TP Clinic|Vasaplatsen|Göteborg)/i;
    const conversationBlockTagNames = new Set([
      "ARTICLE",
      "DIV",
      "FOOTER",
      "HEADER",
      "LI",
      "OL",
      "P",
      "SECTION",
      "TABLE",
      "TBODY",
      "TD",
      "TR",
      "UL",
    ]);
    const conversationWrapperTagNames = new Set([
      "ARTICLE",
      "DIV",
      "SECTION",
      "TABLE",
      "TBODY",
      "TR",
      "TD",
    ]);
    const hairTpSignatureProfilesByMailbox = Object.freeze({
      "egzona@hairtpclinic.com": Object.freeze({
        fullName: "Egzona Krasniqi",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      "fazli@hairtpclinic.com": Object.freeze({
        fullName: "Fazli Krasniqi",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
    });
    const hairTpSignatureProfilesByIdentity = Object.freeze({
      "egzona krasniqi": Object.freeze({
        fullName: "Egzona Krasniqi",
        email: "egzona@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      "egzona@hairtpclinic.com": Object.freeze({
        fullName: "Egzona Krasniqi",
        email: "egzona@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      egzona: Object.freeze({
        fullName: "Egzona Krasniqi",
        email: "egzona@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      "fazli krasniqi": Object.freeze({
        fullName: "Fazli Krasniqi",
        email: "fazli@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      "fazli@hairtpclinic.com": Object.freeze({
        fullName: "Fazli Krasniqi",
        email: "fazli@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
      fazli: Object.freeze({
        fullName: "Fazli Krasniqi",
        email: "fazli@hairtpclinic.com",
        title: "Hårspecialist | Hårtransplantationer & PRP-injektioner",
      }),
    });

    function setRuntimeActionRowsVisibility(selector, visible) {
      const documentObject = windowObject.document;
      if (!documentObject) return;
      documentObject.querySelectorAll(selector).forEach((row) => {
        row.hidden = !visible;
      });
    }

    function setElementVisibility(node, visible) {
      if (!node) return;
      node.hidden = !visible;
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function buildConversationContentMarkup(message, { history = false } = {}) {
      const bodyText = asText(message?.conversationBody || message?.body).trim();
      const mimePreferredBody = getMimePreferredConversationBody(message);
      const richHtml =
        typeof sanitizeConversationHtmlForDisplay === "function"
          ? sanitizeConversationHtmlForDisplay(
              asText(
                message?.conversationBodyHtml,
                asText(
                  message?.bodyHtml,
                  mimePreferredBody?.kind === "html" ? mimePreferredBody.html : ""
                )
              )
            )
          : "";
      const deriveConversationRichContract = (value = "", { history = false } = {}) => {
        const normalizedHtml = asText(value);
        if (!normalizedHtml) {
          return {
            variantClass: "",
            containerClass: history
              ? "conversation-history-text conversation-history-text-rich"
              : "conversation-mail-body conversation-mail-body-rich conversation-mail-body-document conversation-mail-body-plain",
          };
        }
        const normalizedText = normalizeText(
          normalizedHtml
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(?:p|div|li|tr|table|ul|ol)>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
        );
        const richBlockCount = (
          normalizedHtml.match(/<(?:table|tr|td|p|div|li|ul|ol|img|a)\b/gi) || []
        ).length;
        const tableCount = (normalizedHtml.match(/<table\b/gi) || []).length;
        const imgCount = (normalizedHtml.match(/<img\b/gi) || []).length;
        const linkCount = (normalizedHtml.match(/<a\b/gi) || []).length;
        const richClasses = [];
        if (
          tableCount > 0 ||
          imgCount > 0 ||
          richBlockCount >= 8 ||
          normalizedText.length >= 220
        ) {
          richClasses.push("conversation-rich-compact");
        }
        if (
          imgCount > 0 ||
          /(?:B[aä]sta hälsningar|Med vänlig hälsning|Vänliga hälsningar|Best regards|Regards|Hälsningar|MVH|Hair TP Clinic|@[A-Z0-9._%+-]+|https?:\/\/|www\.|\+?\d[\d\s().-]{5,})/i.test(
            normalizedText
          )
        ) {
          richClasses.push("conversation-rich-identity");
        }
        if (
          tableCount >= 2 ||
          (tableCount >= 1 && richBlockCount >= 10) ||
          (tableCount >= 1 && normalizedText.length >= 110 && linkCount <= 4)
        ) {
          richClasses.push("conversation-rich-tabular");
        }
        return {
          variantClass: richClasses.join(" "),
          containerClass: history
            ? "conversation-history-text conversation-history-text-rich"
            : "conversation-mail-body conversation-mail-body-rich conversation-mail-body-document",
        };
      };
      if (richHtml) {
        const { variantClass, containerClass } = deriveConversationRichContract(richHtml, {
          history,
        });
        return `<div class="${containerClass}${
          variantClass ? ` ${variantClass}` : ""
        }">${richHtml}</div>`;
      }
      return `<div class="${
        history
          ? "conversation-history-text"
          : "conversation-mail-body conversation-mail-body-document conversation-mail-body-plain"
      }">${escapeHtml(bodyText)}</div>`;
    }

    function getCanonicalMailThreadMessage(message) {
      return message?.mailThreadMessage && typeof message.mailThreadMessage === "object"
        ? message.mailThreadMessage
        : null;
    }

    function getCanonicalMailDocument(message) {
      return message?.mailDocument && typeof message.mailDocument === "object"
        ? message.mailDocument
        : null;
    }

    function getMimePreferredConversationBody(message) {
      const mailDocument = getCanonicalMailDocument(message);
      const parsedBody =
        mailDocument?.mime?.parsed?.body && typeof mailDocument.mime.parsed.body === "object"
          ? mailDocument.mime.parsed.body
          : null;
      return {
        html: asText(parsedBody?.preferredHtml).trim(),
        text: asText(parsedBody?.preferredText).trim(),
        kind: normalizeKey(
          mailDocument?.fidelity?.mimePreferredBodyKind || mailDocument?.mime?.parsed?.preferredBodyKind
        ),
      };
    }

    function formatConversationAssetSize(value = 0) {
      const size = asNumber(value, 0);
      if (!Number.isFinite(size) || size <= 0) return "";
      if (size >= 1024 * 1024) {
        return `${Math.max(0.1, Math.round((size / (1024 * 1024)) * 10) / 10)} MB`;
      }
      if (size >= 1024) {
        return `${Math.max(1, Math.round(size / 1024))} KB`;
      }
      return `${Math.max(1, Math.round(size))} B`;
    }

    function getConversationAssetFamily(asset = {}) {
      const canonicalFamily = normalizeKey(asset?.family);
      if (
        canonicalFamily === "attachment" ||
        canonicalFamily === "inline" ||
        canonicalFamily === "external"
      ) {
        return canonicalFamily;
      }
      const disposition = normalizeKey(asset?.disposition);
      const kind = normalizeKey(asset?.kind);
      const contentType = normalizeKey(asset?.contentType);
      const renderState = normalizeKey(asset?.render?.state);
      const renderMode = normalizeKey(asset?.render?.mode);
      if (renderState === "external_https" || renderMode === "external_url") {
        return "external";
      }
      if (disposition === "attachment") return "attachment";
      if (disposition === "inline" && (kind === "image" || contentType.startsWith("image/"))) {
        return "inline";
      }
      if (disposition === "inline") return "inline";
      if (kind === "attachment") return "attachment";
      return "inline";
    }

    function describeConversationAssetKind(asset = {}) {
      const family = getConversationAssetFamily(asset);
      if (family === "external") return "Extern länk";
      if (family === "attachment") return "Bilaga";
      return "Bild i mailet";
    }

    function describeConversationAssetStatus(asset = {}) {
      const family = getConversationAssetFamily(asset);
      const renderState = normalizeKey(asset?.render?.state);
      const renderMode = normalizeKey(asset?.render?.mode);
      const downloadAvailable = asset?.download?.available === true;
      if (family === "attachment") {
        return downloadAvailable ? "Bifogad fil" : "Bilagemetadata";
      }
      if (family === "external") {
        return "Extern länk";
      }
      if (renderState === "embedded_in_body_html") return "Visas i mailet";
      if (renderState === "attachment_content_available" || renderMode === "attachment_content") {
        return downloadAvailable ? "Visas i mailet och kan öppnas" : "Inline tillgänglig";
      }
      if (renderState === "cid_unresolved") {
        return "CID väntar på upplösning";
      }
      if (renderState === "cid_attachment_metadata_only") {
        return "Inline-källa finns som metadata";
      }
      if (renderState === "inline_attachment_metadata_only") {
        return "Inline-markering utan filinnehåll";
      }
      if (downloadAvailable) return "Nedladdningsbar via Graph";
      return "Metadata tillgänglig";
    }

    function getConversationAssetTone(asset = {}) {
      const family = getConversationAssetFamily(asset);
      const renderState = normalizeKey(asset?.render?.state);
      const renderMode = normalizeKey(asset?.render?.mode);
      if (family === "attachment") {
        return asset?.download?.available === true ? "neutral" : "metadata";
      }
      if (
        renderState === "cid_unresolved" ||
        renderState === "cid_attachment_metadata_only" ||
        renderState === "inline_attachment_metadata_only"
      ) {
        return "attention";
      }
      if (renderState === "external_https" || renderMode === "external_url") {
        return "external";
      }
      if (asset?.download?.available === true || asset?.render?.safe === true) {
        return "available";
      }
      return "metadata";
    }

    function buildConversationAssetSummaryPillMarkup(label = "", tone = "neutral") {
      const copy = asText(label).trim();
      if (!copy) return "";
      return `<span class="conversation-mail-asset-pill conversation-mail-asset-pill-${escapeHtml(
        tone
      )}">${escapeHtml(copy)}</span>`;
    }

    function buildConversationAssetSummaryParts({
      attachmentAssets = [],
      renderableInlineAssets = [],
      unresolvedInlineAssets = [],
    } = {}) {
      return [
        attachmentAssets.length
          ? `${attachmentAssets.length} ${attachmentAssets.length === 1 ? "bilaga" : "bilagor"}`
          : "",
        renderableInlineAssets.length
          ? `${renderableInlineAssets.length} ${
              renderableInlineAssets.length === 1 ? "inline i mailet" : "inline i mailet"
            }`
          : "",
        unresolvedInlineAssets.length
          ? `${unresolvedInlineAssets.length} behöver fallback`
          : "",
      ].filter(Boolean);
    }

    function canOpenConversationAsset(asset = {}) {
      if (asset?.download?.available !== true) return false;
      const contentType = normalizeKey(asset?.contentType);
      return (
        contentType.startsWith("image/") ||
        contentType.startsWith("text/") ||
        contentType === "application/pdf" ||
        contentType.endsWith("+xml") ||
        contentType.endsWith("/json")
      );
    }

    function buildConversationAssetActionButtonMarkup(
      action = "download",
      asset,
      { mailboxId = "", messageId = "" } = {}
    ) {
      const safeMailboxId = asText(mailboxId).trim();
      const safeMessageId = asText(messageId).trim();
      const safeAttachmentId = asText(
        asset?.download?.attachmentId,
        asset?.attachmentId,
        asset?.assetId
      ).trim();
      if (!safeMailboxId || !safeMessageId || !safeAttachmentId) return "";
      const label = action === "open" ? "Öppna" : "Ladda ner";
      return `<button type="button" class="conversation-mail-asset-action" data-mail-asset-action="${escapeHtml(
        action
      )}" data-mail-asset-mailbox-id="${escapeHtml(
        safeMailboxId
      )}" data-mail-asset-message-id="${escapeHtml(
        safeMessageId
      )}" data-mail-asset-attachment-id="${escapeHtml(
        safeAttachmentId
      )}" data-mail-asset-name="${escapeHtml(asText(asset?.name, "bilaga"))}">
        ${escapeHtml(label)}
      </button>`;
    }

    function buildConversationAssetActionsMarkup(asset, { history = false, mailboxId = "", messageId = "" } = {}) {
      if (history || asset?.download?.available !== true) return "";
      const buttons = [
        canOpenConversationAsset(asset)
          ? buildConversationAssetActionButtonMarkup("open", asset, { mailboxId, messageId })
          : "",
        buildConversationAssetActionButtonMarkup("download", asset, { mailboxId, messageId }),
      ]
        .filter(Boolean)
        .join("");
      if (!buttons) return "";
      return `<div class="conversation-mail-asset-actions">${buttons}</div>`;
    }

    function buildConversationAssetItemMarkup(
      asset,
      { history = false, mailboxId = "", messageId = "" } = {}
    ) {
      if (!asset || typeof asset !== "object") return "";
      const family = getConversationAssetFamily(asset);
      const tone = getConversationAssetTone(asset);
      const name = asText(
        asset?.name,
        asset?.contentId,
        asset?.contentType,
        describeConversationAssetKind(asset)
      );
      const metaParts = [
        describeConversationAssetKind(asset),
        asText(asset?.contentType),
        formatConversationAssetSize(asset?.size),
      ].filter(Boolean);
      return `<div class="conversation-mail-asset-item conversation-mail-asset-item-${tone} conversation-mail-asset-item-family-${escapeHtml(
        family
      )}${
        history ? " conversation-mail-asset-item-history" : ""
      }" data-mail-asset-family="${escapeHtml(family)}">
        <div class="conversation-mail-asset-copy">
          <strong class="conversation-mail-asset-name">${escapeHtml(name)}</strong>
          <span class="conversation-mail-asset-meta">${escapeHtml(metaParts.join(" · "))}</span>
        </div>
        <div class="conversation-mail-asset-side">
          <span class="conversation-mail-asset-state">${escapeHtml(
            describeConversationAssetStatus(asset)
          )}</span>
          ${buildConversationAssetActionsMarkup(asset, { history, mailboxId, messageId })}
        </div>
      </div>`;
    }

    function collectConversationAssetCollections(message) {
      const mailDocument = getCanonicalMailDocument(message);
      if (!mailDocument) return null;
      const dedupeAssets = (items = []) => {
        const visibleAssets = [];
        const seenAssetIds = new Set();
        asArray(items).forEach((asset) => {
          const assetId = asText(
            asset?.assetId,
            asset?.attachmentId,
            asset?.contentId,
            asset?.name,
            asset?.download?.attachmentId
          );
          if (!assetId || seenAssetIds.has(assetId)) return;
          seenAssetIds.add(assetId);
          visibleAssets.push(asset);
        });
        return visibleAssets;
      };
      const allAssets = dedupeAssets(
        asArray(mailDocument?.assets).length
          ? asArray(mailDocument.assets)
          : [...asArray(mailDocument?.attachments), ...asArray(mailDocument?.inlineAssets)]
      );
      const attachmentAssets = dedupeAssets(
        allAssets.filter((asset) => getConversationAssetFamily(asset) === "attachment")
      );
      const inlineAssets = dedupeAssets(
        allAssets.filter((asset) => getConversationAssetFamily(asset) === "inline")
      );
      const externalInlineAssets = dedupeAssets(
        allAssets.filter((asset) => getConversationAssetFamily(asset) === "external")
      );
      const renderableInlineAssets = dedupeAssets(
        inlineAssets.filter((asset) => asset?.render?.safe === true)
      );
      const unresolvedInlineAssets = dedupeAssets(
        allAssets.filter((asset) => {
          const family = getConversationAssetFamily(asset);
          if (family === "external") return true;
          if (family !== "inline") return false;
          return asset?.render?.safe !== true;
        })
      );
      const imageInlineAssets = dedupeAssets(
        inlineAssets.filter((asset) => {
          const contentType = normalizeKey(asset?.contentType);
          return normalizeKey(asset?.kind) === "image" || contentType.startsWith("image/");
        })
      );
      return {
        mailDocument,
        allAssets,
        attachmentAssets,
        inlineAssets,
        imageInlineAssets,
        renderableInlineAssets,
        unresolvedInlineAssets,
        externalInlineAssets,
        bodyVisibleAssets: dedupeAssets([...attachmentAssets, ...unresolvedInlineAssets]),
        headerVisibleAssets: dedupeAssets([
          ...attachmentAssets,
          ...renderableInlineAssets,
          ...unresolvedInlineAssets,
        ]),
      };
    }

    function buildConversationHeaderAssetIconMarkup(kind = "attachment") {
      if (kind === "inline") {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="2.8" width="11.6" height="10.4" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M4.6 10.4 7.1 7.9l1.8 1.8 2.1-2.5 1.4 2.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /><circle cx="5.8" cy="5.9" r="1.15" fill="currentColor" /></svg>`;
      }
      if (kind === "external") {
        return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.1 3.2H12.8V7.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /><path d="M7.4 8.6 12.5 3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5" /><path d="M6.8 4.1H4.7A1.7 1.7 0 0 0 3 5.8v5.5A1.7 1.7 0 0 0 4.7 13h5.5A1.7 1.7 0 0 0 12 11.3V9.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>`;
      }
      return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.3 8.5 9.9 4.9a2.2 2.2 0 0 1 3.1 3.1l-4.7 4.7a3.2 3.2 0 1 1-4.5-4.5L8.1 3.9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>`;
    }

    function buildConversationHeaderAssetTokenMarkup(
      { kind = "attachment", tone = "neutral", count = 0, label = "" } = {}
    ) {
      const safeCount = Math.max(0, asNumber(count, 0));
      if (!safeCount) return "";
      const shortLabel =
        kind === "inline" ? "Bild" : kind === "external" ? "Extern" : "Bilaga";
      return `<span class="conversation-header-asset-token conversation-header-asset-token-${escapeHtml(
        tone
      )}" title="${escapeHtml(asText(label).trim())}" data-mail-asset-family="${escapeHtml(
        kind
      )}">
        <span class="conversation-header-asset-token-icon">${buildConversationHeaderAssetIconMarkup(
          kind
        )}</span>
        <span class="conversation-header-asset-token-label">${escapeHtml(shortLabel)}</span>
        <span class="conversation-header-asset-token-count">${escapeHtml(String(safeCount))}</span>
      </span>`;
    }

    function buildConversationHeaderAssetStripMarkup(message, { history = false } = {}) {
      const assetCollections = collectConversationAssetCollections(message);
      if (!assetCollections) return "";
      const {
        mailDocument,
        attachmentAssets,
        imageInlineAssets,
        externalInlineAssets,
        headerVisibleAssets,
      } = assetCollections;
      if (!headerVisibleAssets.length) return "";
      const displayedAssets = headerVisibleAssets.slice(0, history ? 3 : 5);
      const remainingCount = Math.max(0, headerVisibleAssets.length - displayedAssets.length);
      const mailboxId = asText(
        mailDocument?.mailboxAddress,
        mailDocument?.mailboxId,
        mailDocument?.userPrincipalName
      );
      const messageIdForAsset = asText(
        displayedAssets.find((asset) => asText(asset?.graphMessageId, asset?.messageId).trim())
          ?.graphMessageId,
        displayedAssets.find((asset) => asText(asset?.messageId).trim())?.messageId,
        mailDocument?.graphMessageId,
        mailDocument?.messageId
      );
      const summaryTokens = [
        buildConversationHeaderAssetTokenMarkup({
          kind: "inline",
          tone: "available",
          count: imageInlineAssets.length,
          label: `${imageInlineAssets.length} ${
            imageInlineAssets.length === 1 ? "bild i mailet" : "bilder i mailet"
          }`,
        }),
        buildConversationHeaderAssetTokenMarkup({
          kind: "attachment",
          tone: "neutral",
          count: attachmentAssets.length,
          label: `${attachmentAssets.length} ${
            attachmentAssets.length === 1 ? "bilaga" : "bilagor"
          }`,
        }),
        buildConversationHeaderAssetTokenMarkup({
          kind: "external",
          tone: "attention",
          count: externalInlineAssets.length,
          label: `${externalInlineAssets.length} ${
            externalInlineAssets.length === 1 ? "extern länk" : "externa länkar"
          }`,
        }),
      ]
        .filter(Boolean)
        .join("");
      if (!summaryTokens) return "";
      const summaryLabel = [
        imageInlineAssets.length
          ? `${imageInlineAssets.length} ${imageInlineAssets.length === 1 ? "bild" : "bilder"}`
          : "",
        attachmentAssets.length
          ? `${attachmentAssets.length} ${attachmentAssets.length === 1 ? "bilaga" : "bilagor"}`
          : "",
        externalInlineAssets.length
          ? `${externalInlineAssets.length} ${
              externalInlineAssets.length === 1 ? "extern länk" : "externa länkar"
            }`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `<details class="conversation-header-assets${
        history ? " conversation-header-assets-history" : ""
      }" data-conversation-header-assets>
        <summary class="conversation-header-assets-summary" data-conversation-header-assets-toggle aria-label="${escapeHtml(
          `Visa tillgångar i mailet: ${summaryLabel || "Bilagor och tillgångar"}`
        )}">
          <span class="conversation-header-assets-tokens">${summaryTokens}</span>
        </summary>
        <div class="conversation-header-assets-popover">
          <div class="conversation-header-assets-popover-head">
            <strong class="conversation-header-assets-title">Tillgångar i mailet</strong>
            <span class="conversation-header-assets-caption">${escapeHtml(summaryLabel)}</span>
          </div>
          <div class="conversation-mail-asset-list conversation-header-assets-list">
            ${displayedAssets
              .map((asset) =>
                buildConversationAssetItemMarkup(asset, {
                  history,
                  mailboxId,
                  messageId: asText(
                    asset?.graphMessageId,
                    asset?.messageId,
                    messageIdForAsset
                  ),
                })
              )
              .join("")}
          </div>
          ${
            remainingCount > 0
              ? `<p class="conversation-header-assets-note">+${remainingCount} fler tillgångar finns i det här mailet.</p>`
              : ""
          }
        </div>
      </details>`;
    }

    function buildConversationAssetSectionMarkup(message, { history = false } = {}) {
      return "";
    }

    function buildFocusStatusTokenMarkup({ label = "", tone = "neutral", icon = "" } = {}) {
      const normalizedLabel = asText(label).trim();
      if (!normalizedLabel) return "";
      const normalizedIcon = normalizeKey(icon);
      const iconAttribute =
        normalizedIcon && pillIconSvgs?.[normalizedIcon]
          ? ` data-pill-icon="${escapeHtml(normalizedIcon)}"`
          : "";
      return `<span class="focus-status-token focus-status-token-${escapeHtml(
        tone
      )}"${iconAttribute}>${escapeHtml(normalizedLabel)}</span>`;
    }

    function buildFocusStatusRowMarkup(items = []) {
      const tokens = asArray(items)
        .map((item) => buildFocusStatusTokenMarkup(item))
        .filter(Boolean);
      return tokens
        .map((tokenMarkup, index) =>
          index === 0
            ? tokenMarkup
            : `<span class="focus-status-separator" aria-hidden="true">·</span>${tokenMarkup}`
        )
        .join("");
    }

    function buildConversationSectionTextMarkup(value = "") {
      return escapeHtml(asText(value).trim());
    }

    function extractConversationSectionTextFromHtml(value = "") {
      return normalizeText(
        asText(value)
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(?:p|div|li|tr|table|ul|ol|section|article|header|footer)>/gi, "\n")
          .replace(/<li\b[^>]*>/gi, "• ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;|&apos;/gi, "'")
          .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
            const parsed = Number.parseInt(code, 16);
            return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
          })
          .replace(/&#([0-9]+);/g, (_match, code) => {
            const parsed = Number.parseInt(code, 10);
            return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : " ";
          })
          .replace(/\r/g, "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
      );
    }

    function matchesConversationPattern(text = "", patterns = []) {
      const normalized = asText(text).trim();
      return Boolean(normalized) && patterns.some((pattern) => pattern.test(normalized));
    }

    function getConversationOwnText(node) {
      if (!node?.childNodes) return "";
      return normalizeText(
        Array.from(node.childNodes)
          .filter((childNode) => childNode?.nodeType === windowObject.Node.TEXT_NODE)
          .map((childNode) => asText(childNode.textContent))
          .join(" ")
      );
    }

    function getConversationMeaningfulChildNodes(node) {
      if (!node?.childNodes) return [];
      return Array.from(node.childNodes).filter((childNode) => {
        if (!childNode) return false;
        if (childNode.nodeType === windowObject.Node.TEXT_NODE) {
          return Boolean(normalizeText(childNode.textContent));
        }
        if (childNode.nodeType !== windowObject.Node.ELEMENT_NODE) return false;
        return childNode.tagName !== "BR";
      });
    }

    function shouldUnwrapConversationSectionNode(node) {
      if (!node || node.nodeType !== windowObject.Node.ELEMENT_NODE) return false;
      if (!conversationWrapperTagNames.has(node.tagName)) return false;
      const meaningfulChildren = getConversationMeaningfulChildNodes(node);
      if (!meaningfulChildren.length) return false;
      const ownText = getConversationOwnText(node);
      const hasDirectAsset = Array.from(node.children || []).some(
        (childNode) => childNode.tagName === "IMG" || childNode.tagName === "A"
      );
      if (hasDirectAsset || ownText.length > 40) return false;
      if (meaningfulChildren.length === 1 && meaningfulChildren[0]?.nodeType === windowObject.Node.ELEMENT_NODE) {
        return true;
      }
      const blockChildren = meaningfulChildren.filter(
        (childNode) =>
          childNode?.nodeType === windowObject.Node.ELEMENT_NODE &&
          conversationBlockTagNames.has(childNode.tagName)
      );
      return blockChildren.length >= 2;
    }

    function collectConversationSectionBlocksFromNode(node, documentObject) {
      if (!node) return [];
      if (node.nodeType === windowObject.Node.TEXT_NODE) {
        const text = normalizeText(node.textContent);
        if (!text) return [];
        const fragment = documentObject.createElement("p");
        fragment.textContent = text;
        return [
          {
            text,
            html: fragment.outerHTML,
          },
        ];
      }
      if (node.nodeType !== windowObject.Node.ELEMENT_NODE) return [];
      if (node.tagName === "BR") return [];
      if (shouldUnwrapConversationSectionNode(node)) {
        return getConversationMeaningfulChildNodes(node).flatMap((childNode) =>
          collectConversationSectionBlocksFromNode(childNode, documentObject)
        );
      }
      const html = asText(node.outerHTML).trim();
      const text = extractConversationSectionTextFromHtml(html);
      if (!html || !text) return [];
      return [
        {
          text,
          html,
          hasVisualCue: /<img\b/i.test(html),
          hasFooterCue:
            /conversation-html-footer-fragment/.test(html) ||
            conversationSignatureIdentityPattern.test(text),
        },
      ];
    }

    function buildConversationStructuredSections(message, mailThreadMessage) {
      const mailDocument = getCanonicalMailDocument(message);
      const canonicalSectionMode = normalizeKey(mailThreadMessage?.contentSections?.mode);
      const mimePreferredBody = getMimePreferredConversationBody(message);
      const canonicalMimePreferredKind = normalizeKey(
        mailThreadMessage?.contentSections?.mimePreferredBodyKind ||
          mailDocument?.fidelity?.mimePreferredBodyKind ||
          mailDocument?.mime?.parsed?.preferredBodyKind
      );
      const canonicalPrimaryHtml = asText(
        mailThreadMessage?.primaryBody?.html,
        canonicalMimePreferredKind === "html" ? mimePreferredBody.html : ""
      ).trim();
      const canonicalSignatureHtml = asText(mailThreadMessage?.signatureBlock?.html).trim();
      const canonicalQuotedHtml = asArray(mailThreadMessage?.quotedBlocks)
        .map((block) => asText(block?.html).trim())
        .filter(Boolean)
        .join("");
      const canonicalSystemHtml = asArray(mailThreadMessage?.systemBlocks)
        .map((block) => asText(block?.html).trim())
        .filter(Boolean)
        .join("");
      if (
        canonicalSectionMode === "html_structured" &&
        (canonicalPrimaryHtml || canonicalSignatureHtml || canonicalQuotedHtml || canonicalSystemHtml)
      ) {
        return {
          primaryBody: {
            text: asText(mailThreadMessage?.primaryBody?.text).trim(),
            html: canonicalPrimaryHtml || null,
          },
          signatureBlock: mailThreadMessage?.signatureBlock
            ? {
                text: asText(mailThreadMessage?.signatureBlock?.text).trim(),
                html: canonicalSignatureHtml || null,
                truth:
                  mailThreadMessage?.signatureBlock?.truth &&
                  typeof mailThreadMessage.signatureBlock.truth === "object"
                    ? mailThreadMessage.signatureBlock.truth
                    : null,
              }
            : null,
          quotedBlocks: asArray(mailThreadMessage?.quotedBlocks).map((block) => ({
            text: asText(block?.text).trim(),
            html: asText(block?.html).trim() || null,
          })),
          systemBlocks: asArray(mailThreadMessage?.systemBlocks).map((block) => ({
            text: asText(block?.text).trim(),
            html: asText(block?.html).trim() || null,
          })),
        };
      }

      const rawPrimaryHtml = asText(
        canonicalPrimaryHtml,
        asText(
          message?.conversationBodyHtml,
          asText(
            canonicalMimePreferredKind === "html" ? mimePreferredBody.html : "",
            asText(message?.bodyHtml, "")
          )
        )
      ).trim();
      const primaryBodyTextFallback = asText(
        mailThreadMessage?.primaryBody?.text,
        asText(
          canonicalMimePreferredKind === "html" ? mimePreferredBody.text : "",
          asText(message?.conversationBody, asText(message?.body, ""))
        )
      ).trim();
      const signatureTextFallback = asText(mailThreadMessage?.signatureBlock?.text).trim();
      const quotedTextFallback = asArray(mailThreadMessage?.quotedBlocks)
        .map((block) => asText(block?.text).trim())
        .filter(Boolean)
        .join("\n\n");
      const systemTextFallback = asArray(mailThreadMessage?.systemBlocks)
        .map((block) => asText(block?.text).trim())
        .filter(Boolean);
      const sanitizedHtml =
        typeof sanitizeConversationHtmlForDisplay === "function"
          ? sanitizeConversationHtmlForDisplay(rawPrimaryHtml)
          : rawPrimaryHtml;
      const documentObject = windowObject.document;
      if (!documentObject || !sanitizedHtml) {
        return {
          primaryBody: {
            text: primaryBodyTextFallback,
            html: rawPrimaryHtml || null,
          },
          signatureBlock: signatureTextFallback
            ? {
                text: signatureTextFallback,
                html: null,
                truth:
                  mailThreadMessage?.signatureBlock?.truth &&
                  typeof mailThreadMessage.signatureBlock.truth === "object"
                    ? mailThreadMessage.signatureBlock.truth
                    : null,
              }
            : null,
          quotedBlocks: quotedTextFallback ? [{ text: quotedTextFallback, html: null }] : [],
          systemBlocks: systemTextFallback.map((text) => ({ text, html: null })),
        };
      }

      const template = documentObject.createElement("template");
      template.innerHTML = sanitizedHtml;
      let contentNodes = getConversationMeaningfulChildNodes(template.content);
      while (
        contentNodes.length === 1 &&
        contentNodes[0]?.nodeType === windowObject.Node.ELEMENT_NODE &&
        shouldUnwrapConversationSectionNode(contentNodes[0])
      ) {
        contentNodes = getConversationMeaningfulChildNodes(contentNodes[0]);
      }

      const blocks = contentNodes.flatMap((node) =>
        collectConversationSectionBlocksFromNode(node, documentObject)
      );
      if (!blocks.length) {
        return {
          primaryBody: {
            text: primaryBodyTextFallback || extractConversationSectionTextFromHtml(sanitizedHtml),
            html: sanitizedHtml,
          },
          signatureBlock: signatureTextFallback
            ? {
                text: signatureTextFallback,
                html: null,
                truth:
                  mailThreadMessage?.signatureBlock?.truth &&
                  typeof mailThreadMessage.signatureBlock.truth === "object"
                    ? mailThreadMessage.signatureBlock.truth
                    : null,
              }
            : null,
          quotedBlocks: quotedTextFallback ? [{ text: quotedTextFallback, html: null }] : [],
          systemBlocks: systemTextFallback.map((text) => ({ text, html: null })),
        };
      }

      const systemBlocks = [];
      let index = 0;
      while (index < blocks.length && matchesConversationPattern(blocks[index]?.text, conversationSystemBlockPatterns)) {
        systemBlocks.push(blocks[index]);
        index += 1;
      }

      let quotedIndex = -1;
      for (let candidateIndex = index + 1; candidateIndex < blocks.length; candidateIndex += 1) {
        if (
          matchesConversationPattern(blocks[candidateIndex]?.text, conversationQuotedReplyPatterns) ||
          /^(?:Från|From|Datum|Date|Till|To|Ämne|Subject):/i.test(blocks[candidateIndex]?.text || "")
        ) {
          quotedIndex = candidateIndex;
          break;
        }
      }

      const bodyLimit = quotedIndex >= 0 ? quotedIndex : blocks.length;
      let signatureIndex = -1;
      for (let candidateIndex = index + 1; candidateIndex < bodyLimit; candidateIndex += 1) {
        const block = blocks[candidateIndex];
        const blockText = asText(block?.text).trim();
        const isNearTail = candidateIndex >= Math.max(index + 1, bodyLimit - 3);
        const hasSignatureCue =
          conversationSignatureMarkerPattern.test(blockText) ||
          (isNearTail &&
            (block?.hasFooterCue === true || block?.hasVisualCue === true) &&
            blockText.length <= 320);
        if (!hasSignatureCue) continue;
        signatureIndex = candidateIndex;
        break;
      }

      const primaryBlocks = blocks.slice(index, signatureIndex >= 0 ? signatureIndex : bodyLimit);
      const signatureBlocks =
        signatureIndex >= 0 ? blocks.slice(signatureIndex, bodyLimit) : [];
      const quotedBlocks = quotedIndex >= 0 ? blocks.slice(quotedIndex) : [];

      const joinBlockHtml = (sectionBlocks = []) =>
        sectionBlocks
          .map((block) => asText(block?.html).trim())
          .filter(Boolean)
          .join("");
      const joinBlockText = (sectionBlocks = []) =>
        sectionBlocks
          .map((block) => asText(block?.text).trim())
          .filter(Boolean)
          .join("\n\n")
          .trim();

      let primaryHtml = joinBlockHtml(primaryBlocks) || sanitizedHtml;
      let primaryText = joinBlockText(primaryBlocks) || primaryBodyTextFallback;
      let signatureHtml = joinBlockHtml(signatureBlocks);
      let signatureText = joinBlockText(signatureBlocks) || signatureTextFallback;
      const quotedHtml = joinBlockHtml(quotedBlocks);
      const quotedText = joinBlockText(quotedBlocks) || quotedTextFallback;
      const normalizedSystemBlocks = systemBlocks.length
        ? systemBlocks
        : systemTextFallback.map((text) => ({ text, html: null }));

      if (!signatureText && containsConversationHairTpSignatureMarkers(primaryHtml || primaryText)) {
        const recoveredSignatureSections = extractConversationHairTpSignatureFromPrimaryBody(
          primaryHtml,
          primaryText
        );
        if (recoveredSignatureSections?.signatureBlock?.text) {
          primaryHtml = asText(recoveredSignatureSections?.primaryBody?.html, primaryHtml).trim();
          primaryText = asText(recoveredSignatureSections?.primaryBody?.text, primaryText).trim();
          signatureHtml = asText(
            recoveredSignatureSections?.signatureBlock?.html,
            signatureHtml
          ).trim();
          signatureText = asText(
            recoveredSignatureSections?.signatureBlock?.text,
            signatureText
          ).trim();
        }
      }

      return {
        primaryBody: {
          text: primaryText,
          html: primaryHtml || null,
        },
        signatureBlock: signatureText
          ? {
              text: signatureText,
              html: signatureHtml || null,
              truth: deriveConversationSignatureTruth({
                text: signatureText,
                html: signatureHtml || null,
              }),
            }
          : null,
        quotedBlocks: quotedText
          ? [
              {
                text: quotedText,
                html: quotedHtml || null,
              },
            ]
          : [],
        systemBlocks: normalizedSystemBlocks.map((block) => ({
          text: asText(block?.text).trim(),
          html: asText(block?.html).trim() || null,
        })),
      };
    }

    function buildConversationSecondarySectionMarkup(
      { label = "", copy = "", html = "", tone = "neutral", collapsible = false, summary = "" } = {},
      { history = false } = {}
    ) {
      const normalizedCopy = asText(copy).trim();
      const normalizedHtml = asText(html).trim();
      if (!normalizedCopy && !normalizedHtml) return "";
      const sectionClass = `conversation-mail-section conversation-mail-section-${tone}${
        history ? " conversation-mail-section-history" : ""
      }`;
      const sectionContentMarkup = normalizedHtml
        ? buildConversationContentMarkup(
            {
              conversationBody: normalizedCopy,
              conversationBodyHtml: normalizedHtml,
              body: normalizedCopy,
              bodyHtml: normalizedHtml,
            },
            { history }
          )
        : buildConversationSectionTextMarkup(normalizedCopy);
      if (collapsible) {
        return `<details class="${sectionClass}">
          <summary class="conversation-mail-section-summary">${escapeHtml(
            asText(summary, label || "Visa mer")
          )}</summary>
          <div class="conversation-mail-section-copy${
            normalizedHtml ? " conversation-mail-section-copy-rich" : ""
          }">${sectionContentMarkup}</div>
        </details>`;
      }
      return `<section class="${sectionClass}">
        ${
          label
            ? `<span class="conversation-mail-section-label">${escapeHtml(label)}</span>`
            : ""
        }
        <div class="conversation-mail-section-copy${
          normalizedHtml ? " conversation-mail-section-copy-rich" : ""
        }">${sectionContentMarkup}</div>
      </section>`;
    }

    function collectConversationSignatureIdentityTokens(value = "") {
      const normalizedValue = asText(value).trim();
      if (!normalizedValue) return [];
      const emailMatches = normalizedValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
      const urlMatches = normalizedValue.match(/https?:\/\/\S+|www\.\S+/gi) || [];
      const phoneMatches = normalizedValue.match(/\+?\d[\d\s().-]{5,}/g) || [];
      return Array.from(
        new Set(
          [...emailMatches, ...urlMatches, ...phoneMatches]
            .map((item) => normalizeText(item).toLowerCase())
            .filter(Boolean)
        )
      );
    }

    function summarizeConversationSignatureIdentity(lines = [], tokens = []) {
      const candidateLine = asArray(lines).find((line) => {
        const normalizedLine = asText(line).trim();
        if (!normalizedLine) return false;
        if (conversationSignatureMarkerPattern.test(normalizedLine)) return false;
        if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalizedLine)) return false;
        if (/https?:\/\/|www\./i.test(normalizedLine)) return false;
        if (/\+?\d[\d\s().-]{5,}/.test(normalizedLine)) return false;
        return normalizedLine.length >= 2 && normalizedLine.length <= 72;
      });
      const identity = asText(candidateLine, tokens[0], "Visa avsändarfooter").trim();
      return compactRuntimeCopy(identity, "Visa avsändarfooter", 52);
    }

    function getConversationSignatureAssetBaseUrl() {
      const origin = normalizeText(windowObject?.location?.origin);
      return asText(origin, "https://arcana.hairtpclinic.se").replace(/\/+$/, "");
    }

    function isConversationGenericHairTpSignatureName(value = "") {
      return /^(?:Hair TP Clinic|Contact|Kons)$/i.test(asText(value).trim());
    }

    function containsConversationHairTpSignatureMarkers(value = "") {
      const normalizedValue = asText(value);
      if (!normalizedValue) return false;
      return /hairtpclinic(?:-mark-light|-mark-light-signature)?|hair tp clinic|@hairtpclinic\.com|vasaplatsen|hårspecialist|hårtransplantationer|prp-injektioner|instagram|facebook|webb|031-88 11 66/i.test(
        normalizedValue
      );
    }

    function resolveConversationHairTpProfileByIdentity(value = "") {
      const normalizedValue = normalizeText(value).toLowerCase();
      if (!normalizedValue) return null;
      return hairTpSignatureProfilesByIdentity[normalizedValue] || null;
    }

    function extractConversationHairTpProfileHint(message = {}, signatureBlock = {}) {
      const candidateValues = [
        signatureBlock?.text,
        signatureBlock?.html,
        message?.fromName,
        message?.senderName,
        message?.preview,
        message?.detail,
        message?.summary,
        message?.bodyPreview,
        message?.body,
        message?.bodyHtml,
        message?.conversationBody,
        message?.conversationBodyHtml,
        message?.author,
        message?.mailThreadMessage?.presentation?.previewText,
        message?.mailThreadMessage?.presentation?.conversationText,
        message?.mailThreadMessage?.primaryBody?.text,
        message?.mailDocument?.previewText,
        message?.mailDocument?.primaryBodyText,
      ];
      for (const candidateValue of candidateValues) {
        const directProfile = resolveConversationHairTpProfileByIdentity(candidateValue);
        if (directProfile) return directProfile;
        const normalizedCandidateValue = asText(candidateValue);
        if (!normalizedCandidateValue) continue;
        const explicitNameMatch = normalizedCandidateValue.match(
          /\b(Egzona Krasniqi|Fazli Krasniqi)\b/i
        );
        if (explicitNameMatch?.[1]) {
          const nameProfile = resolveConversationHairTpProfileByIdentity(explicitNameMatch[1]);
          if (nameProfile) return nameProfile;
        }
        const emailMatch = normalizedCandidateValue.match(/\b(egzona|fazli)@hairtpclinic\.com\b/i);
        if (emailMatch?.[0]) {
          const emailProfile = resolveConversationHairTpProfileByIdentity(emailMatch[0]);
          if (emailProfile) return emailProfile;
        }
      }
      return null;
    }

    function extractConversationHairTpSignatureFromPrimaryBody(
      primaryBodyHtml = "",
      primaryBodyText = ""
    ) {
      const normalizedPrimaryBodyHtml = asText(primaryBodyHtml).trim();
      const normalizedPrimaryBodyText = asText(primaryBodyText).trim();
      if (
        !containsConversationHairTpSignatureMarkers(normalizedPrimaryBodyHtml) &&
        !containsConversationHairTpSignatureMarkers(normalizedPrimaryBodyText)
      ) {
        return null;
      }

      const documentObject = windowObject.document;
      if (documentObject && normalizedPrimaryBodyHtml) {
        const template = documentObject.createElement("template");
        template.innerHTML = normalizedPrimaryBodyHtml;
        const candidateElements = Array.from(
          template.content.querySelectorAll("table, section, div, p")
        );
        const signatureElement = candidateElements
          .slice()
          .reverse()
          .find((element) => {
            const elementText = normalizeText(element.textContent);
            const elementHtml = asText(element.outerHTML);
            return (
              containsConversationHairTpSignatureMarkers(elementText) &&
              (/@hairtpclinic\.com/i.test(elementText) ||
                /hairtpclinic-mark-light|hair tp clinic/i.test(elementHtml))
            );
          });
        if (signatureElement) {
          const signatureNodes = [signatureElement];
          let previousSibling = signatureElement.previousSibling;
          while (previousSibling) {
            if (
              previousSibling.nodeType === windowObject.Node.TEXT_NODE &&
              !normalizeText(previousSibling.textContent)
            ) {
              signatureNodes.unshift(previousSibling);
              previousSibling = previousSibling.previousSibling;
              continue;
            }
            if (previousSibling.nodeType !== windowObject.Node.ELEMENT_NODE) break;
            const previousText = normalizeText(previousSibling.textContent);
            if (
              !previousText ||
              /^br$/i.test(previousSibling.nodeName) ||
              conversationSignatureMarkerPattern.test(previousText) ||
              isConversationGenericHairTpSignatureName(previousText)
            ) {
              signatureNodes.unshift(previousSibling);
              previousSibling = previousSibling.previousSibling;
              continue;
            }
            break;
          }
          const signatureHtml = signatureNodes
            .map((node) =>
              node.nodeType === windowObject.Node.ELEMENT_NODE
                ? asText(node.outerHTML)
                : escapeHtml(asText(node.textContent))
            )
            .join("")
            .trim();
          const signatureText = signatureNodes
            .map((node) => normalizeText(node.textContent))
            .filter(Boolean)
            .join("\n")
            .trim();
          signatureNodes.forEach((node) => node.remove());
          const recoveredPrimaryHtml = asText(template.innerHTML).trim();
          const recoveredPrimaryText = normalizeText(
            extractConversationSectionTextFromHtml(recoveredPrimaryHtml)
          );
          if (signatureText) {
            return {
              primaryBody: {
                text: recoveredPrimaryText,
                html: recoveredPrimaryHtml || null,
              },
              signatureBlock: {
                text: signatureText,
                html: signatureHtml || null,
              },
            };
          }
        }
      }

      const lines = normalizedPrimaryBodyText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const signatureStartIndex = lines.findIndex((line, index) => {
        if (index === 0) return false;
        return (
          conversationSignatureMarkerPattern.test(line) ||
          (containsConversationHairTpSignatureMarkers(line) &&
            lines.slice(index).some((candidate) => /@hairtpclinic\.com/i.test(candidate)))
        );
      });
      if (signatureStartIndex < 0) return null;
      const signatureText = lines.slice(signatureStartIndex).join("\n").trim();
      if (!containsConversationHairTpSignatureMarkers(signatureText)) return null;
      return {
        primaryBody: {
          text: lines.slice(0, signatureStartIndex).join("\n").trim(),
          html: normalizedPrimaryBodyHtml || null,
        },
        signatureBlock: {
          text: signatureText,
          html: null,
        },
      };
    }

    function normalizeHairTpSignatureTitle(value = "") {
      const normalizedValue = asText(value).trim();
      if (!normalizedValue) return "";
      return normalizedValue
        .replace(
          /\bHårspecialist\s+[Ii]\s+Hårtransplantationer\s*&\s*PRP-injektioner\b/i,
          "Hårspecialist | Hårtransplantationer & PRP-injektioner"
        )
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    const CCO_APPROVED_HAIR_TP_SIGNATURE_LOGO_URL =
      "https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png";
    const CCO_APPROVED_FAZLI_SIGNATURE_HTML = `<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html;charset=utf-8"/></head><body><table id="zs-output-sig" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse; width:516px;"><tbody><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 16px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#4A4946;display:inline;">Bästa hälsningar,</span></p></td></tr></tbody></table></td></tr><tr><td style="padding: 0px !important; width: inherit; height: inherit;"><table id="inner-table" border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td width="75" style="padding-right: 16px; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; line-height: 0px; padding-right: 1px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><img height="94" width="75" alt="" border="0" src="https://img2.gimm.io/9e99c2fb-11b4-402b-8a43-6022ede8aa2b/image.png"></p></td></tr></tbody></table></td><td style="border-collapse: collapse; background-color: rgb(215, 202, 193); width: 3px; vertical-align: super; padding: 0px !important; height: inherit;"></td><td style="border-collapse: collapse; padding-right: 16px; width: inherit; height: inherit;"></td><td style="padding: 0px !important; width: inherit; height: inherit;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 6px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#C2AA9C;display:inline;">Fazli Krasniqi</span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 700; padding-bottom: 4px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:700;color:#303030;display:inline;">Hårspecialist | Hårtransplantationer & PRP-injektioner</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="tel:031881166" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> 031-88 11 66&nbsp; </a></span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span><a target="_blank" rel="nofollow" href="mailto:contact@hairtpclinic.com" style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;text-decoration:none;"> contact@hairtpclinic.com </a></span></p></td></tr><tr><td style="border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-style: normal; line-height: 14px; font-weight: 400; padding-bottom: 8px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-style:normal;line-height:14px;font-weight:400;color:#303030;display:inline;">Vasaplatsen 2, 411 34 Göteborg</span></p></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="font-family:Arial,Helvetica,sans-serif;line-height:0px;font-size:1px;padding:0px!important;border-spacing:0px;margin:0px;border-collapse:collapse;"><tbody><tr><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://hairtpclinic.se/"><img height="24" width="24" alt="Visit website" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%228.5%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M4%2012h16%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%2F%3E%0A%20%20%3Cpath%20d%3D%22M12%203.5c2.6%202.5%204%205.34%204%208.5s-1.4%206-4%208.5c-2.6-2.5-4-5.34-4-8.5s1.4-6%204-8.5Z%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding-right: 10px; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.instagram.com/hairtpclinic/"><img height="24" width="24" alt="Visit instagram" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Crect%20x%3D%224.5%22%20y%3D%224.5%22%20width%3D%2215%22%20height%3D%2215%22%20rx%3D%224%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%223.3%22%20stroke%3D%22%23B9A89D%22%20stroke-width%3D%221.9%22%2F%3E%0A%20%20%3Ccircle%20cx%3D%2216.7%22%20cy%3D%227.3%22%20r%3D%221.15%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"><p style="margin: 0.04px;"><a style="font-size:0px;line-height:0px;" target="_blank" rel="nofollow" href="https://www.facebook.com/hairtpclinic/"><img height="24" width="24" alt="Visit facebook" border="0" src="data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20width%3D%2224%22%20height%3D%2224%22%20fill%3D%22none%22%3E%0A%20%20%3Cpath%20d%3D%22M13.2%2020v-7h2.35l.45-2.7H13.2V8.6c0-.95.4-1.6%201.8-1.6H16V4.55c-.4-.05-1.15-.15-2.2-.15-2.2%200-3.7%201.35-3.7%203.8v2.1H7.75V13h2.35v7h3.1Z%22%20fill%3D%22%23B9A89D%22%2F%3E%0A%3C%2Fsvg%3E%0A"></a></p></td><td style="padding: 0px !important; width: inherit; height: inherit;"></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="border-collapse: collapse; padding-bottom: 16px; width: inherit; height: inherit;"><span></span></td></tr></tbody></table></body></html>`;

    function getConversationSignatureLines(value = "") {
      return asText(value)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    function extractConversationSignatureEmail({ text = "", html = "" } = {}) {
      const combinedValue = `${asText(text)}\n${asText(html)}`;
      const emailMatch = combinedValue.match(/[A-Z0-9._%+-]+@hairtpclinic\.com/gi);
      return normalizeText(emailMatch?.[0]).toLowerCase();
    }

    function extractConversationSignatureName(lines = []) {
      return asArray(lines).find((line) => {
        const normalizedLine = asText(line).trim();
        if (!normalizedLine) return false;
        if (conversationSignatureMarkerPattern.test(normalizedLine)) return false;
        if (/@|https?:\/\/|www\.|\+?\d[\d\s().-]{5,}/i.test(normalizedLine)) return false;
        if (/^(?:webb|instagram|facebook)(?:\s*[·|].*)?$/i.test(normalizedLine)) return false;
        if (/^(?:vasaplatsen|göteborg)\b/i.test(normalizedLine)) return false;
        return normalizedLine.length <= 72;
      });
    }

    function extractConversationSignatureTitle(lines = []) {
      return asArray(lines).find((line) => {
        const normalizedLine = asText(line).trim();
        if (!normalizedLine) return false;
        if (
          !/(Hårspecialist|Patientservice|Konsultationsteam|Hårtransplantationer|PRP-injektioner)/i.test(
            normalizedLine
          )
        ) {
          return false;
        }
        return !/@|https?:\/\/|www\.|\+?\d[\d\s().-]{5,}/i.test(normalizedLine);
      });
    }

    function buildConversationHairTpSignatureHtml({
      greeting = "Bästa hälsningar",
      fullName = "",
      title = "",
      email = "",
      phone = "031-88 11 66",
    } = {}) {
      const assetBaseUrl = getConversationSignatureAssetBaseUrl();
      const resolvedName = asText(fullName);
      const resolvedTitle = normalizeHairTpSignatureTitle(title);
      const resolvedEmail = asText(email).toLowerCase();
      if (!resolvedName || !resolvedTitle || !resolvedEmail || !asText(greeting).trim()) {
        return "";
      }
      return CCO_APPROVED_FAZLI_SIGNATURE_HTML
        .replace("Bästa hälsningar,", `${asText(greeting).trim()},`)
        .replace("Fazli Krasniqi", resolvedName)
        .replace(
          "Hårspecialist | Hårtransplantationer & PRP-injektioner",
          resolvedTitle
        )
        .replace("031-88 11 66&nbsp;", `${escapeHtml(phone)}&nbsp;`)
        .replace("mailto:contact@hairtpclinic.com", `mailto:${resolvedEmail}`)
        .replace(" contact@hairtpclinic.com ", ` ${resolvedEmail} `)
        .replace(
          /https:\/\/img2\.gimm\.io\/9e99c2fb-11b4-402b-8a43-6022ede8aa2b\/image\.png/gi,
          CCO_APPROVED_HAIR_TP_SIGNATURE_LOGO_URL
        )
        .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3000(?=\/assets\/hair-tp-clinic\/)/gi, assetBaseUrl);
    }

    function normalizeConversationHairTpSignaturePresentation(message = {}, signatureBlock = {}) {
      const signatureText = asText(signatureBlock?.text).trim();
      const signatureHtml = asText(signatureBlock?.html).trim();
      if (!signatureText && !signatureHtml) return null;
      const hintedProfile = extractConversationHairTpProfileHint(message, signatureBlock);
      const signatureEmail = extractConversationSignatureEmail({
        text: signatureText,
        html: signatureHtml,
      });
      const mailboxId = normalizeText(
        message?.mailThreadMessage?.mailboxId || message?.mailboxId || message?.mailboxAddress
      ).toLowerCase();
      const matchedProfile =
        hairTpSignatureProfilesByMailbox[signatureEmail] ||
        hairTpSignatureProfilesByMailbox[mailboxId] ||
        null;
      const isHairTpSignature =
        Boolean(matchedProfile) ||
        /hairtpclinic\.com|Hair TP Clinic|hairtpclinic-mark-light/i.test(
          `${signatureText}\n${signatureHtml}`
        );
      if (!isHairTpSignature) return null;
      const lines = getConversationSignatureLines(signatureText);
      const explicitName = extractConversationSignatureName(lines);
      const explicitTitle = extractConversationSignatureTitle(lines);
      const authorName = asText(message?.author).trim();
      const matchedProfileName = asText(matchedProfile?.fullName).trim();
      const resolvedName = asText(
        hintedProfile?.fullName,
        !isConversationGenericHairTpSignatureName(explicitName) ? explicitName : "",
        !isConversationGenericHairTpSignatureName(authorName) ? authorName : "",
        !isConversationGenericHairTpSignatureName(matchedProfileName) ? matchedProfileName : ""
      );
      const normalizedName = resolvedName || asText(hintedProfile?.fullName) || "";
      const resolvedTitle = normalizeHairTpSignatureTitle(
        asText(hintedProfile?.title, matchedProfile?.title, explicitTitle)
      );
      const resolvedEmail = asText(hintedProfile?.email, signatureEmail, mailboxId).toLowerCase();
      const normalizedText = [
        "Bästa hälsningar",
        asText(normalizedName),
        resolvedTitle,
        "031-88 11 66",
        resolvedEmail,
        "Vasaplatsen 2, 411 34 Göteborg",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        copy: normalizedText,
        html: buildConversationHairTpSignatureHtml({
          fullName: asText(normalizedName),
          title: resolvedTitle,
          email: resolvedEmail,
        }),
      };
    }

    function trimConversationPrimaryBodyBeforeSignature(
      primaryBodyText = "",
      signatureDisplay = null
    ) {
      const normalizedPrimaryBodyText = asText(primaryBodyText).trim();
      if (!normalizedPrimaryBodyText || !signatureDisplay?.visible) {
        return {
          text: normalizedPrimaryBodyText,
          trimmed: false,
        };
      }
      const trimmedText = normalizedPrimaryBodyText
        .replace(
          /(?:\n{2,}|\n)(?:MVH|Mvh|Med vänlig hälsning|Vänliga hälsningar|Bästa hälsningar)\s*\n(?:Hair TP Clinic|Contact|Kons|Egzona Krasniqi|Fazli Krasniqi)\s*$/i,
          ""
        )
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return {
        text: trimmedText || normalizedPrimaryBodyText,
        trimmed: trimmedText !== normalizedPrimaryBodyText,
      };
    }

    function deriveConversationSignatureTruth({ text = "", html = "" } = {}) {
      const signatureText = asText(text).trim();
      const signatureHtml = asText(html).trim();
      if (!signatureText && !signatureHtml) {
        return {
          confidence: "none",
          visibleInReadSurface: false,
          layoutUnsafe: false,
          layoutHeavy: false,
          hasExplicitGreeting: false,
          hasIdentityCue: false,
          hasVisualCue: false,
          hasTableCue: false,
          label: "",
        };
      }

      const lines = signatureText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const greetingLineCount = lines.filter((line) => conversationSignatureMarkerPattern.test(line)).length;
      const identityTokens = collectConversationSignatureIdentityTokens(signatureText);
      const hasVisualCue = /<img\b/i.test(signatureHtml);
      const hasTableCue = /<table\b/i.test(signatureHtml);
      const hasExplicitGreeting = greetingLineCount > 0;
      const hasIdentityCue =
        identityTokens.length > 0 || conversationSignatureIdentityPattern.test(signatureText);
      const isHairTpSignature = containsConversationHairTpSignatureMarkers(
        `${signatureText}\n${signatureHtml}`
      );
      const layoutHeavy =
        hasVisualCue ||
        hasTableCue ||
        lines.length >= 6 ||
        signatureText.length >= 220;

      let confidence = "low";
      if (isHairTpSignature && (hasExplicitGreeting || hasIdentityCue)) {
        confidence = "high";
      } else if (hasExplicitGreeting && (hasIdentityCue || hasVisualCue || lines.length >= 2)) {
        confidence = "high";
      } else if (hasIdentityCue && (lines.length >= 2 || hasVisualCue)) {
        confidence = "medium";
      }

      const layoutUnsafe =
        hasVisualCue ||
        hasTableCue ||
        lines.length > 5 ||
        signatureText.length > 180;

      return {
        confidence,
        visibleInReadSurface: isHairTpSignature ? true : !(confidence !== "high" || layoutUnsafe),
        layoutUnsafe,
        layoutHeavy,
        hasExplicitGreeting,
        hasIdentityCue,
        hasVisualCue,
        hasTableCue,
        label: confidence === "high" || isHairTpSignature ? "Signatur" : "Avsändarfooter",
      };
    }

    function normalizeConversationSignatureTruth(signatureBlock = null) {
      const derivedTruth = deriveConversationSignatureTruth({
        text: asText(signatureBlock?.text).trim(),
        html: asText(signatureBlock?.html).trim(),
      });
      const truth =
        signatureBlock?.truth && typeof signatureBlock.truth === "object"
          ? signatureBlock.truth
          : null;
      if (!truth) return derivedTruth;
      return {
        confidence: normalizeKey(truth?.confidence) || derivedTruth.confidence,
        visibleInReadSurface:
          truth?.visibleInReadSurface === true
            ? true
            : truth?.visibleInReadSurface === false
              ? false
              : derivedTruth.visibleInReadSurface,
        layoutUnsafe:
          truth?.layoutUnsafe === true
            ? true
            : truth?.layoutUnsafe === false
              ? false
              : derivedTruth.layoutUnsafe,
        layoutHeavy:
          truth?.layoutHeavy === true
            ? true
            : truth?.layoutHeavy === false
              ? false
              : derivedTruth.layoutHeavy,
        hasExplicitGreeting:
          truth?.hasExplicitGreeting === true
            ? true
            : truth?.hasExplicitGreeting === false
              ? false
              : derivedTruth.hasExplicitGreeting,
        hasIdentityCue:
          truth?.hasIdentityCue === true
            ? true
            : truth?.hasIdentityCue === false
              ? false
              : derivedTruth.hasIdentityCue,
        hasVisualCue:
          truth?.hasVisualCue === true
            ? true
            : truth?.hasVisualCue === false
              ? false
              : derivedTruth.hasVisualCue,
        hasTableCue:
          truth?.hasTableCue === true
            ? true
            : truth?.hasTableCue === false
              ? false
              : derivedTruth.hasTableCue,
        label: asText(truth?.label, derivedTruth.label).trim(),
      };
    }

    function summarizeConversationSecondaryCopy(value = "", fallback = "Visa mer", limit = 72) {
      const normalizedValue = asText(value).trim();
      if (!normalizedValue) return fallback;
      const previewLine = normalizedValue
        .split(/\n+/)
        .map((line) => line.trim())
        .find((line) => normalizeText(line));
      return compactRuntimeCopy(asText(previewLine, normalizedValue), fallback, limit);
    }

    function buildConversationSignatureDisplay(message, structuredSections = {}) {
      const signatureText = asText(structuredSections?.signatureBlock?.text).trim();
      const signatureHtml = asText(structuredSections?.signatureBlock?.html).trim();
      if (!signatureText && !signatureHtml) {
        return {
          copy: "",
          html: "",
          label: "",
          collapsible: false,
          summary: "",
          visible: false,
          confidence: "none",
        };
      }

      const signatureTruth = normalizeConversationSignatureTruth(structuredSections?.signatureBlock);
      const normalizedSignaturePresentation = normalizeConversationHairTpSignaturePresentation(
        message,
        structuredSections?.signatureBlock || {}
      );
      const lines = signatureText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const identityTokens = collectConversationSignatureIdentityTokens(signatureText);
      if (signatureTruth.visibleInReadSurface !== true) {
        return {
          copy: signatureText,
          html: signatureHtml,
          label: "",
          collapsible: false,
          summary: "",
          visible: false,
          confidence: signatureTruth.confidence,
        };
      }

      const summaryPrefix =
        signatureTruth.confidence === "high" ? "Signatur" : "Avsändarfooter";
      return {
        copy: asText(normalizedSignaturePresentation?.copy, signatureText),
        html: asText(normalizedSignaturePresentation?.html, signatureHtml),
        label: asText(signatureTruth.label, "Signatur"),
        collapsible:
          signatureTruth.layoutHeavy === true || signatureTruth.confidence !== "high",
        summary: `${summaryPrefix} · ${summarizeConversationSignatureIdentity(lines, identityTokens)}`,
        visible: true,
        confidence: signatureTruth.confidence,
      };
    }

    function buildConversationDocumentMarkup(message, { history = false } = {}) {
      const mailThreadMessage = getCanonicalMailThreadMessage(message);
      if (!mailThreadMessage) {
        return buildConversationContentMarkup(message, { history });
      }

      const structuredSections = buildConversationStructuredSections(message, mailThreadMessage);
      const systemBlocks = asArray(structuredSections?.systemBlocks).filter((block) =>
        asText(block?.text).trim()
      );
      const quotedBlocks = asArray(structuredSections?.quotedBlocks).filter((block) =>
        asText(block?.text).trim()
      );
      const signatureDisplay = buildConversationSignatureDisplay(message, structuredSections);
      const rawPrimaryBodyText = asText(
        structuredSections?.primaryBody?.text,
        mailThreadMessage?.primaryBody?.text,
        asText(message?.conversationBody, asText(message?.body, ""))
      ).trim();
      const rawPrimaryBodyHtml = asText(
        structuredSections?.primaryBody?.html,
        mailThreadMessage?.primaryBody?.html,
        asText(message?.conversationBodyHtml, asText(message?.bodyHtml, ""))
      ).trim();
      const normalizedPrimaryBody = trimConversationPrimaryBodyBeforeSignature(
        rawPrimaryBodyText,
        signatureDisplay
      );
      const primaryBodyText = normalizedPrimaryBody.text;
      const primaryBodyHtml = normalizedPrimaryBody.trimmed ? "" : rawPrimaryBodyHtml;
      const primaryMarkup = buildConversationContentMarkup(
        {
          ...message,
          conversationBody: primaryBodyText,
          conversationBodyHtml: primaryBodyHtml,
          body: primaryBodyText,
          bodyHtml: primaryBodyHtml,
        },
        { history }
      );
      const systemText = systemBlocks
        .map((block) => asText(block?.text).trim())
        .filter(Boolean)
        .join("\n\n");
      const systemHtml = systemBlocks
        .map((block) => asText(block?.html).trim())
        .filter(Boolean)
        .join("");
      const systemSummary = systemBlocks.length
        ? `Providerinfo${
            systemBlocks.length > 1 ? ` · ${systemBlocks.length} block` : ""
          } · ${summarizeConversationSecondaryCopy(systemText, "Visa providerinfo", 64)}`
        : "";
      const systemMarkup =
        systemText || systemHtml
          ? buildConversationSecondarySectionMarkup(
              {
                label: "Providerinfo",
                copy: systemText,
                html: systemHtml,
                tone: "system",
                collapsible: true,
                summary: systemSummary,
              },
              { history }
            )
          : "";
      const signatureMarkup = signatureDisplay.visible
        ? buildConversationSecondarySectionMarkup(
            {
              label: signatureDisplay.label,
              copy: signatureDisplay.copy,
              html: signatureDisplay.html,
              tone: "signature",
              collapsible: true,
              summary:
                signatureDisplay.summary ||
                `${signatureDisplay.label || "Avsändarfooter"} · ${summarizeConversationSecondaryCopy(
                  signatureDisplay.copy,
                  "Visa avsändarfooter",
                  56
                )}`,
            },
            { history }
          )
        : "";
      const quotedText = quotedBlocks
        .map((block) => asText(block?.text).trim())
        .filter(Boolean)
        .join("\n\n");
      const quotedHtml = quotedBlocks
        .map((block) => asText(block?.html).trim())
        .filter(Boolean)
        .join("");
      const quotedSummary = compactRuntimeCopy(
        quotedText.split(/\n+/).find((line) => normalizeText(line)) || "",
        "Visa tidigare i tråden",
        72
      );
      const quotedMarkup = buildConversationSecondarySectionMarkup(
        {
          label: "Tidigare i tråden",
          copy: quotedText,
          html: quotedHtml,
          tone: "quoted",
          collapsible: true,
          summary: quotedSummary,
        },
        { history }
      );
      const assetMarkup = buildConversationAssetSectionMarkup(message, { history });

      return `<div class="conversation-mail-document${
        history ? " conversation-mail-document-history" : ""
      }">
        ${systemMarkup}
        <div class="conversation-mail-document-primary">${primaryMarkup}</div>
        ${assetMarkup}
        ${signatureMarkup}
        ${quotedMarkup}
      </div>`;
    }

    function applyFocusWaitingState(waiting) {
      const showPrimaryShell = waiting !== true;
      const isAuthFallback = Boolean(
        waiting === true && (state.runtime?.authRequired === true || state.runtime?.loading === true)
      );
      setElementVisibility(focusTabs, showPrimaryShell);
      setElementVisibility(focusSignals, showPrimaryShell);
      setElementVisibility(focusBadgeRow, showPrimaryShell);
      if (focusWorkrail) {
        focusWorkrail.classList.remove("is-placeholder");
        setElementVisibility(focusWorkrail, showPrimaryShell);
        if (isAuthFallback) {
          focusWorkrail.hidden = false;
          focusWorkrail.classList.add("is-placeholder");
          focusWorkrail.setAttribute("aria-hidden", "true");
        }
      }
      if (focusConversationLayout) {
        focusConversationLayout.classList.toggle("is-runtime-empty", waiting === true);
      }
    }

    function applyIntelWaitingState(waiting) {
      const showIntelDetails = waiting !== true;
      setElementVisibility(intelGrid, showIntelDetails);
      setElementVisibility(focusIntelReason, showIntelDetails);
      setElementVisibility(focusIntelTabs, showIntelDetails);
      setElementVisibility(focusIntelPanels, showIntelDetails);
      if (focusIntelPrimaryBody) {
        focusIntelPrimaryBody.classList.toggle("is-runtime-empty", waiting === true);
      }
    }

    function applyIntelPrimaryExpandedState() {
      if (!focusIntelPrimary || !intelDateButton) return;
      const expanded = state.runtime?.intelExpanded !== false;
      focusIntelPrimary.classList.toggle("is-collapsed", !expanded);
      intelDateButton.setAttribute("aria-expanded", expanded ? "true" : "false");
      intelDateButton.setAttribute(
        "aria-label",
        expanded ? "Dölj kundintelligensdetaljer" : "Visa kundintelligensdetaljer"
      );
    }

    function renderFocusHistorySection(thread, focusReadState = {}) {
      if (!focusHistoryList) return;
      const isOfflineHistorySelection = Boolean(
        typeof isOfflineHistorySelectionActive === "function" && isOfflineHistorySelectionActive()
      );
      const isOfflineHistoryThread = Boolean(
        typeof isOfflineHistoryContextThread === "function" && isOfflineHistoryContextThread(thread)
      );
      const isTruthDrivenReadOnly =
        focusReadState?.truthDriven === true && focusReadState?.readOnly === true;
      const focusWaveLabel = asText(focusReadState?.waveLabel, "Wave 1");
      if (!thread) {
        focusHistoryList.innerHTML = "";
        if (focusHistoryTitle) focusHistoryTitle.textContent = "Aktivitetshistorik";
        if (focusHistoryDescription) {
          focusHistoryDescription.textContent =
            isOfflineHistorySelection
              ? "Välj en historikruta i vänsterkolumnen för att läsa kundens historik här i läsläge."
              : "Fullständig logg över kommunikation och viktiga händelser för den här kunden.";
        }
        renderFocusSummaryCards(focusHistoryScope, [], "history");
        if (focusHistorySearchInput) {
          focusHistorySearchInput.value = state.runtime.historySearch || "";
        }
        if (focusHistoryCount) {
          focusHistoryCount.textContent = "Visar 0 av 0 händelser";
        }
        if (focusHistoryMeta) {
          focusHistoryMeta.textContent = isOfflineHistorySelection
            ? "Offline historikläge · välj en historikruta"
            : state.runtime.authRequired
              ? "Logga in igen för att läsa live historik"
              : "Ingen live historik tillgänglig";
        }
        if (focusHistoryReadoutButton) {
          focusHistoryReadoutButton.disabled = true;
        }
        if (focusHistoryDeleteButton) {
          setButtonBusy(focusHistoryDeleteButton, false, "Radera", "Raderar…");
          focusHistoryDeleteButton.disabled = true;
        }
        renderHistoryFilterRow(
          focusHistoryMailboxRow,
          [{ id: "all", label: "Alla" }],
          "all",
          "focusHistoryMailbox"
        );
        renderHistoryFilterRow(
          focusHistoryTypeRow,
          [
            { id: "all", label: "Allt" },
            { id: "message", label: "Mail" },
            { id: "action", label: "Åtgärder" },
            { id: "outcome", label: "Utfall" },
          ],
          state.runtime.historyResultTypeFilter,
          "focusHistoryType"
        );
        renderHistoryFilterRow(
          focusHistoryRangeRow,
          [
            { id: "all", label: "All tid" },
            { id: "30", label: "30d" },
            { id: "90", label: "90d" },
            { id: "365", label: "365d" },
          ],
          state.runtime.historyRangeFilter,
          "focusHistoryRange"
        );
        renderHistoryEventsList(
          focusHistoryList,
          [],
          "",
          {
            title: isOfflineHistorySelection
              ? "Ingen offline-historik vald"
              : "Ingen live historik tillgänglig",
            text: isOfflineHistorySelection
              ? "Välj en historikruta i vänsterkolumnen för att läsa kundens historik i samma arbetsyta."
              : state.runtime.authRequired
                ? "Logga in igen för att läsa aktivitetshistorik."
                : "Välj en live-tråd i arbetskön för att läsa historik.",
            chip: "Historik",
          }
        );
        return;
      }

      if (focusHistoryReadoutButton) {
        focusHistoryReadoutButton.disabled = false;
      }
      if (focusHistoryDeleteButton) {
        setButtonBusy(
          focusHistoryDeleteButton,
          state.runtime.historyDeleting,
          "Radera",
          "Raderar…"
        );
        focusHistoryDeleteButton.disabled =
          state.runtime.historyDeleting ||
          !state.runtime.deleteEnabled ||
          isOfflineHistoryThread ||
          isTruthDrivenReadOnly;
      }

      if (state.runtime.historyContextThreadId !== thread.id) {
        state.runtime.historyContextThreadId = thread.id;
        resetRuntimeHistoryFilters();
      }

      const historyMailboxOptions = getThreadHistoryMailboxOptions(thread);
      const validMailboxIds = new Set(["all", ...historyMailboxOptions.map((option) => option.id)]);
      if (!validMailboxIds.has(normalizeKey(state.runtime.historyMailboxFilter))) {
        state.runtime.historyMailboxFilter = "all";
      }

      if (focusHistorySearchInput) {
        focusHistorySearchInput.value = state.runtime.historySearch || "";
      }

      renderHistoryFilterRow(
        focusHistoryMailboxRow,
        [{ id: "all", label: "Alla" }, ...historyMailboxOptions],
        normalizeKey(state.runtime.historyMailboxFilter || "all"),
        "focusHistoryMailbox"
      );
      renderHistoryFilterRow(
        focusHistoryTypeRow,
        [
          { id: "all", label: "Allt" },
          { id: "message", label: "Mail" },
          { id: "action", label: "Åtgärder" },
          { id: "outcome", label: "Utfall" },
        ],
        normalizeKey(state.runtime.historyResultTypeFilter || "all"),
        "focusHistoryType"
      );
      renderHistoryFilterRow(
        focusHistoryRangeRow,
        [
          { id: "all", label: "All tid" },
          { id: "30", label: "30d" },
          { id: "90", label: "90d" },
          { id: "365", label: "365d" },
        ],
        normalizeKey(state.runtime.historyRangeFilter || "all"),
        "focusHistoryRange"
      );

      const allEvents = helpers.buildThreadHistoryEvents(thread);
      const filteredEvents = filterHistoryEvents(allEvents, {
        search: state.runtime.historySearch,
        mailboxFilter: state.runtime.historyMailboxFilter,
        resultTypeFilter: state.runtime.historyResultTypeFilter,
        rangeFilter: state.runtime.historyRangeFilter,
      });
      if (focusHistoryTitle) {
        focusHistoryTitle.textContent = "Historik i tråden";
      }
      if (focusHistoryDescription) {
        focusHistoryDescription.textContent = isTruthDrivenReadOnly
          ? `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel} · ${thread.customerName} · ${thread.mailboxLabel} · ${compactRuntimeCopy(
              thread.displaySubject || thread.subject,
              "Aktiv konversation",
              72
            )}`
          : `${thread.customerName} · ${thread.mailboxLabel} · ${compactRuntimeCopy(
              thread.displaySubject || thread.subject,
              "Aktiv konversation",
              72
            )}`;
      }
      renderFocusSummaryCards(
        focusHistoryScope,
        buildFocusHistoryScopeCards(thread, allEvents),
        "history"
      );

      if (focusHistoryCount) {
        focusHistoryCount.textContent = `Visar ${filteredEvents.length} av ${allEvents.length} händelser i tråden`;
      }

      if (focusHistoryMeta) {
        const latestStamp = allEvents[0]?.recordedAt
          ? formatHistoryTimestamp(allEvents[0].recordedAt)
          : thread.lastActivityLabel;
        focusHistoryMeta.textContent = isOfflineHistoryThread
          ? `Offline historik · ${historyMailboxOptions.length || 1} mailbox · senaste aktivitet ${latestStamp}`
          : isTruthDrivenReadOnly
            ? `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel} · mailbox truth historik · ${historyMailboxOptions.length || 1} mailbox · senaste aktivitet ${latestStamp}`
            : `${historyMailboxOptions.length || 1} mailbox · senaste aktivitet ${latestStamp}`;
      }

      renderHistoryEventsList(focusHistoryList, filteredEvents, thread.id, {
        title: normalizeText(state.runtime.historySearch)
          ? `Ingen historik matchar "${normalizeText(state.runtime.historySearch)}"`
          : "Ingen historik i valt urval",
        text:
          normalizeKey(state.runtime.historyMailboxFilter) !== "all"
            ? "Byt mailboxfilter eller återgå till Alla för att läsa fler händelser."
            : "Byt filter eller tidsintervall för att läsa fler händelser.",
        chip: "Historik",
      });
    }

    function renderFocusNotesSection() {
      if (!focusNotesList || !focusNotesEmpty) return;
      const thread = getSelectedRuntimeThread();
      const notes = [...getScopedActivityNotes(thread)].sort((a, b) =>
        String(b.updatedAt || b.createdAt || "").localeCompare(
          String(a.updatedAt || a.createdAt || "")
        )
      );

      if (focusNotesCount) {
        focusNotesCount.textContent = `${notes.length} anteckningar kopplade till kunden och tråden.`;
      }

      focusNotesList.innerHTML = "";

      if (!notes.length) {
        focusNotesEmpty.hidden = false;
        focusNotesList.hidden = true;
        return;
      }

      focusNotesEmpty.hidden = true;
      focusNotesList.hidden = false;

      notes.forEach((note) => {
        const article = document.createElement("article");
        article.className = "focus-notes-entry";

        const head = document.createElement("div");
        head.className = "focus-notes-entry-head";

        const copy = document.createElement("div");

        const label = document.createElement("span");
        label.className = "focus-notes-entry-label";
        label.textContent = note.destinationLabel || note.destinationKey || "Anteckning";

        const title = document.createElement("h4");
        title.className = "focus-notes-entry-title";
        title.textContent = note.destinationLabel || "Anteckning";

        const text = document.createElement("p");
        text.className = "focus-notes-entry-text";
        text.textContent = note.text;

        copy.append(label, title, text);

        const stamp = document.createElement("time");
        stamp.className = "focus-notes-entry-time";
        stamp.dateTime = note.updatedAt || note.createdAt || "";
        stamp.textContent = formatHistoryTimestamp(note.updatedAt || note.createdAt);

        head.append(copy, stamp);
        article.append(head);

        const meta = document.createElement("div");
        meta.className = "focus-notes-meta-row";

        const priority = document.createElement("span");
        priority.className = "focus-notes-type-pill";
        priority.textContent =
          note.priority === "high"
            ? "Hög prioritet"
            : note.priority === "low"
              ? "Låg prioritet"
              : "Medel";

        const visibility = document.createElement("span");
        visibility.className = "focus-notes-type-pill";
        visibility.textContent =
          note.visibility === "internal"
            ? "Intern"
            : note.visibility === "all_operators"
              ? "Alla operatörer"
              : "Team";

        meta.append(priority, visibility);
        article.append(meta);

        if (Array.isArray(note.tags) && note.tags.length) {
          const tagRow = document.createElement("div");
          tagRow.className = "focus-note-tag-row";
          note.tags.forEach((tagValue) => {
            const chip = document.createElement("span");
            chip.className = "focus-note-tag";
            chip.textContent = tagValue;
            tagRow.appendChild(chip);
          });
          article.append(tagRow);
        }

        focusNotesList.appendChild(article);
      });
    }

    function renderRuntimeFocusConversation(thread, focusReadState = {}) {
      if (!focusConversationSection || !focusWorkrail || !focusStatusLine || !focusTitle || !focusBadgeRow) return;
      const isOfflineHistorySelection = Boolean(
        typeof isOfflineHistorySelectionActive === "function" && isOfflineHistorySelectionActive()
      );
      const isOfflineHistoryThread = Boolean(
        typeof isOfflineHistoryContextThread === "function" && isOfflineHistoryContextThread(thread)
      );
      const isTruthDrivenReadOnly =
        focusReadState?.truthDriven === true && focusReadState?.readOnly === true;
      const focusWaveLabel = asText(focusReadState?.waveLabel, "Wave 1");
      if (!thread) {
        applyFocusWaitingState(true);
        const isLoading = state.runtime.loading === true;
        const isAuthRequired = state.runtime.authRequired === true;
        const emptyTitle = isOfflineHistorySelection
          ? "Välj en historikruta"
          : isLoading
            ? "Synkar live-läget"
          : isAuthRequired
            ? "Återställ live-läget"
            : "Väntar på live-tråd";
        const emptyBody = isOfflineHistorySelection
          ? "Offline historik är tillgänglig i läsläge. Välj en historikruta i vänsterkolumnen för att läsa kundkontexten här. Svar, senare, anteckning och radera kräver live-tråd."
          : isLoading
            ? "Livekön synkar just nu. Tråd, historik och kundstöd fylls tillbaka automatiskt när uppdateringen är klar."
          : isAuthRequired
            ? state.runtime.error ||
              "Öppna admin och logga in igen för att läsa live-trådar, historik och kundstöd i samma arbetsyta."
            : state.runtime.error ||
              "När du väljer en aktiv live-tråd i arbetskön visas hela konversationen här.";
        const reauthMarkup = state.runtime.authRequired
          ? `<button class="conversation-next-button" type="button" data-runtime-reauth>Öppna admin och logga in igen</button>`
          : "";
        setRuntimeActionRowsVisibility("[data-focus-actions]", false);
        focusTitle.textContent = isOfflineHistorySelection
          ? "Offline historik · läsläge"
          : isLoading
            ? "Synkar live-läget"
          : isAuthRequired
            ? "Livekö ej ansluten"
            : "Väntar på live-tråd";
        focusStatusLine.textContent = isOfflineHistorySelection
          ? "Offline historik · läsläge. Välj en historikruta i vänsterkolumnen för att öppna kundens historik här."
          : isLoading
            ? "Livekön synkar. Fokusytan uppdateras automatiskt när trådarna är på plats."
          : isAuthRequired
            ? "Logga in i admin för att återställa live-läget i fokusytan."
            : "Välj en aktiv live-tråd i arbetskön för att öppna konversationen här.";
        focusBadgeRow.innerHTML = "";
        focusWorkrail.innerHTML = "";
        focusConversationSection.innerHTML = `
          <article class="conversation-entry conversation-entry-empty">
            <div class="conversation-empty-card">
              <div class="conversation-empty-meta-row">
                <span class="conversation-state-pill">${escapeHtml(
                  isOfflineHistorySelection
                    ? "Offline historik"
                    : isLoading
                      ? "Synkar"
                    : isAuthRequired
                      ? "Session krävs"
                      : "Ingen live-tråd"
                )}</span>
              </div>
              <h4 class="conversation-empty-title">${escapeHtml(emptyTitle)}</h4>
              <p class="conversation-empty-text">${escapeHtml(emptyBody)}</p>
              ${reauthMarkup}
            </div>
          </article>`;
        return;
      }

      applyFocusWaitingState(false);
      setRuntimeActionRowsVisibility(
        "[data-focus-actions]",
        !isOfflineHistoryThread && !isTruthDrivenReadOnly
      );
      focusTitle.textContent = thread.displaySubject || thread.subject;
      const lifecycleSummary = [thread.lifecycleLabel, thread.followUpLabel || thread.lastActivityLabel]
        .map((value) => asText(value).trim())
        .filter(Boolean)
        .join(" · ");
      const focusStatusItems = [
        {
          label: isOfflineHistoryThread ? "Vald historik" : "Aktiv tråd",
          tone: "selected",
        },
        {
          label: thread.statusLabel,
          tone: "status",
          icon: "mail",
        },
        {
          label: thread.waitingLabel,
          tone: "waiting",
          icon: "clock",
        },
        focusReadState?.foundationDriven
          ? {
              label: asText(focusReadState.foundationLabel, "Mail foundation"),
              tone: "foundation",
              icon: "layers",
            }
          : focusReadState?.fallbackDriven
            ? {
                label: asText(focusReadState.fallbackLabel, "Legacy fallback"),
                tone: "fallback",
                icon: "history",
              }
            : null,
        {
          label: lifecycleSummary,
          tone: "lifecycle",
          icon: "calendar",
        },
        {
          label: asText(thread.riskLabel).trim(),
          tone: "risk",
          icon: "warning",
        },
      ]
        .filter(Boolean)
        .filter((item, index, values) => {
          const label = asText(item?.label).trim();
          if (!label) return false;
          return values.findIndex((candidate) => asText(candidate?.label).trim() === label) === index;
        });
      const focusStatusMarkup = buildFocusStatusRowMarkup(focusStatusItems);
      focusStatusLine.innerHTML = isOfflineHistoryThread
        ? `Offline historik · läsläge<span class="focus-status-alert"> · Live-actions spärrade tills en live-tråd väljs</span>`
        : isTruthDrivenReadOnly
          ? `Läsläge i fokusytan<span class="focus-status-alert"> · Reply/studio ligger kvar utanför detta pass</span>`
          : focusStatusMarkup ||
            escapeHtml(asText(thread.nextActionLabel, thread.statusLabel || "Aktiv tråd"));
      focusBadgeRow.innerHTML = "";
      focusBadgeRow.hidden = true;

      const latestMessage = thread.messages[0] || {
        author: thread.customerName,
        time: thread.lastActivityLabel,
        body: thread.preview,
        role: "customer",
      };
      const olderMessages = thread.messages.slice(1, 3);
      const olderHistoryMarkup = olderMessages.length
        ? `
        <button class="conversation-collapse" type="button" aria-expanded="${
          state.runtime.historyExpanded ? "true" : "false"
        }" aria-controls="focus-conversation-history" data-runtime-conversation-collapse>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 9.8 8 6.7l3 3.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>
          <span class="conversation-collapse-label">${
            state.runtime.historyExpanded
              ? `Dölj ${olderMessages.length} äldre meddelanden`
              : `Visa ${olderMessages.length} äldre meddelanden`
          }</span>
        </button>
        <div class="conversation-history${state.runtime.historyExpanded ? "" : " is-collapsed"}" id="focus-conversation-history">
          ${olderMessages
            .map(
              (message) => `
                <article class="conversation-entry conversation-entry-history">
                  ${
                    message.role === "customer"
                      ? `<img class="conversation-avatar" src="${thread.avatar}" alt="${escapeHtml(
                          thread.customerName
                        )}" />`
                      : `<div class="conversation-avatar conversation-avatar-initials" aria-hidden="true">${escapeHtml(
                          initialsForName(thread.ownerLabel)
                        )}</div>`
                  }
                  <div class="conversation-history-body">
                    <div class="conversation-history-meta">
                      <span class="conversation-author">${escapeHtml(message.author)}</span>
                      <time class="conversation-time" datetime="${escapeHtml(
                        message.recordedAt || ""
                      )}">${escapeHtml(message.time || "")}</time>
                      ${buildConversationHeaderAssetStripMarkup(message, { history: true })}
                    </div>
                    ${buildConversationDocumentMarkup(message, { history: true })}
                  </div>
                </article>`
            )
            .join("")}
        </div>`
        : "";
      const nextActionSummaryCopy = isOfflineHistoryThread
        ? "Historiken följer med till fokusytan. Operativa actions kräver live-tråd."
        : isTruthDrivenReadOnly
          ? asText(
              focusReadState?.detail,
              "Truth-driven läsläge i fokusytan för wave 1. Reply- och studioflödet ligger kvar utanför detta pass."
            )
        : compactRuntimeCopy(
            thread.nextActionSummary,
            "Var konkret med tider eller nästa steg direkt i svaret.",
            88
          );
      const conversationNextActionsMarkup = isOfflineHistoryThread
        ? `<div class="conversation-next-actions conversation-next-actions--offline">
            <button class="conversation-next-button" type="button" data-runtime-studio-open data-runtime-studio-read-only="true" data-runtime-studio-thread-id="${escapeHtml(
              thread.id
            )}" aria-controls="studio-shell">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6M5 5l6 6M11 5 5 11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" /></svg>
              Svarstudio · läsläge
            </button>
          </div>`
        : isTruthDrivenReadOnly
          ? `<div class="conversation-next-actions conversation-next-actions--offline">
              <span class="conversation-state-pill">${escapeHtml(
                `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel}`
              )}</span>
            </div>`
        : `<div class="conversation-next-actions">
            <button class="conversation-next-button" type="button" data-runtime-studio-open data-runtime-studio-thread-id="${escapeHtml(
              thread.id
            )}" aria-controls="studio-shell">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6M5 5l6 6M11 5 5 11" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" /></svg>
              Öppna Svarstudio
            </button>
            <div class="conversation-next-icons" aria-label="Snabbverktyg">
              <button class="conversation-next-icon-button conversation-next-icon-button-calendar" type="button" data-runtime-schedule-open aria-controls="schedule-shell" aria-label="Schemalägg uppföljning">
                <svg viewBox="0 0 16 16"><rect x="2.8" y="3.6" width="10.4" height="9.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M5.2 2.7v2M10.8 2.7v2M2.9 6.1h10.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3" /></svg>
              </button>
              <button class="conversation-next-icon-button conversation-next-icon-button-note" type="button" data-runtime-note-open aria-controls="note-shell" aria-label="Öppna Smart anteckning">
                <svg viewBox="0 0 16 16"><path d="M4 2.7h6.5L13 5.2v7.1a1.1 1.1 0 0 1-1.1 1.1H4A1.1 1.1 0 0 1 2.9 12.3V3.8A1.1 1.1 0 0 1 4 2.7Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.2" /><path d="M10.5 2.8v2.6H13M5.2 7.4h5.2M5.2 9.6h4.1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.2" /></svg>
              </button>
            </div>
          </div>`;
      const conversationNextStepMarkup = `<div class="conversation-next-step">
          <div class="conversation-next-summary">
            <span class="conversation-next-label">${escapeHtml(
              isOfflineHistoryThread
                ? "Offline kontext"
                : isTruthDrivenReadOnly
                  ? "Truth-driven focus"
                  : "Rekommenderat drag"
            )}</span>
            <strong class="conversation-next-title">${escapeHtml(
              isOfflineHistoryThread
                ? "Läsläge från historik"
                : isTruthDrivenReadOnly
                  ? `${focusWaveLabel} · Läsläge`
                  : thread.nextActionLabel
            )}</strong>
            <p class="conversation-next-text">${escapeHtml(nextActionSummaryCopy)}</p>
          </div>
          ${conversationNextActionsMarkup}
        </div>`;
      const latestConversationBodyRaw = asText(latestMessage.conversationBody).trim();
      const latestMessageBodyRaw = asText(latestMessage.body).trim();
      const latestConversationLooksNoisy =
        /(?:^|\n)(?:Från|From):|(?:^|\n)(?:Datum|Date):|(?:^|\n)(?:Till|To):|(?:^|\n)(?:Ämne|Subject):/i.test(
          latestConversationBodyRaw
        );
      const latestConversationBody =
        (latestConversationBodyRaw &&
        !latestConversationLooksNoisy &&
        !/^(?:Ingen förhandsvisning tillgänglig\.?|Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\b|You\s+don['’]t\s+often\s+get\s+email\s+from\b)/i.test(
          latestConversationBodyRaw
        )
          ? latestConversationBodyRaw
          : "") ||
        (latestMessageBodyRaw &&
        !/^(?:Ingen förhandsvisning tillgänglig\.?|Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\b|You\s+don['’]t\s+often\s+get\s+email\s+from\b)/i.test(
          latestMessageBodyRaw
        )
          ? latestMessageBodyRaw
          : "") ||
        asText(thread.preview || latestConversationBodyRaw || latestMessageBodyRaw);
      const latestHeaderAssetMarkup = buildConversationHeaderAssetStripMarkup(latestMessage, {
        history: false,
      });
      focusConversationSection.innerHTML = `
        <article class="conversation-entry conversation-entry-latest">
          ${
            latestMessage.role === "customer"
              ? `<img class="conversation-avatar" src="${thread.avatar}" alt="${escapeHtml(
                  thread.customerName
                )}" />`
              : `<div class="conversation-avatar conversation-avatar-initials" aria-hidden="true">${escapeHtml(
                  initialsForName(thread.ownerLabel)
                )}</div>`
          }
          <div class="conversation-body">
            <div class="conversation-header">
              <div class="conversation-meta">
                <span class="conversation-author">${escapeHtml(latestMessage.author)}</span>
                <time class="conversation-time" datetime="${escapeHtml(
                  latestMessage.recordedAt || ""
                )}">${escapeHtml(latestMessage.time || thread.lastActivityLabel)}</time>
                <span class="conversation-state-pill">Senaste</span>
                ${latestHeaderAssetMarkup}
              </div>
              <button class="conversation-more" type="button" aria-label="Fler val">
                <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="8" r="1.1" fill="currentColor" /><circle cx="8" cy="8" r="1.1" fill="currentColor" /><circle cx="12" cy="8" r="1.1" fill="currentColor" /></svg>
              </button>
            </div>
            ${buildConversationDocumentMarkup(
              {
                ...latestMessage,
                conversationBody: latestConversationBody,
              },
              { history: false }
            )}
          </div>
        </article>
        ${olderHistoryMarkup}`;
      focusWorkrail.innerHTML = conversationNextStepMarkup;
      decorateStaticPills();
    }

    function renderRuntimeCustomerPanel(thread, focusReadState = {}) {
      if (!focusCustomerHero || !focusCustomerStats || !focusCustomerGrid) return;
      const isOfflineHistorySelection = Boolean(
        typeof isOfflineHistorySelectionActive === "function" && isOfflineHistorySelectionActive()
      );
      const isOfflineHistoryThread = Boolean(
        typeof isOfflineHistoryContextThread === "function" && isOfflineHistoryContextThread(thread)
      );
      const isTruthDrivenReadOnly =
        focusReadState?.truthDriven === true && focusReadState?.readOnly === true;
      const focusWaveLabel = asText(focusReadState?.waveLabel, "Wave 1");
      if (!thread) {
        const isLoading = state.runtime.loading === true;
        renderFocusSummaryCards(focusCustomerSummary, [], "customer");
        if (focusCustomerHistoryTitle) {
          focusCustomerHistoryTitle.textContent = "Kundhistorik över mailboxar";
        }
        if (focusCustomerHistoryDescription) {
          focusCustomerHistoryDescription.textContent =
            isOfflineHistorySelection
              ? "Offline historik är tillgänglig. Välj en historikruta i vänsterkolumnen för att ladda kundkontexten här."
              : "Samlad aktivitet för kunden över valda mailboxar.";
        }
        const customerErrorTitle = isOfflineHistorySelection
          ? "Välj historikruta"
          : isLoading
            ? "Synkar kundkontext"
          : state.runtime.authRequired
            ? "Inloggning krävs"
            : "Kundkontext saknas";
        const customerErrorBody =
          isOfflineHistorySelection
            ? "När du väljer en historikruta visas kunden och trådens sammanhang här i läsläge."
            : isLoading
              ? "Livekön synkar just nu. Kundprofil, historik och trådkontext fylls tillbaka automatiskt när uppdateringen är klar."
            : state.runtime.error || "Logga in igen för att läsa live kunddata i nya CCO.";
        const reauthMarkup = state.runtime.authRequired
          ? `<button class="conversation-next-button" type="button" data-runtime-reauth>Öppna admin och logga in igen</button>`
          : "";
        focusCustomerHero.innerHTML = `
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">CCO</div>
            <div class="focus-customer-copy">
              <h3>${escapeHtml(customerErrorTitle)}</h3>
              <div class="focus-customer-contact-line">
                <span>${escapeHtml(customerErrorBody)}</span>
              </div>
              <div class="focus-customer-chip-row">
                <span class="focus-customer-chip focus-customer-chip--violet">${escapeHtml(
                  isOfflineHistorySelection
                    ? "Offline historik"
                    : isLoading
                      ? "Synkar live"
                    : state.runtime.authRequired
                      ? "Admin-session saknas"
                      : "Live runtime saknas"
                )}</span>
              </div>
              ${reauthMarkup}
            </div>
          </div>`;
        focusCustomerStats.innerHTML = `
          <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">ÄRENDEN</span><strong>-</strong><p>${escapeHtml(
            isLoading ? "synkar live data" : "logga in för live data"
          )}</p></article>
          <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">LTV</span><strong>-</strong><p>${escapeHtml(
            isLoading ? "hämtar kundprofil" : "ingen aktiv session"
          )}</p></article>
          <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">STATUS</span><strong>${escapeHtml(
            state.runtime.authRequired ? "Inloggning krävs" : isLoading ? "Synkar" : "Otillgänglig"
          )}</strong><p>${escapeHtml(isLoading ? "uppdaterar live-state" : "runtime krävs")}</p></article>`;
        focusCustomerGrid.innerHTML = `
          <article class="focus-customer-data-card"><h4>Mailhistorik</h4><dl>
            <div><dt>Mailboxar</dt><dd>-</dd></div>
            <div><dt>Första mail</dt><dd>-</dd></div>
            <div><dt>Senaste mail</dt><dd>-</dd></div>
            <div><dt>Mail</dt><dd>-</dd></div>
          </dl></article>
          <article class="focus-customer-data-card"><h4>Kundprofil</h4><dl>
            <div><dt>Kund</dt><dd>${escapeHtml(customerErrorTitle)}</dd></div>
            <div><dt>Mailbox</dt><dd>-</dd></div>
            <div><dt>Livscykel</dt><dd>-</dd></div>
          </dl></article>
          <article class="focus-customer-data-card"><h4>Konversationsläge</h4><dl>
            <div><dt>Prioritet</dt><dd>-</dd></div>
            <div><dt>Väntar på</dt><dd>-</dd></div>
            <div><dt>Nästa steg</dt><dd>${escapeHtml(
              state.runtime.authRequired ? "Logga in igen" : "Live runtime saknas"
            )}</dd></div>
          </dl></article>
          <article class="focus-customer-data-card"><h4>Risk &amp; uppföljning</h4><dl>
            <div><dt>SLA</dt><dd>-</dd></div>
            <div><dt>Risk</dt><dd>-</dd></div>
            <div><dt>Föreslagen uppföljning</dt><dd>-</dd></div>
          </dl></article>`;
        if (focusCustomerHistoryCount) {
          focusCustomerHistoryCount.textContent = "Visar 0 händelser";
        }
        if (focusCustomerHistoryMeta) {
          focusCustomerHistoryMeta.textContent = isOfflineHistorySelection
            ? "Offline historikläge · välj en historikruta"
            : "Ingen live kundhistorik tillgänglig";
        }
        setCustomerHistoryState(
          isOfflineHistorySelection
            ? "Offline historik"
            : state.runtime.authRequired
              ? "Inloggning krävs"
              : "Vänteläge",
          "violet"
        );
        setCustomerHistoryListState(
          isOfflineHistorySelection ? "Offline historik" : "Vänteläge",
          isOfflineHistorySelection
            ? "Välj en historikruta för att läsa kundkontexten i listan."
            : "Väntar på att en historik eller live-tråd ska fylla listan.",
          "violet"
        );
        if (focusCustomerHistoryReadoutButton) {
          focusCustomerHistoryReadoutButton.disabled = true;
        }
        if (focusCustomerHistoryList) {
          focusCustomerHistoryList.innerHTML = `
            <article class="focus-history-entry">
              <div class="focus-history-entry-head">
                <div>
                  <div class="focus-history-meta-row">
                    <span class="focus-history-type-pill">Kundhistorik</span>
                  </div>
                  <p class="focus-history-entry-title">${escapeHtml(customerErrorTitle)}</p>
                  <p class="focus-history-entry-text">${escapeHtml(customerErrorBody)}</p>
                </div>
              </div>
            </article>`;
        }
        return;
      }
      const customerEvents = buildCustomerHistoryEvents(thread);
      const relatedThreads = getRelatedCustomerThreads(thread);
      const customerMailboxOptions = getCustomerHistoryMailboxOptions(thread);
      const firstEvent = customerEvents[customerEvents.length - 1];
      const latestEvent = customerEvents[0];
      const caseCount = Math.max(
        relatedThreads.length,
        asNumber(thread.raw?.customerSummary?.caseCount, 0),
        1
      );
      const customerSummary = thread.raw?.customerSummary || {};
      const primaryMailboxList = customerMailboxOptions.map((item) => item.label);
      focusCustomerHero.innerHTML = `
        <div class="focus-customer-hero-main">
          <div class="focus-customer-avatar">${escapeHtml(initialsForName(thread.customerName))}</div>
          <div class="focus-customer-copy">
            <h3>${escapeHtml(thread.customerName)}</h3>
            <div class="focus-customer-contact-line">
              <span>${escapeHtml(thread.customerEmail || "Ingen e-post")}</span>
              <span>·</span>
              <span>${escapeHtml(
                customerMailboxOptions.map((item) => item.label).join(", ") || thread.mailboxesLabel
              )}</span>
            </div>
            <div class="focus-customer-chip-row">
              <span class="focus-customer-chip focus-customer-chip--blue">${escapeHtml(
                firstEvent?.recordedAt
                  ? `Sedan ${new Date(firstEvent.recordedAt).getUTCFullYear()}`
                  : "Ny kund"
              )}</span>
              <span class="focus-customer-chip focus-customer-chip--violet">${escapeHtml(
                thread.lifecycleLabel
              )}</span>
              <span class="focus-customer-chip focus-customer-chip--gold">${escapeHtml(
                `${thread.riskLabel} · ${thread.waitingLabel}`
              )}</span>
              <span class="focus-customer-chip focus-customer-chip--green">${escapeHtml(
                isOfflineHistoryThread ? "Vald historik" : "Aktiv tråd"
              )}</span>
              ${
                isTruthDrivenReadOnly
                  ? `<span class="focus-customer-chip focus-customer-chip--violet">${escapeHtml(
                      `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel}`
                    )}</span>`
                  : ""
              }
              ${
                isOfflineHistoryThread
                  ? `<span class="focus-customer-chip focus-customer-chip--violet">Offline historik</span>`
                  : ""
              }
            </div>
          </div>
        </div>`;

      renderFocusSummaryCards(
        focusCustomerSummary,
        buildCustomerSummaryCards(thread, customerEvents, relatedThreads, customerMailboxOptions),
        "customer"
      );

      focusCustomerStats.innerHTML = `
        <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">MAILBOXAR</span><strong>${escapeHtml(
          String(customerMailboxOptions.length || 1)
        )}</strong><p>${escapeHtml(
          joinReadableList(primaryMailboxList.length ? primaryMailboxList : [thread.mailboxLabel], 2) ||
            thread.mailboxLabel
        )}</p></article>
        <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">TRÅDAR</span><strong>${escapeHtml(
          String(caseCount)
        )}</strong><p>${escapeHtml(
          asText(customerSummary.historySignalSummary, "Kopplade spår för kunden")
        )}</p></article>
        <article class="focus-customer-stat-card"><span class="focus-customer-stat-label">SENASTE AKTIVITET</span><strong>${escapeHtml(
          latestEvent?.time || thread.lastActivityLabel
        )}</strong><p>${escapeHtml(
          compactRuntimeCopy(
            latestEvent?.description || thread.displaySubject || thread.subject,
            thread.displaySubject || thread.subject,
            54
          )
        )}</p></article>`;

      focusCustomerGrid.innerHTML = `
        <article class="focus-customer-data-card"><h4>Mailhistorik</h4><dl>
          <div><dt>Mailboxar</dt><dd>${escapeHtml(
            joinReadableList(primaryMailboxList.length ? primaryMailboxList : [thread.mailboxLabel], 4) ||
              thread.mailboxesLabel
          )}</dd></div>
          <div><dt>Första mail</dt><dd>${escapeHtml(
            firstEvent ? formatConversationTime(firstEvent.recordedAt) : "-"
          )}</dd></div>
          <div><dt>Senaste mail</dt><dd>${escapeHtml(
            latestEvent ? formatConversationTime(latestEvent.recordedAt) : thread.lastActivityLabel
          )}</dd></div>
          <div><dt>Mail</dt><dd>${escapeHtml(
            `${customerEvents.length} händelser · ${relatedThreads.length} trådar`
          )}</dd></div>
        </dl></article>
        <article class="focus-customer-data-card"><h4>Kundprofil</h4><dl>
          <div><dt>Kund</dt><dd>${escapeHtml(thread.customerName)}</dd></div>
          <div><dt>Mailbox</dt><dd>${escapeHtml(thread.mailboxLabel)}</dd></div>
          <div><dt>Livscykel</dt><dd>${escapeHtml(thread.lifecycleLabel)}</dd></div>
          <div><dt>Relation</dt><dd>${escapeHtml(thread.displayEngagementLabel || thread.engagementLabel)}</dd></div>
        </dl></article>
        <article class="focus-customer-data-card"><h4>Konversationsläge</h4><dl>
          <div><dt>Prioritet</dt><dd>${escapeHtml(
            thread.tags.includes("sprint") ? "Sprint" : "Normal"
          )}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(thread.statusLabel)}</dd></div>
          <div><dt>Väntar på</dt><dd>${escapeHtml(thread.waitingLabel)}</dd></div>
          <div><dt>Nästa steg</dt><dd>${escapeHtml(thread.nextActionLabel)}</dd></div>
        </dl></article>
        <article class="focus-customer-data-card"><h4>Risk &amp; uppföljning</h4><dl>
          <div><dt>SLA</dt><dd>${escapeHtml(humanizeCode(thread.raw?.slaStatus, "Stabil"))}</dd></div>
          <div><dt>Risk</dt><dd>${escapeHtml(thread.riskReason)}</dd></div>
          <div><dt>Föreslagen uppföljning</dt><dd>${escapeHtml(thread.followUpLabel || "-")}</dd></div>
          <div><dt>Nästa drag</dt><dd>${escapeHtml(
            compactRuntimeCopy(thread.nextActionSummary, "Ingen planerad uppföljning ännu.", 72)
          )}</dd></div>
        </dl></article>`;

      if (focusCustomerHistoryTitle) {
        focusCustomerHistoryTitle.textContent = `Kundhistorik över ${
          customerMailboxOptions.length || 1
        } mailboxar`;
      }
      if (focusCustomerHistoryDescription) {
        focusCustomerHistoryDescription.textContent = isOfflineHistoryThread
          ? `Samlad aktivitet för ${thread.customerName} i offline historik. Operativa actions kräver live-tråd.`
          : isTruthDrivenReadOnly
            ? `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel} · Samlad aktivitet för ${thread.customerName} över ${caseCount} spår i valt scope.`
            : `Samlad aktivitet för ${thread.customerName} över ${caseCount} spår i valt scope.`;
      }
      if (focusCustomerHistoryCount) {
        focusCustomerHistoryCount.textContent = `Visar ${customerEvents.length} händelser`;
      }
      if (focusCustomerHistoryMeta) {
        const latestLabel = latestEvent?.time || thread.lastActivityLabel;
        focusCustomerHistoryMeta.textContent = isOfflineHistoryThread
          ? `Offline historik · ${customerMailboxOptions.length || 1} mailboxar · senaste ${latestLabel}`
          : isTruthDrivenReadOnly
            ? `${focusReadState.label || "Truth-driven focus"} · ${focusWaveLabel} · ${customerMailboxOptions.length || 1} mailboxar · ${relatedThreads.length} trådar · senaste ${latestLabel}`
            : `${customerMailboxOptions.length || 1} mailboxar · ${relatedThreads.length} trådar · senaste ${latestLabel}`;
      }
      setCustomerHistoryState(isOfflineHistoryThread ? "Vald historik" : "Aktiv tråd");
      setCustomerHistoryListState(
        isOfflineHistoryThread ? "Vald historik" : "Aktiv tråd",
        isOfflineHistoryThread
          ? `Listan visar vald historik för ${thread.customerName}.`
          : `Listan visar aktiv tråd för ${thread.customerName}.`
      );
      if (focusCustomerHistoryReadoutButton) {
        focusCustomerHistoryReadoutButton.disabled = false;
      }
      if (focusCustomerHistoryList) {
        if (!customerEvents.length) {
          focusCustomerHistoryList.innerHTML = `
            <article class="focus-history-entry">
              <div class="focus-history-entry-head">
                <div>
                  <div class="focus-history-meta-row">
                    <span class="focus-history-type-pill">Kundhistorik</span>
                  </div>
                  <p class="focus-history-entry-title">Ingen kundhistorik i valt urval</p>
                  <p class="focus-history-entry-text">Byt mailboxscope för att läsa fler trådar över kunden.</p>
                </div>
              </div>
            </article>`;
        } else {
          renderHistoryEventsList(
            focusCustomerHistoryList,
            customerEvents.slice(0, 8),
            thread.id,
            undefined,
            {
              label: isOfflineHistoryThread ? "Vald historik" : "Aktiv tråd",
              title: "Listans utgångsläge",
              text: isOfflineHistoryThread
                ? `Listan visar vald historik för ${thread.customerName}.`
                : `Listan visar aktiv tråd för ${thread.customerName}.`,
            }
          );
        }
      }
    }

    function renderIntelCardGroup(container, cards) {
      if (!container) return;
      container.innerHTML = cards.map((card) => renderIntelCardMarkup(card)).join("");
    }

    function buildIntelDisplayLine(label, value, maxChars = 72) {
      const safeLabel = asText(label);
      const safeValue = compactRuntimeCopy(value, "", maxChars);
      if (!safeLabel || !safeValue) return null;
      return { label: safeLabel, value: safeValue };
    }

    function normalizeIntelDisplayCards(cards, { maxCards = 3, fallbackTitle = "Översikt" } = {}) {
      const seenKeys = new Set();
      return asArray(cards)
        .map((card) => {
          const safeCard = card && typeof card === "object" ? card : null;
          if (!safeCard) return null;
          const helperLines = asArray(safeCard.lines).filter(
            (line) => line && typeof line === "object" && (asText(line.label) || asText(line.value))
          );
          const simpleLines = asArray(safeCard.lines).filter((line) => typeof line === "string");
          const timelineLines = asArray(safeCard.timeline)
            .filter((item) => item && typeof item === "object" && asText(item.label))
            .map((item) =>
              buildIntelDisplayLine(
                asText(item.label, "Händelse"),
                [asText(item.date), asText(item.note)].filter(Boolean).join(" · "),
                78
              )
            )
            .filter(Boolean);
          const chip = compactRuntimeCopy(asText(safeCard.chip), "", 28);
          const title =
            compactRuntimeCopy(asText(safeCard.title), "", 42) ||
            chip ||
            compactRuntimeCopy(asText(safeCard.heading), fallbackTitle, 42) ||
            fallbackTitle;
          const remainingSimpleLines = [...simpleLines];
          const detail =
            compactRuntimeCopy(asText(safeCard.detail), "", 100) ||
            compactRuntimeCopy(remainingSimpleLines.shift(), "", 100);
          const note =
            compactRuntimeCopy(asText(safeCard.note), "", 92) ||
            compactRuntimeCopy(remainingSimpleLines.shift(), "", 92);
          const lines = [
            ...helperLines.map((line) =>
              buildIntelDisplayLine(asText(line.label, "Info"), asText(line.value, "-"))
            ),
            ...timelineLines,
            ...remainingSimpleLines.map((line, index) =>
              buildIntelDisplayLine(index === 0 ? "Fokus" : "Mer", line)
            ),
          ]
            .filter(Boolean)
            .slice(0, 3);
          const badges = asArray(safeCard.badges)
            .filter((badge) => badge && typeof badge === "object" && asText(badge.label))
            .slice(0, 2)
            .map((badge) => ({
              ...badge,
              label: compactRuntimeCopy(asText(badge.label), asText(badge.label), 22),
            }));
          const provenance =
            safeCard.provenance && typeof safeCard.provenance === "object"
              ? {
                  label: compactRuntimeCopy(asText(safeCard.provenance.label), "", 24),
                  detail: compactRuntimeCopy(asText(safeCard.provenance.detail), "", 82),
                  tone: safeCard.provenance.tone,
                }
              : null;
          if (!title && !detail && !note && !lines.length && !badges.length) {
            return null;
          }
          const contentKey = normalizeKey([title, detail, note].filter(Boolean).join("|"));
          if (contentKey && seenKeys.has(contentKey)) {
            return null;
          }
          if (contentKey) {
            seenKeys.add(contentKey);
          }
          return {
            tone: safeCard.tone,
            chip: chip && chip !== title ? chip : "",
            title,
            detail,
            note,
            lines,
            badges,
            provenance,
          };
        })
        .filter(Boolean)
        .slice(0, maxCards);
    }

    function renderIntelCardMarkup(card) {
      const safeCard = card && typeof card === "object" ? card : {};
      const toneClass =
        safeCard.tone === "blue"
          ? "intel-card-chip-blue"
          : safeCard.tone === "green"
            ? "intel-card-chip-green"
            : "intel-card-chip-violet";
      const helperLines = asArray(safeCard.lines).filter(
        (line) => line && typeof line === "object" && (asText(line.label) || asText(line.value))
      );
      const badges = asArray(safeCard.badges).filter(
        (badge) => badge && typeof badge === "object" && asText(badge.label)
      );
      const provenance =
        safeCard.provenance && typeof safeCard.provenance === "object"
          ? safeCard.provenance
          : null;
      const provenanceLabel = asText(provenance?.label);
      const provenanceDetail = asText(provenance?.detail);
      const provenanceTone =
        normalizeKey(provenance?.tone) === "ai"
          ? "intel-card-provenance-ai"
          : normalizeKey(provenance?.tone) === "system"
            ? "intel-card-provenance-system"
            : "intel-card-provenance-derived";
      const title = asText(safeCard.title);
      const detail = asText(safeCard.detail);
      const note = asText(safeCard.note);
      const implicationLabel =
        normalizeKey(safeCard.chip) === "nu"
          ? "Gör så här"
          : normalizeKey(safeCard.chip) === "team"
            ? "Att tänka på"
            : "Betyder nu";
      const metaItems = [];
      if (asText(safeCard.chip)) {
        metaItems.push(
          `<span class="intel-card-chip ${toneClass}">${escapeHtml(asText(safeCard.chip))}</span>`
        );
      }
      if (provenanceLabel || provenanceDetail) {
        metaItems.push(`<div class="intel-card-provenance">
              ${
                provenanceLabel
                  ? `<span class="intel-card-provenance-label ${provenanceTone}"${
                      provenanceDetail
                        ? ` title="${escapeHtml(provenanceDetail)}" aria-label="${escapeHtml(
                            `${provenanceLabel}: ${provenanceDetail}`
                          )}"`
                        : ""
                    }>${escapeHtml(provenanceLabel)}</span>`
                  : ""
              }
            </div>`);
      }
      return `<article class="intel-card intel-card-detail-shell">
        ${metaItems.length ? `<div class="intel-card-meta-row">${metaItems.join("")}</div>` : ""}
        ${
          title || detail
            ? `<div class="intel-card-summary">
                ${title ? `<h4 class="intel-card-heading">${escapeHtml(title)}</h4>` : ""}
                ${detail ? `<p class="intel-card-detail">${escapeHtml(detail)}</p>` : ""}
              </div>`
            : ""
        }
        ${
          helperLines.length
            ? `<dl class="intel-card-lines">
                ${helperLines
                  .map(
                    (line) => `<div class="intel-card-line">
                      <dt class="intel-card-line-label">${escapeHtml(asText(line.label, "Info"))}</dt>
                      <dd class="intel-card-line-value">${escapeHtml(asText(line.value, "-"))}</dd>
                    </div>`
                  )
                  .join("")}
              </dl>`
            : ""
        }
        ${
          note
            ? `<div class="intel-card-implication">
                <span class="intel-card-implication-label">${escapeHtml(implicationLabel)}</span>
                <p class="intel-card-note">${escapeHtml(note)}</p>
              </div>`
            : ""
        }
        ${
          badges.length
            ? `<div class="intel-card-badges">
                ${badges
                  .map((badge) => {
                    const badgeTone =
                      normalizeKey(badge.tone) === "danger"
                        ? "intel-card-badge-danger"
                        : normalizeKey(badge.tone) === "warn"
                          ? "intel-card-badge-warn"
                          : normalizeKey(badge.tone) === "success"
                            ? "intel-card-badge-success"
                            : normalizeKey(badge.tone) === "info"
                              ? "intel-card-badge-info"
                              : "intel-card-badge-neutral";
                    return `<span class="intel-card-badge ${badgeTone}">${escapeHtml(
                      asText(badge.label)
                    )}</span>`;
                  })
                  .join("")}
              </div>`
            : ""
        }
      </article>`;
    }

    function buildIntelCustomerCard(thread) {
      return {
        chip: "Kundläge",
        title: "Så svarar kunden bäst",
        provenance: {
          label: "Live kundkontext",
          tone: "derived",
          detail: "Samlar kundens läge, tempo och kontaktkontext utan att blanda in arbetsplanen.",
        },
        detail: compactRuntimeCopy(
          thread?.raw?.customerSummary?.historySignalActionCue,
          "Led kunden med ett tydligt nästa steg i samma svar.",
          92
        ),
        note: compactRuntimeCopy(
          thread?.raw?.customerSummary?.lastCaseSummary,
          "Ingen kundsammanfattning tillgänglig.",
          92
        ),
        lines: [
          { label: "Tempo", value: humanizeCode(thread?.raw?.tempoProfile, "Reflekterande") },
          { label: "Kundläge", value: asText(thread?.lifecycleLabel, "Aktiv") },
          {
            label: "Engagemang",
            value: asText(thread?.displayEngagementLabel || thread?.engagementLabel, "Ingen signal"),
          },
          { label: "Kontaktväg", value: asText(thread?.mailboxesLabel || thread?.mailboxLabel, "Okänd") },
        ],
      };
    }

    function buildIntelHistoryCard(thread) {
      const historyCount = Math.max(
        1,
        asNumber(thread?.raw?.customerSummary?.historyMessageCount, thread?.raw?.customerSummary?.interactionCount || 1)
      );
      return {
        chip: "Historik",
        title: "Vad historiken säger",
        provenance: {
          label: "Tidigare kontakt",
          tone: "system",
          detail: "Sammanfattar vad tidigare kundinteraktioner signalerar om tempo, svarsmönster och nästa steg.",
        },
        detail: compactRuntimeCopy(
          thread?.raw?.customerSummary?.historySignalSummary,
          "Ingen historiksignal registrerad ännu.",
          92
        ),
        note: compactRuntimeCopy(
          thread?.raw?.customerSummary?.historySignalActionCue,
          "Ingen historikbaserad styrsignal registrerad ännu.",
          92
        ),
        lines: [
          {
            label: "Senaste inkommande",
            value: thread?.raw?.lastInboundAt
              ? formatConversationTime(thread.raw.lastInboundAt)
              : "Ingen inkommande ännu",
          },
          {
            label: "Senaste utgående",
            value: thread?.raw?.lastOutboundAt
              ? formatConversationTime(thread.raw.lastOutboundAt)
              : "Inte besvarad ännu",
          },
          {
            label: "Historikbas",
            value: `${historyCount} mail · ${asText(thread?.mailboxesLabel || thread?.mailboxLabel, "1 mailbox")}`,
          },
        ],
      };
    }

    function buildRuntimeIntelPanelCards(thread) {
      const helperConversation = buildIntelHelperConversation(thread);
      const customerHelper =
        windowObject.ArcanaCcoNextCustomerIntelligence &&
        typeof windowObject.ArcanaCcoNextCustomerIntelligence.buildModel === "function"
          ? windowObject.ArcanaCcoNextCustomerIntelligence.buildModel(helperConversation)
          : null;
      const actorLabel = asText(
        getStudioSignatureProfile(state.runtime.defaultSignatureProfile).fullName ||
          thread?.ownerLabel,
        thread?.ownerLabel || "Team"
      );
      const collaborationHelper =
        windowObject.ArcanaCcoNextCollaboration &&
        typeof windowObject.ArcanaCcoNextCollaboration.buildModel === "function"
          ? windowObject.ArcanaCcoNextCollaboration.buildModel(helperConversation, { actorLabel })
          : null;
      const baseCards = thread?.cards || buildRuntimeSummaryCards(thread?.raw || {}, thread);
      const collaborationNotice = collaborationHelper?.notice
        ? {
            title: asText(collaborationHelper.notice.title, "Teamnotis"),
            detail: asText(collaborationHelper.notice.note, "Ingen extra teamnotis just nu."),
            badges: [
              {
                label:
                  asText(collaborationHelper.notice.tone, "neutral") === "warn"
                    ? "Krockrisk"
                    : "Teamläge",
                tone: asText(collaborationHelper.notice.tone, "neutral"),
              },
            ],
          }
        : null;

      return {
        customer: normalizeIntelDisplayCards(
          [
            buildIntelCustomerCard(thread),
            customerHelper?.relationshipCard || null,
            customerHelper?.identityCard || null,
            customerHelper?.journeyCard || null,
            ...asArray(baseCards.customer),
          ],
          { maxCards: 3, fallbackTitle: "Kund" }
        ),
        history: normalizeIntelDisplayCards(
          [buildIntelHistoryCard(thread), ...asArray(baseCards.history)],
          { maxCards: 3, fallbackTitle: "Historik" }
        ),
        signals: [],
        medicine: [],
        team: normalizeIntelDisplayCards(
          [
            collaborationHelper?.handoffCard || null,
            collaborationHelper?.draftCard || null,
            collaborationHelper?.presenceCard || null,
            collaborationNotice,
            ...asArray(baseCards.team),
          ],
          { maxCards: 3, fallbackTitle: "Team" }
        ),
        actions: normalizeIntelDisplayCards(
          [...asArray(baseCards.actions), ...asArray(baseCards.signals)],
          { maxCards: 3, fallbackTitle: "Nu" }
        ),
      };
    }

    function renderRuntimeIntel(thread, focusReadState = {}) {
      if (!focusIntelTitle || !intelDateButton || !intelCustomer || !intelGrid) {
        return;
      }
      const isOfflineHistorySelection = Boolean(
        typeof isOfflineHistorySelectionActive === "function" && isOfflineHistorySelectionActive()
      );
      const isOfflineHistoryThread = Boolean(
        typeof isOfflineHistoryContextThread === "function" && isOfflineHistoryContextThread(thread)
      );
      const isTruthDrivenReadOnly =
        focusReadState?.truthDriven === true && focusReadState?.readOnly === true;
      const focusWaveLabel = asText(focusReadState?.waveLabel, "Wave 1");
      if (!thread) {
        applyIntelWaitingState(true);
        const isLoading = state.runtime.loading === true;
        const isAuthRequired = state.runtime.authRequired === true;
        const supportCopy = isOfflineHistorySelection
          ? "Offline historik är tillgänglig i läsläge. Välj en historikruta i vänsterkolumnen för att läsa kundstatus och historik här. Svar, senare, anteckning och radera kräver live-tråd."
          : isLoading
            ? "Livekön synkar just nu. Kundstatus, historik och nästa drag fylls tillbaka automatiskt när uppdateringen är klar."
          : isAuthRequired
            ? state.runtime.error ||
              "Öppna admin och logga in igen för att återställa live kunddata, historik och arbetsplan."
            : state.runtime.error ||
              "Välj en aktiv live-tråd i arbetskön för att läsa kundstatus, historik och rekommenderat nästa drag.";
        focusIntelTitle.textContent = isOfflineHistorySelection ? "Operativt stöd · läsläge" : "Operativt stöd";
        setRuntimeActionRowsVisibility("[data-intel-actions]", false);
        intelDateButton.innerHTML = `<span>${escapeHtml(
          isOfflineHistorySelection
            ? "offline historik · läsläge"
            : isLoading
              ? "synkar live-läget"
            : isAuthRequired
              ? "session krävs"
              : "live-läge pausat"
        )}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.3 6.5 8 9.2l2.7-2.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>`;
        intelCustomer.innerHTML = `
          <div class="focus-intel-monogram">CCO</div>
          <div class="focus-intel-customer-copy">
            <div class="focus-intel-name-row">
              <h4>${escapeHtml(
                isOfflineHistorySelection
                  ? "Välj historikruta"
                  : isLoading
                    ? "Synkar livekö"
                  : isAuthRequired
                    ? "Livekö ej ansluten"
                    : "Väntar på live-tråd"
              )}</h4>
              <span class="focus-intel-queue-pill" data-pill-icon="bolt">${escapeHtml(
                isOfflineHistorySelection
                  ? "Offline historik"
                  : isLoading
                    ? "Synkar"
                  : isAuthRequired
                    ? "Åtkomst krävs"
                    : "Pausat"
              )}</span>
            </div>
            <p>${escapeHtml(supportCopy)}</p>
          </div>`;
        intelGrid.innerHTML = `
          <div class="focus-intel-item focus-intel-item-lifecycle"><span class="focus-intel-label">LIVSCYKEL</span><strong>-</strong></div>
          <div class="focus-intel-item focus-intel-item-waiting"><span class="focus-intel-label">VÄNTAR PÅ</span><strong>${escapeHtml(
            isOfflineHistorySelection
              ? "Historikval"
              : isLoading
                ? "Live-sync"
              : isAuthRequired
                ? "Admin-inloggning"
                : "Val i arbetskön"
          )}</strong></div>
          <div class="focus-intel-item focus-intel-item-followup"><span class="focus-intel-label">UPPFÖLJNING</span><strong>${escapeHtml(
            isAuthRequired ? "Efter login" : isLoading ? "Efter sync" : "-"
          )}</strong></div>
          <div class="focus-intel-item focus-intel-item-status"><span class="focus-intel-label">STATUS</span><strong>${escapeHtml(
            isAuthRequired ? "Session krävs" : isLoading ? "Synkar" : "Ingen live-tråd"
          )}</strong></div>
          <div class="focus-intel-item focus-intel-item-owner"><span class="focus-intel-label">ÄGARE</span><strong>CCO</strong></div>
          <div class="focus-intel-item focus-intel-item-risk"><span class="focus-intel-label">RISK</span><strong>${escapeHtml(
            isAuthRequired ? "Ingen live-bedömning" : "Ingen live-data"
          )}</strong></div>`;
        if (intelReasonCopy) {
          intelReasonCopy.textContent = isLoading
            ? "Livekön synkar just nu. Kundintelligensen fylls tillbaka automatiskt när samma tråd är åter i live-state."
            : isAuthRequired
            ? "För att få kundstatus, historik och arbetsplan tillbaka behöver admin-sessionen loggas in igen."
            : isOfflineHistorySelection
              ? "När du väljer en historikruta visas kundstatus och historik här i läsläge. Live-actions kräver att en live-tråd väljs igen."
              : "När en live-tråd väljs samlas kundstatus, historik och rekommenderat nästa drag här.";
        }
        renderIntelCardGroup(intelPanelCustomer, []);
        renderIntelCardGroup(intelPanelHistory, []);
        renderIntelCardGroup(intelPanelSignals, []);
        renderIntelCardGroup(intelPanelMedicine, []);
        renderIntelCardGroup(intelPanelTeam, []);
        renderIntelCardGroup(intelPanelActions, []);
        applyIntelPrimaryExpandedState();
        decorateStaticPills();
        return;
      }
      applyIntelWaitingState(false);
      focusIntelTitle.textContent = isOfflineHistoryThread
        ? "Operativt stöd · läsläge"
        : isTruthDrivenReadOnly
          ? `Operativt stöd · ${focusReadState.label || "Truth-driven focus"}`
          : "Operativt stöd";
      setRuntimeActionRowsVisibility("[data-intel-actions]", !isOfflineHistoryThread);
      intelDateButton.innerHTML = `<span>${escapeHtml(
        isOfflineHistoryThread
          ? "offline historik · läsläge"
          : `live ${formatConversationTime(state.runtime.lastSyncAt || new Date().toISOString())}`
      )}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.3 6.5 8 9.2l2.7-2.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>`;
      intelCustomer.innerHTML = `
        <div class="focus-intel-monogram">${escapeHtml(initialsForName(thread.customerName))}</div>
        <div class="focus-intel-customer-copy">
          <div class="focus-intel-name-row">
            <h4>${escapeHtml(thread.customerName)}</h4>
            <span class="focus-intel-queue-pill" data-pill-icon="bolt">${escapeHtml(
              isOfflineHistoryThread
                ? "Offline historik"
                : thread.tags.includes("act-now")
                  ? "Agera nu"
                  : thread.tags.includes("sprint")
                    ? "Sprint"
                    : thread.statusLabel
            )}</span>
          </div>
          <p>${escapeHtml(
            isTruthDrivenReadOnly
              ? compactRuntimeCopy(
                  `${thread.displayCustomerMeta || `${thread.displayEngagementLabel || thread.engagementLabel} · ${thread.displayOwnerLabel || thread.ownerLabel}`} · ${focusWaveLabel} truth-driven läsläge`,
                  `${thread.displayEngagementLabel || thread.engagementLabel} · ${thread.displayOwnerLabel || thread.ownerLabel}`,
                  86
                )
              : compactRuntimeCopy(
                  thread.displayCustomerMeta || `${thread.displayEngagementLabel || thread.engagementLabel} · ${thread.displayOwnerLabel || thread.ownerLabel}`,
                  `${thread.displayEngagementLabel || thread.engagementLabel} · ${thread.displayOwnerLabel || thread.ownerLabel}`,
                  86
                )
          )}</p>
        </div>`;
      intelGrid.innerHTML = `
        <div class="focus-intel-item focus-intel-item-lifecycle"><span class="focus-intel-label">LIVSCYKEL</span><strong>${escapeHtml(
          thread.lifecycleLabel
        )}</strong></div>
        <div class="focus-intel-item focus-intel-item-waiting"><span class="focus-intel-label">VÄNTAR PÅ</span><strong>${escapeHtml(
          thread.waitingLabel
        )}</strong></div>
        <div class="focus-intel-item focus-intel-item-followup"><span class="focus-intel-label">UPPFÖLJNING</span><strong>${escapeHtml(
          thread.followUpLabel || "-"
        )}</strong></div>
        <div class="focus-intel-item focus-intel-item-status"><span class="focus-intel-label">STATUS</span><strong>${escapeHtml(
          thread.statusLabel
        )}</strong></div>
        <div class="focus-intel-item focus-intel-item-owner"><span class="focus-intel-label">ÄGARE</span><strong>${escapeHtml(
          thread.displayOwnerLabel || thread.ownerLabel
        )}</strong></div>
        <div class="focus-intel-item focus-intel-item-risk"><span class="focus-intel-label">RISK</span><strong>${escapeHtml(
          thread.riskLabel
        )}</strong></div>`;
      if (intelReasonCopy) {
        intelReasonCopy.textContent = isOfflineHistoryThread
          ? compactRuntimeCopy(
              `${thread.whyInFocus} Läsläge från offline historik. Live-actions kräver att en live-tråd väljs igen.`,
              "Läsläge från offline historik. Live-actions kräver att en live-tråd väljs igen.",
              132
            )
          : isTruthDrivenReadOnly
            ? compactRuntimeCopy(
                `${thread.whyInFocus} ${asText(
                  focusReadState?.detail,
                  "Truth-driven läsläge i fokusytan för wave 1. Reply- och studioflödet ligger kvar utanför detta pass."
                )}`,
                thread.whyInFocus,
                132
              )
            : compactRuntimeCopy(thread.whyInFocus, thread.whyInFocus, 132);
      }
      const intelPanels = buildRuntimeIntelPanelCards(thread);
      renderIntelCardGroup(intelPanelCustomer, intelPanels.customer);
      renderIntelCardGroup(intelPanelHistory, intelPanels.history);
      renderIntelCardGroup(intelPanelSignals, intelPanels.signals);
      renderIntelCardGroup(intelPanelMedicine, intelPanels.medicine);
      renderIntelCardGroup(intelPanelTeam, intelPanels.team);
      renderIntelCardGroup(intelPanelActions, intelPanels.actions);
      applyIntelPrimaryExpandedState();
      decorateStaticPills();
    }

    return Object.freeze({
      renderFocusHistorySection,
      renderFocusNotesSection,
      renderRuntimeCustomerPanel,
      renderRuntimeFocusConversation,
      renderRuntimeIntel,
    });
  }

  window.MajorArcanaPreviewFocusIntelRenderers = Object.freeze({
    createFocusIntelRenderers,
  });
})();
