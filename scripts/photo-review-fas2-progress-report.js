#!/usr/bin/env node
'use strict';

/**
 * Photo Review Fas 2 — progress / milestone / final report
 *
 * Usage:
 *   node scripts/photo-review-fas2-progress-report.js
 *   node scripts/photo-review-fas2-progress-report.js --final
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DATE = '2026-05-30';
const OUT_MD = path.join(
  REPO_ROOT,
  `docs/strategy/P0-PHOTO-REVIEW-FAS2-FULL-MANUAL-REVIEW${isFinalArg() ? '-FINAL' : ''}-${DATE}.md`
);
const OUT_JSON = OUT_MD.replace(/\.md$/, '.json');

function isFinalArg() {
  return process.argv.includes('--final');
}

const { isPhotoReviewAsset } = require('../src/routes/ccoPhotoReview');
const { aggregateDecisionStats } = require('../src/ops/ccoPhotoReviewPilot');

function prodDataRoot() {
  return (
    process.env.ARCANA_CCO_PROD_DATA_ROOT ||
    path.join(
      os.homedir(),
      'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/cco-prod'
    )
  );
}

function loadAuditLog() {
  const stateRoot = process.env.ARCANA_STATE_ROOT || path.join(REPO_ROOT, 'data');
  const candidates = [
    path.join(stateRoot, 'cco-audit.jsonl'),
    path.join(stateRoot, 'audit.jsonl'),
    path.join(REPO_ROOT, 'data/cco-audit.jsonl'),
  ];
  const entries = [];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
    break;
  }
  return {
    query({ action, limit = 100000 } = {}) {
      let list = entries;
      if (action) list = list.filter((e) => e.action === action);
      return list.slice(-limit);
    },
    items: entries,
  };
}

function main() {
  const isFinal = process.argv.includes('--final');
  const assetsPath = path.join(prodDataRoot(), 'cco-patient-assets.json');
  if (!fs.existsSync(assetsPath)) {
    console.error('FEL: prod assets saknas');
    process.exit(2);
  }

  const items = JSON.parse(fs.readFileSync(assetsPath, 'utf8')).items || {};
  const all = Object.values(items);
  const pending = all.filter(isPhotoReviewAsset);
  const visiblePhotos = all.filter(
    (a) =>
      ['photo_before', 'photo_during', 'photo_after'].includes(a.category) &&
      a.status === 'VISIBLE_ON_PATIENT_CARD'
  );

  const auditLog = loadAuditLog();
  const decisions = aggregateDecisionStats(auditLog);
  const milestones = [];
  const decisionEntries = auditLog.query({ action: 'photo_review.decision' }) || [];
  for (let i = 100; i <= decisions.total; i += 100) {
    const slice = decisionEntries.slice(0, i);
    const by = { approve: 0, reject: 0, reassign: 0 };
    for (const e of slice) {
      const d = e.detail?.decision;
      if (d === 'approve') by.approve += 1;
      else if (d === 'reject') by.reject += 1;
      else if (d === 'reassign') by.reassign += 1;
    }
    milestones.push({ at: i, ...by, cumulative: i });
  }

  let missingStorage = 0;
  let missingChecksum = 0;
  for (const a of pending) {
    if (!a.storageKey || a.storageKey === 'pending-no-binary') missingStorage += 1;
    if (!a.checksum) missingChecksum += 1;
  }

  const queueComplete = pending.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    phase: queueComplete
      ? 'fas2_full_manual_review_complete'
      : 'fas2_full_manual_review_in_progress',
    isFinal,
    queueComplete,
    baseline: {
      pendingPhotos: pending.length,
      patients: new Set(pending.map((a) => a.patientId)).size,
    },
    visiblePhotos: visiblePhotos.length,
    decisions,
    milestones,
    storage: { missingStorageKey: missingStorage, missingChecksum: missingChecksum },
    auditEntries: decisionEntries.length,
    errors: [],
  };

  if (missingStorage || missingChecksum) {
    report.errors.push(
      `pending_with_storage_gaps: storage=${missingStorage} checksum=${missingChecksum}`
    );
  }

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  let md = '# P0 Photo Review Fas 2 — Full Manual Review (High-Confidence Cohort)\n\n';
  md += `*Genererad: ${report.generatedAt}*\n\n`;

  md += '## Status\n\n';
  md += `- **GO:** Full manuell Photo Review Fas 2 (150 patienter / 861 bilder)\n`;
  md += `- **Kö genomförd:** ${queueComplete ? '✓ JA' : '⏳ Pågår'}\n`;
  md += `- **Mass-approval:** STOPP\n`;
  md += `- **AI autoapproval:** STOPP\n`;
  md += `- **Medium/low-import:** STOPP\n`;
  md += `- **Full prod-import:** STOPP (separat beslut)\n`;
  md += `- **Drive-länkar:** STOPP\n`;
  md += `- **Patientdata i GitHub:** STOPP\n\n`;

  md += '## Regler (Fas 2 full manual)\n\n';
  md += '1. `ENABLE_PHOTO_REVIEW_WRITE=true` endast för Photo Review Fas 2\n';
  md += '2. Hela high-confidence-kön — inte pilot-cap (5 patienter / 20 beslut)\n';
  md += '3. Single-asset: approve · reject · reassign category\n';
  md += '4. Varje beslut auditloggas (`photo_review.decision` + reason)\n';
  md += '5. Reason krävs (min 3 tecken)\n\n';

  md += '## STOPP-villkor\n\n';
  md += 'Avbryt omedelbart om:\n';
  md += '- audit misslyckas\n';
  md += '- storageKey/checksum saknas vid approve\n';
  md += '- patientId saknas\n';
  md += '- bild saknar preview/storage\n';
  md += '- Drive-länk dyker upp\n';
  md += '- bulk/massapproval triggas\n';
  md += '- patientdata riskerar GitHub\n\n';

  md += '## Rapportering (var 100:e beslut)\n\n';
  md += '| Metric | Beskrivning |\n|---|---|\n';
  md += '| Granskade | Totalt antal beslut (audit) |\n';
  md += '| Approved | Godkända → VISIBLE_ON_PATIENT_CARD |\n';
  md += '| Rejected | Avvisade |\n';
  md += '| Reassigned | Omkategoriserade (NEEDS_REVIEW kvar om ej alsoApprove) |\n';
  md += '| NEEDS_REVIEW kvar | Kvar i kö |\n';
  md += '| VISIBLE | Foto synliga efter review |\n';
  md += '| Audit status | Antal `photo_review.decision`-rader |\n\n';
  md += 'Milestone i browser: `window.__ARCANA_PHOTO_REVIEW_MILESTONES__`\n\n';

  md += '## Aktivering\n\n';
  md += '```bash\n';
  md += 'ENABLE_PHOTO_REVIEW_WRITE=true\n';
  md += 'PHOTO_REVIEW_FULL_COHORT=true\n';
  md += '# Staging/dev — prod primary hosts blockeras automatiskt\n';
  md += '```\n\n';
  md += 'UI: `/photo-review.html`\n\n';

  md += '## Progress\n\n';
  md += '| Metric | Värde |\n|---|--:|\n';
  md += `| NEEDS_REVIEW kvar | ${report.baseline.pendingPhotos} |\n`;
  md += `| Patienter kvar | ${report.baseline.patients} |\n`;
  md += `| Beslut totalt (audit) | ${decisions.total} |\n`;
  md += `| Approved | ${decisions.approve} |\n`;
  md += `| Rejected | ${decisions.reject} |\n`;
  md += `| Reassigned | ${decisions.reassign} |\n`;
  md += `| VISIBLE photos (prod) | ${report.visiblePhotos} |\n\n`;

  if (milestones.length) {
    md += '## Milestones (per 100 beslut)\n\n';
    md += '| Beslut # | Approved | Rejected | Reassigned |\n|---:|---:|---:|---:|\n';
    for (const m of milestones) {
      md += `| ${m.at} | ${m.approve} | ${m.reject} | ${m.reassign} |\n`;
    }
    md += '\n';
  }

  md += '## Storage / audit\n\n';
  md += `| Check | Status |\n|---|---|\n`;
  md += `| Pending utan storageKey | ${missingStorage} |\n`;
  md += `| Pending utan checksum | ${missingChecksum} |\n`;
  md += `| Audit-rader photo_review.decision | ${report.auditEntries} |\n\n`;

  md += '## UI\n\n';
  md += '- Fokusvy: en bild i taget\n';
  md += '- Snabb-godkänn: Före [1] / Under [2] / Efter [3]\n';
  md += '- Avvisa [R] · Omkategori [C] · Navigera [N/P] eller pilar\n';
  md += '- Progress-bar + milestone-log i `window.__ARCANA_PHOTO_REVIEW_MILESTONES__`\n';
  md += '- Kör `node scripts/photo-review-fas2-progress-report.js --final` när kön är tom\n\n';

  md += '## Rekommendation\n\n';
  if (queueComplete) {
    md +=
      '**Klar** — hela high-confidence photo-review-kön är genomgången. Verifiera VISIBLE på patientkort innan medium/low-scope diskuteras separat.\n';
  } else if (decisions.total > 0) {
    md += `**Pågår** — ${report.baseline.pendingPhotos} bilder kvar. Fortsätt manuell review tills NEEDS_REVIEW=0.\n`;
  } else {
    md +=
      '**Startad** — aktivera write i staging/dev och börja granska via `/photo-review.html`.\n';
  }

  fs.writeFileSync(OUT_MD, md, 'utf8');
  console.log(JSON.stringify({ ok: true, report, out: OUT_MD }, null, 2));
}

main();
