#!/usr/bin/env node
'use strict';

/**
 * run-daily-readiness-report.js — evening status for 4 juni presentation track
 *
 * Runs presentation gate + operational probes (mail, drive historik, photo review).
 * Updates docs/strategy/CCO-DAILY-READINESS-2026-06-04.md
 *
 *   node scripts/run-daily-readiness-report.js
 *   node scripts/run-daily-readiness-report.js --no-write
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const https = require('node:https');

const {
  normalizeMailProgress,
  publishMailboxReferencePublic,
} = require('./lib/ccoMailReadinessSnapshot');
const {
  collectJournalPilotLiveMonitor,
  publishJournalPilotLiveMonitor,
} = require('./lib/ccoJournalPilotLiveMonitor');
const {
  collectPhotoReviewOperatorStatus,
  publishPhotoReviewOperatorStatus,
} = require('./lib/ccoPhotoReviewOperatorStatus');
const {
  collectMailReviewOperatorStatus,
  publishMailReviewOperatorStatus,
} = require('./lib/ccoMailReviewOperatorStatus');
const {
  collectImportReviewQueueStatus,
  publishImportReviewQueueStatus,
} = require('./lib/ccoImportReviewQueueSnapshot');
const { collectIdentitySafetyStatus } = require('./lib/ccoIdentitySafetyStatus');
const { buildDay1OperationsSnapshot } = require('./lib/ccoDay1OperationsSnapshot');

const REPO = path.join(__dirname, '..');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const DOC = path.join(REPO, 'docs/strategy/CCO-DAILY-READINESS-2026-06-04.md');
const ROLE = process.env.CCO_PERSONAL_DEMO_ROLE || 'owner';

function probe(method, urlPath) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE);
    const req = https.request(
      url,
      {
        method,
        headers: { 'x-cco-role': ROLE, 'x-cco-tenant': 'hairtpclinic' },
        timeout: 15000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      }
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

function run(cmd) {
  try {
    return {
      ok: true,
      output: execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + (err.stderr || '') + (err.message || '') };
  }
}

function historikStatus(importQueue) {
  const iq = importQueue || {};
  return {
    halso: {
      status: 'IMPORTED_SAFE_MATCH',
      note: '~3660 säkra match · ~1660 kunder med metadata på kundkort',
      reviewQueue: 1366,
    },
    getAccept: {
      status: 'IMPORTED',
      note: '~1404 avtal · ~1331 kunder · PDF i CCO storage',
      reviewQueue: 131,
    },
    driveJournals: {
      status: 'IMPORTED_SAFE_MATCH',
      note: '~5152 historiska poster · ~1456 patienter',
      reviewQueue: 0,
    },
    driveDocuments: {
      status: 'IMPORTED_PARTIAL',
      note: 'Safe-match klar — ingen ny riskimport utan GO',
      reviewQueue: 'import review queue 1497 totalt (kundmatch)',
    },
    drivePhotos: {
      status: 'NEEDS_REVIEW',
      note: 'Binärer inne — Photo Review write AV · ej klinisk dag 1',
      reviewQueue: '~885+ assets NEEDS_REVIEW',
    },
    reviewQueueTotal: iq.total ?? 1497,
    rule: iq.rule || 'Safe-match klar. Ny Drive-fas kräver explicit GO.',
  };
}

function staffUsability(report) {
  const can = [];
  const cannot = [];
  if (
    report.journalMounts === 'PASS' &&
    report.demoLinks === 'PASS' &&
    report.e2eJournal === 'PASS'
  ) {
    can.push(
      'Journalpilot demo (personal-start → pilotkund → journal → sign → rättelse → timeline)'
    );
  } else {
    cannot.push('Journaldemo tills presentation-gate PASS');
  }
  if (report.journalLive?.personalCanContinueJournaling === 'JA') {
    can.push('Fortsatt journalföring efter mötet (live monitor JA)');
  }
  if (report.photoOperator?.operatorMode === 'READY') {
    can.push(
      `Photo Review operator (${report.photo.pendingPhotos ?? '—'} pending, write ${report.photo.writeEnabled === true ? 'PÅ' : 'AV'})`
    );
  }
  cannot.push('Migrerade före/efter-bilder som kliniska behandlingsbilder');
  cannot.push('Auto-approve / massapproval Photo Review');
  if (report.mail?.progress?.remaining > 0) {
    can.push(`Mail ambiguous review (${report.mail.progress.remaining} kvar)`);
  }
  cannot.push('Mail auto-write · fuzzy merge · Graph-fetch från UI');
  cannot.push(`Import review queue (${report.importQueue?.total ?? 1497}) — ingen auto-import`);
  cannot.push('Ny kund vid osäker match');
  cannot.push('Aisia · extern AI på journaltext · Drive-länkar i personal-start');
  return { can, cannot };
}

function topBlockers(report) {
  const blockers = [];
  if (report.journalMounts !== 'PASS' || report.e2eJournal !== 'PASS') {
    blockers.push('P0: Journaldemo / presentation-gate');
  }
  if (report.photoOperator?.pendingPhotos > 0) {
    blockers.push(
      `Photo Review: ${report.photoOperator.pendingPhotos} bilder · ${report.photoOperator.patientsWithPendingPhotos ?? '—'} kunder · 0 VISIBLE`
    );
  }
  if (report.mail?.progress?.remaining > 0) {
    blockers.push(`Mail ambiguous: ${report.mail.progress.remaining} remaining`);
  }
  if (report.importQueue?.total > 0) {
    blockers.push(`Import review queue: ${report.importQueue.total} osäkra kundmatchningar`);
  }
  blockers.push('Täckning — många kunder utan importerat innehåll');
  return blockers.slice(0, 5);
}

function probeJson(urlPath) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, BASE);
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { 'x-cco-role': ROLE, 'x-cco-tenant': 'hairtpclinic', Accept: 'application/json' },
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode || 0, json });
        });
      }
    );
    req.on('error', () => resolve({ status: 0, json: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, json: null });
    });
    req.end();
  });
}

async function photoReviewStatusLive() {
  const local = photoReviewStatus();
  const live = await probeJson('/api/v1/cco/photo-review/summary');
  const localPending = Number(local.pendingPhotos ?? local.pendingPhotosAll ?? 0);
  const livePending = Number(live.json?.pendingPhotos ?? live.json?.pendingPhotosAll ?? 0);

  const writeEnabled = live.json?.writeEnabled === true;

  if (live.status === 200 && live.json && livePending > 0) {
    return {
      source: 'prod_api',
      writeEnabled,
      readOnly: !writeEnabled,
      pendingPhotos: livePending,
      patientsWithPendingPhotos: live.json.patientsWithPendingPhotos,
      photosVisibleCount: live.json.photosVisibleCount ?? 0,
      phase: live.json.phase,
      day1Rule: 'Migrerade före/efter ej kliniska dag 1',
      autoApprove: false,
      apiStatus: 200,
    };
  }

  if (localPending > 0) {
    return {
      ...local,
      writeEnabled,
      readOnly: !writeEnabled,
      source: live.status === 200 ? 'local_snapshot_prod_api_empty' : 'local_snapshot',
      apiStatus: live.status || 'unavailable',
      day1Rule: 'Migrerade före/efter ej kliniska dag 1 · ej kliniska före/efter dag 1',
      autoApprove: false,
      presentationNote:
        '860 pending / 150 kunder / 0 VISIBLE (operatörsreferens från prod-data-snapshot)',
    };
  }

  if (live.status === 200 && live.json) {
    return {
      source: 'prod_api',
      writeEnabled,
      readOnly: !writeEnabled,
      pendingPhotos: livePending,
      patientsWithPendingPhotos: live.json.patientsWithPendingPhotos,
      photosVisibleCount: live.json.photosVisibleCount ?? 0,
      phase: live.json.phase,
      day1Rule: 'Migrerade före/efter ej kliniska dag 1',
      autoApprove: false,
      apiStatus: 200,
    };
  }

  return {
    ...local,
    apiStatus: live.status || 'unavailable',
    day1Rule: local.day1Rule || 'Migrerade före/efter ej kliniska dag 1',
    autoApprove: false,
  };
}

function photoReviewStatus() {
  const prodRoot =
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      process.env.HOME,
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    );
  const assetsPath = path.join(prodRoot, 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    return {
      source: 'doc_estimate',
      pendingPhotos: '~14000+',
      patientsWithPending: 'many',
      visibleRequirement:
        'Photo Review operator: naming + manual_resolved → VISIBLE_ON_PATIENT_CARD (scripts: photo-review-naming-integration-report, run-post-review-report-batch)',
      day1Rule: 'Använd inte migrerade före/efter-bilder kliniskt',
      autoApprove: false,
    };
  }
  try {
    const out = run('node scripts/photo-review-batch-status.js');
    if (out.ok) return { source: 'local_prod_snapshot', ...JSON.parse(out.output) };
  } catch (_) {
    /* fall through */
  }
  return { source: 'unavailable' };
}

