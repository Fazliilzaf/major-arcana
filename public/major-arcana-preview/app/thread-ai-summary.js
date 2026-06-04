/**
 * SummarizeThread wiring — GET /api/v1/cco/runtime/conversation/:key/summary
 */
(() => {
  'use strict';

  const SUMMARY_DEBOUNCE_MS = 450;
  const cache = new Map();
  const inflight = new Map();
  let debounceTimer = null;
  let lastRenderedKey = '';

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAuthToken() {
    try {
      const local = normalizeText(window.localStorage.getItem('ARCANA_ADMIN_TOKEN'));
      if (local && local !== '__preview_local__') return local;
      const session = normalizeText(window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN'));
      if (session && session !== '__preview_local__') return session;
    } catch {
      /* ignore */
    }
    return '';
  }

  function isSmartReplyEnabled() {
    const toggle = document.querySelector('[data-settings-toggle="smart_reply"]');
    if (toggle && !toggle.checked) return false;
    return true;
  }

  function buildHeuristicPreset(thread) {
    if (!thread) {
      return {
        templateKey: null,
        text: 'Välj en aktiv tråd i arbetskön innan du använder AI-läget.',
        tags: ['AI', 'Väntar på aktiv tråd'],
      };
    }
    return {
      templateKey: null,
      text: `AI-sammanfattning:\n- Kund: ${thread.customerName}\n- Nu i: ${thread.statusLabel}\n- Nästa steg: ${thread.nextActionLabel}\n- Fokus: ${thread.whyInFocus || 'Ingen fokusmotivering.'}`,
      tags: ['AI', 'Sammanfattning', thread.intentLabel || 'Signal'],
    };
  }

  function formatSummaryNoteText(summary, thread, fallbackText) {
    if (!summary) return fallbackText;
    const headline = normalizeText(summary.headline);
    const bullets = Array.isArray(summary.bullets) ? summary.bullets.filter(Boolean) : [];
    const nextStep = normalizeText(summary.nextStep);
    const risk = normalizeText(summary.risk);
    const lines = [];
    if (headline) lines.push(headline);
    bullets.forEach((bullet) => lines.push(`- ${bullet}`));
    if (nextStep) lines.push(`Nästa steg: ${nextStep}`);
    if (risk) lines.push(`Risk: ${risk}`);
    if (!lines.length) return fallbackText;
    return `AI-sammanfattning (${thread?.customerName || 'tråd'}):\n${lines.join('\n')}`;
  }

  async function apiRequest(path) {
    const token = getAuthToken();
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { headers, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  async function fetchSummary(conversationKey, { force = false } = {}) {
    const key = normalizeText(conversationKey);
    if (!key) return null;
    if (!force && cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);
    const promise = apiRequest(
      `/api/v1/cco/runtime/conversation/${encodeURIComponent(key)}/summary`
    )
      .then((payload) => {
        const summary = payload?.summary || null;
        cache.set(key, summary);
        return summary;
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, promise);
    return promise;
  }

  function scheduleFetch(conversationKey) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void fetchSummary(conversationKey).then((summary) => {
        if (normalizeText(lastRenderedKey) !== normalizeText(conversationKey)) return;
        renderSummaryPanel(conversationKey, summary);
        document.dispatchEvent(
          new CustomEvent('arcana-thread-summary-ready', {
            detail: { conversationKey, summary },
          })
        );
      });
    }, SUMMARY_DEBOUNCE_MS);
  }

  function ensureSummaryHost() {
    let host = document.querySelector('[data-thread-ai-summary-host]');
    if (host) return host;
    const workrail = document.querySelector('.focus-workrail');
    if (!workrail) return null;
    host = document.createElement('div');
    host.className = 'thread-ai-summary-host';
    host.setAttribute('data-thread-ai-summary-host', '');
    const nextHost = workrail.querySelector('[data-conversation-next-host]');
    if (nextHost?.parentElement) {
      nextHost.parentElement.insertBefore(host, nextHost.nextSibling);
    } else {
      workrail.prepend(host);
    }
    return host;
  }

  function renderSummaryPanel(conversationKey, summary) {
    const host = ensureSummaryHost();
    if (!host) return;
    if (!conversationKey) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    if (!summary) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const headline = normalizeText(summary.headline) || 'AI-sammanfattning';
    const bullets = Array.isArray(summary.bullets) ? summary.bullets.filter(Boolean).slice(0, 5) : [];
    const nextStep = normalizeText(summary.nextStep);
    const risk = normalizeText(summary.risk);
    host.hidden = false;
    host.innerHTML = `
      <section class="thread-ai-summary-panel" data-thread-ai-summary-panel aria-label="AI-trådsammanfattning">
        <header class="thread-ai-summary-head">
          <p class="thread-ai-summary-kicker">AI · tråd</p>
          <h4 class="thread-ai-summary-title">${escapeHtml(headline)}</h4>
        </header>
        ${
          bullets.length
            ? `<ul class="thread-ai-summary-bullets">${bullets
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join('')}</ul>`
            : ''
        }
        ${nextStep ? `<p class="thread-ai-summary-next"><strong>Nästa:</strong> ${escapeHtml(nextStep)}</p>` : ''}
        ${risk ? `<p class="thread-ai-summary-risk"><strong>Risk:</strong> ${escapeHtml(risk)}</p>` : ''}
      </section>`;
  }

  function buildNotePreset(thread, fallbackPreset) {
    const fallback = fallbackPreset || buildHeuristicPreset(thread);
    if (!thread || !isSmartReplyEnabled()) return fallback;
    const key = normalizeText(thread.id || thread.conversationKey);
    const cached = cache.get(key);
    if (cached) {
      return {
        templateKey: null,
        text: formatSummaryNoteText(cached, thread, fallback.text),
        tags: fallback.tags,
      };
    }
    scheduleFetch(key);
    return fallback;
  }

  function onThreadRendered(thread) {
    if (!thread || !isSmartReplyEnabled()) {
      lastRenderedKey = '';
      renderSummaryPanel('', null);
      return;
    }
    const key = normalizeText(thread.id || thread.conversationKey);
    lastRenderedKey = key;
    const cached = cache.get(key);
    if (cached) {
      renderSummaryPanel(key, cached);
      return;
    }
    renderSummaryPanel(key, null);
    scheduleFetch(key);
  }

  document.addEventListener('arcana-thread-summary-ready', (event) => {
    const detail = event.detail || {};
    const noteMode = document.querySelector('[data-note-mode-option="ai-summary"]');
    if (!noteMode?.classList.contains('is-active')) return;
    const noteText = document.getElementById('note-text');
    if (!noteText || !detail.summary) return;
    const thread = { customerName: document.querySelector('[data-intel-customer] h4')?.textContent };
    noteText.value = formatSummaryNoteText(detail.summary, thread, noteText.value);
  });

  window.ArcanaThreadAiSummary = Object.freeze({
    fetchSummary,
    buildNotePreset,
    onThreadRendered,
    buildHeuristicPreset,
    formatSummaryNoteText,
    clearCache: () => cache.clear(),
  });
})();
