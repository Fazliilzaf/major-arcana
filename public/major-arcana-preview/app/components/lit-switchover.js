/**
 * app/components/lit-switchover.js
 *
 * Fas B (2026-05-20): State-primary queue render — enda läget.
 * Renderar <arcana-thread-card> direkt från CCO state via
 * window.__ccoGetVisibleQueueThreads(). Ingen legacy-DOM-scrape.
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';
import {
  groupThreadsByCustomer,
  orderForRender,
  readExpandedKeys,
  toggleExpanded,
} from './customer-cluster-grouper.js';

const MAX_VISIBLE_CARDS = 30;
const MUTATION_DEBOUNCE_MS = 100;

let listContainer = null;
let renderScheduled = false;
let renderDirty = false;
let mutationDebounce = null;
let lastRenderSig = '';

console.log('[lit-switchover] Aktiv (Fas B — state-primary)');
init();

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

function start() {
  mountListContainer();
  schedule();

  window.addEventListener('cco:queue-render', schedule);

  const obs = new MutationObserver(() => {
    if (mutationDebounce) clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      mutationDebounce = null;
      schedule();
    }, MUTATION_DEBOUNCE_MS);
  });
  const shell = document.querySelector('.runtime-shell, .preview-workspace');
  if (shell) {
    obs.observe(shell, { childList: true, subtree: true });
  }
}

function schedule() {
  if (renderScheduled) {
    renderDirty = true;
    return;
  }
  renderScheduled = true;
  renderDirty = false;
  setTimeout(() => {
    renderScheduled = false;
    try {
      renderLitQueue();
    } finally {
      if (renderDirty) schedule();
    }
  }, 0);
}

function mountListContainer() {
  const list = document.querySelector('.queue-history-list');
  if (!list) {
    setTimeout(mountListContainer, 200);
    return;
  }
  listContainer = list;
  list.dataset.litMode = 'state';
  list.style.cssText =
    'display:flex;flex-direction:column;gap:8px;padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;';
}

function getSelectedThreadId() {
  try {
    return String(window.__ccoWorkspace?.getSelectedThreadId?.() || '').trim();
  } catch (_e) {
    return '';
  }
}

function getThreadsToRender() {
  const override = listContainer?.__litOverrideThreads;
  if (Array.isArray(override)) {
    return override;
  }
  return getVisibleThreadsFromState();
}

function getVisibleThreadsFromState() {
  try {
    if (typeof window.__ccoGetVisibleQueueThreads === 'function') {
      return window.__ccoGetVisibleQueueThreads();
    }
    const ws = window.__ccoWorkspace;
    if (!ws || typeof ws.getState !== 'function') return [];
    const st = ws.getState();
    const runtime = st?.runtime || {};
    const threads =
      Array.isArray(st?.data?.threads) && st.data.threads.length
        ? st.data.threads
        : Array.isArray(runtime.threads)
          ? runtime.threads
          : [];
    return threads.filter(
      (thread) => String(thread?.worklistSource || '').toLowerCase() !== 'demo',
    );
  } catch (_e) {
    return [];
  }
}

function selectThreadFromState(threadId) {
  if (!threadId) return;
  try {
    if (window.__ccoWorkspace?.setSelectedThreadId) {
      window.__ccoWorkspace.setSelectedThreadId(threadId);
    }
  } catch (_e) {
    /* tyst */
  }
}

function buildRenderSignature(threads, selectedThreadId) {
  return (
    selectedThreadId +
    '|' +
    threads
      .slice(0, MAX_VISIBLE_CARDS)
      .map((thread) => String(thread?.id || ''))
      .join(',')
  );
}

function applyClusterAttributes(litCard, state) {
  if (!state || !state.role) return;
  litCard.setAttribute('cluster-role', state.role);
  litCard.setAttribute('cluster-key', state.key);
  if (state.isExpanded) litCard.setAttribute('cluster-expanded', '');
  if (state.hidden) litCard.setAttribute('cluster-hidden', '');
}

function wireCardEvents(litCard, threadId = '') {
  litCard.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    selectThreadFromState(threadId || litCard.thread?.id || '');
  });
  litCard.addEventListener('cluster-toggle', (e) => {
    const key = e.detail?.key;
    if (!key) return;
    toggleExpanded(key);
    schedule();
  });
}

function renderEmptyState(message, tone = 'empty') {
  if (!listContainer) return;
  const color = tone === 'loading' ? '#cbd5e1' : '#94a3b8';
  const size = tone === 'loading' ? '12px' : '13px';
  listContainer.innerHTML = `<div style="padding:24px;text-align:center;color:${color};font-size:${size};">${message}</div>`;
}

function renderLitQueue() {
  if (!listContainer || !document.contains(listContainer)) {
    mountListContainer();
    if (listContainer) setTimeout(renderLitQueue, 0);
    return;
  }

  const threads = getThreadsToRender();
  const selectedThreadId = getSelectedThreadId();
  const sig = buildRenderSignature(threads, selectedThreadId);
  if (sig === lastRenderSig && listContainer.childElementCount > 0) {
    return;
  }
  lastRenderSig = sig;

  if (!threads.length) {
    const canvas = document.querySelector('.preview-canvas');
    const isAuthRequired = Boolean(canvas?.classList.contains('is-runtime-auth_required'));
    if (isAuthRequired) {
      renderEmptyState('Logga in igen i admin för att läsa arbetskön.', 'empty');
      return;
    }
    renderEmptyState('Inga cards i kön just nu.', 'empty');
    return;
  }

  const visibleThreads = threads.slice(0, MAX_VISIBLE_CARDS);
  const propsList = visibleThreads.map((thread) => threadToCardProps(thread));
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);

  listContainer.innerHTML = '';
  ordered.forEach((props) => {
    const state = grouped.threadStateById.get(String(props.id || ''));
    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    litCard.selected = Boolean(selectedThreadId && String(props.id) === String(selectedThreadId));
    applyClusterAttributes(litCard, state);
    wireCardEvents(litCard, props.id);
    listContainer.appendChild(litCard);
  });
}

if (typeof window !== 'undefined') {
  window.__litSwitchover = {
    get active() {
      return true;
    },
    rerender: schedule,
    clearBootstrapWindow: schedule,
  };
}
