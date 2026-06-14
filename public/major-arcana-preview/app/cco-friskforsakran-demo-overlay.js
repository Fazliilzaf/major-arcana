/**
 * Steg 8 — Friskförsäkran demo-overlay (operationsdagen).
 *
 * Content registry (Meridiq facit — owner bekräftat 2026-06-14):
 *   source: migration/meridiq/questionary-catalog.json — apiId 16413 (fitness_certificate | TP)
 *   source: new — demo modal chrome, validation copy, demo sign
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-ff-demo-scrim';
  const STYLE_ID = 'cco-ff-demo-styles';
  const DISMISS_KEY = 'arcana.ffdemo.dismissed';
  const MERIDIQ_FORM_ID = 16413;
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-step789-kundkort-v4';

  let meridiqContent = null;

  const STEP8_EXTRA_CSS = `
#${ROOT_ID} .mq-field{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(215,202,194,.22)}
#${ROOT_ID} .mq-field:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}
#${ROOT_ID} .field textarea,#${ROOT_ID} .mq-follow textarea{min-height:72px;resize:vertical}
#${ROOT_ID} .mq-follow{margin-top:8px;margin-bottom:0}
#${ROOT_ID} .checks{display:flex;flex-direction:column;gap:8px}
#${ROOT_ID} .mq-attest .check span{font-size:11px;line-height:1.5}
#${ROOT_ID} .yn-toggle-row{display:flex;gap:10px;margin-bottom:4px;flex-wrap:wrap}
#${ROOT_ID} .yn-toggle{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:650;color:var(--brand);cursor:pointer;user-select:none;padding:7px 12px;border-radius:999px;border:1px solid rgba(215,202,194,.35);background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(247,241,236,.68));box-shadow:inset 0 1px 0 rgba(255,255,255,.92),0 2px 6px rgba(56,40,28,.05);transition:border-color .15s,background .15s,box-shadow .15s,transform .15s}
#${ROOT_ID} .yn-toggle:hover{border-color:rgba(187,71,121,.24);transform:translateY(-1px)}
#${ROOT_ID} .yn-toggle input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
#${ROOT_ID} .yn-toggle-box{width:18px;height:18px;border-radius:5px;border:1.5px solid rgba(132,117,107,.4);background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(247,241,236,.9));display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 2px rgba(56,40,28,.06);transition:border-color .15s,background .15s,box-shadow .15s}
#${ROOT_ID} .yn-toggle input:checked+.yn-toggle-box{border-color:var(--accent);background:linear-gradient(180deg,rgba(252,233,240,.95),rgba(241,207,220,.75));box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 0 0 1px rgba(187,71,121,.2)}
#${ROOT_ID} .yn-toggle input:checked+.yn-toggle-box::after{content:"";width:10px;height:10px;border-radius:3px;background:linear-gradient(135deg,var(--accent),#9e3a68)}
#${ROOT_ID} .yn-toggle:has(input:checked){border-color:rgba(187,71,121,.32);background:linear-gradient(180deg,rgba(252,233,240,.72),rgba(241,207,220,.42));box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 4px 12px rgba(187,71,121,.1)}
#${ROOT_ID} .btn-primary:disabled{opacity:.55;cursor:wait;transform:none}
#${ROOT_ID} .status{margin-top:10px}
`;

  function buildStyleText() {
    const shell = global.CcoStepModalDesign?.buildShellCss(ROOT_ID, 10050) || '';
    return shell + STEP8_EXTRA_CSS;
  }

  let keyHandler = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function isV9On() {
    return document.documentElement.getAttribute('data-v9-enabled') === 'on';
  }

  function isDemoFlagOn() {
    return (
      isV9On() &&
      (document.documentElement.getAttribute('data-v9-demo') === 'on' ||
        global.__ARCANA_V9_DEMO_ENABLED__ === true)
    );
  }

  function isCustomersView() {
    try {
      const params = new URLSearchParams(global.location.search || '');
      if (params.get('view') === 'customers') return true;
    } catch {
      /* ignore */
    }
    const canvas = document.querySelector('.preview-canvas');
    return canvas && canvas.dataset.appShellView === 'customers';
  }

  function readContext(options = {}) {
    // source: new
    let operationLabel = '2026-06-15 · 09:00';
    let patientName = 'Anna Karlsson';
    try {
      const params = new URLSearchParams(global.location.search || '');
      const demoOp = String(params.get('demoOp') || '').trim();
      const demoOpDate = String(params.get('demoOpDate') || '').trim();
      const demoOpTime = String(params.get('demoOpTime') || '').trim();
      if (demoOp) operationLabel = demoOp;
      else if (demoOpDate) {
        operationLabel = demoOpTime ? `${demoOpDate} · ${demoOpTime}` : demoOpDate;
      }
      const demoPatient = String(params.get('demoPatient') || '').trim();
      if (demoPatient) patientName = demoPatient;
    } catch {
      /* ignore */
    }
    if (options.operationLabel) operationLabel = options.operationLabel;
    if (options.patientName) patientName = options.patientName;
    return { operationLabel, patientName };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildStyleText();
    document.head.appendChild(style);
  }

  function setOverlayStatus(root, msg, kind) {
    const status = root.querySelector('#status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'status show ' + (kind || '');
  }

  function validateMeridiqForm(root) {
    if (!meridiqContent) return 'Meridiq-innehåll saknas.';
    return global.CcoMeridiqContent.validateSteg8Form(root, meridiqContent);
  }

  function bindDiseaseExclusivity(root) {
    if (!meridiqContent) return;
    global.CcoMeridiqContent.bindSteg8DiseaseExclusivity(root, meridiqContent);
  }

  function demoSign(root) {
    const signBtn = root.querySelector('#signBtn');
    const formPanel = root.querySelector('#steg8FormPanel');
    const actions = root.querySelector('.actions');
    const header = root.querySelector('.demo-header');
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (!signBtn) return;

    const validationError = validateMeridiqForm(root);
    if (validationError) {
      setOverlayStatus(root, '⚠ ' + validationError, 'error');
      return;
    }

    signBtn.disabled = true;
    setOverlayStatus(root, '✓ Signerad och låst', 'success');
    if (signedEntryId) {
      signedEntryId.textContent = `demo-m${MERIDIQ_FORM_ID}-${Date.now().toString(36)}`;
    }
    if (formPanel) formPanel.style.display = 'none';
    if (actions) actions.style.display = 'none';
    if (header) header.style.display = 'none';
    if (signedPanel) signedPanel.hidden = false;
  }

  function bindOverlay(root) {
    bindDiseaseExclusivity(root);

    root.querySelector('#cancelBtn')?.addEventListener('click', () => {
      unmount(true);
    });
    root.querySelector('#signBtn')?.addEventListener('click', () => {
      demoSign(root);
    });
    root.addEventListener('click', (event) => {
      if (event.target === root) unmount(true);
    });

    keyHandler = (event) => {
      if (!document.getElementById(ROOT_ID)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        unmount(true);
        return;
      }
      if (event.key === 'Enter' && event.target && event.target.id === 'signBtn') {
        event.preventDefault();
        demoSign(root);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function mount(options = {}) {
    if (document.getElementById(ROOT_ID)) return Promise.resolve(document.getElementById(ROOT_ID));

    return global.CcoMeridiqContent.load()
      .then((content) => {
        meridiqContent = content;
        ensureStyles();
        const context = readContext(options);
        const formId = content.steg8?.form?.apiId || MERIDIQ_FORM_ID;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'demo-scrim';
        root.setAttribute('role', 'presentation');
        root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Friskförsäkran · Meridiq ${formId}">
        ${global.CcoMeridiqContent.buildSteg8FormHtml(content)}
      </div>`;
        document.body.appendChild(root);
        bindOverlay(root);
        try {
          sessionStorage.removeItem(DISMISS_KEY);
        } catch {
          /* private mode */
        }
        return root;
      })
      .catch((error) => {
        console.error('[steg8] Meridiq content load failed', error);
        throw error;
      });
  }

  function unmount(dismissed) {
    document.getElementById(ROOT_ID)?.remove();
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }

  function maybeAutoMount(options = {}) {
    if (!isDemoFlagOn() || !isCustomersView()) return false;
    if (global.CcoAvtalSamtyckeBundle?.isSteg7Complete?.() !== true) {
      try {
        if (sessionStorage.getItem('arcana.steg7bundle.dismissed') !== '1') return false;
      } catch {
        return false;
      }
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return false;
    } catch {
      /* private mode */
    }
    mount(options);
    return true;
  }

  global.CcoFriskforsakranDemoOverlay = {
    mount,
    unmount,
    maybeAutoMount,
    isDemoFlagOn,
    readContext,
    MERIDIQ_FORM_ID,
    getMeridiqContent: () => meridiqContent,
    get MERIDIQ_YN_QUESTIONS() {
      return global.CcoMeridiqContent.getSteg8YnQuestions(meridiqContent?.steg8 || {});
    },
    CACHE_BUST,
  };

  function bootUatStandalonePage() {
    const path = String(global.location?.pathname || '');
    if (!path.includes('cco-friskforsakran-demo-overlay.html')) return;
    if (document.getElementById(ROOT_ID)) return;
    void mount({
      operationLabel: '2026-06-15 · 09:00',
      patientName: 'Anna Karlsson',
    })
      .then(() => {
        const shell = document.getElementById('uat-shell');
        if (shell) shell.hidden = true;
      })
      .catch((error) => {
        console.error('[steg8-uat] mount failed', error);
        const err = document.getElementById('uat-error');
        if (err) {
          err.hidden = false;
          err.textContent = 'Kunde inte öppna modalen. Prova hård refresh (Cmd+Shift+R).';
        }
      });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootUatStandalonePage);
    } else {
      bootUatStandalonePage();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
