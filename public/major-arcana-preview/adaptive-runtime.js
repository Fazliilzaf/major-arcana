'use strict';
/**
 * CCO Adaptive Runtime — JS-baserade responsiva transformationer.
 *
 * Tabeller → kort-lista på mobil.
 *
 * (Steg-formulär och bottom-sheet-API togs bort 2026-05 i Fas 2-konsolideringen:
 *  step-form aktiverades aldrig — den krävde data-form-step/data-adaptive-form
 *  som inte fanns i någon markup — och bottom-sheet-API:t hade noll anropare.)
 */
(function initAdaptiveRuntime() {
  const MQ_MOBILE = '(max-width: 767px)';
  const MQ_TABLET = '(min-width: 768px) and (max-width: 1023px)';
  function isMobile() {
    try { return window.matchMedia(MQ_MOBILE).matches; } catch { return false; }
  }
  function isTablet() {
    try { return window.matchMedia(MQ_TABLET).matches; } catch { return false; }
  }
  // ─── TABLE → CARD LIST ───
  function transformTableToCards(table) {
    if (!table || table.dataset.adaptiveTransformed) return;
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map((th) => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (!headers.length || !rows.length) return;
    const cardList = document.createElement('div');
    cardList.className = 'cco-mobile-card-list';
    cardList.dataset.adaptiveSource = 'table';
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      const card = document.createElement('div');
      card.className = 'cco-adaptive-card';
      card.style.cssText = 'padding: var(--cco-card-padding, 14px); margin-bottom: var(--cco-space-sm, 8px); border-radius: var(--cco-card-radius, 14px); background: var(--cco-bg-card, rgba(250,246,242,0.92)); border: 1px solid var(--cco-border, rgba(120,105,90,0.16));';
      let html = '';
      cells.forEach((cell, i) => {
        const label = headers[i] || '';
        const value = cell.innerHTML;
        if (i === 0) {
          html += '<div style="font-weight:600;font-size:15px;margin-bottom:6px;">' + value + '</div>';
        } else if (value.trim()) {
          html += '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;"><span style="color:var(--cco-text-secondary,rgba(70,60,50,0.55));">' + label + '</span><span>' + value + '</span></div>';
        }
      });
      card.innerHTML = html;
      cardList.appendChild(card);
    }
    table.style.display = 'none';
    table.dataset.adaptiveTransformed = 'true';
    table.parentNode.insertBefore(cardList, table.nextSibling);
  }
  function revertCardListToTable(table) {
    if (!table || !table.dataset.adaptiveTransformed) return;
    const cardList = table.nextElementSibling;
    if (cardList && cardList.dataset.adaptiveSource === 'table') {
      cardList.remove();
    }
    table.style.display = '';
    delete table.dataset.adaptiveTransformed;
  }
  function applyTableTransformations() {
    const tables = document.querySelectorAll('.preview-page table:not([data-no-transform]), .focus-surface table:not([data-no-transform])');
    if (isMobile()) {
      tables.forEach(transformTableToCards);
    } else {
      tables.forEach(revertCardListToTable);
    }
  }
  // ─── INIT ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTableTransformations);
  } else {
    applyTableTransformations();
  }
  try {
    window.matchMedia(MQ_MOBILE).addEventListener('change', applyTableTransformations);
    window.matchMedia(MQ_TABLET).addEventListener('change', applyTableTransformations);
  } catch {
    window.addEventListener('resize', applyTableTransformations);
  }
  // Re-apply when new content is rendered
  const observer = new MutationObserver(() => {
    requestAnimationFrame(applyTableTransformations);
  });
  const target = document.querySelector('.preview-canvas') || document.body;
  observer.observe(target, { childList: true, subtree: true });
  // Expose API
  window.CcoAdaptiveRuntime = Object.freeze({
    isMobile,
    isTablet,
    applyTableTransformations,
  });
})();
