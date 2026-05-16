/**
 * app/components/lit-switchover.js
 * Fas 4 av Lit-migration — preview-läge för Lit-cards i live-appen.
 *
 * AKTIVERAS BARA när URL har ?layout=lit. Annars helt inaktiv (no-op).
 *
 * När aktiv:
 *   1. Scannar .queue-history-list efter cards med data-lane="bookable"
 *      (eller "bokning")
 *   2. Extraherar data från cardets DOM (sender, subject, preview, etc.)
 *      via DOM-scraping
 *   3. Visar Lit-cards i en sidopanel höger om viewport
 *   4. Original-cards är HELT ORÖRDA — användaren ser SIDE-BY-SIDE
 *
 * Avstängning: ta bort ?layout=lit ur URL och ladda om.
 *
 * Säkerhet:
 *   - Opt-in via URL — inaktiv för vanliga användare
 *   - Modifierar inga befintliga DOM-element
 *   - Klick på Lit-cards forwardas till originalets data-runtime-thread
 *     via Custom Event så app.js's click-handlers fortfarande fungerar
 */
import './arcana-thread-card.js';
import { threadToCardProps } from './thread-to-card-props.js';

const SEARCH = new URLSearchParams(location.search);
const ACTIVE = SEARCH.get('layout') === 'lit';

if (!ACTIVE) {
  console.log('[lit-switchover] Inaktiv (lägg till ?layout=lit i URL för att aktivera)');
} else {
  console.log('[lit-switchover] AKTIVT — visar Lit-cards för Bokning-kön i sidopanel');
  init();
}

function init() {
  // Vänta på att DOM är klar OCH appen har renderat första cards
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
}

let panel = null;
let renderScheduled = false;

function startObserver() {
  // Skapa sidopanel direkt så användaren ser att läget är aktivt
  panel = createPanel();
  document.body.appendChild(panel);

  // Render första pass + observera ändringar
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
    renderLitPreview();
  });
}

function renderLitPreview() {
  const grid = panel.querySelector('.lit-grid');
  if (!grid) return;

  // Hitta bookable cards i live-kön
  const liveCards = Array.from(
    document.querySelectorAll(
      '.queue-history-list .thread-card[data-runtime-thread]:not([data-runtime-thread="runtime-unified-empty"])',
    ),
  ).filter((c) => {
    const lane = (c.dataset.lane || '').toLowerCase();
    return lane === 'bookable' || lane === 'bokning' || lane === 'booking';
  });

  if (liveCards.length === 0) {
    grid.innerHTML =
      '<div class="lit-empty">Inga Bokning-cards i kön just nu. Visa Bokning-filter eller vänta på data.</div>';
    return;
  }

  // Bygg Lit-cards
  grid.innerHTML = '';
  for (const live of liveCards.slice(0, 5)) {
    const threadShape = scrapeCardData(live);
    const props = threadToCardProps(threadShape);
    const litCard = document.createElement('arcana-thread-card');
    litCard.thread = props;
    // Forwarda klick till original-cardet
    litCard.addEventListener('click', () => {
      live.scrollIntoView({ block: 'center', behavior: 'smooth' });
      live.click();
    });
    grid.appendChild(litCard);
  }

  // Statusrad
  const status = panel.querySelector('.lit-status');
  if (status) {
    status.textContent = `${Math.min(liveCards.length, 5)} av ${liveCards.length} bokning-cards rendrade som Lit`;
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
      Stäng: <code>?layout=lit</code> bort ur URL.
    </p>
  `;
  el.querySelector('#lit-close').addEventListener('click', () => {
    el.remove();
    const url = new URL(location.href);
    url.searchParams.delete('layout');
    history.replaceState({}, '', url);
  });
  return el;
}
