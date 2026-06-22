/**
 * V12 Customer Workspace — renderer (Block 0 · Journal-modul).
 *
 * Zon 2-djupvy. Rent `.v12-workspace__*`-namespace (canon §5), inga legacy-
 * override-klasser. Återanvänder BEFINTLIGA handlers: journal-raderna bär
 * `data-v9-section-link="journal"` och primäråtgärden `data-v9-quick="journal"`
 * — wire:as av cco-v9-customers-parity.js (bindDossierScroll). INGEN ny handler.
 *
 *   window.CcoV12Workspace.render(ctx) → HTML-sträng (Zon 2-innehåll)
 *   ctx: { journalEntries, ... }  (samma ctx som V11-railen får)
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Journal-modul — full djupvy (full nottext), till skillnad från railens snippet. */
  function renderJournalModule(journal) {
    var count = (journal && journal.count) || 0;
    var head =
      '<header class="v12-workspace__module-head">' +
      '<div class="v12-workspace__kicker" data-v12-kicker="amber">JOURNAL</div>' +
      '<span class="v12-workspace__count">' +
      esc(String(count)) +
      '</span>' +
      '<button type="button" class="v12-workspace__primary" data-v9-quick="journal">' +
      '+ Ny anteckning' +
      '</button>' +
      '</header>';

    if (!count) {
      return (
        '<section class="v12-workspace__module" data-v12-module="journal" aria-label="Journal">' +
        head +
        '<div class="v12-workspace__empty" role="status">' +
        '<div class="v12-workspace__empty-title">Inga journalanteckningar</div>' +
        '<div class="v12-workspace__empty-hint">Skapa den första via “Ny anteckning”.</div>' +
        '</div>' +
        '</section>'
      );
    }

    var rows = journal.items
      .map(function (it) {
        return (
          '<li class="v12-workspace__journal-item">' +
          '<button type="button" class="v12-workspace__journal-card" data-v9-section-link="journal" data-journal-state="' +
          esc(it.state) +
          '">' +
          '<span class="v12-workspace__journal-top">' +
          '<span class="v12-workspace__journal-title">' +
          esc(it.title) +
          '</span>' +
          '<span class="v12-workspace__journal-badge" data-state="' +
          esc(it.state) +
          '">' +
          esc(it.badge) +
          '</span>' +
          '</span>' +
          (it.body ? '<span class="v12-workspace__journal-body">' + esc(it.body) + '</span>' : '') +
          '<span class="v12-workspace__journal-meta">' +
          esc(it.author) +
          (it.date ? ' · ' + esc(it.date) : '') +
          (it.locked ? ' · 🔒' : '') +
          '</span>' +
          '</button>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<section class="v12-workspace__module" data-v12-module="journal" aria-label="Journal">' +
      head +
      '<ul class="v12-workspace__journal-list">' +
      rows +
      '</ul>' +
      '</section>'
    );
  }

  function render(ctx) {
    ctx = ctx || {};
    var journal = { items: [], count: 0 };
    try {
      if (
        global.CcoV12WorkspaceAdapters &&
        typeof global.CcoV12WorkspaceAdapters.buildJournalModule === 'function'
      ) {
        journal = global.CcoV12WorkspaceAdapters.buildJournalModule(ctx.journalEntries) || journal;
      }
    } catch (_error) {
      journal = { items: [], count: 0 };
    }

    return (
      '<div class="v12-workspace__inner" data-v12-workspace-inner="1">' +
      '<div class="v12-workspace__zone-label" aria-hidden="true">Zon 2 · Arbetsyta</div>' +
      renderJournalModule(journal) +
      '</div>'
    );
  }

  global.CcoV12Workspace = {
    render: render,
  };
})(typeof window !== 'undefined' ? window : global);
