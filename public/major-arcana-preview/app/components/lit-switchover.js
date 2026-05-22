/**
 * app/components/lit-switchover.js
 *
 * Fas B (2026-05-20): State-primary queue render — enda läget.
 * P6 (2026-05-22): Incremental Lit card patching + scroll virtualization.
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';
import {
  groupThreadsByCustomer,
  orderForRender,
  readExpandedKeys,
  toggleExpanded,
} from './customer-cluster-grouper.js';

const VIRTUALIZE_THRESHOLD = 150;
const ROW_HEIGHT = 88;
const OVERSCAN = 4;
const MUTATION_DEBOUNCE_MS = 100;

let listContainer = null;
let virtualMount = null;
let topSpacer = null;
let bottomSpacer = null;
let scrollListenerAttached = false;
let renderScheduled = false;
let renderDirty = false;
let mutationDebounce = null;
let lastRenderSig = '';
let lastVisibleRange = { start: 0, end: 0 };
let lastVirtualEnabled = false;

/** @type {Map<string, HTMLElement>} */
const cardPool = new Map();

console.log('[lit-switchover] Aktiv (Fas B — state-primary, P6 incremental+virtual)');
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
    'display:flex;flex-direction:column;gap:0;padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;';
  ensureVirtualScaffold();
  attachScrollListener();
}

function ensureVirtualScaffold() {
  if (!listContainer) return;

  if (!topSpacer || !listContainer.contains(topSpacer)) {
    topSpacer = document.createElement('div');
    topSpacer.dataset.litVirtualSpacerTop = '';
    topSpacer.style.cssText = 'flex-shrink:0;width:100%;height:0;pointer-events:none;';
  }
  if (!virtualMount || !listContainer.contains(virtualMount)) {
    virtualMount = document.createElement('div');
    virtualMount.dataset.litVirtualMount = '';
    virtualMount.style.cssText =
      'display:flex;flex-direction:column;gap:8px;width:100%;flex-shrink:0;';
  }
  if (!bottomSpacer || !listContainer.contains(bottomSpacer)) {
    bottomSpacer = document.createElement('div');
    bottomSpacer.dataset.litVirtualSpacerBottom = '';
    bottomSpacer.style.cssText = 'flex-shrink:0;width:100%;height:0;pointer-events:none;';
  }

  if (listContainer.firstChild !== topSpacer) {
    listContainer.replaceChildren(topSpacer, virtualMount, bottomSpacer);
  }
}

function attachScrollListener() {
  if (!listContainer || scrollListenerAttached) return;
  listContainer.addEventListener('scroll', onVirtualScroll, { passive: true });
  scrollListenerAttached = true;
}

function onVirtualScroll() {
  if (!lastVirtualEnabled) return;
  renderLitQueue({ fromScroll: true });
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
      (thread) => String(thread?.worklistSource || '').toLowerCase() !== 'demo'
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

function threadIdOf(props) {
  return String(props?.id || '');
}

function buildRenderSignature(ordered, selectedThreadId, grouped) {
  return (
    selectedThreadId +
    '|v' +
    (ordered.length > VIRTUALIZE_THRESHOLD ? '1' : '0') +
    '|' +
    ordered
      .map((props) => {
        const id = threadIdOf(props);
        const state = grouped.threadStateById.get(id) || {};
        const sel = selectedThreadId && id === selectedThreadId ? '1' : '0';
        return [
          id,
          sel,
          state.role || '',
          state.hidden ? 'h' : 'v',
          state.isExpanded ? '1' : '0',
          props.subject || '',
          props.preview || '',
          props.time || '',
          props.lane || '',
        ].join(':');
      })
      .join(',')
  );
}

function applyClusterAttributes(litCard, state) {
  if (!state || !state.role) {
    litCard.removeAttribute('cluster-role');
    litCard.removeAttribute('cluster-key');
    litCard.removeAttribute('cluster-expanded');
    litCard.removeAttribute('cluster-hidden');
    return;
  }
  litCard.setAttribute('cluster-role', state.role);
  litCard.setAttribute('cluster-key', state.key);
  if (state.isExpanded) litCard.setAttribute('cluster-expanded', '');
  else litCard.removeAttribute('cluster-expanded');
  if (state.hidden) litCard.setAttribute('cluster-hidden', '');
  else litCard.removeAttribute('cluster-hidden');
}

function wireCardEvents(litCard, threadId = '') {
  if (litCard.dataset.litWired === '1') return;
  litCard.dataset.litWired = '1';
  litCard.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    selectThreadFromState(threadId || litCard.thread?.id || litCard.dataset.threadId || '');
  });
  litCard.addEventListener('cluster-toggle', (e) => {
    const key = e.detail?.key;
    if (!key) return;
    toggleExpanded(key);
    schedule();
  });
}

function updateCard(litCard, props, selectedThreadId, state) {
  const id = threadIdOf(props);
  litCard.dataset.threadId = id;
  litCard.thread = props;
  litCard.selected = Boolean(selectedThreadId && id === String(selectedThreadId));
  applyClusterAttributes(litCard, state);
}