async function mailReadiness() {
  const pageStatus = await probe('GET', '/ambiguous-mail-enrichment-review.html');
  const fallback = normalizeMailProgress(
    {
      ambiguousTotal: 493,
      pending: 493,
      approved: 0,
      excluded: 0,
      unresolved: 0,
      remaining: 493,
      mailboxCounts: {},
      readyForWork: false,
      adjustedCoveragePercent: 93,
      source: 'doc_fallback',
    },
    { root: REPO }
  );
  let apiNote = 'Mailbox-breakdown från referenssnapshot (summary API utan auth)';
  let operational = 'PHASE_2_UI_READY';
  let progress = { ...fallback };
  try {
    const tokenScript = run('node scripts/get-prod-auth-token.js --owner');
    if (tokenScript.ok) {
      const token = tokenScript.output.trim().split('\n').pop();
      const summary = await new Promise((resolve) => {
        const url = new URL(
          '/api/v1/ops/cco/enrichment/gap-recovery/ambiguous-review/summary?tenantId=hair-tp-clinic',
          BASE
        );
        const req = https.request(
          url,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            timeout: 15000,
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(null);
              }
            });
          }
        );
        req.on('error', () => resolve(null));
        req.end();
      });
      if (summary?.ambiguousTotal != null) {
        const r = summary.report || {};
        const unresolved =
          (summary.unresolved ?? 0) +
          (summary.ownerAcceptedUnresolved ?? r.ownerAcceptedUnresolved ?? 0);
        progress = normalizeMailProgress(
          {
            source: 'prod_api',
            ambiguousTotal: summary.ambiguousTotal ?? r.ambiguousTotal ?? fallback.ambiguousTotal,
            pending: summary.pending ?? r.remainingAmbiguous ?? fallback.pending,
            approved: summary.approved ?? r.approved ?? 0,
            excluded: summary.excluded ?? 0,
            unresolved,
            remaining: r.remainingAmbiguous ?? summary.pending ?? fallback.remaining,
            mailboxCounts: summary.mailboxCounts || r.mailboxCounts || {},
            readyForWork: r.readyForWork === true,
            adjustedCoveragePercent: r.adjustedCoveragePercent ?? fallback.adjustedCoveragePercent,
            operationalReadiness: r.operationalReadiness ?? operational,
          },
          { root: REPO }
        );
        apiNote = `ambiguousTotal=${progress.ambiguousTotal} pending=${progress.pending} approved=${progress.approved} excluded=${progress.excluded} unresolved=${progress.unresolved} remaining=${progress.remaining} mailboxSource=${progress.mailboxCountsSource || 'prod_api'}`;
        operational =
          progress.pending > 0 ? 'REVIEW_QUEUE_ACTIVE' : 'COVERAGE_IMPROVED_CHECK_READINESS';
      }
    }
  } catch (_) {
    /* keep defaults */
  }
  progress = normalizeMailProgress(progress, { root: REPO });
  if (progress.mailboxCountsSource === 'reference_snapshot') {
    apiNote = 'Summary API utan auth — mailbox-breakdown från referenssnapshot (remaining=493)';
  }
  return {
    pageStatus,
    uiUrl: '/ambiguous-mail-enrichment-review.html',
    operational,
    technicalCoverage: `~${progress.adjustedCoveragePercent}% adjusted (readyForWork=false)`,
    apiNote,
    queueNote: '~493 ambiguous · paginering 100/rad · mailbox-filter · ingen auto-write',
    progress,
    rules: [
      'Ingen auto-write',
      'Ingen fuzzy merge',
      'Ingen customer merge',
      'Ingen Graph-fetch',
      'Ingen ny mailimport',
      'Minst 3 deterministiska fält för approve',
    ],
  };
}

