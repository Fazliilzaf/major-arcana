/**
 * app/components/lit-switchover.js
 *
 * Fas 27B-1 (2026-05-18): Stabilisering + cleanup
 *   - Throttle MutationObserver (100ms debounce) — slutar trigga 50+ ggr/sek
 *   - Bootstrap loading-state (3s window) — ingen mer missvisande "0 cards"
 *   - Rivet: panel-mode (preview-funktion vi inte använder, 180 rader dead)
 *   - Rivet: ?layout=legacy fallback (shims är borta sen Fas 9, fungerar ej)
 *
 * Renderar alla thread-cards via <arcana-thread-card> Lit web component.
 * Scrapar data från app.js's legacy DOM (som hålls dold via display:none).
 *
 * Inga URL-flags — Lit är default och enda läget nu.
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';
import {
  groupThreadsByCustomer,
  orderForRender,
  readExpandedKeys,
  toggleExpanded,
} from './customer-cluster-grouper.js';

let replaceContainer = null;
let renderScheduled = false;
let renderDirty = false;
let mutationDebounce = null;

// Bootstrap-window: under första 3s visas "Laddar..." istället för "0 cards"
// eftersom data-loading-window är ~1-2s och kan triggra felaktig empty-render.
let bootstrapWindow = true;
const BOOTSTRAP_WINDOW_MS = 3000;
const MUTATION_DEBOUNCE_MS = 100;

function clearBootstrapWindow() {
  bootstrapWindow = false;
  schedule();
}

console.log('[lit-switchover] Aktiv (Fas 27B-1 stabiliserad)');
init();
setTimeout(() => {
  if (bootstrapWindow) {
    bootstrapWindow = false;
    schedule();
  }
}, BOOTSTRAP_WINDOW_MS);

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
}

function startObserver() {
  mountReplaceContainer();
  schedule();

  // Observera document.body för att fånga list-rekreationer från app.js's
  // renderApp. Throttla med 100ms debounce — vid bootstrap genererar
  // renderApp 50+ mutations per sekund som annars triggar render-storm.
  const obs = new MutationObserver(() => {
    if (mutationDebounce) clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      mutationDebounce = null;
      schedule();
    }, MUTATION_DEBOUNCE_MS);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function schedule() {
  if (renderScheduled) {
    renderDirty = true;
    return;
  }
  renderScheduled = true;
  renderDirty = false;
  // setTimeout(0) istället för rAF — rAF triggas inte pålitligt i
  // bakgrundstabs/throttlade tabs. setTimeout kör alltid.
  setTimeout(() => {
    renderScheduled = false;
    try {
      renderLitReplacement();
    } finally {
      if (renderDirty) schedule();
    }
  }, 0);
}

// ─────────── Helpers ───────────

function scrapeAllLiveCards() {
  return Array.from(
    document.querySelectorAll(
      '.queue-history-list .thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])',
    ),
  );
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
    const threads = Array.isArray(st?.data?.threads) && st.data.threads.length
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
      return;
    }
  } catch (_e) {
    /* tyst */
  }
  const card = document.querySelector(
    `.queue-history-list [data-runtime-thread="${CSS.escape(String(threadId))}"]`,
  );
  if (card) card.click();
}

function buildPropsListFromCards(cards) {
  const shapes = cards.map(scrapeCardData);
  return shapes.map((t) => ({
    ...t,
    ...threadToCardProps(t),
    ccClusterGroup: t.ccClusterGroup,
    ccClusterRole: t.ccClusterRole,
    ccClusterSize: t.ccClusterSize,
  }));
}

function applyClusterAttributes(litCard, state) {
  if (!state || !state.role) return;
  litCard.setAttribute('cluster-role', state.role);
  litCard.setAttribute('cluster-key', state.key);
  if (state.isExpanded) litCard.setAttribute('cluster-expanded', '');
  if (state.hidden) litCard.setAttribute('cluster-hidden', '');
}

function wireCardEvents(litCard, liveCard, threadId = '') {
  litCard.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (liveCard) {
      // scrollIntoView fungerar inte på display:none element, så hoppa
      // över i replace-mode. Click() bubblar till app.js's handlers.
      if (liveCard.offsetParent !== null) {
        liveCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      liveCard.click();
      return;
    }
    selectThreadFromState(threadId || litCard.thread?.id || '');
  });
  litCard.addEventListener('cluster-toggle', (e) => {
    const key = e.detail?.key;
    if (!key) return;
    toggleExpanded(key);
    schedule();
  });
}

// ─────────── Mount + render ───────────

