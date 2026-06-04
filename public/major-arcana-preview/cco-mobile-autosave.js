'use strict';

(function initCcoMobileAutosave() {
  const MQ = '(max-width: 1023px)';
  const DEBOUNCE_MS = 2000;
  const PERIODIC_MS = 30000;
  const STORAGE_PREFIX = 'cco-journal-draft:';

  const STEP_PANEL_SELECTOR =
    '[data-clinical-step-panel], [data-tp-step-panel], [data-prp-step-panel], [data-follow-step-panel], [data-bleph-step-panel], [data-agreement-step-panel]';
  const STEP_PROGRESS_SELECTOR =
    '[data-clinical-step-progress], [data-tp-step-progress], [data-prp-step-progress], [data-follow-step-progress], [data-bleph-step-progress], [data-agreement-step-progress]';
  const STEP_TITLE_SELECTOR =
    '[data-clinical-step-title], [data-tp-step-title], [data-prp-step-title], [data-follow-step-title], [data-bleph-step-title], [data-agreement-step-title]';
  const STEP_PREV_SELECTOR =
    '[data-clinical-step-prev], [data-tp-step-prev], [data-prp-step-prev], [data-follow-step-prev], [data-bleph-step-prev], [data-agreement-step-prev]';
  const STEP_NEXT_SELECTOR =
    '[data-clinical-step-next], [data-tp-step-next], [data-prp-step-next], [data-follow-step-next], [data-bleph-step-next], [data-agreement-step-next]';
  const JOURNAL_FORM_SELECTOR =
    '[data-clinical-journal-save-form], [data-tp-journal-save-form], [data-prp-journal-save-form], [data-follow-journal-save-form], [data-bleph-journal-save-form], [data-agreement-mobile-shell]';
  const FIELD_SELECTOR =
    '[data-clinical-field], [data-tp-field], [data-prp-field], [data-follow-field], [data-bleph-field]';

  const bindings = new WeakMap();

  function isCompactFormViewport() {
    try {
      return window.matchMedia(MQ).matches;
    } catch {
      return false;
    }
  }

  function storageKey(patientId, entryId, formKey) {
    return `${STORAGE_PREFIX}${normalizeText(patientId)}:${normalizeText(entryId)}:${normalizeText(formKey)}`;
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function formatTime(date) {
    try {
      return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function readDraft(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeDraft(key, fields) {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          fields,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {
      /* quota or private mode */
    }
  }

  function clearDraft(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function ensureIndicator(host) {
    let indicator = host.querySelector('[data-mobile-autosave-indicator]');
    if (indicator) return indicator;
    indicator = document.createElement('p');
    indicator.className = 'cco-mobile-autosave-indicator patient-master-muted';
    indicator.dataset.mobileAutosaveIndicator = '1';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    const header = host.querySelector('.patient-master-tp-header, .patient-master-journal-intro');
    if (header) {
      header.appendChild(indicator);
    } else {
      host.prepend(indicator);
    }
    return indicator;
  }

  function setIndicator(state, host, detail) {
    const indicator = ensureIndicator(host);
    if (!indicator) return;
    if (state === 'idle') {
      indicator.hidden = true;
      indicator.textContent = '';
      return;
    }
    indicator.hidden = false;
    if (state === 'saving') {
      indicator.textContent = 'Sparar…';
      indicator.dataset.tone = 'loading';
      return;
    }
    if (state === 'local') {
      indicator.textContent = navigator.onLine === false
        ? 'Offline — utkast sparat lokalt'
        : `Utkast sparat lokalt · ${detail || ''}`;
      indicator.dataset.tone = 'local';
      return;
    }
    if (state === 'restored') {
      indicator.textContent = 'Utkast återställt från telefonen';
      indicator.dataset.tone = 'info';
      return;
    }
    if (state === 'saved') {
      indicator.textContent = `Sparat · ${detail || formatTime(new Date())}`;
      indicator.dataset.tone = 'success';
      return;
    }
    if (state === 'error') {
      indicator.textContent = detail || 'Kunde inte spara — försök igen';
      indicator.dataset.tone = 'error';
    }
  }

  function readFieldKey(el) {
    return (
      el.dataset.clinicalField ||
      el.dataset.tpField ||
      el.dataset.prpField ||
      el.dataset.followField ||
      el.dataset.blephField ||
      ''
    );
  }

  function isMultiField(el) {
    return (
      el.dataset.clinicalMulti === 'true' ||
      el.dataset.tpMulti === 'true' ||
      el.dataset.prpMulti === 'true' ||
      el.dataset.followMulti === 'true' ||
      el.dataset.blephMulti === 'true'
    );
  }

  function applyFields(root, fields) {
    if (!root || !fields || typeof fields !== 'object') return;
    root.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
      const key = readFieldKey(el);
      if (!key || !(key in fields)) return;
      const value = fields[key];
      if (isMultiField(el)) {
        el.checked = Array.isArray(value) && value.includes(el.value);
        return;
      }
      if (el.dataset.clinicalBool === 'true') {
        el.checked = value === true;
        return;
      }
      if (el.tagName === 'SELECT') {
        if (value === true) el.value = 'true';
        else if (value === false) el.value = 'false';
        else if (value === null || value === undefined) el.value = '';
        else el.value = String(value);
        return;
      }
      if (el.type === 'checkbox') {
        el.checked = Boolean(value);
        return;
      }
      el.value = value == null ? '' : String(value);
    });
  }

  function resolveEntryRoot(form) {
    return (
      form.querySelector('[data-clinical-journal-form]') ||
      form.querySelector('[data-tp-journal-form]') ||
      form.querySelector('[data-prp-journal-form]') ||
      form.querySelector('[data-follow-journal-form]') ||
      form.querySelector('[data-bleph-journal-form]') ||
      form
    );
  }

  function bindForm(form, options = {}) {
    if (!form || !isCompactFormViewport()) return;
    if (bindings.has(form)) return;

    const readFields = options.readFields;
    const onSync = options.onSync;
    const patientId = options.patientId;
    const entryId = options.entryId;
    const formKey = options.formKey;
    const entryRoot = resolveEntryRoot(form);
    const key = storageKey(patientId, entryId, formKey);
    if (!readFields || !key || !patientId || !entryId) return;

    const state = {
      dirty: false,
      syncing: false,
      timer: null,
      periodic: null,
      lastSavedAt: '',
    };

    const draft = readDraft(key);
    if (draft?.fields && entryRoot) {
      applyFields(entryRoot, draft.fields);
      setIndicator('restored', entryRoot, formatTime(new Date(draft.savedAt || Date.now())));
      state.dirty = true;
    }

    function scheduleLocalSave() {
      state.dirty = true;
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => {
        const fields = readFields(entryRoot);
        writeDraft(key, fields);
        setIndicator('local', entryRoot, formatTime(new Date()));
      }, DEBOUNCE_MS);
    }

    async function syncToServer({ silent = true } = {}) {
      if (!onSync || state.syncing || !state.dirty) return false;
      if (navigator.onLine === false) {
        setIndicator('local', entryRoot);
        return false;
      }
      state.syncing = true;
      setIndicator('saving', entryRoot);
      try {
        const fields = readFields(entryRoot);
        await onSync(fields);
        state.dirty = false;
        state.lastSavedAt = new Date().toISOString();
        clearDraft(key);
        setIndicator('saved', entryRoot, formatTime(new Date()));
        return true;
      } catch (error) {
        if (!silent) throw error;
        setIndicator('error', entryRoot, error?.message || 'Kunde inte spara');
        return false;
      } finally {
        state.syncing = false;
      }
    }

    form.addEventListener('input', scheduleLocalSave);
    form.addEventListener('change', scheduleLocalSave);

    state.periodic = window.setInterval(() => {
      void syncToServer({ silent: true });
    }, PERIODIC_MS);

    window.addEventListener('online', () => {
      if (state.dirty) void syncToServer({ silent: true });
    });

    bindings.set(form, {
      destroy() {
        window.clearTimeout(state.timer);
        window.clearInterval(state.periodic);
        bindings.delete(form);
      },
      clearDraft() {
        clearDraft(key);
        state.dirty = false;
        setIndicator('idle', entryRoot);
      },
      markSaved() {
        clearDraft(key);
        state.dirty = false;
        setIndicator('saved', entryRoot, formatTime(new Date()));
      },
      flushLocal() {
        window.clearTimeout(state.timer);
        const fields = readFields(entryRoot);
        writeDraft(key, fields);
        setIndicator('local', entryRoot, formatTime(new Date()));
      },
    });
  }

  function initMobileStepper(form) {
    if (!form || !isCompactFormViewport()) return;
    const panels = Array.from(form.querySelectorAll(STEP_PANEL_SELECTOR));
    if (panels.length <= 1) return;

    let step = Number(form.dataset.journalActiveStep || 0);
    const progressEl = form.querySelector(STEP_PROGRESS_SELECTOR);
    const titleEl = form.querySelector(STEP_TITLE_SELECTOR);
    const prevBtn = form.querySelector(STEP_PREV_SELECTOR);
    const nextBtn = form.querySelector(STEP_NEXT_SELECTOR);
    const saveBtn = form.querySelector('.patient-master-tp-save, [type="submit"]');

    function renderStep() {
      step = Math.max(0, Math.min(step, panels.length - 1));
      form.dataset.journalActiveStep = String(step);
      panels.forEach((panel, index) => {
        panel.hidden = index !== step;
      });
      if (progressEl) progressEl.textContent = `Steg ${step + 1} av ${panels.length}`;
      if (titleEl) titleEl.textContent = panels[step]?.dataset.stepTitle || '';
      if (prevBtn) prevBtn.disabled = step === 0;
      if (nextBtn) nextBtn.hidden = step >= panels.length - 1;
      if (saveBtn) saveBtn.hidden = step < panels.length - 1;
    }

    prevBtn?.addEventListener('click', () => {
      step -= 1;
      renderStep();
    });
    nextBtn?.addEventListener('click', () => {
      step += 1;
      renderStep();
      panels[step]?.querySelector('input, select, textarea, button, a')?.focus?.();
    });

    renderStep();
  }

  function scanForms() {
    if (!isCompactFormViewport()) return;
    document.querySelectorAll(JOURNAL_FORM_SELECTOR).forEach((form) => {
      initMobileStepper(form);
    });
  }

  window.addEventListener('DOMContentLoaded', scanForms);
  const observer = new MutationObserver(() => window.requestAnimationFrame(scanForms));
  observer.observe(document.body, { childList: true, subtree: true });

  window.ArcanaMobileAutosave = Object.freeze({
    bindForm,
    initMobileStepper,
    markFormSaved(form) {
      bindings.get(form)?.markSaved?.();
    },
    clearDraftKey: clearDraft,
    storageKey,
  });
})();