async function cfReadiness() {
  const finance = await probe('GET', '/finance.html');
  const review = await probe('GET', '/finance-review.html');
  const reports = await probe('GET', '/finance-reports.html');
  const allOk = finance === 200 && review === 200 && reports === 200;
  return {
    financeStatus: finance,
    reviewStatus: review,
    reportsStatus: reports,
    operational: allOk ? 'INTERN_DEMO_READY' : 'CHECK_ROUTES',
    note: 'Fortnox blockerad — CCO-native CF internt, ej klinik-P0',
  };
}

function driveReadiness(historik) {
  return {
    operational: 'SAFE_MATCH_COMPLETE_NO_NEW_RISK_WITHOUT_GO',
    halso: historik.halso.status,
    getAccept: historik.getAccept.status,
    driveJournals: historik.driveJournals.status,
    driveDocuments: historik.driveDocuments.status,
    drivePhotos: historik.drivePhotos.status,
    reviewQueueTotal: historik.reviewQueueTotal,
    rule: historik.rule,
  };
}

function buildMarkdown(report) {
  const ts = report.generatedAt;
  const journalOk =
    report.journalMounts === 'PASS' && report.demoLinks === 'PASS' && report.e2eJournal === 'PASS';
  return `# CCO Daily Readiness — 4 juni presentation

_Senast uppdaterad: ${ts}_  
_Prod: ${BASE}_

---

## Executive snapshot (kväll)

| Spår | Status |
| ---- | ------ |
| **Journalpilot** | ${journalOk ? '**PASS**' : '**CHECK**'} (mounts ${report.journalMounts} · links ${report.demoLinks} · E2E ${report.e2eJournal}) |
| **Journalpilot live** | ${report.journalLive?.overall ?? '—'} · personal kan journalföra: **${report.journalLive?.personalCanContinueJournaling ?? '—'}** |
| **Dag 1 arbetspass** | **${report.day1?.day1JournalPilot?.shiftStatusLabel ?? '—'}** · ${report.day1?.recommendedNextAction ?? '—'} |
| **Pilot 1/2/3** | ${report.pilot1} / ${report.pilot2} / ${report.pilot3} |
| **Mail** | ${report.mail.operational} · remaining **${report.mail.progress.remaining}** |
| **Drive/historik** | ${report.drive.operational} · review queue **${report.drive.reviewQueueTotal}** |
| **Photo Review** | ${report.photoOperator?.overall ?? '—'} · ${report.photo.pendingPhotos ?? '—'} pending · write **${report.photo.writeEnabled === true ? 'PÅ' : 'AV'}** |
| **Mail review operator** | ${report.mailOperator?.overall ?? '—'} · remaining **${report.mailOperator?.remaining ?? report.mail.progress.remaining}** |
| **Import review queue** | **${report.importQueue?.total ?? '—'}** · ${report.importQueue?.status ?? 'WAITING_MANUAL_REVIEW'} |
| **CF** | ${report.cf.operational} |

---

## Presentation P0 (journalpilot)

| Check | Status |
| ----- | ------ |
| Journal route regression | **${report.journalMounts}** |
| Demo links preflight | **${report.demoLinks}** |
| E2E journal (3 piloter) | **${report.e2eJournal}** |
| Pilotkund 1 | **${report.pilot1}** |
| Pilotkund 2 | **${report.pilot2}** |
| Pilotkund 3 | **${report.pilot3}** |

**Efter varje deploy:** \`npm run cco:presentation-gate\`

---

## Dag 1 · Journalpilot (operations panel)

| | |
|---|---|
| **Arbetspass** | **${report.day1?.day1JournalPilot?.shiftStatusLabel ?? '—'}** — ${report.day1?.day1JournalPilot?.shiftReason ?? '—'} |
| **Presentation gate** | ${report.day1?.day1JournalPilot?.presentationGate ?? '—'} |
| **Journal E2E** | ${report.day1?.day1JournalPilot?.journalE2E ?? '—'} |
| **Pilot 1/2/3** | ${report.day1?.day1JournalPilot?.pilot1} / ${report.day1?.day1JournalPilot?.pilot2} / ${report.day1?.day1JournalPilot?.pilot3} |
| **Journalföring 24h** | ${report.day1?.day1JournalPilot?.last24h?.journalEntriesActivity ?? '—'} |
| **Signerade** | ${report.day1?.day1JournalPilot?.last24h?.signedCount ?? '—'} |
| **Rättelser** | ${report.day1?.day1JournalPilot?.last24h?.correctionsCount ?? '—'} |
| **Fel** | ${report.day1?.day1JournalPilot?.last24h?.errorsCount ?? '—'} |
| **Route 5xx** | ${report.day1?.day1JournalPilot?.route5xxCount ?? '—'} |
| **Nästa action** | **${report.day1?.recommendedNextAction ?? '—'}** |
| **Workbench** | \`/cco-ops-workbench.html\` |

Identitetssäkerhet: pre-sign ${report.day1?.identitySafety?.preSignCheckAvailable ? 'OK' : '—'} · review-warning ${report.day1?.identitySafety?.reviewMaterialWarningAvailable ? 'OK' : '—'} · checklist ${report.day1?.identitySafety?.staffChecklistAvailable ? 'OK' : '—'} · sign-off ${report.day1?.identitySafety?.signoffSheetAvailable ? 'OK' : '—'}

---

## Journal Pilot Live (day-1 operations)

| | |
|---|---|
| **Live monitor** | **${report.journalLive?.overall ?? '—'}** |
| **Personal kan fortsätta journalföra** | **${report.journalLive?.personalCanContinueJournaling ?? '—'}** |
| **Journal writes / aktivitet (24h)** | ${report.journalLive?.last24h?.journalEntriesActivity ?? '—'} |
| **Signerade/låsta (24h)** | ${report.journalLive?.last24h?.signedCount ?? '—'} |
| **Rättelser (24h)** | ${report.journalLive?.last24h?.correctionsCount ?? '—'} |
| **Journal errors (24h)** | ${report.journalLive?.last24h?.errorsCount ?? '—'} |
| **Blocked locked-edit (24h)** | ${report.journalLive?.last24h?.blockedLockedEditAttempts ?? '—'} |
| **Route health** | ${report.journalLive?.routeHealthPass ?? '—'} · 5xx: ${report.journalLive?.route5xxCount ?? '—'} |
| **Feed/timeline/forms** | ${report.journalLive?.feedTimelineFormsHealth ?? '—'} |
| **Senaste lyckade write** | ${report.journalLive?.last24h?.lastSuccessfulJournalWriteAt ?? '—'} |
| **Senaste misslyckade write** | ${report.journalLive?.last24h?.lastFailedJournalWriteAt ?? '—'} |
| **Audit events (24h)** | ${report.journalLive?.last24h?.auditEventsCount ?? '—'} |

Export: \`public/cco-journal-pilot-live-monitor.json\` · read-only · ingen journaltext

---

## Mail enrichment (operational ≠ technical)

| | |
|---|---|
| **Operational readiness** | ${report.mail.operational} |
| **Technical coverage** | ${report.mail.technicalCoverage} |
| **Review UI** | ${report.mail.pageStatus === 200 ? '200 OK' : report.mail.pageStatus} — \`${report.mail.uiUrl}\` |
| **Progress** | approved **${report.mail.progress.approved}** · unresolved **${report.mail.progress.unresolved}** · excluded **${report.mail.progress.excluded}** · remaining **${report.mail.progress.remaining}** |
| **Mailbox pending** | contact@ **${report.mail.progress.mailboxCounts['contact@hairtpclinic.com'] ?? '—'}** · egzona@ **${report.mail.progress.mailboxCounts['egzona@hairtpclinic.com'] ?? '—'}** · fazli@ **${report.mail.progress.mailboxCounts['fazli@hairtpclinic.com'] ?? '—'}** · marknad@ **${report.mail.progress.mailboxCounts['marknad@hairtpclinic.com'] ?? '—'}** |
| **API / not** | ${report.mail.apiNote} |

Export: \`data/reports/mail-ambiguous-operational-status.json\` (kvällsrun)

Regler: ${report.mail.rules.join(' · ')} · **får inte störa journal-demo**

---

## Chief of Finance (internt)

| Route | HTTP |
| ----- | ---- |
| \`/finance.html\` | ${report.cf.financeStatus} |
| \`/finance-review.html\` | ${report.cf.reviewStatus} |
| \`/finance-reports.html\` | ${report.cf.reportsStatus} |
| **Status** | **${report.cf.operational}** — ${report.cf.note} |

---

## Drive / historik på kundkort

| Källa | Status | Not |
| ----- | ------ | --- |
| halso@ | ${report.historik.halso.status} | ${report.historik.halso.note} |
| GetAccept | ${report.historik.getAccept.status} | ${report.historik.getAccept.note} |
| Drive journaler | ${report.historik.driveJournals.status} | ${report.historik.driveJournals.note} |
| Drive dokument | ${report.historik.driveDocuments.status} | ${report.historik.driveDocuments.note} |
| Drive bilder | ${report.historik.drivePhotos.status} | ${report.historik.drivePhotos.note} |
| Review queue (totalt) | — | ${report.historik.reviewQueueTotal} osäkra kundmatchningar |

**Regel:** ${report.historik.rule}

---

## Drive status (read-only, ingen ny riskimport)

| | |
|---|---|
| **Operational** | ${report.drive.operational} |
| halso@ | ${report.drive.halso} |
| GetAccept | ${report.drive.getAccept} |
| Drive journaler | ${report.drive.driveJournals} |
| Drive dokument | ${report.drive.driveDocuments} |
| Drive bilder | ${report.drive.drivePhotos} |
| Review queue | **${report.drive.reviewQueueTotal}** osäkra kundmatchningar |

---

## Photo Review (operatör — inte auto)

| | |
|---|---|
| Källa | ${report.photo.source} |
| Bilder som väntar | ${report.photo.pendingPhotos ?? '—'} |
| Kunder | ${report.photo.patientsWithPendingPhotos ?? report.photo.patientsWithPending ?? '—'} |
| Not | ${report.photo.presentationNote || '—'} |
| Krävs för VISIBLE | ${report.photo.visibleRequirement || 'Photo Review operator + naming → VISIBLE_ON_PATIENT_CARD'} |
| VISIBLE på kundkort | ${report.photo.photosVisibleCount ?? 0} (före/efter ej kliniska dag 1) |
| Prod API | ${report.photo.apiStatus ?? (report.photo.source === 'prod_api' ? '200' : '—')} |
| Operatörverktyg | \`/photo-review.html\` (ej länk från personalstart) |
| Write på prod | **${report.photo.writeEnabled === true ? 'PÅ' : 'AV'}** (AV = korrekt inför dag 1) |
| Auto-approve | **NEJ** |
| Massapproval | **NEJ** |
| Dag 1 klinisk | **NEJ** — migrerade före/efter ej behandlingsbilder före manuell review |

---

## Photo Review operator

| | |
|---|---|
| **Status** | ${report.photoOperator?.overall ?? '—'} |
| **Pending** | ${report.photoOperator?.pendingPhotos ?? report.photo.pendingPhotos ?? '—'} |
| **Kunder** | ${report.photoOperator?.patientsWithPendingPhotos ?? '—'} |
| **VISIBLE** | ${report.photoOperator?.photosVisibleCount ?? 0} |
| **Write prod** | **${report.photo.writeEnabled === true ? 'PÅ' : 'AV'}** |
| **Verktyg** | \`/photo-review.html\` · session export JSON |

---

## Mail review operator

| | |
|---|---|
| **Status** | ${report.mailOperator?.overall ?? '—'} |
| **Remaining** | ${report.mailOperator?.remaining ?? report.mail.progress.remaining} |
| **Approved** | ${report.mailOperator?.approved ?? report.mail.progress.approved} |
| **Verktyg** | \`/ambiguous-mail-enrichment-review.html\` |

---

## Import review queue (read-only)

| Källa | Antal |
| ----- | ----- |
${(report.importQueue?.sources || [])
  .map((s) => `| ${s.label} | ${s.queueCount ?? '—'} |`)
  .join('\n')}

**Totalt:** ${report.importQueue?.total ?? '—'} · ${report.importQueue?.status ?? 'WAITING_MANUAL_REVIEW'}  
${report.importQueue?.rule ?? ''}

---

## Top blockers

${topBlockers(report)
  .map((b, i) => `${i + 1}. ${b}`)
  .join('\n')}

---

## Vad personal kan använda

${staffUsability(report)
  .can.map((c) => `- ${c}`)
  .join('\n')}

---

## Vad personal inte ska använda

${staffUsability(report)
  .cannot.map((c) => `- ${c}`)
  .join('\n')}

---

## Stopp-regler (P0)

Stoppa vid: 404/5xx i demo-flow · trasig pilotkund · journal fail · Drive-länk · patientdata i GitHub · journaltext till extern AI · customerId mismatch · ny kund vid osäker match.

---

_Ingen patientdata i denna rapport._
`;
}

