'use strict';

/**
 * CCO Adaptive Runtime — JS-baserade responsiva transformationer.
 *
 * 1. Tabeller → kort-lista på mobil
 * 2. Steg-baserade formulär på mobil
 * 3. Bottom sheet controller
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

  // ─── 1. TABLE → CARD LIST ───

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

  // ─── 2. STEP-BASED FORMS ───

  function initFormSteps(form) {
    if (!form || form.dataset.adaptiveSteps) return;
    const sections = Array.from(form.querySelectorAll('[data-form-step]'));
    if (sections.length < 2) return;

    form.dataset.adaptiveSteps = 'true';
    let currentStep = 0;

    const progress = document.createElement('div');
    progress.className = 'cco-form-progress';
    sections.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'cco-form-progress-dot' + (i === 0 ? ' is-active' : '');
      progress.appendChild(dot);
    });
    form.prepend(progress);

    const navBar = document.createElement('div');
    navBar.style.cssText = 'display:flex;gap:8px;margin-top:16px;position:sticky;bottom:0;padding:12px 0;background:var(--cco-bg-page,#faf6f2);';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '← Tillbaka';
    prevBtn.className = 'cco-adaptive-btn';
    prevBtn.style.cssText = 'flex:1;background:var(--cco-border);color:var(--cco-text-primary);';
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Nästa →';
    nextBtn.className = 'cco-adaptive-btn';
    nextBtn.style.cssText = 'flex:2;';
    navBar.appendChild(prevBtn);
    navBar.appendChild(nextBtn);
    form.appendChild(navBar);

    function showStep(idx) {
      sections.forEach((s, i) => {
        s.style.display = i === idx ? '' : 'none';
      });
      const dots = progress.querySelectorAll('.cco-form-progress-dot');
      dots.forEach((d, i) => {
        d.className = 'cco-form-progress-dot' + (i === idx ? ' is-active' : i < idx ? ' is-done' : '');
      });
      prevBtn.style.display = idx === 0 ? 'none' : '';
      nextBtn.textContent = idx === sections.length - 1 ? 'Signera ✓' : 'Nästa →';
      currentStep = idx;
    }

    prevBtn.addEventListener('click', () => { if (currentStep > 0) showStep(currentStep - 1); });
    nextBtn.addEventListener('click', () => {
      if (currentStep < sections.length - 1) showStep(currentStep + 1);
    });

    if (isMobile()) showStep(0);
  }

  function applyFormSteps() {
    if (!isMobile()) return;
    document.querySelectorAll('form[data-adaptive-form], [data-adaptive-form]').forEach(initFormSteps);
  }

  // ─── 3. BOTTOM SHEET CONTROLLER ───

  function openBottomSheet(contentEl) {
    let sheet = document.getElementById('cco-adaptive-bottom-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'cco-adaptive-bottom-sheet';
      sheet.className = 'cco-bottom-sheet';
      sheet.innerHTML = '<div class="cco-bottom-sheet-panel"><div class="cco-bottom-sheet-handle" style="width:40px;height:4px;border-radius:2px;background:var(--cco-border);margin:0 auto 16px;"></div><div class="cco-bottom-sheet-content"></div></div>';
      sheet.addEventListener('click', (e) => { if (e.target === sheet) closeBottomSheet(); });
      document.body.appendChild(sheet);
    }
    const content = sheet.querySelector('.cco-bottom-sheet-content');
    content.innerHTML = '';
    if (typeof contentEl === 'string') {
      content.innerHTML = contentEl;
    } else if (contentEl instanceof HTMLElement) {
      content.appendChild(contentEl.cloneNode(true));
    }
    sheet.dataset.open = 'true';
  }

  function closeBottomSheet() {
    const sheet = document.getElementById('cco-adaptive-bottom-sheet');
    if (sheet) sheet.dataset.open = 'false';
  }

  // ─── INIT ───

  function applyAll() {
    applyTableTransformations();
    applyFormSteps();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

  try {
    window.matchMedia(MQ_MOBILE).addEventListener('change', applyAll);
    window.matchMedia(MQ_TABLET).addEventListener('change', applyAll);
  } catch {
    window.addEventListener('resize', applyAll);
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
    openBottomSheet,
    closeBottomSheet,
    applyTableTransformations,
    applyFormSteps,
  });
})();
