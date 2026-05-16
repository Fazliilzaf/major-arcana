/**
 * app/components/lit-switchover.js
 * Fas 4 av Lit-migration — preview-läge för Lit-cards i live-appen.
 * Fas 8 av Lit-migration — full switch-over för ALLA köer.
 * Fas 9 av Lit-migration — Lit-mode default, shims rivna.
 * Fas 10 av Lit-migration — state-store ersätter DOM-scraping.
 *
 * Default: Lit replace-mode för alla cards i alla köer (no URL flag needed).
 *
 * Data-källa: thread-store via subscribe(). DOM-scraping är flyttad till
 * thread-store-bridge.js — denna fil läser BARA från store.
 *
 * URL-overrides:
 *
 *   ?layout=legacy
 *     - Helt no-op. Visar app.js's rå DOM-cards utan Lit-overlay.
 *     - Akut-rollback. Bridge & store är inaktiva, ingen overhead.
 *
 *   ?layout=lit&mode=panel
 *     - Original-cards orörda och synliga
 *     - Sidopanel höger om viewport visar Lit-versioner av Bokning-cards
 *     - Side-by-side preview (Fas 4-7 legacy panel-läge)
 *
 *   ?layout=lit (eller utan flag — DEFAULT)
 *     - Replace-mode: göm original-list (display:none), mounta Lit-container
 *       i samma föräldra-element, rendera ALLA cards genom arcana-thread-card
 *
 * Säkerhet:
 *   - Replace-mode rör inte originalets innehåll, bara display
 *   - Click på Lit-card → bridge.getLiveCardForThread(id) → .click() på det
 *     dolda originalet → app.js's delegerade handlers triggas
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';
import {
  groupThreadsByCustomer,
  orderForRender,
  readExpandedKeys,
  toggleExpanded,
} from './customer-cluster-grouper.js';
import { subscribe, getThreads } from './thread-store.js';
import { startBridge, getLiveCardForThread } from './thread-store-bridge.js';

// OBS: dessa let-deklarationer MÅSTE ligga FÖRE init()-anropet (TDZ).
let panel = null;
let replaceContainer = null;
let renderScheduled = false;
let storeUnsubscribe = null;

const SEARCH = new URLSearchParams(location.search);
const LAYOUT = SEARCH.get('layout');
const ACTIVE = LAYOUT !== 'legacy';
const MODE = SEARCH.get('mode') === 'panel' ? 'panel' : 'replace';

if (!ACTIVE) {
  console.log('[lit-switchover] LEGACY-mode — Lit avaktiverad via ?layout=legacy');
} else {
  console.log(`[lit-switchover] AKTIVT (default) — mode=${MODE}`);
  init();
}

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

function start() {
  // Starta bridge:n (DOM → store) FÖRST så vi har data när Lit subscribar
  startBridge();

  if (MODE === 'panel') {
    panel = createPanel();
    document.body.appendChild(panel);
  } else {
    mountReplaceContainer();
    // Lyssna på list-identity-byte: app.js's renderApp re-skapar
    // .queue-history-list som NY DOM-instans. Vi måste re-applicera
    // display:none + re-mounta vår replacement-container i nya parent.
    document.addEventListener('lit-list-changed', (e) => {
      const newList = e.detail?.list;
      if (!newList) return;
      newList.dataset.litHidden = 'true';
      newList.style.setProperty('display', 'none', 'important');
      // Om replacement detached från DOM (re-render) → re-mounta
      if (!replaceContainer || !document.contains(replaceContainer)) {
        mountReplaceContainer();
      } else if (replaceContainer.parentElement !== newList.parentElement) {
        // Flytta replacement till nya parent, FÖRE listan så Lit hamnar
        // exakt där listan skulle synas
        newList.parentElement.insertBefore(replaceContainer, newList);
      }
      schedule();
    });
  }

  // Subscribe på store — render när data ändras
  storeUnsubscribe = subscribe(() => schedule());

  // Initial render (för fallet där store redan har data)
  schedule();
}

function schedule() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (MODE === 'panel') renderLitPreview();
    else renderLitReplacement();
  });
}

// ─────────── Helpers delade mellan panel- och replace-mode ───────────

function buildPropsListFromStore(filter) {
  const threads = getThreads();
  const filtered = filter ? threads.filter(filter) : threads;
  return filtered.map((t) => ({
    ...t,
    ...threadToCardProps(t),
    // Behåll original-fältnamn customer-cluster-grouper förstår
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

function wireCardEvents(litCard, threadId) {
  litCard.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    // Slå upp live-cardet via bridge istället för att hålla en direkt-ref
    const liveCard = getLiveCardForThread(threadId);
    if (liveCard) {
      if (liveCard.offsetParent !== null) {
        liveCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      liveCard.click();
    }
  });
  litCard.addEventListener('cluster-toggle', (e) => {
    const key = e.detail?.key;
    if (!key) return;
    toggleExpanded(key);
    schedule();
  });
}

// ─────────── Mode: REPLACE (Fas 8+10) ───────────

function mountReplaceContainer() {
  const list = document.querySelector('.queue-history-list');
  if (!list) {
    setTimeout(mountReplaceContainer, 200);
    return;
  }

  // Göm originalet med !important så CSS-regler inte overridrar
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

  const status = document.createElement('div');
  status.className = 'lit-replace-status';
  status.style.cssText = `
    font-size: 11px;
    color: #94a3b8;
    padding: 4px 12px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.06);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  status.innerHTML = `
    <span class="lit-replace-status-text">Lit-läget aktivt (default · state-store)</span>
    <span style="font-size:10px;color:#cbd5e1;">Akut-rollback: <a href="?layout=legacy" style="color:#6366f1;text-decoration:none;">?layout=legacy</a></span>
  `;
  replaceContainer.appendChild(status);

  const grid = document.createElement('div');
  grid.className = 'lit-replace-grid';
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  replaceContainer.appendChild(grid);

  // FÖRE listan så Lit hamnar exakt där listan skulle synas (inte under
  // den eller efter andra siblings som queue-history-load-more)
  list.parentNode.insertBefore(replaceContainer, list);
}

function renderLitReplacement() {
  // Defensiv: replaceContainer kan ha blivit orphaned av app.js re-render.
  // Re-mounta i så fall och kör om nästa frame (data finns redan i store).
  if (!replaceContainer || !document.contains(replaceContainer)) {
    mountReplaceContainer();
    if (replaceContainer) requestAnimationFrame(() => renderLitReplacement());
    return;
  }
  const grid = replaceContainer.querySelector('.lit-replace-grid');
  const statusText = replaceContainer.querySelector('.lit-replace-status-text');
  if (!grid) return;

  const propsList = buildPropsListFromStore(); // ALLA threads
  if (propsList.length === 0) {
    grid.innerHTML =
      '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Inga cards i kön just nu.</div>';
    if (statusText) statusText.textContent = 'Lit-läget aktivt · 0 cards';
    return;
  }

  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);

  // Diff-strategi: bygg om hela grid. Lit-Element batchar internt.
  grid.innerHTML = '';
  let subCount = 0;
  ordered.forEach((props) => {
    const state = grouped.threadStateById.get(String(props.id || ''));

    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    applyClusterAttributes(litCard, state);
    if (state?.role === 'sub') subCount += 1;
    wireCardEvents(litCard, props.id);
    grid.appendChild(litCard);
  });

  if (statusText) {
    const groupCount = grouped.groups.length;
    const groupNote = groupCount > 0 ? ` · ${groupCount} cluster (${subCount} sub)` : '';
    const lanes = new Set(propsList.map((p) => p.lane).filter(Boolean));
    statusText.textContent = `Lit (state-store) · ${propsList.length} cards · ${lanes.size} köer${groupNote}`;
  }
}

// ─────────── Mode: PANEL (Fas 4-7 legacy) ───────────

function renderLitPreview() {
  if (!panel) return;
  const grid = panel.querySelector('.lit-grid');
  if (!grid) return;

  const propsList = buildPropsListFromStore((t) => {
    const lane = (t.primaryLaneId || '').toLowerCase();
    return lane === 'bookable' || lane === 'bokning' || lane === 'booking';
  });

  if (propsList.length === 0) {
    grid.innerHTML =
      '<div class="lit-empty">Inga Bokning-cards i kön just nu. Visa Bokning-filter eller vänta på data.</div>';
    return;
  }

  const visiblePropsList = propsList.slice(0, 8);
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(visiblePropsList, expanded);
  const ordered = orderForRender(visiblePropsList, grouped);

  grid.innerHTML = '';
  let subCount = 0;
  ordered.forEach((props) => {
    const state = grouped.threadStateById.get(String(props.id || ''));

    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    applyClusterAttributes(litCard, state);
    if (state?.role === 'sub') subCount += 1;
    wireCardEvents(litCard, props.id);
    grid.appendChild(litCard);
  });

  const status = panel.querySelector('.lit-status');
  if (status) {
    const groupCount = grouped.groups.length;
    const groupNote = groupCount > 0 ? ` · ${groupCount} cluster (${subCount} sub)` : '';
    status.textContent = `${ordered.length} av ${propsList.length} bokning-cards rendrade${groupNote}`;
  }
}

function createPanel() {
  const el = document.createElement('aside');
  el.id = 'lit-switchover-panel';
  el.style.cssText = `
    position: fixed;
    top: 64px;
    right: 16px;
    bottom: 16px;
    width: 380px;
    background: #ffffff;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.08);
    padding: 16px;
    z-index: 99998;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  `;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong style="font-size:13px;color:#1e293b;">Lit-preview · Bokning</strong>
      <button id="lit-close" style="border:none;background:transparent;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;" aria-label="Stäng">×</button>
    </div>
    <p class="lit-status" style="font-size:11px;color:#94a3b8;margin:0 0 12px;">Söker bokning-cards…</p>
    <div class="lit-grid" style="display:flex;flex-direction:column;gap:12px;"></div>
    <p style="font-size:11px;color:#cbd5e1;margin:16px 0 0;line-height:1.4;">
      Lit-cards från state-store (Fas 10). Klick triggar original-cardets action.
      <br><br>
      Bytte till full replace? Använd <code>?layout=lit</code> utan mode-param.
      <br>
      Stäng helt: ta bort <code>?layout=lit</code> ur URL.
    </p>
  `;
  el.querySelector('#lit-close').addEventListener('click', () => {
    el.remove();
    const url = new URL(location.href);
    url.searchParams.delete('layout');
    url.searchParams.delete('mode');
    history.replaceState({}, '', url);
  });
  return el;
}

// Exponera för debug
if (typeof window !== 'undefined') {
  window.__litSwitchover = {
    get mode() { return MODE; },
    get active() { return ACTIVE; },
    rerender: schedule,
    unsubscribe: () => { if (storeUnsubscribe) storeUnsubscribe(); },
  };
}
