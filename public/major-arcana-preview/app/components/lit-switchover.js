/**
 * app/components/lit-switchover.js
 * Fas 4 av Lit-migration — preview-läge för Lit-cards i live-appen.
 * Fas 8 av Lit-migration — full switch-over för ALLA köer.
 *
 * AKTIVERAS BARA när URL har ?layout=lit. Annars helt inaktiv (no-op).
 *
 * Två lägen (välj via &mode=… i URL):
 *
 *   mode=replace (DEFAULT — Fas 8)
 *     - Göm original .queue-history-list visuellt (display:none) men behåll
 *       i DOM som data-source och click-target
 *     - Mounta en ny Lit-list-container i samma föräldra-element
 *     - Rendera ALLA cards (inte bara bookable) genom arcana-thread-card
 *     - Click på Lit-card → kalla .click() på den dolda originalet → app.js's
 *       delegerade handlers triggas → panelen öppnas som vanligt
 *
 *   mode=panel (Fas 4-7 legacy)
 *     - Original-cards orörda och synliga
 *     - Sidopanel höger om viewport visar Lit-versioner av Bokning-cards
 *     - Side-by-side preview
 *
 * Avstängning: ta bort ?layout=lit ur URL och ladda om.
 *
 * Säkerhet:
 *   - Opt-in via URL — inaktiv för vanliga användare
 *   - Replace-mode rör inte originalets innehåll, bara display
 *   - Cluster-toggle event delas mellan Lit (via parent) och legacy
 *     (via customer-cluster.js) via samma localStorage-key
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';
import {
  groupThreadsByCustomer,
  orderForRender,
  readExpandedKeys,
  toggleExpanded,
} from './customer-cluster-grouper.js';

// OBS: dessa let-deklarationer MÅSTE ligga FÖRE init()-anropet (TDZ).
let panel = null;
let replaceContainer = null;
let renderScheduled = false;

const SEARCH = new URLSearchParams(location.search);
const ACTIVE = SEARCH.get('layout') === 'lit';
const MODE = SEARCH.get('mode') === 'panel' ? 'panel' : 'replace';

if (!ACTIVE) {
  console.log('[lit-switchover] Inaktiv (lägg till ?layout=lit i URL för att aktivera)');
} else {
  console.log(`[lit-switchover] AKTIVT — mode=${MODE}`);
  init();
}

function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
}

function startObserver() {
  if (MODE === 'panel') {
    panel = createPanel();
    document.body.appendChild(panel);
  } else {
    mountReplaceContainer();
  }

  schedule();
  const observerTarget = document.querySelector('.queue-history-list') || document.body;
  const obs = new MutationObserver(() => schedule());
  obs.observe(observerTarget, { childList: true, subtree: true });
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

function scrapeAllLiveCards(filter) {
  return Array.from(
    document.querySelectorAll(
      '.queue-history-list .thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])',
    ),
  ).filter((c) => (filter ? filter(c) : true));
}

function buildPropsListFromCards(cards) {
  const shapes = cards.map(scrapeCardData);
  return shapes.map((t) => ({
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

function wireCardEvents(litCard, liveCard) {
  litCard.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (liveCard) {
      // OBS: scrollIntoView fungerar inte på display:none element, så det
      // är hoppas-över i replace-mode. Click() bubblar fortfarande till
      // app.js's delegerade handlers.
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

// ─────────── Mode: REPLACE (Fas 8) ───────────

function mountReplaceContainer() {
  const list = document.querySelector('.queue-history-list');
  if (!list) {
    // App har inte renderat listan än — försök igen om 200 ms
    setTimeout(mountReplaceContainer, 200);
    return;
  }

  // Göm originalet (display:none → behåll i DOM för scraping + click)
  list.dataset.litHidden = 'true';
  list.style.display = 'none';

  // Skapa Lit-container precis efter originalet
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

  // Liten statusrad högst upp för debug
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
    <span class="lit-replace-status-text">Lit-replacement aktiv (alla köer)</span>
    <span style="font-size:10px;color:#cbd5e1;">?layout=lit · <a href="?" style="color:#6366f1;text-decoration:none;">stäng av</a></span>
  `;
  replaceContainer.appendChild(status);

  const grid = document.createElement('div');
  grid.className = 'lit-replace-grid';
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  replaceContainer.appendChild(grid);

  list.parentNode.insertBefore(replaceContainer, list.nextSibling);
}

function renderLitReplacement() {
  if (!replaceContainer) return;
  const grid = replaceContainer.querySelector('.lit-replace-grid');
  const statusText = replaceContainer.querySelector('.lit-replace-status-text');
  if (!grid) return;

  // ALLA cards (inget lane-filter — det är skillnaden mot panel-mode)
  const liveCards = scrapeAllLiveCards();

  if (liveCards.length === 0) {
    grid.innerHTML =
      '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">Inga cards i kön just nu.</div>';
    if (statusText) statusText.textContent = 'Lit-replacement aktiv · 0 cards';
    return;
  }

  const propsList = buildPropsListFromCards(liveCards);
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);

  // Re-render: enkel diff-strategi → bygg om hela grid. Lit-Element batchar
  // sin egen rendering så detta är snabbt nog för <500 cards.
  grid.innerHTML = '';
  let subCount = 0;
  ordered.forEach((props) => {
    const idx = propsList.indexOf(props);
    const live = liveCards[idx];
    const state = grouped.threadStateById.get(String(props.id || ''));

    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    applyClusterAttributes(litCard, state);
    if (state?.role === 'sub') subCount += 1;
    wireCardEvents(litCard, live);
    grid.appendChild(litCard);
  });

  if (statusText) {
    const groupCount = grouped.groups.length;
    const groupNote = groupCount > 0 ? ` · ${groupCount} cluster (${subCount} sub)` : '';
    const lanes = new Set(propsList.map((p) => p.lane).filter(Boolean));
    statusText.textContent = `Lit-replacement · ${liveCards.length} cards · ${lanes.size} köer${groupNote}`;
  }
}

// ─────────── Mode: PANEL (Fas 4-7 legacy) ───────────

function renderLitPreview() {
  if (!panel) return;
  const grid = panel.querySelector('.lit-grid');
  if (!grid) return;

  const liveCards = scrapeAllLiveCards((c) => {
    const lane = (c.dataset.lane || '').toLowerCase();
    return lane === 'bookable' || lane === 'bokning' || lane === 'booking';
  });

  if (liveCards.length === 0) {
    grid.innerHTML =
      '<div class="lit-empty">Inga Bokning-cards i kön just nu. Visa Bokning-filter eller vänta på data.</div>';
    return;
  }

  const visibleCards = liveCards.slice(0, 8);
  const propsList = buildPropsListFromCards(visibleCards);
  const expanded = readExpandedKeys();
  const grouped = groupThreadsByCustomer(propsList, expanded);
  const ordered = orderForRender(propsList, grouped);

  grid.innerHTML = '';
  let subCount = 0;
  ordered.forEach((props) => {
    const idx = propsList.indexOf(props);
    const live = visibleCards[idx];
    const state = grouped.threadStateById.get(String(props.id || ''));

    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    applyClusterAttributes(litCard, state);
    if (state?.role === 'sub') subCount += 1;
    wireCardEvents(litCard, live);
    grid.appendChild(litCard);
  });

  const status = panel.querySelector('.lit-status');
  if (status) {
    const groupCount = grouped.groups.length;
    const groupNote = groupCount > 0 ? ` · ${groupCount} cluster (${subCount} sub)` : '';
    status.textContent = `${ordered.length} av ${liveCards.length} bokning-cards rendrade${groupNote}`;
  }
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
    // Fas 7: server-styrd cluster-data
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
      Lit-cards rendrade från live worklist-data via threadToCardProps.
      Klick scrollar till original-cardet och triggrar dess action.
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
  };
}
