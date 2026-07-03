'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TRACKS = ['photo', 'import', 'mail', 'drive_import'];

function defaultState() {
  return {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    photo: emptyTrack(),
    import: emptyTrack(),
    mail: emptyTrack(),
    drive_import: emptyTrack(),
  };
}

function emptyTrack() {
  return {
    decisionsUsed: 0,
    maxDecisions: 25,
    approved: 0,
    rejected: 0,
    reassigned: 0,
    manualResolved: 0,
    unresolved: 0,
    excluded: 0,
    needsOwnerSource: 0,
    newAssets: 0,
    customerIdMismatch: 0,
    storageKeyChanged: 0,
    wrongPatient: 0,
    lastDecisionAt: null,
  };
}

function resolveStatePath(projectRoot) {
  const root = projectRoot || path.join(__dirname, '../..');
  const stateRoot = process.env.ARCANA_STATE_ROOT || path.join(root, 'data');
  return path.join(stateRoot, 'cco-operator-canary-state.json');
}

function loadState(projectRoot) {
  const filePath = resolveStatePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { filePath, state: defaultState() };
  }
  try {
    const state = { ...defaultState(), ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
    for (const t of TRACKS) {
      state[t] = { ...emptyTrack(), ...(state[t] || {}) };
    }
    return { filePath, state };
  } catch {
    return { filePath, state: defaultState() };
  }
}

function saveState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function getTrackSummary(state, track, maxDecisions) {
  const t = state[track] || emptyTrack();
  const max = Number(maxDecisions) || t.maxDecisions || 25;
  const used = Number(t.decisionsUsed) || 0;
  return {
    ...t,
    maxDecisions: max,
    decisionsUsed: used,
    decisionsRemaining: Math.max(0, max - used),
    limitReached: used >= max,
  };
}

function assertCanaryAllows(track, { projectRoot, maxDecisions, enabled = true } = {}) {
  if (!enabled) {
    const e = new Error('canary_write_disabled');
    e.statusCode = 403;
    throw e;
  }
  if (!TRACKS.includes(track)) {
    const e = new Error('invalid_canary_track');
    e.statusCode = 400;
    throw e;
  }
  const { state } = loadState(projectRoot);
  const summary = getTrackSummary(state, track, maxDecisions);
  if (summary.limitReached) {
    const e = new Error('canary_decision_limit_reached');
    e.statusCode = 429;
    e.detail = { track, maxDecisions: summary.maxDecisions, used: summary.decisionsUsed };
    throw e;
  }
  return summary;
}

function assertCanaryAllowsCount(track, count, { projectRoot, maxDecisions, enabled = true } = {}) {
  const needed = Math.max(0, Number(count) || 0);
  const summary = assertCanaryAllows(track, { projectRoot, maxDecisions, enabled });
  if (needed > summary.decisionsRemaining) {
    const e = new Error('canary_batch_would_exceed_limit');
    e.statusCode = 429;
    e.detail = {
      track,
      requested: needed,
      decisionsRemaining: summary.decisionsRemaining,
      maxDecisions: summary.maxDecisions,
      used: summary.decisionsUsed,
    };
    throw e;
  }
  return summary;
}

function recordCanaryDecision(track, patch = {}, { projectRoot, maxDecisions } = {}) {
  const { filePath, state } = loadState(projectRoot);
  const t = state[track] || emptyTrack();
  const max = Number(maxDecisions) || t.maxDecisions || 25;
  t.decisionsUsed = (Number(t.decisionsUsed) || 0) + 1;
  t.maxDecisions = max;
  t.lastDecisionAt = new Date().toISOString();
  for (const key of [
    'approved',
    'rejected',
    'reassigned',
    'manualResolved',
    'unresolved',
    'excluded',
    'needsOwnerSource',
    'newAssets',
    'customerIdMismatch',
    'storageKeyChanged',
    'wrongPatient',
  ]) {
    if (patch[key] != null) t[key] = (Number(t[key]) || 0) + Number(patch[key]);
  }
  state[track] = t;
  saveState(filePath, state);
  return getTrackSummary(state, track, max);
}

function patientsAffectedFromAudit(auditLog, { action = 'photo_review.decision' } = {}) {
  const ids = new Set();
  if (!auditLog?.query) return [];
  const items = auditLog.query({ action, limit: 100000 }) || [];
  for (const entry of items) {
    const pid = entry.detail?.patientId;
    if (pid && pid !== 'unknown') ids.add(pid);
  }
  return [...ids];
}

function buildCanaryStatusPayload({
  config,
  projectRoot,
  photoProgress,
  importSummary,
  mailSummary,
}) {
  const { state, filePath } = loadState(projectRoot);
  const enabled = !!config?.enableCcoOperatorCanary;
  return {
    generatedAt: new Date().toISOString(),
    enabled,
    statePath: filePath,
    limits: {
      photo: config?.photoReviewCanaryMax ?? 25,
      import: config?.importReviewCanaryMax ?? 25,
      mail: config?.mailReviewCanaryMax ?? 25,
      drive_import: config?.driveImportReviewCanaryMax ?? 100,
    },
    photo: {
      writeEnabled: config?.enablePhotoReviewWrite === true,
      ...getTrackSummary(state, 'photo', config?.photoReviewCanaryMax),
      pendingPhotos: photoProgress?.pendingPhotos ?? null,
      visiblePhotos: photoProgress?.visiblePhotosAfterReview ?? null,
      decisionsFromAudit: photoProgress?.decisions ?? null,
    },
    import: {
      writeEnabled: config?.enableImportReviewWrite === true,
      ...getTrackSummary(state, 'import', config?.importReviewCanaryMax),
      queueTotal: importSummary?.total ?? null,
    },
    mail: {
      writeEnabled: config?.enableMailReviewCanary === true,
      ...getTrackSummary(state, 'mail', config?.mailReviewCanaryMax),
      remaining: mailSummary?.remaining ?? mailSummary?.remainingAmbiguous ?? null,
    },
    rules: {
      noAutoApprove: true,
      noMassApproval: true,
      noAiAutoApproval: true,
      noNewCustomerOnUncertainMatch: true,
      noGraphFetchFromUi: true,
      noFuzzyMerge: true,
      oneDecisionPerAsset: true,
    },
    cycle: 'controlled-completion-canaries',
  };
}

function recordCanarySafetyViolation(track, kind, { projectRoot, maxDecisions } = {}) {
  const patch =
    kind === 'storageKeyChanged'
      ? { storageKeyChanged: 1 }
      : kind === 'wrongPatient'
        ? { wrongPatient: 1 }
        : kind === 'customerIdMismatch'
          ? { customerIdMismatch: 1 }
          : {};
  return recordCanaryDecision(track, patch, { projectRoot, maxDecisions });
}

module.exports = {
  TRACKS,
  loadState,
  assertCanaryAllows,
  assertCanaryAllowsCount,
  recordCanaryDecision,
  recordCanarySafetyViolation,
  getTrackSummary,
  buildCanaryStatusPayload,
  patientsAffectedFromAudit,
  resolveStatePath,
};
