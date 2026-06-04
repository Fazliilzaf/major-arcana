'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { computeJournalPilotShiftStatus } = require('./ccoJournalPilotShiftStatus');

const OPS_STATUS = Object.freeze({
  GO: 'GO',
  WARNING: 'WARNING',
  STOP: 'STOP',
});

const SHIFT_V2_LABELS = Object.freeze({
  ready: 'Redo att börja',
  active: 'Pågår',
  warning: 'Varning',
  stopped: 'Stoppad',
});

function computeJournalPilotOpsStatus({
  journalLive = null,
  presentationGate = 'UNKNOWN',
  journalE2E = 'UNKNOWN',
  demoLinks = 'UNKNOWN',
  pilot1 = 'UNKNOWN',
  pilot2 = 'UNKNOWN',
  pilot3 = 'UNKNOWN',
} = {}) {
  const last = journalLive?.last24h || {};
  const errors = Number(last.errorsCount ?? 0);
  const route5xx = Number(journalLive?.route5xxCount ?? 0);
  const blocked = Number(last.blockedLockedEditAttempts ?? 0);
  const personalJa = journalLive?.personalCanContinueJournaling === 'JA';
  const pilotsFail =
    pilot1 === 'FAIL' || pilot2 === 'FAIL' || pilot3 === 'FAIL' || journalLive?.overall === 'FAIL';
  const feedFail = journalLive?.feedTimelineFormsHealth === 'FAIL';
  const mountsFail = journalLive?.journalMounts === 'FAIL';
  const gateFail = presentationGate === 'FAIL' || journalE2E === 'FAIL' || demoLinks === 'FAIL';

  const stopReasons = [];
  if (gateFail) stopReasons.push('Presentation-gate eller demo/E2E ej PASS');
  if (mountsFail) stopReasons.push('Journal mounts FAIL');
  if (route5xx > 0) stopReasons.push(`Journal routes 5xx: ${route5xx}`);
  if (pilotsFail) stopReasons.push('Minst en pilotkund eller feed/timeline FAIL');
  if (feedFail) stopReasons.push('Feed/timeline/forms health FAIL');
  if (errors > 0) stopReasons.push(`Journal errors 24h: ${errors}`);
  if (!personalJa && journalLive) stopReasons.push('Personal kan inte fortsätta (NEJ)');

  let opsStatus = OPS_STATUS.GO;
  let opsReason = 'Journalföring kan fortsätta enligt live monitor.';

  if (stopReasons.length > 0) {
    opsStatus = OPS_STATUS.STOP;
    opsReason = stopReasons[0];
  } else if (!journalLive?.authAvailable || blocked > 0) {
    opsStatus = OPS_STATUS.WARNING;
    opsReason = !journalLive?.authAvailable
      ? 'Audit/token saknas — 24h-räknare kan vara ofullständiga.'
      : `Blocked locked-edit-försök: ${blocked} — verifiera identitet före signering.`;
  }

  const legacyShift = computeJournalPilotShiftStatus({
    presentationGate,
    journalE2E,
    demoLinks,
    pilot1,
    pilot2,
    pilot3,
    journalLive,
  });

  let shiftStatus = 'ready';
  if (opsStatus === OPS_STATUS.STOP) shiftStatus = 'stopped';
  else if (opsStatus === OPS_STATUS.WARNING) shiftStatus = 'warning';
  else if (legacyShift.shiftStatus === 'pagar') shiftStatus = 'active';
  else if (legacyShift.shiftStatus === 'fel_upptackt' || legacyShift.shiftStatus === 'pausad')
    shiftStatus = 'stopped';
  else shiftStatus = 'ready';

  return {
    opsStatus,
    opsStatusLabel: opsStatus,
    opsReason,
    stopReasons,
    personalCanContinueJournaling: journalLive?.personalCanContinueJournaling || 'NEJ',
    feedTimelineFormsHealth: journalLive?.feedTimelineFormsHealth || 'UNKNOWN',
    routeHealth: journalLive?.routeHealth || [],
    routeHealthPass: journalLive?.routeHealthPass || 'UNKNOWN',
    route5xxCount: route5xx,
    route4xxCount: journalLive?.route4xxCount ?? 0,
    pilot1: pilot1 || journalLive?.pilot1,
    pilot2: pilot2 || journalLive?.pilot2,
    pilot3: pilot3 || journalLive?.pilot3,
    pilots: journalLive?.pilots || [],
    last24h: {
      journalEntriesActivity: last.journalEntriesActivity ?? 0,
      journalWrites24h: last.journalWrites ?? last.journalEntriesActivity ?? 0,
      signed24h: last.signedCount ?? 0,
      corrections24h: last.correctionsCount ?? 0,
      errors24h: errors,
      blockedLockedEditAttempts: blocked,
      lastSuccessfulWriteAt: last.lastSuccessfulJournalWriteAt ?? null,
      lastFailedWriteAt: last.lastFailedJournalWriteAt ?? null,
      lastJournalActivityAt:
        last.lastSuccessfulJournalWriteAt || last.lastFailedJournalWriteAt || null,
    },
    legacyShift,
    shiftStatus,
    shiftStatusLabel: SHIFT_V2_LABELS[shiftStatus] || shiftStatus,
    shiftReason: legacyShift.reason,
  };
}

