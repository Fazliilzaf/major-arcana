"use strict";

(function initBookingLazyLoad() {
  const VERSION = "build-cal-v8-p2-mobile";
  const CSS_HREF = `./cco-calendar.css?v=${VERSION}`;
  const SCRIPTS = Object.freeze({
    shared: `./booking-calendar-shared.js?v=${VERSION}`,
    mobileShell: "./booking-mobile-shell.js?v=build-mobile-shell-e",
    mobileSlot: "./booking-mobile-slot-picker.js?v=build-mobile-shell-e",
    mobileDay: `./booking-mobile-calendar-day.js?v=${VERSION}`,
    desktopWeek: `./booking-desktop-week.js?v=${VERSION}`,
  });

  let loadPromise = null;

  function readInitialView() {
    try {
      return String(new URLSearchParams(window.location.search).get("view") || "customers").trim();
    } catch {
      return "customers";
    }
  }

  function isInboxView(view) {
    return view === "conversations" || view === "inbox" || view === "home" || view === "queue";
  }

  function isMobileViewport() {
    try {
      return window.matchMedia("(max-width: 768px)").matches;
    } catch {
      return false;
    }
  }

  function isTabletViewport() {
    try {
      return window.matchMedia("(min-width: 768px) and (max-width: 1023px)").matches;
    } catch {
      return false;
    }
  }

  function needsMobileCalendarStack() {
    return isMobileViewport() || isTabletViewport();
  }

  function injectStylesheet(href) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Kunde inte ladda ${src}`));
      document.head.appendChild(script);
    });
  }

  function scheduleIdle(fn, timeoutMs) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: timeoutMs });
      return;
    }
    window.setTimeout(fn, Math.min(timeoutMs, 600));
  }

  window.__ARCANA_ENSURE_BOOKING_SCRIPTS__ = function ensureBookingScripts() {
    if (window.__ARCANA_BOOKING_SCRIPTS_READY__) {
      return Promise.resolve();
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      injectStylesheet(CSS_HREF);
      await injectScript(SCRIPTS.shared);
      if (needsMobileCalendarStack()) {
        await injectScript(SCRIPTS.mobileShell);
        await injectScript(SCRIPTS.mobileSlot);
        await injectScript(SCRIPTS.mobileDay);
      }
      await injectScript(SCRIPTS.desktopWeek);
      window.__ARCANA_BOOKING_SCRIPTS_READY__ = true;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });

    return loadPromise;
  };

  window.__ARCANA_OPEN_MOBILE_CALENDAR__ = function openMobileCalendar(options) {
    return window.__ARCANA_ENSURE_BOOKING_SCRIPTS__().then(() => {
      window.ArcanaBookingMobileCalendar?.open?.(options);
    });
  };

  window.__ARCANA_ENSURE_INBOX_SCRIPTS__ = function ensureInboxScripts() {
    if (window.__ARCANA_INBOX_SCRIPTS_READY__) {
      return Promise.resolve();
    }
    if (window.__ARCANA_INBOX_SCRIPTS_PROMISE__) {
      return window.__ARCANA_INBOX_SCRIPTS_PROMISE__;
    }
    window.__ARCANA_INBOX_SCRIPTS_PROMISE__ = injectScript(
      "./cco-mobile-queue.js?v=build-mobile-shell-e"
    )
      .then(() => {
        window.__ARCANA_INBOX_SCRIPTS_READY__ = true;
      })
      .catch((error) => {
        window.__ARCANA_INBOX_SCRIPTS_PROMISE__ = null;
        throw error;
      });
    return window.__ARCANA_INBOX_SCRIPTS_PROMISE__;
  };

  function prefetchBookingShared() {
    if (document.querySelector(`link[rel="prefetch"][href="${SCRIPTS.shared}"]`)) return;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "script";
    link.href = SCRIPTS.shared;
    document.head.appendChild(link);
  }

  function watchBookingOverlay() {
    const canvas = document.querySelector(".preview-canvas");
    if (!canvas) return;
    const observer = new MutationObserver(() => {
      if (canvas.classList.contains("is-booking-open")) {
        void window.__ARCANA_ENSURE_BOOKING_SCRIPTS__().catch(() => {});
      }
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["class"] });
  }

  function boot() {
    const view = readInitialView();
    if (view === "calendar") {
      void window.__ARCANA_ENSURE_BOOKING_SCRIPTS__().catch((error) => {
        console.warn("Kalender kunde inte laddas.", error);
      });
    } else if (!isInboxView(view)) {
      scheduleIdle(prefetchBookingShared, 3500);
    }
    watchBookingOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
