/**
 * Steg 7 — Avtal + samtycke bundle (dual-signature modal).
 *
 * Content registry (Meridiq facit — owner bekräftat 2026-06-14):
 *   source: migration/meridiq/consent-catalog.json — apiId 170917, 170955
 *   source: migration/meridiq/service-bindings-catalog.json — TP → consentApiId 170917
 *   source: new — dual-signature modal chrome, legal_review gate, demo journal submit
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-steg7-bundle-scrim';
  const GATE_ID = 'cco-steg7-bundle-gate-scrim';
  const STYLE_ID = 'cco-steg7-bundle-styles';
  const DISMISS_KEY = 'arcana.steg7bundle.dismissed';
  const SIGNED_KEY = 'arcana.steg7bundle.signed';
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-cloud-fas3-v8';

  let meridiqContent = null;

  const STEP7_EXTRA_CSS = `
#${ROOT_ID} .doc-scroll{max-height:none;overflow:visible}
#${ROOT_ID} .doc-heading{font-size:12px;line-height:1.5;color:var(--brand);margin:12px 0 8px;font-weight:700}
#${ROOT_ID} .doc-title{font-size:12px;line-height:1.5;color:var(--brand);margin:0 0 10px}
#${ROOT_ID} .doc-divider{padding-top:10px;border-top:1px solid rgba(215,202,194,.3);margin:10px 0 0}
#${ROOT_ID} .doc-partial-banner{margin:0 0 10px;padding:10px 12px;border-radius:12px;font-size:11px;line-height:1.45;color:#7a4014;background:rgba(180,120,40,.12);border:1px solid rgba(180,120,40,.22)}
#${GATE_ID} .head{padding:18px 18px 16px;border-bottom:1px solid rgba(215,202,194,.5);background:var(--header-bg);border-radius:0;margin:0}
#${GATE_ID} .head .kicker{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
#${GATE_ID} .head h1{font-size:16px;font-weight:800;margin:0 0 6px;color:var(--brand)}
#${GATE_ID} .head p{font-size:11px;color:var(--t2);margin:0;line-height:1.45}
#${GATE_ID} .gate-panel{padding:14px;margin:12px 18px 18px;border-radius:14px;background:var(--card-bg);border:1px solid rgba(255,255,255,.72);box-shadow:var(--card-shadow);text-align:center}
#${GATE_ID} .gate-panel p{margin:0 0 12px;color:var(--t2);font-size:12px;line-height:1.5}
#${GATE_ID} .gate-panel .btn{margin-top:8px;padding:11px 20px;border-radius:12px;border:1px solid rgba(132,117,107,.28);background:transparent;font:inherit;font-weight:700;cursor:pointer;color:var(--t2)}
`;

  function buildStyleText() {
    const shell = global.CcoStepModalDesign?.buildShellCss([ROOT_ID, GATE_ID], 10040) || '';
    return shell + STEP7_EXTRA_CSS;
  }

  let keyHandler = null;
  let gateKeyHandler = null;
  let mountOptions = {};

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  function readDemoParam(name) {
    try {
      return String(new URLSearchParams(global.location.search || '').get(name) || '').trim();
    } catch {
      return '';
    }
  }

  function resolveLegalReviewApproved(options = {}) {
    if (options.legalReviewApproved === true) return true;
    if (global.__ARCANA_STEG7_LEGAL_APPROVED__ === true) return true;
    if (readDemoParam('demoLegal') === 'approved') return true;
    const card = global.currentPatientCard;
    if (card?.legalReviewApproved === true) return true;
    return false;
  }

  function readContext(options = {}) {
    let patientName = 'Anna Karlsson';
    let patientId = '';
    let personnummer = '';
    let offerLabel = 'Hårtransplantation DHI · enligt offert';
    try {
      const demoPatient = readDemoParam('demoPatient');
      const demoPatientId = readDemoParam('demoPatientId');
      const demoPnr = readDemoParam('demoPnr');
      const demoOffer = readDemoParam('demoOffer');
      if (demoPatient) patientName = demoPatient;
      if (demoPatientId) patientId = demoPatientId;
      if (demoPnr) personnummer = demoPnr;
      if (demoOffer) offerLabel = demoOffer;
    } catch {
      /* ignore */
    }
    if (options.patientName) patientName = options.patientName;
    if (options.patientId) patientId = options.patientId;
    if (options.personnummer) personnummer = options.personnummer;
    if (options.offerLabel) offerLabel = options.offerLabel;
    return { patientName, patientId, personnummer, offerLabel };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildStyleText();
    document.head.appendChild(style);
  }

  function setOverlayStatus(root, msg, kind) {
    const status = root.querySelector('#steg7Status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'status show ' + (kind || '');
  }

  function syncSignButton(root) {
    const signBtn = root.querySelector('#signBothBtn');
    if (!signBtn) return;
    const ackBundle = root.querySelector('#ackBundle')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    signBtn.disabled = !(ackBundle && name && pnr);
  }

  function mount(options = {}) {
    mountOptions = { ...options };
    if (document.getElementById(ROOT_ID)) return Promise.resolve(document.getElementById(ROOT_ID));

    const context = readContext(options);
    global.currentPatientCard = {
      id: context.patientId || options.patientId || '',
      displayName: context.patientName,
      personnummer: context.personnummer,
      legalReviewApproved: resolveLegalReviewApproved(options),
    };

    if (!resolveLegalReviewApproved(options)) {
      showLegalGate(context);
      return Promise.resolve(null);
    }

    return global.CcoMeridiqContent.loadForSteg7(options)
      .then((content) => {
        meridiqContent = content;
        ensureStyles();
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'demo-scrim';
        root.setAttribute('role', 'presentation');
        root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Avtal + samtycke · steg 7">
        ${global.CcoMeridiqContent.buildSteg7FormHtml(context, content)}
      </div>`;
        document.body.appendChild(root);
        bindOverlay(root, context);
        try {
          sessionStorage.removeItem(DISMISS_KEY);
        } catch {
          /* private mode */
        }
        return root;
      })
      .catch((error) => {
        console.error('[steg7] Meridiq content load failed', error);
        throw error;
      });
  }

  function mockSignatureHash(name, pnr, consentId) {
    try {
      return btoa(unescape(encodeURIComponent(`${name}|${pnr}|${consentId}|${Date.now()}`)));
    } catch {
      return `demo-${consentId}-${Date.now().toString(36)}`;
    }
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    if (!res.ok) {
      const message =
        (payload && (payload.error || payload.message)) || text || `HTTP ${res.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async function submitBundleToJournal(root, context) {
    const patientName = root.querySelector('#patientName')?.value.trim() || context.patientName;
    const patientIdNumber = root.querySelector('#patientId')?.value.trim() || context.personnummer;
    const patientId = context.patientId || mountOptions.patientId || '';
    const signedAt = new Date().toISOString();
    const agreement = meridiqContent.steg7.consents.agreement;
    const cooling = meridiqContent.steg7.consents.cooling;
    const signatures = [agreement, cooling].map((consent) => ({
      consentId: consent.apiId,
      consentTitle: consent.title,
      consentVersion: consent.version,
      patientName,
      patientIdNumber,
      timestamp: signedAt,
      signatureHash: mockSignatureHash(patientName, patientIdNumber, consent.apiId),
    }));

    const journalPayload = {
      patientId,
      personnummer: patientIdNumber,
      journalType: 'consent_bundle',
      title: 'Avtal + samtycke · steg 7',
      source: 'cco_consent_bundle',
      status: 'draft',
      fields: {
        bundleType: 'CONSENT_BUNDLE',
        step: 7,
        consentIds: [agreement.apiId, cooling.apiId],
        patientSignedName: patientName,
        patientSignedId: patientIdNumber,
        signatures,
        offerLabel: context.offerLabel,
      },
    };

    if (typeof mountOptions.onJournalSubmit === 'function') {
      return mountOptions.onJournalSubmit(journalPayload);
    }

    if (!patientId) {
      return {
        entryId: `demo-steg7-${Date.now().toString(36)}`,
        demo: true,
      };
    }

    const created = await apiFetch('/api/v1/cco-journal/entry', {
      method: 'PUT',
      body: journalPayload,
    });
    const entryId = created?.entry?.entryId;
    if (!entryId) throw new Error('Journalpost saknar entryId.');
    const signed = await apiFetch('/api/v1/cco-journal/entry/sign', {
      method: 'POST',
      body: { patientId, entryId },
    });
    return {
      entryId: signed?.entry?.entryId || entryId,
      entry: signed?.entry || created?.entry,
    };
  }

  function showSignedState(root, entryId) {
    const formPanel = root.querySelector('#steg7FormPanel');
    const actions = root.querySelector('.actions');
    const header = root.querySelector('.demo-header');
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (formPanel) formPanel.style.display = 'none';
    if (actions) actions.style.display = 'none';
    if (header) header.style.display = 'none';
    if (signedPanel) signedPanel.hidden = false;
    if (signedEntryId) signedEntryId.textContent = entryId || '—';
    try {
      sessionStorage.setItem(SIGNED_KEY, '1');
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
  }

  async function signBundle(root, context) {
    const signBtn = root.querySelector('#signBothBtn');
    if (!signBtn || signBtn.disabled) return;

    const ackBundle = root.querySelector('#ackBundle')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    if (!ackBundle) {
      setOverlayStatus(root, '⚠ Godkänn avtal och samtycke innan signering.', 'error');
      return;
    }
    if (!name || !pnr) {
      setOverlayStatus(root, '⚠ Ange namn och personnummer.', 'error');
      return;
    }

    signBtn.disabled = true;
    setOverlayStatus(root, 'Signerar avtal och samtycke…', 'warning');

    try {
      const result = await submitBundleToJournal(root, {
        ...context,
        patientName: name,
        personnummer: pnr,
      });
      setOverlayStatus(root, '✓ Avtal och samtycke signerat och låst', 'success');
      showSignedState(root, result.entryId);
      if (typeof mountOptions.onSigned === 'function') {
        mountOptions.onSigned(result);
      }
      window.setTimeout(() => {
        if (readDemoParam('demoSteg') === '8' || mountOptions.advanceToSteg8 === true) {
          try {
            global.location.hash = '#steg8';
          } catch {
            /* ignore */
          }
          global.CcoFriskforsakranDemoOverlay?.mount?.({
            patientName: name,
            operationLabel: mountOptions.operationLabel,
          });
        }
      }, 1500);
    } catch (error) {
      signBtn.disabled = false;
      syncSignButton(root);
      setOverlayStatus(root, '⚠ ' + (error.message || 'Signering misslyckades.'), 'error');
    }
  }

  function bindOverlay(root, context) {
    ['#ackBundle', '#patientName', '#patientId'].forEach((sel) => {
      root.querySelector(sel)?.addEventListener('input', () => syncSignButton(root));
      root.querySelector(sel)?.addEventListener('change', () => syncSignButton(root));
    });
    syncSignButton(root);

    root.querySelector('#cancelBtn')?.addEventListener('click', () => unmount(true));
    root.querySelector('#signBothBtn')?.addEventListener('click', () => {
      void signBundle(root, context);
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
      if (event.key === 'Enter' && !event.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
        event.preventDefault();
        void signBundle(root, context);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function showLegalGate(context) {
    if (document.getElementById(GATE_ID)) return document.getElementById(GATE_ID);
    ensureStyles();
    const root = document.createElement('div');
    root.id = GATE_ID;
    root.innerHTML = `
      <div class="demo-modal" role="alertdialog" aria-modal="true" aria-label="Avtal väntar juridisk granskning">
        <div class="wrap">
          <header class="demo-header">
            <span class="demo-kicker">★ Steg 7 · legal_review</span>
            <h1 class="demo-title">Avtal väntar juridisk granskning</h1>
            <p class="demo-subtitle">Behandlingsavtalet och ångerfristsamtycket kan inte signeras förrän mall-versionen är godkänd av juridik.</p>
          </header>
          <section class="gate-panel">
            <p>Kontakta kliniken om du behöver signera innan godkännande finns.</p>
            <p><strong>${escapeHtml(context.patientName)}</strong></p>
            <button type="button" class="btn" id="gateCloseBtn">Stäng</button>
          </section>
        </div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#gateCloseBtn')?.addEventListener('click', () => unmountGate(true));
    root.addEventListener('click', (event) => {
      if (event.target === root) unmountGate(true);
    });
    gateKeyHandler = (event) => {
      if (!document.getElementById(GATE_ID)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        unmountGate(true);
      }
    };
    document.addEventListener('keydown', gateKeyHandler);
    return root;
  }

  function unmountGate(dismissed) {
    document.getElementById(GATE_ID)?.remove();
    if (gateKeyHandler) {
      document.removeEventListener('keydown', gateKeyHandler);
      gateKeyHandler = null;
    }
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }

  function unmount(dismissed) {
    document.getElementById(ROOT_ID)?.remove();
    unmountGate(false);
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    mountOptions = {};
    if (dismissed) {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* private mode */
      }
    }
  }

  function isSteg7Complete() {
    try {
      if (sessionStorage.getItem(SIGNED_KEY) === '1') return true;
      if (readDemoParam('demoSteg') === '8') return true;
      if (readDemoParam('demoSkipSteg7') === '1') return true;
    } catch {
      /* private mode */
    }
    return false;
  }

  function maybeAutoMount(options = {}) {
    if (!isDemoFlagOn() || !isCustomersView()) return false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return false;
      if (sessionStorage.getItem(SIGNED_KEY) === '1') return false;
    } catch {
      /* private mode */
    }
    mount(options);
    return true;
  }

  global.CcoAvtalSamtyckeBundle = {
    mount,
    unmount,
    maybeAutoMount,
    isDemoFlagOn,
    isSteg7Complete,
    resolveLegalReviewApproved,
    readContext,
    getMeridiqContent: () => meridiqContent,
    CACHE_BUST,
  };

  function bootUatStandalonePage() {
    const path = String(global.location?.pathname || '');
    if (!path.includes('cco-avtal-samtycke-bundle.html')) return;
    if (document.getElementById(ROOT_ID)) return;
    global.__ARCANA_STEG7_LEGAL_APPROVED__ = true;
    void mount({
      patientName: 'Anna Karlsson',
      personnummer: '19800101-1234',
      offerLabel: 'Hårtransplantation DHI · 45 000 kr',
      legalReviewApproved: true,
    })
      .then(() => {
        const shell = document.getElementById('uat-shell');
        if (shell) shell.hidden = true;
      })
      .catch((error) => {
        console.error('[steg7-uat] mount failed', error);
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
