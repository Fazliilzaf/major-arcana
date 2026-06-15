/**
 * Steg 9 — Foto-samtycke demo-overlay (hårlinje/krona).
 *
 * Content registry (Meridiq facit — owner bekräftat 2026-06-14):
 *   source: migration/meridiq — registry foto_samtycke (Meridiq G4 doc #15)
 *   source: docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md — scope hårlinje/krona, aldrig ansikte
 *   source: new — demo modal chrome
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-foto-samtycke-scrim';
  const STYLE_ID = 'cco-foto-samtycke-styles';
  const DISMISS_KEY = 'arcana.fotosamtycke.dismissed';
  const SIGNED_KEY = 'arcana.fotosamtycke.signed';
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-cloud-fas12-v7';

  let meridiqContent = null;

  const STEP9_EXTRA_CSS = `
#${ROOT_ID} .scope-note{
  font-size:12px;line-height:1.62;color:var(--t2);margin:0 0 12px;padding:12px 14px;border-radius:12px;
  background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(247,241,236,.42));
  border:1px solid rgba(215,202,194,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.88)
}
#${ROOT_ID} .scope-note strong{color:var(--brand)}
#${ROOT_ID} .scope-list{margin:0 0 12px;padding-left:18px;color:var(--t2);font-size:12px;line-height:1.58}
#${ROOT_ID} .scope-list li{margin-bottom:8px;padding-left:2px}
#${ROOT_ID} .scope-list li::marker{color:var(--accent)}
`;

  function buildStyleText() {
    const shell = global.CcoStepModalDesign?.buildShellCss(ROOT_ID, 10055) || '';
    return shell + STEP9_EXTRA_CSS;
  }

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

  function readContext(options = {}) {
    let patientName = 'Anna Karlsson';
    try {
      const demoPatient = String(
        new URLSearchParams(global.location.search || '').get('demoPatient') || ''
      ).trim();
      if (demoPatient) patientName = demoPatient;
    } catch {
      /* ignore */
    }
    if (options.patientName) patientName = options.patientName;
    return { patientName };
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = buildStyleText();
    document.head.appendChild(style);
  }

  function setOverlayStatus(root, msg, kind) {
    const status = root.querySelector('#steg9Status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'status show ' + (kind || '');
  }

  function syncSignButton(root) {
    const signBtn = root.querySelector('#signBtn');
    if (!signBtn) return;
    const ack = root.querySelector('#ackPhotoScope')?.checked;
    const name = root.querySelector('#photoPatientName')?.value.trim();
    signBtn.disabled = !(ack && name);
  }

  function showSignedState(root, entryId) {
    root.querySelector('#steg9FormPanel')?.style.setProperty('display', 'none');
    root.querySelector('.actions')?.style.setProperty('display', 'none');
    root.querySelector('.demo-header')?.style.setProperty('display', 'none');
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (signedPanel) signedPanel.hidden = false;
    if (signedEntryId) signedEntryId.textContent = entryId || '—';
    try {
      sessionStorage.setItem(SIGNED_KEY, '1');
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
  }

  function signOverlay(root) {
    const signBtn = root.querySelector('#signBtn');
    if (!signBtn || signBtn.disabled) return;
    const ack = root.querySelector('#ackPhotoScope')?.checked;
    const name = root.querySelector('#photoPatientName')?.value.trim();
    if (!ack || !name) {
      setOverlayStatus(root, '⚠ Godkänn scope och ange namn.', 'error');
      return;
    }
    signBtn.disabled = true;
    setOverlayStatus(root, '✓ Foto-samtycke registrerat', 'success');
    showSignedState(root, `demo-foto-${Date.now().toString(36)}`);
  }

  let keyHandler = null;

  function bindOverlay(root) {
    ['#ackPhotoScope', '#photoPatientName'].forEach((sel) => {
      root.querySelector(sel)?.addEventListener('input', () => syncSignButton(root));
      root.querySelector(sel)?.addEventListener('change', () => syncSignButton(root));
    });
    syncSignButton(root);
    root.querySelector('#cancelBtn')?.addEventListener('click', () => unmount(true));
    root.querySelector('#signBtn')?.addEventListener('click', () => signOverlay(root));
    root.addEventListener('click', (event) => {
      if (event.target === root) unmount(true);
    });
    keyHandler = (event) => {
      if (!document.getElementById(ROOT_ID)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        unmount(true);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  function mount(options = {}) {
    if (document.getElementById(ROOT_ID)) return Promise.resolve(document.getElementById(ROOT_ID));

    return global.CcoMeridiqContent.loadForSteg9(options)
      .then((content) => {
        meridiqContent = content;
        ensureStyles();
        const context = readContext(options);
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'demo-scrim';
        root.setAttribute('role', 'presentation');
        root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Foto-samtycke · steg 9">
        ${global.CcoMeridiqContent.buildSteg9FormHtml(context, content)}
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
        console.error('[steg9] Meridiq content load failed', error);
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
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return false;
      if (sessionStorage.getItem(SIGNED_KEY) === '1') return false;
    } catch {
      return false;
    }
    mount(options);
    return true;
  }

  global.CcoFotoSamtyckeDemoOverlay = Object.freeze({
    CACHE_BUST,
    mount,
    unmount,
    maybeAutoMount,
  });

  function bootUatStandalonePage() {
    const path = String(global.location?.pathname || '');
    if (!path.includes('cco-foto-samtycke-demo-overlay.html')) return;
    if (document.getElementById(ROOT_ID)) return;
    void mount({ patientName: 'Anna Karlsson' })
      .then(() => {
        const shell = document.getElementById('uat-shell');
        if (shell) shell.hidden = true;
      })
      .catch((error) => {
        console.error('[steg9-uat] mount failed', error);
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