async function main() {
  const noWrite = process.argv.includes('--no-write');
  const generatedAt = new Date().toISOString();

  console.log('=== CCO Daily Readiness Report ===');
  console.log('Base:', BASE);
  console.log('');

  const mounts = run('node scripts/verify-journal-pilot-routes.js');
  const links = run(`CCO_PERSONAL_DEMO_BASE=${BASE} node scripts/verify-personal-demo-links.js`);
  const readiness = run(
    `CCO_PERSONAL_DEMO_BASE=${BASE} node scripts/run-personal-demo-readiness.js`
  );

  let pilot1 = 'UNKNOWN';
  let pilot2 = 'UNKNOWN';
  let pilot3 = 'UNKNOWN';
  const runPath = path.join(REPO, 'data/reports/cco-personal-demo-readiness-run.json');
  if (fs.existsSync(runPath)) {
    try {
      const runJson = JSON.parse(fs.readFileSync(runPath, 'utf8'));
      const pilots = runJson.e2eByPilot || [];
      pilot1 = pilots[0]?.result || 'UNKNOWN';
      pilot2 = pilots[1]?.result || 'UNKNOWN';
      pilot3 = pilots[2]?.result || 'UNKNOWN';
    } catch (_) {
      /* ignore */
    }
  }

  const mail = await mailReadiness();
  const cf = await cfReadiness();
  const importQueue = collectImportReviewQueueStatus({ root: REPO });
  const historik = historikStatus(importQueue);
  const drive = driveReadiness(historik);
  const photo = await photoReviewStatusLive();

  let photoOperator = null;
  let mailOperator = null;
  try {
    photoOperator = await collectPhotoReviewOperatorStatus({ base: BASE });
  } catch (err) {
    photoOperator = { overall: 'FAIL', error: err.message };
  }

  let mailToken = null;
  try {
    const tokenScript = run('node scripts/get-prod-auth-token.js --owner');
    if (tokenScript.ok) mailToken = tokenScript.output.trim().split('\n').pop();
  } catch (_) {
    /* ignore */
  }
  try {
    mailOperator = await collectMailReviewOperatorStatus({
      base: BASE,
      root: REPO,
      token: mailToken,
    });
  } catch (err) {
    mailOperator = { overall: 'FAIL', error: err.message };
  }

  let identitySafety = null;
  try {
    identitySafety = await collectIdentitySafetyStatus({ base: BASE });
  } catch (err) {
    identitySafety = { overall: 'FAIL', error: err.message };
  }

  if (!noWrite) {
    publishImportReviewQueueStatus(importQueue, REPO);
    publishPhotoReviewOperatorStatus(photoOperator, REPO);
    publishMailReviewOperatorStatus(mailOperator, REPO);
  }

  const journalPilotOk =
    mounts.ok &&
    links.ok &&
    readiness.ok &&
    pilot1 === 'PASS' &&
    pilot2 === 'PASS' &&
    pilot3 === 'PASS';

  let journalLive = null;
  try {
    journalLive = await collectJournalPilotLiveMonitor({
      repo: REPO,
      base: BASE,
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
    });
    if (!noWrite) publishJournalPilotLiveMonitor(journalLive, REPO);
  } catch (err) {
    journalLive = {
      overall: 'FAIL',
      personalCanContinueJournaling: 'NEJ',
      error: err.message,
      last24h: {},
    };
  }

  const presentationGate =
    journalPilotOk && (journalLive?.overall || 'PASS') === 'PASS' ? 'PASS' : 'FAIL';

  const day1 = buildDay1OperationsSnapshot({
    journalPilot: {
      overall: journalPilotOk ? 'PASS' : 'FAIL',
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
      demoLinks: links.ok ? 'PASS' : 'FAIL',
      e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
      pilot1,
      pilot2,
      pilot3,
      presentationGate,
    },
    journalLive,
    photo,
    photoOperator,
    mail,
    mailOperator,
    importQueue,
    identitySafety,
    cf,
    presentationGate,
    retryable: false,
  });

  const opsStatusPath = path.join(REPO, 'public/cco-presentation-ops-status.json');
  const workbenchSnapshotPath = path.join(REPO, 'public/cco-ops-workbench-snapshot.json');
  const day1StatusPath = path.join(REPO, 'public/cco-day1-operations-status.json');
  const mailStatusPath = path.join(REPO, 'data/reports/mail-ambiguous-operational-status.json');
  const publicMailStatusPath = path.join(REPO, 'public/mail-ambiguous-operational-status.json');
  const opsPayload = {
    generatedAt,
    photoReview: {
      pendingPhotos: photo.pendingPhotos,
      patientsWithPendingPhotos: photo.patientsWithPendingPhotos,
      photosVisibleCount: photo.photosVisibleCount ?? 0,
      writeEnabled: photo.writeEnabled === true,
      readOnly: photo.readOnly !== false,
      source: photo.source,
      operatorToolPath: '/photo-review.html',
      presentationNote:
        photo.presentationNote ||
        '0 VISIBLE före review · migrerade bilder ej kliniska före review',
    },
    historik: {
      halso: historik.halso.status,
      getAccept: historik.getAccept.status,
      driveJournals: historik.driveJournals.status,
      driveDocuments: historik.driveDocuments.status,
      drivePhotos: historik.drivePhotos.status,
    },
    historikReviewQueueTotal: historik.reviewQueueTotal,
    mailAmbiguous: {
      operational: mail.operational,
      ...mail.progress,
      mailboxCounts: mail.progress.mailboxCounts,
      mailboxCountsSource: mail.progress.mailboxCountsSource,
      uiUrl: mail.uiUrl,
      rules: mail.rules,
    },
    cf: {
      operational: cf.operational,
      financeStatus: cf.financeStatus,
      reviewStatus: cf.reviewStatus,
      reportsStatus: cf.reportsStatus,
      fortnox: 'BLOCKED_INTEGRATION',
      authTest: 'PENDING_OWNER_TOKEN',
    },
    journalPilot: {
      overall: journalPilotOk ? 'PASS' : 'FAIL',
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
      demoLinks: links.ok ? 'PASS' : 'FAIL',
      e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
      pilot1,
      pilot2,
      pilot3,
      presentationGate: journalPilotOk ? 'PASS' : 'FAIL',
      checkedAt: generatedAt,
      personalStartUrl: '/cco-personal-start.html',
      kundkortUrl: '/kunder.html',
    },
    journalPilotLive: journalLive,
    photoReviewOperator: photoOperator,
    mailReviewOperator: mailOperator,
    importReviewQueue: {
      total: importQueue.total,
      status: importQueue.status,
      rule: importQueue.rule,
      dataSource: importQueue.dataSource,
      sources: importQueue.sources,
      operatorToolPath: null,
      nextAction: 'Manuell review — ingen auto-import · ingen ny kund',
    },
    encounterMetadata: {
      status: 'REVIEW_PAUSED_PRE_PRESENTATION',
      note: 'Encounter/medium mapping — separat spår, ej journal-P0',
      operatorToolPath: '/encounter-mapping-review.html',
    },
    dailyReadiness: {
      docFile: 'docs/strategy/CCO-DAILY-READINESS-2026-06-04.md',
      generatedAt,
      journalPilot: journalPilotOk ? 'PASS' : 'FAIL',
      journalPilotLive: journalLive?.overall || 'UNKNOWN',
      personalCanContinueJournaling: journalLive?.personalCanContinueJournaling || 'NEJ',
      mail: mail.operational,
      photoPending: photo.pendingPhotos,
      photoOperator: photoOperator?.overall,
      mailOperator: mailOperator?.overall,
      importQueueTotal: importQueue.total,
      driveRule: historik.rule,
    },
    staffCanUse: staffUsability({
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
      demoLinks: links.ok ? 'PASS' : 'FAIL',
      e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
      journalLive,
      photo,
      photoOperator,
      mail,
      importQueue,
    }).can,
    staffCannotUse: staffUsability({
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
      demoLinks: links.ok ? 'PASS' : 'FAIL',
      e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
      journalLive,
      photo,
      photoOperator,
      mail,
      importQueue,
    }).cannot,
    topBlockers: topBlockers({
      journalMounts: mounts.ok ? 'PASS' : 'FAIL',
      e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
      photoOperator,
      mail,
      importQueue,
    }),
    opsWorkbenchUrl: '/cco-ops-workbench.html',
    day1,
    day1JournalPilot: day1.day1JournalPilot,
    identitySafety: day1.identitySafety,
    photoReviewDay1: day1.photoReview,
    mailReviewDay1: day1.mailReview,
    importReviewDay1: day1.importReview,
    blockers: day1.blockers,
    recommendedNextAction: day1.recommendedNextAction,
  };
  if (!noWrite) {
    publishMailboxReferencePublic(REPO);
    fs.mkdirSync(path.dirname(mailStatusPath), { recursive: true });
    fs.writeFileSync(opsStatusPath, JSON.stringify(opsPayload, null, 2));
    fs.writeFileSync(workbenchSnapshotPath, JSON.stringify(opsPayload, null, 2));
    fs.writeFileSync(
      mailStatusPath,
      JSON.stringify(
        {
          generatedAt,
          base: BASE,
          ...mail.progress,
          operational: mail.operational,
          mailboxPending: mail.progress.mailboxCounts,
          rules: mail.rules,
        },
        null,
        2
      )
    );
    fs.writeFileSync(publicMailStatusPath, fs.readFileSync(mailStatusPath, 'utf8'));
    fs.writeFileSync(day1StatusPath, JSON.stringify(day1, null, 2));
  }

  const report = {
    generatedAt,
    journalMounts: mounts.ok ? 'PASS' : 'FAIL',
    demoLinks: links.ok ? 'PASS' : 'FAIL',
    e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
    pilot1,
    pilot2,
    pilot3,
    journalLive,
    mail,
    cf,
    drive,
    historik,
    photo,
    photoOperator,
    mailOperator,
    importQueue,
    day1,
  };

  console.log('Journal mounts:', report.journalMounts);
  console.log('Demo links:', report.demoLinks);
  console.log('E2E journal:', report.e2eJournal);
  console.log('Pilots:', pilot1, pilot2, pilot3);
  console.log(
    'Journal live:',
    journalLive?.overall,
    '· personal:',
    journalLive?.personalCanContinueJournaling,
    '· 24h errors:',
    journalLive?.last24h?.errorsCount
  );
  console.log('Mail UI:', mail.pageStatus, mail.operational);
  console.log(
    'Mail progress:',
    `approved=${mail.progress.approved}`,
    `remaining=${mail.progress.remaining}`
  );
  console.log('CF:', cf.operational, cf.financeStatus, cf.reviewStatus);
  console.log('Photo operator:', photoOperator?.overall, 'pending', photoOperator?.pendingPhotos);
  console.log('Mail operator:', mailOperator?.overall, 'remaining', mailOperator?.remaining);
  console.log('Import queue:', importQueue.total, importQueue.status);
  console.log(
    'Day-1 shift:',
    day1.day1JournalPilot.shiftStatusLabel,
    '· action:',
    day1.recommendedNextAction
  );
  console.log('');

  const md = buildMarkdown(report);
  if (!noWrite) {
    fs.writeFileSync(DOC, md);
    console.log('Wrote:', DOC);
  } else {
    console.log(md);
  }

  if (!noWrite) {
    run('node scripts/run-4june-morning-check.js --snapshot-only');
  }

  const failed = !mounts.ok || !links.ok || !readiness.ok;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
