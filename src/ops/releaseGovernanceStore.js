const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inspectPentestEvidence } = require('./pentestEvidence');

const SIGNOFF_ROLES = Object.freeze(['owner', 'risk_owner', 'ops_owner']);
const REVIEW_STATUSES = new Set(['ok', 'risk', 'incident']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function addDays(isoTs, days) {
  const source = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(source)) return null;
  const result = source + Math.max(1, Number(days) || 1) * 24 * 60 * 60 * 1000;
  return new Date(result).toISOString();
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    cycles: [],
  };
}

function normalizeSignoff(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    role: normalizeText(source.role).toLowerCase() || null,
    userId: normalizeText(source.userId) || null,
    membershipRole: normalizeText(source.membershipRole).toUpperCase() || null,
    approvedAt: toIso(source.approvedAt),
    note: normalizeText(source.note),
  };
}

function normalizeReview(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const status = normalizeText(source.status).toLowerCase();
  return {
    id: normalizeText(source.id) || `rr_${crypto.randomUUID()}`,
    ts: toIso(source.ts) || nowIso(),
    reviewerUserId: normalizeText(source.reviewerUserId) || null,
    status: REVIEW_STATUSES.has(status) ? status : 'ok',
    note: normalizeText(source.note),
    openIncidents: clamp(source.openIncidents, 0, 1_000_000, 0),
    breachedIncidents: clamp(source.breachedIncidents, 0, 1_000_000, 0),
    triggeredNoGoCount: clamp(source.triggeredNoGoCount, 0, 1_000_000, 0),
  };
}

