/**
 * app/inbox-streak.js — Inbox-zero-streak gamification.
 *
 * Räknar antal dagar i rad användaren har haft tom inbox vid checkpoint.
 * Visar litet pill i topbaren bredvid Live-pillen: "🔥 5 dagar".
 *
 * Logic:
 *  - 1 gång per dag (vid första bootstrap efter midnatt): kolla om inbox är tom
 *  - Om tom: streak +1, persist
 *  - Om inte tom: streak återställs till 0
 *  - Visa pillen om streak ≥ 1
 *
 * Persistens: localStorage 'cco.inboxStreak.v1' = { streak: N, lastCheckedDate: 'YYYY-MM-DD' }
 *
 * Definition av "tom inbox": .queue-history-list innehåller 0 thread-cards
 * EXKLUDERANDE error-placeholders och demo-cards (worklistSource=demo).
 */
(() => {
  'use strict';

  const LS_KEY = 'cco.inboxStreak.v1';

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function readStreak() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { streak: 0, lastCheckedDate: '' };
      const parsed = JSON.parse(raw);
      return {
        streak: Number(parsed?.streak) || 0,
        lastCheckedDate: String(parsed?.lastCheckedDate || ''),
      };
    } catch (_e) {
      return { streak: 0, lastCheckedDate: '' };
    }
  }

  function writeStreak(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (_e) {}
  }

  function isInboxEmpty() {
    const list = document.querySelector('.queue-history-list');
    if (!list) return false;
    const cards = list.querySelectorAll('.thread-card[data-runtime-thread]');
    let real = 0;
    cards.forEach((c) => {
      const id = c.dataset.runtimeThread || '';
      const source = c.dataset.worklistSource || '';
      // Exkludera demo + error-placeholders
      if (id.startsWith('demo-')) return;
      if (id.startsWith('runtime-')) return;
      if (source === 'demo') return;
      real += 1;
    });
    return real === 0;
  }

  // ============================================================
  // Pill rendering
  // ============================================================

  let pillEl = null;
  function ensurePill() {
    if (pillEl) return;
    pillEl = document.createElement('span');
    pillEl.id = 'inbox-streak-pill';
    pillEl.className = 'preview-live-pill inbox-streak-pill';
    pillEl.setAttribute('aria-hidden', 'true');
    pillEl.innerHTML = `
      <span class="inbox-streak-flame" aria-hidden="true">🔥</span>
      <span class="inbox-streak-label">0 dagar</span>
    `;

    // Försök sätta in efter Live-pillen i topbaren
    const livePill = document.getElementById('preview-live-status');
    if (livePill && livePill.parentElement) {
      livePill.parentElement.insertBefore(pillEl, livePill.nextSibling);
    } else {
      // Fallback: lägg sist i topbar-right
      const topbarRight = document.querySelector('.preview-topbar-right');
      if (topbarRight) topbarRight.appendChild(pillEl);
      else return; // ge upp om vi inte hittar någon plats
    }
  }

  function renderPill(streak) {
    if (streak < 1) {
      if (pillEl) {
        pillEl.removeAttribute('data-visible');
        pillEl.setAttribute('aria-hidden', 'true');
      }
      return;
    }
    ensurePill();
    if (!pillEl) return;
    pillEl.setAttribute('data-visible', '');
    pillEl.setAttribute('aria-hidden', 'false');
    pillEl.title = `Inbox-zero-streak: ${streak} dagar i rad med tom inkorg`;
    const labelEl = pillEl.querySelector('.inbox-streak-label');
    if (labelEl) labelEl.textContent = `${streak} ${streak === 1 ? 'dag' : 'dagar'}`;
  }

  // ============================================================
  // Daglig check
  // ============================================================

  function checkAndUpdate() {
    const today = todayString();
    const data = readStreak();
    if (data.lastCheckedDate === today) {
      // Redan checkad idag — visa nuvarande streak
      renderPill(data.streak);
      return;
    }
    // Inte checkad idag — bestäm action
    const empty = isInboxEmpty();
    let nextStreak;
    if (empty) {
      // Bestäm om streaken fortsätter eller börjar om
      // (om lastCheckedDate var igår → +1, annars börja om från 1)
      const yesterday = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      nextStreak = data.lastCheckedDate === yesterday ? data.streak + 1 : 1;
    } else {
      // Inbox INTE tom → reset
      nextStreak = 0;
    }
    writeStreak({ streak: nextStreak, lastCheckedDate: today });
    renderPill(nextStreak);
  }

  // ============================================================
  // Bootstrap
  // ============================================================

  function init() {
    // Vänta tills queue-history-list är populated (FIX14 kan ta 2-3s)
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      const list = document.querySelector('.queue-history-list');
      if (list || attempts >= 20) {
        checkAndUpdate();
      } else {
        setTimeout(tick, 500);
      }
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponera för debug + manuell test
  window.__InboxStreak = Object.freeze({
    check: checkAndUpdate,
    read: readStreak,
    reset: () => {
      writeStreak({ streak: 0, lastCheckedDate: '' });
      renderPill(0);
    },
    fakeStreak: (n) => {
      const today = todayString();
      writeStreak({ streak: n, lastCheckedDate: today });
      renderPill(n);
    },
  });
})();
