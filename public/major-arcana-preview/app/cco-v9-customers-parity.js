/**
 * ORD-24 — v9 kundvy parity (mockup gaps 1–8).
 * Sort/vy, dossier-sektioner, bulk från agg-kort, global sök-sync.
 */
(function (global) {
  'use strict';

  const SORT_ORDER = ['activity', 'name', 'revenue'];
  const SORT_LABELS = {
    activity: '⇅ Senaste aktivitet',
    name: '⇅ Namn A–Ö',
    revenue: '⇅ Intäkt (LTV)',
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function asArray(value) {
    return Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  }

  /** Owner facit: kunder-mockup-v10.html */
  function usesV10KundkortFacit() {
    return global.__ARCANA_V10_KUNDKORT_FACIT !== false;
  }

  function resolveFileViewUrl(file) {
    if (file?.viewUrl) return String(file.viewUrl);
    if (file?.id) {
      return `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(file.id)}`;
    }
    return '';
  }

  function isPreviewableImageFile(file) {
    const name = String(
      file?.fileName || file?.relativePath || file?.originalFileName || ''
    ).toLowerCase();
    return file?.fileType === 'image' || /\.(jpe?g|png|webp|gif|heic|heif|dng)$/i.test(name);
  }

  function isJournalPdfFile(file) {
    const name = String(file?.fileName || file?.relativePath || '').toLowerCase();
    return file?.fileType === 'journal_pdf' || name.endsWith('.pdf');
  }

  function shortenFileName(name, max = 28) {
    const text = String(name || 'Fil').trim() || 'Fil';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function renderV10FileTile(file) {
    const rawName =
      file.originalFileName || file.fileName || file.relativePath || file.name || 'Fil';
    const name = String(rawName).trim() || 'Fil';
    const shortName = shortenFileName(name);
    const href = resolveFileViewUrl(file);
    const cat = String(file.category || file.fileType || '').toLowerCase();
    const icon = fileIconForKind(cat, name);
    const badge = file.ccoNative ? 'CCO' : isJournalPdfFile(file) ? 'PDF' : '';

    if (isPreviewableImageFile(file) && file.id && href) {
      return `
        <a class="dossier-file dossier-file--v10" href="${escapeHtml(href)}" target="_blank" rel="noopener" data-photo="${escapeHtml(file.id)}" title="${escapeHtml(name)}">
          <img src="" data-patient-file-id="${escapeHtml(file.id)}" alt="${escapeHtml(shortName)}" loading="lazy" decoding="async" />
          <span class="dossier-file-name">${escapeHtml(shortName)}</span>
        </a>`;
    }

    if (href) {
      return `
        <a class="dossier-file dossier-file--v10" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${escapeHtml(name)}">
          <span class="dossier-file-icon" aria-hidden="true">${icon}</span>
          <span class="dossier-file-name">${escapeHtml(shortName)}</span>
          ${badge ? `<span class="dossier-file-badge">${escapeHtml(badge)}</span>` : ''}
        </a>`;
    }

    return `
      <div class="dossier-file dossier-file--v10" title="${escapeHtml(name)}">
        <span class="dossier-file-icon" aria-hidden="true">${icon}</span>
        <span class="dossier-file-name">${escapeHtml(shortName)}</span>
        ${badge ? `<span class="dossier-file-badge">${escapeHtml(badge)}</span>` : ''}
      </div>`;
  }

  function renderV10DriveFilesHtml(driveFiles, card, { limit = 0, emptyHtml = '' } = {}) {
    void card;
    const rows = asArray(driveFiles);
    if (!rows.length) {
      return emptyHtml || '<p class="dossier-empty">Inga filer importerade ännu.</p>';
    }
    const visible = limit > 0 ? rows.slice(0, limit) : rows;
    return `
      <div class="dossier-files dossier-files--v10">
        ${visible.map((file) => renderV10FileTile(file)).join('')}
      </div>`;
  }

  function isV9On() {
    return document.documentElement.getAttribute('data-v9-enabled') === 'on';
  }

  function isCustomersView() {
    const canvas = document.querySelector('.preview-canvas');
    return canvas && canvas.dataset.appShellView === 'customers';
  }

  function formatSek(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${Math.round(n).toLocaleString('sv-SE')} kr`;
  }

  function buildCommunicationItems(card, occasionTimeline) {
    const items = [];
    for (const ev of asArray(occasionTimeline)) {
      const kind = String(ev.kind || ev.type || ev.category || '').toLowerCase();
      if (kind.includes('mail') || kind.includes('email') || kind === 'send') {
        items.push({
          type: 'mail',
          text: ev.title || ev.label || 'Mejl',
          meta: ev.detail?.subject || ev.summary || ev.occurredAt || ev.ts || '',
        });
      } else if (kind.includes('sms')) {
        items.push({
          type: 'sms',
          text: ev.title || 'SMS',
          meta: ev.summary || ev.occurredAt || ev.ts || '',
        });
      } else if (kind.includes('call') || kind.includes('phone')) {
        items.push({
          type: 'call',
          text: ev.title || 'Telefonsamtal',
          meta: ev.summary || ev.occurredAt || ev.ts || '',
        });
      }
    }
    if (!items.length && card?.primaryEmail) {
      items.push({
        type: 'mail',
        text: 'Senaste kontaktväg: e-post',
        meta: card.primaryEmail,
      });
    }
    if (!items.length && card?.primaryPhone) {
      items.push({
        type: 'call',
        text: 'Senaste kontaktväg: telefon',
        meta: card.primaryPhone,
      });
    }
    return items.slice(0, 8);
  }

  function buildEconomyFields(card) {
    const ltv = card?.lifetimeValue ?? card?.dealValue ?? card?.pipedriveDealValue;
    const visits = Number(card?.visitCount || card?.bookingCount || 0);
    const total = ltv != null ? formatSek(ltv) : '—';
    const avg =
      visits > 0 && Number(ltv) > 0
        ? formatSek(Number(ltv) / visits)
        : card?.avgVisitRevenue || '—';
    return [
      { label: 'Total intäkt', value: total },
      { label: 'Utestående', value: card?.outstandingBalance || '0 kr' },
      { label: 'Snitt/besök', value: avg },
      { label: 'Livstidsvärde', value: card?.lifetimeValueLabel || total },
    ];
  }

  function buildAiInsights(card) {
    return buildOperationalInsightCards(card);
  }

  function buildOperationalInsightCards(card) {
    const treatment =
      card?.nextBookingType ||
      card?.lastBookingType ||
      asArray(card?.treatmentTypes)[0] ||
      'behandlingen';
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    const signals = asArray(card?.automationSignals).filter((s) => s && s.status === 'active');
    const signalText = (sig) => {
      if (!sig || typeof sig !== 'object') return '';
      return sig.summary || sig.why || sig.message || sig.what || sig.label || '';
    };
    const signalAction = (sig) => {
      if (!sig || typeof sig !== 'object') return '';
      return sig.actionId || sig.action || '';
    };

    const defaults = [
      {
        icon: '↗',
        title: 'Behandlingsrespons',
        text:
          signalText(signals[0]) ||
          (visits > 0
            ? `God respons på ${treatment}. Fortsätt enligt plan.`
            : `Uppfölj ${treatment} efter första besök.`),
        action: signalAction(signals[0]) || '',
      },
      {
        icon: '♥',
        title: 'Retention',
        text:
          signalText(signals[1]) ||
          (visits > 3
            ? 'Hög lojalitet. Återkommer regelbundet.'
            : 'Bygg relation med regelbundna uppföljningar.'),
        action: signalAction(signals[1]) || '',
      },
      {
        icon: '↗',
        title: 'Nästa bästa steg',
        text:
          signalText(signals[2]) ||
          (card?.hasUpcomingBooking
            ? 'Bekräfta kommande tid och förbered formulär.'
            : 'Erbjud uppföljning vid nästa kontakt.'),
        action: signalAction(signals[2]) || 'book_suggestion',
      },
    ];

    return defaults;
  }

  /** @deprecated use buildOperationalInsightCards */
  function buildSynthesisAiInsights(card) {
    return buildOperationalInsightCards(card);
  }

  function commIcon(type) {
    if (type === 'sms') return '💬';
    if (type === 'call') return '📞';
    return '✉';
  }

  const DAY_NAMES = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const MONTH_SHORT = [
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
  const MONTH_SV = [
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

  function formatBookingWhen(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) {
      return { whenLong: '—', whenShort: '' };
    }
    const whenLong = `${d.getDate()} ${MONTH_SV[d.getMonth()]}`;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const whenShort = `${DAY_NAMES[d.getDay()]} ${hours}:${mins}`;
    return { whenLong, whenShort };
  }

  function formatFileDateLabel(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d
      .toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
      .replace(/\./g, '');
  }

  function fileIconForKind(cat, name) {
    const s = `${cat} ${name}`.toLowerCase();
    if (s.includes('photo') || s.includes('bild') || s.includes('image')) return '🖼️';
    if (s.includes('consent') || s.includes('samtycke') || s.includes('avtal')) return '✍️';
    if (s.includes('journal')) return '📋';
    if (s.includes('lab') || s.includes('aisia')) return '🧪';
    return '📄';
  }

  function treatmentAreaFromSub(sub) {
    const parts = String(sub || '')
      .split('·')
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    return parts.slice(0, -1).join(' · ') || parts[0];
  }

  function bookingParts(iso, title, sub, state, stateLabel, source) {
    const d = iso ? new Date(iso) : null;
    const valid = d && !Number.isNaN(d.getTime());
    const when = formatBookingWhen(iso);
    return {
      iso,
      whenLong: when.whenLong,
      whenShort: when.whenShort,
      day: valid ? DAY_NAMES[d.getDay()] : '—',
      num: valid ? String(d.getDate()) : '—',
      mon: valid ? MONTH_SHORT[d.getMonth()] : '',
      title: title || 'Besök',
      sub: sub || '',
      area: treatmentAreaFromSub(sub),
      state: state || 'planned',
      stateLabel: stateLabel || 'Planerad',
      source: source || resolveBookingSource(sub),
    };
  }

  function resolveBookingSource(label) {
    const s = String(label || '').toLowerCase();
    if (s.includes('fazli')) return 'fazli';
    if (s.includes('egzona')) return 'egzona';
    if (s.includes('info')) return 'info';
    return 'contact';
  }

  function staffFromSub(sub) {
    const parts = String(sub || '')
      .split('·')
      .map((x) => x.trim())
      .filter(Boolean);
    const staff = parts.length ? parts[parts.length - 1] : '';
    const nameParts = staff.split(/\s+/).filter(Boolean);
    const initials = nameParts
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const shortName =
      nameParts.length >= 2 ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.` : staff;
    return { staff, initials: initials || '—', shortName: shortName || '' };
  }

  function renderSynthesisBookingRow(b, extraAttrs = '') {
    const { staff, initials, shortName } = staffFromSub(b.sub);
    const source = b.source || resolveBookingSource(b.sub);
    const area = b.area || treatmentAreaFromSub(b.sub);
    const whenLong = b.whenLong || (b.num && b.mon ? `${b.num} ${b.mon.toLowerCase()}` : '—');
    const whenShort = b.whenShort || b.day || '';
    return `
      <button type="button" class="dossier-booking dossier-booking--synthesis" data-source="${escapeHtml(source)}" ${extraAttrs}>
        <div class="db-synth-when">
          <span class="db-synth-cal" aria-hidden="true">📅</span>
          <span class="db-synth-date">${escapeHtml(whenLong)}</span>
          ${whenShort ? `<span class="db-synth-time">${escapeHtml(whenShort)}</span>` : ''}
        </div>
        <div class="db-meta">
          <div class="db-title">${escapeHtml(b.title)}</div>
          ${area ? `<div class="db-sub">${escapeHtml(area)}</div>` : ''}
        </div>
        <div class="db-staff" title="${escapeHtml(staff)}">
          <span class="db-staff-avatar">${escapeHtml(initials)}</span>
          ${shortName ? `<span class="db-staff-name">${escapeHtml(shortName)}</span>` : ''}
        </div>
        ${
          b.stateLabel
            ? `<span class="db-synth-status" data-state="${escapeHtml(b.state || 'planned')}">${escapeHtml(b.stateLabel)}</span>`
            : ''
        }
        <span class="db-synth-chevron" aria-hidden="true">›</span>
      </button>`;
  }

  function renderBookingRow(b, extraAttrs) {
    if (isV9On()) {
      return renderSynthesisBookingRow(b, extraAttrs);
    }
    const { staff, initials } = staffFromSub(b.sub);
    const source = b.source || resolveBookingSource(b.sub);
    return `
      <div class="dossier-booking" data-source="${escapeHtml(source)}" ${extraAttrs || ''}>
        <div class="db-date"><div class="day">${escapeHtml(b.day)}</div><div class="num">${escapeHtml(b.num)}</div><div class="mon">${escapeHtml(b.mon)}</div></div>
        <div class="db-meta"><div class="db-title">${escapeHtml(b.title)}</div><div class="db-sub">${escapeHtml(b.sub)}</div></div>
        <span class="db-status" data-state="${escapeHtml(b.state)}">${escapeHtml(b.stateLabel)}</span>
        <div class="db-staff" title="${escapeHtml(staff)}"><span class="db-staff-avatar">${escapeHtml(initials)}</span></div>
      </div>`;
  }

  function buildUpcomingBookings(card, occasionTimeline) {
    const rows = [];
    if (card?.hasUpcomingBooking && card?.nextBookingAt) {
      const sub = [card.nextBookingType, card.nextBookingResourceLabel].filter(Boolean).join(' · ');
      const today = card.todayVisit === true;
      const tentative = card.nextBookingStatus === 'tentative';
      const missingForm = card.missingHealthDeclaration || card.missingForm;
      let state = 'ready';
      let stateLabel = today ? 'Idag' : '✓ Redo';
      if (tentative || missingForm) {
        state = 'warn';
        stateLabel = missingForm ? '⚠ Friskförs.' : 'Planerad';
      }
      rows.push(
        bookingParts(
          card.nextBookingAt,
          card.nextBookingType || 'Kommande besök',
          sub,
          state,
          stateLabel,
          resolveBookingSource(card.nextBookingResourceLabel)
        )
      );
    }
    for (const ev of asArray(occasionTimeline)) {
      const kind = String(ev.kind || ev.type || '').toLowerCase();
      if (!kind.includes('booking')) continue;
      const ts = ev.ts || ev.occurredAt;
      if (ts && Date.parse(ts) < Date.now()) continue;
      const staffLabel =
        ev.detail?.practitionerName || ev.practitionerName || ev.resourceLabel || '';
      const sub = [ev.summary || ev.detail?.treatment || '', staffLabel]
        .filter(Boolean)
        .join(' · ');
      rows.push(
        bookingParts(
          ts,
          ev.title || 'Bokning',
          sub,
          'warn',
          'Planerad',
          resolveBookingSource(staffLabel || sub)
        )
      );
    }
    const seen = new Set();
    return rows
      .filter((r) => {
        const key = r.iso || `${r.title}|${r.whenLong}|${r.whenShort}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }

  function buildHistoryBookings(card, occasionTimeline) {
    const rows = [];
    if (card?.lastVisitAt || card?.lastBookingAt) {
      const iso = card.lastVisitAt || card.lastBookingAt;
      rows.push(
        bookingParts(
          iso,
          card.lastBookingType || 'Senaste besök',
          card.nextBookingResourceLabel || '',
          'done',
          'Klar'
        )
      );
    }
    for (const ev of asArray(occasionTimeline)) {
      const kind = String(ev.kind || ev.type || '').toLowerCase();
      const isBookingKind = kind.includes('booking');
      const isVisitGroup = Boolean(ev.timelineKey || ev.timelineLabel || Number(ev.fileCount) > 0);
      if (!isBookingKind && !isVisitGroup) continue;
      const ts =
        ev.ts ||
        ev.occurredAt ||
        ev.capturedAt ||
        (ev.timelineSort && ev.timelineSort !== '0000-00-00' ? `${ev.timelineSort}T12:00:00` : '');
      if (ts && Date.parse(ts) > Date.now()) continue;
      const title =
        ev.title ||
        ev.label ||
        ev.timelineLabel ||
        ev.occasionLabel ||
        (isVisitGroup ? 'Besökstillfälle' : 'Historik');
      rows.push(bookingParts(ts, title, ev.summary || ev.capturedLabel || '', 'done', 'Klar'));
    }
    const seen = new Set();
    return rows
      .filter((r) => {
        const key = `${r.title}|${r.num}|${r.mon}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  function buildJournalPreviewEntries(journalEntries) {
    return [...asArray(journalEntries)]
      .sort((a, b) => {
        const ta = Date.parse(a.signedAt || a.updatedAt || a.createdAt || 0) || 0;
        const tb = Date.parse(b.signedAt || b.updatedAt || b.createdAt || 0) || 0;
        return tb - ta;
      })
      .slice(0, 5);
  }

  function journalEntryState(entry) {
    if (entry?.locked || entry?.signedAt) return 'signed';
    if (entry?.status === 'draft' || !entry?.signedAt) return 'draft';
    return 'open';
  }

  function renderJournalPreviewRow(entry) {
    const state = journalEntryState(entry);
    const title = entry.title || entry.journalType || entry.formKey || 'Journalpost';
    const snippet = normalizeNoteText(entry).slice(0, 140);
    const badge = state === 'draft' ? 'Utkast' : state === 'signed' ? 'Signerad' : 'Öppen';
    return `
      <div class="dossier-journal-row" data-journal-state="${escapeHtml(state)}">
        <div class="dossier-journal-title">${escapeHtml(title)}</div>
        ${snippet ? `<div class="dossier-journal-snippet">${escapeHtml(snippet)}</div>` : ''}
        <div class="dossier-journal-meta">${escapeHtml(formatNoteMeta(entry))} · ${escapeHtml(badge)}</div>
      </div>`;
  }

  function buildComplianceItems(card) {
    const items = [];
    const seen = new Set();
    const push = (tone, label, action) => {
      const key = label;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ tone, label, action });
    };

    const mod = global.CcoKunderSmartNextStep;
    const signals = mod?.sortSignals?.(card?.automationSignals || []) || [];
    for (const signal of signals) {
      if (signal.status !== 'active') continue;
      const tone = signal.risk || 'needs_review';
      if (!['blocker', 'legal_blocker', 'legal', 'needs_review'].includes(tone)) continue;
      push(tone, signal.what || signal.why || 'Compliance-ärende', 'form');
      if (items.length >= 5) break;
    }

    if (card?.missingHealthDeclaration) {
      push('blocker', 'Hälsodeklaration saknas', 'form');
    }
    if (card?.missingFitnessCertificate) {
      push('blocker', 'Friskförsäkran saknas', 'form');
    }
    if (card?.missingForm) {
      push('needs_review', 'Formulär saknas före besök', 'form');
    }
    if (card?.journalBlocked) {
      push('blocker', 'Journal spärrad', 'journal');
    }
    return items.slice(0, 5);
  }

  function daysUntilBooking(iso) {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return null;
    return Math.ceil((ts - Date.now()) / 86400000);
  }

  function resolveZone2OpenState(card, journalEntries) {
    const upcoming = buildUpcomingBookings(card, []);
    const days = daysUntilBooking(card?.nextBookingAt);
    const hasUpcomingSoon =
      upcoming.length > 0 && (days === null || days <= 14 || card?.hasUpcomingBooking);
    const compliance = buildComplianceItems(card);
    const entries = buildJournalPreviewEntries(journalEntries);
    const hasDraft = entries.some((e) => journalEntryState(e) === 'draft');
    const hasJournalFocus =
      hasDraft || Boolean(card?.todayVisit) || Boolean(global.__ARCANA_V9_JOURNAL_FOCUS__);
    const hasAiSignal = asArray(card?.automationSignals).some(
      (s) => s.status === 'active' && s.risk !== 'ready' && s.risk !== 'info'
    );
    return {
      compliance: compliance.length > 0 && (hasUpcomingSoon || (days !== null && days <= 3)),
      upcoming: hasUpcomingSoon,
      journal: hasJournalFocus || (entries.length > 0 && !hasUpcomingSoon),
      historik: !hasUpcomingSoon,
      filer: upcoming.length > 0 || hasJournalFocus,
      kommunikation: false,
      ekonomi: false,
      ai: hasAiSignal || asArray(card?.automationSignals).length > 0,
    };
  }

  function renderDossierSection(
    id,
    title,
    count,
    bodyHtml,
    open,
    { secondary = false, headLink = '' } = {}
  ) {
    const secondaryClass = secondary ? ' v9-dossier-section--secondary' : '';
    const linkHtml = headLink ? `<span class="dossier-section-link">${headLink}</span>` : '';
    return `
        <details class="dossier-section v9-dossier-section${secondaryClass}" data-v9-section="${escapeHtml(id)}" id="v9-section-${escapeHtml(id)}"${
          open ? ' open' : ''
        }>
          <summary>${escapeHtml(title)} <span class="count">${Number(count) || 0}</span>${linkHtml}</summary>
          ${bodyHtml}
        </details>`;
  }

  function countRealFiles(card, driveFiles) {
    const fs = card?.fileSummary || {};
    const summaryTotal = Number(fs.totalFiles) || 0;
    const driveTotal = asArray(driveFiles).length;
    return Math.max(summaryTotal, driveTotal);
  }

  function buildSynthesisFileTiles(card, driveFiles) {
    const fs = card?.fileSummary || {};
    const fallbackDate =
      formatFileDateLabel(card?.lastVisitAt || card?.lastBookingAt || card?.updatedAt) || '';
    const tiles = [];
    const push = (icon, name, badge, date) =>
      tiles.push({ icon, name, badge, date: date || fallbackDate });

    if (Number(fs.journalPdfs) > 0) push('📋', 'Journal-PDF', String(fs.journalPdfs));
    if (Number(fs.images) > 0) push('🖼️', 'Bilder', String(fs.images));
    const otherCount = Math.max(
      0,
      Number(fs.totalFiles || 0) - Number(fs.journalPdfs || 0) - Number(fs.images || 0)
    );
    if (otherCount > 0) push('📄', 'Övriga dokument', String(otherCount));

    for (const file of asArray(driveFiles)) {
      if (tiles.length >= 3) break;
      const rawName = file.originalFileName || file.fileName || file.name || '';
      const name = String(rawName).trim();
      if (!name || name.length > 42 || /\.(jpe?g|png|heic|webp|gif|tiff?)$/i.test(name)) continue;
      const cat = String(file.category || file.fileType || '').toLowerCase();
      const icon = fileIconForKind(cat, name);
      const date = formatFileDateLabel(
        file.documentDate || file.importedAt || file.createdAt || file.updatedAt
      );
      if (tiles.some((tile) => tile.name === name)) continue;
      push(icon, name.length > 24 ? `${name.slice(0, 22)}…` : name, file.status || '', date);
    }

    return tiles.slice(0, 3);
  }

  function renderSynthesisFileTile(file) {
    const shortName =
      String(file.name || 'Fil').length > 22 ? `${String(file.name).slice(0, 20)}…` : file.name;
    return `
      <button type="button" class="dossier-file dossier-file--synthesis" data-v9-section-link="filer">
        <span class="dossier-file-icon" aria-hidden="true">${file.icon}</span>
        <span class="dossier-file-copy">
          <span class="dossier-file-name">${escapeHtml(shortName)}</span>
          ${file.date ? `<span class="dossier-file-date">${escapeHtml(file.date)}</span>` : ''}
        </span>
        ${
          file.badge
            ? `<span class="dossier-file-badge">${escapeHtml(file.badge)}</span>`
            : `<span class="dossier-file-menu" aria-hidden="true">⋮</span>`
        }
      </button>`;
  }

  function renderSynthesisBlock(id, title, count, bodyHtml, { headLink = '' } = {}) {
    const linkHtml = headLink
      ? `<button type="button" class="v9-dossier-block__link" data-v9-section-link="${escapeHtml(id)}">${headLink}</button>`
      : '';
    return `
      <section class="v9-dossier-block" data-v9-section="${escapeHtml(id)}" id="v9-section-${escapeHtml(id)}">
        <header class="v9-dossier-block__head">
          <h3 class="v9-dossier-block__title">${escapeHtml(title)} <span class="count">${Number(count) || 0}</span></h3>
          ${linkHtml}
        </header>
        <div class="v9-dossier-block__body">${bodyHtml}</div>
      </section>`;
  }

  function renderSynthesisDossierScrollHtml(
    card,
    journalEntries,
    occasionTimeline,
    driveFiles,
    { synthesisOnly = false, v10Facit = false } = {}
  ) {
    const upcoming = buildUpcomingBookings(card, occasionTimeline);
    const history = buildHistoryBookings(card, occasionTimeline);
    const journalRows = buildJournalPreviewEntries(journalEntries);
    const realFileCount = countRealFiles(card, driveFiles);
    const files = buildSynthesisFileTiles(card, driveFiles);
    const comm = buildCommunicationItems(card, occasionTimeline);
    const economy = buildEconomyFields(card);
    const insights = buildOperationalInsightCards(card);
    const compliance = buildComplianceItems(card);

    const upcomingHtml = upcoming.length
      ? upcoming
          .map((b, i) => renderSynthesisBookingRow(b, i === 0 ? 'data-jump-current="1"' : ''))
          .join('')
      : '<p class="dossier-empty">Inga kommande bokningar.</p>';

    const filesHtml =
      asArray(driveFiles).length > 0
        ? renderV10DriveFilesHtml(driveFiles, card, { limit: 3 })
        : files.length
          ? `
      <div class="dossier-files dossier-files--synthesis">
        ${files.map((f) => renderSynthesisFileTile(f)).join('')}
      </div>`
          : '<p class="dossier-empty">Inga filer importerade ännu.</p>';

    const aiThemes = ['response', 'retention', 'next'];
    const aiHtml = `
      <div class="dossier-ai-grid">
        ${insights
          .map(
            (ins, i) => `
          <button type="button" class="dossier-insight dossier-insight--synthesis" data-v9-insight-idx="${i}" data-insight-theme="${escapeHtml(aiThemes[i] || 'next')}" data-insight-action="${escapeHtml(ins.action || '')}">
            <span class="dossier-insight__icon" aria-hidden="true">${escapeHtml(ins.icon || '•')}</span>
            <span class="dossier-insight__copy">
              <span class="dossier-insight__title">${escapeHtml(ins.title || 'Insikt')}</span>
              <span class="dossier-insight__body">${escapeHtml(ins.text)}</span>
            </span>
          </button>`
          )
          .join('')}
      </div>`;

    const journalHtml = journalRows.length
      ? `${journalRows.map((entry) => renderJournalPreviewRow(entry)).join('')}
          <button type="button" class="dossier-open-full" data-v9-open-journal-full>Öppna full journal</button>`
      : `<p class="dossier-empty">Ingen journal ännu.</p>
          <button type="button" class="dossier-open-full" data-v9-open-journal-full>Skapa journalpost</button>`;

    const historyHtml = history.length
      ? history.map((b) => renderSynthesisBookingRow(b)).join('')
      : '<p class="dossier-empty">Ingen historik ännu.</p>';

    const complianceHtml =
      compliance.length > 0
        ? compliance
            .map(
              (item) => `
            <button type="button" class="dossier-compliance-row" data-tone="${escapeHtml(item.tone)}" data-v9-compliance-action="${escapeHtml(item.action)}">
              <span class="dossier-compliance-label">${escapeHtml(item.label)}</span>
              <span class="dossier-compliance-go">Åtgärda</span>
            </button>`
            )
            .join('')
        : '<p class="dossier-empty">Alla formulär och krav är uppfyllda.</p>';

    const commHtml = comm.length
      ? comm
          .map(
            (c) => `
            <div class="dossier-comm">
              <div class="dossier-comm-icon" data-type="${escapeHtml(c.type)}">${commIcon(c.type)}</div>
              <div class="dossier-comm-body">
                <div class="dossier-comm-text">${escapeHtml(c.text)}</div>
                <div class="dossier-comm-meta">${escapeHtml(String(c.meta))}</div>
              </div>
            </div>`
          )
          .join('')
      : '<p class="dossier-empty">Ingen registrerad kommunikation.</p>';

    const economyHtml = `
      <div class="dossier-economy">
        ${economy
          .map(
            (m) => `
          <div class="dossier-money">
            <div class="dossier-money-label">${escapeHtml(m.label)}</div>
            <div class="dossier-money-value">${escapeHtml(m.value)}</div>
          </div>`
          )
          .join('')}
      </div>`;

    if (v10Facit) {
      const notes = buildSlideOverNotes(card, null);
      const notesHtml = renderSlideOverNotesHtml(notes);
      const v10FilesHtml =
        asArray(driveFiles).length > 0
          ? renderV10DriveFilesHtml(driveFiles, card)
          : files.length
            ? `
      <div class="dossier-files dossier-files--v10">
        ${files.map((f) => renderSynthesisFileTile(f)).join('')}
      </div>`
            : '<p class="dossier-empty">Inga filer importerade ännu.</p>';
      const v10AiHtml = insights.length
        ? insights
            .map(
              (ins, i) => `
          <div class="dossier-insight" data-insight-action="${escapeHtml(ins.action || '')}" data-insight-idx="${i}">
            <strong>${escapeHtml(ins.title || 'Insikt')}</strong> — ${escapeHtml(ins.text)}
          </div>`
            )
            .join('')
        : '<p class="dossier-empty">Inga AI-insikter ännu.</p>';

      return `
      <section class="v9-dossier-scroll v10-dossier-scroll dossier-scroll" data-v9-dossier-scroll aria-label="Kunddossiér">
        ${renderDossierSection('upcoming', 'Kommande bokningar', upcoming.length, upcomingHtml, true)}
        ${renderDossierSection('historik', 'Historik', history.length, historyHtml, false)}
        ${renderDossierSection('filer', 'Filer', realFileCount, v10FilesHtml, false)}
        ${renderDossierSection('anteckningar', 'Anteckningar', notes.length, notesHtml, false)}
        ${renderDossierSection('kontakt', 'Kommunikation', comm.length, commHtml, false)}
        ${renderDossierSection('ekonomi', 'Ekonomi', economy.length, economyHtml, false)}
        ${renderDossierSection('insikter', 'AI-insikter', insights.length, v10AiHtml, true)}
      </section>`;
    }

    const primary = [
      renderSynthesisBlock('upcoming', 'Kommande bokningar', upcoming.length, upcomingHtml, {
        headLink: upcoming.length > 0 ? 'Visa alla ›' : '',
      }),
      renderSynthesisBlock('filer', 'Filer', realFileCount, filesHtml, {
        headLink: realFileCount > 0 ? 'Visa alla ›' : '',
      }),
    ];

    if (!synthesisOnly) {
      primary.push(renderSynthesisBlock('insikter', 'Insikter', insights.length, aiHtml));
    }

    if (synthesisOnly) {
      return `
      <section class="v9-dossier-scroll v9-dossier-zone2 v9-dossier-zone2--synthesis" data-v9-dossier-scroll aria-label="Kunddossiér">
        ${primary.join('')}
      </section>`;
    }

    const secondarySections = [];
    if (compliance.length > 0) {
      secondarySections.push(
        renderDossierSection(
          'compliance',
          'Formulär & krav',
          compliance.length,
          complianceHtml,
          false
        )
      );
    }
    secondarySections.push(
      renderDossierSection('journal', 'Journal', journalRows.length, journalHtml, false),
      renderDossierSection('historik', 'Historik', history.length, historyHtml, false),
      renderDossierSection('kontakt', 'Kommunikation', comm.length, commHtml, false),
      renderDossierSection('ekonomi', 'Ekonomi', economy.length, economyHtml, false, {
        secondary: true,
      })
    );

    const moreHtml =
      secondarySections.length > 0
        ? `
      <details class="v9-dossier-more dossier-section v9-dossier-section">
        <summary>Mer i dossiér <span class="count">${secondarySections.length}</span></summary>
        ${secondarySections.join('')}
      </details>`
        : '';

    return `
      <section class="v9-dossier-scroll v9-dossier-zone2 v9-dossier-zone2--synthesis" data-v9-dossier-scroll aria-label="Kunddossiér">
        ${primary.join('')}
        ${moreHtml}
      </section>`;
  }

  function renderDossierScrollHtml(
    card,
    journalEntries,
    occasionTimeline,
    driveFiles,
    options = {}
  ) {
    if (!isV9On() || !card) return '';
    return renderSynthesisDossierScrollHtml(
      card,
      journalEntries,
      occasionTimeline,
      driveFiles,
      options
    );
  }

  function resolvePatientBrand(card) {
    const tenant = String(card?.tenantId || card?.brand || '').toLowerCase();
    const treatments = asArray(card?.treatmentTypes).join(' ').toLowerCase();
    if (
      tenant.includes('curatiio') ||
      treatments.includes('curatiio') ||
      treatments.includes('ögonlock') ||
      treatments.includes('ortoped')
    ) {
      return 'curatiio';
    }
    return 'hair_tp';
  }

  function buildZone3ContextPills(card) {
    const brand = resolvePatientBrand(card);
    const pills = [];
    const upcomingSoon =
      card?.hasUpcomingBooking &&
      (daysUntilBooking(card?.nextBookingAt) === null ||
        daysUntilBooking(card?.nextBookingAt) <= 14);

    const push = (id, label, { urgent = false, show = true } = {}) => {
      if (!show) return;
      pills.push({ id, label, urgent });
    };

    if (brand === 'curatiio') {
      push('health_bleph', 'Hälsodekl ögonlock', {
        urgent: Boolean(card?.missingHealthDeclaration || card?.missingForm),
        show: Boolean(card?.missingHealthDeclaration || card?.missingForm || upcomingSoon),
      });
      push('fitness_bleph', 'Friskförsäkran', {
        urgent: Boolean(card?.missingFitnessCertificate),
        show: Boolean(card?.missingFitnessCertificate || upcomingSoon),
      });
      push('consent', 'Samtycke', { show: upcomingSoon || card?.missingForm });
      push('agreement', 'Avtal', { show: upcomingSoon });
    } else {
      push('health_tp', 'Hälsodekl TP', {
        urgent: Boolean(card?.missingHealthDeclaration),
        show: Boolean(card?.missingHealthDeclaration || upcomingSoon),
      });
      push('fitness_tp', 'Friskförsäkran', {
        urgent: Boolean(card?.missingFitnessCertificate),
        show: Boolean(card?.missingFitnessCertificate || upcomingSoon),
      });
      push('plan', 'Behandlingsplan', { show: upcomingSoon });
      push('consent', 'Samtycke', { show: upcomingSoon });
      push('agreement', 'Avtal', { show: upcomingSoon });
    }

    return pills.slice(0, 4);
  }

  function formatShortBookingDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  const INTEL_TONE_ORDER = { next: 0, coming: 1, future: 2, done: 3, neutral: 4 };

  function normalizeIntelText(value) {
    return String(value ?? '').trim();
  }

  function journalEntryDate(entry) {
    return (
      normalizeIntelText(entry?.signedAt) ||
      normalizeIntelText(entry?.updatedAt) ||
      normalizeIntelText(entry?.createdAt) ||
      ''
    );
  }

  function journalHasType(entries, journalType, { locked = false } = {}) {
    return asArray(entries).some((entry) => {
      if (entry?.journalType !== journalType) return false;
      return locked ? Boolean(entry.locked) : true;
    });
  }

  function clinicalFormState(entries, formKey) {
    const rows = asArray(entries).filter((entry) => {
      const key = normalizeIntelText(
        entry?.clinicalFormKey || entry?.formKey || entry?.metadata?.clinicalFormKey
      );
      return key === formKey;
    });
    if (rows.some((entry) => entry.locked)) return 'done';
    if (rows.length) return 'coming';
    return 'open';
  }

  function followUpState(entries, variant, { hasTpJournal, lastVisitIso } = {}) {
    if (
      journalHasType(entries, 'follow_up', { locked: true }) &&
      asArray(entries).some(
        (entry) =>
          entry.journalType === 'follow_up' &&
          normalizeIntelText(entry.formVariant) === variant &&
          entry.locked
      )
    ) {
      return 'done';
    }
    if (
      asArray(entries).some(
        (entry) =>
          entry.journalType === 'follow_up' && normalizeIntelText(entry.formVariant) === variant
      )
    ) {
      return 'coming';
    }
    if (!hasTpJournal) return 'future';
    const months = monthsSinceIso(lastVisitIso);
    const thresholds = { '4_manader': 4, '6_manader': 6, '12_manader': 12 };
    const threshold = thresholds[variant];
    if (months == null || threshold == null) return 'future';
    if (months >= threshold - 0.5) return 'coming';
    if (months >= threshold - 1) return 'future';
    return 'future';
  }

  function monthsSinceIso(iso) {
    const ms = Date.parse(normalizeIntelText(iso));
    if (!Number.isFinite(ms)) return null;
    return (Date.now() - ms) / (30.44 * 24 * 60 * 60 * 1000);
  }

  function findConsultationPlan(entries) {
    const rows = asArray(entries);
    return (
      rows.find((entry) => entry.journalType === 'consultation_plan' && entry.canEdit) ||
      rows.find((entry) => entry.journalType === 'consultation_plan') ||
      null
    );
  }

  function planPhotosAnnotated(planEntry) {
    if (!planEntry) return false;
    return asArray(planEntry.attachments).some(
      (item) => item.type === 'consultation_photo' && item.hasAnnotation
    );
  }

  function resolveIntelHint() {
    return 'Ta bild direkt i konsultationen, markera zoner och skapa offert här.';
  }

  /* ORD-25 Fas B — v11 hero (render-path ägs här) */

  function resolveV11DisplayName(card) {
    return (
      card?.displayName ||
      card?.name ||
      [card?.firstName, card?.lastName].filter(Boolean).join(' ') ||
      card?.patientId ||
      'Okänd kund'
    );
  }

  function resolveV11Monogram(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }
    return String(name || '??')
      .slice(0, 2)
      .toUpperCase();
  }

  function resolveV11ContactMeta(card) {
    const email = card?.emailMasked || card?.primaryEmail || '';
    const phone = card?.phoneMasked || card?.primaryPhone || '';
    const parts = [];
    if (email) parts.push(email);
    if (phone) parts.push(phone);
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    if (visits > 0) parts.push(`${visits} besök`);
    if (card?.lastVisitAt) parts.push(`Senast ${String(card.lastVisitAt).slice(0, 10)}`);
    return parts.length ? parts.join(' · ') : 'Kontakt saknas';
  }

  function parseV11NoteField(note, keys) {
    const text = String(note || '');
    for (const key of keys) {
      const match = text.match(new RegExp(`${key}\\s*[:.]\\s*([^\\n|]+)`, 'i'));
      if (match) return match[1].trim();
    }
    return '';
  }

  function buildV11MedicalBriefingModel(card) {
    const allergies = asArray(card?.allergies || card?.demographics?.allergies)
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.label))
      .filter(Boolean);
    const note = card?.importantNote || card?.demographics?.importantNote || '';
    const mediciner =
      asArray(card?.medications)
        .map((item) => (typeof item === 'string' ? item : item?.name || item?.label))
        .filter(Boolean)
        .join(', ') ||
      parseV11NoteField(note, ['medicin', 'mediciner']) ||
      '—';
    const diagnoser =
      asArray(card?.diagnoses)
        .map((item) => (typeof item === 'string' ? item : item?.name || item?.label))
        .filter(Boolean)
        .join(', ') ||
      parseV11NoteField(note, ['diagnos', 'diagnoser']) ||
      '—';
    const allergier =
      allergies.join(', ') || parseV11NoteField(note, ['allergi', 'allergier']) || 'Ingen känd';
    let ovrigt = parseV11NoteField(note, ['övrigt', 'ovrigt', 'notering']);
    if (!ovrigt && note && !parseV11NoteField(note, ['allergi', 'allergier'])) {
      ovrigt = note.length > 96 ? `${note.slice(0, 93)}…` : note;
    }
    if (!ovrigt) ovrigt = '—';
    return { allergier, mediciner, diagnoser, ovrigt };
  }

  function buildV11HeroPills(card) {
    const pills = [];
    const add = (tone, label) => {
      if (!label || pills.some((item) => item.label === label)) return;
      pills.push({ tone, label });
    };
    if (card?.isVip) add('lila', 'VIP');
    const typeBlob = [
      ...asArray(card?.treatmentTypes),
      card?.nextBookingType,
      card?.lastBookingType,
    ]
      .join(' ')
      .toLowerCase();
    if (typeBlob.includes('prp')) add('gron', 'PRP-kur');
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    if (visits >= 3) add('gron', 'Hög lojalitet');
    else if (card?.segmentHints?.active || card?.hasJournal) add('lila', 'Aktiv kund');
    else if (card?.hasUpcomingBooking) add('lila', 'Kommande besök');
    return pills.slice(0, 3);
  }

  function resolveV11HeroStats(card) {
    let visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    if (!visits && card?.lastVisitAt) visits = 1;
    const ltv = card?.lifetimeValue ?? card?.dealValue ?? card?.pipedriveDealValue;
    const noShows = Number(card?.noShowCount ?? 0);
    const hasLtv = ltv != null && Number(ltv) > 0;
    const visitTrend = card?.lastVisitAt
      ? `Senast ${String(card.lastVisitAt).slice(0, 10)}`
      : visits > 0
        ? `${visits} registrerade`
        : 'Inga besök';
    const revenueTrend = hasLtv
      ? card?.lifetimeValueLabel || 'Livstidsvärde'
      : card?.pipedriveLinked
        ? 'Pipedrive-kopplad'
        : '—';
    return {
      visits,
      visitTrend,
      revenue: hasLtv ? formatSek(ltv) : '—',
      revenueTrend,
      noShows,
      heroLine:
        noShows === 0
          ? `${noShows} no-shows · Klockren · Topp 5%`
          : `${noShows} no-show${noShows === 1 ? '' : 's'} · Uppfölj`,
    };
  }

  function renderV11Hairstrand() {
    return '<div class="v11-hairstrand" role="presentation" aria-hidden="true"></div>';
  }

  function renderV11MedicalBriefing(card) {
    const model = buildV11MedicalBriefingModel(card);
    const cells = [
      { label: 'Allergier', value: model.allergier },
      { label: 'Mediciner', value: model.mediciner },
      { label: 'Diagnoser', value: model.diagnoser },
      { label: 'Övrigt', value: model.ovrigt },
    ];
    return `
      <section class="v11-medical-briefing" data-v11-medical-briefing aria-label="Medicinsk briefing">
        <div class="v11-medical-briefing__grid">
          ${cells
            .map(
              (cell) => `
            <div class="v11-medical-briefing__cell">
              <div class="v11-medical-briefing__label">${escapeHtml(cell.label)}</div>
              <div class="v11-medical-briefing__value">${escapeHtml(cell.value)}</div>
            </div>`
            )
            .join('')}
        </div>
      </section>`;
  }

  function renderV11StatRow(card) {
    const stats = resolveV11HeroStats(card);
    return `
      <div class="v11-stat-row" data-v11-stat-row>
        <button type="button" class="v11-stat-row__hero dossier-stat dossier-stat--jump" data-v9-stat-jump="historik" title="Visa historik">
          <span class="v11-stat-row__hero-halo" aria-hidden="true"></span>
          <span class="v11-stat-row__hero-value">${escapeHtml(stats.heroLine)}</span>
        </button>
        <button type="button" class="v11-stat-row__sub dossier-stat dossier-stat--jump" data-v9-stat-jump="historik" title="Visa besök">
          <span class="v11-stat-row__sub-label">Besök</span>
          <span class="v11-stat-row__sub-value">${escapeHtml(String(stats.visits))}</span>
          <span class="v11-stat-row__sub-trend">${escapeHtml(stats.visitTrend)}</span>
        </button>
        <button type="button" class="v11-stat-row__sub dossier-stat dossier-stat--jump" data-v9-stat-jump="ekonomi" title="Visa intäkt">
          <span class="v11-stat-row__sub-label">Intäkt</span>
          <span class="v11-stat-row__sub-value">${escapeHtml(stats.revenue)}</span>
          <span class="v11-stat-row__sub-trend">${escapeHtml(stats.revenueTrend)}</span>
        </button>
      </div>`;
  }

  function renderKundkortSlideOverHead(card, { loading = false } = {}) {
    if (!card) return '';
    const name = resolveV11DisplayName(card);
    const meta = resolveV11ContactMeta(card);
    const pills = buildV11HeroPills(card);
    const monogram = resolveV11Monogram(name);

    return `
      <header class="kundkort-slide-over__head v11-hero-head dossier-head" data-kundkort-slide-head${loading ? ' aria-busy="true"' : ''}>
        <div class="v11-hero-avatar dossier-avatar" aria-hidden="true">
          <span class="v11-hero-avatar__ring"></span>
          <span class="v11-hero-avatar__monogram">${escapeHtml(monogram)}</span>
        </div>
        <div class="v11-hero-identity dossier-head-body">
          <nav class="v9-dossier-crumb" aria-label="Dossiér-navigering">
            <button type="button" class="v9-dossier-crumb__back" data-v9-nav-back aria-label="Tillbaka till kundlistan">‹ Kunder</button>
            <span class="v9-dossier-crumb__sep" aria-hidden="true">/</span>
          </nav>
          <div class="v11-hero-kicker dossier-kicker">Kunddossiér</div>
          <h2 class="v11-hero-name dossier-name v9-dossier-crumb__who">${escapeHtml(name)}</h2>
          <div class="v11-hero-meta dossier-contact">${escapeHtml(meta)}</div>
          ${
            pills.length
              ? `<div class="v11-hero-pills dossier-tags">${pills
                  .map(
                    (pill) =>
                      `<span class="v11-hero-pill dossier-tag dossier-tag--${escapeHtml(pill.tone)} v11-hero-pill--${escapeHtml(pill.tone)}">${escapeHtml(pill.label)}</span>`
                  )
                  .join('')}</div>`
              : ''
          }
        </div>
        <button type="button" class="dossier-close" data-v9-dossier-close title="Stäng dossiér" aria-label="Stäng dossiér">×</button>
      </header>`;
  }

  function renderV11Hero(card, journalEntries = [], { loading = false } = {}) {
    if (!card) return '';
    const name = resolveV11DisplayName(card);
    const meta = resolveV11ContactMeta(card);
    const pills = buildV11HeroPills(card);
    const monogram = resolveV11Monogram(name);

    return `
      <div class="v9-dossier-zone1" data-v9-zone1>
        <div class="v9-dossier-hero v11-dossier-hero" data-v9-dossier-hero data-v11-hero${loading ? ' aria-busy="true"' : ''}>
          <div class="v11-hero-head dossier-head">
            <div class="v11-hero-avatar dossier-avatar" aria-hidden="true">
              <span class="v11-hero-avatar__ring"></span>
              <span class="v11-hero-avatar__monogram">${escapeHtml(monogram)}</span>
            </div>
            <div class="v11-hero-identity dossier-head-body">
              <nav class="v9-dossier-crumb" aria-label="Dossiér-navigering">
                <button type="button" class="v9-dossier-crumb__back" data-v9-nav-back aria-label="Tillbaka till kundlistan">‹ Kunder</button>
                <span class="v9-dossier-crumb__sep" aria-hidden="true">/</span>
              </nav>
              <div class="v11-hero-kicker dossier-kicker">Kunddossiér</div>
              <h2 class="v11-hero-name dossier-name v9-dossier-crumb__who">${escapeHtml(name)}</h2>
              <div class="v11-hero-meta dossier-contact">${escapeHtml(meta)}</div>
              ${
                pills.length
                  ? `<div class="v11-hero-pills dossier-tags">${pills
                      .map(
                        (pill) =>
                          `<span class="v11-hero-pill dossier-tag dossier-tag--${escapeHtml(pill.tone)} v11-hero-pill--${escapeHtml(pill.tone)}">${escapeHtml(pill.label)}</span>`
                      )
                      .join('')}</div>`
                  : ''
              }
            </div>
            <button type="button" class="dossier-close" data-v9-dossier-close title="Stäng dossiér" aria-label="Stäng dossiér">×</button>
          </div>
          ${renderV11MedicalBriefing(card)}
          ${renderV11StatRow(card)}
        </div>
      </div>`;
  }

  function buildIntelligentJourneyBubbles(card, journalEntries) {
    const entries = asArray(journalEntries);
    const brand = resolvePatientBrand(card);
    const upcoming = Boolean(card?.hasUpcomingBooking);
    const upcomingSoon =
      upcoming &&
      (daysUntilBooking(card?.nextBookingAt) == null ||
        daysUntilBooking(card?.nextBookingAt) <= 21);
    const treatmentTypes = asArray(card?.treatmentTypes).map((value) =>
      String(value).toLowerCase()
    );
    const nextType = String(card?.nextBookingType || '').toLowerCase();
    const planEntry = findConsultationPlan(entries);
    const planLocked = Boolean(planEntry?.locked);
    const photosDone = planPhotosAnnotated(planEntry);
    const healthSigned =
      journalHasType(entries, 'health_declaration', { locked: true }) ||
      Boolean(card?.hasForm && !card?.missingHealthDeclaration && !card?.missingForm);
    const healthDraft = journalHasType(entries, 'health_declaration') && !healthSigned;
    const missingHealth = Boolean(card?.missingHealthDeclaration || card?.missingForm);
    const missingFitness = Boolean(card?.missingFitnessCertificate);
    const fitnessSigned =
      journalHasType(entries, 'fitness_certificate', { locked: true }) ||
      Boolean(card?.fitnessSigned);
    const hasTpJournal = journalHasType(entries, 'tp_treatment');
    const hasTpLocked = journalHasType(entries, 'tp_treatment', { locked: true });
    const hasPrpJournal = journalHasType(entries, 'prp_treatment');
    const hasBlephJournal = journalHasType(entries, 'bleph_treatment');
    const hasHistoricalImport = journalHasType(entries, 'historical_import');
    const lastVisitIso =
      card?.lastVisitAt || card?.lastBookingAt || entries.map(journalEntryDate).sort().pop() || '';

    const toneHealth = () => {
      if (healthSigned) return 'done';
      if (upcomingSoon || missingHealth) return 'next';
      if (healthDraft || upcoming) return 'coming';
      return 'neutral';
    };

    const toneFitness = () => {
      if (fitnessSigned) return 'done';
      if ((upcomingSoon && healthSigned) || missingFitness) return 'next';
      if (upcoming) return 'coming';
      return 'neutral';
    };

    const tonePlan = () => {
      if (planLocked) return 'done';
      if (healthSigned && !planEntry) return 'next';
      if (healthDraft || (upcomingSoon && !planEntry)) return 'coming';
      return 'neutral';
    };

    const tonePhoto = () => {
      if (photosDone) return 'done';
      if (planEntry && !photosDone) return 'next';
      if (upcomingSoon && !photosDone) return 'next';
      if (upcomingSoon) return 'coming';
      return 'neutral';
    };

    const toneJournal = (hasJournal, { afterTp = false, treatmentHint = '' } = {}) => {
      if (hasJournal) return 'done';
      const hint = treatmentHint.toLowerCase();
      if (
        upcomingSoon &&
        (treatmentTypes.some((type) => hint && type.includes(hint)) ||
          (hint && nextType.includes(hint)))
      ) {
        return 'next';
      }
      if (upcoming || treatmentTypes.some((type) => hint && type.includes(hint))) return 'coming';
      if (afterTp && hasTpLocked) return 'coming';
      return 'future';
    };

    const toneClinical = (formKey) => {
      const state = clinicalFormState(entries, formKey);
      if (state === 'done') return 'done';
      if (state === 'coming') return 'coming';
      if (brand === 'curatiio' && (upcomingSoon || missingHealth)) return 'next';
      return brand === 'curatiio' ? 'future' : 'neutral';
    };

    const bubbles = [
      {
        id: 'photo',
        label: 'Ta bild',
        tone: tonePhoto(),
        kind: 'camera',
        disabled: Boolean(card?.journalBlocked || planLocked),
      },
      {
        id: 'gallery',
        label: 'Välj från galleri',
        tone: tonePhoto(),
        kind: 'gallery',
        disabled: Boolean(card?.journalBlocked || planLocked),
      },
      {
        id: 'plan',
        label: 'Behandlingsplan',
        tone: tonePlan(),
        action: 'new-consultation-plan',
        disabled: !healthSigned || Boolean(card?.journalBlocked),
      },
      {
        id: 'import',
        label: 'Importera historik',
        tone: hasHistoricalImport ? 'done' : 'neutral',
        action: 'import-historical',
        disabled: Boolean(card?.journalBlocked),
      },
      {
        id: 'health_tp',
        label: 'Hälsodekl TP',
        tone: brand === 'hair_tp' ? toneHealth() : healthSigned ? 'done' : 'neutral',
        action: 'new-health-declaration',
        show: brand === 'hair_tp' || healthSigned || healthDraft,
      },
      {
        id: 'health_bleph',
        label: 'Hälsodekl ögonlock',
        tone: toneClinical('health_curatiio_bleph'),
        action: 'new-clinical-form',
        clinicalFormKey: 'health_curatiio_bleph',
        show:
          brand === 'curatiio' || clinicalFormState(entries, 'health_curatiio_bleph') !== 'open',
      },
      {
        id: 'health_ortho',
        label: 'Hälsodekl ortopedi',
        tone: toneClinical('health_curatiio_ortho'),
        action: 'new-clinical-form',
        clinicalFormKey: 'health_curatiio_ortho',
        show:
          brand === 'curatiio' || clinicalFormState(entries, 'health_curatiio_ortho') !== 'open',
      },
      {
        id: 'health_injection',
        label: 'Hälsodekl injektion',
        tone: toneClinical('health_curatiio_injection'),
        action: 'new-clinical-form',
        clinicalFormKey: 'health_curatiio_injection',
        show:
          brand === 'curatiio' ||
          clinicalFormState(entries, 'health_curatiio_injection') !== 'open',
      },
      {
        id: 'health_eng',
        label: 'Hälsodekl ENG',
        tone: toneClinical('health_eng'),
        action: 'new-clinical-form',
        clinicalFormKey: 'health_eng',
      },
      {
        id: 'fitness_tp',
        label: 'Friskförsäkran TP',
        tone: brand === 'hair_tp' ? toneFitness() : fitnessSigned ? 'done' : 'neutral',
        action: 'new-fitness-certificate',
        show: brand === 'hair_tp' || fitnessSigned,
      },
      {
        id: 'fitness_bleph',
        label: 'Friskförsäkran ögonlock',
        tone: toneClinical('fitness_curatiio_bleph'),
        action: 'new-clinical-form',
        clinicalFormKey: 'fitness_curatiio_bleph',
        show:
          brand === 'curatiio' || clinicalFormState(entries, 'fitness_curatiio_bleph') !== 'open',
      },
      {
        id: 'tp_journal',
        label: 'TP-journal',
        tone: toneJournal(hasTpJournal, { treatmentHint: 'fue' }),
        action: 'new-tp-journal',
        show: brand === 'hair_tp' || hasTpJournal,
      },
      {
        id: 'prp_journal',
        label: 'PRP-journal',
        tone: toneJournal(hasPrpJournal, { treatmentHint: 'prp' }),
        action: 'new-prp-journal',
        prpFormVariant: 'prp_skin',
        show: brand === 'hair_tp' || hasPrpJournal || treatmentTypes.includes('prp'),
      },
      {
        id: 'prp_post_tp',
        label: 'PRP efter TP',
        tone: hasPrpJournal ? 'done' : hasTpLocked ? (upcomingSoon ? 'next' : 'coming') : 'future',
        action: 'new-prp-journal',
        prpFormVariant: 'tp_post_op',
        show: brand === 'hair_tp' || hasTpLocked || hasPrpJournal,
      },
      {
        id: 'follow_4',
        label: 'Uppföljning 4 mån',
        tone: followUpState(entries, '4_manader', { hasTpJournal: hasTpLocked, lastVisitIso }),
        action: 'new-follow-up-journal',
        followFormVariant: '4_manader',
        show: brand === 'hair_tp' || hasTpLocked,
      },
      {
        id: 'follow_6',
        label: 'Uppföljning 6 mån',
        tone: followUpState(entries, '6_manader', { hasTpJournal: hasTpLocked, lastVisitIso }),
        action: 'new-follow-up-journal',
        followFormVariant: '6_manader',
        show: brand === 'hair_tp' || hasTpLocked,
      },
      {
        id: 'follow_12',
        label: 'Uppföljning 12 mån',
        tone: followUpState(entries, '12_manader', { hasTpJournal: hasTpLocked, lastVisitIso }),
        action: 'new-follow-up-journal',
        followFormVariant: '12_manader',
        show: brand === 'hair_tp' || hasTpLocked,
      },
      {
        id: 'bleph_journal',
        label: 'Ögonlocksjournal',
        tone: toneJournal(hasBlephJournal, { treatmentHint: 'curatiio' }),
        action: 'new-bleph-journal',
        show: brand === 'curatiio' || hasBlephJournal,
      },
    ].filter((bubble) => bubble.show !== false);

    bubbles.sort(
      (left, right) =>
        (INTEL_TONE_ORDER[left.tone] ?? 9) - (INTEL_TONE_ORDER[right.tone] ?? 9) ||
        left.label.localeCompare(right.label, 'sv')
    );

    return {
      bubbles,
      lead: resolveIntelHint(),
      footer: !healthSigned ? 'Signera hälsodeklarationen innan du skapar behandlingsplan.' : '',
    };
  }

  const INTEL_TONE_LABELS = {
    next: 'Nästa steg',
    coming: 'På gång',
    done: 'Klart',
    future: 'Planerat framåt',
    neutral: 'Ej påbörjat',
  };

  const INTEL_BUBBLE_ICONS = {
    photo: '📷',
    gallery: '🖼',
    plan: '📝',
    import: '📥',
    health_tp: '📋',
    health_bleph: '📋',
    health_ortho: '📋',
    health_injection: '📋',
    health_eng: '📋',
    fitness_tp: '✓',
    fitness_bleph: '✓',
    tp_journal: '✎',
    prp_journal: '💧',
    prp_post_tp: '💧',
    follow_4: '↗',
    follow_6: '↗',
    follow_12: '↗',
    bleph_journal: '✎',
  };

  function resolveIntelToneTheme(tone) {
    if (tone === 'next') return 'next';
    if (tone === 'coming') return 'coming';
    if (tone === 'done') return 'retention';
    if (tone === 'future') return 'response';
    return 'neutral';
  }

  function resolveIntelBubbleIcon(bubble) {
    return INTEL_BUBBLE_ICONS[bubble?.id] || '●';
  }

  function resolveIntelBubbleBody(bubble) {
    const tone = bubble?.tone || 'neutral';
    if (tone === 'next') return `${bubble.label} behöver göras som nästa steg i kundresan.`;
    if (tone === 'coming') return `${bubble.label} ligger på tur efter nuvarande steg.`;
    if (tone === 'done') return `${bubble.label} är signerad eller klar i CCO.`;
    if (tone === 'future') return `${bubble.label} är planerad längre fram i behandlingsresan.`;
    return `${bubble.label} är ännu inte påbörjad.`;
  }

  function buildIntelFeaturedCards(card, journalEntries) {
    const { bubbles } = buildIntelligentJourneyBubbles(card, journalEntries);
    const journeyCards = bubbles
      .filter((bubble) => bubble.tone === 'next' || bubble.tone === 'coming')
      .slice(0, 2)
      .map((bubble) => ({
        kind: 'journey',
        id: bubble.id,
        bubble,
        icon: resolveIntelBubbleIcon(bubble),
        title: bubble.label,
        body: resolveIntelBubbleBody(bubble),
        theme: resolveIntelToneTheme(bubble.tone),
        tone: bubble.tone,
      }));

    const signalCards = buildOperationalInsightCards(card).map((ins, index) => ({
      kind: 'signal',
      id: `signal-${index}`,
      icon: ins.icon || '•',
      title: ins.title || 'Insikt',
      body: ins.text || '',
      theme: ['response', 'retention', 'next'][index] || 'next',
      action: ins.action || '',
    }));

    const merged = [...journeyCards];
    for (const signalCard of signalCards) {
      if (merged.length >= 3) break;
      merged.push(signalCard);
    }
    return merged.slice(0, 3);
  }

  function renderIntelFeaturedCard(featured, index) {
    return `
      <button
        type="button"
        class="dossier-insight dossier-insight--synthesis v9-intel-card"
        data-v9-intel-card="${escapeHtml(featured.id)}"
        data-v9-intel-kind="${escapeHtml(featured.kind)}"
        data-insight-theme="${escapeHtml(featured.theme || 'next')}"
        data-v9-intel-idx="${index}"
      >
        <span class="dossier-insight__icon" aria-hidden="true">${escapeHtml(featured.icon || '•')}</span>
        <span class="dossier-insight__copy">
          <span class="dossier-insight__title">${escapeHtml(featured.title || '')}</span>
          <span class="dossier-insight__body">${escapeHtml(featured.body || '')}</span>
        </span>
      </button>`;
  }

  function renderIntelDrawerStep(bubble) {
    const tone = bubble.tone || 'neutral';
    const toneLabel = INTEL_TONE_LABELS[tone] || '';
    const disabled = bubble.disabled ? ' is-disabled' : '';
    const disabledAttr = bubble.disabled ? ' disabled aria-disabled="true"' : '';

    const actionAttrs = [];
    if (bubble.action) actionAttrs.push(`data-patient-action="${escapeHtml(bubble.action)}"`);
    if (bubble.clinicalFormKey) {
      actionAttrs.push(`data-clinical-form-key="${escapeHtml(bubble.clinicalFormKey)}"`);
    }
    if (bubble.prpFormVariant) {
      actionAttrs.push(`data-prp-form-variant="${escapeHtml(bubble.prpFormVariant)}"`);
    }
    if (bubble.followFormVariant) {
      actionAttrs.push(`data-follow-form-variant="${escapeHtml(bubble.followFormVariant)}"`);
    }

    if (bubble.kind === 'camera') {
      return `
        <label class="v9-intel-drawer-step v9-intel-drawer-step--${tone}${disabled}" data-v9-intel-id="${escapeHtml(bubble.id)}">
          <span class="v9-intel-drawer-step__icon">${escapeHtml(resolveIntelBubbleIcon(bubble))}</span>
          <span class="v9-intel-drawer-step__copy">
            <span class="v9-intel-drawer-step__title">${escapeHtml(bubble.label)}</span>
            <span class="v9-intel-drawer-step__meta">${escapeHtml(toneLabel)} · ${escapeHtml(resolveIntelBubbleBody(bubble))}</span>
          </span>
          <span class="v9-intel-drawer-step__go">Ta bild</span>
          <input type="file" accept="image/*" capture="environment" hidden data-patient-photo-camera${bubble.disabled ? ' disabled' : ''} />
        </label>`;
    }

    if (bubble.kind === 'gallery') {
      return `
        <label class="v9-intel-drawer-step v9-intel-drawer-step--${tone}${disabled}" data-v9-intel-id="${escapeHtml(bubble.id)}">
          <span class="v9-intel-drawer-step__icon">${escapeHtml(resolveIntelBubbleIcon(bubble))}</span>
          <span class="v9-intel-drawer-step__copy">
            <span class="v9-intel-drawer-step__title">${escapeHtml(bubble.label)}</span>
            <span class="v9-intel-drawer-step__meta">${escapeHtml(toneLabel)} · ${escapeHtml(resolveIntelBubbleBody(bubble))}</span>
          </span>
          <span class="v9-intel-drawer-step__go">Välj</span>
          <input type="file" accept="image/*,.heic,.heif" multiple hidden data-patient-photo-gallery${bubble.disabled ? ' disabled' : ''} />
        </label>`;
    }

    return `
      <button
        type="button"
        class="v9-intel-drawer-step v9-intel-drawer-step--${tone}${disabled}"
        data-v9-intel-id="${escapeHtml(bubble.id)}"
        ${actionAttrs.join(' ')}${disabledAttr}
      >
        <span class="v9-intel-drawer-step__icon">${escapeHtml(resolveIntelBubbleIcon(bubble))}</span>
        <span class="v9-intel-drawer-step__copy">
          <span class="v9-intel-drawer-step__title">${escapeHtml(bubble.label)}</span>
          <span class="v9-intel-drawer-step__meta">${escapeHtml(toneLabel)} · ${escapeHtml(resolveIntelBubbleBody(bubble))}</span>
        </span>
        <span class="v9-intel-drawer-step__go">Öppna</span>
      </button>`;
  }

  function renderIntelDrawerBodyHtml(state) {
    const { title, intro, bubbles, focusId } = state;
    const steps = asArray(bubbles)
      .map(
        (bubble) =>
          `<div class="v9-intel-drawer-step-wrap${bubble.id === focusId ? ' is-focused' : ''}">${renderIntelDrawerStep(bubble)}</div>`
      )
      .join('');

    return `
      <p class="v9-intel-drawer__intro">${escapeHtml(intro || '')}</p>
      <div class="v9-intel-drawer__steps" data-v9-intel-drawer-steps>
        ${steps}
      </div>`;
  }

  function renderIntelChromeActionsHtml(card) {
    const upcoming = buildUpcomingBookings(card, []);
    const upcomingCount = upcoming.length;
    const nextDate = formatShortBookingDate(card?.nextBookingAt);
    const bookLabel = card?.nextBookingAt
      ? `Boka nästa ${card.nextBookingType || 'PRP'}${nextDate ? ` (${nextDate})` : ''}`
      : 'Boka nästa tid';
    const confirmDisabled = upcomingCount === 0;

    return `
      <div class="v9-intel-actions dossier-actions v9-dossier-actions" data-v9-intel-actions>
        <button type="button" class="quick-pill dossier-camera-cta full" data-v9-intel-action="photo">📷 Ta bild</button>
        <button type="button" class="quick-pill quick-pill--ai full" data-v9-intel-action="book">${escapeHtml(bookLabel)}</button>
        <button
          type="button"
          class="quick-pill quick-pill--success full${confirmDisabled ? ' is-disabled' : ''}"
          data-v9-intel-action="confirm"
          ${confirmDisabled ? 'disabled aria-disabled="true"' : ''}
        >✓ Bekräfta tider (${upcomingCount})</button>
      </div>`;
  }

  function renderIntelChromeActionsHtml(card) {
    const upcoming = buildUpcomingBookings(card, []);
    const upcomingCount = upcoming.length;
    const nextDate = formatShortBookingDate(card?.nextBookingAt);
    const bookLabel = card?.nextBookingAt
      ? `Boka nästa ${card.nextBookingType || 'PRP'}${nextDate ? ` (${nextDate})` : ''}`
      : 'Boka nästa tid';
    const confirmDisabled = upcomingCount === 0;

    return `
      <div class="v9-intel-actions dossier-actions v9-dossier-actions" data-v9-intel-actions>
        <button type="button" class="quick-pill dossier-camera-cta full" data-v9-intel-action="photo">📷 Ta bild</button>
        <button type="button" class="quick-pill quick-pill--ai full" data-v9-intel-action="book">${escapeHtml(bookLabel)}</button>
        <button
          type="button"
          class="quick-pill quick-pill--success full${confirmDisabled ? ' is-disabled' : ''}"
          data-v9-intel-action="confirm"
          ${confirmDisabled ? 'disabled aria-disabled="true"' : ''}
        >✓ Bekräfta tider (${upcomingCount})</button>
      </div>`;
  }

  /* ORD-25 Fas C — dokument-segment (shell tills ORD-24) */

  const V11_DOC_FILTER_AXES = Object.freeze([
    {
      id: 'filler',
      label: 'Vem fyller',
      options: [
        { value: 'all', label: 'Alla' },
        { value: 'patient', label: 'Patient', tone: 'lila' },
        { value: 'staff', label: 'Personal', tone: 'gron' },
        { value: 'auto', label: 'Auto', tone: 'neutral' },
      ],
    },
    {
      id: 'flow',
      label: 'Flöde',
      options: [
        { value: 'all', label: 'Alla' },
        { value: 'tp', label: 'TP', tone: 'vellum' },
        { value: 'prp_hair', label: 'PRP hår', tone: 'gron' },
      ],
    },
    {
      id: 'view',
      label: 'Vy',
      options: [{ value: 'category', label: 'Per kategori', tone: 'dark', selected: true }],
    },
  ]);

  const V11_DOC_GROUPS = Object.freeze([
    { id: 'offers', title: 'Offerter', subtitle: 'commit · steg 5–7', key: 'offers' },
    {
      id: 'health',
      title: 'Hälso- & samtyckesdokument',
      subtitle: 'kund fyller',
      key: 'healthForms',
    },
    { id: 'journals', title: 'Journaler', subtitle: 'personal fyller', key: 'journals' },
    { id: 'auto', title: 'Auto-dokument', subtitle: 'system skickar', key: 'autoDocs', grid: true },
  ]);

  function resolveV11DocumentPayload(card, dossierBundle) {
    const docs = dossierBundle?.documents;
    if (docs && typeof docs === 'object' && dossierBundle?.ready !== false) {
      const counts = docs.counts || dossierBundle.counts || {};
      return {
        ready: true,
        counts: {
          total: Number(counts.total ?? counts.all ?? 0),
          done: Number(counts.done ?? counts.klara ?? counts.signed ?? 0),
          pending: Number(counts.pending ?? counts.vantar ?? counts.waiting ?? 0),
          upcoming: Number(counts.upcoming ?? counts.kommer ?? counts.planned ?? 0),
        },
        offers: asArray(docs.offers || docs.offerter),
        healthForms: asArray(
          docs.healthForms || docs.haelsoSamtycke || docs.consents || docs.haelso_samtycke
        ),
        journals: asArray(
          docs.journalStatus?.expected || docs.journaler || docs.journals || docs.journaler
        ),
        autoDocs: asArray(docs.autoDokument || docs.auto || docs.autoDocuments || docs.autoDocs),
      };
    }
    return {
      ready: false,
      counts: { total: 0, done: 0, pending: 0, upcoming: 0 },
      offers: [],
      healthForms: [],
      journals: [],
      autoDocs: [],
    };
  }

  function renderV11DocumentFilters(active = {}) {
    return `
      <div class="v11-doc-filters" data-v11-doc-filters aria-label="Dokumentfilter">
        ${V11_DOC_FILTER_AXES.map((axis) => {
          const current = active[axis.id] || (axis.id === 'view' ? 'category' : 'all');
          return `
          <div class="v11-doc-filters__axis" data-v11-doc-axis="${escapeHtml(axis.id)}">
            <span class="v11-doc-filters__axis-label">${escapeHtml(axis.label)}</span>
            <div class="v11-doc-filters__chips">
              ${axis.options
                .map((option) => {
                  const isActive = current === option.value;
                  return `
                <button
                  type="button"
                  class="v11-doc-chip v11-doc-chip--${escapeHtml(option.tone || 'neutral')}${isActive ? ' is-active' : ''}"
                  data-v11-doc-filter="${escapeHtml(axis.id)}"
                  data-v11-doc-value="${escapeHtml(option.value)}"
                  aria-pressed="${isActive ? 'true' : 'false'}"
                >${escapeHtml(option.label)}</button>`;
                })
                .join('')}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function mapV11DocumentRow(item, defaults = {}) {
    if (!item || typeof item !== 'object') return null;
    const status = String(item.status || defaults.status || 'planned').toLowerCase();
    const statusLabels = {
      signed: 'Signerad',
      pending: 'Att fylla i',
      planned: 'Planerad',
      sent: 'Skickad',
    };
    return {
      title: item.title || item.name || item.label || 'Dokument',
      flowLabel: item.flowLabel || item.flow || defaults.flowLabel || 'TP',
      amount: item.amount || item.total || '',
      status,
      statusLabel: item.statusLabel || statusLabels[status] || status,
      filler: item.filler || defaults.filler || 'patient',
      flow: item.flow || defaults.flow || 'tp',
      journeyStep: item.journeyStep || defaults.journeyStep || '',
      dashed: status === 'planned' || item.planned === true,
    };
  }

  function renderV11DocumentRow(row) {
    if (!row) return '';
    const amountHtml = row.amount
      ? `<span class="v11-doc-row__amount">${escapeHtml(String(row.amount))}</span>`
      : '';
    const stepHtml = row.journeyStep
      ? `<span class="v11-doc-row__step">steg ${escapeHtml(String(row.journeyStep))}</span>`
      : '';
    return `
      <div
        class="v11-doc-row${row.dashed ? ' v11-doc-row--planned' : ''}"
        data-v11-doc-row
        data-v11-doc-filler="${escapeHtml(row.filler)}"
        data-v11-doc-flow="${escapeHtml(row.flow)}"
        data-v11-doc-status="${escapeHtml(row.status)}"
      >
        <div class="v11-doc-row__main">
          <span class="v11-doc-row__title">${escapeHtml(row.title)}</span>
          ${stepHtml}
        </div>
        <div class="v11-doc-row__meta">
          <span class="v11-doc-row__flow">${escapeHtml(row.flowLabel)}</span>
          ${amountHtml}
          <span class="v11-doc-row__pill v11-doc-row__pill--${escapeHtml(row.status)}">${escapeHtml(row.statusLabel)}</span>
        </div>
      </div>`;
  }

  function renderV11DocumentGroup(group, rows, { ready = false, grid = false } = {}) {
    const body =
      rows.length > 0
        ? `<div class="v11-doc-group__rows${grid ? ' v11-doc-group__rows--grid' : ''}">
            ${rows.map((row) => renderV11DocumentRow(row.title ? row : mapV11DocumentRow(row))).join('')}
          </div>`
        : `<p class="v11-doc-empty${ready ? '' : ' v11-doc-empty--pending'}">${
            ready
              ? 'Inga dokument i denna grupp.'
              : 'Dokumentsegment laddas — väntar backend ORD-24.'
          }</p>`;

    return `
      <section class="v11-doc-group" data-v11-doc-group="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.title)}">
        <header class="v11-doc-group__head">
          <h4 class="v11-doc-group__title">${escapeHtml(group.title)}</h4>
          <p class="v11-doc-group__subtitle">${escapeHtml(group.subtitle)}</p>
        </header>
        ${body}
      </section>`;
  }

  function renderV11DocumentSegments(card, dossierBundle, filterState = {}) {
    const payload = resolveV11DocumentPayload(card, dossierBundle);
    const counts = payload.counts;
    const countLine = payload.ready
      ? `${counts.total} dokument · ${counts.done} klara · ${counts.pending} väntar · ${counts.upcoming} kommer`
      : '0 dokument · backend ORD-24 saknas';

    const rowsByGroup = {
      offers: payload.offers,
      healthForms: payload.healthForms,
      journals: payload.journals,
      autoDocs: payload.autoDocs,
    };

    return `
      <section class="v11-doc-segment" data-v11-doc-segment aria-label="Dokument-segment">
        <header class="v11-doc-segment__head">
          <div class="v11-doc-segment__kicker">Dossiér · Dokument-segment</div>
          <p class="v11-doc-segment__counts">${escapeHtml(countLine)}</p>
        </header>
        ${renderV11DocumentFilters(filterState)}
        <div class="v11-doc-segment__groups" data-v11-doc-groups>
          ${V11_DOC_GROUPS.map((group) =>
            renderV11DocumentGroup(group, rowsByGroup[group.key] || [], {
              ready: payload.ready,
              grid: Boolean(group.grid),
            })
          ).join('')}
        </div>
      </section>`;
  }

  /* ORD-25 Fas D — insikter-strip + sticky · Fas F — automation + requiredFor */

  function signalInsightIcon(signal) {
    const ruleId = String(signal?.ruleId || '');
    if (ruleId.startsWith('document.')) return '📄';
    if (signal?.risk === 'legal_blocker' || signal?.risk === 'legal') return '⚖';
    if (ruleId.includes('health')) return '📋';
    if (ruleId.includes('photo')) return '📷';
    return '!';
  }

  function signalInsightStateLabel(signal) {
    if (signal?.risk === 'legal_blocker') return 'Spärr';
    if (signal?.risk === 'blocker') return 'Nästa steg';
    if (signal?.risk === 'needs_review') return 'Granska';
    if (signal?.risk === 'ready') return 'Redo';
    return 'Insikt';
  }

  function signalInsightV11Tone(signal) {
    if (
      signal?.risk === 'legal_blocker' ||
      signal?.risk === 'legal' ||
      signal?.risk === 'blocker'
    ) {
      return 'amber';
    }
    if (signal?.risk === 'ready') return 'gron';
    return 'lila';
  }

  function buildV11AutomationInsightCards(card) {
    return asArray(card?.automationSignals)
      .filter((signal) => signal && signal.status === 'active')
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
      .slice(0, 3)
      .map((signal, index) => ({
        kind: 'automation',
        id: signal.ruleId || `automation-${index}`,
        ruleId: signal.ruleId || '',
        icon: signalInsightIcon(signal),
        title: signal.what || 'Nästa steg',
        body: signal.why || signal.next || '',
        theme: signal.risk === 'ready' ? 'retention' : 'next',
        tone: signal.risk === 'ready' ? 'done' : 'next',
        stateLabel: signalInsightStateLabel(signal),
        v11Tone: signalInsightV11Tone(signal),
        index,
      }));
  }

  function buildV11DrawerIntro(card) {
    const top = card?.automationTop;
    if (top?.status === 'active') {
      const parts = [top.what, top.why, top.next ? `Nästa: ${top.next}` : ''].filter(Boolean);
      return parts.join(' · ');
    }
    const first = asArray(card?.automationSignals).find((signal) => signal?.status === 'active');
    if (first) {
      return [first.what, first.why].filter(Boolean).join(' · ');
    }
    return 'Hela kundresan — röd nästa, orange på gång, grön klart, lila planerat.';
  }

  function readV11InsightCardCopy(button) {
    if (!button) return { title: '', body: '' };
    return {
      title:
        button
          .querySelector('.v11-insight-card__title, .dossier-insight__title')
          ?.textContent?.trim() || '',
      body:
        button
          .querySelector('.v11-insight-card__body, .dossier-insight__body')
          ?.textContent?.trim() || '',
    };
  }

  function buildV11InsightCards(card, journalEntries) {
    const stateLabels = {
      next: 'Nästa steg',
      coming: 'På gång',
      response: 'Förberedelse',
      retention: 'Relation',
    };
    const merged = [...buildV11AutomationInsightCards(card)];
    if (merged.length < 3) {
      for (const item of buildIntelFeaturedCards(card, journalEntries)) {
        if (merged.length >= 3) break;
        const key = String(item.title || '')
          .trim()
          .toLowerCase();
        if (
          !key ||
          merged.some(
            (row) =>
              String(row.title || '')
                .trim()
                .toLowerCase() === key
          )
        )
          continue;
        merged.push(item);
      }
    }
    return merged.slice(0, 3).map((item, index) => ({
      ...item,
      stateLabel: item.stateLabel || stateLabels[item.theme] || stateLabels[item.tone] || 'Insikt',
      v11Tone:
        item.v11Tone ||
        (item.tone === 'next' || item.theme === 'next'
          ? 'amber'
          : item.theme === 'retention'
            ? 'gron'
            : 'lila'),
      index,
    }));
  }

  function renderV11InsightCard(card) {
    return `
      <button
        type="button"
        class="v11-insight-card v11-insight-card--${escapeHtml(card.v11Tone || 'lila')}"
        data-v11-insight-card
        data-v9-intel-card="${escapeHtml(card.id)}"
        data-v9-intel-kind="${escapeHtml(card.kind || 'signal')}"
        data-insight-theme="${escapeHtml(card.theme || 'next')}"
        data-v11-insight-rule-id="${escapeHtml(card.ruleId || '')}"
        data-v9-intel-idx="${Number(card.index) || 0}"
      >
        <span class="v11-insight-card__icon" aria-hidden="true">${escapeHtml(card.icon || '•')}</span>
        <span class="v11-insight-card__copy">
          <span class="v11-insight-card__state">${escapeHtml(card.stateLabel || 'Insikt')}</span>
          <span class="v11-insight-card__title">${escapeHtml(card.title || '')}</span>
          <span class="v11-insight-card__body">${escapeHtml(card.body || '')}</span>
        </span>
      </button>`;
  }

  function renderV11InsightsStrip(card, journalEntries) {
    if (!card) return '';
    const cards = buildV11InsightCards(card, journalEntries);
    if (!cards.length) return '';

    return `
      <section class="v11-insights-strip" data-v11-insights-strip aria-label="Insikter">
        <div class="v11-insights-strip__head">
          <span class="v11-insights-strip__kicker">Insikter</span>
          <button type="button" class="v11-insights-strip__link" data-v9-intel-open-all>Visa kundresa ›</button>
        </div>
        <div class="v11-insights-strip__grid">
          ${cards.map((item) => renderV11InsightCard(item)).join('')}
        </div>
      </section>`;
  }

  function resolveV11StickyHelper(card, journalEntries) {
    const top = card?.automationTop;
    if (top?.status === 'active') {
      if (top.next) return top.next;
      if (top.why) return top.why;
    }
    const docBlocker = asArray(card?.documentBlockers)[0];
    if (docBlocker?.reason) return docBlocker.reason;
    const journey = buildIntelligentJourneyBubbles(card, journalEntries);
    if (journey.footer) return journey.footer;
    if (card?.missingHealthDeclaration) {
      return 'Signera hälsodeklarationen innan du skapar behandlingsplan.';
    }
    if (card?.missingFitnessCertificate && card?.hasUpcomingBooking) {
      return 'Friskförsäkran behövs innan behandlingsdagen.';
    }
    return '';
  }

  function renderV11StickyActions(card, journalEntries) {
    if (!card) return '';
    const upcoming = buildUpcomingBookings(card, []);
    const upcomingCount = upcoming.length;
    const treatment = card?.nextBookingType || asArray(card?.treatmentTypes)[0] || 'PRP';
    const bookLabel = card?.hasUpcomingBooking
      ? `Boka nästa ${treatment}`
      : `Boka nästa ${treatment}`;
    const confirmDisabled = upcomingCount === 0;
    const helper = resolveV11StickyHelper(card, journalEntries);

    return `
      <div class="v11-sticky-actions" data-v11-sticky-actions aria-label="Snabbåtgärder">
        <div class="v11-sticky-actions__row">
          <button type="button" class="v11-sticky-actions__hero" data-v9-intel-action="book">${escapeHtml(bookLabel)}</button>
          <button type="button" class="v11-sticky-actions__assist v11-sticky-actions__assist--vellum" data-v9-intel-action="photo">Ta bild</button>
          <button
            type="button"
            class="v11-sticky-actions__assist v11-sticky-actions__assist--gron${confirmDisabled ? ' is-disabled' : ''}"
            data-v9-intel-action="confirm"
            ${confirmDisabled ? 'disabled aria-disabled="true"' : ''}
          >Bekräfta · ${upcomingCount}</button>
        </div>
        ${helper ? `<p class="v11-sticky-actions__helper">${escapeHtml(helper)}</p>` : ''}
      </div>`;
  }

  /* ORD-25 Fas G — kommande bokningar, kundresan, veckans mönster */

  const V11_BOOKING_ACCENTS = ['lila', 'blau', 'gron'];

  const V11_CANONICAL_JOURNEY = Object.freeze([
    { step: 1, label: 'Bokning' },
    { step: 2, label: 'Hälsodeklaration' },
    { step: 3, label: 'Konsultation' },
    { step: 4, label: 'Offert / plan' },
    { step: 5, label: 'Plan accepterad' },
    { step: 6, label: 'Betänketid (2 dagar)' },
    { step: 7, label: 'Avtal + samtycke' },
    { step: 8, label: 'Friskförsäkran · op-dag' },
    { step: 9, label: 'Foto-samtycke · op-dag' },
  ]);

  function resolvePatientFirstName(card) {
    const direct = normalizeIntelText(card?.firstName);
    if (direct) return direct;
    const fromName = normalizeIntelText(card?.displayName || card?.name || '').split(/\s+/)[0];
    return fromName || 'Kunden';
  }

  function formatPreferredBookingSlot(iso, resourceLabel) {
    if (!iso) return resourceLabel ? `hos ${resourceLabel}` : 'lämplig tid';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return resourceLabel ? `hos ${resourceLabel}` : 'lämplig tid';
    const day = DAY_NAMES[d.getDay()];
    const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    return resourceLabel ? `${day} ${time} hos ${resourceLabel}` : `${day} ${time}`;
  }

  function collectV11DocumentRows(card, dossierBundle) {
    const payload = resolveV11DocumentPayload(card, dossierBundle);
    return [
      ...asArray(payload.offers),
      ...asArray(payload.healthForms),
      ...asArray(payload.journals),
      ...asArray(payload.autoDocs),
    ]
      .map((row) => mapV11DocumentRow(row))
      .filter(Boolean);
  }

  function docsAtJourneyStep(rows, step) {
    return rows.filter((row) => String(row.journeyStep) === String(step));
  }

  function docStepAggregate(rows, step) {
    const atStep = docsAtJourneyStep(rows, step);
    if (!atStep.length) return null;
    if (atStep.some((row) => row.status === 'signed')) return 'done';
    if (atStep.some((row) => row.status === 'pending')) return 'active';
    if (atStep.some((row) => row.status === 'planned')) return 'future';
    return 'pending';
  }

  function buildV11WeeklyPatterns(card) {
    const firstName = resolvePatientFirstName(card);
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    const noShows = Number(card?.noShowCount ?? 0);
    const ltv = Number(card?.lifetimeValue ?? card?.dealValue ?? card?.pipedriveDealValue ?? 0);
    const treatment =
      card?.nextBookingType || card?.lastBookingType || asArray(card?.treatmentTypes)[0] || 'PRP';
    const treatmentLower = String(treatment).toLowerCase();
    const seriesTotal = treatmentLower.includes('prp') ? 6 : 4;
    const seriesCurrent =
      visits > 0 ? Math.min(Math.max(visits % seriesTotal || seriesTotal, 1), seriesTotal) : 1;
    const resource = card?.nextBookingResourceLabel || card?.nextBookingResource || 'behandlare';
    const slotHint = formatPreferredBookingSlot(card?.nextBookingAt || card?.lastVisitAt, resource);

    let bookingPattern = '';
    if (visits > 0 && treatmentLower.includes('prp')) {
      bookingPattern = `${firstName} är på ${seriesCurrent}/${seriesTotal} i PRP — föreslå ${Math.min(seriesCurrent + 1, seriesTotal)}:e ~3 v från senaste, helst ${slotHint}.`;
    } else if (card?.hasUpcomingBooking) {
      bookingPattern = `${firstName} har ${treatment} bokad — bekräfta ${slotHint}.`;
    } else {
      bookingPattern = `${firstName} saknar bokad uppföljning — föreslå nästa ${treatment}.`;
    }

    const denom = Math.max(visits, 1);
    const engagementPct = Math.min(100, Math.max(0, Math.round(((denom - noShows) / denom) * 100)));
    const trend = `Engagement stabilt ${engagementPct} % · ${noShows} no-shows på ${visits || 12} besök.`;

    let opportunity = '';
    if (!card?.isVip && ltv >= 35000) {
      opportunity = `Värd att uppgradera till VIP+ — total omsättning passerar ${formatSek(ltv)}.`;
    } else if (card?.isVip) {
      opportunity = 'VIP-kund — behåll proaktiv uppföljning och kurplan.';
    } else if (ltv > 0) {
      opportunity = `Intäkt ${formatSek(ltv)} — erbjud kurpaket eller uppföljning.`;
    } else {
      opportunity = 'Bygg lojalitet med regelbunden uppföljning efter behandling.';
    }

    return { bookingPattern, trend, opportunity, engagementPct };
  }

  function addDaysIso(isoOrMs, days) {
    const base = isoOrMs ? Date.parse(isoOrMs) : Date.now();
    if (!Number.isFinite(base)) return new Date(Date.now() + days * 86400000).toISOString();
    return new Date(base + days * 86400000).toISOString();
  }

  function buildV11UpcomingSuggestions(card) {
    const treatment =
      card?.nextBookingType ||
      card?.lastBookingType ||
      asArray(card?.treatmentTypes)[0] ||
      'PRP hår';
    const staff = card?.nextBookingResourceLabel || card?.nextBookingResource || 'Egzona';
    const baseIso = card?.lastVisitAt || card?.lastBookingAt || card?.updatedAt || '';
    const treatmentLower = String(treatment).toLowerCase();
    const seriesTotal = treatmentLower.includes('prp') ? 6 : 3;
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    const seriesNum = visits > 0 ? Math.min((visits % seriesTotal) + 1, seriesTotal) : 3;

    const presets = [
      {
        days: 21,
        title: `${treatment} – Behandling ${seriesNum}/${seriesTotal}`,
        sub: staff,
      },
      {
        days: 42,
        title: `${treatment} – Uppföljning`,
        sub: staff,
      },
      {
        days: 74,
        title: treatmentLower.includes('hud') ? 'Konsultation hud' : `${treatment} – Kontroll`,
        sub: 'Amanda N.',
      },
    ];

    return presets.map((preset) => ({
      ...bookingParts(
        addDaysIso(baseIso, preset.days),
        preset.title,
        preset.sub,
        'planned',
        'Förslag',
        resolveBookingSource(preset.sub)
      ),
      suggested: true,
    }));
  }

  function buildV11UpcomingDisplayList(card, occasionTimeline) {
    const real = buildUpcomingBookings(card, occasionTimeline);
    if (real.length) return real.map((row) => ({ ...row, suggested: false }));
    return buildV11UpcomingSuggestions(card).slice(0, 3);
  }

  function finalizeV11JourneySteps(steps, card, docRows) {
    const signedSteps = new Set();
    for (const row of docRows) {
      if (row.status === 'signed' && row.journeyStep) signedSteps.add(Number(row.journeyStep));
    }

    const blockedNums = asArray(card?.blockedSteps)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
      .sort((a, b) => a - b);
    const journeyStepsFromBlockers = asArray(card?.documentBlockers)
      .map((blocker) => Number(blocker?.journeyStep))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
      .sort((a, b) => a - b);
    const focusStep = journeyStepsFromBlockers[0] || blockedNums[0] || 0;

    let activeIndex = steps.findIndex((row) => row.status === 'active');
    if (activeIndex < 0 && focusStep) {
      activeIndex = steps.findIndex((row) => row.step === focusStep);
    }
    if (activeIndex < 0) activeIndex = steps.findIndex((row) => row.status === 'pending');
    if (activeIndex < 0) {
      activeIndex = steps.findIndex((row) => row.status !== 'done');
    }

    const reconciled = steps.map((row, index) => {
      let status = row.status;
      let meta = row.meta;
      let progress = row.progress;
      let dueLabel = row.dueLabel;

      if (signedSteps.has(row.step)) {
        status = 'done';
        if (!meta) meta = 'Signerad';
      }

      if (activeIndex >= 0) {
        if (index < activeIndex && status !== 'future') status = 'done';
        if (index === activeIndex) {
          status = 'active';
          progress = row.step === 6 ? 62 : 45;
          if (row.step === 6 && !dueLabel) {
            dueLabel = `Klar ${formatShortBookingDate(addDaysIso(card?.updatedAt, 2))}`;
          }
          if (row.step === 5 && !meta) meta = 'betänketid startad';
        }
        if (index > activeIndex && status !== 'done') status = 'future';
      }

      return { ...row, status, meta, progress, dueLabel };
    });

    const doneCount = reconciled.filter((row) => row.status === 'done').length;
    const activeIndexFinal = reconciled.findIndex((row) => row.status === 'active');
    return {
      steps: reconciled,
      doneCount,
      totalCount: reconciled.length,
      activeIndex: activeIndexFinal,
    };
  }

  function buildV11CustomerJourney(card, journalEntries, dossierBundle) {
    const entries = asArray(journalEntries);
    const docRows = collectV11DocumentRows(card, dossierBundle);
    const blockedSteps = new Set(asArray(card?.blockedSteps).map(String));
    const planEntry = findConsultationPlan(entries);
    const healthSigned =
      journalHasType(entries, 'health_declaration', { locked: true }) ||
      (!card?.missingHealthDeclaration && Boolean(card?.hasForm));
    const fitnessSigned =
      journalHasType(entries, 'fitness_certificate', { locked: true }) ||
      Boolean(card?.fitnessSigned);
    const hasBooking =
      Boolean(card?.hasUpcomingBooking) ||
      Number(card?.visitCount ?? card?.bookingCount ?? 0) > 0 ||
      Boolean(card?.lastVisitAt || card?.lastBookingAt);

    const resolveStatus = (step) => {
      const docState = docStepAggregate(docRows, step);
      if (docState === 'done') return 'done';
      if (docState === 'active') return 'active';
      if (docState === 'future') return 'future';

      if (step === 1) return hasBooking ? 'done' : 'pending';
      if (step === 2) {
        if (healthSigned) return 'done';
        if (card?.missingHealthDeclaration || blockedSteps.has('2')) return 'active';
        return card?.hasUpcomingBooking ? 'pending' : 'future';
      }
      if (step === 3) {
        if (planEntry || journalHasType(entries, 'consultation')) return 'done';
        if (healthSigned && !planEntry) return 'active';
        return 'future';
      }
      if (step === 4) {
        if (docsAtJourneyStep(docRows, 4).some((row) => row.status === 'signed')) return 'done';
        if (planEntry && !planEntry.locked) return 'active';
        return docState || 'future';
      }
      if (step === 5) {
        if (
          planEntry?.locked ||
          docsAtJourneyStep(docRows, 5).some((row) => row.status === 'signed')
        ) {
          return 'done';
        }
        if (docsAtJourneyStep(docRows, 5).some((row) => row.status === 'pending')) return 'active';
        return 'future';
      }
      if (step === 6) {
        if (
          blockedSteps.has('6') ||
          docsAtJourneyStep(docRows, 6).some((row) => row.status === 'pending')
        ) {
          return 'active';
        }
        if (docsAtJourneyStep(docRows, 6).some((row) => row.status === 'signed')) return 'done';
        return 'future';
      }
      if (step === 7) {
        if (blockedSteps.has('7')) return 'active';
        if (docsAtJourneyStep(docRows, 7).some((row) => row.status === 'signed')) return 'done';
        return 'future';
      }
      if (step === 8) {
        if (fitnessSigned) return 'done';
        if (card?.missingFitnessCertificate || blockedSteps.has('8'))
          return card?.hasUpcomingBooking ? 'active' : 'future';
        return 'future';
      }
      if (step === 9) {
        if (docsAtJourneyStep(docRows, 9).some((row) => row.status === 'signed')) return 'done';
        if (docsAtJourneyStep(docRows, 9).some((row) => row.status === 'pending')) return 'active';
        return 'future';
      }
      return 'future';
    };

    const resolveMeta = (step, status) => {
      if (status !== 'done') return '';
      if (step === 2) {
        const date = journalEntryDate(
          entries.find((entry) => entry?.journalType === 'health_declaration') || {}
        );
        return formatShortBookingDate(date);
      }
      if (step === 4 || step === 5) {
        const signed = docsAtJourneyStep(docRows, step).find((row) => row.status === 'signed');
        return signed?.statusLabel || '';
      }
      if (step === 5 && planEntry?.locked) return 'betänketid startad';
      return '';
    };

    const steps = V11_CANONICAL_JOURNEY.map((def) => {
      const status = resolveStatus(def.step);
      return {
        ...def,
        status,
        meta: resolveMeta(def.step, status),
        progress: status === 'active' && def.step === 6 ? 62 : status === 'active' ? 40 : 0,
        dueLabel:
          status === 'active' && def.step === 6 && card?.nextBookingAt
            ? `Klar ${formatShortBookingDate(card.nextBookingAt)}`
            : '',
      };
    });

    return finalizeV11JourneySteps(steps, card, docRows);
  }

  function renderV11UpcomingBookingRow(booking, index) {
    const { staff, initials, shortName } = staffFromSub(booking.sub);
    const accent = V11_BOOKING_ACCENTS[index % V11_BOOKING_ACCENTS.length];
    const whenLong =
      booking.whenLong ||
      (booking.num && booking.mon ? `${booking.num} ${booking.mon.toLowerCase()}` : '—');
    const whenShort = booking.whenShort || booking.day || '';
    const suggested = Boolean(booking.suggested);
    return `
      <button type="button" class="v11-booking-row v11-booking-row--${accent}${suggested ? ' v11-booking-row--suggested' : ''}" data-v11-booking-row${suggested ? ' data-v11-booking-suggested="1"' : ''}>
        <span class="v11-booking-row__rail" aria-hidden="true"></span>
        <span class="v11-booking-row__when">
          <span class="v11-booking-row__cal" aria-hidden="true">📅</span>
          <span class="v11-booking-row__date">${escapeHtml(whenLong)}</span>
          ${whenShort ? `<span class="v11-booking-row__time">${escapeHtml(whenShort)}</span>` : ''}
        </span>
        <span class="v11-booking-row__copy">
          <span class="v11-booking-row__title">${escapeHtml(booking.title)}</span>
          ${booking.area ? `<span class="v11-booking-row__sub">${escapeHtml(booking.area)}</span>` : ''}
        </span>
        <span class="v11-booking-row__staff" title="${escapeHtml(staff)}">
          <span class="v11-booking-row__avatar">${escapeHtml(initials)}</span>
          ${shortName ? `<span class="v11-booking-row__name">${escapeHtml(shortName)}</span>` : ''}
        </span>
      </button>`;
  }

  function renderV11UpcomingBookings(card, occasionTimeline) {
    const upcoming = buildV11UpcomingDisplayList(card, occasionTimeline);
    const suggestedOnly = upcoming.length > 0 && upcoming.every((row) => row.suggested);

    return `
      <section class="v11-upcoming-bookings" data-v11-upcoming-bookings aria-label="Kommande bokningar">
        <header class="v11-upcoming-bookings__head">
          <h3 class="v11-upcoming-bookings__title">Kommande bokningar</h3>
          ${suggestedOnly ? '<span class="v11-upcoming-bookings__hint">Förslag baserat på mönster</span>' : ''}
        </header>
        <div class="v11-upcoming-bookings__list">
          ${upcoming.map((row, index) => renderV11UpcomingBookingRow(row, index)).join('')}
        </div>
      </section>`;
  }

  function renderV11JourneyCompletedStep(step) {
    return `
      <div class="v11-journey-step v11-journey-step--done" data-v11-journey-step="${step.step}">
        <span class="v11-journey-step__badge" aria-hidden="true">✓</span>
        <span class="v11-journey-step__copy">
          <span class="v11-journey-step__num">${step.step}.</span>
          <span class="v11-journey-step__label">${escapeHtml(step.label)}</span>
          ${step.meta ? `<span class="v11-journey-step__meta">${escapeHtml(step.meta)}</span>` : ''}
        </span>
      </div>`;
  }

  function renderV11JourneyActiveStep(step) {
    const progress = Math.max(8, Math.min(100, Number(step.progress) || 40));
    return `
      <div class="v11-journey-active" data-v11-journey-active>
        <div class="v11-journey-active__head">
          <span class="v11-journey-active__badge">${step.step}</span>
          <span class="v11-journey-active__status">Pågår · ${step.step === 6 ? '1 dag kvar' : 'Nästa steg'}</span>
          ${step.dueLabel ? `<span class="v11-journey-active__due">${escapeHtml(step.dueLabel)}</span>` : ''}
        </div>
        <div class="v11-journey-active__label">${escapeHtml(step.label)}</div>
        <div class="v11-journey-active__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
          <span class="v11-journey-active__fill" style="width:${progress}%"></span>
        </div>
      </div>`;
  }

  function renderV11JourneyFutureStep(step) {
    return `
      <div class="v11-journey-future" data-v11-journey-step="${step.step}">
        <span class="v11-journey-future__num">${step.step}.</span>
        <span class="v11-journey-future__label">${escapeHtml(step.label)}</span>
      </div>`;
  }

  function renderV11CustomerJourney(card, journalEntries, dossierBundle) {
    const journey = buildV11CustomerJourney(card, journalEntries, dossierBundle);
    const activeStep = journey.steps.find((row) => row.status === 'active') || null;
    const completed = journey.steps.filter((row) => row.status === 'done');
    const future = journey.steps.filter(
      (row) => row.status === 'future' || row.status === 'pending'
    );

    return `
      <section class="v11-customer-journey" data-v11-customer-journey aria-label="Kundresan">
        <header class="v11-customer-journey__head">
          <h3 class="v11-customer-journey__title">Kundresan</h3>
          <span class="v11-customer-journey__count">${journey.doneCount} av ${journey.totalCount} klart</span>
          <button type="button" class="v11-customer-journey__link" data-v9-intel-open-all>Visa detaljer ›</button>
        </header>
        ${
          completed.length
            ? `<div class="v11-customer-journey__done-grid">${completed
                .slice(-5)
                .map(renderV11JourneyCompletedStep)
                .join('')}</div>`
            : ''
        }
        ${activeStep && activeStep.status !== 'done' ? renderV11JourneyActiveStep(activeStep) : ''}
        ${
          future.length
            ? `<div class="v11-customer-journey__future-row">${future.slice(0, 3).map(renderV11JourneyFutureStep).join('')}</div>`
            : ''
        }
      </section>`;
  }

  function renderV11WeeklyPatterns(card) {
    const patterns = buildV11WeeklyPatterns(card);
    const noShows = Number(card?.noShowCount ?? 0);
    const visits = Number(card?.visitCount ?? card?.bookingCount ?? 0);
    return `
      <section class="v11-weekly-patterns" data-v11-weekly-patterns aria-label="Veckans mönster">
        <h3 class="v11-weekly-patterns__title">Veckans mönster</h3>
        <div class="v11-weekly-patterns__rows">
          <div class="v11-weekly-patterns__row">
            <span class="v11-weekly-patterns__kicker">Bokningsmönster</span>
            <p class="v11-weekly-patterns__text">${escapeHtml(patterns.bookingPattern)}</p>
          </div>
          <div class="v11-weekly-patterns__row">
            <span class="v11-weekly-patterns__kicker">Trend</span>
            <p class="v11-weekly-patterns__text">Engagement <strong class="v11-weekly-patterns__good">stabilt ${patterns.engagementPct} %</strong> · ${noShows} no-shows på ${visits || 12} besök.</p>
          </div>
          <div class="v11-weekly-patterns__row">
            <span class="v11-weekly-patterns__kicker">Möjlighet</span>
            <p class="v11-weekly-patterns__text">${escapeHtml(patterns.opportunity)}</p>
          </div>
        </div>
      </section>`;
  }

  function renderV11ContextPanels(card, journalEntries, dossierBundle, occasionTimeline) {
    const upcoming = renderV11UpcomingBookings(card, occasionTimeline);
    const journey = renderV11CustomerJourney(card, journalEntries, dossierBundle);
    const patterns = renderV11WeeklyPatterns(card);

    return `
      <div class="v11-context-panels" data-v11-context-panels>
        ${upcoming}
        ${renderV11Hairstrand()}
        <div class="v11-context-panels__duo">
          ${journey}
          ${patterns}
        </div>
      </div>`;
  }

  function renderV11DossierZonesHtml(
    card,
    journalEntries,
    dossierBundle,
    filterState = {},
    occasionTimeline = null
  ) {
    if (!isV9On() || !card) return '';

    return `
      <div class="v11-dossier-zones" data-v11-dossier-zones>
        ${renderV11ContextPanels(card, journalEntries, dossierBundle, occasionTimeline)}
        ${renderV11Hairstrand()}
        ${renderV11DocumentSegments(card, dossierBundle, filterState)}
        ${renderV11Hairstrand()}
        ${renderV11InsightsStrip(card, journalEntries)}
        ${renderV11StickyActions(card, journalEntries)}
      </div>`;
  }

  function applyV11DocumentFilters(root, filterState) {
    if (!root) return;
    const rows = root.querySelectorAll('[data-v11-doc-row]');
    rows.forEach((row) => {
      const filler = row.getAttribute('data-v11-doc-filler') || '';
      const flow = row.getAttribute('data-v11-doc-flow') || '';
      const fillerOk = filterState.filler === 'all' || filler === filterState.filler;
      const flowOk = filterState.flow === 'all' || flow === filterState.flow;
      row.hidden = !(fillerOk && flowOk);
    });
  }

  /* ORD-26 — Kundkort slide-over (15 sektioner, dossier-bundle) */

  function renderKundkortSlideSection(
    id,
    title,
    count,
    bodyHtml,
    { open = false, secondary = false } = {}
  ) {
    return `
      <details
        class="kundkort-slide-over__section dossier-section v9-dossier-section${secondary ? ' dossier-section--secondary' : ''}"
        data-kundkort-section="${escapeHtml(id)}"
        data-v9-section="${escapeHtml(id)}"
        ${open ? 'open' : ''}
      >
        <summary>${escapeHtml(title)} <span class="count">${Number(count) || 0}</span></summary>
        <div class="kundkort-slide-over__section-body">${bodyHtml}</div>
      </details>`;
  }

  function resolveHealthDeclarationFromBundle(dossierBundle) {
    const docs = dossierBundle?.documents || dossierBundle?.documentBundle?.documents;
    if (!docs) return null;
    const rows = [
      ...asArray(docs.healthForms),
      ...asArray(docs.haelsoSamtycke),
      ...asArray(docs.consents),
    ];
    return (
      rows.find((row) =>
        /16414|health_declaration|hälsodekl/i.test(String(row.documentTypeId || row.title || ''))
      ) ||
      rows.find((row) => /hälsodekl/i.test(String(row.title || ''))) ||
      null
    );
  }

  function renderKundkortContactStrip(card) {
    const phone = card?.primaryPhone || card?.phoneMasked || '';
    const email = card?.primaryEmail || card?.emailMasked || '';
    const meta = [phone, email].filter(Boolean);
    if (!meta.length) {
      return '<p class="dossier-empty">Ingen kontaktväg registrerad.</p>';
    }
    return `
      <div class="kundkort-lift__contact">
        ${meta
          .map(
            (line) =>
              `<a class="kundkort-lift__contact-line" href="${line.includes('@') ? `mailto:${escapeHtml(line)}` : `tel:${escapeHtml(line)}`}">${escapeHtml(line)}</a>`
          )
          .join('')}
      </div>`;
  }

  function renderKundkortHealthDeclPanel(dossierBundle, card) {
    const row = resolveHealthDeclarationFromBundle(dossierBundle);
    const status = row?.status || (card?.missingHealthDeclaration ? 'pending' : 'planned');
    const statusLabel =
      row?.statusLabel ||
      (status === 'signed' ? 'Signerad' : status === 'pending' ? 'Väntar ifyllnad' : 'Planerad');
    const title = row?.title || 'Hälsodeklaration · Hair TP (Meridiq 16414)';
    const signedMeta =
      row?.signedAt || row?.signedBy
        ? `${row.signedBy ? `${row.signedBy} · ` : ''}${row.signedAt ? String(row.signedAt).slice(0, 10) : ''}`
        : card?.missingHealthDeclaration
          ? 'Saknas före behandling'
          : 'Ingen signerad instans i dossier-bundle ännu';

    return `
      <section class="kundkort-lift__health" data-kundkort-health-decl data-v9-section="compliance">
        <div class="kundkort-lift__health-head">
          <span class="kundkort-lift__health-kicker">Hälsodeklaration</span>
          <span class="kundkort-lift__health-pill" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="kundkort-lift__health-title">${escapeHtml(title)}</div>
        <div class="kundkort-lift__health-meta">${escapeHtml(signedMeta)}</div>
      </section>`;
  }

  function renderKundkortPhotoStrip(card, driveFiles) {
    const imageCount = Number(card?.fileSummary?.images || 0);
    const tiles = [];
    for (const file of asArray(driveFiles)) {
      if (tiles.length >= 4) break;
      const mime = String(file.mimeType || file.contentType || '').toLowerCase();
      const name = String(file.originalFileName || file.fileName || file.name || '').toLowerCase();
      if (!mime.startsWith('image/') && !/\.(jpe?g|png|heic|webp|gif)$/i.test(name)) continue;
      tiles.push({
        label: (file.originalFileName || file.fileName || 'Foto').slice(0, 12),
        badge: file.category || 'foto',
      });
    }
    while (tiles.length < Math.min(4, Math.max(imageCount, 0)) && tiles.length < 4) {
      tiles.push({ label: `Foto ${tiles.length + 1}`, badge: 'import' });
    }
    if (!tiles.length) {
      return '<p class="dossier-empty kundkort-lift__photos-empty">Inga foton i dossier-bundle.</p>';
    }
    return `
      <div class="kundkort-lift__photos" data-kundkort-photo-strip data-v9-section="filer">
        ${tiles
          .map(
            (tile) => `
          <button type="button" class="kundkort-lift__photo" data-v9-section-link="filer">
            <span class="kundkort-lift__photo-icon" aria-hidden="true">🖼</span>
            <span class="kundkort-lift__photo-label">${escapeHtml(tile.label)}</span>
            ${tile.badge ? `<span class="kundkort-lift__photo-badge">${escapeHtml(String(tile.badge))}</span>` : ''}
          </button>`
          )
          .join('')}
      </div>`;
  }

  function renderKundkortStepStack(card, dossierBundle, journalEntries) {
    const docsBundle = dossierBundle?.documentBundle || dossierBundle;
    const journey = buildV11CustomerJourney(card, journalEntries, docsBundle);
    const steps = asArray(journey?.steps).slice(0, 9);
    if (!steps.length) {
      return '<p class="dossier-empty">Kundresa laddas från dossier-bundle.</p>';
    }
    return `
      <div class="kundkort-lift__steps" data-kundkort-step-stack role="list" aria-label="Kundresa steg">
        ${steps
          .map(
            (step) => `
          <span class="kundkort-lift__step kundkort-lift__step--${escapeHtml(step.status || 'future')}" role="listitem" title="${escapeHtml(step.label || '')}">
            <span class="kundkort-lift__step-num">${step.step}</span>
          </span>`
          )
          .join('')}
      </div>`;
  }

  function renderKundkortLiftPanel(card, dossierBundle, journalEntries, driveFiles) {
    return `
      <section class="kundkort-slide-over__lift kundkort-lift v9-surface-vellum" data-kundkort-lift aria-label="Kundkort sammanfattning">
        <div class="kundkort-lift__block">
          <div class="kundkort-lift__label">Kontakt</div>
          ${renderKundkortContactStrip(card)}
        </div>
        ${renderKundkortHealthDeclPanel(dossierBundle, card)}
        <div class="kundkort-lift__block">
          <div class="kundkort-lift__label">Foton</div>
          ${renderKundkortPhotoStrip(card, driveFiles)}
        </div>
        <div class="kundkort-lift__block">
          <div class="kundkort-lift__label">Kundresa</div>
          ${renderKundkortStepStack(card, dossierBundle, journalEntries)}
        </div>
      </section>`;
  }

  function bindV9BulkSelection(api) {
    if (!isV9On() || global.__ARCANA_V9_BULK_BOUND__) return;
    global.__ARCANA_V9_BULK_BOUND__ = true;
    const selected = new Set();
    let bar = document.getElementById('v9BulkBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'v9BulkBar';
      bar.className = 'v9-bulk-bar';
      bar.hidden = true;
      bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bar);
    }

    const clearSelection = () => {
      selected.clear();
      document.querySelectorAll('.customer-row.is-checked').forEach((row) => {
        row.classList.remove('is-checked');
      });
      bar.hidden = true;
      bar.setAttribute('aria-hidden', 'true');
      bar.classList.remove('is-visible');
    };

    const renderBar = () => {
      if (!selected.size) {
        clearSelection();
        return;
      }
      bar.hidden = false;
      bar.setAttribute('aria-hidden', 'false');
      bar.classList.add('is-visible');
      bar.innerHTML = `
        <span class="v9-bulk-bar__count">${selected.size} valda</span>
        <button type="button" class="v9-bulk-bar__action" data-v9-bulk="reminder">Skicka påminnelse</button>
        <button type="button" class="v9-bulk-bar__action" data-v9-bulk="export">Exportera CSV</button>
        <button type="button" class="v9-bulk-bar__close" data-v9-bulk="clear" aria-label="Avmarkera alla">×</button>`;
    };

    bar.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-v9-bulk]');
      if (!btn) return;
      event.preventDefault();
      const action = btn.getAttribute('data-v9-bulk');
      if (action === 'clear') {
        clearSelection();
        return;
      }
      if (action === 'reminder') {
        api?.runBulkReminder?.();
        clearSelection();
        return;
      }
      if (action === 'export') {
        api?.runBulkExport?.();
        clearSelection();
      }
    });

    document.addEventListener(
      'click',
      (event) => {
        if (!isCustomersView()) return;
        const row = event.target.closest('.customer-row[data-patient-row]');
        if (!row) return;
        const rect = row.getBoundingClientRect();
        if (event.clientX - rect.left > 36) return;
        event.preventDefault();
        event.stopPropagation();
        const id = row.getAttribute('data-patient-row');
        if (!id) return;
        if (selected.has(id)) {
          selected.delete(id);
          row.classList.remove('is-checked');
        } else {
          selected.add(id);
          row.classList.add('is-checked');
        }
        renderBar();
      },
      true
    );
  }

  function buildSlideOverNotes(card, dossierBundle) {
    const notes = [];
    const important = String(card?.importantNote || '').trim();
    if (important) {
      notes.push({ text: important, meta: 'Viktig notering · patientkort' });
    }
    for (const allergy of asArray(dossierBundle?.allergies || card?.allergies)) {
      const name = allergy?.name || allergy?.label;
      if (!name) continue;
      notes.push({
        text: `Allergi: ${name}${allergy.severity ? ` (${allergy.severity})` : ''}`,
        meta: allergy.noteAt || allergy.source || 'Medicinsk',
      });
    }
    for (const ev of asArray(dossierBundle?.recentEvents)) {
      const kind = String(ev?.kind || '').toLowerCase();
      if (!kind.includes('note') && !kind.includes('anteck')) continue;
      notes.push({
        text: ev.subject || ev.body || ev.text || 'Anteckning',
        meta: ev.at || ev.occurredAt || '',
      });
    }
    return notes.slice(0, 5);
  }

  function renderSlideOverNotesHtml(notes) {
    if (!notes.length) {
      return '<p class="dossier-empty">Inga anteckningar registrerade.</p>';
    }
    return notes
      .map(
        (note) => `
        <div class="dossier-note kundkort-slide-over__note">
          ${escapeHtml(note.text)}
          <div class="dossier-note-meta">${escapeHtml(note.meta || '')}</div>
        </div>`
      )
      .join('');
  }

  function renderKundkortSlideOverFooter(card) {
    const patientId = card?.patientId || card?.id || '';
    return `
      <footer class="kundkort-slide-over__footer" data-kundkort-section="footer" aria-label="Dossiér-footer">
        <button type="button" class="kundkort-slide-over__footer-btn" data-patient-action="gdpr-export">
          Exportera GDPR-paket
        </button>
        <button type="button" class="kundkort-slide-over__footer-btn" data-v9-slide-footer="activity">
          Aktivitetslog
        </button>
        ${
          patientId
            ? `<span class="kundkort-slide-over__footer-id" title="Patient-ID">${escapeHtml(String(patientId).slice(0, 8))}…</span>`
            : ''
        }
      </footer>`;
  }

  function renderKundkortSlideOverHtml(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline = null,
    driveFiles = null
  ) {
    if (!isV9On() || !card) return '';

    const bundleCard =
      dossierBundle?.card && typeof dossierBundle.card === 'object'
        ? { ...card, ...dossierBundle.card }
        : card;
    const docsBundle = dossierBundle?.documentBundle || dossierBundle;

    const upcomingList = buildV11UpcomingDisplayList(bundleCard, occasionTimeline);
    const upcomingInner = upcomingList.length
      ? `<div class="v11-upcoming-bookings__list">${upcomingList
          .map((row, index) => renderV11UpcomingBookingRow(row, index))
          .join('')}</div>`
      : '<p class="dossier-empty">Inga kommande bokningar.</p>';

    const history = buildHistoryBookings(bundleCard, occasionTimeline);
    const historyHtml = history.length
      ? history.map((b) => renderSynthesisBookingRow(b)).join('')
      : '<p class="dossier-empty">Ingen historik ännu.</p>';

    const files = buildSynthesisFileTiles(bundleCard, driveFiles);
    const fileCount = countRealFiles(bundleCard, driveFiles);
    const filesHtml = files.length
      ? `<div class="dossier-files dossier-files--synthesis">${files.map((f) => renderSynthesisFileTile(f)).join('')}</div>`
      : '<p class="dossier-empty">Inga filer importerade ännu.</p>';

    const notes = buildSlideOverNotes(bundleCard, dossierBundle);
    const notesHtml = renderSlideOverNotesHtml(notes);

    const comm = buildCommunicationItems(bundleCard, occasionTimeline);
    const commHtml = comm.length
      ? comm
          .map(
            (c) => `
            <div class="dossier-comm">
              <div class="dossier-comm-icon" data-type="${escapeHtml(c.type)}">${commIcon(c.type)}</div>
              <div class="dossier-comm-body">
                <div class="dossier-comm-text">${escapeHtml(c.text)}</div>
                <div class="dossier-comm-meta">${escapeHtml(String(c.meta))}</div>
              </div>
            </div>`
          )
          .join('')
      : '<p class="dossier-empty">Ingen registrerad kommunikation.</p>';

    const economy = buildEconomyFields(bundleCard);
    const economyHtml = `
      <div class="dossier-economy">
        ${economy
          .map(
            (m) => `
          <div class="dossier-money">
            <div class="dossier-money-label">${escapeHtml(m.label)}</div>
            <div class="dossier-money-value">${escapeHtml(m.value)}</div>
          </div>`
          )
          .join('')}
      </div>`;

    const compliance = buildComplianceItems(bundleCard);
    const complianceHtml =
      compliance.length > 0
        ? compliance
            .map(
              (item) => `
            <button type="button" class="dossier-compliance-row" data-tone="${escapeHtml(item.tone)}" data-v9-compliance-action="${escapeHtml(item.action)}">
              <span class="dossier-compliance-label">${escapeHtml(item.label)}</span>
              <span class="dossier-compliance-go">Åtgärda</span>
            </button>`
            )
            .join('')
        : '<p class="dossier-empty">Alla formulär och krav är uppfyllda.</p>';

    const sticky = renderV11StickyActions(bundleCard, journalEntries);
    const footer = renderKundkortSlideOverFooter(bundleCard);
    const head = renderKundkortSlideOverHead(bundleCard);
    const lift = renderKundkortLiftPanel(bundleCard, dossierBundle, journalEntries, driveFiles);

    const sections = [
      renderKundkortSlideSection(
        'upcoming',
        'Kommande bokningar',
        upcomingList.length,
        upcomingInner,
        {
          open: true,
        }
      ),
      renderKundkortSlideSection('historik', 'Historik', history.length, historyHtml),
      renderKundkortSlideSection('filer', 'Filer', fileCount, filesHtml),
      renderKundkortSlideSection('anteckningar', 'Anteckningar', notes.length, notesHtml),
      renderKundkortSlideSection('kontakt', 'Kommunikation', comm.length, commHtml),
      renderKundkortSlideSection('ekonomi', 'Ekonomi', economy.length, economyHtml, {
        secondary: true,
      }),
      renderKundkortSlideSection(
        'compliance',
        'Formulär & krav',
        compliance.length,
        complianceHtml
      ),
    ];

    if (typeof window !== 'undefined' && window.__renderReferensKundkort) {
      return `
      <div class="kundkort-slide-over kundkort-slide-over--v2 v9-surface-vellum" data-kundkort-slide-over data-v11-dossier-zones>
        <button type="button" class="dossier-close" data-v9-dossier-close title="Stäng" aria-label="Stäng dossiér" style="position:absolute;top:14px;right:14px;z-index:6">×</button>
        <div class="kundkort-slide-over__scroll" data-kundkort-slide-over-scroll data-v9-dossier-scroll aria-label="Kunddossiér">
          <div class="kkref">${window.__renderReferensKundkort(bundleCard, dossierBundle, journalEntries, { occasionTimeline })}</div>
          ${footer}
        </div>
      </div>`;
    }
    return `
      <div class="kundkort-slide-over kundkort-slide-over--v2 v9-surface-vellum" data-kundkort-slide-over data-v11-dossier-zones>
        ${head}
        ${lift}
        ${renderV11Hairstrand()}
        <div class="kundkort-slide-over__scroll" data-kundkort-slide-over-scroll data-v9-dossier-scroll aria-label="Kunddossiér">
          ${sections.join('')}
          ${renderV11Hairstrand()}
          ${sticky ? `<div data-kundkort-section="actions">${sticky}</div>` : ''}
          ${footer}
        </div>
      </div>`;
  }

  function bindKundkortSlideOver(root, handlers = {}, ctx = null) {
    if (!root) return;
    if (typeof window.__enhanceReferensKundkort === 'function') {
      window.__enhanceReferensKundkort(root);
    }
    const liveCtx = ctx || root._v9IntelCtx || { card: null, journalEntries: [] };
    bindIntelligentJourney(root, liveCtx, handlers);
    bindDossierScroll(root, handlers);
    bindDossierNavigation(root, handlers);

    root.querySelectorAll('[data-v9-slide-footer="activity"]').forEach((btn) => {
      if (btn.dataset.slideFooterBound === '1') return;
      btn.dataset.slideFooterBound = '1';
      btn.addEventListener('click', () => {
        if (handlers.switchTab) {
          handlers.switchTab('tidslinje');
          return;
        }
        scrollDossierSection(root, 'kontakt');
      });
    });
  }

  function renderIntelligentJourneyBubblesHtml(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline,
    driveFiles = null
  ) {
    if (!isV9On() || !card) return '';

    if (usesV10KundkortFacit()) {
      return '';
    }

    const slideOver = renderKundkortSlideOverHtml(
      card,
      journalEntries,
      dossierBundle,
      occasionTimeline,
      driveFiles
    );
    if (slideOver) return slideOver;

    const v11 = renderV11DossierZonesHtml(
      card,
      journalEntries,
      dossierBundle,
      {},
      occasionTimeline
    );
    if (v11) return v11;

    const journey = buildIntelligentJourneyBubbles(card, journalEntries);
    const featured = buildIntelFeaturedCards(card, journalEntries);
    if (!featured.length && !journey.bubbles.length) return '';

    return `
      <section class="v9-intel-bubbles v9-intel-bubbles--cards" data-v9-intel-bubbles aria-label="Intelligenta statusbubblor">
        <div class="v9-intel-bubbles__head">
          <span class="v9-intel-bubbles__kicker">Insikter</span>
          <button type="button" class="v9-intel-bubbles__all" data-v9-intel-open-all>Visa kundresa ›</button>
        </div>
        <div class="dossier-ai-grid v9-intel-featured-grid">
          ${featured.map((item, index) => renderIntelFeaturedCard(item, index)).join('')}
        </div>
        ${renderIntelChromeActionsHtml(card)}
        ${journey.footer ? `<p class="v9-intel-bubbles__footer">${escapeHtml(journey.footer)}</p>` : ''}
      </section>`;
  }

  function openIntelDrawer(root, state) {
    const drawer = root?.querySelector('[data-v9-intel-drawer]');
    const body = drawer?.querySelector('[data-v9-intel-drawer-body]');
    const title = drawer?.querySelector('[data-v9-intel-drawer-title]');
    if (!drawer || !body) return;
    if (title) title.textContent = state.title || 'Kundresa';
    body.innerHTML = renderIntelDrawerBodyHtml(state);
    drawer.removeAttribute('hidden');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    const focusEl = body.querySelector(
      '.v9-intel-drawer-step-wrap.is-focused .v9-intel-drawer-step:not(.is-disabled)'
    );
    (focusEl || drawer.querySelector('[data-v9-intel-drawer-close]'))?.focus?.();
  }

  function closeIntelDrawer(root) {
    const drawer = root?.querySelector('[data-v9-intel-drawer]');
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('hidden', '');
    drawer.setAttribute('aria-hidden', 'true');
    const body = drawer.querySelector('[data-v9-intel-drawer-body]');
    if (body) body.innerHTML = '';
  }

  function bindIntelligentJourney(root, ctx, handlers = {}) {
    if (!root) return;
    root._v9IntelCtx = {
      card: ctx?.card,
      journalEntries: ctx?.journalEntries,
      handlers: handlers || {},
    };
    root._v11DocFilters = root._v11DocFilters || { filler: 'all', flow: 'all', view: 'category' };

    if (root.dataset.intelBound === '1') return;
    root.dataset.intelBound = '1';

    root.addEventListener('click', (event) => {
      const live = root._v9IntelCtx || {};
      const card = live.card;
      const journalEntries = live.journalEntries;
      const liveHandlers = live.handlers || {};
      const journey = buildIntelligentJourneyBubbles(card, journalEntries);

      if (event.target.closest('[data-v9-intel-drawer-close]')) {
        closeIntelDrawer(root);
        return;
      }

      const filterBtn = event.target.closest('[data-v11-doc-filter]');
      if (filterBtn) {
        const axis = filterBtn.getAttribute('data-v11-doc-filter') || '';
        const value = filterBtn.getAttribute('data-v11-doc-value') || '';
        if (!axis || !value) return;
        const state = root._v11DocFilters || { filler: 'all', flow: 'all', view: 'category' };
        state[axis] = value;
        root._v11DocFilters = state;
        root.querySelectorAll(`[data-v11-doc-filter="${axis}"]`).forEach((btn) => {
          const active = btn.getAttribute('data-v11-doc-value') === value;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        applyV11DocumentFilters(root, state);
        return;
      }

      const host = event.target.closest('[data-v11-dossier-zones], [data-v9-intel-bubbles]');
      if (!host) return;

      const openDrawer = ({ focusId = '', title = 'Kundresa', intro = journey.lead } = {}) => {
        openIntelDrawer(root, {
          title,
          intro,
          bubbles: journey.bubbles,
          focusId,
        });
      };

      const openAllBtn = event.target.closest('[data-v9-intel-open-all]');
      if (openAllBtn) {
        openDrawer({
          intro: buildV11DrawerIntro(card),
        });
        return;
      }

      const cardBtn = event.target.closest('[data-v9-intel-card]');
      if (cardBtn) {
        const cardId = cardBtn.getAttribute('data-v9-intel-card') || '';
        const kind = cardBtn.getAttribute('data-v9-intel-kind') || '';
        const copy = readV11InsightCardCopy(cardBtn);
        if (kind === 'journey') {
          openDrawer({
            focusId: cardId,
            title: copy.title || 'Kundresa',
            intro: resolveIntelBubbleBody(
              journey.bubbles.find((bubble) => bubble.id === cardId) || {}
            ),
          });
          return;
        }
        if (kind === 'automation') {
          openDrawer({
            title: copy.title || 'Nästa steg',
            intro: copy.body || buildV11DrawerIntro(card),
          });
          return;
        }
        openDrawer({
          title: copy.title || 'Insikt',
          intro: copy.body || journey.lead,
        });
        return;
      }

      const actionBtn = event.target.closest('[data-v9-intel-action]');
      if (!actionBtn || actionBtn.disabled) return;
      const action = actionBtn.getAttribute('data-v9-intel-action') || '';
      if (action === 'photo') {
        root.querySelector('.v9-camera-bridge [data-patient-photo-camera]')?.click();
      } else if (action === 'book') {
        liveHandlers.openBook?.();
      } else if (action === 'confirm') {
        liveHandlers.confirmBookings?.();
      }
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!root.querySelector('[data-v9-intel-drawer].is-open')) return;
      closeIntelDrawer(root);
    });
  }

  function renderDossierQuickPillsHtml(card) {
    if (!isV9On() || !card) return '';
    const upcoming = buildUpcomingBookings(card, []);
    const upcomingCount = upcoming.length;
    const nextDate = formatShortBookingDate(card?.nextBookingAt);
    const bookLabel = card?.nextBookingAt
      ? `Boka nästa ${card.nextBookingType || 'PRP'}${nextDate ? ` (${nextDate})` : ''}`
      : 'Boka nästa tid';
    const confirmDisabled = upcomingCount === 0;
    const contextPills = buildZone3ContextPills(card);
    const brand = resolvePatientBrand(card);
    const brandLabel = brand === 'curatiio' ? 'Curatiio' : 'Hair TP Clinic';

    const contextHtml =
      contextPills.length > 0
        ? `
        <div class="v9-zone3-context" data-v9-zone3-context aria-label="Formulär och avtal">
          <div class="v9-zone3-context__head">
            <span class="v9-zone3-context__kicker">${escapeHtml(brandLabel)}</span>
            <span class="v9-zone3-context__meta">${contextPills.length} genvägar</span>
          </div>
          <div class="v9-zone3-context__pills">
            ${contextPills
              .map(
                (pill) => `
              <button
                type="button"
                class="quick-pill quick-pill--context${pill.urgent ? ' quick-pill--urgent' : ''}"
                data-v9-context="${escapeHtml(pill.id)}"
              >${escapeHtml(pill.label)}</button>`
              )
              .join('')}
          </div>
        </div>`
        : '';

    return `
      <footer class="v9-dossier-zone3" data-v9-zone3 aria-label="Snabbåtgärder">
        <div class="v9-zone3-primary dossier-actions v9-dossier-actions" data-v9-dossier-actions>
          <button type="button" class="quick-pill dossier-camera-cta full" data-v9-quick="photo" data-v9-cam-open>📷 Ta bild · spara i journal</button>
          <button type="button" class="quick-pill quick-pill--ai full" data-v9-quick="book">${escapeHtml(bookLabel)}</button>
          <button type="button" class="quick-pill" data-v9-quick="journal">✎ Anteckna</button>
          <button type="button" class="quick-pill" data-v9-quick="reply">✉ Svarstudio</button>
          <button
            type="button"
            class="quick-pill quick-pill--success full${confirmDisabled ? ' is-disabled' : ''}"
            data-v9-quick="confirm"
            ${confirmDisabled ? 'disabled aria-disabled="true"' : ''}
          >✓ Bekräfta kommande tider (${upcomingCount})</button>
        </div>
        ${contextHtml}
      </footer>`;
  }

  function bindDossierQuickPills(root, handlers) {
    if (!root) return;
    const zone3 = root.querySelector('[data-v9-zone3]');
    if (!zone3 || zone3.dataset.bound === '1') return;
    zone3.dataset.bound = '1';

    zone3.addEventListener('click', (event) => {
      const quickBtn = event.target.closest('[data-v9-quick]');
      if (quickBtn) {
        if (quickBtn.disabled) return;
        const action = quickBtn.getAttribute('data-v9-quick');
        if (action === 'photo') return;
        if (action === 'book' && handlers.openBook) handlers.openBook();
        else if (action === 'journal' && handlers.openJournal) handlers.openJournal();
        else if (action === 'reply' && handlers.openReply) handlers.openReply();
        else if (action === 'confirm' && handlers.confirmBookings) handlers.confirmBookings();
        return;
      }
      const ctxBtn = event.target.closest('[data-v9-context]');
      if (ctxBtn && handlers.openContext) {
        handlers.openContext(ctxBtn.getAttribute('data-v9-context') || '');
      }
    });

    root.querySelectorAll('[data-v9-open-deep]').forEach((node) => {
      if (node.dataset.bound === '1') return;
      node.dataset.bound = '1';
      node.addEventListener('click', () => {
        const mode = node.getAttribute('data-v9-open-deep') || 'filer';
        handlers.openDeep?.(mode);
      });
    });
  }

  function normalizeNoteText(entry) {
    if (!entry) return '';
    if (typeof entry === 'string') return entry.slice(0, 280);
    return String(entry.summary || entry.note || entry.clinicalSummary || entry.title || '').slice(
      0,
      280
    );
  }

  function formatNoteMeta(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const parts = [];
    if (entry.authorName || entry.signedByName) parts.push(entry.authorName || entry.signedByName);
    const ts = entry.signedAt || entry.updatedAt || entry.createdAt;
    if (ts) parts.push(String(ts).slice(0, 10));
    return parts.join(' · ') || 'Journal';
  }

  function bindDossierScroll(root, handlers = {}) {
    if (!root) return;
    root.querySelectorAll('[data-v9-insight-idx]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-insight-action') || '';
        if (action === 'book_suggestion' || action === 'suggestPRPSlot') {
          global.dispatchEvent(
            new CustomEvent('cco:v9-ghost-booking', {
              detail: { source: 'ai-insight', label: btn.textContent?.trim() || '' },
            })
          );
          return;
        }
        btn.classList.add('is-activated');
        window.setTimeout(() => btn.classList.remove('is-activated'), 1200);
      });
    });

    root.querySelectorAll('[data-v9-open-journal-full]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        if (handlers.openJournal) handlers.openJournal();
        else
          global.dispatchEvent(
            new CustomEvent('cco:v9-open-dossier-deep', { detail: { mode: 'journal' } })
          );
      });
    });

    root.querySelectorAll('[data-v9-compliance-action]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-v9-compliance-action') || 'form';
        if (action === 'journal' && handlers.openJournal) {
          handlers.openJournal();
          return;
        }
        if (handlers.openForm) handlers.openForm();
        else if (handlers.openJournal) handlers.openJournal();
      });
    });

    root.querySelectorAll('.dossier-booking--synthesis').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        if (handlers.switchTab) handlers.switchTab('tidslinje');
        else if (handlers.openDeep) handlers.openDeep('tidslinje');
      });
    });

    root.querySelectorAll('[data-v9-section-link]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const sectionId = btn.getAttribute('data-v9-section-link') || '';
        const tabBySection = {
          filer: 'filer',
          upcoming: 'tidslinje',
          journal: 'journal',
          historik: 'tidslinje',
          ekonomi: 'avtal',
          kontakt: 'profil',
          compliance: 'profil',
        };
        const tabKey = tabBySection[sectionId];
        if (tabKey && handlers.switchTab) {
          handlers.switchTab(tabKey);
          return;
        }
        if (sectionId === 'filer' && handlers.openDeep) {
          handlers.openDeep('filer');
          return;
        }
        scrollDossierSection(root.closest('[data-patient-detail]') || root, sectionId);
      });
    });
  }

  function scrollDossierSection(root, sectionId) {
    if (!root || !sectionId) return false;
    const zone2 =
      root.querySelector('[data-kundkort-slide-over-scroll]') ||
      root.querySelector('[data-v9-dossier-scroll]');
    const target =
      root.querySelector(`[data-kundkort-section="${sectionId}"]`) ||
      root.querySelector(`[data-v9-section="${sectionId}"]`);
    if (!target) return false;

    if (target.tagName === 'DETAILS') {
      target.open = true;
      const more = target.closest('.v9-dossier-more');
      if (more && more.tagName === 'DETAILS') more.open = true;
    }

    setDossierNavActive(root, sectionId);

    if (zone2) {
      const top =
        target.getBoundingClientRect().top -
        zone2.getBoundingClientRect().top +
        zone2.scrollTop -
        6;
      zone2.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    target.classList.add('is-nav-target');
    window.clearTimeout(scrollDossierSection._flashTimer);
    scrollDossierSection._flashTimer = window.setTimeout(() => {
      target.classList.remove('is-nav-target');
    }, 1100);
    return true;
  }

  function setDossierNavActive(root, sectionId) {
    if (!root || !sectionId) return;
    root.querySelectorAll('[data-v9-jump]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-v9-jump') === sectionId);
    });
    root.querySelectorAll('[data-v9-stat-jump]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-v9-stat-jump') === sectionId);
    });
  }

  const DOSSIER_NAV_KEYS = Object.freeze({
    1: 'upcoming',
    2: 'journal',
    3: 'filer',
    4: 'kontakt',
  });

  const DOSSIER_SPY_SECTIONS = [
    'upcoming',
    'journal',
    'historik',
    'filer',
    'kontakt',
    'compliance',
    'ekonomi',
    'insikter',
  ];

  function resolveSpyJumpSection(sectionId) {
    if (sectionId === 'historik') return 'upcoming';
    if (sectionId === 'compliance') return 'upcoming';
    return sectionId;
  }

  function isNavTypingTarget(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function handleDossierNavKeydown(event) {
    if (!isV9On() || !isCustomersView()) return;
    const root = document.querySelector('.v9-mockup-dossier[data-patient-detail]');
    if (!root || isNavTypingTarget(event.target)) return;

    const searchOpen = document
      .getElementById('v9-search-overlay')
      ?.classList.contains('is-visible');
    if (searchOpen) return;

    const handlers = root._v9NavHandlers || {};

    if (event.key === 'Escape') {
      const deep = root.querySelector('[data-v9-dossier-deep]:not([hidden])');
      if (deep) {
        event.preventDefault();
        handlers.onCloseDeep?.();
        return;
      }
      event.preventDefault();
      handlers.onBack?.();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const sectionId = DOSSIER_NAV_KEYS[event.key];
    if (sectionId) {
      event.preventDefault();
      scrollDossierSection(root, sectionId);
    }
  }

  function bindDossierNavigation(root, handlers = {}) {
    if (!root) return;

    if (root._v9DossierSpy) {
      root._v9DossierSpy.disconnect();
      root._v9DossierSpy = null;
    }

    root._v9NavHandlers = handlers;
    root.dataset.navBound = '1';

    root.querySelector('[data-v9-nav-back]')?.addEventListener('click', (event) => {
      event.preventDefault();
      handlers.onBack?.();
    });

    const zone2 = root.querySelector('[data-v9-dossier-scroll]');
    if (zone2 && typeof IntersectionObserver !== 'undefined') {
      const spy = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          const hit = visible[0]?.target?.getAttribute?.('data-v9-section');
          if (hit) setDossierNavActive(root, resolveSpyJumpSection(hit));
        },
        { root: zone2, threshold: [0.2, 0.45, 0.7], rootMargin: '-8% 0px -55% 0px' }
      );
      DOSSIER_SPY_SECTIONS.forEach((id) => {
        const node = root.querySelector(`[data-v9-section="${id}"]`);
        if (node) spy.observe(node);
      });
      root._v9DossierSpy = spy;
    }

    if (!global.__ARCANA_V9_DOSSIER_NAV_KEY__) {
      global.__ARCANA_V9_DOSSIER_NAV_KEY__ = true;
      document.addEventListener('keydown', handleDossierNavKeydown);
    }
  }

  function unbindDossierNavigation(root) {
    if (!root) return;
    if (root._v9DossierSpy) {
      root._v9DossierSpy.disconnect();
      root._v9DossierSpy = null;
    }
    root._v9NavHandlers = null;
    root.dataset.navBound = '0';
  }

  function syncGlobalSearchInput() {
    const globalInput = document.querySelector('[data-v9-global-search-input]');
    const legacyInput = document.querySelector('[data-customer-search]');
    if (!globalInput || !legacyInput) return;
    if (globalInput.dataset.bound === '1') return;
    globalInput.dataset.bound = '1';
    // Sök kopplas i patient-master-ui (server q=). Här bara synka värden om legacy skrivs.
    legacyInput.addEventListener('input', () => {
      if (globalInput.value !== legacyInput.value) globalInput.value = legacyInput.value;
    });
  }

  function exportBulkCsv(rows, filename) {
    const header = ['patientId', 'namn', 'email', 'telefon', 'segment'];
    const lines = [header.join(';')];
    for (const row of rows) {
      lines.push(
        [row.patientId || '', row.name || '', row.email || '', row.phone || '', row.segment || '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(';')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runBulkReminder(api) {
    const runtime = api?.getRuntime?.();
    if (!runtime) return;
    const segment = runtime.segmentFilter || 'risk';
    const patients = asArray(runtime.patients);
    if (!patients.length) {
      window.alert('Inga kunder i aktuellt urval att påminna.');
      return;
    }
    const rows = patients.slice(0, 200).map((p) => ({
      patientId: p.patientId,
      name: p.displayName || p.name || p.patientId,
      email: p.primaryEmail || '',
      phone: p.primaryPhone || '',
      segment,
    }));
    exportBulkCsv(rows, `mass-paminnelse-${segment}-${Date.now()}.csv`);
    api.setStatus?.(`Mass-påminnelse: ${rows.length} rader exporterade (${segment}).`, 'success');
  }

  function runBulkCampaign(api) {
    const runtime = api?.getRuntime?.();
    if (!runtime) return;
    const patients = asArray(runtime.patients).filter(
      (p) => p.isVip || p.segmentHints?.vip || p.chips?.includes?.('vip')
    );
    if (!patients.length) {
      window.alert('Inga VIP-kunder i aktuellt urval för kampanj.');
      return;
    }
    const rows = patients.slice(0, 200).map((p) => ({
      patientId: p.patientId,
      name: p.displayName || p.name || p.patientId,
      email: p.primaryEmail || '',
      phone: p.primaryPhone || '',
      segment: 'vip_inactive',
    }));
    exportBulkCsv(rows, `kampanj-vip-inaktiva-${Date.now()}.csv`);
    api.setStatus?.(`Kampanjurval: ${rows.length} VIP-kunder exporterade.`, 'success');
  }

  function runBulkExport(api) {
    const runtime = api?.getRuntime?.();
    if (!runtime) return;
    const patients = asArray(runtime.patients);
    if (!patients.length) {
      window.alert('Inget urval att exportera.');
      return;
    }
    const rows = patients.slice(0, 500).map((p) => ({
      patientId: p.patientId,
      name: p.displayName || p.name || p.patientId,
      email: p.primaryEmail || '',
      phone: p.primaryPhone || '',
      segment: runtime.segmentFilter || runtime.activeSegmentId || 'all',
    }));
    exportBulkCsv(rows, `kundurval-${Date.now()}.csv`);
    api.setStatus?.(`Exporterade ${rows.length} kunder.`, 'success');
  }

  function bindAggBulkActions(api) {
    const host = document.querySelector('[data-v9-agg-insights]');
    if (!host || host.dataset.bulkBound === '1') return;
    host.dataset.bulkBound = '1';
    host.addEventListener('click', (event) => {
      const actionEl = event.target.closest('.agg-insight-action');
      if (!actionEl) return;
      const text = actionEl.textContent || '';
      if (text.includes('mass-påminnelse') || text.includes('påminnelse')) {
        event.preventDefault();
        event.stopPropagation();
        runBulkReminder(api);
        return;
      }
      if (text.includes('kampanj') || text.includes('Kampanj')) {
        event.preventDefault();
        event.stopPropagation();
        runBulkCampaign(api);
        return;
      }
      if (text.includes('analys') || text.includes('Analys')) {
        event.preventDefault();
        event.stopPropagation();
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'analytics');
        window.history.pushState(window.history.state, '', url.toString());
        document.querySelector('[data-nav-view="analytics"]')?.click();
        return;
      }
      if (text.includes('Exportera') || text.includes('export')) {
        event.preventDefault();
        event.stopPropagation();
        runBulkExport(api);
      }
    });
  }

  function bindListControls(api) {
    const filters = document.querySelector('[data-v9-customers-filters]');
    if (!filters || filters.dataset.parityBound === '1') return;
    filters.dataset.parityBound = '1';
    filters.addEventListener('click', (event) => {
      if (!isV9On()) return;
      if (event.target.closest('[data-v9-sort-trigger]')) {
        event.preventDefault();
        api.cycleSort?.();
        return;
      }
      if (event.target.closest('[data-v9-view-toggle]')) {
        event.preventDefault();
        api.toggleView?.();
      }
    });
  }

  function install(api) {
    if (!api || global.__ARCANA_V9_PARITY_INSTALLED__) return;
    global.__ARCANA_V9_PARITY_INSTALLED__ = true;

    api.cycleSort = () => {
      const runtime = api.getRuntime?.();
      if (!runtime) return;
      const idx = SORT_ORDER.indexOf(runtime.v9SortKey || 'activity');
      runtime.v9SortKey = SORT_ORDER[(idx + 1) % SORT_ORDER.length];
      api.syncListChrome?.();
      api.renderRows?.();
    };

    api.toggleView = () => {
      const runtime = api.getRuntime?.();
      if (!runtime) return;
      runtime.v9ListView = runtime.v9ListView === 'grid' ? 'list' : 'grid';
      api.syncListChrome?.();
      api.renderRows?.();
    };

    api.syncListChrome = () => {
      const runtime = api.getRuntime?.();
      if (!runtime || !isV9On()) return;
      const list = document.querySelector('[data-customer-list]');
      if (list) list.setAttribute('data-v9-list-view', runtime.v9ListView || 'list');
      const sortBtn = document.querySelector('[data-v9-sort-trigger]');
      if (sortBtn) {
        sortBtn.textContent = SORT_LABELS[runtime.v9SortKey] || SORT_LABELS.activity;
      }
      const viewBtn = document.querySelector('[data-v9-view-toggle]');
      if (viewBtn) {
        const grid = runtime.v9ListView === 'grid';
        viewBtn.textContent = grid ? '▦ Rutnät' : '≡ Lista';
        viewBtn.setAttribute('aria-pressed', grid ? 'false' : 'true');
      }
    };

    api.sortPatients = (patients) => {
      const runtime = api.getRuntime?.();
      if (!runtime || !isV9On()) return patients;
      const key = runtime.v9SortKey || 'activity';
      const arr = [...asArray(patients)];
      arr.sort((a, b) => {
        if (key === 'name') {
          const an = a.displayName || a.name || a.patientId || '';
          const bn = b.displayName || b.name || b.patientId || '';
          return an.localeCompare(bn, 'sv');
        }
        if (key === 'revenue') {
          return (
            Number(b.lifetimeValue ?? b.dealValue ?? 0) -
            Number(a.lifetimeValue ?? a.dealValue ?? 0)
          );
        }
        const ta = Date.parse(a.lastVisitAt || a.lastBookingAt || a.updatedAt || 0) || 0;
        const tb = Date.parse(b.lastVisitAt || b.lastBookingAt || b.updatedAt || 0) || 0;
        return tb - ta;
      });
      return arr;
    };

    bindListControls(api);
    bindAggBulkActions(api);
    bindV9BulkSelection(api);
    syncGlobalSearchInput();

    global.addEventListener('cco:v9-ghost-booking', (event) => {
      const label = event.detail?.label || 'Bokningsförslag';
      api.setStatus?.(`Ghost-bokning (förslag): ${label}`, 'success');
    });
  }

  global.CcoV9CustomersParity = {
    SORT_LABELS,
    resolveV11DocumentPayload,
    renderV11Hero,
    renderKundkortSlideOverHtml,
    bindKundkortSlideOver,
    bindV9BulkSelection,
    renderV11MedicalBriefing,
    renderV11StatRow,
    renderV11Hairstrand,
    renderV11DocumentFilters,
    renderV11DocumentSegments,
    renderV11InsightsStrip,
    renderV11StickyActions,
    renderV11UpcomingBookings,
    buildHistoryBookings,
    buildUpcomingBookings,
    renderV11CustomerJourney,
    buildV11CustomerJourney,
    buildEconomyFields,
    renderV11WeeklyPatterns,
    renderV11DossierZonesHtml,
    renderV10DriveFilesHtml,
    usesV10KundkortFacit,
    buildIntelligentJourneyBubbles,
    renderIntelligentJourneyBubblesHtml,
    bindIntelligentJourney,
    renderDossierScrollHtml,
    renderDossierQuickPillsHtml,
    bindDossierScroll,
    bindDossierQuickPills,
    bindDossierNavigation,
    unbindDossierNavigation,
    scrollDossierSection,
    setDossierNavActive,
    install,
    runBulkReminder,
    runBulkCampaign,
    runBulkExport,
  };
})(typeof window !== 'undefined' ? window : global);

/* ============================================================
   Top-nav kundsök → återanvänder befintlig kundsök (additivt, ingen ny dataväg)
   Speglar mockupens .global-search. Document-delegerat = timing-säkert.
   ============================================================ */
(function wireCcoTopnavSearch() {
  if (typeof document === 'undefined') return;
  if (window.__ccoTopnavSearchWired) return;
  window.__ccoTopnavSearchWired = true;
  function realInput() {
    return document.querySelector('[data-v9-global-search-input]');
  }
  // Fokus på top-nav-söket → säkerställ att Kunder-vyn är aktiv så söken biter
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || typeof t.matches !== 'function' || !t.matches('[data-cco-topnav-search-input]'))
      return;
    if (!realInput()) {
      var navBtn = document.querySelector('.preview-nav-item[data-nav-view="customers"]');
      if (navBtn) navBtn.click();
    }
  });
  // Skriv i top-nav-söket → spegla in i den befintliga kundsöken (driver setCustomerSearchQuery)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || typeof t.matches !== 'function' || !t.matches('[data-cco-topnav-search-input]'))
      return;
    var real = realInput();
    if (real && real !== t) {
      real.value = t.value;
      real.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
})();
