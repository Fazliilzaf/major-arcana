/**
 * Major Arcana Preview — Session Timeout + Idle Detection (S5).
 *
 * Två timers:
 *   • Idle-timeout (default 15 min): visar lock-screen om ingen aktivitet
 *   • Session-max (default 8h): tvångs-logout efter total session-tid
 *
 * Aktivitet räknas: pointer-rörelse, klick, tangenttryck, scroll, focus.
 *
 * Lock-screen: full-screen overlay som kräver Enter eller klick för att låsa upp.
 * I framtida iteration: kräv password/totp för att låsa upp.
 *
 * Konfiguration via window.__CCO_SESSION_CONFIG__:
 *   { idleMinutes, maxSessionMinutes, requireUnlock }
 */
(() => {
  'use strict';

  const cfg = (typeof window !== 'undefined' && window.__CCO_SESSION_CONFIG__) || {};
  const IDLE_MINUTES = Math.max(2, Number(cfg.idleMinutes) || 15);
  const MAX_SESSION_MINUTES = Math.max(30, Number(cfg.maxSessionMinutes) || 480); // 8h
  const REQUIRE_UNLOCK = cfg.requireUnlock !== false;

  let sessionStartedAt = Date.now();
  let lastActivityAt = Date.now();
  let idleTimer = 0;
  let sessionTimer = 0;
  let lockOverlay = null;
  let isLocked = false;

  function injectStyles() {
    if (document.getElementById('cco-session-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-session-styles';
    style.textContent = `
.cco-session-lock {
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(20, 18, 16, 0.96);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  display: flex; align-items: center; justify-content: center;
  flex-direction: column;
  gap: 18px; padding: 24px;
  color: #fbf7f1;
  font-family: inherit;
}
.cco-session-lock-icon {
  font-size: 56px; opacity: 0.85;
  animation: cco-session-pulse 2s ease-in-out infinite;
}
@keyframes cco-session-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50% { transform: scale(1.05); opacity: 1; }
}
.cco-session-lock-title { font-size: 22px; font-weight: 600; margin: 0; }
.cco-session-lock-subtitle { font-size: 14px; opacity: 0.75; margin: 0; max-width: 420px; text-align: center; line-height: 1.45; }
.cco-session-lock-btn {
  margin-top: 12px;
  padding: 12px 24px;
  background: #fbf7f1; color: #2b251f;
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: transform 0.12s ease;
}
.cco-session-lock-btn:hover { transform: translateY(-2px); }
.cco-session-lock-meta {
  position: absolute; bottom: 18px; left: 0; right: 0;
  text-align: center; font-size: 11px; opacity: 0.55;
}
`.trim();
    document.head.appendChild(style);
  }

  function buildLockOverlay() {
    injectStyles();
    const el = document.createElement('div');
    el.className = 'cco-session-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Sessionen är låst');
    el.setAttribute('data-cco-session-lock', '');
    el.innerHTML = `
      <span class="cco-session-lock-icon" aria-hidden="true">🔒</span>
      <h2 class="cco-session-lock-title">Sessionen är låst</h2>
      <p class="cco-session-lock-subtitle">
        Du har varit inaktiv i mer än ${IDLE_MINUTES} minuter.
        ${REQUIRE_UNLOCK ? 'Klicka på knappen eller tryck på Enter för att fortsätta.' : ''}
      </p>
      <button class="cco-session-lock-btn" type="button" data-cco-session-unlock>Lås upp</button>
      <div class="cco-session-lock-meta">CCO låses automatiskt vid inaktivitet för säkerhet.</div>
    `;
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        unlock();
      }
    });
    el.querySelector('[data-cco-session-unlock]').addEventListener('click', unlock);
    return el;
  }

  function lock() {
    if (isLocked) return;
    isLocked = true;
    if (!lockOverlay) lockOverlay = buildLockOverlay();
    if (!document.body.contains(lockOverlay)) {
      document.body.appendChild(lockOverlay);
    }
    lockOverlay.style.display = 'flex';
    // Fokusera unlock-knappen för tangentbordsanvändare
    requestAnimationFrame(() => {
      try { lockOverlay.querySelector('[data-cco-session-unlock]')?.focus(); } catch (_e) {}
    });
  }

  function unlock() {
    if (!isLocked) return;
    isLocked = false;
    if (lockOverlay) lockOverlay.style.display = 'none';
    lastActivityAt = Date.now();
    resetIdleTimer();
  }

  function forceLogout(reason) {
    // Trigger logga ut via existing API om finns, annars rensa lokal state
    try {
      if (window.localStorage) {
        window.localStorage.removeItem('cco.adminToken');
      }
      if (window.sessionStorage) {
        window.sessionStorage.removeItem('cco.adminToken');
      }
    } catch (_e) {}
    // Visa hård logout-overlay
    if (!lockOverlay) lockOverlay = buildLockOverlay();
    lockOverlay.querySelector('.cco-session-lock-title').textContent = 'Session avslutad';
    lockOverlay.querySelector('.cco-session-lock-subtitle').textContent =
      `Sessionen har överskridit max-tiden (${Math.round(MAX_SESSION_MINUTES / 60)}h). Logga in igen för att fortsätta.`;
    const btn = lockOverlay.querySelector('[data-cco-session-unlock]');
    btn.textContent = 'Logga in igen';
    btn.addEventListener('click', () => location.reload(), { once: true });
    if (!document.body.contains(lockOverlay)) document.body.appendChild(lockOverlay);
    lockOverlay.style.display = 'flex';
    isLocked = true;
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(lock, IDLE_MINUTES * 60 * 1000);
  }

  function resetSessionTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    const elapsedMs = Date.now() - sessionStartedAt;
    const remainingMs = MAX_SESSION_MINUTES * 60 * 1000 - elapsedMs;
    if (remainingMs <= 0) {
      forceLogout('max_session_exceeded');
      return;
    }
    sessionTimer = window.setTimeout(() => {
      forceLogout('max_session_exceeded');
    }, remainingMs);
  }

  function onActivity() {
    if (isLocked) return; // Aktivitet under lock räknas inte
    lastActivityAt = Date.now();
    resetIdleTimer();
  }

  function bindActivityListeners() {
    const events = ['mousedown', 'keydown', 'scroll', 'pointermove', 'touchstart', 'focus'];
    let lastFire = 0;
    const throttledOnActivity = () => {
      const now = Date.now();
      if (now - lastFire < 500) return; // throttle till 2x/sek
      lastFire = now;
      onActivity();
    };
    for (const ev of events) {
      window.addEventListener(ev, throttledOnActivity, { passive: true, capture: true });
    }
  }

  function mount() {
    injectStyles();
    sessionStartedAt = Date.now();
    lastActivityAt = Date.now();
    bindActivityListeners();
    resetIdleTimer();
    resetSessionTimer();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewSessionTimeout = Object.freeze({
      mount,
      lock,
      unlock,
      forceLogout,
      isLocked: () => isLocked,
      getIdleMinutes: () => IDLE_MINUTES,
      getMaxSessionMinutes: () => MAX_SESSION_MINUTES,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