function normalizeCycle(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const status = normalizeText(source.status).toLowerCase();
  const normalizedStatus = ['planning', 'launch_ready', 'launched', 'halted'].includes(status)
    ? status
    : 'planning';

  const signoffsSource = source.signoffs && typeof source.signoffs === 'object' ? source.signoffs : {};
  const signoffs = {};
  for (const role of SIGNOFF_ROLES) {
    const normalized = normalizeSignoff(signoffsSource[role]);
    signoffs[role] = {
      role,
      userId: normalized.userId,
      membershipRole: normalized.membershipRole,
      approvedAt: normalized.approvedAt,
      note: normalized.note,
    };
  }

  const gateEvidence = source.gateEvidence && typeof source.gateEvidence === 'object'
    ? source.gateEvidence
    : {};
  const readiness = gateEvidence.readiness && typeof gateEvidence.readiness === 'object'
    ? gateEvidence.readiness
    : {};
  const strict = gateEvidence.strict && typeof gateEvidence.strict === 'object'
    ? gateEvidence.strict
    : {};
  const requiredChecks = gateEvidence.requiredChecks && typeof gateEvidence.requiredChecks === 'object'
    ? gateEvidence.requiredChecks
    : {};
  const noGoWindow = gateEvidence.noGoWindow && typeof gateEvidence.noGoWindow === 'object'
    ? gateEvidence.noGoWindow
    : {};
  const pentest = gateEvidence.pentest && typeof gateEvidence.pentest === 'object'
    ? gateEvidence.pentest
    : {};

  const launch = source.launch && typeof source.launch === 'object' ? source.launch : {};
  const governance = source.governance && typeof source.governance === 'object' ? source.governance : {};

  return {
    id: normalizeText(source.id) || `rel_${crypto.randomUUID()}`,
    tenantId: normalizeText(source.tenantId),
    status: normalizedStatus,
    createdAt: toIso(source.createdAt) || nowIso(),
    updatedAt: toIso(source.updatedAt) || nowIso(),
    createdBy: normalizeText(source.createdBy) || null,
    targetEnvironment: normalizeText(source.targetEnvironment) || 'production',
    rolloutStrategy: normalizeText(source.rolloutStrategy) || 'tenant_batch',
    note: normalizeText(source.note),
    signoffs,
    gateEvidence: {
      capturedAt: toIso(gateEvidence.capturedAt),
      source: normalizeText(gateEvidence.source) || null,
      notes: normalizeText(gateEvidence.notes),
      readiness: {
        score: clamp(readiness.score, 0, 100, 0),
        band: normalizeText(readiness.band) || null,
        goAllowed: readiness.goAllowed === true,
        blockerChecksCount: clamp(readiness.blockerChecksCount, 0, 1_000_000, 0),
        triggeredNoGoCount: clamp(readiness.triggeredNoGoCount, 0, 1_000_000, 0),
        triggeredNoGoIds: Array.isArray(readiness.triggeredNoGoIds)
          ? readiness.triggeredNoGoIds
              .map((item) => normalizeText(item))
              .filter(Boolean)
              .slice(0, 50)
          : [],
      },
      strict: {
        passed: strict.passed === true,
        failuresCount: clamp(strict.failuresCount, 0, 1_000_000, 0),
        failures: Array.isArray(strict.failures)
          ? strict.failures.map((item) => normalizeText(item)).filter(Boolean).slice(0, 50)
          : [],
      },
      requiredChecks: {
        noP0P1Blockers: requiredChecks.noP0P1Blockers === true,
        patientSafetyApproved: requiredChecks.patientSafetyApproved === true,
        restoreDrillsVerified: requiredChecks.restoreDrillsVerified === true,
        governanceRunbooksReady: requiredChecks.governanceRunbooksReady === true,
      },
      noGoWindow: {
        days: clamp(noGoWindow.days, 0, 3650, 0),
        evidenceCount: clamp(noGoWindow.evidenceCount, 0, 1_000_000, 0),
        clean: noGoWindow.clean === true,
      },
      pentest: {
        path: normalizeText(pentest.path) || null,
        exists: pentest.exists === true,
        updatedAt: toIso(pentest.updatedAt),
        ageDays: Number.isFinite(Number(pentest.ageDays)) ? Number(pentest.ageDays) : null,
        sizeBytes: clamp(pentest.sizeBytes, 0, 1_000_000_000, 0),
        sha256: normalizeText(pentest.sha256) || null,
        contentValid: pentest.contentValid !== false,
        contentIssues: Array.isArray(pentest.contentIssues)
          ? pentest.contentIssues.map((item) => normalizeText(item)).filter(Boolean).slice(0, 20)
          : [],
      },
    },
    launch: {
      launchedAt: toIso(launch.launchedAt),
      launchedBy: normalizeText(launch.launchedBy) || null,
      strategy: normalizeText(launch.strategy) || null,
      batchLabel: normalizeText(launch.batchLabel) || null,
      rollbackPlan: normalizeText(launch.rollbackPlan),
    },
    postLaunchReviews: (Array.isArray(source.postLaunchReviews) ? source.postLaunchReviews : [])
      .map((item) => normalizeReview(item))
      .sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || ''))),
    governance: {
      lastRealityAuditAt: toIso(governance.lastRealityAuditAt),
      lastRealityAuditBy: normalizeText(governance.lastRealityAuditBy) || null,
      nextRealityAuditDueAt: toIso(governance.nextRealityAuditDueAt),
      changeGovernanceVersion: normalizeText(governance.changeGovernanceVersion) || null,
      note: normalizeText(governance.note),
      finalLiveSignoffAt: toIso(governance.finalLiveSignoffAt),
      finalLiveSignoffBy: normalizeText(governance.finalLiveSignoffBy) || null,
      finalLiveSignoffNote: normalizeText(governance.finalLiveSignoffNote),
    },
  };
}

function normalizeCycles(value = []) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => normalizeCycle(item))
    .filter((item) => normalizeText(item.tenantId))
    .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')));
}

function toSafeCycle(cycle) {
  return {
    id: cycle.id,
    tenantId: cycle.tenantId,
    status: cycle.status,
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
    createdBy: cycle.createdBy,
    targetEnvironment: cycle.targetEnvironment,
    rolloutStrategy: cycle.rolloutStrategy,
    note: cycle.note,
    signoffs: cycle.signoffs,
    gateEvidence: cycle.gateEvidence,
    launch: cycle.launch,
    postLaunchReviews: cycle.postLaunchReviews,
    governance: cycle.governance,
  };
}

