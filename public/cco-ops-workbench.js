/* global document, fetch */
(function () {
  'use strict';

  const MAILBOX_LABELS = [
    ['contact@hairtpclinic.com', 'contact@'],
    ['egzona@hairtpclinic.com', 'egzona@'],
    ['fazli@hairtpclinic.com', 'fazli@'],
    ['marknad@hairtpclinic.com', 'marknad@'],
  ];
  const MAILBOX_REFERENCE_FALLBACK = {
    'contact@hairtpclinic.com': 248,
    'egzona@hairtpclinic.com': 175,
    'fazli@hairtpclinic.com': 67,
    'marknad@hairtpclinic.com': 3,
  };

  function escapeHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pill(status) {
    const s = String(status || '').toUpperCase();
    let cls = 'cow-pill--warn';
    if (s === 'PASS' || s === 'OK' || s.includes('READY')) cls = 'cow-pill--pass';
    if (s === 'FAIL' || s === 'ERROR') cls = 'cow-pill--fail';
    return `<span class="cow-pill ${cls}">${escapeHtml(status || '—')}</span>`;
  }

  function metric(value, label) {
    const v = value === undefined || value === null || value === '' ? '—' : value;
    return `<div class="cow-metric"><strong>${escapeHtml(v)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function linkBtn(href, label, enabled = true) {
    if (!enabled || !href) {
      return `<span class="cow-btn cow-btn--disabled">${escapeHtml(label)} (ej tillgänglig)</span>`;
    }
    return `<a class="cow-btn" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, json: await res.json() };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  async function probePage(path) {
    try {
      const res = await fetch(path, {
        method: 'HEAD',
        cache: 'no-store',
        headers: { 'x-cco-role': 'owner', 'x-cco-tenant': 'hairtpclinic' },
      });
      return res.status || 0;
    } catch {
      return 0;
    }
  }

  async function loadPhotoSummary() {
    try {
      const res = await fetch('/api/v1/cco/photo-review/summary', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'x-cco-role': 'owner',
          'x-cco-tenant': 'hairtpclinic',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  function opsStatusPill(status) {
    const s = String(status || '').toUpperCase();
    let cls = 'cow-pill--warn';
    if (s === 'GO') cls = 'cow-pill--pass cow-ops-go';
    if (s === 'WARNING') cls = 'cow-pill--warn cow-ops-warning';
    if (s === 'STOP') cls = 'cow-pill--fail cow-ops-stop';
    return `<span class="cow-pill ${cls}">${escapeHtml(status || '—')}</span>`;
  }

  function renderJournalPilotCtas(shift, links) {
    const ops = shift?.journalPilotOpsStatus || 'STOP';
    const personalJa = shift?.personalCanContinueJournaling === 'JA';
    const canContinue = ops === 'GO' && personalJa;
    const lk = shift?.links || links || {};

    return `
      <div class="cow-cta-grid">
        <a class="cow-cta${canContinue ? ' cow-cta--primary' : ' cow-cta--disabled'}" href="${canContinue ? escapeHtml(lk.personalStart || '/cco-personal-start.html') : '#'}">Fortsätt journalföra</a>
        <span class="cow-cta cow-cta--disabled" title="Read-only — pausa via Fazli/command center">Pausa journalföring</span>
        <a class="cow-cta cow-cta--warn" href="${escapeHtml(lk.commandCenter || '/cco-4june-command-center.html')}">Eskalera till Fazli</a>
        <a class="cow-cta" href="${escapeHtml(lk.journalGuide || '/journal-pilot-guide.html')}">Öppna journalguide</a>
        <a class="cow-cta" href="${escapeHtml(lk.personalStart || '/cco-personal-start.html')}">Öppna personalstart</a>
      </div>
      <p class="cow-muted">CTA är read-only vägledning — ingen server-write för paus/start.</p>`;
  }

  function renderEscalationSection(escalation) {
    const eq = escalation || {};
    if (eq.empty || !eq.items?.length) {
      return `
        <section class="cow-section" id="escalation">
          <h2>Eskaleringskö</h2>
          <p class="cow-muted">${escapeHtml(eq.emptyMessage || 'Inga eskaleringar registrerade')}</p>
        </section>`;
    }
    const rows = eq.items
      .map(
        (item) => `
        <li class="${item.severity === 'critical' ? 'is-critical' : ''}">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="cow-muted"> · ${escapeHtml(item.category)} · ${escapeHtml(item.assignee)}</span>
          <br /><span class="cow-muted">${escapeHtml(item.action)}</span>
        </li>`
      )
      .join('');

    return `
      <section class="cow-section" id="escalation">
        <div class="cow-section-head">
          <h2>Eskaleringskö</h2>
          ${pill(`${eq.registered} registrerade`)}
        </div>
        <p class="cow-muted">${escapeHtml(eq.note || 'Read-only — från audit/routes, inga mock-rader')}</p>
        <ul class="cow-escalation-list">${rows}</ul>
      </section>`;
  }

  function renderJournalPilotOpsPanel(shift, morning, journalLive, day1) {
    const s = shift || {};
    const jOps = s.journalPilotOps || {};
    const last =
      s.last24h || jOps.last24h || journalLive?.last24h || day1?.day1JournalPilot?.last24h || {};
    const links = s.links || day1?.day1JournalPilot?.links || {};
    const action = s.recommendedAction || morning?.recommendedAction || '—';
    const opsStatus = s.journalPilotOpsStatus || jOps.opsStatus || 'WARNING';
    const routeRows = (jOps.routeHealth || journalLive?.routeHealth || [])
      .map((r) => `<li>${escapeHtml(r.name)}: ${escapeHtml(r.status)} ${pill(r.result)}</li>`)
      .join('');

    return `
      <section class="cow-section cow-section--journal-ops" id="journalpilot-ops">
        <div class="cow-section-head">
          <h2>Journalpilot Operations</h2>
          ${opsStatusPill(opsStatus)}
          ${pill(s.shiftStatusLabel || s.shiftStatus || '—')}
          ${pill(action)}
        </div>
        <p class="cow-callout"><strong>${escapeHtml(opsStatus)}:</strong> ${escapeHtml(s.journalPilotOpsReason || jOps.opsReason || '—')}</p>
        <p class="cow-muted">Senaste journalaktivitet: ${escapeHtml(s.lastJournalActivityAt || last.lastSuccessfulJournalWriteAt || '—')}</p>
        <div class="cow-metrics">
          ${metric(s.personalCanContinueJournaling || jOps.personalCanContinueJournaling, 'Kan fortsätta')}
          ${metric(s.pilot1 ?? jOps.pilot1 ?? journalLive?.pilot1, 'Pilot 1')}
          ${metric(s.pilot2 ?? jOps.pilot2 ?? journalLive?.pilot2, 'Pilot 2')}
          ${metric(s.pilot3 ?? jOps.pilot3 ?? journalLive?.pilot3, 'Pilot 3')}
          ${metric(jOps.feedTimelineFormsHealth ?? journalLive?.feedTimelineFormsHealth, 'Feed/timeline')}
        </div>
        <div class="cow-metrics">
          ${metric(s.journalWrites24h ?? last.journalEntriesActivity, 'Journaler 24h')}
          ${metric(s.signed24h ?? last.signedCount, 'Signerade 24h')}
          ${metric(s.corrections24h ?? last.correctionsCount, 'Rättelser 24h')}
          ${metric(s.errors24h ?? last.errorsCount, 'Journal errors 24h')}
          ${metric(s.route5xxCount ?? jOps.route5xxCount ?? 0, 'Route 5xx')}
        </div>
        <p class="cow-muted">Senaste lyckade write: ${escapeHtml(s.lastSuccessfulWriteAt || last.lastSuccessfulJournalWriteAt || '—')} · senaste fail: ${escapeHtml(s.lastFailedWriteAt || last.lastFailedJournalWriteAt || '—')}</p>
        <ul class="cow-list">${routeRows || '<li>—</li>'}</ul>
        ${renderJournalPilotCtas(s, links)}
        <div class="cow-links-grid">
          ${linkBtn(links.personalStart, 'Personal-start')}
          ${linkBtn(links.kundkort, 'Kundkort')}
          ${linkBtn(links.journalGuide, 'Journal guide')}
          ${linkBtn(links.staffTraining, 'Staff training')}
          ${linkBtn(links.journalFaq, 'FAQ')}
          ${linkBtn(links.goLiveSupport, 'Go-live support')}
          ${linkBtn(links.signoffSheet, 'Sign-off sheet')}
          ${linkBtn(links.preSignCheck, 'Pre-sign check')}
        </div>
      </section>`;
  }

  function renderIdentitySafetySection(identity, pageProbes) {
    const ids = identity || {};
    const pages = ids.pages || [];
    const items = [
      ['Identitet i flöde', ids.identityCheckAvailable, '/cco-personal-start.html'],
      ['Pre-sign check', ids.preSignCheckAvailable, '/cco-pre-signering-check.html'],
      [
        'Review-material warning',
        ids.reviewMaterialWarningAvailable,
        '/cco-review-material-warning.html',
      ],
      ['Staff checklist', ids.staffChecklistAvailable, '/cco-staff-day1-checklist.html'],
      ['Sign-off sheet', ids.signoffSheetAvailable, '/journal-pilot-signoff-sheet.html'],
      ['Staff training', ids.staffTrainingAvailable, '/cco-staff-training-mode.html'],
      ['FAQ', ids.journalFaqAvailable, '/cco-journalpilot-faq.html'],
      ['Go-live', ids.goLiveSupportAvailable, '/cco-journalpilot-go-live.html'],
    ];
    const grid = items
      .map(([label, ok, href]) => {
        const live = pageProbes?.[href];
        const available = ok === true || live === 200;
        return `<div class="cow-identity-item${available ? ' is-ok' : ' is-miss'}">${escapeHtml(label)}: ${available ? 'finns' : 'saknas/404'} ${linkBtn(href, 'Öppna', available)}</div>`;
      })
      .join('');

    return `
      <section class="cow-section" id="identity-safety">
        <div class="cow-section-head">
          <h2>1a · Identitetssäkerhet</h2>
          ${pill(ids.overall || '—')}
        </div>
        <p class="cow-muted">${escapeHtml(ids.note || 'Stöd före signering — read-only sidor')}</p>
        <div class="cow-identity-grid">${grid}</div>
        ${pages.length ? '' : ''}
      </section>`;
  }

  function renderCommandStatus(morning, manifest) {
    const m = morning || {};
    const gate = m.presentationGate || '—';
    const action = m.recommendedAction || '—';
    const gateFail = gate === 'FAIL';
    const pilots = m.links?.pilots || manifest?.pilotCustomers || [];
    const pilotBtns = pilots
      .map((p, i) => {
        const href = p.path || p.openRoute;
        const label = p.label || p.redactedLabel || `Pilot ${p.slot || i + 1}`;
        return linkBtn(href, label);
      })
      .join('');

    return `
      <section class="cow-section cow-section--command" id="command">
        <div class="cow-section-head">
          <h2>0 · 4 juni Command Status</h2>
          ${pill(gate)}
          ${pill(action)}
        </div>
        <p class="cow-muted">Morgon-check · ${escapeHtml(m.generatedAt || '—')} · read-only</p>
        <div class="cow-metrics">
          ${metric(m.presentationGate, 'presentation gate')}
          ${metric(m.demoLinks, 'demo links')}
          ${metric(m.journalE2E, 'journal E2E')}
          ${metric(m.pilot1, 'pilot 1')}
          ${metric(m.pilot2, 'pilot 2')}
          ${metric(m.pilot3, 'pilot 3')}
        </div>
        ${gateFail ? '<p class="cow-alert"><strong>P0:</strong> Presentation gate FAIL — fixa journaldemo före 4 juni. Kör <code>npm run cco:presentation-gate</code>.</p>' : '<p class="cow-callout"><strong>GO:</strong> Heligt demo-flöde grönt enligt senaste morning check.</p>'}
        <ul class="cow-list">${(m.blockers || []).map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
        <div class="cow-actions cow-actions--wrap">
          ${linkBtn(m.links?.personalStart || '/cco-personal-start.html', 'Personal-start')}
          ${linkBtn(m.links?.presenterMode || '/personal-demo.html', 'Presenter mode')}
          ${linkBtn(m.links?.printPack || '/journal-pilot-guide.html', 'Print pack')}
          ${linkBtn(m.links?.journalGuide || '/journal-pilot-guide.html', 'Journal guide')}
          ${linkBtn(m.links?.kundkort || '/kunder.html', 'Kundkort')}
          ${pilotBtns}
        </div>
        <p class="cow-muted">Prod: <a href="${escapeHtml(m.prodUrl || '#')}">${escapeHtml(m.prodUrl || '—')}</a> · Backup: <a href="${escapeHtml(m.backupUrl || '#')}">${escapeHtml(m.backupUrl || '—')}</a></p>
      </section>`;
  }

  function renderJournalPilotLiveSection(live, manifest) {
    const j = live || {};
    const last = j.last24h || {};
    const routeRows = (j.routeHealth || [])
      .map((r) => `<li>${escapeHtml(r.name)}: ${escapeHtml(r.status)} ${pill(r.result)}</li>`)
      .join('');
    const pilotRows = (j.pilots || manifest?.pilotCustomers || [])
      .map(
        (p) =>
          `<li>${escapeHtml(p.label || p.redactedLabel || `Pilot ${p.slot}`)} — ${escapeHtml(p.overall || '—')} · feed ${escapeHtml(p.feed)} · timeline ${escapeHtml(p.timeline)} · forms ${escapeHtml(p.forms)}</li>`
      )
      .join('');

    return `
      <section class="cow-section cow-section--live" id="journal-live">
        <div class="cow-section-head">
          <h2>1 · Journalpilot live</h2>
          ${pill(j.overall || '—')}
          ${pill(j.personalCanContinueJournaling || '—')}
        </div>
        <p class="cow-muted">Day-1 operations · read-only · ingen journaltext · ${escapeHtml(j.generatedAt || '—')}</p>
        <div class="cow-metrics">
          ${metric(last.journalEntriesActivity ?? '—', 'aktivitet 24h')}
          ${metric(last.signedCount ?? '—', 'signerade 24h')}
          ${metric(last.correctionsCount ?? '—', 'rättelser 24h')}
          ${metric(last.errorsCount ?? '—', 'errors 24h')}
          ${metric(last.blockedLockedEditAttempts ?? '—', 'blocked locked-edit')}
          ${metric(j.route5xxCount ?? 0, 'route 5xx')}
        </div>
        <p class="cow-muted">Senaste lyckade write: ${escapeHtml(last.lastSuccessfulJournalWriteAt || '—')} · senaste fail: ${escapeHtml(last.lastFailedJournalWriteAt || '—')} · audit events: ${escapeHtml(last.auditEventsCount ?? '—')}</p>
        <ul class="cow-list">${routeRows || '<li>—</li>'}</ul>
        <ul class="cow-list">${pilotRows || ''}</ul>
        <div class="cow-actions cow-actions--wrap">
          ${linkBtn('/cco-personal-start.html', 'Personal-start')}
          ${linkBtn('/kunder.html', 'Kundkort')}
          ${linkBtn('/journal-pilot-guide.html', 'Journal guide')}
          ${linkBtn('/personal-demo.html', 'Presenter mode')}
        </div>
      </section>`;
  }

  function renderJournalSection(ops, manifest) {
    const jp = ops?.journalPilot || {};
    const pilots = manifest?.pilotCustomers || [];
    const pilotRows = pilots
      .map(
        (p) =>
          `<li>${escapeHtml(p.redactedLabel || `Pilot ${p.slot}`)} — feed ${escapeHtml(p.journalFeed)} · timeline ${escapeHtml(p.journalTimeline)}</li>`
      )
      .join('');

    return `
      <section class="cow-section" id="journalpilot">
        <div class="cow-section-head">
          <h2>1b · Journalpilot (gate)</h2>
          ${pill(jp.overall || '—')}
        </div>
        <div class="cow-metrics">
          ${metric(jp.presentationGate, 'presentation-gate')}
          ${metric(jp.journalMounts, 'journal mounts')}
          ${metric(jp.demoLinks, 'demo links')}
          ${metric(jp.e2eJournal, 'E2E journal')}
          ${metric(jp.pilot1, 'pilot 1')}
          ${metric(jp.pilot2, 'pilot 2')}
          ${metric(jp.pilot3, 'pilot 3')}
        </div>
        <p class="cow-muted">Senast kontrollerad: ${escapeHtml(jp.checkedAt || ops?.generatedAt || '—')}</p>
        ${pilotRows ? `<ul class="cow-list">${pilotRows}</ul>` : ''}
        <div class="cow-actions">
          ${linkBtn(jp.personalStartUrl || '/cco-personal-start.html', 'Personalstart (demo)')}
          ${linkBtn(jp.kundkortUrl || '/kunder.html', 'Kundkort')}
        </div>
      </section>`;
  }

  function renderPhotoSection(ops, livePhoto, photoPageStatus, photoOp) {
    const snap = ops?.photoReview || {};
    const day1p = ops?.photoReviewDay1 || ops?.day1?.photoReview || {};
    const op = photoOp || ops?.photoReviewOperator || {};
    const apiPending = Number(livePhoto?.pendingPhotos ?? livePhoto?.pendingPhotosAll ?? 0);
    const useLive = apiPending > 0;
    const row = useLive ? livePhoto : snap;
    const pending =
      day1p.pendingPhotos ?? op.pendingPhotos ?? row?.pendingPhotos ?? row?.pendingPhotosAll;
    const patients =
      day1p.patientsWithPendingPhotos ??
      op.patientsWithPendingPhotos ??
      row?.patientsWithPendingPhotos;
    const visible =
      day1p.photosVisibleCount ?? op.photosVisibleCount ?? row?.photosVisibleCount ?? 0;
    const writeOn = (day1p.writeEnabled ?? op.writeEnabled ?? row?.writeEnabled) === true;
    const recWork = day1p.recommendedWork || op.nextAction;
    const toolPath = '/photo-review.html';
    const toolOk = photoPageStatus === 200;

    return `
      <section class="cow-section" id="photo">
        <div class="cow-section-head">
          <h2>2 · Photo Review operator</h2>
          ${pill(op.overall || (writeOn ? 'WRITE PÅ' : 'READ-ONLY'))}
        </div>
        <p class="cow-callout"><strong>Dag 1:</strong> migrerade före/efter-bilder är <strong>inte kliniska</strong> före Photo Review. <strong>0 VISIBLE</strong> tills manuellt granskat. Ingen auto-approve · ingen massapproval.</p>
        <p class="cow-muted">${escapeHtml(recWork || '—')}</p>
        <p class="cow-muted">${writeOn ? 'Write PÅ — approve per bild' : '<strong>Write AV</strong> — inga approve-knappar · ingen autoapprove · ingen massapproval'}</p>
        <div class="cow-metrics">
          ${metric(pending ?? '—', 'pending bilder')}
          ${metric(patients ?? '—', 'antal kunder')}
          ${metric(visible, 'VISIBLE på kundkort')}
          ${metric(op.operatorMode || 'READY', 'operator mode')}
        </div>
        ${pending === undefined ? '<p class="cow-unavailable">Ej tillgängligt — ingen snapshot eller API-data.</p>' : ''}
        <div class="cow-actions">
          ${linkBtn(toolOk ? toolPath : null, 'Öppna Photo Review', toolOk)}
        </div>
      </section>`;
  }

  function sumMailboxCounts(counts) {
    return Object.values(counts || {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
  }

  function resolveMailMailboxCounts(m, mailRef) {
    const counts = { ...(m.mailboxCounts || m.mailboxPending || {}) };
    const remaining = Number(m.remaining ?? m.pending ?? m.ambiguousTotal ?? 0);
    if (remaining > 0 && sumMailboxCounts(counts) === 0) {
      const ref = mailRef?.mailboxCounts || MAILBOX_REFERENCE_FALLBACK;
      return { counts: { ...ref }, source: 'reference_snapshot' };
    }
    return { counts, source: m.mailboxCountsSource || 'snapshot' };
  }

  function renderMailSection(ops, mailRef, mailOp) {
    const m = ops?.mailAmbiguous || {};
    const day1m = ops?.mailReviewDay1 || ops?.day1?.mailReview || {};
    const mo = mailOp || ops?.mailReviewOperator || {};
    const { counts, source } = resolveMailMailboxCounts(m, mailRef);
    const mailboxHtml = MAILBOX_LABELS.map(
      ([id, label]) => `<li>${escapeHtml(label)}: ${escapeHtml(counts[id] ?? '—')} pending</li>`
    ).join('');

    return `
      <section class="cow-section" id="mail">
        <div class="cow-section-head">
          <h2>3 · Mail review operator</h2>
          ${pill(mo.overall || m.operational || '—')}
        </div>
        <p class="cow-muted">${escapeHtml(day1m.statusNote || 'Operatörsverktyg — inte dagligt mailverktyg ännu')}</p>
        <div class="cow-metrics">
          ${metric(day1m.remaining ?? mo.remaining ?? m.remaining ?? m.pending, 'ambiguous kvar')}
          ${metric(day1m.approved ?? mo.approved ?? m.approved, 'approved')}
          ${metric(day1m.unresolved ?? mo.unresolved ?? m.unresolved, 'unresolved')}
          ${metric(day1m.excluded ?? m.excluded, 'excluded')}
        </div>
        <ul class="cow-list">${mailboxHtml}</ul>
        <p class="cow-muted">Mailbox-källa: ${escapeHtml(source)} · total ambiguous ${escapeHtml(m.ambiguousTotal ?? m.remaining ?? '—')}</p>
        <div class="cow-guardrails">
          ${(m.rules || []).map((r) => escapeHtml(r)).join(' · ') || 'Ingen auto-write · ingen fuzzy merge · ingen customer merge · ingen Graph-fetch · ingen ny mailimport'}
        </div>
        <div class="cow-actions">
          ${linkBtn(m.uiUrl || '/ambiguous-mail-enrichment-review.html', 'Öppna mail review')}
        </div>
      </section>`;
  }

  function renderCommandCenter(ops, morning, journalLive, journalShift, photoOp, mailOp, importQ) {
    const blockers = ops?.topBlockers || ops?.blockers || morning?.blockers || [];
    const action =
      journalShift?.recommendedAction ||
      ops?.recommendedNextAction ||
      morning?.recommendedAction ||
      'GO';
    const personalJa =
      journalShift?.personalCanContinueJournaling ||
      journalLive?.personalCanContinueJournaling ||
      'NEJ';
    const journalOps = journalShift?.journalPilotOpsStatus || '—';
    const photoPending = photoOp?.pendingPhotos ?? ops?.photoReview?.pendingPhotos ?? '—';
    const photoWrite = photoOp?.writeEnabled === true ? 'PÅ' : 'AV';
    const mailRem = mailOp?.remaining ?? ops?.mailAmbiguous?.remaining ?? '—';
    const importTotal = importQ?.total ?? ops?.importReviewQueue?.total ?? 1497;

    const cards = [
      {
        title: 'Journalpilot',
        status: journalOps,
        detail: `Personal kan journalföra: ${personalJa}`,
        href: '/cco-personal-start.html',
        label: 'Personalstart',
      },
      {
        title: 'Photo Review',
        status: photoOp?.overall || 'READY',
        detail: `${photoPending} bilder · write ${photoWrite}`,
        href: '/photo-review.html',
        label: 'Öppna Photo Review',
      },
      {
        title: 'Mail Review',
        status: mailOp?.overall || 'QUEUE',
        detail: `${mailRem} ambiguous kvar`,
        href: '/ambiguous-mail-enrichment-review.html',
        label: 'Öppna Mail Review',
      },
      {
        title: 'Import Review',
        status: importQ?.status || 'WAITING_MANUAL_REVIEW',
        detail: `${importTotal} osäkra matchningar`,
        href: importQ?.operatorToolPath || '/cco-import-review.html',
        label: 'Öppna Import Review',
      },
      {
        title: 'Drive / historik',
        status: ops?.historik?.halso || 'SAFE_MATCH',
        detail: `halso@ · GetAccept · ej ny riskimport`,
        href: '/cco-ops-workbench.html#drive',
        label: 'Scrolla Drive',
      },
      {
        title: 'Chief of Finance',
        status: ops?.cf?.operational || 'INTERN',
        detail: 'Fortnox blockerad — intern demo',
        href: '/finance.html',
        label: 'Finance',
      },
    ];

    const blockerHtml = blockers
      .slice(0, 6)
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join('');

    const cardHtml = cards
      .map(
        (c) => `
        <article class="cow-command-card">
          <h3>${escapeHtml(c.title)}</h3>
          ${pill(c.status)}
          <p class="cow-muted">${escapeHtml(c.detail)}</p>
          <a class="cow-btn" href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>
        </article>`
      )
      .join('');

    return `
      <section class="cow-section cow-section--command" id="command-center">
        <h2>Vad ska göras nu?</h2>
        <p class="cow-muted">Arbetscentral efter personalmötet · rekommenderad action: <strong>${escapeHtml(action)}</strong></p>
        ${blockerHtml ? `<div class="cow-blockers"><h3>Top blockers</h3><ul class="cow-list">${blockerHtml}</ul></div>` : '<p class="cow-muted">Inga registrerade blockers i snapshot.</p>'}
        <div class="cow-command-grid">${cardHtml}</div>
      </section>`;
  }

  function renderImportSection(ops, importLive) {
    const q =
      importLive || ops?.importReviewDay1 || ops?.day1?.importReview || ops?.importReviewQueue;
    if (!q) {
      return `
        <section class="cow-section" id="import">
          <h2>4 · Import review queue</h2>
          <p class="cow-unavailable">Ej tillgängligt i snapshot.</p>
        </section>`;
    }
    const sources = (q.sources || [])
      .map(
        (s) =>
          `<li>${escapeHtml(s.label)}: <strong>${escapeHtml(s.queueCount ?? '—')}</strong>${s.note ? ` <span class="cow-muted">(${escapeHtml(s.note)})</span>` : ''}</li>`
      )
      .join('');

    return `
      <section class="cow-section" id="import">
        <div class="cow-section-head">
          <h2>4 · Import review queue</h2>
          ${pill(q.statusLabel || q.status || 'WAITING')}
        </div>
        <p class="cow-muted"><strong>${escapeHtml(q.statusLabel || 'Manuell review krävs')}</strong> · ingen auto-import · ingen ny kund</p>
        <div class="cow-metrics">${metric(q.total, 'osäkra kundmatchningar (totalt)')}</div>
        <ul class="cow-list">${sources}</ul>
        <p class="cow-muted">${escapeHtml(q.rule || '')} · ${escapeHtml(q.nextAction || 'Väntar manuell review — ingen auto-import')}</p>
        <p class="cow-muted">Källa: ${escapeHtml(q.dataSource || 'snapshot')}</p>
        <div class="cow-actions">
          ${linkBtn(q.operatorToolPath || '/cco-import-review.html', 'Öppna Import Review')}
        </div>
      </section>`;
  }

  function renderNextStepsSection(ops, morning, journalLive, photoOp, mailOp, importQ) {
    const action = ops?.recommendedNextAction || morning?.recommendedAction || 'GO';
    const blockers = ops?.blockers || morning?.blockers || [];
    const steps = [];
    steps.push({
      prio: action === 'GO' ? 'GO' : action === 'WAIT_AND_RETRY' ? 'WAIT' : 'P0',
      text: `Morning command: ${action}`,
    });
    if (morning?.presentationGate === 'FAIL') {
      steps.push({ prio: 'P0', text: 'Fixa presentation-gate — journaldemo ej säker' });
    } else {
      steps.push({
        prio: 'GO',
        text: 'Journaldemo grönt — fortsätt journalföring om live monitor JA',
      });
    }
    if (journalLive?.overall === 'FAIL') {
      steps.push({ prio: 'P0', text: 'Journalpilot live FAIL — kontrollera routes/piloter' });
    }
    const photoPending = photoOp?.pendingPhotos ?? ops?.photoReview?.pendingPhotos;
    if (photoPending > 0) {
      steps.push({
        prio: 'P1',
        text: `Photo Review: beta i kö (${photoPending} bilder) — write ${photoOp?.writeEnabled ? 'PÅ' : 'AV'}`,
      });
    }
    const mailRem = mailOp?.remaining ?? ops?.mailAmbiguous?.remaining;
    if (mailRem > 0) {
      steps.push({ prio: 'P1', text: `Mail review: ${mailRem} ambiguous kvar — nästa bästa rad` });
    }
    if ((importQ?.total ?? ops?.importReviewQueue?.total) > 0) {
      steps.push({
        prio: 'P2',
        text: `Import queue: ${importQ?.total ?? ops?.importReviewQueue?.total} osäkra matchningar — manuell, ingen auto-import`,
      });
    }
    steps.push({
      prio: '—',
      text: 'Ej: auto-approve · massapproval · ny riskimport · Aisia · Drive-länkar i UI',
    });

    const blockerList = blockers
      .slice(0, 5)
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join('');

    return `
      <section class="cow-section cow-section--next" id="next-steps">
        <h2>10 · Detaljerad nästa-steg-lista</h2>
        ${blockerList ? `<ul class="cow-list">${blockerList}</ul>` : ''}
        <ul class="cow-list cow-list--steps">
          ${steps
            .map(
              (s) =>
                `<li><span class="cow-pill cow-pill--${s.prio === 'P0' ? 'fail' : s.prio === 'GO' ? 'pass' : 'warn'}">${escapeHtml(s.prio)}</span> ${escapeHtml(s.text)}</li>`
            )
            .join('')}
        </ul>
      </section>`;
  }

  function renderDriveSection(ops) {
    const h = ops?.historik || {};
    const total = ops?.historikReviewQueueTotal;

    return `
      <section class="cow-section" id="drive">
        <h2>5 · Drive / historik</h2>
        <dl class="cow-dl">
          <dt>halso@</dt><dd>${escapeHtml(h.halso || '—')}</dd>
          <dt>GetAccept</dt><dd>${escapeHtml(h.getAccept || '—')}</dd>
          <dt>Drive journaler</dt><dd>${escapeHtml(h.driveJournals || '—')}</dd>
          <dt>Drive dokument</dt><dd>${escapeHtml(h.driveDocuments || '—')}</dd>
          <dt>Drive bilder</dt><dd>${escapeHtml(h.drivePhotos || '—')}</dd>
          <dt>Review queue</dt><dd>${escapeHtml(total ?? '—')}</dd>
        </dl>
        <p class="cow-muted">Read-only status: halso@ IMPORTED_SAFE_MATCH · GetAccept IMPORTED · Drive journaler IMPORTED_SAFE_MATCH · Drive dokument IMPORTED_PARTIAL · Drive bilder NEEDS_REVIEW. Ingen ny riskimport utan explicit GO.</p>
      </section>`;
  }

  function renderEncounterSection(ops, encStatus) {
    const e = ops?.encounterMetadata || {};
    const path = e.operatorToolPath || '/encounter-mapping-review.html';
    const ok = encStatus === 200;

    return `
      <section class="cow-section" id="encounter">
        <div class="cow-section-head">
          <h2>6 · Encounter / metadata review</h2>
          ${pill(e.status || 'PAUSED')}
        </div>
        <p class="cow-muted">${escapeHtml(e.note || 'Separat operatörssida — ej journal-P0.')}</p>
        <div class="cow-actions">
          ${linkBtn(ok ? path : null, 'Öppna encounter review', ok)}
        </div>
      </section>`;
  }

  function renderCfSection(ops) {
    const c = ops?.cf || {};

    return `
      <section class="cow-section" id="cf">
        <div class="cow-section-head">
          <h2>7 · Chief of Finance</h2>
          ${pill(c.operational || '—')}
        </div>
        <div class="cow-metrics">
          ${metric(c.financeStatus, 'finance.html')}
          ${metric(c.reviewStatus, 'finance-review.html')}
          ${metric(c.reportsStatus, 'finance-reports.html')}
        </div>
        <dl class="cow-dl">
          <dt>Fortnox</dt><dd>${escapeHtml(c.fortnox || 'BLOCKED_INTEGRATION')}</dd>
          <dt>Auth-test</dt><dd>${escapeHtml(c.authTest || 'PENDING')}</dd>
        </dl>
        <div class="cow-actions">
          ${linkBtn('/finance.html', 'Finance')}
          ${linkBtn('/finance-review.html', 'Revisorportal')}
          ${linkBtn('/finance-reports.html', 'Rapporter')}
        </div>
      </section>`;
  }

  function renderReadinessSection(ops) {
    const d = ops?.dailyReadiness || {};
    const can = (ops?.staffCanUse || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    const cannot = (ops?.staffCannotUse || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');

    return `
      <section class="cow-section" id="readiness">
        <h2>8 · Daglig readiness</h2>
        <p class="cow-muted">Senast genererad: ${escapeHtml(d.generatedAt || ops?.generatedAt || '—')}</p>
        <dl class="cow-dl">
          <dt>Journalpilot</dt><dd>${escapeHtml(d.journalPilot || '—')}</dd>
          <dt>Journal live</dt><dd>${escapeHtml(d.journalPilotLive || '—')} · ${escapeHtml(d.personalCanContinueJournaling || '—')}</dd>
          <dt>Photo operator</dt><dd>${escapeHtml(d.photoOperator || '—')} · pending ${escapeHtml(d.photoPending ?? '—')}</dd>
          <dt>Mail operator</dt><dd>${escapeHtml(d.mailOperator || '—')}</dd>
          <dt>Import queue</dt><dd>${escapeHtml(d.importQueueTotal ?? '—')}</dd>
        </dl>
        ${can ? `<h3>Personal kan</h3><ul class="cow-list">${can}</ul>` : ''}
        ${cannot ? `<h3>Personal ska inte</h3><ul class="cow-list">${cannot}</ul>` : ''}
        <p class="cow-muted">Full rapport: <code>npm run cco:daily-readiness</code> · ${escapeHtml(d.docFile || 'docs/strategy/CCO-DAILY-READINESS-2026-06-04.md')}</p>
      </section>`;
  }

  async function boot() {
    const root = document.getElementById('cow-root');
    if (!root) return;

    const [
      snapRes,
      manifestRes,
      morningRes,
      mailRefRes,
      journalLiveRes,
      shiftRes,
      day1Res,
      photoOpRes,
      mailOpRes,
      importQRes,
      livePhoto,
      photoStatus,
      encStatus,
      preSignStatus,
      reviewWarnStatus,
      checklistStatus,
      signoffStatus,
      trainingStatus,
      faqStatus,
      goLiveStatus,
    ] = await Promise.all([
      fetchJson('/cco-ops-workbench-snapshot.json').then((r) =>
        r.ok ? r : fetchJson('/cco-presentation-ops-status.json')
      ),
      fetchJson('/cco-personal-demo-manifest.json'),
      fetchJson('/cco-4june-morning-check.json'),
      fetchJson('/mail-ambiguous-mailbox-reference.json'),
      fetchJson('/cco-journal-pilot-live-monitor.json'),
      fetchJson('/cco-journalpilot-shift-status.json'),
      fetchJson('/cco-day1-operations-status.json'),
      fetchJson('/cco-photo-review-operator-status.json'),
      fetchJson('/cco-mail-review-operator-status.json'),
      fetchJson('/cco-import-review-queue-status.json'),
      loadPhotoSummary(),
      probePage('/photo-review.html'),
      probePage('/encounter-mapping-review.html'),
      probePage('/cco-pre-signering-check.html'),
      probePage('/cco-review-material-warning.html'),
      probePage('/cco-staff-day1-checklist.html'),
      probePage('/journal-pilot-signoff-sheet.html'),
      probePage('/cco-staff-training-mode.html'),
      probePage('/cco-journalpilot-faq.html'),
      probePage('/cco-journalpilot-go-live.html'),
    ]);

    const ops = snapRes.ok ? snapRes.json : null;
    const manifest = manifestRes.ok ? manifestRes.json : null;
    const morning = morningRes.ok ? morningRes.json : null;
    const mailRef = mailRefRes.ok ? mailRefRes.json : null;
    const journalLive = journalLiveRes.ok
      ? journalLiveRes.json
      : snapRes.ok
        ? snapRes.json?.journalPilotLive
        : null;
    const photoOp = photoOpRes.ok ? photoOpRes.json : ops?.photoReviewOperator;
    const mailOp = mailOpRes.ok ? mailOpRes.json : ops?.mailReviewOperator;
    const importQ = importQRes.ok ? importQRes.json : ops?.importReviewQueue;
    const day1 = day1Res.ok ? day1Res.json : ops?.day1 || null;
    const journalShift = shiftRes.ok
      ? shiftRes.json
      : ops?.journalPilotShift || morning?.journalPilotShift || null;
    const escalation = journalShift?.escalationQueue || ops?.escalationQueue || null;
    const pageProbes = {
      '/cco-pre-signering-check.html': preSignStatus,
      '/cco-review-material-warning.html': reviewWarnStatus,
      '/cco-staff-day1-checklist.html': checklistStatus,
      '/journal-pilot-signoff-sheet.html': signoffStatus,
      '/cco-staff-training-mode.html': trainingStatus,
      '/cco-journalpilot-faq.html': faqStatus,
      '/cco-journalpilot-go-live.html': goLiveStatus,
      '/cco-personal-start.html': 200,
    };
    const gateFail =
      (morning?.presentationGate || day1?.day1JournalPilot?.presentationGate) === 'FAIL';

    if (!ops) {
      root.innerHTML =
        '<p class="cow-unavailable">Kunde inte ladda ops-status. Kör <code>npm run cco:daily-readiness</code> för att publicera snapshot.</p>';
      return;
    }

    root.innerHTML = `
      <header class="cow-header">
        <h1>CCO Ops Workbench</h1>
        <p class="cow-muted">Read-only · blocker-köer · ersätter inte personal-start · stör inte journaldemo</p>
      </header>
      ${
        gateFail
          ? `<div class="cow-banner cow-banner--fail" role="alert">
        <strong>STOPP — presentation gate FAIL</strong> · ${escapeHtml(morning?.recommendedAction || 'P0_FIX_REQUIRED')}
        · journaldemo ej säker · kör gate innan 4 juni
      </div>`
          : ''
      }
      <div class="cow-banner">
        <strong>Regler:</strong> inga writes · inga importer · inga auto-approve · inga Drive-länkar ·
        inga nya kunder · ingen extern AI på journaltext · inga patientdata i UI.
        Snapshot: ${escapeHtml(ops.generatedAt || '—')}
      </div>
      <div class="cow-grid">
        ${renderCommandCenter(ops, morning, journalLive, journalShift, photoOp, mailOp, importQ)}
        ${renderJournalPilotOpsPanel(journalShift, morning, journalLive, day1 || ops)}
        ${renderEscalationSection(escalation)}
        ${renderIdentitySafetySection(ops?.identitySafety || day1?.identitySafety, pageProbes)}
        ${renderCommandStatus(morning, manifest)}
        ${renderJournalPilotLiveSection(journalLive, manifest)}
        ${renderJournalSection(ops, manifest)}
        ${renderPhotoSection(ops, livePhoto, photoStatus, photoOp)}
        ${renderMailSection(ops, mailRef, mailOp)}
        ${renderImportSection(ops, importQ)}
        ${renderDriveSection(ops)}
        ${renderEncounterSection(ops, encStatus)}
        ${renderCfSection(ops)}
        ${renderReadinessSection(ops)}
        ${renderNextStepsSection(ops, morning, journalLive, photoOp, mailOp, importQ)}
      </div>
      <p class="cow-muted" style="margin-top:1.25rem">
        Presentation: <a class="cow-btn" href="/cco-personal-start.html">cco-personal-start</a>
        · denna vy är endast för ops efter mötet.
      </p>`;
  }

  boot();
})();
