/**
 * CCO Request Cache — Fas 2 central data layer (vanilla JS, not React Query).
 */
(() => {
  'use strict';

  if (window.__ARCANA_CCO_REQUEST_CACHE__) return;
  window.__ARCANA_CCO_REQUEST_CACHE__ = true;

  class CcoRequestCache {
    constructor() {
      this.entries = new Map();
      this.listeners = new Map();
    }

    _now() {
      return Date.now();
    }

    _gc(entry, gcTime) {
      if (!entry) return;
      const maxAge = Math.max(0, Number(gcTime) || 0);
      if (maxAge <= 0) return;
      if (this._now() - entry.updatedAt > maxAge) {
        this.entries.delete(entry.key);
      }
    }

    subscribe(key, listener) {
      const safeKey = String(key || '');
      if (!safeKey || typeof listener !== 'function') return () => {};
      const set = this.listeners.get(safeKey) || new Set();
      set.add(listener);
      this.listeners.set(safeKey, set);
      return () => {
        const current = this.listeners.get(safeKey);
        if (!current) return;
        current.delete(listener);
        if (!current.size) this.listeners.delete(safeKey);
      };
    }

    _notify(key, data) {
      const set = this.listeners.get(key);
      if (!set) return;
      set.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.warn('[CcoRequestCache] listener failed', error);
        }
      });
    }

    invalidate(keyOrPrefix) {
      const token = String(keyOrPrefix || '');
      if (!token) return;
      for (const key of [...this.entries.keys()]) {
        if (key === token || key.startsWith(token)) {
          this.entries.delete(key);
        }
      }
    }

    peek(key) {
      const entry = this.entries.get(String(key || ''));
      return entry ? entry.data : undefined;
    }

    async fetch(key, fn, options = {}) {
      const safeKey = String(key || '');
      if (!safeKey || typeof fn !== 'function') {
        throw new Error('CcoRequestCache.fetch requires key and fn');
      }

      const staleTime = Math.max(0, Number(options.staleTime) || 0);
      const gcTime = Math.max(staleTime, Number(options.gcTime) || staleTime || 5 * 60 * 1000);
      const force = options.force === true;
      const existing = this.entries.get(safeKey);

      if (existing) {
        this._gc(existing, gcTime);
      }

      const fresh = this.entries.get(safeKey);
      const age = fresh ? this._now() - fresh.updatedAt : Infinity;

      if (!force && fresh && !fresh.error && age <= staleTime) {
        window.ArcanaCcoFetchInstrumentation?.noteDedupe?.(1);
        return fresh.data;
      }

      if (!force && fresh?.promise) {
        window.ArcanaCcoFetchInstrumentation?.noteDedupe?.(1);
        return fresh.promise;
      }

      const promise = Promise.resolve()
        .then(fn)
        .then((data) => {
          const entry = {
            key: safeKey,
            data,
            error: null,
            updatedAt: this._now(),
            promise: null,
          };
          this.entries.set(safeKey, entry);
          this._notify(safeKey, data);
          return data;
        })
        .catch((error) => {
          const entry = this.entries.get(safeKey);
          if (entry) {
            entry.promise = null;
            entry.error = error;
          }
          throw error;
        });

      this.entries.set(safeKey, {
        key: safeKey,
        data: fresh?.data,
        error: null,
        updatedAt: fresh?.updatedAt || 0,
        promise,
      });

      return promise;
    }
  }

  const cache = new CcoRequestCache();

  window.ArcanaCcoData = Object.freeze({
    cache,
    policy: window.ArcanaCcoCachePolicy || {},
    invalidate: (key) => cache.invalidate(key),
    peek: (key) => cache.peek(key),
    subscribe: (key, listener) => cache.subscribe(key, listener),
    fetch: (key, fn, options) => cache.fetch(key, fn, options),
  });
})();
