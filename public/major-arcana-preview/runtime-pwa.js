/**
 * Major Arcana Preview — PWA + Offline (P8 Prestanda & UX).
 *
 * Tre delar:
 *   1. Service worker registration
 *   2. Install-prompt UI (catcher för 'beforeinstallprompt')
 *   3. Offline action queue (IndexedDB) — köar mutations när offline,
 *      replay:ar dem när online igen.
 *   4. Push subscription helper (endast subscribe — server-push out of scope)
 *
 * Designprinciper:
 *   • SW-registrering bara på HTTPS (eller localhost)
 *   • Install-prompt visas med en stilren custom-knapp (inte browser-default)
 *   • Offline-queue: lagrar fetch-requests och replay:ar vid online
 *   • Subtle UX: pratar inte om "offline" om allt funkar — bara visar status när det matters
 */
(() => {
  'use strict';

  const SW_PATH = '/major-arcana-preview/sw.js';
  const SW_SCOPE = '/major-arcana-preview/';
  const DB_NAME = 'cco.offline.v1';
  const DB_VERSION = 1;
  const QUEUE_STORE = 'actions';

  let registration = null;
  let installPromptEvent = null;
  let installPromptShown = false;
  let onlineStatusListenersBound = false;

  // ───────── 1. Service Worker registration ─────────
  function isSupported() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  }

  async function registerServiceWorker() {
    if (!isSupported()) return null;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      return null; // SW kräver HTTPS (utom localhost)
    }
    try {
      registration = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
      // Lyssna på messages från SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'CCO_FLUSH_OFFLINE_QUEUE') {
          flushOfflineQueue().catch(() => {});
        }
      });
      // Lyssna på SW-uppdateringar
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // Ny SW är klar — be användaren om reload
            showUpdateAvailableToast();
          }
        });
      });
      return registration;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[CCO PWA] SW-registrering misslyckades:', error);
      return null;
    }
  }

  // ───────── 2. Install prompt ─────────
  function bindInstallPrompt() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPromptEvent = event;
      injectInstallButton();
    });
    window.addEventListener('appinstalled', () => {
      installPromptEvent = null;
      removeInstallButton();
      showToast('CCO installerat — öppna från hem-skärmen.', 'success');
    });
  }

  function injectInstallButton() {
    if (installPromptShown) return;
    if (document.getElementById('cco-pwa-install-btn')) return;
    injectStyles();
    const btn = document.createElement('button');
    btn.id = 'cco-pwa-install-btn';
    btn.className = 'cco-pwa-install-btn';
    btn.type = 'button';
    btn.innerHTML = `<span class="cco-pwa-install-icon">⤓</span><span>Installera CCO</span>`;
    btn.addEventListener('click', async () => {
      if (!installPromptEvent) return;
      try {
        installPromptEvent.prompt();
        const result = await installPromptEvent.userChoice;
        if (result?.outcome === 'accepted') {
          showToast('Installerar CCO…', 'success');
        }
        installPromptEvent = null;
        removeInstallButton();
      } catch (_e) {
        removeInstallButton();
      }
    });
    document.body.appendChild(btn);
    installPromptShown = true;
  }

  function removeInstallButton() {
    const btn = document.getElementById('cco-pwa-install-btn');
    if (btn) try { btn.remove(); } catch (_e) {}
    installPromptShown = false;
  }

  // ───────── 3. Offline action queue (IndexedDB) ─────────
  function openQueueDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB saknas'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function enqueueAction({ url, method = 'POST', headers = {}, body = null }) {
    try {
      const db = await openQueueDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const action = {
          url: String(url || ''),
          method,
          headers: headers && typeof headers === 'object' ? headers : {},
          body: body == null ? null : body,
          createdAt: Date.now(),
        };
        const req = store.add(action);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[CCO PWA] enqueue offline action failed:', error);
      return null;
    }
  }

  async function listQueuedActions() {
    try {
      const db = await openQueueDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readonly');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_e) {
      return [];
    }
  }

  async function deleteQueuedAction(id) {
    try {
      const db = await openQueueDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite');
        tx.objectStore(QUEUE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_e) { /* tyst */ }
  }

  async function flushOfflineQueue() {
    if (!navigator.onLine) return;
    const actions = await listQueuedActions();
    if (actions.length === 0) return;
    let succeeded = 0;
    for (const action of actions) {
      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.headers || { 'content-type': 'application/json' },
          body: action.body == null ? undefined : action.body,
          credentials: 'same-origin',
        });
        if (response.ok) {
          await deleteQueuedAction(action.id);
          succeeded += 1;
        }
      } catch (_e) {
        // Avbryt — vi är off igen, vänta på nästa online-event
        break;
      }
    }
    if (succeeded > 0) {
      showToast(`✓ ${succeeded} köad${succeeded === 1 ? ' åtgärd' : 'e åtgärder'} synkade.`, 'success');
    }
  }

  function bindOnlineStatusListener() {
    if (onlineStatusListenersBound) return;
    onlineStatusListenersBound = true;
    window.addEventListener('online', () => {
      showToast('Online igen — synkar köade åtgärder…', 'success');
      flushOfflineQueue().catch(() => {});
    });
    window.addEventListener('offline', () => {
      showToast('Offline-läge: åtgärder köas och synkas när du är online.', 'info');
    });
  }

  // ───────── 4. Push subscription helper ─────────
  async function subscribeToPush(vapidPublicKey) {
    if (!isSupported() || !registration) return null;
    if (!('PushManager' in window)) return null;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return null;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey ? urlBase64ToUint8Array(vapidPublicKey) : undefined,
      });
      return sub;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[CCO PWA] push subscription failed:', error);
      return null;
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  // ───────── UI: styles + toast ─────────
  function injectStyles() {
    if (document.getElementById('cco-pwa-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-pwa-styles';
    style.textContent = `
.cco-pwa-install-btn {
  position: fixed; bottom: 20px; right: 20px;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border: 0; border-radius: 999px;
  background: #2b251f; color: #fbf7f1;
  font-family: inherit; font-size: 13px; font-weight: 600;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32);
  cursor: pointer;
  z-index: 10000;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.cco-pwa-install-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.36);
}
.cco-pwa-install-icon { font-size: 16px; }
.cco-pwa-toast {
  position: fixed; bottom: 32px; left: 50%;
  transform: translateX(-50%) translateY(16px);
  padding: 10px 18px; border-radius: 10px;
  font-family: inherit; font-size: 12px;
  background: #2b251f; color: #fbf7f1;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32);
  opacity: 0; transition: opacity 0.18s ease, transform 0.18s ease;
  z-index: 10004; pointer-events: none;
  max-width: 480px; line-height: 1.4;
}
.cco-pwa-toast.is-visible {
  opacity: 1; transform: translateX(-50%) translateY(0);
}
.cco-pwa-toast.is-info { background: #4a4034; }
.cco-pwa-toast.is-success::before {
  content: '✓ '; margin-right: 4px; color: #b8e6c8;
}
@media (max-width: 767px) {
  .cco-pwa-install-btn { bottom: 80px; right: 12px; padding: 12px 16px; }
  .cco-pwa-toast { bottom: 24px; max-width: calc(100vw - 32px); }
}
`.trim();
    document.head.appendChild(style);
  }

  let pwaToastEl = null;
  let pwaToastTimer = 0;
  function showToast(message, kind = 'info') {
    injectStyles();
    if (pwaToastEl) {
      try { pwaToastEl.remove(); } catch (_e) {}
      pwaToastEl = null;
    }
    if (pwaToastTimer) {
      clearTimeout(pwaToastTimer);
      pwaToastTimer = 0;
    }
    pwaToastEl = document.createElement('div');
    pwaToastEl.className = `cco-pwa-toast is-${kind}`;
    pwaToastEl.textContent = message;
    document.body.appendChild(pwaToastEl);
    requestAnimationFrame(() => pwaToastEl?.classList.add('is-visible'));
    pwaToastTimer = window.setTimeout(() => {
      try { pwaToastEl?.classList.remove('is-visible'); } catch (_e) {}
      window.setTimeout(() => {
        try { pwaToastEl?.remove(); } catch (_e) {}
        pwaToastEl = null;
      }, 200);
    }, 3200);
  }

  function showUpdateAvailableToast() {
    showToast('Ny version tillgänglig — ladda om för att uppdatera.', 'info');
  }

  // ───────── Init ─────────
  function mount() {
    injectStyles();
    registerServiceWorker().catch(() => {});
    bindInstallPrompt();
    bindOnlineStatusListener();
    // Försök flusha tidigare köade actions vid startup
    if (navigator.onLine) {
      setTimeout(() => flushOfflineQueue().catch(() => {}), 1500);
    }
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewPWA = Object.freeze({
      mount,
      registerServiceWorker,
      enqueueAction,
      listQueuedActions,
      flushOfflineQueue,
      subscribeToPush,
      showInstallPrompt: () => {
        if (installPromptEvent) installPromptEvent.prompt();
      },
      isInstalled: () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator?.standalone === true,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
