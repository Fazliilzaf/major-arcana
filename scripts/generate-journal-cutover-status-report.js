#!/usr/bin/env node
'use strict';

/**
 * generate-journal-cutover-status-report.js
 * =======================================
 *
 * Jämför maj-audit vs repo-data vs prod asset-snapshot (counts only).
 * Skriver docs/strategy/JOURNAL-CUTOVER-STATUS-YYYY-MM-DD.md
 *
 *   node scripts/generate-journal-cutover-status-report.js
 *   node scripts/generate-journal-cutover-status-report.js --stdout
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const {
  loadCutoverStats,
  countPatientAssets,
  evaluateCriteria,
  overallStatus,
  complianceCheck,
} = require('./generate-cutover-readiness-report');
const { collectImportReviewQueueStatus } = require('./lib/ccoImportReviewQueueSnapshot');
const { buildPayload: buildMigrationTracksPayload } = require('./migration-tracks-batch-status');

function parseArgs(argv) {
  const args = { date: null, stdout: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--stdout') args.stdout = true;
    else if (raw.startsWith('--date=')) args.date = raw.split('=')[1];
  }
  if (!args.date) {
    const d = new Date();
    args.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return args;
}

function defaultProdSnapshotRoot() {
  if (process.env.ARCANA_CCO_PROD_DATA_ROOT) return process.env.ARCANA_CCO_PROD_DATA_ROOT;
  const candidates = [
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    ),
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data/cco-prod'
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'cco-patient-assets.json'))) return candidate;
  }
  return null;
}

function runJson(cmd) {
  try {
    return JSON.parse(
      execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    );
  } catch {
    return null;
  }
}

function statusEmoji(s) {
  if (s === 'green') return '🟢';
  if (s === 'yellow') return '🟡';
  return '🔴';
}

function renderTrackKickoff() {
  const saConfigured = Boolean(
    process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON_FILE
  );
  const photo = runJson('node scripts/photo-review-batch-status.js');
  const importReview = collectImportReviewQueueStatus({ root: ROOT });

  let driveDryRun = null;
  try {
    const out = execSync('node scripts/backfill-master-card-drive-coupling.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const pick = (re) => {
      const m = out.match(re);
      return m ? Number(m[1]) : null;
    };
    driveDryRun = {
      totalPatients: pick(/totalPatients\s+:\s+(\d+)/),
      predicted: pick(/predicted\s+:\s+(\d+)/),
      none: pick(/none\s+:\s+(\d+)/),
      predictedPct: pick(/predicted-pct\s+:\s+([\d.]+)%/),
    };
  } catch {
    driveDryRun = null;
  }

  let meridiqDryRun = null;
  try {
    const out = execSync('node scripts/import-meridiq-historical-journals.js --dry-run', {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const pick = (re) => {
      const m = out.match(re);
      return m ? Number(m[1]) : null;
    };
    meridiqDryRun = {
      eligible: pick(/eligible \(hasJournal\): (\d+)/),
      withMeridiqPatientId: pick(/with meridiqPatientId: (\d+)/),
      entriesPlanned: pick(/entries planned: (\d+)/),
    };
  } catch {
    meridiqDryRun = null;
  }

  return { saConfigured, photo, importReview, driveDryRun, meridiqDryRun };
}

function renderMarkdown({ date, repo, prodAssets, tracks, migrationTracks, dod, overall }) {
  const may = {
    customers: 7257,
    meridiq: 6268,
    driveIds: 0,
    journalEntries: 16,
    signed: 8,
    pdf: 0,
    templates: 82,
    audit: 115,
    photos: 0,
    readiness: 'RED',
    greens: 3,
  };

  const lines = [];
  lines.push(`# Journal Cutover — Aktuell statusrapport`);
  lines.push('');
  lines.push(`*Genererad: ${new Date().toISOString()} · Datum-tag: ${date}*`);
  lines.push(`*Jämförelsebas: \`docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md\`*`);
  lines.push(`*Compliance: counts only — ingen patientdata.*`);
  lines.push('');

  lines.push('## Executive summary');
  lines.push('');
  lines.push('| Spår | Maj audit | Repo `data/` idag | Prod asset-snapshot | Bedömning |');
  lines.push('|------|-----------|-------------------|---------------------|-----------|');
  lines.push(
    `| Cutover DoD (10) | ${may.readiness} (${may.greens}/10🟢) | ${overall.toUpperCase()} (${dod.filter((d) => d.status === 'green').length}/10🟢) | assets-only | Struktur byggd · data-gap kvar |`
  );
  lines.push(
    '| Journalföringspilot | Ej GO | API/smoke klart i kod | — | **GO** prod jun (se CCO-JOURNALING-READINESS) |'
  );
  lines.push(
    '| Patientdokument BOOKOFF | Ej påbörjat | **36/36 D·L·V** | — | Facit-spår klart (ej cutover DoD) |'
  );
  lines.push(
    `| Drive master-ID | ${may.driveIds}/${may.customers} | ${repo.stats.customers.withDrive}/${repo.stats.customers.total} | — | **Owner-blocker:** service-account |`
  );
  lines.push('');

  lines.push('## Miljöer');
  lines.push('');
  lines.push('| Miljö | Sökväg / källa | Användning |');
  lines.push('|-------|----------------|------------|');
  lines.push('| Repo `data/` | `./data/` | Cutover-script, dev-baseline |');
  lines.push(
    `| Prod asset-snapshot | \`${prodAssets?.root || 'saknas'}\` | Assets + review (${prodAssets?.snapshotDate || '—'}) |`
  );
  lines.push('| Prod live API | `arcana.hairtpclinic.com` | Pilot/journal-feed (jun-rapporter) |');
  lines.push('');

  lines.push('## Nyckeltal — maj → repo idag');
  lines.push('');
  lines.push('| Metric | Maj 2026 | Repo idag | Δ |');
  lines.push('|--------|----------|-----------|---|');
  lines.push(`| Cliento-kunder | ${may.customers} | ${repo.stats.customers.total} | = |`);
  lines.push(`| Meridiq-matched | ${may.meridiq} | ${repo.stats.customers.withMeridiq} | = |`);
  lines.push(
    `| Drive folder-ID | ${may.driveIds} | ${repo.stats.customers.withDrive} | **Oförändrat** |`
  );
  lines.push(
    `| Journal-entries | ${may.journalEntries} | ${repo.stats.journal.total} | +${repo.stats.journal.total - may.journalEntries} |`
  );
  lines.push(
    `| Signerade | ${may.signed} | ${repo.stats.journal.signed} | +${repo.stats.journal.signed - may.signed} |`
  );
  lines.push(
    `| Med PDF | ${may.pdf} | ${repo.stats.journal.withPdf} | +${repo.stats.journal.withPdf} |`
  );
  lines.push(
    `| Templates | ${may.templates} | ${repo.stats.templates.total} | +${repo.stats.templates.total - may.templates} |`
  );
  lines.push(`| Audit-events | ${may.audit} | ${repo.audit.total} | import-/asset-logg |`);
  lines.push(
    `| Foto-assets (patient_assets) | ${may.photos} | ${repo.stats.photos.total} | se nedan |`
  );
  lines.push(`| Dubblettkandidater | 28 | ${repo.stats.customers.duplicateCandidate} | = |`);
  lines.push('');

  if (prodAssets) {
    lines.push('## Prod asset-snapshot (read-only)');
    lines.push('');
    lines.push(`*Snapshot: ${prodAssets.snapshotDate} · root: \`${prodAssets.root}\`*`);
    lines.push('');
    lines.push('| Metric | Värde |');
    lines.push('|--------|------:|');
    lines.push(`| Assets totalt | ${prodAssets.assetTotal} |`);
    lines.push(`| LINK_ONLY_BLOCKER | ${prodAssets.linkOnlyBlocker ?? prodAssets.linkOnly ?? 0} |`);
    lines.push(`| NEEDS_REVIEW | ${prodAssets.needsReview} |`);
    lines.push(`| VISIBLE_ON_PATIENT_CARD | ${prodAssets.visibleOnCard} |`);
    lines.push(`| Foto-assets (kategori) | ${prodAssets.photos.total} |`);
    lines.push(`| Foto NEEDS_REVIEW (operator) | ${tracks.photo?.pendingPhotos ?? '—'} |`);
    lines.push(`| Patienter m. pending foto | ${tracks.photo?.patientsWithPendingPhotos ?? '—'} |`);
    lines.push('');
    lines.push(
      '> Jun-rapporter nämner ~5152 historiska **journal-entries** på prod — det ligger i journal-store, inte nödvändigtvis i denna asset-snapshot (1216 assets @ 2026-05-31).'
    );
    lines.push('');
  } else {
    lines.push('## Prod asset-snapshot');
    lines.push('');
    lines.push(
      '*Saknas lokalt — sätt `ARCANA_CCO_PROD_DATA_ROOT` eller synka iCloud `Migration-data/cco-prod`.*'
    );
    lines.push('');
  }

  lines.push(
    `## DoD #1–10 (repo \`data/\`) — ${statusEmoji(overall)} **${overall.toUpperCase()}**`
  );
  lines.push('');
  for (const d of dod) {
    lines.push(`### ${statusEmoji(d.status)} #${d.n} — ${d.text}`);
    lines.push('');
    lines.push('| Metric | Värde |');
    lines.push('|--------|------:|');
    for (const [k, v] of Object.entries(d.counts)) {
      lines.push(`| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |`);
    }
    if (d.blocker) lines.push(`> **Blocker:** ${d.blocker}`);
    lines.push('');
  }

  lines.push('## Parallellt spår: BOOKOFF 36 dokumenttyper');
  lines.push('');
  lines.push('| Kol | Status | Facit |');
  lines.push('|-----|--------|-------|');
  lines.push('| U | 36/36 | `docs/implementation/patient-documents-live/BOOKOFF-CHECKLIST.md` |');
  lines.push('| T | 36/36 (32 facit + 4 n/a) | `npm run verify:patient-doc-t-pass` |');
  lines.push('| D · L · V | 36/36 | full-page `/patient-doc/{registryId}` |');
  lines.push('| Sektion D workshop | SIGNED_OFF | 6/6 APPROVED |');
  lines.push('');

  lines.push('## Spår A–D — cutover-leverans');
  lines.push('');
  if (migrationTracks) {
    lines.push(
      `**${migrationTracks.overall} (${migrationTracks.tracksDelivered}/${migrationTracks.tracksTotal})** — ${migrationTracks.summary}`
    );
    lines.push('');
    lines.push('| Spår | Cutover | Status | Blocker | Nyckeltal |');
    lines.push('|------|---------|--------|---------|-----------|');
    for (const t of migrationTracks.tracks || []) {
      const m = t.metrics || {};
      let key = '—';
      if (t.id === 'A') key = `${m.withDriveFolderId ?? 0}/${m.totalPatients ?? '—'} driveFolderId`;
      if (t.id === 'B')
        key = `${m.withMeridiqPatientId ?? 0} id · ${m.meridiqEntriesImported ?? 0} import`;
      if (t.id === 'C') key = `${m.pendingPhotos ?? '—'} pending · ${m.photosVisible ?? 0} VISIBLE`;
      if (t.id === 'D') key = `${m.total ?? '—'} osäkra · ${m.resolved ?? 0} resolved`;
      lines.push(
        `| ${t.id} · ${t.label} | ${t.cutoverDelivered ? '✅' : '❌'} | ${t.status} | ${t.blocker?.code || '—'} | ${key} |`
      );
    }
    lines.push('');
    lines.push(`> ${migrationTracks.infraNote}`);
    lines.push('');
    lines.push(
      'Public JSON: `public/cco-migration-tracks-status.json` · UI: `/cco-ops-workbench.html#migration-hub`'
    );
    lines.push('');
  }

  lines.push('## Spår A–D — underlag (dry-run / operator-UI)');
  lines.push('');

  lines.push('### A · Drive service-account + master folder-ID');
  lines.push('');
  lines.push(
    `- Service-account env: **${tracks.saConfigured ? 'KONFIGURERAD' : 'SAKNAS'}** (ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON)`
  );
  if (tracks.driveDryRun) {
    lines.push(
      `- Dry-run coupling: **${tracks.driveDryRun.predicted}/${tracks.driveDryRun.totalPatients}** predicted (${tracks.driveDryRun.predictedPct}%) — proxy via meridiqMeta tills SA + crawl`
    );
  }
  lines.push(
    '- Nästa: owner levererar SA → `scripts/migration/scanGoogleDriveApi.js` → `backfill-master-card-drive-coupling.js` (commit)'
  );
  lines.push('');

  lines.push('### B · Meridiq bulk journal-import');
  lines.push('');
  if (tracks.meridiqDryRun) {
    lines.push(
      `- Dry-run: **${tracks.meridiqDryRun.eligible}** eligible → **${tracks.meridiqDryRun.entriesPlanned}** entries planned (mock×2/patient)`
    );
  }
  lines.push(
    '- Blocker: Meridiq read-only API-token (`--meridiq-api-token`) — se `MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md`'
  );
  lines.push('- Script: `node scripts/import-meridiq-historical-journals.js --dry-run`');
  lines.push('');

  lines.push('### C · Photo Review (migrerade bilder)');
  lines.push('');
  if (tracks.photo) {
    const writeLabel = tracks.photo.writeEnabled ? 'PÅ (canary)' : 'AV';
    lines.push(
      `- Pending foton: **${tracks.photo.pendingPhotos}** · patienter: **${tracks.photo.patientsWithPendingPhotos}** · write: **${writeLabel}**`
    );
    if (tracks.photo.canaryMaxDecisions) {
      lines.push(
        `- Canary: **${tracks.photo.canaryDecisionsUsed}/${tracks.photo.canaryMaxDecisions}** beslut · kvar **${tracks.photo.canaryDecisionsRemaining}**`
      );
    }
  }
  lines.push('- Operator: `/photo-review.html` (alias `/cco-photo-review.html`) · max 25/batch');
  lines.push('- Status: `node scripts/photo-review-batch-status.js`');
  lines.push('');

  lines.push('### D · Import review queue');
  lines.push('');
  lines.push(
    `- Totalt: **${tracks.importReview.total}** · status: \`${tracks.importReview.status}\``
  );
  for (const s of tracks.importReview.sources || []) {
    lines.push(`  - ${s.label}: **${s.queueCount}** pending`);
  }
  const importWrite = tracks.importReview.writeEnabled ? 'PÅ (canary)' : 'AV';
  lines.push(
    `- Write: **${importWrite}** · manuell batch max **${tracks.importReview.canaryMaxDecisions || 25}**/beslut`
  );
  lines.push('- Operator: `/cco-import-review.html` · ingen auto-merge · ingen ny kund');
  lines.push('- Status: `npm run import-review:batch-status`');
  lines.push('');

  lines.push('## Rekommenderad ordning');
  lines.push('');
  lines.push('1. **A** — Drive SA (owner) → folder crawl → master-kort #1');
  lines.push('2. **B** — Meridiq API → bulk journal #3');
  lines.push('3. **C** — Photo Review canaries → #4');
  lines.push('4. **D** — Import review (1497) i batchar → #2');
  lines.push('5. Kör om: `node scripts/generate-cutover-readiness-report.js` + denna rapport');
  lines.push('');

  lines.push('## Källor');
  lines.push('');
  lines.push('- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md`');
  lines.push('- `docs/strategy/CCO-JOURNALING-READINESS-2026-06-02.md`');
  lines.push('- `docs/strategy/CCO-DAILY-READINESS-2026-06-04.md`');
  lines.push('- `docs/implementation/patient-documents-live/BOOKOFF-CHECKLIST.md`');
  lines.push('- `scripts/generate-cutover-readiness-report.js`');
  lines.push('- `scripts/generate-journal-cutover-status-report.js`');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const repoDataRoot = path.join(ROOT, 'data');
  const repo = loadCutoverStats({ dataRoot: repoDataRoot, tenantId: 'hair_tp' });
  if (!repo.ok) {
    console.error('[status] repo data saknas:', repo.missing.join(', '));
    process.exit(1);
  }

  const prodRoot = defaultProdSnapshotRoot();
  let prodAssets = null;
  if (prodRoot) {
    const assets = countPatientAssets(prodRoot);
    const stat = fs.statSync(path.join(prodRoot, 'cco-patient-assets.json'));
    prodAssets = {
      root: prodRoot,
      snapshotDate: stat.mtime.toISOString().slice(0, 10),
      ...assets,
      photos: {
        total:
          (assets.byType?.photo_before || 0) +
          (assets.byType?.photo_during || 0) +
          (assets.byType?.photo_after || 0),
      },
    };
  }

  const dod = evaluateCriteria(repo.stats);
  const overall = overallStatus(dod);
  const tracks = renderTrackKickoff();
  const migrationTracks = buildMigrationTracksPayload();

  const md = renderMarkdown({
    date: args.date,
    repo,
    prodAssets,
    tracks,
    migrationTracks,
    dod,
    overall,
  });
  const violations = complianceCheck(md);
  if (violations.length > 0) {
    console.error('[status] COMPLIANCE VIOLATIONS — refuse to write');
    process.exit(4);
  }

  execSync(`node scripts/generate-cutover-readiness-report.js --date=${args.date}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (!args.stdout) {
    execSync('node scripts/migration-tracks-batch-status.js --write', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }

  if (args.stdout) {
    process.stdout.write(md + '\n');
  } else {
    const outPath = path.join(ROOT, 'docs', 'strategy', `JOURNAL-CUTOVER-STATUS-${args.date}.md`);
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`[status] wrote ${path.relative(ROOT, outPath)}`);
  }

  if (prodRoot && fs.existsSync(path.join(prodRoot, 'cco-customers.json'))) {
    execSync(
      `node scripts/generate-cutover-readiness-report.js --date=${args.date} --data-root=${JSON.stringify(prodRoot).slice(1, -1)} --label=prod-snapshot`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  } else if (prodRoot) {
    console.log(
      '[status] prod-snapshot saknar cco-customers.json — hybrid cutover-rapport hoppad (assets räknas i statusrapporten)'
    );
  }

  console.log(`[status] overall repo cutover: ${overall.toUpperCase()}`);
}

if (require.main === module) {
  main();
}

module.exports = { renderMarkdown, renderTrackKickoff, defaultProdSnapshotRoot };
