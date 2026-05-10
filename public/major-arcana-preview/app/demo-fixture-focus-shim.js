/**
 * app/demo-fixture-focus-shim.js — FIX12 (focus-pane override för demo-kort).
 *
 * VARFÖR FINNS DEN HÄR FILEN?
 * I demo-mode (utan ARCANA_ADMIN_TOKEN) går focus-pane-renderaren in i
 * "Session krävs"-state eftersom state.runtime.authRequired = true. Den här
 * shim:en lyssnar på klick på demo-kort (.thread-card[data-runtime-thread^="demo-"])
 * och skriver över focus-pane-innehållet med fixture-konversation.
 *
 * VAD SKULLE KRÄVAS FÖR ATT ELIMINERA DEN?
 * 1. Mock-worklist-API (app/mock-worklist-api.js) behöver mocka conversation-
 *    detail-endpointen (sannolikt /api/v1/cco/runtime/conversation/:id eller
 *    motsvarande — leta i app.js efter den URL som triggas av thread-click).
 * 2. ELLER: app:en behöver kunna hantera state.runtime.authRequired=false
 *    för demo-mode, och mock-API:t måste kunna serva ALLA endpoints som
 *    triggas under en thread-detail-load.
 * 3. När conversation-API är mockad → kan FIX12 helt rivas bort, och focus-
 *    pane renderar demo-konversation via samma kodväg som live-data.
 *
 * SLÅ AV: window.__DISABLE_DEMO_FIXTURE_SHIMS = true (gör shim till no-op)
 */
