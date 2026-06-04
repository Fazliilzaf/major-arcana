'use strict';

const { computeJournalPilotShiftStatus } = require('./ccoJournalPilotShiftStatus');

const PRIMARY_WELCOME = '/cco-demo.html';

const DAY1_LINKS = Object.freeze({
  welcomeCco: PRIMARY_WELCOME,
  personalStart: PRIMARY_WELCOME,
  legacyPersonalStart: '/cco-personal-start.html',
  kundkort: '/kunder.html',
  journalGuide: '/journal-pilot-guide.html',
  staffTraining: '/cco-staff-training-mode.html',
  journalFaq: '/cco-journalpilot-faq.html',
  goLiveSupport: '/cco-journalpilot-go-live.html',
  signoffSheet: '/journal-pilot-signoff-sheet.html',
  preSignCheck: '/cco-pre-signering-check.html',
  reviewMaterialWarning: '/cco-review-material-warning.html',
  staffDay1Checklist: '/cco-staff-day1-checklist.html',
  opsWorkbench: '/cco-ops-workbench.html',
});

function buildRecommendedNextAction({
  presentationGate,
  journalE2E,
  demoLinks,
  pilot1,
  pilot2,
  pilot3,
  journalLive,
  shift,
  retryable = false,
}) {
  if (presentationGate === 'FAIL') {
    return retryable ? 'WAIT_AND_RETRY' : 'P0_FIX_REQUIRED';
  }
  if (
    journalLive?.overall === 'FAIL' ||
    journalLive?.personalCanContinueJournaling === 'NEJ' ||
    shift?.shiftStatus === 'fel_upptackt' ||
    shift?.shiftStatus === 'pausad'
  ) {
    return retryable ? 'WAIT_AND_RETRY' : 'P0_FIX_REQUIRED';
  }
  if (
    demoLinks === 'FAIL' ||
    journalE2E === 'FAIL' ||
    pilot1 === 'FAIL' ||
    pilot2 === 'FAIL' ||
    pilot3 === 'FAIL'
  ) {
    return retryable ? 'WAIT_AND_RETRY' : 'P0_FIX_REQUIRED';
  }
  if (shift?.shiftStatus === 'redo_att_borja') {
    return 'GO';
  }
  if (shift?.shiftStatus === 'pagar') {
    return 'GO';
  }
  return 'GO';
}

function buildDay1Blockers({
  presentationGate,
  journalE2E,
  pilot1,
  pilot2,
  pilot3,
  journalLive,
  mailReview,
  photoReview,
  importReview,
}) {
  const blockers = [];
  if (presentationGate === 'FAIL') {
    blockers.push('P0: Presentation gate FAIL — journaldemo ej säker');
  }
  if (journalE2E === 'FAIL') blockers.push('P0: Journal E2E FAIL');
  if (pilot1 === 'FAIL' || pilot2 === 'FAIL' || pilot3 === 'FAIL') {
    blockers.push('P0: Minst en pilotkund FAIL');
  }
  if (journalLive?.overall === 'FAIL') {
    blockers.push('P0: Journal Pilot Live Monitor FAIL');
  }
  if (journalLive?.personalCanContinueJournaling === 'NEJ') {
    blockers.push('P0: Personal bör inte journalföra (live monitor NEJ)');
  }
  const err = journalLive?.last24h?.errorsCount ?? 0;
  if (err > 0) blockers.push(`P0: Journal errors senaste 24h: ${err}`);
  if ((journalLive?.route5xxCount ?? 0) > 0) {
    blockers.push(`P0: Journal route 5xx: ${journalLive.route5xxCount}`);
  }
  if (mailReview?.remaining > 0) {
    blockers.push(
      `Mail: ${mailReview.remaining} ambiguous kvar — operatörsverktyg, ej dagligt mail ännu`
    );
  }
  if (photoReview?.pendingPhotos > 0) {
    blockers.push(
      `Photo: ${photoReview.pendingPhotos} pending · ${photoReview.patientsWithPendingPhotos ?? '—'} kunder · 0 VISIBLE`
    );
  }
  if (importReview?.total > 0) {
    blockers.push(`Import: ${importReview.total} osäkra matchningar — manuell review`);
  }
  if (!blockers.length) {
    blockers.push('Inga P0 blockers — Dag-1 journalföring kan fortsätta kontrollerat');
  }
  return blockers.slice(0, 8);
}

