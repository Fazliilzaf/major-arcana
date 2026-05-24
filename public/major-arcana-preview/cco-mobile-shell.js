'use strict';

(function initCcoMobileShell() {
  const MQ = '(max-width: 768px)';
  const AUX_VIEWS = new Set([
    'later',
    'sent',
    'integrations',
    'macros',
    'settings',
    'showcase',
    'automation',
    'analytics',
  ]);

  const VIEW_LABELS = Object.freeze({
    conversations: 'Hem',
    customers: 'Kunder',
    automation: 'Automatisering',
    analytics: 'Analys',
    later: 'Senare',
    sent: 'Skickat',
    integrations: 'Integrationer',
    macros: 'Makron',
    settings: 'Inställningar',
    showcase: 'Showcase',
    booking: 'Boka',
    calendar: 'Kalender',
    journal: 'Journal',
  });

  const canvas = document.querySelector('.preview-canvas');
  const appTitleEl = document.getElementById('cco-mobile-app-title');
  const backButtonEl = document.getElementById('cco-mobile-back-button');
  const menuButtonEl = document.getElementById('cco-mobile-menu-button');
  const tabbar = document.querySelector('[data-cco-mobile-tabbar]');
  const tabButtons = Array.from(document.querySelectorAll('.cco-mobile-tabbar-item[data-mobile-tab]'));
  const moreSheet = document.getElementById('cco-mobile-more-sheet');
  const moreItems = Array.from(document.querySelectorAll('.cco-mobile-more-item[data-nav-view]'));
  const moreActions = Array.from(document.querySelectorAll('[data-mobile-more-action]'));

  let moreOpen = false;
  let explicitBookingTab = false;
  let explicitCalendarTab = false;
  let explicitJournalTab = false;
  let syncFromAppRaf = 0;
  let mobileNavGeneration = 0;
  const WORKSPACE_OPTS = Object.freeze({
    persist: false,
    resetScroll: false,
    syncShell: false,
  });

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function setShellFlag(name, on) {
    if (on) {
      document.documentElement.setAttribute(name, 'on');
    } else {
      document.documentElement.removeAttribute(name);
    }
  }

  function applyMobileShellState() {
    const on = isMobile();
    setShellFlag('data-cco-mobile-shell', on);
    setShellFlag('data-cco-mobile-tabbar', on);
    if (!on) {
      setMoreOpen(false);
      explicitBookingTab = false;
      explicitCalendarTab = false;
      explicitJournalTab = false;
      window.ArcanaBookingMobileCalendar?.close?.();
    } else {
      syncFromApp();
    }
  }

  function proxyTopbarClick(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    return true;
  }

  function syncMoreActions() {
    const sprintItem = document.querySelector('[data-mobile-more-action="sprint"]');
    const sprintPill = document.querySelector('.preview-sprint-pill');
    if (sprintItem && sprintPill) {
      const label = sprintPill.querySelector('span')?.textContent?.trim();
      if (label) sprintItem.textContent = label;
    }

    const langItem = document.querySelector('[data-mobile-more-action="language"]');
    const langRoot = document.getElementById('cco-langpicker-root');
    const langControl = langRoot?.querySelector('button, select, [role="combobox"], [role="button"]');
    if (langItem) {
      langItem.hidden = !langControl;
    }
  }

  function runMoreAction(action) {
    const key = String(action || '').trim();
    if (!key) return false;
    switch (key) {
      case 'compose':
        return proxyTopbarClick('.preview-compose-pill');
      case 'sprint':
        return proxyTopbarClick('.preview-sprint-pill');
      case 'language':
        return proxyTopbarClick(
          '#cco-langpicker-root button, #cco-langpicker-root select, #cco-langpicker-root [role="combobox"], #cco-langpicker-root [role="button"]'
        );
      default:
        return false;
    }
  }

  function clickNavView(viewKey) {
    const key = String(viewKey || '').trim();
    if (!key) return false;
    if (window.ArcanaAppNav?.setAppView) {
      window.ArcanaAppNav.setAppView(key);
      return true;
    }
    const button = document.querySelector(
      `.preview-nav [data-nav-view="${key}"], .preview-more-item[data-nav-view="${key}"]`
    );
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  function setMobileWorkspace(view, options = {}) {
    if (window.ArcanaAppNav?.setMobileWorkspaceView) {
      window.ArcanaAppNav.setMobileWorkspaceView(view, options);
      return;
    }
    const btn = document.querySelector(`[data-mobile-workspace-view="${view}"]`);
    btn?.click();
  }

  function optimisticTab(tab) {
    if (!tab || tab === 'more') return;
    syncTabbar(tab);
    const title =
      tab === 'home'
        ? VIEW_LABELS.conversations
        : tab === 'customers'
          ? VIEW_LABELS.customers
          : tab === 'booking'
            ? VIEW_LABELS.booking
            : tab === 'calendar'
              ? VIEW_LABELS.calendar
              : tab === 'journal'
                ? VIEW_LABELS.journal
                : '';
    if (title) syncAppTitle(title);
  }

  function setMobileWorkspaceFocus() {
    setMobileWorkspace('focus', WORKSPACE_OPTS);
  }

  function setMobileWorkspaceQueue() {
    setMobileWorkspace('queue', WORKSPACE_OPTS);
  }

  function deferMobileTabWork(fn) {
    const generation = ++mobileNavGeneration;
    const run = () => {
      if (generation !== mobileNavGeneration) return;
      fn();
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function primeMobileTabNavigation(tab) {
    window.ArcanaAppNav?.cancelMobileNavigationWork?.();
    if (!canvas) return;
    switch (tab) {
      case 'home':
      case 'queue':
        document.documentElement.removeAttribute('data-cco-calendar-open');
        canvas.dataset.appShellView = 'conversations';
        canvas.dataset.appView = 'conversations';
        canvas.dataset.mobileWorkspaceView = 'queue';
        break;
      case 'customers':
        document.documentElement.removeAttribute('data-cco-calendar-open');
        canvas.dataset.appShellView = 'customers';
        canvas.dataset.appView = 'customers';
        document.querySelectorAll('[data-shell-view]').forEach((section) => {
          section.hidden = section.dataset.shellView !== 'customers';
        });
        break;
      case 'booking':
        document.documentElement.removeAttribute('data-cco-calendar-open');
        canvas.dataset.appShellView = 'conversations';
        canvas.dataset.appView = 'conversations';
        canvas.dataset.mobileWorkspaceView = 'focus';
        break;
      case 'journal':
        document.documentElement.removeAttribute('data-cco-calendar-open');
        canvas.dataset.appShellView = 'customers';
        canvas.dataset.appView = 'customers';
        break;
      case 'calendar':
        document.documentElement.setAttribute('data-cco-calendar-open', '');
        break;
      default:
        break;
    }
  }

  function navigateToBooking() {
    explicitBookingTab = true;
    explicitCalendarTab = false;
    explicitJournalTab = false;
    window.ArcanaBookingMobileCalendar?.close?.();
    optimisticTab('booking');
    const shellView = canvas?.dataset.appShellView || '';
    const workspaceView = canvas?.dataset.mobileWorkspaceView || '';
    if (shellView === 'conversations' && workspaceView === 'focus') {
      syncFromApp();
      return;
    }
    clickNavView('conversations');
    setMobileWorkspaceFocus();
    syncFromApp();
  }

  function navigateToCalendar() {
    explicitCalendarTab = true;
    explicitBookingTab = false;
    explicitJournalTab = false;
    setMoreOpen(false);
    optimisticTab('calendar');
    window.ArcanaBookingMobileCalendar?.open?.();
    syncFromApp();
  }

  function navigateToJournal() {
    explicitJournalTab = true;
    explicitBookingTab = false;
    explicitCalendarTab = false;
    window.ArcanaBookingMobileCalendar?.close?.();
    optimisticTab('journal');
    clickNavView('customers');
    const ui = window.ArcanaPatientMasterUi;
    const runtime = ui?.getRuntime?.();
    if (runtime?.selectedPatientId && runtime?.detail?.card) {
      ui?.setPatientTab?.('journal');
    } else if (ui?.needsStaffLogin?.()) {
      /* login form handles itself */
    } else {
      ui?.showMobileToast?.('Välj en kund för att öppna journalen.');
    }
    syncFromApp();
  }

  function setMoreOpen(open) {
    moreOpen = open === true;
    if (!moreSheet) return;
    moreSheet.hidden = !moreOpen;
    setShellFlag('data-cco-mobile-more-open', moreOpen);
    if (moreOpen) {
      syncMoreActions();
      moreSheet.querySelector('.cco-mobile-more-item:not([hidden])')?.focus?.();
    } else {
      window.ArcanaMobileCore?.forceUnlockBodyScroll?.();
    }
  }

  function resolveActiveTab(shellView, mobileWorkspaceView) {
    if (document.documentElement.hasAttribute('data-cco-calendar-open')) return 'calendar';
    if (explicitJournalTab && shellView === 'customers') return 'journal';
    if (explicitBookingTab && shellView === 'conversations' && mobileWorkspaceView === 'focus') {
      return 'booking';
    }
    if (shellView === 'customers' && document.documentElement.hasAttribute('data-cco-patient-detail')) {
      const journalPanel = document.querySelector('[data-patient-tab-panel="journal"]:not([hidden])');
      if (journalPanel || runtimeDetailTabIsJournal()) return 'journal';
    }
    if (shellView === 'customers') return 'customers';
    if (AUX_VIEWS.has(shellView)) return 'more';
    if (shellView === 'conversations' && mobileWorkspaceView === 'focus') return 'booking';
    return 'home';
  }

  function runtimeDetailTabIsJournal() {
    const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
    return runtime?.detailTab === 'journal';
  }

  function resolveAppTitle(shellView, mobileWorkspaceView) {
    if (document.documentElement.hasAttribute('data-cco-calendar-open')) {
      return VIEW_LABELS.calendar;
    }
    if (shellView === 'customers') {
      if (document.documentElement.hasAttribute('data-cco-patient-detail')) {
        const runtime = window.ArcanaPatientMasterUi?.getRuntime?.();
        if (runtime?.detailTab === 'journal') return VIEW_LABELS.journal;
        const name = document.querySelector('[data-patient-detail] h2, .patient-master-hero h2')
          ?.textContent?.trim();
        return name || VIEW_LABELS.customers;
      }
      return VIEW_LABELS.customers;
    }
    if (shellView === 'conversations' && mobileWorkspaceView === 'focus') {
      return VIEW_LABELS.booking;
    }
    if (shellView && VIEW_LABELS[shellView]) return VIEW_LABELS[shellView];
    return VIEW_LABELS.conversations;
  }

  function syncBackButton() {
    if (!backButtonEl) return;
    const showBack =
      isMobile() &&
      canvas?.dataset.appShellView === 'customers' &&
      document.documentElement.hasAttribute('data-cco-patient-detail');
    backButtonEl.hidden = !showBack;
    backButtonEl.setAttribute('aria-hidden', showBack ? 'false' : 'true');
  }

  function syncTabbar(activeTab) {
    tabButtons.forEach((button) => {
      const tab = button.dataset.mobileTab || '';
      const isActive = tab === activeTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function syncAppTitle(title) {
    if (!appTitleEl) return;
    const text = String(title || '').trim();
    appTitleEl.textContent = text;
    appTitleEl.hidden = !text;
  }

  function syncFromAppNow() {
    if (!isMobile() || !canvas) return;

    const shellView = canvas.dataset.appShellView || 'conversations';
    const normalizedView = canvas.dataset.appView || 'conversations';
    const mobileWorkspaceView = canvas.dataset.mobileWorkspaceView || 'queue';

    if (shellView !== 'conversations' || mobileWorkspaceView !== 'focus') {
      explicitBookingTab = false;
    }
    if (shellView !== 'customers') {
      explicitJournalTab = false;
    }

    const activeTab = resolveActiveTab(shellView, mobileWorkspaceView);
    syncTabbar(activeTab);
    syncBackButton();
    syncAppTitle(resolveAppTitle(shellView, mobileWorkspaceView));

    moreItems.forEach((item) => {
      const view = item.dataset.navView || '';
      item.classList.toggle('is-active', normalizeView(view) === normalizeView(normalizedView));
    });
    syncMoreActions();
  }

  function syncFromApp() {
    if (!isMobile() || !canvas) return;
    if (syncFromAppRaf) return;
    const schedule =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
    syncFromAppRaf = schedule(() => {
      syncFromAppRaf = 0;
      syncFromAppNow();
    });
  }

  function normalizeView(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function activateMobileTab(tab, { shellBefore = '', workspaceBefore = '' } = {}) {
    explicitCalendarTab = false;
    window.ArcanaBookingMobileCalendar?.close?.();
    window.ArcanaMobileCore?.forceUnlockBodyScroll?.();

    if (tab === 'more') {
      setMoreOpen(!moreOpen);
      syncFromApp();
      return;
    }
    setMoreOpen(false);

    if (tab === 'booking') {
      if (shellBefore === 'conversations' && workspaceBefore === 'focus') {
        explicitBookingTab = true;
        explicitCalendarTab = false;
        explicitJournalTab = false;
        syncFromApp();
        return;
      }
      navigateToBooking();
      return;
    }
    if (tab === 'calendar') {
      navigateToCalendar();
      return;
    }
    if (tab === 'journal') {
      navigateToJournal();
      return;
    }

    explicitBookingTab = false;
    explicitJournalTab = false;
    const viewKey =
      tab === 'home' || tab === 'queue'
        ? 'conversations'
        : String(
            tabButtons.find((node) => node.dataset.mobileTab === tab)?.dataset.navView || tab
          ).trim();

    if (tab === 'customers' && shellBefore === 'customers') {
      syncFromApp();
      return;
    }

    if (tab === 'home' || tab === 'queue') {
      if (shellBefore === 'conversations' && workspaceBefore === 'queue') {
        syncFromApp();
        return;
      }
      setMobileWorkspaceQueue();
      clickNavView('conversations');
      syncFromApp();
      return;
    }

    clickNavView(viewKey);
    syncFromApp();
  }

  function bindTabbar() {
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.mobileTab || '';
        if (tab === 'more') {
          activateMobileTab(tab);
          return;
        }

        const shellBefore = canvas?.dataset.appShellView || '';
        const workspaceBefore = canvas?.dataset.mobileWorkspaceView || '';
        primeMobileTabNavigation(tab);
        optimisticTab(tab === 'queue' ? 'home' : tab);
        deferMobileTabWork(() => activateMobileTab(tab, { shellBefore, workspaceBefore }));
      });
    });
  }

  function bindMoreSheet() {
    moreSheet?.querySelectorAll('[data-mobile-more-close]').forEach((node) => {
      node.addEventListener('click', () => setMoreOpen(false));
    });

    moreItems.forEach((item) => {
      item.addEventListener('click', () => {
        explicitBookingTab = false;
        explicitJournalTab = false;
        explicitCalendarTab = false;
        window.ArcanaBookingMobileCalendar?.close?.();
        clickNavView(item.dataset.navView);
        setMoreOpen(false);
        syncFromApp();
      });
    });

    moreActions.forEach((item) => {
      item.addEventListener('click', () => {
        runMoreAction(item.dataset.mobileMoreAction);
        setMoreOpen(false);
        syncFromApp();
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && moreOpen) {
        setMoreOpen(false);
      }
    });
  }

  function bindMenuButton() {
    menuButtonEl?.addEventListener('click', () => {
      setMoreOpen(!moreOpen);
      syncFromApp();
    });
  }

  function observeCanvas() {
    if (!canvas) return;
    const observer = new MutationObserver(() => {
      syncFromApp();
    });
    observer.observe(canvas, {
      attributes: true,
      attributeFilter: ['data-app-shell-view', 'data-app-view', 'data-mobile-workspace-view'],
    });

    const patientRail = document.querySelector('[data-patient-master-rail]');
    if (patientRail) {
      const patientObserver = new MutationObserver(() => syncFromApp());
      patientObserver.observe(patientRail, { childList: true, subtree: true, characterData: true });
    }
  }

  function bindBackButton() {
    backButtonEl?.addEventListener('click', () => {
      explicitJournalTab = false;
      window.ArcanaPatientMasterUi?.goBackToPatientList?.();
    });
  }

  function observePatientDetailState() {
    const observer = new MutationObserver(() => syncFromApp());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-cco-patient-detail', 'data-cco-calendar-open'],
    });
  }

  bindTabbar();
  bindMoreSheet();
  bindMenuButton();
  bindBackButton();
  applyMobileShellState();
  observeCanvas();
  observePatientDetailState();

  try {
    window.matchMedia(MQ).addEventListener('change', applyMobileShellState);
  } catch {
    window.addEventListener('resize', applyMobileShellState);
  }

  window.ArcanaMobileShell = Object.freeze({
    syncFromApp,
    isMobile,
    setMoreOpen,
    navigateToBooking,
    navigateToCalendar,
    navigateToJournal,
  });
})();