function evaluateCycleInternal(cycle, options = {}) {
  if (!cycle) return null;
  const nowMs = Number(options.nowMs || Date.now());
  const requiredNoGoFreeDays = Math.max(1, Number(options.requiredNoGoFreeDays || 14));
  const requirePentestEvidence = options.requirePentestEvidence === true;
  const pentestMaxAgeDays = Math.max(1, Number(options.pentestMaxAgeDays || 120));
  const postLaunchReviewWindowDays = Math.max(1, Number(options.postLaunchReviewWindowDays || 30));
  const postLaunchStabilizationDays = Math.max(
    1,
    Number(options.postLaunchStabilizationDays || requiredNoGoFreeDays || 14)
  );
  const enforcePostLaunchStabilization = options.enforcePostLaunchStabilization === true;
  const requireDistinctSignoffUsers = options.requireDistinctSignoffUsers !== false;
  const realityAuditIntervalDays = Math.max(30, Number(options.realityAuditIntervalDays || 90));
  const requireFinalLiveSignoff = options.requireFinalLiveSignoff === true;

  const signoffEntries = SIGNOFF_ROLES.map((role) => ({
    role,
    ...(cycle.signoffs[role] || {
      userId: null,
      approvedAt: null,
      note: '',
      membershipRole: null,
    }),
  }));
  const signoffComplete = signoffEntries.every((entry) => Boolean(entry.approvedAt && entry.userId));
  const uniqueUsers = new Set(signoffEntries.map((entry) => entry.userId).filter(Boolean));
  const distinctUsersOk = !requireDistinctSignoffUsers
    ? true
    : !signoffComplete
      ? false
      : uniqueUsers.size === SIGNOFF_ROLES.length;

  const gateEvidence = cycle.gateEvidence || {};
  const readiness = gateEvidence.readiness || {};
  const strict = gateEvidence.strict || {};
  const requiredChecks = gateEvidence.requiredChecks || {};
  const noGoWindow = gateEvidence.noGoWindow || {};
  const pentest = gateEvidence.pentest || {};

  const readinessOk = readiness.goAllowed === true;
  const strictOk = strict.passed === true && Number(strict.failuresCount || 0) === 0;
  const checksOk =
    requiredChecks.noP0P1Blockers === true &&
    requiredChecks.patientSafetyApproved === true &&
    requiredChecks.restoreDrillsVerified === true &&
    requiredChecks.governanceRunbooksReady === true;
  const noGoWindowOk =
    noGoWindow.clean === true &&
    Number(noGoWindow.days || 0) >= requiredNoGoFreeDays &&
    Number(noGoWindow.evidenceCount || 0) >= 1;
  const pentestAgeDays = Number(pentest.ageDays);
  const pentestOk = !requirePentestEvidence
    ? true
    : pentest.exists === true &&
      Number.isFinite(pentestAgeDays) &&
      pentestAgeDays <= pentestMaxAgeDays &&
      pentest.contentValid === true;

  const releaseGatePassed =
    readinessOk && strictOk && checksOk && noGoWindowOk && pentestOk;

  let postLaunchReview = {
    expectedReviews: 0,
    actualReviews: 0,
    coveragePercent: 100,
    healthy: true,
  };
  let postLaunchStabilization = {
    requiredDays: postLaunchStabilizationDays,
    daysSinceLaunch: 0,
    daysObserved: 0,
    expectedReviews: 0,
    actualReviews: 0,
    coveragePercent: 100,
    hasNoGoTrigger: false,
    completed: true,
    healthy: true,
    enforced: enforcePostLaunchStabilization,
  };

  if (cycle.status === 'launched' && cycle.launch?.launchedAt) {
    const launchTs = Date.parse(String(cycle.launch.launchedAt || ''));
    if (Number.isFinite(launchTs)) {
      const daysSinceLaunch = Math.max(
        0,
        Math.ceil((nowMs - launchTs) / (24 * 60 * 60 * 1000))
      );
      const expectedReviews = Math.min(postLaunchReviewWindowDays, daysSinceLaunch);
      const reviewsSinceLaunch = (Array.isArray(cycle.postLaunchReviews)
        ? cycle.postLaunchReviews
        : []
      ).filter((item) => {
        const ts = Date.parse(String(item?.ts || ''));
        return Number.isFinite(ts) && ts >= launchTs && ts <= nowMs;
      });
      const actualReviews = reviewsSinceLaunch.length;
      const coveragePercent = expectedReviews <= 0
        ? 100
        : Number(((actualReviews / expectedReviews) * 100).toFixed(2));
      postLaunchReview = {
        expectedReviews,
        actualReviews,
        coveragePercent,
        healthy: expectedReviews <= 0 ? true : actualReviews >= expectedReviews,
      };

      const stabilizationWindowEndMs = Math.min(
        nowMs,
        launchTs + postLaunchStabilizationDays * 24 * 60 * 60 * 1000
      );
      const daysObserved = Math.max(
        0,
        Math.ceil((stabilizationWindowEndMs - launchTs) / (24 * 60 * 60 * 1000))
      );
      const stabilizationReviews = reviewsSinceLaunch.filter((item) => {
        const ts = Date.parse(String(item?.ts || ''));
        return Number.isFinite(ts) && ts >= launchTs && ts <= stabilizationWindowEndMs;
      });
      const stabilizationExpectedReviews = Math.min(postLaunchStabilizationDays, daysObserved);
      const stabilizationActualReviews = stabilizationReviews.length;
      const stabilizationCoveragePercent =
        stabilizationExpectedReviews <= 0
          ? 100
          : Number(
              ((stabilizationActualReviews / stabilizationExpectedReviews) * 100).toFixed(2)
            );
      const hasNoGoTrigger = stabilizationReviews.some((item) => {
        const status = normalizeText(item?.status).toLowerCase();
        return status === 'incident' || Number(item?.triggeredNoGoCount || 0) > 0;
      });
      const stabilizationCompleted = daysSinceLaunch >= postLaunchStabilizationDays;
      const stabilizationHealthy =
        stabilizationCompleted &&
        stabilizationActualReviews >= postLaunchStabilizationDays &&
        !hasNoGoTrigger;
      postLaunchStabilization = {
        requiredDays: postLaunchStabilizationDays,
        daysSinceLaunch,
        daysObserved,
        expectedReviews: stabilizationExpectedReviews,
        actualReviews: stabilizationActualReviews,
        coveragePercent: stabilizationCoveragePercent,
        hasNoGoTrigger,
        completed: stabilizationCompleted,
        healthy: stabilizationHealthy,
        enforced: enforcePostLaunchStabilization,
      };
    }
  }

  const lastRealityAuditAt = cycle.governance?.lastRealityAuditAt
    ? toIso(cycle.governance.lastRealityAuditAt)
    : null;
  const launchTsIso = cycle.launch?.launchedAt ? toIso(cycle.launch.launchedAt) : null;
  const realityAuditBaseTs = lastRealityAuditAt || launchTsIso || null;
  const dueAt =
    toIso(cycle.governance?.nextRealityAuditDueAt) ||
    (realityAuditBaseTs ? addDays(realityAuditBaseTs, realityAuditIntervalDays) : null);
  const realityAuditHealthy = !dueAt ? true : nowMs <= Date.parse(String(dueAt || ''));
  const finalLiveSignoffAt = toIso(cycle.governance?.finalLiveSignoffAt);
  const finalLiveSignoffBy = normalizeText(cycle.governance?.finalLiveSignoffBy) || null;
  const finalLiveSignoffLocked = Boolean(finalLiveSignoffAt && finalLiveSignoffBy);

  const blockers = [];
  if (!signoffComplete) blockers.push({ id: 'signoff_missing', reason: 'Saknar sign-off roller.' });
  if (!distinctUsersOk) blockers.push({ id: 'signoff_distinct_users', reason: 'Sign-off kräver tre olika användare.' });
  if (!readinessOk) blockers.push({ id: 'readiness_gate_failed', reason: 'Readiness go/no-go är inte godkänd.' });
  if (!strictOk) blockers.push({ id: 'strict_ops_failed', reason: 'Ops strict-gate innehåller failures.' });
  if (!checksOk) blockers.push({ id: 'required_checks_failed', reason: 'En eller flera release-required checks är ej godkända.' });
  if (!noGoWindowOk) blockers.push({ id: 'no_go_window_failed', reason: 'No-go window evidence uppfyller inte krav.' });
  if (!pentestOk) {
    blockers.push({
      id: 'pentest_evidence_missing',
      reason: 'Extern pentest evidence saknas, är för gammal eller innehåller placeholders.',
    });
  }
  if (!postLaunchReview.healthy) blockers.push({ id: 'post_launch_reviews_missing', reason: 'Dagliga post-go-live reviews saknas.' });
  if (enforcePostLaunchStabilization && !postLaunchStabilization.completed) {
    blockers.push({
      id: 'post_launch_stabilization_incomplete',
      reason: `Post-launch stabiliseringsfönster (${postLaunchStabilizationDays} dagar) är inte komplett.`,
    });
  }
  if (
    enforcePostLaunchStabilization &&
    postLaunchStabilization.completed &&
    postLaunchStabilization.actualReviews < postLaunchStabilization.requiredDays
  ) {
    blockers.push({
      id: 'post_launch_reviews_insufficient',
      reason: `Post-launch review-täckning är otillräcklig (${postLaunchStabilization.actualReviews}/${postLaunchStabilization.requiredDays}).`,
    });
  }
  if (enforcePostLaunchStabilization && postLaunchStabilization.hasNoGoTrigger) {
    blockers.push({
      id: 'post_launch_no_go_triggered',
      reason: 'Post-launch no-go trigger eller incident upptäcktes under stabiliseringsfönstret.',
    });
  }
  if (!realityAuditHealthy) blockers.push({ id: 'quarterly_reality_audit_overdue', reason: 'Reality audit är försenad.' });
  if (requireFinalLiveSignoff && !finalLiveSignoffLocked) {
    blockers.push({
      id: 'final_live_signoff_missing',
      reason: 'Formell final live sign-off saknas.',
    });
  }

  return {
    evaluatedAt: new Date(nowMs).toISOString(),
    releaseGatePassed,
    signoffComplete,
    distinctUsersOk,
    readinessOk,
    strictOk,
    checksOk,
    noGoWindowOk,
    pentestOk,
    postLaunchReview,
    postLaunchStabilization,
    realityAudit: {
      healthy: realityAuditHealthy,
      dueAt,
      lastRealityAuditAt,
      intervalDays: realityAuditIntervalDays,
    },
    finalLiveSignoff: {
      locked: finalLiveSignoffLocked,
      lockedAt: finalLiveSignoffAt,
      lockedBy: finalLiveSignoffBy,
      note: normalizeText(cycle.governance?.finalLiveSignoffNote),
    },
    blockers,
  };
}

