/**
 * Major Arcana Preview — Thread Summary
 *
 * "Sammanfatta tråden"-knapp + modal som anropar SummarizeThread-capability.
 *
 * Triggers:
 *   - Knapp i fokuspanelens .focus-head (auto-injicerad)
 *   - Cmd+K → "Sammanfatta aktuell tråd"
 *   - JS API: window.MajorArcanaPreviewThreadSummary.summarizeCurrent()
 *
 * Datakälla:
 *   - DOM-skrapning av .focus-message / [data-message-id] för meddelandena
 *   - Aktiv tråd från [data-runtime-thread].thread-card-selected
 *
 * Visning:
 *   - Modal med headline + bullets + "vad har hänt sedan senast"
 *   - Källa-badge: heuristisk eller AI
 */
(() => {
  'use strict';

  let modalBackdrop = null;
  let modalDialog = null;
  let modalContentEl = null;
  let triggerButton = null;
  let isLoading = false;
  let lastVisitedAtByThreadId = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function getActiveThreadElement() {
    return (
      document.querySelector('[data-runtime-thread].thread-card-selected') ||
      document.querySelector('[data-runtime-thread][aria-pressed="true"]') ||
      document.querySelector('[data-runtime-thread].is-selected') ||
      null
    );
  }

  function getActiveThreadId() {
    const el = getActiveThreadElement();
    return el ? el.getAttribute('data-runtime-thread') : '';
  }

  function getCustomerName() {
    const el =
      document.querySelector('[data-focus-customer-name]') ||
      document.querySelector('.focus-customer-name') ||
      document.querySelector('.focus-intel-name-row h4');
    return el ? el.textContent.trim() : '';
  }

  function getThreadSubject() {
    const el =
      document.querySelector('[data-focus-thread-subject]') ||
      document.querySelector('.focus-thread-subject') ||
      document.querySelector('.focus-head h2');
    return el ? el.textContent.trim() : '';
  }

  function gatherMessages() {
    // Plocka strukturerade meddelanden från fokuspanelens conversation-sektion.
    // Olika selektorer beroende på hur preview/live renderar.
    const selectors = [
      '[data-focus-panel="conversation"] [data-message-id]',
      '[data-focus-panel="conversation"] .focus-message',
      '[data-focus-panel="conversation"] article',
    ];

    let nodes = [];
    for (const sel of selectors) {
      nodes = Array.from(document.querySelectorAll(sel));
      if (nodes.length > 0) break;
    }

    return nodes.map((node) => {
      const direction =
        node.getAttribute('data-direction') ||
        (node.classList.contains('is-outbound') ? 'outbound' : 'inbound');
      const sentAt =
        node.getAttribute('data-sent-at') ||
        node.querySelector('[data-sent-at]')?.getAttribute('data-sent-at') ||
        node.querySelector('time')?.getAttribute('datetime') ||
        '';
      const bodyEl =
        node.querySelector('[data-message-body]') ||
        node.querySelector('.focus-message-body') ||
        node.querySelector('.message-body') ||
        node;
      const body = (bodyEl?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      return { direction, sentAt, body };
    });
  }

  async function fetchSummary({ threadId, messages, customerName, subject }) {
    if (typeof window.MajorArcanaPreviewApiRequest === 'function') {
      // Reserved hook om någon vill bypassa
      return window.MajorArcanaPreviewApiRequest({
        threadId, messages, customerName, subject,
      });
    }
    // Anropa via fetch direkt — apiRequest finns men är scoped i app.js
    const lastVisitedAt = lastVisitedAtByThreadId[threadId] || '';
    const body = JSON.stringify({
      input: {
        conversationId: threadId,
        customerName,
        subject,
        lastVisitedAt,
        messages,
      },
    });

    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.sessionStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0] || '__preview_local__';

    const response = await fetch('/api/v1/capabilities/SummarizeThread/run', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_e) { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload?.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  // ---------- UI ----------

  function injectStyles() {
    if (document.getElementById('cco-tsum-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-tsum-styles';
    style.textContent = `
.cco-tsum-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; margin-left: 8px;
  background: rgba(80, 60, 40, 0.08);
  color: #5d4a3c;
  border: 0; border-radius: 999px;
  font-family: inherit; font-size: 11px; font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.12s ease, transform 0.08s ease;
}
.cco-tsum-trigger:hover { background: rgba(80, 60, 40, 0.14); }
.cco-tsum-trigger:active { transform: scale(0.97); }
.cco-tsum-trigger svg { width: 12px; height: 12px; }
.cco-tsum-trigger.is-loading { opacity: 0.6; cursor: wait; }
.cco-tsum-backdrop {
  position: fixed; inset: 0; z-index: 9995;
  background: rgba(20, 18, 16, 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}
.cco-tsum-backdrop[hidden] { display: none; }
.cco-tsum-dialog {
  width: min(640px, 92vw);
  background: #fbf7f1;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.07);
}
.cco-tsum-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.cco-tsum-title {
  font-size: 14px; font-weight: 600; color: #2b251f; margin: 0;
}
.cco-tsum-source {
  font-size: 10px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(80, 60, 40, 0.55);
  background: rgba(80, 60, 40, 0.08);
  padding: 3px 8px; border-radius: 6px;
}
.cco-tsum-source.is-openai {
  background: rgba(40, 130, 90, 0.12);
  color: #1f6e4a;
}
.cco-tsum-content { padding: 18px 24px 24px; }
.cco-tsum-headline {
  font-size: 15px; line-height: 1.4; color: #2b251f; margin: 0 0 14px;
  font-weight: 500;
}
.cco-tsum-bullets { margin: 0 0 16px; padding: 0 0 0 18px; }
.cco-tsum-bullets li {
  font-size: 13px; line-height: 1.5; color: #3a312a;
  margin-bottom: 6px;
}
.cco-tsum-since {
  margin: 14px 0 0; padding: 12px 14px;
  background: rgba(80, 60, 40, 0.06);
  border-radius: 10px;
  font-size: 12px; color: #5d4a3c;
}
.cco-tsum-since strong { color: #2b251f; }
.cco-tsum-empty, .cco-tsum-error {
  padding: 24px; text-align: center; font-size: 13px;
  color: rgba(80, 60, 40, 0.65);
}
.cco-tsum-error { color: #b03232; }
.cco-tsum-icon-button {
  width: 28px; height: 28px; border-radius: 6px;
  border: 0; background: transparent; cursor: pointer;
  color: rgba(80, 60, 40, 0.6); font-size: 16px;
  display: inline-flex; align-items: center; justify-content: center;
}
.cco-tsum-icon-button:hover { background: rgba(80, 60, 40, 0.08); color: #2b251f; }
.cco-tsum-warnings {
  margin: 12px 0 0; font-size: 11px; color: rgba(180, 100, 40, 0.85);
}
.cco-tsum-language {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; margin-bottom: 8px; margin-right: 6px;
  background: rgba(80, 60, 40, 0.06);
  color: #5d4a3c;
  border-radius: 999px;
  font-size: 11px; font-weight: 500;
}
.cco-tsum-language-flag { font-size: 14px; }
.cco-tsum-language-label { font-weight: 600; }
.cco-tsum-language-hint { color: rgba(80, 60, 40, 0.55); font-size: 10px; }
[data-cco-theme="dark"] .cco-tsum-language,
.is-dark .cco-tsum-language,
html[data-theme="dark"] .cco-tsum-language {
  background: rgba(255, 255, 255, 0.08);
  color: #f3ece2;
}
.cco-tsum-guardrail {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; margin-bottom: 12px;
  border-radius: 999px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.02em;
}
.cco-tsum-guardrail.is-verified {
  background: rgba(40, 130, 90, 0.12);
  color: #1f6e4a;
}
.cco-tsum-guardrail.is-unverified {
  background: rgba(180, 100, 40, 0.14);
  color: #8a4a14;
}
.cco-tsum-guardrail.is-sev-critical {
  background: rgba(180, 50, 50, 0.14);
  color: #a82828;
}
.cco-tsum-guardrail-icon { font-size: 13px; }
.cco-tsum-guardrail-count {
  font-size: 10px; font-weight: 500; opacity: 0.75;
  margin-left: 2px;
}
.cco-tsum-violations {
  margin: 14px 0 0;
  padding: 10px 14px;
  background: rgba(180, 100, 40, 0.08);
  border-left: 3px solid rgba(180, 100, 40, 0.35);
  border-radius: 6px;
  font-size: 12px; color: #5d4a3c;
}
.cco-tsum-violations strong { color: #8a4a14; display: block; margin-bottom: 6px; }
.cco-tsum-violations ul { margin: 0; padding-left: 18px; }
.cco-tsum-violations li { margin-bottom: 3px; line-height: 1.4; }
.cco-tsum-violations code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
  font-size: 10px; padding: 1px 5px;
  background: rgba(80, 60, 40, 0.10); border-radius: 4px;
  color: #5d4a3c;
}
.cco-tsum-violations em { color: rgba(80, 60, 40, 0.7); font-style: normal; font-size: 11px; }
[data-cco-theme="dark"] .cco-tsum-violations,
.is-dark .cco-tsum-violations,
html[data-theme="dark"] .cco-tsum-violations {
  background: rgba(180, 100, 40, 0.10);
  color: #ddd1c2;
}
[data-cco-theme="dark"] .cco-tsum-violations code,
.is-dark .cco-tsum-violations code,
html[data-theme="dark"] .cco-tsum-violations code {
  background: rgba(255, 255, 255, 0.08);
  color: #ddd1c2;
}
[data-cco-theme="dark"] .cco-tsum-dialog,
.is-dark .cco-tsum-dialog,
html[data-theme="dark"] .cco-tsum-dialog {
  background: #1f1b16; color: #f3ece2;
  border-color: rgba(255, 255, 255, 0.08);
}
[data-cco-theme="dark"] .cco-tsum-headline,
.is-dark .cco-tsum-headline,
html[data-theme="dark"] .cco-tsum-headline { color: #f3ece2; }
[data-cco-theme="dark"] .cco-tsum-bullets li,
.is-dark .cco-tsum-bullets li,
html[data-theme="dark"] .cco-tsum-bullets li { color: #ddd1c2; }
[data-cco-theme="dark"] .cco-tsum-since,
.is-dark .cco-tsum-since,
html[data-theme="dark"] .cco-tsum-since {
  background: rgba(255, 255, 255, 0.06);
  color: #ddd1c2;
}
`.trim();
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modalBackdrop) return;
    injectStyles();

    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'cco-tsum-backdrop';
    modalBackdrop.setAttribute('hidden', '');

    modalDialog = document.createElement('div');
    modalDialog.className = 'cco-tsum-dialog';
    modalDialog.setAttribute('role', 'dialog');
    modalDialog.setAttribute('aria-modal', 'true');
    modalDialog.setAttribute('aria-label', 'Trådsammanfattning');
    modalDialog.innerHTML = `
      <div class="cco-tsum-header">
        <h3 class="cco-tsum-title">Sammanfattning</h3>
        <span class="cco-tsum-source" data-tsum-source>Heuristisk</span>
        <button class="cco-tsum-icon-button" type="button" data-tsum-close aria-label="Stäng">×</button>
      </div>
      <div class="cco-tsum-content" data-tsum-content></div>
    `;
    modalBackdrop.appendChild(modalDialog);
    document.body.appendChild(modalBackdrop);

    modalContentEl = modalDialog.querySelector('[data-tsum-content]');

    modalBackdrop.addEventListener('click', (event) => {
      if (event.target === modalBackdrop) closeModal();
    });
    modalDialog.querySelector('[data-tsum-close]').addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modalBackdrop.hasAttribute('hidden')) {
        event.preventDefault();
        closeModal();
      }
    });
  }

  function setSourceBadge(source) {
    if (!modalDialog) return;
    const el = modalDialog.querySelector('[data-tsum-source]');
    if (!el) return;
    if (source === 'openai') {
      el.textContent = 'AI · OpenAI';
      el.classList.add('is-openai');
    } else {
      el.textContent = 'Heuristisk';
      el.classList.remove('is-openai');
    }
  }

  function renderLoading() {
    ensureModal();
    modalContentEl.innerHTML = `<div class="cco-tsum-empty">Sammanfattar tråden…</div>`;
    setSourceBadge('heuristic');
    modalBackdrop.removeAttribute('hidden');
  }

  function renderEmpty(reason) {
    ensureModal();
    modalContentEl.innerHTML = `<div class="cco-tsum-empty">${escapeHtml(reason || 'Ingen tråd att sammanfatta.')}</div>`;
    modalBackdrop.removeAttribute('hidden');
  }

  function renderError(error) {
    ensureModal();
    const msg = (error && error.message) ? error.message : 'Något gick fel.';
    modalContentEl.innerHTML = `<div class="cco-tsum-error">${escapeHtml(msg)}</div>`;
    modalBackdrop.removeAttribute('hidden');
  }

  function renderSummary(payload) {
    ensureModal();
    const data = payload?.data || {};
    const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
    setSourceBadge(data.source);
    const headline = data.headline || '';
    const bullets = Array.isArray(data.bullets) ? data.bullets : [];
    const whatChanged = data.whatChangedSinceLastVisit || '';
    const newCount = Number(data.newMessagesSinceLastVisit || 0);

    const guardrails = data.guardrails || null;
    const detectedLanguage = data.detectedLanguage || null;
    let html = '';
    // Språk-badge (Fas 3): visa detekterat språk + flagga
    if (detectedLanguage && detectedLanguage.primary && detectedLanguage.primary !== 'unknown') {
      const conf = Math.round((detectedLanguage.confidence || 0) * 100);
      html += `<div class="cco-tsum-language" title="Konfidens ${conf}%">
        <span class="cco-tsum-language-flag">${escapeHtml(detectedLanguage.flag || '')}</span>
        <span class="cco-tsum-language-label">Kund skriver på ${escapeHtml(detectedLanguage.native || detectedLanguage.primary)}</span>
        <span class="cco-tsum-language-hint">— svara på samma språk</span>
      </div>`;
    }
    // Guardrail-badge överst (Verifierad / Ej verifierad)
    if (guardrails && typeof guardrails === 'object') {
      const klass = guardrails.verified ? 'is-verified' : 'is-unverified';
      const sevClass = guardrails.severity ? ` is-sev-${guardrails.severity}` : '';
      const violationDetail =
        !guardrails.verified && Array.isArray(guardrails.violations) && guardrails.violations.length
          ? guardrails.violations
              .slice(0, 4)
              .map((v) => `${v.type}: ${v.value}`)
              .join(' · ')
          : '';
      html += `<div class="cco-tsum-guardrail ${klass}${sevClass}" title="${escapeHtml(violationDetail)}">
        <span class="cco-tsum-guardrail-icon">${guardrails.verified ? '✓' : '⚠'}</span>
        <span class="cco-tsum-guardrail-label">${escapeHtml(guardrails.shortLabel || (guardrails.verified ? 'Verifierad' : 'Ej verifierad'))}</span>
        ${!guardrails.verified ? `<span class="cco-tsum-guardrail-count">${guardrails.violationCount} ${guardrails.violationCount === 1 ? 'fakta' : 'fakta'}</span>` : ''}
      </div>`;
    }
    if (headline) html += `<p class="cco-tsum-headline">${escapeHtml(headline)}</p>`;
    if (bullets.length > 0) {
      html += '<ul class="cco-tsum-bullets">';
      for (const b of bullets) {
        html += `<li>${escapeHtml(b)}</li>`;
      }
      html += '</ul>';
    }
    if (whatChanged) {
      html += `<div class="cco-tsum-since">
        <strong>Sedan senast:</strong> ${escapeHtml(whatChanged)}
        ${newCount > 0 ? ` (${newCount} ny${newCount === 1 ? 'tt' : 'a'})` : ''}
      </div>`;
    }
    if (guardrails && !guardrails.verified && Array.isArray(guardrails.violations) && guardrails.violations.length > 0) {
      html += '<div class="cco-tsum-violations">';
      html += '<strong>Möjliga ej-verifierade fakta:</strong><ul>';
      for (const v of guardrails.violations.slice(0, 6)) {
        html += `<li><code>${escapeHtml(v.type)}</code>: ${escapeHtml(v.value)} <em>— ${escapeHtml(v.message || '')}</em></li>`;
      }
      html += '</ul></div>';
    }
    if (warnings.length > 0) {
      html += `<div class="cco-tsum-warnings">⚠ ${escapeHtml(warnings.join(' · '))}</div>`;
    }
    modalContentEl.innerHTML = html || `<div class="cco-tsum-empty">Inget att sammanfatta.</div>`;
    modalBackdrop.removeAttribute('hidden');
  }

  function closeModal() {
    if (modalBackdrop) modalBackdrop.setAttribute('hidden', '');
  }

  // ---------- Public API ----------

  async function summarizeCurrent() {
    if (isLoading) return;
    const threadId = getActiveThreadId();
    if (!threadId) {
      renderEmpty('Välj en tråd i arbetskön först.');
      return;
    }
    const messages = gatherMessages();
    if (messages.length === 0) {
      // Backend kan fortfarande svara med fallback-headline
      // men låt oss gå vidare ändå
    }

    const customerName = getCustomerName();
    const subject = getThreadSubject();

    isLoading = true;
    if (triggerButton) triggerButton.classList.add('is-loading');
    renderLoading();

    try {
      const payload = await fetchSummary({
        threadId,
        messages,
        customerName,
        subject,
      });
      renderSummary(payload);
      // Spara senaste besökstid för "vad har hänt sedan senast"
      lastVisitedAtByThreadId[threadId] = new Date().toISOString();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('CCO thread-summary fel', error);
      renderError(error);
    } finally {
      isLoading = false;
      if (triggerButton) triggerButton.classList.remove('is-loading');
    }
  }

  // ---------- Trigger-button injection ----------

  function buildTriggerButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cco-tsum-trigger';
    btn.setAttribute('data-cco-tsum-trigger', '');
    btn.setAttribute('aria-label', 'Sammanfatta tråden');
    btn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 4h10M3 8h10M3 12h6"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <span>Sammanfatta</span>
    `;
    btn.addEventListener('click', () => summarizeCurrent());
    return btn;
  }

  function injectTriggerButton() {
    if (triggerButton) return;
    injectStyles();
    const focusKicker = document.querySelector('.focus-head .focus-kicker');
    if (!focusKicker) {
      // Försök igen senare när DOM är hydrerad
      return false;
    }
    triggerButton = buildTriggerButton();
    focusKicker.parentNode.insertBefore(triggerButton, focusKicker.nextSibling);
    return true;
  }

  function bindTriggerInjectionRetry() {
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts += 1;
      if (injectTriggerButton() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 250);
  }

  function mount() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindTriggerInjectionRetry, { once: true });
    } else {
      bindTriggerInjectionRetry();
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewThreadSummary = Object.freeze({
      mount,
      summarizeCurrent,
      open: renderSummary,
      close: closeModal,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
