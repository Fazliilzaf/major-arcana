/**
 * Virtual scroll for patient list — Fas 11.
 * Reuses lit-switchover spacer pattern (~56px compact row).
 */
(() => {
  'use strict';

  if (window.__ARCANA_CCO_PATIENT_LIST_VIRTUAL__) return;
  window.__ARCANA_CCO_PATIENT_LIST_VIRTUAL__ = true;

  const ROW_HEIGHT_PX = 56;
  const OVERSCAN = 6;
  const VIRTUAL_THRESHOLD = 80;

  function mountVirtualPatientList({
    container,
    items,
    renderRowHtml,
    selectedId = '',
    onVisibleRangeChange,
  } = {}) {
    if (!container || typeof renderRowHtml !== 'function') {
      return { destroy() {}, refresh() {} };
    }

    const list = Array.isArray(items) ? items : [];
    if (list.length < VIRTUAL_THRESHOLD) {
      container.innerHTML = list.map((item) => renderRowHtml(item, item.patientId === selectedId)).join('');
      return {
        destroy() {},
        refresh(nextItems) {
          mountVirtualPatientList({
            container,
            items: nextItems,
            renderRowHtml,
            selectedId,
            onVisibleRangeChange,
          });
        },
      };
    }

    const scrollParent =
      container.closest('[data-customer-list-scroll]') ||
      container.closest('.customers-list-panel') ||
      container.parentElement;

    let rafId = 0;
    let destroyed = false;

    function computeSlice() {
      const viewport = scrollParent || container;
      const scrollTop = viewport.scrollTop || 0;
      const viewportHeight = viewport.clientHeight || 600;
      const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_PX) - OVERSCAN);
      const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT_PX) + OVERSCAN * 2;
      const end = Math.min(list.length, start + visibleCount);
      return { start, end };
    }

    function paint() {
      if (destroyed) return;
      const { start, end } = computeSlice();
      const topSpacer = start * ROW_HEIGHT_PX;
      const bottomSpacer = Math.max(0, (list.length - end) * ROW_HEIGHT_PX);
      const slice = list.slice(start, end);
      container.innerHTML = `
        <div class="cco-virtual-spacer" style="height:${topSpacer}px" aria-hidden="true"></div>
        ${slice.map((item) => renderRowHtml(item, item.patientId === selectedId)).join('')}
        <div class="cco-virtual-spacer" style="height:${bottomSpacer}px" aria-hidden="true"></div>
      `;
      if (typeof onVisibleRangeChange === 'function') {
        onVisibleRangeChange({ start, end, total: list.length });
      }
    }

    function onScroll() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        paint();
      });
    }

    scrollParent?.addEventListener('scroll', onScroll, { passive: true });
    paint();

    return {
      destroy() {
        destroyed = true;
        scrollParent?.removeEventListener('scroll', onScroll);
        if (rafId) window.cancelAnimationFrame(rafId);
      },
      refresh(nextItems, nextSelectedId = selectedId) {
        destroy();
        mountVirtualPatientList({
          container,
          items: nextItems,
          renderRowHtml,
          selectedId: nextSelectedId,
          onVisibleRangeChange,
        });
      },
    };
  }

  window.ArcanaCcoPatientListVirtual = Object.freeze({
    ROW_HEIGHT_PX,
    VIRTUAL_THRESHOLD,
    mountVirtualPatientList,
  });
})();
