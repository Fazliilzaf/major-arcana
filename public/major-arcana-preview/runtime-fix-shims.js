/**
 * runtime-fix-shims.js — körs efter app.js för att patcha P0-buggar i preview
 *
 * P0-1: Persistera selectedMailboxIds mellan sessions (localStorage)
 * P0-2: Fallback för "Okänd avsändare" — MIGRERAD till runtime-queue-renderers.js
 *       (window.MajorArcanaCustomerNameResolver) 2026-05-07
 *
 * Dessa är non-invasive shims som hookar DOM + storage utan att ändra app.js.
 * När fixen byggs in i app.js permanent kan denna fil tas bort.
 */
(() => {
  'use strict';

  const LS_KEY_SELECTED = 'cco.selectedMailboxIds.v1';
  const DEFAULT_MAILBOXES = ['contact','egzona','fazli','info','kons','marknad'];

  // ============================================================
  // P0-1: Mailbox-val persistens
  // ============================================================

  function readPersistedMailboxes() {
    try {
      const raw = localStorage.getItem(LS_KEY_SELECTED);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  function writePersistedMailboxes(ids) {
    try {
      const safe = Array.isArray(ids) ? ids : [];
      localStorage.setItem(LS_KEY_SELECTED, JSON.stringify(safe));
    } catch (e) {}
  }

  function getCurrentlyCheckedMailboxes() {
    const checks = document.querySelectorAll('input[type="checkbox"][data-mailbox-id], input[type="checkbox"][data-mailbox-key]');
    const ids = [];
    checks.forEach(cb => {
      if (cb.checked) {
        const id = cb.dataset.mailboxId || cb.dataset.mailboxKey;
        if (id) ids.push(id);
      }
    });
    return ids;
  }

  function findMailboxRowsInDom() {
    // Mailbox-options container kan ha olika klassnamn — försök flera
    const containers = [
      '.mailbox-options',
      '[data-mailbox-options]',
      '[data-mailbox-list]',
      '[data-mailbox-picker]',
    ];
    for (const sel of containers) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function applyPersistedMailboxes() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return false;

    let applied = 0;
    // Strategi: hitta alla mailbox-checkboxes och markera de som matchar persisted-listan
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      const labelEl = cb.closest('label') || cb.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      const matchedKey = persisted.find(k => labelText.includes(k.toLowerCase()));
      if (matchedKey && !cb.checked) {
        // Trigga click istället för bara setChecked så app.js sin event-handler körs
        cb.click();
        applied += 1;
      }
    });
    if (applied > 0) {
      console.log('[fix-shim] Återställde', applied, 'mailbox-val från localStorage');
    }
    return applied > 0;
  }

  function findMailboxToggleButton() {
    // Försök olika selektorer
    const selectors = [
      '[data-mailbox-toggle]',
      '[data-mailbox-picker-toggle]',
      '[data-truth-mailbox-toggle]',
      '.mailbox-toggle',
      '.mailbox-picker-toggle',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Fallback: text-baserad sökning. Mailbox-väljaren har label som "Hair TP Clinic - Inga mailboxar"
    // eller "Hair TP Clinic - Egzona +5"
    const candidates = document.querySelectorAll('button, label, [role="button"], [role="combobox"]');
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (txt.length > 0 && txt.length < 80 && /Hair TP Clinic|mailboxar|mailboxes/i.test(txt)) {
        return el;
      }
    }
    return null;
  }

  async function autoOpenAndApplyAtBootstrap() {
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return;

    // Anropas bara när toggle redan är i DOM (via MutationObserver i
    // bootstrapMailboxPersistence) — ingen hardcoded sleep behövs.

    // Kolla om checkboxes redan finns i DOM (dropdown öppen)
    const existingCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter(cb => {
        const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
        return DEFAULT_MAILBOXES.some(m => lbl.includes(m));
      });
    if (existingCheckboxes.length > 0) {
      // Kanske redan öppen — försök applicera direkt
      applyPersistedMailboxes();
      return;
    }

    // Annars: hitta toggle och öppna
    const toggle = findMailboxToggleButton();
    if (!toggle) {
      console.warn('[fix-shim] Hittar inte mailbox-toggle vid bootstrap — kan inte återställa val automatiskt');
      return;
    }

    // Klicka för att öppna dropdown
    toggle.click();
    await new Promise(r => setTimeout(r, 600)); // Vänta på render

    // Klicka checkboxes
    const applied = applyPersistedMailboxes();

    // Stäng dropdown genom att klicka utanför
    await new Promise(r => setTimeout(r, 300));
    const outside = document.body;
    outside.click();
    // Klick på Escape som backup
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    if (applied) {
      console.log('[fix-shim] Auto-återställde', persisted.length, 'mailbox-val vid bootstrap');
    }
  }

  function watchMailboxChanges() {
    // Lyssna på alla checkbox-changes globalt och spara tillstånd
    document.addEventListener('change', (e) => {
      if (e.target?.type !== 'checkbox') return;
      const labelEl = e.target.closest('label') || e.target.parentElement;
      const labelText = (labelEl?.textContent || '').toLowerCase();
      // Bara om det ser ut som en mailbox-checkbox
      const isMailboxCheckbox = DEFAULT_MAILBOXES.some(m => labelText.includes(m));
      if (!isMailboxCheckbox) return;

      // Samla alla nu-checkade mailbox-namn
      const checked = [];
      document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const lbl = (cb.closest('label')?.textContent || '').toLowerCase();
        const matched = DEFAULT_MAILBOXES.find(m => lbl.includes(m));
        if (matched) checked.push(matched);
      });
      writePersistedMailboxes([...new Set(checked)]);
    }, true);
  }

  function bootstrapMailboxPersistence() {
    // Spara: delegerad change-handler fångar checkbox-toggles oavsett när de mountas.
    watchMailboxChanges();

    // Återställ: om inget persisted finns, gör inget alls.
    const persisted = readPersistedMailboxes();
    if (!persisted || persisted.length === 0) return;

    // Snabbväg: om toggle redan finns i DOM (sällsynt vid bootstrap), kör direkt.
    if (findMailboxToggleButton()) {
      autoOpenAndApplyAtBootstrap().catch(e => console.warn('[fix-shim] auto-open fel:', e));
      return;
    }

    // Annars: en MutationObserver som triggar EN GÅNG när toggle mountas, sen disconnect.
    // Ersätter setInterval-pollingen (6×500ms) som missade race-conditions.
    let triggered = false;
    const observer = new MutationObserver(() => {
      if (triggered) return;
      if (findMailboxToggleButton()) {
        triggered = true;
        observer.disconnect();
        autoOpenAndApplyAtBootstrap().catch(e => console.warn('[fix-shim] auto-open fel:', e));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Säkerhetsnät: koppla bort efter 30s om toggle aldrig dyker upp.
    setTimeout(() => { if (!triggered) observer.disconnect(); }, 30000);
  }

  // P0-2: "Okänd avsändare"-fallback — MIGRERAD till runtime-queue-renderers.js
  // 2026-05-07. Hela koden (worklist-fetch, customer-map, scan-and-fix) lever
  // nu i renderern och körs vid varje render istället för setInterval(1500ms).

  // P1-1: Klick på thread-card — MIGRERAD till runtime-queue-renderers.js
  // 2026-05-07. Den delegerade click-handlern lever nu nära renderern som
  // bygger korten. Pointer-event-backup borttagen (workspace-API alltid
  // exponerad via app.js).

  // P1-4: Live-pill — MIGRERAD till runtime-queue-renderers.js 2026-05-07
  // 1s×30 ticks + 5s setInterval borttagna. Pillen uppdateras nu via
  // render-hooks + cco:state-change / cco:runtime-update events.

  // P2-3: Mailbox-counts — MIGRERAD till runtime-queue-renderers.js 2026-05-07
  // 1500ms DOM-poll borttagen, ersatt med MutationObserver. 60s API-fetch behållen.

  // ============================================================
  // P0-3: Logout-knapp i Mer-meny
  // Migrerad: knappen ligger nu direkt i index.html (data-shim-logout="1").
  // Bara click-handler + Cmd+Shift+L kvar. Ingen setInterval.
  // ============================================================

  function logout() {
    try {
      localStorage.removeItem('ARCANA_ADMIN_TOKEN');
      localStorage.removeItem('cco.selectedMailboxIds.v1');
    } catch (_e) {}
    window.location.href = '/';
  }

  function bootstrapLogout() {
    // Delegerad click-handler — fungerar oavsett när knappen mountas
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('[data-shim-logout]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Logga ut? Token rensas och du måste logga in igen.')) {
        logout();
      }
    }, true);
    // Kortkommando: Cmd+Shift+L
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (confirm('Logga ut? (Cmd+Shift+L)')) logout();
      }
    });
  }

  // ============================================================
  // P1-A: Theme-switcher — hooka utility-button till runtime-theme
  // ============================================================

  function bootstrapThemeSwitcher() {
    // Migrerad till delegerad click-handler — ingen wireUp-loop, ingen setInterval,
    // ingen dataset-flag. Träffar alla theme-knappar oavsett när de mountas.
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest(
        '.preview-utility-button[aria-label*="läge"], ' +
        'button[aria-label="Ljusläge"], ' +
        'button[aria-label="Mörkläge"], ' +
        'button[aria-label="Mörkt läge"]'
      );
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (window.MajorArcanaPreviewTheme?.toggleTheme) {
        const next = window.MajorArcanaPreviewTheme.toggleTheme();
        const labels = { light: 'Mörkläge', dark: 'Systemläge', system: 'Ljusläge' };
        btn.setAttribute('aria-label', labels[next] || 'Tema');
      } else {
        // Fallback: toggla data-theme manuellt
        const cur = document.documentElement.getAttribute('data-theme') || 'system';
        const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('cco.theme', next); } catch (_e) {}
      }
    }, true);
  }

  // P1-B: Filter-chips — MIGRERAD till runtime-queue-renderers.js + cco-polish.css
  // 2026-05-07. Click-handler + state-logik bor nu i renderers (med hook
  // efter varje render istället för setInterval-poll). CSS:en ligger i
  // @layer components. Active-flagga renamed: shim-active-filter → is-active-filter.

  // P1-C: Sök-filter — MIGRERAD till runtime-queue-renderers.js 2026-05-07
  // Re-apply körs nu efter varje render så filtret "håller" mellan re-renders.

  // P2-1: Status-label översättning + "undefined"-rensning — MIGRERAD till
  // runtime-queue-renderers.js 2026-05-07. Två setInterval(1500ms)-loopar
  // borta. Exponerad via window.MajorArcanaStatusFixer.run() för manuell trigg.

  // P1-D: Responsiv layout — migrerad till cco-polish.css (@layer components)
  // 2026-05-07. Funktionen togs bort eftersom CSS:en nu lever permanent i
  // stylesheet:n istället för att injiceras runtime via <style>-tag.

  // ============================================================
  // Bootstrap
  // ============================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    try { bootstrapMailboxPersistence(); } catch (e) { console.warn('[fix-shim] mailbox-persistens fel:', e); }
    // P1-1: bootstrapThreadCardClickFix borttagen — migrerad till runtime-queue-renderers.js
    // P1-4: bootstrapLivePill borttagen — migrerad till runtime-queue-renderers.js
    // P2-1: bootstrapStatusLabelFix + bootstrapAggressiveStatusFix borttagna — migrerade till runtime-queue-renderers.js
    // P1-D: injectResponsiveLayoutFix borttagen — migrerad till cco-polish.css
    // P2-3: bootstrapMailboxCounts borttagen — migrerad till runtime-queue-renderers.js
    try { bootstrapLogout(); } catch (e) { console.warn('[fix-shim] logout fel:', e); }
    try { bootstrapThemeSwitcher(); } catch (e) { console.warn('[fix-shim] theme-switcher fel:', e); }
    // P1-B: bootstrapSecondaryFilters borttagen — migrerad till runtime-queue-renderers.js + cco-polish.css
    // P1-C: bootstrapSearchFilter borttagen — migrerad till runtime-queue-renderers.js
    // P0-2: okänd-avsändare-fix initieras nu av runtime-queue-renderers.js
    // (window.MajorArcanaCustomerNameResolver) och körs vid varje render.
    console.log('[fix-shim] runtime-fix-shims aktiv (mailbox-persistens + thread-card-click + live-pill + status-labels + mailbox-counts + logout + theme + filter + search)');
  }
})();
