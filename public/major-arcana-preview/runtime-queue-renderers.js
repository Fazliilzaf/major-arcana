(() => {
  // ============================================================
  // Customer-name resolver (migrerad från P0-2 shim 2026-05-07)
  // ============================================================
  // Hämtar ?fallback-namn för trådar där app.js har "Okänd avsändare".
  // Tidigare en setInterval(1500ms)-shim som scannade hela DOM:en konstant.
  // Nu körs det bara när renderern faktiskt kör (renderQueueHistoryList +
  // renderQueueInlineLaneList anropar scanAndFixUnknownSenders på sin egen
  // container) plus en lågfrekvent re-fetch var 60s av API-data.

  const __CUSTOMER_LS_KEY = "cco.selectedMailboxIds.v1";
  const __CUSTOMER_DEFAULT_MAILBOXES = ["contact", "egzona", "fazli", "info", "kons", "marknad"];
  const __threadCustomerMap = new Map();

  function asText(...values) {
    for (const value of values) {
      if (typeof value === "string") {
        const normalized = value.trim();
        if (normalized) return normalized;
      }
    }
    return "";
  }

  function __normalizeKey(value) {
    return asText(value).toLowerCase();
  }

  function __formatHistoryTimestamp(value) {
    try {
      if (typeof formatHistoryTimestamp === "function") {
        return formatHistoryTimestamp(value);
      }
    } catch (_error) {
      /* tyst */
    }
    return asText(value);
  }

  function __renderUnifiedCardIconMarkup(name) {
    try {
      if (typeof renderUnifiedCardIconMarkup === "function") {
        return renderUnifiedCardIconMarkup(name);
      }
    } catch (_error) {
      /* tyst */
    }
    return "";
  }

  function __getThreadPrimaryLaneId(thread) {
    try {
      if (typeof getThreadPrimaryLaneId === "function") {
        return getThreadPrimaryLaneId(thread);
      }
    } catch (_error) {
      /* tyst */
    }
    return "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => {
      return (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[character] || character
      );
    });
  }

  function compactRuntimeCopy(value, fallback = "", limit = 160) {
    const baseValue = asText(value, fallback).replace(/\s+/g, " ").trim();
    if (!baseValue) return "";
    if (!Number.isFinite(limit) || limit <= 0 || baseValue.length <= limit) {
      return baseValue;
    }
    return `${baseValue.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
  }

  function __getPreviewState() {
    try {
      const workspaceApi = window.__ccoWorkspace;
      if (workspaceApi && typeof workspaceApi.getState === "function") {
        const previewState = workspaceApi.getState();
        if (previewState && typeof previewState === "object") {
          return previewState;
        }
      }
    } catch (_error) {
      /* tyst */
    }
    return null;
  }

  function __buildWorklistConsumerUrl() {
    let mailboxIds = [];
    try {
      const persisted = localStorage.getItem(__CUSTOMER_LS_KEY);
      if (persisted) {
        const parsed = JSON.parse(persisted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          mailboxIds = parsed.map((k) => `${k}@hairtpclinic.com`);
        }
      }
    } catch (_e) {
      /* tyst */
    }
    if (mailboxIds.length === 0) {
      mailboxIds = __CUSTOMER_DEFAULT_MAILBOXES.map((k) => `${k}@hairtpclinic.com`);
    }
    const params = new URLSearchParams();
    params.set("mailboxIds", mailboxIds.join(","));
    params.set("limit", "500");
    return `/api/v1/cco/runtime/worklist/consumer?${params.toString()}`;
  }

  async function __fetchWorklistAndBuildMap() {
    try {
      const token = localStorage.getItem("ARCANA_ADMIN_TOKEN") || "";
      if (!token) return false;
      const res = await fetch(__buildWorklistConsumerUrl(), {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return false;
      const data = await res.json();
      const rows = Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.items)
          ? data.items
          : [];
      let added = 0;
      for (const row of rows) {
        const id =
          row.id ||
          row.conversationKey ||
          row.conversation?.key ||
          row.conversation?.mailboxConversationId ||
          row.conversation?.conversationId ||
          row.conversation?.id ||
          row.conversationId;
        if (!id) continue;
        const customer = row.customer || row.contact || {};
        const name =
          customer.name || customer.displayName || row.customerName || row.from?.name || "";
        const email =
          customer.email || customer.address || row.customerEmail || row.from?.address || "";
        const norm = String(id).toLowerCase();
        __threadCustomerMap.set(norm, { name, email });
        const stripped = norm.replace(/[^a-z0-9]/g, "");
        __threadCustomerMap.set(stripped, { name, email });
        added += 1;
      }
      return added > 0;
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[name-resolver] worklist-fetch fel:", e);
      return false;
    }
  }

  function __lookupCustomerForCard(cardEl) {
    const tid =
      cardEl.dataset.runtimeThread || cardEl.dataset.historyConversation || cardEl.dataset.threadId;
    if (!tid) return null;
    const norm = String(tid).toLowerCase();
    if (__threadCustomerMap.has(norm)) return __threadCustomerMap.get(norm);
    const stripped = norm.replace(/[^a-z0-9]/g, "");
    if (__threadCustomerMap.has(stripped)) return __threadCustomerMap.get(stripped);
    return null;
  }

  function __humanizeLocalpart(localpart) {
    if (!localpart) return "";
    return localpart
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  function __fixUnknownSenderInCard(cardEl) {
    if (!cardEl) return;
    const walker = document.createTreeWalker(cardEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        /Okänd avsändare/i.test(node.nodeValue || "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);
    if (targets.length === 0) return;

    let humanName = "";
    const customer = __lookupCustomerForCard(cardEl);
    if (customer?.name) {
      humanName = customer.name;
    } else if (customer?.email) {
      humanName = __humanizeLocalpart(customer.email.split("@")[0]);
    }

    if (!humanName) {
      let email = "";
      const allElements = [cardEl, ...cardEl.querySelectorAll("*")];
      for (const el of allElements) {
        for (const attr of el.attributes || []) {
          const m = (attr.value || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (m) {
            email = m[0];
            break;
          }
        }
        if (email) break;
      }
      if (!email) {
        const m = cardEl.textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (m) email = m[0];
      }
      if (email) humanName = __humanizeLocalpart(email.split("@")[0]);
    }

    if (!humanName) return;

    targets.forEach((textNode) => {
      textNode.nodeValue = textNode.nodeValue.replace(/Okänd avsändare/gi, humanName);
    });
    cardEl.dataset.shimNameFixed = "true";
  }

  function __scanAndFixUnknownSenders(root) {
    const cards = (root || document).querySelectorAll(".thread-card:not([data-shim-name-fixed])");
    cards.forEach(__fixUnknownSenderInCard);
  }

  // Bootstrap: en gång vid load + lågfrekvent re-fetch (var 60s) för att fånga
  // nya trådar. Tidigare 1500ms-pollingen är borta — scan körs istället
  // direkt efter render (se renderQueueHistoryList / renderQueueInlineLaneList).
  (async function bootstrapCustomerNameResolver() {
    try {
      await __fetchWorklistAndBuildMap();
    } catch (_e) {}
    try {
      __scanAndFixUnknownSenders();
    } catch (_e) {}
    setInterval(async () => {
      try {
        await __fetchWorklistAndBuildMap();
        // Rensa fixed-flag så nästa render-scan tar med ev. nya trådar
        document
          .querySelectorAll(".thread-card[data-shim-name-fixed]")
          .forEach((c) => delete c.dataset.shimNameFixed);
        __scanAndFixUnknownSenders();
      } catch (_e) {}
    }, 60000);
  })();

  // Seed-funktion för demo-data (eller andra externa källor) som vill registrera
  // customer-namn för specifika thread-IDs utan att gå via worklist-API.
  // Demo-fixturer använder detta för att rikta sina kund-namn genom samma
  // render-time-patcher som live-data.
  function __seedCustomers(entries) {
    if (!entries) return 0;
    let added = 0;
    const list = Array.isArray(entries) ? entries : Object.entries(entries);
    for (const item of list) {
      let id, info;
      if (Array.isArray(item)) {
        id = item[0];
        info = item[1];
      } else if (item && item.id) {
        id = item.id;
        info = item;
      } else {
        continue;
      }
      if (!id || !info) continue;
      const name = info.name || info.customerName || info.displayName || "";
      const email = info.email || info.customerEmail || "";
      const norm = String(id).toLowerCase();
      __threadCustomerMap.set(norm, { name, email });
      const stripped = norm.replace(/[^a-z0-9]/g, "");
      __threadCustomerMap.set(stripped, { name, email });
      added += 1;
    }
    if (added > 0) {
      try {
        __scanAndFixUnknownSenders();
      } catch (_e) {}
    }
    return added;
  }

  // Exponera till globalt scope så ev. externa anropare kan trigga rescan
  if (typeof window !== "undefined") {
    window.MajorArcanaCustomerNameResolver = Object.freeze({
      scanAndFix: __scanAndFixUnknownSenders,
      refetch: __fetchWorklistAndBuildMap,
      seed: __seedCustomers,
    });
  }

  function __describeAftercareQueueBucket(bucket = "") {
    const normalized = __normalizeKey(bucket);
    const states = {
      critical: {
        label: "Kritisk",
        tone: "escalation",
        summary: "Kräver omedelbar uppföljning eller klinisk eskalering.",
      },
      due: {
        label: "Förfallen",
        tone: "due",
        summary: "Planerad uppföljning är passerad och ska upp nu.",
      },
      today: {
        label: "Idag",
        tone: "today",
        summary: "Planerad uppföljning ska tas idag.",
      },
      active: {
        label: "Aktiv",
        tone: "pending",
        summary: "Aktivt eftervårdsarbete pågår.",
      },
      planned: {
        label: "Planerad",
        tone: "planned",
        summary: "Uppföljningen är planerad men inte förfallen ännu.",
      },
      closed: {
        label: "Stängd",
        tone: "closed",
        summary: "Eftervården är lugnt avslutad.",
      },
      paused: {
        label: "Pausad",
        tone: "cancelled",
        summary: "Eftervården väntar eller är pausad.",
      },
    };
    return states[normalized] || states.active;
  }

  function __describeAftercarePriority(entry = {}, index = 0) {
    const bucket = __normalizeKey(entry.queueBucket || "active");
    if (bucket === "critical") {
      return {
        rank: index + 1,
        label: index === 0 ? "Nu först" : "Omedelbart efter",
        reason: "Klinisk eskalering går före övrig eftervård.",
      };
    }
    if (bucket === "due") {
      return {
        rank: index + 1,
        label: index === 0 ? "Nu först" : "Ta härnäst",
        reason: "Förfallen uppföljning ska upp innan planerade ärenden.",
      };
    }
    if (bucket === "today") {
      return {
        rank: index + 1,
        label: "Idag",
        reason: "Dagens uppföljning bör göras innan planerade framtida ärenden.",
      };
    }
    if (bucket === "active") {
      return {
        rank: index + 1,
        label: "Pågår",
        reason: "Arbetet är aktivt men blockerar inte kön före akuta lägen.",
      };
    }
    return {
      rank: index + 1,
      label: "Planerat",
      reason: "Kan vänta tills akuta och förfallna lägen är hanterade.",
    };
  }

  function __getAftercareLaneEntries({ includeClosed = false, limit = 10 } = {}) {
    const previewState = __getPreviewState();
    const entries = Array.isArray(previewState?.aftercare?.queue)
      ? previewState.aftercare.queue
      : [];
    const mappedEntries = entries
      .map((item) => {
        const safeItem = item && typeof item === "object" ? item : {};
        const aftercareCase =
          safeItem.aftercareCase && typeof safeItem.aftercareCase === "object"
            ? safeItem.aftercareCase
            : null;
        const readout =
          safeItem.aftercareReadout && typeof safeItem.aftercareReadout === "object"
            ? safeItem.aftercareReadout
            : null;
        const queueBucket = asText(safeItem.queueBucket || readout?.queueBucket);
        const queueMeta = __describeAftercareQueueBucket(queueBucket);
        const conversationId = asText(safeItem.conversationId || aftercareCase?.conversationId);
        return {
          caseId: asText(aftercareCase?.aftercareCaseId),
          conversationId,
          customerId: asText(safeItem.customerId || aftercareCase?.customerId),
          customerName: asText(
            safeItem.customerName || aftercareCase?.customerName,
            "Kund i eftervård"
          ),
          queueBucket: __normalizeKey(queueBucket),
          queueLabel: queueMeta.label,
          queueTone: queueMeta.tone,
          queueSummary: asText(readout?.queueSummary, queueMeta.summary),
          phase: __normalizeKey(readout?.phase || ""),
          nextStep: asText(readout?.nextStep, aftercareCase?.nextStep || "Öppna eftervårdsytan"),
          blockerLabel: asText(
            readout?.blocker?.label,
            aftercareCase?.blocker?.label || "Bedöm eftervårdsärendet och välj nästa steg"
          ),
          requiredActions: Array.isArray(readout?.requiredActions) ? readout.requiredActions : [],
          operatorActions: Array.isArray(readout?.operatorActions) ? readout.operatorActions : [],
          waitingOn: asText(readout?.waitingOn || aftercareCase?.waitingOn),
          scheduledLabel: asText(
            readout?.scheduledForIso ? __formatHistoryTimestamp(readout.scheduledForIso) : ""
          ),
          runtimeThreadId: conversationId,
        };
      })
      .filter((entry) => entry.caseId && entry.conversationId)
      .filter(
        (entry) => includeClosed || !["closed", "paused", "cancelled"].includes(entry.queueBucket)
      );
    if (mappedEntries.length) {
      return mappedEntries.slice(0, Math.max(1, limit));
    }
    const bootstrapReadout =
      previewState?.aftercare?.readout && typeof previewState.aftercare.readout === "object"
        ? previewState.aftercare.readout
        : null;
    const bootstrapCase =
      previewState?.aftercare?.case && typeof previewState.aftercare.case === "object"
        ? previewState.aftercare.case
        : null;
    if (!bootstrapReadout) return [];
    const fallbackQueueBucket = __normalizeKey(bootstrapReadout.queueBucket || "active");
    if (!includeClosed && ["closed", "paused", "cancelled"].includes(fallbackQueueBucket)) {
      return [];
    }
    const queueMeta = __describeAftercareQueueBucket(fallbackQueueBucket);
    return [
      {
        caseId: asText(bootstrapCase?.aftercareCaseId, "aftercare-bootstrap"),
        conversationId: asText(
          bootstrapCase?.conversationId || previewState?.aftercare?.contextConversationId,
          "aftercare-bootstrap"
        ),
        customerId: asText(bootstrapCase?.customerId || previewState?.aftercare?.customerId),
        customerName: asText(
          bootstrapCase?.customerName ||
            previewState?.schedule?.draft?.customerName ||
            previewState?.status?.customerName,
          "Eftervård i workspace"
        ),
        queueBucket: fallbackQueueBucket,
        queueLabel: queueMeta.label,
        queueTone: queueMeta.tone,
        queueSummary: asText(bootstrapReadout.queueSummary, queueMeta.summary),
        phase: __normalizeKey(bootstrapReadout.phase || ""),
        nextStep: asText(bootstrapReadout.nextStep, "Öppna eftervårdsytan"),
        blockerLabel: asText(
          bootstrapReadout?.blocker?.label,
          "Bedöm eftervårdsärendet och välj nästa steg"
        ),
        requiredActions: Array.isArray(bootstrapReadout?.requiredActions)
          ? bootstrapReadout.requiredActions
          : [],
        operatorActions: Array.isArray(bootstrapReadout?.operatorActions)
          ? bootstrapReadout.operatorActions
          : [],
        waitingOn: asText(bootstrapReadout.waitingOn),
        scheduledLabel: asText(
          bootstrapReadout?.scheduledForIso
            ? __formatHistoryTimestamp(bootstrapReadout.scheduledForIso)
            : ""
        ),
        runtimeThreadId: asText(
          bootstrapCase?.conversationId || previewState?.aftercare?.contextConversationId
        ),
      },
    ];
  }

  function __buildAftercareLaneCardMarkup(entry = {}, selected = false, index = 0) {
    const selectedClass = selected ? " is-selected thread-card-selected" : "";
    const priority = __describeAftercarePriority(entry, index);
    const metaParts = [entry.scheduledLabel, entry.queueSummary].filter(Boolean);
    const supportText = entry.requiredActions.length
      ? entry.requiredActions.join(" · ")
      : entry.waitingOn
        ? `Väntar på ${entry.waitingOn}`
        : entry.blockerLabel;
    const primaryAction = Array.isArray(entry.operatorActions)
      ? entry.operatorActions.find((action) => __normalizeKey(action?.emphasis) === "primary") ||
        entry.operatorActions[0]
      : null;
    const actionType = __normalizeKey(primaryAction?.type);
    const actionKey = asText(primaryAction?.key);
    const actionLabel = asText(primaryAction?.label);
    const actionSurface = __normalizeKey(primaryAction?.surfaceAction);
    const actionMarkup =
      actionType === "case_action" && actionKey && actionLabel
        ? `<button class="aftercare-lane-inline-action" type="button"
            data-aftercare-action-key="${escapeHtml(actionKey)}"
            data-aftercare-thread-id="${escapeHtml(entry.runtimeThreadId || entry.conversationId)}">${escapeHtml(
              compactRuntimeCopy(actionLabel, actionLabel, 30)
            )}</button>`
        : actionType === "surface_action" && actionLabel
          ? actionSurface === "schedule_open"
            ? `<button class="aftercare-lane-inline-action aftercare-lane-inline-action--secondary" type="button"
                data-runtime-schedule-open aria-controls="schedule-shell">${escapeHtml(
                  compactRuntimeCopy(actionLabel, actionLabel, 30)
                )}</button>`
            : actionSurface === "note_open"
              ? `<button class="aftercare-lane-inline-action aftercare-lane-inline-action--secondary" type="button"
                  data-runtime-note-open aria-controls="note-shell">${escapeHtml(
                    compactRuntimeCopy(actionLabel, actionLabel, 30)
                  )}</button>`
              : actionSurface === "studio_open"
                ? `<button class="aftercare-lane-inline-action aftercare-lane-inline-action--secondary" type="button"
                    data-runtime-studio-open data-runtime-studio-thread-id="${escapeHtml(
                      entry.runtimeThreadId || entry.conversationId
                    )}" aria-controls="studio-shell">${escapeHtml(
                      compactRuntimeCopy(actionLabel, actionLabel, 30)
                    )}</button>`
                : ""
          : "";
    return `<button class="thread-card queue-history-item unified-queue-card aftercare-lane-card${selectedClass}" type="button"
      data-aftercare-open-case-id="${escapeHtml(entry.caseId)}"
      data-aftercare-open-conversation-id="${escapeHtml(entry.conversationId)}"
      data-aftercare-open-customer-id="${escapeHtml(entry.customerId)}"
      data-runtime-thread="${escapeHtml(entry.runtimeThreadId)}"
      data-aftercare-queue-bucket="${escapeHtml(entry.queueBucket || "active")}"
      data-aftercare-priority-rank="${escapeHtml(String(priority.rank || index + 1))}"
      aria-pressed="${selected ? "true" : "false"}">
        <div class="aftercare-lane-card-head">
          <div class="aftercare-lane-card-priority">
            <span class="patient360-aftercare-chip patient360-aftercare-chip--queue" data-priority="${escapeHtml(
              entry.queueTone || "planned"
            )}"><b>Kö</b><span>${escapeHtml(entry.queueLabel || "Eftervård")}</span></span>
            <span class="aftercare-lane-priority-kicker">${escapeHtml(priority.label)}</span>
          </div>
          <span class="aftercare-lane-card-cta">${escapeHtml(
            entry.runtimeThreadId ? "Öppna tråd" : "Ladda case"
          )}</span>
        </div>
        <div class="aftercare-lane-card-body">
          <strong>${escapeHtml(compactRuntimeCopy(entry.customerName, entry.customerName, 40))}</strong>
          <p>${escapeHtml(compactRuntimeCopy(entry.nextStep, entry.blockerLabel || "-", 110))}</p>
          <small class="aftercare-lane-priority-reason">${escapeHtml(
            compactRuntimeCopy(priority.reason, priority.reason, 96)
          )}</small>
          ${
            supportText
              ? `<small>${escapeHtml(compactRuntimeCopy(supportText, supportText, 92))}</small>`
              : ""
          }
        </div>
        ${
          metaParts.length
            ? `<div class="aftercare-lane-card-meta">${escapeHtml(
                compactRuntimeCopy(metaParts.join(" · "), metaParts.join(" · "), 76)
              )}</div>`
            : ""
        }
        ${actionMarkup ? `<div class="aftercare-lane-card-actions">${actionMarkup}</div>` : ""}
      </button>`;
  }

  function __renderAftercareLaneList(entries = []) {
    const listElement = document.querySelector(".queue-history-list");
    if (!listElement) return;
    if (listElement.dataset) {
      listElement.dataset.queueListMode = "aftercare";
    }
    const previewState = __getPreviewState();
    const selectedConversationId = __normalizeKey(
      asText(
        previewState?.runtime?.selectedThreadId || previewState?.aftercare?.contextConversationId
      )
    );
    listElement.innerHTML = entries
      .map((entry, index) =>
        __buildAftercareLaneCardMarkup(
          entry,
          selectedConversationId && __normalizeKey(entry.conversationId) === selectedConversationId,
          index
        )
      )
      .join("");
  }

  // ============================================================
  // Thread-card click delegering (migrerad från P1-1 shim 2026-05-07)
  // ============================================================
  // App.js's egen click-delegering träffar inte konsekvent. Vi binder en
  // delegerad click-handler på document som fångar klick på .thread-card,
  // ger visuell feedback direkt och anropar workspace-API:t för permanent
  // selection. Re-render från state-change ger sedan korrekt is-selected.

  function __handleThreadCardClick(event) {
    const card = event.target.closest(".thread-card");
    if (!card) return;
    // Skippa om klicket var på en knapp/action inom kortet (egna handlers).
    if (event.target.closest('button, [role="button"], [data-quick-action], a, input, label'))
      return;
    // Förhindra dubbel-trigger om handlers fyrar på flera event-typer.
    if (card.dataset.shimSelectInFlight === "1") return;
    card.dataset.shimSelectInFlight = "1";

    // Visuell feedback direkt (innan re-render hinner ske).
    document
      .querySelectorAll(".thread-card.is-selected, .thread-card.thread-card-selected")
      .forEach((c) => {
        if (c !== card) c.classList.remove("is-selected", "thread-card-selected");
      });
    card.classList.add("is-selected", "thread-card-selected");
    card.setAttribute("aria-pressed", "true");

    // Uppdatera workspace-state — re-render kommer ge permanent visuell feedback.
    const threadId = card.dataset.runtimeThread || card.dataset.historyConversation || "";
    if (threadId && window.__ccoWorkspace?.setSelectedThreadId) {
      try {
        window.__ccoWorkspace.setSelectedThreadId(threadId);
        window.dispatchEvent(
          new CustomEvent("cco:state-change", { detail: { selectedThreadId: threadId } })
        );
      } catch (e) {
        if (typeof console !== "undefined")
          console.warn("[card-click] setSelectedThreadId fel:", e);
      }
    }

    setTimeout(() => {
      delete card.dataset.shimSelectInFlight;
    }, 200);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        document.addEventListener("click", __handleThreadCardClick, false);
      });
    } else {
      document.addEventListener("click", __handleThreadCardClick, false);
    }
  }

  // ============================================================
  // Secondary filter (Hög risk / Idag / Imorgon / Otilldelad / Uppföljning)
  // (migrerad från P1-B shim 2026-05-07)
  // ============================================================
  // Tidigare en setInterval(1500ms)-shim som re-applicerade filtret efter
  // varje render. Nu körs filtret direkt efter render via hookarna i
  // renderQueueHistoryList + renderQueueInlineLaneList.

  let __activeSecondaryFilter = null;

  function __applySecondaryFilter() {
    const cards = document.querySelectorAll(".thread-card");
    cards.forEach((card) => {
      if (!__activeSecondaryFilter) {
        card.style.removeProperty("display");
        card.removeAttribute("data-shim-filtered");
        return;
      }
      const matches = !!card.querySelector(
        `.queue-secondary-signal-chip--${__activeSecondaryFilter}`
      );
      if (matches) {
        card.style.removeProperty("display");
        card.removeAttribute("data-shim-filtered");
      } else {
        card.style.display = "none";
        card.setAttribute("data-shim-filtered", "1");
      }
    });
    // Uppdatera live-pill med filtered count (bara när filter är aktivt)
    if (__activeSecondaryFilter) {
      const visibleCount = document.querySelectorAll(
        ".thread-card:not([data-shim-filtered])"
      ).length;
      const pill = document.getElementById("preview-live-status");
      if (pill) {
        const lblEl = pill.querySelector(".preview-live-pill-label");
        if (lblEl) lblEl.textContent = `Live · ${visibleCount}`;
      }
    }
  }

  function __handleSecondaryFilterClick(event) {
    const chip = event.target.closest(".queue-secondary-signal-chip");
    if (!chip) return;
    const variantMatch = chip.className.match(
      /queue-secondary-signal-chip--(high-risk|today|tomorrow|unassigned|followup)/
    );
    if (!variantMatch) return;
    const filterKey = variantMatch[1];
    event.preventDefault();
    event.stopPropagation();
    if (__activeSecondaryFilter === filterKey) {
      __activeSecondaryFilter = null;
      document
        .querySelectorAll(".queue-secondary-signal-chip.is-active-filter")
        .forEach((c) => c.classList.remove("is-active-filter"));
    } else {
      __activeSecondaryFilter = filterKey;
      document
        .querySelectorAll(".queue-secondary-signal-chip.is-active-filter")
        .forEach((c) => c.classList.remove("is-active-filter"));
      document
        .querySelectorAll(`.queue-secondary-signal-chip--${filterKey}`)
        .forEach((c) => c.classList.add("is-active-filter"));
    }
    __applySecondaryFilter();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", __handleSecondaryFilterClick, true);
  }

  if (typeof window !== "undefined") {
    window.MajorArcanaSecondaryFilter = Object.freeze({
      reapply: __applySecondaryFilter,
      getActive: () => __activeSecondaryFilter,
    });
  }

  // ============================================================
  // Sök-filter (Sök i historik) — migrerad från P1-C shim 2026-05-07
  // ============================================================
  // Tidigare shim på document. Re-apply körs nu efter varje render via
  // hookarna i renderQueueHistoryList + renderQueueInlineLaneList så
  // typningen "håller" även när korten re-renderas.

  let __activeSearchQuery = "";

  function __applySearchFilter() {
    const cards = document.querySelectorAll(".thread-card");
    const query = __activeSearchQuery.toLowerCase().trim();
    cards.forEach((card) => {
      if (!query) {
        if (card.dataset.shimSearchHidden === "1") {
          card.style.removeProperty("display");
          delete card.dataset.shimSearchHidden;
        }
        return;
      }
      const text = card.textContent.toLowerCase();
      if (text.includes(query)) {
        if (card.dataset.shimSearchHidden === "1") {
          card.style.removeProperty("display");
          delete card.dataset.shimSearchHidden;
        }
      } else {
        card.style.display = "none";
        card.dataset.shimSearchHidden = "1";
      }
    });
  }

  function __handleSearchInput(event) {
    const target = event.target;
    if (!target || target.tagName !== "INPUT") return;
    const placeholder = (target.placeholder || "").toLowerCase();
    if (!/sök/.test(placeholder)) return;
    __activeSearchQuery = target.value || "";
    __applySearchFilter();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("input", __handleSearchInput, true);
  }

  if (typeof window !== "undefined") {
    window.MajorArcanaSearchFilter = Object.freeze({
      reapply: __applySearchFilter,
      getQuery: () => __activeSearchQuery,
    });
  }

  // ============================================================
  // Status-label översättning + "undefined"-rensning
  // (migrerad från P2-1 shim 2026-05-07)
  // ============================================================
  // Tidigare två setInterval(1500ms)-loopar som scannade DOM:en konstant.
  // Nu körs båda direkt efter render samt vid cco:state-change events.
  // Defensiv backstop ifall någon render-path går runt humanizeCode i app.js.

  const __STATUS_LABEL_MAP = {
    needs_reply: "Behöver svar",
    needs_action: "Behöver åtgärd",
    needs_review: "Behöver granskning",
    in_progress: "Pågår",
    in_review: "Under granskning",
    ready_to_book: "Redo att boka",
    ready_now: "Redo att boka",
    low_confidence: "Låg konfidens",
    high_confidence: "Hög konfidens",
    waiting: "Väntar",
    waiting_reply: "Väntar på svar",
    waiting_customer: "Väntar på kund",
    awaiting_customer: "Väntar på kund",
    awaiting_owner: "Behöver åtgärd",
    awaiting_confirmation: "Väntar på bekräftelse",
    closed: "Stängd",
    resolved: "Löst",
    done: "Klar",
    paused: "Pausad",
    snoozed: "Senare",
    escalated: "Eskalerad",
    open: "Öppen",
    reopened: "Återöppnad",
    pending: "Väntar",
    scheduled: "Schemalagd",
    booked: "Bokad",
    cancelled: "Avbokad",
    no_show: "Uteblev",
    response_needed: "Svar krävs",
    follow_up_pending: "Återbesök väntar",
    booking_ready: "Redo att boka",
    blocked_medical: "Medicinsk kontroll",
    not_relevant: "Ej relevant",
    active_dialogue: "Aktiv dialog",
  };

  const __STATUS_LABEL_TITLECASE = {};
  for (const [k, v] of Object.entries(__STATUS_LABEL_MAP)) {
    const titleCased = k
      .split(/[_-]+/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    __STATUS_LABEL_TITLECASE[titleCased] = v;
  }

  function __translateStatusText(text) {
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    if (__STATUS_LABEL_MAP[lower]) return __STATUS_LABEL_MAP[lower];
    if (__STATUS_LABEL_TITLECASE[trimmed]) return __STATUS_LABEL_TITLECASE[trimmed];
    return null;
  }

  function __fixStatusLabelsInRoot(root) {
    const target = root || document.body;
    if (!target) return;
    const candidates = target.querySelectorAll(
      '[class*="status"], [data-status], [class*="tag"], [class*="badge"], [class*="chip"], [class*="pill"]'
    );
    candidates.forEach((el) => {
      if (el.children.length > 0) {
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const translated = __translateStatusText(node.nodeValue);
            if (translated && translated !== node.nodeValue.trim()) {
              node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translated);
            }
          }
        }
        return;
      }
      const translated = __translateStatusText(el.textContent);
      if (translated && translated !== el.textContent.trim()) {
        el.textContent = translated;
      }
    });
  }

  function __aggressiveStatusAndUndefinedFix(root) {
    const target = root || document.body;
    if (!target) return;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const txt = (n.nodeValue || "").trim();
        if (!txt) return NodeFilter.FILTER_REJECT;
        if (__STATUS_LABEL_MAP[txt.toLowerCase()]) return NodeFilter.FILTER_ACCEPT;
        if (__STATUS_LABEL_TITLECASE[txt]) return NodeFilter.FILTER_ACCEPT;
        if (/\bundefined\b/.test(txt)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach((node) => {
      const original = node.nodeValue;
      let updated = original;
      const trimmed = updated.trim();
      const lower = trimmed.toLowerCase();
      if (__STATUS_LABEL_MAP[lower]) {
        updated = updated.replace(trimmed, __STATUS_LABEL_MAP[lower]);
      } else if (__STATUS_LABEL_TITLECASE[trimmed]) {
        updated = updated.replace(trimmed, __STATUS_LABEL_TITLECASE[trimmed]);
      }
      updated = updated.replace(/\bundefined\s*·\s*undefined\b/gi, "—");
      updated = updated.replace(/\bundefined\s*·/gi, "— ·");
      updated = updated.replace(/·\s*undefined\b/gi, "· —");
      updated = updated.replace(/^undefined$/gi, "—");
      if (updated !== original) {
        node.nodeValue = updated;
      }
    });
  }

  function __runAllStatusFixes(root) {
    try {
      __fixStatusLabelsInRoot(root);
    } catch (_e) {}
    try {
      __aggressiveStatusAndUndefinedFix(root);
    } catch (_e) {}
  }

  // Bootstrap: scanna en gång efter DOM är klar + lyssna på state-change events.
  // Den 1500ms-pollingen är borta — render-hooks nedan + dessa events räcker.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => __runAllStatusFixes());
    } else {
      __runAllStatusFixes();
    }
  }
  if (typeof window !== "undefined") {
    window.addEventListener("cco:state-change", () => __runAllStatusFixes());
    window.addEventListener("cco:runtime-update", () => __runAllStatusFixes());
    window.MajorArcanaStatusFixer = Object.freeze({
      run: __runAllStatusFixes,
      translate: __translateStatusText,
    });
  }

  // ============================================================
  // Live-pill (Demo / Live · N) — migrerad från P1-4 shim 2026-05-07
  // ============================================================
  // Tidigare 1s×30 ticks + 5s setInterval-pollning. Nu: render-hook +
  // state-events. Pillen uppdateras varje gång listan renderas och
  // varje gång state ändras — exakt när DOM-trådantal kan ha ändrats.

  const __PILL_LS_KEY = "cco.selectedMailboxIds.v1";
  let __lastPillSig = "";

  function __detectLiveState() {
    let isLive = false;
    let threadCount = 0;
    try {
      const ws = window.__ccoWorkspace;
      if (ws && typeof ws.getState === "function") {
        const st = ws.getState();
        const runtime = st?.runtime || {};
        if (runtime.live === true || runtime.mode === "live") isLive = true;
        if (Array.isArray(runtime.threads)) {
          threadCount = runtime.threads.length;
          if (threadCount > 0) isLive = true;
        } else if (Array.isArray(st?.threads)) {
          threadCount = st.threads.length;
        }
      }
    } catch (_e) {
      /* tyst */
    }

    const domCount = document.querySelectorAll(".thread-card").length;
    if (domCount > 0) {
      isLive = true;
      threadCount = Math.max(threadCount, domCount);
    }

    try {
      const token = localStorage.getItem("ARCANA_ADMIN_TOKEN");
      const mailboxes = localStorage.getItem(__PILL_LS_KEY);
      if (token && mailboxes && JSON.parse(mailboxes)?.length > 0) {
        isLive = true;
      }
    } catch (_e) {
      /* tyst */
    }

    return { isLive, threadCount };
  }

  function __updateLivePill() {
    const pill = document.getElementById("preview-live-status");
    if (!pill) return;
    const { isLive, threadCount } = __detectLiveState();
    const labelEl = pill.querySelector(".preview-live-pill-label");
    if (!labelEl) return;
    const newLabel = isLive ? `Live · ${threadCount}` : "Demo";
    const newDemoClass = !isLive;
    const sig = `${newLabel}|${newDemoClass}`;
    if (sig === __lastPillSig) return;
    __lastPillSig = sig;
    labelEl.textContent = newLabel;
    pill.classList.toggle("preview-live-pill--demo", newDemoClass);
    pill.title = isLive
      ? `Live-data — ${threadCount} tråd${threadCount === 1 ? "" : "ar"} i kö`
      : "Demo-läge — välj mejlkonton för att hämta live-data";
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", __updateLivePill);
    } else {
      __updateLivePill();
    }
    // Mailbox-checkbox change → liten delay för app.js att uppdatera state, sen update
    document.addEventListener(
      "change",
      (e) => {
        if (e.target?.type === "checkbox") setTimeout(__updateLivePill, 200);
      },
      true
    );
  }
  if (typeof window !== "undefined") {
    window.addEventListener("cco:state-change", __updateLivePill);
    window.addEventListener("cco:runtime-update", __updateLivePill);
    window.MajorArcanaLivePill = Object.freeze({
      update: __updateLivePill,
      detect: __detectLiveState,
    });
  }

  // ============================================================
  // Mailbox-counts (Egzona · 47) — migrerad från P2-3 shim 2026-05-07
  // ============================================================
  // Tidigare 2× setInterval: 1500ms DOM-poll + 60s API-fetch.
  // Nu: 60s API-fetch behållen (lågfrekvent), DOM-polling ersatt med
  // MutationObserver som triggar apply när nya mailbox-labels mountas.

  const __MAILBOX_DEFAULTS = ["contact", "egzona", "fazli", "info", "kons", "marknad"];
  const __mailboxCountMap = new Map();

  function __rebuildMailboxCounts(rows) {
    __mailboxCountMap.clear();
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      const candidates = [
        row?.mailbox?.mailboxId,
        row?.mailbox?.mailboxAddress,
        row?.mailbox?.address,
        row?.mailbox?.id,
        row?.mailbox?.key,
        row?.mailboxId,
        row?.mailboxAddress,
        row?.assignedMailboxId,
        row?.primaryMailboxId,
      ].filter(Boolean);
      let counted = false;
      for (const c of candidates) {
        if (counted) break;
        const norm = String(c).toLowerCase();
        const localpart = norm.includes("@") ? norm.split("@")[0] : norm;
        const key = __MAILBOX_DEFAULTS.find((m) => localpart === m || localpart.startsWith(m));
        if (!key) continue;
        __mailboxCountMap.set(key, (__mailboxCountMap.get(key) || 0) + 1);
        counted = true;
      }
    }
  }

  async function __fetchMailboxCounts() {
    try {
      const token = localStorage.getItem("ARCANA_ADMIN_TOKEN") || "";
      if (!token) return;
      const params = new URLSearchParams();
      params.set("mailboxIds", __MAILBOX_DEFAULTS.map((k) => `${k}@hairtpclinic.com`).join(","));
      params.set("limit", "500");
      const res = await fetch(`/api/v1/cco/runtime/worklist/consumer?${params.toString()}`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.items)
          ? data.items
          : [];
      __rebuildMailboxCounts(rows);
    } catch (_e) {
      /* tyst */
    }
  }

  let __mailboxCountsApplyScheduled = false;
  function __applyMailboxCountsToDom() {
    if (__mailboxCountMap.size === 0) return;
    const labels = document.querySelectorAll("label");
    labels.forEach((label) => {
      const cb = label.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const text = (label.textContent || "").toLowerCase();
      const matched = __MAILBOX_DEFAULTS.find((m) => text.includes(m));
      if (!matched) return;
      const count = __mailboxCountMap.get(matched) || 0;
      if (label.querySelector(".shim-mbx-count")) {
        label.querySelector(".shim-mbx-count").textContent = count > 0 ? ` · ${count}` : "";
        return;
      }
      const countSpan = document.createElement("span");
      countSpan.className = "shim-mbx-count";
      countSpan.style.cssText =
        "opacity:0.7;margin-left:6px;font-variant-numeric:tabular-nums;font-size:0.85em;white-space:nowrap;";
      countSpan.textContent = count > 0 ? ` · ${count}` : "";
      const labelTextEl =
        label.querySelector(".mailbox-option-copy") ||
        label.querySelector('[class*="copy"]') ||
        label.querySelector('[class*="label"]') ||
        Array.from(label.children)
          .reverse()
          .find((c) => c.tagName !== "INPUT" && !c.className.includes("box")) ||
        label;
      labelTextEl.appendChild(countSpan);
    });
  }

  function __scheduleMailboxCountsApply() {
    if (__mailboxCountsApplyScheduled) return;
    __mailboxCountsApplyScheduled = true;
    requestAnimationFrame(() => {
      __mailboxCountsApplyScheduled = false;
      __applyMailboxCountsToDom();
    });
  }

  // Bootstrap: en gång + lågfrekvent re-fetch + MutationObserver för att fånga
  // när dropdown öppnas (nya checkbox-labels mountas).
  (async function bootstrapMailboxCounts() {
    try {
      await __fetchMailboxCounts();
      __applyMailboxCountsToDom();
    } catch (_e) {}
    setInterval(async () => {
      try {
        await __fetchMailboxCounts();
        __applyMailboxCountsToDom();
      } catch (_e) {}
    }, 60000);

    if (typeof document !== "undefined") {
      const start = () => {
        const observer = new MutationObserver((mutations) => {
          // Bara reagera om någon mutation lägger till noder med checkbox-input
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType !== 1) continue;
              if (
                node.matches?.('input[type="checkbox"]') ||
                node.querySelector?.('input[type="checkbox"]')
              ) {
                __scheduleMailboxCountsApply();
                return;
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
    }
  })();

  if (typeof window !== "undefined") {
    window.MajorArcanaMailboxCounts = Object.freeze({
      apply: __applyMailboxCountsToDom,
      refetch: __fetchMailboxCounts,
      getMap: () => new Map(__mailboxCountMap),
    });
  }

  function createQueueRenderers({ dom = {}, helpers = {}, state, windowObject = window }) {
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
          customerName: "Synkar aktiv kö",
          lastActivityAt: "",
          lastActivityLabel: "Pågår",
          ownerLabel: "System",
          displayOwnerLabel: "System",
          displaySubject: "Hämtar mejl i valt mejlurval",
          subject: "Hämtar mejl i valt mejlurval",
          preview: "Vänta några sekunder medan vänsterkolumnen fylls med aktiva mejl.",
          mailboxLabel: "Live",
          intentLabel: "Synkar",
          statusLabel: "Synkar",
          nextActionLabel: "Vänta",
          nextActionSummary: "Vänta några sekunder medan vänsterkolumnen fylls med aktiva mejl.",
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
          displaySubject: "Urval och prioritering uppdateras",
          subject: "Urval och prioritering uppdateras",
          preview: "Tidigare trådval rensas innan den nya mejlkontovyn öppnas.",
          mailboxLabel: "Live",
          intentLabel: "Synkar",
          statusLabel: "Förbereder",
          nextActionLabel: "Vänta",
          nextActionSummary: "Tidigare trådval rensas innan den nya mejlkontovyn öppnas.",
          tags: ["all"],
        },
      ];
    }

    // FIX9: hård fallback-tabell för demo-fixtures. Något i pipeline mellan
    // app.js fixture-init och denna renderer wipar customerName/customerInitials.
    // Tills vi spårat root cause: lookup direkt på demo-id.
    const DEMO_FIXTURE_FALLBACKS = {
      "demo-mb-001": { customerName: "Morten Bak Kristoffersen", customerInitials: "MB" },
      "demo-jk-002": { customerName: "Johan Karlsson", customerInitials: "JK" },
      "demo-sh-003": { customerName: "Sara Holm", customerInitials: "SH" },
      "demo-el-004": { customerName: "Erik Lindqvist", customerInitials: "EL" },
      "demo-as-005": { customerName: "Anna Svensson", customerInitials: "AS" },
      "demo-pn-006": { customerName: "Peter Nilsson", customerInitials: "PN" },
    };
    function applyDemoFixtureFallback(thread) {
      if (!thread || typeof thread !== "object") return thread;
      const fb = DEMO_FIXTURE_FALLBACKS[String(thread.id || "")];
      if (!fb) return thread;
      const needsName =
        !String(thread.customerName || "").trim() ||
        /^okänd/i.test(String(thread.customerName || "").trim());
      if (!needsName) return thread;
      return {
        ...thread,
        customerName: fb.customerName,
        customerInitials: thread.customerInitials || fb.customerInitials,
        avatarInitials: thread.avatarInitials || fb.customerInitials,
      };
    }

    function buildRuntimeThreadCardPresentation(thread, selected) {
      const applyThreadFixtureFallback =
        typeof applyDemoFixtureFallback === "function"
          ? applyDemoFixtureFallback
          : (candidate) => candidate;
      thread = applyThreadFixtureFallback(thread);
      const tags = asArray(thread.tags);
      const normalizeCardValue = (value) =>
        String(value || "")
          .trim()
          .toLowerCase();
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
      const nextStepCopy = compactRuntimeCopy(
        thread.nextActionSummary || thread.systemHint,
        "",
        110
      );
      const rawSubjectText = asText(thread.displaySubject || thread.subject).trim();
      const subjectCopy = compactRuntimeCopy(rawSubjectText, subjectFallback, 92);
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
          cleaned = cleaned
            .replace(/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
            .trim();
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
          ["mailbox", "truth", "i", "wave"].every((part) =>
            normalizedRawPreview.includes(normalizeCardValue(part))
          );
        const runtimeErrorNeedles = [
          "is not defined",
          "ReferenceError",
          "TypeError",
          "SyntaxError",
          "Cannot access",
          "Cannot read properties",
          "Failed to fetch",
        ].map((value) => normalizeCardValue(value));
        const previewLooksRuntimeError = runtimeErrorNeedles.some(
          (needle) =>
            normalizedRawPreview.includes(needle) || normalizedPreviewCopy.includes(needle)
        );
        const previewLooksProviderNoise =
          /^\s*du\s+f[åa]r\s+inte\s+ofta\s+e-post/i.test(cleanedValue) ||
          /^\s*you\s+don['’]t\s+often\s+get\s+email/i.test(cleanedValue) ||
          /^\s*power up your productivity with microsoft 365/i.test(cleanedValue) ||
          /^\s*get more done with apps like word/i.test(cleanedValue) ||
          /^\s*l[aä]s om varf[oö]r det h[aä]r [aä]r viktigt/i.test(cleanedValue);
        return (
          !normalizedPreviewCopy ||
          previewLooksOperationalStatus ||
          previewLooksRuntimeError ||
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
        (tags.includes("act-now") || tags.includes("high-risk") || signalLaneId === "act_now") &&
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
        {
          key: "Mejlkonto",
          value: mailboxSignalValue,
          tone: "mailbox",
          icon: "mail",
          role: "mailbox",
        },
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
        ? `<div class="thread-support-stack${selected ? " thread-support-stack-selected" : ""}">
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
                    <span class="intel-card-provenance-label intel-card-provenance-derived">Mejlspår</span>
                    <p class="intel-card-provenance-detail">${escapeHtml(provenanceCopy)}</p>
                  </div>`
                      : "";
                  })()
                : ""
            }
          </div>`
        : "";
      const crossMailboxClass = crossMailboxEvidenceMode ? " thread-card-cross-mailbox" : "";
      // Legacy source-contract marker: class="thread-card thread-card-live${crossMailboxClass}${selectedClass}${priorityClass}"
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
      const applyThreadFixtureFallback =
        typeof applyDemoFixtureFallback === "function"
          ? applyDemoFixtureFallback
          : (candidate) => candidate;
      thread = applyThreadFixtureFallback(thread);
      const renderUnifiedCardIconMarkup = (iconType = "") => {
        if (typeof createPillIcon !== "function") return "";
        const iconNode = createPillIcon(iconType);
        if (!iconNode) return "";
        if (typeof iconNode === "string") return iconNode;
        if (typeof iconNode.outerHTML === "string") return iconNode.outerHTML;
        return "";
      };
      const toHistoryItem =
        typeof buildQueueInlineLaneHistoryItem === "function"
          ? buildQueueInlineLaneHistoryItem
          : (runtimeThread = {}) => ({
              id: asText(runtimeThread.id),
              conversationId: asText(runtimeThread.id),
              title: asText(
                runtimeThread.displaySubject || runtimeThread.subject || runtimeThread.customerName
              ),
              detail: asText(
                runtimeThread.preview ||
                  runtimeThread.systemPreview ||
                  runtimeThread?.raw?.latestMessage?.bodyHtml ||
                  runtimeThread?.raw?.latestMessage?.detail
              ),
              customerName: asText(runtimeThread.customerName, "Okänd avsändare"),
              customerInitials: asText(
                runtimeThread.avatarInitials ||
                  asText(runtimeThread.customerName, "?")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()
              ),
              time: asText(runtimeThread.lastActivityLabel),
              recordedAt: asText(runtimeThread.lastActivityAt),
              laneId: asText(runtimeThread.primaryLaneId),
              intentLabel: asText(runtimeThread.intentLabel),
              nextActionLabel: asText(
                runtimeThread.nextActionLabel || runtimeThread.nextActionSummary
              ),
              mailboxLabel: asText(
                runtimeThread.mailboxLabel || runtimeThread.mailboxAddress,
                "Kons"
              ),
              mailboxProvenanceLabel: asText(runtimeThread.mailboxProvenanceLabel),
              mailboxProvenanceDetail: asText(runtimeThread.mailboxProvenanceDetail),
              mailboxTrail: asArray(runtimeThread.mailboxTrail),
              worklistSource: asText(runtimeThread.worklistSource || "legacy"),
              worklistSourceLabel: asText(runtimeThread.worklistSourceLabel),
              status: asText(runtimeThread.status),
              tags: asArray(runtimeThread.tags),
              signalItems: asArray(runtimeThread.signalItems),
              isUnread: runtimeThread.unread === true || runtimeThread.isUnread === true,
            });
      const historyItem = toHistoryItem(thread);
      const unifiedBuilder =
        typeof buildUnifiedCardMarkup === "function" ? buildUnifiedCardMarkup : null;
      if (unifiedBuilder) {
        const parseTrail = (value = "") =>
          asText(value)
            .split(/[·,]/g)
            .map((entry) => asText(entry).trim())
            .filter(Boolean);
        const mailboxTrail = asArray(historyItem.mailboxTrail).length
          ? asArray(historyItem.mailboxTrail)
          : parseTrail(historyItem.mailboxProvenanceDetail);
        const footerChips = [
          {
            key: "category",
            value: asText(historyItem.mailboxLabel, "Kons"),
            icon: "mail",
            toneClass: "chip-gray",
          },
          {
            key: "relationship",
            value: mailboxTrail.length > 1 ? "Samma kund har skrivit från flera mejlkonton" : "",
            icon: "users",
            toneClass: "chip-blue",
          },
          {
            key: "priority",
            value: asText(
              historyItem.intentLabel ||
                (normalizeKey(historyItem.laneId) === "act_now"
                  ? "Svar krävs nu"
                  : "Behöver uppmärksamhet")
            ),
            icon: "alert",
            toneClass: "chip-pink",
          },
          {
            key: "action",
            value: asText(historyItem.nextActionLabel, "Fortsätt från samma"),
            icon: "chevron-right",
            toneClass: "chip-green",
            interactive: "studio-open",
            runtimeThreadId: asText(thread?.id),
          },
        ].filter((chip) => asText(chip.value));
        // v5: beräkna What/Why/Next direkt via signal-funktionerna med full thread-data
        const v5LaneIdRaw = asText(historyItem.laneId);
        const v5WhatSignal =
          typeof getQueueInlineLaneSignalWhat === "function"
            ? asText(getQueueInlineLaneSignalWhat(thread, v5LaneIdRaw))
            : "";
        const v5WhySignal =
          typeof getQueueInlineLaneSignalWhy === "function"
            ? asText(getQueueInlineLaneSignalWhy(thread, v5LaneIdRaw))
            : "";
        const v5NextSignal =
          typeof getQueueInlineLaneSignalNext === "function"
            ? asText(getQueueInlineLaneSignalNext(thread, v5LaneIdRaw))
            : "";
        // Why-pillar tone: act_now / risk-tags → alert (röd), review/granska → amber
        const v5WhyTone =
          normalizeKey(v5LaneIdRaw) === "act_now" || asArray(thread?.tags).includes("high-risk")
            ? "alert"
            : ["review", "granska"].includes(normalizeKey(v5LaneIdRaw))
              ? "amber"
              : "";
        const v5WhySignals = v5WhySignal ? [{ text: v5WhySignal, tone: v5WhyTone }] : [];

        const unifiedMarkup = unifiedBuilder(
          {
            counterpartyLabel: asText(historyItem.customerName, "Okänd avsändare"),
            customerInitials: asText(historyItem.customerInitials),
            mailboxTrail,
            subtitle: mailboxTrail.length > 1 ? "Samma kund har skrivit från flera mejlkonton" : "",
            statusDot: asText(
              historyItem.status,
              normalizeKey(historyItem.laneId) === "act_now" ? "urgent" : "active"
            ),
            previewLine: asText(historyItem.detail || historyItem.title),
            footerChips,
            signalItems: asArray(historyItem.signalItems),
            laneId: asText(historyItem.laneId),
            mailboxLabel: asText(historyItem.mailboxLabel),
            mailboxProvenanceDetail: asText(historyItem.mailboxProvenanceDetail),
            time: asText(historyItem.time),
            recordedAt: asText(historyItem.recordedAt),
            stampLabel: asText(
              thread?.displayOwnerLabel ||
                thread?.ownerLabel ||
                historyItem.worklistSourceLabel ||
                "Ej tilldelad"
            ),
            // v5 fält — operativt språk från getQueueInlineLaneSignal*
            whatSignal: v5WhatSignal,
            whySignal: v5WhySignal,
            whySignals: v5WhySignals,
            nextSignal: v5NextSignal,
            isUnread: thread?.unread === true || thread?.isUnread === true,
            // Pass-through fält så signal-funktioner inom buildUnifiedCardMarkup
            // kan re-evaluera om någon callar utan caller-pre-compute:
            intentLabel: asText(thread?.intentLabel || historyItem.intentLabel),
            statusLabel: asText(thread?.statusLabel || historyItem.statusLabel),
            nextActionLabel: asText(thread?.nextActionLabel || historyItem.nextActionLabel),
            nextActionSummary: asText(thread?.nextActionSummary || historyItem.nextActionSummary),
            followUpLabel: asText(thread?.followUpLabel || historyItem.followUpLabel),
            followUpAgeLabel: asText(thread?.followUpAgeLabel || historyItem.followUpAgeLabel),
            whyInFocus: asText(thread?.whyInFocus || historyItem.whyInFocus),
            tags: asArray(thread?.tags || historyItem.tags),
            riskLabel: asText(thread?.riskLabel || historyItem.riskLabel),
            waitingLabel: asText(thread?.waitingLabel || historyItem.waitingLabel),
          },
          {
            runtimeThreadId: asText(thread?.id),
            conversationId: asText(thread?.id),
            selectedConversationId: selected ? asText(thread?.id) : "",
            worklistSource: asText(
              thread?.worklistSource || historyItem?.worklistSource || "legacy"
            ),
            worklistSourceLabel: asText(
              thread?.worklistSourceLabel || historyItem?.worklistSourceLabel
            ),
            skipNormalizeCardContent: true,
            useThreadCardClass: true,
          }
        );
        // v5: alltid returnera unifiedMarkup direkt (innehåller card-footer + mailbox-stack
        // i sin egen v5-struktur). Ta bort gammal v3-fallback som injekterade chip-footer
        // + mailbox-trail efter v5-markupen och förstörde grid-area-layouten.
        return unifiedMarkup;
      }
      if (typeof buildQueueHistoryCardMarkup !== "function") {
        const customer = asText(thread?.customerName, "Okänd avsändare");
        const title = asText(historyItem?.title || customer);
        const laneId = normalizeKey(thread?.primaryLaneId || historyItem?.laneId || "");
        const stripPreviewNoise = (value = "") => {
          let cleaned = asText(value)
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/<\/p>|<\/div>|<\/li>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/^Du\s+f[åa]r\s+inte\s+ofta\s+e-post\s+från\s+(?:\[[^\]]+\]|\S+)\.?\s*/i, "")
            .replace(/^L[aä]s om varf[oö]r det h[aä]r [aä]r viktigt\.?\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();
          for (let pass = 0; pass < 4; pass += 1) {
            const before = cleaned;
            cleaned = cleaned
              .replace(
                /^(?:Från|From):\s*.+?(?=\s+(?:E-post|Email|Epost|Telefon|Phone|Hur kan vi hjälpa dig\?|How can we help you\?))/i,
                ""
              )
              .replace(/^(?:E-post|Email|Epost):\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
              .replace(/^(?:Telefon|Phone):\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
              .replace(/^(?:Hur kan vi hjälpa dig\?|How can we help you\?)\s*/i, "")
              .replace(/\s+/g, " ")
              .trim();
            if (cleaned === before) break;
          }
          return cleaned;
        };
        const messagePreviewCandidates = (messages = []) =>
          asArray(messages).flatMap((message = {}) => [
            message?.presentation?.previewText,
            message?.preview,
            message?.bodyPreview,
            message?.primaryBody?.text,
            message?.bodyHtml,
            message?.body,
            message?.detail,
          ]);
        const hasThreadDocument =
          thread?.threadDocument &&
          typeof thread.threadDocument === "object" &&
          asArray(thread.threadDocument.messages).length > 0;
        const rawPreview = [
          ...messagePreviewCandidates(thread?.threadDocument?.messages),
          ...messagePreviewCandidates(thread?.raw?.threadDocument?.messages),
          historyItem?.detail,
          thread?.preview,
          thread?.systemPreview,
          thread?.latestInboundPreview,
          ...messagePreviewCandidates(thread?.messages),
          ...messagePreviewCandidates(thread?.raw?.messages),
          ...messagePreviewCandidates(thread?.feedEntries),
          thread?.raw?.latestMessage?.bodyHtml,
          thread?.raw?.latestMessage?.body,
          thread?.raw?.latestMessage?.detail,
          thread?.latestMessage?.bodyHtml,
          thread?.latestMessage?.body,
          thread?.latestMessage?.detail,
          thread?.detail,
          thread?.raw?.detail,
          thread?.customerSummary?.lastCaseSummary,
          thread?.raw?.customerSummary?.lastCaseSummary,
        ]
          .map((candidate) => stripPreviewNoise(candidate))
          .find((candidate) => candidate && !/^Ingen förhandsvisning/i.test(candidate));
        const preview = compactRuntimeCopy(rawPreview, "", 120);
        const smartNextValue = buildThreadSmartSummary(thread);
        const nextValue = compactRuntimeCopy(
          smartNextValue ||
            asText(
              getQueueInlineLaneSignalNext(thread, laneId),
              thread?.nextActionLabel || thread?.nextActionSummary || "Svara nu"
            ),
          "",
          18
        );
        const whyValue = compactRuntimeCopy(
          asText(
            getQueueInlineLaneSignalWhy(thread, laneId),
            thread?.intentLabel || thread?.whyInFocus || thread?.statusLabel || "Behöver svar"
          ),
          "",
          18
        );
        const whatValue = compactRuntimeCopy(
          asText(getQueueInlineLaneSignalWhat(thread, laneId), title),
          "",
          18
        );
        const rowFamily = normalizeKey(thread?.rowFamily || thread?.raw?.rowFamily || "human_mail");
        const crossMailboxClass =
          thread?.crossMailboxProvenanceEvidence === true ? " thread-card-cross-mailbox" : "";
        const selectedClass = selected ? " thread-card-selected" : "";
        const priorityClass = laneId === "act_now" ? " thread-card-priority" : "";
        const source = asText(thread?.worklistSource || historyItem?.worklistSource || "legacy");
        const foundationMode = asText(
          thread?.foundationMode ||
            thread?.mailFoundation?.mode ||
            thread?.raw?.foundationMode ||
            (hasThreadDocument ? "foundation" : preview ? "legacy_fallback" : "")
        );
        const foundationSource = asText(
          thread?.foundationSource ||
            thread?.mailFoundation?.source ||
            thread?.raw?.foundationSource ||
            (hasThreadDocument ? "mail_foundation" : preview ? "legacy_preview_fallback" : "")
        );
        const subjectContext = (() => {
          if (rowFamily === "booking_system_mail") return "";
          const normalizedCustomer = customer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const cleaned = asText(title)
            .replace(new RegExp(`^${normalizedCustomer}\\s*`, "i"), "")
            .trim();
          return cleaned && normalizeKey(cleaned) !== normalizeKey(customer) ? cleaned : "";
        })();
        const storyMarkup = preview
          ? `<p class="thread-story thread-story-inline">${escapeHtml(preview)}</p>`
          : "";
        const isCrossMailboxEvidence =
          thread?.crossMailboxProvenanceEvidence === true ||
          thread?.mailboxProvenanceEvidence === true;
        const unreadIndicatorMarkup =
          !isCrossMailboxEvidence && (thread?.unread === true || thread?.isUnread === true)
            ? '<span class="thread-unread-indicator" aria-label="Oläst mejl"></span>'
            : "";
        const provenanceLabel = asText(
          thread?.mailboxProvenanceLabel || historyItem?.mailboxProvenanceLabel
        );
        const provenanceDetail = asText(
          thread?.mailboxProvenanceDetail || historyItem?.mailboxProvenanceDetail
        );
        const provenanceCopy =
          crossMailboxClass && provenanceDetail
            ? provenanceDetail
            : `${provenanceLabel || ""}${provenanceLabel && provenanceDetail ? " · " : ""}${provenanceDetail}`;
        const provenanceMarkup =
          provenanceLabel || provenanceDetail
            ? `<div class="intel-card-provenance thread-card-provenance"><span class="intel-card-provenance-label intel-card-provenance-derived">Mejlspår</span><p class="intel-card-provenance-detail">${escapeHtml(
                provenanceCopy
              )}</p></div>`
            : "";
        return `<article class="thread-card thread-card-live${crossMailboxClass}${selectedClass}${priorityClass}" data-runtime-thread="${escapeHtml(
          asText(thread?.id)
        )}" data-worklist-source="${escapeHtml(source)}" data-row-family="${escapeHtml(rowFamily)}"${foundationMode ? ` data-foundation-mode="${escapeHtml(foundationMode)}"` : ""}${foundationSource ? ` data-foundation-source="${escapeHtml(foundationSource)}"` : ""}>
          <div class="thread-card-head">
            <div class="thread-card-identity">
              <span class="avatar" aria-hidden="true">${escapeHtml(
                asText(historyItem?.customerInitials || customer.slice(0, 2).toUpperCase())
              )}</span>
              <div class="thread-card-head-copy">
                <div class="thread-heading thread-heading-merged">
                  ${unreadIndicatorMarkup}
                  <p class="thread-subject"><span class="thread-subject-primary">${escapeHtml(
                    customer
                  )}</span>${subjectContext ? `<span class="thread-subject-context">${escapeHtml(subjectContext)}</span>` : ""}</p>
                </div>
                ${storyMarkup}
              </div>
            </div>
            <div class="thread-card-stamp-top"><time datetime="${escapeHtml(
              asText(thread?.lastActivityAt || historyItem?.recordedAt || "")
            )}">${escapeHtml(asText(thread?.lastActivityLabel || historyItem?.time || ""))}</time></div>
            <div class="thread-card-stamp"><span class="thread-owner">${escapeHtml(
              asText(thread?.displayOwnerLabel || thread?.ownerLabel || "Ej tilldelad")
            )}</span></div>
          </div>
          <div class="thread-support-stack"><div class="thread-intelligence-row"><span class="thread-intelligence-item thread-intelligence-item--mailbox"><span class="thread-intelligence-item-icon">${renderUnifiedCardIconMarkup("mail")}</span><span class="thread-intelligence-item-value">${escapeHtml(
            asText(thread?.mailboxLabel || historyItem?.mailboxLabel || "Kons")
          )}</span></span><span class="thread-intelligence-item thread-intelligence-item--what"><span class="thread-intelligence-item-icon">${renderUnifiedCardIconMarkup("layers")}</span><span class="thread-intelligence-item-value">${escapeHtml(
            whatValue
          )}</span></span><span class="thread-intelligence-item thread-intelligence-item--why"><span class="thread-intelligence-item-value">${escapeHtml(
            whyValue
          )}</span></span><button class="thread-intelligence-item thread-intelligence-item--next" type="button" data-runtime-studio-open data-runtime-studio-thread-id="${escapeHtml(
            asText(thread?.id)
          )}"><span class="thread-intelligence-item-icon">${renderUnifiedCardIconMarkup("bolt")}</span><span class="thread-intelligence-item-value">${escapeHtml(
            nextValue
          )}</span></button></div>${provenanceMarkup}</div>
        </article>`;
      }
      return buildQueueHistoryCardMarkup(historyItem, {
        runtimeThreadId: asText(thread?.id),
        conversationId: asText(thread?.id),
        selectedConversationId: selected ? asText(thread?.id) : "",
        worklistSource: asText(thread?.worklistSource || historyItem?.worklistSource || "legacy"),
        worklistSourceLabel: asText(
          thread?.worklistSourceLabel || historyItem?.worklistSourceLabel
        ),
        useThreadCardClass: true,
      });
    }

    function buildHistorikV3CardMarkup(thread = {}, selected = false) {
      const historyItem =
        typeof buildQueueInlineLaneHistoryItem === "function"
          ? buildQueueInlineLaneHistoryItem(thread)
          : {
              customerName: asText(thread.customerName, "Okänd avsändare"),
              customerInitials: asText(thread.avatarInitials),
              detail: asText(thread.preview || thread.systemPreview),
              time: asText(thread.lastActivityLabel),
              recordedAt: asText(thread.lastActivityAt),
              mailboxLabel: asText(thread.mailboxLabel || thread.mailboxAddress, "Kons"),
              mailboxTrail: asArray(thread.mailboxTrail),
              mailboxProvenanceDetail: asText(thread.mailboxProvenanceDetail),
              status: asText(thread.status),
            };
      const parseTrail = (value = "") =>
        asText(value)
          .split(/[·,]/g)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
      const trail = asArray(historyItem.mailboxTrail).length
        ? asArray(historyItem.mailboxTrail)
            .map((entry) => asText(entry).trim())
            .filter(Boolean)
        : parseTrail(historyItem.mailboxProvenanceDetail);
      const visibleTrail = (trail.length ? trail : ["Fazli", "Contact", "Egzona"]).slice(0, 3);
      const overflowCount = Math.max(0, (trail.length ? trail.length : 3) - visibleTrail.length);
      const subtitle = trail.length > 1 ? "Samma kund har skrivit från flera mejlkonton" : "";
      const statusDot = asText(
        historyItem.status,
        normalizeKey(historyItem?.laneId || thread?.primaryLaneId || "") === "act_now"
          ? "urgent"
          : "active"
      );
      const selectedClass = selected ? " is-selected thread-card-selected" : "";
      return `<article class="thread-card queue-history-item unified-queue-card${selectedClass}" data-runtime-thread="${escapeHtml(
        asText(thread?.id)
      )}" data-history-conversation="${escapeHtml(asText(thread?.id))}">
        <div class="card-top">
          <div class="avatar-wrap">
            <span class="avatar queue-history-avatar" aria-hidden="true">${escapeHtml(
              asText(historyItem.customerInitials, "OK")
            )}</span>
            <span class="status-dot ${escapeHtml(statusDot)}" aria-hidden="true"></span>
          </div>
          <div class="card-body">
            <div class="row-1">
              <span class="name">${escapeHtml(asText(historyItem.customerName, "Okänd avsändare"))}</span>
              ${subtitle ? `<span class="subtitle">${escapeHtml(subtitle)}</span>` : ""}
              <div class="meta">
                ${
                  asText(historyItem.time)
                    ? `<div class="meta-date"><time datetime="${escapeHtml(
                        asText(historyItem.recordedAt)
                      )}">${escapeHtml(asText(historyItem.time))}</time></div>`
                    : ""
                }
                <span class="meta-status">${escapeHtml(
                  asText(thread?.displayOwnerLabel || thread?.ownerLabel, "Ej tilldelad")
                )}</span>
              </div>
            </div>
            <div class="row-2">${escapeHtml(
              asText(
                historyItem.detail,
                "Historiken hålls ihop, men varje meddelande visar sin mejlkontoproveniens."
              )
            )}</div>
          </div>
        </div>
        <div class="card-footer">
          <span class="chip chip-gray">${__renderUnifiedCardIconMarkup("mail")}<span class="chip-label">${escapeHtml(
            asText(historyItem.mailboxLabel, "Kons")
          )}</span></span>
          <span class="chip chip-blue">${__renderUnifiedCardIconMarkup("users")}<span class="chip-label">Samma kund har sk...</span></span>
          <span class="chip chip-pink">${__renderUnifiedCardIconMarkup("alert")}<span class="chip-label">Behöver uppmärksa...</span></span>
          <span class="chip chip-green">${__renderUnifiedCardIconMarkup("chevron-right")}<span class="chip-label">Fortsätt från samma</span></span>
        </div>
        ${
          trail.length > 1
            ? `<div class="mailbox-trail">
                <span class="trail-bar" aria-hidden="true"></span>
                ${__renderUnifiedCardIconMarkup("inbox")}
                <span class="trail-label">MAILBOXSPÅR</span>
                ${visibleTrail
                  .map(
                    (entry, index) =>
                      `${index > 0 ? '<span class="trail-separator" aria-hidden="true">·</span>' : ""}<span class="trail-item">${escapeHtml(entry)}</span>`
                  )
                  .join("")}
                ${
                  overflowCount > 0
                    ? `<span class="trail-separator" aria-hidden="true">·</span><span class="trail-more">+${overflowCount} till</span>`
                    : ""
                }
              </div>`
            : ""
        }
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
            const leadPattern = new RegExp(`^${escapedLead}(?:\\s*[-:|,–—]\\s*|\\s+)`, "i");
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
          cleaned = cleaned
            .replace(/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
            .trim();
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
        if (
          /\bqa|fixture|verify|verification|kontrollerad|live send|inspect|sandbox\b/.test(
            normalized
          )
        ) {
          return "Ge instruktion";
        }
        if (/\bfinasterid\b/.test(normalized)) return "Finasteridfråga";
        if (/\bpris|kostnad|prisbild\b/.test(normalized)) return "Klargör pris";
        if (/\bbild|bilder|foto|foton\b/.test(normalized)) return "Be om bilder";
        if (/\bbilaga|underlag|dokument\b/.test(normalized)) return "Granska bilaga";
        if (/\bbokning|boka|ombok|tid|datum\b/.test(normalized)) return "Klargör bokning";
        if (/\bmottaget|bekrafta.*underlag|bekrafta.*mottaget\b/.test(normalized))
          return "Bekräfta underlag";
        if (/\bsaknad|uppgift|komplettera|komplettering\b/.test(normalized)) return "Be om uppgift";
        if (/\bf[öo]lj upp|uteblivet svar|inv[äa]nta svar\b/.test(normalized)) return "Följ upp";
        if (/\bmedicinsk|medicin|behandling|prp\b/.test(normalized)) return "Medicinsk fråga";
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

    function enforceUnifiedCardV3Sections(rootElement) {
      if (!rootElement || typeof rootElement.querySelectorAll !== "function") return;
      const cards = rootElement.querySelectorAll(".thread-card");
      cards.forEach((card) => {
        if (!card.classList.contains("unified-queue-card")) {
          card.classList.add("unified-queue-card");
        }
        // v5 cards bär data-lane + .mailbox-stack istället för v3:s chips/trail.
        // Hoppa över v3-enforcement helt på dom — annars dubblerar vi UI.
        if (card.hasAttribute("data-lane") || card.querySelector(".mailbox-stack")) {
          return;
        }
        if (!card.querySelector(".card-footer")) {
          card.insertAdjacentHTML(
            "beforeend",
            `<div class="card-footer">
              <span class="chip chip-gray">${buildUnifiedCardIconMarkup("mail")}<span class="chip-label">Kons</span></span>
              <span class="chip chip-blue">${buildUnifiedCardIconMarkup("users")}<span class="chip-label">Samma kund har sk...</span></span>
              <span class="chip chip-pink">${buildUnifiedCardIconMarkup("alert")}<span class="chip-label">Behöver uppmärksa...</span></span>
              <span class="chip chip-green">${buildUnifiedCardIconMarkup("chevron-right")}<span class="chip-label">Fortsätt från samma</span></span>
            </div>`
          );
        }
        const subtitleText = asText(card.querySelector(".subtitle")?.textContent).toLowerCase();
        if (
          subtitleText.includes("samma kund har skrivit") &&
          !card.querySelector(".mailbox-trail")
        ) {
          card.insertAdjacentHTML(
            "beforeend",
            `<div class="mailbox-trail">
              <span class="trail-bar" aria-hidden="true"></span>
              ${buildUnifiedCardIconMarkup("inbox")}
              <span class="trail-label">MAILBOXSPÅR</span>
              <span class="trail-item">Fazli</span>
              <span class="trail-separator" aria-hidden="true">·</span>
              <span class="trail-item">Contact</span>
              <span class="trail-separator" aria-hidden="true">·</span>
              <span class="trail-item">Egzona</span>
            </div>`
          );
        }
      });
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
      const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
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
      if (normalizedLaneId === "operation") {
        return compactRuntimeCopy(asText(raw.plannedTreatment, raw.caseType, "Operation"), "", 22);
      }
      if (normalizedLaneId === "commercial") {
        return compactRuntimeCopy(asText(raw.offerType, raw.paymentContext, "Offert"), "", 20);
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
      const raw = thread?.raw && typeof thread.raw === "object" ? thread.raw : {};
      if (normalizedLaneId === "act_now") return "Svar krävs nu";
      if (normalizedLaneId === "review") return "Behöver granskning";
      if (normalizedLaneId === "operation") {
        const operationStatus = normalizeKey(
          raw.operationStatus || raw.caseStatus || raw.plannedTreatmentStatus || statusLabel
        );
        const operationContext = normalizeKey(
          asText(raw.treatmentContext, raw.medicalContext, whyInFocus)
        );
        if (operationStatus.includes("blocked") || operationContext.includes("klarering")) {
          return "Klarering krävs";
        }
        if (operationStatus.includes("complete")) {
          return "Operationsspår klart";
        }
        if (operationContext.includes("handoff") || operationContext.includes("genomforande")) {
          return "Klinisk handoff";
        }
        return "Operationsspår aktivt";
      }
      if (normalizedLaneId === "commercial") {
        const commercialStatus = normalizeKey(
          raw.commercialStatus || raw.paymentStatus || raw.offerStatus || statusLabel
        );
        if (commercialStatus.includes("deposit")) return "Deposition väntar";
        if (commercialStatus.includes("quote_sent")) return "Offert väntar";
        if (commercialStatus.includes("needs_review")) return "Pris kräver granskning";
        if (normalizedWhy.includes("betal")) return "Betalning driver";
        return "Commercial aktiv";
      }
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
      if (normalizedLaneId === "operation") return "Öppna operationsspår";
      if (normalizedLaneId === "commercial") return "Öppna commercial";
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
        typeof getAvailableRuntimeMailboxes === "function"
          ? asArray(getAvailableRuntimeMailboxes())
          : [];
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
      const whatValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalWhat(thread, laneId)),
        "",
        20
      );
      const whyValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalWhy(thread, laneId)),
        "",
        18
      );
      const nextValue = compactRuntimeCopy(
        asText(getQueueInlineLaneSignalNext(thread, laneId)),
        "",
        18
      );
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
      const normalizedTitleValue = normalizeSignalValue(
        asText(thread?.displaySubject || thread?.subject)
      );
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
              key: "Mejlkonto",
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
          role: "next",
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
            const role =
              typeof normalizeKey === "function" ? normalizeKey(s?.role || s?.tone || "") : "";
            const raw = asText(
              s?.value !== undefined && s?.value !== null ? s.value : s?.label || ""
            );
            return role === "why" && /hög risk|risk/i.test(raw);
          })
        );
      },
      waiting: (model) => {
        const owner = asText(model?.ownerLabel);
        const laneKey = typeof normalizeKey === "function" ? normalizeKey(model?.laneId || "") : "";
        return !owner || owner === "Ej tilldelad" || laneKey === "history";
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
      multiMailboxSubtitle: "Samma kund har skrivit från flera mejlkonton",
      mailboxTrailLabel: "MAILBOXSPÅR",
      mailboxTrailMore: "+{count} till",
      defaultCategory: "Kons",
    };

    /**
     * v5 lane-driven kortsmarkup — lane-badge + signal-what + signal-why + mailbox-stack + action-cluster.
     * Driver getQueueInlineLaneSignal* för operativt språk.
     *
     * @param {object} unifiedModel - Normaliserat kort (fält för status, innehåll, signaler, mejlkonton).
     * @param {object} [options] - data-attribut, urval, m.m.
     */

    // ====== v5 lane mapping ======
    const V5_LANE_MAP = {
      act_now: "act-now",
      actnow: "act-now",
      sprint: "sprint",
      later: "senare",
      senare: "senare",
      sent: "senare",
      admin: "admin",
      review: "granska",
      granska: "granska",
      unclear: "oklart",
      oklart: "oklart",
      aftercare: "eftervard",
      eftervard: "eftervard",
      eftervård: "eftervard",
      bookable: "bokning",
      booking: "bokning",
      bokning: "bokning",
      consultation: "consultation",
      consult: "consultation",
      consultation_request: "consultation",
      operation: "operation",
      operations: "operation",
      commercial: "commercial",
      medical: "medicinsk",
      medicinsk: "medicinsk",
      handled: "admin",
      done: "admin",
      all: "admin",
    };
    function v5LaneCode(laneId, thread) {
      const key = __normalizeKey(laneId);
      if (V5_LANE_MAP[key]) return V5_LANE_MAP[key];
      // Fallback: härled från tags eller via getThreadPrimaryLaneId
      if (thread) {
        const derived = __getThreadPrimaryLaneId(thread);
        const derivedKey = __normalizeKey(derived);
        if (V5_LANE_MAP[derivedKey]) return V5_LANE_MAP[derivedKey];
      }
      // Direkt tag-koll som sista fallback
      const tags = thread ? asArray(thread.tags) : [];
      if (tags.includes("act-now")) return "act-now";
      if (tags.includes("sprint")) return "sprint";
      if (tags.includes("later")) return "senare";
      if (tags.includes("bookable") || tags.includes("booking")) return "bokning";
      if (tags.includes("consultation") || tags.includes("consult")) return "consultation";
      if (tags.includes("operation")) return "operation";
      if (tags.includes("commercial")) return "commercial";
      if (tags.includes("review") || tags.includes("granska")) return "granska";
      if (tags.includes("medical") || tags.includes("medicinsk")) return "medicinsk";
      if (tags.includes("unclear") || tags.includes("oklart")) return "oklart";
      if (tags.includes("admin")) return "admin";
      return "admin";
    }
    const V5_LANE_LABELS = {
      "act-now": "Agera nu",
      sprint: "Sprint",
      senare: "Senare",
      admin: "Admin",
      granska: "Granska",
      oklart: "Oklart",
      eftervard: "Eftervård",
      bokning: "Bokning",
      consultation: "Konsultation",
      operation: "Operation",
      commercial: "Commercial",
      medicinsk: "Medicinsk",
    };
    function v5LaneLabel(code) {
      return V5_LANE_LABELS[code] || "Admin";
    }
    function v5LaneIcon(code) {
      const icons = {
        "act-now":
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        sprint:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        senare:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        admin:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/></svg>',
        granska:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        oklart:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        eftervard:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 12h2.8l1.7-3 2.7 7 2-4H19"/></svg>',
        bokning:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>',
        operation:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M6 17V8l4-3 4 3v9"/><path d="M10 12h4"/><path d="M12 10v4"/></svg>',
        commercial:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        medicinsk:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      };
      return icons[code] || icons.admin;
    }

    // ====== v5 mailbox color mapping ======
    const V5_MAILBOX_PALETTE = [
      "#7c3aed",
      "#0ea5e9",
      "#a8744c",
      "#f97316",
      "#14b8a6",
      "#eab308",
      "#8b5cf6",
      "#06b6d4",
    ];
    const V5_MAILBOX_KNOWN = {
      fazli: "#7c3aed",
      contact: "#0ea5e9",
      egzona: "#a8744c",
      support: "#f97316",
      sales: "#14b8a6",
      info: "#eab308",
      hello: "#8b5cf6",
      team: "#06b6d4",
      kons: "#a8744c",
      noreply: "#64748b",
    };
    function v5MailboxColor(name) {
      const key =
        typeof normalizeKey === "function" ? normalizeKey(name) : asText(name).toLowerCase();
      if (V5_MAILBOX_KNOWN[key]) return V5_MAILBOX_KNOWN[key];
      const cleanKey = String(key).replace(/[^a-z0-9]/g, "");
      let hash = 7;
      for (let i = 0; i < cleanKey.length; i++) {
        hash = (hash * 31 + cleanKey.charCodeAt(i)) | 0;
      }
      return V5_MAILBOX_PALETTE[Math.abs(hash) % V5_MAILBOX_PALETTE.length];
    }
    function v5MailboxInitial(name) {
      const t = asText(name).trim();
      return t ? t.charAt(0).toUpperCase() : "?";
    }

    // ====== v5 action-cluster icon library ======
    const V5_ACTION_ICONS = {
      history:
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      later:
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10l4.24 4.24"/><circle cx="12" cy="12" r="10"/></svg>',
      schedule:
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      handled:
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      delete:
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
      arrowRight:
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
      userCheck:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>',
      alertCircle:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    };

    function buildUnifiedCardMarkup(unifiedModel = {}, options = {}) {
      const parseMailboxTrailText = (value = "") =>
        asText(value)
          .split(/[·,]/g)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
      const baseTrail = asArray(unifiedModel.mailboxTrail)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      const fallbackTrail = parseMailboxTrailText(unifiedModel.mailboxProvenanceDetail);
      const trail = baseTrail.length > 1 ? baseTrail : fallbackTrail;
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
      const statusDot = asText(unifiedModel.statusDot) || deriveStatusDot(statusModel);

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

      const defaultFooterChips = [
        {
          key: "category",
          value: asText(
            unifiedModel.mailboxLabel ||
              unifiedModel.categoryLabel ||
              UNIFIED_CARD_COPY.defaultCategory
          ),
          icon: "mail",
          toneClass: "chip-gray",
        },
        {
          key: "context",
          value: compactRuntimeCopy(
            asText(
              unifiedModel.explanatoryLine ||
                unifiedModel.subtitle ||
                (trail.length > 1 ? UNIFIED_CARD_COPY.multiMailboxSubtitle : "")
            ),
            "Samma kund har skrivit från flera mejlkonton",
            24
          ),
          icon: "users",
          toneClass: "chip-blue",
        },
        {
          key: "why",
          value: compactRuntimeCopy(
            asText(
              unifiedModel.whyInFocus ||
                asArray(unifiedModel.signalItems).find(
                  (signal) => normalizeKey(signal?.role || signal?.tone || "") === "why"
                )?.value ||
                "Behöver uppmärksamhet"
            ),
            "Behöver uppmärksamhet",
            24
          ),
          icon: "alert",
          toneClass: "chip-pink",
        },
        {
          key: "next",
          value: compactRuntimeCopy(
            asText(
              unifiedModel.nextActionLabel ||
                unifiedModel.nextActionSummary ||
                "Fortsätt från samma"
            ),
            "Fortsätt från samma",
            24
          ),
          icon: "chevron-right",
          toneClass: "chip-green",
        },
      ].filter((chip) => asText(chip.value));
      const footerChips = content.footerChips.length ? content.footerChips : defaultFooterChips;
      if (!footerChips.length) {
        footerChips.push(
          {
            key: "category",
            value: UNIFIED_CARD_COPY.defaultCategory,
            icon: "mail",
            toneClass: "chip-gray",
          },
          {
            key: "context",
            value: "Samma kund har skrivit från flera mejlkonton",
            icon: "users",
            toneClass: "chip-blue",
          },
          { key: "why", value: "Behöver uppmärksamhet", icon: "alert", toneClass: "chip-pink" },
          {
            key: "next",
            value: "Fortsätt från samma",
            icon: "chevron-right",
            toneClass: "chip-green",
          }
        );
      }
      const intelligenceMarkup = footerChips.length
        ? `<div class="card-footer">
            ${footerChips
              .map((chip) => {
                const toneClass = escapeHtml(chip.toneClass || "chip-gray");
                const chipKey = escapeHtml(chip.key || "");
                if (chip.interactive === "studio-open" && asText(chip.runtimeThreadId)) {
                  const tid = escapeHtml(chip.runtimeThreadId);
                  const aria = escapeHtml(chip.studioAriaLabel || "Öppna svarsstudion");
                  return `<button class="chip ${toneClass}" data-history-chip="${chipKey}" type="button" data-runtime-studio-open data-runtime-studio-thread-id="${tid}" aria-controls="studio-shell" aria-label="${aria}">
                  ${buildUnifiedCardIconMarkup(chip.icon)}
                  <span class="chip-label">${escapeHtml(chip.value)}</span>
                </button>`;
                }
                return `<span class="chip ${toneClass}" data-history-chip="${chipKey}">
                  ${buildUnifiedCardIconMarkup(chip.icon)}
                  <span class="chip-label">${escapeHtml(chip.value)}</span>
                </span>`;
              })
              .join("")}
          </div>`
        : "";

      const showTrail = trail.length > 1 || /samma kund har skrivit/i.test(subtitle);
      const effectiveTrail = showTrail
        ? trail.length
          ? trail
          : ["Fazli", "Contact", "Egzona"]
        : [];
      const visibleMailboxTrailItems = showTrail ? effectiveTrail.slice(0, 3) : [];
      const mailboxTrailOverflowCount = showTrail
        ? Math.max(0, effectiveTrail.length - visibleMailboxTrailItems.length)
        : 0;
      const mailboxTrailMarkup = showTrail
        ? `<div class="mailbox-trail">
            <span class="trail-bar" aria-hidden="true"></span>
            ${buildUnifiedCardIconMarkup("inbox")}
            <span class="trail-label">${escapeHtml(UNIFIED_CARD_COPY.mailboxTrailLabel)}</span>
            ${visibleMailboxTrailItems
              .map(
                (entry, index) =>
                  `${index > 0 ? '<span class="trail-separator" aria-hidden="true">·</span>' : ""}<span class="trail-item">${escapeHtml(entry)}</span>`
              )
              .join("")}
            ${
              mailboxTrailOverflowCount > 0
                ? `<span class="trail-separator" aria-hidden="true">·</span><button class="trail-more" type="button" data-mailbox-trail-overflow="${mailboxTrailOverflowCount}">${escapeHtml(
                    UNIFIED_CARD_COPY.mailboxTrailMore.replace(
                      "{count}",
                      String(mailboxTrailOverflowCount)
                    )
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

      const supportMarkup = `${intelligenceMarkup}${mailboxTrailMarkup}`;

      const subtitleMarkup =
        content.subtitle && !content.tightMode
          ? `<span class="subtitle">${escapeHtml(content.subtitle)}</span>`
          : "";
      const previewMarkup =
        content.previewLine && !content.tightMode
          ? `<div class="row-2">${escapeHtml(content.previewLine)}</div>`
          : "";

      const selectedClass = isSelected ? " is-selected" : "";
      const selectedArticleClass = isSelected ? " thread-card-selected" : "";
      const selectedState = isSelected
        ? ' aria-current="true" data-history-selected="true"'
        : ' aria-current="false"';
      const runtimeThreadAttribute = runtimeThreadId
        ? ` data-runtime-thread="${escapeHtml(runtimeThreadId)}"`
        : "";
      const worklistSource = asText(
        options.worklistSource || unifiedModel.worklistSource || "legacy"
      );
      const worklistSourceAttribute = ` data-worklist-source="${escapeHtml(worklistSource)}"`;
      const worklistSourceLabel = asText(
        options.worklistSourceLabel || unifiedModel.worklistSourceLabel
      );
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
      // Exponera tags som DOM-attribut för follow-up-filter och saved-views.
      const runtimeTagsList = (Array.isArray(unifiedModel.tags) ? unifiedModel.tags : [])
        .map((t) => String(t || "").trim())
        .filter(Boolean);
      const runtimeTagsAttribute = runtimeTagsList.length
        ? ` data-runtime-tags="${escapeHtml(runtimeTagsList.join(","))}"`
        : "";

      // ====== v5 LAYOUT ======
      // Compute What/Why/Next via existing signal-functions. unifiedModel has the
      // fields they need (intentLabel, statusLabel, riskLabel, tags, etc.) — pass
      // through any explicit override from caller.
      const v5Lane = v5LaneCode(unifiedModel.laneId, unifiedModel);
      const v5Label = v5LaneLabel(v5Lane);
      const v5Icon = v5LaneIcon(v5Lane);

      const whatStr = asText(
        unifiedModel.whatSignal ||
          (typeof getQueueInlineLaneSignalWhat === "function"
            ? getQueueInlineLaneSignalWhat(unifiedModel, unifiedModel.laneId)
            : "") ||
          asText(unifiedModel.previewLine).slice(0, 120)
      );
      let whyEntries = asArray(unifiedModel.whySignals);
      if (!whyEntries.length) {
        const whyVal = asText(
          unifiedModel.whySignal ||
            (typeof getQueueInlineLaneSignalWhy === "function"
              ? getQueueInlineLaneSignalWhy(unifiedModel, unifiedModel.laneId)
              : "")
        );
        if (whyVal)
          whyEntries = [
            {
              text: whyVal,
              tone: v5Lane === "act-now" ? "alert" : v5Lane === "granska" ? "amber" : "",
            },
          ];
      }
      const nextStr = asText(
        unifiedModel.nextSignal ||
          (typeof getQueueInlineLaneSignalNext === "function"
            ? getQueueInlineLaneSignalNext(unifiedModel, unifiedModel.laneId)
            : "") ||
          "Svara"
      );

      // Owner-state — om stampLabel innehåller "Ej tilldelad" → unowned, annars → owned
      const ownedFlag = !/ej tilldelad|unassigned|oägd|oagd|otilldelad/i.test(stampLabel);
      const ownerIcon = ownedFlag ? V5_ACTION_ICONS.userCheck : V5_ACTION_ICONS.alertCircle;

      // Mailbox stack — färgade prickar med initial. Fallback om trail tom.
      const mailboxStackEntries = trail.length ? trail : subtitle ? ["Inkorg"] : [];
      const visibleMailboxes = mailboxStackEntries.slice(0, 3);
      const overflowCount = Math.max(0, mailboxStackEntries.length - visibleMailboxes.length);
      const mailboxStackMarkup = mailboxStackEntries.length
        ? `<div class="mailbox-stack">
            <span class="mailbox-label">Via</span>
            <div class="mb-avatars">
              ${visibleMailboxes
                .map((mb) => {
                  const color = v5MailboxColor(mb);
                  const initial = v5MailboxInitial(mb);
                  return `<div class="mb-dot" data-mb="${escapeHtml(asText(mb).toLowerCase())}" title="${escapeHtml(mb)}" style="background:${color}">${escapeHtml(initial)}</div>`;
                })
                .join("")}
              ${overflowCount > 0 ? `<div class="mb-dot more" title="${escapeHtml(mailboxStackEntries.slice(3).join(", "))}">+${overflowCount}</div>` : ""}
            </div>
          </div>`
        : "";

      // Action cluster — primärknappen går normalt via studio-open, men
      // operations- och commercialrader kan nu öppna sin egen workspace-surface direkt.
      const studioThreadAttr = runtimeThreadId
        ? ` data-runtime-studio-open data-runtime-studio-thread-id="${escapeHtml(runtimeThreadId)}"`
        : "";
      const operationThreadAttr = runtimeThreadId
        ? ` data-runtime-domain-open="operation" data-runtime-domain-thread-id="${escapeHtml(
            runtimeThreadId
          )}"`
        : ' data-runtime-domain-open="operation"';
      const consultationThreadAttr = runtimeThreadId
        ? ` data-runtime-domain-open="consultation" data-runtime-domain-thread-id="${escapeHtml(
            runtimeThreadId
          )}"`
        : ' data-runtime-domain-open="consultation"';
      const commercialThreadAttr = runtimeThreadId
        ? ` data-runtime-domain-open="commercial" data-runtime-domain-thread-id="${escapeHtml(
            runtimeThreadId
          )}"`
        : ' data-runtime-domain-open="commercial"';
      const normalizedNextStr = normalizeKey(nextStr);
      const laneQuickActionSignal = normalizeKey(
        [
          whatStr,
          nextStr,
          unifiedModel.previewLine,
          unifiedModel.explanatoryLine,
          unifiedModel.secondarySnippet,
          ...whyEntries.map((entry) => asText(typeof entry === "string" ? entry : entry?.text)),
        ]
          .filter(Boolean)
          .join(" ")
      );
      const primaryLabel =
        v5Lane === "bokning"
          ? "Bekräfta bokning"
          : v5Lane === "operation"
            ? laneQuickActionSignal.includes("utfall") ||
              laneQuickActionSignal.includes("postoperativ")
              ? "Eskalera utfall"
              : laneQuickActionSignal.includes("pågår") ||
                  laneQuickActionSignal.includes("pagar") ||
                  laneQuickActionSignal.includes("status")
                ? "Koordinera operation"
                : laneQuickActionSignal.includes("eftervård") ||
                    laneQuickActionSignal.includes("slutförd") ||
                    laneQuickActionSignal.includes("slutford")
                  ? "Öppna eftervård"
                  : laneQuickActionSignal.includes("klarering")
                    ? "Driv klarering"
                    : laneQuickActionSignal.includes("handoff") ||
                        laneQuickActionSignal.includes("operationsstart") ||
                        laneQuickActionSignal.includes("idag") ||
                        laneQuickActionSignal.includes("redo")
                      ? "Lås handoff"
                      : "Öppna operation"
            : v5Lane === "consultation"
              ? laneQuickActionSignal.includes("samtycke")
                ? "Säkra samtycke"
                : laneQuickActionSignal.includes("dokument")
                  ? "Lås upp dokument"
                  : laneQuickActionSignal.includes("klinis")
                    ? "Verifiera kliniskt"
                    : laneQuickActionSignal.includes("planera") ||
                        laneQuickActionSignal.includes("bokning") ||
                        laneQuickActionSignal.includes("redo")
                      ? "Planera konsultation"
                      : "Öppna konsultation"
              : v5Lane === "commercial"
                ? laneQuickActionSignal.includes("betalning") ||
                  laneQuickActionSignal.includes("deposition")
                  ? "Lås upp betalning"
                  : laneQuickActionSignal.includes("offert")
                    ? "Följ upp offert"
                    : laneQuickActionSignal.includes("bokning") ||
                        laneQuickActionSignal.includes("klartecken") ||
                        laneQuickActionSignal.includes("redo")
                      ? "Lämna till bokning"
                      : "Öppna commercial"
                : v5Lane === "granska"
                  ? "Granska"
                  : v5Lane === "oklart"
                    ? "Öppna"
                    : "Svara";
      const hasOperationQuickAction =
        v5Lane === "operation" ||
        normalizedNextStr === "oppna_operationsspar" ||
        laneQuickActionSignal.includes("operationsplan") ||
        laneQuickActionSignal.includes("operation") ||
        laneQuickActionSignal.includes("klarering");
      const hasCommercialQuickAction =
        v5Lane === "commercial" ||
        normalizedNextStr === "oppna_commercial" ||
        laneQuickActionSignal.includes("offert") ||
        laneQuickActionSignal.includes("deposition") ||
        laneQuickActionSignal.includes("betalning") ||
        laneQuickActionSignal.includes("pris");
      const hasConsultationQuickAction =
        v5Lane === "consultation" ||
        normalizedNextStr === "oppna_konsultation" ||
        laneQuickActionSignal.includes("samtycke") ||
        laneQuickActionSignal.includes("konsultation") ||
        laneQuickActionSignal.includes("dokument") ||
        laneQuickActionSignal.includes("klinis");
      const hasConsultationConsentSignal = laneQuickActionSignal.includes("samtycke");
      const hasConsultationDocumentSignal = laneQuickActionSignal.includes("dokument");
      const hasConsultationClinicalSignal = laneQuickActionSignal.includes("klinis");
      const laneQuickActionDestination = hasCommercialQuickAction
        ? "betalning"
        : hasConsultationQuickAction
          ? "medicinsk"
          : "medicinsk";
      const laneQuickActionTemplate = hasCommercialQuickAction
        ? "betalning"
        : hasConsultationClinicalSignal
          ? "allergi"
          : hasConsultationDocumentSignal
            ? "behandling"
            : hasConsultationQuickAction
              ? "samtycke"
              : "allergi";
      const laneQuickAction = hasOperationQuickAction
        ? {
            action: "note",
            key: "operation",
            label:
              laneQuickActionSignal.includes("utfall") ||
              laneQuickActionSignal.includes("postoperativ")
                ? "Utfallsnot"
                : laneQuickActionSignal.includes("pågår") ||
                    laneQuickActionSignal.includes("pagar") ||
                    laneQuickActionSignal.includes("status")
                  ? "Statusnot"
                  : "Klareringsnot",
            aria:
              laneQuickActionSignal.includes("utfall") ||
              laneQuickActionSignal.includes("postoperativ")
                ? "Öppna utfallsanteckning"
                : laneQuickActionSignal.includes("pågår") ||
                    laneQuickActionSignal.includes("pagar") ||
                    laneQuickActionSignal.includes("status")
                  ? "Öppna statusanteckning"
                  : "Öppna klareringsanteckning",
          }
        : hasConsultationQuickAction
          ? {
              action: "note",
              key: "consultation",
              label: hasConsultationClinicalSignal
                ? "Klinisk not"
                : hasConsultationDocumentSignal && !hasConsultationConsentSignal
                  ? "Dokumentnot"
                  : "Samtyckesnot",
              aria: hasConsultationClinicalSignal
                ? "Öppna klinisk anteckning"
                : hasConsultationDocumentSignal && !hasConsultationConsentSignal
                  ? "Öppna dokumentanteckning"
                  : "Öppna samtyckesanteckning",
            }
          : hasCommercialQuickAction
            ? {
                action: "note",
                key: "commercial",
                label: laneQuickActionSignal.includes("deposition")
                  ? "Depositionsnot"
                  : laneQuickActionSignal.includes("betalning")
                    ? "Betalningsnot"
                    : "Prisnot",
                aria: laneQuickActionSignal.includes("deposition")
                  ? "Öppna depositionsanteckning"
                  : laneQuickActionSignal.includes("betalning")
                    ? "Öppna betalningsanteckning"
                    : "Öppna prisanteckning",
              }
            : null;
      const laneQuickActionMarkup = laneQuickAction
        ? `<button class="queue-inline-lane-action quick-action-pill" type="button"
            data-quick-action="${escapeHtml(laneQuickAction.action)}"
            data-lane-quick-action="${escapeHtml(laneQuickAction.key)}"
            data-runtime-note-open
            data-runtime-note-thread-id="${escapeHtml(runtimeThreadId)}"
            data-runtime-note-destination="${escapeHtml(laneQuickActionDestination)}"
            data-runtime-note-template="${escapeHtml(laneQuickActionTemplate)}"
            title="${escapeHtml(laneQuickAction.aria)}"
            aria-label="${escapeHtml(laneQuickAction.aria)}">${escapeHtml(
              laneQuickAction.label
            )}</button>`
        : "";
      const actionClusterMarkup = `<div class="action-cluster">
        <button class="action-icon" type="button" data-quick-action="history" title="Historik" aria-label="Öppna historik">${V5_ACTION_ICONS.history}</button>
        <button class="action-icon" type="button" data-quick-action="later" title="Svara senare" aria-label="Svara senare">${V5_ACTION_ICONS.later}</button>
        <button class="action-icon" type="button" data-quick-action="schedule" title="Schemalägg uppföljning" aria-label="Schemalägg uppföljning">${V5_ACTION_ICONS.schedule}</button>
        <button class="action-icon" type="button" data-quick-action="handled" title="Markera klar" aria-label="Markera klar">${V5_ACTION_ICONS.handled}</button>
        <button class="action-icon" type="button" data-quick-action="delete" title="Radera" aria-label="Radera">${V5_ACTION_ICONS.delete}</button>
        ${laneQuickActionMarkup}
        <button class="primary-action" type="button" data-quick-action="${escapeHtml(
          v5Lane === "operation"
            ? "operation_surface"
            : v5Lane === "consultation"
              ? "consultation_surface"
              : v5Lane === "commercial"
                ? "commercial_surface"
                : "studio"
        )}" data-quick-mode="reply"${
          v5Lane === "operation"
            ? operationThreadAttr
            : v5Lane === "consultation"
              ? consultationThreadAttr
              : v5Lane === "commercial"
                ? commercialThreadAttr
                : studioThreadAttr
        }${
          v5Lane === "operation" || v5Lane === "consultation" || v5Lane === "commercial"
            ? ""
            : ' aria-controls="studio-shell"'
        }>
          ${escapeHtml(primaryLabel)}
          ${V5_ACTION_ICONS.arrowRight}
        </button>
      </div>`;

      const whyMarkup = whyEntries.length
        ? `<div class="signal-why">
            ${whyEntries
              .map((entry) => {
                const text = asText(typeof entry === "string" ? entry : entry.text);
                if (!text) return "";
                const tone = typeof entry === "object" ? asText(entry.tone) : "";
                return `<span class="why-reason${tone ? ` ${escapeHtml(tone)}` : ""}">${escapeHtml(text)}</span>`;
              })
              .join("")}
          </div>`
        : "";

      const v5DataLane = ` data-lane="${escapeHtml(v5Lane)}"`;

      // ====== WARM-ROW v8 markup — Apple Mail / Linear / Arc-stil ======
      // Layout:
      //   top:  [Oklart]                            [datum · Ej tilldelad]
      //   mid:  [avatar] [sender · subject + filer]                 [actions]
      //                  [2-rads body-preview]
      //                  [why-rad: ⚠ Miss-risk]
      const dateMarkup = asText(unifiedModel.time)
        ? `<time class="meta-date" datetime="${escapeHtml(unifiedModel.recordedAt || "")}">${escapeHtml(unifiedModel.time || "")}</time>`
        : "";
      const stampMarkup = stampLabel
        ? `<span class="meta-status ${ownedFlag ? "owned" : "unowned"}">${escapeHtml(stampLabel)}</span>`
        : "";
      const dotSep =
        dateMarkup && stampMarkup ? `<span class="meta-sep" aria-hidden="true">·</span>` : "";

      // Bygg why-rad med färgad ikon. Mappa text/tone → ikon.
      const whyText = whyEntries.length
        ? asText(typeof whyEntries[0] === "string" ? whyEntries[0] : whyEntries[0].text)
        : "";
      const whyTone =
        whyEntries.length && typeof whyEntries[0] === "object" ? asText(whyEntries[0].tone) : "";
      const whyKey = whyText.toLowerCase();
      let whyIconKind = "info";
      if (/miss[\s-]?risk|risk|överskrid|overdue|brand/.test(whyKey)) whyIconKind = "alert";
      else if (/svar|reply|fråga/.test(whyKey)) whyIconKind = "refresh";
      else if (/åtgärd|action|brådsk|akut|urgent/.test(whyKey)) whyIconKind = "info";
      else if (/klar|done|färdig/.test(whyKey)) whyIconKind = "check";
      else if (whyTone === "alert") whyIconKind = "info";
      else if (whyTone === "amber") whyIconKind = "alert";

      const WARM_WHY_ICONS = {
        alert:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17.5" x2="12.01" y2="17.5"/></svg>',
        refresh:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4 3 10 9 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.36L3 10"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        check:
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      };

      const warmWhyMarkup = whyText
        ? `<div class="warm-why" data-why-kind="${escapeHtml(whyIconKind)}">
            <span class="warm-why-icon" aria-hidden="true">${WARM_WHY_ICONS[whyIconKind]}</span>
            <span class="why-reason">${escapeHtml(whyText)}</span>
          </div>`
        : "";

      // ====== Sender / Subject / Body preview-text ======
      // Sender = motpart (företaget eller kunden som skrivit)
      // Subject = mejlets ämnesrad (subtitle eller fallback whatStr)
      // Preview = själva body-texten (previewLine), clampad till 2 rader via CSS
      const senderText = counterpartyCopy;
      const rawPreviewBody = asText(unifiedModel.previewLine);
      const subtitleText = asText(unifiedModel.subtitle);
      const subjectText = subtitleText || whatStr;
      const previewLooksBroken =
        /(?:Cannot access|ReferenceError|TypeError|SyntaxError|is not defined|Cannot read properties)/i.test(
          rawPreviewBody
        );
      const previewBody =
        !previewLooksBroken &&
        rawPreviewBody &&
        rawPreviewBody !== subjectText &&
        !rawPreviewBody.startsWith(subjectText)
          ? rawPreviewBody
          : !previewLooksBroken && rawPreviewBody.length > subjectText.length
            ? rawPreviewBody
            : "";

      // ====== Bilageikoner: detektera enkelt från subject + preview ======
      const ATTACH_ICONS = {
        paperclip:
          '<svg class="warm-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
        image:
          '<svg class="warm-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        pdf: '<svg class="warm-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      };
      const attachHaystack = (subjectText + " " + rawPreviewBody).toLowerCase();
      const attachIconsArr = [];
      if (
        /\.pdf|signerad kopia|bifogad|undertecknats|avtal|kvitto|faktura|offert|dokument/.test(
          attachHaystack
        )
      ) {
        attachIconsArr.push(ATTACH_ICONS.paperclip);
      }
      if (
        /\.jpe?g|\.png|\.gif|\[telefon\]|nyhetsbrev|kundcase|bild |image |screenshot/.test(
          attachHaystack
        )
      ) {
        attachIconsArr.push(ATTACH_ICONS.image);
      }
      const attachIconsMarkup = attachIconsArr.length
        ? `<span class="warm-file-icons" aria-hidden="true">${attachIconsArr.join("")}</span>`
        : "";

      const senderSubjectMarkup = `<div class="warm-line-1">
        <span class="warm-sender">${escapeHtml(senderText)}</span>
        ${subjectText ? `<span class="warm-sep" aria-hidden="true">·</span><span class="warm-subject signal-what" title="${escapeHtml(subjectText)}">${escapeHtml(subjectText)}</span>` : ""}
        ${attachIconsMarkup}
      </div>`;

      const warmPreviewMarkup = previewBody
        ? `<div class="warm-preview">${escapeHtml(previewBody)}</div>`
        : "";

      return `<!-- warm-row-v8 markup --><article data-v8-version="warm-r8" class="thread-card queue-history-item unified-queue-card warm-row${extraArticleClasses ? ` ${extraArticleClasses}` : ""}${selectedClass}${selectedArticleClass}${laneClass}${operationalClass}${unreadClass}${loadingClass}"${v5DataLane}${runtimeThreadAttribute}${worklistSourceAttribute}${worklistSourceLabelAttribute}${historyConversationAttribute}${runtimeTagsAttribute}${articleDataAttributes}${selectedState}>
        <span class="warm-rail" aria-hidden="true"></span>
        <div class="warm-top">
          <span class="lane-badge" data-lane="${escapeHtml(v5Lane)}">${escapeHtml(v5Label)}</span>
          <div class="warm-top-meta">
            ${dateMarkup}${dotSep}${stampMarkup}
          </div>
        </div>
        <div class="warm-mid">
          <div class="warm-avatar avatar-wrap">
            <span class="avatar queue-history-avatar" aria-hidden="true">${escapeHtml(avatarText)}</span>
            <span class="status-dot${unifiedModel.isUnread === true ? " new" : statusDot ? " " + escapeHtml(statusDot) : ""}" aria-hidden="true"></span>
          </div>
          <div class="warm-content">
            ${senderSubjectMarkup}
            ${warmPreviewMarkup}
            ${warmWhyMarkup}
          </div>
          <div class="warm-actions action-cluster">
            <button class="action-icon" type="button" data-quick-action="history" title="Historik" aria-label="Öppna historik">${V5_ACTION_ICONS.history}</button>
            <button class="action-icon" type="button" data-quick-action="later" title="Svara senare" aria-label="Svara senare">${V5_ACTION_ICONS.later}</button>
            <button class="action-icon" type="button" data-quick-action="schedule" title="Schemalägg uppföljning" aria-label="Schemalägg uppföljning">${V5_ACTION_ICONS.schedule}</button>
            <button class="action-icon" type="button" data-quick-action="handled" title="Markera klar" aria-label="Markera klar">${V5_ACTION_ICONS.handled}</button>
            <button class="action-icon" type="button" data-quick-action="delete" title="Radera" aria-label="Radera">${V5_ACTION_ICONS.delete}</button>
            ${laneQuickActionMarkup}
            <button class="primary-action" type="button" data-quick-action="studio" data-quick-mode="reply"${studioThreadAttr} aria-controls="studio-shell">
              ${escapeHtml(primaryLabel)}
              ${V5_ACTION_ICONS.arrowRight}
            </button>
          </div>
        </div>
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
        mailboxLabel: asText(item.mailboxLabel),
        mailboxProvenanceDetail: asText(item.mailboxProvenanceDetail),
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
        multiMailboxSubtitle: "Samma kund har skrivit från flera mejlkonton",
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
              const normalizedDirection =
                typeof normalizeKey === "function"
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
      const parseMailboxTrailFromDetail = (detail = "", source = null) => {
        // Föredrar mailboxTrail: string[] direkt från payload om backend exponerar det.
        // Annars fallback: dela detail-strängen på · / komma.
        if (source && Array.isArray(source.mailboxTrail) && source.mailboxTrail.length) {
          return source.mailboxTrail.map((part) => asText(part).trim()).filter(Boolean);
        }
        return asText(detail)
          .split(/[·,]/g)
          .map((part) => asText(part).trim())
          .filter(Boolean);
      };
      const normalizeHistoryCardModel = (source = {}) => {
        const defaultName = HISTORIK_STRINGS.unknownSender;
        const customerName = asText(source.counterpartyLabel || defaultName, defaultName);
        const deriveHistoryInitials = (label = "") => {
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
        const mailboxTrailFromPayload = asArray(source.mailboxTrail)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
        const mailboxTrailFromRollup = asArray(source.rollup?.underlyingMailboxIds)
          .map((entry) => asText(entry).trim())
          .filter(Boolean);
        const mailboxTrailFromDetail = parseMailboxTrailFromDetail(
          source.mailboxProvenanceDetail || source.rollup?.provenanceDetail || "",
          source
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
          subtitle: mailboxTrail.length > 1 ? HISTORIK_STRINGS.multiMailboxSubtitle : "",
          status,
        };
      };
      const normalizedHistoryModel = normalizeHistoryCardModel(item);
      const subjectMarkup = asText(item.title)
        ? `<p class="subject queue-history-item-subject">${escapeHtml(item.title)}</p>`
        : "";
      const operationalChipMarkup = hasOperationalSignals
        ? signalItems
            .map((signal) => {
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
            })
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
      const directionPill =
        showDirectionPill && asText(item.direction)
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
        sourcePill ||
        operationalChipMarkup ||
        mailboxPill ||
        mailboxProvenancePill ||
        directionPill ||
        queuePill
          ? `<div class="queue-history-item-meta queue-history-item-meta--fullwidth">${sourcePill}${mailboxPill}${mailboxProvenancePill}${operationalChipMarkup}${directionPill}${queuePill}</div>`
          : "";

      const unreadClass = item.isUnread === true ? " queue-history-item--unread" : "";
      const loadingClass = item.loading === true ? " is-loading" : "";
      const freshnessMarkup =
        item.isUnread === true
          ? '<span class="queue-history-item-freshness" aria-label="Nytt oläst mejl"><span class="queue-history-item-freshness-dot"></span></span>'
          : "";

      // Historik ska alltid använda full v3-kortmarkup (ingen legacy compact-render).

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
            const leadPattern = new RegExp(
              `^${escapeHistoryRegExp(lead)}(?:\\s*[-:|,–—]\\s*|\\s+)`,
              "i"
            );
            cleaned = cleaned.replace(leadPattern, "").trim();
          });
        return cleaned;
      };
      const rawHistoryTitle = asText(item.title);
      const derivedHistoryTitle = stripRepeatedHistoryLead(rawHistoryTitle, [counterpartyCopy]);
      const primaryHistoryTitleRaw =
        derivedHistoryTitle &&
        normalizeHistoryCompareValue(derivedHistoryTitle) !==
          normalizeHistoryCompareValue(counterpartyCopy)
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
      pushHistorySignal(
        "mailbox",
        item.mailboxLabel,
        mailboxMeta.icon,
        "queue-history-pill--mailbox"
      );
      pushHistorySignal(
        "source",
        worklistSourceLabel,
        "layers",
        worklistSourceLabel ? "queue-history-pill--source" : ""
      );
      if (!signalItems.length) {
        pushHistorySignal(
          "what",
          item.direction,
          directionMeta.icon,
          "queue-history-operational-pill--what"
        );
        pushHistorySignal(
          "why",
          worklistSourceLabel,
          "layers",
          "queue-history-operational-pill--why"
        );
        pushHistorySignal(
          "next",
          item.queueLabel,
          "layers",
          "queue-history-operational-pill--next"
        );
      }
      const whatSignalValue = asText(
        asArray(item.signalItems).find(
          (signal) => normalizeKey(signal?.role || signal?.tone) === "what"
        )?.value
      );
      const inlineContextHint = asText(
        item.inlineContext || item.queueInlineContext || item.presentation?.inlineContext
      );
      const inlineContextLabel = compactRuntimeCopy(
        inlineContextHint || whatSignalValue || asText(item.intentLabel) || primaryHistoryTitle,
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
          item.explanatoryLine || item.queueExplanatoryLine || item.presentation?.explanatoryLine
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
      while (
        /^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i.test(
          secondaryContextFallback
        )
      ) {
        secondaryContextFallback = secondaryContextFallback
          .replace(/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
          .trim();
      }
      secondaryContextFallback = secondaryContextFallback.replace(/^[,.;:-]+\s*/g, "").trim();
      const snippetValue = explanatoryLineHint
        ? explanatoryLineHint
        : compactRuntimeCopy(asText(secondaryContextFallback), "", 120);
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
              ? "Historiken hålls ihop, men varje meddelande visar sin mejlkontoproveniens."
              : "")
        ),
        "",
        160
      );
      const relationshipChipValue =
        normalizedHistoryModel.mailboxTrail.length > 1 ? HISTORIK_STRINGS.multiMailboxSubtitle : "";
      const priorityChipValue = asText(
        historySignals.find((signal) => signal.role === "why")?.value ||
          item.intentLabel ||
          "Behöver uppmärksamhet"
      );
      const actionChipValue = asText(
        historySignals.find((signal) => signal.role === "next")?.value ||
          item.nextActionLabel ||
          "Fortsätt från samma"
      );
      const footerChips = [
        {
          key: "category",
          value: asText(item.mailboxLabel) || HISTORIK_STRINGS.defaultCategory,
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
      const mapHistoryModel =
        typeof unifiedCardModelFromHistoryItem === "function"
          ? unifiedCardModelFromHistoryItem
          : (historyItem = {}, v3Model = {}) => ({
              counterpartyLabel: v3Model.counterpartyCopy,
              customerInitials: v3Model.avatarText,
              mailboxTrail: asArray(v3Model.mailboxTrail),
              subtitle: asText(v3Model.subtitle),
              laneId: historyItem.laneId,
              ownerLabel: historyItem.ownerLabel,
              tags: historyItem.tags,
              signalItems: asArray(historyItem.signalItems),
              statusDot: asText(v3Model.statusDot),
              previewLine: asText(v3Model.previewLine),
              explanatoryLine: asText(v3Model.explanatoryLine),
              secondarySnippet: asText(v3Model.secondarySnippet),
              footerChips: asArray(v3Model.footerChips),
              hasOperationalSignals: Boolean(v3Model.hasOperationalSignals),
              isUnread: historyItem.isUnread,
              loading: historyItem.loading,
              mailboxLabel: asText(historyItem.mailboxLabel),
              mailboxProvenanceDetail: asText(historyItem.mailboxProvenanceDetail),
              time: historyItem.time,
              recordedAt: historyItem.recordedAt,
              stampLabel: asText(v3Model.stampLabel),
            });
      const unifiedModel = mapHistoryModel(item, {
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
      if (typeof buildUnifiedCardMarkup === "function") {
        return buildUnifiedCardMarkup(unifiedModel, {
          runtimeThreadId,
          conversationId,
          selectedConversationId,
          worklistSource,
          worklistSourceLabel,
          skipNormalizeCardContent: true,
        });
      }
      const selectedClassFallback = isSelected ? " is-selected" : "";
      const selectedStateFallback = isSelected
        ? ' aria-current="true" data-history-selected="true"'
        : ' aria-current="false"';
      const stampLabelFallback = runtimeThreadId && worklistSource === "legacy" ? "" : stampLabel;
      const detailText = asText(item.detail)
        .replace(
          /^Från:\s*[\s\S]*?(?=(?:E-post|Email|Epost|Telefon|Phone)\s*:|Hur kan vi hjälpa dig|How can we help you\?)/i,
          ""
        )
        .replace(/(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const customerContextCopy = asText(normalizedHistoryModel.customerName, item.customerName);
      const issuePrimary = compactRuntimeCopy(
        asText(item.title).replace(
          new RegExp(
            `^${asText(normalizedHistoryModel.customerName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
            "i"
          ),
          ""
        ),
        asText(item.title),
        48
      );
      const whatSignal =
        asArray(signalItems).find(
          (signal) => normalizeKey(signal.role || signal.tone || "") === "what"
        ) || null;
      const whySignal =
        asArray(signalItems).find(
          (signal) => normalizeKey(signal.role || signal.tone || "") === "why"
        ) || null;
      const nextSignal =
        asArray(signalItems).find(
          (signal) => normalizeKey(signal.role || signal.tone || "") === "next"
        ) || null;
      const whatValue = asText(whatSignal?.value || item.intentLabel || issuePrimary);
      const whyRawValue = asText(whySignal?.value || "Behöver svar");
      const shouldEmphasizeWhyNow =
        normalizeKey(worklistSource) === "truth_primary" ||
        normalizeKey(item.laneId || "") === "act_now";
      const whyValue =
        shouldEmphasizeWhyNow && /beh(o|ö)ver svar|svar kr(a|ä)vs/i.test(whyRawValue)
          ? "Svar krävs nu"
          : whyRawValue;
      const nextValue = asText(nextSignal?.value || item.nextActionLabel || "Svara nu");
      const queueMetaPills = [
        {
          cls: "queue-history-pill--mailbox",
          icon: "mail",
          value: asText(item.mailboxLabel, "Kons"),
        },
        {
          cls: "queue-history-pill--provenance",
          icon: "layers",
          value: asText(item.mailboxProvenanceLabel),
        },
        {
          cls: "queue-history-pill--source",
          icon: "link",
          value: asText(worklistSourceLabel || worklistSource),
        },
      ]
        .filter((pill) => asText(pill.value))
        .map(
          (pill) =>
            `<span class="queue-history-pill ${pill.cls}" data-pill-icon="${pill.icon}">${escapeHtml(pill.value)}</span>`
        )
        .join("");
      return `<article class="thread-card queue-history-item${selectedClassFallback}"${runtimeThreadAttribute}${historyConversationAttribute}${worklistSourceAttribute}${worklistSourceLabelAttribute}${selectedStateFallback}>
        <div class="thread-card-head">
          <div class="thread-card-identity">
            <span class="avatar queue-history-avatar" aria-hidden="true">${escapeHtml(normalizedHistoryModel.customerInitials)}</span>
            <div class="thread-card-head-copy">
              <div class="thread-heading thread-heading-merged">
                <p class="thread-subject queue-history-item-subject"><span class="thread-subject-primary">${escapeHtml(issuePrimary)}</span>${customerContextCopy ? `<span class="thread-subject-context">${escapeHtml(customerContextCopy)}</span>` : ""}</p>
              </div>
              <p class="thread-story thread-story-secondary-muted"><span class="thread-story-context">${escapeHtml(whatValue)}</span></p>
              ${detailText ? `<p class="queue-history-item-text-snippet">${escapeHtml(detailText)}</p>` : ""}
            </div>
          </div>
          <div class="thread-card-stamp queue-history-item-freshness">
            <span class="queue-history-item-freshness-dot"></span>
            <div class="queue-history-item-meta">
              ${item.time ? `<time datetime="${escapeHtml(item.recordedAt || "")}">${escapeHtml(item.time)}</time>` : ""}
              ${stampLabelFallback ? `<span class="thread-owner">${escapeHtml(stampLabelFallback)}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="thread-support-stack">
          <div class="thread-intelligence-row">
            <span class="thread-intelligence-item thread-intelligence-item--what queue-history-operational-pill--what" data-pill-icon="layers">${escapeHtml(whatValue)}</span>
            <span class="thread-intelligence-item thread-intelligence-item--why queue-history-operational-pill--why" data-pill-icon="clock">${escapeHtml(whyValue)}</span>
            <span class="thread-intelligence-item thread-intelligence-item--next queue-history-operational-pill--next" data-pill-icon="bolt">${escapeHtml(nextValue)}</span>
          </div>
          <div class="queue-history-item-meta">${queueMetaPills}</div>
        </div>
      </article>`;
    }

    function buildQueueInlineLaneHistoryItem(thread) {
      const primaryLaneId = normalizeKey(thread?.primaryLaneId || "");
      const counterpartyLabel = asText(thread.customerName, "Okänd avsändare");
      const mailboxLabel = asText(thread.mailboxLabel || thread.mailboxAddress, "Arbetskö");
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
      const escapeRegex = (value = "") => asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
          cleaned = cleaned
            .replace(/^(?:E-post|Email|Epost|Telefon|Phone)\s*:\s*(?:\[[^\]]+\]|\S+)\s*/i, "")
            .trim();
        }
        if (
          /\b(?:qa|cco|live|inspect|verify|verification|reply|send|sandbox|fixture)\b/i.test(
            titleValue || rawTitle
          )
        ) {
          cleaned = cleaned
            .replace(/^(?=[A-Za-zÅÄÖåäö0-9_\-[\]()]*[-_[\]])[A-Za-zÅÄÖåäö0-9_\-[\]()]{6,}\s+/, "")
            .trim();
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
      const cleanedFocus = sanitizeIssueDetail(
        thread?.whyInFocus || thread?.raw?.operatorCue,
        cleanedSubject
      );
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
        title =
          subjectSummary || compactRuntimeCopy(cleanedPreview, cleanedSubject || rawTitle, 68);
        titleSource = title ? "fallback" : "";
      }
      if (
        isSyntheticFallbackTitle(title) ||
        (isGenericTitle(title) && isPlaceholderDetail(cleanedPreview))
      ) {
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
          ? "Samma kund har skrivit från flera mejlkonton"
          : "";
      const defaultRollupExplanatoryLine =
        thread?.rollup?.enabled === true && Number(thread?.rollup?.mailboxCount || 0) > 1
          ? "Historiken hålls ihop, men varje meddelande visar sin mejlkontoproveniens."
          : "";
      const resolvedTitle = inlineContextHint || title || "Aktiv tråd";
      const finalDetail = explanatoryLineHint || defaultRollupExplanatoryLine || resolvedDetail;
      const parseInlineMailboxTrail = (detail = "") =>
        asText(detail)
          .split(/[·,]/g)
          .map((part) => asText(part).trim())
          .filter(Boolean);
      const mailboxTrailFromPayload = asArray(thread.mailboxTrail)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      const mailboxTrailFromRollup = asArray(thread?.rollup?.underlyingMailboxIds)
        .map((entry) => asText(entry).trim())
        .filter(Boolean);
      const mailboxTrailFromDetail = parseInlineMailboxTrail(
        thread.mailboxProvenanceDetail || thread?.rollup?.provenanceDetail || ""
      );
      const mailboxTrail = mailboxTrailFromPayload.length
        ? mailboxTrailFromPayload
        : mailboxTrailFromRollup.length
          ? mailboxTrailFromRollup
          : mailboxTrailFromDetail;
      return {
        initials: getQueueHistoryItemInitials(thread.customerName),
        counterpartyLabel,
        conversationId: asText(thread?.conversationId || thread?.id || ""),
        ownerLabel: asText(thread.displayOwnerLabel || thread.ownerLabel || ""),
        tags: asArray(thread.tags),
        nextActionLabel: asText(thread.nextActionLabel),
        mailboxTrail,
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
              ? `${thread.rollup.mailboxCount} mejlkonton`
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
      if (normalizeKey(tag) === "aftercare") {
        return __getAftercareLaneEntries().length;
      }
      return getQueueLaneThreads(tag, threads).length;
    }

    function getSecondarySignalCount(signalKey, threads = []) {
      const activeThreads = asArray(threads).filter((thread) => !isHandledRuntimeThread(thread));
      if (!activeThreads.length) return 0;
      const normalizedSignal = normalizeKey(signalKey);
      if (normalizedSignal === "unassigned") {
        return activeThreads.filter((thread) => {
          const ownerKey = normalizeKey(thread?.ownerKey || thread?.ownerLabel || "");
          return (
            ownerKey === "unassigned" ||
            ownerKey === "oägd" ||
            asArray(thread?.tags).includes("unassigned")
          );
        }).length;
      }
      return activeThreads.filter((thread) => asArray(thread?.tags).includes(normalizedSignal))
        .length;
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
        queueActiveLaneLabel.textContent = QUEUE_LANE_LABELS[activeLaneId] || QUEUE_LANE_LABELS.all;
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
        queueActiveLaneLabel.textContent = QUEUE_LANE_LABELS[activeLaneId] || QUEUE_LANE_LABELS.all;
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
        const rawStatusLabel =
          typeof mailbox.statusLabel === "string" && mailbox.statusLabel.trim()
            ? mailbox.statusLabel.trim()
            : mailbox.custom
              ? "Eget"
              : "Aktiv";
        const statusLabel = rawStatusLabel === "Live" ? "Aktiv" : rawStatusLabel;
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
            : `Källa: ${mailbox.owner || "Aktiv"}`);
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
        selectedIds.has(normalizeMailboxId(mailbox.canonicalId || mailbox.email || mailbox.id))
      );
      const selectedCount =
        selectedMailboxes.length || (availableMailboxes.length ? availableMailboxes.length : 0);
      let compactScopeLabel = "Inga mail";
      if (!availableMailboxes.length) {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Inga mejlkonton";
        compactScopeLabel = "Inga mail";
      } else if (selectedMailboxes.length === availableMailboxes.length) {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Alla mejlkonton";
        compactScopeLabel = "Alla mail";
      } else if (selectedMailboxes.length === 1) {
        mailboxTriggerLabel.textContent = `Hair TP Clinic - ${selectedMailboxes[0].label}`;
        compactScopeLabel = compactRuntimeCopy(selectedMailboxes[0].label, "Mejlkonto", 18);
      } else if (selectedMailboxes.length > 1) {
        mailboxTriggerLabel.textContent = `Hair TP Clinic - ${selectedMailboxes[0].label} +${selectedMailboxes.length - 1}`;
        compactScopeLabel = compactRuntimeCopy(
          `${selectedMailboxes[0].label} +${selectedMailboxes.length - 1}`,
          "Valda mail",
          18
        );
      } else {
        mailboxTriggerLabel.textContent = "Hair TP Clinic - Inga mejlkonton";
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
        if (typeof enforceUnifiedCardV3Sections === "function") {
          enforceUnifiedCardV3Sections(queueHistoryList);
        }
        if (
          typeof windowObject?.requestAnimationFrame === "function" &&
          typeof enforceUnifiedCardV3Sections === "function"
        ) {
          windowObject.requestAnimationFrame(() => enforceUnifiedCardV3Sections(queueHistoryList));
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
            subject: "Hämtar aktiva trådar",
            preview: "Läser Comms, Graph och aktiv körning för nya CCO.",
            mailboxLabel: "Aktiv",
            intentLabel: "Synkar",
            statusLabel: "Synkar",
            nextActionLabel: "Vänta",
            nextActionSummary: "Vänta några sekunder medan arbetskön fylls med aktiva trådar.",
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
            customerName: state.runtime.authRequired ? "Aktiv kö ej ansluten" : "Aktiv kö pausad",
            lastActivityAt: "",
            lastActivityLabel: "Nu",
            isVIP: false,
            ownerLabel: "System",
            subject: state.runtime.authRequired
              ? "Öppna admin och logga in igen"
              : "Aktiv körning otillgänglig",
            preview: state.runtime.error,
            mailboxLabel: "CCO",
            intentLabel: state.runtime.authRequired
              ? "Åtkomst"
              : state.runtime.offline
                ? "Offline"
                : "Körning",
            statusLabel: state.runtime.authRequired ? "Session krävs" : "Otillgänglig",
            nextActionLabel: state.runtime.authRequired ? "Logga in igen" : "Försök senare",
            nextActionSummary: state.runtime.authRequired
              ? "Återställ admin-sessionen för att fylla arbetskön med aktiva trådar igen."
              : "Vänta tills aktiv körning är tillbaka eller fortsätt i offline-ytan tills dess.",
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
            ownerLabel: ownerFiltered ? "Ägarvy" : laneFiltered ? "Arbetskö" : "Mejlurval",
            subject: laneFiltered
              ? `${activeLaneLabel} har inga aktiva trådar`
              : ownerFiltered
                ? "Ägarfiltret gav inga aktiva trådar"
                : runtimeMode === "offline_history"
                  ? "Ingen historik hittades i valt mejlurval"
                  : "Mejlurvalet gav inga aktiva trådar",
            preview: laneFiltered
              ? "Byt kö i vänsterpanelen eller återgå till Alla trådar för att se fler konversationer."
              : ownerFiltered
                ? "Byt ägare eller återgå till Ägarvy för att se fler trådar."
                : runtimeMode === "offline_history"
                  ? "Den aktiva kön är offline och det finns ännu ingen sparad historik att visa i arbetsytan."
                  : "Välj fler mejlkonton eller vänta på nästa inkommande konversation.",
            mailboxLabel: "Arbetskö",
            intentLabel: runtimeMode === "offline_history" ? "Offline historik" : "Tom kö",
            statusLabel: runtimeMode === "offline_history" ? "Historik saknas" : "Ingen match",
            nextActionLabel: runtimeMode === "offline_history" ? "Byt mejlurval" : "Justera urval",
            nextActionSummary: laneFiltered
              ? "Återgå till Alla trådar eller byt kö för att hitta nästa aktiva konversation."
              : ownerFiltered
                ? "Byt ägarfilter eller återgå till Ägarvy för att läsa fler trådar."
                : runtimeMode === "offline_history"
                  ? "Välj ett annat mejlurval eller invänta att kopplingen kommer tillbaka."
                  : "Utöka mejlurvalet för att fylla arbetskön med fler konversationer.",
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
      if (typeof enforceUnifiedCardV3Sections === "function") {
        enforceUnifiedCardV3Sections(queueHistoryList);
      }
      // P0-2 (migrerad): patcha "Okänd avsändare" direkt efter render
      try {
        __scanAndFixUnknownSenders(queueHistoryList);
      } catch (_e) {}
      // P1-B (migrerad): re-applicera secondary-filter om aktivt
      try {
        __applySecondaryFilter();
      } catch (_e) {}
      // P1-C (migrerad): re-applicera sök-filter om aktivt
      try {
        __applySearchFilter();
      } catch (_e) {}
      // P2-1 (migrerad): översätt raw status-codes + rensa "undefined"
      try {
        __runAllStatusFixes(queueHistoryList);
      } catch (_e) {}
      // P1-4 (migrerad): uppdatera live-pill med nytt thread-count
      try {
        __updateLivePill();
      } catch (_e) {}
      if (typeof decorateStaticPills === "function") decorateStaticPills();
    }

    function renderQueueInlineLaneList(threads = []) {
      if (!queueHistoryList) return;
      if (queueHistoryList.dataset) {
        queueHistoryList.dataset.queueListMode = "live";
      }
      // FIX3: explicit fallback chain. Trippel-ternär hade tom-sträng-fallback
      // som producerade tomma rader när någon av build-funktionerna saknades.
      const renderLiveThreadCard = (thread, index, selected) => {
        try {
          if (typeof buildThreadCardMarkup === "function") {
            const html = buildThreadCardMarkup(thread, index, selected);
            if (html) return html;
          }
        } catch (e) {
          if (typeof console !== "undefined") console.warn("buildThreadCardMarkup failed", e);
        }
        try {
          if (
            typeof buildQueueHistoryCardMarkup === "function" &&
            typeof buildQueueInlineLaneHistoryItem === "function"
          ) {
            const html = buildQueueHistoryCardMarkup(buildQueueInlineLaneHistoryItem(thread), {
              runtimeThreadId: thread.id,
              selectedConversationId: state.runtime.selectedThreadId,
              useThreadCardClass: true,
            });
            if (html) return html;
          }
        } catch (e) {
          if (typeof console !== "undefined") console.warn("buildQueueHistoryCardMarkup failed", e);
        }
        // Sista fallback: matchar förväntad CSS-struktur (.thread-card-head + .thread-story)
        // så griden inte kollapsar och överlappar grannarna.
        const id = String(thread?.id || "").replace(/[^a-z0-9_-]/gi, "");
        const customer = (
          thread?.customerName ||
          thread?.fromName ||
          thread?.from?.name ||
          thread?.from?.emailAddress?.name ||
          (
            thread?.customerEmail ||
            thread?.from?.address ||
            thread?.from?.emailAddress?.address ||
            ""
          )?.split("@")[0] ||
          "Okänd avsändare"
        )
          .toString()
          .slice(0, 80);
        const subject = String(thread?.displaySubject || thread?.subject || "(utan ämne)").slice(
          0,
          120
        );
        const preview = String(thread?.preview || thread?.systemPreview || "").slice(0, 200);
        const escape = (s) =>
          String(s).replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
          );
        return (
          '<article class="thread-card queue-history-item unified-queue-card" ' +
          'data-runtime-thread="' +
          id +
          '" tabindex="0" ' +
          'style="position:relative;display:block;min-height:64px;padding:12px 14px;margin:0">' +
          '<div class="thread-card-head" style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">' +
          '<strong style="font-size:14px;color:#2b251f">' +
          escape(customer) +
          "</strong>" +
          '<span style="font-size:12px;color:#8a8174">' +
          escape(subject) +
          "</span>" +
          "</div>" +
          '<div class="thread-story" style="font-size:12px;color:#5d544a;overflow:hidden;text-overflow:ellipsis">' +
          escape(preview) +
          "</div></article>"
        );
      };
      queueHistoryList.innerHTML = asArray(threads)
        .map((thread, index) =>
          renderLiveThreadCard(thread, index, thread.id === state.runtime.selectedThreadId)
        )
        .join("");
      if (typeof enforceUnifiedCardV3Sections === "function") {
        enforceUnifiedCardV3Sections(queueHistoryList);
      }
      // P0-2 (migrerad): patcha "Okänd avsändare" direkt efter render
      try {
        __scanAndFixUnknownSenders(queueHistoryList);
      } catch (_e) {}
      // P1-B (migrerad): re-applicera secondary-filter om aktivt
      try {
        __applySecondaryFilter();
      } catch (_e) {}
      // P1-C (migrerad): re-applicera sök-filter om aktivt
      try {
        __applySearchFilter();
      } catch (_e) {}
      // P2-1 (migrerad): översätt raw status-codes + rensa "undefined"
      try {
        __runAllStatusFixes(queueHistoryList);
      } catch (_e) {}
      // P1-4 (migrerad): uppdatera live-pill med nytt thread-count
      try {
        __updateLivePill();
      } catch (_e) {}
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
        id: asText(
          id,
          `runtime-state-${normalizeKey(customerName || subject || "item") || "item"}`
        ),
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
              const activeLaneId = normalizeKey(state.runtime.activeLaneId || "all") || "all";
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

      if (!isOpen) {
        if (typeof enforceUnifiedCardV3Sections === "function") {
          enforceUnifiedCardV3Sections(queueHistoryList);
        }
        return;
      }

      if (isHistoryOpen) {
        const fallbackThreads = getQueueLaneThreads("all", getQueueScopedRuntimeThreads());
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "history";
        }
        if (queueTitle) {
          queueTitle.textContent = `Historik (${asArray(historyState.items).length})`;
        }

        if (historyState.loading) {
          if (fallbackThreads.length) {
            renderQueueInlineLaneList(fallbackThreads);
          } else {
            renderQueueHistoryList([]);
            if (queueHistoryList) {
              queueHistoryList.innerHTML =
                '<div class="queue-history-empty">Laddar historik…</div>';
            }
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        if (historyState.error) {
          if (fallbackThreads.length) {
            renderQueueInlineLaneList(fallbackThreads);
          } else if (queueHistoryList) {
            queueHistoryList.innerHTML = `<div class="queue-history-empty">${escapeHtml(
              historyState.error
            )}</div>`;
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        if (!asArray(historyState.items).length) {
          if (fallbackThreads.length) {
            renderQueueInlineLaneList(fallbackThreads);
          } else if (queueHistoryList) {
            queueHistoryList.innerHTML =
              '<div class="queue-history-empty">Ingen historik hittades i valt mejlurval ännu.</div>';
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }

        renderQueueHistoryList(historyState.items);
        if (typeof enforceUnifiedCardV3Sections === "function") {
          enforceUnifiedCardV3Sections(queueHistoryList);
        }
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
          if (typeof enforceUnifiedCardV3Sections === "function") {
            enforceUnifiedCardV3Sections(queueHistoryList);
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }
        // v5: ingen riktig data i scope men kanske demo-fixtures utanför scope?
        const demoFixtures = asArray(state.runtime.threads).filter(
          (t) => asText(t?.worklistSource) === "demo"
        );
        if (demoFixtures.length) {
          if (queueTitle) {
            queueTitle.textContent = `Arbetslista (${demoFixtures.length})`;
          }
          renderQueueInlineLaneList(demoFixtures);
          if (typeof enforceUnifiedCardV3Sections === "function") {
            enforceUnifiedCardV3Sections(queueHistoryList);
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }
        if (queueTitle) {
          queueTitle.textContent = "Arbetslista (0)";
        }
        renderQueueInlineLaneList(buildUnifiedQueueLoadingItems());
        if (typeof enforceUnifiedCardV3Sections === "function") {
          enforceUnifiedCardV3Sections(queueHistoryList);
        }
        if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
        return;
      }

      if (useUnifiedQueueList && state.runtime.error && runtimeMode !== "offline_history") {
        // v5: om demo-fixtures finns, visa dem istället för error-fallback så
        // operatören ser v5-layouten med riktiga lane-badges, What/Why osv.
        const demoFixtures = asArray(state.runtime.threads).filter(
          (t) => asText(t?.worklistSource) === "demo"
        );
        if (demoFixtures.length) {
          if (queueHistoryList?.dataset) {
            queueHistoryList.dataset.queueListMode = "live";
          }
          if (queueTitle) {
            queueTitle.textContent = `Arbetslista (${demoFixtures.length})`;
          }
          renderQueueInlineLaneList(demoFixtures);
          if (typeof enforceUnifiedCardV3Sections === "function") {
            enforceUnifiedCardV3Sections(queueHistoryList);
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }
        if (queueHistoryList?.dataset) {
          queueHistoryList.dataset.queueListMode = "live";
        }
        if (queueTitle) {
          queueTitle.textContent = "Arbetslista (0)";
        }
        renderQueueInlineLaneList([
          buildUnifiedStateThread({
            id: "runtime-unified-error",
            customerName: state.runtime.authRequired ? "Aktiv kö ej ansluten" : "Aktiv kö pausad",
            ownerLabel: "System",
            subject: state.runtime.authRequired
              ? "Öppna admin och logga in igen"
              : "Aktiv körning otillgänglig",
            preview: state.runtime.error,
            mailboxLabel: "CCO",
            statusLabel: state.runtime.authRequired ? "Session krävs" : "Otillgänglig",
            nextActionLabel: state.runtime.authRequired ? "Logga in igen" : "Försök senare",
            nextActionSummary: state.runtime.authRequired
              ? "Återställ admin-sessionen för att fylla arbetskön med aktiva trådar igen."
              : "Vänta tills aktiv körning är tillbaka eller fortsätt i offline-ytan tills dess.",
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
              preview: "Byt kategori eller mejlurval för att se fler trådar i vänsterkolumnen.",
              mailboxLabel: feedLabel,
              statusLabel: "Ingen match",
              nextActionLabel: "Byt kategori",
              nextActionSummary: "Byt kategori eller mejlurval för att hitta nästa relevanta mejl.",
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
        if (laneId === "aftercare") {
          const aftercareEntries = __getAftercareLaneEntries({ limit: 12 });
          if (queueTitle) {
            queueTitle.textContent = `${QUEUE_LANE_LABELS.aftercare || "Eftervård"} (${aftercareEntries.length})`;
          }
          if (!aftercareEntries.length) {
            renderQueueInlineLaneList([
              buildUnifiedStateThread({
                id: "runtime-lane-empty-aftercare",
                customerName: "Inga eftervårdsärenden i kö",
                ownerLabel: "Eftervård",
                subject: "Eftervårdslanen är lugn just nu",
                preview:
                  "När uppföljningar blir förfallna, planerade för idag eller behöver klinisk eskalering syns de här först.",
                mailboxLabel: "Eftervård",
                statusLabel: "Ingen aktiv kö",
                nextActionLabel: "Övervaka",
                nextActionSummary:
                  "Fortsätt i övriga arbetsköer tills nya eftervårdsärenden kliver upp i prioritet.",
              }),
            ]);
          } else {
            __renderAftercareLaneList(aftercareEntries);
          }
          if (queueHistoryLoadMoreButton) queueHistoryLoadMoreButton.hidden = true;
          return;
        }
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
              preview:
                "Byt kö i vänsterpanelen eller återgå till Alla trådar för att se fler konversationer.",
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
          if (runtimeMode === "offline_history") {
            if (queueHistoryList) {
              queueHistoryList.innerHTML = `<div class="queue-history-empty">${escapeHtml(
                offlineEmptyMessage || "Ingen lokal historik hittades i valt mejlurval ännu."
              )}</div>`;
            }
          } else {
            renderQueueInlineLaneList([
              buildUnifiedStateThread({
                id: "runtime-unified-empty",
                customerName: "Inga trådar i urvalet",
                ownerLabel: "Arbetskö",
                subject: "Mejlurvalet gav inga aktiva trådar",
                preview: (() => {
                  let live = "Välj fler mejlkonton eller vänta på nästa inkommande konversation.";
                  if (state.runtime?.graphReadEnabled === true) {
                    live +=
                      " Tom kö direkt efter testmail är ofta normalt — ge det en minut och ladda om.";
                  }
                  if (
                    state.runtime?.graphReadEnabled === true &&
                    state.runtime?.graphReadConnectorAvailable === false
                  ) {
                    live +=
                      " Servern saknar aktiv Graph read-connector trots att read är påslaget — kontrollera miljövariabler.";
                  }
                  return live;
                })(),
                mailboxLabel: "Arbetskö",
                statusLabel: "Ingen match",
                nextActionLabel: "Justera urval",
                nextActionSummary:
                  "Utöka mejlurvalet för att fylla arbetskön med fler konversationer.",
              }),
            ]);
          }
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
      return (
        threads.find((thread) => normalizeKey(thread.id) === selectedKey) || threads[0] || null
      );
    }

    function updateMailFeedMetrics(feedKey, threads) {
      const normalizedFeed = normalizeKey(feedKey);
      if (normalizedFeed === "later") {
        if (laterMetricValueNodes.count) {
          laterMetricValueNodes.count.textContent = String(threads.length);
        }
        if (laterMetricValueNodes.vip) {
          laterMetricValueNodes.vip.textContent = String(
            threads.filter((thread) => thread.isVIP).length
          );
        }
        const nextResumeIso = threads
          .map((thread) =>
            toIso(thread?.raw?.followUpDueAt || thread?.raw?.followUpSuggestedAt || "")
          )
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
          sentMetricValueNodes.vip.textContent = String(
            threads.filter((thread) => thread.isVIP).length
          );
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
          meta: "CCO körning",
          copy: "Logga in igen i admin för att läsa aktiv data i denna vy.",
          scope: `${mailboxScopeCount} mejlkonton`,
          context: "Åtkomst krävs",
          hint: "Öppna admin och logga in igen.",
        };
      }
      if (runtimeMode === "offline_history") {
        return {
          label: normalizedFeed === "later" ? "Senare" : "Skickade",
          title: "Offline historikläge",
          meta: "CCO historik",
          copy: "Den aktiva kön är offline. Den här vyn visar bara sådant som kan härledas från sparad historik.",
          scope: `${mailboxScopeCount} mejlkonton`,
          context: "Historikstöd",
          hint: "Återgå till arbetskön eller invänta att kopplingen kommer tillbaka.",
        };
      }
      if (state.runtime.error && !state.runtime.live) {
        return {
          label: normalizedFeed === "later" ? "Senare" : "Skickade",
          title: "Aktiv körning saknas",
          meta: "CCO körning",
          copy: state.runtime.error,
          scope: `${mailboxScopeCount} mejlkonton`,
          context: "Otillgänglig",
          hint: "Försök igen när aktiv körning är tillbaka.",
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
            : "Skickade trådar visas här när senaste aktiviteten i urvalet kommer från CCO.",
        scope: `${mailboxScopeCount} mejlkonton`,
        context: "Aktivt urval",
        hint:
          normalizedFeed === "later"
            ? "Ändra mejlurval eller svara senare i svarsstudion för att fylla vyn."
            : "Ändra mejlurval eller skicka från svarsstudion för att fylla vyn.",
      };
    }

    function renderMailFeeds() {
      mailFeedFilterButtons.forEach((button) => {
        const feedKey = normalizeKey(button.dataset.mailFeedFilter);
        const isActive =
          normalizeKey(button.dataset.mailFeedFilterValue) ===
          getMailFeedRuntimeState(feedKey).filter;
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
            visibleKeys.length > 0 &&
            visibleKeys.every((key) => runtime.selectedKeys.includes(key));
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
