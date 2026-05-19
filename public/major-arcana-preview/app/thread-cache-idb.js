/**
 * app/thread-cache-idb.js
 * Fas 46 (2026-05-20): Apple-Mail-pattern steg 1 — lokal IndexedDB-cache av
 * worklist-threads.
 *
 * Varför IndexedDB och inte localStorage:
 *  - localStorage är SYNKRON och blockerar main-thread vid läs/skriv. Fas 40
 *    försökte det och frös (JSON.stringify av 100+ trådar synkront).
 *  - IndexedDB är ASYNKRON och byggd för strukturerad data → ingen main-thread-
 *    blockering. Exakt det Apple Mail gör (SQLite på disk).
 *
 * Användning:
 *   await window.CcoThreadCache.saveThreads(threads)   // efter live-load
 *   const cached = await window.CcoThreadCache.loadThreads()  // vid bootstrap
 *   await window.CcoThreadCache.clearThreads()          // vid logout
 *
 * Cachen är per-origin (delas inte mellan kliniker). TTL 24h. Max 60 trådar
 * (skydd mot uppsvälld databas; resten hämtas ändå live i bakgrunden).
 */
(() => {
  'use strict';

  const DB_NAME = 'ccoThreadCache';
  const DB_VERSION = 1;
  const STORE = 'threads';
  const KEY = 'worklist';
  const TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const MAX_THREADS = 60;

  let _dbPromise = null;

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

  /**
   * Spara threads. Fire-and-forget — caller behöver inte await:a.
   * Strukturerad klon görs av IndexedDB själv (ingen JSON.stringify på
   * main-thread). Trådar med funktioner/cirkulära refs kan inte klonas →
   * vi plockar bara serialiserbara fält via en safe-copy.
   */
  function saveThreads(threads) {
    if (!Array.isArray(threads) || threads.length === 0) return Promise.resolve(false);
    return openDb()
      .then((db) => {
        // Safe-copy: structuredClone-kompatibel kopia (drop funktioner/DOM).
        let safe;
        try {
          safe = JSON.parse(JSON.stringify(threads.slice(0, MAX_THREADS)));
        } catch (_e) {
          // Om någon tråd inte är JSON-serialiserbar: hoppa cachen hellre än
          // att krascha. (JSON.parse/stringify körs här på en redan kapad
          // lista om max 60 → billigt, inte de 100+ som frös i Fas 40.)
          return false;
        }
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put({ key: KEY, ts: Date.now(), threads: safe });
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

  /**
   * Läs cachade threads. Returnerar Array eller null (inget/utgånget).
   */
  function loadThreads() {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            try {
              const tx = db.transaction(STORE, 'readonly');
              const req = tx.objectStore(STORE).get(KEY);
              req.onsuccess = () => {
                const v = req.result;
                if (
                  v &&
                  Array.isArray(v.threads) &&
                  v.threads.length > 0 &&
                  typeof v.ts === 'number' &&
                  Date.now() - v.ts < TTL_MS
                ) {
                  resolve(v.threads);
                } else {
                  resolve(null);
                }
              };
              req.onerror = () => resolve(null);
            } catch (_e) {
              resolve(null);
            }
          })
      )
      .catch(() => null);
  }

  function clearThreads() {
    return openDb()
      .then(
        (db) =>
          new Promise((resolve) => {
            try {
              const tx = db.transaction(STORE, 'readwrite');
              tx.objectStore(STORE).delete(KEY);
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
    window.CcoThreadCache = Object.freeze({ saveThreads, loadThreads, clearThreads });
  }
})();