function buildDay1JournalPilot({
  journalPilot,
  journalLive,
  presentationGate,
  retryable: _retryable = false,
}) {
  const jp = journalPilot || {};
  const gate = presentationGate ?? jp.presentationGate ?? 'UNKNOWN';
  const shift = computeJournalPilotShiftStatus({
    presentationGate: gate,
    journalE2E: jp.e2eJournal,
    demoLinks: jp.demoLinks,
    pilot1: jp.pilot1 ?? journalLive?.pilot1,
    pilot2: jp.pilot2 ?? journalLive?.pilot2,
    pilot3: jp.pilot3 ?? journalLive?.pilot3,
    journalLive,
  });
  const last = journalLive?.last24h || {};

  return {
    overall: gate === 'PASS' && journalLive?.overall === 'PASS' ? 'PASS' : 'CHECK',
    presentationGate: gate,
    journalMounts: jp.journalMounts,
    demoLinks: jp.demoLinks,
    journalE2E: jp.e2eJournal,
    pilot1: jp.pilot1 ?? journalLive?.pilot1,
    pilot2: jp.pilot2 ?? journalLive?.pilot2,
    pilot3: jp.pilot3 ?? journalLive?.pilot3,
    personalCanContinueJournaling: journalLive?.personalCanContinueJournaling || 'NEJ',
    journalLiveOverall: journalLive?.overall,
    last24h: {
      journalEntriesActivity: last.journalEntriesActivity ?? 0,
      signedCount: last.signedCount ?? 0,
      correctionsCount: last.correctionsCount ?? 0,
      errorsCount: last.errorsCount ?? 0,
      blockedLockedEditAttempts: last.blockedLockedEditAttempts ?? 0,
      auditEventsCount: last.auditEventsCount ?? 0,
      lastSuccessfulJournalWriteAt: last.lastSuccessfulJournalWriteAt ?? null,
      lastFailedJournalWriteAt: last.lastFailedJournalWriteAt ?? null,
    },
    route5xxCount: journalLive?.route5xxCount ?? 0,
    routeHealthPass: journalLive?.routeHealthPass,
    shiftStatus: shift.shiftStatus,
    shiftStatusLabel: shift.shiftStatusLabel,
    shiftReason: shift.reason,
    shiftStates: shift.allShiftStates,
    links: { ...DAY1_LINKS },
    fazliPresentationFlow:
      'Välkommen till CCO → Kunder → Pilotkund → Journal → Signera → Rättelse → Timeline',
    recommendedWork:
      shift.shiftStatus === 'redo_att_borja'
        ? 'Öppna Välkommen till CCO (/cco-demo.html) → Kunder → pilotkund → journal'
        : shift.shiftStatus === 'pagar'
          ? 'Fortsätt journalföra · följ live monitor · pre-sign check före signering'
          : 'Stoppa och kör presentation-gate',
  };
}

function buildPhotoReviewDay1(photo, photoOperator) {
  const op = photoOperator || {};
  const pending = op.pendingPhotos ?? photo?.pendingPhotos ?? 0;
  const writeOn = (op.writeEnabled ?? photo?.writeEnabled) === true;
  return {
    overall: op.overall || 'READY',
    pendingPhotos: pending,
    patientsWithPendingPhotos: op.patientsWithPendingPhotos ?? photo?.patientsWithPendingPhotos,
    photosVisibleCount: op.photosVisibleCount ?? photo?.photosVisibleCount ?? 0,
    writeEnabled: writeOn,
    readOnly: !writeOn,
    autoApprove: false,
    massApproval: false,
    approveButtonsWhenWriteOff: false,
    operatorToolPath: '/photo-review.html',
    recommendedWork:
      'Starta manuell Photo Review när personal är tränad — write AV på prod · inga approve-knappar',
    statusNote: writeOn
      ? 'Write PÅ — ett beslut per bild · reviewer krävs'
      : 'Write AV — read-only navigering · 0 VISIBLE tills granskat',
  };
}

