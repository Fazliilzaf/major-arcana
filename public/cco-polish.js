/* ============================================================
   CCO POLISH-BUNDLE (JS)
   ============================================================
   • Theme toggle (light/dark/auto med localStorage-persist)
   • Skip-link injection
   • Print-date stamp
   • Virtual scroll helper (för listor > 5000 rader)
   • A11y-fixar: roll-augmentering, kbd-nav

   Användning i varje vy:
     <script src="/cco-polish.js" defer></script>
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'cco-theme';
  const SUPPORTED_THEMES = ['light', 'dark', 'auto'];

  // ─────────── THEME ───────────
  function getStoredTheme() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_THEMES.includes(v) ? v : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_) {}
    updateToggleIcon(theme);
  }

  function nextTheme(current) {
    const order = ['auto', 'light', 'dark'];
    return order[(order.indexOf(current) + 1) % order.length];
  }

  function updateToggleIcon(theme) {
    const btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    const icons = { auto: '◐', light: '☀', dark: '☾' };
    const labels = { auto: 'Auto (följ system)', light: 'Ljust läge', dark: 'Mörkt läge' };
    btn.textContent = icons[theme] || '◐';
    btn.setAttribute('aria-label', `Tema: ${labels[theme] || theme}. Klicka för att byta.`);
    btn.title = labels[theme] || theme;
  }

  function injectThemeToggle() {
    if (document.querySelector('.theme-toggle')) return;
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const cur = getStoredTheme();
      applyTheme(nextTheme(cur));
    });
    document.body.appendChild(btn);
    updateToggleIcon(getStoredTheme());
  }

  // ─────────── SKIP-LINK ───────────
  function injectSkipLink() {
    if (document.querySelector('.a11y-skip')) return;
    const main = document.querySelector('main, [role="main"], .main, .layout > main, .panel') || document.body;
    if (!main.id) main.id = 'main-content';
    const a = document.createElement('a');
    a.className = 'a11y-skip';
    a.href = '#' + main.id;
    a.textContent = 'Hoppa till innehållet';
    document.body.insertBefore(a, document.body.firstChild);
  }

  // ─────────── A11Y AUGMENT ───────────
  function augmentA11y() {
    // Buttons utan type → button (annars submitterar de inom forms)
    document.querySelectorAll('button:not([type])').forEach((b) => (b.type = 'button'));

    // Klickbara divar utan role → button
    document.querySelectorAll('[onclick]:not(button):not(a):not([role])').forEach((el) => {
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      // Enter/Space ska trigga klick
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });

    // Top-nav → role=navigation
    const topNav = document.querySelector('.top-nav');
    if (topNav && !topNav.getAttribute('role')) {
      topNav.setAttribute('role', 'navigation');
      topNav.setAttribute('aria-label', 'Huvudnavigation');
    }

    // Hero → role=banner (om inte redan satt)
    const hero = document.querySelector('.hero');
    if (hero && !hero.getAttribute('role')) {
      hero.setAttribute('role', 'banner');
    }

    // Aside → role=complementary
    document.querySelectorAll('aside:not([role])').forEach((a) => a.setAttribute('role', 'complementary'));

    // Toaster → role=status (live region)
    document.querySelectorAll('.toast').forEach((t) => {
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
    });
  }

  // ─────────── PRINT-DATE STAMP ───────────
  function stampPrintDate() {
    const d = new Date().toLocaleString('sv-SE');
    document.body.setAttribute('data-print-date', d);
  }

  // ─────────── VIRTUAL SCROLL ───────────
  /**
   * Aktiverar windowed rendering på ett scroll-container med många <li>.
   * Aktiveras automatiskt när list-längden > THRESHOLD.
   *
   * Användning:
   *   <ul data-virtual-scroll data-row-height="56">…</ul>
   *
   * Eller programmatiskt:
   *   CCOPolish.virtualize(element, { rowHeight: 56 });
   */
  const THRESHOLD = 5000;
  const DEFAULT_ROW_HEIGHT = 56;
  const BUFFER = 8;

  function virtualize(container, opts = {}) {
    const rowHeight = Number(opts.rowHeight || container.dataset.rowHeight || DEFAULT_ROW_HEIGHT);
    const threshold = Number(opts.threshold || container.dataset.virtualThreshold || THRESHOLD);
    const children = Array.from(container.children);
    if (children.length <= threshold) return; // ingen vinst under tröskeln

    // Spara originalet, ersätt med pad-divar
    const all = children.map((el) => el);
    container.innerHTML = '';
    const totalHeight = all.length * rowHeight;

    const topPad = document.createElement('div');
    const bottomPad = document.createElement('div');
    topPad.setAttribute('aria-hidden', 'true');
    bottomPad.setAttribute('aria-hidden', 'true');
    container.appendChild(topPad);
    container.appendChild(bottomPad);

    container.style.position = container.style.position || 'relative';
    container.style.overflowY = 'auto';
    if (!container.style.maxHeight) container.style.maxHeight = '70vh';

    const visibleCount = Math.ceil(container.clientHeight / rowHeight);

    let rendered = new Map(); // index → element

    function update() {
      const scrollTop = container.scrollTop;
      const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER);
      const endIdx = Math.min(all.length, startIdx + visibleCount + BUFFER * 2);

      // Ta bort rader som ska bort
      for (const [idx, el] of rendered.entries()) {
        if (idx < startIdx || idx >= endIdx) {
          el.remove();
          rendered.delete(idx);
        }
      }

      // Lägg till nya
      for (let i = startIdx; i < endIdx; i++) {
        if (rendered.has(i)) continue;
        const node = all[i];
        rendered.set(i, node);
        // Insert i rätt ordning före bottomPad
        container.insertBefore(node, bottomPad);
      }

      topPad.style.height = startIdx * rowHeight + 'px';
      bottomPad.style.height = (all.length - endIdx) * rowHeight + 'px';
    }

    container.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    update();

    // ARIA-info
    container.setAttribute('role', 'list');
    container.setAttribute('aria-rowcount', String(all.length));
    container.setAttribute('data-virtualized', 'true');

    console.log(`[cco-polish] virtualized list with ${all.length} rows (rendering ${visibleCount + BUFFER * 2} at a time)`);
  }

  function activateVirtualScrolls() {
    document.querySelectorAll('[data-virtual-scroll]').forEach((el) => virtualize(el));
  }

  // ─────────── STAGE-BADGE (LIVE/BETA/DEMO/LOCKED) ───────────
  const STAGE_INFO = {
    live: {
      label: 'Live',
      title: 'Live · driftsatt',
      desc: 'Den här vyn används skarpt med riktig data. Egzona och Fazli kan jobba här idag.',
      meta: 'Wirad mot Cliento + Drive · alla AI-actions kräver klick.',
    },
    beta: {
      label: 'Beta',
      title: 'Beta · testas av personal',
      desc: 'Funktionen fungerar men har inte fått full feedback än. Använd försiktigt och rapportera buggs.',
      meta: 'Real data där det går · vissa actions är ännu inte wirade.',
    },
    demo: {
      label: 'Demo',
      title: 'Demo · mockup',
      desc: 'Visar hur funktionen är tänkt att fungera. Inga actions skickas. Bra för planering.',
      meta: 'Mockad data · vänta med skarp användning tills den blir Live.',
    },
    locked: {
      label: 'Låst',
      title: 'Låst · kräver Fazli innan användning',
      desc: 'Den här vyn har risk-moment (GDPR, omogen AI-modell, eller saknad backend). Kontakta Fazli innan du klickar på något.',
      meta: 'Tas i bruk efter Sprint 1 enligt audit-planen.',
    },
  };

  function injectStageBadge() {
    const stage = document.body.dataset.stage || document.documentElement.dataset.stage;
    if (!stage || !STAGE_INFO[stage]) return;
    if (document.querySelector('.stage-badge')) return;

    const info = STAGE_INFO[stage];
    const btn = document.createElement('button');
    btn.className = 'stage-badge';
    btn.type = 'button';
    btn.dataset.stage = stage;
    btn.textContent = info.label;
    btn.setAttribute('aria-label', `Vy-status: ${info.title}. Klicka för info.`);

    const detail = document.createElement('div');
    detail.className = 'stage-detail';
    detail.setAttribute('role', 'tooltip');
    detail.innerHTML = `
      <h4>${info.title}</h4>
      <p>${info.desc}</p>
      <div class="stage-detail-meta">${info.meta}</div>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      detail.classList.toggle('show');
    });
    document.addEventListener('click', () => detail.classList.remove('show'));

    document.body.appendChild(btn);
    document.body.appendChild(detail);

    // För LOCKED-vyer: visa overlay-varning högst upp
    if (stage === 'locked') {
      const warning = document.createElement('div');
      warning.className = 'stage-warning';
      warning.innerHTML = `
        <span><strong>Den här vyn är låst.</strong> Den har risk-moment (GDPR, omogen AI, eller saknad backend). Prata med Fazli innan du använder den på riktig patientdata.</span>
        <button class="stage-warning-close" type="button">Förstått</button>
      `;
      document.body.appendChild(warning);
      warning.querySelector('.stage-warning-close').addEventListener('click', () => warning.remove());
    }
  }

  // ─────────── FEEDBACK-KNAPP ───────────
  const FEEDBACK_STORAGE_KEY = 'cco-feedback-queue';

  function injectFeedbackButton() {
    if (document.querySelector('.feedback-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'feedback-btn';
    btn.type = 'button';
    btn.textContent = 'Rapportera';
    btn.setAttribute('aria-label', 'Rapportera en bug eller önskemål');
    btn.addEventListener('click', openFeedbackModal);
    document.body.appendChild(btn);
  }

  function openFeedbackModal() {
    if (document.querySelector('.feedback-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'feedback-modal';
    modal.innerHTML = `
      <div class="feedback-modal-inner" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <h3 id="fb-title">Rapportera bug eller önskemål</h3>
        <p class="feedback-sub">Vi sparar lokalt först — Fazli synkar in det till audit-listan vid nästa sprint-planering. Inget patientdata, tack.</p>
        <div class="feedback-types">
          <button type="button" data-type="bug">🐛 Bug</button>
          <button type="button" data-type="missing">❓ Saknas något</button>
          <button type="button" data-type="ux">🎨 UX-knep</button>
          <button type="button" data-type="idea">💡 Idé</button>
        </div>
        <textarea placeholder="Beskriv vad som hände eller önskemålet…" autofocus></textarea>
        <div class="feedback-meta">Sida: <code>${location.pathname}</code> · stage: ${document.body.dataset.stage || 'unknown'}</div>
        <div class="feedback-actions">
          <button type="button" class="cancel">Avbryt</button>
          <button type="button" class="send">Skicka</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const typeButtons = modal.querySelectorAll('.feedback-types button');
    let selectedType = 'bug';
    typeButtons[0].classList.add('active');
    typeButtons.forEach((b) => b.addEventListener('click', () => {
      typeButtons.forEach((o) => o.classList.remove('active'));
      b.classList.add('active');
      selectedType = b.dataset.type;
    }));

    const close = () => modal.remove();
    modal.querySelector('.cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('.send').addEventListener('click', () => {
      const textarea = modal.querySelector('textarea');
      const text = textarea.value.trim();
      if (!text) {
        textarea.focus();
        textarea.style.borderColor = 'var(--cco-status-danger, #b94a4a)';
        return;
      }

      const entry = {
        type: selectedType,
        text,
        page: location.pathname,
        stage: document.body.dataset.stage || 'unknown',
        ts: new Date().toISOString(),
        ua: navigator.userAgent.substring(0, 100),
      };

      try {
        const queue = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
        queue.push(entry);
        localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(queue));
      } catch (_) {}

      // Skicka även till backend om endpoint finns
      fetch('/api/v1/cco-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(() => {});

      modal.querySelector('.feedback-modal-inner').innerHTML = `
        <h3 style="color:var(--cco-status-success,#4a8268)">✓ Tack!</h3>
        <p class="feedback-sub">Din rapport är sparad. Fazli ser den vid nästa sprint-planering.</p>
        <div class="feedback-actions">
          <button type="button" class="send" style="background:var(--cco-status-success,#4a8268)">Stäng</button>
        </div>
      `;
      modal.querySelector('.send').addEventListener('click', close);
      setTimeout(close, 2400);
    });
  }

  // ─────────── UNDO-STACK ───────────
  /**
   * Global undo-stack med Cmd+Z. Användbar från vilken vy som helst.
   *   CCOPolish.pushUndo({ label: 'Bokade Anna', undo: () => fetch(...) });
   */
  const undoStack = [];
  const MAX_UNDO = 10;

  function pushUndo(action) {
    if (!action?.undo || typeof action.undo !== 'function') return;
    undoStack.push({
      ts: Date.now(),
      label: action.label || 'Senaste action',
      undo: action.undo,
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    updateUndoBadge();
  }

  function updateUndoBadge() {
    const btn = document.querySelector('.undo-btn');
    if (!btn) return;
    btn.style.display = undoStack.length ? 'flex' : 'none';
    const count = btn.querySelector('.undo-count');
    if (count) count.textContent = undoStack.length;
  }

  async function performUndo() {
    const action = undoStack.pop();
    if (!action) {
      showToast('Inget att ångra', 'info');
      return;
    }
    try {
      await action.undo();
      showToast(`✓ Ångrade: ${action.label}`, 'success');
    } catch (err) {
      // Re-push så användaren kan försöka igen
      undoStack.push(action);
      showToast(`Kunde inte ångra: ${err.message}`, 'error');
    }
    updateUndoBadge();
  }

  function showToast(text, type = 'info') {
    let toast = document.querySelector('.cco-toast-global');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cco-toast-global';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translate(-50%,12px);padding:11px 22px;border-radius:999px;background:var(--cco-color-brand,#2b251f);color:white;font-size:12.5px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.32);opacity:0;transition:all .24s cubic-bezier(.32,1.2,.64,1);z-index:1200;letter-spacing:.04em';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    if (type === 'success') toast.style.background = 'var(--cco-status-success,#4a8268)';
    else if (type === 'error') toast.style.background = 'var(--cco-status-danger,#b94a4a)';
    else toast.style.background = 'var(--cco-color-brand,#2b251f)';
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%,0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%,12px)';
    }, 2200);
  }

  function injectUndoButton() {
    if (document.querySelector('.undo-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'undo-btn';
    btn.type = 'button';
    btn.title = 'Ångra senaste (Cmd+Z)';
    btn.setAttribute('aria-label', 'Ångra senaste action');
    btn.style.cssText = 'position:fixed;bottom:22px;right:140px;padding:9px 14px;border-radius:999px;background:linear-gradient(135deg,#5a5048,#3a3028);color:white;border:none;font-size:11.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 12px 28px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.18);z-index:500;display:none;align-items:center;gap:7px';
    btn.innerHTML = `↺ Ångra <span class="undo-count" style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:999px;font-size:10px">0</span>`;
    btn.addEventListener('click', performUndo);
    document.body.appendChild(btn);
  }

  // Kbd-shortcut: Cmd+Z (eller Ctrl+Z) — undvik om inom input/textarea/contenteditable
  document.addEventListener('keydown', (e) => {
    const isUndoKey = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey;
    if (!isUndoKey) return;
    const target = e.target;
    if (target.matches('input, textarea, [contenteditable="true"]')) return;
    if (undoStack.length === 0) return;
    e.preventDefault();
    performUndo();
  });

  // ─────────── SPRINT 5.4: COLOR-PRIORITIES (a11y) ───────────
  const CP_STORAGE_KEY = 'cco-color-priorities';
  function applyColorPriorities(on) {
    document.documentElement.setAttribute('data-color-priorities', on ? 'on' : 'off');
    try { localStorage.setItem(CP_STORAGE_KEY, on ? 'on' : 'off'); } catch (_) {}
  }
  function getColorPriorities() {
    try { return localStorage.getItem(CP_STORAGE_KEY) === 'on'; } catch { return false; }
  }

  // ─────────── SPRINT 5.4: BOTTOM-SHEET HELPER ───────────
  function openBottomSheet({ title, subtitle, body, actions }) {
    closeBottomSheet();
    const backdrop = document.createElement('div');
    backdrop.className = 'cco-bottom-sheet-backdrop';
    const sheet = document.createElement('div');
    sheet.className = 'cco-bottom-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.innerHTML = `
      <button class="bs-close" aria-label="Stäng">×</button>
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
      ${subtitle ? `<p class="bs-sub">${escapeHtml(subtitle)}</p>` : ''}
      <div class="bs-body"></div>
      ${actions ? `<div class="bs-actions" style="display:flex;gap:8px;margin-top:14px"></div>` : ''}
    `;
    if (typeof body === 'string') sheet.querySelector('.bs-body').innerHTML = body;
    else if (body instanceof HTMLElement) sheet.querySelector('.bs-body').appendChild(body);

    if (actions) {
      const actBar = sheet.querySelector('.bs-actions');
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = `flex:1;padding:12px;border-radius:12px;border:none;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;${a.primary ? 'background:linear-gradient(135deg,var(--accent-studio,#bb4779),#9e3a68);color:white;box-shadow:0 6px 14px rgba(187,71,121,.28)' : 'background:rgba(132,117,107,.14);color:rgba(70,60,50,.62)'}`;
        b.textContent = a.label;
        b.addEventListener('click', () => { if (a.onClick) a.onClick(); else closeBottomSheet(); });
        actBar.appendChild(b);
      });
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);
    requestAnimationFrame(() => { backdrop.classList.add('show'); sheet.classList.add('show'); });
    sheet.querySelector('.bs-close').addEventListener('click', closeBottomSheet);
    backdrop.addEventListener('click', closeBottomSheet);
  }
  function closeBottomSheet() {
    document.querySelector('.cco-bottom-sheet-backdrop')?.remove();
    document.querySelector('.cco-bottom-sheet')?.remove();
  }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ─────────── SPRINT 5.4: PUSH SUBSCRIPTION ───────────
  async function enablePushNotifications(userId = 'fazli') {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast('Push stöds inte i denna webbläsare', 'error');
      return false;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showToast('Push avslagen — kan aktiveras i webbläsarens inställningar', 'info');
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // applicationServerKey: ... (sätts i prod när VAPID-key finns i env)
      }).catch(() => null);
      if (!sub) {
        showToast('Push subscription misslyckades (VAPID-key saknas i dev)', 'info');
        return false;
      }
      const resp = await fetch('/api/v1/cco-notifications/push-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CCO-Role': 'owner' },
        body: JSON.stringify({ subscription: sub.toJSON(), userId }),
      });
      if (resp.ok) {
        showToast('✓ Push-notiser aktiverade', 'success');
        return true;
      }
      throw new Error('HTTP ' + resp.status);
    } catch (err) {
      showToast('Push-fel: ' + err.message, 'error');
      return false;
    }
  }

  // ─────────── SPRINT 6.5: KORTKOMMANDON ───────────
  /**
   * Globala kortkommandon — registrerade per user via /api/v1/cco-users.
   * Default-actions:
   *   global-search      → öppna sök (om finns)
   *   send-mail          → klicka primär .composer-send-knapp
   *   show-shortcuts     → visa hjälp-overlay
   *   open-kalender      → navigera
   *   open-kunder        → navigera
   *   undo               → CCOPolish.performUndo
   *   feedback           → öppna feedback-modal
   */
  const SHORTCUT_ACTIONS = {
    'global-search': () => {
      const search = document.querySelector('.global-search input, [type="search"]');
      if (search) { search.focus(); search.select(); }
      else showToast('Global sök kommer i nästa version', 'info');
    },
    'send-mail': () => document.querySelector('.composer-send, .send, [data-send-mail]')?.click(),
    'show-shortcuts': () => showShortcutsOverlay(),
    'open-kalender': () => (window.location.href = '/kalender.html'),
    'open-kunder': () => (window.location.href = '/major-arcana-preview/?view=customers&v9=on'),
    'open-konversationer': () => (window.location.href = '/konversationer.html'),
    'open-analytics': () => (window.location.href = '/analytics.html'),
    'undo': () => performUndo(),
    'feedback': () => document.querySelector('.feedback-btn')?.click(),
    'theme-toggle': () => document.querySelector('.theme-toggle')?.click(),
  };
  let userShortcuts = {};

  async function loadUserShortcuts(userId = 'fazli') {
    try {
      const resp = await fetch(`/api/v1/cco-users/${userId}`, { headers: { 'X-CCO-Role': 'operator' } });
      if (!resp.ok) return;
      const u = await resp.json();
      userShortcuts = u.shortcuts || {};
    } catch (_) {}
  }

  function matchShortcut(e) {
    // Bygg kbd-sträng: "cmd+k", "ctrl+shift+enter", "alt+/"
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push(e.metaKey ? 'cmd' : 'ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target.matches('input, textarea, [contenteditable="true"]')) return;
    const combo = matchShortcut(e);
    const action = userShortcuts[combo];
    if (!action) return;
    const fn = SHORTCUT_ACTIONS[action];
    if (typeof fn === 'function') {
      e.preventDefault();
      fn();
    }
  });

  function showShortcutsOverlay() {
    const html = Object.entries(userShortcuts).map(([combo, action]) =>
      `<div style="display:grid;grid-template-columns:120px 1fr;gap:14px;padding:8px 0;border-bottom:1px solid rgba(132,117,107,.14);font-size:12.5px">
        <kbd style="font-family:SFMono-Regular,Menlo,monospace;background:rgba(132,117,107,.14);padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;text-align:center">${combo}</kbd>
        <span style="color:#5a5048">${action.replace(/-/g,' ')}</span>
      </div>`
    ).join('') || '<div style="color:#8a8174;font-size:12px;text-align:center;padding:20px">Inga kortkommandon konfigurerade än. Gå till Inställningar → Kortkommandon.</div>';
    openBottomSheet({
      title: '⌘ Dina kortkommandon',
      subtitle: 'Konfigurerade i Inställningar → Kortkommandon',
      body: html,
      actions: [{ label: 'Stäng', primary: true, onClick: closeBottomSheet }],
    });
  }

  // Expose
  window.CCOShortcuts = {
    register: (combo, action) => { userShortcuts[combo] = action; },
    list: () => userShortcuts,
    actions: SHORTCUT_ACTIONS,
    showHelp: showShortcutsOverlay,
  };

  // ─────────── INIT ───────────
  function init() {
    // Theme: applicera direkt så det inte flickrar
    applyTheme(getStoredTheme());
    applyColorPriorities(getColorPriorities());
    loadUserShortcuts().catch(()=>{});
    injectThemeToggle();
    injectSkipLink();
    augmentA11y();
    stampPrintDate();
    activateVirtualScrolls();
    injectStageBadge();
    injectFeedbackButton();
    injectUndoButton();
  }

  // Expose API
  window.CCOPolish = {
    setTheme: applyTheme,
    getTheme: getStoredTheme,
    virtualize,
    augmentA11y,
    pushUndo,
    performUndo,
    showToast,
    // Sprint 5.4
    setColorPriorities: applyColorPriorities,
    getColorPriorities,
    openBottomSheet,
    closeBottomSheet,
    enablePushNotifications,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
