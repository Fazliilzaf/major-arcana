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

  function renderPhotoSection(ops, livePhoto, photoPageStatus) {
    const snap = ops?.photoReview || {};
    const apiPending = Number(livePhoto?.pendingPhotos ?? livePhoto?.pendingPhotosAll ?? 0);
    const useLive = apiPending > 0;
    const row = useLive ? livePhoto : snap;
    const pending = row?.pendingPhotos ?? row?.pendingPhotosAll;
    const patients = row?.patientsWithPendingPhotos;
    const visible = row?.photosVisibleCount ?? 0;
    const writeOn = row?.writeEnabled === true;
    const toolPath = '/photo-review.html';
    const toolOk = photoPageStatus === 200;

    return `
      <section class="cow-section" id="photo">
        <div class="cow-section-head">
          <h2>2 · Photo Review</h2>
          ${pill(writeOn ? 'WRITE PÅ' : 'WRITE AV')}
        </div>
        <p class="cow-callout"><strong>Dag 1:</strong> migrerade före/efter-bilder är <strong>inte kliniska</strong> före Photo Review + naming. <strong>0 VISIBLE</strong> på kundkort tills operatör granskat. Ingen auto-approve · ingen massapproval.</p>
        <p class="cow-muted">Operatörsstatus — inte approval. Write på prod ska vara AV.</p>
        <div class="cow-metrics">
          ${metric(pending ?? '—', 'pending bilder')}
          ${metric(patients ?? '—', 'antal kunder')}
          ${metric(visible, 'VISIBLE på kundkort')}
          ${metric(useLive ? 'live API' : snap.source || 'snapshot', 'datakälla')}
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

  function renderMailSection(ops, mailRef) {
    const m = ops?.mailAmbiguous || {};
    const { counts, source } = resolveMailMailboxCounts(m, mailRef);
    const mailboxHtml = MAILBOX_LABELS.map(
      ([id, label]) => `<li>${escapeHtml(label)}: ${escapeHtml(counts[id] ?? '—')} pending</li>`
    ).join('');

    return `
      <section class="cow-section" id="mail">
        <div class="cow-section-head">
          <h2>3 · Mail ambiguous review</h2>
          ${pill(m.operational || '—')}
        </div>
        <div class="cow-metrics">
          ${metric(m.remaining ?? m.pending, 'remaining')}
          ${metric(m.approved, 'approved')}
          ${metric(m.unresolved, 'unresolved')}
          ${metric(m.excluded, 'excluded')}
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

  function renderImportSection(ops) {
    const q = ops?.importReviewQueue;
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
          ${pill(q.status || 'WAITING')}
        </div>
        <div class="cow-metrics">${metric(q.total, 'osäkra kundmatchningar (totalt)')}</div>
        <ul class="cow-list">${sources}</ul>
        <p class="cow-muted">${escapeHtml(q.rule || '')}</p>
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

    return `
      <section class="cow-section" id="readiness">
        <h2>8 · Daglig readiness</h2>
        <p class="cow-muted">Senast genererad: ${escapeHtml(d.generatedAt || ops?.generatedAt || '—')}</p>
        <dl class="cow-dl">
          <dt>Journalpilot</dt><dd>${escapeHtml(d.journalPilot || '—')}</dd>
          <dt>Mail</dt><dd>${escapeHtml(d.mail || '—')}</dd>
          <dt>Photo pending</dt><dd>${escapeHtml(d.photoPending ?? '—')}</dd>
        </dl>
        <p class="cow-muted">Full rapport uppdateras med <code>npm run cco:daily-readiness</code> (repo: ${escapeHtml(d.docFile || 'docs/strategy/CCO-DAILY-READINESS-2026-06-04.md')}).</p>
        <p class="cow-muted">Executive snapshot finns i samma kvällsrun — ingen patientdata.</p>
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
      livePhoto,
      photoStatus,
      encStatus,
    ] = await Promise.all([
      fetchJson('/cco-ops-workbench-snapshot.json').then((r) =>
        r.ok ? r : fetchJson('/cco-presentation-ops-status.json')
      ),
      fetchJson('/cco-personal-demo-manifest.json'),
      fetchJson('/cco-4june-morning-check.json'),
      fetchJson('/mail-ambiguous-mailbox-reference.json'),
      fetchJson('/cco-journal-pilot-live-monitor.json'),
      loadPhotoSummary(),
      probePage('/photo-review.html'),
      probePage('/encounter-mapping-review.html'),
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
    const gateFail = morning?.presentationGate === 'FAIL';

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
        ${renderCommandStatus(morning, manifest)}
        ${renderJournalPilotLiveSection(journalLive, manifest)}
        ${renderJournalSection(ops, manifest)}
        ${renderPhotoSection(ops, livePhoto, photoStatus)}
        ${renderMailSection(ops, mailRef)}
        ${renderImportSection(ops)}
        ${renderDriveSection(ops)}
        ${renderEncounterSection(ops, encStatus)}
        ${renderCfSection(ops)}
        ${renderReadinessSection(ops)}
      </div>
      <p class="cow-muted" style="margin-top:1.25rem">
        Presentation: <a class="cow-btn" href="/cco-personal-start.html">cco-personal-start</a>
        · denna vy är endast för ops efter mötet.
      </p>`;
  }

  boot();
})();
