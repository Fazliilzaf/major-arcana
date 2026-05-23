'use strict';

(function initCcoMobileAutosave() {
  const MQ = '(max-width: 768px)';
  const DEBOUNCE_MS = 2000;
  const PERIODIC_MS = 30000;
  const STORAGE_PREFIX = 'cco-journal-draft:';

  const bindings = new WeakMap();

  function isMobile() {
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

  function applyFields(root, fields, fieldSelector, multiAttr) {
    if (!root || !fields || typeof fields !== 'object') return;
    root.querySelectorAll(fieldSelector).forEach((el) => {
      const key = el.dataset.clinicalField || el.dataset.tpField;
      if (!key || !(key in fields)) return;
      const value = fields[key];
      if (el.dataset.clinicalMulti === 'true' || el.dataset.tpMulti === 'true') {
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

  function bindForm(form, options = {}) {
    if (!form || !isMobile()) return;
    if (bindings.has(form)) return;

    const readFields = options.readFields;
    const onSync = options.onSync;
    const patientId = options.patientId;
    const entryId = options.entryId;
    const formKey = options.formKey;
    const entryRoot =
      form.querySelector('[data-clinical-journal-form]') ||
      form.querySelector('[data-tp-journal-form]') ||
      form;
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
      applyFields(
        entryRoot,
        draft.fields,
        '[data-clinical-field], [data-tp-field]',
        true
      );
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
    if (!form || !isMobile()) return;
    const panels = Array.from(form.querySelectorAll('[data-clinical-step-panel], [data-tp-step-panel]'));
    if (panels.length <= 1) return;

    let step = Number(form.dataset.clinicalActiveStep || form.dataset.tpActiveStep || 0);
    const progressEl = form.querySelector('[data-clinical-step-progress], [data-tp-step-progress]');
    const titleEl = form.querySelector('[data-clinical-step-title], [data-tp-step-title]');
    const prevBtn = form.querySelector('[data-clinical-step-prev], [data-tp-step-prev]');
    const nextBtn = form.querySelector('[data-clinical-step-next], [data-tp-step-next]');
    const saveBtn = form.querySelector('.patient-master-tp-save, [type="submit"]');

    function renderStep() {
      step = Math.max(0, Math.min(step, panels.length - 1));
      form.dataset.clinicalActiveStep = String(step);
      form.dataset.tpActiveStep = String(step);
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
      panels[step]?.querySelector('input, select, textarea')?.focus?.();
    });

    renderStep();
  }

  function scanForms() {
    if (!isMobile()) return;
    document
      .querySelectorAll('[data-clinical-journal-save-form], [data-tp-journal-save-form]')
      .forEach((form) => {
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