function buildEscalationQueue(journalLive = null) {
  const items = [];
  const last = journalLive?.last24h || {};
  const now = new Date().toISOString();

  if (Number(last.blockedLockedEditAttempts) > 0) {
    items.push({
      id: `esc-locked-${now}`,
      category: 'osaker_identitet',
      title: 'Försök att ändra låst journalpost',
      count24h: last.blockedLockedEditAttempts,
      severity: 'warning',
      assignee: 'Personal (pre-sign check) + Fazli vid upprepning',
      action: 'Kör pre-signering-check · verifiera patient före signering',
    });
  }

  if (Number(last.errorsCount) > 0) {
    items.push({
      id: `esc-journal-err-${now}`,
      category: 'journalfel',
      title: 'Journal write/sign/correction fel',
      count24h: last.errorsCount,
      severity: 'critical',
      assignee: 'Fazli',
      action: 'Stoppa journalföring · kör presentation-gate · P0-fix',
    });
  }

  if (Number(last.correctionsCount) > 0 && Number(last.errorsCount) > 0) {
    items.push({
      id: `esc-correction-${now}`,
      category: 'rattelsefraga',
      title: 'Rättelse med fel i samma fönster',
      count24h: last.correctionsCount,
      severity: 'warning',
      assignee: 'Fazli + senior personal',
      action: 'Granska rättelseflöde på pilotkund innan bred användning',
    });
  }

  const route5xx = (journalLive?.routeHealth || []).filter((r) => r.is5xx || r.status >= 500);
  for (const r of route5xx) {
    items.push({
      id: `esc-route-${r.name}`,
      category: 'systemhang_502',
      title: `Journal route ${r.name} returnerar ${r.status}`,
      count24h: 1,
      severity: 'critical',
      assignee: 'Fazli',
      action: 'P0 — route ska inte ge 5xx i demo',
    });
  }

  if (journalLive?.overall === 'FAIL' && !route5xx.length) {
    items.push({
      id: `esc-live-fail-${now}`,
      category: 'systemhang_502',
      title: 'Journal live monitor FAIL',
      severity: 'critical',
      assignee: 'Fazli',
      action: 'Kontrollera pilot feed/timeline/forms',
    });
  }

  const pilotsBad = (journalLive?.pilots || []).filter((p) => p.overall === 'FAIL');
  for (const p of pilotsBad) {
    items.push({
      id: `esc-pilot-${p.slot}`,
      category: 'journalfel',
      title: `Pilotkund ${p.slot} feed/timeline/forms ej OK`,
      severity: 'critical',
      assignee: 'Fazli',
      action: 'Fixa pilotkund före personal fortsätter',
    });
  }

  return {
    generatedAt: now,
    registered: items.length,
    empty: items.length === 0,
    emptyMessage: items.length === 0 ? 'Inga eskaleringar registrerade' : null,
    items,
    note: 'Read-only — härledd från audit/routes senaste 24h, inga mock-rader',
  };
}

