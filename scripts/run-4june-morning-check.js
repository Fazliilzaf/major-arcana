#!/usr/bin/env node
'use strict';

/**
 * run-4june-morning-check.js — 4 juni Command Status (morgon)
 *
 * Kör presentation-kritiska checks + läser daily readiness snapshot.
 * Skriver:
 *   data/reports/cco-4june-morning-check.json
 *   public/cco-4june-morning-check.json
 *
 *   node scripts/run-4june-morning-check.js
 *   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com node scripts/run-4june-morning-check.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const BACKUP_BASE =
  process.env.CCO_PERSONAL_DEMO_BACKUP_BASE || 'https://major-arcana-frankfurt.onrender.com';
const REPORT_PATH = path.join(REPO, 'data/reports/cco-4june-morning-check.json');
const PUBLIC_PATH = path.join(REPO, 'public/cco-4june-morning-check.json');
const READINESS_RUN = path.join(REPO, 'data/reports/cco-personal-demo-readiness-run.json');
const OPS_STATUS = path.join(REPO, 'public/cco-presentation-ops-status.json');
const MANIFEST_PATH = path.join(REPO, 'public/cco-personal-demo-manifest.json');

const PRESENTATION_LINKS = {
  personalStart: '/cco-personal-start.html',
  presenterMode: '/personal-demo.html',
  printPack: '/journal-pilot-guide.html',
  journalGuide: '/journal-pilot-guide.html',
  kundkort: '/kunder.html',
  opsWorkbench: '/cco-ops-workbench.html',
};

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

function statusFromOk(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function loadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pilotResultsFromRun(runJson) {
  const pilots = runJson?.e2eByPilot || [];
  return {
    pilot1: pilots[0]?.result || 'UNKNOWN',
    pilot2: pilots[1]?.result || 'UNKNOWN',
    pilot3: pilots[2]?.result || 'UNKNOWN',
  };
}

function buildPilotLinks(manifest) {
  const pilots = manifest?.pilotCustomers || [];
  return pilots.map((p) => ({
    slot: p.slot,
    label: p.redactedLabel || `Pilot ${p.slot}`,
    path:
      p.openRoute ||
      `/journal-feed-demo.html?customerId=${p.customerId}&tenant=hairtpclinic&role=operator`,
    customerId: p.customerId,
  }));
}

function dailyReadinessSnapshot(ops) {
  if (!ops) return null;
  return {
    generatedAt: ops.generatedAt || null,
    journalPilot: ops.journalPilot?.overall || ops.dailyReadiness?.journalPilot || null,
    mail: ops.mailAmbiguous?.operational || ops.dailyReadiness?.mail || null,
    mailRemaining: ops.mailAmbiguous?.remaining ?? null,
    photoPending: ops.photoReview?.pendingPhotos ?? ops.dailyReadiness?.photoPending ?? null,
    photoVisible: ops.photoReview?.photosVisibleCount ?? null,
    driveRule: ops.dailyReadiness?.driveRule || ops.historik?.drivePhotos || null,
    importReviewQueue: ops.importReviewQueue?.total ?? null,
  };
}

function buildBlockers(payload) {
  const blockers = [];
  if (payload.presentationGate === 'FAIL') {
    blockers.push('Presentation gate FAIL — journaldemo ej säker för 4 juni');
  }
  if (payload.demoLinks === 'FAIL') blockers.push('Demo-länkar FAIL på personal-start');
  if (payload.journalE2E === 'FAIL') blockers.push('Journal E2E FAIL');
  if (payload.pilot1 === 'FAIL' || payload.pilot2 === 'FAIL' || payload.pilot3 === 'FAIL') {
    blockers.push('Minst en pilotkund FAIL (feed/timeline/E2E)');
  }
  const snap = payload.dailyReadinessSnapshot;
  if (snap?.mailRemaining > 0) {
    blockers.push(`Mail ambiguous ~${snap.mailRemaining} kvar (manuellt, ej demo-P0)`);
  }
  if (snap?.photoPending > 0) {
    blockers.push(`Photo Review ~${snap.photoPending} pending · 0 VISIBLE före review`);
  }
  if (snap?.importReviewQueue > 0) {
    blockers.push(`Import review queue ${snap.importReviewQueue} osäkra kundmatchningar`);
  }
  if (!blockers.length) {
    blockers.push('Inga presentation-P0 blockers — fortsätt kontrollerad pilot');
  }
  return blockers;
}

function recommendedAction(payload, retryable) {
  if (payload.presentationGate === 'FAIL') {
    if (retryable) return 'WAIT_AND_RETRY';
    return 'P0_FIX_REQUIRED';
  }
  if (
    payload.demoLinks === 'FAIL' ||
    payload.journalE2E === 'FAIL' ||
    payload.pilot1 === 'FAIL' ||
    payload.pilot2 === 'FAIL' ||
    payload.pilot3 === 'FAIL'
  ) {
    return retryable ? 'WAIT_AND_RETRY' : 'P0_FIX_REQUIRED';
  }
  return 'GO';
}

function absUrl(base, route) {
  if (!route) return base;
  if (/^https?:\/\//i.test(route)) return route;
  return `${base.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const skipProbes = process.argv.includes('--snapshot-only');

  console.log('=== 4 juni Morning Check ===');
  console.log('Base:', BASE);
  console.log('');

  let mounts = { ok: true, output: '' };
  let links = { ok: true, output: '' };
  let readiness = { ok: true, output: '' };
  let journalMounts = 'UNKNOWN';
  let demoLinks = 'UNKNOWN';
  let journalE2E = 'UNKNOWN';

  if (!skipProbes) {
    console.log('[1/3] Journal mounts…');
    mounts = run('node scripts/verify-journal-pilot-routes.js');
    journalMounts = statusFromOk(mounts.ok);
    console.log(journalMounts);
    console.log('');

    console.log('[2/3] Demo links…');
    links = run(`CCO_PERSONAL_DEMO_BASE=${BASE} node scripts/verify-personal-demo-links.js`);
    demoLinks = statusFromOk(links.ok);
    console.log(demoLinks);
    console.log('');

    console.log('[3/3] Personal demo readiness (E2E)…');
    readiness = run(`CCO_PERSONAL_DEMO_BASE=${BASE} node scripts/run-personal-demo-readiness.js`);
    journalE2E = statusFromOk(readiness.ok);
    console.log(journalE2E);
    console.log('');
  }

  const runJson = loadJson(READINESS_RUN);
  let { pilot1, pilot2, pilot3 } = pilotResultsFromRun(runJson);
  const manifest =
    loadJson(MANIFEST_PATH) ||
    loadJson(path.join(REPO, 'data/reports/cco-personal-demo-manifest.json'));
  const ops = loadJson(OPS_STATUS);

  if (skipProbes && ops?.journalPilot) {
    const jp = ops.journalPilot;
    journalMounts = jp.journalMounts || journalMounts;
    demoLinks = jp.demoLinks || demoLinks;
    journalE2E = jp.e2eJournal || journalE2E;
    pilot1 = jp.pilot1 || pilot1;
    pilot2 = jp.pilot2 || pilot2;
    pilot3 = jp.pilot3 || pilot3;
  }
  const presentationGate =
    journalMounts === 'PASS' &&
    demoLinks === 'PASS' &&
    journalE2E === 'PASS' &&
    pilot1 === 'PASS' &&
    pilot2 === 'PASS' &&
    pilot3 === 'PASS'
      ? 'PASS'
      : 'FAIL';

  const combinedOutput = [mounts.output, links.output, readiness.output].join('\n');
  const retryable = /timeout|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(combinedOutput);

  const payload = {
    generatedAt,
    title: '4 juni Command Status',
    prodUrl: absUrl(BASE, PRESENTATION_LINKS.personalStart),
    backupUrl: absUrl(BACKUP_BASE, PRESENTATION_LINKS.personalStart),
    presentationGate,
    journalMounts,
    demoLinks,
    journalE2E,
    pilot1,
    pilot2,
    pilot3,
    links: {
      ...PRESENTATION_LINKS,
      prodPersonalStart: absUrl(BASE, PRESENTATION_LINKS.personalStart),
      backupPersonalStart: absUrl(BACKUP_BASE, PRESENTATION_LINKS.personalStart),
      pilots: buildPilotLinks(manifest),
    },
    dailyReadinessSnapshot: dailyReadinessSnapshot(ops),
    blockers: [],
    recommendedAction: 'GO',
    checksRun: !skipProbes,
    base: BASE,
    backupBase: BACKUP_BASE,
  };

  payload.blockers = buildBlockers(payload);
  payload.recommendedAction = recommendedAction(payload, retryable);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(payload, null, 2));
  fs.writeFileSync(PUBLIC_PATH, JSON.stringify(payload, null, 2));

  console.log('Presentation gate:', payload.presentationGate);
  console.log('Demo links:', payload.demoLinks);
  console.log('Journal E2E:', payload.journalE2E);
  console.log('Pilots:', payload.pilot1, payload.pilot2, payload.pilot3);
  console.log('Recommended:', payload.recommendedAction);
  console.log('');
  console.log('Wrote:', REPORT_PATH);
  console.log('Wrote:', PUBLIC_PATH);

  process.exit(payload.presentationGate === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
