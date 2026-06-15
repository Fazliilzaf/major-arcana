/**
 * Cloud Agent — Hair TP document bundle wiring (Fas 0–2).
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

  const PREVIEW_ROOT_ID = 'cco-auto-doc-preview-scrim';
  let previewEscapeHandler = null;

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

  function mapBundleDocumentToRow(doc) {
    if (!doc || typeof doc !== 'object') return null;
    const flow = asArray(doc.flowApplies)[0] || 'tp';
    const contentStatus = String(doc.contentStatus || 'PARTIAL').toUpperCase();
    const autoDoc = doc.filler === 'system_auto' || isAutoDocRegistryId(doc.registryId);
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
      previewable: autoDoc,
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

  global.CcoHairtpDocumentCloud = {
    STEG7_OFFER_BY_FLOW,
    FLOW_LABELS,
    isAutoDocRegistryId,
    isAutoDocRow,
    ensureDocumentBundle,
    buildContentStatusBanner,
    resolveSteg7ForFlow,
    resolveV11DocGroup,
    mapBundleDocumentToRow,
    buildV11DocumentPayloadFromBundle,
    buildAutoDocPreviewHtml,
    openAutoDocPreview,
    openAutoDocPreviewAsync,
    closeAutoDocPreview,
    openSteg7ForOfferRegistry,
    resolveTreatmentFlow,
  };
})(typeof window !== 'undefined' ? window : global);
