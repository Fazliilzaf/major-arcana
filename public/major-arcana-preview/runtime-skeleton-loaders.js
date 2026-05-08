/**
 * Major Arcana Preview — Skeleton Loaders (P2 Prestanda & UX).
 *
 * Visar shimmer-animerade placeholder-element medan data laddas. Ger UX-känslan
 * av snabbhet även när backend tar tid.
 *
 * Aktiveras automatiskt:
 *   • Kö-listan: visa skeleton-kort när data-runtime-thread är 0 OCH state är loading
 *   • Fokuspanelen: skeleton för conversation-area när ingen tråd är vald + loading
 *   • Studio: skeleton för draft-textarea innan AI-utkast laddats
 *
 * Frivillig manuell trigger via:
 *   window.MajorArcanaPreviewSkeletonLoaders.show('queue' | 'focus' | 'studio')
 *   window.MajorArcanaPreviewSkeletonLoaders.hide('queue' | 'focus' | 'studio')
 */
(() => {
  'use strict';

  let initialized = false;
  let queueObserver = null;

  function injectStyles() {
    if (document.getElementById('cco-skeleton-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-skeleton-styles';
    style.textContent = `
@keyframes cco-skeleton-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.cco-skeleton {
  background: linear-gradient(
    90deg,
    rgba(80, 60, 40, 0.05) 0%,
    rgba(80, 60, 40, 0.10) 50%,
    rgba(80, 60, 40, 0.05) 100%
  );
  background-size: 800px 100%;
  animation: cco-skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
  display: inline-block;
  vertical-align: middle;
}
[data-cco-theme="dark"] .cco-skeleton,
.is-dark .cco-skeleton,
html[data-theme="dark"] .cco-skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 800px 100%;
}

/* Kö-skeletter */
.cco-skeleton-thread-list {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px;
}
.cco-skeleton-thread-card {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}
.cco-skeleton-thread-row1 {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
}
.cco-skeleton-avatar { width: 36px; height: 36px; border-radius: 50%; }
.cco-skeleton-name { height: 13px; width: 38%; }
.cco-skeleton-meta { height: 10px; width: 60px; margin-left: auto; }
.cco-skeleton-preview { height: 11px; width: 86%; margin-bottom: 6px; }
.cco-skeleton-preview-2 { height: 11px; width: 64%; }
.cco-skeleton-chips { display: flex; gap: 5px; margin-top: 10px; }
.cco-skeleton-chip { height: 16px; width: 64px; border-radius: 999px; }

/* Fokuspanel-skelett */
.cco-skeleton-focus {
  padding: 24px;
}
.cco-skeleton-focus-title { height: 18px; width: 50%; margin-bottom: 12px; }
.cco-skeleton-focus-meta { height: 11px; width: 38%; margin-bottom: 22px; }
.cco-skeleton-focus-message {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  margin-bottom: 12px;
}
.cco-skeleton-focus-message-line { height: 12px; margin-bottom: 6px; }

/* Studio-skelett */
.cco-skeleton-studio-textarea {
  height: 120px; width: 100%; border-radius: 10px;
}

[data-cco-theme="dark"] .cco-skeleton-thread-card,
[data-cco-theme="dark"] .cco-skeleton-focus-message,
.is-dark .cco-skeleton-thread-card,
.is-dark .cco-skeleton-focus-message,
html[data-theme="dark"] .cco-skeleton-thread-card,
html[data-theme="dark"] .cco-skeleton-focus-message {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
}
`.trim();
    document.head.appendChild(style);
  }

  function buildQueueSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'cco-skeleton-thread-card';
    card.setAttribute('data-cco-skeleton', 'thread');
    card.innerHTML = `
      <div class="cco-skeleton-thread-row1">
        <span class="cco-skeleton cco-skeleton-avatar"></span>
        <span class="cco-skeleton cco-skeleton-name"></span>
        <span class="cco-skeleton cco-skeleton-meta"></span>
      </div>
      <span class="cco-skeleton cco-skeleton-preview"></span>
      <span class="cco-skeleton cco-skeleton-preview-2"></span>
      <div class="cco-skeleton-chips">
        <span class="cco-skeleton cco-skeleton-chip"></span>
        <span class="cco-skeleton cco-skeleton-chip"></span>
        <span class="cco-skeleton cco-skeleton-chip"></span>
      </div>
    `;
    return card;
  }

  function findQueueListContainer() {
    return (
      document.querySelector('[data-runtime-thread-list]') ||
      document.querySelector('.queue-thread-list') ||
      document.querySelector('.thread-list') ||
      document.querySelector('.queue-shell .queue-list') ||
      document.querySelector('.queue-shell')
    );
  }

  function showQueueSkeleton({ count = 5 } = {}) {
    injectStyles();
    const container = findQueueListContainer();
    if (!container) return false;
    if (container.querySelector('[data-cco-skeleton-list]')) return true;
    const wrapper = document.createElement('div');
    wrapper.className = 'cco-skeleton-thread-list';
    wrapper.setAttribute('data-cco-skeleton-list', 'queue');
    for (let i = 0; i < count; i++) {
      wrapper.appendChild(buildQueueSkeletonCard());
    }
    if (container.firstChild) {
      container.insertBefore(wrapper, container.firstChild);
    } else {
      container.appendChild(wrapper);
    }
    return true;
  }

  function hideQueueSkeleton() {
    document.querySelectorAll('[data-cco-skeleton-list="queue"]').forEach((el) => {
      try { el.remove(); } catch (_e) {}
    });
  }

  function showFocusSkeleton() {
    injectStyles();
    const container =
      document.querySelector('[data-focus-panel="conversation"]') ||
      document.querySelector('.focus-main') ||
      document.querySelector('.focus-shell');
    if (!container) return false;
    if (container.querySelector('[data-cco-skeleton="focus"]')) return true;
    const wrap = document.createElement('div');
    wrap.className = 'cco-skeleton-focus';
    wrap.setAttribute('data-cco-skeleton', 'focus');
    wrap.innerHTML = `
      <div class="cco-skeleton cco-skeleton-focus-title"></div>
      <div class="cco-skeleton cco-skeleton-focus-meta"></div>
      <div class="cco-skeleton-focus-message">
        <div class="cco-skeleton cco-skeleton-focus-message-line" style="width:92%"></div>
        <div class="cco-skeleton cco-skeleton-focus-message-line" style="width:86%"></div>
        <div class="cco-skeleton cco-skeleton-focus-message-line" style="width:72%"></div>
      </div>
      <div class="cco-skeleton-focus-message">
        <div class="cco-skeleton cco-skeleton-focus-message-line" style="width:82%"></div>
        <div class="cco-skeleton cco-skeleton-focus-message-line" style="width:90%"></div>
      </div>
    `;
    if (container.firstChild) {
      container.insertBefore(wrap, container.firstChild);
    } else {
      container.appendChild(wrap);
    }
    return true;
  }

  function hideFocusSkeleton() {
    document.querySelectorAll('[data-cco-skeleton="focus"]').forEach((el) => {
      try { el.remove(); } catch (_e) {}
    });
  }

  function showStudioSkeleton() {
    injectStyles();
    const target =
      document.querySelector('textarea[data-studio-draft]') ||
      document.querySelector('.studio-draft-textarea');
    if (!target) return false;
    if (target.parentNode?.querySelector('[data-cco-skeleton="studio"]')) return true;
    const sk = document.createElement('div');
    sk.className = 'cco-skeleton cco-skeleton-studio-textarea';
    sk.setAttribute('data-cco-skeleton', 'studio');
    target.parentNode.insertBefore(sk, target);
    target.style.display = 'none';
    return true;
  }

  function hideStudioSkeleton() {
    document.querySelectorAll('[data-cco-skeleton="studio"]').forEach((el) => {
      try { el.remove(); } catch (_e) {}
    });
    const draft =
      document.querySelector('textarea[data-studio-draft]') ||
      document.querySelector('.studio-draft-textarea');
    if (draft) draft.style.display = '';
  }

  // --- Auto-skeleton för kö ---
  // Visa skeleton om kö-listan är tom OCH state.runtime.loading === true
  function maybeAutoShowQueueSkeleton() {
    const realThreads = document.querySelectorAll('[data-runtime-thread]:not([data-followup-filter-hidden])');
    const hasReal = realThreads.length > 0;
    const isLoading =
      document.querySelector('[data-runtime-loading="true"]') ||
      document.body?.classList?.contains('is-runtime-loading') ||
      false;
    if (hasReal) {
      hideQueueSkeleton();
      return;
    }
    // Visa skeleton i 1500ms maximum vid initial load
    showQueueSkeleton({ count: 5 });
  }

  function bindAutoSkeleton() {
    if (queueObserver) return;
    if (typeof MutationObserver !== 'function') return;
    let scheduled = false;
    queueObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        maybeAutoShowQueueSkeleton();
      });
    });
    queueObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-runtime-thread', 'data-runtime-loading'],
    });

    // Kör en tidig pass för att visa skeleton direkt vid mount
    requestAnimationFrame(() => maybeAutoShowQueueSkeleton());

    // Säkerhet: rensa skeleton efter 8 sek oavsett (failsafe)
    setTimeout(hideQueueSkeleton, 8000);
  }

  function show(target) {
    if (target === 'queue') return showQueueSkeleton();
    if (target === 'focus') return showFocusSkeleton();
    if (target === 'studio') return showStudioSkeleton();
    return false;
  }

  function hide(target) {
    if (target === 'queue') return hideQueueSkeleton();
    if (target === 'focus') return hideFocusSkeleton();
    if (target === 'studio') return hideStudioSkeleton();
  }

  function mount() {
    if (initialized) return;
    initialized = true;
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindAutoSkeleton, { once: true });
    } else {
      bindAutoSkeleton();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewSkeletonLoaders = Object.freeze({
      mount,
      show,
      hide,
      showQueueSkeleton,
      hideQueueSkeleton,
      showFocusSkeleton,
      hideFocusSkeleton,
      showStudioSkeleton,
      hideStudioSkeleton,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
