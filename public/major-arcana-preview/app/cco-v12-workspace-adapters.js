/**
 * V12 Customer Workspace — adapters (Block 0 · Journal).
 *
 * Bygger arbetsyte-modeller från SAMMA råa input som V11-railen får
 * (journalEntries). Återanvänder V11-fältlogik konceptuellt men producerar en
 * RIKARE modell (full nottext, inte railens 140-teckens-snippet) — ny
 * data-contract motiverad per canon D5 (workspace behöver mer data än railen).
 *
 * Ren data in → ren modell ut. Ingen DOM, inga handlers.
 *   window.CcoV12WorkspaceAdapters.buildJournalModule(journalEntries) → { items, count }
 */
(function (global) {
  'use strict';

  function str(v) {
    return v == null ? '' : String(v);
  }

  function fullBody(entry) {
    // Prioritetsordning matchar V11 (summary/note/clinicalSummary) men UTAN trunkering.
    return (
      str(entry.clinicalSummary).trim() || str(entry.summary).trim() || str(entry.note).trim() || ''
    );
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_error) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function buildJournalModule(journalEntries) {
    var list = Array.isArray(journalEntries) ? journalEntries : [];
    var items = list.map(function (entry) {
      entry = entry || {};
      var signed = !!(entry.signedAt || entry.signedByName);
      var author = str(entry.authorName).trim() || str(entry.signedByName).trim() || 'Okänd';
      var when = entry.signedAt || entry.updatedAt || entry.createdAt || '';
      return {
        title: str(entry.title).trim() || str(entry.journalType).trim() || 'Journalanteckning',
        type: str(entry.journalType).trim(),
        body: fullBody(entry),
        author: author,
        date: fmtDateTime(when),
        state: signed ? 'signed' : 'draft',
        badge: signed ? 'Signerad' : 'Utkast',
        locked: !!entry.locked,
      };
    });
    return { items: items, count: items.length };
  }

  global.CcoV12WorkspaceAdapters = {
    buildJournalModule: buildJournalModule,
  };
})(typeof window !== 'undefined' ? window : global);
