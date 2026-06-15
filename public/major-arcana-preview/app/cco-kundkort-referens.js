/* Kundkort REFERENS-renderare — emitterar exakt REFERENS-markup (.kkref .doss).
   Defensiv databindning: riktig data ELLER tomt läge. ALDRIG demo-data på riktig patient.
   Exponeras som window.__renderReferensKundkort(card, bundle, journalEntries, extras). */
(function () {
  'use strict';
  var CANONICAL_SIGNAL_IDS = {
    'customer.missing_health_declaration': 1,
    'customer.missing_journal': 1,
    'customer.missing_treatment_plan': 1,
    'customer.cooling_off_active': 1,
    'customer.cooling_off_passed': 1,
    'customer.missing_agreement_consent_bundle': 1,
    'customer.missing_operation_day_insurance': 1,
    'customer.missing_photo_consent': 1,
    'customer.has_photo_review': 1,
    'customer.ready_for_treatment': 1,
  };
  // Blockerare/gates = måsten som STOPPAR resan → Smart nästa steg.
  // Allt annat (positiva lägen, möjligheter) → Insikter.
  var BLOCKER_SIGNAL_IDS = {
    'customer.missing_health_declaration': 1,
    'customer.missing_journal': 1,
    'customer.missing_treatment_plan': 1,
    'customer.cooling_off_active': 1,
    'customer.cooling_off_passed': 1,
    'customer.missing_agreement_consent_bundle': 1,
    'customer.missing_operation_day_insurance': 1,
    'customer.missing_photo_consent': 1,
  };
  function isBlockerSignal(s) {
    return !!(s && BLOCKER_SIGNAL_IDS[String(s.ruleId || s.id || '')]);
  }
  // Mänsklig svensk undertext per signal (visas i stället för det råa regel-ID:t).
  var SIGNAL_SUBTEXT = {
    'customer.missing_health_declaration': 'Krävs före konsultationen',
    'customer.missing_journal': 'Journal saknas för besöket',
    'customer.missing_treatment_plan': 'Offert/behandlingsplan saknas',
    'customer.cooling_off_active': 'Betänketid pågår (2 dygn)',
    'customer.cooling_off_passed': 'Betänketid passerad — kan signera',
    'customer.missing_agreement_consent_bundle': 'Avtal + samtycke ej signerat',
    'customer.missing_operation_day_insurance': 'Friskförsäkran krävs på operationsdagen',
    'customer.missing_photo_consent': 'Foto-samtycke saknas',
    'customer.has_photo_review': 'Foton att granska',
    'customer.ready_for_treatment': 'Allt klart inför behandling',
  };
  function signalSub(s) {
    var id = String((s && (s.ruleId || s.id)) || '');
    return SIGNAL_SUBTEXT[id] || (s && (s.why || s.detail || s.hint)) || '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var A = function (x) {
    return Array.isArray(x) ? x : x ? [x] : [];
  };
  function gkDeferredPhotoLimit(cls) {
    var c = String(cls || '');
    if (c.indexOf('is-collapsed') === -1) return 0;
    if (c.indexOf('gk-foto-grid--journal') !== -1) return 12;
    if (c.indexOf('gk-foto-grid--all') !== -1) return 24;
    return 0;
  }
  function driveDedupeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }
  function normalizeDriveDedupePath(value) {
    return driveDedupeText(value)
      .replace(/^bokade\//, '')
      .replace(/^hair tp clinic 20\d{2}\//, '')
      .replace(/^kunder htp\//, '');
  }
  function driveFileDedupeKey(file) {
    if (!file || typeof file !== 'object') return '';
    var driveId = driveDedupeText(file.driveFileId || file.googleDriveId || file.fileId);
    if (driveId) return 'drive:' + driveId;
    var sourceId = driveDedupeText(file.sourceRecordId || file.sourceId);
    if (sourceId) return 'source:' + sourceId;
    var pathKey = normalizeDriveDedupePath(
      file.normalizedPath ||
        file.relativePath ||
        file.path ||
        file.sourcePath ||
        file.drivePath ||
        file.folderPath
    );
    if (pathKey) return 'path:' + pathKey;
    var name = normalizeDriveDedupePath(file.fileName || file.originalFileName || file.name);
    var ts = driveDedupeText(file.modifiedTime || file.documentDate || file.indexedAt);
    return name ? 'name:' + name + ':' + ts : '';
  }
  function driveFilePreviewRank(file) {
    var mime = driveDedupeText(file && (file.mimeType || file.contentType));
    var name = driveDedupeText(file && (file.fileName || file.originalFileName || file.name));
    if (/image\/(jpeg|jpg|png|webp)/.test(mime) || /\.(jpe?g|png|webp)$/.test(name)) return 0;
    if (/image\/(heic|heif)/.test(mime) || /\.(heic|heif)$/.test(name)) return 1;
    if (/^video\//.test(mime) || /\.(mp4|mov|m4v|webm)$/.test(name)) return 2;
    if (/image\/x-adobe-dng/.test(mime) || /\.dng$/.test(name)) return 4;
    return 3;
  }
  function cleanName(f) {
    var n = String((f && f.fileName) || '');
    if (/\?\?\?|\+\?|�/.test(n)) {
      var ft = f && f.fileType ? f.fileType : '';
      return ft === 'journal_pdf'
        ? 'Journal'
        : ft === 'image'
          ? 'Foto'
          : /friskf/i.test(n)
            ? 'Friskförsäkran'
            : 'Dokument';
    }
    return n.replace(/\.(pdf|jpe?g|png|heic|webp|docx?)$/i, '');
  }
  function dedupeDriveFiles(files) {
    var seen = {};
    var rows = [];
    A(files)
      .slice()
      .sort(function (a, b) {
        return driveFilePreviewRank(a) - driveFilePreviewRank(b);
      })
      .forEach(function (file) {
        var key = driveFileDedupeKey(file);
        if (key && seen[key]) return;
        if (key) seen[key] = true;
        rows.push(file);
      });
    return rows;
  }
  function isReferensImageFile(file) {
    var mime = driveDedupeText(file && (file.mimeType || file.contentType));
    var type = driveDedupeText(file && file.fileType);
    var category = driveDedupeText(file && file.category);
    var name = driveDedupeText(
      file &&
        (file.fileName ||
          file.originalFileName ||
          file.relativePath ||
          file.name ||
          file.title ||
          file.displayName)
    );
    var isPhotoCategory =
      /^(photo|image)_(before|during|after|overview|donor|hairline|crown)$/.test(category);
    var isPhotoLabel = /(^|\s·\s)(foto|photo)(\s·|$)/.test(name) && !/samtycke|consent/.test(name);
    var isTreatmentPhotoLabel =
      /^\d{4}-\d{2}-\d{2}\s·\s/.test(name) &&
      /\s·\s(före|fore|before|under|efter|after|översikt|oversikt|overview|donator|donor|hårlinje|harlinje|hairline|krona|crown|fue operation|prp)(\s·|$)/.test(
        name
      ) &&
      !/\.(pdf|docx?|rtf|odt|xlsx?|csv|txt)$/.test(name);
    return (
      type === 'image' ||
      mime.indexOf('image/') === 0 ||
      isPhotoCategory ||
      isPhotoLabel ||
      isTreatmentPhotoLabel ||
      /\.(heic|heif|jpe?g|png|webp|gif)$/.test(name)
    );
  }
  function isReferensVideoFile(file) {
    var mime = driveDedupeText(file && (file.mimeType || file.contentType));
    var type = driveDedupeText(file && file.fileType);
    var category = driveDedupeText(file && file.category);
    var name = driveDedupeText(
      file &&
        (file.fileName ||
          file.originalFileName ||
          file.relativePath ||
          file.name ||
          file.title ||
          file.displayName)
    );
    var isVideoCategory = /^(video|film)_(before|during|after|overview|donor|hairline|crown)$/.test(
      category
    );
    var isVideoLabel = /(^|\s·\s)(film|video)(\s·|$)/.test(name);
    return (
      type === 'video' ||
      mime.indexOf('video/') === 0 ||
      isVideoCategory ||
      isVideoLabel ||
      /\.(mp4|mov|m4v|webm)$/i.test(name)
    );
  }
  function isReferensMediaFile(file) {
    return isReferensImageFile(file) || isReferensVideoFile(file);
  }
  function looksLikeReferensMediaLabel(value) {
    var name = driveDedupeText(value);
    return (
      /(^|\s·\s)(foto|photo|film|video)(\s·|$)/.test(name) ||
      (/^\d{4}-\d{2}-\d{2}\s·\s/.test(name) &&
        /\s·\s(före|fore|before|under|efter|after|översikt|oversikt|overview|donator|donor|hårlinje|harlinje|hairline|krona|crown|fue operation|prp)(\s·|$)/.test(
          name
        ) &&
        !/\.(pdf|docx?|rtf|odt|xlsx?|csv|txt)$/.test(name))
    );
  }
  function isReferensDocumentFile(file) {
    var label =
      file &&
      (file.fileName ||
        file.originalFileName ||
        file.relativePath ||
        file.name ||
        file.title ||
        file.displayName);
    return !isReferensMediaFile(file) && !looksLikeReferensMediaLabel(label);
  }
  function isReferensBrowserImageFile(file) {
    var mime = driveDedupeText(file && (file.mimeType || file.contentType));
    var name = driveDedupeText(file && (file.fileName || file.originalFileName || file.name));
    return /image\/(jpe?g|png|webp|gif)/.test(mime) || /\.(jpe?g|png|webp|gif)$/.test(name);
  }
  function isReferensPatientAssetFile(file) {
    return Boolean(file && (file.source === 'patient_asset' || file.assetId || file.sourceAssetId));
  }
  var SHARED_MND = [
    'jan',
    'feb',
    'mar',
    'apr',
    'maj',
    'jun',
    'jul',
    'aug',
    'sep',
    'okt',
    'nov',
    'dec',
  ];
  function gkSharedZoneOf(value) {
    var l = driveDedupeText(value);
    if (/h[åa]rlinj|hairlin|front|panna|forehead|temporal|tinning/.test(l)) return 'Hårlinje';
    if (/krona|crown|vertex|hj[äa]ss|virvel/.test(l)) return 'Krona';
    if (/donor|nack|occip|baksid/.test(l)) return 'Donator';
    return 'Översikt';
  }
  function gkSharedDateOfFile(file) {
    var direct = gkSharedSortKeyOfFile(file).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    var source = String(
      (file && (file.relativePath || file.fileName || file.originalFileName || file.name)) || ''
    );
    var m = source.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var epoch = source.match(/\b(1[0-9]{9})\b/);
    if (epoch) {
      var date = new Date(Number(epoch[1]) * 1000);
      if (!isNaN(date)) return date.toISOString().slice(0, 10);
    }
    return '';
  }
  function gkSharedNormalizeDateTime(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var exif = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (exif) {
      return (
        exif[1] +
        '-' +
        exif[2] +
        '-' +
        exif[3] +
        'T' +
        exif[4] +
        ':' +
        exif[5] +
        ':' +
        (exif[6] || '00')
      );
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T00:00:00';
    var iso = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
    if (iso) return iso[1] + 'T' + (iso[2].length === 5 ? iso[2] + ':00' : iso[2]);
    var parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    return '';
  }
  function gkSharedSortKeyOfFile(file) {
    var direct = gkSharedNormalizeDateTime(file && (file.timelineSortKey || file.timelineDate));
    if (direct) return direct;
    return referensTimelineSortKey(file);
  }
  function gkSharedPhotoSortNewest(a, b) {
    var ak = String((a && (a.sortKey || a.date)) || '');
    var bk = String((b && (b.sortKey || b.date)) || '');
    if (ak !== bk) return bk.localeCompare(ak);
    return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
  }
  function gkSharedDocumentDateOfFile(file) {
    var direct = String(
      (file && (file.documentDate || file.visitDate || file.photoDate)) || ''
    ).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : gkSharedDateOfFile(file);
  }
  function gkSharedCaptureDateOfFile(file) {
    var direct = String((file && (file.captureDate || file.captureDateTime)) || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : '';
  }
  function gkSharedFmtDate(value) {
    if (!value) return 'odaterat';
    var p = String(value).split('-');
    var year = Number(p[0]);
    var month = Number(p[1]);
    var day = Number(p[2]);
    if (!year || !month || !day) return value;
    return (
      day +
      ' ' +
      (SHARED_MND[month - 1] || '') +
      (year === new Date().getFullYear() ? '' : ' ' + year)
    );
  }
  function gkSelectedForFromFile(file) {
    var tech = (file && file.technicalInfo) || {};
    var meta = (file && (file.meta || file.metadata)) || {};
    var raw = (file && file.selectedFor) || tech.selectedFor || meta.selectedFor || [];
    return A(raw)
      .map(function (v) {
        return String(v || '').trim();
      })
      .filter(Boolean);
  }
  function gkIsOfferReadyFile(file) {
    var selectedFor = gkSelectedForFromFile(file);
    var stage = String((file && file.imageStage) || '').toLowerCase();
    return (
      stage === 'annotated' &&
      (selectedFor.indexOf('offer') >= 0 || selectedFor.indexOf('treatment_plan') >= 0)
    );
  }
  function gkIsAnnotatedFile(file) {
    if (String((file && file.imageStage) || '').toLowerCase() === 'annotated') return true;
    if (file && file.sourceAnnotationId) return true;
    var tech = (file && file.technicalInfo) || {};
    if (tech.sourceAnnotationId) return true;
    if (String((file && file.version) || '').toLowerCase() === 'annotated-v1') return true;
    var name = driveDedupeText(
      file &&
        (file.fileName || file.originalFileName || file.displayName || file.name || file.title)
    );
    return /markerad bild|annotated/i.test(name);
  }
  function gkIsOriginalVisitMediaFile(file) {
    return isReferensMediaFile(file) && !gkIsAnnotatedFile(file);
  }
  function gkSharedMediaFromFile(file) {
    var id = file && file.id ? String(file.id) : '';
    var labelSource =
      ((file && file.relativePath) || '') +
      ' ' +
      ((file && (file.fileName || file.originalFileName || file.name)) || '');
    var isVideo = isReferensVideoFile(file);
    var url =
      (file && file.viewUrl) ||
      (id ? '/api/v1/cco-patient-master/file?fileId=' + encodeURIComponent(id) : '#');
    var explicitThumb = (file && (file.thumbnailUrl || file.thumbnailLink)) || '';
    var canUseFullImage = !isVideo && isReferensBrowserImageFile(file);
    var previewUrl =
      explicitThumb ||
      (canUseFullImage && !isReferensPatientAssetFile(file) && id
        ? '/api/v1/cco-patient-master/file-preview?width=480&fileId=' + encodeURIComponent(id)
        : '');
    return {
      id: id,
      sourceAssetId: (file && (file.assetId || file.sourceAssetId || file.id)) || '',
      name:
        (file && (file.fileName || file.originalFileName || file.name || file.displayName)) || '',
      kind: isVideo ? 'video' : 'image',
      zone: gkSharedZoneOf(labelSource),
      date: gkSharedDateOfFile(file),
      documentDate: gkSharedDocumentDateOfFile(file),
      captureDate: gkSharedCaptureDateOfFile(file),
      captureDateTime: (file && file.captureDateTime) || '',
      sortKey: gkSharedSortKeyOfFile(file),
      captureDateSource: (file && file.captureDateSource) || '',
      captureDateMismatch: Boolean(
        (file && file.captureDateMismatch) ||
        (gkSharedDocumentDateOfFile(file) &&
          gkSharedCaptureDateOfFile(file) &&
          gkSharedDocumentDateOfFile(file) !== gkSharedCaptureDateOfFile(file))
      ),
      imageStage: (file && file.imageStage) || '',
      selectedFor: gkSelectedForFromFile(file),
      sourceAnnotationId: (file && file.sourceAnnotationId) || '',
      offerReady: gkIsOfferReadyFile(file),
      thumb: isVideo ? '' : previewUrl,
      url: url,
      previewMissing: !isVideo && !previewUrl,
    };
  }
  function gkSharedPhotoGrid(items, cls) {
    var list = A(items);
    if (!list.length) return '';
    var deferAfter = gkDeferredPhotoLimit(cls);
    return (
      '<div class="gk-foto-grid' +
      (cls ? ' ' + esc(cls) : '') +
      '">' +
      list
        .map(function (p, index) {
          var missingPreview = p.kind !== 'video' && p.previewMissing;
          var captureDate = p.captureDate || '';
          var dateMismatch = Boolean(
            p.captureDateMismatch ||
            (p.documentDate && captureDate && p.documentDate !== captureDate)
          );
          var src = p.thumb || (!missingPreview ? p.url : '');
          var fallback = p.url || '';
          var deferred = Boolean(deferAfter && index >= deferAfter && !missingPreview);
          var media =
            p.kind === 'video'
              ? '<video ' +
                (deferred ? 'data-gk-deferred-img-src="' : 'data-gk-img-src="') +
                esc(fallback) +
                '" muted playsinline preload="' +
                (deferred ? 'none' : 'metadata') +
                '">' +
                (deferred ? '' : '<source src="' + esc(fallback) + '">') +
                '</video><span class="gk-video-chip">Film</span>'
              : missingPreview
                ? '<div class="gk-foto-placeholder"><b>Miniatyr saknas</b><small>Original finns · behöver thumbnail</small></div>'
                : '<img ' +
                  (deferred ? 'data-gk-deferred-img-src="' : 'data-gk-img-src="') +
                  esc(src) +
                  '" ' +
                  (deferred ? 'data-gk-deferred-img-full="' : 'data-gk-img-full="') +
                  esc(fallback) +
                  '" ' +
                  (deferred ? '' : 'src="' + esc(src) + '" ') +
                  'alt="' +
                  esc(p.name || p.zone || 'Foto') +
                  '" loading="lazy" decoding="async" onerror="this.removeAttribute(&quot;src&quot;);this.closest(&quot;.gk-foto&quot;)?.classList.add(&quot;is-missing&quot;)" />';
          return (
            '<a class="gk-foto' +
            (p.kind === 'video' ? ' gk-foto--video' : '') +
            (missingPreview ? ' gk-foto--missing' : '') +
            (deferred ? ' gk-foto--deferred' : '') +
            (p.offerReady ? ' gk-foto--offer-ready' : '') +
            (dateMismatch ? ' gk-foto--date-mismatch' : '') +
            '" href="' +
            esc(p.url || '#') +
            '" data-gk-photo-kind="' +
            esc(p.kind || 'image') +
            '" data-gk-photo-id="' +
            esc(p.id || p.sourceAssetId || '') +
            '" data-gk-photo-asset="' +
            esc(p.sourceAssetId || p.id || '') +
            '" data-gk-photo-date="' +
            esc(p.date || '') +
            '" data-gk-photo-capture-date="' +
            esc(captureDate) +
            '" data-gk-photo-capture-date-time="' +
            esc(p.captureDateTime || '') +
            '" data-gk-photo-date-mismatch="' +
            (dateMismatch ? '1' : '0') +
            '" data-gk-photo-missing-preview="' +
            (missingPreview ? '1' : '0') +
            '" data-gk-photo-src="' +
            esc(fallback || src || '') +
            '" data-gk-photo-zone="' +
            esc(p.zone || '') +
            '" data-gk-photo-name="' +
            esc(p.name || '') +
            '" target="_blank" rel="noopener noreferrer" title="' +
            (p.kind === 'video' ? 'Öppna film' : 'Öppna bild') +
            '">' +
            media +
            (dateMismatch
              ? '<span class="gk-foto-date-warn">Tagen ' +
                esc(gkSharedFmtDate(captureDate)) +
                '</span>'
              : '') +
            (p.offerReady ? '<span class="gk-foto-ready-chip">Offertklar</span>' : '') +
            '<span style="position:relative;z-index:1">' +
            (p.kind === 'video' ? 'Film' : esc(p.zone || 'Foto')) +
            ' · ' +
            esc(gkSharedFmtDate(p.date)) +
            '</span><span class="gk-foto-marks">Rita · Plan · Kund</span></a>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  function gkSharedMediaCountLabel(items) {
    var list = A(items);
    var images = list.filter(function (p) {
      return p && p.kind !== 'video';
    }).length;
    var videos = list.filter(function (p) {
      return p && p.kind === 'video';
    }).length;
    var parts = [];
    if (images) parts.push(images + (images === 1 ? ' bild' : ' bilder'));
    if (videos) parts.push(videos + (videos === 1 ? ' film' : ' filmer'));
    return parts.join(' · ') || '0';
  }
  function isReferensJournalPdf(file) {
    var mime = driveDedupeText(file && (file.mimeType || file.contentType));
    var type = driveDedupeText(file && file.fileType);
    var name = driveDedupeText(file && (file.fileName || file.originalFileName || file.name));
    return type === 'journal_pdf' || mime === 'application/pdf' || /\.pdf$/.test(name);
  }
  function withUniqueReferensFileSummary(card, driveFiles) {
    if (!card || !A(driveFiles).length) return card;
    var next = Object.assign({}, card);
    next.fileSummary = Object.assign({}, card.fileSummary || {}, {
      totalFiles: driveFiles.length,
      journalPdfs: driveFiles.filter(isReferensJournalPdf).length,
      images: driveFiles.filter(isReferensImageFile).length,
      deduped: true,
    });
    return next;
  }
  function initials(name) {
    var p = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return ((p[0] || '')[0] || '?') + ((p[1] || '')[0] || '');
  }
  function ansClass(risk) {
    return risk === 'flag' ? 'a-fl' : risk === 'amber' ? 'a-am' : 'a-no';
  }
  function ansLabel(v, risk) {
    var ja = /ja|yes|true/i.test(String(v));
    var mark = risk === 'flag' || risk === 'amber' ? '⚠ ' : '';
    return ja ? mark + 'Ja' : 'Nej';
  }
  function sekSlug(label) {
    var l = String(label || '').toLowerCase();
    if (l.indexOf('hälsodek') === 0) return 'halso';
    if (l.indexOf('medicinskt') === 0) return 'halso';
    if (l.indexOf('kundresa') === 0) return 'kundresa';
    if (l.indexOf('smart nästa') === 0) return 'nastasteg';
    if (l.indexOf('op-dag') === 0) return 'opdag';
    if (l.indexOf('besök') === 0 || l.indexOf('besok') === 0) return 'besok';
    if (l.indexOf('kommande') === 0) return 'bokningar';
    if (l.indexOf('historik') === 0) return 'historik';
    if (l.indexOf('journal') === 0) return 'journal';
    if (l.indexOf('personal') === 0) return 'personal';
    if (l.indexOf('offert') === 0) return 'offert';
    if (/dokument\s*[·-]\s*registry/.test(l)) return 'dokument-registry';
    if (l.indexOf('auto') === 0) return 'auto';
    if (l.indexOf('filer') === 0 || l.indexOf('dokument') === 0) return 'dokument';
    if (l.indexOf('anteck') === 0) return 'anteckningar';
    if (l.indexOf('kommunikation') === 0) return 'kommunikation';
    if (l.indexOf('insikter') === 0) return 'insikter';
    if (l.indexOf('foto') === 0) return 'foto';
    if (l.indexOf('betalning') === 0) return 'betalning';
    if (l.indexOf('ekonomi') === 0) return 'ekonomi';
    if (l.indexOf('ta bild') === 0) return 'tabild';
    return 'sek';
  }
  // Kundrese-steg → vilken sektion man hoppar till vid klick.
  function stepJumpSlug(label) {
    var l = String(label || '').toLowerCase();
    if (/hälsodek|halsodek|friskförs|friskfors/.test(l)) return 'halso';
    if (/offert|behandlingsplan/.test(l)) return 'offert';
    if (/betänketid|betanketid|avtal|samtycke/.test(l)) return 'nastasteg';
    if (/foto/.test(l)) return 'foto';
    if (/bokning|bekräftelse|bekraftelse|konsultation/.test(l)) return 'bokningar';
    return '';
  }
  function stepMedFormSlug(label) {
    var l = String(label || '').toLowerCase();
    if (/hälsodek|halsodek/.test(l)) return 'health_declaration';
    if (/friskförs|friskfors/.test(l)) return 'fitness_certificate';
    return '';
  }
  function medFormDateLabel(form) {
    if (!form || !form.signedAt) return '';
    return gkSharedFmtDate(String(form.signedAt).slice(0, 10));
  }
  function expandMedForm(root, medForm) {
    if (!root || !medForm) return false;
    var docBtn = root.querySelector('[data-kk-med-form="' + medForm + '"][data-kk-open-doc]');
    if (docBtn && typeof window.__kkOpenDocument === 'function') {
      window.__kkOpenDocument(
        docBtn.getAttribute('data-kk-open-doc') || '',
        docBtn.getAttribute('data-kk-doc-title') || ''
      );
      docBtn.classList.add('kk-flash');
      setTimeout(function () {
        docBtn.classList.remove('kk-flash');
      }, 1200);
      return true;
    }
    var formEl = root.querySelector('[data-kk-med-form="' + medForm + '"]');
    if (!formEl) return false;
    if (formEl.tagName === 'DETAILS') formEl.open = true;
    formEl.classList.add('kk-flash');
    setTimeout(function () {
      formEl.classList.remove('kk-flash');
    }, 1200);
    try {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_e) {
      /* ignore */
    }
    return true;
  }
  window.__kkExpandMedForm = expandMedForm;
  function sec(label, src, inner) {
    // REN v9-DESKTOP: varje sektion = .dossier-section-kort (drop-in CSS, inga lager)
    return (
      '<details class="dossier-section" data-sek="' +
      sekSlug(label) +
      '" open><summary>' +
      esc(label) +
      (src ? '<span class="count">' + src + '</span>' : '') +
      '</summary><div class="dossier-section-body">' +
      inner +
      '</div></details>'
    );
  }
  function empty(t) {
    return '<div class="empty">' + esc(t) + '</div>';
  }

  function referensHasSignedHd(card) {
    return Boolean(
      card &&
      (card.hasHealthDeclaration ||
        !card.missingHealthDeclaration ||
        (card.healthDeclaration &&
          (card.healthDeclaration.signedAt || card.healthDeclaration.signed)))
    );
  }

  function resolveReferensDocs(card, bundle) {
    if (window.CcoV9CustomersParity?.resolveV11DocumentPayload) {
      return window.CcoV9CustomersParity.resolveV11DocumentPayload(card, bundle);
    }
    if (window.CcoHairtpDocumentCloud?.buildV11DocumentPayloadFromBundle) {
      var fullBundle =
        window.CcoMeridiqContent && window.CcoMeridiqContent.getFullDocumentBundle
          ? window.CcoMeridiqContent.getFullDocumentBundle()
          : null;
      if (fullBundle) {
        return window.CcoHairtpDocumentCloud.buildV11DocumentPayloadFromBundle(fullBundle);
      }
    }
    var docs = bundle && bundle.documents;
    if (docs && typeof docs === 'object' && bundle.ready !== false) {
      return {
        ready: true,
        offers: A(docs.offers || docs.offerter),
        autoDocs: A(docs.autoDokument || docs.auto || docs.autoDocuments || docs.autoDocs),
        healthForms: A(docs.healthForms || docs.haelsoSamtycke || docs.consents),
        journals: A(docs.journalStatus && docs.journalStatus.expected),
      };
    }
    return { ready: false, offers: [], autoDocs: [], healthForms: [], journals: [] };
  }

  function referensRegistryInteractive(doc) {
    var registryId = referensAutoDocRegistryId(doc);
    if (!registryId) return false;
    if (
      window.CcoHairtpDocumentCloud &&
      typeof window.CcoHairtpDocumentCloud.isInteractiveRegistryId === 'function'
    ) {
      return window.CcoHairtpDocumentCloud.isInteractiveRegistryId(registryId);
    }
    return /^auto_|^offert_/.test(registryId);
  }

  function referensRegistryDocAttrs(doc) {
    if (!referensRegistryInteractive(doc)) return '';
    var registryId = referensAutoDocRegistryId(doc);
    var filler = doc.filler || 'patient';
    var flow = doc.flow || 'tp';
    return (
      ' data-kk-registry-doc="' +
      esc(registryId) +
      '" data-v11-doc-registry="' +
      esc(registryId) +
      '" data-v11-doc-filler="' +
      esc(filler) +
      '" data-v11-doc-flow="' +
      esc(flow) +
      '" data-v11-doc-previewable="1" role="button" tabindex="0"'
    );
  }

  function referensRegistryStatusLabel(doc) {
    var status = String(doc.status || '').toLowerCase();
    if (/signed|done|klar|godk/i.test(status) || doc.statusLabel === 'Signerad') return 'Signerad';
    if (/pending|vänt|att fylla|delvis/i.test(status) || doc.statusLabel === 'Delvis') {
      return 'Att fylla';
    }
    return doc.statusLabel || 'Planerad';
  }

  function referensRegistryFillerToken(source) {
    var filler =
      source && typeof source === 'object'
        ? source.filler ||
          (source.getAttribute && source.getAttribute('data-kk-registry-filler')) ||
          'patient'
        : String(source || 'patient');
    var registryId =
      source && typeof source === 'object'
        ? source.registryId ||
          (source.getAttribute && source.getAttribute('data-kk-registry-doc')) ||
          (source.getAttribute && source.getAttribute('data-v11-doc-registry')) ||
          ''
        : '';
    filler = String(filler || 'patient');
    if (filler === 'system_auto' || filler === 'auto') return 'auto';
    if (/^auto_/.test(String(registryId || ''))) return 'auto';
    return filler;
  }

  function getReferensKkrefScroller() {
    return (
      document.querySelector('.v10-dossier-referens') ||
      document.querySelector('.kkref .doss') ||
      document.querySelector('.kkref')
    );
  }

  function referensRegistryRowMatchesFilter(row, filterState) {
    if (!row || !filterState) return true;
    var filler = referensRegistryFillerToken(row);
    var flow = row.getAttribute('data-kk-registry-flow') || '';
    var fillerOk = filterState.filler === 'all' || filler === filterState.filler;
    var flowOk = filterState.flow === 'all' || flow === filterState.flow;
    return fillerOk && flowOk;
  }

  function applyReferensRegistryFilters(root, filterState) {
    if (!root || !filterState) return;
    var kkref = root.closest && root.closest('.kkref') ? root.closest('.kkref') : root;
    if (!kkref.querySelector) kkref = document.querySelector('.kkref') || root;
    var registrySection =
      kkref.querySelector('[data-sek="dokument-registry"]') ||
      kkref.querySelector('details[data-sek="dokument"]');
    var scope = registrySection || kkref;
    var rows = scope.querySelectorAll('[data-kk-registry-row]');
    var visible = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var show = referensRegistryRowMatchesFilter(row, filterState);
      row.hidden = !show;
      if (show) visible += 1;
    }
    var autoSection = kkref.querySelector('[data-sek="auto"]');
    if (autoSection) {
      autoSection.hidden = filterState.filler !== 'all';
    }
    if (registrySection) {
      var countEl = registrySection.querySelector('.count');
      if (countEl) {
        countEl.textContent =
          filterState.filler === 'all' && filterState.flow === 'all'
            ? String(rows.length)
            : String(visible);
      }
      if (filterState.filler !== 'all' || filterState.flow !== 'all') {
        registrySection.open = true;
        var sc = getReferensKkrefScroller();
        if (sc && registrySection.offsetTop != null) {
          try {
            sc.scrollTo({ top: registrySection.offsetTop - sc.offsetTop - 8, behavior: 'smooth' });
          } catch (_scrollErr) {
            /* ignore */
          }
        }
      }
    }
  }

  function buildReferensRegistryDocsSection(docsPayload) {
    if (!docsPayload || !docsPayload.ready) return '';
    var rows = []
      .concat(
        A(docsPayload.offers),
        A(docsPayload.healthForms),
        A(docsPayload.journals),
        A(docsPayload.autoDocs)
      )
      .filter(function (doc) {
        return doc && (doc.registryId || doc.title);
      });
    if (!rows.length) return '';
    var filters =
      '<div class="kk-registry-filters" data-kk-registry-filters aria-label="Dokumentfilter">' +
      '<button type="button" class="kk-registry-filter is-active" data-kk-registry-filter="filler" data-kk-registry-value="all">Alla</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="filler" data-kk-registry-value="patient">Kund</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="filler" data-kk-registry-value="staff">Personal</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="filler" data-kk-registry-value="auto">Auto</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="flow" data-kk-registry-value="all">Alla flöden</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="flow" data-kk-registry-value="tp">TP</button>' +
      '<button type="button" class="kk-registry-filter" data-kk-registry-filter="flow" data-kk-registry-value="prp_hair">PRP</button>' +
      '</div>';
    var body = rows
      .map(function (doc) {
        var registryId = referensAutoDocRegistryId(doc);
        var filler = referensRegistryFillerToken(doc);
        var flow = doc.flow || 'tp';
        var step =
          doc.journeyStep != null && doc.journeyStep !== '' ? 'Steg ' + doc.journeyStep : '';
        var prep = doc.contentStatus ? String(doc.contentStatus) : '';
        var blocker =
          prep && prep !== 'FULL' && A(doc.blockers).length
            ? '<span class="kk-registry-blocker" title="' + esc(doc.blockers[0]) + '">!</span>'
            : '';
        var attrs = referensRegistryDocAttrs(doc);
        return (
          '<div class="row kk-registry-row' +
          (attrs ? ' kk-registry-row--clickable' : '') +
          '" data-kk-registry-row data-kk-registry-filler="' +
          esc(filler) +
          '" data-kk-registry-flow="' +
          esc(flow) +
          '"' +
          attrs +
          '><div style="flex:1"><div class="rt">' +
          esc(doc.title || registryId) +
          '</div><div class="rm">' +
          esc([step, flow.toUpperCase(), prep].filter(Boolean).join(' · ')) +
          '</div></div>' +
          blocker +
          '<span class="pill">' +
          esc(referensRegistryStatusLabel(doc)) +
          '</span>' +
          (attrs ? '<span class="kk-auto-doc-preview-label" aria-hidden="true">Öppna</span>' : '') +
          '</div>'
        );
      })
      .join('');
    return sec('Dokument · registry', String(rows.length), filters + body);
  }

  function referensAutoDocRegistryId(doc) {
    return String(
      (doc &&
        (doc.registryId ||
          doc.documentTypeId ||
          doc.typeId ||
          doc.templateId ||
          doc.id ||
          doc.key)) ||
        ''
    );
  }

  function referensAutoDocPreviewAttrs(doc) {
    var registryId = referensAutoDocRegistryId(doc);
    if (!/^auto_/.test(registryId)) return '';
    var safeId = esc(registryId);
    return (
      ' data-kk-auto-doc-preview="' +
      safeId +
      '" data-v11-doc-row data-v11-doc-registry="' +
      safeId +
      '" data-v11-doc-filler="auto" data-v11-doc-previewable="1" role="button" tabindex="0"'
    );
  }

  function resolveReferensOffers(docsPayload, commercialCase) {
    var offers = A(docsPayload.offers);
    var ccOffer = commercialCase && (commercialCase.offer || commercialCase.activeOffer);
    if (ccOffer && typeof ccOffer === 'object') {
      var exists = offers.some(function (o) {
        return String(o.id || o.offerId || '') === String(ccOffer.id || ccOffer.offerId || '');
      });
      if (!exists) {
        offers.unshift({
          type: ccOffer.templateKey || ccOffer.type || 'TP',
          title: ccOffer.title || ccOffer.name || 'Offert',
          detail: ccOffer.amountLabel || ccOffer.totalLabel || '',
          status: ccOffer.status || ccOffer.esignStatus || 'pending',
        });
      }
    }
    return offers;
  }

  function resolveReferensPhotos(card, driveFiles) {
    var tiles = [];
    dedupeDriveFiles(driveFiles).forEach(function (f) {
      var mime = String(f.mimeType || f.contentType || '').toLowerCase();
      var rawName = f.originalFileName || f.fileName || f.name || '';
      var name = String(rawName).toLowerCase();
      if (
        !isReferensImageFile(f) &&
        !mime.startsWith('image/') &&
        !/\.(jpe?g|heif|png|heic|webp|gif)$/i.test(name)
      )
        return;
      tiles.push({
        type: f.category || f.photoType || 'Foto',
        name: rawName || 'Foto',
        count: 1,
      });
    });
    return tiles;
  }

  function hdSourceLabel(hd, card) {
    if (!hd) return '';
    if (hd.signedAt || hd.signed) {
      var src = hd.sourceSystem || hd.source || card.healthDeclarationSource || '';
      if (/halso|m365/i.test(String(src))) return 'halso@';
      return '';
    }
    return '';
  }

  function formSigned(form, card, hasKey, missingKey) {
    if (form && (form.signedAt || form.signed)) return true;
    if (card && card[hasKey] === true) return true;
    if (card && card[missingKey] === false) return true;
    return false;
  }

  function referensTimelineSortKey(file) {
    var candidates = [
      file && file.timelineSortKey,
      file && file.timelineDate,
      file && file.captureDateTime,
      file && file.captureDate,
      file && file.documentDate,
      file && file.visitDate,
      file && file.photoDate,
      file && file.importedAt,
      file && file.indexedAt,
      file && file.modifiedTime,
      file && file.createdAt,
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var key = gkSharedNormalizeDateTime(candidates[i]);
      if (key) return key;
    }
    return '';
  }
  function referensTimelineTs(file) {
    var key = referensTimelineSortKey(file);
    var ts = Date.parse(key);
    return Number.isFinite(ts) ? ts : 0;
  }
  function referensCompareNewestFirst(a, b) {
    var diff = referensTimelineTs(b) - referensTimelineTs(a);
    if (diff !== 0) return diff;
    return String((a && a.id) || (a && a.fileName) || '').localeCompare(
      String((b && b.id) || (b && b.fileName) || '')
    );
  }

  function referensFileViewUrl(file) {
    if (!file) return '';
    if (file.viewUrl) return file.viewUrl;
    var id = file.id || file.fileId || file.assetId;
    if (id) {
      if (file.source === 'patient_asset' || file.assetId) {
        return '/api/v1/cco/assets/' + encodeURIComponent(id) + '/download?inline=1';
      }
      return '/api/v1/cco-patient-master/file?fileId=' + encodeURIComponent(id);
    }
    return '';
  }

  function referensFileLabel(file, fallback) {
    var n = String(
      (file && (file.fileName || file.name || file.originalFileName || file.relativePath)) || ''
    );
    if (/\?\?\?|\+\?|�/.test(n)) {
      var ft = (file && file.fileType) || '';
      if (ft === 'journal_pdf') return fallback || 'Journal';
      return fallback || 'Dokument';
    }
    return n.replace(/\.(pdf|jpe?g|png|heic|webp|docx?)$/i, '') || fallback || 'Dokument';
  }

  function isReferensTreatmentJournalPdf(file) {
    if (!file || !isReferensJournalPdf(file)) return false;
    if (String(file.category || '').toLowerCase() === 'form') return false;
    var name = String(
      file.fileName || file.name || file.originalFileName || file.relativePath || ''
    ).toLowerCase();
    if (/h[aä]lsodek|halsodek|health.?decl|friskf[oö]rs[aä]kr|fitness.?cert/.test(name)) {
      return false;
    }
    return true;
  }

  function referensAttachmentViewUrl(att) {
    if (!att || typeof att !== 'object') return '';
    if (att.viewUrl) return att.viewUrl;
    var id = att.assetId || att.id;
    if (id) return '/api/v1/cco/assets/' + encodeURIComponent(id) + '/download?inline=1';
    return '';
  }

  function resolveJournalItemViewUrl(it, rawJournal, driveFiles) {
    if (it && it.viewUrl) return it.viewUrl;
    var fromAtt = '';
    A(rawJournal && rawJournal.attachments).some(function (att) {
      fromAtt = referensAttachmentViewUrl(att);
      return !!fromAtt;
    });
    if (fromAtt) return fromAtt;
    var itDate = String((it && it.date) || '').slice(0, 10);
    var best = '';
    var bestTs = 0;
    A(driveFiles).forEach(function (f) {
      if (!isReferensTreatmentJournalPdf(f)) return;
      var url = referensFileViewUrl(f);
      if (!url) return;
      var fDate = String(f.documentDate || f.visitDate || f.captureDate || '').slice(0, 10);
      if (itDate && fDate && itDate !== fDate) return;
      var ts = referensTimelineTs(f);
      if (!best || ts >= bestTs) {
        best = url;
        bestTs = ts;
      }
    });
    return best;
  }

  function buildDocViewRow(label, meta, viewUrl, dataKey) {
    var key = dataKey || 'doc';
    if (!viewUrl) {
      return (
        '<div class="gk-med-doc gk-med-doc--missing" data-kk-med-form="' +
        esc(key) +
        '">' +
        '<span class="gk-med-doc-title">' +
        esc(label) +
        '</span>' +
        '<span class="gk-med-doc-meta">' +
        esc(meta || 'Saknas') +
        '</span></div>'
      );
    }
    return (
      '<button type="button" class="gk-med-doc" data-kk-med-form="' +
      esc(key) +
      '" data-kk-open-doc="' +
      esc(viewUrl) +
      '" data-kk-doc-title="' +
      esc(label) +
      '">' +
      '<span class="gk-med-doc-title">' +
      esc(label) +
      '</span>' +
      '<span class="gk-med-doc-meta">' +
      esc(meta || '') +
      '</span>' +
      '<span class="gk-med-doc-open">Visa</span></button>'
    );
  }

  function buildJournalDocRows(jItems, jrs, driveFiles, jPlanned) {
    var byEntry = {};
    A(jrs).forEach(function (j) {
      var id = j.entryId || j.id;
      if (id) byEntry[id] = j;
    });
    var usedUrls = {};
    var entries = [];
    A(jItems).forEach(function (it) {
      var raw = byEntry[it.entryId] || null;
      var viewUrl = resolveJournalItemViewUrl(it, raw, driveFiles);
      if (viewUrl) usedUrls[viewUrl] = true;
      it.viewUrl = viewUrl;
      var titel = it.serie || it.title || 'Journal';
      var metaParts = [];
      if (viewUrl) metaParts.push('Signerad');
      if (it.step) metaParts.push('Steg ' + it.step);
      if (it.date) metaParts.push(it.date);
      if (it.by) metaParts.push(it.by);
      entries.push({
        ts: referensTimelineTs({ date: it.date, documentDate: it.date, importedAt: it.date }),
        html: buildDocViewRow(
          titel,
          viewUrl ? metaParts.join(' · ') : 'Saknas',
          viewUrl,
          'journal_' + (it.entryId || titel)
        ),
      });
    });
    A(driveFiles).forEach(function (f) {
      if (!isReferensTreatmentJournalPdf(f)) return;
      var url = referensFileViewUrl(f);
      if (!url || usedUrls[url]) return;
      usedUrls[url] = true;
      var label = referensFileLabel(f, 'Journal');
      var d = referensTimelineSortKey(f).slice(0, 10);
      entries.push({
        ts: referensTimelineTs(f),
        html: buildDocViewRow(
          label,
          'Signerad' + (d ? ' · ' + d : ''),
          url,
          'journal_asset_' + (f.id || f.assetId || label)
        ),
      });
    });
    A(jPlanned).forEach(function (it, idx) {
      var titel = 'Journal · ' + (it.title || 'behandling');
      var meta = it.date ? 'Saknas · inför ' + it.date : 'Saknas';
      entries.push({
        ts: 0,
        html: buildDocViewRow(titel, meta, '', 'journal_planned_' + idx),
      });
    });
    entries.sort(function (a, b) {
      return b.ts - a.ts;
    });
    return entries
      .map(function (entry) {
        return entry.html;
      })
      .join('');
  }

  function resolveMedFormViewUrl(formKey, form, driveFiles) {
    if (form && form.viewUrl) return form.viewUrl;
    var pat =
      formKey === 'fitness_certificate'
        ? /friskf[oö]rs[aä]kr|fitness.?cert/i
        : /h[aä]lsodek|halsodek|health.?decl/i;
    var bestFile = null;
    var bestTs = 0;
    A(driveFiles).forEach(function (f) {
      if (!isReferensJournalPdf(f)) return;
      var name = String(f.fileName || f.name || f.relativePath || f.originalFileName || '');
      if (!pat.test(name)) return;
      if (!referensFileViewUrl(f)) return;
      var ts = referensTimelineTs(f);
      if (!bestFile || ts >= bestTs) {
        bestFile = f;
        bestTs = ts;
      }
    });
    return bestFile ? referensFileViewUrl(bestFile) : '';
  }

  function buildMedFormDocRow(formKey, label, form, signed, sourceLabel, driveFiles) {
    var dateLabel = medFormDateLabel(form);
    var meta = signed ? 'Signerad' : 'Saknas';
    if (dateLabel) meta += ' · ' + dateLabel;
    if (sourceLabel) meta += ' · ' + sourceLabel;
    var viewUrl = resolveMedFormViewUrl(formKey, form, driveFiles);

    if (!signed) {
      return buildDocViewRow(label, meta, '', formKey);
    }
    if (viewUrl) {
      return buildDocViewRow(label, meta, viewUrl, formKey);
    }
    return (
      '<div class="gk-med-doc gk-med-doc--nopdf" data-kk-med-form="' +
      esc(formKey) +
      '">' +
      '<span class="gk-med-doc-title">' +
      esc(label) +
      '</span>' +
      '<span class="gk-med-doc-meta">' +
      esc(meta) +
      ' · PDF saknas</span></div>'
    );
  }

  function isReferensAgreementFile(file) {
    if (!file) return false;
    var cat = String(file.category || '').toLowerCase();
    var src = String(file.sourceSystem || '').toLowerCase();
    var name = String(
      file.fileName || file.name || file.originalFileName || file.displayName || ''
    );
    return (
      cat === 'agreement' ||
      src === 'getaccept_import' ||
      /behandlingsavtal|getaccept|ögonlocksplastik.*avtal|ogonlocksplastik.*avtal/i.test(name)
    );
  }

  function buildAgreementDocRow(bcard, driveFiles) {
    var agreements = A(driveFiles)
      .filter(isReferensAgreementFile)
      .slice()
      .sort(referensCompareNewestFirst);
    var best = agreements[0] || null;
    var signed =
      bcard.hasAgreement === true ||
      bcard.missingAgreement === false ||
      Boolean(best && referensFileViewUrl(best));
    if (!signed && !best) {
      return buildDocViewRow('Behandlingsavtal', 'Saknas', '', 'agreement');
    }
    var url = best ? referensFileViewUrl(best) : '';
    var metaParts = ['Signerad'];
    var d = String((best && (best.documentDate || best.captureDate)) || '').slice(0, 10);
    if (d) metaParts.push(d);
    if (best && String(best.sourceSystem || '').toLowerCase() === 'getaccept_import') {
      metaParts.push('GetAccept');
    }
    if (!url) {
      return buildDocViewRow(
        'Behandlingsavtal',
        metaParts.join(' · ') + ' · PDF saknas',
        '',
        'agreement'
      );
    }
    return buildDocViewRow('Behandlingsavtal', metaParts.join(' · '), url, 'agreement');
  }

  function buildMedicinsktFormsInner(bcard, driveFiles) {
    var hd = bcard.healthDeclaration || null;
    var fc = bcard.fitnessCertificate || null;
    var hdSigned =
      referensHasSignedHd(bcard) ||
      formSigned(hd, bcard, 'hasHealthDeclaration', 'missingHealthDeclaration');
    var fcSigned =
      formSigned(fc, bcard, 'hasFitnessCertificate', 'missingFitnessCertificate') ||
      bcard.fitnessSigned === true;
    var hdSource = hdSourceLabel(hd, bcard);
    var fcSource = hdSourceLabel(fc, bcard);
    var files = A(driveFiles);
    return (
      buildMedFormDocRow('health_declaration', 'Hälsodeklaration', hd, hdSigned, hdSource, files) +
      buildMedFormDocRow('fitness_certificate', 'Friskförsäkran', fc, fcSigned, fcSource, files) +
      buildAgreementDocRow(bcard, files)
    );
  }

  function medicinsktSectionPill(bcard) {
    var hdMiss = bcard.missingHealthDeclaration !== false && !referensHasSignedHd(bcard);
    var fcMiss =
      bcard.missingFitnessCertificate !== false &&
      !formSigned(
        bcard.fitnessCertificate,
        bcard,
        'hasFitnessCertificate',
        'missingFitnessCertificate'
      ) &&
      bcard.fitnessSigned !== true;
    if (hdMiss || fcMiss) return '<span class="sb-chip">Att fylla i</span>';
    return 'Signerad';
  }

  function polishReferensJourney(canonicalJourney, steps, cur, total) {
    if (!steps || !canonicalJourney) return { steps: steps, cur: cur, total: total, nextLabel: '' };
    var active = steps.find(function (s) {
      return s.state === 'active';
    });
    var doneCount = steps.filter(function (s) {
      return s.state === 'done';
    }).length;
    var nextLabel = canonicalJourney.nextLabel || (active ? active.label : '');
    return {
      steps: steps,
      cur:
        canonicalJourney.activeStep != null
          ? canonicalJourney.activeStep
          : active
            ? active.id
            : doneCount,
      total: total,
      nextLabel: nextLabel,
      doneCount: doneCount,
    };
  }

  function filterCanonicalSignals(card, bundle, journalEntries, extras) {
    if (window.CcoKundkortKkx && typeof window.CcoKundkortKkx.resolvePanelSignals === 'function') {
      return window.CcoKundkortKkx.resolvePanelSignals(
        card || {},
        journalEntries,
        bundle,
        extras || {}
      );
    }
    var raw = A((card && card.automationSignals) || bundle.signals);
    return raw.filter(function (s) {
      return s && CANONICAL_SIGNAL_IDS[String(s.ruleId || '')];
    });
  }

  // Gemensamma kundkortet (porterat från kundkort-mockup-gemensamt.html) — byggt ur LIVE-data.
  function gkBuild(ctx) {
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function A2(x) {
      return Array.isArray(x) ? x : [];
    }
    function ini(n) {
      return String(n || '?')
        .trim()
        .split(/\s+/)
        .map(function (w) {
          return w[0] || '';
        })
        .slice(0, 2)
        .join('')
        .toUpperCase();
    }
    function sek(title, pill, inner, emptyText) {
      var content =
        inner ||
        (emptyText
          ? '<div class="gk-rad"><span class="gk-sub">' + esc(emptyText) + '</span></div>'
          : '');
      if (!content) return '';
      var slug = sekSlug(title || 'sektion');
      return (
        '<section class="gk-sek" data-gk-section="' +
        esc(slug) +
        '"><h2>' +
        esc(title) +
        (pill || '') +
        '<button type="button" class="gk-section-toggle" data-gk-toggle-section aria-label="Visa eller dölj ' +
        esc(title) +
        '" aria-expanded="true">Dölj</button></h2><div class="gk-section-body">' +
        content +
        '</div></section>'
      );
    }
    var name = ctx.name || 'Kund';
    ctx.driveFiles = dedupeDriveFiles(ctx.driveFiles);
    var imgs = A2(ctx.driveFiles).filter(isReferensImageFile);
    var visitMedia = A2(ctx.driveFiles).filter(gkIsOriginalVisitMediaFile);
    var MND = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    var nowY = new Date().getFullYear();
    function gkZoneOf(s) {
      var l = String(s || '').toLowerCase();
      if (/h[åa]rlinj|hairlin|front|panna|forehead|temporal|tinning/.test(l)) return 'Hårlinje';
      if (/krona|crown|vertex|hj[äa]ss|virvel/.test(l)) return 'Krona';
      if (/donor|nack|occip|baksid/.test(l)) return 'Donator';
      return 'Översikt';
    }
    function gkDateOfFile(f) {
      var direct = gkSortKeyOfFile(f).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
      var rp = String((f && (f.relativePath || f.fileName || f.originalFileName || f.name)) || '');
      var m = rp.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
      var ep = rp.match(/\b(1[0-9]{9})\b/);
      if (ep) return new Date(Number(ep[1]) * 1000).toISOString().slice(0, 10);
      return '';
    }
    function gkDocumentDateOfFile(f) {
      var direct = String((f && (f.documentDate || f.visitDate || f.photoDate)) || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : gkDateOfFile(f);
    }
    function gkCaptureDateOfFile(f) {
      var direct = String((f && (f.captureDate || f.captureDateTime)) || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : '';
    }
    function gkNormalizeDateTime(value) {
      var raw = String(value || '').trim();
      if (!raw) return '';
      var exif = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (exif) {
        return (
          exif[1] +
          '-' +
          exif[2] +
          '-' +
          exif[3] +
          'T' +
          exif[4] +
          ':' +
          exif[5] +
          ':' +
          (exif[6] || '00')
        );
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw + 'T00:00:00';
      var iso = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
      if (iso) return iso[1] + 'T' + (iso[2].length === 5 ? iso[2] + ':00' : iso[2]);
      var parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
      return '';
    }
    function gkSortKeyOfFile(f) {
      return referensTimelineSortKey(f);
    }
    function gkPhotoSortNewest(a, b) {
      var ak = String((a && (a.sortKey || a.date)) || '');
      var bk = String((b && (b.sortKey || b.date)) || '');
      if (ak !== bk) return bk.localeCompare(ak);
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''));
    }
    function gkFmtDate(d) {
      if (!d) return 'odaterat';
      var p = String(d).split('-'),
        y = +p[0],
        mo = +p[1],
        da = +p[2];
      if (!y || !mo || !da) return d;
      return da + ' ' + (MND[mo - 1] || '') + (y === nowY ? '' : ' ' + y);
    }
    function gkMediaFromFile(f) {
      var id = f && f.id ? String(f.id) : '';
      var labelSource =
        ((f && f.relativePath) || '') +
        ' ' +
        ((f && (f.fileName || f.originalFileName || f.name)) || '');
      var url =
        (f && f.viewUrl) ||
        (id ? '/api/v1/cco-patient-master/file?fileId=' + encodeURIComponent(id) : '#');
      var isVideo = isReferensVideoFile(f);
      var explicitThumb = (f && (f.thumbnailUrl || f.thumbnailLink)) || '';
      var canUseFullImage = !isVideo && isReferensBrowserImageFile(f);
      var previewUrl =
        explicitThumb ||
        (canUseFullImage && !isReferensPatientAssetFile(f) && id
          ? '/api/v1/cco-patient-master/file-preview?width=480&fileId=' + encodeURIComponent(id)
          : '');
      return {
        id: id,
        sourceAssetId: (f && (f.assetId || f.sourceAssetId || f.id)) || '',
        name: (f && (f.fileName || f.originalFileName || f.name || f.displayName)) || '',
        kind: isVideo ? 'video' : 'image',
        zone: gkZoneOf(labelSource),
        date: gkDateOfFile(f),
        documentDate: gkDocumentDateOfFile(f),
        captureDate: gkCaptureDateOfFile(f),
        captureDateTime: (f && f.captureDateTime) || '',
        sortKey: gkSortKeyOfFile(f),
        captureDateSource: (f && f.captureDateSource) || '',
        captureDateMismatch: Boolean(
          (f && f.captureDateMismatch) ||
          (gkDocumentDateOfFile(f) &&
            gkCaptureDateOfFile(f) &&
            gkDocumentDateOfFile(f) !== gkCaptureDateOfFile(f))
        ),
        imageStage: (f && f.imageStage) || '',
        selectedFor: gkSelectedForFromFile(f),
        sourceAnnotationId: (f && f.sourceAnnotationId) || '',
        offerReady: gkIsOfferReadyFile(f),
        thumb: isVideo ? '' : previewUrl,
        url: url,
        previewMissing: !isVideo && !previewUrl,
      };
    }
    function gkPhotoGrid(photos, limit, cls) {
      var list = limit ? A2(photos).slice(0, limit) : A2(photos);
      if (!list.length) return '';
      var deferAfter = gkDeferredPhotoLimit(cls);
      return (
        '<div class="gk-foto-grid' +
        (cls ? ' ' + esc(cls) : '') +
        '">' +
        list
          .map(function (p, index) {
            var missingPreview = p.kind !== 'video' && p.previewMissing;
            var captureDate = p.captureDate || '';
            var dateMismatch = Boolean(
              p.captureDateMismatch ||
              (p.documentDate && captureDate && p.documentDate !== captureDate)
            );
            var src = p.thumb || (!missingPreview ? p.url : '');
            var fallback = p.url || '';
            var deferred = Boolean(deferAfter && index >= deferAfter && !missingPreview);
            var media =
              p.kind === 'video'
                ? '<video ' +
                  (deferred ? 'data-gk-deferred-img-src="' : 'data-gk-img-src="') +
                  esc(fallback) +
                  '" ' +
                  (deferred ? 'data-gk-deferred-img-full="' : 'data-gk-img-full="') +
                  esc(fallback) +
                  '" preload="' +
                  (deferred ? 'none' : 'metadata') +
                  '" muted playsinline controls></video>'
                : missingPreview
                  ? '<div class="gk-foto-placeholder"><b>Miniatyr saknas</b><small>Original finns · behöver thumbnail</small></div>'
                  : src
                    ? '<img ' +
                      (deferred ? 'data-gk-deferred-img-src="' : 'data-gk-img-src="') +
                      esc(src) +
                      '" ' +
                      (deferred ? 'data-gk-deferred-img-full="' : 'data-gk-img-full="') +
                      esc(fallback) +
                      '" ' +
                      (deferred ? '' : 'src="' + esc(src) + '" ') +
                      'alt="' +
                      esc(p.name || p.zone || 'Foto') +
                      '" loading="lazy" decoding="async" onerror="this.removeAttribute(&quot;src&quot;);this.closest(&quot;.gk-foto&quot;)?.classList.add(&quot;is-missing&quot;)" />'
                    : '';
            return (
              '<a class="gk-foto' +
              (p.kind === 'video' ? ' gk-foto--video' : '') +
              (missingPreview ? ' gk-foto--missing' : '') +
              (deferred ? ' gk-foto--deferred' : '') +
              (p.offerReady ? ' gk-foto--offer-ready' : '') +
              (dateMismatch ? ' gk-foto--date-mismatch' : '') +
              '" href="' +
              esc(p.url) +
              '" data-gk-photo-kind="' +
              esc(p.kind || 'image') +
              '" data-gk-photo-id="' +
              esc(p.id || p.sourceAssetId || '') +
              '" data-gk-photo-asset="' +
              esc(p.sourceAssetId || p.id || '') +
              '" data-gk-photo-date="' +
              esc(p.date || '') +
              '" data-gk-photo-capture-date="' +
              esc(captureDate) +
              '" data-gk-photo-capture-date-time="' +
              esc(p.captureDateTime || '') +
              '" data-gk-photo-date-mismatch="' +
              (dateMismatch ? '1' : '0') +
              '" data-gk-photo-zone="' +
              esc(p.zone || '') +
              '" data-gk-photo-name="' +
              esc(p.name || '') +
              '" data-gk-photo-missing-preview="' +
              (missingPreview ? '1' : '0') +
              '" data-gk-photo-src="' +
              esc(fallback || src || '') +
              '" target="_blank" rel="noopener noreferrer" title="' +
              (p.kind === 'video' ? 'Öppna film' : 'Öppna bild') +
              '">' +
              media +
              (dateMismatch
                ? '<span class="gk-foto-date-warn">Tagen ' + esc(gkFmtDate(captureDate)) + '</span>'
                : '') +
              (p.offerReady ? '<span class="gk-foto-ready-chip">Offertklar</span>' : '') +
              '<span style="position:relative;z-index:1">' +
              (p.kind === 'video' ? 'Film' : esc(p.zone)) +
              ' · ' +
              esc(gkFmtDate(p.date)) +
              '</span><span class="gk-foto-marks">Rita · Plan · Kund</span></a>'
            );
          })
          .join('') +
        '</div>'
      );
    }
    function gkMediaCountLabel(items) {
      var photos = A2(items).filter(function (p) {
        return p.kind !== 'video';
      }).length;
      var videos = A2(items).filter(function (p) {
        return p.kind === 'video';
      }).length;
      var parts = [];
      if (photos) parts.push(photos + (photos === 1 ? ' bild' : ' bilder'));
      if (videos) parts.push(videos + (videos === 1 ? ' film' : ' filmer'));
      return parts.join(' · ');
    }

    // Header
    var pills = '';
    if (ctx.isVip) pills += '<span class="gk-pill gk-pill-vip">VIP</span>';
    if (ctx.cur && ctx.total)
      pills +=
        '<span class="gk-pill gk-pill-steg">Steg ' +
        esc(ctx.cur) +
        ' av ' +
        esc(ctx.total) +
        '</span>';
    var kontakt = [];
    if (ctx.phone)
      kontakt.push(
        '<a href="tel:' +
          esc(String(ctx.phone).replace(/[^\d+]/g, '')) +
          '">' +
          esc(ctx.phone) +
          '</a>'
      );
    if (ctx.email)
      kontakt.push('<a href="mailto:' + esc(ctx.email) + '">' + esc(ctx.email) + '</a>');
    var smart = ctx.nextLabel
      ? '<b>Nästa:</b> ' +
        esc(ctx.nextLabel) +
        (ctx.cur ? ' · Steg ' + esc(ctx.cur) + ' av ' + esc(ctx.total) : '')
      : ctx.cur
        ? 'Steg ' + esc(ctx.cur) + ' av ' + esc(ctx.total)
        : 'Kundkortet samlat';
    function chip(label, n, dot) {
      return (
        '<span class="gk-chip">' +
        esc(label) +
        (n || n === 0 ? ' <span class="gk-n">' + esc(n) + '</span>' : '') +
        (dot ? ' <span class="gk-dot' + (dot === 'red' ? ' red' : '') + '"></span>' : '') +
        '</span>'
      );
    }
    // Statusprickar (facit): orange = kräver åtgärd, röd = obetalt
    var hdMiss = A2(ctx.gateSignals).some(function (s) {
      return /missing_health_declaration/i.test(String((s && (s.ruleId || s.id)) || ''));
    });
    var fcMiss = A2(ctx.gateSignals).some(function (s) {
      return /missing_operation_day_insurance|missing_fitness/i.test(
        String((s && (s.ruleId || s.id)) || '')
      );
    });
    var medMiss =
      hdMiss ||
      fcMiss ||
      (ctx.bcard && ctx.bcard.missingHealthDeclaration === true) ||
      (ctx.bcard && ctx.bcard.missingFitnessCertificate === true);
    var offPending = A2(ctx.offers).some(function (o) {
      return !/godk|signed|accepted/i.test(o.status || '');
    });
    var ekoUnpaid = !!(
      ctx.commercialCase &&
      /pending|partial|deposit|blocked|väntar|obetal/i.test(
        String(ctx.commercialCase.paymentStatus || '')
      )
    );
    var persMap = {};
    A2(ctx.jItems).forEach(function (it) {
      if (it.by) persMap[it.by] = (persMap[it.by] || 0) + 1;
    });
    var persNames = Object.keys(persMap);
    var autoN = A2(ctx.autoDocs).length;
    var docN = A2(ctx.driveFiles).filter(isReferensDocumentFile).length;
    var offerPhotoN = imgs.filter(gkIsOfferReadyFile).length;
    var nav =
      '<nav class="gk-nav">' +
      chip('Kundresa', ctx.total) +
      chip('Smart nästa steg', '', ctx.nextLabel ? 'orange' : '') +
      chip('Medicinskt läge', '', medMiss ? 'orange' : '') +
      chip('Besök', '', A2(ctx.hist).length || visitMedia.length ? 'orange' : '') +
      chip('Bokningar', A2(ctx.up).length) +
      chip('Journal', A2(ctx.jItems).length) +
      (offerPhotoN ? chip('Foto', offerPhotoN) : chip('Foto', 0)) +
      chip('Historik', A2(ctx.hist).length) +
      (persNames.length ? chip('Personal', persNames.length) : '') +
      chip('Offert', A2(ctx.offers).length, offPending ? 'orange' : '') +
      chip('Ekonomi', '', ekoUnpaid ? 'red' : '') +
      (docN ? chip('Dokument', docN) : '') +
      (autoN ? chip('Auto', autoN) : '') +
      chip('Ta bild') +
      '</nav>';
    var head =
      '<header class="gk-khead"><div class="gk-khead-row"><div class="gk-avatar">' +
      esc(ini(name)) +
      '</div><div class="gk-id"><div class="gk-name">' +
      esc(name) +
      pills +
      '</div><div class="gk-kontakt">' +
      kontakt.join(' · ') +
      '</div></div>' +
      '<div class="gk-actions">' +
      '<button type="button" class="gk-btn gk-btn-gold" data-gk-proxy="[data-kk-forbered]">Förbered besök</button>' +
      '<button type="button" class="gk-btn" data-gk-proxy="[data-kk-atgarder]">Åtgärder</button>' +
      '</div></div>' +
      '<div class="gk-smartline"><span class="gk-kicker">Smart sammanfattning</span><span>' +
      smart +
      '</span></div>' +
      nav +
      '</header>';

    var body = '<div class="gk-body">';
    function gkJournalRow(it) {
      var titel = it.serie || it.title || 'Journal';
      var metaParts = [];
      if (it.viewUrl) metaParts.push('Signerad');
      if (it.date) metaParts.push(it.date);
      if (it.by) metaParts.push(it.by);
      return buildDocViewRow(
        titel,
        it.viewUrl ? metaParts.join(' · ') : 'Saknas',
        it.viewUrl || '',
        'journal_' + (it.entryId || titel)
      );
    }
    function buildVisitRender() {
      var visitGroups = {};
      function ensureVisitGroup(d) {
        d = d || 'odaterat';
        if (!visitGroups[d]) visitGroups[d] = { date: d, journals: [], photos: [], sortKey: '' };
        return visitGroups[d];
      }
      A2(ctx.jItems).forEach(function (it) {
        var group = ensureVisitGroup(it.date || 'odaterat');
        group.journals.push(it);
        var jKey = gkNormalizeDateTime(it.date || it.occurredAt || it.startAt || '');
        if (jKey && jKey > group.sortKey) group.sortKey = jKey;
      });
      visitMedia.forEach(function (f) {
        var p = gkMediaFromFile(f);
        var group = ensureVisitGroup(p.date || 'odaterat');
        group.photos.push(p);
        if (p.sortKey && p.sortKey > group.sortKey) group.sortKey = p.sortKey;
      });
      var visitCards = Object.keys(visitGroups)
        .sort(function (a, b) {
          var ga = visitGroups[a] || {};
          var gb = visitGroups[b] || {};
          var ak = ga.sortKey || (a === 'odaterat' ? '' : a + 'T00:00:00');
          var bk = gb.sortKey || (b === 'odaterat' ? '' : b + 'T00:00:00');
          return String(bk).localeCompare(String(ak));
        })
        .map(function (d) {
          var group = visitGroups[d];
          var n = group.photos.length;
          var jn = group.journals.length;
          var title = d !== 'odaterat' ? gkFmtDate(d) : 'Okänt tillfälle';
          group.photos.sort(gkPhotoSortNewest);
          group.journals.sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
          });
          var journalRows = group.journals.map(gkJournalRow).join('');
          var collapsed = group.photos.length > 6;
          var photoGrid = gkPhotoGrid(
            group.photos,
            0,
            'gk-foto-grid--journal' + (collapsed ? ' is-collapsed' : '')
          );
          var mediaLabel = gkMediaCountLabel(group.photos);
          var meta =
            (jn ? jn + (jn === 1 ? ' journal' : ' journaler') : '') +
            (jn && mediaLabel ? ' · ' : '') +
            mediaLabel;
          return (
            '<div class="gk-visit-card">' +
            '<div class="gk-visit-head"><div><b>' +
            esc(title) +
            '</b>' +
            (meta ? '<span class="gk-sub">' + esc(meta) + '</span>' : '') +
            '</div><span class="gk-hl gk-tag gk-tag-info">Besök</span></div>' +
            (journalRows
              ? '<div class="gk-visit-journal"><div class="gk-visit-label">Journalföring</div>' +
                journalRows +
                '</div>'
              : '') +
            (photoGrid
              ? '<div class="gk-visit-photos"><div class="gk-visit-label">Bilder/film från besöket</div>' +
                photoGrid +
                (collapsed
                  ? '<button type="button" class="gk-btn gk-visit-media-toggle" data-gk-toggle-visit-media>Visa alla ' +
                    group.photos.length +
                    '</button>'
                  : '') +
                '</div>'
              : '') +
            (n
              ? '<div class="gk-visit-actions">' +
                '<button type="button" class="gk-btn" data-gk-jump="foto">Välj i Foto</button>' +
                '<button type="button" class="gk-btn" data-gk-jump="ta bild">Ta/rita bild</button>' +
                '</div>'
              : '') +
            '</div>'
          );
        })
        .join('');
      return {
        count: Object.keys(visitGroups).length,
        visitSectionHtml: sek(
          'Besök',
          '<span class="gk-pill gk-tag-info">' + Object.keys(visitGroups).length + '</span>',
          visitCards || '',
          'Inga besök ännu.'
        ),
        journalRows: A2(ctx.jItems)
          .slice()
          .sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
          })
          .map(gkJournalRow)
          .join(''),
      };
    }
    var visitRender = buildVisitRender();

    // Medicinskt läge (Hälsodeklaration + Friskförsäkran)
    var medicalSectionHtml = sek(
      'Medicinskt läge',
      medMiss
        ? '<span class="gk-pill gk-tag-warn">Att fylla i</span>'
        : '<span class="gk-pill gk-tag-ok">Signerad</span>',
      ctx.bcard
        ? buildMedicinsktFormsInner(ctx.bcard, ctx.driveFiles)
        : '<div class="gk-rad"><span class="gk-sub">Medicinsk data · endast visning</span></div>'
    );

    // ── Resa-status härledd ur gateSignals (read-only) ──
    var gkSignals = A2(ctx.gateSignals);
    function gkSigId(s) {
      return String((s && (s.ruleId || s.id)) || '');
    }
    var readyForOp = gkSignals.some(function (s) {
      return /ready_for_treatment/i.test(gkSigId(s));
    });
    var gkBlockers = gkSignals.filter(function (s) {
      return typeof isBlockerSignal === 'function' && isBlockerSignal(s);
    });
    var coolingActive = gkSignals.some(function (s) {
      return /cooling_off_active/i.test(gkSigId(s));
    });
    var coolingPassed = gkSignals.some(function (s) {
      return /cooling_off_passed/i.test(gkSigId(s));
    });
    var photoReview = gkSignals.some(function (s) {
      return /has_photo_review/i.test(gkSigId(s));
    });
    var coolEnd = null;
    A2(ctx.offers).forEach(function (o) {
      if (o && o.coolingOffEndsAt) coolEnd = o.coolingOffEndsAt;
    });
    if (!coolEnd && ctx.commercialCase && ctx.commercialCase.coolingOffEndsAt)
      coolEnd = ctx.commercialCase.coolingOffEndsAt;
    function gkCoolDays() {
      if (!coolEnd) return null;
      var d = Math.ceil((new Date(coolEnd).getTime() - Date.now()) / 86400000);
      return isNaN(d) ? null : d;
    }

    // Kundresa — Fas C: stegstatus HÄRLEDD ur bevis (gates/bokning), ej journey-storens råstate
    if (A2(ctx.steps).length) {
      var stepsArr = A2(ctx.steps);
      var hasBooking = A2(ctx.up).length > 0 || A2(ctx.hist).length > 0;
      function gkGateAt(n) {
        if (n === 3)
          return gkSignals.some(function (s) {
            return /missing_health_declaration/i.test(gkSigId(s));
          });
        if (n === 4)
          return gkSignals.some(function (s) {
            return /missing_journal/i.test(gkSigId(s));
          });
        if (n === 5)
          return gkSignals.some(function (s) {
            return /missing_treatment_plan/i.test(gkSigId(s));
          });
        if (n === 6) return coolingActive;
        if (n === 7)
          return gkSignals.some(function (s) {
            return /missing_agreement_consent_bundle/i.test(gkSigId(s));
          });
        if (n === 8)
          return gkSignals.some(function (s) {
            return /missing_operation_day_insurance/i.test(gkSigId(s));
          });
        if (n === 9)
          return gkSignals.some(function (s) {
            return /missing_photo_consent/i.test(gkSigId(s));
          });
        return false;
      }
      function gkStepUnmet(n) {
        if (n <= 2) return !hasBooking; // 1 bokning + 2 bekräftelse (Cliento, externt)
        return gkGateAt(n);
      }
      // Härled bara om vi har bevis (signaler eller bokning); annars behåll storens state
      var gkCanDerive = gkSignals.length > 0 || hasBooking;
      var gkActive = 0;
      if (gkCanDerive) {
        for (var gkN = 1; gkN <= stepsArr.length; gkN++) {
          if (gkStepUnmet(gkN)) {
            gkActive = gkN;
            break;
          }
        }
        if (readyForOp) gkActive = 0;
      }
      function gkStepState(idx, orig) {
        if (!gkCanDerive) return orig;
        var n = idx + 1;
        if (gkActive === 0) return 'done';
        if (n < gkActive) return 'done';
        if (n === gkActive) return 'active';
        return 'kommande';
      }
      var gkDoneN = 0;
      stepsArr.forEach(function (s, i) {
        if (gkStepState(i, s.state) === 'done') gkDoneN++;
      });
      var pct = Math.round((gkDoneN / (ctx.total || stepsArr.length)) * 100);
      var curStep = gkCanDerive ? gkActive || stepsArr.length : ctx.cur;
      var stegRows = stepsArr
        .map(function (s, i) {
          var st = gkStepState(i, s.state);
          var cls = st === 'done' ? 'gk-steg-klar' : st === 'active' ? 'gk-steg-nu' : 'gk-steg-sen';
          var mk =
            st === 'done' ? '✓' : st === 'active' ? s.id || i + 1 || '!' : s.id || i + 1 || '';
          var extra = st === 'active' ? ' <span class="gk-hl gk-tag gk-tag-warn">Pågår</span>' : '';
          // Steg 6: betänketid-status ur cooling-signaler
          if (/bet[äa]nketid/i.test(String(s.label || ''))) {
            if (coolingPassed)
              extra += ' <span class="gk-hl gk-tag gk-tag-ok">passerad — kan signera</span>';
            else if (coolingActive) {
              var cd = gkCoolDays();
              extra +=
                ' <span class="gk-hl gk-tag gk-tag-warn">pågår' +
                (cd != null && cd > 0 ? ' · ' + cd + ' d kvar' : '') +
                '</span>';
            }
          }
          var jump = stepJumpSlug(s.label);
          var medForm = stepMedFormSlug(s.label);
          return (
            '<div class="gk-steg-rad' +
            (jump ? ' kk-jumpable" data-kk-jump="' + jump + '"' : '"') +
            (medForm ? ' data-kk-med-form="' + medForm + '"' : '') +
            '><span class="gk-steg-ikon ' +
            cls +
            '">' +
            esc(mk) +
            '</span> ' +
            esc(s.label) +
            extra +
            '</div>'
          );
        })
        .join('');
      // Redo-för-operation-rad (composite)
      var readyRow = '';
      if (readyForOp) {
        readyRow =
          '<div class="gk-redo gk-redo-ok"><span class="gk-redo-ic">✓</span><b>Redo för operation</b></div>';
      } else if (gkBlockers.length) {
        var miss = gkBlockers
          .map(function (s) {
            return (typeof signalSub === 'function' ? signalSub(s) : '') || s.what || s.label || '';
          })
          .filter(Boolean);
        readyRow =
          '<div class="gk-redo gk-redo-block"><span class="gk-redo-ic">!</span><b>Inte redo för operation</b>' +
          (miss.length
            ? '<div class="gk-sub gk-redo-miss">Fattas: ' + esc(miss.join(' · ')) + '</div>'
            : '') +
          '</div>';
      }
      body += sek(
        'Kundresa · ' + ctx.total + ' steg',
        curStep ? '<span class="gk-pill gk-pill-steg">Steg ' + esc(curStep) + '</span>' : '',
        readyRow +
          '<div class="gk-resa-bar"><div class="gk-resa-fill" style="width:' +
          pct +
          '%"></div></div>' +
          stegRows
      );
    }

    // Smart nästa steg — signal + kontext + RIKTIGA knappar (kk-sig-act, dokument-delegerad handler)
    var snsRows = A2(ctx.gateSignals)
      .map(function (s) {
        var sig = esc(s.ruleId || s.id || '');
        var title = s.what || s.label || ctx.nextLabel || 'Nästa steg';
        var sub = (typeof signalSub === 'function' ? signalSub(s) : '') || s.why || s.detail || '';
        var tone = /block|legal/.test(s.risk || s.level || '') ? 'Blockerare' : 'Föreslaget';
        return (
          '<div class="gk-rad"><div style="flex:1"><b>' +
          esc(title) +
          '</b>' +
          (sub ? '<div class="gk-sub" style="margin-top:3px">' + esc(sub) + '</div>' : '') +
          '</div><span class="gk-hl gk-tag gk-tag-warn">' +
          tone +
          '</span></div>' +
          '<div class="gk-rad" style="border-bottom:none;gap:8px">' +
          '<button type="button" class="gk-btn kk-sig-act" data-kk-sig="' +
          sig +
          '" data-kk-sig-label="' +
          esc(title) +
          '" data-kk-patient-id="' +
          esc(ctx.patientId || ctx.customerId || '') +
          '">Granska utkast</button>' +
          '<button type="button" class="gk-btn gk-btn-gold kk-sig-act" data-kk-sig="' +
          sig +
          '" data-kk-sig-label="' +
          esc(title) +
          '" data-kk-patient-id="' +
          esc(ctx.patientId || ctx.customerId || '') +
          '">Skicka för signering</button></div>'
        );
      })
      .join('');
    if (!snsRows && ctx.nextLabel)
      snsRows =
        '<div class="gk-rad"><b>' +
        esc(ctx.nextLabel) +
        '</b> <span class="gk-hl gk-tag gk-tag-warn">Föreslaget</span></div>';
    body += sek('Smart nästa steg', '', snsRows, 'Inga aktiva nästa steg just nu.');
    body += medicalSectionHtml;
    body += visitRender.visitSectionHtml;

    // Kommande bokningar
    var bk = A2(ctx.up)
      .slice(0, 5)
      .map(function (b) {
        var when = [
          b.dateLabel || (b.date ? String(b.date).slice(0, 10) : ''),
          b.time || b.startTime || '',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          '<div class="gk-rad"><b>' +
          esc(b.title || b.serviceName || 'Bokning') +
          '</b> <span class="gk-sub">' +
          esc(when + (b.staff ? ' · ' + b.staff : '')) +
          '</span></div>'
        );
      })
      .join('');
    body += sek(
      'Kommande bokningar',
      '<span class="gk-pill gk-tag-info">' + A2(ctx.up).length + '</span>',
      bk,
      'Inga kommande bokningar — kontakta kunden för återbesök så hen inte tappas.'
    );

    // Historik — Sammanfatta + Fråga historiken + timeline-container (fylls async från journal-timeline)
    var hisRows = A2(ctx.hist)
      .slice(0, 12)
      .map(function (b) {
        var d = String(b.date || b.occurredAt || b.startAt || '').slice(0, 10);
        return (
          '<div class="gk-rad gk-tl-row"><span class="gk-sub">' +
          esc(d) +
          '</span> ' +
          esc(b.title || b.serviceName || 'Besök') +
          '</div>'
        );
      })
      .join('');
    // Syntetiserade historik-händelser ur kortets data (besök + betalningar + första kontakt)
    var bkEvents = [];
    A2(ctx.hist).forEach(function (b) {
      bkEvents.push({
        ts: b.date || b.occurredAt || b.startAt || '',
        title: b.title || b.serviceName || 'Besök',
        icon: '📅',
        src: 'bokning',
      });
    });
    A2(ctx.bundle && ctx.bundle.paymentHistory).forEach(function (p) {
      var paid = /(paid|betald|completed)/i.test(p.status || '');
      bkEvents.push({
        ts: String(p.dateIso || p.date || '').slice(0, 10),
        title: (p.method || p.source || 'Betalning') + (p.amountLabel ? ' · ' + p.amountLabel : ''),
        icon: '💳',
        src: paid ? 'betald' : 'betalning',
      });
    });
    var kontaktDatum = A2(ctx.hist)
      .map(function (b) {
        return String(b.date || b.occurredAt || b.startAt || '').slice(0, 10);
      })
      .filter(function (d) {
        return /^\d{4}-\d{2}-\d{2}$/.test(d);
      })
      .sort();
    if (kontaktDatum.length)
      bkEvents.push({ ts: kontaktDatum[0], title: 'Första kontakt', icon: '🤝', src: 'kontakt' });
    var historikSectionHtml = sek(
      'Historik',
      '<span class="gk-pill gk-tag-info" data-gk-hist-count>' +
        (A2(ctx.hist).length || 0) +
        ' händelser</span>',
      '<div class="gk-rad" style="border-bottom:none;gap:8px">' +
        '<button type="button" class="gk-btn" data-gk-sum>Sammanfatta</button>' +
        '<input type="text" class="gk-histq" data-gk-histq placeholder="Fråga historiken… t.ex. &#39;när gjorde han PRP senast?&#39;" />' +
        '</div>' +
        '<div id="gk-sum-box" class="gk-rad" style="border-bottom:none;color:#4a7ba8" hidden></div>' +
        '<div data-gk-tl="' +
        esc(ctx.patientId || '') +
        '" data-gk-pname="' +
        esc(ctx.name || '') +
        '" data-gk-pemail="' +
        esc(ctx.email || '') +
        '" data-gk-bk="' +
        encodeURIComponent(JSON.stringify(bkEvents)) +
        '">' +
        (hisRows || '<div class="gk-rad"><span class="gk-sub">Laddar historik…</span></div>') +
        '</div>'
    );

    var journalSectionHtml = sek(
      'Journal',
      '<span class="gk-pill gk-tag-info">' + A2(ctx.jItems).length + ' anteckningar</span>',
      visitRender.journalRows,
      'Inga journaler ännu.'
    );

    // Offert
    var off = A2(ctx.offers)
      .map(function (o) {
        var amt = o.amountLabel || o.detail || (o.amount ? o.amount + ' kr' : '');
        var ok = /godk|signed|accepted/i.test(o.status || '');
        return (
          '<div class="gk-rad"><b>' +
          esc((o.type || 'Offert') + (o.title ? ' · ' + o.title : '')) +
          '</b> <span class="gk-hl">' +
          (amt ? '<b>' + esc(amt) + '</b>' : '') +
          (ok ? ' <span class="gk-tag gk-tag-ok">Godkänd</span>' : '') +
          '</span></div>'
        );
      })
      .join('');
    // Smart signal: temperatur ur engagemang (ORD-42 öppningsspårning) — intern heuristik, ej extern AI
    var offSignal = (function () {
      var cc = ctx.commercialCase || {};
      var hasOffer = A2(ctx.offers).length || cc.quotedAmount;
      if (!hasOffer) return '';
      var statusBlob =
        String(cc.paymentStatus || '') +
        ' ' +
        A2(ctx.offers)
          .map(function (o) {
            return o.status || '';
          })
          .join(' ');
      if (/accept|godk|signed|betald|paid|tackad|avbök|declin/i.test(statusBlob)) return '';
      var openCount = Number(cc.quoteOpenCount || 0);
      var lastTs = cc.quoteOpenedAt ? Date.parse(cc.quoteOpenedAt) : NaN;
      function rel(ts) {
        var d = (Date.now() - ts) / 1000;
        if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' min sedan';
        if (d < 86400) return Math.round(d / 3600) + ' h sedan';
        var days = Math.round(d / 86400);
        return days <= 1 ? 'igår' : days + ' dagar sedan';
      }
      var hSince = isFinite(lastTs) ? (Date.now() - lastTs) / 3.6e6 : null;
      var when = isFinite(lastTs) ? rel(lastTs) : '';
      var hr = isFinite(lastTs) ? new Date(lastTs).getHours() : null;
      var timeHint =
        hr != null
          ? ' Föreslå påminnelse ~' + (hr < 10 ? '0' + hr : hr) + ':00 (då hen öppnar).'
          : '';
      var tone, lead, sub;
      if (openCount >= 2 && hSince != null && hSince < 48) {
        tone = 'hot';
        lead = '🔥 Het lead';
        sub =
          'Öppnad ' +
          openCount +
          ' ggr, senast ' +
          when +
          ' — tittar aktivt men har inte svarat.' +
          timeHint;
      } else if (hSince != null && hSince > 24 * 10) {
        tone = 'cold';
        lead = '🧊 Går kall';
        sub = Math.round(hSince / 24) + ' dagar utan aktivitet. Skicka en personlig påminnelse.';
      } else if (openCount >= 1) {
        tone = 'warm';
        lead = 'Öppnad ' + openCount + ' ' + (openCount === 1 ? 'gång' : 'ggr');
        sub =
          'Inget svar än' +
          (when ? ' (senast ' + when + ')' : '') +
          '. Påminnelse föreslås.' +
          timeHint;
      } else {
        tone = 'info';
        lead = 'Skickad — ej öppnad än';
        sub = 'Inväntar att kunden öppnar offerten.';
      }
      return (
        '<div class="gk-offsignal gk-offsignal-' +
        tone +
        '"><b>' +
        lead +
        '</b> <span class="gk-sub">' +
        esc(sub) +
        '</span></div>'
      );
    })();
    // Förslag/Insikt: mall-baserat påminnelse-utkast (intern heuristik, ej extern AI; människa skickar)
    var offDraft = (function () {
      var cc = ctx.commercialCase || {};
      var offersArr = A2(ctx.offers);
      var closedRe = /godk|signed|accept|betald|paid|tackad|declin|avbök/i;
      var pendingOffer =
        offersArr.filter(function (o) {
          return !closedRe.test(o.status || '');
        })[0] || offersArr[0];
      var hasPending =
        (pendingOffer || cc.quotedAmount) && !closedRe.test(String(cc.paymentStatus || ''));
      if (!hasPending) return '';
      var fnamn =
        String(ctx.name || '')
          .trim()
          .split(' ')[0] || 'där';
      var behandling = pendingOffer
        ? pendingOffer.title || pendingOffer.type || 'behandlingsplan'
        : 'behandlingsplan';
      var beloppStr = (pendingOffer && pendingOffer.amountLabel) || cc.quotedAmount || '';
      var beloppNum = parseInt(String(beloppStr).replace(/[^0-9]/g, ''), 10) || 0;
      var stort = beloppNum >= 30000;
      var draft =
        'Hej ' +
        fnamn +
        '! Jag ville bara höra av mig om din behandlingsplan' +
        (behandling ? ' (' + behandling + (beloppStr ? ' · ' + beloppStr : '') + ')' : '') +
        '. Hör gärna av dig om du har några frågor — jag hjälper dig gärna vidare.';
      if (stort)
        draft +=
          ' Vi har även möjlighet till delbetalning/finansiering (Medical Finance) om det skulle underlätta.';
      draft += ' / Hair TP Clinic';
      var insight = stort
        ? 'Stort belopp + tyst — finansiering (Medical Finance) sänker ofta tröskeln. Liknande offerter stänger oftast efter en personlig påminnelse.'
        : 'Liknande offerter stänger oftast efter en personlig påminnelse.';
      return (
        '<div class="gk-offsuggest">' +
        '<div class="gk-sub gk-offinsight">💡 ' +
        esc(insight) +
        '</div>' +
        '<button type="button" class="gk-btn gk-btn-gold" data-gk-offer-draft>Förbered påminnelse</button>' +
        '<div class="gk-offdraft" hidden>' +
        '<textarea class="gk-offdraft-text" readonly rows="4">' +
        esc(draft) +
        '</textarea>' +
        '<div class="gk-offdraft-actions">' +
        '<button type="button" class="gk-btn" data-gk-offer-copy>Kopiera</button>' +
        '<button type="button" class="gk-btn" data-gk-offer-studio>✉ Svarstudio</button>' +
        '<span class="gk-sub gk-offdraft-note"></span>' +
        '</div>' +
        '</div>' +
        '</div>'
      );
    })();
    // Öppningstidslinje: hela engagemangs-storyn ur ORD-42 quoteOpens[]
    var offOpens = (function () {
      var cc = ctx.commercialCase || {};
      var opens = A2(cc.quoteOpens);
      if (!opens.length) return '';
      function relt(ts) {
        var t = Date.parse(ts);
        if (!isFinite(t)) return String(ts || '');
        var d = (Date.now() - t) / 1000;
        if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' min sedan';
        if (d < 86400) return Math.round(d / 3600) + ' h sedan';
        var dd = Math.round(d / 86400);
        return dd <= 1 ? 'igår' : dd + ' dagar sedan';
      }
      var rows = opens
        .slice(-6)
        .reverse()
        .map(function (o) {
          return (
            '<div class="gk-opentl-row"><span class="gk-opentl-dot"></span>' +
            '<span>📨 Öppnad' +
            (o.source && o.source !== 'unknown' ? ' · ' + esc(o.source) : '') +
            '</span> <span class="gk-sub">' +
            esc(relt(o.ts)) +
            '</span></div>'
          );
        })
        .join('');
      return (
        '<details class="gk-opentl"><summary class="gk-sub">Öppningstidslinje · ' +
        opens.length +
        ' öppning' +
        (opens.length === 1 ? '' : 'ar') +
        '</summary>' +
        rows +
        '</details>'
      );
    })();
    var offertSectionHtml = sek(
      'Offert',
      '',
      offSignal + offOpens + offDraft + off,
      'Ingen offert skapad ännu.'
    );

    // Ekonomi — smart: status-signal, öppen faktura m. förfallodag, LTV, betalplan 20/80, påminnelse-utkast
    var ekoPack = (function () {
      var cc = ctx.commercialCase || {};
      var ps = String(cc.paymentStatus || '').toLowerCase();
      var payHist = A2(ctx.bundle && ctx.bundle.paymentHistory);
      function num(s) {
        return Number(String(s == null ? '' : s).replace(/[^\d]/g, '')) || 0;
      }
      function fmtKr(v) {
        if (v == null || v === '') return '';
        var s = String(v);
        if (/kr/i.test(s)) return s;
        var n = num(s);
        return n > 0 ? n.toLocaleString('sv-SE') + ' kr' : s;
      }
      var DAGAR = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
      function dueSignal(p) {
        if (!p) return null;
        var st = String(p.status || '').toLowerCase();
        if (/overdue/.test(st)) {
          var dd = p.dueDateIso ? new Date(p.dueDateIso) : null;
          var days = dd && !isNaN(dd) ? Math.floor((Date.now() - dd.getTime()) / 86400000) : 0;
          return { tone: 'bad', text: days > 0 ? 'Förfallen ' + days + ' dgr' : 'Förfallen' };
        }
        if (p.dueDateIso) {
          var d2 = new Date(p.dueDateIso);
          if (!isNaN(d2)) {
            var diff = Math.ceil((d2.getTime() - Date.now()) / 86400000);
            if (diff < 0) return { tone: 'bad', text: 'Förfallen' };
            if (diff <= 7) return { tone: 'warn', text: 'Förfaller ' + DAGAR[d2.getDay()] };
            return { tone: 'warn', text: 'Förfaller ' + d2.toISOString().slice(0, 10) };
          }
        }
        return { tone: 'warn', text: 'Obetald' };
      }
      // Status-badge
      var hasOverdue = payHist.some(function (p) {
        return /overdue|förfall|forfall/i.test(p.status || '');
      });
      var tone = '',
        label = '';
      if (hasOverdue) {
        tone = 'bad';
        label = 'FÖRFALLEN';
      } else if (ps === 'blocked') {
        tone = 'bad';
        label = 'BLOCKERAD';
      } else if (/^paid$|betald|ready_for_booking/.test(ps)) {
        tone = 'ok';
        label = 'BETALD';
      } else if (/partial/.test(ps)) {
        tone = 'warn';
        label = 'DELBETALD';
      } else if (/pending|deposit|väntar|obetal/.test(ps)) {
        tone = 'warn';
        label = 'OBETALT';
      } else if (
        cc.quotedAmount &&
        !payHist.some(function (p) {
          return /paid|betald/i.test(p.status || '');
        })
      ) {
        tone = 'warn';
        label = 'OBETALT';
      }
      var badge = label
        ? '<span class="gk-eko-badge gk-eko-badge-' + tone + '">' + label + '</span>'
        : '';
      // Öppen faktura
      var inv = payHist
        .filter(function (p) {
          return (
            (/invoice/i.test(p.method || '') || /fortnox/i.test(p.source || '')) &&
            /overdue|pending|partial/i.test(p.status || '')
          );
        })
        .sort(function (a, b) {
          return String(b.dateIso || '').localeCompare(String(a.dateIso || ''));
        })[0];
      var rows = '';
      if (inv) {
        var sig = dueSignal(inv);
        rows +=
          '<div class="gk-rad gk-eko-inv"><b>Faktura' +
          (inv.ref ? ' F-' + esc(inv.ref) : '') +
          '</b>' +
          '<span class="gk-hl"><b>' +
          esc(inv.amountLabel || '') +
          '</b></span>' +
          (sig
            ? '<span class="gk-eko-sig gk-eko-sig-' + sig.tone + '">' + esc(sig.text) + '</span>'
            : '') +
          '</div>';
      } else if (cc.quotedAmount) {
        rows +=
          '<div class="gk-rad gk-eko-inv"><span>Offererat</span><span class="gk-hl"><b>' +
          esc(fmtKr(cc.quotedAmount)) +
          '</b></span></div>';
      }
      var ltvMoney = ctx.ltv ? fmtKr(ctx.ltv) : '';
      if (ltvMoney) {
        rows +=
          '<div class="gk-rad gk-eko-inv"><span>Livstidsvärde (LTV)</span><span class="gk-hl"><b>' +
          esc(ltvMoney) +
          '</b></span></div>';
      }
      if (ctx.ltvLabel && ctx.ltvLabel !== ltvMoney) {
        rows +=
          '<div class="gk-rad gk-eko-inv"><span>Vunna affärer</span><span class="gk-hl"><b>' +
          esc(ctx.ltvLabel) +
          '</b></span></div>';
      }
      // Betalplan 20/80 + betalt-progress
      var qn = num(cc.quotedAmount),
        dn = num(cc.depositAmount);
      if (qn > 0 && dn > 0) {
        var depPct = Math.max(1, Math.min(99, Math.round((dn / qn) * 100)));
        var restPct = 100 - depPct;
        var paidSum = payHist.reduce(function (s, p) {
          return s + (/paid|betald/i.test(p.status || '') ? num(p.amountLabel || p.amount) : 0);
        }, 0);
        var paidPct = Math.max(0, Math.min(100, Math.round((paidSum / qn) * 100)));
        rows +=
          '<div class="gk-eko-plan">' +
          '<div class="gk-eko-plan-top"><span>Betalplan operation</span>' +
          '<span class="gk-eko-plan-tag">' +
          depPct +
          '% vid avtal · ' +
          restPct +
          '% operationsdag</span></div>' +
          '<div class="gk-eko-plan-track"><div class="gk-eko-plan-fill" style="width:' +
          paidPct +
          '%"></div></div>' +
          (paidSum > 0
            ? '<div class="gk-sub gk-eko-plan-sub">' +
              paidSum.toLocaleString('sv-SE') +
              ' kr betalt av ' +
              qn.toLocaleString('sv-SE') +
              ' kr</div>'
            : '') +
          '</div>';
      }
      // Fortnox-status (ärlig): ansluten? patient kopplad? leverantörsblocker? — fylls av __gkLoadFortnox
      var fnxLinked = !!(
        ctx.bundle &&
        ctx.bundle.paymentHistoryMeta &&
        ctx.bundle.paymentHistoryMeta.fortnoxCustomerId
      );
      rows +=
        '<div class="gk-eko-fortnox" data-gk-fortnox="' +
        esc(ctx.patientId || '') +
        '" data-gk-fnx-linked="' +
        (fnxLinked ? '1' : '0') +
        '" hidden></div>';
      // Åtgärd: betalpåminnelse-utkast (förbered → människa skickar; aldrig auto-skick/auto-pengar)
      var act = '';
      if (label === 'OBETALT' || label === 'FÖRFALLEN' || label === 'DELBETALD') {
        var fn =
          String(ctx.name || '')
            .trim()
            .split(/\s+/)[0] || 'där';
        var invRef = inv && inv.ref ? 'F-' + inv.ref : '';
        var invAmt = inv ? inv.amountLabel || '' : fmtKr(cc.quotedAmount);
        var draft =
          'Hej ' +
          fn +
          ',\n\nEn vänlig påminnelse om' +
          (invRef ? ' faktura ' + invRef : ' din faktura') +
          (invAmt ? ' på ' + invAmt : '') +
          '.\nHör gärna av dig om du har några frågor.\n\nVänliga hälsningar';
        var draftEsc = draft.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        act =
          '<div class="gk-offsuggest">' +
          '<button type="button" class="gk-btn gk-eko-remind" data-gk-offer-draft>Skicka betalpåminnelse</button>' +
          '<div class="gk-offdraft" hidden>' +
          '<textarea class="gk-offdraft-text" rows="6">' +
          draftEsc +
          '</textarea>' +
          '<div class="gk-offdraft-actions"><button type="button" class="gk-btn" data-gk-offer-copy>Kopiera</button>' +
          '<button type="button" class="gk-btn" data-gk-offer-studio>Svarstudio</button>' +
          '<span class="gk-offdraft-note gk-sub"></span></div></div></div>';
      }
      return { badge: badge, body: rows + act };
    })();
    var ekonomiSectionHtml = sek(
      'Ekonomi',
      ekoPack.badge,
      ekoPack.body,
      'Ingen ekonomi-data ännu.'
    );

    // Foto = bara ritade/markerade kopior för offert/behandlingsplan.
    // Originalbilderna visas per besöksdatum i Besök-sektionen.
    var fotoBody = (function () {
      if (!imgs.length) return '';
      var photos = imgs.map(gkMediaFromFile);
      photos.sort(gkPhotoSortNewest);
      var offerPhotos = photos.filter(function (p) {
        return p.offerReady;
      });
      var offerReadyHtml =
        '<div class="gk-offer-ready-photos">' +
        '<div class="gk-visit-label">Markerade bilder för offert</div>' +
        (offerPhotos.length
          ? '<div class="gk-sub gk-order-note">Ritade/markerade versioner som kan skickas med i offert eller behandlingsplan.</div>' +
            gkPhotoGrid(offerPhotos, 0, 'gk-foto-grid--offer-ready')
          : '<div class="gk-offer-ready-empty">Inga markerade offertbilder ännu. Öppna en bild, rita och välj “behandlingsplan/offert”.</div>') +
        '</div>';
      return '<div class="gk-visit-photos">' + offerReadyHtml + '</div>';
    })();
    var fotoSectionHtml = sek(
      'Foto',
      (offerPhotoN
        ? '<span class="gk-pill gk-tag-ok">' + offerPhotoN + ' offertklara</span>'
        : '<span class="gk-pill gk-tag-info">0 offertbilder</span>') +
        (photoReview ? ' <span class="gk-pill gk-tag-warn">Foton att granska</span>' : ''),
      fotoBody,
      'Inga markerade offertbilder ännu.'
    );
    body += journalSectionHtml;
    body += fotoSectionHtml;
    body += historikSectionHtml;
    body += offertSectionHtml;
    body += ekonomiSectionHtml;

    // Personal (behandlare ur journalerna)
    var persRows = persNames
      .map(function (n) {
        return (
          '<div class="gk-rad gk-person" data-gk-person="' +
          esc(n) +
          '" role="button" tabindex="0" title="Klicka för åtgärder"><b>' +
          esc(n) +
          '</b> <span class="gk-sub">' +
          persMap[n] +
          (persMap[n] === 1 ? ' journal' : ' journaler') +
          '</span><span class="gk-person-chev" aria-hidden="true">›</span></div>'
        );
      })
      .join('');
    var personalSectionHtml = sek(
      'Personal',
      persNames.length ? '<span class="gk-pill gk-tag-info">' + persNames.length + '</span>' : '',
      persRows,
      'Ingen behandlare kopplad ännu (historiska journaler saknar signerare).'
    );

    // AUTO — autopilot-lagret i kundresan. Sekvensen är fast (Hair TP-resan);
    // timing beräknas per patient ur bokningarna. (Senast skickad/status/kontroller = fas 2, kräver automation-motorn i backend.)
    var autoBlock = (function () {
      var MONTHS = [
        'jan',
        'feb',
        'mar',
        'apr',
        'maj',
        'jun',
        'jul',
        'aug',
        'sep',
        'okt',
        'nov',
        'dec',
      ];
      function fmt(ts) {
        var d = new Date(ts);
        return d.getDate() + ' ' + MONTHS[d.getMonth()];
      }
      var up = A2(ctx.up);
      var future = up
        .map(function (b) {
          var t = b.date ? Date.parse(b.date) : b.dateLabel ? Date.parse(b.dateLabel) : NaN;
          return t;
        })
        .filter(function (t) {
          return isFinite(t) && t > Date.now();
        })
        .sort(function (a, b) {
          return a - b;
        });
      var nextBk = future.length ? future[0] : null;
      var reminder;
      if (nextBk) {
        var fire = nextBk - 48 * 3.6e6;
        reminder = {
          namn: 'Påminnelse 48 h före besök',
          status: fire > Date.now() ? 'Nästa: ' + fmt(fire) : 'Skickas snart',
          tone: 'info',
        };
      } else {
        reminder = {
          namn: 'Påminnelse 48 h före besök',
          status: 'Ingen kommande bokning',
          tone: 'warn',
          flag: true,
        };
      }
      // op-datum + senaste besök ur historiken → aftercare/omdöme-timing
      var hist = A2(ctx.hist);
      function htime(b) {
        return Date.parse(String(b.date || b.occurredAt || b.startAt || '').slice(0, 10));
      }
      var opTs =
        hist
          .filter(function (b) {
            return /\b(op|operation|dhi|fue|transplant|graft|implant)\b/i.test(
              String(b.title || b.serviceName || '')
            );
          })
          .map(htime)
          .filter(isFinite)
          .sort(function (a, b) {
            return b - a;
          })[0] || null;
      var visits = hist
        .map(htime)
        .filter(isFinite)
        .sort(function (a, b) {
          return b - a;
        });
      var lastVisitTs = visits.length ? visits[0] : null;
      function autoStat(baseTs, offsetDays) {
        if (!baseTs) return null;
        var fireTs = baseTs + offsetDays * 864e5;
        return fireTs > Date.now()
          ? { status: 'Nästa: ' + fmt(fireTs), tone: 'info' }
          : { status: 'Aktiv', tone: 'ok' };
      }
      var aft = autoStat(opTs, 1) || { status: 'Aktiveras efter operation', tone: 'muted' };
      var omd = autoStat(lastVisitTs, 14) || {
        status: 'Aktiveras efter avslutad resa',
        tone: 'muted',
      };
      reminder.key = 'reminder';
      var autos = [
        {
          key: 'confirmation',
          namn: 'Bokningsbekräftelse + pre-info',
          status: up.length ? 'Aktiv' : 'Aktiveras vid bokning',
          tone: up.length ? 'ok' : 'muted',
        },
        reminder,
        {
          key: 'aftercare',
          namn: 'Aftercare-schema efter operation',
          status: aft.status,
          tone: aft.tone,
        },
        {
          key: 'review',
          namn: 'Omdömes-mail efter avslutad resa',
          status: omd.status,
          tone: omd.tone,
        },
      ];
      var rows = autos
        .map(function (a) {
          var cls =
            a.tone === 'warn'
              ? 'gk-tag-warn'
              : a.tone === 'info'
                ? 'gk-tag-info'
                : a.tone === 'muted'
                  ? ''
                  : 'gk-tag-ok';
          return (
            '<div class="gk-rad gk-auto-row" data-gk-auto="' +
            (a.key || '') +
            '"><b>' +
            esc(a.namn) +
            '</b> <span class="gk-auto-sent gk-sub"></span> <span class="gk-hl gk-tag ' +
            cls +
            '">' +
            (a.flag ? '⚠ ' : '') +
            esc(a.status) +
            '</span></div>'
          );
        })
        .join('');
      // Auto-genererade dokument (ctx.autoDocs) som tilläggsrader i samma sektion
      var docs = A2(ctx.autoDocs)
        .map(function (d) {
          var done =
            d.planned === false ||
            /sent|deliver|levererat|signed|skickad|klar/i.test(String(d.status || ''));
          var previewAttrs = referensAutoDocPreviewAttrs(d);
          return (
            '<div class="gk-rad' +
            (previewAttrs ? ' kk-auto-doc-preview-row' : '') +
            '"' +
            previewAttrs +
            '><b>' +
            esc(d.title || 'Auto-dokument') +
            '</b> ' +
            (previewAttrs ? '<span class="kk-auto-doc-preview-label">Visa mall</span> ' : '') +
            '<span class="gk-hl gk-tag ' +
            (done ? 'gk-tag-ok' : 'gk-tag-warn') +
            '">' +
            (done ? '✓ levererat' : esc(d.statusLabel || 'Planerad')) +
            '</span></div>'
          );
        })
        .join('');
      var aktiva = autos.filter(function (a) {
        return /aktiv|nästa/i.test(a.status);
      }).length;
      return { count: aktiva, html: rows + docs };
    })();
    var autoSectionHtml = sek(
      'AUTO',
      '<span class="gk-pill gk-tag-ok">' + autoBlock.count + ' aktiva</span>',
      autoBlock.html,
      'Inga automationer.'
    );

    // Dokument: bara faktiska dokument/filer. Originalmedia ligger i Besök,
    // och ritade offertbilder ligger i Foto.
    var documentFiles = A2(ctx.driveFiles)
      .filter(isReferensDocumentFile)
      .filter(function (f) {
        return !looksLikeReferensMediaLabel(referensFileLabel(f, cleanName(f)));
      })
      .filter(function (f) {
        return !gkIsAnnotatedFile(f) && !gkIsOfferReadyFile(f);
      });
    var docR = documentFiles
      .slice(0, 10)
      .map(function (f) {
        var nm = String(f.fileName || 'Fil').replace(/\.[a-z0-9]+$/i, '');
        return (
          '<div class="gk-rad"><b>' +
          esc(nm) +
          '</b> <span class="gk-hl gk-tag gk-tag-ok">Arkiverad</span></div>'
        );
      })
      .join('');
    var dokumentSectionHtml = sek(
      'Dokument',
      docR ? '<span class="gk-pill gk-tag-info">' + documentFiles.length + ' filer</span>' : '',
      docR,
      'Inga dokument ännu.'
    );
    body += dokumentSectionHtml;
    body += personalSectionHtml;
    body += autoSectionHtml;

    // Ta bild — smart: ÄKTA samtyckes-grind (blockerar capture utan foto-samtycke) + zon-etikett
    var tabildBody = (function () {
      var consentMissing = A2(ctx.gateSignals).some(function (s) {
        return /missing_photo_consent|photo_consent/i.test(String((s && (s.ruleId || s.id)) || ''));
      });
      if (consentMissing) {
        return (
          '<div class="gk-tabild gk-tabild-block">' +
          '<div class="gk-rad" style="border-bottom:none"><span class="gk-tabild-status gk-tabild-bad"><span class="gk-tabild-dot"></span>Foto-samtycke saknas</span>' +
          ' <span class="gk-sub">— krävs innan foto tas</span></div>' +
          '<div class="gk-tabild-actions">' +
          '<button type="button" class="gk-btn" disabled title="Kräver foto-samtycke">📷 Ta bild</button>' +
          '<button type="button" class="gk-btn gk-btn-gold" data-gk-jump="Smart nästa steg">Begär samtycke</button>' +
          '</div></div>'
        );
      }
      return (
        '<div class="gk-tabild">' +
        '<div class="gk-rad" style="border-bottom:none"><span class="gk-tabild-status gk-tabild-ok"><span class="gk-tabild-dot"></span>Foto-samtycke finns</span>' +
        ' <span class="gk-sub">· scope: hårlinje + krona, aldrig ansikte</span></div>' +
        '<div class="gk-tabild-zones"><span class="gk-sub">Zon:</span>' +
        '<button type="button" class="gk-zonchip" data-gk-zon="Hårlinje">Hårlinje</button>' +
        '<button type="button" class="gk-zonchip" data-gk-zon="Krona">Krona</button>' +
        '<button type="button" class="gk-zonchip" data-gk-zon="Donator">Donator</button></div>' +
        '<div class="gk-tabild-actions">' +
        '<button type="button" class="gk-btn gk-btn-gold" data-gk-proxy="[data-kk-tabild]">📷 Ta bild nu</button>' +
        '<span class="gk-sub gk-tabild-hint">Sparas direkt i journalen med etikett</span></div>' +
        '</div>'
      );
    })();
    body += sek('Ta bild', '', tabildBody);

    body += '</div>';
    return (
      '<div class="gk-kort" data-gk-patient-id="' +
      esc(ctx.patientId || ctx.customerId || '') +
      '">' +
      head +
      body +
      '</div>'
    );
  }

  function gkHydrateDriveFiles(ctx, force) {
    ctx = ctx || {};
    var pid = ctx.patientId || ctx.customerId || '';
    if (!pid || (!force && ctx.driveFiles && ctx.driveFiles.length)) return;
    window.__GK_DRIVE_CACHE = window.__GK_DRIVE_CACHE || {};
    window.__GK_DRIVE_LOADING = window.__GK_DRIVE_LOADING || {};
    if (window.__GK_DRIVE_LOADING[pid]) return;
    function apply(files, payload) {
      files = dedupeDriveFiles(files);
      if (!files.length) return;
      var nextBundle = Object.assign({}, ctx.bundle || {}, payload || {});
      if (payload && (payload.card || payload.patient)) {
        nextBundle.card = Object.assign(
          {},
          (ctx.bundle && ctx.bundle.card) || {},
          payload.card || payload.patient || {}
        );
      }
      var nextCtx = Object.assign({}, ctx, {
        driveFiles: files,
        up: ctx.up && ctx.up.length ? ctx.up : A((payload || {}).upcomingBookings),
        hist: ctx.hist && ctx.hist.length ? ctx.hist : A((payload || {}).historyBookings),
        bundle: nextBundle,
        commercialCase: ctx.commercialCase || (payload || {}).commercialCase || null,
      });
      var html = gkBuild(nextCtx);
      window.__GK_LAST = html;
      Array.prototype.forEach.call(
        document.querySelectorAll('#kk-storvy .gk-kort'),
        function (node) {
          node.outerHTML = html;
        }
      );
    }
    if (!force && window.__GK_DRIVE_CACHE[pid]) {
      apply(window.__GK_DRIVE_CACHE[pid].driveFiles, window.__GK_DRIVE_CACHE[pid].payload);
      return;
    }
    window.__GK_DRIVE_LOADING[pid] = true;
    fetch(
      '/api/v1/cco-patient-master/patient/summary?patientId=' +
        encodeURIComponent(pid) +
        '&includeDriveFiles=1',
      { credentials: 'same-origin' }
    )
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        var files = dedupeDriveFiles((payload && payload.driveFiles) || []);
        window.__GK_DRIVE_CACHE[pid] = { driveFiles: files, payload: payload || {} };
        apply(files, payload || {});
      })
      .catch(function () {
        /* Kortet fungerar fortfarande utan fallbacken. */
      })
      .finally(function () {
        window.__GK_DRIVE_LOADING[pid] = false;
      });
  }

  // Proxy: gk-knappar → klickar dossierns riktiga knappar (live-flöden) + gk-native Sammanfatta-toggle
  (function bindGkProxyOnce() {
    if (window.__gkProxyBound) return;
    window.__gkProxyBound = true;
    document.addEventListener('click', function (e) {
      var p = e.target.closest && e.target.closest('[data-gk-proxy]');
      if (p) {
        e.preventDefault();
        var sel = p.getAttribute('data-gk-proxy');
        var el = document.querySelector('.kkref .doss ' + sel) || document.querySelector(sel);
        if (el && el.click) el.click();
        return;
      }
      // Personal: åtgärds-knapp i öppnad rad (tilldela/kontakta — wiras i nästa steg)
      var pact = e.target.closest && e.target.closest('[data-gk-person-act]');
      if (pact) {
        e.preventDefault();
        var actKind = pact.getAttribute('data-gk-person-act');
        var actName = pact.getAttribute('data-name') || '';
        var note = pact.parentNode && pact.parentNode.querySelector('.gk-person-note');
        if (note) {
          note.textContent =
            (actKind === 'task' ? 'Tilldela uppgift till ' : 'Kontakta ') +
            actName +
            ' — kopplas i nästa steg.';
        }
        return;
      }
      // Personal: klick på namn → toggla åtgärds-rad
      var per = e.target.closest && e.target.closest('[data-gk-person]');
      if (per) {
        e.preventDefault();
        var nxt = per.nextSibling;
        if (nxt && nxt.classList && nxt.classList.contains('gk-person-actions')) {
          nxt.parentNode.removeChild(nxt);
          return;
        }
        [].forEach.call(document.querySelectorAll('.gk-person-actions'), function (o) {
          if (o.parentNode) o.parentNode.removeChild(o);
        });
        var nm = per.getAttribute('data-gk-person') || '';
        var nmAttr = nm.replace(/"/g, '&quot;');
        var bar = document.createElement('div');
        bar.className = 'gk-person-actions';
        bar.innerHTML =
          '<button type="button" class="gk-btn" data-gk-person-act="task" data-name="' +
          nmAttr +
          '">Tilldela uppgift</button>' +
          '<button type="button" class="gk-btn" data-gk-person-act="contact" data-name="' +
          nmAttr +
          '">Kontakta</button>' +
          '<span class="gk-person-note gk-sub"></span>';
        per.parentNode.insertBefore(bar, per.nextSibling);
        return;
      }
      // Offert: påminnelse-utkast — öppna/kopiera/Svarstudio
      var od = e.target.closest && e.target.closest('[data-gk-offer-draft]');
      if (od) {
        e.preventDefault();
        var odp = od.parentNode && od.parentNode.querySelector('.gk-offdraft');
        if (odp) odp.hidden = !odp.hidden;
        return;
      }
      var oc = e.target.closest && e.target.closest('[data-gk-offer-copy]');
      if (oc) {
        e.preventDefault();
        var ocBox = oc.closest('.gk-offdraft');
        var ocTa = ocBox && ocBox.querySelector('.gk-offdraft-text');
        var ocNote = ocBox && ocBox.querySelector('.gk-offdraft-note');
        if (ocTa) {
          try {
            ocTa.select();
            navigator.clipboard.writeText(ocTa.value);
            if (ocNote) ocNote.textContent = 'Kopierat ✓';
          } catch (e2) {
            if (ocNote) ocNote.textContent = 'Markera + kopiera manuellt';
          }
        }
        return;
      }
      var os = e.target.closest && e.target.closest('[data-gk-offer-studio]');
      if (os) {
        e.preventDefault();
        var osBox = os.closest('.gk-offdraft');
        var osTa = osBox && osBox.querySelector('.gk-offdraft-text');
        var osNote = osBox && osBox.querySelector('.gk-offdraft-note');
        try {
          if (osTa) navigator.clipboard.writeText(osTa.value);
        } catch (e3) {
          /* ignore */
        }
        var opener = document.querySelector('[data-studio-open]');
        if (opener && opener.click) {
          opener.click();
          if (osNote) osNote.textContent = 'Utkast kopierat — klistra in i Svarstudio';
        } else if (osNote) {
          osNote.textContent = 'Svarstudio hittades ej — utkast kopierat';
        }
        return;
      }
      var mediaToggle = e.target.closest && e.target.closest('[data-gk-toggle-visit-media]');
      if (mediaToggle) {
        e.preventDefault();
        var mediaBox = mediaToggle.closest('.gk-visit-photos');
        var mediaGrid = mediaBox && mediaBox.querySelector('.gk-foto-grid');
        if (!mediaGrid) return;
        var open = mediaGrid.classList.toggle('is-open');
        mediaGrid.classList.toggle('is-collapsed', !open);
        mediaToggle.textContent = open
          ? 'Dölj'
          : 'Visa alla ' + mediaGrid.querySelectorAll('.gk-foto').length;
        if (open && window.__gkRevealDeferredPhotos) window.__gkRevealDeferredPhotos(mediaGrid);
        if (open && window.__gkHydrateSecurePhotos) window.__gkHydrateSecurePhotos(mediaGrid);
        return;
      }
      var sectionToggle = e.target.closest && e.target.closest('[data-gk-toggle-section]');
      if (sectionToggle) {
        e.preventDefault();
        var section = sectionToggle.closest('.gk-sek');
        if (!section) return;
        var closed = section.classList.toggle('is-collapsed');
        sectionToggle.setAttribute('aria-expanded', closed ? 'false' : 'true');
        sectionToggle.textContent = closed ? 'Visa' : 'Dölj';
        return;
      }
      var photoTile = e.target.closest && e.target.closest('a.gk-foto');
      if (photoTile && photoTile.getAttribute('data-gk-photo-kind') !== 'video') {
        if (photoTile.getAttribute('data-gk-photo-missing-preview') === '1') {
          photoTile.classList.add('is-nudged');
          setTimeout(function () {
            photoTile.classList.remove('is-nudged');
          }, 1200);
          return;
        }
        e.preventDefault();
        if (window.__gkOpenPhotoEditor) window.__gkOpenPhotoEditor(photoTile);
        return;
      }
      // Foto: Jämför → before/after-slider
      var cmp = e.target.closest && e.target.closest('[data-gk-compare]');
      if (cmp) {
        e.preventDefault();
        var cd;
        try {
          cd = JSON.parse(cmp.getAttribute('data-gk-compare'));
        } catch (eC) {
          return;
        }
        if (window.__gkOpenCompare) window.__gkOpenCompare(cd);
        return;
      }
      // Fortnox: Synka patient → POST sync-patient (skapar/länkar Fortnox-kund; människans klick)
      var fsy = e.target.closest && e.target.closest('[data-gk-fortnox-sync]');
      if (fsy) {
        e.preventDefault();
        var pidF = fsy.getAttribute('data-pid') || '';
        var tokF = '';
        try {
          tokF = (
            window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
            window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
            ''
          ).trim();
        } catch (e5) {}
        if (!pidF || !tokF) return;
        fsy.disabled = true;
        fsy.textContent = 'Synkar…';
        fetch('/api/v1/cco-fortnox/sync-patient', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tokF, 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: pidF }),
        })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (j) {
            var box = fsy.closest('.gk-eko-fortnox');
            if (j && (j.ok || j.patient || j.customerNumber)) {
              if (box) {
                box.className = 'gk-eko-fortnox is-ok';
                box.innerHTML =
                  '<span class="gk-eko-fnx-dot"></span><span class="gk-eko-fnx-txt">Fortnox kopplad (kundnr ' +
                  (j.customerNumber || '—') +
                  ')</span>';
              }
            } else {
              fsy.disabled = false;
              fsy.textContent = 'Synka till Fortnox';
            }
          })
          .catch(function () {
            fsy.disabled = false;
            fsy.textContent = 'Synka till Fortnox';
          });
        return;
      }
      // Fortnox: Anslut → öppna OAuth-authorize i ny flik (du slutför consent; visas bara om ej blockerad)
      var fco = e.target.closest && e.target.closest('[data-gk-fortnox-connect]');
      if (fco) {
        e.preventDefault();
        var tokFC = '';
        try {
          tokFC = (
            window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
            window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
            ''
          ).trim();
        } catch (e6) {}
        fco.disabled = true;
        fco.textContent = 'Öppnar…';
        fetch('/api/v1/cco-fortnox/connect', { headers: { Authorization: 'Bearer ' + tokFC } })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (j) {
            if (j && j.authorizeUrl) {
              window.open(j.authorizeUrl, '_blank', 'noopener');
              fco.textContent = 'Slutför i fliken →';
            } else {
              fco.disabled = false;
              fco.textContent = 'Anslut';
            }
          })
          .catch(function () {
            fco.disabled = false;
            fco.textContent = 'Anslut';
          });
        return;
      }
      // Foto: Begär foto → notis (kopplas till begär-länk i nästa steg)
      var pr = e.target.closest && e.target.closest('[data-gk-photo-request]');
      if (pr) {
        e.preventDefault();
        pr.textContent = 'Begäran förberedd ✓';
        pr.disabled = true;
        return;
      }
      // Ta bild: zon-val → markera + uppdatera etikett-hint
      var zc = e.target.closest && e.target.closest('[data-gk-zon]');
      if (zc) {
        e.preventDefault();
        var zwrap = zc.parentNode;
        [].forEach.call(zwrap.querySelectorAll('[data-gk-zon]'), function (o) {
          o.classList.remove('sel');
        });
        zc.classList.add('sel');
        var card = zc.closest('.gk-tabild');
        var hint = card && card.querySelector('.gk-tabild-hint');
        if (hint)
          hint.textContent =
            'Sparas i journalen med etikett: ' + (zc.getAttribute('data-gk-zon') || '');
        return;
      }
      var s = e.target.closest && e.target.closest('[data-gk-sum]');
      if (s) {
        var box = document.getElementById('gk-sum-box');
        if (box) {
          box.hidden = !box.hidden;
          s.textContent = box.hidden ? 'Sammanfatta' : 'Dölj';
        }
        return;
      }
      var jmp = e.target.closest && e.target.closest('[data-gk-jump]');
      if (jmp) {
        var slug = jmp.getAttribute('data-gk-jump');
        var jov = document.getElementById('kk-storvy');
        if (jov && slug) {
          var target = [].slice.call(jov.querySelectorAll('.gk-sek')).filter(function (sek) {
            var h = sek.querySelector('h2');
            return h && new RegExp(slug, 'i').test(h.textContent || '');
          })[0];
          if (target) {
            target.classList.remove('is-collapsed');
            var targetToggle = target.querySelector('[data-gk-toggle-section]');
            if (targetToggle) {
              targetToggle.textContent = 'Dölj';
              targetToggle.setAttribute('aria-expanded', 'true');
            }
            var jsc = jov.querySelector('.kk-storvy-body') || jov;
            jsc.scrollTop = Math.max(
              0,
              target.getBoundingClientRect().top -
                jsc.getBoundingClientRect().top +
                jsc.scrollTop -
                50
            );
          }
        }
      }
    });
    // Fråga historiken — fritextfilter på timeline-raderna
    document.addEventListener('input', function (e) {
      var q = e.target && e.target.matches && e.target.matches('[data-gk-histq]') ? e.target : null;
      if (!q) return;
      var sek = q.closest('.gk-sek');
      var tl = sek && sek.querySelector('[data-gk-tl]');
      if (!tl) return;
      var term = String(q.value || '')
        .toLowerCase()
        .trim();
      [].forEach.call(tl.querySelectorAll('.gk-tl-row'), function (row) {
        var match = !term || (row.textContent || '').toLowerCase().indexOf(term) >= 0;
        row.style.display = match ? '' : 'none';
      });
    });
  })();

  window.__gkOpenPhotoEditor = function (tile) {
    if (!tile) return;
    var prev = document.getElementById('gk-photo-editor-ov');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    function esc2(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function tokenHeaders(json) {
      var token = '';
      try {
        token = (
          window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          ''
        ).trim();
      } catch (e) {
        token = '';
      }
      var headers =
        token && token !== '__preview_local__' ? { Authorization: 'Bearer ' + token } : {};
      if (json) headers['Content-Type'] = 'application/json';
      return headers;
    }
    function fetchObjectUrl(url) {
      return fetch(new URL(url, window.location.origin), {
        headers: tokenHeaders(false),
        credentials: 'same-origin',
      })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.blob();
        })
        .then(function (blob) {
          return URL.createObjectURL(blob);
        });
    }
    var imgNode = tile.querySelector('img');
    var originalSrc =
      (imgNode && imgNode.getAttribute('src')) ||
      tile.getAttribute('href') ||
      (imgNode && imgNode.getAttribute('data-gk-img-full')) ||
      '';
    var endpointSrc =
      (imgNode && imgNode.getAttribute('data-gk-img-full')) ||
      tile.getAttribute('href') ||
      originalSrc;
    var patientRoot = tile.closest('.gk-kort');
    var patientId = (patientRoot && patientRoot.getAttribute('data-gk-patient-id')) || '';
    var sourceAssetId =
      tile.getAttribute('data-gk-photo-asset') || tile.getAttribute('data-gk-photo-id') || '';
    var docDate = tile.getAttribute('data-gk-photo-date') || '';
    var captureDate = tile.getAttribute('data-gk-photo-capture-date') || '';
    var captureDateTime = tile.getAttribute('data-gk-photo-capture-date-time') || '';
    var zone = tile.getAttribute('data-gk-photo-zone') || '';
    var name = tile.getAttribute('data-gk-photo-name') || 'Bild';
    var ov = document.createElement('div');
    ov.id = 'gk-photo-editor-ov';
    ov.className = 'gk-edit-ov';
    ov.innerHTML =
      '<div class="gk-edit-panel" role="dialog" aria-modal="true" aria-label="Rita på bild">' +
      '<button type="button" class="gk-edit-close" data-gk-edit-close>×</button>' +
      '<div class="gk-edit-head"><div><b>Rita på bild</b><span>' +
      esc2(zone || 'Foto') +
      (docDate ? ' · ' + esc2(docDate) : '') +
      '</span></div><div class="gk-edit-tools">' +
      '<button type="button" class="gk-btn is-active" data-gk-color="#d45b4f">Röd</button>' +
      '<button type="button" class="gk-btn" data-gk-color="#e0b64a">Gul</button>' +
      '<button type="button" class="gk-btn" data-gk-clear>Rensa</button>' +
      '</div></div>' +
      '<div class="gk-edit-canvas-wrap"><canvas></canvas></div>' +
      '<div class="gk-edit-foot"><span class="gk-edit-note">Rita med mus/trackpad. Originalbilden ändras inte.</span>' +
      '<button type="button" class="gk-btn is-active" data-gk-plan>Vald till behandlingsplan/offert</button>' +
      '<button type="button" class="gk-btn gk-edit-save" data-gk-save>Spara markerad bild</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var canvas = ov.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var color = '#d45b4f';
    var drawing = false;
    var strokes = [];
    var current = null;
    var image = new Image();
    image.onload = function () {
      var maxW = Math.min(1040, Math.max(360, window.innerWidth - 80));
      var maxH = Math.min(760, Math.max(360, window.innerHeight - 220));
      var scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight, 1);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.onerror = function () {
      var note = ov.querySelector('.gk-edit-note');
      if (note) note.textContent = 'Kunde inte öppna bilden för redigering.';
    };
    if (/^blob:|^data:/.test(originalSrc)) {
      image.src = originalSrc;
    } else {
      fetchObjectUrl(endpointSrc)
        .then(function (obj) {
          image.src = obj;
        })
        .catch(function () {
          image.src = originalSrc;
        });
    }
    function point(ev) {
      var r = canvas.getBoundingClientRect();
      var t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      return {
        x: (t.clientX - r.left) * (canvas.width / r.width),
        y: (t.clientY - r.top) * (canvas.height / r.height),
      };
    }
    function start(ev) {
      ev.preventDefault();
      drawing = true;
      current = { color: color, points: [point(ev)] };
      strokes.push(current);
    }
    function move(ev) {
      if (!drawing || !current) return;
      ev.preventDefault();
      var p = point(ev);
      var last = current.points[current.points.length - 1] || p;
      current.points.push(p);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = current.color;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    function stop() {
      drawing = false;
      current = null;
    }
    function redrawBase() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      strokes.forEach(function (s) {
        if (!s.points || s.points.length < 2) return;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = s.color || color;
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        s.points.slice(1).forEach(function (p) {
          ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });
    }
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop, { once: false });
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', stop, { once: false });
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-gk-edit-close]')) {
        ov.remove();
        return;
      }
      var c = e.target.closest && e.target.closest('[data-gk-color]');
      if (c) {
        color = c.getAttribute('data-gk-color') || color;
        [].forEach.call(ov.querySelectorAll('[data-gk-color]'), function (b) {
          b.classList.remove('is-active');
        });
        c.classList.add('is-active');
        return;
      }
      if (e.target.closest && e.target.closest('[data-gk-clear]')) {
        strokes = [];
        redrawBase();
        return;
      }
      var planBtn = e.target.closest && e.target.closest('[data-gk-plan]');
      if (planBtn) {
        planBtn.classList.toggle('is-active');
        planBtn.textContent = planBtn.classList.contains('is-active')
          ? 'Vald till behandlingsplan/offert'
          : 'Välj till behandlingsplan/offert';
        return;
      }
      var saveBtn = e.target.closest && e.target.closest('[data-gk-save]');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Sparar…';
        if (!strokes.length) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Spara markerad bild';
          var noteEl = ov.querySelector('.gk-edit-note');
          if (noteEl) noteEl.textContent = 'Rita minst en markering innan du sparar.';
          return;
        }
        var selectedFor = ['photo', 'consent', 'treatment_plan', 'offer'];
        fetch('/api/v1/cco-photo-annotations', {
          method: 'POST',
          headers: tokenHeaders(true),
          credentials: 'same-origin',
          body: JSON.stringify({
            customerId: patientId,
            patientId: patientId,
            sourceAssetId: sourceAssetId,
            documentDate: docDate,
            captureDate: captureDate || docDate,
            captureDateTime: captureDateTime,
            imageName: name,
            zone: zone,
            selectedFor: selectedFor,
            drawingData: { strokes: strokes },
            previewDataUrl: canvas.toDataURL('image/png'),
            note: 'Markerad bild skapad i kundkortet',
          }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              if (!r.ok) throw new Error(j && j.error ? j.error : 'Kunde inte spara');
              return j;
            });
          })
          .then(function (j) {
            var note = ov.querySelector('.gk-edit-note');
            if (note)
              note.textContent =
                'Sparad som ny markerad bild. Kundkortet uppdateras i Foto och Ta bild.';
            saveBtn.textContent = 'Sparad ✓';
            if (j && j.asset && j.asset.id) {
              saveBtn.setAttribute('data-saved-asset', j.asset.id);
            }
            if (patientId) {
              try {
                if (window.__GK_DRIVE_CACHE) delete window.__GK_DRIVE_CACHE[patientId];
                if (window.__GK_CONTEXTS && window.__GK_CONTEXTS[patientId]) {
                  gkHydrateDriveFiles(window.__GK_CONTEXTS[patientId], true);
                }
              } catch (e) {
                /* Bilden är sparad även om visuell refresh misslyckas. */
              }
            }
            if (
              selectedFor.indexOf('treatment_plan') >= 0 &&
              ov.querySelector('[data-gk-plan].is-active')
            ) {
              return fetch('/api/v1/cco-treatment-plans', {
                method: 'POST',
                headers: tokenHeaders(true),
                credentials: 'same-origin',
                body: JSON.stringify({
                  customerId: patientId,
                  patientId: patientId,
                  title: 'Behandlingsplan från markerad bild',
                  annotationId: j && j.annotation ? j.annotation.id : null,
                  assetId: j && j.asset ? j.asset.id : sourceAssetId,
                  selectedImages: [
                    {
                      id: (j && j.asset && j.asset.id) || sourceAssetId,
                      assetId: (j && j.asset && j.asset.id) || sourceAssetId,
                      annotationId: j && j.annotation ? j.annotation.id : null,
                      url: (j && j.annotation && j.annotation.previewUrl) || '',
                      date: docDate,
                      zone: zone,
                      label: name,
                      selectedFor: selectedFor,
                    },
                  ],
                  providerComment: 'Skapad från markerad bild i kundkortet.',
                  offerIntent: {
                    status: 'ready_for_offer_draft',
                    source: 'photo_annotation',
                    reason: 'Markerad bild vald till behandlingsplan/offert',
                  },
                }),
              })
                .then(function (r) {
                  return r.json().then(function (plan) {
                    if (!r.ok)
                      throw new Error(plan && plan.error ? plan.error : 'Plan kunde inte sparas');
                    if (note)
                      note.textContent =
                        'Sparad som ny markerad bild och behandlingsplans-/offertutkast.';
                    return plan;
                  });
                })
                .catch(function (err) {
                  if (note)
                    note.textContent =
                      'Bilden sparades, men planutkastet kunde inte skapas: ' + err.message;
                });
            }
            return j;
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Spara markerad bild';
            var note = ov.querySelector('.gk-edit-note');
            if (note) note.textContent = err.message || 'Kunde inte spara.';
          });
      }
    });
  };

  // Foto: before/after-slider-overlay (clip-path-jämförelse, dra reglaget)
  window.__gkOpenCompare = function (d) {
    if (!d) return;
    var prev = document.getElementById('gk-compare-ov');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    function esc2(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    var ov = document.createElement('div');
    ov.id = 'gk-compare-ov';
    ov.className = 'gk-cmp-ov';
    ov.innerHTML =
      '<div class="gk-cmp-box">' +
      '<div class="gk-cmp-head"><b>' +
      esc2(d.zone || 'Jämför') +
      '</b>' +
      '<span class="gk-cmp-sub">Dra reglaget</span>' +
      '<button type="button" class="gk-cmp-close" aria-label="Stäng">✕</button></div>' +
      '<div class="gk-cmp-stage">' +
      '<div class="gk-cmp-after"><img src="' +
      esc2(d.afterImg) +
      '" onerror="this.style.opacity=0"/>' +
      '<span class="gk-cmp-lbl gk-cmp-lbl-r">Efter · ' +
      esc2(d.afterLabel) +
      '</span></div>' +
      '<div class="gk-cmp-before" id="gkCmpBefore"><img src="' +
      esc2(d.beforeImg) +
      '" onerror="this.style.opacity=0"/>' +
      '<span class="gk-cmp-lbl gk-cmp-lbl-l">Före · ' +
      esc2(d.beforeLabel) +
      '</span></div>' +
      '<div class="gk-cmp-divider" id="gkCmpDiv"></div>' +
      '</div>' +
      '<input type="range" min="0" max="100" value="50" class="gk-cmp-range" id="gkCmpRange" aria-label="Jämför före och efter"/>' +
      '</div>';
    document.body.appendChild(ov);
    var beforeEl = ov.querySelector('#gkCmpBefore');
    var divEl = ov.querySelector('#gkCmpDiv');
    var range = ov.querySelector('#gkCmpRange');
    function setPos(v) {
      if (beforeEl) beforeEl.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      if (divEl) divEl.style.left = v + '%';
    }
    if (range)
      range.addEventListener('input', function () {
        setPos(range.value);
      });
    setPos(50);
    ov.addEventListener('click', function (ev) {
      if (ev.target === ov || (ev.target.closest && ev.target.closest('.gk-cmp-close'))) {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
      }
    });
    document.addEventListener('keydown', function escClose(ev) {
      if (ev.key === 'Escape') {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        document.removeEventListener('keydown', escClose);
      }
    });
  };

  // EKONOMI: ärlig Fortnox-statusrad (ansluten / patient kopplad / leverantörsblocker) + Synka/Anslut
  window.__gkLoadFortnox = function () {
    var ov = document.getElementById('kk-storvy');
    if (!ov) return;
    var el = ov.querySelector('[data-gk-fortnox]');
    if (!el) return;
    var pid = el.getAttribute('data-gk-fortnox') || '';
    var linked = el.getAttribute('data-gk-fnx-linked') === '1';
    var tok = '';
    try {
      tok = (
        window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (e) {
      tok = '';
    }
    if (!tok) return;
    function esc3(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    fetch('/api/v1/cco-fortnox/status', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (s) {
        if (!s) return; // 401/403 (ej ägare) → visa inget
        var configured = !!s.configured;
        var connected = !!s.connected;
        var blocked = !!s.blockedIntegration;
        var cls = '',
          html = '',
          sub = '';
        if (!configured) {
          cls = 'is-off';
          html = 'Fortnox ej konfigurerat';
        } else if (connected && linked) {
          cls = 'is-ok';
          html = 'Fortnox ansluten · kopplad';
        } else if (connected && !linked) {
          cls = 'is-warn';
          html =
            'Fortnox ansluten · patient ej kopplad' +
            '<button type="button" class="gk-btn gk-eko-fnx-btn" data-gk-fortnox-sync data-pid="' +
            esc3(pid) +
            '">Synka till Fortnox</button>';
        } else if (blocked) {
          cls = 'is-off';
          html = 'Fortnox: ej ansluten — leverantörsblocker';
          sub =
            s.blockerReason ||
            'Fortnox-portalen returnerar fel. Åtgärdas när Fortnox-felen är lösta.';
        } else {
          cls = 'is-off';
          html =
            'Fortnox: ej ansluten' +
            '<button type="button" class="gk-btn gk-eko-fnx-btn" data-gk-fortnox-connect>Anslut</button>';
        }
        el.className = 'gk-eko-fortnox ' + cls;
        el.innerHTML =
          '<span class="gk-eko-fnx-dot"></span><span class="gk-eko-fnx-txt">' +
          html +
          '</span>' +
          (sub ? '<span class="gk-eko-fnx-sub gk-sub">' + esc3(sub) + '</span>' : '');
        el.hidden = false;
      })
      .catch(function () {});
  };

  // Hämtar journal-timeline (41-händelse-flödet) och fyller Historik-sektionen i gemensamma kortet
  window.__gkLoadAutoSends = function () {
    var ov = document.getElementById('kk-storvy');
    if (!ov) return;
    var tlEl = ov.querySelector('[data-gk-tl]');
    var pid = tlEl ? tlEl.getAttribute('data-gk-tl') : '';
    if (!pid) return;
    var pname = tlEl ? tlEl.getAttribute('data-gk-pname') || '' : '';
    var pemail = tlEl ? tlEl.getAttribute('data-gk-pemail') || '' : '';
    var tok = '';
    try {
      tok = (window.localStorage.getItem('ARCANA_ADMIN_TOKEN') || '').trim();
    } catch (e) {
      tok = '';
    }
    var H = tok ? { authorization: 'Bearer ' + tok } : {};
    function rel(ts) {
      var t = Date.parse(ts);
      if (!isFinite(t)) return '';
      var d = (Date.now() - t) / 864e5;
      if (d < 1) return 'idag';
      if (d < 2) return 'igår';
      return Math.round(d) + ' dgr sedan';
    }
    fetch(
      '/api/v1/cco/patients/' +
        encodeURIComponent(pid) +
        '/automation-sends?tenantId=hair-tp-clinic' +
        (pname ? '&patientName=' + encodeURIComponent(pname) : '') +
        (pemail ? '&email=' + encodeURIComponent(pemail) : ''),
      { headers: H }
    )
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (!j || !j.sends) return;
        ['confirmation', 'reminder', 'aftercare', 'review'].forEach(function (k) {
          var s = j.sends[k];
          if (!s || !s.sentAt) return;
          var el = ov.querySelector('[data-gk-auto="' + k + '"] .gk-auto-sent');
          if (el) {
            el.textContent =
              '· senast skickad ' + rel(s.sentAt) + (s.clickedAt ? ' · klickad' : '');
          }
        });
      })
      .catch(function () {});
  };
  window.__gkLoadTimeline = function () {
    var ov = document.getElementById('kk-storvy');
    if (!ov) return;
    var cont = ov.querySelector('[data-gk-tl]');
    if (!cont) return;
    var pid = cont.getAttribute('data-gk-tl');
    if (!pid) return;
    var tok = '';
    try {
      tok = (
        window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (e) {
      /* ignore */
    }
    var hdr = { 'Content-Type': 'application/json', 'x-cco-tenant': 'hair-tp-clinic' };
    if (tok && tok !== '__preview_local__') hdr.Authorization = 'Bearer ' + tok;
    function esc2(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function toneTag(t) {
      return t === 'ok'
        ? 'gk-tag-ok'
        : t === 'warn'
          ? 'gk-tag-warn'
          : t === 'blocker'
            ? 'gk-tag-risk'
            : 'gk-tag-info';
    }
    fetch(
      '/api/v1/cco-customers/' +
        encodeURIComponent(pid) +
        '/journal-timeline?tenantId=hair-tp-clinic',
      { headers: hdr }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var evs = (j && j.events) || [];
        // Slå ihop bokningar (från kortet) + timeline-events → en lista, sorterad på datum (C)
        var bk = [];
        try {
          bk = JSON.parse(decodeURIComponent(cont.getAttribute('data-gk-bk') || '')) || [];
        } catch (e) {
          bk = [];
        }
        var all = bk.concat(
          evs
            .filter(function (ev) {
              // Journaler har egen sektion — visa inte journal-skapad/signerad i Historik
              return !/^journal_(draft_created|signed)$/.test(ev.type || '');
            })
            .map(function (ev) {
              return {
                ts: ev.ts,
                title: ev.title || ev.type,
                icon: ev.icon,
                tone: ev.tone,
                actor: ev.actor,
                openIndex: ev.detail && ev.detail.openIndex,
                src: 'event',
              };
            })
        );
        if (!all.length) return;
        all.sort(function (a, b) {
          return String(b.ts || '').localeCompare(String(a.ts || ''));
        });
        var rows = all
          .slice(0, 50)
          .map(function (it) {
            var d = String(it.ts || '').slice(0, 10);
            var ordinal =
              it.openIndex > 1
                ? (it.openIndex === 2 ? '2:a' : it.openIndex + ':e') + ' gången'
                : '';
            var tag = ordinal
              ? '<span class="gk-hl gk-tag gk-tag-warn">' + ordinal + '</span>'
              : it.actor
                ? '<span class="gk-hl gk-tag ' +
                  toneTag(it.tone) +
                  '">' +
                  esc2(it.actor) +
                  '</span>'
                : it.src === 'bokning'
                  ? '<span class="gk-hl gk-tag gk-tag-info">Besök</span>'
                  : it.src === 'betald'
                    ? '<span class="gk-hl gk-tag gk-tag-ok">Betald</span>'
                    : '';
            return (
              '<div class="gk-rad gk-tl-row"><span class="gk-sub" style="min-width:78px">' +
              esc2(d) +
              '</span> ' +
              (it.icon ? esc2(it.icon) + ' ' : '') +
              esc2(it.title || 'Händelse') +
              tag +
              '</div>'
            );
          })
          .join('');
        cont.innerHTML = rows;
        var cnt = ov.querySelector('[data-gk-hist-count]');
        if (cnt) cnt.textContent = all.length + ' händelser';
        var sb = ov.querySelector('#gk-sum-box');
        if (sb) {
          var sista = String((all[0] || {}).ts || '').slice(0, 10);
          var forst = String((all[all.length - 1] || {}).ts || '').slice(0, 10);
          sb.textContent =
            all.length +
            ' händelser' +
            (sista ? ' · senaste ' + sista : '') +
            (forst ? ' · sedan ' + forst : '');
        }
      })
      .catch(function () {
        /* nätfel — bokningar-fallbacken står kvar */
      });
  };

  window.__gkHydrateSecurePhotos = function (root) {
    var scope = root || document.getElementById('kk-storvy') || document;
    if (!scope) return;
    var token = '';
    try {
      token = (
        window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (e) {
      token = '';
    }
    var headers =
      token && token !== '__preview_local__' ? { Authorization: 'Bearer ' + token } : {};
    if (!window.__gkPhotoObjectUrls) window.__gkPhotoObjectUrls = [];
    var queue = [].slice
      .call(
        scope.querySelectorAll(
          'img[data-gk-img-src], img[data-gk-img-full], video[data-gk-img-src], video[data-gk-img-full]'
        )
      )
      .filter(function (node) {
        var tile = node.closest && node.closest('.gk-foto');
        var hasNativeImageSrc =
          node.tagName === 'IMG' &&
          node.getAttribute('src') &&
          !node.classList.contains('is-broken');
        return (
          !hasNativeImageSrc &&
          (!tile || window.getComputedStyle(tile).display !== 'none') &&
          node.dataset.gkLoaded !== 'true' &&
          node.dataset.gkLoading !== 'true'
        );
      });
    var cursor = 0;
    var active = 0;
    function pump() {
      while (active < 3 && cursor < queue.length) hydrateOne(queue[cursor++]);
    }
    function done() {
      active = Math.max(0, active - 1);
      pump();
    }
    function hydrateOne(node) {
      if (node.dataset.gkLoaded === 'true' || node.dataset.gkLoading === 'true') return;
      var primary = node.getAttribute('data-gk-img-src') || '';
      var fallback = node.getAttribute('data-gk-img-full') || '';
      var urls = [];
      if (primary && primary !== '#') urls.push(primary);
      if (
        fallback &&
        fallback !== '#' &&
        fallback !== primary &&
        node.getAttribute('data-gk-allow-full-fallback') === '1'
      ) {
        urls.push(fallback);
      }
      if (!urls.length) return;
      node.dataset.gkLoading = 'true';
      active += 1;
      var link = node.closest('a.gk-foto');
      function tryNext(i) {
        if (i >= urls.length) {
          node.dataset.gkLoading = 'false';
          node.classList.add('is-broken');
          if (link && !link.querySelector('.gk-foto-loaderr')) {
            var err = document.createElement('small');
            err.className = 'gk-foto-loaderr';
            err.textContent = 'Kunde inte visa media';
            link.appendChild(err);
          }
          done();
          return;
        }
        fetch(new URL(urls[i], window.location.origin), {
          headers: headers,
          credentials: 'same-origin',
        })
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.blob().then(function (blob) {
              var ct = res.headers.get('content-type') || '';
              if (!blob.type && ct) blob = new Blob([blob], { type: ct.split(';')[0] });
              var obj = URL.createObjectURL(blob);
              window.__gkPhotoObjectUrls.push(obj);
              node.src = obj;
              node.dataset.gkLoaded = 'true';
              node.dataset.gkLoading = 'false';
              node.classList.remove('is-broken');
              if (link) link.href = obj;
              done();
            });
          })
          .catch(function () {
            tryNext(i + 1);
          });
      }
      tryNext(0);
    }
    pump();
  };

  window.__gkRevealDeferredPhotos = function (root) {
    var scope = root || document;
    if (!scope) return;
    [].slice.call(scope.querySelectorAll('.gk-foto--deferred')).forEach(function (tile) {
      var media =
        tile.querySelector('img[data-gk-deferred-img-src], video[data-gk-deferred-img-src]') ||
        tile.querySelector('img[data-gk-deferred-img-full], video[data-gk-deferred-img-full]');
      if (!media) return;
      var primary = media.getAttribute('data-gk-deferred-img-src') || '';
      var full = media.getAttribute('data-gk-deferred-img-full') || '';
      if (primary) media.setAttribute('data-gk-img-src', primary);
      if (full) media.setAttribute('data-gk-img-full', full);
      media.removeAttribute('data-gk-deferred-img-src');
      media.removeAttribute('data-gk-deferred-img-full');
      tile.classList.remove('gk-foto--deferred');
    });
  };

  window.__renderReferensKundkort = function (card, bundle, journalEntries, extras) {
    card = card || {};
    bundle = bundle || {};
    extras = extras || {};
    var driveFiles = dedupeDriveFiles(extras.driveFiles);
    var commercialCase = extras.commercialCase || null;
    var bcard =
      bundle.card && typeof bundle.card === 'object' ? Object.assign({}, card, bundle.card) : card;
    bcard = withUniqueReferensFileSummary(bcard, driveFiles);
    var name = bcard.displayName || bcard.name || bcard.fullName || 'Kund';
    var phone = bcard.primaryPhone || (bcard.contact && bcard.contact.phone) || '';
    var email = bcard.primaryEmail || (bcard.contact && bcard.contact.email) || '';
    var addr = bcard.contact && bcard.contact.address;
    var addrLine = addr
      ? [addr.street, [addr.zip, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : '';
    var treatment = A(bcard.treatmentTypes).join(', ');

    var docsPayload = resolveReferensDocs(bcard, bundle);
    var offers = resolveReferensOffers(docsPayload, commercialCase);
    var autoDocs = A(docsPayload.autoDocs);
    var photos = resolveReferensPhotos(bcard, driveFiles.length ? driveFiles : A(bundle.photos));

    /* ---- header tags ---- */
    var tags = '';
    if (bcard.vip || (bcard.tags && bcard.tags.vip)) tags += '<span class="dtag vip">VIP</span>';
    if (treatment) tags += '<span class="dtag cure">' + esc(treatment) + '</span>';
    if (bcard.engagement || (bcard.tags && bcard.tags.engagement))
      tags +=
        '<span class="dtag eng">' +
        esc(bcard.engagement || bcard.tags.engagement) +
        '% engagemang</span>';

    /* ---- journey (mockup canonical 9 steg — samma facit som ⤢ overlay) ---- */
    var steps = null;
    var cur = null;
    var total = 9;
    var nextLabel = '';
    var bookingExtras =
      window.CcoKundkortKkx &&
      typeof window.CcoKundkortKkx.resolveReferensBookingExtras === 'function'
        ? window.CcoKundkortKkx.resolveReferensBookingExtras(bcard, bundle, extras || {})
        : {
            occasionTimeline: extras.occasionTimeline || bundle.occasionTimeline || null,
          };
    var ctxExtras = bookingExtras;
    var canonicalJourney =
      window.CcoKundkortKkx && typeof window.CcoKundkortKkx.buildCanonicalJourneyLive === 'function'
        ? window.CcoKundkortKkx.buildCanonicalJourneyLive(bcard, journalEntries, bundle, ctxExtras)
        : null;
    if (canonicalJourney && canonicalJourney.steps && canonicalJourney.steps.length) {
      steps = canonicalJourney.steps.map(function (s) {
        return {
          id: s.step,
          label: s.label,
          note: s.meta || '',
          state:
            s.status === 'done'
              ? 'done'
              : s.status === 'active'
                ? 'active'
                : s.status === 'neutral'
                  ? 'neutral'
                  : 'todo',
        };
      });
      var polished = polishReferensJourney(canonicalJourney, steps, cur, 9);
      steps = polished.steps;
      cur = polished.cur;
      total = 9;
      nextLabel = polished.nextLabel || nextLabel;
    }

    /* ---- health declaration (patient-master + halso@) ---- */
    var hd = bcard.healthDeclaration || bundle.healthDeclaration || null;
    var fc = bcard.fitnessCertificate || bundle.fitnessCertificate || null;
    bcard.healthDeclaration = hd;
    bcard.fitnessCertificate = fc;
    var allergies = A(bcard.allergies).length ? A(bcard.allergies) : (hd && A(hd.allergies)) || [];

    /* ---- canonical signals (10) — delas i blockerare (gates) vs möjligheter (insikter) ---- */
    var signals = filterCanonicalSignals(bcard, bundle, journalEntries, ctxExtras);
    var gateSignals = signals.filter(isBlockerSignal);
    var oppSignals = signals.filter(function (s) {
      return !isBlockerSignal(s);
    });
    // Header-pill: friskförsäkran saknas (ur gate-signal, frontend — VIP/engagemang/PRP-kur via ORD-39)
    if (
      gateSignals.some(function (s) {
        return /operation_day_insurance/.test(String((s && (s.ruleId || s.id)) || ''));
      })
    ) {
      tags +=
        '<span class="dtag" style="background:#f6e3e3;color:#b94a4a">⚠ Friskförs. saknas</span>';
    }
    // Datadrivna möjligheter (klientsida, ur data vi redan har) — merförsäljning/mönster.
    (function addComputedInsights() {
      var up = A(ctxExtras.upcomingBookings);
      var hist = A(ctxExtras.historyBookings);
      if (!up.length && hist.length) {
        var senaste = hist[0] || {};
        var nar = senaste.dateLabel || senaste.date || senaste.when || '';
        oppSignals.push({
          ruleId: 'opportunity.reengage',
          label: 'Ingen kommande tid bokad',
          detail:
            (nar ? 'Senaste besök ' + String(nar).slice(0, 10) + '. ' : '') + 'Föreslå återbesök.',
        });
      }
    })();

    /* ---- economy ---- */
    var ltvRaw = bcard.lifetimeValue ?? bcard.dealValue ?? bcard.pipedriveDealValue;
    var ltvLabel =
      bcard.lifetimeValueLabel ||
      (Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0 ? String(ltvRaw) : null);

    function orderDossierHtml(html) {
      var order = [
        'kundresa',
        'nastasteg',
        'opdag',
        'halso',
        'besok',
        'bokningar',
        'journal',
        'foto',
        'historik',
        'offert',
        'ekonomi',
        'betalning',
        'dokument',
        'personal',
        'auto',
        'anteckningar',
        'kommunikation',
        'insikter',
        'tabild',
      ];
      try {
        var tpl = document.createElement('template');
        tpl.innerHTML = html;
        var doss = tpl.content.querySelector('.doss');
        if (!doss) return html;
        var sections = Array.prototype.slice.call(
          doss.querySelectorAll('details.dossier-section[data-sek]')
        );
        if (!sections.length) return html;
        var container = sections[0].parentElement;
        order.forEach(function (slug) {
          var el = doss.querySelector('details.dossier-section[data-sek="' + slug + '"]');
          if (el) container.appendChild(el);
        });
        return tpl.innerHTML;
      } catch (_e) {
        return html;
      }
    }

    /* ===== BUILD ===== */
    var h = '<div class="doss">';

    h +=
      '<div class="dhead"><div class="ring"><div class="av">' +
      esc(initials(name)) +
      '</div></div>' +
      '<div style="flex:1"><div class="dk">KUNDDOSSIÉR</div><div class="dn">' +
      esc(name) +
      '</div>' +
      '<div class="dc">' +
      (phone
        ? '<a class="kk-contact" href="tel:' +
          esc(String(phone).replace(/[^\d+]/g, '')) +
          '">📞 ' +
          esc(phone) +
          '</a>'
        : '') +
      (email
        ? (phone ? ' · ' : '') +
          '<a class="kk-contact" href="mailto:' +
          esc(email) +
          '">✉ ' +
          esc(email) +
          '</a>'
        : '') +
      '</div>' +
      (addrLine
        ? '<div class="dc"><span class="kk-contact kk-copy" data-kk-copy="' +
          esc(addrLine) +
          '" title="Kopiera adress">📍 ' +
          esc(addrLine) +
          ' <span class="kk-copy-ic">⧉</span></span></div>'
        : '') +
      (tags ? '<div class="dtags">' + tags + '</div>' : '') +
      '</div></div>';

    h += '<div class="ds">';

    // Smart sammanfattning: väv in nästa bokning (ORD-37) + handling + stegräkning
    var nextBk = A(ctxExtras.upcomingBookings)[0];
    var summFrisk = gateSignals.some(function (s) {
      return /operation_day_insurance/.test(String((s && (s.ruleId || s.id)) || ''));
    });
    var bkWhen = '';
    if (nextBk) {
      var rawD = nextBk.date || nextBk.occurredAt || nextBk.startAt || '';
      var relD = nextBk.dateLabel || '';
      if (!relD && rawD) {
        var _dt = new Date(rawD);
        if (!isNaN(_dt)) {
          var _t = new Date();
          _t.setHours(0, 0, 0, 0);
          var _d0 = new Date(_dt);
          _d0.setHours(0, 0, 0, 0);
          var _diff = Math.round((_d0 - _t) / 86400000);
          var _mn = [
            'jan',
            'feb',
            'mar',
            'apr',
            'maj',
            'jun',
            'jul',
            'aug',
            'sep',
            'okt',
            'nov',
            'dec',
          ];
          relD =
            _diff === 0
              ? 'idag'
              : _diff === 1
                ? 'imorgon'
                : _d0.getDate() + ' ' + _mn[_d0.getMonth()];
        } else {
          relD = String(rawD).slice(0, 10);
        }
      }
      bkWhen = [relD, nextBk.time || nextBk.startTime || ''].filter(Boolean).join(' ');
    }
    var bkStr = nextBk
      ? (nextBk.title || nextBk.serviceName || 'bokning') + (bkWhen ? ' ' + bkWhen : '')
      : '';
    var summAction = summFrisk ? 'friskförsäkran signeras på plats' : nextLabel;
    if (nextLabel || cur || bkStr) {
      var nx = bkStr ? bkStr + (summAction ? ' — ' + summAction : '') : summAction;
      h +=
        '<div class="summ kkx-summ"><span class="sk">SMART SAMMANFATTNING</span>' +
        (nx ? '<b>Nästa:</b> ' + esc(nx) + '. ' : 'Kundresan pågår. ') +
        (cur ? 'Steg ' + esc(cur) + ' av ' + esc(total) + '.' : '') +
        '</div>';
    }

    var visits = bcard.visits ?? bcard.visitCount ?? (bcard.stats && bcard.stats.visits);
    var revenue =
      bcard.lifetimeValueLabel ||
      (Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0 ? ltvRaw : null) ||
      (bcard.stats && bcard.stats.revenue);
    var revenueKr =
      Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0
        ? Number(ltvRaw).toLocaleString('sv-SE') + ' kr'
        : (bcard.stats && bcard.stats.revenue) || null;
    var noshow = bcard.noShows != null ? bcard.noShows : bcard.stats && bcard.stats.noShows;
    // FACIT: visa alltid 3 statrutor (Besök/Intäkt/No-shows) med subtext-rad
    h +=
      '<div class="s3">' +
      '<div class="k"><div class="l">Besök</div><div class="v">' +
      esc(visits != null ? visits : '—') +
      '</div><div class="s">' +
      (visits != null ? 'totalt' : 'inga än') +
      '</div></div>' +
      '<div class="k"><div class="l">Intäkt</div><div class="v">' +
      esc(revenueKr != null ? revenueKr : '—') +
      '</div><div class="s">' +
      esc(revenueKr != null ? ltvLabel || 'LTV' : '—') +
      '</div></div>' +
      '<div class="k"><div class="l">No-shows</div><div class="v">' +
      esc(noshow != null ? noshow : '0') +
      '</div><div class="s">' +
      (Number(noshow) > 0 ? 'följ upp' : 'klockren') +
      '</div></div></div>';

    // ===== Närvaro: Show / No-show (receptionist markerar, syns för behandlare, loggas) =====
    var att = bcard.attendance && typeof bcard.attendance === 'object' ? bcard.attendance : {};
    var attStatus = att.status || '';
    var attAt = att.at ? new Date(att.at) : null;
    var attTime =
      attAt && !isNaN(attAt)
        ? attAt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        : '';
    h +=
      '<div class="kk-attend' +
      (attStatus ? ' is-' + esc(attStatus) : '') +
      '" data-patient-id="' +
      esc(bcard.patientId || bcard.id || '') +
      '">' +
      '<div class="kk-attend-status' +
      (attStatus ? ' is-' + esc(attStatus) : '') +
      '" data-kk-attend-status>' +
      (attStatus === 'show'
        ? '✓ Ankommen' + (attTime ? ' ' + esc(attTime) : '') + (att.by ? ' · ' + esc(att.by) : '')
        : attStatus === 'no_show'
          ? '✕ No-show · kontakta kunden'
          : 'Närvaro ej markerad') +
      '</div>' +
      '<div class="kk-attend-btns">' +
      '<button type="button" class="kk-att-btn kk-att-show" data-kk-attend="show"><span class="kk-att-ico">✓</span> Show</button>' +
      '<button type="button" class="kk-att-btn kk-att-noshow" data-kk-attend="no_show"><span class="kk-att-ico">✕</span> No-show</button>' +
      '</div></div>';

    var opDayHtml = '';
    if (
      window.CcoHairtpDocumentCloud &&
      typeof window.CcoHairtpDocumentCloud.buildOpDayStaffActionsHtml === 'function'
    ) {
      opDayHtml = window.CcoHairtpDocumentCloud.buildOpDayStaffActionsHtml(bcard) || '';
    }
    if (opDayHtml) {
      h += sec('Op-dag · personal', '5', opDayHtml);
    }

    h += '<div class="gthread"></div>';

    if (allergies.length) {
      h +=
        '<div class="med kkx-med"><div class="mi">!</div><div style="font-size:10.5px"><b>Medicinskt:</b> Allergi — ' +
        esc(allergies.join(' · ')) +
        '.</div></div>';
    }

    h += sec(
      'Medicinskt läge',
      medicinsktSectionPill(bcard),
      buildMedicinsktFormsInner(bcard, driveFiles)
    );

    if (steps) {
      var pct = cur ? Math.round((cur / total) * 100) : 0;
      // Gruppera intilliggande KLARA steg (facit: 1–4, 6–7). Aktiva/kommande står kvar.
      function kkMergeDone(run) {
        if (run.length === 1) return run[0];
        var first = run[0];
        var last = run[run.length - 1];
        var range = (first.id || '') + '–' + (last.id || '');
        var lbl =
          range +
          ' · ' +
          first.label +
          (last.label && last.label !== first.label ? ' → ' + last.label : '');
        return { state: 'done', id: range, label: lbl, note: last.note || 'Klar' };
      }
      var groupedSteps = [];
      var doneRun = [];
      steps.forEach(function (s) {
        if (s.state === 'done') {
          doneRun.push(s);
        } else {
          if (doneRun.length) {
            groupedSteps.push(kkMergeDone(doneRun));
            doneRun = [];
          }
          groupedSteps.push(s);
        }
      });
      if (doneRun.length) groupedSteps.push(kkMergeDone(doneRun));

      var stepHtml = groupedSteps
        .map(function (s) {
          var st =
            s.state === 'done'
              ? 'done'
              : s.state === 'active'
                ? 'act'
                : s.state === 'neutral'
                  ? 'neutral'
                  : 'todo';
          var mk =
            st === 'done' ? '✓' : st === 'neutral' ? '–' : st === 'act' ? s.id || '!' : s.id || '';
          var jump = stepJumpSlug(s.label);
          var medForm = stepMedFormSlug(s.label);
          return (
            '<div class="step kkx-step ' +
            st +
            (jump ? ' kk-jumpable" data-kk-jump="' + jump + '"' : '"') +
            (medForm ? ' data-kk-med-form="' + medForm + '"' : '') +
            '><div class="mk kkx-mk">' +
            esc(mk) +
            '</div><div><div class="t">' +
            esc(s.label) +
            '</div>' +
            '<div class="s">' +
            esc(
              s.note ||
                (st === 'done'
                  ? 'Klar'
                  : st === 'act'
                    ? 'Pågår · nästa steg'
                    : st === 'neutral'
                      ? '—'
                      : 'Kommande')
            ) +
            '</div>' +
            '</div></div>'
          );
        })
        .join('');
      h += sec(
        'Kundresa · ' + total + ' steg',
        cur ? '<span class="sb-chip">Steg ' + esc(cur) + '</span>' : '',
        '<div class="jcard"><div class="stepwrap kkx-barwrap"><div class="sbar kkx-bar" style="width:' +
          pct +
          '%"></div></div>' +
          '<div class="sl kkx-bl">' +
          (cur ? cur + ' / ' + total + ' steg' : '') +
          (nextLabel ? ' · nästa: ' + esc(nextLabel) : '') +
          '</div>' +
          stepHtml +
          '</div>'
      );
    }

    if (gateSignals.length) {
      h += sec(
        'Smart nästa steg',
        String(gateSignals.length),
        gateSignals
          .map(function (s) {
            var tone = /block|legal/.test(s.risk || s.level || '') ? 'block' : 'info';
            var pill =
              tone === 'block'
                ? '<span class="pill p-block">Blockerare</span>'
                : '<span class="pill" style="background:var(--info-bg);color:var(--info)">Info</span>';
            var sig = esc(s.ruleId || s.id || '');
            return (
              '<div class="row acc ' +
              tone +
              '"><div style="flex:1"><div class="rt">' +
              esc(s.what || s.label || '—') +
              '</div><div class="rm">' +
              esc(signalSub(s)) +
              '</div></div>' +
              pill +
              '<button type="button" class="kk-sig-act" data-kk-sig="' +
              sig +
              '" data-kk-sig-label="' +
              esc(s.what || s.label || '') +
              '" title="Åtgärda">→</button>' +
              '</div>'
            );
          })
          .join('')
      );
    } else {
      h += sec('Smart nästa steg', '0', empty('Inga aktiva gates just nu.'));
    }

    h += '<div class="gthread"></div>';

    var hist = A(ctxExtras.historyBookings);
    var up = A(ctxExtras.upcomingBookings);
    var needsFrisk = gateSignals.some(function (s) {
      return /operation_day_insurance/.test(String((s && (s.ruleId || s.id)) || ''));
    });
    h += sec(
      'Kommande bokningar',
      String(up.length),
      up.length
        ? up
            .slice(0, 5)
            .map(function (b, i) {
              return bookingRow(b, false, { needsFrisk: needsFrisk && i === 0 });
            })
            .join('')
        : empty('Inga kommande bokningar.')
    );
    var histInner;
    if (hist.length) {
      var sen = hist[0] || {};
      var senNar = sen.date || sen.occurredAt || sen.startAt || '';
      var typeCount = {};
      hist.forEach(function (b) {
        var t = b.title || b.serviceName || 'Besök';
        typeCount[t] = (typeCount[t] || 0) + 1;
      });
      var top = Object.keys(typeCount).sort(function (a, b) {
        return typeCount[b] - typeCount[a];
      })[0];
      var histSum =
        hist.length +
        ' besök' +
        (senNar ? ' · senaste ' + String(senNar).slice(0, 10) : '') +
        (top ? ' · oftast: ' + top : '');
      histInner =
        '<div class="kk-sumbar"><button type="button" class="kk-sum-btn" data-kk-sum>Sammanfatta</button>' +
        '<span class="kk-sum-box" data-kk-sum-box hidden>' +
        esc(histSum) +
        '</span></div>' +
        hist
          .slice(0, 6)
          .map(function (b) {
            return bookingRow(b, true);
          })
          .join('');
    } else {
      histInner = empty('Ingen historik ännu.');
    }
    h += sec('Historik', String(hist.length), histInner);

    function isReferensPhotoLikeJournalEntry(j) {
      var raw = String(
        [
          j && j.type,
          j && j.category,
          j && j.journalType,
          j && j.title,
          j && j.fileName,
          j && j.originalFileName,
        ]
          .filter(Boolean)
          .join(' ')
      ).toLowerCase();
      var looksLikePhoto = /\b(foto|photo|image|bilder|media|asset)\b/.test(raw);
      var isRealJournalDoc =
        /\b(journal|frisk|samtycke|hälsodeklaration|halsodeklaration|avtal)\b/.test(raw);
      return looksLikePhoto && !isRealJournalDoc;
    }
    var jrs = (A(journalEntries).length ? A(journalEntries) : A(bundle.journals)).filter(
      function (j) {
        return !isReferensPhotoLikeJournalEntry(j);
      }
    );
    function referensJournalVisualState(j) {
      if (j.locked) return 'done';
      if (j.canSign || /draft|open|active|utkast/i.test(String(j.status || ''))) return 'act';
      if (j.state === 'todo') return 'todo';
      return j.locked ? 'done' : 'act';
    }
    // ===== Journaler · personal — serie-numrerad (X/N via datum i mappnamnet) =====
    function jSeriesKey(s) {
      var t = String(s || '').toLowerCase();
      if (/prp/.test(t)) return 'PRP';
      if (/dhi/.test(t)) return 'DHI';
      if (/\bfue\b/.test(t)) return 'FUE';
      if (/microneedl|needl/.test(t)) return 'Microneedling';
      return '';
    }
    function jDate10(x) {
      return String(x || '').slice(0, 10);
    }
    // Mina riktigt datum ur filnamnet (YYYY-MM-DD eller unix-epoch) — ej importstämpeln
    function jMineDate(s) {
      var str = String(s || '');
      var m = str.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
      if (m) return m[1] + '-' + m[2] + '-' + m[3];
      var ep = str.match(/\b(1[0-9]{9})\b/);
      if (ep) {
        var d = new Date(Number(ep[1]) * 1000);
        if (!isNaN(d)) return d.toISOString().slice(0, 10);
      }
      return '';
    }
    var jNameToks = String(name || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(function (t) {
        return t.length > 2;
      });
    // Ren etikett ur (ofta mojibakat) filnamn — typ-baserad, patientnamn bortstrippat
    function jCleanTitle(raw, jtype) {
      var n = String(raw || '');
      if (/prp/i.test(n)) return 'PRP-journal';
      if (/friskf/i.test(n)) return 'Friskförsäkran';
      if (/ordination/i.test(n)) return 'Ordinationsmall';
      if (/avtal/i.test(n)) return 'Behandlingsavtal';
      if (/samtycke|consent/i.test(n)) return 'Samtycke';
      var c = n
        .replace(/\.(pdf|docx?|jpe?g|png|heic)$/i, '')
        .replace(/\s*\|\s*/g, ' · ')
        .replace(/\?{2,}|\+\?/g, ' ')
        .replace(/\b1[0-9]{9}\b/g, ' ')
        .replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, ' ')
        .replace(/[-_]\d{2,4}\b/g, ' ')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      c = c
        .split(' ')
        .filter(function (w) {
          return w && jNameToks.indexOf(w.toLowerCase()) < 0;
        })
        .join(' ')
        .trim();
      return c || (jtype ? jtype : 'Journal');
    }
    var jItems = jrs.map(function (j) {
      var st = referensJournalVisualState(j);
      var raw = j.title || j.journalType || '';
      return {
        st: st,
        // ORD-36: journalDateReal = auktoritativt behandlingsdatum (ej importstämpel)
        date: j.journalDateReal || jMineDate(raw) || jDate10(j.date || j.signedAt || j.createdAt),
        title: jCleanTitle(raw, j.journalType),
        key: j.treatmentType || jSeriesKey(raw),
        // ORD-36: journalStep från Meridiq/härlett, annars befintliga fallback
        step: j.journalStep != null ? j.journalStep : j.step != null ? j.step : j.journeyStep,
        // ORD-36: treater (riktig behandlare); annars signedByName filtrerat (ej Drive-import)
        by: (function () {
          if (j.treater) return j.treater;
          var n = j.by || j.authorName || j.signedByName || '';
          return /drive-?import|^\s*import\s*$|system|auto-?import/i.test(String(n)) ? '' : n;
        })(),
        entryId: j.entryId || j.id || '',
        jType: j.journalType || '',
      };
    });
    // "Vad som kommer näst": närmaste kommande bokning = AKTIV journal (orange, Inför),
    // resten = streckade kommande. Hoppa över om det redan finns en aktiv riktig journal.
    var jHasRealAct = jItems.some(function (it) {
      return it.st === 'act';
    });
    var jPlanned = A(up)
      .slice(0, 4)
      .map(function (b, i) {
        return {
          st: !jHasRealAct && i === 0 ? 'act' : 'todo',
          planned: true,
          date: jDate10(b.dateLabel || b.date || b.startAt),
          title: b.title || b.serviceName || 'behandling',
          key: jSeriesKey(b.title || b.serviceName),
        };
      });
    var jAll = jItems.concat(jPlanned);
    // Serie-numrering: gruppera per behandlingsnyckel, numrera kronologiskt X/N
    var jByKey = {};
    jAll.forEach(function (it) {
      if (it.key) (jByKey[it.key] = jByKey[it.key] || []).push(it);
    });
    Object.keys(jByKey).forEach(function (k) {
      var arr = jByKey[k].slice().sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      });
      if (arr.length > 1)
        arr.forEach(function (it, i) {
          it.serie = k + '-journal ' + (i + 1) + '/' + arr.length;
        });
    });
    // Rendera kronologiskt (daterat först, odaterat sist)
    jAll.sort(function (a, b) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return String(a.date).localeCompare(String(b.date));
    });
    jItems.forEach(function (it) {
      var raw = null;
      for (var ji = 0; ji < jrs.length; ji++) {
        if ((jrs[ji].entryId || jrs[ji].id) === it.entryId) {
          raw = jrs[ji];
          break;
        }
      }
      it.viewUrl = resolveJournalItemViewUrl(it, raw, driveFiles);
    });
    var jDone = 0,
      jAct = 0,
      jTodo = 0;
    jAll.forEach(function (it) {
      if (it.planned) {
        jTodo++;
        return;
      }
      if (it.st === 'done') jDone++;
      else if (it.st === 'act') jAct++;
      else jTodo++;
    });
    var jHtml = buildJournalDocRows(jItems, jrs, driveFiles, jPlanned);
    var jCount = jAll.length
      ? '<span style="color:#4a8268">' +
        jDone +
        '</span>·<span style="color:#c8821e">' +
        jAct +
        '</span>·<span style="color:#94897b">' +
        jTodo +
        '</span>'
      : '0';
    h += sec(
      'Journaler · personal',
      jCount,
      jHtml ? '<div class="gk-med-forms">' + jHtml + '</div>' : empty('Inga journaler ännu.')
    );

    if (offers.length) {
      // Färgkodad typ-pill: TP/transplant guld, PRP grön, övrigt neutral
      function offPill(t) {
        var x = String(t || '').toLowerCase();
        if (/prp/.test(x))
          return 'background:linear-gradient(180deg,#e3f1e8,#cfe7d8);color:#2e7d52';
        if (/dhi|fue|tp|transplant|hår|har/.test(x))
          return 'background:linear-gradient(180deg,#f2e6cf,#e0caa0);color:#7a5a16';
        return 'background:rgba(215,202,194,0.4);color:#6b6052';
      }
      function offAmt(o) {
        var s = String(o.amount != null ? o.amount : o.amountLabel || o.detail || '');
        var m = s.replace(/\s/g, '').match(/(\d{3,})/);
        return m ? parseInt(m[1], 10) : 0;
      }
      function offOk(o) {
        return /godk|signed|accepted/i.test(o.status || '');
      }
      var approvedSum = offers.filter(offOk).reduce(function (n, o) {
        return n + offAmt(o);
      }, 0);
      var offTotal =
        approvedSum > 0
          ? '<span style="color:#2e7d52">' + approvedSum.toLocaleString('sv-SE') + ' kr</span>'
          : String(offers.length);
      h += sec(
        'Offerter · commit',
        offTotal,
        offers
          .map(function (o) {
            var ok = offOk(o);
            var detalj = String(o.detail || o.amountLabel || '')
              .replace(/\bgrafts\b/gi, 'graft')
              .replace(/\bsessions\b/gi, 'sessioner')
              .replace(/\bsession\b/gi, 'session');
            var godkAt = o.acceptedAt || o.approvedAt || o.signedAt || o.decidedAt || o.date || '';
            var meta = [
              detalj,
              o.step ? 'Steg ' + o.step : '',
              ok && godkAt ? 'godkänd ' + String(godkAt).slice(0, 10) : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              '<div class="row"><span class="pill" style="margin:0;' +
              offPill(o.type) +
              '">' +
              esc(o.type || 'TP') +
              '</span><div style="flex:1"><div class="rt">' +
              esc(o.title || 'Offert') +
              '</div>' +
              '<div class="rm">' +
              esc(meta) +
              '</div></div><span class="pill ' +
              (ok ? 'p-ok' : 'p-warn') +
              '">' +
              esc(ok ? '✓ Godkänd' : 'Väntar') +
              '</span>' +
              (ok
                ? '<button type="button" class="openb" data-kk-open-storvy="betalning" title="Gå vidare till betalning">Betalning →</button>'
                : '<button type="button" class="kk-sig-act" data-kk-sig="customer.missing_treatment_plan" ' +
                  'data-kk-sig-label="Påminn om offert" title="Påminn/skicka">→</button>') +
              '</div>'
            );
          })
          .join('')
      );
    } else {
      h += sec('Offerter · commit', '0', empty('Inga offerter i patient-case/dossier ännu.'));
    }

    h += buildReferensRegistryDocsSection(docsPayload);

    if (autoDocs.length) {
      h += sec(
        'Auto-dokument',
        String(autoDocs.length),
        autoDocs
          .map(function (d) {
            var step = d.journeyStep != null ? d.journeyStep : d.step;
            var done =
              d.planned === false ||
              /sent|deliver|levererat|signed|skickad|klar/i.test(String(d.status || ''));
            var dt = String(d.signedAt || d.sentAt || d.deliveredAt || d.date || '').slice(0, 10);
            var meta = [step != null && step !== '' ? 'Steg ' + step : '', dt]
              .filter(Boolean)
              .join(' · ');
            var previewAttrs = referensAutoDocPreviewAttrs(d);
            var statusHtml = done
              ? '<span style="font-size:10px;font-weight:800;color:#4a8268">✓ levererat</span>'
              : '<span style="font-size:10px;font-weight:800;color:#94897b">' +
                esc(d.statusLabel || 'Planerad') +
                '</span>';
            return (
              '<div class="row' +
              (previewAttrs ? ' kk-auto-doc-preview-row' : '') +
              '"' +
              previewAttrs +
              '><div style="flex:1"><div class="rt">' +
              esc(d.title) +
              '</div><div class="rm">' +
              esc(meta) +
              '</div></div>' +
              (previewAttrs
                ? '<span class="kk-auto-doc-preview-label" aria-hidden="true">Visa mall</span>'
                : '') +
              statusHtml +
              '</div>'
            );
          })
          .join('')
      );
    }

    h += '<div class="gthread"></div>';

    var fotoMediaRows = A(driveFiles)
      .filter(isReferensMediaFile)
      .map(gkSharedMediaFromFile)
      .sort(gkSharedPhotoSortNewest);
    if (fotoMediaRows.length) {
      var offerReadyRows = fotoMediaRows.filter(function (p) {
        return p.offerReady;
      });
      var fotoRows =
        '<div class="gk-visit-photos">' +
        '<div class="gk-offer-ready-photos"><div class="gk-visit-label">Markerade bilder för offert</div>' +
        (offerReadyRows.length
          ? '<div class="gk-sub gk-order-note">Ritade/markerade versioner som kan skickas med i offert eller behandlingsplan.</div>' +
            gkSharedPhotoGrid(offerReadyRows, 'gk-foto-grid--offer-ready')
          : '<div class="gk-offer-ready-empty">Inga markerade offertbilder ännu. Öppna en bild, rita och välj “behandlingsplan/offert”.</div>') +
        '</div></div>';
      h += sec(
        'Foto',
        offerReadyRows.length ? offerReadyRows.length + ' offertklara' : '0 offertbilder',
        fotoRows
      );
    } else if (photos.length) {
      h += sec('Foto', '0 offertbilder', empty('Inga markerade offertbilder ännu.'));
    } else {
      h += sec('Foto', '0 offertbilder', empty('Inga markerade offertbilder ännu.'));
    }

    var krVal =
      Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0
        ? Number(ltvRaw).toLocaleString('sv-SE') + ' kr'
        : null;
    var fnxId = bcard.fortnoxCustomerId;
    var fnxSynced = bcard.fortnoxSyncedAt;
    if (krVal || ltvLabel || fnxId) {
      function ekoRow(l, v, sub) {
        return (
          '<div class="kk-eko"><div class="kk-eko-l"><div class="kk-eko-k">' +
          esc(l) +
          '</div>' +
          (sub ? '<div class="kk-eko-sub">' + esc(sub) + '</div>' : '') +
          '</div><div class="kk-eko-v">' +
          esc(v) +
          '</div></div>'
        );
      }
      var ekoRows = '';
      if (krVal) ekoRows += ekoRow('Livstidsvärde', krVal, 'Summa vunna affärer · Pipedrive');
      if (ltvLabel && ltvLabel !== krVal) ekoRows += ekoRow('Vunna affärer', ltvLabel, '');
      if (fnxId)
        ekoRows += ekoRow(
          'Fortnox',
          'Kund ' + fnxId,
          fnxSynced ? 'Synkad ' + String(fnxSynced).slice(0, 10) : 'Kopplad'
        );
      h += sec(
        'Ekonomi',
        krVal || (fnxId ? 'Fortnox' : '—'),
        ekoRows || empty('Ingen ekonomidata ännu.')
      );
    }

    // ===== Betalning: committad offert följer med + status + betalvägar (historik = backend nästa) =====
    (function renderBetalning() {
      var cc = commercialCase || {};
      var ps = String(cc.paymentStatus || '').toLowerCase();
      // committade (godkända) offerter = det betalningen gäller
      var paid = offers.filter(function (o) {
        return /godk|signed|accepted/i.test(o.status || '');
      });
      var payHist = A(bundle.paymentHistory);
      var payMeta = bundle.paymentHistoryMeta || {};
      // visa bara sektionen om det finns något ekonomiskt att betala/visa
      if (!paid.length && !ps && !cc.quotedAmount && !payHist.length) return;
      var statusMap = {
        paid: ['Betald', '#2e7d52', '#e7f3ec'],
        ready_for_booking: ['Klar för bokning', '#2e7d52', '#e7f3ec'],
        partially_paid: ['Delbetald', '#c8821e', '#faf0db'],
        payment_pending: ['Väntar betalning', '#c8821e', '#faf0db'],
        pending: ['Väntar betalning', '#c8821e', '#faf0db'],
        pending_customer: ['Väntar på kund', '#c8821e', '#faf0db'],
        deposit_pending: ['Deposition väntar', '#c8821e', '#faf0db'],
        blocked: ['Blockerad', '#b94a4a', '#f6e3e3'],
      };
      var stt = statusMap[ps] || ['Ingen betalning startad', '#94897b', 'rgba(215,202,194,0.35)'];
      var inner = '';
      // 1) Att betala — offerten/erna följer automatiskt med
      inner += paid.length
        ? paid
            .map(function (o) {
              var d = String(o.detail || o.amountLabel || '')
                .replace(/\bgrafts\b/gi, 'graft')
                .replace(/\bsessions\b/gi, 'sessioner');
              return (
                '<div class="kk-eko"><div class="kk-eko-l"><div class="kk-eko-k">Offert · ' +
                esc(o.type || 'TP') +
                '</div><div class="kk-eko-sub">' +
                esc(d) +
                '</div></div></div>'
              );
            })
            .join('')
        : '<div class="kk-eko"><div class="kk-eko-l"><div class="kk-eko-k">Offererat belopp</div></div><div class="kk-eko-v">' +
          esc(cc.quotedAmount || '—') +
          '</div></div>';
      // 2) Status-rad
      inner +=
        '<div class="kk-eko"><div class="kk-eko-l"><div class="kk-eko-k">Status</div>' +
        (cc.depositAmount
          ? '<div class="kk-eko-sub">Deposition: ' + esc(cc.depositAmount) + '</div>'
          : '') +
        '</div><span class="pill" style="background:' +
        stt[2] +
        ';color:' +
        stt[1] +
        '">' +
        esc(stt[0]) +
        '</span></div>';
      // 3) Betalvägar — era erbjudna alternativ (förbered → människa bekräftar, aldrig auto-pengar)
      var vagar = [
        ['swish', 'Swish', 'Direktbetalning'],
        ['mf', 'Medical Finance', 'Delbetalning / finansiering'],
        ['kort', 'Kort · betalningslänk', 'Stripe/kortlänk'],
        ['faktura', 'Faktura', 'Fortnox'],
      ];
      var betPid = bcard.patientId || bcard.id || '';
      var betAmt = String(cc.quotedAmount || '').replace(/[^\d]/g, '');
      var betPhone = phone || '';
      var betCid = (commercialCase && (commercialCase.commercialCaseId || commercialCase.id)) || '';
      inner +=
        '<div class="kk-betvag-h">Betalvägar</div>' +
        vagar
          .map(function (v) {
            return (
              '<div class="kk-betvag"><div style="flex:1"><div class="rt">' +
              esc(v[1]) +
              '</div><div class="rm">' +
              esc(v[2]) +
              '</div></div><button type="button" class="openb kk-betvag-btn" data-kk-betvag="' +
              v[0] +
              '" data-kk-pid="' +
              esc(betPid) +
              '" data-kk-amount="' +
              esc(betAmt) +
              '" data-kk-phone="' +
              esc(betPhone) +
              '" data-kk-cid="' +
              esc(betCid) +
              '">Förbered →</button></div>'
            );
          })
          .join('');
      // 4) Betalningshistorik (Swish + Fortnox, ORD-35)
      inner += '<div class="kk-betvag-h">Betalningshistorik</div>';
      if (payHist.length) {
        inner += payHist
          .slice(0, 8)
          .map(function (ph) {
            var dt = String(ph.dateIso || ph.date || ph.paidAt || '').slice(0, 10);
            var metod = ph.method || ph.source || '';
            var belopp = ph.amountLabel || ph.amount || '';
            var st2 = ph.status || '';
            return (
              '<div class="kk-eko"><div class="kk-eko-l"><div class="kk-eko-k">' +
              esc([metod, st2].filter(Boolean).join(' · ') || 'Betalning') +
              '</div>' +
              (dt ? '<div class="kk-eko-sub">' + esc(dt) + '</div>' : '') +
              '</div><div class="kk-eko-v">' +
              esc(belopp || '—') +
              '</div></div>'
            );
          })
          .join('');
      } else {
        var note =
          A(payMeta.notes).indexOf('fortnox_customer_missing') >= 0
            ? 'Ingen Fortnox-kund kopplad ännu.'
            : 'Ingen betalningshistorik ännu.';
        inner += '<div class="empty">' + esc(note) + '</div>';
      }
      h += sec('Betalning', '<span style="color:' + stt[1] + '">' + esc(stt[0]) + '</span>', inner);
    })();

    // ===== Besök · tidslinje: gruppera filer/foton/journaler per BESÖKSDATUM (ej importstämpel) =====
    (function renderBesok() {
      function dateKey(f) {
        var direct = String(gkSharedDateOfFile(f) || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
        var oc = f && f.occasionContext;
        if (oc && oc.timelineKey && /^\d{4}-\d{2}-\d{2}$/.test(oc.timelineKey))
          return oc.timelineKey;
        var s = String((f && (f.fileName || f.relativePath)) || '');
        var m = s.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
        if (m) return m[1] + '-' + m[2] + '-' + m[3];
        var ep = s.match(/\b(1[0-9]{9})\b/);
        if (ep) {
          var d = new Date(Number(ep[1]) * 1000);
          if (!isNaN(d)) return d.toISOString().slice(0, 10);
        }
        return '';
      }
      function svDate(key) {
        var mo = [
          'jan',
          'feb',
          'mars',
          'apr',
          'maj',
          'juni',
          'juli',
          'aug',
          'sep',
          'okt',
          'nov',
          'dec',
        ];
        var p = key.split('-');
        return p.length === 3 ? Number(p[2]) + ' ' + mo[Number(p[1]) - 1] + ' ' + p[0] : key;
      }
      function cleanName(f) {
        var n = String((f && f.fileName) || '');
        if (/\?\?\?|\+\?|�/.test(n)) {
          var ft = f.fileType || '';
          return ft === 'journal_pdf'
            ? 'Journal'
            : ft === 'image'
              ? 'Foto'
              : /friskf/i.test(n)
                ? 'Friskförsäkran'
                : 'Dokument';
        }
        return n.replace(/\.(pdf|jpe?g|png|heic|webp|docx?)$/i, '');
      }
      function ico(f) {
        var ft = f.fileType || '';
        return ft === 'image'
          ? '🖼'
          : ft === 'journal_pdf'
            ? '📄'
            : /friskf/i.test(String(f.fileName || ''))
              ? '📋'
              : '📎';
      }
      // Besökets behandlingstyp + session ur mappnamnet (PRP 3 / OP / DHI ...) — ORD-41.
      function visitTypeLabel(g) {
        var TYPE_RE = /\b(PRP|DHI|FUE|OP|Microneedling|Konsultation)\b\s*(\d+)?/i;
        for (var i = 0; i < g.files.length; i++) {
          var rp = String((g.files[i] && (g.files[i].relativePath || g.files[i].fileName)) || '');
          var segs = rp.split('/').filter(Boolean);
          var folder = segs.length >= 2 ? segs[segs.length - 2] : segs[0] || '';
          var m = folder.match(TYPE_RE);
          if (m) {
            var typ = m[1].length <= 3 ? m[1].toUpperCase() : m[1];
            return typ + (m[2] ? ' ' + m[2] : '');
          }
        }
        // fallback: journalens behandlingstyp (ORD-36) eller typ ur journal-titeln (ej session — numreringen skiljer)
        for (var k = 0; k < g.journals.length; k++) {
          var gj = g.journals[k];
          var jm = String((gj && (gj.key || gj.title)) || '').match(TYPE_RE);
          if (jm) return jm[1].length <= 3 ? jm[1].toUpperCase() : jm[1];
        }
        return '';
      }
      // encounter-bindning (klient, säker): slå ihop besök inom ±2 dgr in i närmaste TYPADE
      // folder-besök, så friskförsäkran/journal "dagen efter" hamnar på operationsbesöket.
      // Slår ALDRIG ihop två typade ankare (skyddar mot felmerge av skilda besök).
      function dDiff(a, b) {
        var da = new Date(a),
          db = new Date(b);
        return isNaN(da) || isNaN(db) ? 999 : Math.abs((da - db) / 86400000);
      }
      var groups = {};
      A(driveFiles).forEach(function (f) {
        if (gkIsAnnotatedFile(f)) return;
        var k = dateKey(f) || 'odaterat';
        if (!groups[k]) groups[k] = { files: [], j: 0, img: 0, journals: [], sortKey: '' };
        groups[k].files.push(f);
        var fSortKey = gkSharedSortKeyOfFile(f);
        if (fSortKey && fSortKey > groups[k].sortKey) groups[k].sortKey = fSortKey;
        if (f.fileType === 'journal_pdf') groups[k].j++;
        if (f.fileType === 'image') groups[k].img++;
      });
      // Återanvänd de redan beräknade journal-raderna (jItems): rätt datum (journalDateReal/epoch),
      // signeringsstate (✓/!), serie X/N och behandlare — samma upplägg som "Journaler · personal".
      A(jItems).forEach(function (it) {
        var dt = String((it && it.date) || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
          if (!groups[dt]) groups[dt] = { files: [], j: 0, img: 0, journals: [], sortKey: '' };
          groups[dt].journals.push(it);
          var jSortKey = gkSharedNormalizeDateTime(it.date || it.occurredAt || it.startAt || '');
          if (jSortKey && jSortKey > groups[dt].sortKey) groups[dt].sortKey = jSortKey;
        }
      });
      (function mergeNearbyIntoTypedAnchors() {
        var dKeys = Object.keys(groups).filter(function (k) {
          return k !== 'odaterat';
        });
        var anchors = dKeys.filter(function (k) {
          return visitTypeLabel(groups[k]);
        });
        dKeys.forEach(function (k) {
          if (!groups[k] || visitTypeLabel(groups[k])) return;
          var near = null;
          var best = 3;
          anchors.forEach(function (a) {
            var d = dDiff(a, k);
            if (d <= 2 && d < best) {
              best = d;
              near = a;
            }
          });
          if (near && groups[near]) {
            groups[near].files = groups[near].files.concat(groups[k].files);
            groups[near].journals = groups[near].journals.concat(groups[k].journals);
            groups[near].j += groups[k].j;
            groups[near].img += groups[k].img;
            if (groups[k].sortKey && groups[k].sortKey > groups[near].sortKey) {
              groups[near].sortKey = groups[k].sortKey;
            }
            delete groups[k];
          }
        });
      })();
      var keys = Object.keys(groups).sort(function (a, b) {
        if (a === 'odaterat') return 1;
        if (b === 'odaterat') return -1;
        var ga = groups[a] || {};
        var gb = groups[b] || {};
        var ak = ga.sortKey || a + 'T00:00:00';
        var bk = gb.sortKey || b + 'T00:00:00';
        return String(bk).localeCompare(String(ak));
      });
      if (!keys.length) return;
      var inner = keys
        .map(function (k) {
          var g = groups[k];
          var jtot = g.j + g.journals.length;
          var parts = [];
          if (jtot) parts.push(jtot + (jtot === 1 ? ' journal' : ' journaler'));
          if (g.img) parts.push(g.img + (g.img === 1 ? ' foto' : ' foton'));
          var others = g.files.length - g.j - g.img;
          if (others > 0) parts.push(others + ' dokument');
          var vt = visitTypeLabel(g);
          var label = (k === 'odaterat' ? 'Odaterat' : svDate(k)) + (vt ? ' · ' + vt : '');
          var jrows = g.journals
            .map(function (it) {
              var titel = it.serie || it.title || 'Journal';
              var metaParts = [];
              if (it.viewUrl) metaParts.push('Signerad');
              if (it.step) metaParts.push('Steg ' + it.step);
              if (it.date) metaParts.push(it.date);
              if (it.by) metaParts.push(it.by);
              return buildDocViewRow(
                titel,
                it.viewUrl ? metaParts.join(' · ') : 'Saknas',
                it.viewUrl || '',
                'journal_' + (it.entryId || titel)
              );
            })
            .join('');
          var visitMediaRows = g.files
            .filter(gkIsOriginalVisitMediaFile)
            .map(gkSharedMediaFromFile)
            .sort(gkSharedPhotoSortNewest);
          var visitCollapsed = visitMediaRows.length > 12;
          var mediaRows = visitMediaRows.length
            ? '<div class="gk-visit-photos"><div class="gk-visit-label">Bilder och film</div>' +
              gkSharedPhotoGrid(
                visitMediaRows,
                'gk-foto-grid--journal' + (visitCollapsed ? ' is-collapsed' : '')
              ) +
              (visitCollapsed
                ? '<button type="button" class="gk-btn gk-visit-media-toggle" data-gk-toggle-visit-media>Visa alla ' +
                  visitMediaRows.length +
                  '</button>'
                : '') +
              '</div>'
            : '';
          var rows = g.files
            .filter(isReferensDocumentFile)
            .filter(function (f) {
              return !looksLikeReferensMediaLabel(referensFileLabel(f, cleanName(f)));
            })
            .map(function (f) {
              var url = referensFileViewUrl(f);
              var title = referensFileLabel(f, cleanName(f));
              if (url) {
                var d = String(f.documentDate || f.visitDate || '').slice(0, 10);
                return buildDocViewRow(
                  title,
                  d ? 'Signerad · ' + d : 'Signerad',
                  url,
                  'besok_file_' + (f.id || f.assetId || title)
                );
              }
              return buildDocViewRow(title, 'Saknas', '', 'besok_file_' + title);
            })
            .join('');
          return (
            '<details class="kk-besok"><summary><span class="kk-besok-d">' +
            esc(label) +
            '</span><span class="kk-besok-m">' +
            esc(parts.join(' · ') || g.files.length + ' filer') +
            '</span></summary><div class="kk-besok-body">' +
            jrows +
            mediaRows +
            rows +
            '</div></details>'
          );
        })
        .join('');
      h += sec(
        'Besök',
        String(
          keys.filter(function (k) {
            return k !== 'odaterat';
          }).length
        ),
        inner
      );
    })();

    // ===== Saknade kategorier (facit-paritet): Filer · Anteckningar · Kommunikation · Insikter =====
    var filer = driveFiles
      .filter(isReferensDocumentFile)
      .filter(function (f) {
        return !looksLikeReferensMediaLabel(referensFileLabel(f, cleanName(f)));
      })
      .filter(function (f) {
        return !gkIsAnnotatedFile(f) && !gkIsOfferReadyFile(f) && !isReferensMediaFile(f);
      });
    var filePreviewRows = filer.slice(0, 10);
    var fileCount = filer.length;
    function fileIco(name) {
      var n = String(name || '').toLowerCase();
      if (/\.(jpe?g|png|heic|webp|gif)$/.test(n)) return '🖼';
      if (/\.pdf$/.test(n)) return '📄';
      if (/\.(docx?|rtf|odt)$/.test(n)) return '📝';
      if (/\.(xlsx?|csv)$/.test(n)) return '📊';
      if (/\.(zip|rar|7z)$/.test(n)) return '🗜';
      return '📎';
    }
    h += sec(
      'Filer',
      String(fileCount),
      filePreviewRows.length
        ? filePreviewRows
            .map(function (f) {
              var fnamn = referensFileLabel(f, f.name || f.fileName || f.title || 'Fil');
              var url = referensFileViewUrl(f);
              var typ = f.fileType || f.category || '';
              var meta = url ? ['Signerad', typ].filter(Boolean).join(' · ') : typ || 'Saknas';
              return buildDocViewRow(fnamn, meta, url, 'file_' + (f.id || f.assetId || fnamn));
            })
            .join('')
        : empty('Inga filer kopplade ännu.')
    );
    var notes = A(journalEntries).filter(function (e) {
      return /note|anteck|privat/i.test(String((e && (e.type || e.journalType)) || ''));
    });
    h += sec(
      'Anteckningar',
      String(notes.length),
      notes.length
        ? notes
            .slice(0, 6)
            .map(function (n) {
              return (
                '<div class="qrow"><div><div class="q">' +
                esc(String(n.text || n.summary || n.note || '').slice(0, 140)) +
                '</div>' +
                (n.author || n.by ? '<div class="qv">' + esc(n.author || n.by) + '</div>' : '') +
                '</div></div>'
              );
            })
            .join('')
        : empty('Inga anteckningar ännu.')
    );
    var komm = A(bundle.communications).length
      ? A(bundle.communications)
      : A(ctxExtras.communications);
    h += sec(
      'Kommunikation',
      String(komm.length),
      komm.length
        ? komm
            .slice(0, 6)
            .map(function (c) {
              var ch = String(c.channel || c.type || 'mail').toLowerCase();
              var kanal =
                ch.indexOf('sms') >= 0
                  ? 'sms'
                  : ch.indexOf('call') >= 0 || ch.indexOf('samtal') >= 0
                    ? 'call'
                    : 'mail';
              var kanalNamn = kanal === 'sms' ? 'SMS' : kanal === 'call' ? 'Samtal' : 'E-post';
              var ut = /out|utg|sent|skickad/i.test(String(c.direction || c.dir || ''));
              var riktning = ut ? 'Skickat' : 'Inkommande';
              var nar = c.when || c.at || c.date || '';
              var viewUrl =
                c.viewUrl ||
                referensAttachmentViewUrl(c.attachment) ||
                referensAttachmentViewUrl(A(c.attachments)[0]) ||
                '';
              var titel = c.subject || c.title || kanalNamn;
              if (viewUrl) {
                return buildDocViewRow(
                  titel,
                  [kanalNamn, riktning, nar].filter(Boolean).join(' · '),
                  viewUrl,
                  'comm_' + (c.id || nar || titel)
                );
              }
              var preview = String(c.preview || c.body || c.text || c.subject || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80);
              var ikon = kanal === 'sms' ? '💬' : kanal === 'call' ? '📞' : '✉';
              return (
                '<div class="kk-comm kk-comm--' +
                kanal +
                '"><span class="kk-comm-ico">' +
                ikon +
                '</span><div style="flex:1;min-width:0"><div class="rt">' +
                esc(titel) +
                '</div><div class="rm">' +
                esc([kanalNamn, riktning, nar].filter(Boolean).join(' · ')) +
                '</div>' +
                (c.subject && preview
                  ? '<div class="kk-comm-prev">' + esc(preview) + '</div>'
                  : '') +
                '</div></div>'
              );
            })
            .join('')
        : empty('Ingen kommunikation loggad ännu.')
    );
    h += sec(
      'Insikter',
      String(oppSignals.length),
      oppSignals.length
        ? oppSignals
            .map(function (s) {
              var sig = esc(s.ruleId || s.id || '');
              var lbl = esc(s.label || s.title || s.text || 'Insikt');
              return (
                '<div class="row acc info"><div style="flex:1"><div class="rt">' +
                lbl +
                '</div>' +
                (s.detail ? '<div class="rm">' + esc(s.detail) + '</div>' : '') +
                '</div>' +
                '<span class="pill" style="background:var(--ok-bg,#e7f3ec);color:var(--ok,#2e7d52)">Möjlighet</span>' +
                '<button type="button" class="kk-sig-act" data-kk-sig="' +
                sig +
                '" data-kk-sig-label="' +
                lbl +
                '" title="Agera">→</button>' +
                '</div>'
              );
            })
            .join('')
        : empty('Inga möjligheter just nu.')
    );

    h +=
      '<div class="acts"><div class="btn dark">📷 Ta bild · spara i journal</div>' +
      '<div class="btn gold">Boka nästa</div>' +
      '<div class="r2"><div class="btn">✎ Anteckna</div><div class="btn">✉ Svarstudio</div></div>' +
      '<div class="btn green">✓ Bekräfta kommande tider' +
      (up.length ? ' (' + up.length + ')' : '') +
      '</div></div>';

    h += '</div></div>';

    // Cacha gemensamma kortet (förstoringen renderar det istället för dossier-klon)
    try {
      var gkCtx = {
        patientId: bcard.patientId || bcard.id || '',
        name: name,
        phone: phone,
        email: email,
        isVip: !!(bcard.vip || (bcard.tags && bcard.tags.vip)),
        cur: cur,
        total: total,
        nextLabel: nextLabel,
        steps: steps,
        offers: offers,
        jItems: jItems,
        up: up,
        hist: hist,
        gateSignals: gateSignals,
        driveFiles: driveFiles,
        autoDocs: autoDocs,
        bundle: bundle,
        bcard: bcard,
        commercialCase: commercialCase,
        ltv: Number.isFinite(Number(ltvRaw)) && Number(ltvRaw) > 0 ? Number(ltvRaw) : '',
        ltvLabel: ltvLabel || '',
      };
      window.__GK_CONTEXTS = window.__GK_CONTEXTS || {};
      if (gkCtx.patientId) window.__GK_CONTEXTS[gkCtx.patientId] = gkCtx;
      window.__GK_LAST = gkBuild(gkCtx);
      gkHydrateDriveFiles(gkCtx);
    } catch (e) {
      window.__GK_LAST = '';
    }

    // (a) Primär öppning: visa gemensamma kortet direkt när en NY kund öppnas (en gång per patient)
    try {
      var gkPid = (bcard && (bcard.patientId || bcard.id)) || '';
      if (window.__GK_PRIMARY !== false && gkPid && window.__GK_LAST) {
        var gkOv = document.getElementById('kk-storvy');
        var gkOpen = gkOv && gkOv.classList.contains('open');
        if (window.__GK_OPENED_FOR !== gkPid) {
          window.__GK_OPENED_FOR = gkPid;
          setTimeout(function () {
            if (window.__kkOpenStorvy) window.__kkOpenStorvy();
          }, 40);
        } else if (gkOpen) {
          var gkBody = gkOv.querySelector('.kk-storvy-body');
          if (gkBody) gkBody.innerHTML = window.__GK_LAST;
        }
      }
    } catch (e2) {
      /* ignore */
    }

    return orderDossierHtml(h);
  };

  function bookingRow(b, isHist, opts) {
    opts = opts || {};
    var esc2 = esc;
    var d = String(b.date || b.occurredAt || b.startAt || '').match(/(\d{1,2})\D+(\d{1,2})/);
    var months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAJ',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OKT',
      'NOV',
      'DEC',
    ];
    var day = d ? d[1] : '',
      mon = d ? months[(parseInt(d[2], 10) || 1) - 1] : '';
    var ready = /redo|klar|done|ready/i.test(b.status || '');
    var pillCls = ready ? 'p-ok' : 'p-warn';
    var pillTxt = b.status || 'Bokad';
    if (!isHist && opts.needsFrisk) {
      pillCls = 'p-warn';
      pillTxt = '⚠ Friskförs.';
    }
    return (
      '<div class="row acc kk-rowlink ' +
      (isHist ? 'grey' : 'teal') +
      '" data-kk-open-storvy="' +
      (isHist ? 'historik' : 'bokningar') +
      '">' +
      '<div class="bd"><div class="d">' +
      esc2(day) +
      '</div><div class="m">' +
      esc2(mon) +
      '</div></div>' +
      '<div style="flex:1"><div class="rt">' +
      esc2(b.title || b.serviceName || 'Bokning') +
      '</div><div class="rm">' +
      esc2(
        [b.time || b.startTime, b.duration, b.staff || b.resourceLabel].filter(Boolean).join(' · ')
      ) +
      '</div></div>' +
      '<span class="pill ' +
      pillCls +
      '">' +
      esc2(pillTxt) +
      '</span></div>'
    );
  }

  /* ===== Gemensamt kundkort: sticky header + sektions-chips (fas 1) ===== */
  var KK_NAV = [
    ['kundresa', 'Kundresa'],
    ['nastasteg', 'Nästa steg'],
    ['opdag', 'Op-dag'],
    ['halso', 'Medicinskt'],
    ['besok', 'Besök'],
    ['bokningar', 'Bokningar'],
    ['journal', 'Journal'],
    ['foto', 'Foto'],
    ['historik', 'Historik'],
    ['offert', 'Offert'],
    ['ekonomi', 'Ekonomi'],
    ['dokument', 'Dokument'],
    ['auto', 'Auto'],
    ['tabild', 'Ta bild'],
  ];
  // ===== Smart nästa steg: åtgärds-utkast per signal (granska & skicka, ej autoskick) =====
  (function bindSignalActionsOnce() {
    if (window.__kkSigBound) return;
    window.__kkSigBound = true;
    function fnamn() {
      var dn = document.querySelector('.kkref .doss .dn');
      if (dn) {
        var n = String(dn.textContent || '').trim();
        if (n) return n.split(' ')[0];
      }
      var gkName = document.querySelector('[data-gk-card-name], .gk-h1, .gk-name');
      if (gkName) {
        var gn = String(gkName.textContent || '').trim();
        if (gn) return gn.split(' ')[0];
      }
      return 'där';
    }
    function resolveKkSigPatientId(btn, modalEl) {
      if (modalEl && modalEl.dataset && modalEl.dataset.patientId) {
        return String(modalEl.dataset.patientId).trim();
      }
      if (btn && btn.getAttribute) {
        var fromBtn = btn.getAttribute('data-kk-patient-id');
        if (fromBtn) return String(fromBtn).trim();
      }
      var nodes = [
        document.querySelector('[data-gk-patient-id]'),
        document.querySelector('.kk-attend[data-patient-id]'),
        document.querySelector('.kkref .kk-attend[data-patient-id]'),
      ];
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue;
        var id =
          nodes[i].getAttribute('data-gk-patient-id') ||
          nodes[i].getAttribute('data-patient-id') ||
          '';
        if (id) return String(id).trim();
      }
      return '';
    }
    function kkSigAuthHeaders() {
      var token = '';
      try {
        token = (
          window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          ''
        ).trim();
      } catch (er) {
        /* ignore */
      }
      var hdrs = { 'Content-Type': 'application/json' };
      if (token && token !== '__preview_local__') hdrs.Authorization = 'Bearer ' + token;
      return hdrs;
    }
    function kkSigFetchJson(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: kkSigAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(body || {}),
      }).then(function (r) {
        return r.json().then(function (j) {
          return { status: r.status, j: j };
        });
      });
    }
    function utkastFor(sig, label, namn) {
      var s = String(sig || '').toLowerCase();
      var l = String(label || '').toLowerCase();
      if (s.indexOf('operation_day') >= 0 || l.indexOf('friskförs') >= 0)
        return {
          rubrik: 'Skicka friskförsäkran',
          kund: true,
          link: '/friskforsakran.html',
          text:
            'Hej ' +
            namn +
            '! Inför din operation behöver vi din friskförsäkran ifylld. Öppna och signera här: [länk]. Den slutförs på operationsdagen. / Hair TP Clinic',
        };
      if (s.indexOf('photo_consent') >= 0 || l.indexOf('foto') >= 0)
        return {
          rubrik: 'Begär foto-samtycke',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Vi vill gärna ta före/efter-bilder (hårlinje/krona — aldrig ansikte) för att följa ditt resultat. Godkänn här: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('health_declaration') >= 0 || l.indexOf('hälsodek') >= 0)
        return {
          rubrik: 'Skicka hälsodeklaration',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Inför ditt besök behöver vi din hälsodeklaration. Fyll i här (2 min): [länk]. / Hair TP Clinic',
        };
      if (
        s.indexOf('treatment_plan') >= 0 ||
        l.indexOf('offert') >= 0 ||
        l.indexOf('behandlingsplan') >= 0
      )
        return {
          rubrik: 'Skicka behandlingsplan/offert',
          kund: true,
          sendEndpoint: '/api/v1/cco-commercial/offer-send-for-sign',
          sendLabel: 'Skicka offert för signering',
          urlKey: 'offerSignUrl',
          text:
            'Hej ' +
            namn +
            '! Här är din behandlingsplan. Du kan läsa och svara här: [länk]. Hör av dig om du har frågor! / Hair TP Clinic',
        };
      if (s.indexOf('cooling_off') >= 0 || l.indexOf('avtal') >= 0 || l.indexOf('samtycke') >= 0)
        return {
          rubrik: 'Påminn om avtal + samtycke',
          kund: true,
          sendEndpoint: '/api/v1/cco-treatment-agreement/send-for-sign',
          previewEndpoint: '/api/v1/cco-treatment-agreement/send-for-sign/preview',
          fromOfferEndpoint: '/api/v1/cco-treatment-agreement/from-offer',
          templateApprovalEndpoint: '/api/v1/cco-treatment-agreement/template-version-approval',
          sendLabel: 'Aktivera signering (kund får länk)',
          previewLabel: 'Kontrollera gate (skickar inte)',
          urlKey: 'agreementSignUrl',
          text:
            'Hej ' +
            namn +
            '! Betänketiden har passerat — du kan nu signera avtal + samtycke här: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('journal') >= 0)
        return {
          rubrik: 'Journal saknas (intern åtgärd)',
          kund: false,
          text: 'Skapa och signera journal för besöket i journal-arbetsytan.',
        };
      if (
        s.indexOf('reengage') >= 0 ||
        l.indexOf('återbesök') >= 0 ||
        l.indexOf('kommande tid') >= 0
      )
        return {
          rubrik: 'Föreslå återbesök',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Det var ett tag sedan sist — vi har gärna kvar koll på ditt resultat. Vill du boka ett återbesök? Här är tider: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('ready_for_treatment') >= 0 || l.indexOf('redo') >= 0)
        return {
          rubrik: 'Boka operation',
          kund: true,
          text:
            'Hej ' +
            namn +
            '! Allt är klart inför din behandling. Ska vi boka in operationsdagen? Här är tider: [länk]. / Hair TP Clinic',
        };
      if (s.indexOf('photo_review') >= 0 || l.indexOf('granska') >= 0)
        return {
          rubrik: 'Granska före/efter-foton',
          kund: false,
          text: 'Granska kundens före/efter-bilder och uppdatera resultatuppföljningen.',
        };
      return {
        rubrik: label || 'Åtgärd',
        kund: false,
        text: 'Granska och åtgärda: ' + (label || sig),
      };
    }
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-kk-sig]');
      if (!btn) return;
      var pidOnOpen = resolveKkSigPatientId(btn);
      var u = utkastFor(
        btn.getAttribute('data-kk-sig'),
        btn.getAttribute('data-kk-sig-label'),
        fnamn()
      );
      // Byt [länk] mot riktig URL där en publik sida finns (t.ex. friskförsäkran)
      if (u.link && u.text.indexOf('[länk]') >= 0) {
        u.text = u.text.replace('[länk]', window.location.origin + u.link);
      }
      var ov = document.getElementById('kk-sigact');
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'kk-sigact';
      if (pidOnOpen) ov.dataset.patientId = pidOnOpen;
      ov.innerHTML =
        '<div class="kk-sigact-panel">' +
        '<div class="kk-sigact-h">' +
        esc(u.rubrik) +
        '</div>' +
        '<div class="kk-sigact-sub">' +
        (u.previewEndpoint
          ? 'Staff-läge — kontrollera gate utan att skicka till kund'
          : u.kund
            ? 'Färdigt utkast — granska och skicka till kunden'
            : 'Intern åtgärd') +
        '</div>' +
        '<div class="kk-sigact-draft">' +
        esc(u.text) +
        '</div>' +
        '<div class="kk-sigact-row">' +
        (u.kund
          ? '<button type="button" class="kk-btn" data-kk-sig-copy>Kopiera utkast</button>' +
            '<button type="button" class="kk-btn" data-kk-sig-studio>✉ Svarstudio</button>'
          : '') +
        (u.fromOfferEndpoint
          ? '<button type="button" class="kk-btn" data-kk-sig-from-offer>Skapa avtal från offert</button>'
          : '') +
        (u.previewEndpoint
          ? '<button type="button" class="kk-btn kk-btn-gold" data-kk-sig-preview>' +
            esc(u.previewLabel || 'Kontrollera gate') +
            '</button>'
          : '') +
        (u.sendEndpoint
          ? '<button type="button" class="kk-btn" data-kk-sig-send>' +
            esc(u.sendLabel || 'Skicka för signering') +
            '</button>'
          : '') +
        '<button type="button" class="kk-btn" data-kk-sig-close>Stäng</button>' +
        '</div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (ev) {
        if (ev.target === ov || ev.target.hasAttribute('data-kk-sig-close')) ov.remove();
        if (ev.target.hasAttribute('data-kk-sig-copy')) {
          if (navigator.clipboard) navigator.clipboard.writeText(u.text);
          ev.target.textContent = 'Kopierat ✓';
        }
        if (ev.target.hasAttribute('data-kk-sig-studio')) {
          if (navigator.clipboard) navigator.clipboard.writeText(u.text);
          ov.remove();
          var studio = document.querySelector('[data-studio-open]');
          if (studio) studio.click();
        }
        if (ev.target.hasAttribute('data-kk-sig-from-offer')) {
          var pidOffer = resolveKkSigPatientId(btn, ov);
          if (!pidOffer) {
            ev.target.textContent = 'Kund-ID saknas';
            return;
          }
          ev.target.textContent = 'Skapar…';
          kkSigFetchJson(u.fromOfferEndpoint, { patientId: pidOffer, deliveryMode: 'plats' })
            .then(function (res) {
              var draft = ov.querySelector('.kk-sigact-draft');
              if (res.status >= 200 && res.status < 300) {
                if (draft)
                  draft.innerHTML =
                    '<b>✓ Avtal skapat från offert.</b><br>Mall: ' +
                    esc(res.j.agreement?.templateId || '—') +
                    '@' +
                    esc(res.j.agreement?.templateVersion || '—') +
                    '<br>Nästa: klicka <b>Kontrollera gate</b>.';
                ev.target.textContent = 'Skapat ✓';
              } else {
                if (draft)
                  draft.innerHTML = '<b>Kunde inte skapa avtal:</b> ' + esc(res.j.error || 'fel');
                ev.target.textContent = 'Skapa avtal från offert';
              }
            })
            .catch(function () {
              ev.target.textContent = 'Nätfel — försök igen';
            });
        }
        if (ev.target.hasAttribute('data-kk-sig-preview')) {
          var pidPreview = resolveKkSigPatientId(btn, ov);
          if (!pidPreview) {
            ev.target.textContent = 'Kund-ID saknas';
            return;
          }
          ev.target.textContent = 'Kontrollerar…';
          kkSigFetchJson(u.previewEndpoint, { patientId: pidPreview })
            .then(function (res) {
              var draft = ov.querySelector('.kk-sigact-draft');
              var gate = res.j || {};
              if (gate.allowed) {
                if (draft)
                  draft.innerHTML =
                    '<b>✓ Gate OK — signering tillåten.</b><br>Mall ' +
                    esc(gate.templateId || '—') +
                    '@' +
                    esc(gate.templateVersion || '—') +
                    ' · bundle: ' +
                    esc(gate.bundleStatus || '—') +
                    '<br><span style="color:#94897b">Inget skickat till kunden.</span>';
                ev.target.textContent = 'Gate OK ✓';
              } else if (gate.needsLegalReview && u.templateApprovalEndpoint) {
                if (draft)
                  draft.innerHTML =
                    '<b>Gate spärrad — legal review saknas.</b><br>' +
                    esc(gate.error || '') +
                    '<br><button type="button" class="kk-btn kk-btn-gold" data-kk-sig-approve-template style="margin-top:8px">Godkänn mall-version (internt)</button>';
                ev.target.textContent = gate.previewLabel || 'Kontrollera gate';
              } else if (gate.needsFromOffer) {
                if (draft)
                  draft.innerHTML =
                    '<b>Gate spärrad — avtal saknas.</b><br>' +
                    esc(gate.error || '') +
                    '<br><span style="color:#94897b">Klicka <b>Skapa avtal från offert</b> först.</span>';
                ev.target.textContent = gate.previewLabel || 'Kontrollera gate';
              } else {
                if (draft) draft.innerHTML = '<b>Gate spärrad:</b> ' + esc(gate.error || 'fel');
                ev.target.textContent = gate.previewLabel || 'Kontrollera gate';
              }
            })
            .catch(function () {
              ev.target.textContent = 'Nätfel — försök igen';
            });
        }
        if (ev.target.hasAttribute('data-kk-sig-approve-template')) {
          var pidApprove = resolveKkSigPatientId(btn, ov);
          if (!pidApprove || !u.templateApprovalEndpoint) return;
          ev.target.textContent = 'Godkänner…';
          kkSigFetchJson(u.previewEndpoint, { patientId: pidApprove }).then(function (prev) {
            var tid = prev.j?.templateId;
            var ver = prev.j?.templateVersion;
            if (!tid || !ver) {
              ev.target.textContent = 'Saknar mall-info';
              return;
            }
            return kkSigFetchJson(u.templateApprovalEndpoint, {
              templateId: tid,
              version: ver,
              status: 'approved',
              approvedBy: 'fazli',
              note: 'ORD-6 staff modal',
            }).then(function (res) {
              var draft = ov.querySelector('.kk-sigact-draft');
              if (res.status >= 200 && res.status < 300) {
                if (draft)
                  draft.innerHTML =
                    '<b>✓ Mall-version godkänd.</b> ' +
                    esc(tid) +
                    '@' +
                    esc(ver) +
                    '<br>Klicka <b>Kontrollera gate</b> igen.';
                ev.target.textContent = 'Godkänd ✓';
              } else {
                if (draft)
                  draft.innerHTML = '<b>Kunde inte godkänna mall:</b> ' + esc(res.j.error || 'fel');
                ev.target.textContent = 'Godkänn mall-version';
              }
            });
          });
        }
        if (ev.target.hasAttribute('data-kk-sig-send')) {
          var pid = resolveKkSigPatientId(btn, ov);
          if (!pid) {
            ev.target.textContent = 'Kund-ID saknas';
            return;
          }
          if (
            !window.confirm(
              (u.sendLabel || 'Skicka för signering') +
                ' till ' +
                fnamn() +
                '? Detta aktiverar signeringsflödet och kan nå kunden via länk.'
            )
          )
            return;
          ev.target.textContent = 'Skickar…';
          kkSigFetchJson(u.sendEndpoint, { patientId: pid })
            .then(function (res) {
              var draft = ov.querySelector('.kk-sigact-draft');
              if (res.status === 200) {
                var url = res.j[u.urlKey] || '';
                if (draft)
                  draft.innerHTML =
                    '<b>✓ Signering aktiverad.</b><br>Länk: <span style="word-break:break-all">' +
                    esc(url) +
                    '</span>';
                ev.target.textContent = 'Skickat ✓';
                ev.target.disabled = true;
              } else {
                if (draft)
                  draft.innerHTML =
                    '<b>Kunde inte skicka:</b> ' +
                    esc(res.j.error || 'fel') +
                    (res.status === 404
                      ? '<br><span style="color:#94897b">Dokumentet finns inte än — skapa avtal/offert först.</span>'
                      : res.j.needsLegalReview
                        ? '<br><span style="color:#94897b">Godkänn mall-version (legal review) först.</span>'
                        : '');
                ev.target.textContent = u.sendLabel || 'Skicka';
              }
            })
            .catch(function () {
              ev.target.textContent = 'Nätfel — försök igen';
            });
        }
      });
    });
  })();

  // ===== Närvaro-markering: Show / No-show → backend + logg =====
  (function bindAttendanceOnce() {
    if (window.__kkAttendBound) return;
    window.__kkAttendBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-kk-attend]');
      if (!btn) return;
      var wrap = btn.closest('.kk-attend');
      if (!wrap) return;
      var pid = wrap.getAttribute('data-patient-id');
      var status = btn.getAttribute('data-kk-attend');
      if (!pid || !status) return;
      var statusEl = wrap.querySelector('[data-kk-attend-status]');
      var tid = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      // optimistisk uppdatering — tinta bubblan + statustext
      wrap.className = 'kk-attend is-' + status;
      if (statusEl) {
        statusEl.className = 'kk-attend-status is-' + status;
        statusEl.textContent =
          status === 'show' ? '✓ Ankommen ' + tid + ' · reception' : '✕ No-show · kontakta kunden';
      }
      var token = '';
      try {
        token = (
          window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          ''
        ).trim();
      } catch (err) {
        /* ignore */
      }
      var headers = { 'Content-Type': 'application/json' };
      if (token && token !== '__preview_local__') headers.Authorization = 'Bearer ' + token;
      fetch('/api/v1/cco-patient-master/patient/attendance', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ patientId: pid, status: status }),
      }).catch(function () {
        /* nätfel — optimistiska uppdateringen står kvar tills omladdning */
      });
    });
  })();

  // Smarta lyft: kopiera-adress, hoppa-till-sektion, öppna-stor-vy, toggla-sammanfattning.
  (function bindKkLiftsOnce() {
    if (window.__kkLiftsBound) return;
    window.__kkLiftsBound = true;
    function openRegistryDocFromReferens(row) {
      if (!row) return false;
      var registryId =
        row.getAttribute('data-kk-registry-doc') ||
        row.getAttribute('data-kk-auto-doc-preview') ||
        row.getAttribute('data-v11-doc-registry') ||
        '';
      if (!registryId) return false;
      if (
        window.CcoHairtpDocumentCloud &&
        typeof window.CcoHairtpDocumentCloud.activateRegistryDocument === 'function'
      ) {
        return window.CcoHairtpDocumentCloud.activateRegistryDocument(registryId);
      }
      if (/^auto_/.test(registryId)) {
        return openAutoDocPreviewFromReferens(row);
      }
      return false;
    }
    document.addEventListener('click', function (e) {
      // 0) Öppna dokument (PDF m.m.) i gemensam modal
      var doc = e.target.closest && e.target.closest('[data-kk-open-doc]');
      if (doc) {
        e.preventDefault();
        if (typeof window.__kkOpenDocument === 'function') {
          window.__kkOpenDocument(
            doc.getAttribute('data-kk-open-doc') || '',
            doc.getAttribute('data-kk-doc-title') || 'Dokument'
          );
        }
        return;
      }
      // 0b) Registry / auto-dokument (content-bundle wiring)
      var registryDoc =
        e.target.closest &&
        e.target.closest('[data-kk-registry-doc][data-v11-doc-previewable="1"]');
      if (registryDoc) {
        e.preventDefault();
        openRegistryDocFromReferens(registryDoc);
        return;
      }
      var autoDoc =
        e.target.closest &&
        e.target.closest('[data-kk-auto-doc-preview][data-v11-doc-previewable="1"]');
      if (autoDoc) {
        e.preventDefault();
        openRegistryDocFromReferens(autoDoc);
        return;
      }
      var filterBtn = e.target.closest && e.target.closest('[data-kk-registry-filter]');
      if (filterBtn) {
        var host = filterBtn.closest('[data-kk-registry-filters]');
        var axis = filterBtn.getAttribute('data-kk-registry-filter') || '';
        var value = filterBtn.getAttribute('data-kk-registry-value') || '';
        var section =
          filterBtn.closest('[data-sek="dokument-registry"]') ||
          filterBtn.closest('[data-sek="dokument"]') ||
          filterBtn.closest('.kkref');
        var state =
          section && section.__kkRegistryFilter
            ? section.__kkRegistryFilter
            : { filler: 'all', flow: 'all' };
        state[axis] = value;
        if (section) section.__kkRegistryFilter = state;
        if (host) {
          var btns = host.querySelectorAll('[data-kk-registry-filter="' + axis + '"]');
          for (var bi = 0; bi < btns.length; bi++) {
            btns[bi].classList.toggle(
              'is-active',
              btns[bi].getAttribute('data-kk-registry-value') === value
            );
          }
        }
        applyReferensRegistryFilters(section || document, state);
        return;
      }
      // 1) Kopiera (adress) till urklipp
      var cp = e.target.closest && e.target.closest('[data-kk-copy]');
      if (cp) {
        var val = cp.getAttribute('data-kk-copy') || '';
        if (navigator.clipboard) navigator.clipboard.writeText(val).catch(function () {});
        var ic = cp.querySelector('.kk-copy-ic');
        if (ic) {
          var old = ic.textContent;
          ic.textContent = '✓';
          setTimeout(function () {
            ic.textContent = old;
          }, 1200);
        }
        return;
      }
      // 2) Öppna stora kortet på rätt sektion (boknings-/historik-rad)
      var op = e.target.closest && e.target.closest('[data-kk-open-storvy]');
      if (op && typeof window.__kkOpenStorvy === 'function') {
        e.preventDefault();
        window.__kkOpenStorvy(
          op.getAttribute('data-kk-open-storvy') || '',
          op.getAttribute('data-kk-entry') || ''
        );
        return;
      }
      // 3) Hoppa till sektion (kundrese-steg)
      var jp = e.target.closest && e.target.closest('[data-kk-jump]');
      if (jp) {
        var slug = jp.getAttribute('data-kk-jump');
        var medForm = jp.getAttribute('data-kk-med-form') || '';
        var target = document.querySelector('.kkref .doss [data-sek="' + slug + '"]');
        if (target) {
          if (target.tagName === 'DETAILS') target.open = true;
          var sc = getReferensKkrefScroller();
          if (sc && sc.contains(target)) {
            sc.scrollTo({ top: target.offsetTop - sc.offsetTop - 8, behavior: 'smooth' });
          } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          target.classList.add('kk-flash');
          setTimeout(function () {
            target.classList.remove('kk-flash');
          }, 900);
          if (medForm) {
            expandMedForm(document.querySelector('.kkref .doss') || document, medForm);
          }
        }
        return;
      }
      // 3b) Betalväg — förbered (människa bekräftar/slutför, ALDRIG auto-pengar)
      var bv = e.target.closest && e.target.closest('[data-kk-betvag]');
      if (bv) {
        e.preventDefault();
        if (typeof window.__kkPaymentPrepare === 'function') {
          window.__kkPaymentPrepare(bv.getAttribute('data-kk-betvag'), bv);
        }
        return;
      }
      // 4) Toggla historik-sammanfattning
      var sm = e.target.closest && e.target.closest('[data-kk-sum]');
      if (sm) {
        var box = sm.parentNode && sm.parentNode.querySelector('[data-kk-sum-box]');
        if (box) {
          var hidden = box.hasAttribute('hidden');
          if (hidden) box.removeAttribute('hidden');
          else box.setAttribute('hidden', '');
          sm.textContent = hidden ? 'Dölj' : 'Sammanfatta';
        }
        return;
      }
    });
    document.addEventListener('keydown', function (e) {
      var autoDoc =
        e.target.closest &&
        e.target.closest('[data-kk-auto-doc-preview][data-v11-doc-previewable="1"]');
      if (!autoDoc || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      openAutoDocPreviewFromReferens(autoDoc);
    });
  })();

  // ===== Betalväg: förbered (modal) → backend prepare-endpoints. ALDRIG auto-pengar. =====
  window.__kkPaymentPrepare = function (method, btn) {
    var esc2 = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    var CFG = {
      swish: {
        title: 'Förbered Swish',
        endpoint: '/api/v1/cco-patient-master/payment/prepare-swish',
        confirmText: 'PREPARE SWISH PAYMENT',
        urlKey: 'swishUrl',
        urlLabel: 'Swish-länk',
      },
      kort: {
        title: 'Förbered kort · betalningslänk',
        endpoint: '/api/v1/cco-patient-master/payment/prepare-card-link',
        confirmText: 'PREPARE CARD PAYMENT',
        urlKey: 'paymentLinkUrl',
        urlLabel: 'Betalningslänk',
      },
      faktura: {
        title: 'Förbered faktura (utkast)',
        endpoint: '/api/v1/cco-patient-master/payment/prepare-invoice',
        confirmText: 'PREPARE INVOICE DRAFT',
        urlKey: 'invoiceDraftRef',
        urlLabel: 'Fakturautkast-ref',
      },
      mf: {
        title: 'Medical Finance',
        endpoint: '/api/v1/cco-patient-master/payment/medical-finance-info',
        get: true,
      },
    };
    var cfg = CFG[method];
    if (!cfg || !btn) return;
    var pid = btn.getAttribute('data-kk-pid') || '';
    var amt = btn.getAttribute('data-kk-amount') || '';
    var ph = btn.getAttribute('data-kk-phone') || '';
    var cid = btn.getAttribute('data-kk-cid') || '';

    function tokenHdrs() {
      var h = { 'Content-Type': 'application/json' };
      var t = '';
      try {
        t = (
          window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
          ''
        ).trim();
      } catch (e) {
        /* ignore */
      }
      if (t && t !== '__preview_local__') h.Authorization = 'Bearer ' + t;
      return h;
    }

    var old = document.getElementById('kk-paymodal');
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'kk-paymodal';
    ov.setAttribute(
      'style',
      'position:fixed;inset:0;z-index:2147483000;background:rgba(20,16,12,.45);display:flex;align-items:center;justify-content:center;padding:20px;'
    );
    var panel =
      'background:#fff;max-width:460px;width:100%;border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px rgba(0,0,0,.3);font:14px/1.5 system-ui,-apple-system,sans-serif;color:#2a2620;max-height:90vh;overflow:auto;';
    var head =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<b style="font-size:16px">' +
      esc2(cfg.title) +
      '</b><button type="button" data-pay-x style="border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#94897b">×</button></div>';
    var body;
    if (cfg.get) {
      body = '<div data-pay-result style="color:#94897b">Hämtar…</div>';
    } else {
      var inpStyle =
        'width:100%;padding:9px 11px;border:1px solid #e3dcd3;border-radius:9px;margin-bottom:12px;font-size:15px;box-sizing:border-box;';
      var lblStyle = 'display:block;font-size:12px;color:#94897b;margin-bottom:4px;';
      body =
        '<div style="color:#6b6259;margin-bottom:14px">Skapar en betalningsförfrågan att skicka manuellt. Ingen automatisk debitering — du slutför och skickar själv.</div>' +
        '<label style="' +
        lblStyle +
        '">Belopp (kr)</label><input data-pay-amount type="number" min="1" value="' +
        esc2(amt) +
        '" style="' +
        inpStyle +
        '"/>' +
        (method === 'swish'
          ? '<label style="' +
            lblStyle +
            '">Betalarens telefon (Swish)</label><input data-pay-phone value="' +
            esc2(ph) +
            '" style="' +
            inpStyle +
            '"/>' +
            '<label style="' +
            lblStyle +
            '">Meddelande (valfritt)</label><input data-pay-msg style="' +
            inpStyle +
            '"/>'
          : '') +
        '<div data-pay-result style="margin:6px 0;color:#b94a4a"></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px">' +
        '<button type="button" data-pay-x2 style="border:1px solid #d8cfc4;border-radius:9px;background:#fff;padding:9px 16px;cursor:pointer">Avbryt</button>' +
        '<button type="button" data-pay-go style="border:0;border-radius:9px;background:#2e7d52;color:#fff;padding:9px 18px;cursor:pointer;font-weight:600">Förbered</button></div>';
    }
    ov.innerHTML = '<div style="' + panel + '">' + head + body + '</div>';
    document.body.appendChild(ov);

    function close() {
      ov.remove();
    }
    ov.addEventListener('click', function (e) {
      if (
        e.target === ov ||
        (e.target.getAttribute && e.target.getAttribute('data-pay-x') !== null)
      )
        close();
    });
    var x2 = ov.querySelector('[data-pay-x2]');
    if (x2) x2.addEventListener('click', close);
    var resultEl = ov.querySelector('[data-pay-result]');

    if (cfg.get) {
      fetch(cfg.endpoint, { headers: tokenHdrs() })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          resultEl.style.color = '#2a2620';
          resultEl.innerHTML =
            '<b>' +
            esc2(j.provider || 'Medical Finance') +
            '</b><br><span style="color:#6b6259">' +
            esc2(j.message || '') +
            '</span>' +
            (j.contact && j.contact.url
              ? '<br><a href="' +
                esc2(j.contact.url) +
                '" target="_blank" rel="noopener noreferrer">' +
                esc2(j.contact.url) +
                '</a>'
              : '');
        })
        .catch(function () {
          resultEl.textContent = 'Kunde inte hämta info.';
        });
      return;
    }

    var goBtn = ov.querySelector('[data-pay-go]');
    goBtn.addEventListener('click', function () {
      var amtEl = ov.querySelector('[data-pay-amount]');
      var amount = Number(amtEl && amtEl.value);
      if (!amount || amount <= 0) {
        resultEl.style.color = '#b94a4a';
        resultEl.textContent = 'Ange ett giltigt belopp.';
        return;
      }
      var payload = { confirmText: cfg.confirmText, patientId: pid, amount: amount };
      if (cid) payload.commercialCaseId = cid;
      if (method === 'swish') {
        var pEl = ov.querySelector('[data-pay-phone]');
        var mEl = ov.querySelector('[data-pay-msg]');
        if (pEl && pEl.value) payload.payerAlias = pEl.value;
        if (mEl && mEl.value) payload.message = mEl.value;
      }
      goBtn.disabled = true;
      goBtn.textContent = 'Förbereder…';
      resultEl.style.color = '#94897b';
      resultEl.textContent = '';
      fetch(cfg.endpoint, {
        method: 'POST',
        headers: tokenHdrs(),
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { status: r.status, j: j };
          });
        })
        .then(function (res) {
          if (res.status === 200 || res.status === 201) {
            var url = res.j[cfg.urlKey] || '';
            resultEl.style.color = '#2a2620';
            resultEl.innerHTML =
              '<div style="background:#e7f3ec;border-radius:10px;padding:10px 12px;margin-bottom:8px"><b style="color:#2e7d52">✓ Förberett — ingen debitering gjord.</b><br><span style="color:#6b6259">' +
              esc2(res.j.message || '') +
              '</span></div>' +
              (url
                ? '<label style="display:block;font-size:12px;color:#94897b;margin:6px 0 4px">' +
                  esc2(cfg.urlLabel) +
                  '</label><div style="display:flex;gap:6px"><input readonly data-pay-url value="' +
                  esc2(url) +
                  '" style="flex:1;padding:8px 10px;border:1px solid #e3dcd3;border-radius:8px;font-size:13px"/>' +
                  '<button type="button" data-pay-copy style="border:1px solid #d8cfc4;border-radius:8px;background:#fff;padding:8px 12px;cursor:pointer">Kopiera</button></div>'
                : '');
            goBtn.style.display = 'none';
            var cp = ov.querySelector('[data-pay-copy]');
            if (cp)
              cp.addEventListener('click', function () {
                var i = ov.querySelector('[data-pay-url]');
                if (!i) return;
                i.select();
                try {
                  navigator.clipboard.writeText(i.value);
                } catch (e) {
                  try {
                    document.execCommand('copy');
                  } catch (e2) {
                    /* ignore */
                  }
                }
                cp.textContent = 'Kopierad ✓';
              });
          } else {
            resultEl.style.color = '#b94a4a';
            var hint = '';
            if (res.status === 503) hint = ' (tjänsten ej konfigurerad på servern)';
            else if (res.status === 409)
              hint = ' (saknar Fortnox-kundnummer — synka patienten först)';
            resultEl.textContent =
              (res.j && res.j.error ? res.j.error : 'Kunde inte förbereda.') + hint;
            goBtn.disabled = false;
            goBtn.textContent = 'Förbered';
          }
        })
        .catch(function () {
          resultEl.style.color = '#b94a4a';
          resultEl.textContent = 'Nätfel — försök igen.';
          goBtn.disabled = false;
          goBtn.textContent = 'Förbered';
        });
    });
  };

  function kkStaffAuthHeaders() {
    var token = '';
    try {
      token = (
        window.localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        window.sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      ).trim();
    } catch (_e) {
      /* ignore */
    }
    if (token && token !== '__preview_local__') {
      return { Authorization: 'Bearer ' + token };
    }
    return {};
  }

  function kkRevokeDocBlob(ov) {
    if (!ov || !ov._blobUrl) return;
    try {
      URL.revokeObjectURL(ov._blobUrl);
    } catch (_e) {
      /* ignore */
    }
    ov._blobUrl = '';
  }

  function kkCloseDocView(ov) {
    if (!ov) return;
    ov.classList.remove('open');
    kkRevokeDocBlob(ov);
    var body = ov.querySelector('.kk-doc-view-body');
    if (body) {
      body.classList.remove('kk-doc-view-body--pdf');
      body.innerHTML = '';
    }
  }

  function kkShowDocStatus(ov, text) {
    var body = ov.querySelector('.kk-doc-view-body');
    if (!body) return;
    body.innerHTML = '<div class="kk-doc-view-status">' + String(text || 'Laddar…') + '</div>';
  }

  function kkShowDocError(ov, message, src) {
    var body = ov.querySelector('.kk-doc-view-body');
    if (!body) return;
    body.classList.remove('kk-doc-view-body--pdf');
    body.innerHTML =
      '<div class="kk-doc-view-error">' +
      String(message || 'Kunde inte ladda dokumentet.') +
      '</div>';
    if (src) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kk-btn kk-doc-view-open-tab';
      btn.textContent = 'Försök i ny flik';
      btn.addEventListener('click', function () {
        window.open(src, '_blank', 'noopener');
      });
      body.appendChild(btn);
    }
  }

  function kkPdfJsBasePath() {
    return '/major-arcana-preview/vendor/pdfjs';
  }

  function kkLoadPdfJs() {
    var lib = window.pdfjsLib;
    if (lib && typeof lib.getDocument === 'function') return Promise.resolve(lib);
    if (window.__kkPdfJsLoad) return window.__kkPdfJsLoad;
    window.__kkPdfJsLoad = new Promise(function (resolve, reject) {
      var base = kkPdfJsBasePath();
      var script = document.createElement('script');
      script.src = base + '/pdf.min.js';
      script.onload = function () {
        var pdfjs = window.pdfjsLib;
        if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
          reject(new Error('pdf.js kunde inte initieras'));
          return;
        }
        pdfjs.GlobalWorkerOptions.workerSrc = base + '/pdf.worker.min.js';
        resolve(pdfjs);
      };
      script.onerror = function () {
        reject(new Error('Kunde inte ladda pdf.js'));
      };
      document.head.appendChild(script);
    });
    return window.__kkPdfJsLoad;
  }

  function kkAppendDocOpenTab(body, blobUrl) {
    var openTab = document.createElement('button');
    openTab.type = 'button';
    openTab.className = 'kk-doc-view-open-tab';
    openTab.textContent = 'Öppna i ny flik';
    openTab.addEventListener('click', function () {
      window.open(blobUrl, '_blank', 'noopener');
    });
    body.appendChild(openTab);
  }

  function kkRenderPdfPages(body, pdfjs, buf, blobUrl, title) {
    body.classList.add('kk-doc-view-body--pdf');
    body.innerHTML = '';
    var pages = document.createElement('div');
    pages.className = 'kk-doc-view-pages';
    body.appendChild(pages);
    kkAppendDocOpenTab(body, blobUrl);
    var data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return pdfjs.getDocument({ data: data }).promise.then(function (pdf) {
      var chain = Promise.resolve();
      for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        (function (n) {
          chain = chain.then(function () {
            return pdf.getPage(n).then(function (page) {
              var viewport = page.getViewport({ scale: 1.4 });
              var canvas = document.createElement('canvas');
              canvas.className = 'kk-doc-view-page';
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              canvas.setAttribute('aria-label', (title || 'Dokument') + ', sida ' + n);
              pages.appendChild(canvas);
              return page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport,
              }).promise;
            });
          });
        })(pageNum);
      }
      return chain;
    });
  }

  function kkRenderDocBlob(ov, blob, title) {
    var body = ov.querySelector('.kk-doc-view-body');
    if (!body) return Promise.resolve();
    body.classList.remove('kk-doc-view-body--pdf');
    body.innerHTML = '';
    kkRevokeDocBlob(ov);
    return blob.arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf);
      var head = u8.length >= 4 ? String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) : '';
      var isPdf = head === '%PDF';
      var mime = isPdf
        ? 'application/pdf'
        : blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : 'application/octet-stream';
      var viewBlob = new Blob([u8], { type: mime });
      ov._blobUrl = URL.createObjectURL(viewBlob);
      if (isPdf || mime === 'application/pdf') {
        kkShowDocStatus(ov, 'Renderar PDF…');
        return kkLoadPdfJs()
          .then(function (pdfjs) {
            return kkRenderPdfPages(body, pdfjs, u8, ov._blobUrl, title);
          })
          .catch(function (err) {
            kkShowDocError(ov, (err && err.message) || 'Kunde inte visa PDF.', ov._blobUrl);
          });
      }
      if (/^image\//i.test(mime)) {
        var img = document.createElement('img');
        img.className = 'kk-doc-view-img';
        img.src = ov._blobUrl;
        img.alt = title || 'Dokument';
        body.appendChild(img);
        return;
      }
      var dl = document.createElement('a');
      dl.className = 'kk-btn kk-doc-view-open-tab';
      dl.href = ov._blobUrl;
      dl.download = (title || 'dokument').replace(/[^\w\s.-åäöÅÄÖ]/g, '') || 'dokument';
      dl.textContent = 'Ladda ner fil';
      body.appendChild(dl);
    });
  }

  // Delad dokumentvisare — samma modal för HD/FC, journal-PDF och filer.
  window.__kkOpenDocument = function (url, title) {
    var raw = String(url || '').trim();
    if (!raw) return;
    var src = /^https?:\/\//i.test(raw) ? raw : new URL(raw, window.location.origin).href;
    var ov = document.getElementById('kk-doc-view');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'kk-doc-view';
      ov._blobUrl = '';
      ov.innerHTML =
        '<div class="kk-doc-view-panel">' +
        '<div class="kk-doc-view-head">' +
        '<span class="kk-doc-view-title"></span>' +
        '<button type="button" class="kk-doc-view-close" aria-label="Stäng">×</button>' +
        '</div>' +
        '<div class="kk-doc-view-body"><div class="kk-doc-view-status">Laddar…</div></div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.classList.contains('kk-doc-view-close')) kkCloseDocView(ov);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var open = document.getElementById('kk-doc-view');
        if (!open || !open.classList.contains('open')) return;
        kkCloseDocView(open);
      });
    }
    var titleEl = ov.querySelector('.kk-doc-view-title');
    if (titleEl) titleEl.textContent = title || 'Dokument';
    kkShowDocStatus(ov, 'Laddar…');
    ov.classList.add('open');
    fetch(src, { headers: kkStaffAuthHeaders(), credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var msg = 'Kunde inte ladda dokumentet.';
            try {
              var j = JSON.parse(txt);
              if (j && j.error) msg = String(j.error);
            } catch (_e) {
              /* ignore */
            }
            throw new Error(msg);
          });
        }
        var ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('application/json') >= 0) {
          return res.json().then(function (j) {
            throw new Error((j && j.error) || 'Kunde inte ladda dokumentet.');
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        return kkRenderDocBlob(ov, blob, title);
      })
      .catch(function (err) {
        kkShowDocError(ov, (err && err.message) || 'Kunde inte ladda dokumentet.', src);
      });
  };

  // Delad öppnare: ploppar upp gemensamma kortet (STOR VY via iframe), valfligt
  // landat på en sektion (#slug). Används av header-förstoringen OCH sektions-⤢.
  window.__kkOpenStorvy = function (slug, entryId, medForm) {
    var ov = document.getElementById('kk-storvy');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'kk-storvy';
      ov.innerHTML =
        '<div class="kk-storvy-panel">' +
        '<button type="button" class="kk-storvy-close" aria-label="Stäng">×</button>' +
        '<div class="kk-storvy-body"></div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        if (e.target === ov || e.target.classList.contains('kk-storvy-close'))
          ov.classList.remove('open');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') ov.classList.remove('open');
      });
    }
    var body = ov.querySelector('.kk-storvy-body');
    // Rensa ev. gammal klon FÖRST, så vi sen hittar den LEVANDE dossiern (ej en klon)
    body.innerHTML = '';
    if (window.__GK_LAST) {
      // Gemensamma kundkortet (live-data) — det riktiga patientkortet i full vy
      body.innerHTML = window.__GK_LAST;
      if (window.__gkLoadTimeline) setTimeout(window.__gkLoadTimeline, 0);
      if (window.__gkLoadAutoSends) setTimeout(window.__gkLoadAutoSends, 0);
      if (window.__gkLoadFortnox) setTimeout(window.__gkLoadFortnox, 0);
      if (window.__gkHydrateSecurePhotos)
        setTimeout(function () {
          window.__gkHydrateSecurePhotos(body);
        }, 0);
    } else {
      var live = document.querySelector('.kkref .doss');
      if (live) {
        // .kkref-wrapper så scoped dossier-CSS (html[data-v9-enabled] .kkref .doss ...) gäller
        body.innerHTML = '<div class="kkref"></div>';
        body.querySelector('.kkref').appendChild(live.cloneNode(true));
      } else {
        body.innerHTML = '<div style="padding:28px;color:#6b6052">Öppna en kund först.</div>';
      }
    }
    ov.classList.add('open');
    requestAnimationFrame(function () {
      var esc1 = function (s) {
        return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
      };
      var target = null;
      if (entryId) target = body.querySelector('[data-jentry="' + esc1(entryId) + '"]');
      if (!target && slug) target = body.querySelector('[data-sek="' + esc1(slug) + '"]');
      if (target) {
        var det = target.closest('details');
        if (det) det.open = true;
        if (target.tagName === 'DETAILS') target.open = true;
        var top =
          target.getBoundingClientRect().top -
          body.getBoundingClientRect().top +
          body.scrollTop -
          14;
        body.scrollTo({ top: top, behavior: 'smooth' });
        target.classList.add('kk-flash');
        setTimeout(function () {
          target.classList.remove('kk-flash');
        }, 1200);
        if (medForm) expandMedForm(body, medForm);
      } else {
        body.scrollTo({ top: 0 });
      }
    });
  };

  // Mappar app-sektionens rubrik → gemensamma kortets sektions-slug
  window.__kkSlugFromTitle = function (title) {
    var t = String(title || '').toLowerCase();
    if (t.indexOf('hälsodek') >= 0) return 'halso';
    if (t.indexOf('kundresa') >= 0) return 'kundresa';
    if (t.indexOf('nästa steg') >= 0) return 'nastasteg';
    if (t.indexOf('bokning') >= 0) return 'bokningar';
    if (t.indexOf('historik') >= 0) return 'historik';
    if (t.indexOf('journal') >= 0) return 'journal';
    if (t.indexOf('personal') >= 0) return 'personal';
    if (t.indexOf('offert') >= 0) return 'offert';
    if (t.indexOf('auto') >= 0) return 'auto';
    if (t.indexOf('dokument') >= 0) return 'dokument';
    if (t.indexOf('foto') >= 0) return 'foto';
    if (t.indexOf('ekonomi') >= 0) return 'ekonomi';
    return '';
  };

  // MINIMAL enhancer (FACIT 2026-06-08): rail = ren v9-dossier. Lägger ENDAST till
  // förstorings-knappen ⤢ i headern → ploppar upp gemensamma kortet (STOR VY via iframe).
  // Bygger ALDRIG om sektionerna (det var det gamla felet).
  function kkAddForstoring(rootEl) {
    try {
      var root = rootEl && rootEl.querySelector ? rootEl : document;
      var head = root.querySelector('.kkref .doss .dhead');
      if (!head || head.querySelector('.kk-forstoring')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kk-forstoring';
      btn.title = 'Förstora kundkortet';
      btn.setAttribute('aria-label', 'Förstora kundkortet');
      btn.textContent = '⤢';
      head.appendChild(btn);
      btn.addEventListener('click', function () {
        window.__kkOpenStorvy('');
      });
    } catch (e) {
      /* förstoring får aldrig fälla dossiern */
    }
  }
  window.__enhanceReferensKundkort = function (rootEl) {
    try {
      var bindRoot =
        rootEl && rootEl.querySelector
          ? rootEl.querySelector('.kkref') || rootEl
          : document.querySelector('.kkref');
      if (bindRoot && window.CcoHairtpDocumentCloud?.bindOpDayStaffActions) {
        window.CcoHairtpDocumentCloud.bindOpDayStaffActions(bindRoot);
      }
    } catch (_opDayBind) {
      /* best-effort */
    }
    // Rail ska vara ren v9-dossier. Enda tillägget: förstorings-knappen.
    kkAddForstoring(rootEl);
    if (window.__KK_ENHANCER_PA !== true) return;
    try {
      var root = rootEl && rootEl.querySelector ? rootEl : document;
      var doss = root.querySelector('.kkref .doss');
      if (!doss || doss.querySelector('.kk-nav')) return;
      var head = doss.querySelector('.dhead');
      if (!head) return;
      // Sektioner kan vara .sec (referens-rå) eller details.dossier-section (kkx-lagret)
      var noder = doss.querySelectorAll('.sec[data-sek], details.dossier-section');
      Array.prototype.forEach.call(noder, function (node) {
        if (node.getAttribute('data-sek')) return;
        var summary = node.querySelector('summary');
        var label = summary
          ? (summary.childNodes[0] && summary.childNodes[0].textContent) || summary.textContent
          : '';
        node.setAttribute('data-sek', sekSlug(label));
      });
      var navHtml = KK_NAV.filter(function (n) {
        return doss.querySelector('[data-sek="' + n[0] + '"]');
      })
        .map(function (n) {
          var sekEl = doss.querySelector('[data-sek="' + n[0] + '"]');
          var s = sekEl.querySelector('.lab .src, summary .count');
          var badge = s ? String(s.textContent || '').trim() : '';
          if (badge.length > 10 || badge === '0') badge = '';
          return (
            '<button type="button" class="kk-chip" data-kk-mal="' +
            n[0] +
            '">' +
            n[1] +
            (badge ? ' <span class="kn">' + esc(badge) + '</span>' : '') +
            '</button>'
          );
        })
        .join('');
      if (!navHtml) {
        // sektionerna kan monteras strax efter (kkx) — försök igen, max 8 ggr
        doss.__kkTry = (doss.__kkTry || 0) + 1;
        if (doss.__kkTry <= 8) {
          setTimeout(function () {
            window.__enhanceReferensKundkort(rootEl);
          }, 250);
        }
        return;
      }
      var sticky = document.createElement('div');
      sticky.className = 'kk-sticky';
      doss.insertBefore(sticky, head);
      sticky.appendChild(head);
      var nav = document.createElement('div');
      nav.className = 'kk-nav';
      nav.innerHTML = navHtml;
      sticky.appendChild(nav);
      var scroller = doss.parentElement;
      while (scroller && scroller !== document.body) {
        var cs = getComputedStyle(scroller);
        if (
          /(auto|scroll)/.test(cs.overflowY) &&
          scroller.scrollHeight > scroller.clientHeight + 4
        ) {
          break;
        }
        scroller = scroller.parentElement;
      }
      if (scroller === document.body) scroller = null;
      function aktivera(slug) {
        nav.querySelectorAll('.kk-chip').forEach(function (c) {
          c.classList.toggle('active', c.getAttribute('data-kk-mal') === slug);
        });
        if (typeof window.__kkUpdateContext === 'function') {
          window.__kkUpdateContext(doss, slug);
        }
      }
      nav.addEventListener('click', function (e) {
        var chip = e.target.closest('.kk-chip');
        if (!chip) return;
        var mal = doss.querySelector('[data-sek="' + chip.getAttribute('data-kk-mal') + '"]');
        if (!mal) return;
        if (mal.tagName === 'DETAILS' && !mal.open) mal.open = true;
        var off = sticky.offsetHeight + 8;
        if (scroller) {
          var top =
            mal.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop -
            off;
          scroller.scrollTo(0, Math.max(0, top));
        } else {
          window.scrollTo(0, Math.max(0, window.scrollY + mal.getBoundingClientRect().top - off));
        }
        aktivera(chip.getAttribute('data-kk-mal'));
      });
      if (typeof IntersectionObserver === 'function') {
        var io = new IntersectionObserver(
          function (poster) {
            poster.forEach(function (p) {
              if (p.isIntersecting) aktivera(p.target.getAttribute('data-sek'));
            });
          },
          { root: scroller, rootMargin: '-25% 0px -65% 0px' }
        );
        doss.querySelectorAll('[data-sek]').forEach(function (s) {
          io.observe(s);
        });
      }
      var first = nav.querySelector('.kk-chip');
      if (first) aktivera(first.getAttribute('data-kk-mal'));
      // kkx-lagret kan skriva om sektionerna EFTER oss → tagga om nya noder
      var mo = new MutationObserver(function () {
        clearTimeout(doss.__kkNavT);
        doss.__kkNavT = setTimeout(function () {
          Array.prototype.forEach.call(
            doss.querySelectorAll('details.dossier-section:not([data-sek])'),
            function (node) {
              var summary = node.querySelector('summary');
              var label = summary
                ? (summary.childNodes[0] && summary.childNodes[0].textContent) ||
                  summary.textContent
                : '';
              node.setAttribute('data-sek', sekSlug(label));
              if (typeof io !== 'undefined' && io) io.observe(node);
            }
          );
        }, 120);
      });
      mo.observe(doss, { childList: true, subtree: true });
      if (typeof window.__kkFas2Setup === 'function') {
        window.__kkFas2Setup(doss, sticky, nav);
      }
    } catch (err) {
      /* förbättringen får aldrig fälla dossiern */
    }
  };

  /* ===== Fas 2: kontextsmart rad + Förbered besök + Åtgärder (live-deriverat) ===== */
  function kkSek(doss, slug) {
    return doss.querySelector('[data-sek="' + slug + '"]');
  }
  function kkBadge(doss, slug) {
    var el = kkSek(doss, slug);
    var b = el && el.querySelector('summary .count, .lab .src');
    return b ? String(b.textContent || '').trim() : '';
  }
  function kkFirstText(doss, slug, sel) {
    var el = kkSek(doss, slug);
    if (!el) return '';
    var n = el.querySelector(sel || '.qrow, .hrow, .brow, .jrow, .orow, li, p, div:not(summary)');
    return n
      ? String(n.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 70)
      : '';
  }
  window.__kkUpdateContext = function (doss, slug) {
    try {
      var summ = doss.__kkSumm;
      if (!summ) return;
      var t = '';
      var b = kkBadge(doss, slug);
      if (slug === 'kundresa' || !slug) t = summ.__kkDefault || '';
      else if (slug === 'halso') t = '<b>Hälsodeklaration:</b> ' + esc(b || 'status okänd');
      else if (slug === 'nastasteg')
        t = '<b>Nästa steg:</b> ' + esc(kkFirstText(doss, 'nastasteg') || b || '—');
      else if (slug === 'bokningar') t = '<b>Bokningar:</b> ' + esc(b || '0') + ' kommande';
      else if (slug === 'historik') t = '<b>Historik:</b> ' + esc(b || '0') + ' händelser';
      else if (slug === 'journal') t = '<b>Journal:</b> ' + esc(b || '0') + ' anteckningar';
      else if (slug === 'offert') t = '<b>Offerter:</b> ' + esc(b || '0') + ' aktiva';
      else if (slug === 'auto') t = '<b>Auto:</b> ' + esc(b || '0') + ' systemdokument';
      else if (slug === 'foto') t = '<b>Foton:</b> ' + esc(b || '0') + ' i journalen';
      else if (slug === 'ekonomi') t = '<b>Ekonomi:</b> ' + esc(b || '—');
      if (!t) t = summ.__kkDefault || '';
      var holder = summ.querySelector('[data-kk-ctx]');
      if (holder) holder.innerHTML = t;
    } catch (e) {
      /* tyst */
    }
  };
  function kkOverlay(doss, id, title, sub, bodyHtml) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var ov = document.createElement('div');
    ov.className = 'kk-ov';
    ov.id = id;
    ov.innerHTML =
      '<div class="kk-opanel"><div class="kk-oh">' +
      esc(title) +
      '</div><div class="kk-osub">' +
      esc(sub) +
      '</div>' +
      bodyHtml +
      '<div class="kk-orow"><button type="button" class="kk-btn" data-kk-stang>Stäng</button></div></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.hasAttribute('data-kk-stang')) ov.remove();
    });
    document.body.appendChild(ov);
    return ov;
  }
  function kkRad(label, value) {
    return (
      '<div class="kk-frad"><span>' + esc(label) + '</span><b>' + esc(value || '—') + '</b></div>'
    );
  }
  function kkForslag(doss) {
    var namn = String((doss.querySelector('.dhead .dn') || {}).textContent || 'kund').trim();
    var fnamn = namn.split(' ')[0];
    var ut = [];
    var hb = kkBadge(doss, 'halso');
    if (/fylla|saknas/i.test(hb)) {
      ut.push({
        rubrik: 'Skicka hälsodeklaration',
        skal: 'Hälsodeklaration saknas — krävs före besök',
        utkast:
          'Hej ' +
          fnamn +
          '! Inför ditt besök hos Hair TP Clinic behöver vi din hälsodeklaration. Fyll i den här: [länk]. Tar 2 minuter. Tack!',
      });
    }
    var ob = kkBadge(doss, 'offert');
    if (ob && ob !== '0') {
      ut.push({
        rubrik: 'Påminn om offert',
        skal: ob + ' aktiv offert utan svar',
        utkast:
          'Hej ' +
          fnamn +
          '! Hoppas allt är bra. Hör gärna av dig om du har frågor kring behandlingsplanen vi skickade — vi bokar gärna ett kort samtal. / Hair TP Clinic',
      });
    }
    var bb = kkBadge(doss, 'bokningar');
    if (bb && bb !== '0') {
      ut.push({
        rubrik: 'Bekräfta kommande tid',
        skal: bb + ' kommande bokning',
        utkast:
          'Hej ' +
          fnamn +
          '! En påminnelse om din kommande tid hos Hair TP Clinic. Svara JA för att bekräfta, eller ring oss om tiden inte passar.',
      });
    }
    return ut.slice(0, 3);
  }
  var KK_ORDNING = [
    'kundresa',
    'nastasteg',
    'halso',
    'besok',
    'bokningar',
    'journal',
    'foto',
    'historik',
    'offert',
    'ekonomi',
    'betalning',
    'dokument',
    'personal',
    'auto',
    'anteckningar',
    'kommunikation',
    'insikter',
    'tabild',
  ];
  var KK_RUBRIK = {
    kundresa: 'Kundresa · 9 steg',
    nastasteg: 'Smart nästa steg',
    halso: 'Medicinskt läge',
    besok: 'Besök',
    bokningar: 'Kommande bokningar',
    historik: 'Historik',
    journal: 'Journal',
    personal: 'Personal',
    offert: 'Offert',
    foto: 'Foto',
    ekonomi: 'Ekonomi',
    betalning: 'Betalning',
    dokument: 'Dokument',
    auto: 'Auto',
    anteckningar: 'Anteckningar',
    kommunikation: 'Kommunikation',
    insikter: 'Insikter',
    tabild: 'Ta bild',
  };
  function kkMockupParity(doss) {
    /* Mockupens struktur: rätt ordning, öppna kort, mockup-rubriker,
       historik-verktyg, Ta bild-sektion. Allt på befintlig live-data. */
    var seks = Array.prototype.slice.call(
      doss.querySelectorAll('details.dossier-section[data-sek]')
    );
    if (!seks.length) return;
    var container = seks[0].parentElement;
    /* 1. Mockup-rubriker + öppna */
    seks.forEach(function (s) {
      s.open = true;
      var slug = s.getAttribute('data-sek');
      var summary = s.querySelector('summary');
      if (summary && KK_RUBRIK[slug] && summary.childNodes[0]) {
        if (summary.childNodes[0].nodeType === 3) {
          summary.childNodes[0].textContent = KK_RUBRIK[slug] + ' ';
        }
      }
    });
    /* 2. Ta bild-sektion (kopplar till befintlig kamera-knapp om den finns) */
    if (!doss.querySelector('[data-sek="tabild"]')) {
      var tb = document.createElement('details');
      tb.className = 'dossier-section';
      tb.setAttribute('data-sek', 'tabild');
      tb.open = true;
      tb.innerHTML =
        '<summary>Ta bild </summary>' +
        '<div class="kk-tbrad">Foto-samtycke krävs · scope: hårlinje + krona — aldrig ansikte.</div>' +
        '<button type="button" class="kk-btn kk-btn-gold" data-kk-tabild>📷 Ta bild · spara i journal</button>';
      container.appendChild(tb);
      tb.querySelector('[data-kk-tabild]').addEventListener('click', function () {
        var knapp = document.querySelector(
          '[data-v9-quick-camera], [data-kkx-camera], .v9-quick-pills button, [data-v9-dossier-camera]'
        );
        if (knapp) knapp.click();
      });
    }
    /* 3. Historik-verktyg: Sammanfatta + fritextsök på riktiga rader */
    var hist = doss.querySelector('[data-sek="historik"]');
    if (hist && !hist.querySelector('.kk-hverktyg')) {
      var rader = Array.prototype.slice.call(hist.querySelectorAll('div')).filter(function (d) {
        return d.children.length === 0 && (d.textContent || '').trim().length > 3;
      });
      var verktyg = document.createElement('div');
      verktyg.className = 'kk-hverktyg';
      verktyg.innerHTML =
        '<button type="button" class="kk-btn" data-kk-summera>Sammanfatta</button>' +
        '<input class="kk-hsok" placeholder="Sök i historiken…" />' +
        '<div class="kk-hsvar" hidden></div>';
      var summary = hist.querySelector('summary');
      if (summary && summary.nextSibling) {
        hist.insertBefore(verktyg, summary.nextSibling);
      } else {
        hist.appendChild(verktyg);
      }
      var svar = verktyg.querySelector('.kk-hsvar');
      verktyg.querySelector('[data-kk-summera]').addEventListener('click', function () {
        var texter = rader.map(function (r) {
          return (r.textContent || '').replace(/\s+/g, ' ').trim();
        });
        svar.innerHTML =
          '<b>' +
          texter.length +
          ' händelser.</b> Senaste: ' +
          esc(texter[0] || '—') +
          (texter.length > 1 ? ' · Äldsta: ' + esc(texter[texter.length - 1]) : '');
        svar.hidden = false;
      });
      verktyg.querySelector('.kk-hsok').addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var q = String(this.value || '').toLowerCase();
        var traff = rader.filter(function (r) {
          return (r.textContent || '').toLowerCase().indexOf(q) >= 0;
        });
        svar.innerHTML = traff.length
          ? '<b>' +
            traff.length +
            ' träff' +
            (traff.length === 1 ? '' : 'ar') +
            ':</b> ' +
            esc((traff[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90))
          : '<b>0 träffar</b> i historiken på "' + esc(q) + '"';
        svar.hidden = false;
      });
    }
    /* 4. Mockupens sektionsordning */
    KK_ORDNING.forEach(function (slug) {
      var el = doss.querySelector('[data-sek="' + slug + '"]');
      if (el) container.appendChild(el);
    });
    /* 5. Snabbknappar (app-funktioner, behålls) flyttas SIST — mockupen
       har sektionerna direkt under chipsen */
    Array.prototype.forEach.call(
      doss.querySelectorAll('.v9-zone3-context, .acts'),
      function (block) {
        container.appendChild(block);
      }
    );
    /* gthread-linjerna mellan chips och sektioner bort — mockupen har inga */
    Array.prototype.forEach.call(doss.querySelectorAll('.gthread'), function (g) {
      g.remove();
    });
  }
  function kkReorderSections(doss) {
    var seks = Array.prototype.slice.call(
      doss.querySelectorAll('details.dossier-section[data-sek]')
    );
    if (!seks.length) return;
    var container = seks[0].parentElement;
    var current = seks
      .map(function (el) {
        return el.getAttribute('data-sek');
      })
      .filter(Boolean);
    var desired = KK_ORDNING.filter(function (slug) {
      return !!doss.querySelector('details.dossier-section[data-sek="' + slug + '"]');
    });
    if (current.join('|') === desired.join('|')) return;
    KK_ORDNING.forEach(function (slug) {
      var el = doss.querySelector('details.dossier-section[data-sek="' + slug + '"]');
      if (el) container.appendChild(el);
    });
  }
  function kkReorderAllDossiers() {
    Array.prototype.forEach.call(
      document.querySelectorAll(
        '.kkref .doss, .customers-rail .doss, .customers-rail--dominant .doss'
      ),
      function (doss) {
        try {
          kkReorderSections(doss);
        } catch (_e) {
          /* tyst */
        }
      }
    );
  }
  function kkQueueReorderAllDossiers() {
    window.clearTimeout(window.__kkReorderTimer);
    window.__kkReorderTimer = window.setTimeout(kkReorderAllDossiers, 80);
  }
  if (!window.__kkReorderObserver) {
    window.__kkReorderObserver = new MutationObserver(kkQueueReorderAllDossiers);
    window.__kkReorderObserver.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(kkReorderAllDossiers, 0);
  }
  window.__kkFas2Setup = function (doss, sticky, nav) {
    try {
      if (doss.__kkFas2) return;
      doss.__kkFas2 = true;
      kkMockupParity(doss);
      /* 1. Smart sammanfattning → sticky + kontextbytare */
      var summ = doss.querySelector('.summ');
      if (!summ) {
        summ = document.createElement('div');
        summ.className = 'summ kkx-summ';
        summ.innerHTML = '<span class="sk">SMART SAMMANFATTNING</span>';
      }
      var defaultHtml = '';
      Array.prototype.forEach.call(summ.childNodes, function (n) {
        if (n.nodeType === 1 && n.className === 'sk') return;
        defaultHtml += n.nodeType === 1 ? n.outerHTML : esc(n.textContent);
      });
      var sk = summ.querySelector('.sk');
      summ.innerHTML = '';
      if (sk) summ.appendChild(sk);
      var ctxHolder = document.createElement('span');
      ctxHolder.setAttribute('data-kk-ctx', '1');
      ctxHolder.innerHTML = defaultHtml || 'Kundkortet samlat — välj sektion ovan.';
      summ.appendChild(ctxHolder);
      summ.__kkDefault = defaultHtml || 'Kundkortet samlat — välj sektion ovan.';
      sticky.insertBefore(summ, nav);
      doss.__kkSumm = summ;
      window.setTimeout(function () {
        try {
          kkReorderSections(doss);
        } catch (_e) {
          /* tyst */
        }
      }, 0);
      window.setTimeout(function () {
        try {
          kkReorderSections(doss);
        } catch (_e) {
          /* tyst */
        }
      }, 250);
      /* 2. Knappar i headern */
      var head = sticky.querySelector('.dhead');
      if (head && !head.querySelector('.kk-actions')) {
        var act = document.createElement('div');
        act.className = 'kk-actions';
        var antal = kkForslag(doss).length;
        act.innerHTML =
          '<button type="button" class="kk-btn kk-btn-gold" data-kk-forbered>Förbered besök</button>' +
          '<button type="button" class="kk-btn" data-kk-atgarder>Åtgärder' +
          (antal ? ' (' + antal + ')' : '') +
          '</button>';
        head.appendChild(act);
        act.querySelector('[data-kk-forbered]').addEventListener('click', function () {
          var namn = String((head.querySelector('.dn') || {}).textContent || '').trim();
          var body =
            kkRad('Medicinskt läge', kkBadge(doss, 'halso')) +
            kkRad('Kundresa', kkBadge(doss, 'kundresa')) +
            kkRad('Kommande bokningar', kkBadge(doss, 'bokningar') || '0') +
            kkRad('Journalanteckningar', kkBadge(doss, 'journal') || '0') +
            kkRad('Foton', kkBadge(doss, 'foto') || '0') +
            kkRad('Offerter', kkBadge(doss, 'offert') || '0') +
            kkRad('Ekonomi', kkBadge(doss, 'ekonomi'));
          kkOverlay(
            doss,
            'kk-ov-forbered',
            'Förbered besök · ' + namn,
            'Allt inför besöket — hämtat live ur kortet',
            body
          );
        });
        act.querySelector('[data-kk-atgarder]').addEventListener('click', function () {
          var f = kkForslag(doss);
          var body = f.length
            ? f
                .map(function (x, i) {
                  return (
                    '<div class="kk-frad"><span><b>' +
                    (i + 1) +
                    ' · ' +
                    esc(x.rubrik) +
                    '</b><br>' +
                    esc(x.skal) +
                    '</span></div><div class="kk-utkast">' +
                    esc(x.utkast) +
                    '</div><div class="kk-orow"><button type="button" class="kk-btn" data-kk-kopiera="' +
                    i +
                    '">Kopiera utkast</button></div>'
                  );
                })
                .join('')
            : '<div class="kk-frad"><span>Inga föreslagna åtgärder just nu — allt ser bra ut.</span></div>';
          var ov = kkOverlay(
            doss,
            'kk-ov-atgarder',
            'Föreslagna åtgärder (' + f.length + ')',
            'Färdiga utkast utifrån kundens läge — kopiera och skicka',
            body
          );
          ov.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-kk-kopiera]');
            if (!btn) return;
            var idx = Number(btn.getAttribute('data-kk-kopiera'));
            if (navigator.clipboard && f[idx]) {
              navigator.clipboard.writeText(f[idx].utkast);
              btn.textContent = 'Kopierat ✓';
            }
          });
        });
      }
    } catch (e) {
      /* tyst */
    }
  };
  try {
    window.dispatchEvent(new CustomEvent('arcana:v10-kundkort-ready'));
  } catch (e) {
    /* best-effort: patient-master-ui kan ändå rendera facit vid nästa detail-paint */
  }
})();
