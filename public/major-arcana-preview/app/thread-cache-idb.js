/**
 * app/thread-cache-idb.js
 * Fas 46 (2026-05-20): Apple-Mail-pattern steg 1 — lokal IndexedDB-cache av
 * worklist-threads.
 * Fas 50 (2026-05-20): Scope-aware cache — varje mejlurval får egen nyckel
 * (Mail filtrerar lokalt utan ny nätverks-sync).
 * Fas 51 (2026-05-20): DB v2 — workspace snapshot (tråd + lane + mailboxscope)
 * sparas tillsammans med threads för cold boot utan sessionStorage.
 *
 * Varför IndexedDB och inte localStorage:
 *  - localStorage är SYNKRON och blockerar main-thread vid läs/skriv. Fas 40
 *    försökte det och frös (JSON.stringify av 100+ trådar synkront).
 *  - IndexedDB är ASYNKRON och byggd för strukturerad data → ingen main-thread-
 *    blockering. Exakt det Apple Mail gör (SQLite på disk).
 *
 * Användning:
 *   await window.CcoThreadCache.saveThreads(threads, { mailboxIds, workspace })
 *   const cached = await window.CcoThreadCache.loadCacheEntry({ mailboxIds })
 *   await window.CcoThreadCache.clearThreads()
 *
 * Cachen är per-origin (delas inte mellan kliniker). TTL 24h. Max 120 trådar
 * per scope (resten hämtas ändå live i bakgrunden).
 */
