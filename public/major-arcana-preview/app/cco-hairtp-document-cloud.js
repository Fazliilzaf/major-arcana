/**
 * Cloud Agent — Hair TP document bundle wiring (Fas 0–3).
 * Reads hairtp-document-content-bundle.json — never writes patient text.
 */
(function (global) {
  'use strict';

  const STEG7_OFFER_BY_FLOW = Object.freeze({
    tp: 'offert_tp',
    prp_hair: 'offert_prp_hair',
    prp_skin: 'offert_prp_skin',
    microneedling: 'offert_microneedling',
    prf: 'offert_prf',
    profhilo: 'offert_profilo',
  });

  const FLOW_LABELS = Object.freeze({
    tp: 'TP',
    prp_hair: 'PRP hår',
    prp_skin: 'PRP hud',
    microneedling: 'Microneedling',
    prf: 'PRF',
    profhilo: 'Profhilo',
  });

  const V11_FLOW_LABELS = FLOW_LABELS;

  const POST8_JOURNAL_REGISTRY_IDS = Object.freeze([
    'journal_tp_post_prp',
    'journal_tp_follow_4',
    'journal_tp_follow_6',
    'journal_tp_follow_12',
  ]);

  const STAFF_JOURNAL_REGISTRY_IDS = Object.freeze(['journal_tp', 'journal_prp_multi']);

  const STAFF_PREVIEW_REGISTRY_IDS = Object.freeze([
    'ordination_tp',
    'ordination_recept',
    'fore_efter_bildmall',
    'konsultationsmall',
  ]);

  const STAFF_JOURNAL_BY_FLOW = Object.freeze({
    tp: 'journal_tp',
    prp_hair: 'journal_prp_multi',
    prp_skin: 'journal_prp_multi',
    microneedling: 'journal_prp_multi',
    prf: 'journal_prp_multi',
    profhilo: 'journal_prp_multi',
  });

  const STAFF_JOURNAL_PATIENT_ACTION = Object.freeze({
    journal_tp: 'new-tp-journal',
    journal_prp_multi: 'new-prp-journal',
  });

  const PREVIEW_ROOT_ID = 'cco-auto-doc-preview-scrim';
  let previewEscapeHandler = null;
  let autoDocPreviewRowsBound = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function asArray(value) {
    return Array.isArray(value) ? value : value ? [value] : [];
  }

  function findDoc(bundle, registryId) {
    return global.CcoMeridiqContent?.findDocumentByRegistryId?.(bundle, registryId) || null;
  }

  function isAutoDocRegistryId(registryId) {
    return /^auto_/.test(String(registryId || ''));
  }

  function isAutoDocRow(row) {
    if (!row || typeof row !== 'object') return false;
    return row.filler === 'auto' || isAutoDocRegistryId(row.registryId);
  }

  async function ensureDocumentBundle() {
    const existing = global.CcoMeridiqContent?.getFullDocumentBundle?.();
    if (existing) return existing;
    if (global.CcoMeridiqContent?.loadFullDocumentBundle) {
      return global.CcoMeridiqContent.loadFullDocumentBundle().catch(() => null);
    }
    if (global.CcoMeridiqContent?.preloadForKundkort) {
      await global.CcoMeridiqContent.preloadForKundkort().catch(() => null);
    }
    return global.CcoMeridiqContent?.getFullDocumentBundle?.() || null;
  }

  function buildContentStatusBanner(meta) {
    if (!meta || meta.contentStatus === 'FULL') return '';
    const blockers = asArray(meta.blockers).filter(Boolean);
    return `<p class="doc-partial-banner" role="status">Innehåll ${escapeHtml(meta.contentStatus)} — ${escapeHtml(blockers[0] || 'SharePoint-import pågår')}</p>`;
  }

  function resolveSteg7ForFlow(step789Content, bundle, flow) {
    const base = step789Content || {};
    const offerRegistryId = STEG7_OFFER_BY_FLOW[flow] || STEG7_OFFER_BY_FLOW.tp;
    const offerHit = bundle ? findDoc(bundle, offerRegistryId) : null;
    const coolingHit = bundle ? findDoc(bundle, 'samtycke_angerratt') : null;
    const steg7 = { ...(base.steg7 || {}) };

    if (offerHit?.document?.content?.agreementBlocks?.length) {
      steg7.agreementBlocks = offerHit.document.content.agreementBlocks;
      if (offerHit.document.content.bundleAckLabel) {
        steg7.bundleAckLabel = offerHit.document.content.bundleAckLabel;
      }
      steg7.agreementMeta = {
        registryId: offerRegistryId,
        contentStatus: offerHit.document.contentStatus,
        blockers: offerHit.document.blockers || [],
        label: offerHit.document.label || offerRegistryId,
      };
    }
    if (coolingHit?.document?.content?.agreementBlocks?.length) {
      steg7.coolingBlocks = coolingHit.document.content.agreementBlocks;
      steg7.coolingMeta = {
        registryId: 'samtycke_angerratt',
        contentStatus: coolingHit.document.contentStatus,
        blockers: coolingHit.document.blockers || [],
        label: coolingHit.document.label || 'Ångerfrist',
      };
    }

    steg7.activeFlow = flow || 'tp';
    steg7.activeOfferRegistryId = offerRegistryId;
    steg7.flowLabel = FLOW_LABELS[flow] || FLOW_LABELS.tp;
    return { ...base, steg7 };
  }

  function resolveV11DocGroup(doc) {
    if (!doc || typeof doc !== 'object') return 'healthForms';
    if (doc.filler === 'system_auto') return 'autoDocs';
    if (doc.filler === 'staff') return 'journals';
    if (doc.category === 'commit' || /^offert_/.test(String(doc.registryId || ''))) {
      return 'offers';
    }
    return 'healthForms';
  }

  function isPost8JournalRegistryId(registryId) {
    return POST8_JOURNAL_REGISTRY_IDS.includes(String(registryId || ''));
  }

  function isStaffJournalRegistryId(registryId) {
    return STAFF_JOURNAL_REGISTRY_IDS.includes(String(registryId || ''));
  }

  function isStaffPreviewRegistryId(registryId) {
    return STAFF_PREVIEW_REGISTRY_IDS.includes(String(registryId || ''));
  }

  function isSteg8RegistryId(registryId) {
    return String(registryId || '') === 'friskfoers_tp';
  }

  function isSteg9RegistryId(registryId) {
    return String(registryId || '') === 'foto_samtycke';
  }

  function isInteractiveRegistryId(registryId) {
    return (
      isAutoDocRegistryId(registryId) ||
      /^offert_/.test(String(registryId || '')) ||
      isSteg8RegistryId(registryId) ||
      isSteg9RegistryId(registryId) ||
      isStaffJournalRegistryId(registryId) ||
      isStaffPreviewRegistryId(registryId)
    );
  }

  function resolveStaffJournalRegistryId(flow) {
    return STAFF_JOURNAL_BY_FLOW[flow] || STAFF_JOURNAL_BY_FLOW.tp;
  }

  function resolveStaffJournalPatientAction(registryId) {
    return STAFF_JOURNAL_PATIENT_ACTION[registryId] || 'new-tp-journal';
  }

  function listPost8JournalDocs(bundle) {
    return POST8_JOURNAL_REGISTRY_IDS.map((registryId) => findDoc(bundle, registryId))
      .filter(Boolean)
      .map((hit) => hit.document);
  }

  function daysUntilIso(iso) {
    if (!iso) return null;
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) return null;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    return Math.round((end - start) / 86400000);
  }

  function isOpDayContext(card) {
    if (!card) return false;
    try {
      if (new URLSearchParams(global.location.search || '').get('demoOpDay') === '1') return true;
    } catch {
      /* ignore */
    }
    if (card.missingFitnessCertificate && card.hasUpcomingBooking) return true;
    const days = daysUntilIso(card.nextBookingAt);
    if (card.hasUpcomingBooking && days !== null && days >= 0 && days <= 1) return true;
    return false;
  }

  function dispatchCloudStaffAction(detail) {
    if (typeof global.dispatchEvent !== 'function') return false;
    global.dispatchEvent(new CustomEvent('cco:cloud-staff-action', { detail: detail || {} }));
    return true;
  }

  function openPatientDocumentLive(registryId, options = {}) {
    const live = global.CcoPatientDocumentLive;
    if (!live?.open) return false;
    const id = String(registryId || '').trim();
    if (!id) return false;
    const opts = {
      ...options,
      patientId: options.patientId || global.currentPatientCard?.patientId,
    };
    if (id.startsWith('offert_')) {
      opts.phase = opts.phase || opts.journeyStep || 7;
    }
    return live.open(id, opts);
  }

  function openSteg8Friskforsakran(options = {}) {
    if (openPatientDocumentLive('friskfoers_tp', options)) return Promise.resolve(true);
    if (global.CcoFriskforsakranDemoOverlay?.mount) {
      return global.CcoFriskforsakranDemoOverlay.mount(options);
    }
    return Promise.resolve(dispatchCloudStaffAction({ kind: 'steg8', ...options }));
  }

  function openSteg9FotoSamtycke(options = {}) {
    if (openPatientDocumentLive('foto_samtycke', options)) return Promise.resolve(true);
    if (global.CcoFotoSamtyckeDemoOverlay?.mount) {
      return global.CcoFotoSamtyckeDemoOverlay.mount(options);
    }
    return Promise.resolve(dispatchCloudStaffAction({ kind: 'steg9', ...options }));
  }

  function openStaffJournal(options = {}) {
    const flow = resolveTreatmentFlow(options);
    const registryId = options.registryId || resolveStaffJournalRegistryId(flow);
    if (openPatientDocumentLive(registryId, options)) return true;
    const patientAction = resolveStaffJournalPatientAction(registryId);
    dispatchCloudStaffAction({
      kind: 'journal',
      patientAction,
      registryId,
      flow,
    });
    return true;
  }

  function buildStaffDocumentPreviewHtml(registryId, bundle) {
    const hit = findDoc(bundle, registryId);
    if (!hit) {
      return '<p class="cco-auto-preview__empty">Ingen preview — dokument saknas i content-bundle.</p>';
    }
    const doc = hit.document;
    const content = doc.content || {};
    const meridiq = doc.meridiq || {};
    const banner = buildContentStatusBanner({
      contentStatus: doc.contentStatus,
      blockers: doc.blockers,
    });
    const text = content.text || content.note || meridiq.title || '';
    let stages = asArray(content.stages);
    if (!stages.length && Array.isArray(content.reviewStages)) {
      // Före/efter-bildmall: härled stadie-etiketter ur reviewStages + stageDisplay.
      const display = content.stageDisplay || {};
      stages = content.reviewStages
        .map((s) => (s && (display[s.id] || s.label || s.id)) || '')
        .filter(Boolean);
    }
    const stagesHtml = stages.length
      ? `<ul class="cco-auto-preview__list">${stages.map((stage) => `<li>${escapeHtml(stage)}</li>`).join('')}</ul>`
      : '';
    const textHtml = text ? `<pre class="cco-auto-preview__pre">${escapeHtml(text)}</pre>` : '';
    const body =
      stagesHtml + textHtml ||
      '<p class="cco-auto-preview__empty">Ingen malltext i bundle — endast registry-metadata.</p>';
    return `
      ${banner}
      <p class="cco-auto-preview__meta">${escapeHtml(doc.label || registryId)} · ${escapeHtml(doc.contentStatus || '')}</p>
      ${body}`;
  }

  async function openStaffDocumentPreviewAsync(registryId) {
    if (!registryId) return false;
    if (openPatientDocumentLive(registryId)) return true;
    mountAutoDocPreviewScrim(
      registryId,
      '<p class="cco-auto-preview__loading" role="status">Laddar staff-mall…</p>',
      { title: 'Staff-mall · preview' }
    );
    const bundle = await ensureDocumentBundle();
    const body = bundle
      ? buildStaffDocumentPreviewHtml(registryId, bundle)
      : '<p class="cco-auto-preview__empty">Kunde inte ladda content-bundle.</p>';
    const scrim = document.getElementById(PREVIEW_ROOT_ID);
    const bodyEl = scrim?.querySelector('[data-auto-preview-body]');
    if (bodyEl) bodyEl.innerHTML = body;
    return Boolean(bundle);
  }

  function activateRegistryDocument(registryId, options = {}) {
    if (!registryId) return false;
    if (openPatientDocumentLive(registryId, options)) return true;
    if (isAutoDocRegistryId(registryId)) {
      void openAutoDocPreviewAsync(registryId);
      return true;
    }
    if (registryId.startsWith('offert_')) {
      openSteg7ForOfferRegistry(registryId, options);
      return true;
    }
    if (isSteg8RegistryId(registryId)) {
      void openSteg8Friskforsakran(options);
      return true;
    }
    if (isSteg9RegistryId(registryId)) {
      void openSteg9FotoSamtycke(options);
      return true;
    }
    if (isStaffJournalRegistryId(registryId)) {
      openStaffJournal({ ...options, registryId });
      return true;
    }
    if (isStaffPreviewRegistryId(registryId)) {
      void openStaffDocumentPreviewAsync(registryId);
      return true;
    }
    return false;
  }

  function buildOpDayStaffActionsHtml(card) {
    if (!isOpDayContext(card)) return '';
    const flow = resolveTreatmentFlow({ card });
    const journalRegistryId = resolveStaffJournalRegistryId(flow);
    const journalLabel = flow === 'tp' ? 'TP-journal' : 'PRP-journal';
    const fitnessSigned =
      card?.fitnessSigned === true ||
      card?.hasFitnessCertificate === true ||
      card?.missingFitnessCertificate === false;
    const fcBlocked = !fitnessSigned;
    const actions = [
      { id: 'steg8', label: 'Friskförsäkran', registryId: 'friskfoers_tp' },
      { id: 'journal', label: journalLabel, registryId: journalRegistryId },
      { id: 'ordination', label: 'Ordination', registryId: 'ordination_tp' },
      { id: 'photo_proto', label: 'Före/efter-bild', registryId: 'fore_efter_bildmall' },
      { id: 'steg9', label: 'Foto-samtycke', registryId: 'foto_samtycke' },
    ];
    return `
      <div class="v11-opday-actions" data-v11-opday-actions aria-label="Op-dag · personal">
        <span class="v11-opday-actions__kicker">Op-dag</span>
        <div class="v11-opday-actions__row">
          ${actions
            .map((action) => {
              const blocked = fcBlocked && action.id !== 'steg8';
              const title = blocked
                ? 'Signera friskförsäkran innan denna åtgärd på operationsdagen.'
                : '';
              return `<button type="button" class="v11-opday-actions__btn${
                blocked ? ' is-disabled' : ''
              }" data-v11-opday-action="${escapeHtml(action.id)}" data-v11-opday-registry="${escapeHtml(action.registryId)}"${
                blocked ? ' disabled aria-disabled="true"' : ''
              } title="${escapeHtml(title)}">${escapeHtml(action.label)}</button>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  function bindOpDayStaffActions(root) {
    if (!root || root.dataset.opdayBound === '1') return;
    root.dataset.opdayBound = '1';
    root.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-v11-opday-action]');
      if (!btn) return;
      const registryId = btn.getAttribute('data-v11-opday-registry') || '';
      activateRegistryDocument(registryId);
    });
  }

  function buildPost8JournalTimelineHtml(bundle, { show = false } = {}) {
    if (!show) return '';
    const docs = listPost8JournalDocs(bundle);
    if (!docs.length) return '';
    return `
      <div class="v11-post8-timeline" data-v11-post8-timeline aria-label="Uppföljningsjournaler efter op-dag">
        <span class="v11-post8-timeline__kicker">Efter op-dag</span>
        <ul class="v11-post8-timeline__list">
          ${docs
            .map(
              (doc) =>
                `<li><span class="v11-post8-timeline__label">${escapeHtml(doc.label || doc.registryId)}</span><span class="v11-post8-timeline__status">${escapeHtml(doc.contentStatus || '')}</span></li>`
            )
            .join('')}
        </ul>
      </div>`;
  }

  function mapBundleDocumentToRow(doc) {
    if (!doc || typeof doc !== 'object') return null;
    const flow = asArray(doc.flowApplies)[0] || 'tp';
    const contentStatus = String(doc.contentStatus || 'PARTIAL').toUpperCase();
    const autoDoc = doc.filler === 'system_auto' || isAutoDocRegistryId(doc.registryId);
    const registryId = String(doc.registryId || '');
    return {
      registryId: doc.registryId,
      title: doc.label || doc.registryId,
      flowLabel: V11_FLOW_LABELS[flow] || String(flow).toUpperCase(),
      flow,
      journeyStep: doc.journeyStep || '',
      filler: doc.filler === 'system_auto' ? 'auto' : doc.filler || 'patient',
      contentStatus,
      blockers: asArray(doc.blockers),
      status: contentStatus === 'FULL' ? 'planned' : 'pending',
      statusLabel:
        contentStatus === 'FULL'
          ? 'Innehåll klart'
          : contentStatus === 'MISSING'
            ? 'Saknas'
            : 'Delvis',
      dashed: contentStatus !== 'FULL',
      previewable: isInteractiveRegistryId(registryId) || autoDoc,
    };
  }

  function buildV11DocumentPayloadFromBundle(bundle) {
    const allDocs = [
      ...asArray(bundle?.customerFilled),
      ...asArray(bundle?.staffFilled),
      ...asArray(bundle?.information),
    ];
    const rowsByGroup = {
      offers: [],
      healthForms: [],
      journals: [],
      autoDocs: [],
    };
    let full = 0;
    let partial = 0;
    let missing = 0;

    for (const doc of allDocs) {
      if (isPost8JournalRegistryId(doc.registryId)) continue;
      const row = mapBundleDocumentToRow(doc);
      if (!row) continue;
      rowsByGroup[resolveV11DocGroup(doc)].push(row);
      if (doc.contentStatus === 'FULL') full += 1;
      else if (doc.contentStatus === 'MISSING') missing += 1;
      else partial += 1;
    }

    for (const key of Object.keys(rowsByGroup)) {
      rowsByGroup[key].sort(
        (a, b) =>
          Number(a.journeyStep || 99) - Number(b.journeyStep || 99) ||
          String(a.title).localeCompare(String(b.title), 'sv')
      );
    }

    return {
      ready: true,
      source: 'hairtp-document-content-bundle',
      bundleCacheVersion: bundle?.cacheVersion || '',
      counts: { total: allDocs.length, done: full, pending: partial, upcoming: missing },
      offers: rowsByGroup.offers,
      healthForms: rowsByGroup.healthForms,
      journals: rowsByGroup.journals,
      autoDocs: rowsByGroup.autoDocs,
    };
  }

  function buildAutoDocPreviewHtml(registryId, bundle) {
    const hit = findDoc(bundle, registryId);
    if (!hit) {
      return '<p class="cco-auto-preview__empty">Ingen preview — dokument saknas i content-bundle.</p>';
    }
    const doc = hit.document;
    const content = doc.content || {};
    const sms = content.smsText
      ? `<pre class="cco-auto-preview__pre">${escapeHtml(content.smsText)}</pre>`
      : '';
    const emailBody = content.emailBody
      ? `<pre class="cco-auto-preview__pre">${escapeHtml(content.emailBody)}</pre>`
      : '';
    const emailSample = content.emailSample?.text
      ? `<pre class="cco-auto-preview__pre">${escapeHtml(content.emailSample.text)}</pre>`
      : '';
    const banner = buildContentStatusBanner({
      contentStatus: doc.contentStatus,
      blockers: doc.blockers,
    });
    return `
      ${banner}
      <p class="cco-auto-preview__meta">${escapeHtml(doc.label || registryId)} · ${escapeHtml(doc.contentStatus || '')}</p>
      ${sms ? `<h4>SMS</h4>${sms}` : ''}
      ${emailBody ? `<h4>E-post (mall)</h4>${emailBody}` : ''}
      ${emailSample ? `<h4>E-post (exempel)</h4>${emailSample}` : ''}
      ${!sms && !emailBody && !emailSample ? '<p class="cco-auto-preview__empty">Ingen SMS/e-posttext i bundle för detta dokument.</p>' : ''}`;
  }

  function detachPreviewEscapeHandler() {
    if (!previewEscapeHandler) return;
    document.removeEventListener('keydown', previewEscapeHandler);
    previewEscapeHandler = null;
  }

  function closeAutoDocPreview() {
    detachPreviewEscapeHandler();
    document.getElementById(PREVIEW_ROOT_ID)?.remove();
  }

  function mountAutoDocPreviewScrim(
    registryId,
    bodyHtml,
    { title = 'Auto-dokument · preview' } = {}
  ) {
    closeAutoDocPreview();
    const scrim = document.createElement('div');
    scrim.id = PREVIEW_ROOT_ID;
    scrim.className = 'cco-auto-preview-scrim';
    scrim.setAttribute('role', 'presentation');
    scrim.innerHTML = `
      <div class="cco-auto-preview" role="dialog" aria-modal="true" aria-label="Auto-dokument preview">
        <header class="cco-auto-preview__head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="cco-auto-preview__close" data-auto-preview-close aria-label="Stäng">✕</button>
        </header>
        <div class="cco-auto-preview__body" data-auto-preview-body>${bodyHtml}</div>
      </div>`;
    document.body.appendChild(scrim);

    previewEscapeHandler = (event) => {
      if (event.key === 'Escape') closeAutoDocPreview();
    };
    document.addEventListener('keydown', previewEscapeHandler);

    scrim.addEventListener('click', (event) => {
      if (event.target === scrim || event.target.closest('[data-auto-preview-close]')) {
        closeAutoDocPreview();
      }
    });

    scrim.querySelector('[data-auto-preview-close]')?.focus?.();
    return scrim;
  }

  function openAutoDocPreview(registryId, bundle = null) {
    if (!registryId) return false;
    const resolvedBundle = bundle || global.CcoMeridiqContent?.getFullDocumentBundle?.();
    if (!resolvedBundle) return false;
    mountAutoDocPreviewScrim(registryId, buildAutoDocPreviewHtml(registryId, resolvedBundle));
    return true;
  }

  async function openAutoDocPreviewAsync(registryId) {
    if (!registryId) return false;
    if (openPatientDocumentLive(registryId)) return true;
    mountAutoDocPreviewScrim(
      registryId,
      '<p class="cco-auto-preview__loading" role="status">Laddar malltext…</p>'
    );
    const bundle = await ensureDocumentBundle();
    const body = bundle
      ? buildAutoDocPreviewHtml(registryId, bundle)
      : '<p class="cco-auto-preview__empty">Kunde inte ladda content-bundle. Försök igen om en stund.</p>';
    const scrim = document.getElementById(PREVIEW_ROOT_ID);
    const bodyEl = scrim?.querySelector('[data-auto-preview-body]');
    if (bodyEl) bodyEl.innerHTML = body;
    else if (bundle) openAutoDocPreview(registryId, bundle);
    return Boolean(bundle);
  }

  function openSteg7ForOfferRegistry(registryId, options = {}) {
    if (openPatientDocumentLive(registryId, { ...options, phase: options.phase || 7 })) {
      return Promise.resolve(true);
    }
    const flowEntry = Object.entries(STEG7_OFFER_BY_FLOW).find(([, id]) => id === registryId);
    const flow = flowEntry ? flowEntry[0] : 'tp';
    if (global.CcoAvtalSamtyckeBundle?.mount) {
      return global.CcoAvtalSamtyckeBundle.mount({ ...options, flow });
    }
    return Promise.resolve(null);
  }

  function resolveTreatmentFlow(options = {}) {
    if (options.flow) return options.flow;
    try {
      const demoFlow = new URLSearchParams(global.location.search || '').get('demoFlow');
      if (demoFlow && STEG7_OFFER_BY_FLOW[demoFlow]) return demoFlow;
    } catch {
      /* ignore */
    }
    const card = global.currentPatientCard;
    if (card?.treatmentFlow && STEG7_OFFER_BY_FLOW[card.treatmentFlow]) {
      return card.treatmentFlow;
    }
    return 'tp';
  }

  function activateAutoDocPreviewRow(row) {
    const registryId =
      row?.getAttribute?.('data-kk-auto-doc-preview') ||
      row?.getAttribute?.('data-v11-doc-registry') ||
      '';
    if (!isAutoDocRegistryId(registryId)) return false;
    void openAutoDocPreviewAsync(registryId);
    return true;
  }

  function bindAutoDocPreviewRows(root = document) {
    if (autoDocPreviewRowsBound || !root?.addEventListener) return;
    autoDocPreviewRowsBound = true;
    root.addEventListener(
      'click',
      (event) => {
        const row = event.target?.closest?.(
          '[data-kk-auto-doc-preview][data-v11-doc-previewable="1"]'
        );
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        activateAutoDocPreviewRow(row);
      },
      true
    );
    root.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target?.closest?.(
          '[data-kk-auto-doc-preview][data-v11-doc-previewable="1"]'
        );
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        activateAutoDocPreviewRow(row);
      },
      true
    );
  }

  global.CcoHairtpDocumentCloud = {
    STEG7_OFFER_BY_FLOW,
    FLOW_LABELS,
    POST8_JOURNAL_REGISTRY_IDS,
    STAFF_JOURNAL_BY_FLOW,
    isAutoDocRegistryId,
    isAutoDocRow,
    isPost8JournalRegistryId,
    isStaffJournalRegistryId,
    isStaffPreviewRegistryId,
    isSteg8RegistryId,
    isSteg9RegistryId,
    isInteractiveRegistryId,
    isOpDayContext,
    ensureDocumentBundle,
    buildContentStatusBanner,
    resolveSteg7ForFlow,
    resolveStaffJournalRegistryId,
    resolveStaffJournalPatientAction,
    resolveV11DocGroup,
    mapBundleDocumentToRow,
    buildV11DocumentPayloadFromBundle,
    buildAutoDocPreviewHtml,
    buildStaffDocumentPreviewHtml,
    buildOpDayStaffActionsHtml,
    buildPost8JournalTimelineHtml,
    bindOpDayStaffActions,
    openAutoDocPreview,
    openAutoDocPreviewAsync,
    openStaffDocumentPreviewAsync,
    openSteg8Friskforsakran,
    openSteg9FotoSamtycke,
    openPatientDocumentLive,
    openStaffJournal,
    activateRegistryDocument,
    closeAutoDocPreview,
    openSteg7ForOfferRegistry,
    resolveTreatmentFlow,
    listPost8JournalDocs,
    bindAutoDocPreviewRows,
  };
  bindAutoDocPreviewRows();
})(typeof window !== 'undefined' ? window : global);
