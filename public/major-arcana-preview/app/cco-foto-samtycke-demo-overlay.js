/**
 * Steg 9 — Foto-samtycke demo-overlay (hårlinje/krona).
 *
 * Content registry:
 *   source: docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md — steg 9 scope
 *   source: public/kunder-mockup-v10.html — hårlinje/krona, aldrig ansikte
 *   source: new — demo modal chrome
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-foto-samtycke-scrim';
  const STYLE_ID = 'cco-foto-samtycke-styles';
  const DISMISS_KEY = 'arcana.fotosamtycke.dismissed';
  const SIGNED_KEY = 'arcana.fotosamtycke.signed';
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-step789-kundkort-v2';

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

  function buildFormHtml(context) {
    return `
  <div class="wrap">
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 9</span>
      <h1 class="demo-title">Foto-samtycke</h1>
      <p class="demo-subtitle">Samma dag som för-/efterbild · scope sparas i journalen</p>
    </header>

    <div class="demo-scroll" id="steg9FormPanel">
      <section class="section-block" aria-label="Foto-samtycke">
        <p class="scope-note">
          <strong>Scope:</strong> Hårlinje och krona för journalföring och behandlingsuppföljning.
          <strong>Aldrig ansikte.</strong>
        </p>
        <ul class="scope-list">
          <li>Före/efter-bilder av hårlinje och krona får tas och sparas i patientjournalen.</li>
          <li>Bilder får användas internt för uppföljning — inte för marknadsföring utan separat samtycke.</li>
          <li>Patient: ${escapeHtml(context.patientName)}</li>
        </ul>
        <label class="check">
          <input type="checkbox" id="ackPhotoScope" />
          <span>Jag godkänner att Hair TP Clinic tar och sparar före/efter-bilder enligt scope ovan (hårlinje/krona — aldrig ansikte).</span>
        </label>
      </section>

      <section class="section-block section-block--sign" aria-label="Signering">
        <div class="field">
          <label for="photoPatientName">Namn</label>
          <input type="text" id="photoPatientName" autocomplete="name" value="${escapeHtml(context.patientName)}" placeholder="För- och efternamn" />
        </div>
      </section>

      <div class="status" id="steg9Status" role="status" aria-live="polite"></div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
      <button class="btn btn-primary" type="button" id="signBtn" disabled>✍ Signera</button>
    </div>

    <section class="signed-panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Foto-samtycke registrerat</h3>
        <p>Scope hårlinje/krona är sparat i Hair TP:s journal-system.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--t3)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;
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
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    ensureStyles();
    const context = readContext(options);
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'demo-scrim';
    root.setAttribute('role', 'presentation');
    root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Foto-samtycke · steg 9">
        ${buildFormHtml(context)}
      </div>`;
    document.body.appendChild(root);
    bindOverlay(root);
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      /* private mode */
    }
    return root;
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
})(typeof window !== 'undefined' ? window : globalThis);
