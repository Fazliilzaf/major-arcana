/**
 * Hälsodeklaration + friskförsäkran — mobil formulär enligt JOURNAL-DATAMODELL 2.2–2.3.
 */
(() => {
  'use strict';

  const MULTI_KEYS = new Set();
  const TRISTATE_KEYS = new Set();

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

  function chipHtml(label, tone) {
    return `<span class="focus-customer-chip focus-customer-chip--${tone}">${escapeHtml(label)}</span>`;
  }

  function tristateOptions(selected) {
    const current = selected === true ? 'true' : selected === false ? 'false' : '';
    return `
      <option value=""${current === '' ? ' selected' : ''}>—</option>
      <option value="true"${current === 'true' ? ' selected' : ''}>Ja</option>
      <option value="false"${current === 'false' ? ' selected' : ''}>Nej</option>
    `;
  }

  function bloodPressureOptions(selected) {
    const opts = ['', 'Ja', 'Nej', 'Vet ej'];
    return opts
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}"${String(selected || '') === option ? ' selected' : ''}>${escapeHtml(option || '—')}</option>`
      )
      .join('');
  }

  function registerField(field) {
    if (field.type === 'checkboxes') MULTI_KEYS.add(field.key);
    if (field.type === 'tristate') TRISTATE_KEYS.add(field.key);
  }

  function renderField(field, fields = {}) {
    const key = field.key;
    const value = fields[key];
    const disabled = field.disabled ? ' disabled' : '';
    const id = `clinical-field-${key}`;

    if (field.type === 'tristate') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}"${disabled}>
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
          <select id="${id}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}"${disabled}>
            ${options}
          </select>
        </label>
      `;
    }

    if (field.type === 'bloodpressure') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <select id="${id}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}"${disabled}>
            ${bloodPressureOptions(value)}
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
              <input type="checkbox" name="${escapeHtml(key)}" value="${escapeHtml(option)}" data-clinical-field="${escapeHtml(key)}" data-clinical-multi="true"${selected.has(option) ? ' checked' : ''}${disabled} />
              <span>${escapeHtml(option)}</span>
            </label>`
            )
            .join('')}
        </fieldset>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="patient-master-tp-checkbox patient-master-tp-field">
          <input type="checkbox" id="${id}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}" data-clinical-bool="true"${value === true ? ' checked' : ''}${disabled} />
          <span>${escapeHtml(field.label)}</span>
        </label>
      `;
    }

    if (field.type === 'textarea') {
      return `
        <label class="patient-master-tp-field" for="${id}">
          <span class="patient-master-muted">${escapeHtml(field.label)}</span>
          <textarea id="${id}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}" rows="3"${disabled}>${escapeHtml(value || '')}</textarea>
        </label>
      `;
    }

    return `
      <label class="patient-master-tp-field" for="${id}">
        <span class="patient-master-muted">${escapeHtml(field.label)}</span>
        <input id="${id}" type="${field.type === 'date' ? 'date' : 'text'}" name="${escapeHtml(key)}" data-clinical-field="${escapeHtml(key)}" value="${escapeHtml(value || '')}"${disabled} />
      </label>
    `;
  }

  function renderForm(config, entry, options = {}) {
    const fields = entry?.fields && typeof entry.fields === 'object' ? entry.fields : {};
    const locked = Boolean(options.locked || entry?.locked);
    const entryId = String(entry?.entryId || '');
    const useMobileSteps = Boolean(options.mobileSteps && !locked);

    function renderSectionBody(section) {
      return section.fields.map((field) => renderField({ ...field, disabled: locked }, fields)).join('');
    }

    let sectionsHtml = '';
    if (useMobileSteps) {
      sectionsHtml = `
        <div class="cco-clinical-mobile-stepper" data-clinical-stepper>
          <div class="cco-clinical-mobile-stepper-head">
            <p class="cco-clinical-mobile-stepper-progress" data-clinical-step-progress aria-live="polite">
              Steg 1 av ${config.sections.length}
            </p>
            <p class="cco-clinical-mobile-stepper-title" data-clinical-step-title>
              ${escapeHtml(config.sections[0]?.title || '')}
            </p>
          </div>
          <div class="cco-clinical-mobile-stepper-actions">
            <button type="button" class="customers-utility-button" data-clinical-step-prev disabled>
              Föregående
            </button>
            <button type="button" class="customers-utility-button" data-clinical-step-next>
              Nästa
            </button>
          </div>
        </div>
        ${config.sections
          .map(
            (section, index) => `
          <section
            class="patient-master-tp-section cco-clinical-step-panel"
            data-clinical-step-panel="${index}"
            data-step-title="${escapeHtml(section.title)}"
            ${index === 0 ? '' : ' hidden'}
          >
            <div class="patient-master-tp-section-body">${renderSectionBody(section)}</div>
          </section>`
          )
          .join('')}
      `;
    } else {
      sectionsHtml = config.sections
        .map(
          (section) => `
        <details class="patient-master-tp-section" open>
          <summary>${escapeHtml(section.title)}</summary>
          <div class="patient-master-tp-section-body">${renderSectionBody(section)}</div>
        </details>`
        )
        .join('');
    }

    return `
      <article class="focus-customer-data-card patient-master-tp-card${locked ? ' is-locked' : ''}" data-clinical-journal-form data-clinical-entry-id="${escapeHtml(entryId)}" data-clinical-form-key="${escapeHtml(config.key)}">
        <header class="patient-master-tp-header">
          <div>
            <h4>${escapeHtml(entry?.title || config.title)}</h4>
            <p class="patient-master-muted">${locked ? 'Signerad och låst.' : config.subtitle}</p>
          </div>
          ${
            locked
              ? chipHtml('Låst', 'violet')
              : `<button type="submit" class="customers-utility-button patient-master-tp-save">Spara</button>`
          }
        </header>
        ${sectionsHtml}
      </article>
    `;
  }

  function readForm(root) {
    if (!root) return {};
    const next = {};
    MULTI_KEYS.forEach((key) => {
      next[key] = [];
    });
    root.querySelectorAll('[data-clinical-field]').forEach((el) => {
      const key = el.dataset.clinicalField;
      if (!key) return;
      if (el.dataset.clinicalMulti === 'true') {
        if (el.checked) next[key].push(el.value);
        return;
      }
      if (el.dataset.clinicalBool === 'true') {
        next[key] = el.checked;
        return;
      }
      if (el.tagName === 'SELECT') {
        const raw = String(el.value || '');
        if (TRISTATE_KEYS.has(key)) {
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

  const HEALTH_SECTIONS = [
    {
      title: 'Levnadsvanor och sjukdomar',
      fields: [
        { key: 'rokerNikotin', label: 'Röker/nikotin (cigaretter, snus, vape)', type: 'tristate' },
        { key: 'rokerNikotinText', label: 'Om ja — beskriv', type: 'text' },
        { key: 'hjartKarlsjukdom', label: 'Hjärt-/kärlsjukdom', type: 'tristate' },
        { key: 'hjartKarlsjukdomText', label: 'Om ja — vilken', type: 'text' },
        { key: 'hogtBlodtryck', label: 'Högt blodtryck', type: 'bloodpressure' },
        { key: 'blodsmitta', label: 'Blodsmitta/blodöverförbar sjukdom', type: 'tristate' },
        { key: 'blodsmittaText', label: 'Om ja — beskriv', type: 'text' },
        { key: 'ovrigaSjukdomar', label: 'Övriga sjukdomar', type: 'tristate' },
        { key: 'ovrigaSjukdomarText', label: 'Om ja — beskriv', type: 'text' },
      ],
    },
    {
      title: 'Läkemedel och riskfaktorer',
      fields: [
        { key: 'lakemedel', label: 'Tar läkemedel', type: 'tristate' },
        { key: 'lakemedelText', label: 'Namn, styrka, dos', type: 'textarea' },
        { key: 'allergiskLakemedel', label: 'Allergisk mot läkemedel', type: 'tristate' },
        { key: 'allergiskLakemedelText', label: 'Om ja — vilka', type: 'text' },
        { key: 'blodfortunnande', label: 'Blodförtunnande läkemedel', type: 'tristate' },
        {
          key: 'omega3Kosttillskott',
          label: 'Omega 3 / fiskolja / kosttillskott (blödning)',
          type: 'tristate',
        },
        { key: 'rullstolHjalpmedel', label: 'Rullstol / hjälpmedel', type: 'tristate' },
        { key: 'gravidAmmar', label: 'Gravid / ammar', type: 'tristate' },
        { key: 'ovrigtHalsa', label: 'Övrigt om hälsan', type: 'textarea' },
      ],
    },
    {
      title: 'Önskemål och samtycke',
      fields: [
        { key: 'sarskildaOnskemal', label: 'Särskilda önskemål (hår/hud/båda)', type: 'textarea' },
        { key: 'hurKontakt', label: 'Hur kom du i kontakt med oss', type: 'text' },
        { key: 'deklarationsDatum', label: 'Datum', type: 'date' },
        {
          key: 'samtyckeDatalagring',
          label: 'Samtycke till datalagring (patientdatalagen + GDPR)',
          type: 'checkbox',
        },
        { key: 'samtyckeMailutskick', label: 'Samtycke till mailutskick', type: 'checkbox' },
      ],
    },
  ];

  const FITNESS_CONDITIONS = [
    'Hepatit A/B/C',
    'HIV',
    'Blödningsrubbning',
    'Läkemedelsallergi',
    'Astma',
    'Epilepsi',
    'Hjärtbesvär',
    'Diabetes typ 1',
    'Diabetes typ 2',
    'Lever-/Njursjukdom',
    'Tidigare narkos-/lokalbedövningskomplikation',
    'Pågående infektion/feber',
    'Psykisk ohälsa',
  ];

  const FITNESS_SECTIONS = [
    {
      title: 'ID-kontroll',
      fields: [
        {
          key: 'idTyp',
          label: 'Legitimationstyp',
          type: 'select',
          options: ['', 'Pass', 'Körkort', 'Nationellt ID', 'Svenskt ID'],
        },
        { key: 'idNummer', label: 'ID-nummer', type: 'text' },
      ],
    },
    {
      title: 'Personuppgifter',
      fields: [
        { key: 'fornamn', label: 'Förnamn', type: 'text' },
        { key: 'efternamn', label: 'Efternamn', type: 'text' },
        { key: 'personnummer', label: 'Personnummer', type: 'text' },
        { key: 'adress', label: 'Adress', type: 'text' },
      ],
    },
    {
      title: 'Hälsotillstånd (kryssa tillstånd patienten HAR)',
      fields: [
        { key: 'intygarFulltFrisk', label: 'Intygar i övrigt fullt frisk', type: 'tristate' },
        {
          key: 'halsotillstand',
          label: 'Kända tillstånd',
          type: 'checkboxes',
          options: FITNESS_CONDITIONS,
        },
        { key: 'annanSjukdomText', label: 'Annan sjukdom', type: 'text' },
      ],
    },
    {
      title: 'Medicinering och allergier',
      fields: [
        { key: 'ingenMedicinering', label: 'Ingen medicinering', type: 'tristate' },
        {
          key: 'medicineringText',
          label: 'Medicinering (namn, dosering, orsak)',
          type: 'textarea',
        },
        { key: 'blodfortunnandeSpec', label: 'Blodförtunnande (Warfarin/NOAK/ASA)', type: 'text' },
        { key: 'allergierInga', label: 'Inga kända allergier', type: 'tristate' },
        { key: 'allergierLakemedel', label: 'Läkemedelsallergi', type: 'text' },
        { key: 'allergierOvriga', label: 'Övriga allergier (latex, födoämnen)', type: 'text' },
      ],
    },
    {
      title: 'Alkohol, nikotin och samtycke',
      fields: [
        {
          key: 'alkoholNarkotika48h',
          label: 'Ej alkohol/narkotika 48 h före och efter',
          type: 'tristate',
        },
        { key: 'rokerNikotin', label: 'Röker/nikotin', type: 'tristate' },
        { key: 'anvanderEjNikotin', label: 'Använder ej nikotin', type: 'tristate' },
        {
          key: 'samtyckeInformerat',
          label: 'Informerat samtycke (tagit del av info, ställt frågor)',
          type: 'tristate',
        },
        { key: 'samtyckeDatalagring', label: 'Samtycke till datalagring', type: 'tristate' },
      ],
    },
    {
      title: 'Signering',
      fields: [
        { key: 'patientSignerNamn', label: 'Patient — namnförtydligande', type: 'text' },
        { key: 'patientSignerDatum', label: 'Patient — datum', type: 'date' },
        { key: 'staffSignerNamn', label: 'Personal — namnförtydligande', type: 'text' },
        { key: 'staffSignerDatum', label: 'Personal — datum', type: 'date' },
      ],
    },
  ];

  [...HEALTH_SECTIONS, ...FITNESS_SECTIONS].forEach((section) => {
    section.fields.forEach(registerField);
  });

  function defaultHealthFields(patient = {}) {
    return {
      deklarationsDatum: new Date().toISOString().slice(0, 10),
      hurKontakt: '',
      samtyckeDatalagring: false,
      samtyckeMailutskick: false,
      personnummer: patient.personnummer || '',
    };
  }

  function defaultFitnessFields(patient = {}) {
    const name = String(patient.displayName || '').trim();
    const parts = name.split(/\s+/);
    return {
      fornamn: parts[0] || '',
      efternamn: parts.slice(1).join(' ') || '',
      personnummer: patient.personnummer || '',
      adress: '',
      patientSignerDatum: new Date().toISOString().slice(0, 10),
      staffSignerDatum: new Date().toISOString().slice(0, 10),
    };
  }

  window.ArcanaJournalClinicalForms = Object.freeze({
    health: Object.freeze({
      key: 'health',
      journalType: 'health_declaration',
      title: 'Hälsodeklaration',
      subtitle: 'Fylls i vid konsultation — sparas på kundkortet.',
      sections: HEALTH_SECTIONS,
      render: (entry, options) =>
        renderForm(
          {
            key: 'health',
            title: 'Hälsodeklaration',
            subtitle: 'Fylls i vid konsultation — sparas på kundkortet.',
            sections: HEALTH_SECTIONS,
          },
          entry,
          options
        ),
      readForm,
      defaultFields: defaultHealthFields,
    }),
    fitness: Object.freeze({
      key: 'fitness',
      journalType: 'fitness_certificate',
      title: 'Friskförsäkran',
      subtitle: 'Patient intygar + personal bekräftar inför ingrepp.',
      sections: FITNESS_SECTIONS,
      render: (entry, options) =>
        renderForm(
          {
            key: 'fitness',
            title: 'Friskförsäkran',
            subtitle: 'Patient intygar + personal bekräftar inför ingrepp.',
            sections: FITNESS_SECTIONS,
          },
          entry,
          options
        ),
      readForm,
      defaultFields: defaultFitnessFields,
    }),
  });
})();
