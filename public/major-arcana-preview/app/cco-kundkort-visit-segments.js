/* Kundkort · Besök/tillfällen (read-only)
 * ------------------------------------------------------------------
 * API-backad sektion ovanpå GET /api/v1/cco-patient-master/patient/
 * visit-segments (#594). Renderar expanderbara besökssegment med datum
 * (dag/månad/år) + timeRange, bilder sorterade efter takenAt/timeLabel,
 * dokument i samma datum-/besökssegment, samt confidence + reasons när
 * något är osäkert.
 *
 * NEEDS_REVIEW / REJECTED / DUPLICATE-assets exkluderas redan i API:t
 * (endast VISIBLE_ON_PATIENT_CARD / VERIFIED_IN_CCO når payloaden); här
 * visas dessutom osäkra/granskningssegment aldrig som klara — de får en
 * "Osäkert"/"Behöver granskning"-pill och listas med sina reasons.
 *
 * Read-only. Ingen live-send. Återanvänder befintlig kundkortsdesign
 * (.kkref .dossier-section / .kk-besok / .gk-med-doc / .pill / .dtag).
 */
(function (global) {
  'use strict';

  var doc = global.document;

  var SWEDISH_MONTHS = [
    'januari',
    'februari',
    'mars',
    'april',
    'maj',
    'juni',
    'juli',
    'augusti',
    'september',
    'oktober',
    'november',
    'december',
  ];

  // Maskinkoder från visit-segment-byggaren → operatörsvänlig svenska.
  var REASON_LABELS = {
    missing_visit_date: 'Saknar besöksdatum',
    capture_document_date_mismatch: 'Foto- och dokumentdatum skiljer sig',
    date_without_time_metadata: 'Datum utan klockslag',
    inferred_from_path_or_filename: 'Datum härlett ur filnamn/mapp',
    same_day_time_cluster: 'Flera tillfällen samma dag',
    uncertain_document_date_binding: 'Osäker datumkoppling för dokument',
    document_shared_across_same_day_clusters: 'Dokument delas mellan tillfällen samma dag',
  };

  var VISIT_TYPE_LABELS = {
    consultation: 'Konsultation',
    followup: 'Uppföljning',
    prp: 'PRP',
    operation: 'Operation',
  };

  var CONFIDENCE_LABELS = {
    high: 'Säkert',
    medium: 'Delvis osäkert',
    low: 'Osäkert',
  };

  function txt(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitDate(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(date));
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (!year || month < 1 || month > 12 || !day) return null;
    return { year: year, month: month, day: day, monthLabel: SWEDISH_MONTHS[month - 1] || '' };
  }

  function headingFromParts(parts) {
    // Alltid dag + månad + år så operatören ser hela datumet.
    return parts.day + ' ' + parts.monthLabel + ' ' + parts.year;
  }

  // Bilder sorteras efter takenAt (fallback timeLabel) i stigande ordning.
  function compareImages(a, b) {
    var ak = txt(a && a.takenAt) || txt(a && a.timeLabel);
    var bk = txt(b && b.takenAt) || txt(b && b.timeLabel);
    if (ak !== bk) return ak < bk ? -1 : 1;
    return txt(a && a.fileName).localeCompare(txt(b && b.fileName), 'sv');
  }

  function buildSegmentViewModel(segment) {
    segment = segment || {};
    var date = txt(segment.date);
    var parts = date ? splitDate(date) : null;
    var confidence = txt(segment.confidence) || 'high';
    var reasons = asArray(segment.reasons).filter(Boolean);
    var label = txt(segment.label);
    var reviewBucket = !date && /gransk/i.test(label);
    var undated = !date && !reviewBucket;
    var uncertain = confidence !== 'high' || reasons.length > 0 || reviewBucket || undated;
    var images = asArray(segment.images).slice().sort(compareImages);
    var documents = asArray(segment.documents).slice();
    return {
      date: date || null,
      heading: parts ? headingFromParts(parts) : label || 'Besök',
      day: parts ? parts.day : null,
      monthLabel: parts ? parts.monthLabel : '',
      year: parts ? parts.year : null,
      timeRange: txt(segment.timeRange),
      visitType: txt(segment.visitType),
      visitTypeLabel: VISIT_TYPE_LABELS[txt(segment.visitType)] || '',
      confidence: confidence,
      confidenceLabel: CONFIDENCE_LABELS[confidence] || '',
      uncertain: uncertain,
      reviewBucket: reviewBucket,
      undated: undated,
      reasonLabels: reasons.map(function (r) {
        return REASON_LABELS[r] || r;
      }),
      images: images,
      documents: documents,
    };
  }

  function buildViewModel(payload) {
    payload = payload || {};
    return {
      patientId: txt(payload.patientId) || txt(payload.customerId),
      segments: asArray(payload.visitSegments).map(buildSegmentViewModel),
    };
  }

  // Samma rad-primitiv som dossierns övriga filrader (buildDocViewRow):
  // en read-only <button data-kk-open-doc> som öppnar assetens viewUrl via den
  // befintliga dokumentvisaren. Saknad URL → passiv "--missing"-rad.
  function openRow(title, meta, openRef) {
    var url = txt(openRef);
    if (url) {
      return (
        '<button type="button" class="gk-med-doc" data-kk-open-doc="' +
        esc(url) +
        '" data-kk-doc-title="' +
        esc(title) +
        '"><span class="gk-med-doc-title">' +
        esc(title) +
        '</span><span class="gk-med-doc-meta">' +
        esc(meta) +
        '</span><span class="gk-med-doc-open">Visa</span></button>'
      );
    }
    return (
      '<div class="gk-med-doc gk-med-doc--missing">' +
      '<span class="gk-med-doc-title">' +
      esc(title) +
      '</span><span class="gk-med-doc-meta">' +
      esc(meta || 'Saknas') +
      '</span></div>'
    );
  }

  // Bilder visas i kundkortets befintliga bildgrid (gk-foto-grid) via den
  // exponerade renderaren — samma lazy-load/lightbox som resten av kortet.
  function buildPhotoItems(seg) {
    return seg.images.map(function (img) {
      var takenAt = txt(img.takenAt);
      var thumb = txt(img.thumbnailUrl);
      return {
        kind: 'image',
        name: img.fileName || 'Foto',
        zone: '',
        date: seg.date || (takenAt ? takenAt.slice(0, 10) : ''),
        captureDate: takenAt ? takenAt.slice(0, 10) : '',
        captureDateTime: takenAt,
        documentDate: '',
        thumb: thumb,
        url: txt(img.openRef),
        previewMissing: !thumb,
        captureDateMismatch: false,
      };
    });
  }

  function renderImages(seg) {
    if (!seg.images.length) return '';
    var grid = global.__ccoReferensPhotoGrid;
    if (typeof grid === 'function') {
      try {
        var html = grid(buildPhotoItems(seg), 'gk-foto-grid--journal');
        if (html) return html;
      } catch (e) {
        /* faller igenom till enkla rader */
      }
    }
    // Fallback om foto-griden inte finns (modulen laddad fristående).
    return seg.images
      .map(function (img) {
        var rowMeta = [img.timeLabel, img.fileName].filter(Boolean).join(' · ');
        return openRow(img.fileName || 'Bild', rowMeta, img.openRef);
      })
      .join('');
  }

  function renderSegment(seg) {
    var pills = '';
    if (seg.visitTypeLabel) {
      pills += '<span class="dtag cure">' + esc(seg.visitTypeLabel) + '</span>';
    }
    if (seg.reviewBucket) {
      pills += '<span class="pill p-block">Behöver granskning</span>';
    } else if (seg.uncertain) {
      pills += '<span class="pill p-warn">Osäkert</span>';
    }

    var meta = [];
    if (seg.timeRange) meta.push(esc(seg.timeRange));
    meta.push(seg.images.length + ' bild' + (seg.images.length === 1 ? '' : 'er'));
    if (seg.documents.length) {
      meta.push(seg.documents.length + ' dokument');
    }

    var reasonsHtml =
      seg.uncertain && seg.reasonLabels.length
        ? '<div class="empty">Osäkerhet: ' +
          seg.reasonLabels
            .map(function (r) {
              return esc(r);
            })
            .join(' · ') +
          '</div>'
        : '';

    var imageGrid = renderImages(seg);

    var documentRows = seg.documents
      .map(function (docFile) {
        var rowMeta = [docFile.documentDate, docFile.type].filter(Boolean).join(' · ');
        return openRow(docFile.fileName || 'Dokument', rowMeta, docFile.openRef);
      })
      .join('');

    var bodyInner =
      reasonsHtml +
      (imageGrid ? '<div class="gk-sub">Bilder</div>' + imageGrid : '') +
      (documentRows ? '<div class="gk-sub">Dokument</div>' + documentRows : '') +
      (!imageGrid && !documentRows ? '<div class="empty">Inga filer.</div>' : '');

    return (
      '<details class="kk-besok"><summary>' +
      '<span class="kk-besok-d">' +
      esc(seg.heading) +
      (pills ? ' ' + pills : '') +
      '</span><span class="kk-besok-m">' +
      meta.join(' · ') +
      '</span></summary><div class="kk-besok-body">' +
      bodyInner +
      '</div></details>'
    );
  }

  function renderSectionHtml(viewModel) {
    var segments = (viewModel && viewModel.segments) || [];
    var body = segments.length
      ? segments.map(renderSegment).join('')
      : '<div class="empty">Inga besök/tillfällen ännu.</div>';
    // data-sek="besok" → tar över "Besök"-platsen (och dess nav-chip) från den
    // fil-härledda sektionen som döljs när denna hydreras med data.
    return (
      '<details class="dossier-section" data-sek="besok" data-kk-visit-segments-section open>' +
      '<summary>Besök/tillfällen<span class="count">' +
      segments.length +
      '</span></summary><div class="dossier-section-body">' +
      body +
      '</div></details>'
    );
  }

  function readToken() {
    try {
      return (
        global.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        global.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (e) {
      return '';
    }
  }

  function fetchVisitSegments(patientId, opts) {
    opts = opts || {};
    var pid = txt(patientId);
    var fetchImpl = opts.fetchImpl || global.fetch;
    if (!pid || typeof fetchImpl !== 'function') {
      return Promise.reject(new Error('visit-segments: patientId/fetch saknas'));
    }
    var token = opts.token != null ? opts.token : readToken();
    var headers =
      token && token !== '__preview_local__' ? { Authorization: 'Bearer ' + token } : {};
    return fetchImpl(
      '/api/v1/cco-patient-master/patient/visit-segments?patientId=' + encodeURIComponent(pid),
      { credentials: 'same-origin', headers: headers }
    ).then(function (res) {
      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
      return res.json();
    });
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  // Den fil-härledda "Besök"-sektionen är fallback: dölj den först när den
  // API-backade sektionen faktiskt har data att ta över med.
  function removeLegacyBesok(scope) {
    var root = scope && scope.querySelectorAll ? scope : doc;
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-kk-besok-legacy]'), removeNode);
  }

  // ---- Self-mount: hitta placeholder [data-kk-visit-segments], hämta & rendera ----
  function hydrate(el, opts) {
    if (!el || typeof el.getAttribute !== 'function') return;
    var state = el.getAttribute('data-kk-vs-state');
    if (state === 'loading' || state === 'done') return;
    var pid = txt(el.getAttribute('data-patient-id'));
    if (!pid) return;
    var doss = (el.closest && el.closest('.doss')) || doc;
    el.setAttribute('data-kk-vs-state', 'loading');
    fetchVisitSegments(pid, opts || {})
      .then(function (payload) {
        var vm = buildViewModel(payload);
        if (!vm.segments.length) {
          // Ingen API-data → behåll den fil-härledda "Besök" som fallback.
          el.setAttribute('data-kk-vs-state', 'empty');
          removeNode(el);
          return;
        }
        var holder = doc.createElement('div');
        holder.innerHTML = renderSectionHtml(vm);
        var node = holder.firstElementChild;
        if (!node || !el.parentNode) {
          el.setAttribute('data-kk-vs-state', 'error');
          removeNode(el);
          return;
        }
        el.parentNode.replaceChild(node, el);
        // API-sektionen tar över "Besök" — ta bort den fil-härledda dubbletten.
        removeLegacyBesok(doss);
        // Ladda besöksbilderna via kundkortets befintliga säkra foto-hydrering.
        if (typeof global.__gkHydrateSecurePhotos === 'function') {
          try {
            global.__gkHydrateSecurePhotos(node);
          } catch (e) {
            /* bilderna kan fortfarande öppnas via länk */
          }
        }
      })
      .catch(function () {
        // Fel → behåll legacy som fallback, ta bort placeholdern tyst.
        el.setAttribute('data-kk-vs-state', 'error');
        removeNode(el);
      });
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : doc;
    if (!scope || !scope.querySelectorAll) return;
    var nodes = scope.querySelectorAll('[data-kk-visit-segments]:not([data-kk-vs-state])');
    Array.prototype.forEach.call(nodes, function (el) {
      hydrate(el);
    });
  }

  var scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    var run = function () {
      scanQueued = false;
      scan(doc);
    };
    if (global.requestAnimationFrame) global.requestAnimationFrame(run);
    else global.setTimeout(run, 16);
  }

  function observe() {
    if (!doc || global.__kkVisitSegmentsObserving) return;
    global.__kkVisitSegmentsObserving = true;
    scan(doc);
    if (global.MutationObserver) {
      var mo = new global.MutationObserver(function () {
        queueScan();
      });
      mo.observe(doc.documentElement || doc.body || doc, { childList: true, subtree: true });
    }
  }

  global.CcoKundkortVisitSegments = Object.freeze({
    buildViewModel: buildViewModel,
    buildSegmentViewModel: buildSegmentViewModel,
    renderSectionHtml: renderSectionHtml,
    fetchVisitSegments: fetchVisitSegments,
    hydrate: hydrate,
    observe: observe,
    reasonLabel: function (code) {
      return REASON_LABELS[code] || code;
    },
  });

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', observe);
    else observe();
  }
})(typeof window !== 'undefined' ? window : globalThis);
