"use strict";

(function initBookingMobileCalendarDay() {
  const MQ_MOBILE = "(max-width: 768px)";
  const MQ_TABLET = "(min-width: 768px) and (max-width: 1023px)";
  const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

  let sheetEl = null;
  let listEl = null;
  let titleEl = null;
  let monthLabelEl = null;
  let gridEl = null;
  let open = false;
  let viewYear = null;
  let viewMonth = null;
  let selectedIso = "";
  let monthSlotsByDate = new Map();
  let selectedSlot = null;

  function isMobile() {
    try {
      return window.matchMedia(MQ_MOBILE).matches;
    } catch {
      return false;
    }
  }

  function isTablet() {
    try {
      return window.matchMedia(MQ_TABLET).matches;
    } catch {
      return false;
    }
  }

  function isCalendarViewport() {
    return isMobile() || isTablet();
  }

  function todayIso() {
    // Lokal-datum — speglar shared.todayIso (UTC-fix 2026-05-27).
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function parseIsoDate(iso) {
    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
    };
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function ensureViewMonth(iso) {
    const parts = parseIsoDate(iso || todayIso());
    if (!parts) return;
    viewYear = parts.year;
    viewMonth = parts.month;
    selectedIso = isoFromParts(parts.year, parts.month, parts.day);
  }

  function monthRange(year, month) {
    const first = isoFromParts(year, month, 1);
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const last = isoFromParts(year, month, lastDay);
    return { first, last, lastDay };
  }

  function formatTimeLabel(isoOrTime) {
    const text = String(isoOrTime || "").trim();
    if (!text) return "";
    if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDayTitle(isoDate) {
    const date = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "Dagens bokningar";
    return date.toLocaleDateString("sv-SE", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  function formatMonthTitle(year, month) {
    const date = new Date(Date.UTC(year, month, 1, 12));
    const label = date.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function slotIsoDate(slot) {
    const raw = slot?.startAt || slot?.startsAt || slot?.start || slot?.date || "";
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function ensureSheet() {
    if (sheetEl) return sheetEl;
    sheetEl = document.createElement("div");
    sheetEl.id = "cco-mobile-calendar-sheet";
    sheetEl.className = "cco-mobile-calendar-sheet";
    sheetEl.hidden = true;
    sheetEl.innerHTML = `
      <button type="button" class="cco-mobile-calendar-backdrop" data-calendar-close aria-label="Stäng"></button>
      <div class="cco-mobile-calendar-panel" role="dialog" aria-modal="true" aria-labelledby="cco-mobile-calendar-title">
        <header class="cco-mobile-calendar-head">
          <div class="cco-mobile-calendar-head-main">
            <span class="cco-mobile-calendar-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16"><rect x="2.6" y="3.4" width="10.8" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.2 2.4v2M10.8 2.4v2M2.7 6.4h10.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.3"/></svg>
            </span>
            <div>
              <p class="cco-mobile-calendar-kicker">Kalender</p>
              <h2 id="cco-mobile-calendar-title">Dagens bokningar</h2>
            </div>
          </div>
          <button type="button" class="cco-mobile-calendar-close" data-calendar-close aria-label="Stäng">✕</button>
        </header>
        <div class="cco-mobile-calendar-month" data-calendar-month>
          <div class="cco-mobile-calendar-month-nav">
            <button type="button" class="cco-mobile-calendar-nav-btn" data-calendar-prev-month aria-label="Föregående månad">‹</button>
            <p class="cco-mobile-calendar-month-label" data-calendar-month-label></p>
            <button type="button" class="cco-mobile-calendar-nav-btn" data-calendar-next-month aria-label="Nästa månad">›</button>
          </div>
          <button type="button" class="cco-mobile-calendar-today" data-calendar-today>Idag</button>
          <div class="cco-mobile-calendar-weekdays" aria-hidden="true">
            ${WEEKDAYS.map((label) => `<span>${label}</span>`).join("")}
          </div>
          <div class="cco-mobile-calendar-grid" data-calendar-grid role="grid" aria-label="Månadsvy"></div>
        </div>
        <div class="cco-mobile-calendar-next" data-calendar-next hidden></div>
        <ul class="cco-mobile-calendar-list" data-calendar-list aria-label="Tider för vald dag"></ul>
        <section class="cco-mobile-calendar-detail" data-calendar-detail hidden aria-label="Vald tid">
          <button type="button" class="cco-mobile-calendar-detail-back" data-calendar-detail-back>‹ Tillbaka</button>
          <div class="cco-mobile-calendar-detail-head">
            <strong data-calendar-detail-title>—</strong>
            <span class="cco-mobile-calendar-detail-status" data-calendar-detail-status>—</span>
          </div>
          <p class="cco-mobile-calendar-detail-sub" data-calendar-detail-sub></p>
          <div class="cco-mobile-calendar-detail-reco" data-calendar-detail-reco hidden>
            <span>Rekommenderat drag</span>
            <strong data-calendar-detail-reco-title>—</strong>
            <p data-calendar-detail-reco-copy>—</p>
          </div>
          <ul class="cco-mobile-calendar-detail-signals" data-calendar-detail-signals></ul>
          <div class="cco-mobile-calendar-detail-actions">
            <button type="button" class="customers-utility-button cco-mobile-cal-studio" data-calendar-detail-action="studio">Svarstudio</button>
            <button type="button" class="customers-utility-button" data-calendar-detail-action="note">Smart anteckning</button>
            <button type="button" class="customers-utility-button" data-calendar-detail-action="case">Bokningsärende</button>
          </div>
        </section>
        <footer class="cco-mobile-calendar-foot">
          <button type="button" class="customers-utility-button cco-mobile-calendar-book" data-calendar-book>
            Ny bokning
          </button>
        </footer>
      </div>
    `;
    document.body.appendChild(sheetEl);
    titleEl = sheetEl.querySelector("#cco-mobile-calendar-title");
    listEl = sheetEl.querySelector("[data-calendar-list]");
    monthLabelEl = sheetEl.querySelector("[data-calendar-month-label]");
    gridEl = sheetEl.querySelector("[data-calendar-grid]");

    sheetEl.querySelectorAll("[data-calendar-close]").forEach((node) => {
      node.addEventListener("click", () => setOpen(false));
    });
    sheetEl.querySelector("[data-calendar-book]")?.addEventListener("click", () => {
      setOpen(false);
      window.ArcanaMobileShell?.navigateToBooking?.();
    });
    sheetEl
      .querySelector("[data-calendar-prev-month]")
      ?.addEventListener("click", () => shiftMonth(-1));
    sheetEl
      .querySelector("[data-calendar-next-month]")
      ?.addEventListener("click", () => shiftMonth(1));
    sheetEl.querySelector("[data-calendar-today]")?.addEventListener("click", () => {
      ensureViewMonth(todayIso());
      void refresh();
    });

    sheetEl
      .querySelector("[data-calendar-detail-back]")
      ?.addEventListener("click", () => closeSlotDetail());
    sheetEl.querySelectorAll("[data-calendar-detail-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-calendar-detail-action");
        const slot = selectedSlot;
        if (!slot) return;
        const actions = window.ArcanaBookingCalendarActions;
        const payload = slot.bookingCaseSnapshot || slot;
        setOpen(false);
        if (action === "studio") actions?.openStudioForBooking?.(payload);
        else if (action === "note") actions?.openNoteForBooking?.(payload);
        else actions?.openBookingCase?.(payload);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !open) return;
      if (selectedSlot) closeSlotDetail();
      else setOpen(false);
    });

    ensureViewMonth(todayIso());
    return sheetEl;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function shiftMonth(delta) {
    if (viewYear == null || viewMonth == null) ensureViewMonth(todayIso());
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    viewYear = next.getUTCFullYear();
    viewMonth = next.getUTCMonth();
    void refresh();
  }

  function buildMonthCells(year, month) {
    const { lastDay } = monthRange(year, month);
    const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ empty: true });
    }
    for (let day = 1; day <= lastDay; day += 1) {
      cells.push({ empty: false, iso: isoFromParts(year, month, day), day });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ empty: true });
    }
    return cells;
  }

  function renderMonthGrid() {
    if (!gridEl || viewYear == null || viewMonth == null) return;
    if (monthLabelEl) monthLabelEl.textContent = formatMonthTitle(viewYear, viewMonth);
    const today = todayIso();
    const cells = buildMonthCells(viewYear, viewMonth);
    gridEl.innerHTML = cells
      .map((cell) => {
        if (cell.empty) {
          return '<span class="cco-mobile-calendar-day is-empty" aria-hidden="true"></span>';
        }
        const iso = cell.iso;
        const daySlots = monthSlotsByDate.get(iso) || [];
        const booked = daySlots.filter((slot) => slot?.kind === "booked").length;
        const available = daySlots.filter((slot) => slot?.kind === "available").length;
        const isToday = iso === today;
        const isSelected = iso === selectedIso;
        const classes = [
          "cco-mobile-calendar-day",
          isToday ? "is-today" : "",
          isSelected ? "is-selected" : "",
          available ? "has-available" : "",
          booked ? "has-booked" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const badge =
          booked > 0
            ? `<span class="cco-mobile-calendar-day-badge booked">${booked}</span>`
            : available > 0
              ? `<span class="cco-mobile-calendar-day-badge">${available > 9 ? "9+" : available}</span>`
              : "";
        return `<button type="button" class="${classes}" data-calendar-day="${escapeAttr(iso)}" aria-pressed="${isSelected ? "true" : "false"}" aria-label="${escapeAttr(formatDayTitle(iso))}">
          <span class="cco-mobile-calendar-day-num">${cell.day}</span>
          ${badge}
        </button>`;
      })
      .join("");

    gridEl.querySelectorAll("[data-calendar-day]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedIso = button.getAttribute("data-calendar-day") || todayIso();
        renderMonthGrid();
        void renderSelectedDay();
      });
    });
  }

  function renderSlotRows(slots, isoDate) {
    if (!listEl) return;
    const shared = window.ArcanaBookingCalendarShared;
    if (!slots.length) {
      listEl.innerHTML = `<li class="cco-mobile-calendar-empty">Inga tider ${isoDate === todayIso() ? "idag" : "denna dag"}. Tryck Ny bokning för att lägga in en tid.</li>`;
      return;
    }

    listEl.innerHTML = slots
      .map((slot) => {
        if (shared?.renderEventCard) {
          return `<li class="cco-mobile-calendar-item">${shared.renderEventCard(slot, { compact: true })}</li>`;
        }
        const time = formatTimeLabel(
          slot.startAt || slot.startsAt || slot.start || slot.time || slot.label
        );
        const title =
          slot.customerName || slot.title || slot.serviceLabel || slot.service || "Bokning";
        const meta = slot.resourceLabel || slot.resource || slot.status || "";
        return `<li class="cco-mobile-calendar-item">
          <button type="button" class="cco-mobile-calendar-item-button" data-calendar-slot="${escapeAttr(JSON.stringify(slot))}">
            <span class="cco-mobile-calendar-time">${escapeHtml(time || "—")}</span>
            <span class="cco-mobile-calendar-copy">
              <strong>${escapeHtml(title)}</strong>
              ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
            </span>
          </button>
        </li>`;
      })
      .join("");

    listEl.querySelectorAll("[data-cal-event], [data-calendar-slot]").forEach((button) => {
      button.addEventListener("click", () => {
        let event = null;
        try {
          event = JSON.parse(
            button.getAttribute("data-cal-event") ||
              button.getAttribute("data-calendar-slot") ||
              "{}"
          );
        } catch {
          event = null;
        }
        const actions = window.ArcanaBookingCalendarActions;
        if (event?.kind === "booked") {
          // R8: visa smart detalj (Svarstudio/Smart anteckning/nästa steg)
          // istället för att direkt lämna kalendern.
          openSlotDetail(event);
          return;
        }
        if (event?.kind === "available") {
          setOpen(false);
          actions?.openNewBookingFromSlot?.(event);
          return;
        }
        setOpen(false);
        window.ArcanaMobileShell?.navigateToBooking?.();
      });
    });
  }

  function renderNextAvailable(slots) {
    const nextEl = sheetEl?.querySelector("[data-calendar-next]");
    if (!nextEl) return;
    const next = slots.find((slot) => slot?.kind === "available") || slots[0];
    if (!next) {
      nextEl.hidden = true;
      return;
    }
    const time = formatTimeLabel(
      next.startAt || next.startsAt || next.start || next.time || next.label
    );
    nextEl.hidden = false;
    nextEl.innerHTML = `<strong>Nästa tid:</strong> ${escapeHtml(time || "Se bokningsflödet")}`;
  }

  // R8: smart detalj för en vald bokning — speglar desktop-detaljpanelen
  // (status, nästa-steg, signaler) och Svarstudio/Smart anteckning.
  function openSlotDetail(event) {
    ensureSheet();
    selectedSlot = event;
    const shared = window.ArcanaBookingCalendarShared;
    const detail = sheetEl.querySelector("[data-calendar-detail]");
    if (!detail) return;
    const titleNode = sheetEl.querySelector("[data-calendar-detail-title]");
    const statusNode = sheetEl.querySelector("[data-calendar-detail-status]");
    const subNode = sheetEl.querySelector("[data-calendar-detail-sub]");
    const recoNode = sheetEl.querySelector("[data-calendar-detail-reco]");
    const recoTitleNode = sheetEl.querySelector("[data-calendar-detail-reco-title]");
    const recoCopyNode = sheetEl.querySelector("[data-calendar-detail-reco-copy]");
    const signalsNode = sheetEl.querySelector("[data-calendar-detail-signals]");

    const title =
      event.customerName || event.title || event.serviceLabel || event.service || "Bokning";
    if (titleNode) titleNode.textContent = title;
    if (statusNode) {
      statusNode.textContent =
        shared?.formatCaseStatus?.(event.caseStatus || event.status) || "Bokad";
    }
    if (subNode) {
      const parts = [
        formatTimeLabel(event.startAt || event.startsAt || event.start || event.time),
        event.serviceLabel || event.service,
        event.resourceLabel || event.resource,
      ].filter(Boolean);
      subNode.textContent = parts.join(" · ");
    }

    const reco = shared?.recommendBookingNextAction?.(event);
    if (recoNode && recoTitleNode && recoCopyNode) {
      if (reco) {
        recoNode.hidden = false;
        recoTitleNode.textContent = reco.title;
        recoCopyNode.textContent = reco.copy;
      } else {
        recoNode.hidden = true;
      }
    }

    if (signalsNode) {
      const rows = shared?.formatCalendarSignalSummary?.(event) || [];
      signalsNode.innerHTML = rows
        .map(
          ([label, value]) =>
            `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`
        )
        .join("");
    }

    detail.hidden = false;
    sheetEl
      .querySelector(".cco-mobile-calendar-panel")
      ?.setAttribute("data-detail-open", "true");
  }

  function closeSlotDetail() {
    selectedSlot = null;
    const detail = sheetEl?.querySelector("[data-calendar-detail]");
    if (detail) detail.hidden = true;
    sheetEl
      ?.querySelector(".cco-mobile-calendar-panel")
      ?.removeAttribute("data-detail-open");
  }

  async function renderSelectedDay() {
    closeSlotDetail();
    if (!selectedIso) selectedIso = todayIso();
    if (titleEl) titleEl.textContent = formatDayTitle(selectedIso);
    const slots = monthSlotsByDate.get(selectedIso) || [];
    renderSlotRows(slots, selectedIso);
    renderNextAvailable(slots);
  }

  async function refresh() {
    ensureSheet();
    if (viewYear == null || viewMonth == null) ensureViewMonth(selectedIso || todayIso());
    const { first, last } = monthRange(viewYear, viewMonth);
    if (listEl) {
      listEl.innerHTML = '<li class="cco-mobile-calendar-loading">Hämtar kalender…</li>';
    }
    const merged = shared?.fetchCalendarRange
      ? await shared.fetchCalendarRange(first, last)
      : { slotsByDate: new Map() };
    monthSlotsByDate = merged.slotsByDate || new Map();
    if (!monthSlotsByDate.has(selectedIso) && selectedIso >= first && selectedIso <= last) {
      monthSlotsByDate.set(selectedIso, []);
    }
    renderMonthGrid();
    await renderSelectedDay();
  }

  function setOpen(nextOpen, options = {}) {
    ensureSheet();
    if (nextOpen === true && !isCalendarViewport()) return;
    open = nextOpen === true;
    if (open && options.focusDate) {
      ensureViewMonth(options.focusDate);
      selectedIso = options.focusDate;
    }
    sheetEl.hidden = !open;
    sheetEl.dataset.open = open ? "true" : "false";
    sheetEl.dataset.tabletMode = isTablet() ? "true" : "false";
    document.documentElement.toggleAttribute("data-cco-calendar-open", open);
    window.ArcanaTabletShell?.refresh?.();
    if (open) {
      if (!selectedIso) ensureViewMonth(todayIso());
      void refresh();
      sheetEl.querySelector(".cco-mobile-calendar-close")?.focus?.();
    } else {
      window.ArcanaMobileCore?.forceUnlockBodyScroll?.();
      window.ArcanaMobileShell?.syncFromApp?.();
    }
  }

  try {
    const onViewportChange = () => {
      if (open && !isCalendarViewport()) setOpen(false);
    };
    window.matchMedia(MQ_MOBILE).addEventListener("change", onViewportChange);
    window.matchMedia(MQ_TABLET).addEventListener("change", onViewportChange);
  } catch {
    window.addEventListener("resize", () => {
      if (open && !isCalendarViewport()) setOpen(false);
    });
  }

  window.ArcanaBookingMobileCalendar = Object.freeze({
    open: (options) => setOpen(true, options || {}),
    close: () => setOpen(false),
    refresh,
    isOpen: () => open,
    isTablet: () => isTablet(),
    isCalendarViewport,
    getSelectedDate: () => selectedIso,
    getViewMonth: () => ({ year: viewYear, month: viewMonth }),
  });
})();
