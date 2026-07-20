/**
 * Content-only contract for Major Arcana views mounted inside /admin#cco.
 *
 * The full Major Arcana document contains several workspaces. Admin owns the
 * global shell, so an explicit admin embed route must expose only the requested
 * content surface even while the main application bundle is still booting.
 */
(function initCcoAdminEmbedContract(global) {
  'use strict';

  var params;
  try {
    params = new URLSearchParams(global.location.search || '');
  } catch (_error) {
    params = null;
  }

  var isAdminEmbed = params && params.get('embed') === 'admin';
  var requestedView = params ? String(params.get('view') || '').trim().toLowerCase() : '';
  var lockedView =
    isAdminEmbed && (requestedView === 'customers' || requestedView === 'conversations')
      ? requestedView
      : '';
  if (!lockedView) return;

  document.documentElement.setAttribute('data-admin-embed-view', lockedView);
  global.__ARCANA_ADMIN_EMBED_VIEW__ = lockedView;
  if (lockedView === 'customers') {
    document.documentElement.setAttribute('data-customer-product-contract', 'full');
    document.documentElement.setAttribute('data-v9-enabled', 'on');
    document.documentElement.setAttribute('data-v9-demo', 'off');
    document.documentElement.setAttribute('data-v11-rail', 'on');
    document.documentElement.setAttribute('data-v12-workspace', 'on');
    global.__ARCANA_V9_ENABLED__ = true;
    global.__ARCANA_V11_RAIL_ENABLED__ = true;
    global.__ARCANA_V12_WORKSPACE_ENABLED__ = true;
  }

  function setHidden(node, hidden) {
    if (!node) return;
    node.hidden = hidden;
    node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }

  function enforce() {
    var canvas = document.querySelector('.preview-canvas');
    if (canvas) {
      canvas.setAttribute('data-app-shell-view', lockedView);
      canvas.setAttribute('data-app-view', lockedView);
    }

    var sections = document.querySelectorAll('[data-shell-view]');
    for (var index = 0; index < sections.length; index += 1) {
      setHidden(sections[index], sections[index].getAttribute('data-shell-view') !== lockedView);
    }

    if (lockedView === 'customers') {
      var legacyConversationNodes = document.querySelectorAll(
        '.preview-shell, .focus-shell, [data-resize-handle], ' +
          '#note-mode-shell, #truth-worklist-shell, #studio-shell, #note-shell, ' +
          '#focus-context-shell, #booking-shell, #schedule-shell, #later-shell'
      );
      for (var nodeIndex = 0; nodeIndex < legacyConversationNodes.length; nodeIndex += 1) {
        setHidden(legacyConversationNodes[nodeIndex], true);
      }
    }

    if (document.body) document.body.classList.add('is-admin-embed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforce, { once: true });
  } else {
    enforce();
  }

  global.CcoAdminEmbedContract = Object.freeze({
    view: lockedView,
    enforce: enforce,
  });
})(typeof window !== 'undefined' ? window : globalThis);