(() => {
  'use strict';

  if (window.__DISABLE_DEMO_FIXTURE_SHIMS === true) {
    return;
  }

  const FIXTURES = window.__DemoFixtures?.data || {};
  if (!FIXTURES || Object.keys(FIXTURES).length === 0) {
    if (typeof console !== 'undefined') {
      console.warn('[demo-fixture-focus-shim] inga fixtures hittade — är demo-fixtures-data.js laddad?');
    }
    return;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function renderConversationEntries(entries) {
    return (entries || [])
      .map((m) => {
        const dir = m.tone === 'outbound' ? 'outbound' : m.tone === 'draft' ? 'draft' : 'inbound';
        const dirLabel = dir === 'outbound' ? 'Skickat' : dir === 'draft' ? 'AI-utkast' : 'Inkommit';
        const bodyHtml = escHtml(m.text || '').replace(/\n+/g, '</p><p>');
        return (
          '<article class="conversation-entry conversation-entry-demo conversation-entry-' + dir + '" ' +
          'style="border:1px solid rgba(215,130,90,0.18);border-radius:14px;padding:14px 16px;margin-bottom:12px;background:' +
          (dir === 'outbound' ? 'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(244,235,224,0.95) 100%)' :
           dir === 'draft' ? 'linear-gradient(180deg,rgba(255,247,235,0.96) 0%,rgba(255,234,201,0.96) 100%)' :
                             'linear-gradient(180deg,rgba(255,255,255,0.95) 0%,rgba(252,247,243,0.95) 100%)') +
          ';">' +
          '<div class="conversation-entry-meta" style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:11.5px;color:#8a7460;">' +
          '<strong style="font-weight:600;color:#3b2f25;">' + escHtml(m.from) + '</strong>' +
          '<span>' + escHtml(dirLabel) + ' · ' + escHtml(m.time) + '</span>' +
          '</div>' +
          '<div class="conversation-entry-body" style="font-size:13.5px;line-height:1.55;color:#2b251f;"><p>' +
          bodyHtml +
          '</p></div>' +
          '</article>'
        );
      })
      .join('');
  }

  function renderTimeline(items) {
    return (items || [])
      .map((t, i) => '<li style="padding:6px 0;border-bottom:1px dashed rgba(180,150,120,0.2);font-size:12.5px;color:#5d4d3f;">' +
        '<strong style="color:#7a5e44;font-weight:600;">' + (i + 1) + '.</strong> ' + escHtml(t) + '</li>')
      .join('');
  }

  function renderFocusPanelForFixture(fb) {
    const conversationSection = document.querySelector('.focus-section-conversation');
    const layout = document.querySelector('[data-focus-conversation-layout]');
    const titleEl = document.querySelector('[data-focus-title]');
    const statusEl = document.querySelector('[data-focus-status-line]');
    if (!conversationSection || !fb) return false;

    if (titleEl) titleEl.textContent = fb.subject || fb.name;
    if (statusEl) statusEl.textContent = 'Aktiv tråd · ' + fb.mailboxLabel + ' · ' + fb.lane;
    if (layout) layout.classList.remove('is-runtime-empty');

    const conversationHTML =
      '<header style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:8px 4px 14px;border-bottom:1px solid rgba(215,130,90,0.18);margin-bottom:14px;">' +
      '<div>' +
      '<h2 style="font-size:18px;font-weight:600;color:#2b1f15;margin:0 0 4px;">' + escHtml(fb.subject) + '</h2>' +
      '<div style="font-size:12.5px;color:#7a5e44;">' + escHtml(fb.name) + ' · ' + escHtml(fb.email) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">' +
      '<span class="cco-card-badge cco-card-badge-' + escHtml(fb.laneTone) + '" style="padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:600;background:rgba(215,130,90,0.12);color:#a44a1f;">' + escHtml(fb.lane) + '</span>' +
      '<span style="font-size:11px;color:#8a7460;">Inkorg: ' + escHtml(fb.mailboxLabel) + '</span>' +
      '</div>' +
      '</header>' +
      '<section style="margin-bottom:18px;">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#8a7460;font-weight:600;margin-bottom:8px;">Konversation</div>' +
      renderConversationEntries(fb.conversation) +
      '</section>' +
      '<section style="margin-bottom:18px;padding:14px 16px;border-radius:14px;background:rgba(255,250,243,0.85);border:1px solid rgba(215,130,90,0.16);">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#a44a1f;font-weight:600;margin-bottom:8px;">Risk</div>' +
      '<p style="font-size:13px;line-height:1.55;color:#3b2f25;margin:0;">' + escHtml(fb.risk) + '</p>' +
      '</section>' +
      '<section style="margin-bottom:18px;padding:14px 16px;border-radius:14px;background:rgba(244,250,243,0.85);border:1px solid rgba(120,170,140,0.22);">' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#3a7a4d;font-weight:600;margin-bottom:8px;">Nästa steg</div>' +
      '<p style="font-size:13px;line-height:1.55;color:#1f3f2a;margin:0;">' + escHtml(fb.nextStep) + '</p>' +
      '</section>' +
      '<section>' +
      '<div style="font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;color:#8a7460;font-weight:600;margin-bottom:8px;">Tidslinje</div>' +
      '<ul style="list-style:none;padding:0;margin:0;">' + renderTimeline(fb.timeline) + '</ul>' +
      '</section>';

    const conversationList = conversationSection.querySelector('[data-focus-conversation], .conversation-list, .focus-conversation-content');
    if (conversationList) {
      conversationList.innerHTML = conversationHTML;
    } else {
      const oldEntries = conversationSection.querySelectorAll('.conversation-entry');
      oldEntries.forEach((n) => n.remove());
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-fixture-focus-content';
      wrapper.innerHTML = conversationHTML;
      conversationSection.appendChild(wrapper);
    }
    const notesHead = document.querySelector('.focus-notes-head h3');
    if (notesHead) notesHead.textContent = 'Anteckningar för ' + fb.name;
    return true;
  }

  function clearDemoFocusContent() {
    const conversationSection = document.querySelector('.focus-section-conversation');
    if (!conversationSection) return;
    conversationSection.querySelectorAll('.demo-fixture-focus-content').forEach((n) => n.remove());
  }

  function bindDemoCardClickToFocus() {
    document.addEventListener('click', (ev) => {
      const card = ev.target.closest && ev.target.closest('[data-runtime-thread^="demo-"]');
      if (!card) return;
      const id = card.dataset.runtimeThread;
      const fb = FIXTURES[id];
      if (!fb) return;
      // Vänta tills standard-renderaren har skrivit "Session krävs"-tomt-state,
      // sedan skriv över med demo-innehåll.
      window.requestAnimationFrame(() => {
        clearDemoFocusContent();
        renderFocusPanelForFixture(fb);
      });
      window.setTimeout(() => {
        clearDemoFocusContent();
        renderFocusPanelForFixture(fb);
      }, 250);
    }, true);
  }

  function bootstrap() {
    bindDemoCardClickToFocus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  // Exponera för debug
  window.__DemoFixtureFocusShim = Object.freeze({
    render: renderFocusPanelForFixture,
    clear: clearDemoFocusContent,
  });
})();
