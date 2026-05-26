"use strict";

(function initCcoMobileCore() {
  const MQ = "(max-width: 1023px)";
  let scrollLockCount = 0;
  let savedBodyOverflow = "";
  let offlineBannerEl = null;

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

  function isCompactViewport() {
    return isMobile() || isTablet();
  }

  function lockBodyScroll() {
    if (!isMobile()) return;
    scrollLockCount += 1;
    if (scrollLockCount !== 1) return;
    savedBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-cco-scroll-locked", "on");
  }

  function unlockBodyScroll() {
    if (scrollLockCount <= 0) return;
    scrollLockCount -= 1;
    if (scrollLockCount !== 0) return;
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = "";
    document.documentElement.removeAttribute("data-cco-scroll-locked");
  }

  function forceUnlockBodyScroll() {
    scrollLockCount = 0;
    document.body.style.overflow = savedBodyOverflow || "";
    savedBodyOverflow = "";
    document.documentElement.removeAttribute("data-cco-scroll-locked");
  }

  function ensureOfflineBanner() {
    if (offlineBannerEl) return offlineBannerEl;
    offlineBannerEl = document.createElement("div");
    offlineBannerEl.className = "cco-mobile-offline-banner";
    offlineBannerEl.hidden = true;
    offlineBannerEl.setAttribute("role", "status");
    offlineBannerEl.setAttribute("aria-live", "polite");
    offlineBannerEl.innerHTML =
      '<span class="cco-mobile-offline-banner-text">Ingen uppkoppling — ändringar sparas lokalt när möjligt</span>' +
      '<button type="button" class="cco-mobile-offline-retry">Försök igen</button>';
    document.body.appendChild(offlineBannerEl);
    offlineBannerEl.querySelector(".cco-mobile-offline-retry")?.addEventListener("click", () => {
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
      "#cco-mobile-more-sheet:not([hidden])",
      '#cco-mobile-calendar-sheet[data-open="true"]',
      "#cco-mobile-offer-wizard:not([hidden])",
      ".cco-queue-row-actions-sheet:not([hidden])",
      ".customers-modal-shell[data-open]",
      "#customers-merge-shell[data-open]",
      "#customers-settings-shell[data-open]",
      "#customers-import-shell[data-open]",
      "#customers-split-shell[data-open]",
      "#macro-editor-shell[data-open]",
      "#settings-profile-shell[data-open]",
      "#shell-confirm-shell[data-open]",
      "#mailbox-admin-shell[data-open]",
      "#note-mode-shell[data-open]",
      ".journal-plan-editor-overlay:not([hidden])",
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
      if (document.querySelector("[data-staff-login-form]")) {
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
      attributeFilter: ["hidden", "data-open", "class", "aria-hidden"],
      subtree: true,
      childList: true,
    });
    syncLock();
  }

  function restoreLoginButton(form) {
    if (!form) return;
    form.querySelector(".cco-mobile-sticky-cta-bar")?.remove();
    const button = form.querySelector(".patient-master-login-button");
    if (!button) return;
    button.hidden = false;
    button.removeAttribute("aria-hidden");
    button.tabIndex = 0;
    button.classList.remove("cco-mobile-sticky-cta-source");
    delete form.dataset.ccoStickyCta;
  }

  function syncAuthMobileState() {
    const loginForm = document.querySelector("[data-staff-login-form]");
    if (loginForm && isMobile()) {
      document.documentElement.setAttribute("data-cco-auth-required", "on");
      restoreLoginButton(loginForm);
      forceUnlockBodyScroll();
      return;
    }
    document.documentElement.removeAttribute("data-cco-auth-required");
  }

  function enhanceStickyCtas() {
    if (!isMobile()) return;

    syncAuthMobileState();

    const targets = document.querySelectorAll(
      '[data-tp-journal-save-form] [type="submit"], ' +
        '[data-clinical-journal-save-form] [type="submit"], ' +
        ".booking-action-row .booking-action-primary, " +
        "#cco-mobile-offer-wizard [data-mobile-offer-wizard-next]:not([hidden]), " +
        "#cco-mobile-offer-wizard [data-mobile-offer-wizard-submit]:not([hidden])"
    );

    targets.forEach((button) => {
      if (button.closest(".cco-mobile-sticky-cta-bar")) return;
      const host =
        button.closest("form") ||
        button.closest(".booking-shell-body") ||
        button.closest("#cco-mobile-offer-wizard") ||
        button.parentElement;
      if (!host || host.dataset.ccoStickyCta === "1") return;
      host.dataset.ccoStickyCta = "1";

      const bar = document.createElement("div");
      bar.className = "cco-mobile-sticky-cta-bar";
      const clone = button.cloneNode(true);
      clone.classList.add("cco-mobile-sticky-cta-button");
      if (clone.id) clone.id = `${clone.id}-sticky`;
      if (button.type === "submit") {
        clone.type = "submit";
        button.type = "button";
      }
      bar.appendChild(clone);
      host.appendChild(bar);

      button.classList.add("cco-mobile-sticky-cta-source");
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
      button.tabIndex = -1;

      clone.addEventListener("click", (event) => {
        event.preventDefault();
        const form = button.closest("form");
        if (form) {
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit(button);
          } else {
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          }
          return;
        }
        button.hidden = false;
        button.click();
        button.hidden = true;
      });
    });
  }

  function convertMailTablesToCards() {
    if (!isMobile()) return;
    document.querySelectorAll(".conversation-mail-body table").forEach((table) => {
      if (table.dataset.ccoMobileCards === "1") return;
      table.dataset.ccoMobileCards = "1";
      table.classList.add("cco-mobile-table-as-cards");
    });
  }

  function repairDisplayFilename(name) {
    const text = String(name || "").trim();
    if (!text || !/(?:\?\?|\uFFFD|Ã.|â€)/.test(text)) return text;
    try {
      const bytes = new Uint8Array([...text].map((ch) => ch.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8").decode(bytes);
      if (decoded && decoded !== text && !/\?\?/.test(decoded)) return decoded;
    } catch {
      /* ignore */
    }
    return text;
  }

  function applyFilenameRepairs(root = document) {
    root
      .querySelectorAll(".patient-master-file-list a, .patient-master-file-list strong")
      .forEach((node) => {
        const fixed = repairDisplayFilename(node.textContent);
        if (fixed && fixed !== node.textContent.trim()) {
          node.textContent = fixed;
        }
      });
  }

  function runDomEnhancements() {
    if (!isMobile()) {
      enhanceStickyCtas();
      convertMailTablesToCards();
      applyFilenameRepairs();
      return;
    }

    syncAuthMobileState();

    const shellView = document.querySelector(".preview-canvas")?.dataset?.appShellView || "";
    const browsingCustomers =
      shellView === "customers" &&
      !document.querySelector("[data-staff-login-form]") &&
      !document.querySelector(
        "[data-tp-journal-save-form], .booking-action-row, #cco-mobile-offer-wizard:not([hidden])"
      );

    if (browsingCustomers) {
      return;
    }

    enhanceStickyCtas();
    convertMailTablesToCards();
    applyFilenameRepairs();
  }

  let domEnhanceTimer = 0;
  function scheduleDomEnhancements() {
    if (domEnhanceTimer) return;
    domEnhanceTimer = window.setTimeout(() => {
      domEnhanceTimer = 0;
      runDomEnhancements();
    }, 100);
  }

  function boot() {
    syncOfflineBanner();
    observeModalScrollLock();
    runDomEnhancements();
  }

  window.addEventListener("online", syncOfflineBanner);
  window.addEventListener("offline", syncOfflineBanner);

  try {
    window.matchMedia(MQ).addEventListener("change", () => {
      syncOfflineBanner();
      enhanceStickyCtas();
      convertMailTablesToCards();
    });
  } catch {
    window.addEventListener("resize", boot);
  }

  const domObserver = new MutationObserver(() => {
    scheduleDomEnhancements();
  });
  const observeTarget = document.querySelector(".preview-canvas") || document.body;
  domObserver.observe(observeTarget, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
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
