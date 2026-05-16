/**
 * app/components/thread-store-bridge.js
 * Fas 10 av Lit-migration — DOM → thread-store sync.
 *
 * ENDA stället i Lit-pipelinen som DOM-scrapar app.js's rå thread-cards.
 * MutationObserver på .queue-history-list → scrape → push till
 * thread-store. lit-switchover.js subscribar på store istället för att
 * scrapea själv.
 *
 * När app.js längre fram skriver direkt till thread-store (utan att gå
 * via DOM-cards som mellanlager) kan denna bridge raderas helt — då är
 * Lit-pipelinen 100% deklarativ.
 *
 * För nu: bridge är "leg-cast" som låter oss separera concerns. Lit
 * kan testas mot store utan DOM, och DOM-scraping är isolerad i en fil.
 */

import { setThreads, clear } from './thread-store.js';

// ─────────── DOM-scraping (flyttad från lit-switchover.js) ───────────

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
    // Server-styrd cluster-data
    ccClusterGroup: card.dataset.ccClusterGroup || '',
    ccClusterRole: card.dataset.ccClusterRole || '',
    ccClusterSize: Number(card.dataset.ccClusterSize) || 0,
    crossMailboxProvenanceEvidence:
      card.classList.contains('cross-mailbox-card') ||
      card.dataset.crossMailbox === 'true',
    raw: {
      from: { address: card.dataset.runtimeThread || '' },
    },
    // Bridge-metadata — låter Lit hitta live-cardet för click-forwarding
    _domRef: null, // sätts av bridge nedan, ej committed till store
  };
}

// ─────────── Live-card-tracking ───────────

/**
 * Lit behöver fortfarande ett sätt att hitta den dolda DOM-cardet för
 * att kunna trigga dess click()-handler. Vi exponerar en separat Map
 * <threadId, HTMLElement> som lit-switchover kan slå upp i.
 */
const _liveCardRefs = new Map();

export function getLiveCardForThread(threadId) {
  return _liveCardRefs.get(String(threadId)) || null;
}

// ─────────── Bridge-logik ───────────

let _started = false;
let _syncScheduled = false;
let _observer = null;
let _currentList = null;

function _scheduleSync() {
  if (_syncScheduled) return;
  _syncScheduled = true;
  requestAnimationFrame(() => {
    _syncScheduled = false;
    _syncDomToStore();
  });
}

function _syncDomToStore() {
  const list = document.querySelector('.queue-history-list');

  // Detektera list-identity-byte (app.js re-render skapar ny instans).
  // Dispatcha event så lit-switchover kan re-applicera display:none +
  // re-mounta sin replacement-container i nya parent.
  if (list !== _currentList) {
    _currentList = list;
    document.dispatchEvent(
      new CustomEvent('lit-list-changed', { detail: { list } }),
    );
  }

  if (!list) {
    if (_liveCardRefs.size > 0 || (typeof window !== 'undefined' && window.__threadStore?.size() > 0)) {
      clear();
      _liveCardRefs.clear();
    }
    return;
  }

  const liveCards = Array.from(
    list.querySelectorAll(
      '.thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])',
    ),
  );

  // Bygg thread-list + uppdatera live-card-ref-map
  _liveCardRefs.clear();
  const threads = [];
  for (const card of liveCards) {
    const t = scrapeCardData(card);
    if (!t.id) continue;
    _liveCardRefs.set(String(t.id), card);
    threads.push(t);
  }

  // Pushar till store — triggar subscribers (= lit-switchover renderar om)
  setThreads(threads);
}

/**
 * Starta bridge:n. Idempotent — säker att kalla flera gånger.
 *
 * Observerar HELA document.body subtree:true så att vi fångar både:
 * - cards som läggs till/tas bort inom .queue-history-list
 * - hela .queue-history-list som re-skapas av app.js's renderApp()
 *
 * Throttling: alla mutations samlas via requestAnimationFrame så vi
 * gör max EN sync per frame. För prod-volym (~100 cards) är detta
 * billigt nog.
 */
export function startBridge() {
  if (_started) return;
  _started = true;

  const begin = () => {
    _observer = new MutationObserver(() => _scheduleSync());
    _observer.observe(document.body, { childList: true, subtree: true });
    _scheduleSync(); // Initial sync — fångar redan-rendrade cards
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }
}

/**
 * Stoppa bridge:n (för testing eller om vi någonsin går till
 * app.js-skriver-direkt-till-store-läget).
 */
export function stopBridge() {
  if (!_started) return;
  _started = false;
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
  _currentList = null;
  _liveCardRefs.clear();
}

// ─────────── Debug ───────────

if (typeof window !== 'undefined') {
  window.__threadStoreBridge = {
    start: startBridge,
    stop: stopBridge,
    sync: _syncDomToStore,
    getLiveCard: getLiveCardForThread,
    _liveCardRefs,
  };
}
