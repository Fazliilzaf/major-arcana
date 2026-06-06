/**
 * ORD-28 — Kundkort blueprint (3-kolumn desktop: lista · arbetsyta · kundkort).
 * source: iCloud CCO-KUNDKORT-BLUEPRINT.md + cco-kundkort-blueprint.html
 */
(function (global) {
  'use strict';

  const doc = global.document;
  const parity = () => global.CcoV9CustomersParity || null;
  const smart = () => global.CcoKunderSmartNextStep || null;

  const WORKSPACE_TABS = Object.freeze([
    { id: 'oversikt', label: 'Översikt' },
    { id: 'journal', label: 'Journal' },
    { id: 'bokningar', label: 'Bokningar' },
    { id: 'dokument', label: 'Dokument' },
    { id: 'konversation', label: 'Konversation' },
  ]);

  const DOC_DOSSIER = Object.freeze([
    { id: 'health', icon: '🩺', title: 'Hälsodeklaration', metaKey: 'health' },
    { id: 'journal', icon: '📝', title: 'Journal / Encounter', metaKey: 'journal' },
    { id: 'offer', icon: '📄', title: 'Offert = Behandlingsplan', metaKey: 'offer' },
    { id: 'agreement', icon: '🖋️', title: 'Avtal + behandlingssamtycke', metaKey: 'agreement' },
    { id: 'fitness', icon: '🏥', title: 'Friskförsäkran', metaKey: 'fitness' },
    { id: 'photo', icon: '📷', title: 'Foto-samtycke', metaKey: 'photo' },
  ]);

  const RISK_PILL = Object.freeze({
    legal_blocker: { cls: 'legal', label: 'Legal' },
    legal: { cls: 'legal', label: 'Legal' },
    blocker: { cls: 'block', label: 'Blockerare' },
    needs_review: { cls: 'review', label: 'Granska' },
    ready: { cls: 'ready', label: 'Klar' },
    info: { cls: 'info', label: 'Info' },
  });

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

  function isBlueprintOn() {
    return doc?.documentElement?.getAttribute('data-v9-blueprint') === 'on';
  }

  function initialsFrom(card) {
    const name = String(card?.displayName || card?.name || '??').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function maskPersonnummer(card) {
    const raw = String(card?.personnummerMasked || card?.personnummer || '').trim();
    if (raw) return raw;
    return '—';
  }

  function resolveAllergies(card, dossierBundle) {
    const rows = [
      ...asArray(dossierBundle?.allergies),
      ...asArray(card?.allergies),
      ...asArray(card?.demographics?.allergies),
    ];
    const names = [];
    const seen = new Set();
    for (const row of rows) {
      const name = typeof row === 'string' ? row : row?.name || row?.label || row?.substance || '';
      const key = String(name).trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(String(name).trim());
    }
    return names;
  }

  function resolveTreatmentLabel(card) {
    return (
      card?.nextBookingType ||
      card?.lastBookingType ||
      asArray(card?.treatmentTypes)[0] ||
      card?.primaryTreatment ||
      '—'
    );
  }

  function resolvePractitioner(card) {
    return (
      card?.nextBookingResourceLabel || card?.practitionerName || card?.assignedPractitioner || '—'
    );
  }

  function resolveClinic(card) {
    return card?.clinicName || card?.clinic || 'Hair TP Clinic';
  }

  function journeyStepClass(step, blockedSteps) {
    const blocked = asArray(blockedSteps).map(String);
    if (step.status === 'done') return 'done';
    if (step.status === 'active' && blocked.includes(String(step.step))) return 'block';
    if (step.status === 'active') return 'active';
    if (step.status === 'pending') return 'block';
    return 'todo';
  }

  function journeyStatusText(step, cls) {
    if (cls === 'done') return step.meta ? `Klar · ${step.meta}` : 'Klar';
    if (cls === 'active') {
      if (step.step === 6) return step.dueLabel || 'Pågår · betänketid';
      return step.meta || 'Pågår';
    }
    if (cls === 'block') return step.meta || 'Blockerad';
    return 'Kommande';
  }

  function renderVerticalJourney(card, journalEntries, dossierBundle) {
    const build = parity()?.buildV11CustomerJourney;
    const journey = build ? build(card, journalEntries, dossierBundle) : null;
    const steps = asArray(journey?.steps).slice(0, 9);
    if (!steps.length) {
      return '<p class="bp-empty">Kundresa laddas från dossier-bundle.</p>';
    }
    const blocked = card?.blockedSteps || [];
    return steps
      .map((step) => {
        const cls = journeyStepClass(step, blocked);
        const mk = cls === 'done' ? '✓' : String(step.step);
        const status = journeyStatusText(step, cls);
        return `
          <div class="bp-step bp-step--${escapeHtml(cls)}" data-bp-journey-step="${step.step}">
            <div class="bp-step__mk">${escapeHtml(mk)}</div>
            <div>
              <div class="bp-step__t">${step.step} · ${escapeHtml(step.label || '')}</div>
              <div class="bp-step__s">${escapeHtml(status)}</div>
            </div>
          </div>`;
      })
      .join('');
  }

  function resolveDocStatus(card, dossierBundle, key) {
    const signals = asArray(card?.automationSignals).filter((s) => s?.status === 'active');
    const has = (frag) => signals.some((s) => String(s.ruleId || '').includes(frag));
    if (key === 'health') {
      if (card?.missingHealthDeclaration || has('missing_health_declaration')) {
        return { cls: 'miss', label: 'Saknas' };
      }
      return { cls: 'ok', label: 'Klar' };
    }
    if (key === 'journal') {
      if (has('missing_journal')) return { cls: 'miss', label: 'Saknas' };
      if (card?.hasJournal) return { cls: 'ok', label: 'Klar' };
      return { cls: 'wait', label: 'Väntar' };
    }
    if (key === 'offer') {
      if (has('missing_treatment_plan')) return { cls: 'miss', label: 'Saknas' };
      return { cls: 'wait', label: 'Väntar' };
    }
    if (key === 'agreement') {
      if (has('missing_agreement_consent_bundle')) return { cls: 'miss', label: 'Saknas' };
      return { cls: 'lock', label: 'Låst' };
    }
    if (key === 'fitness') {
      if (has('missing_operation_day_insurance')) return { cls: 'miss', label: 'Saknas' };
      return { cls: 'lock', label: 'Låst' };
    }
    if (key === 'photo') {
      if (has('missing_photo_consent')) return { cls: 'miss', label: 'Saknas' };
      return { cls: 'lock', label: 'Låst' };
    }
    return { cls: 'wait', label: 'Väntar' };
  }

  function resolveHealthDocPdfUrl(card, dossierBundle) {
    const bundleCard =
      dossierBundle?.card && typeof dossierBundle.card === 'object'
        ? { ...card, ...dossierBundle.card }
        : card || {};
    const hd = bundleCard.healthDeclaration;
    const assetId = normalizeText(hd?.phase1AssetId || hd?.assetId || hd?.documentAssetId);
    if (assetId) {
      return `/api/v1/cco/assets/${encodeURIComponent(assetId)}/download?inline=1`;
    }
    return '';
  }

  async function openHealthDeclarationPdf(patientId, card, dossierBundle) {
    const direct = resolveHealthDocPdfUrl(card, dossierBundle);
    if (direct) {
      window.open(direct, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!patientId) return;
    try {
      const res = await fetch(`/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const payload = await res.json();
      const items = asArray(payload.items);
      const match =
        items.find(
          (item) =>
            String(item.mimeType || '').includes('pdf') &&
            /hälsodekl|health.?decl|halso/i.test(String(item.originalFileName || ''))
        ) ||
        items.find((item) => item.sourceSystem === 'm365_halso') ||
        items.find((item) => item.category === 'form');
      if (match?.id) {
        window.open(
          `/api/v1/cco/assets/${encodeURIComponent(match.id)}/download?inline=1`,
          '_blank',
          'noopener,noreferrer'
        );
      }
    } catch {
      /* best-effort */
    }
  }

  function renderDocumentDossier(card, dossierBundle) {
    return DOC_DOSSIER.map((row) => {
      const st = resolveDocStatus(card, dossierBundle, row.metaKey);
      const meta =
        row.metaKey === 'health' && !card?.missingHealthDeclaration
          ? 'Meridiq · dossier-bundle'
          : row.metaKey === 'journal' && card?.hasJournal
            ? 'Signerad i journal'
            : row.metaKey === 'offer'
              ? 'Offert = plan'
              : row.metaKey === 'agreement'
                ? 'Bundle · legal_review'
                : row.metaKey === 'fitness'
                  ? 'Operationsdagen · day-of'
                  : 'Hårlinje/krona · scope';
      const openHealth =
        row.metaKey === 'health' && st.cls === 'ok' && !card?.missingHealthDeclaration;
      return `
        <div class="bp-doc${openHealth ? ' bp-doc--clickable' : ''}"${
          openHealth ? ' data-bp-doc-open-health="1" role="button" tabindex="0"' : ''
        } data-bp-doc-key="${escapeHtml(row.metaKey)}">
          <div class="bp-doc__icon">${row.icon}</div>
          <div class="bp-doc__copy">
            <div class="bp-doc__title">${escapeHtml(row.title)}</div>
            <div class="bp-doc__meta">${escapeHtml(meta)}</div>
          </div>
          <span class="bp-st bp-st--${escapeHtml(st.cls)}">${escapeHtml(st.label)}</span>
        </div>`;
    }).join('');
  }

  function renderSmartSignals(card) {
    const mod = smart();
    if (!mod?.sortSignals) {
      return '<p class="bp-empty">Smart nästa steg saknas — ladda cco-kunder-smart-next-step.js</p>';
    }
    const signals = mod
      .sortSignals(card?.automationSignals || [])
      .filter((s) => s.status === 'active');
    if (!signals.length) {
      return '<p class="bp-empty">Inga öppna signaler — kund är synkad</p>';
    }
    const actions = mod.SIGNAL_ACTIONS || {};
    return signals
      .slice(0, 10)
      .map((signal) => {
        const pill = RISK_PILL[signal.risk] || RISK_PILL.info;
        const action = actions[signal.ruleId] || {};
        const btn =
          action.buttonLabel && action.disabledReason
            ? `<div class="bp-sig__act">
                <button type="button" class="bp-btn-dis" disabled title="${escapeHtml(action.disabledReason)}">${escapeHtml(action.buttonLabel)}</button>
                <span class="bp-reason">${escapeHtml(action.disabledReason)}</span>
              </div>`
            : '';
        return `
          <div class="bp-sig">
            <div class="bp-sig__top">
              <span class="bp-pill bp-pill--${pill.cls}">${escapeHtml(pill.label)}</span>
              <span class="bp-sig__id">${escapeHtml(String(signal.ruleId || '').replace(/^customer\./, ''))}</span>
            </div>
            <div class="bp-sig__wn">
              <div><b>Vad:</b> ${escapeHtml(signal.what || '—')}</div>
              <div><b>Varför:</b> ${escapeHtml(signal.why || '—')}</div>
              <div><b>Nästa:</b> ${escapeHtml(signal.next || '—')}</div>
            </div>
            ${btn}
          </div>`;
      })
      .join('');
  }

  function renderEconomy(card) {
    const build = parity()?.buildEconomyFields;
    const rows = build ? build(card) : [];
    const plan = rows.find((r) => /intäkt|ltv|plan/i.test(r.label))?.value || '—';
    const ltv = card?.lifetimeValueLabel || rows.find((r) => /liv/i.test(r.label))?.value || '—';
    const invoice =
      card?.outstandingBalance && card.outstandingBalance !== '0 kr'
        ? card.outstandingBalance
        : null;
    return `
      <div class="bp-eco"><span class="bp-muted">Behandlingsplan</span><b>${escapeHtml(plan)}</b></div>
      <div class="bp-eco"><span class="bp-muted">Faktura</span>${
        invoice
          ? `<b>${escapeHtml(invoice)}</b>`
          : '<span class="bp-st bp-st--lock">Ej skapad</span>'
      }</div>
      <div class="bp-eco"><span class="bp-muted">LTV (historik)</span><b>${escapeHtml(ltv)}</b></div>`;
  }

  function renderAllergieBanner(card, dossierBundle) {
    const allergies = resolveAllergies(card, dossierBundle);
    if (!allergies.length) return '';
    return `
      <div class="bp-allergi" data-bp-allergy-banner role="alert">
        <div class="bp-allergi__ic">!</div>
        <div class="bp-allergi__copy">
          <b>Allergier / medicinsk varning</b><br>
          ${escapeHtml(allergies.join(' · '))} — verifiera före ingrepp.
        </div>
      </div>`;
  }

  function renderIdentity(card) {
    const vip = card?.isVip ? '<span class="bp-tag bp-tag--vip">VIP</span>' : '';
    const patientId = String(card?.patientId || card?.id || '—');
    const shortId =
      patientId.length > 12 ? `${patientId.slice(0, 4)}…${patientId.slice(-6)}` : patientId;
    return `
      <div class="bp-idblock">
        <div class="bp-idblock__pic">${escapeHtml(initialsFrom(card))}</div>
        <div class="bp-idblock__copy">
          <h3>${escapeHtml(card?.displayName || card?.name || 'Kund')}</h3>
          <div class="bp-muted">Patient-ID · #${escapeHtml(shortId)}</div>
        </div>
        ${vip}
      </div>
      <div class="bp-idrows">
        <div class="bp-idrow"><span class="bp-idrow__k">Personnr</span><span class="bp-mono">${escapeHtml(maskPersonnummer(card))}</span></div>
        <div class="bp-idrow"><span class="bp-idrow__k">Behandling</span><span>${escapeHtml(resolveTreatmentLabel(card))}</span></div>
        <div class="bp-idrow"><span class="bp-idrow__k">Behandlare</span><span>${escapeHtml(resolvePractitioner(card))}</span></div>
        <div class="bp-idrow"><span class="bp-idrow__k">Klinik</span><span>${escapeHtml(resolveClinic(card))}</span></div>
      </div>`;
  }

  function renderKundkort(card, journalEntries, dossierBundle, occasionTimeline, driveFiles) {
    if (!card) return '';
    const bundleCard =
      dossierBundle?.card && typeof dossierBundle.card === 'object'
        ? { ...card, ...dossierBundle.card }
        : card;
    return `
      <section class="bp-kundkort v9-surface-vellum" data-bp-kundkort data-patient-detail>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          ${renderAllergieBanner(bundleCard, dossierBundle)}
          ${renderIdentity(bundleCard)}
        </div>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          <div class="bp-sec-h">
            <h4>Kundresa · 9 steg</h4>
            <span class="bp-hint">JourneyAggregator</span>
          </div>
          <div class="bp-journey">${renderVerticalJourney(bundleCard, journalEntries, dossierBundle)}</div>
        </div>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          <div class="bp-sec-h">
            <h4>Smart nästa steg</h4>
            <span class="bp-hint">10 signaler · read-only</span>
          </div>
          <div class="bp-signals">${renderSmartSignals(bundleCard)}</div>
        </div>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          <div class="bp-sec-h">
            <h4>Dokument-dossier</h4>
            <span class="bp-hint">dossier-bundle</span>
          </div>
          <div class="bp-docs">${renderDocumentDossier(bundleCard, dossierBundle)}</div>
        </div>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          <div class="bp-sec-h"><h4>Ekonomi</h4><span class="bp-hint">Fortnox</span></div>
          ${renderEconomy(bundleCard)}
        </div>
        <div class="bp-kundkort__card bp-kundkort__card--pad">
          <div class="bp-actions">
            <button type="button" class="bp-actions__primary" data-bp-action="full-dossier">Öppna full dossier</button>
            <button type="button" class="bp-actions__secondary" data-bp-action="worklist" disabled title="Worklist kräver automation GO">Lägg i worklist</button>
          </div>
        </div>
        ${renderDeepShell()}
      </section>`;
  }

  function renderDeepShell() {
    return `
      <div class="v9-dossier-deep" data-v9-dossier-deep hidden aria-hidden="true">
        <div class="v9-dossier-deep__head">
          <strong data-v9-deep-title>Full dossier</strong>
          <button type="button" class="v9-dossier-deep__close" data-v9-deep-close>Stäng</button>
        </div>
        <div class="v9-dossier-deep__body" data-v9-deep-body></div>
      </div>`;
  }

  function buildTimelineEvents(card, dossierBundle, journalEntries, occasionTimeline) {
    const events = [];
    for (const ev of asArray(dossierBundle?.recentEvents)) {
      events.push({
        kind: String(ev.kind || ev.type || 'event').toLowerCase(),
        title: ev.subject || ev.title || ev.text || 'Händelse',
        meta: ev.at || ev.occurredAt || ev.ts || '',
        audit: ev.filledBy || ev.signedBy || ev.audit || ev.fillAudit || '',
      });
    }
    if (events.length) return events.slice(0, 8);
    for (const ev of asArray(occasionTimeline).slice(0, 5)) {
      events.push({
        kind: String(ev.kind || ev.type || 'book').toLowerCase(),
        title: ev.title || ev.label || 'Bokning',
        meta: ev.occurredAt || ev.ts || ev.detail?.when || '',
        audit: ev.detail?.by || '',
      });
    }
    for (const entry of asArray(journalEntries).slice(0, 4)) {
      events.push({
        kind: 'doc',
        title: entry.title || entry.journalType || 'Journalanteckning',
        meta: entry.signedAt || entry.updatedAt || entry.createdAt || '',
        audit: entry.signedBy || entry.authorName || '',
      });
    }
    if (card?.lastVisitAt) {
      events.push({
        kind: 'book',
        title: 'Senaste besök',
        meta: String(card.lastVisitAt).slice(0, 10),
        audit: '',
      });
    }
    return events.slice(0, 8);
  }

  function timelineDotClass(kind) {
    if (kind.includes('mail')) return 'mail';
    if (kind.includes('doc') || kind.includes('journal')) return 'doc';
    if (kind.includes('book')) return 'book';
    return '';
  }

  function renderWorkspaceInsights(card) {
    const signals = asArray(card?.automationSignals).filter((s) => s?.status === 'active');
    const risk = signals.find((s) => ['blocker', 'legal_blocker'].includes(s.risk));
    const info = signals.find(
      (s) => s.risk === 'info' || String(s.ruleId || '').includes('cooling_off')
    );
    const blocks = [];
    if (risk) {
      blocks.push({
        cls: 'risk',
        kicker: 'Risk · idag',
        text: risk.what || risk.why || 'Kontrollera blockerare.',
      });
    }
    if (info) {
      blocks.push({
        cls: 'idag',
        kicker: 'Nästa steg',
        text: info.what || info.next || 'Följ kundresan.',
      });
    }
    if (!blocks.length && card?.nextStep) {
      blocks.push({
        cls: 'idag',
        kicker: 'Nästa steg',
        text: String(card.nextStep),
      });
    }
    if (!blocks.length) {
      return '<p class="bp-empty">Inga aktiva insikter — välj segment eller kund med signaler.</p>';
    }
    return blocks
      .map(
        (b) => `
        <div class="bp-insight bp-insight--${escapeHtml(b.cls)}">
          <div class="bp-insight__lbl">${escapeHtml(b.kicker)}</div>
          <p>${escapeHtml(b.text)}</p>
        </div>`
      )
      .join('');
  }

  function renderTimeline(card, dossierBundle, journalEntries, occasionTimeline) {
    const events = buildTimelineEvents(card, dossierBundle, journalEntries, occasionTimeline);
    if (!events.length) {
      return '<p class="bp-empty">Ingen aktivitet att visa ännu för den här kunden.</p>';
    }
    return `
      <div class="bp-tl">
        ${events
          .map((ev) => {
            const dot = timelineDotClass(ev.kind);
            const audit = ev.audit
              ? `<div class="bp-ev__audit">${escapeHtml(String(ev.audit))}</div>`
              : '';
            return `
            <div class="bp-ev bp-ev--${escapeHtml(dot || 'default')}">
              <div class="bp-ev__h">${escapeHtml(ev.title)}</div>
              <div class="bp-ev__meta">${escapeHtml(String(ev.meta || ''))}</div>
              ${audit}
            </div>`;
          })
          .join('')}
      </div>`;
  }

  function renderWorkspaceHeader(card) {
    const age = card?.age ? `${card.age} år · ` : '';
    const tags = [];
    if (card?.isVip) tags.push('<span class="bp-tag bp-tag--vip">VIP</span>');
    if (card?.segmentHints?.active || card?.hasUpcomingBooking) {
      tags.push('<span class="bp-tag bp-tag--active">Aktiv</span>');
    }
    const top = card?.automationTop;
    if (top?.what) {
      tags.push(`<span class="bp-tag bp-tag--info">${escapeHtml(top.what)}</span>`);
    }
    const phone = card?.primaryPhone || card?.phoneMasked || '—';
    const email = card?.primaryEmail || card?.emailMasked || '—';
    const lastVisit = card?.lastVisitAt ? String(card.lastVisitAt).slice(0, 10) : '—';
    const source = card?.sourceSystem || (card?.clientoLinked ? 'Cliento' : 'CCO');
    return `
      <div class="bp-phead">
        <div class="bp-phead__pic">${escapeHtml(initialsFrom(card))}</div>
        <div class="bp-phead__copy">
          <h2>${escapeHtml(card?.displayName || card?.name || 'Kund')}</h2>
          <div class="bp-muted">${escapeHtml(age)}${escapeHtml(maskPersonnummer(card))} · ${escapeHtml(resolveTreatmentLabel(card))}</div>
          <div class="bp-tags">${tags.join('')}</div>
        </div>
      </div>
      <div class="bp-kv">
        <div><span>Telefon</span>${escapeHtml(phone)}</div>
        <div><span>E-post</span>${escapeHtml(email)}</div>
        <div><span>Behandlare</span>${escapeHtml(resolvePractitioner(card))}</div>
        <div><span>Senaste besök</span>${escapeHtml(lastVisit)}</div>
        <div><span>Kanal</span>${escapeHtml(source)} → CCO</div>
      </div>`;
  }

  function renderWorkspaceTabPanels(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline,
    activeTab,
    tabExtraHtml
  ) {
    const extra = tabExtraHtml || {};
    return WORKSPACE_TABS.map((tab) => {
      const active = tab.id === activeTab;
      let body = '';
      if (tab.id === 'oversikt') {
        body = `
          ${renderWorkspaceInsights(card)}
          <h4 class="bp-tl-title">Tidslinje</h4>
          ${renderTimeline(card, dossierBundle, journalEntries, occasionTimeline)}`;
      } else if (tab.id === 'journal') {
        body = extra.journal || '<p class="bp-empty">Öppna full dossier för journalredigering.</p>';
      } else if (tab.id === 'bokningar') {
        body =
          extra.bokningar ||
          parity()?.renderV11UpcomingBookings?.(card, occasionTimeline) ||
          '<p class="bp-empty">Inga bokningar.</p>';
      } else if (tab.id === 'dokument') {
        body =
          extra.dokument ||
          `<div class="bp-docs">${renderDocumentDossier(card, dossierBundle)}</div>`;
      } else if (tab.id === 'konversation') {
        body =
          extra.konversation || '<p class="bp-empty">Konversation kopplas via mail-ingestion.</p>';
      }
      return `
        <div class="bp-workspace-panel${active ? ' is-active' : ''}" data-bp-workspace-panel="${tab.id}"${active ? '' : ' hidden'}>
          ${body}
        </div>`;
    }).join('');
  }

  function renderWorkspace(
    card,
    journalEntries,
    dossierBundle,
    occasionTimeline,
    { activeTab = 'oversikt', tabExtraHtml = null } = {}
  ) {
    if (!card) return '';
    const bundleCard =
      dossierBundle?.card && typeof dossierBundle.card === 'object'
        ? { ...card, ...dossierBundle.card }
        : card;
    return `
      <div class="bp-workspace" data-bp-workspace data-bp-patient-id="${escapeHtml(String(bundleCard.patientId || bundleCard.id || ''))}">
        <div class="bp-col-label">Mitten · Arbetsyta &amp; tidslinje</div>
        <div class="bp-workspace__card bp-workspace__card--pad">
          ${renderWorkspaceHeader(bundleCard)}
        </div>
        <div class="bp-workspace__card">
          <div class="bp-tabs" role="tablist">
            ${WORKSPACE_TABS.map(
              (tab) =>
                `<button type="button" class="bp-tabs__btn${tab.id === activeTab ? ' is-active' : ''}" role="tab" data-bp-workspace-tab="${tab.id}" aria-selected="${tab.id === activeTab ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>`
            ).join('')}
          </div>
          <div class="bp-workspace__body bp-workspace__card--pad">
            ${renderWorkspaceTabPanels(bundleCard, journalEntries, dossierBundle, occasionTimeline, activeTab, tabExtraHtml)}
          </div>
        </div>
      </div>`;
  }

  function bindKundkort(root, handlers = {}) {
    if (!root) return;
    root.querySelector('[data-bp-action="full-dossier"]')?.addEventListener('click', () => {
      handlers.openFullDossier?.(root);
    });
  }

  function bindWorkspace(root, handlers = {}) {
    if (!root) return;
    const workspace =
      root.closest('[data-bp-workspace]') || root.querySelector('[data-bp-workspace]') || root;
    const ctx = handlers.ctx || workspace._bpCtx || {};
    workspace.querySelectorAll('[data-bp-doc-open-health]').forEach((el) => {
      if (el.dataset.bpDocBound === '1') return;
      el.dataset.bpDocBound = '1';
      const open = () => {
        const patientId =
          workspace.getAttribute('data-bp-patient-id') || ctx.card?.patientId || ctx.card?.id || '';
        void openHealthDeclarationPdf(patientId, ctx.card, ctx.dossierBundle);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
    root.querySelectorAll('[data-bp-workspace-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-bp-workspace-tab');
        if (!tab) return;
        root.querySelectorAll('[data-bp-workspace-tab]').forEach((el) => {
          const on = el.getAttribute('data-bp-workspace-tab') === tab;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        root.querySelectorAll('[data-bp-workspace-panel]').forEach((panel) => {
          const on = panel.getAttribute('data-bp-workspace-panel') === tab;
          panel.classList.toggle('is-active', on);
          panel.hidden = !on;
        });
        handlers.onTabChange?.(tab);
      });
    });
  }

  global.CcoKundkortBlueprint = {
    isBlueprintOn,
    renderKundkort,
    renderWorkspace,
    bindKundkort,
    bindWorkspace,
    WORKSPACE_TABS,
  };
})(typeof window !== 'undefined' ? window : global);
