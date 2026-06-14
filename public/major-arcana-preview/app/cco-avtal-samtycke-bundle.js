/**
 * Steg 7 — Avtal + samtycke bundle (dual-signature modal).
 *
 * Content registry:
 *   source: migration/meridiq/consent-catalog.json — apiId 170917, 170955
 *   source: src/ops/ccoTreatmentAgreementDocument.js — behandlingsavtal body (summary)
 *   source: docs/legal/juridik-gdpr/JURIST-FLODE-GABRIELLE-HANDLER.md — ångerfristsamtycke
 *   source: public/friskforsakran.html — portal tokens + panel chrome
 *   source: new — dual-signature modal, legal_review gate, journal submit
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-steg7-bundle-scrim';
  const GATE_ID = 'cco-steg7-bundle-gate-scrim';
  const STYLE_ID = 'cco-steg7-bundle-styles';
  const DISMISS_KEY = 'arcana.steg7bundle.dismissed';
  const SIGNED_KEY = 'arcana.steg7bundle.signed';
  const CACHE_BUST = 'hairtp-steg7-bundle-v5-kundkort';

  const CONSENT_AGREEMENT = {
    apiId: 170917,
    title: 'Behandlingsavtal | TP',
    version: '2',
    brand: 'Hair TP Clinic',
  };

  const CONSENT_COOLING = {
    apiId: 170955,
    title: 'Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar)',
    version: '1',
    brand: 'Hair TP Clinic',
  };

  // source: src/ops/ccoTreatmentAgreementDocument.js — buildTreatmentAgreementHtml (summary)
  const AGREEMENT_BODY = `
    <p><strong>1. Parter</strong><br/>Klinik: Hair TP Clinic AB · Patient: enligt signering nedan.</p>
    <p><strong>2. Behandling</strong><br/>Behandlingen avser hårtransplantation enligt offert (DHI/FUE). Pris enligt accepterad offert.</p>
    <p><strong>3. Bilagor</strong></p>
    <ul>
      <li><strong>Bilaga 1</strong> — Patientinformation &amp; tjänstespecifikation</li>
      <li>Behandlingsplan från konsultation (om bifogad)</li>
      <li><strong>Bilaga 3</strong> — Konsumentverkets ångerblankett (vid distansavtal)</li>
    </ul>
    <p><strong>4. Av- och ombokning</strong><br/>Enligt klinikens villkor i patientinformation och offert.</p>
    <p><strong>5. Distansavtal och ångerrätt</strong><br/>Vid distansavtal gäller 14 dagars ångerrätt enligt Distansavtalslagen. Särskilt samtycke krävs om behandling eller bokning ska påbörjas innan ångerfristen löpt ut.</p>
    <p><strong>6. Signering</strong><br/>Genom signering bekräftar patienten att bilaga 1 mottagits och att villkoren accepteras.</p>`;

  // source: docs/legal/juridik-gdpr/JURIST-FLODE-GABRIELLE-HANDLER.md — särskilt samtycke
  const COOLING_BODY = `
    <p>Detta samtycke gäller när behandlingsavtalet ingås på distans och du begär att Hair TP Clinic ska påbörja behandlingen och/eller boka behandlingstid <strong>innan</strong> 14 dagars ångerfrist har löpt ut.</p>
    <p>Du bekräftar att du tagit del av information om ångerrätt, att du fått tillgång till Konsumentverkets ångerblankett (bilaga 3), och att du förstår att du genom detta samtycke kan avstå från ångerrätt för den del av tjänsten som redan fullgjorts.</p>
    <p>Genom att signera begär du uttryckligen att behandling/bokning påbörjas under ångerfristen.</p>`;

  const STYLE_TEXT = `
:root{--cco-bg-page:#faf6f2;--cco-color-brand:#2b251f;--cco-text-secondary:rgba(70,60,50,.62);--cco-text-tertiary:#8a8174;--cco-status-success:#4a8268;--cco-status-success-bg:rgba(74,130,104,.14);--cco-status-warning:#c8821e;--cco-status-warning-bg:rgba(200,130,30,.14);--cco-status-danger:#b94a4a;--cco-status-danger-bg:rgba(185,74,74,.14);--cco-status-info:#4a7ba8;--cco-status-info-bg:rgba(74,123,168,.14);--accent-studio:#bb4779;--calendar-accent:#c8821e;--rose-pill-top:rgba(252,233,240,.98);--rose-pill-bottom:rgba(241,207,220,.95);--panel-shell-top:rgba(250,246,242,.94);--panel-shell-bottom:rgba(244,238,233,.86);--panel-shell-shadow:0 18px 34px rgba(92,73,58,.08),0 6px 14px rgba(151,139,157,.04),inset 0 1px 0 rgba(255,255,255,.56);--panel-shell-shadow-strong:0 26px 58px rgba(93,74,60,.09),0 10px 26px rgba(156,145,166,.05),0 0 0 1px rgba(255,255,255,.18),inset 0 1px 0 rgba(255,255,255,.42);--panel-card-top:rgba(255,255,255,.94);--panel-card-bottom:rgba(247,241,236,.86);--panel-card-shadow:0 3px 10px rgba(56,40,28,.08),inset 0 1px 0 rgba(255,255,255,.86)}
#${ROOT_ID} *,#${GATE_ID} *{box-sizing:border-box}
#${ROOT_ID},#${GATE_ID}{position:fixed;inset:0;background:rgba(30,24,18,.42);display:flex;align-items:center;justify-content:center;z-index:10040;backdrop-filter:blur(2px);padding:24px}
#${ROOT_ID} .demo-modal,#${GATE_ID} .demo-modal{background:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));border-radius:32px;max-width:920px;width:min(920px,calc(100vw - 32px));max-height:90vh;overflow-y:auto;box-shadow:var(--panel-shell-shadow);padding:28px;position:relative;color:var(--cco-color-brand);font-family:Inter,-apple-system,system-ui,sans-serif;font-size:14px;line-height:1.5}
#${ROOT_ID} .demo-header-context{padding:12px 18px;border-radius:14px;background:rgba(74,130,104,.08);border:1px solid rgba(74,130,104,.22);font-size:12px;color:var(--cco-text-secondary);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
#${ROOT_ID} .demo-header-context strong,#${GATE_ID} .demo-header-context strong{color:var(--cco-color-brand)}
#${ROOT_ID} .wrap,#${GATE_ID} .wrap{max-width:920px;margin:0 auto}
#${ROOT_ID} .head,#${GATE_ID} .head{padding:24px 28px;border-radius:28px;background:linear-gradient(135deg,var(--rose-pill-top),rgba(252,224,200,.92));color:var(--cco-color-brand);box-shadow:0 18px 38px rgba(187,71,121,.08);border:1px solid rgba(255,255,255,.72);margin-bottom:18px;position:relative;overflow:hidden}
#${ROOT_ID} .head::before,#${GATE_ID} .head::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 88% 12%,rgba(255,255,255,.5),transparent 42%);pointer-events:none}
#${ROOT_ID} .head .kicker,#${GATE_ID} .head .kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-studio);margin-bottom:6px;position:relative}
#${ROOT_ID} .head h1,#${GATE_ID} .head h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px;color:var(--cco-color-brand);position:relative}
#${ROOT_ID} .head p,#${GATE_ID} .head p{margin:0;font-size:13px;color:var(--cco-text-secondary);max-width:62ch;line-height:1.5;position:relative}
#${ROOT_ID} .panel{padding:22px 26px;border-radius:24px;background:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));box-shadow:var(--panel-shell-shadow);margin-bottom:14px}
#${ROOT_ID} .panel h2{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--cco-text-tertiary);margin:0 0 12px}
#${ROOT_ID} .legal{padding:14px 16px;border-radius:14px;background:rgba(74,123,168,.08);border:1px solid rgba(74,123,168,.22);font-size:11.5px;color:var(--cco-status-info);line-height:1.6;margin-bottom:24px}
#${ROOT_ID} .section-block{margin-bottom:24px;border-radius:18px;background:linear-gradient(180deg,var(--panel-card-top),var(--panel-card-bottom));border:1px solid rgba(132,117,107,.18);box-shadow:var(--panel-card-shadow);overflow:hidden}
#${ROOT_ID} .section-block__head{padding:14px 18px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--cco-text-tertiary);border-bottom:1px solid rgba(132,117,107,.12);background:rgba(255,255,255,.35)}
#${ROOT_ID} .section-block__body{padding:20px 22px 22px}
#${ROOT_ID} .bundle-panels{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:0}
@media(max-width:767px){#${ROOT_ID} .bundle-panels{grid-template-columns:1fr;gap:24px}}
#${ROOT_ID} .bundle-panel{padding:18px 20px;border-radius:14px;background:rgba(255,255,255,.72);border:1px solid rgba(132,117,107,.16);box-shadow:var(--panel-card-shadow);min-width:0}
#${ROOT_ID} .bundle-panel h3{margin:0 0 12px;font-size:13px;font-weight:650;line-height:1.5;color:var(--cco-color-brand);letter-spacing:-.01em}
#${ROOT_ID} .doc-scroll{max-height:240px;overflow-y:auto;padding-right:8px;font-size:13px;line-height:1.6;color:var(--cco-text-secondary);margin-bottom:14px}
#${ROOT_ID} .doc-scroll ul{margin:0 0 14px;padding-left:18px}
#${ROOT_ID} .doc-scroll p{margin:0 0 14px}
#${ROOT_ID} .doc-scroll p:last-child{margin-bottom:0}
#${ROOT_ID} .doc-meta{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cco-text-tertiary);margin:0 0 16px}
#${ROOT_ID} .field{margin-bottom:16px}
#${ROOT_ID} .field:last-child{margin-bottom:0}
#${ROOT_ID} .field label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--cco-text-tertiary);margin-bottom:8px}
#${ROOT_ID} .field input{width:100%;padding:10px 13px;border-radius:11px;border:1px solid rgba(132,117,107,.28);background:white;font-family:inherit;font-size:13px;color:var(--cco-color-brand);outline:none}
#${ROOT_ID} .field input:focus{border-color:var(--accent-studio);box-shadow:0 0 0 3px rgba(187,71,121,.12)}
#${ROOT_ID} .signature-fields{margin-top:0}
#${ROOT_ID} .checks{display:flex;flex-direction:column;gap:12px}
#${ROOT_ID} .check{display:flex;align-items:flex-start;gap:12px;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.6);cursor:pointer;border:1px solid transparent}
#${ROOT_ID} .check:hover{border-color:rgba(187,71,121,.22)}
#${ROOT_ID} .check input{flex-shrink:0;margin-top:3px}
#${ROOT_ID} .check span{font-size:13px;line-height:1.5;color:var(--cco-color-brand)}
#${ROOT_ID} .actions{display:flex;gap:10px;margin-top:24px;flex-wrap:wrap}
#${ROOT_ID} .btn{flex:1;min-width:170px;padding:13px;border-radius:14px;border:none;font-size:12.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;cursor:pointer}
#${ROOT_ID} .btn-primary{background:linear-gradient(135deg,var(--accent-studio),#9e3a68);color:white;box-shadow:0 12px 28px rgba(187,71,121,.28)}
#${ROOT_ID} .btn-primary:hover:not(:disabled){transform:translateY(-1px)}
#${ROOT_ID} .btn-primary:disabled{opacity:.55;cursor:not-allowed;transform:none}
#${ROOT_ID} .btn-ghost{background:transparent;border:1px solid rgba(132,117,107,.28);color:var(--cco-text-secondary)}
#${ROOT_ID} .status{margin-top:12px;padding:11px 14px;border-radius:11px;font-size:12px;display:none}
#${ROOT_ID} .status.show{display:block}
#${ROOT_ID} .status.success{background:var(--cco-status-success-bg);color:var(--cco-status-success)}
#${ROOT_ID} .status.error{background:var(--cco-status-danger-bg);color:var(--cco-status-danger)}
#${ROOT_ID} .status.warning{background:var(--cco-status-warning-bg);color:var(--cco-status-warning)}
#${ROOT_ID} .signed-banner{padding:18px 22px;border-radius:18px;background:linear-gradient(135deg,rgba(74,130,104,.16),rgba(74,130,104,.08));border:1px solid rgba(74,130,104,.32);text-align:center}
#${ROOT_ID} .signed-banner h3{margin:0 0 6px;font-size:16px;color:var(--cco-status-success);font-weight:800}
#${ROOT_ID} .signed-banner p{margin:0;font-size:12.5px;color:var(--cco-text-secondary)}
#${GATE_ID} .gate-panel{padding:22px 26px;border-radius:24px;background:linear-gradient(180deg,var(--panel-shell-top),var(--panel-shell-bottom));box-shadow:var(--panel-shell-shadow);text-align:center}
#${GATE_ID} .gate-panel p{margin:0 0 12px;color:var(--cco-text-secondary);font-size:13px;line-height:1.5}
#${GATE_ID} .gate-panel .btn{margin-top:8px;padding:12px 20px;border-radius:14px;border:1px solid rgba(132,117,107,.28);background:transparent;font:inherit;font-weight:700;cursor:pointer;color:var(--cco-text-secondary)}
`;

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
    style.textContent = STYLE_TEXT;
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
    const ackAgreement = root.querySelector('#ackAgreement')?.checked;
    const ackCooling = root.querySelector('#ackCooling')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    signBtn.disabled = !(ackAgreement && ackCooling && name && pnr);
  }

  function buildFormHtml(context) {
    return `
  <div class="wrap">
    <header class="head">
      <div class="kicker">★ Steg 7 · Avtal + samtycke</div>
      <h1>Avtal + Samtycke | TP · Hair TP Clinic</h1>
      <p>Signera behandlingsavtal och särskilt samtycke till behandling inom ångerfrist i samma steg. Båda dokumenten låses i journalen tillsammans.</p>
    </header>

    <section class="panel" id="steg7FormPanel">
      <div class="legal">
        <strong>Vad signerar du?</strong> Behandlingsavtal (${CONSENT_AGREEMENT.apiId}) och begäran om behandling under ångerfrist (${CONSENT_COOLING.apiId}). En journalpost skapas med båda samtycken.
      </div>

      <p class="doc-meta">${escapeHtml(context.offerLabel)}</p>

      <section class="section-block section-block--docs" aria-label="Dokument att signera">
        <div class="section-block__head">Dokument att signera</div>
        <div class="section-block__body">
      <div class="bundle-panels">
        <article class="bundle-panel" data-consent-id="${CONSENT_AGREEMENT.apiId}">
          <h3>${escapeHtml(CONSENT_AGREEMENT.title)}</h3>
          <div class="doc-scroll">${AGREEMENT_BODY}</div>
          <label class="check">
            <input type="checkbox" id="ackAgreement" />
            <span>Jag har läst behandlingsavtalet och godkänner villkoren.</span>
          </label>
        </article>
        <article class="bundle-panel" data-consent-id="${CONSENT_COOLING.apiId}">
          <h3>${escapeHtml(CONSENT_COOLING.title)}</h3>
          <div class="doc-scroll">${COOLING_BODY}</div>
          <label class="check">
            <input type="checkbox" id="ackCooling" />
            <span>Jag begär att behandling/bokning påbörjas innan ångerfristen löpt ut och lämnar särskilt samtycke.</span>
          </label>
        </article>
      </div>
        </div>
      </section>

      <section class="section-block section-block--sign" aria-label="Signering">
        <div class="section-block__head">Signering</div>
        <div class="section-block__body signature-fields">
      <div class="field">
        <label for="patientName">Ditt namn</label>
        <input type="text" id="patientName" autocomplete="name" value="${escapeHtml(context.patientName)}" placeholder="För- och efternamn" />
      </div>
      <div class="field">
        <label for="patientId">Personnummer (ÅÅÅÅMMDD-XXXX)</label>
        <input type="text" id="patientId" autocomplete="off" value="${escapeHtml(context.personnummer)}" placeholder="19800101-1234" pattern="\\d{8}-?\\d{4}" />
      </div>
      </div>
      </section>

      <div class="actions">
        <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
        <button class="btn btn-primary" type="button" id="signBothBtn" disabled>✍ Signera båda</button>
      </div>

      <div class="status" id="steg7Status" role="status" aria-live="polite"></div>
    </section>

    <section class="panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Avtal och samtycke signerat och låst</h3>
        <p>Båda dokumenten är registrerade i Hair TP:s journal-system. Du kan stänga sidan — kliniken har fått besked.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--cco-text-tertiary)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;
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
    const signatures = [CONSENT_AGREEMENT, CONSENT_COOLING].map((consent) => ({
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
        consentIds: [CONSENT_AGREEMENT.apiId, CONSENT_COOLING.apiId],
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
    const signedPanel = root.querySelector('#signedPanel');
    const signedEntryId = root.querySelector('#signedEntryId');
    if (formPanel) formPanel.style.display = 'none';
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

    const ackAgreement = root.querySelector('#ackAgreement')?.checked;
    const ackCooling = root.querySelector('#ackCooling')?.checked;
    const name = root.querySelector('#patientName')?.value.trim();
    const pnr = root.querySelector('#patientId')?.value.trim();
    if (!ackAgreement || !ackCooling) {
      setOverlayStatus(root, '⚠ Markera båda samtyckesrutorna innan signering.', 'error');
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
    ['#ackAgreement', '#ackCooling', '#patientName', '#patientId'].forEach((sel) => {
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
          <header class="head">
            <div class="kicker">★ Steg 7 · legal_review</div>
            <h1>Avtal väntar juridisk granskning</h1>
            <p>Behandlingsavtalet och ångerfristsamtycket kan inte signeras förrän mall-versionen är godkänd av juridik.</p>
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

  function mount(options = {}) {
    mountOptions = { ...options };
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);

    const context = readContext(options);
    global.currentPatientCard = {
      id: context.patientId || options.patientId || '',
      displayName: context.patientName,
      personnummer: context.personnummer,
      legalReviewApproved: resolveLegalReviewApproved(options),
    };

    if (!resolveLegalReviewApproved(options)) {
      showLegalGate(context);
      return null;
    }

    ensureStyles();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'demo-scrim';
    root.setAttribute('role', 'presentation');
    root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Avtal + samtycke · steg 7">
        <div class="demo-header-context">
          <span>📄 <strong>Bundle:</strong> ${CONSENT_AGREEMENT.apiId} + ${CONSENT_COOLING.apiId}</span>
          <span>👤 ${escapeHtml(context.patientName)}</span>
        </div>
        ${buildFormHtml(context)}
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
    CONSENT_AGREEMENT,
    CONSENT_COOLING,
    CACHE_BUST,
  };
})(typeof window !== 'undefined' ? window : global);
