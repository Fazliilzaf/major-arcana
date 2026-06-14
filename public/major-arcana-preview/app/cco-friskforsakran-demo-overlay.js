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
  const CACHE_BUST = global.CcoStepModalDesign?.CACHE_BUST || 'hairtp-step789-kundkort-v2';

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
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 8</span>
      <h1 class="demo-title">Friskförsäkran | TP</h1>
      <p class="demo-subtitle">Signeras på operationsdagen · Hair TP Clinic · Meridiq ${MERIDIQ_FORM_ID}</p>
    </header>

    <div class="demo-scroll" id="steg8FormPanel">
      <section class="section-block" aria-label="Friskförsäkran">
      <div class="legal">
        <strong>Vad signerar du?</strong> Att du bekräftar dina svar nedan stämmer, att du varit ärlig om hälsotillstånd, mediciner och allergier, och att informationen får sparas i din patientjournal hos Hair TP Clinic i 10 år enligt journallagen.
      </div>

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

      <div class="status" id="status" role="status" aria-live="polite"></div>
      </section>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
      <button class="btn btn-primary" type="button" id="signBtn">✍ Signera</button>
    </div>

    <section class="signed-panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Signerad och låst</h3>
        <p>Din friskförsäkran är registrerad i Hair TP:s journal-system. Du kan stänga sidan — kliniken har fått besked.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--t3)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;
  }

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
    style.textContent = buildStyleText();
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
    MERIDIQ_YN_QUESTIONS,
  };
})(typeof window !== 'undefined' ? window : global);
