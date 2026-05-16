/**
 * app/components/thread-store.js
 * Fas 10 av Lit-migration — minimal reactive state-store.
 *
 * Ersätter DOM-scraping i lit-switchover.js som källa-sanning. Lit-cards
 * läser nu thread-data från store istället för att läsa textInnehåll ur
 * .queue-history-list-DOM:en.
 *
 * Designkrav:
 *   - Pure ESM, inga deps (CSP-kompatibelt, inget vendor-bundle behövs)
 *   - Map<id, thread> som backing-store (O(1) lookup, ordnad iteration)
 *   - Subscribe-callbacks notifieras EFTER mutation (deferred via
 *     microtask för att batcha flera setThread-calls)
 *   - Bulk-uppdatera via setThreads() triggar bara en notify
 *   - Volatile (inget localStorage) — store rekonstrueras från bridge
 *     vid page-load
 *
 * Future:
 *   - Zustand/Lit-context kan ersätta detta utan att API ändras
 *   - app.js kan börja skriva direkt till store, då bridge raderas
 */

// ─────────── Backing-store ───────────

/** @type {Map<string, object>} */
const _threads = new Map();

/** @type {Set<Function>} subscribers — callback(threads, changedIds) */
const _subscribers = new Set();

/** @type {Set<string> | null} pending change-set, batchas via microtask */
let _pending = null;

// ─────────── Notify-batching ───────────

function _scheduleNotify(changedIds) {
  // Bulk-batch flera mutations som händer i samma microtask
  if (_pending) {
    if (changedIds === 'all') _pending = 'all';
    else if (_pending !== 'all') changedIds.forEach((id) => _pending.add(id));
    return;
  }
  _pending = changedIds === 'all' ? 'all' : new Set(changedIds);
  queueMicrotask(_flushNotify);
}

function _flushNotify() {
  const changes = _pending;
  _pending = null;
  const ids = changes === 'all' ? null : Array.from(changes);
  for (const cb of _subscribers) {
    try {
      cb(_threads, ids);
    } catch (e) {
      console.error('[thread-store] subscriber threw:', e);
    }
  }
}

// ─────────── Public API ───────────

/**
 * Sätt en enskild thread. Notifierar subscribers.
 */
export function setThread(id, thread) {
  if (!id) return;
  const key = String(id);
  _threads.set(key, { ...thread, id: key });
  _scheduleNotify([key]);
}

/**
 * Bulk-uppdatera. Behåller bara threads som finns i nya listan (raderar
 * de som inte längre finns). Notifierar med 'all'.
 *
 * @param {Array<object>} threadList - threads med .id-fält
 */
export function setThreads(threadList) {
  const next = new Map();
  for (const t of threadList) {
    if (!t || !t.id) continue;
    next.set(String(t.id), { ...t, id: String(t.id) });
  }
  // Replace istället för merge — bridge ansvarar för att skicka allt
  _threads.clear();
  next.forEach((v, k) => _threads.set(k, v));
  _scheduleNotify('all');
}

/**
 * Hämta en enskild thread. Returnerar deep-frozen view, eller null.
 */
export function getThread(id) {
  return _threads.get(String(id)) || null;
}

/**
 * Hämta alla threads som array i Map-insertion-order.
 */
export function getThreads() {
  return Array.from(_threads.values());
}

/**
 * Hämta storleken på store.
 */
export function size() {
  return _threads.size;
}

/**
 * Töm storen. Notifierar med 'all'.
 */
export function clear() {
  if (_threads.size === 0) return;
  _threads.clear();
  _scheduleNotify('all');
}

/**
 * Subscribe på changes. Returnerar unsubscribe-function.
 *
 * @param {Function} callback - (threads: Map, changedIds: Array<string> | null) → void
 *                              changedIds === null betyder bulk-uppdatera ('all')
 */
export function subscribe(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

// ─────────── Debug-export ───────────

if (typeof window !== 'undefined') {
  window.__threadStore = {
    setThread,
    setThreads,
    getThread,
    getThreads,
    size,
    clear,
    subscribe,
    // Direct backing-store access for debug
    _threads,
    _subscribers,
  };
}
