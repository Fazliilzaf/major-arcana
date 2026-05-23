'use strict';

(function initCcoMobileQueue() {
  const MQ = '(max-width: 768px)';

  let actionsSheet = null;
  let activeCard = null;

  function isMobile() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function ensureActionsSheet() {
    if (actionsSheet) return actionsSheet;
    const shell = document.createElement('div');
    shell.className = 'cco-queue-row-actions-sheet';
    shell.hidden = true;
    shell.innerHTML = `
      <button type="button" class="cco-queue-row-actions-backdrop" data-cco-queue-actions-close aria-label="Stäng"></button>
      <div class="cco-queue-row-actions-panel" role="menu" aria-label="Trådåtgärder"></div>
    `;
    document.body.appendChild(shell);
    shell.querySelector('[data-cco-queue-actions-close]')?.addEventListener('click', closeActionsSheet);
    actionsSheet = shell;
    return shell;
  }

  function closeActionsSheet() {
    if (!actionsSheet) return;
    actionsSheet.hidden = true;
    activeCard = null;
  }

  function openActionsSheet(card) {
    const actions = card?.querySelector('.warm-actions');
    if (!actions) return;
    const sheet = ensureActionsSheet();
    const panel = sheet.querySelector('.cco-queue-row-actions-panel');
    if (!panel) return;

    const items = Array.from(actions.querySelectorAll('.action-icon'));

    panel.innerHTML = items
      .map((button) => {
        const label =
          button.getAttribute('aria-label') ||
          button.getAttribute('title') ||
          button.textContent.trim() ||
          'Åtgärd';
        return `<button type="button" data-cco-queue-action-clone="${label.replace(/"/g, '&quot;')}">${label}</button>`;
      })
      .join('');

    panel.querySelectorAll('[data-cco-queue-action-clone]').forEach((cloneBtn, index) => {
      cloneBtn.addEventListener('click', () => {
        items[index]?.click();
        closeActionsSheet();
      });
    });

    activeCard = card;
    sheet.hidden = false;
  }

  function enhanceWarmRow(card) {
    if (!isMobile() || !card?.classList?.contains('warm-row')) return;
    card.classList.add('warm-row--mobile-compact');
    const actions = card.querySelector('.warm-actions');
    if (!actions || actions.querySelector('[data-cco-queue-row-menu]')) return;

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'cco-queue-row-menu-btn';
    menuBtn.dataset.ccoQueueRowMenu = '1';
    menuBtn.setAttribute('aria-label', 'Fler åtgärder');
    menuBtn.textContent = '⋯';
    menuBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openActionsSheet(card);
    });
    actions.insertBefore(menuBtn, actions.firstChild);
  }

  function scanQueueRows() {
    if (!isMobile()) return;
    document.querySelectorAll('.thread-card.unified-queue-card.warm-row').forEach(enhanceWarmRow);
  }

  function ensureFilterToggle() {
    const tools = document.querySelector('.queue-stream-tools');
    if (!tools || tools.querySelector('[data-cco-queue-filter-toggle]')) return;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'cco-mobile-queue-filter-toggle inbox-filter-toggle-pill';
    toggle.dataset.ccoQueueFilterToggle = '1';
    toggle.dataset.collapsed = '1';
    toggle.innerHTML = 'Filter <span aria-hidden="true">▾</span>';
    tools.insertBefore(toggle, tools.firstChild);

    document.body.classList.add('has-inbox-filters-collapsed');

    toggle.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('has-inbox-filters-collapsed');
      toggle.dataset.collapsed = collapsed ? '1' : '0';
      toggle.innerHTML = collapsed
        ? 'Filter <span aria-hidden="true">▾</span>'
        : 'Filter <span aria-hidden="true">▴</span>';
    });
  }

  function applyMobileQueueChrome() {
    if (!isMobile()) {
      closeActionsSheet();
      return;
    }
    ensureFilterToggle();
    scanQueueRows();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-cco-queue-row-menu]')) return;
    if (!event.target.closest('.cco-queue-row-actions-sheet')) {
      /* keep sheet open only via backdrop */
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeActionsSheet();
  });

  const listRoot =
    document.querySelector('[data-queue-history-list]') ||
    document.querySelector('.queue-history-list') ||
    document.body;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(scanQueueRows);
  });
  observer.observe(listRoot, { childList: true, subtree: true });

  try {
    window.matchMedia(MQ).addEventListener('change', applyMobileQueueChrome);
  } catch {
    window.addEventListener('resize', applyMobileQueueChrome);
  }

  window.addEventListener('DOMContentLoaded', applyMobileQueueChrome);
  applyMobileQueueChrome();

  window.ArcanaMobileQueue = Object.freeze({
    scanQueueRows,
    closeActionsSheet,
  });
})();
