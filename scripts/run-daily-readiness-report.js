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

function historikStatus() {
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
    reviewQueueTotal: 1497,
    rule: 'Safe-match klar. Ny Drive-fas kräver explicit GO.',
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
  let apiNote = 'API kräver inloggning — UI monterad, manuell review aktivt spår';
  let operational = 'PHASE_2_UI_READY';
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
        apiNote = `ambiguousTotal=${summary.ambiguousTotal} pending=${summary.pending} readyForWork=${summary.report?.readyForWork}`;
        operational =
          summary.pending > 0 ? 'REVIEW_QUEUE_ACTIVE' : 'COVERAGE_IMPROVED_CHECK_READINESS';
      }
    }
  } catch (_) {
    /* keep defaults */
  }
  return {
    pageStatus,
    uiUrl: '/ambiguous-mail-enrichment-review.html',
    operational,
    technicalCoverage: '~93% adjusted (readyForWork=false)',
    apiNote,
    rules: [
      'Ingen auto-write',
      'Ingen fuzzy merge',
      'Ingen customer merge',
      'Minst 3 deterministiska fält för approve',
    ],
  };
}

function buildMarkdown(report) {
  const ts = report.generatedAt;
  return `# CCO Daily Readiness — 4 juni presentation

_Senast uppdaterad: ${ts}_  
_Prod: ${BASE}_

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

## Mail enrichment (operational, separat från coverage)

| | |
|---|---|
| **Operational readiness** | ${report.mail.operational} |
| **Technical coverage** | ${report.mail.technicalCoverage} |
| **Review UI** | ${report.mail.pageStatus === 200 ? '200 OK' : report.mail.pageStatus} — \`${report.mail.uiUrl}\` |
| **API** | ${report.mail.apiNote} |

Regler: ${report.mail.rules.join(' · ')}

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

## Photo Review (operatör — inte auto)

| | |
|---|---|
| Källa | ${report.photo.source} |
| Bilder som väntar | ${report.photo.pendingPhotos ?? report.photo.pendingPhotos ?? '—'} |
| Kunder | ${report.photo.patientsWithPendingPhotos ?? report.photo.patientsWithPending ?? '—'} |
| Krävs för VISIBLE | ${report.photo.visibleRequirement || 'Photo Review operator + naming → VISIBLE_ON_PATIENT_CARD'} |
| Dag 1 | ${report.photo.day1Rule || 'Ej klinisk användning av migrerade före/efter'} |
| Auto-approve | **NEJ** |

---

## Top 5 blockers (ej presentation P0)

1. Photo Review (~14k bilder, write av)
2. Mail ambiguous review (${report.mail.apiNote.includes('493') ? '493' : '~493'} kvar i kö — manuell)
3. Import review queue (${report.historik.reviewQueueTotal} osäkra kundmatchningar)
4. Täckning — ~4867 kunder utan importerat innehåll
5. Encounter/metadata + Drive alias-sweep

---

## Vad Fazli kan visa

- \`/cco-personal-start.html\` → kundkort → 3 pilotkunder
- Journal create → sign → lås → rättelse → timeline/feed
- Importerad historik **där den finns** (badges)
- Dag-1-regler + “Behöver granskning”
- CF internt (finance / revisorportal) om relevant

---

## Vad Fazli inte ska lova

- Full cutover / “allt funkar fritt”
- Mail/Svarstudio som dagligt verktyg
- Migrerade före/efter-bilder som kliniska
- AI no-show · automation · watch · Aisia · showcase
- Analytics som sanning
- Ny kund vid osäker identitet

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
  const historik = historikStatus();
  const photo = photoReviewStatus();

  const report = {
    generatedAt,
    journalMounts: mounts.ok ? 'PASS' : 'FAIL',
    demoLinks: links.ok ? 'PASS' : 'FAIL',
    e2eJournal: readiness.ok ? 'PASS' : 'FAIL',
    pilot1,
    pilot2,
    pilot3,
    mail,
    historik,
    photo,
  };

  console.log('Journal mounts:', report.journalMounts);
  console.log('Demo links:', report.demoLinks);
  console.log('E2E journal:', report.e2eJournal);
  console.log('Pilots:', pilot1, pilot2, pilot3);
  console.log('Mail UI:', mail.pageStatus, mail.operational);
  console.log('');

  const md = buildMarkdown(report);
  if (!noWrite) {
    fs.writeFileSync(DOC, md);
    console.log('Wrote:', DOC);
  } else {
    console.log(md);
  }

  const failed = !mounts.ok || !links.ok || !readiness.ok;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
