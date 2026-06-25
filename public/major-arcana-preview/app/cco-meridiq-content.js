/**
 * Meridiq content loader + HTML builders for steg 7/8/9 preview overlays.
 * source: public/major-arcana-preview/data/meridiq-step789-content.json (generated)
 */
(function (global) {
  'use strict';

  const CONTENT_URL = '/major-arcana-preview/data/meridiq-step789-content.json';
  const FULL_DOCUMENT_BUNDLE_URL = '/major-arcana-preview/data/hairtp-document-content-bundle.json';
  let loadPromise = null;
  let fullBundlePromise = null;
  let cachedContent = null;
  let cachedFullBundle = null;

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

  function fieldDomId(meridiqId) {
    return `f${meridiqId}`;
  }

  function interpolateFacitHtml(template, context) {
    let html = String(template ?? '');
    html = html.replace(/\{\{patientName\}\}/g, escapeHtml(context.patientName || ''));
    html = html.replace(/\{\{personnummer\}\}/g, escapeHtml(context.personnummer || ''));
    html = html.replace(/\{\{offerLabel\}\}/g, escapeHtml(context.offerLabel || ''));
    html = html.replace(
      /\{\{#personnummer\}\}(.*?)\{\{\/personnummer\}\}/gs,
      context.personnummer ? `, ${escapeHtml(context.personnummer)}` : ''
    );
    html = html.replace(
      /\{\{#offerLabel\}\}(.*?)\{\{\/offerLabel\}\}/gs,
      context.offerLabel ? ` (${escapeHtml(context.offerLabel)})` : ''
    );
    return html;
  }

  function isManualSignatureBlock(block) {
    const html = String(block?.html || '');
    const plain = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (
      /Ort och datum/i.test(plain) ||
      /Namnförtydligande/i.test(plain) ||
      /Namnteckning/i.test(plain) ||
      /^_{3,}/.test(plain)
    );
  }

  function blockToHtml(block, context) {
    if (isManualSignatureBlock(block)) return '';
    const inner = interpolateFacitHtml(block.html, context);
    switch (block.kind) {
      case 'title':
        return `<p class="doc-title"><strong>${inner}</strong></p>`;
      case 'heading':
        return `<p class="doc-heading"><strong>${inner}</strong></p>`;
      case 'text':
      default:
        return `<p class="doc-text">${inner}</p>`;
    }
  }

  function buildSteg7DocumentsHtml(steg7, context) {
    const agreementBanner = global.CcoHairtpDocumentCloud?.buildContentStatusBanner?.(
      steg7.agreementMeta
    );
    const coolingBanner = global.CcoHairtpDocumentCloud?.buildContentStatusBanner?.(
      steg7.coolingMeta
    );
    const agreement = (steg7.agreementBlocks || [])
      .map((block) => blockToHtml(block, context))
      .join('');
    const cooling = (steg7.coolingBlocks || [])
      .map((block) => blockToHtml(block, context))
      .join('');
    return `${agreementBanner || ''}${agreement}<div class="doc-divider" aria-hidden="true"></div>${coolingBanner || ''}${cooling}`;
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

  function renderSelectQuestion(question) {
    const id = fieldDomId(question.id);
    const options = (question.options || [])
      .map((opt) => `<option value="${escapeAttr(opt)}">${escapeHtml(opt)}</option>`)
      .join('');
    return `
      <div class="field mq-field" data-meridiq-id="${question.id}">
        <label class="mq-label" for="${id}">${escapeHtml(question.label)}</label>
        <select id="${id}" class="mq-select">
          <option value="">— Välj ID-handling —</option>
          ${options}
        </select>
      </div>`;
  }

  function renderInputQuestion(question) {
    const id = fieldDomId(question.id);
    return `
      <div class="field mq-field" data-meridiq-id="${question.id}">
        <label class="mq-label" for="${id}">${escapeHtml(question.label)}</label>
        <input type="text" id="${id}" autocomplete="off" placeholder="ID-nummer">
      </div>`;
  }

  function renderCheckboxQuestion(question, cssClass) {
    const id = fieldDomId(question.id);
    const checks = (question.options || [])
      .map(
        (opt, idx) =>
          `<label class="check"><input type="checkbox" name="${id}" value="${escapeAttr(opt)}" data-disease-idx="${idx}" data-attest-idx="${idx}"> <span>${escapeHtml(opt)}</span></label>`
      )
      .join('\n');
    return `
      <div class="mq-field" data-meridiq-id="${question.id}">
        <div class="mq-label">${escapeHtml(question.label)}</div>
        <div class="checks${cssClass ? ` ${cssClass}` : ''}">${checks}</div>
      </div>`;
  }

  function getSteg8Questions(steg8) {
    return steg8?.form?.questions || [];
  }

  function getSteg8Question(steg8, id) {
    return getSteg8Questions(steg8).find((q) => q.id === id) || null;
  }

  function getSteg8YnQuestions(steg8) {
    return getSteg8Questions(steg8).filter(
      (q) =>
        (q.type === 'yes_no' || q.type === 'yes_no_textbox') && q.id !== 451843 && q.id !== 451844
    );
  }

  function getSteg8YnSimple(steg8) {
    return getSteg8Questions(steg8).filter((q) => q.id === 451843 || q.id === 451844);
  }

  function buildSteg7FormHtml(context, content) {
    const steg7 = content.steg7;
    const agreementId = steg7.consents.agreement.apiId;
    const coolingId = steg7.consents.cooling.apiId;
    const flowLabel = steg7.flowLabel ? ` · ${steg7.flowLabel}` : '';
    const offerRegistry = steg7.activeOfferRegistryId || 'offert_tp';
    return `
  <div class="wrap">
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 7${escapeHtml(flowLabel)}</span>
      <h1 class="demo-title">Avtal &amp; Samtycke</h1>
      <p class="demo-subtitle">Signera båda dokumenten tillsammans. Bundle: ${escapeHtml(offerRegistry)} + samtycke_angerratt (${agreementId} + ${coolingId}).</p>
    </header>

    <div class="demo-scroll" id="steg7FormPanel">
      <section class="section-block section-block--docs" aria-label="Dokument att signera" data-consent-ids="${agreementId},${coolingId}">
        <div class="doc-scroll">${buildSteg7DocumentsHtml(steg7, context)}</div>
        <label class="check">
          <input type="checkbox" id="ackBundle" />
          <span>${escapeHtml(steg7.bundleAckLabel)}</span>
        </label>
      </section>

      <section class="section-block section-block--sign" aria-label="Signering">
        <div class="field">
          <label for="patientName">Namn</label>
          <input type="text" id="patientName" autocomplete="name" value="${escapeHtml(context.patientName)}" placeholder="För- och efternamn" />
        </div>
        <div class="field">
          <label for="patientId">Personnummer</label>
          <input type="text" id="patientId" autocomplete="off" value="${escapeHtml(context.personnummer)}" placeholder="ÅÅÅÅMMDD-XXXX" pattern="\\d{8}-?\\d{4}" />
        </div>
      </section>

      <div class="status" id="steg7Status" role="status" aria-live="polite"></div>
    </div>

    <div class="actions">
      <button class="btn btn-ghost" type="button" id="cancelBtn">Avbryt</button>
      <button class="btn btn-primary" type="button" id="signBothBtn" disabled>✍ Signera</button>
    </div>

    <section class="signed-panel" id="signedPanel" hidden>
      <div class="signed-banner">
        <h3>✓ Avtal och samtycke signerat och låst</h3>
        <p>Båda dokumenten är registrerade i Hair TP:s journal-system. Du kan stänga sidan — kliniken har fått besked.</p>
        <p style="margin-top:10px;font-size:11px;color:var(--t3)">
          Entry-ID: <code id="signedEntryId" style="font-family:'SF Mono',ui-monospace,monospace;font-weight:700"></code>
        </p>
      </div>
    </section>
  </div>`;
  }

  function buildSteg8FormHtml(content) {
    const steg8 = content.steg8;
    const formId = steg8.form.apiId;
    const questions = getSteg8Questions(steg8);
    const rendered = questions
      .map((question) => {
        if (question.type === 'select') return renderSelectQuestion(question);
        if (question.type === 'input') return renderInputQuestion(question);
        if (question.type === 'checkbox' && question.id === 450968) {
          return renderCheckboxQuestion(question, '');
        }
        if (question.type === 'checkbox' && question.id === 451845) {
          return renderCheckboxQuestion(question, 'mq-attest');
        }
        if (question.type === 'yes_no' || question.type === 'yes_no_textbox') {
          return ynField(question);
        }
        return '';
      })
      .join('\n');

    const formMetaBanner = global.CcoHairtpDocumentCloud?.buildContentStatusBanner?.(
      steg8.formMeta
    );

    return `
  <div class="wrap">
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 8</span>
      <h1 class="demo-title">${escapeHtml(steg8.form.title)}</h1>
      <p class="demo-subtitle">Signeras på operationsdagen · Hair TP Clinic · Meridiq ${formId}</p>
    </header>

    <div class="demo-scroll" id="steg8FormPanel">
      <section class="section-block" aria-label="Friskförsäkran">
      ${formMetaBanner || ''}
      <div class="legal">${steg8.legalIntro.html}</div>
      ${rendered}
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

  function buildSteg9FormHtml(context, content) {
    const steg9 = content.steg9;
    const bullets = (steg9.scope.bullets || [])
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('');
    const partialBanner = global.CcoHairtpDocumentCloud?.buildContentStatusBanner?.({
      contentStatus: steg9.contentStatus,
      blockers: steg9.blockers,
    });
    const legalBlock =
      steg9.contentStatus === 'FULL' && (steg9.internalText || steg9.publishText)
        ? `
        <div class="doc-legal-stack" aria-label="Samtyckestexter">
          ${
            steg9.internalText
              ? `<div class="doc-legal"><p class="doc-legal__kicker">Internt bruk</p><p class="doc-text">${escapeHtml(steg9.internalText)}</p></div>`
              : ''
          }
          ${
            steg9.publishText
              ? `<div class="doc-legal"><p class="doc-legal__kicker">Publicering</p><p class="doc-text">${escapeHtml(steg9.publishText)}</p></div>`
              : ''
          }
        </div>`
        : '';
    return `
  <div class="wrap">
    <header class="demo-header">
      <span class="demo-kicker">★ Steg 9</span>
      <h1 class="demo-title">${escapeHtml(steg9.document.name)}</h1>
      <p class="demo-subtitle">${escapeHtml(steg9.subtitle)}</p>
    </header>

    <div class="demo-scroll" id="steg9FormPanel">
      <section class="section-block" aria-label="Foto-samtycke">
        ${partialBanner || ''}
        ${legalBlock}
        <p class="scope-note">
          <strong>Scope:</strong> ${escapeHtml(steg9.scope.summary)}
        </p>
        <ul class="scope-list">
          ${bullets}
          <li>Patient: ${escapeHtml(context.patientName)}</li>
        </ul>
        <label class="check">
          <input type="checkbox" id="ackPhotoScope" />
          <span>${escapeHtml(steg9.ackLabel)}</span>
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

  function selectedYn(root, fieldId) {
    const picked = root.querySelector(`input[name="${fieldId}"]:checked`);
    return picked ? picked.value : '';
  }

  function validateSteg8Form(root, content) {
    const steg8 = content.steg8;
    const idQuestion = getSteg8Question(steg8, 450966);
    const idNumberQuestion = getSteg8Question(steg8, 450967);
    const diseaseQuestion = getSteg8Question(steg8, 450968);
    const attestQuestion = getSteg8Question(steg8, 451845);

    if (!root.querySelector(`#${fieldDomId(450966)}`)?.value.trim()) {
      return `Välj ID-handling (Meridiq ${idQuestion?.id || 450966}).`;
    }
    if (!root.querySelector(`#${fieldDomId(450967)}`)?.value.trim()) {
      return `Ange ID-nummer (Meridiq ${idNumberQuestion?.id || 450967}).`;
    }
    if (!root.querySelector(`input[name="${fieldDomId(450968)}"]:checked`)) {
      return `Markera minst ett sjukdomstillstånd eller alternativet inga (Meridiq ${diseaseQuestion?.id || 450968}).`;
    }

    for (const question of getSteg8YnQuestions(steg8)) {
      const fieldId = fieldDomId(question.id);
      const yn = selectedYn(root, fieldId);
      if (!yn) return `Besvara ja/nej för Meridiq ${question.id}.`;
      if (!question.textOn) continue;
      const text = root.querySelector(`#${fieldId}Text`)?.value.trim() || '';
      if (yn === question.textOn && text.length < 2) {
        return `Fyll i textfält när du svarar ${question.textOn === 'yes' ? 'ja' : 'nej'} (Meridiq ${question.id}).`;
      }
    }

    for (const question of getSteg8YnSimple(steg8)) {
      const fieldId = fieldDomId(question.id);
      if (!selectedYn(root, fieldId)) {
        return `Besvara ja/nej för Meridiq ${question.id}.`;
      }
    }

    const attestOptions = attestQuestion?.options || [];
    const attestCount = root.querySelectorAll(`input[name="${fieldDomId(451845)}"]:checked`).length;
    if (attestCount !== attestOptions.length) {
      return 'Alla intygspunkter under Jag intygar att måste markeras (Meridiq 451845).';
    }

    return null;
  }

  function bindSteg8DiseaseExclusivity(root, content) {
    const diseaseQuestion = getSteg8Question(content.steg8, 450968);
    const options = diseaseQuestion?.options || [];
    const fieldName = fieldDomId(450968);
    const boxes = Array.from(root.querySelectorAll(`input[name="${fieldName}"]`));
    const noneIdx = options.length - 1;
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

  async function loadForSteg7(options = {}) {
    const [step789, bundle] = await Promise.all([
      load(options.force),
      global.CcoHairtpDocumentCloud?.ensureDocumentBundle?.() ||
        loadFullDocumentBundle().catch(() => null),
    ]);
    const flow = global.CcoHairtpDocumentCloud?.resolveTreatmentFlow?.(options) || 'tp';
    if (bundle && step789 && global.CcoHairtpDocumentCloud?.resolveSteg7ForFlow) {
      return global.CcoHairtpDocumentCloud.resolveSteg7ForFlow(step789, bundle, flow);
    }
    return step789;
  }

  function mergeSteg8FromBundle(step789, bundle) {
    if (!step789) return step789;
    const hit = bundle ? findDocumentByRegistryId(bundle, 'friskfoers_tp') : null;
    const doc = hit?.document;
    const steg8 = { ...(step789.steg8 || {}) };
    if (!doc) return { ...step789, steg8 };

    steg8.formMeta = {
      registryId: 'friskfoers_tp',
      contentStatus: doc.contentStatus,
      blockers: doc.blockers || [],
      label: doc.label || 'Friskförsäkran | TP',
    };

    const meridiq = doc.meridiq || {};
    const bundleQuestions = asArray(meridiq.questions);
    if (bundleQuestions.length >= 13) {
      steg8.form = {
        ...(steg8.form || {}),
        apiId: meridiq.apiId || meridiq.questionaryApiId || steg8.form?.apiId,
        title: meridiq.title || steg8.form?.title,
        questions: bundleQuestions,
      };
    }

    return { ...step789, steg8 };
  }

  function asArray(value) {
    return Array.isArray(value) ? value : value ? [value] : [];
  }

  async function loadForSteg8(options = {}) {
    const [step789, bundle] = await Promise.all([
      load(options.force),
      global.CcoHairtpDocumentCloud?.ensureDocumentBundle?.() ||
        loadFullDocumentBundle().catch(() => null),
    ]);
    return mergeSteg8FromBundle(step789, bundle);
  }

  async function loadForSteg9(options = {}) {
    const [step789, bundle] = await Promise.all([
      load(options.force),
      global.CcoHairtpDocumentCloud?.ensureDocumentBundle?.() ||
        loadFullDocumentBundle().catch(() => null),
    ]);
    if (!bundle || !step789) return step789;
    const fotoHit = findDocumentByRegistryId(bundle, 'foto_samtycke');
    if (!fotoHit?.document?.content) return step789;
    const fotoContent = fotoHit.document.content;
    return {
      ...step789,
      steg9: {
        ...step789.steg9,
        contentStatus: fotoHit.document.contentStatus,
        blockers: fotoHit.document.blockers || [],
        registryMeta: {
          registryId: 'foto_samtycke',
          contentStatus: fotoHit.document.contentStatus,
          blockers: fotoHit.document.blockers || [],
          label: fotoHit.document.label || 'Foto-samtycke',
        },
        scope: fotoContent.scope
          ? { ...step789.steg9.scope, ...fotoContent.scope }
          : step789.steg9.scope,
        ackLabel: fotoContent.ackLabel || step789.steg9.ackLabel,
        subtitle: fotoContent.subtitle || step789.steg9.subtitle,
        internalText: fotoContent.internalText || '',
        publishText: fotoContent.publishText || '',
      },
    };
  }

  async function preloadForKundkort(force) {
    await Promise.all([
      load(force),
      global.CcoHairtpDocumentCloud?.ensureDocumentBundle?.() ||
        loadFullDocumentBundle(force).catch(() => null),
    ]);
    return {
      content: cachedContent,
      bundle: cachedFullBundle,
    };
  }

  async function load(force) {
    if (cachedContent && !force) return cachedContent;
    if (loadPromise && !force) return loadPromise;

    loadPromise = fetch(CONTENT_URL, { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Meridiq content HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        cachedContent = payload;
        return payload;
      })
      .catch((error) => {
        loadPromise = null;
        throw error;
      });

    return loadPromise;
  }

  function getContent() {
    return cachedContent;
  }

  async function loadFullDocumentBundle(force) {
    if (cachedFullBundle && !force) return cachedFullBundle;
    if (fullBundlePromise && !force) return fullBundlePromise;

    fullBundlePromise = fetch(FULL_DOCUMENT_BUNDLE_URL, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Hair TP document bundle HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        cachedFullBundle = payload;
        if (typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(
            new CustomEvent('cco:hairtp-document-bundle-ready', {
              detail: { cacheVersion: payload.cacheVersion || '' },
            })
          );
        }
        return payload;
      })
      .catch((error) => {
        fullBundlePromise = null;
        throw error;
      });

    return fullBundlePromise;
  }

  function getFullDocumentBundle() {
    return cachedFullBundle;
  }

  function findDocumentByRegistryId(bundle, registryId) {
    if (!bundle || !registryId) return null;
    for (const section of ['customerFilled', 'staffFilled', 'information']) {
      const hit = (bundle[section] || []).find((doc) => doc.registryId === registryId);
      if (hit) return { section, document: hit };
    }
    return null;
  }

  global.CcoMeridiqContent = {
    load,
    loadForSteg7,
    loadForSteg8,
    mergeSteg8FromBundle,
    loadForSteg9,
    preloadForKundkort,
    getContent,
    loadFullDocumentBundle,
    getFullDocumentBundle,
    findDocumentByRegistryId,
    buildSteg7FormHtml,
    buildSteg7DocumentsHtml,
    buildSteg8FormHtml,
    buildSteg9FormHtml,
    validateSteg8Form,
    bindSteg8DiseaseExclusivity,
    getSteg8YnQuestions,
    getSteg8Questions,
    fieldDomId,
    escapeHtml,
    escapeAttr,
  };
})(typeof window !== 'undefined' ? window : global);
