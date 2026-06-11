/**
 * Steg 8 — Friskförsäkran demo-overlay (operationsdagen).
 *
 * Content registry:
 *   source: migration/meridiq/questionary-catalog.json — apiId 16413 (fitness_certificate | TP)
 *   source: public/friskforsakran.html — portal header + legal intro (ej formulärfrågor)
 *   source: new — demo modal chrome (scrim, context-header, validation copy, demo sign)
 */
(function (global) {
  'use strict';

  const ROOT_ID = 'cco-ff-demo-scrim';
  const STYLE_ID = 'cco-ff-demo-styles';
  const DISMISS_KEY = 'arcana.ffdemo.dismissed';
  const MERIDIQ_FORM_ID = 16413;

  // source: migration/meridiq/questionary-catalog.json — apiId 16413, question 450968
  const DISEASE_OPTIONS = [
    'Blödningsrubbning',
    'Hjärt- eller kärlsjukdom',
    'Diabetes (typ 1 eller typ 2)',
    'Lever- eller njursjukdom',
    'Astma',
    'Epilepsi',
    'Hepatit (A, B eller C)',
    'HIV',
    'Psykisk ohälsa',
    'Pågående infektion eller feber',
    'Jag har inga av ovanstående sjukdomar eller tillstånd.',
  ];

  // source: migration/meridiq/questionary-catalog.json — question 451845
  const ATTESTATION_OPTIONS = [
    'Jag intygar att jag, såvitt jag vet, är vid god hälsa och inte har undanhållit någon sjukdom, något tillstånd eller annan information som kan vara av betydelse inför behandlingen.',
    'Jag intygar att jag har uppgett samtliga läkemedel, både receptbelagda och receptfria, som jag tar eller har tagit under de senaste 6 månaderna.',
    'Jag intygar att jag inte har intagit alkohol eller narkotiska preparat under de senaste 48 timmarna före behandlingen och att jag avstår från detta i minst 48 timmar efter ingreppet.',
    'Jag är medveten om att rökning och användning av tobak eller nikotin kan påverka behandlingsresultatet negativt och öka risken för att transplanterade hårsäckar inte överlever. Jag förstår att Hair TP Clinic därför inte kan lämna några resultatgarantier för patienter som använder tobak eller nikotin.',
    'Jag har tagit del av muntlig och skriftlig information om behandlingen, dess syfte, risker, möjliga alternativ och eftervård.',
    'Jag har haft möjlighet att ställa frågor och fått dessa besvarade.',
    'Jag lämnar härmed mitt informerade samtycke till behandlingen.',
    'Jag intygar att ovanstående uppgifter är korrekta och fullständiga.',
    'Jag godkänner denna friskförsäkran.',
  ];

  // source: migration/meridiq/questionary-catalog.json — question 450966
  const ID_TYPE_OPTIONS = [
    'Pass',
    'Nationellt ID-kort (utfärdat av Polisen)',
    'Svenskt körkort (utfärdat av Transportstyrelsen)',
    'Svenskt ID-kort (utfärdat av Skatteverket)',
  ];

  // source: migration/meridiq/questionary-catalog.json — apiId 16413 (labels verbatim)
  const MERIDIQ_YN_QUESTIONS = [
    {
      id: 450969,
      meridiqType: 'yes_no_textbox',
      label:
        'Har du någon annan sjukdom eller något annat medicinskt tillstånd som inte nämnts ovan?  Om ja, beskriv vilket/vilka.',
      textOn: 'yes',
    },
    {
      id: 450970,
      meridiqType: 'yes_no_textbox',
      label:
        'Upplever du att du, så vitt du vet, är vid god hälsa och saknar sjukdomar eller tillstånd som kan innebära ökade risker vid behandlingen?',
      textOn: 'no',
    },
    {
      id: 450971,
      meridiqType: 'yes_no_textbox',
      label:
        'Tar du för närvarande, eller har du under de senaste 6 månaderna tagit, blodförtunnande läkemedel (t.ex. Warfarin, NOAK eller ASA)? Om ja, ange vilket/vilka:',
      textOn: 'yes',
    },
    {
      id: 450972,
      meridiqType: 'yes_no',
      label:
        'Tar du för närvarande, eller har du under de senaste 6 månaderna tagit, några läkemedel? Om ja, ange läkemedlets namn, dosering och orsak:',
      textOn: 'yes',
    },
    {
      id: 450973,
      meridiqType: 'yes_no_textbox',
      label:
        'Har du några kända allergier, till exempel mot latex, desinfektionsmedel eller födoämnen? Om ja ange vad/vilka eller läkemedlets namn',
      textOn: 'yes',
    },
    {
      id: 450974,
      meridiqType: 'yes_no_textbox',
      label:
        'Har du några kända allergier mot läkemedel ex antibiotika eller lokalbedövning? Om ja ange vad/vilka eller läkemedlets namn',
      textOn: 'yes',
    },
    {
      id: 450975,
      meridiqType: 'yes_no_textbox',
      label: 'Har du tidigare fått komplikation vid narkos eller lokalbedövning?',
      textOn: 'yes',
    },
  ];

  const MERIDIQ_YN_SIMPLE = [
    {
      id: 451843,
      meridiqType: 'yes_no',
      label: 'Använder du tobak- eller nikotinprodukter (t.ex. cigaretter, snus, vape)?',
    },
    {
      id: 451844,
      meridiqType: 'yes_no',
      label:
        'Har du intagit alkohol eller narkotiska preparat under de senaste 48 timmarna före behandlingen?',
    },
  ];

  function fieldDomId(meridiqId) {
    return `f${meridiqId}`;
  }

  function ynField(question) {
    const id = fieldDomId(question.id);
    const label = escapeHtml(question.label);
    const textBlock =
      question.textOn === 'yes' || question.textOn === 'no'
        ? `
          <div class="field mq-follow" id="${id}TextWrap">
            <textarea id="${id}Text" rows="3" aria-label="${label.replace(/"/g, '&quot;')}" placeholder=""></textarea>
          </div>`
        : '';
    return `
        <div class="mq-field" data-meridiq-id="${question.id}" data-meridiq-type="${escapeAttr(question.meridiqType)}">
          <div class="mq-label">${label}</div>
          <div class="yn-toggle-row" role="radiogroup" aria-label="${label.replace(/"/g, '&quot;')}">
            <label class="yn-toggle">
              <input type="radio" name="${id}" value="yes" data-yn="${id}" data-text-on="${question.textOn === 'yes' ? 'yes' : ''}">
              <span class="yn-toggle-box" aria-hidden="true"></span>
              <span>Ja</span>
            </label>
            <label class="yn-toggle">
              <input type="radio" name="${id}" value="no" data-yn="${id}" data-text-on="${question.textOn === 'no' ? 'no' : ''}">
              <span class="yn-toggle-box" aria-hidden="true"></span>
              <span>Nej</span>
            </label>
          </div>
          ${textBlock}
        </div>`;
  }

  function buildFormHtml() {
    const diseaseChecks = DISEASE_OPTIONS.map(
      (opt, idx) =>
        `<label class="check"><input type="checkbox" name="f450968" value="${escapeAttr(opt)}" data-disease-idx="${idx}"> <span>${escapeHtml(opt)}</span></label>`
    ).join('\n');

    const attestationChecks = ATTESTATION_OPTIONS.map(
      (opt, idx) =>
        `<label class="check"><input type="checkbox" name="f451845" value="${escapeAttr(opt)}" data-attest-idx="${idx}"> <span>${escapeHtml(opt)}</span></label>`
    ).join('\n');

    const idTypeOptions = ID_TYPE_OPTIONS.map(
      (opt) => `<option value="${escapeAttr(opt)}">${escapeHtml(opt)}</option>`
    ).join('');

    const ynBlocks = MERIDIQ_YN_QUESTIONS.map((q) => ynField(q)).join('\n');
    const ynSimpleBlocks = MERIDIQ_YN_SIMPLE.map((q) => ynField(q)).join('\n');

    return `
  <div class="wrap">
    <!-- source: public/friskforsakran.html — portal header -->
    <header class="head">
      <div class="kicker">★ Lagkrav · FUE / Hårtransplantation</div>
      <h1>Friskförsäkran | TP</h1>
      <p>Måste signeras senast 48 timmar innan din behandling. Detta är ett FUE-krav i Sverige (Patientdatalagen 2008:355).</p>
    </header>

    <section class="panel">
      <!-- source: public/friskforsakran.html — juridisk intro -->
      <div class="legal">
        <strong>Vad signerar du?</strong> Att du bekräftar dina svar nedan stämmer, att du varit ärlig om hälsotillstånd, mediciner och allergier, och att informationen får sparas i din patientjournal hos Hair TP Clinic i 10 år enligt journallagen.
      </div>

      <p class="mq-source">Meridiq formulär ${MERIDIQ_FORM_ID} · Friskförsäkran | TP</p>

      <!-- source: migration/meridiq/questionary-catalog.json — 450966 -->
      <div class="field mq-field" data-meridiq-id="450966">
        <label class="mq-label" for="f450966">Jag har visat följande giltiga ID-handling för klinikens personal:</label>
        <select id="f450966" class="mq-select">
          <option value="">— Välj ID-handling —</option>
          ${idTypeOptions}
        </select>
      </div>

      <!-- source: migration/meridiq/questionary-catalog.json — 450967 -->
      <div class="field mq-field" data-meridiq-id="450967">
        <label class="mq-label" for="f450967">Ange ID-nummer</label>
        <input type="text" id="f450967" autocomplete="off" placeholder="ID-nummer">
      </div>

      <!-- source: migration/meridiq/questionary-catalog.json — 450968 -->
      <div class="mq-field" data-meridiq-id="450968">
        <div class="mq-label">Har du något av följande sjukdomstillstånd? Du kan markera flera alternativ.</div>
        <div class="checks">${diseaseChecks}</div>
      </div>

      ${ynBlocks}
      ${ynSimpleBlocks}

      <!-- source: migration/meridiq/questionary-catalog.json — 451845 -->
      <div class="mq-field" data-meridiq-id="451845">
        <div class="mq-label">Jag intygar att</div>
        <div class="checks mq-attest">${attestationChecks}</div>
      </div>

      <div class="actions">
        <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
        <button class="btn btn-primary" type="button" id="signBtn">✍ Signera friskförsäkran</button>
      </div>

      <div class="status" id="status" role="status" aria-live="polite"></div>
    </section>

    <!-- source: public/friskforsakran.html — signerad panel -->
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
  }

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
#${ROOT_ID} .legal{padding:14px 16px;border-radius:14px;background:rgba(74,123,168,.08);border:1px solid rgba(74,123,168,.22);font-size:11.5px;color:var(--cco-status-info);line-height:1.5;margin-bottom:14px}
#${ROOT_ID} .mq-source{margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cco-text-tertiary)}
#${ROOT_ID} .mq-field{margin-bottom:18px}
#${ROOT_ID} .mq-label{display:block;font-size:13px;font-weight:600;line-height:1.45;color:var(--cco-color-brand);margin-bottom:8px}
#${ROOT_ID} .field{margin-bottom:14px}
#${ROOT_ID} .field label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--cco-text-tertiary);margin-bottom:5px}
#${ROOT_ID} .field input,#${ROOT_ID} .field textarea,#${ROOT_ID} .mq-select{width:100%;padding:10px 13px;border-radius:11px;border:1px solid rgba(132,117,107,.28);background:white;font-family:inherit;font-size:13px;color:var(--cco-color-brand);outline:none}
#${ROOT_ID} .field input:focus,#${ROOT_ID} .field textarea:focus,#${ROOT_ID} .mq-select:focus{border-color:var(--accent-studio);box-shadow:0 0 0 3px rgba(187,71,121,.12)}
#${ROOT_ID} .field textarea,#${ROOT_ID} .mq-follow textarea{min-height:72px;resize:vertical}
#${ROOT_ID} .mq-follow{margin-top:10px;margin-bottom:0}
#${ROOT_ID} .mq-follow.is-inactive textarea{opacity:.72;background:rgba(255,255,255,.55)}
#${ROOT_ID} .mq-follow.is-active textarea{border-color:rgba(187,71,121,.45);box-shadow:0 0 0 2px rgba(187,71,121,.08)}
#${ROOT_ID} .checks{display:flex;flex-direction:column;gap:8px}
#${ROOT_ID} .mq-attest .check span{font-size:11.5px}
#${ROOT_ID} .check{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:11px;background:rgba(255,255,255,.6);cursor:pointer;border:1px solid transparent}
#${ROOT_ID} .check:hover{border-color:rgba(187,71,121,.22)}
#${ROOT_ID} .check input{flex-shrink:0;margin-top:2px}
#${ROOT_ID} .check span{font-size:12px;line-height:1.45;color:var(--cco-color-brand)}
#${ROOT_ID} .yn-toggle-row{display:flex;gap:12px;margin-bottom:4px;flex-wrap:wrap}
#${ROOT_ID} .yn-toggle{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--cco-color-brand);cursor:pointer;user-select:none}
#${ROOT_ID} .yn-toggle input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
#${ROOT_ID} .yn-toggle-box{width:18px;height:18px;border-radius:5px;border:1.5px solid rgba(132,117,107,.45);background:rgba(255,255,255,.85);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s,background .15s,box-shadow .15s}
#${ROOT_ID} .yn-toggle input:checked+.yn-toggle-box{border-color:var(--accent-studio);background:rgba(187,71,121,.12);box-shadow:inset 0 0 0 1px rgba(187,71,121,.25)}
#${ROOT_ID} .yn-toggle input:checked+.yn-toggle-box::after{content:"";width:10px;height:10px;border-radius:3px;background:var(--accent-studio)}
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
  let formHtmlCache = '';

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
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
  }

  function setOverlayStatus(root, msg, kind) {
    const status = root.querySelector('#status');
    if (!status) return;
    status.textContent = msg;
    status.className = 'status show ' + (kind || '');
  }

  function selectedYn(root, fieldId) {
    const picked = root.querySelector(`input[name="${fieldId}"]:checked`);
    return picked ? picked.value : '';
  }

  function findYnQuestion(meridiqId) {
    return (
      MERIDIQ_YN_QUESTIONS.find((q) => q.id === meridiqId) ||
      MERIDIQ_YN_SIMPLE.find((q) => q.id === meridiqId)
    );
  }

  // source: new — demo-validering enligt Meridiq 16413 required-fält
  function validateMeridiqForm(root) {
    if (!root.querySelector('#f450966')?.value.trim()) {
      return 'Välj ID-handling (Meridiq 450966).';
    }
    if (!root.querySelector('#f450967')?.value.trim()) {
      return 'Ange ID-nummer (Meridiq 450967).';
    }
    if (!root.querySelector('input[name="f450968"]:checked')) {
      return 'Markera minst ett sjukdomstillstånd eller alternativet inga (Meridiq 450968).';
    }

    for (const question of MERIDIQ_YN_QUESTIONS) {
      const fieldId = fieldDomId(question.id);
      const yn = selectedYn(root, fieldId);
      if (!yn) return `Besvara ja/nej för Meridiq ${question.id}.`;
      if (!question.textOn) continue;
      const text = root.querySelector(`#${fieldId}Text`)?.value.trim() || '';
      if (yn === question.textOn && text.length < 2) {
        return `Fyll i textfält när du svarar ${question.textOn === 'yes' ? 'ja' : 'nej'} (Meridiq ${question.id}).`;
      }
    }

    for (const question of MERIDIQ_YN_SIMPLE) {
      const fieldId = fieldDomId(question.id);
      if (!selectedYn(root, fieldId)) {
        return `Besvara ja/nej för Meridiq ${question.id}.`;
      }
    }

    const attestCount = root.querySelectorAll('input[name="f451845"]:checked').length;
    if (attestCount !== ATTESTATION_OPTIONS.length) {
      return 'Alla intygspunkter under Jag intygar att måste markeras (Meridiq 451845).';
    }

    return null;
  }

  function syncYnTextarea(root, fieldId) {
    const wrap = root.querySelector(`#${fieldId}TextWrap`);
    if (!wrap) return;
    const meridiqId = Number(fieldId.replace(/^f/, ''));
    const question = findYnQuestion(meridiqId);
    if (!question?.textOn) return;
    const yn = selectedYn(root, fieldId);
    const active = yn === question.textOn;
    wrap.classList.toggle('is-active', active);
    wrap.classList.toggle('is-inactive', !active);
  }

  function bindYnFields(root) {
    MERIDIQ_YN_QUESTIONS.forEach((question) => {
      if (!question.textOn) return;
      syncYnTextarea(root, fieldDomId(question.id));
    });
    root.querySelectorAll('input[data-yn]').forEach((radio) => {
      radio.addEventListener('change', () => {
        syncYnTextarea(root, radio.getAttribute('data-yn'));
      });
    });
  }

  function bindDiseaseExclusivity(root) {
    const boxes = Array.from(root.querySelectorAll('input[name="f450968"]'));
    const noneIdx = DISEASE_OPTIONS.length - 1;
    boxes.forEach((box) => {
      box.addEventListener('change', () => {
        const idx = Number(box.dataset.diseaseIdx);
        if (!box.checked) return;
        if (idx === noneIdx) {
          boxes.forEach((other) => {
            if (other !== box) other.checked = false;
          });
          return;
        }
        const noneBox = boxes.find((b) => Number(b.dataset.diseaseIdx) === noneIdx);
        if (noneBox) noneBox.checked = false;
      });
    });
  }

  function demoSign(root) {
    const signBtn = root.querySelector('#signBtn');
    const panel = root.querySelector('.panel');
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
    if (panel) panel.style.display = 'none';
    if (signedPanel) signedPanel.hidden = false;
  }

  function bindOverlay(root) {
    bindYnFields(root);
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
    if (document.getElementById(ROOT_ID)) return document.getElementById(ROOT_ID);
    ensureStyles();
    if (!formHtmlCache) formHtmlCache = buildFormHtml();
    const context = readContext(options);
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'demo-scrim';
    root.setAttribute('role', 'presentation');
    root.innerHTML = `
      <div class="demo-modal" role="dialog" aria-modal="true" aria-label="Friskförsäkran · Meridiq ${MERIDIQ_FORM_ID}">
        <!-- source: new -->
        <div class="demo-header-context">
          <span>📅 <strong>Operationsdag:</strong> ${escapeHtml(context.operationLabel)}</span>
          <span>👤 ${escapeHtml(context.patientName)}</span>
        </div>
        ${formHtmlCache}
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
    MERIDIQ_YN_QUESTIONS,
  };
})(typeof window !== 'undefined' ? window : global);