function mountReplaceContainer() {
  const list = document.querySelector('.queue-history-list');
  if (!list) {
    // App har inte renderat listan än — försök igen om 200 ms
    setTimeout(mountReplaceContainer, 200);
    return;
  }

  // Göm originalet (display:none → behåll i DOM för scraping + click)
  list.dataset.litHidden = 'true';
  list.style.setProperty('display', 'none', 'important');

  replaceContainer = document.createElement('div');
  replaceContainer.className = 'lit-queue-replacement';
  replaceContainer.dataset.litMode = 'replace';
  replaceContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  `;

  const grid = document.createElement('div');
  grid.className = 'lit-replace-grid';
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  replaceContainer.appendChild(grid);

  list.parentNode.insertBefore(replaceContainer, list);
}

function renderLitReplacement() {
  // Self-healing: replaceContainer kan ha blivit raderad av app.js's
  // renderApp som re-renderar parent. Re-mounta i så fall.
  if (!replaceContainer || !document.contains(replaceContainer)) {
    mountReplaceContainer();
    if (replaceContainer) setTimeout(() => renderLitReplacement(), 0);
    return;
  }
  const grid = replaceContainer.querySelector('.lit-replace-grid');
  if (!grid) return;

  const liveCards = scrapeAllLiveCards();
  const canvas = document.querySelector('.preview-canvas');
  const isRuntimeSyncing = Boolean(canvas?.classList.contains('is-runtime-syncing'));

  if (liveCards.length === 0) {
    const stateThreads = getVisibleThreadsFromState();
    if (stateThreads.length > 0) {
      const propsList = stateThreads.slice(0, 30).map((thread) => threadToCardProps(thread));
      const expanded = readExpandedKeys();
      const grouped = groupThreadsByCustomer(propsList, expanded);
      const ordered = orderForRender(propsList, grouped);

      grid.innerHTML = '';
      ordered.forEach((props) => {
        const state = grouped.threadStateById.get(String(props.id || ''));
        const litCard = document.createElement('arcana-thread-card');
        litCard.thread = props;
        applyClusterAttributes(litCard, state);
        wireCardEvents(litCard, null, props.id);
        grid.appendChild(litCard);
      });
      return;
    }

    // Bootstrap-window: skilj på "väntar på data" vs "verkligen tom kö"
    if (bootstrapWindow || isRuntimeSyncing) {
      // Behåll det som redan finns (om något) — flashar inte loading-text
      // över redan renderade cards. Om grid är tomt visa subtil hint.
      if (!grid.children.length) {
        grid.innerHTML =
          '<div style="padding:24px;text-align:center;color:#cbd5e1;font-size:12px;">Laddar arbetskön…</div>';
      }
    } else {
      grid.innerHTML =
        '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Inga cards i kön just nu.</div>';
    }
    return;
  }

  const propsList = buildPropsListFromCards(liveCards);
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);

  // Re-render: enkel diff-strategi → bygg om hela grid. Lit-Element batchar
  // sin egen rendering så detta är snabbt nog för <500 cards.
  grid.innerHTML = '';
  ordered.forEach((props) => {
    const idx = propsList.indexOf(props);
    const live = liveCards[idx];
    const state = grouped.threadStateById.get(String(props.id || ''));

    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    applyClusterAttributes(litCard, state);
    wireCardEvents(litCard, live);
    grid.appendChild(litCard);
  });
}

/**
 * Skrapa data från ett befintligt thread-card-element och bygg ett
 * thread-objekt som threadToCardProps kan konsumera.
 */
function scrapeCardData(card) {
  const text = (sel) => card.querySelector(sel)?.textContent?.trim() || '';
  return {
    id: card.dataset.runtimeThread || card.dataset.historyConversation || '',
    customerEmail: card.dataset.runtimeThread || '',
    customerName: text('.warm-sender, .thread-subject-primary'),
    subject: text('.warm-subject, .thread-subject-context'),
    preview: text('.warm-preview, .thread-story'),
    primaryLaneId: card.dataset.lane || '',
    lastActivityLabel: text('.warm-meta time, .thread-card-stamp-top time'),
    displayOwnerLabel: text('.meta-status, .thread-owner'),
    mailboxLabel: text('.warm-mailbox, .thread-intelligence-item--mailbox'),
    whyText: text('.warm-why-text, .warm-why .why-reason'),
    systemMailLabel: card.dataset.systemMailLabel || null,
    customerClusterCount: Number(card.dataset.customerClusterCount) || 0,
    ccClusterGroup: card.dataset.ccClusterGroup || '',
    ccClusterRole: card.dataset.ccClusterRole || '',
    ccClusterSize: Number(card.dataset.ccClusterSize) || 0,
    crossMailboxProvenanceEvidence:
      card.classList.contains('cross-mailbox-card') ||
      card.dataset.crossMailbox === 'true',
    raw: {
      from: { address: card.dataset.runtimeThread || '' },
    },
  };
}

// Exponera för debug
if (typeof window !== 'undefined') {
  window.__litSwitchover = {
    get active() { return true; },
    get bootstrapWindow() { return bootstrapWindow; },
    clearBootstrapWindow,
    rerender: schedule,
  };
}
