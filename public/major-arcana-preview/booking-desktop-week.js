'use strict';

(function initBookingDesktopWeek() {
  const MQ_DESKTOP = '(min-width: 1024px)';

  function isDesktop() {
    try {
      return window.matchMedia(MQ_DESKTOP).matches;
    } catch {
      return false;
    }
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
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

  function formatDayLabel(date) {
    try {
      return date.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  }

  function ensureShell() {
    let shell = document.getElementById('cco-desktop-week-calendar');
    if (shell) return shell;
    shell = document.createElement('section');
    shell.id = 'cco-desktop-week-calendar';
    shell.className = 'cco-desktop-week-calendar';
    shell.hidden = true;
    shell.innerHTML = `
      <header class="cco-desktop-week-calendar-head">
        <h3>Veckokalender</h3>
        <div class="cco-desktop-week-calendar-nav">
          <button type="button" class="customers-utility-button" data-desktop-week-prev>Föregående vecka</button>
          <button type="button" class="customers-utility-button" data-desktop-week-today>Denna vecka</button>
          <button type="button" class="customers-utility-button" data-desktop-week-next>Nästa vecka</button>
        </div>
      </header>
      <div class="cco-desktop-week-calendar-grid" data-desktop-week-grid role="grid" aria-label="Veckokalender"></div>
    `;
    const host =
      document.querySelector('[data-booking-calendar-host]') ||
      document.querySelector('[data-app-shell-view="calendar"]') ||
      document.body;
    host.prepend(shell);
    return shell;
  }

  let viewWeekStart = startOfWeek(new Date());

  function renderGrid(shell) {
    const grid = shell.querySelector('[data-desktop-week-grid]');
    if (!grid) return;
    const days = Array.from({ length: 7 }, (_, index) => addDays(viewWeekStart, index));
    grid.innerHTML = days
      .map(
        (day) => `
      <article class="cco-desktop-week-day" role="gridcell">
        <h4>${formatDayLabel(day)}</h4>
        <p class="patient-master-muted">Resurser och tider laddas från bokningsmotorn.</p>
        <button type="button" class="customers-utility-button" data-desktop-week-open-day="${day.toISOString().slice(0, 10)}">
          Öppna dag
        </button>
      </article>`
      )
      .join('');
  }

  function syncVisibility() {
    const shell = ensureShell();
    const calendarView =
      document.documentElement.getAttribute('data-app-shell-view') === 'calendar' ||
      window.location.search.includes('view=calendar');
    const show = isDesktop() && calendarView;
    shell.hidden = !show;
    if (show) renderGrid(shell);
  }

  function bindShell(shell) {
    shell.querySelector('[data-desktop-week-prev]')?.addEventListener('click', () => {
      viewWeekStart = addDays(viewWeekStart, -7);
      renderGrid(shell);
    });
    shell.querySelector('[data-desktop-week-next]')?.addEventListener('click', () => {
      viewWeekStart = addDays(viewWeekStart, 7);
      renderGrid(shell);
    });
    shell.querySelector('[data-desktop-week-today]')?.addEventListener('click', () => {
      viewWeekStart = startOfWeek(new Date());
      renderGrid(shell);
    });
    shell.addEventListener('click', (event) => {
      const button = event.target.closest('[data-desktop-week-open-day]');
      if (!button) return;
      const day = button.getAttribute('data-desktop-week-open-day');
      if (!day) return;
      window.ArcanaBookingMobileCalendar?.open?.({ focusDate: day, desktopHandoff: true });
    });
  }

  function boot() {
    const shell = ensureShell();
    bindShell(shell);
    syncVisibility();
    window.addEventListener('resize', syncVisibility);
    window.addEventListener('popstate', syncVisibility);
    const observer = new MutationObserver(() => window.requestAnimationFrame(syncVisibility));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-app-shell-view'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.ArcanaBookingDesktopWeek = Object.freeze({
    syncVisibility,
    getViewWeekStart: () => new Date(viewWeekStart),
  });
})();