async function buildPentestEvidence(rawPath = '') {
  const evidence = await inspectPentestEvidence(rawPath, {
    maxAgeDays: 36500,
    requireSignedReference: true,
  });
  return {
    path: evidence.path,
    exists: evidence.exists === true,
    updatedAt: evidence.updatedAt || null,
    ageDays: Number.isFinite(Number(evidence.ageDays)) ? Number(evidence.ageDays) : null,
    sizeBytes: Number.isFinite(Number(evidence.sizeBytes)) ? Number(evidence.sizeBytes) : 0,
    sha256: normalizeText(evidence.sha256) || null,
    contentValid: evidence.contentValid === true,
    contentIssues: Array.isArray(evidence.contentIssues)
      ? evidence.contentIssues.map((item) => normalizeText(item)).filter(Boolean).slice(0, 20)
      : [],
  };
}

async function createReleaseGovernanceStore({
  filePath,
  maxCycles = 400,
} = {}) {
  if (!filePath) throw new Error('releaseGovernanceStore filePath saknas.');
  const safeMaxCycles = clamp(parsePositiveInt(maxCycles, 400), 50, 5000, 400);

  let state = emptyState();
  let operationChain = Promise.resolve();

  async function load() {
    const existing = await readJson(filePath, null);
    if (!existing || typeof existing !== 'object') {
      state = emptyState();
      return;
    }
    state = {
      version: 1,
      createdAt: toIso(existing.createdAt) || nowIso(),
      updatedAt: toIso(existing.updatedAt) || nowIso(),
      cycles: normalizeCycles(existing.cycles),
    };
    if (state.cycles.length > safeMaxCycles) {
      state.cycles = state.cycles.slice(state.cycles.length - safeMaxCycles);
    }
  }

  async function persist() {
    state.updatedAt = nowIso();
    if (state.cycles.length > safeMaxCycles) {
      state.cycles = state.cycles.slice(state.cycles.length - safeMaxCycles);
    }
    await writeJsonAtomic(filePath, state);
  }

  function withLock(task) {
    const run = operationChain.then(task, task);
    operationChain = run.catch(() => {});
    return run;
  }

  function listForTenant(tenantId) {
    const normalizedTenant = normalizeText(tenantId);
    if (!normalizedTenant) return [];
    return state.cycles
      .filter((item) => item.tenantId === normalizedTenant)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function getCycleById(tenantId, cycleId) {
    const normalizedTenant = normalizeText(tenantId);
    const normalizedCycleId = normalizeText(cycleId);
    if (!normalizedTenant || !normalizedCycleId) return null;
    return (
      state.cycles.find(
        (item) => item.tenantId === normalizedTenant && item.id === normalizedCycleId
      ) || null
    );
  }

  function markCycleUpdated(cycle) {
    cycle.updatedAt = nowIso();
  }

  async function startCycle({
    tenantId,
    actorUserId = null,
    targetEnvironment = 'production',
    rolloutStrategy = 'tenant_batch',
    note = '',
  } = {}) {
    return withLock(async () => {
      const normalizedTenant = normalizeText(tenantId);
      if (!normalizedTenant) throw new Error('tenantId saknas för release cycle.');

      const cycle = normalizeCycle({
        id: `rel_${crypto.randomUUID()}`,
        tenantId: normalizedTenant,
        status: 'planning',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: normalizeText(actorUserId) || null,
        targetEnvironment: normalizeText(targetEnvironment) || 'production',
        rolloutStrategy: normalizeText(rolloutStrategy) || 'tenant_batch',
        note,
        governance: {
          nextRealityAuditDueAt: null,
          lastRealityAuditAt: null,
          lastRealityAuditBy: null,
          changeGovernanceVersion: null,
          note: '',
          finalLiveSignoffAt: null,
          finalLiveSignoffBy: null,
          finalLiveSignoffNote: '',
        },
      });

      state.cycles.push(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function listCycles({ tenantId, limit = 20 } = {}) {
    const safeLimit = clamp(parsePositiveInt(limit, 20), 1, 500, 20);
    const cycles = listForTenant(tenantId).slice(0, safeLimit).map((item) => toSafeCycle(item));
    return {
      count: cycles.length,
      cycles,
    };
  }

  async function getLatestCycle({ tenantId } = {}) {
    const latest = listForTenant(tenantId)[0] || null;
    return latest ? toSafeCycle(latest) : null;
  }

  async function recordGateEvidence({
    tenantId,
    cycleId,
    source = 'manual',
    readiness = {},
    strict = {},
    requiredChecks = {},
    noGoWindow = {},
    pentestEvidencePath = '',
    notes = '',
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');

      const pentestEvidence = await buildPentestEvidence(pentestEvidencePath);
      cycle.gateEvidence = normalizeCycle({
        ...cycle,
        gateEvidence: {
          capturedAt: nowIso(),
          source: normalizeText(source) || 'manual',
          notes,
          readiness,
          strict,
          requiredChecks,
          noGoWindow,
          pentest: pentestEvidence,
        },
      }).gateEvidence;

      if (cycle.status !== 'launched' && cycle.status !== 'halted') {
        cycle.status = 'planning';
      }
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function recordSignoff({
    tenantId,
    cycleId,
    signoffRole,
    actorUserId,
    actorMembershipRole = '',
    note = '',
    requireDistinctUsers = true,
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');
      const role = normalizeText(signoffRole).toLowerCase();
      if (!SIGNOFF_ROLES.includes(role)) {
        throw new Error('Ogiltig signoffRole. Tillåtna värden: owner, risk_owner, ops_owner.');
      }
      const userId = normalizeText(actorUserId);
      if (!userId) throw new Error('actorUserId saknas för sign-off.');

      if (requireDistinctUsers) {
        for (const requiredRole of SIGNOFF_ROLES) {
          if (requiredRole === role) continue;
          const existing = cycle.signoffs?.[requiredRole];
          if (existing?.approvedAt && existing?.userId && existing.userId === userId) {
            throw new Error('Sign-off kräver tre olika användare.');
          }
        }
      }

      cycle.signoffs[role] = {
        role,
        userId,
        membershipRole: normalizeText(actorMembershipRole).toUpperCase() || null,
        approvedAt: nowIso(),
        note: normalizeText(note),
      };
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function recordLaunch({
    tenantId,
    cycleId,
    actorUserId,
    strategy = 'tenant_batch',
    batchLabel = '',
    rollbackPlan = '',
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');
      const userId = normalizeText(actorUserId);
      if (!userId) throw new Error('actorUserId saknas för launch.');

      cycle.launch = {
        launchedAt: nowIso(),
        launchedBy: userId,
        strategy: normalizeText(strategy) || 'tenant_batch',
        batchLabel: normalizeText(batchLabel) || null,
        rollbackPlan: normalizeText(rollbackPlan),
      };
      cycle.status = 'launched';
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function addPostLaunchReview({
    tenantId,
    cycleId,
    reviewerUserId,
    status = 'ok',
    note = '',
    openIncidents = 0,
    breachedIncidents = 0,
    triggeredNoGoCount = 0,
    ts = null,
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');

      const review = normalizeReview({
        reviewerUserId: normalizeText(reviewerUserId) || null,
        status,
        note,
        openIncidents,
        breachedIncidents,
        triggeredNoGoCount,
        ts: toIso(ts) || nowIso(),
      });

      cycle.postLaunchReviews.push(review);
      if (cycle.postLaunchReviews.length > 120) {
        cycle.postLaunchReviews = cycle.postLaunchReviews.slice(
          cycle.postLaunchReviews.length - 120
        );
      }
      markCycleUpdated(cycle);
      await persist();
      return {
        cycle: toSafeCycle(cycle),
        review,
      };
    });
  }

  async function recordRealityAudit({
    tenantId,
    cycleId,
    actorUserId,
    changeGovernanceVersion = '',
    note = '',
    intervalDays = 90,
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');
      const auditTs = nowIso();
      cycle.governance = {
        ...cycle.governance,
        lastRealityAuditAt: auditTs,
        lastRealityAuditBy: normalizeText(actorUserId) || null,
        nextRealityAuditDueAt: addDays(auditTs, Math.max(30, Number(intervalDays) || 90)),
        changeGovernanceVersion:
          normalizeText(changeGovernanceVersion) ||
          cycle.governance?.changeGovernanceVersion ||
          null,
        note: normalizeText(note),
      };
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function recordFinalLiveSignoff({
    tenantId,
    cycleId,
    actorUserId,
    note = '',
    force = false,
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');
      const userId = normalizeText(actorUserId);
      if (!userId) throw new Error('actorUserId saknas för final live sign-off.');
      if (cycle.status !== 'launched') {
        throw new Error('Final live sign-off kräver launchad cycle.');
      }

      const existingAt = toIso(cycle.governance?.finalLiveSignoffAt);
      const existingBy = normalizeText(cycle.governance?.finalLiveSignoffBy || '');
      if (existingAt && existingBy && force !== true) {
        return toSafeCycle(cycle);
      }

      cycle.governance = {
        ...cycle.governance,
        finalLiveSignoffAt: nowIso(),
        finalLiveSignoffBy: userId,
        finalLiveSignoffNote: normalizeText(note),
      };
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function setCycleStatus({
    tenantId,
    cycleId,
    status,
  } = {}) {
    return withLock(async () => {
      const cycle = getCycleById(tenantId, cycleId);
      if (!cycle) throw new Error('Release cycle hittades inte.');
      const normalizedStatus = normalizeText(status).toLowerCase();
      if (!['planning', 'launch_ready', 'launched', 'halted'].includes(normalizedStatus)) {
        throw new Error('Ogiltig cycle status.');
      }
      cycle.status = normalizedStatus;
      markCycleUpdated(cycle);
      await persist();
      return toSafeCycle(cycle);
    });
  }

  async function evaluateCycle({
    tenantId,
    cycleId = '',
    requiredNoGoFreeDays = 14,
    requirePentestEvidence = false,
    pentestMaxAgeDays = 120,
    postLaunchReviewWindowDays = 30,
    postLaunchStabilizationDays = 14,
    enforcePostLaunchStabilization = false,
    requireDistinctSignoffUsers = true,
    realityAuditIntervalDays = 90,
    requireFinalLiveSignoff = false,
  } = {}) {
    const cycle = cycleId
      ? getCycleById(tenantId, cycleId)
      : listForTenant(tenantId)[0] || null;
    if (!cycle) {
      return {
        cycle: null,
        evaluation: null,
      };
    }
    const evaluation = evaluateCycleInternal(cycle, {
      requiredNoGoFreeDays,
      requirePentestEvidence,
      pentestMaxAgeDays,
      postLaunchReviewWindowDays,
      postLaunchStabilizationDays,
      enforcePostLaunchStabilization,
      requireDistinctSignoffUsers,
      realityAuditIntervalDays,
      requireFinalLiveSignoff,
    });
    return {
      cycle: toSafeCycle(cycle),
      evaluation,
    };
  }

  await load();

  return {
    startCycle,
    listCycles,
    getLatestCycle,
    recordGateEvidence,
    recordSignoff,
    recordLaunch,
    addPostLaunchReview,
    recordRealityAudit,
    recordFinalLiveSignoff,
    setCycleStatus,
    evaluateCycle,
  };
}

module.exports = {
  SIGNOFF_ROLES,
  createReleaseGovernanceStore,
};
