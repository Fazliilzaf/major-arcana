// CCO Retention Policy — 10-årig gallringspolicy (patientdatalagen / GDPR art. 5).
// Default-export helper: readoutForCustomer(), enforceRetention (express-middleware),
// och konstanten RETENTION_YEARS. Inga sidoeffekter / ingen persistens.

const RETENTION_YEARS = 10;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

// Beräknar gallringsstatus för en kund utifrån senaste aktivitet, lås och öppna ärenden.
function readoutForCustomer({ lastActivityAt = null, isLocked = false, hasOpenCase = false } = {}) {
  const last = parseDate(lastActivityAt);
  const now = new Date();
  const reasons = [];

  let retentionUntilIso = null;
  let retentionPassed = false;
  if (last) {
    const until = addYears(last, RETENTION_YEARS);
    retentionUntilIso = until.toISOString();
    retentionPassed = now.getTime() >= until.getTime();
    if (!retentionPassed) reasons.push(`retention_active_until_${retentionUntilIso}`);
  } else {
    reasons.push('no_last_activity');
  }

  if (isLocked) reasons.push('record_locked');
  if (hasOpenCase) reasons.push('open_case');

  const eligibleForDeletion = retentionPassed && !isLocked && !hasOpenCase;

  let yearsRemaining = null;
  if (last && !retentionPassed) {
    const ms = addYears(last, RETENTION_YEARS).getTime() - now.getTime();
    yearsRemaining = Math.max(0, Math.round((ms / (365.25 * 24 * 3600 * 1000)) * 10) / 10);
  } else if (retentionPassed) {
    yearsRemaining = 0;
  }

  return {
    eligibleForDeletion,
    retentionPassed,
    retentionUntil: retentionUntilIso,
    yearsRemaining,
    isLocked: Boolean(isLocked),
    hasOpenCase: Boolean(hasOpenCase),
    reasons,
  };
}

// Express-middleware: blockerar radering om 10-årsretention inte passerats.
function enforceRetention(req, res, next) {
  const readout = readoutForCustomer({
    lastActivityAt: req.query?.lastActivityAt || req.body?.lastActivityAt || null,
    isLocked: req.query?.locked === 'true' || req.body?.isLocked === true,
    hasOpenCase: req.query?.openCase === 'true' || req.body?.hasOpenCase === true,
  });
  if (!readout.eligibleForDeletion) {
    return res.status(403).json({
      error: 'Radering blockerad av gallringspolicy.',
      retentionYears: RETENTION_YEARS,
      ...readout,
    });
  }
  return next();
}

module.exports = {
  RETENTION_YEARS,
  readoutForCustomer,
  enforceRetention,
};