(() => {
  'use strict';

  const DB_NAME = 'ccoThreadCache';
  const DB_VERSION = 2;
  const STORE = 'threads';
  const LEGACY_KEY = 'worklist';
  const TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const MAX_THREADS = 120;

  let _dbPromise = null;

  function normalizeMailboxId(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function buildScopeKey(mailboxIds = []) {
    const normalized = Array.from(
      new Set(
        (Array.isArray(mailboxIds) ? mailboxIds : [])
          .map((value) => normalizeMailboxId(value))
          .filter(Boolean)
      )
    ).sort();
    if (!normalized.length) return `${LEGACY_KEY}|all`;
    return `${LEGACY_KEY}|${normalized.join(',')}`;
  }

  function openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('indexedDB saknas'));
          return;
        }
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('idb open error'));
    });
    return _dbPromise;
  }

  function readEntry(db, key) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_e) {
        resolve(null);
      }
    });
  }

  function isFreshEntry(entry) {
    return (
      entry &&
      Array.isArray(entry.threads) &&
      entry.threads.length > 0 &&
      typeof entry.ts === 'number' &&
      Date.now() - entry.ts < TTL_MS
    );
  }

  function filterThreadsForScope(threads, mailboxIds = []) {
    const scope = new Set(
      (Array.isArray(mailboxIds) ? mailboxIds : [])
        .map((value) => normalizeMailboxId(value))
        .filter(Boolean)
    );
    if (!scope.size) return threads;
    return threads.filter((thread) => {
      const mailbox = normalizeMailboxId(
        thread?.mailboxAddress || thread?.mailbox || thread?.mailboxId || ''
      );
      return mailbox && scope.has(mailbox);
    });
  }

  function safeCopyThreads(threads) {
    try {
      return JSON.parse(JSON.stringify(threads.slice(0, MAX_THREADS)));
    } catch (_e) {
      return null;
    }
  }

  function normalizeWorkspaceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    try {
      const copy = JSON.parse(JSON.stringify(snapshot));
      if (!copy || typeof copy !== 'object') return null;
      copy.version = 2;
      return copy;
    } catch (_e) {
      return null;
    }
  }

  function hasWorkspaceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (String(snapshot.selectedThreadId || '').trim()) return true;
    if (String(snapshot.activeLaneId || 'all').trim() !== 'all') return true;
    if (Array.isArray(snapshot.mailboxscope) && snapshot.mailboxscope.length) return true;
    if (String(snapshot.selectedOwnerKey || 'all').trim() !== 'all') return true;
    return false;
  }

  /**
   * Spara threads. Fire-and-forget — caller behöver inte await:a.
   */
  function saveThreads(threads, options = {}) {
    if (!Array.isArray(threads) || threads.length === 0) return Promise.resolve(false);
    const scopeKey = buildScopeKey(options.mailboxIds);
    const safe = safeCopyThreads(threads);
    if (!safe) return Promise.resolve(false);
    const workspace = normalizeWorkspaceSnapshot(options.workspace);

    return openDb()
      .then((db) => {
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            const payload = {
              key: scopeKey,
              ts: Date.now(),
              dbVersion: DB_VERSION,
              threads: safe,
              lastEnrichedAt: String(options.lastEnrichedAt || '').trim(),
              workspace,
            };
            store.put(payload);
            // Bakåtkompatibilitet + snabb boot utan scope: behåll legacy-nyckel.
            if (scopeKey !== LEGACY_KEY) {
              store.put({
                key: LEGACY_KEY,
                ts: Date.now(),
                dbVersion: DB_VERSION,
                threads: safe,
                lastEnrichedAt: String(options.lastEnrichedAt || '').trim(),
                workspace,
              });
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch (_e) {
            resolve(false);
          }
        });
      })
      .catch(() => false);
  }

  function saveWorkspaceSnapshot(workspace, options = {}) {
    const normalized = normalizeWorkspaceSnapshot(workspace);
    if (!normalized || !hasWorkspaceSnapshot(normalized)) {
      return Promise.resolve(false);
    }
    const scopeKey = buildScopeKey(options.mailboxIds);
    return openDb()
      .then(async (db) => {
        const existing = (await readEntry(db, scopeKey)) || {};
        const threads = Array.isArray(existing.threads) ? existing.threads : [];
        if (!threads.length) return false;
        return saveThreads(threads, {
          mailboxIds: options.mailboxIds,
          lastEnrichedAt: options.lastEnrichedAt || existing.lastEnrichedAt,
          workspace: normalized,
        });
      })
      .catch(() => false);
  }

  function loadCacheEntry(options = {}) {
    const scopeKey = buildScopeKey(options.mailboxIds);
    return openDb()
      .then(async (db) => {
        const scopedEntry = await readEntry(db, scopeKey);
        if (isFreshEntry(scopedEntry)) {
          return scopedEntry;
        }

        const legacyEntry = scopeKey === LEGACY_KEY ? null : await readEntry(db, LEGACY_KEY);
        if (isFreshEntry(legacyEntry)) {
          const filtered = filterThreadsForScope(legacyEntry.threads, options.mailboxIds);
          if (filtered.length) {
            return { ...legacyEntry, threads: filtered };
          }
        }

        const allEntry = await readEntry(db, `${LEGACY_KEY}|all`);
        if (isFreshEntry(allEntry)) {
          const filtered = filterThreadsForScope(allEntry.threads, options.mailboxIds);
          if (filtered.length) {
            return { ...allEntry, threads: filtered };
          }
        }

        return null;
      })
      .catch(() => null);
  }

  /**
   * Läs cachade threads för aktivt mejlurval. Returnerar Array eller null.
   */
  function loadThreads(options = {}) {
    return loadCacheEntry(options).then((entry) =>
      entry && Array.isArray(entry.threads) ? entry.threads : null
    );
  }

  function loadWorkspaceSnapshot(options = {}) {
    return loadCacheEntry(options).then((entry) =>
      entry && entry.workspace && typeof entry.workspace === 'object' ? entry.workspace : null
    );
  }

  function clearThreads() {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            try {
              const tx = db.transaction(STORE, 'readwrite');
              tx.objectStore(STORE).clear();
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => resolve(false);
            } catch (_e) {
              resolve(false);
            }
          })
      )
      .catch(() => false);
  }

  if (typeof window !== 'undefined') {
    window.CcoThreadCache = Object.freeze({
      DB_VERSION,
      buildScopeKey,
      saveThreads,
      saveWorkspaceSnapshot,
      loadThreads,
      loadCacheEntry,
      loadWorkspaceSnapshot,
      clearThreads,
      hasWorkspaceSnapshot,
    });
  }
})();
