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
    return buildSynthesisAiInsights(card);
  }

  function buildSynthesisAiInsights(card) {
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
        icon: '✦',
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
      rows.push(
        bookingParts(
          card.nextBookingAt,
          card.nextBookingType || 'Kommande besök',
          sub,
          card.nextBookingStatus === 'tentative' ? 'warn' : 'ready',
          card.nextBookingStatus === 'tentative' ? '⚠ Friskförs.' : '✓ Redo',
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
      if (!kind.includes('booking')) continue;
      const ts = ev.ts || ev.occurredAt;
      if (ts && Date.parse(ts) > Date.now()) continue;
      rows.push(
        bookingParts(ts, ev.title || ev.label || 'Historik', ev.summary || '', 'done', 'Klar')
      );
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
    { synthesisOnly = false } = {}
  ) {
    const upcoming = buildUpcomingBookings(card, occasionTimeline);
    const history = buildHistoryBookings(card, occasionTimeline);
    const journalRows = buildJournalPreviewEntries(journalEntries);
    const realFileCount = countRealFiles(card, driveFiles);
    const files = buildSynthesisFileTiles(card, driveFiles);
    const comm = buildCommunicationItems(card, occasionTimeline);
    const economy = buildEconomyFields(card);
    const insights = buildSynthesisAiInsights(card);
    const compliance = buildComplianceItems(card);

    const upcomingHtml = upcoming.length
      ? upcoming
          .map((b, i) => renderSynthesisBookingRow(b, i === 0 ? 'data-jump-current="1"' : ''))
          .join('')
      : '<p class="dossier-empty">Inga kommande bokningar.</p>';

    const filesHtml = files.length
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
            <span class="dossier-insight__icon" aria-hidden="true">${escapeHtml(ins.icon || '★')}</span>
            <span class="dossier-insight__copy">
              <span class="dossier-insight__title">${escapeHtml(ins.title || 'AI')}</span>
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

    const primary = [
      renderSynthesisBlock('upcoming', 'Kommande bokningar', upcoming.length, upcomingHtml, {
        headLink: upcoming.length > 0 ? 'Visa alla ›' : '',
      }),
      renderSynthesisBlock('filer', 'Filer', realFileCount, filesHtml, {
        headLink: realFileCount > 0 ? 'Visa alla ›' : '',
      }),
      renderSynthesisBlock('ai', 'AI-insikter', insights.length, aiHtml),
    ];

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

  function renderDossierQuickPillsHtml(card) {
    if (!isV9On() || !card) return '';
    const upcoming = buildUpcomingBookings(card, []);
    const upcomingCount = upcoming.length;
    const nextDate = formatShortBookingDate(card?.nextBookingAt);
    const bookLabel = card?.nextBookingAt
      ? `★ Boka nästa ${card.nextBookingType || 'PRP'}${nextDate ? ` (${nextDate})` : ''}`
      : '★ Boka nästa tid';
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
    const zone2 = root.querySelector('[data-v9-dossier-scroll]');
    const target = root.querySelector(`[data-v9-section="${sectionId}"]`);
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
    'ai',
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
    globalInput.addEventListener('input', () => {
      legacyInput.value = globalInput.value;
      legacyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    legacyInput.addEventListener('input', () => {
      if (globalInput.value !== legacyInput.value) globalInput.value = legacyInput.value;
    });
    globalInput.addEventListener('focus', () => {
      global.dispatchEvent(new CustomEvent('cco:v9-open-search'));
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
    syncGlobalSearchInput();

    global.addEventListener('cco:v9-ghost-booking', (event) => {
      const label = event.detail?.label || 'Bokningsförslag';
      api.setStatus?.(`Ghost-bokning (förslag): ${label}`, 'success');
    });
  }

  global.CcoV9CustomersParity = {
    SORT_LABELS,
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