function buildMailReviewDay1(mail, mailOperator) {
  const mo = mailOperator || {};
  const m = mail?.progress || mail || {};
  return {
    overall: mo.overall || mail?.operational || 'QUEUE_ACTIVE',
    ambiguousTotal: mo.ambiguousTotal ?? m.ambiguousTotal ?? 493,
    remaining: mo.remaining ?? m.remaining ?? 493,
    approved: mo.approved ?? m.approved ?? 0,
    unresolved: mo.unresolved ?? m.unresolved ?? 0,
    excluded: mo.excluded ?? m.excluded ?? 0,
    mailboxCounts: mo.mailboxCounts ?? m.mailboxCounts ?? {},
    uiUrl: '/ambiguous-mail-enrichment-review.html',
    statusNote: 'Operatörsverktyg — inte dagligt mailverktyg ännu',
    rules: mo.rules || mail?.rules || [],
  };
}

function buildImportReviewDay1(importQueue) {
  const q = importQueue || {};
  return {
    total: q.total ?? 1497,
    status: q.status || 'WAITING_MANUAL_REVIEW',
    statusLabel: 'Manuell review krävs',
    rule: q.rule || 'Ingen auto-import · ingen ny kund vid osäker match',
    sources: q.sources || [],
    autoImport: false,
    newCustomerOnUncertainMatch: false,
  };
}

function buildDay1OperationsSnapshot(ctx) {
  const {
    journalPilot,
    journalLive,
    photo,
    photoOperator,
    mail,
    mailOperator,
    importQueue,
    identitySafety,
    cf,
    presentationGate,
    retryable = false,
  } = ctx;

  const day1JournalPilot = buildDay1JournalPilot({
    journalPilot,
    journalLive,
    presentationGate,
    retryable,
  });
  const photoReview = buildPhotoReviewDay1(photo, photoOperator);
  const mailReview = buildMailReviewDay1(mail, mailOperator);
  const importReview = buildImportReviewDay1(importQueue);

  const blockers = buildDay1Blockers({
    presentationGate: day1JournalPilot.presentationGate,
    journalE2E: day1JournalPilot.journalE2E,
    pilot1: day1JournalPilot.pilot1,
    pilot2: day1JournalPilot.pilot2,
    pilot3: day1JournalPilot.pilot3,
    journalLive,
    mailReview,
    photoReview,
    importReview,
  });

  const recommendedNextAction = buildRecommendedNextAction({
    presentationGate: day1JournalPilot.presentationGate,
    journalE2E: day1JournalPilot.journalE2E,
    demoLinks: day1JournalPilot.demoLinks,
    pilot1: day1JournalPilot.pilot1,
    pilot2: day1JournalPilot.pilot2,
    pilot3: day1JournalPilot.pilot3,
    journalLive,
    shift: day1JournalPilot,
    retryable,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'DAY_1_OPERATIONS',
    day1JournalPilot,
    photoReview,
    importReview,
    mailReview,
    identitySafety: identitySafety || null,
    cf: cf
      ? {
          operational: cf.operational,
          financeStatus: cf.financeStatus,
          reviewStatus: cf.reviewStatus,
          reportsStatus: cf.reportsStatus,
        }
      : null,
    blockers,
    recommendedNextAction,
    opsWorkbenchUrl: DAY1_LINKS.opsWorkbench,
  };
}

module.exports = {
  DAY1_LINKS,
  buildDay1OperationsSnapshot,
  buildRecommendedNextAction,
  buildDay1Blockers,
};
