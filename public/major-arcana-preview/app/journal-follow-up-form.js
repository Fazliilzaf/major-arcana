/**
 * Uppföljningsjournal — JOURNAL-DATAMODELL avsnitt 2.6 (månad 4/8/12).
 */
(() => {
  'use strict';

  const TILLFALLEN = ['', 'Månad 4', 'Månad 8', 'Månad 12', 'Annat'];

  const FIELDS = [
    { key: 'uppfoljningsdatum', label: 'Datum', type: 'date' },
    { key: 'tillfalle', label: 'Tillfälle', type: 'select', options: TILLFALLEN },
    { key: 'bedomning', label: 'Bedömning (läkning, tillväxt, täthet, hårfäste)', type: 'textarea' },
    { key: 'bilderNotering', label: 'Bilder', type: 'textarea' },
    { key: 'atgardPlan', label: 'Åtgärd / plan', type: 'textarea' },
    { key: 'behandlare', label: 'Behandlare', type: 'text' },
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderField(field, fields, locked) {
    const key = field.key;
    const id = `follow-${key}`;
    const disabled = locked ? ' disabled' : '';
    const value = fields[key];
    if (field.type === 'select') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" data-follow-field="${escapeHtml(key)}"${disabled}>
            ${field.options
              .map(
                (option) =>
                  `<option value="${escapeHtml(option)}"${String(value || '') === option ? ' selected' : ''}>${escapeHtml(option || '—')}</option>`
              )
              .join('')}
          </select>
        </label>`;
    }
    if (field.type === 'textarea') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <textarea id="${id}" data-follow-field="${escapeHtml(key)}" rows="3"${disabled}>${escapeHtml(value || '')}</textarea>
        </label>`;
    }
    return `
      <label class="patient-master-tp-field" for="${id}">
        <span class="patient-master-muted">${escapeHtml(field.label)}</span>
        <input id="${id}" type="date" data-follow-field="${escapeHtml(key)}" value="${escapeHtml(value || '')}"${disabled} />
      </label>`;
  }

  function render(entry, options = {}) {
    const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : {};
    const locked = Boolean(options.locked || entry?.locked);
    return `
      <article class="focus-customer-data-card patient-master-tp-card${locked ? ' is-locked' : ''}" data-follow-journal-form data-follow-entry-id="${escapeHtml(entry.entryId || '')}">
        <header class="patient-master-tp-header">
          <div>
            <h4>${escapeHtml(entry.title || 'Uppföljning')}</h4>
            <p class="patient-master-muted">${locked ? 'Signerad och låst.' : 'Dokumentera uppföljning efter behandling.'}</p>
          </div>
        </header>
        <div class="patient-master-tp-section-body">
          ${FIELDS.map((field) => renderField(field, fields, locked)).join('')}
        </div>
      </article>
    `;
  }

  function readForm(root) {
    const next = {};
    if (!root) return next;
    root.querySelectorAll('[data-follow-field]').forEach((el) => {
      const key = el.dataset.followField;
      if (key) next[key] = String(el.value || '').trim();
    });
    if (!next.uppfoljningsdatum) {
      next.uppfoljningsdatum = new Date().toISOString().slice(0, 10);
    }
    return next;
  }

  window.ArcanaJournalFollowUpForm = Object.freeze({ render, readForm, FIELDS });
})();
