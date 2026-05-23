/**
 * TP behandlingsjournal — mobil formulär enligt JOURNAL-DATAMODELL avsnitt 2.4.
 */
(() => {
  'use strict';

  const BEHANDLINGSOMRADEN = [
    'Vikar',
    'Krona',
    'Front',
    'Full skalp',
    'Skägg',
    'Ögonbryn',
    'Ärr',
    'Övrigt',
  ];

  const OBSERVATIONER = [
    'Tog längre tid att rita hårlinje',
    'Hela skalpen rakad',
    'Delar rakade',
    'Känslig för adrenalin',
    'Ökad blödningsbenägenhet',
    'Seg/svårarbetad hud',
    'Övrigt',
  ];

  const LAKEMEDEL = ['Dalacin', 'Betapred', 'Ibuprofen'];

  const MULTI_FIELD_KEYS = new Set();
  const TRISTATE_FIELD_KEYS = new Set();

  const SECTIONS = [
    {
      title: 'Ingrepp',
      fields: [
        { key: 'ingreppTypFaststalld', label: 'Ingreppstyp fastställd', type: 'tristate' },
        {
          key: 'metod',
          label: 'Metod',
          type: 'select',
          options: ['', 'DHI', 'FUE', 'Kombination'],
        },
        {
          key: 'behandlingsomraden',
          label: 'Behandlingsområden',
          type: 'checkboxes',
          options: BEHANDLINGSOMRADEN,
        },
        { key: 'ytterligareOmrade', label: 'Ytterligare område', type: 'text' },
      ],
    },
    {
      title: 'Pre-kontroll',
      fields: [
        { key: 'giltigLegitimationVisad', label: 'Giltig legitimation visad', type: 'tristate' },
        {
          key: 'informeradRisker',
          label: 'Informerad om risker och genomförande',
          type: 'tristate',
        },
        { key: 'fulltFrisk', label: 'Fullt frisk', type: 'tristate' },
        {
          key: 'alkoholNarkotika48h',
          label: 'Ingen alkohol/narkotika senaste 48 h',
          type: 'tristate',
        },
        { key: 'aktuellaLakemedel', label: 'Aktuella läkemedel kontrollerade', type: 'tristate' },
        { key: 'ytterligareHalsoinfo', label: 'Ytterligare relevant hälsoinfo', type: 'textarea' },
      ],
    },
    {
      title: 'Vitalparametrar',
      fields: [
        { key: 'blodtryckMmHg', label: 'Blodtryck (mmHg)', type: 'text' },
        { key: 'puls', label: 'Puls (slag/min)', type: 'text' },
        { key: 'vitalKlockslag', label: 'Klockslag för mätning', type: 'time' },
        { key: 'allmannaAnteckningar', label: 'Allmänna anteckningar', type: 'textarea' },
      ],
    },
    {
      title: 'Under och efter ingrepp',
      fields: [
        {
          key: 'allmantillstandEfter',
          label: 'Allmäntillstånd efter',
          type: 'select',
          options: ['', 'Normalt', 'Medtagen/Trött'],
        },
        {
          key: 'reaktionLokalbedovning1',
          label: 'Reaktion lokalbedövning 1',
          type: 'select',
          options: ['', 'Normalt', 'Känslig'],
        },
        {
          key: 'reaktionLokalbedovning2',
          label: 'Reaktion lokalbedövning 2',
          type: 'select',
          options: ['', 'Normalt', 'Känslig'],
        },
        {
          key: 'observationerUnderIngrepp',
          label: 'Observationer under ingreppet',
          type: 'checkboxes',
          options: OBSERVATIONER,
        },
        { key: 'ovrigaObservationer', label: 'Övriga observationer', type: 'textarea' },
      ],
    },
    {
      title: 'Läkemedel',
      fields: [
        {
          key: 'lakemedelUtlamnade',
          label: 'Utlämnade läkemedel',
          type: 'checkboxes',
          options: LAKEMEDEL,
        },
        {
          key: 'informeradLakemedelEftervard',
          label: 'Informerad om läkemedel och eftervård',
          type: 'tristate',
        },
      ],
    },
    {
      title: 'Grafts',
      fields: [
        { key: 'graftsSingel', label: 'Singel', type: 'text' },
        { key: 'graftsDubbel', label: 'Dubbel', type: 'text' },
        { key: 'graftsTrippel', label: 'Trippel', type: 'text' },
        { key: 'graftsKvadrupel', label: 'Kvadrupel', type: 'text' },
        { key: 'graftsTotalt', label: 'Totalt antal grafts', type: 'text' },
      ],
    },
    {
      title: 'Tidsstämplar',
      fields: [
        { key: 'tidPlanering', label: 'Planering (foto + inritning)', type: 'time' },
        { key: 'tidLokalbedovningDonator', label: 'Lokalbedövning donator', type: 'time' },
        { key: 'tidExtraktionDonator', label: 'Extraktion donator', type: 'time' },
        { key: 'tidLokalbedovningMottagare', label: 'Lokalbedövning mottagare', type: 'time' },
        { key: 'tidMottagarkanaler', label: 'Mottagarkanaler', type: 'time' },
        { key: 'tidImplantationStart', label: 'Implantation start', type: 'time' },
        { key: 'tidImplantationSlut', label: 'Implantation slut', type: 'time' },
        { key: 'tidPatientLamnar', label: 'Patienten lämnar rummet', type: 'time' },
      ],
    },
    {
      title: 'Bedövningsmängder (ml)',
      fields: [
        { key: 'bedovningCarbocainMl', label: 'Carbocain', type: 'text' },
        { key: 'bedovningMarcainMl', label: 'Marcain', type: 'text' },
        { key: 'bedovningAdrenalinMl', label: 'Adrenalin i NaCl', type: 'text' },
        { key: 'bedovningTribonatMl', label: 'Tribonat', type: 'text' },
        { key: 'slutanteckningar', label: 'Slutanteckningar', type: 'textarea' },
      ],
    },
  ];

  SECTIONS.forEach((section) => {
    section.fields.forEach((field) => {
      if (field.type === 'checkboxes') MULTI_FIELD_KEYS.add(field.key);
      if (field.type === 'tristate') TRISTATE_FIELD_KEYS.add(field.key);
    });
  });

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function tristateOptions(selected) {
    const current = selected === true ? 'true' : selected === false ? 'false' : '';
    return `
      <option value=""${current === '' ? ' selected' : ''}>—</option>
      <option value="true"${current === 'true' ? ' selected' : ''}>Ja</option>
      <option value="false"${current === 'false' ? ' selected' : ''}>Nej</option>
    `;
  }

  function renderField(field, fields = {}) {
    const key = field.key;
    const value = fields[key];
    const disabled = field.disabled ? ' disabled' : '';
    const id = `tp-field-${key}`;

    if (field.type === 'tristate') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-tp-field="${escapeHtml(key)}"${disabled}>
            ${tristateOptions(value)}
          </select>
        </label>
      `;
    }

    if (field.type === 'select') {
      const options = asArray(field.options)
        .map(
          (option) =>
            `<option value="${escapeHtml(option)}"${String(value || '') === option ? ' selected' : ''}>${escapeHtml(option || '—')}</option>`
        )
        .join('');
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-tp-field="${escapeHtml(key)}"${disabled}>
            ${options}
          </select>
        </label>
      `;
    }

    if (field.type === 'checkboxes') {
      const selected = new Set(asArray(value).map(String));
      return `
        <fieldset class="patient-master-tp-field patient-master-tp-checkboxes">
          <legend class="patient-master-muted">${escapeHtml(field.label)}</legend>
          ${asArray(field.options)
            .map(
              (option) => `
            <label class="patient-master-tp-checkbox">
              <input type="checkbox" name="${escapeHtml(key)}" value="${escapeHtml(option)}" data-tp-field="${escapeHtml(key)}" data-tp-multi="true"${selected.has(option) ? ' checked' : ''}${disabled} />
              <span>${escapeHtml(option)}</span>
            </label>`
            )
            .join('')}
        </fieldset>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <textarea id="${id}" name="${escapeHtml(key)}" data-tp-field="${escapeHtml(key)}" rows="3"${disabled}>${escapeHtml(value || '')}</textarea>
        </label>
      `;
    }

    return `
      <label class="patient-master-tp-field" for="${id}">
        <span class="patient-master-muted">${escapeHtml(field.label)}</span>
        <input id="${id}" type="${field.type === 'time' ? 'time' : 'text'}" name="${escapeHtml(key)}" data-tp-field="${escapeHtml(key)}" value="${escapeHtml(value || '')}"${disabled} />
      </label>
    `;
  }

  function render(entry, options = {}) {
    const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : {};
    const locked = Boolean(options.locked || entry?.locked);
    const entryId = String(entry?.entryId || '');
    const title = String(entry?.title || 'TP behandlingsjournal');
    const useMobileSteps = Boolean(options.mobileSteps && !locked);

    function renderSectionBody(section) {
      return section.fields.map((field) => renderField({ ...field, disabled: locked }, fields)).join('');
    }

    let sectionsHtml = '';
    if (useMobileSteps) {
      sectionsHtml = `
        <div class="cco-clinical-mobile-stepper" data-tp-stepper>
          <div class="cco-clinical-mobile-stepper-head">
            <p class="cco-clinical-mobile-stepper-progress" data-tp-step-progress aria-live="polite">
              Steg 1 av ${SECTIONS.length}
            </p>
            <p class="cco-clinical-mobile-stepper-title" data-tp-step-title>
              ${escapeHtml(SECTIONS[0]?.title || '')}
            </p>
          </div>
          <div class="cco-clinical-mobile-stepper-actions">
            <button type="button" class="customers-utility-button" data-tp-step-prev disabled>
              Föregående
            </button>
            <button type="button" class="customers-utility-button" data-tp-step-next>
              Nästa
            </button>
          </div>
        </div>
        ${SECTIONS.map(
          (section, index) => `
          <section
            class="patient-master-tp-section cco-clinical-step-panel"
            data-tp-step-panel="${index}"
            data-step-title="${escapeHtml(section.title)}"
            ${index === 0 ? '' : ' hidden'}
          >
            <div class="patient-master-tp-section-body">${renderSectionBody(section)}</div>
          </section>`
        ).join('')}
      `;
    } else {
      sectionsHtml = SECTIONS.map(
        (section) => `
        <details class="patient-master-tp-section" open>
          <summary>${escapeHtml(section.title)}</summary>
          <div class="patient-master-tp-section-body">${renderSectionBody(section)}</div>
        </details>`
      ).join('');
    }

    return `
      <article class="focus-customer-data-card patient-master-tp-card${locked ? ' is-locked' : ''}" data-tp-journal-form data-tp-entry-id="${escapeHtml(entryId)}">
        <header class="patient-master-tp-header">
          <div>
            <h4>${escapeHtml(title)}</h4>
            <p class="patient-master-muted">${locked ? 'Signerad och låst.' : 'Fyll i efter behandling — sparas på denna kund.'}</p>
          </div>
          ${
            locked
              ? chipHtml('Låst', 'violet')
              : `<button type="submit" class="customers-utility-button patient-master-tp-save">Spara journal</button>`
          }
        </header>
        ${sectionsHtml}
      </article>
    `;
  }

  function chipHtml(label, tone) {
    return `<span class="focus-customer-chip focus-customer-chip--${tone}">${escapeHtml(label)}</span>`;
  }

  function readForm(root) {
    if (!root) return {};
    const next = {};
    MULTI_FIELD_KEYS.forEach((key) => {
      next[key] = [];
    });
    root.querySelectorAll('[data-tp-field]').forEach((el) => {
      const key = el.dataset.tpField;
      if (!key) return;
      if (el.dataset.tpMulti === 'true') {
        if (el.checked) next[key].push(el.value);
        return;
      }
      if (el.tagName === 'SELECT') {
        const raw = String(el.value || '');
        if (TRISTATE_FIELD_KEYS.has(key)) {
          if (raw === 'true') next[key] = true;
          else if (raw === 'false') next[key] = false;
          else next[key] = null;
          return;
        }
        next[key] = raw;
        return;
      }
      next[key] = String(el.value || '').trim();
    });
    return next;
  }

  window.ArcanaJournalTpForm = Object.freeze({
    render,
    readForm,
    SECTIONS,
  });
})();
