/**
 * ORD-16 / H — v9 kundvy interaktioner (mockup-paritet).
 * Additivt: overlays + kortkommandon. Gate: data-v9-enabled=on + customers-vy.
 */
(function () {
  'use strict';

  const VOICE_WORDS = ['Boka', 'Anna', 'PRP', 'nästa', 'tisdag', 'fjorton', 'hos', 'Egzona'];
  let voiceTimers = [];
  let searchSelectedIdx = 0;
  let searchResults = [];

  function isV9On() {
    return document.documentElement.getAttribute('data-v9-enabled') === 'on';
  }

  function isV9DemoOn() {
    return (
      isV9On() &&
      (document.documentElement.getAttribute('data-v9-demo') === 'on' ||
        window.__ARCANA_V9_DEMO_ENABLED__ === true)
    );
  }

  function isCustomersView() {
    const canvas = document.querySelector('.preview-canvas');
    return canvas && canvas.dataset.appShellView === 'customers';
  }

  function isActiveScope() {
    return isV9On() && isCustomersView();
  }

  function isDemoChromeScope() {
    return isV9DemoOn() && isCustomersView();
  }

  function isTypingTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureEl(id, className, html) {
    let node = document.getElementById(id);
    if (node) return node;
    node = document.createElement('div');
    node.id = id;
    node.className = className;
    node.innerHTML = html;
    node.hidden = true;
    document.body.appendChild(node);
    return node;
  }

  function ensureSearchOverlay() {
    return ensureEl(
      'v9-search-overlay',
      'v9-search-overlay',
      `
      <div class="v9-search-backdrop" data-v9-search-close></div>
      <div class="v9-search-panel" role="dialog" aria-modal="true" aria-label="Sök kunder">
        <div class="v9-search-panel-input">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>
          <input type="search" data-v9-search-input placeholder="Sök kund, telefon, behandling…" autocomplete="off" />
          <kbd>Esc</kbd>
        </div>
        <div class="v9-search-panel-kicker">Kunder</div>
        <div class="v9-search-panel-list" data-v9-search-list role="listbox"></div>
      </div>`
    );
  }

  function ensureVoiceOverlay() {
    ensureEl(
      'v9-voice-overlay',
      'v9-voice-overlay',
      `
      <div class="v9-voice-orb" aria-hidden="true"></div>
      <div class="v9-voice-text" data-v9-voice-text></div>
      <div class="v9-voice-hint">Säg vad du vill boka — mock i v9</div>
      <button type="button" class="v9-voice-cancel" data-v9-voice-cancel>Avbryt</button>`
    );
    return ensureEl(
      'v9-voice-sheet',
      'v9-voice-sheet',
      `
      <div class="v9-voice-sheet-kicker">★ AI · TOLKAT</div>
      <h3>Förslag</h3>
      <p class="v9-voice-sheet-original">"Boka Anna PRP nästa tisdag fjorton hos Egzona"</p>
      <dl class="v9-voice-sheet-grid">
        <dt>Kund</dt><dd>Anna Karlsson</dd>
        <dt>Behandling</dt><dd>PRP</dd>
        <dt>Tid</dt><dd>Nästa tisdag 14:00</dd>
        <dt>Personal</dt><dd>Egzona</dd>
      </dl>
      <div class="v9-voice-sheet-actions">
        <button type="button" class="v9-voice-confirm" data-v9-voice-confirm>✓ Bekräfta mock</button>
        <button type="button" class="v9-voice-close" data-v9-voice-close>Stäng</button>
      </div>`
    );
  }

  function ensureCalmBanner() {
    return ensureEl(
      'v9-calm-banner',
      'v9-calm-banner',
      '<span aria-hidden="true">🌙</span> Lugnt läge — färre distraktioner'
    );
  }

  function ensureCamOverlay() {
    return ensureEl(
      'v9-cam-overlay',
      'v9-cam-overlay',
      `
      <div class="v9-cam-head">
        <div class="v9-cam-head-meta">
          <strong data-v9-cam-name>Kund</strong>
          <span>Klinisk dokumentation · mock</span>
        </div>
        <button type="button" class="v9-cam-close" data-v9-cam-close title="Stäng">×</button>
      </div>
      <div class="v9-cam-stage">
        <div class="v9-cam-preview">📷 Foto-flöde (mock)</div>
        <p class="v9-cam-note">Fortsätt för att öppna enhetens kamera / filväljare.</p>
      </div>
      <div class="v9-cam-actions">
        <button type="button" class="v9-cam-shutter" data-v9-cam-continue>Ta bild</button>
      </div>`
    );
  }

  function collectSearchResults(query) {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const rows = Array.from(document.querySelectorAll('[data-customer-list] [data-patient-row]'));
    return rows
      .map((row) => {
        const id = row.getAttribute('data-patient-row') || '';
        const name = row.querySelector('.cr-name')?.textContent?.trim() || id;
        const sub =
          row.querySelector('.cr-meta')?.textContent?.trim() ||
          row.querySelector('.cr-ai')?.textContent?.trim() ||
          '';
        const hay = `${name} ${sub} ${row.textContent || ''} ${id}`.toLowerCase();
        return { id, name, sub, hay };
      })
      .filter((item) => item.id && (!q || item.hay.includes(q)))
      .slice(0, 12);
  }

  function renderSearchList() {
    const overlay = ensureSearchOverlay();
    const list = overlay.querySelector('[data-v9-search-list]');
    if (!list) return;
    if (!searchResults.length) {
      list.innerHTML = '<p class="v9-search-empty">Inga träffar.</p>';
      searchSelectedIdx = 0;
      return;
    }
    searchSelectedIdx = Math.min(searchSelectedIdx, searchResults.length - 1);
    list.innerHTML = searchResults
      .map(
        (item, idx) =>
          `<button type="button" class="v9-search-result${idx === searchSelectedIdx ? ' is-selected' : ''}" data-v9-search-result="${escapeHtml(item.id)}" role="option">${escapeHtml(item.name)}<span>${escapeHtml(item.sub || item.id)}</span></button>`
      )
      .join('');
  }

  function openSearch() {
    if (!isActiveScope()) return;
    const overlay = ensureSearchOverlay();
    const input = overlay.querySelector('[data-v9-search-input]');
    overlay.hidden = false;
    overlay.classList.add('is-visible');
    searchResults = collectSearchResults('');
    searchSelectedIdx = 0;
    renderSearchList();
    window.requestAnimationFrame(() => input?.focus());
  }

  function closeSearch() {
    const overlay = document.getElementById('v9-search-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlay.hidden = true;
    const input = overlay.querySelector('[data-v9-search-input]');
    if (input) input.value = '';
    searchResults = [];
    searchSelectedIdx = 0;
  }

  function selectSearchResult(patientId) {
    closeSearch();
    const row = document.querySelector(
      `[data-patient-row="${String(patientId).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
    );
    if (row) row.click();
  }

  function stopVoice() {
    const overlay = document.getElementById('v9-voice-overlay');
    overlay?.classList.remove('is-active');
    voiceTimers.forEach((t) => window.clearTimeout(t));
    voiceTimers = [];
  }

  function startVoice() {
    if (!isActiveScope()) return;
    ensureVoiceOverlay();
    const overlay = document.getElementById('v9-voice-overlay');
    const text = overlay?.querySelector('[data-v9-voice-text]');
    const sheet = document.getElementById('v9-voice-sheet');
    if (!overlay || !text) return;
    sheet?.classList.remove('is-visible');
    stopVoice();
    overlay.classList.add('is-active');
    text.innerHTML = '';
    VOICE_WORDS.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = (i === 0 ? '' : ' ') + word;
      text.appendChild(span);
    });
    voiceTimers = VOICE_WORDS.map((_, i) =>
      window.setTimeout(() => text.children[i]?.classList.add('is-visible'), 300 + i * 280)
    );
    voiceTimers.push(
      window.setTimeout(
        () => {
          stopVoice();
          sheet?.classList.add('is-visible');
        },
        300 + VOICE_WORDS.length * 280 + 500
      )
    );
  }

  function showCalmBanner() {
    if (!isActiveScope()) return;
    const banner = ensureCalmBanner();
    banner.classList.add('is-visible');
    window.clearTimeout(showCalmBanner._timer);
    showCalmBanner._timer = window.setTimeout(() => banner.classList.remove('is-visible'), 4000);
  }

  let camContinueHandler = null;

  function openCamOverlay(triggerBtn) {
    if (!isActiveScope()) return;
    const overlay = ensureCamOverlay();
    const name =
      document.querySelector('.v9-dossier-hero .dossier-name')?.textContent?.trim() ||
      document.querySelector('[data-patient-row].is-selected .cr-name')?.textContent?.trim() ||
      'Kund';
    const nameNode = overlay.querySelector('[data-v9-cam-name]');
    if (nameNode) nameNode.textContent = name;
    camContinueHandler = () => {
      const localInput = triggerBtn?.querySelector?.('[data-patient-photo-camera]');
      if (localInput) {
        localInput.click();
        return;
      }
      document
        .querySelector('.v9-mockup-dossier .v9-camera-bridge [data-patient-photo-camera]')
        ?.click();
    };
    overlay.classList.add('is-visible');
    overlay.hidden = false;
  }

  function closeCamOverlay() {
    const overlay = document.getElementById('v9-cam-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlay.hidden = true;
    camContinueHandler = null;
  }

  function teardownDemoOverlays() {
    [
      'v9-search-overlay',
      'v9-voice-overlay',
      'v9-voice-sheet',
      'v9-calm-banner',
      'v9-cam-overlay',
    ].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.remove();
    });
    stopVoice();
  }

  function syncDemoChrome() {
    document.getElementById('v9-mockup-label')?.remove();
    document.getElementById('v9-mockup-caption')?.remove();
    if (!isV9On()) {
      teardownDemoOverlays();
      return;
    }
    if (!isDemoChromeScope()) {
      return;
    }
    ensureEl('v9-mockup-label', 'v9-mockup-label', 'v9 · KUNDER');
    ensureEl(
      'v9-mockup-caption',
      'v9-mockup-caption',
      `<strong>v9 Kunder-vyn (demo):</strong> filter-chips · sökbar lista · AI-aggregat · kunddossiér i höger kolumn. Kortkommandon: <span class="key">⌘K</span> sök · <span class="key">V</span> röst · <span class="key">B</span> lugnt läge.`
    );
  }

  function bindOverlayEvents() {
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-v9-search-close]')) {
        closeSearch();
        return;
      }
      const searchOverlay = document.getElementById('v9-search-overlay');
      if (searchOverlay?.classList.contains('is-visible') && event.target === searchOverlay) {
        closeSearch();
        return;
      }
      const searchHit = event.target.closest('[data-v9-search-result]');
      if (searchHit) {
        selectSearchResult(searchHit.getAttribute('data-v9-search-result'));
        return;
      }
      if (event.target.closest('[data-v9-voice-cancel]')) {
        stopVoice();
        document.getElementById('v9-voice-sheet')?.classList.remove('is-visible');
        return;
      }
      if (event.target.closest('[data-v9-voice-close]')) {
        document.getElementById('v9-voice-sheet')?.classList.remove('is-visible');
        return;
      }
      if (event.target.closest('[data-v9-voice-confirm]')) {
        document.getElementById('v9-voice-sheet')?.classList.remove('is-visible');
        return;
      }
      if (event.target.closest('[data-v9-cam-close]')) {
        closeCamOverlay();
        return;
      }
      if (event.target.closest('[data-v9-cam-continue]')) {
        const handler = camContinueHandler;
        closeCamOverlay();
        if (typeof handler === 'function') handler();
        return;
      }
      const camTrigger = event.target.closest('[data-v9-cam-open], .patient-master-camera-button');
      if (camTrigger && isActiveScope() && !event.target.closest('[data-patient-photo-camera]')) {
        event.preventDefault();
        openCamOverlay(camTrigger.closest('.patient-master-camera-button') || camTrigger);
      }
    });

    document.addEventListener('input', (event) => {
      if (!event.target.matches('[data-v9-search-input]')) return;
      searchResults = collectSearchResults(event.target.value);
      searchSelectedIdx = 0;
      renderSearchList();
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (!isActiveScope() || isTypingTarget(event.target)) return;

      const searchOpen = document
        .getElementById('v9-search-overlay')
        ?.classList.contains('is-visible');
      const camOpen = document.getElementById('v9-cam-overlay')?.classList.contains('is-visible');
      const voiceOpen = document
        .getElementById('v9-voice-overlay')
        ?.classList.contains('is-active');

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (searchOpen) closeSearch();
        else openSearch();
        return;
      }

      if (searchOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeSearch();
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          searchSelectedIdx = Math.min(
            searchSelectedIdx + 1,
            Math.max(0, searchResults.length - 1)
          );
          renderSearchList();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          searchSelectedIdx = Math.max(0, searchSelectedIdx - 1);
          renderSearchList();
          return;
        }
        if (event.key === 'Enter' && searchResults[searchSelectedIdx]) {
          event.preventDefault();
          selectSearchResult(searchResults[searchSelectedIdx].id);
        }
        return;
      }

      if (event.key === 'Escape') {
        if (camOpen) {
          event.preventDefault();
          closeCamOverlay();
        } else if (voiceOpen) {
          event.preventDefault();
          stopVoice();
          document.getElementById('v9-voice-sheet')?.classList.remove('is-visible');
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'v') {
        event.preventDefault();
        if (voiceOpen) stopVoice();
        else startVoice();
      } else if (key === 'b') {
        event.preventDefault();
        showCalmBanner();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Dossier accordion (2026-06-05): 1 sektion open åt gången +
  // initial-collapse alla utom första efter dossier-mount.
  // ─────────────────────────────────────────────────────────────
  function bindDossierAccordion() {
    if (!isV9On()) return;
    // Toggle-handler: vid open av en sektion, stäng andra på samma nivå
    document.addEventListener(
      'toggle',
      (event) => {
        if (!isV9On()) return;
        const det = event.target;
        if (!(det instanceof Element)) return;
        if (!det.matches('.v9-dossier-section[data-v9-section]')) return;
        if (!det.open) return;
        const parent = det.parentElement;
        if (!parent) return;
        parent
          .querySelectorAll(':scope > .v9-dossier-section[data-v9-section][open]')
          .forEach((other) => {
            if (other !== det) other.open = false;
          });
      },
      true
    );

    // Initial-collapse: när nytt dossier renderas, stäng alla sektioner utom första.
    const collapseExceptFirst = (root) => {
      const sections = root.querySelectorAll('.v9-dossier-section[data-v9-section]');
      if (!sections.length) return;
      sections.forEach((s, idx) => {
        if (idx === 0) s.open = true;
        else s.open = false;
      });
    };

    // Observera DOM-mutations för att fånga nya dossier-renders.
    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.('.v9-dossier-section[data-v9-section]')) {
            // Single section added — kolla syskon för accordion-konsistens
            const parent = node.parentElement;
            if (parent && parent.querySelectorAll(':scope > .v9-dossier-section[data-v9-section][open]').length > 1) {
              collapseExceptFirst(parent);
            }
          }
          const nested = node.querySelectorAll?.('.v9-dossier-section[data-v9-section]');
          if (nested && nested.length > 1) {
            collapseExceptFirst(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Kör en gång direkt om dossier redan finns
    collapseExceptFirst(document.body);
  }

  if (isV9On()) {
    syncDemoChrome();
    bindOverlayEvents();
    bindKeyboard();
    bindDossierAccordion();
    window.addEventListener('cco:v9-open-search', () => openSearch());
  }
})();