function getOrCreateCard(props) {
  const id = threadIdOf(props);
  let litCard = cardPool.get(id);
  if (!litCard) {
    litCard = document.createElement('arcana-thread-card');
    cardPool.set(id, litCard);
    wireCardEvents(litCard, id);
  }
  return litCard;
}

function computeVisibleRange(total, scrollTop, viewportHeight) {
  if (total <= 0) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(total, start + visibleCount);
  return { start, end };
}

function rangesEqual(a, b) {
  return a.start === b.start && a.end === b.end;
}

function patchVisibleCards(slice, selectedThreadId, grouped) {
  if (!virtualMount) return;

  const desiredIds = slice.map((props) => threadIdOf(props));
  const desiredIdSet = new Set(desiredIds);

  for (const props of slice) {
    const id = threadIdOf(props);
    const state = grouped.threadStateById.get(id);
    const litCard = getOrCreateCard(props);
    updateCard(litCard, props, selectedThreadId, state);
  }

  let nextSibling = null;
  for (let i = desiredIds.length - 1; i >= 0; i -= 1) {
    const litCard = cardPool.get(desiredIds[i]);
    if (!litCard) continue;
    if (litCard.parentNode !== virtualMount) {
      virtualMount.insertBefore(litCard, nextSibling);
    } else if (litCard.nextSibling !== nextSibling) {
      virtualMount.insertBefore(litCard, nextSibling);
    }
    nextSibling = litCard;
  }

  for (const child of [...virtualMount.children]) {
    if (child.tagName !== 'ARCANA-THREAD-CARD') continue;
    const id = child.dataset.threadId || child.thread?.id || '';
    if (!desiredIdSet.has(String(id))) {
      virtualMount.removeChild(child);
    }
  }
}

function updateVirtualSpacers(startIndex, endIndex, total) {
  if (!topSpacer || !bottomSpacer) return;
  topSpacer.style.height = `${startIndex * ROW_HEIGHT}px`;
  bottomSpacer.style.height = `${Math.max(0, total - endIndex) * ROW_HEIGHT}px`;
}

function pruneCardPool(activeIds) {
  for (const [id, card] of cardPool) {
    if (activeIds.has(id)) continue;
    if (card.parentNode) card.parentNode.removeChild(card);
    cardPool.delete(id);
  }
}

function renderEmptyState(message, tone = 'empty') {
  if (!listContainer) return;
  lastRenderSig = '';
  lastVirtualEnabled = false;
  lastVisibleRange = { start: 0, end: 0 };
  cardPool.clear();
  const color = tone === 'loading' ? '#cbd5e1' : '#94a3b8';
  const size = tone === 'loading' ? '12px' : '13px';
  listContainer.innerHTML = `<div style="padding:24px;text-align:center;color:${color};font-size:${size};">${message}</div>`;
  virtualMount = null;
  topSpacer = null;
  bottomSpacer = null;
}

function prepareOrderedRender(threads, selectedThreadId) {
  const propsList = threads.map((thread) => threadToCardProps(thread));
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);
  return { propsList, grouped, ordered };
}

function renderLitQueue(options = {}) {
  const { fromScroll = false } = options;

  if (!listContainer || !document.contains(listContainer)) {
    mountListContainer();
    if (listContainer) setTimeout(renderLitQueue, 0);
    return;
  }

  const threads = getThreadsToRender();
  const selectedThreadId = getSelectedThreadId();

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

  ensureVirtualScaffold();
  attachScrollListener();

  const { grouped, ordered } = prepareOrderedRender(threads, selectedThreadId);
  const sig = buildRenderSignature(ordered, selectedThreadId, grouped);
  const virtualEnabled = ordered.length > VIRTUALIZE_THRESHOLD;
  lastVirtualEnabled = virtualEnabled;

  if (!fromScroll && sig === lastRenderSig && listContainer.dataset.litRendered === '1') {
    return;
  }
  if (!fromScroll) {
    lastRenderSig = sig;
  }

  const activeIds = new Set(ordered.map((props) => threadIdOf(props)));
  pruneCardPool(activeIds);

  if (virtualEnabled) {
    const scrollTop = listContainer.scrollTop || 0;
    const viewportHeight = listContainer.clientHeight || 0;
    const range = computeVisibleRange(ordered.length, scrollTop, viewportHeight);

    if (fromScroll && rangesEqual(range, lastVisibleRange)) {
      return;
    }
    lastVisibleRange = range;

    const slice = ordered.slice(range.start, range.end);
    updateVirtualSpacers(range.start, range.end, ordered.length);
    patchVisibleCards(slice, selectedThreadId, grouped);
  } else {
    lastVisibleRange = { start: 0, end: ordered.length };
    updateVirtualSpacers(0, ordered.length, ordered.length);
    patchVisibleCards(ordered, selectedThreadId, grouped);
  }

  listContainer.dataset.litRendered = '1';
  listContainer.dataset.litVirtual = virtualEnabled ? '1' : '0';
}

if (typeof window !== 'undefined') {
  window.__litSwitchover = {
    get active() {
      return true;
    },
    rerender: schedule,
    clearBootstrapWindow: schedule,
    get cardPoolSize() {
      return cardPool.size;
    },
    get virtualEnabled() {
      return lastVirtualEnabled;
    },
    get visibleRange() {
      return { ...lastVisibleRange };
    },
  };
}
