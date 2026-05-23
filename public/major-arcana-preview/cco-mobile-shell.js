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
    conversations: 'Arbetskö',
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
  });

  const canvas = document.querySelector('.preview-canvas');
  const appTitleEl = document.getElementById('cco-mobile-app-title');
  const tabbar = document.querySelector('[data-cco-mobile-tabbar]');
  const tabButtons = Array.from(document.querySelectorAll('.cco-mobile-tabbar-item[data-mobile-tab]'));
  const moreSheet = document.getElementById('cco-mobile-more-sheet');
  const moreItems = Array.from(document.querySelectorAll('.cco-mobile-more-item[data-nav-view]'));

  let moreOpen = false;
  let explicitBookingTab = false;

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function applyMobileShellState() {
    const on = isMobile();
    document.documentElement.toggleAttribute('data-cco-mobile-shell', on);
    document.documentElement.toggleAttribute('data-cco-mobile-tabbar', on);
    if (!on) {
      setMoreOpen(false);
      explicitBookingTab = false;
    } else {
      syncFromApp();
    }
  }

  function clickNavView(viewKey) {
    const key = String(viewKey || '').trim();
    if (!key) return false;
    const button = document.querySelector(`.preview-nav [data-nav-view="${key}"], .preview-more-item[data-nav-view="${key}"]`);
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  function setMobileWorkspaceFocus() {
    const focusBtn = document.querySelector('[data-mobile-workspace-view="focus"]');
    focusBtn?.click();
  }

  function navigateToBooking() {
    explicitBookingTab = true;
    clickNavView('conversations');
    window.setTimeout(() => {
      setMobileWorkspaceFocus();
      syncFromApp();
    }, 0);
  }

  function setMoreOpen(open) {
    moreOpen = open === true;
    if (!moreSheet) return;
    moreSheet.hidden = !moreOpen;
    document.documentElement.toggleAttribute('data-cco-mobile-more-open', moreOpen);
    if (moreOpen) {
      moreSheet.querySelector('.cco-mobile-more-item')?.focus?.();
    }
  }

  function resolveActiveTab(shellView, mobileWorkspaceView) {
    if (explicitBookingTab && shellView === 'conversations' && mobileWorkspaceView === 'focus') {
      return 'booking';
    }
    if (shellView === 'customers') return 'customers';
    if (AUX_VIEWS.has(shellView)) return 'more';
    if (shellView === 'conversations' && mobileWorkspaceView === 'focus') return 'booking';
    return 'queue';
  }

  function resolveAppTitle(shellView, normalizedView) {
    if (shellView === 'customers') {
      const name = document.querySelector('[data-patient-detail] h2, .patient-master-hero h2')?.textContent?.trim();
      return name || VIEW_LABELS.customers;
    }
    if (normalizedView && VIEW_LABELS[normalizedView]) return VIEW_LABELS[normalizedView];
    if (shellView && VIEW_LABELS[shellView]) return VIEW_LABELS[shellView];
    return VIEW_LABELS.conversations;
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

  function syncFromApp() {
    if (!isMobile() || !canvas) return;

    const shellView = canvas.dataset.appShellView || 'conversations';
    const normalizedView = canvas.dataset.appView || 'conversations';
    const mobileWorkspaceView = canvas.dataset.mobileWorkspaceView || 'queue';

    if (shellView !== 'conversations' || mobileWorkspaceView !== 'focus') {
      explicitBookingTab = false;
    }

    const activeTab = resolveActiveTab(shellView, mobileWorkspaceView);
    syncTabbar(activeTab);
    syncAppTitle(resolveAppTitle(shellView, normalizedView));

    moreItems.forEach((item) => {
      const view = item.dataset.navView || '';
      item.classList.toggle('is-active', normalizeView(view) === normalizeView(normalizedView));
    });
  }

  function normalizeView(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function bindTabbar() {
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.mobileTab || '';
        if (tab === 'more') {
          setMoreOpen(!moreOpen);
          syncFromApp();
          return;
        }
        setMoreOpen(false);
        if (tab === 'booking') {
          navigateToBooking();
          return;
        }
        explicitBookingTab = false;
        const viewKey = button.dataset.navView || (tab === 'queue' ? 'conversations' : tab);
        clickNavView(viewKey);
        window.setTimeout(syncFromApp, 0);
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
        clickNavView(item.dataset.navView);
        setMoreOpen(false);
        window.setTimeout(syncFromApp, 0);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && moreOpen) {
        setMoreOpen(false);
      }
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

  bindTabbar();
  bindMoreSheet();
  applyMobileShellState();
  observeCanvas();

  try {
    window.matchMedia(MQ).addEventListener('change', applyMobileShellState);
  } catch {
    window.addEventListener('resize', applyMobileShellState);
  }

  window.ArcanaMobileShell = Object.freeze({
    syncFromApp,
    isMobile,
    setMoreOpen,
  });
})();
