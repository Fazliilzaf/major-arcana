/**
 * PRP behandlingsjournal — JOURNAL-DATAMODELL avsnitt 2.5.
 */
(() => {
  'use strict';

  const OMRADEN = [
    'Hår',
    'Hud ansikte/hals/dekolletage/händer',
    'Skägg',
    'Annat',
  ];
  const TEKNIK = ['', 'Injektion', 'Microneedling + PRP', 'Dermapen'];

  const FIELDS = [
    { key: 'behandlingsdatum', label: 'Datum', type: 'date' },
    {
      key: 'omrade',
      label: 'Område',
      type: 'select',
      options: ['', ...OMRADEN],
    },
    { key: 'serieNummer', label: 'Behandling i serien (nr)', type: 'text' },
    { key: 'serieTotalt', label: 'Totalt i serie', type: 'text' },
    { key: 'antalBlodror', label: 'Antal blodrör', type: 'text' },
    { key: 'mangdPrpMl', label: 'Mängd PRP (ml)', type: 'text' },
    { key: 'teknik', label: 'Teknik', type: 'select', options: TEKNIK },
    { key: 'bedovning', label: 'Bedövning', type: 'tristate' },
    { key: 'bedovningTyp', label: 'Bedövningstyp', type: 'text' },
    { key: 'blodtryckMmHg', label: 'Blodtryck (mmHg)', type: 'text' },
    { key: 'puls', label: 'Puls', type: 'text' },
    { key: 'lakemedel', label: 'Läkemedel', type: 'textarea' },
    { key: 'komplikationer', label: 'Komplikationer / anmärkningar', type: 'textarea' },
    { key: 'eftervardsrad', label: 'Eftervårdsråd givna', type: 'textarea' },
    { key: 'behandlare', label: 'Behandlare', type: 'text' },
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tristateOptions(selected) {
    const current = selected === true ? 'true' : selected === false ? 'false' : '';
    return `
      <option value=""${current === '' ? ' selected' : ''}>—</option>
      <option value="true"${current === 'true' ? ' selected' : ''}>Ja</option>
      <option value="false"${current === 'false' ? ' selected' : ''}>Nej</option>
    `;
  }

  function renderField(field, fields, locked) {
    const key = field.key;
    const id = `prp-${key}`;
    const disabled = locked ? ' disabled' : '';
    const value = fields[key];

    if (field.type === 'tristate') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-prp-field="${escapeHtml(key)}"${disabled}>
            ${tristateOptions(value)}
          </select>
        </label>`;
    }
    if (field.type === 'select') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-prp-field="${escapeHtml(key)}"${disabled}>
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
          <textarea id="${id}" name="${escapeHtml(key)}" data-prp-field="${escapeHtml(key)}" rows="3"${disabled}>${escapeHtml(value || '')}</textarea>
        </label>`;
    }
    const inputType = field.type === 'date' ? 'date' : 'text';
    return `
      <label class="patient-master-tp-field" for="${id}">
        <span class="patient-master-muted">${escapeHtml(field.label)}</span>
        <input id="${id}" type="${inputType}" name="${escapeHtml(key)}" data-prp-field="${escapeHtml(key)}" value="${escapeHtml(value || '')}"${disabled} />
      </label>`;
  }

  function render(entry, options = {}) {
    const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : {};
    const locked = Boolean(options.locked || entry?.locked);
    const title = String(entry?.title || 'PRP behandlingsjournal');
    return `
      <article class="focus-customer-data-card patient-master-tp-card${locked ? ' is-locked' : ''}" data-prp-journal-form data-prp-entry-id="${escapeHtml(entry.entryId || '')}">
        <header class="patient-master-tp-header">
          <div>
            <h4>${escapeHtml(title)}</h4>
            <p class="patient-master-muted">${locked ? 'Signerad och låst.' : 'Dokumentera PRP-behandlingen.'}</p>
          </div>
        </header>
        <div class="patient-master-tp-section-body">
          ${FIELDS.map((field) => renderField(field, fields, locked)).join('')}
        </div>
      </article>
    `;
  }

  function readForm(root) {
    if (!root) return {};
    const next = {};
    root.querySelectorAll('[data-prp-field]').forEach((el) => {
      const key = el.dataset.prpField;
      if (!key) return;
      if (el.tagName === 'SELECT' && ['bedovning'].includes(key)) {
        const raw = String(el.value || '');
        if (raw === 'true') next[key] = true;
        else if (raw === 'false') next[key] = false;
        else next[key] = null;
        return;
      }
      next[key] = String(el.value || '').trim();
    });
    if (!next.behandlingsdatum) {
      next.behandlingsdatum = new Date().toISOString().slice(0, 10);
    }
    return next;
  }

  window.ArcanaJournalPrpForm = Object.freeze({ render, readForm, FIELDS });
})();
