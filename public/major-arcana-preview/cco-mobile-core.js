'use strict';

(function initCcoMobileCore() {
  const MQ = '(max-width: 768px)';
  let scrollLockCount = 0;
  let savedBodyOverflow = '';
  let offlineBannerEl = null;

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function lockBodyScroll() {
    if (!isMobile()) return;
    scrollLockCount += 1;
    if (scrollLockCount !== 1) return;
    savedBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-cco-scroll-locked', 'on');
  }

  function unlockBodyScroll() {
    if (scrollLockCount <= 0) return;
    scrollLockCount -= 1;
    if (scrollLockCount !== 0) return;
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = '';
    document.documentElement.removeAttribute('data-cco-scroll-locked');
  }

  function forceUnlockBodyScroll() {
    scrollLockCount = 0;
    document.body.style.overflow = savedBodyOverflow || '';
    savedBodyOverflow = '';
    document.documentElement.removeAttribute('data-cco-scroll-locked');
  }

  function ensureOfflineBanner() {
    if (offlineBannerEl) return offlineBannerEl;
    offlineBannerEl = document.createElement('div');
    offlineBannerEl.className = 'cco-mobile-offline-banner';
    offlineBannerEl.hidden = true;
    offlineBannerEl.setAttribute('role', 'status');
    offlineBannerEl.setAttribute('aria-live', 'polite');
    offlineBannerEl.innerHTML =
      '<span class="cco-mobile-offline-banner-text">Ingen uppkoppling — ändringar sparas lokalt när möjligt</span>' +
      '<button type="button" class="cco-mobile-offline-retry">Försök igen</button>';
    document.body.appendChild(offlineBannerEl);
    offlineBannerEl.querySelector('.cco-mobile-offline-retry')?.addEventListener('click', () => {
      window.location.reload();
    });
    return offlineBannerEl;
  }

  function syncOfflineBanner() {
    if (!isMobile()) {
      if (offlineBannerEl) offlineBannerEl.hidden = true;
      return;
    }
    const banner = ensureOfflineBanner();
    banner.hidden = navigator.onLine !== false;
  }

  function observeModalScrollLock() {
    const openSelectors = [
      '#cco-mobile-more-sheet:not([hidden])',
      '#cco-mobile-calendar-sheet[data-open="true"]',
      '.customers-modal-shell[data-open]',
      '#customers-merge-shell[data-open]',
      '#customers-settings-shell[data-open]',
      '#customers-import-shell[data-open]',
      '#customers-split-shell[data-open]',
      '#macro-editor-shell[data-open]',
      '#settings-profile-shell[data-open]',
      '#shell-confirm-shell[data-open]',
      '#mailbox-admin-shell[data-open]',
      '#note-mode-shell[data-open]',
      '.journal-plan-editor-overlay:not([hidden])',
      '.cco-mobile-offer-wizard[data-open="true"]',
    ];

    function countOpenOverlays() {
      return openSelectors.reduce((count, selector) => {
        try {
          return count + document.querySelectorAll(selector).length;
        } catch {
          return count;
        }
      }, 0);
    }

    function syncLock() {
      if (!isMobile()) {
        forceUnlockBodyScroll();
        return;
      }
      const openCount = countOpenOverlays();
      if (openCount > 0 && scrollLockCount === 0) lockBodyScroll();
      if (openCount === 0 && scrollLockCount > 0) forceUnlockBodyScroll();
    }

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(syncLock);
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['hidden', 'data-open', 'class', 'aria-hidden'],
      subtree: true,
      childList: true,
    });
    syncLock();
  }

  function enhanceStickyCtas() {
    if (!isMobile()) return;

    const targets = document.querySelectorAll(
      '[data-staff-login-form] .patient-master-login-button, ' +
        '[data-tp-journal-save-form] [type="submit"], ' +
        '[data-clinical-journal-save-form] [type="submit"], ' +
        '.booking-shell-actions .booking-shell-primary, ' +
        '.cco-mobile-offer-wizard [data-offer-wizard-next], ' +
        '.cco-mobile-offer-wizard [data-offer-wizard-submit]'
    );

    targets.forEach((button) => {
      if (button.closest('.cco-mobile-sticky-cta-bar')) return;
      const form = button.closest('form') || button.closest('.booking-shell-body') || button.parentElement;
      if (!form || form.dataset.ccoStickyCta === '1') return;
      form.dataset.ccoStickyCta = '1';

      const bar = document.createElement('div');
      bar.className = 'cco-mobile-sticky-cta-bar';
      const clone = button.cloneNode(true);
      clone.classList.add('cco-mobile-sticky-cta-button');
      if (clone.id) clone.id = `${clone.id}-sticky`;
      bar.appendChild(clone);
      form.appendChild(bar);

      clone.addEventListener('click', (event) => {
        event.preventDefault();
        button.click();
      });
    });
  }

  function convertMailTablesToCards() {
    if (!isMobile()) return;
    document.querySelectorAll('.conversation-mail-body table').forEach((table) => {
      if (table.dataset.ccoMobileCards === '1') return;
      table.dataset.ccoMobileCards = '1';
      table.classList.add('cco-mobile-table-as-cards');
    });
  }

  function repairDisplayFilename(name) {
    const text = String(name || '').trim();
    if (!text || !/(?:\?\?|\uFFFD|Ã.|â€)/.test(text)) return text;
    try {
      const bytes = new Uint8Array([...text].map((ch) => ch.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8').decode(bytes);
      if (decoded && decoded !== text && !/\?\?/.test(decoded)) return decoded;
    } catch {
      /* ignore */
    }
    return text;
  }

  function applyFilenameRepairs(root = document) {
    root.querySelectorAll('.patient-master-file-list a, .patient-master-file-list strong').forEach((node) => {
      const fixed = repairDisplayFilename(node.textContent);
      if (fixed && fixed !== node.textContent.trim()) {
        node.textContent = fixed;
      }
    });
  }

  function boot() {
    syncOfflineBanner();
    observeModalScrollLock();
    enhanceStickyCtas();
    convertMailTablesToCards();
    applyFilenameRepairs();
  }

  window.addEventListener('online', syncOfflineBanner);
  window.addEventListener('offline', syncOfflineBanner);

  try {
    window.matchMedia(MQ).addEventListener('change', () => {
      syncOfflineBanner();
      enhanceStickyCtas();
      convertMailTablesToCards();
    });
  } catch {
    window.addEventListener('resize', boot);
  }

  const domObserver = new MutationObserver(() => {
    window.requestAnimationFrame(() => {
      enhanceStickyCtas();
      convertMailTablesToCards();
      applyFilenameRepairs();
    });
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.ArcanaMobileCore = Object.freeze({
    lockBodyScroll,
    unlockBodyScroll,
    forceUnlockBodyScroll,
    repairDisplayFilename,
    enhanceStickyCtas,
  });
})();
