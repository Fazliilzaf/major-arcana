"use strict";

(function initBookingDesktopWeek() {
  const shared = () => window.ArcanaBookingCalendarShared;
  const MQ_DESKTOP = "(min-width: 1024px)";
  const TIMELINE_START = 8 * 60;
  const TIMELINE_END = 18 * 60;
  const V8_HOUR_H = 62; // v8 kalender: pixelhöjd per timme i veckogriden.

  let viewMode = "week";
  let viewAnchor = startOfWeek(new Date());
  let selectedDayIso =
    shared()?.todayIso?.() ||
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
  let selectedResource = "all";
  let selectedServiceType = "all"; // R3
  let selectedEvent = null;
  let slotsByDate = new Map();
  let allSlots = [];
  let dragEvent = null;
  let calendarBusy = false;

  function isDesktop() {
    try {
      return window.matchMedia(MQ_DESKTOP).matches;
    } catch {
      return false;
    }
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  // R4: ISO-veckonummer (1-53) — för veckosammanfattning.
  function getIsoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function isoFromDate(date) {
    // Lokal-datum så veckokolumnerna matchar lokal kalenderdag. Tidigare
    // UTC-slicing gav off-by-one på is-today i sommartid (CEST = UTC+2).
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDayLabel(date) {
    try {
      return date.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
    } catch {
      return "";
    }
  }

  function formatWeekTitle(weekStart) {
    const end = addDays(weekStart, 6);
    try {
      const left = weekStart.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
      const right = end.toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `${left} – ${right}`;
    } catch {
      return "Vecka";
    }
  }

  function getActiveViewName() {
    const canvas = document.querySelector(".preview-canvas");
    return (
      canvas?.dataset?.appShellView ||
      canvas?.dataset?.appView ||
      new URLSearchParams(window.location.search).get("view") ||
      "customers"
    );
  }

  function shouldShowDesktopCalendar() {
    if (!isDesktop()) return false;
    return getActiveViewName() === "calendar";
  }

  function rangeForMode() {
    if (viewMode === "day" || viewMode === "resource") {
      return { from: selectedDayIso, to: selectedDayIso };
    }
    const from = isoFromDate(viewAnchor);
    const to = isoFromDate(addDays(viewAnchor, 6));
    return { from, to };
  }

  function ensureShell() {
    let shell = document.getElementById("cco-desktop-calendar");
    if (shell) return shell;

    shell = document.createElement("section");
    shell.id = "cco-desktop-calendar";
    shell.className = "cco-cal-workstation";
    shell.hidden = true;
    shell.innerHTML = `
      <div class="calendar-surface cco-cal-v8-surface">
      <header class="calendar-toolbar">
        <div class="calendar-toolbar-main">
          <span class="calendar-toolbar-kicker">Kalender</span>
          <span class="calendar-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
          </span>
          <h2 data-cal-title>Veckokalender</h2>
        </div>
        <div class="calendar-toolbar-actions">
          <div class="segment-group" role="tablist" aria-label="Kalendervy">
            <button class="segment-tab active" type="button" role="tab" data-cal-view="week" aria-selected="true">Vecka</button>
            <button class="segment-tab" type="button" role="tab" data-cal-view="day" aria-selected="false">Dag</button>
            <button class="segment-tab" type="button" role="tab" data-cal-view="resource" aria-selected="false">Resurs</button>
          </div>
          <button class="nav-btn" type="button" data-cal-prev title="Föregående (←)" aria-label="Föregående">‹</button>
          <button class="nav-btn nav-btn--today" type="button" data-cal-today title="Idag (T)">Idag</button>
          <button class="nav-btn" type="button" data-cal-next title="Nästa (→)" aria-label="Nästa">›</button>
          <button class="nav-btn nav-btn--icon" type="button" data-cal-print title="Skriv ut (P)" aria-label="Skriv ut">
            <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14"><path d="M5 6V2.8h6V6M4 6h8a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1h-1V9.4H5v3H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm1 3.4h6v3.8H5Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </header>
      <div class="calendar-status-bar">
        <span class="week-pill">Vecka <span class="num" data-cal-weeknum>—</span></span>
        <span class="status-pill status-pill--success" data-cal-pill-confirmed hidden></span>
        <span class="status-pill status-pill--warning" data-cal-pill-tentative hidden></span>
        <span class="status-pill status-pill--neutral" data-cal-pill-open hidden></span>
        <span class="status-pill status-pill--conflict" data-cal-pill-conflict hidden></span>
        <span class="spacer"></span>
      </div>
      <div class="cco-cal-filter-bar">
        <div class="cco-cal-filters" data-cal-filters aria-label="Resursfilter"></div>
        <div class="cco-cal-filters cco-cal-filters-type" data-cal-type-filters aria-label="Behandlingstypfilter"></div>
      </div>
      <div class="calendar-content cco-cal-body" data-cal-body>
        <div class="cco-cal-grid-wrap" data-cal-grid-wrap>
          <div class="cco-cal-empty">Hämtar kalender…</div>
        </div>
        <aside class="cco-cal-detail focus-intel" data-cal-detail hidden aria-labelledby="cco-cal-detail-title">
          <div class="focus-intel-primary">
            <div class="focus-intel-topline">
              <div class="focus-intel-title-row">
                <p class="focus-intel-kicker">BOKNING</p>
                <h3 id="cco-cal-detail-title" data-cal-detail-title>Välj en tid</h3>
              </div>
            </div>
            <div class="focus-intel-primary-body">
              <div class="focus-intel-customer">
                <div class="focus-intel-monogram" data-cal-detail-monogram>—</div>
                <div class="focus-intel-customer-copy">
                  <div class="focus-intel-name-row">
                    <h4 data-cal-detail-name>—</h4>
                    <span class="focus-intel-queue-pill" data-pill-icon="calendar" data-cal-detail-status>—</span>
                  </div>
                  <p data-cal-detail-subline>—</p>
                </div>
              </div>
              <div class="cco-cal-detail-reco" data-cal-detail-reco hidden>
                <span class="cco-cal-detail-reco-kicker">Rekommenderat drag</span>
                <strong data-cal-detail-reco-title>—</strong>
                <p data-cal-detail-reco-copy>—</p>
              </div>
              <div class="focus-intel-grid" data-cal-detail-grid></div>
              <div class="cco-cal-detail-signals" data-cal-detail-signals hidden aria-label="Påminnelser och signaler">
                <span class="cco-cal-detail-signals-kicker">Påminnelser &amp; signaler</span>
                <ul data-cal-detail-signal-list></ul>
              </div>
              <div class="focus-intel-action-row" data-cal-detail-actions aria-label="Bokningsåtgärder">
                <button class="quick-action-pill quick-action-pill--studio" type="button" data-cal-action="studio">Svarstudio</button>
                <button class="quick-action-pill quick-action-pill--note" type="button" data-cal-action="note">Smart anteckning</button>
                <button class="quick-action-pill" type="button" data-cal-action="case">Bokningsärende</button>
                <button class="quick-action-pill" type="button" data-cal-action="customer">Kundkort</button>
                <button class="quick-action-pill" type="button" data-cal-action="journal">Journal</button>
                <button class="quick-action-pill" type="button" data-cal-action="book">Ny bokning</button>
                <button class="quick-action-pill" type="button" data-cal-action="mobile-day">Daglista</button>
              </div>
            </div>
          </div>
        </aside>
      </div>
      </div>
    `;

    const host =
      document.querySelector("[data-booking-calendar-host]") ||
      document.querySelector(".customers-surface") ||
      document.body;
    host.prepend(shell);
    bindShell(shell);
    return shell;
  }

  function setViewMode(nextMode) {
    viewMode = nextMode;
    const shell = ensureShell();
    shell.dataset.calViewMode = viewMode;
    shell.querySelectorAll("[data-cal-view]").forEach((button) => {
      const active = button.getAttribute("data-cal-view") === viewMode;
      button.classList.toggle("active", active);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function openDayView(iso, { announce = true } = {}) {
    if (!iso) return;
    selectedDayIso = iso;
    viewAnchor = startOfWeek(new Date(`${iso}T12:00:00`));
    setViewMode("day");
    if (announce) {
      const label = formatDayLabel(new Date(`${iso}T12:00:00`));
      window.ArcanaBookingCalendarActions?.showToast?.(`Dagvy · ${label}`);
    }
    void refresh();
  }

  function renderResourceFilters() {
    const shell = ensureShell();
    const filters = shell.querySelector("[data-cal-filters]");
    if (!filters) return;
    const resources = shared()?.listResources?.(allSlots) || [];
    const chips = [
      `<button class="cco-cal-filter-chip${selectedResource === "all" ? " is-active" : ""}" type="button" data-cal-resource="all">Alla</button>`,
      ...resources
        .slice(0, 6)
        .map(
          ([label]) =>
            `<button class="cco-cal-filter-chip${selectedResource === label ? " is-active" : ""}" type="button" data-cal-resource="${shared().escapeAttr(label)}">${shared().escapeHtml(label)}</button>`
        ),
    ];
    filters.innerHTML = chips.join("");
  }

  // R3: filter-chips per behandlingstyp.
  function renderServiceTypeFilters() {
    const shell = ensureShell();
    const filters = shell.querySelector("[data-cal-type-filters]");
    if (!filters) return;
    const s = shared();
    const counts = new Map();
    (allSlots || []).forEach((slot) => {
      if (slot?.kind !== "booked") return;
      const t = s.serviceTypeFor(slot);
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    const labels = {
      hairtx: "Hårtx",
      prp: "PRP",
      consultation: "Konsult",
      aftercare: "Återbesök",
      video: "Online",
      other: "Övrigt",
    };
    const order = ["hairtx", "prp", "consultation", "aftercare", "video", "other"];
    const present = order.filter((t) => counts.has(t));
    if (!present.length) {
      filters.innerHTML = "";
      return;
    }
    const chips = [
      `<button class="cco-cal-filter-chip${selectedServiceType === "all" ? " is-active" : ""}" type="button" data-cal-type="all">Alla typer</button>`,
      ...present.map(
        (t) =>
          `<button class="cco-cal-filter-chip cco-cal-filter-chip-type${selectedServiceType === t ? " is-active" : ""}" data-service-type="${t}" type="button" data-cal-type="${t}">${s.escapeHtml(labels[t])} <small>${counts.get(t)}</small></button>`
      ),
    ];
    filters.innerHTML = chips.join("");
  }

  function filterSlots(slots) {
    const s = shared();
    let out = slots;
    if (selectedResource !== "all") {
      out = out.filter((slot) => {
        const label = String(slot?.resourceLabel || slot?.resource || "Övrigt").trim();
        return label === selectedResource;
      });
    }
    if (selectedServiceType !== "all") {
      out = out.filter((slot) => s.serviceTypeFor(slot) === selectedServiceType);
    }
    return out;
  }

  function isSelectedEvent(slot) {
    if (!selectedEvent) return false;
    return shared().eventKey(selectedEvent) === shared().eventKey(slot);
  }

  function renderTimelineEvents(slots, { absolute = true } = {}) {
    const s = shared();
    const conflictKeys = s.findConflictKeys(slots); // R3
    return slots
      .map((slot) => {
        const start = s.slotStartMinutes(slot);
        const duration = s.slotDurationMinutes(slot);
        const top = Math.max(
          0,
          Math.min(96, ((start - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100)
        );
        const height = Math.max(
          8,
          Math.min(100 - top, (duration / (TIMELINE_END - TIMELINE_START)) * 100)
        );
        const style = absolute
          ? `position:absolute;left:0;right:0;top:${top}%;height:${height}%;min-height:44px;padding-right:8px`
          : "";
        return `<div style="${style}">${s.renderEventCard(slot, {
          selected: isSelectedEvent(slot),
          draggable: slot?.kind === "booked",
          interactive: slot?.kind !== "block",
          conflict: conflictKeys.has(s.eventKey(slot)),
        })}</div>`;
      })
      .join("");
  }

  // v8: status → data-status-värde (confirmed/tentative/cancelled/followup).
  function v8StatusFor(slot) {
    const st = String(slot?.status || slot?.caseStatus || "").toLowerCase();
    if (st.includes("cancel") || st.includes("avbok")) return "cancelled";
    if (st.includes("follow") || st.includes("återbes") || st.includes("aterbes"))
      return "followup";
    if (st.includes("confirm") || st.includes("bekräft") || st.includes("bekraft"))
      return "confirmed";
    return "tentative";
  }

  // v8: positionera ett slot i en day-slots-kolumn (px utifrån klinikens timfönster).
  function v8SlotPosition(slot) {
    const s = shared();
    const start = s.slotStartMinutes(slot);
    const dur = Math.max(15, s.slotDurationMinutes(slot));
    const top = Math.max(0, ((start - TIMELINE_START) / 60) * V8_HOUR_H);
    const maxH = ((TIMELINE_END - TIMELINE_START) / 60) * V8_HOUR_H;
    const height = Math.max(22, Math.min(maxH - top, (dur / 60) * V8_HOUR_H));
    return { top: Math.round(top), height: Math.round(height) };
  }

  // v8: rendera ett kort (booking/empty-slot/lunch-block) — behåller data-cal-event-hooken.
  function v8RenderSlot(slot, iso, conflict) {
    const s = shared();
    const { top, height } = v8SlotPosition(slot);
    const payload = s.escapeAttr(JSON.stringify({ ...slot, eventKey: s.eventKey(slot) }));
    const style = `top:${top}px;height:${height}px`;
    if (slot?.kind === "available") {
      return `<div class="empty-slot" data-cal-event="${payload}" data-cal-drop-day="${s.escapeAttr(iso)}" style="${style}"><span class="empty-label">+ Ledig ${s.escapeHtml(s.formatTimeRange(slot))}</span></div>`;
    }
    if (slot?.kind === "block") {
      return `<div class="lunch-block" style="${style}">⌣ ${s.escapeHtml(s.eventTitle(slot) || "Blockerad")}</div>`;
    }
    const source =
      String(slot?.source || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") || "info";
    const status = v8StatusFor(slot);
    const selectedClass = isSelectedEvent(slot) ? " is-selected" : "";
    const conflictClass = conflict ? " is-conflict" : "";
    const sub = s.eventMeta(slot);
    return `<button type="button" class="booking${selectedClass}${conflictClass}" draggable="true" data-cal-event="${payload}" data-source="${s.escapeAttr(source)}" data-status="${status}" style="${style}">
      <div class="booking-time">${s.escapeHtml(s.formatTimeRange(slot))}</div>
      <div class="booking-title">${s.escapeHtml(s.eventTitle(slot))}</div>
      ${sub ? `<div class="booking-sub">${s.escapeHtml(sub)}</div>` : ""}
    </button>`;
  }

  function renderWeekGrid(container) {
    const s = shared();
    const days = Array.from({ length: 7 }, (_, index) => addDays(viewAnchor, index));
    const today = s.todayIso();
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTopPx =
      nowMinutes >= TIMELINE_START && nowMinutes <= TIMELINE_END
        ? Math.round(((nowMinutes - TIMELINE_START) / 60) * V8_HOUR_H)
        : null;
    const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // v8: tid-kolumn (klinikens timfönster) + 7 dag-kolumner med positionerade kort.
    const startHour = Math.floor(TIMELINE_START / 60);
    const endHour = Math.floor(TIMELINE_END / 60);
    const ticks = [];
    for (let h = startHour; h <= endHour; h++) {
      ticks.push(`<div class="time-tick">${String(h).padStart(2, "0")}</div>`);
    }
    const weekNumEl = document
      .getElementById("cco-desktop-calendar")
      ?.querySelector("[data-cal-weeknum]");
    if (weekNumEl) weekNumEl.textContent = getIsoWeek(viewAnchor);

    const columns = days
      .map((day) => {
        const iso = isoFromDate(day);
        const slots = filterSlots(slotsByDate.get(iso) || []);
        const conflictKeys = s.findConflictKeys(slots);
        const isToday = iso === today;
        const cells = slots
          .map((slot) => v8RenderSlot(slot, iso, conflictKeys.has(s.eventKey(slot))))
          .join("");
        const nowLine =
          isToday && nowTopPx != null
            ? `<div class="now-line" style="top:${nowTopPx}px"><span class="now-label">${s.escapeHtml(nowLabel)}</span></div>`
            : "";
        return `<div class="day-col${isToday ? " today" : ""}" data-cal-day="${s.escapeAttr(iso)}">
          <div class="day-head cco-cal-day-open" data-cal-open-day="${s.escapeAttr(iso)}" role="button" tabindex="0" aria-label="Öppna dagvy ${s.escapeAttr(formatDayLabel(day))}">
            <span class="day-label">${s.escapeHtml(formatDayLabel(day).replace(/\s+\d+$/, ""))}</span>
            <span class="day-date">${day.getDate()}</span>
          </div>
          <div class="day-slots cco-cal-drop-zone" data-cal-drop-day="${s.escapeAttr(iso)}">
            ${nowLine}${cells}
          </div>
        </div>`;
      })
      .join("");

    container.innerHTML = `<div class="calendar-week" style="--calendar-hour-h:${V8_HOUR_H}px;--calendar-hour-start:${startHour};--calendar-hour-end:${endHour}">
      <div class="time-col">${ticks.join("")}</div>
      ${columns}
    </div>`;
    return;
  }

  // (legacy week-grid behålls nedan ej-anropad; v8 ovan ersätter den)
  function renderWeekGridLegacy(container) {
    const s = shared();
    const days = Array.from({ length: 7 }, (_, index) => addDays(viewAnchor, index));
    const today = s.todayIso();
    const now = new Date();
    const nowBadge = `NU ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    // R4: veckosammanfattning - räkna totals över ALLA slots i veckan.
    const weekSlots = days.flatMap((day) => filterSlots(slotsByDate.get(isoFromDate(day)) || []));
    const confirmedCount = weekSlots.filter((slot) => {
      const st = String(slot?.status || slot?.caseStatus || "").toLowerCase();
      return slot?.kind === "booked" && (st.includes("confirm") || st.includes("bekräft"));
    }).length;
    const tentativeCount = weekSlots.filter((slot) => {
      const st = String(slot?.status || slot?.caseStatus || "").toLowerCase();
      return slot?.kind === "booked" && !(st.includes("confirm") || st.includes("bekräft"));
    }).length;
    const openCount = weekSlots.filter((slot) => slot?.kind === "available").length;
    const weekConflicts = s.findConflictKeys(weekSlots);
    const conflictCount = weekConflicts.size;
    const openHours =
      Math.round(
        (weekSlots
          .filter((slot) => slot?.kind === "available")
          .reduce((sum, slot) => sum + s.slotDurationMinutes(slot), 0) /
          60) *
          10
      ) / 10;
    const weekLabel = `v ${getIsoWeek(viewAnchor)}`;

    // R4-13: kapacitetsöversikt — per behandlare, bokade vs (bokade+lediga) min.
    const resourceUtil = new Map();
    weekSlots.forEach((slot) => {
      if (slot?.kind !== "booked" && slot?.kind !== "available") return;
      const r = String(slot?.resourceLabel || slot?.resource || "Övrigt").trim();
      if (!resourceUtil.has(r)) resourceUtil.set(r, { booked: 0, available: 0 });
      resourceUtil.get(r)[slot.kind] += s.slotDurationMinutes(slot);
    });
    const utilRows = [...resourceUtil.entries()]
      .sort((a, b) => b[1].booked + b[1].available - (a[1].booked + a[1].available))
      .slice(0, 8)
      .map(([label, mins]) => {
        const total = mins.booked + mins.available;
        const pct = total > 0 ? Math.round((mins.booked / total) * 100) : 0;
        const bookedH = (mins.booked / 60).toFixed(1).replace(/\.0$/, "");
        const totalH = (total / 60).toFixed(1).replace(/\.0$/, "");
        const tone = pct >= 95 ? "danger" : pct >= 85 ? "warn" : "normal";
        return `<div class="cco-cal-capacity-row" data-util-tone="${tone}" style="--util-pct: ${pct}%">
          <span class="cco-cal-capacity-name">${s.escapeHtml(label)}</span>
          <div class="cco-cal-capacity-bar" aria-hidden="true"><span></span></div>
          <span class="cco-cal-capacity-pct">${pct}%</span>
          <span class="cco-cal-capacity-hours">${bookedH}/${totalH}h</span>
        </div>`;
      })
      .join("");
    const capacityHtml = utilRows
      ? `<div class="cco-cal-capacity" aria-label="Kapacitet per behandlare">${utilRows}</div>`
      : "";

    const summaryHtml = `<aside class="cco-cal-week-summary" aria-label="Veckosammanfattning">
      <div class="cco-cal-week-summary-totals">
        <span class="cco-cal-week-summary-kicker">${s.escapeHtml(weekLabel)}</span>
        <span class="cco-cal-week-summary-item is-confirmed"><strong>${confirmedCount}</strong> bekräftade</span>
        <span class="cco-cal-week-summary-item is-tentative"><strong>${tentativeCount}</strong> tentativa</span>
        <span class="cco-cal-week-summary-item is-open"><strong>${openHours}</strong> lediga timmar</span>
        ${conflictCount > 0 ? `<span class="cco-cal-week-summary-item is-conflict"><strong>${conflictCount}</strong> i konflikt</span>` : ""}
      </div>
      ${capacityHtml}
    </aside>`;
    container.innerHTML = `${summaryHtml}<div class="cco-cal-week-grid">${days
      .map((day) => {
        const iso = isoFromDate(day);
        const slots = filterSlots(slotsByDate.get(iso) || []);
        const bookedCount = slots.filter((slot) => slot.kind === "booked").length;
        const openCount = slots.filter((slot) => slot.kind === "available").length;
        const conflictKeys = s.findConflictKeys(slots); // R3
        const classes = [
          "cco-cal-day-col",
          iso === today ? "is-today" : "",
          iso === selectedDayIso ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const todayBadge =
          iso === today
            ? `<span class="cco-cal-now-badge" title="Aktuell tid">${s.escapeHtml(nowBadge)}</span>`
            : "";
        return `<section class="${classes}" data-cal-day="${s.escapeAttr(iso)}" data-cal-drop-day="${s.escapeAttr(iso)}">
          <header class="cco-cal-col-head cco-cal-day-open" data-cal-open-day="${s.escapeAttr(iso)}" role="button" tabindex="0" aria-label="Öppna dagvy ${s.escapeAttr(formatDayLabel(day))}">
            <strong>${s.escapeHtml(formatDayLabel(day))}${todayBadge}</strong>
            <span>${bookedCount} bokade · ${openCount} lediga</span>
          </header>
          <div class="cco-cal-day-stack cco-cal-drop-zone" data-cal-drop-day="${s.escapeAttr(iso)}">
            ${
              slots.length
                ? slots
                    .map((slot) =>
                      s.renderEventCard(slot, {
                        compact: true,
                        selected: isSelectedEvent(slot),
                        draggable: slot?.kind === "booked",
                        interactive: slot?.kind !== "block",
                        conflict: conflictKeys.has(s.eventKey(slot)),
                      })
                    )
                    .join("")
                : `<div class="cco-cal-empty cco-cal-drop-zone" data-cal-drop-day="${s.escapeAttr(iso)}">Släpp bokning här</div>`
            }
          </div>
        </section>`;
      })
      .join("")}</div>`;
  }

  function renderDayGrid(container) {
    const s = shared();
    const slots = filterSlots(slotsByDate.get(selectedDayIso) || []);
    const lines = [];
    for (let minute = TIMELINE_START; minute <= TIMELINE_END; minute += 60) {
      lines.push(
        `<div class="cco-cal-time-label">${String(Math.floor(minute / 60)).padStart(2, "0")}:00</div>`
      );
    }
    const now = new Date();
    const nowIso = isoFromDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTop =
      nowIso === selectedDayIso && nowMinutes >= TIMELINE_START && nowMinutes <= TIMELINE_END
        ? ((nowMinutes - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100
        : null;

    container.innerHTML = `<div class="cco-cal-day-timeline">
      <div class="cco-cal-time-rail">${lines.join("")}</div>
      <div class="cco-cal-time-grid">
        <div class="cco-cal-time-events cco-cal-drop-zone" data-cal-drop-timeline data-cal-drop-day="${s.escapeAttr(selectedDayIso)}">
          ${nowTop != null ? `<div class="cco-cal-now-marker" style="top:${nowTop}%"></div>` : ""}
          ${renderTimelineEvents(slots.filter((slot) => slot.kind !== "block"))}
          ${renderTimelineEvents(
            slots.filter((slot) => slot.kind === "block"),
            { absolute: true }
          )}
        </div>
      </div>
    </div>`;
  }

  function renderResourceGrid(container) {
    const s = shared();
    const daySlots = filterSlots(slotsByDate.get(selectedDayIso) || []);
    const resources = s.listResources(daySlots, selectedDayIso);
    if (!resources.length) {
      container.innerHTML = `<div class="cco-cal-empty">Inga resurser för ${s.escapeHtml(formatDayLabel(new Date(`${selectedDayIso}T12:00:00`)))}.</div>`;
      return;
    }

    const lines = [];
    for (let minute = TIMELINE_START; minute <= TIMELINE_END; minute += 60) {
      lines.push(
        `<div class="cco-cal-time-label">${String(Math.floor(minute / 60)).padStart(2, "0")}:00</div>`
      );
    }

    container.innerHTML = `<div class="cco-cal-resource-timeline">
      <div class="cco-cal-resource-time-rail">${lines.join("")}</div>
      <div class="cco-cal-resource-columns">${resources
        .map(([label, slots]) => {
          return `<section class="cco-cal-resource-col-timeline">
            <header class="cco-cal-col-head">
              <strong>${s.escapeHtml(label)}</strong>
              <span>${slots.length} ${slots.length === 1 ? "post" : "poster"}</span>
            </header>
            <div class="cco-cal-resource-time-grid">
              <div class="cco-cal-time-events cco-cal-drop-zone" data-cal-drop-timeline data-cal-drop-day="${s.escapeAttr(selectedDayIso)}" data-cal-drop-resource="${s.escapeAttr(label)}">
                ${renderTimelineEvents(slots.filter((slot) => slot.kind !== "block"))}
                ${renderTimelineEvents(slots.filter((slot) => slot.kind === "block"))}
              </div>
            </div>
          </section>`;
        })
        .join("")}</div>
    </div>`;
  }

  // R2: monogram-helper för Kundintelligens-stil avatar.
  function monogramFor(name) {
    const text = String(name || "").trim();
    if (!text) return "—";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // R8: AI nästa-steg — delegerar till delade heuristiken (shared).
  function recommendNextAction(event) {
    return shared()?.recommendBookingNextAction?.(event) || null;
  }

  // R2: ersätter platt list-meta med Kundintelligens-mönstret:
  // monogram + namn + status-pill + 2-kolumns grid + action-row med quick-action-pills.
  function renderDetailPanel() {
    const shell = ensureShell();
    const body = shell.querySelector("[data-cal-body]");
    const detail = shell.querySelector("[data-cal-detail]");
    const titleEl = shell.querySelector("[data-cal-detail-title]");
    const nameEl = shell.querySelector("[data-cal-detail-name]");
    const monogramEl = shell.querySelector("[data-cal-detail-monogram]");
    const statusEl = shell.querySelector("[data-cal-detail-status]");
    const sublineEl = shell.querySelector("[data-cal-detail-subline]");
    const gridEl = shell.querySelector("[data-cal-detail-grid]");
    const caseBtn = shell.querySelector('[data-cal-action="case"]');
    const customerBtn = shell.querySelector('[data-cal-action="customer"]');
    const journalBtn = shell.querySelector('[data-cal-action="journal"]');
    const bookBtn = shell.querySelector('[data-cal-action="book"]');
    const studioBtn = shell.querySelector('[data-cal-action="studio"]');
    const noteBtn = shell.querySelector('[data-cal-action="note"]');
    const recoEl = shell.querySelector("[data-cal-detail-reco]");
    const recoTitleEl = shell.querySelector("[data-cal-detail-reco-title]");
    const recoCopyEl = shell.querySelector("[data-cal-detail-reco-copy]");
    const signalsEl = shell.querySelector("[data-cal-detail-signals]");
    const signalListEl = shell.querySelector("[data-cal-detail-signal-list]");
    if (!detail || !titleEl) return;

    if (!selectedEvent) {
      detail.hidden = true;
      if (body) body.dataset.detailOpen = "false";
      titleEl.textContent = "Välj en tid";
      if (nameEl) nameEl.textContent = "—";
      if (monogramEl) monogramEl.textContent = "—";
      if (statusEl) {
        statusEl.textContent = "—";
        delete statusEl.dataset.tone;
      }
      if (sublineEl) sublineEl.textContent = "—";
      if (gridEl) gridEl.innerHTML = "";
      if (recoEl) recoEl.hidden = true;
      if (signalsEl) signalsEl.hidden = true;
      if (signalListEl) signalListEl.innerHTML = "";
      return;
    }

    const s = shared();
    const isBooked = selectedEvent.kind === "booked";
    const isAvailable = selectedEvent.kind === "available";
    const isBlock = selectedEvent.kind === "block";
    detail.hidden = false;
    if (body) body.dataset.detailOpen = "true";

    const titleText = s.eventTitle(selectedEvent);
    const customerName = selectedEvent.customerName || selectedEvent.customerEmail || "";
    titleEl.textContent = titleText;
    if (nameEl) nameEl.textContent = customerName || titleText;
    if (monogramEl) monogramEl.textContent = monogramFor(customerName || titleText);

    const statusText = isBooked
      ? s.formatCaseStatus(selectedEvent.caseStatus || selectedEvent.status) || "Bokad"
      : isAvailable
        ? "Ledig"
        : isBlock
          ? "Blockerad"
          : "Bokning";
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.dataset.tone = isBooked
        ? "booked"
        : isAvailable
          ? "available"
          : isBlock
            ? "block"
            : "default";
    }

    if (sublineEl) {
      const parts = [
        selectedEvent.serviceLabel || selectedEvent.service,
        selectedEvent.resourceLabel || selectedEvent.resource,
      ].filter(Boolean);
      sublineEl.textContent = parts.join(" · ") || "—";
    }

    if (gridEl) {
      const items = [
        ["lifecycle", "TID", s.formatTimeRange(selectedEvent)],
        ["status", "BEHANDLING", selectedEvent.serviceLabel || selectedEvent.service || "—"],
        ["owner", "BEHANDLARE", selectedEvent.resourceLabel || selectedEvent.resource || "—"],
        ["waiting", "STATUS", statusText],
        ["followup", "PLATS", selectedEvent.locationLabel || selectedEvent.location || "—"],
      ];
      gridEl.innerHTML = items
        .map(
          ([kind, label, value]) =>
            `<div class="focus-intel-item focus-intel-item-${kind}"><span class="focus-intel-label">${s.escapeHtml(label)}</span><strong>${s.escapeHtml(value || "—")}</strong></div>`
        )
        .join("");
    }

    // R8: påminnelser & signaler i eget block (tidigare inklämt i griden).
    const signalRows =
      isBooked && s.formatCalendarSignalSummary ? s.formatCalendarSignalSummary(selectedEvent) : [];
    if (signalsEl && signalListEl) {
      if (signalRows.length) {
        signalsEl.hidden = false;
        signalListEl.innerHTML = signalRows
          .map(
            ([label, value]) =>
              `<li><span>${s.escapeHtml(label)}</span><strong>${s.escapeHtml(value)}</strong></li>`
          )
          .join("");
      } else {
        signalsEl.hidden = true;
        signalListEl.innerHTML = "";
      }
    }

    // R8: AI nästa-steg — härlett ur signaler/status.
    const reco = recommendNextAction(selectedEvent);
    if (recoEl && recoTitleEl && recoCopyEl) {
      if (reco) {
        recoEl.hidden = false;
        recoTitleEl.textContent = reco.title;
        recoCopyEl.textContent = reco.copy;
      } else {
        recoEl.hidden = true;
      }
    }

    if (caseBtn) caseBtn.hidden = !isBooked;
    if (customerBtn) customerBtn.hidden = !isBooked;
    if (journalBtn) journalBtn.hidden = !isBooked;
    if (studioBtn) studioBtn.hidden = !isBooked;
    if (noteBtn) noteBtn.hidden = !isBooked;
    if (bookBtn) bookBtn.hidden = isBooked;
  }

  function minutesFromTimelineDrop(event, container) {
    const rect = container.getBoundingClientRect();
    if (!rect.height) return TIMELINE_START;
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const minutes = TIMELINE_START + ratio * (TIMELINE_END - TIMELINE_START);
    return Math.round(minutes / 15) * 15;
  }

  function findResourceMeta(label) {
    const match = (allSlots || []).find(
      (slot) =>
        String(slot?.resourceLabel || slot?.resource || "").trim() === String(label || "").trim()
    );
    return {
      resourceId: match?.resourceId || "",
      resourceLabel: label || match?.resourceLabel || "",
    };
  }

  async function performCalendarRebook(sourceEvent, targetSlot) {
    if (calendarBusy || !sourceEvent?.bookingCaseId) return;
    const s = shared();
    calendarBusy = true;
    const shell = ensureShell();
    shell.dataset.calBusy = "true";
    try {
      await s.rebookCalendarBooking(
        sourceEvent.bookingCaseId,
        targetSlot,
        "Ombokad via kalenderdrag"
      );
      await refresh();
      window.ArcanaBookingCalendarActions?.showToast?.("Bokningen flyttades.");
    } catch (error) {
      window.ArcanaBookingCalendarActions?.showToast?.(
        error?.message || "Kunde inte omboka tiden.",
        "error"
      );
    } finally {
      calendarBusy = false;
      shell.dataset.calBusy = "false";
    }
  }

  function bindCalendarInteractions(wrap) {
    if (!wrap) return;
    const s = shared();

    wrap.querySelectorAll("[data-cal-event]").forEach((node) => {
      node.addEventListener("click", (event) => {
        if (node.classList.contains("is-dragging")) return;
        try {
          selectedEvent = JSON.parse(node.getAttribute("data-cal-event") || "{}");
        } catch {
          selectedEvent = null;
        }
        renderDetailPanel();
        node.classList.toggle("is-selected", true);
      });
      node.addEventListener("dblclick", (event) => {
        event.preventDefault();
        try {
          selectedEvent = JSON.parse(node.getAttribute("data-cal-event") || "{}");
        } catch {
          selectedEvent = null;
        }
        if (selectedEvent?.kind === "available") {
          window.ArcanaBookingCalendarActions?.openNewBookingFromSlot?.(selectedEvent);
        }
      });
      if (node.getAttribute("draggable") === "true") {
        node.addEventListener("dragstart", (event) => {
          try {
            dragEvent = JSON.parse(node.getAttribute("data-cal-event") || "{}");
          } catch {
            dragEvent = null;
          }
          node.classList.add("is-dragging");
          event.dataTransfer?.setData("text/plain", dragEvent?.eventKey || "booking");
          event.dataTransfer.effectAllowed = "move";
        });
        node.addEventListener("dragend", () => {
          node.classList.remove("is-dragging");
          dragEvent = null;
          wrap.querySelectorAll(".cco-cal-drop-zone.is-drop-target").forEach((zone) => {
            zone.classList.remove("is-drop-target");
          });
        });
      }
    });

    wrap.querySelectorAll("[data-cal-drop-day]").forEach((zone) => {
      zone.addEventListener("dragover", (event) => {
        if (!dragEvent || dragEvent.kind !== "booked") return;
        event.preventDefault();
        zone.classList.add("is-drop-target");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-drop-target"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-drop-target");
        if (!dragEvent || dragEvent.kind !== "booked") return;
        const iso = zone.getAttribute("data-cal-drop-day") || selectedDayIso;
        const targetSlot = s.buildSlotAtTime(dragEvent, {
          iso,
          startMinutes: s.slotStartMinutes(dragEvent),
        });
        void performCalendarRebook(dragEvent, targetSlot);
      });
    });

    wrap.querySelectorAll("[data-cal-drop-timeline]").forEach((zone) => {
      zone.addEventListener("dragover", (event) => {
        if (!dragEvent || dragEvent.kind !== "booked") return;
        event.preventDefault();
        zone.classList.add("is-drop-target");
      });
      zone.addEventListener("dragleave", () => zone.classList.remove("is-drop-target"));
      zone.addEventListener("drop", (event) => {
        event.preventDefault();
        zone.classList.remove("is-drop-target");
        if (!dragEvent || dragEvent.kind !== "booked") return;
        const iso = zone.getAttribute("data-cal-drop-day") || selectedDayIso;
        const resourceLabel =
          zone.getAttribute("data-cal-drop-resource") || dragEvent.resourceLabel;
        const resourceMeta = findResourceMeta(resourceLabel);
        const startMinutes = minutesFromTimelineDrop(event, zone);
        const targetSlot = s.buildSlotAtTime(
          {
            ...dragEvent,
            ...resourceMeta,
            resourceLabel: resourceMeta.resourceLabel || resourceLabel,
          },
          { iso, startMinutes }
        );
        void performCalendarRebook(dragEvent, targetSlot);
      });
    });

    wrap.querySelectorAll("[data-cal-open-day]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        selectedDayIso = node.getAttribute("data-cal-open-day") || selectedDayIso;
        renderGrid();
      });
      node.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDayView(node.getAttribute("data-cal-open-day"), { announce: true });
      });
      node.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openDayView(node.getAttribute("data-cal-open-day"), { announce: true });
      });
    });

    wrap.querySelectorAll("[data-cal-day]").forEach((node) => {
      node.addEventListener("dblclick", (event) => {
        if (event.target.closest("[data-cal-event]") || event.target.closest("[data-cal-open-day]"))
          return;
        openDayView(node.getAttribute("data-cal-day"), { announce: true });
      });
    });
  }

  // R8: status-pills i toolbaren — speglar veckans/dagens totals i studio-stil.
  function computeRangeTotals(slots) {
    const s = shared();
    let confirmed = 0;
    let tentative = 0;
    let openCount = 0;
    (slots || []).forEach((slot) => {
      if (slot?.kind === "available") {
        openCount += 1;
        return;
      }
      if (slot?.kind !== "booked") return;
      const st = String(slot?.status || slot?.caseStatus || "").toLowerCase();
      if (st.includes("confirm") || st.includes("bekräft")) confirmed += 1;
      else tentative += 1;
    });
    const conflict = s.findConflictKeys(slots || []).size;
    return { confirmed, tentative, openCount, conflict };
  }

  function setToolbarPill(shell, key, count, label) {
    const el = shell.querySelector(`[data-cal-pill-${key}]`);
    if (!el) return;
    if (!count) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<strong>${count}</strong> ${shared().escapeHtml(label)}`;
  }

  function updateToolbarPills() {
    const shell = ensureShell();
    let slots;
    if (viewMode === "week") {
      const days = Array.from({ length: 7 }, (_, index) => addDays(viewAnchor, index));
      slots = days.flatMap((day) => filterSlots(slotsByDate.get(isoFromDate(day)) || []));
    } else {
      slots = filterSlots(slotsByDate.get(selectedDayIso) || []);
    }
    const totals = computeRangeTotals(slots);
    setToolbarPill(shell, "confirmed", totals.confirmed, "bekräftade");
    setToolbarPill(shell, "tentative", totals.tentative, "tentativa");
    setToolbarPill(shell, "open", totals.openCount, "lediga");
    setToolbarPill(shell, "conflict", totals.conflict, "konflikt");
  }

  function renderGrid() {
    const shell = ensureShell();
    const title = shell.querySelector("[data-cal-title]");
    const wrap = shell.querySelector("[data-cal-grid-wrap]");
    if (!wrap) return;

    if (viewMode === "day") {
      if (title) {
        title.textContent = formatDayLabel(new Date(`${selectedDayIso}T12:00:00`));
        title.setAttribute("title", "Tidsaxel · välj Vecka i verktygsfältet för att gå tillbaka");
      }
      renderDayGrid(wrap);
    } else if (viewMode === "resource") {
      if (title) {
        title.textContent = `Resursvy · ${formatDayLabel(new Date(`${selectedDayIso}T12:00:00`))}`;
      }
      renderResourceGrid(wrap);
    } else {
      if (title) title.textContent = formatWeekTitle(viewAnchor);
      renderWeekGrid(wrap);
    }

    bindCalendarInteractions(wrap);
    renderDetailPanel();
    updateToolbarPills();
  }

  async function refresh() {
    const shell = ensureShell();
    const wrap = shell.querySelector("[data-cal-grid-wrap]");
    if (wrap) wrap.innerHTML = '<div class="cco-cal-empty">Hämtar kalender…</div>';
    const { from, to } = rangeForMode();
    const s = shared();
    let paintedPartial = false;
    const merged = await s.fetchCalendarRange(from, to, {
      onPartial(partial) {
        if (paintedPartial) return;
        paintedPartial = true;
        allSlots = partial.events;
        slotsByDate = partial.slotsByDate;
        renderResourceFilters();
        renderServiceTypeFilters();
        renderGrid();
      },
    });
    allSlots = merged.events;
    slotsByDate = merged.slotsByDate;
    renderResourceFilters();
    renderServiceTypeFilters(); // R3
    renderGrid();
  }

  function runCalendarAction(action) {
    const actions = window.ArcanaBookingCalendarActions;
    if (!selectedEvent) return;
    if (action === "case") {
      actions?.openBookingCase?.(selectedEvent.bookingCaseSnapshot || selectedEvent);
      return;
    }
    if (action === "studio") {
      actions?.openStudioForBooking?.(selectedEvent.bookingCaseSnapshot || selectedEvent);
      return;
    }
    if (action === "note") {
      actions?.openNoteForBooking?.(selectedEvent.bookingCaseSnapshot || selectedEvent);
      return;
    }
    if (action === "customer") {
      actions?.openCustomerCard?.({
        patientId: selectedEvent.patientId,
        customerEmail: selectedEvent.customerEmail,
        customerName: selectedEvent.customerName,
      });
      return;
    }
    if (action === "journal") {
      actions?.openJournal?.({
        patientId: selectedEvent.patientId,
        customerEmail: selectedEvent.customerEmail,
        customerName: selectedEvent.customerName,
      });
      return;
    }
    if (action === "book") {
      window.ArcanaBookingCalendarActions?.openNewBookingFromSlot?.(selectedEvent);
      return;
    }
    if (action === "mobile-day") {
      window.ArcanaBookingMobileCalendar?.open?.({
        focusDate: selectedDayIso,
        desktopHandoff: true,
      });
    }
  }

  function bindShell(shell) {
    // R7: defensiv reset av busy-flagga vid varje bind. Skyddar mot att
    // en hängande busy-state ([data-cal-busy='true']) gör hela kalendern
    // halvtransparent. Säker — vi sätter den bara false, aldrig true här.
    shell.dataset.calBusy = "false";
    shell.querySelectorAll("[data-cal-view]").forEach((button) => {
      button.addEventListener("click", () => {
        setViewMode(button.getAttribute("data-cal-view") || "week");
        void refresh();
      });
    });

    shell.querySelector("[data-cal-prev]")?.addEventListener("click", () => {
      if (viewMode === "day" || viewMode === "resource") {
        selectedDayIso = isoFromDate(addDays(new Date(`${selectedDayIso}T12:00:00`), -1));
      } else {
        viewAnchor = addDays(viewAnchor, -7);
      }
      void refresh();
    });

    shell.querySelector("[data-cal-next]")?.addEventListener("click", () => {
      if (viewMode === "day" || viewMode === "resource") {
        selectedDayIso = isoFromDate(addDays(new Date(`${selectedDayIso}T12:00:00`), 1));
      } else {
        viewAnchor = addDays(viewAnchor, 7);
      }
      void refresh();
    });

    shell.querySelector("[data-cal-today]")?.addEventListener("click", () => {
      viewAnchor = startOfWeek(new Date());
      selectedDayIso = shared().todayIso();
      void refresh();
    });

    shell.addEventListener("click", (event) => {
      const resourceButton = event.target.closest("[data-cal-resource]");
      if (resourceButton) {
        selectedResource = resourceButton.getAttribute("data-cal-resource") || "all";
        renderResourceFilters();
        renderServiceTypeFilters(); // R3
        renderGrid();
        return;
      }

      // R3: filter per behandlingstyp
      const typeButton = event.target.closest("[data-cal-type]");
      if (typeButton) {
        selectedServiceType = typeButton.getAttribute("data-cal-type") || "all";
        renderServiceTypeFilters();
        renderGrid();
        return;
      }

      const actionButton = event.target.closest("[data-cal-action]");
      if (actionButton) {
        runCalendarAction(actionButton.getAttribute("data-cal-action"));
        return;
      }

      // R4: Skriv ut
      if (event.target.closest("[data-cal-print]")) {
        document.body.classList.add("cco-cal-printing");
        try {
          window.print();
        } finally {
          // Class hangs en frame så onafterprint hinner triggas
          setTimeout(() => document.body.classList.remove("cco-cal-printing"), 500);
        }
      }
    });

    // R4: tangentbordsnavigering — aktiv bara när desktop-kalendern är synlig.
    if (!window.__ccoCalendarKeyboardBound) {
      window.__ccoCalendarKeyboardBound = true;
      document.addEventListener("keydown", (event) => {
        const calendarShell = document.getElementById("cco-desktop-calendar");
        if (!calendarShell || calendarShell.hidden) return;
        // Skippa när användaren skriver i ett input/textarea/contenteditable
        const t = event.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const key = event.key;
        if (key === "ArrowLeft") {
          event.preventDefault();
          calendarShell.querySelector("[data-cal-prev]")?.click();
        } else if (key === "ArrowRight") {
          event.preventDefault();
          calendarShell.querySelector("[data-cal-next]")?.click();
        } else if (key === "t" || key === "T") {
          event.preventDefault();
          calendarShell.querySelector("[data-cal-today]")?.click();
        } else if (key === "v" || key === "V") {
          event.preventDefault();
          setViewMode("week");
          void refresh();
        } else if (key === "d" || key === "D") {
          event.preventDefault();
          setViewMode("day");
          void refresh();
        } else if (key === "r" || key === "R") {
          event.preventDefault();
          setViewMode("resource");
          void refresh();
        } else if (key === "n" || key === "N") {
          event.preventDefault();
          window.ArcanaBookingCalendarActions?.openNewBookingFromSlot?.(selectedEvent);
        } else if (key === "p" || key === "P") {
          event.preventDefault();
          calendarShell.querySelector("[data-cal-print]")?.click();
        } else if (key === "Escape") {
          if (selectedEvent) {
            event.preventDefault();
            selectedEvent = null;
            renderDetailPanel();
          }
        }
      });
    }
  }

  function syncVisibility() {
    const shell = ensureShell();
    const show = shouldShowDesktopCalendar();
    shell.hidden = !show;
    shell.dataset.shellView = getActiveViewName();
    if (show) void refresh();
  }

  function boot() {
    ensureShell();
    syncVisibility();
    window.addEventListener("resize", syncVisibility);
    window.addEventListener("popstate", syncVisibility);
    const canvas = document.querySelector(".preview-canvas");
    if (canvas) {
      const observer = new MutationObserver(() => window.requestAnimationFrame(syncVisibility));
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-app-shell-view", "data-app-view"],
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.ArcanaBookingDesktopWeek = Object.freeze({
    syncVisibility,
    refresh,
    openDayView,
    getViewWeekStart: () => new Date(viewAnchor),
    getViewMode: () => viewMode,
    getSelectedDayIso: () => selectedDayIso,
  });
})();
