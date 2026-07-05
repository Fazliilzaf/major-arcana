/* global window */
'use strict';

/**
 * Read-only Besök/tillfällen UI — data from GET /patient/visit-segments.
 * Uses existing kk-besok / gk-med-doc / gk-foto-grid markup (no new design).
 */
(function initCcoKundkortVisitSegments(global) {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var VISIT_TYPE_LABELS = {
    operation: 'Operation',
    consultation: 'Konsultation',
    followup: 'Uppföljning',
    prp: 'PRP',
    unknown: '',
  };

  var REASON_LABELS = {
    missing_visit_date: 'Datum saknas',
    capture_document_date_mismatch: 'Foto- och dokumentdatum skiljer',
    date_without_time_metadata: 'Datum utan tid',
    occasion_context_only: 'Datum från tillfälle, saknar tid',
    inferred_from_path_or_filename: 'Datum gissat från filnamn/sökväg',
    same_day_time_cluster: 'Flera besök samma dag (tidskluster)',
    uncertain_document_date_binding: 'Osäker dokumentkoppling',
    document_shared_across_same_day_clusters: 'Dokument delat mellan besök samma dag',
  };

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function authHeaders(token) {
    return token && token !== '__preview_local__' ? { Authorization: 'Bearer ' + token } : {};
  }

  function readStaffToken() {
    try {
      return (
        global.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        global.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (_err) {
      return '';
    }
  }

  function fetchVisitSegments(patientId, token) {
    var pid = String(patientId || '').trim();
    if (!pid) return Promise.resolve([]);
    var headers = authHeaders(token || readStaffToken());
    return fetch(
      '/api/v1/cco-patient-master/patient/visit-segments?patientId=' + encodeURIComponent(pid),
      { credentials: 'same-origin', headers: headers }
    )
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        return asArray(body && body.visitSegments);
      });
  }

  function fetchVisitSegmentsOrEmpty(patientId, token) {
    return fetchVisitSegments(patientId, token).catch(function () {
      return [];
    });
  }

  function visitTypeText(visitType) {
    return VISIT_TYPE_LABELS[String(visitType || 'unknown')] || '';
  }

  function formatReasons(reasons, confidence) {
    var list = asArray(reasons)
      .map(function (code) {
        return REASON_LABELS[code] || code;
      })
      .filter(Boolean);
    if (confidence && confidence !== 'high' && !list.length) {
      list.push('Osäker koppling');
    }
    return list;
  }

  function segmentSummaryLabel(segment) {
    var parts = [segment.label || ''];
    var vt = visitTypeText(segment.visitType);
    if (vt) parts.push(vt);
    if (segment.timeRange) parts.push(segment.timeRange);
    return parts.filter(Boolean).join(' · ');
  }

  function segmentMetaCounts(segment) {
    var parts = [];
    var imgN = asArray(segment.images).length;
    var docN = asArray(segment.documents).length;
    if (imgN) parts.push(imgN + (imgN === 1 ? ' foto' : ' foton'));
    if (docN) parts.push(docN + (docN === 1 ? ' dokument' : ' dokument'));
    return parts.join(' · ') || '0 filer';
  }

  function mapImageToGridItem(image) {
    var takenAt = String(image.takenAt || '');
    return {
      id: image.assetId || '',
      sourceAssetId: image.assetId || '',
      name: image.fileName || 'Foto',
      date: takenAt.slice(0, 10),
      captureDate: takenAt.slice(0, 10),
      captureDateTime: takenAt,
      sortKey: takenAt,
      url: image.openRef || '',
      thumb: image.thumbnailUrl || image.openRef || '',
      previewMissing: !image.thumbnailUrl && !image.openRef,
      kind: 'image',
      offerReady: false,
    };
  }

  function renderSegmentBody(segment, helpers) {
    var escFn = helpers.esc || esc;
    var buildDocViewRow = helpers.buildDocViewRow;
    var gkSharedPhotoGrid = helpers.gkSharedPhotoGrid;
    var html = '';

    var reasons = formatReasons(segment.reasons, segment.confidence);
    if (segment.confidence && segment.confidence !== 'high') {
      html +=
        '<div class="gk-sub kk-besok-uncertain" data-visit-confidence="' +
        escFn(segment.confidence) +
        '">' +
        escFn(
          (segment.confidence === 'low' ? 'Osäker koppling' : 'Kontrollera koppling') +
            (reasons.length ? ': ' + reasons.join(' · ') : '')
        ) +
        '</div>';
    } else if (reasons.length) {
      html += '<div class="gk-sub kk-besok-uncertain">' + escFn(reasons.join(' · ')) + '</div>';
    }

    var images = asArray(segment.images);
    if (images.length && gkSharedPhotoGrid) {
      var mediaRows = images.map(mapImageToGridItem);
      var visitCollapsed = mediaRows.length > 12;
      html +=
        '<div class="gk-visit-photos"><div class="gk-visit-label">Bilder och film</div>' +
        gkSharedPhotoGrid(
          mediaRows,
          'gk-foto-grid--journal' + (visitCollapsed ? ' is-collapsed' : '')
        ) +
        (visitCollapsed
          ? '<button type="button" class="gk-btn gk-visit-media-toggle" data-gk-toggle-visit-media>Visa alla ' +
            mediaRows.length +
            '</button>'
          : '') +
        '</div>';
    }

    html += asArray(segment.documents)
      .map(function (doc) {
        var metaParts = [];
        if (doc.documentDate) metaParts.push(doc.documentDate);
        if (doc.type) metaParts.push(doc.type);
        if (segment.reasons && segment.reasons.indexOf('uncertain_document_date_binding') >= 0) {
          metaParts.push('Osäker datumkoppling');
        }
        return buildDocViewRow(
          doc.fileName || 'Dokument',
          metaParts.join(' · ') || 'Dokument',
          doc.openRef || '',
          'besok_seg_' + (doc.assetId || doc.fileName || 'doc')
        );
      })
      .join('');

    return html;
  }

  function renderBesokInnerFromVisitSegments(visitSegments, helpers) {
    var escFn = helpers.esc || esc;
    var segments = asArray(visitSegments);
    if (!segments.length) return '';
    return segments
      .map(function (segment, index) {
        var body = renderSegmentBody(segment, helpers);
        var confidenceBadge =
          segment.confidence && segment.confidence !== 'high'
            ? ' <span class="gk-pill gk-tag-warn">' +
              escFn(segment.confidence === 'low' ? 'Osäker' : 'Kontrollera') +
              '</span>'
            : '';
        return (
          '<details class="kk-besok" data-visit-segment-index="' +
          index +
          '"><summary><span class="kk-besok-d">' +
          escFn(segmentSummaryLabel(segment)) +
          '</span><span class="kk-besok-m">' +
          escFn(segmentMetaCounts(segment)) +
          confidenceBadge +
          '</span></summary><div class="kk-besok-body">' +
          body +
          '</div></details>'
        );
      })
      .join('');
  }

  function countDatedSegments(visitSegments) {
    return asArray(visitSegments).filter(function (segment) {
      return segment && segment.date;
    }).length;
  }

  function patchBesokSection(patientId, visitSegments, helpers) {
    var root = global.document && global.document.querySelector('.kkref .doss');
    if (!root) return false;
    var section = root.querySelector('[data-sek="besok"]');
    if (!section) return false;
    var body = section.querySelector('.dossier-section-body');
    var countEl = section.querySelector('summary .count');
    var inner = renderBesokInnerFromVisitSegments(visitSegments, helpers);
    if (body) {
      body.innerHTML = inner || helpers.empty('Inga besök registrerade.');
    }
    if (countEl) {
      countEl.textContent = String(countDatedSegments(visitSegments));
    }
    if (typeof global.__gkRevealDeferredPhotos === 'function') {
      global.__gkRevealDeferredPhotos(body);
    }
    return true;
  }

  global.CcoKundkortVisitSegments = {
    REASON_LABELS: REASON_LABELS,
    VISIT_TYPE_LABELS: VISIT_TYPE_LABELS,
    fetchVisitSegments: fetchVisitSegments,
    fetchVisitSegmentsOrEmpty: fetchVisitSegmentsOrEmpty,
    renderBesokInnerFromVisitSegments: renderBesokInnerFromVisitSegments,
    patchBesokSection: patchBesokSection,
    countDatedSegments: countDatedSegments,
  };
})(window);