function buildRecommendedActionFromOps(ops, { retryable = false } = {}) {
  if (ops.opsStatus === OPS_STATUS.STOP) {
    return retryable ? 'WAIT_AND_RETRY' : 'P0_FIX_REQUIRED';
  }
  if (ops.opsStatus === OPS_STATUS.WARNING) {
    return ops.personalCanContinueJournaling === 'JA' ? 'GO' : 'WAIT_AND_RETRY';
  }
  if (ops.shiftStatus === 'active' || ops.shiftStatus === 'ready') {
    return 'GO';
  }
  return 'GO';
}

function buildJournalPilotShiftPayload(ctx) {
  const ops = computeJournalPilotOpsStatus(ctx);
  const escalations = buildEscalationQueue(ctx.journalLive);
  const recommendedAction = buildRecommendedActionFromOps(ops, {
    retryable: ctx.retryable,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'JOURNAL_PILOT_OPERATIONS',
    shiftStatus: ops.shiftStatus,
    shiftStatusLabel: ops.shiftStatusLabel,
    journalPilotOpsStatus: ops.opsStatus,
    journalPilotOpsReason: ops.opsReason,
    journalWrites24h: ops.last24h.journalWrites24h,
    signed24h: ops.last24h.signed24h,
    corrections24h: ops.last24h.corrections24h,
    errors24h: ops.last24h.errors24h,
    lastSuccessfulWriteAt: ops.last24h.lastSuccessfulWriteAt,
    lastFailedWriteAt: ops.last24h.lastFailedWriteAt,
    lastJournalActivityAt: ops.last24h.lastJournalActivityAt,
    personalCanContinueJournaling: ops.personalCanContinueJournaling,
    feedTimelineFormsHealth: ops.feedTimelineFormsHealth,
    routeHealthPass: ops.routeHealthPass,
    route5xxCount: ops.route5xxCount,
    pilot1: ops.pilot1,
    pilot2: ops.pilot2,
    pilot3: ops.pilot3,
    recommendedAction,
    stopConditions: [
      'journal create/sign/correction fail',
      'feed/timeline fail',
      '5xx på journalroutes',
      'pilotkund fail',
      'Drive-länk i UI',
      'patientdata i GitHub',
      'customerId mismatch',
      'ny kund vid osäker match',
    ],
    journalPilotOps: ops,
    escalationQueue: escalations,
    links: {
      welcomeCco: '/cco-demo.html',
      personalStart: '/cco-demo.html',
      legacyPersonalStart: '/cco-personal-start.html',
      kundkort: '/kunder.html',
      journalGuide: '/journal-pilot-guide.html',
      staffTraining: '/cco-staff-training-mode.html',
      journalFaq: '/cco-journalpilot-faq.html',
      opsWorkbench: '/cco-ops-workbench.html',
      commandCenter: '/cco-4june-command-center.html',
      goLiveSupport: '/cco-journalpilot-go-live.html',
      preSignCheck: '/cco-pre-signering-check.html',
      signoffSheet: '/journal-pilot-signoff-sheet.html',
    },
  };
}

function publishJournalPilotShiftStatus(payload, repo) {
  const publicPath = path.join(repo, 'public/cco-journalpilot-shift-status.json');
  const reportPath = path.join(repo, 'data/reports/cco-journalpilot-shift-status.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(publicPath, json);
  fs.writeFileSync(reportPath, json);
  return { publicPath, reportPath };
}

module.exports = {
  OPS_STATUS,
  computeJournalPilotOpsStatus,
  buildEscalationQueue,
  buildJournalPilotShiftPayload,
  buildRecommendedActionFromOps,
  publishJournalPilotShiftStatus,
};
