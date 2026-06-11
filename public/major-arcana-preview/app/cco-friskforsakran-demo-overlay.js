/**
 * Steg 8 — Friskförsäkran demo-overlay (operationsdagen).
 * source: public/friskforsakran.html (befintlig text, oförändrad)
 * Gate: data-v9-demo=on + customers-vy (?demo=on)
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-ff-demo-scrim';
  const STYLE_ID = 'cco-ff-demo-styles';
  const DISMISS_KEY = 'arcana.ffdemo.dismissed';

  const FORM_HTML = `
  <div class="wrap">
    <header class="head">
      <div class="kicker">★ Lagkrav · FUE / Hårtransplantation</div>
      <h1>Friskförsäkran</h1>
      <p>Måste signeras senast 48 timmar innan din behandling. Detta är ett FUE-krav i Sverige (Patientdatalagen 2008:355).</p>
    </header>

    <section class="panel">
      <div class="legal">
        <strong>Vad signerar du?</strong> Att du bekräftar dina svar nedan stämmer, att du varit ärlig om hälsotillstånd, mediciner och allergier, och att informationen får sparas i din patientjournal hos Hair TP Clinic i 10 år enligt journallagen.
      </div>

      <div class="field">
        <label for="patientName">Ditt namn</label>
        <input type="text" id="patientName" autocomplete="name" placeholder="För- och efternamn">
      </div>

      <div class="field">
        <label for="patientId">Personnummer (ÅÅÅÅMMDD-XXXX)</label>
        <input type="text" id="patientId" autocomplete="off" placeholder="19800101-1234" pattern="\\d{8}-?\\d{4}">
      </div>

      <h2 style="margin-top:18px">Hälsofrågor</h2>

      <div class="checks">
        <label class="check"><input type="checkbox" id="q1"> <span>Jag har <strong>inga</strong> hjärtsjukdomar, blödarsjukdomar eller okontrollerad blodtryck. <em>(Om du har, kontakta oss separat.)</em></span></label>
        <label class="check"><input type="checkbox" id="q2"> <span>Jag tar <strong>inga</strong> blodförtunnande mediciner (Waran, Xarelto, Eliquis, etc.) just nu, eller har slutat enligt läkares råd minst 5 dagar före.</span></label>
        <label class="check"><input type="checkbox" id="q3"> <span>Jag har <strong>inte</strong> haft hudinfektion, eksem eller psoriasis aktivt på hårbotten/donor-området senaste 4 veckorna.</span></label>
        <label class="check"><input type="checkbox" id="q4"> <span>Jag är <strong>medveten</strong> om att resultatet beror på donor-täthet, kvalitet och uppföljning, och att Hair TP Clinic inte garanterar exakt antal procent täckning.</span></label>
      </div>

      <div class="field" style="margin-top:18px">
        <label for="medications">Andra mediciner / kosttillskott du tar regelbundet (frivilligt)</label>
        <textarea id="medications" placeholder="Lista med dosering, eller skriv 'inga'"></textarea>
      </div>

      <div class="field">
        <label for="allergies">Kända allergier (lidokain, latex, antibiotika, etc.)</label>
        <textarea id="allergies" placeholder="Lista varje allergi separat, eller skriv 'inga'"></textarea>
      </div>

      <div class="actions">
        <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
        <button class="btn btn-primary" type="button" id="signBtn">✍ Signera friskförsäkran</button>
      </div>

      <div class="status" id="status" role="status" aria-live="polite"></div>
    </section>

    <section class="panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Signerad och låst</h3>
        <p>Din friskförsäkran är registrerad i Hair TP:s journal-system. Du kan stänga sidan — kliniken har fått besked.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--cco-text-tertiary)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;

  const STYLE_TEXT = `
:root{--cco-bg-page:#faf6f2;--cco-color-brand:#2b251f;--cco-text-secondary:rgba(70,60,50,.62);--cco-text-tertiary:#8a8174;--cco-status-success:#4a8268;--cco-status-success-bg:rgba(74,130,104,.14);--cco-status-warning:#c8821e;--cco-status-warning-bg:rgba(200,130,30,.14);--cco-status-danger:#b94a4a;--cco-status-danger-bg:rgba(185,74,74,.14);--cco-status-info:#4a7ba8;--cco-status-info-bg:rgba(74,123,168,.14);--accent-studio:#bb4779;--calendar-accent:#c8821e;--rose-pill-top:rgba(252,233,240,.98);--rose-pill-bottom:rgba(241,207,220,.95);--panel-shell-top:rgba(250,246,242,.94);--panel-shell-bottom:rgba(244,238,233,.86)}
#${ROOT_ID} *{box-sizing:border-box}
#${ROOT_ID}{position:fixed;inset:0;background:rgba(30,24,18,.42);display:flex;align-items:center;justify-content:center;z-index:10050;backdrop-filter:blur(2px);padding:24px}
#${ROOT_ID} .demo-modal{background:var(--cco-bg-page);border-radius:32px;max-width:720px;width:min(720px,calc(100vw - 32px));max-height:90vh;overflow-y:auto;box-shadow:0 48px 96px rgba(0,0,0,.16);padding:24px;position:relative;color:var(--cco-color-brand);font-family:Inter,-apple-system,system-ui,sans-serif;font-size:14px;line-height:1.5}
#${ROOT_ID} .demo-header-context{padding:12px 18px;border-radius:14px;background:rgba(74,130,104,.08);border:1px solid rgba(74,130,104,.22);font-size:12px;color:var(--cco-text-secondary);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
#${ROOT_ID} .demo-header-context strong{color:var(--cco-color-brand)}
#${ROOT_ID} .wrap{max-width:720px;margin:0 auto}
#${ROOT_ID} .head{padding:24px 28px;border-radius:28px;background:linear-gradient(135deg,var(--rose-pill-top),rgba(252,224,200,.92));color:var(--cco-color-brand);box-shadow:0 18px 38px rgba(187,71,121,.08);border:1px solid rgba(255,255,255,.72);margin-bottom:18px;position:relative;overflow:hidden}
#${ROOT_ID} .head::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 88% 12%,rgba(255,255,255,.5),transparent 42%);pointer-events:none}
#${ROOT_ID} .head .kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-studio);margin-bottom:6px;position:relative}
#${ROOT_ID} .head h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px;color:var(--cco-color-brand);position:relative}
#${ROOT_ID} .head p{margin:0;font-size:13px;color:var(--cco-text-secondary);max-width:60ch;line-height:1.5;position:relative}
#${ROOT_ID} .panel{padding:22px 26px;border-radius:24px;background:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));box-shadow:0 24px 50px rgba(93,74,60,.08);margin-bottom:14px}
#${ROOT_ID} .panel h2{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--cco-text-tertiary);margin:0 0 14px}
#${ROOT_ID} .legal{padding:14px 16px;border-radius:14px;background:rgba(74,123,168,.08);border:1px solid rgba(74,123,168,.22);font-size:11.5px;color:var(--cco-status-info);line-height:1.5;margin-bottom:14px}
#${ROOT_ID} .field{margin-bottom:14px}
#${ROOT_ID} .field label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--cco-text-tertiary);margin-bottom:5px}
#${ROOT_ID} .field input,#${ROOT_ID} .field textarea{width:100%;padding:10px 13px;border-radius:11px;border:1px solid rgba(132,117,107,.28);background:white;font-family:inherit;font-size:13px;color:var(--cco-color-brand);outline:none}
#${ROOT_ID} .field input:focus,#${ROOT_ID} .field textarea:focus{border-color:var(--accent-studio);box-shadow:0 0 0 3px rgba(187,71,121,.12)}
#${ROOT_ID} .field textarea{min-height:80px;resize:vertical}
#${ROOT_ID} .checks{display:flex;flex-direction:column;gap:8px}
#${ROOT_ID} .check{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.6);cursor:pointer;border:1px solid transparent}
#${ROOT_ID} .check:hover{border-color:rgba(187,71,121,.22)}
#${ROOT_ID} .check input{flex-shrink:0;margin-top:2px}
#${ROOT_ID} .check span{font-size:12px;line-height:1.45;color:var(--cco-color-brand)}
#${ROOT_ID} .check em{color:var(--cco-text-tertiary);font-style:normal}
#${ROOT_ID} .actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
#${ROOT_ID} .btn{flex:1;min-width:170px;padding:13px;border-radius:14px;border:none;font-size:12.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
#${ROOT_ID} .btn-primary{background:linear-gradient(135deg,var(--accent-studio),#9e3a68);color:white;box-shadow:0 12px 28px rgba(187,71,121,.28)}
#${ROOT_ID} .btn-primary:hover{transform:translateY(-1px)}
#${ROOT_ID} .btn-primary:disabled{opacity:.55;cursor:wait;transform:none}
#${ROOT_ID} .btn-ghost{background:transparent;border:1px solid rgba(132,117,107,.28);color:var(--cco-text-secondary)}
#${ROOT_ID} .status{margin-top:12px;padding:11px 14px;border-radius:11px;font-size:12px;display:none}
#${ROOT_ID} .status.show{display:block}
#${ROOT_ID} .status.success{background:var(--cco-status-success-bg);color:var(--cco-status-success)}
#${ROOT_ID} .status.error{background:var(--cco-status-danger-bg);color:var(--cco-status-danger)}
#${ROOT_ID} .signed-banner{padding:18px 22px;border-radius:18px;background:linear-gradient(135deg,rgba(74,130,104,.16),rgba(74,130,104,.08));border:1px solid rgba(74,130,104,.32);text-align:center}
#${ROOT_ID} .signed-banner h3{margin:0 0 6px;font-size:16px;color:var(--cco-status-success);font-weight:800}
#${ROOT_ID} .signed-banner p{margin:0;font-size:12.5px;color:var(--cco-text-secondary)}
`;

  let keyHandler = null;

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

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readContext(options = {}) {
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
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
  }

  function demoSign(root) {
    const status = root.querySelector('#status');
    const signBtn = root.querySelector('#signBtn');
    const panel = root.querySelector('.panel');
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (!status || !signBtn) return;
    status.textContent = '✓ Signerad och låst';
    status.className = 'status show success';
    signBtn.disabled = true;
    if (signedEntryId) signedEntryId.textContent = 'demo-' + Date.now().toString(36);
    if (panel) panel.style.display = 'none';
    if (signedPanel) signedPanel.hidden = false;
  }

  function bindOverlay(root, context) {
    const modal = root.querySelector('.demo-modal');
    const patientNameInput = root.querySelector('#patientName');
    if (patientNameInput && context.patientName) {
      patientNameInput.value = context.patientName;
    }

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

    window.setTimeout(() => {
      modal?.querySelector('#patientName')?.focus({ preventScroll: true });
    }, 0);
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
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Friskförsäkran · operationsdagen">
        <div class="demo-header-context">
          <span>📅 <strong>Operationsdag:</strong> ${escapeHtml(context.operationLabel)}</span>
          <span>👤 ${escapeHtml(context.patientName)}</span>
        </div>
        ${FORM_HTML}
      </div>`;
    document.body.appendChild(root);
    bindOverlay(root, context);
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
  };
})(typeof window !== 'undefined' ? window : global);
