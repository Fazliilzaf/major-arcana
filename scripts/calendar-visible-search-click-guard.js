'use strict';

/**
 * Test-only/browser-smoke guard for CCO Kalender global search clicks.
 *
 * This module intentionally contains no production wiring. It is meant to be
 * used by local/prod read-only smoke checks before clicking a global search
 * result in the embedded /kalender.html path.
 */

function fail(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  throw error;
}

function readComputedStyle(doc, element) {
  const view = doc?.defaultView || element?.ownerDocument?.defaultView || globalThis;
  return typeof view?.getComputedStyle === 'function'
    ? view.getComputedStyle(element)
    : { pointerEvents: element?.style?.pointerEvents || '' };
}

function centerOf(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    fail('search_result_missing_rect');
  }
  const rect = element.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    fail('search_result_not_clickable', {
      width: Number(rect?.width) || 0,
      height: Number(rect?.height) || 0,
    });
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  };
}

function assertVisibleSearchResultClickTarget({
  document,
  overlaySelector = '#searchOverlay',
  result,
  point,
} = {}) {
  const doc = document || result?.ownerDocument || globalThis.document;
  if (!doc) fail('document_missing');

  const overlay = doc.querySelector(overlaySelector);
  if (!overlay) fail('search_overlay_missing', { overlaySelector });
  if (!overlay.classList?.contains('is-visible')) {
    fail('search_overlay_not_visible', { className: overlay.className || '' });
  }

  const overlayStyle = readComputedStyle(doc, overlay);
  if (overlayStyle.pointerEvents !== 'auto') {
    fail('search_overlay_pointer_events_blocked', {
      pointerEvents: overlayStyle.pointerEvents || '',
    });
  }

  const searchResult = result?.closest?.('.search-result');
  if (!searchResult) fail('search_result_missing');

  const clickPoint = point || centerOf(searchResult);
  if (typeof doc.elementFromPoint !== 'function') fail('element_from_point_unavailable');
  const hit = doc.elementFromPoint(clickPoint.x, clickPoint.y);
  const hitResult = hit?.closest?.('.search-result') || null;
  if (hitResult !== searchResult) {
    fail('search_result_hit_target_mismatch', {
      expectedClassName: searchResult.className || '',
      hitTagName: hit?.tagName || null,
      hitClassName: hit?.className || '',
      hitText: hit?.textContent ? String(hit.textContent).trim().slice(0, 120) : null,
    });
  }

  return {
    ok: true,
    clickPoint: { x: clickPoint.x, y: clickPoint.y },
    patientId: searchResult.dataset?.patientId || null,
    bookingId: searchResult.dataset?.bookingId || null,
    readOnly: searchResult.dataset?.readOnly || null,
  };
}

module.exports = {
  assertVisibleSearchResultClickTarget,
};
