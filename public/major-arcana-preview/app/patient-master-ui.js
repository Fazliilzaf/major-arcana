/**
 * Fas 2 — Kundregister (patient master) i Kunder-vyn.
 * Läser /api/v1/cco-patient-master/* och renderar lista + kundkort.
 */
(() => {
  'use strict';

  const ADMIN_TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';
  const PAGE_SIZE = 60;

  const FLAG_LABELS = {
    missing_email: 'Saknar e-post',
    missing_phone: 'Saknar telefon',
    missing_personnummer: 'Saknar personnummer',
    duplicate_email: 'Dubblett e-post',
    drive_only: 'Endast Drive',
    cliento_only: 'Endast Cliento',
    needs_review: 'Granska',
  };

  const MATCH_LABELS = {
    matched: 'Kopplad',
    cliento_only: 'Cliento',
    drive_only: 'Drive',
    needs_review: 'Granska',
  };

  const PHOTO_LABEL_OPTIONS = ['Front', 'Vertex', 'Baksida', 'Profil', 'Annan'];

  const runtime = {
    mode: 'register',
    loading: false,
    loaded: false,
    error: '',
    authRequired: false,
    query: '',
    flagFilter: '',
    offset: 0,
    total: 0,
    patients: [],
    selectedPatientId: '',
    detail: null,
    detailTab: 'profil',
    detailLoading: false,
    commercialCase: null,
    offerDocumentUrl: '',
    offerDocumentPdfUrl: '',
    offerDocumentWordUrl: '',
    offerSignUrl: '',
    offerTemplates: [],
    stats: null,
    preferJournalOnMobile: true,
    pendingPatientId: '',
  };

  const els = {
    shell: null,
    list: null,
    rail: null,
    identityRail: null,
    patientRail: null,
    status: null,
    search: null,
    filter: null,
    metrics: null,
    title: null,
    subtitle: null,
    modeButtons: [],
  };

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isLocalPreviewHost() {
    try {
      const host = window.location.hostname.split(':')[0].toLowerCase();
      return ['localhost', '127.0.0.1', '::1'].includes(host);
    } catch {
      return false;
    }
  }

  function getAdminToken() {
    try {
      const local = normalizeText(window.localStorage.getItem(ADMIN_TOKEN_KEY));
      if (local) return local;
      const session = normalizeText(window.sessionStorage.getItem(ADMIN_TOKEN_KEY));
      if (session) return session;
    } catch {
      /* ignore */
    }
    return isLocalPreviewHost() ? '__preview_local__' : '';
  }

  function isAuthFailure(statusCode, message) {
    const code = Number(statusCode || 0);
    const text = normalizeText(message).toLowerCase();
    return (
      code === 401 || code === 403 || text.includes('inloggning') || text.includes('unauthorized')
    );
  }

  function isMobileViewport() {
    try {
      return window.matchMedia('(max-width: 820px)').matches;
    } catch {
      return false;
    }
  }

  function isOnline() {
    return typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  }

  function parseStartupParams() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return {
        patientId: normalizeText(params.get('patientId')),
        view: normalizeText(params.get('view')),
      };
    } catch {
      return { patientId: '', view: '' };
    }
  }

  function buildPatientDeepLink(patientId) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'customers');
    if (patientId) {
      url.searchParams.set('patientId', patientId);
    } else {
      url.searchParams.delete('patientId');
    }
    return url.toString();
  }

  function promptPhotoLabel() {
    const choice = window.prompt(
      `Etikett för bilden?\n${PHOTO_LABEL_OPTIONS.map((label, index) => `${index + 1}. ${label}`).join('\n')}\n\nSkriv nummer eller egen text:`,
      '1'
    );
    if (choice === null) return null;
    const trimmed = normalizeText(choice);
    const index = Number(trimmed);
    if (Number.isFinite(index) && index >= 1 && index <= PHOTO_LABEL_OPTIONS.length) {
      return PHOTO_LABEL_OPTIONS[index - 1];
    }
    return trimmed || 'Konsultationsbild';
  }

  function isPlanUploadBlocked(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    return Boolean(planEntry && (planEntry.locked || planEntry.status === 'signed'));
  }

  async function apiRequest(path, options = {}) {
    const token = getAdminToken();
    const headers = {
      Accept: 'application/json',
      ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(new URL(path, window.location.origin), {
      method: options.method || 'GET',
      headers,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : JSON.stringify(options.body),
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  }

  function setStatus(message = '', tone = '') {
    if (!els.status) return;
    els.status.hidden = !message;
    els.status.textContent = message;
    els.status.dataset.statusTone = tone;
  }

  function resolveElements() {
    els.shell = document.querySelector('[data-shell-view="customers"]');
    els.list = document.querySelector('[data-customer-list]');
    els.rail = document.querySelector('.customers-rail');
    els.identityRail = document.querySelector('[data-patient-identity-rail]');
    els.patientRail = document.querySelector('[data-patient-master-rail]');
    els.status = document.querySelector('[data-customers-status]');
    els.search = document.querySelector('[data-customer-search]');
    els.filter = document.querySelector('[data-customer-filter]');
    els.metrics = document.querySelector('.customers-metric-row');
    els.title = document.querySelector('#customers-title');
    els.subtitle = els.shell?.querySelector('.customers-title-group p');
    els.modeButtons = Array.from(document.querySelectorAll('[data-patient-master-mode]'));
  }

  function renderModeChrome() {
    const isRegister = runtime.mode === 'register';
    els.modeButtons.forEach((button) => {
      const active = button.dataset.patientMasterMode === runtime.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (els.title) {
      els.title.textContent = isRegister ? 'Kundregister' : 'Kundidentitetshantering';
    }
    if (els.subtitle) {
      els.subtitle.textContent = isRegister
        ? 'Sök kunder, öppna kundkort med importerad journal och Drive-filer.'
        : 'Hantera kundprofiler, slå ihop dubbletter och få full överblick.';
    }
    if (els.identityRail) {
      els.identityRail.hidden = isRegister;
    }
    if (els.patientRail) {
      els.patientRail.hidden = !isRegister;
    }
    if (els.metrics) {
      els.metrics.hidden = !isRegister;
    }
  }

  function renderMetricCards() {
    if (!els.metrics || !runtime.stats) return;
    const stats = runtime.stats;
    const mapping = {
      total: stats.totalPatients,
      matched: stats.matched,
      journal: stats.withPersonnummer,
      review: stats.needsReview,
      drive: stats.driveOnly,
    };
    els.metrics.querySelectorAll('[data-patient-metric]').forEach((card) => {
      const key = card.dataset.patientMetric;
      const node = card.querySelector('strong');
      if (node && Object.prototype.hasOwnProperty.call(mapping, key)) {
        node.textContent = String(mapping[key] ?? 0);
      }
    });
  }

  function chipHtml(label, tone = 'blue') {
    return `<span class="focus-customer-chip focus-customer-chip--${tone}">${escapeHtml(label)}</span>`;
  }

  function renderPatientFlags(card) {
    const chips = [];
    if (card.matchStatus) {
      const tone =
        card.matchStatus === 'matched'
          ? 'green'
          : card.matchStatus === 'needs_review'
            ? 'gold'
            : 'blue';
      chips.push(chipHtml(MATCH_LABELS[card.matchStatus] || card.matchStatus, tone));
    }
    if (card.hasJournalHistory) {
      chips.push(chipHtml('Importerad journal', 'green'));
    } else if (card.clientoLinked && !card.driveLinked) {
      chips.push(chipHtml('Cliento', 'blue'));
    }
    asArray(card.flags)
      .slice(0, 2)
      .forEach((flag) => {
        chips.push(
          chipHtml(FLAG_LABELS[flag] || flag, flag === 'needs_review' ? 'gold' : 'violet')
        );
      });
    return chips.join('');
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function renderPatientRows() {
    if (!els.list || runtime.mode !== 'register') return;
    if (runtime.loading && !runtime.patients.length) {
      els.list.innerHTML = '<p class="patient-master-empty">Laddar kundregister…</p>';
      return;
    }
    if (!runtime.patients.length) {
      els.list.innerHTML = `<p class="patient-master-empty">${escapeHtml(
        runtime.error || 'Inga kunder matchar sökningen.'
      )}</p>`;
      return;
    }

    const rows = runtime.patients
      .map((card) => {
        const selected = card.patientId === runtime.selectedPatientId;
        const journalCount = Number(card.fileSummary?.journalPdfs || 0);
        const imageCount = Number(card.fileSummary?.images || 0);
        return `
          <button
            class="customer-record customer-record--compact${selected ? ' is-selected' : ''}"
            type="button"
            data-patient-row="${escapeHtml(card.patientId)}"
            aria-pressed="${selected ? 'true' : 'false'}"
          >
            <div class="customer-record-main">
              <div class="customer-record-head">
                <h3>${escapeHtml(card.displayName || 'Okänd kund')}</h3>
                ${
                  journalCount || imageCount
                    ? `<span class="customer-record-file-badge">${journalCount} PDF · ${imageCount} bild</span>`
                    : ''
                }
              </div>
              <div class="customer-record-meta">
                ${
                  card.personnummer
                    ? `<span>${escapeHtml(card.personnummer)}</span>`
                    : '<span class="customer-record-meta-rose">Saknar pnr</span>'
                }
                ${
                  card.matchStatus === 'matched'
                    ? '<span class="customer-record-match">Kopplad</span>'
                    : ''
                }
              </div>
            </div>
          </button>
        `;
      })
      .join('');

    const hasMore = runtime.patients.length < runtime.total;
    const footer = hasMore
      ? `<button class="customers-utility-button patient-master-load-more" type="button" data-patient-load-more>Visa fler (${runtime.patients.length}/${runtime.total})</button>`
      : runtime.total
        ? `<p class="patient-master-list-meta">${runtime.total} kunder totalt</p>`
        : '';

    els.list.innerHTML = rows + footer;
  }

  function renderDetailEmpty() {
    if (!els.patientRail) return;
    els.patientRail.innerHTML = `
      <section class="patient-master-card patient-master-card-empty">
        <h2>Välj en kund</h2>
        <p>Öppna ett kundkort i listan för profil, journal och importerade filer.</p>
      </section>
    `;
  }

  function fileViewUrl(file) {
    if (file?.viewUrl) return file.viewUrl;
    if (file?.id) return `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(file.id)}`;
    return '';
  }

  function attachmentViewUrl(attachment) {
    if (attachment?.fileId) {
      return `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(attachment.fileId)}`;
    }
    return '';
  }

  function journalPhotoUrl(photoId, variant = '') {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !photoId) return '';
    const params = new URLSearchParams({
      patientId,
      photoId: String(photoId),
    });
    if (variant) params.set('variant', variant);
    return `/api/v1/cco-journal/photo?${params.toString()}`;
  }

  function isPreviewableImage(file) {
    const name = String(file?.fileName || file?.relativePath || '').toLowerCase();
    return file?.fileType === 'image' || /\.(jpe?g|png|webp|gif|heic|heif|dng)$/i.test(name);
  }

  function isJournalPdf(file) {
    const name = String(file?.fileName || file?.relativePath || '').toLowerCase();
    return file?.fileType === 'journal_pdf' || name.endsWith('.pdf');
  }

  function renderFilesEmpty(card) {
    if (!card?.personnummer) {
      return `
        <p class="patient-master-muted">Inga Drive-filer — personnummer saknas.</p>
        <p class="patient-master-muted">Bilder och journal-PDF importeras från Google Drive-mappar som är namngivna med personnummer. Cliento-kunder utan matchning får inga filer ännu.</p>
      `;
    }
    if (!card?.driveLinked) {
      return `
        <p class="patient-master-muted">Inga indexerade Drive-filer för detta personnummer.</p>
        <p class="patient-master-muted">Kör migration scan om zip/mappar lagts till efter senaste import.</p>
      `;
    }
    return '<p class="patient-master-muted">Inga indexerade Drive-filer för detta personnummer.</p>';
  }

  function fileOccasion(file) {
    return file?.occasionContext && typeof file.occasionContext === 'object'
      ? file.occasionContext
      : {};
  }

  function renderOccasionGroup(group) {
    const images = group.files.filter(isPreviewableImage);
    const pdfs = group.files.filter(isJournalPdf);
    const other = group.files.filter((file) => !isPreviewableImage(file) && !isJournalPdf(file));

    const metaBits = [
      pdfs.length ? `${pdfs.length} PDF` : '',
      images.length ? `${images.length} bild${images.length === 1 ? '' : 'er'}` : '',
    ].filter(Boolean);

    const pdfList = pdfs.length
      ? `
        <ul class="patient-master-file-list patient-master-file-list--compact">
          ${pdfs
            .map((file) => {
              const href = fileViewUrl(file);
              const label = escapeHtml(file.fileName || file.relativePath || 'PDF');
              return `
                <li>
                  <a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>
                  <span>PDF</span>
                </li>
              `;
            })
            .join('')}
        </ul>
      `
      : '';

    const imageGrid = images.length
      ? `
        <div class="patient-master-file-section patient-master-file-section--compact">
          <div class="patient-master-image-grid">
            ${images
              .map((file) => {
                const href = fileViewUrl(file);
                const label = escapeHtml(file.fileName || 'Bild');
                return `
                  <a class="patient-master-image-tile" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${label}">
                    <img src="${escapeHtml(href)}" alt="${label}" loading="lazy" decoding="async" />
                  </a>
                `;
              })
              .join('')}
          </div>
        </div>
      `
      : '';

    const otherList = other.length
      ? `
        <ul class="patient-master-file-list patient-master-file-list--compact">
          ${other
            .map((file) => {
              const href = fileViewUrl(file);
              const label = escapeHtml(file.fileName || file.relativePath || 'Fil');
              const link = href
                ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${label}</a>`
                : `<strong>${label}</strong>`;
              return `
                <li>
                  ${link}
                  <span>${escapeHtml(file.fileType || 'fil')}</span>
                </li>
              `;
            })
            .join('')}
        </ul>
      `
      : '';

    return `
      <section class="patient-master-segment">
        <header class="patient-master-segment-head">
          <h4>${escapeHtml(group.timelineLabel)}</h4>
          ${
            metaBits.length
              ? `<span class="patient-master-segment-meta">${escapeHtml(metaBits.join(' · '))}</span>`
              : ''
          }
        </header>
        ${pdfList}
        ${imageGrid}
        ${otherList}
      </section>
    `;
  }

  function renderDriveFiles(files, card) {
    const rows = asArray(files);
    if (!rows.length) {
      return renderFilesEmpty(card);
    }
    return groupFilesByOccasion(rows)
      .map((group) => renderOccasionGroup(group))
      .join('');
  }

  function renderMaterialPreview(files, card) {
    const rows = asArray(files);
    const total = Number(card?.fileSummary?.totalFiles || rows.length || 0);
    if (!total) {
      return `
        <article class="focus-customer-data-card patient-master-history-card">
          <h4>Kundhistorik</h4>
          ${renderFilesEmpty(card)}
        </article>
      `;
    }

    const journalPdfs = Number(card.fileSummary?.journalPdfs || 0);
    const images = Number(card.fileSummary?.images || 0);

    return `
      <article class="focus-customer-data-card patient-master-history-card">
        <div class="patient-master-material-head">
          <h4>Kundhistorik</h4>
          <p class="patient-master-muted">${journalPdfs} journal-PDF · ${images} bilder · ${total} filer</p>
        </div>
        <div class="patient-master-history-segments">
          ${renderDriveFiles(rows, card)}
        </div>
      </article>
    `;
  }

  function groupFilesByOccasion(files) {
    const groups = new Map();
    for (const file of asArray(files)) {
      const ctx = fileOccasion(file);
      const key = ctx.timelineKey || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          timelineKey: key,
          timelineLabel:
            ctx.timelineLabel || ctx.capturedLabel || ctx.occasionLabel || 'Okänt tillfälle',
          timelineSort: ctx.timelineSort || '0000-00-00',
          capturedLabel: ctx.capturedLabel || '',
          occasionLabel: ctx.occasionLabel || '',
          files: [],
        });
      }
      groups.get(key).files.push(file);
    }
    return [...groups.values()].sort((a, b) =>
      String(b.timelineSort || '').localeCompare(String(a.timelineSort || ''))
    );
  }

  function renderJournalWorkflowCallout(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    const linkedOffer =
      planEntry && runtime.commercialCase?.linkedJournalEntryId === planEntry.entryId
        ? runtime.commercialCase
        : null;
    const photos = planEntry
      ? asArray(planEntry.attachments).filter((item) => item.type === 'consultation_photo')
      : [];
    const steps = [
      { label: 'Skapa behandlingsplan', done: !!planEntry },
      {
        label: 'Ta bilder och markera zoner',
        done: photos.some((photo) => photo.hasAnnotation),
      },
      { label: 'Skapa offert från plan', done: !!linkedOffer?.offerDocumentId },
    ];

    return `
      <article class="focus-customer-data-card patient-master-workflow-card">
        <div class="patient-master-material-head">
          <h4>Behandlingsplan & offert</h4>
          <button type="button" class="customers-utility-button" data-patient-tab-jump="journal">
            Öppna Journal →
          </button>
        </div>
        <p class="patient-master-muted">Nytt arbete sker under <strong>Journal</strong>: ta bild, markera zoner och skapa offert.</p>
        <ol class="patient-master-workflow-steps">
          ${steps
            .map(
              (step) =>
                `<li class="${step.done ? 'is-done' : ''}">${escapeHtml(step.label)}${
                  step.done ? ' ✓' : ''
                }</li>`
            )
            .join('')}
        </ol>
      </article>
    `;
  }

  function renderJournalToolbar(card, entries) {
    const uploadBlocked = isPlanUploadBlocked(entries);
    const disabledAttr = uploadBlocked ? ' disabled' : '';
    const disabledClass = uploadBlocked ? ' is-disabled' : '';
    return `
      <div class="patient-master-journal-intro">
        <h4>Journalverktyg</h4>
        <p class="patient-master-muted">Ta bild direkt i konsultationen, markera zoner och skapa offert här.</p>
      </div>
      <div class="patient-master-journal-toolbar">
        <label class="customers-utility-button patient-master-camera-button patient-master-upload-button${disabledClass}">
          Ta bild
          <input type="file" accept="image/*" capture="environment" hidden data-patient-photo-camera${disabledAttr} />
        </label>
        <label class="customers-utility-button patient-master-upload-button${disabledClass}">
          Välj från galleri
          <input type="file" accept="image/*,.heic,.heif" multiple hidden data-patient-photo-gallery${disabledAttr} />
        </label>
        <button class="customers-utility-button" type="button" data-patient-action="new-consultation-plan">
          Ny behandlingsplan
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="import-historical">
          Importera historik
        </button>
        <button class="customers-utility-button" type="button" data-patient-action="new-tp-journal">
          Ny TP-journal
        </button>
      </div>
      ${
        uploadBlocked
          ? `<p class="patient-master-upload-blocked">Behandlingsplanen är signerad och låst. Skapa en ny plan om du ska ta fler bilder.</p>`
          : ''
      }
      <p class="patient-master-muted">${Number(card.fileSummary?.journalPdfs || 0)} journal-PDF i index · ${Number(card.fileSummary?.images || 0)} bilder</p>
    `;
  }

  function findConsultationPlanEntry(entries) {
    const rows = asArray(entries);
    return (
      rows.find((entry) => entry.journalType === 'consultation_plan' && entry.canEdit) ||
      rows.find((entry) => entry.journalType === 'consultation_plan') ||
      null
    );
  }

  function renderOfferTemplateSelect(selectedKey) {
    const templates = asArray(runtime.offerTemplates);
    if (!templates.length) {
      return '';
    }
    return `
      <label class="patient-master-offer-template">
        <span class="patient-master-muted">Offertmall</span>
        <select data-patient-offer-template>
          ${templates
            .map(
              (template) =>
                `<option value="${escapeHtml(template.key)}"${
                  template.key === selectedKey ? ' selected' : ''
                }>${escapeHtml(template.label)}</option>`
            )
            .join('')}
        </select>
      </label>
    `;
  }

  function renderOfferStatusMeta(linkedOffer) {
    if (!linkedOffer) return '';
    const bits = [];
    if (linkedOffer.offerTemplateKey) {
      bits.push(`Mall: ${linkedOffer.offerTemplateKey}`);
    }
    if (linkedOffer.coolingOffEndsAt) {
      bits.push(`Betänketid till ${String(linkedOffer.coolingOffEndsAt).slice(0, 10)}`);
    }
    if (linkedOffer.quoteAcceptedAt) {
      bits.push(`Accepterad ${String(linkedOffer.quoteAcceptedAt).slice(0, 10)}`);
    }
    return bits.length ? `<p class="patient-master-muted">${escapeHtml(bits.join(' · '))}</p>` : '';
  }

  function renderConsultationPlanSection(entries) {
    const planEntry = findConsultationPlanEntry(entries);
    if (!planEntry) {
      return `
        <article class="focus-customer-data-card patient-master-plan-card">
          <h4>Konsultation — behandlingsplan</h4>
          <p class="patient-master-muted">Skapa en plan och ladda upp bilder från konsultationen. Markera zoner direkt på bilden.</p>
        </article>
      `;
    }

    const photos = asArray(planEntry.attachments).filter(
      (item) => item.type === 'consultation_photo' && item.photoId
    );
    const fields = planEntry.fields && typeof planEntry.fields === 'object' ? planEntry.fields : {};
    const summaryBits = [
      fields.method ? `Metod: ${fields.method}` : '',
      fields.graftsTotal ? `Grafts: ${fields.graftsTotal}` : '',
      Array.isArray(fields.zones) && fields.zones.length ? `Zoner: ${fields.zones.join(', ')}` : '',
    ].filter(Boolean);

    const commercial = runtime.commercialCase;
    const linkedOffer = commercial?.linkedJournalEntryId === planEntry.entryId ? commercial : null;
    const offerDocumentUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentUrl || '';
    const offerPdfUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document.pdf?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentPdfUrl || '';
    const offerWordUrl =
      linkedOffer?.offerDocumentId && runtime.selectedPatientId
        ? `/api/v1/cco-commercial/offer-document.doc?patientId=${encodeURIComponent(runtime.selectedPatientId)}&documentId=${encodeURIComponent(linkedOffer.offerDocumentId)}`
        : runtime.offerDocumentWordUrl || '';
    const canSendForSign = linkedOffer && linkedOffer.quoteStatus !== 'accepted';
    const canAccept =
      linkedOffer && linkedOffer.quoteStatus === 'sent' && linkedOffer.quoteStatus !== 'accepted';
    const coolingActive =
      linkedOffer?.coolingOffEndsAt && Date.parse(linkedOffer.coolingOffEndsAt) > Date.now();

    return `
      <article class="focus-customer-data-card patient-master-plan-card">
        <div class="patient-master-material-head">
          <h4>${escapeHtml(planEntry.title || 'Konsultation — behandlingsplan')}</h4>
          <span class="patient-master-muted">${escapeHtml(planEntry.status || 'draft')}</span>
        </div>
        ${
          summaryBits.length
            ? `<p class="patient-master-muted">${escapeHtml(summaryBits.join(' · '))}</p>`
            : ''
        }
        ${
          fields.notes ? `<p class="patient-master-plan-notes">${escapeHtml(fields.notes)}</p>` : ''
        }
        <div class="patient-master-offer-box">
          <div class="patient-master-material-head">
            <h4>Offert</h4>
            ${
              linkedOffer
                ? `<span class="patient-master-occasion-badge is-compact">${escapeHtml(linkedOffer.quoteStatus || 'draft')}</span>`
                : ''
            }
          </div>
          ${
            linkedOffer
              ? `<p class="patient-master-muted">${escapeHtml(linkedOffer.offerType || 'Offert')} · ${escapeHtml(linkedOffer.quotedAmount || 'Pris ej satt')}</p>`
              : `<p class="patient-master-muted">Skapa offert från planen när bilder är markerade och planen är klar.</p>`
          }
          ${renderOfferStatusMeta(linkedOffer)}
          ${renderOfferTemplateSelect(linkedOffer?.offerTemplateKey || 'custom')}
          <div class="patient-master-plan-photo-actions">
            <button type="button" class="customers-utility-button" data-patient-action="create-offer-from-plan" data-patient-entry-id="${escapeHtml(planEntry.entryId)}">
              ${linkedOffer ? 'Uppdatera offert från plan' : 'Skapa offert från plan'}
            </button>
            ${
              offerDocumentUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerDocumentUrl)}" target="_blank" rel="noopener">Visa offert</a>`
                : ''
            }
            ${
              offerPdfUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerPdfUrl)}" target="_blank" rel="noopener">Ladda ner PDF</a>`
                : ''
            }
            ${
              offerWordUrl
                ? `<a class="customers-utility-button patient-master-offer-link" href="${escapeHtml(offerWordUrl)}" target="_blank" rel="noopener">Word-mall</a>`
                : ''
            }
            ${
              canSendForSign
                ? `<button type="button" class="customers-utility-button" data-patient-action="send-offer-for-sign">Skicka för signering</button>`
                : ''
            }
            ${
              canAccept
                ? `<button type="button" class="customers-utility-button" data-patient-action="accept-offer"${coolingActive ? ' data-patient-force-offer="1"' : ''}>${
                    coolingActive ? 'Acceptera (override betänketid)' : 'Kund accepterar'
                  }</button>`
                : ''
            }
          </div>
          ${
            runtime.offerSignUrl
              ? `<p class="patient-master-muted">Signeringssida: <a href="${escapeHtml(runtime.offerSignUrl)}" target="_blank" rel="noopener">${escapeHtml(runtime.offerSignUrl)}</a></p>`
              : linkedOffer?.esignStatus === 'sent' && linkedOffer?.esignToken
                ? `<p class="patient-master-muted">Signeringssida: <a href="/api/v1/cco-commercial/offer-sign-page?token=${encodeURIComponent(linkedOffer.esignToken)}" target="_blank" rel="noopener">Öppna kundsignering</a></p>`
                : ''
          }
        </div>
        ${
          photos.length
            ? `<div class="patient-master-plan-photo-grid">
                ${photos
                  .map((photo) => {
                    const originalUrl = journalPhotoUrl(photo.photoId);
                    const previewUrl = photo.annotatedPreviewAvailable
                      ? journalPhotoUrl(photo.photoId, 'annotated')
                      : originalUrl;
                    return `
                      <figure class="patient-master-plan-photo">
                        <a class="patient-master-plan-photo-link" href="${escapeHtml(originalUrl)}" target="_blank" rel="noopener">
                          <img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(photo.fileName || photo.label || 'Konsultationsbild')}" loading="lazy" />
                        </a>
                        <figcaption>
                          <strong>${escapeHtml(photo.label || photo.fileName || 'Bild')}</strong>
                          ${
                            photo.hasAnnotation
                              ? '<span class="patient-master-occasion-badge is-compact">Markerad</span>'
                              : ''
                          }
                        </figcaption>
                        <div class="patient-master-plan-photo-actions">
                          ${
                            planEntry.canEdit
                              ? `<button type="button" class="customers-utility-button" data-patient-annotate-photo="${escapeHtml(photo.attachmentId)}" data-patient-entry-id="${escapeHtml(planEntry.entryId)}" data-patient-photo-id="${escapeHtml(photo.photoId)}">Markera plan</button>`
                              : ''
                          }
                          <a class="patient-master-open-link" href="${escapeHtml(originalUrl)}" target="_blank" rel="noopener">Original</a>
                        </div>
                      </figure>
                    `;
                  })
                  .join('')}
              </div>`
            : `<p class="patient-master-muted">Inga bilder ännu. Tryck <strong>Ta bild</strong> ovan.</p>`
        }
        ${
          planEntry.canSign
            ? `<button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(planEntry.entryId)}">Signera behandlingsplan</button>`
            : ''
        }
      </article>
    `;
  }

  function renderJournalEntries(entries) {
    const rows = asArray(entries);
    const toolbar = runtime.detail?.card ? renderJournalToolbar(runtime.detail.card, rows) : '';
    const planSection = renderConsultationPlanSection(rows);
    const otherEntries = rows.filter((entry) => entry.journalType !== 'consultation_plan');

    const listMarkup = otherEntries.length
      ? `
      <ul class="patient-master-journal-list">
        ${otherEntries
          .map((entry) => {
            const attachment = asArray(entry.attachments)[0];
            const href = attachmentViewUrl(attachment);
            const openLink = href
              ? `<a class="patient-master-open-link" href="${escapeHtml(href)}" target="_blank" rel="noopener">Öppna PDF</a>`
              : '';
            const signButton =
              entry.canSign && runtime.detail?.card?.patientId
                ? `<button type="button" class="customers-utility-button" data-patient-sign-entry="${escapeHtml(entry.entryId)}">Signera</button>`
                : '';
            return `
              <li class="patient-master-journal-item${entry.locked ? ' is-locked' : ''}">
                <div>
                  <strong>${escapeHtml(entry.title || entry.journalType || 'Journal')}</strong>
                  <span>${escapeHtml(entry.status || 'draft')}${entry.signedAt ? ` · signerad ${escapeHtml(String(entry.signedAt).slice(0, 10))}` : ''}</span>
                  ${openLink}
                </div>
                <div class="patient-master-journal-actions">
                  ${
                    entry.journalType === 'historical_import' || entry.source === 'drive_import'
                      ? chipHtml('Importerad', 'gold')
                      : entry.locked
                        ? chipHtml('Låst', 'violet')
                        : chipHtml('Utkast', 'blue')
                  }
                  ${signButton}
                </div>
              </li>
            `;
          })
          .join('')}
      </ul>`
      : `<p class="patient-master-muted">Inga övriga journalposter ännu.</p>`;

    return `
      ${toolbar}
      ${planSection}
      ${listMarkup}
    `;
  }

  function renderDetailPanel() {
    if (!els.patientRail) return;
    const detail = runtime.detail;
    if (!detail?.card) {
      renderDetailEmpty();
      return;
    }
    const { card, patient, journalEntries, driveFiles } = detail;
    const tab = runtime.detailTab;
    const profilActive = tab === 'profil';
    const journalActive = tab === 'journal';
    const filesActive = tab === 'filer';
    const fileCount = Number(card.fileSummary?.totalFiles || driveFiles?.length || 0);

    els.patientRail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${escapeHtml((card.displayName || '?').slice(0, 2).toUpperCase())}</div>
            <div class="focus-customer-copy">
              <h2>${escapeHtml(card.displayName || 'Okänd kund')}</h2>
              <p class="patient-master-hero-id">${escapeHtml(card.personnummer || 'Saknar personnummer')}</p>
              <div class="focus-customer-contact-line">
                <span>${escapeHtml(card.primaryEmail || 'Saknar e-post')}</span>
                <span>${escapeHtml(card.primaryPhone || 'Saknar telefon')}</span>
              </div>
              <div class="focus-customer-chip-row">${renderPatientFlags(card)}</div>
            </div>
            <button type="button" class="customers-utility-button patient-master-copy-link" data-patient-action="copy-patient-link" title="Kopiera länk till kund">
              Kopiera länk
            </button>
            <button type="button" class="customers-utility-button patient-master-copy-link" data-patient-action="show-patient-qr" title="QR-kod till kundkort">
              Visa QR
            </button>
          </div>
        </article>

        <div class="patient-master-tabs" role="tablist">
          <button type="button" class="patient-master-tab${profilActive ? ' is-active' : ''}" data-patient-tab="profil" aria-pressed="${profilActive}">Profil</button>
          <button type="button" class="patient-master-tab${journalActive ? ' is-active' : ''}" data-patient-tab="journal" aria-pressed="${journalActive}">Journal</button>
          <button type="button" class="patient-master-tab${filesActive ? ' is-active' : ''}" data-patient-tab="filer" aria-pressed="${filesActive}">Filer${fileCount ? ` (${fileCount})` : ''}</button>
        </div>

        <div class="patient-master-tab-panel"${profilActive ? '' : ' hidden'} data-patient-tab-panel="profil">
          ${renderJournalWorkflowCallout(journalEntries)}
          <article class="focus-customer-data-card patient-master-identity-card">
            <h4>Identitet</h4>
            <dl class="focus-customer-dl">
              <div><dt>Personnummer</dt><dd>${escapeHtml(card.personnummer || '—')}</dd></div>
              <div><dt>Matchning</dt><dd>${escapeHtml(MATCH_LABELS[card.matchStatus] || card.matchStatus || '—')}</dd></div>
              <div><dt>Cliento</dt><dd>${card.clientoLinked ? 'Ja' : 'Nej'}</dd></div>
              <div><dt>Drive</dt><dd>${card.driveLinked ? 'Ja' : 'Nej'}</dd></div>
            </dl>
          </article>
          ${renderMaterialPreview(driveFiles, card)}
          ${
            patient?.cliento?.createdAt
              ? `<p class="patient-master-muted">Cliento skapad: ${escapeHtml(String(patient.cliento.createdAt).slice(0, 10))}</p>`
              : ''
          }
        </div>

        <div class="patient-master-tab-panel"${journalActive ? '' : ' hidden'} data-patient-tab-panel="journal">
          ${renderJournalEntries(journalEntries)}
        </div>

        <div class="patient-master-tab-panel"${filesActive ? '' : ' hidden'} data-patient-tab-panel="filer">
          ${renderDriveFiles(driveFiles, card)}
        </div>
      </section>
    `;
  }

  async function loadStats() {
    try {
      const payload = await apiRequest('/api/v1/cco-patient-master/stats');
      runtime.stats = payload.stats || null;
      renderMetricCards();
    } catch (error) {
      console.warn('Patient stats misslyckades.', error);
    }
  }

  async function loadPatientList({ append = false } = {}) {
    if (runtime.mode !== 'register') return;
    runtime.loading = true;
    runtime.error = '';
    if (!append) {
      runtime.offset = 0;
      runtime.patients = [];
    }
    setStatus('Läser kundregister…', 'loading');
    renderPatientRows();

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(runtime.offset),
    });
    if (runtime.query) params.set('q', runtime.query);
    if (runtime.flagFilter) params.set('flags', runtime.flagFilter);

    try {
      const payload = await apiRequest(`/api/v1/cco-patient-master/patients?${params}`);
      const batch = asArray(payload.patients);
      runtime.total = Number(payload.total || batch.length);
      runtime.patients = append ? runtime.patients.concat(batch) : batch;
      runtime.loaded = true;
      runtime.authRequired = false;
      setStatus('', '');
      const deepLinkId = runtime.pendingPatientId || parseStartupParams().patientId;
      if (deepLinkId) {
        runtime.pendingPatientId = '';
        await loadPatientDetail(deepLinkId);
        return;
      }
      if (!runtime.selectedPatientId && runtime.patients[0]) {
        runtime.selectedPatientId = runtime.patients[0].patientId;
        await loadPatientDetail(runtime.selectedPatientId);
      }
    } catch (error) {
      runtime.error = isAuthFailure(error.statusCode, error.message)
        ? 'Inloggning krävs för att läsa kundregistret.'
        : error.message || 'Kunde inte läsa kundregistret.';
      runtime.authRequired = isAuthFailure(error.statusCode, error.message);
      setStatus(runtime.error, 'error');
    } finally {
      runtime.loading = false;
      renderPatientRows();
    }
  }

  async function loadOfferTemplates() {
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-templates');
      runtime.offerTemplates = asArray(payload.templates);
    } catch {
      runtime.offerTemplates = [];
    }
  }

  async function loadPatientCommercialCase(patientId) {
    if (!patientId) {
      runtime.commercialCase = null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
      return;
    }
    try {
      const payload = await apiRequest(
        `/api/v1/cco-commercial/patient-case?patientId=${encodeURIComponent(patientId)}`
      );
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
    } catch {
      runtime.commercialCase = null;
      runtime.offerDocumentUrl = '';
      runtime.offerDocumentPdfUrl = '';
      runtime.offerDocumentWordUrl = '';
      runtime.offerSignUrl = '';
    }
  }

  async function loadPatientDetail(patientId) {
    if (!patientId || runtime.mode !== 'register') return;
    runtime.selectedPatientId = patientId;
    if (isMobileViewport() && runtime.preferJournalOnMobile) {
      runtime.detailTab = 'journal';
    }
    runtime.detailLoading = true;
    renderPatientRows();
    try {
      const payload = await apiRequest(
        `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}`
      );
      runtime.detail = payload;
      await loadPatientCommercialCase(patientId);
      renderDetailPanel();
    } catch (error) {
      runtime.detail = null;
      renderDetailEmpty();
      setStatus(error.message || 'Kunde inte läsa kundkortet.', 'error');
    } finally {
      runtime.detailLoading = false;
    }
  }

  function setMode(mode) {
    runtime.mode = mode === 'identity' ? 'identity' : 'register';
    renderModeChrome();
    window.dispatchEvent(
      new CustomEvent('arcana-patient-master-mode', { detail: { mode: runtime.mode } })
    );
    if (runtime.mode === 'register') {
      void loadStats();
      void loadPatientList();
    } else {
      setStatus('', '');
    }
  }

  let searchTimer = null;

  async function importHistoricalForCurrentPatient() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Importerar historisk journal…', 'loading');
    try {
      const result = await apiRequest('/api/v1/cco-journal/import-historical', {
        method: 'POST',
        body: { patientId },
      });
      setStatus(
        `Importerade ${Number(result.created || 0)} poster (${Number(result.skipped || 0)} fanns redan).`,
        'success'
      );
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Import misslyckades.', 'error');
    }
  }

  async function createOfferFromPlan(entryId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId) return;
    const quotedAmount = window.prompt('Pris i offerten (t.ex. 75 000 kr):', '') || '';
    const depositAmount = window.prompt('Deposition (valfritt):', '') || '';
    const templateSelect = document.querySelector('[data-patient-offer-template]');
    const templateKey = templateSelect?.value || '';
    setStatus('Skapar offert från behandlingsplan…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-from-plan', {
        method: 'POST',
        body: {
          patientId,
          entryId,
          quotedAmount,
          depositAmount,
          templateKey,
        },
      });
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerDocumentUrl = payload.offerDocumentUrl || '';
      runtime.offerDocumentPdfUrl = payload.offerDocumentPdfUrl || '';
      runtime.offerDocumentWordUrl = payload.offerDocumentWordUrl || '';
      setStatus('Offert skapad från behandlingsplan.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa offert.', 'error');
    }
  }

  async function sendOfferForSign() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    setStatus('Skickar offert för signering…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-send-for-sign', {
        method: 'POST',
        body: { patientId },
      });
      runtime.commercialCase = payload.commercialCase || null;
      runtime.offerSignUrl = payload.offerSignUrl || '';
      setStatus('Offert skickad. Betänketid startad.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skicka offert.', 'error');
    }
  }

  async function acceptOffer(forceAccept) {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const customerSignedName =
      window.prompt('Kundens namn för accept:', runtime.detail?.card?.displayName || '') || '';
    if (!customerSignedName) return;
    setStatus('Registrerar accept…', 'loading');
    try {
      const payload = await apiRequest('/api/v1/cco-commercial/offer-accept', {
        method: 'POST',
        body: {
          patientId,
          customerSignedName,
          forceAccept: forceAccept === true,
        },
      });
      runtime.commercialCase = payload.commercialCase || null;
      setStatus('Offert accepterad.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte acceptera offert.', 'error');
    }
  }

  async function createConsultationPlan() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    setStatus('Skapar behandlingsplan…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'consultation_plan',
          title: 'Konsultation — behandlingsplan',
          fields: {
            consultationDate: new Date().toISOString().slice(0, 10),
          },
        },
      });
      setStatus('Behandlingsplan skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa behandlingsplan.', 'error');
    }
  }

  async function copyPatientDeepLink() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    const url = buildPatientDeepLink(patientId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Kopiera länken:', url);
        return;
      }
      setStatus('Länk till kund kopierad.', 'success');
    } catch {
      setStatus('Kunde inte kopiera länken.', 'error');
    }
  }

  function closePatientQrOverlay() {
    document.querySelector('.patient-master-qr-overlay')?.remove();
  }

  function showPatientQrCode() {
    const patientId = runtime.selectedPatientId;
    if (!patientId) return;
    closePatientQrOverlay();
    const url = buildPatientDeepLink(patientId);
    const qrSrc = `https://quickchart.io/qr?text=${encodeURIComponent(url)}&size=280&margin=1`;
    const overlay = document.createElement('div');
    overlay.className = 'patient-master-qr-overlay';
    overlay.innerHTML = `
      <div class="patient-master-qr-card" role="dialog" aria-modal="true" aria-label="QR-kod till kundkort">
        <h4>QR — ${escapeHtml(runtime.detail?.card?.displayName || 'Kund')}</h4>
        <img src="${escapeHtml(qrSrc)}" alt="QR-kod till kundkort" width="240" height="240" />
        <p class="patient-master-muted">Skanna för att öppna kundkortet direkt i CCO.</p>
        <button type="button" class="customers-utility-button" data-patient-qr-close>Stäng</button>
      </div>
    `;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-patient-qr-close]')) {
        closePatientQrOverlay();
      }
    });
    document.body.appendChild(overlay);
  }

  async function uploadConsultationPhotos(files) {
    const queue = Array.from(files || []).filter(Boolean);
    if (!queue.length) return;
    for (const file of queue) {
      await uploadConsultationPhoto(file);
    }
  }

  async function uploadConsultationPhoto(file) {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !file) return;

    if (!isOnline()) {
      setStatus('Ingen internetanslutning. Bilden sparades inte.', 'error');
      return;
    }

    if (isPlanUploadBlocked(runtime.detail?.journalEntries)) {
      setStatus('Behandlingsplanen är signerad. Skapa en ny plan för fler bilder.', 'error');
      return;
    }

    const labelChoice = promptPhotoLabel();
    if (labelChoice === null) return;

    const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('patientId', patientId);
    if (card?.personnummer) formData.append('personnummer', card.personnummer);
    if (planEntry?.entryId) formData.append('entryId', planEntry.entryId);
    formData.append('label', labelChoice || file.name || 'Konsultationsbild');

    const token = getAdminToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    setStatus(
      planEntry ? 'Laddar upp konsultationsbild…' : 'Skapar behandlingsplan och laddar upp bild…',
      'loading'
    );
    try {
      const response = await fetch(new URL('/api/v1/cco-journal/photo', window.location.origin), {
        method: 'POST',
        headers,
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (isAuthFailure(response.status, payload.error)) {
          runtime.authRequired = true;
          throw new Error('Inloggning krävs. Logga in igen och försök på nytt.');
        }
        if (response.status === 409) {
          throw new Error('Behandlingsplanen är signerad. Skapa en ny plan för fler bilder.');
        }
        if (response.status === 413) {
          throw new Error('Bilden är för stor (max 12 MB). Välj en mindre bild.');
        }
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setStatus('Bild sparad i journalen.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Uppladdning misslyckades.', 'error');
    }
  }

  async function openPlanEditor(entryId, attachmentId, photoId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId || !attachmentId || !photoId) return;
    if (!window.ArcanaJournalPlanEditor?.open) {
      setStatus('Plan-editor saknas — ladda om sidan.', 'error');
      return;
    }

    let annotations = { shapes: [] };
    let planSummary = {};
    const planEntry = findConsultationPlanEntry(runtime.detail?.journalEntries);
    const attachment = asArray(planEntry?.attachments).find(
      (item) => item.attachmentId === attachmentId
    );
    if (attachment?.annotations && typeof attachment.annotations === 'object') {
      annotations = attachment.annotations;
    }
    if (attachment?.planSummary && typeof attachment.planSummary === 'object') {
      planSummary = attachment.planSummary;
    } else if (planEntry?.fields && typeof planEntry.fields === 'object') {
      planSummary = planEntry.fields;
    }

    try {
      const payload = await apiRequest(
        `/api/v1/cco-journal/plan-annotation?patientId=${encodeURIComponent(patientId)}&photoId=${encodeURIComponent(photoId)}`
      );
      if (payload.annotation?.annotations) annotations = payload.annotation.annotations;
      if (payload.annotation?.planSummary) planSummary = payload.annotation.planSummary;
    } catch {
      /* use attachment fallback */
    }

    window.ArcanaJournalPlanEditor.open({
      imageUrl: journalPhotoUrl(photoId),
      annotations,
      planSummary,
      onSave: async (payload) => {
        await apiRequest('/api/v1/cco-journal/plan-annotation', {
          method: 'PUT',
          body: {
            patientId,
            entryId,
            attachmentId,
            photoId,
            annotations: payload.annotations,
            planSummary: payload.planSummary,
            previewDataUrl: payload.previewDataUrl,
          },
        });
        setStatus('Behandlingsplan sparad.', 'success');
        await loadPatientDetail(patientId);
      },
    });
  }

  async function createTpJournalDraft() {
    const patientId = runtime.selectedPatientId;
    const card = runtime.detail?.card;
    if (!patientId || !card) return;
    setStatus('Skapar TP-journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry', {
        method: 'PUT',
        body: {
          patientId,
          personnummer: card.personnummer || '',
          journalType: 'tp_treatment',
          title: 'TP behandlingsjournal',
          fields: {},
        },
      });
      setStatus('Ny TP-journal skapad.', 'success');
      runtime.detailTab = 'journal';
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Kunde inte skapa journal.', 'error');
    }
  }

  async function signJournalEntry(entryId) {
    const patientId = runtime.selectedPatientId;
    if (!patientId || !entryId) return;
    setStatus('Signerar journal…', 'loading');
    try {
      await apiRequest('/api/v1/cco-journal/entry/sign', {
        method: 'POST',
        body: { patientId, entryId },
      });
      setStatus('Journal signerad och låst.', 'success');
      await loadPatientDetail(patientId);
    } catch (error) {
      setStatus(error.message || 'Signering misslyckades.', 'error');
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const modeButton = event.target.closest('[data-patient-master-mode]');
      if (modeButton) {
        setMode(modeButton.dataset.patientMasterMode);
        return;
      }

      const row = event.target.closest('[data-patient-row]');
      if (row && runtime.mode === 'register') {
        void loadPatientDetail(row.dataset.patientRow);
        return;
      }

      const loadMore = event.target.closest('[data-patient-load-more]');
      if (loadMore && runtime.mode === 'register') {
        runtime.offset += PAGE_SIZE;
        void loadPatientList({ append: true });
        return;
      }

      const tab = event.target.closest('[data-patient-tab]');
      if (tab && runtime.mode === 'register') {
        runtime.detailTab = tab.dataset.patientTab || 'profil';
        if (tab.dataset.patientTab !== 'journal') {
          runtime.preferJournalOnMobile = false;
        }
        renderDetailPanel();
        return;
      }

      const tabJump = event.target.closest('[data-patient-tab-jump]');
      if (tabJump && runtime.mode === 'register') {
        runtime.detailTab = tabJump.dataset.patientTabJump || 'journal';
        renderDetailPanel();
        return;
      }

      const signButton = event.target.closest('[data-patient-sign-entry]');
      if (signButton && runtime.mode === 'register') {
        void signJournalEntry(signButton.dataset.patientSignEntry);
        return;
      }

      const annotateButton = event.target.closest('[data-patient-annotate-photo]');
      if (annotateButton && runtime.mode === 'register') {
        void openPlanEditor(
          annotateButton.dataset.patientEntryId,
          annotateButton.dataset.patientAnnotatePhoto,
          annotateButton.dataset.patientPhotoId
        );
        return;
      }

      const actionButton = event.target.closest('[data-patient-action]');
      if (actionButton && runtime.mode === 'register') {
        if (actionButton.dataset.patientAction === 'import-historical') {
          void importHistoricalForCurrentPatient();
        } else if (actionButton.dataset.patientAction === 'new-tp-journal') {
          void createTpJournalDraft();
        } else if (actionButton.dataset.patientAction === 'new-consultation-plan') {
          void createConsultationPlan();
        } else if (actionButton.dataset.patientAction === 'create-offer-from-plan') {
          void createOfferFromPlan(actionButton.dataset.patientEntryId);
        } else if (actionButton.dataset.patientAction === 'send-offer-for-sign') {
          void sendOfferForSign();
        } else if (actionButton.dataset.patientAction === 'accept-offer') {
          void acceptOffer(actionButton.dataset.patientForceOffer === '1');
        } else if (actionButton.dataset.patientAction === 'copy-patient-link') {
          void copyPatientDeepLink();
        } else if (actionButton.dataset.patientAction === 'show-patient-qr') {
          showPatientQrCode();
        }
      }
    });

    document.addEventListener('change', (event) => {
      const cameraInput = event.target.closest('[data-patient-photo-camera]');
      const galleryInput = event.target.closest('[data-patient-photo-gallery]');
      const uploadInput =
        cameraInput || galleryInput || event.target.closest('[data-patient-photo-upload]');
      if (!uploadInput || runtime.mode !== 'register') return;
      const files = uploadInput.files ? Array.from(uploadInput.files) : [];
      uploadInput.value = '';
      if (!files.length) return;
      if (files.length === 1) void uploadConsultationPhoto(files[0]);
      else void uploadConsultationPhotos(files);
    });

    window.addEventListener('online', () => {
      if (runtime.mode === 'register') {
        setStatus('Anslutning återställd.', 'success');
      }
    });
    window.addEventListener('offline', () => {
      if (runtime.mode === 'register') {
        setStatus('Ingen internetanslutning.', 'error');
      }
    });

    if (els.search) {
      els.search.addEventListener('input', () => {
        if (runtime.mode !== 'register') return;
        runtime.query = normalizeText(els.search.value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          runtime.selectedPatientId = '';
          runtime.detail = null;
          renderDetailEmpty();
          void loadPatientList();
        }, 280);
      });
    }

    if (els.filter) {
      els.filter.addEventListener('change', () => {
        if (runtime.mode !== 'register') return;
        const value = normalizeText(els.filter.value);
        const flagMap = {
          'matchade kunder': '',
          'med drive-filer': 'has_drive_files',
          'behöver granskning': 'needs_review',
          'endast cliento': 'cliento_only',
          'endast drive': 'drive_only',
          'importerad journal': '',
        };
        runtime.flagFilter = flagMap[value.toLowerCase()] || '';
        runtime.selectedPatientId = '';
        runtime.detail = null;
        renderDetailEmpty();
        void loadPatientList();
      });
    }
  }

  function onCustomersViewOpen() {
    resolveElements();
    renderModeChrome();
    renderDetailEmpty();
    const startup = parseStartupParams();
    if (startup.patientId) {
      runtime.pendingPatientId = startup.patientId;
    }
    if (runtime.mode === 'register') {
      void loadOfferTemplates();
      void loadStats();
      void loadPatientList();
    }
  }

  function bootstrap() {
    resolveElements();
    renderModeChrome();
    renderDetailEmpty();
    bindEvents();
    void loadOfferTemplates();
    const startup = parseStartupParams();
    if (startup.patientId) {
      runtime.pendingPatientId = startup.patientId;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }

  window.ArcanaPatientMasterUi = {
    onCustomersViewOpen,
    setMode,
    getRuntime: () => ({ ...runtime }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
